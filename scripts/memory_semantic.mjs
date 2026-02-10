#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as lancedb from '@lancedb/lancedb';
import OpenAI from 'openai';

const TABLE_NAME = 'memories';
const DEFAULT_MODEL = 'text-embedding-3-small';
const DEFAULT_LOCAL_MODEL = 'nomic-embed-text';
const DEFAULT_LOCAL_BASE_URL = 'http://127.0.0.1:11434';
const DEFAULT_LOCAL_PATH = '/api/embeddings';
const DEFAULT_LOCAL_VECTOR_DIM = 768;
const DEFAULT_MIN_SCORE = 0.3;
const DEFAULT_DUPLICATE_THRESHOLD = 0.95;
const DEFAULT_DECAY_HALF_LIFE_DAYS = 30;
const DEFAULT_DECAY_MIN_FACTOR = 0.35;
const DEFAULT_CAPTURE_IMPORTANCE = 0.7;

const AUTO_CAPTURE_TRIGGERS = [
  /记住|记得|回忆|偏好|喜欢|讨厌|总是|永远不要|联系我|邮箱|电话|计划|决定|截止/i,
  /remember|prefer|like|dislike|love|hate|always|never|important|decide|plan|deadline/i,
  /[\w.+-]+@[\w.-]+\.\w+/,
  /\+\d{6,}/,
];

const CATEGORY_SET = new Set(['preference', 'fact', 'decision', 'entity', 'episodic', 'other']);

const dbState = {
  workspace: null,
  dbPath: null,
  vectorDim: null,
  connection: null,
  table: null,
  initPromise: null,
};

const clientState = {
  signature: null,
  client: null,
};

function parseArgs(argv) {
  const args = { _: [] };
  let index = 0;
  while (index < argv.length) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      args._.push(token);
      index += 1;
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
      index += 1;
      continue;
    }
    if (args[key] === undefined) {
      args[key] = next;
    } else if (Array.isArray(args[key])) {
      args[key].push(next);
    } else {
      args[key] = [args[key], next];
    }
    index += 2;
  }
  return args;
}

function boolFlag(value) {
  if (value === true) return true;
  const text = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(text);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function resolveWorkspace(options = {}) {
  return path.resolve(options.workspace || 'savc-core');
}

function resolveVectorDir(workspace) {
  return path.join(workspace, 'memory', 'vector');
}

function resolveDbPath(workspace) {
  return path.join(resolveVectorDir(workspace), 'lancedb');
}

function resolveUsageLogPath(workspace) {
  return path.join(resolveVectorDir(workspace), 'usage.log');
}

function resolveStatePath(workspace) {
  return path.join(resolveVectorDir(workspace), 'state.json');
}

function resolveEmbeddingMode(options = {}) {
  const raw = String(options.embeddingMode || process.env.SAVC_EMBEDDING_MODE || 'prod')
    .trim()
    .toLowerCase();
  if (raw === 'production') return 'prod';
  if (raw === 'test') return 'mock';
  if (raw === 'ollama') return 'local';
  if (raw === 'local') return 'local';
  if (raw === 'mock') return 'mock';
  return 'prod';
}

function resolveLocalEmbeddingModel(options = {}) {
  return String(options.localModel || process.env.LOCAL_EMBEDDING_MODEL || DEFAULT_LOCAL_MODEL).trim() || DEFAULT_LOCAL_MODEL;
}

function resolveEmbeddingModel(options = {}) {
  if (resolveEmbeddingMode(options) === 'local') {
    return resolveLocalEmbeddingModel(options);
  }
  return String(options.model || process.env.EMBEDDING_MODEL || DEFAULT_MODEL).trim();
}

function vectorDimsForModel(model, mode = 'prod', options = {}) {
  if (mode === 'local') {
    const configured = parseInteger(
      options.localVectorDim || process.env.LOCAL_EMBEDDING_VECTOR_DIM,
      DEFAULT_LOCAL_VECTOR_DIM,
    );
    return Math.max(1, configured);
  }
  if (model === 'text-embedding-3-large') return 3072;
  return 1536;
}

function resolveLocalEmbeddingEndpoint(options = {}) {
  const baseURL = String(options.localBaseURL || process.env.LOCAL_EMBEDDING_BASE_URL || DEFAULT_LOCAL_BASE_URL).trim();
  const endpointPath = String(options.localPath || process.env.LOCAL_EMBEDDING_PATH || DEFAULT_LOCAL_PATH).trim();
  const normalizedBase = baseURL.replace(/\/+$/, '');
  const normalizedPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  return `${normalizedBase}${normalizedPath}`;
}

function resolveBoolean(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  return boolFlag(value);
}

function estimateTokens(text) {
  const chars = String(text || '').length;
  const words = String(text || '')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(Math.ceil(chars / 2), Math.ceil(words * 1.5));
}

function parseNumber(value, fallback) {
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeCategory(category) {
  const value = String(category || '').trim().toLowerCase();
  if (!value) return 'other';
  return CATEGORY_SET.has(value) ? value : 'other';
}

function normalizeImportance(value) {
  return clamp(parseNumber(value, 0.5), 0, 1);
}

function looksSensitiveToken(token) {
  if (token.length < 24) return false;
  if (!/[A-Za-z]/.test(token)) return false;
  if (!/\d/.test(token)) return false;
  return true;
}

function redactSensitiveText(input) {
  let text = String(input || '');

  text = text.replace(
    /\b(password|passwd|token|api[_-]?key|secret|credential)\b\s*[:=]\s*([^\s,;]+)/gi,
    (_match, key) => `${key}: [REDACTED]`,
  );

  text = text.replace(/\b[A-Za-z0-9_-]{24,}\b/g, (token) => {
    if (looksSensitiveToken(token)) return '[REDACTED_TOKEN]';
    return token;
  });

  text = text.replace(/\b(?:\d[ -]?){15,}\b/g, '[REDACTED_ID]');
  return text;
}

function similarityFromDistance(distance) {
  const d = Number.isFinite(distance) ? distance : 1;
  return 1 / (1 + Math.max(0, d));
}

function normalizeScore(score) {
  return clamp(Number.parseFloat(String(score)) || 0, 0, 1);
}

function confidenceFromScore(score) {
  if (score >= 0.8) return 'high';
  if (score >= 0.6) return 'medium';
  return 'low';
}

function resolveDecayConfig(options = {}) {
  const enabled = resolveBoolean(options.decayEnabled ?? process.env.MEMORY_SEMANTIC_DECAY_ENABLED, true);
  const halfLifeDays = Math.max(
    1,
    parseNumber(
      options.decayHalfLifeDays ??
        process.env.MEMORY_SEMANTIC_DECAY_HALF_LIFE_DAYS ??
        process.env.MEMORY_SEMANTIC_DECAY_HALFLIFE_DAYS,
      DEFAULT_DECAY_HALF_LIFE_DAYS,
    ),
  );
  const minFactor = clamp(
    parseNumber(options.decayMinFactor ?? process.env.MEMORY_SEMANTIC_DECAY_MIN_FACTOR, DEFAULT_DECAY_MIN_FACTOR),
    0,
    1,
  );
  return { enabled, halfLifeDays, minFactor };
}

function ageDaysFromTimestamp(timestampMs, nowMs = Date.now()) {
  const value = Number.parseInt(String(timestampMs), 10);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.max(0, (nowMs - value) / (24 * 60 * 60 * 1000));
}

function decayFactorForAge(ageDays, decayConfig) {
  if (!decayConfig.enabled) return 1;
  if (!Number.isFinite(ageDays)) return 1;
  const raw = Math.exp((-Math.LN2 * ageDays) / decayConfig.halfLifeDays);
  return clamp(Math.max(decayConfig.minFactor, raw), decayConfig.minFactor, 1);
}

function parseDateLikeFromPath(filePath) {
  const match = String(filePath).match(/(\d{4}-\d{2}-\d{2})\.md$/);
  return match ? match[1] : null;
}

function normalizeVector(values, vectorDim) {
  if (!Array.isArray(values)) {
    return Array.from({ length: vectorDim }, () => 0);
  }
  const vector = values.slice(0, vectorDim).map((value) => Number.parseFloat(String(value)) || 0);
  while (vector.length < vectorDim) {
    vector.push(0);
  }
  return vector;
}

function createMockVector(text, vectorDim) {
  const vector = [];
  let seed = Buffer.from(String(text), 'utf8');
  let block = crypto.createHash('sha256').update(seed).digest();

  for (let i = 0; i < vectorDim; i += 1) {
    if (i % block.length === 0) {
      block = crypto.createHash('sha256').update(block).update(seed).update(String(i)).digest();
      seed = block;
    }
    const value = (block[i % block.length] / 255) * 2 - 1;
    vector.push(value);
  }

  const norm = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0)) || 1;
  return vector.map((item) => item / norm);
}

async function createLocalVector(text, options = {}) {
  const mode = resolveEmbeddingMode(options);
  const model = resolveEmbeddingModel({ ...options, embeddingMode: mode });
  const vectorDim = vectorDimsForModel(model, mode, options);
  const endpoint = resolveLocalEmbeddingEndpoint(options);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`local embedding request failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  const fromOllama = Array.isArray(payload?.embedding) ? payload.embedding : null;
  const fromOpenAICompat = Array.isArray(payload?.data?.[0]?.embedding) ? payload.data[0].embedding : null;
  const rawVector = fromOllama || fromOpenAICompat;
  if (!Array.isArray(rawVector)) {
    throw new Error('local embedding response missing embedding vector');
  }
  return normalizeVector(rawVector, vectorDim);
}

function extractTextFromUnknown(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';

  if (Array.isArray(value)) {
    return value.map((item) => extractTextFromUnknown(item)).filter(Boolean).join('\n');
  }

  if (typeof value.text === 'string') return value.text;
  if (typeof value.content === 'string') return value.content;
  if (Array.isArray(value.content)) {
    return value.content.map((item) => extractTextFromUnknown(item)).filter(Boolean).join('\n');
  }

  if (Array.isArray(value.messages)) {
    return value.messages.map((item) => extractTextFromUnknown(item)).filter(Boolean).join('\n');
  }

  return '';
}

function splitCaptureText(content) {
  return String(content || '')
    .split(/\n{2,}|(?<=[。！？!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function shouldAutoCapture(text, options = {}) {
  const minChars = Math.max(1, parseInteger(options.minChars, 12));
  const maxChars = Math.max(minChars, parseInteger(options.maxChars, 500));
  if (text.length < minChars || text.length > maxChars) return false;
  if (text.includes('<relevant-memories>') || text.includes('[相关记忆]')) return false;
  if (/^#{1,6}\s+/.test(text) || /^```/.test(text) || /^[-*_]{3,}$/.test(text)) return false;
  return AUTO_CAPTURE_TRIGGERS.some((pattern) => pattern.test(text));
}

function detectCaptureCategory(text) {
  if (/(偏好|喜欢|讨厌|prefer|like|dislike|love|hate)/i.test(text)) return 'preference';
  if (/(决定|计划|将会|deadline|截止|decide|plan|will)/i.test(text)) return 'decision';
  if (/(\+\d{6,}|[\w.+-]+@[\w.-]+\.\w+|地址|微信|qq|telegram)/i.test(text)) return 'entity';
  if (/(事实|信息|是|有|在|使用|is|are|has|have)/i.test(text)) return 'fact';
  return 'other';
}

async function appendUsageLog(workspace, operation, tokens, elapsedMs, extra = '') {
  const logPath = resolveUsageLogPath(workspace);
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  const line = `[${new Date().toISOString()}] [${operation}] [tokens=${tokens}] [elapsed_ms=${elapsedMs}]${
    extra ? ` [${extra}]` : ''
  }\n`;
  await fs.appendFile(logPath, line, 'utf8');
}

async function readState(workspace) {
  const statePath = resolveStatePath(workspace);
  if (!(await exists(statePath))) {
    return {
      totalWrites: 0,
      totalRemoves: 0,
      lastWriteAt: null,
      categoryWrites: {},
    };
  }
  try {
    const raw = await fs.readFile(statePath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      totalWrites: Number.parseInt(String(parsed.totalWrites || 0), 10) || 0,
      totalRemoves: Number.parseInt(String(parsed.totalRemoves || 0), 10) || 0,
      lastWriteAt: parsed.lastWriteAt || null,
      categoryWrites: parsed.categoryWrites && typeof parsed.categoryWrites === 'object' ? parsed.categoryWrites : {},
    };
  } catch {
    return {
      totalWrites: 0,
      totalRemoves: 0,
      lastWriteAt: null,
      categoryWrites: {},
    };
  }
}

async function writeState(workspace, state) {
  const statePath = resolveStatePath(workspace);
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');
}

async function recordWriteState(workspace, category, timestamp) {
  const state = await readState(workspace);
  const normalized = normalizeCategory(category);
  state.totalWrites += 1;
  state.lastWriteAt = new Date(timestamp).toISOString();
  state.categoryWrites[normalized] = (state.categoryWrites[normalized] || 0) + 1;
  await writeState(workspace, state);
}

async function recordRemoveState(workspace) {
  const state = await readState(workspace);
  state.totalRemoves += 1;
  await writeState(workspace, state);
}

async function ensureInitialized(options = {}) {
  const workspace = resolveWorkspace(options);
  const mode = resolveEmbeddingMode(options);
  const model = resolveEmbeddingModel({ ...options, embeddingMode: mode });
  const vectorDim = vectorDimsForModel(model, mode, options);
  const dbPath = resolveDbPath(workspace);

  const needsReset =
    dbState.table &&
    (dbState.workspace !== workspace || dbState.dbPath !== dbPath || dbState.vectorDim !== vectorDim);

  if (needsReset) {
    dbState.workspace = null;
    dbState.dbPath = null;
    dbState.vectorDim = null;
    dbState.connection = null;
    dbState.table = null;
    dbState.initPromise = null;
  }

  if (dbState.table && dbState.workspace === workspace && dbState.vectorDim === vectorDim) {
    return;
  }

  if (dbState.initPromise) {
    await dbState.initPromise;
    return;
  }

  dbState.initPromise = (async () => {
    await fs.mkdir(resolveVectorDir(workspace), { recursive: true });

    const connection = await lancedb.connect(dbPath);
    const tableNames = await connection.tableNames();

    let table;
    if (tableNames.includes(TABLE_NAME)) {
      table = await connection.openTable(TABLE_NAME);
    } else {
      table = await connection.createTable(TABLE_NAME, [
        {
          id: '__schema__',
          text: '',
          vector: Array.from({ length: vectorDim }, () => 0),
          importance: 0.5,
          category: 'other',
          source: '',
          createdAt: 0,
          updatedAt: 0,
        },
      ]);
      await table.delete('id = "__schema__"');
    }

    dbState.workspace = workspace;
    dbState.dbPath = dbPath;
    dbState.vectorDim = vectorDim;
    dbState.connection = connection;
    dbState.table = table;
    dbState.initPromise = null;
  })();

  await dbState.initPromise;
}

function resolveOpenAIClient(options = {}) {
  const apiKey = String(options.apiKey || process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required when SAVC_EMBEDDING_MODE=prod');
  }
  const baseURL = String(options.baseURL || process.env.OPENAI_BASE_URL || '').trim() || undefined;
  const signature = `${apiKey}::${baseURL || ''}`;

  if (clientState.client && clientState.signature === signature) {
    return clientState.client;
  }

  clientState.client = new OpenAI({ apiKey, baseURL });
  clientState.signature = signature;
  return clientState.client;
}

async function embedInternal(text, options = {}) {
  const content = String(text || '').trim();
  if (!content) {
    throw new Error('text is required for embedding');
  }

  const workspace = resolveWorkspace(options);
  const mode = resolveEmbeddingMode(options);
  const model = resolveEmbeddingModel({ ...options, embeddingMode: mode });
  const vectorDim = vectorDimsForModel(model, mode, options);

  const start = Date.now();
  const tokens = estimateTokens(content);

  if (mode === 'mock') {
    const vector = createMockVector(content, vectorDim);
    if (!options.skipUsageLog) {
      await appendUsageLog(workspace, 'embed-mock', tokens, Date.now() - start, `model=${model}`);
    }
    return { vector, mode, model, tokens };
  }

  if (mode === 'local') {
    const vector = await createLocalVector(content, { ...options, embeddingMode: mode, model });
    if (!options.skipUsageLog) {
      const endpoint = resolveLocalEmbeddingEndpoint(options);
      await appendUsageLog(
        workspace,
        'embed-local',
        tokens,
        Date.now() - start,
        `model=${model};endpoint=${endpoint}`,
      );
    }
    return { vector, mode, model, tokens };
  }

  const client = resolveOpenAIClient(options);
  const response = await client.embeddings.create({
    model,
    input: content,
  });
  const vector = normalizeVector(response.data?.[0]?.embedding || [], vectorDim);

  if (!options.skipUsageLog) {
    await appendUsageLog(workspace, 'embed-prod', tokens, Date.now() - start, `model=${model}`);
  }

  return { vector, mode, model, tokens };
}

function normalizeStoreMetadata(metadata, workspace) {
  const now = Date.now();
  const createdAt = (() => {
    const value = Number.parseInt(String(metadata.createdAt), 10);
    if (!Number.isFinite(value) || value <= 0) return now;
    return value;
  })();
  const updatedAt = (() => {
    const value = Number.parseInt(String(metadata.updatedAt), 10);
    if (!Number.isFinite(value) || value <= 0) return createdAt;
    return value;
  })();
  const source = String(metadata.source || 'conversation').trim() || 'conversation';
  const category = normalizeCategory(metadata.category);
  return {
    id: crypto.randomUUID(),
    importance: normalizeImportance(metadata.importance),
    category,
    source: source.startsWith(workspace) ? path.relative(workspace, source) : source,
    createdAt,
    updatedAt,
  };
}

async function keywordFallbackSearch(query, options = {}) {
  const workspace = resolveWorkspace(options);
  const memoryRoot = path.join(workspace, 'memory');
  const queryLower = String(query).toLowerCase();

  const roots = [
    path.join(memoryRoot, 'episodic'),
    path.join(memoryRoot, 'semantic'),
    path.join(memoryRoot, 'emotional'),
  ];

  const matches = [];
  let total = 0;

  async function walkMarkdownFiles(rootDir) {
    const output = [];
    if (!(await exists(rootDir))) return output;

    async function walk(current) {
      const entries = await fs.readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          output.push(fullPath);
        }
      }
    }

    await walk(rootDir);
    return output;
  }

  for (const root of roots) {
    const files = await walkMarkdownFiles(root);
    files.sort();
    for (const filePath of files) {
      const raw = await fs.readFile(filePath, 'utf8');
      for (const line of raw.split(/\r?\n/)) {
        if (!line.toLowerCase().includes(queryLower)) continue;
        total += 1;
        if (matches.length >= (options.limit || 10)) continue;
        matches.push({
          id: null,
          text: line.trim().replace(/\s+/g, ' ').slice(0, 200),
          score: 0.4,
          confidence: 'low',
          category: 'other',
          source: path.relative(workspace, filePath),
          createdAt: null,
          updatedAt: null,
          fallback: true,
        });
      }
    }
  }

  return {
    query,
    mode: 'keyword-fallback',
    fallback: true,
    total,
    matches,
  };
}

function parseMigrateCategory(filePath) {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  if (normalized.includes('/episodic/')) return 'episodic';
  if (normalized.includes('/semantic/user-profile')) return 'preference';
  if (normalized.includes('/semantic/facts')) return 'fact';
  if (normalized.includes('/semantic/')) return 'fact';
  if (normalized.includes('/emotional/')) return 'entity';
  return 'other';
}

function segmentLooksLikeFormatting(segment) {
  const lines = String(segment)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return true;

  const formatOnly = lines.every(
    (line) =>
      /^#{1,6}\s+/.test(line) ||
      /^[-*_]{3,}$/.test(line) ||
      /^\|.*\|$/.test(line) ||
      /^```/.test(line) ||
      /^>\s*/.test(line),
  );

  return formatOnly;
}

async function walkMarkdownFiles(rootDir) {
  const output = [];
  if (!(await exists(rootDir))) return output;

  async function walk(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        output.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  return output;
}

export async function embed(text, options = {}) {
  const result = await embedInternal(text, options);
  return result.vector;
}

export async function store(text, metadata = {}, options = {}) {
  const workspace = resolveWorkspace({ ...options, workspace: metadata.workspace || options.workspace });
  const sanitizedText = redactSensitiveText(text).trim();

  if (!sanitizedText) {
    return {
      stored: false,
      duplicate: false,
      reason: 'empty-text',
    };
  }

  await ensureInitialized({ ...options, workspace });

  const duplicateThreshold = clamp(
    parseNumber(
      metadata.duplicateThreshold ?? options.duplicateThreshold ?? process.env.MEMORY_SEMANTIC_DUPLICATE_THRESHOLD,
      DEFAULT_DUPLICATE_THRESHOLD,
    ),
    0,
    1,
  );

  let vector;
  try {
    const embedded = await embedInternal(sanitizedText, { ...options, workspace });
    vector = embedded.vector;
  } catch (error) {
    return {
      stored: false,
      duplicate: false,
      reason: 'embedding-unavailable',
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const candidates = await dbState.table.vectorSearch(vector).limit(5).toArray();
  let maxSimilarity = 0;
  let duplicateId = null;

  for (const row of candidates) {
    const score = similarityFromDistance(row._distance);
    if (score > maxSimilarity) {
      maxSimilarity = score;
      duplicateId = row.id;
    }
  }

  if (maxSimilarity >= duplicateThreshold) {
    return {
      stored: false,
      duplicate: true,
      duplicateId,
      similarity: normalizeScore(maxSimilarity),
      reason: 'duplicate',
    };
  }

  const entryMeta = normalizeStoreMetadata(metadata, workspace);

  const entry = {
    ...entryMeta,
    text: sanitizedText,
    vector,
  };

  await dbState.table.add([entry]);
  await recordWriteState(workspace, entry.category, entry.updatedAt);

  return {
    stored: true,
    duplicate: false,
    entry,
  };
}

export async function search(query, options = {}) {
  const workspace = resolveWorkspace(options);
  const limit = Math.max(1, parseInteger(options.limit || 10, 10));
  const minScore = clamp(
    parseNumber(options.minScore ?? process.env.MEMORY_SEMANTIC_MIN_SCORE, DEFAULT_MIN_SCORE),
    0,
    1,
  );
  const categoryFilter = options.category ? normalizeCategory(options.category) : null;
  const decayConfig = resolveDecayConfig(options);

  await ensureInitialized({ ...options, workspace });

  let vector;
  try {
    const embedded = await embedInternal(query, { ...options, workspace });
    vector = embedded.vector;
  } catch {
    return keywordFallbackSearch(query, { ...options, workspace, limit });
  }

  const vectorRows = await dbState.table.vectorSearch(vector).limit(Math.max(limit * 4, limit)).toArray();
  const mapped = vectorRows
    .map((row) => {
      const createdAt = Number.parseInt(String(row.createdAt), 10) || null;
      const updatedAt = Number.parseInt(String(row.updatedAt), 10) || null;
      const timestamp = updatedAt || createdAt;
      const ageDays = ageDaysFromTimestamp(timestamp);
      const rawScore = normalizeScore(similarityFromDistance(row._distance));
      const decay = decayFactorForAge(ageDays, decayConfig);
      const score = normalizeScore(rawScore * decay);

      return {
        id: row.id,
        text: row.text,
        score,
        rawScore,
        decay,
        ageDays,
        confidence: confidenceFromScore(score),
        importance: Number.parseFloat(String(row.importance)) || 0.5,
        category: normalizeCategory(row.category),
        source: row.source || null,
        createdAt,
        updatedAt,
      };
    })
    .filter((row) => row.score >= minScore)
    .filter((row) => !categoryFilter || row.category === categoryFilter)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);

  return {
    query,
    mode: 'semantic',
    fallback: false,
    decay: decayConfig,
    total: mapped.length,
    matches: mapped,
  };
}

export async function remove(id, options = {}) {
  const workspace = resolveWorkspace(options);
  await ensureInitialized({ ...options, workspace });

  const value = String(id || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`invalid id format: ${id}`);
  }

  // Escape single quotes to prevent filter expression injection.
  // UUID regex above already restricts to [0-9a-f-], but defense-in-depth.
  const safeValue = value.replace(/'/g, "''");
  await dbState.table.delete(`id = '${safeValue}'`);
  await recordRemoveState(workspace);

  return {
    removed: true,
    id: value,
  };
}

export async function stats(options = {}) {
  const workspace = resolveWorkspace(options);
  await ensureInitialized({ ...options, workspace });

  const count = await dbState.table.countRows();
  const state = await readState(workspace);
  const mode = resolveEmbeddingMode(options);
  const model = resolveEmbeddingModel({ ...options, embeddingMode: mode });

  return {
    workspace,
    dbPath: dbState.dbPath,
    table: TABLE_NAME,
    model,
    embeddingMode: mode,
    embeddingProvider: mode === 'local' ? 'local' : mode === 'mock' ? 'mock' : 'openai',
    localEmbeddingEndpoint: mode === 'local' ? resolveLocalEmbeddingEndpoint(options) : null,
    decay: resolveDecayConfig(options),
    count,
    totalWrites: state.totalWrites,
    totalRemoves: state.totalRemoves,
    lastWriteAt: state.lastWriteAt,
    categoryWrites: state.categoryWrites,
    usageLog: resolveUsageLogPath(workspace),
  };
}

export async function migrate(markdownDir, options = {}) {
  const workspace = resolveWorkspace(options);
  const sourceDir = path.resolve(String(markdownDir || '').trim());

  if (!sourceDir) {
    throw new Error('markdownDir is required for migrate');
  }
  if (!(await exists(sourceDir))) {
    throw new Error(`directory not found: ${sourceDir}`);
  }

  const files = await walkMarkdownFiles(sourceDir);
  files.sort();

  const summary = {
    workspace,
    sourceDir,
    files: files.length,
    segments: 0,
    stored: 0,
    duplicateSkipped: 0,
    shortSkipped: 0,
    formatSkipped: 0,
    errors: 0,
  };

  for (const filePath of files) {
    const raw = await fs.readFile(filePath, 'utf8');
    const segments = raw
      .split(/\n\s*\n+/)
      .map((segment) => segment.trim())
      .filter(Boolean);

    for (const segment of segments) {
      summary.segments += 1;

      if (segment.length < 20) {
        summary.shortSkipped += 1;
        continue;
      }
      if (segmentLooksLikeFormatting(segment)) {
        summary.formatSkipped += 1;
        continue;
      }

      try {
        const dateLike = parseDateLikeFromPath(filePath);
        const timestamp = dateLike ? Date.parse(`${dateLike}T00:00:00Z`) : Number.NaN;
        const normalizedTimestamp = Number.isFinite(timestamp) ? timestamp : undefined;
        const result = await store(segment, {
          workspace,
          category: parseMigrateCategory(filePath),
          source: filePath.startsWith(workspace) ? path.relative(workspace, filePath) : filePath,
          importance: 0.5,
          createdAt: normalizedTimestamp,
          updatedAt: normalizedTimestamp,
        }, options);

        if (result.stored) {
          summary.stored += 1;
        } else if (result.duplicate) {
          summary.duplicateSkipped += 1;
        } else {
          summary.errors += 1;
        }
      } catch {
        summary.errors += 1;
      }
    }
  }

  return summary;
}

export async function health(options = {}) {
  const workspace = resolveWorkspace(options);
  let dbOk = false;
  let dbError = null;
  let count = 0;

  try {
    await ensureInitialized({ ...options, workspace });
    count = await dbState.table.countRows();
    dbOk = true;
  } catch (error) {
    dbOk = false;
    dbError = error instanceof Error ? error.message : String(error);
  }

  let embeddingOk = false;
  let embeddingError = null;
  const mode = resolveEmbeddingMode(options);

  try {
    await embedInternal('health check', {
      ...options,
      workspace,
      skipUsageLog: true,
    });
    embeddingOk = true;
  } catch (error) {
    embeddingOk = false;
    embeddingError = error instanceof Error ? error.message : String(error);
  }

  const state = await readState(workspace);

  return {
    workspace,
    db: {
      ok: dbOk,
      path: resolveDbPath(workspace),
      table: TABLE_NAME,
      count,
      error: dbError,
    },
    embedding: {
      ok: embeddingOk,
      mode,
      provider: mode === 'local' ? 'local' : mode === 'mock' ? 'mock' : 'openai',
      model: resolveEmbeddingModel({ ...options, embeddingMode: mode }),
      endpoint: mode === 'local' ? resolveLocalEmbeddingEndpoint(options) : null,
      error: embeddingError,
    },
    decay: resolveDecayConfig(options),
    lastWriteAt: state.lastWriteAt,
    usageLog: resolveUsageLogPath(workspace),
  };
}

export async function autoRecall(query, options = {}) {
  const recallLimit = Math.max(1, parseInteger(options.limit || 3, 3));
  const result = await search(query, {
    ...options,
    limit: recallLimit,
  });
  const lines = (result.matches || [])
    .slice(0, recallLimit)
    .map((item) => `- [${item.category}] ${item.text}`);

  return {
    query,
    mode: result.mode,
    fallback: result.fallback,
    total: lines.length,
    matches: (result.matches || []).slice(0, recallLimit),
    context:
      lines.length > 0
        ? `<relevant-memories>\nThe following memories may be relevant:\n${lines.join('\n')}\n</relevant-memories>`
        : '',
  };
}

export async function autoCapture(input, options = {}) {
  const workspace = resolveWorkspace(options);
  const limit = Math.max(1, parseInteger(options.limit || 3, 3));
  const source = String(options.source || 'auto-capture').trim() || 'auto-capture';
  const importance = normalizeImportance(parseNumber(options.importance, DEFAULT_CAPTURE_IMPORTANCE));
  const rawText = extractTextFromUnknown(input);
  const fragments = splitCaptureText(rawText);
  const deduped = [];
  const seen = new Set();
  for (const fragment of fragments) {
    const cleaned = redactSensitiveText(fragment).trim();
    if (!cleaned) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    deduped.push(cleaned);
  }

  const candidates = deduped.filter((text) => shouldAutoCapture(text, options));
  const entries = [];
  let duplicateSkipped = 0;
  let skipped = deduped.length - candidates.length;
  let errors = 0;

  for (const text of candidates) {
    if (entries.length >= limit) break;
    const result = await store(
      text,
      {
        workspace,
        source,
        category: detectCaptureCategory(text),
        importance,
      },
      {
        ...options,
        workspace,
      },
    );

    if (result.stored && result.entry) {
      entries.push({
        id: result.entry.id,
        text: result.entry.text,
        category: result.entry.category,
        source: result.entry.source,
      });
      continue;
    }
    if (result.duplicate) {
      duplicateSkipped += 1;
      continue;
    }
    if (result.reason === 'embedding-unavailable') {
      errors += 1;
      continue;
    }
    skipped += 1;
  }

  return {
    workspace,
    source,
    totalInput: fragments.length,
    candidateCount: candidates.length,
    stored: entries.length,
    duplicateSkipped,
    skipped,
    errors,
    entries,
  };
}

function printHumanSearch(result) {
  console.log(`# Semantic Search: ${result.query}`);
  console.log(`mode: ${result.mode}`);
  console.log(`fallback: ${result.fallback ? 'yes' : 'no'}`);
  console.log(`total: ${result.total}`);
  for (const item of result.matches || []) {
    const source = item.source ? ` (${item.source})` : '';
    console.log(`- ${item.text}${source}`);
    if (item.score !== undefined) {
      console.log(`  score=${Number(item.score).toFixed(4)} confidence=${item.confidence || confidenceFromScore(item.score)}`);
    }
  }
}

async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  const outputJson = boolFlag(args.json);

  if (!command) {
    throw new Error(
      'usage: memory_semantic.mjs <store|search|remove|stats|migrate|health|auto-recall|auto-capture> [--flags]',
    );
  }

  if (command === 'store') {
    const text = String(args.text || args._[1] || '').trim();
    if (!text) {
      throw new Error('--text is required for store');
    }
    const result = await store(
      text,
      {
        workspace: args.workspace,
        source: args.source,
        category: args.category,
        importance: args.importance,
        createdAt: args['created-at'],
        updatedAt: args['updated-at'],
        duplicateThreshold: args['duplicate-threshold'],
      },
      {
        workspace: args.workspace,
        model: args.model,
        embeddingMode: args['embedding-mode'],
      },
    );
    if (outputJson) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'search') {
    const query = String(args.query || args._[1] || '').trim();
    if (!query) {
      throw new Error('--query is required for search');
    }
    const result = await search(query, {
      workspace: args.workspace,
      limit: args.limit,
      minScore: args['min-score'],
      category: args.category,
      model: args.model,
      embeddingMode: args['embedding-mode'],
    });
    if (outputJson) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    printHumanSearch(result);
    return;
  }

  if (command === 'remove') {
    const id = String(args.id || args._[1] || '').trim();
    if (!id) {
      throw new Error('--id is required for remove');
    }
    const result = await remove(id, {
      workspace: args.workspace,
      model: args.model,
      embeddingMode: args['embedding-mode'],
    });
    console.log(JSON.stringify(result, null, outputJson ? 2 : 0));
    return;
  }

  if (command === 'stats') {
    const result = await stats({
      workspace: args.workspace,
      model: args.model,
      embeddingMode: args['embedding-mode'],
    });
    console.log(JSON.stringify(result, null, outputJson ? 2 : 0));
    return;
  }

  if (command === 'migrate') {
    const markdownDir = String(args.dir || args._[1] || '').trim();
    if (!markdownDir) {
      throw new Error('markdownDir is required for migrate');
    }
    const result = await migrate(markdownDir, {
      workspace: args.workspace,
      model: args.model,
      embeddingMode: args['embedding-mode'],
      duplicateThreshold: args['duplicate-threshold'],
    });
    console.log(JSON.stringify(result, null, outputJson ? 2 : 0));
    return;
  }

  if (command === 'health') {
    const result = await health({
      workspace: args.workspace,
      model: args.model,
      embeddingMode: args['embedding-mode'],
    });
    console.log(JSON.stringify(result, null, outputJson ? 2 : 0));
    return;
  }

  if (command === 'auto-recall') {
    const query = String(args.query || args._[1] || '').trim();
    if (!query) {
      throw new Error('--query is required for auto-recall');
    }
    const result = await autoRecall(query, {
      workspace: args.workspace,
      limit: args.limit,
      minScore: args['min-score'],
      model: args.model,
      embeddingMode: args['embedding-mode'],
    });
    if (outputJson) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(result.context || '<relevant-memories>\n- 无\n</relevant-memories>');
    return;
  }

  if (command === 'auto-capture') {
    const textValue = String(args.text || args._[1] || '').trim();
    const fileValue = String(args.file || '').trim();
    if (!textValue && !fileValue) {
      throw new Error('--text or --file is required for auto-capture');
    }
    let input = textValue;
    if (fileValue) {
      input = await fs.readFile(path.resolve(fileValue), 'utf8');
    }
    const result = await autoCapture(input, {
      workspace: args.workspace,
      source: args.source,
      limit: args.limit,
      minChars: args['min-chars'],
      maxChars: args['max-chars'],
      importance: args.importance,
      model: args.model,
      embeddingMode: args['embedding-mode'],
    });
    console.log(JSON.stringify(result, null, outputJson ? 2 : 0));
    return;
  }

  throw new Error(`unknown command: ${command}`);
}

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
