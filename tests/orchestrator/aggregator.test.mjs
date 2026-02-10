import assert from 'node:assert/strict';

import { aggregate } from '../../savc-core/orchestrator/aggregator.mjs';

async function main() {
  const single = await aggregate(
    [{ id: 'task-1', agent: 'technical', task: '写代码', dependsOn: [] }],
    [{ taskId: 'task-1', agent: 'technical', status: 'completed', output: '这是技术结果。' }],
    '帮我写代码',
  );
  assert.equal(single, '这是技术结果。');

  const parallel = await aggregate(
    [
      { id: 'task-1', agent: 'technical', task: '写代码', dependsOn: [] },
      { id: 'task-2', agent: 'memory', task: '记住偏好', dependsOn: [] },
    ],
    [
      { taskId: 'task-1', agent: 'technical', status: 'completed', output: '代码已生成。' },
      { taskId: 'task-2', agent: 'memory', status: 'completed', output: '偏好已记录。' },
    ],
    '并行任务',
  );
  assert.ok(parallel.includes('代码已生成。'));
  assert.ok(parallel.includes('偏好已记录。'));

  const partialFail = await aggregate(
    [
      { id: 'task-1', agent: 'technical', task: '写代码', dependsOn: [] },
      { id: 'task-2', agent: 'tooling', task: '查天气', dependsOn: [] },
    ],
    [
      { taskId: 'task-1', agent: 'technical', status: 'completed', output: '代码已生成。' },
      { taskId: 'task-2', agent: 'tooling', status: 'failed', error: 'api timeout' },
    ],
    '部分失败',
  );
  assert.ok(partialFail.includes('代码已生成。'));
  assert.ok(partialFail.includes('没完成'));

  const allFail = await aggregate(
    [{ id: 'task-1', agent: 'technical', task: '写代码', dependsOn: [] }],
    [{ taskId: 'task-1', agent: 'technical', status: 'failed', error: 'bad input' }],
    '全部失败',
  );
  assert.ok(allFail.includes('没有成功'));

  const sequential = await aggregate(
    [
      { id: 'task-1', agent: 'memory', task: '读取记忆', dependsOn: [] },
      { id: 'task-2', agent: 'technical', task: '继续项目', dependsOn: ['task-1'] },
    ],
    [
      { taskId: 'task-1', agent: 'memory', status: 'completed', output: '昨天进度已读取。' },
      { taskId: 'task-2', agent: 'technical', status: 'completed', output: '项目已继续推进。' },
    ],
    '串行任务',
  );
  assert.ok(sequential.includes('项目已继续推进。'));

  console.log('[PASS] orchestrator aggregator');
}

main().catch((error) => {
  console.error('[FAIL] orchestrator aggregator');
  console.error(error);
  process.exit(1);
});
