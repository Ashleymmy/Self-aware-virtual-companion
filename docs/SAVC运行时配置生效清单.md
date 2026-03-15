# SAVC 运行时配置生效清单

更新时间: 2026-03-15

本文只回答一个问题: 当前仓库里哪些配置会被实际运行链读取，哪些只是模板或草案。

不记录任何密钥、令牌或账号信息；涉及环境变量时只记录变量名和消费方。

## 1. 结论摘要

当前 SAVC 有两条主要运行链:

1. 本机裸跑链
   - 入口: `config/.env.local` + `pnpm setup` + `pnpm dev`
   - 关键运行时配置: `~/.openclaw/openclaw.json`
   - 当前状态: 本机未完成初始化，`config/.env.local` 和 `~/.openclaw/openclaw.json` 当前不存在

2. Docker 联调/生产链
   - 入口: `infra/docker/.env*` + `docker-compose*.yml`
   - 关键运行时配置: 容器环境变量 + 容器内执行 `scripts/setup.sh` 生成的 OpenClaw 配置
   - 当前状态: 这条链更完整，且已有实际运行痕迹

## 2. 配置优先级

按当前仓库结构，实际生效优先级可以理解为:

1. 容器或本机进程启动时注入的环境变量
2. `scripts/setup.sh` 基于环境变量生成的 `~/.openclaw/openclaw.json`
3. `config/agents/*/SOUL.md` 同步到 `~/.openclaw/agents/*/SOUL.md` 后成为 OpenClaw Agent 提示词
4. `packages/core/agents/*.yaml` 被 `savc-orchestrator` 插件直接读取
5. `config/channels.yaml` 与 `config/proactive.yaml` 被主动引擎脚本直接读取
6. `packages/ui` / `packages/service` 自身读取的环境变量

## 3. 生效配置总表

| 类别 | 配置来源 | 消费方 | 当前是否生效 | 说明 |
| --- | --- | --- | --- | --- |
| 本机环境模板 | `config/.env.example` | 人工复制为 `config/.env.local` | 否 | 只是模板，不会被直接读取 |
| 本机环境配置 | `config/.env.local` | `scripts/setup.sh`、`scripts/dev.sh`、`scripts/openclaw.sh` | 当前否 | 文件当前不存在，因此本机裸跑链未初始化 |
| OpenClaw 主运行时配置 | `~/.openclaw/openclaw.json` | OpenClaw Gateway | 当前否 | 由 `scripts/setup.sh` 生成；本机当前不存在 |
| OpenClaw 全局 env | `~/.openclaw/.env` | OpenClaw CLI / 本机工具链 | 当前否 | 由 `scripts/setup.sh`/`scripts/dev.sh` 同步；本机当前不存在 |
| 多 Agent 结构化定义 | `packages/core/agents/*.yaml` | `packages/core/orchestrator/registry.mjs`、插件编排链 | 是 | 当前是实际生效的专家 Agent 路由定义 |
| 人格总纲 | `packages/core/SOUL.md` | `packages/core/agents/*.yaml` 的 `persona.inherit` | 是 | 当前是 `packages/core` 层实际人格基线 |
| 人格偏好 | `packages/core/persona/values.yaml` | 人格配置层/文档基线 | 部分 | 当前仓库中已定义，但不是 OpenClaw 直接入口 |
| 表达风格 | `packages/core/persona/voice.yaml` | 人格配置层/文档基线 | 部分 | 当前仓库中已定义，但不是 OpenClaw 直接入口 |
| OpenClaw Agent SOUL 模板 | `config/agents/*/SOUL.md` | `scripts/setup.sh` 复制到 `~/.openclaw/agents/*/SOUL.md` | 条件生效 | 只有执行 `setup.sh` 后才进入真实运行时 |
| 插件 UI Schema | `packages/plugin/openclaw.plugin.json` | OpenClaw 插件管理界面 | 是 | 定义插件配置字段和说明 |
| 插件运行默认值 | `packages/plugin/src/config.ts` | `savc-orchestrator` 插件 | 是 | 仅在 `openclaw.json` 未覆盖时使用默认值 |
| 插件实际运行值 | `scripts/setup.sh` 写入的 plugin config | `savc-orchestrator` 插件 | 条件生效 | 执行 `setup.sh` 后覆盖插件默认值 |
| 主动引擎渠道配置 | `config/channels.yaml` | `scripts/runtime/proactive_daemon.mjs`、`proactive_dispatcher.mjs` | 是 | 当前是主动消息分发链的真实配置 |
| 主动引擎调度配置 | `config/proactive.yaml` | `scripts/runtime/proactive_daemon.mjs` | 是 | 当前是主动调度链的真实配置 |
| 模型路由草案 | `config/models.yaml` | 当前主运行链 | 否 | 目前主要是规划文件，不是实际读取入口 |
| 隐私策略草案 | `config/privacy.yaml` | 当前主运行链 | 否 | 当前未接入运行时代码执行链 |
| UI 运行时 env | `SAVC_UI_PORT`、`VITE_SAVC_GATEWAY_URL` 等 | `packages/ui` | 是 | 由 Vite/UI 服务直接读取 |
| 商业服务 env | `SAVC_SERVICE_*` | `packages/service` | 是 | 独立 HTTP 服务读取 |
| UI 存储状态 | `packages/config/storage/*` | `SavcGlobalStorageService` | 是 | 当前已有 SQLite/WAL/YAML 灾备落盘 |

## 4. 当前真正生效的关键文件

### 4.1 OpenClaw 生成链

`scripts/setup.sh` 是当前最关键的配置生成器。它会做这些事:

- 读取本机或容器中的环境变量
- 生成 `~/.openclaw/openclaw.json`
- 为 OpenClaw 注入模型 providers
- 注册 `savc-orchestrator` 插件
- 把 `config/agents/*/SOUL.md` 同步为 OpenClaw Agents 的运行时人格文件

这意味着:

- `config/models.yaml` 不是当前 OpenClaw 的真实模型来源
- 真正的 provider、plugin、agent auth 配置由 `scripts/setup.sh` 生成

### 4.2 多 Agent 编排链

`packages/core/agents/*.yaml` 当前直接决定:

- 每个专家 Agent 的模型名
- 意图触发项
- 关键词触发项
- 工具白名单/黑名单
- 最大轮次、超时、token 限制

这部分不是草案，当前就是有效配置。

### 4.3 主动引擎链

主动引擎实际读取:

- `config/proactive.yaml`
- `config/channels.yaml`
- 对应环境变量，如:
  - `DISCORD_BOT_TOKEN`
  - `TELEGRAM_BOT_TOKEN`
  - `GOOGLE_CALENDAR_ID`
  - `GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON_FILE`
  - `OPENWEATHER_API_KEY`

所以这两份 YAML 当前是实际生效配置，不是占位文件。

### 4.4 UI / 存储链

`packages/ui/vite.config.ts` 在服务启动时初始化 `SavcGlobalStorageService`。

当前存储行为:

- 主存储: SQLite
- Cache: memory，配置了 `SAVC_REDIS_URL` 才会切到 Redis
- 备份: YAML
- MySQL: 预留，未配置时不参与运行

当前仓库已存在实际落盘文件，说明这条链已运行过。

## 5. 当前环境状态

### 5.1 本机裸跑状态

当前检查结果:

- `config/.env.local`: 不存在
- `~/.openclaw/openclaw.json`: 不存在
- `~/.openclaw/.env`: 不存在

结论:

- 当前宿主机不是“已完成 setup 的裸跑态”
- 直接执行 `pnpm dev` 前，仍需要先补本机初始化

### 5.2 Docker 状态

当前检查结果:

- `infra/docker/.env` 已存在
- 默认端口已配置
- `VITE_SAVC_GATEWAY_URL=/gateway`
- `SAVC_GATEWAY_INTERNAL_URL=http://savc-gateway:18789`
- `SAVC_CODEX_ACP_ENABLE=0`
- 大多数第三方 provider key 仍为空

结论:

- Docker 运行链已具备基础可启动形态
- 外部能力是否可用，取决于是否补充相应密钥/Token

## 6. 当前确认的非生效项

以下文件当前不应被误认为“修改后立刻影响运行时”:

### 6.1 `config/models.yaml`

当前定位:

- 模型路由规划草案
- 会被文档、测试、说明引用
- 当前主运行链不直接读取它

影响:

- 修改这里，不会自动改掉 OpenClaw 当前正在用的 provider/model
- 真正会影响运行时的是环境变量和 `scripts/setup.sh` 生成结果

### 6.2 `config/privacy.yaml`

当前定位:

- 隐私策略声明文件
- 当前未接入主运行时执行链

影响:

- 修改这里，不会自动让内存存储、传输或脱敏逻辑发生变化
- 若要生效，需要再补运行时代码接线

## 7. 当前确认的配置漂移

已确认并修正:

- 生产 compose 的 `savc_storage_data` 曾挂载到 `/workspace/config/storage`
- 但 `savc-ui` 实际写入的是 `/workspace/packages/config/storage`

当前已修正为:

- `savc-ui`: `/workspace/packages/config/storage`
- `savc-proactive`: `/workspace/packages/config/storage`

这意味着生产环境的持久化路径现在与真实运行路径一致。

## 8. 最值得关注的几个点

如果你现在要继续维护或部署 SAVC，优先看这几处:

1. 要看真正生效的模型/插件/OpenClaw 配置:
   - 看 `scripts/setup.sh`
   - 看运行后生成的 `~/.openclaw/openclaw.json`

2. 要看多 Agent 行为:
   - 看 `packages/core/agents/*.yaml`
   - 看 `packages/core/SOUL.md`

3. 要看主动消息/日历/天气:
   - 看 `config/proactive.yaml`
   - 看 `config/channels.yaml`
   - 看对应环境变量是否已配置

4. 要看 UI 与存储:
   - 看 `packages/ui/vite.config.ts`
   - 看 `packages/ui/storage/global-storage.ts`
   - 看 `packages/config/storage/*`

## 9. 建议的后续整理方向

如果后续继续收敛配置复杂度，建议按这个顺序做:

1. 明确标注“草案配置”和“运行时配置”，避免 `config/models.yaml` 继续被误读
2. 给 `config/privacy.yaml` 补运行时接线，或者明确声明它暂不生效
3. 为 `scripts/setup.sh` 生成的 OpenClaw 配置补一份可追踪的导出文档
4. 把本机裸跑与 Docker 运行所需最小变量拆成两套最小模板

## 10. 最小必填环境变量表

这一节只解决“最少要填什么才能跑起来”。

为了避免误判，下面把要求分成三类:

- 硬要求: 不满足时，脚本校验或启动链会直接失败
- 最低可用: 不一定阻止启动，但缺了基本就没有可用能力
- 按功能启用: 只在你要打开某项功能时才需要

### 10.1 本机裸跑最小项

适用路径:

- `cp config/.env.example config/.env.local`
- `pnpm setup`
- `pnpm dev`

| 级别 | 项目 | 最小要求 | 说明 |
| --- | --- | --- | --- |
| 硬要求 | `config/.env.local` 文件本身 | 必须存在 | `scripts/dev_preflight.sh` 会直接检查这个文件是否存在 |
| 硬要求 | OpenClaw 源码目录 | 仓库内 `openclaw/` 布局有效 | 这是脚本前置，不是 env，但不满足也无法启动 |
| 最低可用 | 至少一个 LLM provider key | `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `ANYROUTER_API_KEY` / `GGBOOM_API_KEY` / `CODE_API_KEY` / `LAOYOU_API_KEY` / `VOLCES_API_KEY` 任选其一 | `dev_preflight` 只警告不报错，但没有任何 provider key 基本无法得到可用模型响应 |
| 默认可留空 | `OPENCLAW_GATEWAY_TOKEN` | 可为空 | `scripts/setup.sh` / `scripts/dev.sh` 会在缺失时自动生成并回写 |
| 默认可留空 | `OPENCLAW_PORT` | 默认 `18789` | 只有你想改端口时才需要改 |
| 默认可留空 | `SAVC_UI_PORT` | 默认 `5174` | 只有你想改端口时才需要改 |
| 默认可留空 | `OPENCLAW_WORKSPACE` | 默认 `../packages/core` | 只有你想切工作区时才需要改 |

本机裸跑最小可用推荐:

- 保留默认端口
- 至少配置 1 个 provider key
- 其余按功能补

### 10.2 Docker 联调最小项

适用路径:

- `cp infra/docker/.env.example infra/docker/.env`
- `bash scripts/infra/dev_container.sh up`

| 级别 | 项目 | 最小要求 | 说明 |
| --- | --- | --- | --- |
| 硬要求 | `infra/docker/.env` 文件本身 | 必须存在 | 容器脚本要求存在 env 文件 |
| 最低可用 | `OPENCLAW_GATEWAY_TOKEN` | 建议设置非空 | 当前 dev/cloud compose 模板直接引用它；虽然容器内 `setup.sh` 有补 token 逻辑，但显式配置更稳定 |
| 最低可用 | 至少一个 LLM provider key | `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `ANYROUTER_API_KEY` / `GGBOOM_API_KEY` / `CODE_API_KEY` / `LAOYOU_API_KEY` / `VOLCES_API_KEY` 任选其一 | 没有 provider key 时，栈可能能起，但核心对话/编排不可用 |
| 默认应保持 | `VITE_SAVC_GATEWAY_URL` | 保持 `/gateway` | 当前 UI 通过自身代理转发到 Gateway |
| 默认应保持 | `SAVC_GATEWAY_INTERNAL_URL` | 保持 `http://savc-gateway:18789` | UI 容器访问 Gateway 的内部地址 |
| 默认可留空 | `SAVC_REDIS_URL` | 空 | 为空时 UI 存储服务回落到 memory cache |
| 默认可留空 | `MYSQL_URL` | 空 | 当前只是预留项，不是栈启动硬要求 |

Docker 联调最小可用推荐:

- `OPENCLAW_GATEWAY_TOKEN`
- 至少一个 provider key
- 保持 `/gateway` 和 `http://savc-gateway:18789` 默认值

### 10.3 Docker 生产最小项

适用路径:

- `cp infra/docker/.env.prod.example infra/docker/.env.prod`
- `bash scripts/infra/prod_container.sh validate`
- `bash scripts/infra/prod_container.sh up`

`scripts/infra/validate_cloud_env.sh` 当前给出的最小硬要求如下:

| 级别 | 项目 | 最小要求 | 说明 |
| --- | --- | --- | --- |
| 硬要求 | `SAVC_HOST_SECRETS_DIR` | 目录存在 | 生产校验脚本会直接检查 |
| 硬要求 | `OPENCLAW_GATEWAY_TOKEN` 或 `OPENCLAW_GATEWAY_TOKEN_FILE` | 二选一 | Gateway 鉴权必需 |
| 硬要求 | 至少一个 LLM provider secret | `OPENAI_API_KEY(_FILE)` / `ANTHROPIC_API_KEY(_FILE)` / `ANYROUTER_API_KEY(_FILE)` / `WZW_API_KEY(_FILE)` / `GGBOOM_API_KEY(_FILE)` / `CODE_API_KEY(_FILE)` / `LAOYOU_API_KEY(_FILE)` / `VOLCES_API_KEY(_FILE)` 任选其一 | 生产校验脚本要求至少有一个 |
| 硬要求 | `VITE_SAVC_GATEWAY_TOKEN` | 必须留空 | 生产环境禁止把 Gateway token 暴露给前端 |
| 默认应保持 | `VITE_SAVC_GATEWAY_URL` | `/gateway` | 生产校验会检查；不是失败项，但当前推荐固定值 |
| 默认可留空 | `SAVC_REDIS_URL` | 空 | 为空时回落到 memory cache |
| 默认可留空 | `MYSQL_URL` | 空 | 当前仍是预留项 |

生产最小可用推荐:

- `OPENCLAW_GATEWAY_TOKEN_FILE`
- 至少一个 provider secret file
- `VITE_SAVC_GATEWAY_URL=/gateway`
- 不向前端注入 `VITE_SAVC_GATEWAY_TOKEN`

### 10.4 按功能启用的环境变量

这些不属于“启动最小项”，而是“你要用这个功能时才需要补齐”。

| 功能 | 需要的最小变量 | 说明 |
| --- | --- | --- |
| Discord 主动发送 | `DISCORD_BOT_TOKEN` + `DISCORD_CHANNEL_ID` | 主动引擎往 Discord 发消息至少需要 token 和目标 channel |
| Telegram 主动发送 | `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | 主动引擎往 Telegram 发消息至少需要 token 和目标 chat |
| Google Calendar | `GOOGLE_CALENDAR_ID` + `GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON` 或 `GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON_FILE` | 只要配置了 `GOOGLE_CALENDAR_ID`，校验脚本就会要求 service account |
| OpenWeather | `OPENWEATHER_LAT` + `OPENWEATHER_LON` + `OPENWEATHER_API_KEY` 或 `OPENWEATHER_API_KEY_FILE` | 只填坐标不填 key 会被生产校验判失败 |
| Codex ACP | `SAVC_CODEX_ACP_ENABLE=1` + `OPENAI_API_KEY` 或 `OPENAI_API_KEY_FILE` | 当前生产校验只认 OpenAI API key 作为 Codex ACP 鉴权前提 |
| Redis 缓存 | `SAVC_REDIS_URL` | 不填也能跑，只是回落 memory cache |
| MySQL 预留 | `MYSQL_URL` | 当前不属于硬要求 |

### 10.5 一句话判断

如果你只想尽快把系统跑起来:

- 本机裸跑: `config/.env.local` 存在 + 至少 1 个 provider key
- Docker 联调: `infra/docker/.env` 存在 + `OPENCLAW_GATEWAY_TOKEN` + 至少 1 个 provider key
- Docker 生产: `OPENCLAW_GATEWAY_TOKEN_FILE` + 至少 1 个 provider secret file + `VITE_SAVC_GATEWAY_URL=/gateway`
