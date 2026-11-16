/**
 * The take store this browser gets: the platform blob store (`recorder`), which falls back to
 * memory when the browser refuses storage (takes then last until the page is closed, and the
 * screen says so). Takes recorded before the blob store existed are moved over from the old
 * database (`legacy.ts`) the first time, then that database is deleted. One store per page,
 * opened on first use.
 */
import { openBlobStore } from '@/core/platform/blobs';
import { deleteLegacyDb, legacyBackend, openLegacyDb } from './legacy';
import { createTakeStore, memoryBackend, migrateTakes, platformBackend, type TakeStore } from './store';

let shared: Promise<TakeStore> | null = null;

/** Move the old database's takes into `store`; the old database goes only when all of them moved. */
async function moveLegacyTakes(store: TakeStore): Promise<void> {
  const db = await openLegacyDb();
  if (!db) return;
  try {
    await migrateTakes(createTakeStore(legacyBackend(db)), store);
  } catch {
    // Not now (a full disk): the old takes stay where they are and move next time.
    db.close();
    return;
  }
  await deleteLegacyDb(db);
}

/** The shared take store. Never rejects. */
export function openTakeStore(): Promise<TakeStore> {
  shared ??= (async () => {
    const blobs = await openBlobStore('recorder', { memoryFallback: true });
    const store = createTakeStore(platformBackend(blobs));
    if (blobs.persistent) await moveLegacyTakes(store).catch(() => undefined);
    return store;
  })().catch(() => createTakeStore(memoryBackend()));
  return shared;
}
