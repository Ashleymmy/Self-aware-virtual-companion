import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => {
  let spawnMode: "mock" | "real" = "mock";

  const getStatus = vi.fn((runId: string) => {
    if (runId === "run-1") {
      return {
        runId: "run-1",
        agent: "technical",
        status: "completed",
        output: "done",
        error: null,
        durationMs: 11,
      };
    }
    return null;
  });
  const waitForRealAgentRun = vi.fn(async () => ({
    runId: "real-run-1",
    status: "completed",
    error: null,
    startedAt: 10,
    endedAt: 20,
    durationMs: 10,
  }));
  const readLatestAssistantReply = vi.fn(async () => "real output");

  return {
    getStatus,
    waitForRealAgentRun,
    readLatestAssistantReply,
    setSpawnMode: (next: "mock" | "real") => {
      spawnMode = next;
    },
    resolveRuntimeContext: vi.fn(() => ({
      config: {
        spawnMode,
        defaultWait: true,
        defaultTimeoutMs: 60_000,
        memoryRecallEnabled: true,
        memoryRecallTopK: 3,
        memoryMinScore: 0.3,
        memoryPersistEnabled: true,
        logFile: "memory/procedural/orchestrator.log",
      },
      savcCorePath: "/tmp/savc-core",
      agentsDir: "/tmp/savc-core/agents",
      orchestratorDir: "/tmp/savc-core/orchestrator",
      repoRoot: "/tmp/repo",
      memorySemanticPath: "/tmp/repo/scripts/memory_semantic.mjs",
      logFilePath: "/tmp/savc-orchestrator-test.log",
    })),
    loadLifecycleModule: vi.fn(async () => ({
      spawnAgent: vi.fn(),
      waitForAgent: vi.fn(),
      getStatus,
    })),
  };
});

vi.mock("./paths.js", () => ({
  resolveRuntimeContext: mocked.resolveRuntimeContext,
  loadLifecycleModule: mocked.loadLifecycleModule,
}));

vi.mock("./real-session-adapter.js", () => ({
  waitForRealAgentRun: mocked.waitForRealAgentRun,
  readLatestAssistantReply: mocked.readLatestAssistantReply,
}));

import { clearRunStore, upsertRunRecord } from "./run-store.js";
import { createAgentStatusTool } from "./tool-agent-status.js";

function fakeApi() {
  return {
    config: {
      agents: {
        defaults: {
          workspace: "savc-core",
        },
      },
    },
    pluginConfig: {},
    resolvePath: (input: string) => input,
  } as never;
}

describe("savc_agent_status tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRunStore();
    mocked.setSpawnMode("mock");
    mocked.waitForRealAgentRun.mockResolvedValue({
      runId: "real-run-1",
      status: "completed",
      error: null,
      startedAt: 10,
      endedAt: 20,
      durationMs: 10,
    });
    mocked.readLatestAssistantReply.mockResolvedValue("real output");
  });

  it("returns status snapshot for valid runId", async () => {
    const tool = createAgentStatusTool(fakeApi());
    const result = await tool.execute("id", { runId: "run-1" });

    expect(result.details).toMatchObject({ ok: true, code: "ok", error: null });
    // oxlint-disable-next-line typescript/no-explicit-any
    expect((result.details as any).data.status).toBe("completed");
  });

  it("returns not_found for unknown runId", async () => {
    const tool = createAgentStatusTool(fakeApi());
    const result = await tool.execute("id", { runId: "missing" });

    expect(result.details).toMatchObject({ ok: true, code: "ok", error: null });
    // oxlint-disable-next-line typescript/no-explicit-any
    expect((result.details as any).data.status).toBe("not_found");
  });

  it("validates required runId", async () => {
    const tool = createAgentStatusTool(fakeApi());
    const result = await tool.execute("id", {});
    expect(result.details).toMatchObject({ ok: false, code: "INVALID_PARAMS" });
  });

  it("reads status from real run store when spawnMode=real", async () => {
    mocked.setSpawnMode("real");
    upsertRunRecord({
      runId: "real-run-1",
      agent: "technical",
      status: "running",
      childSessionKey: "agent:technical:subagent:real-run-1",
      output: null,
      error: null,
    });

    const tool = createAgentStatusTool(fakeApi());
    const result = await tool.execute("id", { runId: "real-run-1" });

    expect(result.details).toMatchObject({ ok: true, code: "ok", error: null });
    // oxlint-disable-next-line typescript/no-explicit-any
    expect((result.details as any).data.status).toBe("completed");
    expect(mocked.waitForRealAgentRun).toHaveBeenCalledTimes(1);
  });

  it("returns not_found in real mode for unknown runId", async () => {
    mocked.setSpawnMode("real");
    const tool = createAgentStatusTool(fakeApi());
    const result = await tool.execute("id", { runId: "missing-real" });
    expect(result.details).toMatchObject({ ok: true, code: "ok", error: null });
    // oxlint-disable-next-line typescript/no-explicit-any
    expect((result.details as any).data.status).toBe("not_found");
  });
});
