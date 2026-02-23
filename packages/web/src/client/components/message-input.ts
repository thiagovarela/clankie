/**
 * Message input component
 * Text input with file upload and send button
 */

import { Button } from "@mariozechner/mini-lit/dist/Button.js";
import { html, LitElement } from "lit";
import { customElement, property, state as litState } from "lit/decorators.js";
import { createRef, ref, type Ref } from "lit/directives/ref.js";
import { Paperclip, Send, Square } from "lucide";
import type { Attachment } from "../types.ts";

@customElement("lil-message-input")
export class MessageInput extends LitElement {
	@property({ type: Boolean }) disabled = false;
	@property({ type: Boolean }) isStreaming = false;
	@litState() private value = "";
	@litState() private attachments: Attachment[] = [];

	private textareaRef: Ref<HTMLTextAreaElement> = createRef();
	private fileInputRef: Ref<HTMLInputElement> = createRef();

	createRenderRoot() {
		return this; // Use light DOM for Tailwind classes
	}

	private handleInput(e: Event) {
		const textarea = e.target as HTMLTextAreaElement;
		this.value = textarea.value;

		// Auto-resize
		textarea.style.height = "auto";
		textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
	}

	private handleKeyDown(e: KeyboardEvent) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			this.handleSend();
		}
	}

	private handleSend() {
		const content = this.value.trim();
		if (!content && this.attachments.length === 0) return;
		if (this.disabled || this.isStreaming) return;

		this.dispatchEvent(
			new CustomEvent("send", {
				detail: { content, attachments: this.attachments },
			}),
		);

		// Clear input
		this.value = "";
		this.attachments = [];
		if (this.textareaRef.value) {
			this.textareaRef.value.style.height = "auto";
		}
	}

	private handleAbort() {
		this.dispatchEvent(new CustomEvent("abort"));
	}

	private async handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = Array.from(input.files || []);

		for (const file of files) {
			const attachment = await this.fileToAttachment(file);
			this.attachments = [...this.attachments, attachment];
		}

		// Reset file input
		input.value = "";
	}

	private async fileToAttachment(file: File): Promise<Attachment> {
		const arrayBuffer = await file.arrayBuffer();
		const bytes = new Uint8Array(arrayBuffer);
		let binary = "";
		for (let i = 0; i < bytes.length; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		const base64 = btoa(binary);
		const data = `data:${file.type};base64,${base64}`;

		return {
			id: crypto.randomUUID(),
			fileName: file.name,
			mimeType: file.type,
			size: file.size,
			data,
			type: file.type.startsWith("image/") ? "image" : "document",
			preview: file.type.startsWith("image/") ? data : undefined,
		};
	}

	private removeAttachment(id: string) {
		this.attachments = this.attachments.filter((a) => a.id !== id);
	}

	private openFilePicker() {
		this.fileInputRef.value?.click();
	}

	render() {
		return html`
			<div class="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
				<!-- Attachments preview -->
				${this.attachments.length > 0
					? html`
							<div class="mb-2 flex flex-wrap gap-2">
								${this.attachments.map(
									(att) => html`
										<div
											class="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded px-3 py-1 text-sm"
										>
											<span>📎</span>
											<span>${att.fileName}</span>
											<button
												@click=${() => this.removeAttachment(att.id)}
												class="ml-1 text-gray-500 hover:text-red-500"
											>
												×
											</button>
										</div>
									`,
								)}
							</div>
						`
					: ""}

				<!-- Input area -->
				<div class="flex items-end gap-2">
					<!-- File upload -->
					<input
						${ref(this.fileInputRef)}
						type="file"
						multiple
						class="hidden"
						@change=${this.handleFileSelect}
					/>
					${Button({
						variant: "ghost",
						size: "icon",
						disabled: this.disabled || this.isStreaming,
						onClick: this.openFilePicker.bind(this),
						children: Paperclip({ size: 20 }),
					})}

					<!-- Text input -->
					<textarea
						${ref(this.textareaRef)}
						class="flex-1 resize-none rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
						placeholder="Type a message..."
						.value=${this.value}
						@input=${this.handleInput}
						@keydown=${this.handleKeyDown}
						?disabled=${this.disabled}
						rows="1"
					></textarea>

					<!-- Send/Abort button -->
					${this.isStreaming
						? Button({
								variant: "destructive",
								size: "icon",
								onClick: this.handleAbort.bind(this),
								children: Square({ size: 20 }),
							})
						: Button({
								variant: "primary",
								size: "icon",
								disabled: this.disabled || (!this.value.trim() && this.attachments.length === 0),
								onClick: this.handleSend.bind(this),
								children: Send({ size: 20 }),
							})}
				</div>
			</div>
		`;
	}
}
