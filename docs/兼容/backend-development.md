# ThousandCliffs-AI 后端开发文档

> 从零构建，支撑自动化发卡 + 技术服务的全链路后端系统
>
> 2026-03 架构更新：后端实现正式固定为 `uv + Python 3.12 + FastAPI`。本文中少量历史遗留的 `.js`/Node 风格片段仅保留业务流程含义，不再作为脚手架依据；项目结构、部署方式、任务调度、模型迁移均以下文的 Python 方案为准。

---

## 目录

1. [系统架构总览](#1-系统架构总览)
2. [技术选型](#2-技术选型)
3. [项目结构](#3-项目结构)
4. [数据库设计](#4-数据库设计)
5. [模块一：认证与用户系统](#5-模块一认证与用户系统)
6. [模块二：商品管理系统](#6-模块二商品管理系统)
7. [模块三：卡密管理系统](#7-模块三卡密管理系统)
8. [模块四：订单与支付系统](#8-模块四订单与支付系统)
9. [模块五：工单系统](#9-模块五工单系统)
10. [模块六：技术服务项目系统](#10-模块六技术服务项目系统)
11. [模块七：闲鱼平台对接](#11-模块七闲鱼平台对接)
12. [模块八：OpenClaw Agent 对接](#12-模块八openclaw-agent-对接)
13. [模块九：本地 LLM 调度对接](#13-模块九本地-llm-调度对接)
14. [模块十：AI 客服系统](#14-模块十ai-客服系统)
15. [模块十一：通知系统](#15-模块十一通知系统)
16. [模块十二：WebSocket 实时通信](#16-模块十二websocket-实时通信)
17. [模块十三：文件存储服务](#17-模块十三文件存储服务)
18. [安全设计](#18-安全设计)
19. [部署架构](#19-部署架构)
20. [开发阶段规划](#20-开发阶段规划)

---

## 1. 系统架构总览

```
                         ┌────────────────────────────┐
                         │       闲鱼开放平台           │
                         │  订单API / 消息Bot API       │
                         └──────────┬─────────────────┘
                                    │ Webhook / 轮询
                                    ↓
┌──────────┐  HTTP/gRPC  ┌──────────────────────────────────────────┐
│  本地 PC   │ ←────────→ │              后端服务 (本文档)              │
│ 蒸馏 LLM  │            │                                          │
│ 工单分类   │            │  ┌──────────┐  ┌──────────┐  ┌────────┐ │
└──────────┘            │  │ API 网关   │  │ 业务服务   │  │ 任务队列│ │
                         │  │ (Nginx)   │  │ (FastAPI) │  │(Redis) │ │
┌──────────┐  HTTP/WS   │  └──────────┘  └──────────┘  └────────┘ │
│  Web 前端  │ ←────────→ │                                          │
│ (Vue3)    │            │  ┌──────────┐  ┌──────────┐  ┌────────┐ │
└──────────┘            │  │ WebSocket │  │ 定时任务   │  │ 文件存储│ │
                         │  │  Server   │  │ (Cron)    │  │(MinIO) │ │
┌──────────┐  HTTP/gRPC  │  └──────────┘  └──────────┘  └────────┘ │
│ OpenClaw  │ ←────────→ │                                          │
│ Agent集群  │            └──────────────────────┬─────────────────┘
└──────────┘                                    │
                                    ┌───────────┴──────────┐
                                    │                      │
                              ┌─────────┐           ┌──────────┐
                              │PostgreSQL│           │  Redis    │
                              │ (主数据库) │           │ (缓存/队列)│
                              └─────────┘           └──────────┘
```

### 核心数据流

**资源类订单链路：**
```
闲鱼下单 → 后端接收订单 Webhook → 匹配商品类型(资源类)
→ 生成提取码 → 通过闲鱼 Bot 发送提取链接给买家
→ 买家访问 Web → 输入提取码 → 后端验证 → 分配卡密 → 返回卡密
→ 标记卡密已使用 → 订单完成
```

**技术服务订单链路：**
```
闲鱼下单 → 后端接收订单 Webhook → 匹配商品类型(技术服务)
→ 推送订单信息到本地 LLM → LLM 分析需求+分类 → 创建工单
→ 派发到 OpenClaw Agent → Agent 分析需求 → 更新工单到 Web
→ 用户在 Web 端深度沟通需求 → 确认需求
→ 提交到云端 Agent → Agent 制定开发计划 → 分配任务 → 创建 Git 仓库
→ 执行 1-3 轮开发迭代 → 向管理员发送完成消息
→ 管理员从 GitHub 拉取微调 → 交付用户 → 用户验收 → 完成
```

---

## 2. 技术选型

### 主技术栈

| 层面 | 技术 | 理由 |
|------|------|------|
| **运行时 / 包管理** | Python 3.12 + uv | `uv` 负责虚拟环境、依赖解析与命令执行，冷启动快，适合容器化 |
| **框架** | FastAPI | 原生 async，自动生成 OpenAPI，适合前后端契约协作 |
| **数据库** | PostgreSQL 16 | 关系型数据库，JSON 字段支持，适合复杂业务 |
| **ORM** | SQLAlchemy 2.0 | Python 主流 ORM，适合复杂关系与事务控制 |
| **数据库迁移** | Alembic | 与 SQLAlchemy 配套，适合渐进式迁移 |
| **缓存/队列** | Redis 7 | 缓存热数据 + Celery Broker / Result Backend |
| **任务队列** | Celery | 支持延迟任务、重试、定时任务、独立 Worker 部署 |
| **WebSocket** | FastAPI WebSocket / Starlette | 与 HTTP 路由共享依赖注入和认证上下文 |
| **数据校验** | Pydantic v2 | 请求响应模型、配置管理、字段约束统一 |
| **认证** | JWT (RS256) | 无状态认证，支持 Token 刷新 |
| **文件存储** | MinIO / 本地文件 | 兼容 S3 协议，可自托管 |
| **日志** | structlog + Uvicorn logging | 结构化日志，适合 API / Worker 统一观测 |
| **进程管理** | Uvicorn / Gunicorn / 容器编排 | 容器优先，适合拆分 API、Worker、Beat |

### 辅助工具

| 工具 | 用途 |
|------|------|
| Docker Compose | 本地开发环境编排 |
| Nginx | 反向代理、SSL 终止、静态文件 |
| GitHub API | Git 仓库管理（技术服务项目） |
| aiosmtplib / FastAPI-Mail | 邮件发送 |
| APScheduler / Celery Beat | 定时任务（订单超时、状态检查） |

---

## 3. 项目结构

```
thousandcliffs-api/
│
├── pyproject.toml               # uv / 项目依赖配置
├── uv.lock                      # 依赖锁文件
├── alembic/
│   ├── env.py                   # Alembic 环境
│   └── versions/                # 数据库迁移文件
│
├── app/
│   ├── main.py                  # FastAPI 入口
│   │
│   ├── core/
│   │   ├── config.py            # Settings / 环境变量
│   │   ├── security.py          # JWT / 密码哈希
│   │   ├── logging.py           # structlog / 日志配置
│   │   └── deps.py              # 通用依赖注入
│   │
│   ├── db/
│   │   ├── session.py           # SQLAlchemy Session / AsyncSession
│   │   ├── base.py              # Declarative Base
│   │   └── models/              # ORM 模型
│   │       ├── user.py
│   │       ├── product.py
│   │       ├── order.py
│   │       ├── ticket.py
│   │       └── ...
│   │
│   ├── schemas/                 # Pydantic v2 请求/响应模型
│   │   ├── auth.py
│   │   ├── product.py
│   │   ├── order.py
│   │   ├── admin.py
│   │   └── ...
│   │
│   ├── api/
│   │   ├── router.py            # 顶层 APIRouter
│   │   └── v1/
│   │       ├── auth.py
│   │       ├── users.py
│   │       ├── products.py
│   │       ├── keys.py
│   │       ├── orders.py
│   │       ├── tickets.py
│   │       ├── projects.py
│   │       ├── chat.py
│   │       ├── notifications.py
│   │       ├── admin.py
│   │       ├── xianyu.py
│   │       └── agent.py
│   │
│   ├── services/                # 业务编排层
│   │   ├── auth_service.py
│   │   ├── order_service.py
│   │   ├── key_service.py
│   │   ├── admin_service.py
│   │   └── ...
│   │
│   ├── repositories/            # 数据访问层
│   │   ├── user_repo.py
│   │   ├── order_repo.py
│   │   └── ...
│   │
│   ├── clients/                 # 第三方系统客户端
│   │   ├── xianyu_client.py
│   │   ├── agent_client.py
│   │   ├── llm_client.py
│   │   └── storage_client.py
│   │
│   ├── workers/
│   │   ├── celery_app.py        # Celery 实例
│   │   ├── beat_schedule.py     # 定时任务配置
│   │   └── tasks/
│   │       ├── order_timeout.py
│   │       ├── key_assign.py
│   │       ├── xianyu_sync.py
│   │       ├── agent_dispatch.py
│   │       └── notification.py
│   │
│   ├── ws/
│   │   ├── manager.py           # WebSocket 连接管理
│   │   ├── auth.py              # WebSocket 认证
│   │   └── handlers/
│   │       ├── ticket.py
│   │       ├── project.py
│   │       ├── chat.py
│   │       └── queue.py
│   │
│   └── utils/
│       ├── response.py          # 统一响应格式
│       ├── errors.py            # 自定义错误类
│       ├── id_generator.py      # ID 生成（订单号/工单号/提取码）
│       ├── crypto.py            # 加密工具
│       └── email.py             # 邮件发送
│
├── tests/                       # pytest / 集成测试
├── docker-compose.yml           # 开发环境（PG + Redis + MinIO）
├── Dockerfile                   # 生产镜像
└── .env.example                 # 环境变量模板
```

### 3.1 分层约定

- `api/` 只负责 HTTP / WebSocket 路由入口与依赖注入，不直接编写复杂业务逻辑
- `services/` 负责业务编排、事务边界、外部系统调用
- `repositories/` 负责数据库访问，便于测试与后续替换
- `schemas/` 统一维护请求响应结构，直接服务于 FastAPI OpenAPI 文档
- `workers/` 处理异步任务，避免把耗时流程塞进请求链路

---

## 4. 数据库设计

### 4.1 ER 关系图

```
                        ┌──────────┐
                        │  users   │
                        └────┬─────┘
                 ┌───────────┼───────────┬──────────────┐
                 ↓           ↓           ↓              ↓
           ┌──────────┐ ┌────────┐ ┌──────────┐  ┌───────────┐
           │  orders   │ │tickets │ │ projects │  │notifications│
           └────┬─────┘ └───┬────┘ └────┬─────┘  └───────────┘
                │            │           │
                ↓            ↓           ↓
          ┌──────────┐ ┌──────────┐ ┌──────────┐
          │order_items│ │ticket_   │ │project_  │
          └────┬─────┘ │messages  │ │messages  │
               │        └──────────┘ └──────────┘
               ↓
          ┌──────────┐      ┌──────────┐
          │key_records│ ←── │ key_pool  │
          └──────────┘      └────┬─────┘
                                 │
                            ┌────┴─────┐
                            │ products │
                            └──────────┘
```

### 4.2 SQLAlchemy 2.0 + Alembic 约定

后端不再使用 Prisma。数据库逻辑模型保持不变，但落地实现统一为：

- `app/db/models/*.py`：SQLAlchemy 2.0 Declarative ORM 模型
- `app/schemas/*.py`：Pydantic v2 请求/响应 DTO
- `alembic/versions/*.py`：数据库迁移脚本
- `Decimal / Enum / JSONB / UUID / TIMESTAMP WITH TIME ZONE` 由 PostgreSQL 原生类型承接

推荐的模型拆分如下：

| 逻辑实体 | Python 模型文件 | 说明 |
|----------|-----------------|------|
| 用户 / RefreshToken | `app/db/models/user.py` | 用户资料、推荐关系、刷新令牌 |
| 商品 / 闲鱼映射 / 优惠码 | `app/db/models/product.py` | 商品、映射、优惠码 |
| 订单 / 订单项 / 支付 | `app/db/models/order.py` | 下单、支付、状态流转 |
| 卡密池 / 提取记录 | `app/db/models/key.py` | 卡密导入、分配、提取 |
| 工单 / 工单消息 | `app/db/models/ticket.py` | 售后会话与分配 |
| 项目 / 进度 / 消息 | `app/db/models/project.py` | 技术服务交付链路 |
| AI 客服会话 | `app/db/models/chat.py` | 聊天 Session 与消息 |
| 通知 | `app/db/models/notification.py` | 站内消息 |

示例写法：

```py
from datetime import datetime
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    name: Mapped[str] = mapped_column(String(64))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(
        Enum("USER", "ADMIN", "SUPER_ADMIN", "OPERATOR", "SUPPORT", name="user_role"),
        default="USER",
    )
    avatar: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    referral_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    referred_by: Mapped[str | None] = mapped_column(String(32), nullable=True)
    balance: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"))
    total_spent: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Product(Base):
    __tablename__ = "products"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(255), index=True)
    category: Mapped[str] = mapped_column(
        Enum("AI_TOOL", "ACCOUNT", "CUSTOM", "SERVICE", name="product_category")
    )
    type: Mapped[str] = mapped_column(Enum("RESOURCE", "SERVICE", name="product_type"))
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    original_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    stock: Mapped[int] = mapped_column(default=0)
    description: Mapped[str] = mapped_column(Text)
    features: Mapped[dict | list] = mapped_column(JSONB, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    order_no: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    type: Mapped[str] = mapped_column(Enum("RESOURCE", "SERVICE", name="order_type"))
    status: Mapped[str] = mapped_column(
        Enum("PENDING", "PAID", "PROCESSING", "DELIVERING", "COMPLETED", "CANCELLED", "REFUNDING", "REFUNDED", name="order_status"),
        default="PENDING",
    )
    paid_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"))
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", lazy="joined")
```

实施约定：

1. 数据表、字段名、枚举值优先与 [api-reference.md](./api-reference.md) 保持一致  
2. 数据迁移只通过 Alembic 提交，不再维护 Prisma Schema  
3. 涉及金额、库存、卡密分配的流程必须使用数据库事务  
4. 后端 DTO 的命名可使用 snake_case，但对外 API 建议统一转成 camelCase 或在 OpenAPI 中明确声明

---

## 5. 模块一：认证与用户系统

### 5.1 功能清单

- 邮箱+密码注册
- 邮箱+密码登录
- JWT 双 Token 机制（Access Token 15min + Refresh Token 7d）
- 获取当前用户信息
- 修改密码
- 忘记密码（邮箱验证码重置）
- 退出登录（使 Refresh Token 失效）

### 5.2 核心逻辑

#### 注册流程

```
1. 接收 { name, email, password, phone?, referralCode? }
2. 校验邮箱唯一性
3. bcrypt 哈希密码（cost=12）
4. 创建用户记录
5. 生成推荐码
6. 如有推荐人，记录推荐关系
7. 签发 AccessToken + RefreshToken
8. 返回 { user, token, refreshToken }
```

#### 登录流程

```
1. 接收 { email, password }
2. 查询用户
3. bcrypt.compare 校验密码
4. 签发 AccessToken(15min) + RefreshToken(7d)
5. 记录登录时间
6. 返回 { user, token, refreshToken }
```

#### Token 刷新流程

```
1. 接收 { refreshToken }
2. 验证 refreshToken 有效性（数据库查询 + 未过期）
3. 删除旧 refreshToken
4. 签发新的 AccessToken + RefreshToken
5. 返回 { token, refreshToken }
```

### 5.3 密码安全

```py
# app/core/security.py
from datetime import datetime, timedelta, timezone

from jose import jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def sign_access_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
    }
    return jwt.encode(payload, settings.jwt_private_key, algorithm="RS256")


def sign_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, settings.jwt_private_key, algorithm="RS256")


def verify_access_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_public_key, algorithms=["RS256"])
```

---

## 6. 模块二：商品管理系统

### 6.1 功能清单

- 商品 CRUD（管理员）
- 商品列表查询（分类筛选、分页、搜索）
- 商品详情查询
- 商品分类管理
- 商品上下架
- 库存管理（自动减库存）
- 闲鱼商品映射管理

### 6.2 核心逻辑

#### 商品列表查询

```
1. 接收 { category?, keyword?, page, pageSize }
2. 构建 SQLAlchemy 查询条件（`is_active=True` + 分类 + `ilike` 关键词模糊搜索）
3. 分页查询 + 总数统计
4. 返回 { data: [...], total, page, pageSize }
```

#### 库存扣减

```
使用数据库事务 + 乐观锁：
1. BEGIN TRANSACTION
2. SELECT stock FROM products WHERE id = ? AND stock >= quantity FOR UPDATE
3. UPDATE products SET stock = stock - quantity WHERE id = ?
4. COMMIT
如果 stock 不足，回滚并返回错误
```

---

## 7. 模块三：卡密管理系统

### 7.1 功能清单

- 卡密批量导入（管理员，支持 CSV/文本批量）
- 卡密池查看（管理员）
- 卡密分配（订单支付后自动分配）
- 卡密提取（用户通过提取码获取）
- 提取码生成与校验
- 卡密加密存储

### 7.2 核心逻辑

#### 卡密批量导入

```
1. 管理员上传文件或粘贴文本
2. 解析每行为一条卡密
3. 关联商品 ID + 批次号
4. 批量 INSERT 到 key_pool 表
5. 更新商品 stock 字段
```

#### 卡密提取流程（核心链路）

```
1. 用户输入提取码 + 邮箱（可选）
2. 查询 key_records 表，找到匹配的提取码
3. 校验：
   - 提取码存在
   - 状态为 "已提取"（已关联卡密）
   - 未过期
4. 返回卡密值
5. 记录提取日志

或者首次提取：
1. 用户输入订单号
2. 查询订单 → 查询订单商品 → 从 key_pool 分配可用卡密
3. 锁定卡密（status → LOCKED）
4. 生成提取码
5. 创建 key_record
6. 更新卡密状态（LOCKED → USED）
7. 返回卡密值
```

#### 卡密加密

```js
// 卡密值使用 AES-256-GCM 加密存储
import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY = Buffer.from(config.KEY_ENCRYPTION_KEY, 'hex') // 32 bytes

export function encryptKey(plainText) {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv)
  let encrypted = cipher.update(plainText, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag().toString('hex')
  return `${iv.toString('hex')}:${authTag}:${encrypted}`
}

export function decryptKey(encrypted) {
  const [ivHex, authTagHex, data] = encrypted.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv)
  decipher.setAuthTag(authTag)
  let decrypted = decipher.update(data, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}
```

### 7.3 提取码生成规则

```js
// 格式：TC-XXXX-XXXX（8位随机字母数字）
function generateExtractCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 去掉容易混淆的 I/O/0/1
  let code = 'TC-'
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-'
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}
```

---

## 8. 模块四：订单与支付系统

### 8.1 订单功能清单

- 创建订单（前端下单 / 闲鱼同步）
- 订单列表查询
- 订单详情
- 订单取消（未支付）
- 订单退款申请
- 订单状态流转

### 8.2 订单状态机

```
                创建
                 ↓
            [PENDING] ──── 超时 ──→ [CANCELLED]
                 │
              支付成功
                 ↓
              [PAID]
                 │
        ┌────────┴────────┐
    资源类订单          技术服务订单
        ↓                    ↓
  [PROCESSING]          [PROCESSING]
    分配卡密              创建项目
        ↓                    ↓
  [DELIVERING]          等待项目完成
    生成提取码                ↓
        ↓              [COMPLETED]
  [COMPLETED]
```

### 8.3 订单号生成

```js
// 格式：NX-YYYYMMDD-XXXXX（年月日 + 5位序列号）
// 使用 Redis INCR 保证序列号唯一
async function generateOrderNo(redis) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const key = `order:seq:${date}`
  const seq = await redis.incr(key)
  await redis.expire(key, 86400 * 2) // 2天过期
  return `NX-${date}-${String(seq).padStart(5, '0')}`
}
```

### 8.4 支付对接

#### 支付流程

```
1. 前端调用 POST /payments/create { orderId, method }
2. 后端根据 method 调用对应支付渠道 SDK
3. 生成支付链接/二维码
4. 设置支付过期时间（15分钟）
5. 返回 { payUrl, qrCode, expireAt }
6. 前端展示支付弹窗
7. 用户完成支付
8. 支付渠道回调 POST /payments/callback/{method}
9. 验证回调签名
10. 更新订单状态为 PAID
11. 触发后续流程（卡密分配或项目创建）
12. WebSocket 通知前端支付成功
```

#### 支付渠道抽象

```js
// src/modules/payment/providers/base.js
export class PaymentProvider {
  // 创建支付
  async createPayment(order, amount) { throw new Error('Not implemented') }

  // 验证回调
  async verifyCallback(rawBody, headers) { throw new Error('Not implemented') }

  // 查询支付状态
  async queryStatus(tradeNo) { throw new Error('Not implemented') }

  // 发起退款
  async refund(tradeNo, amount) { throw new Error('Not implemented') }
}
```

### 8.5 优惠码验证

```
1. 接收 { code }
2. 查询 promo_codes 表
3. 校验：
   - code 存在且 isActive
   - 未过期
   - 未超过最大使用次数
4. 返回 { valid, discountType, discountValue }
```

---

## 9. 模块五：工单系统

### 9.1 功能清单

- 创建工单（用户手动 / AI 客服转人工 / 系统自动）
- 工单列表（按状态筛选）
- 工单详情
- 工单消息（用户 ↔ 客服/Agent 实时消息）
- 工单状态流转
- 工单关闭
- 附件上传

### 9.2 工单状态机

```
创建                     客服回复
 ↓                         ↓
[OPEN] ──→ [PROCESSING] ──→ [REPLIED]
                               │
                          用户回复 ↓
                         [PROCESSING]
                               │
                          解决关闭 ↓
                           [CLOSED]
```

### 9.3 核心逻辑

#### 发送工单消息

```
1. 接收 { ticketId, content, attachments? }
2. 校验用户有权访问该工单
3. 创建 TicketMessage 记录
4. 如果发送者是用户且工单状态为 REPLIED，更新为 PROCESSING
5. 如果发送者是客服/Agent，更新为 REPLIED
6. 通过 WebSocket 推送消息给对方
7. 创建通知
```

---

## 10. 模块六：技术服务项目系统

这是整个后端最复杂的模块，串联了闲鱼、本地 LLM、OpenClaw Agent 和前端。

### 10.1 功能清单

- 项目创建（闲鱼订单触发 / 手动创建）
- 需求沟通（消息+文件）
- 需求确认（锁定需求，进入开发）
- 开发计划展示（Agent 生成）
- 开发进度追踪
- Git 仓库管理
- 交付与验收
- 项目消息实时推送

### 10.2 项目生命周期

```
┌──────────────────────────────────────────────────────────────────┐
│                     技术服务项目完整生命周期                        │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. 闲鱼下单 → 后端接收订单                                       │
│     ↓                                                            │
│  2. 推送到本地 LLM → 分析需求 → 分类 → 创建工单/项目                │
│     ↓                                                            │
│  3. 派发到 OpenClaw Agent → Agent 初步分析需求                     │
│     ↓                                                            │
│  4. 更新项目信息到 Web → 用户可在 Web 端查看                        │
│     ↓                                                            │
│  5. 用户在 Web 端与 Agent 深度沟通需求（消息+文件）                  │
│     ↓                                                            │
│  6. 需求确认 → 用户点击"确认需求"按钮                               │
│     ↓                                                            │
│  7. 提交到云端 Agent → Agent 制定开发计划                           │
│     ↓                                                            │
│  8. 开发计划展示给用户 → 用户可查看                                 │
│     ↓                                                            │
│  9. Agent 执行开发：                                               │
│     - 创建 Git 仓库                                               │
│     - 分配任务                                                    │
│     - 逐步完成开发                                                │
│     - 每完成一步更新进度                                           │
│     ↓                                                            │
│ 10. 1-3 轮开发迭代完成                                            │
│     ↓                                                            │
│ 11. Agent 向管理员发送完成消息                                     │
│     ↓                                                            │
│ 12. 管理员从 GitHub 拉取代码                                      │
│     ↓                                                            │
│ 13. 管理员微调/审核 → 标记可交付                                   │
│     ↓                                                            │
│ 14. 交付给用户（Git 仓库 + 部署地址）                              │
│     ↓                                                            │
│ 15. 用户验收 → 确认完成 / 驳回修改                                 │
│     ↓                                                            │
│ 16. 完成                                                         │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 10.3 核心接口逻辑

#### 创建项目（由闲鱼订单触发）

```
1. 闲鱼订单 Webhook 到达
2. 匹配商品类型为 SERVICE
3. 创建 Order 记录
4. 创建 Project 记录，关联 Order
5. 推送订单信息到本地 LLM（通过 HTTP API）
6. 等待 LLM 返回分类结果
7. 更新 Project category
8. 调用 OpenClaw Agent API 创建分析任务
9. Agent 分析结果通过回调更新到 Project
10. 通知用户（闲鱼 Bot + 站内通知）
```

#### 需求确认

```
1. 用户在前端点击"确认需求"
2. POST /projects/:id/confirm { requirement }
3. 校验项目状态为 CHATTING
4. 更新状态为 CONFIRMED
5. 保存 requirement JSON
6. 触发 Celery 任务：派发到 OpenClaw Agent 开始规划
7. 通知管理员
```

#### 进度更新（Agent 回调）

```
1. Agent 完成一个步骤后回调 POST /agent/callback/progress
2. 创建 ProjectProgress 记录
3. 更新 Project 的 currentRound
4. 通过 WebSocket 推送给用户
5. 如果所有轮次完成，通知管理员审核
```

---

## 11. 模块七：闲鱼平台对接

### 11.1 对接方式

闲鱼（作为阿里系平台）的商家 API 对接方式：

1. **订单获取**：通过闲鱼开放平台 API / 淘宝开放平台的相关接口轮询获取新订单
2. **消息推送**：通过闲鱼客服 Bot 接口向买家发送消息
3. **Webhook**：如果平台支持，配置订单变更回调

### 11.2 核心逻辑

#### 订单同步定时任务

```js
// src/jobs/xianyu-sync.job.js
// 每 30 秒轮询一次闲鱼新订单

async function syncXianyuOrders() {
  // 1. 调用闲鱼 API 获取最近的未处理订单
  const orders = await xianyuClient.getNewOrders()

  for (const xianyuOrder of orders) {
    // 2. 检查是否已同步
    const existing = await prisma.order.findUnique({
      where: { xianyuOrderId: xianyuOrder.orderId }
    })
    if (existing) continue

    // 3. 匹配本地商品
    const mapping = await prisma.xianyuProductMapping.findUnique({
      where: { xianyuItemId: xianyuOrder.itemId },
      include: { product: true }
    })
    if (!mapping) {
      log.warn(`闲鱼商品 ${xianyuOrder.itemId} 未映射`)
      continue
    }

    // 4. 根据商品类型走不同链路
    if (mapping.product.type === 'RESOURCE') {
      await handleResourceOrder(xianyuOrder, mapping.product)
    } else {
      await handleServiceOrder(xianyuOrder, mapping.product)
    }
  }
}
```

#### 资源类订单处理

```js
async function handleResourceOrder(xianyuOrder, product) {
  // 1. 创建内部订单
  const order = await orderService.createFromXianyu(xianyuOrder, product)

  // 2. 标记已支付（闲鱼平台担保交易）
  await orderService.markPaid(order.id)

  // 3. 分配卡密 + 生成提取码
  const keyRecord = await keyService.assignKey(order.id, product.id)

  // 4. 通过闲鱼 Bot 发送提取链接
  const extractUrl = `${config.WEB_URL}/extract/${keyRecord.extractCode}`
  await xianyuBot.sendMessage(xianyuOrder.buyerId, {
    text: `您好，您购买的「${product.name}」已准备就绪！\n\n` +
          `请点击以下链接提取：\n${extractUrl}\n\n` +
          `提取码：${keyRecord.extractCode}\n` +
          `如有问题请随时联系我们。`
  })

  // 5. 更新订单状态
  await orderService.updateStatus(order.id, 'DELIVERING')
}
```

#### 技术服务订单处理

```js
async function handleServiceOrder(xianyuOrder, product) {
  // 1. 创建内部订单
  const order = await orderService.createFromXianyu(xianyuOrder, product)
  await orderService.markPaid(order.id)

  // 2. 创建项目
  const project = await projectService.create({
    orderId: order.id,
    title: xianyuOrder.itemTitle,
    description: xianyuOrder.buyerMessage,  // 买家留言作为初始需求
    xianyuOrderId: xianyuOrder.orderId,
  })

  // 3. 推送到本地 LLM 进行需求分析和分类
  await localLlmQueue.add('analyze-requirement', {
    projectId: project.id,
    orderInfo: xianyuOrder,
    requirement: xianyuOrder.buyerMessage,
  })

  // 4. 通过闲鱼 Bot 引导用户到 Web 端
  const projectUrl = `${config.WEB_URL}/portal/projects/${project.id}`
  await xianyuBot.sendMessage(xianyuOrder.buyerId, {
    text: `您好，您的技术服务订单已收到！\n\n` +
          `为了更好地了解您的需求，请访问我们的服务平台进行详细沟通：\n` +
          `${projectUrl}\n\n` +
          `注册账号后即可查看项目详情并与我们的AI助手深度沟通需求。`
  })
}
```

### 11.3 闲鱼 Bot 消息发送

```js
// src/modules/xianyu/xianyu.bot.js

class XianyuBot {
  constructor(config) {
    this.appKey = config.XIANYU_APP_KEY
    this.appSecret = config.XIANYU_APP_SECRET
    this.accessToken = null
  }

  // 发送文本消息
  async sendMessage(buyerId, message) {
    await this.ensureToken()
    // 调用闲鱼/淘宝客服消息 API
    // 具体实现取决于闲鱼开放平台的 API 规范
  }

  // 发送卡片消息（带链接的富文本卡片）
  async sendCard(buyerId, card) {
    // 如果支持卡片消息格式
  }

  // Token 管理
  async ensureToken() {
    if (!this.accessToken || this.isTokenExpired()) {
      await this.refreshAccessToken()
    }
  }
}
```

---

## 12. 模块八：OpenClaw Agent 对接

### 12.1 对接架构

```
后端服务 ──HTTP──→ OpenClaw API Server
                       │
                  任务分发
                       │
              ┌────────┼────────┐
              ↓        ↓        ↓
           Agent1   Agent2   Agent3
           (分析)   (开发)   (测试)
              │        │        │
              └────────┼────────┘
                       │
                  回调通知
                       ↓
后端服务 ←─HTTP──── OpenClaw Callback
```

### 12.2 Agent 客户端

```js
// src/modules/agent/agent.client.js

class AgentClient {
  constructor(config) {
    this.baseUrl = config.OPENCLAW_API_URL
    this.apiKey = config.OPENCLAW_API_KEY
  }

  // 创建需求分析任务
  async createAnalysisTask(projectId, requirement) {
    return this.request('POST', '/tasks', {
      type: 'requirement_analysis',
      projectId,
      input: { requirement },
      callbackUrl: `${config.API_URL}/agent/callback/analysis`,
    })
  }

  // 创建开发计划任务
  async createPlanningTask(projectId, requirement) {
    return this.request('POST', '/tasks', {
      type: 'development_planning',
      projectId,
      input: { requirement },
      callbackUrl: `${config.API_URL}/agent/callback/plan`,
    })
  }

  // 创建开发执行任务
  async createDevelopmentTask(projectId, plan) {
    return this.request('POST', '/tasks', {
      type: 'development_execution',
      projectId,
      input: { plan },
      callbackUrl: `${config.API_URL}/agent/callback/progress`,
    })
  }

  // 查询任务状态
  async getTaskStatus(taskId) {
    return this.request('GET', `/tasks/${taskId}`)
  }

  // 发送消息给 Agent（需求沟通场景）
  async sendMessage(taskId, message) {
    return this.request('POST', `/tasks/${taskId}/messages`, { message })
  }

  async request(method, path, data) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: data ? JSON.stringify(data) : undefined,
    })
    return response.json()
  }
}
```

### 12.3 Agent 回调接收

```js
// src/modules/agent/agent.routes.js

async function agentRoutes(fastify) {
  // 需求分析完成回调
  fastify.post('/agent/callback/analysis', async (request) => {
    const { projectId, result } = request.body
    // result: { category, summary, complexity, estimatedRounds }

    await projectService.updateAnalysis(projectId, result)

    // 通知用户分析完成
    await notificationService.create({
      userId: project.userId,
      type: 'project',
      title: '需求分析完成',
      content: `您的项目「${project.title}」需求分析已完成，请查看并开始沟通需求。`,
      link: `/portal/projects/${projectId}`,
    })

    // WebSocket 推送
    wsManager.sendToUser(project.userId, {
      type: 'project.status',
      payload: { projectId, status: 'CHATTING' },
    })
  })

  // 开发计划完成回调
  fastify.post('/agent/callback/plan', async (request) => {
    const { projectId, plan } = request.body
    // plan: { overview, tasks: [{name, description, estimatedTime}], resources, timeline }

    await projectService.updatePlan(projectId, plan)
    // 通知用户 + WebSocket 推送
  })

  // 开发进度回调
  fastify.post('/agent/callback/progress', async (request) => {
    const { projectId, round, step, status, detail, gitCommit } = request.body

    await projectService.addProgress(projectId, {
      round, step, status, detail, gitCommit,
    })

    // 如果是最后一轮最后一步完成
    if (status === 'done' && isLastStep) {
      // 通知管理员审核
      await notificationService.notifyAdmin({
        title: '项目开发完成待审核',
        content: `项目「${project.title}」已完成 ${round} 轮开发，请审核。`,
        link: `/admin/projects/${projectId}`,
      })
    }

    // WebSocket 推送进度
    wsManager.sendToUser(project.userId, {
      type: 'project.progress',
      payload: { projectId, round, step, status, detail },
    })
  })
}
```

---

## 13. 模块九：本地 LLM 调度对接

### 13.1 对接架构

本地 PC 上部署蒸馏 LLM，后端通过 HTTP API 与之通信。

```
后端服务 ──HTTP──→ 本地 PC (LLM API Server)
                       │
                   蒸馏 LLM
                       │
               需求分析 + 工单分类
                       │
              ←─── 返回结果 ────→
```

### 13.2 LLM 客户端

```js
// src/modules/agent/llm.client.js

class LocalLlmClient {
  constructor(config) {
    // 本地 LLM 服务地址（内网穿透或 VPN）
    this.baseUrl = config.LOCAL_LLM_URL  // e.g., http://192.168.1.100:8000
    this.apiKey = config.LOCAL_LLM_KEY
  }

  // 分析需求并分类
  async analyzeRequirement(requirement) {
    const response = await fetch(`${this.baseUrl}/api/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        prompt: this.buildAnalysisPrompt(requirement),
        max_tokens: 2000,
      }),
    })
    const result = await response.json()
    return this.parseAnalysisResult(result)
  }

  buildAnalysisPrompt(requirement) {
    return `你是一个需求分析助手。请分析以下客户需求，返回 JSON 格式结果：

客户需求：${requirement}

请返回：
{
  "category": "毕业设计|软件安装|Web设计|部署|其他",
  "summary": "需求摘要（50字以内）",
  "complexity": "low|medium|high",
  "estimatedRounds": 1-3,
  "keyPoints": ["关键点1", "关键点2"],
  "suggestedAgent": "推荐的Agent类型"
}`
  }

  // 工单分类
  async classifyTicket(ticketContent) {
    // 类似的 LLM 调用，用于工单自动分类
  }
}
```

### 13.3 Celery 任务处理

```py
# app/workers/tasks/agent_dispatch.py
from app.workers.celery_app import celery_app
from app.services.project_service import project_service
from app.clients.agent_client import agent_client
from app.clients.llm_client import local_llm_client


@celery_app.task(name="agent.dispatch")
def dispatch_agent(project_id: str, order_info: dict, requirement: str) -> None:
    # 1. 调用本地 LLM 分析
    analysis = local_llm_client.analyze_requirement(requirement)

    # 2. 更新项目分类和分析结果
    project_service.update_analysis(project_id, analysis)

    # 3. 根据分类派发到对应的 OpenClaw Agent
    agent_task = agent_client.create_analysis_task(
        project_id=project_id,
        requirement=requirement,
        category=analysis["category"],
        complexity=analysis["complexity"],
    )

    # 4. 记录 Agent 任务 ID
    project_service.bind_agent_task(
        project_id=project_id,
        agent_id=agent_task["agentId"],
        agent_task_id=agent_task["taskId"],
        status="CHATTING",
    )
```

说明：

- 耗时操作统一放入 Celery Worker，不阻塞主请求线程
- 周期性同步任务（如闲鱼订单轮询）由 Celery Beat 或 APScheduler 驱动
- 任务参数使用纯 JSON 可序列化对象，避免把 ORM Session 传入 Worker

---

## 14. 模块十：AI 客服系统

### 14.1 功能清单

- 创建聊天会话
- 发送消息（SSE 流式响应）
- 聊天历史查询
- 转人工（创建工单）

### 14.2 SSE 流式响应

```js
// src/modules/chat/chat.routes.js

fastify.post('/chat/send', async (request, reply) => {
  const { sessionId, content } = request.body
  const userId = request.user.id

  // 保存用户消息
  await chatService.addMessage(sessionId, {
    role: 'user',
    content,
  })

  // 设置 SSE 响应头
  reply.raw.setHeader('Content-Type', 'text/event-stream')
  reply.raw.setHeader('Cache-Control', 'no-cache')
  reply.raw.setHeader('Connection', 'keep-alive')

  // 获取聊天上下文
  const history = await chatService.getSessionMessages(sessionId)

  // 调用 LLM 获取流式响应
  const stream = await llmClient.chatStream({
    messages: history.map(m => ({ role: m.role, content: m.content })),
    system: CUSTOMER_SERVICE_PROMPT,
  })

  let fullResponse = ''

  for await (const chunk of stream) {
    fullResponse += chunk
    reply.raw.write(`data: ${JSON.stringify({ content: chunk })}\n\n`)
  }

  // 发送完成信号
  reply.raw.write(`data: ${JSON.stringify({ done: true })}\n\n`)
  reply.raw.end()

  // 保存完整的 AI 回复
  await chatService.addMessage(sessionId, {
    role: 'assistant',
    content: fullResponse,
  })
})
```

### 14.3 客服系统提示词

```js
const CUSTOMER_SERVICE_PROMPT = `你是 ThousandCliffs 的智能客服助手。

你的职责：
1. 回答用户关于商品、订单、卡密提取的问题
2. 引导用户完成操作（下单、提取卡密、提交工单）
3. 遇到无法解决的问题，建议用户转人工工单

注意事项：
- 保持友好、专业的语气
- 回答简洁明了
- 涉及敏感信息（密码、支付）时提醒用户注意安全
- 不要编造不存在的功能或政策`
```

---

## 15. 模块十一：通知系统

### 15.1 通知类型

| type | 触发场景 | 内容示例 |
|------|---------|---------|
| `order` | 订单状态变更 | "您的订单 NX-xxx 已支付成功" |
| `key` | 卡密已分配 | "您的卡密已准备就绪，请前往提取" |
| `ticket` | 工单回复 | "您的工单 TK-xxx 已回复" |
| `project` | 项目状态变更 | "您的项目已进入开发阶段" |
| `system` | 系统通知 | "系统维护通知" |

### 15.2 通知发送服务

```js
// src/modules/notification/notification.service.js

class NotificationService {
  constructor(prisma, wsManager, emailService) {
    this.prisma = prisma
    this.ws = wsManager
    this.email = emailService
  }

  async create({ userId, type, title, content, link }) {
    // 1. 存储到数据库
    const notification = await this.prisma.notification.create({
      data: { userId, type, title, content, link },
    })

    // 2. WebSocket 实时推送
    this.ws.sendToUser(userId, {
      type: 'notification',
      payload: notification,
    })

    // 3. 邮件通知（可选，根据用户设置）
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (user.email) {
      await this.email.send({
        to: user.email,
        subject: title,
        html: this.buildEmailTemplate(title, content, link),
      })
    }

    return notification
  }

  async notifyAdmin({ title, content, link }) {
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN' },
    })
    for (const admin of admins) {
      await this.create({ userId: admin.id, type: 'system', title, content, link })
    }
  }
}
```

---

## 16. 模块十二：WebSocket 实时通信

### 16.1 连接管理

```js
// src/ws/index.js

class WebSocketManager {
  constructor() {
    // userId -> Set<WebSocket>（一个用户可能多个 tab）
    this.connections = new Map()
  }

  addConnection(userId, ws) {
    if (!this.connections.has(userId)) {
      this.connections.set(userId, new Set())
    }
    this.connections.get(userId).add(ws)

    ws.on('close', () => {
      this.connections.get(userId)?.delete(ws)
      if (this.connections.get(userId)?.size === 0) {
        this.connections.delete(userId)
      }
    })
  }

  sendToUser(userId, data) {
    const connections = this.connections.get(userId)
    if (!connections) return

    const message = JSON.stringify(data)
    for (const ws of connections) {
      if (ws.readyState === ws.OPEN) {
        ws.send(message)
      }
    }
  }

  broadcast(data) {
    const message = JSON.stringify(data)
    for (const [, connections] of this.connections) {
      for (const ws of connections) {
        if (ws.readyState === ws.OPEN) {
          ws.send(message)
        }
      }
    }
  }
}
```

### 16.2 WebSocket 认证

```js
// src/ws/auth.ws.js

fastify.register(require('@fastify/websocket'))

fastify.register(async function (fastify) {
  fastify.get('/ws', { websocket: true }, (socket, req) => {
    // 从 query 参数获取 token
    const token = req.query.token
    if (!token) {
      socket.close(4001, 'Missing token')
      return
    }

    try {
      const payload = verifyAccessToken(token)
      const userId = payload.sub
      wsManager.addConnection(userId, socket)

      socket.on('message', (raw) => {
        try {
          const data = JSON.parse(raw.toString())
          // 处理客户端发送的消息（如心跳）
          if (data.type === 'ping') {
            socket.send(JSON.stringify({ type: 'pong' }))
          }
        } catch {}
      })
    } catch {
      socket.close(4002, 'Invalid token')
    }
  })
})
```

---

## 17. 模块十三：文件存储服务

### 17.1 存储方案

使用 MinIO（兼容 S3 协议）进行文件存储，开发环境可用本地文件系统。

```js
// src/utils/storage.js
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const s3 = new S3Client({
  endpoint: config.MINIO_ENDPOINT,     // e.g., http://localhost:9000
  region: 'us-east-1',
  credentials: {
    accessKeyId: config.MINIO_ACCESS_KEY,
    secretAccessKey: config.MINIO_SECRET_KEY,
  },
  forcePathStyle: true,
})

// 上传文件
export async function uploadFile(bucket, key, buffer, contentType) {
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }))
  return `${config.MINIO_ENDPOINT}/${bucket}/${key}`
}

// 生成预签名下载 URL（有效期 1 小时）
export async function getDownloadUrl(bucket, key) {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key })
  return getSignedUrl(s3, command, { expiresIn: 3600 })
}
```

### 17.2 存储桶规划

| Bucket | 用途 | 访问策略 |
|--------|------|---------|
| `attachments` | 工单/项目附件 | 私有，预签名访问 |
| `avatars` | 用户头像 | 公开读 |
| `exports` | 导出文件 | 私有，预签名访问 |

---

## 18. 安全设计

### 18.1 认证与授权

| 措施 | 说明 |
|------|------|
| JWT RS256 | 非对称签名，公钥验证 |
| Token 过期 | Access 15min，Refresh 7d |
| 密码哈希 | bcrypt cost=12 |
| 角色权限 | USER / VIP / ADMIN 三级 |

### 18.2 API 安全

| 措施 | 说明 |
|------|------|
| 请求限流 | 登录 5次/min，API 100次/min |
| 输入校验 | FastAPI + Pydantic v2 强校验 |
| SQL 注入 | SQLAlchemy 参数化查询，天然防护 |
| XSS | 前端渲染层处理，后端不返回 HTML |
| CORS | 限制允许的来源域名 |
| 安全响应头 | 由 FastAPI / Nginx 统一注入 |

### 18.3 数据安全

| 措施 | 说明 |
|------|------|
| 卡密加密 | AES-256-GCM 加密存储 |
| 密码哈希 | bcrypt 不可逆 |
| 敏感日志 | 脱敏处理，不记录密码/卡密明文 |
| 数据库备份 | 每日自动备份 |

### 18.4 闲鱼回调验证

```python
import hashlib
import hmac


def verify_xianyu_callback(raw_body: bytes, signature: str, app_secret: str) -> bool:
    expected = hmac.new(
        app_secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(signature, expected)
```

---

## 19. 部署架构

### 19.1 Docker Compose（开发环境）

```yaml
# docker-compose.yml
version: '3.8'

services:
  api:
    build: .
    command: uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    ports:
      - "8000:8000"
    environment:
      - APP_ENV=development
      - DATABASE_URL=postgresql+psycopg://tc:tc_pass@postgres:5432/thousandcliffs
      - REDIS_URL=redis://redis:6379
      - MINIO_ENDPOINT=http://minio:9000
      - MINIO_ACCESS_KEY=minioadmin
      - MINIO_SECRET_KEY=minioadmin
    depends_on:
      - postgres
      - redis
      - minio
    volumes:
      - ./app:/app/app
      - ./alembic:/app/alembic
      - ./pyproject.toml:/app/pyproject.toml
      - ./uv.lock:/app/uv.lock

  worker:
    build: .
    command: uv run celery -A app.workers.celery_app.celery_app worker --loglevel=INFO
    environment:
      - APP_ENV=development
      - DATABASE_URL=postgresql+psycopg://tc:tc_pass@postgres:5432/thousandcliffs
      - REDIS_URL=redis://redis:6379
      - MINIO_ENDPOINT=http://minio:9000
      - MINIO_ACCESS_KEY=minioadmin
      - MINIO_SECRET_KEY=minioadmin
    depends_on:
      - postgres
      - redis
      - minio
    volumes:
      - ./app:/app/app
      - ./alembic:/app/alembic
      - ./pyproject.toml:/app/pyproject.toml
      - ./uv.lock:/app/uv.lock

  beat:
    build: .
    command: uv run celery -A app.workers.celery_app.celery_app beat --loglevel=INFO
    environment:
      - APP_ENV=development
      - DATABASE_URL=postgresql+psycopg://tc:tc_pass@postgres:5432/thousandcliffs
      - REDIS_URL=redis://redis:6379
      - MINIO_ENDPOINT=http://minio:9000
      - MINIO_ACCESS_KEY=minioadmin
      - MINIO_SECRET_KEY=minioadmin
    depends_on:
      - postgres
      - redis
      - minio
    volumes:
      - ./app:/app/app
      - ./alembic:/app/alembic
      - ./pyproject.toml:/app/pyproject.toml
      - ./uv.lock:/app/uv.lock

  postgres:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: thousandcliffs
      POSTGRES_USER: tc
      POSTGRES_PASSWORD: tc_pass
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  minio:
    image: minio/minio
    ports:
      - "9000:9000"
      - "9001:9001"         # 控制台
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    command: server /data --console-address ":9001"
    volumes:
      - miniodata:/data

volumes:
  pgdata:
  miniodata:
```

### 19.2 生产环境架构

```
                    ┌──────────────┐
                    │   Nginx      │
                    │  SSL 终止     │
                    │  静态文件托管   │
                    └──────┬───────┘
                           │
                    ┌──────┴───────┐
              ┌─────┤   /api/*     ├─────┐
              │     │   /ws        │     │
              │     └──────────────┘     │
              ↓                          ↓
       ┌────────────┐            ┌────────────┐
       │ API 实例1   │            │ API 实例2   │
       │ (Uvicorn)  │            │ (Uvicorn)  │
       └─────┬──────┘            └─────┬──────┘
             │                         │
             └────────────┬────────────┘
                          │
       ┌──────────────────┼──────────────────┐
       │                  │                  │
  ┌────────────┐    ┌────────────┐    ┌────────────┐
  │ PostgreSQL │    │   Redis    │    │   MinIO    │
  └────────────┘    └─────┬──────┘    └────────────┘
                          │
                 ┌────────┴─────────┐
                 │ Celery Worker /  │
                 │ Celery Beat      │
                 └──────────────────┘
```

### 19.3 环境变量清单

```env
# .env.example

# 服务器
PORT=8000
APP_ENV=development
API_URL=http://localhost:8000
WEB_URL=http://localhost:48765
UVICORN_WORKERS=2

# 数据库
DATABASE_URL=postgresql+psycopg://tc:tc_pass@localhost:5432/thousandcliffs

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-jwt-secret-key-at-least-32-chars
JWT_REFRESH_SECRET=your-refresh-secret-key-at-least-32-chars

# 卡密加密
KEY_ENCRYPTION_KEY=your-32-byte-hex-key

# 闲鱼
XIANYU_APP_KEY=your-app-key
XIANYU_APP_SECRET=your-app-secret
XIANYU_ACCESS_TOKEN=your-access-token

# OpenClaw
OPENCLAW_API_URL=http://your-openclaw-server:port
OPENCLAW_API_KEY=your-openclaw-api-key

# 本地 LLM
LOCAL_LLM_URL=http://192.168.1.100:8000
LOCAL_LLM_KEY=your-local-llm-key

# MinIO
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin

# 邮件
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_USER=noreply@example.com
SMTP_PASS=your-smtp-password

# 支付（根据实际对接的渠道配置）
ALIPAY_APP_ID=
ALIPAY_PRIVATE_KEY=
ALIPAY_PUBLIC_KEY=
WECHAT_MCH_ID=
WECHAT_API_KEY=
```

---

## 20. 开发阶段规划

### Phase 1：项目脚手架 + 基础模块

> 目标：项目跑起来，认证+商品+卡密核心链路通

- [ ] 初始化 uv + FastAPI 项目
- [ ] 配置 SQLAlchemy + Alembic + PostgreSQL
- [ ] 配置 Redis
- [ ] 实现统一响应格式和错误处理
- [ ] 认证模块（注册/登录/JWT/Token 刷新）
- [ ] 商品模块（CRUD + 列表查询）
- [ ] 卡密模块（批量导入 + 提取 + 加密存储）
- [ ] 与前端联调认证和商品列表

### Phase 2：订单 + 支付

> 目标：完整的下单→支付→发卡流程

- [ ] 订单模块（创建 + 状态流转）
- [ ] 支付模块（至少支持一种支付方式）
- [ ] 订单超时取消（Celery 延迟任务）
- [ ] 支付成功 → 自动分配卡密
- [ ] 优惠码模块
- [ ] 与前端联调完整下单流程

### Phase 3：工单 + WebSocket

> 目标：工单可用，实时消息推送

- [ ] 工单模块（CRUD + 消息）
- [ ] WebSocket 服务
- [ ] 工单实时消息推送
- [ ] 通知系统
- [ ] 与前端联调

### Phase 4：闲鱼对接

> 目标：打通闲鱼订单→自动处理链路

- [ ] 闲鱼 API 对接（订单获取）
- [ ] 闲鱼 Bot 消息发送
- [ ] 商品映射管理
- [ ] 资源类订单自动处理
- [ ] 技术服务订单自动创建项目

### Phase 5：技术服务 + Agent 对接

> 目标：技术服务全链路

- [ ] 项目模块（CRUD + 状态机）
- [ ] 项目消息系统
- [ ] 本地 LLM 对接（需求分析）
- [ ] OpenClaw Agent 对接（任务创建+回调）
- [ ] 开发进度追踪
- [ ] 交付验收流程
- [ ] 管理员审核流程

### Phase 6：AI 客服 + 管理后台 + 优化

> 目标：AI 客服上线，补齐管理后台 API，并完成系统优化

- [ ] AI 客服 SSE 流式响应
- [ ] 聊天历史存储
- [ ] 转人工逻辑
- [ ] 文件存储服务（MinIO）
- [ ] 管理后台 API（仪表盘、商品、卡密、订单、工单、项目、用户、系统设置）
- [ ] 性能优化（缓存、索引）
- [ ] 监控告警

---

*文档版本：v1.0 | 后端从零构建完整规划*
