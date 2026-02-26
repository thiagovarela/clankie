import { describe, expect, it } from "vitest";
import type { ThinkingLevel } from "@/lib/types";
import { makeModelInfo, makeSessionState } from "@/test/fixtures";
import {
	resetSession,
	sessionStore,
	setAvailableModels,
	setCompacting,
	setModel,
	setSessionId,
	setSessionName,
	setStreaming,
	setThinkingLevel,
	updateSessionState,
} from "../session";

describe("session store", () => {
	describe("setSessionId", () => {
		it("sets the session id", () => {
			setSessionId("session-123");

			expect(sessionStore.state.sessionId).toBe("session-123");
		});
	});

	describe("setModel", () => {
		it("sets the current model", () => {
			const model = makeModelInfo({ name: "Claude 3.5 Sonnet" });
			setModel(model);

			expect(sessionStore.state.model).toEqual(model);
		});
	});

	describe("setAvailableModels", () => {
		it("sets the list of available models", () => {
			const models = [
				makeModelInfo({ id: "model-1", name: "Model 1" }),
				makeModelInfo({ id: "model-2", name: "Model 2" }),
			];
			setAvailableModels(models);

			expect(sessionStore.state.availableModels).toEqual(models);
		});

		it("replaces the previous list", () => {
			setAvailableModels([makeModelInfo({ id: "old" })]);
			setAvailableModels([makeModelInfo({ id: "new" })]);

			expect(sessionStore.state.availableModels).toHaveLength(1);
			expect(sessionStore.state.availableModels[0].id).toBe("new");
		});
	});

	describe("setThinkingLevel", () => {
		it("sets the thinking level", () => {
			const levels: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

			for (const level of levels) {
				setThinkingLevel(level);
				expect(sessionStore.state.thinkingLevel).toBe(level);
			}
		});
	});

	describe("setSessionName", () => {
		it("sets the session name", () => {
			setSessionName("My Chat Session");

			expect(sessionStore.state.sessionName).toBe("My Chat Session");
		});
	});

	describe("setStreaming", () => {
		it("sets isStreaming to true", () => {
			setStreaming(true);

			expect(sessionStore.state.isStreaming).toBe(true);
		});

		it("sets isStreaming to false", () => {
			setStreaming(true);
			setStreaming(false);

			expect(sessionStore.state.isStreaming).toBe(false);
		});
	});

	describe("setCompacting", () => {
		it("sets isCompacting to true", () => {
			setCompacting(true);

			expect(sessionStore.state.isCompacting).toBe(true);
		});

		it("sets isCompacting to false", () => {
			setCompacting(true);
			setCompacting(false);

			expect(sessionStore.state.isCompacting).toBe(false);
		});
	});

	describe("updateSessionState", () => {
		it("merges partial session state", () => {
			const partialState = makeSessionState({
				model: makeModelInfo({ name: "New Model" }),
				thinkingLevel: "high",
				messageCount: 5,
			});

			updateSessionState(partialState);

			expect(sessionStore.state).toMatchObject({
				model: partialState.model,
				thinkingLevel: "high",
				messageCount: 5,
			});
		});

		it("ignores the sessionId field in updates", () => {
			setSessionId("original-session-id");

			const stateWithSessionId = makeSessionState({
				sessionId: "this-should-be-ignored",
				thinkingLevel: "high",
			});

			updateSessionState(stateWithSessionId);

			// sessionId should remain unchanged
			expect(sessionStore.state.sessionId).toBe("original-session-id");
			// But other fields should update
			expect(sessionStore.state.thinkingLevel).toBe("high");
		});

		it("updates all new fields (steeringMode, followUpMode, autoCompactionEnabled, messageCount)", () => {
			updateSessionState({
				steeringMode: "all",
				followUpMode: "all",
				autoCompactionEnabled: true,
				messageCount: 15,
			} as any);

			expect(sessionStore.state).toMatchObject({
				steeringMode: "all",
				followUpMode: "all",
				autoCompactionEnabled: true,
				messageCount: 15,
			});
		});

		it("supports partial updates (only some fields)", () => {
			updateSessionState({ thinkingLevel: "xhigh" } as any);

			expect(sessionStore.state.thinkingLevel).toBe("xhigh");
			// Other fields remain at defaults
			expect(sessionStore.state.steeringMode).toBe("one-at-a-time");
		});

		it("handles undefined sessionName", () => {
			setSessionName("Original Name");
			updateSessionState({ sessionName: undefined } as any);

			expect(sessionStore.state.sessionName).toBeUndefined();
		});
	});

	describe("resetSession", () => {
		it("resets the store to initial state", () => {
			setSessionId("session-123");
			setModel(makeModelInfo());
			setThinkingLevel("high");
			setStreaming(true);
			setCompacting(true);
			setSessionName("Test Session");

			resetSession();

			expect(sessionStore.state).toEqual({
				sessionId: null,
				model: null,
				availableModels: [],
				thinkingLevel: "medium",
				isStreaming: false,
				isCompacting: false,
				steeringMode: "one-at-a-time",
				followUpMode: "one-at-a-time",
				sessionName: undefined,
				autoCompactionEnabled: false,
				messageCount: 0,
			});
		});
	});
});
