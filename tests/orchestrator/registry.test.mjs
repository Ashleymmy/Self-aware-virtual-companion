import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  discoverAgents,
  listAgents,
  matchByIntent,
  matchByKeyword,
  closeWatcher,
} from '../../savc-core/orchestrator/registry.mjs';

async function copyDir(from, to) {
  await fs.mkdir(to, { recursive: true });
  const entries = await fs.readdir(from, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) {
      await copyDir(src, dest);
    } else {
      await fs.copyFile(src, dest);
    }
  }
}

async function waitFor(condition, timeoutMs = 2000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  return false;
}

async function main() {
  const sourceDir = path.resolve('savc-core/agents');
  const tempDir = path.join(os.tmpdir(), 'savc_phase4b_registry_test');
  await fs.rm(tempDir, { recursive: true, force: true });
  await copyDir(sourceDir, tempDir);

  const expectedAgentCount = (await fs.readdir(sourceDir, { withFileTypes: true })).filter(
    (entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name),
  ).length;

  const agents = await discoverAgents(tempDir, { watch: true, forceReload: true });
  assert.equal(agents.length, expectedAgentCount);

  const names = listAgents();
  assert.ok(names.includes('companion'));
  assert.ok(names.includes('technical'));

  const byIntent = matchByIntent('emotional_support');
  assert.equal(byIntent?.name, 'companion');

  const byKeyword = matchByKeyword('帮我看看这个 bug');
  assert.equal(byKeyword?.name, 'technical');

  const mixedKeyword = matchByKeyword('点击模型并语音播报一句欢迎回来');
  assert.equal(mixedKeyword?.name, 'live2d');

  await fs.writeFile(
    path.join(tempDir, 'new-agent.yaml'),
    [
      'name: test-agent',
      'description: test agent',
      'model:',
      '  provider: anthropic',
      '  name: claude-sonnet-4-20250514',
      'triggers:',
      '  intents:',
      '    - test_intent',
      '  keywords:',
      '    - "测试"',
    ].join('\n'),
    'utf8',
  );

  const picked = await waitFor(async () => listAgents().includes('test-agent'));
  assert.equal(picked, true, 'watcher should discover new yaml file');

  await closeWatcher();
  console.log('[PASS] orchestrator registry');
}

main().catch(async (error) => {
  await closeWatcher();
  console.error('[FAIL] orchestrator registry');
  console.error(error);
  process.exit(1);
});
