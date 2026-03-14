import crypto from "node:crypto";

function nowIso() {
  return new Date().toISOString();
}

export function createTraceId(value) {
  const candidate = String(value || "").trim();
  return candidate || `trace_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function sendJson(res, statusCode, body, traceId) {
  const payload = JSON.stringify(body);
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  if (traceId) {
    res.setHeader("x-trace-id", traceId);
  }
  res.end(payload);
}

export function sendSuccess(res, statusCode, message, data, traceId) {
  sendJson(
    res,
    statusCode,
    {
      code: 0,
      message,
      data,
    },
    traceId,
  );
}

export function sendError(res, statusCode, code, message, traceId) {
  sendJson(
    res,
    statusCode,
    {
      code,
      message,
      data: null,
    },
    traceId,
  );
}

export async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }
  return JSON.parse(raw);
}

export function parseRequestUrl(req, basePath) {
  const url = new URL(req.url || "/", "http://localhost");
  const pathname = url.pathname;
  const normalizedBase = basePath || "";
  if (normalizedBase && !pathname.startsWith(normalizedBase)) {
    return null;
  }
  const routePath = normalizedBase ? pathname.slice(normalizedBase.length) || "/" : pathname;
  return {
    url,
    pathname,
    routePath,
    segments: routePath.split("/").filter(Boolean),
  };
}

export function buildHealthPayload() {
  return {
    status: "ok",
    service: "savc-commercial-adapter",
    version: "v1",
    gateway: {
      ok: false,
      latencyMs: null,
    },
    store: {
      ok: true,
    },
    time: nowIso(),
  };
}
