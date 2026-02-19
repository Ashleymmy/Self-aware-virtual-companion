#!/usr/bin/env bash
# ──────────────────────────────────────────────
# SAVC macOS Bootstrap Script
# 在全新 macOS 上拉取仓库后运行此脚本安装所有依赖
# 用法: bash scripts/bootstrap-mac.sh
# ──────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail()  { echo -e "${RED}[ERROR]${NC} $*" >&2; }

NEED_BREW_INSTALL=()

# ── 1. Homebrew ──────────────────────────────
if ! command -v brew >/dev/null 2>&1; then
  info "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Apple Silicon path
  if [[ -f /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  fi
  ok "Homebrew installed"
else
  ok "Homebrew found: $(brew --prefix)"
fi

# ── 2. Node.js >= 22.12.0 ───────────────────
REQUIRED_NODE_MAJOR=22
install_node=false

if command -v node >/dev/null 2>&1; then
  NODE_VERSION="$(node --version | sed 's/^v//')"
  NODE_MAJOR="${NODE_VERSION%%.*}"
  if [[ "${NODE_MAJOR}" -lt "${REQUIRED_NODE_MAJOR}" ]]; then
    warn "Node ${NODE_VERSION} found, but >= ${REQUIRED_NODE_MAJOR} required"
    install_node=true
  else
    ok "Node.js ${NODE_VERSION}"
  fi
else
  install_node=true
fi

if $install_node; then
  if command -v fnm >/dev/null 2>&1; then
    info "Installing Node ${REQUIRED_NODE_MAJOR} via fnm..."
    fnm install "${REQUIRED_NODE_MAJOR}"
    fnm use "${REQUIRED_NODE_MAJOR}"
  elif command -v nvm >/dev/null 2>&1; then
    info "Installing Node ${REQUIRED_NODE_MAJOR} via nvm..."
    nvm install "${REQUIRED_NODE_MAJOR}"
    nvm use "${REQUIRED_NODE_MAJOR}"
  else
    info "Installing Node ${REQUIRED_NODE_MAJOR} via Homebrew..."
    brew install "node@${REQUIRED_NODE_MAJOR}"
    brew link --overwrite "node@${REQUIRED_NODE_MAJOR}" 2>/dev/null || true
  fi
  ok "Node.js $(node --version)"
fi

# ── 3. pnpm ──────────────────────────────────
if ! command -v pnpm >/dev/null 2>&1; then
  info "Enabling pnpm via corepack..."
  corepack enable
  corepack prepare pnpm@latest --activate
  ok "pnpm $(pnpm --version)"
else
  ok "pnpm $(pnpm --version)"
fi

# ── 4. python3 (setup.sh / dev.sh 依赖) ─────
if ! command -v python3 >/dev/null 2>&1; then
  NEED_BREW_INSTALL+=(python3)
else
  ok "python3 $(python3 --version 2>&1 | awk '{print $2}')"
fi

# ── 5. 可选系统依赖 ─────────────────────────
# sharp (图像处理) 需要 vips；sqlite-vec 需要 sqlite
for pkg in vips sqlite; do
  if ! brew list "${pkg}" >/dev/null 2>&1; then
    NEED_BREW_INSTALL+=("${pkg}")
  else
    ok "brew: ${pkg}"
  fi
done

# 批量安装缺失的 brew 包
if [[ ${#NEED_BREW_INSTALL[@]} -gt 0 ]]; then
  info "Installing missing brew packages: ${NEED_BREW_INSTALL[*]}"
  brew install "${NEED_BREW_INSTALL[@]}"
  ok "Brew packages installed"
fi

# ── 6. 安装项目依赖 ──────────────────────────
info "Installing workspace dependencies (pnpm install)..."
cd "${REPO_ROOT}"
pnpm install
ok "pnpm install complete"

# ── 7. 构建 openclaw (从仓库内源码) ─────────
OPENCLAW_DIR="${REPO_ROOT}/openclaw"
if [[ -d "${OPENCLAW_DIR}" ]]; then
  info "Building openclaw from source..."
  if pnpm -C "${OPENCLAW_DIR}" exec tsdown --no-clean 2>/dev/null; then
    ok "openclaw built"
  else
    warn "openclaw build skipped (tsdown not available — run 'pnpm install' in openclaw/ if needed)"
  fi
else
  warn "openclaw/ directory not found — gateway dev mode won't work"
fi

# ── 8. 全局安装 openclaw CLI (可选) ──────────
if ! command -v openclaw >/dev/null 2>&1; then
  info "Installing openclaw CLI globally..."
  if [[ -d "${OPENCLAW_DIR}" ]]; then
    npm install -g "${OPENCLAW_DIR}"
    ok "openclaw CLI installed: $(openclaw --version 2>/dev/null || echo 'unknown')"
  else
    warn "Skipped global openclaw install (no openclaw/ dir)"
  fi
else
  ok "openclaw CLI: $(openclaw --version 2>/dev/null || echo 'installed')"
fi

# ── 9. 创建 config/.env.local ───────────────
ENV_LOCAL="${REPO_ROOT}/config/.env.local"
ENV_EXAMPLE="${REPO_ROOT}/config/.env.example"

if [[ ! -f "${ENV_LOCAL}" ]]; then
  if [[ -f "${ENV_EXAMPLE}" ]]; then
    cp "${ENV_EXAMPLE}" "${ENV_LOCAL}"
    chmod 600 "${ENV_LOCAL}"
    ok "Created config/.env.local from template"
    warn "请编辑 config/.env.local 填入 API 密钥"
  else
    warn "config/.env.example not found — skip env setup"
  fi
else
  ok "config/.env.local exists"
fi

# ── 10. 运行 setup.sh 生成 openclaw.json ────
info "Running setup.sh to generate ~/.openclaw/openclaw.json..."
if [[ -f "${ENV_LOCAL}" ]]; then
  bash "${REPO_ROOT}/scripts/setup.sh"
  ok "OpenClaw config generated"
else
  warn "Skipped setup.sh — config/.env.local missing"
fi

# ── 11. 构建 savc-ui ────────────────────────
SAVC_UI_DIR="${REPO_ROOT}/savc-ui"
if [[ -d "${SAVC_UI_DIR}" ]] && [[ -f "${SAVC_UI_DIR}/package.json" ]]; then
  info "Building savc-ui..."
  pnpm -C "${SAVC_UI_DIR}" run build 2>/dev/null && ok "savc-ui built" || warn "savc-ui build failed (non-critical)"
else
  warn "savc-ui/ not found"
fi

# ── Done ─────────────────────────────────────
echo ""
echo -e "${GREEN}══════════════════════════════════════${NC}"
echo -e "${GREEN}  SAVC Bootstrap Complete${NC}"
echo -e "${GREEN}══════════════════════════════════════${NC}"
echo ""
echo "Next steps:"
echo "  1. 编辑 config/.env.local 填入必要的 API 密钥"
echo "     主模型:  GGBOOM_API_KEY (GPT-5.2, 当前主力 provider)"
echo "     备用:    ANYROUTER_API_KEY, WZW_API_KEY (Claude 模型降级)"
echo "     可选:    CODE_API_KEY (Claude Code 代理)"
echo "     推荐:    SILICON_EMBEDDING_API_KEY (记忆语义检索)"
echo "     推荐:    BRAVE_API_KEY (联网搜索)"
echo ""
echo "  2. 填好密钥后重新运行 setup 生成完整配置:"
echo "     bash scripts/setup.sh"
echo ""
echo "  3. 启动开发服务器:"
echo "     pnpm dev"
echo ""
echo "  4. 访问管理界面:"
echo "     http://localhost:5174/"
echo ""
