#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
RUNTIME_SCRIPT="${REPO_ROOT}/scripts/memory_runtime.mjs"

TMP_ROOT="/tmp/savc_phase1_runtime"
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

long_summary=""
for _ in $(seq 1 80); do
  long_summary+="本次会话聚焦 Phase1 联调、记忆可追溯与上下文加载策略。"
done

node "${RUNTIME_SCRIPT}" write \
  --workspace "${WORKSPACE}" \
  --date "2026-02-06" \
  --topic "Phase1联调" \
  --summary "${long_summary}" \
  --mood "积极" \
  --fact "用户当前关注 Phase1 可执行闭环" \
  --preference "希望排障时先结论后步骤" \
  --relationship-note "建立了稳定的迭代节奏" >/tmp/phase1_runtime_write.log 2>&1

DAY_FILE="${WORKSPACE}/memory/episodic/2026-02/2026-02-06.md"
if [[ -f "${DAY_FILE}" ]]; then
  pass "episodic day file written"
else
  fail "episodic day file missing"
fi

if rg -q --fixed-strings "Phase1联调" "${DAY_FILE}"; then
  pass "topic persisted to episodic memory"
else
  fail "topic missing in episodic memory"
fi

CONTEXT_OUT="${TMP_ROOT}/context.md"
node "${RUNTIME_SCRIPT}" load \
  --workspace "${WORKSPACE}" \
  --days 3 \
  --max-tokens 2000 \
  --output "${CONTEXT_OUT}" >/tmp/phase1_runtime_load.log 2>&1

if [[ -f "${CONTEXT_OUT}" ]]; then
  pass "context artifact generated"
else
  fail "context artifact missing"
fi

if rg -q --fixed-strings "用户画像摘要" "${CONTEXT_OUT}" && rg -q --fixed-strings "最近情景记忆" "${CONTEXT_OUT}"; then
  pass "context contains required sections"
else
  fail "context missing required sections"
fi

node "${RUNTIME_SCRIPT}" compress \
  --workspace "${WORKSPACE}" \
  --date "2026-02-06" \
  --threshold 1000 >/tmp/phase1_runtime_compress.log 2>&1

if rg -q --fixed-strings "## 压缩摘要" "${DAY_FILE}"; then
  pass "compression summary generated"
else
  fail "compression summary missing"
fi

echo "=== Phase1 Runtime Test Summary ==="
echo "PASS: ${pass_count}"
echo "FAIL: ${fail_count}"

if (( fail_count > 0 )); then
  exit 1
fi
