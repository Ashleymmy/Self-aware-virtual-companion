# SAVC OpenClaw 收口与升级指南

> 本文档描述当前仓库已经落地的目录基线，以及未来替换或升级 `openclaw/` 快照时应遵循的步骤。它不再描述旧的“从 `openclaw/extensions/savc-orchestrator` 拆出去”的迁移过程，因为该迁移已经完成。

## 1. 当前基线

当前仓库约定如下：

```text
Self-aware-virtual-companion/
├── openclaw/                # 默认 OpenClaw 根目录
├── packages/
│   ├── core/                # SAVC 核心
│   ├── plugin/              # OpenClaw 插件
│   └── ui/                  # 管理界面
├── scripts/
│   ├── lib/
│   ├── lifecycle/
│   ├── runtime/
│   └── test/
├── config/
└── infra/docker/
```

默认运行约定：

- `OPENCLAW_ROOT` 未设置时，等于 `${REPO_ROOT}/openclaw`
- OpenClaw CLI 统一通过 `node "${OPENCLAW_ROOT}/openclaw.mjs" ...` 调用
- 插件加载路径固定为 `${REPO_ROOT}/packages/plugin`
- Agent workspace 固定为 `${REPO_ROOT}/packages/core`

## 2. 替换 OpenClaw 快照

若要接入新的 OpenClaw 版本，直接替换 `openclaw/` 内容，不再引入第二套路径：

1. 备份当前本地改动。
2. 用新版本覆盖 `openclaw/` 目录。
3. 确认以下文件仍存在：
   - `openclaw/package.json`
   - `openclaw/openclaw.mjs`
   - `openclaw/src/`
4. 重新安装并最小构建：

```bash
pnpm -C openclaw install --frozen-lockfile
pnpm -C openclaw exec tsdown --no-clean
```

5. 重新执行仓库验收链：

```bash
pnpm dev:check
pnpm setup
cd packages/plugin && pnpm test
pnpm test:phase4b:plugin
pnpm test:phase5
pnpm test:phase6
```

## 3. 必须保持不变的仓库契约

### 路径契约

- `packages/core`
- `packages/plugin`
- `packages/ui`
- `scripts/runtime/*`
- `scripts/lifecycle/*`
- `scripts/test/*`

### 配置契约

`scripts/setup.sh` 生成的 OpenClaw 配置应继续满足：

- `agents.defaults.workspace = <REPO_ROOT>/packages/core`
- `plugins.load.paths` 包含 `<REPO_ROOT>/packages/plugin`
- `plugins.entries["savc-orchestrator"]` 保持启用

### 对外行为契约

本仓库当前不希望在升级过程中改变：

- `savc_route`
- `savc_decompose`
- `savc_spawn_expert`
- `savc_agent_status`
- `savc_voice_call`
- `savc_image_generate`
- `savc_live2d_signal`

这些工具的 JSON 返回结构应保持兼容。

## 4. 兼容性检查清单

升级 OpenClaw 时至少核对：

### Plugin SDK

- `openclaw/plugin-sdk` 仍可导入
- `OpenClawPluginApi` 接口未破坏
- `OpenClawPluginToolContext` 接口未破坏
- `api.registerTool()` 签名兼容

### 内部 API

- `agents/tools/sessions-spawn-tool.js`
- `agents/tools/sessions-send-tool.js`
- `gateway/call.js`

### Gateway / CLI

- `node openclaw/openclaw.mjs gateway`
- `node openclaw/openclaw.mjs plugins list --json`
- `POST /tools/invoke`
- `GET /health`

### SAVC 脚本

- `scripts/lib/paths.sh` 可从任意 `scripts/*` 子目录解析 `REPO_ROOT`
- `scripts/dev.sh` 能补齐 OpenClaw readiness
- `scripts/test/*` 不再误把根目录解析成 `.../scripts`

## 5. Docker 对齐要求

未来升级时，Docker 仍应遵循同一套目录约定：

- `/workspace/openclaw`
- `/workspace/packages/core`
- `/workspace/packages/plugin`
- `/workspace/packages/ui`

镜像入口要点：

- Gateway 容器从 `infra/docker/Dockerfile.gateway` 构建
- Runtime 容器从 `infra/docker/Dockerfile.runtime` 构建
- `docker-compose.cloud.yml` 与 `docker-compose.prod.yml` 都以仓库根目录为 build context

## 6. 故障优先排查顺序

1. `openclaw/` 是否拍平到正确根目录
2. `scripts/lib/paths.sh` 解析出的 `OPENCLAW_ROOT` 是否正确
3. `openclaw/package.json` / `openclaw/openclaw.mjs` 是否存在
4. `openclaw/node_modules` 和 `openclaw/dist` 是否就绪
5. `~/.openclaw/openclaw.json` 中插件路径是否为 `packages/plugin`
6. `packages/plugin` 单测是否通过
