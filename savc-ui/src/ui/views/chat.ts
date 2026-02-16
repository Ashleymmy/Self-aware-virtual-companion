import { html, type TemplateResult } from "lit";
import { publishLive2DSignal, subscribeLive2DChannel, type Live2DChannelEvent } from "../live2d-channel.js";
import { invokeLive2DSignal, invokeLive2DVoice, type InvokeLive2DInteractionResult } from "../live2d-bridge.js";
import { Live2DRuntime, type Live2DRuntimeStatus } from "../live2d-runtime.js";

type ChatRole = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  time: string;
}

let _bootstrapped = false;
let _messages: ChatMessage[] = [];
let _draft = "";
let _sending = false;
let _speaking = false;
let _speakEnabled = true;
let _statusMessage = "等待消息";

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

let _channelSubscribed = false;
let _channelUnsubscribe: (() => void) | null = null;
let _channelActive: Live2DChannelEvent | null = null;
let _channelEvents: Live2DChannelEvent[] = [];
let _lastAppliedEventId = "";

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function nowLabel(): string {
  return new Date().toLocaleTimeString("zh-CN", { hour12: false });
}

function createMessage(role: ChatRole, text: string): ChatMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
    time: nowLabel(),
  };
}

function inferEmotion(input: string): string {
  if (/(难过|伤心|低落|焦虑|累)/i.test(input)) return "comfort";
  if (/(开心|高兴|太棒|激动|哈哈)/i.test(input)) return "happy";
  if (/(计划|安排|总结|推进|任务)/i.test(input)) return "focused";
  if (/(为什么|怎么|分析|解释)/i.test(input)) return "thinking";
  return "comfort";
}

function buildAssistantReply(input: string): { text: string; emotion: string } {
  const trimmed = input.trim();
  const emotion = inferEmotion(trimmed);
  if (!trimmed) {
    return {
      text: "我在这儿，随时可以继续聊。",
      emotion,
    };
  }
  if (/(计划|任务|推进|下一步)/i.test(trimmed)) {
    return {
      text: "收到。我们把任务拆成最小可交付单元，先完成一个可验证步骤，再进入下一步。",
      emotion: "focused",
    };
  }
  if (/(累|烦|焦虑|压力|难受)/i.test(trimmed)) {
    return {
      text: "辛苦了。我先陪你把事情按轻重分层，最紧急的一件我和你一起先处理掉。",
      emotion: "comfort",
    };
  }
  if (/(你好|哈喽|在吗)/i.test(trimmed)) {
    return {
      text: "我在，今天想先聊聊近况，还是直接推进当前项目？",
      emotion: "happy",
    };
  }
  return {
    text: `我理解你的意思了：${trimmed}。如果你愿意，我可以继续给你一个可直接执行的下一步。`,
    emotion,
  };
}

function applyVoiceStyle(utterance: SpeechSynthesisUtterance, emotion: string) {
  utterance.lang = "zh-CN";
  utterance.rate = emotion === "focused" ? 1.02 : emotion === "happy" ? 1.06 : 0.98;
  utterance.pitch = emotion === "happy" ? 1.12 : emotion === "thinking" ? 0.96 : 1.02;
  utterance.volume = 1;
}

async function speakReply(
  text: string,
  emotion: string,
  requestUpdate: () => void,
): Promise<void> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    _statusMessage = "当前浏览器不支持语音播放（已保留 Live2D 语音信号）";
    return;
  }

  await new Promise<void>((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    applyVoiceStyle(utterance, emotion);
    _speaking = true;
    _statusMessage = "语音播报中...";
    requestUpdate();

    utterance.onend = () => {
      _speaking = false;
      _statusMessage = "语音播报完成";
      requestUpdate();
      resolve();
    };
    utterance.onerror = () => {
      _speaking = false;
      _statusMessage = "语音播报失败";
      requestUpdate();
      resolve();
    };

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
}

function sourceLabel(source: Live2DChannelEvent["source"]): string {
  if (source === "voice") return "语音";
  if (source === "interaction") return "交互";
  if (source === "text") return "文本";
  return "系统";
}

function publishResult(
  source: Live2DChannelEvent["source"],
  result: InvokeLive2DInteractionResult,
  note: string,
  requestUpdate: () => void,
) {
  publishLive2DSignal({
    source,
    backend: result.backend,
    ok: result.ok,
    note,
    signal: result.signal,
  });
  _statusMessage = result.error || `${sourceLabel(source)}信号已发布（${result.backend}）`;
  requestUpdate();
}

function ensureChannelSubscription(requestUpdate: () => void) {
  if (_channelSubscribed) return;
  _channelSubscribed = true;
  _channelUnsubscribe = subscribeLive2DChannel((snapshot) => {
    _channelActive = snapshot.active;
    _channelEvents = snapshot.events;
    if (_runtime && !_runtime.isDestroyed() && snapshot.active && snapshot.active.id !== _lastAppliedEventId) {
      _runtime.applySignal(snapshot.active.signal);
      _lastAppliedEventId = snapshot.active.id;
    }
    requestUpdate();
  });
}

function ensureRuntime(requestUpdate: () => void) {
  if (_runtime && !_runtime.isDestroyed()) return;
  if (_runtimeBootstrapping) return;
  _runtimeBootstrapping = true;

  queueMicrotask(() => {
    const canvas = document.getElementById("savc-chat-live2d-stage");
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
      const latest = _channelActive;
      if (latest && latest.id !== _lastAppliedEventId) {
        _runtime.applySignal(latest.signal);
        _lastAppliedEventId = latest.id;
      }
    } catch (error) {
      _statusMessage = `runtime 初始化失败: ${error instanceof Error ? error.message : String(error)}`;
    }
    _runtimeBootstrapping = false;
    requestUpdate();
  });
}

function ensureBootstrap() {
  if (_bootstrapped) return;
  _bootstrapped = true;
  _messages = [
    createMessage("assistant", "欢迎回来。你可以直接发消息，我会同时驱动 Live2D 文本/语音信号。"),
  ];
}

async function sendMessage(requestUpdate: () => void) {
  if (_sending) return;
  const message = _draft.trim();
  if (!message) return;

  _messages = [..._messages, createMessage("user", message)];
  _draft = "";
  _sending = true;
  _statusMessage = "处理中...";
  requestUpdate();

  await wait(260);

  const assistant = buildAssistantReply(message);
  _messages = [..._messages, createMessage("assistant", assistant.text)];
  requestUpdate();

  const textSignal = await invokeLive2DSignal({
    source: "text",
    message: assistant.text,
    emotion: assistant.emotion,
  });
  publishResult("text", textSignal, "assistant-text", requestUpdate);

  if (_speakEnabled) {
    const voiceSignal = await invokeLive2DVoice({
      message: assistant.text,
      emotion: assistant.emotion,
      energy: 0.95,
    });
    publishResult("voice", voiceSignal, "assistant-voice", requestUpdate);
    await speakReply(assistant.text, assistant.emotion, requestUpdate);
  }

  _sending = false;
  if (!_speaking) {
    _statusMessage = "待命";
  }
  requestUpdate();
}

function renderMessages(): TemplateResult {
  return html`
    <div class="chat-thread" style="min-height: 240px; max-height: 380px;">
      ${_messages.map(
        (item) => html`
          <div class="chat-group ${item.role === "user" ? "user" : ""}">
            <div class="chat-avatar ${item.role === "user" ? "user" : "assistant"}">${item.role === "user" ? "你" : "媛"}</div>
            <div class="chat-group-messages">
              <div class="chat-bubble fade-in">
                <div class="chat-text">${item.text}</div>
              </div>
              <div class="chat-group-footer">
                <span class="chat-sender-name">${item.role === "user" ? "你" : "媛媛"}</span>
                <span class="chat-group-timestamp">${item.time}</span>
              </div>
            </div>
          </div>
        `,
      )}
      ${_sending
        ? html`
            <div class="chat-group">
              <div class="chat-avatar assistant">媛</div>
              <div class="chat-group-messages">
                <div class="chat-bubble streaming">
                  <div class="chat-text">正在整理回复...</div>
                </div>
              </div>
            </div>
          `
        : ""}
    </div>
  `;
}

function renderChannelPreview(): TemplateResult {
  return html`
    <div class="table" style="margin-top: 10px;">
      <div class="table-head" style="grid-template-columns: 0.8fr 0.8fr 1fr 1fr 0.7fr;">
        <span>source</span>
        <span>backend</span>
        <span>emotion</span>
        <span>motion</span>
        <span>ok</span>
      </div>
      <div class="table-row" style="grid-template-columns: 0.8fr 0.8fr 1fr 1fr 0.7fr;">
        <span class="mono">${_channelActive?.source ?? "-"}</span>
        <span class="mono">${_channelActive?.backend ?? "-"}</span>
        <span class="mono">${_channelActive?.signal.emotion ?? "-"}</span>
        <span class="mono">${_channelActive?.signal.motion ?? "-"}</span>
        <span class="mono">${typeof _channelActive?.ok === "boolean" ? (_channelActive.ok ? "yes" : "no") : "-"}</span>
      </div>
    </div>
  `;
}

function renderChannelTimeline(): TemplateResult {
  return html`
    <div class="list" style="margin-top: 12px;">
      ${_channelEvents.slice(0, 8).map(
        (event) => html`
          <div class="list-item" style="grid-template-columns: 1fr auto;">
            <div class="list-main">
              <div class="list-title">
                <span class="chip" style="padding: 1px 7px; font-size: 10px;">${sourceLabel(event.source)}</span>
                <span class="mono" style="margin-left: 8px;">
                  ${event.signal.motion} · ${event.signal.emotion}
                </span>
              </div>
              <div class="list-sub">
                ${new Date(event.at).toLocaleTimeString("zh-CN", { hour12: false })} · ${event.note}
              </div>
            </div>
            <span class="chip ${event.ok ? "chip-ok" : "chip-warn"}" style="padding: 2px 8px; font-size: 10px;">
              ${event.backend}
            </span>
          </div>
        `,
      )}
      ${_channelEvents.length === 0
        ? html`
            <div class="list-item" style="grid-template-columns: 1fr;">
              <div class="list-sub">暂无通道事件</div>
            </div>
          `
        : ""}
    </div>
  `;
}

export function renderChat(requestUpdate: () => void): TemplateResult {
  ensureBootstrap();
  ensureChannelSubscription(requestUpdate);
  ensureRuntime(requestUpdate);

  return html`
    <div class="grid grid-cols-2">
      <div class="card savc-companion" data-accent>
        <div class="card-title">对话体验（M-F5）</div>
        <div class="card-sub">文本回复可同步触发 Live2D text/voice 信号，并接入浏览器语音播报。</div>

        ${renderMessages()}

        <div class="chat-compose">
          <div class="chat-compose__field">
            <textarea
              rows="3"
              placeholder="输入消息，按 Enter 发送（Shift+Enter 换行）"
              .value=${_draft}
              @input=${(event: Event) => {
                _draft = (event.target as HTMLTextAreaElement).value;
                requestUpdate();
              }}
              @keydown=${(event: KeyboardEvent) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage(requestUpdate);
                }
              }}
            ></textarea>
          </div>
          <div class="chat-compose__actions" style="display: flex; align-items: center; gap: 10px;">
            <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted);">
              <input
                type="checkbox"
                .checked=${_speakEnabled}
                @change=${(event: Event) => {
                  _speakEnabled = (event.target as HTMLInputElement).checked;
                  requestUpdate();
                }}
              />
              启用语音播报
            </label>
            <button class="btn primary" ?disabled=${_sending || !_draft.trim()} @click=${() => void sendMessage(requestUpdate)}>
              ${_sending ? "处理中..." : "发送"}
            </button>
          </div>
          <div style="font-size: 12px; color: var(--muted);">${_statusMessage}</div>
        </div>
      </div>

      <div class="card savc-orchestrator" data-accent>
        <div class="card-title">Live2D 统一通道面板</div>
        <div class="card-sub">text/voice/interaction 信号在同一通道中聚合，runtime 实时消费。</div>
        <div style="margin-top: 12px; border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; background: var(--bg-elevated);">
          <canvas id="savc-chat-live2d-stage" style="display: block; width: 100%; height: 260px;"></canvas>
        </div>

        <div class="table" style="margin-top: 10px;">
          <div class="table-head" style="grid-template-columns: 0.7fr 0.7fr 1fr 0.9fr 0.8fr;">
            <span>ready</span>
            <span>mode</span>
            <span>model</span>
            <span>emotion</span>
            <span>source</span>
          </div>
          <div class="table-row" style="grid-template-columns: 0.7fr 0.7fr 1fr 0.9fr 0.8fr;">
            <span class="mono">${_runtimeStatus.ready ? "yes" : "no"}</span>
            <span class="mono">${_runtimeStatus.mode}</span>
            <span class="mono">${_runtimeStatus.modelName}</span>
            <span class="mono">${_runtimeStatus.emotion}</span>
            <span class="mono">${_runtimeStatus.source}</span>
          </div>
        </div>

        ${renderChannelPreview()}
        ${renderChannelTimeline()}
      </div>
    </div>
  `;
}
