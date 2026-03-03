#!/usr/bin/env bash
set -euo pipefail

# ─── Colors ───────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

info()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
fail()  { echo -e "${RED}[✗]${NC} $*"; exit 1; }

# ─── 1. Install mise ─────────────────────────────────────────────────
export PATH="$HOME/.local/bin:$PATH"

if command -v mise &>/dev/null; then
  info "mise is already installed ($(mise --version | head -1))"
else
  warn "Installing mise…"
  curl -fsSL https://mise.run | sh
  command -v mise &>/dev/null || fail "mise installation failed"
  info "mise installed ($(mise --version | head -1))"
fi

# Add mise activation to .bashrc if not already there
if ! grep -q 'mise activate bash' ~/.bashrc 2>/dev/null; then
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
  echo 'eval "$(mise activate bash)"' >> ~/.bashrc
  info "Added mise to ~/.bashrc"
fi

# Activate mise shims for the current script
eval "$(mise activate bash --shims)"

# ─── 2. Install pi via npm ──────────────────────────────────────────
if command -v pi &>/dev/null; then
  info "pi is already installed ($(pi --version 2>/dev/null || echo 'unknown'))"
else
  warn "Installing pi via npm…"
  npm install --global @mariozechner/pi-coding-agent
  command -v pi &>/dev/null || fail "pi installation failed"
  info "pi installed ($(pi --version 2>/dev/null || echo 'unknown'))"
fi

# ─── 3. Install clankie via npm ──────────────────────────────────────
if command -v clankie &>/dev/null; then
  info "clankie is already installed"
else
  warn "Installing clankie via npm…"
  npm install --global clankie
  command -v clankie &>/dev/null || fail "clankie installation failed"
  info "clankie installed"
fi

# ─── 4. Initialize clankie ───────────────────────────────────────────
warn "Running clankie init…"
clankie init
info "clankie init complete"

# ─── Done ─────────────────────────────────────────────────────────────
echo ""
info "All done! Next steps:"
echo "  1. Run 'source ~/.bashrc' to activate mise in your current shell"
echo "  2. Run 'clankie login' to authenticate with your AI provider"
echo "  3. Run 'clankie start' to start the daemon"
echo ""
echo "  Optional: install channel extensions (when available) for integrations like Slack."
