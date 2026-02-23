/**
 * Chat component
 * Main chat interface wiring together all pieces
 */

import { html, LitElement } from "lit";
import { customElement, state as litState } from "lit/decorators.js";
import { createRef, type Ref, ref } from "lit/directives/ref.js";
import { state } from "../state.ts";
import type { Attachment, Message, ToolCall } from "../types.ts";
import type { WsClient } from "../ws-client.ts";
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

		// Initial state sync - get any messages that were already loaded
		this.messages = state.messages;
		this.isStreaming = state.isStreaming;
		this.streamingContent = state.streamingContent;
		this.streamingThinking = state.streamingThinking;
		this.streamingToolCalls = state.streamingToolCalls;
	}

	disconnectedCallback(): void {
		super.disconnectedCallback();
		this.unsubscribeState?.();
	}

	setWsClient(client: WsClient) {
		this.wsClient = client;
		// WebSocket messages are now handled centrally in app.ts via ws-handler.ts
		// This component just reads from the global state
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

		// Don't call state.startStreaming() here - let server event trigger it
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
