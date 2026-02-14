import assert from 'node:assert/strict';

import { spawnAgent, waitForAgent } from '../../savc-core/orchestrator/lifecycle.mjs';
import {
  analyzeVisionTask,
  classifyVisionTask,
  formatVisionReport,
  generateImage,
  hasImageSignal,
  hasTechnicalSignal,
} from '../../savc-core/orchestrator/vision.mjs';

async function main() {
  assert.equal(hasImageSignal('帮我看看这个截图'), true);
  assert.equal(hasTechnicalSignal('这个报错怎么修'), true);
  assert.equal(classifyVisionTask('帮我画一个 logo'), 'image_generation');
  assert.equal(classifyVisionTask('这个报错截图帮我看下 <media:image>'), 'screenshot_debug');

  const analysis = analyzeVisionTask('这个报错截图帮我看下 <media:image>');
  assert.equal(analysis.type, 'screenshot_debug');
  assert.equal(analysis.collaborators.includes('technical'), true);
  assert.equal(formatVisionReport(analysis).includes('[vision]'), true);

  const mockImage = await generateImage({
    prompt: 'A minimalist SAVC logo',
    mode: 'mock',
    size: '1024x1024',
    quality: 'standard',
  });
  assert.equal(mockImage.mode, 'mock');
  assert.equal(typeof mockImage.image?.url, 'string');

  const runId = await spawnAgent(
    {
      name: 'vision',
      limits: { timeout_seconds: 3 },
    },
    '这个报错截图帮我排障一下 <media:image>',
    {},
  );
  const done = await waitForAgent(runId, 5000);
  assert.equal(done.status, 'completed');
  assert.equal(String(done.output || '').includes('[vision]'), true);

  console.log('[PASS] orchestrator vision');
}

main().catch((error) => {
  console.error('[FAIL] orchestrator vision');
  console.error(error);
  process.exit(1);
});
