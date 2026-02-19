# SAVC Workspace — AGENTS

本目录（`savc-core/`）作为 OpenClaw 的 workspace root。

## 可用 Agent 列表

使用 `savc_spawn_expert` 时，`agent` 参数必须是以下名称之一：

| Agent | 描述 | 适用场景 |
|-------|------|---------|
| `companion` | 情感陪伴 Agent | 陪聊、安抚、情感支持、日常关心 |
| `memory` | 记忆管理 Agent | 记忆检索、回忆确认、画像更新 |
| `technical` | 技术专家 Agent | 代码生成、技术排障、架构建议 |
| `creative` | 创意 Agent | 写作、诗歌、故事、创意内容 |
| `tooling` | 工具集成 Agent | Web 搜索、天气查询、API 调用、外部工具 |
| `voice` | 语音 Agent | TTS 语音合成、语音通话 |
| `vision` | 视觉 Agent | 图像理解、截图分析 |
| `vibe-coder` | 编程 Agent | 代码编写、项目脚手架、自动化脚本 |

**注意**：没有专门的 `weather` agent，天气查询请使用 `tooling` agent。

## 工作区约定

- **禁止提交密钥**：所有密钥只放在 `config/.env.local`（已在 `.gitignore` 中忽略）。
- **记忆默认本地私有**：`savc-core/memory/**` 默认忽略提交（仅保留目录骨架）。

## 目录

- `persona/`：人格定义与说话风格
- `skills/`：自定义 Skills
- `memory/`：本地记忆数据（默认不入库）
- `agents/`：Agent YAML 定义文件
