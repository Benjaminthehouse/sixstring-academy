/**
 * Where the learner's songs are kept. Three interchangeable stores behind one small interface:
 *
 *  - IndexedDB (`ssa-library`): the normal case; two object stores, `entries` (the small listings
 *    the Songs screen reads) and `songs` (the full song JSON, read only when a song is opened).
 *  - the platform key-value storage (`library.v1.*`), for browsers where IndexedDB is missing or
 *    refused (some private windows): much smaller, so it has its own size limit.
 *  - memory, for tests (and implicitly when the platform storage itself is memory-only).
 */
import { isPersistent, readRaw, remove as removeRaw, writeRaw } from '@/core/platform';
import { LibraryError, type SongListing } from './types';

/** Largest stored song (its JSON), in bytes. */
export const MAX_SONG_BYTES = 2 * 1024 * 1024;
/** Most songs of the learner's own. */
export const MAX_SONGS = 1000;
/** Room for the learner's songs in IndexedDB, in bytes. */
export const MAX_LIBRARY_BYTES = 100 * 1024 * 1024;
/** Room in the key-value fallback, in bytes (it shares the browser's ~5 MB with progress). */
export const FALLBACK_LIBRARY_BYTES = 1.5 * 1024 * 1024;

/** The persistence a library runs on. */
export interface SongStore {
  readonly backend: 'indexeddb' | 'storage' | 'memory';
  /** Bytes the learner's songs may use in this store. */
  readonly limitBytes: number;
  /** True when what is stored survives a reload. */
  persistent(): boolean;
  /** Every stored listing. */
  entries(): Promise<SongListing[]>;
  /** The stored song JSON, or null. */
  song(id: string): Promise<string | null>;
  /** Store a listing, and the song JSON with it unless `json` is omitted (a details-only change). */
  put(listing: SongListing, json?: string): Promise<void>;
  remove(id: string): Promise<void>;
}

/** UTF-8 size of a string. */
export function byteSize(text: string): number {
  return new TextEncoder().encode(text).length;
}

const FULL_MESSAGE = 'There is no room left to save songs on this device. Delete a few songs you no longer need, then try again.';

// ---------------------------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------------------------

/** A store that lives in memory (tests; nothing survives a reload). */
export function memoryStore(limitBytes = MAX_LIBRARY_BYTES): SongStore {
  const entries = new Map<string, SongListing>();
  const songs = new Map<string, string>();
  return {
    backend: 'memory',
    limitBytes,
    persistent: () => false,
    entries: async () => [...entries.values()].map((e) => structuredClone(e)),
    song: async (id) => songs.get(id) ?? null,
    put: async (listing, json) => {
      entries.set(listing.id, structuredClone(listing));
      if (json !== undefined) songs.set(listing.id, json);
    },
    remove: async (id) => {
      entries.delete(id);
      songs.delete(id);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Key-value fallback
// ---------------------------------------------------------------------------------------------

/** The key-value calls the fallback store needs (the platform storage by default). */
export interface KeyValue {
  read(key: string): string | null;
  /** False when the value could not be stored durably. */
  write(key: string, value: string): boolean;
  remove(key: string): void;
  /** True when values survive a reload. */
  persistent(): boolean;
}

const PLATFORM_KV: KeyValue = { read: readRaw, write: writeRaw, remove: removeRaw, persistent: isPersistent };
const INDEX_KEY = 'library.v1.index';
const SONG_KEY = (id: string) => `library.v1.song.${id}`;

/** A store on the platform key-value storage (or any `KeyValue`), for when IndexedDB is not there. */
export function keyValueStore(kv: KeyValue = PLATFORM_KV, limitBytes = FALLBACK_LIBRARY_BYTES): SongStore {
  const durable = kv.persistent();
  const readIndex = (): SongListing[] => {
    const raw = kv.read(INDEX_KEY);
    if (!raw) return [];
    try {
      const data = JSON.parse(raw) as unknown;
      return Array.isArray(data) ? (data.filter((e) => e && typeof e === 'object' && typeof (e as SongListing).id === 'string') as SongListing[]) : [];
    } catch {
      return [];
    }
  };
  const writeIndex = (list: SongListing[]) => {
    if (!kv.write(INDEX_KEY, JSON.stringify(list)) && durable) throw new LibraryError('full', FULL_MESSAGE);
  };
  return {
    backend: durable ? 'storage' : 'memory',
    limitBytes,
    persistent: () => durable,
    entries: async () => readIndex(),
    song: async (id) => kv.read(SONG_KEY(id)),
    put: async (listing, json) => {
      const before = json !== undefined ? kv.read(SONG_KEY(listing.id)) : null;
      if (json !== undefined && !kv.write(SONG_KEY(listing.id), json) && durable) {
        if (before !== null) kv.write(SONG_KEY(listing.id), before);
        else kv.remove(SONG_KEY(listing.id));
        throw new LibraryError('full', FULL_MESSAGE);
      }
      const list = readIndex().filter((e) => e.id !== listing.id);
      list.push(listing);
      try {
        writeIndex(list);
      } catch (e) {
        if (json !== undefined) {
          if (before !== null) kv.write(SONG_KEY(listing.id), before);
          else kv.remove(SONG_KEY(listing.id));
        }
        throw e;
      }
    },
    remove: async (id) => {
      kv.remove(SONG_KEY(id));
      writeIndex(readIndex().filter((e) => e.id !== id));
    },
  };
}

// ---------------------------------------------------------------------------------------------
// IndexedDB
// ---------------------------------------------------------------------------------------------

const DB_NAME = 'ssa-library';
const DB_VERSION = 1;

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

function storageError(e: unknown): LibraryError {
  const name = (e as { name?: string } | null)?.name;
  if (name === 'QuotaExceededError') return new LibraryError('full', FULL_MESSAGE, String(e));
  return new LibraryError('storage', 'Your songs could not be saved on this device. Try again; if it keeps failing, check that this site may store data.', String(e));
}

/** Open the library database, or reject (missing, refused, or no answer within `timeoutMs`). */
export function openLibraryDb(factory: IDBFactory | undefined = typeof indexedDB === 'undefined' ? undefined : indexedDB, timeoutMs = 4000): Promise<IDBDatabase> {
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
      const db = req.result;
      if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('songs')) db.createObjectStore('songs', { keyPath: 'id' });
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
    req.onblocked = () => {
      // Another tab holds an older version open; the timeout decides.
    };
  });
}

/** A store on an open IndexedDB database. */
export function indexedDbStore(db: IDBDatabase, limitBytes = MAX_LIBRARY_BYTES): SongStore {
  db.onversionchange = () => db.close();
  return {
    backend: 'indexeddb',
    limitBytes,
    persistent: () => true,
    entries: async () => {
      try {
        const tx = db.transaction('entries', 'readonly');
        return (await request(tx.objectStore('entries').getAll())) as SongListing[];
      } catch (e) {
        throw storageError(e);
      }
    },
    song: async (id) => {
      try {
        const tx = db.transaction('songs', 'readonly');
        const row = (await request(tx.objectStore('songs').get(id))) as { id: string; json: string } | undefined;
        return row?.json ?? null;
      } catch (e) {
        throw storageError(e);
      }
    },
    put: async (listing, json) => {
      try {
        const tx = db.transaction(['entries', 'songs'], 'readwrite');
        tx.objectStore('entries').put(listing);
        if (json !== undefined) tx.objectStore('songs').put({ id: listing.id, json });
        await done(tx);
      } catch (e) {
        throw storageError(e);
      }
    },
    remove: async (id) => {
      try {
        const tx = db.transaction(['entries', 'songs'], 'readwrite');
        tx.objectStore('entries').delete(id);
        tx.objectStore('songs').delete(id);
        await done(tx);
      } catch (e) {
        throw storageError(e);
      }
    },
  };
}

/** The best store this browser offers: IndexedDB, else the key-value fallback. Never rejects. */
export async function createDefaultStore(): Promise<SongStore> {
  try {
    return indexedDbStore(await openLibraryDb());
  } catch {
    return keyValueStore();
  }
}
