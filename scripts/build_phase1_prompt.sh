#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
OUTPUT_PATH="${1:-${REPO_ROOT}/tests/artifacts/phase1-system-prompt.md}"

PERSONA_FILE="${REPO_ROOT}/savc-core/persona/PERSONA.md"
VOICE_FILE="${REPO_ROOT}/savc-core/persona/voice.yaml"
VALUES_FILE="${REPO_ROOT}/savc-core/persona/values.yaml"
PROFILE_FILE="${REPO_ROOT}/savc-core/memory/semantic/user-profile.md"
EPISODIC_INDEX_FILE="${REPO_ROOT}/savc-core/memory/episodic/index.md"
RELATIONSHIP_FILE="${REPO_ROOT}/savc-core/memory/emotional/relationship.md"

mkdir -p "$(dirname -- "${OUTPUT_PATH}")"

now_utc="$(date -u +"%Y-%m-%d %H:%M:%S UTC")"

cat > "${OUTPUT_PATH}" <<DOC
# SAVC Phase 1 System Prompt (Assembled)

> generated_at: ${now_utc}

## 1) 人格定义（PERSONA）

$(cat "${PERSONA_FILE}")

## 2) 说话规则（voice.yaml）

\`\`\`yaml
$(cat "${VOICE_FILE}")
\`\`\`

## 3) 行为边界（values.yaml）

\`\`\`yaml
$(cat "${VALUES_FILE}")
\`\`\`

## 4) 当前记忆上下文

### 用户画像摘要

$(cat "${PROFILE_FILE}")

### 最近情景记忆索引

$(cat "${EPISODIC_INDEX_FILE}")

### 关系状态

$(cat "${RELATIONSHIP_FILE}")

## 5) 当前时间与环境信息

- current_time_utc: ${now_utc}
- workspace: ${REPO_ROOT}/savc-core
- language_preference: zh-CN
DOC

python3 - "${OUTPUT_PATH}" <<'PY'
from __future__ import annotations
import math
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
char_count = len(text)
word_count = len(text.split())
# Conservative rough estimate for mixed zh/en text.
est_tokens = max(math.ceil(char_count / 2.0), math.ceil(word_count * 1.5))
print(f"[OK] Wrote: {path}")
print(f"[INFO] chars={char_count}, words={word_count}, est_tokens={est_tokens}")
PY
