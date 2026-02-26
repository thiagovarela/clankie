import { describe, expect, it } from "vitest";
import { makeSessionListItem } from "@/test/fixtures";
import {
	addSession,
	clearSessions,
	removeSession,
	sessionsListStore,
	setActiveSession,
	updateSessionMeta,
} from "../sessions-list";

describe("sessions-list store", () => {
	describe("addSession", () => {
		it("adds a new session to the list", () => {
			const session = makeSessionListItem({ sessionId: "session-1", title: "First Chat" });
			addSession(session);

			const { sessions } = sessionsListStore.state;
			expect(sessions).toHaveLength(1);
			expect(sessions[0]).toEqual(session);
		});

		it("adds multiple sessions", () => {
			addSession(makeSessionListItem({ sessionId: "session-1" }));
			addSession(makeSessionListItem({ sessionId: "session-2" }));
			addSession(makeSessionListItem({ sessionId: "session-3" }));

			const { sessions } = sessionsListStore.state;
			expect(sessions).toHaveLength(3);
		});

		it("does not add duplicate sessions (deduplication by sessionId)", () => {
			const session = makeSessionListItem({ sessionId: "session-1", title: "Original" });
			addSession(session);
			addSession({ ...session, title: "Duplicate" });

			const { sessions } = sessionsListStore.state;
			expect(sessions).toHaveLength(1);
			expect(sessions[0].title).toBe("Original");
		});
	});

	describe("removeSession", () => {
		it("removes a session by id", () => {
			addSession(makeSessionListItem({ sessionId: "session-1" }));
			addSession(makeSessionListItem({ sessionId: "session-2" }));
			removeSession("session-1");

			const { sessions } = sessionsListStore.state;
			expect(sessions).toHaveLength(1);
			expect(sessions[0].sessionId).toBe("session-2");
		});

		it("clears activeSessionId if removing the active session", () => {
			addSession(makeSessionListItem({ sessionId: "session-1" }));
			setActiveSession("session-1");
			removeSession("session-1");

			const { activeSessionId } = sessionsListStore.state;
			expect(activeSessionId).toBeNull();
		});

		it("keeps activeSessionId if removing a different session", () => {
			addSession(makeSessionListItem({ sessionId: "session-1" }));
			addSession(makeSessionListItem({ sessionId: "session-2" }));
			setActiveSession("session-1");
			removeSession("session-2");

			const { activeSessionId } = sessionsListStore.state;
			expect(activeSessionId).toBe("session-1");
		});

		it("does nothing if session does not exist", () => {
			addSession(makeSessionListItem({ sessionId: "session-1" }));
			removeSession("nonexistent");

			const { sessions } = sessionsListStore.state;
			expect(sessions).toHaveLength(1);
		});
	});

	describe("setActiveSession", () => {
		it("sets the active session id", () => {
			setActiveSession("session-123");

			const { activeSessionId } = sessionsListStore.state;
			expect(activeSessionId).toBe("session-123");
		});

		it("can change the active session", () => {
			setActiveSession("session-1");
			setActiveSession("session-2");

			const { activeSessionId } = sessionsListStore.state;
			expect(activeSessionId).toBe("session-2");
		});
	});

	describe("updateSessionMeta", () => {
		it("updates a session's metadata by id", () => {
			addSession(makeSessionListItem({ sessionId: "session-1", title: "Old Title", messageCount: 5 }));
			updateSessionMeta("session-1", { title: "New Title" });

			const { sessions } = sessionsListStore.state;
			expect(sessions[0]).toMatchObject({
				sessionId: "session-1",
				title: "New Title",
				messageCount: 5, // Unchanged
			});
		});

		it("updates messageCount", () => {
			addSession(makeSessionListItem({ sessionId: "session-1", messageCount: 0 }));
			updateSessionMeta("session-1", { messageCount: 10 });

			const { sessions } = sessionsListStore.state;
			expect(sessions[0].messageCount).toBe(10);
		});

		it("supports partial updates", () => {
			addSession(
				makeSessionListItem({
					sessionId: "session-1",
					title: "Original",
					messageCount: 5,
				}),
			);
			updateSessionMeta("session-1", { messageCount: 10 });

			const { sessions } = sessionsListStore.state;
			expect(sessions[0]).toMatchObject({
				title: "Original",
				messageCount: 10,
			});
		});

		it("does not update if session does not exist", () => {
			addSession(makeSessionListItem({ sessionId: "session-1", title: "Original" }));
			updateSessionMeta("session-2", { title: "Should not appear" });

			const { sessions } = sessionsListStore.state;
			expect(sessions).toHaveLength(1);
			expect(sessions[0].title).toBe("Original");
		});

		it("does not change sessionId or createdAt", () => {
			const original = makeSessionListItem({
				sessionId: "session-1",
				createdAt: 1234567890,
			});
			addSession(original);

			// Attempt to update immutable fields (should be ignored by type, but verify)
			updateSessionMeta("session-1", { title: "Updated" });

			const { sessions } = sessionsListStore.state;
			expect(sessions[0].sessionId).toBe("session-1");
			expect(sessions[0].createdAt).toBe(1234567890);
		});
	});

	describe("clearSessions", () => {
		it("resets the store to initial state", () => {
			addSession(makeSessionListItem({ sessionId: "session-1" }));
			addSession(makeSessionListItem({ sessionId: "session-2" }));
			setActiveSession("session-1");

			clearSessions();

			expect(sessionsListStore.state).toEqual({
				sessions: [],
				activeSessionId: null,
			});
		});
	});
});
