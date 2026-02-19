import type { IncomingMessage, ServerResponse } from "node:http";
import {
  appendChat,
  bootstrapSystemNote,
  createDefaultPreferences,
  createInitialState,
  defaultSessionForMode,
  generateSnapshot,
  normalizeMode,
  randomNudge,
} from "../src/mock-data.js";
import type { ChatSendMessage, WorkbenchMode, WorkbenchPreferences } from "../src/types.js";

let preferences = createDefaultPreferences();
const state = createInitialState();

function json(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function noContent(res: ServerResponse): void {
  res.statusCode = 204;
  res.end();
}

async function readBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw) as T;
}

function parseQuery(req: IncomingMessage): URL {
  return new URL(req.url ?? "/", "http://127.0.0.1");
}

function sessionAndMode(req: IncomingMessage): { sessionKey: string; mode: WorkbenchMode } {
  const url = parseQuery(req);
  const mode = normalizeMode(url.searchParams.get("mode"));
  const fallback = defaultSessionForMode(state, mode);
  const sessionKey = url.searchParams.get("sessionKey")?.trim() || fallback.sessionKey;
  return { sessionKey, mode };
}

function handleSnapshot(req: IncomingMessage, res: ServerResponse): void {
  if ((req.method ?? "GET").toUpperCase() !== "GET") {
    json(res, 405, { error: "method_not_allowed" });
    return;
  }

  const target = sessionAndMode(req);
  const snapshot = generateSnapshot(state, preferences, target);
  json(res, 200, snapshot);
}

function handlePreferencesGet(req: IncomingMessage, res: ServerResponse): void {
  if ((req.method ?? "GET").toUpperCase() !== "GET") {
    json(res, 405, { error: "method_not_allowed" });
    return;
  }
  json(res, 200, preferences);
}

async function handlePreferencesPost(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if ((req.method ?? "POST").toUpperCase() !== "POST") {
    json(res, 405, { error: "method_not_allowed" });
    return;
  }

  try {
    const body = await readBody<Partial<WorkbenchPreferences>>(req);
    preferences = {
      ...preferences,
      ...body,
      live2dSensitivity:
        typeof body.live2dSensitivity === "number"
          ? Math.max(0.2, Math.min(1.4, body.live2dSensitivity))
          : preferences.live2dSensitivity,
    };
    json(res, 200, { ok: true, preferences });
  } catch {
    json(res, 400, { ok: false, error: "invalid_json" });
  }
}

async function handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if ((req.method ?? "POST").toUpperCase() !== "POST") {
    json(res, 405, { error: "method_not_allowed" });
    return;
  }

  try {
    const body = await readBody<ChatSendMessage>(req);
    const mode = normalizeMode(body.mode);
    const text = String(body.text ?? "").trim();
    const sessionKey = String(body.sessionKey ?? "").trim();

    if (!sessionKey || !text) {
      json(res, 400, { ok: false, error: "sessionKey_and_text_required" });
      return;
    }

    const response = appendChat(state, {
      sessionKey,
      mode,
      text,
    });

    json(res, 200, response);
  } catch (error) {
    json(res, 500, {
      ok: false,
      error: "chat_failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function handleModeSwitch(req: IncomingMessage, res: ServerResponse): void {
  if ((req.method ?? "POST").toUpperCase() !== "POST") {
    json(res, 405, { error: "method_not_allowed" });
    return;
  }

  const target = sessionAndMode(req);
  bootstrapSystemNote(state, target.mode, target.sessionKey);
  noContent(res);
}

function handleStream(req: IncomingMessage, res: ServerResponse): void {
  if ((req.method ?? "GET").toUpperCase() !== "GET") {
    json(res, 405, { error: "method_not_allowed" });
    return;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.write("retry: 4000\n\n");

  const emit = () => {
    randomNudge(state);
    const sample = generateSnapshot(state, preferences);
    res.write(`event: snapshot\ndata: ${JSON.stringify(sample)}\n\n`);
  };

  emit();
  const timer = setInterval(emit, 15_000);

  req.on("close", () => {
    clearInterval(timer);
  });
}

export function registerWorkbenchMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): void {
  const path = (req.url ?? "").split("?")[0] ?? "";

  if (path === "/" || path === "/workbench" || path === "/workbench/") {
    res.statusCode = 302;
    res.setHeader("Location", "/workbench/index.html");
    res.end();
    return;
  }

  if (path === "/__savc/workbench/snapshot") {
    handleSnapshot(req, res);
    return;
  }

  if (path === "/__savc/workbench/preferences") {
    if ((req.method ?? "GET").toUpperCase() === "GET") {
      handlePreferencesGet(req, res);
    } else {
      void handlePreferencesPost(req, res);
    }
    return;
  }

  if (path === "/__savc/workbench/chat") {
    void handleChat(req, res);
    return;
  }

  if (path === "/__savc/workbench/mode") {
    handleModeSwitch(req, res);
    return;
  }

  if (path === "/__savc/workbench/stream") {
    handleStream(req, res);
    return;
  }

  next();
}
