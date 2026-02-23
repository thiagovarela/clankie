# lil

A minimal personal AI assistant built on [pi](https://github.com/badlogic/pi-mono)'s SDK, agent runtime, and extension system.

> **Where OpenClaw is a full-featured multi-channel assistant with 15+ integrations** —
> **lil starts with one thing done well**: a single, powerful agent session that reuses the entire pi ecosystem.

## Philosophy

lil is a thin wrapper around pi, not a replacement. Everything in the pi ecosystem works out of the box:

- Extensions from `~/.pi/agent/extensions/` and `.pi/extensions/`
- Skills from `~/.agents/skills/`, `~/.pi/agent/skills/`, and project `.pi/skills/`
- Prompt templates from `~/.pi/agent/prompts/`
- Context files (`AGENTS.md` walking up from cwd)
- `pi install` packages — just works

## Usage

```bash
# Interactive chat session (full pi TUI)
lil chat

# Send a message and get a response (non-interactive)
lil send "What files are in the current directory?"

# Shorthand — no subcommand needed
lil "Refactor this function to be async"

# Authenticate with your AI provider (uses pi's login dialog)
lil login

# Configuration
lil config show
lil config set model gpt-4o
lil config set provider openai
```

## Installation

Requires [Bun](https://bun.sh).

```bash
git clone https://github.com/thiagovarela/lil
cd lil
bun install
bun link --cwd packages/lil   # installs `lil` globally via ~/.bun/bin/lil
```

Then just use `lil` from anywhere.

## Authentication

lil uses pi's `AuthStorage` at `~/.pi/agent/auth.json` — the same credentials as the `pi` CLI. You authenticate once and both tools share it.

Options:
- `lil login` — Opens pi's interactive login dialog (OAuth or API key)
- Environment variables: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, etc.

## Configuration

Config lives at `~/.lil/config.json` (permissions: `0600`).

| Key | Default | Description |
|-----|---------|-------------|
| `provider` | (from pi settings) | Provider name: `openai`, `anthropic`, `google` |
| `model` | (from pi settings) | Model ID: `gpt-4o`, `claude-opus-4-5`, etc. |
| `agentDir` | `~/.pi/agent` | Override pi's agent directory |
| `workspace` | `process.cwd()` | Agent's working directory |

## Web UI Setup

lil ships with a web interface powered by pi-web-ui components.

### Build the web app

```bash
# from project root
bun install
bun run web:build
```

### Configure + run

```bash
lil config set web.enabled true
lil config set web.host "127.0.0.1"
lil config set web.port 3333
lil start
```

Then open: `http://127.0.0.1:3333`

Notes:
- Sessions are server-backed (`~/.lil/sessions/`), shared with other channels
- Uploads go through `POST /api/upload` and are stored under `~/.lil/uploads/`
- WebSocket/API auth uses a token stored in `~/.lil/lil.json` (`web.token`)

## Telegram Setup

lil includes a Telegram channel for 24/7 access to your agent via Telegram.

### Basic Setup

1. **Create a bot** via [@BotFather](https://t.me/BotFather):
   ```
   /newbot
   ```
   Follow the prompts. You'll get a bot token like `123456:ABC-DEF...`

2. **Get your Telegram user ID**:
   - Message [@userinfobot](https://t.me/userinfobot)
   - It will reply with your numeric user ID (e.g., `123456789`)

3. **Configure lil**:
   ```bash
   lil config set channels.telegram.botToken "123456:ABC-DEF..."
   lil config set channels.telegram.allowFrom [123456789]
   ```

4. **Start the daemon**:
   ```bash
   lil start
   ```

5. **Message your bot** on Telegram. Only users in the `allowFrom` list can interact with it.

   When you start the daemon, bot commands are automatically registered. Type `/` in Telegram to see available commands.

### Multi-Conversation Support

Manage multiple separate conversations in a single Telegram chat using named sessions:

**Commands:**

- **`/switch <name>`** — Switch to a different conversation
  ```
  You: /switch coding
  Bot: 💬 Switched to session "coding"
  
  You: Let's review this function...
  Bot: [responds with coding context]
  
  You: /switch groceries
  Bot: 💬 Switched to session "groceries"
  
  You: Add milk to the list
  Bot: [completely separate context, no knowledge of code]
  ```

- **`/sessions`** — List all your sessions
  ```
  You: /sessions
  Bot: 📋 Available sessions:
       • default
       • coding ✓ (active)
       • groceries
       • ideas
       
       Switch with: /switch <name>
  ```

- **`/new`** — Clear the current session's context
  ```
  You: /new
  Bot: ✨ Started a fresh session in "coding". Previous context cleared.
  ```

**How it works:**

1. Each session name gets its own isolated agent context
2. Sessions persist across restarts (saved to disk)
3. Switch between topics with `/switch <name>`
4. Session names can be anything: `coding`, `work`, `groceries`, `project-x`, etc.

**Example workflow:**

```
You: /switch work
Bot: 💬 Switched to session "work"

You: Draft an email to the team about the deadline
Bot: [drafts email with work context]

You: /switch personal
Bot: 💬 Switched to session "personal"

You: Plan my weekend trip
Bot: [completely fresh context, no knowledge of work stuff]

You: /switch work
Bot: 💬 Switched to session "work"

You: Now finish that email
Bot: [remembers the email draft from earlier]
```

### Forum Topics (Advanced: Supergroups Only)

If you create a **Telegram supergroup** and enable forum topics, each topic automatically gets its own session. This provides visual separation like Discord channels, but requires more setup:

1. Create a Telegram **supergroup** (not a regular group or DM)
2. Enable topics: Group Settings → Topics → Enable
3. Add your bot to the group
4. Each topic = separate conversation

For most users, **using `/switch` in a regular DM is simpler**.

## Security

lil ships with a built-in security extension that:

- **Blocks dangerous bash commands**: `rm -rf`, `sudo`, `curl | sh`, `eval`, network exfiltration patterns
- **Protects sensitive write paths**: `~/.ssh/`, `~/.aws/`, `~/.lil/`, `.env` files, system dirs
- **Blocks reads of credential files**: SSH keys, `.env`, `~/.lil/config.json`, AWS credentials
- **Redacts sensitive output**: PEM private keys, AWS access keys, OpenAI/Anthropic/GitHub tokens

See [docs/security.md](docs/security.md) for the full threat model.

## Development

```bash
# Run directly with Bun (no compile step)
bun run src/cli.ts chat
bun run src/cli.ts send "hello"

# Build single-file binary
bun run build

# Build all targets
bun run build:all
```

## Roadmap

- **Milestone 0** ✅ — Core agent loop, CLI (`send`, `chat`, `login`), security extension, `bun link` global install
- **Milestone 1** ✅ — Telegram channel (long polling, allowlist, daemon mode)
- **Milestone 1.5** ✅ — Multi-conversation support (`/switch`, `/sessions`, supergroup forum topics)
- **Milestone 2** — Memory & persistent context
- **Milestone 3** — Web UI channel (pi-web-ui)
- **Milestone 4** — More channels (WhatsApp, Signal)

See [docs/plan.md](docs/plan.md) for the full plan.
