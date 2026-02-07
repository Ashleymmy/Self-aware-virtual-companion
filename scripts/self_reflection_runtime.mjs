#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

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

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitFrontmatter(text) {
  if (!text.startsWith('---\n')) {
    return { frontmatter: '', body: text };
  }
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) {
    return { frontmatter: '', body: text };
  }
  return {
    frontmatter: text.slice(4, end),
    body: text.slice(end + 5),
  };
}

function parseFrontmatter(frontmatterText) {
  const countMatch = frontmatterText.match(/^conversation_count:\s*(\d+)/m);
  const scoreMatch = frontmatterText.match(/^self_score:\s*(\d+)/m);
  const topicsMatch = frontmatterText.match(/^topics:\s*\[(.*)\]/m);
  const topics = [];
  if (topicsMatch) {
    const raw = topicsMatch[1].trim();
    if (raw.length > 0) {
      raw.split(',').forEach((item) => {
        const cleaned = item.trim().replace(/^"|"$/g, '');
        if (cleaned) topics.push(cleaned);
      });
    }
  }
  return {
    conversationCount: countMatch ? Number.parseInt(countMatch[1], 10) : null,
    selfScore: scoreMatch ? Number.parseInt(scoreMatch[1], 10) : null,
    topics,
  };
}

function parseTopicsFromIndex(indexText, date) {
  const topics = [];
  for (const line of indexText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const parts = trimmed.split('|').map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    if (parts[0] === '日期') continue;
    if (parts[0] !== date) continue;
    const rawTopics = parts[1] || '';
    rawTopics.split(',').forEach((item) => {
      const cleaned = item.trim();
      if (cleaned && !topics.includes(cleaned)) {
        topics.push(cleaned);
      }
    });
  }
  return topics;
}

async function loadEpisodicMeta(workspace, date) {
  const month = date.slice(0, 7);
  const dayFile = path.join(workspace, 'memory', 'episodic', month, `${date}.md`);
  const indexFile = path.join(workspace, 'memory', 'episodic', 'index.md');

  let conversationCount = null;
  if (await exists(dayFile)) {
    const text = await fs.readFile(dayFile, 'utf8');
    const { frontmatter, body } = splitFrontmatter(text);
    const parsed = parseFrontmatter(frontmatter);
    if (parsed.conversationCount !== null) {
      conversationCount = parsed.conversationCount;
    } else {
      const matches = body.match(/^###\s+/gm);
      conversationCount = matches ? matches.length : 0;
    }
  }

  let topics = [];
  if (await exists(indexFile)) {
    const indexText = await fs.readFile(indexFile, 'utf8');
    topics = parseTopicsFromIndex(indexText, date);
  }

  return { conversationCount, topics };
}

async function writeDaily(options) {
  const workspace = path.resolve(options.workspace || 'savc-core');
  const date = options.date || todayISO();
  const selfScore = Number.parseInt(String(options['self-score'] || '3'), 10);

  let conversationCount = options['conversation-count'] === undefined
    ? null
    : Number.parseInt(String(options['conversation-count']), 10);
  let topics = normalizeList(options.topics || '');

  if (conversationCount === null || topics.length === 0) {
    const episodicMeta = await loadEpisodicMeta(workspace, date);
    if (conversationCount === null && episodicMeta.conversationCount !== null) {
      conversationCount = episodicMeta.conversationCount;
    }
    if (topics.length === 0 && episodicMeta.topics.length > 0) {
      topics = episodicMeta.topics;
    }
  }

  if (!Number.isFinite(conversationCount)) {
    conversationCount = 0;
  }

  const growthRoot = path.join(workspace, 'memory', 'growth');
  await fs.mkdir(growthRoot, { recursive: true });

  const filePath = path.join(growthRoot, `${date}.md`);
  const topicList = topics.length ? topics.map((t) => `"${t}"`).join(', ') : '';

  const body = [
    '---',
    `date: "${date}"`,
    `conversation_count: ${conversationCount}`,
    `topics: [${topicList}]`,
    `self_score: ${selfScore}`,
    '---',
    '',
    '## 今日统计',
    `- 对话轮数: ${conversationCount}`,
    `- 主要话题: ${topics.length ? topics.join(', ') : '待补充'}`,
    '- 用户情绪: 待总结',
    '',
    '## 做得好的',
    '- [待补充]',
    '',
    '## 需要改进的',
    '- [待补充]',
    '',
    '## 今日所学',
    '- [待补充]',
    '',
    '## 明日计划',
    '- [待补充]',
    '',
  ].join('\n');

  await fs.writeFile(filePath, body, 'utf8');
  console.log(`WROTE ${filePath}`);
}

async function aggregateMonthly(growthRoot, month) {
  const entries = await fs.readdir(growthRoot).catch(() => []);
  let totalConversations = 0;
  const topicSet = new Set();
  let scoreSum = 0;
  let scoreCount = 0;

  for (const file of entries) {
    if (!/^\d{4}-\d{2}-\d{2}\.md$/.test(file)) continue;
    if (!file.startsWith(`${month}-`)) continue;
    const text = await fs.readFile(path.join(growthRoot, file), 'utf8');
    const { frontmatter } = splitFrontmatter(text);
    const parsed = parseFrontmatter(frontmatter);
    if (parsed.conversationCount !== null) {
      totalConversations += parsed.conversationCount;
    }
    if (parsed.selfScore !== null) {
      scoreSum += parsed.selfScore;
      scoreCount += 1;
    }
    parsed.topics.forEach((topic) => topicSet.add(topic));
  }

  return {
    totalConversations,
    topics: Array.from(topicSet),
    avgScore: scoreCount > 0 ? (scoreSum / scoreCount) : null,
  };
}

async function writeMonthly(options) {
  const workspace = path.resolve(options.workspace || 'savc-core');
  const month = options.month || todayISO().slice(0, 7);
  const summaryRoot = path.join(workspace, 'memory', 'growth', 'monthly-summary');
  await fs.mkdir(summaryRoot, { recursive: true });

  const stats = await aggregateMonthly(path.join(workspace, 'memory', 'growth'), month);
  const topicsLine = stats.topics.length > 0 ? stats.topics.join(', ') : '[待统计]';
  const scoreLine = stats.avgScore !== null ? stats.avgScore.toFixed(2) : '[待统计]';
  const totalLine = stats.totalConversations > 0 ? String(stats.totalConversations) : '[待统计]';

  const filePath = path.join(summaryRoot, `${month}.md`);
  const body = [
    '---',
    `month: "${month}"`,
    '---',
    '',
    '# 月度总结',
    '',
    '## 本月统计',
    `- 对话总量: ${totalLine}`,
    `- 主要话题: ${topicsLine}`,
    '- 用户情绪: [待统计]',
    '',
    '## 新掌握工具',
    '- [待补充]',
    '',
    '## 用户偏好变化',
    '- [待补充]',
    '',
    '## 自评分趋势',
    `- 平均自评分: ${scoreLine}`,
    '',
    '## 下月改进目标',
    '- [待补充]',
    '',
  ].join('\n');

  await fs.writeFile(filePath, body, 'utf8');
  console.log(`WROTE ${filePath}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (!command) {
    throw new Error('usage: self_reflection_runtime.mjs <daily|monthly> [--flags]');
  }
  if (command === 'daily') {
    await writeDaily(args);
    return;
  }
  if (command === 'monthly') {
    await writeMonthly(args);
    return;
  }
  throw new Error(`unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
