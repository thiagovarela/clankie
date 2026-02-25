# Web UI TODOs

## Critical (blocks production use)

- [ ] **WebSocket auth**: Update clankie's `src/channels/web.ts` to support browser auth
  - Options: query param (`?token=xxx`), first message, or cookie-based
  - Browser WebSocket API can't set custom headers
  - Current implementation stores token but doesn't send it
  - **Blocked on**: clankie backend changes

## High Priority

- [ ] Error handling & user feedback
  - [ ] Toast notifications for errors (connection, send failures)
  - [ ] Retry mechanism for failed messages
  - [ ] Display agent errors from `error` events

- [ ] Session management
  - [ ] Display session name in header
  - [ ] Button to create new session
  - [ ] Session switcher (if we support multiple sessions)

- [ ] Better streaming UX
  - [ ] Show tool use events ("Running command...", "Reading file...")
  - [ ] Display tool results in a nicer format
  - [ ] Thinking blocks (already in MessageBubble, needs styling polish)

## Medium Priority

- [ ] Settings enhancements
  - [ ] Model selector (fetch available models, allow switching)
  - [ ] Thinking level toggle
  - [ ] Auto-compaction toggle
  - [ ] Remember last model across sessions

- [ ] Message features
  - [ ] Copy message button
  - [ ] Regenerate response
  - [ ] Edit user message and re-send
  - [ ] Message timestamps

- [ ] Performance
  - [ ] Virtual scrolling for long conversations (>100 messages)
  - [ ] Debounce token updates (currently re-renders on every token)
  - [ ] Message caching / persistence (localStorage or IndexedDB)

## Low Priority

- [ ] UI polish
  - [ ] Code syntax highlighting in markdown
  - [ ] Light mode support (currently dark mode only)
  - [ ] Keyboard shortcuts (Esc to cancel streaming, etc.)
  - [ ] Responsive design for mobile

- [ ] Advanced features
  - [ ] File upload support (images for vision, documents)
  - [ ] Export conversation to markdown/HTML
  - [ ] Search messages
  - [ ] Bookmarks / favorites

- [ ] Developer experience
  - [ ] Unit tests for stores and client
  - [ ] E2E tests with vitest
  - [ ] Storybook for components

## Notes

- The core protocol implementation is complete and mirrors clankie's WebChannel
- Focus on auth fix first, then error handling and UX polish
- Most features can be added incrementally without breaking changes
