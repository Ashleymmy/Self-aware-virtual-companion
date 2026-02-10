#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

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

for file in \
  "savc-core/agents/vibe-coder.yaml" \
  "savc-core/orchestrator/router.mjs" \
  "config/models.yaml"; do
  if [[ -f "${REPO_ROOT}/${file}" ]]; then
    pass "file exists: ${file}"
  else
    fail "missing file: ${file}"
  fi
done

if node - <<'NODE'
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import yaml from 'js-yaml';
import { routeMessage } from './savc-core/orchestrator/router.mjs';

const raw = await fs.readFile('savc-core/agents/vibe-coder.yaml', 'utf8');
const parsed = yaml.load(raw);
assert.equal(parsed.name, 'vibe-coder');
assert.ok(Array.isArray(parsed.tools?.allowed));
assert.ok(parsed.tools.allowed.includes('sessions_spawn'));
assert.ok(parsed.tools.allowed.includes('file_write'));

const routed = await routeMessage('请从零搭建一个 Express 脚手架并自动修复测试', {
  agentsDir: 'savc-core/agents',
});
assert.equal(routed.agent, 'vibe-coder');
console.log('ok');
NODE
then
  pass "vibe-coder routing and toolchain checks passed"
else
  fail "vibe-coder routing/toolchain checks failed"
fi

echo "=== Phase 5c Test Summary ==="
echo "PASS: ${pass_count}"
echo "FAIL: ${fail_count}"

if (( fail_count > 0 )); then
  exit 1
fi
