/**
 * Auth store — manages AI provider authentication state and login flows.
 */

import { Store } from "@tanstack/store";
import type { AuthEvent, AuthProvider } from "@/lib/types";

export interface LoginFlowState {
	loginFlowId: string;
	providerId: string;
	status: "idle" | "waiting_url" | "waiting_input" | "in_progress" | "complete" | "error";
	url?: string;
	instructions?: string;
	promptMessage?: string;
	promptPlaceholder?: string;
	showManualInput?: boolean;
	progressMessage?: string;
	error?: string;
	success?: boolean;
}

export interface AuthStore {
	providers: Array<AuthProvider>;
	isLoadingProviders: boolean;
	loginFlow: LoginFlowState | null;
}

const INITIAL_STATE: AuthStore = {
	providers: [],
	isLoadingProviders: false,
	loginFlow: null,
};

export const authStore = new Store<AuthStore>(INITIAL_STATE);

// ─── Actions ───────────────────────────────────────────────────────────────────

export function setLoadingProviders(loading: boolean): void {
	authStore.setState((state) => ({
		...state,
		isLoadingProviders: loading,
	}));
}

export function setProviders(providers: Array<AuthProvider>): void {
	authStore.setState((state) => ({
		...state,
		providers,
		isLoadingProviders: false,
	}));
}

export function startLoginFlow(loginFlowId: string, providerId: string): void {
	authStore.setState((state) => ({
		...state,
		loginFlow: {
			loginFlowId,
			providerId,
			status: "idle",
		},
	}));
}

export function updateLoginFlow(event: AuthEvent): void {
	authStore.setState((state) => {
		if (!state.loginFlow || state.loginFlow.loginFlowId !== event.loginFlowId) {
			return state;
		}

		const updatedFlow = { ...state.loginFlow };

		switch (event.event) {
			case "url":
				updatedFlow.status = "waiting_url";
				updatedFlow.url = event.url;
				updatedFlow.instructions = event.instructions;
				break;

			case "prompt":
				updatedFlow.status = "waiting_input";
				updatedFlow.promptMessage = event.message;
				updatedFlow.promptPlaceholder = event.placeholder;
				break;

			case "manual_input":
				updatedFlow.showManualInput = true;
				break;

			case "progress":
				updatedFlow.status = "in_progress";
				updatedFlow.progressMessage = event.message;
				break;

			case "complete":
				updatedFlow.status = event.success ? "complete" : "error";
				updatedFlow.success = event.success;
				updatedFlow.error = event.error;
				break;
		}

		return {
			...state,
			loginFlow: updatedFlow,
		};
	});
}

export function clearLoginFlow(): void {
	authStore.setState((state) => ({
		...state,
		loginFlow: null,
	}));
}

export function resetAuth(): void {
	authStore.setState(INITIAL_STATE);
}
