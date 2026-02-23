/**
 * Chat component
 * Main chat interface wiring together all pieces
 */

import { html, LitElement } from "lit";
import { customElement, state as litState } from "lit/decorators.js";
import { createRef, type Ref, ref } from "lit/directives/ref.js";
import { state } from "../state.ts";
import type { Attachment, Message, ToolCall } from "../types.ts";
import type { WsClient, WsIncomingMessage } from "../ws-client.ts";
import "./message-input.ts";
import "./message-list.ts";
import "./streaming-message.ts";

@customElement("lil-chat")
export class Chat extends LitElement {
	@litState() private messages: Message[] = [];
	@litState() private isStreaming = false;
	@litState() private streamingContent = "";
	@litState() private streamingThinking?: string;
	@litState() private streamingToolCalls?: ToolCall[];

	private wsClient?: WsClient;
	private unsubscribeState?: () => void;
	private unsubscribeWs?: () => void;
	private messageListContainerRef: Ref<HTMLDivElement> = createRef();

	createRenderRoot() {
		return this; // Use light DOM for Tailwind classes
	}

	connectedCallback(): void {
		super.connectedCallback();

		// Subscribe to state changes
		this.unsubscribeState = state.subscribe(() => {
			this.messages = state.messages;
			this.isStreaming = state.isStreaming;
			this.streamingContent = state.streamingContent;
			this.streamingThinking = state.streamingThinking;
			this.streamingToolCalls = state.streamingToolCalls;

			// Auto-scroll to bottom when new messages arrive
			this.scrollToBottom();
		});

		// Initial state sync
		this.messages = state.messages;
		this.isStreaming = state.isStreaming;
	}

	disconnectedCallback(): void {
		super.disconnectedCallback();
		this.unsubscribeState?.();
		this.unsubscribeWs?.();
	}

	setWsClient(client: WsClient) {
		this.wsClient = client;

		// Subscribe to WebSocket messages
		this.unsubscribeWs?.();
		this.unsubscribeWs = client.subscribe((message) => this.handleWsMessage(message));
	}

	private handleWsMessage(message: WsIncomingMessage) {
		if (message.type === "state") {
			// Full state update - convert server messages to our format
			console.log("[chat] Received state message with", message.state.messages.length, "messages");
			const messages = this.convertMessages(message.state.messages);
			console.log("[chat] Converted to", messages.length, "messages:", messages);
			state.setMessages(messages);

			// Handle streaming state
			if (message.state.isStreaming && message.state.streamMessage) {
				state.startStreaming();
				const streamMsg = message.state.streamMessage as Record<string, unknown>;
				state.updateStreaming(
					(streamMsg.content as string) || "",
					streamMsg.thinking as string | undefined,
					streamMsg.tool_calls as ToolCall[] | undefined,
				);
			} else if (!message.state.isStreaming && state.isStreaming) {
				state.finishStreaming();
			}
		} else if (message.type === "event") {
			// Handle incremental events
			const eventType = message.event.type;

			if (eventType === "streaming_start") {
				state.startStreaming();
			} else if (eventType === "content_delta") {
				const delta = message.event.delta as string;
				state.updateStreaming(state.streamingContent + delta, state.streamingThinking, state.streamingToolCalls);
			} else if (eventType === "streaming_done") {
				state.finishStreaming();
			} else if (eventType === "tool_call") {
				// Add or update tool call in streaming state
				const toolCall = message.event.tool as ToolCall;
				const currentCalls = state.streamingToolCalls || [];
				const existingIndex = currentCalls.findIndex((t) => t.id === toolCall.id);

				let updatedCalls: ToolCall[];
				if (existingIndex >= 0) {
					updatedCalls = [...currentCalls];
					updatedCalls[existingIndex] = toolCall;
				} else {
					updatedCalls = [...currentCalls, toolCall];
				}

				state.updateStreaming(state.streamingContent, state.streamingThinking, updatedCalls);
			}
		}
	}

	private convertMessages(serverMessages: unknown[]): Message[] {
		return serverMessages.map((msg: unknown) => {
			const m = msg as Record<string, unknown>;

			// Extract text from content parts array
			// Server format: content: [{type: "text", text: "..."}]
			let textContent = "";
			const contentParts = Array.isArray(m.content) ? m.content : [];
			for (const part of contentParts) {
				if (typeof part === "object" && part !== null) {
					const p = part as Record<string, unknown>;
					if (p.type === "text" && typeof p.text === "string") {
						textContent += p.text;
					}
				}
			}

			return {
				role: m.role as "user" | "assistant",
				content: textContent,
				timestamp: m.timestamp as number | undefined,
				thinking: m.thinking as string | undefined,
				toolCalls: m.tool_calls as ToolCall[] | undefined,
				attachments: m.attachments as Attachment[] | undefined,
			};
		});
	}

	private handleSend(e: CustomEvent) {
		const { content, attachments } = e.detail as { content: string; attachments: Attachment[] };

		if (!this.wsClient) {
			console.error("WebSocket client not set");
			return;
		}

		// Add user message immediately (optimistic UI)
		state.addMessage({
			role: "user",
			content,
			attachments: attachments.length > 0 ? attachments : undefined,
			timestamp: Date.now(),
		});

		// Send to server
		// TODO: Handle file uploads via /api/upload first, then send uploadIds
		this.wsClient.send({
			type: "prompt",
			text: content,
			uploadIds: [], // Placeholder
		});

		state.startStreaming();
	}

	private handleAbort() {
		if (!this.wsClient) return;

		this.wsClient.send({ type: "abort" });
		state.clearStreaming();
	}

	private scrollToBottom() {
		// Use requestAnimationFrame to ensure DOM is updated
		requestAnimationFrame(() => {
			const container = this.messageListContainerRef.value;
			if (container) {
				container.scrollTop = container.scrollHeight;
			}
		});
	}

	render() {
		return html`
			<div class="flex flex-col h-full">
				<!-- Messages (centered with max-width) -->
				<div ${ref(this.messageListContainerRef)} class="flex-1 overflow-y-auto p-4">
					<div class="max-w-3xl mx-auto">
						<lil-message-list .messages=${this.messages}></lil-message-list>

						<!-- Streaming message -->
						${
							this.isStreaming
								? html`
									<lil-streaming-message
										.content=${this.streamingContent}
										.thinking=${this.streamingThinking}
										.toolCalls=${this.streamingToolCalls}
									></lil-streaming-message>
								`
								: ""
						}
					</div>
				</div>

				<!-- Input (centered with max-width) -->
				<div class="w-full">
					<div class="max-w-3xl mx-auto">
						<lil-message-input
							.isStreaming=${this.isStreaming}
							@send=${this.handleSend}
							@abort=${this.handleAbort}
						></lil-message-input>
					</div>
				</div>
			</div>
		`;
	}
}
