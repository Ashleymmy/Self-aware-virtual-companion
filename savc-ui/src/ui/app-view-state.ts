import type { Tab } from "./navigation.js";
import type { ThemeMode, ResolvedTheme } from "./theme.js";

/** 简化版应用状态 */
export interface AppViewState {
  // 导航
  activeTab: Tab;
  navCollapsed: boolean;

  // 主题
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;

  // 连接状态
  connected: boolean;
  uptime: string;

  // 加载
  loading: boolean;
}

export function defaultViewState(): AppViewState {
  return {
    activeTab: "dashboard",
    navCollapsed: false,
    themeMode: "dark",
    resolvedTheme: "dark",
    connected: false,
    uptime: "--",
    loading: true,
  };
}
