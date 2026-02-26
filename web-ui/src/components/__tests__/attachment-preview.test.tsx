import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AttachmentItem } from "../attachment-preview";
import { AttachmentPreview } from "../attachment-preview";

describe("AttachmentPreview", () => {
	const makeAttachment = (overrides?: Partial<AttachmentItem>): AttachmentItem => ({
		id: "att-1",
		file: new File(["content"], "test.txt", { type: "text/plain" }),
		base64: "base64data",
		mimeType: "text/plain",
		...overrides,
	});

	it("renders nothing when attachments array is empty", () => {
		const { container } = render(<AttachmentPreview attachments={[]} onRemove={() => {}} />);

		expect(container.firstChild).toBeNull();
	});

	describe("image attachments", () => {
		it("renders image preview when mimeType starts with 'image/'", () => {
			const attachment = makeAttachment({
				mimeType: "image/png",
				preview: "data:image/png;base64,preview",
			});

			const { container } = render(<AttachmentPreview attachments={[attachment]} onRemove={() => {}} />);

			// Check for image element
			const img = container.querySelector("img");
			expect(img).toBeInTheDocument();
			expect(img).toHaveAttribute("src", "data:image/png;base64,preview");
			expect(img).toHaveAttribute("alt", "test.txt");
		});

		it("shows file name for image attachments", () => {
			const attachment = makeAttachment({
				file: new File(["content"], "my-image.jpg", { type: "image/jpeg" }),
				mimeType: "image/jpeg",
				preview: "data:image/jpeg;base64,preview",
			});

			render(<AttachmentPreview attachments={[attachment]} onRemove={() => {}} />);

			expect(screen.getByText("my-image.jpg")).toBeInTheDocument();
		});
	});

	describe("non-image attachments", () => {
		it("renders file icon for non-image attachments", () => {
			const attachment = makeAttachment({
				mimeType: "application/pdf",
			});

			const { container } = render(<AttachmentPreview attachments={[attachment]} onRemove={() => {}} />);

			// Check for file icon (lucide File component)
			const fileIcon = container.querySelector('svg[class*="lucide-file"]');
			expect(fileIcon).toBeInTheDocument();

			// Should not have an img element
			const img = container.querySelector("img");
			expect(img).not.toBeInTheDocument();
		});

		it("shows file name for non-image attachments", () => {
			const attachment = makeAttachment({
				file: new File(["content"], "document.pdf", { type: "application/pdf" }),
				mimeType: "application/pdf",
			});

			render(<AttachmentPreview attachments={[attachment]} onRemove={() => {}} />);

			expect(screen.getByText("document.pdf")).toBeInTheDocument();
		});
	});

	describe("file size formatting", () => {
		it("formats file size correctly", () => {
			const attachments = [
				makeAttachment({
					id: "1",
					file: new File(["x".repeat(500)], "500B.txt", { type: "text/plain" }),
				}),
				makeAttachment({
					id: "2",
					file: new File(["x".repeat(1500)], "1.5KB.txt", { type: "text/plain" }),
				}),
				makeAttachment({
					id: "3",
					file: new File(["x".repeat(1024 * 1024 * 2)], "2MB.txt", { type: "text/plain" }),
				}),
			];

			render(<AttachmentPreview attachments={attachments} onRemove={() => {}} />);

			// Note: File size in browser is approximate based on actual byte count
			// Just check that all three size units appear
			expect(screen.getByText(/500 B/)).toBeInTheDocument(); // Bytes
			expect(screen.getByText(/1\.46 KB/)).toBeInTheDocument(); // Kilobytes (1500 bytes = 1.46 KB)
			expect(screen.getByText(/2 MB/)).toBeInTheDocument(); // Megabytes
		});

		it("shows '0 B' for empty files", () => {
			const attachment = makeAttachment({
				file: new File([], "empty.txt", { type: "text/plain" }),
			});

			render(<AttachmentPreview attachments={[attachment]} onRemove={() => {}} />);

			expect(screen.getByText("0 B")).toBeInTheDocument();
		});
	});

	describe("multiple attachments", () => {
		it("renders all attachments in the array", () => {
			const attachments = [
				makeAttachment({ id: "1", file: new File([], "file1.txt") }),
				makeAttachment({ id: "2", file: new File([], "file2.txt") }),
				makeAttachment({ id: "3", file: new File([], "file3.txt") }),
			];

			render(<AttachmentPreview attachments={attachments} onRemove={() => {}} />);

			expect(screen.getByText("file1.txt")).toBeInTheDocument();
			expect(screen.getByText("file2.txt")).toBeInTheDocument();
			expect(screen.getByText("file3.txt")).toBeInTheDocument();
		});
	});

	describe("remove button", () => {
		it("calls onRemove with correct id when X button clicked", async () => {
			const user = userEvent.setup();
			const onRemove = vi.fn();
			const attachment = makeAttachment({ id: "att-123" });

			render(<AttachmentPreview attachments={[attachment]} onRemove={onRemove} />);

			// Find and click the remove button (X icon)
			const removeButton = screen.getByRole("button", { name: /remove test.txt/i });
			await user.click(removeButton);

			expect(onRemove).toHaveBeenCalledWith("att-123");
			expect(onRemove).toHaveBeenCalledTimes(1);
		});

		it("calls onRemove with correct id for each attachment", async () => {
			const user = userEvent.setup();
			const onRemove = vi.fn();
			const attachments = [
				makeAttachment({ id: "att-1", file: new File([], "file1.txt") }),
				makeAttachment({ id: "att-2", file: new File([], "file2.txt") }),
			];

			render(<AttachmentPreview attachments={attachments} onRemove={onRemove} />);

			// Click remove on first attachment
			const removeButton1 = screen.getByRole("button", { name: /remove file1.txt/i });
			await user.click(removeButton1);

			expect(onRemove).toHaveBeenCalledWith("att-1");

			// Click remove on second attachment
			const removeButton2 = screen.getByRole("button", { name: /remove file2.txt/i });
			await user.click(removeButton2);

			expect(onRemove).toHaveBeenCalledWith("att-2");
			expect(onRemove).toHaveBeenCalledTimes(2);
		});
	});

	describe("styling", () => {
		it("applies hover styling", () => {
			const attachment = makeAttachment();
			const { container } = render(<AttachmentPreview attachments={[attachment]} onRemove={() => {}} />);

			// Check for hover transition class
			const attachmentContainer = container.querySelector(".hover\\:bg-muted\\/80");
			expect(attachmentContainer).toBeInTheDocument();
		});
	});
});
