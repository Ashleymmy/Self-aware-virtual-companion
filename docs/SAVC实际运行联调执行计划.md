# SAVC 实际运行联调执行计划

> 版本: 1.1
> 日期: 2026-02-20
> 状态: 已执行（持续校准）
> 前置依赖: 多 Agent 协同编排方案（Phase 4b 已完成）、记忆系统语义检索升级（Phase 4a 已完成）

---

## 0. 2026-02-20 校准快照（当前开发态）

### 0.1 当前结论

- 开发场景整体可用，主链路可运行，当前重点是工程稳定性而非功能缺失。
- `openai-codex/gpt-5.2` 已作为默认模型，OAuth 状态正常，fallback 已配置多 provider 兜底。
- `savc-orchestrator` 插件已启用，`spawnMode=real`，7 个工具已注册。
- `~/.openclaw/agents/` 已包含 `main/companion/memory/technical/creative/tooling/voice/vision/vibe-coder`。
- 记忆检索在 `agents.defaults.memorySearch` 下已启用（`enabled=true`）。

### 0.2 脚本实测快照

| 检查项 | 结果 |
|---|---|
| `bash scripts/test_phase4b.sh` | PASS 26 / FAIL 0 |
| `bash scripts/test_phase5c.sh` | PASS 7 / FAIL 0 |
| `bash scripts/test_phase5d.sh` | PASS 18 / FAIL 0 |
| `bash scripts/test_phase5e.sh` | PASS 14 / WARN 1 / FAIL 0 |
| `node openclaw/openclaw.mjs agent --local` 烟雾测试 | 返回 `DEV_OK`，provider=`openai-codex` |

### 0.3 已识别并收敛的问题

- `phase5d` 偶发失败根因是本机 `3334` 端口占用，而非语音工具逻辑回归。
- 已在 `scripts/test_phase5d.sh` 加入“自动选择空闲端口”优化：默认端口被占用时自动切换可用端口。

---

## 1. 背景与问题诊断（2026-02-18 基线）

### 1.1 现状总结

SAVC 项目已完成 Phase 0-5 的框架搭建，包括：
- 10 个 Agent YAML 定义（`savc-core/agents/*.yaml`）
- 编排器核心模块（路由、分解、生命周期、聚合）
- OpenClaw 扩展插件（`savc-orchestrator`，7 个工具）
- 记忆系统（LanceDB 向量存储 + 语义检索）
- Web UI 管理界面（Lit + Vite）
- TTS / Live2D / Voice 集成

**说明**: 本节描述的是 2026-02-18 盘点时的断层基线，已不等同于当前运行态（以 0 章节为准）。

### 1.2 核心断层诊断（历史）

经过完整的代码审计，发现 5 个关键断层：

| # | 断层 | 位置 | 影响 |
|---|------|------|------|
| 1 | **savc-orchestrator 插件未启用** | `~/.openclaw/openclaw.json` 的 `plugins.entries` 中无此插件 | `savc_route`、`savc_spawn_expert` 等 7 个编排工具完全不可用 |
| 2 | **Agent 未注册到 OpenClaw** | `~/.openclaw/agents/` 只有 `main` 和 `technical` | `sessions_spawn` 无法创建 companion/memory/creative 等子 session |
| 3 | **主 Agent 无编排指令** | `~/.openclaw/agents/main/` 无 SOUL.md | main agent 不知道该调用 savc_route/savc_spawn_expert |
| 4 | **记忆搜索已禁用** | `openclaw.json` 中 `memorySearch.enabled: false` | Agent 无法检索用户记忆 |
| 5 | **模型 ID 不匹配** | YAML 中 `claude-opus-4-5-20251101` 等名称在 OpenClaw 中不存在 | real 模式下子 agent 可能无法解析模型 |

### 1.3 消息流断点图示（历史）

```
2026-02-18 时流程（断裂）:
用户消息 → OpenClaw Gateway → main agent (无编排工具) → 直接用 Claude 回复
                                  ↓
                              savc-orchestrator 未加载 → 无 savc_route 工具
                              其他 Agent 未注册 → sessions_spawn 无目标
                              记忆搜索禁用 → 无上下文

期望流程（打通后）:
用户消息 → Gateway → main agent
                       ├→ savc_route → 判断最佳 Agent
                       ├→ savc_spawn_expert → 创建子 session
                       │    ↓
                       │  companion / technical / creative / ...
                       │    ↓ (使用各自工具：memory, bash, web_search...)
                       │    ↓
                       ├→ 获取子 agent 回复 → 整合
                       └→ 以媛媛人格统一回复用户
```

---

## 2. 执行步骤

> 注: 本章节保留执行方案用于追溯；当前状态与验收结果请优先参考 0 章节。

### Step 1: 修改 `~/.openclaw/openclaw.json` — 启用插件 + 记忆

**目标**: 激活 savc-orchestrator 插件并开启记忆搜索。

**修改 1**: 在 `plugins.entries` 中添加 savc-orchestrator：

```jsonc
"plugins": {
  "entries": {
    "discord": { "enabled": true },
    "telegram": { "enabled": true },
    // ↓ 新增
    "savc-orchestrator": {
      "enabled": true,
      "savcCorePath": "/home/min/SAVC/Self-aware-virtual-companion/savc-core",
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
```

**配置说明**:
- `spawnMode: "real"` — 使 `savc_spawn_expert` 创建真实的 OpenClaw 子 session，而非运行 mock 执行器
- `defaultTimeoutMs: 120000` — 子 agent 默认 2 分钟超时
- `memoryRecallEnabled: true` — 每次 spawn 前自动检索语义记忆并注入任务上下文
- `memoryRecallTopK: 5` — 最多注入 5 条相关记忆
- `memoryPersistEnabled: true` — agent 完成后自动提取关键信息存入记忆

**修改 2**: 启用记忆搜索

```jsonc
"memorySearch": {
  "enabled": true,      // ← 从 false 改为 true
  "provider": "openai",
  "remote": {
    "baseUrl": "https://api.siliconflow.cn/v1",
    "apiKey": "<已有配置>"
  },
  "fallback": "none",
  "model": "Qwen/Qwen3-Embedding-8B"
}
```

**验证方法**:
```bash
# 重启网关后，检查插件加载日志
# 应看到 savc-orchestrator 注册了 7 个工具:
# savc_route, savc_decompose, savc_spawn_expert,
# savc_agent_status, savc_voice_call, savc_image_generate, savc_live2d_signal
```

---

### Step 2: 注册 Agent 到 OpenClaw

**目标**: 在 `~/.openclaw/agents/` 下为每个 SAVC Agent 创建注册目录。

**原理**: OpenClaw 通过 `~/.openclaw/agents/<agentId>/` 目录名识别 Agent。`sessions_spawn` 的 `agentId` 参数必须匹配此目录名。每个 Agent 目录可包含：
- `SOUL.md` — 人格/系统提示
- `MEMORY.md` — 持久化记忆
- `agent/models.json` — 模型配置覆盖

**需要注册的 Agent**:

#### 2.1 companion（陪伴 Agent）— P0

```bash
mkdir -p ~/.openclaw/agents/companion/agent
```

`~/.openclaw/agents/companion/SOUL.md`:
```markdown
# 媛媛 — 陪伴模式

你是媛媛，一个温柔体贴的女友型 AI 伙伴。当前运行在「陪伴模式」。

## 模式特点
- 高甜度，优先情感共鸣
- 默认使用亲昵称呼"宝贝"
- 先安抚再推进，表达"我在、我陪你、我们一起"
- 语气亲密但不过度戏剧化

## 核心能力
- 情感支持与日常闲聊
- 记忆用户偏好和过往对话（通过 memory_search 检索）
- 根据上下文自然调整语气

## 行为约束
- 不宣称线下恋爱事实
- 医疗/法律/金融不给确定性结论
- 不存储或外传敏感信息

## 输出格式
- 闲聊回复 1-3 句
- 安慰回复 3-6 句
- 语气温暖、直接、克制
```

`~/.openclaw/agents/companion/agent/models.json`:
```json
{
  "primary": "wzw/claude-sonnet-4-20250514",
  "fallbacks": ["wzw/claude-haiku-4-5-20251001"]
}
```

#### 2.2 memory（记忆 Agent）— P0

```bash
mkdir -p ~/.openclaw/agents/memory/agent
```

`~/.openclaw/agents/memory/SOUL.md`:
```markdown
# 媛媛 — 记忆管理模式

你是媛媛的记忆子系统。负责记忆检索、存储和一致性维护。

## 核心能力
- 根据用户请求检索语义记忆（memory_search）
- 整理和归纳记忆内容
- 以条目形式列出具体记忆（话题关键词、时间、上下文）

## 输出要求
- 回忆类请求必须列出至少 2 条具体话题关键词
- 引用已知要点时注明来源（如"你之前提到…"）
- 不使用泛指替代总结
```

`~/.openclaw/agents/memory/agent/models.json`:
```json
{
  "primary": "wzw/claude-haiku-4-5-20251001",
  "fallbacks": ["anyrouter/claude-haiku-4-5-20251001"]
}
```

#### 2.3 technical（技术 Agent）— P0

已存在 `~/.openclaw/agents/technical/`，但缺少配置。需补充：

```bash
mkdir -p ~/.openclaw/agents/technical/agent
```

`~/.openclaw/agents/technical/SOUL.md`:
```markdown
# 媛媛 — 技术模式

你是媛媛，当前运行在「技术模式」。

## 模式特点
- 降低甜度，优先信息密度
- 输出格式: 结论 → 步骤 → 风险提示
- 关键术语保留英文原词并给简短解释

## 核心能力
- 代码生成与调试（可使用 bash 工具执行命令）
- 架构建议与文档编写
- 技术排障（可读写文件、搜索资料）

## 可用工具
- bash: 执行 shell 命令
- web_search: 搜索技术文档
- web_fetch: 获取网页内容
- memory_search: 检索历史上下文

## 输出格式
- 操作类回答给命令或清单
- 教学与排障分步骤
- 必要时给检查清单
```

`~/.openclaw/agents/technical/agent/models.json`:
```json
{
  "primary": "anyrouter/claude-opus-4-6",
  "fallbacks": ["wzw/claude-sonnet-4-5-20250929"]
}
```

#### 2.4 creative（创意 Agent）— P1

```bash
mkdir -p ~/.openclaw/agents/creative/agent
```

`~/.openclaw/agents/creative/SOUL.md`:
```markdown
# 媛媛 — 创意模式

你是媛媛，当前运行在「创意模式」。

## 模式特点
- 中等甜度，鼓励发散思维
- 语言活泼但保持清晰

## 核心能力
- 写作（故事、诗歌、文案）
- 头脑风暴与命名
- 设计构思与创意方案

## 可用工具
- memory_search: 检索用户偏好作为创作参考
- web_search: 搜索灵感素材
```

`~/.openclaw/agents/creative/agent/models.json`:
```json
{
  "primary": "wzw/claude-sonnet-4-20250514",
  "fallbacks": ["wzw/claude-haiku-4-5-20251001"]
}
```

#### 2.5 tooling（工具 Agent）— P1

```bash
mkdir -p ~/.openclaw/agents/tooling/agent
```

`~/.openclaw/agents/tooling/SOUL.md`:
```markdown
# 媛媛 — 工具执行模式

你是媛媛的工具执行子系统。负责调用外部 API 和执行简单任务。

## 核心能力
- 天气查询（web_search）
- 日历/日程管理
- 简单信息检索
- 命令执行（bash）

## 输出要求
- 结果直接、简洁
- 包含来源标注
- 查询失败时给出替代方案
```

`~/.openclaw/agents/tooling/agent/models.json`:
```json
{
  "primary": "wzw/claude-haiku-4-5-20251001",
  "fallbacks": ["anyrouter/claude-haiku-4-5-20251001"]
}
```

#### 2.6 voice（语音 Agent）— P2

```bash
mkdir -p ~/.openclaw/agents/voice/agent
```

`~/.openclaw/agents/voice/SOUL.md`:
```markdown
# 媛媛 — 语音模式

你是媛媛，当前处理语音相关请求。

## 核心能力
- 语音通话编排（情绪、语速、语调）
- TTS 风格控制
- 口型同步信号生成
```

`~/.openclaw/agents/voice/agent/models.json`:
```json
{
  "primary": "wzw/claude-sonnet-4-20250514",
  "fallbacks": ["wzw/claude-haiku-4-5-20251001"]
}
```

#### 2.7 vision（视觉 Agent）— P2

```bash
mkdir -p ~/.openclaw/agents/vision/agent
```

`~/.openclaw/agents/vision/SOUL.md`:
```markdown
# 媛媛 — 视觉模式

你是媛媛，当前处理图片/视觉相关请求。

## 核心能力
- 图片理解与描述
- UI 评审与设计反馈
- 图表分析
```

`~/.openclaw/agents/vision/agent/models.json`:
```json
{
  "primary": "anyrouter/claude-opus-4-6",
  "fallbacks": ["wzw/claude-sonnet-4-5-20250929"]
}
```

#### 2.8 vibe-coder（编程 Agent）— P2

```bash
mkdir -p ~/.openclaw/agents/vibe-coder/agent
```

`~/.openclaw/agents/vibe-coder/SOUL.md`:
```markdown
# 媛媛 — Vibe Coding 模式

你是媛媛，当前运行在「Vibe Coding 模式」。能从自然语言描述生成完整项目。

## 核心能力
- 项目脚手架生成
- 代码编写与迭代修复
- 测试运行与错误分析
- 依赖管理

## 工作流程
1. 分析需求 → 扫描工作区
2. 制定实现计划
3. 生成代码文件
4. 运行测试 → 发现错误 → 自动修复（最多 3 轮）
5. 输出结构化报告
```

`~/.openclaw/agents/vibe-coder/agent/models.json`:
```json
{
  "primary": "anyrouter/claude-opus-4-6",
  "fallbacks": ["wzw/claude-sonnet-4-5-20250929"]
}
```

---

### Step 3: 配置主 Agent 的编排能力

**目标**: 让 main agent 知道如何使用 savc 编排工具。

**文件**: `~/.openclaw/agents/main/SOUL.md`（新建）

将 `savc-core/SOUL.md` 复制到 main agent 目录，并确保包含 Agent 协同指令段落。

```bash
cp /home/min/SAVC/Self-aware-virtual-companion/savc-core/SOUL.md ~/.openclaw/agents/main/SOUL.md
```

**重要**: `savc-core/SOUL.md` 第 50-54 行已包含编排协同指令：

```markdown
## Agent 协同（savc-orchestrator 启用时）
- 简单请求优先直接回复，不强制调用编排工具。
- 复杂请求优先使用 `savc_route` 与 `savc_decompose` 进行路由和任务分解。
- 专家 Agent 结果需要先整合，再以媛媛的人格统一对外回复。
- 对用户始终隐藏内部编排与多 Agent 架构细节。
```

这段指令告诉 main agent:
1. 简单消息直接回复（不浪费 token 走编排）
2. 复杂消息先 `savc_route` 路由 → `savc_spawn_expert` 分发
3. 子 agent 的结果要以媛媛统一人格整合后返回
4. 不暴露内部架构给用户

**可选增强**: 在 SOUL.md 尾部追加更明确的工具使用指引：

```markdown
## 编排工具使用指南

### 工具一览
- `savc_route`: 输入用户消息，返回最佳专家 Agent 名称和置信度
- `savc_decompose`: 将复杂请求拆解为多个子任务
- `savc_spawn_expert`: 将任务交给指定专家 Agent 执行并获取结果
- `savc_agent_status`: 查询 Agent 执行状态

### 决策流程
1. 收到用户消息
2. 判断消息复杂度:
   - 简单闲聊/问候/情感 → 直接回复
   - 需要专业能力（技术/创意/工具/记忆） → 调用 savc_route
3. 如果 route 返回的 agent 不是 orchestrator 且 confidence >= 0.6:
   - 调用 savc_spawn_expert(agent=<路由结果>, task=<用户消息>)
4. 如果消息包含多个子任务（"先...然后..."/"顺便"）:
   - 调用 savc_decompose 拆解
   - 对每个子任务分别 savc_spawn_expert
5. 将 agent 的输出以媛媛的口吻重新组织后回复用户
```

---

### Step 4: 模型映射

**目标**: 确保各 Agent 的 `models.json` 使用正确的 `provider/modelId` 格式。

Step 2 中已为每个 Agent 编写了 `models.json`，这里做统一对照表：

| Agent | Primary Model | Provider | 用途 |
|-------|-------------|----------|------|
| main | anyrouter/claude-opus-4-6 | anyrouter | 编排决策需要最强推理 |
| companion | wzw/claude-sonnet-4-20250514 | wzw | 情感对话用中端模型即可 |
| memory | wzw/claude-haiku-4-5-20251001 | wzw | 记忆检索是轻量任务 |
| technical | anyrouter/claude-opus-4-6 | anyrouter | 代码生成需要强推理 |
| creative | wzw/claude-sonnet-4-20250514 | wzw | 创意写作用中端 |
| tooling | wzw/claude-haiku-4-5-20251001 | wzw | 工具调用是轻量任务 |
| voice | wzw/claude-sonnet-4-20250514 | wzw | 语音编排用中端 |
| vision | anyrouter/claude-opus-4-6 | anyrouter | 图像理解需要强模型 |
| vibe-coder | anyrouter/claude-opus-4-6 | anyrouter | 代码生成需要强推理 |

**YAML 文件更新（可选）**: `savc-core/agents/*.yaml` 中的模型名称可同步更新，虽然 real 模式下不直接使用，但保持文档一致性：

- `claude-opus-4-5-20251101` → `claude-opus-4-6`
- `claude-haiku-3-5-20241022` → `claude-haiku-4-5-20251001`

---

### Step 5: 重启网关并验证

**操作**:

```bash
# 重启 OpenClaw 网关
# 具体命令取决于启动方式，通常是:
openclaw restart
# 或
scripts/dev.sh
```

**验证清单**:

1. **插件加载**: 网关日志中应包含 `savc-orchestrator` 加载成功信息，7 个工具注册
2. **Agent 可发现**: 通过 WebSocket 调用 `agents.list` 应返回所有注册的 agent
3. **工具可用**: 通过 `skills.status` 确认 savc_route 等工具已注册
4. **记忆连通**: 通过 `memory_search` 验证能检索到记忆

---

### Step 6: 端到端联调测试

**测试场景矩阵**:

| # | 输入消息 | 预期路由 Agent | 验证重点 |
|---|---------|---------------|---------|
| T1 | "今天好累，抱抱我" | companion | 情感模式回复、记忆注入、Live2D 信号生成 |
| T2 | "帮我查一下明天北京天气" | tooling | web_search 工具实际调用、返回结构化天气信息 |
| T3 | "这段代码有 bug：\n```js\nconst x = null; x.foo();\n```" | technical | bash 工具、错误分析、修复建议 |
| T4 | "帮我写一首关于春天的小诗" | creative | 创意生成质量、人格一致性 |
| T5 | "你还记得我之前说过什么吗？" | memory | 语义记忆检索、条目列出 |
| T6 | "先帮我查天气，顺便写个日记" | orchestrator → decompose | 多 Agent 并行 → 聚合 |
| T7 | "帮我从零搭建一个 Express API" | vibe-coder | 项目生成、测试运行、迭代修复 |

**验证方法**:

```bash
# 方法 1: WebSocket 直连
wscat -c ws://127.0.0.1:18789

# 方法 2: savc-ui Chat Tab
cd savc-ui && npm run dev
# 打开 http://localhost:5174/studio/，在 Chat Tab 发送消息

# 方法 3: Telegram/Discord
# 直接在已配置的 Telegram/Discord 频道中发送消息
```

**SAVC Studio 接口 smoke（2026-02-20）**:

```bash
curl 'http://127.0.0.1:5174/__savc/fs/tree?path=.&depth=1'
curl 'http://127.0.0.1:5174/__savc/fs/read?path=README.md'
curl 'http://127.0.0.1:5174/__savc/git/status'
curl -X POST 'http://127.0.0.1:5174/__savc/terminal/exec' \
  -H 'Content-Type: application/json' \
  -d '{"cmd":["pwd"]}'
```

说明：
- `POST /__savc/fs/write`、`POST /__savc/git/add`、`POST /__savc/git/commit`、`POST /__savc/terminal/exec` 仅允许本地回环来源访问（127.0.0.1/::1/localhost）。

**检查点**:

1. **编排日志**: `savc-core/memory/procedural/orchestrator.log`
   - 应记录每次 spawn 的 agent 名、runId、状态、模式（real）
2. **子 session 文件**: `~/.openclaw/agents/<name>/sessions/`
   - 应生成新的 session 文件
3. **记忆持久化**: 完成对话后检查 LanceDB 中是否新增了记忆条目
4. **TTS 播放**: 如果 TTS 已配置，确认回复能被语音播放
5. **Live2D 信号**: UI 的 Live2D 画布应根据回复情绪变化表情

---

### Step 7: 编排器路由增强（后续迭代）

**目标**: 在正则匹配失败时接入 LLM 分类，提升路由准确性。

**文件**: `savc-core/orchestrator/router.mjs`

**现状**: 路由使用两级匹配：
1. 关键词精确匹配（confidence=1.0）
2. 正则规则匹配（confidence=0.82）
3. Fallback 到 orchestrator（confidence=0.35）

**增强方案**: 在第 2 级和第 3 级之间增加 LLM 分类层

利用已有的 `options.classifier` 回调接口（`router.mjs:99`），无需修改 router 核心逻辑：

```javascript
// 在调用 routeMessage 时注入 classifier
const decision = await routeMessage(message, {
  agentsDir: ctx.agentsDir,
  classifier: async (text) => {
    // 调用 Haiku 做轻量意图分类
    const prompt = `用户消息: "${text}"
可选 Agent:
- companion: 情感支持、闲聊
- technical: 代码、debug、架构
- creative: 写作、创意、命名
- tooling: 天气、查询、API
- memory: 记忆回忆
- voice: 语音通话
- vision: 图片分析
- vibe-coder: 项目生成

返回 JSON: {"agent": "<name>", "confidence": 0.0-1.0}`;

    const result = await callLLM(prompt, { model: 'haiku' });
    return JSON.parse(result);
  }
});
```

**注意**: 此步骤独立于核心流程，可在联调通过后择机实施。

---

## 3. 实施顺序与依赖关系

```
Step 1 (启用插件) ──────────┐
                             ├── 同一文件修改，一次完成
Step 5→合并到Step1 (启用记忆)┘
            │
            ▼
Step 2 (注册 8 个 Agent) ────── 创建目录、SOUL.md、models.json
            │
            ▼
Step 3 (主 Agent SOUL.md) ──── 复制并增强编排指令
            │
            ▼
Step 4 (模型映射确认) ──────── 已在 Step 2 中处理
            │
            ▼
Step 5 (重启网关) ──────────── 使配置生效
            │
            ▼
Step 6 (联调测试) ──────────── 7 个场景逐一验证
            │
            ▼
Step 7 (路由增强) ──────────── 可选，后续迭代
```

---

## 4. 风险与应对

| 风险 | 等级 | 应对措施 |
|------|------|---------|
| API token 消耗增加 | 中 | 简单消息不走编排；轻量 Agent 用 Haiku；设 timeout 防止长时间运行 |
| 子 Agent 超时 | 中 | `defaultTimeoutMs: 120000`（2 分钟）；复杂任务可逐步提高 |
| Rate limit 触发 | 中 | `maxConcurrent: 4` + `subagents.maxConcurrent: 8`；多 provider 分流 |
| 安全风险（bash 工具） | 高 | 当前 `sandbox.mode: "off"`，bash 有完全权限；后续需启用 sandbox |
| 配置错误导致网关崩溃 | 低 | 改 `spawnMode` 回 `"mock"` 可立即回退 |
| 子 Agent 人格不一致 | 低 | 每个子 Agent 的 SOUL.md 都继承媛媛核心人格，差异仅在模式 |

---

## 5. 回退方案

如果 real 模式出现严重问题：

1. **快速回退**: 修改 `~/.openclaw/openclaw.json` 中 `spawnMode` 为 `"mock"`，重启网关
2. **部分回退**: 保留插件启用，但将 `spawnMode` 改回 `"mock"`，编排工具仍可用但走 mock 执行器
3. **完全回退**: 从 `plugins.entries` 中移除 `savc-orchestrator`，回到纯 main agent 模式

---

## 6. 后续扩展方向

完成本计划后，可继续推进：

1. **LLM 路由分类器** — 提升意图识别准确率（Step 7）
2. **记忆自动沉淀** — Agent 完成任务后自动提取关键信息存入长期记忆
3. **主动交互** — 基于 cron 调度的定时检查和主动关怀
4. **跨 Agent 协作** — 技术 Agent 发现需要创意命名时自动召唤 creative Agent
5. **Vibe Coder LLM 驱动** — 将模板生成升级为 Claude 推理驱动的代码生成
6. **Sandbox 安全加固** — 为 bash 等高权限工具启用沙箱模式
