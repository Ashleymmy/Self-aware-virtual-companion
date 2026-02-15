import { describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => {
  const analyze = vi.fn(async () => ({
    type: "compound",
    execution: "parallel",
    tasks: [
      { id: "task-1", agent: "technical", task: "写代码", priority: 1, dependsOn: [] },
      { id: "task-2", agent: "memory", task: "记住偏好", priority: 2, dependsOn: [] },
    ],
  }));

  return {
    analyze,
    resolveRuntimeContext: vi.fn(() => ({
      config: {
        savcCorePath: "/tmp/savc-core",
        agentsDir: "/tmp/savc-core/agents",
        spawnMode: "mock",
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
      logFilePath: "/tmp/savc-orchestrator.log",
    })),
    loadDecomposerModule: vi.fn(async () => ({ analyze })),
  };
});

vi.mock("./paths.js", () => ({
  resolveRuntimeContext: mocked.resolveRuntimeContext,
  loadDecomposerModule: mocked.loadDecomposerModule,
}));

import { createDecomposeTool } from "./tool-decompose.js";

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

describe("savc_decompose tool", () => {
  it("returns task plan with structured details", async () => {
    const tool = createDecomposeTool(fakeApi());
    const result = await tool.execute("id", { message: "帮我写代码，顺便记住偏好" });

    expect(mocked.loadDecomposerModule).toHaveBeenCalledTimes(1);
    expect(mocked.analyze).toHaveBeenCalledWith("帮我写代码，顺便记住偏好", {
      agentsDir: "/tmp/savc-core/agents",
    });
    expect(result.details).toMatchObject({ ok: true, code: "ok", error: null });
    // oxlint-disable-next-line typescript/no-explicit-any
    expect((result.details as any).data.type).toBe("compound");
    // oxlint-disable-next-line typescript/no-explicit-any
    expect((result.details as any).data.tasks.length).toBeGreaterThanOrEqual(2);
  });

  it("validates required message", async () => {
    const tool = createDecomposeTool(fakeApi());
    const result = await tool.execute("id", {});
    expect(result.details).toMatchObject({ ok: false, code: "INVALID_PARAMS" });
  });
});
