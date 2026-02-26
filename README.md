# clankie — Personal AI Assistant

A minimal AI assistant that lives in Slack. Built on [pi](https://github.com/badlogic/pi-mono)'s SDK, clankie gives you a personal AI teammate that runs on your machine with your credentials.

## What Can clankie Do?

- 💬 **Slack conversations** — @mention to start, then chat naturally in threads
- 🌐 **Web UI** — Browser-based chat interface with real-time streaming ([web-ui/](./web-ui/))
- 📎 **Handle attachments** — Upload images (vision models), documents, code files
- 🔄 **Session management** — Switch between conversations with `/switch`, `/sessions`, `/new` commands
- 🔌 **pi ecosystem** — Works with all pi extensions, skills, and prompt templates
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

**Don't have Node.js?** Install via [mise](https://mise.jdx.dev) (recommended) or [nvm](https://github.com/nvm-sh/nvm).

### 2. Quick Install via npm

```bash
npm install -g clankie
```

This installs clankie globally. Now `clankie` is available from anywhere.

### 3. Or: Install from Source

```bash
git clone https://github.com/thiagovarela/clankie
cd clankie
npm install
npm link
```

Now `clankie` is available from anywhere. If you skip `npm link`, use `bun src/cli.ts` (dev) or `node dist/cli.js` (built) instead of `clankie`.

**Note:** Bun bundles TypeScript code into JavaScript that runs on Node.js v18+.

## Slack Setup

### Step 1: Create Slack App from Manifest

1. Go to **https://api.slack.com/apps**
2. Click **Create New App** → **From an app manifest**
3. Select your workspace and click **Next**
4. Choose **YAML** tab and paste the contents of [`slack-app-manifest.yaml`](./slack-app-manifest.yaml)
5. Click **Next** → Review the summary → Click **Create**

### Step 2: Generate App Token (for Socket Mode)

1. Go to **Basic Information** (in the sidebar)
2. Scroll to **App-Level Tokens** → Click **Generate Token and Scopes**
3. Name: `clankie-socket`
4. Click **Add Scope** → Select `connections:write`
5. Click **Generate**
6. **Copy the token** (starts with `xapp-`) — you'll need this for config

### Step 3: Install App to Workspace

1. Go to **Install App** (in the sidebar)
2. Click **Install to Workspace**
3. Review permissions and click **Allow**
4. **Copy the Bot Token** (starts with `xoxb-`) — you'll need this for config

### Step 4: Get Your Slack User ID

1. In Slack, click your profile picture → **View profile**
2. Click the three dots (**⋯**) → **Copy member ID**
3. Save this ID (looks like `U01ABC23DEF`)

### Step 5: Configure clankie

```bash
clankie config set channels.slack.appToken "xapp-1-A0AG6UWU92B-..."
clankie config set channels.slack.botToken "xoxb-10594563095936-..."
clankie config set channels.slack.allowFrom '["U01ABC23DEF"]'
```

Replace:
- `xapp-...` with your App Token from Step 2
- `xoxb-...` with your Bot Token from Step 3
- `U01ABC23DEF` with your user ID from Step 4

### Step 6: Authenticate with AI Provider

```bash
clankie login
```

Choose your provider (Anthropic, OpenAI, etc.) and authenticate. Credentials are stored securely in `~/.clankie/auth.json`.

### Step 7: Start clankie

```bash
clankie start
```

You should see:
```
[daemon] Starting clankie daemon (pid 12345)...
[daemon] Workspace: /Users/you/.clankie/workspace
[daemon] Channels: slack
[slack] Connected as @clankie (U01XYZ...)
[daemon] Ready. Waiting for messages...
```

### Step 8: Test in Slack

1. **Invite the bot to a channel**: Type `/invite @clankie` in any channel
2. **@mention it**: `@clankie hello!`
3. Bot creates a thread and replies
4. **Continue the conversation** (no more @mentions needed): `what's 2+2?`
5. Bot responds in the same thread

🎉 **You're all set!**

## Using clankie

### In Slack

#### Start a Conversation

@mention the bot in any channel:
```
Channel: #general
You: @clankie what files are in my workspace?
  Thread 🧵
  Bot: Here are the files...
  You: can you summarize README.md?
  Bot: Here's a summary...
```

After the first @mention, the bot responds to all your messages in that thread automatically. Threads remain active across daemon restarts for 7 days.

#### Direct Messages

Just message the bot directly — no @mention needed:
```
DM with @clankie
You: analyze this code [uploads file]
Bot: Sure! Here's what I found...
You: can you summarize it?
Bot: Here's a summary...
```

#### Share Files

Upload files directly in a conversation:
```
You: @clankie review this screenshot
[uploads image.png]
Bot: I can see... [describes image with vision model]
```

The bot can read images (with vision models), documents, code files, etc.

#### Session Management (Slash Commands)

Manage multiple conversations in the same channel:

```
/switch <name>    Switch to a different session
/sessions         List all sessions
/new              Start a fresh session (clears context)
```

**Example:**
```
You: /switch coding
Bot: 💬 Switched to session "coding"
     Use /sessions to see all sessions.

You: /sessions
Bot: 📋 Available sessions:
     • default
     • coding ✓ (active)
     
     Switch with: /switch <name>
```

Each session maintains its own conversation history. Sessions persist across daemon restarts.

### CLI Commands

Even though clankie lives in Slack, you also have CLI access:

```bash
# Interactive chat session (local terminal, uses pi's TUI)
clankie chat

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

# Get config path
clankie config path

# Set a config value
clankie config set agent.model.primary "anthropic/claude-sonnet-4-5"
```

## Configuration

Config file: `~/.clankie/clankie.json` (JSON5 format — comments and trailing commas allowed)

The daemon watches the config file and automatically restarts when changes are detected.

### Common Settings

```bash
# Slack credentials
clankie config set channels.slack.appToken "xapp-..."
clankie config set channels.slack.botToken "xoxb-..."
clankie config set channels.slack.allowFrom '["U12345678"]'

# Restrict to specific channels (optional)
clankie config set channels.slack.allowedChannelIds '["C01ABC123", "C02DEF456"]'

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
| `channels.slack.appToken` | Socket Mode app token | `"xapp-..."` |
| `channels.slack.botToken` | Bot token for API calls | `"xoxb-..."` |
| `channels.slack.allowFrom` | Allowed user IDs (array) | `["U12345678"]` |
| `channels.slack.allowedChannelIds` | Allowed channel IDs (array, empty = all) | `["C01ABC123"]` |
| `channels.slack.enabled` | Enable/disable Slack channel | `true` (default) |

**Note:** The daemon automatically restarts when you change `~/.clankie/clankie.json`.

## Running as a Service

Instead of running `clankie start` manually, you can install clankie as a system service that starts automatically on boot.

### Install Service

```bash
clankie daemon install
```

This installs:
- **macOS**: launchd agent (`~/Library/LaunchAgents/ai.clankie.daemon.plist`)
- **Linux**: systemd user service (`~/.config/systemd/user/clankie.service`)

The daemon starts immediately and runs on boot.

### Manage Service

```bash
# Check service status
clankie daemon status

# View logs
clankie daemon logs

# Uninstall service
clankie daemon uninstall
```

Logs are stored in `~/.clankie/logs/daemon.log`.

## Development

```bash
# Run directly with Bun (no build step)
bun src/cli.ts chat
bun src/cli.ts send "hello"

# Or use bun scripts
bun run dev chat
bun run dev send "hello"

# Build for production
bun run build        # Bundles TypeScript → JavaScript for Node.js

# Code quality checks
bun run check        # Run linter
bun run check:fix    # Auto-fix issues
bun run format       # Format code
```

## Troubleshooting

### Bot doesn't respond in threads

**Problem**: Bot replies to @mentions but ignores subsequent messages in the thread.

**Solution**: Make sure you added the `message.channels` event subscription and `channels:read` scope to your Slack app. Then reinstall the app to your workspace.

### "No channels configured" error

**Problem**: `clankie start` fails with "No channels configured".

**Solution**: Configure Slack credentials:
```bash
clankie config set channels.slack.appToken "xapp-..."
clankie config set channels.slack.botToken "xoxb-..."
clankie config set channels.slack.allowFrom '["U12345678"]'
```

### Bot responds to everyone

**Problem**: Bot responds to all users, not just you.

**Solution**: Set `allowFrom` to only include your user ID:
```bash
clankie config get channels.slack.allowFrom
clankie config set channels.slack.allowFrom '["U12345678"]'
```

### Daemon won't start after reboot

**Problem**: Daemon doesn't auto-start after reboot (when installed as service).

**Solution**: Check service status:
```bash
clankie daemon status
clankie daemon logs
```

If the service isn't running, reinstall:
```bash
clankie daemon uninstall
clankie daemon install
```

## How It Works

clankie is a **thin wrapper around pi**, not a replacement. It reuses the entire pi ecosystem:
- Extensions, skills, and prompt templates just work
- Same agent runtime, same resource loaders
- Authentication shared with `pi` CLI

The architecture:
1. **Slack channel** connects via Socket Mode (no public URL needed)
2. **Daemon** routes messages to persistent agent sessions (one per chat)
3. **Agent** uses pi's SDK with full tool access (read/write files, run commands, etc.)
4. **Sessions** persist across restarts, stored in `~/.clankie/sessions/`

## Credits

Built on [pi](https://github.com/badlogic/pi-mono) by [@badlogic](https://github.com/badlogic).

Inspired by [OpenClaw](https://github.com/badlogic/openclaw) and [mom](https://github.com/badlogic/pi-mono/tree/main/packages/mom).

## License

MIT
