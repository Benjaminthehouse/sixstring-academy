/**
 * The take store this browser gets: on IndexedDB when it answers, else in memory (takes then last
 * until the page is closed, and the screen says so). One store per page, opened on first use.
 */
import { createTakeStore, indexedDbBackend, memoryBackend, openRecorderDb, type TakeStore } from './store';

let shared: Promise<TakeStore> | null = null;

/** The shared take store. Never rejects. */
export function openTakeStore(): Promise<TakeStore> {
  shared ??= openRecorderDb()
    .then((db) => createTakeStore(indexedDbBackend(db)))
    .catch(() => createTakeStore(memoryBackend()));
  return shared;
}
