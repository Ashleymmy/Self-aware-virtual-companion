const DEFAULT_LOG_FILE = "memory/procedural/orchestrator.log";
function readString(value) {
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
}
function readBoolean(value, fallback) {
    if (typeof value === "boolean") {
        return value;
    }
    return fallback;
}
function readNumber(value, fallback) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string") {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return fallback;
}
export function resolvePluginConfig(raw) {
    const cfg = raw && typeof raw === "object" ? raw : {};
    const rawSpawnMode = readString(cfg.spawnMode);
    const spawnMode = rawSpawnMode === "real" ? "real" : "mock";
    const defaultTimeoutMs = Math.max(1, Math.round(readNumber(cfg.defaultTimeoutMs, 60_000)));
    const memoryRecallTopK = Math.max(1, Math.round(readNumber(cfg.memoryRecallTopK, 3)));
    const memoryMinScore = Math.max(0, Math.min(1, readNumber(cfg.memoryMinScore, 0.3)));
    return {
        savcCorePath: readString(cfg.savcCorePath),
        agentsDir: readString(cfg.agentsDir),
        spawnMode,
        defaultWait: readBoolean(cfg.defaultWait, true),
        defaultTimeoutMs,
        memoryRecallEnabled: readBoolean(cfg.memoryRecallEnabled, true),
        memoryRecallTopK,
        memoryMinScore,
        memoryPersistEnabled: readBoolean(cfg.memoryPersistEnabled, true),
        logFile: readString(cfg.logFile) ?? DEFAULT_LOG_FILE,
    };
}
