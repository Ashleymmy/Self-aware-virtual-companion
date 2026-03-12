const state = {
  snapshot: null,
  activeTab: "overview",
  detailTab: "function",
  selectedModuleId: "",
  connection: "connecting",
  sse: null,
  graphNodes: [],
  graphDpr: 1,
  graphLayoutKey: "",
  planDirty: false,
  previewFilePath: "",
};

const refs = {
  connectionPill: document.getElementById("connectionPill"),
  lastUpdated: document.getElementById("lastUpdated"),
  refreshBtn: document.getElementById("refreshBtn"),
  globalStrip: document.getElementById("globalStrip"),
  tabButtons: Array.from(document.querySelectorAll(".hub-tab")),
  views: Array.from(document.querySelectorAll(".hub-view")),
  brainCanvas: document.getElementById("brainCanvas"),
  moduleCards: document.getElementById("moduleCards"),
  moduleDrawer: document.getElementById("moduleDrawer"),
  drawerTitle: document.getElementById("drawerTitle"),
  drawerBadge: document.getElementById("drawerBadge"),
  drawerTabs: Array.from(document.querySelectorAll(".drawer-tab")),
  drawerContent: document.getElementById("drawerContent"),
  ganttWrap: document.getElementById("ganttWrap"),
  ganttFilter: document.getElementById("ganttFilter"),
  logsList: document.getElementById("logsList"),
  planDocsList: document.getElementById("planDocsList"),
  logSourceFilter: document.getElementById("logSourceFilter"),
  logDateFilter: document.getElementById("logDateFilter"),
  logKeywordFilter: document.getElementById("logKeywordFilter"),
  planReference: document.getElementById("planReference"),
  savePlanBtn: document.getElementById("savePlanBtn"),
  nextPlanInput: document.getElementById("nextPlanInput"),
  correctionPlanInput: document.getElementById("correctionPlanInput"),
  saveHint: document.getElementById("saveHint"),
  planHistory: document.getElementById("planHistory"),
  filePreview: document.getElementById("filePreview"),
  filePreviewBackdrop: document.getElementById("filePreviewBackdrop"),
  filePreviewTitle: document.getElementById("filePreviewTitle"),
  filePreviewPath: document.getElementById("filePreviewPath"),
  filePreviewBody: document.getElementById("filePreviewBody"),
  filePreviewClose: document.getElementById("filePreviewClose"),
};

const STATUS_LABEL = {
  done: "已完成",
  in_progress: "进行中",
  blocked: "阻塞",
  planned: "规划中",
};

const STATUS_COLOR = {
  done: "#3ce69c",
  in_progress: "#12c2a1",
  blocked: "#ff5f5f",
  planned: "#8ea1b4",
};

const MODULE_META = {
  orchestrator: {
    icon: "🧠",
    elements: ["路由策略", "任务拆解", "结果聚合"],
    keywords: ["orchestrator", "路由", "拆解", "dispatch", "aggregate"],
    inputs: ["多渠道用户请求", "意图上下文", "可用 Agent 能力"],
    outputs: ["目标 Agent 任务流", "聚合结果", "调度轨迹"],
    milestones: ["路由规则集覆盖", "多任务拆解稳定", "聚合质量评估上线"],
    nextFocus: ["补齐真实运行态接管", "提升复杂任务分配准确率"],
  },
  memory: {
    icon: "🗂️",
    elements: ["语义检索", "自动召回", "自动捕获"],
    keywords: ["memory", "记忆", "lancedb", "semantic", "auto-recall", "auto-capture"],
    inputs: ["对话片段", "行为事件", "记忆评分参数"],
    outputs: ["相关记忆候选", "结构化记忆条目", "衰减后的排序结果"],
    milestones: ["LanceDB 检索闭环", "衰减评分上线", "自动召回接口联调"],
    nextFocus: ["强化记忆质量评估", "优化召回噪声过滤"],
  },
  persona: {
    icon: "💠",
    elements: ["人格特征", "价值观", "语气控制"],
    keywords: ["persona", "人格", "values", "voice", "soul"],
    inputs: ["SOUL 配置", "用户偏好", "对话风格反馈"],
    outputs: ["人格参数快照", "风格提示约束", "一致性评分"],
    milestones: ["基础人格建模", "语气模板管理", "预览交互可视化"],
    nextFocus: ["跨渠道风格一致性", "人格配置可解释性"],
  },
  channels: {
    icon: "🌐",
    elements: ["Discord", "Telegram", "Web"],
    keywords: ["channel", "discord", "telegram", "gateway", "dm", "guild"],
    inputs: ["平台消息事件", "渠道策略配置", "鉴权状态"],
    outputs: ["标准化会话消息", "渠道健康状态", "回执与错误日志"],
    milestones: ["多渠道接入稳定", "会话隔离修复", "探活面板上线"],
    nextFocus: ["回包时延优化", "故障自愈策略"],
  },
  "vibe-coding": {
    icon: "🛠️",
    elements: ["项目生成", "迭代修复", "测试回归"],
    keywords: ["vibe", "coding", "修复", "test", "patch"],
    inputs: ["自然语言需求", "代码上下文", "测试结果"],
    outputs: ["实现计划", "变更补丁", "修复报告"],
    milestones: ["vibe-coder 路由打通", "执行循环可控", "测试闭环接入"],
    nextFocus: ["真实编排接管", "失败重试策略细化"],
  },
  "voice-tts": {
    icon: "🎙️",
    elements: ["TTS 合成", "Provider 回退", "消息播报"],
    keywords: ["tts", "voice", "elevenlabs", "openai tts", "audio"],
    inputs: ["文本回复", "语音 provider 配置", "音色参数"],
    outputs: ["音频文件/内联音频", "播报状态", "回退链路结果"],
    milestones: ["消息链路 TTS 打通", "provider 状态检测", "前端回退策略"],
    nextFocus: ["多端播放一致性", "实时语音交互链路"],
  },
  vision: {
    icon: "🖼️",
    elements: ["截图理解", "视觉审查", "图像任务编排"],
    keywords: ["vision", "image", "screenshot", "视觉"],
    inputs: ["图像/截图", "视觉任务指令", "上下文消息"],
    outputs: ["视觉分析结论", "结构化标注", "后续行动建议"],
    milestones: ["视觉 Agent 框架", "截图排障流程", "结果回显面板"],
    nextFocus: ["多图上下文推理", "可视化标注增强"],
  },
  live2d: {
    icon: "🧍",
    elements: ["表情驱动", "口型同步", "动作信号"],
    keywords: ["live2d", "口型", "动作", "avatar", "signal"],
    inputs: ["文本/语音信号", "交互事件", "模型配置"],
    outputs: ["动作事件流", "状态反馈", "UI 表情联动结果"],
    milestones: ["信号层接入", "runtime 展示", "交互事件映射"],
    nextFocus: ["生产级联调", "动作库扩展"],
  },
  "savc-ui": {
    icon: "🧩",
    elements: ["仪表盘", "配置视图", "实时面板"],
    keywords: ["savc-ui", "dashboard", "view", "管理界面", "ui"],
    inputs: ["网关状态", "日志流", "配置与计划数据"],
    outputs: ["运营可视化页面", "管理操作入口", "状态总览"],
    milestones: ["中文化重构", "实时数据接入", "推进看板独立页"],
    nextFocus: ["信息密度优化", "决策视图增强"],
  },
  "automation-tests": {
    icon: "✅",
    elements: ["阶段脚本", "回归验证", "健康检查"],
    keywords: ["test", "phase", "vitest", "验证", "health"],
    inputs: ["代码变更", "测试脚本", "运行环境"],
    outputs: ["通过/失败报告", "风险清单", "回归结果快照"],
    milestones: ["phase 脚本体系", "插件测试集", "状态看板接入"],
    nextFocus: ["自动化覆盖补齐", "失败根因聚类"],
  },
};

const DEFAULT_META = {
  icon: "📦",
  elements: ["核心能力", "流程联动", "质量保障"],
  keywords: [],
  inputs: ["输入数据", "上下文", "配置参数"],
  outputs: ["执行结果", "状态回显", "追踪记录"],
  milestones: ["功能实现", "联调验证", "稳定性优化"],
  nextFocus: ["持续迭代", "指标优化"],
};

const RISK_LABEL = {
  low: "低",
  medium: "中",
  high: "高",
};

function moduleMeta(module) {
  if (!module) return DEFAULT_META;
  return MODULE_META[module.id] || DEFAULT_META;
}

function toLowerText(value) {
  return String(value || "").toLowerCase();
}

function includesAnyKeyword(haystack, keywords) {
  const source = toLowerText(haystack);
  return keywords.some((keyword) => {
    const word = toLowerText(keyword).trim();
    if (!word || word.length < 2) return false;
    return source.includes(word);
  });
}

function relatedLogsForModule(module, limit = 6) {
  const logs = state.snapshot?.worklogs || [];
  const meta = moduleMeta(module);
  const keywords = [module.id, module.name, ...(meta.keywords || [])];
  return logs
    .filter((row) => includesAnyKeyword(`${row.title}\n${row.summary}\n${(row.sections || []).join("\n")}`, keywords))
    .slice(0, limit);
}

function relatedCommitsForModule(module, limit = 6) {
  const commits = state.snapshot?.commits || [];
  const meta = moduleMeta(module);
  const keywords = [module.id, module.name, ...(meta.keywords || [])];
  return commits
    .filter((row) => includesAnyKeyword(row.subject, keywords))
    .slice(0, limit);
}

function moduleGantt(module) {
  const rows = state.snapshot?.gantt || [];
  return rows.find((item) => item.id === module.id) || null;
}

function statusBadgeHtml(status) {
  return `<span class="status-badge ${escapeHtml(status)}">${escapeHtml(STATUS_LABEL[status] || status)}</span>`;
}

init();

async function init() {
  bindEvents();
  startGraphLoop();
  await refreshSnapshot();
  connectSse();

  setInterval(() => {
    if (state.connection !== "online") {
      void refreshSnapshot();
    }
  }, 15_000);
}

function bindEvents() {
  refs.refreshBtn.addEventListener("click", () => {
    void refreshSnapshot(true);
  });

  for (const button of refs.tabButtons) {
    button.addEventListener("click", () => {
      const tab = button.dataset.tab;
      if (!tab) return;
      state.activeTab = tab;
      renderTabs();
    });
  }

  for (const button of refs.drawerTabs) {
    button.addEventListener("click", () => {
      const tab = button.dataset.detailTab;
      if (!tab) return;
      state.detailTab = tab;
      renderDrawer();
    });
  }

  refs.moduleCards.addEventListener("click", (event) => {
    const target = event.target.closest(".module-card[data-module-id]");
    if (!target) return;
    state.selectedModuleId = target.dataset.moduleId || "";
    renderModuleCards();
    renderDrawer();
  });

  refs.brainCanvas.addEventListener("click", onCanvasClick);
  window.addEventListener("resize", () => {
    state.graphLayoutKey = "";
    drawGraph(performance.now());
  });

  refs.ganttFilter.addEventListener("change", renderGantt);
  refs.logSourceFilter.addEventListener("change", renderLogs);
  refs.logDateFilter.addEventListener("change", renderLogs);
  refs.logKeywordFilter.addEventListener("input", renderLogs);

  refs.savePlanBtn.addEventListener("click", () => {
    void savePlan();
  });

  refs.nextPlanInput.addEventListener("input", () => {
    state.planDirty = true;
    setSaveHint("有未保存变更", "");
  });

  refs.correctionPlanInput.addEventListener("input", () => {
    state.planDirty = true;
    setSaveHint("有未保存变更", "");
  });

  document.body.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-copy]");
    if (btn) {
      const value = btn.dataset.copy || "";
      void copyPath(value, btn);
      return;
    }

    const previewBtn = event.target.closest("button[data-open-file]");
    if (previewBtn) {
      const filePath = previewBtn.dataset.openFile || "";
      const fileTitle = previewBtn.dataset.openTitle || "";
      void openFilePreview(filePath, fileTitle);
    }
  });

  refs.filePreviewClose.addEventListener("click", closeFilePreview);
  refs.filePreviewBackdrop.addEventListener("click", closeFilePreview);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !refs.filePreview.hidden) {
      closeFilePreview();
    }
  });
}

function connectSse() {
  if (state.sse) {
    state.sse.close();
  }

  state.connection = "connecting";
  renderConnection();

  const sse = new EventSource("/__savc/progress/stream");
  state.sse = sse;

  sse.addEventListener("snapshot", (event) => {
    try {
      const payload = JSON.parse(event.data);
      applySnapshot(payload);
      state.connection = "online";
      renderConnection();
    } catch (error) {
      console.warn("snapshot parse failed", error);
    }
  });

  sse.onopen = () => {
    state.connection = "online";
    renderConnection();
  };

  sse.onerror = () => {
    state.connection = "offline";
    renderConnection();
  };
}

async function refreshSnapshot(force = false) {
  try {
    const res = await fetch("/__savc/progress/snapshot", {
      cache: "no-store",
      headers: force ? { "x-force": "1" } : undefined,
    });
    if (!res.ok) {
      throw new Error(`snapshot request failed: ${res.status}`);
    }
    const payload = await res.json();
    applySnapshot(payload);
    if (state.connection !== "online") {
      state.connection = "offline";
      renderConnection();
    }
  } catch (error) {
    state.connection = "offline";
    renderConnection();
    console.warn(error);
  }
}

function applySnapshot(payload) {
  state.snapshot = payload;
  if (!state.selectedModuleId && Array.isArray(payload.modules) && payload.modules.length > 0) {
    state.selectedModuleId = payload.modules[0].id;
  }

  if (!state.planDirty) {
    refs.nextPlanInput.value = payload.planBoard?.nextPlanMd || "";
    refs.correctionPlanInput.value = payload.planBoard?.correctionPlanMd || "";
    setSaveHint("已同步最新计划", "");
  }

  renderAll();
}

function renderAll() {
  renderConnection();
  renderTabs();
  renderGlobalStrip();
  renderModuleCards();
  renderDrawer();
  renderGantt();
  renderLogs();
  renderPlanReference();
  renderPlanHistory();
}

function renderConnection() {
  const map = {
    online: "在线监听",
    offline: "离线轮询",
    connecting: "连接中",
  };
  refs.connectionPill.textContent = map[state.connection] || "连接中";
  refs.connectionPill.classList.toggle("offline", state.connection !== "online");

  const ts = state.snapshot?.generatedAt;
  refs.lastUpdated.textContent = ts ? formatDateTime(ts) : "--";
}

function renderTabs() {
  for (const button of refs.tabButtons) {
    const active = button.dataset.tab === state.activeTab;
    button.classList.toggle("active", active);
  }

  for (const view of refs.views) {
    const active = view.id === `view-${state.activeTab}`;
    view.classList.toggle("active", active);
  }
}

function renderGlobalStrip() {
  const snapshot = state.snapshot;
  if (!snapshot) return;

  const latestLog = snapshot.worklogs?.[0]?.updatedAt ? formatDateTime(snapshot.worklogs[0].updatedAt) : "--";
  const completion = snapshot.modules?.length
    ? Math.round(snapshot.modules.reduce((sum, item) => sum + item.progress, 0) / snapshot.modules.length)
    : 0;

  refs.globalStrip.innerHTML = `
    <div class="global-chip">
      <div class="label">分支</div>
      <div class="value">${escapeHtml(snapshot.repo?.branch || "--")}</div>
    </div>
    <div class="global-chip">
      <div class="label">最近提交</div>
      <div class="value">${escapeHtml(snapshot.commits?.[0]?.subject || "--")}</div>
    </div>
    <div class="global-chip">
      <div class="label">最近日志更新时间</div>
      <div class="value">${latestLog}</div>
    </div>
    <div class="global-chip">
      <div class="label">模块完成率</div>
      <div class="value">${completion}%</div>
    </div>
  `;
}

function renderModuleCards() {
  const modules = state.snapshot?.modules || [];
  refs.moduleCards.innerHTML = modules
    .map((module) => {
      const meta = moduleMeta(module);
      const selected = module.id === state.selectedModuleId ? "style='outline: 2px solid rgba(255, 110, 138, .55)'" : "";
      const chips = (meta.elements || []).slice(0, 2)
        .map((item) => `<span class="mini-chip">${escapeHtml(item)}</span>`)
        .join("");
      return `
        <article class="module-card" data-module-id="${escapeHtml(module.id)}" ${selected}>
          <div class="module-card__head">
            <h4>${escapeHtml(meta.icon || "📦")} ${escapeHtml(module.name)}</h4>
            ${statusBadgeHtml(module.status)}
          </div>
          <div class="meta">${escapeHtml(module.phase)} · ${module.progress}%</div>
          <div class="mini-chip-list">${chips || '<span class="mini-chip">核心能力</span>'}</div>
          <div class="progress-bar"><span style="width:${module.progress}%"></span></div>
        </article>
      `;
    })
    .join("");
}

function renderDrawer() {
  const modules = state.snapshot?.modules || [];
  const module = modules.find((item) => item.id === state.selectedModuleId);

  for (const button of refs.drawerTabs) {
    button.classList.toggle("active", button.dataset.detailTab === state.detailTab);
  }

  if (!module) {
    refs.drawerTitle.textContent = "选择模块";
    refs.drawerBadge.className = "status-badge";
    refs.drawerBadge.textContent = "--";
    refs.drawerContent.innerHTML = `<p class="muted">点击左侧任意神经元查看模块详情。</p>`;
    return;
  }

  const meta = moduleMeta(module);
  refs.drawerTitle.textContent = `${meta.icon || "📦"} ${module.name}`;
  refs.drawerBadge.className = `status-badge ${module.status}`;
  refs.drawerBadge.textContent = STATUS_LABEL[module.status] || module.status;

  const moduleMap = new Map(modules.map((item) => [item.id, item]));
  const upstream = (module.deps || []).map((id) => moduleMap.get(id)).filter(Boolean);
  const downstream = modules.filter((item) => (item.deps || []).includes(module.id));
  const relatedLogs = relatedLogsForModule(module, 8);
  const relatedCommits = relatedCommitsForModule(module, 8);
  const gantt = moduleGantt(module);
  const upstreamReady = upstream.length
    ? Math.round(upstream.reduce((sum, item) => sum + Number(item.progress || 0), 0) / upstream.length)
    : 100;
  const blockedUpstream = upstream.filter((item) => item.status === "blocked");
  const riskSignals = relatedLogs
    .filter((row) => includesAnyKeyword(`${row.summary}\n${(row.sections || []).join("\n")}`, ["fail", "error", "阻塞", "风险", "timeout", "warn", "失败"]))
    .slice(0, 4);

  const docsHtml = (module.links || []).length
    ? (module.links || []).map((link) => `<li><code>${escapeHtml(link)}</code></li>`).join("")
    : "<li>暂无</li>";

  const elementChips = (meta.elements || []).map((item) => `<span class="tag-pill">${escapeHtml(item)}</span>`).join("");

  if (state.detailTab === "function") {
    refs.drawerContent.innerHTML = `
      <div class="md">
        <section class="drawer-section">
          <h4>模块定位</h4>
          <p>${escapeHtml(module.desc)}</p>
          <div class="pill-list">${elementChips || '<span class="tag-pill">核心能力</span>'}</div>
        </section>

        <section class="drawer-section detail-grid">
          <div>
            <h5>输入</h5>
            <ul>${(meta.inputs || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
          </div>
          <div>
            <h5>输出</h5>
            <ul>${(meta.outputs || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
          </div>
        </section>

        <section class="drawer-section">
          <h5>里程碑</h5>
          <ul>${(meta.milestones || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </section>

        <section class="drawer-section">
          <h5>关联文档</h5>
          <ul>${docsHtml}</ul>
        </section>
      </div>
    `;
    return;
  }

  if (state.detailTab === "progress") {
    const recentLogs = relatedLogs.slice(0, 4);
    const recentCommits = relatedCommits.slice(0, 4);
    const schedule = gantt ? gantt.schedule : "on_track";
    const scheduleLabel = schedule === "delayed" ? "延迟" : schedule === "risk" ? "风险" : "按期";
    const progressRangeText = gantt
      ? `${formatDate(gantt.start)} ~ ${formatDate(gantt.end)}`
      : "暂无周期数据";

    refs.drawerContent.innerHTML = `
      <div class="md">
        <section class="drawer-section">
          <h4>进度总览</h4>
          <div class="kv-grid">
            <div><span>阶段</span><strong>${escapeHtml(module.phase)}</strong></div>
            <div><span>负责人</span><strong>${escapeHtml(module.owner)}</strong></div>
            <div><span>完成度</span><strong>${module.progress}%</strong></div>
            <div><span>排期状态</span><strong>${scheduleLabel}</strong></div>
            <div><span>效率评分</span><strong>${gantt ? gantt.efficiency : "--"}</strong></div>
            <div><span>最近更新</span><strong>${formatDateTime(module.updatedAt)}</strong></div>
          </div>
          <div class="progress-line"><span style="width:${module.progress}%"></span></div>
          <p class="muted">周期范围：${progressRangeText}</p>
        </section>

        <section class="drawer-section">
          <h5>关联提交（最近）</h5>
          <ul>
            ${recentCommits.map((row) => `<li><code>${escapeHtml(row.hash)}</code> ${escapeHtml(row.subject)}</li>`).join("") || "<li>暂无强关联提交</li>"}
          </ul>
        </section>

        <section class="drawer-section">
          <h5>关联日志（最近）</h5>
          <ul>
            ${recentLogs.map((row) => `<li>${escapeHtml(row.date || "--")} · ${escapeHtml(row.summary || row.title)}</li>`).join("") || "<li>暂无强关联日志</li>"}
          </ul>
        </section>
      </div>
    `;
    return;
  }

  if (state.detailTab === "deps") {
    const upstreamHtml = upstream.length
      ? upstream.map((item) => `
        <div class="dep-item">
          <div class="dep-item__head">
            <strong>${escapeHtml(item.name)}</strong>
            ${statusBadgeHtml(item.status)}
          </div>
          <div class="dep-item__meta">${escapeHtml(item.phase)} · ${item.progress}%</div>
          <div class="progress-line tiny"><span style="width:${item.progress}%"></span></div>
        </div>
      `).join("")
      : `<p class="muted">无上游依赖。</p>`;

    const downstreamHtml = downstream.length
      ? downstream.map((item) => `
        <div class="dep-item">
          <div class="dep-item__head">
            <strong>${escapeHtml(item.name)}</strong>
            ${statusBadgeHtml(item.status)}
          </div>
          <div class="dep-item__meta">依赖当前模块 · ${item.progress}%</div>
          <div class="progress-line tiny"><span style="width:${item.progress}%"></span></div>
        </div>
      `).join("")
      : `<p class="muted">暂无下游依赖。</p>`;

    refs.drawerContent.innerHTML = `
      <div class="md">
        <section class="drawer-section">
          <h4>依赖健康度</h4>
          <div class="kv-grid">
            <div><span>上游就绪率</span><strong>${upstreamReady}%</strong></div>
            <div><span>阻塞依赖数</span><strong>${blockedUpstream.length}</strong></div>
            <div><span>上游数量</span><strong>${upstream.length}</strong></div>
            <div><span>下游数量</span><strong>${downstream.length}</strong></div>
          </div>
          <div class="progress-line"><span style="width:${upstreamReady}%"></span></div>
        </section>
        <section class="drawer-section">
          <h5>上游依赖</h5>
          ${upstreamHtml}
        </section>
        <section class="drawer-section">
          <h5>下游被依赖</h5>
          ${downstreamHtml}
        </section>
      </div>
    `;
    return;
  }

  const suggestion = module.status === "blocked"
    ? "优先处理阻塞问题，建议先收敛日志中的错误点并补回归验证。"
    : module.risk === "high"
      ? "当前风险较高，建议在下次迭代前补充验收用例。"
      : module.risk === "medium"
        ? "建议维持当前节奏，保持每次提交都有验证闭环。"
        : "风险可控，可继续推进与依赖模块联调。";

  const nextActions = [
    ...((meta.nextFocus || []).slice(0, 2)),
    module.status === "blocked" ? "先解除阻塞依赖，再推进功能扩展" : "安排一次联调回归并更新计划页",
  ].slice(0, 3);

  const correctionTemplate = [
    `### ${module.name} 错误更正计划`,
    `- 当前风险等级：${RISK_LABEL[module.risk] || module.risk}`,
    `- 根因聚焦：${riskSignals[0]?.summary || "待补充日志证据"}`,
    "- 修复动作：",
    "  - [ ] 定位失败路径并复现",
    "  - [ ] 完成修复并补充测试",
    "  - [ ] 回归验证并更新里程碑",
  ].join("\n");

  refs.drawerContent.innerHTML = `
    <div class="md">
      <section class="drawer-section">
        <h4>风险评估</h4>
        <div class="risk-banner risk-${module.risk}">
          <strong>风险等级：${RISK_LABEL[module.risk] || module.risk}</strong>
          <p>${escapeHtml(suggestion)}</p>
        </div>
      </section>

      <section class="drawer-section">
        <h5>风险证据（日志）</h5>
        <ul>
          ${riskSignals.map((row) => `<li>${escapeHtml(row.date || "--")} · ${escapeHtml(row.summary || row.title)}</li>`).join("") || "<li>暂无明显风险日志证据</li>"}
        </ul>
      </section>

      <section class="drawer-section">
        <h5>下一步动作</h5>
        <ul>${nextActions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </section>

      <section class="drawer-section">
        <h5>可直接粘贴到计划页的纠偏草案</h5>
        <pre>${escapeHtml(correctionTemplate)}</pre>
      </section>
    </div>
  `;
}

function renderGantt() {
  const snapshot = state.snapshot;
  if (!snapshot) return;

  const filter = refs.ganttFilter.value;
  const rows = (snapshot.gantt || []).filter((item) => filter === "all" || item.status === filter);
  if (!rows.length) {
    refs.ganttWrap.innerHTML = `<p class="muted">没有匹配的甘特条目。</p>`;
    return;
  }

  const minStart = Math.min(...rows.map((item) => Date.parse(item.start)));
  const maxEnd = Math.max(...rows.map((item) => Date.parse(item.end)));
  const span = Math.max(maxEnd - minStart, 1);

  refs.ganttWrap.innerHTML = rows
    .map((item) => {
      const left = ((Date.parse(item.start) - minStart) / span) * 100;
      const width = Math.max(3.5, ((Date.parse(item.end) - Date.parse(item.start)) / span) * 100);
      return `
        <div class="gantt-row">
          <div class="gantt-label">
            <strong>${escapeHtml(item.name)}</strong>
            <span>${formatDate(item.start)} ~ ${formatDate(item.end)} · 进度 ${item.progress}% · 效率 ${item.efficiency}</span>
          </div>
          <div class="gantt-track">
            <div class="gantt-bar ${item.status}" style="left:${left}%;width:${width}%">${STATUS_LABEL[item.status] || item.status}</div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderLogs() {
  const snapshot = state.snapshot;
  if (!snapshot) return;

  const sourceFilter = refs.logSourceFilter.value;
  const dateFilter = refs.logDateFilter.value;
  const keyword = refs.logKeywordFilter.value.trim().toLowerCase();

  const logs = (snapshot.worklogs || []).filter((row) => {
    if (sourceFilter !== "all" && row.source !== sourceFilter) return false;
    if (dateFilter && row.date !== dateFilter) return false;
    if (keyword) {
      const hay = `${row.title}\n${row.summary}\n${(row.sections || []).join("\n")}`.toLowerCase();
      if (!hay.includes(keyword)) return false;
    }
    return true;
  });

  refs.logsList.innerHTML = logs
    .map((row) => {
      const detailMd = [
        `### 摘要`,
        row.summary || "暂无",
        "",
        `### 关键分节`,
        ...(row.sections || []).slice(0, 6).map((item) => `- ${item}`),
      ].join("\n");

      return `
        <article class="log-card">
          <div class="log-head">
            <strong>${escapeHtml(row.title)}</strong>
            <span class="source-tag">${escapeHtml(row.source)}</span>
          </div>
          <div class="muted" style="font-size:12px;margin-bottom:8px;">${escapeHtml(row.date || "--")} · 更新于 ${formatDateTime(row.updatedAt)}</div>
          <div class="md">${markdownToHtml(detailMd)}</div>
          <div class="path-row">
            <code>${escapeHtml(row.file)}</code>
            <div class="row-actions">
              <button class="copy-btn" data-open-file="${escapeHtml(row.file)}" data-open-title="${escapeHtml(row.title)}">查看全文</button>
              <button class="copy-btn" data-copy="${escapeHtml(row.file)}">复制路径</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("") || `<p class="muted">暂无匹配日志。</p>`;

  refs.planDocsList.innerHTML = (snapshot.planDocs || [])
    .map((doc) => `
      <article class="doc-card">
        <div class="doc-head">
          <strong>${escapeHtml(doc.title)}</strong>
          <span class="muted">${formatDateTime(doc.updatedAt)}</span>
        </div>
        <div class="md"><p>${escapeHtml(doc.excerpt || "暂无摘要")}</p></div>
        <div class="path-row">
          <code>${escapeHtml(doc.file)}</code>
          <div class="row-actions">
            <button class="copy-btn" data-open-file="${escapeHtml(doc.file)}" data-open-title="${escapeHtml(doc.title)}">查看全文</button>
            <button class="copy-btn" data-copy="${escapeHtml(doc.file)}">复制路径</button>
          </div>
        </div>
      </article>
    `)
    .join("") || `<p class="muted">暂无方案文档。</p>`;
}

function renderPlanReference() {
  const snapshot = state.snapshot;
  if (!snapshot) return;

  const blocked = (snapshot.modules || []).filter((item) => item.status === "blocked");
  const risky = (snapshot.modules || []).filter((item) => item.risk === "high" || item.risk === "medium").slice(0, 6);
  const commits = (snapshot.commits || []).slice(0, 6);

  refs.planReference.innerHTML = `
    <article class="ref-card">
      <h4>阻塞模块</h4>
      <ul>${blocked.map((item) => `<li>${escapeHtml(item.name)} · ${item.progress}%</li>`).join("") || "<li>当前无阻塞模块</li>"}</ul>
    </article>
    <article class="ref-card">
      <h4>近期风险热点</h4>
      <ul>${risky.map((item) => `<li>${escapeHtml(item.name)} · 风险 ${item.risk}</li>`).join("") || "<li>暂无高风险模块</li>"}</ul>
    </article>
    <article class="ref-card">
      <h4>最近提交摘要</h4>
      <ul>${commits.map((item) => `<li><code>${escapeHtml(item.hash)}</code> ${escapeHtml(item.subject)}</li>`).join("") || "<li>暂无提交记录</li>"}</ul>
    </article>
  `;
}

function renderPlanHistory() {
  const history = state.snapshot?.planBoard?.history || [];
  refs.planHistory.innerHTML = history
    .map((row) => {
      const md = [
        "#### 下一步开发计划",
        row.nextPlanMd || "（空）",
        "",
        "#### 错误更正计划",
        row.correctionPlanMd || "（空）",
      ].join("\n");

      return `
        <article class="history-card">
          <div class="log-head">
            <strong>${escapeHtml(row.timestamp || "未标记时间")}</strong>
            <span class="source-tag">plan</span>
          </div>
          <div class="md">${markdownToHtml(md)}</div>
        </article>
      `;
    })
    .join("") || `<p class="muted">暂无历史计划记录。</p>`;
}

async function savePlan() {
  const nextPlanMd = refs.nextPlanInput.value || "";
  const correctionPlanMd = refs.correctionPlanInput.value || "";

  setSaveHint("保存中...", "");

  try {
    const res = await fetch("/__savc/progress/plan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ nextPlanMd, correctionPlanMd }),
    });

    if (!res.ok) {
      throw new Error(`save failed: ${res.status}`);
    }

    state.planDirty = false;
    setSaveHint("保存成功，已写入 docs/project-plan-board.md", "success");
    await refreshSnapshot(true);
  } catch (error) {
    console.warn(error);
    setSaveHint("保存失败，请检查控制台日志", "error");
  }
}

function setSaveHint(text, mode) {
  refs.saveHint.textContent = text;
  refs.saveHint.classList.remove("success", "error");
  if (mode) {
    refs.saveHint.classList.add(mode);
  }
}

async function copyPath(value, button) {
  if (!value) return;
  const original = button.textContent;
  try {
    await navigator.clipboard.writeText(value);
    button.textContent = "已复制";
  } catch {
    button.textContent = "复制失败";
  }
  setTimeout(() => {
    button.textContent = original;
  }, 900);
}

function startGraphLoop() {
  const loop = (ts) => {
    drawGraph(ts);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function layoutGraphNodes(modules, width, height) {
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  const ringRadius = Math.min(width, height) * 0.35;

  const out = [];
  modules.forEach((item, index) => {
    if (index === 0) {
      out.push({
        id: item.id,
        x: centerX,
        y: centerY,
        w: 176,
        h: 112,
        seed: 0.7,
      });
      return;
    }

    const angle = ((index - 1) / Math.max(modules.length - 1, 1)) * Math.PI * 2 - Math.PI / 2;
    const wobble = 0.82 + (index % 3) * 0.08;
    out.push({
      id: item.id,
      x: centerX + Math.cos(angle) * ringRadius * wobble,
      y: centerY + Math.sin(angle) * ringRadius * 0.62 * wobble,
      w: 152,
      h: 94,
      seed: index * 0.91,
    });
  });

  return out;
}

function drawGraph(ts) {
  const snapshot = state.snapshot;
  if (!snapshot || !refs.brainCanvas) return;
  const modules = snapshot.modules || [];
  if (!modules.length) return;

  const canvas = refs.brainCanvas;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(window.devicePixelRatio || 1, 1);
  const width = Math.max(320, Math.floor(rect.width));
  const height = Math.max(300, Math.floor(rect.height));

  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const key = `${width}x${height}:${modules.map((item) => `${item.id}:${item.progress}`).join("|")}`;
  if (key !== state.graphLayoutKey) {
    state.graphNodes = layoutGraphNodes(modules, width, height);
    state.graphLayoutKey = key;
  }

  const nodeMap = new Map(state.graphNodes.map((node) => [node.id, node]));

  const glow = ctx.createRadialGradient(width * 0.5, height * 0.5, 12, width * 0.5, height * 0.5, Math.max(width, height) * 0.52);
  glow.addColorStop(0, "rgba(33, 111, 145, 0.24)");
  glow.addColorStop(1, "rgba(8, 16, 27, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  for (const module of modules) {
    const from = nodeMap.get(module.id);
    if (!from) continue;
    for (const dep of module.deps || []) {
      const to = nodeMap.get(dep);
      if (!to) continue;
      const alpha = module.status === "blocked" ? 0.45 : 0.3;
      ctx.strokeStyle = module.status === "blocked" ? `rgba(255,95,95,${alpha})` : `rgba(124,203,223,${alpha})`;
      ctx.lineWidth = 1.35;
      const fromAnchor = rectangleAnchorPoint(from, to);
      const toAnchor = rectangleAnchorPoint(to, from);
      ctx.beginPath();
      ctx.moveTo(fromAnchor.x, fromAnchor.y);
      ctx.lineTo(toAnchor.x, toAnchor.y);
      ctx.stroke();

      const angle = Math.atan2(toAnchor.y - fromAnchor.y, toAnchor.x - fromAnchor.x);
      const px = toAnchor.x;
      const py = toAnchor.y;
      ctx.fillStyle = module.status === "blocked" ? "rgba(255,120,120,0.7)" : "rgba(140,215,236,0.7)";
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - Math.cos(angle - 0.36) * 6, py - Math.sin(angle - 0.36) * 6);
      ctx.lineTo(px - Math.cos(angle + 0.36) * 6, py - Math.sin(angle + 0.36) * 6);
      ctx.closePath();
      ctx.fill();
    }
  }

  for (let i = 0; i < modules.length; i++) {
    const module = modules[i];
    const node = state.graphNodes[i];
    if (!node) continue;

    const pulse = 1 + Math.sin(ts * 0.0018 + node.seed) * 0.02;
    const cardW = node.w * pulse;
    const cardH = node.h * pulse;
    const base = STATUS_COLOR[module.status] || "#8ea1b4";
    const meta = moduleMeta(module);
    const left = node.x - cardW / 2;
    const top = node.y - cardH / 2;

    const grad = ctx.createLinearGradient(left, top, left, top + cardH);
    grad.addColorStop(0, "rgba(255,255,255,0.96)");
    grad.addColorStop(1, "rgba(255,246,242,0.94)");
    roundRectPath(ctx, left, top, cardW, cardH, 14);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = hexToRgba(base, module.id === state.selectedModuleId ? 0.72 : 0.35);
    ctx.lineWidth = module.id === state.selectedModuleId ? 2.4 : 1.2;
    ctx.stroke();

    roundRectPath(ctx, left + 7, top + 7, cardW - 14, 20, 10);
    ctx.fillStyle = hexToRgba(base, 0.18);
    ctx.fill();

    ctx.textAlign = "left";
    ctx.fillStyle = "#5f3a46";
    ctx.font = "600 11px Noto Sans SC";
    ctx.fillText(`${STATUS_LABEL[module.status] || module.status} · ${module.progress}%`, left + 13, top + 21);

    ctx.fillStyle = "#2f2330";
    ctx.font = "600 13px Noto Sans SC";
    ctx.fillText(`${meta.icon || "📦"} ${truncateCanvasText(ctx, module.name, cardW - 22)}`, left + 11, top + 43);

    const chips = (meta.elements || []).slice(0, 2);
    for (let c = 0; c < chips.length; c++) {
      const chipText = truncateCanvasText(ctx, chips[c], cardW - 46);
      const chipTop = top + 52 + c * 18;
      roundRectPath(ctx, left + 11, chipTop, cardW - 22, 15, 8);
      ctx.fillStyle = "rgba(255, 238, 231, 0.92)";
      ctx.fill();
      ctx.strokeStyle = "rgba(236, 148, 131, 0.35)";
      ctx.lineWidth = 0.9;
      ctx.stroke();
      ctx.fillStyle = "#8a5f6b";
      ctx.font = "500 10px Noto Sans SC";
      ctx.fillText(chipText, left + 16, chipTop + 11);
    }
  }
}

function onCanvasClick(event) {
  const snapshot = state.snapshot;
  if (!snapshot || !state.graphNodes.length) return;

  const rect = refs.brainCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  let hit = "";
  for (const node of state.graphNodes) {
    const left = node.x - node.w / 2;
    const top = node.y - node.h / 2;
    if (x >= left && x <= left + node.w && y >= top && y <= top + node.h) {
      hit = node.id;
      break;
    }
  }

  if (!hit) return;
  state.selectedModuleId = hit;
  renderModuleCards();
  renderDrawer();
}

function roundRectPath(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function rectangleAnchorPoint(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const halfW = from.w / 2;
  const halfH = from.h / 2;

  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return { x: from.x, y: from.y };
  }

  const sx = Math.abs(dx) / halfW;
  const sy = Math.abs(dy) / halfH;

  if (sx > sy) {
    return {
      x: from.x + Math.sign(dx) * halfW,
      y: from.y + dy / sx,
    };
  }

  return {
    x: from.x + dx / sy,
    y: from.y + Math.sign(dy) * halfH,
  };
}

function truncateCanvasText(ctx, text, maxWidth) {
  const input = String(text || "");
  if (!input) return "";
  if (ctx.measureText(input).width <= maxWidth) return input;
  let output = input;
  while (output.length > 1 && ctx.measureText(`${output}…`).width > maxWidth) {
    output = output.slice(0, -1);
  }
  return `${output}…`;
}

function markdownToHtml(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const out = [];
  let inList = false;
  let inCode = false;

  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine ?? "";

    if (line.startsWith("```")) {
      closeList();
      if (!inCode) {
        out.push("<pre><code>");
        inCode = true;
      } else {
        out.push("</code></pre>");
        inCode = false;
      }
      continue;
    }

    if (inCode) {
      out.push(`${escapeHtml(line)}\n`);
      continue;
    }

    if (!line.trim()) {
      closeList();
      continue;
    }

    if (/^#\s+/.test(line)) {
      closeList();
      out.push(`<h2>${escapeHtml(line.replace(/^#\s+/, ""))}</h2>`);
      continue;
    }

    if (/^##\s+/.test(line)) {
      closeList();
      out.push(`<h3>${escapeHtml(line.replace(/^##\s+/, ""))}</h3>`);
      continue;
    }

    if (/^####\s+/.test(line)) {
      closeList();
      out.push(`<h5>${escapeHtml(line.replace(/^####\s+/, ""))}</h5>`);
      continue;
    }

    if (/^###\s+/.test(line)) {
      closeList();
      out.push(`<h4>${escapeHtml(line.replace(/^###\s+/, ""))}</h4>`);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${renderInlineMarkdown(line.replace(/^\d+\.\s+/, ""))}</li>`);
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${renderInlineMarkdown(line.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }

    closeList();
    out.push(`<p>${renderInlineMarkdown(line)}</p>`);
  }

  closeList();
  if (inCode) out.push("</code></pre>");
  return out.join("");
}

function renderInlineMarkdown(text) {
  const safe = escapeHtml(text || "");
  return safe
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateTime(iso) {
  if (!iso) return "--";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatDate(iso) {
  if (!iso) return "--";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString("zh-CN");
}

function hexToRgba(hex, alpha) {
  const cleaned = hex.replace("#", "");
  if (cleaned.length !== 6) return `rgba(255,255,255,${alpha})`;
  const r = Number.parseInt(cleaned.slice(0, 2), 16);
  const g = Number.parseInt(cleaned.slice(2, 4), 16);
  const b = Number.parseInt(cleaned.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function closeFilePreview() {
  refs.filePreview.hidden = true;
}

async function openFilePreview(filePath, title) {
  if (!filePath) return;
  state.previewFilePath = filePath;
  refs.filePreview.hidden = false;
  refs.filePreviewTitle.textContent = title || "文件详情";
  refs.filePreviewPath.textContent = filePath;
  refs.filePreviewBody.innerHTML = `<p class="muted">正在读取 ${escapeHtml(filePath)} ...</p>`;

  try {
    const url = `/__savc/progress/file?path=${encodeURIComponent(filePath)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`read file failed: ${res.status}`);
    }
    const payload = await res.json();
    if (state.previewFilePath !== filePath) {
      return;
    }
    refs.filePreviewTitle.textContent = payload.title || title || "文件详情";
    refs.filePreviewPath.textContent = payload.file || filePath;
    refs.filePreviewBody.innerHTML = markdownToHtml(payload.content || "");
  } catch (error) {
    refs.filePreviewBody.innerHTML = `<p class="muted">读取失败：${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`;
  }
}
