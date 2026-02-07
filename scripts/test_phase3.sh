#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
TOOL_RUNTIME="${REPO_ROOT}/scripts/tool_learner_runtime.mjs"
REFLECT_RUNTIME="${REPO_ROOT}/scripts/self_reflection_runtime.mjs"

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
  local path="$1"
  if [[ -f "${REPO_ROOT}/${path}" ]]; then
    pass "file exists: ${path}"
  else
    fail "missing file: ${path}"
  fi
}

require_contains() {
  local path="$1"
  local pattern="$2"
  if rg -q --fixed-strings "${pattern}" "${REPO_ROOT}/${path}"; then
    pass "${path} contains '${pattern}'"
  else
    fail "${path} missing '${pattern}'"
  fi
}

# 1) Required files
require_file "savc-core/skills/tool-learner/SKILL.md"
require_file "savc-core/skills/self-reflection/SKILL.md"
require_file "scripts/tool_learner_runtime.mjs"
require_file "scripts/self_reflection_runtime.mjs"

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

cat > "${TMP_ROOT}/tools.json" <<'JSON'
[
  "mcp.calendar",
  "mcp.weather"
]
JSON

node "${TOOL_RUNTIME}" discover \
  --workspace "${WORKSPACE}" \
  --tools-json "${TMP_ROOT}/tools.json" \
  --date "2026-02-07" >/tmp/phase3_tool_discover.log 2>&1

if rg -q --fixed-strings "mcp.calendar" "${WORKSPACE}/memory/tools/available.md"; then
  pass "tool discovery updated available.md"
else
  fail "tool discovery missing in available.md"
fi

if rg -q --fixed-strings "mcp.weather" "${WORKSPACE}/memory/tools/learning-queue.md"; then
  pass "tool discovery updated learning-queue.md"
else
  fail "tool discovery missing in learning-queue.md"
fi

node "${REFLECT_RUNTIME}" daily \
  --workspace "${WORKSPACE}" \
  --date "2026-02-07" \
  --conversation-count 5 \
  --topics "OpenClaw,Phase3" \
  --self-score 4 >/tmp/phase3_reflection_daily.log 2>&1

if [[ -f "${WORKSPACE}/memory/growth/2026-02-07.md" ]]; then
  pass "daily growth log created"
else
  fail "daily growth log missing"
fi

node "${REFLECT_RUNTIME}" monthly \
  --workspace "${WORKSPACE}" \
  --month "2026-02" >/tmp/phase3_reflection_monthly.log 2>&1

if [[ -f "${WORKSPACE}/memory/growth/monthly-summary/2026-02.md" ]]; then
  pass "monthly summary created"
else
  fail "monthly summary missing"
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
