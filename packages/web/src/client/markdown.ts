/**
 * Markdown rendering with syntax highlighting
 */

import hljs from "highlight.js/lib/core";
// Import only languages we commonly use to keep bundle small
import bash from "highlight.js/lib/languages/bash";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";

// Register languages
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("python", python);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("html", xml);

// Configure marked with syntax highlighting
export const marked = new Marked(
	markedHighlight({
		langPrefix: "hljs language-",
		highlight(code, lang) {
			const language = hljs.getLanguage(lang) ? lang : "plaintext";
			return hljs.highlight(code, { language }).value;
		},
	}),
);

// Configure marked options
marked.setOptions({
	gfm: true,
	breaks: true,
});

/**
 * Render markdown to HTML
 */
export function renderMarkdown(content: string): string {
	return marked.parse(content) as string;
}
