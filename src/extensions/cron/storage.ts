import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import JSON5 from "json5";
import { getAppDir } from "../../config.ts";
import type { CronJob } from "./types.ts";

export function getCronDir(): string {
	const dir = join(getAppDir(), "cron");
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true, mode: 0o700 });
	}
	return dir;
}

export function getCronJobsPath(): string {
	return join(getCronDir(), "jobs.json");
}

export function ensureJobsFile(): void {
	const path = getCronJobsPath();
	if (!existsSync(path)) {
		saveJobs([]);
	}
}

export function loadJobs(): CronJob[] {
	ensureJobsFile();
	try {
		const raw = readFileSync(getCronJobsPath(), "utf-8");
		const parsed = JSON5.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed as CronJob[];
	} catch {
		return [];
	}
}

export function saveJobs(jobs: CronJob[]): void {
	const path = getCronJobsPath();
	const tempPath = `${path}.tmp`;
	writeFileSync(tempPath, `${JSON.stringify(jobs, null, 2)}\n`, "utf-8");
	renameSync(tempPath, path);
}
