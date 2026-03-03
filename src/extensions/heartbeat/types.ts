export interface HeartbeatActiveHours {
	start: string;
	end: string;
	timezone?: string;
}

export interface HeartbeatSettings {
	enabled: boolean;
	every: string;
	activeHours: HeartbeatActiveHours | null;
	prompt: string | null;
	ackMaxChars: number;
	resultsDir: string;
	showOk: boolean;
	model: string | null;
}

export interface HeartbeatParsedResponse {
	ok: boolean;
	ackMatched: boolean;
	response: string;
	normalizedResponse: string;
}

export interface HeartbeatRunResult extends HeartbeatParsedResponse {
	runId: string;
	timestamp: string;
	durationMs: number;
	cwd: string;
	resultsDir: string;
	error?: string;
}

export interface HeartbeatStats {
	active: boolean;
	running: boolean;
	runCount: number;
	okCount: number;
	alertCount: number;
	lastRun: string | null;
	lastResult: HeartbeatRunResult | null;
}
