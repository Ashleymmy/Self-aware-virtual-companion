#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
OUT_JSON="/tmp/phase4b_perf_metrics.json"

pass_count=0
fail_count=0

pass() {
  echo "[PASS] $*"
  pass_count=$((pass_count + 1))
}

fail() {
  echo "[FAIL] $*"
  fail_count=$((fail_count + 1))
}

for file in \
  "savc-core/orchestrator/router.mjs" \
  "savc-core/orchestrator/decomposer.mjs" \
  "savc-core/orchestrator/lifecycle.mjs" \
  "savc-core/orchestrator/aggregator.mjs"; do
  if [[ -f "${REPO_ROOT}/${file}" ]]; then
    pass "file exists: ${file}"
  else
    fail "missing file: ${file}"
  fi
done

if node - <<'NODE' >"${OUT_JSON}"
import { performance } from 'node:perf_hooks';
import { routeMessage } from './savc-core/orchestrator/router.mjs';
import { discoverAgents, getAgent } from './savc-core/orchestrator/registry.mjs';
import { spawnAgent, waitForAgent, waitForAll } from './savc-core/orchestrator/lifecycle.mjs';
import { aggregate } from './savc-core/orchestrator/aggregator.mjs';

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function summary(values) {
  const total = values.reduce((acc, item) => acc + item, 0);
  return {
    count: values.length,
    avgMs: values.length ? total / values.length : 0,
    p95Ms: percentile(values, 95),
    maxMs: values.length ? Math.max(...values) : 0,
  };
}

await discoverAgents('savc-core/agents', { forceReload: true });
const technical = getAgent('technical');
const creative = getAgent('creative');
if (!technical || !creative) {
  throw new Error('missing required agents technical/creative');
}

const level1Times = [];
const level2Times = [];
for (let i = 0; i < 80; i += 1) {
  const s1 = performance.now();
  await routeMessage('抱抱我', { agentsDir: 'savc-core/agents' });
  level1Times.push(performance.now() - s1);

  const s2 = performance.now();
  await routeMessage('帮我优化这段 SQL 查询', { agentsDir: 'savc-core/agents' });
  level2Times.push(performance.now() - s2);
}

const singleSpawnTimes = [];
for (let i = 0; i < 10; i += 1) {
  const s = performance.now();
  const runId = await spawnAgent(technical, '请输出一条 mock 技术建议', { timeoutMs: 3000 });
  await waitForAgent(runId, 3000);
  singleSpawnTimes.push(performance.now() - s);
}

const parallelSpawnTimes = [];
for (let i = 0; i < 6; i += 1) {
  const s = performance.now();
  const runA = await spawnAgent(technical, '任务A：给出技术建议', { timeoutMs: 3000 });
  const runB = await spawnAgent(creative, '任务B：给出创意建议', { timeoutMs: 3000 });
  await waitForAll([runA, runB], 4000);
  parallelSpawnTimes.push(performance.now() - s);
}

const aggTimes = [];
const aggTasks = [
  { id: 'task-1', agent: 'technical', task: '技术建议', priority: 1, dependsOn: [] },
  { id: 'task-2', agent: 'creative', task: '创意建议', priority: 2, dependsOn: [] },
];
const aggResults = [
  { taskId: 'task-1', agent: 'technical', status: 'completed', output: '技术输出', error: null },
  { taskId: 'task-2', agent: 'creative', status: 'completed', output: '创意输出', error: null },
];
for (let i = 0; i < 120; i += 1) {
  const s = performance.now();
  await aggregate(aggTasks, aggResults, '综合建议');
  aggTimes.push(performance.now() - s);
}

const metrics = {
  routeLevel1: summary(level1Times),
  routeLevel2: summary(level2Times),
  singleSpawn: summary(singleSpawnTimes),
  parallelSpawn2: summary(parallelSpawnTimes),
  aggregator: summary(aggTimes),
};

console.log(JSON.stringify(metrics, null, 2));
NODE
then
  pass "performance probe collected metrics"
else
  fail "performance probe failed"
fi

if python3 - "${OUT_JSON}" <<'PY'
import json
import sys

metrics = json.load(open(sys.argv[1], "r", encoding="utf-8"))

assert metrics["routeLevel1"]["p95Ms"] < 5, metrics
assert metrics["routeLevel2"]["p95Ms"] < 500, metrics
assert metrics["singleSpawn"]["p95Ms"] < 2000, metrics
assert metrics["parallelSpawn2"]["p95Ms"] < 5000, metrics
assert metrics["aggregator"]["p95Ms"] < 1000, metrics
print("ok")
PY
then
  pass "performance baseline thresholds passed"
else
  fail "performance baseline thresholds failed"
fi

echo "=== Phase 4b Perf Test Summary ==="
echo "PASS: ${pass_count}"
echo "FAIL: ${fail_count}"
echo "METRICS: ${OUT_JSON}"

if (( fail_count > 0 )); then
  exit 1
fi
