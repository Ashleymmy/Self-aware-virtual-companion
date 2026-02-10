---
name: memory-manager
description: SAVC 记忆管理系统 — 负责记忆读写、检索、压缩与画像更新
version: "1.0"
triggers:
  - on_conversation_start
  - on_conversation_end
  - on_keyword: "记得吗"
  - on_keyword: "你还记得"
dependencies:
  - fs
---

# memory-manager

## 目标
在不保存敏感原文的前提下，维护可追溯、可压缩、可检索的长期记忆上下文。

## 记忆写入流程（on_conversation_end）
1. 提取本轮会话关键信息（主题、偏好、事实、情绪信号）。
2. 分类写入：
   - `episodic/`: 当天会话摘要。
   - `semantic/`: 可复用的稳定信息。
   - `emotional/`: 关系状态与情绪轨迹。
3. 更新 `episodic/index.md` 以支持按日期和主题检索。
4. 对输出做隐私筛查，禁止记录密钥、密码、身份证号等敏感字段。

## 记忆读取策略（on_conversation_start）
加载顺序：
1. `semantic/user-profile.md`
2. `emotional/relationship.md`
3. 最近 3 天 `episodic/` 摘要 + `episodic/index.md` 命中项

上下文约束：
- 记忆注入总长度控制在 2000 tokens 内。
- 超限时优先保留：用户画像 > 关系状态 > 最近会话摘要。

## 记忆检索（on_keyword）
- Phase 1: 关键词匹配（文件名、标题、索引关键词）。
- Phase 4: 语义检索（semantic）与混合检索（hybrid）。
- semantic 触发条件：
  - 当用户查询与历史记忆存在同义表达或概念关联时，优先尝试语义检索。
  - 当关键词检索召回为空时，自动回退到语义检索。
- hybrid 触发条件：
  - 需要同时兼顾精准关键词命中与语义召回时启用。
  - 综合分：`score = α * semantic_similarity + (1-α) * keyword_confidence`。
- 返回格式：
  - 命中片段
  - 来源文件路径
  - 置信度（high/medium/low）
  - 相似度分数（score: 0-1）

## 压缩机制
- 单日情景记忆 > 1000 字：触发日内压缩。
- 7 天以上记录：合并周摘要。
- 30 天以上记录：合并月摘要。

压缩原则：
- 保留事实、偏好变化、关系里程碑。
- 删除重复寒暄与无效细节。

## 用户画像更新
触发条件：识别到新偏好、新背景信息、新限制条件。

更新策略：
- 新信息先标注为 tentative。
- 重复出现或用户确认后升级为 confirmed。

## 情感状态更新
触发条件：检测到明显情绪信号（低落、焦虑、兴奋、疲惫）。

写入位置：
- `emotional/mood-log.md`: 时间序列。
- `emotional/relationship.md`: 关系状态变化。

## 安全与隐私
- 不写入明文敏感信息。
- 不将敏感片段外发到第三方平台。
- 所有可追踪样例仅保留模板和匿名化摘要。
