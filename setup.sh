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
if command -v mise &>/dev/null; then
  info "mise is already installed ($(mise --version | head -1))"
else
  warn "Installing mise…"
  curl -fsSL https://mise.run | sh
  # Add mise to PATH for the rest of this script
  export PATH="$HOME/.local/bin:$PATH"
  command -v mise &>/dev/null || fail "mise installation failed"
  info "mise installed ($(mise --version | head -1))"
fi

# Activate mise for the current shell so `mise install` shims work immediately
eval "$(mise activate bash --shims)"

# Ensure bun global bin is in PATH
export PATH="$HOME/.bun/bin:$PATH"

# ─── 2. Install bun via mise ─────────────────────────────────────────
if mise ls bun 2>/dev/null | grep -q bun; then
  info "bun is already installed via mise ($(bun --version))"
else
  warn "Installing bun via mise…"
  mise use --global bun@latest
  info "bun installed ($(bun --version))"
fi

# ─── 3. Install pi via mise (bun global package) ─────────────────────
if command -v pi &>/dev/null; then
  info "pi is already installed ($(pi --version 2>/dev/null || echo 'unknown'))"
else
  warn "Installing pi (pi-coding-agent) via bun…"
  bun install --global @mariozechner/pi-coding-agent
  command -v pi &>/dev/null || fail "pi installation failed"
  info "pi installed ($(pi --version 2>/dev/null || echo 'unknown'))"
fi

# ─── 4. Install clankie via bun ──────────────────────────────────────
if command -v clankie &>/dev/null; then
  info "clankie is already installed"
else
  warn "Installing clankie via bun…"
  bun install --global clankie
  command -v clankie &>/dev/null || fail "clankie installation failed"
  info "clankie installed"
fi

# ─── 5. Initialize clankie ───────────────────────────────────────────
warn "Running clankie init…"
clankie init
info "clankie init complete"

# ─── Done ─────────────────────────────────────────────────────────────
echo ""
info "All done! Next steps:"
echo "  1. Run 'clankie login' to authenticate with your AI provider"
echo "  2. Run 'clankie start' to start the daemon"
echo ""
echo "  For Slack integration, also configure:"
echo "    clankie config set channels.slack.appToken \"xapp-...\""
echo "    clankie config set channels.slack.botToken \"xoxb-...\""
echo "    clankie config set channels.slack.allowFrom '[\"YOUR_USER_ID\"]'"
