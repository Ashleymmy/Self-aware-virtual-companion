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

function asList(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nowHM() {
  return new Date().toISOString().slice(11, 16);
}

function estimateTokens(text) {
  const chars = text.length;
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(Math.ceil(chars / 2), Math.ceil(words * 1.5));
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

function parseDayFrontmatter(frontmatterText, date) {
  const countMatch = frontmatterText.match(/^conversation_count:\s*(\d+)/m);
  const moodMatch = frontmatterText.match(/^user_mood:\s*"([^"]*)"/m);
  const topicsMatch = frontmatterText.match(/^main_topics:\s*\[(.*)\]$/m);

  let topics = [];
  if (topicsMatch) {
    const raw = topicsMatch[1].trim();
    if (raw.length > 0) {
      topics = raw
        .split(',')
        .map((item) => item.trim().replace(/^"|"$/g, ''))
        .filter(Boolean);
    }
  }

  return {
    date,
    conversationCount: countMatch ? Number.parseInt(countMatch[1], 10) : 0,
    mainTopics: topics,
    userMood: moodMatch ? moodMatch[1] : '未知',
  };
}

function renderDayDocument(meta, body) {
  const topics = meta.mainTopics.map((topic) => `"${topic}"`).join(', ');
  const normalizedBody = body.trim().length === 0 ? '## 对话摘要\n' : body.trimEnd() + '\n';
  return [
    '---',
    `date: "${meta.date}"`,
    `conversation_count: ${meta.conversationCount}`,
    `main_topics: [${topics}]`,
    `user_mood: "${meta.userMood}"`,
    '---',
    '',
    normalizedBody,
  ].join('\n');
}

function updateLastUpdated(text, date) {
  if (/^last_updated:/m.test(text)) {
    return text.replace(/^last_updated:\s*"[^"]*"/m, `last_updated: "${date}"`);
  }
  return text;
}

async function ensureFile(filePath, defaultContent) {
  if (!(await exists(filePath))) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, defaultContent, 'utf8');
  }
}

async function writeMemory(options) {
  const workspace = path.resolve(options.workspace || 'savc-core');
  const memoryRoot = path.join(workspace, 'memory');
  const date = options.date || todayISO();
  const month = date.slice(0, 7);
  const time = options.time || nowHM();
  const topic = options.topic || '未分类';
  const summary = options.summary || '';
  const mood = options.mood || '待观察';
  const facts = asList(options.fact);
  const preferences = asList(options.preference);
  const relationshipNotes = asList(options['relationship-note']);

  if (summary.trim().length === 0) {
    throw new Error('--summary is required for write');
  }

  const dayFile = path.join(memoryRoot, 'episodic', month, `${date}.md`);
  const dayDefault = [
    '---',
    `date: "${date}"`,
    'conversation_count: 0',
    'main_topics: []',
    'user_mood: "未知"',
    '---',
    '',
    '## 对话摘要',
    '',
  ].join('\n');

  await ensureFile(dayFile, dayDefault);
  const dayText = await fs.readFile(dayFile, 'utf8');
  const { frontmatter, body } = splitFrontmatter(dayText);
  const meta = parseDayFrontmatter(frontmatter, date);
  meta.conversationCount += 1;
  if (!meta.mainTopics.includes(topic)) {
    meta.mainTopics.push(topic);
  }
  meta.userMood = mood;

  const entry = [
    '',
    `### 对话 ${meta.conversationCount} (${time})`,
    `- **话题**: ${topic}`,
    `- **要点**: ${summary}`,
    `- **用户情绪**: ${mood}`,
    '',
  ].join('\n');

  const baseBody = body.trim().length === 0 ? '## 对话摘要\n' : body;
  const nextDay = renderDayDocument(meta, `${baseBody.trimEnd()}${entry}`);
  await fs.writeFile(dayFile, nextDay, 'utf8');

  const indexFile = path.join(memoryRoot, 'episodic', 'index.md');
  await ensureFile(
    indexFile,
    [
      `---`,
      `last_updated: "${date}"`,
      `index_version: "1.0"`,
      `---`,
      '',
      '# 情景记忆索引',
      '',
      '## 索引表',
      '',
      '| 日期 | 主题 | 关键词 | 情绪趋势 |',
      '|---|---|---|---|',
    ].join('\n') + '\n',
  );
  let indexText = await fs.readFile(indexFile, 'utf8');
  indexText = updateLastUpdated(indexText, date);
  const indexRow = `| ${date} | ${topic} | ${topic} | ${mood} |`;
  if (!indexText.includes(indexRow)) {
    indexText = `${indexText.trimEnd()}\n${indexRow}\n`;
  }
  await fs.writeFile(indexFile, indexText, 'utf8');

  const profileFile = path.join(memoryRoot, 'semantic', 'user-profile.md');
  if (await exists(profileFile)) {
    let profileText = await fs.readFile(profileFile, 'utf8');
    profileText = updateLastUpdated(profileText, date);
    for (const preference of preferences) {
      const line = `- [observed ${date}] ${preference}`;
      if (!profileText.includes(line)) {
        profileText = `${profileText.trimEnd()}\n${line}\n`;
      }
    }
    await fs.writeFile(profileFile, profileText, 'utf8');
  }

  const factsFile = path.join(memoryRoot, 'semantic', 'facts.md');
  if (await exists(factsFile)) {
    let factsText = await fs.readFile(factsFile, 'utf8');
    factsText = updateLastUpdated(factsText, date);
    for (const fact of facts) {
      const line = `- [confirmed] ${fact}`;
      if (!factsText.includes(line)) {
        factsText = `${factsText.trimEnd()}\n${line}\n`;
      }
    }
    await fs.writeFile(factsFile, factsText, 'utf8');
  }

  const moodFile = path.join(memoryRoot, 'emotional', 'mood-log.md');
  if (await exists(moodFile)) {
    let moodText = await fs.readFile(moodFile, 'utf8');
    moodText = updateLastUpdated(moodText, date);
    const moodRow = `| ${date} | 1 | ${topic} | 保持支持与澄清 |`;
    if (!moodText.includes(moodRow)) {
      moodText = `${moodText.trimEnd()}\n${moodRow}\n`;
    }
    await fs.writeFile(moodFile, moodText, 'utf8');
  }

  const relationshipFile = path.join(memoryRoot, 'emotional', 'relationship.md');
  if (await exists(relationshipFile)) {
    let relationshipText = await fs.readFile(relationshipFile, 'utf8');
    relationshipText = updateLastUpdated(relationshipText, date);
    for (const note of relationshipNotes) {
      const line = `- ${date}: ${note}`;
      if (!relationshipText.includes(line)) {
        relationshipText = `${relationshipText.trimEnd()}\n${line}\n`;
      }
    }
    await fs.writeFile(relationshipFile, relationshipText, 'utf8');
  }

  console.log(`WROTE ${dayFile}`);
}

async function loadContext(options) {
  const workspace = path.resolve(options.workspace || 'savc-core');
  const memoryRoot = path.join(workspace, 'memory');
  const days = Number.parseInt(String(options.days || '3'), 10);
  const maxTokens = Number.parseInt(String(options['max-tokens'] || '2000'), 10);

  const profileFile = path.join(memoryRoot, 'semantic', 'user-profile.md');
  const relationshipFile = path.join(memoryRoot, 'emotional', 'relationship.md');
  const episodicRoot = path.join(memoryRoot, 'episodic');

  const profile = (await exists(profileFile)) ? await fs.readFile(profileFile, 'utf8') : '';
  const relationship = (await exists(relationshipFile)) ? await fs.readFile(relationshipFile, 'utf8') : '';

  const episodicFiles = [];
  if (await exists(episodicRoot)) {
    const monthDirs = await fs.readdir(episodicRoot, { withFileTypes: true });
    for (const dirent of monthDirs) {
      if (!dirent.isDirectory()) continue;
      if (!/^\d{4}-\d{2}$/.test(dirent.name)) continue;
      const monthPath = path.join(episodicRoot, dirent.name);
      const files = await fs.readdir(monthPath);
      for (const file of files) {
        if (/^\d{4}-\d{2}-\d{2}\.md$/.test(file)) {
          episodicFiles.push(path.join(monthPath, file));
        }
      }
    }
  }

  episodicFiles.sort((left, right) => right.localeCompare(left));
  const selectedFiles = episodicFiles.slice(0, Math.max(days, 1));
  const episodicChunks = [];
  for (const file of selectedFiles) {
    const content = await fs.readFile(file, 'utf8');
    episodicChunks.push(`### ${path.basename(file, '.md')}\n\n${content}`);
  }

  let context = [
    '# Phase1 Runtime Memory Context',
    '',
    '## 用户画像摘要',
    '',
    profile,
    '',
    '## 关系状态',
    '',
    relationship,
    '',
    '## 最近情景记忆',
    '',
    episodicChunks.join('\n\n'),
  ].join('\n').trim() + '\n';

  while (estimateTokens(context) > maxTokens && episodicChunks.length > 0) {
    episodicChunks.pop();
    context = [
      '# Phase1 Runtime Memory Context',
      '',
      '## 用户画像摘要',
      '',
      profile,
      '',
      '## 关系状态',
      '',
      relationship,
      '',
      '## 最近情景记忆',
      '',
      episodicChunks.join('\n\n'),
    ].join('\n').trim() + '\n';
  }

  if (options.output) {
    const outputPath = path.resolve(String(options.output));
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, context, 'utf8');
    console.log(`WROTE ${outputPath}`);
  } else {
    process.stdout.write(context);
  }

  console.log(`TOKENS ${estimateTokens(context)}`);
}

async function compressMemory(options) {
  const workspace = path.resolve(options.workspace || 'savc-core');
  const memoryRoot = path.join(workspace, 'memory');
  const date = options.date;
  const threshold = Number.parseInt(String(options.threshold || '1000'), 10);
  if (!date) {
    throw new Error('--date is required for compress');
  }

  const dayFile = path.join(memoryRoot, 'episodic', date.slice(0, 7), `${date}.md`);
  if (!(await exists(dayFile))) {
    throw new Error(`missing episodic day file: ${dayFile}`);
  }

  const text = await fs.readFile(dayFile, 'utf8');
  if (text.length <= threshold) {
    console.log('SKIP below-threshold');
    return;
  }

  const { frontmatter, body } = splitFrontmatter(text);
  const topicMatches = [...body.matchAll(/- \*\*话题\*\*: (.+)$/gm)].map((match) => match[1]);
  const pointMatches = [...body.matchAll(/- \*\*要点\*\*: (.+)$/gm)].map((match) => match[1]);
  const moodMatches = [...body.matchAll(/- \*\*用户情绪\*\*: (.+)$/gm)].map((match) => match[1]);

  const topics = [...new Set(topicMatches)].slice(0, 5);
  const points = pointMatches.slice(0, 8);
  const moods = [...new Set(moodMatches)].slice(0, 5);

  const summaryBody = [
    '## 压缩摘要',
    '',
    `- 生成时间: ${new Date().toISOString()}`,
    `- 对话条目: ${pointMatches.length}`,
    `- 主题: ${topics.length > 0 ? topics.join(', ') : '未提取'}`,
    `- 情绪趋势: ${moods.length > 0 ? moods.join(', ') : '未提取'}`,
    '',
    '### 关键要点',
    ...points.map((item) => `- ${item}`),
    '',
  ].join('\n');

  const compressed = `---\n${frontmatter}\n---\n\n${summaryBody}`;
  await fs.writeFile(dayFile, compressed, 'utf8');
  console.log(`COMPRESSED ${dayFile}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  if (!command) {
    throw new Error('usage: memory_runtime.mjs <write|load|compress> [--flags]');
  }

  if (command === 'write') {
    await writeMemory(args);
    return;
  }
  if (command === 'load') {
    await loadContext(args);
    return;
  }
  if (command === 'compress') {
    await compressMemory(args);
    return;
  }

  throw new Error(`unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
