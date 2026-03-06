import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

const RenderJsonUiParamsSchema = Type.Object({
  title: Type.Optional(Type.String({ description: "Optional card title" })),
  description: Type.Optional(Type.String({ description: "Optional card description" })),
  summary: Type.Optional(Type.String({ description: "Short transcript summary for the tool result" })),
  text: Type.Optional(Type.String({ description: "Main text body for card content" })),
  items: Type.Optional(
    Type.Array(Type.String(), {
      description: "Simple list items for card rendering",
    }),
  ),
  columns: Type.Optional(
    Type.Array(Type.String(), {
      description: "Optional column labels for structured data rows",
    }),
  ),
  rows: Type.Optional(
    Type.Array(Type.Record(Type.String(), Type.Unknown()), {
      description: "Structured data rows to render inside the card",
    }),
  ),
  ordered: Type.Optional(Type.Boolean({ description: "Render lists as ordered" })),
  uiSpec: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "Explicit uiSpec payload to return directly" })),
}, { additionalProperties: false });

type RenderJsonUiParams = {
  title?: string;
  description?: string;
  summary?: string;
  text?: string;
  items?: string[];
  columns?: string[];
  rows?: Array<Record<string, unknown>>;
  ordered?: boolean;
  uiSpec?: Record<string, unknown>;
};

type ToolResponse = {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidUiSpec(value: unknown): value is { root: string; elements: Record<string, unknown>; actions?: Record<string, unknown> } {
  return (
    isRecord(value) &&
    typeof value.root === "string" &&
    isRecord(value.elements) &&
    (value.actions === undefined || isRecord(value.actions))
  );
}

function buildFallbackUiSpec(params: RenderJsonUiParams) {
  const title = params.title?.trim() || "Structured result";
  const rootId = "json-ui-render-card";
  const stackId = "json-ui-render-stack";
  const children: string[] = [];
  const elements: Record<string, unknown> = {
    [rootId]: {
      type: "Card",
      props: {
        title,
        description: params.description?.trim() || "Rendered by clankie-json-ui-render",
      },
      children: [stackId],
    },
    [stackId]: {
      type: "Stack",
      props: {
        direction: "vertical",
        gap: "md",
      },
      children,
    },
  };

  if (params.text?.trim()) {
    const sectionId = "json-ui-render-summary-section";
    const bodyId = "json-ui-render-summary-body";

    elements[sectionId] = {
      type: "Stack",
      props: {
        direction: "vertical",
        gap: "sm",
      },
      children: [bodyId],
    };
    elements[bodyId] = {
      type: "Text",
      props: {
        text: params.text.trim(),
      },
    };

    children.push(sectionId);
  }

  if (params.items?.length) {
    const sectionId = "json-ui-render-items-section";
    const listId = "json-ui-render-items-list";
    const listChildren: string[] = [];

    elements[sectionId] = {
      type: "Stack",
      props: {
        direction: "vertical",
        gap: "sm",
      },
      children: ["json-ui-render-items-heading", listId],
    };
    elements["json-ui-render-items-heading"] = {
      type: "Text",
      props: {
        text: params.ordered ? "Ordered items" : "Highlights",
        variant: "muted",
      },
    };
    elements[listId] = {
      type: "Stack",
      props: {
        direction: "vertical",
        gap: "xs",
      },
      children: listChildren,
    };

    params.items.forEach((item, index) => {
      const itemId = `json-ui-render-item-${index}`;
      listChildren.push(itemId);
      elements[itemId] = {
        type: "Text",
        props: {
          text: `${params.ordered ? `${index + 1}.` : "•"} ${item}`,
        },
      };
    });

    children.push(sectionId);
  }

  if (params.rows?.length) {
    const sectionId = "json-ui-render-data-section";
    const listId = "json-ui-render-data-list";
    const rowChildren: string[] = [];

    elements[sectionId] = {
      type: "Stack",
      props: {
        direction: "vertical",
        gap: "sm",
      },
      children: ["json-ui-render-data-heading", listId],
    };
    elements["json-ui-render-data-heading"] = {
      type: "Text",
      props: {
        text: "Data preview",
        variant: "muted",
      },
    };
    elements[listId] = {
      type: "Stack",
      props: {
        direction: "vertical",
        gap: "xs",
      },
      children: rowChildren,
    };

    params.rows.slice(0, 6).forEach((row, index) => {
      const rowId = `json-ui-render-row-${index}`;
      rowChildren.push(rowId);
      elements[rowId] = {
        type: "Text",
        props: {
          text: JSON.stringify(row, null, 2),
          variant: "muted",
        },
      };
    });

    if (params.rows.length > 6) {
      const moreId = "json-ui-render-more-rows";
      rowChildren.push(moreId);
      elements[moreId] = {
        type: "Text",
        props: {
          text: `…and ${params.rows.length - 6} more row(s)`,
          variant: "muted",
        },
      };
    }

    children.push(sectionId);
  }

  if (children.length === 0) {
    elements["json-ui-render-empty"] = {
      type: "Text",
      props: {
        text: "No structured content was provided.",
        variant: "muted",
      },
    };
    children.push("json-ui-render-empty");
  }

  return {
    root: rootId,
    elements,
  };
}

function buildResponse(params: RenderJsonUiParams): ToolResponse {
  const summary = params.summary?.trim() || params.title?.trim() || "Rendered structured UI output";

  if (params.uiSpec !== undefined) {
    if (!isValidUiSpec(params.uiSpec)) {
      throw new Error("uiSpec must include string root and object elements");
    }

    return {
      content: [{ type: "text", text: summary }],
      details: {
        uiSpec: params.uiSpec,
      },
    };
  }

  return {
    content: [{ type: "text", text: summary }],
    details: {
      uiSpec: buildFallbackUiSpec(params),
    },
  };
}

export default function jsonUiRenderExtension(pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => ({
    systemPrompt: `${event.systemPrompt}\n\nWhen the user asks for rich structured UI in chat, prefer the render_json_ui tool instead of merely describing that UI is possible. Always return details.uiSpec from render_json_ui instead of renderHint or plain formatted text.`,
  }));

  pi.registerTool({
    name: "render_json_ui",
    label: "Render JSON UI",
    description:
      "Render rich structured output in the clankie web UI. Always returns details.uiSpec for structured card-style rendering.",
    parameters: RenderJsonUiParamsSchema,
    async execute(_toolCallId, rawParams) {
      try {
        return buildResponse(rawParams as RenderJsonUiParams);
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `render_json_ui error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          details: {},
        };
      }
    },
  });
}
