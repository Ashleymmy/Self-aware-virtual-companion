#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { discoverAgents, getAgent, matchByKeyword } from './registry.mjs';

const LEVEL_KEYWORD = 1;
const LEVEL_CLASSIFIER = 2;
const LEVEL_FALLBACK = 3;

const INTENT_RULES = [
  {
    intent: 'vibe_coding',
    agent: 'vibe-coder',
    regex: /(从零搭建|脚手架|自动修复|迭代修复|生成项目|vibe|scaffold|boilerplate|project skeleton|create .*project)/i,
  },
  {
    intent: 'vision_analysis',
    agent: 'vision',
    regex: /(截图|图片|图像|照片|设计稿|图表|ui|界面|logo|<media:image>|screenshot|image)/i,
  },
  {
    intent: 'live2d_interaction',
    agent: 'live2d',
    regex: /(live2d|虚拟形象|表情联动|口型同步|动作触发|点击模型|avatar animation|lip sync)/i,
  },
  {
    intent: 'voice_conversation',
    agent: 'voice',
    regex: /(语音|通话|打电话|电话|voice call|voice|tts|stt)/i,
  },
  {
    intent: 'technical_explanation',
    agent: 'technical',
    regex: /(sql|查询|优化|慢|索引|数据库|bug|报错|代码|debug|排障|架构|实现)/i,
  },
  {
    intent: 'memory_recall',
    agent: 'memory',
    regex: /(记住|记得|之前说过|回忆|偏好|历史)/i,
  },
  {
    intent: 'creative_writing',
    agent: 'creative',
    regex: /(故事|写作|文案|脑暴|命名|诗|创意)/i,
  },
  {
    intent: 'tool_call',
    agent: 'tooling',
    regex: /(天气|日历|查一下|调用|api|接口)/i,
  },
  {
    intent: 'emotional_support',
    agent: 'companion',
    regex: /(抱抱|心情|难受|累|陪我|安慰|无聊)/i,
  },
];

function parseArgs(argv) {
  const args = { _: [] };
  let index = 0;
  while (index < argv.length) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      args._.push(token);
      index += 1;
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
      index += 1;
      continue;
    }
    args[key] = next;
    index += 2;
  }
  return args;
}

function summarizeMessage(message) {
  const cleaned = String(message || '').replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 40) return cleaned;
  return `${cleaned.slice(0, 40)}...`;
}

export function classifyIntent(message, options = {}) {
  const text = String(message || '').trim();
  if (!text) {
    return {
      intent: 'unknown',
      agent: 'orchestrator',
      confidence: 0,
      reasoning: 'empty-message',
    };
  }

  if (typeof options.classifier === 'function') {
    return options.classifier(text);
  }

  for (const rule of INTENT_RULES) {
    if (rule.regex.test(text)) {
      return {
        intent: rule.intent,
        agent: rule.agent,
        confidence: 0.82,
        reasoning: `heuristic:${rule.intent}`,
      };
    }
  }

  return {
    intent: 'unknown',
    agent: 'orchestrator',
    confidence: 0.35,
    reasoning: 'heuristic:unknown',
  };
}

export async function routeMessage(message, options = {}) {
  const start = Date.now();
  const agentsDir = options.agentsDir || 'savc-core/agents';
  await discoverAgents(agentsDir);

  const keywordMatch = matchByKeyword(message);
  if (keywordMatch) {
    return {
      agent: keywordMatch.name,
      level: LEVEL_KEYWORD,
      confidence: 1,
      reason: 'keyword-match',
      latencyMs: Date.now() - start,
      messageSummary: summarizeMessage(message),
    };
  }

  const classified = classifyIntent(message, options);
  const confidenceThreshold = Number.parseFloat(String(options.confidenceThreshold || 0.6));

  if (classified.agent && classified.agent !== 'orchestrator' && classified.confidence >= confidenceThreshold) {
    const mappedAgent = getAgent(classified.agent);
    if (mappedAgent) {
      return {
        agent: mappedAgent.name,
        level: LEVEL_CLASSIFIER,
        confidence: classified.confidence,
        reason: classified.reasoning,
        latencyMs: Date.now() - start,
        messageSummary: summarizeMessage(message),
      };
    }
  }

  return {
    agent: 'orchestrator',
    level: LEVEL_FALLBACK,
    confidence: classified.confidence,
    reason: classified.reasoning,
    latencyMs: Date.now() - start,
    messageSummary: summarizeMessage(message),
  };
}

async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  if (!command || command !== 'route') {
    throw new Error('usage: router.mjs route --message "..." [--agents-dir path]');
  }

  const message = args.message || args._[1] || '';
  const decision = await routeMessage(message, {
    agentsDir: args['agents-dir'] || 'savc-core/agents',
  });

  console.log(JSON.stringify(decision, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
