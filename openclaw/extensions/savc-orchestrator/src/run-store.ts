import type { AgentRunResult, RealRunRecord, RealRunStatus } from "./types.js";

const runs = new Map<string, RealRunRecord>();

function toRunStatus(value: unknown, fallback: RealRunStatus): RealRunStatus {
  const raw = String(value || "").toLowerCase();
  if (
    raw === "accepted" ||
    raw === "running" ||
    raw === "completed" ||
    raw === "failed" ||
    raw === "timeout"
  ) {
    return raw;
  }
  return fallback;
}

function computeDurationMs(startedAt?: number, endedAt?: number): number | null {
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) {
    return null;
  }
  return Math.max(0, Math.round((endedAt as number) - (startedAt as number)));
}

function clone(record: RealRunRecord): RealRunRecord {
  return { ...record };
}

export function clearRunStore() {
  runs.clear();
}

export function listRunIds(): string[] {
  return Array.from(runs.keys());
}

export function getRunRecord(runId: string): RealRunRecord | null {
  const key = String(runId || "").trim();
  if (!key) {
    return null;
  }
  const record = runs.get(key);
  return record ? clone(record) : null;
}

export function upsertRunRecord(record: RealRunRecord): RealRunRecord {
  const runId = String(record.runId || "").trim();
  if (!runId) {
    throw new Error("runId is required");
  }
  const normalized: RealRunRecord = {
    ...record,
    runId,
    status: toRunStatus(record.status, "running"),
    durationMs:
      typeof record.durationMs === "number" && Number.isFinite(record.durationMs)
        ? record.durationMs
        : computeDurationMs(record.startedAt, record.endedAt),
  };
  runs.set(runId, normalized);
  return clone(normalized);
}

export function patchRunRecord(
  runId: string,
  patch: Partial<Omit<RealRunRecord, "runId">>,
): RealRunRecord | null {
  const current = getRunRecord(runId);
  if (!current) {
    return null;
  }
  const merged: RealRunRecord = {
    ...current,
    ...patch,
    status: toRunStatus(patch.status ?? current.status, current.status),
  };
  if (
    merged.durationMs === undefined ||
    merged.durationMs === null ||
    !Number.isFinite(merged.durationMs)
  ) {
    merged.durationMs = computeDurationMs(merged.startedAt, merged.endedAt);
  }
  runs.set(current.runId, merged);
  return clone(merged);
}

export function ensureRunRecord(params: {
  runId: string;
  agent: string;
  status?: RealRunStatus;
  childSessionKey?: string;
  startedAt?: number;
}) {
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

export function toAgentRunResult(record: RealRunRecord): AgentRunResult {
  return {
    runId: record.runId,
    agent: record.agent,
    status: record.status,
    output: record.output ?? null,
    durationMs:
      typeof record.durationMs === "number" && Number.isFinite(record.durationMs)
        ? record.durationMs
        : null,
    error: record.error ?? null,
  };
}
