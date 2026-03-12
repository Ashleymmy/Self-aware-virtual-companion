#!/usr/bin/env bash
set -euo pipefail

BOOTSTRAP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${BOOTSTRAP_DIR}/../lib/paths.sh"
savc_use_repo_root "${BASH_SOURCE[0]}"

cd "${REPO_ROOT}"

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
  "packages/core/orchestrator/registry.mjs" \
  "packages/core/orchestrator/router.mjs" \
  "packages/core/orchestrator/decomposer.mjs" \
  "packages/core/orchestrator/lifecycle.mjs" \
  "packages/core/orchestrator/aggregator.mjs" \
  "tests/orchestrator/registry.test.mjs" \
  "tests/orchestrator/router.test.mjs" \
  "tests/orchestrator/decomposer.test.mjs" \
  "tests/orchestrator/lifecycle.test.mjs" \
  "tests/orchestrator/aggregator.test.mjs"; do
  if [[ -f "${REPO_ROOT}/${file}" ]]; then
    pass "file exists: ${file}"
  else
    fail "missing file: ${file}"
  fi
done

for yaml in orchestrator companion technical creative tooling memory vibe-coder voice vision live2d; do
  if [[ -f "${REPO_ROOT}/packages/core/agents/${yaml}.yaml" ]]; then
    pass "agent yaml exists: ${yaml}.yaml"
  else
    fail "missing agent yaml: ${yaml}.yaml"
  fi
done

if node "${REPO_ROOT}/tests/orchestrator/registry.test.mjs" >/tmp/phase4b_registry.log 2>&1; then
  pass "registry test passed"
else
  fail "registry test failed (see /tmp/phase4b_registry.log)"
fi

if node "${REPO_ROOT}/tests/orchestrator/router.test.mjs" >/tmp/phase4b_router.log 2>&1; then
  pass "router test passed"
else
  fail "router test failed (see /tmp/phase4b_router.log)"
fi

if node "${REPO_ROOT}/tests/orchestrator/decomposer.test.mjs" >/tmp/phase4b_decomposer.log 2>&1; then
  pass "decomposer test passed"
else
  fail "decomposer test failed (see /tmp/phase4b_decomposer.log)"
fi

if node "${REPO_ROOT}/tests/orchestrator/lifecycle.test.mjs" >/tmp/phase4b_lifecycle.log 2>&1; then
  pass "lifecycle test passed"
else
  fail "lifecycle test failed (see /tmp/phase4b_lifecycle.log)"
fi

if node "${REPO_ROOT}/tests/orchestrator/aggregator.test.mjs" >/tmp/phase4b_aggregator.log 2>&1; then
  pass "aggregator test passed"
else
  fail "aggregator test failed (see /tmp/phase4b_aggregator.log)"
fi

if node - <<'NODE'
import assert from 'node:assert/strict';
import { routeMessage } from './packages/core/orchestrator/router.mjs';
import { analyze } from './packages/core/orchestrator/decomposer.mjs';

const s1 = await routeMessage('抱抱我', { agentsDir: 'packages/core/agents' });
assert.equal(s1.agent, 'companion');

const s2 = await routeMessage('这段代码有 bug', { agentsDir: 'packages/core/agents' });
assert.equal(s2.agent, 'technical');

const s3 = await routeMessage('帮我写个故事', { agentsDir: 'packages/core/agents' });
assert.equal(s3.agent, 'creative');

const s4 = await routeMessage('查一下明天天气', { agentsDir: 'packages/core/agents' });
assert.equal(s4.agent, 'tooling');

const s5 = await analyze('帮我写代码，顺便记住我的偏好', { agentsDir: 'packages/core/agents' });
assert.equal(s5.type, 'compound');
assert.equal(s5.tasks.length >= 2, true);

const s6 = await analyze('先看看昨天聊了什么，然后继续那个项目', { agentsDir: 'packages/core/agents' });
assert.equal(s6.execution, 'sequential');

const s7 = await routeMessage('你觉得呢', { agentsDir: 'packages/core/agents' });
assert.equal(s7.agent, 'orchestrator');

const s8 = await routeMessage('请从零搭建一个 Express 脚手架并自动修复测试', { agentsDir: 'packages/core/agents' });
assert.equal(s8.agent, 'vibe-coder');

const s9 = await routeMessage('请看下这张报错截图 <media:image>', { agentsDir: 'packages/core/agents' });
assert.equal(s9.agent, 'vision');

const s10 = await routeMessage('请发起一个语音通话', { agentsDir: 'packages/core/agents' });
assert.equal(s10.agent, 'voice');

const s11 = await routeMessage('请给我一套 live2d 口型同步策略', { agentsDir: 'packages/core/agents' });
assert.equal(s11.agent, 'live2d');

console.log('ok');
NODE
then
  pass "integration scenarios (1-11) passed"
else
  fail "integration scenarios failed"
fi

echo "=== Phase 4b Test Summary ==="
echo "PASS: ${pass_count}"
echo "FAIL: ${fail_count}"

if (( fail_count > 0 )); then
  exit 1
fi
