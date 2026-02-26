/**
 * Extensions store — manages extensions and skills state.
 */

import { Store } from "@tanstack/store";
import type { ExtensionError, ExtensionInfo, SkillDiagnostic, SkillInfo } from "@/lib/types";

export interface InstallStatus {
	isInstalling: boolean;
	output: string;
	exitCode: number | null;
	error?: string;
}

export interface ExtensionsStore {
	extensions: Array<ExtensionInfo>;
	extensionErrors: Array<ExtensionError>;
	skills: Array<SkillInfo>;
	skillDiagnostics: Array<SkillDiagnostic>;
	isLoading: boolean;
	installStatus: InstallStatus;
}

const INITIAL_STATE: ExtensionsStore = {
	extensions: [],
	extensionErrors: [],
	skills: [],
	skillDiagnostics: [],
	isLoading: false,
	installStatus: {
		isInstalling: false,
		output: "",
		exitCode: null,
	},
};

export const extensionsStore = new Store<ExtensionsStore>(INITIAL_STATE);

// ─── Actions ───────────────────────────────────────────────────────────────────

export function setLoading(loading: boolean): void {
	extensionsStore.setState((state) => ({
		...state,
		isLoading: loading,
	}));
}

export function setExtensions(extensions: Array<ExtensionInfo>, errors: Array<ExtensionError>): void {
	extensionsStore.setState((state) => ({
		...state,
		extensions,
		extensionErrors: errors,
		isLoading: false,
	}));
}

export function setSkills(skills: Array<SkillInfo>, diagnostics: Array<SkillDiagnostic>): void {
	extensionsStore.setState((state) => ({
		...state,
		skills,
		skillDiagnostics: diagnostics,
		isLoading: false,
	}));
}

export function setInstallStatus(status: Partial<InstallStatus>): void {
	extensionsStore.setState((state) => ({
		...state,
		installStatus: {
			...state.installStatus,
			...status,
		},
	}));
}

export function resetInstallStatus(): void {
	extensionsStore.setState((state) => ({
		...state,
		installStatus: {
			isInstalling: false,
			output: "",
			exitCode: null,
			error: undefined,
		},
	}));
}

export function resetExtensions(): void {
	extensionsStore.setState(INITIAL_STATE);
}
