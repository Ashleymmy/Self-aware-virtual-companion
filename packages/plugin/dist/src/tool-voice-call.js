import { Type } from "@sinclair/typebox";
import { loadLive2DModule, resolveRuntimeContext } from "./paths.js";
let cachedCallGateway = null;
function success(data) {
    return { ok: true, code: "ok", error: null, data };
}
function failure(code, error) {
    return { ok: false, code, error, data: null };
}
function readString(value) {
    return typeof value === "string" ? value.trim() : "";
}
function applyEmotionHint(message, emotion) {
    if (!emotion) {
        return message;
    }
    return `[voice_emotion:${emotion}]\n${message}`;
}
function isVoiceBackendUnavailable(message) {
    return /(unknown method|method not found|voicecall\.)/i.test(message);
}
async function resolveOpenClawModule(subPath) {
    const ocRoot = process.env.OPENCLAW_ROOT || "";
    if (ocRoot) {
        const candidates = [
            `${ocRoot}/src/${subPath}`,
            `${ocRoot}/dist/${subPath}`,
            `${ocRoot}/${subPath}`,
        ];
        for (const candidate of candidates) {
            try {
                return await import(candidate);
            }
            catch {
                // try next
            }
        }
    }
    try {
        return await import(`openclaw/${subPath.replace(/\.js$/, "")}`);
    }
    catch {
        // fallback
    }
    const relativePaths = [
        `../../../src/${subPath}`,
        `../../../${subPath}`,
    ];
    for (const rel of relativePaths) {
        try {
            return await import(rel);
        }
        catch {
            // try next
        }
    }
    throw new Error(`OpenClaw module not found: ${subPath}. Set OPENCLAW_ROOT env var or install openclaw as dependency.`);
}
async function loadCallGateway() {
    if (cachedCallGateway) {
        return cachedCallGateway;
    }
    const mod = (await resolveOpenClawModule("gateway/call.js"));
    if (typeof mod.callGateway !== "function") {
        throw new Error("callGateway is not available");
    }
    cachedCallGateway = mod.callGateway;
    return cachedCallGateway;
}
export function createVoiceCallTool(api, _toolCtx, deps = {}) {
    return {
        name: "savc_voice_call",
        description: "Bridge SAVC orchestration with voice-call plugin methods (mock/real providers).",
        parameters: Type.Object({
            action: Type.String({
                description: "initiate | continue | speak | end | status",
            }),
            callId: Type.Optional(Type.String({ description: "Existing call ID." })),
            to: Type.Optional(Type.String({ description: "Target phone number." })),
            message: Type.Optional(Type.String({ description: "Speech or prompt text." })),
            mode: Type.Optional(Type.Union([Type.Literal("notify"), Type.Literal("conversation")], {
                description: "Call mode for initiate action.",
            })),
            emotion: Type.Optional(Type.String({ description: "Optional voice emotion hint." })),
        }, { additionalProperties: false }),
        async execute(_toolCallId, params) {
            const action = readString(params.action).toLowerCase();
            if (!action || !["initiate", "continue", "speak", "end", "status"].includes(action)) {
                const details = failure("INVALID_PARAMS", "action is required and must be one of: initiate, continue, speak, end, status");
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
            let gatewayParams = {};
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
            }
            else if (action === "continue") {
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
            }
            else if (action === "speak") {
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
            }
            else if (action === "end") {
                if (!callId) {
                    const details = failure("INVALID_PARAMS", "callId is required for end action");
                    return {
                        content: [{ type: "text", text: "savc_voice_call: callId is required for end." }],
                        details,
                    };
                }
                method = "voicecall.end";
                gatewayParams = { callId };
            }
            else {
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
                let live2dSignal = null;
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
                    scopes: ["operator.admin"],
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
            }
            catch (error) {
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
