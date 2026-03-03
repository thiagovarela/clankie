# clankie — Personal AI Assistant

A minimal AI assistant built on [pi](https://github.com/badlogic/pi-mono)'s SDK. clankie runs on your machine with your credentials, with a web channel today and support for additional channels via extensions.

## What Can clankie Do?

- 🌐 **Web UI** — Browser-based chat interface with real-time streaming ([web-ui/](./web-ui/))
- 📎 **Handle attachments** — Upload images (vision models), documents, code files
- 🔄 **Session management** — Switch between conversations with `/switch`, `/sessions`, `/new` commands
- 🔌 **pi ecosystem** — Works with pi extensions, skills, and prompt templates
- 🔒 **Privacy-first** — Runs on your machine, your credentials, your data

## Installation

### 1. Install Dependencies

**Runtime:** [Node.js](https://nodejs.org) v18+  
**Build:** [Bun](https://bun.sh) v1.0+ (for bundling and building web-ui)

```bash
# Check Node version
node --version  # Should be >= v18.0.0

# Install Bun (if not already installed)
curl -fsSL https://bun.sh/install | bash
bun --version
```

### 2. Quick Install via npm

```bash
npm install -g clankie
```

### 3. Or: Install from Source

```bash
git clone https://github.com/thiagovarela/clankie
cd clankie
npm install
npm link
```

## Quick Start

```bash
clankie init
clankie login
clankie start
```

You should see output like:

```text
[daemon] Starting clankie daemon (pid 12345)...
[daemon] Workspace: /Users/you/.clankie/workspace
[daemon] Channels: web
[web] WebSocket server listening on port 3100
[daemon] Ready. Waiting for messages...
```

Then open the connect URL printed by the daemon.

## Using clankie

### Web UI

1. Start the daemon: `clankie start`
2. Open the connect URL from logs (or use `http://localhost:3100?token=<your-token>`)
3. Start chatting

### Session Management Commands

When chatting through channels, you can use:

```text
/switch <name>    Switch to a different session
/sessions         List all sessions
/new              Start a fresh session (clears context)
```

### CLI Commands

```bash
# Send a one-off message (prints response and exits)
clankie send "What files are in the current directory?"

# Shorthand (no subcommand needed)
clankie "Summarize recent git commits"

# Check daemon status
clankie status

# Stop daemon
clankie stop

# View configuration
clankie config show
```

## Configuration

Config file: `~/.clankie/clankie.json` (JSON5 format — comments and trailing commas allowed)

### Common Settings

```bash
# Web channel
clankie config set channels.web.authToken "your-secret-token"
clankie config set channels.web.port 3100

# Optional: same-origin static hosting from daemon
clankie config set channels.web.staticDir "/path/to/web-ui/.output/public"

# AI model
clankie config set agent.model.primary "anthropic/claude-sonnet-4-5"

# Workspace (where agent works)
clankie config set agent.workspace "~/projects"
```

### Config Reference

| Path | Description | Example |
|------|-------------|---------|
| `agent.workspace` | Agent working directory | `"~/projects"` |
| `agent.model.primary` | Primary AI model | `"anthropic/claude-sonnet-4-5"` |
| `channels.web.authToken` | Web auth token | `"your-secret-token"` |
| `channels.web.port` | Web channel port | `3100` |
| `channels.web.allowedOrigins` | Allowed origins (optional) | `["https://example.com"]` |
| `channels.web.staticDir` | Static web-ui directory (optional) | `"/path/to/web-ui-dist"` |
| `channels.web.enabled` | Enable/disable web channel | `true` (default) |

## Running as a Service

```bash
clankie daemon install
clankie daemon status
clankie daemon logs
clankie daemon uninstall
```

## Development

```bash
bun src/cli.ts send "hello"
bun run dev send "hello"
bun run build
bun run check
bun run check:fix
bun run format
```

## Troubleshooting

### "No channels configured" error

Configure the web channel:

```bash
clankie config set channels.web.authToken "your-secret-token"
clankie config set channels.web.port 3100
```

### Daemon won't start after reboot

```bash
clankie daemon status
clankie daemon logs
```

If needed:

```bash
clankie daemon uninstall
clankie daemon install
```

## How It Works

clankie is a thin wrapper around pi:

1. **Web channel** accepts RPC over WebSocket
2. **Daemon** routes messages to persistent agent sessions (one per chat)
3. **Agent** uses pi's SDK with full tool access
4. **Sessions** persist across restarts in `~/.clankie/sessions/`

## Credits

Built on [pi](https://github.com/badlogic/pi-mono) by [@badlogic](https://github.com/badlogic).

## License

MIT
