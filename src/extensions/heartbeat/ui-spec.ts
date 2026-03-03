export const HEARTBEAT_EXTENSION_UI_SPEC = {
	root: "heartbeat-card",
	elements: {
		"heartbeat-card": {
			type: "Card",
			props: {
				title: "Heartbeat",
				description: "Configure periodic workspace health checks",
			},
			children: ["heartbeat-stack"],
		},
		"heartbeat-stack": {
			type: "Stack",
			props: {
				direction: "vertical",
				gap: "md",
			},
			children: [
				"heartbeat-enabled",
				"heartbeat-every",
				"heartbeat-model",
				"heartbeat-save",
				"heartbeat-help",
			],
		},
		"heartbeat-enabled": {
			type: "Switch",
			props: {
				label: "Enable heartbeat",
				name: "heartbeat-enabled",
				checked: { $bindState: "/heartbeat/enabled" },
			},
		},
		"heartbeat-every": {
			type: "Input",
			props: {
				label: "Schedule",
				name: "heartbeat-every",
				placeholder: "30m",
				value: { $bindState: "/heartbeat/every" },
			},
		},
		"heartbeat-model": {
			type: "Select",
			props: {
				label: "Model (optional)",
				name: "heartbeat-model",
				options: { $state: "/availableModels" },
				value: { $bindState: "/heartbeat/model" },
			},
		},
		"heartbeat-save": {
			type: "Button",
			props: {
				label: "Save heartbeat settings",
				variant: "primary",
			},
			on: {
				press: {
					action: "saveExtensionConfig",
					params: {
						enabled: { $state: "/heartbeat/enabled" },
						every: { $state: "/heartbeat/every" },
						model: { $state: "/heartbeat/model" },
					},
				},
			},
		},
		"heartbeat-help": {
			type: "Text",
			props: {
				text: "Use values like 15m or 1h. Pick '(default session model)' to follow the session model.",
				variant: "muted",
			},
		},
	},
} as const;
