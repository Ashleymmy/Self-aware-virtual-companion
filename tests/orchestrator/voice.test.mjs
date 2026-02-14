import assert from 'node:assert/strict';

import { spawnAgent, waitForAgent } from '../../savc-core/orchestrator/lifecycle.mjs';
import {
  buildVoiceExecutionPlan,
  inferVoiceAction,
  inferVoiceEmotion,
  mapEmotionToVoiceStyle,
} from '../../savc-core/orchestrator/voice.mjs';

async function main() {
  assert.equal(inferVoiceAction('请帮我发起语音通话'), 'initiate');
  assert.equal(inferVoiceAction('先继续通话吧'), 'continue');
  assert.equal(inferVoiceAction('帮我挂断电话'), 'end');
  assert.equal(inferVoiceAction('查一下当前通话状态'), 'status');

  assert.equal(inferVoiceEmotion('我现在很难受，安慰一下我'), 'empathetic');
  assert.equal(inferVoiceEmotion('太开心了，庆祝一下'), 'cheerful');
  assert.equal(mapEmotionToVoiceStyle('serious').ttsStyle, 'professional');

  const plan = buildVoiceExecutionPlan('请发起语音通话并语气温柔一点');
  assert.equal(plan.action, 'initiate');
  assert.equal(typeof plan.style.ttsStyle, 'string');

  const runId = await spawnAgent(
    {
      name: 'voice',
      limits: { timeout_seconds: 3 },
    },
    '请发起语音通话并语气温柔一点',
    {},
  );
  const done = await waitForAgent(runId, 5000);
  assert.equal(done.status, 'completed');
  assert.equal(String(done.output || '').includes('[voice]'), true);

  console.log('[PASS] orchestrator voice');
}

main().catch((error) => {
  console.error('[FAIL] orchestrator voice');
  console.error(error);
  process.exit(1);
});
