import { html, svg, type TemplateResult } from "lit";
import {
  invokeLive2DInteraction,
  type InvokeLive2DInteractionResult,
  type Live2DInteractionType,
} from "../live2d-bridge.js";
import { Live2DRuntime, type Live2DRuntimeStatus } from "../live2d-runtime.js";
import { gateway, type AgentNode, type RoutingRule, type DispatchRecord } from "../mock/index.js";

let _agents: AgentNode[] = [];
let _rules: RoutingRule[] = [];
let _dispatches: DispatchRecord[] = [];
let _loaded = false;

type BridgeStatus = "idle" | "sending" | "ok" | "error";

interface InteractionLogItem {
  id: string;
  time: string;
  type: Live2DInteractionType;
  motion: string;
  emotion: string;
  backend: string;
  status: "ok" | "error";
  message: string;
}

const INTERACTION_BUTTONS: Array<{
  type: Live2DInteractionType;
  label: string;
  intensity: number;
}> = [
  { type: "tap", label: "点击", intensity: 1.0 },
  { type: "double_tap", label: "双击", intensity: 1.2 },
  { type: "long_press", label: "长按", intensity: 1.1 },
  { type: "drag", label: "拖动", intensity: 1.15 },
  { type: "hover", label: "悬停", intensity: 0.85 },
];

const INTERACTION_LABELS: Record<Live2DInteractionType, string> = {
  tap: "点击",
  double_tap: "双击",
  long_press: "长按",
  drag: "拖动",
  hover: "悬停",
};

const DOUBLE_TAP_WINDOW_MS = 280;
const LONG_PRESS_MS = 520;
const DRAG_THRESHOLD_PX = 18;

let _bridgeStatus: BridgeStatus = "idle";
let _bridgeMessage = "等待交互事件";
let _bridgeLastResult: InvokeLive2DInteractionResult | null = null;
let _bridgeLogs: InteractionLogItem[] = [];

let _runtime: Live2DRuntime | null = null;
let _runtimeBootstrapping = false;
let _runtimeStatus: Live2DRuntimeStatus = {
  ready: false,
  mode: "fallback",
  modelName: "yuanyuan-lite-fallback",
  source: "idle",
  emotion: "neutral",
  motion: "idle",
  updatedAt: new Date().toISOString(),
};

let _activePointerId: number | null = null;
let _pointerStartX = 0;
let _pointerStartY = 0;
let _pointerDragging = false;
let _longPressTriggered = false;
let _longPressTimer: ReturnType<typeof setTimeout> | undefined;
let _lastTapAt = 0;
let _pendingTapTimer: ReturnType<typeof setTimeout> | undefined;
let _lastHoverAt = 0;

async function loadData() {
  [_agents, _rules, _dispatches] = await Promise.all([
    gateway.getAgents(),
    gateway.getRoutingRules(),
    gateway.getRecentDispatches(),
  ]);
  _loaded = true;
}

function nowLabel(): string {
  return new Date().toLocaleTimeString("zh-CN", { hour12: false });
}

function clearLongPressTimer() {
  if (_longPressTimer) {
    clearTimeout(_longPressTimer);
    _longPressTimer = undefined;
  }
}

function clearPendingTapTimer() {
  if (_pendingTapTimer) {
    clearTimeout(_pendingTapTimer);
    _pendingTapTimer = undefined;
  }
}

function resetPointerState() {
  _activePointerId = null;
  _pointerDragging = false;
  _longPressTriggered = false;
  clearLongPressTimer();
}

function pushInteractionLog(item: InteractionLogItem) {
  _bridgeLogs = [item, ..._bridgeLogs].slice(0, 8);
}

async function triggerInteraction(
  interactionType: Live2DInteractionType,
  intensity: number,
  requestUpdate: () => void,
) {
  if (_bridgeStatus === "sending") return;

  _bridgeStatus = "sending";
  _bridgeMessage = `发送 ${INTERACTION_LABELS[interactionType]} 事件...`;
  requestUpdate();

  const result = await invokeLive2DInteraction({
    interactionType,
    intensity,
  });

  _bridgeLastResult = result;
  _bridgeStatus = result.ok ? "ok" : "error";
  const motion = String(result.signal.motion || "idle");
  const emotion = String(result.signal.emotion || "neutral");
  const backend = result.backend === "gateway" ? "gateway" : "mock";
  const summary = result.ok
    ? `${INTERACTION_LABELS[interactionType]} 已触发（${backend}）`
    : `${INTERACTION_LABELS[interactionType]} 触发失败，已回退 mock`;
  _bridgeMessage = summary;

  _runtime?.applySignal(result.signal);

  pushInteractionLog({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    time: nowLabel(),
    type: interactionType,
    motion,
    emotion,
    backend,
    status: result.ok ? "ok" : "error",
    message: result.error || summary,
  });
  requestUpdate();
}

function ensureRuntime(requestUpdate: () => void) {
  if (_runtime && !_runtime.isDestroyed()) {
    return;
  }
  if (_runtimeBootstrapping) return;
  _runtimeBootstrapping = true;

  queueMicrotask(() => {
    const canvas = document.getElementById("savc-live2d-stage");
    if (!(canvas instanceof HTMLCanvasElement)) {
      _runtimeBootstrapping = false;
      return;
    }
    try {
      _runtime = new Live2DRuntime(canvas, {
        onStatus: (status) => {
          _runtimeStatus = status;
          requestUpdate();
        },
      });
      _runtimeStatus = _runtime.getStatus();
    } catch (error) {
      _bridgeStatus = "error";
      _bridgeMessage = `Live2D runtime 初始化失败: ${error instanceof Error ? error.message : String(error)}`;
    }
    _runtimeBootstrapping = false;
    requestUpdate();
  });
}

function onPointerDown(event: PointerEvent, requestUpdate: () => void) {
  if (!event.isPrimary) return;
  _activePointerId = event.pointerId;
  _pointerStartX = event.clientX;
  _pointerStartY = event.clientY;
  _pointerDragging = false;
  _longPressTriggered = false;
  clearLongPressTimer();
  _longPressTimer = setTimeout(() => {
    _longPressTriggered = true;
    void triggerInteraction("long_press", 1.1, requestUpdate);
  }, LONG_PRESS_MS);
}

function onPointerMove(event: PointerEvent, requestUpdate: () => void) {
  if (!event.isPrimary || _activePointerId !== event.pointerId || _longPressTriggered) return;
  const dx = event.clientX - _pointerStartX;
  const dy = event.clientY - _pointerStartY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (!_pointerDragging && distance >= DRAG_THRESHOLD_PX) {
    _pointerDragging = true;
    clearLongPressTimer();
    const intensity = Math.max(0.8, Math.min(1.5, 1 + distance / 180));
    void triggerInteraction("drag", intensity, requestUpdate);
  }
}

function onPointerUp(event: PointerEvent, requestUpdate: () => void) {
  if (!event.isPrimary || _activePointerId !== event.pointerId) return;
  clearLongPressTimer();

  if (!_pointerDragging && !_longPressTriggered) {
    const now = Date.now();
    if (_lastTapAt > 0 && now - _lastTapAt <= DOUBLE_TAP_WINDOW_MS) {
      _lastTapAt = 0;
      clearPendingTapTimer();
      void triggerInteraction("double_tap", 1.2, requestUpdate);
    } else {
      _lastTapAt = now;
      clearPendingTapTimer();
      _pendingTapTimer = setTimeout(() => {
        _pendingTapTimer = undefined;
        void triggerInteraction("tap", 1.0, requestUpdate);
      }, DOUBLE_TAP_WINDOW_MS);
    }
  }

  resetPointerState();
}

function onPointerCancel() {
  resetPointerState();
}

function onHover(requestUpdate: () => void) {
  const now = Date.now();
  if (now - _lastHoverAt < 1200) return;
  _lastHoverAt = now;
  void triggerInteraction("hover", 0.85, requestUpdate);
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

function renderLive2DBridge(requestUpdate: () => void): TemplateResult {
  const signal = _bridgeLastResult?.signal;
  const interactionType = String(signal?.interaction?.type || "none");
  const interactionIntensity = signal?.interaction?.intensity;
  const statusColor =
    _bridgeStatus === "ok"
      ? "var(--ok)"
      : _bridgeStatus === "error"
        ? "var(--danger)"
        : _bridgeStatus === "sending"
          ? "var(--warn)"
          : "var(--muted)";
  const backendLabel =
    _bridgeLastResult?.backend === "gateway" ? "gateway" : _bridgeLastResult?.backend === "mock" ? "mock" : "-";

  return html`
    <div class="card savc-orchestrator" data-accent style="animation: rise 0.35s var(--ease-out) 0.08s backwards;">
      <div class="card-title">Live2D 交互桥接（M-F4）</div>
      <div class="card-sub">
        点击/双击/长按/拖动/悬停测试区会触发 <span class="mono">savc_live2d_signal</span>。默认为 auto 模式：网关失败自动回退 mock。
      </div>

      <div style="margin-top: 14px; display: grid; gap: 12px;">
        <div
          style="border: 1px dashed var(--border-strong); border-radius: var(--radius-lg); padding: 14px; background: linear-gradient(135deg, var(--secondary), var(--card)); touch-action: none; user-select: none;"
          @pointerdown=${(event: PointerEvent) => onPointerDown(event, requestUpdate)}
          @pointermove=${(event: PointerEvent) => onPointerMove(event, requestUpdate)}
          @pointerup=${(event: PointerEvent) => onPointerUp(event, requestUpdate)}
          @pointercancel=${() => onPointerCancel()}
          @mouseleave=${() => onPointerCancel()}
          @mouseenter=${() => onHover(requestUpdate)}
        >
          <div style="display: grid; justify-items: center; gap: 8px; min-height: 150px; align-content: center;">
            <div
              style="width: 72px; height: 72px; border-radius: 999px; background: radial-gradient(circle at 35% 35%, rgba(20,184,166,0.45), rgba(20,184,166,0.06)); border: 1px solid rgba(20,184,166,0.35); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.05), 0 10px 20px rgba(0,0,0,0.22);"
            ></div>
            <div style="font-size: 13px; color: var(--text); font-weight: 500;">Live2D 交互测试区</div>
            <div style="font-size: 12px; color: var(--muted);">支持：点击 / 双击 / 长按 / 拖动 / 悬停</div>
            <div style="font-size: 12px; color: ${statusColor}; font-family: var(--mono);">${_bridgeMessage}</div>
          </div>
        </div>

        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          ${INTERACTION_BUTTONS.map(
            (item) => html`
              <button
                class="btn btn--sm"
                ?disabled=${_bridgeStatus === "sending"}
                @click=${() => void triggerInteraction(item.type, item.intensity, requestUpdate)}
              >
                ${item.label}
              </button>
            `,
          )}
        </div>

        <div class="table">
          <div class="table-head" style="grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr;">
            <span>source</span>
            <span>emotion</span>
            <span>motion</span>
            <span>interaction</span>
            <span>intensity</span>
            <span>backend</span>
          </div>
          <div class="table-row" style="grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr;">
            <span class="mono">${signal?.source ?? "-"}</span>
            <span class="mono">${signal?.emotion ?? "-"}</span>
            <span class="mono">${signal?.motion ?? "-"}</span>
            <span class="mono">${interactionType}</span>
            <span class="mono">${typeof interactionIntensity === "number" ? interactionIntensity.toFixed(2) : "-"}</span>
            <span class="mono">${backendLabel}</span>
          </div>
        </div>

        <div class="list">
          ${_bridgeLogs.length === 0
            ? html`
                <div class="list-item" style="grid-template-columns: 1fr;">
                  <div class="list-sub">暂无交互日志</div>
                </div>
              `
            : _bridgeLogs.map(
                (item) => html`
                  <div class="list-item" style="grid-template-columns: 1fr auto;">
                    <div class="list-main">
                      <div class="list-title">
                        <span class="chip" style="padding: 1px 7px; font-size: 10px;">${INTERACTION_LABELS[item.type]}</span>
                        <span class="mono" style="margin-left: 8px;">${item.motion} · ${item.emotion}</span>
                      </div>
                      <div class="list-sub">
                        ${item.time} · ${item.backend} · ${item.message}
                      </div>
                    </div>
                    <span class="chip ${item.status === "ok" ? "chip-ok" : "chip-warn"}" style="padding: 2px 8px; font-size: 10px;">
                      ${item.status === "ok" ? "成功" : "降级"}
                    </span>
                  </div>
                `,
              )}
        </div>
      </div>
    </div>
  `;
}

function renderLive2DRuntimeCard(): TemplateResult {
  const runtimeUpdated = _runtimeStatus.updatedAt
    ? new Date(_runtimeStatus.updatedAt).toLocaleTimeString("zh-CN", { hour12: false })
    : "-";
  return html`
    <div class="card savc-orchestrator" data-accent style="animation: rise 0.32s var(--ease-out) 0.02s backwards;">
      <div class="card-title">Live2D Runtime（M-F1）</div>
      <div class="card-sub">
        已接入前端运行时渲染：加载模型清单（manifest）并驱动待机动画。交互信号会直接驱动画布形象状态。
      </div>
      <div style="margin-top: 14px; border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; background: var(--bg-elevated);">
        <canvas id="savc-live2d-stage" style="display: block; width: 100%; height: 270px;"></canvas>
      </div>
      <div class="table" style="margin-top: 12px;">
        <div class="table-head" style="grid-template-columns: 0.9fr 0.8fr 1fr 0.8fr 0.8fr 0.9fr;">
          <span>ready</span>
          <span>mode</span>
          <span>model</span>
          <span>source</span>
          <span>emotion</span>
          <span>updated</span>
        </div>
        <div class="table-row" style="grid-template-columns: 0.9fr 0.8fr 1fr 0.8fr 0.8fr 0.9fr;">
          <span class="mono">${_runtimeStatus.ready ? "yes" : "no"}</span>
          <span class="mono">${_runtimeStatus.mode}</span>
          <span class="mono">${_runtimeStatus.modelName}</span>
          <span class="mono">${_runtimeStatus.source}</span>
          <span class="mono">${_runtimeStatus.emotion}</span>
          <span class="mono">${runtimeUpdated}</span>
        </div>
      </div>
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

  ensureRuntime(requestUpdate);

  return html`
    ${renderLive2DRuntimeCard()}
    ${renderTopology()}
    ${renderLive2DBridge(requestUpdate)}
    ${renderRules()}
    ${renderDispatches()}
  `;
}
