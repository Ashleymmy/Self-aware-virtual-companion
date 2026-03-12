import { html, type TemplateResult } from "lit";
import { gateway, type PersonaTrait, type VoiceVariant, type ValueItem } from "../data/index.js";

let _traits: PersonaTrait[] = [];
let _voices: VoiceVariant[] = [];
let _values: ValueItem[] = [];
let _verbalTics: string[] = [];
let _soulDoc = "";
let _loaded = false;
let _loading = false;
let _activeSubTab: "soul" | "voice" | "values" | "preview" = "soul";
let _lastLoadedAt = "";

async function loadData(force = false) {
  if (_loading) return;
  _loading = true;
  try {
    if (force) {
      gateway.invalidateCache();
    }
    [_traits, _voices, _values, _verbalTics, _soulDoc] = await Promise.all([
      gateway.getPersonaTraits(),
      gateway.getVoiceVariants(),
      gateway.getCoreValues(),
      gateway.getVerbalTics(),
      gateway.getSoulDoc(),
    ]);
    _loaded = true;
    _lastLoadedAt = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  } finally {
    _loading = false;
  }
}

function renderSubTabs(requestUpdate: () => void): TemplateResult {
  const tabs: { key: typeof _activeSubTab; label: string }[] = [
    { key: "soul", label: "灵魂" },
    { key: "voice", label: "语气" },
    { key: "values", label: "价值观" },
    { key: "preview", label: "预览" },
  ];
  return html`
    <div class="tab-group" style="margin-bottom: 16px;">
      ${tabs.map(
        (t) => html`
          <button
            class="tab-item ${_activeSubTab === t.key ? "active" : ""}"
            @click=${() => { _activeSubTab = t.key; requestUpdate(); }}
          >${t.label}</button>
        `,
      )}
    </div>
  `;
}

function renderSoulTab(): TemplateResult {
  return html`
    <div class="card savc-persona" data-accent style="animation: rise 0.3s var(--ease-out) backwards">
      <div class="card-title">灵魂文档</div>
      <div class="card-sub">媛媛的核心人格定义</div>
      <div class="code-block" style="margin-top: 12px; white-space: pre-wrap; max-height: 400px; overflow-y: auto;">${_soulDoc}</div>
    </div>
    <div class="card" style="animation: rise 0.35s var(--ease-out) 0.1s backwards">
      <div class="card-title">性格特征</div>
      <div class="card-sub">调整滑块来修改媛媛的性格参数</div>
      <div style="margin-top: 16px; display: grid; gap: 20px;">
        ${_traits.map(
          (trait) => html`
            <div class="trait-slider">
              <div class="trait-slider__header">
                <span class="trait-slider__label">${trait.label}</span>
                <span class="trait-slider__value">${(trait.value * 100).toFixed(0)}%</span>
              </div>
              <div class="trait-slider__track">
                <div class="trait-slider__fill" style="width: ${trait.value * 100}%"></div>
                <div class="trait-slider__thumb" style="left: ${trait.value * 100}%"></div>
              </div>
              <div style="font-size: 11px; color: var(--muted);">${trait.description}</div>
            </div>
          `,
        )}
      </div>
    </div>
  `;
}

function renderVoiceTab(): TemplateResult {
  return html`
    <div class="card" style="animation: rise 0.3s var(--ease-out) backwards">
      <div class="card-title">语气变体</div>
      <div class="card-sub">选择媛媛的语气风格</div>
      <div class="list" style="margin-top: 12px;">
        ${_voices.map(
          (v) => html`
            <div class="list-item ${v.isDefault ? "list-item-selected" : ""}" style="grid-template-columns: 1fr auto;">
              <div class="list-main">
                <div class="list-title">${v.label} ${v.isDefault ? html`<span class="chip chip-ok" style="padding: 1px 8px; font-size: 10px; margin-left: 8px;">默认</span>` : ""}</div>
                <div class="list-sub">${v.description}</div>
              </div>
            </div>
          `,
        )}
      </div>
    </div>
    <div class="card" style="animation: rise 0.35s var(--ease-out) 0.1s backwards">
      <div class="card-title">口头禅</div>
      <div class="card-sub">媛媛常用的表达方式</div>
      <div style="margin-top: 12px; display: flex; flex-wrap: wrap; gap: 8px;">
        ${_verbalTics.map(
          (tic) => html`<span class="chip" style="font-size: 12px;">"${tic}"</span>`,
        )}
      </div>
    </div>
  `;
}

function renderValuesTab(): TemplateResult {
  return html`
    <div class="card" style="animation: rise 0.3s var(--ease-out) backwards">
      <div class="card-title">核心价值观</div>
      <div class="card-sub">指导媛媛行为的基本原则</div>
      <div class="list" style="margin-top: 12px;">
        ${_values.map(
          (v) => html`
            <div class="list-item" style="grid-template-columns: 1fr;">
              <div class="list-main">
                <div class="list-title" style="display: flex; gap: 8px; align-items: center;">
                  ${v.label}
                  <span class="chip chip-ok" style="padding: 1px 6px; font-size: 10px;">${v.priority}</span>
                </div>
                <div class="list-sub">${v.description}</div>
              </div>
            </div>
          `,
        )}
      </div>
    </div>
  `;
}

function renderPreviewTab(): TemplateResult {
  return html`
    <div class="card" style="animation: rise 0.3s var(--ease-out) backwards">
      <div class="card-title">回复风格预览</div>
      <div class="card-sub">基于当前人格配置的示例回复</div>
      <div style="margin-top: 16px; display: grid; gap: 16px;">
        <div style="padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--secondary);">
          <div style="font-size: 12px; color: var(--muted); margin-bottom: 6px;">用户: 今天心情不太好</div>
          <div style="font-size: 14px; line-height: 1.6;">先抱抱你~ 心情不好的时候不用勉强自己开心哦。想跟我说说怎么了吗？我在这里陪着你 💛</div>
        </div>
        <div style="padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--secondary);">
          <div style="font-size: 12px; color: var(--muted); margin-bottom: 6px;">用户: 这个 TypeScript 类型报错怎么解决？</div>
          <div style="font-size: 14px; line-height: 1.6;">嗯，我先看一下... 这个报错是因为 Lit 的 decorator 需要 <code>useDefineForClassFields: false</code>。在 tsconfig.json 里加上这个配置就行了。</div>
        </div>
        <div style="padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--secondary);">
          <div style="font-size: 12px; color: var(--muted); margin-bottom: 6px;">用户: 帮我写首关于编程的诗</div>
          <div style="font-size: 14px; line-height: 1.6; white-space: pre-line;">嘿嘿，这个我来~

键盘敲响夜的序曲，
代码编织梦的纹理。
Bug 是路上的小石子，
踩过去就是新天地。</div>
        </div>
      </div>
    </div>
  `;
}

export function renderPersona(requestUpdate: () => void): TemplateResult {
  if (!_loaded) {
    if (!_loading) {
      void loadData().then(() => requestUpdate());
    }
    return html`
      <div class="config-loading" style="padding: 60px;">
        <div class="config-loading__spinner"></div>
        <span>加载人格数据...</span>
      </div>
    `;
  }

  return html`
    <div class="card" style="margin-bottom: 14px; animation: rise 0.3s var(--ease-out) backwards;">
      <div style="display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap;">
        <div>
          <div class="card-title">人格配置数据</div>
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

    ${renderSubTabs(requestUpdate)}
    ${_activeSubTab === "soul" ? renderSoulTab() : ""}
    ${_activeSubTab === "voice" ? renderVoiceTab() : ""}
    ${_activeSubTab === "values" ? renderValuesTab() : ""}
    ${_activeSubTab === "preview" ? renderPreviewTab() : ""}
  `;
}
