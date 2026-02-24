# lil — Personal AI Assistant

A minimal, focused AI assistant that lives in Slack. Built on [pi](https://github.com/badlogic/pi-mono)'s SDK, lil gives you a personal AI teammate that runs on your machine with your credentials.

## What Can lil Do?

- 💬 **Natural conversations in Slack threads** — @mention once, then chat naturally
- 🧠 **Remember things** — Built-in memory system (facts, preferences, project context)
- 🎭 **Multiple personas** — Different personalities for different contexts (work, coding, personal)
- 🛠️ **Use tools** — Read/write files, run bash commands, search memory
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
bun link --cwd packages/lil
```

Now `lil` is available from anywhere. If you skip this, use `bun run packages/lil/src/cli.ts` instead of `lil`.

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

### Step 5: Configure lil

```bash
lil config set channels.slack.appToken "xapp-1-A0AG6UWU92B-..."
lil config set channels.slack.botToken "xoxb-10594563095936-..."
lil config set channels.slack.allowFrom '["U01ABC23DEF"]'
```

Replace:
- `xapp-...` with your App Token from Step 2
- `xoxb-...` with your Bot Token from Step 3
- `U01ABC23DEF` with your user ID from Step 4

### Step 6: Authenticate with AI Provider

```bash
lil login
```

Choose your provider (Anthropic, OpenAI, etc.) and authenticate. Credentials are stored securely in `~/.clankie/auth.json`.

### Step 7: Start lil

```bash
lil start
```

You should see:
```
[daemon] Starting lil daemon (pid 12345)...
[daemon] Workspace: /Users/you/.clankie/workspace
[daemon] Channels: slack
[slack] Connected as @lil (U01XYZ...)
[daemon] Ready. Waiting for messages...
```

### Step 8: Test in Slack

1. **Invite the bot to a channel**: Type `/invite @lil` in any channel
2. **@mention it**: `@lil hello!`
3. Bot creates a thread and replies
4. **Continue the conversation** (no more @mentions needed): `what's 2+2?`
5. Bot responds in the same thread

🎉 **You're all set!**

## Using lil

### In Slack

#### Start a Conversation

@mention the bot anywhere:
```
Channel: #general
You: @lil what's the weather in SF?
  Thread 🧵
  Bot: It's 68°F and sunny
  You: and tomorrow?
  Bot: Tomorrow will be 72°F
```

After the first @mention, the bot responds to all your messages in that thread automatically.

#### Direct Messages

Just message the bot directly — no @mention needed:
```
DM with @lil
You: analyze this data [uploads file]
Bot: Sure! Here's what I found...
You: can you summarize it?
Bot: Here's a summary...
```

#### Share Files

Upload files directly in a conversation:
```
You: @lil review this code
[uploads code.py]
Bot: I'll analyze it...
[provides feedback]
```

The bot can read images (with vision models), documents, code files, etc.

### CLI Commands

Even though lil lives in Slack, you also have CLI access:

```bash
# Interactive chat session (local terminal, uses pi's TUI)
lil chat

# Send a one-off message (prints response and exits)
lil send "What files are in the current directory?"

# Shorthand (no subcommand needed)
lil "Summarize recent git commits"

# Check daemon status
lil status

# Stop daemon
lil stop

# View configuration
lil config show

# Set a config value
lil config set agent.model.primary "anthropic/claude-sonnet-4-5"
```

## Configuration

Config file: `~/.clankie/clankie.json` (JSON5 format — comments and trailing commas allowed)

### Common Settings

```bash
# Slack credentials
lil config set channels.slack.appToken "xapp-..."
lil config set channels.slack.botToken "xoxb-..."
lil config set channels.slack.allowFrom '["U12345678"]'

# AI model
lil config set agent.model.primary "anthropic/claude-sonnet-4-5"
lil config set agent.model.fallbacks '["openai/gpt-4o"]'

# Default persona
lil config set agent.persona "default"

# Workspace (where agent works)
lil config set agent.workspace "~/projects"
```

### Config Paths

| Path | Description | Example |
|------|-------------|---------|
| `agent.persona` | Default persona name | `"default"`, `"coding"`, `"work"` |
| `agent.workspace` | Agent working directory | `"~/projects"` |
| `agent.model.primary` | Primary AI model | `"anthropic/claude-sonnet-4-5"` |
| `agent.model.fallbacks` | Fallback models (array) | `["openai/gpt-4o"]` |
| `channels.slack.appToken` | Socket Mode app token | `"xapp-..."` |
| `channels.slack.botToken` | Bot token for API calls | `"xoxb-..."` |
| `channels.slack.allowFrom` | Allowed user IDs (array) | `["U12345678"]` |
| `channels.slack.persona` | Override persona for Slack | `"work"` |

## Personas

Personas let you customize lil's personality, knowledge, and behavior for different contexts. Each persona is a set of markdown files that shape the system prompt.

### Built-in Persona: "default"

lil ships with a minimal default persona. You can customize it:

```bash
# View persona files
lil persona show default

# Edit persona
lil persona edit default
```

### Create a New Persona

```bash
# Create a new persona
lil persona create coding

# Edit its files
lil persona edit coding
```

This creates `~/.clankie/personas/coding/` with these files:

#### `identity.md` — Who the assistant is
```markdown
# Identity

You are **lil (coding)**, a personal AI coding assistant.

- You're an expert in software engineering
- You prefer working solutions over perfect ones
- You're concise but thorough with explanations
- You use modern best practices
```

#### `instructions.md` — How to behave
```markdown
# Instructions

- Write clean, readable code with comments
- Explain complex concepts simply
- Run tests before claiming something works
- Use git for version control
- Ask for clarification on ambiguous requirements
```

#### `knowledge.md` — User context
```markdown
# User Knowledge

- Name: Thiago
- Stack: TypeScript, Bun, React
- Current project: lil (AI assistant)
- Prefers: Functional programming, immutability
```

#### `persona.json` — Model override (optional)
```json
{
  // Override the global model for this persona
  "model": "anthropic/claude-sonnet-4-5"
}
```

### Use a Persona

```bash
# Set as default
lil config set agent.persona "coding"

# Use for a specific session
lil chat --persona coding
lil send --persona coding "Review this code"

# Use for Slack only
lil config set channels.slack.persona "work"
```

### Manage Personas

```bash
# List all personas
lil persona

# Show persona files
lil persona show coding

# Edit persona
lil persona edit coding

# Edit specific file
lil persona edit coding identity.md

# Get persona directory path
lil persona path coding

# Remove persona
lil persona remove coding
```

## Memory

lil has a built-in memory system powered by SQLite FTS5 (full-text search). The bot can remember facts, preferences, and context across conversations.

### How It Works

When you tell lil to remember something:
```
You: @lil remember my timezone is PST
Bot: Got it, I'll remember that.
```

Behind the scenes, lil uses the `remember` tool (provided by the persona extension) to store this in `~/.clankie/memory.db`. Later:

```
You: @lil what time is it for me?
Bot: Since you're in PST, it's currently 3:45 PM.
```

### Memory Categories

Memories are automatically categorized:
- **preference** — User preferences, settings
- **fact** — Objective facts about the user, project, etc.
- **context** — Project context, working memory
- **note** — General notes, ideas

### CLI Commands

```bash
# Show memory stats
lil memory

# Search memories
lil memory search "timezone"

# List all memories (or by category)
lil memory list
lil memory list preference

# Export core memories as JSON
lil memory export > memories.json

# Forget a specific memory
lil memory forget "timezone"
```

### How lil Uses Memory

The persona extension automatically:
1. **Injects relevant memories** into the system prompt based on the current conversation
2. **Uses FTS5 search** to find contextually relevant memories
3. **Provides the `remember` tool** so lil can store new information

You don't need to do anything special — just tell lil to remember things naturally.

## Running as a Service

Instead of running `lil start` manually, you can install lil as a system service that starts automatically on boot.

### Install Service

```bash
lil daemon install
```

This installs:
- **macOS**: launchd agent (`~/Library/LaunchAgents/ai.clankie.daemon.plist`)
- **Linux**: systemd user service (`~/.config/systemd/user/lil.service`)

The daemon starts immediately and runs on boot.

### Manage Service

```bash
# Check service status
lil daemon status

# View logs
lil daemon logs

# Uninstall service
lil daemon uninstall
```

Logs are stored in `~/.clankie/logs/daemon.log`.

## Security

lil includes a built-in security extension that protects against common mistakes:

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

**Don't give lil credentials to production systems or sensitive environments.**

For the full threat model, see `docs/security.md` (if you've added this).

## Advanced Features

### Cron Jobs (Scheduled Tasks)

lil can schedule periodic tasks (not yet documented — coming soon).

### Heartbeat

lil can check `~/.clankie/heartbeat.md` periodically and take proactive actions (not yet documented — coming soon).

### pi Extensions

lil works with all pi extensions out of the box. Extensions are loaded from:
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

**Problem**: `lil start` fails with "No channels configured".

**Solution**: Configure Slack credentials:
```bash
lil config set channels.slack.appToken "xapp-..."
lil config set channels.slack.botToken "xoxb-..."
lil config set channels.slack.allowFrom '["U12345678"]'
```

### Bot responds to everyone

**Problem**: Bot responds to all users, not just you.

**Solution**: Set `allowFrom` to only include your user ID:
```bash
lil config get channels.slack.allowFrom
lil config set channels.slack.allowFrom '["U12345678"]'
```

### "Failed to run git: fatal: 'main' is already used by worktree"

**Problem**: Git worktree conflicts when trying to merge.

**Solution**: Merge from the main worktree directory, not a branch worktree.

### Daemon won't start after reboot

**Problem**: Daemon doesn't auto-start after reboot (when installed as service).

**Solution**: Check service status:
```bash
lil daemon status
lil daemon logs
```

If the service isn't running, reinstall:
```bash
lil daemon uninstall
lil daemon install
```

## Development

```bash
# Run directly with Bun (no build step)
bun run packages/lil/src/cli.ts chat
bun run packages/lil/src/cli.ts send "hello"

# Code quality checks
bun run check        # Run linter
bun run check:fix    # Auto-fix issues
bun run format       # Format code
```

## Philosophy

lil is a **thin wrapper around pi**, not a replacement. It reuses the entire pi ecosystem:
- Extensions, skills, and prompt templates just work
- Same agent runtime, same resource loaders
- Authentication shared with `pi` CLI

Where other assistants try to be everything, lil focuses on **one thing done well**: giving you a personal AI teammate in Slack that reuses proven infrastructure.

## Credits

Built on [pi](https://github.com/badlogic/pi-mono) by [@badlogic](https://github.com/badlogic).

Inspired by [OpenClaw](https://github.com/badlogic/openclaw) and [mom](https://github.com/badlogic/pi-mono/tree/main/packages/mom).

## License

MIT
