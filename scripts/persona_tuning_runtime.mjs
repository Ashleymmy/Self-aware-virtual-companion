#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

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
    if (args[key] === undefined) {
      args[key] = next;
    } else if (Array.isArray(args[key])) {
      args[key].push(next);
    } else {
      args[key] = [args[key], next];
    }
    index += 2;
  }
  return args;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nowStamp() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 16);
  return `${date} ${time}`;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripQuotes(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function findSection(lines, key, indent = 0, rangeStart = 0, rangeEnd = lines.length) {
  const prefix = ' '.repeat(indent);
  const headerRe = new RegExp(`^${prefix}${escapeRegex(key)}:\\s*(#.*)?$`);
  const siblingRe = new RegExp(`^${prefix}[A-Za-z0-9_-]+:\\s*(#.*)?$`);
  for (let i = rangeStart; i < rangeEnd; i += 1) {
    if (!headerRe.test(lines[i])) continue;
    let end = rangeEnd;
    for (let j = i + 1; j < rangeEnd; j += 1) {
      if (siblingRe.test(lines[j])) {
        end = j;
        break;
      }
    }
    return { start: i, end };
  }
  return null;
}

function findMarkdownSection(lines, heading) {
  const header = `## ${heading}`;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim() !== header) continue;
    let end = lines.length;
    for (let j = i + 1; j < lines.length; j += 1) {
      if (lines[j].startsWith('## ')) {
        end = j;
        break;
      }
    }
    return { start: i, end };
  }
  return null;
}

function collectMap(lines, section, indent) {
  const prefix = ' '.repeat(indent);
  const entryRe = new RegExp(`^${prefix}([A-Za-z0-9_-]+):\\s*(.+?)\\s*$`);
  const items = [];
  for (let i = section.start + 1; i < section.end; i += 1) {
    const match = lines[i].match(entryRe);
    if (!match) continue;
    items.push({ key: match[1], value: stripQuotes(match[2]), lineIndex: i });
  }
  return items;
}

function getMapValue(lines, section, indent, key) {
  const prefix = ' '.repeat(indent);
  const entryRe = new RegExp(`^${prefix}${escapeRegex(key)}:\\s*(.+?)\\s*$`);
  for (let i = section.start + 1; i < section.end; i += 1) {
    const match = lines[i].match(entryRe);
    if (!match) continue;
    return { value: stripQuotes(match[1]), lineIndex: i };
  }
  return null;
}

function setMapValue(lines, section, indent, key, value) {
  const existing = getMapValue(lines, section, indent, key);
  const prefix = ' '.repeat(indent);
  const nextLine = `${prefix}${key}: ${value}`;
  if (existing) {
    if (existing.value === value) {
      return { changed: false, from: existing.value, to: value };
    }
    lines[existing.lineIndex] = nextLine;
    return { changed: true, from: existing.value, to: value };
  }
  const insertAt = section.start + 1;
  lines.splice(insertAt, 0, nextLine);
  return { changed: true, from: null, to: value };
}

function collectList(lines, section, indent) {
  const prefix = ' '.repeat(indent) + '- ';
  const items = [];
  let lastIndex = -1;
  for (let i = section.start + 1; i < section.end; i += 1) {
    const line = lines[i];
    if (!line.startsWith(prefix)) continue;
    items.push(stripQuotes(line.slice(prefix.length)));
    lastIndex = i;
  }
  return { items, lastIndex };
}

function addListItem(lines, section, indent, value) {
  const { items, lastIndex } = collectList(lines, section, indent);
  if (items.includes(value)) {
    return { changed: false };
  }
  const safeValue = value.replace(/"/g, '\\"');
  const line = `${' '.repeat(indent)}- "${safeValue}"`;
  const insertAt = lastIndex !== -1 ? lastIndex + 1 : section.start + 1;
  lines.splice(insertAt, 0, line);
  return { changed: true, from: null, to: value };
}

function parseDirectives(lines, section) {
  const directives = [];
  for (let i = section.start + 1; i < section.end; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed.startsWith('- ')) continue;
    if (trimmed.startsWith('- [')) continue;
    const match = trimmed.match(/^-\s*([A-Za-z0-9_.]+)\s*:\s*(.+)$/);
    if (!match) continue;
    directives.push({
      key: match[1],
      value: stripQuotes(match[2]),
      lineIndex: i,
      raw: trimmed,
    });
  }
  return directives;
}

function markDirectiveApplied(lines, directive) {
  lines[directive.lineIndex] = lines[directive.lineIndex].replace(/^\s*-\s*/, '- [applied] ');
}

function appendRecordSection(lines, records) {
  if (records.length === 0) return;
  const heading = '## 人格微调记录';
  const section = findMarkdownSection(lines, '人格微调记录');
  const recordLines = records.map((record) => `- ${record}`);
  if (section) {
    const insertAt = section.end;
    lines.splice(insertAt, 0, ...recordLines);
    return;
  }
  if (lines.length > 0 && lines[lines.length - 1].trim() !== '') {
    lines.push('');
  }
  lines.push(heading, '', ...recordLines, '');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (!command || !['preview', 'apply'].includes(command)) {
    throw new Error('usage: persona_tuning_runtime.mjs <preview|apply> [--workspace path] [--date YYYY-MM-DD] [--user-ok]');
  }

  if (command === 'apply' && !args['user-ok'] && !args.yes) {
    throw new Error('apply requires --user-ok (or --yes)');
  }

  const workspace = path.resolve(args.workspace || 'savc-core');
  const date = args.date || todayISO();
  const growthFile = path.join(workspace, 'memory', 'growth', `${date}.md`);

  if (!(await exists(growthFile))) {
    throw new Error(`growth log not found: ${growthFile}`);
  }

  const growthText = await fs.readFile(growthFile, 'utf8');
  const growthLines = growthText.split(/\r?\n/);
  const tuningSection = findMarkdownSection(growthLines, '人格微调');
  if (!tuningSection) {
    console.log('No persona tuning section found.');
    return;
  }

  const directives = parseDirectives(growthLines, tuningSection);
  if (directives.length === 0) {
    console.log('No persona tuning directives found.');
    return;
  }

  const voicePath = path.join(workspace, 'persona', 'voice.yaml');
  const valuesPath = path.join(workspace, 'persona', 'values.yaml');
  const voiceLines = (await fs.readFile(voicePath, 'utf8')).split(/\r?\n/);
  const valuesLines = (await fs.readFile(valuesPath, 'utf8')).split(/\r?\n/);

  const toneSection = findSection(voiceLines, 'tone', 0);
  const responseSection = findSection(voiceLines, 'response_length', 0);
  const verbalSection = findSection(voiceLines, 'verbal_tics', 0);
  const avoidSection = findSection(voiceLines, 'avoid', 0);
  if (!toneSection || !responseSection || !verbalSection) {
    throw new Error('voice.yaml missing required sections (tone/response_length/verbal_tics)');
  }

  const toneMap = collectMap(voiceLines, toneSection, 2);
  const toneValues = new Set(toneMap.map((entry) => entry.value));
  const responseKeys = new Set(['casual_chat', 'explanation', 'tutorial', 'emotional_support']);
  const allowedLengths = new Set(['short', 'medium', 'long']);
  const avoidList = avoidSection ? collectList(voiceLines, avoidSection, 2).items : [];
  const verbalList = collectList(voiceLines, verbalSection, 2).items;

  const topicsSection = findSection(valuesLines, 'topics', 0);
  if (!topicsSection) {
    throw new Error('values.yaml missing topics section');
  }
  const enthusiasticSection = findSection(valuesLines, 'enthusiastic', 2, topicsSection.start + 1, topicsSection.end);
  const neutralSection = findSection(valuesLines, 'neutral', 2, topicsSection.start + 1, topicsSection.end);
  const carefulSection = findSection(valuesLines, 'careful', 2, topicsSection.start + 1, topicsSection.end);
  if (!enthusiasticSection || !neutralSection || !carefulSection) {
    throw new Error('values.yaml topics missing enthusiastic/neutral/careful sections');
  }

  const enthusiasticTopics = collectList(valuesLines, enthusiasticSection, 4).items;
  const neutralTopics = collectList(valuesLines, neutralSection, 4).items;
  const carefulTopics = collectList(valuesLines, carefulSection, 4).items;
  const allTopics = new Set([...enthusiasticTopics, ...neutralTopics, ...carefulTopics]);

  const rateLimit = {
    response_length: false,
    tone: false,
    verbal_tics: false,
    topics: false,
  };

  const changes = [];
  const skipped = [];
  const appliedDirectives = [];

  let voiceChanged = false;
  let valuesChanged = false;

  for (const directive of directives) {
    const key = directive.key;
    const value = directive.value;

    if (key.startsWith('response_length.')) {
      if (rateLimit.response_length) {
        skipped.push(`${key}: already adjusted response_length today`);
        continue;
      }
      const segment = key.slice('response_length.'.length);
      if (!responseKeys.has(segment)) {
        skipped.push(`${key}: unsupported response_length segment`);
        continue;
      }
      if (!allowedLengths.has(value)) {
        skipped.push(`${key}: invalid length (use short|medium|long)`);
        continue;
      }
      const result = setMapValue(voiceLines, responseSection, 2, segment, value);
      if (!result.changed) {
        skipped.push(`${key}: already ${value}`);
        continue;
      }
      voiceChanged = true;
      rateLimit.response_length = true;
      changes.push({
        file: voicePath,
        key,
        from: result.from ?? '[unset]',
        to: value,
      });
      appliedDirectives.push(directive);
      continue;
    }

    if (key === 'tone.default') {
      if (rateLimit.tone) {
        skipped.push(`${key}: already adjusted tone today`);
        continue;
      }
      if (!toneValues.has(value)) {
        skipped.push(`${key}: value must be one of existing tone values`);
        continue;
      }
      const result = setMapValue(voiceLines, toneSection, 2, 'default', value);
      if (!result.changed) {
        skipped.push(`${key}: already ${value}`);
        continue;
      }
      voiceChanged = true;
      rateLimit.tone = true;
      changes.push({
        file: voicePath,
        key,
        from: result.from ?? '[unset]',
        to: value,
      });
      appliedDirectives.push(directive);
      continue;
    }

    if (key === 'verbal_tics.add') {
      if (rateLimit.verbal_tics) {
        skipped.push(`${key}: already added a verbal tic today`);
        continue;
      }
      if (!value) {
        skipped.push(`${key}: empty value`);
        continue;
      }
      if (avoidList.includes(value)) {
        skipped.push(`${key}: value in avoid list`);
        continue;
      }
      if (verbalList.includes(value)) {
        skipped.push(`${key}: already exists`);
        continue;
      }
      const result = addListItem(voiceLines, verbalSection, 2, value);
      if (!result.changed) {
        skipped.push(`${key}: no change`);
        continue;
      }
      voiceChanged = true;
      rateLimit.verbal_tics = true;
      changes.push({
        file: voicePath,
        key,
        from: '[none]',
        to: value,
      });
      appliedDirectives.push(directive);
      continue;
    }

    if (key.startsWith('topics.') && key.endsWith('.add')) {
      if (rateLimit.topics) {
        skipped.push(`${key}: already adjusted topics today`);
        continue;
      }
      const category = key.slice('topics.'.length, -'.add'.length);
      if (!['enthusiastic', 'neutral'].includes(category)) {
        skipped.push(`${key}: only enthusiastic/neutral allowed`);
        continue;
      }
      if (!value) {
        skipped.push(`${key}: empty value`);
        continue;
      }
      if (allTopics.has(value)) {
        skipped.push(`${key}: topic already listed`);
        continue;
      }
      const targetSection = category === 'enthusiastic' ? enthusiasticSection : neutralSection;
      const result = addListItem(valuesLines, targetSection, 4, value);
      if (!result.changed) {
        skipped.push(`${key}: no change`);
        continue;
      }
      valuesChanged = true;
      rateLimit.topics = true;
      changes.push({
        file: valuesPath,
        key,
        from: '[none]',
        to: value,
      });
      appliedDirectives.push(directive);
      continue;
    }

    skipped.push(`${key}: unsupported directive`);
  }

  if (changes.length === 0) {
    console.log('No applicable persona tuning changes.');
    if (skipped.length > 0) {
      skipped.forEach((line) => console.log(`- skipped ${line}`));
    }
    return;
  }

  if (command === 'apply') {
    if (voiceChanged) {
      await fs.writeFile(voicePath, voiceLines.join('\n'), 'utf8');
    }
    if (valuesChanged) {
      await fs.writeFile(valuesPath, valuesLines.join('\n'), 'utf8');
    }

    for (const directive of appliedDirectives) {
      markDirectiveApplied(growthLines, directive);
    }

    const recordLines = changes.map((change) => {
      const fileLabel = path.basename(change.file);
      return `${nowStamp()} ${change.key} (${fileLabel}): ${change.from} -> ${change.to}`;
    });
    appendRecordSection(growthLines, recordLines);
    await fs.writeFile(growthFile, growthLines.join('\n'), 'utf8');
  }

  console.log('Persona tuning changes:');
  for (const change of changes) {
    console.log(`- ${change.key}: ${change.from} -> ${change.to} (${path.basename(change.file)})`);
  }
  if (skipped.length > 0) {
    console.log('Skipped directives:');
    for (const line of skipped) {
      console.log(`- ${line}`);
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
