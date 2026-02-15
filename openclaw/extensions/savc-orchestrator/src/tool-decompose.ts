import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import type { PluginToolContext, ToolDetails } from "./types.js";
import { loadDecomposerModule, resolveRuntimeContext } from "./paths.js";

function success<T>(data: T): ToolDetails<T> {
  return { ok: true, code: "ok", error: null, data };
}

function failure(code: string, error: string): ToolDetails<null> {
  return { ok: false, code, error, data: null };
}

export function createDecomposeTool(api: OpenClawPluginApi, _toolCtx?: PluginToolContext) {
  return {
    name: "savc_decompose",
    description: "Analyze message complexity and return SAVC task plan.",
    parameters: Type.Object(
      {
        message: Type.String({ description: "User message to decompose." }),
        agentsDir: Type.Optional(
          Type.String({ description: "Optional agents directory override." }),
        ),
      },
      { additionalProperties: false },
    ),

    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const message = typeof params.message === "string" ? params.message.trim() : "";
      if (!message) {
        const details = failure("INVALID_PARAMS", "message is required");
        return {
          content: [{ type: "text", text: "savc_decompose: message is required." }],
          details,
        };
      }

      try {
        const agentsDir =
          typeof params.agentsDir === "string" ? params.agentsDir.trim() : undefined;

        const ctx = resolveRuntimeContext(api, {
          agentsDir: agentsDir || undefined,
        });
        const decomposer = await loadDecomposerModule(ctx);

        const plan = await decomposer.analyze(message, { agentsDir: ctx.agentsDir });
        const details = success(plan);
        const content = `savc_decompose => type=${plan.type}, execution=${plan.execution}, tasks=${plan.tasks.length}`;

        return {
          content: [{ type: "text", text: content }],
          details,
        };
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        const details = failure("DECOMPOSE_FAILED", messageText);
        return {
          content: [{ type: "text", text: `savc_decompose failed: ${messageText}` }],
          details,
        };
      }
    },
  };
}
