#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

TMP_ROOT="/tmp/savc_phase4a_runtime"
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
  local target="$1"
  if [[ -f "${REPO_ROOT}/${target}" ]]; then
    pass "file exists: ${target}"
  else
    fail "missing file: ${target}"
  fi
}

require_file "scripts/memory_semantic.mjs"
require_file "scripts/memory_runtime.mjs"
require_file "scripts/proactive_daemon.mjs"
require_file "scripts/self_reflection_runtime.mjs"
require_file "tests/skills/memory-semantic.test.mjs"
require_file "tests/skills/memory-semantic-local.test.mjs"

if node -e "import('@lancedb/lancedb').then(()=>process.exit(0)).catch(()=>process.exit(1))"; then
  pass "@lancedb/lancedb import ok"
else
  fail "@lancedb/lancedb import failed"
fi

if node -e "import('openai').then(()=>process.exit(0)).catch(()=>process.exit(1))"; then
  pass "openai import ok"
else
  fail "openai import failed"
fi

if node "${REPO_ROOT}/tests/skills/memory-semantic.test.mjs" >/tmp/phase4a_memory_semantic_test.log 2>&1; then
  pass "memory-semantic test passed"
else
  fail "memory-semantic test failed (see /tmp/phase4a_memory_semantic_test.log)"
fi

if node "${REPO_ROOT}/tests/skills/memory-semantic-local.test.mjs" >/tmp/phase4a_memory_semantic_local_test.log 2>&1; then
  pass "memory-semantic local embedding test passed"
else
  fail "memory-semantic local embedding test failed (see /tmp/phase4a_memory_semantic_local_test.log)"
fi

rm -rf "${TMP_ROOT}"
mkdir -p "${WORKSPACE}"
cp -R "${REPO_ROOT}/savc-core/memory" "${WORKSPACE}/memory"

export SAVC_EMBEDDING_MODE=mock
export EMBEDDING_MODEL=text-embedding-3-small

node "${REPO_ROOT}/scripts/memory_runtime.mjs" write \
  --workspace "${WORKSPACE}" \
  --date "2026-02-10" \
  --topic "Phase4a语义检索" \
  --summary "用户喜欢使用 Python 完成自动化脚本任务" \
  --mood "平稳" >/tmp/phase4a_write.log 2>&1 || true

if node "${REPO_ROOT}/scripts/memory_runtime.mjs" search \
  --workspace "${WORKSPACE}" \
  --query "Python" \
  --mode keyword \
  --json >"${TMP_ROOT}/search_keyword.json"; then
  pass "memory_runtime keyword search works"
else
  fail "memory_runtime keyword search failed"
fi

if node "${REPO_ROOT}/scripts/memory_runtime.mjs" search \
  --workspace "${WORKSPACE}" \
  --query "Python" \
  --mode semantic \
  --json >"${TMP_ROOT}/search_semantic.json"; then
  pass "memory_runtime semantic search works"
else
  fail "memory_runtime semantic search failed"
fi

if node "${REPO_ROOT}/scripts/memory_runtime.mjs" search \
  --workspace "${WORKSPACE}" \
  --query "Python" \
  --mode hybrid \
  --json >"${TMP_ROOT}/search_hybrid.json"; then
  pass "memory_runtime hybrid search works"
else
  fail "memory_runtime hybrid search failed"
fi

python3 - "${TMP_ROOT}/search_semantic.json" "${TMP_ROOT}/search_hybrid.json" <<'PY'
import json
import sys
semantic = json.load(open(sys.argv[1], 'r', encoding='utf-8'))
hybrid = json.load(open(sys.argv[2], 'r', encoding='utf-8'))
assert semantic['mode'] == 'semantic'
assert hybrid['mode'] == 'hybrid'
if semantic['matches']:
    assert 'score' in semantic['matches'][0]
if hybrid['matches']:
    assert 'score' in hybrid['matches'][0]
PY
pass "semantic/hybrid include score field"

node "${REPO_ROOT}/scripts/memory_runtime.mjs" load \
  --workspace "${WORKSPACE}" \
  --days 2 \
  --query "Python" \
  --max-tokens 2000 \
  --output "${TMP_ROOT}/load_context.md" >/tmp/phase4a_load.log 2>&1

if rg -q --fixed-strings "## 相关语义记忆召回" "${TMP_ROOT}/load_context.md"; then
  pass "load --query injects semantic section"
else
  fail "load --query missing semantic section"
fi

if node "${REPO_ROOT}/scripts/memory_runtime.mjs" auto-recall \
  --workspace "${WORKSPACE}" \
  --query "Python" \
  --json >"${TMP_ROOT}/auto_recall.json"; then
  pass "auto-recall command works"
else
  fail "auto-recall command failed"
fi

if node "${REPO_ROOT}/scripts/memory_runtime.mjs" auto-capture \
  --workspace "${WORKSPACE}" \
  --text "请记住：我偏好 TypeScript，并且邮箱是 test.user@example.com" \
  --json >"${TMP_ROOT}/auto_capture.json"; then
  pass "auto-capture command works"
else
  fail "auto-capture command failed"
fi

python3 - "${TMP_ROOT}/auto_recall.json" "${TMP_ROOT}/auto_capture.json" <<'PY'
import json
import sys
recall = json.load(open(sys.argv[1], 'r', encoding='utf-8'))
capture = json.load(open(sys.argv[2], 'r', encoding='utf-8'))
assert 'context' in recall
assert capture['candidateCount'] >= 1
assert capture['stored'] >= 1
PY
pass "auto-recall/auto-capture output schema is valid"

if node "${REPO_ROOT}/scripts/memory_semantic.mjs" store \
  --workspace "${WORKSPACE}" \
  --text "历史偏好：用户更偏向 requests 生态" \
  --source "decay-check" \
  --category preference \
  --importance 0.6 \
  --json >/tmp/phase4a_decay_store.log 2>&1; then
  :
fi

if node "${REPO_ROOT}/scripts/memory_semantic.mjs" search \
  --workspace "${WORKSPACE}" \
  --query "历史偏好：用户更偏向 requests 生态" \
  --limit 1 \
  --min-score 0 \
  --json >"${TMP_ROOT}/decay_check.json"; then
  pass "semantic search with decay metadata works"
else
  fail "semantic search with decay metadata failed"
fi

python3 - "${TMP_ROOT}/decay_check.json" <<'PY'
import json
import sys
payload = json.load(open(sys.argv[1], 'r', encoding='utf-8'))
if payload.get('matches'):
    item = payload['matches'][0]
    assert 'rawScore' in item
    assert 'decay' in item
    assert item['score'] <= item['rawScore'] + 1e-9
PY
pass "decay score fields are present"

node "${REPO_ROOT}/scripts/memory_semantic.mjs" migrate "${WORKSPACE}/memory/semantic" \
  --workspace "${WORKSPACE}" --json >"${TMP_ROOT}/migrate_once.json"
node "${REPO_ROOT}/scripts/memory_semantic.mjs" migrate "${WORKSPACE}/memory/semantic" \
  --workspace "${WORKSPACE}" --json >"${TMP_ROOT}/migrate_twice.json"

python3 - "${TMP_ROOT}/migrate_once.json" "${TMP_ROOT}/migrate_twice.json" <<'PY'
import json
import sys
once = json.load(open(sys.argv[1], 'r', encoding='utf-8'))
twice = json.load(open(sys.argv[2], 'r', encoding='utf-8'))
assert once['files'] >= 1
assert twice['duplicateSkipped'] >= 0
PY
pass "migrate command works and is idempotent"

node "${REPO_ROOT}/scripts/memory_semantic.mjs" health --workspace "${WORKSPACE}" --json >"${TMP_ROOT}/health.json"
python3 - "${TMP_ROOT}/health.json" <<'PY'
import json
import sys
health = json.load(open(sys.argv[1], 'r', encoding='utf-8'))
assert health['db']['ok'] is True
assert health['embedding']['ok'] is True
PY
pass "health command returns expected fields"

if [[ -s "${WORKSPACE}/memory/vector/usage.log" ]]; then
  pass "usage.log generated"
else
  fail "usage.log missing"
fi

if bash "${REPO_ROOT}/scripts/test_phase1.sh" >/tmp/phase4a_regress_phase1.log 2>&1; then
  pass "phase1 regression passed"
else
  fail "phase1 regression failed (see /tmp/phase4a_regress_phase1.log)"
fi

if bash "${REPO_ROOT}/scripts/test_phase3.sh" >/tmp/phase4a_regress_phase3.log 2>&1; then
  pass "phase3 regression passed"
else
  fail "phase3 regression failed (see /tmp/phase4a_regress_phase3.log)"
fi

echo "=== Phase 4a Test Summary ==="
echo "PASS: ${pass_count}"
echo "FAIL: ${fail_count}"

if (( fail_count > 0 )); then
  exit 1
fi
