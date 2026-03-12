import type { Live2DSignal } from "./live2d-bridge.js";

type RuntimeMode = "manifest" | "fallback";

export interface Live2DRuntimeStatus {
  ready: boolean;
  mode: RuntimeMode;
  modelName: string;
  source: string;
  emotion: string;
  motion: string;
  updatedAt: string;
}

interface RuntimeOptions {
  onStatus?: (status: Live2DRuntimeStatus) => void;
}

interface ModelManifest {
  name?: string;
  palette?: {
    accent?: string;
    skin?: string;
    hair?: string;
  };
}

interface ExpressionState {
  eyeSmile: number;
  mouthSmile: number;
  browTilt: number;
  bodyAngle: number;
}

const DEFAULT_MANIFEST_URL = "/live2d/yuanyuan-lite.model.json";

function readEnv(name: keyof ImportMetaEnv): string {
  const raw = import.meta.env[name];
  return typeof raw === "string" ? raw.trim() : "";
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function nowIso(): string {
  return new Date().toISOString();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

async function loadManifest(url: string): Promise<ModelManifest | null> {
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) return null;
  const payload = (await response.json()) as unknown;
  const root = asRecord(payload);
  if (!root) return null;
  const palette = asRecord(root.palette);
  return {
    name: asString(root.name) || undefined,
    palette: palette
      ? {
          accent: asString(palette.accent) || undefined,
          skin: asString(palette.skin) || undefined,
          hair: asString(palette.hair) || undefined,
        }
      : undefined,
  };
}

export class Live2DRuntime {
  private readonly _canvas: HTMLCanvasElement;
  private readonly _ctx: CanvasRenderingContext2D;
  private readonly _onStatus?: (status: Live2DRuntimeStatus) => void;

  private _destroyed = false;
  private _ready = false;
  private _mode: RuntimeMode = "fallback";
  private _modelName = "yuanyuan-lite-fallback";
  private _statusSource = "idle";
  private _statusEmotion = "neutral";
  private _statusMotion = "idle";
  private _updatedAt = nowIso();

  private _palette = {
    accent: "#14b8a6",
    skin: "#f8d7c8",
    hair: "#1f2a44",
  };

  private _raf = 0;
  private _lastTick = performance.now();
  private _idlePhase = 0;
  private _pulse = 0;

  private _target: ExpressionState = {
    eyeSmile: 0.45,
    mouthSmile: 0.5,
    browTilt: 0,
    bodyAngle: 0,
  };
  private _current: ExpressionState = { ...this._target };

  private _lipFrames: number[] = [];
  private _lipFrameDuration = 75;
  private _lipStartedAt = 0;

  constructor(canvas: HTMLCanvasElement, options: RuntimeOptions = {}) {
    this._canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2d context unavailable for Live2D runtime");
    }
    this._ctx = ctx;
    this._onStatus = options.onStatus;
    this._bootstrap();
  }

  isDestroyed(): boolean {
    return this._destroyed;
  }

  getStatus(): Live2DRuntimeStatus {
    return {
      ready: this._ready,
      mode: this._mode,
      modelName: this._modelName,
      source: this._statusSource,
      emotion: this._statusEmotion,
      motion: this._statusMotion,
      updatedAt: this._updatedAt,
    };
  }

  applySignal(signal: Live2DSignal) {
    if (this._destroyed) return;
    const expression = signal.expression || ({} as ExpressionState);
    this._target = {
      eyeSmile: clamp(asNumber(expression.eyeSmile, this._target.eyeSmile), 0, 1),
      mouthSmile: clamp(asNumber(expression.mouthSmile, this._target.mouthSmile), 0, 1),
      browTilt: clamp(asNumber(expression.browTilt, this._target.browTilt), -1, 1),
      bodyAngle: clamp(asNumber(expression.bodyAngle, this._target.bodyAngle), -12, 12),
    };
    this._statusSource = asString(signal.source) || "interaction";
    this._statusEmotion = asString(signal.emotion) || "neutral";
    this._statusMotion = asString(signal.motion) || "idle";
    this._updatedAt = nowIso();
    this._pulse = 1;

    if (Array.isArray(signal.lipSync) && signal.lipSync.length > 0) {
      this._lipFrames = signal.lipSync
        .map((value) => clamp(asNumber(value, 0), 0, 1))
        .filter((value) => Number.isFinite(value));
      this._lipStartedAt = performance.now();
    } else {
      this._lipFrames = [];
      this._lipStartedAt = 0;
    }
    this._emitStatus();
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = 0;
    }
  }

  private _bootstrap() {
    void this._loadModel().finally(() => {
      this._ready = true;
      this._emitStatus();
      this._syncCanvasSize();
      this._raf = requestAnimationFrame((ts) => this._tick(ts));
    });
  }

  private async _loadModel() {
    const manifestUrl = readEnv("VITE_SAVC_LIVE2D_MODEL_URL") || DEFAULT_MANIFEST_URL;
    try {
      const manifest = await loadManifest(manifestUrl);
      if (manifest) {
        this._mode = "manifest";
        this._modelName = manifest.name || "yuanyuan-lite";
        if (manifest.palette?.accent) this._palette.accent = manifest.palette.accent;
        if (manifest.palette?.skin) this._palette.skin = manifest.palette.skin;
        if (manifest.palette?.hair) this._palette.hair = manifest.palette.hair;
      } else {
        this._mode = "fallback";
      }
    } catch {
      this._mode = "fallback";
    }
    this._updatedAt = nowIso();
    this._emitStatus();
  }

  private _emitStatus() {
    if (typeof this._onStatus === "function") {
      this._onStatus(this.getStatus());
    }
  }

  private _tick(timestamp: number) {
    if (this._destroyed) return;
    if (!this._canvas.isConnected) {
      this.destroy();
      return;
    }
    const dt = Math.max(0.001, (timestamp - this._lastTick) / 1000);
    this._lastTick = timestamp;
    this._idlePhase += dt * 1.5;
    this._pulse = Math.max(0, this._pulse - dt * 0.9);

    const smoothing = Math.min(1, dt * 7.5);
    this._current.eyeSmile += (this._target.eyeSmile - this._current.eyeSmile) * smoothing;
    this._current.mouthSmile += (this._target.mouthSmile - this._current.mouthSmile) * smoothing;
    this._current.browTilt += (this._target.browTilt - this._current.browTilt) * smoothing;
    this._current.bodyAngle += (this._target.bodyAngle - this._current.bodyAngle) * smoothing;

    this._syncCanvasSize();
    this._draw(timestamp);
    this._raf = requestAnimationFrame((ts) => this._tick(ts));
  }

  private _syncCanvasSize() {
    const rect = this._canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const targetWidth = Math.max(1, Math.floor(rect.width * dpr));
    const targetHeight = Math.max(1, Math.floor(rect.height * dpr));
    if (this._canvas.width !== targetWidth || this._canvas.height !== targetHeight) {
      this._canvas.width = targetWidth;
      this._canvas.height = targetHeight;
    }
    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private _resolveMouthOpen(now: number): number {
    if (!this._lipFrames.length || !this._lipStartedAt) {
      return 0.08 + Math.sin(this._idlePhase * 0.8) * 0.03;
    }
    const elapsed = now - this._lipStartedAt;
    const index = Math.floor(elapsed / this._lipFrameDuration);
    if (index >= this._lipFrames.length) {
      this._lipFrames = [];
      this._lipStartedAt = 0;
      return 0.05;
    }
    return clamp(this._lipFrames[index], 0, 1) * 0.35;
  }

  private _draw(now: number) {
    const ctx = this._ctx;
    const width = this._canvas.clientWidth || 640;
    const height = this._canvas.clientHeight || 280;
    const centerX = width / 2;
    const centerY = height * 0.55;

    const breathe = Math.sin(this._idlePhase) * 3;
    const angle = (this._current.bodyAngle / 180) * Math.PI;
    const mouthOpen = this._resolveMouthOpen(now);

    ctx.clearRect(0, 0, width, height);

    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, "rgba(20,184,166,0.08)");
    bg.addColorStop(1, "rgba(20,184,166,0.02)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(centerX, centerY + breathe);

    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(0, 86, 76, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this._palette.hair;
    ctx.beginPath();
    ctx.ellipse(0, 52, 48, 44, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this._palette.skin;
    ctx.beginPath();
    ctx.ellipse(0, 48, 39, 42, angle * 0.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.arc(14, 30, 10 + this._pulse * 5, 0, Math.PI * 2);
    ctx.fill();

    const eyeY = 44;
    const eyeOffset = 14;
    const eyeSmile = this._current.eyeSmile;
    const eyeCurve = 2 + eyeSmile * 5;
    const eyeOpen = Math.max(1.4, 6 - eyeSmile * 4.5);
    ctx.strokeStyle = "#1b2030";
    ctx.lineWidth = 2.4;

    ctx.beginPath();
    ctx.ellipse(-eyeOffset, eyeY, 5.2, eyeOpen, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(eyeOffset, eyeY, 5.2, eyeOpen, 0, 0, Math.PI * 2);
    ctx.stroke();

    const browTilt = this._current.browTilt * 5;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-22, eyeY - 10 - browTilt);
    ctx.lineTo(-8, eyeY - 11 + browTilt);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(8, eyeY - 11 - browTilt);
    ctx.lineTo(22, eyeY - 10 + browTilt);
    ctx.stroke();

    const mouthSmile = this._current.mouthSmile;
    const mouthWidth = 18 + mouthSmile * 10;
    const mouthY = 63;
    const mouthCurve = (mouthSmile - 0.45) * 20;
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(-mouthWidth, mouthY);
    ctx.quadraticCurveTo(0, mouthY + mouthCurve + mouthOpen * 12, mouthWidth, mouthY);
    ctx.stroke();

    if (mouthOpen > 0.07) {
      ctx.fillStyle = "rgba(220, 64, 90, 0.38)";
      ctx.beginPath();
      ctx.ellipse(0, mouthY + 5, mouthWidth * 0.55, mouthOpen * 22, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = this._palette.accent;
    ctx.beginPath();
    ctx.moveTo(-36, 86);
    ctx.quadraticCurveTo(0, 66, 36, 86);
    ctx.quadraticCurveTo(0, 120, -36, 86);
    ctx.fill();

    ctx.restore();

    ctx.fillStyle = "rgba(228,228,231,0.9)";
    ctx.font = "12px var(--mono)";
    ctx.textAlign = "left";
    ctx.fillText(`model=${this._modelName} mode=${this._mode}`, 12, 20);
    ctx.fillText(`emotion=${this._statusEmotion} motion=${this._statusMotion}`, 12, 38);
    ctx.fillText(`source=${this._statusSource}`, 12, 56);
    ctx.fillText(`idleCurve=${eyeCurve.toFixed(2)}`, 12, 74);
  }
}
