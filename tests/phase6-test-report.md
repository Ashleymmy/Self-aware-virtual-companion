# Phase 6 Test Report

> 日期: 2026-02-15
> 范围: Phase 6 非 UI 基础层（Live2D 信号协议）

## 执行命令

```bash
node tests/orchestrator/live2d.test.mjs
node tests/orchestrator/lifecycle.test.mjs
cd openclaw && pnpm exec vitest run extensions/savc-orchestrator/src/*.test.ts
bash scripts/test_phase6.sh
```

## 结果摘要

- [x] `live2d.mjs` 基础信号能力通过单测
- [x] `lifecycle.mjs` 的 `live2d` 执行分支可输出标准化信号标记
- [x] `savc_live2d_signal` 工具通过 Vitest
- [x] 网关下工具调用通过（voice + interaction 两类信号）

## 验收要点映射（基础层）

- [x] 情绪表情联动信号：`emotion -> expression/motion`
- [x] 口型同步信号：`voice text -> lipSync frames`（mock）
- [x] 交互响应信号：`interactionType -> motion`

## 备注

- 本阶段不包含管理界面重构，不修改 Live2D 前端渲染页面。
- `phase6-v1` 信号协议为离线/Mock 友好格式，便于后续 UI 直接消费。
