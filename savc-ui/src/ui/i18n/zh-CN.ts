// SAVC 中文文本字典
export const zhCN = {
  // 品牌
  brand: {
    title: "SAVC 管理系统",
    sub: "Self-Aware Virtual Companion",
  },

  // 导航分组
  navGroups: {
    core: "核心",
    memory: "记忆",
    persona: "人格",
    control: "控制",
    system: "系统",
  },

  // Tab 标题
  tabs: {
    dashboard: "仪表盘",
    chat: "对话",
    memory: "记忆系统",
    persona: "人格配置",
    orchestrator: "编排中心",
    channels: "频道管理",
    sessions: "会话列表",
    agents: "Agent 管理",
    skills: "技能管理",
    nodes: "节点管理",
    config: "系统配置",
    debug: "调试工具",
    logs: "运行日志",
    cron: "定时任务",
    instances: "实例监控",
    progressHub: "推进看板",
  },

  // Tab 副标题
  tabSubs: {
    dashboard: "系统状态总览和快捷操作",
    chat: "与媛媛直接对话的会话窗口",
    memory: "浏览、搜索和管理媛媛的记忆数据",
    persona: "调整媛媛的性格特征、语气和价值观",
    orchestrator: "查看 Agent 编排拓扑和调度记录",
    channels: "管理 Discord、微信等接入通道",
    sessions: "查看活跃会话及历史记录",
    agents: "管理 Agent 工作区、工具和身份",
    skills: "管理技能可用性和 API 密钥注入",
    nodes: "配对设备、能力和命令暴露",
    config: "安全编辑系统配置文件",
    debug: "网关快照、事件和手动 RPC 调用",
    logs: "实时查看网关文件日志",
    cron: "管理定时唤醒和周期性任务",
    instances: "监控已连接客户端和节点",
    progressHub: "独立项目推进页面，聚合日志/计划/甘特图",
  },

  // 仪表盘
  dashboard: {
    status: "系统状态",
    uptime: "运行时间",
    activeSessions: "活跃会话",
    memoryCount: "记忆数量",
    recentActivity: "最近活动",
    quickActions: "快捷操作",
    yuanyuanStatus: "媛媛状态",
    mood: "当前情绪",
    lastInteraction: "最近互动",
    personality: "性格概要",
    statusOnline: "在线",
    statusOffline: "离线",
    statusBusy: "忙碌",
  },

  // 记忆系统
  memory: {
    search: "搜索记忆...",
    searchMode: "搜索模式",
    semantic: "语义搜索",
    keyword: "关键词",
    hybrid: "混合模式",
    importance: "重要度",
    category: "分类",
    categories: {
      episodic: "情景记忆",
      semantic: "语义记忆",
      emotional: "情感记忆",
      procedural: "程序记忆",
      preference: "偏好记忆",
    },
    createdAt: "创建时间",
    lastAccessed: "最近访问",
    accessCount: "访问次数",
    consolidate: "巩固记忆",
    delete: "删除",
    expand: "展开",
    collapse: "折叠",
    totalMemories: "总记忆数",
    filtered: "已筛选",
    noResults: "没有找到匹配的记忆",
  },

  // 人格配置
  persona: {
    soul: "灵魂",
    voice: "语气",
    values: "价值观",
    preview: "预览",
    traits: "性格特征",
    warmth: "温暖度",
    playfulness: "趣味性",
    curiosity: "好奇心",
    empathy: "共情力",
    directness: "直率度",
    creativity: "创造力",
    soulDoc: "灵魂文档",
    voiceConfig: "语气配置",
    valuesConfig: "价值观配置",
    editRaw: "编辑原始文件",
    previewResponse: "预览回复风格",
  },

  // 编排中心
  orchestrator: {
    topology: "Agent 拓扑",
    routingRules: "路由规则",
    recentDispatches: "最近调度",
    agents: "Agent 列表",
    activeAgent: "活跃 Agent",
    idleAgent: "空闲 Agent",
    pattern: "匹配模式",
    target: "目标 Agent",
    priority: "优先级",
    dispatchTime: "调度时间",
    duration: "耗时",
    result: "结果",
    success: "成功",
    failed: "失败",
    pending: "等待中",
  },

  // 通用
  common: {
    loading: "加载中...",
    noData: "暂无数据",
    save: "保存",
    cancel: "取消",
    confirm: "确认",
    delete: "删除",
    edit: "编辑",
    refresh: "刷新",
    search: "搜索",
    filter: "筛选",
    all: "全部",
    online: "在线",
    offline: "离线",
    running: "运行中",
    stopped: "已停止",
    error: "错误",
    warning: "警告",
    info: "信息",
    success: "成功",
    close: "关闭",
    back: "返回",
    next: "下一步",
    previous: "上一步",
  },

  // 主题
  theme: {
    dark: "深色",
    light: "浅色",
    system: "跟随系统",
  },

  // Toast 通知
  toast: {
    saved: "保存成功",
    deleted: "删除成功",
    error: "操作失败",
    copied: "已复制到剪贴板",
    connectionLost: "连接已断开",
    reconnecting: "正在重连...",
  },
} as const;

export type I18nDict = typeof zhCN;
