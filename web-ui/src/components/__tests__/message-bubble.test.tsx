import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeDisplayMessage } from "@/test/fixtures";
import { MessageBubble } from "../message-bubble";

describe("MessageBubble", () => {
	describe("user messages", () => {
		it("renders user message with correct styling", () => {
			const message = makeDisplayMessage({
				role: "user",
				content: "Hello world",
			});

			const { container } = render(<MessageBubble message={message} />);

			// Check for user message content
			expect(screen.getByText("Hello world")).toBeInTheDocument();

			// Check for right-aligned layout (justify-end)
			const messageContainer = container.querySelector(".justify-end");
			expect(messageContainer).toBeInTheDocument();

			// Check for primary background
			const bubble = container.querySelector(".bg-primary");
			expect(bubble).toBeInTheDocument();

			// Check for user icon
			expect(container.querySelector('svg[class*="lucide-user"]')).toBeInTheDocument();
		});

		it("preserves whitespace in user messages", () => {
			const message = makeDisplayMessage({
				role: "user",
				content: "Line 1\nLine 2\n\nLine 3",
			});

			render(<MessageBubble message={message} />);

			const content = screen.getByText(/Line 1/);
			expect(content).toHaveClass("whitespace-pre-wrap");
		});
	});

	describe("assistant messages", () => {
		it("renders assistant message with correct styling", () => {
			const message = makeDisplayMessage({
				role: "assistant",
				content: "Hi there",
			});

			const { container } = render(<MessageBubble message={message} />);

			// Check for assistant content
			expect(screen.getByText("Hi there")).toBeInTheDocument();

			// Check for left-aligned layout (no justify-end)
			const messageContainer = container.querySelector(".justify-end");
			expect(messageContainer).not.toBeInTheDocument();

			// Check for muted background
			const bubble = container.querySelector(".bg-muted");
			expect(bubble).toBeInTheDocument();

			// Check for bot icon
			expect(container.querySelector('svg[class*="lucide-bot"]')).toBeInTheDocument();
		});

		it("renders markdown in assistant messages", () => {
			const message = makeDisplayMessage({
				role: "assistant",
				content: "**Bold text** and *italic*",
			});

			const { container } = render(<MessageBubble message={message} />);

			// Check for prose wrapper (markdown styling)
			const prose = container.querySelector(".prose");
			expect(prose).toBeInTheDocument();

			// Check that markdown is rendered (bold tag should exist)
			const bold = container.querySelector("strong");
			expect(bold).toBeInTheDocument();
			expect(bold).toHaveTextContent("Bold text");
		});

		it("shows '...' when assistant content is empty", () => {
			const message = makeDisplayMessage({
				role: "assistant",
				content: "",
			});

			render(<MessageBubble message={message} />);

			// ReactMarkdown renders "..." for empty content based on our component
			expect(screen.getByText("...")).toBeInTheDocument();
		});

		it("shows streaming cursor when isStreaming is true", () => {
			const message = makeDisplayMessage({
				role: "assistant",
				content: "Typing...",
				isStreaming: true,
			});

			const { container } = render(<MessageBubble message={message} />);

			// Check for streaming cursor (animated pulse)
			const cursor = container.querySelector(".animate-pulse");
			expect(cursor).toBeInTheDocument();
		});

		it("does not show streaming cursor when isStreaming is false", () => {
			const message = makeDisplayMessage({
				role: "assistant",
				content: "Done",
				isStreaming: false,
			});

			const { container } = render(<MessageBubble message={message} />);

			// No streaming cursor
			const cursor = container.querySelector(".animate-pulse");
			expect(cursor).not.toBeInTheDocument();
		});
	});

	describe("thinking indicator", () => {
		it("shows thinking indicator when isThinking and thinkingContent present", () => {
			const message = makeDisplayMessage({
				role: "assistant",
				content: "",
				isThinking: true,
				thinkingContent: "Let me consider this carefully...",
			});

			const { container } = render(<MessageBubble message={message} />);

			// Check for "Thinking..." label
			expect(screen.getByText("Thinking...")).toBeInTheDocument();

			// Check for thinking content
			expect(screen.getByText("Let me consider this carefully...")).toBeInTheDocument();

			// Check for spinner icon
			const spinner = container.querySelector(".animate-spin");
			expect(spinner).toBeInTheDocument();
		});

		it("does not show thinking indicator when isThinking but no thinkingContent", () => {
			const message = makeDisplayMessage({
				role: "assistant",
				content: "Regular message",
				isThinking: true,
				thinkingContent: undefined,
			});

			render(<MessageBubble message={message} />);

			// Should not show "Thinking..." label
			expect(screen.queryByText("Thinking...")).not.toBeInTheDocument();
		});

		it("does not show thinking indicator when not isThinking", () => {
			const message = makeDisplayMessage({
				role: "assistant",
				content: "Done thinking",
				isThinking: false,
				thinkingContent: "Old thinking content",
			});

			render(<MessageBubble message={message} />);

			// Should not show "Thinking..." label
			expect(screen.queryByText("Thinking...")).not.toBeInTheDocument();
		});

		it("shows both thinking content and message content together", () => {
			const message = makeDisplayMessage({
				role: "assistant",
				content: "Here's my answer",
				isThinking: true,
				thinkingContent: "Analyzing the question",
			});

			render(<MessageBubble message={message} />);

			// Both should be visible
			expect(screen.getByText("Analyzing the question")).toBeInTheDocument();
			expect(screen.getByText("Here's my answer")).toBeInTheDocument();
		});
	});

	describe("combined states", () => {
		it("handles thinking + streaming together", () => {
			const message = makeDisplayMessage({
				role: "assistant",
				content: "Partial text",
				isThinking: true,
				thinkingContent: "Still thinking",
				isStreaming: true,
			});

			const { container } = render(<MessageBubble message={message} />);

			// Thinking indicator
			expect(screen.getByText("Thinking...")).toBeInTheDocument();
			expect(screen.getByText("Still thinking")).toBeInTheDocument();

			// Message content
			expect(screen.getByText("Partial text")).toBeInTheDocument();

			// Streaming cursor
			const cursor = container.querySelector(".animate-pulse");
			expect(cursor).toBeInTheDocument();
		});
	});
});
