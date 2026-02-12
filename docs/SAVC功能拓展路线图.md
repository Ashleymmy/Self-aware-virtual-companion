# SAVC 功能拓展路线图

> 版本: 1.0
> 日期: 2026-02-09
> 状态: 执行中（Phase 4 收尾完成：Auto-Recall/Auto-Capture/时间衰减/本地 Embedding/real+sessions_send+性能压测；Phase 5c 已完成 M-C1~M-C3，M-C4 基线验证已落地）

---

## 1. 总览

本文档是 SAVC 项目 Phase 4+ 的整体路线图，涵盖六个功能方向的推进顺序、依赖关系和执行标准。

### 1.1 六大方向

| # | 方向 | 核心价值 | 详细方案 |
|---|------|----------|----------|
| A | 记忆系统语义检索 | 让媛媛真正"记住"用户 | `记忆系统语义检索升级方案.md` |
| B | 多 Agent 协同编排 | 专业分工，按需调度 | `多Agent协同编排方案.md` |
| C | Vibe Coding | 自然语言驱动开发 | 本文 §3 |
| D | 实时语音交互 | 语音对话，拟人体验 | 本文 §4 |
| E | 视觉能力 | 图像理解与生成 | 本文 §5 |
| F | Live2D 互动 | 虚拟形象，情感可视化 | 本文 §6 |

### 1.2 依赖关系与推进顺序

```
Phase 4a: 记忆语义检索 (A)
  │       ↓ 提供共享记忆基础
Phase 4b: 多 Agent 编排 (B)
  │       ↓ 提供 Agent 路由与调度基础
  ├───────┬───────┬───────┐
  │       │       │       │
Phase 5: (C)    (D)    (E)    ← 可并行推进，互不依赖
  │    Vibe    语音    视觉
  │   Coding
  │       │       │       │
  └───────┴───────┴───────┘
          │
Phase 6:  (F) Live2D 互动    ← 依赖语音 + 视觉的情绪信号
```

**关键路径：A → B → (C/D/E 并行) → F**

---

## 2. Phase 4: 基础能力层

### Phase 4a: 记忆系统语义检索

> 详见 `记忆系统语义检索升级方案.md`

**摘要：**
- 引入 LanceDB 向量数据库，实现语义检索
- 混合架构：Markdown 文件层 + 向量层
- 三种搜索模式：keyword / semantic / hybrid
- 双写机制保证数据同步

**里程碑：**

| 里程碑 | 内容 | 验收标准 | 状态 |
|--------|------|----------|------|
| M-A1 | 依赖安装 + LanceDB 可用 | `import('@lancedb/lancedb')` 无报错 | ✅ 完成 |
| M-A2 | `memory_semantic.mjs` 开发完成 | store/search/migrate 全部可用 | ✅ 完成 |
| M-A3 | 集成到 `memory_runtime.mjs` | `--mode semantic` 可用，双写生效 | ✅ 完成 |
| M-A4 | 历史数据迁移完成 | 语义搜索能召回历史记忆 | ✅ 完成 |
| M-A5 | 下游脚本适配 | proactive + reflection 使用语义搜索 | ✅ 完成 |
| M-A6 | 调优与监控上线 | usage.log + health 命令可用 | ✅ 完成 |

---

### Phase 4b: 多 Agent 协同编排

> 详见 `多Agent协同编排方案.md`

**摘要：**
- 基于 OpenClaw 内置 `sessions_spawn` / `sessions_send` 构建
- 声明式 Agent 定义（YAML）
- 三级路由：关键词 → LLM 意图分类 → 兜底
- 任务分解 + 并行执行 + 结果聚合
- 模型分级控制成本

**里程碑：**

| 里程碑 | 内容 | 验收标准 | 状态 |
|--------|------|----------|------|
| M-B1 | Agent 定义 + 注册发现 | 6 个 YAML 定义，自动发现可用 | ✅ 完成 |
| M-B2 | 意图路由器 | 三级路由正确分发 | ✅ 完成 |
| M-B3 | 任务分解器 | 复杂请求正确拆分 | ✅ 完成 |
| M-B4 | Agent 生命周期管理 | spawn/wait/cancel 全部可用 | ✅ 完成 |
| M-B5 | 结果聚合器 | 多 Agent 输出统一整合 | ✅ 完成 |
| M-B6 | OpenClaw 扩展集成 | 插件发现、工具注册、可调用 | ✅ 完成（默认 mock，支持 real） |
| M-B7 | 共享记忆集成 | 语义召回注入 + memory 持久化分支 | ✅ 完成（mock + real） |
| M-B8 | 测试通过 | 8 个集成场景 + 性能基线达标 | ✅ 核心 + 插件 + real backend + sessions_send + perf baseline 通过（Discord 联调软门槛） |

---

## 3. Phase 5c: Vibe Coding

### 3.1 目标

让媛媛成为一个 **自然语言驱动的开发助手**：用户用自然语言描述需求，媛媛自动生成代码、创建文件、运行测试、迭代修复。

### 3.2 核心能力

| 能力 | 说明 |
|------|------|
| 需求理解 | 从自然语言提取功能需求、技术约束、验收标准 |
| 代码生成 | 生成完整的可运行代码，而非片段 |
| 项目感知 | 理解现有项目结构、依赖、代码风格，生成一致的代码 |
| 迭代修复 | 运行代码 → 捕获错误 → 自动修复 → 重试，直到通过 |
| 测试驱动 | 先生成测试，再生成实现，确保可验证 |

### 3.3 实现方案

基于多 Agent 编排，新增 `vibe-coder` Agent：

```yaml
# savc-core/agents/vibe-coder.yaml
name: vibe-coder
label: "Vibe Coding Agent"
description: "自然语言驱动的代码生成与迭代修复"

model:
  provider: anthropic
  name: claude-opus-4-5-20251101
  thinking: high

tools:
  allowed:
    - bash
    - file_read
    - file_write
    - file_edit
    - memory_recall
    - web_search
    - sessions_spawn          # 可生成子 Agent（如测试 Agent）
```

**工作流：**
```
用户: "帮我写一个 Express API，有用户注册和登录功能"
  │
  ▼ Orchestrator → vibe-coder Agent
  │
  ▼ vibe-coder 执行:
  │  1. 分析项目结构（package.json、现有代码）
  │  2. 制定实现计划（拆分为文件级任务）
  │  3. 逐文件生成代码
  │  4. 运行 lint + test
  │  5. 捕获错误 → 修复 → 重试（最多 3 轮）
  │  6. 输出: 变更文件列表 + 运行结果 + 使用说明
  │
  ▼ Orchestrator 整合回复
```

### 3.4 里程碑

| 里程碑 | 内容 | 验收标准 | 状态 |
|--------|------|----------|------|
| M-C1 | vibe-coder Agent 定义 + 基础工具链 | Agent 可 spawn 并执行文件操作 | ✅ 完成（`savc-core/agents/vibe-coder.yaml` + `scripts/test_phase5c.sh`） |
| M-C2 | 项目感知能力 | 能正确分析项目结构并生成一致代码 | ✅ 完成（`savc-core/orchestrator/vibe-coder.mjs` 项目扫描 + 一致性计划） |
| M-C3 | 迭代修复循环 | 错误自动修复，3 轮内通过率 > 80% | ✅ 完成（`runIterativeFixLoop`，最多 3 轮） |
| M-C4 | 端到端验证 | 通过自然语言生成完整可运行的小项目 | 🟡 进行中（已完成 mock 基线 E2E：`tests/orchestrator/vibe-coder.test.mjs` + `scripts/test_phase5c.sh`） |

---

## 4. Phase 5d: 实时语音交互

### 4.1 目标

让媛媛支持 **实时语音对话**：用户说话 → 语音识别 → Agent 处理 → 语音合成 → 播放回复。

### 4.2 技术选型

| 组件 | 候选方案 | 推荐 |
|------|----------|------|
| STT (语音→文本) | Whisper (OpenAI) / Deepgram / Azure Speech | Deepgram（低延迟流式识别） |
| TTS (文本→语音) | OpenAI TTS / ElevenLabs / Azure TTS / Fish Speech | ElevenLabs（音色自然，支持中文） |
| 流式传输 | WebSocket / WebRTC | WebSocket（与 OpenClaw Gateway 一致） |
| VAD (语音活动检测) | Silero VAD / WebRTC VAD | Silero VAD（准确率高） |

### 4.3 架构

```
用户麦克风
  │ 音频流 (WebSocket)
  ▼
┌──────────────────┐
│  Voice Gateway    │  新增组件
│  - VAD 检测       │
│  - STT 流式识别   │
│  - 音频缓冲管理   │
└────────┬─────────┘
         │ 文本
         ▼
  OpenClaw Gateway → Orchestrator → 专家 Agent
         │
         │ 回复文本
         ▼
┌──────────────────┐
│  TTS 合成         │
│  - 流式合成       │
│  - 情绪语调控制   │
└────────┬─────────┘
         │ 音频流
         ▼
  用户扬声器/耳机
```

### 4.4 关键挑战

| 挑战 | 应对 |
|------|------|
| 延迟要求高（< 1s 端到端） | 流式 STT + 流式 TTS，不等完整句子 |
| 打断处理 | VAD 检测到用户说话时中断 TTS 播放 |
| 情绪语调 | TTS 参数根据 Agent 输出的情绪标签动态调整 |
| 中英混合 | 选择支持中英混合的 TTS 模型 |
| 成本 | STT/TTS 按秒计费，闲聊场景成本较高 |

### 4.5 里程碑

| 里程碑 | 内容 | 验收标准 |
|--------|------|----------|
| M-D1 | Voice Gateway 原型 | WebSocket 接收音频 → STT → 文本输出 |
| M-D2 | TTS 集成 | 文本 → 语音合成 → 流式播放 |
| M-D3 | 端到端语音对话 | 说话 → 识别 → Agent 回复 → 语音播放 |
| M-D4 | 打断与 VAD | 用户说话时自动中断回复 |
| M-D5 | 情绪语调 | 根据对话情绪调整语音风格 |

---

## 5. Phase 5e: 视觉能力

### 5.1 目标

让媛媛能 **看懂图片**：用户发送截图、照片、UI 设计稿，媛媛能理解内容并给出反馈。

### 5.2 核心能力

| 能力 | 场景 |
|------|------|
| 截图分析 | "帮我看看这个报错截图" → 识别错误信息并排障 |
| UI 审查 | "这个页面设计怎么样" → 给出布局、配色、可用性建议 |
| 图片理解 | "这张照片是什么" → 描述图片内容 |
| 图表解读 | "帮我分析这个数据图" → 提取数据趋势和洞察 |
| 图像生成 | "帮我画一个 logo" → 调用图像生成 API |

### 5.3 实现方案

**图像理解：** Claude 原生支持多模态输入（vision），无需额外模型。

**图像生成：** 通过工具调用外部 API（DALL-E / Stable Diffusion）。

新增 `vision` Agent：

```yaml
# savc-core/agents/vision.yaml
name: vision
label: "视觉 Agent"
description: "图像理解、UI 审查、图表分析、图像生成"

model:
  provider: anthropic
  name: claude-opus-4-5-20251101   # 多模态能力
  vision: true

tools:
  allowed:
    - image_analyze       # 内置多模态
    - image_generate      # 调用 DALL-E / SD API
    - memory_recall
    - web_search
```

**与多 Agent 编排的集成：**
```
用户发送图片 + "帮我看看这个报错"
  │
  ▼ Orchestrator 检测到图片附件
  │  → 路由到 vision Agent（图像理解）
  │  → vision Agent 识别出是代码报错
  │  → 转交 technical Agent 排障
  │
  ▼ 聚合: 截图分析 + 排障方案
```

### 5.4 里程碑

| 里程碑 | 内容 | 验收标准 |
|--------|------|----------|
| M-E1 | 图像理解基础 | 发送截图，Agent 能描述内容 |
| M-E2 | 截图排障 | 发送报错截图，给出排障建议 |
| M-E3 | UI 审查 | 发送设计稿，给出改进建议 |
| M-E4 | 图像生成 | 自然语言描述 → 生成图片 |
| M-E5 | 多 Agent 联动 | 视觉 + 技术 Agent 协作排障 |

---

## 6. Phase 6: Live2D 互动

### 6.1 目标

为媛媛提供 **可视化虚拟形象**：Live2D 模型实时展示表情、动作，根据对话情绪和语音韵律动态变化。

### 6.2 核心能力

| 能力 | 说明 |
|------|------|
| 表情联动 | 对话情绪 → 表情参数（开心、难过、思考、惊讶） |
| 口型同步 | TTS 音频 → 口型动画（lip sync） |
| 动作触发 | 特定事件 → 动作（挥手、点头、歪头） |
| 待机动画 | 无对话时的自然待机动作（眨眼、呼吸、微动） |
| 交互响应 | 用户点击/触摸 → 反应动作 |

### 6.3 技术选型

| 组件 | 候选方案 | 推荐 |
|------|----------|------|
| Live2D 引擎 | Live2D Cubism SDK / PixiJS + pixi-live2d | pixi-live2d-display（Web 端，开源） |
| 口型同步 | rhubarb-lip-sync / 音频振幅映射 | 音频振幅映射（简单可靠） |
| 情绪检测 | Agent 输出情绪标签 / 文本情感分析 | Agent 输出标签（已有情绪节奏设计） |
| 前端框架 | Electron / Web (React) / Unity | Web (React)（跨平台，与 OpenClaw WebChat 集成） |

### 6.4 架构

```
┌─────────────────────────────────────┐
│  Web 前端 (React)                    │
│  ┌─────────────┐  ┌──────────────┐  │
│  │  Live2D      │  │  对话界面     │  │
│  │  Canvas      │  │  (WebChat)   │  │
│  │  - 表情控制  │  │  - 文本输入   │  │
│  │  - 口型同步  │  │  - 语音输入   │  │
│  │  - 动作触发  │  │  - 消息展示   │  │
│  └──────┬──────┘  └──────┬───────┘  │
│         │                │           │
│         ▼                ▼           │
│  ┌─────────────────────────────┐    │
│  │  Emotion Controller          │    │
│  │  - 解析 Agent 情绪标签       │    │
│  │  - 映射到 Live2D 参数        │    │
│  │  - 平滑过渡动画              │    │
│  └──────────────┬──────────────┘    │
└─────────────────┼───────────────────┘
                  │ WebSocket
                  ▼
           OpenClaw Gateway
```

**情绪标签 → Live2D 参数映射：**

```javascript
const EMOTION_MAP = {
  happy:    { eyeSmile: 0.8, mouthSmile: 0.9, bodyAngle: 2 },
  sad:      { eyeSmile: 0.0, mouthSmile: 0.1, bodyAngle: -3 },
  thinking: { eyeSmile: 0.3, mouthSmile: 0.4, headTilt: 10 },
  excited:  { eyeSmile: 1.0, mouthSmile: 1.0, bodyBounce: true },
  comfort:  { eyeSmile: 0.6, mouthSmile: 0.7, headNod: true },
  neutral:  { eyeSmile: 0.4, mouthSmile: 0.5, bodyAngle: 0 }
};
```

### 6.5 前置依赖

- **实时语音 (Phase 5d)** — 口型同步需要音频流
- **视觉能力 (Phase 5e)** — 情绪检测可复用视觉 Agent 的分析能力
- **多 Agent 编排 (Phase 4b)** — 情绪标签由 Agent 输出，编排层传递给前端

### 6.6 里程碑

| 里程碑 | 内容 | 验收标准 |
|--------|------|----------|
| M-F1 | Live2D 模型加载与渲染 | Web 页面展示媛媛形象，待机动画正常 |
| M-F2 | 情绪表情联动 | Agent 回复带情绪标签 → 表情变化 |
| M-F3 | 口型同步 | TTS 播放时口型动画同步 |
| M-F4 | 交互响应 | 点击模型触发反应动作 |
| M-F5 | 完整集成 | 语音对话 + Live2D + 文本界面统一体验 |

---

## 7. 产品化考量

既然目标是两者兼顾（自用 + 产品化），以下设计贯穿所有阶段：

### 7.1 可配置性

| 层面 | 可配置项 |
|------|----------|
| 人格 | SOUL.md + persona/ 可替换为任意角色 |
| Agent 集群 | agents/ 目录下的 YAML 可自由增删 |
| 模型 | 每个 Agent 独立配置 provider + model |
| 渠道 | channels.yaml 配置启用的通信渠道 |
| 语音 | TTS/STT provider 可切换 |
| 形象 | Live2D 模型文件可替换 |

### 7.2 多用户隔离

```
用户 A 的 SAVC 实例
├── savc-core/          # 独立的人格和记忆
│   ├── SOUL.md         # 用户 A 的角色定义
│   ├── agents/         # 用户 A 的 Agent 集群
│   └── memory/         # 用户 A 的记忆（完全隔离）
└── config/             # 用户 A 的配置

用户 B 的 SAVC 实例
├── savc-core/          # 完全独立
└── config/
```

### 7.3 部署模式

| 模式 | 适用场景 | 说明 |
|------|----------|------|
| 本地部署 | 个人自用 | 当前模式，WSL2 / macOS / Linux |
| Docker 部署 | 技术用户自托管 | 提供 docker-compose 一键部署 |
| 云端托管 | 非技术用户 | 未来考虑，需要多租户架构 |

---

## 8. 执行时间线

```
2026 Q1 (当前)
  └── Phase 4a: 记忆语义检索 ██████████ (已完成)

2026 Q1-Q2
  └── Phase 4b: 多 Agent 编排 ██████████ (核心+插件完成，默认mock/可切real)

2026 Q2-Q3 (可并行)
  ├── Phase 5c: Vibe Coding  ███████░░░
  ├── Phase 5d: 实时语音     ██░░░░░░░░
  └── Phase 5e: 视觉能力     ██░░░░░░░░

2026 Q3-Q4
  └── Phase 6:  Live2D 互动  ░░░░░░░░░░
```

> 注：时间线仅表示推进顺序，不代表工期承诺。实际进度取决于投入时间和技术验证结果。

---

## 9. 全局验收标准

每个 Phase 完成后，需满足以下通用标准：

| 标准 | 说明 |
|------|------|
| 向后兼容 | 现有功能不受影响，`npm run test:all` 通过 |
| 文档完整 | 对应方案文档更新为"已完成"状态 |
| 可配置 | 新功能可通过配置开关启用/禁用 |
| 可观测 | 关键操作有日志记录，异常有告警 |
| 成本可控 | API 调用有监控，不超过预设预算 |
| 人格一致 | 所有新增交互方式保持媛媛的人格特征 |
