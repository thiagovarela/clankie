import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const HEARTBEAT_OK = "HEARTBEAT_OK";

const DEFAULT_PROMPT = `Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply ${HEARTBEAT_OK}.`;

export function readHeartbeatMd(cwd: string): string | null {
	const filePath = resolve(cwd, "HEARTBEAT.md");
	try {
		return readFileSync(filePath, "utf-8");
	} catch {
		return null;
	}
}

export function isEffectivelyEmpty(content: string): boolean {
	const stripped = content
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !line.startsWith("#"))
		.join("")
		.trim();
	return stripped.length === 0;
}

export function buildPrompt(cwd: string, customPrompt: string | null): string {
	if (customPrompt?.trim()) {
		return customPrompt;
	}

	const heartbeatMd = readHeartbeatMd(cwd);
	if (!heartbeatMd) {
		return DEFAULT_PROMPT;
	}

	return `${DEFAULT_PROMPT}\n\nHEARTBEAT.md:\n\n${heartbeatMd}`;
}
