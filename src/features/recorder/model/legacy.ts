/**
 * The recorder's first database (`ssa-recorder`, one object store `blobs` keyed like the take
 * store: `takes.json`, `take/<id>`), used before the platform blob store existed. It is only read,
 * to move its takes into the blob store (`backend.ts`), and then deleted. Opening it never creates
 * it: on a device that never had it, the open is aborted in its upgrade step and nothing is left.
 * Checked in the browser by `e2e/recorder.cjs` (a take put in the old database shows up and plays).
 */
import type { BlobBackend } from './store';

/** Name of the old database. */
export const LEGACY_DB_NAME = 'ssa-recorder';
const STORE = 'blobs';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function factoryOrNull(): IDBFactory | null {
  try {
    // Reading `indexedDB` throws in a sandboxed frame without its own origin.
    return typeof indexedDB === 'undefined' ? null : indexedDB;
  } catch {
    return null;
  }
}

/**
 * The old database, read-only, or null when this device never had it (or IndexedDB is refused, or
 * it does not answer within `timeoutMs`).
 */
export function openLegacyDb(factory: IDBFactory | null = factoryOrNull(), timeoutMs = 4000): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (!factory) return resolve(null);
    let settled = false;
    const finish = (db: IDBDatabase | null) => {
      if (settled) {
        db?.close();
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(db);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    let req: IDBOpenDBRequest;
    try {
      // No version: an existing database opens as it is; a missing one asks for an upgrade from 0.
      req = factory.open(LEGACY_DB_NAME);
    } catch {
      return finish(null);
    }
    req.onupgradeneeded = (event) => {
      // It did not exist: abort, so the open does not create an empty database.
      if (event.oldVersion === 0) req.transaction?.abort();
    };
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.close();
        return finish(null);
      }
      db.onversionchange = () => db.close();
      finish(db);
    };
    req.onerror = (event) => {
      // The abort above (or a refusal) is expected; do not let it surface as an error.
      event.preventDefault();
      finish(null);
    };
    req.onblocked = () => finish(null);
  });
}

/** A read-only backend on the old database (writes are refused: nothing new goes there). */
export function legacyBackend(db: IDBDatabase): BlobBackend {
  return {
    kind: 'indexeddb',
    get: async (key) => {
      const value = (await request(db.transaction(STORE, 'readonly').objectStore(STORE).get(key))) as unknown;
      return value instanceof Blob ? value : null;
    },
    put: () => Promise.reject(new Error('the old recorder database is read-only')),
    delete: () => Promise.reject(new Error('the old recorder database is read-only')),
  };
}

/** Close and delete the old database once its takes have moved. Never rejects. */
export function deleteLegacyDb(db: IDBDatabase, factory: IDBFactory | null = factoryOrNull()): Promise<void> {
  db.close();
  return new Promise((resolve) => {
    if (!factory) return resolve();
    try {
      const req = factory.deleteDatabase(LEGACY_DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      // Another tab still has it open: it closes on `versionchange` and the delete then completes.
      req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}
