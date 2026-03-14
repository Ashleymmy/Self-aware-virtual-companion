# ThousandCliffs-AI API 接口文档

> 前后端对接的完整 RESTful API + WebSocket 接口规范
>
> 2026-03 对接约定更新：后端实现目标已固定为 `uv + Python 3.12 + FastAPI`。本文档定义的是 HTTP / WebSocket 契约，独立于具体 ORM、任务队列或部署方式。

---

## 目录

1. [通用规范](#1-通用规范)
2. [认证接口 /auth](#2-认证接口-auth)
3. [用户接口 /users](#3-用户接口-users)
4. [商品接口 /products](#4-商品接口-products)
5. [订单接口 /orders](#5-订单接口-orders)
6. [支付接口 /payments](#6-支付接口-payments)
7. [卡密接口 /keys](#7-卡密接口-keys)
8. [工单接口 /tickets](#8-工单接口-tickets)
9. [技术服务项目接口 /projects](#9-技术服务项目接口-projects)
10. [AI 客服接口 /chat](#10-ai-客服接口-chat)
11. [通知接口 /notifications](#11-通知接口-notifications)
12. [管理后台接口 /admin](#12-管理后台接口-admin)
13. [闲鱼回调接口 /xianyu](#13-闲鱼回调接口-xianyu)
14. [Agent 回调接口 /agent](#14-agent-回调接口-agent)
15. [WebSocket 接口 /ws](#15-websocket-接口-ws)
16. [错误码表](#16-错误码表)

---

## 1. 通用规范

### 1.1 Base URL

```
开发环境: http://localhost:8000/api
生产环境: https://api.thousandcliffs.com/api
```

### 1.2 认证方式

除标注 `公开` 的接口外，所有接口需要在 Header 中携带 JWT Token：

```
Authorization: Bearer <access_token>
```

### 1.3 统一响应格式

#### 成功响应

```json
{
  "code": 0,
  "message": "success",
  "data": { ... }
}
```

#### 分页响应

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [ ... ],
    "total": 100,
    "page": 1,
    "pageSize": 20,
    "totalPages": 5
  }
}
```

#### 错误响应

```json
{
  "code": 40001,
  "message": "提取码无效或已过期",
  "data": null
}
```

### 1.4 通用请求参数

#### 分页参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `page` | int | 1 | 页码（从1开始） |
| `pageSize` | int | 20 | 每页数量（最大100） |

#### 排序参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `sortBy` | string | `createdAt` | 排序字段 |
| `sortOrder` | string | `desc` | `asc` 或 `desc` |

### 1.5 通用 HTTP 状态码

| 状态码 | 含义 |
|--------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 401 | 未认证 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 409 | 冲突（如邮箱已注册） |
| 422 | 业务逻辑错误 |
| 429 | 请求过于频繁 |
| 500 | 服务器内部错误 |

---

## 2. 认证接口 /auth

### 2.1 用户注册

`POST /auth/register` `公开`

**请求体：**

```json
{
  "name": "张三",
  "email": "zhangsan@example.com",
  "password": "MyPassword123",
  "phone": "13800138000",       // 可选
  "referralCode": "NX-ABCD"    // 可选，推荐码
}
```

**校验规则：**

| 字段 | 规则 |
|------|------|
| name | 必填，2-30字符 |
| email | 必填，有效邮箱格式，唯一 |
| password | 必填，8-50字符，至少包含字母和数字 |
| phone | 可选，11位手机号 |

**成功响应 201：**

```json
{
  "code": 0,
  "message": "注册成功",
  "data": {
    "user": {
      "id": "clx1a2b3c4d5e6f7",
      "name": "张三",
      "email": "zhangsan@example.com",
      "role": "USER",
      "referralCode": "NX-X7K9",
      "createdAt": "2026-03-12T08:00:00.000Z"
    },
    "token": "eyJhbGciOiJSUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJSUzI1NiIs..."
  }
}
```

**错误响应：**

| code | message |
|------|---------|
| 40901 | 该邮箱已被注册 |
| 40001 | 请填写完整的注册信息 |
| 40002 | 密码强度不足 |

---

### 2.2 用户登录

`POST /auth/login` `公开`

**请求体：**

```json
{
  "email": "zhangsan@example.com",
  "password": "MyPassword123"
}
```

**成功响应 200：**

```json
{
  "code": 0,
  "message": "登录成功",
  "data": {
    "user": {
      "id": "clx1a2b3c4d5e6f7",
      "name": "张三",
      "email": "zhangsan@example.com",
      "role": "VIP",
      "avatar": null,
      "referralCode": "NX-X7K9",
      "balance": "320.00",
      "createdAt": "2026-03-12T08:00:00.000Z",
      "lastLoginAt": "2026-03-12T10:00:00.000Z"
    },
    "token": "eyJhbGciOiJSUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJSUzI1NiIs..."
  }
}
```

**错误响应：**

| code | message |
|------|---------|
| 40101 | 邮箱或密码错误 |
| 40102 | 账号已被禁用 |
| 42901 | 登录尝试次数过多，请稍后再试 |

---

### 2.3 刷新 Token

`POST /auth/refresh` `公开`

**请求体：**

```json
{
  "refreshToken": "eyJhbGciOiJSUzI1NiIs..."
}
```

**成功响应 200：**

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "token": "eyJhbGciOiJSUzI1NiIs...(new)",
    "refreshToken": "eyJhbGciOiJSUzI1NiIs...(new)"
  }
}
```

**错误响应：**

| code | message |
|------|---------|
| 40103 | Refresh Token 无效或已过期 |

---

### 2.4 获取当前用户信息

`GET /auth/me` `需认证`

**成功响应 200：**

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "user": {
      "id": "clx1a2b3c4d5e6f7",
      "name": "张三",
      "email": "zhangsan@example.com",
      "phone": "138****8000",
      "role": "VIP",
      "avatar": null,
      "isVerified": true,
      "referralCode": "NX-X7K9",
      "balance": "320.00",
      "totalSpent": "2840.00",
      "createdAt": "2026-03-12T08:00:00.000Z",
      "lastLoginAt": "2026-03-12T10:00:00.000Z"
    }
  }
}
```

---

### 2.5 退出登录

`POST /auth/logout` `需认证`

使当前 Refresh Token 失效。

**成功响应 200：**

```json
{
  "code": 0,
  "message": "已退出登录",
  "data": null
}
```

---

### 2.6 发送邮箱验证码

`POST /auth/email-code` `公开`

**请求体：**

```json
{
  "email": "zhangsan@example.com",
  "purpose": "reset_password"    // reset_password | verify_email
}
```

**成功响应 200：**

```json
{
  "code": 0,
  "message": "验证码已发送至邮箱",
  "data": null
}
```

---

### 2.7 重置密码

`POST /auth/reset-password` `公开`

**请求体：**

```json
{
  "email": "zhangsan@example.com",
  "code": "123456",
  "newPassword": "NewPassword456"
}
```

---

### 2.8 修改密码

`POST /auth/change-password` `需认证`

**请求体：**

```json
{
  "oldPassword": "MyPassword123",
  "newPassword": "NewPassword456"
}
```

---

## 3. 用户接口 /users

### 3.1 获取用户资料

`GET /users/profile` `需认证`

**成功响应 200：**

```json
{
  "code": 0,
  "data": {
    "id": "clx1a2b3c4d5e6f7",
    "name": "张三",
    "email": "zhangsan@example.com",
    "phone": "138****8000",
    "role": "VIP",
    "avatar": "https://storage.example.com/avatars/xxx.jpg",
    "isVerified": true,
    "referralCode": "NX-X7K9",
    "balance": "320.00",
    "totalSpent": "2840.00",
    "stats": {
      "monthlyOrders": 7,
      "monthlySpent": "684.00",
      "extractedKeys": 12,
      "ticketCount": 3,
      "satisfaction": 4.9
    },
    "referral": {
      "code": "NX-X7K9",
      "referredCount": 8,
      "totalCommission": "128.00"
    },
    "security": {
      "hasPassword": true,
      "twoFactorEnabled": false,
      "phoneLinked": true,
      "emailVerified": true,
      "lastLoginAt": "2026-03-12T10:00:00.000Z"
    },
    "createdAt": "2026-01-15T08:00:00.000Z"
  }
}
```

---

### 3.2 更新用户资料

`PUT /users/profile` `需认证`

**请求体：**

```json
{
  "name": "张三丰",
  "phone": "13900139000"
}
```

---

### 3.3 上传头像

`POST /users/avatar` `需认证`

**请求体：** `multipart/form-data`

| 字段 | 类型 | 说明 |
|------|------|------|
| avatar | file | 图片文件，最大 2MB，支持 jpg/png/webp |

**成功响应 200：**

```json
{
  "code": 0,
  "data": {
    "avatar": "https://storage.example.com/avatars/clx1a2b3c4d5e6f7.webp"
  }
}
```

---

### 3.4 获取推荐信息

`GET /users/referral` `需认证`

**成功响应 200：**

```json
{
  "code": 0,
  "data": {
    "code": "NX-X7K9",
    "link": "https://thousandcliffs.com/?ref=NX-X7K9",
    "referredCount": 8,
    "totalCommission": "128.00",
    "referredUsers": [
      { "name": "李**", "joinedAt": "2026-02-20", "commission": "16.00" }
    ]
  }
}
```

---

## 4. 商品接口 /products

### 4.1 获取商品列表

`GET /products` `公开`

**查询参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| category | string | - | 分类筛选：`AI_TOOL` `ACCOUNT` `CUSTOM` `SERVICE` |
| type | string | - | 类型筛选：`RESOURCE` `SERVICE` |
| keyword | string | - | 关键词搜索（名称+描述） |
| page | int | 1 | 页码 |
| pageSize | int | 20 | 每页数量 |

**成功响应 200：**

```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": "p1",
        "name": "Claude Pro 会员",
        "category": "AI_TOOL",
        "type": "RESOURCE",
        "price": "128.00",
        "originalPrice": "198.00",
        "stock": 47,
        "badge": "热销",
        "badgeColor": "#ff6b35",
        "description": "正版Claude Pro订阅，30天有效，支持无限次对话",
        "features": ["无限对话次数", "优先响应速度", "最新模型访问", "专属客服支持"],
        "icon": "🤖",
        "isActive": true
      }
    ],
    "total": 6,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

---

### 4.2 获取商品详情

`GET /products/:id` `公开`

**成功响应 200：**

```json
{
  "code": 0,
  "data": {
    "id": "p1",
    "name": "Claude Pro 会员",
    "category": "AI_TOOL",
    "type": "RESOURCE",
    "price": "128.00",
    "originalPrice": "198.00",
    "stock": 47,
    "badge": "热销",
    "badgeColor": "#ff6b35",
    "description": "正版Claude Pro订阅，30天有效，支持无限次对话",
    "features": ["无限对话次数", "优先响应速度", "最新模型访问", "专属客服支持"],
    "icon": "🤖",
    "isActive": true,
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
}
```

---

### 4.3 获取商品分类

`GET /products/categories` `公开`

**成功响应 200：**

```json
{
  "code": 0,
  "data": [
    { "value": "AI_TOOL", "label": "AI工具", "count": 2 },
    { "value": "ACCOUNT", "label": "账号资源", "count": 2 },
    { "value": "CUSTOM", "label": "定制方案", "count": 1 },
    { "value": "SERVICE", "label": "企业服务", "count": 1 }
  ]
}
```

---

## 5. 订单接口 /orders

### 5.1 创建订单

`POST /orders` `需认证`

**请求体：**

```json
{
  "items": [
    { "productId": "p1", "quantity": 1 },
    { "productId": "p4", "quantity": 2 }
  ],
  "contactName": "张三",
  "contactEmail": "zhangsan@example.com",
  "contactPhone": "13800138000",
  "remark": "请尽快发货",
  "promoCode": "NX88"
}
```

**成功响应 201：**

```json
{
  "code": 0,
  "message": "订单创建成功",
  "data": {
    "id": "clx...",
    "orderNo": "NX-20260312-00001",
    "type": "RESOURCE",
    "status": "PENDING",
    "items": [
      {
        "productId": "p1",
        "name": "Claude Pro 会员",
        "price": "128.00",
        "quantity": 1,
        "icon": "🤖"
      },
      {
        "productId": "p4",
        "name": "Midjourney 订阅",
        "price": "68.00",
        "quantity": 2,
        "icon": "🎨"
      }
    ],
    "totalAmount": "264.00",
    "discountAmount": "10.00",
    "paidAmount": "0.00",
    "contactName": "张三",
    "contactEmail": "zhangsan@example.com",
    "promoCode": "NX88",
    "expireAt": "2026-03-12T08:15:00.000Z",
    "createdAt": "2026-03-12T08:00:00.000Z"
  }
}
```

**错误响应：**

| code | message |
|------|---------|
| 40010 | 商品库存不足 |
| 40011 | 优惠码无效或已过期 |
| 40012 | 请填写收件信息 |

---

### 5.2 获取订单列表

`GET /orders` `需认证`

**查询参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| status | string | 状态筛选：`PENDING` `PAID` `COMPLETED` 等 |
| type | string | 类型：`RESOURCE` `SERVICE` |
| page | int | 页码 |
| pageSize | int | 每页数量 |

**成功响应 200：**

```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": "clx...",
        "orderNo": "NX-20260312-00001",
        "type": "RESOURCE",
        "status": "COMPLETED",
        "items": [
          { "name": "Claude Pro 会员", "price": "128.00", "quantity": 1, "icon": "🤖" }
        ],
        "totalAmount": "128.00",
        "paidAmount": "118.00",
        "paidAt": "2026-03-12T08:02:00.000Z",
        "createdAt": "2026-03-12T08:00:00.000Z"
      }
    ],
    "total": 15,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

---

### 5.3 获取订单详情

`GET /orders/:id` `需认证`

**成功响应 200：**

```json
{
  "code": 0,
  "data": {
    "id": "clx...",
    "orderNo": "NX-20260312-00001",
    "type": "RESOURCE",
    "status": "COMPLETED",
    "items": [ ... ],
    "totalAmount": "128.00",
    "discountAmount": "10.00",
    "paidAmount": "118.00",
    "payMethod": "ALIPAY",
    "contactName": "张三",
    "contactEmail": "zhangsan@example.com",
    "remark": "",
    "promoCode": "NX88",
    "paidAt": "2026-03-12T08:02:00.000Z",
    "createdAt": "2026-03-12T08:00:00.000Z",
    "keyRecords": [
      {
        "id": "clx...",
        "productName": "Claude Pro 会员",
        "extractCode": "TC-A7K9-B3M2",
        "status": "已提取",
        "extractedAt": "2026-03-12T08:05:00.000Z"
      }
    ],
    "project": null
  }
}
```

---

### 5.4 取消订单

`POST /orders/:id/cancel` `需认证`

仅 `PENDING` 状态的订单可取消。

**成功响应 200：**

```json
{
  "code": 0,
  "message": "订单已取消",
  "data": { "id": "clx...", "status": "CANCELLED" }
}
```

**错误响应：**

| code | message |
|------|---------|
| 42201 | 当前订单状态不可取消 |

---

### 5.5 确认收货

`POST /orders/:id/confirm` `需认证`

**成功响应 200：**

```json
{
  "code": 0,
  "message": "已确认收货",
  "data": { "id": "clx...", "status": "COMPLETED" }
}
```

---

### 5.6 验证优惠码

`POST /orders/promo/validate` `需认证`

**请求体：**

```json
{
  "code": "NX88",
  "amount": 264.00
}
```

**成功响应 200：**

```json
{
  "code": 0,
  "data": {
    "valid": true,
    "discountType": "fixed",
    "discountValue": "10.00",
    "finalDiscount": "10.00"
  }
}
```

---

## 6. 支付接口 /payments

### 6.1 创建支付

`POST /payments/create` `需认证`

**请求体：**

```json
{
  "orderId": "clx...",
  "method": "ALIPAY"
}
```

**成功响应 200：**

```json
{
  "code": 0,
  "data": {
    "paymentId": "clx...",
    "method": "ALIPAY",
    "amount": "118.00",
    "payUrl": "https://openapi.alipay.com/gateway.do?...",
    "qrCode": "https://qr.alipay.com/xxx",
    "expireAt": "2026-03-12T08:15:00.000Z"
  }
}
```

---

### 6.2 查询支付状态

`GET /payments/:orderId/status` `需认证`

**成功响应 200：**

```json
{
  "code": 0,
  "data": {
    "orderId": "clx...",
    "status": "PAID",
    "method": "ALIPAY",
    "amount": "118.00",
    "paidAt": "2026-03-12T08:02:00.000Z"
  }
}
```

status 可能值：`PENDING` | `PAID` | `FAILED` | `EXPIRED`

---

### 6.3 支付回调（第三方调用）

`POST /payments/callback/alipay` `公开`（签名校验）

`POST /payments/callback/wechat` `公开`（签名校验）

后端验证签名 → 更新订单状态 → 触发发货流程 → 返回 `success`

---

## 7. 卡密接口 /keys

### 7.1 通过提取码提取卡密

`POST /keys/extract` `公开`

这是最核心的接口，闲鱼用户无需登录即可使用。

**请求体：**

```json
{
  "code": "TC-A7K9-B3M2",
  "email": "buyer@example.com"
}
```

**成功响应 200：**

```json
{
  "code": 0,
  "message": "提取成功",
  "data": {
    "orderId": "NX-20260312-00001",
    "productName": "Claude Pro 会员",
    "key": "CLAUDE-PRO-A1B2C3D4",
    "status": "已提取",
    "extractedAt": "2026-03-12T08:05:00.000Z",
    "expiresAt": "2026-04-12T08:05:00.000Z"
  }
}
```

**错误响应：**

| code | message |
|------|---------|
| 40401 | 提取码无效 |
| 42202 | 该提取码已被使用 |
| 42203 | 提取码已过期 |
| 42204 | 卡密库存不足，请联系客服 |

---

### 7.2 通过订单号提取

`POST /keys/extract-by-order` `需认证`

**请求体：**

```json
{
  "orderNo": "NX-20260312-00001",
  "email": "zhangsan@example.com"
}
```

**成功响应 200：** 同 7.1

---

### 7.3 获取我的卡密记录

`GET /keys/mine` `需认证`

**查询参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| page | int | 页码 |
| pageSize | int | 每页数量 |

**成功响应 200：**

```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": "clx...",
        "orderId": "NX-20260312-00001",
        "productName": "Claude Pro 会员",
        "extractCode": "TC-A7K9-B3M2",
        "key": "CLAUDE-PRO-A1B2C3D4",
        "status": "已提取",
        "extractedAt": "2026-03-12T08:05:00.000Z"
      }
    ],
    "total": 12,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

---

## 8. 工单接口 /tickets

### 8.1 创建工单

`POST /tickets` `需认证`

**请求体：**

```json
{
  "type": "TECH",
  "subject": "Claude Pro 账号无法登录",
  "description": "购买的 Claude Pro 账号提示密码错误，已尝试重置但失败。",
  "orderId": "NX-20260312-00001"
}
```

type 枚举值：`ACCOUNT` | `KEY` | `REFUND` | `TECH` | `CUSTOM` | `OTHER`

**成功响应 201：**

```json
{
  "code": 0,
  "message": "工单已提交",
  "data": {
    "id": "clx...",
    "ticketNo": "TK-0042",
    "type": "TECH",
    "subject": "Claude Pro 账号无法登录",
    "status": "OPEN",
    "createdAt": "2026-03-12T08:00:00.000Z"
  }
}
```

---

### 8.2 获取工单列表

`GET /tickets` `需认证`

**查询参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| status | string | 筛选：`OPEN` `PROCESSING` `REPLIED` `CLOSED` |
| page | int | 页码 |
| pageSize | int | 每页数量 |

**成功响应 200：**

```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": "clx...",
        "ticketNo": "TK-0042",
        "type": "TECH",
        "subject": "Claude Pro 账号无法登录",
        "status": "REPLIED",
        "priority": 0,
        "lastMessage": "您好，已为您重置账号密码...",
        "createdAt": "2026-03-12T08:00:00.000Z",
        "updatedAt": "2026-03-12T09:30:00.000Z"
      }
    ],
    "total": 3,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

---

### 8.3 获取工单详情

`GET /tickets/:id` `需认证`

**成功响应 200：**

```json
{
  "code": 0,
  "data": {
    "id": "clx...",
    "ticketNo": "TK-0042",
    "type": "TECH",
    "subject": "Claude Pro 账号无法登录",
    "description": "购买的 Claude Pro 账号提示密码错误...",
    "status": "REPLIED",
    "priority": 0,
    "orderId": "NX-20260312-00001",
    "assignee": "admin",
    "createdAt": "2026-03-12T08:00:00.000Z",
    "updatedAt": "2026-03-12T09:30:00.000Z"
  }
}
```

---

### 8.4 获取工单消息

`GET /tickets/:id/messages` `需认证`

**查询参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| page | int | 页码 |
| pageSize | int | 每页数量（默认50） |

**成功响应 200：**

```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": "clx...",
        "sender": "clx1a2b3c4d5e6f7",
        "senderName": "张三",
        "senderRole": "user",
        "content": "购买的 Claude Pro 账号提示密码错误",
        "attachments": null,
        "createdAt": "2026-03-12T08:00:00.000Z"
      },
      {
        "id": "clx...",
        "sender": "system",
        "senderName": "客服",
        "senderRole": "admin",
        "content": "您好，已为您重置账号密码，新密码已发送到您的邮箱。",
        "attachments": null,
        "createdAt": "2026-03-12T09:30:00.000Z"
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

### 8.5 发送工单消息

`POST /tickets/:id/messages` `需认证`

**请求体：**

```json
{
  "content": "收到，已经可以正常登录了，谢谢！"
}
```

**成功响应 201：**

```json
{
  "code": 0,
  "data": {
    "id": "clx...",
    "sender": "clx1a2b3c4d5e6f7",
    "senderName": "张三",
    "senderRole": "user",
    "content": "收到，已经可以正常登录了，谢谢！",
    "createdAt": "2026-03-12T10:00:00.000Z"
  }
}
```

---

### 8.6 上传工单附件

`POST /tickets/:id/attachments` `需认证`

**请求体：** `multipart/form-data`

| 字段 | 类型 | 说明 |
|------|------|------|
| file | file | 附件文件，最大 10MB |

**成功响应 200：**

```json
{
  "code": 0,
  "data": {
    "name": "screenshot.png",
    "url": "https://storage.example.com/attachments/xxx.png",
    "size": 245760
  }
}
```

---

### 8.7 关闭工单

`POST /tickets/:id/close` `需认证`

**成功响应 200：**

```json
{
  "code": 0,
  "message": "工单已关闭",
  "data": { "id": "clx...", "status": "CLOSED" }
}
```

---

## 9. 技术服务项目接口 /projects

### 9.1 获取项目列表

`GET /projects` `需认证`

**查询参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| status | string | 状态筛选 |
| page | int | 页码 |
| pageSize | int | 每页数量 |

**成功响应 200：**

```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": "clx...",
        "projectNo": "PJ-0015",
        "title": "毕业设计 - 在线商城系统",
        "category": "毕业设计",
        "status": "DEVELOPING",
        "currentRound": 2,
        "maxRounds": 3,
        "lastMessage": "第二轮开发已完成，进入测试阶段...",
        "createdAt": "2026-03-10T08:00:00.000Z",
        "updatedAt": "2026-03-12T15:00:00.000Z"
      }
    ],
    "total": 2,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

---

### 9.2 获取项目详情

`GET /projects/:id` `需认证`

**成功响应 200：**

```json
{
  "code": 0,
  "data": {
    "id": "clx...",
    "projectNo": "PJ-0015",
    "title": "毕业设计 - 在线商城系统",
    "description": "需要一个基于 Spring Boot + Vue3 的在线商城系统...",
    "category": "毕业设计",
    "status": "DEVELOPING",
    "requirement": {
      "summary": "在线商城系统，含用户管理、商品管理、订单系统",
      "keyPoints": ["Spring Boot 后端", "Vue3 前端", "MySQL 数据库"],
      "complexity": "medium"
    },
    "currentRound": 2,
    "maxRounds": 3,
    "gitRepoUrl": "https://github.com/tc-projects/pj-0015",
    "deployUrl": null,
    "order": {
      "orderNo": "NX-20260310-00003",
      "totalAmount": "1988.00"
    },
    "createdAt": "2026-03-10T08:00:00.000Z",
    "confirmedAt": "2026-03-10T14:00:00.000Z",
    "startedAt": "2026-03-10T15:00:00.000Z"
  }
}
```

---

### 9.3 获取项目消息

`GET /projects/:id/messages` `需认证`

**成功响应 200：**

```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": "clx...",
        "sender": "agent",
        "senderName": "AI 助手",
        "senderRole": "agent",
        "content": "您好，我已经分析了您的需求。这是一个中等复杂度的在线商城系统...",
        "msgType": "text",
        "attachments": null,
        "createdAt": "2026-03-10T09:00:00.000Z"
      },
      {
        "id": "clx...",
        "sender": "clx1a2b3c4d5e6f7",
        "senderName": "张三",
        "senderRole": "user",
        "content": "对，还需要支持微信支付和支付宝",
        "msgType": "text",
        "attachments": null,
        "createdAt": "2026-03-10T09:15:00.000Z"
      }
    ],
    "total": 20,
    "page": 1,
    "pageSize": 50,
    "totalPages": 1
  }
}
```

---

### 9.4 发送项目消息

`POST /projects/:id/messages` `需认证`

**请求体：**

```json
{
  "content": "还需要增加一个优惠券功能",
  "msgType": "text"
}
```

消息发送后，后端会将消息转发给分配的 OpenClaw Agent。

---

### 9.5 上传项目文件

`POST /projects/:id/files` `需认证`

**请求体：** `multipart/form-data`

| 字段 | 类型 | 说明 |
|------|------|------|
| file | file | 文件，最大 50MB |
| description | string | 文件描述（可选） |

---

### 9.6 确认需求

`POST /projects/:id/confirm` `需认证`

**请求体：**

```json
{
  "requirement": "最终确认的需求描述...",
  "confirmNote": "以上需求已确认无误"
}
```

项目状态变为 `CONFIRMED`，触发 Agent 开始制定开发计划。

**成功响应 200：**

```json
{
  "code": 0,
  "message": "需求已确认，即将开始制定开发计划",
  "data": {
    "id": "clx...",
    "status": "CONFIRMED"
  }
}
```

**错误响应：**

| code | message |
|------|---------|
| 42210 | 当前项目状态不支持确认需求 |

---

### 9.7 获取开发计划

`GET /projects/:id/plan` `需认证`

**成功响应 200：**

```json
{
  "code": 0,
  "data": {
    "overview": "本项目将分为3个阶段完成...",
    "tasks": [
      {
        "name": "数据库设计与后端基础架构",
        "description": "设计数据库表结构，搭建 Spring Boot 项目骨架",
        "status": "done",
        "round": 1
      },
      {
        "name": "核心业务逻辑开发",
        "description": "实现用户管理、商品管理、订单系统",
        "status": "running",
        "round": 2
      },
      {
        "name": "前端页面与联调",
        "description": "Vue3 前端开发，前后端联调测试",
        "status": "pending",
        "round": 3
      }
    ],
    "timeline": "预计3个工作日完成",
    "resources": ["Spring Boot 3.x", "Vue 3", "MySQL 8", "Redis"]
  }
}
```

---

### 9.8 获取开发进度

`GET /projects/:id/progress` `需认证`

**成功响应 200：**

```json
{
  "code": 0,
  "data": {
    "currentRound": 2,
    "maxRounds": 3,
    "overallProgress": 65,
    "rounds": [
      {
        "round": 1,
        "status": "done",
        "steps": [
          {
            "step": "数据库设计",
            "status": "done",
            "detail": "已创建 12 张数据表",
            "gitCommit": "a1b2c3d",
            "completedAt": "2026-03-10T18:00:00.000Z"
          },
          {
            "step": "后端骨架搭建",
            "status": "done",
            "detail": "Spring Boot 项目初始化完成",
            "gitCommit": "e4f5g6h",
            "completedAt": "2026-03-10T20:00:00.000Z"
          }
        ]
      },
      {
        "round": 2,
        "status": "running",
        "steps": [
          {
            "step": "用户模块开发",
            "status": "done",
            "detail": "注册/登录/权限管理完成",
            "gitCommit": "i7j8k9l",
            "completedAt": "2026-03-11T12:00:00.000Z"
          },
          {
            "step": "商品模块开发",
            "status": "running",
            "detail": "正在开发商品 CRUD...",
            "gitCommit": null,
            "completedAt": null
          },
          {
            "step": "订单模块开发",
            "status": "pending",
            "detail": null,
            "gitCommit": null,
            "completedAt": null
          }
        ]
      }
    ]
  }
}
```

---

### 9.9 验收确认

`POST /projects/:id/accept` `需认证`

项目状态变为 `ACCEPTED`，最终标记为 `COMPLETED`。

**成功响应 200：**

```json
{
  "code": 0,
  "message": "验收通过，项目已完成",
  "data": {
    "id": "clx...",
    "status": "COMPLETED",
    "completedAt": "2026-03-15T10:00:00.000Z"
  }
}
```

---

### 9.10 验收驳回

`POST /projects/:id/reject` `需认证`

**请求体：**

```json
{
  "reason": "支付功能还有问题，微信支付回调没有处理",
  "details": "具体表现为..."
}
```

项目状态回到 `DEVELOPING`，Agent 进入下一轮迭代。

**成功响应 200：**

```json
{
  "code": 0,
  "message": "已提交修改意见",
  "data": {
    "id": "clx...",
    "status": "DEVELOPING",
    "currentRound": 3
  }
}
```

---

## 10. AI 客服接口 /chat

### 10.1 创建聊天会话

`POST /chat/sessions` `需认证`

**成功响应 201：**

```json
{
  "code": 0,
  "data": {
    "sessionId": "clx...",
    "welcomeMessage": "您好！我是 ThousandCliffs 智能助手，有什么可以帮您的？"
  }
}
```

---

### 10.2 发送消息（SSE 流式）

`POST /chat/send` `需认证`

**请求体：**

```json
{
  "sessionId": "clx...",
  "content": "我想了解如何提取卡密"
}
```

**响应：** `Content-Type: text/event-stream`

```
data: {"content":"您"}

data: {"content":"好"}

data: {"content":"，"}

data: {"content":"提取"}

data: {"content":"卡密"}

data: {"content":"的步骤如下：\n\n1. 进入「卡密提取」页面\n2. 输入您的提取码或订单号\n3. 点击「立即提取」\n\n如有问题请随时联系我。"}

data: {"done":true}
```

---

### 10.3 获取聊天历史

`GET /chat/history` `需认证`

**查询参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| sessionId | string | 会话 ID（不传则返回最近会话） |
| page | int | 页码 |
| pageSize | int | 每页数量（默认50） |

**成功响应 200：**

```json
{
  "code": 0,
  "data": {
    "items": [
      { "role": "assistant", "content": "您好！我是...", "createdAt": "..." },
      { "role": "user", "content": "我想了解...", "createdAt": "..." },
      { "role": "assistant", "content": "提取卡密的步骤...", "createdAt": "..." }
    ],
    "total": 3,
    "page": 1,
    "pageSize": 50,
    "totalPages": 1
  }
}
```

---

### 10.4 转人工工单

`POST /chat/:sessionId/escalate` `需认证`

将当前 AI 客服会话升级为人工工单。

**成功响应 200：**

```json
{
  "code": 0,
  "message": "已为您创建人工工单",
  "data": {
    "ticketId": "clx...",
    "ticketNo": "TK-0043"
  }
}
```

---

## 11. 通知接口 /notifications

### 11.1 获取通知列表

`GET /notifications` `需认证`

**查询参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| type | string | 类型筛选：`order` `ticket` `project` `key` `system` |
| isRead | boolean | 已读/未读筛选 |
| page | int | 页码 |
| pageSize | int | 每页数量 |

**成功响应 200：**

```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": "clx...",
        "type": "order",
        "title": "订单支付成功",
        "content": "您的订单 NX-20260312-00001 已支付成功，卡密正在分配中。",
        "link": "/portal/history",
        "isRead": false,
        "createdAt": "2026-03-12T08:02:00.000Z"
      },
      {
        "id": "clx...",
        "type": "key",
        "title": "卡密已就绪",
        "content": "您的卡密已准备就绪，请前往提取。",
        "link": "/portal/keys",
        "isRead": false,
        "createdAt": "2026-03-12T08:03:00.000Z"
      }
    ],
    "total": 10,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

---

### 11.2 标记通知已读

`PUT /notifications/:id/read` `需认证`

**成功响应 200：**

```json
{ "code": 0, "message": "success" }
```

---

### 11.3 全部标记已读

`PUT /notifications/read-all` `需认证`

**成功响应 200：**

```json
{ "code": 0, "message": "已全部标记为已读" }
```

---

### 11.4 获取未读数

`GET /notifications/unread-count` `需认证`

**成功响应 200：**

```json
{
  "code": 0,
  "data": { "count": 3 }
}
```

---

## 12. 管理后台接口 /admin

所有管理接口需要 `ADMIN` 角色。

### 12.1 仪表盘数据

`GET /admin/dashboard` `需认证 + ADMIN`

**查询参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| range | string | `7d` | 统计范围：`today` `7d` `30d` |

**成功响应 200：**

```json
{
  "code": 0,
  "data": {
    "range": "7d",
    "sales": {
      "today": "12847.00",
      "yesterday": "11032.00",
      "thisMonth": "128420.00"
    },
    "orders": {
      "today": 28,
      "pending": 6,
      "refunding": 2
    },
    "users": {
      "active": 1200,
      "newToday": 38
    },
    "pendingTickets": 5,
    "activeProjects": 3,
    "lowStockProducts": [
      { "id": "p1", "name": "Claude Pro 会员", "stock": 5, "warningThreshold": 10 }
    ],
    "recentOrders": [
      {
        "id": "ord_001",
        "orderNo": "NX-20260312-00001",
        "userName": "张三",
        "status": "PAID",
        "paidAmount": "128.00",
        "createdAt": "2026-03-12T08:00:00.000Z"
      }
    ]
  }
}
```

---

### 12.2 商品管理

`GET /admin/products` — 商品列表（含下架商品）

**查询参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| keyword | string | - | 商品名称/描述搜索 |
| category | string | - | 分类筛选：`AI_TOOL` `ACCOUNT` `CUSTOM` `SERVICE` |
| type | string | - | 类型筛选：`RESOURCE` `SERVICE` |
| status | string | `all` | 状态筛选：`all` `active` `inactive` |
| page | int | 1 | 页码 |
| pageSize | int | 20 | 每页数量 |

**成功响应 200：**

```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": "p1",
        "name": "Claude Pro 会员",
        "category": "AI_TOOL",
        "type": "RESOURCE",
        "price": "128.00",
        "originalPrice": "198.00",
        "stock": 47,
        "warningThreshold": 10,
        "badge": "热销",
        "badgeColor": "#ff6b35",
        "isActive": true,
        "updatedAt": "2026-03-12T08:00:00.000Z"
      }
    ],
    "total": 6,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

`POST /admin/products` — 创建商品

**请求体：**

```json
{
  "name": "Claude Pro 会员",
  "category": "AI_TOOL",
  "type": "RESOURCE",
  "price": "128.00",
  "originalPrice": "198.00",
  "stock": 47,
  "warningThreshold": 10,
  "badge": "热销",
  "badgeColor": "#ff6b35",
  "description": "正版Claude Pro订阅，30天有效，支持无限次对话",
  "features": ["无限对话次数", "优先响应速度"],
  "icon": "🤖",
  "isActive": true
}
```

`PUT /admin/products/:id` — 更新商品

说明：支持部分字段更新，请求体与创建商品一致。

`DELETE /admin/products/:id` — 删除商品

**成功响应 200：**

```json
{
  "code": 0,
  "message": "商品已删除",
  "data": { "id": "p1" }
}
```

`PUT /admin/products/:id/toggle` — 上下架切换

**请求体：**

```json
{ "isActive": false }
```

**成功响应 200：**

```json
{
  "code": 0,
  "message": "商品状态已更新",
  "data": { "id": "p1", "isActive": false }
}
```

---

### 12.3 卡密管理

`GET /admin/keys` — 卡密池列表

**查询参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| productId | string | - | 商品 ID |
| status | string | `all` | `all` `AVAILABLE` `USED` `EXPIRED` |
| keyword | string | - | 按卡密尾号/订单号/用户邮箱搜索 |
| page | int | 1 | 页码 |
| pageSize | int | 20 | 每页数量 |

**成功响应 200：**

```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": "key_001",
        "productId": "p1",
        "productName": "Claude Pro 会员",
        "maskedValue": "CLAUDE-PRO-****-C3D4",
        "status": "AVAILABLE",
        "batchNo": "BATCH-20260312-01",
        "expiresAt": "2026-06-30T23:59:59.000Z",
        "usedBy": null,
        "usedOrderNo": null,
        "createdAt": "2026-03-12T08:00:00.000Z"
      }
    ],
    "total": 45,
    "page": 1,
    "pageSize": 20,
    "totalPages": 3
  }
}
```

`POST /admin/keys/import` — 批量导入卡密

**请求体：**

```json
{
  "productId": "p1",
  "keys": [
    "CLAUDE-PRO-A1B2C3D4",
    "CLAUDE-PRO-E5F6G7H8",
    "CLAUDE-PRO-I9J0K1L2"
  ],
  "expiresAt": "2026-06-30T23:59:59.000Z"
}
```

**成功响应 200：**

```json
{
  "code": 0,
  "message": "卡密导入完成",
  "data": {
    "batchNo": "BATCH-20260312-01",
    "imported": 3,
    "duplicated": 0,
    "invalid": 0
  }
}
```

`GET /admin/keys/stats` — 卡密库存统计

```json
{
  "code": 0,
  "data": [
    {
      "productId": "p1",
      "productName": "Claude Pro 会员",
      "available": 45,
      "used": 123,
      "expired": 5,
      "warningThreshold": 10,
      "isLowStock": false
    },
    {
      "productId": "p2",
      "productName": "GPT-4o 高级账号",
      "available": 20,
      "used": 89,
      "expired": 2,
      "warningThreshold": 15,
      "isLowStock": false
    }
  ]
}
```

---

### 12.4 订单管理

`GET /admin/orders` — 订单列表（全部用户）

**查询参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| keyword | string | - | 订单号/用户名/邮箱搜索 |
| status | string | `all` | 订单状态：`PENDING` `PAID` `COMPLETED` `CANCELLED` `REFUNDING` `REFUNDED` |
| type | string | `all` | 订单类型：`RESOURCE` `SERVICE` |
| paymentStatus | string | `all` | 支付状态：`UNPAID` `PAID` `REFUNDED` |
| dateFrom | string | - | 开始日期 |
| dateTo | string | - | 结束日期 |
| page | int | 1 | 页码 |
| pageSize | int | 20 | 每页数量 |

**成功响应 200：**

```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": "ord_001",
        "orderNo": "NX-20260312-00001",
        "user": {
          "id": "u_001",
          "name": "张三",
          "email": "zhangsan@example.com"
        },
        "type": "RESOURCE",
        "status": "PAID",
        "paymentStatus": "PAID",
        "itemsCount": 1,
        "paidAmount": "128.00",
        "source": "WEB",
        "createdAt": "2026-03-12T08:00:00.000Z"
      }
    ],
    "total": 284,
    "page": 1,
    "pageSize": 20,
    "totalPages": 15
  }
}
```

`PUT /admin/orders/:id/status` — 更新订单状态

**请求体：**

```json
{
  "status": "COMPLETED",
  "note": "已人工核验支付并发卡"
}
```

`POST /admin/orders/:id/refund` — 发起退款

**请求体：**

```json
{
  "amount": "128.00",
  "reason": "重复付款",
  "remark": "用户已提供支付截图"
}
```

**成功响应 200：**

```json
{
  "code": 0,
  "message": "退款申请已创建",
  "data": {
    "refundId": "rf_001",
    "orderId": "ord_001",
    "status": "REFUNDING"
  }
}
```

---

### 12.5 工单管理

`GET /admin/tickets` — 全部工单

**查询参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| status | string | `all` | 工单状态：`OPEN` `PENDING` `RESOLVED` `CLOSED` |
| type | string | `all` | 工单类型：`ACCOUNT` `PAYMENT` `DELIVERY` `PROJECT` |
| priority | string | `all` | 优先级：`LOW` `MEDIUM` `HIGH` `URGENT` |
| assignee | string | - | 处理人 ID |
| page | int | 1 | 页码 |
| pageSize | int | 20 | 每页数量 |

**成功响应 200：**

```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": "tic_001",
        "ticketNo": "TK-20260312-0001",
        "subject": "收不到卡密",
        "type": "DELIVERY",
        "priority": "HIGH",
        "status": "OPEN",
        "userName": "李四",
        "assignee": null,
        "lastMessageAt": "2026-03-12T09:30:00.000Z"
      }
    ],
    "total": 12,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

`PUT /admin/tickets/:id/assign` — 分配处理人

**请求体：**

```json
{
  "assigneeId": "u_admin_001",
  "note": "分配给当班客服"
}
```

`POST /admin/tickets/:id/messages` — 以管理员身份回复

**请求体：**

```json
{
  "content": "已为您重新补发卡密，请刷新页面查看。",
  "attachments": []
}
```

---

### 12.6 项目管理

`GET /admin/projects` — 全部技术服务项目

**查询参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| status | string | `all` | 项目状态 |
| reviewStatus | string | `all` | 审核状态：`PENDING` `APPROVED` `REJECTED` |
| ownerId | string | - | 项目负责人 |
| page | int | 1 | 页码 |
| pageSize | int | 20 | 每页数量 |

**成功响应 200：**

```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": "pj_001",
        "projectNo": "PJ-20260312-001",
        "title": "企业官网重构",
        "status": "IN_PROGRESS",
        "reviewStatus": "PENDING",
        "customerName": "王五",
        "ownerName": "运营A",
        "deadline": "2026-03-20T00:00:00.000Z"
      }
    ],
    "total": 3,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

`PUT /admin/projects/:id/review` — 审核标记

```json
{
  "action": "approve",
  "note": "代码质量良好，可以交付"
}
```

`PUT /admin/projects/:id/deliver` — 标记交付

```json
{
  "gitRepoUrl": "https://github.com/tc-projects/pj-0015",
  "deployUrl": "https://demo.pj-0015.example.com",
  "deliveryNote": "项目已部署，请查看"
}
```

---

### 12.7 用户管理

`GET /admin/users` — 用户列表

**查询参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| keyword | string | - | 用户名/邮箱搜索 |
| role | string | `all` | 角色筛选：`USER` `ADMIN` `SUPER_ADMIN` |
| status | string | `all` | 状态筛选：`ACTIVE` `BANNED` |
| page | int | 1 | 页码 |
| pageSize | int | 20 | 每页数量 |

**成功响应 200：**

```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": "u_001",
        "name": "张三",
        "email": "zhangsan@example.com",
        "role": "USER",
        "status": "ACTIVE",
        "ordersCount": 8,
        "lastLoginAt": "2026-03-12T08:12:00.000Z",
        "createdAt": "2026-02-20T10:00:00.000Z"
      }
    ],
    "total": 1200,
    "page": 1,
    "pageSize": 20,
    "totalPages": 60
  }
}
```

`PUT /admin/users/:id/role` — 修改用户角色

**请求体：**

```json
{ "role": "ADMIN" }
```

`PUT /admin/users/:id/ban` — 封禁/解封用户

**请求体：**

```json
{
  "action": "ban",
  "reason": "多次恶意退款",
  "expiresAt": "2026-04-12T00:00:00.000Z"
}
```

---

### 12.8 系统设置

`GET /admin/settings` — 获取后台系统配置

**成功响应 200：**

```json
{
  "code": 0,
  "data": {
    "inventory": {
      "defaultWarningThreshold": 10,
      "notifyWhenLowStock": true
    },
    "ticket": {
      "slaHours": 12,
      "autoAssign": false
    },
    "notification": {
      "emails": ["ops@example.com"],
      "webhookUrl": "https://hooks.example.com/ops"
    }
  }
}
```

`PUT /admin/settings` — 更新后台系统配置

**请求体：**

```json
{
  "inventory": {
    "defaultWarningThreshold": 8,
    "notifyWhenLowStock": true
  },
  "ticket": {
    "slaHours": 8
  }
}
```

---

### 12.9 闲鱼映射管理

`GET /admin/xianyu/mappings` — 商品映射列表

**查询参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| keyword | string | - | 按商品名/闲鱼标题搜索 |
| page | int | 1 | 页码 |
| pageSize | int | 20 | 每页数量 |

**成功响应 200：**

```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": "map_001",
        "productId": "p1",
        "productName": "Claude Pro 会员",
        "xianyuItemId": "xy_987654",
        "xianyuItemTitle": "Claude Pro 会员 正版订阅",
        "createdAt": "2026-03-12T09:00:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

`POST /admin/xianyu/mappings` — 创建映射

```json
{
  "productId": "p1",
  "xianyuItemId": "闲鱼商品ID",
  "xianyuItemTitle": "Claude Pro 会员 正版订阅"
}
```

`DELETE /admin/xianyu/mappings/:id` — 删除映射

**成功响应 200：**

```json
{
  "code": 0,
  "message": "映射已删除",
  "data": { "id": "map_001" }
}
```

---

## 13. 闲鱼回调接口 /xianyu

### 13.1 订单通知回调

`POST /xianyu/webhook/order` `公开（签名校验）`

此接口由闲鱼平台调用，通知有新订单。

**请求头：**

```
X-Xianyu-Signature: <HMAC-SHA256 签名>
X-Xianyu-Timestamp: <时间戳>
```

**请求体（示例，取决于闲鱼平台实际格式）：**

```json
{
  "event": "order.paid",
  "orderId": "闲鱼订单号",
  "buyerId": "买家ID",
  "itemId": "商品ID",
  "itemTitle": "Claude Pro 会员 正版订阅",
  "amount": "128.00",
  "buyerMessage": "需要一个月的，邮箱 buyer@example.com",
  "paidAt": "2026-03-12T08:00:00.000Z"
}
```

**响应 200：**

```json
{ "success": true }
```

处理逻辑：
1. 验证签名
2. 根据 `itemId` 查询商品映射
3. 根据商品类型走资源类/技术服务类处理链路
4. 返回 success

---

### 13.2 消息通知回调

`POST /xianyu/webhook/message` `公开（签名校验）`

接收闲鱼平台的买家消息（如果支持消息回调）。

---

## 14. Agent 回调接口 /agent

### 14.1 需求分析完成

`POST /agent/callback/analysis` `内部（API Key 校验）`

**请求头：**

```
X-Agent-Key: <Agent API Key>
```

**请求体：**

```json
{
  "projectId": "clx...",
  "taskId": "agent-task-001",
  "result": {
    "category": "毕业设计",
    "summary": "基于 Spring Boot + Vue3 的在线商城系统",
    "complexity": "medium",
    "estimatedRounds": 3,
    "keyPoints": ["Spring Boot 后端", "Vue3 前端", "MySQL"],
    "suggestedAgent": "web-dev-agent"
  }
}
```

---

### 14.2 开发计划完成

`POST /agent/callback/plan` `内部`

**请求体：**

```json
{
  "projectId": "clx...",
  "taskId": "agent-task-002",
  "plan": {
    "overview": "本项目分3轮完成...",
    "tasks": [
      {
        "name": "数据库与后端架构",
        "description": "...",
        "round": 1,
        "estimatedTime": "1天"
      }
    ],
    "timeline": "预计3个工作日",
    "resources": ["Spring Boot 3.x", "Vue 3", "MySQL 8"]
  }
}
```

---

### 14.3 开发进度更新

`POST /agent/callback/progress` `内部`

**请求体：**

```json
{
  "projectId": "clx...",
  "taskId": "agent-task-003",
  "round": 2,
  "step": "商品模块开发",
  "status": "done",
  "detail": "商品 CRUD、分类管理、搜索功能已完成",
  "gitCommit": "a1b2c3d4e5f6"
}
```

---

### 14.4 开发完成通知

`POST /agent/callback/complete` `内部`

**请求体：**

```json
{
  "projectId": "clx...",
  "taskId": "agent-task-003",
  "gitRepoUrl": "https://github.com/tc-projects/pj-0015",
  "gitBranch": "main",
  "summary": "3轮开发全部完成，共 45 次提交，覆盖所有需求点。",
  "testResults": {
    "passed": 128,
    "failed": 0,
    "coverage": "82%"
  }
}
```

---

### 14.5 Agent 消息转发

`POST /agent/callback/message` `内部`

Agent 发送的消息，需要转发给用户。

**请求体：**

```json
{
  "projectId": "clx...",
  "content": "数据库设计已完成，共创建 12 张表。您可以在开发计划中查看详情。",
  "msgType": "text"
}
```

---

## 15. WebSocket 接口 /ws

### 15.1 连接

```
ws://localhost:8000/ws?token=<access_token>
```

连接成功后，服务器发送欢迎消息：

```json
{ "type": "connected", "payload": { "userId": "clx..." } }
```

### 15.2 心跳

客户端每 30 秒发送：

```json
{ "type": "ping" }
```

服务器回复：

```json
{ "type": "pong" }
```

### 15.3 服务端推送消息类型

#### 通知推送

```json
{
  "type": "notification",
  "payload": {
    "id": "clx...",
    "type": "order",
    "title": "订单支付成功",
    "content": "...",
    "link": "/portal/history"
  }
}
```

#### 订单状态变更

```json
{
  "type": "order.status",
  "payload": {
    "orderId": "clx...",
    "orderNo": "NX-20260312-00001",
    "status": "PAID",
    "previousStatus": "PENDING"
  }
}
```

#### 支付成功

```json
{
  "type": "order.paid",
  "payload": {
    "orderId": "clx...",
    "orderNo": "NX-20260312-00001",
    "amount": "118.00",
    "method": "ALIPAY"
  }
}
```

#### 卡密就绪

```json
{
  "type": "key.ready",
  "payload": {
    "orderId": "clx...",
    "extractCode": "TC-A7K9-B3M2",
    "productName": "Claude Pro 会员"
  }
}
```

#### 工单新消息

```json
{
  "type": "ticket.message",
  "payload": {
    "ticketId": "clx...",
    "ticketNo": "TK-0042",
    "message": {
      "id": "clx...",
      "senderName": "客服",
      "senderRole": "admin",
      "content": "您好，已处理...",
      "createdAt": "..."
    }
  }
}
```

#### 工单状态变更

```json
{
  "type": "ticket.status",
  "payload": {
    "ticketId": "clx...",
    "ticketNo": "TK-0042",
    "status": "REPLIED"
  }
}
```

#### 项目新消息

```json
{
  "type": "project.message",
  "payload": {
    "projectId": "clx...",
    "projectNo": "PJ-0015",
    "message": {
      "id": "clx...",
      "senderName": "AI 助手",
      "senderRole": "agent",
      "content": "数据库设计已完成...",
      "msgType": "text",
      "createdAt": "..."
    }
  }
}
```

#### 项目状态变更

```json
{
  "type": "project.status",
  "payload": {
    "projectId": "clx...",
    "projectNo": "PJ-0015",
    "status": "DEVELOPING",
    "previousStatus": "PLANNING"
  }
}
```

#### 项目进度更新

```json
{
  "type": "project.progress",
  "payload": {
    "projectId": "clx...",
    "round": 2,
    "step": "商品模块开发",
    "status": "done",
    "detail": "商品 CRUD 完成",
    "overallProgress": 65
  }
}
```

#### 排队状态更新

```json
{
  "type": "queue.update",
  "payload": {
    "orderId": "clx...",
    "position": 3,
    "progress": 45,
    "eta": "约15分钟"
  }
}
```

---

## 16. 错误码表

### 16.1 通用错误 (400xx)

| code | HTTP | message |
|------|------|---------|
| 40001 | 400 | 请求参数错误 |
| 40002 | 400 | 密码强度不足 |
| 40010 | 400 | 商品库存不足 |
| 40011 | 400 | 优惠码无效或已过期 |
| 40012 | 400 | 请填写收件信息 |

### 16.2 认证错误 (401xx)

| code | HTTP | message |
|------|------|---------|
| 40100 | 401 | 未登录或 Token 已过期 |
| 40101 | 401 | 邮箱或密码错误 |
| 40102 | 401 | 账号已被禁用 |
| 40103 | 401 | Refresh Token 无效或已过期 |

### 16.3 权限错误 (403xx)

| code | HTTP | message |
|------|------|---------|
| 40300 | 403 | 无权限访问 |
| 40301 | 403 | 需要管理员权限 |

### 16.4 资源不存在 (404xx)

| code | HTTP | message |
|------|------|---------|
| 40400 | 404 | 资源不存在 |
| 40401 | 404 | 提取码无效 |
| 40402 | 404 | 订单不存在 |
| 40403 | 404 | 工单不存在 |
| 40404 | 404 | 项目不存在 |
| 40405 | 404 | 商品不存在 |

### 16.5 冲突错误 (409xx)

| code | HTTP | message |
|------|------|---------|
| 40901 | 409 | 该邮箱已被注册 |
| 40902 | 409 | 订单号已存在 |

### 16.6 业务逻辑错误 (422xx)

| code | HTTP | message |
|------|------|---------|
| 42201 | 422 | 当前订单状态不可取消 |
| 42202 | 422 | 该提取码已被使用 |
| 42203 | 422 | 提取码已过期 |
| 42204 | 422 | 卡密库存不足，请联系客服 |
| 42210 | 422 | 当前项目状态不支持该操作 |
| 42211 | 422 | 已超过最大开发轮次 |

### 16.7 限流错误 (429xx)

| code | HTTP | message |
|------|------|---------|
| 42900 | 429 | 请求过于频繁，请稍后再试 |
| 42901 | 429 | 登录尝试次数过多，请稍后再试 |

### 16.8 服务器错误 (500xx)

| code | HTTP | message |
|------|------|---------|
| 50000 | 500 | 服务器内部错误 |
| 50001 | 500 | 支付渠道异常 |
| 50002 | 500 | Agent 服务不可用 |

---

*文档版本：v1.0 | 前后端对接完整 API 规范*
