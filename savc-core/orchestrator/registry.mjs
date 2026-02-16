#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import chokidar from 'chokidar';
import yaml from 'js-yaml';

const registryState = {
  agentsDir: null,
  definitions: [],
  byName: new Map(),
  intentIndex: new Map(),
  keywordIndex: [],
  watcher: null,
  watcherReadyPromise: null,
};

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

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizeList(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function validateAgentDefinition(definition, filePath) {
  if (!definition || typeof definition !== 'object') {
    throw new Error(`invalid yaml object: ${filePath}`);
  }

  const name = String(definition.name || '').trim();
  if (!name) {
    throw new Error(`missing required field name: ${filePath}`);
  }

  if (!definition.model || typeof definition.model !== 'object') {
    throw new Error(`missing required field model: ${filePath}`);
  }

  if (!definition.triggers || typeof definition.triggers !== 'object') {
    throw new Error(`missing required field triggers: ${filePath}`);
  }

  return {
    ...definition,
    name,
    description: String(definition.description || '').trim(),
    label: String(definition.label || name).trim(),
    triggers: {
      ...(definition.triggers || {}),
      intents: normalizeList(definition.triggers?.intents),
      keywords: normalizeList(definition.triggers?.keywords),
    },
    file: filePath,
  };
}

async function loadAgentDefinitions(agentsDir) {
  if (!(await exists(agentsDir))) {
    throw new Error(`agents dir not found: ${agentsDir}`);
  }

  const entries = await fs.readdir(agentsDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
    .map((entry) => path.join(agentsDir, entry.name))
    .sort();

  const definitions = [];
  for (const filePath of files) {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = yaml.load(raw);
    definitions.push(validateAgentDefinition(parsed, filePath));
  }

  return definitions;
}

function rebuildIndexes(definitions) {
  const byName = new Map();
  const intentIndex = new Map();
  const keywordIndex = [];

  for (const definition of definitions) {
    byName.set(definition.name, definition);

    for (const intent of definition.triggers.intents) {
      const key = intent.toLowerCase();
      if (!intentIndex.has(key)) {
        intentIndex.set(key, []);
      }
      intentIndex.get(key).push(definition.name);
    }

    definition.triggers.keywords.forEach((keyword, keywordOrder) => {
      keywordIndex.push({
        keyword,
        keywordLower: keyword.toLowerCase(),
        keywordOrder,
        agentName: definition.name,
      });
    });
  }

  registryState.definitions = definitions;
  registryState.byName = byName;
  registryState.intentIndex = intentIndex;
  registryState.keywordIndex = keywordIndex;
}

async function reloadDefinitions() {
  if (!registryState.agentsDir) return;
  const definitions = await loadAgentDefinitions(registryState.agentsDir);
  rebuildIndexes(definitions);
}

function ensureWatcher(agentsDir) {
  if (registryState.watcher) {
    return registryState.watcherReadyPromise || Promise.resolve();
  }

  registryState.watcher = chokidar.watch(agentsDir, {
    ignoreInitial: true,
    depth: 0,
  });
  registryState.watcherReadyPromise = new Promise((resolve) => {
    registryState.watcher.once('ready', resolve);
  });

  const reload = async (filePath) => {
    if (filePath && !/\.ya?ml$/i.test(filePath)) return;
    try {
      await reloadDefinitions();
    } catch {
      // keep the previous good snapshot when reload fails
    }
  };

  registryState.watcher.on('add', reload);
  registryState.watcher.on('change', reload);
  registryState.watcher.on('unlink', reload);

  return registryState.watcherReadyPromise;
}

export async function closeWatcher() {
  if (!registryState.watcher) return;
  await registryState.watcher.close();
  registryState.watcher = null;
  registryState.watcherReadyPromise = null;
}

export async function discoverAgents(agentsDir = 'savc-core/agents', options = {}) {
  const resolvedDir = path.resolve(agentsDir);
  const previousDir = registryState.agentsDir;
  const shouldReload = options.forceReload || previousDir !== resolvedDir;

  if (shouldReload) {
    if (registryState.watcher && previousDir && previousDir !== resolvedDir) {
      await closeWatcher();
    }
    registryState.agentsDir = resolvedDir;
    const definitions = await loadAgentDefinitions(resolvedDir);
    rebuildIndexes(definitions);
  }

  if (options.watch) {
    await ensureWatcher(resolvedDir);
  }

  return registryState.definitions.map((definition) => ({
    ...definition,
    triggers: {
      intents: [...definition.triggers.intents],
      keywords: [...definition.triggers.keywords],
    },
  }));
}

export function getAgent(name) {
  const key = String(name || '').trim();
  if (!key) return null;
  const definition = registryState.byName.get(key);
  return definition || null;
}

export function listAgents() {
  return registryState.definitions.map((definition) => definition.name);
}

export function matchByIntent(intent) {
  const key = String(intent || '').trim().toLowerCase();
  if (!key) return null;
  const candidates = registryState.intentIndex.get(key) || [];
  if (candidates.length === 0) return null;
  return registryState.byName.get(candidates[0]) || null;
}

export function matchByKeyword(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  const exactMatches = registryState.keywordIndex.filter((entry) => lower === entry.keywordLower);
  if (exactMatches.length > 0) {
    const picked = exactMatches.sort((left, right) => left.keywordOrder - right.keywordOrder)[0];
    return registryState.byName.get(picked.agentName) || null;
  }

  const includeMatches = registryState.keywordIndex.filter((entry) => lower.includes(entry.keywordLower));
  if (includeMatches.length === 0) return null;

  const picked = includeMatches.sort((left, right) => {
    const byLength = right.keywordLower.length - left.keywordLower.length;
    if (byLength !== 0) {
      return byLength;
    }
    const byOrder = left.keywordOrder - right.keywordOrder;
    if (byOrder !== 0) {
      return byOrder;
    }
    return left.agentName.localeCompare(right.agentName);
  })[0];
  return registryState.byName.get(picked.agentName) || null;
}

async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  const agentsDir = args['agents-dir'] || 'savc-core/agents';

  if (!command) {
    throw new Error('usage: registry.mjs <list|match|discover> [--agents-dir path] [--intent x|--text y]');
  }

  await discoverAgents(agentsDir, {
    watch: args.watch === true,
    forceReload: true,
  });

  if (command === 'discover' || command === 'list') {
    const output = command === 'discover' ? registryState.definitions : listAgents();
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  if (command === 'match') {
    if (args.intent) {
      console.log(JSON.stringify(matchByIntent(args.intent), null, 2));
      return;
    }
    if (args.text) {
      console.log(JSON.stringify(matchByKeyword(args.text), null, 2));
      return;
    }
    throw new Error('match requires --intent or --text');
  }

  throw new Error(`unknown command: ${command}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
