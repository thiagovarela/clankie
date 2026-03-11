/**
 * Agent Context Files Extension
 *
 * Adds optional OpenClaw-style context files on top of pi's native AGENTS.md loading.
 *
 * Runtime-loaded files (if present):
 * - <agentDir>/IDENTITY.md (global identity)
 * - <cwd>/SOUL.md (core principles)
 * - <cwd>/USER.md (user preferences)
 *
 * Template ownership also lives here so CLI setup/reset uses the same source of truth.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExtensionAPI, ExtensionFactory } from "@mariozechner/pi-coding-agent";

const MAX_FILE_CHARS = 12_000;

export type ManagedContextFileId = "AGENTS" | "IDENTITY" | "SOUL" | "USER";

export interface ManagedContextFileSpec {
	id: ManagedContextFileId;
	filename: string;
	path: string;
	description: string;
	template: string;
	loadIntoPrompt: boolean;
}

const DEFAULT_TEMPLATES: Record<ManagedContextFileId, string> = {
	AGENTS: `# AGENTS.md — clankie default

You are clankie, a personal AI assistant running locally on the user's machine.

## Workspace
- Primary workspace: ~/.clankie/workspace
- Respect the current working directory used by the active session
- Prefer changes inside the workspace unless explicitly asked otherwise

## Safety defaults
- Ask before destructive operations (delete, force-reset, mass rewrite)
- Never reveal credentials, tokens, API keys, or private keys
- Prefer minimal, reversible edits
- Explain planned changes before running risky commands

## Runtime behavior
- Use clankie's configured tools, extensions, and skills
- When a project AGENTS.md exists in the current repository, treat it as higher-priority project instructions
- Keep responses concise and practical by default

## Context files
- Global identity: ~/.clankie/IDENTITY.md
- Workspace principles: ~/.clankie/workspace/SOUL.md
- Workspace user preferences: ~/.clankie/workspace/USER.md

## Memory
- If clankie-memory is installed, use it for durable preferences and notes
- Keep short-term context focused on the current task
- Avoid storing sensitive secrets in memory
`,
	IDENTITY: `# IDENTITY.md — clankie identity

This file defines clankie's stable identity across all workspaces.

## Role
- You are clankie, a local-first personal AI assistant.
- You prioritize user control, privacy, and transparency.

## Core behavior
- Be helpful, direct, and practical.
- Prefer safe, reversible actions.
- Explain trade-offs when multiple approaches exist.
`,
	SOUL: `# SOUL.md — workspace principles

This file defines non-negotiable principles for this workspace.

## Principles
- Understand before changing.
- Keep diffs small and easy to review.
- Preserve project conventions and architecture.
- Validate important changes with checks/tests when possible.
`,
	USER: `# USER.md — user preferences

This file defines how the user prefers to collaborate in this workspace.

## Preferences
- Response style: concise and actionable.
- Always include file paths when editing files.
- Ask before large refactors or destructive changes.
- Suggest verification commands after meaningful code changes.
`,
};

function withTrailingNewline(content: string): string {
	return content.endsWith("\n") ? content : `${content}\n`;
}

export function getManagedContextFileSpecs(agentDir: string, workspaceDir: string): ManagedContextFileSpec[] {
	return [
		{
			id: "AGENTS",
			filename: "AGENTS.md",
			path: join(workspaceDir, "AGENTS.md"),
			description: "Primary project/session instruction file loaded natively by pi.",
			template: withTrailingNewline(DEFAULT_TEMPLATES.AGENTS),
			loadIntoPrompt: false,
		},
		{
			id: "IDENTITY",
			filename: "IDENTITY.md",
			path: join(agentDir, "IDENTITY.md"),
			description: "Global assistant identity and long-term role.",
			template: withTrailingNewline(DEFAULT_TEMPLATES.IDENTITY),
			loadIntoPrompt: true,
		},
		{
			id: "SOUL",
			filename: "SOUL.md",
			path: join(workspaceDir, "SOUL.md"),
			description: "Core principles, tone, and non-negotiable behavior for this workspace.",
			template: withTrailingNewline(DEFAULT_TEMPLATES.SOUL),
			loadIntoPrompt: true,
		},
		{
			id: "USER",
			filename: "USER.md",
			path: join(workspaceDir, "USER.md"),
			description: "User-specific preferences and collaboration style.",
			template: withTrailingNewline(DEFAULT_TEMPLATES.USER),
			loadIntoPrompt: true,
		},
	];
}

export function writeManagedContextTemplates(
	agentDir: string,
	workspaceDir: string,
	ids: ManagedContextFileId[] = ["AGENTS", "IDENTITY", "SOUL", "USER"],
): ManagedContextFileSpec[] {
	const wanted = new Set<ManagedContextFileId>(ids);
	const specs = getManagedContextFileSpecs(agentDir, workspaceDir).filter((spec) => wanted.has(spec.id));

	for (const spec of specs) {
		mkdirSync(dirname(spec.path), { recursive: true, mode: 0o755 });
		writeFileSync(spec.path, spec.template, "utf-8");
	}

	return specs;
}

function readOptionalContextFile(filePath: string): { content: string; truncated: boolean } | undefined {
	if (!existsSync(filePath)) return undefined;
	try {
		const raw = readFileSync(filePath, "utf-8").trim();
		if (!raw) return undefined;
		if (raw.length <= MAX_FILE_CHARS) {
			return { content: raw, truncated: false };
		}
		return {
			content: `${raw.slice(0, MAX_FILE_CHARS)}\n\n[truncated by clankie: file too large]`,
			truncated: true,
		};
	} catch (err) {
		console.warn(
			`Warning: failed to read context file ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
		);
		return undefined;
	}
}

function renderContextBlock(spec: ManagedContextFileSpec, content: string, truncated: boolean): string {
	const truncationNote = truncated ? " (truncated)" : "";
	return [
		`### ${spec.filename}${truncationNote}`,
		`Source: ${spec.path}`,
		`Purpose: ${spec.description}`,
		"",
		content,
	].join("\n");
}

export function createAgentContextFilesExtension(agentDir: string): ExtensionFactory {
	return function agentContextFilesExtension(pi: ExtensionAPI) {
		pi.on("before_agent_start", async (event, ctx) => {
			const files = getManagedContextFileSpecs(agentDir, ctx.cwd).filter((spec) => spec.loadIntoPrompt);

			const blocks: string[] = [];
			for (const spec of files) {
				const data = readOptionalContextFile(spec.path);
				if (!data) continue;
				blocks.push(renderContextBlock(spec, data.content, data.truncated));
			}

			if (blocks.length === 0) return {};

			const header = [
				"## Additional Context Files (clankie)",
				"The following files are loaded by clankie before each run.",
				"Priority (general -> specific): IDENTITY.md, SOUL.md, USER.md.",
			].join("\n");

			return {
				systemPrompt: `${event.systemPrompt}\n\n${header}\n\n${blocks.join("\n\n")}`,
			};
		});
	};
}
