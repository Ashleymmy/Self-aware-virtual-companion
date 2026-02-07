# Phase Gap Matrix

## Scope
- Baseline source: `docs/beta项目构建方案.md`
- Tracking target: Phase 1 / Phase 2 / Phase 3 unchecked items
- Evidence style: code path + automated test path

## Phase 1
| Doc Item | Code Path | Test Path | Baseline |
|---|---|---|---|
| 记忆检索能力（关键词） | `scripts/memory_runtime.mjs` | `scripts/test_phase1_runtime.sh` | Gap |
| 7天/30天压缩能力 | `scripts/memory_runtime.mjs` | `scripts/test_phase1_runtime.sh` | Gap |
| 敏感信息写入防护 | `scripts/memory_runtime.mjs` | `scripts/test_phase1_runtime.sh` | Gap |
| Phase 1 勾选状态与证据同步 | `docs/beta项目构建方案.md` | `tests/phase1-test-report.md` | Gap |

## Phase 2
| Doc Item | Code Path | Test Path | Baseline |
|---|---|---|---|
| 常驻主动引擎（daemon） | `scripts/proactive_daemon.mjs` | `scripts/test_phase2.sh` | Gap |
| 真实天气 API 触发 | `scripts/proactive_daemon.mjs` | `scripts/test_phase2.sh` | Gap |
| 真实日历 API 触发 | `scripts/proactive_daemon.mjs` | `scripts/test_phase2.sh` | Gap |
| 文件变化/情感触发 | `scripts/proactive_daemon.mjs` | `scripts/test_phase2.sh` | Partial |
| 渠道分发编排 | `scripts/proactive_dispatcher.mjs` | `scripts/test_phase2.sh` | Gap |
| Phase 2 勾选状态与证据同步 | `docs/beta项目构建方案.md` | `tests/phase2-test-report.md` | Gap |

## Phase 3
| Doc Item | Code Path | Test Path | Baseline |
|---|---|---|---|
| tool-learner 真实发现源 | `scripts/tool_learner_runtime.mjs` | `scripts/test_phase3.sh` | Gap |
| tool-learner 五阶段闭环 | `scripts/tool_learner_runtime.mjs` | `scripts/test_phase3.sh` | Gap |
| self-reflection 非占位反思 | `scripts/self_reflection_runtime.mjs` | `scripts/test_phase3.sh` | Partial |
| 自动微调建议生成 | `scripts/self_reflection_runtime.mjs` | `scripts/test_phase3.sh` | Gap |
| 7天长期稳定性验证 | `scripts/test_phase3_longrun.sh` | `scripts/test_phase3_longrun.sh` | Gap |
| Phase 3 勾选状态与证据同步 | `docs/beta项目构建方案.md` | `tests/phase3-test-report.md` | Gap |

## Milestone Exit Mapping
| Milestone | Exit Evidence |
|---|---|
| M0 | `tests/phase-gap-matrix.md`, `scripts/test_phase_status.sh` |
| M1 | Phase 1 tests green + doc/report sync |
| M2 | Phase 2 tests green + live API smoke + doc/report sync |
| M3 | Phase 3 tests green + longrun + doc/report sync |
| M4 | `npm run -s test:all` + `tests/phase-all-test-report.md` + doc full sync |
