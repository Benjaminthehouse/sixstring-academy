/**
 * Where takes are kept: their audio and the list that describes them, on this device only.
 *
 * Takes are large (about 1 MB a minute at the 128 kbit/s the session asks for), so they never travel in backups or cloud sync
 * and are not in the key-value storage at all: they live in IndexedDB. The store is written
 * against a small `BlobBackend` (put / get / delete of blobs by key) so that it runs on:
 *
 *  - the platform blob store (`@/core/platform/blobs.ts`, store `recorder`; see `backend.ts`);
 *  - the recorder's first database (`ssa-recorder`, `legacy.ts`), only to move takes out of it;
 *  - memory, for tests and for browsers that refuse IndexedDB (takes then last until the page is
 *    closed, and the screen says so).
 *
 * Layout in the backend: the audio of each take under `take/<id>`, and the list of takes as one
 * JSON blob under `takes.json`. Audio is written before the list and removed after it, so the
 * list never names audio that is not there.
 */
import { isBlobStoreError, type BlobStore } from '@/core/platform/blobs';
import { sanitizeTakes, sortTakes, type Take } from './takes';

/** The few blob calls the take store needs. */
export interface BlobBackend {
  /** 'platform' and 'indexeddb' (the old database) survive a reload; 'memory' does not. */
  readonly kind: 'platform' | 'indexeddb' | 'memory';
  get(key: string): Promise<Blob | null>;
  put(key: string, blob: Blob): Promise<void>;
  delete(key: string): Promise<void>;
}

/** The take store's backend on a platform blob store (its memory stand-in counts as memory). */
export function platformBackend(store: BlobStore): BlobBackend {
  return {
    kind: store.persistent ? 'platform' : 'memory',
    get: (key) => store.get(key),
    put: (key, blob) => store.put(key, blob),
    delete: (key) => store.delete(key),
  };
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
  // The platform store reports a full disk as BlobStoreError 'full'; raw IndexedDB as QuotaExceededError.
  if (name === 'QuotaExceededError' || (isBlobStoreError(e) && e.reason === 'full')) return new TakeStoreError('full', FULL, String(e));
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

/**
 * Move every take of `from` that `to` does not have yet (by id), audio first, then its line in the
 * list. A take whose audio is missing is left behind (it could not play). Safe to run twice and
 * from two tabs at once; rejects (with nothing lost in `from`) when `to` cannot take a take.
 * Returns how many takes were moved.
 */
export async function migrateTakes(from: TakeStore, to: TakeStore): Promise<number> {
  const old = await from.list();
  if (old.length === 0) return 0;
  const have = new Set((await to.list()).map((t) => t.id));
  let moved = 0;
  for (const take of old) {
    if (have.has(take.id)) continue;
    const audio = await from.audio(take.id);
    if (!audio) continue;
    await to.put(take, audio);
    moved++;
  }
  return moved;
}
