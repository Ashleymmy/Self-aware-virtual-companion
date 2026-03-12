# SAVC 代码资产清单

> 本文档描述当前仓库中哪些内容属于 SAVC 自定义资产，哪些内容属于内置 OpenClaw 快照，以及二者之间的边界。

## 1. SAVC 自定义代码

### `packages/core/`

SAVC 业务核心，当前全部为自定义代码：

- `agents/*.yaml`：专家 Agent 定义
- `orchestrator/*.mjs`：router、decomposer、lifecycle、registry、vision、live2d 等编排模块
- `memory/`：Markdown + LanceDB 记忆层
- `persona/`：人格与价值观配置
- `skills/`：自定义技能
- `SOUL.md` / `IDENTITY.md` / `HEARTBEAT.md` / `AGENTS.md` / `TOOLS.md`

### `packages/ui/`

SAVC 管理界面与前端联调入口：

- `src/ui/*`：页面、网关客户端、Live2D bridge、日志与存储能力
- `public/*`：静态页面与联调资源
- `vite.config.ts`
- `package.json`

### `packages/plugin/`

SAVC 的 OpenClaw 插件接入层，当前已固定在仓库根工作区，不再位于 `openclaw/extensions/`：

- `index.ts`：插件入口
- `openclaw.plugin.json`：插件清单与 schema
- `src/tool-*.ts`：7 个工具实现
- `src/paths.ts`：路径解析与运行时定位
- `src/real-session-adapter.ts`：OpenClaw 深度集成
- `src/*.test.ts`：插件单元测试

### `scripts/`

当前脚本分层：

- `scripts/lib/`：公共 shell helper
- `scripts/runtime/`：主动引擎、语义记忆、反思、人格微调等运行时
- `scripts/lifecycle/`：phase enable/run/cron 入口
- `scripts/test/`：阶段验收脚本
- 根脚本：`setup.sh`、`dev.sh`、`openclaw.sh`、`dev_preflight.sh` 等

### 其他自定义目录

- `config/`：环境变量模板、模型/频道/隐私/主动调度配置
- `infra/docker/`：容器镜像与 compose 入口
- `docs/`：架构、迁移、工作日志与设计文档
- 根配置：`package.json`、`pnpm-workspace.yaml`、`.dockerignore`、`.gitignore`

## 2. OpenClaw 快照

### `openclaw/`

当前仓库内维护一份 OpenClaw 快照，默认作为运行时根目录：

- `openclaw.mjs`
- `package.json`
- `src/`
- `dist/`
- `extensions/`
- `apps/`
- `packages/`
- `skills/`

SAVC 不再把自定义插件塞进 `openclaw/extensions/savc-orchestrator`；该目录现在只属于 OpenClaw 自身扩展树。

## 3. 当前边界

### 对 OpenClaw 的稳定接口

- `openclaw/plugin-sdk`
- `node <OPENCLAW_ROOT>/openclaw.mjs ...`
- Gateway WebSocket / HTTP 协议

### 对 OpenClaw 的深度依赖

`packages/plugin/src/real-session-adapter.ts` 当前仍依赖 OpenClaw 内部模块：

- `agents/tools/sessions-spawn-tool.js`
- `agents/tools/sessions-send-tool.js`
- `gateway/call.js`

这部分是后续升级 OpenClaw 时最需要重点核对的兼容区。

### 对 SAVC 运行时的动态依赖

`packages/plugin` 会动态加载：

- `packages/core/orchestrator/*.mjs`
- `packages/core/agents/*.yaml`
- `scripts/runtime/memory_semantic.mjs`

因此收口后的默认路径必须保持：

- `packages/core`
- `packages/plugin`
- `scripts/runtime/*`

## 4. 关键收口点

以下内容已从“迁移目标”变成“当前基线”：

- OpenClaw 默认根目录固定为 `openclaw/`
- 插件目录固定为 `packages/plugin`
- 所有阶段测试目录固定为 `scripts/test/*`
- 生命周期脚本固定为 `scripts/lifecycle/*`
- 运行时脚本固定为 `scripts/runtime/*`

## 5. 验收关注项

完成本仓库升级或重构时，重点检查：

1. `scripts/setup.sh` 生成的插件加载路径是否仍为 `packages/plugin`
2. `scripts/lib/paths.sh` 是否仍能从 `scripts/*` 任意子目录解析出真实 `REPO_ROOT`
3. `packages/plugin` 单测是否可独立运行
4. Docker 与阶段测试是否仍使用 `packages/core` / `packages/ui` / `packages/plugin`
