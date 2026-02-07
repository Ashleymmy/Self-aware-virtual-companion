---
name: proactive-engine
description: SAVC 主动交互引擎 — 基于时间/事件/情感的主动对话触发
version: "1.0"
daemon: true
schedule:
  morning_greeting: "0 8 * * *"
  idle_check: "*/30 * * * *"
  midday_reminder: "0 12 * * *"
  evening_reflection: "0 22 * * *"
  weekly_review: "0 10 * * 1"
triggers:
  - time
  - event
  - emotion
dependencies:
  - node-cron
  - chokidar
config:
  max_daily_messages: 5
  quiet_hours_start: "23:00"
  quiet_hours_end: "07:00"
  idle_threshold_hours: 4
  default_channel: "discord"
  default_target_env: "DISCORD_CHANNEL_ID"
---

# proactive-engine

## 目标
以低打扰的方式主动触达用户，提供时间提醒、情感关怀与事件跟进。

## 关键约束
- 每日主动消息上限: 5 条。
- 23:00-07:00 禁止主动消息（可配置）。
- 用户可配置免打扰时段与目标渠道。
- 主动内容必须符合 `PERSONA.md` 与 `SOUL.md` 的人格约束。

## 模块设计
- **Scheduler**: 负责 Cron 任务调度。
- **TriggerEvaluator**: 判断是否满足触发条件（时间/事件/情感）。
- **MessageGenerator**: 生成符合人格的主动消息。
- **RateLimiter**: 限制每日消息数量。
- **QuietHoursGuard**: 免打扰时段拦截。

## 触发器
### 时间驱动
- morning_greeting (08:00): 天气 + 日程 + 个性化问候。
- midday_reminder (12:00): 休息/吃饭提醒。
- evening_reflection (22:00): 今日回顾 + 明日提醒。
- weekly_review (周一 10:00): 每周回顾。

### 事件驱动
- 文件变化: `chokidar` 监听工作目录。
- 日历事件: 通过 MCP 日历集成（Phase 2.2.2）。
- 天气变化: API 定时轮询（可选）。

### 情感驱动
- 久未互动: 超过 `idle_threshold_hours` 触发关心。
- 情绪低落: 近期情绪评分下降时触发支持。
- 重要话题跟进: 从记忆中识别重要事项后跟进。

## 发送路径
```
proactive-engine -> 生成消息
               -> OpenClaw CLI (agent --local --deliver)
               -> Channel Adapter (Discord/Telegram/Web)
```

## 运行建议
- 默认以 dry-run 模式验证触发逻辑。
- 渠道发送需要正确配置 `config/channels.yaml` 与 `.env.local`。
- 对外发送必须尊重 QuietHours 与 RateLimiter。

## 参考实现（Phase 2 Runtime）
- `scripts/proactive_runtime.mjs`: 触发判断、消息生成与限频检查。
- `scripts/test_phase2.sh`: 自动化验证。
