export type CronSchedule =
	| { kind: "at"; at: string }
	| { kind: "every"; intervalMs: number }
	| { kind: "cron"; expression: string; tz?: string };

export interface CronDeliveryTarget {
	channel: string;
	chatId: string;
	threadId?: string;
}

/**
 * Fork context for scheduled tasks that should continue from a previous session.
 * When set, the job will fork the session at the specified entry point
 * instead of running in an ephemeral session.
 */
export interface CronForkContext {
	/** Path to the session file to fork from */
	sessionFile: string;
	/** Entry ID to fork from (the point in conversation to branch from) */
	entryId: string;
}

export interface CronJob {
	jobId: string;
	name: string;
	enabled: boolean;
	schedule: CronSchedule;
	message: string;
	delivery?: CronDeliveryTarget;
	deleteAfterRun: boolean;
	createdAt: string;
	lastRunAt?: string;
	consecutiveFailures: number;
	/** If set, fork from this session instead of running ephemeral */
	forkFrom?: CronForkContext;
}

export interface CronListItem extends CronJob {
	running: boolean;
}
