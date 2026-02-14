import type { IconName } from "./icons.js";
import { t } from "./i18n/index.js";

export const TAB_GROUPS = [
  { label: "navGroups.core", tabs: ["dashboard", "chat"] },
  { label: "navGroups.memory", tabs: ["memory"] },
  { label: "navGroups.persona", tabs: ["persona", "orchestrator"] },
  { label: "navGroups.control", tabs: ["channels", "sessions", "instances", "cron"] },
  { label: "navGroups.system", tabs: ["agents", "skills", "nodes", "config", "logs"] },
] as const;

export type Tab =
  | "dashboard"
  | "chat"
  | "memory"
  | "persona"
  | "orchestrator"
  | "channels"
  | "sessions"
  | "instances"
  | "cron"
  | "agents"
  | "skills"
  | "nodes"
  | "config"
  | "logs";

export function iconForTab(tab: Tab): IconName {
  switch (tab) {
    case "dashboard":
      return "barChart";
    case "chat":
      return "messageSquare";
    case "memory":
      return "database";
    case "persona":
      return "heart";
    case "orchestrator":
      return "network";
    case "channels":
      return "link";
    case "sessions":
      return "fileText";
    case "instances":
      return "radio";
    case "cron":
      return "clock";
    case "agents":
      return "folder";
    case "skills":
      return "zap";
    case "nodes":
      return "monitor";
    case "config":
      return "settings";
    case "logs":
      return "scrollText";
    default:
      return "folder";
  }
}

export function titleForTab(tab: Tab): string {
  return t(`tabs.${tab}`);
}

export function subtitleForTab(tab: Tab): string {
  return t(`tabSubs.${tab}`);
}

export const ALL_TABS: Tab[] = [
  "dashboard", "chat",
  "memory",
  "persona", "orchestrator",
  "channels", "sessions", "instances", "cron",
  "agents", "skills", "nodes", "config", "logs",
];
