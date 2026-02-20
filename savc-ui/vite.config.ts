import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, watch, writeFileSync, type FSWatcher } from "node:fs";
import { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
// @lydell/node-pty — only imported when Phase 3 PTY endpoint is active
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let nodePty: any = null;
try { nodePty = await import("@lydell/node-pty"); } catch { /* savc-ui running without pty */ }

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const docsRoot = path.resolve(repoRoot, "docs");
const worklogRoot = path.resolve(docsRoot, "worklog");
const planBoardPath = path.resolve(docsRoot, "project-plan-board.md");

const AUDIO_EXTENSIONS = new Set([".mp3", ".opus", ".ogg", ".wav", ".m4a"]);
const MAX_DOC_BYTES = 512 * 1024;
const SNAPSHOT_CACHE_MS = 3_000;
const SSE_HEARTBEAT_MS = 15_000;
const TASK_EVENT_BUFFER_LIMIT = 240;
const TASK_STREAM_RETRY_MS = 2_500;

type ModuleStatus = "done" | "in_progress" | "blocked" | "planned";
type ModuleRisk = "low" | "medium" | "high";
type GanttSchedule = "on_track" | "risk" | "delayed";

type ProgressModule = {
  id: string;
  name: string;
  desc: string;
  status: ModuleStatus;
  progress: number;
  phase: string;
  risk: ModuleRisk;
  owner: string;
  updatedAt: string;
  links: string[];
  deps: string[];
};

type GanttItem = {
  id: string;
  name: string;
  start: string;
  end: string;
  progress: number;
  efficiency: number;
  schedule: GanttSchedule;
  status: ModuleStatus;
};

type WorklogItem = {
  file: string;
  date: string;
  source: "codex" | "claude" | "worklog" | "plan";
  title: string;
  summary: string;
  sections: string[];
  updatedAt: string;
};

type PlanDocItem = {
  file: string;
  title: string;
  excerpt: string;
  updatedAt: string;
};

type CommitItem = {
  hash: string;
  date: string;
  author: string;
  subject: string;
};

type SnapshotRepo = {
  branch: string;
  head: string;
  dirty: boolean;
  changedFiles: number;
  unavailable?: boolean;
};

type ProgressSnapshot = {
  generatedAt: string;
  repo: SnapshotRepo;
  modules: ProgressModule[];
  gantt: GanttItem[];
  worklogs: WorklogItem[];
  planDocs: PlanDocItem[];
  commits: CommitItem[];
  metrics: {
    logCount: number;
    commit7d: number;
    activeModuleCount: number;
    doneModuleCount: number;
  };
  planBoard: {
    file: string;
    nextPlanMd: string;
    correctionPlanMd: string;
    updatedAt: string;
    history: Array<{
      timestamp: string;
      nextPlanMd: string;
      correctionPlanMd: string;
    }>;
  };
};

type TaskState = "queued" | "running" | "retry" | "succeeded" | "failed" | "canceled";
type TaskEventSource = "api" | "demo" | "system";

type RuntimeTask = {
  id: string;
  title: string;
  status: TaskState;
  progress: number;
  owner: string;
  channel: string;
  attempt: number;
  maxAttempts: number;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastMessage: string;
};

type RuntimeTaskEvent = {
  id: string;
  seq: number;
  taskId: string;
  state: TaskState;
  progress: number;
  message: string;
  owner: string;
  channel: string;
  actor: string;
  source: TaskEventSource;
  attempt: number;
  maxAttempts: number;
  timestamp: string;
};

type RuntimeTaskSnapshot = {
  generatedAt: string;
  tasks: RuntimeTask[];
  recentEvents: RuntimeTaskEvent[];
  metrics: Record<TaskState | "total", number>;
};

const TASK_STATES: TaskState[] = ["queued", "running", "retry", "succeeded", "failed", "canceled"];

type ModuleBlueprint = {
  id: string;
  name: string;
  desc: string;
  phase: string;
  owner: string;
  deps: string[];
  links: string[];
  keywords: string[];
  baseProgress: number;
  baseStatus: ModuleStatus;
  offsetDays: number;
  durationDays: number;
};

const PROJECT_START = new Date("2026-02-01T00:00:00.000Z").getTime();

const MODULE_BLUEPRINTS: ModuleBlueprint[] = [
  {
    id: "orchestrator",
    name: "Orchestrator",
    desc: "多 Agent 路由、任务拆解与聚合执行主链路。",
    phase: "Phase 4b/5c",
    owner: "Core",
    deps: [],
    links: ["docs/多Agent协同编排方案.md"],
    keywords: ["orchestrator", "编排", "路由", "拆解", "dispatch"],
    baseProgress: 86,
    baseStatus: "in_progress",
    offsetDays: 0,
    durationDays: 38,
  },
  {
    id: "memory",
    name: "Memory",
    desc: "语义检索、记忆衰减、自动召回与自动捕获能力。",
    phase: "Phase 4a",
    owner: "Core",
    deps: ["orchestrator"],
    links: ["docs/记忆系统语义检索升级方案.md"],
    keywords: ["memory", "记忆", "语义", "lancedb", "auto-recall", "auto-capture"],
    baseProgress: 93,
    baseStatus: "done",
    offsetDays: 2,
    durationDays: 30,
  },
  {
    id: "persona",
    name: "Persona",
    desc: "人格设定、价值观与表达风格一致性管理。",
    phase: "Phase 1+",
    owner: "Product",
    deps: ["memory"],
    links: ["docs/SAVC功能拓展路线图.md"],
    keywords: ["persona", "人格", "灵魂", "voice.yaml", "values"],
    baseProgress: 88,
    baseStatus: "in_progress",
    offsetDays: 4,
    durationDays: 44,
  },
  {
    id: "channels",
    name: "Channels",
    desc: "Discord、Telegram、Web 渠道接入和可用性治理。",
    phase: "Phase 2/5",
    owner: "Infra",
    deps: ["orchestrator"],
    links: ["config/channels.yaml"],
    keywords: ["discord", "telegram", "channel", "channels", "gateway"],
    baseProgress: 84,
    baseStatus: "in_progress",
    offsetDays: 6,
    durationDays: 40,
  },
  {
    id: "vibe-coding",
    name: "Vibe Coding",
    desc: "自然语言到工程任务编排与自动修复循环。",
    phase: "Phase 5c",
    owner: "Core",
    deps: ["orchestrator"],
    links: ["docs/SAVC功能拓展路线图.md"],
    keywords: ["vibe", "vibcoding", "vibe-coder", "自动修复", "coding"],
    baseProgress: 76,
    baseStatus: "in_progress",
    offsetDays: 10,
    durationDays: 34,
  },
  {
    id: "voice-tts",
    name: "Voice/TTS",
    desc: "消息语音化、语音交互能力与 provider 回退。",
    phase: "Phase 5d",
    owner: "Voice",
    deps: ["channels", "orchestrator"],
    links: ["config/.env.example"],
    keywords: ["tts", "voice", "语音", "elevenlabs", "openai tts", "telnyx", "twilio"],
    baseProgress: 74,
    baseStatus: "in_progress",
    offsetDays: 12,
    durationDays: 36,
  },
  {
    id: "vision",
    name: "Vision",
    desc: "截图理解、图像任务编排与可视化辅助。",
    phase: "Phase 5e",
    owner: "Vision",
    deps: ["orchestrator"],
    links: ["docs/SAVC功能拓展路线图.md"],
    keywords: ["vision", "图像", "screenshot", "视觉", "图片"],
    baseProgress: 70,
    baseStatus: "in_progress",
    offsetDays: 14,
    durationDays: 42,
  },
  {
    id: "live2d",
    name: "Live2D",
    desc: "虚拟形象表情、口型与动作信号联动。",
    phase: "Phase 6",
    owner: "Frontend",
    deps: ["voice-tts"],
    links: ["docs/SAVC功能拓展路线图.md"],
    keywords: ["live2d", "口型", "动作", "avatar", "模型"],
    baseProgress: 66,
    baseStatus: "in_progress",
    offsetDays: 18,
    durationDays: 48,
  },
  {
    id: "savc-ui",
    name: "SAVC-UI",
    desc: "管理界面重构、数据可视化与交互体验升级。",
    phase: "Phase 6 UI",
    owner: "Frontend",
    deps: ["orchestrator", "memory", "persona"],
    links: ["docs/SAVC管理界面重构方案.md"],
    keywords: ["savc-ui", "管理界面", "dashboard", "ui", "view"],
    baseProgress: 81,
    baseStatus: "in_progress",
    offsetDays: 8,
    durationDays: 52,
  },
  {
    id: "automation-tests",
    name: "Automation/Tests",
    desc: "阶段测试脚本、联调验证与回归保障。",
    phase: "Cross Phase",
    owner: "QA",
    deps: ["orchestrator", "memory", "channels"],
    links: ["tests/phase4-test-report.md"],
    keywords: ["test", "验证", "phase", "脚本", "vitest"],
    baseProgress: 87,
    baseStatus: "in_progress",
    offsetDays: 0,
    durationDays: 60,
  },
];

function audioMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".m4a") return "audio/mp4";
  if (ext === ".opus" || ext === ".ogg") return "audio/ogg";
  return "application/octet-stream";
}

function isAllowedAudioPath(filePath: string): boolean {
  if (!path.isAbsolute(filePath)) {
    return false;
  }
  const ext = path.extname(filePath).toLowerCase();
  if (!AUDIO_EXTENSIONS.has(ext)) {
    return false;
  }
  const resolved = path.resolve(filePath);
  const tmpRoot = path.resolve(os.tmpdir());
  return resolved === tmpRoot || resolved.startsWith(`${tmpRoot}${path.sep}`);
}

function json(res: ServerResponse, statusCode: number, payload: unknown) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(body);
}

function sseWrite(res: ServerResponse, event: string, payload: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value.trim();
  }
  return fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asStringList(value: unknown, maxItems = 8): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asString(item))
    .filter((item) => item.length > 0)
    .slice(0, maxItems);
}

function normalizeTaskState(value: unknown, fallback: TaskState = "queued"): TaskState {
  const state = asString(value).toLowerCase() as TaskState;
  if (TASK_STATES.includes(state)) {
    return state;
  }
  return fallback;
}

function normalizeTaskEventSource(value: unknown, fallback: TaskEventSource = "api"): TaskEventSource {
  const source = asString(value).toLowerCase();
  if (source === "api" || source === "demo" || source === "system") {
    return source;
  }
  return fallback;
}

function safeReadUtf8(filePath: string): string {
  try {
    const text = readFileSync(filePath, "utf8");
    if (text.length > MAX_DOC_BYTES) {
      return text.slice(0, MAX_DOC_BYTES);
    }
    return text;
  } catch {
    return "";
  }
}

function safeStat(filePath: string): { mtimeMs: number; isFile: boolean } {
  try {
    const st = statSync(filePath);
    return { mtimeMs: st.mtimeMs, isFile: st.isFile() };
  } catch {
    return { mtimeMs: 0, isFile: false };
  }
}

function relPath(filePath: string): string {
  return path.relative(repoRoot, filePath).replace(/\\/g, "/");
}

function resolveAllowedDocsMarkdownPath(requestedPath: string): string | null {
  const input = requestedPath.trim();
  if (!input || input.includes("\0")) {
    return null;
  }

  const normalizedInput = input.replace(/\\/g, "/");
  const absolute = path.isAbsolute(normalizedInput)
    ? path.resolve(normalizedInput)
    : path.resolve(repoRoot, normalizedInput);
  const docsResolved = path.resolve(docsRoot);
  const insideDocs =
    absolute === docsResolved || absolute.startsWith(`${docsResolved}${path.sep}`);
  if (!insideDocs) {
    return null;
  }
  if (path.extname(absolute).toLowerCase() !== ".md") {
    return null;
  }

  const st = safeStat(absolute);
  if (!st.isFile) {
    return null;
  }

  return absolute;
}

function listMarkdownFiles(rootDir: string): string[] {
  if (!existsSync(rootDir)) return [];
  const results: string[] = [];
  const queue = [rootDir];
  while (queue.length > 0) {
    const current = queue.shift()!;
    let entries: Array<ReturnType<typeof statSync> & { name?: string }> = [];
    try {
      entries = readdirSync(current, { withFileTypes: true }) as Array<ReturnType<typeof statSync> & { name?: string }>;
    } catch {
      continue;
    }
    for (const entry of entries as unknown as Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

function firstHeading(markdown: string, fallback: string): string {
  const lines = markdown.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("# ")) {
      return line.slice(2).trim() || fallback;
    }
  }
  return fallback;
}

function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/[*_~>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function markdownSummary(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("- ") || line.startsWith("* ")) {
      return line.slice(2).trim();
    }
    if (!line.startsWith("#") && !line.startsWith(">")) {
      return line;
    }
  }
  return "暂无摘要";
}

function markdownSections(markdown: string): string[] {
  const out: string[] = [];
  const lines = markdown.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("## ")) {
      out.push(line.slice(3).trim());
    }
  }
  return out.slice(0, 10);
}

function parseDateFromPath(filePath: string): string {
  const base = path.basename(filePath);
  const match = base.match(/(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const st = safeStat(filePath);
  if (st.mtimeMs > 0) return new Date(st.mtimeMs).toISOString().slice(0, 10);
  return "";
}

function inferSource(filePath: string): "codex" | "claude" | "worklog" | "plan" {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.includes("/worklog/codex/")) return "codex";
  if (normalized.includes("/worklog/claude/")) return "claude";
  if (normalized.includes("/worklog/")) return "worklog";
  return "plan";
}

function readWorklogs(): WorklogItem[] {
  const files = listMarkdownFiles(worklogRoot)
    .filter((file) => !file.endsWith("INDEX.md") && !file.endsWith("README.md"));

  const items = files
    .map((file) => {
      const text = safeReadUtf8(file);
      const fileStat = safeStat(file);
      return {
        file: relPath(file),
        date: parseDateFromPath(file),
        source: inferSource(file),
        title: firstHeading(text, path.basename(file, ".md")),
        summary: markdownSummary(text),
        sections: markdownSections(text),
        updatedAt: fileStat.mtimeMs > 0 ? new Date(fileStat.mtimeMs).toISOString() : "",
      } satisfies WorklogItem;
    })
    .sort((a, b) => {
      const bTime = Date.parse(b.updatedAt || "0");
      const aTime = Date.parse(a.updatedAt || "0");
      return bTime - aTime;
    });

  return items;
}

function readPlanDocs(): PlanDocItem[] {
  const files = listMarkdownFiles(docsRoot)
    .filter((file) => !file.includes(`${path.sep}worklog${path.sep}`) && path.basename(file) !== "project-plan-board.md");

  const items = files.map((file) => {
    const text = safeReadUtf8(file);
    const plain = stripMarkdown(text);
    const fileStat = safeStat(file);
    return {
      file: relPath(file),
      title: firstHeading(text, path.basename(file, ".md")),
      excerpt: plain.slice(0, 240),
      updatedAt: fileStat.mtimeMs > 0 ? new Date(fileStat.mtimeMs).toISOString() : "",
    } satisfies PlanDocItem;
  });

  return items.sort((a, b) => Date.parse(b.updatedAt || "0") - Date.parse(a.updatedAt || "0"));
}

function runGit(args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    }).trim();
  } catch {
    return "";
  }
}

function readRepoStatus(): SnapshotRepo {
  const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  const head = runGit(["rev-parse", "--short", "HEAD"]);
  const statusText = runGit(["status", "--porcelain"]);
  const changedFiles = statusText ? statusText.split(/\r?\n/).filter(Boolean).length : 0;

  if (!branch || !head) {
    return {
      branch: "",
      head: "",
      dirty: false,
      changedFiles: 0,
      unavailable: true,
    };
  }

  return {
    branch,
    head,
    dirty: changedFiles > 0,
    changedFiles,
  };
}

function readCommits(limit = 40): CommitItem[] {
  const log = runGit(["log", `--max-count=${limit}`, "--date=iso-strict", "--pretty=format:%h\t%cI\t%an\t%s"]);
  if (!log) return [];

  return log.split(/\r?\n/)
    .map((line) => {
      const [hash = "", date = "", author = "", ...subjectParts] = line.split("\t");
      return {
        hash,
        date,
        author,
        subject: subjectParts.join("\t"),
      } satisfies CommitItem;
    })
    .filter((row) => row.hash && row.date);
}

function countRecentCommits(commits: CommitItem[], days: number): number {
  const now = Date.now();
  const windowMs = days * 24 * 60 * 60 * 1000;
  return commits.filter((commit) => {
    const t = Date.parse(commit.date);
    return Number.isFinite(t) && (now - t) <= windowMs;
  }).length;
}

function containsAny(text: string, keywords: string[]): boolean {
  const lowered = text.toLowerCase();
  return keywords.some((keyword) => lowered.includes(keyword.toLowerCase()));
}

function moduleSignal(blueprint: ModuleBlueprint, logs: WorklogItem[]): {
  mentionCount: number;
  riskScore: number;
  lastUpdate: string;
} {
  let mentionCount = 0;
  let riskScore = 0;
  let lastUpdate = "";
  const riskTokens = ["阻塞", "失败", "error", "fail", "timeout", "未", "warn", "风险"];

  for (const row of logs) {
    const source = `${row.title}\n${row.summary}\n${row.sections.join("\n")}`;
    if (!containsAny(source, blueprint.keywords)) continue;
    mentionCount += 1;
    if (containsAny(source, riskTokens)) {
      riskScore += 1;
    }
    if (!lastUpdate || Date.parse(row.updatedAt || "0") > Date.parse(lastUpdate || "0")) {
      lastUpdate = row.updatedAt;
    }
  }

  return { mentionCount, riskScore, lastUpdate };
}

function buildModules(logs: WorklogItem[], commits: CommitItem[]): ProgressModule[] {
  const commit7d = countRecentCommits(commits, 7);

  return MODULE_BLUEPRINTS.map((blueprint) => {
    const signal = moduleSignal(blueprint, logs);
    const commitBoost = clamp(Math.round(commit7d / 2), 0, 8);
    const mentionBoost = clamp(signal.mentionCount * 2, 0, 12);
    const stagnated = !signal.lastUpdate || (Date.now() - Date.parse(signal.lastUpdate)) > 7 * 24 * 60 * 60 * 1000;

    let progress = clamp(blueprint.baseProgress + mentionBoost + commitBoost, 0, 100);
    let status: ModuleStatus = blueprint.baseStatus;
    if (progress >= 96) {
      status = "done";
      progress = 100;
    } else if (signal.riskScore >= 2) {
      status = "blocked";
      progress = Math.max(progress - 6, 20);
    } else if (signal.mentionCount > 0) {
      status = "in_progress";
    } else if (stagnated && status !== "done") {
      status = "planned";
      progress = Math.max(progress - 10, 10);
    }

    const risk: ModuleRisk =
      status === "blocked" ? "high" : status === "planned" ? "medium" : progress >= 90 ? "low" : "medium";

    return {
      id: blueprint.id,
      name: blueprint.name,
      desc: blueprint.desc,
      status,
      progress,
      phase: blueprint.phase,
      risk,
      owner: blueprint.owner,
      updatedAt: signal.lastUpdate || new Date().toISOString(),
      links: blueprint.links,
      deps: blueprint.deps,
    };
  });
}

function buildGantt(modules: ProgressModule[]): GanttItem[] {
  const now = Date.now();
  const moduleMap = new Map(modules.map((item) => [item.id, item]));

  return MODULE_BLUEPRINTS.map((blueprint) => {
    const moduleState = moduleMap.get(blueprint.id);
    const start = PROJECT_START + blueprint.offsetDays * 24 * 60 * 60 * 1000;
    const end = start + blueprint.durationDays * 24 * 60 * 60 * 1000;
    const elapsedRatio = clamp((now - start) / Math.max(end - start, 1), 0, 1);
    const expected = Math.round(elapsedRatio * 100);
    const progress = moduleState?.progress ?? blueprint.baseProgress;

    let schedule: GanttSchedule = "on_track";
    if ((moduleState?.status ?? "planned") === "blocked") {
      schedule = "risk";
    } else if (now > end && progress < 95) {
      schedule = "delayed";
    } else if (progress + 12 < expected) {
      schedule = "risk";
    }

    const efficiency = clamp(
      Math.round(progress - expected + 65),
      20,
      99,
    );

    return {
      id: blueprint.id,
      name: blueprint.name,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      progress,
      efficiency,
      schedule,
      status: moduleState?.status ?? blueprint.baseStatus,
    };
  });
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractMarkdownSection(block: string, title: string): string {
  const matcher = new RegExp(`###\\s+${escapeRegExp(title)}\\s*\\n([\\s\\S]*?)(?=\\n###\\s+|$)`, "m");
  const match = block.match(matcher);
  if (!match) return "";
  return match[1].trim();
}

function ensurePlanBoardFile() {
  const dir = path.dirname(planBoardPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  if (!existsSync(planBoardPath)) {
    const bootstrap = [
      "# SAVC 项目计划看板",
      "",
      "> 由 progress-hub 自动维护，按时间追加计划记录。",
      "",
    ].join("\n");
    appendFileSync(planBoardPath, bootstrap, "utf8");
  }
}

function readPlanBoard(): {
  nextPlanMd: string;
  correctionPlanMd: string;
  updatedAt: string;
  history: Array<{ timestamp: string; nextPlanMd: string; correctionPlanMd: string }>;
} {
  ensurePlanBoardFile();
  const raw = safeReadUtf8(planBoardPath);
  const blocks = raw
    .split(/\n(?=##\s+)/g)
    .map((item) => item.trim())
    .filter((item) => item.startsWith("## "));

  const history = blocks.map((block) => {
    const head = block.match(/^##\s+([^\n]+)/m);
    return {
      timestamp: head?.[1]?.trim() || "",
      nextPlanMd: extractMarkdownSection(block, "下一步开发计划"),
      correctionPlanMd: extractMarkdownSection(block, "错误更正计划"),
    };
  });

  const latest = history.at(-1) ?? { timestamp: "", nextPlanMd: "", correctionPlanMd: "" };
  const st = safeStat(planBoardPath);

  return {
    nextPlanMd: latest.nextPlanMd,
    correctionPlanMd: latest.correctionPlanMd,
    updatedAt: st.mtimeMs > 0 ? new Date(st.mtimeMs).toISOString() : "",
    history: history.reverse(),
  };
}

function appendPlanBoard(nextPlanMd: string, correctionPlanMd: string): { file: string; updatedAt: string } {
  ensurePlanBoardFile();
  const now = new Date();
  const stamp = now.toLocaleString("zh-CN", { hour12: false });
  const block = [
    `## ${stamp}`,
    "",
    "### 下一步开发计划",
    nextPlanMd.trim() || "（空）",
    "",
    "### 错误更正计划",
    correctionPlanMd.trim() || "（空）",
    "",
  ].join("\n");

  appendFileSync(planBoardPath, `${block}\n`, "utf8");
  return {
    file: relPath(planBoardPath),
    updatedAt: now.toISOString(),
  };
}

function buildSnapshot(): ProgressSnapshot {
  const repo = readRepoStatus();
  const worklogs = readWorklogs();
  const planDocs = readPlanDocs();
  const commits = readCommits();
  const modules = buildModules(worklogs, commits);
  const gantt = buildGantt(modules);
  const planBoard = readPlanBoard();

  const commit7d = countRecentCommits(commits, 7);
  const activeModuleCount = modules.filter((item) => item.status === "in_progress" || item.status === "blocked").length;
  const doneModuleCount = modules.filter((item) => item.status === "done").length;

  return {
    generatedAt: new Date().toISOString(),
    repo,
    modules,
    gantt,
    worklogs,
    planDocs,
    commits,
    metrics: {
      logCount: worklogs.length,
      commit7d,
      activeModuleCount,
      doneModuleCount,
    },
    planBoard: {
      file: relPath(planBoardPath),
      nextPlanMd: planBoard.nextPlanMd,
      correctionPlanMd: planBoard.correctionPlanMd,
      updatedAt: planBoard.updatedAt,
      history: planBoard.history,
    },
  };
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Uint8Array[] = [];
  return await new Promise((resolve, reject) => {
    req.on("data", (chunk) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    req.on("error", reject);
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      resolve(body);
    });
  });
}

function selectWatchTargets(): string[] {
  const targets = [
    docsRoot,
    worklogRoot,
    path.resolve(worklogRoot, "claude"),
    path.resolve(worklogRoot, "codex"),
    path.resolve(repoRoot, ".git", "HEAD"),
    path.resolve(repoRoot, ".git", "logs", "HEAD"),
  ];
  return targets.filter((item) => existsSync(item));
}

export default defineConfig({
  base: "./",
  publicDir: path.resolve(here, "public"),
  plugins: [
    {
      name: "savc-dev-tts-file-proxy",
      configureServer(server) {
        server.middlewares.use("/__savc/tts-file", (req, res) => {
          try {
            const url = new URL(req.url || "", "http://127.0.0.1");
            const requestedPath = url.searchParams.get("path")?.trim() || "";
            if (!requestedPath) {
              res.statusCode = 400;
              res.end("missing path");
              return;
            }
            if (!isAllowedAudioPath(requestedPath)) {
              res.statusCode = 403;
              res.end("forbidden");
              return;
            }
            const fileStat = statSync(requestedPath);
            if (!fileStat.isFile()) {
              res.statusCode = 404;
              res.end("not found");
              return;
            }
            if (fileStat.size > 10 * 1024 * 1024) {
              res.statusCode = 413;
              res.end("audio too large");
              return;
            }
            const body = readFileSync(requestedPath);
            res.statusCode = 200;
            res.setHeader("Content-Type", audioMimeType(requestedPath));
            res.setHeader("Cache-Control", "no-store");
            res.end(body);
          } catch {
            res.statusCode = 500;
            res.end("proxy error");
          }
        });
      },
    },
    {
      name: "savc-dev-progress-hub",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const rawUrl = req.url || "";
          const pathname = rawUrl.split("?")[0];
          if (pathname === "/progress-hub" || pathname === "/progress-hub/") {
            res.statusCode = 302;
            res.setHeader("Location", "/progress-hub/index.html");
            res.end();
            return;
          }
          next();
        });

        const clients = new Set<ServerResponse>();
        const runtimeClients = new Map<ServerResponse, { taskId: string }>();
        const runtimeTasks = new Map<string, RuntimeTask>();
        const runtimeEvents: RuntimeTaskEvent[] = [];
        const runtimeDemoTimers = new Set<ReturnType<typeof setTimeout>>();
        const watchers: FSWatcher[] = [];
        let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        let snapshotCache: { at: number; payload: ProgressSnapshot } | null = null;
        let runtimeSeq = 0;

        const getSnapshot = (force = false): ProgressSnapshot => {
          if (!force && snapshotCache && Date.now() - snapshotCache.at <= SNAPSHOT_CACHE_MS) {
            return snapshotCache.payload;
          }
          const payload = buildSnapshot();
          snapshotCache = { at: Date.now(), payload };
          return payload;
        };

        const sendSnapshot = (res: ServerResponse, force = false) => {
          const snapshot = getSnapshot(force);
          sseWrite(res, "snapshot", snapshot);
        };

        const createRuntimeTaskId = (): string =>
          `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

        const runtimeMetrics = (rows: RuntimeTask[]): RuntimeTaskSnapshot["metrics"] => {
          const metrics: RuntimeTaskSnapshot["metrics"] = {
            total: rows.length,
            queued: 0,
            running: 0,
            retry: 0,
            succeeded: 0,
            failed: 0,
            canceled: 0,
          };
          for (const task of rows) {
            metrics[task.status] += 1;
          }
          return metrics;
        };

        const runtimeSnapshot = (taskId = ""): RuntimeTaskSnapshot => {
          const allTasks = Array.from(runtimeTasks.values())
            .sort((a, b) => Date.parse(b.updatedAt || "0") - Date.parse(a.updatedAt || "0"));
          const allEvents = runtimeEvents;
          const filteredTasks = taskId ? allTasks.filter((task) => task.id === taskId) : allTasks;
          const filteredEvents = taskId
            ? allEvents.filter((event) => event.taskId === taskId).slice(0, 120)
            : allEvents.slice(0, 120);
          return {
            generatedAt: new Date().toISOString(),
            tasks: filteredTasks,
            recentEvents: filteredEvents,
            metrics: runtimeMetrics(filteredTasks),
          };
        };

        const closeRuntimeClient = (client: ServerResponse) => {
          runtimeClients.delete(client);
          try {
            client.end();
          } catch {
            // no-op
          }
        };

        const sendRuntimeSnapshot = (client: ServerResponse, taskId = "") => {
          sseWrite(client, "task_snapshot", runtimeSnapshot(taskId));
        };

        const sendRuntimeEvent = (client: ServerResponse, event: RuntimeTaskEvent) => {
          sseWrite(client, "task_event", event);
        };

        const broadcastRuntimeEvent = (event: RuntimeTaskEvent) => {
          for (const [client, filter] of runtimeClients.entries()) {
            if (client.writableEnded) {
              runtimeClients.delete(client);
              continue;
            }
            if (filter.taskId && filter.taskId !== event.taskId) {
              continue;
            }
            try {
              sendRuntimeEvent(client, event);
            } catch {
              closeRuntimeClient(client);
            }
          }
        };

        const broadcastRuntimeHeartbeat = () => {
          const beat = { timestamp: new Date().toISOString() };
          for (const [client] of runtimeClients.entries()) {
            if (client.writableEnded) {
              runtimeClients.delete(client);
              continue;
            }
            try {
              sseWrite(client, "ping", beat);
            } catch {
              closeRuntimeClient(client);
            }
          }
        };

        const pushRuntimeEvent = (
          task: RuntimeTask,
          state: TaskState,
          options?: {
            message?: string;
            progress?: number;
            actor?: string;
            source?: TaskEventSource;
          },
        ): RuntimeTaskEvent => {
          const now = new Date().toISOString();
          const nextProgress =
            typeof options?.progress === "number"
              ? clamp(options.progress, 0, 100)
              : state === "succeeded"
                ? 100
                : task.progress;
          task.status = state;
          task.progress = nextProgress;
          task.updatedAt = now;
          task.lastMessage = asString(options?.message) || task.lastMessage || "";

          const event: RuntimeTaskEvent = {
            id: `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            seq: ++runtimeSeq,
            taskId: task.id,
            state,
            progress: task.progress,
            message: task.lastMessage || `task ${state}`,
            owner: task.owner,
            channel: task.channel,
            actor: asString(options?.actor, "savc-runtime"),
            source: options?.source ?? "api",
            attempt: task.attempt,
            maxAttempts: task.maxAttempts,
            timestamp: now,
          };
          runtimeEvents.unshift(event);
          if (runtimeEvents.length > TASK_EVENT_BUFFER_LIMIT) {
            runtimeEvents.splice(TASK_EVENT_BUFFER_LIMIT);
          }
          broadcastRuntimeEvent(event);
          return event;
        };

        const createRuntimeTask = (payload: Record<string, unknown>, source: TaskEventSource): RuntimeTask => {
          const now = new Date().toISOString();
          const taskId = asString(payload.taskId) || createRuntimeTaskId();
          const maxAttempts = Math.max(1, Math.floor(asNumber(payload.maxAttempts, 3)));
          const task: RuntimeTask = {
            id: taskId,
            title: asString(payload.title) || "未命名任务",
            status: "queued",
            progress: clamp(asNumber(payload.progress, 0), 0, 100),
            owner: asString(payload.owner, "yuanyuan") || "yuanyuan",
            channel: asString(payload.channel, "telegram") || "telegram",
            attempt: Math.max(1, Math.floor(asNumber(payload.attempt, 1))),
            maxAttempts,
            tags: asStringList(payload.tags),
            metadata: asRecord(payload.metadata),
            createdAt: now,
            updatedAt: now,
            lastMessage: asString(payload.message, "任务已创建并等待执行"),
          };
          runtimeTasks.set(task.id, task);
          pushRuntimeEvent(task, "queued", {
            message: task.lastMessage,
            actor: asString(payload.actor, "api"),
            source,
          });
          return task;
        };

        const broadcast = (force = false) => {
          if (clients.size === 0) return;
          for (const client of clients) {
            if (client.writableEnded) {
              clients.delete(client);
              continue;
            }
            try {
              sendSnapshot(client, force);
            } catch {
              clients.delete(client);
              try {
                client.end();
              } catch {
                // no-op
              }
            }
          }
        };

        const scheduleBroadcast = () => {
          if (debounceTimer) return;
          debounceTimer = setTimeout(() => {
            debounceTimer = null;
            broadcast(true);
          }, 250);
        };

        for (const target of selectWatchTargets()) {
          try {
            const watcher = watch(target, { persistent: false }, () => {
              scheduleBroadcast();
            });
            watchers.push(watcher);
          } catch {
            // ignore non-watchable paths
          }
        }

        heartbeatTimer = setInterval(() => {
          broadcast(true);
          broadcastRuntimeHeartbeat();
        }, SSE_HEARTBEAT_MS);

        const cleanup = () => {
          for (const watcher of watchers) {
            try {
              watcher.close();
            } catch {
              // no-op
            }
          }
          watchers.length = 0;
          if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
          }
          if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
          }
          for (const timer of runtimeDemoTimers) {
            clearTimeout(timer);
          }
          runtimeDemoTimers.clear();
          for (const client of clients) {
            try {
              client.end();
            } catch {
              // no-op
            }
          }
          clients.clear();
          for (const [client] of runtimeClients.entries()) {
            closeRuntimeClient(client);
          }
          runtimeClients.clear();
        };

        server.httpServer?.once("close", cleanup);

        server.middlewares.use("/__savc/progress/snapshot", (req, res) => {
          if ((req.method || "GET").toUpperCase() !== "GET") {
            res.statusCode = 405;
            res.end("method not allowed");
            return;
          }

          try {
            const payload = getSnapshot();
            json(res, 200, payload);
          } catch (error) {
            json(res, 500, {
              error: "snapshot_failed",
              message: error instanceof Error ? error.message : String(error),
            });
          }
        });

        server.middlewares.use("/__savc/progress/file", (req, res) => {
          if ((req.method || "GET").toUpperCase() !== "GET") {
            res.statusCode = 405;
            res.end("method not allowed");
            return;
          }

          try {
            const url = new URL(req.url || "", "http://127.0.0.1");
            const requestedPath = url.searchParams.get("path")?.trim() || "";
            if (!requestedPath) {
              json(res, 400, {
                ok: false,
                error: "missing_path",
              });
              return;
            }

            const fullPath = resolveAllowedDocsMarkdownPath(requestedPath);
            if (!fullPath) {
              json(res, 404, {
                ok: false,
                error: "file_not_found_or_forbidden",
              });
              return;
            }

            const content = safeReadUtf8(fullPath);
            const fileStat = safeStat(fullPath);
            json(res, 200, {
              ok: true,
              file: relPath(fullPath),
              title: firstHeading(content, path.basename(fullPath, ".md")),
              content,
              updatedAt: fileStat.mtimeMs > 0 ? new Date(fileStat.mtimeMs).toISOString() : "",
            });
          } catch (error) {
            json(res, 500, {
              ok: false,
              error: "file_read_failed",
              message: error instanceof Error ? error.message : String(error),
            });
          }
        });

        server.middlewares.use("/__savc/progress/stream", (req, res) => {
          if ((req.method || "GET").toUpperCase() !== "GET") {
            res.statusCode = 405;
            res.end("method not allowed");
            return;
          }

          res.statusCode = 200;
          res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
          res.setHeader("Cache-Control", "no-store, no-transform");
          res.setHeader("Connection", "keep-alive");
          res.setHeader("X-Accel-Buffering", "no");
          res.write("retry: 3000\n\n");

          clients.add(res);
          sendSnapshot(res, true);

          req.on("close", () => {
            clients.delete(res);
          });
        });

        server.middlewares.use("/__savc/task-runtime/snapshot", (req, res) => {
          if ((req.method || "GET").toUpperCase() !== "GET") {
            res.statusCode = 405;
            res.end("method not allowed");
            return;
          }

          try {
            const url = new URL(req.url || "", "http://127.0.0.1");
            const taskId = asString(url.searchParams.get("taskId"));
            json(res, 200, {
              ok: true,
              ...runtimeSnapshot(taskId),
            });
          } catch (error) {
            json(res, 500, {
              ok: false,
              error: "task_snapshot_failed",
              message: error instanceof Error ? error.message : String(error),
            });
          }
        });

        server.middlewares.use("/__savc/task-runtime/stream", (req, res) => {
          if ((req.method || "GET").toUpperCase() !== "GET") {
            res.statusCode = 405;
            res.end("method not allowed");
            return;
          }

          const url = new URL(req.url || "", "http://127.0.0.1");
          const taskId = asString(url.searchParams.get("taskId"));
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
          res.setHeader("Cache-Control", "no-store, no-transform");
          res.setHeader("Connection", "keep-alive");
          res.setHeader("X-Accel-Buffering", "no");
          res.write(`retry: ${TASK_STREAM_RETRY_MS}\n\n`);

          runtimeClients.set(res, { taskId });
          sendRuntimeSnapshot(res, taskId);

          req.on("close", () => {
            runtimeClients.delete(res);
          });
        });

        server.middlewares.use("/__savc/task-runtime/create", async (req, res) => {
          if ((req.method || "GET").toUpperCase() !== "POST") {
            res.statusCode = 405;
            res.end("method not allowed");
            return;
          }

          try {
            const bodyRaw = await readRequestBody(req);
            const body = bodyRaw ? asRecord(JSON.parse(bodyRaw)) : {};
            const requestedTaskId = asString(body.taskId);
            if (requestedTaskId && runtimeTasks.has(requestedTaskId)) {
              json(res, 409, {
                ok: false,
                error: "task_id_exists",
                taskId: requestedTaskId,
              });
              return;
            }
            const source = normalizeTaskEventSource(body.source, "api");
            const task = createRuntimeTask(body, source);
            json(res, 200, {
              ok: true,
              task,
            });
          } catch (error) {
            json(res, 500, {
              ok: false,
              error: "task_create_failed",
              message: error instanceof Error ? error.message : String(error),
            });
          }
        });

        server.middlewares.use("/__savc/task-runtime/control", async (req, res) => {
          if ((req.method || "GET").toUpperCase() !== "POST") {
            res.statusCode = 405;
            res.end("method not allowed");
            return;
          }

          try {
            const bodyRaw = await readRequestBody(req);
            const body = bodyRaw ? asRecord(JSON.parse(bodyRaw)) : {};
            const taskId = asString(body.taskId);
            if (!taskId) {
              json(res, 400, {
                ok: false,
                error: "missing_task_id",
              });
              return;
            }

            const task = runtimeTasks.get(taskId);
            if (!task) {
              json(res, 404, {
                ok: false,
                error: "task_not_found",
                taskId,
              });
              return;
            }

            const state = normalizeTaskState(body.action, "queued");
            if (state === "queued") {
              json(res, 400, {
                ok: false,
                error: "unsupported_action",
                expected: ["running", "retry", "succeeded", "failed", "canceled"],
              });
              return;
            }

            if (state === "retry") {
              task.attempt = Math.min(task.attempt + 1, 999);
              task.maxAttempts = Math.max(task.maxAttempts, task.attempt);
            }

            const defaultMessages: Record<Exclude<TaskState, "queued">, string> = {
              running: "任务执行中",
              retry: `任务重试中（第 ${task.attempt} 次）`,
              succeeded: "任务执行成功",
              failed: "任务执行失败",
              canceled: "任务已取消",
            };

            const hasProgress = body.progress !== undefined && body.progress !== null && String(body.progress).trim() !== "";
            let nextProgress = hasProgress ? asNumber(body.progress, task.progress) : undefined;
            if (nextProgress === undefined && state === "running") {
              nextProgress = Math.max(task.progress, 5);
            }
            if (nextProgress === undefined && state === "retry") {
              nextProgress = Math.max(task.progress, 12);
            }
            if (state === "succeeded") {
              nextProgress = 100;
            }

            const event = pushRuntimeEvent(task, state, {
              message: asString(body.message) || defaultMessages[state],
              progress: nextProgress,
              actor: asString(body.actor, "api"),
              source: normalizeTaskEventSource(body.source, "api"),
            });
            json(res, 200, {
              ok: true,
              task,
              event,
            });
          } catch (error) {
            json(res, 500, {
              ok: false,
              error: "task_control_failed",
              message: error instanceof Error ? error.message : String(error),
            });
          }
        });

        server.middlewares.use("/__savc/task-runtime/demo", async (req, res) => {
          if ((req.method || "GET").toUpperCase() !== "POST") {
            res.statusCode = 405;
            res.end("method not allowed");
            return;
          }

          try {
            const bodyRaw = await readRequestBody(req);
            const body = bodyRaw ? asRecord(JSON.parse(bodyRaw)) : {};
            const mode = asString(body.mode, "retry-success");
            const task = createRuntimeTask({
              title: asString(body.title, "Yuanyuan 调度任务联调"),
              owner: asString(body.owner, "yuanyuan"),
              channel: asString(body.channel, "telegram"),
              maxAttempts: asNumber(body.maxAttempts, 3),
              tags: Array.isArray(body.tags) ? body.tags : ["demo", "runtime"],
              metadata: asRecord(body.metadata),
              actor: "demo-runner",
              message: "Demo 任务创建成功，等待调度",
            }, "demo");

            const flowByMode: Record<string, Array<{ delay: number; state: Exclude<TaskState, "queued">; message: string; progress?: number }>> = {
              fail: [
                { delay: 900, state: "running", message: "已接入任务上下文，开始执行", progress: 14 },
                { delay: 2_200, state: "failed", message: "上游模型不可用，任务失败" },
              ],
              success: [
                { delay: 900, state: "running", message: "已接入任务上下文，开始执行", progress: 18 },
                { delay: 2_300, state: "running", message: "子 Agent 已返回核心结果", progress: 68 },
                { delay: 3_800, state: "succeeded", message: "已聚合完成并回传前端" },
              ],
              "retry-success": [
                { delay: 900, state: "running", message: "已接入任务上下文，开始执行", progress: 12 },
                { delay: 2_000, state: "retry", message: "首轮响应超时，触发重试", progress: 26 },
                { delay: 3_200, state: "running", message: "重试链路恢复，继续执行", progress: 70 },
                { delay: 4_500, state: "succeeded", message: "重试后执行成功，完成回传" },
              ],
            };

            const flow = flowByMode[mode] || flowByMode["retry-success"];
            for (const step of flow) {
              const timer = setTimeout(() => {
                runtimeDemoTimers.delete(timer);
                const liveTask = runtimeTasks.get(task.id);
                if (!liveTask) return;
                if (liveTask.status === "canceled" || liveTask.status === "failed" || liveTask.status === "succeeded") {
                  return;
                }
                if (step.state === "retry") {
                  liveTask.attempt = Math.min(liveTask.attempt + 1, 999);
                  liveTask.maxAttempts = Math.max(liveTask.maxAttempts, liveTask.attempt);
                }
                pushRuntimeEvent(liveTask, step.state, {
                  message: step.message,
                  progress: step.progress,
                  actor: "demo-runner",
                  source: "demo",
                });
              }, step.delay);
              runtimeDemoTimers.add(timer);
            }

            json(res, 200, {
              ok: true,
              task,
              mode,
            });
          } catch (error) {
            json(res, 500, {
              ok: false,
              error: "task_demo_failed",
              message: error instanceof Error ? error.message : String(error),
            });
          }
        });

        server.middlewares.use("/__savc/progress/plan", async (req, res) => {
          if ((req.method || "GET").toUpperCase() !== "POST") {
            res.statusCode = 405;
            res.end("method not allowed");
            return;
          }

          try {
            const bodyRaw = await readRequestBody(req);
            const body = bodyRaw ? JSON.parse(bodyRaw) as Record<string, unknown> : {};
            const nextPlanMd = typeof body.nextPlanMd === "string" ? body.nextPlanMd : "";
            const correctionPlanMd = typeof body.correctionPlanMd === "string" ? body.correctionPlanMd : "";

            const result = appendPlanBoard(nextPlanMd, correctionPlanMd);
            snapshotCache = null;
            broadcast(true);
            json(res, 200, {
              ok: true,
              file: result.file,
              updatedAt: result.updatedAt,
            });
          } catch (error) {
            json(res, 500, {
              ok: false,
              error: "plan_write_failed",
              message: error instanceof Error ? error.message : String(error),
            });
          }
        });

        // ─── Phase 1: Read-only File Browser & Git ────────────────────────

        // GET /__savc/fs/tree?path=&depth=
        server.middlewares.use("/__savc/fs/tree", (req, res) => {
          if ((req.method || "GET").toUpperCase() !== "GET") {
            res.statusCode = 405; res.end("method not allowed"); return;
          }
          try {
            const url = new URL(req.url || "", "http://127.0.0.1");
            const relBase = url.searchParams.get("path")?.trim() || ".";
            const maxDepth = Math.min(parseInt(url.searchParams.get("depth") || "3", 10), 4);
            const absBase = path.resolve(repoRoot, relBase);
            if (!absBase.startsWith(repoRoot)) {
              json(res, 403, { ok: false, error: "forbidden" }); return;
            }

            const statusMap: Record<string, string> = {};
            try {
              const porcelain = runGit(["status", "--porcelain=v1"]).trim();
              for (const line of porcelain.split("\n")) {
                if (!line) continue;
                const x = line[0], y = line[1];
                const file = line.slice(3).trim().replace(/^"(.*)"$/, "$1").split(" -> ").pop() || "";
                if (x === "?" && y === "?") { statusMap[file] = "U"; continue; }
                if (x && x !== " ") statusMap[file] = x;
                else if (y && y !== " ") statusMap[file] = y;
              }
            } catch { /* git not available */ }

            const IGNORE = new Set([".git", "node_modules", ".cache", "dist", ".turbo"]);

            type FsTreeNode = {
              name: string; path: string; type: "file" | "dir";
              size?: number; gitStatus?: string | null; children?: FsTreeNode[];
            };

            function buildTree(absDir: string, relDir: string, depth: number): FsTreeNode[] {
              if (depth < 0) return [];
              let entries: string[] = [];
              try { entries = readdirSync(absDir); } catch { return []; }
              const nodes: FsTreeNode[] = [];
              for (const name of entries.sort()) {
                if (IGNORE.has(name) || name.startsWith(".")) continue;
                const absEntry = path.join(absDir, name);
                const relEntry = relDir ? relDir + "/" + name : name;
                let st;
                try { st = statSync(absEntry); } catch { continue; }
                if (st.isDirectory()) {
                  nodes.push({ name, path: relEntry, type: "dir", children: buildTree(absEntry, relEntry, depth - 1) });
                } else {
                  nodes.push({ name, path: relEntry, type: "file", size: st.size, gitStatus: statusMap[relEntry] || null });
                }
              }
              return nodes;
            }

            json(res, 200, { ok: true, tree: buildTree(absBase, relBase === "." ? "" : relBase, maxDepth) });
          } catch (error) {
            json(res, 500, { ok: false, error: "tree_failed", message: error instanceof Error ? error.message : String(error) });
          }
        });

        // GET /__savc/fs/read?path=
        server.middlewares.use("/__savc/fs/read", (req, res) => {
          if ((req.method || "GET").toUpperCase() !== "GET") {
            res.statusCode = 405; res.end("method not allowed"); return;
          }
          try {
            const url = new URL(req.url || "", "http://127.0.0.1");
            const reqPath = url.searchParams.get("path")?.trim() || "";
            if (!reqPath) { json(res, 400, { ok: false, error: "missing_path" }); return; }
            const absPath = path.resolve(repoRoot, reqPath);
            if (!absPath.startsWith(repoRoot)) { json(res, 403, { ok: false, error: "forbidden" }); return; }
            if (!existsSync(absPath)) { json(res, 404, { ok: false, error: "not_found" }); return; }
            const st = statSync(absPath);
            if (!st.isFile()) { json(res, 400, { ok: false, error: "not_a_file" }); return; }
            if (st.size > 512 * 1024) { json(res, 413, { ok: false, error: "file_too_large" }); return; }
            const EXT_LANG: Record<string, string> = {
              ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
              html: "html", htm: "html", css: "css", scss: "css",
              md: "markdown", markdown: "markdown",
              json: "json", yaml: "yaml", yml: "yaml",
              sh: "shell", mjs: "javascript", cjs: "javascript",
            };
            const ext = path.extname(absPath).slice(1).toLowerCase();
            json(res, 200, {
              ok: true, path: reqPath,
              content: readFileSync(absPath, "utf-8"),
              language: EXT_LANG[ext] || "plaintext",
              size: st.size, updatedAt: new Date(st.mtimeMs).toISOString(),
            });
          } catch (error) {
            json(res, 500, { ok: false, error: "read_failed", message: error instanceof Error ? error.message : String(error) });
          }
        });

        // GET /__savc/git/status
        server.middlewares.use("/__savc/git/status", (req, res) => {
          if ((req.method || "GET").toUpperCase() !== "GET") {
            res.statusCode = 405; res.end("method not allowed"); return;
          }
          try {
            const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]).trim();
            let head = "";
            try { head = runGit(["rev-parse", "--short", "HEAD"]).trim(); } catch { /* empty repo */ }
            const porcelain = runGit(["status", "--porcelain=v1"]).trim();
            const staged: string[] = [], unstaged: string[] = [], untracked: string[] = [];
            for (const line of porcelain.split("\n")) {
              if (!line) continue;
              const x = line[0], y = line[1];
              const file = line.slice(3).trim().replace(/^"(.*)"$/, "$1").split(" -> ").pop() || "";
              if (x === "?" && y === "?") { untracked.push(file); continue; }
              if (x && x !== " ") staged.push(file);
              if (y && y !== " ") unstaged.push(file);
            }
            json(res, 200, { ok: true, branch, head, staged, unstaged, untracked });
          } catch (error) {
            json(res, 500, { ok: false, error: "git_status_failed", message: error instanceof Error ? error.message : String(error) });
          }
        });

        // GET /__savc/git/log?n=
        server.middlewares.use("/__savc/git/log", (req, res) => {
          if ((req.method || "GET").toUpperCase() !== "GET") {
            res.statusCode = 405; res.end("method not allowed"); return;
          }
          try {
            const url = new URL(req.url || "", "http://127.0.0.1");
            const n = Math.min(parseInt(url.searchParams.get("n") || "20", 10), 100);
            json(res, 200, { ok: true, commits: readCommits(n) });
          } catch (error) {
            json(res, 500, { ok: false, error: "git_log_failed", message: error instanceof Error ? error.message : String(error) });
          }
        });

        // GET /__savc/git/diff?path=
        server.middlewares.use("/__savc/git/diff", (req, res) => {
          if ((req.method || "GET").toUpperCase() !== "GET") {
            res.statusCode = 405; res.end("method not allowed"); return;
          }
          try {
            const url = new URL(req.url || "", "http://127.0.0.1");
            const reqPath = url.searchParams.get("path")?.trim() || "";
            const args = reqPath ? ["diff", "HEAD", "--", reqPath] : ["diff", "HEAD"];
            json(res, 200, { ok: true, diff: runGit(args) });
          } catch (error) {
            json(res, 500, { ok: false, error: "git_diff_failed", message: error instanceof Error ? error.message : String(error) });
          }
        });

        // ─── Phase 2: Write Operations ────────────────────────────────────

        const WRITE_EXT_ALLOW = new Set(["ts","tsx","js","mjs","cjs","jsx","html","htm","css","scss","md","yaml","yml","json","sh","txt"]);

        // POST /__savc/fs/write   body: { path, content }
        server.middlewares.use("/__savc/fs/write", async (req, res) => {
          if ((req.method || "GET").toUpperCase() !== "POST") {
            res.statusCode = 405; res.end("method not allowed"); return;
          }
          try {
            const bodyRaw = await readRequestBody(req);
            const body = bodyRaw ? JSON.parse(bodyRaw) as Record<string, unknown> : {};
            const reqPath = typeof body.path === "string" ? body.path.trim() : "";
            const content = typeof body.content === "string" ? body.content : null;
            if (!reqPath || content === null) { json(res, 400, { ok: false, error: "missing_path_or_content" }); return; }
            const absPath = path.resolve(repoRoot, reqPath);
            if (!absPath.startsWith(repoRoot)) { json(res, 403, { ok: false, error: "forbidden" }); return; }
            const ext = path.extname(absPath).slice(1).toLowerCase();
            if (!WRITE_EXT_ALLOW.has(ext)) { json(res, 400, { ok: false, error: "extension_not_allowed" }); return; }
            if (content.length > 2 * 1024 * 1024) { json(res, 413, { ok: false, error: "content_too_large" }); return; }
            const dir = path.dirname(absPath);
            if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
            writeFileSync(absPath, content, "utf-8");
            const st = statSync(absPath);
            json(res, 200, { ok: true, path: reqPath, size: st.size, updatedAt: new Date(st.mtimeMs).toISOString() });
          } catch (error) {
            json(res, 500, { ok: false, error: "write_failed", message: error instanceof Error ? error.message : String(error) });
          }
        });

        // POST /__savc/git/add   body: { paths: string[] }
        server.middlewares.use("/__savc/git/add", async (req, res) => {
          if ((req.method || "GET").toUpperCase() !== "POST") {
            res.statusCode = 405; res.end("method not allowed"); return;
          }
          try {
            const bodyRaw = await readRequestBody(req);
            const body = bodyRaw ? JSON.parse(bodyRaw) as Record<string, unknown> : {};
            const paths = Array.isArray(body.paths) ? body.paths.filter((p): p is string => typeof p === "string") : [];
            if (!paths.length) { json(res, 400, { ok: false, error: "missing_paths" }); return; }
            // Validate all paths stay in repoRoot
            for (const p of paths) {
              if (!path.resolve(repoRoot, p).startsWith(repoRoot)) { json(res, 403, { ok: false, error: "forbidden", path: p }); return; }
            }
            execFileSync("git", ["add", "--", ...paths], { cwd: repoRoot });
            json(res, 200, { ok: true });
          } catch (error) {
            json(res, 500, { ok: false, error: "git_add_failed", message: error instanceof Error ? error.message : String(error) });
          }
        });

        // POST /__savc/git/commit   body: { message }
        server.middlewares.use("/__savc/git/commit", async (req, res) => {
          if ((req.method || "GET").toUpperCase() !== "POST") {
            res.statusCode = 405; res.end("method not allowed"); return;
          }
          try {
            const bodyRaw = await readRequestBody(req);
            const body = bodyRaw ? JSON.parse(bodyRaw) as Record<string, unknown> : {};
            const message = typeof body.message === "string" ? body.message.trim() : "";
            if (!message) { json(res, 400, { ok: false, error: "missing_message" }); return; }
            const out = execFileSync("git", ["commit", "-m", message], { cwd: repoRoot, encoding: "utf-8" });
            const hash = runGit(["rev-parse", "--short", "HEAD"]).trim();
            json(res, 200, { ok: true, hash, output: out });
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            json(res, 400, { ok: false, error: "git_commit_failed", message: msg });
          }
        });

        // GET /__savc/fs/search?q=&path=
        server.middlewares.use("/__savc/fs/search", (req, res) => {
          if ((req.method || "GET").toUpperCase() !== "GET") {
            res.statusCode = 405; res.end("method not allowed"); return;
          }
          try {
            const url = new URL(req.url || "", "http://127.0.0.1");
            const q = url.searchParams.get("q")?.trim() || "";
            const searchPath = url.searchParams.get("path")?.trim() || ".";
            if (!q) { json(res, 400, { ok: false, error: "missing_q" }); return; }
            if (!path.resolve(repoRoot, searchPath).startsWith(repoRoot)) { json(res, 403, { ok: false, error: "forbidden" }); return; }
            let raw = "";
            try {
              raw = execFileSync("git", ["grep", "-n", "-i", q, "--", searchPath], { cwd: repoRoot, encoding: "utf-8", maxBuffer: 1024 * 512 });
            } catch (e: unknown) {
              // exit code 1 = no matches (not an error)
              if ((e as NodeJS.ErrnoException).status !== 1) throw e;
            }
            const results = raw.trim().split("\n").filter(Boolean).slice(0, 200).map(line => {
              const colon1 = line.indexOf(":");
              const colon2 = line.indexOf(":", colon1 + 1);
              return { file: line.slice(0, colon1), line: parseInt(line.slice(colon1 + 1, colon2), 10), text: line.slice(colon2 + 1) };
            });
            json(res, 200, { ok: true, results });
          } catch (error) {
            json(res, 500, { ok: false, error: "search_failed", message: error instanceof Error ? error.message : String(error) });
          }
        });

        // ─── Phase 3: Interactive Terminal (WebSocket PTY) ────────────────

        // POST /__savc/terminal/exec   body: { cmd, cwd?, timeoutMs? }
        // Non-interactive fallback for whitelisted commands
        server.middlewares.use("/__savc/terminal/exec", async (req, res) => {
          if ((req.method || "GET").toUpperCase() !== "POST") {
            res.statusCode = 405; res.end("method not allowed"); return;
          }
          try {
            const bodyRaw = await readRequestBody(req);
            const body = bodyRaw ? JSON.parse(bodyRaw) as Record<string, unknown> : {};
            const cmd = Array.isArray(body.cmd) ? body.cmd.filter((c): c is string => typeof c === "string") : [];
            if (!cmd.length) { json(res, 400, { ok: false, error: "missing_cmd" }); return; }
            const ALLOWED_CMDS = new Set(["git","pnpm","node","ls","cat","echo","which","pwd","curl","wc","head","tail"]);
            if (!ALLOWED_CMDS.has(cmd[0])) { json(res, 403, { ok: false, error: "cmd_not_allowed" }); return; }
            const cwd = typeof body.cwd === "string" && body.cwd ? path.resolve(repoRoot, body.cwd) : repoRoot;
            if (!cwd.startsWith(repoRoot)) { json(res, 403, { ok: false, error: "forbidden_cwd" }); return; }
            const timeoutMs = typeof body.timeoutMs === "number" ? Math.min(body.timeoutMs, 30000) : 15000;
            const stdout = execFileSync(cmd[0], cmd.slice(1), { cwd, encoding: "utf-8", timeout: timeoutMs, maxBuffer: 512 * 1024 });
            json(res, 200, { ok: true, stdout, stderr: "", exitCode: 0 });
          } catch (error) {
            const e = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; status?: number };
            json(res, 200, { ok: false, stdout: e.stdout || "", stderr: e.stderr || e.message || "", exitCode: e.status ?? 1 });
          }
        });

        // WS /__savc/terminal  — full interactive PTY
        if (nodePty && server.httpServer) {
          const ptyMap = new Map<import("node:http").IncomingMessage, ReturnType<typeof nodePty.spawn>>();
          const MAX_PTY = 3;

          server.httpServer.on("upgrade", (req: IncomingMessage, socket: import("node:net").Socket, head: Buffer) => {
            const urlPath = req.url?.split("?")[0] || "";
            if (urlPath !== "/__savc/terminal") return;

            // Only from localhost
            const remoteAddr = req.socket.remoteAddress || "";
            if (!remoteAddr.includes("127.0.0.1") && !remoteAddr.includes("::1") && !remoteAddr.includes("localhost")) {
              socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
              socket.destroy();
              return;
            }
            if (ptyMap.size >= MAX_PTY) {
              socket.write("HTTP/1.1 503 Too Many PTY Sessions\r\n\r\n");
              socket.destroy();
              return;
            }

            // Handshake — minimal WebSocket upgrade
            const key = req.headers["sec-websocket-key"] as string;
            if (!key) { socket.write("HTTP/1.1 400 Bad Request\r\n\r\n"); socket.destroy(); return; }
            const { createHash } = await import("node:crypto");
            const acceptKey = createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
            socket.write([
              "HTTP/1.1 101 Switching Protocols",
              "Upgrade: websocket",
              "Connection: Upgrade",
              `Sec-WebSocket-Accept: ${acceptKey}`,
              "\r\n",
            ].join("\r\n"));

            // Spawn PTY
            const shell = os.platform() === "win32" ? "cmd.exe" : (process.env.SHELL || "/bin/zsh");
            const pty = nodePty.spawn(shell, [], {
              name: "xterm-256color", cols: 220, rows: 50, cwd: repoRoot,
              env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" },
            });
            ptyMap.set(req, pty);

            // PTY → WS (frame data as binary)
            pty.onData((data: string) => {
              if (!socket.writable) return;
              const buf = Buffer.from(data, "utf-8");
              const header = Buffer.alloc(buf.length < 126 ? 2 : buf.length < 65536 ? 4 : 10);
              header[0] = 0x82; // FIN + binary frame
              if (buf.length < 126) {
                header[1] = buf.length;
              } else if (buf.length < 65536) {
                header[1] = 126;
                header.writeUInt16BE(buf.length, 2);
              } else {
                header[1] = 127;
                header.writeBigUInt64BE(BigInt(buf.length), 2);
              }
              try { socket.write(Buffer.concat([header, buf])); } catch { /* closed */ }
            });

            pty.onExit(() => {
              ptyMap.delete(req);
              try {
                const closeFrame = Buffer.from([0x88, 0x02, 0x03, 0xe8]); // 1000 normal close
                socket.write(closeFrame);
                socket.end();
              } catch { /* already closed */ }
            });

            // WS → PTY (unmask and forward)
            let buf = Buffer.alloc(0);
            socket.on("data", (chunk: Buffer) => {
              buf = Buffer.concat([buf, chunk]);
              while (buf.length >= 2) {
                const opcode = buf[0] & 0x0f;
                const masked  = !!(buf[1] & 0x80);
                let payloadLen = buf[1] & 0x7f;
                let offset = 2;
                if (payloadLen === 126) { if (buf.length < 4) break; payloadLen = buf.readUInt16BE(2); offset = 4; }
                else if (payloadLen === 127) { if (buf.length < 10) break; payloadLen = Number(buf.readBigUInt64BE(2)); offset = 10; }
                const total = offset + (masked ? 4 : 0) + payloadLen;
                if (buf.length < total) break;
                const mask = masked ? buf.slice(offset, offset + 4) : null;
                const data = buf.slice(offset + (masked ? 4 : 0), total);
                if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
                if (opcode === 1 || opcode === 2) { try { pty.write(data.toString("utf-8")); } catch { /* closed */ } }
                else if (opcode === 8) { pty.destroy(); socket.end(); }
                buf = buf.slice(total);
              }
            });

            socket.on("close", () => { try { pty.destroy(); } catch { /* already destroyed */ } ptyMap.delete(req); });
            socket.on("error", () => { try { pty.destroy(); } catch { /* */ } ptyMap.delete(req); });
          });
        }

      },
    },
  ],
  build: {
    outDir: path.resolve(here, "dist"),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    host: true,
    port: 5174,
    strictPort: true,
  },
});
