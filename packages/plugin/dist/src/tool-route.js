import { Type } from "@sinclair/typebox";
import { loadRouterModule, resolveRuntimeContext } from "./paths.js";
function success(data) {
    return { ok: true, code: "ok", error: null, data };
}
function failure(code, error) {
    return { ok: false, code, error, data: null };
}
export function createRouteTool(api, _toolCtx) {
    return {
        name: "savc_route",
        description: "Route a user message to the best SAVC expert agent.",
        parameters: Type.Object({
            message: Type.String({ description: "User message to route." }),
            confidenceThreshold: Type.Optional(Type.Number({ description: "Optional classifier confidence threshold." })),
            agentsDir: Type.Optional(Type.String({ description: "Optional agents directory override." })),
        }, { additionalProperties: false }),
        async execute(_toolCallId, params) {
            const message = typeof params.message === "string" ? params.message.trim() : "";
            if (!message) {
                const details = failure("INVALID_PARAMS", "message is required");
                return {
                    content: [{ type: "text", text: "savc_route: message is required." }],
                    details,
                };
            }
            try {
                const confidenceThreshold = typeof params.confidenceThreshold === "number" &&
                    Number.isFinite(params.confidenceThreshold)
                    ? params.confidenceThreshold
                    : undefined;
                const agentsDir = typeof params.agentsDir === "string" ? params.agentsDir.trim() : undefined;
                const ctx = resolveRuntimeContext(api, {
                    agentsDir: agentsDir || undefined,
                });
                const router = await loadRouterModule(ctx);
                const decision = await router.routeMessage(message, {
                    agentsDir: ctx.agentsDir,
                    confidenceThreshold,
                });
                const details = success(decision);
                const content = `savc_route => agent=${decision.agent}, level=${decision.level}, confidence=${decision.confidence.toFixed(2)}, latency=${decision.latencyMs}ms`;
                return {
                    content: [{ type: "text", text: content }],
                    details,
                };
            }
            catch (error) {
                const messageText = error instanceof Error ? error.message : String(error);
                const details = failure("ROUTE_FAILED", messageText);
                return {
                    content: [{ type: "text", text: `savc_route failed: ${messageText}` }],
                    details,
                };
            }
        },
    };
}
