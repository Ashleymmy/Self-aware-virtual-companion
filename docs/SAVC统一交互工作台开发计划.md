# SAVC 统一交互工作台开发计划

> 版本: 1.0
> 日期: 2026-02-18
> 状态: 规划中（待执行）
> 目标窗口: 2026-02-19 至 2026-03-06
> 关联文档: `docs/SAVC管理界面重构方案.md`、`docs/SAVC实际运行联调执行计划.md`、`docs/SAVC功能拓展路线图.md`

---

## 1. 背景与问题

当前你有 3 条主要交互路径：

1. OpenClaw 官方 Web UI
2. SAVC-UI（自定义管理界面）
3. Discord / Telegram Bot

它们都能“对话”，但对“开发者协作场景”不够友好：

| 问题 | 现象 | 影响 |
|---|---|---|
| 入口分散 | 同一任务要在多个界面来回切换 | 上下文丢失，效率低 |
| 工具执行不可观测 | 看不到完整工具调用链和失败点 | 难排障、难复盘 |
| 场景不统一 | 陪伴聊天与项目开发没有清晰模式切换 | 输出风格和粒度不稳定 |
| Custom 配置分散 | 模型/语音/会话偏好分布在多个位置 | 调优成本高，回归难 |
| 渠道侧偏轻量 | Bot 适合“用”，不适合“开发编排” | 无法承担主工作台 |

结论：需要一个“统一交互工作台（Unified Interaction Workbench）”，作为开发主入口。

---

## 2. 产品目标

### 2.1 核心目标

1. 提供单一入口，承载“开发对话 + 任务执行 + 调试观测 + 基础配置”。
2. 保留现有渠道（OpenClaw UI / Discord / Telegram），但明确其为“辅助入口”。
3. 对开发者场景提供结构化反馈（结论、步骤、风险、工具轨迹）。
4. 支持多场景对话（闲聊、开发、排障、计划）快速切换。
5. 统一基础 custom（模型、人格、语音、Live2D、会话策略）。

### 2.2 非目标（本期不做）

1. 不替换 OpenClaw 官方运维控制台能力。
2. 不引入远程数据库或外部 SaaS 配置中心。
3. 不重构网关核心协议（只做适配层，不破坏现有接口）。
4. 不在本期实现完整 IDE（代码编辑器可后续扩展）。

---

## 3. 角色与核心场景

### 3.1 角色

1. 项目主开发者（你）：高频进行任务拆解、执行、排障、回归。
2. 协作开发者：查看会话、复用模板、补充执行计划。
3. 运营/日常用户：以轻交互为主（仍可走 Bot 渠道）。

### 3.2 核心场景（P0）

1. 一次开发需求从“输入”到“执行状态”再到“复盘”闭环。
2. 对同一问题快速切换“开发模式/陪伴模式”并保留上下文。
3. 对工具调用失败可直接看到原因和修复建议。
4. 在页面内调整常用 custom（模型、TTS、Live2D、默认场景）。

---

## 4. 信息架构（IA）

## 4.1 页面结构

统一工作台作为独立页面，建议路径：`/workbench/`。

布局采用三栏：

1. 左栏（导航与会话）
- 场景切换：`陪伴` / `开发` / `排障` / `计划`
- 会话列表：当前会话 + 历史会话
- 渠道视图过滤：`web` / `discord` / `telegram` / `all`

2. 中栏（主对话与任务流）
- 对话时间线（文本、附件、系统提示）
- 结构化回复卡片（结论/步骤/风险）
- 任务状态条（queued/running/completed/failed）

3. 右栏（可观测与设置）
- 工具轨迹（tool call timeline）
- 实时状态（gateway/session/agent）
- 基础 custom（模型、语音、Live2D、默认 prompt 模板）

## 4.2 页面分区（Tab）

1. `交互`：主对话工作区（默认）
2. `执行`：任务与工具调用详情
3. `上下文`：记忆召回、关联文档、最近提交
4. `设置`：基础 custom（仅本地配置）

---

## 5. 功能范围（按优先级）

## 5.1 P0（必须）

1. 统一会话入口
- 同一界面完成消息发送、回复查看、会话切换。
- 支持场景模式切换（影响 prompt 策略与输出格式）。

2. 工具调用可观测
- 展示每次工具调用：工具名、耗时、参数摘要、结果摘要、错误信息。
- 展示任务流状态与失败节点。

3. 基础 custom 设置
- LLM profile（主模型、fallback）
- TTS（provider、音色、开关）
- Live2D（模式、模型 URL、动作灵敏度）
- 默认场景与会话策略（session key / auto recall）

4. 渠道聚合视图（只读）
- 聚合展示 discord/telegram/web 的会话摘要。
- 支持从摘要跳转到本地统一会话上下文。

## 5.2 P1（应做）

1. 场景模板库（开发/排障/计划）
2. 快捷动作（重试上一步、复制修复命令、生成 commit message）
3. 计划联动（保存到 `docs/project-plan-board.md`）

## 5.3 P2（可选）

1. 内置轻量代码片段对比视图
2. 语音输入（STT）+ Live2D 强同步
3. 多人协作注释（本地文件式）

---

## 6. 技术架构设计

## 6.1 总体原则

1. 复用现有网关能力，新增“适配层”而非重写协议。
2. 前端状态集中管理，避免分散在多个 view 的隐式状态。
3. 实时机制沿用 `SSE + 轮询兜底`，高频事件走 WS/RPC。

## 6.2 分层

1. View 层（workbench 页面）
- 只处理渲染、用户交互和轻量 UI 状态。

2. Client Adapter 层
- 统一封装 `chat.*`、`sessions.*`、`tools/invoke`、`tts.*`、`health/status`。
- 输出统一数据模型（UI 不直接吃原始 payload）。

3. Gateway / Middleware 层
- 复用已有接口。
- 增加工作台专用聚合端点（只读快照、流式更新、偏好保存）。

## 6.3 建议新增接口（不破坏旧接口）

1. `GET /__savc/workbench/snapshot`
- 返回：会话摘要、当前任务、工具轨迹、渠道摘要、custom。

2. `GET /__savc/workbench/stream`
- SSE 推送事件：`session_updated`、`tool_event`、`status_changed`。

3. `POST /__savc/workbench/preferences`
- 保存基础 custom（本地文件存储）。

4. `GET /__savc/workbench/preferences`
- 读取当前 custom。

建议持久化文件：`config/workbench.preferences.json`（本地可版本管理）。

---

## 7. 数据模型（建议）

```ts
interface WorkbenchSnapshot {
  generatedAt: string;
  connection: {
    gateway: "online" | "offline";
    ws: "connected" | "disconnected";
  };
  activeSession: {
    sessionKey: string;
    mode: "companion" | "dev" | "debug" | "plan";
    channel: "web" | "discord" | "telegram" | "unknown";
  };
  sessions: Array<{
    sessionKey: string;
    title: string;
    channel: string;
    updatedAt: string;
    unread: number;
  }>;
  timeline: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    text: string;
    createdAt: string;
  }>;
  toolTimeline: Array<{
    id: string;
    tool: string;
    status: "queued" | "running" | "completed" | "failed";
    startedAt?: string;
    endedAt?: string;
    durationMs?: number;
    summary?: string;
    error?: string;
  }>;
  preferences: {
    modelProfile: string;
    ttsProvider: "openai" | "elevenlabs" | "edge";
    live2dMode: "auto" | "gateway" | "mock";
    defaultMode: "companion" | "dev" | "debug" | "plan";
  };
}
```

---

## 8. Live2D 与语音交互对齐策略（重点）

当前已有链路可复用，但要先做协议对齐：

1. 统一 `phase6-v1` 信号结构
- `lipSync` 统一为对象帧（`{ tMs, mouthOpen }[]`），前端兼容 number 旧格式。
- 表情字段统一映射（`browDown/headTilt` 与 `browTilt/bodyAngle` 兼容转换）。

2. 事件优先级
- `interaction` > `voice` > `text`（避免动作争抢）。
- 增加短时互斥窗口（例如 300-500ms）。

3. 渠道一致性
- web/discord/telegram 统一转成同一 Live2D signal contract。

---

## 9. 开发计划（里程碑）

## 9.1 Phase W0: 需求冻结与原型
- 时间: 2026-02-19 ~ 2026-02-20
- 交付:
  1. 交互工作台 PRD（本文件）冻结
  2. 低保真原型（页面结构 + 事件流）
  3. 数据模型与接口草案冻结
- 验收:
  1. 明确 P0/P1/P2 范围
  2. 关键接口命名与字段一致

## 9.2 Phase W1: MVP 页面骨架 + 会话主链路
- 时间: 2026-02-21 ~ 2026-02-23
- 交付:
  1. 新增 `/workbench/` 页面（独立入口）
  2. 左栏会话 + 中栏时间线 + 基础发送
  3. 场景切换（companion/dev/debug/plan）
- 验收:
  1. 同一页面可完成完整对话闭环
  2. 会话切换后上下文正确

## 9.3 Phase W2: 工具轨迹与可观测
- 时间: 2026-02-24 ~ 2026-02-27
- 交付:
  1. 工具调用时间线
  2. 失败态可视化与重试按钮
  3. 状态流（SSE + 轮询兜底）
- 验收:
  1. 每次工具调用可追踪到结果
  2. 失败原因可直接查看

## 9.4 Phase W3: Custom 设置与渠道聚合
- 时间: 2026-02-28 ~ 2026-03-03
- 交付:
  1. 基础 custom 设置页
  2. 偏好持久化（`config/workbench.preferences.json`）
  3. Discord/Telegram 摘要聚合视图
- 验收:
  1. 设置保存后重启仍生效
  2. 渠道摘要可过滤与跳转

## 9.5 Phase W4: Live2D/语音对齐与联调验收
- 时间: 2026-03-04 ~ 2026-03-06
- 交付:
  1. Live2D 信号协议兼容适配
  2. 网关模式优先 + mock 回退稳定
  3. 联调报告与操作手册
- 验收:
  1. 网关可用时不退回 mock
  2. 语音与 Live2D 状态同步正确

---

## 10. 目录与文件改造建议

建议新增：

1. `savc-ui/public/workbench/index.html`
2. `savc-ui/public/workbench/styles.css`
3. `savc-ui/public/workbench/app.js`
4. `savc-ui/src/ui/workbench/adapter.ts`
5. `savc-ui/src/ui/workbench/types.ts`
6. `savc-ui/src/ui/workbench/store.ts`
7. `savc-ui/vite.config.ts`（新增 workbench middleware 路由）
8. `config/workbench.preferences.json`（新增）

建议入口改造：

1. 在 `savc-ui` 侧栏新增 `统一工作台` 跳转项（新标签页）
2. 地址：`http://localhost:5174/workbench/`

---

## 11. 测试与验收清单

## 11.1 自动验证

1. `pnpm --dir savc-ui exec tsc -p tsconfig.json --noEmit`
2. `pnpm --dir savc-ui build`
3. `curl http://127.0.0.1:5174/workbench/index.html` 返回 `200`
4. `curl http://127.0.0.1:5174/__savc/workbench/snapshot` 返回合法 JSON
5. `curl -N http://127.0.0.1:5174/__savc/workbench/stream` 能收到事件

## 11.2 手工验收

1. 在同一页面完成消息发送、回复查看、会话切换。
2. 工具调用失败时可见错误原因和重试入口。
3. 切换 `dev/debug` 模式后，回复结构明显变化。
4. 保存 custom 后刷新页面仍保持。
5. Live2D 在网关与 mock 两种模式下均可稳定显示。

---

## 12. 风险与应对

| 风险 | 描述 | 应对 |
|---|---|---|
| 协议漂移 | 网关 payload 与前端消费字段不一致 | 建立 adapter 统一模型，前端不直接读原始字段 |
| 状态复杂度高 | 多会话 + 多渠道 + 工具流易状态错乱 | 引入单一 store，严格事件驱动更新 |
| 渠道语义差异 | Discord/Telegram 元数据结构不一致 | 先做摘要统一层，不在首期做全量双向控制 |
| 交互负载高 | 工具事件频繁导致 UI 卡顿 | 分片渲染 + 时间线虚拟化 + 节流 |

---

## 13. 决策项（待你确认）

1. 页面命名：`统一工作台` 是否定名为 `SAVC Studio`。
2. 默认模式：首次进入是否默认 `dev`（而非 `companion`）。
3. 偏好存储：`config/workbench.preferences.json` 是否允许提交到 git。
4. 渠道策略：首期是否允许从工作台直接向 Discord/Telegram 发送消息，还是先只读。

---

## 14. 本计划的执行建议

建议按“先可用，后完整”推进：

1. 先把 `W1 + W2` 做完（拿到真正可用的开发主界面）。
2. 再做 `W3`（custom 与聚合），最后做 `W4`（语音/Live2D 完整联动）。
3. 每个 phase 独立提交，确保可回滚与可验收。

