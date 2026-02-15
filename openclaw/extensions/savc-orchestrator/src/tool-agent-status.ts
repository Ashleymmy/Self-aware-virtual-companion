import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import type { AgentRunResult, PluginToolContext, ToolDetails } from "./types.js";
import { loadLifecycleModule, resolveRuntimeContext } from "./paths.js";
import { readLatestAssistantReply, waitForRealAgentRun } from "./real-session-adapter.js";
import {
  getRunRecord,
  patchRunRecord,
  toAgentRunResult as toStoredAgentRunResult,
} from "./run-store.js";

function success<T>(data: T): ToolDetails<T> {
  return { ok: true, code: "ok", error: null, data };
}

function failure(code: string, error: string): ToolDetails<null> {
  return { ok: false, code, error, data: null };
}

function toResult(snapshot: {
  runId?: string;
  agent?: string;
  status?: string;
  output?: unknown;
  error?: unknown;
  durationMs?: unknown;
}): AgentRunResult {
  return {
    runId: String(snapshot.runId || ""),
    agent: String(snapshot.agent || "unknown"),
    status: String(snapshot.status || "unknown"),
    output:
      snapshot.output === undefined || snapshot.output === null ? null : String(snapshot.output),
    durationMs:
      typeof snapshot.durationMs === "number" && Number.isFinite(snapshot.durationMs)
        ? snapshot.durationMs
        : null,
    error: snapshot.error === undefined || snapshot.error === null ? null : String(snapshot.error),
  };
}

export function createAgentStatusTool(api: OpenClawPluginApi, _toolCtx?: PluginToolContext) {
  return {
    name: "savc_agent_status",
    description: "Read status snapshot for a SAVC spawned expert run.",
    parameters: Type.Object(
      {
        runId: Type.String({ description: "Run ID returned by savc_spawn_expert." }),
      },
      { additionalProperties: false },
    ),

    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const runId = typeof params.runId === "string" ? params.runId.trim() : "";
      if (!runId) {
        const details = failure("INVALID_PARAMS", "runId is required");
        return {
          content: [{ type: "text", text: "savc_agent_status: runId is required." }],
          details,
        };
      }

      try {
        const ctx = resolveRuntimeContext(api);
        let result: AgentRunResult;

        if (ctx.config.spawnMode === "real") {
          const current = getRunRecord(runId);
          if (!current) {
            result = {
              runId,
              agent: "unknown",
              status: "not_found",
              output: null,
              durationMs: null,
              error: null,
            };
          } else {
            const terminal = new Set(["completed", "failed", "timeout"]);
            let record = current;
            if (!terminal.has(current.status)) {
              const waited = await waitForRealAgentRun(runId, 250, { treatTimeoutAsRunning: true });
              if (waited.status !== "running") {
                let output = current.output ?? null;
                if (!output && waited.status === "completed" && current.childSessionKey) {
                  try {
                    output = await readLatestAssistantReply(current.childSessionKey, { limit: 80 });
                  } catch {
                    output = current.output ?? null;
                  }
                }
                const updated = patchRunRecord(runId, {
                  status: waited.status,
                  output,
                  error: waited.error,
                  startedAt: waited.startedAt ?? undefined,
                  endedAt: waited.endedAt ?? undefined,
                  durationMs: waited.durationMs,
                });
                if (updated) {
                  record = updated;
                }
              }
            }
            result = toStoredAgentRunResult(record);
          }
        } else {
          const lifecycle = await loadLifecycleModule(ctx);
          const snapshot = lifecycle.getStatus(runId);
          result = snapshot
            ? toResult(snapshot)
            : {
                runId,
                agent: "unknown",
                status: "not_found",
                output: null,
                durationMs: null,
                error: null,
              };
        }

        const details = success(result);
        return {
          content: [
            {
              type: "text",
              text: `savc_agent_status => runId=${result.runId}, status=${result.status}, agent=${result.agent}`,
            },
          ],
          details,
        };
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        const details = failure("STATUS_FAILED", messageText);
        return {
          content: [{ type: "text", text: `savc_agent_status failed: ${messageText}` }],
          details,
        };
      }
    },
  };
}
