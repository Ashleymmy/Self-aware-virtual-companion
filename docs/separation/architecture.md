# SAVC 当前架构概览

> 本文档描述已经落地的 SAVC 仓库结构与运行边界。当前不再存在“插件仍嵌在 `openclaw/extensions/` 下”的旧架构。

## 1. 仓库结构

```text
Self-aware-virtual-companion/
├── openclaw/                  # 仓库内 OpenClaw 快照
├── packages/core/            # Agent、人格、记忆、编排核心
├── packages/plugin/          # OpenClaw 插件接入层
├── packages/ui/              # 管理界面
├── scripts/lib/              # 路径解析、密钥注入等 helper
├── scripts/runtime/          # 主动引擎、语义记忆、反思运行时
├── scripts/lifecycle/        # 阶段 enable / cron / run 入口
├── scripts/test/             # 阶段验收
├── config/                   # 环境与运行配置
└── infra/docker/             # 镜像与 compose
```

## 2. 运行时分层

### OpenClaw 层

- Gateway
- Plugin SDK
- CLI
- sessions / gateway 内部工具

### SAVC 插件层

`packages/plugin` 负责：

- 注册 7 个工具
- 解析 `packages/core` 与 `scripts/runtime/*`
- 在 real 模式下桥接 OpenClaw sessions / gateway 内部能力

### SAVC 核心层

`packages/core` 负责：

- Agent 定义
- 路由与拆解
- 执行生命周期
- 记忆与人格
- Vision / Live2D / voice 编排模块

### SAVC 运行时层

`scripts/runtime` 负责：

- 语义记忆检索与持久化
- 主动消息守护进程与分发
- 自我反思、工具学习、人格微调

### UI 层

`packages/ui` 通过 Gateway 协议进行联调，不直接导入 OpenClaw 代码。

## 3. 消息流

```text
Channel (Discord / Telegram / Web)
  -> OpenClaw Gateway
  -> packages/plugin
  -> packages/core/orchestrator
  -> expert agents / memory runtime
  -> OpenClaw Gateway
  -> Channel reply
```

典型路径：

1. 用户消息进入 Gateway。
2. 主 agent 决定是否调用 `savc_route` / `savc_decompose` / `savc_spawn_expert`。
3. `packages/plugin` 动态加载 `packages/core/orchestrator/*.mjs`。
4. 如需语义记忆，则调用 `scripts/runtime/memory_semantic.mjs`。
5. 如需真实专家会话，则通过 `real-session-adapter.ts` 调用 OpenClaw 内部 sessions / gateway API。

## 4. 主动消息流

```text
scripts/runtime/proactive_daemon.mjs
  -> scripts/runtime/proactive_dispatcher.mjs
  -> scripts/openclaw.sh
  -> node openclaw/openclaw.mjs agent ...
  -> Gateway / Channel
```

这里的关键约束是：所有 OpenClaw CLI 调用都以 `${OPENCLAW_ROOT}/openclaw.mjs` 为 canonical root。

## 5. 配置流

`scripts/setup.sh` 负责生成 `~/.openclaw/openclaw.json`，关键内容包括：

- `agents.defaults.workspace = <REPO_ROOT>/packages/core`
- `plugins.load.paths` 包含 `<REPO_ROOT>/packages/plugin`
- `plugins.entries["savc-orchestrator"]` 的默认配置

这使得 OpenClaw 与 SAVC 的边界清晰固定在工作区根目录，而不是依赖旧的相对嵌套路径。

## 6. 依赖强度

### 强依赖

- `packages/plugin -> openclaw/plugin-sdk`
- `packages/plugin -> openclaw` 内部 sessions / gateway 模块

### 中依赖

- `scripts/openclaw.sh`
- `scripts/dev.sh`
- `scripts/setup.sh`
- `scripts/test/*`

这些脚本依赖 `openclaw/` 可安装、可构建、可执行。

### 弱依赖

- `packages/ui`

UI 只依赖 Gateway 协议和工具调用接口。

## 7. Docker 架构

容器内统一目录约定：

- `/workspace/openclaw`
- `/workspace/packages/core`
- `/workspace/packages/plugin`
- `/workspace/packages/ui`

镜像分工：

- `Dockerfile.gateway`：Gateway 镜像
- `Dockerfile.runtime`：UI / proactive runtime 镜像

compose 分工：

- `docker-compose.cloud.yml`：源码挂载联调
- `docker-compose.prod.yml`：无源码挂载的生产型布局

## 8. 验收入口

当前架构的主要验收入口：

- `pnpm dev:check`
- `pnpm setup`
- `bash scripts/dev.sh`
- `cd packages/plugin && pnpm test`
- `pnpm test:phase4b:plugin`
- `pnpm test:phase5`
- `pnpm test:phase6`
