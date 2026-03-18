#!/bin/bash
# =============================================================================
#  R-Group Analysis Suite — Start Script
#  Usage:
#    ./start.sh           — dev mode (hot-reload backend + Vite frontend)
#    ./start.sh --prod    — production mode (serve pre-built frontend)
#    ./start.sh --backend — backend only (API on port 8000)
# =============================================================================

# ── WSL auto-relay ────────────────────────────────────────────────────────────
# If running under Git Bash / MSYS2 on Windows, re-execute inside WSL.
if [[ "${OSTYPE:-}" == msys* || "${MSYSTEM:-}" == MINGW* || \
      "$(uname -s 2>/dev/null)" == MINGW* ]]; then
  if ! command -v wsl &>/dev/null; then
    echo "ERROR: WSL is not installed. Install it with: wsl --install"
    exit 1
  fi
  SCRIPT_PATH="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
  if [[ "$SCRIPT_PATH" =~ ^//wsl[.$] ]]; then
    WSL_SCRIPT="$(echo "$SCRIPT_PATH" | sed 's|^//wsl[^/]*/[^/]*||')"
  else
    WSL_SCRIPT="$(wsl wslpath -u "$(cygpath -w "$SCRIPT_PATH")" 2>/dev/null || echo "$SCRIPT_PATH")"
  fi
  exec wsl bash "$WSL_SCRIPT" "$@"
fi

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
VENV="$ROOT/.venv"
ENV_FILE="$ROOT/.env"
MODE="dev"

# ── Parse flags ───────────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --prod)    MODE="prod" ;;
    --backend) MODE="backend" ;;
    --help|-h)
      echo "Usage: ./start.sh [--prod|--backend]"
      echo "  (no flag)   dev mode — hot-reload API + Vite dev server"
      echo "  --prod      production mode — built frontend served by FastAPI"
      echo "  --backend   API only (no frontend)"
      exit 0
      ;;
  esac
done

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

ok()   { echo -e "${GREEN}  ✓${RESET}  $*"; }
info() { echo -e "${CYAN}  →${RESET}  $*"; }
warn() { echo -e "${YELLOW}  ⚠${RESET}  $*"; }
err()  { echo -e "${RED}  ✗  $*${RESET}"; }

# ── Preflight checks ──────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}  R-Group Analysis Suite${RESET}"
echo -e "  Mode: ${CYAN}${MODE}${RESET}"
echo ""

# .env
if [ ! -f "$ENV_FILE" ]; then
  err ".env file not found. Run ./setup.sh first."
  exit 1
fi

# Load .env
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# API key check
if [ -z "${ANTHROPIC_API_KEY:-}" ] || \
   [ "$ANTHROPIC_API_KEY" = "sk-ant-..." ] || \
   [ "$ANTHROPIC_API_KEY" = "sk-ant-REPLACE_ME" ]; then
  err "ANTHROPIC_API_KEY is not set in .env"
  err "Run ./setup.sh to configure it, or edit .env manually."
  exit 1
fi
MASKED="${ANTHROPIC_API_KEY:0:12}…${ANTHROPIC_API_KEY: -4}"
ok "API key: ${MASKED}"

# Resolve python / uvicorn
if [ -f "$VENV/bin/activate" ]; then
  source "$VENV/bin/activate"
  PYTHON="$VENV/bin/python"
  UVICORN="$VENV/bin/uvicorn"
  ok "Virtual env: .venv/"
elif command -v uvicorn &>/dev/null && command -v python3 &>/dev/null; then
  PYTHON="python3"
  UVICORN="uvicorn"
  warn "No .venv/ found — using system Python (run ./setup.sh for isolated env)"
else
  err "No virtual env and no system uvicorn. Run ./setup.sh first."
  exit 1
fi

# Node/npm (only needed for dev + prod build)
if [ "$MODE" != "backend" ]; then
  if ! command -v npm &>/dev/null; then
    err "npm not found. Install Node.js 18+ or run ./setup.sh."
    exit 1
  fi
fi

# ── Cleanup on exit ───────────────────────────────────────────────────────────
PIDS=()

cleanup() {
  echo ""
  echo -e "  ${YELLOW}Shutting down…${RESET}"
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  echo -e "  ${GREEN}All services stopped.${RESET}"
  echo ""
}
trap cleanup SIGINT SIGTERM EXIT

# ── Production build (--prod only) ────────────────────────────────────────────
if [ "$MODE" = "prod" ]; then
  DIST="$ROOT/frontend/dist"
  if [ ! -d "$DIST" ] || [ ! -f "$DIST/index.html" ]; then
    info "Building frontend..."
    cd "$ROOT/frontend"
    npm run build
    cd "$ROOT"
    ok "Frontend built → frontend/dist/"
  else
    ok "Frontend already built (frontend/dist/ exists)"
    warn "If you've changed frontend code, delete frontend/dist/ and re-run."
  fi
fi

# ── Start backend ─────────────────────────────────────────────────────────────
cd "$ROOT"
info "Starting FastAPI backend on port 8000…"

if [ "$MODE" = "dev" ]; then
  "$UVICORN" backend.main:app \
    --host 0.0.0.0 --port 8000 \
    --reload --reload-dir backend \
    --log-level info &
else
  "$UVICORN" backend.main:app \
    --host 0.0.0.0 --port 8000 \
    --workers 2 \
    --log-level info &
fi
BACKEND_PID=$!
PIDS+=("$BACKEND_PID")

# Wait for backend to be ready (up to 15s)
# Use /usr/bin/curl explicitly to avoid picking up Windows curl on PATH
CURL_CMD=""
if [ -x /usr/bin/curl ]; then
  CURL_CMD="/usr/bin/curl"
elif command -v curl &>/dev/null && curl --version 2>&1 | grep -q "linux"; then
  CURL_CMD="curl"
fi

info "Waiting for backend to be ready…"
READY=false
for i in $(seq 1 30); do
  sleep 0.5
  if [ -n "$CURL_CMD" ]; then
    if $CURL_CMD -sf http://localhost:8000/api/health &>/dev/null; then
      READY=true; break
    fi
  else
    # fallback: use python to check
    if "$PYTHON" -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" &>/dev/null 2>&1; then
      READY=true; break
    fi
  fi
done

if [ "$READY" = true ]; then
  ok "Backend ready"
else
  warn "Backend health check timed out — it may still be starting"
fi

# ── Start frontend (dev mode only) ────────────────────────────────────────────
if [ "$MODE" = "dev" ]; then
  info "Starting Vite dev server on port 5173…"
  cd "$ROOT/frontend"
  if [ ! -d "node_modules" ]; then
    warn "node_modules missing — running npm install…"
    npm install --silent
  fi
  npm run dev &
  FRONTEND_PID=$!
  PIDS+=("$FRONTEND_PID")
  cd "$ROOT"
fi

# ── Ready banner ──────────────────────────────────────────────────────────────
sleep 1
echo ""
echo -e "${BOLD}${GREEN}  ══════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}   R-Group Analysis Suite is running${RESET}"
echo -e "${BOLD}${GREEN}  ══════════════════════════════════════════════════════${RESET}"
echo ""

if [ "$MODE" = "dev" ]; then
  echo -e "  ${BOLD}Frontend${RESET}     ${CYAN}http://localhost:5173${RESET}"
fi
echo -e "  ${BOLD}Backend API${RESET}  ${CYAN}http://localhost:8000${RESET}"
echo -e "  ${BOLD}API Docs${RESET}     ${CYAN}http://localhost:8000/api/docs${RESET}"
if [ "$MODE" = "prod" ]; then
  echo -e "  ${BOLD}App (prod)${RESET}   ${CYAN}http://localhost:8000${RESET}"
fi
echo ""
# WSL: localhost forwarding works automatically on Windows 11 / WSL2
if grep -qi microsoft /proc/version 2>/dev/null; then
  echo -e "  ${CYAN}Running inside WSL — open the URLs above in your Windows browser${RESET}"
fi
echo ""
echo -e "  ${YELLOW}Press Ctrl+C to stop all services${RESET}"
echo ""

# ── Wait ──────────────────────────────────────────────────────────────────────
wait "${PIDS[@]}"
