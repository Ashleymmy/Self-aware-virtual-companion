# Phase 2 测试报告

## 范围
- 文档基准: `docs/beta项目构建方案.md`
- 当前阶段: Phase 2（主动交互引擎）

## 自动化检查（可重复执行）
- 运行命令: `bash scripts/test_phase2.sh`
- 送达验证: `PHASE2_SEND=1 bash scripts/test_phase2.sh`
- 覆盖范围:
  - 免打扰时段拦截
  - 每日消息上限
  - 空闲触发判断
  - 主动消息生成
  - daemon tick 调度入口（file_change / emotion_support）
  - 渠道分发器（web dry-run / openclaw deliver / discord direct fallback）
  - Google Calendar + OpenWeather live smoke（默认严格缺变量即 FAIL）
  - Discord 发送链路（可选）

## 验收清单
- [x] `savc-core/skills/proactive-engine/SKILL.md` 完整定义（schedule/trigger/config）
- [x] `config/channels.yaml` 已补全（Telegram/Discord/Web）
- [x] 主动引擎运行时逻辑验证（`scripts/proactive_runtime.mjs`）
- [x] daemon 入口 + 分发器脚本可用（`scripts/proactive_daemon.mjs` / `scripts/proactive_dispatcher.mjs`）
- [x] 定时触发与免打扰验证（`scripts/test_phase2.sh`）
- [x] 至少一个渠道可用（Discord 实测送达，`PHASE2_SEND=1`）
- [x] Phase2 cron 管理脚本可用（`scripts/phase2_cron_*.sh`）

## 运行记录
- `scripts/test_phase2.sh`: 通过核心用例；当 live 变量缺失时按严格模式失败
- `PHASE2_SEND=1 PHASE2_LIVE_STRICT=0 scripts/test_phase2.sh`: 触发真实 Discord 送达验证（`messageId=1469729375523045611`）
- 当本机缺少 Docker 时，`scripts/proactive_dispatcher.mjs` 会在 Discord 渠道自动从 openclaw 发送回退到 Discord REST 直连发送

## 结论
- Phase 2 的主动调度与分发链路已具备，Discord 实送达可在无 Docker 环境下通过 fallback 保持可用；Google/OpenWeather live 联调仍由变量控制并默认严格校验。
