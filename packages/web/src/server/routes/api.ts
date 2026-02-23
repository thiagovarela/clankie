import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import type { UploadedFile } from "../types.ts";

const WEB_CHAT_IDENTIFIER = "web_default";
const uploads = new Map<string, UploadedFile>();

function uploadDirForOwner(owner: string, lilDir: string): string {
	const dir = join(lilDir, "uploads", owner);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true, mode: 0o700 });
	}
	return dir;
}

function safeFileName(fileName: string): string {
	const trimmed = fileName.trim() || "attachment";
	// Replace unsafe characters: backslash, forward slash, control chars, and DEL
	// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional sanitization of file names
	return trimmed.replace(/[\\/\u0000-\u001F\u007F]+/g, "_").slice(0, 180);
}

export function createApiRoutes(lilDir: string) {
	const api = new Hono();

	api.get("/health", (c) => {
		return c.json({ ok: true });
	});

	api.post("/upload", async (c) => {
		let form: FormData;
		try {
			form = await c.req.formData();
		} catch {
			return c.json({ error: "Invalid multipart form data" }, 400);
		}

		const owner = WEB_CHAT_IDENTIFIER;
		const dir = uploadDirForOwner(owner, lilDir);

		const uploadedFiles: Array<Record<string, unknown>> = [];

		for (const [, value] of form.entries()) {
			const isFileLike =
				value &&
				typeof value === "object" &&
				"arrayBuffer" in value &&
				typeof value.arrayBuffer === "function" &&
				"name" in value &&
				typeof value.name === "string";

			if (!isFileLike) continue;

			const file = value as File;
			const id = randomUUID();
			const fileName = safeFileName(file.name || `attachment-${id}`);
			const filePath = join(dir, `${id}-${fileName}`);
			const bytes = Buffer.from(await file.arrayBuffer());

			writeFileSync(filePath, bytes);

			const uploaded: UploadedFile = {
				id,
				owner,
				fileName,
				mimeType: file.type || "application/octet-stream",
				size: bytes.length,
				path: filePath,
				createdAt: Date.now(),
			};
			uploads.set(id, uploaded);

			uploadedFiles.push({
				id,
				fileName: uploaded.fileName,
				mimeType: uploaded.mimeType,
				size: uploaded.size,
			});
		}

		if (uploadedFiles.length === 0) {
			return c.json({ error: "No file uploaded (expected multipart field with File)" }, 400);
		}

		return c.json({ files: uploadedFiles });
	});

	return api;
}

export { uploads };
