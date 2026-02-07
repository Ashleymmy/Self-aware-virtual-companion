---
name: tool-learner
description: 自主发现与学习新工具的能力
version: "1.0"
triggers:
  - "学习使用*"
  - "教你用*"
  - "探索*工具"
  - on_schedule: "0 3 * * *"

dependencies:
  - memory-manager
  - mcp
config:
  discovery_sources:
    - mcp
    - local
  sandbox_required: true
  write_ops_require_user_ok: true
---

# tool-learner

## 目标
周期性发现新工具，完成文档学习、沙箱试验与经验固化。

## 学习流程（5 阶段）
1. 发现：扫描 MCP 服务列表与本地可用工具。
2. 文档学习：解析 schema 与使用示例。
3. 实验：在沙箱环境试调用。
4. 固化：记录成功模式到 `memory/procedural/`。
5. 泛化：建立相似工具的关联。

## 安全约束
- 仅从可信来源发现工具（官方 MCP / 审核过的技能库）。
- 任何写操作必须用户确认。
- 实验阶段默认沙箱/只读模式。

## 记忆写入
- `memory/tools/available.md`: 可用工具清单
- `memory/tools/learning-queue.md`: 待学习工具队列
- `memory/procedural/tool-usage.md`: 成功操作流程
