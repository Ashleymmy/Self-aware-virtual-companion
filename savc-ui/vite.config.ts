import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, watch, type FSWatcher } from "node:fs";
import { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const docsRoot = path.resolve(repoRoot, "docs");
const worklogRoot = path.resolve(docsRoot, "worklog");
const planBoardPath = path.resolve(docsRoot, "project-plan-board.md");

const AUDIO_EXTENSIONS = new Set([".mp3", ".opus", ".ogg", ".wav", ".m4a"]);
const MAX_DOC_BYTES = 512 * 1024;
const SNAPSHOT_CACHE_MS = 3_000;
const SSE_HEARTBEAT_MS = 15_000;

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

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
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
        const watchers: FSWatcher[] = [];
        let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        let snapshotCache: { at: number; payload: ProgressSnapshot } | null = null;

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
          res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
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
          for (const client of clients) {
            try {
              client.end();
            } catch {
              // no-op
            }
          }
          clients.clear();
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
