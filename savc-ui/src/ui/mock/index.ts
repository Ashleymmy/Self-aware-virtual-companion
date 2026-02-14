// MockGateway — 模拟 WebSocket 连接的数据层

import { dashboardStats, yuanyuanStatus, recentActivities } from "./dashboard-data.js";
import { memories } from "./memory-data.js";
import { personaTraits, voiceVariants, coreValues, soulDocPreview, verbalTics, topicHandling } from "./persona-data.js";
import { agents, routingRules, recentDispatches } from "./orchestrator-data.js";

export type { DashboardStats, YuanyuanStatus, RecentActivity, MemoryItem, PersonaTrait, VoiceVariant, ValueItem, AgentNode, RoutingRule, DispatchRecord } from "./types.js";

/** 模拟异步延迟 (200-500ms) */
function delay(min = 200, max = 500): Promise<void> {
  const ms = min + Math.random() * (max - min);
  return new Promise((r) => setTimeout(r, ms));
}

export class MockGateway {
  // ── Dashboard ─────────────────────────────
  async getDashboardStats() {
    await delay(200, 400);
    return { ...dashboardStats };
  }

  async getYuanyuanStatus() {
    await delay(150, 300);
    return { ...yuanyuanStatus };
  }

  async getRecentActivities() {
    await delay(200, 400);
    return [...recentActivities];
  }

  // ── Memory ────────────────────────────────
  async getMemories(filter?: { category?: string; search?: string }) {
    await delay(300, 500);
    let result = [...memories];
    if (filter?.category && filter.category !== "all") {
      result = result.filter((m) => m.category === filter.category);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      result = result.filter(
        (m) =>
          m.content.toLowerCase().includes(q) ||
          m.tags.some((tag) => tag.toLowerCase().includes(q)),
      );
    }
    return result;
  }

  async getMemoryCount() {
    await delay(100, 200);
    return memories.length;
  }

  // ── Persona ───────────────────────────────
  async getPersonaTraits() {
    await delay(200, 350);
    return [...personaTraits];
  }

  async getVoiceVariants() {
    await delay(150, 300);
    return [...voiceVariants];
  }

  async getVerbalTics() {
    await delay(100, 200);
    return [...verbalTics];
  }

  async getCoreValues() {
    await delay(200, 350);
    return [...coreValues];
  }

  async getTopicHandling() {
    await delay(150, 250);
    return { ...topicHandling };
  }

  async getSoulDoc() {
    await delay(200, 400);
    return soulDocPreview;
  }

  // ── Orchestrator ──────────────────────────
  async getAgents() {
    await delay(200, 400);
    return [...agents];
  }

  async getRoutingRules() {
    await delay(200, 350);
    return [...routingRules];
  }

  async getRecentDispatches() {
    await delay(250, 450);
    return [...recentDispatches];
  }
}

/** 全局单例 */
export const gateway = new MockGateway();
