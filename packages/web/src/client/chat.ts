/**
 * Chat component
 *
 * Main chat interface using pi-web-ui components wired to WebSocket backend.
 */

import type { Attachment } from "@mariozechner/pi-web-ui";
import { html, LitElement } from "lit";
import { customElement, state as litState } from "lit/decorators.js";
import { createRef, ref, type Ref } from "lit/directives/ref.js";
import { state } from "./state.ts";
import { uploadAttachments } from "./uploads.ts";
import type { WsClient } from "./ws-client.ts";

// Import pi-web-ui components - this registers the custom elements
// Note: This imports some Node.js dependencies which Vite will handle as externals
import "@mariozechner/pi-web-ui";

@customElement("lil-chat")
export class LilChat extends LitElement {
	@litState()
	private wsClient?: WsClient;

	private messageListRef: Ref<HTMLElement> = createRef();
	private streamingContainerRef: Ref<any> = createRef();
	private messageEditorRef: Ref<any> = createRef();

	createRenderRoot() {
		// Use light DOM for Tailwind classes
		return this;
	}

	connectedCallback() {
		super.connectedCallback();
		this.style.display = "flex";
		this.style.flexDirection = "column";
		this.style.height = "100%";
		this.style.minHeight = "0";

		// Subscribe to state changes
		state.subscribe(() => {
			this.requestUpdate();
			this.updateStreamingContainer();
		});
	}

	private updateStreamingContainer() {
		const container = this.streamingContainerRef.value;
		if (!container) return;

		const currentState = state.value;

		if (currentState.isStreaming && currentState.streamMessage) {
			container.setMessage(currentState.streamMessage, false);
		} else if (!currentState.isStreaming) {
			container.setMessage(null, true);
		}
	}

	setWsClient(client: WsClient) {
		this.wsClient = client;
	}

	private async handleSend(input: string, attachments: Attachment[]) {
		if (!this.wsClient) return;

		try {
			// Upload attachments if any
			const uploadIds = attachments.length > 0 ? await uploadAttachments(attachments) : undefined;

			// Send prompt via WebSocket
			this.wsClient.send({
				type: "prompt",
				text: input,
				uploadIds,
			});
		} catch (err) {
			console.error("Failed to send message:", err);
			alert(`Failed to send message: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	private handleAbort() {
		if (!this.wsClient) return;

		this.wsClient.send({
			type: "abort",
		});
	}

	render() {
		const currentState = state.value;

		return html`
			<div class="flex-1 overflow-y-auto px-4 py-6">
				<div class="max-w-3xl mx-auto space-y-4">
					<message-list
						${ref(this.messageListRef)}
						.messages=${currentState.messages}
						.tools=${currentState.tools}
						.pendingToolCalls=${currentState.pendingToolCalls}
						.isStreaming=${currentState.isStreaming}
					></message-list>

					<streaming-message-container
						${ref(this.streamingContainerRef)}
						.tools=${currentState.tools}
						.isStreaming=${currentState.isStreaming}
						.pendingToolCalls=${currentState.pendingToolCalls}
					></streaming-message-container>
				</div>
			</div>

			<div class="border-t border-border p-4">
				<div class="max-w-3xl mx-auto">
					<message-editor
						${ref(this.messageEditorRef)}
						.isStreaming=${currentState.isStreaming}
						.showModelSelector=${false}
						.showThinkingSelector=${false}
						.showAttachmentButton=${true}
						.onSend=${(input: string, attachments: Attachment[]) => this.handleSend(input, attachments)}
						.onAbort=${() => this.handleAbort()}
					></message-editor>
				</div>
			</div>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"lil-chat": LilChat;
	}
}
