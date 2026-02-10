import assert from 'node:assert/strict';

import {
  spawnAgent,
  waitForAgent,
  waitForAll,
  cancelAgent,
  getStatus,
  setExecutor,
} from '../../savc-core/orchestrator/lifecycle.mjs';

const defaultExecutor = async ({ agentDef, task }) => `${agentDef?.name || 'agent'}: ${task}`;

async function main() {
  setExecutor(defaultExecutor);

  const runId = await spawnAgent({ name: 'companion', limits: { timeout_seconds: 3 } }, '抱抱用户', {});
  const done = await waitForAgent(runId);
  assert.equal(done.status, 'completed');
  assert.ok(done.output.includes('抱抱用户'));

  setExecutor(async () => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return 'late';
  });
  const timeoutRunId = await spawnAgent({ name: 'technical', limits: { timeout_seconds: 0.05 } }, 'slow', {});
  const timeoutResult = await waitForAgent(timeoutRunId);
  assert.ok(['timeout', 'completed'].includes(timeoutResult.status));

  setExecutor(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return 'cancel-me';
  });
  const cancelRunId = await spawnAgent({ name: 'creative', limits: { timeout_seconds: 3 } }, 'long task', {});
  await new Promise((resolve) => setTimeout(resolve, 30));
  const cancelResult = await cancelAgent(cancelRunId);
  assert.equal(cancelResult.cancelled, true);
  const status = getStatus(cancelRunId);
  assert.equal(status.status, 'cancelled');

  setExecutor(defaultExecutor);
  const id1 = await spawnAgent({ name: 'memory', limits: { timeout_seconds: 3 } }, 't1', {});
  const id2 = await spawnAgent({ name: 'tooling', limits: { timeout_seconds: 3 } }, 't2', {});
  const all = await waitForAll([id1, id2]);
  assert.equal(all.length, 2);
  assert.equal(all.every((item) => item.status === 'completed'), true);

  console.log('[PASS] orchestrator lifecycle');
}

main().catch((error) => {
  console.error('[FAIL] orchestrator lifecycle');
  console.error(error);
  process.exit(1);
});
