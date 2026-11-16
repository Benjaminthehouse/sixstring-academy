/**
 * Where takes are kept: their audio and the list that describes them, on this device only.
 *
 * Takes are large (about half a megabyte a minute), so they never travel in backups or cloud sync
 * and are not in the key-value storage at all: they live in IndexedDB. The store is written
 * against a small `BlobBackend` (put / get / delete of blobs by key) so that it runs on:
 *
 *  - the platform blob store (`@/core/platform/blobs.ts`) once it is there (see `backend.ts`);
 *  - its own IndexedDB database (`ssa-recorder`) until then;
 *  - memory, for tests and for browsers that refuse IndexedDB (takes then last until the page is
 *    closed, and the screen says so).
 *
 * Layout in the backend: the audio of each take under `take/<id>`, and the list of takes as one
 * JSON blob under `takes.json`. Audio is written before the list and removed after it, so the
 * list never names audio that is not there.
 */
import { sanitizeTakes, sortTakes, type Take } from './takes';

/** The few blob calls the take store needs. */
export interface BlobBackend {
  /** 'indexeddb' and 'platform' survive a reload; 'memory' does not. */
  readonly kind: 'platform' | 'indexeddb' | 'memory';
  get(key: string): Promise<Blob | null>;
  put(key: string, blob: Blob): Promise<void>;
  delete(key: string): Promise<void>;
}

/** What went wrong in the store, in words for the learner. */
export class TakeStoreError extends Error {
  constructor(
    readonly reason: 'full' | 'storage' | 'missing',
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'TakeStoreError';
  }
}

const FULL = 'There is no room left on this device for another take. Delete a few takes you no longer need (save them as files first), then try again.';
const BROKEN = 'Your take could not be saved on this device. Try again; if it keeps failing, check that this site may store data.';

function storeError(e: unknown): TakeStoreError {
  if (e instanceof TakeStoreError) return e;
  const name = (e as { name?: string } | null)?.name;
  if (name === 'QuotaExceededError') return new TakeStoreError('full', FULL, String(e));
  return new TakeStoreError('storage', BROKEN, String(e));
}

const LIST_KEY = 'takes.json';
const AUDIO_KEY = (id: string) => `take/${id}`;

/** The learner's takes on this device. */
export interface TakeStore {
  readonly backend: BlobBackend['kind'];
  /** True when takes survive closing the page. */
  persistent(): boolean;
  /** Every take, newest first. */
  list(): Promise<Take[]>;
  /** The audio of a take, or null when it is gone. */
  audio(id: string): Promise<Blob | null>;
  /** Add a take with its audio, or (no `audio`) change its details. Returns the new list. */
  put(take: Take, audio?: Blob): Promise<Take[]>;
  /** Remove a take and its audio. Returns the new list. */
  remove(id: string): Promise<Take[]>;
}

/** A take store on any blob backend. Calls run one at a time, so two quick changes never lose one another. */
export function createTakeStore(backend: BlobBackend): TakeStore {
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => undefined);
    return run;
  };

  const readList = async (): Promise<Take[]> => {
    const blob = await backend.get(LIST_KEY);
    if (!blob) return [];
    try {
      return sanitizeTakes(JSON.parse(await blob.text()));
    } catch {
      return [];
    }
  };
  const writeList = (takes: readonly Take[]) => backend.put(LIST_KEY, new Blob([JSON.stringify(sortTakes(takes))], { type: 'application/json' }));

  return {
    backend: backend.kind,
    persistent: () => backend.kind !== 'memory',
    list: () =>
      serial(async () => {
        try {
          return await readList();
        } catch (e) {
          throw storeError(e);
        }
      }),
    audio: async (id) => {
      try {
        return await backend.get(AUDIO_KEY(id));
      } catch (e) {
        throw storeError(e);
      }
    },
    put: (take, audio) =>
      serial(async () => {
        try {
          const list = await readList();
          const index = list.findIndex((t) => t.id === take.id);
          if (audio === undefined && index < 0) throw new TakeStoreError('missing', 'That take is no longer on this device.');
          if (audio !== undefined) await backend.put(AUDIO_KEY(take.id), audio);
          const next = index >= 0 ? list.map((t, i) => (i === index ? take : t)) : [...list, take];
          try {
            await writeList(next);
          } catch (e) {
            // The list could not take it: do not leave audio behind that nothing names.
            if (audio !== undefined && index < 0) await backend.delete(AUDIO_KEY(take.id)).catch(() => undefined);
            throw e;
          }
          return sortTakes(next);
        } catch (e) {
          throw storeError(e);
        }
      }),
    remove: (id) =>
      serial(async () => {
        try {
          const list = await readList();
          const next = list.filter((t) => t.id !== id);
          if (next.length !== list.length) await writeList(next);
          await backend.delete(AUDIO_KEY(id));
          return next;
        } catch (e) {
          throw storeError(e);
        }
      }),
  };
}

/** A backend in memory (tests; browsers that refuse IndexedDB). */
export function memoryBackend(): BlobBackend {
  const blobs = new Map<string, Blob>();
  return {
    kind: 'memory',
    get: async (key) => blobs.get(key) ?? null,
    put: async (key, blob) => {
      blobs.set(key, blob);
    },
    delete: async (key) => {
      blobs.delete(key);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The recorder's own IndexedDB database, used until the platform blob store is there.
// ---------------------------------------------------------------------------------------------

const DB_NAME = 'ssa-recorder';
const DB_VERSION = 1;
const STORE = 'blobs';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException('aborted', 'AbortError'));
  });
}

/** Open the recorder's database, or reject (missing, refused, or no answer within `timeoutMs`). */
export function openRecorderDb(factory: IDBFactory | undefined = typeof indexedDB === 'undefined' ? undefined : indexedDB, timeoutMs = 4000): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!factory) return reject(new Error('IndexedDB is not available'));
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(new Error('IndexedDB did not answer'));
    }, timeoutMs);
    let req: IDBOpenDBRequest;
    try {
      req = factory.open(DB_NAME, DB_VERSION);
    } catch (e) {
      clearTimeout(timer);
      return reject(e);
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      clearTimeout(timer);
      if (settled) {
        req.result.close();
        return;
      }
      settled = true;
      resolve(req.result);
    };
    req.onerror = () => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(req.error);
      }
    };
  });
}

/** A backend on an open IndexedDB database (blobs stored as they are, keyed by string). */
export function indexedDbBackend(db: IDBDatabase): BlobBackend {
  db.onversionchange = () => db.close();
  return {
    kind: 'indexeddb',
    get: async (key) => {
      const tx = db.transaction(STORE, 'readonly');
      const value = (await request(tx.objectStore(STORE).get(key))) as unknown;
      return value instanceof Blob ? value : null;
    },
    put: async (key, blob) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(blob, key);
      await done(tx);
    },
    delete: async (key) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      await done(tx);
    },
  };
}
