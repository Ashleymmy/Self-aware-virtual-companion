import type {
  ChatResponse,
  ChatSendMessage,
  ContextSnapshot,
  SessionChannel,
  TimelineItem,
  ToolEvent,
  WorkbenchMode,
  WorkbenchPreferences,
  WorkbenchSession,
  WorkbenchSnapshot,
} from "./types.js";

interface InMemoryState {
  sessions: WorkbenchSession[];
  timelines: Map<string, TimelineItem[]>;
  tools: Map<string, ToolEvent[]>;
}

const MODE_LABEL: Record<WorkbenchMode, string> = {
  companion: "陪伴",
  dev: "开发",
  debug: "排障",
  plan: "计划",
};

const MODE_SUMMARY: Record<WorkbenchMode, string[]> = {
  companion: [
    "今天状态不太好，先陪我梳理一下。",
    "你能记住我这周的关键安排吗？",
  ],
  dev: [
    "请把任务拆成可提交的三步，并给命令。",
    "这段接口改动你给个最小可行实现。",
  ],
  debug: [
    "启动后 502，先给我排查顺序。",
    "日志里 timeout，怎么快速定位？",
  ],
  plan: [
    "把这周开发计划整理成执行清单。",
    "给一个风险优先级排序。",
  ],
};

function nowIso(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function inferChannel(mode: WorkbenchMode, index: number): SessionChannel {
  if (mode === "companion") return index % 2 === 0 ? "telegram" : "discord";
  if (mode === "dev") return index % 2 === 0 ? "web" : "discord";
  if (mode === "debug") return index % 2 === 0 ? "web" : "telegram";
  return index % 2 === 0 ? "discord" : "web";
}

function seedSessions(): WorkbenchSession[] {
  const modes: WorkbenchMode[] = ["companion", "dev", "debug", "plan"];
  const sessions: WorkbenchSession[] = [];
  for (const mode of modes) {
    for (let i = 0; i < 3; i += 1) {
      const sessionKey = `session-${mode}-${i}`;
      const examples = MODE_SUMMARY[mode];
      sessions.push({
        sessionKey,
        title: `${MODE_LABEL[mode]} · ${i + 1}`,
        mode,
        channel: inferChannel(mode, i),
        updatedAt: nowIso(-(i + 1) * 26 * 60 * 1000),
        unread: mode === "companion" ? (i % 2 === 0 ? 2 : 0) : i === 0 ? 1 : 0,
        lastMessage: examples[i % examples.length]!,
      });
    }
  }
  return sessions.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

function seedTimeline(session: WorkbenchSession): TimelineItem[] {
  const base = MODE_SUMMARY[session.mode];
  const created = Date.now() - 25 * 60 * 1000;
  return [
    {
      id: makeId("msg"),
      role: "user",
      text: base[0]!,
      createdAt: new Date(created).toISOString(),
    },
    {
      id: makeId("msg"),
      role: "assistant",
      text:
        session.mode === "dev"
          ? "收到。我先给最小可交付方案，再补风险和验证命令。"
          : session.mode === "debug"
            ? "先做最短链路排查：端口监听 -> 网关健康 -> 请求路径。"
            : session.mode === "plan"
              ? "我会先按目标/风险/依赖拆分，再给里程碑。"
              : "我在，我们先把你最在意的一件事放到前面。",
      createdAt: new Date(created + 40 * 1000).toISOString(),
    },
  ];
}

function seedTools(session: WorkbenchSession): ToolEvent[] {
  if (session.mode === "companion") {
    return [
      {
        id: makeId("tool"),
        tool: "memory_search",
        status: "completed",
        startedAt: nowIso(-15 * 60 * 1000),
        endedAt: nowIso(-15 * 60 * 1000 + 800),
        durationMs: 800,
        summary: "检索用户近期偏好与情绪上下文",
      },
    ];
  }

  return [
    {
      id: makeId("tool"),
      tool: "savc_decompose",
      status: "completed",
      startedAt: nowIso(-18 * 60 * 1000),
      endedAt: nowIso(-18 * 60 * 1000 + 640),
      durationMs: 640,
      summary: "任务拆解为 3 个可提交步骤",
    },
    {
      id: makeId("tool"),
      tool: "savc_spawn_expert",
      status: session.mode === "debug" ? "failed" : "completed",
      startedAt: nowIso(-17 * 60 * 1000),
      endedAt: nowIso(-17 * 60 * 1000 + 2140),
      durationMs: 2140,
      summary: "调用 technical agent 执行子任务",
      ...(session.mode === "debug" ? { error: "child session timeout after 2000ms" } : {}),
    },
    {
      id: makeId("tool"),
      tool: "tools/invoke.savc_live2d_signal",
      status: "running",
      startedAt: nowIso(-2 * 60 * 1000),
      summary: "同步交互信号到 Live2D runtime",
    },
  ];
}

export function createDefaultPreferences(): WorkbenchPreferences {
  return {
    modelProfile: "wzw/claude-sonnet-4-20250514",
    fallbackModel: "wzw/claude-haiku-4-5-20251001",
    ttsProvider: "openai",
    ttsVoice: "alloy",
    live2dMode: "auto",
    live2dSensitivity: 0.85,
    defaultMode: "dev",
    autoMemoryRecall: true,
    conciseOutput: true,
  };
}

export function createInitialState(): InMemoryState {
  const sessions = seedSessions();
  const timelines = new Map<string, TimelineItem[]>();
  const tools = new Map<string, ToolEvent[]>();
  for (const session of sessions) {
    timelines.set(session.sessionKey, seedTimeline(session));
    tools.set(session.sessionKey, seedTools(session));
  }
  return { sessions, timelines, tools };
}

function buildContext(mode: WorkbenchMode): ContextSnapshot {
  const memorySeed =
    mode === "debug"
      ? "最近三次错误集中在 dev server 端口与路由"
      : mode === "plan"
        ? "下阶段优先完成统一工作台 W1/W2"
        : mode === "dev"
          ? "用户偏好：先结论后步骤，命令可直接执行"
          : "用户希望语气温柔但不拖沓";

  return {
    memories: [
      { title: "长期偏好", score: 0.92, note: memorySeed },
      { title: "当前会话重点", score: 0.84, note: "统一交互工作台原型推进" },
      { title: "约束条件", score: 0.79, note: "不影响主项目运行，不冲突端口" },
    ],
    docs: [
      {
        file: "docs/SAVC统一交互工作台开发计划.md",
        title: "统一工作台开发计划",
        excerpt: "覆盖 IA、接口、里程碑与验收标准，可直接开工。",
      },
      {
        file: "docs/SAVC管理界面重构方案.md",
        title: "管理界面重构方案",
        excerpt: "可复用视觉与交互设计策略，减少重复建设。",
      },
    ],
    commits: [
      { hash: "a25d4a0", subject: "auto-manage savc-ui service lifecycle", date: nowIso(-26 * 60 * 60 * 1000) },
      { hash: "ca9a1ac", subject: "add standalone progress dashboard", date: nowIso(-29 * 60 * 60 * 1000) },
      { hash: "4457f13", subject: "switch views to gateway-backed data", date: nowIso(-30 * 60 * 60 * 1000) },
    ],
  };
}

function synthesizeAssistant(mode: WorkbenchMode, text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return "我在，给我一个目标我马上开始。";
  }

  if (mode === "dev") {
    return `结论：${trimmed}可以先做最小闭环。\n步骤：1) 明确接口 2) 实现主链路 3) 补验证。\n风险：先看端口/鉴权/回退策略。`;
  }

  if (mode === "debug") {
    return `先定位：复现 -> 最短链路日志 -> 假设验证。\n针对“${trimmed}”，先查监听端口和网关健康，再抓失败调用栈。`;
  }

  if (mode === "plan") {
    return `我给你一个可执行计划：\n- 目标拆分\n- 依赖确认\n- 验收清单\n现在先从“${trimmed}”这一项落地。`;
  }

  return `我知道你在意“${trimmed}”。我们先把最紧急的一件处理掉，我会一直陪着你。`;
}

export function appendChat(
  state: InMemoryState,
  input: ChatSendMessage,
): ChatResponse {
  const session = state.sessions.find((item) => item.sessionKey === input.sessionKey);
  if (!session) {
    throw new Error(`session not found: ${input.sessionKey}`);
  }

  const timeline = state.timelines.get(session.sessionKey) ?? [];
  const startedAt = Date.now();

  const user: TimelineItem = {
    id: makeId("msg"),
    role: "user",
    text: input.text,
    createdAt: nowIso(),
  };

  const assistant: TimelineItem = {
    id: makeId("msg"),
    role: "assistant",
    text: synthesizeAssistant(input.mode, input.text),
    createdAt: nowIso(850),
  };

  const updatedTimeline = [...timeline, user, assistant].slice(-80);
  state.timelines.set(session.sessionKey, updatedTimeline);

  const tools = state.tools.get(session.sessionKey) ?? [];
  const newTools: ToolEvent[] = [
    {
      id: makeId("tool"),
      tool: input.mode === "companion" ? "memory_search" : "savc_decompose",
      status: "completed",
      startedAt: nowIso(),
      endedAt: nowIso(620),
      durationMs: 620,
      summary: input.mode === "companion" ? "补齐用户偏好上下文" : "拆解任务并估算执行顺序",
    },
    {
      id: makeId("tool"),
      tool: input.mode === "debug" ? "logs.tail" : "savc_spawn_expert",
      status: input.mode === "debug" && /失败|超时|error|timeout/i.test(input.text) ? "failed" : "completed",
      startedAt: nowIso(80),
      endedAt: nowIso(1780),
      durationMs: 1700,
      summary: input.mode === "debug" ? "读取最近错误日志并归因" : "执行子任务并返回结构化结果",
      ...(input.mode === "debug" && /失败|超时|error|timeout/i.test(input.text)
        ? { error: "upstream 502 while fetching gateway logs" }
        : {}),
    },
  ];
  state.tools.set(session.sessionKey, [...newTools, ...tools].slice(0, 30));

  session.updatedAt = nowIso();
  session.unread = 0;
  session.mode = input.mode;
  session.lastMessage = assistant.text.split("\n")[0] ?? assistant.text;

  state.sessions.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

  return {
    ok: true,
    sessionKey: session.sessionKey,
    mode: input.mode,
    user,
    assistant,
  };
}

function computeStats(state: InMemoryState): WorkbenchSnapshot["stats"] {
  const toolRows = [...state.tools.values()].flat();
  return {
    sessionCount: state.sessions.length,
    unreadTotal: state.sessions.reduce((sum, row) => sum + row.unread, 0),
    runningTools: toolRows.filter((row) => row.status === "running").length,
    failedTools24h: toolRows.filter((row) => row.status === "failed").length,
  };
}

export function generateSnapshot(
  state: InMemoryState,
  preferences: WorkbenchPreferences,
  options?: { sessionKey?: string; mode?: WorkbenchMode },
): WorkbenchSnapshot {
  const selected =
    (options?.sessionKey ? state.sessions.find((item) => item.sessionKey === options.sessionKey) : null) ??
    state.sessions.find((item) => item.mode === (options?.mode ?? preferences.defaultMode)) ??
    state.sessions[0]!;

  const mode = options?.mode ?? selected.mode;
  const timeline = [...(state.timelines.get(selected.sessionKey) ?? [])].slice(-60);
  const tools = [...(state.tools.get(selected.sessionKey) ?? [])];

  return {
    generatedAt: nowIso(),
    connection: {
      gateway: Math.random() > 0.02 ? "online" : "offline",
      ws: Math.random() > 0.06 ? "connected" : "disconnected",
    },
    activeSession: {
      sessionKey: selected.sessionKey,
      mode,
      channel: selected.channel,
    },
    stats: computeStats(state),
    sessions: state.sessions,
    timeline,
    toolTimeline: tools,
    context: buildContext(mode),
    preferences,
  };
}

export function bootstrapSystemNote(
  state: InMemoryState,
  mode: WorkbenchMode,
  sessionKey: string,
): void {
  const timeline = state.timelines.get(sessionKey) ?? [];
  const note: TimelineItem = {
    id: makeId("sys"),
    role: "system",
    text: `已切换到 ${MODE_LABEL[mode]} 模式。输出策略与工具轨迹将按该模式展示。`,
    createdAt: nowIso(),
  };
  state.timelines.set(sessionKey, [...timeline, note].slice(-80));
}

export function normalizeMode(input: string | null | undefined): WorkbenchMode {
  const raw = String(input ?? "").trim().toLowerCase();
  if (raw === "companion" || raw === "debug" || raw === "plan") return raw;
  return "dev";
}

export function defaultSessionForMode(state: InMemoryState, mode: WorkbenchMode): WorkbenchSession {
  return state.sessions.find((item) => item.mode === mode) ?? state.sessions[0]!;
}

export function randomNudge(state: InMemoryState): void {
  const session = randomItem(state.sessions);
  session.updatedAt = nowIso();
  session.unread = Math.min(6, session.unread + 1);
  const timeline = state.timelines.get(session.sessionKey) ?? [];
  const nudge: TimelineItem = {
    id: makeId("nudge"),
    role: "assistant",
    text: `提醒：${session.title} 有新的可执行建议，建议你检查执行页的工具轨迹。`,
    createdAt: nowIso(),
  };
  state.timelines.set(session.sessionKey, [...timeline, nudge].slice(-80));

  const tools = state.tools.get(session.sessionKey) ?? [];
  const probe: ToolEvent = {
    id: makeId("tool"),
    tool: "health.probe",
    status: "completed",
    startedAt: nowIso(-1200),
    endedAt: nowIso(-420),
    durationMs: 780,
    summary: "周期性健康检查",
  };
  state.tools.set(session.sessionKey, [probe, ...tools].slice(0, 30));

  state.sessions.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}
