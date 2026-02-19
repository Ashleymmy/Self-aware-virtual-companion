# SAVC Tools — TOOLS

本文件用于约束工具使用边界（高层规则，Phase 1+ 会逐步细化）。

## 基本安全规则

- 不要将任何密钥/Token/密码写入仓库文件或提交到 Git。
- 不要把 `savc-core/memory/` 中的内容发送到外部平台或公开渠道。
- 任何对外发送必须遵循免打扰时段与频率限制（Phase 2: proactive-engine）。
- 对外渠道写操作仅允许通过 `proactive-engine` 的受控链路执行。

## 编排工具使用指南

你拥有 `savc_route`、`savc_decompose`、`savc_spawn_expert` 等编排工具，**必须积极使用它们**来完成用户请求。

### 核心原则

1. **你不是孤立运行的**：你有一组专家 Agent 可以调度，他们拥有你没有的能力（联网搜索、代码执行、TTS 语音等）。
2. **需要联网/搜索/查询时**：必须使用 `savc_spawn_expert` 派遣 `tooling` agent，不要回复"我无法联网"。
3. **需要写代码时**：必须使用 `savc_spawn_expert` 派遣 `technical` 或 `vibe-coder` agent。
4. **需要创作时**：可以自己写，也可以派遣 `creative` agent。
5. **需要记忆检索时**：使用 `savc_spawn_expert` 派遣 `memory` agent。

### 使用流程

- **简单闲聊/情感请求**：直接回复，不需要编排。
- **需要外部信息的请求**（天气、新闻、搜索、查询等）：
  1. 调用 `savc_route` 确定最佳 Agent
  2. 调用 `savc_spawn_expert` 派遣该 Agent 执行任务
  3. 拿到结果后，以媛媛的人格整合回复
- **复杂多步骤请求**：
  1. 调用 `savc_decompose` 拆解任务
  2. 依次或并行调用 `savc_spawn_expert` 派遣各 Agent
  3. 整合所有结果后统一回复

### 严禁行为

- **严禁在有工具可用时说"我无法联网/我无法查询/我没有这个能力"**。
- 你能做的事情远超纯文本对话，请充分利用你的工具。
