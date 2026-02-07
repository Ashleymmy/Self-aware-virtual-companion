#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
TOOL_RUNTIME="${REPO_ROOT}/scripts/tool_learner_runtime.mjs"
REFLECT_RUNTIME="${REPO_ROOT}/scripts/self_reflection_runtime.mjs"
MEMORY_RUNTIME="${REPO_ROOT}/scripts/memory_runtime.mjs"
TUNING_RUNTIME="${REPO_ROOT}/scripts/persona_tuning_runtime.mjs"

TMP_ROOT="/tmp/savc_phase3_runtime"
WORKSPACE="${TMP_ROOT}/savc-core"

pass_count=0
fail_count=0

pass() {
  echo "[PASS] $*"
  pass_count=$((pass_count + 1))
}

fail() {
  echo "[FAIL] $*"
  fail_count=$((fail_count + 1))
}

require_file() {
  local file="$1"
  if [[ -f "${REPO_ROOT}/${file}" ]]; then
    pass "file exists: ${file}"
  else
    fail "missing file: ${file}"
  fi
}

require_contains() {
  local file="$1"
  local pattern="$2"
  if rg -q --fixed-strings "${pattern}" "${REPO_ROOT}/${file}"; then
    pass "${file} contains '${pattern}'"
  else
    fail "${file} missing '${pattern}'"
  fi
}

# 1) Required files
require_file "savc-core/skills/tool-learner/SKILL.md"
require_file "savc-core/skills/self-reflection/SKILL.md"
require_file "scripts/tool_learner_runtime.mjs"
require_file "scripts/self_reflection_runtime.mjs"
require_file "scripts/persona_tuning_runtime.mjs"
require_file "scripts/phase3_run_daily.sh"
require_file "scripts/phase3_run_monthly.sh"
require_file "scripts/phase3_cron_install.sh"
require_file "scripts/phase3_cron_remove.sh"
require_file "scripts/test_phase3_longrun.sh"

# 2) SKILL checks
require_contains "savc-core/skills/tool-learner/SKILL.md" "name: tool-learner"
require_contains "savc-core/skills/tool-learner/SKILL.md" "on_schedule"
require_contains "savc-core/skills/self-reflection/SKILL.md" "name: self-reflection"
require_contains "savc-core/skills/self-reflection/SKILL.md" "schedule: \"0 23 * * *\""

# 3) Growth monthly summary directory
if [[ -d "${REPO_ROOT}/savc-core/memory/growth/monthly-summary" ]]; then
  pass "growth/monthly-summary directory exists"
else
  fail "growth/monthly-summary directory missing"
fi

# 4) Runtime functional checks (in temp workspace)
rm -rf "${TMP_ROOT}"
mkdir -p "${WORKSPACE}"
cp -R "${REPO_ROOT}/savc-core/memory" "${WORKSPACE}/memory"
cp -R "${REPO_ROOT}/savc-core/persona" "${WORKSPACE}/persona"

# Seed episodic memory for auto-summary
node "${MEMORY_RUNTIME}" write \
  --workspace "${WORKSPACE}" \
  --date "2026-02-07" \
  --topic "Phase3" \
  --summary "启动工具学习与自省系统" \
  --mood "积极" >/tmp/phase3_memory_seed.log 2>&1

# 4.1 discover (real source)
node "${TOOL_RUNTIME}" discover \
  --repo "${REPO_ROOT}" \
  --workspace "${WORKSPACE}" \
  --source "openclaw-skills" \
  --eligible-only true \
  --date "2026-02-07" >/tmp/phase3_tool_discover.log 2>&1

if rg -q --fixed-strings "weather" "${WORKSPACE}/memory/tools/available.md"; then
  pass "tool discovery updated available.md from openclaw source"
else
  fail "tool discovery missing weather in available.md"
fi

if rg -q --fixed-strings "[pending] weather" "${WORKSPACE}/memory/tools/learning-queue.md"; then
  pass "tool discovery updated learning-queue.md"
else
  fail "tool discovery missing weather in learning-queue.md"
fi

if [[ -f "${WORKSPACE}/memory/tools/weather/schema.md" ]] \
  && [[ -f "${WORKSPACE}/memory/tools/weather/examples.md" ]] \
  && [[ -f "${WORKSPACE}/memory/tools/weather/mastery-level.md" ]]; then
  pass "tool scaffold created"
else
  fail "tool scaffold missing"
fi

# 4.2 learn
node "${TOOL_RUNTIME}" learn \
  --repo "${REPO_ROOT}" \
  --workspace "${WORKSPACE}" \
  --tool "weather" \
  --date "2026-02-07" >/tmp/phase3_tool_learn.log 2>&1

if rg -q --fixed-strings "## Metadata" "${WORKSPACE}/memory/tools/weather/schema.md"; then
  pass "tool learn wrote schema metadata"
else
  fail "tool learn missing metadata"
fi

# 4.3 experiment
if node "${TOOL_RUNTIME}" experiment \
  --repo "${REPO_ROOT}" \
  --workspace "${WORKSPACE}" \
  --tool "weather" \
  --scenario "phase3-test" \
  --date "2026-02-07" >/tmp/phase3_tool_experiment.log 2>&1; then
  pass "tool experiment command succeeded"
else
  fail "tool experiment command failed"
fi

if rg -q --fixed-strings "status: success" "${WORKSPACE}/memory/tools/weather/examples.md"; then
  pass "tool experiment recorded success"
else
  fail "tool experiment result missing"
fi

# 4.4 solidify
node "${TOOL_RUNTIME}" solidify \
  --workspace "${WORKSPACE}" \
  --tool "weather" \
  --date "2026-02-07" >/tmp/phase3_tool_solidify.log 2>&1

if rg -q --fixed-strings "### weather" "${WORKSPACE}/memory/procedural/tool-usage.md"; then
  pass "solidify updated procedural tool-usage"
else
  fail "solidify missing in procedural tool-usage"
fi

# 4.5 generalize
node "${TOOL_RUNTIME}" generalize \
  --workspace "${WORKSPACE}" \
  --tool "weather" \
  --date "2026-02-07" >/tmp/phase3_tool_generalize.log 2>&1

if rg -q --fixed-strings "related_tools" "${WORKSPACE}/memory/tools/weather/mastery-level.md"; then
  pass "generalize updated mastery related tools"
else
  fail "generalize missing related tools"
fi

# 5) Daily reflection and persona tuning
node "${REFLECT_RUNTIME}" daily \
  --workspace "${WORKSPACE}" \
  --date "2026-02-07" \
  --self-score 2 >/tmp/phase3_reflection_daily.log 2>&1

GROWTH_FILE="${WORKSPACE}/memory/growth/2026-02-07.md"
if [[ -f "${GROWTH_FILE}" ]]; then
  pass "daily growth log created"
else
  fail "daily growth log missing"
fi

if rg -q --fixed-strings "conversation_count: 1" "${GROWTH_FILE}" \
  && rg -q --fixed-strings "Phase3" "${GROWTH_FILE}"; then
  pass "daily growth log uses episodic summary"
else
  fail "daily growth log missing episodic summary"
fi

if rg -q --fixed-strings "待补充" "${GROWTH_FILE}"; then
  fail "daily growth log still has placeholders"
else
  pass "daily growth log has non-placeholder content"
fi

if rg -q --fixed-strings "## 人格微调" "${GROWTH_FILE}"; then
  pass "daily growth log includes persona tuning section"
else
  fail "daily growth log missing persona tuning section"
fi

node "${TUNING_RUNTIME}" apply \
  --workspace "${WORKSPACE}" \
  --date "2026-02-07" \
  --user-ok >/tmp/phase3_persona_apply.log 2>&1 || true

if rg -q --fixed-strings "## 人格微调记录" "${GROWTH_FILE}"; then
  pass "persona tuning record appended to growth log"
else
  fail "persona tuning record missing"
fi

if rg -q --fixed-strings "[applied]" "${GROWTH_FILE}"; then
  pass "persona tuning marked directives as applied"
else
  fail "persona tuning did not mark directives as applied"
fi

# 6) Monthly reflection
node "${REFLECT_RUNTIME}" monthly \
  --workspace "${WORKSPACE}" \
  --month "2026-02" >/tmp/phase3_reflection_monthly.log 2>&1

MONTHLY_FILE="${WORKSPACE}/memory/growth/monthly-summary/2026-02.md"
if [[ -f "${MONTHLY_FILE}" ]]; then
  pass "monthly summary created"
else
  fail "monthly summary missing"
fi

if rg -q --fixed-strings "对话总量: 1" "${MONTHLY_FILE}"; then
  pass "monthly summary aggregates conversation count"
else
  fail "monthly summary aggregation missing"
fi

if rg -q --fixed-strings "无新增工具记录" "${MONTHLY_FILE}"; then
  fail "monthly summary failed to collect learned tools"
else
  pass "monthly summary includes learned tools"
fi

# Summary
if (( fail_count > 0 )); then
  echo "=== Phase 3 Test Summary ==="
  echo "PASS: ${pass_count}"
  echo "FAIL: ${fail_count}"
  exit 1
fi

echo "=== Phase 3 Test Summary ==="
echo "PASS: ${pass_count}"
echo "FAIL: ${fail_count}"
