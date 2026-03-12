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

function toMinutes(value) {
  const [hh, mm] = String(value).split(':').map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) {
    throw new Error(`invalid time: ${value}`);
  }
  return hh * 60 + mm;
}

function isQuietHours(nowMinutes, startMinutes, endMinutes) {
  if (startMinutes === endMinutes) return false;
  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

function nowFromOption(value) {
  if (!value) return new Date();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`invalid --now value: ${value}`);
  }
  return parsed;
}

async function loadState(statePath, dateKey) {
  if (!statePath) {
    return {
      date: dateKey,
      dailyCount: 0,
      lastInteraction: null,
      lastIdlePing: null,
    };
  }
  try {
    const raw = await fs.readFile(statePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.date !== dateKey) {
      return {
        date: dateKey,
        dailyCount: 0,
        lastInteraction: parsed.lastInteraction || null,
        lastIdlePing: parsed.lastIdlePing || null,
      };
    }
    return {
      date: parsed.date || dateKey,
      dailyCount: Number.parseInt(String(parsed.dailyCount || 0), 10),
      lastInteraction: parsed.lastInteraction || null,
      lastIdlePing: parsed.lastIdlePing || null,
    };
  } catch (error) {
    return {
      date: dateKey,
      dailyCount: 0,
      lastInteraction: null,
      lastIdlePing: null,
    };
  }
}

async function saveState(statePath, state) {
  if (!statePath) return;
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');
}

function hoursBetween(now, then) {
  if (!then) return null;
  const t = new Date(then);
  if (Number.isNaN(t.getTime())) return null;
  const diffMs = now.getTime() - t.getTime();
  return diffMs / (1000 * 60 * 60);
}

function generateMessage(trigger, now) {
  const day = now.toLocaleDateString('zh-CN', { weekday: 'long' });
  switch (trigger) {
    case 'morning_greeting':
      return `早上好！今天是${day}，要不要先定下一个小目标？`;
    case 'midday_reminder':
      return '中午了，记得吃饭和休息一下，别一直盯屏幕。';
    case 'evening_reflection':
      return '晚上好。要不要回顾一下今天的进展，看看明天最重要的一件事？';
    case 'idle_check':
      return '有一会儿没互动了，我在这儿。如果需要我帮忙，直接说。';
    case 'weekly_review':
      return '周总结时间到啦！要不要一起回顾本周完成了什么、下周优先级是什么？';
    case 'anniversary':
      return '今天是个值得纪念的日子，我记得这件事。要不要一起庆祝一下？';
    default:
      return '我在，想聊什么就说。';
  }
}

async function evaluate(options) {
  const now = nowFromOption(options.now);
  const dateKey = now.toISOString().slice(0, 10);
  const quietStart = options['quiet-start'] || '23:00';
  const quietEnd = options['quiet-end'] || '07:00';
  const maxDaily = Number.parseInt(String(options['max-daily'] || '5'), 10);
  const idleThreshold = Number.parseFloat(String(options['idle-threshold-hours'] || '4'));

  const state = await loadState(options.state, dateKey);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const quiet = isQuietHours(nowMinutes, toMinutes(quietStart), toMinutes(quietEnd));
  const idleHours = hoursBetween(now, state.lastInteraction);
  const idleSincePing = hoursBetween(now, state.lastIdlePing);

  const idleTrigger =
    idleHours !== null &&
    idleHours >= idleThreshold &&
    (idleSincePing === null || idleSincePing >= idleThreshold);

  const allowed = !quiet && state.dailyCount < maxDaily;

  const result = {
    now: now.toISOString(),
    date: dateKey,
    quietHours: quiet,
    maxDaily,
    dailyCount: state.dailyCount,
    allowed,
    idleHours,
    idleTrigger,
  };

  console.log(JSON.stringify(result, null, 2));
}

async function generate(options) {
  const now = nowFromOption(options.now);
  const trigger = options.trigger || 'idle_check';
  const message = generateMessage(trigger, now);
  const result = {
    trigger,
    now: now.toISOString(),
    message,
  };
  console.log(JSON.stringify(result, null, 2));
}

async function record(options) {
  const now = nowFromOption(options.now);
  const dateKey = now.toISOString().slice(0, 10);
  const state = await loadState(options.state, dateKey);
  const event = options.event || 'send';

  if (event === 'send') {
    state.dailyCount += 1;
  }
  if (event === 'interaction') {
    state.lastInteraction = now.toISOString();
  }
  if (event === 'idle_ping') {
    state.lastIdlePing = now.toISOString();
  }

  state.date = dateKey;
  await saveState(options.state, state);
  console.log(JSON.stringify(state, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (!command) {
    throw new Error('usage: proactive_runtime.mjs <evaluate|generate|record> [--flags]');
  }
  if (command === 'evaluate') {
    await evaluate(args);
    return;
  }
  if (command === 'generate') {
    await generate(args);
    return;
  }
  if (command === 'record') {
    await record(args);
    return;
  }
  throw new Error(`unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
