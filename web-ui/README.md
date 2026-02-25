# clankie Web UI

A browser-based chat interface for [clankie](../README.md), built with TanStack Start, TanStack Store, and shadcn/ui.

## Features

- 💬 **Real-time chat** with clankie's AI agent
- 📡 **WebSocket connection** to clankie's web channel
- 🎨 **Markdown rendering** for rich agent responses
- ⚡ **Streaming support** — see tokens as they arrive
- 🌙 **Dark mode** (default)
- 📦 **TanStack Store** for reactive client-side state
- 🎯 **Type-safe** RPC protocol matching clankie's WebChannel

## Setup

### 1. Enable clankie's web channel

Configure the web channel and set an auth token:

```bash
clankie config set channels.web.authToken "your-secret-token"
clankie config set channels.web.port 3100
```

### 2. Start clankie daemon

```bash
clankie start
```

You should see output like:
```
[daemon] Channels: slack, web
[web] WebSocket server listening on port 3100
[daemon] Ready. Waiting for messages...
```

### 3. Install web-ui dependencies

```bash
cd web-ui
bun install
```

### 4. Start the development server

```bash
bun dev
```

The web-ui will be available at http://localhost:3000

### 5. Connect

1. Navigate to **Settings** in the web-ui
2. Enter the auth token you configured in step 1
3. Click **Connect**
4. Go to **Chat** and start a conversation

## Development

```bash
# Start dev server (http://localhost:3000)
bun dev

# Build for production
bun build

# Preview production build
bun preview

# Lint & format
bun run check
```

## Architecture

### WebSocket Client Layer

- **`src/lib/ws-client.ts`** — Low-level WebSocket connection manager with auto-reconnect
- **`src/lib/clankie-client.ts`** — High-level RPC client implementing clankie's protocol
- **`src/lib/client-manager.ts`** — Singleton that ties the client to stores

### TanStack Stores

- **`src/stores/connection.ts`** — Connection settings (URL, auth token) and status
- **`src/stores/session.ts`** — Current agent session state (model, streaming status, etc.)
- **`src/stores/messages.ts`** — Chat message history with streaming support

### UI Components

- **`src/components/chat-messages.tsx`** — Message list with auto-scroll
- **`src/components/chat-input.tsx`** — Textarea + send button (Ctrl+Enter to send)
- **`src/components/message-bubble.tsx`** — Individual message with markdown rendering
- **`src/components/connection-status.tsx`** — Status badge in header

### Routes

- **`/`** — Main chat interface
- **`/settings`** — Connection configuration

## Known Limitations

### Browser WebSocket Auth

**Issue**: Browser WebSocket API doesn't support custom headers (like `Authorization: Bearer <token>`).

**Current workaround**: The client is designed to connect without auth headers. This will require an update to clankie's `src/channels/web.ts` to support one of:
1. Auth token in URL query parameter (`ws://localhost:3100?token=xxx`)
2. Auth token in first message after connection
3. Cookie-based auth

For now, the web-ui stores the auth token in `connectionStore` but doesn't send it during the WebSocket upgrade. **A follow-up PR to clankie is needed to enable browser-based auth.**

## Tech Stack

- **TanStack Start** — React meta-framework (SPA mode, no SSR)
- **TanStack Store** — Reactive client-side state management
- **TanStack Router** — Type-safe file-based routing
- **shadcn/ui** — UI component library (Nova style)
- **Tailwind CSS 4** — Styling with CSS variables
- **react-markdown** — Markdown rendering with GitHub Flavored Markdown
- **Lucide React** — Icon library
- **Bun** — Package manager & runtime

## License

MIT (same as parent project)
