#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
MEMORY_RUNTIME="${REPO_ROOT}/scripts/memory_runtime.mjs"
TOOL_RUNTIME="${REPO_ROOT}/scripts/tool_learner_runtime.mjs"
REFLECT_RUNTIME="${REPO_ROOT}/scripts/self_reflection_runtime.mjs"
TUNING_RUNTIME="${REPO_ROOT}/scripts/persona_tuning_runtime.mjs"

TMP_ROOT="/tmp/savc_phase3_longrun"
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

rm -rf "${TMP_ROOT}"
mkdir -p "${WORKSPACE}"
cp -R "${REPO_ROOT}/savc-core/memory" "${WORKSPACE}/memory"
cp -R "${REPO_ROOT}/savc-core/persona" "${WORKSPACE}/persona"

before_core="$(awk '/^core_values:/,/^boundaries:/' "${WORKSPACE}/persona/values.yaml" | sha256sum | awk '{print $1}')"
before_will_not_do="$(awk '/^  will_not_do:/,/^topics:/' "${WORKSPACE}/persona/values.yaml" | sha256sum | awk '{print $1}')"

dates=(2026-02-01 2026-02-02 2026-02-03 2026-02-04 2026-02-05 2026-02-06 2026-02-07)

topics=("OpenClaw" "记忆系统" "工具学习" "调度系统" "情绪触发" "人格微调" "回归测试")
idx=0

for d in "${dates[@]}"; do
  topic="${topics[$idx]}"

  node "${MEMORY_RUNTIME}" write \
    --workspace "${WORKSPACE}" \
    --date "${d}" \
    --topic "${topic}" \
    --summary "第${idx}天，持续推进 Phase3 长期运行验证。" \
    --mood "稳定" >/tmp/phase3_longrun_memory_${d}.log 2>&1

  if [[ "$d" == "2026-02-01" ]]; then
    node "${TOOL_RUNTIME}" discover \
      --repo "${REPO_ROOT}" \
      --workspace "${WORKSPACE}" \
      --source "openclaw-skills" \
      --eligible-only true \
      --date "${d}" >/tmp/phase3_longrun_discover.log 2>&1

    node "${TOOL_RUNTIME}" learn \
      --repo "${REPO_ROOT}" \
      --workspace "${WORKSPACE}" \
      --tool "weather" \
      --date "${d}" >/tmp/phase3_longrun_learn.log 2>&1

    node "${TOOL_RUNTIME}" experiment \
      --repo "${REPO_ROOT}" \
      --workspace "${WORKSPACE}" \
      --tool "weather" \
      --scenario "longrun-smoke" \
      --date "${d}" >/tmp/phase3_longrun_experiment.log 2>&1

    node "${TOOL_RUNTIME}" solidify \
      --workspace "${WORKSPACE}" \
      --tool "weather" \
      --date "${d}" >/tmp/phase3_longrun_solidify.log 2>&1

    node "${TOOL_RUNTIME}" generalize \
      --workspace "${WORKSPACE}" \
      --tool "weather" \
      --date "${d}" >/tmp/phase3_longrun_generalize.log 2>&1
  fi

  node "${REFLECT_RUNTIME}" daily \
    --workspace "${WORKSPACE}" \
    --date "${d}" \
    --self-score 4 >/tmp/phase3_longrun_daily_${d}.log 2>&1

  node "${TUNING_RUNTIME}" apply \
    --workspace "${WORKSPACE}" \
    --date "${d}" \
    --user-ok >/tmp/phase3_longrun_tuning_${d}.log 2>&1 || true

  idx=$((idx + 1))
done

node "${REFLECT_RUNTIME}" monthly \
  --workspace "${WORKSPACE}" \
  --month "2026-02" >/tmp/phase3_longrun_monthly.log 2>&1

# Assertions
for d in "${dates[@]}"; do
  if [[ -f "${WORKSPACE}/memory/growth/${d}.md" ]]; then
    pass "growth log exists for ${d}"
  else
    fail "growth log missing for ${d}"
  fi
done

if [[ -f "${WORKSPACE}/memory/growth/monthly-summary/2026-02.md" ]]; then
  pass "monthly summary generated"
else
  fail "monthly summary missing"
fi

if rg -q --fixed-strings "## 人格微调记录" "${WORKSPACE}"/memory/growth/2026-02-*.md; then
  pass "tuning records generated"
else
  fail "tuning records missing"
fi

after_core="$(awk '/^core_values:/,/^boundaries:/' "${WORKSPACE}/persona/values.yaml" | sha256sum | awk '{print $1}')"
after_will_not_do="$(awk '/^  will_not_do:/,/^topics:/' "${WORKSPACE}/persona/values.yaml" | sha256sum | awk '{print $1}')"

if [[ "${before_core}" == "${after_core}" ]]; then
  pass "core_values remained unchanged"
else
  fail "core_values changed unexpectedly"
fi

if [[ "${before_will_not_do}" == "${after_will_not_do}" ]]; then
  pass "will_not_do remained unchanged"
else
  fail "will_not_do changed unexpectedly"
fi

if rg -q --fixed-strings "topics.careful.add" "${WORKSPACE}/memory/growth"/*.md; then
  fail "unsafe careful-topic tuning directive detected"
else
  pass "no unsafe careful-topic tuning directive"
fi

echo "=== Phase 3 Longrun Summary ==="
echo "PASS: ${pass_count}"
echo "FAIL: ${fail_count}"

if (( fail_count > 0 )); then
  exit 1
fi
