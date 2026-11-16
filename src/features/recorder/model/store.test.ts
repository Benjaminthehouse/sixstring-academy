import { describe, expect, it } from 'vitest';
import { createBlobStore, memoryBlobBackend, type MemoryBackendOptions } from '@/core/platform/blobs';
import { TakeStoreError, createTakeStore, memoryBackend, migrateTakes, platformBackend, type BlobBackend } from './store';
import type { Take } from './takes';

const NOW = Date.UTC(2026, 10, 16, 12);

function take(id: string, patch: Partial<Take> = {}): Take {
  return { id, name: id, label: null, createdAt: NOW, durationMs: 1000, mimeType: 'audio/webm', bytes: 3, peaks: [0.5], bpm: null, ...patch };
}
const audio = (text: string) => new Blob([text], { type: 'audio/webm' });

/** A backend that can be told to fail, and records what it was asked. */
function flakyBackend() {
  const inner = memoryBackend();
  const calls: string[] = [];
  let failPut: ((key: string) => boolean) | null = null;
  const backend: BlobBackend = {
    kind: 'indexeddb',
    get: (key) => inner.get(key),
    put: async (key, blob) => {
      calls.push(`put ${key}`);
      if (failPut?.(key)) throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
      return inner.put(key, blob);
    },
    delete: async (key) => {
      calls.push(`delete ${key}`);
      return inner.delete(key);
    },
  };
  return { backend, calls, inner, failOn: (fn: ((key: string) => boolean) | null) => (failPut = fn) };
}

describe('take store', () => {
  it('keeps takes with their audio, newest first', async () => {
    const store = createTakeStore(memoryBackend());
    expect(await store.list()).toEqual([]);
    await store.put(take('old', { createdAt: NOW - 1000 }), audio('one'));
    const list = await store.put(take('new'), audio('two'));
    expect(list.map((t) => t.id)).toEqual(['new', 'old']);
    expect((await store.list()).map((t) => t.id)).toEqual(['new', 'old']);
    expect(await (await store.audio('old'))?.text()).toBe('one');
    expect(store.persistent()).toBe(false);
  });

  it('renames without touching the audio', async () => {
    const store = createTakeStore(memoryBackend());
    await store.put(take('a'), audio('sound'));
    const list = await store.put(take('a', { name: 'My best' }));
    expect(list[0].name).toBe('My best');
    expect(await (await store.audio('a'))?.text()).toBe('sound');
  });

  it('refuses to rename a take that is gone', async () => {
    const store = createTakeStore(memoryBackend());
    await expect(store.put(take('ghost'))).rejects.toMatchObject({ reason: 'missing' });
  });

  it('removes a take and its audio, and can put it back (undo)', async () => {
    const store = createTakeStore(memoryBackend());
    const a = take('a');
    await store.put(a, audio('keep me'));
    const blob = await store.audio('a');
    expect(await store.remove('a')).toEqual([]);
    expect(await store.audio('a')).toBeNull();
    await store.put(a, blob!);
    expect((await store.list()).map((t) => t.id)).toEqual(['a']);
    expect(await (await store.audio('a'))?.text()).toBe('keep me');
  });

  it('writes the audio before the list and removes it after, so the list never names missing audio', async () => {
    const { backend, calls } = flakyBackend();
    const store = createTakeStore(backend);
    await store.put(take('a'), audio('x'));
    await store.remove('a');
    expect(calls).toEqual(['put take/a', 'put takes.json', 'put takes.json', 'delete take/a']);
  });

  it('says the device is full in words, and leaves no orphaned audio behind', async () => {
    const f = flakyBackend();
    const store = createTakeStore(f.backend);
    await store.put(take('a'), audio('x'));
    f.failOn((key) => key === 'takes.json');
    const err = await store.put(take('b'), audio('y')).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TakeStoreError);
    expect(err).toMatchObject({ reason: 'full' });
    expect((err as Error).message).toMatch(/no room/);
    expect(await f.inner.get('take/b')).toBeNull();
    f.failOn(null);
    expect((await store.list()).map((t) => t.id)).toEqual(['a']);
  });

  it('runs changes one at a time, so two quick saves both land', async () => {
    const store = createTakeStore(memoryBackend());
    await Promise.all([store.put(take('a'), audio('1')), store.put(take('b', { createdAt: NOW + 1 }), audio('2')), store.put(take('c', { createdAt: NOW + 2 }), audio('3'))]);
    expect((await store.list()).map((t) => t.id)).toEqual(['c', 'b', 'a']);
  });

  it('reads a damaged list as empty instead of failing', async () => {
    const backend = memoryBackend();
    await backend.put('takes.json', new Blob(['{not json']));
    expect(await createTakeStore(backend).list()).toEqual([]);
    await backend.put('takes.json', new Blob([JSON.stringify([take('ok'), { id: 'BAD' }])]));
    expect((await createTakeStore(backend).list()).map((t) => t.id)).toEqual(['ok']);
  });
});

/** The platform blob store `recorder` on its in-memory backend, posing as IndexedDB (persistent). */
function platformStore(opts: MemoryBackendOptions = {}) {
  const raw = memoryBlobBackend(opts);
  const blobs = createBlobStore('recorder', { kind: 'indexeddb', read: raw.read, write: raw.write, metas: raw.metas, remove: raw.remove });
  return { blobs, store: createTakeStore(platformBackend(blobs)) };
}

describe('take store on the platform blob store', () => {
  it('keeps takes under the documented keys of the `recorder` store', async () => {
    const { blobs, store } = platformStore();
    expect(store.backend).toBe('platform');
    expect(store.persistent()).toBe(true);
    await store.put(take('a'), audio('sound'));
    expect((await blobs.list()).map((e) => e.key)).toEqual(['take/a', 'takes.json']);
    expect(await blobs.totalSize('take/')).toBe(5);
    expect(await (await store.audio('a'))?.text()).toBe('sound');
    await store.remove('a');
    expect((await blobs.list()).map((e) => e.key)).toEqual(['takes.json']);
  });

  it('counts the memory stand-in as memory (the screen then warns that takes will not last)', () => {
    const store = createTakeStore(platformBackend(createBlobStore('recorder', memoryBlobBackend())));
    expect(store.backend).toBe('memory');
    expect(store.persistent()).toBe(false);
  });

  it('says the device is full in words when the blob store runs out of room', async () => {
    const { store } = platformStore({ quota: 40 });
    const err = await store.put(take('big'), audio('x'.repeat(100))).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TakeStoreError);
    expect(err).toMatchObject({ reason: 'full' });
    expect((err as Error).message).toMatch(/no room/);
  });
});

describe('moving takes from the old database', () => {
  it('moves every take with its audio, keeps what is already there, and can run twice', async () => {
    const old = createTakeStore(memoryBackend());
    await old.put(take('one', { createdAt: NOW - 2000 }), audio('first'));
    await old.put(take('two', { createdAt: NOW - 1000, name: 'Week 1' }), audio('second'));
    const { store } = platformStore();
    await store.put(take('new'), audio('recorded today'));
    expect(await migrateTakes(old, store)).toBe(2);
    expect((await store.list()).map((t) => t.id)).toEqual(['new', 'two', 'one']);
    expect((await store.list())[1].name).toBe('Week 1');
    expect(await (await store.audio('one'))?.text()).toBe('first');
    expect(await migrateTakes(old, store)).toBe(0);
    expect((await store.list()).length).toBe(3);
  });

  it('leaves behind a take whose audio is missing', async () => {
    const backend = memoryBackend();
    const old = createTakeStore(backend);
    await old.put(take('ok'), audio('a'));
    await old.put(take('gone', { createdAt: NOW - 1 }), audio('b'));
    await backend.delete('take/gone');
    const { store } = platformStore();
    expect(await migrateTakes(old, store)).toBe(1);
    expect((await store.list()).map((t) => t.id)).toEqual(['ok']);
  });

  it('rejects when the new store is full, and the old takes stay where they were', async () => {
    const old = createTakeStore(memoryBackend());
    await old.put(take('big'), audio('x'.repeat(100)));
    const { store } = platformStore({ quota: 40 });
    await expect(migrateTakes(old, store)).rejects.toMatchObject({ reason: 'full' });
    expect((await old.list()).map((t) => t.id)).toEqual(['big']);
    expect(await (await old.audio('big'))?.text()).toBe('x'.repeat(100));
  });
});
