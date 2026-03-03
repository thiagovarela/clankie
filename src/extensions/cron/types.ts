export type CronSchedule =
	| { kind: "at"; at: string }
	| { kind: "every"; intervalMs: number }
	| { kind: "cron"; expression: string; tz?: string };

export interface CronDeliveryTarget {
	channel: string;
	chatId: string;
	threadId?: string;
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
}

export interface CronListItem extends CronJob {
	running: boolean;
}
