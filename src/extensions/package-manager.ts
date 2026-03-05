import { StringEnum } from "@mariozechner/pi-ai";
import {
	DefaultPackageManager,
	type ExtensionAPI,
	type ExtensionFactory,
	SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { getAgentDir, getWorkspace, loadConfig } from "../config.ts";

const PackageManagerParamsSchema = Type.Object({
	action: StringEnum(["install", "remove", "update", "list"] as const),
	source: Type.Optional(
		Type.String({ description: "Package source, e.g. npm:@scope/pkg, git:github.com/user/repo, or local path" }),
	),
	scope: Type.Optional(StringEnum(["user", "project"] as const)),
});

type PackageManagerParams = {
	action: "install" | "remove" | "update" | "list";
	source?: string;
	scope?: "user" | "project";
};

type PackageManagerToolDetails = {
	action: "install" | "remove" | "update" | "list";
	scope: "user" | "project";
	source: string | null;
	output: string[];
	globalPackages?: string[];
	projectPackages?: string[];
};

function stringifyPackageSource(source: string | { source: string }): string {
	if (typeof source === "string") return source;
	return source.source;
}

export function createPackageManagerExtension(reloadAllSessions: () => Promise<void>): ExtensionFactory {
	return function packageManagerExtension(pi: ExtensionAPI) {
		let pendingReload = false;

		pi.on("agent_end", () => {
			if (!pendingReload) return;
			pendingReload = false;
			setTimeout(() => {
				reloadAllSessions().catch((err) => {
					console.error("[package-manager] Failed to reload sessions:", err);
				});
			}, 0);
		});

		pi.registerTool({
			name: "manage_packages",
			label: "Manage Packages",
			description:
				"Install, remove, update, or list clankie packages in the correct clankie directories. Defaults to user scope.",
			parameters: PackageManagerParamsSchema,
			async execute(_toolCallId, rawParams) {
				const params = rawParams as PackageManagerParams;
				const config = loadConfig();
				const cwd = getWorkspace(config);
				const agentDir = getAgentDir(config);
				const settingsManager = SettingsManager.create(cwd, agentDir);
				const packageManager = new DefaultPackageManager({ cwd, agentDir, settingsManager });
				const output: string[] = [];

				packageManager.setProgressCallback((event) => {
					if (!event.message) return;
					output.push(event.message);
				});

				const scope = params.scope ?? "user";
				const local = scope === "project";
				const detailsBase: PackageManagerToolDetails = {
					action: params.action,
					scope,
					source: params.source?.trim() ?? null,
					output,
				};

				try {
					switch (params.action) {
						case "list": {
							const globalPackages = (settingsManager.getGlobalSettings().packages ?? []).map(stringifyPackageSource);
							const projectPackages = (settingsManager.getProjectSettings().packages ?? []).map(stringifyPackageSource);
							const lines = [
								"Configured package sources:",
								`- User (${globalPackages.length}): ${globalPackages.length > 0 ? globalPackages.join(", ") : "(none)"}`,
								`- Project (${projectPackages.length}): ${projectPackages.length > 0 ? projectPackages.join(", ") : "(none)"}`,
							];
							return {
								content: [{ type: "text", text: lines.join("\n") }],
								details: { ...detailsBase, globalPackages, projectPackages },
							};
						}
						case "install": {
							if (!params.source?.trim()) {
								throw new Error("install requires source");
							}
							const source = params.source.trim();
							await packageManager.install(source, { local });
							packageManager.addSourceToSettings(source, { local });
							pendingReload = true;
							const summary =
								output.join("\n") || `Installed ${source} in ${scope} scope and scheduled runtime reload.`;
							return {
								content: [{ type: "text", text: summary }],
								details: { ...detailsBase, source },
							};
						}
						case "remove": {
							if (!params.source?.trim()) {
								throw new Error("remove requires source");
							}
							const source = params.source.trim();
							await packageManager.remove(source, { local });
							packageManager.removeSourceFromSettings(source, { local });
							pendingReload = true;
							const summary =
								output.join("\n") || `Removed ${source} from ${scope} scope and scheduled runtime reload.`;
							return {
								content: [{ type: "text", text: summary }],
								details: { ...detailsBase, source },
							};
						}
						case "update": {
							const source = params.source?.trim();
							await packageManager.update(source && source.length > 0 ? source : undefined);
							pendingReload = true;
							const summary =
								output.join("\n") ||
								`Updated ${source && source.length > 0 ? source : "all configured packages"} and scheduled runtime reload.`;
							return {
								content: [{ type: "text", text: summary }],
								details: { ...detailsBase, source: source ?? null },
							};
						}
					}
				} catch (err) {
					return {
						content: [
							{
								type: "text",
								text: `Package manager error: ${err instanceof Error ? err.message : String(err)}`,
							},
						],
						details: detailsBase,
					};
				}
			},
		});
	};
}
