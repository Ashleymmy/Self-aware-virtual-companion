#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

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

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function sanitizeToolName(name) {
  return name.trim().replace(/[\/\s:]+/g, '_');
}

function ensureUnique(list) {
  return Array.from(new Set(list.filter(Boolean).map((item) => String(item).trim()).filter(Boolean)));
}

function boolFlag(value) {
  if (value === true) return true;
  const text = String(value || '').toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(text);
}

async function runOpenClaw(repoRoot, args) {
  const scriptPath = path.join(repoRoot, 'scripts', 'openclaw.sh');
  return new Promise((resolve) => {
    const child = spawn('bash', [scriptPath, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('exit', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function scaffoldTool(toolRoot, toolName, date) {
  const dirName = sanitizeToolName(toolName);
  const toolDir = path.join(toolRoot, dirName);
  await fs.mkdir(toolDir, { recursive: true });

  const schemaFile = path.join(toolDir, 'schema.md');
  const examplesFile = path.join(toolDir, 'examples.md');
  const masteryFile = path.join(toolDir, 'mastery-level.md');

  await ensureFile(
    schemaFile,
    [
      '---',
      `tool: "${toolName}"`,
      `last_updated: "${date}"`,
      '---',
      '',
      `# ${toolName}`,
      '',
      '## Schema',
      '- [待补充] 粘贴工具 schema 或 OpenAPI 摘要。',
      '',
      '## Metadata',
      '- source: [待补充]',
      '- eligible: [待补充]',
      '',
      '## Notes',
      '- [待补充]',
      '',
    ].join('\n'),
  );

  await ensureFile(
    examplesFile,
    [
      '---',
      `tool: "${toolName}"`,
      `last_updated: "${date}"`,
      '---',
      '',
      `# ${toolName} Examples`,
      '',
      '## Experiment Log',
      '- [待补充] 描述调用参数与预期结果。',
      '',
    ].join('\n'),
  );

  await ensureFile(
    masteryFile,
    [
      '---',
      `tool: "${toolName}"`,
      `last_updated: "${date}"`,
      '---',
      '',
      '# Mastery Level',
      '',
      '- level: 1/5 (newbie)',
      '- success_rate: 0.00',
      '- total_experiments: 0',
      '- related_tools: []',
      '',
      '## Progress',
      '- [待补充]',
      '',
    ].join('\n'),
  );

  return toolDir;
}

async function listOpenClawSkills(repoRoot, eligibleOnly) {
  const args = ['skills', 'list', '--json'];
  if (eligibleOnly) args.push('--eligible');
  const result = await runOpenClaw(repoRoot, args);
  if (result.code !== 0) {
    throw new Error(`openclaw skills list failed: ${result.stderr || result.stdout}`);
  }
  const parsed = JSON.parse(result.stdout);
  const skills = Array.isArray(parsed.skills) ? parsed.skills : [];
  return skills.map((skill) => ({
    name: skill.name,
    source: skill.source || 'unknown',
    eligible: Boolean(skill.eligible),
    description: skill.description || '',
  }));
}

async function getSkillInfo(repoRoot, toolName) {
  const result = await runOpenClaw(repoRoot, ['skills', 'info', toolName, '--json']);
  if (result.code !== 0) {
    throw new Error(`openclaw skills info failed for ${toolName}: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

async function discoverTools(options) {
  const repoRoot = path.resolve(options.repo || '.');
  const workspace = path.resolve(options.workspace || 'savc-core');
  const memoryRoot = path.join(workspace, 'memory', 'tools');
  const date = options.date || todayISO();
  const scaffold = options.scaffold === undefined ? true : options.scaffold !== 'false';

  const tools = [];
  const source = options.source || 'manual';
  const eligibleOnly = boolFlag(options['eligible-only']);

  if (source === 'openclaw-skills') {
    const skills = await listOpenClawSkills(repoRoot, eligibleOnly);
    for (const skill of skills) {
      tools.push({
        name: skill.name,
        source: skill.source,
        eligible: skill.eligible,
      });
    }
  }

  const manual = normalizeList(options.tools);
  for (const tool of manual) {
    tools.push({ name: tool, source: 'manual', eligible: true });
  }

  if (manual.length === 0 && options['tools-json']) {
    const raw = await fs.readFile(path.resolve(options['tools-json']), 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      parsed.forEach((tool) => tools.push({ name: tool, source: 'json', eligible: true }));
    } else if (Array.isArray(parsed.tools)) {
      parsed.tools.forEach((tool) => tools.push({ name: tool, source: 'json', eligible: true }));
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const tool of tools) {
    const key = String(tool.name || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(tool);
  }

  if (deduped.length === 0) {
    throw new Error('no tools discovered');
  }

  const availableFile = path.join(memoryRoot, 'available.md');
  const learningFile = path.join(memoryRoot, 'learning-queue.md');

  await ensureFile(
    availableFile,
    [
      '---',
      `last_updated: "${date}"`,
      '---',
      '',
      '## 可用工具清单',
      '',
      '- [待扫描] 后续由 tool-learner 自动发现并更新。',
      '',
    ].join('\n'),
  );

  await ensureFile(
    learningFile,
    [
      '---',
      `last_updated: "${date}"`,
      '---',
      '',
      '## 工具学习队列',
      '',
      '- [待加入] 按优先级记录待学习工具与原因。',
      '',
    ].join('\n'),
  );

  let availableText = await fs.readFile(availableFile, 'utf8');
  let learningText = await fs.readFile(learningFile, 'utf8');

  availableText = updateLastUpdated(availableText, date);
  learningText = updateLastUpdated(learningText, date);

  for (const tool of deduped) {
    const line = `- ${tool.name} (source=${tool.source}, eligible=${tool.eligible ? 'yes' : 'no'})`;
    if (!availableText.includes(line)) {
      availableText = `${availableText.trimEnd()}\n${line}\n`;
    }

    const queueLine = `- [pending] ${tool.name}: auto-discovered ${date} (source=${tool.source})`;
    if (!learningText.includes(queueLine)) {
      learningText = `${learningText.trimEnd()}\n${queueLine}\n`;
    }

    if (scaffold) {
      await scaffoldTool(memoryRoot, tool.name, date);
    }
  }

  await fs.writeFile(availableFile, availableText, 'utf8');
  await fs.writeFile(learningFile, learningText, 'utf8');

  console.log(JSON.stringify({
    action: 'discover',
    date,
    count: deduped.length,
    tools: deduped.map((item) => item.name),
    availableFile,
    learningFile,
  }, null, 2));
}

async function learnTool(options) {
  const repoRoot = path.resolve(options.repo || '.');
  const workspace = path.resolve(options.workspace || 'savc-core');
  const date = options.date || todayISO();
  const toolName = String(options.tool || '').trim();
  if (!toolName) {
    throw new Error('--tool is required for learn');
  }

  const memoryRoot = path.join(workspace, 'memory', 'tools');
  const toolDir = await scaffoldTool(memoryRoot, toolName, date);
  const schemaFile = path.join(toolDir, 'schema.md');

  const info = await getSkillInfo(repoRoot, toolName);
  let skillMdSnippet = '';
  if (info.filePath && await exists(info.filePath)) {
    const raw = await fs.readFile(info.filePath, 'utf8');
    skillMdSnippet = raw.split('\n').slice(0, 120).join('\n');
  }

  const requirements = info.requirements || {};

  const body = [
    '---',
    `tool: "${toolName}"`,
    `last_updated: "${date}"`,
    '---',
    '',
    `# ${toolName}`,
    '',
    '## Metadata',
    `- source: ${info.source || 'unknown'}`,
    `- bundled: ${info.bundled ? 'yes' : 'no'}`,
    `- eligible: ${info.eligible ? 'yes' : 'no'}`,
    `- homepage: ${info.homepage || 'N/A'}`,
    `- file_path: ${info.filePath || 'N/A'}`,
    '',
    '## Requirements',
    `- bins: ${ensureUnique(requirements.bins || []).join(', ') || 'none'}`,
    `- env: ${ensureUnique(requirements.env || []).join(', ') || 'none'}`,
    `- config: ${ensureUnique(requirements.config || []).join(', ') || 'none'}`,
    '',
    '## Schema',
    '- 通过 openclaw skills info 获取结构化元信息。',
    '',
    '## SKILL.md Snippet',
    '```markdown',
    skillMdSnippet || '[missing]',
    '```',
    '',
  ].join('\n');

  await fs.writeFile(schemaFile, body, 'utf8');

  console.log(JSON.stringify({
    action: 'learn',
    tool: toolName,
    schemaFile,
    eligible: Boolean(info.eligible),
  }, null, 2));
}

function countExperimentStats(text) {
  const successCount = (text.match(/status:\s*success/g) || []).length;
  const failCount = (text.match(/status:\s*failed/g) || []).length;
  const total = successCount + failCount;
  const successRate = total > 0 ? successCount / total : 0;
  return { total, successCount, failCount, successRate };
}

async function experimentTool(options) {
  const repoRoot = path.resolve(options.repo || '.');
  const workspace = path.resolve(options.workspace || 'savc-core');
  const date = options.date || todayISO();
  const toolName = String(options.tool || '').trim();
  const scenario = options.scenario || 'info-smoke';

  if (!toolName) {
    throw new Error('--tool is required for experiment');
  }

  const memoryRoot = path.join(workspace, 'memory', 'tools');
  const toolDir = await scaffoldTool(memoryRoot, toolName, date);
  const examplesFile = path.join(toolDir, 'examples.md');

  const command = options.command
    ? String(options.command)
    : `skills info ${toolName} --json`;

  const commandArgs = command.split(/\s+/).filter(Boolean);
  const result = await runOpenClaw(repoRoot, commandArgs);
  const status = result.code === 0 ? 'success' : 'failed';

  let text = await fs.readFile(examplesFile, 'utf8');
  text = updateLastUpdated(text, date);

  const logBlock = [
    '',
    `### ${new Date().toISOString()}`,
    `- scenario: ${scenario}`,
    `- command: openclaw ${command}`,
    `- status: ${status}`,
    '- stdout:',
    '```text',
    result.stdout.trim().slice(0, 1200) || '[empty]',
    '```',
    '- stderr:',
    '```text',
    result.stderr.trim().slice(0, 1200) || '[empty]',
    '```',
    '',
  ].join('\n');

  text = `${text.trimEnd()}\n${logBlock}`;
  await fs.writeFile(examplesFile, text, 'utf8');

  console.log(JSON.stringify({
    action: 'experiment',
    tool: toolName,
    scenario,
    status,
    examplesFile,
  }, null, 2));

  if (result.code !== 0) {
    process.exit(1);
  }
}

async function solidifyTool(options) {
  const workspace = path.resolve(options.workspace || 'savc-core');
  const date = options.date || todayISO();
  const toolName = String(options.tool || '').trim();

  if (!toolName) {
    throw new Error('--tool is required for solidify');
  }

  const memoryRoot = path.join(workspace, 'memory', 'tools');
  const toolDir = await scaffoldTool(memoryRoot, toolName, date);
  const examplesFile = path.join(toolDir, 'examples.md');
  const masteryFile = path.join(toolDir, 'mastery-level.md');
  const proceduralFile = path.join(workspace, 'memory', 'procedural', 'tool-usage.md');

  const examplesText = await fs.readFile(examplesFile, 'utf8');
  const stats = countExperimentStats(examplesText);

  let level = '1/5 (newbie)';
  if (stats.total >= 3 && stats.successRate >= 0.8) level = '3/5 (intermediate)';
  else if (stats.total >= 1 && stats.successRate > 0) level = '2/5 (beginner)';
  if (stats.total >= 8 && stats.successRate >= 0.95) level = '4/5 (advanced)';
  if (stats.total >= 12 && stats.successRate >= 0.98) level = '5/5 (expert)';

  const masteryBody = [
    '---',
    `tool: "${toolName}"`,
    `last_updated: "${date}"`,
    '---',
    '',
    '# Mastery Level',
    '',
    `- level: ${level}`,
    `- success_rate: ${stats.successRate.toFixed(2)}`,
    `- total_experiments: ${stats.total}`,
    '- related_tools: []',
    '',
    '## Progress',
    `- latest_update: ${date}`,
    `- success_count: ${stats.successCount}`,
    `- fail_count: ${stats.failCount}`,
    '',
  ].join('\n');

  await fs.writeFile(masteryFile, masteryBody, 'utf8');

  await ensureFile(
    proceduralFile,
    [
      '---',
      `last_updated: "${date}"`,
      '---',
      '',
      '## 工具使用经验',
      '',
      '### 记录模板',
      '- **工具名**:',
      '- **场景**:',
      '- **成功操作**:',
      '- **常见错误**:',
      '- **建议重试策略**:',
      '',
    ].join('\n'),
  );

  let proceduralText = await fs.readFile(proceduralFile, 'utf8');
  proceduralText = updateLastUpdated(proceduralText, date);

  const sectionHeader = `### ${toolName}`;
  if (!proceduralText.includes(sectionHeader)) {
    proceduralText = `${proceduralText.trimEnd()}\n\n${sectionHeader}\n- **工具名**: ${toolName}\n- **场景**: 自动化学习固化\n- **成功操作**: experiments=${stats.total}, success_rate=${stats.successRate.toFixed(2)}\n- **常见错误**: 依赖缺失或权限不足时会失败\n- **建议重试策略**: 先运行 \`openclaw skills check --json\` 确认依赖\n`;
  }

  await fs.writeFile(proceduralFile, proceduralText, 'utf8');

  console.log(JSON.stringify({
    action: 'solidify',
    tool: toolName,
    level,
    masteryFile,
    proceduralFile,
  }, null, 2));
}

function sharedTokenScore(source, target) {
  const tokenize = (name) => new Set(
    String(name)
      .toLowerCase()
      .split(/[._\-/:]+/)
      .map((item) => item.trim())
      .filter(Boolean),
  );

  const left = tokenize(source);
  const right = tokenize(target);
  let score = 0;
  for (const token of left) {
    if (right.has(token)) score += 1;
  }
  return score;
}

async function generalizeTool(options) {
  const workspace = path.resolve(options.workspace || 'savc-core');
  const date = options.date || todayISO();
  const toolName = String(options.tool || '').trim();

  if (!toolName) {
    throw new Error('--tool is required for generalize');
  }

  const availableFile = path.join(workspace, 'memory', 'tools', 'available.md');
  const toolDir = path.join(workspace, 'memory', 'tools', sanitizeToolName(toolName));
  const masteryFile = path.join(toolDir, 'mastery-level.md');

  if (!(await exists(availableFile))) {
    throw new Error(`missing available tools file: ${availableFile}`);
  }
  await ensureFile(
    masteryFile,
    [
      '---',
      `tool: "${toolName}"`,
      `last_updated: "${date}"`,
      '---',
      '',
      '# Mastery Level',
      '',
      '- level: 1/5 (newbie)',
      '- success_rate: 0.00',
      '- total_experiments: 0',
      '- related_tools: []',
      '',
      '## Progress',
      '- [待补充]',
      '',
    ].join('\n'),
  );

  const availableText = await fs.readFile(availableFile, 'utf8');
  const names = [];
  for (const line of availableText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('- ')) continue;
    const raw = trimmed.slice(2);
    const name = raw.split(' (')[0].trim();
    if (name) names.push(name);
  }

  const related = names
    .filter((name) => name !== toolName)
    .map((name) => ({ name, score: sharedTokenScore(toolName, name) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 5)
    .map((item) => item.name);

  let masteryText = await fs.readFile(masteryFile, 'utf8');
  masteryText = updateLastUpdated(masteryText, date);

  const relatedLine = `- related_tools: [${related.map((name) => `"${name}"`).join(', ')}]`;
  masteryText = masteryText.replace(/^- related_tools:\s*\[[^\]]*\]/m, relatedLine);

  if (!masteryText.includes('## Related')) {
    masteryText = `${masteryText.trimEnd()}\n\n## Related\n`;
  }

  const section = [
    `### ${date}`,
    ...(related.length > 0 ? related.map((name) => `- ${name}`) : ['- 无明显相似工具']),
    '',
  ].join('\n');

  masteryText = `${masteryText.trimEnd()}\n${section}`;
  await fs.writeFile(masteryFile, masteryText, 'utf8');

  console.log(JSON.stringify({
    action: 'generalize',
    tool: toolName,
    related,
    masteryFile,
  }, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  if (!command) {
    throw new Error('usage: tool_learner_runtime.mjs <discover|learn|experiment|solidify|generalize> [--flags]');
  }

  if (command === 'discover') {
    await discoverTools(args);
    return;
  }
  if (command === 'learn') {
    await learnTool(args);
    return;
  }
  if (command === 'experiment') {
    await experimentTool(args);
    return;
  }
  if (command === 'solidify') {
    await solidifyTool(args);
    return;
  }
  if (command === 'generalize') {
    await generalizeTool(args);
    return;
  }

  throw new Error(`unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
