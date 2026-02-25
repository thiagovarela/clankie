import { createFileRoute, Link } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { Settings } from "lucide-react";
import { ChatInput } from "@/components/chat-input";
import { ChatMessages } from "@/components/chat-messages";
import { SessionSidebar } from "@/components/session-sidebar";
import { Button } from "@/components/ui/button";
import { connectionStore } from "@/stores/connection";
import { sessionsListStore } from "@/stores/sessions-list";

export const Route = createFileRoute("/")({
	component: ChatPage,
});

function ChatPage() {
	const { status } = useStore(connectionStore, (state) => ({
		status: state.status,
	}));

	const { sessions, activeSessionId } = useStore(sessionsListStore, (state) => ({
		sessions: state.sessions,
		activeSessionId: state.activeSessionId,
	}));

	const isConnected = status === "connected";

	if (!isConnected) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="text-center space-y-4">
					<div className="space-y-2">
						<h2 className="text-2xl font-semibold">Not Connected</h2>
						<p className="text-muted-foreground">Configure your connection to get started</p>
					</div>
					<Link to="/settings">
						<Button>
							<Settings className="mr-2 h-4 w-4" />
							Go to Settings
						</Button>
					</Link>
				</div>
			</div>
		);
	}

	// Show loading state while waiting for initial session
	if (isConnected && sessions.length === 0) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="text-center space-y-2">
					<div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-r-transparent" />
					<p className="text-sm text-muted-foreground">Loading sessions...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full">
			<SessionSidebar />
			<div className="flex flex-1 flex-col">
				<ChatMessages />
				<ChatInput />
			</div>
		</div>
	);
}
