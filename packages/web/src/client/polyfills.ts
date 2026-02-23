/**
 * Browser polyfills for Node.js modules
 *
 * pi-web-ui transitively imports Node.js-specific modules through pi-ai,
 * but we don't actually use them in our browser-based WebSocket architecture.
 * These empty exports prevent build errors.
 */

// Stream module polyfills
export class Readable {
	static from() {
		return {};
	}
}

export class Writable {}
export class Duplex {}
export class Transform {}
export class PassThrough {}

// Default export for stream
export default {
	Readable,
	Writable,
	Duplex,
	Transform,
	PassThrough,
};
