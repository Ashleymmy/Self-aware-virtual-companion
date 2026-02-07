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

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function writeDaily(options) {
  const workspace = path.resolve(options.workspace || 'savc-core');
  const date = options.date || todayISO();
  const conversationCount = Number.parseInt(String(options['conversation-count'] || '0'), 10);
  const selfScore = Number.parseInt(String(options['self-score'] || '3'), 10);
  const topics = normalizeList(options.topics || '');

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

async function writeMonthly(options) {
  const workspace = path.resolve(options.workspace || 'savc-core');
  const month = options.month || todayISO().slice(0, 7);
  const summaryRoot = path.join(workspace, 'memory', 'growth', 'monthly-summary');
  await fs.mkdir(summaryRoot, { recursive: true });

  const filePath = path.join(summaryRoot, `${month}.md`);
  const body = [
    '---',
    `month: "${month}"`,
    '---',
    '',
    '# 月度总结',
    '',
    '## 本月统计',
    '- 对话总量: [待统计]',
    '- 主要话题: [待统计]',
    '- 用户情绪: [待统计]',
    '',
    '## 新掌握工具',
    '- [待补充]',
    '',
    '## 用户偏好变化',
    '- [待补充]',
    '',
    '## 自评分趋势',
    '- [待补充]',
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
