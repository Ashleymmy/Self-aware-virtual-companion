import { html, type TemplateResult } from "lit";
import { GatewayBrowserClient } from "../gateway-ws.js";

type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

type LogEntry = {
  raw: string;
  time?: string | null;
  level?: LogLevel | null;
  subsystem?: string | null;
  message: string;
  meta?: Record<string, unknown>;
};

type LogsTailPayload = {
  file?: string;
  cursor?: number;
  size?: number;
  lines?: unknown;
  truncated?: boolean;
  reset?: boolean;
};

const DEFAULT_GATEWAY_URL = "ws://127.0.0.1:18789";
const DEFAULT_LOG_LIMIT = 300;
const DEFAULT_LOG_MAX_BYTES = 250_000;
const LOG_BUFFER_LIMIT = 2_000;
const POLL_INTERVAL_MS = 3_000;
const STATUS_REFRESH_EVERY_TICK = 5;
const LOG_STREAM_ID = "savc-log-stream";
const LEVELS: LogLevel[] = ["trace", "debug", "info", "warn", "error", "fatal"];

const _levelFilters: Record<LogLevel, boolean> = {
  trace: true,
  debug: true,
  info: true,
  warn: true,
  error: true,
  fatal: true,
};

let _client: GatewayBrowserClient | null = null;
let _connected = false;
let _connecting = false;
let _gatewayError: string | null = null;
let _status: Record<string, unknown> | null = null;
let _health: Record<string, unknown> | null = null;

let _loadingStatus = false;
let _loadingLogs = false;
let _logsFile: string | null = null;
let _logsCursor: number | null = null;
let _logsTruncated = false;
let _logsEntries: LogEntry[] = [];
let _lastSyncAt: number | null = null;
let _pollTick = 0;

let _filterText = "";
let _autoFollow = true;

let _pollTimer: ReturnType<typeof setInterval> | null = null;
let _requestUpdate: (() => void) | null = null;

function readEnv(name: keyof ImportMetaEnv): string {
  const raw = import.meta.env[name];
  return typeof raw === "string" ? raw.trim() : "";
}

function toErrorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeLevel(value: unknown): LogLevel | null {
  if (typeof value !== "string") {
    return null;
  }
  const lowered = value.toLowerCase() as LogLevel;
  return LEVELS.includes(lowered) ? lowered : null;
}

function parseMaybeJsonString(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return asRecord(parsed);
  } catch {
    return null;
  }
}

function parseLogLine(line: string): LogEntry {
  if (!line.trim()) {
    return { raw: line, message: line };
  }
  try {
    const obj = JSON.parse(line) as Record<string, unknown>;
    const meta =
      obj && typeof obj._meta === "object" && obj._meta !== null
        ? (obj._meta as Record<string, unknown>)
        : null;
    const time =
      typeof obj.time === "string" ? obj.time : typeof meta?.date === "string" ? meta.date : null;
    const level = normalizeLevel(meta?.logLevelName ?? meta?.level);

    const contextCandidate =
      typeof obj["0"] === "string" ? obj["0"] : typeof meta?.name === "string" ? meta.name : null;
    const contextObj = parseMaybeJsonString(contextCandidate);
    let subsystem: string | null = null;
    if (contextObj) {
      if (typeof contextObj.subsystem === "string") {
        subsystem = contextObj.subsystem;
      } else if (typeof contextObj.module === "string") {
        subsystem = contextObj.module;
      }
    }
    if (!subsystem && contextCandidate && contextCandidate.length < 120) {
      subsystem = contextCandidate;
    }

    let message: string | null = null;
    if (typeof obj["1"] === "string") {
      message = obj["1"];
    } else if (!contextObj && typeof obj["0"] === "string") {
      message = obj["0"];
    } else if (typeof obj.message === "string") {
      message = obj.message;
    }

    return {
      raw: line,
      time,
      level,
      subsystem,
      message: message ?? line,
      meta: meta ?? undefined,
    };
  } catch {
    return { raw: line, message: line };
  }
}

function formatTime(value?: string | null): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString("zh-CN", { hour12: false });
}

function formatSince(value: number | null): string {
  if (!value) {
    return "尚未同步";
  }
  return new Date(value).toLocaleTimeString("zh-CN", { hour12: false });
}

function formatUptime(ms: number | null): string {
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

function matchesFilter(entry: LogEntry, needle: string): boolean {
  if (!needle) {
    return true;
  }
  const haystack = [entry.message, entry.subsystem, entry.raw]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

function resolveGatewayWsUrl(): string {
  const configured = readEnv("VITE_SAVC_GATEWAY_URL");
  if (!configured) {
    return DEFAULT_GATEWAY_URL;
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

function ensureClient() {
  if (_client) {
    return;
  }

  const url = resolveGatewayWsUrl();
  const token = readEnv("VITE_SAVC_GATEWAY_TOKEN") || undefined;

  _connecting = true;
  _gatewayError = null;

  _client = new GatewayBrowserClient({
    url,
    token,
    clientName: "savc-ui",
    mode: "webchat",
    onHello: () => {
      _connected = true;
      _connecting = false;
      _gatewayError = null;
      void refreshStatusAndHealth();
      void refreshLogs({ reset: _logsCursor == null, quiet: true });
      _requestUpdate?.();
    },
    onClose: ({ code, reason }) => {
      _connected = false;
      _connecting = false;
      _gatewayError = `网关断开 (${code}): ${reason || "no reason"}`;
      _requestUpdate?.();
    },
    onGap: ({ expected, received }) => {
      _gatewayError = `事件序号缺失 (expected ${expected}, got ${received})`;
      _requestUpdate?.();
    },
  });
  _client.start();
}

async function refreshStatusAndHealth() {
  if (!_client || !_connected || _loadingStatus) {
    return;
  }
  _loadingStatus = true;
  try {
    const [status, health] = await Promise.all([
      _client.request<Record<string, unknown>>("status", {}),
      _client.request<Record<string, unknown>>("health", {}),
    ]);
    _status = status;
    _health = health;
    _lastSyncAt = Date.now();
    _gatewayError = null;
  } catch (error) {
    _gatewayError = toErrorText(error);
  } finally {
    _loadingStatus = false;
    _requestUpdate?.();
  }
}

async function refreshLogs(opts: { reset?: boolean; quiet?: boolean } = {}) {
  if (!_client || !_connected || _loadingLogs) {
    return;
  }
  _loadingLogs = true;
  try {
    const res = await _client.request<LogsTailPayload>("logs.tail", {
      cursor: opts.reset ? undefined : (_logsCursor ?? undefined),
      limit: DEFAULT_LOG_LIMIT,
      maxBytes: DEFAULT_LOG_MAX_BYTES,
    });
    const lines = Array.isArray(res.lines)
      ? res.lines.filter((line): line is string => typeof line === "string")
      : [];
    const entries = lines.map(parseLogLine);
    const shouldReset = Boolean(opts.reset || res.reset || _logsCursor == null);
    _logsEntries = shouldReset
      ? entries
      : [..._logsEntries, ...entries].slice(-LOG_BUFFER_LIMIT);
    if (typeof res.cursor === "number") {
      _logsCursor = res.cursor;
    }
    if (typeof res.file === "string") {
      _logsFile = res.file;
    }
    _logsTruncated = Boolean(res.truncated);
    _lastSyncAt = Date.now();
    _gatewayError = null;
    if (_autoFollow) {
      requestAnimationFrame(() => {
        const node = document.getElementById(LOG_STREAM_ID);
        if (node) {
          node.scrollTop = node.scrollHeight;
        }
      });
    }
  } catch (error) {
    _gatewayError = toErrorText(error);
  } finally {
    _loadingLogs = false;
    if (!opts.quiet) {
      _requestUpdate?.();
    }
  }
}

function startPolling() {
  if (_pollTimer) {
    return;
  }
  _pollTick = 0;
  _pollTimer = setInterval(() => {
    if (!_client || !_connected) {
      return;
    }
    _pollTick += 1;
    if (_pollTick % STATUS_REFRESH_EVERY_TICK === 0) {
      void refreshStatusAndHealth();
    }
    void refreshLogs({ quiet: true });
  }, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }
}

function sessionCount(): number | null {
  const sessions = asRecord(_status?.sessions);
  const count = sessions ? readNumber(sessions.count) : null;
  return count == null ? null : Math.max(0, Math.floor(count));
}

function channelCount(): number | null {
  const channelOrder = _health?.channelOrder;
  if (Array.isArray(channelOrder)) {
    return channelOrder.length;
  }
  const channels = asRecord(_health?.channels);
  return channels ? Object.keys(channels).length : null;
}

function healthUptime(): number | null {
  const uptimeMs = readNumber(_health?.uptimeMs);
  if (uptimeMs != null) {
    return uptimeMs;
  }
  const snapshot = asRecord(_health?.snapshot);
  return readNumber(snapshot?.uptimeMs);
}

function filteredEntries(): LogEntry[] {
  const needle = _filterText.trim().toLowerCase();
  return _logsEntries.filter((entry) => {
    if (entry.level && !_levelFilters[entry.level]) {
      return false;
    }
    return matchesFilter(entry, needle);
  });
}

function toggleLevel(level: LogLevel, enabled: boolean) {
  _levelFilters[level] = enabled;
  _requestUpdate?.();
}

function onLogScroll(event: Event) {
  const element = event.currentTarget as HTMLElement | null;
  if (!element) {
    return;
  }
  const remain = element.scrollHeight - element.scrollTop - element.clientHeight;
  _autoFollow = remain < 36;
}

export function activateLogsView(requestUpdate: () => void) {
  _requestUpdate = requestUpdate;
  ensureClient();
  startPolling();
  if (_connected) {
    void refreshStatusAndHealth();
    void refreshLogs({ quiet: true });
  }
}

export function deactivateLogsView() {
  stopPolling();
  _requestUpdate = null;
  if (_client) {
    _client.stop();
    _client = null;
  }
  _connected = false;
  _connecting = false;
}

export function renderLogs(requestUpdate: () => void): TemplateResult {
  if (!_client) {
    activateLogsView(requestUpdate);
  }

  const entries = filteredEntries();
  const sessions = sessionCount();
  const channels = channelCount();
  const uptime = formatUptime(healthUptime());
  const backend = resolveGatewayWsUrl();

  return html`
    <div class="stat-grid">
      <div class="stat">
        <div class="stat-label">网关连接</div>
        <div class="stat-value ${_connected ? "ok" : "warn"}">
          ${_connected ? "已连接" : (_connecting ? "连接中" : "未连接")}
        </div>
      </div>
      <div class="stat">
        <div class="stat-label">会话数</div>
        <div class="stat-value">${sessions ?? "--"}</div>
      </div>
      <div class="stat">
        <div class="stat-label">通道数</div>
        <div class="stat-value">${channels ?? "--"}</div>
      </div>
      <div class="stat">
        <div class="stat-label">运行时长</div>
        <div class="stat-value">${uptime}</div>
      </div>
    </div>

    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">运行日志</div>
          <div class="card-sub">实时 Tail 网关文件日志（logs.tail）</div>
        </div>
        <div class="row" style="gap: 8px;">
          <button class="btn" ?disabled=${_loadingStatus || _loadingLogs} @click=${() => void refreshStatusAndHealth()}>
            ${_loadingStatus ? "同步中..." : "同步状态"}
          </button>
          <button class="btn" ?disabled=${_loadingLogs} @click=${() => void refreshLogs()}>
            ${_loadingLogs ? "加载中..." : "刷新日志"}
          </button>
          <button class="btn" @click=${() => {
            _logsCursor = null;
            _logsEntries = [];
            void refreshLogs({ reset: true });
          }}>
            重置游标
          </button>
        </div>
      </div>

      <div class="filters" style="margin-top: 14px;">
        <label class="field" style="min-width: 220px;">
          <span>过滤关键词</span>
          <input
            .value=${_filterText}
            @input=${(event: Event) => {
              _filterText = (event.target as HTMLInputElement).value;
              requestUpdate();
            }}
            placeholder="搜索日志文本"
          />
        </label>
        <label class="field checkbox">
          <span>自动跟随</span>
          <input
            type="checkbox"
            .checked=${_autoFollow}
            @change=${(event: Event) => {
              _autoFollow = (event.target as HTMLInputElement).checked;
              requestUpdate();
            }}
          />
        </label>
      </div>

      <div class="chip-row" style="margin-top: 12px;">
        ${LEVELS.map(
          (level) => html`
            <label class="chip log-chip ${level}">
              <input
                type="checkbox"
                .checked=${_levelFilters[level]}
                @change=${(event: Event) => toggleLevel(level, (event.target as HTMLInputElement).checked)}
              />
              <span>${level}</span>
            </label>
          `,
        )}
      </div>

      <div class="status-list" style="margin-top: 12px;">
        <div><span class="muted">网关地址</span><span class="mono">${backend}</span></div>
        <div><span class="muted">日志文件</span><span class="mono">${_logsFile ?? "--"}</span></div>
        <div><span class="muted">最后同步</span><span>${formatSince(_lastSyncAt)}</span></div>
      </div>

      ${_logsTruncated
        ? html`<div class="callout" style="margin-top: 10px;">日志输出已截断，仅展示最新区块。</div>`
        : ""}
      ${_gatewayError
        ? html`<div class="callout danger" style="margin-top: 10px;">${_gatewayError}</div>`
        : ""}

      <div id=${LOG_STREAM_ID} class="log-stream" style="margin-top: 12px;" @scroll=${onLogScroll}>
        ${entries.length === 0
          ? html`<div class="muted" style="padding: 12px;">暂无日志。</div>`
          : entries.map(
              (entry) => html`
                <div class="log-row">
                  <div class="log-time mono">${formatTime(entry.time)}</div>
                  <div class="log-level ${entry.level ?? ""}">${entry.level ?? ""}</div>
                  <div class="log-subsystem mono">${entry.subsystem ?? ""}</div>
                  <div class="log-message mono">${entry.message || entry.raw}</div>
                </div>
              `,
            )}
      </div>
    </section>

    <div class="grid grid-cols-2">
      <section class="card">
        <div class="card-title">Status 快照</div>
        <div class="card-sub">来自网关 status 方法。</div>
        <pre class="code-block" style="margin-top: 12px;">${JSON.stringify(_status ?? {}, null, 2)}</pre>
      </section>
      <section class="card">
        <div class="card-title">Health 快照</div>
        <div class="card-sub">来自网关 health 方法。</div>
        <pre class="code-block" style="margin-top: 12px;">${JSON.stringify(_health ?? {}, null, 2)}</pre>
      </section>
    </div>
  `;
}
