#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { search as semanticSearch } from './memory_semantic.mjs';

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
  const moodMatch = frontmatterText.match(/^user_mood:\s*"([^"]*)"/m);

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
    mood: moodMatch ? moodMatch[1] : null,
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

function parseMoodRows(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    if (trimmed.includes('---')) continue;
    const parts = trimmed.split('|').map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    if (parts[0] === '日期') continue;
    const score = Number.parseFloat(parts[1]);
    if (!Number.isFinite(score)) continue;
    rows.push({
      date: parts[0],
      score,
      topic: parts[2] || '',
      action: parts[3] || '',
    });
  }
  return rows;
}

function updateLastUpdated(text, date) {
  if (/^last_updated:/m.test(text)) {
    return text.replace(/^last_updated:\s*"[^"]*"/m, `last_updated: "${date}"`);
  }
  return text;
}

async function loadEpisodicMeta(workspace, date) {
  const month = date.slice(0, 7);
  const dayFile = path.join(workspace, 'memory', 'episodic', month, `${date}.md`);
  const indexFile = path.join(workspace, 'memory', 'episodic', 'index.md');

  let conversationCount = null;
  let userMood = null;

  if (await exists(dayFile)) {
    const text = await fs.readFile(dayFile, 'utf8');
    const { frontmatter, body } = splitFrontmatter(text);
    const parsed = parseFrontmatter(frontmatter);
    userMood = parsed.mood;
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

  return { conversationCount, topics, userMood };
}

async function loadToolSignals(workspace, date) {
  const queueFile = path.join(workspace, 'memory', 'tools', 'learning-queue.md');
  const toolsRoot = path.join(workspace, 'memory', 'tools');
  const pending = [];
  const learnedToday = [];

  if (await exists(queueFile)) {
    const queueText = await fs.readFile(queueFile, 'utf8');
    for (const line of queueText.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('- [pending]')) continue;
      pending.push(trimmed.replace(/^- \[pending\]\s*/, ''));
    }
  }

  if (await exists(toolsRoot)) {
    const entries = await fs.readdir(toolsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const schemaFile = path.join(toolsRoot, entry.name, 'schema.md');
      if (!(await exists(schemaFile))) continue;
      const text = await fs.readFile(schemaFile, 'utf8');
      if (text.includes(`last_updated: "${date}"`)) {
        const toolMatch = text.match(/^tool:\s*"([^"]+)"/m);
        learnedToday.push(toolMatch ? toolMatch[1] : entry.name);
      }
    }
  }

  return { pending, learnedToday };
}

async function loadMoodSignal(workspace, date) {
  const moodFile = path.join(workspace, 'memory', 'emotional', 'mood-log.md');
  if (!(await exists(moodFile))) {
    return { userMood: null, avg3: null, lowMood: false };
  }

  const text = await fs.readFile(moodFile, 'utf8');
  const rows = parseMoodRows(text);
  const daily = rows.filter((row) => row.date === date);
  const recent = rows.slice(-3);

  const avg3 = recent.length > 0
    ? recent.reduce((sum, row) => sum + row.score, 0) / recent.length
    : null;
  const lowMood = avg3 !== null && avg3 <= 2;

  return {
    userMood: daily.length > 0 ? `评分${daily[daily.length - 1].score}` : null,
    avg3,
    lowMood,
  };
}

async function loadProactiveState(workspace) {
  const stateFile = path.join(workspace, 'memory', 'procedural', 'proactive-state.json');
  if (!(await exists(stateFile))) {
    return null;
  }
  const raw = await fs.readFile(stateFile, 'utf8');
  return JSON.parse(raw);
}

function dateFromTimestamp(value) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

async function recallHistoricalMemories(workspace, date, topics) {
  const queries = [];
  if (topics.length > 0) {
    queries.push(`关于 ${topics[0]} 的历史上下文`);
  }
  queries.push('最近用户关心的话题');
  queries.push('近期用户偏好与决策');

  const picked = [];
  const seen = new Set();

  for (const query of queries) {
    let result;
    try {
      result = await semanticSearch(query, {
        workspace,
        limit: 5,
      });
    } catch {
      continue;
    }
    for (const item of result.matches || []) {
      const text = String(item.text || '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const memoryDate = item.updatedAt ? dateFromTimestamp(item.updatedAt) : dateFromTimestamp(item.createdAt);
      if (memoryDate && memoryDate === date) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push({
        text,
        score: Number.parseFloat(String(item.score)) || null,
        source: item.source || null,
      });
      if (picked.length >= 3) {
        return picked;
      }
    }
  }

  return picked;
}

async function updateUserProfile(workspace, date, topics) {
  const profileFile = path.join(workspace, 'memory', 'semantic', 'user-profile.md');
  if (!(await exists(profileFile))) return;

  let text = await fs.readFile(profileFile, 'utf8');
  text = updateLastUpdated(text, date);
  const topicLine = `- [observed ${date}] 最近主要话题: ${topics.join(', ') || '无'}`;
  if (!text.includes(topicLine)) {
    text = `${text.trimEnd()}\n${topicLine}\n`;
  }
  await fs.writeFile(profileFile, text, 'utf8');
}

async function updateRelationship(workspace, date, conversationCount, selfScore) {
  const relationshipFile = path.join(workspace, 'memory', 'emotional', 'relationship.md');
  if (!(await exists(relationshipFile))) return;

  let text = await fs.readFile(relationshipFile, 'utf8');
  text = updateLastUpdated(text, date);
  const line = `- ${date}: 互动${conversationCount}次，自评${selfScore}/5`;
  if (!text.includes(line)) {
    text = `${text.trimEnd()}\n${line}\n`;
  }
  await fs.writeFile(relationshipFile, text, 'utf8');
}

function buildTuningDirectives(params) {
  const { conversationCount, lowMood, topics, selfScore } = params;
  const directives = [];

  if (conversationCount >= 6) {
    directives.push('response_length.casual_chat: short');
  }
  if (lowMood) {
    directives.push('tone.default: gentle');
  }
  if (selfScore <= 3) {
    directives.push('response_length.explanation: short');
  }
  if (topics.some((topic) => /AI|工具|编程|OpenClaw|架构/i.test(topic))) {
    directives.push('topics.enthusiastic.add: "自动化工程"');
  }

  if (directives.length === 0) {
    directives.push('response_length.explanation: medium');
  }

  return directives;
}

async function writeDaily(options) {
  const workspace = path.resolve(options.workspace || 'savc-core');
  const date = options.date || todayISO();
  const selfScore = Number.parseInt(String(options['self-score'] || '4'), 10);

  let conversationCount = options['conversation-count'] === undefined
    ? null
    : Number.parseInt(String(options['conversation-count']), 10);
  let topics = normalizeList(options.topics || '');

  const episodicMeta = await loadEpisodicMeta(workspace, date);
  const moodSignal = await loadMoodSignal(workspace, date);
  const toolSignal = await loadToolSignals(workspace, date);
  const proactiveState = await loadProactiveState(workspace);

  if (conversationCount === null && episodicMeta.conversationCount !== null) {
    conversationCount = episodicMeta.conversationCount;
  }
  if (topics.length === 0 && episodicMeta.topics.length > 0) {
    topics = episodicMeta.topics;
  }

  if (!Number.isFinite(conversationCount)) {
    conversationCount = 0;
  }

  const userMood = moodSignal.userMood || episodicMeta.userMood || '平稳';
  const goodPoints = [];
  const improvePoints = [];
  const learnedPoints = [];
  const plans = [];
  const historicalMemories = await recallHistoricalMemories(workspace, date, topics);

  if (conversationCount > 0) {
    goodPoints.push(`保持了 ${conversationCount} 轮对话连续性`);
  } else {
    improvePoints.push('今日缺少有效互动，需要提升主动触达策略');
  }

  if (topics.length > 0) {
    goodPoints.push(`覆盖话题: ${topics.join(', ')}`);
    plans.push(`继续跟进话题: ${topics[0]}`);
  } else {
    improvePoints.push('话题覆盖不足，建议引导用户明确当前重点');
  }

  if (toolSignal.learnedToday.length > 0) {
    learnedPoints.push(`学习工具: ${toolSignal.learnedToday.join(', ')}`);
    goodPoints.push(`完成工具学习: ${toolSignal.learnedToday.join(', ')}`);
  }

  if (toolSignal.pending.length > 0) {
    plans.push(`优先学习队列: ${toolSignal.pending.slice(0, 2).join(' ; ')}`);
  }

  if (moodSignal.lowMood) {
    improvePoints.push('近期情绪评分偏低，后续回复需要更温和且分步');
    plans.push('增加情绪支持型主动消息，避免信息过载');
  }

  if (proactiveState && Number.isFinite(proactiveState.dailyCount)) {
    learnedPoints.push(`主动消息状态: 今日已触达 ${proactiveState.dailyCount} 次`);
  }

  if (historicalMemories.length > 0) {
    const top = historicalMemories[0];
    goodPoints.push('引入历史语义记忆补充长期上下文');
    learnedPoints.push(`历史记忆补充: ${top.text}`);
    plans.push(`结合历史上下文继续推进: ${top.text.slice(0, 24)}...`);
  }

  if (goodPoints.length === 0) {
    goodPoints.push('按计划完成了基础反思流程');
  }
  if (improvePoints.length === 0) {
    improvePoints.push('继续提高反馈精度，减少抽象表达');
  }
  if (learnedPoints.length === 0) {
    learnedPoints.push('巩固已有记忆结构与触发策略');
  }
  if (plans.length === 0) {
    plans.push('明天优先完成一次主动触达与一次工具学习回顾');
  }

  const tuningDirectives = buildTuningDirectives({
    conversationCount,
    lowMood: moodSignal.lowMood,
    topics,
    selfScore,
  });

  const growthRoot = path.join(workspace, 'memory', 'growth');
  await fs.mkdir(growthRoot, { recursive: true });
  const filePath = path.join(growthRoot, `${date}.md`);
  const topicList = topics.length ? topics.map((topic) => `"${topic}"`).join(', ') : '';

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
    `- 主要话题: ${topics.length ? topics.join(', ') : '无'}`,
    `- 用户情绪: ${userMood}`,
    '',
    '## 做得好的',
    ...goodPoints.map((item) => `- ${item}`),
    '',
    '## 需要改进的',
    ...improvePoints.map((item) => `- ${item}`),
    '',
    '## 今日所学',
    ...learnedPoints.map((item) => `- ${item}`),
    '',
    '## 历史相关记忆',
    ...(historicalMemories.length > 0
      ? historicalMemories.map((item) => {
          const source = item.source ? ` (${item.source})` : '';
          const score = Number.isFinite(item.score) ? ` [score=${item.score.toFixed(4)}]` : '';
          return `- ${item.text}${source}${score}`;
        })
      : ['- 无']),
    '',
    '## 人格微调',
    ...tuningDirectives.map((item) => `- ${item}`),
    '',
    '## 明日计划',
    ...plans.map((item) => `- ${item}`),
    '',
  ].join('\n');

  await fs.writeFile(filePath, body, 'utf8');
  await updateUserProfile(workspace, date, topics);
  await updateRelationship(workspace, date, conversationCount, selfScore);

  console.log(`WROTE ${filePath}`);
}

function parseSectionBullets(text, heading) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) return [];
  const out = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith('## ')) break;
    const trimmed = line.trim();
    if (trimmed.startsWith('- ')) {
      out.push(trimmed.slice(2).trim());
    }
  }
  return out;
}

async function aggregateMonthly(workspace, month) {
  const growthRoot = path.join(workspace, 'memory', 'growth');
  const entries = await fs.readdir(growthRoot).catch(() => []);
  let totalConversations = 0;
  const topicSet = new Set();
  let scoreSum = 0;
  let scoreCount = 0;
  const toolSet = new Set();

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

    const learned = parseSectionBullets(text, '今日所学');
    for (const line of learned) {
      const match = line.match(/学习工具:\s*(.+)$/);
      if (!match) continue;
      match[1].split(',').map((item) => item.trim()).filter(Boolean).forEach((tool) => toolSet.add(tool));
    }
  }

  const profileFile = path.join(workspace, 'memory', 'semantic', 'user-profile.md');
  const preferenceChanges = [];
  if (await exists(profileFile)) {
    const profileText = await fs.readFile(profileFile, 'utf8');
    for (const line of profileText.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('- [observed')) continue;
      if (!trimmed.includes(month)) continue;
      preferenceChanges.push(trimmed.replace(/^-\s*/, ''));
    }
  }

  return {
    totalConversations,
    topics: Array.from(topicSet),
    avgScore: scoreCount > 0 ? (scoreSum / scoreCount) : null,
    tools: Array.from(toolSet),
    preferenceChanges,
  };
}

async function writeMonthly(options) {
  const workspace = path.resolve(options.workspace || 'savc-core');
  const month = options.month || todayISO().slice(0, 7);
  const summaryRoot = path.join(workspace, 'memory', 'growth', 'monthly-summary');
  await fs.mkdir(summaryRoot, { recursive: true });

  const stats = await aggregateMonthly(workspace, month);

  const filePath = path.join(summaryRoot, `${month}.md`);
  const body = [
    '---',
    `month: "${month}"`,
    '---',
    '',
    '# 月度总结',
    '',
    '## 本月统计',
    `- 对话总量: ${stats.totalConversations}`,
    `- 主要话题: ${stats.topics.length > 0 ? stats.topics.join(', ') : '无'}`,
    `- 用户情绪: ${stats.avgScore !== null && stats.avgScore < 3 ? '需更多支持' : '总体稳定'}`,
    '',
    '## 新掌握工具',
    ...(stats.tools.length > 0 ? stats.tools.map((tool) => `- ${tool}`) : ['- 无新增工具记录']),
    '',
    '## 用户偏好变化',
    ...(stats.preferenceChanges.length > 0 ? stats.preferenceChanges.map((line) => `- ${line}`) : ['- 本月暂无新增偏好变化']),
    '',
    '## 自评分趋势',
    `- 平均自评分: ${stats.avgScore !== null ? stats.avgScore.toFixed(2) : '0.00'}`,
    '',
    '## 下月改进目标',
    '- 将工具学习与反思日志绑定为固定闭环',
    '- 继续提升情绪支持触发的准确率',
    '- 按周复盘主动触达质量与打扰控制',
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
