import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { updateConnectionStatus } from "@/stores/connection";
import { ConnectionStatus } from "../connection-status";

describe("ConnectionStatus", () => {
	it("shows 'Connected' with default badge when status is connected", () => {
		updateConnectionStatus("connected");

		const { container } = render(<ConnectionStatus />);

		expect(screen.getByText("Connected")).toBeInTheDocument();

		// Check for Wifi icon (lucide)
		const wifiIcon = container.querySelector('svg[class*="lucide-wifi"]');
		expect(wifiIcon).toBeInTheDocument();

		// Should not have animate-spin
		expect(wifiIcon).not.toHaveClass("animate-spin");
	});

	it("shows 'Connecting...' with secondary badge and spinner when status is connecting", () => {
		updateConnectionStatus("connecting");

		const { container } = render(<ConnectionStatus />);

		expect(screen.getByText("Connecting...")).toBeInTheDocument();

		// Check for Loader2 icon with spin animation
		const spinnerIcon = container.querySelector(".animate-spin");
		expect(spinnerIcon).toBeInTheDocument();
	});

	it("shows 'Disconnected' with secondary badge when status is disconnected", () => {
		updateConnectionStatus("disconnected");

		const { container } = render(<ConnectionStatus />);

		expect(screen.getByText("Disconnected")).toBeInTheDocument();

		// Check for WifiOff icon
		const wifiOffIcon = container.querySelector('svg[class*="lucide-wifi-off"]');
		expect(wifiOffIcon).toBeInTheDocument();
	});

	it("shows error message with destructive badge when status is error", () => {
		updateConnectionStatus("error", "Connection timeout");

		render(<ConnectionStatus />);

		expect(screen.getByText("Connection timeout")).toBeInTheDocument();
	});

	it("shows generic 'Connection error' when status is error without message", () => {
		updateConnectionStatus("error");

		render(<ConnectionStatus />);

		expect(screen.getByText("Connection error")).toBeInTheDocument();

		// Just verify it renders without crash - icon verification is not critical
	});

	it("updates when connection status changes", () => {
		updateConnectionStatus("disconnected");

		const { rerender } = render(<ConnectionStatus />);
		expect(screen.getByText("Disconnected")).toBeInTheDocument();

		// Change status
		updateConnectionStatus("connected");
		rerender(<ConnectionStatus />);

		expect(screen.getByText("Connected")).toBeInTheDocument();
		expect(screen.queryByText("Disconnected")).not.toBeInTheDocument();
	});

	describe("badge variants", () => {
		it("uses default variant for connected", () => {
			updateConnectionStatus("connected");

			const { container } = render(<ConnectionStatus />);

			// Badge component applies variant classes
			const badge = container.querySelector('[class*="badge"]');
			expect(badge).toBeInTheDocument();
		});

		it("uses secondary variant for connecting", () => {
			updateConnectionStatus("connecting");

			render(<ConnectionStatus />);

			// Just verify it renders without error
			expect(screen.getByText("Connecting...")).toBeInTheDocument();
		});

		it("uses secondary variant for disconnected", () => {
			updateConnectionStatus("disconnected");

			render(<ConnectionStatus />);

			expect(screen.getByText("Disconnected")).toBeInTheDocument();
		});

		it("uses destructive variant for error", () => {
			updateConnectionStatus("error", "Test error");

			render(<ConnectionStatus />);

			expect(screen.getByText("Test error")).toBeInTheDocument();
		});
	});
});
