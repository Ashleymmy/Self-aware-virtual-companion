#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

function isSuccess(status) {
  return ['completed', 'success', 'ok'].includes(String(status || '').toLowerCase());
}

function sortByTaskOrder(results, tasks) {
  const order = new Map();
  tasks.forEach((task, index) => {
    order.set(task.id || `${task.agent}:${index}`, index);
  });

  return [...results].sort((left, right) => {
    const leftKey = left.taskId || left.id || `${left.agent}:0`;
    const rightKey = right.taskId || right.id || `${right.agent}:0`;
    const leftOrder = order.has(leftKey) ? order.get(leftKey) : 10_000;
    const rightOrder = order.has(rightKey) ? order.get(rightKey) : 10_000;
    return leftOrder - rightOrder;
  });
}

function buildPartialFailureLine(taskMap, result) {
  const relatedTask = taskMap.get(result.taskId) || null;
  const hint = relatedTask?.task ? `「${relatedTask.task}」` : '部分子任务';
  return `${hint}未完成（${result.error || '执行失败'}）`;
}

export async function aggregate(tasks, results, originalMessage) {
  const taskList = Array.isArray(tasks) ? tasks : [];
  const resultList = Array.isArray(results) ? results : [];

  if (resultList.length === 0) {
    return '我刚才没有拿到有效执行结果，我们可以重试一次。';
  }

  const ordered = sortByTaskOrder(resultList, taskList);
  const successes = ordered.filter((item) => isSuccess(item.status));
  const failures = ordered.filter((item) => !isSuccess(item.status));

  if (ordered.length === 1 && successes.length === 1) {
    return String(successes[0].output || '').trim() || '任务已完成。';
  }

  if (successes.length === 0) {
    return '这次执行都没有成功返回结果，我先给你兜底处理：请再发一次更具体的请求，我会分步执行。';
  }

  const hasDependencies = taskList.some((task) => Array.isArray(task.dependsOn) && task.dependsOn.length > 0);

  if (hasDependencies) {
    const last = successes[successes.length - 1];
    const base = String(last.output || '').trim() || '主流程已完成。';
    if (failures.length === 0) {
      return base;
    }

    const taskMap = new Map(taskList.map((task) => [task.id, task]));
    const failLines = failures.map((failure) => buildPartialFailureLine(taskMap, failure));
    return `${base}\n\n另外还有部分步骤没完成：${failLines.join('；')}`;
  }

  const outputs = successes
    .map((item) => String(item.output || '').trim())
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index);

  const merged = outputs.join('\n\n');
  if (failures.length === 0) {
    return merged || '任务都已完成。';
  }

  const taskMap = new Map(taskList.map((task) => [task.id, task]));
  const failLines = failures.map((failure) => buildPartialFailureLine(taskMap, failure));
  return `${merged}\n\n还有一部分没完成：${failLines.join('；')}`;
}

export async function aggregateDetailed(tasks, results, originalMessage) {
  const reply = await aggregate(tasks, results, originalMessage);
  return {
    reply,
    originalMessage,
    taskCount: Array.isArray(tasks) ? tasks.length : 0,
    resultCount: Array.isArray(results) ? results.length : 0,
  };
}

async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  if (command !== 'aggregate') {
    throw new Error('usage: aggregator.mjs aggregate --tasks-json "[...]" --results-json "[...]"');
  }

  const tasks = JSON.parse(args['tasks-json'] || '[]');
  const results = JSON.parse(args['results-json'] || '[]');
  const originalMessage = args.message || '';

  const reply = await aggregate(tasks, results, originalMessage);
  console.log(JSON.stringify({ reply }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
