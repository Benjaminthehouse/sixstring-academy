/**
 * Platform services: everything that touches the host the app runs on (browser APIs, the Claude
 * artifact runtime, the one permitted network call). Features import from `@/core/platform` and
 * never reach for `localStorage`, `getUserMedia`, `<a download>`, `window.print`, the clipboard
 * or `fetch` themselves. Read `API.md` before using it.
 */
export * from './env';
export * from './storage';
export * from './media';
export * from './ai';
export * from './download';
export * from './files';
export * from './speech';
export * from './sync';
export * from './wake-lock';
