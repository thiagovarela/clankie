/**
 * Notification storage and management system.
 *
 * Notifications are persisted to disk (~/.clankie/notifications.json)
 * and broadcast to connected WebSocket clients in real-time.
 *
 * Features:
 * - Auto-pruning of old notifications (500 entry limit)
 * - Deduplication (prevents spam from frequent failures)
 * - Atomic file writes (write to temp, then rename)
 * - Real-time broadcast callback for WebSocket delivery
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { getAppDir } from "./config.ts";

// ─── Types ───────────────────────────────────────────────────────────────────

export type NotificationType = "info" | "warning" | "error" | "success";
export type NotificationSource = "heartbeat" | "cron" | "session" | "system";

export interface Notification {
	/** Unique identifier (UUID) */
	id: string;
	/** Notification severity/type */
	type: NotificationType;
	/** Source system that created the notification */
	source: NotificationSource;
	/** Short title for display */
	title: string;
	/** Full message content */
	message: string;
	/** ISO 8601 timestamp */
	timestamp: string;
	/** Whether the user has read this notification */
	read: boolean;
	/** Whether the user has dismissed this notification */
	dismissed: boolean;
	/** Optional linked session ID */
	sessionId?: string;
	/** Optional URL to navigate to on click */
	actionUrl?: string;
	/** Additional metadata for extensibility */
	metadata?: Record<string, unknown>;
}

export interface CreateNotificationInput {
	type: NotificationType;
	source: NotificationSource;
	title: string;
	message: string;
	sessionId?: string;
	actionUrl?: string;
	metadata?: Record<string, unknown>;
	/** If provided, will deduplicate against existing unread notifications with same source and dedupKey */
	dedupKey?: string;
}

export interface NotificationFilter {
	/** Include notifications marked as read (default: true) */
	includeRead?: boolean;
	/** Include dismissed notifications (default: false) */
	includeDismissed?: boolean;
	/** Filter by source */
	source?: NotificationSource;
	/** Limit results (default: 100) */
	limit?: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_NOTIFICATIONS = 500;
const PRUNE_TARGET = 400;
const NOTIFICATIONS_FILE = "notifications.json";

// ─── State ───────────────────────────────────────────────────────────────────

let notifications: Notification[] = [];
let writeQueue: Promise<void> = Promise.resolve();
let broadcastCallback: ((notification: Notification) => void) | null = null;

// ─── File Operations ─────────────────────────────────────────────────────────

function getNotificationsPath(): string {
	return join(getAppDir(), NOTIFICATIONS_FILE);
}

function loadNotifications(): Notification[] {
	const filePath = getNotificationsPath();
	if (!existsSync(filePath)) {
		return [];
	}

	try {
		const content = readFileSync(filePath, "utf-8");
		const parsed = JSON.parse(content);
		if (Array.isArray(parsed)) {
			return parsed;
		}
	} catch (err) {
		console.error("[notifications] Failed to load notifications:", err);
	}

	return [];
}

function atomicWrite(filePath: string, data: string): void {
	const tempPath = `${filePath}.tmp`;
	writeFileSync(tempPath, data, "utf-8");
	renameSync(tempPath, filePath);
}

function persistNotifications(): void {
	const filePath = getNotificationsPath();
	const dir = filePath.substring(0, filePath.lastIndexOf("/"));
	
	// Ensure directory exists
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}

	atomicWrite(filePath, JSON.stringify(notifications, null, 2));
}

function queuePersist(): void {
	writeQueue = writeQueue.then(() => {
		try {
			persistNotifications();
		} catch (err) {
			console.error("[notifications] Failed to persist:", err);
		}
	});
}

// ─── Pruning ─────────────────────────────────────────────────────────────────

function pruneNotifications(): void {
	if (notifications.length <= MAX_NOTIFICATIONS) {
		return;
	}

	// Sort by timestamp (newest first)
	const sorted = [...notifications].sort(
		(a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
	);

	// First pass: remove dismissed notifications
	const withoutDismissed = sorted.filter((n) => !n.dismissed);
	let toKeep = withoutDismissed;

	// If still over limit, remove read notifications
	if (toKeep.length > PRUNE_TARGET) {
		const unread = toKeep.filter((n) => !n.read);
		const read = toKeep.filter((n) => n.read);
		// Keep all unread, then oldest read up to limit
		const readToKeep = read.slice(0, Math.max(0, PRUNE_TARGET - unread.length));
		toKeep = [...unread, ...readToKeep];
	}

	// If still over limit, just take the newest
	if (toKeep.length > PRUNE_TARGET) {
		toKeep = toKeep.slice(0, PRUNE_TARGET);
	}

	notifications = toKeep.sort((a, b) => {
		// Maintain stable order by timestamp then id
		const timeDiff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
		if (timeDiff !== 0) return timeDiff;
		return a.id.localeCompare(b.id);
	});

	console.log(`[notifications] Pruned from ${sorted.length} to ${notifications.length} entries`);
}

// ─── Deduplication ───────────────────────────────────────────────────────────

function findDuplicate(input: CreateNotificationInput): Notification | undefined {
	if (!input.dedupKey) return undefined;

	// Look for unread notification from same source with matching dedupKey in metadata
	return notifications.find((n) => {
		if (n.read || n.dismissed) return false;
		if (n.source !== input.source) return false;
		return n.metadata?.dedupKey === input.dedupKey;
	});
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Initialize the notification store. Call once at startup.
 */
export function initNotifications(): void {
	notifications = loadNotifications();
	console.log(`[notifications] Loaded ${notifications.length} notifications`);
}

/**
 * Set a callback to be called when a new notification is created.
 * The WebChannel uses this to broadcast to all connected clients.
 */
export function setBroadcastCallback(callback: ((notification: Notification) => void) | null): void {
	broadcastCallback = callback;
}

/**
 * Create a new notification.
 * If dedupKey is provided and matches an existing unread notification,
 * the existing notification is updated instead of creating a new one.
 */
export function createNotification(input: CreateNotificationInput): Notification {
	// Check for duplicate
	const duplicate = findDuplicate(input);
	if (duplicate) {
		// Update the existing notification with new message and timestamp
		duplicate.message = input.message;
		duplicate.timestamp = new Date().toISOString();
		duplicate.title = input.title;
		duplicate.type = input.type;
		duplicate.metadata = { ...duplicate.metadata, ...input.metadata };
		queuePersist();
		
		if (broadcastCallback) {
			broadcastCallback(duplicate);
		}
		
		return duplicate;
	}

	const notification: Notification = {
		id: randomUUID(),
		type: input.type,
		source: input.source,
		title: input.title,
		message: input.message,
		timestamp: new Date().toISOString(),
		read: false,
		dismissed: false,
		sessionId: input.sessionId,
		actionUrl: input.actionUrl,
		metadata: input.metadata,
	};

	notifications.push(notification);
	pruneNotifications();
	queuePersist();

	if (broadcastCallback) {
		broadcastCallback(notification);
	}

	return notification;
}

/**
 * Get notifications matching the filter criteria.
 */
export function getNotifications(filter: NotificationFilter = {}): Notification[] {
	const {
		includeRead = true,
		includeDismissed = false,
		source,
		limit = 100,
	} = filter;

	let result = notifications;

	if (!includeDismissed) {
		result = result.filter((n) => !n.dismissed);
	}

	if (!includeRead) {
		result = result.filter((n) => !n.read);
	}

	if (source) {
		result = result.filter((n) => n.source === source);
	}

	// Sort by timestamp descending
	result = result.sort(
		(a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
	);

	return result.slice(0, limit);
}

/**
 * Get a single notification by ID.
 */
export function getNotification(id: string): Notification | undefined {
	return notifications.find((n) => n.id === id);
}

/**
 * Mark a notification as read.
 */
export function markRead(id: string): Notification | undefined {
	const notification = notifications.find((n) => n.id === id);
	if (notification && !notification.read) {
		notification.read = true;
		queuePersist();
	}
	return notification;
}

/**
 * Mark all notifications as read.
 */
export function markAllRead(): number {
	let count = 0;
	for (const notification of notifications) {
		if (!notification.read && !notification.dismissed) {
			notification.read = true;
			count++;
		}
	}
	if (count > 0) {
		queuePersist();
	}
	return count;
}

/**
 * Dismiss a notification (soft delete - keeps in storage but hidden from UI).
 */
export function dismissNotification(id: string): Notification | undefined {
	const notification = notifications.find((n) => n.id === id);
	if (notification && !notification.dismissed) {
		notification.dismissed = true;
		queuePersist();
	}
	return notification;
}

/**
 * Dismiss all notifications.
 */
export function dismissAll(): number {
	let count = 0;
	for (const notification of notifications) {
		if (!notification.dismissed) {
			notification.dismissed = true;
			count++;
		}
	}
	if (count > 0) {
		queuePersist();
	}
	return count;
}

/**
 * Get count of unread notifications.
 */
export function getUnreadCount(): number {
	return notifications.filter((n) => !n.read && !n.dismissed).length;
}

/**
 * Get count of all non-dismissed notifications.
 */
export function getActiveCount(): number {
	return notifications.filter((n) => !n.dismissed).length;
}

/**
 * Permanently delete old dismissed notifications (for manual cleanup).
 */
export function cleanupOldDismissed(olderThanDays: number): number {
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - olderThanDays);
	const cutoffTime = cutoff.getTime();

	const beforeCount = notifications.length;
	notifications = notifications.filter((n) => {
		if (!n.dismissed) return true;
		const notificationTime = new Date(n.timestamp).getTime();
		return notificationTime > cutoffTime;
	});

	const deleted = beforeCount - notifications.length;
	if (deleted > 0) {
		queuePersist();
	}
	return deleted;
}
