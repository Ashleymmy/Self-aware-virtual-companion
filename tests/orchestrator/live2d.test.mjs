import assert from 'node:assert/strict';

import {
  buildLive2DPlan,
  buildInteractionReaction,
  buildLipSyncFrames,
  buildLive2DSignal,
  classifyLive2DSource,
  formatLive2DSignal,
  formatLive2DPlan,
  inferEmotionFromMessage,
  inferInteractionType,
  mapEmotionToExpression,
  normalizeEmotionTag,
} from '../../savc-core/orchestrator/live2d.mjs';

async function main() {
  assert.equal(normalizeEmotionTag('cheerful'), 'happy');
  assert.equal(normalizeEmotionTag('严肃一点'), 'focused');

  const mapped = mapEmotionToExpression('empathetic');
  assert.equal(mapped.emotion, 'comfort');
  assert.equal(typeof mapped.params.eyeSmile, 'number');

  const frames = buildLipSyncFrames('你好呀 hello', { frameStepMs: 60, maxFrames: 10 });
  assert.equal(frames.length > 0, true);
  assert.equal(frames.every((item) => item.mouthOpen >= 0 && item.mouthOpen <= 1), true);

  const interaction = buildInteractionReaction('double_tap');
  assert.equal(interaction.motion, 'wave_big');
  assert.equal(interaction.emotion, 'excited');

  assert.equal(classifyLive2DSource('请帮我做口型同步', {}), 'voice');
  assert.equal(classifyLive2DSource('点击模型挥挥手', {}), 'interaction');
  assert.equal(inferInteractionType('双击模型看看反应'), 'double_tap');
  assert.equal(inferEmotionFromMessage('别怕，我会陪着你。', 'neutral'), 'comfort');

  const voiceSignal = buildLive2DSignal({
    source: 'voice',
    message: '我们继续吧。',
    emotion: 'serious',
  });
  assert.equal(voiceSignal.source, 'voice');
  assert.equal(voiceSignal.emotion, 'focused');
  assert.equal(Array.isArray(voiceSignal.lipSync), true);
  assert.equal(voiceSignal.lipSync.length > 0, true);

  const clickSignal = buildLive2DSignal({
    source: 'interaction',
    interactionType: 'tap',
  });
  assert.equal(clickSignal.source, 'interaction');
  assert.equal(clickSignal.interaction?.type, 'tap');
  assert.equal(clickSignal.lipSync.length, 0);

  const formatted = formatLive2DSignal(voiceSignal);
  assert.equal(formatted.includes('[live2d]'), true);

  const plan = buildLive2DPlan('点击模型并开心挥手');
  assert.equal(plan.source, 'interaction');
  assert.equal(plan.signal.source, 'interaction');
  const formattedPlan = formatLive2DPlan(plan);
  assert.equal(formattedPlan.includes('live2dInteractionType='), true);

  console.log('[PASS] orchestrator live2d');
}

main().catch((error) => {
  console.error('[FAIL] orchestrator live2d');
  console.error(error);
  process.exit(1);
});
