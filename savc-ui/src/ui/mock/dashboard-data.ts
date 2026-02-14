import type { DashboardStats, YuanyuanStatus, RecentActivity } from "./types.js";

export const dashboardStats: DashboardStats = {
  status: "online",
  uptime: "24h 13m",
  activeSessions: 3,
  memoryCount: 128,
  totalMessages: 1547,
  agentCount: 7,
};

export const yuanyuanStatus: YuanyuanStatus = {
  mood: "开心",
  moodEmoji: "😊",
  lastInteraction: "2 分钟前",
  personalitySummary: "温柔体贴的陪伴型伙伴，善于倾听和技术支持",
  activeMode: "casual",
};

export const recentActivities: RecentActivity[] = [
  {
    id: "a1",
    type: "chat",
    message: "宝贝你好呀~ 今天想聊什么？",
    time: "2 分钟前",
    agent: "companion",
  },
  {
    id: "a2",
    type: "memory",
    message: "新记忆已存储: 用户偏好 dark mode 主题",
    time: "15 分钟前",
  },
  {
    id: "a3",
    type: "agent",
    message: "technical agent 处理了一个 TypeScript 编译问题",
    time: "32 分钟前",
    agent: "technical",
  },
  {
    id: "a4",
    type: "system",
    message: "记忆巩固任务完成，合并了 3 条重复记忆",
    time: "1 小时前",
  },
  {
    id: "a5",
    type: "chat",
    message: "已解答关于 Vite 配置的技术问题",
    time: "1.5 小时前",
    agent: "vibe-coder",
  },
  {
    id: "a6",
    type: "agent",
    message: "creative agent 生成了一首小诗",
    time: "2 小时前",
    agent: "creative",
  },
  {
    id: "a7",
    type: "memory",
    message: "情感记忆更新: 用户今天心情不错",
    time: "3 小时前",
  },
  {
    id: "a8",
    type: "system",
    message: "系统重启完成，所有 Agent 已就绪",
    time: "24 小时前",
  },
];
