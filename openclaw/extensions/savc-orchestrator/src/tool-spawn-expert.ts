import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  AgentRunResult,
  MemorySemanticModule,
  PluginToolContext,
  ResolvedRuntimeContext,
  SemanticSearchResult,
  ToolDetails,
} from "./types.js";
import {
  loadLifecycleModule,
  loadLive2DModule,
  loadMemorySemanticModule,
  loadRegistryModule,
  resolveRuntimeContext,
} from "./paths.js";
import {
  readLatestAssistantReply,
  sendRealAgentMessage,
  spawnRealAgent,
  waitForRealAgentRun,
} from "./real-session-adapter.js";
import {
  ensureRunRecord,
  patchRunRecord,
  toAgentRunResult as toStoredAgentRunResult,
} from "./run-store.js";

function success<T>(data: T): ToolDetails<T> {
  return { ok: true, code: "ok", error: null, data };
}

function failure(code: string, error: string): ToolDetails<null> {
  return { ok: false, code, error, data: null };
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  return fallback;
}

function toPositiveNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed);
    }
  }
  return fallback;
}

function toAgentRunResult(snapshot: {
  runId?: string;
  agent?: string;
  status?: string;
  output?: unknown;
  durationMs?: unknown;
  error?: unknown;
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

async function appendPluginLog(ctx: ResolvedRuntimeContext, line: string): Promise<void> {
  await fs.mkdir(path.dirname(ctx.logFilePath), { recursive: true });
  const timestamp = new Date().toISOString();
  await fs.appendFile(ctx.logFilePath, `[${timestamp}] ${line}\n`, "utf8");
}

async function tryRecall(
  memory: MemorySemanticModule,
  ctx: ResolvedRuntimeContext,
  query: string,
  limit: number,
): Promise<SemanticSearchResult> {
  return await memory.search(query, {
    workspace: ctx.savcCorePath,
    limit,
    minScore: ctx.config.memoryMinScore,
  });
}

function buildTaskWithMemory(task: string, recall: SemanticSearchResult): string {
  const lines = (recall.matches ?? [])
    .map((item) => String(item.text || "").trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((text) => `- ${text}`);

  if (lines.length === 0) {
    return task;
  }

  return `[相关记忆]\n${lines.join("\n")}\n\n[用户请求]\n${task}`;
}

function toOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function inferLive2DSourceFromAgent(agentName: string): "voice" | "interaction" | null {
  if (agentName === "voice") {
    return "voice";
  }
  if (agentName === "live2d") {
    return "interaction";
  }
  return null;
}

function resolveRealSpawnContext(toolCtx?: PluginToolContext): {
  sessionKey: string;
  agentId: string;
  channel?: string;
  accountId?: string;
} | null {
  const sessionKey = typeof toolCtx?.sessionKey === "string" ? toolCtx.sessionKey.trim() : "";
  const agentId = typeof toolCtx?.agentId === "string" ? toolCtx.agentId.trim() : "";
  if (!sessionKey || !agentId) {
    return null;
  }
  const channel =
    typeof toolCtx.messageChannel === "string" && toolCtx.messageChannel.trim()
      ? toolCtx.messageChannel.trim()
      : undefined;
  const accountId =
    typeof toolCtx.agentAccountId === "string" && toolCtx.agentAccountId.trim()
      ? toolCtx.agentAccountId.trim()
      : undefined;
  return {
    sessionKey,
    agentId,
    channel,
    accountId,
  };
}

export function createSpawnExpertTool(api: OpenClawPluginApi, toolCtx?: PluginToolContext) {
  return {
    name: "savc_spawn_expert",
    description:
      "Spawn SAVC expert agent via mock lifecycle (default) or real OpenClaw sessions backend.",
    parameters: Type.Object(
      {
        agent: Type.String({ description: "Target expert agent name." }),
        task: Type.String({ description: "Task for target agent." }),
        wait: Type.Optional(Type.Boolean({ description: "Wait for completion." })),
        timeoutMs: Type.Optional(Type.Number({ description: "Timeout for spawn/wait." })),
        recallQuery: Type.Optional(Type.String({ description: "Override recall query." })),
        recallLimit: Type.Optional(Type.Number({ description: "Override semantic recall top-K." })),
        persistMemory: Type.Optional(
          Type.Boolean({ description: "When agent=memory, persist task into semantic memory." }),
        ),
        useSessionsSend: Type.Optional(
          Type.Boolean({
            description:
              "Real mode only. Also send a coordination message via sessions_send to the child session.",
          }),
        ),
        handoffMessage: Type.Optional(
          Type.String({
            description: "Optional custom message when useSessionsSend=true.",
          }),
        ),
        handoffTimeoutSeconds: Type.Optional(
          Type.Number({
            description: "Optional timeout for sessions_send when useSessionsSend=true.",
          }),
        ),
      },
      { additionalProperties: false },
    ),

    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const agentName = typeof params.agent === "string" ? params.agent.trim() : "";
      const task = typeof params.task === "string" ? params.task.trim() : "";
      if (!agentName || !task) {
        const details = failure("INVALID_PARAMS", "agent and task are required");
        return {
          content: [{ type: "text", text: "savc_spawn_expert: agent and task are required." }],
          details,
        };
      }

      try {
        const ctx = resolveRuntimeContext(api);
        const wait = toBoolean(params.wait, ctx.config.defaultWait);
        const timeoutMs = toPositiveNumber(params.timeoutMs, ctx.config.defaultTimeoutMs);
        const recallQuery =
          typeof params.recallQuery === "string" && params.recallQuery.trim()
            ? params.recallQuery.trim()
            : task;
        const recallLimit = toPositiveNumber(params.recallLimit, ctx.config.memoryRecallTopK);
        const persistMemory = toBoolean(params.persistMemory, false);
        const useSessionsSend = toBoolean(params.useSessionsSend, false);
        const handoffMessage =
          typeof params.handoffMessage === "string" && params.handoffMessage.trim()
            ? params.handoffMessage.trim()
            : "";
        const handoffTimeoutSeconds = toPositiveNumber(
          params.handoffTimeoutSeconds,
          Math.max(1, Math.ceil(timeoutMs / 1000)),
        );

        const registry = await loadRegistryModule(ctx);

        let memory: MemorySemanticModule | null = null;
        try {
          memory = await loadMemorySemanticModule(ctx);
        } catch {
          memory = null;
        }

        await registry.discoverAgents(ctx.agentsDir, { forceReload: true });
        const agentDef = registry.getAgent(agentName);
        if (!agentDef) {
          const details = failure("AGENT_NOT_FOUND", `unknown agent: ${agentName}`);
          return {
            content: [
              { type: "text", text: `savc_spawn_expert failed: unknown agent ${agentName}.` },
            ],
            details,
          };
        }

        let finalTask = task;
        let recallCount = 0;
        if (ctx.config.memoryRecallEnabled && memory && recallQuery) {
          const recalled = await tryRecall(memory, ctx, recallQuery, recallLimit);
          recallCount = (recalled.matches ?? []).length;
          finalTask = buildTaskWithMemory(task, recalled);
        }

        let persisted = false;
        let persistedError: string | null = null;
        if (ctx.config.memoryPersistEnabled && memory && agentName === "memory" && persistMemory) {
          try {
            await memory.store(
              task,
              {
                workspace: ctx.savcCorePath,
                source: "orchestrator-plugin",
                category: "episodic",
                importance: 0.7,
              },
              {
                workspace: ctx.savcCorePath,
              },
            );
            persisted = true;
          } catch (error) {
            persistedError = error instanceof Error ? error.message : String(error);
          }
        }

        const autoCapture = {
          attempted: false,
          stored: 0,
          error: null as string | null,
        };
        const live2d = {
          attempted: false,
          source: null as string | null,
          emotion: null as string | null,
          interactionType: null as string | null,
          signal: null as Record<string, unknown> | null,
          error: null as string | null,
        };

        let runResult: AgentRunResult;
        let childSessionKey: string | undefined;
        let sessionsSend: {
          attempted: boolean;
          ok: boolean;
          status: string | null;
          runId: string | null;
          error: string | null;
        } = {
          attempted: false,
          ok: true,
          status: null,
          runId: null,
          error: null,
        };

        if (ctx.config.spawnMode === "real") {
          const realContext = resolveRealSpawnContext(toolCtx);
          if (!realContext) {
            const details = failure(
              "MISSING_SESSION_CONTEXT",
              "real spawn mode requires tool context sessionKey and agentId",
            );
            return {
              content: [
                {
                  type: "text",
                  text: "savc_spawn_expert failed: missing session context for real mode.",
                },
              ],
              details,
            };
          }

          const realSpawn = await spawnRealAgent({
            requesterSessionKey: realContext.sessionKey,
            requesterAgentId: realContext.agentId,
            requesterChannel: realContext.channel,
            requesterAccountId: realContext.accountId,
            targetAgentId: agentName,
            task: finalTask,
            timeoutMs,
            label: `savc-${agentName}`,
          });

          if (!realSpawn.ok) {
            const details = failure(realSpawn.code, realSpawn.error);
            return {
              content: [{ type: "text", text: `savc_spawn_expert failed: ${realSpawn.error}` }],
              details,
            };
          }

          childSessionKey = realSpawn.childSessionKey;
          ensureRunRecord({
            runId: realSpawn.runId,
            agent: agentName,
            status: "running",
            childSessionKey: realSpawn.childSessionKey,
            startedAt: Date.now(),
          });

          if (useSessionsSend) {
            sessionsSend.attempted = true;
            const coordinationMessage =
              handoffMessage ||
              [
                "[协调消息]",
                `runId=${realSpawn.runId}`,
                `targetAgent=${agentName}`,
                "请结合当前任务上下文继续执行并返回结构化要点。",
              ].join("\n");
            const send = await sendRealAgentMessage({
              requesterSessionKey: realContext.sessionKey,
              requesterChannel: realContext.channel,
              targetSessionKey: realSpawn.childSessionKey,
              message: coordinationMessage,
              timeoutSeconds: handoffTimeoutSeconds,
            });
            sessionsSend.ok = send.ok;
            sessionsSend.status = send.status;
            sessionsSend.runId = send.runId;
            sessionsSend.error = send.error ?? null;
          }

          if (wait) {
            let waited;
            try {
              waited = await waitForRealAgentRun(realSpawn.runId, timeoutMs);
            } catch (error) {
              const messageText = error instanceof Error ? error.message : String(error);
              const details = failure("RUN_WAIT_FAILED", messageText);
              return {
                content: [{ type: "text", text: `savc_spawn_expert failed: ${messageText}` }],
                details,
              };
            }
            let output: string | null = null;
            if (waited.status === "completed") {
              try {
                output = await readLatestAssistantReply(realSpawn.childSessionKey, { limit: 80 });
              } catch {
                output = null;
              }
            }
            const updated = patchRunRecord(realSpawn.runId, {
              status: waited.status,
              output,
              error: waited.error,
              startedAt: waited.startedAt ?? undefined,
              endedAt: waited.endedAt ?? undefined,
              durationMs: waited.durationMs,
              childSessionKey: realSpawn.childSessionKey,
            });
            runResult = updated
              ? toStoredAgentRunResult(updated)
              : {
                  runId: realSpawn.runId,
                  agent: agentName,
                  status: waited.status,
                  output,
                  durationMs: waited.durationMs,
                  error: waited.error,
                };
          } else {
            runResult = {
              runId: realSpawn.runId,
              agent: agentName,
              status: "running",
              output: null,
              durationMs: null,
              error: null,
            };
          }
        } else {
          const lifecycle = await loadLifecycleModule(ctx);
          const runId = await lifecycle.spawnAgent(agentDef, finalTask, {
            timeoutMs,
            spawnMode: ctx.config.spawnMode,
          });

          if (wait) {
            const snapshot = await lifecycle.waitForAgent(runId, timeoutMs);
            runResult = toAgentRunResult(snapshot);
          } else {
            const snapshot = lifecycle.getStatus(runId);
            if (snapshot) {
              runResult = toAgentRunResult(snapshot);
            } else {
              runResult = {
                runId,
                agent: agentName,
                status: "running",
                output: null,
                durationMs: null,
                error: null,
              };
            }
          }
        }

        if (
          memory &&
          typeof memory.autoCapture === "function" &&
          ctx.config.memoryPersistEnabled &&
          runResult.status === "completed"
        ) {
          autoCapture.attempted = true;
          try {
            const captureResult = await memory.autoCapture(
              [task, finalTask, runResult.output || ""],
              {
                workspace: ctx.savcCorePath,
                source: `orchestrator-plugin:auto-capture:${agentName}`,
                limit: 3,
              },
            );
            autoCapture.stored =
              typeof captureResult?.stored === "number" && Number.isFinite(captureResult.stored)
                ? captureResult.stored
                : 0;
          } catch (error) {
            autoCapture.error = error instanceof Error ? error.message : String(error);
          }
        }

        if (runResult.status === "completed") {
          live2d.attempted = true;
          try {
            const live2dModule = await loadLive2DModule(ctx);
            const outputText = toOptionalString(runResult.output) ?? "";
            const preferredSource = inferLive2DSourceFromAgent(agentName);
            if (typeof live2dModule.buildLive2DPlan === "function") {
              const plan = live2dModule.buildLive2DPlan(task, {
                ...(preferredSource ? { source: preferredSource } : {}),
                ...(outputText ? { message: outputText } : {}),
              });
              const planSignal =
                plan && typeof plan === "object" && plan.signal && typeof plan.signal === "object"
                  ? (plan.signal as Record<string, unknown>)
                  : null;
              live2d.signal = planSignal;
              live2d.source = toOptionalString(plan?.source) ?? toOptionalString(planSignal?.source);
              live2d.emotion = toOptionalString(plan?.emotion) ?? toOptionalString(planSignal?.emotion);
              live2d.interactionType =
                toOptionalString(plan?.interactionType) ??
                toOptionalString((planSignal?.interaction as Record<string, unknown> | undefined)?.type);
            } else {
              const signal = live2dModule.buildLive2DSignal({
                source: preferredSource ?? "text",
                message: outputText || task,
              });
              const signalData =
                signal && typeof signal === "object" ? (signal as Record<string, unknown>) : null;
              live2d.signal = signalData;
              live2d.source = toOptionalString(signalData?.source);
              live2d.emotion = toOptionalString(signalData?.emotion);
              live2d.interactionType = toOptionalString(
                (signalData?.interaction as Record<string, unknown> | undefined)?.type,
              );
            }
          } catch (error) {
            live2d.error = error instanceof Error ? error.message : String(error);
          }
        }

        await appendPluginLog(
          ctx,
          `spawn agent=${agentName} runId=${runResult.runId} status=${runResult.status} mode=${ctx.config.spawnMode} recallCount=${recallCount} persisted=${persisted} autoCapture=${autoCapture.stored} live2d=${live2d.attempted ? "on" : "off"} sessionsSend=${sessionsSend.attempted ? sessionsSend.status : "skipped"}`,
        );

        const details = success({
          result: runResult,
          live2d,
          memory: {
            recallEnabled: ctx.config.memoryRecallEnabled,
            recallCount,
            persisted,
            persistedError,
            autoCapture,
          },
          spawn: {
            mode: ctx.config.spawnMode,
            backend: ctx.config.spawnMode,
            wait,
            timeoutMs,
            childSessionKey: childSessionKey ?? null,
            sessionsSend,
          },
        });

        return {
          content: [
            {
              type: "text",
              text: `savc_spawn_expert => runId=${runResult.runId}, status=${runResult.status}, agent=${runResult.agent}`,
            },
          ],
          details,
        };
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        const details = failure("SPAWN_FAILED", messageText);
        return {
          content: [{ type: "text", text: `savc_spawn_expert failed: ${messageText}` }],
          details,
        };
      }
    },
  };
}
