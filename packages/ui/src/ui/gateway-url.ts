const DEFAULT_GATEWAY_HTTP_URL = "http://127.0.0.1:18789";
const DEFAULT_GATEWAY_WS_URL = "ws://127.0.0.1:18789";

export function readUiEnv(name: keyof ImportMetaEnv): string {
  const raw = import.meta.env[name];
  return typeof raw === "string" ? raw.trim() : "";
}

function resolveWindowOrigin(fallback: string): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return fallback;
}

export function resolveGatewayHttpUrl(configured: string): string {
  const normalized = configured.replace(/\/+$/, "");
  if (!normalized) {
    return DEFAULT_GATEWAY_HTTP_URL;
  }
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return normalized;
  }
  if (normalized.startsWith("/")) {
    return new URL(normalized, resolveWindowOrigin("http://127.0.0.1:5174")).toString().replace(/\/+$/, "");
  }
  return `http://${normalized}`;
}

export function resolveGatewayWsUrl(configured: string): string {
  const normalized = configured.replace(/\/+$/, "");
  if (!normalized) {
    return DEFAULT_GATEWAY_WS_URL;
  }
  if (normalized.startsWith("ws://") || normalized.startsWith("wss://")) {
    return normalized;
  }
  if (normalized.startsWith("http://")) {
    return `ws://${normalized.slice("http://".length)}`;
  }
  if (normalized.startsWith("https://")) {
    return `wss://${normalized.slice("https://".length)}`;
  }
  if (normalized.startsWith("/")) {
    const origin = resolveWindowOrigin("http://127.0.0.1:5174");
    const base = new URL(origin);
    const protocol = base.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${base.host}${normalized}`;
  }
  return `ws://${normalized}`;
}
