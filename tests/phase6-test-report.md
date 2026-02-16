# Phase 6 Test Report

> 日期: 2026-02-16
> 范围: Phase 6 基础层 + UI 运行时/通道集成（M-F1~M-F4 + M-F5 pre-integration）

## 执行命令

```bash
pnpm --dir savc-ui build
node tests/orchestrator/live2d.test.mjs
node tests/orchestrator/live2d-voice-chain.test.mjs
node tests/orchestrator/lifecycle.test.mjs
cd openclaw && pnpm exec vitest run extensions/savc-orchestrator/src/*.test.ts
bash scripts/test_phase6.sh
```

## 结果摘要

- [x] `live2d.mjs` 基础信号能力通过单测
- [x] `lifecycle.mjs` 的 `live2d` 执行分支可输出标准化信号标记
- [x] `decomposer + lifecycle + aggregator` 的 Live2D+Voice 串行链路通过端到端脚本验证
- [x] `savc_live2d_signal` 工具通过 Vitest
- [x] 网关下工具调用通过（voice + interaction + task 推断三类信号）
- [x] `savc_spawn_expert` 返回包含 `live2d` 信号桥接字段（可供前端直接消费）
- [x] `savc_agent_status` 在 completed 状态下返回 `live2d` 信号桥接字段
- [x] UI 端 `Live2D runtime` 可加载 manifest 并渲染待机状态（`savc-ui` build 通过）
- [x] UI 端 `interaction + voice` 信号统一入通道并驱动 runtime（`live2d-channel`）

## 验收要点映射（基础层）

- [x] 情绪表情联动信号：`emotion -> expression/motion`
- [x] 口型同步信号：`voice text -> lipSync frames`（mock）
- [x] 交互响应信号：`interactionType -> motion`
- [x] 任务文本推断：`task -> source/emotion/interaction`（`savc_live2d_signal`）
- [x] 专家执行桥接：`savc_spawn_expert.result -> live2d.signal`
- [x] 状态轮询桥接：`savc_agent_status.result -> live2d.signal`
- [x] UI 模型清单加载：`manifest -> runtime render`
- [x] 前端统一通道：`interaction/voice -> live2d-channel -> runtime`

## 备注

- `phase6-v1` 信号协议保持离线/Mock 友好格式，UI 通道可直接消费。
- M-F5 目前为 pre-integration；真实语音播放链路与聊天主视图联动仍在后续范围。
