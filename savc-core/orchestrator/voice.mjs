#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function normalizeText(value) {
  return String(value || '').trim();
}

function includesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

export function inferVoiceAction(message, options = {}) {
  const text = normalizeText(message);
  if (!text) {
    return options.defaultAction || 'initiate';
  }

  if (includesAny(text, [/(结束通话|挂断|挂了|结束电话|end call|hang up)/i])) {
    return 'end';
  }
  if (includesAny(text, [/(查看状态|通话状态|现在什么状态|status)/i])) {
    return 'status';
  }
  if (includesAny(text, [/(继续通话|继续聊|继续说|continue)/i])) {
    return 'continue';
  }
  if (includesAny(text, [/(读给我听|念出来|播报|speak|tts)/i])) {
    return 'speak';
  }
  return options.defaultAction || 'initiate';
}

export function inferVoiceEmotion(message) {
  const text = normalizeText(message);
  if (!text) return 'neutral';

  if (includesAny(text, [/(安慰|难受|焦虑|害怕|紧张|抱抱)/i])) {
    return 'empathetic';
  }
  if (includesAny(text, [/(开心|庆祝|兴奋|太好了|高兴)/i])) {
    return 'cheerful';
  }
  if (includesAny(text, [/(严肃|正式|专业|开会|汇报)/i])) {
    return 'serious';
  }
  if (includesAny(text, [/(生气|愤怒|烦|急)/i])) {
    return 'calm';
  }
  return 'neutral';
}

export function mapEmotionToVoiceStyle(emotion) {
  switch (String(emotion || '').trim()) {
    case 'empathetic':
      return {
        ttsStyle: 'soft',
        pacing: 'slow',
        emphasis: 'warm',
      };
    case 'cheerful':
      return {
        ttsStyle: 'bright',
        pacing: 'medium-fast',
        emphasis: 'energetic',
      };
    case 'serious':
      return {
        ttsStyle: 'professional',
        pacing: 'medium',
        emphasis: 'clear',
      };
    case 'calm':
      return {
        ttsStyle: 'stable',
        pacing: 'slow',
        emphasis: 'grounding',
      };
    default:
      return {
        ttsStyle: 'neutral',
        pacing: 'medium',
        emphasis: 'balanced',
      };
  }
}

export function buildVoiceExecutionPlan(message, options = {}) {
  const text = normalizeText(message);
  const action = inferVoiceAction(text, { defaultAction: options.defaultAction || 'initiate' });
  const emotion = normalizeText(options.emotion) || inferVoiceEmotion(text);
  const style = mapEmotionToVoiceStyle(emotion);

  const reason = [];
  if (/语音|通话|电话|voice/i.test(text)) {
    reason.push('voice-signal');
  }
  if (/<media:audio>|音频|录音|说话/i.test(text)) {
    reason.push('audio-signal');
  }
  if (reason.length === 0) {
    reason.push('default-voice');
  }

  return {
    action,
    emotion,
    style,
    sourceText: text,
    reasoning: reason.join('+'),
  };
}

export function formatVoicePlan(plan) {
  return [
    '[voice]',
    `action=${plan.action}`,
    `emotion=${plan.emotion}`,
    `ttsStyle=${plan.style?.ttsStyle || 'neutral'}`,
    `pacing=${plan.style?.pacing || 'medium'}`,
    `reason=${plan.reasoning || 'n/a'}`,
  ].join(' ');
}

async function runCli() {
  const message = process.argv.slice(2).join(' ').trim();
  const plan = buildVoiceExecutionPlan(message);
  console.log(JSON.stringify(plan, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
