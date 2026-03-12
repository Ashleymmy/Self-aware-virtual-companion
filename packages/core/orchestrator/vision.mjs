#!/usr/bin/env node
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function normalizeText(value) {
  return String(value || '').trim();
}

function includesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

const IMAGE_SIGNAL_PATTERNS = [
  /截图/i,
  /图片|图像|照片/i,
  /设计稿|界面|ui/i,
  /图表|曲线|柱状图|折线图/i,
  /<media:image>/i,
  /image|screenshot/i,
];

const TECH_SIGNAL_PATTERNS = [
  /报错|错误|异常|崩溃|bug|traceback|stack/i,
  /代码|编译|调试|排障|debug/i,
];

const GENERATE_SIGNAL_PATTERNS = [
  /生成图片|画一个|做一个logo|设计logo|图生图/i,
  /\b(draw|generate image|create image|logo)\b/i,
];

const UI_REVIEW_PATTERNS = [
  /ui 审查|界面审查|设计建议|布局|配色|可用性/i,
  /\b(ui review|ux review|design review)\b/i,
];

export function hasImageSignal(message) {
  const text = normalizeText(message);
  return includesAny(text, IMAGE_SIGNAL_PATTERNS);
}

export function hasTechnicalSignal(message) {
  const text = normalizeText(message);
  return includesAny(text, TECH_SIGNAL_PATTERNS);
}

export function classifyVisionTask(message, options = {}) {
  const text = normalizeText(message);
  const forcedType = normalizeText(options.type);
  if (forcedType) {
    return forcedType;
  }

  if (includesAny(text, GENERATE_SIGNAL_PATTERNS)) {
    return 'image_generation';
  }
  if (includesAny(text, UI_REVIEW_PATTERNS)) {
    return 'ui_review';
  }
  if (hasImageSignal(text) && hasTechnicalSignal(text)) {
    return 'screenshot_debug';
  }
  if (hasImageSignal(text)) {
    return 'image_analysis';
  }
  return 'image_analysis';
}

export function analyzeVisionTask(message, options = {}) {
  const text = normalizeText(message);
  const type = classifyVisionTask(text, options);
  const collaborators = [];
  if (type === 'screenshot_debug') {
    collaborators.push('technical');
  }
  return {
    type,
    requiresImage: type !== 'image_generation',
    collaborators,
    sourceText: text,
  };
}

function buildMockImageData(prompt, size) {
  const seed = crypto.createHash('sha1').update(`${prompt}:${size}`).digest('hex').slice(0, 12);
  return {
    id: `mock-image-${seed}`,
    url: `mock://image/${seed}.png`,
  };
}

function normalizeImageSize(size) {
  const normalized = normalizeText(size);
  if (!normalized) return '1024x1024';
  return normalized;
}

function normalizeImageQuality(quality) {
  const normalized = normalizeText(quality).toLowerCase();
  if (!normalized) return 'standard';
  return normalized;
}

export async function generateImage(options = {}) {
  const prompt = normalizeText(options.prompt);
  if (!prompt) {
    const error = new Error('prompt is required');
    error.code = 'INVALID_PARAMS';
    throw error;
  }

  const mode = normalizeText(options.mode) || 'mock';
  const size = normalizeImageSize(options.size);
  const quality = normalizeImageQuality(options.quality);

  if (mode !== 'real') {
    const mock = buildMockImageData(prompt, size);
    return {
      mode: 'mock',
      provider: 'mock',
      model: 'mock-image-v1',
      prompt,
      size,
      quality,
      image: mock,
      createdAt: Date.now(),
    };
  }

  const apiKey = normalizeText(options.apiKey) || normalizeText(process.env.OPENAI_API_KEY);
  if (!apiKey) {
    const error = new Error('OPENAI_API_KEY is required for real image generation');
    error.code = 'MISSING_OPENAI_KEY';
    throw error;
  }

  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey });

  const response = await client.images.generate({
    model: 'gpt-image-1',
    prompt,
    size,
    quality,
  });

  const first = Array.isArray(response?.data) ? response.data[0] : null;
  const imageUrl = first?.url ? String(first.url) : null;
  const imageBase64 = first?.b64_json ? String(first.b64_json) : null;

  if (!imageUrl && !imageBase64) {
    const error = new Error('OpenAI image generation returned empty payload');
    error.code = 'IMAGE_GENERATE_FAILED';
    throw error;
  }

  return {
    mode: 'real',
    provider: 'openai',
    model: 'gpt-image-1',
    prompt,
    size,
    quality,
    image: {
      id: `real-image-${crypto.randomUUID()}`,
      url: imageUrl,
      b64_json: imageBase64,
    },
    createdAt: Date.now(),
  };
}

export function formatVisionReport(analysis) {
  const collaborators = Array.isArray(analysis.collaborators)
    ? analysis.collaborators.join(',')
    : '';
  return [
    '[vision]',
    `type=${analysis.type || 'image_analysis'}`,
    `requiresImage=${analysis.requiresImage ? 'yes' : 'no'}`,
    `collaborators=${collaborators || 'none'}`,
  ].join(' ');
}

async function runCli() {
  const args = process.argv.slice(2);
  const command = args[0] || 'analyze';
  const payload = args.slice(1).join(' ').trim();
  if (command === 'generate') {
    const generated = await generateImage({
      prompt: payload || 'A minimalist logo for SAVC',
      mode: 'mock',
    });
    console.log(JSON.stringify(generated, null, 2));
    return;
  }
  const analysis = analyzeVisionTask(payload);
  console.log(JSON.stringify(analysis, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
