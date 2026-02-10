import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  autoCapture,
  autoRecall,
  embed,
  health,
  migrate,
  remove,
  search,
  stats,
  store,
} from '../../scripts/memory_semantic.mjs';

async function main() {
  process.env.SAVC_EMBEDDING_MODE = 'mock';
  process.env.EMBEDDING_MODEL = 'text-embedding-3-small';

  const workspace = path.join(os.tmpdir(), 'savc_phase4a_memory_semantic_test');
  await fs.rm(workspace, { recursive: true, force: true });
  await fs.mkdir(path.join(workspace, 'memory'), { recursive: true });

  const v1 = await embed('deterministic vector check', { workspace });
  const v2 = await embed('deterministic vector check', { workspace });
  assert.equal(v1.length, 1536);
  assert.deepEqual(v1, v2, 'mock embedding should be deterministic');

  const firstStore = await store('用户喜欢使用 Python 处理自动化任务。', {
    workspace,
    category: 'preference',
    source: 'conversation',
  });
  assert.equal(firstStore.stored, true);
  assert.ok(firstStore.entry?.id);

  const duplicateStore = await store('用户喜欢使用 Python 处理自动化任务。', {
    workspace,
    category: 'preference',
    source: 'conversation',
  });
  assert.equal(duplicateStore.stored, false);
  assert.equal(duplicateStore.duplicate, true);

  const semanticResult = await search('Python', { workspace, limit: 5, minScore: 0.1 });
  assert.ok(semanticResult.matches.length >= 1, 'search should return at least one match');

  const foundId = semanticResult.matches.find((item) => item.id)?.id;
  assert.ok(foundId, 'search should include id for removal');

  const removeResult = await remove(foundId, { workspace });
  assert.equal(removeResult.removed, true);

  const afterRemove = await search('Python', { workspace, limit: 5, minScore: 0.1 });
  assert.equal(afterRemove.matches.some((item) => item.id === foundId), false);

  const migrateRoot = path.join(workspace, 'memory', 'semantic');
  await fs.mkdir(migrateRoot, { recursive: true });
  await fs.writeFile(
    path.join(migrateRoot, 'facts.md'),
    [
      '# 标题',
      '',
      '用户偏好 requests 库进行 HTTP 请求，尤其在快速脚本任务中频繁使用。',
      '',
      '---',
      '',
      '用户最近在调研多 Agent 路由策略，关注性能与回退机制。',
      '',
      '`code`',
    ].join('\n'),
    'utf8',
  );

  const migrateOnce = await migrate(migrateRoot, { workspace });
  assert.ok(migrateOnce.files >= 1);
  assert.ok(migrateOnce.stored >= 1);

  const migrateTwice = await migrate(migrateRoot, { workspace });
  assert.ok(migrateTwice.duplicateSkipped >= 1, 'migrate should be idempotent');

  const stat = await stats({ workspace });
  assert.ok(stat.count >= 1);
  assert.ok(stat.lastWriteAt);

  const check = await health({ workspace });
  assert.equal(check.db.ok, true);
  assert.equal(check.embedding.ok, true);

  const oldTimestamp = Date.now() - 120 * 24 * 60 * 60 * 1000;
  const oldText = '历史偏好：用户更偏向使用 requests 处理接口。';
  await store(oldText, {
    workspace,
    category: 'preference',
    source: 'decay-test',
    createdAt: oldTimestamp,
    updatedAt: oldTimestamp,
  });
  const decayEnabled = await search(oldText, {
    workspace,
    limit: 1,
    minScore: 0,
    decayEnabled: true,
  });
  const decayDisabled = await search(oldText, {
    workspace,
    limit: 1,
    minScore: 0,
    decayEnabled: false,
  });
  assert.ok(decayEnabled.matches.length >= 1, 'decay search should return item');
  assert.ok(decayDisabled.matches.length >= 1, 'non-decay search should return item');
  assert.ok(decayEnabled.matches[0].score <= decayDisabled.matches[0].score + 1e-9);
  assert.ok(decayEnabled.matches[0].decay <= 1);

  const recall = await autoRecall('Python', { workspace, limit: 2, minScore: 0.1 });
  assert.ok(typeof recall.context === 'string');
  assert.ok(recall.context.includes('<relevant-memories>') || recall.total === 0);

  const captureText =
    '请记住：我更喜欢用 TypeScript 和 pnpm 做工程化。联系方式是 test.user@example.com。';
  const captureResult = await autoCapture(captureText, {
    workspace,
    source: 'test:auto-capture',
    limit: 3,
  });
  assert.ok(captureResult.candidateCount >= 1);
  assert.ok(captureResult.stored >= 1);

  console.log('[PASS] memory-semantic api works');
}

main().catch((error) => {
  console.error('[FAIL] memory-semantic api failed');
  console.error(error);
  process.exit(1);
});
