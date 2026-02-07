#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

pass_count=0
fail_count=0
warn_count=0

pass() {
  echo "[PASS] $*"
  pass_count=$((pass_count + 1))
}

fail() {
  echo "[FAIL] $*"
  fail_count=$((fail_count + 1))
}

warn() {
  echo "[WARN] $*"
  warn_count=$((warn_count + 1))
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

echo "=== Phase 1 Unified Test ==="
echo "repo: ${REPO_ROOT}"

# 1) Required files
require_file "savc-core/persona/PERSONA.md"
require_file "savc-core/persona/voice.yaml"
require_file "savc-core/persona/values.yaml"
require_file "savc-core/skills/memory-manager/SKILL.md"
require_file "tests/phase1-dialogue-scenarios.md"
require_file "scripts/memory_runtime.mjs"
require_file "scripts/test_phase1_runtime.sh"
require_contains "scripts/memory_runtime.mjs" "compress-window"
require_contains "scripts/memory_runtime.mjs" "search"

for path in \
  "savc-core/memory/episodic/index.md" \
  "savc-core/memory/semantic/user-profile.md" \
  "savc-core/memory/semantic/knowledge-base.md" \
  "savc-core/memory/semantic/facts.md" \
  "savc-core/memory/procedural/workflows.md" \
  "savc-core/memory/procedural/tool-usage.md" \
  "savc-core/memory/emotional/relationship.md" \
  "savc-core/memory/emotional/mood-log.md" \
  "savc-core/memory/emotional/milestones.md" \
  "savc-core/memory/tools/available.md" \
  "savc-core/memory/tools/learning-queue.md" \
  "savc-core/memory/growth/milestones.md"; do
  require_file "${path}"
done

# 2) PERSONA section checks
for heading in \
  "# 基本信息" \
  "# 性格特征" \
  "# 说话风格" \
  "# 能力边界" \
  "# 兴趣爱好" \
  "# 关系定位"; do
  require_contains "savc-core/persona/PERSONA.md" "${heading}"
done

# 3) YAML validity checks
set +e
yaml_msg="$(python3 - <<'PY'
from __future__ import annotations
import pathlib
import sys

try:
    import yaml  # type: ignore
except Exception:
    print('PYYAML_MISSING')
    sys.exit(0)

for p in ['savc-core/persona/voice.yaml', 'savc-core/persona/values.yaml']:
    yaml.safe_load(pathlib.Path(p).read_text(encoding='utf-8'))

print('YAML_OK')
PY
)"
yaml_status=$?
set -e

if [[ ${yaml_status} -ne 0 ]]; then
  fail "YAML parse check failed"
elif [[ "${yaml_msg}" == *"YAML_OK"* ]]; then
  pass "voice.yaml and values.yaml parse successfully"
elif [[ "${yaml_msg}" == *"PYYAML_MISSING"* ]]; then
  warn "PyYAML missing; skipped strict YAML parse"
else
  fail "YAML parse check returned unexpected output"
fi

# 4) memory-manager core fields
for token in \
  "name: memory-manager" \
  "description:" \
  "version: \"1.0\"" \
  "on_conversation_start" \
  "on_conversation_end" \
  "on_keyword: \"记得吗\"" \
  "on_keyword: \"你还记得\""; do
  require_contains "savc-core/skills/memory-manager/SKILL.md" "${token}"
done

# 5) Runtime memory validation (write/read/compress)
if bash "${REPO_ROOT}/scripts/test_phase1_runtime.sh" >/tmp/phase1_runtime_test.log 2>&1; then
  pass "runtime memory validation passed"
else
  fail "runtime memory validation failed (see /tmp/phase1_runtime_test.log)"
fi

# 6) Assemble and token budget check
prompt_path="${REPO_ROOT}/tests/artifacts/phase1-system-prompt.md"
bash "${REPO_ROOT}/scripts/build_phase1_prompt.sh" "${prompt_path}" >/tmp/phase1_prompt_build.log
if [[ -f "${prompt_path}" ]]; then
  pass "assembled prompt artifact: tests/artifacts/phase1-system-prompt.md"
else
  fail "failed to build prompt artifact"
fi

est_tokens="$(python3 - "${prompt_path}" <<'PY'
from __future__ import annotations
import math
import pathlib
import sys
text = pathlib.Path(sys.argv[1]).read_text(encoding='utf-8')
chars = len(text)
words = len(text.split())
print(max(math.ceil(chars / 2.0), math.ceil(words * 1.5)))
PY
)"
if [[ "${est_tokens}" =~ ^[0-9]+$ ]] && (( est_tokens <= 3000 )); then
  pass "assembled prompt token budget OK (est=${est_tokens} <= 3000)"
else
  fail "assembled prompt token budget exceeded (est=${est_tokens})"
fi

# 7) Scenario coverage check
scenario_rows="$(rg -n '^\| ' "${REPO_ROOT}/tests/phase1-dialogue-scenarios.md" | wc -l | tr -d ' ')"
if [[ "${scenario_rows}" =~ ^[0-9]+$ ]] && (( scenario_rows >= 7 )); then
  pass "dialogue scenarios include required 6 cases"
else
  fail "dialogue scenario table incomplete"
fi

# 8) OpenClaw health smoke test (non-blocking)
if bash "${REPO_ROOT}/scripts/openclaw.sh" health >/tmp/phase1_openclaw_health.log 2>&1; then
  pass "openclaw health check"
else
  warn "openclaw health check failed (see /tmp/phase1_openclaw_health.log)"
fi

echo
echo "=== Phase 1 Unified Test Summary ==="
echo "PASS: ${pass_count}"
echo "WARN: ${warn_count}"
echo "FAIL: ${fail_count}"

if (( fail_count > 0 )); then
  exit 1
fi
