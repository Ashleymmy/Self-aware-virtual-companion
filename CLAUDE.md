# CLAUDE.md — Claude Code 项目指令

## 项目概况

- 项目: Self-aware Virtual Companion (SAVC)
- 基于 OpenClaw 框架构建的 AI 虚拟伴侣系统
- 核心角色: 媛媛
- 运行时配置: `~/.openclaw/openclaw.json`
- 规划配置: `config/models.yaml`（草案，非运行时读取）

## 项目结构

```
packages/
├── core/       # 核心业务（agents, orchestrator, memory, persona, skills）
├── ui/         # 管理界面（Lit + Vite）
└── plugin/     # OpenClaw 插件（7 个 Tool）
config/         # 配置文件（agents SOUL模板, proactive, models, channels, privacy）
scripts/        # 脚本（setup, dev, openclaw CLI 封装）
├── runtime/    # 运行时守护（proactive, memory, persona）
├── test/       # 测试脚本
├── lifecycle/  # 阶段启用 + cron
└── infra/      # 基础设施（Docker, Git hooks, 安全扫描）
infra/docker/   # Docker 部署
openclaw/       # OpenClaw 框架占位（需接入新版）
docs/           # 项目文档 + 剥离文档
```

## 工作日志规则（每次会话必须执行）

1. 每次与用户完成一轮有效协作后，**必须**在 `docs/worklog/claude/` 下记录工作日志
2. 日志文件按日期命名：`docs/worklog/claude/YYYY-MM-DD.md`
3. 同一天多次对话，在同一文件中追加新的"记录 XX"段落
4. 每条日志至少包含：
   - `对话目标`
   - `执行内容`
   - `修改文件`（无修改则写"无"）
   - `验证结果`（无验证则写"未执行"）
   - `备注`（可选）
5. **严禁**写入密钥、令牌、账号密码等敏感信息
6. 用户明确要求"本次不记录日志"时可跳过
7. 注意：`docs/worklog/` 根目录是 Codex 的日志，`docs/worklog/claude/` 是 Claude Code 的日志，不要混用
