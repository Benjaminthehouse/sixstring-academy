/**
 * A small static file server for checks that need the production build (e2e/perf.cjs,
 * e2e/pwa.cjs), not the dev server. It behaves like an ordinary static host: gzip for text, a
 * long cache for the hashed files under assets/, revalidation for everything else, and 404 for
 * what is missing. Hooks let a check rewrite a file on the fly (a new service worker version).
 *
 *   const { serveDir } = require('./perf-lib.cjs');
 *   const server = await serveDir('/abs/dist', { rewrite: (rel, buf) => buf });
 *   ... server.url ... server.requests (every path asked for) ... await server.close();
 */
'use strict';
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const zlib = require('node:zlib');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream',
  '.ttf': 'font/ttf',
  '.task': 'application/octet-stream',
  '.gz': 'application/gzip',
  '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = /^(text\/|application\/(json|manifest\+json|javascript)|image\/svg)/;

/** Serve `root` on 127.0.0.1 at a free port. */
async function serveDir(root, options = {}) {
  const gzipCache = new Map();
  const requests = [];
  let offline = false;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    requests.push(rel);
    if (offline) {
      req.socket.destroy();
      return;
    }
    const file = path.join(root, rel);
    if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    let body = fs.readFileSync(file);
    if (options.rewrite) body = options.rewrite(rel, body) ?? body;
    const type = TYPES[path.extname(rel).toLowerCase()] ?? 'application/octet-stream';
    const headers = {
      'content-type': type,
      'cache-control': rel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    };
    if (COMPRESSIBLE.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '') && body.length > 1024) {
      const key = `${rel}:${body.length}`;
      if (!gzipCache.has(key) || options.rewrite) gzipCache.set(key, zlib.gzipSync(body, { level: 6 }));
      body = gzipCache.get(key);
      headers['content-encoding'] = 'gzip';
      headers.vary = 'accept-encoding';
    }
    headers['content-length'] = body.length;
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    requests,
    /** Drop every connection from now on, as a host that went away would. */
    setOffline(value) {
      offline = value;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/** Build the app for production into `outDir` (no type check: that is `npm run typecheck`'s job). */
async function buildInto(outDir, { mode = 'production', quiet = true } = {}) {
  const { build } = await import('vite');
  const root = path.resolve(__dirname, '..');
  await build({ root, mode, logLevel: quiet ? 'error' : 'info', build: { outDir, emptyOutDir: true } });
  return outDir;
}

module.exports = { serveDir, buildInto, TYPES };
