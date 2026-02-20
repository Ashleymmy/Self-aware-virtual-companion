# SAVC - Self-aware Virtual Companion

> 一个具备自我学习与自主行动能力的 AI 虚拟伴侣系统，基于 [OpenClaw](https://github.com/open-webui/open-webui) 框架构建。

## 项目概述

SAVC 是一套完整的 AI 虚拟伴侣解决方案，通过多 Agent 协同编排、混合记忆系统、主动式交互引擎和自我反思机制，实现具有人格一致性、长期记忆和自主成长能力的虚拟伴侣。

### 核心特性

- **多 Agent 协同编排** — 9 个专业化 Agent 组成的智能体集群，通过意图路由和任务分解实现高效协作
- **混合记忆系统** — Markdown 文件 + LanceDB 向量数据库双层架构，支持关键词/语义/混合检索
- **主动式交互引擎** — 基于 cron 调度的自主消息推送，集成 Google 日历与天气服务
- **自我反思与工具学习** — 自主分析对话模式、学习新工具、持续优化行为策略
- **多平台接入** — 支持 Discord、Telegram、Web 等多种消息通道
- **人格一致性** — 通过 SOUL 系统和声音/价值观配置保持跨场景人格连贯
- **本地优先** — 全部数据本地存储，无云端依赖，保障隐私安全

## 架构设计

```
用户消息 (Discord / Telegram / Web)
         ↓
   OpenClaw Gateway (WebSocket :18789)
         ↓
  ┌──────────────────────┐
  │  Orchestrator Agent  │  ← 意图识别 · 任务分解 · 结果聚合
  └──────────┬───────────┘
             ↓
  ┌──────┬──────┬──────┬──────┬──────┐
  │陪伴  │技术  │创意  │工具  │记忆  │
  │Agent │Agent │Agent │Agent │Agent │
  └──────┴──────┴──────┴──────┴──────┘
             ↓
    共享记忆层 (LanceDB + Markdown)
```

### Agent 职能分工

| Agent | 职责 | 模型 |
|-------|------|------|
| **Orchestrator** | 意图路由、任务分解、结果聚合 | Claude Opus 4.5 |
| **Companion** | 情感陪伴、日常聊天、心理安抚 | Claude Sonnet 4 |
| **Technical** | 代码调试、架构分析、技术优化 | Claude Opus 4.5 |
| **Creative** | 文案创作、头脑风暴、命名建议 | Claude Sonnet 4 |
| **Tooling** | 天气查询、日历管理、外部 API | Claude Sonnet 4 |
| **Memory** | 长期记忆管理与召回 | Claude Opus 4.5 |
| **Vibe-Coder** | 自然语言编程、项目生成、自动修复循环 | Claude Opus 4.5 |
| **Voice** | 语音会话编排、通话控制、情绪语调映射 | Claude Sonnet 4 |
| **Vision** | 图像理解、截图排障、UI 审查、图像生成编排 | Claude Opus 4.5 |
| **Live2D** | 表情/口型/动作信号编排（Phase 6 后端信号层 + UI runtime 接入） | Claude Sonnet 4 |

## 项目结构

```
Self-aware-virtual-companion/
├── config/                  # 环境与运行时配置
│   ├── channels.yaml       #   消息通道配置
│   ├── models.yaml         #   模型供应商配置
│   ├── privacy.yaml        #   隐私策略
│   └── proactive.yaml      #   主动引擎与调度配置
├── docs/                    # 方案设计文档
├── openclaw/                # OpenClaw 框架源码目录（当前仓库内维护）
│   └── extensions/
│       └── savc-orchestrator/  # 多 Agent 编排插件 (TypeScript)
├── savc-core/               # SAVC 核心系统
│   ├── agents/             #   Agent 定义 (YAML)
│   ├── memory/             #   持久化记忆存储
│   ├── orchestrator/       #   编排层 (路由/分解/聚合/注册/生命周期)
│   ├── persona/            #   人格配置 (voice.yaml / values.yaml)
│   └── skills/             #   自定义技能
├── scripts/                 # 运行时脚本与自动化测试
├── tests/                   # 测试报告
└── package.json             # 工作区依赖 (pnpm monorepo)
```

## 技术栈

| 类别 | 技术 |
|------|------|
| AI 框架 | OpenClaw |
| LLM | Anthropic Claude (Opus 4.5 / Sonnet 4) |
| 向量数据库 | LanceDB |
| Embedding | OpenAI text-embedding-3-small |
| 运行时 | Node.js 22+ (ES Modules) |
| 包管理 | pnpm (monorepo workspace) |
| 定时调度 | node-cron |
| 消息平台 | Discord · Telegram · Web |

## 快速开始

### 环境要求

- Node.js 22+
- pnpm 8+
- Python 3.10+ (可选，用于部分工具)

### 安装

```bash
# 克隆仓库
git clone https://github.com/Ashleymmy/Self-aware-virtual-companion.git
cd Self-aware-virtual-companion

# 安装依赖
pnpm install

# 配置环境变量
cp config/.env.example config/.env.local
# 编辑 config/.env.local 填入 API Key
```

### 配置

1. **API 密钥** — 在 `config/.env.local` 中配置 AnyRouter、WZW、OpenAI、Discord 等服务的 API Key
2. **消息通道** — 在 `config/channels.yaml` 中启用/禁用 Discord、Telegram、Web 通道
3. **模型选择** — 在 `config/models.yaml` 中配置模型供应商和回退链
4. **主动引擎** — 在 `config/proactive.yaml` 中设置定时任务和安静时段
5. **会话隔离（默认已开启）** — `scripts/setup.sh`/`scripts/llm_enable_failover.sh` 会写入 `session.dmScope=per-channel-peer` 与 `agents.defaults.heartbeat.session=heartbeat-main`，避免心跳与私聊串会话

### 内置开发环境基线

```bash
# 1) 预检环境（Node/pnpm/env/openclaw/docker）
pnpm dev:check

# 2) 初始化运行配置（首次或更换密钥后）
pnpm setup

# 3) 启动开发态（gateway watch + savc-ui）
pnpm dev

# 4) 触发一次“自我开发升级”闭环（工具学习 + 反思 + 人格微调预览）
pnpm dev:self-upgrade

# 5) 将自我升级闭环接入 Phase3 日任务（按需）
SAVC_SELF_UPGRADE_LOOP=1 bash scripts/phase3_run_daily.sh
```

### Yuanyuan 自主开发模式（改代码 + 验证）

```bash
# 1) 一次性打开 yuanyuan autodev 能力（workspaceAccess/coding tools/default channel）
pnpm yuanyuan:enable-autodev

# 2) 让 yuanyuan 执行真实开发任务（不是只输出方案）
pnpm yuanyuan:autodev --task "修复 scripts/test_phase_status.sh 在 macOS 下的兼容性并更新 README" \
  --channel telegram \
  --verify "bash scripts/test_phase_status.sh --quick" \
  --verify "pnpm -s dev:check"
```

- 运行证据会落盘到 `tests/artifacts/yuanyuan-autodev/<session-id>/`。
- 若提示 `autodev readiness check failed`，先执行 `pnpm yuanyuan:enable-autodev` 再重试。

### 任务运行态事件流（联调）

- 入口页面：`http://127.0.0.1:5174/progress-hub/task-runtime.html`
- 用途：实时观察 yuanyuan 的任务创建、执行、重试、成功/失败状态流，验证“调度者 + 实时反馈”链路。

```bash
# 创建任务
curl -X POST http://127.0.0.1:5174/__savc/task-runtime/create \\
  -H 'content-type: application/json' \\
  -d '{"title":"验证 agent 编排链路","owner":"yuanyuan","channel":"telegram"}'

# 推进任务状态（running/retry/succeeded/failed/canceled）
curl -X POST http://127.0.0.1:5174/__savc/task-runtime/control \\
  -H 'content-type: application/json' \\
  -d '{"taskId":"<task-id>","action":"running","progress":35,"message":"子任务执行中"}'

# 获取快照 / 订阅 SSE
curl http://127.0.0.1:5174/__savc/task-runtime/snapshot
curl -N http://127.0.0.1:5174/__savc/task-runtime/stream
```

### 容器化预留（后续上云）

```bash
# 1) 初始化容器环境变量模板
pnpm dev:container:init

# 2) 编辑 infra/docker/.env 后启动容器
pnpm dev:container:up

# 3) 查看状态/日志
pnpm dev:container:ps
pnpm dev:container:logs

# 4) 关闭容器
pnpm dev:container:down
```

- 容器模板文件位于 `infra/docker/`，当前用于开发与云部署前置预留。
- 默认入口是 `infra/docker/docker-compose.cloud.yml`，会在容器首次启动时写入 `openclaw.container.json`。
- 生产上云前建议补充：镜像仓库发布、只读根文件系统、外部密钥管理、持久卷与健康探针策略。

### 安全与凭据管理

1. 凭据仅保存在 `config/.env.local`，禁止提交到 Git。
2. 若出现泄露风险，立即轮换所有密钥并清空本地旧值。
3. 提交前执行 `pnpm security:scan:staged`，全仓检查执行 `pnpm security:scan`。
4. 可执行 `pnpm hooks:install` 启用 pre-commit 自动扫描。
5. 详细规范见 `docs/密钥轮换与本地凭据管理.md`。

## 开发进度

| 阶段 | 名称 | 状态 |
|------|------|------|
| Phase 0 | 环境与基础设施 | ✅ 完成 |
| Phase 1 | 人格与记忆系统 | ✅ 完成 |
| Phase 2 | 主动交互引擎 | ✅ 完成 |
| Phase 3 | 工具学习与自我反思 | ✅ 完成 |
| Phase 4a | 语义记忆检索 (LanceDB) | ✅ 完成 |
| Phase 4b | 多 Agent 协同编排 | ✅ 完成 |
| Phase 5c | Vibe Coding (自然语言编程) | ✅ 完成 |
| Phase 5d | 实时语音交互 | ✅ 完成 |
| Phase 5e | 视觉能力 | ✅ 完成 |
| Phase 6 | Live2D 虚拟形象 | 🚧 进行中（M-F1~M-F5 管理界面闭环已落地，生产级通道联调中） |

> 最近脚本校准（2026-02-19）：
> `test_phase4b` PASS、`test_phase5c` PASS、`test_phase5d` PASS、`test_phase5e` PASS（live smoke 默认跳过告警）。

## 最小可复现验收命令

```bash
# 环境
node -v
pnpm -v
bash --version

# 阶段验收
bash scripts/test_phase4b.sh
bash scripts/test_phase5c.sh
bash scripts/test_phase5d.sh
bash scripts/test_phase5e.sh

# 状态汇总（macOS bash 3.2 兼容）
bash scripts/test_phase_status.sh --quick
```

## 记忆系统

采用双层混合架构：

| 层级 | 存储 | 用途 | 检索方式 |
|------|------|------|----------|
| 文件层 | Markdown | 情景摘要、用户画像、情绪日志 | 关键词 |
| 向量层 | LanceDB | 对话片段、偏好、知识事实 | 语义 + 混合 |

**记忆类型：** 情景记忆 · 语义记忆 · 程序记忆 · 情感记忆 · 工具记忆 · 成长记忆

## 设计理念

- **本地优先** — 数据本地存储，零云端依赖，隐私至上
- **声明式配置** — Agent 定义通过 YAML 声明，最小化代码改动
- **可组合** — 技能与 Agent 模块化，可自由组合复用
- **可观测** — 完整的日志与健康监控体系
- **成本敏感** — 根据任务复杂度选择合适的模型层级
- **以人为本** — 人格一致、情感感知、自主成长

## License

MIT
