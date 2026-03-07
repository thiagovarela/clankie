import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readability } from "@mozilla/readability";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  type TruncationResult,
  truncateHead,
  type ExtensionAPI,
} from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { binaryInfo, ensureBinary, launch } from "cloakbrowser";
import {
  convert,
  JsCodeBlockStyle,
  type JsConversionOptions,
  JsHeadingStyle,
  JsPreprocessingPreset,
} from "html-to-markdown-node";
import { JSDOM } from "jsdom";
import { Type } from "@sinclair/typebox";

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_SETTLE_MS = 8_000;
const DEFAULT_SEARCH_RESULTS = 5;
const MAX_SEARCH_RESULTS = 10;
const DEFAULT_FETCH_CHARS = 12_000;

interface BrowserSearchResult {
  title: string;
  link: string;
  snippet: string;
  displayUrl?: string;
}

interface FetchedPage {
  url: string;
  finalUrl: string;
  title: string;
  html: string;
}

interface ToolDetails {
  query?: string;
  url?: string;
  resultCount?: number;
  results?: BrowserSearchResult[];
  title?: string;
  finalUrl?: string;
  usedReadability?: boolean;
  savedPath?: string;
  truncation?: TruncationResult;
  fullOutputPath?: string;
}

const markdownOptions: JsConversionOptions = {
  headingStyle: JsHeadingStyle.Atx,
  codeBlockStyle: JsCodeBlockStyle.Backticks,
  wrap: false,
  preserveTags: ["table"],
  stripTags: ["script", "style", "noscript"],
  preprocessing: {
    enabled: true,
    preset: JsPreprocessingPreset.Standard,
    removeNavigation: true,
    removeForms: true,
  },
};

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Operation cancelled");
  }
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Operation cancelled"));
    };

    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

function normalizeToolUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    throw new Error("URL is required");
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function normalizeSearchResultUrl(url: string): string {
  try {
    if (url.startsWith("//")) {
      return `https:${url}`;
    }
    const parsed = new URL(url, "https://duckduckgo.com");
    const redirected = parsed.searchParams.get("uddg");
    return redirected ? decodeURIComponent(redirected) : parsed.toString();
  } catch {
    return url;
  }
}

function toMarkdown(html: string): string {
  return convert(html, markdownOptions)
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function buildFallbackContent(html: string): string {
  const fallbackDom = new JSDOM(html);
  const document = fallbackDom.window.document;
  document
    .querySelectorAll("script, style, noscript, nav, header, footer, aside")
    .forEach((element) => {
      element.remove();
    });

  const main =
    document.querySelector(
      "main, article, [role='main'], .content, #content",
    ) ?? document.body;
  return main?.innerHTML?.trim() || document.body?.innerHTML?.trim() || html;
}

function extractReadableMarkdown(
  html: string,
  url: string,
): { markdown: string; title: string; usedReadability: boolean } {
  const readableDom = new JSDOM(html, { url });
  const reader = new Readability(readableDom.window.document);
  const article = reader.parse();

  if (article?.content) {
    const markdown = toMarkdown(article.content);
    const title =
      article.title?.trim() || readableDom.window.document.title?.trim() || url;
    return {
      markdown:
        title && !markdown.startsWith(`# ${title}`)
          ? `# ${title}\n\n${markdown}`.trim()
          : markdown,
      title,
      usedReadability: true,
    };
  }

  const fallbackHtml = buildFallbackContent(html);
  const fallbackDom = new JSDOM(html, { url });
  const title = fallbackDom.window.document.title?.trim() || url;
  const markdown = toMarkdown(fallbackHtml);

  return {
    markdown:
      title && !markdown.startsWith(`# ${title}`)
        ? `# ${title}\n\n${markdown}`.trim()
        : markdown,
    title,
    usedReadability: false,
  };
}

async function withBrowser<T>(
  task: (helpers: {
    goto: (
      url: string,
      timeoutMs?: number,
      settleMs?: number,
    ) => Promise<{ html: string; finalUrl: string }>;
    search: (
      query: string,
      maxResults: number,
      timeoutMs?: number,
      settleMs?: number,
    ) => Promise<BrowserSearchResult[]>;
  }) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  throwIfAborted(signal);
  await ensureBinary();
  const browser = await launch({
    headless: true,
    locale: "en-US",
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      locale: "en-US",
    });

    const goto = async (
      url: string,
      timeoutMs = DEFAULT_TIMEOUT_MS,
      settleMs = DEFAULT_SETTLE_MS,
    ): Promise<{ html: string; finalUrl: string }> => {
      throwIfAborted(signal);
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs,
      });
      await page
        .waitForLoadState("domcontentloaded", { timeout: timeoutMs })
        .catch(() => undefined);
      await sleep(settleMs, signal);
      throwIfAborted(signal);
      return {
        html: await page.content(),
        finalUrl: page.url(),
      };
    };

    const search = async (
      query: string,
      maxResults: number,
      timeoutMs = DEFAULT_TIMEOUT_MS,
      settleMs = DEFAULT_SETTLE_MS,
    ): Promise<BrowserSearchResult[]> => {
      const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      await page.goto(searchUrl, {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs,
      });
      await page.waitForSelector("a.result__a, .result", {
        timeout: timeoutMs,
      });
      await sleep(settleMs, signal);
      throwIfAborted(signal);

      const rawResults = await page.evaluate((limit: number) => {
        const entries = Array.from(document.querySelectorAll(".result")).slice(
          0,
          limit,
        );
        return entries.map((entry) => {
          const anchor =
            entry.querySelector<HTMLAnchorElement>("a.result__a, h2 a");
          if (!anchor) return null;
          const snippetElement = entry.querySelector<HTMLElement>(
            ".result__snippet, .result__body, .result__extras__url",
          );
          const displayUrlElement = entry.querySelector<HTMLElement>(
            ".result__url, .result__extras__url",
          );
          const title = anchor.textContent?.trim() || "";
          const link = anchor.getAttribute("href") || "";
          if (!title || !link) return null;
          return {
            title,
            link,
            snippet: snippetElement?.textContent?.trim() || "",
            displayUrl: displayUrlElement?.textContent?.trim() || undefined,
          };
        });
      }, maxResults);

      return rawResults
        .filter(
          (result): result is NonNullable<(typeof rawResults)[number]> =>
            result !== null,
        )
        .map((result) => ({
          title: result.title,
          link: normalizeSearchResultUrl(result.link),
          snippet: result.snippet,
          displayUrl: result.displayUrl,
        }));
    };

    return await task({ goto, search });
  } finally {
    await browser.close().catch(() => undefined);
  }
}

async function fetchPageHtml(
  url: string,
  signal?: AbortSignal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  settleMs = DEFAULT_SETTLE_MS,
): Promise<FetchedPage> {
  const normalizedUrl = normalizeToolUrl(url);

  return await withBrowser(async ({ goto }) => {
    const response = await goto(normalizedUrl, timeoutMs, settleMs);
    const dom = new JSDOM(response.html, { url: response.finalUrl });
    const title = dom.window.document.title?.trim() || response.finalUrl;
    return {
      url: normalizedUrl,
      finalUrl: response.finalUrl,
      title,
      html: response.html,
    };
  }, signal);
}

function writeTempOutput(text: string, extension = ".txt"): string {
  const tempDir = mkdtempSync(join(tmpdir(), "clankie-web-search-"));
  const tempFile = join(tempDir, `output${extension}`);
  writeFileSync(tempFile, text);
  return tempFile;
}

function truncateText(text: string): {
  text: string;
  truncation?: TruncationResult;
  fullOutputPath?: string;
} {
  const truncation = truncateHead(text, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });

  if (!truncation.truncated) {
    return { text };
  }

  const tempFile = writeTempOutput(text, ".txt");

  let resultText = truncation.content;
  resultText += `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines`;
  resultText += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`;
  resultText += ` Full output saved to: ${tempFile}]`;

  return {
    text: resultText,
    truncation,
    fullOutputPath: tempFile,
  };
}

function trimToChars(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars).trimEnd()}\n\n[Content trimmed to ${maxChars} characters]`;
}

function formatSearchResults(results: BrowserSearchResult[]): string {
  return results
    .map((result, index) => {
      let text = `--- Result ${index + 1} ---\n`;
      text += `Title: ${result.title}\n`;
      text += `Link: ${result.link}\n`;
      if (result.displayUrl) {
        text += `Display URL: ${result.displayUrl}\n`;
      }
      if (result.snippet) {
        text += `Snippet: ${result.snippet}\n`;
      }
      return text.trimEnd();
    })
    .join("\n\n");
}

export default function webSearchExtension(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    try {
      await ensureBinary();
      const info = binaryInfo();
      if (info.installed) {
        ctx.ui.notify(
          `clankie-web-search ready: CloakBrowser ${info.version}`,
          "info",
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      ctx.ui.notify(`clankie-web-search failed to prepare browser: ${message}`, "error");
    }
  });

  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description: `Search the web in a headless CloakBrowser session via DuckDuckGo HTML results. Returns titles, links, and snippets only. Use web_fetch_html to fetch a page and html_to_markdown for a second-pass conversion. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}.`,
    parameters: Type.Object({
      query: Type.String({ description: "The search query to run on the web" }),
      maxResults: Type.Optional(
        Type.Number({
          description: `Maximum number of search results to return (default: ${DEFAULT_SEARCH_RESULTS}, max: ${MAX_SEARCH_RESULTS})`,
          default: DEFAULT_SEARCH_RESULTS,
        }),
      ),
      saveToTempFile: Type.Optional(
        Type.Boolean({
          description:
            "Also save the full search results to a temp file on disk",
          default: false,
        }),
      ),
      timeoutMs: Type.Optional(
        Type.Number({
          description: `Search timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS})`,
          default: DEFAULT_TIMEOUT_MS,
        }),
      ),
      settleMs: Type.Optional(
        Type.Number({
          description: `Extra wait after page load so anti-bot/captcha challenges can settle (default: ${DEFAULT_SETTLE_MS})`,
          default: DEFAULT_SETTLE_MS,
        }),
      ),
    }),
    async execute(_toolCallId, params, signal, onUpdate) {
      const query = params.query.trim();
      if (!query) {
        throw new Error("Query is required");
      }

      const maxResults = Math.max(
        1,
        Math.min(
          MAX_SEARCH_RESULTS,
          Math.floor(params.maxResults ?? DEFAULT_SEARCH_RESULTS),
        ),
      );
      const saveToTempFile = params.saveToTempFile ?? false;
      const timeoutMs = Math.max(
        5_000,
        Math.floor(params.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      );
      const settleMs = Math.max(
        0,
        Math.floor(params.settleMs ?? DEFAULT_SETTLE_MS),
      );

      onUpdate?.({
        content: [{ type: "text", text: `Searching the web for: ${query}` }],
        details: {},
      });
      const results = await withBrowser(async ({ search }) => {
        return await search(query, maxResults, timeoutMs, settleMs);
      }, signal);

      if (results.length === 0) {
        return {
          content: [{ type: "text", text: "No results found." }],
          details: { query, resultCount: 0 } satisfies ToolDetails,
        };
      }

      const formatted = formatSearchResults(results);
      const truncated = truncateText(formatted);
      const savedPath = saveToTempFile
        ? writeTempOutput(formatted, ".txt")
        : undefined;
      const outputText = savedPath
        ? `${truncated.text}\n\n[Full result also saved to: ${savedPath}]`
        : truncated.text;

      return {
        content: [{ type: "text", text: outputText }],
        details: {
          query,
          resultCount: results.length,
          results,
          savedPath,
          truncation: truncated.truncation,
          fullOutputPath: truncated.fullOutputPath,
        } satisfies ToolDetails,
      };
    },
  });

  pi.registerTool({
    name: "web_fetch_html",
    label: "Web Fetch HTML",
    description: `Open a URL in headless CloakBrowser and return the raw HTML. Use html_to_markdown as a second pass if needed. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}.`,
    parameters: Type.Object({
      url: Type.String({ description: "The URL to fetch" }),
      maxChars: Type.Optional(
        Type.Number({
          description: `Maximum HTML characters before local trimming (default: ${DEFAULT_FETCH_CHARS})`,
          default: DEFAULT_FETCH_CHARS,
        }),
      ),
      saveToTempFile: Type.Optional(
        Type.Boolean({
          description: "Also save the full HTML to a temp file on disk",
          default: true,
        }),
      ),
      timeoutMs: Type.Optional(
        Type.Number({
          description: `Page timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS})`,
          default: DEFAULT_TIMEOUT_MS,
        }),
      ),
      settleMs: Type.Optional(
        Type.Number({
          description: `Extra wait after page load so anti-bot/captcha challenges can settle (default: ${DEFAULT_SETTLE_MS})`,
          default: DEFAULT_SETTLE_MS,
        }),
      ),
    }),
    async execute(_toolCallId, params, signal, onUpdate) {
      const timeoutMs = Math.max(
        15_000,
        Math.floor(params.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      );
      const maxChars = Math.max(
        50000,
        Math.floor(params.maxChars ?? DEFAULT_FETCH_CHARS),
      );
      const saveToTempFile = params.saveToTempFile ?? true;
      const settleMs = Math.max(
        0,
        Math.floor(params.settleMs ?? DEFAULT_SETTLE_MS),
      );
      const url = normalizeToolUrl(params.url);

      onUpdate?.({
        content: [{ type: "text", text: `Fetching ${url}` }],
        details: {},
      });
      const page = await fetchPageHtml(url, signal, timeoutMs, settleMs);
      const html = trimToChars(page.html, maxChars);
      const truncated = truncateText(html);
      const savedPath = saveToTempFile
        ? writeTempOutput(page.html, ".html")
        : undefined;
      const outputText = savedPath
        ? `${truncated.text}\n\n[Full HTML also saved to: ${savedPath}]`
        : truncated.text;

      return {
        content: [{ type: "text", text: outputText }],
        details: {
          url,
          finalUrl: page.finalUrl,
          title: page.title,
          savedPath,
          truncation: truncated.truncation,
          fullOutputPath: truncated.fullOutputPath,
        } satisfies ToolDetails,
      };
    },
  });

  pi.registerTool({
    name: "html_to_markdown",
    label: "HTML to Markdown",
    description: `Convert raw HTML into Markdown using html-to-markdown-node. Supports optionally running readability-style extraction first. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}.`,
    parameters: Type.Object({
      html: Type.String({ description: "Raw HTML to convert" }),
      mode: Type.Optional(
        StringEnum(["raw", "readable"] as const, {
          description:
            "raw = convert the provided HTML directly, readable = try article extraction first",
          default: "raw",
        }),
      ),
      baseUrl: Type.Optional(
        Type.String({
          description:
            "Optional base URL used when parsing relative links for readable mode",
        }),
      ),
      maxChars: Type.Optional(
        Type.Number({
          description: `Maximum markdown characters before local trimming (default: ${DEFAULT_FETCH_CHARS})`,
          default: DEFAULT_FETCH_CHARS,
        }),
      ),
      saveToTempFile: Type.Optional(
        Type.Boolean({
          description:
            "Also save the converted Markdown to a temp file on disk",
          default: false,
        }),
      ),
    }),
    async execute(_toolCallId, params) {
      const mode = params.mode ?? "raw";
      const maxChars = Math.max(
        500,
        Math.floor(params.maxChars ?? DEFAULT_FETCH_CHARS),
      );
      const saveToTempFile = params.saveToTempFile ?? false;
      const baseUrl = params.baseUrl?.trim() || "https://example.com";

      const converted =
        mode === "readable"
          ? extractReadableMarkdown(params.html, baseUrl)
          : {
              markdown: toMarkdown(params.html),
              title: undefined,
              usedReadability: false,
            };

      const markdown = trimToChars(converted.markdown, maxChars);
      const truncated = truncateText(markdown);
      const savedPath = saveToTempFile
        ? writeTempOutput(converted.markdown, ".md")
        : undefined;
      const outputText = savedPath
        ? `${truncated.text}\n\n[Full Markdown also saved to: ${savedPath}]`
        : truncated.text;

      return {
        content: [{ type: "text", text: outputText }],
        details: {
          title: converted.title,
          usedReadability: converted.usedReadability,
          savedPath,
          truncation: truncated.truncation,
          fullOutputPath: truncated.fullOutputPath,
        } satisfies ToolDetails,
      };
    },
  });
}
