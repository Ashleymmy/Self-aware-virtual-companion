import { GatewayBrowserClient } from "../gateway-ws.js";
import { dashboardStats, yuanyuanStatus, recentActivities } from "./dashboard-data.js";
import { memories } from "./memory-data.js";
import {
  personaTraits,
  voiceVariants,
  coreValues,
  soulDocPreview,
  verbalTics,
  topicHandling,
} from "./persona-data.js";
import { agents, routingRules, recentDispatches } from "./orchestrator-data.js";

export type {
  DashboardStats,
  YuanyuanStatus,
  RecentActivity,
  MemoryItem,
  PersonaTrait,
  VoiceVariant,
  ValueItem,
  AgentNode,
  RoutingRule,
  DispatchRecord,
  StorageStatus,
  StorageRuntimeLog,
} from "./types.js";

import type {
  AgentNode,
  DashboardStats,
  DispatchRecord,
  MemoryItem,
  PersonaTrait,
  RecentActivity,
  RoutingRule,
  StorageRuntimeLog,
  StorageStatus,
  ValueItem,
  VoiceVariant,
  YuanyuanStatus,
} from "./types.js";

type JsonRecord = Record<string, unknown>;

export type TtsProviderId = "openai" | "elevenlabs" | "edge";

export type GatewayTtsStatus = {
  enabled: boolean;
  auto: "off" | "always" | "inbound" | "tagged";
  provider: TtsProviderId;
  fallbackProviders: TtsProviderId[];
  hasOpenAIKey: boolean;
  hasElevenLabsKey: boolean;
  edgeEnabled: boolean;
};

export type GatewayTtsInlineAudio = {
  provider: string;
  outputFormat: string;
  voiceCompatible: boolean;
  mimeType?: string;
  bytes?: number;
  base64?: string;
  audioPath?: string;
};

type GatewaySnapshot = {
  status: JsonRecord;
  health: JsonRecord;
  sessionsList: JsonRecord;
  agentsList: JsonRecord;
  config: JsonRecord;
};

const DEFAULT_GATEWAY_WS_URL = "ws://127.0.0.1:18789";
const DEFAULT_SESSION_KEY = "main";
const REQUEST_TIMEOUT_MS = 12_000;
const CHAT_REPLY_TIMEOUT_MS = 45_000;
const CHAT_POLL_INTERVAL_MS = 900;
const TTS_INLINE_MAX_BYTES = 2 * 1024 * 1024;

const AGENT_COLORS = [
  "#14b8a6",
  "#22c55e",
  "#0ea5e9",
  "#f59e0b",
  "#f97316",
  "#ec4899",
  "#84cc16",
  "#06b6d4",
];

function readEnv(name: keyof ImportMetaEnv): string {
  const raw = import.meta.env[name];
  return typeof raw === "string" ? raw.trim() : "";
}

function resolveGatewayWsUrl(): string {
  const configured = readEnv("VITE_SAVC_GATEWAY_URL");
  if (!configured) {
    return DEFAULT_GATEWAY_WS_URL;
  }
  const normalized = configured.replace(/\/+$/, "");
  if (normalized.startsWith("ws://") || normalized.startsWith("wss://")) {
    return normalized;
  }
  if (normalized.startsWith("http://")) {
    return `ws://${normalized.slice("http://".length)}`;
  }
  if (normalized.startsWith("https://")) {
    return `wss://${normalized.slice("https://".length)}`;
  }
  return `ws://${normalized}`;
}

function defaultSessionKey(): string {
  return readEnv("VITE_SAVC_SESSION_KEY") || DEFAULT_SESSION_KEY;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timeout after ${ms}ms`));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" ? (value as JsonRecord) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function toDateLabel(ms: number | null): string {
  if (ms == null) {
    return "-";
  }
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

function toClockLabel(ms: number | null): string {
  if (ms == null) {
    return "--:--:--";
  }
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    return "--:--:--";
  }
  return date.toLocaleTimeString("zh-CN", { hour12: false });
}

function toRelativeTime(ms: number | null): string {
  if (ms == null) {
    return "未知";
  }
  const delta = Date.now() - ms;
  if (delta < 15_000) return "刚刚";
  if (delta < 60_000) return `${Math.floor(delta / 1000)} 秒前`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} 分钟前`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} 小时前`;
  return `${Math.floor(delta / 86_400_000)} 天前`;
}

function toDurationLabel(ms: number | null): string {
  if (ms == null || ms < 0) {
    return "--";
  }
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) {
    return `${h}h ${m}m`;
  }
  return `${m}m`;
}

function hashToColor(seed: string): string {
  if (!seed) {
    return AGENT_COLORS[0];
  }
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 33 + seed.charCodeAt(i)) >>> 0;
  }
  return AGENT_COLORS[hash % AGENT_COLORS.length];
}

function extractTextFromMessage(message: unknown): string | null {
  const row = asRecord(message);
  if (!row) {
    return null;
  }
  const content = row.content;
  if (typeof content === "string") {
    const trimmed = content.trim();
    return trimmed || null;
  }
  if (Array.isArray(content)) {
    const pieces = content
      .map((item) => {
        const part = asRecord(item);
        if (part?.type === "text" && typeof part.text === "string") {
          return part.text;
        }
        return null;
      })
      .filter((text): text is string => typeof text === "string" && text.trim().length > 0);
    if (pieces.length > 0) {
      return pieces.join("\n").trim();
    }
  }
  if (typeof row.text === "string") {
    const trimmed = row.text.trim();
    return trimmed || null;
  }
  return null;
}

function latestAssistantMessage(messages: unknown[]): { text: string; signature: string } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const row = asRecord(messages[i]);
    if (!row || asString(row.role) !== "assistant") {
      continue;
    }
    const text = extractTextFromMessage(row);
    if (!text) {
      continue;
    }
    const timestamp = asNumber(row.timestamp) ?? 0;
    return {
      text,
      signature: `${timestamp}:${text}`,
    };
  }
  return null;
}

function firstNonEmptyLine(content: string): string {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? "";
}

function extractSectionLines(content: string, heading: string): string[] {
  if (!content) {
    return [];
  }
  const lines = content.split(/\r?\n/);
  const headingPattern = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}`);
  let collecting = false;
  const picked: string[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!collecting) {
      if (headingPattern.test(line)) {
        collecting = true;
      }
      continue;
    }
    if (/^##\s+/.test(line)) {
      break;
    }
    if (line) {
      picked.push(line);
    }
  }
  return picked;
}

function resolveDefaultAgentId(snapshot: GatewaySnapshot): string {
  const agentsList = asRecord(snapshot.agentsList);
  const fromAgents = asString(agentsList?.defaultId);
  if (fromAgents) {
    return fromAgents;
  }
  const status = asRecord(snapshot.status);
  const heartbeat = asRecord(status?.heartbeat);
  const fromStatus = asString(heartbeat?.defaultAgentId);
  if (fromStatus) {
    return fromStatus;
  }
  const rows = asArray(agentsList?.agents);
  for (const row of rows) {
    const rec = asRecord(row);
    const id = asString(rec?.id);
    if (id) {
      return id;
    }
  }
  return "main";
}

function parseCoreValuesFromSoul(soul: string): ValueItem[] {
  const lines = extractSectionLines(soul, "价值观");
  const values: ValueItem[] = [];
  for (const line of lines) {
    const m = /^-\s*([a-zA-Z0-9_-]+)\s*:\s*(.+)$/.exec(line);
    if (!m) {
      continue;
    }
    const key = m[1].trim().toLowerCase();
    const desc = m[2].trim();
    values.push({
      key,
      label: key,
      description: desc,
      priority: values.length < 2 ? "core" : values.length < 4 ? "high" : "medium",
    });
  }
  return values;
}

function scoreByKeywords(text: string, keywords: string[], base: number, span: number): number {
  const lowered = text.toLowerCase();
  let hits = 0;
  for (const keyword of keywords) {
    const escaped = keyword.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
    const m = lowered.match(new RegExp(escaped, "g"));
    hits += m?.length ?? 0;
  }
  return clamp(base + Math.min(1, hits / 5) * span, 0.25, 0.95);
}

function resolveMemoryCategoryFromHeading(title: string): MemoryItem["category"] | null {
  const normalized = title.toLowerCase();
  if (/episodic|情景|场景|经历/.test(normalized)) return "episodic";
  if (/semantic|语义|知识/.test(normalized)) return "semantic";
  if (/emotional|情感|情绪/.test(normalized)) return "emotional";
  if (/procedural|流程|步骤|操作/.test(normalized)) return "procedural";
  if (/preference|偏好|喜好/.test(normalized)) return "preference";
  return null;
}

function inferMemoryCategory(text: string): MemoryItem["category"] {
  const normalized = text.toLowerCase();
  if (/(喜欢|偏好|习惯|讨厌|偏爱)/.test(normalized)) return "preference";
  if (/(情绪|心情|开心|难过|焦虑|安抚|陪伴)/.test(normalized)) return "emotional";
  if (/(步骤|命令|操作|workflow|流程|restart|install)/.test(normalized)) return "procedural";
  if (/(今天|昨天|刚刚|上次|会话|聊天|提到)/.test(normalized)) return "episodic";
  return "semantic";
}

function importanceByText(text: string): number {
  const normalized = text.toLowerCase();
  if (/(必须|关键|critical|urgent|重要|底线)/.test(normalized)) return 0.9;
  if (/(建议|注意|prefer|偏好|记得)/.test(normalized)) return 0.72;
  return 0.55;
}

function extractTags(text: string): string[] {
  const tags = new Set<string>();
  const hashMatches = text.match(/#([\w\-]+)/g) ?? [];
  for (const hash of hashMatches) {
    tags.add(hash.slice(1).toLowerCase());
  }
  const keywordMap: Array<{ pattern: RegExp; tag: string }> = [
    { pattern: /(typescript|ts)/i, tag: "typescript" },
    { pattern: /live2d/i, tag: "live2d" },
    { pattern: /gateway/i, tag: "gateway" },
    { pattern: /(情绪|心情|安抚)/, tag: "emotion" },
    { pattern: /(记忆|memory)/i, tag: "memory" },
    { pattern: /(agent|编排|路由)/i, tag: "agent" },
  ];
  for (const item of keywordMap) {
    if (item.pattern.test(text)) {
      tags.add(item.tag);
    }
  }
  return Array.from(tags).slice(0, 6);
}

function parseMemoryMarkdown(content: string, sourcePath: string, updatedAtMs: number | null): MemoryItem[] {
  const lines = content.split(/\r?\n/);
  const items: MemoryItem[] = [];
  let category: MemoryItem["category"] = "semantic";
  let index = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const headingMatch = /^#{1,6}\s+(.+)$/.exec(line);
    if (headingMatch) {
      const next = resolveMemoryCategoryFromHeading(headingMatch[1]);
      if (next) {
        category = next;
      }
      continue;
    }

    const bulletMatch = /^[-*+]\s+(.+)$/.exec(line) ?? /^\d+\.\s+(.+)$/.exec(line);
    if (!bulletMatch) {
      continue;
    }

    const contentText = bulletMatch[1].trim();
    if (!contentText) {
      continue;
    }

    const finalCategory = resolveMemoryCategoryFromHeading(contentText) ?? inferMemoryCategory(contentText) ?? category;
    items.push({
      id: `memory-${index + 1}`,
      content: contentText,
      category: finalCategory,
      importance: importanceByText(contentText),
      createdAt: toDateLabel(updatedAtMs),
      lastAccessed: toDateLabel(updatedAtMs),
      accessCount: 1,
      tags: extractTags(contentText),
      source: sourcePath,
    });
    index += 1;
  }

  return items;
}

function parseRoutingRulesFromConfig(config: JsonRecord): RoutingRule[] {
  const seen = new Set<string>();
  const rules: RoutingRule[] = [];

  const visit = (value: unknown, path: string, depth: number) => {
    if (depth > 6) return;
    if (Array.isArray(value)) {
      value.forEach((item, idx) => {
        const row = asRecord(item);
        if (row) {
          const pattern = asString(row.pattern || row.match || row.trigger || row.rule);
          const target = asString(row.target || row.agent || row.to || row.agentId);
          if (pattern && target) {
            const id = `${path}.${idx}:${pattern}:${target}`;
            if (!seen.has(id)) {
              seen.add(id);
              rules.push({
                id,
                pattern,
                target,
                priority: Math.floor(asNumber(row.priority) ?? idx + 1),
                enabled: row.enabled !== false,
              });
            }
          }
        }
        visit(item, `${path}.${idx}`, depth + 1);
      });
      return;
    }

    const record = asRecord(value);
    if (!record) return;
    for (const [key, child] of Object.entries(record)) {
      visit(child, `${path}.${key}`, depth + 1);
    }
  };

  visit(config, "config", 0);
  return rules;
}

function fallbackStorageStatus(): StorageStatus {
  return {
    generatedAt: new Date().toISOString(),
    mode: {
      primary: "memory",
      cache: "memory",
      backup: "yaml",
    },
    components: {
      sqlite: {
        name: "sqlite",
        engine: "node:sqlite",
        configured: true,
        state: "offline",
        message: "storage service unavailable",
        latencyMs: null,
      },
      cache: {
        name: "cache",
        engine: "memory",
        configured: true,
        state: "degraded",
        message: "fallback cache",
        latencyMs: null,
      },
      mysql: {
        name: "mysql",
        engine: "mysql",
        configured: false,
        state: "disabled",
        message: "reserved",
        latencyMs: null,
      },
      yaml: {
        name: "yaml",
        engine: "yaml",
        configured: true,
        state: "degraded",
        message: "backup status unknown",
        latencyMs: null,
      },
    },
    metrics: {
      runtimeLogCount: 0,
      kvCount: 0,
      cacheEntries: 0,
    },
    paths: {
      sqlite: "-",
      yamlBackup: "-",
    },
  };
}

function fallbackStorageLogs(): StorageRuntimeLog[] {
  return [
    {
      id: 0,
      level: "warn",
      subsystem: "storage",
      message: "storage logs unavailable",
      context: {},
      createdAt: new Date().toISOString(),
    },
  ];
}

class GatewayDataClient {
  private client: GatewayBrowserClient | null = null;
  private connectPromise: Promise<GatewayBrowserClient> | null = null;
  private snapshotCache: { at: number; data: GatewaySnapshot } | null = null;
  private memoryCache: { at: number; items: MemoryItem[] } | null = null;
  private storageStatusCache: { at: number; data: StorageStatus } | null = null;
  private storageLogsCache: { at: number; data: StorageRuntimeLog[] } | null = null;

  invalidateCache(options?: { snapshot?: boolean; memory?: boolean; storage?: boolean }) {
    const clearSnapshot = !options || options.snapshot !== false;
    const clearMemory = !options || options.memory !== false;
    const clearStorage = !options || options.storage !== false;
    if (clearSnapshot) {
      this.snapshotCache = null;
    }
    if (clearMemory) {
      this.memoryCache = null;
    }
    if (clearStorage) {
      this.storageStatusCache = null;
      this.storageLogsCache = null;
    }
  }

  private resetClient() {
    if (this.client) {
      this.client.stop();
    }
    this.client = null;
    this.connectPromise = null;
  }

  private async ensureClient(): Promise<GatewayBrowserClient> {
    if (this.client && this.client.connected) {
      return this.client;
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    const url = resolveGatewayWsUrl();
    const token = readEnv("VITE_SAVC_GATEWAY_TOKEN") || undefined;

    this.connectPromise = new Promise<GatewayBrowserClient>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.resetClient();
        reject(new Error("gateway connect timeout"));
      }, REQUEST_TIMEOUT_MS);

      const client = new GatewayBrowserClient({
        url,
        token,
        clientName: "savc-ui",
        mode: "webchat",
        onHello: () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          this.client = client;
          resolve(client);
        },
        onClose: () => {
          this.snapshotCache = null;
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            reject(new Error("gateway closed before hello"));
          }
        },
      });

      this.client = client;
      client.start();
    }).finally(() => {
      this.connectPromise = null;
    });

    return this.connectPromise;
  }

  private async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    const run = async () => {
      const client = await this.ensureClient();
      return await withTimeout(client.request<T>(method, params), REQUEST_TIMEOUT_MS, method);
    };

    try {
      return await run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/not connected|closed|connect failed|timeout/i.test(message)) {
        this.resetClient();
        return await run();
      }
      throw error;
    }
  }

  private async requestStorageJson<T = JsonRecord>(path: string): Promise<T> {
    const response = await withTimeout(fetch(path, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    }), REQUEST_TIMEOUT_MS, path);

    if (!response.ok) {
      throw new Error(`${path} failed (${response.status})`);
    }
    return await response.json() as T;
  }

  private async loadSnapshot(): Promise<GatewaySnapshot> {
    const now = Date.now();
    if (this.snapshotCache && now - this.snapshotCache.at < 2_500) {
      return this.snapshotCache.data;
    }

    const [status, health, sessionsList, agentsList, configGet] = await Promise.all([
      this.request<JsonRecord>("status", {}),
      this.request<JsonRecord>("health", {}),
      this.request<JsonRecord>("sessions.list", {
        includeGlobal: true,
        includeUnknown: true,
        activeMinutes: 24 * 60,
        limit: 300,
      }),
      this.request<JsonRecord>("agents.list", {}),
      this.request<JsonRecord>("config.get", {}),
    ]);

    const config = asRecord(configGet.config) ?? {};

    const data: GatewaySnapshot = {
      status,
      health,
      sessionsList,
      agentsList,
      config,
    };

    this.snapshotCache = { at: now, data };
    return data;
  }

  private async getAgentFile(agentId: string, name: string): Promise<{
    content: string;
    path: string;
    updatedAtMs: number | null;
    missing: boolean;
  }> {
    const result = await this.request<JsonRecord>("agents.files.get", {
      agentId,
      name,
    });
    const file = asRecord(result.file);
    return {
      content: asString(file?.content),
      path: asString(file?.path),
      updatedAtMs: asNumber(file?.updatedAtMs),
      missing: Boolean(file?.missing),
    };
  }

  async getDashboardStats(): Promise<DashboardStats> {
    try {
      const snapshot = await this.loadSnapshot();
      const status = asRecord(snapshot.status);
      const statusSessions = asRecord(status?.sessions);
      const sessionsList = asRecord(snapshot.sessionsList);
      const sessionRows = asArray(sessionsList?.sessions);
      const health = asRecord(snapshot.health);
      const healthSnapshot = asRecord(health?.snapshot);
      const agentsList = asRecord(snapshot.agentsList);

      const activeSessions =
        Math.max(0, Math.floor(asNumber(statusSessions?.count) ?? asNumber(sessionsList?.count) ?? 0));
      const agentCount = asArray(agentsList?.agents).length;
      const uptimeMs = asNumber(health?.uptimeMs) ?? asNumber(healthSnapshot?.uptimeMs);

      const totalMessages = Math.max(
        activeSessions,
        sessionRows.reduce<number>((sum, row) => {
          const rec = asRecord(row);
          const input = asNumber(rec?.inputTokens) ?? 0;
          const output = asNumber(rec?.outputTokens) ?? 0;
          const total = asNumber(rec?.totalTokens) ?? input + output;
          if (total <= 0) {
            return sum + 1;
          }
          return sum + Math.max(1, Math.round(total / 220));
        }, 0),
      );

      const memoryCount = await this.getMemoryCount();

      return {
        status: "online",
        uptime: toDurationLabel(uptimeMs),
        activeSessions,
        memoryCount,
        totalMessages,
        agentCount,
      };
    } catch {
      return { ...dashboardStats };
    }
  }

  async getYuanyuanStatus(): Promise<YuanyuanStatus> {
    try {
      const snapshot = await this.loadSnapshot();
      const defaultAgentId = resolveDefaultAgentId(snapshot);
      const status = asRecord(snapshot.status);
      const sessions = asRecord(status?.sessions);
      const recent = asArray(sessions?.recent);

      let lastUpdated: number | null = null;
      for (const row of recent) {
        const rec = asRecord(row);
        const updatedAt = asNumber(rec?.updatedAt);
        if (updatedAt != null && (lastUpdated == null || updatedAt > lastUpdated)) {
          lastUpdated = updatedAt;
        }
      }

      const ageMs = lastUpdated == null ? Number.POSITIVE_INFINITY : Date.now() - lastUpdated;
      const mood =
        ageMs < 5 * 60_000
          ? { label: "专注", emoji: "⚡" }
          : ageMs < 30 * 60_000
            ? { label: "在线", emoji: "🙂" }
            : ageMs < 2 * 60 * 60_000
              ? { label: "平稳", emoji: "🌤️" }
              : { label: "待机", emoji: "🌙" };

      const mode = asArray(status?.queuedSystemEvents).length > 0 ? "technical" : "casual";

      const identity = await this.request<JsonRecord>("agent.identity.get", {
        agentId: defaultAgentId,
      });
      const soulFile = await this.getAgentFile(defaultAgentId, "SOUL.md");
      const coreLines = extractSectionLines(soulFile.content, "核心性格");
      const summaryLine =
        coreLines
          .map((line) => line.replace(/^[-*+]\s*/, "").trim())
          .find(Boolean) ??
        asString(identity.name) ??
        firstNonEmptyLine(soulFile.content);

      return {
        mood: mood.label,
        moodEmoji: mood.emoji,
        lastInteraction: toRelativeTime(lastUpdated),
        personalitySummary: summaryLine || yuanyuanStatus.personalitySummary,
        activeMode: mode,
      };
    } catch {
      return { ...yuanyuanStatus };
    }
  }

  async getRecentActivities(): Promise<RecentActivity[]> {
    try {
      const snapshot = await this.loadSnapshot();
      const status = asRecord(snapshot.status);
      const sessions = asRecord(status?.sessions);
      const recent = asArray(sessions?.recent);
      const heartbeat = asRecord(status?.heartbeat);
      const heartbeatAgents = asArray(heartbeat?.agents);
      const queued = asArray(status?.queuedSystemEvents);

      const rows: Array<{ at: number; row: RecentActivity }> = [];

      for (const item of recent.slice(0, 8)) {
        const rec = asRecord(item);
        const key = asString(rec?.key) || "unknown";
        const agent = asString(rec?.agentId);
        const updatedAt = asNumber(rec?.updatedAt) ?? Date.now();
        rows.push({
          at: updatedAt,
          row: {
            id: `chat-${key}-${updatedAt}`,
            type: "chat",
            message: `会话 ${key} 有新互动`,
            time: toRelativeTime(updatedAt),
            ...(agent ? { agent } : {}),
          },
        });
      }

      for (let i = 0; i < queued.slice(0, 4).length; i++) {
        const text = asString(queued[i]) || "系统事件";
        const at = Date.now() - i * 30_000;
        rows.push({
          at,
          row: {
            id: `system-${i}-${at}`,
            type: "system",
            message: text,
            time: toRelativeTime(at),
          },
        });
      }

      for (const item of heartbeatAgents.slice(0, 4)) {
        const rec = asRecord(item);
        const agentId = asString(rec?.agentId);
        if (!agentId) continue;
        const enabled = rec?.enabled !== false;
        const at = Date.now() - rows.length * 45_000;
        rows.push({
          at,
          row: {
            id: `agent-${agentId}-${at}`,
            type: "agent",
            message: enabled ? `${agentId} 心跳任务已启用` : `${agentId} 心跳任务已停用`,
            time: toRelativeTime(at),
            agent: agentId,
          },
        });
      }

      rows.sort((a, b) => b.at - a.at);
      const list = rows.slice(0, 12).map((entry) => entry.row);
      return list.length > 0 ? list : [...recentActivities];
    } catch {
      return [...recentActivities];
    }
  }

  private async loadMemoryItemsFromGateway(): Promise<MemoryItem[]> {
    const now = Date.now();
    if (this.memoryCache && now - this.memoryCache.at < 15_000) {
      return this.memoryCache.items;
    }

    const snapshot = await this.loadSnapshot();
    const defaultAgentId = resolveDefaultAgentId(snapshot);

    let memoryFile = await this.getAgentFile(defaultAgentId, "MEMORY.md");
    if (memoryFile.missing || !memoryFile.content) {
      try {
        memoryFile = await this.getAgentFile(defaultAgentId, "memory.md");
      } catch {
        // ignore fallback errors
      }
    }

    let items: MemoryItem[] = [];
    if (memoryFile.content) {
      items = parseMemoryMarkdown(memoryFile.content, memoryFile.path || "MEMORY.md", memoryFile.updatedAtMs);
    }

    if (items.length === 0) {
      const sessionsList = asRecord(snapshot.sessionsList);
      const rows = asArray(sessionsList?.sessions)
        .map((row) => asRecord(row))
        .filter((row): row is JsonRecord => Boolean(row));
      const keys = rows
        .map((row) => asString(row.key))
        .filter(Boolean)
        .slice(0, 24);

      if (keys.length > 0) {
        const previewResult = await this.request<JsonRecord>("sessions.preview", {
          keys,
          limit: 12,
          maxChars: 200,
        });
        const previews = asArray(previewResult.previews);
        const collected: MemoryItem[] = [];
        let idx = 0;
        for (const entry of previews) {
          const row = asRecord(entry);
          const key = asString(row?.key);
          const previewItems = asArray(row?.items);
          for (const item of previewItems) {
            const msg = asRecord(item);
            const text = asString(msg?.text).trim();
            if (!text) continue;
            collected.push({
              id: `session-memory-${idx + 1}`,
              content: text,
              category: "episodic",
              importance: 0.58,
              createdAt: toDateLabel(now),
              lastAccessed: toDateLabel(now),
              accessCount: 1,
              tags: ["session", key || "main"].filter(Boolean),
              source: `session:${key || "main"}`,
            });
            idx += 1;
          }
        }
        items = collected;
      }
    }

    this.memoryCache = { at: now, items };
    return items;
  }

  async getMemories(filter?: { category?: string; search?: string }): Promise<MemoryItem[]> {
    try {
      let result = await this.loadMemoryItemsFromGateway();
      if (filter?.category && filter.category !== "all") {
        result = result.filter((m) => m.category === filter.category);
      }
      if (filter?.search) {
        const q = filter.search.toLowerCase();
        result = result.filter(
          (m) =>
            m.content.toLowerCase().includes(q) ||
            m.tags.some((tag) => tag.toLowerCase().includes(q)),
        );
      }
      return result;
    } catch {
      let result = [...memories];
      if (filter?.category && filter.category !== "all") {
        result = result.filter((m) => m.category === filter.category);
      }
      if (filter?.search) {
        const q = filter.search.toLowerCase();
        result = result.filter(
          (m) =>
            m.content.toLowerCase().includes(q) ||
            m.tags.some((tag) => tag.toLowerCase().includes(q)),
        );
      }
      return result;
    }
  }

  async getMemoryCount(): Promise<number> {
    try {
      const items = await this.loadMemoryItemsFromGateway();
      return items.length;
    } catch {
      return memories.length;
    }
  }

  async getPersonaTraits(): Promise<PersonaTrait[]> {
    try {
      const snapshot = await this.loadSnapshot();
      const defaultAgentId = resolveDefaultAgentId(snapshot);
      const soulFile = await this.getAgentFile(defaultAgentId, "SOUL.md");
      const identity = await this.request<JsonRecord>("agent.identity.get", { agentId: defaultAgentId });
      const identityText = [asString(identity.name), asString(identity.emoji), asString(identity.avatar)].join(" ");
      const baseText = `${soulFile.content}\n${identityText}`.toLowerCase();

      return [
        {
          key: "warmth",
          label: "温暖度",
          value: scoreByKeywords(baseText, ["温柔", "温暖", "陪伴", "安抚", "抱抱"], 0.45, 0.45),
          description: "对话中传递温暖和关怀的程度",
        },
        {
          key: "playfulness",
          label: "趣味性",
          value: scoreByKeywords(baseText, ["轻松", "玩笑", "俏皮", "嘿嘿", "幽默"], 0.35, 0.45),
          description: "幽默、调皮和轻松表达的倾向",
        },
        {
          key: "curiosity",
          label: "好奇心",
          value: scoreByKeywords(baseText, ["好奇", "探索", "学习", "新事物"], 0.4, 0.45),
          description: "对用户话题展现探索兴趣的程度",
        },
        {
          key: "empathy",
          label: "共情力",
          value: scoreByKeywords(baseText, ["共情", "理解", "感受", "情绪", "陪你"], 0.5, 0.42),
          description: "理解和回应用户情绪的能力",
        },
        {
          key: "directness",
          label: "直率度",
          value: scoreByKeywords(baseText, ["结论", "步骤", "风险", "直接", "高效"], 0.36, 0.5),
          description: "技术讨论时直接给出答案的倾向",
        },
        {
          key: "creativity",
          label: "创造力",
          value: scoreByKeywords(baseText, ["创意", "表达", "变化", "波动", "模板"], 0.33, 0.45),
          description: "生成创意内容和独特表达的能力",
        },
      ];
    } catch {
      return [...personaTraits];
    }
  }

  async getVoiceVariants(): Promise<VoiceVariant[]> {
    try {
      const snapshot = await this.loadSnapshot();
      const defaultAgentId = resolveDefaultAgentId(snapshot);
      const soulFile = await this.getAgentFile(defaultAgentId, "SOUL.md");
      const text = soulFile.content.toLowerCase();
      const modeTechnical = /技术\/排障模式|结论\s*->\s*步骤/.test(text);

      const variants: VoiceVariant[] = [];
      if (/闲聊|情感模式|高甜/.test(text)) {
        variants.push({ key: "warm", label: "温暖", description: "情感支持和日常陪伴风格", isDefault: !modeTechnical });
      }
      if (/技术\/排障模式|降甜|步骤/.test(text)) {
        variants.push({ key: "focused", label: "专注", description: "技术任务模式，强调结论与执行步骤", isDefault: modeTechnical });
      }
      if (/安抚|抱抱|我陪你/.test(text)) {
        variants.push({ key: "gentle", label: "轻柔", description: "安抚情绪时更柔和稳定", isDefault: false });
      }
      if (/轻松互动|玩笑|俏皮/.test(text)) {
        variants.push({ key: "witty", label: "机智", description: "轻度俏皮和幽默表达", isDefault: false });
      }

      if (variants.length === 0) {
        variants.push(...voiceVariants.map((item) => ({ ...item })));
      }
      if (!variants.some((item) => item.isDefault) && variants[0]) {
        variants[0].isDefault = true;
      }
      return variants;
    } catch {
      return [...voiceVariants];
    }
  }

  async getVerbalTics(): Promise<string[]> {
    try {
      const snapshot = await this.loadSnapshot();
      const defaultAgentId = resolveDefaultAgentId(snapshot);
      const soulFile = await this.getAgentFile(defaultAgentId, "SOUL.md");
      const text = soulFile.content;

      const picked = new Set<string>();
      const quoteMatches = [
        ...text.matchAll(/“([^”]{2,32})”/g),
        ...text.matchAll(/"([^"\n]{2,32})"/g),
      ];
      for (const match of quoteMatches) {
        const candidate = (match[1] ?? "").trim();
        if (candidate) {
          picked.add(candidate);
        }
      }

      if (picked.size === 0) {
        for (const line of text.split(/\r?\n/)) {
          const candidate = line.replace(/^[-*+]\s*/, "").trim();
          if (candidate.length >= 4 && candidate.length <= 24 && !candidate.startsWith("#")) {
            if (/[，。；！？,.!?]/.test(candidate)) {
              picked.add(candidate.split(/[，。；！？,.!?]/)[0].trim());
            }
          }
          if (picked.size >= 10) break;
        }
      }

      const result = Array.from(picked).slice(0, 10);
      return result.length > 0 ? result : [...verbalTics];
    } catch {
      return [...verbalTics];
    }
  }

  async getCoreValues(): Promise<ValueItem[]> {
    try {
      const snapshot = await this.loadSnapshot();
      const defaultAgentId = resolveDefaultAgentId(snapshot);
      const soulFile = await this.getAgentFile(defaultAgentId, "SOUL.md");
      const values = parseCoreValuesFromSoul(soulFile.content);
      if (values.length > 0) {
        return values;
      }
      return [...coreValues];
    } catch {
      return [...coreValues];
    }
  }

  async getTopicHandling(): Promise<Record<string, unknown>> {
    try {
      const snapshot = await this.loadSnapshot();
      return {
        enthusiastic: asArray(asRecord(snapshot.status)?.channelSummary).slice(0, 5),
        neutral: [],
        careful: asArray(asRecord(snapshot.status)?.queuedSystemEvents).slice(0, 5),
      };
    } catch {
      return { ...topicHandling };
    }
  }

  async getSoulDoc(): Promise<string> {
    try {
      const snapshot = await this.loadSnapshot();
      const defaultAgentId = resolveDefaultAgentId(snapshot);
      const soulFile = await this.getAgentFile(defaultAgentId, "SOUL.md");
      if (soulFile.content) {
        return soulFile.content;
      }
      return soulDocPreview;
    } catch {
      return soulDocPreview;
    }
  }

  async getAgents(): Promise<AgentNode[]> {
    try {
      const snapshot = await this.loadSnapshot();
      const status = asRecord(snapshot.status);
      const statusSessions = asRecord(status?.sessions);
      const byAgent = asArray(statusSessions?.byAgent)
        .map((item) => asRecord(item))
        .filter((item): item is JsonRecord => Boolean(item));
      const recentByAgent = new Map<string, JsonRecord[]>();
      for (const item of byAgent) {
        const agentId = asString(item.agentId);
        if (!agentId) continue;
        const recent = asArray(item.recent)
          .map((row) => asRecord(row))
          .filter((row): row is JsonRecord => Boolean(row));
        recentByAgent.set(agentId, recent);
      }

      const defaults = asRecord(statusSessions?.defaults);
      const defaultModel = asString(defaults?.model) || "default";

      const agentsList = asRecord(snapshot.agentsList);
      const rows = asArray(agentsList?.agents)
        .map((row) => asRecord(row))
        .filter((row): row is JsonRecord => Boolean(row));

      const nodes = rows.map((row) => {
        const id = asString(row.id) || "unknown";
        const name = asString(row.name) || id;
        const identity = asRecord(row.identity);
        const label = asString(identity?.name) || name;
        const description = asString(identity?.theme) || `${label} 协作节点`;
        const recent = recentByAgent.get(id) ?? [];

        let latestAt: number | null = null;
        for (const item of recent) {
          const at = asNumber(item.updatedAt);
          if (at != null && (latestAt == null || at > latestAt)) {
            latestAt = at;
          }
        }

        const ageMs = latestAt == null ? Number.POSITIVE_INFINITY : Date.now() - latestAt;
        const nodeStatus: AgentNode["status"] =
          ageMs < 20 * 60_000 ? "active" : ageMs < 4 * 60 * 60_000 ? "idle" : "error";

        const recentRow = recent[0];
        const model = asString(recentRow?.model) || defaultModel;

        return {
          id,
          name,
          label,
          description,
          model,
          status: nodeStatus,
          triggers: recent
            .map((item) => asString(item.key))
            .filter(Boolean)
            .slice(0, 3),
          color: hashToColor(id),
        } satisfies AgentNode;
      });

      return nodes.length > 0 ? nodes : [...agents];
    } catch {
      return [...agents];
    }
  }

  async getRoutingRules(): Promise<RoutingRule[]> {
    try {
      const snapshot = await this.loadSnapshot();
      const configRules = parseRoutingRulesFromConfig(snapshot.config);
      if (configRules.length > 0) {
        return configRules;
      }

      const agentNodes = await this.getAgents();
      return agentNodes.map((node, index) => ({
        id: `derived-${node.id}`,
        pattern: `agent:${node.id}:*`,
        target: node.name,
        priority: index + 1,
        enabled: true,
      }));
    } catch {
      return [...routingRules];
    }
  }

  async getRecentDispatches(): Promise<DispatchRecord[]> {
    try {
      const snapshot = await this.loadSnapshot();
      const status = asRecord(snapshot.status);
      const sessions = asRecord(status?.sessions);
      const byAgent = asArray(sessions?.byAgent)
        .map((item) => asRecord(item))
        .filter((item): item is JsonRecord => Boolean(item));

      const rows: Array<{ at: number; row: DispatchRecord }> = [];

      for (const item of byAgent) {
        const agentId = asString(item.agentId);
        const recent = asArray(item.recent)
          .map((entry) => asRecord(entry))
          .filter((entry): entry is JsonRecord => Boolean(entry));

        for (const entry of recent.slice(0, 6)) {
          const updatedAt = asNumber(entry.updatedAt) ?? Date.now();
          const flags = asArray(entry.flags).map((flag) => asString(flag));
          const failed = flags.some((flag) => flag.includes("aborted"));
          const totalTokens = asNumber(entry.totalTokens);

          rows.push({
            at: updatedAt,
            row: {
              id: `dispatch-${agentId}-${asString(entry.key)}-${updatedAt}`,
              agent: agentId || "main",
              trigger: asString(entry.key) || "session-update",
              time: toClockLabel(updatedAt),
              duration: totalTokens != null ? `${Math.round(totalTokens)} tokens` : "--",
              result: failed ? "failed" : "success",
            },
          });
        }
      }

      rows.sort((a, b) => b.at - a.at);
      const mapped = rows.slice(0, 16).map((entry) => entry.row);
      return mapped.length > 0 ? mapped : [...recentDispatches];
    } catch {
      return [...recentDispatches];
    }
  }

  async getTtsStatus(): Promise<GatewayTtsStatus> {
    const status = await this.request<JsonRecord>("tts.status", {});
    const provider = asString(status.provider).toLowerCase();
    const fallbackRows = asArray(status.fallbackProviders)
      .map((row) => asString(row).toLowerCase())
      .filter((row): row is TtsProviderId => row === "openai" || row === "elevenlabs" || row === "edge");
    return {
      enabled: status.enabled === true,
      auto:
        asString(status.auto) === "always" || asString(status.auto) === "inbound" || asString(status.auto) === "tagged"
          ? (asString(status.auto) as GatewayTtsStatus["auto"])
          : "off",
      provider: provider === "openai" || provider === "elevenlabs" || provider === "edge" ? provider : "edge",
      fallbackProviders: fallbackRows,
      hasOpenAIKey: status.hasOpenAIKey === true,
      hasElevenLabsKey: status.hasElevenLabsKey === true,
      edgeEnabled: status.edgeEnabled !== false,
    };
  }

  async setTtsProvider(provider: TtsProviderId): Promise<TtsProviderId> {
    await this.request<JsonRecord>("tts.setProvider", { provider });
    return provider;
  }

  async convertTtsInlineAudio(
    text: string,
    options?: {
      channel?: string;
      maxInlineBytes?: number;
    },
  ): Promise<GatewayTtsInlineAudio> {
    const payload: JsonRecord = {
      text,
      inline: true,
      maxInlineBytes: Math.max(32_768, Math.floor(options?.maxInlineBytes ?? TTS_INLINE_MAX_BYTES)),
    };
    const channel = asString(options?.channel);
    if (channel) {
      payload.channel = channel;
    }

    const result = await this.request<JsonRecord>("tts.convert", payload);
    const inline = asRecord(result.audioInline);
    const data = asString(inline?.data);
    if (inline && data) {
      return {
        provider: asString(result.provider) || "unknown",
        outputFormat: asString(result.outputFormat) || "unknown",
        voiceCompatible: result.voiceCompatible === true,
        mimeType: asString(inline.mimeType) || "audio/mpeg",
        bytes: Math.max(0, Math.floor(asNumber(inline.bytes) ?? 0)),
        base64: data,
      };
    }

    const audioPath = asString(result.audioPath);
    if (!audioPath) {
      throw new Error("gateway tts.convert missing audio output");
    }
    return {
      provider: asString(result.provider) || "unknown",
      outputFormat: asString(result.outputFormat) || "unknown",
      voiceCompatible: result.voiceCompatible === true,
      audioPath,
    };
  }

  async loadTtsAudioBlob(audioPath: string): Promise<Blob> {
    const response = await fetch(`/__savc/tts-file?path=${encodeURIComponent(audioPath)}`);
    if (!response.ok) {
      throw new Error(`tts file fetch failed (${response.status})`);
    }
    return await response.blob();
  }

  async getStorageStatus(): Promise<StorageStatus> {
    const now = Date.now();
    if (this.storageStatusCache && now - this.storageStatusCache.at < 3_000) {
      return this.storageStatusCache.data;
    }
    try {
      const payload = await this.requestStorageJson<JsonRecord>("/__savc/storage/status");
      const status = asRecord(payload) ?? {};
      const modeObj = asRecord(status.mode) ?? {};
      const componentsObj = asRecord(status.components) ?? {};
      const metricsObj = asRecord(status.metrics) ?? {};
      const pathsObj = asRecord(status.paths) ?? {};
      const pickComponent = (key: string, engine: string): StorageStatus["components"]["sqlite"] => {
        const row = asRecord(componentsObj[key]) ?? {};
        const stateRaw = asString(row.state);
        const state: StorageStatus["components"]["sqlite"]["state"] =
          stateRaw === "online" || stateRaw === "degraded" || stateRaw === "offline" || stateRaw === "disabled"
            ? stateRaw
            : "offline";
        return {
          name: asString(row.name) || key,
          engine: asString(row.engine) || engine,
          configured: row.configured !== false,
          state,
          message: asString(row.message) || "",
          latencyMs: asNumber(row.latencyMs),
        };
      };
      const snapshot: StorageStatus = {
        generatedAt: asString(status.generatedAt) || new Date().toISOString(),
        mode: {
          primary: asString(modeObj.primary) === "sqlite" ? "sqlite" : "memory",
          cache: asString(modeObj.cache) === "redis" ? "redis" : "memory",
          backup: "yaml",
        },
        components: {
          sqlite: pickComponent("sqlite", "node:sqlite"),
          cache: pickComponent("cache", "memory"),
          mysql: pickComponent("mysql", "mysql"),
          yaml: pickComponent("yaml", "yaml"),
        },
        metrics: {
          runtimeLogCount: Math.max(0, Math.floor(asNumber(metricsObj.runtimeLogCount) ?? 0)),
          kvCount: Math.max(0, Math.floor(asNumber(metricsObj.kvCount) ?? 0)),
          cacheEntries: Math.max(0, Math.floor(asNumber(metricsObj.cacheEntries) ?? 0)),
        },
        paths: {
          sqlite: asString(pathsObj.sqlite) || "-",
          yamlBackup: asString(pathsObj.yamlBackup) || "-",
        },
      };
      this.storageStatusCache = { at: now, data: snapshot };
      return snapshot;
    } catch {
      const fallback = fallbackStorageStatus();
      this.storageStatusCache = { at: now, data: fallback };
      return fallback;
    }
  }

  async getStorageRuntimeLogs(limit = 60): Promise<StorageRuntimeLog[]> {
    const now = Date.now();
    const safeLimit = clamp(Math.floor(limit), 1, 200);
    if (this.storageLogsCache && now - this.storageLogsCache.at < 2_500) {
      return this.storageLogsCache.data.slice(0, safeLimit);
    }
    try {
      const payload = await this.requestStorageJson<JsonRecord>(`/__savc/storage/logs?limit=${safeLimit}`);
      const logs = asArray(payload.logs)
        .map((item) => asRecord(item))
        .filter((item): item is JsonRecord => Boolean(item))
        .map((item, index) => ({
          id: Math.floor(asNumber(item.id) ?? index + 1),
          level: asString(item.level) || "info",
          subsystem: asString(item.subsystem) || "system",
          message: asString(item.message) || "-",
          context: asRecord(item.context) ?? {},
          createdAt: asString(item.createdAt) || new Date().toISOString(),
        } satisfies StorageRuntimeLog));
      const rows = logs.length > 0 ? logs : fallbackStorageLogs();
      this.storageLogsCache = { at: now, data: rows };
      return rows.slice(0, safeLimit);
    } catch {
      const fallback = fallbackStorageLogs();
      this.storageLogsCache = { at: now, data: fallback };
      return fallback.slice(0, safeLimit);
    }
  }

  async sendChatMessage(message: string): Promise<string> {
    const sessionKey = defaultSessionKey();
    const initialHistory = await this.request<JsonRecord>("chat.history", {
      sessionKey,
      limit: 120,
    });
    const baseline = latestAssistantMessage(asArray(initialHistory.messages));
    const baselineSignature = baseline?.signature ?? "";

    const runId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    await this.request("chat.send", {
      sessionKey,
      message,
      deliver: false,
      idempotencyKey: runId,
    });

    const deadline = Date.now() + CHAT_REPLY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await wait(CHAT_POLL_INTERVAL_MS);
      try {
        const history = await this.request<JsonRecord>("chat.history", {
          sessionKey,
          limit: 120,
        });
        const latest = latestAssistantMessage(asArray(history.messages));
        if (latest && latest.signature !== baselineSignature) {
          return latest.text;
        }
      } catch {
        // continue polling until timeout
      }
    }

    throw new Error("chat reply timeout");
  }
}

/**
 * Gateway data client
 *
 * 1) 优先走真实网关数据
 * 2) 网关不可用时兜底到本地样例数据，避免页面空白
 */
export const gateway = new GatewayDataClient();
