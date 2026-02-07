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

async function discoverTools(options) {
  const workspace = path.resolve(options.workspace || 'savc-core');
  const memoryRoot = path.join(workspace, 'memory', 'tools');
  const date = options.date || todayISO();

  const tools = normalizeList(options.tools);
  if (tools.length === 0 && options['tools-json']) {
    const raw = await fs.readFile(path.resolve(options['tools-json']), 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      tools.push(...parsed);
    } else if (Array.isArray(parsed.tools)) {
      tools.push(...parsed.tools);
    }
  }
  if (tools.length === 0) {
    throw new Error('no tools provided');
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

  for (const tool of tools) {
    const line = `- ${tool}`;
    if (!availableText.includes(line)) {
      availableText = `${availableText.trimEnd()}\n${line}\n`;
    }
    const queueLine = `- [pending] ${tool}: auto-discovered ${date}`;
    if (!learningText.includes(queueLine)) {
      learningText = `${learningText.trimEnd()}\n${queueLine}\n`;
    }
  }

  await fs.writeFile(availableFile, availableText, 'utf8');
  await fs.writeFile(learningFile, learningText, 'utf8');

  console.log(`UPDATED ${availableFile}`);
  console.log(`UPDATED ${learningFile}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (!command) {
    throw new Error('usage: tool_learner_runtime.mjs <discover> [--flags]');
  }
  if (command === 'discover') {
    await discoverTools(args);
    return;
  }
  throw new Error(`unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
