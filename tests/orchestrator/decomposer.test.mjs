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

  const vibeCase = await analyze('请从零搭建一个 Node API 脚手架并自动修复测试', {
    agentsDir: 'savc-core/agents',
  });
  assert.equal(vibeCase.type, 'simple');
  assert.equal(vibeCase.tasks[0].agent, 'vibe-coder');

  const visionTechCase = await analyze('这个报错截图帮我排障一下 <media:image>', {
    agentsDir: 'savc-core/agents',
  });
  assert.equal(visionTechCase.type, 'compound');
  assert.equal(visionTechCase.execution, 'sequential');
  assert.equal(visionTechCase.tasks.length, 2);
  assert.equal(visionTechCase.tasks[0].agent, 'vision');
  assert.equal(visionTechCase.tasks[1].agent, 'technical');
  assert.equal(visionTechCase.tasks[1].dependsOn[0], 'task-1');

  const live2dVoiceCase = await analyze('点击模型并语音播报一句欢迎回来', {
    agentsDir: 'savc-core/agents',
  });
  assert.equal(live2dVoiceCase.type, 'compound');
  assert.equal(live2dVoiceCase.execution, 'sequential');
  assert.equal(live2dVoiceCase.tasks.length, 2);
  assert.equal(live2dVoiceCase.tasks[0].agent, 'live2d');
  assert.equal(live2dVoiceCase.tasks[1].agent, 'voice');
  assert.equal(live2dVoiceCase.tasks[1].dependsOn[0], 'task-1');

  console.log('[PASS] orchestrator decomposer');
}

main().catch((error) => {
  console.error('[FAIL] orchestrator decomposer');
  console.error(error);
  process.exit(1);
});
