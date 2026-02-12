import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildImplementationPlan,
  buildProjectContext,
  formatVibeCodingReport,
  runIterativeFixLoop,
  runVibeCodingTask,
} from '../../savc-core/orchestrator/vibe-coder.mjs';
import { resetExecutor, spawnAgent, waitForAgent } from '../../savc-core/orchestrator/lifecycle.mjs';

async function createWorkspace() {
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'savc_phase5c_'));
  await fs.mkdir(path.join(workspaceDir, 'src'), { recursive: true });
  await fs.writeFile(path.join(workspaceDir, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n', 'utf8');
  await fs.writeFile(path.join(workspaceDir, 'src', 'index.ts'), 'export const ready = true;\n', 'utf8');
  await fs.writeFile(
    path.join(workspaceDir, 'package.json'),
    JSON.stringify(
      {
        name: 'phase5c-sample',
        type: 'module',
        scripts: {
          test: 'vitest run',
          lint: 'eslint .',
        },
        dependencies: {
          express: '^4.21.0',
        },
        devDependencies: {
          typescript: '^5.8.0',
          vitest: '^2.1.0',
        },
      },
      null,
      2,
    ),
    'utf8',
  );
  return workspaceDir;
}

async function main() {
  const workspaceDir = await createWorkspace();

  try {
    const context = await buildProjectContext(workspaceDir, {
      maxScanFiles: 200,
      maxScanDepth: 4,
    });

    assert.equal(context.packageManager, 'pnpm');
    assert.equal(context.language, 'typescript');
    assert.equal(context.moduleSystem, 'esm');
    assert.equal(context.frameworks.includes('express'), true);
    assert.equal(context.commands.test, 'pnpm run -s test');

    const plan = buildImplementationPlan('请从零搭建一个 Express API，并自动修复测试', context);
    assert.equal(plan.targetFiles.some((item) => item.startsWith('src/')), true);
    assert.equal(plan.steps.some((item) => item.action === 'iterative-fix'), true);

    const loop = await runIterativeFixLoop({
      task: '自动修复测试失败',
      projectContext: context,
      plan,
      maxRounds: 3,
      runner: async ({ attempt }) => {
        if (attempt === 1) {
          return { ok: false, error: 'first round failed', changedFiles: ['src/app.ts'] };
        }
        return { ok: true, notes: 'fixed', changedFiles: ['src/app.ts', 'tests/app.test.ts'] };
      },
    });

    assert.equal(loop.passed, true);
    assert.equal(loop.completedIn, 2);
    assert.equal(loop.attempts.length, 2);

    const runResult = await runVibeCodingTask('请从零搭建一个 Express API 脚手架并自动修复测试', {
      workspaceDir,
      maxRounds: 3,
    });
    assert.equal(runResult.status, 'completed');
    assert.equal(runResult.repair.withinThreeRounds, true);
    assert.equal(runResult.repair.attempts.length <= 3, true);
    assert.equal(runResult.plan.targetFiles.length > 0, true);

    const report = formatVibeCodingReport(runResult);
    assert.equal(report.includes('status=completed'), true);
    assert.equal(report.includes('iterations=2/3'), true);

    resetExecutor();
    const runId = await spawnAgent(
      { name: 'vibe-coder', limits: { timeout_seconds: 10 } },
      '请从零搭建一个 Express API 脚手架并自动修复测试',
      {
        workspaceDir,
        maxFixRounds: 3,
      },
    );
    const done = await waitForAgent(runId, 10_000);
    assert.equal(done.status, 'completed');
    assert.equal(String(done.output || '').includes('[vibe-coder]'), true);
    assert.equal(String(done.output || '').includes('status=completed'), true);

    console.log('[PASS] orchestrator vibe-coder');
  } finally {
    await fs.rm(workspaceDir, { recursive: true, force: true });
    resetExecutor();
  }
}

main().catch((error) => {
  console.error('[FAIL] orchestrator vibe-coder');
  console.error(error);
  process.exit(1);
});
