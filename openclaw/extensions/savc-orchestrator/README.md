# SAVC Orchestrator Plugin

Bundled OpenClaw extension that exposes SAVC orchestration tools:

- `savc_route`
- `savc_decompose`
- `savc_spawn_expert` (mock by default, optional real backend)
- `savc_agent_status`
- `savc_voice_call` (bridge to `voicecall.*` gateway methods)
- `savc_image_generate` (mock/real image generation via `vision.mjs`)
- `savc_live2d_signal` (Live2D emotion/expression/lipsync/interaction signal builder)

## Config

All config lives under `plugins.entries.savc-orchestrator.config`:

- `savcCorePath?: string`
- `agentsDir?: string`
- `spawnMode?: "mock" | "real"` (default `"mock"`)
- `defaultWait?: boolean` (default `true`)
- `defaultTimeoutMs?: number` (default `60000`)
- `memoryRecallEnabled?: boolean` (default `true`)
- `memoryRecallTopK?: number` (default `3`)
- `memoryMinScore?: number` (default `0.3`)
- `memoryPersistEnabled?: boolean` (default `true`)
- `logFile?: string` (default `savc-core/memory/procedural/orchestrator.log`)

## Notes

- Default mode is `mock` for safe rollout.
- Set `spawnMode: "real"` to run experts via OpenClaw `sessions_spawn` + `agent.wait` + `chat.history`.
- In real mode, `savc_spawn_expert` can optionally enable `useSessionsSend=true` to validate `sessions_send` handoff with child sessions.
- Real mode requires a valid caller session context (`sessionKey`/`agentId`) and proper `tools.agentToAgent` + `subagents.allowAgents` policy.
- `savc_voice_call` requires the `voice-call` plugin to be enabled.
- `savc_image_generate` defaults to `mode=mock`; `mode=real` requires `OPENAI_API_KEY`.
- `savc_live2d_signal` is mock/offline only and generates deterministic signal payloads for Phase 6 UI integration.
- `savc_live2d_signal` supports `task` input for automatic source/emotion/interaction inference (via `buildLive2DPlan` when available).
