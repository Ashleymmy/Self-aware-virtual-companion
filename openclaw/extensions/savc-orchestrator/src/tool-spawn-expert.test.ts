import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => {
  let spawnMode: "mock" | "real" = "mock";

  const discoverAgents = vi.fn(async () => []);
  const getAgent = vi.fn((name: string) => {
    if (name === "technical") {
      return { name: "technical", limits: { timeout_seconds: 30 } };
    }
    if (name === "memory") {
      return { name: "memory", limits: { timeout_seconds: 30 } };
    }
    return null;
  });

  const spawnAgent = vi.fn(async () => "run-1");
  const waitForAgent = vi.fn(async () => ({
    runId: "run-1",
    agent: "technical",
    status: "completed",
    output: "done",
    error: null,
    durationMs: 22,
  }));
  const getStatus = vi.fn(() => ({
    runId: "run-1",
    agent: "technical",
    status: "running",
    output: null,
    error: null,
    durationMs: null,
  }));

  const search = vi.fn(async () => ({ matches: [{ text: "用户偏好: requests 库", score: 0.91 }] }));
  const store = vi.fn(async () => ({ stored: true }));
  const autoCapture = vi.fn(async () => ({ stored: 1 }));
  const spawnRealAgent = vi.fn(async () => ({
    ok: true,
    runId: "run-real-1",
    childSessionKey: "agent:technical:subagent:run-real-1",
    status: "accepted",
  }));
  const sendRealAgentMessage = vi.fn(async () => ({
    ok: true,
    status: "accepted",
    runId: "send-run-1",
    reply: null,
    error: null,
  }));
  const waitForRealAgentRun = vi.fn(async () => ({
    runId: "run-real-1",
    status: "completed",
    error: null,
    startedAt: 10,
    endedAt: 40,
    durationMs: 30,
  }));
  const readLatestAssistantReply = vi.fn(async () => "real output");

  return {
    discoverAgents,
    getAgent,
    spawnAgent,
    waitForAgent,
    getStatus,
    search,
    store,
    autoCapture,
    spawnRealAgent,
    sendRealAgentMessage,
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
    loadRegistryModule: vi.fn(async () => ({ discoverAgents, getAgent })),
    loadLifecycleModule: vi.fn(async () => ({ spawnAgent, waitForAgent, getStatus })),
    loadMemorySemanticModule: vi.fn(async () => ({ search, store, autoCapture })),
  };
});

vi.mock("./paths.js", () => ({
  resolveRuntimeContext: mocked.resolveRuntimeContext,
  loadRegistryModule: mocked.loadRegistryModule,
  loadLifecycleModule: mocked.loadLifecycleModule,
  loadMemorySemanticModule: mocked.loadMemorySemanticModule,
}));

vi.mock("./real-session-adapter.js", () => ({
  spawnRealAgent: mocked.spawnRealAgent,
  sendRealAgentMessage: mocked.sendRealAgentMessage,
  waitForRealAgentRun: mocked.waitForRealAgentRun,
  readLatestAssistantReply: mocked.readLatestAssistantReply,
}));

import { clearRunStore } from "./run-store.js";
import { createSpawnExpertTool } from "./tool-spawn-expert.js";

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

describe("savc_spawn_expert tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRunStore();
    mocked.setSpawnMode("mock");
    mocked.spawnAgent.mockResolvedValue("run-1");
    mocked.waitForAgent.mockResolvedValue({
      runId: "run-1",
      agent: "technical",
      status: "completed",
      output: "done",
      error: null,
      durationMs: 22,
    });
    mocked.spawnRealAgent.mockResolvedValue({
      ok: true,
      runId: "run-real-1",
      childSessionKey: "agent:technical:subagent:run-real-1",
      status: "accepted",
    });
    mocked.sendRealAgentMessage.mockResolvedValue({
      ok: true,
      status: "accepted",
      runId: "send-run-1",
      reply: null,
      error: null,
    });
    mocked.waitForRealAgentRun.mockResolvedValue({
      runId: "run-real-1",
      status: "completed",
      error: null,
      startedAt: 10,
      endedAt: 40,
      durationMs: 30,
    });
    mocked.readLatestAssistantReply.mockResolvedValue("real output");
    mocked.autoCapture.mockResolvedValue({ stored: 1 });
  });

  it("spawns technical expert with semantic recall context", async () => {
    const tool = createSpawnExpertTool(fakeApi());

    const result = await tool.execute("id", {
      agent: "technical",
      task: "帮我写代码，顺便考虑我的历史偏好",
      wait: true,
    });

    expect(mocked.discoverAgents).toHaveBeenCalledWith("/tmp/savc-core/agents", {
      forceReload: true,
    });
    expect(mocked.search).toHaveBeenCalledTimes(1);
    expect(mocked.spawnAgent).toHaveBeenCalledTimes(1);
    // oxlint-disable-next-line typescript/no-explicit-any
    const spawnedTask = mocked.spawnAgent.mock.calls[0]?.[1] as string;
    expect(spawnedTask).toContain("[相关记忆]");
    expect(result.details).toMatchObject({ ok: true, code: "ok", error: null });
    // oxlint-disable-next-line typescript/no-explicit-any
    expect((result.details as any).data.result.status).toBe("completed");
  });

  it("persists memory when agent=memory and persistMemory=true", async () => {
    mocked.waitForAgent.mockResolvedValueOnce({
      runId: "run-2",
      agent: "memory",
      status: "completed",
      output: "memory saved",
      error: null,
      durationMs: 10,
    });
    mocked.spawnAgent.mockResolvedValueOnce("run-2");

    const tool = createSpawnExpertTool(fakeApi());

    const result = await tool.execute("id", {
      agent: "memory",
      task: "记住我喜欢 requests",
      persistMemory: true,
      wait: true,
    });

    expect(mocked.store).toHaveBeenCalledTimes(1);
    expect(mocked.autoCapture).toHaveBeenCalledTimes(1);
    expect(result.details).toMatchObject({ ok: true, code: "ok", error: null });
    // oxlint-disable-next-line typescript/no-explicit-any
    expect((result.details as any).data.memory.persisted).toBe(true);
  });

  it("returns structured not-found error for unknown agent", async () => {
    const tool = createSpawnExpertTool(fakeApi());
    const result = await tool.execute("id", { agent: "unknown", task: "x" });
    expect(result.details).toMatchObject({ ok: false, code: "AGENT_NOT_FOUND" });
  });

  it("supports real spawn backend when spawnMode=real", async () => {
    mocked.setSpawnMode("real");
    const tool = createSpawnExpertTool(fakeApi(), {
      sessionKey: "main",
      agentId: "main",
      messageChannel: "internal",
    });

    const result = await tool.execute("id", {
      agent: "technical",
      task: "帮我写个简短方案",
      wait: true,
    });

    expect(mocked.spawnRealAgent).toHaveBeenCalledTimes(1);
    expect(mocked.waitForRealAgentRun).toHaveBeenCalledTimes(1);
    expect(mocked.readLatestAssistantReply).toHaveBeenCalledTimes(1);
    expect(result.details).toMatchObject({ ok: true, code: "ok", error: null });
    // oxlint-disable-next-line typescript/no-explicit-any
    expect((result.details as any).data.spawn.mode).toBe("real");
    // oxlint-disable-next-line typescript/no-explicit-any
    expect((result.details as any).data.spawn.childSessionKey).toContain("subagent");
  });

  it("requires session context for real spawn mode", async () => {
    mocked.setSpawnMode("real");
    const tool = createSpawnExpertTool(fakeApi());

    const result = await tool.execute("id", {
      agent: "technical",
      task: "做点事",
      wait: false,
    });

    expect(result.details).toMatchObject({ ok: false, code: "MISSING_SESSION_CONTEXT" });
  });

  it("uses sessions_send bridge when useSessionsSend=true", async () => {
    mocked.setSpawnMode("real");
    const tool = createSpawnExpertTool(fakeApi(), {
      sessionKey: "main",
      agentId: "main",
      messageChannel: "internal",
    });

    const result = await tool.execute("id", {
      agent: "technical",
      task: "请给我一个简单实现方向",
      wait: false,
      useSessionsSend: true,
    });

    expect(mocked.sendRealAgentMessage).toHaveBeenCalledTimes(1);
    // oxlint-disable-next-line typescript/no-explicit-any
    expect((result.details as any).data.spawn.sessionsSend.attempted).toBe(true);
    // oxlint-disable-next-line typescript/no-explicit-any
    expect((result.details as any).data.spawn.sessionsSend.status).toBe("accepted");
  });
});
