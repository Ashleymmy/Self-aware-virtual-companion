import { html, type TemplateResult } from "lit";
import {
  gateway,
  type DashboardStats,
  type YuanyuanStatus,
  type RecentActivity,
  type StorageRuntimeLog,
  type StorageStatus,
} from "../data/index.js";

let _stats: DashboardStats | null = null;
let _yuanyuan: YuanyuanStatus | null = null;
let _activities: RecentActivity[] = [];
let _storageStatus: StorageStatus | null = null;
let _storageLogs: StorageRuntimeLog[] = [];
let _loaded = false;
let _loading = false;
let _lastLoadedAt = "";

async function loadData(force = false) {
  if (_loading) return;
  _loading = true;
  try {
    if (force) {
      gateway.invalidateCache();
    }
    [_stats, _yuanyuan, _activities, _storageStatus, _storageLogs] = await Promise.all([
      gateway.getDashboardStats(),
      gateway.getYuanyuanStatus(),
      gateway.getRecentActivities(),
      gateway.getStorageStatus(),
      gateway.getStorageRuntimeLogs(8),
    ]);
    _loaded = true;
    _lastLoadedAt = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  } finally {
    _loading = false;
  }
}

function activityIcon(type: RecentActivity["type"]): string {
  switch (type) {
    case "chat": return "💬";
    case "memory": return "🧠";
    case "agent": return "🤖";
    case "system": return "⚙️";
  }
}

function stateLabel(state: "online" | "degraded" | "offline" | "disabled"): string {
  if (state === "online") return "在线";
  if (state === "degraded") return "降级";
  if (state === "disabled") return "未启用";
  return "离线";
}

function stateColor(state: "online" | "degraded" | "offline" | "disabled"): string {
  if (state === "online") return "var(--ok)";
  if (state === "degraded") return "var(--warn)";
  if (state === "disabled") return "var(--muted)";
  return "var(--danger)";
}

export function renderDashboard(requestUpdate: () => void): TemplateResult {
  if (!_loaded) {
    if (!_loading) {
      void loadData().then(() => requestUpdate());
    }
    return html`
      <div class="config-loading" style="padding: 60px;">
        <div class="config-loading__spinner"></div>
        <span>加载仪表盘数据...</span>
      </div>
    `;
  }

  const stats = _stats!;
  const yy = _yuanyuan!;
  const storage = _storageStatus;
  const storageLogs = _storageLogs.slice(0, 5);
  const components = storage
    ? [
        storage.components.sqlite,
        storage.components.cache,
        storage.components.mysql,
        storage.components.yaml,
      ]
    : [];

  return html`
    <div class="card" style="margin-bottom: 14px; animation: rise 0.3s var(--ease-out) backwards;">
      <div style="display: flex; gap: 12px; justify-content: space-between; align-items: center; flex-wrap: wrap;">
        <div>
          <div class="card-title">实时数据</div>
          <div class="card-sub">上次刷新 ${_lastLoadedAt || "--"} · 网关优先，失败自动回退样例</div>
        </div>
        <button
          class="btn btn--sm"
          ?disabled=${_loading}
          @click=${() => {
            void loadData(true).then(() => requestUpdate());
            requestUpdate();
          }}
        >
          ${_loading ? "刷新中..." : "刷新"}
        </button>
      </div>
    </div>

    <!-- 统计卡片 -->
    <div class="stat-grid">
      <div class="stat card-lift stagger-1" style="animation: rise 0.35s var(--ease-out) backwards">
        <div class="stat-label">系统状态</div>
        <div class="stat-value ok stat-value-animate">${stats.status === "online" ? "正常" : "离线"}</div>
      </div>
      <div class="stat card-lift stagger-2" style="animation: rise 0.35s var(--ease-out) backwards">
        <div class="stat-label">运行时间</div>
        <div class="stat-value stat-value-animate">${stats.uptime}</div>
      </div>
      <div class="stat card-lift stagger-3" style="animation: rise 0.35s var(--ease-out) backwards">
        <div class="stat-label">活跃会话</div>
        <div class="stat-value stat-value-animate">${stats.activeSessions}</div>
      </div>
      <div class="stat card-lift stagger-4" style="animation: rise 0.35s var(--ease-out) backwards">
        <div class="stat-label">记忆数量</div>
        <div class="stat-value stat-value-animate">${stats.memoryCount}</div>
      </div>
      <div class="stat card-lift stagger-5" style="animation: rise 0.35s var(--ease-out) backwards">
        <div class="stat-label">消息总数</div>
        <div class="stat-value stat-value-animate">${stats.totalMessages.toLocaleString()}</div>
      </div>
      <div class="stat card-lift stagger-6" style="animation: rise 0.35s var(--ease-out) backwards">
        <div class="stat-label">Agent 数量</div>
        <div class="stat-value stat-value-animate">${stats.agentCount}</div>
      </div>
    </div>

    <div class="grid grid-cols-2">
      <!-- 媛媛状态 -->
      <div class="card savc-companion" data-accent style="animation: rise 0.4s var(--ease-out) 0.15s backwards">
        <div class="card-title">媛媛状态</div>
        <div class="status-list" style="margin-top: 12px;">
          <div><span class="muted">情绪</span><span>${yy.moodEmoji} ${yy.mood}</span></div>
          <div><span class="muted">模式</span><span>${yy.activeMode === "casual" ? "日常闲聊" : "技术工作"}</span></div>
          <div><span class="muted">最近互动</span><span>${yy.lastInteraction}</span></div>
          <div><span class="muted">性格概要</span><span style="font-size: 12px;">${yy.personalitySummary}</span></div>
        </div>
      </div>

      <!-- 最近活动 -->
      <div class="card" style="animation: rise 0.4s var(--ease-out) 0.2s backwards">
        <div class="card-title">最近活动</div>
        <div class="list" style="margin-top: 12px;">
          ${_activities.slice(0, 6).map(
            (a, i) => html`
              <div class="list-item" style="grid-template-columns: 1fr; animation: rise 0.3s var(--ease-out) ${i * 40}ms backwards">
                <div class="list-main">
                  <div class="list-title" style="display: flex; gap: 8px; align-items: center;">
                    <span style="font-size: 14px;">${activityIcon(a.type)}</span>
                    <span>${a.message}</span>
                  </div>
                  <div class="list-sub">
                    ${a.agent ? html`<span class="chip" style="padding: 2px 8px; font-size: 11px;">${a.agent}</span>` : ""}
                    ${a.time}
                  </div>
                </div>
              </div>
            `,
          )}
        </div>
      </div>
    </div>

    <div class="grid grid-cols-2">
      <div class="card" style="animation: rise 0.4s var(--ease-out) 0.25s backwards">
        <div class="card-title">数据库与存储服务</div>
        <div class="card-sub">SQLite 主存 · Cache(${storage?.mode.cache ?? "memory"}) · MySQL 预留 · YAML 容灾</div>
        <div class="status-list" style="margin-top: 12px;">
          ${components.length > 0
            ? components.map((row) => html`
                <div>
                  <span class="muted">${row.name} (${row.engine})</span>
                  <span style="display:inline-flex;align-items:center;gap:6px;">
                    <span style="width:6px;height:6px;border-radius:50%;background:${stateColor(row.state)};"></span>
                    <span>${stateLabel(row.state)}</span>
                    ${row.latencyMs != null ? html`<span class="mono" style="font-size:11px;">${row.latencyMs}ms</span>` : ""}
                  </span>
                </div>
              `)
            : html`<div><span class="muted">storage</span><span>未加载</span></div>`}
        </div>
        ${storage
          ? html`
              <div style="margin-top:10px;font-size:12px;color:var(--muted);display:grid;gap:4px;">
                <div>日志条目: <span class="mono">${storage.metrics.runtimeLogCount}</span> · KV: <span class="mono">${storage.metrics.kvCount}</span></div>
                <div>SQLite: <span class="mono">${storage.paths.sqlite}</span></div>
                <div>YAML: <span class="mono">${storage.paths.yamlBackup}</span></div>
              </div>
            `
          : ""}
      </div>

      <div class="card" style="animation: rise 0.4s var(--ease-out) 0.3s backwards">
        <div class="card-title">存储运行日志</div>
        <div class="card-sub">来自 /__savc/storage/logs</div>
        <div class="list" style="margin-top: 12px;">
          ${storageLogs.length > 0
            ? storageLogs.map((item) => html`
                <div class="list-item" style="grid-template-columns:1fr;">
                  <div class="list-main">
                    <div class="list-title" style="display:flex;gap:8px;align-items:center;">
                      <span class="chip" style="padding:2px 8px;font-size:11px;">${item.level}</span>
                      <span>${item.message}</span>
                    </div>
                    <div class="list-sub">
                      <span class="mono">${item.subsystem}</span>
                      ${new Date(item.createdAt).toLocaleTimeString("zh-CN", { hour12: false })}
                    </div>
                  </div>
                </div>
              `)
            : html`
                <div class="list-item" style="grid-template-columns:1fr;">
                  <div class="list-main">
                    <div class="list-title">暂无日志</div>
                    <div class="list-sub">等待存储服务产生事件</div>
                  </div>
                </div>
              `}
        </div>
      </div>
    </div>
  `;
}
