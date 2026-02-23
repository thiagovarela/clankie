# lil monorepo

This repository uses Bun workspaces:

- `packages/lil` — CLI daemon + agent runtime
- `packages/web` — web UI frontend

## Quick start

```bash
bun install
bun run web:build
bun run --filter lil dev
```

See `packages/lil/README.md` for full usage and setup.
