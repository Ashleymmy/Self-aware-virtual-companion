#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { routeMessage } from './router.mjs';

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
    args[key] = next;
    index += 2;
  }
  return args;
}

function normalizeTaskText(task) {
  return String(task || '')
    .replace(/^并?且/, '')
    .replace(/^然后/, '')
    .replace(/^顺便/, '')
    .replace(/^另外/, '')
    .trim();
}

function splitSequentialTasks(message) {
  const normalized = String(message || '').trim();
  const pattern = /先(.+?)[，,。\s]+然后(.+)/;
  const match = normalized.match(pattern);
  if (!match) return [];
  return [normalizeTaskText(match[1]), normalizeTaskText(match[2])].filter(Boolean);
}

function splitParallelTasks(message) {
  const normalized = String(message || '').trim();
  const splitters = /(顺便|另外|同时|并且|以及)/g;
  if (!splitters.test(normalized)) {
    return [normalized].filter(Boolean);
  }

  return normalized
    .split(splitters)
    .map((part) => normalizeTaskText(part))
    .filter((part) => part && !['顺便', '另外', '同时', '并且', '以及'].includes(part));
}

function shouldForceMemory(task) {
  return /(记住|记得|存储|回忆|记忆)/i.test(task);
}

function hasVisionSignal(task) {
  return /(截图|图片|图像|照片|设计稿|图表|ui|界面|<media:image>|screenshot|image)/i.test(task);
}

function hasTechnicalSignal(task) {
  return /(报错|错误|异常|bug|debug|排障|代码|编译|traceback|stack)/i.test(task);
}

async function detectTaskAgent(task, options = {}) {
  if (shouldForceMemory(task)) {
    return 'memory';
  }
  const route = await routeMessage(task, options);
  return route.agent;
}

function buildTask(id, agent, task, priority, dependsOn = []) {
  return {
    id,
    agent,
    task,
    priority,
    dependsOn,
  };
}

export async function analyze(message, context = {}) {
  const text = String(message || '').trim();
  if (!text) {
    return {
      type: 'simple',
      tasks: [buildTask('task-1', 'orchestrator', '', 1, [])],
      execution: 'parallel',
    };
  }

  if (hasVisionSignal(text) && hasTechnicalSignal(text)) {
    return {
      type: 'compound',
      tasks: [
        buildTask('task-1', 'vision', text, 1, []),
        buildTask('task-2', 'technical', text, 2, ['task-1']),
      ],
      execution: 'sequential',
    };
  }

  const sequentialTasks = splitSequentialTasks(text);
  if (sequentialTasks.length >= 2) {
    const tasks = [];
    for (let index = 0; index < sequentialTasks.length; index += 1) {
      const taskText = sequentialTasks[index];
      const agent = await detectTaskAgent(taskText, context);
      const id = `task-${index + 1}`;
      const dependsOn = index === 0 ? [] : [`task-${index}`];
      tasks.push(buildTask(id, agent, taskText, index + 1, dependsOn));
    }

    return {
      type: 'compound',
      tasks,
      execution: 'sequential',
    };
  }

  const parallelTasks = splitParallelTasks(text);
  if (parallelTasks.length > 1) {
    const tasks = [];
    for (let index = 0; index < parallelTasks.length; index += 1) {
      const taskText = parallelTasks[index];
      const agent = await detectTaskAgent(taskText, context);
      tasks.push(buildTask(`task-${index + 1}`, agent, taskText, index + 1, []));
    }

    const hasMemory = tasks.some((task) => task.agent === 'memory');
    return {
      type: 'compound',
      tasks,
      execution: hasMemory ? 'parallel' : 'mixed',
    };
  }

  const agent = await detectTaskAgent(text, context);
  return {
    type: 'simple',
    tasks: [buildTask('task-1', agent, text, 1, [])],
    execution: 'parallel',
  };
}

async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  if (!command || command !== 'analyze') {
    throw new Error('usage: decomposer.mjs analyze --message "..." [--agents-dir path]');
  }

  const message = args.message || args._[1] || '';
  const result = await analyze(message, {
    agentsDir: args['agents-dir'] || 'savc-core/agents',
  });

  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
