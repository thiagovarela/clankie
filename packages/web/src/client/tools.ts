/**
 * Tool renderer registration
 *
 * Registers pi-web-ui's built-in tool renderers for displaying tool call results.
 */

import { BashRenderer, DefaultRenderer, registerToolRenderer } from "@mariozechner/pi-web-ui";

// Register bash command renderer
registerToolRenderer("bash", new BashRenderer());

// Register default fallback renderer for unknown tools
registerToolRenderer("*", new DefaultRenderer());
