---
name: tool-ui-specs
description: Generate structured web UI payloads for clankie tool results and extension configuration using details.uiSpec, renderHint, and json-render shadcn components. Use when asked to make tool output render as cards, forms, lists, tables, or other rich UI in the web app.
---

# Tool UI Specs

Use this skill when generating structured UI for the clankie web app.

## Choose the simplest renderer

Prefer `details.renderHint` for simple formatted output:

- `code`
- `diff`
- `terminal`
- `table`
- `list`
- `json`
- `markdown`

Use `details.uiSpec` when the output needs richer layout or form-like structure:

- cards with grouped content
- multiple sections
- settings-like forms
- dashboards / summaries
- composed shadcn components

## Preferred tool path

If the `render_json_ui` tool is available, prefer calling it instead of hand-authoring a long JSON payload in chat. It produces valid `details.renderHint` / `details.uiSpec` results that the web client can render directly.

Use direct payload authoring only when:
- you are writing extension/tool code
- or the user explicitly wants the raw payload

## Tool result contract

For tool results, keep a normal text summary in `content` and put structured rendering metadata in `details`.

```ts
return {
  content: [{ type: "text", text: "Summary for the agent and transcript." }],
  details: {
    uiSpec: {
      root: "some-root-id",
      elements: {
        // JSON Render node map
      },
      actions: {
        // optional action descriptions
      },
    },
  },
};
```

## Supported uiSpec shape

The web UI expects:

```ts
{
  root: string,
  elements: Record<string, unknown>,
  actions?: Record<string, { description?: string }>
}
```

Each element is usually shaped like:

```ts
{
  type: "Card" | "Stack" | "Text" | "Input" | "Button" | "Switch" | "Select",
  props?: Record<string, unknown>,
  children?: string[],
  on?: Record<string, {
    action: string,
    params?: Record<string, unknown>
  }>
}
```

## Components and patterns

Use simple, predictable compositions.

### Card with vertical stack

```json
{
  "root": "demo-card",
  "elements": {
    "demo-card": {
      "type": "Card",
      "props": {
        "title": "Workspace summary",
        "description": "Generated from a tool result"
      },
      "children": ["demo-stack"]
    },
    "demo-stack": {
      "type": "Stack",
      "props": {
        "direction": "vertical",
        "gap": "md"
      },
      "children": ["intro", "status"]
    },
    "intro": {
      "type": "Text",
      "props": {
        "text": "2 files changed, 1 warning remains."
      }
    },
    "status": {
      "type": "Text",
      "props": {
        "text": "Review the warning before shipping.",
        "variant": "muted"
      }
    }
  }
}
```

### Form-like controls

Use bindings when local UI state is useful.

```json
{
  "root": "settings-card",
  "elements": {
    "settings-card": {
      "type": "Card",
      "props": {
        "title": "Preview settings"
      },
      "children": ["settings-stack"]
    },
    "settings-stack": {
      "type": "Stack",
      "props": {
        "direction": "vertical",
        "gap": "md"
      },
      "children": ["enabled", "name", "echo"]
    },
    "enabled": {
      "type": "Switch",
      "props": {
        "label": "Enabled",
        "checked": { "$bindState": "/enabled" }
      }
    },
    "name": {
      "type": "Input",
      "props": {
        "label": "Name",
        "value": { "$bindState": "/name" }
      }
    },
    "echo": {
      "type": "Text",
      "props": {
        "text": { "$state": "/name" }
      }
    }
  }
}
```

## State bindings

Use these binding forms:

- `{ "$state": "/path" }` to read state
- `{ "$bindState": "/path" }` for two-way binding

For extension configuration UIs, state often starts from `initialState`, for example:

- `/config/enabled`
- `/config/model`
- `/availableModels`

## Actions

You may declare actions in `on` handlers and optionally document them in `actions`.

Example:

```json
{
  "save-button": {
    "type": "Button",
    "props": {
      "label": "Save",
      "variant": "primary"
    },
    "on": {
      "press": {
        "action": "saveExtensionConfig",
        "params": {
          "enabled": { "$state": "/config/enabled" },
          "model": { "$state": "/config/model" }
        }
      }
    }
  }
}
```

### Important limitation

For `details.uiSpec` inside ordinary tool results, prefer display-first UIs. The current web app renders the UI, but backend action handling is primarily wired for extension configuration screens. Do not assume arbitrary tool-result buttons can trigger real backend logic unless the caller explicitly says that plumbing exists.

So:

- for tool results: prefer read-only or local-state UI
- for extension settings: actions like save are appropriate

## When to use renderHint instead

Prefer `renderHint` instead of `uiSpec` when the output is naturally one of:

- code block
- terminal log
- markdown document
- JSON blob
- simple table
- simple list

Example:

```ts
return {
  content: [{ type: "text", text: "Package list" }],
  details: {
    renderHint: { type: "table", columns: ["name", "version"] },
    data: rows,
  },
};
```

## Good defaults

- Use stable element ids like `summary-card`, `summary-stack`, `save-button`
- Keep trees shallow
- Prefer one `Card` root with one `Stack` child
- Keep text concise
- Include a useful text fallback in `content`
- Only use components and props that are clearly necessary

## Avoid

- raw HTML
- JSX
- deeply nested trees without need
- unsupported component names
- inventing backend actions for normal tool-result UIs
- putting the whole payload in `content` instead of `details`

## Recommended response shape for LLM-authored tool code

```ts
return {
  content: [{ type: "text", text: "Short human-readable summary." }],
  details: {
    uiSpec: {
      root: "result-card",
      elements: {
        "result-card": {
          type: "Card",
          props: { title: "Result", description: "Structured output" },
          children: ["result-stack"],
        },
        "result-stack": {
          type: "Stack",
          props: { direction: "vertical", gap: "md" },
          children: ["result-text"],
        },
        "result-text": {
          type: "Text",
          props: { text: "Rendered by json-render." },
        },
      },
    },
  },
};
```
