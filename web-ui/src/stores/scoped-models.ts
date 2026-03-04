/**
 * Scoped models store — manages the list of enabled/scoped models.
 * Server is the source of truth — no localStorage.
 */

import { Store } from "@tanstack/store";

export interface ScopedModelsStore {
	enabledModels: string[]; // "provider/modelId" patterns from server
	isLoading: boolean;
}

const INITIAL_STATE: ScopedModelsStore = {
	enabledModels: [],
	isLoading: false,
};

export const scopedModelsStore = new Store<ScopedModelsStore>(INITIAL_STATE);

// ─── Actions ───────────────────────────────────────────────────────────────────

export function setScopedEnabledModels(models: string[]): void {
	scopedModelsStore.setState((state) => ({
		...state,
		enabledModels: models,
	}));
}

export function setScopedModelsLoading(isLoading: boolean): void {
	scopedModelsStore.setState((state) => ({
		...state,
		isLoading: isLoading,
	}));
}

export function resetScopedModels(): void {
	scopedModelsStore.setState(() => INITIAL_STATE);
}
