#!/bin/bash
# =============================================================================
#  R-Group Analysis Suite — Environment Setup
#  Run once before first use, or re-run to update dependencies.
#  Safe to run multiple times (idempotent).
# =============================================================================

# ── WSL auto-relay ────────────────────────────────────────────────────────────
# If running under Git Bash / MSYS2 on Windows, re-execute inside WSL.
if [[ "${OSTYPE:-}" == msys* || "${MSYSTEM:-}" == MINGW* || \
      "$(uname -s 2>/dev/null)" == MINGW* ]]; then
  if ! command -v wsl &>/dev/null; then
    echo "ERROR: WSL is not installed. Install it with: wsl --install"
    exit 1
  fi
  # Convert the script path to a WSL Linux path.
  # Handles both //wsl.localhost/Distro/path and regular Windows C:/... paths.
  SCRIPT_PATH="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
  if [[ "$SCRIPT_PATH" =~ ^//wsl[.$] ]]; then
    # Strip the //wsl.localhost/Distro or //wsl$/Distro prefix
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
ENV_EXAMPLE="$ROOT/.env.example"

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m';  GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m';  BOLD='\033[1m';  RESET='\033[0m'

ok()   { echo -e "${GREEN}  ✓${RESET}  $*"; }
info() { echo -e "${CYAN}  →${RESET}  $*"; }
warn() { echo -e "${YELLOW}  ⚠${RESET}  $*"; }
err()  { echo -e "${RED}  ✗  $*${RESET}"; }
header() {
  echo ""
  echo -e "${BOLD}${BLUE}── $* ──────────────────────────────────────────────────${RESET}"
}

# ── Banner ────────────────────────────────────────────────────────────────────
clear
echo -e "${BOLD}${BLUE}"
cat << 'BANNER'
  ██████╗      ██████╗ ██████╗  ██████╗ ██╗   ██╗██████╗
  ██╔══██╗    ██╔════╝ ██╔══██╗██╔═══██╗██║   ██║██╔══██╗
  ██████╔╝    ██║  ███╗██████╔╝██║   ██║██║   ██║██████╔╝
  ██╔══██╗    ██║   ██║██╔══██╗██║   ██║██║   ██║██╔═══╝
  ██║  ██║    ╚██████╔╝██║  ██║╚██████╔╝╚██████╔╝██║
  ╚═╝  ╚═╝     ╚═════╝ ╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═╝
      Analysis Suite  ·  Environment Setup
BANNER
echo -e "${RESET}"
echo -e "  This script will:"
echo -e "  ${CYAN}1.${RESET} Check Python & Node.js prerequisites"
echo -e "  ${CYAN}2.${RESET} Create a Python virtual environment  (.venv/)"
echo -e "  ${CYAN}3.${RESET} Install all Python & Node.js dependencies"
echo -e "  ${CYAN}4.${RESET} Collect your Anthropic API key and write  .env"
echo -e "  ${CYAN}5.${RESET} Verify the installation (RDKit import check)"
echo ""
read -r -p "  Press Enter to begin, or Ctrl+C to cancel… "

# ── 1. Prerequisites ──────────────────────────────────────────────────────────
header "Checking prerequisites"

# Python 3.9+
PYTHON=""
for cmd in python3.12 python3.11 python3.10 python3.9 python3 python; do
  if command -v "$cmd" &>/dev/null; then
    VERSION=$("$cmd" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null || echo "0.0")
    MAJOR=$(echo "$VERSION" | cut -d. -f1)
    MINOR=$(echo "$VERSION" | cut -d. -f2)
    if [ "$MAJOR" -ge 3 ] && [ "$MINOR" -ge 9 ]; then
      PYTHON="$cmd"
      break
    fi
  fi
done

if [ -z "$PYTHON" ]; then
  err "Python 3.9+ is required but was not found."
  echo ""
  echo "  Install options:"
  echo "    Ubuntu/WSL: sudo apt update && sudo apt install python3.11 python3.11-venv"
  echo "    macOS:      brew install python@3.11"
  echo "    Conda:      conda create -n rganalysis python=3.11 && conda activate rganalysis"
  exit 1
fi
ok "Python: $($PYTHON --version)"

# pip
if ! "$PYTHON" -m pip --version &>/dev/null; then
  err "pip not found for $PYTHON."
  echo ""
  echo "  Install options:"
  echo "    Ubuntu/WSL: sudo apt install python3-pip"
  echo "    or:         $PYTHON -m ensurepip --upgrade"
  exit 1
fi
ok "pip: $($PYTHON -m pip --version | awk '{print $1,$2}')"

# python3-venv check (required for virtualenv creation on Ubuntu/Debian)
if ! "$PYTHON" -c "import venv" &>/dev/null; then
  PY_VER=$("$PYTHON" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
  err "python3-venv is not installed for Python ${PY_VER}."
  echo ""
  echo "  Fix:  sudo apt install python${PY_VER}-venv"
  exit 1
fi

# Node.js 18+
if ! command -v node &>/dev/null; then
  err "Node.js 18+ is required but was not found."
  echo ""
  echo "  Install options:"
  echo "    Ubuntu/WSL: curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install nodejs"
  echo "    nvm:        nvm install 22 && nvm use 22"
  echo "    macOS:      brew install node"
  exit 1
fi

NODE_VERSION=$(node --version | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  err "Node.js 18+ required. Found: $(node --version)"
  exit 1
fi
ok "Node.js: $(node --version)"

# npm
if ! command -v npm &>/dev/null; then
  err "npm not found. It should ship with Node.js."
  exit 1
fi
ok "npm: $(npm --version)"

# ── 2. Python virtual environment ─────────────────────────────────────────────
header "Python virtual environment"

if [ -d "$VENV" ]; then
  warn "Virtual environment already exists at .venv/ — reusing it."
  warn "Delete .venv/ and re-run setup.sh to rebuild from scratch."
else
  info "Creating virtual environment at .venv/ ..."
  "$PYTHON" -m venv "$VENV"
  ok "Virtual environment created"
fi

# Activate
source "$VENV/bin/activate"
ok "Activated: $VIRTUAL_ENV"

# Upgrade pip/setuptools silently
info "Upgrading pip & setuptools..."
pip install --quiet --upgrade pip setuptools wheel
ok "pip upgraded to $(pip --version | awk '{print $2}')"

# ── 3. Python dependencies ────────────────────────────────────────────────────
header "Installing Python dependencies"

info "Installing from backend/requirements.txt ..."
echo ""

# Try pip first; RDKit sometimes needs special handling
if ! pip install -r "$ROOT/backend/requirements.txt"; then
  echo ""
  warn "pip install encountered an issue."
  echo ""
  echo -e "  ${YELLOW}RDKit can be tricky to install via pip on some platforms.${RESET}"
  echo "  If the error is RDKit-related, try one of these alternatives:"
  echo ""
  echo "    Option A — conda (recommended):"
  echo "      conda create -n rganalysis python=3.11"
  echo "      conda activate rganalysis"
  echo "      conda install -c conda-forge rdkit"
  echo "      pip install -r backend/requirements.txt"
  echo ""
  echo "    Option B — Ubuntu/WSL apt:"
  echo "      sudo apt install python3-rdkit"
  echo "      pip install -r backend/requirements.txt  (skip rdkit line)"
  echo ""
  echo "    Option C — macOS with homebrew:"
  echo "      brew install rdkit"
  echo "      pip install -r backend/requirements.txt"
  echo ""
  exit 1
fi

echo ""
ok "All Python packages installed"

# Quick sanity check
info "Verifying key imports..."
"$VENV/bin/python" - <<'PYCHECK'
import sys

failures = []

try:
    import fastapi; print(f"  fastapi        {fastapi.__version__}")
except ImportError as e:
    failures.append(f"fastapi: {e}")

try:
    import uvicorn; print(f"  uvicorn        {uvicorn.__version__}")
except ImportError as e:
    failures.append(f"uvicorn: {e}")

try:
    import anthropic; print(f"  anthropic      {anthropic.__version__}")
except ImportError as e:
    failures.append(f"anthropic: {e}")

try:
    import rdkit
    from rdkit import Chem
    print(f"  rdkit          {Chem.rdBase.rdkitVersion}")
except ImportError as e:
    failures.append(f"rdkit: {e}")

try:
    import pandas; print(f"  pandas         {pandas.__version__}")
except ImportError as e:
    failures.append(f"pandas: {e}")

try:
    import numpy; print(f"  numpy          {numpy.__version__}")
except ImportError as e:
    failures.append(f"numpy: {e}")

if failures:
    print("\nFailed imports:")
    for f in failures:
        print(f"  ✗ {f}")
    sys.exit(1)
PYCHECK

echo ""
ok "All Python imports verified"

# ── 4. Node.js dependencies ───────────────────────────────────────────────────
header "Installing Node.js dependencies"

cd "$ROOT/frontend"
if [ -d "node_modules" ]; then
  warn "node_modules/ exists — running npm install to sync..."
else
  info "Installing npm packages..."
fi
npm install --silent
echo ""
ok "Node.js packages installed"
cd "$ROOT"

# ── 5. API Key configuration ──────────────────────────────────────────────────
header "API Key configuration"

EXISTING_KEY=""
if [ -f "$ENV_FILE" ]; then
  EXISTING_KEY=$(grep -E '^ANTHROPIC_API_KEY=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d ' ' || true)
fi

if [[ -n "$EXISTING_KEY" && "$EXISTING_KEY" != "sk-ant-..."* && ${#EXISTING_KEY} -gt 20 ]]; then
  echo -e "  ${GREEN}An Anthropic API key is already configured in .env${RESET}"
  MASKED="${EXISTING_KEY:0:12}…${EXISTING_KEY: -4}"
  echo -e "  Current key: ${CYAN}${MASKED}${RESET}"
  echo ""
  read -r -p "  Replace it with a new key? [y/N] " REPLACE_KEY
  REPLACE_KEY="${REPLACE_KEY:-n}"
  if [[ ! "$REPLACE_KEY" =~ ^[Yy]$ ]]; then
    ok "Keeping existing API key"
    SKIP_KEY_ENTRY=true
  else
    SKIP_KEY_ENTRY=false
  fi
else
  SKIP_KEY_ENTRY=false
fi

if [ "$SKIP_KEY_ENTRY" = false ]; then
  echo ""
  echo -e "  ${BOLD}Anthropic API Key${RESET}"
  echo -e "  Get yours at: ${CYAN}https://console.anthropic.com/settings/keys${RESET}"
  echo -e "  Format:       ${CYAN}sk-ant-api03-…${RESET}"
  echo ""

  while true; do
    read -r -p "  Enter your Anthropic API key: " -s NEW_KEY
    echo ""  # newline after hidden input

    if [ -z "$NEW_KEY" ]; then
      warn "No key entered. You can add it manually to .env later."
      warn "The app will fail to start without a valid key."
      NEW_KEY="sk-ant-REPLACE_ME"
      break
    fi

    # Basic format validation
    if [[ "$NEW_KEY" =~ ^sk-ant- ]]; then
      ok "Key format looks valid ✓"
      break
    else
      warn "Key should start with 'sk-ant-'. Got: ${NEW_KEY:0:8}…"
      read -r -p "  Use it anyway? [y/N] " FORCE
      FORCE="${FORCE:-n}"
      if [[ "$FORCE" =~ ^[Yy]$ ]]; then
        break
      fi
    fi
  done

  # Write .env
  if [ -f "$ENV_EXAMPLE" ]; then
    cp "$ENV_EXAMPLE" "$ENV_FILE"
  fi

  # Replace or set the key line
  if grep -q '^ANTHROPIC_API_KEY=' "$ENV_FILE" 2>/dev/null; then
    # macOS sed needs -i ''
    if sed --version &>/dev/null 2>&1; then
      sed -i "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=${NEW_KEY}|" "$ENV_FILE"
    else
      sed -i '' "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=${NEW_KEY}|" "$ENV_FILE"
    fi
  else
    echo "ANTHROPIC_API_KEY=${NEW_KEY}" >> "$ENV_FILE"
  fi

  ok ".env written with API key"
fi

# Ensure .env exists even if we skipped key entry
if [ ! -f "$ENV_FILE" ]; then
  cp "$ENV_EXAMPLE" "$ENV_FILE"
fi

# ── 6. Final verification ─────────────────────────────────────────────────────
header "Verifying full setup"

CONFIGURED_KEY=$(grep -E '^ANTHROPIC_API_KEY=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d ' ' || true)

if [[ -z "$CONFIGURED_KEY" || "$CONFIGURED_KEY" == "sk-ant-REPLACE_ME" || "$CONFIGURED_KEY" == "sk-ant-..." ]]; then
  warn "API key is not set. Edit .env before starting the app."
else
  ok "API key configured"
fi

# Verify venv python can import the backend
info "Smoke-testing backend import..."
cd "$ROOT"
if "$VENV/bin/python" -c "
import sys
sys.path.insert(0, '.')
from backend.tools.standardize_molecule import standardize_molecules_batch
result = standardize_molecules_batch(['c1ccccc1'])
assert result['num_success'] == 1, f'Expected 1 success, got: {result}'
assert result['results'][0]['canonical_smiles'] == 'c1ccccc1', f'Got: {result[\"results\"][0]}'
print('  Backend tool smoke-test passed ✓')
"; then
  ok "Backend tools working"
else
  err "Backend smoke-test failed. Check the error above."
  exit 1
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  Setup complete!${RESET}"
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════════════${RESET}"
echo ""
echo -e "  To start the application, run:"
echo ""
echo -e "    ${BOLD}${CYAN}./start.sh${RESET}"
echo ""
echo -e "  Then open  ${CYAN}http://localhost:5173${RESET}  in your browser."
echo ""
echo -e "  Other useful commands:"
echo -e "    ${CYAN}source .venv/bin/activate${RESET}   — activate venv in your shell"
echo -e "    ${CYAN}./start.sh --prod${RESET}            — production mode (built frontend)"
echo -e "    ${CYAN}cat .env${RESET}                     — review configuration"
echo ""
