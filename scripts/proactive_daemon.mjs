#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import cron from 'node-cron';
import chokidar from 'chokidar';
import yaml from 'js-yaml';
import { google } from 'googleapis';
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

function boolFlag(value) {
  if (value === true) return true;
  const text = String(value || '').toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(text);
}

function nowFromOption(value) {
  if (!value) return new Date();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`invalid --now value: ${value}`);
  }
  return parsed;
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

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadYaml(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = yaml.load(raw);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`invalid yaml config: ${filePath}`);
  }
  return parsed;
}

async function loadJson(filePath) {
  if (!(await exists(filePath))) return null;
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function saveJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function defaultState(dateKey) {
  return {
    date: dateKey,
    dailyCount: 0,
    lastInteraction: null,
    lastIdlePing: null,
    lastWeather: null,
    lastCalendarEventHash: null,
    lastFileChangeAt: null,
    lastEmotionPingAt: null,
    lastFollowupTopic: null,
    lastSentAt: null,
  };
}

async function loadState(statePath, dateKey) {
  const parsed = await loadJson(statePath);
  if (!parsed) return defaultState(dateKey);
  if (parsed.date !== dateKey) {
    return {
      ...defaultState(dateKey),
      lastInteraction: parsed.lastInteraction || null,
      lastWeather: parsed.lastWeather || null,
      lastFollowupTopic: parsed.lastFollowupTopic || null,
    };
  }
  return {
    ...defaultState(dateKey),
    ...parsed,
    date: dateKey,
  };
}

function hoursBetween(now, isoTime) {
  if (!isoTime) return null;
  const then = new Date(isoTime);
  if (Number.isNaN(then.getTime())) return null;
  return (now.getTime() - then.getTime()) / (1000 * 60 * 60);
}

function parseMoodLog(text) {
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
    rows.push({ date: parts[0], score, raw: parts });
  }
  return rows;
}

async function analyzeMood(workspace, now) {
  const moodFile = path.join(workspace, 'memory', 'emotional', 'mood-log.md');
  if (!(await exists(moodFile))) {
    return { lowMood: false, avg3: null, latest: null };
  }
  const text = await fs.readFile(moodFile, 'utf8');
  const rows = parseMoodLog(text);
  if (rows.length === 0) {
    return { lowMood: false, avg3: null, latest: null };
  }
  const recent = rows.slice(-3);
  const avg3 = recent.reduce((sum, row) => sum + row.score, 0) / recent.length;
  const latest = recent[recent.length - 1];
  const lowMood = avg3 <= 2.0 || (latest && latest.score <= 2.0);

  return {
    lowMood,
    avg3,
    latest,
    ageHours: hoursBetween(now, `${latest.date}T00:00:00Z`),
  };
}

function summarizeTopicFromText(text) {
  const cleaned = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  if (cleaned.length <= 48) return cleaned;
  return `${cleaned.slice(0, 48)}...`;
}

async function readLatestTopic(workspace) {
  try {
    const semantic = await semanticSearch('最近用户关心的话题', {
      workspace,
      limit: 3,
    });
    if ((semantic.matches || []).length > 0) {
      const top = semantic.matches[0];
      const topic = summarizeTopicFromText(top.text);
      if (topic) {
        return {
          date: top.updatedAt ? new Date(top.updatedAt).toISOString().slice(0, 10) : null,
          topic,
          source: 'semantic',
          score: top.score || null,
        };
      }
    }
  } catch {
    // fallback to index-based extraction
  }

  const indexFile = path.join(workspace, 'memory', 'episodic', 'index.md');
  if (!(await exists(indexFile))) return null;

  const text = await fs.readFile(indexFile, 'utf8');
  const lines = text.split('\n');
  const rows = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    if (trimmed.includes('---')) continue;
    const parts = trimmed.split('|').map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    if (parts[0] === '日期') continue;
    rows.push({ date: parts[0], topic: parts[1] || '' });
  }
  if (rows.length === 0) return null;
  return {
    ...rows[rows.length - 1],
    source: 'index',
    score: null,
  };
}

async function fetchWeather(providerConfig) {
  const apiKey = process.env[providerConfig.api_key_env || 'OPENWEATHER_API_KEY'];
  const lat = process.env[providerConfig.lat_env || 'OPENWEATHER_LAT'];
  const lon = process.env[providerConfig.lon_env || 'OPENWEATHER_LON'];
  const units = providerConfig.units || 'metric';

  if (!apiKey || !lat || !lon) {
    return { ok: false, reason: 'missing_env' };
  }

  const url = new URL('https://api.openweathermap.org/data/2.5/weather');
  url.searchParams.set('lat', lat);
  url.searchParams.set('lon', lon);
  url.searchParams.set('appid', apiKey);
  url.searchParams.set('units', units);

  const res = await fetch(url);
  if (!res.ok) {
    return { ok: false, reason: `http_${res.status}` };
  }

  const data = await res.json();
  return {
    ok: true,
    condition: data?.weather?.[0]?.main || 'Unknown',
    description: data?.weather?.[0]?.description || '',
    temp: Number.isFinite(data?.main?.temp) ? data.main.temp : null,
    humidity: Number.isFinite(data?.main?.humidity) ? data.main.humidity : null,
    raw: data,
  };
}

function isWeatherSignificant(current, previous) {
  if (!current?.ok) return false;
  if (!previous) return true;
  if (current.condition !== previous.condition) return true;
  if (Number.isFinite(current.temp) && Number.isFinite(previous.temp)) {
    return Math.abs(current.temp - previous.temp) >= 4;
  }
  return false;
}

async function fetchCalendar(providerConfig, now) {
  const calendarId = process.env[providerConfig.calendar_id_env || 'GOOGLE_CALENDAR_ID'];
  const keyFile = process.env[providerConfig.service_account_json_env || 'GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON'];
  const lookahead = Number.parseInt(String(providerConfig.lookahead_minutes || 120), 10);

  if (!calendarId || !keyFile) {
    return { ok: false, reason: 'missing_env' };
  }

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  });
  const client = await auth.getClient();
  const calendar = google.calendar({ version: 'v3', auth: client });

  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + lookahead * 60 * 1000).toISOString();

  const result = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 10,
  });

  const items = (result.data.items || []).map((item) => ({
    id: item.id,
    summary: item.summary || 'Untitled Event',
    start: item.start?.dateTime || item.start?.date || null,
  }));

  return {
    ok: true,
    events: items,
    hash: items.map((item) => `${item.id}:${item.start}`).join('|'),
  };
}

function generateMessage(trigger, context) {
  switch (trigger) {
    case 'morning_greeting':
      return `早上好！${context.weatherLine || '新的一天开始啦。'} 今天想先推进哪一件最重要的事？`;
    case 'midday_reminder':
      return '中午到啦，记得休息一下、喝点水，下午继续冲。';
    case 'evening_reflection':
      return '晚间回顾时间：今天最有进展的一件事是什么？';
    case 'weekly_review':
      return '周回顾时间到。要不要一起梳理本周完成项和下周优先级？';
    case 'idle_check':
      return '有一会儿没互动了，我在。需要我继续跟进当前任务吗？';
    case 'weather_change':
      return `天气有变化：${context.weatherLine || '请注意天气变化'}。出门前可以确认一下安排。`;
    case 'calendar_event':
      return `你接下来有日程：${context.calendarLine || '请查看近期会议安排'}。要不要我帮你快速准备要点？`;
    case 'emotion_support':
      return '我注意到最近互动里情绪压力有点高。要不要先把最紧急的问题拆成两步？';
    case 'file_change':
      return '检测到工作目录有新变更。要不要我帮你整理一下下一步提交计划？';
    case 'topic_followup':
      return `你之前提到过「${context.topic || '当前话题'}」。要不要我继续跟进这个进展？`;
    default:
      return '我在。你希望我现在优先帮你做什么？';
  }
}

async function runDispatcher(params) {
  const args = [
    path.join(params.repoRoot, 'scripts', 'proactive_dispatcher.mjs'),
    'send',
    '--repo',
    params.repoRoot,
    '--workspace',
    params.workspace,
    '--channels',
    params.channelsPath,
    '--channel',
    params.channel,
    '--message',
    params.message,
    '--session-id',
    params.sessionId,
  ];

  if (params.target) {
    args.push('--target', params.target);
  }
  if (params.dryRun) {
    args.push('--dry-run', 'true');
  }

  return new Promise((resolve) => {
    const child = spawn('node', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('exit', (code) => {
      let parsed = null;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        parsed = null;
      }
      resolve({
        code: code ?? 1,
        stdout,
        stderr,
        payload: parsed,
      });
    });
  });
}

function pickDefaultChannel(config, override) {
  if (override) return override;
  return config?.routing?.default_channel || 'discord';
}

async function executeTick(options) {
  const repoRoot = path.resolve(options.repo || '.');
  const workspace = path.resolve(options.workspace || path.join(repoRoot, 'savc-core'));
  const configPath = path.resolve(options.config || path.join(repoRoot, 'config', 'proactive.yaml'));
  const channelsPath = path.resolve(options.channels || path.join(repoRoot, 'config', 'channels.yaml'));
  const statePath = path.resolve(options.state || path.join(workspace, 'memory', 'procedural', 'proactive-state.json'));

  const config = await loadYaml(configPath);
  const triggerInput = options.trigger || 'auto';
  const now = nowFromOption(options.now);
  const dateKey = now.toISOString().slice(0, 10);
  const state = await loadState(statePath, dateKey);

  const limits = config.limits || {};
  const quietStart = limits.quiet_hours_start || '23:00';
  const quietEnd = limits.quiet_hours_end || '07:00';
  const maxDaily = Number.parseInt(String(limits.max_daily_messages || 5), 10);
  const idleThreshold = Number.parseFloat(String(limits.idle_threshold_hours || 4));

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const quiet = isQuietHours(nowMinutes, toMinutes(quietStart), toMinutes(quietEnd));

  let chosenTrigger = triggerInput;
  let weatherData = null;
  let calendarData = null;
  let moodData = null;
  let topicData = null;
  let shouldSend = false;
  let reason = 'not-triggered';

  const idleHours = hoursBetween(now, state.lastInteraction);
  const idleSincePing = hoursBetween(now, state.lastIdlePing);
  const idleReady = idleHours !== null
    && idleHours >= idleThreshold
    && (idleSincePing === null || idleSincePing >= idleThreshold);

  async function evaluateNamedTrigger(name) {
    if (name === 'idle_check') {
      return { ok: idleReady, reason: idleReady ? 'idle-threshold-hit' : 'idle-threshold-not-met' };
    }
    if (name === 'weather_change') {
      weatherData = await fetchWeather(config.providers?.weather || {});
      if (!weatherData.ok) return { ok: false, reason: `weather-${weatherData.reason}` };
      const significant = isWeatherSignificant(weatherData, state.lastWeather);
      return { ok: significant, reason: significant ? 'weather-significant' : 'weather-not-significant' };
    }
    if (name === 'calendar_event') {
      calendarData = await fetchCalendar(config.providers?.calendar || {}, now);
      if (!calendarData.ok) return { ok: false, reason: `calendar-${calendarData.reason}` };
      if ((calendarData.events || []).length === 0) return { ok: false, reason: 'calendar-no-upcoming-events' };
      if (calendarData.hash === state.lastCalendarEventHash) return { ok: false, reason: 'calendar-duplicate-window' };
      return { ok: true, reason: 'calendar-upcoming-event' };
    }
    if (name === 'emotion_support') {
      moodData = await analyzeMood(workspace, now);
      return { ok: moodData.lowMood, reason: moodData.lowMood ? 'mood-low' : 'mood-normal' };
    }
    if (name === 'topic_followup') {
      topicData = await readLatestTopic(workspace);
      if (!topicData?.topic) return { ok: false, reason: 'topic-missing' };
      if (topicData.topic === state.lastFollowupTopic) return { ok: false, reason: 'topic-already-followed' };
      return { ok: true, reason: 'topic-followup' };
    }
    if (name === 'file_change') {
      return { ok: true, reason: 'file-change' };
    }
    if (['morning_greeting', 'midday_reminder', 'evening_reflection', 'weekly_review'].includes(name)) {
      return { ok: true, reason: 'scheduled-trigger' };
    }
    return { ok: false, reason: `unknown-trigger-${name}` };
  }

  if (triggerInput === 'auto') {
    const candidates = ['idle_check', 'weather_change', 'calendar_event', 'emotion_support', 'topic_followup'];
    for (const candidate of candidates) {
      const check = await evaluateNamedTrigger(candidate);
      if (check.ok) {
        chosenTrigger = candidate;
        shouldSend = true;
        reason = check.reason;
        break;
      }
      reason = check.reason;
    }
  } else {
    const check = await evaluateNamedTrigger(triggerInput);
    shouldSend = check.ok;
    reason = check.reason;
  }

  if (quiet) {
    shouldSend = false;
    reason = 'quiet-hours';
  }

  if (state.dailyCount >= maxDaily) {
    shouldSend = false;
    reason = 'daily-limit';
  }

  const context = {
    weatherLine: weatherData?.ok
      ? `${weatherData.condition} ${weatherData.temp ?? '?'}°C`
      : null,
    calendarLine: calendarData?.events?.[0]
      ? `${calendarData.events[0].summary} @ ${calendarData.events[0].start}`
      : null,
    topic: topicData?.topic || null,
  };

  let dispatch = null;
  let message = null;

  if (shouldSend) {
    message = generateMessage(chosenTrigger, context);
    const channel = pickDefaultChannel(config, options.channel);
    const dryRun = boolFlag(options['dry-run']);
    dispatch = await runDispatcher({
      repoRoot,
      workspace,
      channelsPath,
      channel,
      target: options.target || null,
      sessionId: options['session-id'] || `phase2-${chosenTrigger}-${Date.now()}`,
      message,
      dryRun,
    });

    if (dispatch.code === 0) {
      state.dailyCount += 1;
      state.lastSentAt = now.toISOString();
      if (chosenTrigger === 'idle_check') {
        state.lastIdlePing = now.toISOString();
      }
      if (chosenTrigger === 'weather_change' && weatherData?.ok) {
        state.lastWeather = {
          condition: weatherData.condition,
          temp: weatherData.temp,
        };
      }
      if (chosenTrigger === 'calendar_event' && calendarData?.ok) {
        state.lastCalendarEventHash = calendarData.hash;
      }
      if (chosenTrigger === 'emotion_support') {
        state.lastEmotionPingAt = now.toISOString();
      }
      if (chosenTrigger === 'file_change') {
        state.lastFileChangeAt = now.toISOString();
      }
      if (chosenTrigger === 'topic_followup' && topicData?.topic) {
        state.lastFollowupTopic = topicData.topic;
      }
    }
  }

  await saveJson(statePath, state);

  const result = {
    now: now.toISOString(),
    trigger: chosenTrigger,
    requestedTrigger: triggerInput,
    shouldSend,
    reason,
    quietHours: quiet,
    dailyCount: state.dailyCount,
    maxDaily,
    idleHours,
    weather: weatherData,
    calendar: calendarData,
    mood: moodData,
    topic: topicData,
    message,
    dispatch,
    statePath,
  };

  console.log(JSON.stringify(result, null, 2));

  if (dispatch && dispatch.code !== 0) {
    process.exit(1);
  }
}

async function runDaemon(options) {
  const repoRoot = path.resolve(options.repo || '.');
  const workspace = path.resolve(options.workspace || path.join(repoRoot, 'savc-core'));
  const configPath = path.resolve(options.config || path.join(repoRoot, 'config', 'proactive.yaml'));
  const config = await loadYaml(configPath);

  const timezone = config?.scheduler?.timezone || 'UTC';
  const jobs = config?.scheduler?.jobs || {};

  const scheduled = [];

  for (const [trigger, expr] of Object.entries(jobs)) {
    const task = cron.schedule(
      String(expr),
      async () => {
        try {
          await executeTick({
            repo: repoRoot,
            workspace,
            config: configPath,
            trigger,
            channels: options.channels,
            state: options.state,
          });
        } catch (error) {
          console.error(`[cron:${trigger}] ${error.message}`);
        }
      },
      { timezone },
    );
    scheduled.push({ trigger, expr, task });
  }

  let watcher = null;
  if (config?.watch?.enabled) {
    const watchPath = path.resolve(workspace, config.watch.path || '.');
    const ignored = config.watch.ignore || [];
    watcher = chokidar.watch(watchPath, {
      ignoreInitial: true,
      ignored,
    });

    const onFileEvent = async () => {
      try {
        await executeTick({
          repo: repoRoot,
          workspace,
          config: configPath,
          trigger: 'file_change',
          channels: options.channels,
          state: options.state,
        });
      } catch (error) {
        console.error(`[watch:file_change] ${error.message}`);
      }
    };

    watcher.on('add', onFileEvent);
    watcher.on('change', onFileEvent);
    watcher.on('unlink', onFileEvent);
  }

  console.log(`[OK] proactive daemon running (${scheduled.length} cron jobs, timezone=${timezone})`);
  if (watcher) {
    console.log('[OK] file watcher enabled');
  }

  const shutdown = async () => {
    for (const item of scheduled) {
      item.task.stop();
    }
    if (watcher) {
      await watcher.close();
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  if (!command) {
    throw new Error('usage: proactive_daemon.mjs <run|tick|send> [--flags]');
  }

  if (command === 'run') {
    await runDaemon(args);
    return;
  }
  if (command === 'tick') {
    await executeTick(args);
    return;
  }
  if (command === 'send') {
    await runDispatcher({
      repoRoot: path.resolve(args.repo || '.'),
      workspace: path.resolve(args.workspace || 'savc-core'),
      channelsPath: path.resolve(args.channels || 'config/channels.yaml'),
      channel: args.channel || 'discord',
      target: args.target || null,
      sessionId: args['session-id'] || `phase2-send-${Date.now()}`,
      message: args.message || 'proactive ping',
      dryRun: boolFlag(args['dry-run']),
    }).then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (result.code !== 0) {
        process.exit(1);
      }
    });
    return;
  }

  throw new Error(`unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
