# SAVC 与 OpenClaw 接口文档

> 本文档记录当前仓库基线下，`packages/plugin` 如何与 `openclaw/`、`packages/core`、`scripts/runtime/*` 对接。这里描述的是已落地结构，不再讨论旧的 `openclaw/extensions/savc-orchestrator` 布局。

## 内核边界

- `openclaw/` 视为仓库内核快照，默认不在日常 SAVC 开发中直接修改其源码。
- SAVC 的功能扩展优先落在：
  - `packages/plugin`
  - `packages/core`
  - `packages/ui`
  - `scripts/*`
  - `config/*`
- 若 OpenClaw 升级导致接口变化，优先通过 SAVC 侧适配收口，而不是继续把业务逻辑散落回 `openclaw/src/*`。
- 只有在确认是 OpenClaw 内核缺陷、且无法通过外层适配解决时，才单独评估对 `openclaw/` vendor 快照做最小修补，并应作为例外处理。

## 当前基线

- OpenClaw 根目录：`<REPO_ROOT>/openclaw`
- SAVC 核心目录：`<REPO_ROOT>/packages/core`
- 插件目录：`<REPO_ROOT>/packages/plugin`
- 语义记忆运行时：`<REPO_ROOT>/scripts/runtime/memory_semantic.mjs`
- OpenClaw 配置由 `scripts/setup.sh` 生成到 `~/.openclaw/openclaw.json`

## 1. 插件入口

插件入口位于 `packages/plugin/index.ts`，导出默认 `register(api)` 函数：

```ts
import type { OpenClawPluginApi, OpenClawPluginToolContext } from "openclaw/plugin-sdk";

export default function register(api: OpenClawPluginApi) {
  api.registerTool((toolCtx: OpenClawPluginToolContext) => createRouteTool(api, toolCtx), {
    optional: true,
    name: "savc_route",
  });
}
```

当前实际注册的工具共 7 个：

- `savc_route`
- `savc_decompose`
- `savc_spawn_expert`
- `savc_agent_status`
- `savc_voice_call`
- `savc_image_generate`
- `savc_live2d_signal`

插件包信息：

```json
{
  "name": "@savc/plugin",
  "peerDependencies": {
    "openclaw": "*"
  },
  "devDependencies": {
    "openclaw": "file:../../openclaw"
  },
  "openclaw": {
    "extensions": ["./index.ts"]
  }
}
```

## 2. Plugin SDK 依赖

`packages/plugin` 依赖以下 OpenClaw Plugin SDK 能力：

| API | 用途 |
|-----|------|
| `api.registerTool()` | 注册 7 个 SAVC 工具 |
| `api.pluginConfig` | 读取 `plugins.entries["savc-orchestrator"].config` |
| `api.config` | 读取全局配置，主要使用 `agents.defaults.workspace` |
| `api.resolvePath()` | 解析相对路径配置 |

插件清单文件为 `packages/plugin/openclaw.plugin.json`，配置 schema 当前包含：

- `savcCorePath`
- `agentsDir`
- `spawnMode`
- `defaultWait`
- `defaultTimeoutMs`
- `memoryRecallEnabled`
- `memoryRecallTopK`
- `memoryMinScore`
- `memoryPersistEnabled`
- `logFile`

## 3. 路径解析约定

`packages/plugin/src/paths.ts` 的当前策略：

1. 若插件配置显式传入 `savcCorePath`，优先使用。
2. 否则读取 `api.config.agents.defaults.workspace`。
3. 若仍未配置，默认回退到 `process.cwd()/packages/core`。

`resolveRuntimeContext()` 会继续解析：

- `agentsDir`，默认 `packages/core/agents`
- `orchestratorDir`，固定 `packages/core/orchestrator`
- `repoRoot`，通过向上搜索 `scripts/runtime/memory_semantic.mjs` 确认
- `memorySemanticPath`，优先新布局 `scripts/runtime/memory_semantic.mjs`
- `logFilePath`，默认 `packages/core/memory/procedural/orchestrator.log`

当前 `findRepoRoot()` 仍兼容旧布局 `scripts/memory_semantic.mjs`，但默认目标已是新布局。

## 4. Tool 返回契约

所有工具都返回统一结构：

```ts
{
  content: [{ type: "text", text: string }],
  details: {
    ok: boolean,
    code: string,
    error: string | null,
    data: unknown
  }
}
```

关键工具约定：

- `savc_route`：返回目标 agent、置信度、理由、耗时
- `savc_decompose`：返回任务拆解结果和执行策略
- `savc_spawn_expert`：返回 runId、状态、记忆回忆、Live2D 信号、real/mock 执行信息
- `savc_agent_status`：根据 `runId` 查询状态

本轮收口没有修改这些 JSON 契约。

## 5. 深度依赖的内部 API

`packages/plugin/src/real-session-adapter.ts` 仍会加载 OpenClaw 内部模块：

- `agents/tools/sessions-spawn-tool.js`
- `agents/tools/sessions-send-tool.js`
- `gateway/call.js`

当前加载顺序：

1. 若设置 `OPENCLAW_ROOT`，优先从 `${OPENCLAW_ROOT}/src`、`${OPENCLAW_ROOT}/dist`、`${OPENCLAW_ROOT}` 查找。
2. 若未命中，再尝试 `import("openclaw/<subpath>")`。

因此当前仓库要求：

- 默认 `OPENCLAW_ROOT=<REPO_ROOT>/openclaw`
- `openclaw/` 至少完成依赖安装
- 真实执行链需要最小构建产物可用

## 6. OpenClaw 配置接入

`scripts/setup.sh` 会写入如下关键配置：

```json
{
  "agents": {
    "defaults": {
      "workspace": "<REPO_ROOT>/packages/core"
    }
  },
  "plugins": {
    "load": {
      "paths": [
        "<REPO_ROOT>/packages/plugin"
      ]
    },
    "entries": {
      "savc-orchestrator": {
        "enabled": true,
        "config": {
          "savcCorePath": "<REPO_ROOT>/packages/core",
          "spawnMode": "real"
        }
      }
    }
  }
}
```

这意味着插件发现依赖的是 `packages/plugin`，而不是旧的 OpenClaw 扩展目录。

## 7. CLI 对接

仓库内所有标准 OpenClaw 调用都应走以下 canonical root：

```bash
node "${OPENCLAW_ROOT}/openclaw.mjs" <subcommand...>
```

推荐入口：

- `bash scripts/openclaw.sh ...`
- `bash scripts/dev.sh`
- `bash scripts/setup.sh`
- `bash scripts/test/*.sh`

这些脚本都会先通过 `scripts/lib/paths.sh` 解析：

- `REPO_ROOT`
- `OPENCLAW_ROOT`
- OpenClaw 依赖安装状态
- OpenClaw 最小构建状态

## 8. 运行时边界

`packages/plugin` 直接动态加载的 SAVC 模块包括：

- `packages/core/orchestrator/router.mjs`
- `packages/core/orchestrator/decomposer.mjs`
- `packages/core/orchestrator/registry.mjs`
- `packages/core/orchestrator/lifecycle.mjs`
- `packages/core/orchestrator/vision.mjs`
- `packages/core/orchestrator/live2d.mjs`
- `scripts/runtime/memory_semantic.mjs`

`packages/ui` 不直接导入 OpenClaw 代码，只依赖：

- Gateway WebSocket 协议
- `POST /tools/invoke`
- `GET /health`

## 9. 验收检查点

升级或替换 `openclaw/` 快照后，至少核对：

1. `openclaw/plugin-sdk` 仍导出 `OpenClawPluginApi` 与 `OpenClawPluginToolContext`
2. `sessions-spawn-tool.js`、`sessions-send-tool.js`、`gateway/call.js` 仍可解析
3. `node <OPENCLAW_ROOT>/openclaw.mjs gateway` 可启动
4. `scripts/setup.sh` 生成的 `plugins.load.paths` 仍指向 `packages/plugin`
5. `cd packages/plugin && pnpm test` 可通过
