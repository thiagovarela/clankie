/**
 * clankie-sandbox — Gondolin micro-VM sandbox for bash execution
 *
 * Transparently runs all bash commands (agent tool calls + user `!` commands)
 * inside a Gondolin micro-VM. Everything else (read/write/edit) stays on the
 * host — workspace-jail handles those. This extension only sandboxes the
 * arbitrary code execution surface.
 *
 * The workspace directory is mounted at /workspace inside the VM via VFS
 * passthrough, so commands see the same files as the host.
 *
 * Turn it on in ~/.clankie/clankie.json:
 *   { "sandbox": { "enabled": true } }
 *
 * Optionally configure network policy and secrets:
 *   {
 *     "sandbox": {
 *       "enabled": true,
 *       "network": {
 *         "blockedHosts": ["*.internal.corp.net"],
 *         "secrets": { "API_KEY": "sk-..." }
 *       }
 *     }
 *   }
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path, { join } from "node:path";
import type { BashOperations, ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { createBashTool } from "@mariozechner/pi-coding-agent";
import { RealFSProvider, VM, createHttpHooks, type CreateHttpHooksOptions } from "@earendil-works/gondolin";

// ─── Config ─────────────────────────────────────────────────────────────────────

interface SandboxConfig {
	enabled?: boolean;
	network?: {
		mode?: "open" | "allowlist";
		allowedHosts?: string[];
		blockedHosts?: string[];
		secrets?: Record<string, string | { value: string; hosts?: string[] }>;
		logRequests?: boolean;
	};
	env?: Record<string, string>;
}

const GUEST_WORKSPACE = "/workspace";

const BUILTIN_BLOCKED_HOSTS = [
	"169.254.169.254",
	"metadata.google.internal",
	"metadata.google.internal.",
	"169.254.*",
];

function loadConfig(): SandboxConfig {
	const configPath = join(homedir(), ".clankie", "clankie.json");
	if (!existsSync(configPath)) return {};
	try {
		const raw = readFileSync(configPath, "utf-8");
		let parsed: Record<string, unknown>;
		try {
			parsed = JSON.parse(raw);
		} catch {
			const cleaned = raw
				.replace(/\/\/.*$/gm, "")
				.replace(/\/\*[\s\S]*?\*\//g, "")
				.replace(/,\s*([}\]])/g, "$1");
			parsed = JSON.parse(cleaned);
		}
		return (parsed.sandbox as SandboxConfig) ?? {};
	} catch {
		return {};
	}
}

// ─── Glob matching ──────────────────────────────────────────────────────────────

function matchesGlob(host: string, pattern: string): boolean {
	if (pattern === host) return true;
	const regexStr = pattern.replace(/\./g, "\\.").replace(/\*/g, ".*");
	try {
		return new RegExp(`^${regexStr}$`, "i").test(host);
	} catch {
		return false;
	}
}

// ─── Path helpers ───────────────────────────────────────────────────────────────

function toGuestPath(localCwd: string, localPath: string): string {
	const rel = path.relative(localCwd, localPath);
	if (rel === "") return GUEST_WORKSPACE;
	if (rel.startsWith("..") || path.isAbsolute(rel)) {
		throw new Error(`Path escapes workspace: ${localPath}`);
	}
	return path.posix.join(GUEST_WORKSPACE, rel.split(path.sep).join(path.posix.sep));
}

// ─── Bash in VM ─────────────────────────────────────────────────────────────────

function sanitizeEnv(env?: NodeJS.ProcessEnv): Record<string, string> | undefined {
	if (!env) return undefined;
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(env)) {
		if (typeof v === "string") out[k] = v;
	}
	return out;
}

function createVmBashOps(vm: VM, localCwd: string): BashOperations {
	return {
		exec: async (command, cwd, { onData, signal, timeout, env }) => {
			const guestCwd = toGuestPath(localCwd, cwd);
			const ac = new AbortController();
			const onAbort = () => ac.abort();
			signal?.addEventListener("abort", onAbort, { once: true });

			let timedOut = false;
			const timer =
				timeout && timeout > 0
					? setTimeout(() => {
							timedOut = true;
							ac.abort();
						}, timeout * 1000)
					: undefined;

			try {
				const proc = vm.exec(["/bin/bash", "-lc", command], {
					cwd: guestCwd,
					signal: ac.signal,
					env: sanitizeEnv(env),
					stdout: "pipe",
					stderr: "pipe",
				});

				for await (const chunk of proc.output()) {
					onData(chunk.data);
				}

				const r = await proc;
				return { exitCode: r.exitCode };
			} catch (err) {
				if (signal?.aborted) throw new Error("aborted");
				if (timedOut) throw new Error(`timeout:${timeout}`);
				throw err;
			} finally {
				if (timer) clearTimeout(timer);
				signal?.removeEventListener("abort", onAbort);
			}
		},
	};
}

// ─── HTTP hooks ─────────────────────────────────────────────────────────────────

function buildHttpHooks(config: SandboxConfig): CreateHttpHooksOptions | undefined {
	const network = config.network ?? {};
	const mode = network.mode ?? "open";
	const logRequests = network.logRequests ?? false;

	const secrets: Record<string, { value: string; hosts: string[] }> = {};
	for (const [key, val] of Object.entries(network.secrets ?? {})) {
		if (typeof val === "string") {
			secrets[key] = { value: val, hosts: ["*"] };
		} else {
			secrets[key] = { value: val.value, hosts: val.hosts ?? ["*"] };
		}
	}

	const allBlocked = [...BUILTIN_BLOCKED_HOSTS, ...(network.blockedHosts ?? [])];
	const hasAnything = allBlocked.length > 0 || Object.keys(secrets).length > 0 || logRequests || mode === "allowlist";
	if (!hasAnything) return undefined;

	const opts: CreateHttpHooksOptions = {
		secrets,
		onRequest: async (req) => {
			const host = new URL(req.url).hostname;
			for (const pattern of allBlocked) {
				if (matchesGlob(host, pattern)) {
					throw new Error(`[sandbox] Blocked: ${host} (${pattern})`);
				}
			}
			if (logRequests) console.log(`[sandbox] ${req.method} ${req.url}`);
		},
	};

	if (mode === "allowlist") {
		opts.allowedHosts = network.allowedHosts ?? [];
	}

	return opts;
}

// ─── Extension ──────────────────────────────────────────────────────────────────

export default function sandboxExtension(pi: ExtensionAPI) {
	let vm: VM | null = null;
	let vmStarting: Promise<VM> | null = null;
	let localCwd = "";
	let config: SandboxConfig = {};

	async function ensureVm(ctx?: ExtensionContext): Promise<VM> {
		if (vm) return vm;
		if (vmStarting) return vmStarting;

		vmStarting = (async () => {
			ctx?.ui.setStatus("sandbox", ctx.ui.theme.fg("accent", "Sandbox: starting VM…"));

			const httpHooksOpts = buildHttpHooks(config);
			const httpHooks = httpHooksOpts ? createHttpHooks(httpHooksOpts).httpHooks : undefined;

			const created = await VM.create({
				vfs: { mounts: { [GUEST_WORKSPACE]: new RealFSProvider(localCwd) } },
				httpHooks,
				env: config.env,
			});
			vm = created;

			ctx?.ui.setStatus("sandbox", ctx.ui.theme.fg("accent", `Sandbox: running (${localCwd} → ${GUEST_WORKSPACE})`));
			return created;
		})();

		return vmStarting;
	}

	// ── Lifecycle ─────────────────────────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		localCwd = ctx.cwd;
		config = loadConfig();
		if (!config.enabled) return;

		// Register bash override now that theme is initialized
		const localBash = createBashTool(localCwd);
		pi.registerTool({
			...localBash,
			async execute(id, params, signal, onUpdate, ctx) {
				const activeVm = await ensureVm(ctx);
				const tool = createBashTool(localCwd, { operations: createVmBashOps(activeVm, localCwd) });
				return tool.execute(id, params, signal, onUpdate);
			},
		});

		pi.on("user_bash", () => {
			if (!vm) return;
			return { operations: createVmBashOps(vm, localCwd) };
		});

		await ensureVm(ctx);
	});

	pi.on("session_shutdown", async () => {
		if (!vm) return;
		try {
			await vm.close();
		} finally {
			vm = null;
			vmStarting = null;
		}
	});

	// ── System prompt ─────────────────────────────────────────────────────────

	pi.on("before_agent_start", async (event) => {
		if (!config.enabled || !vm) return {};
		return {
			systemPrompt: event.systemPrompt.replace(
				`Current working directory: ${localCwd}`,
				`Current working directory: ${localCwd}\nNote: Shell commands execute inside a sandboxed Linux VM (workspace mounted at ${GUEST_WORKSPACE}).`,
			),
		};
	});
}
