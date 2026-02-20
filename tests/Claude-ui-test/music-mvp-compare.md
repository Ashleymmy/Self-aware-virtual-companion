# Music MVP 对比（原版 vs yuanyuan版）

## 对比对象
- 原版（Codex 直出）: `tests/Claude-ui-test/music-mvp.html`
- yuanyuan 版（PM 提纲驱动落地）: `tests/Claude-ui-test/music-mvp-yuanyuan.html`
- yuanyuan PM 提纲原文: `tests/Claude-ui-test/music-mvp-yuanyuan-prd.txt`

## 核心差异
| 维度 | 原版（Codex 直出） | yuanyuan 版（PM 驱动） |
|---|---|---|
| 视觉风格 | 深色霓虹实验风 | 明亮产品化仪表盘风 |
| 推荐模型 | 经验加权：情绪/场景/能量/语言 + like/skip + 标签 + 探索 | 明确四因子：`0.35 Sim + 0.25 Pop + 0.25 Feedback + 0.15 Context` |
| 数据结构 | `likes/skips/plays + tag:*` 混合记录 | `prefTag + statsByTrack(likes/skips/quickSkips/completes/plays)` 分层更清晰 |
| 可解释性 | 文字理由（top 原因） | 文字理由 + 四因子打分条（Sim/Pop/Fb/Ctx） |
| 行为反馈 | like/skip 强化与惩罚 | like/skip + quickSkip + complete，反馈信号更细 |
| 冷启动策略 | 默认画像 + 曲库打分 | 默认画像 + 热度项 `Pop` 兜底 |
| 持久化 | `localStorage` | `localStorage` |
| 交互覆盖 | 播放/喜欢/跳过/加队列/下一首 | 播放/喜欢/跳过/加队列/下一首 |

## 结论
- 如果你要**更像产品可讨论版本**（公式透明、指标可解释、后续易接 A/B），优先 `music-mvp-yuanyuan.html`。
- 如果你要**更强视觉表现与体验冲击**，原版 `music-mvp.html` 更合适。
- 两者都满足“本地最小开发环境可验证”的目标；建议下一步把两版共用一个后端推荐 API 进行 A/B。
