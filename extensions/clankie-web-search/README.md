# @clankie/web-search

Headless web search and page extraction for clankie using CloakBrowser + Playwright.

> **Note**
> While some `@clankie` extensions may work with a bare pi installation, they are crafted to be used with clankie (built on top of pi).

## Tools

- `web_search` — search DuckDuckGo (HTML results) and return title/link/snippet blocks
- `web_fetch_html` — open a URL and return fetched HTML
- `html_to_markdown` — convert raw HTML to Markdown (raw or readability mode)

## Notes

- Handles output truncation with pointers to full temp files when needed
- Useful for research workflows where the agent needs fresh web context

## Package contents

Published files include:

- `src/`
- `package.json`
- `README.md`
