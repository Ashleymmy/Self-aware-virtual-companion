import { zhCN, type I18nDict } from "./zh-CN.js";

// Current locale dictionary
const dict: I18nDict = zhCN;

/**
 * 获取翻译文本
 * 支持点号路径: t("dashboard.status") → "系统状态"
 */
export function t(path: string): string {
  const keys = path.split(".");
  let current: unknown = dict;
  for (const key of keys) {
    if (current == null || typeof current !== "object") {
      return path;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : path;
}

/** 直接获取字典子对象 */
export function tObj<K extends keyof I18nDict>(section: K): I18nDict[K] {
  return dict[section];
}

export { zhCN };
