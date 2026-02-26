"use client";

import { useNavigate } from "@tanstack/react-router";
import { CirclePlusIcon } from "lucide-react";
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { clientManager } from "@/lib/client-manager";

export function NavMain() {
	const navigate = useNavigate();

	const handleCreateChat = async () => {
		try {
			const sessionId = await clientManager.createNewSession();
			if (sessionId) {
				navigate({ to: "/sessions/$sessionId", params: { sessionId } });
			}
		} catch (error) {
			console.error("[nav-main] Failed to create new session:", error);
		}
	};

	return (
		<SidebarGroup>
			<SidebarGroupContent>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							tooltip="Create Chat"
							className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground duration-200 ease-linear"
							onClick={handleCreateChat}
						>
							<CirclePlusIcon />
							<span>Create Chat</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}
