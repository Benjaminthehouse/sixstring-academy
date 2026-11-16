/**
 * The blob store: binary things the app makes and keeps on this device only (a recorder take, an
 * unsaved scan with its photos), by string key, in IndexedDB.
 *
 *   const store = await openBlobStore('recorder');           // rejects with BlobStoreError when refused
 *   await store.put('take/abc', audioBlob);
 *   const blob = await store.get('take/abc');                // null when it is not there
 *   const takes = await store.list('take/');                 // [{ key, size, type, at }] without loading the data
 *   const bytes = await store.totalSize();                   // what this store holds, in bytes
 *   await store.deletePrefix('draft/');                      // everything under a prefix
 *
 * Why not key-value storage: localStorage holds a few megabytes of text in all, and these are
 * megabytes each. Blobs never travel in backups or cloud sync (see `storage-scope.ts`).
 *
 * One database (`ssa-blobs`) holds every store; a store is a namespace inside it, so the keys of
 * the recorder and the scanner never meet. Each entry is two records written in one transaction:
 * the data, and a small description (size, type, when) that `list` and `totalSize` read without
 * loading any data.
 *
 * Browsers refuse storage in several ways (no IndexedDB at all, a private window that throws on
 * open, site data blocked, a database that never answers, a full disk). Every refusal becomes a
 * {@link BlobStoreError} with a `reason` and a sentence for the learner. `openBlobStore(name,
 * { memoryFallback: true })` instead hands back a store in memory (`persistent: false`, with the
 * sentence in `notice`), so a screen keeps working until the page is closed.
 *
 * The logic is written against a small {@link BlobBackend} so it is tested in Node on a fake; the
 * IndexedDB backend itself is checked in the browser (`e2e/scan-blobs.cjs`).
 */

/** Why a blob could not be kept. */
export type BlobStoreErrorReason = 'unavailable' | 'full' | 'failed';

const MESSAGES: Record<BlobStoreErrorReason, string> = {
  unavailable: 'This browser is not letting the app keep files on this device (a private window, or site data is blocked). What you make here lasts until you close the page; save it as a file to keep it.',
  full: 'There is no room left on this device. Delete things you no longer need, then try again.',
  failed: 'This device could not keep it. Try again; if it keeps failing, check that this site may store data.',
};

/** A refusal or failure of the blob store, with a sentence to show (`message`). */
export class BlobStoreError extends Error {
  /** What the browser said, for logs. */
  readonly detail?: string;
  constructor(
    readonly reason: BlobStoreErrorReason,
    detail?: unknown,
    message: string = MESSAGES[reason],
  ) {
    super(message);
    this.name = 'BlobStoreError';
    if (detail !== undefined) this.detail = detail instanceof Error ? `${detail.name}: ${detail.message}` : String(detail);
  }
}

/** True for a {@link BlobStoreError}. */
export function isBlobStoreError(e: unknown): e is BlobStoreError {
  return e instanceof BlobStoreError || (!!e && typeof e === 'object' && (e as { name?: unknown }).name === 'BlobStoreError');
}

/** Turn whatever a browser threw into a {@link BlobStoreError}. */
export function toBlobStoreError(e: unknown): BlobStoreError {
  if (isBlobStoreError(e)) return e as BlobStoreError;
  const name = (e as { name?: string } | null)?.name ?? '';
  const message = String((e as { message?: string } | null)?.message ?? e ?? '');
  // Chrome and Firefox say QuotaExceededError; old Firefox NS_ERROR_DOM_QUOTA_REACHED; Safari sometimes only says so in the message.
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || /quota|no space|disk is full/i.test(message)) return new BlobStoreError('full', e);
  // A private window, blocked site data, a database that was closed or deleted underneath us.
  if (name === 'SecurityError' || name === 'InvalidStateError' || name === 'NotAllowedError' || /indexeddb is not available|did not answer|blocked/i.test(message)) return new BlobStoreError('unavailable', e);
  return new BlobStoreError('failed', e);
}

/** What `list` says about one entry (no data loaded). */
export interface BlobEntry {
  key: string;
  /** Bytes. */
  size: number;
  /** MIME type of the blob ('' when it had none). */
  type: string;
  /** When it was written, ms since 1970. */
  at: number;
}

/** A namespace of blobs on this device (see the file comment). */
export interface BlobStore {
  /** The namespace ('recorder', 'scanner'). */
  readonly name: string;
  /** False for the memory stand-in: everything goes when the page is closed. */
  readonly persistent: boolean;
  /** Why the store is in memory (a sentence to show), or null. */
  readonly notice: string | null;
  /** Keep a blob under a key (replacing what was there). */
  put(key: string, blob: Blob): Promise<void>;
  /** The blob under a key, or null. */
  get(key: string): Promise<Blob | null>;
  /** True when something is kept under the key. */
  has(key: string): Promise<boolean>;
  /** Every entry whose key starts with `prefix` (all of them without one), in key order. */
  list(prefix?: string): Promise<BlobEntry[]>;
  /** Forget a key (nothing happens when it is not there). */
  delete(key: string): Promise<void>;
  /** Forget every key that starts with `prefix`; returns how many went. */
  deletePrefix(prefix: string): Promise<number>;
  /** Bytes kept under `prefix` (the whole store without one). */
  totalSize(prefix?: string): Promise<number>;
  /** Keep a value as JSON (a small description beside the blobs). */
  putJSON(key: string, value: unknown): Promise<void>;
  /** A value kept with `putJSON`, or `fallback` when missing or unreadable. */
  getJSON<T>(key: string, fallback: T): Promise<T>;
}

// ---------------------------------------------------------------------------------------------
// The backend: the few transactional calls the store needs
// ---------------------------------------------------------------------------------------------

/** The description record of an entry. */
export interface BlobMeta {
  size: number;
  type: string;
  at: number;
}

/**
 * What is stored as data: the Blob itself, or (for browsers that cannot store a Blob in IndexedDB,
 * such as older Safari) its bytes and type.
 */
export type StoredData = Blob | { bytes: ArrayBuffer; type: string };

/** Raw storage under full keys. Every call is atomic; a failure rejects with what the browser threw. */
export interface BlobBackend {
  /** 'indexeddb' survives a reload; 'memory' does not. */
  readonly kind: 'indexeddb' | 'memory';
  read(key: string): Promise<StoredData | undefined>;
  /** Data and description together, or neither. */
  write(key: string, data: StoredData, meta: BlobMeta): Promise<void>;
  /** Descriptions of the keys in [from, to), in key order. */
  metas(from: string, to: string): Promise<[string, BlobMeta][]>;
  /** Remove these keys (data and description), all or none. */
  remove(keys: string[]): Promise<void>;
}

/** The end of a key range that holds every key starting with `prefix`. */
function rangeEnd(prefix: string): string {
  return `${prefix}￿`;
}

function checkKey(key: unknown): string {
  if (typeof key !== 'string' || !key) throw new BlobStoreError('failed', `bad key ${String(key)}`, 'A blob needs a key.');
  return key;
}

function isCloneFailure(e: unknown): boolean {
  const name = (e as { name?: string } | null)?.name ?? '';
  const message = String((e as { message?: string } | null)?.message ?? '');
  return name === 'DataCloneError' || /preparing blob|blob\/file data|could not be cloned/i.test(message);
}

/** Options for {@link createBlobStore}. */
export interface CreateBlobStoreOptions {
  /** Shown when the store is not persistent. */
  notice?: string | null;
  /** The clock (tests). */
  now?: () => number;
}

/** A blob store on any backend (the logic of the module; tests run it on {@link memoryBlobBackend}). */
export function createBlobStore(name: string, backend: BlobBackend, opts: CreateBlobStoreOptions = {}): BlobStore {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error(`blob store names are slugs, not "${name}"`);
  const ns = `${name}/`;
  const now = opts.now ?? Date.now;
  const full = (key: string) => ns + checkKey(key);
  // Once a Blob could not be stored as it is, store bytes from then on (it will not start working).
  let bytesOnly = false;

  const wrap = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      throw toBlobStoreError(e);
    }
  };

  const store: BlobStore = {
    name,
    persistent: backend.kind !== 'memory',
    notice: backend.kind === 'memory' ? opts.notice ?? MESSAGES.unavailable : null,
    put: (key, blob) =>
      wrap(async () => {
        const k = full(key);
        if (!(blob instanceof Blob)) throw new BlobStoreError('failed', 'not a Blob', 'Only files and recordings can be kept here.');
        const meta: BlobMeta = { size: blob.size, type: blob.type, at: now() };
        if (!bytesOnly) {
          try {
            await backend.write(k, blob, meta);
            return;
          } catch (e) {
            if (!isCloneFailure(e)) throw e;
            bytesOnly = true;
          }
        }
        await backend.write(k, { bytes: await blob.arrayBuffer(), type: blob.type }, meta);
      }),
    get: (key) =>
      wrap(async () => {
        const v = await backend.read(full(key));
        if (v === undefined || v === null) return null;
        if (v instanceof Blob) return v;
        if (typeof v === 'object' && 'bytes' in v && v.bytes instanceof ArrayBuffer) return new Blob([v.bytes], { type: v.type ?? '' });
        return null;
      }),
    has: (key) =>
      wrap(async () => {
        const k = full(key);
        const found = await backend.metas(k, `${k}\u0000`);
        return found.some(([fk]) => fk === k);
      }),
    list: (prefix = '') =>
      wrap(async () => {
        const from = ns + prefix;
        const rows = await backend.metas(from, rangeEnd(from));
        return rows.map(([k, m]) => ({ key: k.slice(ns.length), size: m.size, type: m.type, at: m.at }));
      }),
    delete: (key) => wrap(() => backend.remove([full(key)])),
    deletePrefix: (prefix) =>
      wrap(async () => {
        const from = ns + prefix;
        const rows = await backend.metas(from, rangeEnd(from));
        if (rows.length) await backend.remove(rows.map(([k]) => k));
        return rows.length;
      }),
    totalSize: (prefix = '') =>
      wrap(async () => {
        const from = ns + prefix;
        const rows = await backend.metas(from, rangeEnd(from));
        return rows.reduce((s, [, m]) => s + (Number.isFinite(m.size) ? m.size : 0), 0);
      }),
    putJSON: (key, value) => store.put(key, new Blob([JSON.stringify(value)], { type: 'application/json' })),
    getJSON: async <T>(key: string, fallback: T): Promise<T> => {
      const blob = await store.get(key);
      if (!blob) return fallback;
      try {
        return JSON.parse(await blob.text()) as T;
      } catch {
        return fallback;
      }
    },
  };
  return store;
}

/** Options for {@link memoryBlobBackend} (tests make it fail the ways browsers do). */
export interface MemoryBackendOptions {
  /** Refuse to store more than this many bytes in all (a full disk): QuotaExceededError. */
  quota?: number;
  /** Refuse to store a Blob as it is (older Safari): DataCloneError; bytes are accepted. */
  refuseBlobs?: boolean;
}

/** A backend in memory: the stand-in when IndexedDB is refused, and the fake the tests use. */
export function memoryBlobBackend(opts: MemoryBackendOptions = {}): BlobBackend & { readonly bytes: number } {
  const data = new Map<string, StoredData>();
  const meta = new Map<string, BlobMeta>();
  const used = () => [...meta.values()].reduce((s, m) => s + m.size, 0);
  return {
    kind: 'memory',
    get bytes() {
      return used();
    },
    read: async (key) => data.get(key),
    write: async (key, value, m) => {
      if (opts.refuseBlobs && value instanceof Blob) throw new DOMException('Error preparing Blob/File data to be stored in object store', 'DataCloneError');
      if (opts.quota !== undefined && used() - (meta.get(key)?.size ?? 0) + m.size > opts.quota) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      data.set(key, value);
      meta.set(key, { ...m });
    },
    metas: async (from, to) =>
      [...meta.entries()]
        .filter(([k]) => k >= from && k < to)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, m]) => [k, { ...m }] as [string, BlobMeta]),
    remove: async (keys) => {
      for (const k of keys) {
        data.delete(k);
        meta.delete(k);
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------
// IndexedDB
// ---------------------------------------------------------------------------------------------

/** The database that holds every blob store. */
export const BLOB_DB_NAME = 'ssa-blobs';
const DB_VERSION = 1;
const DATA = 'data';
const META = 'meta';

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
    tx.onabort = () => reject(tx.error ?? new DOMException('The write was cancelled.', 'AbortError'));
  });
}

/**
 * Open the blob database, or reject with a {@link BlobStoreError} ('unavailable' when IndexedDB is
 * missing, refused, or does not answer within `timeoutMs`: some private windows never call back).
 */
export function openBlobDatabase(given?: IDBFactory | null, timeoutMs = 4000): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let factory: IDBFactory | null | undefined = given;
    if (given === undefined) {
      // Merely reading `indexedDB` throws SecurityError in a sandboxed frame without its own origin.
      try {
        factory = typeof indexedDB === 'undefined' ? undefined : indexedDB;
      } catch (e) {
        return reject(new BlobStoreError('unavailable', e));
      }
    }
    if (!factory) return reject(new BlobStoreError('unavailable', 'IndexedDB is not available'));
    let settled = false;
    const fail = (e: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const err = toBlobStoreError(e);
      // Opening is where a refusal shows; anything but a full disk means "not here".
      reject(err.reason === 'full' ? err : new BlobStoreError('unavailable', e));
    };
    const timer = setTimeout(() => fail(new Error('IndexedDB did not answer')), timeoutMs);
    let req: IDBOpenDBRequest;
    try {
      req = factory.open(BLOB_DB_NAME, DB_VERSION);
    } catch (e) {
      return fail(e);
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DATA)) db.createObjectStore(DATA);
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    };
    req.onsuccess = () => {
      const db = req.result;
      if (settled) {
        db.close();
        return;
      }
      settled = true;
      clearTimeout(timer);
      // Another tab upgrading the database: let it, and open again next time.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => fail(req.error);
    req.onblocked = () => fail(new Error('IndexedDB is blocked by another tab'));
  });
}

/** A backend on the open blob database. */
export function indexedDbBlobBackend(db: IDBDatabase): BlobBackend {
  return {
    kind: 'indexeddb',
    read: async (key) => {
      const tx = db.transaction(DATA, 'readonly');
      return (await request(tx.objectStore(DATA).get(key))) as StoredData | undefined;
    },
    write: async (key, value, meta) => {
      const tx = db.transaction([DATA, META], 'readwrite');
      // A DataCloneError is thrown synchronously by put(): abort so the meta is not written alone.
      try {
        tx.objectStore(DATA).put(value, key);
        tx.objectStore(META).put(meta, key);
      } catch (e) {
        try {
          tx.abort();
        } catch {
          /* already finished */
        }
        throw e;
      }
      await done(tx);
    },
    metas: async (from, to) => {
      const tx = db.transaction(META, 'readonly');
      const range = IDBKeyRange.bound(from, to, false, true);
      const store = tx.objectStore(META);
      const [keys, values] = await Promise.all([request(store.getAllKeys(range)), request(store.getAll(range))]);
      return keys.map((k, i) => [String(k), values[i] as BlobMeta] as [string, BlobMeta]);
    },
    remove: async (keys) => {
      if (!keys.length) return;
      const tx = db.transaction([DATA, META], 'readwrite');
      for (const k of keys) {
        tx.objectStore(DATA).delete(k);
        tx.objectStore(META).delete(k);
      }
      await done(tx);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Opening a store
// ---------------------------------------------------------------------------------------------

let shared: Promise<IDBDatabase> | null = null;

/** Options for {@link openBlobStore}. */
export interface OpenBlobStoreOptions {
  /** When the browser refuses storage, resolve with a store in memory instead of rejecting. */
  memoryFallback?: boolean;
}

/**
 * The blob store `name` on this device. One database connection is shared by every store of the
 * page. Rejects with a {@link BlobStoreError} when the browser refuses (unless `memoryFallback`).
 */
export async function openBlobStore(name: string, opts: OpenBlobStoreOptions = {}): Promise<BlobStore> {
  shared ??= openBlobDatabase();
  try {
    const db = await shared;
    return createBlobStore(name, indexedDbBlobBackend(db));
  } catch (e) {
    // The next call asks again (the learner may have changed a setting), at the cost of one more wait.
    shared = null;
    const err = toBlobStoreError(e);
    if (!opts.memoryFallback) throw err;
    return createBlobStore(name, memoryBlobBackend(), { notice: err.message });
  }
}

/**
 * How much this site may still store, from the browser's own estimate (`null` when it does not
 * say). Blobs count towards it together with everything else the site keeps.
 */
export async function blobStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const est = await (navigator as Navigator & { storage?: { estimate?: () => Promise<StorageEstimate> } }).storage?.estimate?.();
    if (!est || typeof est.quota !== 'number') return null;
    return { usage: est.usage ?? 0, quota: est.quota };
  } catch {
    return null;
  }
}
