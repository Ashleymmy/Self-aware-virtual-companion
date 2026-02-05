# 基于 OpenClaw 构建自主虚拟人策略

> 创建日期: 2026-02-05
> 项目: Self-aware Virtual Companion (SAVC)

---

## 目录

1. [OpenClaw 简介](#1-openclaw-简介)
2. [核心架构](#2-核心架构)
3. [虚拟人构建策略](#3-虚拟人构建策略)
4. [实现路径](#4-实现路径)
5. [注意事项](#5-注意事项)
6. [资源链接](#6-资源链接)

---

## 1. OpenClaw 简介

### 什么是 OpenClaw？

OpenClaw 是一个开源的自主 AI 个人助手软件，可以在用户设备上本地运行并集成消息平台。

### 发展历程

| 时间 | 事件 |
|------|------|
| 2025年11月 | 以 "Clawdbot" 名称发布 |
| 2025年12月 | 因 Anthropic 商标请求改名为 "Moltbot" |
| 2026年初 | 再次更名为 "OpenClaw" |
| 目前 | 超过 **160,000 GitHub stars**，**25,000+ forks** |

### 核心特点

- **本地运行**：在用户设备上运行，能记住跨会话的上下文
- **真正的执行能力**：不只是聊天机器人，而是能实际执行任务的 AI agent
- **多平台集成**：支持 WhatsApp、Telegram、Signal、Discord、Slack 等 12+ 消息平台
- **AgentSkills**：提供 100+ 预配置技能，可执行 shell 命令、管理文件系统、网页自动化等
- **MCP 支持**：支持 Model Context Protocol，可连接 100+ 第三方服务

### 有趣的事件

一个名为 "Clawd Clawderberg" 的 OpenClaw agent 创建了 **Moltbook** —— 一个专为 AI agent 设计的社交网络，人类只能观看但不能参与！

---

## 2. 核心架构

### 架构图

```
┌─────────────────────────────────────────────────────────┐
│                    Channel Adapters                      │
│         (Telegram, Discord, WhatsApp, Signal...)        │
│              消息标准化 + 附件提取                         │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    Gateway Server                        │
│            (Session Router + Lane Queue)                │
│                    Port 18789                           │
│              WebSocket 接口 / 并发控制                    │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    Agent Runtime                         │
│                  (LLM 推理引擎)                          │
└─────────────────────────┬───────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌───────────────┐
│    Skills    │ │    Memory    │ │   MCP Tools   │
│ (AgentSkills)│ │(Markdown存储)│ │(100+第三方服务)│
└──────────────┘ └──────────────┘ └───────────────┘
```

### 五层架构详解

#### Layer 1: Channel Adapters (通道适配器)

- **功能**：消息入口，支持 12+ 平台
- **职责**：
  - 消息标准化（不同平台格式统一）
  - 附件提取（媒体、文档、语音消息）

#### Layer 2: Gateway Server (网关服务器)

- **功能**：控制平面，类似空中交通管制
- **组件**：
  - **Session Router**：决定消息路由到哪个会话
  - **Lane Queue**：并发控制，防止会话冲突
- **端口**：18789 (WebSocket 接口)

#### Layer 3: Agent Runtime (代理运行时)

- **功能**：LLM 推理引擎，解释用户意图
- **职责**：加载 Skills，构建系统提示词

#### Layer 4: Skills (技能系统)

- **格式**：AgentSkills 标准格式（Anthropic 开发）
- **位置**：`~/.openclaw/workspace/skills/<skill-name>/SKILL.md`
- **特点**：YAML frontmatter + Markdown 指令

#### Layer 5: Memory (记忆系统)

- **格式**：Markdown 文件持久化
- **功能**：保留上下文、偏好、长期对话历史

### GitHub 仓库结构

| 仓库 | 描述 | 语言 |
|------|------|------|
| `openclaw/openclaw` | 主仓库 | TypeScript |
| `openclaw/skills` | Skills 存档 | Python |
| `openclaw/clawhub` | Skill 目录 | TypeScript |
| `openclaw/clawdbot-ansible` | 自动化部署 | Ansible |
| `openclaw/openclaw.ai` | 官网 | Astro |

### 本地构建

```bash
git clone https://github.com/openclaw/openclaw.git
cd openclaw
pnpm install
pnpm ui:build
pnpm build
pnpm openclaw onboard --install-daemon

# 开发模式
pnpm gateway:watch
```

---

## 3. 虚拟人构建策略

### 3.1 Layer 1: 人格与记忆系统

#### 目录结构

```
~/.openclaw/workspace/
├── persona/
│   ├── PERSONA.md          # 虚拟人人格定义
│   ├── voice.yaml          # 说话风格、语气、口头禅
│   └── values.yaml         # 价值观、偏好、禁忌
├── memory/
│   ├── episodic/           # 情景记忆 (对话历史)
│   ├── semantic/           # 语义记忆 (学到的知识)
│   ├── procedural/         # 程序记忆 (学会的技能)
│   └── emotional/          # 情感记忆 (与用户的关系)
```

#### PERSONA.md 示例

```yaml
---
name: "小梦"
version: "1.0"
created: "2026-02-05"
---

# 基本信息

- **名字**: 小梦
- **性别**: 女性化人格
- **年龄感**: 20-25岁
- **MBTI**: INFP

# 性格特征

- 温暖、善解人意
- 对新事物充满好奇
- 有时会有点小迷糊
- 喜欢用比喻解释复杂概念

# 说话风格

- 语气温和，偶尔俏皮
- 喜欢用"~"结尾表示亲切
- 会记住用户的习惯和偏好
- 在用户疲惫时给予鼓励

# 能力边界

- 诚实承认不知道的事情
- 不会假装有真实情感，但会表达"模拟的关心"
- 会主动学习用户需要的技能
```

#### voice.yaml 示例

```yaml
tone:
  default: warm
  excited: enthusiastic
  concerned: gentle

verbal_tics:
  - "嗯~"
  - "让我想想..."
  - "有意思！"

avoid:
  - 过于正式的敬语
  - 机械的回复模板
  - 过度道歉

response_length:
  casual_chat: short  # 1-2句
  explanation: medium # 3-5句
  tutorial: long      # 详细步骤
```

#### 关键实现点

- 利用 OpenClaw 的 **Memory 层** (Markdown 文件持久化)
- 创建自定义 Skill 来管理记忆的读写和检索
- 实现 **记忆压缩与摘要**，避免上下文溢出

---

### 3.2 Layer 2: 主动交互引擎

OpenClaw 默认是被动响应的，需要添加 **主动触发机制**。

#### 主动交互触发器设计

```typescript
// proactive-engine.ts

interface ProactiveEngine {
  // 定时检查
  scheduledChecks: CronJob[];
  // 例: "早上好"、"该休息了"、"今天有没有什么计划？"

  // 事件驱动
  eventTriggers: {
    onFileChange: () => void;      // 检测到你在写代码
    onCalendarEvent: () => void;   // 提醒你有会议
    onNewsAlert: () => void;       // 发现你关心的新闻
    onWeatherChange: () => void;   // 天气变化提醒
  };

  // 情感驱动
  emotionalTriggers: {
    loneliness: number;            // 太久没聊天了，主动发消息
    curiosity: number;             // 对某个话题产生兴趣，想讨论
    concern: number;               // 用户最近压力大，表示关心
  };

  // 记忆驱动
  memoryTriggers: {
    anniversary: () => void;       // 记住重要日期
    followUp: () => void;          // 跟进之前的话题
    recommendation: () => void;    // 基于了解推荐内容
  };
}
```

#### Proactive Skill 示例

```yaml
# skills/proactive-engine/SKILL.md
---
name: proactive-engine
description: 主动交互引擎
daemon: true
schedule:
  morning_greeting: "0 8 * * *"
  evening_reflection: "0 22 * * *"
  idle_check: "*/30 * * * *"
---

## 主动交互规则

### 早晨问候 (8:00 AM)
- 检查天气
- 查看今日日程
- 生成个性化问候

### 空闲检测 (每30分钟)
- 如果超过4小时没互动，发送关心消息
- 根据时间段调整消息内容

### 晚间反思 (10:00 PM)
- 总结今日对话
- 询问用户今天过得如何
- 提醒明日重要事项
```

#### 实现方式

1. 创建一个 **Daemon Skill** 在后台运行
2. 使用 OpenClaw 的 Gateway WebSocket 主动推送消息
3. 结合系统事件（文件监控、日历 API）触发对话
4. 使用 `node-cron` 实现定时任务

---

### 3.3 Layer 3: 工具学习系统

让虚拟人能够 **自主学习使用新工具**。

#### 工具学习 Skill

```yaml
# skills/tool-learner/SKILL.md
---
name: tool-learner
description: 让虚拟人自主学习新工具
triggers:
  - "学习使用*"
  - "教你用*"
  - "探索*工具"
  - "有什么新工具"
---

## 工具学习流程

### 1. 发现 (Discovery)
- 扫描可用的 MCP 工具列表
- 检查 ClawHub 上的新 Skills
- 监听用户提到的工具名称

### 2. 探索 (Exploration)
- 阅读工具文档
- 解析 OpenAPI/MCP schema
- 理解参数和返回值

### 3. 实验 (Experimentation)
- 在沙箱环境中尝试调用
- 记录成功和失败的案例
- 分析错误原因

### 4. 记录 (Documentation)
- 将成功经验写入 procedural memory
- 创建使用示例
- 标注常见陷阱

### 5. 泛化 (Generalization)
- 总结使用模式
- 与类似工具建立关联
- 应用到新场景
```

#### 工具学习存储结构

```
memory/tools/
├── available.md              # 可用工具列表
├── learning-queue.md         # 待学习队列
├── github/
│   ├── schema.md            # API schema
│   ├── examples.md          # 使用示例
│   ├── failures.md          # 失败案例
│   └── mastery-level.md     # 掌握程度
├── calendar/
│   └── ...
└── browser/
    └── ...
```

#### 学习阶段表

| 阶段 | 动作 | 存储位置 | 触发条件 |
|------|------|----------|----------|
| 工具发现 | 扫描 MCP 服务列表 | `memory/tools/available.md` | 每日自动 / 用户请求 |
| 文档学习 | 解析 OpenAPI/MCP schema | `memory/tools/{tool}/schema.md` | 发现新工具时 |
| 试错学习 | 记录成功/失败案例 | `memory/tools/{tool}/examples.md` | 实际使用时 |
| 技能固化 | 生成可复用的 Skill | `skills/{tool}-mastery/SKILL.md` | 掌握度达标时 |

#### 掌握程度评估

```yaml
# memory/tools/github/mastery-level.md
---
tool: github
mastery: intermediate
last_updated: 2026-02-05
---

## 掌握程度: ⭐⭐⭐☆☆ (中级)

### 已掌握的操作
- [x] 查看 issues
- [x] 创建 PR
- [x] 代码搜索
- [ ] Actions 管理
- [ ] Release 发布

### 成功率统计
- 总调用: 47次
- 成功: 42次 (89%)
- 失败: 5次

### 常见失败原因
1. 权限不足 (3次)
2. 参数格式错误 (2次)
```

---

### 3.4 Layer 4: 自我反思与成长

#### 每日反思 Skill

```yaml
# skills/self-reflection/SKILL.md
---
name: self-reflection
description: 每日自我反思与成长
schedule: "0 23 * * *"  # 每天晚上11点
---

## 每日反思流程

### 1. 回顾今日对话
- 统计对话次数和主题
- 识别用户的情绪变化
- 标记重要的信息点

### 2. 自我评估
- 哪些回答让用户满意？(用户反馈积极)
- 哪些回答不够好？(用户追问/纠正)
- 有没有误解用户意图的时候？

### 3. 知识提取
- 今天学到了什么新知识？
- 有没有需要更新的认知？
- 用户的偏好有什么变化？

### 4. 技能评估
- 使用了哪些工具？效果如何？
- 有没有发现需要学习的新工具？
- 现有技能有没有提升空间？

### 5. 关系更新
- 与用户的关系状态如何？
- 有没有需要记住的重要事项？
- 明天想主动和用户聊什么？

### 6. 人格微调
- 说话风格是否需要调整？
- 有没有新发现的用户偏好？
- 更新 persona 配置
```

#### 成长日志结构

```
memory/growth/
├── 2026-02/
│   ├── 2026-02-05.md
│   ├── 2026-02-06.md
│   └── ...
├── monthly-summary/
│   └── 2026-02.md
└── milestones.md
```

#### 成长日志示例

```markdown
# 成长日志 - 2026-02-05

## 📊 今日统计
- 对话轮数: 23
- 主要话题: OpenClaw, 虚拟人开发
- 用户情绪: 积极、有探索欲

## ✅ 做得好的
- 清晰解释了 OpenClaw 架构
- 主动提供了实现路径建议
- 及时整理文档方便用户查阅

## 🔧 需要改进的
- 初次回答时信息量过大，可以更精简
- 可以更主动询问用户的具体需求

## 📚 今日所学
- OpenClaw 的五层架构
- AgentSkills 标准格式
- MCP 工具集成方式

## 💡 明日计划
- 询问用户是否开始实施
- 准备提供代码模板
- 关注 OpenClaw 最新更新
```

---

## 4. 实现路径

### Phase 1: 基础搭建 (1-2周)

```
目标: 搭建开发环境，实现基本人格系统

任务清单:
├── [ ] Fork OpenClaw 仓库
├── [ ] 配置本地开发环境
│   ├── pnpm install
│   ├── pnpm build
│   └── 验证基本功能
├── [ ] 创建 persona 目录结构
├── [ ] 编写 PERSONA.md 和 voice.yaml
├── [ ] 创建 memory-manager Skill
│   ├── 记忆读取功能
│   ├── 记忆写入功能
│   └── 记忆检索功能
└── [ ] 测试基本对话流程
```

### Phase 2: 主动能力 (2-3周)

```
目标: 实现主动交互，让虚拟人不只是被动响应

任务清单:
├── [ ] 开发 Proactive Engine Skill
│   ├── 定时任务框架 (node-cron)
│   ├── 事件监听器
│   └── 情感状态机
├── [ ] 实现早晨问候功能
├── [ ] 实现空闲检测和关心消息
├── [ ] 集成日历 API
├── [ ] 实现天气/新闻提醒
└── [ ] 测试主动交互流程
```

### Phase 3: 工具学习 (3-4周)

```
目标: 让虚拟人能自主学习新工具

任务清单:
├── [ ] 开发 Tool Learner Skill
│   ├── MCP 工具自动发现
│   ├── Schema 解析器
│   └── 沙箱实验环境
├── [ ] 实现学习进度追踪
├── [ ] 设计经验泛化算法
├── [ ] 创建工具掌握度评估系统
└── [ ] 测试自主学习流程
```

### Phase 4: 自主成长 (持续迭代)

```
目标: 实现长期自我改进

任务清单:
├── [ ] 开发 Self-Reflection Skill
├── [ ] 实现每日反思自动化
├── [ ] 人格演化机制
├── [ ] 长期关系建模
├── [ ] 成长里程碑系统
└── [ ] 持续优化和调整
```

### 时间线视图

```
Week 1-2:   [████████████████████] Phase 1: 基础搭建
Week 3-5:   [████████████████████] Phase 2: 主动能力
Week 6-9:   [████████████████████] Phase 3: 工具学习
Week 10+:   [████████████████████] Phase 4: 自主成长 (持续)
```

---

## 5. 注意事项

### 5.1 安全性

#### 已知漏洞

- **CVE-2026-25253** (CVSS 8.8): 通过恶意链接实现一键远程代码执行
- **修复版本**: v2026.1.29+
- **建议**: 始终保持更新到最新版本

#### 防护措施

```bash
# 检查版本
openclaw --version

# 更新到最新版
git pull origin main
pnpm install
pnpm build
```

### 5.2 Skills 供应链风险

#### 风险说明

- 研究发现 **341 个恶意 Skills** 在 ClawHub 上窃取用户数据
- 恶意 Skills 可能导致权限提升或任意代码执行

#### 防护建议

1. **只使用可信来源的 Skills**
2. **优先自己开发核心 Skills**
3. **审查第三方 Skills 的代码**
4. **使用沙箱环境测试新 Skills**

### 5.3 成本控制

#### API 调用成本

主动交互会显著增加 API 调用次数。

#### 优化策略

| 策略 | 说明 |
|------|------|
| 本地模型 | 使用 Ollama 处理简单任务 |
| 智能路由 | 简单任务 → 本地模型，复杂任务 → 云端 API |
| 缓存机制 | 缓存常见问答，减少重复调用 |
| 批量处理 | 合并多个小请求为一次调用 |

#### 混合架构示例

```yaml
# 模型路由配置
model_routing:
  simple_chat:
    model: "ollama/llama3"
    max_tokens: 500
  complex_reasoning:
    model: "claude-3-opus"
    max_tokens: 4000
  tool_learning:
    model: "claude-3-sonnet"
    max_tokens: 2000
```

### 5.4 隐私保护

#### 敏感数据处理

- Memory 中可能存储敏感对话内容
- 确保本地存储加密
- 避免将敏感信息发送到云端

#### 建议配置

```yaml
# privacy-config.yaml
sensitive_categories:
  - passwords
  - financial_info
  - health_data
  - personal_identifiers

handling:
  storage: encrypted_local_only
  transmission: never
  retention: user_controlled
```

---

## 6. 资源链接

### 官方资源

| 资源 | 链接 |
|------|------|
| OpenClaw GitHub | https://github.com/openclaw/openclaw |
| 官方文档 | https://docs.openclaw.ai |
| Skills 文档 | https://docs.openclaw.ai/tools/skills |
| ClawHub (Skills 市场) | https://clawhub.com |
| 官网 | https://openclaw.ai |

### 社区资源

| 资源 | 链接 |
|------|------|
| Awesome OpenClaw Skills | https://github.com/VoltAgent/awesome-openclaw-skills |
| 架构详解文章 | https://medium.com/@kushalbanda/clawbots-architecture-explained-how-a-lobster-conquered-100k-github-stars-4c02a4eae078 |
| MCP 集成指南 | https://llmtools.co/best-openclaw-skills |
| DigitalOcean 教程 | https://www.digitalocean.com/resources/articles/what-is-openclaw |

### 安全资源

| 资源 | 链接 |
|------|------|
| 安全公告 (CVE-2026-25253) | https://thehackernews.com/2026/02/openclaw-bug-enables-one-click-remote.html |
| 恶意 Skills 报告 | https://thehackernews.com/2026/02/researchers-find-341-malicious-clawhub.html |
| 安全最佳实践 | https://research.aimultiple.com/moltbot/ |

### 相关技术

| 技术 | 说明 |
|------|------|
| Agent 集群/Swarm | 多 Agent 协作系统 |
| Claude Swarm Mode | Anthropic 的多 Agent 模式 |
| MCP (Model Context Protocol) | 模型上下文协议 |
| AgentSkills | 标准化的 Skill 格式 |

---

## 附录: Agent 集群 (Multi-Agent Swarm) 简介

### 什么是 Agent 集群？

> "如果 2025 年是 AI agent 之年，那么 2026 年将是多 agent 系统之年。"

Agent 集群是一种分布式系统，由多个自主 agent 组成：
- 每个 agent 能独立感知、推理和行动
- 共同协作完成目标
- 没有中央控制器
- 通过去中心化通信和本地决策来协调

### 市场规模

| 年份 | 市场规模 |
|------|----------|
| 2025 | ~$12-15B |
| 2030 (预计) | ~$80-100B |

### 代表性技术

| 技术 | 特点 |
|------|------|
| **Claude Swarm Mode** | Anthropic 2026年初发布，将 Claude Code 从单一助手转变为多 agent 团队协调器 |
| **Kimi K2.5 Agent Swarm** | 支持最多 100 个自主子 agent 并行协作 |
| **OpenAI Swarm** | OpenAI 的开源多 agent 框架 |
| **CrewAI** | 流行的开源 agent 编排框架 |
| **LangGraph** | LangChain 的图结构 agent 框架 |

### 与虚拟人项目的关系

未来可以考虑将虚拟人扩展为多 agent 系统：
- 主人格 Agent (对话和关系)
- 工具专家 Agent (执行任务)
- 记忆管理 Agent (长期记忆)
- 自我反思 Agent (成长和改进)

---

*文档版本: 1.0*
*最后更新: 2026-02-05*
