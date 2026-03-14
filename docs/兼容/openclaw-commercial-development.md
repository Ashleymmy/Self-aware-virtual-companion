# ThousandCliffs-AI OpenClaw 商用适配开发文档

> 本文档描述如何基于当前 SAVC / OpenClaw 仓库，为 ThousandCliffs 商用服务链路提供可调用、可联调、可测试、可上线的云端 Agent 能力层。
>
> 当前阶段目标不是做“长期最优架构”，而是先让商用链路跑通，再逐步把运行数据沉淀为媛媛的成熟化资产。
>
> 详细 REST / Webhook 契约见：`docs/兼容/openclaw-commercial-api-reference.md`
>
> 首轮联调字段范围请优先遵循该接口文档中的“1.6 V1 最小对接约定”。

---

## 目录

1. [定位与目标](#1-定位与目标)
2. [整体架构](#2-整体架构)
3. [系统边界](#3-系统边界)
4. [当前仓库可复用能力](#4-当前仓库可复用能力)
5. [本轮必须新增的能力层](#5-本轮必须新增的能力层)
6. [推荐目录与模块划分](#6-推荐目录与模块划分)
7. [对外任务接口设计](#7-对外任务接口设计)
8. [内部任务模型设计](#8-内部任务模型设计)
9. [任务类型与 Agent / Workflow 映射](#9-任务类型与-agent--workflow-映射)
10. [回调与状态同步设计](#10-回调与状态同步设计)
11. [数据记录与最小复盘设计](#11-数据记录与最小复盘设计)
12. [测试与上线建议](#12-测试与上线建议)
13. [分阶段实施建议](#13-分阶段实施建议)

---

## 1. 定位与目标

### 1.1 当前定位

当前 SAVC 仓库在商用体系中的角色，不是站点业务后端，而是：

```text
云上 OpenClaw / SAVC 能力层
```

它需要为业务后端提供：

- 任务执行能力
- 项目沟通能力
- 任务进度产出能力
- 结构化结果产出能力
- 可运维的状态与回调闭环

### 1.2 当前阶段目标

本轮目标按优先级排序如下：

1. 打通商用业务链路
2. 支撑测试环境和上线准备
3. 预留最小复盘数据
4. 再考虑深度学习与自我迭代

### 1.3 本轮不追求的目标

- 不先做复杂多节点集群调度
- 不先做完整训练平台
- 不让 SAVC 仓库接管站点主业务数据
- 不把本地 LLM 合并进云上 OpenClaw 服务

---

## 2. 整体架构

```text
闲鱼 / Web 站点订单
  -> Web 业务后端（FastAPI）
  -> 本地 LLM 服务（需求分析 / 分类）
  -> SAVC 商用适配服务层
  -> OpenClaw Gateway + Plugin + Agent Workflow
  -> SAVC 商用适配服务层
  -> Web 业务后端回调
  -> Web 前端 / 管理后台 / 通知
```

### 2.1 本轮关键判断

文档中的 Web 业务后端期待的是：

- 一个偏 REST 化的 OpenClaw 服务接口
- 一组稳定的任务类型
- 一组稳定的回调模型

而当前 SAVC 仓库已有的是：

- OpenClaw Gateway
- 插件工具层
- Agent 编排层
- 管理 UI
- 云上部署骨架

因此本轮的核心不是重写 OpenClaw，而是：

```text
在当前 SAVC / OpenClaw 基线之上，补一层“商用适配服务层”
把业务后端期望的任务接口，翻译为当前 OpenClaw 可执行能力
```

---

## 3. 系统边界

### 3.1 Web 业务后端负责

- 订单、支付、卡密、工单、项目主数据
- 用户权限与站点会话
- 通知与站点 WebSocket
- 本地 LLM 调用
- 项目状态机最终落库

### 3.2 SAVC / OpenClaw 负责

- 任务受理
- 任务执行
- 项目消息处理
- 规划 / 执行 /进度结构化结果输出
- 回调业务后端
- 保留最小运行日志与复盘信息

### 3.3 本地 LLM 负责

- 初始需求分析
- 分类
- 复杂度判断
- 轮次估计

### 3.4 人工管理员负责

- 审核关键节点
- 介入失败任务
- 做最终交付把关

---

## 4. 当前仓库可复用能力

### 4.1 已有部署层

- 云上 OpenClaw / SAVC 容器编排
- Gateway 运行入口
- UI / runtime 容器基线

当前文件：

- `infra/docker/docker-compose.prod.yml`
- `infra/docker/docker-compose.cloud.yml`
- `scripts/setup.sh`

### 4.2 已有编排层

- `packages/core/agents/*`
- `packages/core/orchestrator/*`
- `packages/plugin`

当前可复用工具：

- `savc_route`
- `savc_decompose`
- `savc_spawn_expert`
- `savc_agent_status`

### 4.3 已有真实执行能力

当前已经支持通过 OpenClaw 内部会话工具进行真实执行：

- `sessions_spawn`
- `sessions_send`
- `gateway/call`

关键文件：

- `packages/plugin/src/real-session-adapter.ts`
- `packages/plugin/src/tool-spawn-expert.ts`
- `packages/plugin/src/tool-agent-status.ts`

### 4.4 当前缺口

当前仍缺少：

- 面向业务后端的独立 REST 任务服务
- 任务持久化模型
- 回调投递器
- 幂等、重试、人工兜底
- 任务事件时间线

---

## 5. 本轮必须新增的能力层

本轮建议新增一层：

```text
SAVC 商用适配服务层
```

它位于：

```text
Web 业务后端
  <-> SAVC 商用适配服务层
  <-> OpenClaw Gateway / Plugin / Workflow
```

### 5.1 这一层的职责

- 提供 REST 任务接口
- 管理任务生命周期
- 将业务任务映射为 OpenClaw 执行链
- 统一收口任务结果
- 向业务后端发送回调
- 记录最小事件流

### 5.2 为什么不能直接让业务后端调用 `savc_*` 工具

直接调用会导致：

- 业务后端耦合 OpenClaw 内部实现细节
- 任务状态与项目状态难以统一
- 会话模型泄露到业务层
- 后续升级 OpenClaw 时破坏面过大

### 5.3 为什么也不该把这层挂在 `packages/ui/vite.config.ts`

当前 `packages/ui` 的中间件更像开发态辅助接口，不适合承担商用任务服务职责：

- 生命周期绑定 Vite
- 定位偏开发联调
- 不适合作为长期生产服务

因此这层应独立为新的运行时服务，而不是继续叠在 UI 里。

---

## 6. 推荐目录与模块划分

> 本节是建议结构，不代表当前仓库已实现。

### 6.1 推荐新增目录

```text
packages/service/
├── package.json
├── src/
│   ├── server.mjs
│   ├── config.mjs
│   ├── routes/
│   │   ├── health.mjs
│   │   ├── tasks.mjs
│   │   └── admin.mjs
│   ├── services/
│   │   ├── task-service.mjs
│   │   ├── callback-service.mjs
│   │   ├── message-service.mjs
│   │   └── review-service.mjs
│   ├── adapters/
│   │   ├── gateway-adapter.mjs
│   │   ├── plugin-adapter.mjs
│   │   └── webhook-adapter.mjs
│   ├── stores/
│   │   ├── task-store.mjs
│   │   └── event-store.mjs
│   ├── schemas/
│   │   ├── task-request.mjs
│   │   ├── task-response.mjs
│   │   └── callback-payload.mjs
│   └── utils/
│       ├── trace.mjs
│       ├── redact.mjs
│       └── idempotency.mjs
└── tests/
```

### 6.2 如果暂时不想新增 package

可退一步先落在：

```text
scripts/runtime/commercial_service.mjs
scripts/runtime/commercial_replay.mjs
scripts/runtime/commercial_smoke.mjs
```

但长期看，独立 `packages/service` 更清晰。

### 6.3 服务层技术建议

推荐顺序：

1. `Fastify`
2. `Hono`
3. `node:http` 最小实现

本轮优先级是尽快打通，因此可以先选最轻量、团队最熟的方案。

---

## 7. 对外任务接口设计

### 7.1 最小接口集

#### 创建任务

`POST /tasks`

请求体示例：

```json
{
  "projectId": "pj_0015",
  "taskType": "development_planning",
  "input": {
    "requirement": "最终确认的需求描述",
    "complexity": "medium",
    "estimatedRounds": 3
  },
  "context": {
    "userId": "u_001",
    "projectNo": "PJ-0015"
  },
  "callback": {
    "url": "https://api.example.com/agent/callback/plan",
    "secret": "internal-secret"
  }
}
```

返回示例：

```json
{
  "ok": true,
  "taskId": "task_xxx",
  "status": "accepted",
  "traceId": "trace_xxx"
}
```

#### 查询任务

`GET /tasks/:id`

返回示例：

```json
{
  "ok": true,
  "task": {
    "taskId": "task_xxx",
    "projectId": "pj_0015",
    "taskType": "development_planning",
    "status": "running",
    "summary": "planning in progress",
    "error": null,
    "createdAt": "2026-03-13T10:00:00.000Z",
    "updatedAt": "2026-03-13T10:01:30.000Z"
  }
}
```

#### 继续发送项目消息

`POST /tasks/:id/messages`

```json
{
  "content": "还需要增加优惠券功能",
  "msgType": "text"
}
```

#### 取消任务

`POST /tasks/:id/cancel`

```json
{
  "reason": "manual_cancel"
}
```

#### 查询任务事件

`GET /tasks/:id/events`

用于联调、排障、回放。

### 7.2 可选接口

- `GET /tasks`
- `POST /tasks/:id/retry`
- `POST /tasks/:id/replay`
- `POST /tasks/:id/review`

---

## 8. 内部任务模型设计

### 8.1 Task 核心字段

```json
{
  "taskId": "task_xxx",
  "projectId": "pj_0015",
  "taskType": "development_execution",
  "status": "running",
  "traceId": "trace_xxx",
  "sessionKey": "main",
  "childSessionKey": "child_xxx",
  "runId": "run_xxx",
  "agent": "technical",
  "callbackUrl": "https://api.example.com/agent/callback/progress",
  "callbackSecretRef": "secret://callbacks/project-progress",
  "createdAt": "...",
  "updatedAt": "..."
}
```

### 8.2 Event 核心字段

```json
{
  "eventId": "evt_xxx",
  "taskId": "task_xxx",
  "type": "status_changed",
  "fromStatus": "queued",
  "toStatus": "running",
  "summary": "expert spawned",
  "payload": {},
  "traceId": "trace_xxx",
  "createdAt": "..."
}
```

### 8.3 最小状态集

| 状态 | 说明 |
|------|------|
| `accepted` | 接口已接收 |
| `queued` | 已入执行队列 |
| `running` | 正在执行 |
| `waiting_user` | 等待用户补充信息 |
| `review_required` | 需要人工介入 |
| `completed` | 已完成 |
| `failed` | 执行失败 |
| `canceled` | 已取消 |

---

## 9. 任务类型与 Agent / Workflow 映射

### 9.1 当前建议映射

| 业务任务类型 | 当前建议执行入口 | 说明 |
|--------------|------------------|------|
| `requirement_analysis` | `technical` 或新增 `service-analyst` workflow | 输出结构化分析结果 |
| `development_planning` | `orchestrator + decompose` | 输出计划、任务拆解、资源建议 |
| `development_execution` | `orchestrator` 调度 `technical / vibe-coder / tooling` | 输出阶段进度、提交摘要、完成结论 |
| `interactive_message` | 基于现有 session 续聊 | 用于项目沟通 |

### 9.2 当前阶段建议

为了尽快跑通商用链路，建议：

- 第一版优先复用现有 agent
- 不先引入过多新 agent
- 先把结构化输出与回调闭环做好

### 9.3 不建议的做法

- 一开始就做复杂 swarm
- 一开始就引入大量新角色
- 一开始就把所有商用任务都丢给单一主 agent 自由发挥

---

## 10. 回调与状态同步设计

### 10.1 回调类型

保持与业务后端文档一致：

- `analysis`
- `plan`
- `progress`
- `complete`
- `message`

### 10.2 回调投递原则

- 每个回调都有固定 schema
- 每次投递都带签名
- 每次投递都有 traceId
- 每次失败都落事件日志
- 支持至少一次投递语义

### 10.3 状态同步流程

```text
任务创建
  -> 状态 accepted
  -> 状态 queued
  -> 状态 running
  -> 产生结构化结果
  -> 投递业务回调
  -> 状态 completed / failed / review_required
```

### 10.4 幂等策略

- 业务后端以 `taskId + callbackType + version` 做幂等键
- SAVC 侧重复投递同一回调时，不应造成重复业务更新

---

## 11. 数据记录与最小复盘设计

### 11.1 当前阶段必须记录的数据

- 任务类型
- 输入摘要
- 使用的 agent / workflow
- 关键状态变更时间
- 回调投递结果
- 失败原因
- 人工修正记录

### 11.2 当前阶段不应直接写入长期记忆的数据

- 明文卡密
- 明文支付信息
- 明文邮箱 / 手机号 / 账号密码
- 原始订单明细
- 原始回调密钥

### 11.3 可以进入程序记忆的内容

- 某类项目最稳定的执行步骤
- 某类失败的典型修正方式
- 某类回调字段校验规则
- 人工审核最常见的驳回原因摘要

### 11.4 当前阶段的成熟化原则

本轮只做最小复盘闭环：

```text
任务记录 -> 失败归因 -> 人工修正 -> 程序流程沉淀
```

不要让“训练媛媛”压过“先把业务跑通”。

---

## 12. 测试与上线建议

### 12.1 联调阶段

- 准备固定项目样本
- 固定回调 mock 服务
- 固定输入输出 schema
- 固定 traceId 追踪

### 12.2 测试阶段

- 跑通至少一条完整项目链路
- 模拟回调失败
- 模拟任务超时
- 模拟结构化结果不合法
- 验证人工接管

### 12.3 上线阶段

- 只开放有限任务类型
- 只放白名单业务
- 保留人工审核
- 开启失败告警
- 开启任务审计日志

---

## 13. 分阶段实施建议

### Phase A：服务层起骨架

- 新增商用适配服务
- 提供 `POST /tasks` / `GET /tasks/:id`
- 打通最小状态机

### Phase B：与当前 OpenClaw 能力打通

- 接入 `savc_spawn_expert`
- 接入 `savc_agent_status`
- 接入项目消息续聊能力

### Phase C：回调闭环

- 回调 `analysis`
- 回调 `plan`
- 回调 `progress`
- 回调 `complete`
- 回调 `message`

### Phase D：联调与上线准备

- 完成 smoke test
- 完成假数据回放
- 完成人工兜底
- 完成脱敏与日志审计

### Phase E：上线后再做

- 失败归因聚类
- 工作流固化
- 自动学习与自我反思
- 多节点调度与高级编排

---

*文档版本：v1.0 | 基于当前 SAVC/OpenClaw 仓库的商用适配方案*
