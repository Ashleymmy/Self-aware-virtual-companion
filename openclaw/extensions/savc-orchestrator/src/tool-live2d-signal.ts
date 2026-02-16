import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import type { Live2DModule, PluginToolContext, ToolDetails } from "./types.js";
import { loadLive2DModule, resolveRuntimeContext } from "./paths.js";

function success<T>(data: T): ToolDetails<T> {
  return { ok: true, code: "ok", error: null, data };
}

function failure(code: string, error: string): ToolDetails<null> {
  return { ok: false, code, error, data: null };
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function readSource(value: unknown): "text" | "voice" | "interaction" {
  const normalized = readString(value).toLowerCase();
  if (normalized === "voice" || normalized === "interaction") {
    return normalized;
  }
  return "text";
}

export function createLive2DSignalTool(
  api: OpenClawPluginApi,
  _toolCtx?: PluginToolContext,
  deps: {
    buildLive2DSignal?: Live2DModule["buildLive2DSignal"];
    buildLive2DPlan?: Live2DModule["buildLive2DPlan"];
  } = {},
) {
  return {
    name: "savc_live2d_signal",
    description: "Build structured Live2D signal payloads (emotion/expression/lipsync/interaction).",
    parameters: Type.Object(
      {
        source: Type.Optional(
          Type.Union([Type.Literal("text"), Type.Literal("voice"), Type.Literal("interaction")], {
            description: "Signal source channel.",
          }),
        ),
        task: Type.Optional(
          Type.String({
            description: "Natural-language task text. When provided, source/emotion/interaction can be inferred.",
          }),
        ),
        message: Type.Optional(
          Type.String({
            description: "Text used for text/voice signal generation (voice drives mock lip sync).",
          }),
        ),
        emotion: Type.Optional(Type.String({ description: "Emotion tag from agent reply." })),
        interactionType: Type.Optional(
          Type.String({
            description: "Interaction event kind (tap/double_tap/drag/hover/long_press).",
          }),
        ),
        intensity: Type.Optional(Type.Number({ description: "Expression intensity factor." })),
        energy: Type.Optional(Type.Number({ description: "Lip sync energy in voice mode." })),
      },
      { additionalProperties: false },
    ),

    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const source = readSource(params.source);
      const task = readString(params.task);
      const message = readString(params.message);
      const emotion = readString(params.emotion);
      const interactionType = readString(params.interactionType);
      const intensity = readNumber(params.intensity);
      const energy = readNumber(params.energy);

      if (!task && source === "voice" && !message) {
        const details = failure("INVALID_PARAMS", "message is required when source=voice");
        return {
          content: [{ type: "text", text: "savc_live2d_signal: message is required for source=voice." }],
          details,
        };
      }

      try {
        const live2dModule =
          deps.buildLive2DSignal || deps.buildLive2DPlan
            ? {
                buildLive2DSignal: deps.buildLive2DSignal,
                buildLive2DPlan: deps.buildLive2DPlan,
              }
            : await loadLive2DModule(resolveRuntimeContext(api));

        const buildLive2DSignal = live2dModule.buildLive2DSignal;
        if (typeof buildLive2DSignal !== "function") {
          throw new Error("live2d module missing buildLive2DSignal");
        }

        let signal: ReturnType<Live2DModule["buildLive2DSignal"]>;
        let resolvedSource = source;
        if (task && typeof live2dModule.buildLive2DPlan === "function") {
          const plan = live2dModule.buildLive2DPlan(task, {
            source: typeof params.source === "string" && params.source.trim() ? source : undefined,
            message: message || undefined,
            emotion: emotion || undefined,
            interactionType: interactionType || undefined,
            intensity,
            energy,
          });
          if (plan?.signal) {
            signal = plan.signal;
            resolvedSource = readSource(plan.source ?? source);
          } else {
            signal = buildLive2DSignal({
              source,
              message,
              emotion,
              interactionType,
              intensity,
              energy,
            });
          }
        } else {
          signal = buildLive2DSignal({
            source,
            message: source === "voice" && !message && task ? task : message,
            emotion,
            interactionType,
            intensity,
            energy,
          });
        }

        const details = success({
          source: resolvedSource,
          backend: "savc-live2d-signal",
          ...(task ? { task } : {}),
          signal,
        });
        return {
          content: [
            {
              type: "text",
              text: `savc_live2d_signal => source=${resolvedSource}, emotion=${String(signal?.emotion || "neutral")}`,
            },
          ],
          details,
        };
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        const details = failure("LIVE2D_SIGNAL_FAILED", messageText);
        return {
          content: [{ type: "text", text: `savc_live2d_signal failed: ${messageText}` }],
          details,
        };
      }
    },
  };
}
