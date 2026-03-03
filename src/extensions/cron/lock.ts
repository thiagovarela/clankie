import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAppDir } from "../../config.ts";

const LOCK_PATH = join(getAppDir(), "cron", "cron.lock");

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

export function acquireCronLock(): boolean {
	mkdirSync(join(getAppDir(), "cron"), { recursive: true });

	if (existsSync(LOCK_PATH)) {
		try {
			const content = readFileSync(LOCK_PATH, "utf-8").trim();
			const pid = Number.parseInt(content, 10);
			if (!Number.isNaN(pid) && pid !== process.pid && isProcessAlive(pid)) {
				return false;
			}
		} catch {
			// stale/broken lock, overwrite below
		}
	}

	writeFileSync(LOCK_PATH, String(process.pid), "utf-8");
	return true;
}

export function releaseCronLock(): void {
	try {
		const content = readFileSync(LOCK_PATH, "utf-8").trim();
		const pid = Number.parseInt(content, 10);
		if (pid === process.pid) {
			unlinkSync(LOCK_PATH);
		}
	} catch {
		// ignore
	}
}
