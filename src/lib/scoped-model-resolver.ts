const THINKING_LEVEL_SUFFIXES = new Set(["off", "minimal", "low", "medium", "high", "xhigh"]);

export interface ScopedModelCandidate {
	provider: string;
	id: string;
}

function stripThinkingSuffix(pattern: string): string {
	const trimmed = pattern.trim();
	const lastColon = trimmed.lastIndexOf(":");
	if (lastColon === -1) return trimmed;

	const suffix = trimmed.slice(lastColon + 1).toLowerCase();
	if (THINKING_LEVEL_SUFFIXES.has(suffix)) {
		return trimmed.slice(0, lastColon);
	}

	return trimmed;
}

function hasGlob(pattern: string): boolean {
	return pattern.includes("*") || pattern.includes("?");
}

function toGlobRegex(pattern: string): RegExp {
	const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
	const regex = `^${escaped.replace(/\*/g, ".*").replace(/\?/g, ".")}$`;
	return new RegExp(regex, "i");
}

function matchesPattern(pattern: string, model: ScopedModelCandidate): boolean {
	const normalized = stripThinkingSuffix(pattern);
	if (!normalized) return false;

	const fullId = `${model.provider}/${model.id}`;

	if (hasGlob(normalized)) {
		const regex = toGlobRegex(normalized);
		return regex.test(fullId) || regex.test(model.id);
	}

	const slashIndex = normalized.indexOf("/");
	if (slashIndex !== -1) {
		const provider = normalized.slice(0, slashIndex);
		const modelId = normalized.slice(slashIndex + 1);
		return model.provider.toLowerCase() === provider.toLowerCase() && model.id.toLowerCase() === modelId.toLowerCase();
	}

	return fullId.toLowerCase() === normalized.toLowerCase() || model.id.toLowerCase() === normalized.toLowerCase();
}

export function resolveScopedModels<T extends ScopedModelCandidate>(patterns: string[], available: T[]): T[] {
	const resolved: T[] = [];
	const seen = new Set<string>();

	for (const pattern of patterns) {
		for (const model of available) {
			if (!matchesPattern(pattern, model)) continue;

			const key = `${model.provider}/${model.id}`;
			if (seen.has(key)) continue;

			seen.add(key);
			resolved.push(model);
		}
	}

	return resolved;
}
