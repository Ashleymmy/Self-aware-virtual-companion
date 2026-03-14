import { Type } from "@sinclair/typebox";
import { loadVisionModule, resolveRuntimeContext } from "./paths.js";
function success(data) {
    return { ok: true, code: "ok", error: null, data };
}
function failure(code, error) {
    return { ok: false, code, error, data: null };
}
function readString(value) {
    return typeof value === "string" ? value.trim() : "";
}
function readMode(value) {
    return value === "real" ? "real" : "mock";
}
export function createImageGenerateTool(api, _toolCtx, deps = {}) {
    return {
        name: "savc_image_generate",
        description: "Generate image artifacts for SAVC vision flows (mock by default, optional OpenAI).",
        parameters: Type.Object({
            prompt: Type.String({ description: "Image generation prompt." }),
            size: Type.Optional(Type.String({ description: "Image size. Default 1024x1024." })),
            quality: Type.Optional(Type.String({ description: "Image quality. Default standard." })),
            mode: Type.Optional(Type.Union([Type.Literal("mock"), Type.Literal("real")], {
                description: "mock or real provider execution mode.",
            })),
        }, { additionalProperties: false }),
        async execute(_toolCallId, params) {
            const prompt = readString(params.prompt);
            if (!prompt) {
                const details = failure("INVALID_PARAMS", "prompt is required");
                return {
                    content: [{ type: "text", text: "savc_image_generate: prompt is required." }],
                    details,
                };
            }
            const size = readString(params.size) || "1024x1024";
            const quality = readString(params.quality) || "standard";
            const mode = readMode(params.mode);
            try {
                const generateImage = deps.generateImage
                    ? deps.generateImage
                    : (await loadVisionModule(resolveRuntimeContext(api))).generateImage;
                const result = await generateImage({
                    prompt,
                    size,
                    quality,
                    mode,
                    apiKey: process.env.OPENAI_API_KEY,
                });
                const details = success({
                    mode,
                    backend: mode === "real" ? "openai-images" : "mock",
                    prompt,
                    size,
                    quality,
                    result,
                });
                return {
                    content: [
                        {
                            type: "text",
                            text: `savc_image_generate => mode=${mode}, size=${size}, quality=${quality}`,
                        },
                    ],
                    details,
                };
            }
            catch (error) {
                const code = typeof error === "object" && error && "code" in error
                    ? String(error.code || "")
                    : "";
                const messageText = error instanceof Error ? error.message : String(error);
                const normalizedCode = code === "MISSING_OPENAI_KEY" || /OPENAI_API_KEY/i.test(messageText)
                    ? "MISSING_OPENAI_KEY"
                    : "IMAGE_GENERATE_FAILED";
                const details = failure(normalizedCode, messageText);
                return {
                    content: [{ type: "text", text: `savc_image_generate failed: ${messageText}` }],
                    details,
                };
            }
        },
    };
}
