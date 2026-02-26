import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { clientManager } from "@/lib/client-manager";
import { connectionStore } from "@/stores/connection";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "clankie — Web UI",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),

	component: RootComponent,
});

function RootComponent() {
	// Auto-connect on startup if saved credentials exist
	useEffect(() => {
		const { settings } = connectionStore.state;
		if (settings.authToken && !clientManager.isConnected()) {
			clientManager.connect();
		}
	}, []);

	return (
		<RootDocument>
			<TooltipProvider>
				<SidebarProvider>
					<AppSidebar variant="inset" />
					<SidebarInset>
						<div className="flex flex-1 flex-col overflow-hidden">
							<header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
								<SidebarTrigger />
							</header>
							<Outlet />
						</div>
					</SidebarInset>
				</SidebarProvider>
			</TooltipProvider>
		</RootDocument>
	);
}

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" className="dark">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	);
}
