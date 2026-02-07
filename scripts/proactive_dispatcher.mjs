#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import yaml from 'js-yaml';

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

function ensureText(value, field) {
  const text = String(value || '').trim();
  if (!text) {
    throw new Error(`${field} is required`);
  }
  return text;
}

async function readYaml(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = yaml.load(raw);
  if (!parsed || typeof parsed !== 'object') {
    return {};
  }
  return parsed;
}

function resolveTarget(channel, channelsConfig, explicitTarget) {
  if (explicitTarget) return explicitTarget;

  if (channel === 'discord') {
    return channelsConfig?.channels?.discord?.proactive?.default_channel_id
      || process.env.DISCORD_CHANNEL_ID
      || '';
  }
  if (channel === 'telegram') {
    return channelsConfig?.channels?.telegram?.proactive?.default_chat_id
      || process.env.TELEGRAM_CHAT_ID
      || '';
  }
  if (channel === 'web') {
    return 'web-default';
  }
  return '';
}

function buildReplyTo(channel, target) {
  if (channel === 'discord') {
    if (target.startsWith('channel:')) return target;
    return `channel:${target}`;
  }
  if (channel === 'telegram') {
    if (target.startsWith('chat:')) return target;
    return `chat:${target}`;
  }
  return target;
}

function parseDiscordChannelId(target) {
  const text = String(target || '').trim();
  if (!text) return '';
  if (text.startsWith('channel:')) {
    return text.slice('channel:'.length).trim();
  }
  return text;
}

async function sendDiscordDirect({ channelId, message }) {
  const token = process.env.DISCORD_BOT_TOKEN || '';
  if (!token) {
    return { ok: false, reason: 'missing_env_discord_bot_token' };
  }
  if (!channelId) {
    return { ok: false, reason: 'missing_channel_id' };
  }

  const endpoint = `https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/messages`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content: message }),
  });

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body?.message || '';
    } catch {
      detail = '';
    }
    return {
      ok: false,
      reason: `http_${response.status}`,
      detail,
    };
  }

  const payload = await response.json();
  return {
    ok: true,
    messageId: payload?.id || null,
    channelId: payload?.channel_id || channelId,
  };
}

async function runOpenClawSend(params) {
  const {
    repoRoot,
    channel,
    replyTo,
    message,
    sessionId,
  } = params;

  const scriptPath = path.join(repoRoot, 'scripts', 'openclaw.sh');
  const args = [
    scriptPath,
    'agent',
    '--local',
    '--session-id',
    sessionId,
    '--message',
    message,
    '--deliver',
    '--reply-channel',
    channel,
    '--reply-to',
    replyTo,
    '--json',
  ];

  return new Promise((resolve) => {
    const child = spawn('bash', args, { stdio: ['ignore', 'pipe', 'pipe'] });
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

async function appendDeliveryLog(workspace, payload) {
  const logFile = path.join(workspace, 'memory', 'procedural', 'proactive-delivery.log');
  await fs.mkdir(path.dirname(logFile), { recursive: true });
  const line = `${new Date().toISOString()} ${JSON.stringify(payload)}\n`;
  await fs.appendFile(logFile, line, 'utf8');
}

async function sendMessage(options) {
  const repoRoot = path.resolve(options.repo || '.');
  const workspace = path.resolve(options.workspace || path.join(repoRoot, 'savc-core'));
  const channelsPath = path.resolve(options.channels || path.join(repoRoot, 'config', 'channels.yaml'));

  const channel = ensureText(options.channel, '--channel');
  const message = ensureText(options.message, '--message');
  const channelsConfig = await readYaml(channelsPath);
  const target = resolveTarget(channel, channelsConfig, options.target);

  if (!target) {
    throw new Error(`no target configured for channel: ${channel}`);
  }

  const sessionId = options['session-id'] || `phase2-proactive-${Date.now()}`;
  const dryRun = options['dry-run'] === true || String(options['dry-run'] || '') === 'true';

  if (channel === 'web') {
    const payload = {
      channel,
      target,
      sessionId,
      message,
      dryRun,
      delivered: true,
      mode: 'local-log',
    };
    await appendDeliveryLog(workspace, payload);
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const replyTo = buildReplyTo(channel, target);

  if (dryRun) {
    const payload = {
      channel,
      target,
      replyTo,
      sessionId,
      message,
      delivered: false,
      mode: 'dry-run',
    };
    await appendDeliveryLog(workspace, payload);
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const result = await runOpenClawSend({
    repoRoot,
    channel,
    replyTo,
    message,
    sessionId,
  });

  const payload = {
    channel,
    target,
    replyTo,
    sessionId,
    message,
    delivered: result.code === 0,
    exitCode: result.code,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };

  if (result.code !== 0 && channel === 'discord') {
    const channelId = parseDiscordChannelId(target);
    const fallback = await sendDiscordDirect({ channelId, message });
    if (fallback.ok) {
      payload.delivered = true;
      payload.mode = 'discord-direct-fallback';
      payload.fallback = fallback;
    } else {
      payload.mode = 'openclaw-failed';
      payload.fallback = fallback;
    }
  }

  await appendDeliveryLog(workspace, payload);
  console.log(JSON.stringify(payload, null, 2));

  if (!payload.delivered) {
    process.exit(1);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  if (!command) {
    throw new Error('usage: proactive_dispatcher.mjs <send> [--flags]');
  }

  if (command === 'send') {
    await sendMessage(args);
    return;
  }

  throw new Error(`unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
