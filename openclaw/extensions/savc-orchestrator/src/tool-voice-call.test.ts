import { describe, expect, it, vi } from "vitest";
import { createVoiceCallTool } from "./tool-voice-call.js";

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

describe("savc_voice_call tool", () => {
  it("bridges initiate action to voicecall.initiate", async () => {
    const callGateway = vi.fn(async () => ({ callId: "call-1", initiated: true }));
    const buildLive2DSignal = vi.fn(() => ({
      version: "phase6-v1",
      source: "voice",
      emotion: "comfort",
      lipSync: [{ tMs: 0, mouthOpen: 0.6 }],
    }));
    const tool = createVoiceCallTool(fakeApi(), undefined, { callGateway, buildLive2DSignal });

    const result = await tool.execute("id", {
      action: "initiate",
      to: "+15550001234",
      message: "你好，开始通话",
      mode: "conversation",
      emotion: "empathetic",
    });

    expect(callGateway).toHaveBeenCalledWith({
      method: "voicecall.initiate",
      params: {
        to: "+15550001234",
        message: "[voice_emotion:empathetic]\n你好，开始通话",
        mode: "conversation",
      },
      timeoutMs: 20_000,
    });
    expect(buildLive2DSignal).toHaveBeenCalledWith({
      source: "voice",
      message: "你好，开始通话",
      emotion: "empathetic",
    });
    expect(result.details).toMatchObject({ ok: true, code: "ok", error: null });
    // oxlint-disable-next-line typescript/no-explicit-any
    expect((result.details as any).data.backend).toBe("voice-call");
    // oxlint-disable-next-line typescript/no-explicit-any
    expect((result.details as any).data.live2dSignal?.version).toBe("phase6-v1");
  });

  it("validates required params", async () => {
    const callGateway = vi.fn(async () => ({}));
    const buildLive2DSignal = vi.fn(() => ({}));
    const tool = createVoiceCallTool(fakeApi(), undefined, { callGateway, buildLive2DSignal });
    const result = await tool.execute("id", { action: "continue", callId: "call-1" });
    expect(result.details).toMatchObject({ ok: false, code: "INVALID_PARAMS" });
    expect(callGateway).toHaveBeenCalledTimes(0);
    expect(buildLive2DSignal).toHaveBeenCalledTimes(0);
  });

  it("maps unknown method errors to VOICE_BACKEND_UNAVAILABLE", async () => {
    const callGateway = vi.fn(async () => {
      throw new Error("unknown method: voicecall.initiate");
    });
    const buildLive2DSignal = vi.fn(() => ({
      version: "phase6-v1",
      source: "voice",
      emotion: "neutral",
    }));
    const tool = createVoiceCallTool(fakeApi(), undefined, { callGateway, buildLive2DSignal });
    const result = await tool.execute("id", {
      action: "initiate",
      message: "hello",
    });
    expect(buildLive2DSignal).toHaveBeenCalledTimes(1);
    expect(result.details).toMatchObject({ ok: false, code: "VOICE_BACKEND_UNAVAILABLE" });
  });
});
