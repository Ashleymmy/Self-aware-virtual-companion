# SAVC 分离后架构概览

> 本文档展示 SAVC 自定义代码与 OpenClaw 框架分离后的架构关系、数据流和依赖图。

---

## 1. 整体架构图

```
┌──────────────────────────────────────────────────────────────────┐
│                      SAVC 仓库（自定义代码）                       │
│                                                                  │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────┐ │
│  │   savc-core/    │  │    savc-ui/      │  │savc-orchestrator│ │
│  │                 │  │                  │  │   （OpenClaw     │ │
│  │ agents/*.yaml   │  │ Lit + Vite SPA   │  │    插件）        │ │
│  │ orchestrator/   │  │ gateway-ws.ts    │  │                 │ │
│  │   *.mjs 模块    │  │ live2d-bridge.ts │  │ 7 个 Tool 实现  │ │
│  │ memory/         │  │ views/           │  │ types.ts        │ │
│  │ skills/         │  │ mock/            │  │ paths.ts        │ │
│  │ persona/        │  │ i18n/            │  │ real-session-   │ │
│  │ SOUL.md         │  │                  │  │   adapter.ts    │ │
│  └────────┬────────┘  └────────┬─────────┘  └────────┬────────┘ │
│           │                    │                      │          │
│  ┌────────┴────────┐          │                      │          │
│  │   scripts/      │          │                      │          │
│  │ setup.sh        │          │                      │          │
│  │ dev.sh          │          │                      │          │
│  │ openclaw.sh     │          │                      │          │
│  │ memory_         │          │                      │          │
│  │   semantic.mjs  │          │                      │          │
│  │ proactive_      │          │                      │          │
│  │   daemon.mjs    │          │                      │          │
│  └────────┬────────┘          │                      │          │
│           │                   │                      │          │
├───────────┼───────────────────┼──────────────────────┼──────────┤
│           │                   │                      │          │
│           ▼                   ▼                      ▼          │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              对 接 层 （接口边界）                             ││
│  │                                                             ││
│  │  CLI 调用    WebSocket :18789     Plugin SDK       内部 API ││
│  │  openclaw    ws:// 协议           registerTool()   sessions ││
│  │  agent ...   HTTP /tools/invoke   pluginConfig     spawn/   ││
│  │              /health              resolvePath()    send     ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                   OpenClaw 框架（外部依赖）                        │
│                                                                  │
│  ┌────────────────┐  ┌────────────────┐  ┌─────────────────────┐│
│  │   Gateway      │  │  Plugin SDK    │  │      CLI            ││
│  │   WS :18789    │  │  types.ts      │  │  openclaw agent     ││
│  │   HTTP /tools  │  │  registerTool  │  │  openclaw gateway   ││
│  │   /health      │  │                │  │  openclaw config    ││
│  └───────┬────────┘  └───────┬────────┘  └─────────────────────┘│
│          │                   │                                   │
│  ┌───────┴────────┐  ┌──────┴─────────┐  ┌─────────────────────┐│
│  │ Agent Runtime  │  │   Sessions     │  │  Memory（内置）       ││
│  │ spawn / wait   │  │   spawn / send │  │  memory_recall      ││
│  │ chat.history   │  │                │  │  memory_store       ││
│  └────────────────┘  └────────────────┘  └─────────────────────┘│
│                                                                  │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │  Extensions: 33 个社区扩展 + savc-orchestrator（通过路径加载）  ││
│  └──────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │  Channels: Telegram / Discord / iMessage / Web / ...         ││
│  └──────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. 消息处理数据流

用户通过频道发送消息到收到回复的完整路径：

```
用户（Telegram / Discord / iMessage / Web）
  │
  ▼
OpenClaw Gateway（WebSocket :18789）
  │
  ▼
OpenClaw Agent Runtime（main agent，加载 SOUL.md 人格）
  │
  ├──[简单消息]──→ 直接回复（不调用 Tool）
  │
  ├──[需路由]──→ savc_route
  │                │
  │                ▼
  │          savc-core/orchestrator/router.mjs
  │                │
  │                ▼
  │          savc-core/agents/*.yaml（Agent 注册表）
  │                │
  │                ▼
  │          返回：{ agent: "technical", confidence: 0.85 }
  │
  ├──[需分解]──→ savc_decompose
  │                │
  │                ▼
  │          savc-core/orchestrator/decomposer.mjs
  │                │
  │                ▼
  │          返回：{ tasks: [...], execution: "parallel" }
  │
  └──[执行任务]──→ savc_spawn_expert
                    │
                    ├── 1. 语义记忆回忆
                    │      scripts/memory_semantic.mjs
                    │      → LanceDB (savc-core/memory/vector/lancedb/)
                    │
                    ├── 2. 生成专家 Agent
                    │      ├── Mock 模式: savc-core/orchestrator/lifecycle.mjs
                    │      └── Real 模式: OpenClaw sessions_spawn API
                    │           ├── createSessionsSpawnTool()
                    │           ├── callGateway("agent.wait")
                    │           └── readLatestAssistantReply("chat.history")
                    │
                    ├── 3. Live2D 信号生成（附带）
                    │      savc-core/orchestrator/live2d.mjs
                    │
                    └── 4. 记忆自动捕获
                           scripts/memory_semantic.mjs → autoCapture()
                    │
                    ▼
             回复流回 main agent → 频道 → 用户
```

---

## 3. 主动消息数据流

系统定时主动向用户发送消息（早安、提醒等）：

```
proactive_daemon.mjs（Node.js cron 调度器）
  │
  ├── 读取 config/proactive.yaml（调度规则）
  ├── 读取 savc-core/memory/emotional/mood-log.md（情绪状态）
  ├── 调用 scripts/memory_semantic.mjs（语义搜索历史）
  ├── 获取 Google Calendar 日程（googleapis）
  ├── 获取天气数据（OpenWeather API）
  │
  ▼
proactive_dispatcher.mjs（消息分发器）
  │
  ▼
scripts/openclaw.sh（密钥注入 + CLI 封装）
  │
  ▼
openclaw agent --local \
  --session-id <key> \
  --message "<内容>" \
  --deliver \
  --reply-channel discord \
  --reply-to <target>
  │
  ▼
OpenClaw Gateway → 频道 → 用户
```

---

## 4. UI ↔ 后端数据流

savc-ui 与 OpenClaw Gateway 的通信：

```
┌─────────────────────────────────────────────┐
│              savc-ui（浏览器）                │
│                                             │
│  ┌──────────────┐    ┌───────────────────┐  │
│  │ Chat View    │    │ Live2D Bridge     │  │
│  │              │    │                   │  │
│  │ 发送/接收    │    │ 信号生成/渲染      │  │
│  │ 消息         │    │                   │  │
│  └──────┬───────┘    └────────┬──────────┘  │
│         │                     │              │
│  ┌──────┴─────────────────────┴──────────┐  │
│  │      GatewayBrowserClient             │  │
│  │      (gateway-ws.ts)                  │  │
│  └──────┬──────────────────────┬─────────┘  │
│         │                      │             │
└─────────┼──────────────────────┼─────────────┘
          │                      │
   WebSocket                HTTP POST
   ws://:18789              /tools/invoke
          │                      │
          ▼                      ▼
┌─────────────────────────────────────────────┐
│          OpenClaw Gateway                    │
│                                             │
│  connect → hello-ok                         │
│  events: 健康/日志/状态更新                   │
│  req/res: 请求/响应 (UUID 关联)              │
│                                             │
│  /tools/invoke → savc_live2d_signal          │
│                    │                         │
│                    ▼                         │
│           savc-orchestrator 插件              │
│                    │                         │
│                    ▼                         │
│           live2d.mjs → Live2D Signal         │
│                    │                         │
│                    ▼                         │
│           JSON 响应 → 浏览器渲染              │
└─────────────────────────────────────────────┘
```

---

## 5. 依赖关系图

各模块对 OpenClaw 的依赖强度分级：

```
依赖强度：●●● 直接代码依赖  ●●○ 间接/CLI 依赖  ●○○ 仅协议依赖  ○○○ 无依赖

┌───────────────────┐
│    savc-core/     │  ○○○ 无 OpenClaw 依赖
│                   │
│  orchestrator/    │  纯业务逻辑 .mjs 模块
│  agents/*.yaml    │  纯数据定义
│  memory/          │  LanceDB + Markdown
│  persona/skills/  │  纯数据/配置
└───────────────────┘

┌───────────────────┐
│    scripts/       │  ●●○ 间接依赖
│                   │
│  setup.sh         │  生成 ~/.openclaw/ 配置
│  openclaw.sh      │  封装 openclaw CLI
│  dev.sh           │  启动 openclaw gateway
│  proactive_       │  通过 CLI 发送消息
│    dispatcher.mjs │
│  memory_          │  被插件动态导入（但自身无 OC 依赖）
│    semantic.mjs   │
└───────────────────┘

┌───────────────────┐
│savc-orchestrator/ │  ●●● 直接代码依赖
│                   │
│  index.ts         │  import from "openclaw/plugin-sdk"
│  real-session-    │  import 3 个 OpenClaw 内部模块
│    adapter.ts     │  （sessions-spawn, sessions-send, gateway/call）
│  paths.ts         │  使用 api.resolvePath(), api.config
└───────────────────┘

┌───────────────────┐
│    savc-ui/       │  ●○○ 仅协议依赖
│                   │
│  gateway-ws.ts    │  WebSocket 协议（无代码导入）
│  live2d-bridge.ts │  HTTP /tools/invoke（无代码导入）
│  其他 views       │  mock 数据兜底，不直接依赖 OC 代码
└───────────────────┘

┌───────────────────┐
│  infra/docker/    │  ●●○ 构建时依赖
│                   │
│  Dockerfile.gw    │  COPY openclaw/ 源码并编译
│  docker-compose   │  编排 gateway + ui + daemon
└───────────────────┘
```

---

## 6. 配置生成流程

从源文件到运行时配置的完整链路：

```
config/.env.local                    config/openclaw/agents/*/SOUL.md
  （API 密钥）                         （人格模板）
       │                                    │
       ▼                                    ▼
  scripts/setup.sh ──────────────────────────────────────┐
       │                                                  │
       ├── 生成 ~/.openclaw/openclaw.json                │
       │     ├── models（5 个 LLM Provider）              │
       │     ├── agents（9 个 Agent 配置）                │
       │     ├── plugins（savc-orchestrator 路径+配置）    │
       │     ├── gateway（端口、认证）                     │
       │     └── channels（Telegram、Discord）             │
       │                                                  │
       ├── 同步 ~/.openclaw/.env                         │
       │                                                  │
       ├── 复制 SOUL.md → ~/.openclaw/agents/*/           │
       │                                                  │
       ├── 生成 models.json → ~/.openclaw/agents/*/agent/ │
       │                                                  │
       └── 生成 auth-profiles.json → 同上                 │
                                                          │
                                                          ▼
                                                  运行时读取配置
                                                  OpenClaw Gateway 启动
```

---

## 7. 风险点总结

| 风险等级 | 对接点 | 说明 |
|---------|--------|------|
| **高** | `real-session-adapter.ts` 的 3 处内部导入 | OpenClaw 内部重构即断裂 |
| **高** | `paths.ts` 的 `findRepoRoot()` | 依赖目录相对位置 |
| **中** | Gateway WebSocket 协议版本 | 协议升级需同步适配 |
| **中** | `setup.sh` 生成的 `openclaw.json` schema | 配置格式变化需更新生成逻辑 |
| **低** | CLI 命令参数 | 通常向后兼容 |
| **低** | HTTP `/tools/invoke` 端点 | 基础 REST 接口，较稳定 |
| **低** | Plugin SDK (`registerTool` 等) | 公开 API，变动会有 changelog |
