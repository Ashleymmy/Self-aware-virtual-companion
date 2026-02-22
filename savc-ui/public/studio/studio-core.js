// ─── State (real API driven) ───
let currentView = 'dev';
let monitorInterval = null;
let currentFilter = 'all';
let studioPollTimer = null;
const STUDIO_CACHE_KEY = 'savc.studio.cache.v1';

const STUDIO_STATE = {
  progress: null,
  runtime: null,
  storageStatus: null,
  storageLogs: [],
  selectedTaskIds: {
    companion: '',
    dev: '',
  },
  monitorLogs: [],
  localMessages: {
    companion: [],
    dev: [],
  },
  pending: {
    companion: false,
    dev: false,
  },
  streaming: {
    companion: false,
    dev: false,
  },
  agentState: {
    companion: 'idle',
    dev: 'idle',
  },
  llmSessions: {
    companion: '',
    dev: '',
  },
  projectHistory: {
    openedFiles: [],
    prompts: [],
  },
  progressStream: null,
  runtimeStream: null,
};

const CHANNEL_BADGE_CLASS = {
  web: 'badge-web',
  discord: 'badge-discord',
  telegram: 'badge-tg',
  tg: 'badge-tg',
  companion: 'badge-web',
};

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function escHtml(input) {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeMessageRows(rows, maxItems = 40) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => ({
      role: row?.role === 'user' ? 'user' : 'assistant',
      text: String(row?.text || '').trim(),
      at: row?.at ? String(row.at) : new Date().toISOString(),
    }))
    .filter((row) => row.text.length > 0)
    .slice(-maxItems);
}

function normalizeHistoryRows(rows, maxItems = 20) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => ({
      text: String(row?.text || '').trim(),
      at: row?.at ? String(row.at) : new Date().toISOString(),
    }))
    .filter((row) => row.text.length > 0)
    .slice(-maxItems);
}

function persistStudioCache() {
  try {
    const payload = {
      localMessages: {
        companion: normalizeMessageRows(STUDIO_STATE.localMessages.companion, 60),
        dev: normalizeMessageRows(STUDIO_STATE.localMessages.dev, 60),
      },
      llmSessions: {
        companion: String(STUDIO_STATE.llmSessions.companion || ''),
        dev: String(STUDIO_STATE.llmSessions.dev || ''),
      },
      projectHistory: {
        openedFiles: normalizeHistoryRows(STUDIO_STATE.projectHistory.openedFiles, 20),
        prompts: normalizeHistoryRows(STUDIO_STATE.projectHistory.prompts, 20),
      },
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(STUDIO_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage unavailable
  }
}

function restoreStudioCache() {
  try {
    const raw = localStorage.getItem(STUDIO_CACHE_KEY);
    if (!raw) return;
    const payload = JSON.parse(raw);
    STUDIO_STATE.localMessages.companion = normalizeMessageRows(payload?.localMessages?.companion, 60);
    STUDIO_STATE.localMessages.dev = normalizeMessageRows(payload?.localMessages?.dev, 60);
    STUDIO_STATE.llmSessions.companion = String(payload?.llmSessions?.companion || '');
    STUDIO_STATE.llmSessions.dev = String(payload?.llmSessions?.dev || '');
    STUDIO_STATE.projectHistory.openedFiles = normalizeHistoryRows(payload?.projectHistory?.openedFiles, 20);
    STUDIO_STATE.projectHistory.prompts = normalizeHistoryRows(payload?.projectHistory?.prompts, 20);
  } catch {
    // ignore cache corruption
  }
}

function pushHistoryRows(target, text, maxItems = 20) {
  const normalized = String(text || '').trim();
  if (!normalized) return;
  const now = new Date().toISOString();
  const next = [{ text: normalized, at: now }, ...toArray(target).filter((row) => row?.text !== normalized)].slice(0, maxItems);
  target.length = 0;
  next.forEach((row) => target.push(row));
}

function rememberLocalMessage(scope, role, text, at = new Date().toISOString()) {
  const normalized = String(text || '').trim();
  if (!normalized) return;
  STUDIO_STATE.localMessages[scope].push({ role, text: normalized, at });
  STUDIO_STATE.localMessages[scope] = STUDIO_STATE.localMessages[scope].slice(-60);
  if (role === 'user') {
    pushHistoryRows(STUDIO_STATE.projectHistory.prompts, normalized, 20);
  }
  persistStudioCache();
}

function startStreamingAssistantMessage(scope) {
  const row = {
    role: 'assistant',
    text: '',
    at: new Date().toISOString(),
    streaming: true,
  };
  STUDIO_STATE.localMessages[scope].push(row);
  STUDIO_STATE.localMessages[scope] = STUDIO_STATE.localMessages[scope].slice(-60);
  STUDIO_STATE.streaming[scope] = true;
  return row;
}

function updateStreamingAssistantMessage(scope, row, text) {
  if (!row) return;
  row.text = String(text || '');
  row.at = new Date().toISOString();
  STUDIO_STATE.streaming[scope] = true;
}

function finalizeStreamingAssistantMessage(scope, row, text) {
  const finalText = normalizeAssistantReply(text);
  if (row) {
    row.streaming = false;
    row.text = finalText;
    row.at = new Date().toISOString();
    if (!finalText) {
      const idx = STUDIO_STATE.localMessages[scope].indexOf(row);
      if (idx >= 0) STUDIO_STATE.localMessages[scope].splice(idx, 1);
    }
  } else if (finalText) {
    rememberLocalMessage(scope, 'assistant', finalText);
  }
  STUDIO_STATE.streaming[scope] = false;
  persistStudioCache();
  return finalText;
}

function dropStreamingAssistantMessage(scope, row) {
  if (row) {
    const idx = STUDIO_STATE.localMessages[scope].indexOf(row);
    if (idx >= 0) STUDIO_STATE.localMessages[scope].splice(idx, 1);
  }
  STUDIO_STATE.streaming[scope] = false;
  persistStudioCache();
}

function setPendingState(scope, pending) {
  STUDIO_STATE.pending[scope] = Boolean(pending);
  syncVscTouchbar();
}

function setAgentState(scope, state, detail = '') {
  STUDIO_STATE.agentState[scope] = state;
  const stateMap = {
    idle: detail || '正在倾听...',
    working: detail || '正在处理中...',
    done: detail || '回复完成',
    error: detail || '调用异常',
  };
  if (scope === 'companion') {
    const textEl = document.getElementById('companion-status-text');
    const dotEl = document.getElementById('companion-status-dot');
    if (textEl) textEl.textContent = stateMap[state] || stateMap.idle;
    if (dotEl) dotEl.className = `agent-state-dot state-${state === 'working' ? 'working' : state === 'error' ? 'error' : 'idle'}`;
  }
  if (scope === 'dev') {
    const textEl = document.getElementById('dev-status-text');
    const dotEl = document.getElementById('dev-status-dot');
    const cardEl = document.getElementById('dev-runtime-indicator');
    if (textEl) textEl.textContent = stateMap[state] || stateMap.idle;
    if (dotEl) dotEl.className = `agent-state-dot state-${state === 'working' ? 'working' : state === 'error' ? 'error' : 'idle'}`;
    if (cardEl) cardEl.className = `dev-runtime-indicator state-${state === 'working' ? 'working' : state === 'error' ? 'error' : 'idle'}`;
  }
}

function normalizeAssistantReply(raw) {
  let text = String(raw || '').replace(/\r\n?/g, '\n').trim();
  if (!text) return '';
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  text = text.replace(/```(?:thinking|analysis|reasoning)[\s\S]*?```/gi, '').trim();
  text = text.replace(/^\[[^\]\n]*\/[^\]\n]*\]\s*/i, '');
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

function renderInlineMarkdown(raw) {
  let output = escHtml(raw);
  output = output.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>');
  output = output.replace(/`([^`]+)`/g, '<code>$1</code>');
  output = output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  output = output.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  return output;
}

function renderAssistantMarkdown(raw) {
  const text = normalizeAssistantReply(raw);
  if (!text) return '<p>（空响应）</p>';
  const rows = text.split('\n');
  const chunks = [];
  let inUl = false;
  let inOl = false;
  let inCode = false;
  let codeLang = '';
  let codeBuffer = [];

  const closeLists = () => {
    if (inUl) { chunks.push('</ul>'); inUl = false; }
    if (inOl) { chunks.push('</ol>'); inOl = false; }
  };
  const flushCode = () => {
    const code = escHtml(codeBuffer.join('\n'));
    const lang = codeLang ? ` data-lang="${escHtml(codeLang)}"` : '';
    chunks.push(`<pre><code${lang}>${code}</code></pre>`);
    codeLang = '';
    codeBuffer = [];
  };

  for (const rawLine of rows) {
    const line = String(rawLine || '');
    const trimmed = line.trim();
    const codeFence = trimmed.match(/^```([a-zA-Z0-9_-]*)\s*$/);
    if (codeFence) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        closeLists();
        inCode = true;
        codeLang = codeFence[1] || '';
      }
      continue;
    }
    if (inCode) {
      codeBuffer.push(line);
      continue;
    }
    if (!trimmed) {
      closeLists();
      continue;
    }
    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      closeLists();
      const level = Math.min(4, heading[1].length);
      chunks.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    const bullet = trimmed.match(/^[-*+]\s+(.+)$/);
    if (bullet) {
      if (inOl) { chunks.push('</ol>'); inOl = false; }
      if (!inUl) { chunks.push('<ul>'); inUl = true; }
      chunks.push(`<li>${renderInlineMarkdown(bullet[1])}</li>`);
      continue;
    }
    const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (ordered) {
      if (inUl) { chunks.push('</ul>'); inUl = false; }
      if (!inOl) { chunks.push('<ol>'); inOl = true; }
      chunks.push(`<li>${renderInlineMarkdown(ordered[1])}</li>`);
      continue;
    }
    const quote = trimmed.match(/^>\s?(.+)$/);
    if (quote) {
      closeLists();
      chunks.push(`<blockquote>${renderInlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }
    closeLists();
    chunks.push(`<p>${renderInlineMarkdown(trimmed)}</p>`);
  }

  if (inCode) flushCode();
  closeLists();
  return chunks.join('') || '<p>（空响应）</p>';
}

function renderMessageBubbleHtml(line) {
  const text = String(line?.text || '');
  if ((line?.role || '') === 'assistant') {
    if (line?.streaming) {
      const safe = escHtml(text).replace(/\n/g, '<br>');
      return `${safe || '...'}<span class="stream-cursor" aria-hidden="true"></span>`;
    }
    return renderAssistantMarkdown(text);
  }
  return escHtml(text).replace(/\n/g, '<br>');
}

function formatTime(input) {
  if (!input) return '--:--';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '--:--';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDateTime(input) {
  if (!input) return '-';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('zh-CN', { hour12: false });
}

function channelBadgeClass(channel) {
  const key = String(channel || '').toLowerCase();
  return CHANNEL_BADGE_CLASS[key] || 'badge-web';
}

function statusBadgeClass(status) {
  if (status === 'failed' || status === 'canceled' || status === 'blocked') return 'badge-error';
  if (status === 'running' || status === 'in_progress' || status === 'retry') return 'badge-running';
  return 'badge-idle';
}

function traceColor(status) {
  if (status === 'failed' || status === 'canceled' || status === 'blocked') return 'var(--status-err)';
  if (status === 'running' || status === 'in_progress' || status === 'retry') return 'var(--status-warn)';
  return 'var(--status-ok)';
}

function progressClass(status) {
  if (status === 'failed' || status === 'canceled' || status === 'blocked') return 'fill-err';
  if (status === 'done' || status === 'succeeded') return 'fill-ok';
  return 'fill-accent';
}

function labelStatus(status) {
  const map = {
    queued: 'queued',
    running: 'running',
    retry: 'retry',
    succeeded: 'succeeded',
    failed: 'failed',
    canceled: 'canceled',
    done: 'done',
    in_progress: 'in_progress',
    blocked: 'blocked',
    planned: 'planned',
  };
  return map[status] || (status || 'unknown');
}

function sortedTasks() {
  return toArray(STUDIO_STATE.runtime?.tasks)
    .slice()
    .sort((a, b) => Date.parse(b.updatedAt || '0') - Date.parse(a.updatedAt || '0'));
}

function normalizedChannel(channel) {
  return String(channel || '').toLowerCase();
}

function channelScope(channel) {
  return normalizedChannel(channel) === 'companion' ? 'companion' : 'dev';
}

function activeSessionScope() {
  return currentView === 'companion' ? 'companion' : 'dev';
}

function ensureLlmSession(scope) {
  const current = STUDIO_STATE.llmSessions[scope];
  if (current) return current;
  const sessionId = `studio-${scope}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  STUDIO_STATE.llmSessions[scope] = sessionId;
  return sessionId;
}

function sortedTasksByScope(scope) {
  return sortedTasks().filter((task) => channelScope(task.channel) === scope);
}

function scopedEvents(scope) {
  return toArray(STUDIO_STATE.runtime?.recentEvents)
    .filter((event) => channelScope(event.channel) === scope);
}

function selectedTask(scope) {
  const tasks = sortedTasksByScope(scope);
  if (!tasks.length) return null;
  const selectedId = STUDIO_STATE.selectedTaskIds[scope];
  if (!selectedId) {
    STUDIO_STATE.selectedTaskIds[scope] = tasks[0].id || '';
    return tasks[0];
  }
  const matched = tasks.find((item) => item.id === selectedId);
  if (matched) return matched;
  STUDIO_STATE.selectedTaskIds[scope] = tasks[0].id || '';
  return tasks[0];
}

async function fetchJson(path, init) {
  const response = await fetch(`${SAVC_BASE}${path}`, init);
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!response.ok && !data.ok) {
    throw new Error(`HTTP ${response.status} ${path}`);
  }
  return data;
}

async function refreshProgressSnapshot() {
  const payload = await fetchJson('/__savc/progress/snapshot');
  STUDIO_STATE.progress = payload;
}

async function refreshRuntimeSnapshot() {
  const payload = await fetchJson('/__savc/task-runtime/snapshot');
  if (payload.ok === false) {
    throw new Error(payload.error || 'task-runtime snapshot failed');
  }
  STUDIO_STATE.runtime = payload;
}

async function refreshStorageStatus() {
  const payload = await fetchJson('/__savc/storage/status');
  if (payload.ok === false) {
    throw new Error(payload.error || 'storage status failed');
  }
  STUDIO_STATE.storageStatus = payload;
}

async function refreshStorageLogs(limit = 80) {
  const payload = await fetchJson(`/__savc/storage/logs?limit=${Math.max(10, Math.min(limit, 200))}`);
  if (payload.ok === false) {
    throw new Error(payload.error || 'storage logs failed');
  }
  STUDIO_STATE.storageLogs = Array.isArray(payload.logs) ? payload.logs : [];
}

async function refreshStudioSnapshots() {
  const jobs = [
    refreshProgressSnapshot(),
    refreshRuntimeSnapshot(),
    refreshStorageStatus(),
    refreshStorageLogs(80),
  ];
  const settled = await Promise.allSettled(jobs);
  if (settled.every((item) => item.status === 'rejected')) {
    throw new Error('all snapshots failed');
  }
}

function renderServerStatus() {
  const el = document.getElementById('studio-server-status');
  if (!el) return;
  const host = (() => {
    try {
      return new URL(SAVC_BASE).host;
    } catch {
      return window.location.host;
    }
  })();
  const branch = STUDIO_STATE.progress?.repo?.branch || '-';
  el.textContent = `在线 · ${host} · ${branch}`;
  const branchEl = document.getElementById('vsc-sb-branch');
  if (branchEl) branchEl.textContent = `⎇ ${branch}`;
}

function renderVscRuntimeStatus() {
  const runtimeMetrics = STUDIO_STATE.runtime?.metrics || {};
  const errors = Number(runtimeMetrics.failed || 0) + Number(runtimeMetrics.canceled || 0);
  const warns = Number(runtimeMetrics.retry || 0);
  const el = document.getElementById('vsc-sb-errors');
  if (el) el.textContent = `⊗ ${errors}  ⚠ ${warns}`;
}

function renderCompanionMemoryChips() {
  const wrap = document.getElementById('companion-memory-chips');
  if (!wrap) return;
  const fromWorklogs = toArray(STUDIO_STATE.progress?.worklogs).map((item) => item.title).filter(Boolean);
  const fromModules = toArray(STUDIO_STATE.progress?.modules).map((item) => item.name).filter(Boolean);
  const fromPrompts = toArray(STUDIO_STATE.projectHistory.prompts).map((item) => item.text).filter(Boolean);
  const fromFiles = toArray(STUDIO_STATE.projectHistory.openedFiles)
    .map((item) => String(item.text || '').split('/').pop())
    .filter(Boolean);
  const chips = [...new Set([...fromWorklogs, ...fromModules, ...fromPrompts, ...fromFiles])].slice(0, 6);
  if (!chips.length) {
    wrap.innerHTML = '<span class="memory-chip">暂无记忆数据</span>';
    return;
  }
  wrap.innerHTML = chips.map((item) => `<span class="memory-chip">${escHtml(item)}</span>`).join('');
}

function renderSidebarSessions() {
  const container = document.getElementById('session-list');
  if (!container) return;
  const scope = activeSessionScope();
  const tasks = sortedTasksByScope(scope);
  if (!tasks.length) {
    const localRows = STUDIO_STATE.localMessages[scope];
    if (localRows.length) {
      const last = localRows[localRows.length - 1];
      const sessionName = scope === 'companion' ? '媛媛 · 对话中' : '开发会话 · 本地';
      const badgeClass = scope === 'companion' ? 'badge-tg' : 'badge-web';
      const badgeText = scope === 'companion' ? 'companion' : 'web';
      container.innerHTML = `
        <div class="session-item active">
          <span class="session-channel-badge ${badgeClass}">${badgeText}</span>
          <div class="session-info">
            <div class="session-name">${sessionName}</div>
            <div class="session-preview">${escHtml(String(last.text || '').slice(0, 36))}</div>
          </div>
        </div>
      `;
      return;
    }
    const emptyName = scope === 'companion' ? '暂无陪伴会话' : '暂无开发会话';
    const emptyPreview = scope === 'companion'
      ? '可在陪伴输入框发起会话'
      : '可在开发输入框创建任务';
    const emptyBadgeClass = scope === 'companion' ? 'badge-tg' : 'badge-web';
    const emptyBadgeText = scope === 'companion' ? 'companion' : 'web';
    container.innerHTML = `
      <div class="session-item active">
        <span class="session-channel-badge ${emptyBadgeClass}">${emptyBadgeText}</span>
        <div class="session-info">
          <div class="session-name">${emptyName}</div>
          <div class="session-preview">${emptyPreview}</div>
        </div>
      </div>
    `;
    return;
  }
  const selected = selectedTask(scope);
  const selectedId = selected?.id || '';
  container.innerHTML = tasks.slice(0, 8).map((task, idx) => {
    const active = task.id === selectedId ? ' active' : '';
    const badge = channelBadgeClass(task.channel);
    const name = task.title || task.id;
    const preview = task.lastMessage || labelStatus(task.status);
    return `
      <div class="session-item${active}" onclick="selectSession(${idx})">
        <span class="session-channel-badge ${badge}">${escHtml(task.channel || 'web')}</span>
        <div class="session-info">
          <div class="session-name">${escHtml(name)}</div>
          <div class="session-preview">${escHtml(preview)}</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderSessionCard() {
  const nameEl = document.getElementById('panel-session-name');
  const metaEl = document.getElementById('panel-session-meta');
  if (!nameEl || !metaEl) return;
  const task = selectedTask('dev');
  if (!task) {
    const latest = STUDIO_STATE.localMessages.dev[STUDIO_STATE.localMessages.dev.length - 1];
    nameEl.textContent = latest ? '本地开发会话' : '暂无开发会话';
    metaEl.innerHTML = latest
      ? `会话 ID: local-dev<br>状态: ${STUDIO_STATE.pending.dev ? 'running' : 'idle'}<br>事件数: ${STUDIO_STATE.localMessages.dev.length}<br>更新时间: ${escHtml(formatDateTime(latest.at))}`
      : '会话 ID: -<br>状态: -<br>事件数: 0<br>更新时间: -';
    return;
  }
  nameEl.textContent = `${task.title || task.id} · ${task.channel || 'web'}`;
  const events = toArray(STUDIO_STATE.runtime?.recentEvents).filter((item) => item.taskId === task.id);
  metaEl.innerHTML = [
    `会话 ID: ${escHtml(task.id)}`,
    `状态: ${escHtml(labelStatus(task.status))} (${Number(task.progress || 0)}%)`,
    `事件数: ${events.length}`,
    `更新时间: ${escHtml(formatDateTime(task.updatedAt || task.createdAt))}`,
  ].join('<br>');
}

function renderStats() {
  const grid = document.getElementById('dev-stats-grid');
  if (!grid) return;
  const eventsCount = scopedEvents('dev').length + STUDIO_STATE.localMessages.dev.length;
  const devTasks = sortedTasksByScope('dev');
  const taskCount = devTasks.length;
  const activeCount = devTasks.filter((item) => item.status === 'running' || item.status === 'retry').length + (STUDIO_STATE.pending.dev ? 1 : 0);
  grid.innerHTML = `
    <div class="stat-number-card"><div class="stat-num">${eventsCount}</div><div class="stat-lbl">消息</div></div>
    <div class="stat-number-card"><div class="stat-num">${activeCount}</div><div class="stat-lbl">工具调用</div></div>
    <div class="stat-number-card"><div class="stat-num">${taskCount}</div><div class="stat-lbl">会话</div></div>
  `;
}

function renderToolTrace() {
  const wrap = document.getElementById('dev-tool-trace');
  if (!wrap) return;
  const events = scopedEvents('dev').slice(0, 4);
  const rows = events.length
    ? events.map((event) => `
      <div class="tool-trace-item">
        <div class="trace-dot" style="background:${traceColor(event.state)}"></div>
        <span>${escHtml(event.actor || event.owner || event.source || 'runtime')} · ${escHtml(event.message || labelStatus(event.state))}</span>
      </div>
    `).join('')
    : '<div class="tool-trace-item"><div class="trace-dot" style="background:var(--status-warn)"></div><span>暂无轨迹</span></div>';
  wrap.innerHTML = `<div class="panel-card-title">工具轨迹</div>${rows}`;
}

function renderChannelDistribution() {
  const wrap = document.getElementById('dev-channel-distribution');
  if (!wrap) return;
  const tasks = sortedTasksByScope('dev');
  const counts = new Map();
  for (const task of tasks) {
    const key = String(task.channel || 'web').toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const total = tasks.length || 1;
  const colors = { web: '#4A90D9', discord: '#5865F2', telegram: '#27A7E7', tg: '#27A7E7', companion: '#B8758A' };
  const rows = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([channel, count]) => {
      const percent = Math.round((count / total) * 100);
      const color = colors[channel] || '#7B9EC4';
      return `
        <div class="channel-bar-row">
          <div class="channel-bar-label">${escHtml(channel)}</div>
          <div class="channel-bar-track"><div class="channel-bar-fill" style="width:${percent}%;background:${color}"></div></div>
          <div class="channel-bar-val">${percent}%</div>
        </div>
      `;
    })
    .join('');
  wrap.innerHTML = `<div class="panel-card-title">渠道分布</div>${rows || '<div class="channel-bar-row"><div class="channel-bar-label">暂无数据</div></div>'}`;
}

function storageStateColor(state) {
  if (state === 'online') return 'var(--status-ok)';
  if (state === 'degraded') return 'var(--status-warn)';
  if (state === 'disabled') return 'var(--text-light)';
  return 'var(--status-err)';
}

function renderStorageServiceStatus() {
  const wrap = document.getElementById('storage-service-status');
  if (!wrap) return;
  const payload = STUDIO_STATE.storageStatus;
  const components = payload?.components || {};
  const rows = ['sqlite', 'cache', 'mysql', 'yaml']
    .map((key) => components[key])
    .filter(Boolean);
  if (!rows.length) {
    wrap.innerHTML = `<div class="panel-card-title">数据库服务状态</div><div class="tool-trace-item"><div class="trace-dot" style="background:var(--status-warn)"></div><span>暂无状态数据</span></div>`;
    return;
  }
  const body = rows.map((item) => `
    <div class="tool-trace-item">
      <div class="trace-dot" style="background:${storageStateColor(item.state)}"></div>
      <span>${escHtml(item.name)} · ${escHtml(item.engine)} · ${escHtml(item.state)}${item.latencyMs != null ? ` · ${item.latencyMs}ms` : ''}</span>
    </div>
  `).join('');
  const metrics = payload?.metrics
    ? `<div style="font-size:11px;color:var(--text-light);margin-top:6px;">logs=${Number(payload.metrics.runtimeLogCount || 0)} · kv=${Number(payload.metrics.kvCount || 0)} · cache=${Number(payload.metrics.cacheEntries || 0)}</div>`
    : '';
  wrap.innerHTML = `<div class="panel-card-title">数据库服务状态</div>${body}${metrics}`;
}

function renderStorageRuntimeLogs() {
  const wrap = document.getElementById('storage-runtime-logs');
  if (!wrap) return;
  const logs = toArray(STUDIO_STATE.storageLogs).slice(0, 6);
  if (!logs.length) {
    wrap.innerHTML = `<div class="panel-card-title">存储运行日志</div><div class="tool-trace-item"><div class="trace-dot" style="background:var(--status-warn)"></div><span>暂无运行日志</span></div>`;
    return;
  }
  wrap.innerHTML = `<div class="panel-card-title">存储运行日志</div>${logs.map((log) => `
    <div class="tool-trace-item">
      <div class="trace-dot" style="background:${storageStateColor(log.level === 'error' ? 'offline' : log.level === 'warn' ? 'degraded' : 'online')}"></div>
      <span>${escHtml(log.subsystem || 'storage')} · ${escHtml(log.message || '-')} · ${escHtml(formatTime(log.createdAt))}</span>
    </div>
  `).join('')}`;
}

function vscTaskSummary() {
  const tasks = sortedTasksByScope('dev');
  const pending = STUDIO_STATE.pending.dev;
  const runningCount = tasks.filter((item) => item.status === 'running' || item.status === 'retry').length + (pending ? 1 : 0);
  const failedCount = tasks.filter((item) => item.status === 'failed').length;
  return {
    tasks,
    hasTask: pending || tasks.length > 0,
    pending,
    runningCount,
    failedCount,
  };
}

function positionVscWidget() {
  const widget = document.getElementById('vscode-widget');
  const anchor = document.getElementById('vsc-touchbar-anchor');
  if (!widget || !anchor) return;
  const anchorRect = anchor.getBoundingClientRect();
  if (anchorRect.width <= 0) return;

  const viewportPadding = 14;
  const viewportWidth = Math.max(360, window.innerWidth - viewportPadding * 2);
  const desiredWidth = Math.round(anchorRect.width + 360);
  const width = Math.max(560, Math.min(980, Math.min(viewportWidth, desiredWidth)));
  const centerX = anchorRect.left + anchorRect.width / 2;
  const half = width / 2;
  const clampedCenter = Math.max(half + viewportPadding, Math.min(centerX, window.innerWidth - half - viewportPadding));
  const top = Math.max(62, Math.round(anchorRect.bottom + 10));
  const maxHeight = window.innerHeight - top - viewportPadding;
  const height = Math.max(360, Math.min(660, maxHeight));

  widget.style.width = `${Math.round(width)}px`;
  widget.style.height = `${Math.round(height)}px`;
  widget.style.left = `${Math.round(clampedCenter)}px`;
  widget.style.top = `${Math.round(top)}px`;
}

function syncVscTouchbar() {
  const bar = document.getElementById('vsc-touchbar');
  const textEl = document.getElementById('vsc-touchbar-text');
  const hintEl = document.getElementById('vsc-touchbar-hint');
  if (!bar || !textEl || !hintEl) return;

  const summary = vscTaskSummary();
  const latestTask = summary.tasks[0];
  const latestTitle = String(latestTask?.title || latestTask?.lastMessage || '').replace(/\s+/g, ' ').trim();
  const compactTitle = latestTitle.length > 18 ? `${latestTitle.slice(0, 17)}…` : latestTitle;
  const isOpen = VSC.state === 'expanded';

  bar.classList.toggle('has-task', summary.hasTask);
  bar.classList.toggle('is-running', summary.runningCount > 0);
  bar.classList.toggle('is-error', summary.runningCount === 0 && summary.failedCount > 0);
  bar.classList.toggle('is-open', isOpen);

  if (isOpen) {
    textEl.textContent = summary.runningCount > 0 ? `工作台运行中 · ${summary.runningCount} 个任务` : '工作台已展开';
    hintEl.textContent = '点击收起';
    positionVscWidget();
    return;
  }

  if (!summary.hasTask) {
    textEl.textContent = '工作台待命';
    hintEl.textContent = '点击展开';
    return;
  }

  if (summary.runningCount > 0) {
    textEl.textContent = `执行中 · ${summary.runningCount} 个任务`;
    hintEl.textContent = '点击展开跟进';
    return;
  }

  textEl.textContent = compactTitle ? `最近任务 · ${compactTitle}` : `有 ${summary.tasks.length} 个任务记录`;
  hintEl.textContent = '点击展开查看';
}

function renderCompanionMessages() {
  const container = document.getElementById('companion-messages');
  if (!container) return;
  const lines = STUDIO_STATE.localMessages.companion.slice(-24);
  const hasPending = STUDIO_STATE.pending.companion;
  const hasStreaming = lines.some((line) => line?.streaming);
  if (!lines.length && !hasPending) {
    container.innerHTML = `<div class="msg assistant"><div class="msg-bubble">暂无会话消息，输入后将直接调用 LLM。</div><div class="msg-time">--:--</div></div>`;
    return;
  }
  const rows = lines.map((line) => `
    <div class="msg ${line.role === 'user' ? 'user' : 'assistant'}">
      <div class="msg-bubble ${line.role === 'assistant' ? 'fmt-bubble' : ''}${line?.streaming ? ' streaming-bubble' : ''}">${renderMessageBubbleHtml(line)}</div>
      <div class="msg-time">${formatTime(line.at)}</div>
    </div>
  `);
  if (hasPending && !hasStreaming) {
    rows.push(`
      <div class="msg assistant">
        <div class="msg-bubble fmt-bubble pending-bubble">
          <span class="typing-dots"><span></span><span></span><span></span></span>
          <span>媛媛正在处理你的请求...</span>
        </div>
        <div class="msg-time">${formatTime(new Date().toISOString())}</div>
      </div>
    `);
  }
  container.innerHTML = rows.join('');
  container.scrollTop = container.scrollHeight;
}

function renderDevMessages() {
  const container = document.getElementById('dev-messages');
  if (!container) return;
  const task = selectedTask('dev');
  const taskEvents = scopedEvents('dev')
    .filter((item) => !task || item.taskId === task.id)
    .slice(0, 8)
    .reverse()
    .map((item) => ({
      role: 'assistant',
      text: `[${labelStatus(item.state)}] ${item.message || ''}`,
      at: item.timestamp || '',
    }));
  const lines = [...STUDIO_STATE.localMessages.dev, ...taskEvents].slice(-18);
  const hasPending = STUDIO_STATE.pending.dev;
  const hasStreaming = lines.some((line) => line?.streaming);
  if (!lines.length && !hasPending) {
    container.innerHTML = `<div class="dev-msg assistant"><div class="dev-msg-bubble">暂无运行态消息。</div><div class="msg-time" style="font-size:10px;color:var(--text-light);margin-top:2px;">--:--</div></div>`;
    return;
  }
  const rows = lines.map((line) => `
    <div class="dev-msg ${line.role === 'user' ? 'user' : 'assistant'}">
      <div class="dev-msg-bubble ${line.role === 'assistant' ? 'fmt-bubble' : ''}${line?.streaming ? ' streaming-bubble' : ''}">${renderMessageBubbleHtml(line)}</div>
      <div class="msg-time" style="font-size:10px;color:var(--text-light);margin-top:2px;">${formatTime(line.at)}</div>
    </div>
  `);
  if (hasPending && !hasStreaming) {
    rows.push(`
      <div class="dev-msg assistant">
        <div class="dev-msg-bubble fmt-bubble pending-bubble">
          <span class="typing-dots"><span></span><span></span><span></span></span>
          <span>开发通道正在执行中...</span>
        </div>
        <div class="msg-time" style="font-size:10px;color:var(--text-light);margin-top:2px;">${formatTime(new Date().toISOString())}</div>
      </div>
    `);
  }
  container.innerHTML = rows.join('');
  container.scrollTop = container.scrollHeight;
}

function renderToolList() {
  const wrap = document.getElementById('dev-tool-list');
  if (!wrap) return;
  const task = selectedTask('dev');
  const devEvents = scopedEvents('dev');
  const taskEvents = task ? devEvents.filter((event) => event.taskId === task.id) : devEvents;
  const events = (taskEvents.length ? taskEvents : devEvents).slice(0, 12);
  if (!events.length) {
    wrap.innerHTML = `
      <div class="tool-row open">
        <div class="tool-row-header"><div class="tool-status-icon tool-status-run">●</div><div class="tool-name">暂无事件</div><div class="tool-duration">-</div></div>
        <div class="tool-detail">等待 task-runtime 事件流...</div>
      </div>
    `;
    return;
  }
  wrap.innerHTML = events.map((event, idx) => {
    const iconClass = event.state === 'succeeded'
      ? 'tool-status-ok'
      : event.state === 'failed' || event.state === 'canceled'
        ? 'tool-status-err'
        : 'tool-status-run';
    const icon = event.state === 'succeeded' ? '✓' : event.state === 'failed' || event.state === 'canceled' ? '✗' : '●';
    const detail = [
      `taskId: ${event.taskId || '-'}`,
      `channel: ${event.channel || '-'}`,
      `actor: ${event.actor || '-'}`,
      `source: ${event.source || '-'}`,
      `progress: ${Number(event.progress || 0)}%`,
    ].join('<br>');
    return `
      <div class="tool-row ${idx === 0 ? 'open' : ''}" onclick="toggleTool(this)">
        <div class="tool-row-header">
          <div class="tool-status-icon ${iconClass}">${icon}</div>
          <div class="tool-name">${escHtml(event.actor || event.owner || event.source || 'runtime')}</div>
          <div class="tool-duration">${escHtml(labelStatus(event.state))}</div>
        </div>
        <div class="tool-detail">${detail}</div>
      </div>
    `;
  }).join('');
}

function renderContextGrid() {
  const grid = document.getElementById('dev-context-grid');
  if (!grid) return;
  const worklogs = toArray(STUDIO_STATE.progress?.worklogs).slice(0, 3);
  const planDocs = toArray(STUDIO_STATE.progress?.planDocs).slice(0, 3);
  const commits = toArray(STUDIO_STATE.progress?.commits).slice(0, 3);
  const runtimeTasks = sortedTasksByScope('dev').slice(0, 3);
  const historyRows = toArray(STUDIO_STATE.projectHistory.openedFiles).slice(0, 3);
  const promptRows = toArray(STUDIO_STATE.projectHistory.prompts).slice(0, 3);
  const storageMetrics = STUDIO_STATE.storageStatus?.metrics
    ? [{
      key: 'storage',
      value: `logs=${Number(STUDIO_STATE.storageStatus.metrics.runtimeLogCount || 0)} kv=${Number(STUDIO_STATE.storageStatus.metrics.kvCount || 0)} cache=${Number(STUDIO_STATE.storageStatus.metrics.cacheEntries || 0)}`,
      updatedAt: STUDIO_STATE.storageStatus.generatedAt || '',
    }]
    : [];

  const mkCards = (title, rows, mkTitle, mkDesc) => `
    <div>
      <div class="context-col-title">${escHtml(title)}</div>
      ${rows.length ? rows.map((row) => `
        <div class="context-card">
          <div class="context-card-title">${escHtml(mkTitle(row))}</div>
          <div class="context-card-desc">${escHtml(mkDesc(row))}</div>
        </div>
      `).join('') : `
        <div class="context-card">
          <div class="context-card-title">暂无数据</div>
          <div class="context-card-desc">等待进度快照返回</div>
        </div>
      `}
    </div>
  `;
  grid.innerHTML = [
    mkCards('工作日志', worklogs, (row) => row.title || row.file || '-', (row) => `${row.date || ''} · ${row.summary || ''}`.trim()),
    mkCards('关联文档', planDocs, (row) => row.title || row.file || '-', (row) => row.excerpt || row.file || '-'),
    mkCards('最近提交', commits, (row) => row.hash || '-', (row) => row.subject || row.author || '-'),
    mkCards('项目任务', runtimeTasks, (row) => row.title || row.id || '-', (row) => `${labelStatus(row.status)} · ${formatDateTime(row.updatedAt || row.createdAt)}`),
    mkCards('历史项目', historyRows, (row) => row.text || '-', (row) => `最近打开 · ${formatDateTime(row.at)}`),
    mkCards('历史需求', promptRows, (row) => taskMessageDigest(row.text || '-', 38), (row) => `最近输入 · ${formatDateTime(row.at)}`),
    mkCards('存储指标', storageMetrics, (row) => row.key || '-', (row) => `${row.value || '-'} · ${formatDateTime(row.updatedAt)}`),
  ].join('');
}

function renderDebugChat(title, detail, timestamp) {
  const wrap = document.getElementById('debug-chat');
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="debug-msg user">
      <div class="debug-msg-bubble">当前异常是什么？</div>
      <div class="debug-msg-time">${formatTime(timestamp)}</div>
    </div>
    <div class="debug-msg assistant">
      <div class="debug-msg-bubble error-reply">【错误分析】${escHtml(title || '无')}<br>${escHtml(detail || '暂无详细信息')}</div>
      <div class="debug-msg-time">${formatTime(timestamp)}</div>
    </div>
  `;
}

function renderDebugTree() {
  const wrap = document.getElementById('debug-tree');
  if (!wrap) return;
  const events = toArray(STUDIO_STATE.runtime?.recentEvents);
  const errors = events.filter((event) => event.state === 'failed' || event.state === 'canceled').slice(0, 5);
  const warnings = events.filter((event) => event.state === 'retry').slice(0, 5);
  const renderItems = (rows, cls) => rows.map((event, idx) => {
    const dot = cls === 'err' ? 'dot-red' : 'dot-yellow';
    const itemCls = cls === 'warn' ? 'debug-error-item warn-item' : 'debug-error-item';
    const activeCls = idx === 0 ? ' active' : '';
    return `
      <div class="${itemCls}${activeCls}" onclick="selectDebugItem(this)" data-title="${escHtml(event.message || labelStatus(event.state))}" data-detail="${escHtml(`task=${event.taskId} · state=${labelStatus(event.state)} · progress=${event.progress}%`)}" data-time="${escHtml(event.timestamp || '')}">
        <div class="error-dot ${dot}"></div>
        <div>
          <div class="error-text">${escHtml(event.message || labelStatus(event.state))}</div>
          <div class="error-detail">${escHtml(`${event.actor || event.owner || event.source || 'runtime'} · ${formatTime(event.timestamp)}`)}</div>
        </div>
      </div>
    `;
  }).join('');
  wrap.innerHTML = `
    <div class="debug-tree-title">错误树</div>
    <div class="debug-section-label err">错误 (${errors.length})</div>
    ${renderItems(errors, 'err') || '<div class="debug-error-item"><div class="error-dot dot-red"></div><div><div class="error-text">暂无错误</div><div class="error-detail">-</div></div></div>'}
    <div class="debug-section-label warn">警告 (${warnings.length})</div>
    ${renderItems(warnings, 'warn') || '<div class="debug-error-item warn-item"><div class="error-dot dot-yellow"></div><div><div class="error-text">暂无警告</div><div class="error-detail">-</div></div></div>'}
  `;
  const first = wrap.querySelector('.debug-error-item.active') || wrap.querySelector('.debug-error-item');
  if (first) {
    renderDebugChat(first.dataset.title, first.dataset.detail, first.dataset.time);
  }
}

function renderDebugLogs() {
  const container = document.getElementById('debug-logs');
  if (!container) return;
  const rows = STUDIO_STATE.monitorLogs.slice(-30);
  if (!rows.length) {
    container.innerHTML = `<div class="log-line"><span class="log-ts">--:--:--</span><span class="log-agent sys">System</span><span class="log-arrow">›</span><span class="log-text">暂无日志</span></div>`;
    return;
  }
  container.innerHTML = rows.map((log) => `
    <div class="log-line${log.err ? ' log-err' : ''}">
      <span class="log-ts">${escHtml(log.ts)}</span>
      <span class="log-agent ${escHtml(log.agentCls)}">${escHtml(log.agent)}</span>
      <span class="log-arrow">›</span>
      <span class="log-text${log.err ? ' err-text' : ''}">${escHtml(log.text)}</span>
    </div>
  `).join('');
  container.scrollTop = container.scrollHeight;
}

function renderMonitorAgentCards() {
  const wrap = document.getElementById('monitor-agent-cards');
  if (!wrap) return;
  const modules = toArray(STUDIO_STATE.progress?.modules).slice(0, 4);
  if (!modules.length) {
    wrap.innerHTML = `
      <div class="agent-card">
        <div class="agent-card-header"><div class="agent-card-name">暂无模块数据</div><div class="agent-status-badge badge-idle">idle</div></div>
        <div class="agent-card-role">等待 progress 快照</div>
      </div>
    `;
    return;
  }
  wrap.innerHTML = modules.map((module) => {
    const badge = statusBadgeClass(module.status);
    const fill = progressClass(module.status);
    return `
      <div class="agent-card">
        <div class="agent-card-header">
          <div class="agent-card-name">${escHtml(module.name || module.id)}</div>
          <div class="agent-status-badge ${badge}">${escHtml(labelStatus(module.status))}</div>
        </div>
        <div class="agent-card-role">${escHtml(module.desc || module.phase || '-')}</div>
        <div class="agent-tool-row"><span class="agent-tool-label">负责人：</span><span class="agent-tool-name">${escHtml(module.owner || '-')}</span></div>
        <div class="progress-track"><div class="progress-fill ${fill}" style="width:${Number(module.progress || 0)}%"></div></div>
        <div class="agent-events">
          <div class="agent-event"><span class="event-icon">•</span><span>phase: ${escHtml(module.phase || '-')}</span></div>
          <div class="agent-event"><span class="event-icon">•</span><span>risk: ${escHtml(module.risk || '-')}</span></div>
          <div class="agent-event"><span class="event-icon">•</span><span>updated: ${escHtml(formatTime(module.updatedAt))}</span></div>
        </div>
      </div>
    `;
  }).join('');
}

function normalizeModuleStatus(status) {
  if (status === 'blocked' || status === 'failed' || status === 'canceled') return 'blocked';
  if (status === 'done' || status === 'succeeded') return 'done';
  if (status === 'in_progress' || status === 'running' || status === 'retry') return 'in_progress';
  return 'planned';
}

function depNodeStyle(status) {
  const normalized = normalizeModuleStatus(status);
  if (normalized === 'blocked') {
    return { fill: '#FDE8E6', stroke: '#C0392B', text: '#C0392B', dash: '5,3', marker: 'url(#arrow-err)', level: 'err' };
  }
  if (normalized === 'in_progress') {
    return { fill: '#FEF3E2', stroke: '#B8640A', text: '#B8640A', dash: '', marker: 'url(#arrow-run)', level: 'warn' };
  }
  if (normalized === 'done') {
    return { fill: '#E6F4EC', stroke: '#2D7A47', text: '#2D7A47', dash: '', marker: 'url(#arrow-idle)', level: 'ok' };
  }
  return { fill: '#EEF4FB', stroke: '#4A90D9', text: '#4A90D9', dash: '2,4', marker: 'url(#arrow-idle)', level: 'idle' };
}

function findModuleByIds(ids) {
  const modules = toArray(STUDIO_STATE.progress?.modules);
  return modules.find((item) => ids.includes(item.id)) || null;
}

function renderDepNode(nodeKey, module, fallbackName) {
  const rect = document.getElementById(`dep-node-${nodeKey}-rect`);
  const nameEl = document.getElementById(`dep-node-${nodeKey}-name`);
  const statusEl = document.getElementById(`dep-node-${nodeKey}-status`);
  if (!rect || !nameEl || !statusEl) return depNodeStyle('planned');

  const style = depNodeStyle(module?.status);
  rect.setAttribute('fill', style.fill);
  rect.setAttribute('stroke', style.stroke);
  if (style.dash) rect.setAttribute('stroke-dasharray', style.dash);
  else rect.removeAttribute('stroke-dasharray');

  nameEl.textContent = module?.name || fallbackName;
  nameEl.setAttribute('fill', style.text);
  statusEl.textContent = labelStatus(module?.status || 'planned');
  statusEl.setAttribute('fill', style.text);
  return style;
}

function renderDepLink(pathId, leftStyle, rightStyle) {
  const pathEl = document.getElementById(pathId);
  if (!pathEl) return;
  if (leftStyle.level === 'err' || rightStyle.level === 'err') {
    pathEl.setAttribute('stroke', '#C0392B');
    pathEl.setAttribute('stroke-dasharray', '5,3');
    pathEl.setAttribute('marker-end', 'url(#arrow-err)');
    return;
  }
  if (leftStyle.level === 'warn' || rightStyle.level === 'warn') {
    pathEl.setAttribute('stroke', '#B8640A');
    pathEl.removeAttribute('stroke-dasharray');
    pathEl.setAttribute('marker-end', 'url(#arrow-run)');
    return;
  }
  if (leftStyle.level === 'ok' && rightStyle.level === 'ok') {
    pathEl.setAttribute('stroke', '#2D7A47');
    pathEl.removeAttribute('stroke-dasharray');
    pathEl.setAttribute('marker-end', 'url(#arrow-idle)');
    return;
  }
  pathEl.setAttribute('stroke', '#4A90D9');
  pathEl.setAttribute('stroke-dasharray', '2,4');
  pathEl.setAttribute('marker-end', 'url(#arrow-idle)');
}

function renderMonitorDependencyGraph() {
  const orchestrator = findModuleByIds(['orchestrator']);
  const memory = findModuleByIds(['memory']);
  const voice = findModuleByIds(['voice-tts', 'voice']);
  const live2d = findModuleByIds(['live2d']);

  const orchStyle = renderDepNode('orch', orchestrator, 'Orchestrator');
  const memoryStyle = renderDepNode('memory', memory, 'Memory');
  const voiceStyle = renderDepNode('voice', voice, 'Voice/TTS');
  const live2dStyle = renderDepNode('live2d', live2d, 'Live2D');

  renderDepLink('dep-link-orch-memory', orchStyle, memoryStyle);
  renderDepLink('dep-link-orch-voice', orchStyle, voiceStyle);
  renderDepLink('dep-link-voice-live2d', voiceStyle, live2dStyle);
}

function renderPlanKanban() {
  const wrap = document.getElementById('plan-kanban-cols');
  if (!wrap) return;
  const modules = toArray(STUDIO_STATE.progress?.modules);
  const todo = modules.filter((item) => item.status === 'planned');
  const doing = modules.filter((item) => item.status === 'in_progress' || item.status === 'blocked');
  const done = modules.filter((item) => item.status === 'done');
  const renderCol = (name, rows, color) => `
    <div class="kanban-col">
      <div class="kanban-col-header">
        <div class="kanban-col-name">${name}</div>
        <div class="kanban-col-count" style="${color ? `background:${color.bg};color:${color.text}` : ''}">${rows.length}</div>
      </div>
      <div class="kanban-col-cards">
        ${rows.length ? rows.map((item) => `
          <div class="kanban-card">
            <div class="kanban-card-title">${escHtml(item.name || item.id)}</div>
            <div class="kanban-card-tags">
              <span class="kanban-tag">${escHtml(item.phase || '-')}</span>
              <span class="kanban-tag">${escHtml(item.owner || '-')}</span>
            </div>
            <span class="kanban-phase">${Number(item.progress || 0)}%</span>
          </div>
        `).join('') : '<div class="kanban-card"><div class="kanban-card-title">空</div></div>'}
      </div>
    </div>
  `;
  wrap.innerHTML = [
    renderCol('待办', todo, null),
    renderCol('进行中', doing, { bg: 'var(--status-warn-bg)', text: 'var(--status-warn)' }),
    renderCol('已完成', done, { bg: 'var(--status-ok-bg)', text: 'var(--status-ok)' }),
  ].join('');
}

function renderPlanTimeline() {
  const wrap = document.getElementById('plan-timeline');
  if (!wrap) return;
  const rows = toArray(STUDIO_STATE.progress?.gantt)
    .slice()
    .sort((a, b) => Date.parse(a.start || '0') - Date.parse(b.start || '0'))
    .slice(0, 6);
  if (!rows.length) {
    wrap.innerHTML = `
      <div class="milestone-item">
        <div class="milestone-dot todo"></div>
        <div class="milestone-info">
          <div class="milestone-week">暂无里程碑</div>
          <div class="milestone-date">-</div>
          <div class="milestone-desc">等待 gantt 数据</div>
        </div>
      </div>
    `;
    return;
  }
  wrap.innerHTML = rows.map((item) => {
    const dot = item.status === 'done' ? 'done' : item.status === 'in_progress' ? 'active' : 'todo';
    const badge = item.status === 'done'
      ? '<span class="milestone-badge badge-done">完成</span>'
      : item.status === 'in_progress'
        ? '<span class="milestone-badge badge-active">进行中</span>'
        : '<span class="milestone-badge badge-todo">计划中</span>';
    return `
      <div class="milestone-item">
        <div class="milestone-dot ${dot}"></div>
        <div class="milestone-info">
          <div class="milestone-week">${escHtml(item.name || item.id)} ${badge}</div>
          <div class="milestone-date">${escHtml(formatDateTime(item.end))}</div>
          <div class="milestone-desc">进度 ${Number(item.progress || 0)}% · 效率 ${Number(item.efficiency || 0)}%</div>
        </div>
      </div>
    `;
  }).join('');
}

function rebuildMonitorLogs() {
  const events = toArray(STUDIO_STATE.runtime?.recentEvents).slice(0, 120).reverse();
  STUDIO_STATE.monitorLogs = events.map((event) => {
    const signature = String(`${event.owner || ''} ${event.actor || ''} ${event.channel || ''} ${event.message || ''}`).toLowerCase();
    const agentCls = signature.includes('memory')
      ? 'memory'
      : signature.includes('voice') || signature.includes('tts')
        ? 'voice'
        : signature.includes('live')
          ? 'live2d'
          : signature.includes('sys')
            ? 'sys'
            : 'orch';
    const agent = agentCls === 'memory'
      ? 'Memory'
      : agentCls === 'voice'
        ? 'Voice'
        : agentCls === 'live2d'
          ? 'Live2D'
          : agentCls === 'sys'
            ? 'System'
            : 'Orchestrator';
    return {
      ts: formatTime(event.timestamp),
      agent,
      agentCls,
      text: event.message || labelStatus(event.state),
      err: event.state === 'failed' || event.state === 'canceled',
    };
  });
}

function makeLogLine(log) {
  if (currentFilter !== 'all' && !String(log.agent || '').toLowerCase().includes(currentFilter.toLowerCase())) {
    return '';
  }
  return `
    <div class="log-line${log.err ? ' log-err' : ''}">
      <span class="log-ts">${escHtml(log.ts)}</span>
      <span class="log-agent ${escHtml(log.agentCls)}">${escHtml(log.agent)}</span>
      <span class="log-arrow">›</span>
      <span class="log-text${log.err ? ' err-text' : ''}">${escHtml(log.text)}</span>
    </div>
  `;
}

function renderMonitorLogs() {
  const container = document.getElementById('monitor-logs');
  if (!container) return;
  const html = STUDIO_STATE.monitorLogs.map((log) => makeLogLine(log)).join('');
  container.innerHTML = html || '<div class="log-line"><span class="log-ts">--:--:--</span><span class="log-agent sys">System</span><span class="log-arrow">›</span><span class="log-text">暂无日志</span></div>';
  container.scrollTop = container.scrollHeight;
}

function applySnapshots() {
  renderServerStatus();
  renderVscRuntimeStatus();
  syncVscTouchbar();
  renderCompanionMemoryChips();
  renderSidebarSessions();
  renderSessionCard();
  renderStats();
  renderToolTrace();
  renderChannelDistribution();
  renderStorageServiceStatus();
  renderStorageRuntimeLogs();
  renderToolList();
  renderContextGrid();
  rebuildMonitorLogs();
  renderMonitorLogs();
  renderDebugLogs();
  renderDebugTree();
  renderMonitorAgentCards();
  renderMonitorDependencyGraph();
  renderPlanKanban();
  renderPlanTimeline();
  renderCompanionMessages();
  renderDevMessages();
}

async function createRuntimeTaskFromInput(text, channel) {
  const created = await fetchJson('/__savc/task-runtime/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: text,
      channel,
      owner: 'yuanyuan',
      source: 'api',
      message: `来自 Studio 的新任务: ${text}`,
      tags: ['studio', channel],
    }),
  });
  if (!created?.ok || !created.task?.id) {
    throw new Error(created?.error || 'task_create_failed');
  }
  await fetchJson('/__savc/task-runtime/control', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      taskId: created.task.id,
      action: 'running',
      source: 'api',
      actor: 'studio-ui',
      message: `任务已开始执行: ${text}`,
    }),
  });
  STUDIO_STATE.selectedTaskIds[channelScope(channel)] = created.task.id;
  await refreshRuntimeSnapshot();
  return created.task.id;
}

function taskMessageDigest(text, limit = 120) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}…` : normalized;
}

async function syncRuntimeTaskOutcome(taskId, action, message) {
  if (!taskId) return;
  try {
    await fetchJson('/__savc/task-runtime/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskId,
        action,
        source: 'api',
        actor: 'studio-ui',
        message: taskMessageDigest(message, 180),
      }),
    });
    await refreshRuntimeSnapshot();
  } catch {
    // keep chat response flowing even if runtime sync is temporarily unavailable
  }
}

function parseSseFrame(frameText) {
  const lines = String(frameText || '').split('\n');
  let event = 'message';
  const dataLines = [];
  for (const raw of lines) {
    const line = String(raw || '').trimEnd();
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) {
      event = line.slice(6).trim() || 'message';
      continue;
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (!dataLines.length) return null;
  const rawData = dataLines.join('\n');
  try {
    return { event, data: JSON.parse(rawData) };
  } catch {
    return { event, data: { text: rawData } };
  }
}

function errorMessageFromPayload(payload, fallback) {
  const message = payload?.message || payload?.error || payload?.detail || fallback;
  return String(message || fallback || 'unknown_error');
}

async function requestLlmReply(scope, text, hooks = {}) {
  const sessionId = ensureLlmSession(scope);
  const response = await fetch(`${SAVC_BASE}/__savc/llm/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: text,
      scope,
      sessionId,
      timeoutMs: 90000,
      stream: true,
    }),
  });
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();

  if (!response.ok && !contentType.includes('text/event-stream')) {
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    throw new Error(`HTTP ${response.status} ${errorMessageFromPayload(payload, '/__savc/llm/chat')}`);
  }

  if (!response.body || !contentType.includes('text/event-stream')) {
    const payload = await response.json();
    const rawReply = payload?.reply?.text ? String(payload.reply.text) : '';
    const reply = normalizeAssistantReply(rawReply);
    if (!reply) {
      throw new Error(payload?.error || 'llm_empty_reply');
    }
    if (typeof hooks.onDelta === 'function') hooks.onDelta(reply, reply);
    return {
      text: reply,
      provider: payload?.reply?.provider ? String(payload.reply.provider) : '',
      model: payload?.reply?.model ? String(payload.reply.model) : '',
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let streamText = '';
  let provider = '';
  let model = '';
  let sessionOut = sessionId;
  let streamDone = false;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let splitIndex = buffer.indexOf('\n\n');
    while (splitIndex >= 0) {
      const frame = buffer.slice(0, splitIndex);
      buffer = buffer.slice(splitIndex + 2);
      const parsed = parseSseFrame(frame);
      if (parsed) {
        const payload = parsed.data || {};
        if (parsed.event === 'delta') {
          const delta = typeof payload.delta === 'string' ? payload.delta : '';
          if (delta) {
            streamText += delta;
            if (typeof hooks.onDelta === 'function') hooks.onDelta(streamText, delta);
          }
        } else if (parsed.event === 'done') {
          const replyObj = payload?.reply || {};
          const raw = typeof replyObj.text === 'string' ? replyObj.text : streamText;
          streamText = raw || streamText;
          provider = replyObj?.provider ? String(replyObj.provider) : provider;
          model = replyObj?.model ? String(replyObj.model) : model;
          sessionOut = replyObj?.sessionId ? String(replyObj.sessionId) : sessionOut;
          streamDone = true;
        } else if (parsed.event === 'error') {
          throw new Error(errorMessageFromPayload(payload, 'llm_stream_failed'));
        }
      }
      splitIndex = buffer.indexOf('\n\n');
    }
  }

  if (!streamDone && buffer.trim()) {
    const parsed = parseSseFrame(buffer);
    if (parsed?.event === 'error') {
      throw new Error(errorMessageFromPayload(parsed.data, 'llm_stream_failed'));
    }
  }

  const rawReply = String(streamText || '');
  const reply = normalizeAssistantReply(rawReply);
  if (!reply) {
    throw new Error('llm_empty_reply');
  }
  if (typeof hooks.onDelta === 'function') hooks.onDelta(reply, '');
  return {
    text: reply,
    provider,
    model,
    sessionId: sessionOut,
  };
}

function bindProgressStream() {
  if (typeof EventSource === 'undefined') return;
  if (STUDIO_STATE.progressStream) STUDIO_STATE.progressStream.close();
  const stream = new EventSource(`${SAVC_BASE}/__savc/progress/stream`);
  stream.addEventListener('snapshot', (event) => {
    try {
      STUDIO_STATE.progress = JSON.parse(event.data || '{}');
      applySnapshots();
    } catch {
      // ignore malformed frame
    }
  });
  STUDIO_STATE.progressStream = stream;
}

function bindRuntimeStream() {
  if (typeof EventSource === 'undefined') return;
  if (STUDIO_STATE.runtimeStream) STUDIO_STATE.runtimeStream.close();
  const stream = new EventSource(`${SAVC_BASE}/__savc/task-runtime/stream`);
  stream.addEventListener('task_snapshot', (event) => {
    try {
      const payload = JSON.parse(event.data || '{}');
      STUDIO_STATE.runtime = payload;
      applySnapshots();
    } catch {
      // ignore malformed frame
    }
  });
  stream.addEventListener('task_event', async () => {
    try {
      await refreshRuntimeSnapshot();
      applySnapshots();
    } catch {
      // ignore
    }
  });
  STUDIO_STATE.runtimeStream = stream;
}

async function bootstrapStudio() {
  try {
    await refreshStudioSnapshots();
  } catch (error) {
    console.warn('[SAVC Studio] snapshot bootstrap failed:', error);
  }
  applySnapshots();
  setAgentState('companion', STUDIO_STATE.agentState.companion, STUDIO_STATE.agentState.companion === 'idle' ? '正在倾听...' : '');
  setAgentState('dev', STUDIO_STATE.agentState.dev, STUDIO_STATE.agentState.dev === 'idle' ? '等待新任务...' : '');
  bindProgressStream();
  bindRuntimeStream();
  if (studioPollTimer) clearInterval(studioPollTimer);
  studioPollTimer = setInterval(async () => {
    try {
      await refreshStudioSnapshots();
      applySnapshots();
    } catch {
      // ignore transient polling failure
    }
  }, 12000);
}

// ─── switchView ───
function switchView(mode) {
  document.querySelectorAll('.view').forEach((view) => view.classList.remove('active'));
  const target = document.getElementById(`view-${mode}`);
  if (target) target.classList.add('active');
  currentView = mode;

  document.querySelectorAll('.scene-pill').forEach((pill) => pill.classList.remove('active'));
  const pillMap = { companion: 'pill-companion', dev: 'pill-dev', debug: 'pill-debug', plan: 'pill-plan' };
  if (pillMap[mode]) {
    const pill = document.getElementById(pillMap[mode]);
    if (pill) pill.classList.add('active');
  }

  const monitorBtn = document.getElementById('monitor-btn');
  if (monitorBtn) monitorBtn.classList.toggle('active', mode === 'monitor');

  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
  if (mode === 'monitor') {
    monitorInterval = setInterval(async () => {
      try {
        await refreshRuntimeSnapshot();
        applySnapshots();
      } catch {
        // no-op
      }
    }, 5000);
  }

  if (mode === 'debug') {
    const logs = document.getElementById('debug-logs');
    if (logs) logs.scrollTop = logs.scrollHeight;
  }

  const widget = document.getElementById('vscode-widget');
  if (widget) {
    if (mode === 'dev') {
      if (VSC.state === 'hidden') showVSCode();
      syncVscTouchbar();
      if (VSC.state === 'expanded') {
        positionVscWidget();
      }
    } else {
      hideVSCode();
    }
  }

  applySnapshots();
}

// ─── Dev Tab ───
function switchDevTab(name) {
  document.querySelectorAll('.dev-tab-btn').forEach((button, index) => {
    const tabs = ['interaction', 'exec', 'context', 'settings'];
    button.classList.toggle('active', tabs[index] === name);
  });
  document.querySelectorAll('.dev-tab-content').forEach((content) => {
    content.classList.toggle('active', content.id === `dev-tab-${name}`);
  });
}

// ─── Send messages -> real task runtime API ───
async function companionSend(event) {
  if (event.key !== 'Enter') return;
  const input = document.getElementById('companion-input');
  if (!input || STUDIO_STATE.pending.companion) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  rememberLocalMessage('companion', 'user', text);
  setPendingState('companion', true);
  setAgentState('companion', 'working', '媛媛正在处理你的消息...');
  applySnapshots();
  let runtimeTaskId = '';
  try {
    runtimeTaskId = await createRuntimeTaskFromInput(text, 'companion');
  } catch {
    runtimeTaskId = '';
  }
  let streamRow = null;
  try {
    streamRow = startStreamingAssistantMessage('companion');
    renderCompanionMessages();
    const result = await requestLlmReply('companion', text, {
      onDelta(partial) {
        updateStreamingAssistantMessage('companion', streamRow, partial);
        renderCompanionMessages();
      },
    });
    const finalReply = finalizeStreamingAssistantMessage('companion', streamRow, result.text);
    const modelHint = [result.provider, result.model].filter(Boolean).join(' / ');
    await syncRuntimeTaskOutcome(runtimeTaskId, 'succeeded', finalReply || result.text);
    setAgentState('companion', 'done', modelHint ? `在线回复 · ${modelHint}` : '回复完成');
    setTimeout(() => {
      if (!STUDIO_STATE.pending.companion) setAgentState('companion', 'idle', '正在倾听...');
    }, 2600);
  } catch (error) {
    dropStreamingAssistantMessage('companion', streamRow);
    const errMsg = error instanceof Error ? error.message : String(error);
    await syncRuntimeTaskOutcome(runtimeTaskId, 'failed', errMsg);
    rememberLocalMessage('companion', 'assistant', `LLM 调用失败: ${errMsg}`);
    setAgentState('companion', 'error', '调用失败，请检查模型或网络');
    setTimeout(() => {
      if (!STUDIO_STATE.pending.companion) setAgentState('companion', 'idle', '正在倾听...');
    }, 2600);
  } finally {
    STUDIO_STATE.streaming.companion = false;
    setPendingState('companion', false);
    persistStudioCache();
    applySnapshots();
  }
}

async function devSend(event) {
  if (event.key !== 'Enter') return;
  const input = document.getElementById('dev-input');
  if (!input || STUDIO_STATE.pending.dev) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  rememberLocalMessage('dev', 'user', text);
  setPendingState('dev', true);
  setAgentState('dev', 'working', '开发链路执行中...');
  applySnapshots();
  let runtimeTaskId = '';
  try {
    runtimeTaskId = await createRuntimeTaskFromInput(text, 'web');
  } catch {
    runtimeTaskId = '';
  }
  let streamRow = null;
  try {
    streamRow = startStreamingAssistantMessage('dev');
    renderDevMessages();
    const result = await requestLlmReply('dev', text, {
      onDelta(partial) {
        updateStreamingAssistantMessage('dev', streamRow, partial);
        renderDevMessages();
      },
    });
    const finalReply = finalizeStreamingAssistantMessage('dev', streamRow, result.text);
    const modelHint = [result.provider, result.model].filter(Boolean).join(' / ');
    await syncRuntimeTaskOutcome(runtimeTaskId, 'succeeded', finalReply || result.text);
    setAgentState('dev', 'done', modelHint ? `已完成 · ${modelHint}` : '已完成');
    setTimeout(() => {
      if (!STUDIO_STATE.pending.dev) setAgentState('dev', 'idle', '等待新任务...');
    }, 2400);
  } catch (error) {
    dropStreamingAssistantMessage('dev', streamRow);
    const errMsg = error instanceof Error ? error.message : String(error);
    await syncRuntimeTaskOutcome(runtimeTaskId, 'failed', errMsg);
    rememberLocalMessage('dev', 'assistant', `LLM 调用失败: ${errMsg}`);
    setAgentState('dev', 'error', '执行失败，请查看日志');
    setTimeout(() => {
      if (!STUDIO_STATE.pending.dev) setAgentState('dev', 'idle', '等待新任务...');
    }, 2400);
  } finally {
    STUDIO_STATE.streaming.dev = false;
    setPendingState('dev', false);
    persistStudioCache();
    applySnapshots();
  }
}

/* ─── Sidebar Toggle ─── */
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggle  = document.getElementById('sidebar-toggle');
  const icon    = toggle.querySelector('.toggle-icon');
  const isNowCollapsed = sidebar.classList.toggle('collapsed');
  toggle.classList.toggle('sidebar-collapsed', isNowCollapsed);
  icon.textContent = isNowCollapsed ? '›' : '‹';
  setTimeout(() => {
    syncVscTouchbar();
    if (VSC.state === 'expanded') {
      positionVscWidget();
    }
  }, 300);
}
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === '\\') { e.preventDefault(); toggleSidebar(); }
});

/* ─── Live2D Controls ─── */
function l2dAction(action) {
  const figure = document.querySelector('.live2d-figure');
  const subtitle = document.getElementById('companion-status-text');
  const actions = {
    smile:  { anim: 'l2d-smile',  label: '微笑中...' },
    blink:  { anim: 'l2d-blink',  label: '眨眼~' },
    wave:   { anim: 'l2d-wave',   label: '在挥手呢！' },
    think:  { anim: 'l2d-think',  label: '思考中...' },
    nod:    { anim: 'l2d-nod',    label: '嗯嗯！' }
  };
  const a = actions[action];
  if (!a || !figure) return;
  figure.style.animation = 'none';
  figure.offsetHeight; // reflow
  figure.style.animation = '';
  if (subtitle) subtitle.textContent = a.label;
  setTimeout(() => {
    if (!subtitle || STUDIO_STATE.pending.companion) return;
    subtitle.textContent = STUDIO_STATE.agentState.companion === 'idle' ? '正在倾听...' : subtitle.textContent;
  }, 1800);
}

function setL2dMode(mode, el) {
  document.querySelectorAll('.live2d-mode-opt').forEach(o => o.classList.remove('active'));
  el.classList.add('active');
  const badge = document.getElementById('l2d-badge');
  const label = document.querySelector('.live2d-canvas-label');
  if (mode === 'gateway') {
    if (badge) { badge.textContent = 'Gateway 模式'; badge.className = 'live2d-badge gateway'; }
    if (label) label.textContent = 'canvas:gateway · 30fps';
  } else {
    if (badge) { badge.textContent = 'Mock 模式'; badge.className = 'live2d-badge'; }
    if (label) label.textContent = 'canvas:mock · 30fps';
  }
}

// ─── Tool toggle ───
function toggleTool(row) {
  row.classList.toggle('open');
}

// ─── Session select ───
function selectSession(idx) {
  const scope = activeSessionScope();
  const tasks = sortedTasksByScope(scope);
  const task = tasks[idx];
  if (!task) return;
  STUDIO_STATE.selectedTaskIds[scope] = task.id;
  applySnapshots();
}

// ─── Debug item select ───
function selectDebugItem(el) {
  el.closest('.debug-left').querySelectorAll('.debug-error-item').forEach((item) => item.classList.remove('active'));
  el.classList.add('active');
  renderDebugChat(el.dataset.title, el.dataset.detail, el.dataset.time);
}

// ─── Plan outline ───
function setOutlineActive(el) {
  el.closest('.plan-outline').querySelectorAll('.outline-item').forEach((item) => item.classList.remove('active'));
  el.classList.add('active');
}

// ─── Monitor filter ───
function setMonitorFilter(btn, filter) {
  currentFilter = filter;
  document.querySelectorAll('.filter-chip').forEach((chip) => chip.classList.remove('active'));
  btn.classList.add('active');
  renderMonitorLogs();
  renderDebugLogs();
}

function clearMonitorLog() {
  STUDIO_STATE.monitorLogs = [];
  renderMonitorLogs();
  renderDebugLogs();
}

// Give scene pills proper IDs + bootstrap
document.addEventListener('DOMContentLoaded', () => {
  const pills = document.querySelectorAll('.scene-pill');
  const modes = ['companion', 'dev', 'debug', 'plan'];
  pills.forEach((pill, index) => { pill.id = `pill-${modes[index]}`; });
  restoreStudioCache();
  if (!STUDIO_STATE.projectHistory.openedFiles.length) {
    pushHistoryRows(STUDIO_STATE.projectHistory.openedFiles, 'README.md', 20);
  }
  showVSCode();
  syncWorkspaceLabels();
  switchView('dev');
  setAgentState('companion', 'idle', '正在倾听...');
  setAgentState('dev', 'idle', '等待新任务...');
  persistStudioCache();
  bootstrapStudio();
});
/* ─── VSCode Docked Workspace ─── */
const VSC = {
  state: 'hidden',  // 'hidden' | 'mini' | 'expanded'
  currentFile: '',
  workspaceName: 'WORKSPACE',
  workspaceRoot: '',
};

function showVSCode() {
  const w = document.getElementById('vscode-widget');
  if (!w) return;
  w.className = 'vsc-mini';
  w.style.display = 'none';
  VSC.state = 'mini';
  syncVscTouchbar();
}
function hideVSCode(e) {
  if (e) e.stopPropagation();
  const w = document.getElementById('vscode-widget');
  if (!w) return;
  w.className = '';
  w.style.display = 'none';
  VSC.state = 'hidden';
  stopVscPolling();
  syncVscTouchbar();
}
function expandVSCode() {
  if (VSC.state === 'expanded') return;
  const w = document.getElementById('vscode-widget');
  if (!w) return;
  w.className = 'vsc-expanded';
  w.style.display = 'flex';
  VSC.state = 'expanded';
  positionVscWidget();
  startVscPolling();
  syncVscTouchbar();
}
function collapseVSCode(e) {
  if (e) e.stopPropagation();
  const w = document.getElementById('vscode-widget');
  if (!w) return;
  w.className = 'vsc-mini';
  w.style.display = 'none';
  VSC.state = 'mini';
  stopVscPolling();
  syncVscTouchbar();
}
function toggleVSCodeFromTouchbar() {
  if (VSC.state === 'expanded') {
    collapseVSCode();
    return;
  }
  expandVSCode();
}

function switchVscPanel(panel, iconEl) {
  // Activity bar highlight
  document.querySelectorAll('.vsc-ab-icon').forEach(i => i.classList.remove('active'));
  if (iconEl) iconEl.classList.add('active');
  // Sidebar panels
  document.querySelectorAll('.vsc-sidebar-panel').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('vsc-panel-' + panel);
  if (target) target.classList.add('active');
  // Update title
  const titles = { explorer: '资源管理器', git: '源代码管理' };
  const t = document.getElementById('vsc-sidebar-title');
  if (t) t.textContent = titles[panel] || panel;
}

function toggleVscPanel(e) {
  if (e) e.stopPropagation();
  const p = document.getElementById('vsc-panel-term');
  if (p) p.classList.toggle('hidden');
}

window.addEventListener('resize', () => {
  syncVscTouchbar();
  if (VSC.state === 'expanded') {
    positionVscWidget();
  }
});

/* ─── Phase 1: Real API Integration (graceful degradation) ─── */
const SAVC_BASE = (() => {
  const params = new URLSearchParams(window.location.search);
  const override = (params.get('savcBase') || '').trim();
  if (!override) return window.location.origin;
  try {
    return new URL(override, window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
})();
let vscGitPollTimer = null;
const vscExpandedDirs = new Set(['']); // tracks expanded dir paths

function vscEsc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderFsTreeNodes(nodes, depth) {
  if (!nodes || !nodes.length) return '';
  let html = '';
  const indent = 4 + depth * 14;
  for (const node of nodes) {
    const gs = node.gitStatus;
    const gsMark = gs ? `<span class="vsc-tree-mod ${gs === 'M' ? 'm' : 'u'}">${gs}</span>` : '';
    if (node.type === 'dir') {
      const isExp = vscExpandedDirs.has(node.path);
      html += `<div class="vsc-tree-row" style="padding-left:${indent}px" onclick="vscToggleDir('${vscEsc(node.path)}')">
        <span class="vsc-tree-arrow">${isExp ? '▾' : '▸'}</span>
        <span class="vsc-tree-ico">${isExp ? '📂' : '📁'}</span>
        <span class="vsc-tree-name">${vscEsc(node.name)}</span>${gsMark}
      </div>`;
      if (isExp && node.children) html += renderFsTreeNodes(node.children, depth + 1);
    } else {
      const ext = (node.name.split('.').pop() || '').toLowerCase();
      const icoMap = { html:'⟨/⟩', htm:'⟨/⟩', js:'JS', mjs:'JS', ts:'TS', tsx:'TS', css:'{}', json:'{}', md:'¶', yaml:'≡', yml:'≡', sh:'$' };
      const icoRaw = icoMap[ext];
      const ico = icoRaw
        ? `<span class="vsc-tree-ico" style="font-size:9px;font-family:monospace">${icoRaw}</span>`
        : `<span class="vsc-tree-ico">📄</span>`;
      html += `<div class="vsc-tree-row" style="padding-left:${indent}px" onclick="vscOpenFile('${vscEsc(node.path)}',this)">
        <span class="vsc-tree-arrow"></span>${ico}
        <span class="vsc-tree-name">${vscEsc(node.name)}</span>${gsMark}
      </div>`;
    }
  }
  return html;
}

let vscTreeCache = null;
function fetchFsTree() {
  fetch(`${SAVC_BASE}/__savc/fs/tree?path=.&depth=3`)
    .then(r => r.json())
    .then(data => {
      if (!data.ok || !data.tree) return;
      const workspaceName = String(data?.workspace?.name || '').trim();
      const workspaceRoot = String(data?.workspace?.root || '').trim();
      if (workspaceName) {
        VSC.workspaceName = workspaceName;
      }
      if (workspaceRoot) {
        VSC.workspaceRoot = workspaceRoot;
      }
      syncWorkspaceLabels();
      vscTreeCache = data.tree;
      renderFsTree(data.tree);
    })
    .catch(() => {
      vscTreeCache = [];
      renderFsTree([]);
    });
}

function renderFsTree(tree) {
  const panel = document.getElementById('vsc-panel-explorer');
  if (!panel) return;
  const rootLabel = vscEsc(VSC.workspaceName || 'WORKSPACE');
  const header = `<div class="vsc-tree-row" style="padding-left:4px;font-size:11px;color:#bbbcbd;font-family:var(--font-ui)">
    <span class="vsc-tree-arrow">▾</span>
    <span style="font-weight:700;letter-spacing:.02em">${rootLabel}</span>
  </div>`;
  const body = Array.isArray(tree) && tree.length
    ? renderFsTreeNodes(tree, 0)
    : `<div class="vsc-tree-row" style="padding-left:16px"><span class="vsc-tree-arrow"></span><span class="vsc-tree-ico">ℹ</span><span class="vsc-tree-name">未获取到文件树</span></div>`;
  panel.innerHTML = header + body;
}

function syncWorkspaceLabels() {
  const label = String(VSC.workspaceName || 'WORKSPACE').trim() || 'WORKSPACE';
  const rootLabelEl = document.getElementById('vsc-workspace-root-label');
  const titleEl = document.getElementById('vsc-workspace-title');
  if (rootLabelEl) rootLabelEl.textContent = label.toUpperCase();
  if (titleEl) titleEl.textContent = `项目工作区 · ${label}`;
}

function vscToggleDir(dirPath) {
  if (vscExpandedDirs.has(dirPath)) vscExpandedDirs.delete(dirPath);
  else vscExpandedDirs.add(dirPath);
  if (vscTreeCache) renderFsTree(vscTreeCache);
}

function vscOpenFile(filePath, rowEl) {
  document.querySelectorAll('.vsc-tree-row').forEach(r => r.classList.remove('active'));
  if (rowEl) rowEl.classList.add('active');
  VSC.currentFile = filePath;
  pushHistoryRows(STUDIO_STATE.projectHistory.openedFiles, filePath, 20);
  persistStudioCache();

  const fileName = filePath.split('/').pop();
  const tabKey = filePath.replace(/[^a-z0-9]/gi, '_');
  const tabId  = 'vsc-tab-dyn-' + tabKey;
  const codeId = 'vsc-code-dyn-' + tabKey;

  if (!document.getElementById(tabId)) {
    const tabs = document.querySelector('.vsc-tabs');
    const t = document.createElement('div');
    t.className = 'vsc-tab'; t.id = tabId;
    t.innerHTML = `<span>${vscEsc(fileName)}</span><span class="vsc-tab-x">×</span>`;
    t.querySelector('.vsc-tab-x').onclick = e => { e.stopPropagation(); t.remove(); const cp = document.getElementById(codeId); if(cp) cp.remove(); };
    t.onclick = () => { VSC.currentFile = filePath; vscActivatePanel(tabId, codeId, filePath); };
    tabs.appendChild(t);
  }

  // Only create plain-text panel if CM is NOT available (fallback)
  if (!window.vscCM && !document.getElementById(codeId)) {
    const area = document.querySelector('.vsc-editor-area');
    const cp = document.createElement('div');
    cp.className = 'vsc-code'; cp.id = codeId; cp.style.display = 'none';
    cp.innerHTML = '<div class="vsc-code-line"><span class="vsc-ln">…</span><span class="vsc-ct">加载中…</span></div>';
    const term = document.getElementById('vsc-panel-term');
    if (term) area.insertBefore(cp, term); else area.appendChild(cp);
  }

  vscActivatePanel(tabId, codeId, filePath);

  fetch(`${SAVC_BASE}/__savc/fs/read?path=${encodeURIComponent(filePath)}`)
    .then(r => r.json())
    .then(data => {
      if (!data.ok) return;
      const langLabel = { typescript:'TypeScript', javascript:'JavaScript', html:'HTML', css:'CSS', markdown:'Markdown', json:'JSON', yaml:'YAML', shell:'Shell', plaintext:'Plain Text' };
      const sbLang = document.getElementById('vsc-sb-lang');
      if (sbLang) sbLang.textContent = langLabel[data.language] || data.language || 'Plain Text';
      if (window.vscCM) {
        window.vscCM.open(data.content, data.language);
        const cm = document.getElementById('vsc-cm-mount');
        if (cm) cm.style.display = '';
        document.querySelectorAll('[id^="vsc-code-"]').forEach(p => { p.style.display = 'none'; });
      } else {
        const cp = document.getElementById(codeId);
        if (!cp) return;
        const lines = data.content.split('\n');
        cp.innerHTML = lines.map((line, i) =>
          `<div class="vsc-code-line"><span class="vsc-ln">${i+1}</span><span class="vsc-ct">${vscEsc(line)}</span></div>`
        ).join('');
      }
    })
    .catch(() => {});
}

function vscActivatePanel(tabId, codeId, filePath) {
  document.querySelectorAll('.vsc-tab').forEach(t => t.classList.remove('active'));
  const tab = document.getElementById(tabId);
  if (tab) tab.classList.add('active');
  // If CM is active, leave display handled by vscOpenFile fetch callback
  if (!window.vscCM) {
    document.querySelectorAll('[id^="vsc-code-"]').forEach(p => { p.style.display = 'none'; });
    const cp = document.getElementById(codeId);
    if (cp) cp.style.display = '';
  }
  const bc = document.getElementById('vsc-breadcrumb');
  if (bc && filePath) {
    const parts = filePath.split('/');
    bc.innerHTML = parts.map((seg, i) =>
      i < parts.length - 1
        ? `<span>${vscEsc(seg)}</span><span class="vsc-bc-sep">›</span>`
        : `<span class="vsc-bc-cur">${vscEsc(seg)}</span>`
    ).join('');
  }
}

/* ─── Phase 2: Write / Git ops ─── */

function vscSaveFile() {
  const filePath = VSC.currentFile;
  if (!filePath) return;
  const content = window.vscCM ? window.vscCM.getContent() : null;
  if (content === null) return; // no CM = read-only in Phase 1 mode
  fetch(`${SAVC_BASE}/__savc/fs/write`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath, content }),
  })
  .then(r => r.json())
  .then(data => {
    if (data.ok) {
      const sbLang = document.getElementById('vsc-sb-lang');
      if (sbLang) { const orig = sbLang.textContent; sbLang.textContent = '✓ 已保存'; setTimeout(() => { sbLang.textContent = orig; }, 1500); }
    }
  })
  .catch(() => {});
}

function vscStageFile(filePath) {
  fetch(`${SAVC_BASE}/__savc/git/add`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths: [filePath] }),
  })
  .then(r => r.json())
  .then(data => { if (data.ok) fetchGitStatus(); })
  .catch(() => {});
}

function vscCommit() {
  const msgEl = document.getElementById('vsc-git-msg');
  if (!msgEl) return;
  const message = msgEl.value.trim();
  if (!message) { msgEl.focus(); return; }
  fetch(`${SAVC_BASE}/__savc/git/commit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })
  .then(r => r.json())
  .then(data => {
    if (data.ok) { msgEl.value = ''; fetchGitStatus(); fetchFsTree(); }
    else { msgEl.style.borderColor = '#C8571E'; setTimeout(() => { msgEl.style.borderColor = ''; }, 2000); }
  })
  .catch(() => {});
}

// Ctrl+S handler for the widget
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's' && VSC.state === 'expanded') {
    e.preventDefault(); vscSaveFile();
  }
});

function fetchGitStatus() {
  fetch(`${SAVC_BASE}/__savc/git/status`)
    .then(r => r.json())
    .then(data => {
      if (!data.ok) return;
      const workspaceName = String(data.workspace || '').trim();
      const workspaceRoot = String(data.workspaceRoot || '').trim();
      if (workspaceName) VSC.workspaceName = workspaceName;
      if (workspaceRoot) VSC.workspaceRoot = workspaceRoot;
      syncWorkspaceLabels();
      const br = document.getElementById('vsc-sb-branch');
      if (br) br.textContent = data.isGitRepo ? `⎇ ${data.branch || "-"}` : `⎇ ${VSC.workspaceName} (no-git)`;
      const panel = document.getElementById('vsc-panel-git');
      if (!panel) return;
      const commitArea = panel.querySelector('.vsc-git-commit-area');
      const commitHtml = commitArea ? commitArea.outerHTML : '';
      if (!data.isGitRepo) {
        panel.innerHTML = `${commitHtml}<div style="font-size:10px;color:#6B5A48;padding:6px 8px;opacity:.85">当前工作区未初始化 Git 仓库，仅提供文件编辑/终端能力。</div>`;
        return;
      }
      const mkFile = (f, sym, cls, stageable) => {
        const name = f.split('/').pop();
        const dir  = f.includes('/') ? f.split('/').slice(0,-1).join('/') : '';
        const stageBtn = stageable
          ? `<span onclick="vscStageFile('${vscEsc(f)}')" style="margin-left:auto;padding:0 4px;cursor:pointer;color:#73c991;font-weight:700" title="暂存">+</span>`
          : '';
        return `<div class="vsc-git-file" style="cursor:pointer" onclick="vscOpenFile('${vscEsc(f)}',null)"><span class="vsc-git-mark ${cls}">${sym}</span>${vscEsc(name)}<span style="font-size:9px;color:#7B6845;margin-left:4px;opacity:.65">${dir ? dir+'/' : ''}</span>${stageBtn}</div>`;
      };
      const mkList = (files, sym, cls, stageable) => files.length
        ? files.map(f => mkFile(f, sym, cls, stageable)).join('')
        : `<div style="font-size:10px;color:#6B5A48;padding:4px 8px;opacity:.7">无</div>`;
      panel.innerHTML = commitHtml
        + (data.staged.length ? `<div class="vsc-git-section-title">暂存的更改 (${data.staged.length})</div>${mkList(data.staged,'A','a',false)}` : '')
        + `<div class="vsc-git-section-title">更改 (${data.unstaged.length})</div>${mkList(data.unstaged,'M','m',true)}`
        + `<div class="vsc-git-section-title" style="padding-top:6px">未跟踪 (${data.untracked.length})</div>${mkList(data.untracked,'U','u',true)}`;
    })
    .catch(() => {
      const panel = document.getElementById('vsc-panel-git');
      if (!panel) return;
      const commitArea = panel.querySelector('.vsc-git-commit-area');
      const commitHtml = commitArea ? commitArea.outerHTML : '';
      panel.innerHTML = `${commitHtml}<div style="font-size:10px;color:#6B5A48;padding:6px 8px;opacity:.8">Git 状态读取失败，请检查 savc-ui 服务。</div>`;
    });
}

function startVscPolling() {
  if (vscGitPollTimer) return;
  fetchFsTree();
  fetchGitStatus();
  vscGitPollTimer = setInterval(fetchGitStatus, 8000);
}
function stopVscPolling() {
  if (vscGitPollTimer) { clearInterval(vscGitPollTimer); vscGitPollTimer = null; }
}
