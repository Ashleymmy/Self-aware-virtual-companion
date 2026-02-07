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

function parseDayFrontmatter(frontmatterText, fallbackDate) {
  const dateMatch = frontmatterText.match(/^date:\s*"([^"]+)"/m);
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
    date: dateMatch ? dateMatch[1] : fallbackDate,
    conversationCount: countMatch ? Number.parseInt(countMatch[1], 10) : 0,
    mainTopics: topics,
    userMood: moodMatch ? moodMatch[1] : '未知',
  };
}

function renderDayDocument(meta, body) {
  const topics = meta.mainTopics.map((topic) => `"${topic}"`).join(', ');
  const normalizedBody = body.trim().length === 0 ? '## 对话摘要\n' : `${body.trimEnd()}\n`;
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

function looksSensitiveToken(token) {
  if (token.length < 24) return false;
  if (!/[A-Za-z]/.test(token)) return false;
  if (!/\d/.test(token)) return false;
  return true;
}

function redactSensitiveText(value) {
  let text = String(value);

  text = text.replace(
    /\b(password|passwd|token|api[_-]?key|secret|credential)\b\s*[:=]\s*([^\s,;]+)/gi,
    (_match, key) => `${key}: [REDACTED]`,
  );

  text = text.replace(/\b[A-Za-z0-9_-]{24,}\b/g, (token) => {
    if (looksSensitiveToken(token)) {
      return '[REDACTED_TOKEN]';
    }
    return token;
  });

  text = text.replace(/\b(?:\d[ -]?){15,}\b/g, '[REDACTED_ID]');

  return text;
}

function parseISODate(value) {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`invalid date: ${value}`);
  }
  return parsed;
}

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function dateInRange(isoDate, startDate, endDate) {
  const d = parseISODate(isoDate);
  return d.getTime() >= startDate.getTime() && d.getTime() <= endDate.getTime();
}

function extractDateFromPath(filePath) {
  const match = filePath.match(/(\d{4}-\d{2}-\d{2})\.md$/);
  return match ? match[1] : null;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

async function writeMemory(options) {
  const workspace = path.resolve(options.workspace || 'savc-core');
  const memoryRoot = path.join(workspace, 'memory');
  const date = options.date || todayISO();
  const month = date.slice(0, 7);
  const time = options.time || nowHM();
  const topic = redactSensitiveText(options.topic || '未分类');
  const summary = redactSensitiveText(options.summary || '');
  const mood = redactSensitiveText(options.mood || '待观察');
  const facts = asList(options.fact).map((item) => redactSensitiveText(item));
  const preferences = asList(options.preference).map((item) => redactSensitiveText(item));
  const relationshipNotes = asList(options['relationship-note']).map((item) => redactSensitiveText(item));

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
      '---',
      `last_updated: "${date}"`,
      'index_version: "1.0"',
      '---',
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

async function compressWindow(options) {
  const workspace = path.resolve(options.workspace || 'savc-core');
  const memoryRoot = path.join(workspace, 'memory');
  const windowType = String(options.window || '').trim();
  const endDateISO = options.date;

  if (!['week', 'month'].includes(windowType)) {
    throw new Error('--window must be week or month');
  }
  if (!endDateISO) {
    throw new Error('--date is required for compress-window');
  }

  const endDate = parseISODate(endDateISO);
  const spanDays = windowType === 'week' ? 7 : 30;
  const startDate = new Date(endDate.getTime());
  startDate.setUTCDate(startDate.getUTCDate() - (spanDays - 1));

  const episodicRoot = path.join(memoryRoot, 'episodic');
  const allDayFiles = [];

  const monthDirs = (await exists(episodicRoot))
    ? await fs.readdir(episodicRoot, { withFileTypes: true })
    : [];

  for (const dirent of monthDirs) {
    if (!dirent.isDirectory()) continue;
    if (!/^\d{4}-\d{2}$/.test(dirent.name)) continue;
    const monthPath = path.join(episodicRoot, dirent.name);
    const files = await fs.readdir(monthPath);
    for (const file of files) {
      if (!/^\d{4}-\d{2}-\d{2}\.md$/.test(file)) continue;
      const day = file.slice(0, 10);
      if (dateInRange(day, startDate, endDate)) {
        allDayFiles.push(path.join(monthPath, file));
      }
    }
  }

  allDayFiles.sort();

  let totalConversations = 0;
  const topicSet = new Set();
  const moodSet = new Set();
  const keyPoints = [];

  for (const filePath of allDayFiles) {
    const text = await fs.readFile(filePath, 'utf8');
    const { frontmatter, body } = splitFrontmatter(text);
    const parsed = parseDayFrontmatter(frontmatter, extractDateFromPath(filePath) || endDateISO);
    totalConversations += parsed.conversationCount;
    parsed.mainTopics.forEach((topic) => topicSet.add(topic));
    if (parsed.userMood) moodSet.add(parsed.userMood);

    const points = [...body.matchAll(/- \*\*要点\*\*: (.+)$/gm)].map((match) => match[1]);
    for (const point of points) {
      if (keyPoints.length >= 20) break;
      keyPoints.push(point);
    }
  }

  const outputDir = path.join(memoryRoot, 'episodic', windowType === 'week' ? 'weekly' : 'monthly');
  await fs.mkdir(outputDir, { recursive: true });

  const outName = windowType === 'week' ? `${endDateISO}.md` : `${endDateISO.slice(0, 7)}.md`;
  const outPath = path.join(outputDir, outName);

  const summary = [
    '---',
    `window: "${windowType}"`,
    `start_date: "${toISODate(startDate)}"`,
    `end_date: "${endDateISO}"`,
    `file_count: ${allDayFiles.length}`,
    `total_conversations: ${totalConversations}`,
    '---',
    '',
    `# ${windowType === 'week' ? '周' : '月'}度记忆压缩摘要`,
    '',
    `- 覆盖范围: ${toISODate(startDate)} ~ ${endDateISO}`,
    `- 文件数量: ${allDayFiles.length}`,
    `- 对话总量: ${totalConversations}`,
    `- 主要话题: ${topicSet.size > 0 ? Array.from(topicSet).join(', ') : '无'}`,
    `- 情绪趋势: ${moodSet.size > 0 ? Array.from(moodSet).join(', ') : '无'}`,
    '',
    '## 关键要点',
    ...(keyPoints.length > 0 ? keyPoints.slice(0, 10).map((point) => `- ${point}`) : ['- 暂无可提取要点']),
    '',
  ].join('\n');

  await fs.writeFile(outPath, summary, 'utf8');

  const indexFile = path.join(memoryRoot, 'episodic', 'index.md');
  await ensureFile(
    indexFile,
    [
      '---',
      `last_updated: "${endDateISO}"`,
      'index_version: "1.0"',
      '---',
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
  indexText = updateLastUpdated(indexText, endDateISO);
  if (!indexText.includes('## 窗口摘要索引')) {
    indexText = `${indexText.trimEnd()}\n\n## 窗口摘要索引\n`;
  }
  const marker = `- [${windowType}] ${windowType === 'week' ? endDateISO : endDateISO.slice(0, 7)} => ${path.relative(memoryRoot, outPath)}`;
  if (!indexText.includes(marker)) {
    indexText = `${indexText.trimEnd()}\n${marker}\n`;
  }
  await fs.writeFile(indexFile, indexText, 'utf8');

  console.log(`WROTE ${outPath}`);
}

async function searchMemory(options) {
  const workspace = path.resolve(options.workspace || 'savc-core');
  const memoryRoot = path.join(workspace, 'memory');
  const query = String(options.query || '').trim();
  const limit = Number.parseInt(String(options.limit || '10'), 10);
  const outputJson = String(options.json || '').toLowerCase() === 'true' || options.json === true;

  if (!query) {
    throw new Error('--query is required for search');
  }

  const roots = [
    { type: 'episodic', dir: path.join(memoryRoot, 'episodic') },
    { type: 'semantic', dir: path.join(memoryRoot, 'semantic') },
    { type: 'emotional', dir: path.join(memoryRoot, 'emotional') },
  ];

  const queryLower = query.toLowerCase();
  const exactWord = new RegExp(`\\b${escapeRegex(query)}\\b`, 'i');
  const matches = [];
  let total = 0;

  for (const root of roots) {
    const files = await walkMarkdownFiles(root.dir);
    files.sort();
    for (const filePath of files) {
      const text = await fs.readFile(filePath, 'utf8');
      const { frontmatter } = splitFrontmatter(text);
      const parsed = parseDayFrontmatter(frontmatter, extractDateFromPath(filePath) || '');
      const date = parsed.date || extractDateFromPath(filePath) || null;

      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        if (!line.toLowerCase().includes(queryLower)) continue;
        total += 1;
        if (matches.length >= limit) continue;
        const cleaned = line.trim().replace(/\s+/g, ' ');
        const confidence = exactWord.test(line) ? 'high' : 'medium';
        matches.push({
          type: root.type,
          file: path.relative(workspace, filePath),
          date,
          excerpt: cleaned.slice(0, 200),
          confidence,
        });
      }
    }
  }

  const result = { query, total, matches };

  if (outputJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`# Search: ${query}`);
  console.log(`total: ${total}`);
  for (const item of matches) {
    console.log(`- [${item.type}] ${item.file}${item.date ? ` (${item.date})` : ''}`);
    console.log(`  ${item.excerpt}`);
    console.log(`  confidence=${item.confidence}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  if (!command) {
    throw new Error('usage: memory_runtime.mjs <write|load|compress|search|compress-window> [--flags]');
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
  if (command === 'search') {
    await searchMemory(args);
    return;
  }
  if (command === 'compress-window') {
    await compressWindow(args);
    return;
  }

  throw new Error(`unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
