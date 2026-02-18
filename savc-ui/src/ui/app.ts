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
import { renderLogs, activateLogsView, deactivateLogsView } from "./views/logs.js";
import { GatewayBrowserClient } from "./gateway-ws.js";

const DEFAULT_GATEWAY_WS_URL = "ws://127.0.0.1:18789";
const GATEWAY_STATUS_POLL_INTERVAL_MS = 15_000;
const GATEWAY_REQUEST_TIMEOUT_MS = 8_000;

@customElement("savc-app")
export class SavcApp extends LitElement {
  @state() private _state: AppViewState = defaultViewState();

  private _gatewayClient: GatewayBrowserClient | null = null;
  private _gatewayStatusTimer: ReturnType<typeof setInterval> | undefined;

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
    const initialTab: Tab = settings.lastTab === "progressHub" ? "dashboard" : settings.lastTab;
    this._state = {
      ...this._state,
      activeTab: initialTab,
      navCollapsed: settings.navCollapsed,
      themeMode: settings.theme,
      resolvedTheme: resolveTheme(settings.theme),
    };

    // Apply theme immediately
    applyTheme(this._state.resolvedTheme);

    if (this._state.activeTab === "logs") {
      activateLogsView(this._requestUpdate);
    }

    this._state = { ...this._state, loading: false };
    this._startGatewayStatusSync();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._stopGatewayStatusSync();
    deactivateLogsView();
  }

  private _readEnv(name: keyof ImportMetaEnv): string {
    const raw = import.meta.env[name];
    return typeof raw === "string" ? raw.trim() : "";
  }

  private _resolveGatewayWsUrl(): string {
    const configured = this._readEnv("VITE_SAVC_GATEWAY_URL");
    if (!configured) return DEFAULT_GATEWAY_WS_URL;

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

  private _formatUptime(ms: number | null): string {
    if (ms == null || ms < 0 || !Number.isFinite(ms)) {
      return "--";
    }
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  private _asNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private async _withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error("request timeout")), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private _stopGatewayStatusSync() {
    if (this._gatewayStatusTimer) {
      clearInterval(this._gatewayStatusTimer);
      this._gatewayStatusTimer = undefined;
    }
    if (this._gatewayClient) {
      this._gatewayClient.stop();
      this._gatewayClient = null;
    }
  }

  private _startGatewayStatusSync() {
    this._stopGatewayStatusSync();

    const token = this._readEnv("VITE_SAVC_GATEWAY_TOKEN") || undefined;
    const url = this._resolveGatewayWsUrl();
    const client = new GatewayBrowserClient({
      url,
      token,
      clientName: "savc-ui",
      mode: "webchat",
      onHello: () => {
        this._state = { ...this._state, connected: true };
        void this._refreshGatewayStatus();
      },
      onClose: () => {
        this._state = { ...this._state, connected: false, uptime: "--" };
      },
    });
    this._gatewayClient = client;
    client.start();

    this._gatewayStatusTimer = setInterval(() => {
      void this._refreshGatewayStatus();
    }, GATEWAY_STATUS_POLL_INTERVAL_MS);

    void this._refreshGatewayStatus();
  }

  private async _refreshGatewayStatus() {
    const client = this._gatewayClient;
    if (!client || !client.connected) {
      this._state = { ...this._state, connected: false };
      return;
    }

    try {
      const health = await this._withTimeout(client.request<Record<string, unknown>>("health", {}), GATEWAY_REQUEST_TIMEOUT_MS);
      const snapshot =
        health && typeof health.snapshot === "object" && health.snapshot !== null
          ? (health.snapshot as Record<string, unknown>)
          : null;
      const uptimeMs = this._asNumber(health.uptimeMs) ?? this._asNumber(snapshot?.uptimeMs);
      this._state = {
        ...this._state,
        connected: true,
        uptime: this._formatUptime(uptimeMs),
      };
    } catch {
      this._state = { ...this._state, connected: false };
    }
  }

  // ── Event Handlers ──────────────────────────────────

  private _onToggleNav = () => {
    const navCollapsed = !this._state.navCollapsed;
    this._state = { ...this._state, navCollapsed };
    saveSettings({ navCollapsed });
  };

  private _onTabClick = (tab: Tab) => {
    if (tab === "progressHub") {
      const target = new URL("progress-hub/index.html", window.location.href);
      window.open(target.toString(), "_blank", "noopener,noreferrer");
      return;
    }
    if (tab === this._state.activeTab) return;
    const previous = this._state.activeTab;
    if (previous === "logs" && tab !== "logs") {
      deactivateLogsView();
    }
    this._state = { ...this._state, activeTab: tab };
    saveSettings({ lastTab: tab });
    if (tab === "logs") {
      activateLogsView(this._requestUpdate);
    }
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
      case "logs":
        return renderLogs(this._requestUpdate);
      default:
        return this._renderStub(tab);
    }
  };

  private _renderStub(tab: Tab): TemplateResult {
    return html`
      <div class="card" style="animation: rise 0.35s var(--ease-out) backwards">
        <div class="card-title">${t(`tabs.${tab}`)}</div>
        <div class="card-sub">${t(`tabSubs.${tab}`)}</div>
        <div style="margin-top: 16px; padding: 40px; text-align: center; color: var(--muted-foreground); border: 1px dashed var(--border); border-radius: var(--radius-md);">
          <div style="font-size: 32px; opacity: 0.3; margin-bottom: 12px;">🚧</div>
          <div style="font-weight: 500;">此功能正在开发中</div>
          <div style="font-size: 12px; margin-top: 4px; color: var(--muted);">结构已预留，可按需接入网关能力</div>
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
