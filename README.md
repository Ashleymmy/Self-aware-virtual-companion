# SAVC - Self-aware Virtual Companion

> 一个具备自我学习与自主行动能力的 AI 虚拟伴侣系统，基于 [OpenClaw](https://github.com/open-webui/open-webui) 框架构建。

## 项目概述

SAVC 是一套完整的 AI 虚拟伴侣解决方案，通过多 Agent 协同编排、混合记忆系统、主动式交互引擎和自我反思机制，实现具有人格一致性、长期记忆和自主成长能力的虚拟伴侣。

### 核心特性

- **多 Agent 协同编排** — 6 个专业化 Agent 组成的智能体集群，通过意图路由和任务分解实现高效协作
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

## 项目结构

```
Self-aware-virtual-companion/
├── config/                  # 环境与运行时配置
│   ├── channels.yaml       #   消息通道配置
│   ├── models.yaml         #   模型供应商配置
│   ├── privacy.yaml        #   隐私策略
│   └── proactive.yaml      #   主动引擎与调度配置
├── docs/                    # 方案设计文档
├── openclaw/                # OpenClaw 框架 (git submodule)
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
# 克隆仓库（含子模块）
git clone --recurse-submodules https://github.com/Ashleymmy/Self-aware-virtual-companion.git
cd Self-aware-virtual-companion

# 安装依赖
pnpm install

# 配置环境变量
cp config/.env.example config/.env.local
# 编辑 config/.env.local 填入 API Key
```

### 配置

1. **API 密钥** — 在 `config/.env.local` 中配置 Anthropic、OpenAI、Discord 等服务的 API Key
2. **消息通道** — 在 `config/channels.yaml` 中启用/禁用 Discord、Telegram、Web 通道
3. **模型选择** — 在 `config/models.yaml` 中配置模型供应商和回退链
4. **主动引擎** — 在 `config/proactive.yaml` 中设置定时任务和安静时段

## 开发进度

| 阶段 | 名称 | 状态 |
|------|------|------|
| Phase 0 | 环境与基础设施 | ✅ 完成 |
| Phase 1 | 人格与记忆系统 | ✅ 完成 |
| Phase 2 | 主动交互引擎 | ✅ 完成 |
| Phase 3 | 工具学习与自我反思 | ✅ 完成 |
| Phase 4a | 语义记忆检索 (LanceDB) | ✅ 完成 |
| Phase 4b | 多 Agent 协同编排 | ✅ 完成 |
| Phase 5c | Vibe Coding (自然语言编程) | 🟡 进行中 |
| Phase 5d | 实时语音交互 | ⏳ 计划中 |
| Phase 5e | 视觉能力 | ⏳ 计划中 |
| Phase 6 | Live2D 虚拟形象 | ⏳ 计划中 |

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
