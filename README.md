# clankie — Personal AI Assistant

A minimal, focused AI assistant that lives in Slack. Built on [pi](https://github.com/badlogic/pi-mono)'s SDK, clankie gives you a personal AI teammate that runs on your machine with your credentials.

## What Can clankie Do?

- 💬 **Natural conversations in Slack threads** — @mention once, then chat naturally
- 🛠️ **Use tools** — Read/write files, run bash commands, and more
- 🔌 **pi ecosystem** — Works with all pi extensions, skills, and prompt templates
- 🔒 **Privacy-first** — Runs on your machine, your credentials, your data

## Installation

### 1. Install Dependencies

Requires [Bun](https://bun.sh):

```bash
# macOS/Linux
curl -fsSL https://bun.sh/install | bash

# Verify
bun --version
```

### 2. Clone and Install

```bash
git clone https://github.com/thiagovarela/lil
cd lil
bun install
```

### 3. Link Globally (Optional)

```bash
bun link
```

Now `clankie` is available from anywhere. If you skip this, use `bun run src/cli.ts` instead of `clankie`.

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

@mention the bot anywhere:
```
Channel: #general
You: @clankie what's the weather in SF?
  Thread 🧵
  Bot: It's 68°F and sunny
  You: and tomorrow?
  Bot: Tomorrow will be 72°F
```

After the first @mention, the bot responds to all your messages in that thread automatically.

#### Direct Messages

Just message the bot directly — no @mention needed:
```
DM with @clankie
You: analyze this data [uploads file]
Bot: Sure! Here's what I found...
You: can you summarize it?
Bot: Here's a summary...
```

#### Share Files

Upload files directly in a conversation:
```
You: @clankie review this code
[uploads code.py]
Bot: I'll analyze it...
[provides feedback]
```

The bot can read images (with vision models), documents, code files, etc.

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

# Set a config value
clankie config set agent.model.primary "anthropic/claude-sonnet-4-5"
```

## Configuration

Config file: `~/.clankie/clankie.json` (JSON5 format — comments and trailing commas allowed)

### Common Settings

```bash
# Slack credentials
clankie config set channels.slack.appToken "xapp-..."
clankie config set channels.slack.botToken "xoxb-..."
clankie config set channels.slack.allowFrom '["U12345678"]'

# AI model
clankie config set agent.model.primary "anthropic/claude-sonnet-4-5"
clankie config set agent.model.fallbacks '["openai/gpt-4o"]'

# Workspace (where agent works)
clankie config set agent.workspace "~/projects"
```

### Config Paths

| Path | Description | Example |
|------|-------------|---------|
| `agent.workspace` | Agent working directory | `"~/projects"` |
| `agent.model.primary` | Primary AI model | `"anthropic/claude-sonnet-4-5"` |
| `agent.model.fallbacks` | Fallback models (array) | `["openai/gpt-4o"]` |
| `channels.slack.appToken` | Socket Mode app token | `"xapp-..."` |
| `channels.slack.botToken` | Bot token for API calls | `"xoxb-..."` |
| `channels.slack.allowFrom` | Allowed user IDs (array) | `["U12345678"]` |


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

## Security

clankie includes a built-in security extension that protects against common mistakes:

### What It Blocks

- **Dangerous bash commands**: `rm -rf /`, `sudo`, `curl | sh`, `eval`
- **Sensitive file writes**: `~/.ssh/`, `~/.aws/`, `.env` files, system directories
- **Credential reads**: SSH keys, AWS credentials, API keys, `~/.clankie/auth.json`
- **Network exfiltration**: Patterns that suggest data theft

### What It Redacts

When the agent reads files, it automatically redacts:
- Private keys (PEM, SSH)
- API keys (OpenAI, Anthropic, AWS, GitHub, etc.)
- Tokens and secrets

The agent sees `[REDACTED:...]` instead of the actual value.

### Limitations

⚠️ **The security extension is not a sandbox.** It's a safety net for common mistakes, not a security boundary. The agent runs with your user permissions and can still:
- Write to most files in your home directory
- Run most bash commands
- Access the internet

**Don't give clankie credentials to production systems or sensitive environments.**

For the full threat model, see `docs/security.md` (if you've added this).

## Advanced Features

### pi Extensions

clankie works with all pi extensions out of the box. Extensions are loaded from:
- `~/.pi/agent/extensions/`
- `.pi/extensions/` (in your project)

See pi's documentation for creating extensions.

### Skills

Skills are reusable CLI tools the agent can create and invoke. They're loaded from:
- `~/.agents/skills/` (global)
- `~/.pi/agent/skills/` (pi shared)
- `.pi/skills/` (project-specific)

See pi's documentation for the skills system.

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

### "Failed to run git: fatal: 'main' is already used by worktree"

**Problem**: Git worktree conflicts when trying to merge.

**Solution**: Merge from the main worktree directory, not a branch worktree.

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

## Development

```bash
# Run directly with Bun (no build step)
bun run src/cli.ts chat
bun run src/cli.ts send "hello"

# Code quality checks
bun run check        # Run linter
bun run check:fix    # Auto-fix issues
bun run format       # Format code
```

## Philosophy

clankie is a **thin wrapper around pi**, not a replacement. It reuses the entire pi ecosystem:
- Extensions, skills, and prompt templates just work
- Same agent runtime, same resource loaders
- Authentication shared with `pi` CLI

Where other assistants try to be everything, clankie focuses on **one thing done well**: giving you a personal AI teammate in Slack that reuses proven infrastructure.

## Credits

Built on [pi](https://github.com/badlogic/pi-mono) by [@badlogic](https://github.com/badlogic).

Inspired by [OpenClaw](https://github.com/badlogic/openclaw) and [mom](https://github.com/badlogic/pi-mono/tree/main/packages/mom).

## License

MIT
