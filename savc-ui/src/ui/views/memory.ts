import { html, type TemplateResult } from "lit";
import { gateway, type MemoryItem } from "../data/index.js";
import { icons } from "../icons.js";

let _memories: MemoryItem[] = [];
let _filtered: MemoryItem[] = [];
let _loaded = false;
let _loading = false;
let _searchQuery = "";
let _activeCategory = "all";
let _expandedIds = new Set<string>();
let _lastLoadedAt = "";

const CATEGORIES = [
  { key: "all", label: "全部" },
  { key: "episodic", label: "情景" },
  { key: "semantic", label: "语义" },
  { key: "emotional", label: "情感" },
  { key: "procedural", label: "程序" },
  { key: "preference", label: "偏好" },
];

async function loadData(force = false) {
  if (_loading) return;
  _loading = true;
  try {
    if (force) {
      gateway.invalidateCache();
    }
    _memories = await gateway.getMemories();
    applyFilter();
    _loaded = true;
    _lastLoadedAt = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  } finally {
    _loading = false;
  }
}

function applyFilter() {
  _filtered = _memories.filter((m) => {
    const catMatch = _activeCategory === "all" || m.category === _activeCategory;
    const searchMatch = !_searchQuery || m.content.toLowerCase().includes(_searchQuery.toLowerCase()) || m.tags.some((t) => t.toLowerCase().includes(_searchQuery.toLowerCase()));
    return catMatch && searchMatch;
  });
  _filtered.sort((a, b) => b.importance - a.importance);
}

function importanceClass(v: number): string {
  if (v >= 0.8) return "high";
  if (v >= 0.5) return "medium";
  return "low";
}

function categoryLabel(cat: string): string {
  const found = CATEGORIES.find((c) => c.key === cat);
  return found?.label ?? cat;
}

export function renderMemory(requestUpdate: () => void): TemplateResult {
  if (!_loaded) {
    if (!_loading) {
      void loadData().then(() => requestUpdate());
    }
    return html`
      <div class="config-loading" style="padding: 60px;">
        <div class="config-loading__spinner"></div>
        <span>加载记忆数据...</span>
      </div>
    `;
  }

  return html`
    <!-- 搜索与筛选 -->
    <div class="card" style="animation: rise 0.3s var(--ease-out) backwards">
      <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
        <div class="field" style="flex: 1; min-width: 200px;">
          <input
            type="text"
            placeholder="搜索记忆内容或标签..."
            .value=${_searchQuery}
            @input=${(e: Event) => {
              _searchQuery = (e.target as HTMLInputElement).value;
              applyFilter();
              requestUpdate();
            }}
            style="width: 100%;"
          />
        </div>
        <div class="filters">
          ${CATEGORIES.map(
            (cat) => html`
              <button
                class="chip ${_activeCategory === cat.key ? "chip-ok" : ""}"
                @click=${() => {
                  _activeCategory = cat.key;
                  applyFilter();
                  requestUpdate();
                }}
              >
                ${cat.label}
              </button>
            `,
          )}
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
      <div style="margin-top: 10px; font-size: 12px; color: var(--muted);">
        共 ${_memories.length} 条记忆，当前显示 ${_filtered.length} 条 · 上次刷新 ${_lastLoadedAt || "--"}
      </div>
    </div>

    <!-- 记忆列表 -->
    <div class="list list-stagger">
      ${_filtered.length === 0
        ? html`
            <div class="card" style="text-align: center; padding: 40px; color: var(--muted);">
              没有找到匹配的记忆
            </div>
          `
        : _filtered.map(
            (m) => html`
              <div
                class="list-item list-item-clickable"
                style="grid-template-columns: 1fr; cursor: pointer;"
                @click=${() => {
                  if (_expandedIds.has(m.id)) _expandedIds.delete(m.id);
                  else _expandedIds.add(m.id);
                  requestUpdate();
                }}
              >
                <div class="list-main">
                  <div style="display: flex; justify-content: space-between; align-items: start; gap: 12px;">
                    <div class="list-title">${m.content}</div>
                    <span class="chip" style="padding: 2px 8px; font-size: 10px; flex-shrink: 0;">
                      ${categoryLabel(m.category)}
                    </span>
                  </div>
                  <div style="margin-top: 6px;">
                    <div class="importance-bar" style="width: 100%; max-width: 200px;">
                      <div class="importance-bar__fill ${importanceClass(m.importance)}" style="width: ${m.importance * 100}%"></div>
                    </div>
                  </div>
                  ${_expandedIds.has(m.id)
                    ? html`
                        <div style="margin-top: 10px; display: grid; gap: 6px; font-size: 12px; color: var(--muted); animation: rise 0.2s var(--ease-out);">
                          <div>重要度: <span class="mono">${(m.importance * 100).toFixed(0)}%</span></div>
                          <div>创建: ${m.createdAt} | 最近访问: ${m.lastAccessed} | 访问 ${m.accessCount} 次</div>
                          <div>来源: ${m.source}</div>
                          <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px;">
                            ${m.tags.map((tag) => html`<span class="chip" style="padding: 1px 6px; font-size: 10px;">${tag}</span>`)}
                          </div>
                        </div>
                      `
                    : ""}
                  <div class="list-sub" style="margin-top: 4px;">
                    ${m.tags.slice(0, 3).map((tag) => html`<span class="chip" style="padding: 1px 6px; font-size: 10px; margin-right: 4px;">${tag}</span>`)}
                    ${!_expandedIds.has(m.id) ? html`<span style="font-size: 11px;">· ${m.createdAt}</span>` : ""}
                  </div>
                </div>
              </div>
            `,
          )}
    </div>
  `;
}
