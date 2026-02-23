/**
 * Message input component
 * Text input with file upload and send button
 */

import { Button } from "@mariozechner/mini-lit/dist/Button.js";
import { icon } from "@mariozechner/mini-lit/dist/icons.js";
import { html, LitElement } from "lit";
import { customElement, state as litState, property } from "lit/decorators.js";
import { createRef, type Ref, ref } from "lit/directives/ref.js";
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
		const hasContent = this.value.trim() || this.attachments.length > 0;

		return html`
			<div class="p-6 bg-card/50 backdrop-blur-sm border-t border-border/50">
				<!-- Attachments preview -->
				${
					this.attachments.length > 0
						? html`
							<div class="mb-3 flex flex-wrap gap-2">
								${this.attachments.map(
									(att) => html`
										<div
											class="flex items-center gap-2 bg-muted/50 text-muted-foreground rounded-md px-3 py-1.5 text-sm"
										>
											<span class="opacity-60">📎</span>
											<span>${att.fileName}</span>
											<button
												@click=${() => this.removeAttachment(att.id)}
												class="ml-1 text-muted-foreground hover:text-destructive transition-colors"
											>
												×
											</button>
										</div>
									`,
								)}
							</div>
						`
						: ""
				}

				<!-- Input area with warm elevation -->
				<div
					class="flex items-end gap-3 bg-background rounded-lg border border-input shadow-sm transition-shadow duration-200 ${
						hasContent ? "shadow-md ring-1 ring-accent/20" : ""
					}"
				>
					<!-- File upload button -->
					<input
						${ref(this.fileInputRef)}
						type="file"
						multiple
						class="hidden"
						@change=${this.handleFileSelect}
					/>
					<button
						@click=${this.openFilePicker.bind(this)}
						?disabled=${this.disabled || this.isStreaming}
						class="p-3 text-muted-foreground hover:text-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						title="Attach files"
					>
						${icon(Paperclip, "sm")}
					</button>

					<!-- Text input -->
					<textarea
						${ref(this.textareaRef)}
						class="flex-1 resize-none bg-transparent px-2 py-3 text-sm focus:outline-none placeholder:text-muted-foreground/50 disabled:opacity-50"
						placeholder="Message lil..."
						.value=${this.value}
						@input=${this.handleInput}
						@keydown=${this.handleKeyDown}
						?disabled=${this.disabled}
						rows="1"
					></textarea>

					<!-- Send/Abort button -->
					${
						this.isStreaming
							? html`
								<button
									@click=${this.handleAbort.bind(this)}
									class="p-3 text-destructive hover:text-destructive/80 transition-colors"
									title="Stop generating"
								>
									${icon(Square, "sm")}
								</button>
							`
							: hasContent
								? html`
									<button
										@click=${this.handleSend.bind(this)}
										class="p-3 text-accent hover:text-accent/80 transition-colors"
										title="Send message"
									>
										${icon(Send, "sm")}
									</button>
								`
								: html`
									<div class="p-3 text-muted-foreground/30" title="Type a message to send">
										${icon(Send, "sm")}
									</div>
								`
					}
				</div>
			</div>
		`;
	}
}
