import { defineCatalog } from "@json-render/core";
import { JSONUIProvider, Renderer, defineRegistry } from "@json-render/react";
import { schema } from "@json-render/react/schema";
import { shadcnComponentDefinitions, shadcnComponents } from "@json-render/shadcn";
import { useMemo } from "react";
import { toast } from "sonner";
import { clientManager } from "@/lib/client-manager";
import type { ExtensionUISpec } from "./types";

const catalog = defineCatalog(schema, {
	components: shadcnComponentDefinitions,
	actions: {},
});

const { registry } = defineRegistry(catalog, {
	components: shadcnComponents,
});

interface JsonRenderRendererProps {
	spec: ExtensionUISpec;
	sessionId?: string;
	extensionPath?: string;
	initialState?: Record<string, unknown>;
	onConfigSaved?: () => Promise<void> | void;
}

function collectActionNames(value: unknown, names = new Set<string>()): Set<string> {
	if (Array.isArray(value)) {
		for (const item of value) {
			collectActionNames(item, names);
		}
		return names;
	}

	if (!value || typeof value !== "object") {
		return names;
	}

	const record = value as Record<string, unknown>;
	if (typeof record.action === "string" && record.action.trim().length > 0) {
		names.add(record.action);
	}

	for (const nested of Object.values(record)) {
		collectActionNames(nested, names);
	}

	return names;
}

export function JsonRenderRenderer({
	spec,
	sessionId,
	extensionPath,
	initialState,
	onConfigSaved,
}: JsonRenderRendererProps) {
	const client = clientManager.getClient();

	const actionNames = useMemo(() => {
		const fromElements = collectActionNames(spec.elements);
		const fromSpec = Object.keys(spec.actions ?? {});
		for (const action of fromSpec) {
			fromElements.add(action);
		}
		return Array.from(fromElements);
	}, [spec.actions, spec.elements]);

	const handlers = useMemo(() => {
		const map: Record<string, (params: Record<string, unknown>) => Promise<unknown>> = {};

		for (const actionName of actionNames) {
			map[actionName] = async (params) => {
				if (!client || !sessionId || !extensionPath) {
					toast.error("Not connected");
					return;
				}

				try {
					const result = await client.extensionUIAction(sessionId, extensionPath, actionName, params);

					await onConfigSaved?.();
					if (actionName.toLowerCase().includes("save")) {
						toast.success("Extension settings saved");
					}
					return result;
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					toast.error(message);
					throw error;
				}
			};
		}

		return map;
	}, [actionNames, client, extensionPath, onConfigSaved, sessionId]);

	return (
		<JSONUIProvider registry={registry} initialState={initialState} handlers={handlers}>
			<Renderer spec={spec as unknown as Parameters<typeof Renderer>[0]["spec"]} registry={registry} />
		</JSONUIProvider>
	);
}
