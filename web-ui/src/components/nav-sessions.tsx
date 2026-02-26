"use client";

import { useNavigate } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { MessageSquareIcon, MoreHorizontalIcon, Trash2Icon } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuAction,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@/components/ui/sidebar";
import { removeSession, sessionsListStore } from "@/stores/sessions-list";

export function NavRecentSessions() {
	const navigate = useNavigate();
	const { isMobile } = useSidebar();
	const { sessions, activeSessionId } = useStore(sessionsListStore, (state) => ({
		sessions: state.sessions ?? [],
		activeSessionId: state.activeSessionId,
	}));

	const handleSwitchSession = (sessionId: string) => {
		navigate({ to: "/sessions/$sessionId", params: { sessionId } });
	};

	const handleDeleteSession = (sessionId: string) => {
		removeSession(sessionId);
	};

	// Show only last 5 sessions
	const recentSessions = (sessions || []).slice(0, 15);

	return (
		<SidebarGroup className="group-data-[collapsible=icon]:hidden">
			<SidebarGroupLabel>Recent Sessions</SidebarGroupLabel>
			<SidebarMenu>
				{recentSessions.length === 0 ? (
					<SidebarMenuItem>
						<SidebarMenuButton disabled>
							<span className="text-sidebar-foreground/70">No sessions yet</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				) : (
					recentSessions.map((session) => (
						<SidebarMenuItem key={session.sessionId}>
							<SidebarMenuButton
								isActive={session.sessionId === activeSessionId}
								onClick={() => handleSwitchSession(session.sessionId)}
							>
								<MessageSquareIcon />
								<span className="truncate">{session.title || `Session ${session.sessionId.slice(0, 8)}`}</span>
							</SidebarMenuButton>
							<DropdownMenu>
								<DropdownMenuTrigger render={<SidebarMenuAction showOnHover className="aria-expanded:bg-muted" />}>
									<MoreHorizontalIcon />
									<span className="sr-only">More</span>
								</DropdownMenuTrigger>
								<DropdownMenuContent
									className="w-32"
									side={isMobile ? "bottom" : "right"}
									align={isMobile ? "end" : "start"}
								>
									<DropdownMenuItem onClick={() => handleSwitchSession(session.sessionId)}>
										<MessageSquareIcon />
										<span>Open</span>
									</DropdownMenuItem>
									<DropdownMenuSeparator />
									<DropdownMenuItem variant="destructive" onClick={() => handleDeleteSession(session.sessionId)}>
										<Trash2Icon />
										<span>Delete</span>
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</SidebarMenuItem>
					))
				)}
			</SidebarMenu>
		</SidebarGroup>
	);
}
