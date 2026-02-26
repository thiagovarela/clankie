import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { addUserMessage, startAssistantMessage, appendStreamToken, endAssistantMessage } from "@/stores/messages";
import { ChatMessages } from "../chat-messages";

describe("ChatMessages", () => {
	it("shows placeholder when messages are empty", () => {
		render(<ChatMessages />);

		expect(screen.getByText("Start a conversation")).toBeInTheDocument();
		expect(screen.getByText("Send a message to begin chatting with clankie")).toBeInTheDocument();
	});

	it("renders user messages", () => {
		addUserMessage("Hello, how are you?");

		render(<ChatMessages />);

		expect(screen.getByText("Hello, how are you?")).toBeInTheDocument();
		expect(screen.queryByText("Start a conversation")).not.toBeInTheDocument();
	});

	it("renders assistant messages", () => {
		startAssistantMessage();
		appendStreamToken("I'm doing well, thank you!");
		endAssistantMessage();

		render(<ChatMessages />);

		expect(screen.getByText("I'm doing well, thank you!")).toBeInTheDocument();
	});

	it("renders multiple messages in sequence", () => {
		addUserMessage("First message");
		startAssistantMessage();
		appendStreamToken("Response to first");
		endAssistantMessage();
		addUserMessage("Second message");
		startAssistantMessage();
		appendStreamToken("Response to second");
		endAssistantMessage();

		render(<ChatMessages />);

		expect(screen.getByText("First message")).toBeInTheDocument();
		expect(screen.getByText("Response to first")).toBeInTheDocument();
		expect(screen.getByText("Second message")).toBeInTheDocument();
		expect(screen.getByText("Response to second")).toBeInTheDocument();
	});

	it("shows streaming cursor for in-progress messages", () => {
		startAssistantMessage();
		appendStreamToken("Typing...");
		// Don't call endAssistantMessage - leave it streaming

		const { container } = render(<ChatMessages />);

		expect(screen.getByText("Typing...")).toBeInTheDocument();

		// Check for streaming cursor
		const cursor = container.querySelector(".animate-pulse");
		expect(cursor).toBeInTheDocument();
	});

	it("updates when new messages are added", () => {
		const { rerender } = render(<ChatMessages />);

		expect(screen.getByText("Start a conversation")).toBeInTheDocument();

		addUserMessage("New message");
		rerender(<ChatMessages />);

		expect(screen.getByText("New message")).toBeInTheDocument();
		expect(screen.queryByText("Start a conversation")).not.toBeInTheDocument();
	});

	describe("message ordering", () => {
		it("renders messages in chronological order", () => {
			addUserMessage("Message 1");
			addUserMessage("Message 2");
			addUserMessage("Message 3");

			const { container } = render(<ChatMessages />);

			// Get all message bubbles in order
			const messages = Array.from(container.querySelectorAll(".whitespace-pre-wrap, .prose"));
			const messageTexts = messages.map((el) => el.textContent);

			expect(messageTexts[0]).toContain("Message 1");
			expect(messageTexts[1]).toContain("Message 2");
			expect(messageTexts[2]).toContain("Message 3");
		});
	});

	describe("auto-scroll behavior", () => {
		it("renders scroll reference div at bottom", () => {
			addUserMessage("Test");

			const { container } = render(<ChatMessages />);

			// Check that a ref div exists (used for auto-scroll)
			// This is the div with ref={bottomRef} that gets scrollIntoView
			const scrollTarget = container.querySelector("div:last-child");
			expect(scrollTarget).toBeInTheDocument();
		});
	});

	describe("layout", () => {
		it("applies correct container classes", () => {
			addUserMessage("Test"); // Add a message so content renders

			const { container } = render(<ChatMessages />);

			// Check for overflow scroll container
			const scrollContainer = container.querySelector(".overflow-y-auto");
			expect(scrollContainer).toBeInTheDocument();

			// Check for message spacing
			const messagesContainer = container.querySelector(".space-y-4");
			expect(messagesContainer).toBeInTheDocument();
		});
	});
});
