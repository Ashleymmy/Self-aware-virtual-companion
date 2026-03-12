import type { ThemeMode } from "./theme.js";
import type { Tab } from "./navigation.js";

const STORAGE_KEY = "savc-settings";

export interface SavcSettings {
  theme: ThemeMode;
  lastTab: Tab;
  navCollapsed: boolean;
}

const DEFAULTS: SavcSettings = {
  theme: "dark",
  lastTab: "dashboard",
  navCollapsed: false,
};

export function loadSettings(): SavcSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: Partial<SavcSettings>): void {
  try {
    const current = loadSettings();
    const merged = { ...current, ...settings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // Silently ignore storage errors
  }
}
