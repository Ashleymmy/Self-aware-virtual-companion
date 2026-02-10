import assert from 'node:assert/strict';

import { analyze } from '../../savc-core/orchestrator/decomposer.mjs';

async function main() {
  const parallelCase = await analyze('帮我写个爬虫，顺便记住我喜欢 requests', {
    agentsDir: 'savc-core/agents',
  });
  assert.equal(parallelCase.type, 'compound');
  assert.ok(parallelCase.tasks.length >= 2);
  assert.equal(parallelCase.execution, 'parallel');

  const sequentialCase = await analyze('先查一下昨天聊了什么，然后帮我继续那个项目', {
    agentsDir: 'savc-core/agents',
  });
  assert.equal(sequentialCase.type, 'compound');
  assert.equal(sequentialCase.execution, 'sequential');
  assert.equal(sequentialCase.tasks[1].dependsOn.length, 1);

  const simpleCase = await analyze('今天心情不好', {
    agentsDir: 'savc-core/agents',
  });
  assert.equal(simpleCase.type, 'simple');
  assert.equal(simpleCase.tasks.length, 1);

  const schemaCase = await analyze('帮我写代码，顺便记住我的偏好', {
    agentsDir: 'savc-core/agents',
  });
  for (const task of schemaCase.tasks) {
    assert.ok(task.id);
    assert.ok(task.agent);
    assert.ok(typeof task.priority === 'number');
    assert.ok(Array.isArray(task.dependsOn));
  }

  console.log('[PASS] orchestrator decomposer');
}

main().catch((error) => {
  console.error('[FAIL] orchestrator decomposer');
  console.error(error);
  process.exit(1);
});
