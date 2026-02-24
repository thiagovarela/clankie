# clankie — your personal AI assistant

**clankie** is a minimal, focused personal AI assistant that lives in Slack. It's built on [pi](https://github.com/badlogic/pi-mono)'s SDK and reuses the entire pi ecosystem (extensions, skills, prompt templates).

## What is clankie?

Think of clankie as your personal AI teammate that:
- ✅ Lives in Slack (no extra apps to install)
- ✅ Has continuous conversations in threads (no @mentioning after first message)
- ✅ Runs on your machine with your credentials (privacy by default)
- ✅ Uses the same extensions and skills as the `pi` CLI
- ✅ Remembers context across conversations

## Quick Start

1. **Install**:
   ```bash
   git clone https://github.com/thiagovarela/lil
   cd lil
   bun install
   ```

2. **Authenticate**:
   ```bash
   bun run packages/clankie/src/cli.ts login
   ```

3. **Set up Slack** (see [Setup Guide](packages/clankie/README.md#slack-setup)):
   - Create Slack app with Socket Mode
   - Configure credentials
   - Start daemon

4. **Chat with clankie in Slack**!

## Documentation

See [packages/clankie/README.md](packages/clankie/README.md) for the complete user guide including:
- Slack app setup (step-by-step)
- Configuration
- Personas (customize clankie's personality per use case)
- Memory system
- CLI commands

## Architecture

- `packages/clankie/` — CLI daemon + agent runtime (Slack integration)
- Built on pi's SDK, agent core, and resource loaders
- Slack-only by design (focused, simple)

## Requirements

- [Bun](https://bun.sh) runtime
- Slack workspace (free tier works)
- AI provider API key (Anthropic, OpenAI, etc.)

## License

MIT
