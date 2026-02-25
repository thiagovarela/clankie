# clankie — Project Plan

**clankie** is a minimal personal AI assistant inspired by [OpenClaw](./openclaw.md), built on top of [pi](https://github.com/badlogic/pi-mono)'s SDK, agent runtime, and extension system.

## Philosophy

Where OpenClaw is a full-featured multi-channel assistant with 15+ messaging integrations, voice, canvas, companion apps, and a Gateway control plane — **clankie starts with one thing done well**: a single messaging channel backed by pi's agent, using your existing OpenAI Codex subscription.

We grow from there, only when needed.

## Milestone 0 — Foundation

### Goal
A running clankie process that receives a message, routes it to pi's agent (using OpenAI Codex subscription auth), and returns a response. No UI beyond what pi already provides. No channels yet — just the core loop.

### What we build
1. **Project scaffolding**
   - TypeScript + Bun runtime
   - `package.json` with `@mariozechner/pi-coding-agent` and `grammy` as dependencies
   - `tsconfig.json`
   - Basic `src/` structure

2. **Agent session wrapper** (`src/agent.ts`)
   - Uses pi's SDK (`createAgentSession`) to create a session
   - Configures OpenAI Codex as the model provider (via pi's `/login` OAuth flow or `OPENAI_API_KEY`)
   - In-memory session by default, persistent session optional
   - Exposes a simple `send(message: string) → Promise<string>` interface

3. **CLI entry point** (`src/cli.ts`)
   - `clankie send "message"` — send a message, print response, exit (uses pi's print mode under the hood)
   - `clankie chat` — interactive mode (delegates to pi's interactive mode directly)
   - `clankie login` — authenticate with OpenAI Codex subscription

4. **Configuration** (`src/config.ts`)
   - `~/.clankie/config.json` — provider, model, default channel (future)
   - Delegates auth storage to pi's `AuthStorage`
   - Minimal: just enough to pick the model and store preferences

### What we reuse from pi (via `DefaultResourceLoader` — full discovery)
- `createAgentSession` + `AgentSession` — the full agent runtime
- `DefaultResourceLoader` — **standard pi resource discovery**, not bypassed like OpenClaw does
- `AuthStorage` + `ModelRegistry` — OpenAI Codex OAuth + API key handling
- `SessionManager` — session persistence (JSONL tree format)
- `codingTools` (read, bash, edit, write) — default tool set
- **Extensions system** — `~/.pi/agent/extensions/` and project `.pi/extensions/` fully work
- **Skills system** — `~/.pi/agent/skills/`, `~/.agents/skills/`, project `.pi/skills/` all discovered
- **Prompt templates** — `~/.pi/agent/prompts/`, project `.pi/prompts/`
- **Context files** — `AGENTS.md` walking up from cwd
- **Pi packages** — any installed pi package (extensions, skills, prompts, themes) just works

### Key difference from OpenClaw
OpenClaw uses pi as a low-level runtime — it calls `createAgentSession` but provides its own
tools, system prompt, and extension loading, effectively bypassing pi's `DefaultResourceLoader`.
It has its own parallel skill system (clawhub, workspace skills) and tool system.

**clankie does the opposite**: we lean on pi's standard discovery so the entire pi extension
ecosystem works out of the box. Users can `pi install` packages, drop extensions in
`~/.pi/agent/extensions/`, add skills to `~/.agents/skills/`, and it all just loads.
clankie is a thin wrapper, not a replacement.

### What we DON'T build yet
- ❌ Gateway / control plane
- ❌ Messaging channels (WhatsApp, Telegram, etc.)
- ❌ Voice / TTS
- ❌ Multi-agent routing
- ❌ Web UI
- ❌ Companion apps
- ❌ Cron / webhooks / automation

## Milestone 1 — First Channel (Telegram)

### Goal
Receive and respond to Telegram messages via a single, always-on process.

### Why Telegram first
- Simple bot setup via [@BotFather](https://t.me/BotFather) — just a token, no QR pairing or phone linking
- Excellent [grammY](https://grammy.dev/) library (same as OpenClaw uses)
- Long polling mode works without exposing a public URL
- Rich message support (Markdown, images, files) out of the box

### What we build
1. **Telegram adapter** (`src/channels/telegram.ts`)
   - Uses [grammY](https://grammy.dev/) (same as OpenClaw)
   - Bot token from BotFather, stored in `~/.clankie/config.json`
   - Long polling (no webhook / public URL needed)
   - Receives messages → forwards to agent session → sends response back
   - Single user only (allowlist by Telegram user ID)

2. **Channel abstraction** (`src/channels/channel.ts`)
   - Simple interface: `onMessage(handler)`, `sendMessage(to, text)`
   - Telegram is the first implementation
   - Designed so WhatsApp/Signal/Discord can be added later with same interface

3. **Daemon mode** (`src/daemon.ts`)
   - `clankie start` — run as background process
   - `clankie stop` — stop the daemon
   - `clankie status` — check if running
   - Simple process management (no systemd/launchd yet)

4. **Security defaults**
   - Allowlist by Telegram user ID (you set your own ID in config)
   - Unknown senders are ignored
   - `clankie allow <telegram-user-id>` to add a user
   - Allowlist persisted in `~/.clankie/config.json`

## Milestone 2 — Memory & Context

### Goal
clankie remembers things across sessions and can be given persistent instructions.

### What we build
1. **Persistent sessions** — use pi's `SessionManager` with file persistence
2. **Context files** — `~/.clankie/AGENTS.md` for global instructions
3. **Skills** — `~/.clankie/skills/` for on-demand capabilities
4. **Extensions** — `~/.clankie/extensions/` for custom tools

## Milestone 3 — More Channels

Add channels one at a time using the channel abstraction from M1:
- WhatsApp (Baileys)
- Signal (signal-cli)
- Discord (discord.js)

## Future (if needed)
- Gateway control plane
- Web UI
- Voice
- Cron / scheduled messages
- Multi-agent routing

---

## Architecture (Milestone 0)

```
┌──────────────────────────────────┐
│        clankie CLI               │
│  clankie send / clankie chat / clankie login│
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│        Agent Session             │
│  (pi SDK: createAgentSession)    │
│                                  │
│  Model: OpenAI Codex (OAuth)     │
│  Tools: read, bash, edit, write  │
│  Sessions: in-memory / file      │
│  Extensions: ~/.clankie/extensions/  │
│  Skills: ~/.clankie/skills/          │
└──────────────────────────────────┘
```

## Architecture (Milestone 1)

```
Telegram (grammY, long polling)
       │
       ▼
┌──────────────────┐
│  Channel Adapter  │
│  onMessage()      │
│  sendMessage()    │
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────┐
│        Agent Session             │
│  (pi SDK: createAgentSession)    │
│                                  │
│  Model: OpenAI Codex (OAuth)     │
│  Tools: read, bash, edit, write  │
│  Sessions: persistent (JSONL)    │
│  Extensions: ~/.clankie/extensions/  │
│  Skills: ~/.clankie/skills/          │
└──────────────────────────────────┘
```

## Installation

### Install flow (user perspective)
```bash
# Clone the repository
git clone https://github.com/thiagovarela/lil
cd lil

# Install dependencies
bun install

# Link globally (optional)
bun link --cwd packages/clankie

# Authenticate with AI provider
clankie login

# Start chatting
clankie chat
```

### Development flow
During development, run directly with Bun (no compile step):
```bash
bun run src/cli.ts send "hello"
bun run src/cli.ts chat
```

## File Structure (Milestone 0)

```
clankie/
├── package.json
├── tsconfig.json
├── src/
│   ├── cli.ts              # CLI entry point
│   ├── agent.ts            # Pi SDK agent session wrapper
│   ├── config.ts           # Configuration management
│   └── extensions/
│       └── security.ts     # Security extension (tool blocking, path protection, redaction)
├── docs/
│   ├── plan.md             # This file
│   ├── security.md         # Security model & threat analysis
│   └── openclaw.md         # OpenClaw reference
└── README.md
```
