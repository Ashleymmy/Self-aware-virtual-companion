# SAVC - Self-aware Virtual Companion

> 一个具备长期记忆、多 Agent 编排、主动交互和自我反思能力的 AI 虚拟伴侣系统。当前仓库基线为 `openclaw/ + packages/* + scripts/{runtime,lifecycle,test}`。

## 概览

SAVC 以仓库内置的 `openclaw/` 快照作为默认运行时，核心业务拆分为三个工作区包：

- `packages/core`：Agent、人格、记忆、编排逻辑
- `packages/ui`：管理界面与浏览器侧联调入口
- `packages/plugin`：SAVC 对 OpenClaw 的插件接入层

默认约定：

- OpenClaw 根目录：`$REPO_ROOT/openclaw`
- 核心工作区：`$REPO_ROOT/packages/core`
- UI 工作区：`$REPO_ROOT/packages/ui`
- 插件目录：`$REPO_ROOT/packages/plugin`
- 运行时脚本：`$REPO_ROOT/scripts/runtime/*`
- 生命周期脚本：`$REPO_ROOT/scripts/lifecycle/*`
- 验收脚本：`$REPO_ROOT/scripts/test/*`

`OPENCLAW_ROOT` 仍可覆盖默认 OpenClaw 路径；未设置时所有脚本都以 `./openclaw` 为默认值。

## 架构

```text
用户消息 (Discord / Telegram / Web)
         ↓
   OpenClaw Gateway (:18789)
         ↓
   packages/plugin
         ↓
  packages/core/orchestrator
         ↓
  companion / technical / creative / tooling / memory / voice / vision / vibe-coder / live2d
         ↓
  packages/core/memory + scripts/runtime/memory_semantic.mjs
```

`packages/plugin` 通过 OpenClaw Plugin SDK 注册以下工具：

- `savc_route`
- `savc_decompose`
- `savc_spawn_expert`
- `savc_agent_status`
- `savc_voice_call`
- `savc_image_generate`
- `savc_live2d_signal`

## 目录结构

```text
Self-aware-virtual-companion/
├── config/                  # 环境变量与运行配置
├── docs/                    # 设计文档、分离文档、工作日志
├── infra/docker/            # Dockerfile 与 compose 入口
├── openclaw/                # 仓库内维护的 OpenClaw 快照
├── packages/
│   ├── core/                # Agent、人格、记忆、编排逻辑
│   ├── plugin/              # OpenClaw 插件（packages/plugin）
│   └── ui/                  # 管理界面（Vite + Lit）
├── scripts/
│   ├── lib/                 # 公共 shell helper
│   ├── lifecycle/           # 阶段开关与 cron 入口
│   ├── runtime/             # 主动引擎、语义记忆、反思等运行时
│   └── test/                # 阶段验收脚本
└── package.json             # pnpm workspace 根配置
```

## 快速开始

### 环境要求

- Node.js 22+
- pnpm 8+
- Python 3.10+

### 初始化

```bash
git clone <your-fork-or-mirror>
cd Self-aware-virtual-companion

pnpm install
cp config/.env.example config/.env.local
```

在 `config/.env.local` 中填入实际 API Key 后，执行：

```bash
pnpm dev:check
pnpm setup
pnpm dev
```

说明：

- `pnpm setup` 会生成 `~/.openclaw/openclaw.json`
- `pnpm dev` 会先检查 `openclaw/` 布局，再补齐 OpenClaw 依赖与最小构建
- UI 默认从 `packages/ui` 启动，Gateway 默认从 `openclaw/openclaw.mjs gateway` 启动

### 常用命令

```bash
# OpenClaw CLI 封装
pnpm doctor
pnpm openclaw:version

# 自主开发闭环
pnpm dev:self-upgrade
pnpm yuanyuan:enable-autodev
pnpm yuanyuan:autodev --task "修复问题并验证"

# 生命周期入口
pnpm phase2:run
pnpm phase3:daily
pnpm phase3:monthly
```

## 验收

最小验收链：

```bash
pnpm dev:check
pnpm setup
bash scripts/dev.sh
cd packages/plugin && pnpm test
pnpm test:phase4a
pnpm test:phase4b:plugin
pnpm test:phase4b:plugin:real
pnpm test:phase5
pnpm test:phase6
pnpm test:status
```

容器配置校验：

```bash
docker compose -f infra/docker/docker-compose.prod.yml config
docker compose -f infra/docker/docker-compose.cloud.yml config
```

## Docker

容器入口位于 `infra/docker/`：

- `Dockerfile.gateway`：构建 OpenClaw Gateway 镜像
- `Dockerfile.runtime`：构建 UI / proactive runtime 镜像
- `docker-compose.prod.yml`：生产型 compose
- `docker-compose.cloud.yml`：带源码挂载的联调 compose

容器内路径约定同样固定为：

- `/workspace/openclaw`
- `/workspace/packages/core`
- `/workspace/packages/plugin`
- `/workspace/packages/ui`

## 开发进度

| 阶段 | 名称 | 状态 |
|------|------|------|
| Phase 0 | 环境与基础设施 | 完成 |
| Phase 1 | 人格与记忆系统 | 完成 |
| Phase 2 | 主动交互引擎 | 完成 |
| Phase 3 | 工具学习与自我反思 | 完成 |
| Phase 4a | 语义记忆检索 | 完成 |
| Phase 4b | 多 Agent 协同编排 | 完成 |
| Phase 5c | Vibe Coding | 完成 |
| Phase 5d | 实时语音交互 | 完成 |
| Phase 5e | 视觉能力 | 完成 |
| Phase 6 | Live2D 虚拟形象 | 进行中 |

## 相关文档

- `docs/separation/openclaw-interface.md`：SAVC 与 OpenClaw 的接口契约
- `docs/separation/architecture.md`：当前落地架构
- `docs/separation/inventory.md`：代码资产与依赖边界
- `docs/separation/migration-guide.md`：后续替换或升级 OpenClaw 快照的操作基线
