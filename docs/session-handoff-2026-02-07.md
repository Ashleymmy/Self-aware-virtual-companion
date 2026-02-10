# SAVC Session Handoff (2026-02-07 20:45 CST)

## Scope
- Active working copy: `/home/min/SAVC/Self-aware-virtual-companion`
- Goal: preserve Phase 1/2 progress + push setup + test status.

## Current Repo Snapshot (`/home/min/...`)
- `git status -sb`: clean (only this handoff file untracked before save)
- Last pushed commits:
  - `017bf49` — Complete Phase 1 persona, memory, and dialogue tests
  - `2a8424d` — Implement Phase 2 proactive engine scaffolding

## Phase 1 Status
- Phase 1 fully passed (dialogue replay + unified tests).
- Reports/artifacts:
  - `tests/phase1-test-report.md`
  - `tests/phase1-dialogue-report.md`
  - `tests/artifacts/phase1-dialogue-transcript.md`
- Note: `npm run -s test:all` may show OpenClaw health WARN if gateway isn’t running.

## Phase 2 Status
- proactive-engine Skill completed:
  - `savc-core/skills/proactive-engine/SKILL.md`
  - `scripts/proactive_runtime.mjs`
  - `scripts/test_phase2.sh`
  - `tests/phase2-test-report.md`
- Channels config updated: `config/channels.yaml`
- Tools guardrails updated: `savc-core/TOOLS.md`
- Discord delivery tested (success). If re-running delivery: use `PHASE2_SEND=1 bash scripts/test_phase2.sh`.
- Note: OpenClaw memory embeddings log 401 for OPENAI key, but Discord delivery still succeeded.

## 2026-02-08 Discord Reply Hotfix (01:27 CST)
- Symptom:
  - Bot online in Discord server but intermittently not replying.
- Root causes identified:
  - Guild message mention gating triggered `reason: "no-mention"` in logs.
  - DM policy was `pairing` and user pairing request had not been approved yet.
  - Historical model drift showed OpenAI 401 fallback noise in logs.
- Runtime fixes applied (`~/.openclaw/openclaw.json`):
  - `channels.discord.groupPolicy = "allowlist"`
  - `channels.discord.dm = { enabled: true, policy: "pairing" }`
  - `channels.discord.guilds.1395581665384075354.channels.1469643433026261067.allow = true`
  - `channels.discord.guilds.1395581665384075354.channels.1469643433026261067.requireMention = false`
- Pairing fix:
  - Approved request code `HFCYK4Z2` (user `1395577363567218813`), pending list now empty.
- Model stabilization:
  - Default model pinned to `anyrouter/claude-opus-4-5-20251101`.
  - Fallback list reset to `anyrouter/claude-sonnet-4-5-20250929`.
- Service actions:
  - Restarted `openclaw-gateway.service`.
  - `openclaw channels status --probe` reports Discord `works, audit ok`.
  - `openclaw doctor` reports no channel security warnings.
- Repo alignment:
  - `config/channels.yaml` updated with `discord.enabled: true`.
  - Added note that Discord auto-reply runtime source of truth is `~/.openclaw/openclaw.json` (not repo YAML alone).
- Outcome:
  - User validated channel and DM conversation both working normally.

## Push/Auth Notes
- Remote switched to SSH: `git@github.com:Ashleymmy/Self-aware-virtual-companion.git`
- SSH key generated: `~/.ssh/id_ed25519` and added to GitHub.
- `ssh -T git@github.com` returns success banner.

## Resume Commands
```bash
cd /home/min/SAVC/Self-aware-virtual-companion
git status -sb
npm run -s test:all
# Optional: delivery check (Discord)
PHASE2_SEND=1 bash scripts/test_phase2.sh
```

## Next Work Item
- Enter Phase 3 (tool-learner + self-reflection) implementation per `docs/beta项目构建方案.md`.

---

## 2026-02-10 Phase 4 Closure + Phase 5 Kickoff (Current Session)

### Scope
- Complete Phase 4 wrap-up items:
  - Auto-Recall
  - Auto-Capture
  - Memory time-decay scoring
  - Performance baseline pressure test
  - `sessions_send` real-mode integration path
  - Local embedding mode
- Start Phase 5 (Vibe Coding) with an implementable baseline.

### Key Changes Implemented
- Memory semantic/runtime:
  - `scripts/memory_semantic.mjs`
    - Added embedding mode `local` (OpenAI-compatible local endpoint; default path `/api/embeddings`)
    - Added decay-aware ranking (`rawScore`, `decay`, `ageDays`)
    - Added `auto-recall` and `auto-capture` APIs + CLI subcommands
  - `scripts/memory_runtime.mjs`
    - Added `auto-recall` command
    - Added `auto-capture` command
  - `config/.env.example`
    - Added local embedding and decay related env vars
- Orchestrator plugin (real backend):
  - `openclaw/extensions/savc-orchestrator/src/real-session-adapter.ts`
    - Added `sessions_send` adapter (`sendRealAgentMessage`)
  - `openclaw/extensions/savc-orchestrator/src/tool-spawn-expert.ts`
    - Added optional params `useSessionsSend`, `handoffMessage`, `handoffTimeoutSeconds`
    - Added structured `details.data.spawn.sessionsSend` output
    - Added post-run `autoCapture` branch when memory module supports it
- Phase 4b perf gate:
  - Added `scripts/test_phase4b_perf.sh` and npm script `test:phase4b:perf`
- Phase 5c kickoff:
  - Added `savc-core/agents/vibe-coder.yaml`
  - Extended routing for vibe-coding intent in `savc-core/orchestrator/router.mjs`
  - Added model mapping in `config/models.yaml`
  - Added `scripts/test_phase5c.sh` and npm script `test:phase5c`

### Tests Executed (2026-02-10)
- Passed:
  - `bash scripts/test_phase4a.sh` (PASS 25 / FAIL 0)
  - `bash scripts/test_phase4b.sh` (PASS 23 / FAIL 0)
  - `bash scripts/test_phase4b_plugin.sh` (PASS 14 / FAIL 0)
  - `bash scripts/test_phase4b_plugin_real.sh` (PASS 12 / WARN 1 / FAIL 0; Discord env missing => SKIP)
  - `bash scripts/test_phase4b_perf.sh` (PASS 6 / FAIL 0)
  - `bash scripts/test_phase5c.sh` (PASS 4 / FAIL 0)
  - `cd openclaw && pnpm exec vitest run extensions/savc-orchestrator/src/*.test.ts`
- Known existing blocker (unchanged):
  - `npm run -s test:phase2` still shows live env missing (`FAIL 1`) and is treated as historical/environmental.

### Documentation Synced
- Updated:
  - `docs/记忆系统语义检索升级方案.md`
  - `docs/多Agent协同编排方案.md`
  - `docs/SAVC功能拓展路线图.md`
  - `tests/phase4-test-report.md`

### Current Working Tree Notes
- Repo is intentionally dirty with Phase 4/5 related updates.
- `tests/artifacts/phase1-system-prompt.md` was regenerated during regression runs and is currently modified.
- OpenClaw submodule contains untracked plugin directory:
  - `openclaw/extensions/savc-orchestrator/`
