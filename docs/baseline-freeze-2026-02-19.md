# SAVC 基线冻结说明（2026-02-19）

## 目标

在继续扩展功能前，先冻结一套可重复启动、可重复验收的工程基线，减少“环境差异 + 文档偏差”带来的排障成本。

## 当前工作区变更分类（以 `git status` 为准）

- 业务配置改动（需人工确认后提交）：
  - `scripts/setup.sh`
- 依赖锁文件变更（需与 `package.json` 一致性确认）：
  - `pnpm-lock.yaml`
- 测试产物更新（可保留或清理）：
  - `tests/artifacts/phase1-system-prompt.md`
- 文件权限变化（按需保留）：
  - `openclaw/openclaw.mjs`（100644 -> 100755）
- 未跟踪文件（按用途决定是否入库）：
  - `.claude/`
  - `docs/worklog/claude/2026-02-19.md`
  - `docs/原型.html`

## 最小可重复命令集

```bash
# 1) 环境检查
node -v
pnpm -v
bash --version

# 2) 核心阶段验收
bash scripts/test_phase4b.sh
bash scripts/test_phase5c.sh
bash scripts/test_phase5d.sh
bash scripts/test_phase5e.sh

# 3) 状态快照（quick）
bash scripts/test_phase_status.sh --quick
```

## 建议提交策略

1. 先提交“工程治理改动”（脚本兼容性、文档校准、安全扫描）。
2. 再单独提交“功能或配置改动”（例如 `scripts/setup.sh`）。
3. 测试产物单独提交或不提交，避免混入核心逻辑变更。
