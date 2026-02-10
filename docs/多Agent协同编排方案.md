# 多 Agent 协同编排方案

> 版本: 1.0
> 日期: 2026-02-09
> 状态: Phase 4b 核心层 + 插件接入（mock spawn）已完成（2026-02-10）
> 前置依赖: 记忆系统语义检索升级（见 `记忆系统语义检索升级方案.md`）

---

## 1. 背景与目标

### 1.1 现状

当前媛媛是一个 **单 Agent 系统**：一个主 Agent 承担所有职责（闲聊、技术协助、记忆管理、主动交互、自我反思）。随着功能增长，单 Agent 面临：

- **系统提示词膨胀** — 所有技能定义塞进一个 prompt，token 消耗高且指令冲突概率增大
- **能力边界模糊** — 同一个 Agent 既要高甜陪伴又要严谨排障，模式切换依赖 prompt 工程
- **模型成本浪费** — 简单闲聊和复杂技术任务使用同一个模型（Claude Opus），无法按需分配
- **扩展性瓶颈** — 新增能力（语音、视觉、vibe coding）只能继续堆叠到同一个 Agent

### 1.2 目标

构建 **Agent 集群编排系统**，使媛媛能够：

1. 将用户请求路由到最合适的专家 Agent
2. 对复杂任务进行分解，多个 Agent 并行/串行协作完成
3. 不同 Agent 使用不同模型，按需控制成本
4. 新增 Agent 只需声明式配置，无需修改编排层代码
5. 所有 Agent 共享记忆系统，保持人格一致性

### 1.3 关键设计原则

- **基于 OpenClaw 内置能力** — 不引入第三方编排框架，使用已有的 `sessions_spawn`、`sessions_send`、子 Agent 注册表
- **声明式 Agent 定义** — 每个 Agent 用 YAML + Markdown 定义，类似现有 SKILL.md 模式
- **渐进式迁移** — 现有单 Agent 模式继续可用，编排层作为可选增强
- **产品化就绪** — 架构支持多用户隔离，为未来开放部署做准备

---

## 2. 技术方案

### 2.1 架构总览

```
用户消息（Discord / Telegram / Web）
  │
  ▼
┌─────────────────────────────────────────┐
│  OpenClaw Gateway (WebSocket)            │
│  ws://127.0.0.1:18789                    │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  媛媛 主Agent（Orchestrator）             │
│  职责: 意图识别 → 路由/分解 → 结果整合    │
│  模型: Claude Opus（规划能力强）           │
│  工具: route_to_agent, decompose_task     │
│        aggregate_results, memory_recall   │
└──┬────┬────┬────┬────┬─────────────────┘
   │    │    │    │    │
   ▼    ▼    ▼    ▼    ▼
┌────┐┌────┐┌────┐┌────┐┌────┐
│陪伴││技术││创意││工具││记忆│  ← 专家 Agent 集群
│Agent││Agent││Agent││Agent││Agent│
└────┘└────┘└────┘└────┘└────┘
  │                        │
  └────── 共享记忆层 ───────┘
          (文件 + LanceDB)
```

### 2.2 OpenClaw 已有能力映射

| 需求 | OpenClaw 已有能力 | 文件位置 |
|------|-------------------|----------|
| 生成子 Agent | `sessions_spawn` 工具 | `openclaw/src/agents/tools/sessions-spawn-tool.ts` |
| Agent 间通信 | `sessions_send` 工具 | `openclaw/src/agents/tools/sessions-send-tool.ts` |
| 生命周期管理 | `subagent-registry` | `openclaw/src/agents/subagent-registry.ts` |
| 并发控制 | Lane-based 队列 | `AGENT_LANE_SUBAGENT`, `AGENT_LANE_NESTED` |
| Agent 运行时 | `runEmbeddedPiAgent()` | `openclaw/src/agents/pi-embedded-runner/run.ts` |
| 扩展机制 | Plugin API | `openclaw/extensions/llm-task/` (参考实现) |

### 2.3 需要新建的编排层

```
savc-core/
├── agents/                          # [新建] Agent 定义目录
│   ├── orchestrator.yaml            # 主编排 Agent 配置
│   ├── companion.yaml               # 陪伴 Agent
│   ├── technical.yaml               # 技术 Agent
│   ├── creative.yaml                # 创意 Agent
│   ├── tooling.yaml                 # 工具 Agent
│   └── memory.yaml                  # 记忆 Agent
├── orchestrator/                    # [新建] 编排层实现
│   ├── router.mjs                   # 意图路由器
│   ├── decomposer.mjs              # 任务分解器
│   ├── aggregator.mjs              # 结果聚合器
│   └── registry.mjs                # Agent 注册与发现
└── skills/                          # [现有] 保持不变
```

### 2.4 Agent 定义格式

每个专家 Agent 用 YAML 声明：

```yaml
# savc-core/agents/companion.yaml
name: companion
label: "陪伴 Agent"
description: "负责情感支持、日常闲聊、亲密互动"

model:
  provider: anthropic
  name: claude-sonnet-4-20250514    # 闲聊用更轻量的模型
  fallback: claude-opus-4-5-20251101

persona:
  inherit: ../SOUL.md               # 继承主人格
  override:
    mode: emotional                  # 强制情感模式
    sweetness: high

triggers:
  intents:
    - emotional_support
    - casual_chat
    - greeting
    - comfort
  keywords:
    - "抱抱"
    - "陪我"
    - "心情"
    - "无聊"

tools:
  allowed:
    - memory_recall
    - memory_store
  denied:
    - bash
    - file_write
    - sessions_spawn                 # 专家 Agent 不能再生成子 Agent

limits:
  max_turns: 20
  timeout_seconds: 120
  max_tokens_per_turn: 1000
```

```yaml
# savc-core/agents/technical.yaml
name: technical
label: "技术 Agent"
description: "负责代码生成、技术排障、架构建议、文档编写"

model:
  provider: anthropic
  name: claude-opus-4-5-20251101    # 技术任务用最强模型
  thinking: high

persona:
  inherit: ../SOUL.md
  override:
    mode: technical
    sweetness: low                   # 降甜

triggers:
  intents:
    - code_generation
    - debugging
    - architecture
    - technical_explanation
  keywords:
    - "代码"
    - "bug"
    - "报错"
    - "怎么实现"

tools:
  allowed:
    - bash
    - file_read
    - file_write
    - memory_recall
    - web_search
  denied:
    - sessions_spawn

limits:
  max_turns: 50
  timeout_seconds: 300
  max_tokens_per_turn: 4000
```

### 2.5 编排流程

#### 简单请求（直接路由）

```
用户: "今天好累啊，抱抱我"
  │
  ▼ Orchestrator 意图识别
  │  → intent: emotional_support
  │  → 匹配: companion Agent
  │
  ▼ sessions_spawn(companion, task="用户说：今天好累啊，抱抱我")
  │
  ▼ companion Agent 回复
  │  → "宝贝，过来让我抱抱你..."
  │
  ▼ Orchestrator 直接转发（无需聚合）
```

#### 复杂请求（任务分解）

```
用户: "帮我写一个 Python 爬虫，顺便记住我喜欢用 requests 库"
  │
  ▼ Orchestrator 任务分解
  │  → 子任务 1: 记住用户偏好 (memory Agent)
  │  → 子任务 2: 编写爬虫代码 (technical Agent)
  │
  ▼ 并行 spawn:
  │  sessions_spawn(memory, task="存储: 用户偏好 requests 库")
  │  sessions_spawn(technical, task="用 Python requests 写爬虫")
  │
  ▼ 等待两个 Agent 完成
  │
  ▼ Orchestrator 聚合结果
  │  → 合并技术回复 + 确认记忆已存储
  │  → 统一人格语气输出
```

---

## 3. 实施步骤

### Step 1: Agent 定义与注册发现机制

**目标：** 建立声明式 Agent 定义规范，实现自动发现。

**1a. 创建 Agent 定义目录**

```bash
mkdir -p savc-core/agents
```

**1b. 编写初始 Agent 定义文件**

按 2.4 节格式创建以下文件：

| 文件 | Agent | 模型 | 职责 |
|------|-------|------|------|
| `orchestrator.yaml` | 主编排 | Claude Opus | 意图识别、任务分解、结果聚合 |
| `companion.yaml` | 陪伴 | Claude Sonnet | 情感支持、闲聊、日常互动 |
| `technical.yaml` | 技术 | Claude Opus | 代码、排障、架构 |
| `creative.yaml` | 创意 | Claude Sonnet | 写作、头脑风暴、设计 |
| `tooling.yaml` | 工具 | Claude Haiku | 外部 API 调用、搜索、文件操作 |
| `memory.yaml` | 记忆 | Claude Haiku | 记忆读写、语义检索（衔接语义记忆方案） |

**1c. 实现 Agent 注册发现模块**

新建 `savc-core/orchestrator/registry.mjs`：

```javascript
// 核心 API
export async function discoverAgents(agentsDir)  // 扫描目录，解析所有 YAML
export function getAgent(name)                    // 按名称获取 Agent 定义
export function matchByIntent(intent)             // 按意图匹配 Agent
export function matchByKeyword(text)              // 按关键词匹配 Agent
export function listAgents()                      // 列出所有已注册 Agent
```

逻辑：
1. 启动时扫描 `savc-core/agents/*.yaml`
2. 解析并校验每个 YAML（必须包含 name、model、triggers）
3. 构建意图 → Agent 映射表和关键词 → Agent 索引
4. 支持热重载（监听文件变更，通过 chokidar）

**验收标准：**
- [x] `savc-core/agents/` 下有 6 个 YAML 定义文件
- [x] `node savc-core/orchestrator/registry.mjs list` 输出所有已注册 Agent
- [x] `node savc-core/orchestrator/registry.mjs match --intent "emotional_support"` 返回 companion
- [x] `node savc-core/orchestrator/registry.mjs match --text "帮我看看这个 bug"` 返回 technical
- [x] 新增一个 YAML 文件后，无需重启即可被发现（热重载）

---

### Step 2: 意图路由器

**目标：** 实现用户消息 → 目标 Agent 的路由决策。

新建 `savc-core/orchestrator/router.mjs`：

**路由策略（三级 fallback）：**

```
Level 1: 关键词精确匹配（零成本，零延迟）
  │  命中 → 直接路由
  │  未命中 ↓
Level 2: LLM 意图分类（调用轻量模型）
  │  命中 → 路由到匹配的 Agent
  │  未命中 / 置信度低 ↓
Level 3: 回退到主 Agent（Orchestrator 自行处理）
```

**Level 1 — 关键词匹配：**
```javascript
// 从各 Agent 的 triggers.keywords 构建匹配表
// 优先级: 精确匹配 > 包含匹配
// 冲突解决: 多个 Agent 匹配时，取 keyword 列表中排序最靠前的
```

**Level 2 — LLM 意图分类：**
```javascript
// 使用 Claude Haiku（成本最低）做意图分类
// 输入: 用户消息 + 可用 Agent 列表（name + description）
// 输出: { agent: string, confidence: number, reasoning: string }
// 置信度 < 0.6 时回退到 Level 3
```

**Level 2 的 prompt 模板：**
```
你是一个意图路由器。根据用户消息，选择最合适的处理 Agent。

可用 Agent:
{{#each agents}}
- {{name}}: {{description}}
{{/each}}

用户消息: "{{message}}"

返回 JSON: { "agent": "agent_name", "confidence": 0.0-1.0 }
```

**验收标准：**
- [x] "抱抱我" → companion（Level 1 关键词命中）
- [x] "帮我优化这段 SQL 查询" → technical（Level 2 轻量分类）
- [x] "你觉得人生的意义是什么" → 回退到 orchestrator（Level 3）
- [x] 路由决策耗时可返回（`latencyMs`）
- [x] 路由决策输出包含消息摘要、匹配级别、目标 Agent、耗时

---

### Step 3: 任务分解器

**目标：** 对复杂请求进行拆分，分配给多个 Agent 并行/串行执行。

新建 `savc-core/orchestrator/decomposer.mjs`：

```javascript
// 核心 API
export async function analyze(message, context)
// 返回:
// {
//   type: 'simple' | 'compound',
//   tasks: [
//     { agent: 'memory', task: '...', priority: 1, dependsOn: [] },
//     { agent: 'technical', task: '...', priority: 2, dependsOn: [] }
//   ],
//   execution: 'parallel' | 'sequential' | 'mixed'
// }
```

**分解规则：**

| 判断条件 | 类型 | 执行方式 |
|----------|------|----------|
| 单一意图，单一 Agent 可处理 | simple | 直接路由 |
| 包含"顺便"、"另外"、"同时"等连接词 | compound | 并行 |
| 后续任务依赖前序结果 | compound | 串行 |
| 包含记忆存储 + 其他任务 | compound | 并行（记忆存储不阻塞主任务） |

**分解流程：**
1. 路由器判断为 compound 类型时，调用分解器
2. 分解器使用 LLM 将消息拆分为子任务列表
3. 为每个子任务标注目标 Agent 和依赖关系
4. 返回执行计划

**验收标准：**
- [x] "帮我写个爬虫，顺便记住我喜欢 requests" → 2 个并行子任务
- [x] "先查一下昨天聊了什么，然后帮我继续那个项目" → 2 个串行子任务
- [x] "今天心情不好" → simple 类型，不触发分解
- [x] 分解结果包含完整的执行计划（agent、task、priority、dependsOn）

---

### Step 4: Agent 生命周期管理

**目标：** 基于 OpenClaw 的 `sessions_spawn` 实现 Agent 的创建、执行、监控和回收。

新建 `savc-core/orchestrator/lifecycle.mjs`：

```javascript
// 核心 API
export async function spawnAgent(agentDef, task, options)  // 创建并启动 Agent
export async function waitForAgent(runId, timeoutMs)       // 等待 Agent 完成
export async function waitForAll(runIds, timeoutMs)        // 等待多个 Agent
export async function cancelAgent(runId)                   // 取消运行中的 Agent
export function getStatus(runId)                           // 查询状态
```

**spawn 流程：**
```
1. 从 registry 获取 Agent 定义
2. 构建 session 配置:
   - sessionId: `savc-{agentName}-{timestamp}`
   - model: agentDef.model
   - systemPrompt: 合并 SOUL.md + Agent persona override
   - tools: agentDef.tools.allowed（过滤 denied）
   - timeout: agentDef.limits.timeout_seconds
3. 调用 OpenClaw sessions_spawn
4. 注册到 subagent-registry
5. 返回 runId
```

**监控与回收：**
- 超时自动取消（基于 Agent 定义的 `limits.timeout_seconds`）
- 异常捕获并记录到 `savc-core/memory/procedural/agent-errors.log`
- 完成后按 cleanup 策略处理 session（默认 `delete`）

**验收标准：**
- [x] `spawnAgent('companion', '抱抱用户')` 成功创建子 Agent 并返回 runId
- [x] `waitForAgent(runId)` 正确等待并返回 Agent 输出
- [x] 超时场景：Agent 超过 timeout 后被自动取消
- [x] 错误场景：Agent 异常时错误被捕获并结构化返回
- [x] `waitForAll([id1, id2])` 正确等待多个并行 Agent

---

### Step 5: 结果聚合器

**目标：** 将多个 Agent 的输出整合为统一的、符合媛媛人格的回复。

新建 `savc-core/orchestrator/aggregator.mjs`：

```javascript
// 核心 API
export async function aggregate(tasks, results, originalMessage)
// tasks: 分解器输出的任务列表
// results: 各 Agent 的输出 [{ agent, output, status, duration }]
// originalMessage: 用户原始消息
// 返回: 统一的回复文本
```

**聚合策略：**

| 场景 | 策略 |
|------|------|
| 单 Agent 结果 | 直接返回，不做额外处理 |
| 多 Agent 并行结果 | LLM 整合：保持媛媛人格，合并要点，去除重复 |
| 串行结果 | 返回最终 Agent 的输出（中间结果已作为上下文传递） |
| 部分失败 | 返回成功部分 + 告知用户失败部分及原因 |
| 全部失败 | Orchestrator 自行兜底回复 |

**聚合 prompt 模板：**
```
你是媛媛。以下是多个子任务的执行结果，请整合为一条自然的回复。

用户原始消息: "{{originalMessage}}"

子任务结果:
{{#each results}}
[{{agent}}] {{output}}
{{/each}}

要求:
- 保持媛媛的人格和语气（参考 SOUL.md）
- 信息完整，不遗漏任何子任务的关键输出
- 自然衔接，不要暴露"多个 Agent"的实现细节
- 如有失败的子任务，委婉告知用户
```

**验收标准：**
- [x] 单 Agent 结果直接透传，无额外 LLM 调用
- [x] 多 Agent 结果整合后语气统一，信息完整
- [x] 部分失败时用户能知道哪部分没完成
- [x] 聚合后的回复不暴露内部 Agent 架构

---

### Step 6: 集成到 OpenClaw 运行时

**目标：** 将编排层接入 OpenClaw 的消息处理流程。

**6a. 创建 SAVC Orchestrator 扩展**

参考 `openclaw/extensions/llm-task/` 的模式，创建：

```
openclaw/extensions/savc-orchestrator/
├── package.json
├── openclaw.plugin.json
└── src/
    └── index.ts          # 插件入口，注册编排工具
```

插件注册以下工具供主 Agent 使用：

| 工具名 | 功能 |
|--------|------|
| `savc_route` | 路由用户消息到合适的专家 Agent |
| `savc_decompose` | 分解复杂任务 |
| `savc_spawn_expert` | 生成指定专家 Agent |
| `savc_agent_status` | 查询 Agent 集群状态 |

**6b. 更新主 Agent 系统提示词**

在 `savc-core/SOUL.md` 中追加编排指令：

```markdown
## Agent 协同（当 savc-orchestrator 扩展启用时）

当收到用户消息时：
1. 评估是否需要专家 Agent 协助
2. 简单请求直接回复，复杂请求使用 savc_route 或 savc_decompose
3. 专家 Agent 的输出需要经过你的整合后再回复用户
4. 永远不要向用户暴露内部 Agent 架构
```

**6c. 配置 Agent 间权限**

在 OpenClaw 配置中启用 Agent 间通信：

```json
{
  "plugins": {
    "entries": {
      "savc-orchestrator": {
        "enabled": true,
        "config": {
          "spawnMode": "mock"
        }
      }
    }
  },
  "tools": {
    "agentToAgent": {
      "enabled": true,
      "allow": ["orchestrator", "companion", "technical", "creative", "tooling", "memory"]
    },
    "alsoAllow": [
      "savc-orchestrator",
      "savc_route",
      "savc_decompose",
      "savc_spawn_expert",
      "savc_agent_status"
    ]
  }
}
```

**验收标准：**
- [x] `savc-orchestrator` 扩展加载成功，工具注册到主 Agent
- [x] 本地 `node openclaw/openclaw.mjs plugins list --json` 可发现并启用插件工具
- [x] 专家 Agent 的 mock spawn 结果可返回并结构化输出
- [x] 编排工具调用结果不暴露内部架构细节

> 当前状态：Step 6 已完成（2026-02-10，mock spawn 后端，本地 gate 通过）。

---

### Step 7: 共享记忆集成

**目标：** 所有 Agent 共享同一套记忆系统，保持上下文连贯。

**与语义记忆方案的衔接：**

| 记忆操作 | 执行者 | 说明 |
|----------|--------|------|
| 记忆写入 | memory Agent | 专职负责，其他 Agent 通过 Orchestrator 委托 |
| 记忆读取 | 所有 Agent | 每个 Agent spawn 时注入相关记忆上下文 |
| 语义搜索 | memory Agent | 封装 `memory_semantic.mjs`，提供搜索服务 |
| 上下文注入 | Orchestrator | spawn 专家 Agent 前，先召回相关记忆拼入 task |

**上下文注入流程：**
```
用户消息到达
  │
  ▼ Orchestrator
  │  1. 调用 memory_recall(用户消息) 获取相关记忆
  │  2. 路由/分解任务
  │  3. spawn 专家 Agent 时，将记忆上下文拼入 task:
  │     task = "[相关记忆]\n{recalled_memories}\n\n[用户请求]\n{original_message}"
  │
  ▼ 专家 Agent 执行时已具备记忆上下文
```

**验收标准：**
- [x] 专家 Agent 能引用用户历史偏好（通过 `savc_spawn_expert` 语义召回注入）
- [x] 记忆写入统一由 memory Agent 处理（`agent=memory` + `persistMemory=true` 分支）
- [x] 路由/分解/执行链共享同一语义记忆层配置

> 当前状态：Step 7 已完成（2026-02-10，插件层共享记忆接入完成，真实 spawn 联调待下一里程碑）。

---

### Step 8: 测试与调优

**8a. 单元测试**

新建 `tests/orchestrator/`：

| 测试文件 | 覆盖范围 |
|----------|----------|
| `registry.test.mjs` | Agent 发现、匹配、热重载 |
| `router.test.mjs` | 三级路由策略、边界情况 |
| `decomposer.test.mjs` | 任务分解、依赖识别 |
| `lifecycle.test.mjs` | spawn、wait、cancel、超时 |
| `aggregator.test.mjs` | 结果整合、失败处理 |

**8b. 集成测试场景**

| # | 场景 | 预期行为 |
|---|------|----------|
| 1 | "抱抱我" | → companion Agent，高甜回复 |
| 2 | "这段代码有 bug" + 代码片段 | → technical Agent，排障回复 |
| 3 | "帮我写个故事" | → creative Agent，创意输出 |
| 4 | "查一下明天天气" | → tooling Agent，API 调用 |
| 5 | "帮我写代码，顺便记住我的偏好" | → 分解为 technical + memory，并行执行 |
| 6 | "先看看昨天聊了什么，然后继续" | → 分解为 memory → technical，串行执行 |
| 7 | 模糊请求 "你觉得呢" | → 回退到 orchestrator 自行处理 |
| 8 | Agent 超时 | → 超时取消 + 兜底回复 |

**8c. 性能基线**

| 指标 | 目标值 |
|------|--------|
| 路由延迟（Level 1 关键词） | < 5ms |
| 路由延迟（Level 2 LLM） | < 500ms |
| 单 Agent spawn 到首次输出 | < 2s |
| 多 Agent 并行完成（2 个） | < 5s |
| 聚合延迟 | < 1s |

**验收标准：**
- [x] 所有单元测试通过
- [x] 核心版 8 个场景通过（1-7 集成场景 + 超时场景在 lifecycle 测试覆盖）
- [ ] 性能指标达到基线要求（待下一阶段压测）
- [x] Phase 1/3 回归通过；Phase 2 live env 缺失项保持既有阻塞结论

---

### 当前阶段结论（2026-02-10）

- 已完成：Step 1-8（其中 Step 6/7 为 mock spawn 后端），`scripts/test_phase4b.sh` 与 `scripts/test_phase4b_plugin.sh` 通过
- 下一里程碑：真实 `sessions_spawn/sessions_send` 联调与 Discord 端到端验证

---

## 4. Agent 通信协议

### 4.1 内部协议（当前阶段）

Agent 间通过 OpenClaw 的 `sessions_spawn` + `sessions_send` 通信，消息格式：

```json
{
  "from": "orchestrator",
  "to": "technical",
  "type": "task",
  "payload": {
    "task": "用 Python requests 写一个爬虫",
    "context": {
      "memories": ["用户偏好: requests 库", "上次项目: 数据采集"],
      "user_profile": "..."
    },
    "constraints": {
      "max_turns": 50,
      "timeout_seconds": 300
    }
  },
  "timestamp": "2026-02-09T10:00:00Z"
}
```

### 4.2 A2A 协议兼容（未来扩展）

为产品化预留 Google A2A (Agent2Agent) 协议兼容层：

- 每个 Agent 暴露 Agent Card（JSON 描述自身能力）
- 支持 HTTP/SSE 通信模式
- 支持跨实例 Agent 协作

当前阶段不实现，但 Agent 定义格式（YAML）已包含 A2A Agent Card 所需的字段（name、description、triggers），未来可直接映射。

---

## 5. 成本控制策略

### 5.1 模型分级

| Agent | 模型 | 单次成本估算 | 理由 |
|-------|------|-------------|------|
| Orchestrator | Claude Opus | ~$0.05 | 需要强规划能力 |
| 技术 Agent | Claude Opus | ~$0.08 | 复杂推理 |
| 陪伴 Agent | Claude Sonnet | ~$0.01 | 闲聊不需要最强模型 |
| 创意 Agent | Claude Sonnet | ~$0.02 | 创意任务中等复杂度 |
| 工具 Agent | Claude Haiku | ~$0.002 | 简单工具调用 |
| 记忆 Agent | Claude Haiku | ~$0.001 | 结构化读写 |
| 路由（Level 2） | Claude Haiku | ~$0.001 | 意图分类 |

### 5.2 优化手段

- **Level 1 关键词路由零成本** — 大部分日常消息可被关键词命中
- **简单请求不分解** — 避免不必要的 LLM 调用
- **单 Agent 结果不聚合** — 直接透传，省一次 LLM 调用
- **后续接入 Ollama** — 路由和简单 Agent 可用本地模型替代

---

## 6. 风险与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| 路由误判 | 用户请求被发到错误的 Agent | Level 3 兜底；用户可通过指令强制指定 Agent |
| Agent 间上下文丢失 | 专家 Agent 不了解对话历史 | spawn 时注入记忆上下文；关键信息写入共享记忆 |
| 并发 Agent 资源竞争 | 多个 Agent 同时写文件 | 记忆写入统一由 memory Agent 处理；文件操作加锁 |
| 成本失控 | 复杂请求触发多个 Opus Agent | 设置每日 token 预算上限；监控告警 |
| 人格不一致 | 不同 Agent 语气风格差异 | 所有 Agent 继承 SOUL.md；聚合器统一语气 |
| 延迟增加 | 多 Agent 链路比单 Agent 慢 | 简单请求直接路由不分解；并行执行减少串行等待 |

---

## 7. 后续演进方向

完成本方案后，可进一步扩展：

1. **Vibe Coding Agent** — 专门的代码生成 Agent，支持自然语言驱动开发，集成文件系统操作
2. **视觉 Agent** — 接入图像理解模型，处理截图分析、UI 审查等视觉任务
3. **语音 Agent** — 集成 TTS/STT，处理实时语音流，路由到对应专家 Agent
4. **Live2D Agent** — 驱动虚拟形象的表情和动作状态机，根据对话情绪实时切换
5. **Agent 市场** — 用户可自定义和分享 Agent 定义，构建社区生态
6. **跨实例协作** — 通过 A2A 协议实现不同 SAVC 实例间的 Agent 协作

---

## 8. 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `savc-core/agents/orchestrator.yaml` | 主编排 Agent 定义 |
| 新建 | `savc-core/agents/companion.yaml` | 陪伴 Agent 定义 |
| 新建 | `savc-core/agents/technical.yaml` | 技术 Agent 定义 |
| 新建 | `savc-core/agents/creative.yaml` | 创意 Agent 定义 |
| 新建 | `savc-core/agents/tooling.yaml` | 工具 Agent 定义 |
| 新建 | `savc-core/agents/memory.yaml` | 记忆 Agent 定义 |
| 新建 | `savc-core/orchestrator/registry.mjs` | Agent 注册与发现 |
| 新建 | `savc-core/orchestrator/router.mjs` | 意图路由器 |
| 新建 | `savc-core/orchestrator/decomposer.mjs` | 任务分解器 |
| 新建 | `savc-core/orchestrator/lifecycle.mjs` | Agent 生命周期管理 |
| 新建 | `savc-core/orchestrator/aggregator.mjs` | 结果聚合器 |
| 新建 | `openclaw/extensions/savc-orchestrator/` | OpenClaw 编排扩展（mock spawn） |
| 新建 | `scripts/phase4b_enable_plugin.sh` | 插件启用与权限配置幂等脚本 |
| 新建 | `scripts/test_phase4b_plugin.sh` | 插件 gate 自动化验收脚本 |
| 更新 | `savc-core/SOUL.md` | 追加 Agent 协同指令 |
| 更新 | `config/models.yaml` | 新增各 Agent 模型配置 |
| 新建 | `tests/orchestrator/*.test.mjs` | 编排层测试 |
| 新建 | `scripts/test_phase4b.sh` | Phase 4b 核心自动化验收脚本 |
