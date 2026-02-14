import assert from 'node:assert/strict';

import { routeMessage } from '../../savc-core/orchestrator/router.mjs';

async function main() {
  const case1 = await routeMessage('今天好累啊，抱抱我', { agentsDir: 'savc-core/agents' });
  assert.equal(case1.agent, 'companion');
  assert.equal(case1.level, 1);

  const case2 = await routeMessage('帮我优化这段 SQL 查询', { agentsDir: 'savc-core/agents' });
  assert.equal(case2.agent, 'technical');
  assert.equal(case2.level, 2);

  const case3 = await routeMessage('你觉得人生的意义是什么', { agentsDir: 'savc-core/agents' });
  assert.equal(case3.agent, 'orchestrator');
  assert.equal(case3.level, 3);

  const case4 = await routeMessage('请从零搭建一个 Express 脚手架并自动修复测试', {
    agentsDir: 'savc-core/agents',
  });
  assert.equal(case4.agent, 'vibe-coder');
  assert.ok([1, 2].includes(case4.level));

  const case5 = await routeMessage('帮我看看这个报错截图', {
    agentsDir: 'savc-core/agents',
  });
  assert.equal(case5.agent, 'vision');

  const case6 = await routeMessage('帮我发起一个语音通话', {
    agentsDir: 'savc-core/agents',
  });
  assert.equal(case6.agent, 'voice');

  console.log('[PASS] orchestrator router');
}

main().catch((error) => {
  console.error('[FAIL] orchestrator router');
  console.error(error);
  process.exit(1);
});
