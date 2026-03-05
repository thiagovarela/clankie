---
name: clankie-admin
description: Manage clankie configuration, install/update Pi packages, and create local skills/extensions in the correct clankie directories. Use when asked to install or maintain clankie skills/extensions.
---

# Clankie Admin

Use this skill when the user asks to install, update, remove, or create skills/extensions for clankie.

## Directory layout (source of truth)

Clankie uses `~/.clankie/` as its global agent directory:

- `~/.clankie/settings.json` → Pi global settings for clankie
- `~/.clankie/clankie.json` → Clankie app config
- `~/.clankie/extensions/` → user-scope local extensions
- `~/.clankie/skills/` → user-scope local skills
- `~/.clankie/prompts/` → user-scope prompt templates
- `~/.clankie/themes/` → user-scope themes
- `~/.clankie/git/` → git-based package installs
- `~/.clankie/workspace/` → working directory (not the global package location)

## Installation rules

1. Prefer **user scope** installs for clankie-managed packages.
2. Avoid project-local installs into `~/.clankie/workspace/.pi/` unless the user explicitly asks for project scope.
3. After install/update/remove, reload the session so newly loaded resources become available.

## Creating a skill

Create skills under:

- `~/.clankie/skills/<skill-name>/SKILL.md`

Requirements:

- Directory name must match frontmatter `name`
- Include frontmatter with `name` and `description`
- Keep description specific about when to use the skill

## Creating an extension

Create extensions under:

- `~/.clankie/extensions/<extension-name>/`

Keep extension code and any package metadata there. If the extension ships skills, place them under a `skills/` folder in the extension package and expose them through the package manifest.

## Safety checks

Before changing files, confirm target paths are under `~/.clankie/` for global clankie resources.
If an install path would resolve to `~/.clankie/workspace/.pi/`, explicitly confirm with the user before proceeding.
