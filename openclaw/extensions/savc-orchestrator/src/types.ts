export type RouteDecision = {
  agent: string;
  level: number;
  confidence: number;
  reason: string;
  latencyMs: number;
  messageSummary?: string;
};

export type TaskItem = {
  id: string;
  agent: string;
  task: string;
  priority: number;
  dependsOn: string[];
};

export type TaskPlan = {
  type: "simple" | "compound";
  tasks: TaskItem[];
  execution: "parallel" | "sequential" | "mixed";
};

export type AgentRunResult = {
  runId: string;
  agent: string;
  status: string;
  output: string | null;
  durationMs: number | null;
  error: string | null;
};

export type ToolDetails<T = unknown> = {
  ok: boolean;
  code: string;
  error: string | null;
  data: T | null;
};

export type SpawnMode = "mock" | "real";

export type PluginToolContext = {
  agentId?: string;
  sessionKey?: string;
  messageChannel?: string;
  agentAccountId?: string;
  sandboxed?: boolean;
};

export type ResolvedPluginConfig = {
  savcCorePath?: string;
  agentsDir?: string;
  spawnMode: SpawnMode;
  defaultWait: boolean;
  defaultTimeoutMs: number;
  memoryRecallEnabled: boolean;
  memoryRecallTopK: number;
  memoryMinScore: number;
  memoryPersistEnabled: boolean;
  logFile: string;
};

export type ResolvedRuntimeContext = {
  config: ResolvedPluginConfig;
  savcCorePath: string;
  agentsDir: string;
  orchestratorDir: string;
  repoRoot: string;
  memorySemanticPath: string;
  logFilePath: string;
};

export type RouterModule = {
  routeMessage: (
    message: string,
    options?: { agentsDir?: string; confidenceThreshold?: number },
  ) => Promise<RouteDecision>;
};

export type DecomposerModule = {
  analyze: (message: string, options?: { agentsDir?: string }) => Promise<TaskPlan>;
};

export type VisionImageResult = {
  mode?: string;
  provider?: string;
  model?: string;
  prompt?: string;
  size?: string;
  quality?: string;
  image?: Record<string, unknown> | null;
  createdAt?: number;
};

export type VisionModule = {
  analyzeVisionTask?: (
    message: string,
    options?: { type?: string },
  ) => {
    type?: string;
    requiresImage?: boolean;
    collaborators?: string[];
    sourceText?: string;
  };
  generateImage: (options?: {
    prompt?: string;
    size?: string;
    quality?: string;
    mode?: string;
    apiKey?: string;
  }) => Promise<VisionImageResult>;
};

export type Live2DSignalResult = {
  version?: string;
  source?: string;
  createdAt?: number;
  emotion?: string;
  motion?: string;
  transitionMs?: number;
  expression?: Record<string, unknown> | null;
  lipSync?: Array<{ tMs?: number; mouthOpen?: number }>;
  interaction?: Record<string, unknown> | null;
};

export type Live2DModule = {
  normalizeEmotionTag?: (emotion: unknown) => string;
  mapEmotionToExpression?: (
    emotion: unknown,
    options?: Record<string, unknown>,
  ) => Record<string, unknown>;
  buildLipSyncFrames?: (
    text: unknown,
    options?: Record<string, unknown>,
  ) => Array<{ tMs?: number; mouthOpen?: number }>;
  buildInteractionReaction?: (
    interactionType: unknown,
    options?: Record<string, unknown>,
  ) => Record<string, unknown>;
  buildLive2DSignal: (input?: Record<string, unknown>) => Live2DSignalResult;
  formatLive2DSignal?: (signal: unknown) => string;
};

export type RegistryModule = {
  discoverAgents: (agentsDir?: string, options?: { forceReload?: boolean }) => Promise<unknown>;
  getAgent: (name: string) => Record<string, unknown> | null;
};

export type LifecycleSnapshot = {
  runId: string;
  agent: string;
  status: string;
  output: string | null;
  error: string | null;
  durationMs: number | null;
};

export type LifecycleModule = {
  spawnAgent: (
    agentDef: Record<string, unknown>,
    task: string,
    options?: { timeoutMs?: number; spawnMode?: string },
  ) => Promise<string>;
  waitForAgent: (runId: string, timeoutMs?: number) => Promise<LifecycleSnapshot>;
  getStatus: (runId: string) => LifecycleSnapshot | null;
};

export type SemanticSearchMatch = {
  text?: string;
  score?: number;
};

export type SemanticSearchResult = {
  matches?: SemanticSearchMatch[];
};

export type MemorySemanticModule = {
  search: (
    query: string,
    options?: { workspace?: string; limit?: number; minScore?: number },
  ) => Promise<SemanticSearchResult>;
  store: (
    text: string,
    metadata?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
  autoCapture?: (
    input: unknown,
    options?: { workspace?: string; source?: string; limit?: number },
  ) => Promise<{
    stored?: number;
  }>;
};

export type RealRunStatus = "accepted" | "running" | "completed" | "failed" | "timeout";

export type RealRunRecord = {
  runId: string;
  agent: string;
  status: RealRunStatus;
  childSessionKey?: string;
  output?: string | null;
  error?: string | null;
  startedAt?: number;
  endedAt?: number;
  durationMs?: number | null;
};
