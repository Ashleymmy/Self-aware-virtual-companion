# SAVC 与 OpenClaw 对接接口文档

> 本文档详细记录 SAVC 自定义代码与 OpenClaw 框架之间的所有对接点，
> 包括 API 契约、协议规范、配置 schema 和运行时目录结构。
> 接入新版 OpenClaw 时，逐项核对本文档即可确定兼容性。

---

## 目录

1. [插件系统接口](#1-插件系统接口)
2. [注册工具 Schema](#2-注册工具-schema7-个)
3. [深度依赖的内部 API](#3-深度依赖的内部-api)
4. [Gateway WebSocket 协议](#4-gateway-websocket-协议)
5. [HTTP API](#5-http-api)
6. [运行时配置生成](#6-运行时配置生成)
7. [运行时目录结构](#7-运行时目录结构)
8. [CLI 接口](#8-cli-接口)
9. [动态模块加载](#9-动态模块加载)

---

## 1. 插件系统接口

### 1.1 插件注册 API

SAVC 通过 OpenClaw 的插件系统接入。入口文件导出一个 `register` 函数：

```typescript
// savc-orchestrator/index.ts
import type { OpenClawPluginApi, OpenClawPluginToolContext } from "openclaw/plugin-sdk";

export default function register(api: OpenClawPluginApi) {
  api.registerTool(factory, { optional: true, name: "tool_name" });
}
```

**使用的 `OpenClawPluginApi` 方法**：

| 方法 | 用途 | 调用位置 |
|------|------|----------|
| `api.registerTool(factory, opts)` | 注册 Tool（共 7 个） | `index.ts` |
| `api.pluginConfig` | 读取插件配置块 | `src/config.ts` |
| `api.config` | 读取全局 OpenClaw 配置 | `src/paths.ts`（读 `agents.defaults.workspace`） |
| `api.resolvePath(input)` | 解析相对路径 | `src/paths.ts` |

**`OpenClawPluginApi` 类型定义位置**：`openclaw/src/plugins/types.ts`

### 1.2 插件清单 (`openclaw.plugin.json`)

```json
{
  "id": "savc-orchestrator",
  "name": "SAVC Orchestrator",
  "description": "SAVC orchestration tools for routing, decomposition, expert spawning, voice-call bridge, image generation, and Live2D signaling.",
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "savcCorePath":        { "type": "string" },
      "agentsDir":           { "type": "string" },
      "spawnMode":           { "type": "string", "enum": ["mock", "real"] },
      "defaultWait":         { "type": "boolean" },
      "defaultTimeoutMs":    { "type": "number", "minimum": 1 },
      "memoryRecallEnabled": { "type": "boolean" },
      "memoryRecallTopK":    { "type": "number", "minimum": 1 },
      "memoryMinScore":      { "type": "number", "minimum": 0, "maximum": 1 },
      "memoryPersistEnabled":{ "type": "boolean" },
      "logFile":             { "type": "string" }
    }
  }
}
```

### 1.3 插件包依赖声明

```json
{
  "name": "@openclaw/savc-orchestrator",
  "devDependencies": { "openclaw": "workspace:*" },
  "openclaw": { "extensions": ["./index.ts"] }
}
```

剥离后应改为 `peerDependencies` 并指定版本范围。

### 1.4 Tool Factory 上下文

每个 Tool 工厂函数接收的上下文类型：

```typescript
type OpenClawPluginToolContext = {
  config?: OpenClawConfig;
  workspaceDir?: string;
  agentDir?: string;
  agentId?: string;
  sessionKey?: string;
  messageChannel?: string;
  agentAccountId?: string;
  sandboxed?: boolean;
};
```

### 1.5 Tool 通用返回契约

所有 Tool 的返回格式：

```typescript
{
  content: [{ type: "text", text: string }],  // 给 LLM 的文本摘要
  details: ToolDetails<T>                       // 结构化数据
}

type ToolDetails<T> = {
  ok: boolean;           // 成功标志
  code: string;          // "ok" 或错误码（"INVALID_PARAMS", "ROUTE_FAILED" 等）
  error: string | null;  // 错误信息
  data: T | null;        // 工具特定结果
};
```

---

## 2. 注册工具 Schema（7 个）

### 2.1 savc_route

> 将用户消息路由到最佳专家 Agent。

**输入参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `message` | string | 是 | 用户消息 |
| `confidenceThreshold` | number | 否 | 置信度阈值 |
| `agentsDir` | string | 否 | Agent 目录覆盖 |

**返回数据** (`ToolDetails<RouteDecision>`)：

```typescript
{
  agent: string,          // 目标 Agent 名称
  level: number,          // 路由层级
  confidence: number,     // 置信度 0-1
  reason: string,         // 路由原因
  latencyMs: number,      // 路由耗时
  messageSummary?: string // 消息摘要
}
```

### 2.2 savc_decompose

> 分析消息复杂度，生成任务执行计划。

**输入参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `message` | string | 是 | 用户消息 |
| `agentsDir` | string | 否 | Agent 目录覆盖 |

**返回数据** (`ToolDetails<TaskPlan>`)：

```typescript
{
  type: "simple" | "compound",
  tasks: Array<{
    id: string,
    agent: string,
    task: string,
    priority: number,
    dependsOn: string[]
  }>,
  execution: "parallel" | "sequential" | "mixed"
}
```

### 2.3 savc_spawn_expert

> 生成专家 Agent 执行任务（mock 或 real 模式）。

**输入参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `agent` | string | 是 | 目标 Agent 名称 |
| `task` | string | 是 | 任务描述 |
| `wait` | boolean | 否 | 是否等待完成 |
| `timeoutMs` | number | 否 | 超时时间 |
| `recallQuery` | string | 否 | 语义回忆查询覆盖 |
| `recallLimit` | number | 否 | 回忆 topK 覆盖 |
| `persistMemory` | boolean | 否 | 是否持久化记忆 |
| `useSessionsSend` | boolean | 否 | real 模式下是否发送协调消息 |
| `handoffMessage` | string | 否 | 自定义协调消息 |
| `handoffTimeoutSeconds` | number | 否 | 协调消息超时 |

**返回数据**：

```typescript
{
  result: {
    runId: string,
    agent: string,
    status: string,
    output: string | null,
    durationMs: number | null,
    error: string | null
  },
  live2d: {
    attempted: boolean,
    source: string | null,
    emotion: string | null,
    signal: Record<string, unknown> | null,
    error: string | null
  },
  memory: {
    recallEnabled: boolean,
    recallCount: number,
    persisted: boolean,
    autoCapture: { attempted: boolean, stored: number, error: string | null }
  },
  spawn: {
    mode: "mock" | "real",
    wait: boolean,
    timeoutMs: number,
    childSessionKey: string | null,
    sessionsSend: { attempted: boolean, ok: boolean, status: string | null, error: string | null }
  }
}
```

### 2.4 savc_agent_status

> 查询已生成的 Agent 运行状态。

**输入参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `runId` | string | 是 | savc_spawn_expert 返回的 runId |

**返回数据**：

```typescript
{
  runId: string,
  agent: string,
  status: string,
  output: string | null,
  durationMs: number | null,
  error: string | null,
  live2d: { attempted: boolean, signal: Record<string, unknown> | null, error: string | null }
}
```

### 2.5 savc_voice_call

> 语音通话桥接（连接 OpenClaw voice-call 插件）。

**输入参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `action` | string | 是 | `initiate` / `continue` / `speak` / `end` / `status` |
| `callId` | string | 否 | 通话 ID |
| `to` | string | 否 | 目标号码 |
| `message` | string | 否 | 语音文本 |
| `mode` | string | 否 | `notify` / `conversation` |
| `emotion` | string | 否 | 情绪提示 |

**返回数据**：

```typescript
{
  action: string,
  method: string,
  backend: "voice-call",
  live2dSignal: unknown,
  result: Record<string, unknown>
}
```

### 2.6 savc_image_generate

> 图像生成（mock 或 OpenAI 实际调用）。

**输入参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `prompt` | string | 是 | 生成提示词 |
| `size` | string | 否 | 图像尺寸（默认 1024x1024） |
| `quality` | string | 否 | 图像质量（默认 standard） |
| `mode` | string | 否 | `mock` / `real` |

**返回数据**：

```typescript
{
  mode: "mock" | "real",
  backend: "openai-images" | "mock",
  prompt: string,
  size: string,
  quality: string,
  result: {
    provider?: string,
    model?: string,
    image?: Record<string, unknown> | null,
    createdAt?: number
  }
}
```

### 2.7 savc_live2d_signal

> 构建 Live2D 信号（情绪/表情/口型/交互）。

**输入参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `source` | string | 否 | `text` / `voice` / `interaction` |
| `task` | string | 否 | 自然语言任务描述（可推断 source/emotion） |
| `message` | string | 否 | 文本内容（驱动 mock 口型同步） |
| `emotion` | string | 否 | 情绪标签 |
| `interactionType` | string | 否 | 交互类型（tap/double_tap/drag/hover/long_press） |
| `intensity` | number | 否 | 表情强度系数 |
| `energy` | number | 否 | 口型能量（voice 模式） |

**返回数据**：

```typescript
{
  source: "text" | "voice" | "interaction",
  backend: "savc-live2d-signal",
  task?: string,
  signal: {
    version?: string,
    source?: string,
    createdAt?: number,
    emotion?: string,
    motion?: string,
    transitionMs?: number,
    expression?: Record<string, unknown> | null,
    lipSync?: Array<{ tMs?: number, mouthOpen?: number }>,
    interaction?: Record<string, unknown> | null
  }
}
```

---

## 3. 深度依赖的内部 API

> **风险最高的对接点**。以下 3 个模块不属于 OpenClaw 公开 Plugin SDK，
> 通过相对路径导入。新版 OpenClaw 若重构内部结构，这些导入将断裂。

### 3.1 createSessionsSpawnTool

**来源文件**：`openclaw/src/agents/tools/sessions-spawn-tool.ts`

**导入方式**（`real-session-adapter.ts` L204, L213）：

```typescript
// 尝试 src/ 目录（开发模式）
import("../../../src/agents/tools/sessions-spawn-tool.js")
// fallback 到 dist/ 目录（编译后）
import("../../../agents/tools/sessions-spawn-tool.js")
```

**类型签名**：

```typescript
type CreateSessionsSpawnTool = (opts?: {
  agentSessionKey?: string;
  agentChannel?: string;
  agentAccountId?: string;
  requesterAgentIdOverride?: string;
}) => {
  execute: (toolCallId: string, args: {
    task: string;
    agentId: string;
    label?: string;
    cleanup?: string;
    runTimeoutSeconds?: number;
  }) => Promise<SpawnToolResult>;
};
```

**用途**：在 real 模式下生成子 Agent 会话。

### 3.2 createSessionsSendTool

**来源文件**：`openclaw/src/agents/tools/sessions-send-tool.ts`

**导入方式**（`real-session-adapter.ts` L227, L236）：同上模式

**类型签名**：

```typescript
type CreateSessionsSendTool = (opts?: {
  agentSessionKey?: string;
  agentChannel?: string;
  sandboxed?: boolean;
}) => {
  execute: (toolCallId: string, args: {
    sessionKey: string;
    message: string;
    timeoutSeconds?: number;
  }) => Promise<SpawnToolResult>;
};
```

**用途**：向子会话发送协调消息。

### 3.3 callGateway

**来源文件**：`openclaw/src/gateway/call.ts`

**导入方式**（`real-session-adapter.ts` L250, L259）：同上模式

**类型签名**：

```typescript
type CallGatewayFn = <T = Record<string, unknown>>(opts: {
  method: string;
  params?: unknown;
  timeoutMs?: number;
}) => Promise<T>;
```

**使用的 Gateway 方法**：

| 方法 | 用途 | 调用位置 |
|------|------|----------|
| `agent.wait` | 等待 Agent 运行完成 | `waitForRealAgentRun()` |
| `chat.history` | 读取会话聊天记录 | `readLatestAssistantReply()` |

---

## 4. Gateway WebSocket 协议

### 4.1 连接参数

| 项目 | 值 |
|------|-----|
| 默认 URL | `ws://127.0.0.1:18789` |
| 协议版本 | 3（minProtocol=3, maxProtocol=3） |
| 认证模式 | token（`gateway.auth.mode: "token"`） |

### 4.2 帧格式

**请求帧**：
```json
{ "type": "req", "id": "<uuid>", "method": "<string>", "params": "<unknown>" }
```

**响应帧**：
```json
{ "type": "res", "id": "<string>", "ok": true, "payload": "<unknown>" }
{ "type": "res", "id": "<string>", "ok": false, "error": { "code": "<string>", "message": "<string>" } }
```

**事件帧**：
```json
{ "type": "event", "event": "<string>", "payload": "<unknown>", "seq": "<number>" }
```

**Hello-OK 帧**（连接成功后）：
```json
{
  "type": "hello-ok",
  "protocol": 3,
  "features": { "methods": ["..."], "events": ["..."] },
  "auth": { "deviceToken": "...", "role": "...", "scopes": ["..."] },
  "policy": { "tickIntervalMs": 5000 }
}
```

### 4.3 连接握手流程

1. 客户端打开 WebSocket 连接
2. 客户端发送 `connect` 请求（携带 client metadata、auth token、device identity）
3. 服务端可能发送 `connect.challenge` 事件（携带 nonce）
4. 客户端用 nonce 重新签名并重发 `connect`
5. 服务端返回 `hello-ok` 响应
6. 握手完成，可收发消息

### 4.4 设备认证签名

客户端使用 Ed25519 密钥对：
- 生成签名 payload 格式：`v2|{deviceId}|{clientId}|{clientMode}|{role}|{scopes}|{signedAtMs}|{token}|{nonce}`
- 签名算法：Ed25519
- 密钥存储：浏览器 localStorage
- deviceId：公钥的 SHA-256 指纹

### 4.5 重连策略

- 初始退避：800ms
- 退避增长：× 1.7
- 最大退避：15,000ms
- 连接失败时关闭码：4008

---

## 5. HTTP API

### 5.1 POST /tools/invoke

> savc-ui 用此端点调用 Live2D 信号生成。

**请求**：
```json
POST http://127.0.0.1:18789/tools/invoke
Content-Type: application/json

{
  "tool": "savc_live2d_signal",
  "sessionKey": "main",
  "args": {
    "source": "text",
    "message": "你好",
    "emotion": "happy"
  }
}
```

**响应**：
```json
{
  "ok": true,
  "result": {
    "content": [{ "type": "text", "text": "..." }],
    "details": { "ok": true, "code": "ok", "data": { ... } }
  }
}
```

**超时**：客户端设置 8 秒。

### 5.2 GET /health

> Docker 健康检查使用。

**响应**：HTTP 200 表示正常。

---

## 6. 运行时配置生成

`scripts/setup.sh` 生成 `~/.openclaw/openclaw.json`，核心段落如下：

### 6.1 models 段

定义 LLM Provider：

```json
{
  "models": {
    "volces": {
      "type": "openai-compat",
      "baseUrl": "...",
      "models": ["doubao-*-250k", ...]
    },
    "anyrouter": {
      "type": "openai-compat",
      "baseUrl": "...",
      "models": ["claude-opus-4-*", "claude-sonnet-4-*", ...]
    }
  }
}
```

### 6.2 agents 段

定义 9 个 Agent：

```json
{
  "agents": {
    "defaults": {
      "primary": { "provider": "volces", "model": "doubao-..." },
      "fallbacks": [...],
      "workspace": "/path/to/savc-core",
      "memorySearch": { "enabled": true }
    },
    "list": {
      "main": { "agentDir": "...", "tools": { "profile": "coding" } },
      "companion": { "agentDir": "...", "tools": { "profile": "messaging" } },
      ...
    }
  }
}
```

Agent 列表：`main`, `companion`, `memory`, `technical`, `creative`, `tooling`, `voice`, `vision`, `vibe-coder`

### 6.3 plugins 段

```json
{
  "plugins": {
    "load": {
      "paths": [
        "<OPENCLAW_DIR>/extensions/savc-orchestrator",
        "<OPENCLAW_DIR>/extensions/imessage"
      ]
    },
    "entries": {
      "savc-orchestrator": {
        "enabled": true,
        "config": {
          "savcCorePath": "<WORKSPACE_DIR>",
          "spawnMode": "real",
          "defaultWait": true,
          "defaultTimeoutMs": 120000,
          "memoryRecallEnabled": true,
          "memoryRecallTopK": 5,
          "memoryMinScore": 0.25,
          "memoryPersistEnabled": true
        }
      }
    }
  }
}
```

### 6.4 gateway 段

```json
{
  "gateway": {
    "port": 18789,
    "mode": "local",
    "auth": {
      "mode": "token",
      "token": "${OPENCLAW_GATEWAY_TOKEN}"
    }
  }
}
```

### 6.5 channels 段

```json
{
  "channels": {
    "telegram": { "enabled": true, "botToken": "..." },
    "discord": { "enabled": true, "botToken": "..." }
  }
}
```

---

## 7. 运行时目录结构

`~/.openclaw/` 下的目录结构（由 setup.sh 生成 + OpenClaw 运行时创建）：

```
~/.openclaw/
├── openclaw.json              # 主配置（setup.sh 生成）
├── .env                       # API 密钥（从 config/.env.local 同步）
├── credentials/               # OAuth/认证配置
└── agents/
    ├── main/
    │   ├── SOUL.md            # 人格文件（从 config/openclaw/agents/main/ 复制）
    │   └── agent/
    │       ├── models.json    # 模型 Provider 配置（setup.sh 生成）
    │       └── auth-profiles.json  # Provider 凭证（setup.sh 生成）
    ├── companion/             # 同上结构
    ├── memory/
    ├── technical/
    ├── creative/
    ├── tooling/
    ├── voice/
    ├── vision/
    └── vibe-coder/
```

---

## 8. CLI 接口

### 8.1 主动消息分发

`scripts/proactive_dispatcher.mjs` 调用：

```bash
openclaw agent \
  --local \
  --session-id <session-key> \
  --message "<message>" \
  --deliver \
  --reply-channel <channel> \
  --reply-to <target> \
  --json
```

### 8.2 Gateway 启动

`scripts/dev.sh` 调用：

```bash
node --watch openclaw.mjs gateway --force
```

生产环境（Docker）：

```bash
node /workspace/openclaw/dist/index.js gateway --bind lan --port 18789
```

### 8.3 OpenClaw CLI 封装

`scripts/openclaw.sh` 的流程：
1. 加载 `config/.env.local` 中的密钥
2. 同步密钥到 `~/.openclaw/.env`
3. 执行 `openclaw "$@"`

---

## 9. 动态模块加载

savc-orchestrator 插件通过 `paths.ts` 动态导入 SAVC 的 `.mjs` 模块：

### 9.1 模块解析流程

```
1. 读取插件配置 → 确定 savcCorePath
2. 若未配置 → 从 api.config.agents.defaults.workspace 读取
3. 若仍未找到 → 默认 process.cwd()/savc-core
4. orchestratorDir = savcCorePath/orchestrator/
5. repoRoot = findRepoRoot() 向上搜索 scripts/memory_semantic.mjs
```

### 9.2 加载的模块清单

| 模块路径 | 导出函数 | 调用的 Tool |
|---------|---------|-------------|
| `{orchestratorDir}/router.mjs` | `routeMessage()` | savc_route |
| `{orchestratorDir}/decomposer.mjs` | `analyze()` | savc_decompose |
| `{orchestratorDir}/lifecycle.mjs` | `spawnAgent()`, `waitForAgent()`, `getStatus()` | savc_spawn_expert, savc_agent_status |
| `{orchestratorDir}/registry.mjs` | `discoverAgents()`, `getAgent()` | savc_route, savc_decompose |
| `{orchestratorDir}/live2d.mjs` | `buildLive2DSignal()` | savc_live2d_signal, savc_spawn_expert |
| `{orchestratorDir}/vision.mjs` | `generateImage()` | savc_image_generate |
| `{repoRoot}/scripts/memory_semantic.mjs` | `search()`, `store()`, `autoCapture()` | savc_spawn_expert |

### 9.3 模块加载验证

每个模块加载后会检查导出函数是否存在：

```typescript
const mod = await importModule<RouterModule>(modulePath);
if (typeof mod.routeMessage !== "function") {
  throw new Error(`invalid router module export: ${modulePath}`);
}
```

若函数签名不匹配将抛出运行时错误。
