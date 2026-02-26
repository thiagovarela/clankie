/**
 * Workspace Jail Extension
 *
 * Restricts agent file/command access to the workspace directory.
 * Prevents the agent from reading, writing, or executing commands
 * that reference paths outside the configured workspace.
 *
 * Uses pi's tool_call event to intercept and validate all tool calls.
 */

import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, normalize, resolve } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/**
 * Create a workspace jail extension that restricts file access.
 *
 * @param workspaceDir - Absolute path to the workspace directory
 * @param allowedPaths - Additional paths outside workspace that should be permitted
 */
export function createWorkspaceJailExtension(workspaceDir: string, allowedPaths: string[] = []) {
	// Normalize workspace path and ensure it ends with /
	const normalizedWorkspace = `${normalize(workspaceDir).replace(/\/$/, "")}/`;

	// Normalize allowed paths (resolve to absolute, real paths where they exist)
	const normalizedAllowedPaths = allowedPaths.map((p) => {
		const resolved = resolve(p);
		try {
			return existsSync(resolved) ? realpathSync(resolved) : resolved;
		} catch {
			return resolved;
		}
	});

	return function workspaceJail(pi: ExtensionAPI) {
		/**
		 * Check if a path is within the workspace or allowed paths.
		 * Handles symlinks, relative paths, ~ expansion, etc.
		 */
		function isPathAllowed(inputPath: string): { allowed: boolean; reason?: string } {
			// Resolve to absolute path
			let absolutePath: string;

			// Handle ~ expansion
			if (inputPath.startsWith("~/")) {
				return { allowed: false, reason: "Access to home directory (~/) is blocked" };
			}
			if (inputPath === "~") {
				return { allowed: false, reason: "Access to home directory (~) is blocked" };
			}

			// Resolve relative/absolute paths against workspace
			absolutePath = isAbsolute(inputPath) ? inputPath : resolve(workspaceDir, inputPath);

			// Resolve symlinks if the path exists
			let realPath: string;
			try {
				realPath = existsSync(absolutePath) ? realpathSync(absolutePath) : absolutePath;
			} catch {
				// If realpathSync fails (permission denied, etc), use the absolute path
				realPath = absolutePath;
			}

			// Normalize for comparison
			const normalized = `${normalize(realPath).replace(/\/$/, "")}/`;

			// Check if within workspace
			if (normalized.startsWith(normalizedWorkspace)) {
				return { allowed: true };
			}

			// Check if within allowed paths
			for (const allowedPath of normalizedAllowedPaths) {
				const normalizedAllowed = `${normalize(allowedPath).replace(/\/$/, "")}/`;
				if (normalized.startsWith(normalizedAllowed)) {
					return { allowed: true };
				}
			}

			return {
				allowed: false,
				reason: `Access denied: path '${inputPath}' is outside workspace (${workspaceDir})`,
			};
		}

		/**
		 * Scan a bash command for obvious path escapes.
		 * This is defense-in-depth, not a complete sandbox.
		 */
		function scanBashCommand(command: string): { allowed: boolean; reason?: string } {
			// Block absolute paths outside workspace
			const absolutePathPattern = /(?:^|\s)([~/][\w\-./]+)/g;
			let match: RegExpExecArray | null;

			// biome-ignore lint/suspicious/noAssignInExpressions: regex exec pattern
			while ((match = absolutePathPattern.exec(command)) !== null) {
				const pathLike = match[1];

				// Check if it looks like a path to a sensitive location
				if (
					pathLike.startsWith("/etc") ||
					pathLike.startsWith("/var") ||
					pathLike.startsWith("/usr") ||
					pathLike.startsWith("/sys") ||
					pathLike.startsWith("/proc") ||
					pathLike.startsWith("/root") ||
					pathLike.startsWith("~/")
				) {
					return {
						allowed: false,
						reason: `Blocked: command references path outside workspace: ${pathLike}`,
					};
				}
			}

			// Block cd to absolute paths outside workspace
			if (/\bcd\s+\//.test(command)) {
				return { allowed: false, reason: "Blocked: 'cd /' or 'cd /path' outside workspace" };
			}

			// Block obvious .. traversal attempts that escape workspace
			// This is heuristic - catches patterns like "cd ../../.." but won't catch all evasion
			const dotsPattern = /(?:^|\s)cd\s+(?:\.\.\/){3,}/;
			if (dotsPattern.test(command)) {
				return {
					allowed: false,
					reason: "Blocked: command attempts to traverse outside workspace using '..'",
				};
			}

			return { allowed: true };
		}

		// Intercept all tool calls
		pi.on("tool_call", async (event) => {
			const { toolName, input } = event;

			// File tools: validate the 'path' parameter
			if (["read", "write", "edit", "grep", "find", "ls"].includes(toolName)) {
				const toolInput = input as { path?: string };
				if (toolInput.path) {
					const check = isPathAllowed(toolInput.path);
					if (!check.allowed) {
						return { block: true, reason: check.reason };
					}
				}
			}

			// Bash: scan command for obvious path escapes
			if (toolName === "bash") {
				const toolInput = input as { command?: string };
				if (toolInput.command) {
					const check = scanBashCommand(toolInput.command);
					if (!check.allowed) {
						return { block: true, reason: check.reason };
					}
				}
			}

			return undefined;
		});

		// Inject system prompt reminder
		pi.on("before_agent_start", async () => {
			return {
				systemPrompt: `\n\nIMPORTANT: You are restricted to working within the directory: ${workspaceDir}
Do not access files, run commands, or reference paths outside this directory.`,
			};
		});
	};
}
