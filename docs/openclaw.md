# 🦞 OpenClaw — Personal AI Assistant

**Repository:** [openclaw/openclaw](https://github.com/openclaw/openclaw)
**Website:** https://openclaw.ai
**Language:** TypeScript
**License:** MIT
**Stars:** ~213K ⭐ | **Forks:** ~40K
**Created:** November 24, 2025
**Tagline:** *"Your own personal AI assistant. Any OS. Any Platform. The lobster way. 🦞"*

## What is it?

OpenClaw is a **self-hosted, local-first personal AI assistant** you run on your own devices. It acts as a unified control plane (Gateway) that connects to all the messaging channels you already use and routes them to an AI agent.

## Key Features

- **Multi-channel inbox** — WhatsApp, Telegram, Slack, Discord, Google Chat, Signal, iMessage (via BlueBubbles), Microsoft Teams, Matrix, Zalo, WebChat, and more
- **Local-first Gateway** — a WebSocket control plane (`ws://127.0.0.1:18789`) managing sessions, channels, tools, and events
- **Voice Wake + Talk Mode** — always-on speech on macOS/iOS/Android with ElevenLabs
- **Live Canvas** — agent-driven visual workspace with A2UI
- **Browser control** — dedicated Chrome/Chromium automation (snapshots, actions, uploads)
- **Skills platform** — bundled, managed, and workspace skills (extensible)
- **Cron, webhooks, Gmail Pub/Sub** — automation built in
- **Companion apps** — macOS menu bar app, iOS node, Android node
- **Multi-agent routing** — route channels/accounts to isolated agents with per-agent sessions
- **Security** — DM pairing by default (untrusted senders get a pairing code), allowlists, `openclaw doctor` for config auditing

## Installation

Requires **Node ≥ 22**. Works with npm, pnpm, or bun.

```bash
npm install -g openclaw@latest
openclaw onboard --install-daemon
```

The onboarding wizard (`openclaw onboard`) walks you through setting up the gateway, workspace, channels, and skills.

## Recommended Model

Anthropic Pro/Max (Claude Opus 4.6) for long-context strength and prompt-injection resistance, though any model is supported (OpenAI, etc.).

## History / Former Names

The project was previously known as **Clawdbot** → **Moltbot** → **OpenClaw** (the current name).

## Architecture

```
WhatsApp / Telegram / Slack / Discord / Signal / iMessage / Teams / ...
               │
               ▼
       ┌───────────────┐
       │    Gateway     │  (WS control plane)
       │ 127.0.0.1:18789│
       └───────┬───────┘
               ├─ Pi agent (RPC)
               ├─ CLI (openclaw …)
               ├─ WebChat UI
               ├─ macOS app
               └─ iOS / Android nodes
```

## Ecosystem

| Project | Description |
|---|---|
| **openclaw/clawhub** | Skill directory for OpenClaw |
| **HKUDS/nanobot** | Ultra-lightweight OpenClaw alternative |
| **VoltAgent/awesome-openclaw-skills** | Curated skill collection |
| **hesamsheikh/awesome-openclaw-usecases** | Community use cases |
| **cloudflare/moltworker** | Run OpenClaw on Cloudflare Workers |
| **HKUDS/ClawWork** | "OpenClaw as Your AI Coworker" |
| **mnfst/manifest** | Real-time cost observability for OpenClaw agents |
| **BlockRunAI/ClawRouter** | Agent-native LLM router for OpenClaw |
| **qwibitai/nanoclaw** | Lightweight containerized alternative |

## Links

- [Docs](https://docs.openclaw.ai)
- [Getting Started](https://docs.openclaw.ai/start/getting-started)
- [Discord](https://discord.gg/clawd)
- [DeepWiki](https://deepwiki.com/openclaw/openclaw)
