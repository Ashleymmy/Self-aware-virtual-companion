import assert from 'node:assert/strict';

import { aggregate } from '../../savc-core/orchestrator/aggregator.mjs';
import { analyze } from '../../savc-core/orchestrator/decomposer.mjs';
import { spawnAgent, waitForAgent } from '../../savc-core/orchestrator/lifecycle.mjs';

async function main() {
  const message = '点击模型并语音播报一句欢迎回来';
  const plan = await analyze(message, {
    agentsDir: 'savc-core/agents',
  });
  assert.equal(plan.type, 'compound');
  assert.equal(plan.execution, 'sequential');
  assert.equal(plan.tasks.length, 2);
  assert.equal(plan.tasks[0].agent, 'live2d');
  assert.equal(plan.tasks[1].agent, 'voice');
  assert.equal(plan.tasks[1].dependsOn[0], 'task-1');

  const results = [];
  for (const task of plan.tasks) {
    const runId = await spawnAgent(
      { name: task.agent, limits: { timeout_seconds: 3 } },
      task.task,
      {},
    );
    const snapshot = await waitForAgent(runId, 5000);
    results.push({
      ...snapshot,
      taskId: task.id,
      id: task.id,
    });
  }

  assert.equal(results.every((item) => item.status === 'completed'), true);
  const reply = await aggregate(plan.tasks, results, message);
  assert.equal(typeof reply, 'string');
  assert.equal(reply.includes('[voice]'), true);
  assert.equal(reply.includes('live2dEmotion='), true);
  assert.equal(reply.includes('lipSyncFrames='), true);

  console.log('[PASS] orchestrator live2d voice chain');
}

main().catch((error) => {
  console.error('[FAIL] orchestrator live2d voice chain');
  console.error(error);
  process.exit(1);
});
