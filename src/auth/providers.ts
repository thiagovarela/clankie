/**
 * Shared auth provider helpers for CLI + Web UI.
 */

export interface NamedProvider {
	id: string;
	name: string;
}

export const CURATED_API_KEY_PROVIDERS: NamedProvider[] = [
	{ id: "anthropic", name: "Anthropic" },
	{ id: "openai", name: "OpenAI" },
	{ id: "google", name: "Google (Gemini)" },
	{ id: "xai", name: "xAI (Grok)" },
	{ id: "groq", name: "Groq" },
	{ id: "openrouter", name: "OpenRouter" },
	{ id: "mistral", name: "Mistral" },
];

export function formatProviderName(providerId: string): string {
	const lower = providerId.toLowerCase();
	if (lower === "xai") return "xAI (Grok)";
	if (lower === "openai") return "OpenAI";
	if (lower === "anthropic") return "Anthropic";
	if (lower === "openrouter") return "OpenRouter";
	if (lower === "mistral") return "Mistral";
	if (lower === "groq") return "Groq";
	if (lower === "google") return "Google (Gemini)";

	return providerId
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
		.join(" ");
}

export function buildApiKeyProviders(
	oauthIds: Set<string>,
	dynamicProviderIds: Iterable<string>,
): NamedProvider[] {
	const byId = new Map<string, string>();

	for (const provider of CURATED_API_KEY_PROVIDERS) {
		if (!oauthIds.has(provider.id)) {
			byId.set(provider.id, provider.name);
		}
	}

	for (const providerId of dynamicProviderIds) {
		if (!providerId || oauthIds.has(providerId)) continue;
		if (!byId.has(providerId)) {
			byId.set(providerId, formatProviderName(providerId));
		}
	}

	return Array.from(byId.entries())
		.map(([id, name]) => ({ id, name }))
		.sort((a, b) => a.name.localeCompare(b.name));
}
