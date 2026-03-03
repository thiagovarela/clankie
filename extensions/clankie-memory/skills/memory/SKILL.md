---
name: memory
description: Persistent workspace memory for recalling prior facts, preferences, decisions, and daily notes.
---

# Memory

You have persistent memory stored as Markdown files in the workspace.

## Tools
- `memory_search`: Semantic + text search over memory. Use before making assumptions.
- `memory_write`: Write memory entries. Use `type="daily"` for day notes and `type="longterm"` for durable facts.

## When to write
- The user says “remember this”.
- Durable user preferences, important decisions, long-lived facts (`type="longterm"`).
- Session/day context or logs (`type="daily"`).

## When to search
- Before answering questions about prior context.
- When the user references “as I said before” or previous decisions.
- At the start of complex tasks where prior project decisions might matter.
