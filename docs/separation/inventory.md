# SAVC 代码资产清单

> 本文档列出 SAVC 项目中所有自定义二开代码、框架代码，以及剥离后需要修改的文件。

---

## 一、自定义代码（需提取到独立仓库）

### 1. savc-core/ — 核心业务逻辑（100% 自定义）

| 路径 | 内容 |
|------|------|
| `savc-core/agents/*.yaml` | 10 个专家 Agent 定义（orchestrator, companion, technical, creative, tooling, voice, vision, vibe-coder, memory, live2d） |
| `savc-core/orchestrator/*.mjs` | 编排模块：router, decomposer, lifecycle, registry, aggregator, vibe-coder, vision, live2d, voice |
| `savc-core/persona/` | voice.yaml（语音风格）、values.yaml（核心价值观） |
| `savc-core/memory/` | 混合记忆系统：episodic/、semantic/、emotional/、procedural/、vector/（LanceDB） |
| `savc-core/skills/` | 自定义技能：memory-manager、proactive-engine、tool-learner、self-reflection |
| `savc-core/SOUL.md` | 核心人格定义 |
| `savc-core/IDENTITY.md` | 角色身份声明 |
| `savc-core/HEARTBEAT.md` | 心跳/会话延续配置 |
| `savc-core/AGENTS.md` | Agent 目录说明 |
| `savc-core/TOOLS.md` | 工具列表说明 |
| `savc-core/package.json` | workspace 包声明 |

### 2. savc-ui/ — 管理界面（100% 自定义）

| 路径 | 内容 |
|------|------|
| `savc-ui/src/ui/app.ts` | 主应用组件（Lit + Web Components） |
| `savc-ui/src/ui/app-render.ts` | Shell 渲染（导航、布局） |
| `savc-ui/src/ui/app-view-state.ts` | 视图状态管理 |
| `savc-ui/src/ui/gateway-ws.ts` | Gateway WebSocket 客户端 |
| `savc-ui/src/ui/gateway-url.ts` | Gateway URL 解析 |
| `savc-ui/src/ui/gateway-device-auth.ts` | 设备认证令牌管理 |
| `savc-ui/src/ui/gateway-device-identity.ts` | 设备身份签名（Ed25519） |
| `savc-ui/src/ui/live2d-bridge.ts` | Live2D 信号桥（mock/gateway 双模式） |
| `savc-ui/src/ui/live2d-runtime.ts` | Live2D 运行时 |
| `savc-ui/src/ui/live2d-channel.ts` | Live2D 频道事件系统 |
| `savc-ui/src/ui/storage.ts` | 浏览器 localStorage 封装 |
| `savc-ui/src/ui/theme.ts` | 深色/浅色主题 |
| `savc-ui/src/ui/i18n/` | 国际化（中/英） |
| `savc-ui/src/ui/views/*.ts` | 视图组件：dashboard, chat, memory, persona, orchestrator, logs 等 |
| `savc-ui/src/ui/mock/` | 开发用 Mock 数据系统 |
| `savc-ui/src/main.ts` | 入口文件 |
| `savc-ui/package.json` | 前端依赖声明 |
| `savc-ui/vite.config.ts` | Vite 构建配置 |
| `savc-ui/tsconfig.json` | TypeScript 配置 |

### 3. config/ — 配置文件（100% 自定义）

| 路径 | 内容 |
|------|------|
| `config/proactive.yaml` | 主动交互调度配置（cron、日历、天气、安静时段） |
| `config/models.yaml` | LLM 路由配置草稿 |
| `config/channels.yaml` | 消息频道开关 |
| `config/privacy.yaml` | 隐私策略 |
| `config/openclaw/agents/*/SOUL.md` | 每个 Agent 的人格模板（运行时复制到 ~/.openclaw/） |
| `config/.env.example` | 环境变量模板 |
| `config/.env.local` | 本地密钥（**不应提交到 Git**） |

### 4. scripts/ — 运行时脚本（~90% 自定义）

| 路径 | 内容 | 与 OpenClaw 关系 |
|------|------|------------------|
| `scripts/setup.sh` | 生成 ~/.openclaw/openclaw.json | **核心对接点** |
| `scripts/dev.sh` | 开发服务器启动 | 调用 OpenClaw gateway |
| `scripts/openclaw.sh` | OpenClaw CLI 封装 + 密钥注入 | 包装 `openclaw` 命令 |
| `scripts/dev_preflight.sh` | 环境检查 | 检测 OpenClaw 安装 |
| `scripts/proactive_daemon.mjs` | 主动消息 cron 守护进程 | 通过 dispatcher 调用 OpenClaw |
| `scripts/proactive_dispatcher.mjs` | 消息分发器 | 调用 `openclaw agent` CLI |
| `scripts/memory_runtime.mjs` | 记忆系统运行时 | 独立 |
| `scripts/memory_semantic.mjs` | 语义检索（LanceDB） | 被插件动态导入 |
| `scripts/persona_tuning_runtime.mjs` | 人格微调 | 独立 |
| `scripts/lib/secret_env.sh` | 密钥环境变量加载 | 独立 |
| `scripts/llm_enable_failover.sh` | 模型降级配置 | 修改 OpenClaw 配置 |
| `scripts/test_phase*.sh` | 分阶段测试脚本 | 独立 |
| `scripts/scan_secrets.sh` | 密钥扫描 | 独立 |
| `scripts/install_git_hooks.sh` | Git hooks 安装 | 独立 |
| `scripts/prod_container.sh` | 生产容器管理 | 独立 |
| `scripts/validate_cloud_env.sh` | 云环境校验 | 独立 |

### 5. infra/docker/ — 部署基础设施（100% 自定义）

| 路径 | 内容 |
|------|------|
| `infra/docker/Dockerfile.gateway` | Gateway 容器镜像（编译 OpenClaw） |
| `infra/docker/Dockerfile.runtime` | 运行时容器镜像 |
| `infra/docker/docker-compose.prod.yml` | 生产部署编排 |
| `infra/docker/docker-compose.cloud.yml` | 云端部署编排 |
| `infra/docker/.env.example` | Docker 环境变量模板 |
| `infra/docker/.env.prod.example` | 生产环境变量模板 |
| `infra/docker/openclaw.container.json` | 容器内 Gateway 配置 |
| `infra/docker/bootstrap/` | 容器初始化脚本 |

### 6. 项目根目录文件

| 路径 | 内容 |
|------|------|
| `package.json` | workspace 根配置 |
| `pnpm-workspace.yaml` | workspace 成员声明 |
| `pnpm-lock.yaml` | 依赖锁定 |
| `CLAUDE.md` | Claude Code 项目指令 |
| `README.md` | 项目说明 |
| `.gitignore` | Git 忽略规则 |
| `.dockerignore` | Docker 忽略规则 |
| `Start-SAVC.cmd` / `Stop-SAVC.cmd` | Windows 启动/停止脚本 |

### 7. docs/ — 项目文档（100% 自定义）

已有的设计文档、路线图、工作日志等全部保留。

---

## 二、嵌入框架内的自定义代码（必须移出）

> **关键**：以下目录是 SAVC 自定义代码，但当前位于 OpenClaw 目录树内部。

### openclaw/extensions/savc-orchestrator/

这是 SAVC 的核心插件，目前放在 `openclaw/extensions/` 下。剥离时需移到项目根目录（如 `savc-orchestrator/`）。

| 路径 | 内容 |
|------|------|
| `index.ts` | 插件入口，注册 7 个 Tool |
| `openclaw.plugin.json` | 插件元数据和配置 schema |
| `package.json` | 包声明（当前依赖 `openclaw: "workspace:*"`） |
| `src/config.ts` | 插件配置解析 |
| `src/paths.ts` | 运行时上下文解析 + 动态模块加载 |
| `src/types.ts` | TypeScript 类型定义 |
| `src/run-store.ts` | 运行记录内存缓存 |
| `src/real-session-adapter.ts` | **深度集成**：导入 OpenClaw 内部模块 |
| `src/tool-route.ts` | savc_route 工具实现 |
| `src/tool-decompose.ts` | savc_decompose 工具实现 |
| `src/tool-spawn-expert.ts` | savc_spawn_expert 工具实现 |
| `src/tool-agent-status.ts` | savc_agent_status 工具实现 |
| `src/tool-voice-call.ts` | savc_voice_call 工具实现 |
| `src/tool-image-generate.ts` | savc_image_generate 工具实现 |
| `src/tool-live2d-signal.ts` | savc_live2d_signal 工具实现 |
| `src/tool-*.test.ts` | 单元测试 |

---

## 三、框架代码（不应提取，保持为外部依赖）

### openclaw/ — OpenClaw 框架

| 路径 | 内容 |
|------|------|
| `openclaw/src/` | 框架源码（CLI、Gateway、频道） |
| `openclaw/packages/` | 核心包 |
| `openclaw/extensions/`（除 savc-orchestrator 外） | 33 个社区扩展 |
| `openclaw/skills/` | 55+ 内置技能 |
| `openclaw/apps/` | 移动端/桌面端应用 |
| `openclaw/ui/` | 内置 Web UI |
| `openclaw/dist/`、`openclaw/vendor/` | 构建产物 |
| 根目录配置/构建文件 | 框架构建系统 |

**当前状态**：openclaw/ 是内联拷贝（不是 git submodule），与 SAVC 共用同一 git 仓库。

---

## 四、剥离后需修改的文件

### 4.1 real-session-adapter.ts（路径：savc-orchestrator/src/）

**问题**：通过相对路径导入 OpenClaw 内部模块（非公开 API）。

| 行号 | 当前导入路径 | 导入目标 |
|------|-------------|---------|
| L204 | `../../../src/agents/tools/sessions-spawn-tool.js` | `createSessionsSpawnTool` |
| L213 | `../../../agents/tools/sessions-spawn-tool.js` | 同上（dist fallback） |
| L227 | `../../../src/agents/tools/sessions-send-tool.js` | `createSessionsSendTool` |
| L236 | `../../../agents/tools/sessions-send-tool.js` | 同上（dist fallback） |
| L250 | `../../../src/gateway/call.js` | `callGateway` |
| L259 | `../../../gateway/call.js` | 同上（dist fallback） |

**修改方案**：改为可配置路径的动态导入，或请求 OpenClaw 上游将这些 API 暴露到 `openclaw/plugin-sdk`。

### 4.2 paths.ts（路径：savc-orchestrator/src/）

**问题**：`findRepoRoot()` 从插件当前位置向上搜索 `scripts/memory_semantic.mjs`。

| 行号 | 问题 |
|------|------|
| L42-58 | `findRepoRoot()` 的种子路径依赖插件在 `openclaw/extensions/` 下的相对位置 |
| L104-110 | 种子路径使用 `THIS_DIR` 向上 4-5 层查找，假设插件在框架树内 |

**修改方案**：移出后需更新种子路径逻辑，或改用配置项传入 repoRoot。

### 4.3 savc-orchestrator/package.json

| 字段 | 当前值 | 需改为 |
|------|--------|--------|
| `devDependencies.openclaw` | `"workspace:*"` | `"file:../openclaw"` 或版本号 |

### 4.4 scripts/setup.sh

| 行号 | 当前值 | 需改为 |
|------|--------|--------|
| L587 | `"${OPENCLAW_SUBMODULE}/extensions/savc-orchestrator"` | 新的插件路径 |

### 4.5 scripts/dev.sh

| 行号 | 问题 |
|------|------|
| L148-161 | `pnpm -C "${OPENCLAW_SUBMODULE}" exec tsdown --watch` 和 `node --watch openclaw.mjs gateway` 依赖 OpenClaw 在仓库内的位置 |

### 4.6 infra/docker/Dockerfile.gateway

| 问题 |
|------|
| `COPY openclaw/...` 语句假设 openclaw 在项目根目录下，需根据新布局调整 |

### 4.7 scripts/proactive_dispatcher.mjs

| 问题 |
|------|
| 通过 `scripts/openclaw.sh` 调用 `openclaw agent --local`，路径需确认 |

---

## 五、自定义依赖（需保留在 SAVC 仓库）

### 根 package.json

| 包名 | 用途 |
|------|------|
| `@lancedb/lancedb` | 向量数据库（语义记忆） |
| `chokidar` | 文件监听（记忆更新） |
| `googleapis` | Google Calendar API |
| `js-yaml` | YAML 解析 |
| `node-cron` | Cron 调度 |
| `openai` | 嵌入向量生成（text-embedding-3-small） |

### savc-ui/package.json

| 包名 | 用途 |
|------|------|
| `lit` | Web Components 框架 |
| `vite` | 构建工具 |
| `ws` | WebSocket 客户端 |
| `@lydell/node-pty` | 终端模拟（日志视图） |
| `redis` | Redis 客户端 |
