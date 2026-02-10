import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { embed, health, search, store } from '../../scripts/memory_semantic.mjs';

function createDeterministicVector(text, dim) {
  const digest = crypto.createHash('sha256').update(String(text)).digest();
  const vector = [];
  for (let index = 0; index < dim; index += 1) {
    vector.push(((digest[index % digest.length] / 255) * 2) - 1);
  }
  return vector;
}

async function main() {
  const dim = 8;
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/api/embeddings') {
      res.statusCode = 404;
      res.end('not found');
      return;
    }

    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
    }
    const payload = JSON.parse(raw || '{}');
    const prompt = payload.prompt || payload.input || '';
    const embedding = createDeterministicVector(prompt, dim);

    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ embedding }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  if (!port) {
    throw new Error('failed to resolve local embedding server port');
  }

  process.env.SAVC_EMBEDDING_MODE = 'local';
  process.env.LOCAL_EMBEDDING_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.LOCAL_EMBEDDING_PATH = '/api/embeddings';
  process.env.LOCAL_EMBEDDING_MODEL = 'nomic-embed-text';
  process.env.LOCAL_EMBEDDING_VECTOR_DIM = String(dim);

  const workspace = path.join(os.tmpdir(), 'savc_phase4x_memory_local_embedding');
  await fs.rm(workspace, { recursive: true, force: true });
  await fs.mkdir(path.join(workspace, 'memory'), { recursive: true });

  const vector = await embed('local embedding check', { workspace });
  assert.equal(vector.length, dim);

  const write = await store('请记住：我偏好在 CLI 中使用 pnpm。', {
    workspace,
    category: 'preference',
    source: 'local-test',
  });
  assert.equal(write.stored, true);

  const found = await search('请记住：我偏好在 CLI 中使用 pnpm。', {
    workspace,
    limit: 5,
    minScore: 0,
  });
  assert.ok(found.matches.length >= 1, 'local embedding search should return at least one match');

  const check = await health({ workspace });
  assert.equal(check.embedding.ok, true);
  assert.equal(check.embedding.mode, 'local');

  await new Promise((resolve) => server.close(resolve));
  console.log('[PASS] memory-semantic local embedding mode');
}

main().catch((error) => {
  console.error('[FAIL] memory-semantic local embedding mode');
  console.error(error);
  process.exit(1);
});
