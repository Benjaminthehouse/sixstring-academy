import { describe, expect, it } from 'vitest';
import { TakeStoreError, createTakeStore, memoryBackend, type BlobBackend } from './store';
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
