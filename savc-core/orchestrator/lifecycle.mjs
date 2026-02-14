#!/usr/bin/env node
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { formatVisionReport, analyzeVisionTask } from './vision.mjs';
import { buildVoiceExecutionPlan, formatVoicePlan } from './voice.mjs';
import { formatVibeCodingReport, runVibeCodingTask } from './vibe-coder.mjs';

const runs = new Map();

const builtInExecutor = async ({ agentDef, task, options = {} }) => {
  if (String(agentDef?.name || '').trim() === 'voice') {
    const plan = buildVoiceExecutionPlan(task, {
      defaultAction: 'initiate',
      emotion: options.voiceEmotion,
    });
    if (typeof options.voiceRunner === 'function') {
      const runnerResult = await options.voiceRunner(plan, { agentDef, task, options });
      if (typeof runnerResult === 'string' && runnerResult.trim()) {
        return runnerResult;
      }
    }
    return formatVoicePlan(plan);
  }

  if (String(agentDef?.name || '').trim() === 'vision') {
    const analysis = analyzeVisionTask(task, {
      type: options.visionTaskType,
    });
    if (typeof options.visionRunner === 'function') {
      const runnerResult = await options.visionRunner(analysis, { agentDef, task, options });
      if (typeof runnerResult === 'string' && runnerResult.trim()) {
        return runnerResult;
      }
    }
    return formatVisionReport(analysis);
  }

  if (String(agentDef?.name || '').trim() === 'vibe-coder') {
    const result = await runVibeCodingTask(task, {
      workspaceDir: options.workspaceDir || process.cwd(),
      executionMode: options.executionMode || 'real',
      outputDir: options.outputDir,
      maxRounds: options.maxFixRounds || options.maxRounds || 3,
      maxScanFiles: options.maxScanFiles,
      maxScanDepth: options.maxScanDepth,
      commandTimeoutMs: options.commandTimeoutMs,
      runner: options.vibeRunner,
    });
    return formatVibeCodingReport(result);
  }

  const delay = Number.parseInt(String(agentDef?.limits?.mock_delay_ms || 20), 10);
  await new Promise((resolve) => setTimeout(resolve, Number.isFinite(delay) ? delay : 20));
  if (/\[fail\]/i.test(task)) {
    throw new Error('mock executor failure');
  }
  return `${agentDef?.name || 'agent'}: ${task}`;
};

let executor = builtInExecutor;

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

function now() {
  return Date.now();
}

function toDurationMs(startedAt, endedAt) {
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return null;
  return Math.max(0, endedAt - startedAt);
}

export function setExecutor(nextExecutor) {
  executor = nextExecutor;
}

export function resetExecutor() {
  executor = builtInExecutor;
}

export async function spawnAgent(agentDef, task, options = {}) {
  const runId = options.runId || crypto.randomUUID();
  const startedAt = now();
  const timeoutMs = (() => {
    const explicit = Number.parseInt(String(options.timeoutMs), 10);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    const fromDef = Number.parseInt(String(agentDef?.limits?.timeout_seconds), 10);
    if (Number.isFinite(fromDef) && fromDef > 0) return fromDef * 1000;
    return 60_000;
  })();

  const run = {
    runId,
    agent: agentDef?.name || 'unknown',
    task: String(task || ''),
    status: 'running',
    output: null,
    error: null,
    startedAt,
    endedAt: null,
    durationMs: null,
    timeoutMs,
    cancelled: false,
    promise: null,
    timer: null,
  };

  run.promise = (async () => {
    run.timer = setTimeout(() => {
      if (run.status === 'running') {
        run.cancelled = true;
        run.status = 'timeout';
        run.error = `timeout after ${timeoutMs}ms`;
        run.endedAt = now();
        run.durationMs = toDurationMs(run.startedAt, run.endedAt);
      }
    }, timeoutMs);

    try {
      const output = await executor({ agentDef, task, runId, options });
      if (run.status === 'running') {
        run.status = 'completed';
        run.output = output;
        run.endedAt = now();
        run.durationMs = toDurationMs(run.startedAt, run.endedAt);
      }
    } catch (error) {
      if (run.status === 'running') {
        run.status = 'failed';
        run.error = error instanceof Error ? error.message : String(error);
        run.endedAt = now();
        run.durationMs = toDurationMs(run.startedAt, run.endedAt);
      }
    } finally {
      if (run.timer) {
        clearTimeout(run.timer);
      }
    }

    return {
      runId: run.runId,
      agent: run.agent,
      status: run.status,
      output: run.output,
      error: run.error,
      durationMs: run.durationMs,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
    };
  })();

  runs.set(runId, run);
  return runId;
}

export async function waitForAgent(runId, timeoutMs = 0) {
  const run = runs.get(runId);
  if (!run) {
    throw new Error(`unknown runId: ${runId}`);
  }

  if (!timeoutMs || timeoutMs <= 0) {
    return run.promise;
  }

  return Promise.race([
    run.promise,
    new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          runId,
          agent: run.agent,
          status: run.status,
          output: run.output,
          error: run.error || `wait timeout after ${timeoutMs}ms`,
          durationMs: run.durationMs,
          startedAt: run.startedAt,
          endedAt: run.endedAt,
        });
      }, timeoutMs);
    }),
  ]);
}

export async function waitForAll(runIds, timeoutMs = 0) {
  return Promise.all(runIds.map((runId) => waitForAgent(runId, timeoutMs)));
}

export async function cancelAgent(runId) {
  const run = runs.get(runId);
  if (!run) {
    return {
      runId,
      cancelled: false,
      reason: 'not-found',
    };
  }

  if (run.status !== 'running') {
    return {
      runId,
      cancelled: false,
      reason: `already-${run.status}`,
    };
  }

  run.cancelled = true;
  run.status = 'cancelled';
  run.error = 'cancelled by caller';
  run.endedAt = now();
  run.durationMs = toDurationMs(run.startedAt, run.endedAt);

  if (run.timer) {
    clearTimeout(run.timer);
  }

  return {
    runId,
    cancelled: true,
    reason: 'ok',
  };
}

export function getStatus(runId) {
  const run = runs.get(runId);
  if (!run) return null;
  return {
    runId: run.runId,
    agent: run.agent,
    task: run.task,
    status: run.status,
    output: run.output,
    error: run.error,
    durationMs: run.durationMs,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
  };
}

async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  if (command === 'spawn') {
    const runId = await spawnAgent(
      {
        name: args.agent || 'mock-agent',
        limits: {
          timeout_seconds: Number.parseInt(String(args.timeout || '30'), 10),
        },
      },
      args.task || args._[1] || 'mock task',
      {},
    );
    console.log(JSON.stringify({ runId }, null, 2));
    return;
  }

  if (command === 'status') {
    const runId = args.id || args._[1];
    console.log(JSON.stringify(getStatus(runId), null, 2));
    return;
  }

  throw new Error('usage: lifecycle.mjs <spawn|status> [--flags]');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
