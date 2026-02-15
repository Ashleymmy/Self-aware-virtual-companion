import { describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => {
  const routeMessage = vi.fn(async () => ({
    agent: "companion",
    level: 1,
    confidence: 1,
    reason: "keyword-match",
    latencyMs: 2,
  }));

  return {
    routeMessage,
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
    loadRouterModule: vi.fn(async () => ({ routeMessage })),
  };
});

vi.mock("./paths.js", () => ({
  resolveRuntimeContext: mocked.resolveRuntimeContext,
  loadRouterModule: mocked.loadRouterModule,
}));

import { createRouteTool } from "./tool-route.js";

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

describe("savc_route tool", () => {
  it("returns route decision with structured details", async () => {
    const tool = createRouteTool(fakeApi());
    const result = await tool.execute("id", { message: "抱抱我" });

    expect(mocked.loadRouterModule).toHaveBeenCalledTimes(1);
    expect(mocked.routeMessage).toHaveBeenCalledWith("抱抱我", {
      agentsDir: "/tmp/savc-core/agents",
      confidenceThreshold: undefined,
    });
    expect(result.details).toMatchObject({ ok: true, code: "ok", error: null });
    // oxlint-disable-next-line typescript/no-explicit-any
    expect((result.details as any).data.agent).toBe("companion");
  });

  it("validates required message", async () => {
    const tool = createRouteTool(fakeApi());
    const result = await tool.execute("id", {});
    expect(result.details).toMatchObject({ ok: false, code: "INVALID_PARAMS" });
  });
});
