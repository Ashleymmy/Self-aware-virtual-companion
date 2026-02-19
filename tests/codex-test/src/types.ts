export type WorkbenchMode = "companion" | "dev" | "debug" | "plan";

export type SessionChannel = "web" | "discord" | "telegram" | "unknown";

export interface WorkbenchPreferences {
  modelProfile: string;
  fallbackModel: string;
  ttsProvider: "openai" | "elevenlabs" | "edge";
  ttsVoice: string;
  live2dMode: "auto" | "gateway" | "mock";
  live2dSensitivity: number;
  defaultMode: WorkbenchMode;
  autoMemoryRecall: boolean;
  conciseOutput: boolean;
}

export interface WorkbenchSession {
  sessionKey: string;
  title: string;
  mode: WorkbenchMode;
  channel: SessionChannel;
  updatedAt: string;
  unread: number;
  lastMessage: string;
}

export interface TimelineItem {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  createdAt: string;
}

export interface ToolEvent {
  id: string;
  tool: string;
  status: "queued" | "running" | "completed" | "failed";
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  summary: string;
  error?: string;
}

export interface ContextSnapshot {
  memories: Array<{ title: string; score: number; note: string }>;
  docs: Array<{ file: string; title: string; excerpt: string }>;
  commits: Array<{ hash: string; subject: string; date: string }>;
}

export interface WorkbenchSnapshot {
  generatedAt: string;
  connection: {
    gateway: "online" | "offline";
    ws: "connected" | "disconnected";
  };
  activeSession: {
    sessionKey: string;
    mode: WorkbenchMode;
    channel: SessionChannel;
  };
  stats: {
    sessionCount: number;
    unreadTotal: number;
    runningTools: number;
    failedTools24h: number;
  };
  sessions: WorkbenchSession[];
  timeline: TimelineItem[];
  toolTimeline: ToolEvent[];
  context: ContextSnapshot;
  preferences: WorkbenchPreferences;
}

export interface ChatSendMessage {
  sessionKey: string;
  text: string;
  mode: WorkbenchMode;
}

export interface ChatResponse {
  ok: boolean;
  sessionKey: string;
  mode: WorkbenchMode;
  user: TimelineItem;
  assistant: TimelineItem;
}
