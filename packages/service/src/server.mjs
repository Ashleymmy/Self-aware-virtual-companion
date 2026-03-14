import { createServer } from "node:http";
import { loadConfig } from "./config.mjs";
import {
  buildHealthPayload,
  createTraceId,
  parseRequestUrl,
  readJsonBody,
  sendError,
  sendSuccess,
} from "./http.mjs";
import { CommercialTaskStore, validateCreateTask } from "./store.mjs";

export async function createCommercialService(options = {}) {
  const config = {
    ...loadConfig(),
    ...options,
  };
  const store = options.store || new CommercialTaskStore(config.dataDir);
  await store.init();

  async function handler(req, res) {
    const traceId = createTraceId(req.headers["x-trace-id"]);

    const authEnabled = Boolean(config.apiKey);
    if (authEnabled) {
      const requestKey = String(req.headers["x-savc-key"] || "").trim();
      if (!requestKey) {
        sendError(res, 401, 40151, "missing service key", traceId);
        return;
      }
      if (requestKey !== config.apiKey) {
        sendError(res, 401, 40150, "invalid service key", traceId);
        return;
      }
    }

    const parsed = parseRequestUrl(req, config.basePath);
    if (!parsed) {
      sendError(res, 404, 40400, "resource not found", traceId);
      return;
    }

    const method = String(req.method || "GET").toUpperCase();
    const { routePath, segments, url } = parsed;

    try {
      if (method === "GET" && routePath === "/health") {
        sendSuccess(res, 200, "success", buildHealthPayload(), traceId);
        return;
      }

      if (method === "POST" && routePath === "/tasks") {
        let body;
        try {
          body = await readJsonBody(req);
        } catch {
          sendError(res, 400, 40001, "invalid json body", traceId);
          return;
        }
        const validation = validateCreateTask(body);
        if (!validation.ok) {
          sendError(res, 400, validation.code, validation.message, traceId);
          return;
        }
        const task = await store.createTask(body, traceId);
        sendSuccess(
          res,
          201,
          "task accepted",
          {
            taskId: task.taskId,
            projectId: task.projectId,
            taskType: task.taskType,
            status: task.status,
            traceId: task.traceId,
            createdAt: task.createdAt,
          },
          traceId,
        );
        return;
      }

      if (method === "GET" && routePath === "/tasks") {
        const result = await store.listTasks({
          projectId: url.searchParams.get("projectId") || undefined,
          taskType: url.searchParams.get("taskType") || undefined,
          status: url.searchParams.get("status") || undefined,
          page: url.searchParams.get("page") || undefined,
          pageSize: url.searchParams.get("pageSize") || undefined,
        });
        sendSuccess(res, 200, "success", result, traceId);
        return;
      }

      if (segments[0] === "tasks" && segments[1]) {
        const taskId = segments[1];

        if (method === "GET" && segments.length === 2) {
          const task = await store.getTask(taskId);
          if (!task) {
            sendError(res, 404, 40450, "task not found", traceId);
            return;
          }
          sendSuccess(res, 200, "success", task, traceId);
          return;
        }

        if (method === "GET" && segments.length === 3 && segments[2] === "events") {
          const task = await store.getTask(taskId);
          if (!task) {
            sendError(res, 404, 40450, "task not found", traceId);
            return;
          }
          const events = await store.getEvents(taskId, {
            page: url.searchParams.get("page") || undefined,
            pageSize: url.searchParams.get("pageSize") || undefined,
          });
          sendSuccess(res, 200, "success", events, traceId);
          return;
        }

        if (method === "POST" && segments.length === 3 && segments[2] === "messages") {
          const task = await store.getTask(taskId);
          if (!task) {
            sendError(res, 404, 40450, "task not found", traceId);
            return;
          }
          let body;
          try {
            body = await readJsonBody(req);
          } catch {
            sendError(res, 400, 40001, "invalid json body", traceId);
            return;
          }
          const content = String(body.content || "").trim();
          if (!content) {
            sendError(res, 422, 42251, "empty message content", traceId);
            return;
          }
          const result = await store.createMessage(taskId, content, String(body.msgType || "text"));
          if (result?.error) {
            sendError(res, 409, result.error.code, result.error.message, traceId);
            return;
          }
          sendSuccess(res, 201, "message accepted", result, traceId);
          return;
        }

        if (method === "POST" && segments.length === 3 && segments[2] === "cancel") {
          const task = await store.getTask(taskId);
          if (!task) {
            sendError(res, 404, 40450, "task not found", traceId);
            return;
          }
          let body;
          try {
            body = await readJsonBody(req);
          } catch {
            sendError(res, 400, 40001, "invalid json body", traceId);
            return;
          }
          const result = await store.cancelTask(taskId, body.reason);
          if (result?.error) {
            sendError(res, 409, result.error.code, result.error.message, traceId);
            return;
          }
          sendSuccess(
            res,
            200,
            "task canceled",
            {
              taskId: result.taskId,
              status: result.status,
            },
            traceId,
          );
          return;
        }

        if (method === "POST" && segments.length === 3 && segments[2] === "retry") {
          sendError(res, 501, 50100, "not implemented", traceId);
          return;
        }
      }

      sendError(res, 404, 40400, "resource not found", traceId);
    } catch (error) {
      sendError(
        res,
        500,
        50000,
        error instanceof Error ? error.message : String(error),
        traceId,
      );
    }
  }

  return {
    config,
    store,
    handler,
    server: createServer(handler),
  };
}

export async function startCommercialService(options = {}) {
  const service = await createCommercialService(options);
  await new Promise((resolve) => {
    service.server.listen(service.config.port, service.config.host, resolve);
  });
  return service;
}

if (import.meta.url === new URL(process.argv[1], "file://").href) {
  startCommercialService()
    .then((service) => {
      console.log(
        `[savc-service] listening on http://${service.config.host}:${service.config.port}${service.config.basePath || ""}`,
      );
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
