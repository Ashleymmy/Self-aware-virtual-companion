---
name: self-reflection
description: 每日自我反思与持续成长
version: "1.0"
schedule: "0 23 * * *"
dependencies:
  - memory-manager
---

# self-reflection

## 目标
每日回顾对话质量、更新记忆，并生成成长日志。

## 流程
1. 回顾今日对话与主题分布
2. 自我评估（优点与改进点）
3. 知识提取与用户偏好更新
4. 技能评估与学习计划
5. 关系状态更新
6. 生成成长日志 `memory/growth/YYYY-MM-DD.md`

## 产出
- 成长日志：`memory/growth/YYYY-MM-DD.md`
- 月度总结：`memory/growth/monthly-summary/YYYY-MM.md`

## 安全约束
- `values.yaml` 的核心价值观不可自动修改
- `will_not_do` 边界不可自动修改
- 所有自动调整需写入成长日志可回滚
