# @clankie/json-ui-render

Render structured UI cards in clankie chats using `details.uiSpec`.

This extension adds one tool:

- `render_json_ui` — returns a valid `details.uiSpec` payload

You can either:

1. Pass a full `uiSpec` directly, or
2. Pass helper fields (`title`, `text`, `items`, `rows`, etc.) and let the extension build a fallback card layout.

## Why use it

Use this when you want rich, structured output in the web UI instead of plain text formatting.

## Package contents

Published files include:

- `src/`
- `skills/`
- `package.json`
- `README.md`
