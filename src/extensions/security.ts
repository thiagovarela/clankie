/**
 * clankie security extension
 *
 * Hooks into pi's extension system to block dangerous tool calls,
 * protect sensitive paths, and redact sensitive data from tool results.
 *
 * See docs/security.md for the full threat model and rationale.
 *
 * Layers implemented here:
 *   Layer 1 — Tool restrictions (dangerous commands, protected paths, read restrictions)
 *   Layer 4 — Output redaction (private keys, API keys, tokens)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

export default function securityExtension(pi: ExtensionAPI) {
	// ─── Dangerous bash command patterns ─────────────────────────────────────

	const DANGEROUS_COMMANDS: RegExp[] = [
		/\brm\s+(-[rRf]{1,3}|--recursive|--force)/i,
		/\bsudo\b/i,
		/\b(chmod|chown)\b.*\b777\b/i,
		/\bcurl\b.*\|\s*(sh|bash|zsh|fish)/i,
		/\bwget\b.*\|\s*(sh|bash|zsh|fish)/i,
		/\beval\b/i,
		/\bnc\b.*-[el]/i,
		/\bncat\b.*-[el]/i,
		/\bcurl\b.*\s(-d|--data|--data-binary|--data-raw)/i,
		/\bwget\b.*(--post-data|--post-file)/i,
		// Exfiltration via common channels
		/\b(python|python3|node|ruby|perl)\b.*\bsocket\b/i,
		// Cron/launchd manipulation
		/\bcrontab\b.*-[er]/i,
	];

	// ─── Protected write paths ────────────────────────────────────────────────

	const PROTECTED_WRITE_PATHS: RegExp[] = [
		/[/\\]\.ssh[/\\]/i,
		/[/\\]\.gnupg[/\\]/i,
		/[/\\]\.aws[/\\]/i,
		/[/\\]\.clankie[/\\]/i,
		/[/\\]\.pi[/\\]/i,
		/\.env$/i,
		/\.env\./i,
		/[/\\]etc[/\\]/i,
		/[/\\]usr[/\\](bin|sbin|lib)/i,
		/[/\\]bin[/\\]/i,
		/[/\\]sbin[/\\]/i,
		/\.pem$/i,
		/\.key$/i,
		/\.pfx$/i,
		/\.p12$/i,
	];

	// ─── Sensitive read paths ─────────────────────────────────────────────────

	const SENSITIVE_READ_PATHS: RegExp[] = [
		/[/\\]\.ssh[/\\]id_/i,
		/[/\\]\.ssh[/\\].*_rsa/i,
		/[/\\]\.ssh[/\\].*_ed25519/i,
		/[/\\]\.ssh[/\\].*_ecdsa/i,
		/\.env$/i,
		/\.env\./i,
		/[/\\]\.clankie[/\\]config/i,
		/[/\\]\.aws[/\\]credentials/i,
		/[/\\]\.gnupg[/\\]/i,
		/\.pem$/i,
		/\.key$/i,
	];

	// ─── Sensitive output patterns ────────────────────────────────────────────

	const SENSITIVE_OUTPUT_PATTERNS: RegExp[] = [
		// PEM private keys
		/-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----/g,
		// AWS access keys
		/(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}/g,
		// OpenAI-style keys
		/sk-[a-zA-Z0-9]{20,}/g,
		// GitHub PATs (classic and fine-grained)
		/ghp_[a-zA-Z0-9]{36}/g,
		/github_pat_[a-zA-Z0-9_]{82}/g,
		// Anthropic API keys
		/sk-ant-[a-zA-Z0-9_-]{95}/g,
	];

	// ─── tool_call: block dangerous invocations ───────────────────────────────

	pi.on("tool_call", async (event, _ctx) => {
		// Block dangerous bash commands
		if (isToolCallEventType("bash", event)) {
			const cmd = event.input.command as string;
			for (const pattern of DANGEROUS_COMMANDS) {
				if (pattern.test(cmd)) {
					return {
						block: true,
						reason: `[clankie security] Blocked dangerous command pattern.\nCommand: ${cmd.slice(0, 200)}`,
					};
				}
			}
		}

		// Block writes to protected paths
		if (isToolCallEventType("write", event) || isToolCallEventType("edit", event)) {
			const path = event.input.path as string;
			for (const pattern of PROTECTED_WRITE_PATHS) {
				if (pattern.test(path)) {
					return {
						block: true,
						reason: `[clankie security] Blocked write to protected path: ${path}`,
					};
				}
			}
		}

		// Block reads of sensitive files
		if (isToolCallEventType("read", event)) {
			const path = event.input.path as string;
			for (const pattern of SENSITIVE_READ_PATHS) {
				if (pattern.test(path)) {
					return {
						block: true,
						reason: `[clankie security] Blocked read of sensitive path: ${path}`,
					};
				}
			}
		}

		return undefined;
	});

	// ─── tool_result: redact sensitive data from output ───────────────────────

	pi.on("tool_result", async (event) => {
		let redacted = false;

		const content = event.content.map((block) => {
			if (block.type !== "text") return block;

			let text = block.text;
			for (const pattern of SENSITIVE_OUTPUT_PATTERNS) {
				// Reset lastIndex for global patterns used across calls
				pattern.lastIndex = 0;
				if (pattern.test(text)) {
					pattern.lastIndex = 0;
					text = text.replace(pattern, "[REDACTED by clankie security]");
					redacted = true;
				}
			}

			return redacted ? { ...block, text } : block;
		});

		return redacted ? { content } : undefined;
	});
}
