import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import type { HeartbeatRunResult } from "./types.ts";

export function resolveResultsDir(cwd: string, configuredDir: string): string {
	if (!configuredDir) {
		return join(homedir(), ".clankie", "workspace", "heartbeat");
	}
	if (configuredDir.startsWith("~/")) {
		return join(homedir(), configuredDir.slice(2));
	}
	if (isAbsolute(configuredDir)) {
		return configuredDir;
	}
	return resolve(cwd, configuredDir);
}

function safeTimestamp(ts: string): string {
	return ts.replace(/[:]/g, "-");
}

export function persistHeartbeatResult(result: HeartbeatRunResult): void {
	mkdirSync(result.resultsDir, { recursive: true });

	const fileName = `${safeTimestamp(result.timestamp)}.json`;
	const filePath = join(result.resultsDir, fileName);
	const latestPath = join(result.resultsDir, "latest.json");

	const json = `${JSON.stringify(result, null, 2)}\n`;

	const tempFilePath = `${filePath}.tmp`;
	writeFileSync(tempFilePath, json, "utf-8");
	renameSync(tempFilePath, filePath);

	const latestTemp = `${latestPath}.tmp`;
	writeFileSync(latestTemp, json, "utf-8");
	renameSync(latestTemp, latestPath);
}
