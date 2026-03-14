let cachedCreateSessionsSpawnTool = null;
let cachedCreateSessionsSendTool = null;
let cachedCallGateway = null;
function asObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    return value;
}
function readPayloadFromSpawnResult(result) {
    const fromDetails = asObject(result.details);
    if (fromDetails) {
        return fromDetails;
    }
    const firstText = Array.isArray(result.content)
        ? result.content.find((item) => item && item.type === "text" && typeof item.text === "string")
        : null;
    if (!firstText || !firstText.text) {
        return null;
    }
    try {
        return asObject(JSON.parse(firstText.text));
    }
    catch {
        return null;
    }
}
function readString(value) {
    return typeof value === "string" ? value.trim() : "";
}
function readTextValue(value) {
    if (typeof value === "string") {
        return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
    }
    return "";
}
function extractAssistantText(messages) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = asObject(messages[index]);
        if (!message) {
            continue;
        }
        if (readString(message.role) !== "assistant") {
            continue;
        }
        const content = message.content;
        if (typeof content === "string" && content.trim()) {
            return content.trim();
        }
        if (Array.isArray(content)) {
            const parts = content
                .map((item) => {
                if (typeof item === "string") {
                    return item.trim();
                }
                const itemObj = asObject(item);
                if (!itemObj) {
                    return "";
                }
                if (typeof itemObj.text === "string") {
                    return itemObj.text.trim();
                }
                if (typeof itemObj.value === "string") {
                    return itemObj.value.trim();
                }
                return "";
            })
                .filter(Boolean);
            if (parts.length > 0) {
                return parts.join("\n").trim();
            }
        }
        const fallbackText = readTextValue(message.text);
        if (fallbackText) {
            return fallbackText;
        }
    }
    return null;
}
function toDurationMs(startedAt, endedAt) {
    if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) {
        return null;
    }
    return Math.max(0, Math.round(endedAt - startedAt));
}
function mapWaitStatus(status, options = {}) {
    const normalized = status.toLowerCase();
    if (normalized === "ok") {
        return "completed";
    }
    if (normalized === "error") {
        return "failed";
    }
    if (normalized === "timeout") {
        return options.treatTimeoutAsRunning ? "running" : "timeout";
    }
    return "running";
}
async function resolveOpenClawModule(subPath) {
    const ocRoot = process.env.OPENCLAW_ROOT || "";
    // 1. 如果设置了 OPENCLAW_ROOT 环境变量，优先使用
    if (ocRoot) {
        const candidates = [
            `${ocRoot}/src/${subPath}`,
            `${ocRoot}/dist/${subPath}`,
            `${ocRoot}/${subPath}`,
        ];
        for (const candidate of candidates) {
            try {
                return await import(candidate);
            }
            catch {
                // try next
            }
        }
    }
    // 2. 尝试 openclaw 包导入（npm/全局安装场景）
    try {
        return await import(`openclaw/${subPath.replace(/\.js$/, "")}`);
    }
    catch {
        // fallback
    }
    // 3. 旧版相对路径 fallback（当插件仍在 openclaw/extensions/ 下时）
    const relativePaths = [
        `../../../src/${subPath}`,
        `../../../${subPath}`,
    ];
    for (const rel of relativePaths) {
        try {
            return await import(rel);
        }
        catch {
            // try next
        }
    }
    throw new Error(`OpenClaw module not found: ${subPath}. Set OPENCLAW_ROOT env var or install openclaw as dependency.`);
}
async function loadCreateSessionsSpawnTool() {
    if (cachedCreateSessionsSpawnTool) {
        return cachedCreateSessionsSpawnTool;
    }
    const mod = await resolveOpenClawModule("agents/tools/sessions-spawn-tool.js");
    if (typeof mod.createSessionsSpawnTool !== "function") {
        throw new Error("createSessionsSpawnTool is not available");
    }
    cachedCreateSessionsSpawnTool = mod.createSessionsSpawnTool;
    return cachedCreateSessionsSpawnTool;
}
async function loadCreateSessionsSendTool() {
    if (cachedCreateSessionsSendTool) {
        return cachedCreateSessionsSendTool;
    }
    const mod = await resolveOpenClawModule("agents/tools/sessions-send-tool.js");
    if (typeof mod.createSessionsSendTool !== "function") {
        throw new Error("createSessionsSendTool is not available");
    }
    cachedCreateSessionsSendTool = mod.createSessionsSendTool;
    return cachedCreateSessionsSendTool;
}
async function loadCallGateway() {
    if (cachedCallGateway) {
        return cachedCallGateway;
    }
    const mod = await resolveOpenClawModule("gateway/call.js");
    if (typeof mod.callGateway !== "function") {
        throw new Error("callGateway is not available");
    }
    cachedCallGateway = mod.callGateway;
    return cachedCallGateway;
}
export async function spawnRealAgent(params) {
    const createSessionsSpawnTool = await loadCreateSessionsSpawnTool();
    const sessionsSpawn = createSessionsSpawnTool({
        agentSessionKey: params.requesterSessionKey,
        agentChannel: params.requesterChannel,
        agentAccountId: params.requesterAccountId,
        requesterAgentIdOverride: params.requesterAgentId,
    });
    const spawnResult = await sessionsSpawn.execute(`savc-spawn-${Date.now()}`, {
        task: params.task,
        agentId: params.targetAgentId,
        label: params.label,
        cleanup: "keep",
        runTimeoutSeconds: Math.max(1, Math.ceil(params.timeoutMs / 1000)),
    });
    const payload = readPayloadFromSpawnResult(spawnResult) ?? {};
    const status = readString(payload.status);
    const runId = readString(payload.runId);
    const childSessionKey = readString(payload.childSessionKey);
    const warning = readString(payload.warning) || undefined;
    if (status !== "accepted" || !runId || !childSessionKey) {
        const error = readString(payload.error) || "sessions_spawn did not return an accepted run";
        const code = status === "forbidden" ? "SPAWN_FORBIDDEN" : "SPAWN_FAILED";
        return {
            ok: false,
            code,
            error,
            status: status || undefined,
        };
    }
    return {
        ok: true,
        runId,
        childSessionKey,
        status: "accepted",
        warning,
    };
}
export async function sendRealAgentMessage(params) {
    const createSessionsSendTool = await loadCreateSessionsSendTool();
    const sessionsSend = createSessionsSendTool({
        agentSessionKey: params.requesterSessionKey,
        agentChannel: params.requesterChannel,
    });
    const timeoutSeconds = typeof params.timeoutSeconds === "number" && Number.isFinite(params.timeoutSeconds)
        ? Math.max(0, Math.round(params.timeoutSeconds))
        : 10;
    let sendResult;
    try {
        sendResult = await sessionsSend.execute(`savc-send-${Date.now()}`, {
            sessionKey: params.targetSessionKey,
            message: params.message,
            timeoutSeconds,
        });
    }
    catch (error) {
        return {
            ok: false,
            code: "SEND_FAILED",
            status: "error",
            runId: null,
            error: error instanceof Error ? error.message : String(error),
            reply: null,
        };
    }
    const payload = readPayloadFromSpawnResult(sendResult) ?? {};
    const status = readString(payload.status) || "error";
    const runId = readString(payload.runId) || null;
    const reply = readTextValue(payload.reply) || null;
    const errorText = readString(payload.error) || null;
    if (status === "ok" || status === "accepted" || status === "timeout") {
        return {
            ok: true,
            status,
            runId,
            reply,
            error: errorText,
        };
    }
    return {
        ok: false,
        code: status === "forbidden" ? "SEND_FORBIDDEN" : "SEND_FAILED",
        status,
        runId,
        error: errorText || "sessions_send returned an error status",
        reply,
    };
}
export async function waitForRealAgentRun(runId, timeoutMs, options = {}) {
    const callGateway = await loadCallGateway();
    const payload = await callGateway({
        method: "agent.wait",
        params: {
            runId,
            timeoutMs: Math.max(0, Math.round(timeoutMs)),
        },
        timeoutMs: Math.max(2_000, Math.round(timeoutMs) + 2_000),
    });
    const startedAt = typeof payload.startedAt === "number" ? payload.startedAt : null;
    const endedAt = typeof payload.endedAt === "number" ? payload.endedAt : null;
    const mappedStatus = mapWaitStatus(readString(payload.status) || "running", options);
    return {
        runId,
        status: mappedStatus,
        error: readString(payload.error) || null,
        startedAt,
        endedAt,
        durationMs: toDurationMs(startedAt, endedAt),
    };
}
export async function readLatestAssistantReply(sessionKey, options = {}) {
    const callGateway = await loadCallGateway();
    const limit = Number.isFinite(options.limit)
        ? Math.max(1, Math.round(options.limit))
        : 50;
    const payload = await callGateway({
        method: "chat.history",
        params: {
            sessionKey,
            limit,
        },
        timeoutMs: 10_000,
    });
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    return extractAssistantText(messages);
}
