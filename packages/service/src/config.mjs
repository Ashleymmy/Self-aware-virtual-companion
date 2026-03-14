import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

function readNumber(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeBasePath(value) {
  const raw = String(value || "/api").trim();
  if (!raw || raw === "/") {
    return "";
  }
  return raw.startsWith("/") ? raw.replace(/\/+$/, "") : `/${raw.replace(/\/+$/, "")}`;
}

export function loadConfig() {
  return {
    host: process.env.SAVC_SERVICE_HOST || process.env.HOST || "127.0.0.1",
    port: readNumber(process.env.SAVC_SERVICE_PORT || process.env.PORT, 8788),
    basePath: normalizeBasePath(process.env.SAVC_SERVICE_BASE_PATH || "/api"),
    apiKey: String(process.env.SAVC_SERVICE_API_KEY || "").trim(),
    dataDir: path.resolve(
      process.env.SAVC_SERVICE_DATA_DIR || path.join(repoRoot, ".runtime", "commercial-service"),
    ),
  };
}
