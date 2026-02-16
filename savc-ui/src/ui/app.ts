import { LitElement, html, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { renderShell } from "./app-render.js";
import { defaultViewState, type AppViewState } from "./app-view-state.js";
import { type Tab } from "./navigation.js";
import { type ThemeMode, resolveTheme, applyTheme } from "./theme.js";
import { loadSettings, saveSettings } from "./storage.js";
import { t } from "./i18n/index.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderChat } from "./views/chat.js";
import { renderMemory } from "./views/memory.js";
import { renderPersona } from "./views/persona.js";
import { renderOrchestrator } from "./views/orchestrator.js";

@customElement("savc-app")
export class SavcApp extends LitElement {
  @state() private _state: AppViewState = defaultViewState();

  override createRenderRoot() {
    return this; // Use global CSS
  }

  override connectedCallback() {
    super.connectedCallback();
    this._init();
  }

  private _init() {
    // Load persisted settings
    const settings = loadSettings();
    this._state = {
      ...this._state,
      activeTab: settings.lastTab,
      navCollapsed: settings.navCollapsed,
      themeMode: settings.theme,
      resolvedTheme: resolveTheme(settings.theme),
    };

    // Apply theme immediately
    applyTheme(this._state.resolvedTheme);

    // Simulate connection delay
    setTimeout(() => {
      this._state = {
        ...this._state,
        loading: false,
        connected: true,
        uptime: "24h 13m",
      };
    }, 400);

    // Start uptime ticker
    this._startUptimeTicker();
  }

  private _uptimeSeconds = 86580; // ~24h
  private _uptimeTimer?: ReturnType<typeof setInterval>;

  private _startUptimeTicker() {
    this._uptimeTimer = setInterval(() => {
      this._uptimeSeconds++;
      const h = Math.floor(this._uptimeSeconds / 3600);
      const m = Math.floor((this._uptimeSeconds % 3600) / 60);
      this._state = { ...this._state, uptime: `${h}h ${m}m` };
    }, 60_000);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this._uptimeTimer) clearInterval(this._uptimeTimer);
  }

  // ── Event Handlers ──────────────────────────────────

  private _onToggleNav = () => {
    const navCollapsed = !this._state.navCollapsed;
    this._state = { ...this._state, navCollapsed };
    saveSettings({ navCollapsed });
  };

  private _onTabClick = (tab: Tab) => {
    if (tab === this._state.activeTab) return;
    this._state = { ...this._state, activeTab: tab };
    saveSettings({ lastTab: tab });
  };

  private _onTheme = (mode: ThemeMode, e: MouseEvent) => {
    const resolved = resolveTheme(mode);
    this._state = { ...this._state, themeMode: mode, resolvedTheme: resolved };
    applyTheme(resolved, e.clientX, e.clientY);
    saveSettings({ theme: mode });
  };

  // ── View Router ─────────────────────────────────────

  private _requestUpdate = () => this.requestUpdate();

  private _renderView = (tab: Tab): TemplateResult => {
    switch (tab) {
      case "dashboard":
        return renderDashboard(this._requestUpdate);
      case "chat":
        return renderChat(this._requestUpdate);
      case "memory":
        return renderMemory(this._requestUpdate);
      case "persona":
        return renderPersona(this._requestUpdate);
      case "orchestrator":
        return renderOrchestrator(this._requestUpdate);
      default:
        return this._renderStub(tab);
    }
  };

  private _renderStub(tab: Tab): TemplateResult {
    return html`
      <div class="card" style="animation: rise 0.35s var(--ease-out) backwards">
        <div class="card-title">${t(`tabs.${tab}`)}</div>
        <div class="card-sub">${t(`tabSubs.${tab}`)}</div>
        <div style="margin-top: 16px; padding: 40px; text-align: center; color: var(--muted); border: 1px dashed var(--border); border-radius: var(--radius-md);">
          <div style="font-size: 32px; opacity: 0.3; margin-bottom: 12px;">🚧</div>
          <div>此功能正在开发中</div>
          <div style="font-size: 12px; margin-top: 4px;">完成后将对接主项目 WebSocket 数据</div>
        </div>
      </div>
    `;
  }

  // ── Render ──────────────────────────────────────────

  override render() {
    return renderShell(this._state, this._renderView, {
      onToggleNav: this._onToggleNav,
      onTabClick: this._onTabClick,
      onTheme: this._onTheme,
    });
  }
}
