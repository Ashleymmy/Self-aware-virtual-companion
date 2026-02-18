import { html, nothing, type TemplateResult } from "lit";
import { keyed } from "lit/directives/keyed.js";
import { t } from "./i18n/index.js";
import { TAB_GROUPS, iconForTab, titleForTab, subtitleForTab, type Tab } from "./navigation.js";
import { renderIcon, icons } from "./icons.js";
import type { AppViewState } from "./app-view-state.js";
import type { ThemeMode } from "./theme.js";

// ── Topbar ────────────────────────────────────────────
function renderTopbar(
  state: AppViewState,
  onToggleNav: () => void,
  onTheme: (mode: ThemeMode, e: MouseEvent) => void,
): TemplateResult {
  const themeIndex = state.themeMode === "dark" ? 0 : state.themeMode === "light" ? 1 : 2;

  return html`
    <header class="savc-topbar topbar">
      <div class="topbar-left">
        <button class="nav-collapse-toggle" @click=${onToggleNav} title="切换导航栏">
          <span class="nav-collapse-toggle__icon">${icons.menu}</span>
        </button>
        <div class="brand">
          <div class="brand-text">
            <div class="brand-title">${t("brand.title")}</div>
            <div class="brand-sub">${t("brand.sub")}</div>
          </div>
        </div>
      </div>
      <div class="topbar-status">
        <span class="pill">
          <span class="statusDot ${state.connected ? "ok" : ""}"></span>
          ${state.connected ? t("common.online") : t("common.offline")}
          <span class="mono">${state.uptime}</span>
        </span>
        <div class="theme-toggle">
          <div class="theme-toggle__track" style="--theme-index: ${themeIndex}">
            <div class="theme-toggle__indicator"></div>
            <button
              class="theme-toggle__button ${state.themeMode === "dark" ? "active" : ""}"
              @click=${(e: MouseEvent) => onTheme("dark", e)}
              title="${t("theme.dark")}"
            >
              <span class="theme-icon">${icons.moon}</span>
            </button>
            <button
              class="theme-toggle__button ${state.themeMode === "light" ? "active" : ""}"
              @click=${(e: MouseEvent) => onTheme("light", e)}
              title="${t("theme.light")}"
            >
              <span class="theme-icon">${icons.sun}</span>
            </button>
            <button
              class="theme-toggle__button ${state.themeMode === "system" ? "active" : ""}"
              @click=${(e: MouseEvent) => onTheme("system", e)}
              title="${t("theme.system")}"
            >
              <span class="theme-icon">${icons.laptop}</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  `;
}

// ── Sidebar Navigation ────────────────────────────────
function renderNav(
  state: AppViewState,
  onTabClick: (tab: Tab) => void,
): TemplateResult {
  return html`
    <nav class="savc-nav nav ${state.navCollapsed ? "nav--collapsed" : ""}">
      ${TAB_GROUPS.map(
        (group) => html`
          <div class="nav-group">
            <button class="nav-label nav-label--static">
              <span class="nav-label__text">${t(group.label)}</span>
            </button>
            <div class="nav-group__items">
              ${group.tabs.map(
                (tab) => html`
                  <button
                    class="nav-item ${state.activeTab === tab ? "active" : ""}"
                    @click=${() => onTabClick(tab as Tab)}
                  >
                    ${renderIcon(iconForTab(tab as Tab))}
                    <span class="nav-item__text">${titleForTab(tab as Tab)}</span>
                  </button>
                `,
              )}
            </div>
          </div>
        `,
      )}
    </nav>
  `;
}

// ── Content Header ────────────────────────────────────
function renderContentHeader(tab: Tab): TemplateResult {
  return html`
    <div class="content-header">
      <div>
        <h1 class="page-title">${titleForTab(tab)}</h1>
        <p class="page-sub">${subtitleForTab(tab)}</p>
      </div>
    </div>
  `;
}

// ── Content Router ────────────────────────────────────
function renderContent(
  tab: Tab,
  renderView: (tab: Tab) => TemplateResult,
): TemplateResult {
  // Use a unique key attribute so Lit recreates the wrapper div on tab change,
  // which re-triggers the CSS entrance animation.
  return html`
    <main class="savc-content content">
      ${renderContentHeader(tab)}
      ${keyed(tab, html`
        <div class="view-enter">
          ${renderView(tab)}
        </div>
      `)}
    </main>
  `;
}

// ── Shell ─────────────────────────────────────────────
export function renderShell(
  state: AppViewState,
  renderView: (tab: Tab) => TemplateResult,
  callbacks: {
    onToggleNav: () => void;
    onTabClick: (tab: Tab) => void;
    onTheme: (mode: ThemeMode, e: MouseEvent) => void;
  },
): TemplateResult {
  const shellClass = [
    "shell",
    state.navCollapsed ? "shell--nav-collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (state.loading) {
    return html`
      <div class="savc-shell ${shellClass}">
        ${renderTopbar(state, callbacks.onToggleNav, callbacks.onTheme)}
        ${renderNav(state, callbacks.onTabClick)}
        <main class="savc-content content">
          <div class="config-loading">
            <div class="config-loading__spinner"></div>
            <span>${t("common.loading")}</span>
          </div>
        </main>
      </div>
    `;
  }

  return html`
    <div class="savc-shell ${shellClass}">
      ${renderTopbar(state, callbacks.onToggleNav, callbacks.onTheme)}
      ${renderNav(state, callbacks.onTabClick)}
      ${renderContent(state.activeTab, renderView)}
    </div>
  `;
}
