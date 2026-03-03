import type { ExtensionAPI, ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { HeartbeatRunner } from "./runner.ts";

let sharedRunner: HeartbeatRunner | null = null;
let activeSessions = 0;

function ensureRunner(cwd: string): HeartbeatRunner {
	if (!sharedRunner) {
		sharedRunner = new HeartbeatRunner({ cwd });
	}
	return sharedRunner;
}

export function reloadSharedHeartbeatRunnerSettings(cwd?: string): void {
	if (!sharedRunner) {
		return;
	}
	if (cwd) {
		ensureRunner(cwd);
	}
	sharedRunner.reloadSettings();
}

async function handleHeartbeatCommand(args: string, _pi: ExtensionAPI, cwd: string): Promise<string> {
	const runner = ensureRunner(cwd);
	const action = args.trim().toLowerCase();

	if (action === "on" || action === "start") {
		const started = runner.start();
		return started ? "✓ Heartbeat started" : "Heartbeat did not start (disabled interval or lock held).";
	}

	if (action === "off" || action === "stop") {
		runner.stop();
		return "✓ Heartbeat stopped";
	}

	if (action === "run" || action === "now") {
		const result = await runner.runNow();
		if (result.ok) {
			return `✅ HEARTBEAT_OK (${(result.durationMs / 1000).toFixed(1)}s)\nSaved: ${result.resultsDir}/latest.json`;
		}
		return `🫀 Alert (${(result.durationMs / 1000).toFixed(1)}s)\nSaved: ${result.resultsDir}/latest.json`;
	}

	if (action === "reload") {
		const settings = runner.reloadSettings();
		return `✓ Heartbeat settings reloaded (every: ${settings.every}, resultsDir: ${settings.resultsDir}, model: ${settings.model ?? "default"})`;
	}

	const status = runner.getStatus();
	const settings = runner.getSettings();
	const last = status.lastResult;
	const lines = [
		`Heartbeat: ${status.active ? "active" : "inactive"}${status.running ? " (running)" : ""}`,
		`Runs: ${status.runCount} · OK: ${status.okCount} · Alerts: ${status.alertCount}`,
		`Model: ${settings.model ?? "(default session model)"}`,
		last ? `Last: ${last.timestamp} (${last.ok ? "OK" : "alert"})` : "Last: never",
		last ? `Results: ${last.resultsDir}` : "Results: ~/.clankie/workspace/heartbeat",
	];
	return lines.join("\n");
}

export function createHeartbeatExtension(): ExtensionFactory {
	return function heartbeatExtension(pi: ExtensionAPI) {
		let cwd = process.cwd();

		pi.on("session_start", (_event, ctx) => {
			cwd = ctx.cwd;
			activeSessions += 1;
			const runner = ensureRunner(cwd);
			const settings = runner.reloadSettings();

			if (pi.getFlag("--heartbeat") === true || settings.enabled) {
				const started = runner.start();
				if (started) {
					ctx.ui.setStatus("heartbeat", "🫀 heartbeat active");
				}
			}
		});

		pi.on("session_shutdown", () => {
			activeSessions = Math.max(0, activeSessions - 1);
			if (activeSessions === 0 && sharedRunner) {
				sharedRunner.stop();
				sharedRunner = null;
			}
		});

		pi.registerFlag("heartbeat", {
			description: "Enable heartbeat checks on session start",
			type: "boolean",
			default: false,
		});

		pi.registerCommand("heartbeat", {
			description: "Heartbeat controls: /heartbeat on|off|status|run|reload",
			getArgumentCompletions: (prefix: string) => {
				const items = ["on", "off", "status", "run", "reload"];
				return items.filter((item) => item.startsWith(prefix)).map((item) => ({ value: item, label: item }));
			},
			handler: async (args, ctx) => {
				const text = await handleHeartbeatCommand(args, pi, cwd);
				ctx.ui.notify(text, "info");
			},
		});
	};
}

export type { HeartbeatRunResult, HeartbeatSettings, HeartbeatStats } from "./types.ts";
