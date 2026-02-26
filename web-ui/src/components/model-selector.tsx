import { useStore } from "@tanstack/react-store";
import { Check, ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { clientManager } from "@/lib/client-manager";
import type { ModelInfo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { sessionStore, setModel, setThinkingLevel as setThinkingLevelStore } from "@/stores/session";

// ─── Utility Functions ────────────────────────────────────────────────────────

/**
 * Format provider names for display
 */
function formatProviderName(provider: string): string {
	const nameMap: Record<string, string> = {
		anthropic: "Anthropic",
		openai: "OpenAI",
		google: "Google",
		"amazon-bedrock": "Amazon Bedrock",
		openrouter: "OpenRouter",
		"vercel-ai-gateway": "Vercel AI Gateway",
		xai: "xAI",
		mistral: "Mistral",
		groq: "Groq",
		huggingface: "Hugging Face",
		"google-vertex": "Google Vertex AI",
		"google-antigravity": "Google Antigravity",
		"google-gemini-cli": "Google Gemini CLI",
		"azure-openai-responses": "Azure OpenAI",
		"github-copilot": "GitHub Copilot",
		cerebras: "Cerebras",
		opencode: "OpenCode",
		zai: "Z.ai",
		minimax: "MiniMax",
		"minimax-cn": "MiniMax (CN)",
		"kimi-coding": "Kimi",
	};

	return (
		nameMap[provider] ||
		provider
			.split("-")
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(" ")
	);
}

/**
 * Extract model family and version from model name
 * Returns { family: string, version: number | null }
 */
function parseModelNameVersion(name: string): { family: string; version: number | null } {
	// Remove trailing region qualifiers and (latest) suffix
	const cleanName = name.replace(/\s+\((EU|US|Global|latest|free|exacto|thinking|Antigravity)\)$/i, "").trim();

	// Try to extract version number from the end
	// Matches patterns like "4.6", "3.5", "5.2", etc.
	const versionMatch = cleanName.match(/\s+([\d.]+)$/);

	if (versionMatch) {
		const versionStr = versionMatch[1];
		const version = parseFloat(versionStr);

		if (!isNaN(version)) {
			// Remove version from name to get family
			const family = cleanName.substring(0, cleanName.length - versionMatch[0].length).trim();
			return { family, version };
		}
	}

	// No version found - entire name is the family
	return { family: cleanName, version: null };
}

/**
 * Identify latest models per family
 * Returns { latest: ModelInfo[], older: ModelInfo[] }
 */
function identifyLatestModels(models: ModelInfo[]): {
	latest: ModelInfo[];
	older: ModelInfo[];
} {
	// Group by family
	const familyMap = new Map<string, ModelInfo[]>();

	for (const model of models) {
		const { family } = parseModelNameVersion(model.name);

		if (!familyMap.has(family)) {
			familyMap.set(family, []);
		}
		familyMap.get(family)!.push(model);
	}

	const latest: ModelInfo[] = [];
	const older: ModelInfo[] = [];

	// For each family, identify the latest version
	for (const [_family, familyModels] of familyMap) {
		if (familyModels.length === 1) {
			// Single model in family - always latest
			latest.push(familyModels[0]);
			continue;
		}

		// Parse versions and find the highest
		const modelsWithVersions = familyModels.map((m) => ({
			model: m,
			...parseModelNameVersion(m.name),
		}));

		// Models without version numbers are considered latest
		const noVersion = modelsWithVersions.filter((m) => m.version === null);
		const withVersion = modelsWithVersions.filter((m) => m.version !== null);

		if (withVersion.length === 0) {
			// No versions in this family - all are latest
			latest.push(...familyModels);
		} else {
			// Find max version
			const maxVersion = Math.max(...withVersion.map((m) => m.version!));
			const latestModels = withVersion.filter((m) => m.version === maxVersion);
			const olderModels = withVersion.filter((m) => m.version !== maxVersion);

			latest.push(...latestModels.map((m) => m.model));
			latest.push(...noVersion.map((m) => m.model));
			older.push(...olderModels.map((m) => m.model));
		}
	}

	return { latest, older };
}

/**
 * Group models by provider
 */
function groupModelsByProvider(models: ModelInfo[]): Map<string, ModelInfo[]> {
	const groups = new Map<string, ModelInfo[]>();

	for (const model of models) {
		if (!groups.has(model.provider)) {
			groups.set(model.provider, []);
		}
		groups.get(model.provider)!.push(model);
	}

	// Sort models within each provider by name
	for (const [_provider, providerModels] of groups) {
		providerModels.sort((a, b) => a.name.localeCompare(b.name));
	}

	return groups;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ModelSelector() {
	const { sessionId, model, availableModels, thinkingLevel, isStreaming } = useStore(sessionStore, (state) => ({
		sessionId: state.sessionId,
		model: state.model,
		availableModels: state.availableModels,
		thinkingLevel: state.thinkingLevel,
		isStreaming: state.isStreaming,
	}));

	const [isOpen, setIsOpen] = useState(false);

	// Memoize model grouping to avoid recomputing on every render
	const { latestModels, olderModels, shouldShowSubmenu } = useMemo(() => {
		if (availableModels.length === 0) {
			return { latestModels: [], olderModels: [], shouldShowSubmenu: false };
		}

		// If we have 10 or fewer models, show them all flat (no submenu needed)
		if (availableModels.length <= 10) {
			const sorted = [...availableModels].sort((a, b) => a.name.localeCompare(b.name));
			return { latestModels: sorted, olderModels: [], shouldShowSubmenu: false };
		}

		// Otherwise, identify latest and split
		const { latest, older } = identifyLatestModels(availableModels);

		// Sort latest by name
		latest.sort((a, b) => a.name.localeCompare(b.name));

		return {
			latestModels: latest,
			olderModels: older,
			shouldShowSubmenu: older.length > 0,
		};
	}, [availableModels]);

	// Group older models by provider
	const olderModelsByProvider = useMemo(() => {
		return groupModelsByProvider(olderModels);
	}, [olderModels]);

	const handleModelSelect = async (provider: string, modelId: string) => {
		if (!sessionId) {
			console.log("[ModelSelector] No sessionId");
			return;
		}

		console.log("[ModelSelector] Changing model:", {
			provider,
			modelId,
			sessionId,
		});

		const client = clientManager.getClient();
		if (client) {
			try {
				const result = await client.setModel(sessionId, provider, modelId);
				console.log("[ModelSelector] Model changed successfully:", result);
				// Immediately update the store with the returned model info
				setModel(result);
				setIsOpen(false);
			} catch (err) {
				console.error("[ModelSelector] Failed to set model:", err);
			}
		} else {
			console.error("[ModelSelector] No client available");
		}
	};

	const handleThinkingLevelChange = async (level: "off" | "minimal" | "low" | "medium" | "high" | "xhigh") => {
		if (!sessionId) return;

		const client = clientManager.getClient();
		if (client) {
			try {
				await client.setThinkingLevel(sessionId, level);
				// Immediately update the store
				setThinkingLevelStore(level);
			} catch (err) {
				console.error("Failed to set thinking level:", err);
			}
		}
	};

	const thinkingLevelOptions = [
		{ value: "off" as const, label: "Off" },
		{ value: "minimal" as const, label: "Minimal" },
		{ value: "low" as const, label: "Low" },
		{ value: "medium" as const, label: "Medium" },
		{ value: "high" as const, label: "High" },
		{ value: "xhigh" as const, label: "XHigh" },
	];

	if (!model) {
		return null;
	}

	const renderModelItem = (m: ModelInfo) => {
		const isActive = model.provider === m.provider && model.id === m.id;
		return (
			<DropdownMenuItem
				key={`${m.provider}/${m.id}`}
				onClick={() => handleModelSelect(m.provider, m.id)}
				className="flex items-start gap-2 py-2"
			>
				<div className="flex h-5 w-5 items-center justify-center shrink-0">
					{isActive && <Check className="h-4 w-4" />}
				</div>
				<div className="flex-1 min-w-0">
					<div className="font-medium">{m.name}</div>
					<div className="text-xs text-muted-foreground line-clamp-2">{getModelDescription(m)}</div>
				</div>
			</DropdownMenuItem>
		);
	};

	return (
		<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
			<DropdownMenuTrigger
				type="button"
				disabled={isStreaming || !sessionId}
				className={cn(
					"flex flex-col items-start gap-0.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm transition-colors",
					"hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				)}
			>
				<div className="flex items-center gap-1.5 w-full">
					<span className="font-medium">{model.name}</span>
					<ChevronDown className="h-4 w-4 text-muted-foreground ml-auto" />
				</div>
				{thinkingLevel !== "medium" && <span className="text-xs text-muted-foreground">thinking: {thinkingLevel}</span>}
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-80">
				<DropdownMenuGroup>
					<DropdownMenuLabel>Select Model</DropdownMenuLabel>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />

				{/* Latest models shown directly */}
				<div className="max-h-96 overflow-y-auto">{latestModels.map(renderModelItem)}</div>

				{/* "Other models" submenu if we have older models */}
				{shouldShowSubmenu && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuSub>
							<DropdownMenuSubTrigger>
								<span>Other models</span>
							</DropdownMenuSubTrigger>
							<DropdownMenuSubContent className="w-80 max-h-96 overflow-y-auto">
								{Array.from(olderModelsByProvider.entries())
									.sort(([providerA], [providerB]) =>
										formatProviderName(providerA).localeCompare(formatProviderName(providerB)),
									)
									.map(([provider, models]) => (
										<div key={provider}>
											<DropdownMenuLabel className="sticky top-0 bg-popover z-10">
												{formatProviderName(provider)}
											</DropdownMenuLabel>
											{models.map(renderModelItem)}
											<DropdownMenuSeparator className="my-1" />
										</div>
									))}
							</DropdownMenuSubContent>
						</DropdownMenuSub>
					</>
				)}

				<DropdownMenuSeparator />

				<DropdownMenuSub>
					<DropdownMenuSubTrigger>
						<span>Thinking Level</span>
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent>
						{thinkingLevelOptions.map((option) => (
							<DropdownMenuItem
								key={option.value}
								onClick={() => handleThinkingLevelChange(option.value)}
								className="flex items-center gap-2"
							>
								<div className="flex h-5 w-5 items-center justify-center shrink-0">
									{thinkingLevel === option.value && <Check className="h-4 w-4" />}
								</div>
								<span>{option.label}</span>
							</DropdownMenuItem>
						))}
					</DropdownMenuSubContent>
				</DropdownMenuSub>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function getModelDescription(model: { provider: string; id: string; name: string }): string {
	// Provide fallback descriptions based on model name patterns
	const name = model.name.toLowerCase();

	if (name.includes("opus")) {
		return "Most capable for ambitious work";
	}
	if (name.includes("sonnet")) {
		return "Most efficient for everyday tasks";
	}
	if (name.includes("haiku")) {
		return "Fastest for quick answers";
	}
	if (name.includes("gpt-4")) {
		return "Advanced reasoning and analysis";
	}
	if (name.includes("gpt-3.5")) {
		return "Fast and efficient";
	}
	if (name.includes("gemini")) {
		return "Google's multimodal AI";
	}
	if (name.includes("claude")) {
		return "Anthropic's AI assistant";
	}

	return `${model.provider}/${model.id}`;
}
