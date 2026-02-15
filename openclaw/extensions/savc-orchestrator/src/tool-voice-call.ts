import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import type { Live2DModule, PluginToolContext, ToolDetails } from "./types.js";
import { loadLive2DModule, resolveRuntimeContext } from "./paths.js";

type CallGatewayFn = <T = Record<string, unknown>>(opts: {
  method: string;
  params?: unknown;
  timeoutMs?: number;
}) => Promise<T>;

let cachedCallGateway: CallGatewayFn | null = null;

function success<T>(data: T): ToolDetails<T> {
  return { ok: true, code: "ok", error: null, data };
}

function failure(code: string, error: string): ToolDetails<null> {
  return { ok: false, code, error, data: null };
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function applyEmotionHint(message: string, emotion: string): string {
  if (!emotion) {
    return message;
  }
  return `[voice_emotion:${emotion}]\n${message}`;
}

function isVoiceBackendUnavailable(message: string): boolean {
  return /(unknown method|method not found|voicecall\.)/i.test(message);
}

async function loadCallGateway(): Promise<CallGatewayFn> {
  if (cachedCallGateway) {
    return cachedCallGateway;
  }

  try {
    const src = await import("../../../src/gateway/call.js");
    if (typeof src.callGateway === "function") {
      cachedCallGateway = src.callGateway as CallGatewayFn;
      return cachedCallGateway;
    }
  } catch {
    // ignore and fallback
  }

  const dist = await import("../../../gateway/call.js");
  if (typeof dist.callGateway !== "function") {
    throw new Error("callGateway is not available");
  }
  cachedCallGateway = dist.callGateway as CallGatewayFn;
  return cachedCallGateway;
}

export function createVoiceCallTool(
  api: OpenClawPluginApi,
  _toolCtx?: PluginToolContext,
  deps: { callGateway?: CallGatewayFn; buildLive2DSignal?: Live2DModule["buildLive2DSignal"] } = {},
) {
  return {
    name: "savc_voice_call",
    description: "Bridge SAVC orchestration with voice-call plugin methods (mock/real providers).",
    parameters: Type.Object(
      {
        action: Type.String({
          description: "initiate | continue | speak | end | status",
        }),
        callId: Type.Optional(Type.String({ description: "Existing call ID." })),
        to: Type.Optional(Type.String({ description: "Target phone number." })),
        message: Type.Optional(Type.String({ description: "Speech or prompt text." })),
        mode: Type.Optional(
          Type.Union([Type.Literal("notify"), Type.Literal("conversation")], {
            description: "Call mode for initiate action.",
          }),
        ),
        emotion: Type.Optional(Type.String({ description: "Optional voice emotion hint." })),
      },
      { additionalProperties: false },
    ),

    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const action = readString(params.action).toLowerCase();
      if (!action || !["initiate", "continue", "speak", "end", "status"].includes(action)) {
        const details = failure(
          "INVALID_PARAMS",
          "action is required and must be one of: initiate, continue, speak, end, status",
        );
        return {
          content: [
            {
              type: "text",
              text: "savc_voice_call: action must be initiate|continue|speak|end|status.",
            },
          ],
          details,
        };
      }

      const callId = readString(params.callId);
      const to = readString(params.to);
      const message = readString(params.message);
      const emotion = readString(params.emotion);
      const mode = params.mode === "notify" || params.mode === "conversation" ? params.mode : null;

      let method = "";
      let gatewayParams: Record<string, unknown> = {};

      if (action === "initiate") {
        if (!message) {
          const details = failure("INVALID_PARAMS", "message is required for initiate action");
          return {
            content: [{ type: "text", text: "savc_voice_call: message is required for initiate." }],
            details,
          };
        }
        method = "voicecall.initiate";
        gatewayParams = {
          message: applyEmotionHint(message, emotion),
          ...(to ? { to } : {}),
          ...(mode ? { mode } : {}),
        };
      } else if (action === "continue") {
        if (!callId || !message) {
          const details = failure("INVALID_PARAMS", "callId and message are required for continue");
          return {
            content: [
              {
                type: "text",
                text: "savc_voice_call: callId and message are required for continue.",
              },
            ],
            details,
          };
        }
        method = "voicecall.continue";
        gatewayParams = {
          callId,
          message: applyEmotionHint(message, emotion),
        };
      } else if (action === "speak") {
        if (!callId || !message) {
          const details = failure("INVALID_PARAMS", "callId and message are required for speak");
          return {
            content: [
              { type: "text", text: "savc_voice_call: callId and message are required for speak." },
            ],
            details,
          };
        }
        method = "voicecall.speak";
        gatewayParams = {
          callId,
          message: applyEmotionHint(message, emotion),
        };
      } else if (action === "end") {
        if (!callId) {
          const details = failure("INVALID_PARAMS", "callId is required for end action");
          return {
            content: [{ type: "text", text: "savc_voice_call: callId is required for end." }],
            details,
          };
        }
        method = "voicecall.end";
        gatewayParams = { callId };
      } else {
        if (!callId) {
          const details = failure("INVALID_PARAMS", "callId is required for status action");
          return {
            content: [{ type: "text", text: "savc_voice_call: callId is required for status." }],
            details,
          };
        }
        method = "voicecall.status";
        gatewayParams = { callId };
      }

      try {
        const callGateway = deps.callGateway ?? (await loadCallGateway());
        let live2dSignal: unknown = null;
        const canBuildLive2D = message && ["initiate", "continue", "speak"].includes(action);
        if (canBuildLive2D) {
          const buildLive2DSignal = deps.buildLive2DSignal
            ? deps.buildLive2DSignal
            : (await loadLive2DModule(resolveRuntimeContext(api))).buildLive2DSignal;
          live2dSignal = buildLive2DSignal({
            source: "voice",
            message,
            emotion: emotion || "neutral",
          });
        }
        const result = await callGateway({
          method,
          params: gatewayParams,
          timeoutMs: 20_000,
        });

        const details = success({
          action,
          method,
          backend: "voice-call",
          live2dSignal,
          result,
        });
        return {
          content: [
            {
              type: "text",
              text: `savc_voice_call => action=${action}, method=${method}`,
            },
          ],
          details,
        };
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        const code = isVoiceBackendUnavailable(messageText)
          ? "VOICE_BACKEND_UNAVAILABLE"
          : "VOICE_CALL_FAILED";
        const details = failure(code, messageText);
        return {
          content: [{ type: "text", text: `savc_voice_call failed: ${messageText}` }],
          details,
        };
      }
    },
  };
}
