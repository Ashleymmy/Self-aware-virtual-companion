import { html, svg, type TemplateResult } from "lit";
import { gateway, type AgentNode, type RoutingRule, type DispatchRecord } from "../mock/index.js";

let _agents: AgentNode[] = [];
let _rules: RoutingRule[] = [];
let _dispatches: DispatchRecord[] = [];
let _loaded = false;

async function loadData() {
  [_agents, _rules, _dispatches] = await Promise.all([
    gateway.getAgents(),
    gateway.getRoutingRules(),
    gateway.getRecentDispatches(),
  ]);
  _loaded = true;
}

function renderTopology(): TemplateResult {
  const orchestrator = _agents.find((a) => a.id === "orchestrator");
  const children = _agents.filter((a) => a.id !== "orchestrator");
  const cx = 300, cy = 60;
  const radius = 140;
  const count = children.length;

  return html`
    <div class="card savc-orchestrator" data-accent style="animation: rise 0.3s var(--ease-out) backwards">
      <div class="card-title">Agent 拓扑图</div>
      <div class="card-sub">展示编排器与子 Agent 的连接关系</div>
      <svg class="topology-svg" viewBox="0 0 600 340" style="margin-top: 12px;">
        <!-- 连线 -->
        ${children.map((_, i) => {
          const angle = (Math.PI / (count + 1)) * (i + 1);
          const x2 = cx + Math.cos(angle) * radius * 1.6;
          const y2 = cy + Math.sin(angle) * radius * 1.5;
          return svg`
            <line
              class="topology-edge ${_.status === 'active' ? 'active' : ''}"
              x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}"
            />
          `;
        })}
        <!-- 编排器节点 -->
        <g class="topology-node" transform="translate(${cx}, ${cy})">
          <circle r="28" fill="${orchestrator?.color ?? 'var(--accent)'}" opacity="0.2" />
          <circle r="20" fill="${orchestrator?.color ?? 'var(--accent)'}" opacity="0.9" />
          <text text-anchor="middle" dy="4" fill="white" font-size="10" font-weight="600">编排</text>
          <text text-anchor="middle" dy="48" fill="var(--text)" font-size="11" font-weight="500">${orchestrator?.label ?? "编排器"}</text>
        </g>
        <!-- 子节点 -->
        ${children.map((agent, i) => {
          const angle = (Math.PI / (count + 1)) * (i + 1);
          const x = cx + Math.cos(angle) * radius * 1.6;
          const y = cy + Math.sin(angle) * radius * 1.5;
          return svg`
            <g class="topology-node" transform="translate(${x}, ${y})">
              <circle r="22" fill="${agent.color}" opacity="0.15" />
              <circle r="16" fill="${agent.color}" opacity="0.9" />
              <circle r="4" cx="16" cy="-12" fill="${agent.status === 'active' ? 'var(--ok)' : 'var(--muted)'}" />
              <text text-anchor="middle" dy="36" fill="var(--text)" font-size="11" font-weight="500">${agent.label}</text>
              <text text-anchor="middle" dy="50" fill="var(--muted)" font-size="9">${agent.status === 'active' ? '活跃' : '空闲'}</text>
            </g>
          `;
        })}
      </svg>
    </div>
  `;
}

function renderRules(): TemplateResult {
  return html`
    <div class="card" style="animation: rise 0.35s var(--ease-out) 0.1s backwards">
      <div class="card-title">路由规则</div>
      <div class="card-sub">基于意图匹配将请求分发到对应 Agent</div>
      <div class="table" style="margin-top: 12px;">
        <div class="table-head" style="grid-template-columns: 2fr 1fr 0.5fr 0.5fr;">
          <span>匹配模式</span>
          <span>目标 Agent</span>
          <span>优先级</span>
          <span>状态</span>
        </div>
        ${_rules.map(
          (r) => html`
            <div class="table-row" style="grid-template-columns: 2fr 1fr 0.5fr 0.5fr;">
              <span class="mono" style="font-size: 12px;">${r.pattern}</span>
              <span>${_agents.find((a) => a.name === r.target)?.label ?? r.target}</span>
              <span class="mono">${r.priority}</span>
              <span>
                <span class="statusDot ${r.enabled ? "ok" : ""}" style="width: 6px; height: 6px; display: inline-block;"></span>
              </span>
            </div>
          `,
        )}
      </div>
    </div>
  `;
}

function renderDispatches(): TemplateResult {
  return html`
    <div class="card" style="animation: rise 0.4s var(--ease-out) 0.2s backwards">
      <div class="card-title">最近调度</div>
      <div class="card-sub">近期的 Agent 调度记录</div>
      <div class="list" style="margin-top: 12px;">
        ${_dispatches.map(
          (d) => html`
            <div class="list-item" style="grid-template-columns: 1fr auto;">
              <div class="list-main">
                <div class="list-title" style="display: flex; gap: 8px; align-items: center;">
                  <span class="chip" style="padding: 2px 8px; font-size: 10px; background: ${_agents.find((a) => a.name === d.agent)?.color ?? 'var(--secondary)'}22; color: ${_agents.find((a) => a.name === d.agent)?.color ?? 'var(--muted)'};">
                    ${_agents.find((a) => a.name === d.agent)?.label ?? d.agent}
                  </span>
                  ${d.trigger}
                </div>
                <div class="list-sub">${d.time} · ${d.duration}</div>
              </div>
              <div>
                <span class="chip ${d.result === "success" ? "chip-ok" : d.result === "failed" ? "chip-warn" : ""}" style="padding: 2px 8px; font-size: 10px;">
                  ${d.result === "success" ? "成功" : d.result === "failed" ? "失败" : "等待"}
                </span>
              </div>
            </div>
          `,
        )}
      </div>
    </div>
  `;
}

export function renderOrchestrator(requestUpdate: () => void): TemplateResult {
  if (!_loaded) {
    loadData().then(() => requestUpdate());
    return html`
      <div class="config-loading" style="padding: 60px;">
        <div class="config-loading__spinner"></div>
        <span>加载编排数据...</span>
      </div>
    `;
  }

  return html`
    ${renderTopology()}
    ${renderRules()}
    ${renderDispatches()}
  `;
}
