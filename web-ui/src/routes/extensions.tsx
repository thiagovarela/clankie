import { createFileRoute, Link } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { AlertCircle, CheckCircle, Loader2, Package, Puzzle, Settings, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { clientManager } from "@/lib/client-manager";
import { connectionStore } from "@/stores/connection";
import {
	extensionsStore,
	resetInstallStatus,
	setExtensions,
	setInstallStatus,
	setLoading,
	setSkills,
} from "@/stores/extensions";
import { sessionsListStore } from "@/stores/sessions-list";

export const Route = createFileRoute("/extensions")({
	component: ExtensionsPage,
});

function ExtensionsPage() {
	const { status } = useStore(connectionStore, (state) => ({
		status: state.status,
	}));

	const { activeSessionId } = useStore(sessionsListStore, (state) => ({
		activeSessionId: state.activeSessionId,
	}));

	const { extensions, extensionErrors, skills, skillDiagnostics, isLoading, installStatus } = useStore(
		extensionsStore,
		(state) => state,
	);

	const [packageSource, setPackageSource] = useState("");
	const [installLocal, setInstallLocal] = useState(false);

	const isConnected = status === "connected";

	const loadExtensionsAndSkills = useCallback(async () => {
		const client = clientManager.getClient();
		if (!client || !activeSessionId) return;

		setLoading(true);
		try {
			// Reload session resources first to pick up extensions installed via chat
			await client.reload(activeSessionId);

			const [extensionsResult, skillsResult] = await Promise.all([
				client.getExtensions(activeSessionId),
				client.getSkills(activeSessionId),
			]);

			setExtensions(extensionsResult.extensions, extensionsResult.errors);
			setSkills(skillsResult.skills, skillsResult.diagnostics);
		} catch (err) {
			console.error("Failed to load extensions and skills:", err);
			setLoading(false);
		}
	}, [activeSessionId]);

	useEffect(() => {
		if (isConnected && activeSessionId) {
			loadExtensionsAndSkills();
		}
	}, [isConnected, activeSessionId, loadExtensionsAndSkills]);

	const handleInstall = async () => {
		const client = clientManager.getClient();
		if (!client || !activeSessionId || !packageSource.trim()) return;

		setInstallStatus({
			isInstalling: true,
			output: "",
			exitCode: null,
			error: undefined,
		});

		try {
			const result = await client.installPackage(activeSessionId, packageSource.trim(), installLocal);

			setInstallStatus({
				isInstalling: false,
				output: result.output,
				exitCode: result.exitCode,
			});

			// If successful, reload extensions and skills
			if (result.exitCode === 0) {
				await loadExtensionsAndSkills();
			}
		} catch (err) {
			setInstallStatus({
				isInstalling: false,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	};

	if (!isConnected) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="text-center space-y-4">
					<div className="space-y-2">
						<h2 className="text-2xl font-semibold">Not Connected</h2>
						<p className="text-muted-foreground">Configure your connection to get started</p>
					</div>
					<Link to="/settings">
						<Button>
							<Settings className="mr-2 h-4 w-4" />
							Go to Settings
						</Button>
					</Link>
				</div>
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="text-center space-y-2">
					<Loader2 className="inline-block h-8 w-8 animate-spin text-primary" />
					<p className="text-sm text-muted-foreground">Loading extensions and skills...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="h-full overflow-y-auto">
			<div className="container max-w-4xl py-8 px-4 space-y-6">
				{/* Extensions Section */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Puzzle className="h-5 w-5" />
							Extensions
						</CardTitle>
						<CardDescription>Loaded extensions with their registered tools and commands</CardDescription>
					</CardHeader>
					<CardContent>
						{extensionErrors.length > 0 && (
							<div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3">
								<div className="flex items-start gap-2">
									<AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
									<div className="flex-1">
										<p className="text-sm font-medium text-destructive">Extension Load Errors</p>
										<div className="mt-2 space-y-2">
											{extensionErrors.map((err, idx) => (
												<div key={idx} className="text-xs">
													<p className="font-mono text-muted-foreground">{err.path}</p>
													<p className="text-destructive">{err.error}</p>
												</div>
											))}
										</div>
									</div>
								</div>
							</div>
						)}

						{extensions.length === 0 ? (
							<p className="text-sm text-muted-foreground py-4">No extensions loaded.</p>
						) : (
							<div className="space-y-3">
								{extensions.map((ext, idx) => (
									<div key={idx} className="rounded-lg border p-3">
										<div className="space-y-2">
											<div>
												<p className="text-sm font-medium font-mono break-all">{ext.path}</p>
												{ext.resolvedPath !== ext.path && (
													<p className="text-xs text-muted-foreground font-mono mt-1 break-all">→ {ext.resolvedPath}</p>
												)}
											</div>

											<div className="flex flex-wrap gap-2">
												{ext.tools.length > 0 && (
													<div className="flex flex-wrap gap-1">
														<span className="text-xs text-muted-foreground mr-1">Tools:</span>
														{ext.tools.map((tool) => (
															<Badge key={tool} variant="secondary" className="text-xs">
																{tool}
															</Badge>
														))}
													</div>
												)}

												{ext.commands.length > 0 && (
													<div className="flex flex-wrap gap-1">
														<span className="text-xs text-muted-foreground mr-1">Commands:</span>
														{ext.commands.map((cmd) => (
															<Badge key={cmd} variant="default" className="text-xs">
																/{cmd}
															</Badge>
														))}
													</div>
												)}

												{ext.flags.length > 0 && (
													<div className="flex flex-wrap gap-1">
														<span className="text-xs text-muted-foreground mr-1">Flags:</span>
														{ext.flags.map((flag) => (
															<Badge key={flag} variant="outline" className="text-xs">
																--{flag}
															</Badge>
														))}
													</div>
												)}

												{ext.shortcuts.length > 0 && (
													<div className="flex flex-wrap gap-1">
														<span className="text-xs text-muted-foreground mr-1">Shortcuts:</span>
														{ext.shortcuts.map((shortcut) => (
															<Badge key={shortcut} variant="outline" className="text-xs font-mono">
																{shortcut}
															</Badge>
														))}
													</div>
												)}
											</div>
										</div>
									</div>
								))}
							</div>
						)}
					</CardContent>
				</Card>

				{/* Skills Section */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Sparkles className="h-5 w-5" />
							Skills
						</CardTitle>
						<CardDescription>Available skills for the agent</CardDescription>
					</CardHeader>
					<CardContent>
						{skillDiagnostics.length > 0 && (
							<div className="mb-4 rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3">
								<div className="flex items-start gap-2">
									<AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
									<div className="flex-1">
										<p className="text-sm font-medium text-yellow-600">Skill Diagnostics</p>
										<div className="mt-2 space-y-1">
											{skillDiagnostics.map((diag, idx) => (
												<p key={idx} className="text-xs text-yellow-700">
													{diag.path && <span className="font-mono">{diag.path}: </span>}
													{diag.message}
												</p>
											))}
										</div>
									</div>
								</div>
							</div>
						)}

						{skills.length === 0 ? (
							<p className="text-sm text-muted-foreground py-4">No skills loaded.</p>
						) : (
							<div className="space-y-3">
								{skills.map((skill, idx) => (
									<div key={idx} className="rounded-lg border p-3">
										<div className="space-y-2">
											<div className="flex items-start justify-between gap-2">
												<div className="flex-1">
													<div className="flex items-center gap-2">
														<p className="text-sm font-medium">{skill.name}</p>
														{skill.disableModelInvocation && (
															<Badge variant="outline" className="text-xs">
																Manual only
															</Badge>
														)}
													</div>
													<p className="text-xs text-muted-foreground mt-1">{skill.description}</p>
												</div>
											</div>

											<div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
												<span>
													<span className="font-medium">Source:</span> {skill.source}
												</span>
												<span>•</span>
												<span className="font-mono break-all">{skill.filePath}</span>
											</div>
										</div>
									</div>
								))}
							</div>
						)}
					</CardContent>
				</Card>

				{/* Install Package Section */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Package className="h-5 w-5" />
							Install Package
						</CardTitle>
						<CardDescription>Install a Pi package from npm, git, or a local path</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<Field>
							<FieldLabel htmlFor="package-source">Package Source</FieldLabel>
							<Input
								id="package-source"
								type="text"
								placeholder="npm:@foo/bar@1.0.0, git:github.com/user/repo, or /path/to/package"
								value={packageSource}
								onChange={(e) => setPackageSource(e.target.value)}
								disabled={installStatus.isInstalling}
							/>
							<p className="text-xs text-muted-foreground mt-1">
								Examples: <code className="text-xs">npm:package-name</code>,{" "}
								<code className="text-xs">git:github.com/user/repo</code>,{" "}
								<code className="text-xs">/absolute/path</code>
							</p>
						</Field>

						<div className="flex items-center gap-2">
							<input
								type="checkbox"
								id="install-local"
								checked={installLocal}
								onChange={(e) => setInstallLocal(e.target.checked)}
								disabled={installStatus.isInstalling}
								className="h-4 w-4"
							/>
							<label htmlFor="install-local" className="text-sm cursor-pointer">
								Install to project settings (.pi/settings.json) instead of global
							</label>
						</div>

						<div className="flex gap-2">
							<Button
								onClick={handleInstall}
								disabled={installStatus.isInstalling || !packageSource.trim()}
								className="flex-1"
							>
								{installStatus.isInstalling ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Installing...
									</>
								) : (
									<>
										<Package className="mr-2 h-4 w-4" />
										Install
									</>
								)}
							</Button>
							{(installStatus.output || installStatus.error) && (
								<Button variant="outline" onClick={resetInstallStatus}>
									Clear
								</Button>
							)}
						</div>

						{installStatus.error && (
							<div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
								<p className="font-medium">Error</p>
								<p className="text-xs mt-1">{installStatus.error}</p>
							</div>
						)}

						{installStatus.output && (
							<div className="space-y-2">
								<div className="flex items-center gap-2">
									{installStatus.exitCode === 0 ? (
										<>
											<CheckCircle className="h-4 w-4 text-green-600" />
											<p className="text-sm font-medium text-green-600">Installation Successful</p>
										</>
									) : (
										<>
											<AlertCircle className="h-4 w-4 text-destructive" />
											<p className="text-sm font-medium text-destructive">
												Installation Failed (exit code: {installStatus.exitCode})
											</p>
										</>
									)}
								</div>
								<div className="rounded-md bg-muted p-3 text-xs font-mono whitespace-pre-wrap break-all max-h-60 overflow-y-auto">
									{installStatus.output}
								</div>
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
