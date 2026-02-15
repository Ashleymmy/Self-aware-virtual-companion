import { describe, expect, it, vi } from "vitest";
import { createImageGenerateTool } from "./tool-image-generate.js";

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

describe("savc_image_generate tool", () => {
  it("generates mock image by default", async () => {
    const generateImage = vi.fn(async () => ({
      mode: "mock",
      provider: "mock",
      image: { id: "mock-1", url: "mock://image/mock-1.png" },
    }));
    const tool = createImageGenerateTool(fakeApi(), undefined, { generateImage });
    const result = await tool.execute("id", {
      prompt: "A minimalist SAVC logo",
    });

    expect(generateImage).toHaveBeenCalledWith({
      prompt: "A minimalist SAVC logo",
      size: "1024x1024",
      quality: "standard",
      mode: "mock",
      apiKey: process.env.OPENAI_API_KEY,
    });
    expect(result.details).toMatchObject({ ok: true, code: "ok", error: null });
    // oxlint-disable-next-line typescript/no-explicit-any
    expect((result.details as any).data.mode).toBe("mock");
  });

  it("returns missing key error when real mode has no OPENAI key", async () => {
    const generateImage = vi.fn(async () => {
      const err = new Error("OPENAI_API_KEY is required for real image generation");
      // oxlint-disable-next-line typescript/no-explicit-any
      (err as any).code = "MISSING_OPENAI_KEY";
      throw err;
    });
    const tool = createImageGenerateTool(fakeApi(), undefined, { generateImage });
    const result = await tool.execute("id", {
      prompt: "A logo",
      mode: "real",
    });

    expect(result.details).toMatchObject({ ok: false, code: "MISSING_OPENAI_KEY" });
  });

  it("validates prompt", async () => {
    const tool = createImageGenerateTool(fakeApi(), undefined, {
      generateImage: vi.fn(async () => ({})),
    });
    const result = await tool.execute("id", {
      mode: "mock",
    });
    expect(result.details).toMatchObject({ ok: false, code: "INVALID_PARAMS" });
  });
});
