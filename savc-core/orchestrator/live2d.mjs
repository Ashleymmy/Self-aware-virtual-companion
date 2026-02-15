#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CANONICAL_EMOTIONS = new Set([
  'happy',
  'sad',
  'thinking',
  'excited',
  'comfort',
  'calm',
  'focused',
  'neutral',
]);

const EMOTION_ALIAS = new Map([
  ['cheerful', 'happy'],
  ['joy', 'happy'],
  ['empathetic', 'comfort'],
  ['warm', 'comfort'],
  ['serious', 'focused'],
  ['professional', 'focused'],
  ['angry', 'calm'],
]);

const EMOTION_PRESETS = {
  happy: {
    motion: 'idle_happy',
    transitionMs: 420,
    params: {
      eyeSmile: 0.82,
      mouthSmile: 0.9,
      browDown: 0,
      headTilt: 2,
      bodyAngle: 2,
    },
  },
  sad: {
    motion: 'idle_sad',
    transitionMs: 620,
    params: {
      eyeSmile: 0.05,
      mouthSmile: 0.12,
      browDown: 0.44,
      headTilt: -3,
      bodyAngle: -3,
    },
  },
  thinking: {
    motion: 'idle_thinking',
    transitionMs: 520,
    params: {
      eyeSmile: 0.28,
      mouthSmile: 0.35,
      browDown: 0.2,
      headTilt: 8,
      bodyAngle: 0,
    },
  },
  excited: {
    motion: 'bounce_light',
    transitionMs: 300,
    params: {
      eyeSmile: 1,
      mouthSmile: 1,
      browDown: 0,
      headTilt: 1,
      bodyAngle: 4,
    },
  },
  comfort: {
    motion: 'nod_soft',
    transitionMs: 520,
    params: {
      eyeSmile: 0.62,
      mouthSmile: 0.7,
      browDown: 0.08,
      headTilt: 3,
      bodyAngle: 1,
    },
  },
  calm: {
    motion: 'breath_deep',
    transitionMs: 560,
    params: {
      eyeSmile: 0.38,
      mouthSmile: 0.46,
      browDown: 0.06,
      headTilt: 0,
      bodyAngle: 0,
    },
  },
  focused: {
    motion: 'focus_forward',
    transitionMs: 420,
    params: {
      eyeSmile: 0.22,
      mouthSmile: 0.3,
      browDown: 0.3,
      headTilt: 0,
      bodyAngle: 0,
    },
  },
  neutral: {
    motion: 'idle_neutral',
    transitionMs: 500,
    params: {
      eyeSmile: 0.4,
      mouthSmile: 0.5,
      browDown: 0.1,
      headTilt: 0,
      bodyAngle: 0,
    },
  },
};

const INTERACTION_PRESETS = {
  tap: {
    motion: 'wave_small',
    emotion: 'happy',
    durationMs: 800,
  },
  double_tap: {
    motion: 'wave_big',
    emotion: 'excited',
    durationMs: 1200,
  },
  drag: {
    motion: 'follow_hand',
    emotion: 'focused',
    durationMs: 1000,
  },
  hover: {
    motion: 'look_at',
    emotion: 'comfort',
    durationMs: 700,
  },
  long_press: {
    motion: 'shy_nod',
    emotion: 'comfort',
    durationMs: 1400,
  },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toRoundedNumber(value, digits = 3) {
  return Number.parseFloat(Number(value).toFixed(digits));
}

function toNumber(input, fallback) {
  const parsed =
    typeof input === 'number' ? input : typeof input === 'string' ? Number.parseFloat(input) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeEmotionTag(emotion) {
  const text = String(emotion || '')
    .trim()
    .toLowerCase();
  if (!text) return 'neutral';
  if (CANONICAL_EMOTIONS.has(text)) return text;
  if (EMOTION_ALIAS.has(text)) return EMOTION_ALIAS.get(text) || 'neutral';

  if (/(开心|高兴|愉快|兴奋)/i.test(text)) return 'happy';
  if (/(难过|低落|伤心)/i.test(text)) return 'sad';
  if (/(思考|想想|斟酌)/i.test(text)) return 'thinking';
  if (/(安慰|温柔|共情|抱抱)/i.test(text)) return 'comfort';
  if (/(冷静|平静|稳住)/i.test(text)) return 'calm';
  if (/(严肃|正式|专注|专业)/i.test(text)) return 'focused';
  return 'neutral';
}

export function mapEmotionToExpression(emotion, options = {}) {
  const normalized = normalizeEmotionTag(emotion);
  const intensity = clamp(toNumber(options.intensity, 1), 0, 1.5);
  const preset = EMOTION_PRESETS[normalized] || EMOTION_PRESETS.neutral;
  const params = Object.fromEntries(
    Object.entries(preset.params).map(([key, value]) => [key, toRoundedNumber(clamp(value * intensity, -1, 1), 3)]),
  );

  return {
    emotion: normalized,
    motion: preset.motion,
    transitionMs: Math.round(preset.transitionMs),
    params,
  };
}

function classifyMouthOpen(char, energy) {
  if (/[\s]/.test(char)) return 0.12 * energy;
  if (/[,.!?;:，。！？；：]/.test(char)) return 0.08 * energy;
  if (/[aeiouAEIOU啊呀哦呜诶]/.test(char)) return 0.9 * energy;
  if (/[mbpMBP]/.test(char)) return 0.24 * energy;
  return 0.56 * energy;
}

export function buildLipSyncFrames(text, options = {}) {
  const source = String(text || '').trim();
  if (!source) return [];

  const frameStepMs = Math.max(30, Math.round(toNumber(options.frameStepMs, 80)));
  const maxFrames = Math.max(4, Math.round(toNumber(options.maxFrames, 24)));
  const energy = clamp(toNumber(options.energy, 0.88), 0.1, 1);

  const chars = [...source].slice(0, maxFrames);
  const frames = chars.map((char, index) => ({
    tMs: index * frameStepMs,
    mouthOpen: toRoundedNumber(clamp(classifyMouthOpen(char, energy), 0, 1), 3),
  }));

  const lastTime = frames.length * frameStepMs;
  frames.push({
    tMs: lastTime,
    mouthOpen: 0.06,
  });
  return frames;
}

export function buildInteractionReaction(interactionType, options = {}) {
  const type = String(interactionType || 'tap')
    .trim()
    .toLowerCase();
  const preset = INTERACTION_PRESETS[type] || {
    motion: 'ack_small',
    emotion: 'neutral',
    durationMs: 600,
  };

  const mapped = mapEmotionToExpression(preset.emotion, {
    intensity: toNumber(options.intensity, 1),
  });

  return {
    interactionType: type,
    motion: preset.motion,
    emotion: mapped.emotion,
    durationMs: Math.max(150, Math.round(toNumber(options.durationMs, preset.durationMs))),
    expression: mapped.params,
  };
}

export function buildLive2DSignal(input = {}) {
  const source = ['text', 'voice', 'interaction'].includes(String(input.source || '').trim())
    ? String(input.source).trim()
    : 'text';

  if (source === 'interaction') {
    const reaction = buildInteractionReaction(input.interactionType, {
      intensity: input.intensity,
      durationMs: input.durationMs,
    });
    return {
      version: 'phase6-v1',
      source,
      createdAt: Date.now(),
      emotion: reaction.emotion,
      motion: reaction.motion,
      transitionMs: reaction.durationMs,
      expression: reaction.expression,
      lipSync: [],
      interaction: {
        type: reaction.interactionType,
      },
    };
  }

  const mapped = mapEmotionToExpression(input.emotion, {
    intensity: input.intensity,
  });
  const message = String(input.message || '').trim();

  return {
    version: 'phase6-v1',
    source,
    createdAt: Date.now(),
    emotion: mapped.emotion,
    motion: mapped.motion,
    transitionMs: mapped.transitionMs,
    expression: mapped.params,
    lipSync: source === 'voice' ? buildLipSyncFrames(message, { energy: input.energy }) : [],
    interaction: null,
  };
}

export function formatLive2DSignal(signal) {
  const source = String(signal?.source || 'text');
  const emotion = String(signal?.emotion || 'neutral');
  const motion = String(signal?.motion || 'idle_neutral');
  const frames = Array.isArray(signal?.lipSync) ? signal.lipSync.length : 0;
  return `[live2d] source=${source} emotion=${emotion} motion=${motion} lipSyncFrames=${frames}`;
}

async function runCli() {
  const payload = process.argv.slice(2).join(' ').trim();
  const signal = buildLive2DSignal({
    source: 'voice',
    message: payload || '你好呀，我在这里。',
    emotion: 'comfort',
  });
  console.log(JSON.stringify(signal, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
