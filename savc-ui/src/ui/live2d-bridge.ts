export type Live2DInteractionType = "tap" | "double_tap" | "long_press" | "drag" | "hover";

type Live2DSource = "text" | "voice" | "interaction";
type Live2DBridgeMode = "auto" | "gateway" | "mock";
type BridgeBackend = "gateway" | "mock";

export interface Live2DSignal {
  version: string;
  source: Live2DSource;
  emotion: string;
  motion: string;
  expression: {
    eyeSmile: number;
    mouthSmile: number;
    browTilt: number;
    bodyAngle: number;
  };
  lipSync: number[];
  interaction: {
    type: string;
    intensity: number;
    durationMs: number;
  } | null;
  meta: Record<string, unknown>;
}

export interface InvokeLive2DInteractionParams {
  interactionType: Live2DInteractionType;
  intensity?: number;
  emotion?: string;
}

export interface InvokeLive2DInteractionResult {
  ok: boolean;
  backend: BridgeBackend;
  signal: Live2DSignal;
  error?: string;
}

const DEFAULT_GATEWAY_URL = "http://127.0.0.1:18789";
const DEFAULT_SESSION_KEY = "main";

const INTERACTION_PRESET: Record<
  Live2DInteractionType,
  { motion: string; emotion: string; durationMs: number; intensity: number }
> = {
  tap: { motion: "nod_gentle", emotion: "happy", durationMs: 900, intensity: 1.0 },
  double_tap: { motion: "wave_big", emotion: "excited", durationMs: 1200, intensity: 1.2 },
  long_press: { motion: "tilt_curious", emotion: "thinking", durationMs: 1500, intensity: 1.1 },
  drag: { motion: "follow_drag", emotion: "focused", durationMs: 1400, intensity: 1.15 },
  hover: { motion: "wave_small", emotion: "comfort", durationMs: 1100, intensity: 0.85 },
};

const EXPRESSION_PRESET: Record<
  string,
  { eyeSmile: number; mouthSmile: number; browTilt: number; bodyAngle: number }
> = {
  happy: { eyeSmile: 0.82, mouthSmile: 0.86, browTilt: 0.08, bodyAngle: 2 },
  excited: { eyeSmile: 0.98, mouthSmile: 0.96, browTilt: 0.22, bodyAngle: 4 },
  thinking: { eyeSmile: 0.35, mouthSmile: 0.42, browTilt: -0.2, bodyAngle: -1 },
  focused: { eyeSmile: 0.48, mouthSmile: 0.5, browTilt: -0.12, bodyAngle: 1 },
  comfort: { eyeSmile: 0.65, mouthSmile: 0.72, browTilt: 0.02, bodyAngle: 0.5 },
  neutral: { eyeSmile: 0.45, mouthSmile: 0.5, browTilt: 0, bodyAngle: 0 },
};

function readEnv(name: keyof ImportMetaEnv): string {
  const raw = import.meta.env[name];
  return typeof raw === "string" ? raw.trim() : "";
}

function normalizeMode(value: string): Live2DBridgeMode {
  const lower = value.toLowerCase();
  if (lower === "mock" || lower === "gateway") return lower;
  return "auto";
}

function normalizeGatewayUrl(value: string): string {
  const base = value || DEFAULT_GATEWAY_URL;
  return base.replace(/\/+$/, "");
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function buildMockSignal(params: InvokeLive2DInteractionParams): Live2DSignal {
  const preset = INTERACTION_PRESET[params.interactionType];
  const baseEmotion = params.emotion?.trim().toLowerCase() || preset.emotion;
  const expression = EXPRESSION_PRESET[baseEmotion] || EXPRESSION_PRESET.neutral;
  const intensity = clamp(params.intensity ?? preset.intensity, 0.6, 2.0);
  return {
    version: "phase6-v1",
    source: "interaction",
    emotion: baseEmotion,
    motion: preset.motion,
    expression: {
      eyeSmile: clamp(expression.eyeSmile * intensity, 0, 1),
      mouthSmile: clamp(expression.mouthSmile * intensity, 0, 1),
      browTilt: clamp(expression.browTilt * intensity, -1, 1),
      bodyAngle: clamp(expression.bodyAngle * intensity, -12, 12),
    },
    lipSync: [],
    interaction: {
      type: params.interactionType,
      intensity,
      durationMs: preset.durationMs,
    },
    meta: {
      backend: "savc-ui-mock",
      generatedAt: new Date().toISOString(),
    },
  };
}

function parseSignalFromGateway(payload: unknown): Live2DSignal | null {
  const root = asRecord(payload);
  const result = asRecord(root?.result);
  const details = asRecord(result?.details);
  const data = asRecord(details?.data);
  const signal = asRecord(data?.signal);
  if (!signal) return null;

  const sourceRaw = String(signal.source || "interaction").toLowerCase();
  const source: Live2DSource =
    sourceRaw === "voice" || sourceRaw === "text" || sourceRaw === "interaction"
      ? sourceRaw
      : "interaction";

  const expressionRaw = asRecord(signal.expression);
  const interactionRaw = asRecord(signal.interaction);
  const metaRaw = asRecord(signal.meta);
  const lipSyncRaw = Array.isArray(signal.lipSync) ? signal.lipSync : [];

  return {
    version: String(signal.version || "phase6-v1"),
    source,
    emotion: String(signal.emotion || "neutral"),
    motion: String(signal.motion || "idle"),
    expression: {
      eyeSmile: asNumber(expressionRaw?.eyeSmile, 0.45),
      mouthSmile: asNumber(expressionRaw?.mouthSmile, 0.5),
      browTilt: asNumber(expressionRaw?.browTilt, 0),
      bodyAngle: asNumber(expressionRaw?.bodyAngle, 0),
    },
    lipSync: lipSyncRaw
      .map((frame) => asNumber(frame, Number.NaN))
      .filter((frame) => Number.isFinite(frame)),
    interaction: interactionRaw
      ? {
          type: String(interactionRaw.type || "tap"),
          intensity: asNumber(interactionRaw.intensity, 1),
          durationMs: asNumber(interactionRaw.durationMs, 1000),
        }
      : null,
    meta: metaRaw || {},
  };
}

async function invokeGateway(params: InvokeLive2DInteractionParams): Promise<Live2DSignal> {
  const gatewayBaseUrl = normalizeGatewayUrl(readEnv("VITE_SAVC_GATEWAY_URL"));
  const token = readEnv("VITE_SAVC_GATEWAY_TOKEN");
  const sessionKey = readEnv("VITE_SAVC_SESSION_KEY") || DEFAULT_SESSION_KEY;
  const response = await fetch(`${gatewayBaseUrl}/tools/invoke`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      tool: "savc_live2d_signal",
      sessionKey,
      args: {
        source: "interaction",
        interactionType: params.interactionType,
        intensity: params.intensity,
        ...(params.emotion ? { emotion: params.emotion } : {}),
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`gateway http ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  const signal = parseSignalFromGateway(payload);
  if (!signal) {
    throw new Error("gateway payload missing live2d signal");
  }
  return signal;
}

export async function invokeLive2DInteraction(
  params: InvokeLive2DInteractionParams,
): Promise<InvokeLive2DInteractionResult> {
  const mode = normalizeMode(readEnv("VITE_SAVC_UI_LIVE2D_MODE"));
  if (mode === "mock") {
    return {
      ok: true,
      backend: "mock",
      signal: buildMockSignal(params),
    };
  }

  try {
    const signal = await invokeGateway(params);
    return { ok: true, backend: "gateway", signal };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fallback = buildMockSignal(params);
    if (mode === "gateway") {
      return { ok: false, backend: "gateway", signal: fallback, error: message };
    }
    return { ok: true, backend: "mock", signal: fallback, error: message };
  }
}
