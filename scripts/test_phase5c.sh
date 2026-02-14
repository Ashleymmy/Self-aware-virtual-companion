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
  "savc-core/orchestrator/vibe-coder.mjs" \
  "tests/orchestrator/vibe-coder.test.mjs" \
  "config/models.yaml"; do
  if [[ -f "${REPO_ROOT}/${file}" ]]; then
    pass "file exists: ${file}"
  else
    fail "missing file: ${file}"
  fi
done

if node "${REPO_ROOT}/tests/orchestrator/vibe-coder.test.mjs" >/tmp/phase5c_vibe_coder.log 2>&1; then
  pass "vibe-coder orchestrator test passed"
else
  fail "vibe-coder orchestrator test failed (see /tmp/phase5c_vibe_coder.log)"
fi

if node - <<'NODE'
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import { routeMessage } from './savc-core/orchestrator/router.mjs';
import { runVibeCodingTask } from './savc-core/orchestrator/vibe-coder.mjs';

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

const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'savc_phase5c_e2e_'));
try {
  await fs.mkdir(path.join(workspaceDir, 'src'), { recursive: true });
  await fs.writeFile(path.join(workspaceDir, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n', 'utf8');
  await fs.writeFile(
    path.join(workspaceDir, 'package.json'),
    JSON.stringify(
      {
        name: 'phase5c-e2e',
        type: 'module',
        scripts: {
          test: 'vitest run',
          lint: 'eslint .',
        },
        dependencies: {
          express: '^4.21.0',
        },
      },
      null,
      2,
    ),
    'utf8',
  );

  const run = await runVibeCodingTask('请从零搭建一个 Express 脚手架并自动修复测试', {
    workspaceDir,
    maxRounds: 3,
  });
  assert.equal(run.status, 'completed');
  assert.equal(run.projectContext.packageManager, 'pnpm');
  assert.equal(run.repair.withinThreeRounds, true);
  assert.equal(run.plan.targetFiles.length > 0, true);
  assert.equal(run.execution.mode, 'real');
  assert.equal(run.execution.outputRoot, 'vibe-output');
  assert.equal(run.generatedFiles.includes('vibe-output/src/app.js'), true);
  await fs.access(path.join(workspaceDir, 'vibe-output', 'src', 'app.js'));
  await fs.access(path.join(workspaceDir, 'vibe-output', 'tests', 'app.test.js'));
} finally {
  await fs.rm(workspaceDir, { recursive: true, force: true });
}
console.log('ok');
NODE
then
  pass "vibe-coder routing, project-awareness and repair-loop checks passed"
else
  fail "vibe-coder routing/project-awareness checks failed"
fi

echo "=== Phase 5c Test Summary ==="
echo "PASS: ${pass_count}"
echo "FAIL: ${fail_count}"

if (( fail_count > 0 )); then
  exit 1
fi
