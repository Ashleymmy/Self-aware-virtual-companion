const runs = new Map();
function toRunStatus(value, fallback) {
    const raw = String(value || "").toLowerCase();
    if (raw === "accepted" ||
        raw === "running" ||
        raw === "completed" ||
        raw === "failed" ||
        raw === "timeout") {
        return raw;
    }
    return fallback;
}
function computeDurationMs(startedAt, endedAt) {
    if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) {
        return null;
    }
    return Math.max(0, Math.round(endedAt - startedAt));
}
function clone(record) {
    return { ...record };
}
export function clearRunStore() {
    runs.clear();
}
export function listRunIds() {
    return Array.from(runs.keys());
}
export function getRunRecord(runId) {
    const key = String(runId || "").trim();
    if (!key) {
        return null;
    }
    const record = runs.get(key);
    return record ? clone(record) : null;
}
export function upsertRunRecord(record) {
    const runId = String(record.runId || "").trim();
    if (!runId) {
        throw new Error("runId is required");
    }
    const normalized = {
        ...record,
        runId,
        status: toRunStatus(record.status, "running"),
        durationMs: typeof record.durationMs === "number" && Number.isFinite(record.durationMs)
            ? record.durationMs
            : computeDurationMs(record.startedAt, record.endedAt),
    };
    runs.set(runId, normalized);
    return clone(normalized);
}
export function patchRunRecord(runId, patch) {
    const current = getRunRecord(runId);
    if (!current) {
        return null;
    }
    const merged = {
        ...current,
        ...patch,
        status: toRunStatus(patch.status ?? current.status, current.status),
    };
    if (merged.durationMs === undefined ||
        merged.durationMs === null ||
        !Number.isFinite(merged.durationMs)) {
        merged.durationMs = computeDurationMs(merged.startedAt, merged.endedAt);
    }
    runs.set(current.runId, merged);
    return clone(merged);
}
export function ensureRunRecord(params) {
    const existing = getRunRecord(params.runId);
    if (existing) {
        return existing;
    }
    return upsertRunRecord({
        runId: params.runId,
        agent: params.agent,
        status: params.status ?? "running",
        childSessionKey: params.childSessionKey,
        startedAt: params.startedAt,
        output: null,
        error: null,
        durationMs: null,
    });
}
export function toAgentRunResult(record) {
    return {
        runId: record.runId,
        agent: record.agent,
        status: record.status,
        output: record.output ?? null,
        durationMs: typeof record.durationMs === "number" && Number.isFinite(record.durationMs)
            ? record.durationMs
            : null,
        error: record.error ?? null,
    };
}
