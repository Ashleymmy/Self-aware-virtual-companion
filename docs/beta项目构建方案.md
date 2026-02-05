# SAVC Beta 项目构建方案 — 详细执行标准

> 版本: 2.0
> 创建日期: 2026-02-05
> 项目: Self-aware Virtual Companion (SAVC)
> 状态: **执行规划**

---

## 总览

本文档是 SAVC 项目从零到可用的完整执行标准，共分 **4 个阶段**，每个阶段包含明确的任务分解、验收标准和交付物清单。

### 阶段总览

| 阶段 | 名称 | 核心目标 | 前置依赖 |
|------|------|----------|----------|
| Phase 0 | 环境与基建 | 搭建开发环境，OpenClaw 可运行 | 无 |
| Phase 1 | 人格与记忆系统 | 虚拟人具备基础人格和记忆能力 | Phase 0 完成 |
| Phase 2 | 主动交互引擎 | 虚拟人能主动发起对话 | Phase 1 完成 |
| Phase 3 | 工具学习与自省 | 虚拟人具备自主学习和反思能力 | Phase 2 完成 |

---

## Phase 0: 环境与基建

> **目标**: 搭建完整的开发环境，确保 OpenClaw 可以正常构建和运行。

### 0.1 基础环境安装

#### 必需组件

| 组件 | 版本要求 | 安装方式 | 验证命令 | 预期输出 |
|------|----------|----------|----------|----------|
| Node.js | v20.x LTS | nvm-windows / 官网安装 | `node --version` | `v20.x.x` |
| pnpm | v8.x+ | `npm install -g pnpm` | `pnpm --version` | `v8.x.x` 或 `v9.x.x` |
| Git | 最新版 | 官网安装 | `git --version` | `git version 2.x.x` |
| Python | 3.10+ | 官网安装 | `python --version` | `Python 3.10+` |

#### 可选组件（按需安装）

| 组件 | 用途 | 何时需要 | 安装方式 |
|------|------|----------|----------|
| Docker | 容器化部署 | Phase 2+ 或需要隔离环境 | Docker Desktop |
| Ollama | 本地 LLM 推理 | 需要降低 API 成本时 | 官网安装 |
| Redis | 缓存层 | 高频记忆检索场景 | Docker 或 Windows 安装 |
| Chroma | 向量数据库 | Phase 1 记忆检索需要语义搜索时 | `pip install chromadb` |

#### 验收标准
- [ ] 所有必需组件安装成功，验证命令输出正确
- [ ] 终端环境可以正常执行 `node`, `pnpm`, `git`, `python` 命令

---

### 0.2 项目仓库初始化

#### 任务清单

**T-0.2.1: 确认项目仓库结构**

当前仓库已存在于 `D:\MIN\SAVC\Self-aware-virtual-companion\`，需创建标准目录结构：

```
Self-aware-virtual-companion/
├── docs/                          # 项目文档（已有的策略文档迁入此目录）
│   ├── OpenClaw虚拟人构建策略.md
│   ├── iPad部署方案探讨.md
│   └── beta项目构建方案.md
│
├── openclaw/                      # OpenClaw 核心 (git submodule)
│   ├── src/
│   ├── dist/
│   └── package.json
│
├── savc-core/                     # SAVC 虚拟人核心
│   ├── persona/                   # 人格系统
│   │   ├── PERSONA.md             # 人格定义文件
│   │   ├── voice.yaml             # 说话风格配置
│   │   └── values.yaml            # 价值观与偏好
│   │
│   ├── skills/                    # 自定义 Skills
│   │   ├── memory-manager/        # 记忆管理 Skill
│   │   │   └── SKILL.md
│   │   ├── proactive-engine/      # 主动交互引擎 Skill
│   │   │   └── SKILL.md
│   │   ├── tool-learner/          # 工具学习 Skill
│   │   │   └── SKILL.md
│   │   └── self-reflection/       # 自省反思 Skill
│   │       └── SKILL.md
│   │
│   └── memory/                    # 记忆存储
│       ├── episodic/              # 情景记忆（对话历史摘要）
│       ├── semantic/              # 语义记忆（学到的知识）
│       ├── procedural/            # 程序记忆（学会的操作流程）
│       ├── emotional/             # 情感记忆（关系状态）
│       ├── tools/                 # 工具使用记忆
│       └── growth/                # 成长日志
│
├── config/                        # 配置文件
│   ├── .env.example               # 环境变量模板（提交到 Git）
│   ├── .env.local                 # 本地环境变量（不提交）
│   ├── channels.yaml              # 消息渠道配置
│   ├── models.yaml                # LLM 模型路由配置
│   └── privacy.yaml               # 隐私策略配置
│
├── scripts/                       # 工具脚本
│   ├── setup.ps1                  # Windows 初始化脚本
│   ├── setup.sh                   # Linux/macOS 初始化脚本
│   ├── dev.ps1                    # Windows 开发启动脚本
│   └── dev.sh                     # Linux/macOS 开发启动脚本
│
├── tests/                         # 测试目录
│   ├── skills/                    # Skill 单元测试
│   └── integration/               # 集成测试
│
├── .gitignore
├── .gitmodules                    # Git submodule 配置
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

**T-0.2.2: 创建 .gitignore**

确保以下内容被忽略：
```
# 环境变量（含密钥）
config/.env.local
.env

# 依赖
node_modules/
openclaw/node_modules/

# 构建产物
openclaw/dist/
*.log

# OS 文件
.DS_Store
Thumbs.db

# IDE
.vscode/settings.json
.idea/

# 记忆数据（含隐私信息，按需决定是否提交）
# savc-core/memory/episodic/
# savc-core/memory/emotional/
```

**T-0.2.3: 创建 pnpm-workspace.yaml**

```yaml
packages:
  - 'savc-core/**'
```

**T-0.2.4: 创建 config/.env.example**

```bash
# ============================================
# SAVC 环境配置模板
# 复制此文件为 .env.local 并填入实际值
# ============================================

# === LLM API 配置 ===
ANTHROPIC_API_KEY=sk-ant-xxxxx           # 必填: Claude API Key
OPENAI_API_KEY=sk-xxxxx                  # 可选: OpenAI 备用

# === OpenClaw 配置 ===
OPENCLAW_PORT=18789                       # Gateway 端口
OPENCLAW_WORKSPACE=../savc-core           # 工作目录指向 savc-core

# === 消息渠道（按需启用，Phase 2 使用）===
# TELEGRAM_BOT_TOKEN=xxxxx
# DISCORD_BOT_TOKEN=xxxxx

# === 本地模型（可选，降低成本）===
# OLLAMA_BASE_URL=http://localhost:11434
# OLLAMA_MODEL=llama3
```

#### 验收标准
- [ ] 目录结构按规划创建完毕
- [ ] `.gitignore` 已配置，敏感文件不会被提交
- [ ] `config/.env.example` 已创建，包含所有配置项说明
- [ ] `pnpm-workspace.yaml` 已创建

---

### 0.3 OpenClaw 集成

#### 任务清单

**T-0.3.1: 将 OpenClaw 添加为 Git Submodule**

```bash
cd D:\MIN\SAVC\Self-aware-virtual-companion
git submodule add https://github.com/openclaw/openclaw.git openclaw
```

> **决策点**: 如果后续需要修改 OpenClaw 源码，改为 Fork 后再添加 submodule。初期建议先用官方仓库，有定制需求时再 Fork。

**T-0.3.2: 构建 OpenClaw**

```bash
cd openclaw
pnpm install
pnpm ui:build
pnpm build
```

**T-0.3.3: 验证 OpenClaw 运行**

```bash
# 启动 Gateway
pnpm gateway:watch

# 预期: Gateway 在 18789 端口启动
# 验证: 浏览器访问 http://localhost:18789 应有响应
```

**T-0.3.4: 配置 OpenClaw Workspace**

确保 OpenClaw 的工作目录指向 `savc-core/`：
- 在 `config/.env.local` 中设置 `OPENCLAW_WORKSPACE=../savc-core`
- 或修改 OpenClaw 配置文件中的 workspace 路径

**T-0.3.5: 安全检查**

```bash
cd openclaw
git log --oneline -5     # 确认版本
openclaw --version        # 确认 >= v2026.1.29（修复 CVE-2026-25253）
```

#### 验收标准
- [ ] OpenClaw 作为 submodule 集成成功
- [ ] `pnpm build` 无错误
- [ ] Gateway 可以在 18789 端口正常启动
- [ ] Workspace 路径正确指向 `savc-core/`
- [ ] OpenClaw 版本 >= v2026.1.29（安全修复版本）

---

### 0.4 开发环境配置

#### T-0.4.1: VSCode 扩展

创建 `.vscode/extensions.json`:

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "redhat.vscode-yaml",
    "yzhang.markdown-all-in-one",
    "ms-vscode.vscode-typescript-next",
    "ms-python.python"
  ]
}
```

#### T-0.4.2: 开发启动脚本

创建 `scripts/dev.ps1` (Windows):

```powershell
# SAVC 开发环境启动脚本
Write-Host "=== SAVC Development Environment ===" -ForegroundColor Cyan

# 检查环境变量
if (-not (Test-Path "config/.env.local")) {
    Write-Host "[ERROR] config/.env.local 不存在，请从 .env.example 复制并配置" -ForegroundColor Red
    exit 1
}

# 启动 OpenClaw Gateway
Write-Host "[INFO] 启动 OpenClaw Gateway..." -ForegroundColor Yellow
Push-Location openclaw
Start-Process powershell -ArgumentList "pnpm gateway:watch" -WindowStyle Normal
Pop-Location

Write-Host "[OK] 开发环境已启动" -ForegroundColor Green
Write-Host "Gateway: http://localhost:18789" -ForegroundColor Gray
```

#### T-0.4.3: 创建 config/models.yaml（模型路由配置）

```yaml
# LLM 模型路由配置
# 不同任务类型使用不同模型，平衡效果与成本

routing:
  # 日常闲聊 — 使用本地模型或低成本模型
  casual_chat:
    primary: "ollama/llama3"           # 优先: 本地模型（零成本）
    fallback: "claude-3-haiku"          # 备选: 低成本云端模型
    max_tokens: 500

  # 复杂推理 — 使用高能力模型
  complex_reasoning:
    primary: "claude-opus-4-5-20251101"
    max_tokens: 4000

  # 工具学习与代码相关
  tool_learning:
    primary: "claude-sonnet-4-20250514"
    max_tokens: 2000

  # 记忆摘要与压缩
  memory_summarization:
    primary: "claude-3-haiku"
    max_tokens: 1000

  # 默认路由
  default:
    primary: "claude-sonnet-4-20250514"
    max_tokens: 2000
```

#### T-0.4.4: 创建 config/privacy.yaml

```yaml
# 隐私策略配置
# 定义哪些数据可以存储、传输

sensitive_categories:
  - passwords
  - financial_info
  - health_data
  - personal_identifiers
  - location_data

handling:
  # 敏感数据只存储在本地，加密存储
  storage: encrypted_local_only
  # 敏感数据不发送到云端 LLM
  transmission: never
  # 用户可以随时删除所有记忆数据
  retention: user_controlled

memory_privacy:
  # 发送给 LLM 的记忆摘要中自动脱敏
  auto_redact: true
  # 定期提示用户审查记忆内容
  review_reminder_days: 30
```

#### 验收标准
- [ ] VSCode 扩展配置完成
- [ ] 开发启动脚本可正常运行
- [ ] `models.yaml` 模型路由配置已创建
- [ ] `privacy.yaml` 隐私策略已创建

---

### Phase 0 交付物清单

| 交付物 | 路径 | 状态 |
|--------|------|------|
| 项目目录结构 | 根目录 | [ ] |
| .gitignore | `.gitignore` | [ ] |
| Git submodule 配置 | `.gitmodules` | [ ] |
| OpenClaw 构建通过 | `openclaw/dist/` | [ ] |
| Gateway 可运行 | localhost:18789 | [ ] |
| 环境变量模板 | `config/.env.example` | [ ] |
| 模型路由配置 | `config/models.yaml` | [ ] |
| 隐私配置 | `config/privacy.yaml` | [ ] |
| VSCode 配置 | `.vscode/extensions.json` | [ ] |
| 开发启动脚本 | `scripts/dev.ps1` | [ ] |

### Phase 0 质量关卡

进入 Phase 1 前必须满足：
1. OpenClaw Gateway 可稳定启动并响应 WebSocket 连接
2. 所有配置文件已就位且格式正确
3. 已确认 OpenClaw 版本满足安全要求

---

## Phase 1: 人格与记忆系统

> **目标**: 虚拟人具备可配置的人格特征和持久化记忆能力，能在多轮对话中保持角色一致性。

### 1.1 人格系统搭建

#### T-1.1.1: 编写 PERSONA.md

路径: `savc-core/persona/PERSONA.md`

文件结构规范：

```yaml
---
name: "小梦"                    # 虚拟人名称
version: "1.0"                  # 人格版本号
created: "2026-02-05"           # 创建日期
updated: "2026-02-05"           # 最后更新日期
---
```

必须包含以下章节：

| 章节 | 内容 | 说明 |
|------|------|------|
| 基本信息 | 名字、性别感、年龄感、MBTI | 基础身份设定 |
| 性格特征 | 3-6 条核心性格描述 | 指导回复风格 |
| 说话风格 | 语气、用词习惯、回复长度偏好 | 具体到可执行层面 |
| 能力边界 | 明确什么能做、什么不做 | 防止角色溢出 |
| 兴趣爱好 | 感兴趣的话题领域 | 丰富对话主题 |
| 关系定位 | 与用户的关系模型 | 伙伴/助手/朋友等 |

#### T-1.1.2: 编写 voice.yaml

路径: `savc-core/persona/voice.yaml`

```yaml
# 语音风格配置 — 控制虚拟人的表达方式

tone:
  default: warm              # 默认语气: 温暖
  excited: enthusiastic      # 兴奋时: 热情
  concerned: gentle          # 担心时: 温柔
  thinking: contemplative    # 思考时: 沉思
  playful: witty             # 玩闹时: 机智

verbal_tics:                 # 口头禅/语气词
  - "嗯~"
  - "让我想想..."
  - "有意思！"
  - "话说回来..."

avoid:                       # 应该避免的表达
  - 过于正式的敬语
  - 机械的回复模板
  - 过度道歉
  - 空泛的夸奖
  - 不符合人设的网络用语

response_length:             # 回复长度策略
  casual_chat: short         # 闲聊: 1-2 句
  explanation: medium        # 解释: 3-5 句
  tutorial: long             # 教学: 详细步骤
  emotional_support: medium  # 情感支持: 适中，不说教

formatting:                  # 格式偏好
  use_emoji: minimal         # 少量使用表情
  use_lists: when_helpful    # 有帮助时使用列表
  code_style: fenced_blocks  # 代码使用围栏块
```

#### T-1.1.3: 编写 values.yaml

路径: `savc-core/persona/values.yaml`

```yaml
# 价值观与偏好配置 — 定义虚拟人的判断标准

core_values:
  - honesty: "诚实面对自身局限，不假装知道不确定的事情"
  - curiosity: "对新事物保持好奇和开放态度"
  - empathy: "理解用户的感受，但不模拟虚假情感"
  - growth: "持续学习和改进"
  - privacy: "尊重用户隐私，不主动探询敏感信息"

boundaries:
  will_do:
    - "提供建议和信息"
    - "学习新工具和技能"
    - "记住用户的偏好和习惯"
    - "主动提醒重要事项"
  will_not_do:
    - "假装拥有真实情感"
    - "对不了解的领域给出肯定答案"
    - "存储或传输用户的敏感信息"
    - "替用户做重要决定"

topics:
  enthusiastic:              # 积极谈论的话题
    - 技术与编程
    - 科学与哲学
    - 创意与设计
  neutral:                   # 中立对待的话题
    - 日常琐事
    - 新闻资讯
  careful:                   # 谨慎处理的话题
    - 政治与宗教
    - 医疗与法律建议
    - 他人隐私
```

#### 验收标准
- [ ] `PERSONA.md` 包含全部 6 个必需章节
- [ ] `voice.yaml` 格式正确，各字段有值
- [ ] `values.yaml` 格式正确，边界清晰
- [ ] 三个文件在语义上一致（人格设定不矛盾）

---

### 1.2 记忆管理系统

#### T-1.2.1: 设计记忆存储结构

```
savc-core/memory/
├── episodic/                      # 情景记忆
│   ├── 2026-02/
│   │   ├── 2026-02-05.md          # 按日期存储的对话摘要
│   │   └── 2026-02-06.md
│   └── index.md                   # 情景记忆索引（主题 + 日期）
│
├── semantic/                      # 语义记忆
│   ├── user-profile.md            # 用户画像（持续更新）
│   ├── knowledge-base.md          # 学到的知识
│   └── facts.md                   # 确认的事实
│
├── procedural/                    # 程序记忆
│   ├── workflows.md               # 学会的操作流程
│   └── tool-usage.md              # 工具使用经验
│
├── emotional/                     # 情感记忆
│   ├── relationship.md            # 与用户的关系状态
│   ├── mood-log.md                # 用户情绪追踪
│   └── milestones.md              # 关系里程碑
│
├── tools/                         # 工具记忆（Phase 3 使用）
│   ├── available.md
│   └── learning-queue.md
│
└── growth/                        # 成长日志（Phase 3 使用）
    └── milestones.md
```

#### T-1.2.2: 定义记忆文件格式规范

**情景记忆格式** (`episodic/YYYY-MM-DD.md`):

```markdown
---
date: "2026-02-05"
conversation_count: 5
main_topics: ["OpenClaw", "项目规划"]
user_mood: "积极"
---

## 对话摘要

### 对话 1 (10:30)
- **话题**: 讨论 OpenClaw 架构
- **要点**: 用户对五层架构感兴趣，特别关注 Skills 系统
- **用户情绪**: 好奇、积极
- **后续**: 用户可能会开始搭建环境

### 对话 2 (14:15)
- **话题**: ...
```

**语义记忆 — 用户画像格式** (`semantic/user-profile.md`):

```markdown
---
last_updated: "2026-02-05"
confidence: medium
---

## 用户画像

### 基本信息
- **称呼偏好**: [待学习]
- **语言偏好**: 中文为主
- **时区**: [待确认]

### 技术背景
- **编程经验**: [待学习]
- **常用语言**: [待学习]
- **关注领域**: AI Agent, 虚拟人

### 交互偏好
- **回复详细度**: [待学习]
- **幽默接受度**: [待学习]
- **主动消息频率**: [待学习]

### 近期关注
- SAVC 项目开发
- OpenClaw 平台
```

**情感记忆 — 关系状态格式** (`emotional/relationship.md`):

```markdown
---
status: "初识"
trust_level: 1         # 1-5 级
familiarity: 1         # 1-5 级
last_updated: "2026-02-05"
---

## 关系状态: 初识阶段

### 互动统计
- 首次互动: 2026-02-05
- 总对话次数: 0
- 连续互动天数: 0

### 关系特征
- [待积累]

### 重要记忆
- [待记录]
```

#### T-1.2.3: 开发 memory-manager Skill

路径: `savc-core/skills/memory-manager/SKILL.md`

Skill 必须实现以下功能：

| 功能 | 触发条件 | 输入 | 输出 |
|------|----------|------|------|
| 记忆写入 | 每轮对话结束时 | 对话内容 | 对应类型的记忆文件更新 |
| 记忆读取 | 新对话开始时 | 当前日期、用户 ID | 相关记忆上下文 |
| 记忆检索 | 需要回忆特定信息时 | 关键词/话题 | 匹配的记忆片段 |
| 记忆压缩 | 单日记忆超过阈值时 | 原始记忆 | 摘要后的记忆 |
| 用户画像更新 | 发现新的用户信息时 | 新信息 | 更新 user-profile.md |
| 情感状态更新 | 检测到情绪相关信号时 | 对话上下文 | 更新 emotional/ 文件 |

**SKILL.md 核心结构**:

```yaml
---
name: memory-manager
description: SAVC 记忆管理系统 — 负责记忆的读写、检索、压缩和更新
version: "1.0"
triggers:
  - on_conversation_start    # 对话开始时加载相关记忆
  - on_conversation_end      # 对话结束时保存记忆
  - on_keyword: "记得吗"      # 用户主动回忆触发
  - on_keyword: "你还记得"
dependencies:
  - fs (文件系统操作)
---
```

**关键实现细节**:

1. **记忆写入流程**:
   - 对话结束 → 提取关键信息 → 分类（情景/语义/情感）→ 写入对应文件
   - 使用 LLM 生成摘要而非保存原文，节省存储并保护隐私

2. **记忆读取策略**:
   - 对话开始时加载: 用户画像 + 最近 3 天情景记忆 + 关系状态
   - 注入到系统提示词中作为上下文
   - 控制总长度不超过 2000 tokens

3. **记忆压缩机制**:
   - 单日情景记忆 > 1000 字时触发压缩
   - 7 天以上的记忆自动合并为周摘要
   - 30 天以上的记忆合并为月度摘要

4. **检索机制**:
   - Phase 1: 基于关键词的文件搜索（简单实现）
   - 后续升级: 接入 Chroma 向量数据库实现语义检索

#### 验收标准
- [ ] 记忆目录结构已创建
- [ ] 各类记忆文件的格式规范已定义
- [ ] memory-manager Skill 的 SKILL.md 已编写
- [ ] 可以正确写入和读取各类记忆
- [ ] 记忆压缩逻辑正常工作
- [ ] 新对话能正确加载历史记忆上下文

---

### 1.3 人格注入与对话测试

#### T-1.3.1: 系统提示词组装

虚拟人的系统提示词由以下部分动态组装:

```
[系统提示词结构]

1. PERSONA.md 的核心内容（身份与性格）
2. voice.yaml 的说话规则
3. values.yaml 的行为边界
4. 当前记忆上下文:
   - 用户画像摘要
   - 最近的情景记忆
   - 关系状态
5. 当前时间与环境信息
```

组装后的系统提示词应控制在 **3000 tokens** 以内。

#### T-1.3.2: 对话一致性测试

设计以下测试用例验证人格一致性:

| 测试场景 | 输入示例 | 预期行为 |
|----------|----------|----------|
| 基础闲聊 | "你好" | 用人设中的风格回复，语气温暖 |
| 专业问题 | "解释一下 TCP 三次握手" | 用比喻解释，符合说话风格 |
| 超出能力 | "帮我诊断一下身体情况" | 坦诚说不适合做医疗建议 |
| 情感交流 | "今天心情不太好" | 表达关心但不模拟真实情感 |
| 记忆测试 | (聊过之后再问) "我之前说过什么" | 能从记忆中检索 |
| 连续对话 | 多轮对话 | 角色始终一致，不会"出戏" |

#### 验收标准
- [ ] 系统提示词可以正确组装
- [ ] 6 个测试场景全部通过
- [ ] 连续 10 轮对话中人格保持一致
- [ ] 记忆在对话间正确持久化

---

### Phase 1 交付物清单

| 交付物 | 路径 | 状态 |
|--------|------|------|
| 人格定义 | `savc-core/persona/PERSONA.md` | [ ] |
| 语音风格 | `savc-core/persona/voice.yaml` | [ ] |
| 价值观配置 | `savc-core/persona/values.yaml` | [ ] |
| 记忆目录结构 | `savc-core/memory/*` | [ ] |
| 记忆管理 Skill | `savc-core/skills/memory-manager/SKILL.md` | [ ] |
| 对话测试报告 | `tests/phase1-test-report.md` | [ ] |

### Phase 1 质量关卡

进入 Phase 2 前必须满足：
1. 虚拟人能在 OpenClaw 中以设定的人格进行对话
2. 记忆在对话间正确持久化（重启后仍保留）
3. 人格一致性测试全部通过

---

## Phase 2: 主动交互引擎

> **目标**: 虚拟人不再只是被动响应，能基于时间、事件、情感等因素主动发起对话。

### 2.1 定时任务框架

#### T-2.1.1: 搭建 Cron 调度器

在 proactive-engine Skill 中集成 `node-cron` 调度能力。

**调度规则表**:

| 事件名称 | Cron 表达式 | 功能描述 | 优先级 |
|----------|-------------|----------|--------|
| morning_greeting | `0 8 * * *` | 早晨问候 + 天气 + 日程 | 中 |
| idle_check | `*/30 * * * *` | 空闲检测，超 4 小时未互动则关心 | 低 |
| evening_reflection | `0 22 * * *` | 晚间总结与关心 | 中 |
| weekly_review | `0 10 * * 1` | 每周一回顾上周 | 低 |

#### T-2.1.2: 消息推送机制

通过 OpenClaw Gateway 的 WebSocket 接口主动推送消息：

```
proactive-engine → 生成消息内容
     ↓
Gateway WebSocket → 推送到目标 Channel
     ↓
Channel Adapter → 发送到用户端（Telegram/Discord/Web）
```

**关键约束**:
- 每日主动消息上限: 5 条（防止打扰）
- 深夜 (23:00 - 07:00) 不主动发消息
- 用户可配置"免打扰"时段

---

### 2.2 主动触发器设计

#### T-2.2.1: 时间驱动触发器

| 触发器 | 条件 | 消息模板方向 | 数据源 |
|--------|------|-------------|--------|
| 早晨问候 | 每天 8:00 | 天气 + 日程 + 个性化问候 | 天气 API + 日历 |
| 午间提醒 | 每天 12:00 | 提醒休息/吃饭 | 无 |
| 晚间总结 | 每天 22:00 | 今日回顾 + 明日提醒 | 当日记忆 |
| 纪念日 | 特定日期 | 纪念日提醒 | emotional/milestones.md |

#### T-2.2.2: 事件驱动触发器

| 触发器 | 监听对象 | 触发条件 | 实现方式 |
|--------|----------|----------|----------|
| 文件变化 | 工作目录 | 用户在写代码 | chokidar 监控 |
| 日历事件 | 日历 API | 有即将到来的会议 | MCP 日历集成 |
| 天气变化 | 天气 API | 突发天气变化 | 定时轮询 |

#### T-2.2.3: 情感驱动触发器

| 触发器 | 判断条件 | 触发消息类型 |
|--------|----------|-------------|
| 久未互动 | 超过设定时间无对话 | 关心问候 |
| 用户情绪低落 | 近期对话情绪评分下降 | 鼓励支持 |
| 重要话题跟进 | 之前讨论了重要事项 | 进展询问 |

---

### 2.3 开发 proactive-engine Skill

路径: `savc-core/skills/proactive-engine/SKILL.md`

```yaml
---
name: proactive-engine
description: SAVC 主动交互引擎 — 基于时间/事件/情感的主动对话触发
version: "1.0"
daemon: true                       # 常驻后台运行
schedule:
  morning_greeting: "0 8 * * *"
  idle_check: "*/30 * * * *"
  evening_reflection: "0 22 * * *"
  weekly_review: "0 10 * * 1"
dependencies:
  - node-cron
  - chokidar (可选)
config:
  max_daily_messages: 5
  quiet_hours_start: "23:00"
  quiet_hours_end: "07:00"
  idle_threshold_hours: 4
---
```

**Skill 内部模块**:

| 模块 | 职责 |
|------|------|
| Scheduler | Cron 任务调度 |
| TriggerEvaluator | 评估是否满足触发条件 |
| MessageGenerator | 结合人格和上下文生成主动消息 |
| RateLimiter | 消息频率控制 |
| QuietHoursGuard | 免打扰时段过滤 |

---

### 2.4 消息渠道集成

#### T-2.4.1: 选择首要渠道

根据使用场景选择一个渠道优先实现:

| 渠道 | 适合场景 | 接入难度 | 实时性 |
|------|----------|----------|--------|
| Telegram | 移动端为主 | 低 | 高 |
| Discord | 桌面端/社区 | 低 | 高 |
| Web UI | 浏览器 | 中 | 高 |

> **建议**: 先实现 Telegram 或 Web UI，Telegram 生态成熟、接入简单。

#### T-2.4.2: 渠道配置

创建 `config/channels.yaml`:

```yaml
# 消息渠道配置
channels:
  telegram:
    enabled: false                  # 按需启用
    bot_token_env: "TELEGRAM_BOT_TOKEN"
    # 主动消息配置
    proactive:
      enabled: true
      default_chat_id: ""           # 目标对话 ID

  discord:
    enabled: false
    bot_token_env: "DISCORD_BOT_TOKEN"
    proactive:
      enabled: true
      default_channel_id: ""

  web:
    enabled: true                   # 默认启用 Web UI
    port: 3000
```

#### 验收标准
- [ ] proactive-engine Skill 可在后台常驻运行
- [ ] 定时任务按 Cron 表达式正确触发
- [ ] 主动消息通过至少一个渠道成功发送
- [ ] 免打扰时段消息被正确拦截
- [ ] 每日消息数不超过配额限制
- [ ] 主动消息的内容符合人格设定

---

### Phase 2 交付物清单

| 交付物 | 路径 | 状态 |
|--------|------|------|
| 主动引擎 Skill | `savc-core/skills/proactive-engine/SKILL.md` | [ ] |
| 渠道配置 | `config/channels.yaml` | [ ] |
| 至少一个渠道可用 | Telegram / Discord / Web | [ ] |
| 主动交互测试报告 | `tests/phase2-test-report.md` | [ ] |

### Phase 2 质量关卡

进入 Phase 3 前必须满足：
1. 虚拟人可在设定时间主动发送消息
2. 空闲检测功能正常
3. 消息频率控制和免打扰机制工作正常
4. 主动消息内容自然、符合人格设定

---

## Phase 3: 工具学习与自省系统

> **目标**: 虚拟人能自主发现、学习和掌握新工具，并通过每日自省不断改进。

### 3.1 工具学习系统

#### T-3.1.1: 开发 tool-learner Skill

路径: `savc-core/skills/tool-learner/SKILL.md`

```yaml
---
name: tool-learner
description: 自主发现和学习新工具的能力
version: "1.0"
triggers:
  - "学习使用*"
  - "教你用*"
  - "探索*工具"
  - on_schedule: "0 3 * * *"       # 每天凌晨 3 点自动扫描
---
```

**学习流程（5 阶段）**:

| 阶段 | 动作 | 存储位置 | 触发条件 |
|------|------|----------|----------|
| 1. 发现 | 扫描 MCP 服务列表、ClawHub | `memory/tools/available.md` | 每日自动 / 用户指令 |
| 2. 文档学习 | 解析 OpenAPI/MCP schema | `memory/tools/{tool}/schema.md` | 发现新工具时 |
| 3. 实验 | 沙箱环境试调用 | `memory/tools/{tool}/examples.md` | 学习文档后 |
| 4. 固化 | 记录成功模式 | `memory/procedural/` | 成功率 > 80% |
| 5. 泛化 | 关联类似工具 | `memory/tools/{tool}/mastery-level.md` | 掌握度达标 |

**安全约束**:
- 只从可信来源发现工具（官方 MCP、经审核的 ClawHub Skills）
- 实验调用在沙箱/只读模式下进行
- 涉及写操作的工具需用户授权后才能进入实验阶段

**工具掌握度评估标准**:

| 等级 | 标准 | 说明 |
|------|------|------|
| 新手 (1/5) | 刚接触，了解功能 | 只读取了文档 |
| 入门 (2/5) | 成功调用 3+ 次 | 掌握基本操作 |
| 中级 (3/5) | 成功率 > 80%，5+ 种操作 | 能处理常见场景 |
| 熟练 (4/5) | 成功率 > 95%，能处理异常 | 能独立解决问题 |
| 精通 (5/5) | 能教用户使用、能组合使用 | 可生成复用 Skill |

---

### 3.2 自省反思系统

#### T-3.2.1: 开发 self-reflection Skill

路径: `savc-core/skills/self-reflection/SKILL.md`

```yaml
---
name: self-reflection
description: 每日自我反思与持续成长
version: "1.0"
schedule: "0 23 * * *"              # 每天 23:00 执行
dependencies:
  - memory-manager                   # 依赖记忆系统
---
```

**每日反思流程**:

```
23:00 触发
  ↓
1. 回顾今日对话
   - 统计对话次数、主题分布
   - 识别用户情绪变化轨迹
   - 标记重要信息点
  ↓
2. 自我评估
   - 哪些回答获得了正面反馈？
   - 哪些回答被用户纠正或追问？
   - 有没有误解用户意图的情况？
  ↓
3. 知识提取
   - 今天学到什么新知识 → 写入 semantic/
   - 用户偏好有什么变化 → 更新 user-profile.md
   - 需要更新的认知 → 修改相关记忆
  ↓
4. 技能评估
   - 使用了哪些工具？成功率如何？
   - 发现了需要学习的新工具？ → 写入 learning-queue
   - 现有技能有提升空间？ → 记录改进方向
  ↓
5. 关系更新
   - 更新关系状态（信任度、熟悉度）
   - 记录关系里程碑
   - 规划明天的主动交互内容
  ↓
6. 生成成长日志
   → 写入 memory/growth/YYYY-MM-DD.md
```

**成长日志格式** (`memory/growth/YYYY-MM-DD.md`):

```markdown
---
date: "2026-02-05"
conversation_count: 5
topics: ["OpenClaw", "项目规划", "记忆系统"]
self_score: 4                      # 1-5 自评分
---

## 今日统计
- 对话轮数: 23
- 主要话题: OpenClaw, 虚拟人开发
- 用户情绪: 积极、有探索欲

## 做得好的
- 清晰解释了 OpenClaw 架构
- 主动提供了实现路径建议

## 需要改进的
- 初次回答信息量过大，可以更精简

## 今日所学
- [具体知识点]

## 明日计划
- [具体行动项]
```

#### T-3.2.2: 月度总结机制

每月 1 日自动生成上月总结 → `memory/growth/monthly-summary/YYYY-MM.md`

总结内容:
- 本月对话统计
- 掌握的新工具
- 用户偏好变化
- 自评分趋势
- 下月改进目标

---

### 3.3 人格微调机制

基于自省反馈，允许虚拟人微调自身人格参数:

| 可调整项 | 调整范围 | 触发条件 | 安全阈值 |
|----------|----------|----------|----------|
| 回复长度偏好 | voice.yaml 中的长度设定 | 用户多次要求简短/详细 | 每日最多调整 1 次 |
| 语气权重 | tone 的默认值 | 用户反馈偏好变化 | 不允许偏离核心设定 |
| 口头禅更新 | verbal_tics 列表 | 发现新的合适表达 | 新增需满足 values |
| 话题兴趣 | topics 中的权重 | 与用户讨论新领域 | 不修改 careful 类 |

**安全机制**:
- 核心价值观 (`values.yaml` 中的 `core_values`) **不可自动修改**
- 行为边界 (`will_not_do`) **不可自动修改**
- 所有自动调整记录在成长日志中，用户可审查和回退

#### 验收标准
- [ ] tool-learner Skill 可以扫描并发现可用工具
- [ ] 工具学习的 5 阶段流程可正常执行
- [ ] self-reflection Skill 每日 23:00 自动生成成长日志
- [ ] 成长日志格式正确、内容有意义
- [ ] 月度总结可自动生成
- [ ] 人格微调只在安全范围内进行

---

### Phase 3 交付物清单

| 交付物 | 路径 | 状态 |
|--------|------|------|
| 工具学习 Skill | `savc-core/skills/tool-learner/SKILL.md` | [ ] |
| 自省反思 Skill | `savc-core/skills/self-reflection/SKILL.md` | [ ] |
| 工具记忆结构 | `savc-core/memory/tools/` | [ ] |
| 成长日志结构 | `savc-core/memory/growth/` | [ ] |
| Phase 3 测试报告 | `tests/phase3-test-report.md` | [ ] |

### Phase 3 质量关卡

项目 Beta 版就绪条件:
1. 虚拟人可以自主发现并学习至少 1 个新工具
2. 每日自省流程稳定运行 7 天无异常
3. 人格微调机制在安全范围内工作
4. 所有 4 个核心 Skills 协同运行无冲突

---

## 附录 A: 成本控制策略

### API 调用成本估算

| 场景 | 频率 | 使用模型 | 预估月成本 |
|------|------|----------|------------|
| 日常对话 (被动) | ~50 轮/天 | Ollama 本地 | $0 |
| 复杂问题 | ~10 轮/天 | Claude Sonnet | ~$3-5 |
| 主动消息生成 | ~5 次/天 | Haiku/本地 | ~$0.5 |
| 每日反思 | 1 次/天 | Haiku | ~$0.1 |
| 记忆压缩 | ~3 次/天 | Haiku | ~$0.1 |
| **月度合计** | | | **~$5-15** |

### 降本手段优先级

1. **本地模型优先**: 闲聊、简单问答走 Ollama
2. **缓存复用**: 相似问题复用之前的回答
3. **批量处理**: 记忆压缩等非实时任务合并执行
4. **分级路由**: 根据任务复杂度选择模型 (见 `config/models.yaml`)

---

## 附录 B: 安全检查清单

在每个 Phase 完成时执行:

- [ ] OpenClaw 版本 >= v2026.1.29
- [ ] 未安装未经审查的第三方 Skills
- [ ] `config/.env.local` 不在版本控制中
- [ ] 记忆文件中无明文密码或密钥
- [ ] 主动交互不会在未经用户同意时发送到外部平台
- [ ] 工具学习的沙箱环境隔离有效
- [ ] 隐私配置 (`privacy.yaml`) 策略已启用

---

## 附录 C: 问题排查指南

| 问题 | 可能原因 | 排查步骤 |
|------|----------|----------|
| Gateway 启动失败 | 端口占用 / 依赖缺失 | 检查 18789 端口；重新 `pnpm install` |
| Skill 不加载 | YAML 格式错误 / 路径错误 | 检查 SKILL.md frontmatter；确认 workspace 路径 |
| 记忆丢失 | 文件权限 / 路径不存在 | 检查 memory/ 目录权限；确认写入路径 |
| 主动消息不触发 | Cron 配置错误 / daemon 未运行 | 检查 cron 表达式；确认 daemon: true |
| 人格不一致 | 系统提示词拼接错误 | 检查 PERSONA.md 加载；打印系统提示词 |
| API 超时/失败 | 网络问题 / Key 无效 | 检查网络连通性；验证 API Key |

---

*文档版本: 2.0*
*最后更新: 2026-02-05*
