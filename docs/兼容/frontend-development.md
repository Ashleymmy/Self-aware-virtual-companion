# ThousandCliffs-AI 前端开发文档

> 基于现有 Vue3 项目，对接后端 API 及业务扩展的完整改造方案
>
> 2026-03 对接约定更新：后端协作目标栈已固定为 `uv + Python 3.12 + FastAPI`。前端继续只依赖 HTTP / WebSocket 契约，不绑定后端 ORM 或任务框架实现。

---

## 目录

1. [项目现状概述](#1-项目现状概述)
2. [业务架构与前端定位](#2-业务架构与前端定位)
3. [现有技术栈与目录结构](#3-现有技术栈与目录结构)
4. [改造总览：Mock → 真实后端](#4-改造总览mock--真实后端)
5. [模块一：认证系统改造](#5-模块一认证系统改造)
6. [模块二：商品与卡密系统](#6-模块二商品与卡密系统)
7. [模块三：订单与支付系统](#7-模块三订单与支付系统)
8. [模块四：工单系统（资源类+技术服务类）](#8-模块四工单系统资源类技术服务类)
9. [模块五：AI 智能客服对接](#9-模块五ai-智能客服对接)
10. [模块六：技术服务专属页面（新增）](#10-模块六技术服务专属页面新增)
11. [模块七：实时通信（WebSocket）](#11-模块七实时通信websocket)
12. [模块八：通知系统](#12-模块八通知系统)
13. [模块九：管理后台入口（新增）](#13-模块九管理后台入口新增)
14. [状态管理改造](#14-状态管理改造)
15. [API 层改造规范](#15-api-层改造规范)
16. [路由改造](#16-路由改造)
17. [环境变量与部署配置](#17-环境变量与部署配置)
18. [开发阶段规划](#18-开发阶段规划)

---

## 1. 项目现状概述

### 已完成

| 模块 | 状态 | 说明 |
|------|------|------|
| Landing 着陆页 | ✅ 完成 | Hero、Bento Grid、AuthModal、全套动画 |
| Portal 布局 | ✅ 完成 | Sidebar、Topbar、页面切换动画 |
| 商品展示 | ✅ 完成 | 商品列表、详情弹窗、分类筛选 |
| 购物车 | ✅ 完成 | 加购/改量/删除/清空 |
| 下单流程 | ✅ 完成 | 收件信息、支付选择、优惠码（Mock） |
| 卡密提取 | ✅ 完成 | 输入提取码/订单号提取（Mock） |
| 排队状态 | ✅ 完成 | 队列列表、进度条（Mock） |
| 工单管理 | ✅ 完成 | 工单列表、新建工单弹窗（Mock） |
| AI 客服 | ✅ 完成 | 聊天界面、快捷回复（关键词匹配 Mock） |
| AI 定制方案 | ✅ 完成 | 表单+方案生成（本地模板 Mock） |
| 历史记录 | ✅ 完成 | 订单/工单/卡密三 Tab 表格 |
| 用户中心 | ✅ 完成 | 资料展示（纯展示，Mock） |

### 需要改造/新增

| 模块 | 类型 | 说明 |
|------|------|------|
| 认证系统 | 改造 | Mock → JWT 真实认证 |
| 商品管理 | 改造 | Mock 数据 → 后端 API |
| 支付系统 | 改造 | 假支付 → 真实支付对接 |
| 卡密系统 | 改造 | Mock 卡密池 → 后端卡密库 |
| 工单系统 | 改造+扩展 | 增加实时消息、与 Agent 对接 |
| 技术服务页面 | **新增** | 需求沟通、开发进度追踪、交付验收 |
| WebSocket 通信 | **新增** | 实时工单消息、状态推送 |
| 通知系统 | **新增** | 站内通知、邮件通知触发 |
| 管理后台 | **新增** | 商品/订单/用户管理（可选独立项目） |

---

## 2. 业务架构与前端定位

```
                    ┌─────────────────────────────┐
                    │        闲鱼商家平台            │
                    │  (商品上架/订单产生/Bot回复)     │
                    └──────────┬──────────────────┘
                               │ Webhook / 轮询
                               ↓
┌──────────┐   API    ┌──────────────────┐   API    ┌──────────────┐
│  本地 PC   │ ←─────→ │    后端服务        │ ←─────→ │  OpenClaw     │
│ (蒸馏LLM)  │         │  (中枢/API网关)    │         │  Agent 集群   │
└──────────┘          └────────┬─────────┘          └──────────────┘
                               │
                    ┌──────────┴─────────┐
                    │    Web 前端 (本项目)  │
                    │                     │
                    │  用户侧：            │
                    │  - 卡密提取          │
                    │  - 技术服务沟通       │
                    │  - 订单/工单追踪      │
                    │                     │
                    │  管理侧（可选）：     │
                    │  - 商品/卡密管理      │
                    │  - 订单处理          │
                    │  - Agent 任务监控     │
                    └────────────────────┘
```

### 前端承担的核心职责

1. **资源类订单**：用户通过提取链接访问站点 → 输入提取码 → 获取卡密
2. **技术服务订单**：用户注册后进入门户 → 深度沟通需求 → 确认需求提交云端 → 追踪开发进度 → 验收交付
3. **通用功能**：浏览商品、下单购买、管理工单、查看历史

---

## 3. 现有技术栈与目录结构

### 技术栈

- **Vue 3.4+** — Composition API `<script setup>`
- **Vue Router 4** — 路由管理，带导航守卫
- **Pinia 2.1+** — 状态管理（含 `pinia-plugin-persistedstate`）
- **Axios 1.6+** — HTTP 客户端
- **Vite 5** — 构建工具
- **Lucide Vue Next** — 图标库

### 当前目录结构

```
src/
├── api/                    # HTTP 接口层（当前 Mock，待改造）
│   ├── http.js             # Axios 实例 + 拦截器
│   ├── auth.api.js         # 认证接口
│   ├── product.api.js      # 商品接口
│   ├── order.api.js        # 订单接口
│   ├── key.api.js          # 卡密接口
│   ├── ticket.api.js       # 工单接口
│   └── solution.api.js     # 定制方案接口
│
├── stores/                 # Pinia 状态管理
│   ├── auth.js             # 认证状态
│   ├── cart.js             # 购物车
│   └── app.js              # 全局 UI 状态
│
├── composables/            # 组合式函数
│   ├── useToast.js         # Toast 通知
│   ├── useLerpEngine.js    # 动画引擎
│   ├── useScrollReveal.js  # 滚动入场
│   ├── useSpotlight.js     # 聚光灯效果
│   ├── usePageStyles.js    # 动态样式注入
│   └── useLandingIntro.js  # 着陆页入场
│
├── components/
│   ├── common/             # 通用组件
│   ├── landing/            # 着陆页组件
│   └── portal/             # 门户组件
│
├── pages/
│   ├── LandingPage.vue
│   └── portal/             # 门户子页面（12个）
│
├── mock/                   # Mock 数据（后端就绪后逐步移除）
├── router/                 # 路由配置
├── styles/                 # 样式文件
├── App.vue
└── main.js
```

### 改造后新增的目录

```
src/
├── api/
│   ├── ...（现有）
│   ├── ws.js               # 【新增】WebSocket 连接管理
│   ├── notification.api.js # 【新增】通知接口
│   ├── payment.api.js      # 【新增】支付接口
│   ├── project.api.js      # 【新增】技术服务项目接口
│   └── admin.api.js        # 【新增】管理接口（可选）
│
├── stores/
│   ├── ...（现有）
│   ├── notification.js     # 【新增】通知状态
│   ├── project.js          # 【新增】技术服务项目状态
│   └── admin.js            # 【新增】管理后台共享状态（可选）
│
├── composables/
│   ├── ...（现有）
│   ├── useWebSocket.js     # 【新增】WebSocket 组合式函数
│   └── useNotification.js  # 【新增】通知组合式函数
│
├── components/admin/
│   ├── AdminSidebar.vue    # 【新增】管理后台侧边栏
│   ├── AdminTopbar.vue     # 【新增】管理后台顶部栏
│   ├── AdminStatCard.vue   # 【新增】仪表盘统计卡片
│   ├── AdminDataTable.vue  # 【新增】后台统一表格
│   └── AdminKeyImportModal.vue # 【新增】卡密批量导入弹窗
│
├── pages/admin/
│   ├── AdminLayout.vue     # 【新增】管理后台布局
│   ├── AdminDashboard.vue  # 【新增】数据概览
│   ├── AdminProducts.vue   # 【新增】商品管理
│   ├── AdminKeys.vue       # 【新增】卡密管理
│   ├── AdminOrders.vue     # 【新增】订单管理
│   ├── AdminTickets.vue    # 【新增】工单管理
│   ├── AdminProjects.vue   # 【新增】项目管理
│   ├── AdminUsers.vue      # 【新增】用户管理
│   └── AdminSettings.vue   # 【新增】系统设置
│
├── pages/portal/
│   ├── ...（现有）
│   ├── PortalProjectDetail.vue   # 【新增】技术服务项目详情
│   ├── PortalProjectChat.vue     # 【新增】需求沟通聊天
│   ├── PortalProjectProgress.vue # 【新增】开发进度追踪
│   └── PortalNotifications.vue   # 【新增】通知中心
│
└── styles/
    ├── ...（现有）
    └── admin.css          # 【新增】后台布局与表格样式
```

---

## 4. 改造总览：Mock → 真实后端

### 改造原则

1. **UI 层零改动**：所有现有页面的 HTML 结构、CSS 样式、动画效果保持不变
2. **API 层替换**：仅修改 `src/api/*.js` 中的实现，从返回 Mock 数据改为调用后端接口
3. **Store 层适配**：Pinia actions 从同步 Mock 改为 async/await 调用 API
4. **增量开发**：新功能以新文件新增，不破坏现有功能

### 改造步骤总览

```
Step 1: 配置环境变量，指向后端 API 地址
Step 2: 改造 api/http.js，增加 Token 刷新、错误码统一处理
Step 3: 逐个替换 api/*.js 的 Mock 实现为真实 HTTP 调用
Step 4: 改造 Pinia stores 的 actions 为 async
Step 5: 新增 WebSocket 连接模块
Step 6: 新增技术服务相关页面和路由
Step 7: 新增通知系统
Step 8: 联调测试
```

---

## 5. 模块一：认证系统改造

### 5.1 当前实现

文件：`src/stores/auth.js`

当前 `login()` 直接在客户端生成 mock user 和 token，无真实校验。

### 5.2 改造方案

#### `src/api/auth.api.js` 改造

```js
import http from './http'

// 登录
export const login = (data) => http.post('/auth/login', data)

// 注册
export const register = (data) => http.post('/auth/register', data)

// 获取当前用户信息
export const getMe = () => http.get('/auth/me')

// 刷新 Token
export const refreshToken = () => http.post('/auth/refresh')

// 退出登录
export const logout = () => http.post('/auth/logout')

// 发送邮箱验证码
export const sendEmailCode = (email) => http.post('/auth/email-code', { email })

// 重置密码
export const resetPassword = (data) => http.post('/auth/reset-password', data)

// 修改密码
export const changePassword = (data) => http.post('/auth/change-password', data)
```

#### `src/stores/auth.js` 改造

```js
import { defineStore } from 'pinia'
import * as authApi from '@/api/auth.api'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    token: null,
    refreshToken: null,
  }),

  getters: {
    isLoggedIn: (state) => Boolean(state.user && state.token),
  },

  actions: {
    // 登录：改为 async，调用真实 API
    async login(credentials) {
      try {
        const res = await authApi.login(credentials)
        this.user = res.user
        this.token = res.token
        this.refreshToken = res.refreshToken
        return { ok: true, user: res.user }
      } catch (err) {
        return { ok: false, message: err.response?.data?.message || '登录失败' }
      }
    },

    // 注册：同理
    async register(payload) {
      try {
        const res = await authApi.register(payload)
        this.user = res.user
        this.token = res.token
        this.refreshToken = res.refreshToken
        return { ok: true, user: res.user }
      } catch (err) {
        return { ok: false, message: err.response?.data?.message || '注册失败' }
      }
    },

    // 获取用户信息（页面刷新时恢复会话）
    async fetchMe() {
      try {
        const res = await authApi.getMe()
        this.user = res.user
        return true
      } catch {
        this.logout()
        return false
      }
    },

    logout() {
      authApi.logout().catch(() => {})
      this.user = null
      this.token = null
      this.refreshToken = null
    },
  },

  persist: {
    key: 'tc-auth',
    paths: ['token', 'refreshToken'],  // 只持久化 token，user 每次从 API 获取
  },
})
```

#### `src/api/http.js` 增强

```js
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'
import router from '@/router'

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15000,
})

// 请求拦截器：注入 Token
http.interceptors.request.use((config) => {
  const auth = useAuthStore()
  if (auth.token) {
    config.headers.Authorization = `Bearer ${auth.token}`
  }
  return config
})

// 响应拦截器：统一错误处理 + Token 刷新
let isRefreshing = false
let failedQueue = []

function processQueue(error, token = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    error ? reject(error) : resolve(token)
  })
  failedQueue = []
}

http.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalRequest = error.config
    const auth = useAuthStore()

    // 401 且有 refreshToken 时尝试刷新
    if (error.response?.status === 401 && !originalRequest._retry && auth.refreshToken) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`
          return http(originalRequest)
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const res = await axios.post(
          `${http.defaults.baseURL}/auth/refresh`,
          { refreshToken: auth.refreshToken }
        )
        auth.token = res.data.token
        auth.refreshToken = res.data.refreshToken
        processQueue(null, res.data.token)
        originalRequest.headers.Authorization = `Bearer ${res.data.token}`
        return http(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError, null)
        auth.logout()
        router.push({ name: 'landing', query: { openAuth: 'login' } })
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    // 其他 401 直接登出
    if (error.response?.status === 401) {
      auth.logout()
    }

    return Promise.reject(error)
  }
)

export default http
```

### 5.3 页面影响

- `AuthModal.vue`（着陆页）— 登录/注册调用改为 `await authStore.login()`，增加 loading 状态
- `PortalAuthModal.vue`（门户）— 同上
- `PortalProfile.vue` — 改密码调用 `authApi.changePassword()`

---

## 6. 模块二：商品与卡密系统

### 6.1 商品接口改造

#### `src/api/product.api.js`

```js
import http from './http'

// 获取商品列表（支持分类筛选+分页）
export const getProducts = (params) => http.get('/products', { params })

// 获取商品详情
export const getProductById = (id) => http.get(`/products/${id}`)

// 获取商品分类列表
export const getCategories = () => http.get('/products/categories')
```

### 6.2 卡密接口改造

#### `src/api/key.api.js`

```js
import http from './http'

// 通过提取码提取卡密（无需登录，闲鱼用户直接访问）
export const extractByCode = (data) => http.post('/keys/extract', data)

// 查看我的卡密记录（需登录）
export const getMyKeys = (params) => http.get('/keys/mine', { params })

// 复制/标记卡密已使用
export const markKeyUsed = (keyId) => http.put(`/keys/${keyId}/used`)
```

### 6.3 页面改造要点

#### `PortalProducts.vue`

```
现在：从 mock/products.js 直接导入 PRODUCTS 数组
改为：onMounted 时调用 getProducts()，响应式绑定
新增：加载状态（skeleton/spinner）、分页、搜索
```

#### `PortalKeys.vue`

```
现在：extractKey() 从本地 CARDS 对象取值
改为：调用 extractByCode()，后端验证提取码有效性并返回卡密
新增：
  - 提取码验证失败的错误提示
  - 卡密过期/已使用的状态处理
  - 提取次数限制提示
  - 无需登录即可提取（闲鱼用户直接访问的场景）
```

#### 新增：卡密提取独立页面

```
路由：/extract/:code?
场景：闲鱼 Bot 发送的链接直接打开此页面，无需登录
功能：输入提取码 → 验证 → 显示卡密 → 复制
```

---

## 7. 模块三：订单与支付系统

### 7.1 订单接口改造

#### `src/api/order.api.js`

```js
import http from './http'

// 创建订单
export const createOrder = (data) => http.post('/orders', data)

// 获取订单列表
export const getOrders = (params) => http.get('/orders', { params })

// 获取订单详情
export const getOrderById = (id) => http.get(`/orders/${id}`)

// 取消订单
export const cancelOrder = (id) => http.post(`/orders/${id}/cancel`)

// 确认收货
export const confirmOrder = (id) => http.post(`/orders/${id}/confirm`)

// 应用优惠码
export const applyPromo = (code) => http.post('/orders/promo/validate', { code })
```

### 7.2 支付接口（新增）

#### `src/api/payment.api.js`

```js
import http from './http'

// 创建支付（返回支付链接/二维码）
export const createPayment = (data) => http.post('/payments/create', data)
// data: { orderId, method: 'alipay'|'wechat'|'usdt' }
// 返回: { payUrl, qrCode, expireAt }

// 查询支付状态
export const getPaymentStatus = (orderId) => http.get(`/payments/${orderId}/status`)
```

### 7.3 页面改造要点

#### `PortalOrder.vue`

```
现在：placeOrder() 直接写入本地 state，模拟成功
改为：
  1. createOrder() → 后端创建订单，返回 orderId
  2. createPayment() → 获取支付二维码/链接
  3. 展示支付弹窗（二维码 / 跳转链接）
  4. 轮询 getPaymentStatus() 等待支付结果
  5. 支付成功 → 跳转排队/卡密提取页
  6. 支付超时/失败 → 提示重试

新增组件：
  - PaymentModal.vue — 支付二维码弹窗
  - 支付倒计时
  - 支付结果页
```

#### `PortalQueue.vue`

```
现在：从 mock/queue.js 读取固定数据
改为：轮询/WebSocket 获取真实排队状态
新增：预计完成时间动态更新
```

---

## 8. 模块四：工单系统（资源类+技术服务类）

### 8.1 工单类型区分

业务上有两种截然不同的工单：

| 维度 | 资源类工单 | 技术服务工单 |
|------|-----------|-------------|
| 触发方式 | 用户手动创建 / 系统自动 | 闲鱼下单后自动创建 |
| 处理方 | 人工客服 | OpenClaw Agent + 人工微调 |
| 沟通方式 | 简单消息 | 深度需求沟通 + 文件传输 |
| 生命周期 | 短（小时级） | 长（天级） |
| 关联实体 | 订单/卡密 | 项目/Git仓库/开发计划 |

### 8.2 工单接口改造

#### `src/api/ticket.api.js`

```js
import http from './http'

// 获取工单列表
export const getTickets = (params) => http.get('/tickets', { params })

// 获取工单详情
export const getTicketById = (id) => http.get(`/tickets/${id}`)

// 创建工单
export const createTicket = (data) => http.post('/tickets', data)

// 更新工单状态
export const updateTicket = (id, data) => http.put(`/tickets/${id}`, data)

// 关闭工单
export const closeTicket = (id) => http.post(`/tickets/${id}/close`)

// 获取工单消息列表
export const getTicketMessages = (id, params) =>
  http.get(`/tickets/${id}/messages`, { params })

// 发送工单消息
export const sendTicketMessage = (id, data) =>
  http.post(`/tickets/${id}/messages`, data)

// 上传附件
export const uploadAttachment = (id, formData) =>
  http.post(`/tickets/${id}/attachments`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
```

### 8.3 页面改造要点

#### `PortalTickets.vue`

```
现在：点击工单 → toast "功能开发中"
改为：点击工单 → 跳转工单详情页

新增子页面：PortalTicketDetail.vue
  - 工单基本信息（ID/类型/状态/时间线）
  - 消息列表（用户消息 + 客服/Agent 消息）
  - 消息输入框 + 文件上传
  - 状态变更操作按钮
  - 关联订单信息展示
```

---

## 9. 模块五：AI 智能客服对接

### 9.1 当前实现

`PortalAiService.vue` 使用 `mock/ai-responses.js` 的关键词匹配，无真实 AI 能力。

### 9.2 改造方案

#### 新增 `src/api/chat.api.js`

```js
import http from './http'

// 发送消息给 AI 客服（SSE 流式响应）
export const sendMessage = (data) => {
  return fetch(`${http.defaults.baseURL}/chat/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${useAuthStore().token}`,
    },
    body: JSON.stringify(data),
  })
}

// 获取聊天历史
export const getChatHistory = (params) => http.get('/chat/history', { params })

// AI 客服转人工
export const escalateToHuman = (sessionId) =>
  http.post(`/chat/${sessionId}/escalate`)
```

#### `PortalAiService.vue` 改造

```
现在：本地关键词匹配，600ms 延迟模拟
改为：
  1. 调用 sendMessage() 发送到后端
  2. 后端转发到 LLM（蒸馏模型或 OpenClaw Agent）
  3. 使用 SSE (Server-Sent Events) 流式接收回复
  4. 逐字渲染 AI 回复（打字机效果）
  5. 转人工时调用 escalateToHuman()，自动创建工单
```

---

## 10. 模块六：技术服务专属页面（新增）

这是本次最大的新增模块，对应「技术服务订单」的完整生命周期。

### 10.1 新增接口

#### `src/api/project.api.js`

```js
import http from './http'

// 获取我的项目列表
export const getProjects = (params) => http.get('/projects', { params })

// 获取项目详情
export const getProjectById = (id) => http.get(`/projects/${id}`)

// 提交需求确认（用户确认需求，提交给 Agent）
export const confirmRequirement = (id, data) =>
  http.post(`/projects/${id}/confirm`, data)

// 获取开发计划
export const getDevPlan = (id) => http.get(`/projects/${id}/plan`)

// 获取开发进度
export const getProgress = (id) => http.get(`/projects/${id}/progress`)

// 获取项目消息（需求沟通）
export const getProjectMessages = (id, params) =>
  http.get(`/projects/${id}/messages`, { params })

// 发送项目消息
export const sendProjectMessage = (id, data) =>
  http.post(`/projects/${id}/messages`, data)

// 上传需求文件
export const uploadProjectFile = (id, formData) =>
  http.post(`/projects/${id}/files`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })

// 验收确认
export const acceptDelivery = (id) => http.post(`/projects/${id}/accept`)

// 验收驳回
export const rejectDelivery = (id, data) =>
  http.post(`/projects/${id}/reject`, data)
```

### 10.2 新增 Pinia Store

#### `src/stores/project.js`

```js
import { defineStore } from 'pinia'
import * as projectApi from '@/api/project.api'

export const useProjectStore = defineStore('project', {
  state: () => ({
    projects: [],
    currentProject: null,
    messages: [],
    devPlan: null,
    progress: null,
  }),

  actions: {
    async fetchProjects() {
      const res = await projectApi.getProjects()
      this.projects = res.data
    },
    async fetchProject(id) {
      const res = await projectApi.getProjectById(id)
      this.currentProject = res.data
    },
    async fetchMessages(id) {
      const res = await projectApi.getProjectMessages(id)
      this.messages = res.data
    },
    async sendMessage(id, data) {
      const res = await projectApi.sendProjectMessage(id, data)
      this.messages.push(res.data)
    },
    async fetchDevPlan(id) {
      const res = await projectApi.getDevPlan(id)
      this.devPlan = res.data
    },
    async fetchProgress(id) {
      const res = await projectApi.getProgress(id)
      this.progress = res.data
    },
  },
})
```

### 10.3 新增页面

#### `PortalProjects.vue` — 项目列表

```
功能：
  - 展示用户的所有技术服务项目
  - 卡片式列表：项目名 / 状态 / 创建时间 / 最新消息摘要
  - 状态筛选：全部 / 需求沟通 / 开发中 / 待验收 / 已完成
  - 点击进入项目详情
```

#### `PortalProjectDetail.vue` — 项目详情

```
功能：
  - 项目头部：名称 / 状态流程条 / 关键时间节点
  - Tab 切换：需求沟通 / 开发计划 / 开发进度 / 交付验收

  Tab 1 - 需求沟通：
    - 聊天式消息列表（用户 ↔ Agent）
    - 支持文本 + 文件 + 图片
    - 需求确认按钮（锁定需求，进入开发）

  Tab 2 - 开发计划：
    - Agent 生成的开发计划（Markdown 渲染）
    - 任务分解列表（任务名 / 状态 / 预计完成）
    - 资源分配说明

  Tab 3 - 开发进度：
    - 时间线视图（每轮迭代的完成状态）
    - Git 提交历史概要
    - 当前轮次进度条
    - Agent 实时日志（可选）

  Tab 4 - 交付验收：
    - 交付物列表（Git 仓库链接、部署地址等）
    - 验收确认 / 驳回按钮
    - 驳回需填写原因
```

### 10.4 技术服务状态机

```
  创建        需求沟通       需求确认       开发中         待审核
  ──→ [created] ──→ [chatting] ──→ [confirmed] ──→ [developing] ──→ [reviewing]
                                                                       │
                                                         ┌─── 驳回 ────┘
                                                         ↓
                                                    [developing]
                                                         │
                                                    完成所有轮次
                                                         ↓
                                                    [delivered]
                                                         │
                                                    用户验收
                                                         ↓
                                                    [completed]
```

---

## 11. 模块七：实时通信（WebSocket）

### 11.1 新增组合式函数

#### `src/composables/useWebSocket.js`

```js
import { ref, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth'

export function useWebSocket() {
  const ws = ref(null)
  const isConnected = ref(false)
  const listeners = new Map()

  function connect() {
    const auth = useAuthStore()
    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws'
    ws.value = new WebSocket(`${wsUrl}?token=${auth.token}`)

    ws.value.onopen = () => { isConnected.value = true }
    ws.value.onclose = () => {
      isConnected.value = false
      // 自动重连
      setTimeout(connect, 3000)
    }
    ws.value.onmessage = (event) => {
      const data = JSON.parse(event.data)
      const handlers = listeners.get(data.type) || []
      handlers.forEach(fn => fn(data.payload))
    }
  }

  function on(type, handler) {
    if (!listeners.has(type)) listeners.set(type, [])
    listeners.get(type).push(handler)
  }

  function off(type, handler) {
    const handlers = listeners.get(type)
    if (handlers) {
      const idx = handlers.indexOf(handler)
      if (idx > -1) handlers.splice(idx, 1)
    }
  }

  function send(type, payload) {
    if (ws.value?.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify({ type, payload }))
    }
  }

  onUnmounted(() => {
    ws.value?.close()
  })

  return { connect, on, off, send, isConnected }
}
```

### 11.2 WebSocket 消息类型

| type | 方向 | 说明 |
|------|------|------|
| `ticket.message` | S→C | 工单新消息 |
| `ticket.status` | S→C | 工单状态变更 |
| `project.message` | S→C | 项目沟通新消息 |
| `project.status` | S→C | 项目状态变更 |
| `project.progress` | S→C | 开发进度更新 |
| `order.status` | S→C | 订单状态变更 |
| `order.paid` | S→C | 支付成功通知 |
| `queue.update` | S→C | 排队位置更新 |
| `key.ready` | S→C | 卡密已生成 |
| `notification` | S→C | 通用通知 |
| `chat.message` | 双向 | AI 客服消息 |

### 11.3 接入位置

- `PortalLayout.vue` — 登录后建立 WebSocket 连接
- `PortalTicketDetail.vue` — 监听 `ticket.message`、`ticket.status`
- `PortalProjectDetail.vue` — 监听 `project.*` 系列事件
- `PortalQueue.vue` — 监听 `queue.update`
- `PortalOrder.vue` — 监听 `order.paid`（支付结果）

---

## 12. 模块八：通知系统

### 12.1 新增接口

#### `src/api/notification.api.js`

```js
import http from './http'

// 获取通知列表
export const getNotifications = (params) => http.get('/notifications', { params })

// 标记已读
export const markRead = (id) => http.put(`/notifications/${id}/read`)

// 全部已读
export const markAllRead = () => http.put('/notifications/read-all')

// 获取未读数
export const getUnreadCount = () => http.get('/notifications/unread-count')
```

### 12.2 新增 Store

#### `src/stores/notification.js`

```js
import { defineStore } from 'pinia'
import * as notifApi from '@/api/notification.api'

export const useNotificationStore = defineStore('notification', {
  state: () => ({
    items: [],
    unreadCount: 0,
  }),
  actions: {
    async fetchNotifications() {
      const res = await notifApi.getNotifications()
      this.items = res.data
    },
    async fetchUnreadCount() {
      const res = await notifApi.getUnreadCount()
      this.unreadCount = res.count
    },
    // WebSocket 推送新通知时调用
    addNotification(notif) {
      this.items.unshift(notif)
      this.unreadCount++
    },
  },
})
```

### 12.3 页面改造

#### `PortalTopbar.vue`

```
现在：通知铃铛 + 静态红点
改为：
  - 铃铛显示 unreadCount 数字
  - 点击展开通知下拉面板
  - 通知项：图标 + 标题 + 时间 + 已读/未读
  - 点击通知 → 跳转关联页面
  - "全部已读" 按钮
```

---

## 13. 模块九：管理后台入口（新增）

### 13.1 方案选择

两种方案：

**A. 在当前项目中新增 `/admin` 路由**（推荐初期）
- 优点：共享组件和认证逻辑
- 缺点：打包体积增大

**B. 独立新建 admin 项目**（推荐后期）
- 优点：独立部署、权限隔离
- 缺点：需要额外维护

**当前建议：**

- `Phase 6` 先采用方案 A，在当前项目内新增 `/admin` 路由树
- 当后台页面数量明显增多、需要独立部署域名、或权限体系升级为细粒度 RBAC/SSO 时，再拆分为独立 admin 项目

### 13.2 本期建设目标

1. 在不影响现有 `/portal` 用户侧体验的前提下，新增独立的管理后台布局与导航
2. 优先打通运营主链路：`商品 -> 卡密 -> 订单 -> 用户`
3. 仪表盘、工单、项目、系统设置在第一版保留路由与 API 约定，支持后续继续扩展
4. 复用现有 `auth`、`http`、`toast`、`modal`、`usePageStyles`，不复用 `PortalSidebar` / `PortalTopbar` 的视觉和交互

### 13.3 管理后台功能地图（初期在当前项目内实现）

```
/admin
├── /admin/dashboard      # 数据概览（订单量/收入/待处理事项）【MVP】
├── /admin/products       # 商品管理（CRUD/上下架/库存阈值）【MVP】
├── /admin/keys           # 卡密管理（批量导入/库存/使用记录）【MVP】
├── /admin/orders         # 订单管理（筛选/状态流转/退款）【MVP】
├── /admin/tickets        # 工单管理（分配/回复/关闭）【二期】
├── /admin/projects       # 技术服务项目管理（审核/交付/进度）【二期】
├── /admin/users          # 用户管理（角色/封禁/搜索）【MVP】
└── /admin/settings       # 系统设置（闲鱼映射/告警阈值/通知配置）【二期】
```

### 13.4 推荐目录结构

```bash
src/
├── api/
│   └── admin.api.js
├── stores/
│   └── admin.js
├── styles/
│   └── admin.css
├── components/admin/
│   ├── AdminSidebar.vue
│   ├── AdminTopbar.vue
│   ├── AdminStatCard.vue
│   ├── AdminDataTable.vue
│   ├── AdminStatusTag.vue
│   ├── AdminDrawer.vue
│   └── AdminKeyImportModal.vue
└── pages/admin/
    ├── AdminLayout.vue
    ├── AdminDashboard.vue
    ├── AdminProducts.vue
    ├── AdminKeys.vue
    ├── AdminOrders.vue
    ├── AdminTickets.vue
    ├── AdminProjects.vue
    ├── AdminUsers.vue
    └── AdminSettings.vue
```

**结构说明：**

- `AdminLayout.vue` 负责后台壳层，不与 `PortalLayout.vue` 混用
- `components/admin/*` 抽离后台表格、筛选栏、状态标签、导入弹窗等运营组件
- `stores/admin.js` 只保存跨页面共享的筛选条件、统计摘要、loading map；不要把后台所有列表数据继续堆进 `app.js`

### 13.5 页面职责拆分

| 页面 | 核心目标 | 关键操作 | 建议组件 |
|------|----------|----------|----------|
| `AdminDashboard.vue` | 快速掌握经营状态 | 查看今日销售额、待处理工单、低库存商品、最近订单 | `AdminStatCard`、待办列表、趋势图 |
| `AdminProducts.vue` | 维护商品信息 | 新建/编辑商品、上下架、设置库存阈值、查看售卖状态 | `AdminDataTable`、商品表单弹窗 |
| `AdminKeys.vue` | 管理卡密库存 | 批量导入、去重校验、查看可用/已用/过期、按商品筛选 | `AdminKeyImportModal`、库存统计卡 |
| `AdminOrders.vue` | 处理订单流转 | 按状态筛选、手动改状态、发起退款、查看支付信息 | `AdminDataTable`、订单详情抽屉 |
| `AdminTickets.vue` | 协同处理售后 | 分配处理人、管理员回复、关闭工单 | 工单列表、消息面板 |
| `AdminProjects.vue` | 跟踪技术服务交付 | 审核项目、记录交付链接、查看里程碑 | 项目状态面板、交付弹窗 |
| `AdminUsers.vue` | 管理账号与权限 | 搜索用户、改角色、封禁/解封、查看活跃情况 | 用户表格、操作确认弹窗 |
| `AdminSettings.vue` | 配置系统集成 | 闲鱼映射、通知阈值、运营开关 | 配置表单、映射表格 |

### 13.6 路由设计

```js
{
  path: '/admin',
  component: () => import('@/pages/admin/AdminLayout.vue'),
  redirect: '/admin/dashboard',
  meta: { requiresAuth: true, requiresAdmin: true },
  children: [
    {
      path: 'dashboard',
      name: 'admin-dashboard',
      component: () => import('@/pages/admin/AdminDashboard.vue'),
      meta: { title: '数据概览' },
    },
    {
      path: 'products',
      name: 'admin-products',
      component: () => import('@/pages/admin/AdminProducts.vue'),
      meta: { title: '商品管理' },
    },
    {
      path: 'keys',
      name: 'admin-keys',
      component: () => import('@/pages/admin/AdminKeys.vue'),
      meta: { title: '卡密管理' },
    },
    {
      path: 'orders',
      name: 'admin-orders',
      component: () => import('@/pages/admin/AdminOrders.vue'),
      meta: { title: '订单管理' },
    },
    {
      path: 'tickets',
      name: 'admin-tickets',
      component: () => import('@/pages/admin/AdminTickets.vue'),
      meta: { title: '工单管理' },
    },
    {
      path: 'projects',
      name: 'admin-projects',
      component: () => import('@/pages/admin/AdminProjects.vue'),
      meta: { title: '项目管理' },
    },
    {
      path: 'users',
      name: 'admin-users',
      component: () => import('@/pages/admin/AdminUsers.vue'),
      meta: { title: '用户管理' },
    },
    {
      path: 'settings',
      name: 'admin-settings',
      component: () => import('@/pages/admin/AdminSettings.vue'),
      meta: { title: '系统设置' },
    },
  ],
}
```

**实现约束：**

- `/portal` 和 `/admin` 使用两套 layout，避免用户端样式污染后台
- 后台默认桌面优先；移动端至少保证列表浏览和基础操作不崩溃
- 后台顶部栏建议保留“返回前台”入口，方便运营切换

### 13.7 权限与会话约定

`auth.user` 建议从后端 `GET /auth/me` 返回以下结构：

```js
{
  id: 'u_001',
  name: 'Alice',
  email: 'alice@example.com',
  role: 'ADMIN',
  status: 'ACTIVE',
  permissions: [
    'admin.dashboard.read',
    'admin.products.write',
    'admin.orders.write',
  ],
}
```

推荐角色约定：

- `SUPER_ADMIN`：平台超级管理员
- `ADMIN`：常规管理员
- `OPERATOR`：运营/客服，可访问订单、工单、用户
- `SUPPORT`：售后支持，仅访问工单和用户

首版前端可以先做粗粒度判断：

```js
const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN']

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (!auth.user && auth.token) {
    await auth.fetchMe()
  }

  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    return { name: 'landing', query: { openAuth: 'login', redirect: to.fullPath } }
  }

  if (to.meta.requiresAdmin && !ADMIN_ROLES.includes(auth.user?.role)) {
    return { name: 'portal-home' }
  }
})
```

后续如果后端权限细化，可在 `meta.permissions` 中继续追加资源级判断。

### 13.8 API 层与状态组织

`src/api/admin.api.js` 建议作为后台唯一命名空间入口，至少包含以下函数：

- `getDashboard(params)`
- `getProducts(params)` / `createProduct(data)` / `updateProduct(id, data)` / `toggleProduct(id)` / `deleteProduct(id)`
- `getKeys(params)` / `importKeys(data)` / `getKeyStats()`
- `getOrders(params)` / `updateOrderStatus(id, data)` / `refundOrder(id, data)`
- `getTickets(params)` / `assignTicket(id, data)` / `replyTicket(id, data)`
- `getProjects(params)` / `reviewProject(id, data)` / `deliverProject(id, data)`
- `getUsers(params)` / `updateUserRole(id, data)` / `toggleUserBan(id, data)`
- `getSettings()` / `updateSettings(data)`
- `getXianyuMappings(params)` / `createXianyuMapping(data)` / `deleteXianyuMapping(id)`

`stores/admin.js` 只保存“跨页面共享且会复用”的状态，例如：

```js
state: () => ({
  dashboard: null,
  productFilters: { keyword: '', status: 'all', category: 'all' },
  orderFilters: { keyword: '', status: 'all', paymentStatus: 'all' },
  userFilters: { keyword: '', role: 'all', status: 'all' },
  loadingMap: {},
})
```

**建议：**

- 列表数据尽量在对应页面内维护，减少全局 store 膨胀
- 将 `loading`、`pagination`、`keyword`、`status` 作为后台通用表格状态模型统一封装
- `app.js` 继续只承担用户侧 UI 状态，不承接后台业务状态

### 13.9 后台交互规范

1. 所有列表页统一提供 `加载中 / 空状态 / 错误重试 / 分页` 四种状态
2. 商品上下架、退款、封禁用户等危险操作必须二次确认
3. 卡密导入采用弹窗或抽屉，支持多行粘贴、重复值提示、导入结果统计
4. 订单详情、项目交付、工单会话等长内容优先使用右侧抽屉，而不是覆盖全屏的模态框
5. 仪表盘统计卡可点击跳转到对应列表页，并自动带上预设筛选参数

### 13.10 推荐实施顺序

```
Step 1: AdminLayout + admin 路由守卫 + admin.api.js 骨架
Step 2: 商品管理 + 卡密管理（最先形成可运营闭环）
Step 3: 订单管理 + 用户管理
Step 4: 仪表盘首页（汇总前面模块数据）
Step 5: 工单 / 项目 / 系统设置
Step 6: 如需要，再拆分为独立 admin 项目
```

### 13.11 路由守卫补充示例

```js
const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN']

// 管理路由需要 admin 角色
{
  path: '/admin',
  meta: { requiresAuth: true, requiresAdmin: true },
  // ...
}

// 守卫增加角色检查
router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAdmin && !ADMIN_ROLES.includes(auth.user?.role)) {
    return { name: 'portal-home' }
  }
})
```

---

## 14. 状态管理改造

### 14.1 Store 改造清单

| Store | 改造内容 |
|-------|---------|
| `auth.js` | login/register 改 async，增加 fetchMe、token 刷新 |
| `cart.js` | 无需大改，可选同步到后端 |
| `app.js` | orders/tickets/keys 从本地数组改为 API 获取 |
| `notification.js` | 【新增】通知状态 |
| `project.js` | 【新增】技术服务项目状态 |
| `admin.js` | 【新增】后台筛选条件、统计摘要、统一 loading 状态 |

### 14.2 `app.js` 关键改造

```
现在：
  - orders/tickets/keys 直接 push 到本地数组
  - chatHistory 存在内存中

改为：
  - orders → 调用 orderApi.getOrders()，不再本地存储列表
  - tickets → 调用 ticketApi.getTickets()
  - keys → 调用 keyApi.getMyKeys()
  - chatHistory → 调用 chatApi.getChatHistory()
  - 本地只保留 UI 状态（sidebar 开关、modal 开关等）
```

---

## 15. API 层改造规范

### 15.1 统一响应处理

所有 API 函数返回的数据格式与后端统一：

```js
// 成功响应（http.js 拦截器已处理，直接返回 data 部分）
{
  code: 0,
  data: { ... },
  message: 'success'
}

// 错误响应（由 catch 捕获）
{
  code: 40001,
  message: '提取码无效或已过期',
  data: null
}
```

### 15.2 改造文件清单

| 文件 | Mock → Real 改造 |
|------|-----------------|
| `api/auth.api.js` | 6 个函数全部改为 http 调用 |
| `api/product.api.js` | 3 个函数改为 http 调用 |
| `api/order.api.js` | 5 个函数改为 http 调用 |
| `api/key.api.js` | 3 个函数改为 http 调用 |
| `api/ticket.api.js` | 6 个函数改为 http 调用 |
| `api/solution.api.js` | 2 个函数改为 http 调用 |
| `api/payment.api.js` | 【新增】2 个函数 |
| `api/chat.api.js` | 【新增】3 个函数 |
| `api/project.api.js` | 【新增】10 个函数 |
| `api/notification.api.js` | 【新增】4 个函数 |
| `api/admin.api.js` | 【新增】管理后台接口封装 |
| `api/ws.js` | 【新增】WebSocket 管理 |

---

## 16. 路由改造

### 16.1 新增路由

```js
// router/index.js 新增部分

// 卡密提取独立页面（无需登录）
{
  path: '/extract/:code?',
  name: 'extract',
  component: () => import('@/pages/ExtractPage.vue'),
  meta: { requiresAuth: false }
},

// Portal 新增子路由
{
  path: 'projects',
  name: 'portal-projects',
  component: () => import('@/pages/portal/PortalProjects.vue')
},
{
  path: 'projects/:id',
  name: 'portal-project-detail',
  component: () => import('@/pages/portal/PortalProjectDetail.vue')
},
{
  path: 'ticket/:id',
  name: 'portal-ticket-detail',
  component: () => import('@/pages/portal/PortalTicketDetail.vue')
},
{
  path: 'notifications',
  name: 'portal-notifications',
  component: () => import('@/pages/portal/PortalNotifications.vue')
},

// Admin 路由
{
  path: '/admin',
  component: () => import('@/pages/admin/AdminLayout.vue'),
  redirect: '/admin/dashboard',
  meta: { requiresAuth: true, requiresAdmin: true },
  children: [
    {
      path: 'dashboard',
      name: 'admin-dashboard',
      component: () => import('@/pages/admin/AdminDashboard.vue')
    },
    {
      path: 'products',
      name: 'admin-products',
      component: () => import('@/pages/admin/AdminProducts.vue')
    },
    {
      path: 'keys',
      name: 'admin-keys',
      component: () => import('@/pages/admin/AdminKeys.vue')
    },
    {
      path: 'orders',
      name: 'admin-orders',
      component: () => import('@/pages/admin/AdminOrders.vue')
    },
    {
      path: 'tickets',
      name: 'admin-tickets',
      component: () => import('@/pages/admin/AdminTickets.vue')
    },
    {
      path: 'projects',
      name: 'admin-projects',
      component: () => import('@/pages/admin/AdminProjects.vue')
    },
    {
      path: 'users',
      name: 'admin-users',
      component: () => import('@/pages/admin/AdminUsers.vue')
    },
    {
      path: 'settings',
      name: 'admin-settings',
      component: () => import('@/pages/admin/AdminSettings.vue')
    },
  ]
},
```

### 16.2 侧边栏导航更新

`PortalSidebar.vue` 需要新增：

| 导航组 | nav-item | 图标 | 路由 |
|--------|----------|------|------|
| 我的账户 | 技术服务 | `Code` | portal-projects |
| 我的账户 | 通知中心 | `Bell` | portal-notifications |

### 16.3 管理后台导航建议

`AdminSidebar.vue` 建议固定以下导航顺序：

| 导航组 | nav-item | 图标 | 路由 |
|--------|----------|------|------|
| 总览 | 数据概览 | `LayoutDashboard` | admin-dashboard |
| 商品中心 | 商品管理 | `Package` | admin-products |
| 商品中心 | 卡密管理 | `KeyRound` | admin-keys |
| 交易中心 | 订单管理 | `Receipt` | admin-orders |
| 服务中心 | 工单管理 | `MessageSquareMore` | admin-tickets |
| 服务中心 | 项目管理 | `KanbanSquare` | admin-projects |
| 用户中心 | 用户管理 | `Users` | admin-users |
| 系统 | 系统设置 | `Settings` | admin-settings |

---

## 17. 环境变量与部署配置

### 17.1 环境变量

```env
# .env.development
VITE_API_BASE_URL=http://localhost:8000/api
VITE_WS_URL=ws://localhost:8000/ws

# .env.production
VITE_API_BASE_URL=https://api.thousandcliffs.com/api
VITE_WS_URL=wss://api.thousandcliffs.com/ws
```

### 17.2 Vite 代理配置（开发环境）

```js
// vite.config.mjs 增加 proxy
server: {
  port: 48765,
  host: '0.0.0.0',
  proxy: {
    '/api': {
      target: 'http://localhost:8000',
      changeOrigin: true,
    },
    '/ws': {
      target: 'ws://localhost:8000',
      ws: true,
    },
  },
}
```

### 17.3 Docker 部署

现有 `docker-compose.yml` 增加后端服务后，Nginx 同时代理前后端：

```nginx
# docker/nginx.conf 增加
location /api/ {
    proxy_pass http://backend:8000/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}

location /ws {
    proxy_pass http://backend:8000/ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

---

## 18. 开发阶段规划

### Phase 1：基础对接（优先级最高）

> 目标：打通认证 + 商品 + 卡密提取核心链路

- [ ] 改造 `api/http.js`（Token 刷新、错误处理）
- [ ] 改造 `auth.api.js` + `stores/auth.js`
- [ ] 改造 `product.api.js`，商品列表对接后端
- [ ] 改造 `key.api.js`，卡密提取对接后端
- [ ] 新增 `/extract/:code` 独立提取页面
- [ ] 改造 `PortalKeys.vue`
- [ ] 联调测试

### Phase 2：订单与支付

> 目标：完整购买→支付→发货流程

- [ ] 改造 `order.api.js`
- [ ] 新增 `payment.api.js`
- [ ] 新增 `PaymentModal.vue`（支付二维码弹窗）
- [ ] 改造 `PortalOrder.vue`（真实下单+支付）
- [ ] 改造 `PortalQueue.vue`（真实排队数据）
- [ ] 改造 `PortalHistory.vue`

### Phase 3：工单与实时通信

> 目标：工单系统完整可用，支持实时消息

- [ ] 改造 `ticket.api.js`
- [ ] 新增 `useWebSocket.js`
- [ ] 新增 `PortalTicketDetail.vue`
- [ ] WebSocket 连接管理（PortalLayout 层）
- [ ] 改造 `PortalTickets.vue`

### Phase 4：技术服务模块

> 目标：技术服务订单全生命周期

- [ ] 新增 `project.api.js` + `stores/project.js`
- [ ] 新增 `PortalProjects.vue`
- [ ] 新增 `PortalProjectDetail.vue`（需求沟通 + 进度 + 验收）
- [ ] 侧边栏新增「技术服务」入口
- [ ] OpenClaw Agent 消息对接

### Phase 5：AI 客服 + 通知

> 目标：AI 客服对接真实 LLM，通知系统上线

- [ ] 新增 `chat.api.js`
- [ ] 改造 `PortalAiService.vue`（SSE 流式响应）
- [ ] 新增 `notification.api.js` + `stores/notification.js`
- [ ] 改造 `PortalTopbar.vue`（通知下拉面板）
- [ ] 新增 `PortalNotifications.vue`

### Phase 6：管理后台（可选）

> 目标：完成运营后台 MVP，先打通“商品 + 卡密 + 订单 + 用户”四条后台主链路，再扩展到工单、项目和系统设置

#### Phase 6.1：后台基础骨架

- [ ] 新增 `/admin` 路由树和 `AdminLayout.vue`
- [ ] 新增 `pages/admin/AdminDashboard.vue`
- [ ] 新增 `styles/admin.css`
- [ ] 新增 `components/admin/*` 通用后台组件
- [ ] 扩展 `auth.js` 支持管理员角色判断
- [ ] 登录态恢复后支持直接访问 `/admin/*`

#### Phase 6.2：商品与卡密管理

- [ ] 新增 `api/admin.api.js`
- [ ] 新增 `pages/admin/AdminProducts.vue`
- [ ] 新增 `pages/admin/AdminKeys.vue`
- [ ] 商品 CRUD、上下架、库存阈值配置
- [ ] 卡密批量导入、去重校验、库存统计

#### Phase 6.3：订单与用户管理

- [ ] 新增 `pages/admin/AdminOrders.vue`
- [ ] 新增 `pages/admin/AdminUsers.vue`
- [ ] 订单筛选、状态流转、退款操作
- [ ] 用户角色调整、封禁/解封

#### Phase 6.4：二期扩展

- [ ] 新增 `pages/admin/AdminTickets.vue`
- [ ] 新增 `pages/admin/AdminProjects.vue`
- [ ] 新增 `pages/admin/AdminSettings.vue`
- [ ] 闲鱼映射和系统配置面板
- [ ] 审计日志/操作留痕（依赖后端提供）

---

*文档版本：v1.0 | 基于现有前端代码 + 业务需求分析生成*
 
