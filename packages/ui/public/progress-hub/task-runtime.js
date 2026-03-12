const API = {
  snapshot: "/__savc/task-runtime/snapshot",
  stream: "/__savc/task-runtime/stream",
  create: "/__savc/task-runtime/create",
  control: "/__savc/task-runtime/control",
  demo: "/__savc/task-runtime/demo",
};

const STATUS_LABEL = {
  queued: "排队中",
  running: "执行中",
  retry: "重试中",
  succeeded: "成功",
  failed: "失败",
  canceled: "取消",
};

const state = {
  tasks: new Map(),
  events: [],
  metrics: {
    total: 0,
    queued: 0,
    running: 0,
    retry: 0,
    succeeded: 0,
    failed: 0,
    canceled: 0,
  },
  connection: "connecting",
  filterTaskId: "",
  stream: null,
};

const refs = {
  refreshBtn: document.getElementById("refreshBtn"),
  connectionPill: document.getElementById("connectionPill"),
  lastEventAt: document.getElementById("lastEventAt"),
  createForm: document.getElementById("createForm"),
  taskStats: document.getElementById("taskStats"),
  taskList: document.getElementById("taskList"),
  eventList: document.getElementById("eventList"),
  demoButtons: Array.from(document.querySelectorAll(".demo-btn")),
  streamFilter: document.getElementById("streamFilter"),
};

init();

function init() {
  bindEvents();
  void refreshSnapshot(true);
  connectStream();
}

function bindEvents() {
  refs.refreshBtn?.addEventListener("click", () => {
    void refreshSnapshot(true);
  });

  refs.createForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(refs.createForm);
    const tags = String(form.get("tags") || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 8);

    try {
      await postJson(API.create, {
        title: String(form.get("title") || "").trim(),
        owner: String(form.get("owner") || "yuanyuan").trim(),
        channel: String(form.get("channel") || "telegram").trim(),
        maxAttempts: Number(form.get("maxAttempts") || 3),
        tags,
        actor: "task-runtime-ui",
        source: "api",
        message: "通过联调台创建任务",
      });
      refs.createForm.reset();
      const ownerInput = refs.createForm.querySelector("input[name='owner']");
      const channelInput = refs.createForm.querySelector("select[name='channel']");
      const retryInput = refs.createForm.querySelector("input[name='maxAttempts']");
      if (ownerInput) ownerInput.value = "yuanyuan";
      if (channelInput) channelInput.value = "telegram";
      if (retryInput) retryInput.value = "3";
      await refreshSnapshot(true);
    } catch (error) {
      console.error(error);
      window.alert(`创建任务失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  for (const button of refs.demoButtons) {
    button.addEventListener("click", async () => {
      const mode = button.dataset.mode || "retry-success";
      try {
        await postJson(API.demo, {
          mode,
          title: `Demo-${mode}-${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`,
          actor: "task-runtime-ui",
        });
        await refreshSnapshot(true);
      } catch (error) {
        console.error(error);
        window.alert(`Demo 启动失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  refs.streamFilter?.addEventListener("change", async () => {
    state.filterTaskId = refs.streamFilter.value || "";
    connectStream();
    await refreshSnapshot(true);
  });

  refs.taskList?.addEventListener("click", async (event) => {
    const target = event.target.closest("button[data-action]");
    if (!target) return;
    const taskId = target.dataset.taskId || "";
    const action = target.dataset.action || "";
    if (!taskId || !action) return;

    if (action === "subscribe") {
      state.filterTaskId = taskId;
      refs.streamFilter.value = taskId;
      connectStream();
      await refreshSnapshot(true);
      return;
    }

    const task = state.tasks.get(taskId);
    const payload = {
      taskId,
      action,
      actor: "task-runtime-ui",
      source: "api",
    };

    if (action === "running" && task) {
      payload.progress = Math.min((Number(task.progress) || 0) + 22, 96);
      payload.message = "联调台手动推进任务执行";
    }
    if (action === "retry" && task) {
      payload.progress = Math.min((Number(task.progress) || 0) + 8, 90);
      payload.message = "联调台手动触发重试";
    }

    try {
      await postJson(API.control, payload);
      await refreshSnapshot(false);
    } catch (error) {
      console.error(error);
      window.alert(`状态推进失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

async function refreshSnapshot(silent = false) {
  try {
    const endpoint = new URL(API.snapshot, window.location.origin);
    if (state.filterTaskId) {
      endpoint.searchParams.set("taskId", state.filterTaskId);
    }
    const res = await fetch(endpoint.toString(), {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`snapshot failed: ${res.status}`);
    }
    const payload = await res.json();
    applySnapshot(payload);
    renderAll();
  } catch (error) {
    if (!silent) {
      console.error(error);
    }
    setConnection("离线", "offline");
  }
}

function connectStream() {
  if (state.stream) {
    state.stream.close();
    state.stream = null;
  }

  const endpoint = new URL(API.stream, window.location.origin);
  if (state.filterTaskId) {
    endpoint.searchParams.set("taskId", state.filterTaskId);
  }

  setConnection("连接中", "connecting");
  const stream = new EventSource(endpoint.toString());
  state.stream = stream;

  stream.onopen = () => {
    setConnection("在线", "online");
  };

  stream.addEventListener("task_snapshot", (event) => {
    try {
      const payload = JSON.parse(event.data);
      applySnapshot(payload);
      renderAll();
    } catch (error) {
      console.error("task_snapshot parse failed", error);
    }
  });

  stream.addEventListener("task_event", (event) => {
    try {
      const payload = JSON.parse(event.data);
      applyEvent(payload);
      renderAll();
    } catch (error) {
      console.error("task_event parse failed", error);
    }
  });

  stream.addEventListener("ping", () => {
    if (state.connection !== "online") {
      setConnection("在线", "online");
    }
  });

  stream.onerror = () => {
    setConnection("重连中", "reconnecting");
  };
}

function applySnapshot(payload) {
  const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
  const events = Array.isArray(payload.recentEvents) ? payload.recentEvents : [];
  const metrics = payload.metrics && typeof payload.metrics === "object" ? payload.metrics : null;

  state.tasks.clear();
  for (const row of tasks) {
    if (!row || typeof row !== "object") continue;
    if (!row.id) continue;
    state.tasks.set(String(row.id), row);
  }

  state.events = dedupeEvents(events);

  if (metrics) {
    state.metrics = {
      total: Number(metrics.total || tasks.length),
      queued: Number(metrics.queued || 0),
      running: Number(metrics.running || 0),
      retry: Number(metrics.retry || 0),
      succeeded: Number(metrics.succeeded || 0),
      failed: Number(metrics.failed || 0),
      canceled: Number(metrics.canceled || 0),
    };
  } else {
    state.metrics = computeMetricsFromTasks();
  }

  syncFilterOptions();
}

function applyEvent(event) {
  if (!event || typeof event !== "object" || !event.taskId) return;

  const taskId = String(event.taskId);
  const existed = state.tasks.get(taskId);
  if (existed) {
    existed.status = event.state || existed.status;
    existed.progress = Number.isFinite(Number(event.progress)) ? Number(event.progress) : existed.progress;
    existed.updatedAt = event.timestamp || existed.updatedAt;
    existed.lastMessage = event.message || existed.lastMessage;
    existed.attempt = Number(event.attempt || existed.attempt || 1);
    existed.maxAttempts = Number(event.maxAttempts || existed.maxAttempts || 1);
    state.tasks.set(taskId, existed);
  }

  state.events = dedupeEvents([event, ...state.events]).slice(0, 180);
  state.metrics = computeMetricsFromTasks();
  if (event.timestamp) {
    refs.lastEventAt.textContent = formatTime(event.timestamp);
  }
}

function dedupeEvents(events) {
  const seen = new Set();
  const out = [];
  for (const row of events) {
    const id = row && row.id ? String(row.id) : `${row.taskId || ""}-${row.seq || ""}`;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

function computeMetricsFromTasks() {
  const metrics = {
    total: state.tasks.size,
    queued: 0,
    running: 0,
    retry: 0,
    succeeded: 0,
    failed: 0,
    canceled: 0,
  };
  for (const task of state.tasks.values()) {
    const status = String(task.status || "queued");
    if (Object.prototype.hasOwnProperty.call(metrics, status)) {
      metrics[status] += 1;
    }
  }
  return metrics;
}

function renderAll() {
  renderStats();
  renderTasks();
  renderEvents();
}

function renderStats() {
  const metrics = state.metrics || computeMetricsFromTasks();
  refs.taskStats.innerHTML = [
    statCard("总任务", metrics.total),
    statCard("执行中", (metrics.running || 0) + (metrics.retry || 0)),
    statCard("成功", metrics.succeeded || 0),
    statCard("失败/取消", (metrics.failed || 0) + (metrics.canceled || 0)),
  ].join("");
}

function statCard(label, value) {
  return `<div class="stat-card"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(String(value))}</div></div>`;
}

function renderTasks() {
  const rows = Array.from(state.tasks.values()).sort((a, b) => Date.parse(b.updatedAt || "0") - Date.parse(a.updatedAt || "0"));
  if (rows.length === 0) {
    refs.taskList.innerHTML = '<p class="empty">暂无任务，可先创建或点击 Demo 回放。</p>';
    return;
  }

  refs.taskList.innerHTML = rows.map((task) => {
    const status = String(task.status || "queued");
    const progress = Math.max(0, Math.min(100, Number(task.progress || 0)));
    const selected = state.filterTaskId && state.filterTaskId === task.id;
    return `
      <section class="task-card">
        <div class="task-head">
          <h3>${escapeHtml(task.title || task.id)}</h3>
          <span class="status ${escapeHtml(status)}">${escapeHtml(STATUS_LABEL[status] || status)}</span>
        </div>
        <div class="task-meta">
          <span>ID: ${escapeHtml(task.id)}</span>
          <span>owner: ${escapeHtml(task.owner || "-")}</span>
          <span>channel: ${escapeHtml(task.channel || "-")}</span>
          <span>attempt: ${escapeHtml(String(task.attempt || 1))}/${escapeHtml(String(task.maxAttempts || 1))}</span>
          <span>更新时间: ${escapeHtml(formatTime(task.updatedAt))}</span>
        </div>
        <div class="progress-wrap"><div class="progress-bar" style="width:${progress}%"></div></div>
        <p class="task-message">${escapeHtml(task.lastMessage || "-")}</p>
        <div class="actions">
          <button data-action="subscribe" data-task-id="${escapeHtml(task.id)}" type="button">${selected ? "已订阅" : "订阅"}</button>
          <button data-action="running" data-task-id="${escapeHtml(task.id)}" type="button">推进</button>
          <button data-action="retry" data-task-id="${escapeHtml(task.id)}" type="button">重试</button>
          <button data-action="succeeded" data-task-id="${escapeHtml(task.id)}" type="button">成功</button>
          <button data-action="failed" data-task-id="${escapeHtml(task.id)}" type="button">失败</button>
          <button data-action="canceled" data-task-id="${escapeHtml(task.id)}" type="button">取消</button>
        </div>
      </section>
    `;
  }).join("");
}

function renderEvents() {
  const rows = state.filterTaskId
    ? state.events.filter((event) => String(event.taskId || "") === state.filterTaskId)
    : state.events;

  if (rows.length === 0) {
    refs.eventList.innerHTML = '<p class="empty">暂无事件。</p>';
    return;
  }

  refs.eventList.innerHTML = rows.slice(0, 180).map((event) => {
    const status = String(event.state || "queued");
    const progress = Number(event.progress || 0);
    return `
      <div class="event-row">
        <div class="line1">
          <span>${escapeHtml(formatTime(event.timestamp))}</span>
          <span class="status ${escapeHtml(status)}">${escapeHtml(STATUS_LABEL[status] || status)}</span>
        </div>
        <div class="line2">
          <span class="task-id">${escapeHtml(String(event.taskId || "-"))}</span>
          ·
          <span>${escapeHtml(String(event.actor || "api"))}</span>
          ·
          <span>${escapeHtml(String(progress))}%</span>
        </div>
        <div class="line2 msg">${escapeHtml(String(event.message || ""))}</div>
      </div>
    `;
  }).join("");

  const latest = rows[0];
  if (latest?.timestamp) {
    refs.lastEventAt.textContent = formatTime(latest.timestamp);
  }
}

function syncFilterOptions() {
  if (!refs.streamFilter) return;
  const values = Array.from(state.tasks.values());
  const options = [
    '<option value="">全部任务</option>',
    ...values.map((task) => `<option value="${escapeHtml(task.id)}">${escapeHtml(task.title || task.id)}</option>`),
  ];
  refs.streamFilter.innerHTML = options.join("");
  refs.streamFilter.value = state.filterTaskId || "";
}

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let details = "";
    try {
      const data = await res.json();
      details = data.error || data.message || "";
    } catch {
      details = await res.text();
    }
    throw new Error(`request failed (${res.status}): ${details}`);
  }
  return await res.json();
}

function setConnection(text, status) {
  state.connection = status;
  refs.connectionPill.textContent = text;
  if (status === "online") {
    refs.connectionPill.style.borderColor = "rgba(57, 224, 131, 0.4)";
    refs.connectionPill.style.color = "#8bfac2";
    refs.connectionPill.style.background = "rgba(57, 224, 131, 0.1)";
    return;
  }
  if (status === "reconnecting") {
    refs.connectionPill.style.borderColor = "rgba(248, 184, 74, 0.4)";
    refs.connectionPill.style.color = "#ffd992";
    refs.connectionPill.style.background = "rgba(248, 184, 74, 0.1)";
    return;
  }
  refs.connectionPill.style.borderColor = "rgba(255, 102, 116, 0.4)";
  refs.connectionPill.style.color = "#ffadb7";
  refs.connectionPill.style.background = "rgba(255, 102, 116, 0.1)";
}

function formatTime(value) {
  const t = Date.parse(String(value || ""));
  if (!Number.isFinite(t)) return "--";
  return new Date(t).toLocaleString("zh-CN", { hour12: false });
}

function escapeHtml(input) {
  return String(input || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
