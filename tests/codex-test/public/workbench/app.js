const state = {
  snapshot: null,
  activeTab: "interaction",
  activeMode: "dev",
  selectedSession: "",
  sessionFilter: "",
  sending: false,
  stream: null,
  fallbackPoll: null,
  lastUserText: "",
  settingsDirty: false,
};

const MODE_META = {
  companion: { label: "陪伴", desc: "情感支持 + 轻任务" },
  dev: { label: "开发", desc: "结论/步骤/风险" },
  debug: { label: "排障", desc: "复现/定位/修复" },
  plan: { label: "计划", desc: "拆解/排期/里程碑" },
};

const refs = {
  connectionBadge: document.getElementById("connectionBadge"),
  updatedAt: document.getElementById("updatedAt"),
  refreshBtn: document.getElementById("refreshBtn"),
  modeSwitch: document.getElementById("modeSwitch"),
  sessionFilter: document.getElementById("sessionFilter"),
  sessionList: document.getElementById("sessionList"),
  sessionCount: document.getElementById("sessionCount"),
  tabs: Array.from(document.querySelectorAll("#tabs .tab")),
  views: {
    interaction: document.getElementById("view-interaction"),
    execution: document.getElementById("view-execution"),
    context: document.getElementById("view-context"),
    settings: document.getElementById("view-settings"),
  },
  timeline: document.getElementById("timeline"),
  composerForm: document.getElementById("composerForm"),
  messageInput: document.getElementById("messageInput"),
  composerHint: document.getElementById("composerHint"),
  sendBtn: document.getElementById("sendBtn"),
  toolTimeline: document.getElementById("toolTimeline"),
  toolCount: document.getElementById("toolCount"),
  memoryList: document.getElementById("memoryList"),
  docList: document.getElementById("docList"),
  commitList: document.getElementById("commitList"),
  preferencesForm: document.getElementById("preferencesForm"),
  settingsHint: document.getElementById("settingsHint"),
  activeSession: document.getElementById("activeSession"),
  statsGrid: document.getElementById("statsGrid"),
  channelBreakdown: document.getElementById("channelBreakdown"),
  retryLastBtn: document.getElementById("retryLastBtn"),
  copySummaryBtn: document.getElementById("copySummaryBtn"),
  mockFailureBtn: document.getElementById("mockFailureBtn"),
};

init().catch((error) => {
  console.error(error);
});

async function init() {
  bindEvents();
  await loadSnapshot(true);
  connectStream();
  state.fallbackPoll = setInterval(() => {
    void loadSnapshot();
  }, 20_000);
}

function bindEvents() {
  refs.refreshBtn.addEventListener("click", () => {
    void loadSnapshot(true);
  });

  refs.sessionFilter.addEventListener("input", (event) => {
    state.sessionFilter = event.target.value || "";
    renderSessionList();
  });

  refs.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const next = tab.dataset.tab;
      if (!next) return;
      state.activeTab = next;
      renderTabs();
    });
  });

  refs.composerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void sendMessage();
  });

  refs.preferencesForm.addEventListener("input", () => {
    state.settingsDirty = true;
    refs.settingsHint.textContent = "有未保存设置";
  });

  refs.preferencesForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void savePreferences();
  });

  refs.retryLastBtn.addEventListener("click", () => {
    if (!state.lastUserText) return;
    refs.messageInput.value = state.lastUserText;
    void sendMessage();
  });

  refs.copySummaryBtn.addEventListener("click", async () => {
    if (!state.snapshot) return;
    const session = state.snapshot.activeSession;
    const latest = state.snapshot.timeline.at(-1);
    const summary = [
      `session=${session.sessionKey}`,
      `mode=${session.mode}`,
      `channel=${session.channel}`,
      `latest=${latest ? latest.text : "-"}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(summary);
      refs.composerHint.textContent = "已复制会话摘要";
    } catch {
      refs.composerHint.textContent = "复制失败，请手动复制";
    }
  });

  refs.mockFailureBtn.addEventListener("click", () => {
    refs.messageInput.value = "请模拟 timeout 失败并给我修复步骤";
    state.activeMode = "debug";
    void sendMessage();
  });

  window.addEventListener("beforeunload", () => {
    if (state.stream) state.stream.close();
    if (state.fallbackPoll) clearInterval(state.fallbackPoll);
  });
}

function connectStream() {
  if (state.stream) {
    state.stream.close();
  }

  const stream = new EventSource("/__savc/workbench/stream");
  state.stream = stream;

  stream.addEventListener("snapshot", () => {
    setConnection(true);
    void loadSnapshot();
  });

  stream.onopen = () => {
    setConnection(true);
  };

  stream.onerror = () => {
    setConnection(false);
  };
}

function setConnection(online) {
  refs.connectionBadge.classList.toggle("offline", !online);
  refs.connectionBadge.textContent = online ? "实时连接" : "连接波动";
}

function activeSessionOrFallback(snapshot) {
  const sessions = snapshot.sessions || [];
  return sessions.find((item) => item.sessionKey === state.selectedSession) || sessions[0] || null;
}

function snapshotUrl() {
  const params = new URLSearchParams();
  if (state.selectedSession) params.set("sessionKey", state.selectedSession);
  if (state.activeMode) params.set("mode", state.activeMode);
  return `/__savc/workbench/snapshot?${params.toString()}`;
}

async function loadSnapshot(force = false) {
  try {
    const response = await fetch(snapshotUrl(), {
      cache: force ? "reload" : "no-store",
    });
    if (!response.ok) throw new Error(`snapshot failed: ${response.status}`);
    const data = await response.json();
    state.snapshot = data;

    if (!state.selectedSession) {
      state.selectedSession = data.activeSession.sessionKey;
    }

    const matched = activeSessionOrFallback(data);
    if (matched) {
      state.selectedSession = matched.sessionKey;
      state.activeMode = matched.mode;
    }

    renderAll();
  } catch (error) {
    refs.composerHint.textContent = `快照加载失败：${error instanceof Error ? error.message : String(error)}`;
    setConnection(false);
  }
}

function renderAll() {
  if (!state.snapshot) return;
  refs.updatedAt.textContent = formatDateTime(state.snapshot.generatedAt);
  renderModeSwitch();
  renderSessionList();
  renderTabs();
  renderTimeline();
  renderTools();
  renderContext();
  renderInspector();
  if (!state.settingsDirty) {
    hydrateSettingsForm();
  }
}

function renderModeSwitch() {
  refs.modeSwitch.innerHTML = "";
  for (const key of Object.keys(MODE_META)) {
    const mode = key;
    const meta = MODE_META[mode];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `mode-chip ${state.activeMode === mode ? "active" : ""}`;
    btn.innerHTML = `<strong>${meta.label}</strong><br><span class="hint">${meta.desc}</span>`;
    btn.addEventListener("click", async () => {
      if (!state.snapshot) return;
      state.activeMode = mode;
      const target =
        state.snapshot.sessions.find((item) => item.mode === mode) || state.snapshot.sessions[0];
      if (!target) return;
      state.selectedSession = target.sessionKey;
      await fetch(
        `/__savc/workbench/mode?sessionKey=${encodeURIComponent(state.selectedSession)}&mode=${encodeURIComponent(mode)}`,
        { method: "POST" },
      );
      await loadSnapshot(true);
    });
    refs.modeSwitch.appendChild(btn);
  }
}

function renderSessionList() {
  if (!state.snapshot) return;
  const keyword = state.sessionFilter.trim().toLowerCase();
  const sessions = state.snapshot.sessions.filter((item) => {
    if (!keyword) return true;
    return `${item.title} ${item.channel} ${item.mode}`.toLowerCase().includes(keyword);
  });

  refs.sessionCount.textContent = String(sessions.length);
  refs.sessionList.innerHTML = "";

  if (sessions.length === 0) {
    refs.sessionList.innerHTML = `<div class="empty">未找到匹配会话</div>`;
    return;
  }

  for (const session of sessions) {
    const el = document.createElement("article");
    el.className = `session-item ${session.sessionKey === state.selectedSession ? "active" : ""}`;
    const modeLabel = MODE_META[session.mode]?.label || session.mode;
    el.innerHTML = `
      <h4>${escapeHtml(session.title)}</h4>
      <p>${escapeHtml(session.lastMessage)}</p>
      <div class="session-meta">
        <span>${escapeHtml(modeLabel)} · ${escapeHtml(session.channel)}</span>
        <span>${session.unread > 0 ? `未读 ${session.unread}` : formatTime(session.updatedAt)}</span>
      </div>
    `;
    el.addEventListener("click", () => {
      state.selectedSession = session.sessionKey;
      state.activeMode = session.mode;
      void loadSnapshot(true);
    });
    refs.sessionList.appendChild(el);
  }
}

function renderTabs() {
  refs.tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === state.activeTab);
  });

  Object.entries(refs.views).forEach(([name, view]) => {
    view.classList.toggle("active", name === state.activeTab);
  });
}

function renderTimeline() {
  if (!state.snapshot) return;
  const rows = state.snapshot.timeline || [];
  refs.timeline.innerHTML = "";

  if (rows.length === 0) {
    refs.timeline.innerHTML = `<div class="empty">当前会话暂无消息</div>`;
    return;
  }

  for (const row of rows) {
    const box = document.createElement("article");
    box.className = `message ${row.role}`;
    box.innerHTML = `
      <div class="message-head">
        <span>${escapeHtml(row.role)}</span>
        <span>${formatDateTime(row.createdAt)}</span>
      </div>
      <pre>${escapeHtml(row.text)}</pre>
    `;
    refs.timeline.appendChild(box);
  }

  refs.timeline.scrollTop = refs.timeline.scrollHeight;
  refs.composerHint.textContent = `模式 ${MODE_META[state.activeMode].label}：${MODE_META[state.activeMode].desc}`;
}

function renderTools() {
  if (!state.snapshot) return;
  const rows = state.snapshot.toolTimeline || [];
  refs.toolCount.textContent = String(rows.length);
  refs.toolTimeline.innerHTML = "";

  if (rows.length === 0) {
    refs.toolTimeline.innerHTML = `<div class="empty">暂无工具调用</div>`;
    return;
  }

  for (const row of rows) {
    const item = document.createElement("article");
    item.className = "tool-item";
    item.innerHTML = `
      <div class="tool-top">
        <strong>${escapeHtml(row.tool)}</strong>
        <span class="status-chip ${row.status}">${row.status}</span>
      </div>
      <p>${escapeHtml(row.summary)}</p>
      <p class="mono">${formatDateTime(row.startedAt)}${row.durationMs ? ` · ${row.durationMs}ms` : ""}</p>
      ${row.error ? `<div class="tool-error">${escapeHtml(row.error)}</div>` : ""}
    `;
    refs.toolTimeline.appendChild(item);
  }
}

function renderContext() {
  if (!state.snapshot) return;

  refs.memoryList.innerHTML = renderContextList(
    state.snapshot.context.memories,
    (item) => `<strong>${escapeHtml(item.title)}</strong><div class="line2">score ${item.score} · ${escapeHtml(item.note)}</div>`,
  );

  refs.docList.innerHTML = renderContextList(
    state.snapshot.context.docs,
    (item) => `<strong>${escapeHtml(item.title)}</strong><div class="line2 mono">${escapeHtml(item.file)}</div><div class="line2">${escapeHtml(item.excerpt)}</div>`,
  );

  refs.commitList.innerHTML = renderContextList(
    state.snapshot.context.commits,
    (item) => `<strong class="mono">${escapeHtml(item.hash)}</strong><div class="line2">${escapeHtml(item.subject)}</div><div class="line2">${formatDateTime(item.date)}</div>`,
  );
}

function renderContextList(rows, renderer) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return `<div class="empty">暂无数据</div>`;
  }
  return rows.map((item) => `<div class="context-item">${renderer(item)}</div>`).join("");
}

function hydrateSettingsForm() {
  if (!state.snapshot) return;
  const pref = state.snapshot.preferences;
  const form = refs.preferencesForm;
  form.modelProfile.value = pref.modelProfile;
  form.fallbackModel.value = pref.fallbackModel;
  form.ttsProvider.value = pref.ttsProvider;
  form.ttsVoice.value = pref.ttsVoice;
  form.live2dMode.value = pref.live2dMode;
  form.defaultMode.value = pref.defaultMode;
  form.live2dSensitivity.value = String(pref.live2dSensitivity);
  form.autoMemoryRecall.checked = Boolean(pref.autoMemoryRecall);
  form.conciseOutput.checked = Boolean(pref.conciseOutput);
  refs.settingsHint.textContent = "设置已同步";
}

function renderInspector() {
  if (!state.snapshot) return;
  const active = state.snapshot.activeSession;
  const activeSession = state.snapshot.sessions.find((item) => item.sessionKey === active.sessionKey);

  refs.activeSession.innerHTML = [
    metricRow("会话", active.sessionKey),
    metricRow("模式", MODE_META[active.mode].label),
    metricRow("渠道", active.channel),
    metricRow("标题", activeSession ? activeSession.title : "-"),
  ].join("");

  refs.statsGrid.innerHTML = [
    statCard("会话数", state.snapshot.stats.sessionCount),
    statCard("未读", state.snapshot.stats.unreadTotal),
    statCard("运行中工具", state.snapshot.stats.runningTools),
    statCard("失败数", state.snapshot.stats.failedTools24h),
  ].join("");

  const counts = state.snapshot.sessions.reduce(
    (acc, row) => {
      acc[row.channel] = (acc[row.channel] || 0) + 1;
      return acc;
    },
    { web: 0, discord: 0, telegram: 0, unknown: 0 },
  );

  refs.channelBreakdown.innerHTML = Object.entries(counts)
    .map(([name, value]) => metricRow(name, value))
    .join("");
}

function metricRow(label, value) {
  return `<div class="metric-row"><span>${escapeHtml(String(label))}</span><strong class="mono">${escapeHtml(String(value))}</strong></div>`;
}

function statCard(label, value) {
  return `<div class="stat"><div class="hint">${escapeHtml(String(label))}</div><div class="value mono">${escapeHtml(String(value))}</div></div>`;
}

async function sendMessage() {
  if (!state.snapshot || state.sending) return;
  const text = refs.messageInput.value.trim();
  if (!text) return;

  state.sending = true;
  refs.sendBtn.disabled = true;
  refs.sendBtn.textContent = "发送中...";

  try {
    const response = await fetch("/__savc/workbench/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionKey: state.selectedSession,
        mode: state.activeMode,
        text,
      }),
    });
    if (!response.ok) throw new Error(`chat failed: ${response.status}`);

    state.lastUserText = text;
    refs.messageInput.value = "";
    await loadSnapshot(true);
  } catch (error) {
    refs.composerHint.textContent = `发送失败：${error instanceof Error ? error.message : String(error)}`;
  } finally {
    state.sending = false;
    refs.sendBtn.disabled = false;
    refs.sendBtn.textContent = "发送";
  }
}

async function savePreferences() {
  if (!state.snapshot) return;
  const form = refs.preferencesForm;
  const payload = {
    modelProfile: String(form.modelProfile.value || "").trim(),
    fallbackModel: String(form.fallbackModel.value || "").trim(),
    ttsProvider: form.ttsProvider.value,
    ttsVoice: String(form.ttsVoice.value || "").trim(),
    live2dMode: form.live2dMode.value,
    defaultMode: form.defaultMode.value,
    live2dSensitivity: Number.parseFloat(form.live2dSensitivity.value || "0.85"),
    autoMemoryRecall: Boolean(form.autoMemoryRecall.checked),
    conciseOutput: Boolean(form.conciseOutput.checked),
  };

  try {
    const response = await fetch("/__savc/workbench/preferences", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`save failed: ${response.status}`);
    state.settingsDirty = false;
    refs.settingsHint.textContent = "保存成功";
    state.activeMode = payload.defaultMode;
    await loadSnapshot(true);
  } catch (error) {
    refs.settingsHint.textContent = `保存失败：${error instanceof Error ? error.message : String(error)}`;
  }
}

function escapeHtml(input) {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleTimeString("zh-CN", { hour12: false });
}
