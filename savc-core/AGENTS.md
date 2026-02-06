# SAVC Workspace — AGENTS

本目录（`savc-core/`）作为 OpenClaw 的 workspace root。

## 工作区约定（Phase 0）

- **禁止提交密钥**：所有密钥只放在 `config/.env.local`（已在 `.gitignore` 中忽略）。
- **记忆默认本地私有**：`savc-core/memory/**` 默认忽略提交（仅保留目录骨架）。
- **结构稳定**：Phase 0 只搭骨架；Phase 1+ 再实现人格/记忆/主动交互等逻辑。

## 目录

- `persona/`：人格定义与说话风格（Phase 1 落地）
- `skills/`：自定义 Skills（Phase 1+ 落地）
- `memory/`：本地记忆数据（默认不入库）

