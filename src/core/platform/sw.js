// @ts-nocheck -- a classic service-worker script, not part of the TypeScript program.
/*
 * Sixstring Academy's service worker: hand-written, no libraries. It makes the installed app start
 * and run with no network at all.
 *
 * The production build (the "ssa-pwa" plugin in vite.config.ts) reads this file, replaces
 * __SSA_BUILD__ with { version, precache, vendorRev } and writes it as sw.js next to index.html.
 * It is never registered in the dev server or inside a Claude artifact (core/platform/service-worker.ts).
 *
 *   install   download every file of this build (precache) into its own cache. Files whose name
 *             carries a content hash (assets/) are copied from the previous version's cache when it
 *             already has them, so an update only downloads what changed.
 *   waiting   a new version waits until the page says "SKIP_WAITING" (the learner tapped Reload on
 *             the "new version" toast) or every tab of the old one has closed.
 *   activate  delete the caches of older versions and take control of open pages.
 *   fetch     opening the app: index.html from the cache; the build's files: cache first;
 *             vendor/ (OCR data, hand model, pdf.js extras: large, and only some learners need
 *             them): kept the first time they are used, so they work offline after that.
 *             Everything else (other hosts, the AI service, range requests) goes to the network
 *             untouched.
 */
const BUILD = __SSA_BUILD__;
const PREFIX = 'ssa-';
const PRECACHE = `${PREFIX}precache-${BUILD.version}`;
const VENDOR = `${PREFIX}vendor-${BUILD.vendorRev}`;
const SHELL = 'index.html';
const PARALLEL = 6;
const PRECACHED = new Set(BUILD.precache);

/** Absolute URL of a path relative to where this worker lives (the app's folder). */
const scoped = (path) => new URL(path, self.registration.scope).href;

/** The path of a URL relative to the app's folder, or null for a URL outside it. */
function relativePath(url) {
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return null;
  return decodeURIComponent(url.pathname.slice(scope.pathname.length));
}

/** File names under assets/ carry a content hash: the same name is the same bytes, in any version. */
const isHashed = (path) => path.startsWith('assets/');

async function download(url) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(new Request(url, { cache: 'reload', credentials: 'same-origin' }));
      if (response.ok) return response;
      lastError = new Error(`${url}: HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function precache() {
  const cache = await caches.open(PRECACHE);
  const older = [];
  for (const name of await caches.keys()) {
    if (name.startsWith(`${PREFIX}precache-`) && name !== PRECACHE) older.push(await caches.open(name));
  }
  const queue = [...BUILD.precache];
  async function next() {
    while (queue.length > 0) {
      const path = queue.shift();
      const url = scoped(path);
      // An install that was interrupted (tab closed, network lost) resumes where it stopped.
      if (await cache.match(url)) continue;
      let response = null;
      if (isHashed(path)) {
        for (const old of older) {
          response = await old.match(url);
          if (response) break;
        }
      }
      await cache.put(url, response ?? (await download(url)));
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, next));
}

async function cleanUp() {
  for (const name of await caches.keys()) {
    if (name.startsWith(PREFIX) && name !== PRECACHE && name !== VENDOR) await caches.delete(name);
  }
}

async function fromPrecache(path) {
  const cache = await caches.open(PRECACHE);
  return (await cache.match(scoped(path), { ignoreSearch: true })) ?? null;
}

async function openApp(request) {
  return (await fromPrecache(SHELL)) ?? fetch(request);
}

async function buildFile(request, path) {
  return (await fromPrecache(path)) ?? fetch(request);
}

async function vendorFile(event, request) {
  const cache = await caches.open(VENDOR);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const response = await fetch(request);
  if (response.status === 200 && response.type === 'basic') {
    event.waitUntil(cache.put(request, response.clone()).catch(() => undefined));
  }
  return response;
}

/** The answer to a request, or null to let the browser fetch it as if there were no worker. */
function respond(event) {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return null;
  const url = new URL(request.url);
  const path = relativePath(url);
  if (path === null) return null;
  if (request.mode === 'navigate') {
    if (path === '' || path === SHELL) return openApp(request);
    // Any other address in the app's folder: the network, and the app when there is none.
    return fetch(request).catch(() => openApp(request));
  }
  if (PRECACHED.has(path)) return buildFile(request, path);
  if (path.startsWith('vendor/')) return vendorFile(event, request);
  return null;
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(cleanUp().then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const response = respond(event);
  if (response) event.respondWith(response);
});

self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;
  if (type === 'SKIP_WAITING') self.skipWaiting();
  else if (type === 'VERSION' && event.ports && event.ports[0]) event.ports[0].postMessage({ version: BUILD.version });
});
