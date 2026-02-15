import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type {
  DecomposerModule,
  LifecycleModule,
  MemorySemanticModule,
  RegistryModule,
  ResolvedRuntimeContext,
  RouterModule,
  VisionModule,
} from "./types.js";
import { resolvePluginConfig } from "./config.js";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));

function hasFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function hasDir(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function toAbsolutePath(api: OpenClawPluginApi, input: string): string {
  if (path.isAbsolute(input)) {
    return path.resolve(input);
  }
  return path.resolve(api.resolvePath(input));
}

function findRepoRoot(seedPaths: string[]): string | null {
  for (const seed of seedPaths) {
    let cursor = path.resolve(seed);
    while (true) {
      const candidate = path.join(cursor, "scripts", "memory_semantic.mjs");
      if (hasFile(candidate)) {
        return cursor;
      }
      const parent = path.dirname(cursor);
      if (parent === cursor) {
        break;
      }
      cursor = parent;
    }
  }
  return null;
}

function resolveSavcCorePath(api: OpenClawPluginApi, pluginSavcCorePath?: string): string {
  if (pluginSavcCorePath) {
    return toAbsolutePath(api, pluginSavcCorePath);
  }

  const workspaceFromConfig =
    typeof api.config?.agents?.defaults?.workspace === "string"
      ? api.config.agents.defaults.workspace.trim()
      : "";

  if (workspaceFromConfig) {
    return toAbsolutePath(api, workspaceFromConfig);
  }

  return path.resolve(process.cwd(), "savc-core");
}

function resolveLogFilePath(savcCorePath: string, configuredLogFile: string): string {
  if (path.isAbsolute(configuredLogFile)) {
    return path.resolve(configuredLogFile);
  }
  return path.resolve(savcCorePath, configuredLogFile);
}

function ensurePathExists(targetPath: string, description: string) {
  if (!hasFile(targetPath) && !hasDir(targetPath)) {
    throw new Error(`${description} not found: ${targetPath}`);
  }
}

export function resolveRuntimeContext(
  api: OpenClawPluginApi,
  options: { agentsDir?: string } = {},
): ResolvedRuntimeContext {
  const config = resolvePluginConfig(api.pluginConfig);
  const savcCorePath = resolveSavcCorePath(api, config.savcCorePath);

  const agentsDirInput = options.agentsDir ?? config.agentsDir ?? path.join(savcCorePath, "agents");
  const agentsDir = path.isAbsolute(agentsDirInput)
    ? path.resolve(agentsDirInput)
    : path.resolve(savcCorePath, agentsDirInput);

  const orchestratorDir = path.resolve(savcCorePath, "orchestrator");

  const repoRoot =
    findRepoRoot([
      path.dirname(savcCorePath),
      process.cwd(),
      path.resolve(THIS_DIR, "../../../../.."),
      path.resolve(THIS_DIR, "../../../.."),
    ]) ?? path.resolve(THIS_DIR, "../../../../..");

  const memorySemanticPath = path.join(repoRoot, "scripts", "memory_semantic.mjs");
  const logFilePath = resolveLogFilePath(savcCorePath, config.logFile);

  return {
    config,
    savcCorePath,
    agentsDir,
    orchestratorDir,
    repoRoot,
    memorySemanticPath,
    logFilePath,
  };
}

async function importModule<T>(modulePath: string): Promise<T> {
  const href = pathToFileURL(modulePath).href;
  return (await import(href)) as T;
}

export async function loadRouterModule(ctx: ResolvedRuntimeContext): Promise<RouterModule> {
  const modulePath = path.join(ctx.orchestratorDir, "router.mjs");
  ensurePathExists(modulePath, "router module");
  const mod = await importModule<RouterModule>(modulePath);
  if (typeof mod.routeMessage !== "function") {
    throw new Error(`invalid router module export: ${modulePath}`);
  }
  return mod;
}

export async function loadDecomposerModule(ctx: ResolvedRuntimeContext): Promise<DecomposerModule> {
  const modulePath = path.join(ctx.orchestratorDir, "decomposer.mjs");
  ensurePathExists(modulePath, "decomposer module");
  const mod = await importModule<DecomposerModule>(modulePath);
  if (typeof mod.analyze !== "function") {
    throw new Error(`invalid decomposer module export: ${modulePath}`);
  }
  return mod;
}

export async function loadRegistryModule(ctx: ResolvedRuntimeContext): Promise<RegistryModule> {
  const modulePath = path.join(ctx.orchestratorDir, "registry.mjs");
  ensurePathExists(modulePath, "registry module");
  const mod = await importModule<RegistryModule>(modulePath);
  if (typeof mod.discoverAgents !== "function" || typeof mod.getAgent !== "function") {
    throw new Error(`invalid registry module export: ${modulePath}`);
  }
  return mod;
}

export async function loadLifecycleModule(ctx: ResolvedRuntimeContext): Promise<LifecycleModule> {
  const modulePath = path.join(ctx.orchestratorDir, "lifecycle.mjs");
  ensurePathExists(modulePath, "lifecycle module");
  const mod = await importModule<LifecycleModule>(modulePath);
  if (
    typeof mod.spawnAgent !== "function" ||
    typeof mod.waitForAgent !== "function" ||
    typeof mod.getStatus !== "function"
  ) {
    throw new Error(`invalid lifecycle module export: ${modulePath}`);
  }
  return mod;
}

export async function loadMemorySemanticModule(
  ctx: ResolvedRuntimeContext,
): Promise<MemorySemanticModule> {
  ensurePathExists(ctx.memorySemanticPath, "memory semantic module");
  const mod = await importModule<MemorySemanticModule>(ctx.memorySemanticPath);
  if (typeof mod.search !== "function" || typeof mod.store !== "function") {
    throw new Error(`invalid memory semantic module export: ${ctx.memorySemanticPath}`);
  }
  return mod;
}

export async function loadVisionModule(ctx: ResolvedRuntimeContext): Promise<VisionModule> {
  const modulePath = path.join(ctx.orchestratorDir, "vision.mjs");
  ensurePathExists(modulePath, "vision module");
  const mod = await importModule<VisionModule>(modulePath);
  if (typeof mod.generateImage !== "function") {
    throw new Error(`invalid vision module export: ${modulePath}`);
  }
  return mod;
}
