/**
 * Server types — decoupled from packages/lil to avoid circular dependencies.
 * The daemon injects concrete implementations.
 */

export interface AgentState {
	systemPrompt?: string;
	model?: {
		provider: string;
		id: string;
		name: string;
	} | null;
	thinkingLevel?: string;
	tools?: Array<{
		name: string;
		description: string;
		label?: string;
		parameters?: unknown;
	}>;
	messages: Array<{
		role: "user" | "assistant" | "system";
		content: Array<{
			type: string;
			text?: string;
			[key: string]: unknown;
		}>;
	}>;
	isStreaming: boolean;
	streamMessage?: {
		role: "assistant";
		content: Array<{ type: string; text?: string; [key: string]: unknown }>;
	};
	pendingToolCalls?: Array<string>;
	error?: unknown;
}

export interface AgentSession {
	state: AgentState;
	subscribe: (listener: (event: AgentSessionEvent) => void) => () => void;
	prompt: (
		text: string,
		options?: {
			source?: string;
			images?: Array<{
				type: "image";
				data: string;
				mimeType: string;
			}>;
		},
	) => Promise<void>;
	abort: () => Promise<void>;
	newSession: () => Promise<boolean>;
}

export interface AgentSessionEvent {
	type: string;
	[key: string]: unknown;
}

export interface LilConfig {
	agent?: {
		persona?: string;
		workspace?: string;
		agentDir?: string;
		model?: {
			primary?: string;
			fallbacks?: string[];
		};
	};
	web?: {
		enabled?: boolean;
		persona?: string;
		host?: string;
		port?: number;
		token?: string;
	};
	channels?: {
		telegram?: {
			enabled?: boolean;
			persona?: string;
			botToken?: string;
			allowFrom?: number[];
		};
	};
}

export interface WebServerDeps {
	token: string;
	config: LilConfig;
	getSession: (sessionKey: string, config: LilConfig, personaName?: string) => Promise<AgentSession>;
	resetSession: (sessionKey: string) => Promise<void> | void;
	listSessionNames: (chatIdentifier: string) => string[];
}

export interface WsClientData {
	owner: string;
	sessionName: string;
	sessionKey: string;
	unsubscribe?: () => void;
	chain: Promise<void>;
}

export interface UploadedFile {
	id: string;
	owner: string;
	fileName: string;
	mimeType: string;
	size: number;
	path: string;
	createdAt: number;
}
