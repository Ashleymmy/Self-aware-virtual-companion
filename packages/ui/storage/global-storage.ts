import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type StorageComponentState = "online" | "degraded" | "offline" | "disabled";

export type StorageComponentStatus = {
  name: string;
  engine: string;
  configured: boolean;
  state: StorageComponentState;
  message: string;
  latencyMs: number | null;
};

export type StorageRuntimeLog = {
  id: number;
  level: string;
  subsystem: string;
  message: string;
  context: Record<string, unknown>;
  createdAt: string;
};

export type StorageStatusSnapshot = {
  ok: boolean;
  generatedAt: string;
  mode: {
    primary: "sqlite" | "memory";
    cache: "redis" | "memory";
    backup: "yaml";
  };
  components: {
    sqlite: StorageComponentStatus;
    cache: StorageComponentStatus;
    mysql: StorageComponentStatus;
    yaml: StorageComponentStatus;
  };
  metrics: {
    runtimeLogCount: number;
    kvCount: number;
    cacheEntries: number;
  };
  paths: {
    sqlite: string;
    yamlBackup: string;
  };
};

type RedisClientLike = {
  isOpen?: boolean;
  connect?: () => Promise<void>;
  ping?: () => Promise<string>;
  get?: (key: string) => Promise<string | null>;
  set?: (key: string, value: string, options?: Record<string, unknown>) => Promise<unknown>;
  quit?: () => Promise<void>;
  disconnect?: () => void;
};

type MemoryCacheEntry = {
  value: string;
  expiresAt: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function normalizeErr(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function parseMySqlDsn(dsn: string): { host: string; port: number; database: string } | null {
  try {
    const parsed = new URL(dsn);
    const host = parsed.hostname || "";
    if (!host) return null;
    const port = parsed.port ? Number.parseInt(parsed.port, 10) : 3306;
    const db = parsed.pathname.replace(/^\//, "");
    return {
      host,
      port: Number.isFinite(port) ? port : 3306,
      database: db,
    };
  } catch {
    return null;
  }
}

async function probeTcp(host: string, port: number, timeoutMs: number): Promise<{ ok: boolean; latencyMs: number | null; error?: string }> {
  const startedAt = Date.now();
  return await new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (payload: { ok: boolean; latencyMs: number | null; error?: string }) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        // no-op
      }
      resolve(payload);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      done({ ok: true, latencyMs: Date.now() - startedAt });
    });
    socket.once("timeout", () => {
      done({ ok: false, latencyMs: null, error: "timeout" });
    });
    socket.once("error", (error) => {
      done({ ok: false, latencyMs: null, error: normalizeErr(error) });
    });
    socket.connect(port, host);
  });
}

function yamlScalar(value: unknown): string {
  if (value == null) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const text = String(value);
  if (/^[a-zA-Z0-9._/-]+$/.test(text)) return text;
  return JSON.stringify(text);
}

function yamlDump(value: unknown, indent = 0): string {
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return `${pad}[]`;
    return value
      .map((item) => {
        if (item && typeof item === "object") {
          const body = yamlDump(item, indent + 2);
          return `${pad}-\n${body}`;
        }
        return `${pad}- ${yamlScalar(item)}`;
      })
      .join("\n");
  }

  if (value && typeof value === "object") {
    const rows = Object.entries(value as Record<string, unknown>);
    if (!rows.length) return `${pad}{}`;
    return rows
      .map(([key, item]) => {
        if (item && typeof item === "object") {
          return `${pad}${key}:\n${yamlDump(item, indent + 2)}`;
        }
        return `${pad}${key}: ${yamlScalar(item)}`;
      })
      .join("\n");
  }

  return `${pad}${yamlScalar(value)}`;
}

export class SavcGlobalStorageService {
  private readonly storageDir: string;
  private readonly sqlitePath: string;
  private readonly yamlBackupPath: string;
  private readonly redisUrl: string;
  private readonly mysqlDsn: string;
  private db: DatabaseSync | null = null;
  private sqliteState: StorageComponentStatus = {
    name: "sqlite",
    engine: "node:sqlite",
    configured: true,
    state: "offline",
    message: "not initialized",
    latencyMs: null,
  };
  private cacheState: StorageComponentStatus = {
    name: "cache",
    engine: "memory",
    configured: true,
    state: "online",
    message: "memory cache",
    latencyMs: null,
  };
  private mysqlState: StorageComponentStatus = {
    name: "mysql",
    engine: "mysql",
    configured: false,
    state: "disabled",
    message: "dsn not configured",
    latencyMs: null,
  };
  private yamlState: StorageComponentStatus = {
    name: "yaml",
    engine: "yaml",
    configured: true,
    state: "degraded",
    message: "backup not written",
    latencyMs: null,
  };
  private redisClient: RedisClientLike | null = null;
  private cacheMode: "redis" | "memory" = "memory";
  private memoryCache = new Map<string, MemoryCacheEntry>();
  private fallbackLogs: StorageRuntimeLog[] = [];
  private fallbackLogSeq = 0;
  private lastBackupAt = 0;

  constructor(repoRoot: string) {
    this.storageDir = path.resolve(repoRoot, "config", "storage");
    this.sqlitePath = path.resolve(this.storageDir, "savc-system.sqlite");
    this.yamlBackupPath = path.resolve(this.storageDir, "savc-disaster-backup.yaml");
    this.redisUrl = String(process.env.SAVC_REDIS_URL || process.env.REDIS_URL || "").trim();
    this.mysqlDsn = String(process.env.SAVC_MYSQL_DSN || process.env.MYSQL_URL || "").trim();
  }

  init(): void {
    if (!existsSync(this.storageDir)) {
      mkdirSync(this.storageDir, { recursive: true });
    }
    this.initSqlite();
    void this.initRedis();
    this.initMySqlState();
    this.writeDisasterBackup("init");
  }

  private initSqlite() {
    try {
      const startedAt = Date.now();
      this.db = new DatabaseSync(this.sqlitePath);
      this.db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        CREATE TABLE IF NOT EXISTS kv_store (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT 'system'
        );
        CREATE TABLE IF NOT EXISTS runtime_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          level TEXT NOT NULL,
          subsystem TEXT NOT NULL,
          message TEXT NOT NULL,
          context_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);
      this.sqliteState = {
        name: "sqlite",
        engine: "node:sqlite",
        configured: true,
        state: "online",
        message: "ready",
        latencyMs: Date.now() - startedAt,
      };
      this.logRuntime("info", "storage", "sqlite initialized", {
        sqlitePath: this.sqlitePath,
      });
    } catch (error) {
      this.db = null;
      this.sqliteState = {
        name: "sqlite",
        engine: "node:sqlite",
        configured: true,
        state: "offline",
        message: normalizeErr(error),
        latencyMs: null,
      };
      this.pushFallbackLog("error", "storage", "sqlite init failed", { error: normalizeErr(error) });
    }
  }

  private async initRedis() {
    if (!this.redisUrl) {
      this.cacheMode = "memory";
      this.cacheState = {
        name: "cache",
        engine: "memory",
        configured: true,
        state: "online",
        message: "memory cache (recommended default for local dev)",
        latencyMs: null,
      };
      return;
    }

    try {
      const redisPkg = await import("redis");
      const createClient = (redisPkg as Record<string, unknown>).createClient;
      if (typeof createClient !== "function") {
        throw new Error("redis.createClient unavailable");
      }
      const startedAt = Date.now();
      const client = (createClient as (opts: { url: string }) => RedisClientLike)({ url: this.redisUrl });
      if (typeof client.connect === "function") {
        await Promise.race([
          client.connect(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("redis connect timeout")), 2500)),
        ]);
      }
      this.redisClient = client;
      this.cacheMode = "redis";
      this.cacheState = {
        name: "cache",
        engine: "redis",
        configured: true,
        state: "online",
        message: "redis connected",
        latencyMs: Date.now() - startedAt,
      };
      this.logRuntime("info", "storage", "redis cache connected", { redisUrl: this.redisUrl });
    } catch (error) {
      this.redisClient = null;
      this.cacheMode = "memory";
      this.cacheState = {
        name: "cache",
        engine: "redis",
        configured: true,
        state: "degraded",
        message: `redis unavailable, fallback memory: ${normalizeErr(error)}`,
        latencyMs: null,
      };
      this.logRuntime("warn", "storage", "redis unavailable, fallback to memory cache", {
        error: normalizeErr(error),
      });
    }
  }

  private initMySqlState() {
    if (!this.mysqlDsn) {
      this.mysqlState = {
        name: "mysql",
        engine: "mysql",
        configured: false,
        state: "disabled",
        message: "dsn not configured",
        latencyMs: null,
      };
      return;
    }
    this.mysqlState = {
      name: "mysql",
      engine: "mysql",
      configured: true,
      state: "degraded",
      message: "dsn configured (reserved)",
      latencyMs: null,
    };
  }

  private nowIso(): string {
    return new Date().toISOString();
  }

  private cleanMemoryCache() {
    const now = Date.now();
    for (const [key, row] of this.memoryCache.entries()) {
      if (row.expiresAt <= now) this.memoryCache.delete(key);
    }
  }

  private getDb(): DatabaseSync | null {
    return this.db;
  }

  private pushFallbackLog(level: string, subsystem: string, message: string, context: Record<string, unknown>) {
    const log: StorageRuntimeLog = {
      id: ++this.fallbackLogSeq,
      level,
      subsystem,
      message,
      context,
      createdAt: this.nowIso(),
    };
    this.fallbackLogs.unshift(log);
    if (this.fallbackLogs.length > 400) {
      this.fallbackLogs = this.fallbackLogs.slice(0, 400);
    }
  }

  logRuntime(level: string, subsystem: string, message: string, context: Record<string, unknown> = {}): StorageRuntimeLog {
    const safeLevel = asString(level) || "info";
    const safeSubsystem = asString(subsystem) || "system";
    const safeMessage = asString(message) || "-";
    const now = this.nowIso();
    const db = this.getDb();

    if (!db) {
      this.pushFallbackLog(safeLevel, safeSubsystem, safeMessage, context);
      this.writeDisasterBackup("fallback_log");
      return this.fallbackLogs[0] as StorageRuntimeLog;
    }

    try {
      const stmt = db.prepare(`
        INSERT INTO runtime_logs (level, subsystem, message, context_json, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      stmt.run(safeLevel, safeSubsystem, safeMessage, JSON.stringify(context), now);
      db.exec(`
        DELETE FROM runtime_logs
        WHERE id NOT IN (
          SELECT id FROM runtime_logs ORDER BY id DESC LIMIT 2000
        );
      `);
      const row = db.prepare(`
        SELECT id, level, subsystem, message, context_json, created_at
        FROM runtime_logs
        ORDER BY id DESC
        LIMIT 1
      `).get() as Record<string, unknown>;
      const log: StorageRuntimeLog = {
        id: Number(row.id || 0),
        level: asString(row.level),
        subsystem: asString(row.subsystem),
        message: asString(row.message),
        context: asRecord(JSON.parse(asString(row.context_json) || "{}")),
        createdAt: asString(row.created_at),
      };
      this.writeDisasterBackup("runtime_log");
      return log;
    } catch (error) {
      this.pushFallbackLog(safeLevel, safeSubsystem, safeMessage, {
        ...context,
        storageError: normalizeErr(error),
      });
      this.writeDisasterBackup("runtime_log_fallback");
      return this.fallbackLogs[0] as StorageRuntimeLog;
    }
  }

  async cacheSet(key: string, value: string, ttlSec = 120): Promise<void> {
    const safeKey = asString(key);
    if (!safeKey) return;
    const safeValue = asString(value);
    const safeTtl = clamp(Math.floor(ttlSec), 5, 86_400);

    if (this.cacheMode === "redis" && this.redisClient && typeof this.redisClient.set === "function") {
      try {
        await this.redisClient.set(safeKey, safeValue, { EX: safeTtl });
        return;
      } catch {
        // fallback memory
      }
    }
    this.memoryCache.set(safeKey, {
      value: safeValue,
      expiresAt: Date.now() + safeTtl * 1000,
    });
  }

  async cacheGet(key: string): Promise<string | null> {
    const safeKey = asString(key);
    if (!safeKey) return null;

    if (this.cacheMode === "redis" && this.redisClient && typeof this.redisClient.get === "function") {
      try {
        const value = await this.redisClient.get(safeKey);
        if (typeof value === "string") return value;
      } catch {
        // fallback memory
      }
    }
    this.cleanMemoryCache();
    const cached = this.memoryCache.get(safeKey);
    return cached ? cached.value : null;
  }

  async setKv(key: string, value: unknown, source = "api"): Promise<void> {
    const safeKey = asString(key);
    if (!safeKey) return;
    const serialized = JSON.stringify(value ?? null);
    await this.cacheSet(`kv:${safeKey}`, serialized, 90);
    const db = this.getDb();
    if (!db) return;
    try {
      const stmt = db.prepare(`
        INSERT INTO kv_store (key, value, updated_at, source)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(key)
        DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, source = excluded.source
      `);
      stmt.run(safeKey, serialized, this.nowIso(), asString(source) || "api");
      this.writeDisasterBackup("set_kv");
    } catch (error) {
      this.logRuntime("error", "storage", "kv set failed", {
        key: safeKey,
        error: normalizeErr(error),
      });
    }
  }

  async getKv(key: string): Promise<unknown> {
    const safeKey = asString(key);
    if (!safeKey) return null;
    const fromCache = await this.cacheGet(`kv:${safeKey}`);
    if (fromCache) {
      try {
        return JSON.parse(fromCache);
      } catch {
        return fromCache;
      }
    }
    const db = this.getDb();
    if (!db) return null;
    try {
      const row = db.prepare(`
        SELECT value
        FROM kv_store
        WHERE key = ?
        LIMIT 1
      `).get(safeKey) as Record<string, unknown> | undefined;
      const raw = row ? asString(row.value) : "";
      if (!raw) return null;
      await this.cacheSet(`kv:${safeKey}`, raw, 90);
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  listRuntimeLogs(limit = 80): StorageRuntimeLog[] {
    const safeLimit = clamp(Math.floor(limit), 1, 200);
    const db = this.getDb();
    if (!db) {
      return this.fallbackLogs.slice(0, safeLimit);
    }
    try {
      const rows = db.prepare(`
        SELECT id, level, subsystem, message, context_json, created_at
        FROM runtime_logs
        ORDER BY id DESC
        LIMIT ?
      `).all(safeLimit) as Array<Record<string, unknown>>;
      return rows.map((row) => {
        let context: Record<string, unknown> = {};
        try {
          context = asRecord(JSON.parse(asString(row.context_json) || "{}"));
        } catch {
          context = {};
        }
        return {
          id: Number(row.id || 0),
          level: asString(row.level),
          subsystem: asString(row.subsystem),
          message: asString(row.message),
          context,
          createdAt: asString(row.created_at),
        } satisfies StorageRuntimeLog;
      });
    } catch {
      return this.fallbackLogs.slice(0, safeLimit);
    }
  }

  private runtimeLogCount(): number {
    const db = this.getDb();
    if (!db) return this.fallbackLogs.length;
    try {
      const row = db.prepare("SELECT COUNT(1) AS count FROM runtime_logs").get() as Record<string, unknown>;
      return Number(row.count || 0);
    } catch {
      return this.fallbackLogs.length;
    }
  }

  private kvCount(): number {
    const db = this.getDb();
    if (!db) return 0;
    try {
      const row = db.prepare("SELECT COUNT(1) AS count FROM kv_store").get() as Record<string, unknown>;
      return Number(row.count || 0);
    } catch {
      return 0;
    }
  }

  private async checkRedisStatus(): Promise<StorageComponentStatus> {
    if (this.cacheMode === "memory") {
      return {
        name: "cache",
        engine: this.redisUrl ? "redis->memory" : "memory",
        configured: true,
        state: this.redisUrl ? "degraded" : "online",
        message: this.redisUrl ? "redis degraded, using memory fallback" : "memory cache",
        latencyMs: null,
      };
    }
    if (!this.redisClient || typeof this.redisClient.ping !== "function") {
      return {
        name: "cache",
        engine: "redis",
        configured: true,
        state: "degraded",
        message: "redis client unavailable, fallback memory",
        latencyMs: null,
      };
    }
    const startedAt = Date.now();
    try {
      await this.redisClient.ping();
      return {
        name: "cache",
        engine: "redis",
        configured: true,
        state: "online",
        message: "redis ping ok",
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      this.cacheMode = "memory";
      return {
        name: "cache",
        engine: "redis",
        configured: true,
        state: "degraded",
        message: `redis ping failed: ${normalizeErr(error)}`,
        latencyMs: null,
      };
    }
  }

  private async checkMySqlStatus(): Promise<StorageComponentStatus> {
    if (!this.mysqlDsn) {
      return {
        name: "mysql",
        engine: "mysql",
        configured: false,
        state: "disabled",
        message: "dsn not configured",
        latencyMs: null,
      };
    }
    const parsed = parseMySqlDsn(this.mysqlDsn);
    if (!parsed) {
      return {
        name: "mysql",
        engine: "mysql",
        configured: true,
        state: "offline",
        message: "invalid dsn",
        latencyMs: null,
      };
    }
    const result = await probeTcp(parsed.host, parsed.port, 1600);
    if (!result.ok) {
      return {
        name: "mysql",
        engine: "mysql",
        configured: true,
        state: "degraded",
        message: `reserved endpoint unreachable (${parsed.host}:${parsed.port})`,
        latencyMs: null,
      };
    }
    return {
      name: "mysql",
      engine: "mysql",
      configured: true,
      state: "online",
      message: `reachable (${parsed.host}:${parsed.port}/${parsed.database || "-"})`,
      latencyMs: result.latencyMs,
    };
  }

  private yamlBackupStatus(): StorageComponentStatus {
    return {
      name: "yaml",
      engine: "yaml",
      configured: true,
      state: existsSync(this.yamlBackupPath) ? "online" : "degraded",
      message: existsSync(this.yamlBackupPath) ? "backup ready" : "backup not written",
      latencyMs: null,
    };
  }

  getStatusSync(): StorageStatusSnapshot {
    this.cleanMemoryCache();
    const sqliteState = this.sqliteState;
    const yamlState = this.yamlBackupStatus();
    return {
      ok: sqliteState.state !== "offline",
      generatedAt: this.nowIso(),
      mode: {
        primary: this.getDb() ? "sqlite" : "memory",
        cache: this.cacheMode,
        backup: "yaml",
      },
      components: {
        sqlite: sqliteState,
        cache: this.cacheState,
        mysql: this.mysqlState,
        yaml: yamlState,
      },
      metrics: {
        runtimeLogCount: this.runtimeLogCount(),
        kvCount: this.kvCount(),
        cacheEntries: this.memoryCache.size,
      },
      paths: {
        sqlite: this.sqlitePath,
        yamlBackup: this.yamlBackupPath,
      },
    };
  }

  async getStatus(): Promise<StorageStatusSnapshot> {
    this.cacheState = await this.checkRedisStatus();
    this.mysqlState = await this.checkMySqlStatus();
    this.yamlState = this.yamlBackupStatus();
    return this.getStatusSync();
  }

  writeDisasterBackup(reason: string): void {
    const now = Date.now();
    if (now - this.lastBackupAt < 10_000) {
      return;
    }
    this.lastBackupAt = now;
    try {
      const snapshot = this.getStatusSync();
      const logs = this.listRuntimeLogs(80);
      const db = this.getDb();
      const kvRows = db
        ? (db.prepare(`
            SELECT key, value, updated_at, source
            FROM kv_store
            ORDER BY updated_at DESC
            LIMIT 120
          `).all() as Array<Record<string, unknown>>)
        : [];
      const kv = kvRows.map((row) => ({
        key: asString(row.key),
        value: (() => {
          const raw = asString(row.value);
          try {
            return JSON.parse(raw);
          } catch {
            return raw;
          }
        })(),
        updatedAt: asString(row.updated_at),
        source: asString(row.source),
      }));

      const payload = {
        savcStorageBackup: {
          generatedAt: this.nowIso(),
          reason,
          status: snapshot,
          kv,
          recentLogs: logs,
        },
      };
      const yaml = `# SAVC storage disaster backup\n${yamlDump(payload)}\n`;
      writeFileSync(this.yamlBackupPath, yaml, "utf8");
      this.yamlState = {
        name: "yaml",
        engine: "yaml",
        configured: true,
        state: "online",
        message: "backup synced",
        latencyMs: null,
      };
    } catch (error) {
      this.yamlState = {
        name: "yaml",
        engine: "yaml",
        configured: true,
        state: "degraded",
        message: `backup failed: ${normalizeErr(error)}`,
        latencyMs: null,
      };
    }
  }
}
