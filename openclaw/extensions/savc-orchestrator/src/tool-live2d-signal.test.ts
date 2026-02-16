import { describe, expect, it, vi } from "vitest";
import { createLive2DSignalTool } from "./tool-live2d-signal.js";

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

describe("savc_live2d_signal tool", () => {
  it("builds text signal by default", async () => {
    const buildLive2DSignal = vi.fn(() => ({
      version: "phase6-v1",
      source: "text",
      emotion: "neutral",
      motion: "idle_neutral",
      expression: {},
      lipSync: [],
    }));
    const tool = createLive2DSignalTool(fakeApi(), undefined, { buildLive2DSignal });
    const result = await tool.execute("id", {
      message: "你好",
    });

    expect(buildLive2DSignal).toHaveBeenCalledWith({
      source: "text",
      message: "你好",
      emotion: "",
      interactionType: "",
      intensity: undefined,
      energy: undefined,
    });
    expect(result.details).toMatchObject({ ok: true, code: "ok" });
  });

  it("validates voice mode message", async () => {
    const tool = createLive2DSignalTool(fakeApi(), undefined, {
      buildLive2DSignal: vi.fn(() => ({})),
    });
    const result = await tool.execute("id", {
      source: "voice",
    });
    expect(result.details).toMatchObject({ ok: false, code: "INVALID_PARAMS" });
  });

  it("builds interaction signal", async () => {
    const buildLive2DSignal = vi.fn(() => ({
      version: "phase6-v1",
      source: "interaction",
      emotion: "happy",
      motion: "wave_small",
      interaction: { type: "tap" },
      lipSync: [],
    }));
    const tool = createLive2DSignalTool(fakeApi(), undefined, { buildLive2DSignal });
    const result = await tool.execute("id", {
      source: "interaction",
      interactionType: "tap",
      intensity: 1.2,
    });

    expect(buildLive2DSignal).toHaveBeenCalledWith({
      source: "interaction",
      message: "",
      emotion: "",
      interactionType: "tap",
      intensity: 1.2,
      energy: undefined,
    });
    expect(result.details).toMatchObject({ ok: true, code: "ok" });
  });

  it("infers signal plan from task text", async () => {
    const buildLive2DPlan = vi.fn(() => ({
      source: "voice",
      emotion: "comfort",
      interactionType: null,
      signal: {
        version: "phase6-v1",
        source: "voice",
        emotion: "comfort",
        motion: "nod_soft",
        lipSync: [{ tMs: 0, mouthOpen: 0.6 }],
      },
    }));
    const buildLive2DSignal = vi.fn(() => ({
      version: "phase6-v1",
      source: "text",
      emotion: "neutral",
      motion: "idle_neutral",
      expression: {},
      lipSync: [],
    }));
    const tool = createLive2DSignalTool(fakeApi(), undefined, {
      buildLive2DSignal,
      buildLive2DPlan,
    });
    const result = await tool.execute("id", {
      task: "请语音播报一句欢迎回来",
    });

    expect(buildLive2DPlan).toHaveBeenCalledWith("请语音播报一句欢迎回来", {
      source: undefined,
      message: undefined,
      emotion: undefined,
      interactionType: undefined,
      intensity: undefined,
      energy: undefined,
    });
    expect(buildLive2DSignal).not.toHaveBeenCalled();
    expect(result.details).toMatchObject({
      ok: true,
      code: "ok",
      data: { source: "voice", task: "请语音播报一句欢迎回来" },
    });
  });
});
