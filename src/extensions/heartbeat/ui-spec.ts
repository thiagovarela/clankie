export const HEARTBEAT_EXTENSION_UI_SPEC = {
	root: "heartbeat-card",
	elements: {
		"heartbeat-card": {
			type: "Card",
			props: {
				title: "Heartbeat",
				description: "Periodic health checks for your workspace",
			},
			children: ["heartbeat-stack"],
		},
		"heartbeat-stack": {
			type: "Stack",
			props: {
				direction: "vertical",
				gap: "sm",
			},
			children: ["heartbeat-description", "heartbeat-commands", "heartbeat-flags"],
		},
		"heartbeat-description": {
			type: "Text",
			props: {
				text: "Use /heartbeat on|off|run|reload to control checks and --heartbeat to auto-start.",
				variant: "muted",
			},
		},
		"heartbeat-commands": {
			type: "Text",
			props: {
				text: "Commands: /heartbeat on, /heartbeat off, /heartbeat run, /heartbeat reload",
			},
		},
		"heartbeat-flags": {
			type: "Badge",
			props: {
				text: "--heartbeat",
				variant: "secondary",
			},
		},
	},
} as const;
