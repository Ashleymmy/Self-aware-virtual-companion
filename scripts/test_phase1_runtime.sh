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

# Seed 7-day window data
for d in 2026-01-31 2026-02-01 2026-02-02 2026-02-03 2026-02-04 2026-02-05 2026-02-06; do
  node "${RUNTIME_SCRIPT}" write \
    --workspace "${WORKSPACE}" \
    --date "${d}" \
    --topic "Phase1联调" \
    --summary "本次会话聚焦 Phase1 联调、记忆检索与压缩窗口能力验证。" \
    --mood "积极" \
    --fact "用户当前关注 Phase1 可执行闭环" \
    --preference "希望排障时先结论后步骤" \
    --relationship-note "建立了稳定的迭代节奏" >/tmp/phase1_runtime_write_${d}.log 2>&1

done

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

# Sensitive data redaction
RAW_SECRET="sk-TestSecret1234567890abcdefXYZ123"
node "${RUNTIME_SCRIPT}" write \
  --workspace "${WORKSPACE}" \
  --date "2026-02-06" \
  --topic "安全检查" \
  --summary "api_key=${RAW_SECRET} password=demoPass123" \
  --fact "token=${RAW_SECRET}" \
  --mood "谨慎" >/tmp/phase1_runtime_write_secret.log 2>&1

if rg -q --fixed-strings "${RAW_SECRET}" "${DAY_FILE}"; then
  fail "sensitive token leaked into episodic memory"
elif rg -q --fixed-strings "REDACTED" "${DAY_FILE}"; then
  pass "sensitive token redacted in episodic memory"
else
  fail "sensitive token redaction marker missing"
fi

FACTS_FILE="${WORKSPACE}/memory/semantic/facts.md"
if rg -q --fixed-strings "${RAW_SECRET}" "${FACTS_FILE}"; then
  fail "sensitive token leaked into semantic facts"
elif rg -q --fixed-strings "REDACTED" "${FACTS_FILE}"; then
  pass "sensitive token redacted in semantic facts"
else
  fail "semantic facts redaction marker missing"
fi

# Search API
SEARCH_OUT="${TMP_ROOT}/search.json"
node "${RUNTIME_SCRIPT}" search \
  --workspace "${WORKSPACE}" \
  --query "Phase1联调" \
  --limit 5 \
  --json > "${SEARCH_OUT}"

python3 - "${SEARCH_OUT}" <<'PY'
import json
import sys
obj = json.load(open(sys.argv[1], 'r', encoding='utf-8'))
assert obj['query'] == 'Phase1联调'
assert obj['total'] >= 1
assert len(obj['matches']) >= 1
assert any(item['type'] == 'episodic' for item in obj['matches'])
PY
pass "search API returns episodic matches"

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
  --threshold 300 >/tmp/phase1_runtime_compress.log 2>&1

if rg -q --fixed-strings "## 压缩摘要" "${DAY_FILE}"; then
  pass "day compression summary generated"
else
  fail "day compression summary missing"
fi

# 7-day and 30-day compression windows
node "${RUNTIME_SCRIPT}" compress-window \
  --workspace "${WORKSPACE}" \
  --window week \
  --date "2026-02-06" >/tmp/phase1_runtime_window_week.log 2>&1

WEEK_FILE="${WORKSPACE}/memory/episodic/weekly/2026-02-06.md"
if [[ -f "${WEEK_FILE}" ]]; then
  pass "weekly compression artifact generated"
else
  fail "weekly compression artifact missing"
fi

node "${RUNTIME_SCRIPT}" compress-window \
  --workspace "${WORKSPACE}" \
  --window month \
  --date "2026-02-06" >/tmp/phase1_runtime_window_month.log 2>&1

MONTH_FILE="${WORKSPACE}/memory/episodic/monthly/2026-02.md"
if [[ -f "${MONTH_FILE}" ]]; then
  pass "monthly compression artifact generated"
else
  fail "monthly compression artifact missing"
fi

INDEX_FILE="${WORKSPACE}/memory/episodic/index.md"
if rg -q --fixed-strings "[week] 2026-02-06" "${INDEX_FILE}" \
  && rg -q --fixed-strings "[month] 2026-02" "${INDEX_FILE}"; then
  pass "compression window index updated"
else
  fail "compression window index missing"
fi

echo "=== Phase1 Runtime Test Summary ==="
echo "PASS: ${pass_count}"
echo "FAIL: ${fail_count}"

if (( fail_count > 0 )); then
  exit 1
fi
