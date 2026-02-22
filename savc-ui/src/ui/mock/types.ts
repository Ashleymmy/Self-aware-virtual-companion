// ── Mock Data Types ──────────────────────────────────

export interface DashboardStats {
  status: "online" | "offline" | "busy";
  uptime: string;
  activeSessions: number;
  memoryCount: number;
  totalMessages: number;
  agentCount: number;
}

export interface YuanyuanStatus {
  mood: string;
  moodEmoji: string;
  lastInteraction: string;
  personalitySummary: string;
  activeMode: "casual" | "technical";
}

export interface RecentActivity {
  id: string;
  type: "chat" | "memory" | "agent" | "system";
  message: string;
  time: string;
  agent?: string;
}

export interface MemoryItem {
  id: string;
  content: string;
  category: "episodic" | "semantic" | "emotional" | "procedural" | "preference";
  importance: number; // 0-1
  createdAt: string;
  lastAccessed: string;
  accessCount: number;
  tags: string[];
  source: string;
}

export interface PersonaTrait {
  key: string;
  label: string;
  value: number; // 0-1
  description: string;
}

export interface VoiceVariant {
  key: string;
  label: string;
  description: string;
  isDefault: boolean;
}

export interface ValueItem {
  key: string;
  label: string;
  description: string;
  priority: "core" | "high" | "medium";
}

export interface AgentNode {
  id: string;
  name: string;
  label: string;
  description: string;
  model: string;
  status: "active" | "idle" | "error";
  triggers: string[];
  color: string;
}

export interface RoutingRule {
  id: string;
  pattern: string;
  target: string;
  priority: number;
  enabled: boolean;
}

export interface DispatchRecord {
  id: string;
  agent: string;
  trigger: string;
  time: string;
  duration: string;
  result: "success" | "failed" | "pending";
}

export interface StorageComponentHealth {
  name: string;
  engine: string;
  configured: boolean;
  state: "online" | "degraded" | "offline" | "disabled";
  message: string;
  latencyMs: number | null;
}

export interface StorageStatus {
  generatedAt: string;
  mode: {
    primary: "sqlite" | "memory";
    cache: "redis" | "memory";
    backup: "yaml";
  };
  components: {
    sqlite: StorageComponentHealth;
    cache: StorageComponentHealth;
    mysql: StorageComponentHealth;
    yaml: StorageComponentHealth;
  };
  metrics: {
    runtimeLogCount: number;
    kvCount: number;
    cacheEntries: number;
  };
  paths: {
    sqlite: string;
    yamlBackup: string;
  };
}

export interface StorageRuntimeLog {
  id: number;
  level: string;
  subsystem: string;
  message: string;
  context: Record<string, unknown>;
  createdAt: string;
}
