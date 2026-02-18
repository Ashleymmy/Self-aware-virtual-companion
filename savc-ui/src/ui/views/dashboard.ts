import { html, type TemplateResult } from "lit";
import { gateway, type DashboardStats, type YuanyuanStatus, type RecentActivity } from "../data/index.js";

let _stats: DashboardStats | null = null;
let _yuanyuan: YuanyuanStatus | null = null;
let _activities: RecentActivity[] = [];
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
    [_stats, _yuanyuan, _activities] = await Promise.all([
      gateway.getDashboardStats(),
      gateway.getYuanyuanStatus(),
      gateway.getRecentActivities(),
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
  `;
}
