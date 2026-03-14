# ThousandCliffs-AI OpenClaw 商用适配 API 接口文档

> 面向站点业务后端与云上 SAVC / OpenClaw 商用适配服务层的对接文档。
>
> 说明：
> - 本文档定义的是“业务后端 <-> SAVC 商用适配服务层”的 REST / Webhook 契约。
> - 本地 LLM 服务不在本文档范围内。
> - 当前仓库内部的 `savc_*` 插件工具、OpenClaw Session 细节对业务后端不可见。

---

## 目录

1. [通用规范](#1-通用规范)
2. [健康检查接口 /health](#2-健康检查接口-health)
3. [任务接口 /tasks](#3-任务接口-tasks)
4. [任务消息接口 /tasks/:id/messages](#4-任务消息接口-tasksidmessages)
5. [任务事件接口 /tasks/:id/events](#5-任务事件接口-tasksidevents)
6. [取消与重试接口](#6-取消与重试接口)
7. [回调 / Webhook 规范](#7-回调--webhook-规范)
8. [回调事件明细](#8-回调事件明细)
9. [任务状态与类型枚举](#9-任务状态与类型枚举)
10. [错误码表](#10-错误码表)

---

## 1. 通用规范

### 1.1 Base URL

Base URL 由部署决定，以下使用示例域名表达：

```text
开发环境: http://localhost:8788/api
测试环境: https://savc-agent-staging.example.com/api
生产环境: https://savc-agent.example.com/api
```

### 1.2 请求鉴权

所有业务后端调用接口都需要在 Header 中带服务密钥：

```text
X-SAVC-Key: <service_api_key>
```

可选附带：

```text
Idempotency-Key: <unique_key>
X-Trace-Id: <trace_id>
```

说明：

- `X-SAVC-Key`：服务到服务调用密钥
- `Idempotency-Key`：建议在 `POST /tasks` 时使用，避免重复建单
- `X-Trace-Id`：建议由业务后端生成，便于全链路排障

### 1.3 统一响应格式

#### 成功响应

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

#### 错误响应

```json
{
  "code": 40050,
  "message": "invalid taskType",
  "data": null
}
```

### 1.4 通用状态码

| 状态码 | 含义 |
|--------|------|
| 200 | 请求成功 |
| 201 | 创建成功 |
| 400 | 参数错误 |
| 401 | 鉴权失败 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 409 | 幂等冲突 / 状态冲突 |
| 422 | 业务逻辑错误 |
| 429 | 请求过于频繁 |
| 500 | 服务内部错误 |
| 502 | 上游执行异常 |
| 504 | 上游执行超时 |

### 1.5 设计原则

- 业务后端只感知“任务”，不感知 OpenClaw 内部 Session / Tool 细节
- 所有异步执行都通过任务状态与事件时间线体现
- 结构化结果通过 `result` 字段或回调事件返回
- 所有回调都要求幂等消费

### 1.6 V1 最小对接约定

> 第一版联调请优先以本节为准，先完成最小闭环，不要一开始把所有可选能力都做满。

#### V1 必须实现的接口

- `GET /health`
- `POST /tasks`
- `GET /tasks/:id`
- `POST /tasks/:id/messages`

#### V1 强烈建议实现的接口

- `GET /tasks/:id/events`
  - 便于联调、排障、回放

#### V1 可延后接口

- `GET /tasks`
- `POST /tasks/:id/cancel`

#### V1 预留接口

- `POST /tasks/:id/retry`

#### V1 支持的任务类型

- `requirement_analysis`
- `development_planning`
- `development_execution`

#### V1 `POST /tasks` 最小必填字段

```json
{
  "projectId": "pj_0015",
  "taskType": "development_planning",
  "input": {
    "requirement": "最终确认的需求描述"
  }
}
```

#### V1 推荐附带但可后补的字段

- `callback.url`
- `callback.secret`
- `callback.events`
- `context.projectNo`
- `context.userId`

#### V1 暂不要求实现的字段

- `context.userName`
- `context.source`
- `options.wait`
- `options.timeoutMs`
- `options.priority`
- `attachments`
- 复杂筛选分页能力

#### V1 回调最小闭环

如果第一版接入回调，建议至少支持：

- `task.status`
- `message`
- `progress`
- `complete`

`analysis` 和 `plan` 应在对应任务类型接入时同步实现。

---

## 2. 健康检查接口 /health

### 2.1 服务健康检查

`GET /health` `需鉴权`

**成功响应 200：**

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "status": "ok",
    "service": "savc-commercial-adapter",
    "version": "v1",
    "gateway": {
      "ok": true,
      "latencyMs": 28
    },
    "store": {
      "ok": true
    },
    "time": "2026-03-13T15:00:00.000Z"
  }
}
```

---

## 3. 任务接口 /tasks

### 3.1 创建任务

`POST /tasks` `需鉴权`

用于创建商用执行任务。

**请求体：**

```json
{
  "projectId": "pj_0015",
  "taskType": "development_planning",
  "input": {
    "requirement": "最终确认的需求描述",
    "complexity": "medium",
    "estimatedRounds": 3,
    "category": "毕业设计"
  },
  "context": {
    "projectNo": "PJ-0015",
    "userId": "u_001",
    "userName": "张三",
    "source": "web-backend"
  },
  "callback": {
    "url": "https://api.thousandcliffs.com/api/agent/callback/plan",
    "secret": "cb_secret_xxx",
    "events": ["plan", "progress", "complete", "message"]
  },
  "options": {
    "wait": false,
    "timeoutMs": 600000,
    "priority": "normal"
  }
}
```

**字段说明：**

| 字段 | 类型 | 必填 | V1 要求 | 说明 |
|------|------|------|---------|------|
| `projectId` | string | 是 | 必须 | 业务后端项目 ID |
| `taskType` | string | 是 | 必须 | 任务类型，见 9.1 |
| `input` | object | 是 | 必须 | 任务输入 |
| `input.requirement` | string | 是 | 必须 | 第一版最小输入，三类任务都建议提供 |
| `context` | object | 否 | 可后补 | 额外上下文 |
| `callback.url` | string | 否 | 推荐 | 回调地址；若不提供，则业务后端需轮询 `GET /tasks/:id` |
| `callback.secret` | string | 否 | 推荐 | 回调签名密钥 |
| `callback.events` | string[] | 否 | 可后补 | 需要接收的事件列表 |
| `options.wait` | boolean | 否 | 预留 | 是否等待直到首个稳定结果 |
| `options.timeoutMs` | number | 否 | 预留 | 超时时间，默认 600000 |
| `options.priority` | string | 否 | 预留 | `low` / `normal` / `high` |

**V1 最小请求体示例：**

```json
{
  "projectId": "pj_0015",
  "taskType": "development_planning",
  "input": {
    "requirement": "最终确认的需求描述"
  }
}
```

**成功响应 201：**

```json
{
  "code": 0,
  "message": "task accepted",
  "data": {
    "taskId": "task_20260313_0001",
    "projectId": "pj_0015",
    "taskType": "development_planning",
    "status": "accepted",
    "traceId": "trace_8f31d6f1",
    "createdAt": "2026-03-13T15:00:00.000Z"
  }
}
```

**可选同步等待响应 200：**

当 `options.wait=true` 且任务在超时前产生稳定结果时，可直接返回：

```json
{
  "code": 0,
  "message": "task completed",
  "data": {
    "taskId": "task_20260313_0001",
    "status": "completed",
    "traceId": "trace_8f31d6f1",
    "result": {
      "overview": "本项目将分 3 个阶段完成",
      "tasks": [
        {
          "name": "数据库与后端架构",
          "round": 1,
          "estimatedTime": "1天"
        }
      ]
    }
  }
}
```

**错误响应：**

| code | message |
|------|---------|
| 40050 | invalid taskType |
| 40051 | missing projectId |
| 40052 | invalid callback config |
| 40150 | invalid service key |
| 40950 | duplicated idempotency key |
| 42250 | unsupported task input |
| 50050 | task create failed |

---

### 3.2 查询任务列表

`GET /tasks` `需鉴权`

> 此接口用于运维与批量检索，第一版联调可延后。

用于按项目、状态、任务类型筛选任务。

**查询参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `projectId` | string | - | 按项目筛选 |
| `taskType` | string | - | 按任务类型筛选 |
| `status` | string | - | 按任务状态筛选 |
| `page` | int | 1 | 页码 |
| `pageSize` | int | 20 | 每页数量 |

**成功响应 200：**

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [
      {
        "taskId": "task_20260313_0001",
        "projectId": "pj_0015",
        "taskType": "development_planning",
        "status": "running",
        "traceId": "trace_8f31d6f1",
        "summary": "planning in progress",
        "createdAt": "2026-03-13T15:00:00.000Z",
        "updatedAt": "2026-03-13T15:03:20.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

---

### 3.3 查询任务详情

`GET /tasks/:id` `需鉴权`

**V1 最小必返字段：**

- `taskId`
- `projectId`
- `taskType`
- `status`
- `traceId`
- `result`
- `error`
- `createdAt`
- `updatedAt`

**成功响应 200：**

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "taskId": "task_20260313_0001",
    "projectId": "pj_0015",
    "taskType": "development_planning",
    "status": "running",
    "traceId": "trace_8f31d6f1",
    "agent": "orchestrator",
    "sessionKey": "main",
    "childSessionKey": "child_abc123",
    "summary": "planning in progress",
    "result": null,
    "error": null,
    "callback": {
      "url": "https://api.thousandcliffs.com/api/agent/callback/plan",
      "events": ["plan", "progress", "complete", "message"]
    },
    "createdAt": "2026-03-13T15:00:00.000Z",
    "updatedAt": "2026-03-13T15:03:20.000Z",
    "lastEventAt": "2026-03-13T15:03:18.000Z"
  }
}
```

**错误响应：**

| code | message |
|------|---------|
| 40450 | task not found |

---

## 4. 任务消息接口 /tasks/:id/messages

### 4.1 继续发送项目沟通消息

`POST /tasks/:id/messages` `需鉴权`

用于在需求沟通阶段继续给任务关联的 Agent 会话发消息。

**请求体：**

```json
{
  "content": "还需要增加优惠券功能和微信支付",
  "msgType": "text",
  "attachments": []
}
```

**字段说明：**

| 字段 | 类型 | 必填 | V1 要求 | 说明 |
|------|------|------|---------|------|
| `content` | string | 是 | 必须 | 消息内容 |
| `msgType` | string | 否 | 可省略 | 默认 `text` |
| `attachments` | array | 否 | 预留 | 附件数组，第一版可不实现 |

**成功响应 201：**

```json
{
  "code": 0,
  "message": "message accepted",
  "data": {
    "taskId": "task_20260313_0001",
    "messageId": "msg_001",
    "status": "accepted",
    "createdAt": "2026-03-13T15:05:00.000Z"
  }
}
```

**错误响应：**

| code | message |
|------|---------|
| 40450 | task not found |
| 40951 | task not messageable |
| 42251 | empty message content |
| 50051 | message dispatch failed |

---

## 5. 任务事件接口 /tasks/:id/events

### 5.1 查询任务事件时间线

`GET /tasks/:id/events` `需鉴权`

> 第一版强烈建议实现，但若服务端已具备其他可查询日志手段，可暂时不作为阻塞项。

**查询参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `page` | int | 1 | 页码 |
| `pageSize` | int | 50 | 每页数量 |

**成功响应 200：**

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [
      {
        "eventId": "evt_001",
        "type": "task.accepted",
        "status": "accepted",
        "summary": "task accepted",
        "payload": {},
        "createdAt": "2026-03-13T15:00:00.000Z"
      },
      {
        "eventId": "evt_002",
        "type": "task.running",
        "status": "running",
        "summary": "planning workflow started",
        "payload": {
          "agent": "orchestrator"
        },
        "createdAt": "2026-03-13T15:00:02.000Z"
      }
    ],
    "total": 2,
    "page": 1,
    "pageSize": 50,
    "totalPages": 1
  }
}
```

---

## 6. 取消与重试接口

### 6.1 取消任务

`POST /tasks/:id/cancel` `需鉴权`

> 第一版可延后；若暂不支持，建议返回 `501 not implemented` 而不是静默忽略。

**请求体：**

```json
{
  "reason": "manual_cancel"
}
```

**成功响应 200：**

```json
{
  "code": 0,
  "message": "task canceled",
  "data": {
    "taskId": "task_20260313_0001",
    "status": "canceled"
  }
}
```

### 6.2 重试任务

`POST /tasks/:id/retry` `需鉴权`

> 当前作为预留接口。若第一版不实现，可返回 `501 not implemented`。

**请求体：**

```json
{
  "reason": "retry_after_fix"
}
```

**成功响应 200：**

```json
{
  "code": 0,
  "message": "task retried",
  "data": {
    "taskId": "task_20260313_0001",
    "retryTaskId": "task_20260313_0002",
    "status": "accepted"
  }
}
```

---

## 7. 回调 / Webhook 规范

### 7.1 回调触发方式

当创建任务时传入 `callback.url` 后，SAVC 商用适配服务会在任务执行过程中按事件类型向业务后端投递回调。

### 7.2 回调请求头

```text
Content-Type: application/json
X-SAVC-Event: <event_name>
X-SAVC-Delivery-Id: <delivery_id>
X-SAVC-Timestamp: <unix_ms>
X-SAVC-Signature: <hmac_sha256>
X-Trace-Id: <trace_id>
```

### 7.3 签名算法

```text
signature = hex(hmac_sha256(callback.secret, timestamp + "." + raw_body))
```

### 7.4 回调通用结构

```json
{
  "deliveryId": "dlv_001",
  "event": "plan",
  "taskId": "task_20260313_0001",
  "projectId": "pj_0015",
  "taskType": "development_planning",
  "traceId": "trace_8f31d6f1",
  "sentAt": "2026-03-13T15:06:00.000Z",
  "payload": {}
}
```

### 7.5 回调接收方响应要求

业务后端在成功接收后应返回：

```json
{
  "success": true
}
```

说明：

- 返回 `2xx` 视为投递成功
- 非 `2xx` 或超时视为失败，SAVC 服务应重试
- 接收方必须以 `deliveryId` 做幂等

---

## 8. 回调事件明细

### 8.1 `analysis`

用于需求分析完成。

**Header：**

```text
X-SAVC-Event: analysis
```

**回调体：**

```json
{
  "deliveryId": "dlv_001",
  "event": "analysis",
  "taskId": "task_20260313_0001",
  "projectId": "pj_0015",
  "taskType": "requirement_analysis",
  "traceId": "trace_8f31d6f1",
  "sentAt": "2026-03-13T15:06:00.000Z",
  "payload": {
    "category": "毕业设计",
    "summary": "基于 Spring Boot + Vue3 的在线商城系统",
    "complexity": "medium",
    "estimatedRounds": 3,
    "keyPoints": ["Spring Boot 后端", "Vue3 前端", "MySQL"],
    "suggestedAgent": "technical"
  }
}
```

**V1 最小 payload 字段：**

- `category`
- `summary`
- `complexity`
- `estimatedRounds`

### 8.2 `plan`

用于开发计划完成。

**回调体：**

```json
{
  "deliveryId": "dlv_002",
  "event": "plan",
  "taskId": "task_20260313_0002",
  "projectId": "pj_0015",
  "taskType": "development_planning",
  "traceId": "trace_8f31d6f1",
  "sentAt": "2026-03-13T15:08:00.000Z",
  "payload": {
    "overview": "本项目分 3 个阶段完成",
    "tasks": [
      {
        "name": "数据库与后端架构",
        "description": "设计数据库与搭建后端骨架",
        "round": 1,
        "estimatedTime": "1天"
      }
    ],
    "timeline": "预计 3 个工作日",
    "resources": ["Spring Boot 3.x", "Vue 3", "MySQL 8"]
  }
}
```

**V1 最小 payload 字段：**

- `overview`
- `tasks`

### 8.3 `progress`

用于开发进度更新。

**回调体：**

```json
{
  "deliveryId": "dlv_003",
  "event": "progress",
  "taskId": "task_20260313_0003",
  "projectId": "pj_0015",
  "taskType": "development_execution",
  "traceId": "trace_8f31d6f1",
  "sentAt": "2026-03-13T15:10:00.000Z",
  "payload": {
    "round": 2,
    "step": "商品模块开发",
    "status": "done",
    "detail": "商品 CRUD、分类管理、搜索功能已完成",
    "overallProgress": 65,
    "gitCommit": "a1b2c3d4e5f6"
  }
}
```

**V1 最小 payload 字段：**

- `round`
- `step`
- `status`
- `detail`

### 8.4 `complete`

用于开发任务完成。

**回调体：**

```json
{
  "deliveryId": "dlv_004",
  "event": "complete",
  "taskId": "task_20260313_0003",
  "projectId": "pj_0015",
  "taskType": "development_execution",
  "traceId": "trace_8f31d6f1",
  "sentAt": "2026-03-13T15:20:00.000Z",
  "payload": {
    "gitRepoUrl": "https://github.com/tc-projects/pj-0015",
    "gitBranch": "main",
    "summary": "3 轮开发全部完成，共 45 次提交",
    "testResults": {
      "passed": 128,
      "failed": 0,
      "coverage": "82%"
    }
  }
}
```

**V1 最小 payload 字段：**

- `summary`

### 8.5 `message`

用于需求沟通或任务说明消息。

**回调体：**

```json
{
  "deliveryId": "dlv_005",
  "event": "message",
  "taskId": "task_20260313_0003",
  "projectId": "pj_0015",
  "taskType": "development_execution",
  "traceId": "trace_8f31d6f1",
  "sentAt": "2026-03-13T15:12:00.000Z",
  "payload": {
    "content": "数据库设计已完成，共创建 12 张表。",
    "msgType": "text"
  }
}
```

**V1 最小 payload 字段：**

- `content`
- `msgType`

### 8.6 `task.status`

用于通知任务状态变更。

**回调体：**

```json
{
  "deliveryId": "dlv_006",
  "event": "task.status",
  "taskId": "task_20260313_0003",
  "projectId": "pj_0015",
  "taskType": "development_execution",
  "traceId": "trace_8f31d6f1",
  "sentAt": "2026-03-13T15:03:20.000Z",
  "payload": {
    "fromStatus": "queued",
    "toStatus": "running",
    "summary": "workflow started"
  }
}
```

**V1 最小 payload 字段：**

- `fromStatus`
- `toStatus`

---

## 9. 任务状态与类型枚举

### 9.1 `taskType`

| 值 | 说明 |
|----|------|
| `requirement_analysis` | 需求分析 |
| `development_planning` | 开发计划生成 |
| `development_execution` | 开发执行 |

### 9.2 `status`

| 值 | 说明 |
|----|------|
| `accepted` | 已接收 |
| `queued` | 已入队 |
| `running` | 执行中 |
| `waiting_user` | 等待用户补充 |
| `review_required` | 需要人工介入 |
| `completed` | 已完成 |
| `failed` | 已失败 |
| `canceled` | 已取消 |

### 9.3 `priority`

| 值 | 说明 |
|----|------|
| `low` | 低优先级 |
| `normal` | 普通优先级 |
| `high` | 高优先级 |

---

## 10. 错误码表

### 10.1 请求错误 (4005x)

| code | HTTP | message |
|------|------|---------|
| 40050 | 400 | invalid taskType |
| 40051 | 400 | missing projectId |
| 40052 | 400 | invalid callback config |
| 40053 | 400 | invalid task input |
| 40054 | 400 | invalid status transition |

### 10.2 鉴权错误 (4015x)

| code | HTTP | message |
|------|------|---------|
| 40150 | 401 | invalid service key |
| 40151 | 401 | missing service key |
| 40152 | 401 | invalid callback signature |

### 10.3 资源错误 (4045x)

| code | HTTP | message |
|------|------|---------|
| 40450 | 404 | task not found |
| 40451 | 404 | event stream not found |

### 10.4 冲突错误 (4095x)

| code | HTTP | message |
|------|------|---------|
| 40950 | 409 | duplicated idempotency key |
| 40951 | 409 | task not messageable |
| 40952 | 409 | task already terminal |

### 10.5 业务错误 (4225x)

| code | HTTP | message |
|------|------|---------|
| 42250 | 422 | unsupported task input |
| 42251 | 422 | empty message content |
| 42252 | 422 | callback event not enabled |
| 42253 | 422 | task not cancelable |

### 10.6 服务错误 (5005x)

| code | HTTP | message |
|------|------|---------|
| 50050 | 500 | task create failed |
| 50051 | 500 | message dispatch failed |
| 50052 | 500 | callback dispatch failed |
| 50053 | 500 | task store failed |

### 10.7 上游错误 (5025x / 5045x)

| code | HTTP | message |
|------|------|---------|
| 50250 | 502 | upstream gateway failed |
| 50251 | 502 | upstream workflow invalid output |
| 50450 | 504 | upstream execution timeout |

---

*文档版本：v1.0 | 面向商用项目后端协作者的 OpenClaw 任务接口契约*
