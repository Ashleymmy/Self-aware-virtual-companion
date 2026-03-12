import { describe, expect, it } from "vitest";
import { resolvePluginConfig } from "./config.js";

describe("resolvePluginConfig", () => {
  it("defaults to mock spawn mode", () => {
    const cfg = resolvePluginConfig({});
    expect(cfg.spawnMode).toBe("mock");
  });

  it("accepts real spawn mode", () => {
    const cfg = resolvePluginConfig({ spawnMode: "real" });
    expect(cfg.spawnMode).toBe("real");
  });

  it("falls back to mock for invalid spawn mode", () => {
    const cfg = resolvePluginConfig({ spawnMode: "invalid-value" });
    expect(cfg.spawnMode).toBe("mock");
  });
});
