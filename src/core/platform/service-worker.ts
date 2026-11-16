/**
 * The installable, offline app: registers the service worker (`sw.js`, written by the production
 * build from `./sw.js` in this folder) and says when a new version is ready.
 *
 * Only the standalone production app gets a worker. Inside a Claude artifact the host serves the
 * files and blocks everything else, and in the dev server a worker would serve yesterday's build
 * instead of the code being edited, so neither registers one (dev also removes a stray one).
 *
 * Updates never interrupt the learner: a new version downloads in the background and waits. The
 * page is told (`onUpdateReady`), shows a "Reload" toast, and `applyUpdate()` switches over and
 * reloads. Ignored, the new version simply starts the next time the app is opened.
 */
import { isArtifact } from './env';

/** Where the worker stands, for an "Offline ready" line in Settings or a check. */
export type AppUpdateStatus =
  /** Not registered here: artifact host, dev server, no service-worker support or not a secure page. */
  | 'off'
  /** Registered; the first download of the app is in progress or done. */
  | 'active'
  /** A newer version has downloaded and waits for `applyUpdate()` or the next launch. */
  | 'update-ready'
  /** Registration failed (blocked by the browser, the file is missing). The app works as a normal page. */
  | 'failed';

interface WorkerLike {
  state: string;
  postMessage(message: unknown): void;
  addEventListener(type: 'statechange', listener: () => void): void;
}
interface RegistrationLike {
  installing: WorkerLike | null;
  waiting: WorkerLike | null;
  active: WorkerLike | null;
  addEventListener(type: 'updatefound', listener: () => void): void;
  update(): Promise<unknown>;
  unregister?(): Promise<boolean>;
}
interface ContainerLike {
  controller: unknown;
  register(url: string, options: { scope: string; updateViaCache: 'none' }): Promise<RegistrationLike>;
  getRegistrations?(): Promise<RegistrationLike[]>;
  addEventListener(type: 'controllerchange', listener: () => void): void;
}

/** What the updater needs from the page; tests pass fakes. */
export interface ServiceWorkerDeps {
  /** `navigator.serviceWorker`, or null where there is none or the page is not secure. */
  container: () => ContainerLike | null;
  /** Standalone host. False inside a Claude artifact. */
  standalone: () => boolean;
  /** A production build. False in the dev server and in tests. */
  production: () => boolean;
  /** Absolute URL of the worker script and the scope it serves (the app's folder). */
  scriptUrl: () => string;
  scope: () => string;
  /** Run after the page has finished loading, so the background download never slows the first screen. */
  afterLoad: (run: () => void) => void;
  reload: () => void;
  /** Re-check for a new version: when the app comes back to the foreground, at most this often. */
  recheckEveryMs: number;
  onForeground: (run: () => void) => void;
  now: () => number;
}

/** Options of `registerServiceWorker`. */
export interface RegisterOptions {
  /** A new version is ready. Show something with a button that calls `apply` (the shell shows a toast). */
  onUpdateReady?: (apply: () => void) => void;
}

/** The updater behind the module-level functions. */
export interface ServiceWorkerUpdater {
  register(options?: RegisterOptions): Promise<AppUpdateStatus>;
  applyUpdate(): void;
  status(): AppUpdateStatus;
  subscribe(listener: () => void): () => void;
}

const HOUR = 60 * 60 * 1000;

function browserDeps(): ServiceWorkerDeps {
  return {
    container: () => {
      if (typeof navigator === 'undefined' || typeof window === 'undefined' || !window.isSecureContext) return null;
      return (navigator.serviceWorker as unknown as ContainerLike | undefined) ?? null;
    },
    standalone: () => !isArtifact(),
    production: () => import.meta.env.PROD,
    scriptUrl: () => new URL('sw.js', document.baseURI).href,
    scope: () => new URL('./', document.baseURI).href,
    afterLoad: (run) => {
      const idle = () => {
        const ric = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
        if (ric) ric(run, { timeout: 4000 });
        else setTimeout(run, 1000);
      };
      if (document.readyState === 'complete') idle();
      else window.addEventListener('load', idle, { once: true });
    },
    reload: () => window.location.reload(),
    recheckEveryMs: HOUR,
    onForeground: (run) => {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') run();
      });
    },
    now: () => Date.now(),
  };
}

/** Create an updater. Production code uses the shared one behind `registerServiceWorker`. */
export function createServiceWorkerUpdater(overrides: Partial<ServiceWorkerDeps> = {}): ServiceWorkerUpdater {
  const deps: ServiceWorkerDeps = { ...browserDeps(), ...overrides };
  let status: AppUpdateStatus = 'off';
  let registration: RegistrationLike | null = null;
  let applying = false;
  let lastCheck = 0;
  let onUpdateReady: RegisterOptions['onUpdateReady'];
  let started: Promise<AppUpdateStatus> | null = null;
  const listeners = new Set<() => void>();

  const set = (next: AppUpdateStatus): void => {
    if (next === status) return;
    status = next;
    for (const listener of [...listeners]) listener();
  };

  const announce = (): void => {
    if (status === 'update-ready') return;
    set('update-ready');
    onUpdateReady?.(applyUpdate);
  };

  /** A worker that finished installing while another one controls the page is an update. */
  const watchInstalling = (worker: WorkerLike | null, container: ContainerLike): void => {
    if (!worker) return;
    const check = (): void => {
      if (worker.state === 'installed' && container.controller) announce();
    };
    worker.addEventListener('statechange', check);
    check();
  };

  function applyUpdate(): void {
    const waiting = registration?.waiting;
    if (!waiting) {
      deps.reload();
      return;
    }
    applying = true;
    waiting.postMessage({ type: 'SKIP_WAITING' });
  }

  async function removeStray(container: ContainerLike): Promise<void> {
    // A worker left by a production build served from this same address would answer instead of
    // the dev server. Remove ours; leave anyone else's alone.
    const script = deps.scriptUrl();
    const all = (await container.getRegistrations?.().catch(() => [])) ?? [];
    for (const reg of all) {
      const url = (reg.active as { scriptURL?: string } | null)?.scriptURL ?? (reg.waiting as { scriptURL?: string } | null)?.scriptURL;
      if (url === script) await reg.unregister?.().catch(() => false);
    }
  }

  async function start(): Promise<AppUpdateStatus> {
    const container = deps.container();
    if (!container || !deps.standalone()) return 'off';
    if (!deps.production()) {
      await removeStray(container);
      return 'off';
    }
    await new Promise<void>((resolve) => deps.afterLoad(resolve));
    try {
      let controlled = !!container.controller;
      const reg = await container.register(deps.scriptUrl(), { scope: deps.scope(), updateViaCache: 'none' });
      registration = reg;
      lastCheck = deps.now();
      set('active');
      container.addEventListener('controllerchange', () => {
        // Ours: the learner asked for the new version. Another tab's: this page is now older
        // than its worker, so offer the reload. The first install taking control is neither.
        if (applying) deps.reload();
        else if (controlled) announce();
        controlled = true;
      });
      if (reg.waiting && container.controller) announce();
      watchInstalling(reg.installing, container);
      reg.addEventListener('updatefound', () => watchInstalling(reg.installing, container));
      deps.onForeground(() => {
        if (deps.now() - lastCheck < deps.recheckEveryMs) return;
        lastCheck = deps.now();
        void reg.update().catch(() => undefined);
      });
      return status;
    } catch {
      set('failed');
      return 'failed';
    }
  }

  return {
    register(options = {}) {
      onUpdateReady = options.onUpdateReady ?? onUpdateReady;
      started ??= start();
      return started;
    },
    applyUpdate,
    status: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

let shared: ServiceWorkerUpdater | null = null;
const instance = (): ServiceWorkerUpdater => (shared ??= createServiceWorkerUpdater());

/**
 * Make the app installable and offline (standalone production build only; a no-op elsewhere).
 * Call once at startup. Resolves with the status once registered (after the page has loaded).
 */
export function registerServiceWorker(options?: RegisterOptions): Promise<AppUpdateStatus> {
  return instance().register(options);
}

/** Switch to the waiting new version and reload the page (the "Reload" button). */
export function applyUpdate(): void {
  instance().applyUpdate();
}

/** The current status, for `useSyncExternalStore`. */
export function getAppUpdateStatus(): AppUpdateStatus {
  return instance().status();
}

/** Be told when the status changes. Returns the unsubscribe function. */
export function subscribeAppUpdate(listener: () => void): () => void {
  return instance().subscribe(listener);
}
