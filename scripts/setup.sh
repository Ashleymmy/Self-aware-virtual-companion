#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${REPO_ROOT}/config/.env.local"
WORKSPACE_DIR_DEFAULT="${REPO_ROOT}/savc-core"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

generate_local_token() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 16
  else
    python3 -c 'import secrets; print(secrets.token_hex(16))'
  fi
}

upsert_env_var() {
  local file="$1"
  local key="$2"
  local value="$3"

  if [[ -z "${value}" ]]; then
    return 0
  fi

  mkdir -p "$(dirname -- "${file}")"
  touch "${file}"
  chmod 600 "${file}" 2>/dev/null || true

  python3 - "${file}" "${key}" "${value}" <<'PY'
from __future__ import annotations
import sys
from pathlib import Path

path = Path(sys.argv[1])
key = sys.argv[2]
value = sys.argv[3]

try:
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
except FileNotFoundError:
    lines = []

out: list[str] = []
replaced = False
prefix = f"{key}="
for line in lines:
    if line.startswith(prefix) and not replaced:
        out.append(prefix + value)
        replaced = True
    else:
        out.append(line)

if not replaced:
    if out and out[-1].strip():
        out.append("")
    out.append(prefix + value)

path.write_text("\n".join(out).rstrip("\n") + "\n", encoding="utf-8")
PY
}

# ──────────────────────────────────────────────
# Paths
# ──────────────────────────────────────────────
OPENCLAW_DIR="${HOME}/.openclaw"
OPENCLAW_CONFIG="${OPENCLAW_DIR}/openclaw.json"
OPENCLAW_GLOBAL_ENV="${OPENCLAW_DIR}/.env"

mkdir -p "${OPENCLAW_DIR}"

# ──────────────────────────────────────────────
# Gateway token
# ──────────────────────────────────────────────
if [[ -z "${OPENCLAW_GATEWAY_TOKEN:-}" ]]; then
  OPENCLAW_GATEWAY_TOKEN="$(generate_local_token)"
  export OPENCLAW_GATEWAY_TOKEN
  upsert_env_var "${ENV_FILE}" "OPENCLAW_GATEWAY_TOKEN" "${OPENCLAW_GATEWAY_TOKEN}"
fi

# Sync common vars into OpenClaw global env so `openclaw ...` works without sourcing repo env.
upsert_env_var "${OPENCLAW_GLOBAL_ENV}" "OPENCLAW_GATEWAY_TOKEN" "${OPENCLAW_GATEWAY_TOKEN:-}"
upsert_env_var "${OPENCLAW_GLOBAL_ENV}" "ANTHROPIC_API_KEY" "${ANTHROPIC_API_KEY:-}"
upsert_env_var "${OPENCLAW_GLOBAL_ENV}" "OPENAI_API_KEY" "${OPENAI_API_KEY:-}"
upsert_env_var "${OPENCLAW_GLOBAL_ENV}" "ANYROUTER_API_KEY" "${ANYROUTER_API_KEY:-}"
upsert_env_var "${OPENCLAW_GLOBAL_ENV}" "GGBOOM_API_KEY" "${GGBOOM_API_KEY:-}"
upsert_env_var "${OPENCLAW_GLOBAL_ENV}" "CODE_API_KEY" "${CODE_API_KEY:-}"
upsert_env_var "${OPENCLAW_GLOBAL_ENV}" "LAOYOU_API_KEY" "${LAOYOU_API_KEY:-}"
upsert_env_var "${OPENCLAW_GLOBAL_ENV}" "NEB_API_KEY" "${NEB_API_KEY:-}"
upsert_env_var "${OPENCLAW_GLOBAL_ENV}" "OPENAI_BASE_URL" "${OPENAI_BASE_URL:-}"
upsert_env_var "${OPENCLAW_GLOBAL_ENV}" "DISCORD_BOT_TOKEN" "${DISCORD_BOT_TOKEN:-}"
upsert_env_var "${OPENCLAW_GLOBAL_ENV}" "TELEGRAM_BOT_TOKEN" "${TELEGRAM_BOT_TOKEN:-}"
upsert_env_var "${OPENCLAW_GLOBAL_ENV}" "BRAVE_API_KEY" "${BRAVE_API_KEY:-}"
upsert_env_var "${OPENCLAW_GLOBAL_ENV}" "SILICON_EMBEDDING_API_KEY" "${SILICON_EMBEDDING_API_KEY:-}"

# ──────────────────────────────────────────────
# Resolve workspace
# ──────────────────────────────────────────────
if [[ -n "${OPENCLAW_WORKSPACE:-}" ]]; then
  if [[ "${OPENCLAW_WORKSPACE}" = /* ]]; then
    WORKSPACE_DIR="${OPENCLAW_WORKSPACE}"
  else
    WORKSPACE_DIR="${REPO_ROOT}/config/${OPENCLAW_WORKSPACE}"
  fi
else
  WORKSPACE_DIR="${WORKSPACE_DIR_DEFAULT}"
fi

if [[ ! -d "${WORKSPACE_DIR}" ]]; then
  echo "[ERROR] Workspace directory not found: ${WORKSPACE_DIR}" >&2
  echo "Run this script from the SAVC repo after scaffolding is created." >&2
  exit 1
fi

WORKSPACE_DIR_ABS="$(realpath "${WORKSPACE_DIR}")"

# ──────────────────────────────────────────────
# Backup existing config
# ──────────────────────────────────────────────
if [[ -f "${OPENCLAW_CONFIG}" ]]; then
  ts="$(date +%Y%m%d-%H%M%S)"
  backup="${OPENCLAW_CONFIG}.savc-backup-${ts}"
  cp -f "${OPENCLAW_CONFIG}" "${backup}"
  echo "[INFO] Backed up existing OpenClaw config to: ${backup}"
fi

# ──────────────────────────────────────────────
# Derived values
# ──────────────────────────────────────────────
OPENCLAW_PORT_EFFECTIVE="${OPENCLAW_PORT:-18789}"
OPENCLAW_SUBMODULE="${REPO_ROOT}/openclaw"

if [[ -n "${SILICON_EMBEDDING_API_KEY:-}" ]]; then
  MEMORY_SEARCH_REMOTE_BLOCK="$(cat <<'JSON'
        "remote": {
          "baseUrl": "https://api.siliconflow.cn/v1",
          "apiKey": "${SILICON_EMBEDDING_API_KEY}"
        },
JSON
)"
else
  MEMORY_SEARCH_REMOTE_BLOCK="$(cat <<'JSON'
        "remote": {
          "baseUrl": "https://api.siliconflow.cn/v1"
        },
JSON
)"
fi

# ──────────────────────────────────────────────
# Channel config fragments (only if tokens set)
# ──────────────────────────────────────────────
if [[ -n "${TELEGRAM_BOT_TOKEN:-}" ]]; then
  TELEGRAM_BLOCK="$(cat <<'JSON'
    "telegram": {
      "enabled": true,
      "dmPolicy": "pairing",
      "groups": { "*": { "requireMention": true } },
      "groupPolicy": "open",
      "streamMode": "partial"
    }
JSON
)"
else
  TELEGRAM_BLOCK='    "telegram": { "enabled": false }'
fi

if [[ -n "${DISCORD_BOT_TOKEN:-}" ]]; then
  DISCORD_BLOCK="$(cat <<'JSON'
    "discord": {
      "enabled": true,
      "groupPolicy": "allowlist",
      "dm": { "enabled": true, "policy": "pairing" }
    }
JSON
)"
else
  DISCORD_BLOCK='    "discord": { "enabled": false }'
fi

# iMessage: enabled when imsg binary is present
IMSG_BIN="${IMSG_CLI_PATH:-${HOME}/.openclaw/bin/imsg}"
IMSG_DB="${IMSG_DB_PATH:-${HOME}/Library/Messages/chat.db}"
# 允许发消息给媛媛的号码（allowlist 模式，无需配对码）
IMSG_ALLOW_FROM="${IMSG_ALLOW_FROM:-+8613225515320}"
if [[ -x "${IMSG_BIN}" ]]; then
  IMESSAGE_BLOCK="$(cat <<JSON
    "imessage": {
      "enabled": true,
      "cliPath": "${IMSG_BIN}",
      "dbPath": "${IMSG_DB}",
      "dmPolicy": "allowlist",
      "allowFrom": ["${IMSG_ALLOW_FROM}"],
      "groupPolicy": "allowlist",
      "includeAttachments": true
    }
JSON
)"
else
  IMESSAGE_BLOCK='    "imessage": { "enabled": false }'
fi

# Dev mode toggle:
# - 1 (default): enable yuanyuan autonomous dev path (coding tools + workspace access)
# - 0: keep conservative messaging-only defaults
SAVC_AUTODEV_ENABLE="${SAVC_AUTODEV_ENABLE:-1}"

if [[ "${SAVC_AUTODEV_ENABLE}" == "1" ]]; then
  SANDBOX_WORKSPACE_ACCESS="rw"
  MAIN_AGENT_TOOLS_BLOCK="$(cat <<'JSON'
        "tools": {
          "profile": "coding",
          "alsoAllow": ["savc-orchestrator", "group:web", "group:sessions", "group:runtime", "group:fs", "image"]
        }
JSON
)"
  GLOBAL_TOOLS_BLOCK="$(cat <<'JSON'
  "tools": {
    "profile": "coding",
    "alsoAllow": ["savc-orchestrator", "group:web", "group:sessions"],
    "exec": {
      "applyPatch": { "enabled": true }
    },
    "sandbox": {
      "tools": {
        "allow": ["group:messaging", "group:sessions", "group:web", "group:runtime", "group:fs", "image"],
        "deny": ["group:ui", "nodes", "cron", "gateway"]
      }
    }
  },
JSON
)"
else
  SANDBOX_WORKSPACE_ACCESS="none"
  MAIN_AGENT_TOOLS_BLOCK=''
  GLOBAL_TOOLS_BLOCK="$(cat <<'JSON'
  "tools": {
    "profile": "messaging",
    "alsoAllow": ["savc-orchestrator"],
    "sandbox": {
      "tools": {
        "allow": ["group:messaging", "group:sessions"],
        "deny": ["group:runtime", "group:fs", "group:ui", "nodes", "cron", "gateway"]
      }
    }
  },
JSON
)"
fi

# ══════════════════════════════════════════════
# Generate openclaw.json — full config
# ══════════════════════════════════════════════
cat > "${OPENCLAW_CONFIG}" <<JSON
{
  "models": {
    "mode": "merge",
    "providers": {
      "anyrouter": {
        "baseUrl": "https://anyrouter.top",
        "apiKey": "\${ANYROUTER_API_KEY}",
        "api": "anthropic-messages",
        "models": [
          {
            "id": "claude-opus-4-6",
            "name": "Claude Opus 4.6",
            "reasoning": true,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 200000,
            "maxTokens": 8192
          },
          {
            "id": "claude-sonnet-4-5-20250929",
            "name": "Claude Sonnet 4.5",
            "reasoning": true,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 200000,
            "maxTokens": 8192
          },
          {
            "id": "claude-haiku-4-5-20251001",
            "name": "Claude Haiku 4.5",
            "reasoning": false,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 200000,
            "maxTokens": 8192
          }
        ]
      },
      "laoyou": {
        "baseUrl": "https://api.freestyle.cc.cd",
        "apiKey": "\${LAOYOU_API_KEY}",
        "api": "openai-completions",
        "models": [
          {
            "id": "claude-opus-4-6",
            "name": "Claude Opus 4.6 (laoyou)",
            "reasoning": true,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 200000,
            "maxTokens": 8192
          },
          {
            "id": "claude-sonnet-4-5-20250929",
            "name": "Claude Sonnet 4.5 (laoyou)",
            "reasoning": true,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 200000,
            "maxTokens": 8192
          },
          {
            "id": "claude-haiku-4-5-20251001",
            "name": "Claude Haiku 4.5 (laoyou)",
            "reasoning": false,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 200000,
            "maxTokens": 8192
          }
        ]
      },
      "code": {
        "baseUrl": "https://code.claudex.us.ci",
        "apiKey": "\${CODE_API_KEY}",
        "api": "openai-completions",
        "models": [
          {
            "id": "claude-haiku-4-5-20251001",
            "name": "Claude Haiku 4.5 (code)",
            "reasoning": false,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 200000,
            "maxTokens": 8192
          },
          {
            "id": "claude-sonnet-4-5-20250929",
            "name": "Claude Sonnet 4.5 (code)",
            "reasoning": true,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 200000,
            "maxTokens": 8192
          }
        ]
      },
      "ggboom": {
        "baseUrl": "https://ai.qaq.al",
        "apiKey": "\${GGBOOM_API_KEY}",
        "api": "openai-responses",
        "models": [
          {
            "id": "gpt-5.2",
            "name": "GPT-5.2 (ggboom)",
            "reasoning": true,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 200000,
            "maxTokens": 8192
          },
          {
            "id": "gpt-5.3",
            "name": "GPT-5.3 (ggboom)",
            "reasoning": true,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 200000,
            "maxTokens": 8192
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "ggboom/gpt-5.2",
        "fallbacks": [
          "ggboom/gpt-5.2",
          "anyrouter/claude-sonnet-4-5-20250929",
          "laoyou/claude-sonnet-4-5-20250929",
          "code/claude-sonnet-4-5-20250929",
          "anyrouter/claude-haiku-4-5-20251001"
        ]
      },
      "models": {
        "ggboom/gpt-5.2": { "alias": "gpt" },
        "ggboom/gpt-5.3": { "alias": "gpt5" },
        "anyrouter/claude-opus-4-6": { "alias": "opus" },
        "anyrouter/claude-sonnet-4-5-20250929": { "alias": "sonnet" },
        "anyrouter/claude-haiku-4-5-20251001": { "alias": "haiku" },
        "laoyou/claude-opus-4-6": { "alias": "laoyou-opus" },
        "laoyou/claude-sonnet-4-5-20250929": { "alias": "laoyou-sonnet" },
        "laoyou/claude-haiku-4-5-20251001": { "alias": "laoyou-haiku" },
        "code/claude-haiku-4-5-20251001": { "alias": "code-haiku" },
        "code/claude-sonnet-4-5-20250929": { "alias": "code-sonnet" }
      },
      "workspace": "${WORKSPACE_DIR_ABS}",
      "memorySearch": {
        "enabled": true,
        "provider": "openai",
${MEMORY_SEARCH_REMOTE_BLOCK}
        "model": "Qwen/Qwen3-Embedding-8B",
        "fallback": "none"
      },
      "heartbeat": {
        "session": "heartbeat-main"
      },
      "maxConcurrent": 4,
      "subagents": {
        "maxConcurrent": 8
      },
      "sandbox": {
        "mode": "off",
        "workspaceAccess": "${SANDBOX_WORKSPACE_ACCESS}",
        "scope": "session"
      }
    },
    "list": [
      {
        "id": "main",
        "subagents": { "allowAgents": ["*"] }${MAIN_AGENT_TOOLS_BLOCK:+,}
${MAIN_AGENT_TOOLS_BLOCK}
      },
      {
        "id": "companion",
        "name": "companion",
        "workspace": "${WORKSPACE_DIR_ABS}",
        "agentDir": "${OPENCLAW_DIR}/agents/companion/agent",
        "model": "ggboom/gpt-5.2",
        "tools": { "profile": "messaging", "alsoAllow": ["group:memory"] }
      },
      {
        "id": "memory",
        "name": "memory",
        "workspace": "${WORKSPACE_DIR_ABS}",
        "agentDir": "${OPENCLAW_DIR}/agents/memory/agent",
        "model": "ggboom/gpt-5.2",
        "tools": { "profile": "messaging", "alsoAllow": ["group:memory"] }
      },
      {
        "id": "technical",
        "name": "technical",
        "workspace": "${WORKSPACE_DIR_ABS}",
        "agentDir": "${OPENCLAW_DIR}/agents/technical/agent",
        "model": "ggboom/gpt-5.2",
        "tools": { "profile": "coding", "alsoAllow": ["group:web"] }
      },
      {
        "id": "creative",
        "name": "creative",
        "workspace": "${WORKSPACE_DIR_ABS}",
        "agentDir": "${OPENCLAW_DIR}/agents/creative/agent",
        "model": "ggboom/gpt-5.2",
        "tools": { "profile": "messaging", "alsoAllow": ["group:memory"] }
      },
      {
        "id": "tooling",
        "name": "tooling",
        "workspace": "${WORKSPACE_DIR_ABS}",
        "agentDir": "${OPENCLAW_DIR}/agents/tooling/agent",
        "model": "ggboom/gpt-5.2",
        "tools": { "profile": "coding", "alsoAllow": ["group:web"] }
      },
      {
        "id": "voice",
        "name": "voice",
        "workspace": "${WORKSPACE_DIR_ABS}",
        "agentDir": "${OPENCLAW_DIR}/agents/voice/agent",
        "model": "ggboom/gpt-5.2",
        "tools": { "profile": "messaging" }
      },
      {
        "id": "vision",
        "name": "vision",
        "workspace": "${WORKSPACE_DIR_ABS}",
        "agentDir": "${OPENCLAW_DIR}/agents/vision/agent",
        "model": "ggboom/gpt-5.2",
        "tools": { "profile": "messaging", "alsoAllow": ["image"] }
      },
      {
        "id": "vibe-coder",
        "name": "vibe-coder",
        "workspace": "${WORKSPACE_DIR_ABS}",
        "agentDir": "${OPENCLAW_DIR}/agents/vibe-coder/agent",
        "model": "ggboom/gpt-5.2",
        "tools": { "profile": "coding", "alsoAllow": ["group:web"] }
      }
    ]
  },
${GLOBAL_TOOLS_BLOCK}
  "messages": {
    "ackReactionScope": "group-mentions",
    "tts": {
      "auto": "always",
      "mode": "final",
      "openai": { "voice": "alloy" }
    }
  },
  "commands": {
    "native": "auto",
    "nativeSkills": false,
    "restart": true
  },
  "session": {
    "dmScope": "per-channel-peer"
  },
  "channels": {
${TELEGRAM_BLOCK},
${DISCORD_BLOCK},
${IMESSAGE_BLOCK}
  },
  "gateway": {
    "port": ${OPENCLAW_PORT_EFFECTIVE},
    "mode": "local",
    "auth": {
      "mode": "token",
      "token": "\${OPENCLAW_GATEWAY_TOKEN}"
    }
  },
  "skills": {
    "allowBundled": []
  },
  "plugins": {
    "load": {
      "paths": [
        "${OPENCLAW_SUBMODULE}/extensions/savc-orchestrator",
        "${OPENCLAW_SUBMODULE}/extensions/imessage"
      ]
    },
    "entries": {
      "discord": { "enabled": true },
      "telegram": { "enabled": true },
      "imessage": { "enabled": true },
      "savc-orchestrator": {
        "enabled": true,
        "config": {
          "savcCorePath": "${WORKSPACE_DIR_ABS}",
          "spawnMode": "real",
          "defaultWait": true,
          "defaultTimeoutMs": 120000,
          "memoryRecallEnabled": true,
          "memoryRecallTopK": 5,
          "memoryMinScore": 0.25,
          "memoryPersistEnabled": true
        }
      }
    }
  }
}
JSON

echo "[OK] Wrote OpenClaw config: ${OPENCLAW_CONFIG}"

# ══════════════════════════════════════════════
# Register agents — SOUL.md + models.json + auth-profiles.json
# ══════════════════════════════════════════════
AGENTS_TEMPLATE_DIR="${REPO_ROOT}/config/openclaw/agents"
AGENTS=(main companion memory technical creative tooling voice vision vibe-coder)

for agent in "${AGENTS[@]}"; do
  agent_dir="${OPENCLAW_DIR}/agents/${agent}"
  mkdir -p "${agent_dir}/agent"
  mkdir -p "${agent_dir}/sessions"

  # Copy SOUL.md from repo template
  soul_src="${AGENTS_TEMPLATE_DIR}/${agent}/SOUL.md"
  if [[ -f "${soul_src}" ]]; then
    cp -f "${soul_src}" "${agent_dir}/SOUL.md"
  fi
done

echo "[OK] Copied agent SOUL.md templates (${#AGENTS[@]} agents)"

# ── Main agent: full models.json with all providers ──
cat > "${OPENCLAW_DIR}/agents/main/agent/models.json" <<MJSON
{
  "providers": {
    "anyrouter": {
      "baseUrl": "https://anyrouter.top",
      "apiKey": "${ANYROUTER_API_KEY:-}",
      "api": "anthropic-messages",
      "models": [
        {
          "id": "claude-opus-4-6", "name": "Claude Opus 4.6",
          "reasoning": true, "input": ["text", "image"],
          "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
          "contextWindow": 200000, "maxTokens": 8192
        },
        {
          "id": "claude-sonnet-4-5-20250929", "name": "Claude Sonnet 4.5",
          "reasoning": true, "input": ["text", "image"],
          "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
          "contextWindow": 200000, "maxTokens": 8192
        },
        {
          "id": "claude-haiku-4-5-20251001", "name": "Claude Haiku 4.5",
          "reasoning": false, "input": ["text", "image"],
          "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
          "contextWindow": 200000, "maxTokens": 8192
        }
      ]
    },
    "ggboom": {
      "baseUrl": "https://ai.qaq.al",
      "apiKey": "${GGBOOM_API_KEY:-}",
      "api": "openai-responses",
      "models": [
        {
          "id": "gpt-5.2", "name": "GPT-5.2 (ggboom)",
          "reasoning": true, "input": ["text", "image"],
          "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
          "contextWindow": 200000, "maxTokens": 8192
        },
        {
          "id": "gpt-5.3", "name": "GPT-5.3 (ggboom)",
          "reasoning": true, "input": ["text", "image"],
          "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
          "contextWindow": 200000, "maxTokens": 8192
        }
      ]
    },
    "laoyou": {
      "baseUrl": "https://api.freestyle.cc.cd",
      "apiKey": "${LAOYOU_API_KEY:-}",
      "api": "openai-completions",
      "models": [
        {
          "id": "claude-opus-4-6", "name": "Claude Opus 4.6 (laoyou)",
          "reasoning": true, "input": ["text", "image"],
          "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
          "contextWindow": 200000, "maxTokens": 8192
        },
        {
          "id": "claude-sonnet-4-5-20250929", "name": "Claude Sonnet 4.5 (laoyou)",
          "reasoning": true, "input": ["text", "image"],
          "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
          "contextWindow": 200000, "maxTokens": 8192
        },
        {
          "id": "claude-haiku-4-5-20251001", "name": "Claude Haiku 4.5 (laoyou)",
          "reasoning": false, "input": ["text", "image"],
          "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
          "contextWindow": 200000, "maxTokens": 8192
        }
      ]
    },
    "code": {
      "baseUrl": "https://code.claudex.us.ci",
      "apiKey": "${CODE_API_KEY:-}",
      "api": "openai-completions",
      "models": [
        {
          "id": "claude-haiku-4-5-20251001", "name": "Claude Haiku 4.5 (code)",
          "reasoning": false, "input": ["text", "image"],
          "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
          "contextWindow": 200000, "maxTokens": 8192
        },
        {
          "id": "claude-sonnet-4-5-20250929", "name": "Claude Sonnet 4.5 (code)",
          "reasoning": true, "input": ["text", "image"],
          "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
          "contextWindow": 200000, "maxTokens": 8192
        }
      ]
    }
  }
}
MJSON

echo "[OK] Generated main agent models.json"

# ── Sub-agents: simplified models.json ──
for agent in companion memory technical creative tooling voice vision vibe-coder; do
  cat > "${OPENCLAW_DIR}/agents/${agent}/agent/models.json" <<MJSON
{
  "primary": "ggboom/gpt-5.2",
  "fallbacks": [
    "ggboom/gpt-5.2",
    "anyrouter/claude-sonnet-4-5-20250929",
    "laoyou/claude-sonnet-4-5-20250929",
    "code/claude-sonnet-4-5-20250929",
    "anyrouter/claude-haiku-4-5-20251001"
  ]
}
MJSON
done

echo "[OK] Generated sub-agent models.json (8 agents)"

# ── Auth profiles for agents that need direct provider access ──
AUTH_AGENTS=(main companion technical tooling)
for agent in "${AUTH_AGENTS[@]}"; do
  cat > "${OPENCLAW_DIR}/agents/${agent}/agent/auth-profiles.json" <<AJSON
{
  "version": 1,
  "profiles": {
    "anyrouter:default": { "type": "api_key", "provider": "anyrouter", "key": "${ANYROUTER_API_KEY:-}" },
    "ggboom:default":    { "type": "api_key", "provider": "ggboom",    "key": "${GGBOOM_API_KEY:-}" },
    "laoyou:default":    { "type": "api_key", "provider": "laoyou",    "key": "${LAOYOU_API_KEY:-}" },
    "code:default":      { "type": "api_key", "provider": "code",      "key": "${CODE_API_KEY:-}" }
  }
}
AJSON
done

echo "[OK] Generated auth-profiles.json (${#AUTH_AGENTS[@]} agents)"

# ──────────────────────────────────────────────
# Credentials dir + permissions
# ──────────────────────────────────────────────
mkdir -p "${OPENCLAW_DIR}/credentials"

chmod 700 "${OPENCLAW_DIR}" || true
chmod 600 "${OPENCLAW_CONFIG}" || true
find "${OPENCLAW_DIR}/agents" -name "auth-profiles.json" -exec chmod 600 {} \; 2>/dev/null || true

echo "[OK] Synced OpenClaw env: ${OPENCLAW_GLOBAL_ENV}"
echo "[OK] Workspace set to: ${WORKSPACE_DIR_ABS}"
echo "[OK] Agents registered: ${AGENTS[*]}"
echo "[OK] Plugin: savc-orchestrator → ${OPENCLAW_SUBMODULE}/extensions/savc-orchestrator"
if [[ "${SAVC_AUTODEV_ENABLE}" == "1" ]]; then
  echo "[OK] Yuanyuan autodev mode: enabled (workspaceAccess=rw, main tools=coding)"
else
  echo "[INFO] Yuanyuan autodev mode: disabled (set SAVC_AUTODEV_ENABLE=1 to enable)"
fi
