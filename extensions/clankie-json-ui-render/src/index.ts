import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

const RenderHintTypeSchema = Type.Union(
  [
    Type.Literal("markdown"),
    Type.Literal("json"),
    Type.Literal("list"),
    Type.Literal("table"),
    Type.Literal("code"),
    Type.Literal("diff"),
    Type.Literal("terminal"),
  ],
  { description: "Preferred lightweight renderer" },
);

const RenderJsonUiParamsSchema = Type.Object({
  title: Type.Optional(Type.String({ description: "Optional card title" })),
  description: Type.Optional(Type.String({ description: "Optional card description" })),
  summary: Type.Optional(Type.String({ description: "Short transcript summary for the tool result" })),
  text: Type.Optional(Type.String({ description: "Main text body for markdown or card content" })),
  items: Type.Optional(
    Type.Array(Type.String(), {
      description: "Simple list items for list or card rendering",
    }),
  ),
  columns: Type.Optional(
    Type.Array(Type.String(), {
      description: "Table column names when using renderHint=table",
    }),
  ),
  rows: Type.Optional(
    Type.Array(Type.Record(Type.String(), Type.Unknown()), {
      description: "Table rows or arbitrary JSON data",
    }),
  ),
  ordered: Type.Optional(Type.Boolean({ description: "Render lists as ordered" })),
  renderHint: Type.Optional(RenderHintTypeSchema),
  language: Type.Optional(Type.String({ description: "Language for code/diff/terminal hints" })),
  uiSpec: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "Explicit uiSpec payload to return directly" })),
}, { additionalProperties: false });

type RenderHintType = "markdown" | "json" | "list" | "table" | "code" | "diff" | "terminal";

type RenderJsonUiParams = {
  title?: string;
  description?: string;
  summary?: string;
  text?: string;
  items?: string[];
  columns?: string[];
  rows?: Array<Record<string, unknown>>;
  ordered?: boolean;
  renderHint?: RenderHintType;
  language?: string;
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

function toText(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function buildListMarkdown(items: string[], ordered = false): string {
  return items.map((item, index) => `${ordered ? `${index + 1}.` : "-"} ${item}`).join("\n");
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
    elements["json-ui-render-text"] = {
      type: "Text",
      props: {
        text: params.text.trim(),
      },
    };
    children.push("json-ui-render-text");
  }

  if (params.items?.length) {
    elements["json-ui-render-items"] = {
      type: "Text",
      props: {
        text: buildListMarkdown(params.items, params.ordered),
        variant: "muted",
      },
    };
    children.push("json-ui-render-items");
  }

  if (params.rows?.length) {
    elements["json-ui-render-json"] = {
      type: "Text",
      props: {
        text: JSON.stringify(params.rows, null, 2),
        variant: "muted",
      },
    };
    children.push("json-ui-render-json");
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
  const summary =
    params.summary?.trim() ||
    params.title?.trim() ||
    (params.renderHint ? `Rendered ${params.renderHint} output` : "Rendered structured UI output");

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

  if (params.renderHint) {
    switch (params.renderHint) {
      case "table": {
        const rows = params.rows ?? [];
        const columns = params.columns?.length
          ? params.columns
          : rows.length > 0
            ? Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
            : [];

        return {
          content: [{ type: "text", text: summary }],
          details: {
            renderHint: { type: "table", columns },
            data: rows,
          },
        };
      }
      case "list": {
        const items = params.items ?? (params.rows?.map((row) => toText(row)) ?? []);
        return {
          content: [{ type: "text", text: summary }],
          details: {
            renderHint: { type: "list", ordered: params.ordered ?? false },
            data: items,
          },
        };
      }
      case "json": {
        const data = params.rows ?? params.items ?? params.text ?? {};
        return {
          content: [{ type: "text", text: summary }],
          details: {
            renderHint: { type: "json" },
            data,
          },
        };
      }
      case "markdown": {
        const markdown = params.text?.trim()
          || (params.items?.length ? buildListMarkdown(params.items, params.ordered) : "");
        return {
          content: [{ type: "text", text: summary }],
          details: {
            renderHint: { type: "markdown" },
            data: markdown,
          },
        };
      }
      case "code":
      case "diff":
      case "terminal": {
        return {
          content: [{ type: "text", text: summary }],
          details: {
            renderHint: {
              type: params.renderHint,
              ...(params.language ? { language: params.language } : {}),
            },
            data: params.text?.trim() || JSON.stringify(params.rows ?? params.items ?? {}, null, 2),
          },
        };
      }
    }
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
    systemPrompt: `${event.systemPrompt}\n\nWhen the user asks for rich structured UI in chat, prefer the render_json_ui tool instead of merely describing that UI is possible. Use details.renderHint for simple markdown/list/table/json/code output and details.uiSpec for cards or richer layouts.`,
  }));

  pi.registerTool({
    name: "render_json_ui",
    label: "Render JSON UI",
    description:
      "Render rich structured output in the clankie web UI. Returns details.renderHint for simple formats or details.uiSpec for cards and richer layouts.",
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
