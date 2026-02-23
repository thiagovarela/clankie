/**
 * Upload integration
 *
 * Bridges pi-web-ui's Attachment type with the /api/upload endpoint.
 */

import type { Attachment } from "@mariozechner/pi-web-ui";

export async function uploadAttachments(attachments: Attachment[]): Promise<string[]> {
	if (attachments.length === 0) {
		return [];
	}

	const formData = new FormData();

	for (const attachment of attachments) {
		// Convert base64 data URL to Blob
		const dataUrlMatch = attachment.data.match(/^data:([^;]+);base64,(.+)$/);
		if (!dataUrlMatch) {
			console.error("Invalid attachment data URL:", attachment.fileName);
			continue;
		}

		const mimeType = dataUrlMatch[1];
		const base64Data = dataUrlMatch[2];
		const byteString = atob(base64Data);
		const ab = new ArrayBuffer(byteString.length);
		const ia = new Uint8Array(ab);
		for (let i = 0; i < byteString.length; i++) {
			ia[i] = byteString.charCodeAt(i);
		}
		const blob = new Blob([ab], { type: mimeType });

		// Create File object and append to FormData
		const file = new File([blob], attachment.fileName, { type: mimeType });
		formData.append("files", file);
	}

	// Upload to server
	const response = await fetch("/api/upload", {
		method: "POST",
		body: formData,
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Upload failed: ${error}`);
	}

	const result = await response.json();
	if (!result.files || !Array.isArray(result.files)) {
		throw new Error("Invalid upload response");
	}

	// Extract upload IDs
	return result.files.map((f: { id: string }) => f.id);
}
