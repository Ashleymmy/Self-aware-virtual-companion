# SAVC 新版 OpenClaw 迁移指南

> 本文档提供将 SAVC 自定义代码从当前混合仓库中剥离、并接入新版 OpenClaw 的逐步操作指南。

---

## Step 1：创建独立 SAVC 仓库

### 推荐目录布局

```
savc/                          # 新仓库根目录
├── savc-core/                 # 核心业务（原样迁移）
├── savc-ui/                   # 管理界面（原样迁移）
├── savc-orchestrator/         # 从 openclaw/extensions/ 移出的插件
├── config/                    # 配置文件（原样迁移）
├── scripts/                   # 运行时脚本（需更新路径）
├── infra/docker/              # Docker 部署（需更新路径）
├── docs/                      # 文档（原样迁移）
├── openclaw/                  # OpenClaw（git submodule 或 npm 依赖）
├── package.json               # workspace 根配置
├── pnpm-workspace.yaml        # workspace 成员声明
├── CLAUDE.md
└── README.md
```

### 复制清单

直接复制（无需修改）：
- `savc-core/` — 整个目录
- `savc-ui/` — 整个目录
- `config/` — 整个目录
- `docs/` — 整个目录
- 根目录文件：`package.json`, `pnpm-workspace.yaml`, `CLAUDE.md`, `README.md`, `.gitignore`, `.dockerignore`, `Start-SAVC.cmd`, `Stop-SAVC.cmd`

需要移动的：
- `openclaw/extensions/savc-orchestrator/` → `savc-orchestrator/`

需要更新路径的：
- `scripts/` — 详见 Step 4
- `infra/docker/` — 详见 Step 4

---

## Step 2：引入 OpenClaw 框架

### 方案对比

| 方案 | 优点 | 缺点 | 推荐场景 |
|------|------|------|----------|
| **A. Git Submodule（推荐）** | 可锁定版本、可查看源码、可本地修改 | 需要 git submodule 管理 | 需要查看/调试 OpenClaw 源码 |
| **B. npm 全局安装** | 最简单、标准 Node.js 方式 | 无法锁定源码版本、依赖全局状态 | 仅使用 CLI 和 Plugin SDK |
| **C. 内联快照** | 完全可控 | 更新困难、仓库体积大 | 需要深度定制 OpenClaw |

### 方案 A：Git Submodule（推荐）

```bash
cd savc/
git submodule add <新版-openclaw-repo-url> openclaw
git submodule update --init

# 锁定到特定版本
cd openclaw
git checkout <target-tag-or-commit>
cd ..
git add openclaw
git commit -m "pin openclaw to <version>"
```

**pnpm-workspace.yaml 不应包含 openclaw 包**，避免依赖冲突：

```yaml
packages:
  - savc-core
  - savc-ui
  - savc-orchestrator
```

### 方案 B：npm 全局安装

```bash
npm install -g openclaw@<version>
```

此方案下 `savc-orchestrator` 需要将 `openclaw` 声明为 `peerDependencies`。

---

## Step 3：迁移 savc-orchestrator 插件

### 3.1 移动目录

```bash
# 从旧位置移出
mv openclaw/extensions/savc-orchestrator/ savc-orchestrator/
```

### 3.2 更新 package.json

```diff
  {
    "name": "@openclaw/savc-orchestrator",
+   "version": "0.1.0",
    "devDependencies": {
-     "openclaw": "workspace:*"
+     "openclaw": "file:../openclaw"
    }
  }
```

若使用 npm 全局安装方案：

```json
{
  "peerDependencies": {
    "openclaw": ">=2025.3.0"
  }
}
```

### 3.3 处理 real-session-adapter.ts 的内部导入

这是**最关键的修改**。当前代码通过相对路径导入 OpenClaw 内部模块：

```typescript
// 当前（插件在 openclaw/extensions/savc-orchestrator/ 下）
import("../../../src/agents/tools/sessions-spawn-tool.js")
```

**方案 A：更新相对路径**（若插件仍在 openclaw 树内通过 symlink）

```typescript
// 若通过 symlink 链接到 openclaw/extensions/
// 路径不变
```

**方案 B：使用可配置路径**（推荐）

```typescript
// 新增配置项或环境变量
const OPENCLAW_SRC = process.env.OPENCLAW_SRC || path.resolve(__dirname, "../../openclaw/src");

async function loadCreateSessionsSpawnTool() {
  const src = await import(path.join(OPENCLAW_SRC, "agents/tools/sessions-spawn-tool.js"));
  return src.createSessionsSpawnTool;
}
```

**方案 C：请求上游暴露 API**

向 OpenClaw 项目提交 PR，将以下函数添加到 `openclaw/plugin-sdk`：
- `createSessionsSpawnTool`
- `createSessionsSendTool`
- `callGateway`

### 3.4 更新 paths.ts 的 findRepoRoot()

当前逻辑从 `THIS_DIR`（插件 src/ 目录）向上搜索 `scripts/memory_semantic.mjs`：

```typescript
// 当前种子路径（假设在 openclaw/extensions/savc-orchestrator/src/）
path.resolve(THIS_DIR, "../../../../.."),  // 向上 5 层
path.resolve(THIS_DIR, "../../../.."),     // 向上 4 层
```

移出后需更新：

```typescript
// 新种子路径（假设在 savc-orchestrator/src/）
path.resolve(THIS_DIR, "../../.."),        // 向上 3 层到项目根
path.resolve(THIS_DIR, "../.."),           // 向上 2 层
```

或改为通过配置传入：

```typescript
const repoRoot = config.repoRoot || findRepoRoot([...]);
```

---

## Step 4：更新路径引用

### 4.1 scripts/setup.sh

| 行号 | 变更 |
|------|------|
| L587 | `plugins.load.paths` 从 `"${OPENCLAW_SUBMODULE}/extensions/savc-orchestrator"` 改为 `"${REPO_ROOT}/savc-orchestrator"` |

```diff
  "plugins": {
    "load": {
      "paths": [
-       "${OPENCLAW_SUBMODULE}/extensions/savc-orchestrator",
+       "${REPO_ROOT}/savc-orchestrator",
        "${OPENCLAW_SUBMODULE}/extensions/imessage"
      ]
    }
  }
```

### 4.2 scripts/dev.sh

| 行号 | 变更 |
|------|------|
| L148-161 | 确认 `OPENCLAW_SUBMODULE` 变量指向新的 OpenClaw 位置 |

若 OpenClaw 仍在 `openclaw/` 子目录下（submodule），则无需修改。
若位置改变，更新 `OPENCLAW_SUBMODULE` 变量定义。

### 4.3 infra/docker/Dockerfile.gateway

更新 COPY 指令以匹配新布局：

```diff
- COPY openclaw/ /workspace/openclaw/
+ COPY openclaw/ /workspace/openclaw/
  COPY savc-core/ /workspace/savc-core/
+ COPY savc-orchestrator/ /workspace/savc-orchestrator/
  COPY config/ /workspace/config/
  COPY scripts/ /workspace/scripts/
```

### 4.4 scripts/proactive_dispatcher.mjs

确认 `scripts/openclaw.sh` 的路径仍然可达。若使用全局安装的 openclaw，可直接调用 `openclaw` 命令。

### 4.5 pnpm-workspace.yaml

```diff
  packages:
    - savc-core
    - savc-ui
+   - savc-orchestrator
```

---

## Step 5：新版兼容性检查清单

接入新版 OpenClaw 时，逐项检查以下内容：

### 5.1 Plugin SDK 稳定性

- [ ] `openclaw/src/plugins/types.ts` 中 `OpenClawPluginApi` 接口是否变化
- [ ] `registerTool()` 方法签名是否兼容
- [ ] `OpenClawPluginToolContext` 字段是否变化
- [ ] `openclaw/plugin-sdk` 导出路径是否变化

### 5.2 内部 API 存在性

- [ ] `src/agents/tools/sessions-spawn-tool.js` 是否存在，`createSessionsSpawnTool` 导出是否保留
- [ ] `src/agents/tools/sessions-send-tool.js` 是否存在，`createSessionsSendTool` 导出是否保留
- [ ] `src/gateway/call.js` 是否存在，`callGateway` 导出是否保留

### 5.3 Gateway WebSocket 协议

- [ ] 协议版本是否仍为 3（或向后兼容）
- [ ] `connect` 握手参数格式是否变化
- [ ] `connect.challenge` 事件流程是否变化
- [ ] 帧格式（req/res/event）是否变化

### 5.4 HTTP API

- [ ] `POST /tools/invoke` 端点是否存在，请求/响应格式是否变化
- [ ] `GET /health` 端点是否存在

### 5.5 配置 Schema

- [ ] `openclaw.json` 的 `models` 段 schema 是否兼容
- [ ] `agents` 段（defaults + list）schema 是否兼容
- [ ] `plugins` 段（load.paths + entries）schema 是否兼容
- [ ] `gateway` 段 schema 是否兼容
- [ ] `channels` 段 schema 是否兼容

### 5.6 CLI 接口

- [ ] `openclaw agent --local --session-id --message --deliver --reply-channel --reply-to --json` 命令是否兼容
- [ ] `openclaw gateway --force` 命令是否兼容
- [ ] `openclaw config` 命令是否兼容

### 5.7 运行时目录

- [ ] `~/.openclaw/` 目录结构是否变化
- [ ] `~/.openclaw/agents/{id}/` 下是否仍支持 `SOUL.md`
- [ ] `agent/models.json` 和 `agent/auth-profiles.json` 格式是否变化

### 5.8 Agent 配置

- [ ] `agents.defaults.memorySearch` schema 是否变化
- [ ] `agents.list.{id}.tools.profile` 取值是否变化（"coding"/"messaging"）
- [ ] 心跳 / sandbox / workspace 配置是否变化

### 5.9 内置 Tool 兼容性

- [ ] `memory_recall` / `memory_store` 内置 Tool 是否存在
- [ ] `sessions_spawn` / `sessions_send` 内置 Tool 是否存在
- [ ] `bash` / `file_write` 内置 Tool 是否存在

---

## Step 6：端到端验证流程

### 6.1 配置生成

```bash
bash scripts/setup.sh
cat ~/.openclaw/openclaw.json | jq '.plugins'
# 确认 savc-orchestrator 路径正确
```

### 6.2 Gateway 启动

```bash
bash scripts/dev.sh
# 或
cd openclaw && node dist/index.js gateway --bind loopback --port 18789
```

验证：
```bash
curl http://127.0.0.1:18789/health
# 应返回 200
```

### 6.3 插件加载

```bash
openclaw config get plugins
# 确认 savc-orchestrator 已加载

openclaw tools list
# 确认 7 个 savc_* Tool 出现
```

### 6.4 Tool 功能验证

```bash
# Mock 模式路由测试
openclaw tools invoke savc_route '{"message": "你好"}'

# Mock 模式 spawn 测试
openclaw tools invoke savc_spawn_expert '{"agent": "companion", "task": "打个招呼"}'

# Live2D 信号测试
curl -X POST http://127.0.0.1:18789/tools/invoke \
  -H "Content-Type: application/json" \
  -d '{"tool": "savc_live2d_signal", "sessionKey": "main", "args": {"source": "text", "message": "你好", "emotion": "happy"}}'
```

### 6.5 UI 连接

```bash
cd savc-ui && pnpm dev
# 打开 http://localhost:5174
# 确认 WebSocket 连接成功（页面不报错）
```

### 6.6 主动消息守护

```bash
node scripts/proactive_daemon.mjs
# 确认 cron 任务注册成功
# 确认消息可通过 dispatcher 发出
```

### 6.7 Docker 构建

```bash
cd infra/docker
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up
# 确认 gateway 启动、health check 通过
```
