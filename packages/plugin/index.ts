import type { OpenClawPluginApi, OpenClawPluginToolContext } from "openclaw/plugin-sdk";
import { createAgentStatusTool } from "./src/tool-agent-status.js";
import { createDecomposeTool } from "./src/tool-decompose.js";
import { createImageGenerateTool } from "./src/tool-image-generate.js";
import { createLive2DSignalTool } from "./src/tool-live2d-signal.js";
import { createRouteTool } from "./src/tool-route.js";
import { createSpawnExpertTool } from "./src/tool-spawn-expert.js";
import { createVoiceCallTool } from "./src/tool-voice-call.js";

export default function register(api: OpenClawPluginApi) {
  api.registerTool((toolCtx: OpenClawPluginToolContext) => createRouteTool(api, toolCtx), {
    optional: true,
    name: "savc_route",
  });
  api.registerTool((toolCtx: OpenClawPluginToolContext) => createDecomposeTool(api, toolCtx), {
    optional: true,
    name: "savc_decompose",
  });
  api.registerTool((toolCtx: OpenClawPluginToolContext) => createSpawnExpertTool(api, toolCtx), {
    optional: true,
    name: "savc_spawn_expert",
  });
  api.registerTool((toolCtx: OpenClawPluginToolContext) => createAgentStatusTool(api, toolCtx), {
    optional: true,
    name: "savc_agent_status",
  });
  api.registerTool((toolCtx: OpenClawPluginToolContext) => createVoiceCallTool(api, toolCtx), {
    optional: true,
    name: "savc_voice_call",
  });
  api.registerTool((toolCtx: OpenClawPluginToolContext) => createImageGenerateTool(api, toolCtx), {
    optional: true,
    name: "savc_image_generate",
  });
  api.registerTool((toolCtx: OpenClawPluginToolContext) => createLive2DSignalTool(api, toolCtx), {
    optional: true,
    name: "savc_live2d_signal",
  });
}
