import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

export const TASK_TYPES = new Set([
  "requirement_analysis",
  "development_planning",
  "development_execution",
]);

export function validateCreateTask(input) {
  const payload = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const projectId = String(payload.projectId || "").trim();
  const taskType = String(payload.taskType || "").trim();
  const taskInput =
    payload.input && typeof payload.input === "object" && !Array.isArray(payload.input)
      ? payload.input
      : null;
  const requirement = taskInput ? String(taskInput.requirement || "").trim() : "";

  if (!projectId) {
    return { ok: false, code: 40051, message: "missing projectId" };
  }
  if (!TASK_TYPES.has(taskType)) {
    return { ok: false, code: 40050, message: "invalid taskType" };
  }
  if (!taskInput || !requirement) {
    return { ok: false, code: 40053, message: "invalid task input" };
  }

  const callback =
    payload.callback && typeof payload.callback === "object" && !Array.isArray(payload.callback)
      ? payload.callback
      : null;
  if (callback && callback.url !== undefined && typeof callback.url !== "string") {
    return { ok: false, code: 40052, message: "invalid callback config" };
  }
  if (callback && callback.secret !== undefined && typeof callback.secret !== "string") {
    return { ok: false, code: 40052, message: "invalid callback config" };
  }

  return { ok: true };
}

async function readJsonIfExists(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

export class CommercialTaskStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.tasksFile = path.join(dataDir, "tasks.json");
    this.eventsFile = path.join(dataDir, "events.json");
    this.tasks = new Map();
    this.events = new Map();
    this.ready = false;
  }

  async init() {
    if (this.ready) {
      return;
    }
    await fs.mkdir(this.dataDir, { recursive: true });
    const tasks = await readJsonIfExists(this.tasksFile, []);
    const events = await readJsonIfExists(this.eventsFile, {});

    for (const item of ensureArray(tasks)) {
      if (!item || typeof item !== "object") continue;
      const taskId = String(item.taskId || "").trim();
      if (!taskId) continue;
      this.tasks.set(taskId, item);
    }

    if (events && typeof events === "object" && !Array.isArray(events)) {
      for (const [taskId, rows] of Object.entries(events)) {
        this.events.set(taskId, ensureArray(rows));
      }
    }

    this.ready = true;
  }

  async persist() {
    await this.init();
    const tasks = Array.from(this.tasks.values()).sort((a, b) => {
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
    const events = Object.fromEntries(this.events.entries());
    await writeJsonAtomic(this.tasksFile, tasks);
    await writeJsonAtomic(this.eventsFile, events);
  }

  makeTaskId() {
    return `task_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  }

  makeEventId() {
    return `evt_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  }

  makeMessageId() {
    return `msg_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  }

  async createTask(payload, traceId) {
    await this.init();
    const taskId = this.makeTaskId();
    const createdAt = nowIso();
    const callback =
      payload.callback && typeof payload.callback === "object" && !Array.isArray(payload.callback)
        ? {
            url: typeof payload.callback.url === "string" ? payload.callback.url : null,
            secret: typeof payload.callback.secret === "string" ? payload.callback.secret : null,
            events: ensureArray(payload.callback.events).filter((value) => typeof value === "string"),
          }
        : null;

    const task = {
      taskId,
      projectId: String(payload.projectId),
      taskType: String(payload.taskType),
      status: "accepted",
      traceId,
      input: clone(payload.input || {}),
      context:
        payload.context && typeof payload.context === "object" && !Array.isArray(payload.context)
          ? clone(payload.context)
          : {},
      callback,
      options:
        payload.options && typeof payload.options === "object" && !Array.isArray(payload.options)
          ? clone(payload.options)
          : {},
      agent: null,
      sessionKey: null,
      childSessionKey: null,
      summary: "task accepted",
      result: null,
      error: null,
      createdAt,
      updatedAt: createdAt,
      lastEventAt: createdAt,
    };

    this.tasks.set(taskId, task);
    this.events.set(taskId, [
      {
        eventId: this.makeEventId(),
        type: "task.accepted",
        status: "accepted",
        summary: "task accepted",
        payload: {},
        createdAt,
      },
    ]);
    await this.persist();
    return clone(task);
  }

  async listTasks(filters = {}) {
    await this.init();
    let items = Array.from(this.tasks.values());

    if (filters.projectId) {
      items = items.filter((task) => task.projectId === filters.projectId);
    }
    if (filters.taskType) {
      items = items.filter((task) => task.taskType === filters.taskType);
    }
    if (filters.status) {
      items = items.filter((task) => task.status === filters.status);
    }

    items.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    const page = Math.max(1, Number.parseInt(String(filters.page || 1), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(filters.pageSize || 20), 10) || 20));
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    const rows = items.slice(start, start + pageSize).map((task) => clone(task));
    return { items: rows, total, page, pageSize, totalPages };
  }

  async getTask(taskId) {
    await this.init();
    const task = this.tasks.get(String(taskId || ""));
    return task ? clone(task) : null;
  }

  async getEvents(taskId, paging = {}) {
    await this.init();
    const rows = ensureArray(this.events.get(String(taskId || "")));
    const page = Math.max(1, Number.parseInt(String(paging.page || 1), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(paging.pageSize || 50), 10) || 50));
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    return {
      items: rows.slice(start, start + pageSize).map((item) => clone(item)),
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  async appendEvent(taskId, event) {
    await this.init();
    const task = this.tasks.get(String(taskId || ""));
    if (!task) {
      return null;
    }
    const createdAt = nowIso();
    const row = {
      eventId: this.makeEventId(),
      createdAt,
      ...event,
    };
    const rows = ensureArray(this.events.get(task.taskId));
    rows.push(row);
    this.events.set(task.taskId, rows);
    task.updatedAt = createdAt;
    task.lastEventAt = createdAt;
    if (typeof row.status === "string" && row.status) {
      task.status = row.status;
    }
    if (typeof row.summary === "string" && row.summary) {
      task.summary = row.summary;
    }
    await this.persist();
    return clone(row);
  }

  async createMessage(taskId, content, msgType = "text") {
    await this.init();
    const task = this.tasks.get(String(taskId || ""));
    if (!task) {
      return null;
    }
    if (["completed", "failed", "canceled"].includes(String(task.status || ""))) {
      return { error: { code: 40951, message: "task not messageable" } };
    }
    const createdAt = nowIso();
    const messageId = this.makeMessageId();
    await this.appendEvent(task.taskId, {
      type: "task.message.accepted",
      status: task.status,
      summary: "message accepted",
      payload: {
        messageId,
        content,
        msgType,
      },
    });
    return {
      taskId: task.taskId,
      messageId,
      status: "accepted",
      createdAt,
    };
  }

  async cancelTask(taskId, reason) {
    await this.init();
    const task = this.tasks.get(String(taskId || ""));
    if (!task) {
      return null;
    }
    if (["completed", "failed", "canceled"].includes(String(task.status || ""))) {
      return { error: { code: 40952, message: "task already terminal" } };
    }
    await this.appendEvent(task.taskId, {
      type: "task.canceled",
      status: "canceled",
      summary: "task canceled",
      payload: {
        reason: String(reason || "manual_cancel"),
      },
    });
    return this.getTask(task.taskId);
  }
}
