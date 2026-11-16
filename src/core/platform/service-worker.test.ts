import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { createServiceWorkerUpdater, type ServiceWorkerDeps } from './service-worker';

// ---------------------------------------------------------------------------------------------
// The worker script (sw.js), run as the browser runs it: a classic script in its own global scope
// ---------------------------------------------------------------------------------------------

const SCOPE = 'https://app.example/guitar/';
const SOURCE = readFileSync(fileURLToPath(new URL('./sw.js', import.meta.url)), 'utf8');

interface FakeRequest {
  url: string;
  method: string;
  mode: string;
  headers: Headers;
}

const keyOf = (input: string | FakeRequest, ignoreSearch = false): string => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (ignoreSearch) url.search = '';
  return url.href;
};

class FakeCache {
  readonly entries = new Map<string, Response>();
  async match(input: string | FakeRequest, options: { ignoreSearch?: boolean } = {}): Promise<Response | undefined> {
    const wanted = keyOf(input, options.ignoreSearch);
    for (const [key, response] of this.entries) if (keyOf(key, options.ignoreSearch) === wanted) return response.clone();
    return undefined;
  }
  async put(input: string | FakeRequest, response: Response): Promise<void> {
    this.entries.set(keyOf(input), response.clone());
  }
}

class FakeCaches {
  readonly stores = new Map<string, FakeCache>();
  async open(name: string): Promise<FakeCache> {
    if (!this.stores.has(name)) this.stores.set(name, new FakeCache());
    return this.stores.get(name)!;
  }
  async keys(): Promise<string[]> {
    return [...this.stores.keys()];
  }
  async delete(name: string): Promise<boolean> {
    return this.stores.delete(name);
  }
}

interface Build {
  version: string;
  vendorRev: string;
  precache: string[];
}

/** One installed copy of sw.js with a fake network behind it. */
function worker(build: Build, options: { caches?: FakeCaches; files?: Record<string, string> } = {}) {
  const caches = options.caches ?? new FakeCaches();
  const files: Record<string, string> = { ...(options.files ?? {}) };
  let online = true;
  const fetch = vi.fn(async (input: string | FakeRequest | Request) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!online) throw new TypeError('Failed to fetch');
    const path = new URL(url).pathname.replace('/guitar/', '');
    if (!(path in files)) return new Response('missing', { status: 404 });
    // A same-origin answer, as a browser types it.
    return Object.defineProperty(new Response(files[path], { status: 200 }), 'type', { value: 'basic' });
  });
  const listeners = new Map<string, (event: unknown) => void>();
  const claim = vi.fn(async () => undefined);
  const skipWaiting = vi.fn(async () => undefined);
  const self = {
    registration: { scope: SCOPE },
    clients: { claim },
    skipWaiting,
    addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener),
  };
  vm.runInNewContext(SOURCE, { self, caches, fetch, Request, Response, Headers, URL, __SSA_BUILD__: build, console });

  async function lifecycle(type: 'install' | 'activate'): Promise<void> {
    const pending: Promise<unknown>[] = [];
    listeners.get(type)!({ waitUntil: (p: Promise<unknown>) => pending.push(p) });
    await Promise.all(pending);
  }

  /** What the worker answers, or null when it lets the browser fetch normally. */
  async function request(path: string, init: { mode?: string; method?: string; headers?: Record<string, string>; absolute?: boolean } = {}): Promise<string | null> {
    const url = init.absolute ? path : SCOPE + path;
    const req: FakeRequest = { url, method: init.method ?? 'GET', mode: init.mode ?? 'cors', headers: new Headers(init.headers ?? {}) };
    let answer: Promise<Response> | null = null;
    const pending: Promise<unknown>[] = [];
    listeners.get('fetch')!({ request: req, respondWith: (p: Promise<Response>) => (answer = p), waitUntil: (p: Promise<unknown>) => pending.push(p) });
    if (!answer) return null;
    const response = await (answer as Promise<Response>);
    await Promise.all(pending);
    return response.text();
  }

  return {
    caches,
    files,
    fetch,
    claim,
    skipWaiting,
    install: () => lifecycle('install'),
    activate: () => lifecycle('activate'),
    request,
    message: (data: unknown) => listeners.get('message')!({ data, ports: [] }),
    setOnline: (value: boolean) => (online = value),
  };
}

const V1: Build = { version: 'v1', vendorRev: 'r1', precache: ['index.html', 'manifest.webmanifest', 'assets/index-aaa.js', 'assets/home-bbb.js', 'assets/index-ccc.css'] };
const FILES_V1 = { 'index.html': '<html>v1</html>', 'manifest.webmanifest': '{}', 'assets/index-aaa.js': 'entry v1', 'assets/home-bbb.js': 'home', 'assets/index-ccc.css': 'css', 'vendor/tesseract/worker.min.js': 'ocr', 'other.txt': 'not ours' };

describe('sw.js: install', () => {
  it('downloads every file of the build into the cache of this version, bypassing the HTTP cache', async () => {
    const sw = worker(V1, { files: FILES_V1 });
    await sw.install();
    const cache = sw.caches.stores.get('ssa-precache-v1')!;
    expect([...cache.entries.keys()].sort()).toEqual(V1.precache.map((p) => SCOPE + p).sort());
    expect(sw.fetch).toHaveBeenCalledTimes(V1.precache.length);
    const first = sw.fetch.mock.calls[0][0] as Request;
    expect(first.cache).toBe('reload');
  });

  it('copies unchanged hashed files from the previous version instead of downloading them again', async () => {
    const old = worker(V1, { files: FILES_V1 });
    await old.install();
    const V2: Build = { version: 'v2', vendorRev: 'r1', precache: ['index.html', 'manifest.webmanifest', 'assets/index-ddd.js', 'assets/home-bbb.js', 'assets/index-ccc.css'] };
    const sw = worker(V2, { caches: old.caches, files: { ...FILES_V1, 'index.html': '<html>v2</html>', 'assets/index-ddd.js': 'entry v2' } });
    await sw.install();
    const fetched = sw.fetch.mock.calls.map((c) => new URL((c[0] as Request).url).pathname.replace('/guitar/', '')).sort();
    // index.html and the manifest have no hash in their names, so they are always fetched.
    expect(fetched).toEqual(['assets/index-ddd.js', 'index.html', 'manifest.webmanifest']);
    expect(await sw.caches.stores.get('ssa-precache-v2')!.match(SCOPE + 'assets/home-bbb.js').then((r) => r?.text())).toBe('home');
  });

  it('fails the install when a file cannot be downloaded, so the browser tries again later', async () => {
    const { 'assets/home-bbb.js': _gone, ...files } = FILES_V1;
    const sw = worker(V1, { files });
    await expect(sw.install()).rejects.toThrow(/home-bbb\.js: HTTP 404/);
  });

  it('picks up an interrupted install where it stopped', async () => {
    const sw = worker(V1, { files: FILES_V1 });
    await (await sw.caches.open('ssa-precache-v1')).put(SCOPE + 'assets/index-aaa.js', new Response('entry v1'));
    await sw.install();
    expect(sw.fetch).toHaveBeenCalledTimes(V1.precache.length - 1);
  });
});

describe('sw.js: activate', () => {
  it('deletes older versions (app and vendor files), keeps its own and takes control of open pages', async () => {
    const caches = new FakeCaches();
    for (const name of ['ssa-precache-v0', 'ssa-vendor-r0', 'ssa-vendor-r1', 'someone-else']) await caches.open(name);
    const sw = worker(V1, { caches, files: FILES_V1 });
    await sw.install();
    await sw.activate();
    expect((await caches.keys()).sort()).toEqual(['someone-else', 'ssa-precache-v1', 'ssa-vendor-r1']);
    expect(sw.claim).toHaveBeenCalledTimes(1);
  });
});

describe('sw.js: fetch', () => {
  it('opens the app from the cache with no network at all', async () => {
    const sw = worker(V1, { files: FILES_V1 });
    await sw.install();
    sw.setOnline(false);
    expect(await sw.request('', { mode: 'navigate' })).toBe('<html>v1</html>');
    expect(await sw.request('index.html', { mode: 'navigate' })).toBe('<html>v1</html>');
    expect(await sw.request('assets/home-bbb.js')).toBe('home');
    expect(await sw.request('assets/index-aaa.js?x=1')).toBe('entry v1');
    // Another address in the app's folder: the network first, the app when there is none.
    expect(await sw.request('some/where', { mode: 'navigate' })).toBe('<html>v1</html>');
  });

  it('keeps vendor files the first time they are used, and serves them offline after that', async () => {
    const sw = worker(V1, { files: FILES_V1 });
    await sw.install();
    expect(await sw.request('vendor/tesseract/worker.min.js')).toBe('ocr');
    sw.setOnline(false);
    expect(await sw.request('vendor/tesseract/worker.min.js')).toBe('ocr');
    expect(sw.caches.stores.get('ssa-vendor-r1')!.entries.size).toBe(1);
  });

  it('leaves alone what is not the app: other hosts, other files, posts and range requests', async () => {
    const sw = worker(V1, { files: FILES_V1 });
    await sw.install();
    expect(await sw.request('https://api.anthropic.com/v1/messages', { absolute: true })).toBeNull();
    expect(await sw.request('https://app.example/elsewhere/index.html', { absolute: true, mode: 'navigate' })).toBeNull();
    expect(await sw.request('other.txt')).toBeNull();
    expect(await sw.request('assets/home-bbb.js', { method: 'POST' })).toBeNull();
    expect(await sw.request('vendor/mediapipe/hand_landmarker.task', { headers: { range: 'bytes=0-99' } })).toBeNull();
  });
});

describe('sw.js: updates', () => {
  it('waits for the page to say SKIP_WAITING', async () => {
    const sw = worker(V1, { files: FILES_V1 });
    await sw.install();
    expect(sw.skipWaiting).not.toHaveBeenCalled();
    sw.message({ type: 'something else' });
    expect(sw.skipWaiting).not.toHaveBeenCalled();
    sw.message({ type: 'SKIP_WAITING' });
    expect(sw.skipWaiting).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------------------------
// The page side (service-worker.ts)
// ---------------------------------------------------------------------------------------------

type Listener = () => void;

function fakeWorker(state: string) {
  const listeners: Listener[] = [];
  return {
    state,
    postMessage: vi.fn(),
    addEventListener: (_type: 'statechange', l: Listener) => listeners.push(l),
    to(next: string) {
      this.state = next;
      listeners.forEach((l) => l());
    },
  };
}
type FakeWorker = ReturnType<typeof fakeWorker>;

function page(options: { controlled?: boolean; waiting?: FakeWorker | null; installing?: FakeWorker | null; strays?: string[] } = {}) {
  const updateFound: Listener[] = [];
  const controllerChange: Listener[] = [];
  const registration = {
    installing: options.installing ?? null,
    waiting: options.waiting ?? null,
    active: fakeWorker('activated'),
    addEventListener: (_type: 'updatefound', l: Listener) => updateFound.push(l),
    update: vi.fn(async () => undefined),
  };
  const strays = (options.strays ?? []).map((scriptURL) => ({ ...registration, active: { scriptURL }, waiting: null, unregister: vi.fn(async () => true) }));
  const container = {
    controller: options.controlled ? {} : null,
    register: vi.fn(async () => registration),
    getRegistrations: vi.fn(async () => strays),
    addEventListener: (_type: 'controllerchange', l: Listener) => controllerChange.push(l),
  };
  let foreground: Listener = () => undefined;
  let clock = 0;
  const reload = vi.fn();
  const deps: Partial<ServiceWorkerDeps> = {
    container: () => container as unknown as ReturnType<ServiceWorkerDeps['container']>,
    standalone: () => true,
    production: () => true,
    scriptUrl: () => 'https://app.example/guitar/sw.js',
    scope: () => 'https://app.example/guitar/',
    afterLoad: (run) => run(),
    reload,
    recheckEveryMs: 60_000,
    onForeground: (run) => (foreground = run),
    now: () => clock,
  };
  return {
    deps,
    container,
    registration,
    strays,
    reload,
    /** A new worker starts installing (the browser found a changed sw.js). */
    updateFound(worker: FakeWorker) {
      registration.installing = worker;
      updateFound.forEach((l) => l());
    },
    controllerChange() {
      container.controller = {};
      controllerChange.forEach((l) => l());
    },
    foreground: () => foreground(),
    tick: (ms: number) => (clock += ms),
  };
}

describe('registerServiceWorker', () => {
  it('registers nothing inside a Claude artifact', async () => {
    const p = page();
    const updater = createServiceWorkerUpdater({ ...p.deps, standalone: () => false });
    expect(await updater.register()).toBe('off');
    expect(p.container.register).not.toHaveBeenCalled();
  });

  it('registers nothing in the dev server, and removes a worker a production build left at this address', async () => {
    const p = page({ strays: ['https://app.example/guitar/sw.js', 'https://app.example/guitar/other-sw.js'] });
    const updater = createServiceWorkerUpdater({ ...p.deps, production: () => false });
    expect(await updater.register()).toBe('off');
    expect(p.container.register).not.toHaveBeenCalled();
    expect(p.strays[0].unregister).toHaveBeenCalledTimes(1);
    expect(p.strays[1].unregister).not.toHaveBeenCalled();
  });

  it('is off where the browser has no service workers', async () => {
    const updater = createServiceWorkerUpdater({ ...page().deps, container: () => null });
    expect(await updater.register()).toBe('off');
  });

  it('registers the app-wide worker once the page has loaded, bypassing the HTTP cache for sw.js', async () => {
    const p = page();
    let loaded: (() => void) | null = null;
    const updater = createServiceWorkerUpdater({ ...p.deps, afterLoad: (run) => (loaded = run) });
    const done = updater.register();
    await Promise.resolve();
    expect(p.container.register).not.toHaveBeenCalled();
    loaded!();
    expect(await done).toBe('active');
    expect(p.container.register).toHaveBeenCalledWith('https://app.example/guitar/sw.js', { scope: 'https://app.example/guitar/', updateViaCache: 'none' });
    expect(await updater.register()).toBe('active'); // a second call changes nothing
    expect(p.container.register).toHaveBeenCalledTimes(1);
  });

  it('says nothing on the first install, when the new worker takes control of the page', async () => {
    const installing = fakeWorker('installing');
    const p = page({ installing });
    const onUpdateReady = vi.fn();
    await createServiceWorkerUpdater(p.deps).register({ onUpdateReady });
    installing.to('installed');
    p.controllerChange();
    expect(onUpdateReady).not.toHaveBeenCalled();
    expect(p.reload).not.toHaveBeenCalled();
  });

  it('announces a downloaded update once, and Reload switches to it and reloads', async () => {
    const p = page({ controlled: true });
    const onUpdateReady = vi.fn();
    const updater = createServiceWorkerUpdater(p.deps);
    await updater.register({ onUpdateReady });
    const next = fakeWorker('installing');
    p.updateFound(next);
    expect(onUpdateReady).not.toHaveBeenCalled();
    next.to('installed');
    p.registration.waiting = next;
    next.to('installed');
    expect(onUpdateReady).toHaveBeenCalledTimes(1);
    expect(updater.status()).toBe('update-ready');
    const apply = onUpdateReady.mock.calls[0][0] as () => void;
    apply();
    expect(next.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(p.reload).not.toHaveBeenCalled();
    p.controllerChange();
    expect(p.reload).toHaveBeenCalledTimes(1);
  });

  it('announces an update that was already waiting when the app opened', async () => {
    const p = page({ controlled: true, waiting: fakeWorker('installed') });
    const onUpdateReady = vi.fn();
    await createServiceWorkerUpdater(p.deps).register({ onUpdateReady });
    expect(onUpdateReady).toHaveBeenCalledTimes(1);
  });

  it('offers a reload when another tab switched to a new version under this page', async () => {
    const p = page({ controlled: true });
    const onUpdateReady = vi.fn();
    const updater = createServiceWorkerUpdater(p.deps);
    await updater.register({ onUpdateReady });
    p.controllerChange();
    expect(p.reload).not.toHaveBeenCalled();
    expect(onUpdateReady).toHaveBeenCalledTimes(1);
    (onUpdateReady.mock.calls[0][0] as () => void)();
    expect(p.reload).toHaveBeenCalledTimes(1); // nothing waiting: just reload
  });

  it('looks for a new version when the app comes back to the foreground, at most once an interval', async () => {
    const p = page({ controlled: true });
    await createServiceWorkerUpdater(p.deps).register();
    p.foreground();
    expect(p.registration.update).not.toHaveBeenCalled();
    p.tick(60_001);
    p.foreground();
    p.foreground();
    expect(p.registration.update).toHaveBeenCalledTimes(1);
  });

  it('reports a failed registration and carries on as a normal page', async () => {
    const p = page();
    p.container.register.mockRejectedValueOnce(new Error('blocked'));
    const updater = createServiceWorkerUpdater(p.deps);
    expect(await updater.register()).toBe('failed');
    expect(updater.status()).toBe('failed');
  });
});
