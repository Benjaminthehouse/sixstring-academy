import { describe, expect, it } from 'vitest';
import { BlobStoreError, createBlobStore, isBlobStoreError, memoryBlobBackend, openBlobDatabase, openBlobStore, toBlobStoreError } from './blobs';

const text = (s: string, type = 'text/plain') => new Blob([s], { type });

describe('blob store logic (on the memory backend)', () => {
  it('keeps, returns, replaces and forgets blobs by key', async () => {
    let t = 1000;
    const store = createBlobStore('recorder', memoryBlobBackend(), { now: () => t++ });
    expect(await store.get('take/a')).toBeNull();
    await store.put('take/a', text('hello', 'audio/webm'));
    const got = await store.get('take/a');
    expect(got).not.toBeNull();
    expect(await got!.text()).toBe('hello');
    expect(got!.type).toBe('audio/webm');
    expect(await store.has('take/a')).toBe(true);
    expect(await store.has('take/')).toBe(false);
    await store.put('take/a', text('hi'));
    expect(await (await store.get('take/a'))!.text()).toBe('hi');
    await store.delete('take/a');
    expect(await store.get('take/a')).toBeNull();
    await store.delete('take/a'); // forgetting twice is fine
  });

  it('lists by prefix in key order with sizes, types and times, without loading the data', async () => {
    let t = 0;
    const store = createBlobStore('scanner', memoryBlobBackend(), { now: () => (t += 10) });
    await store.put('draft/pic/b', text('bb', 'image/png'));
    await store.put('draft/pic/a', text('a', 'image/jpeg'));
    await store.put('draft/state.json', text('{}', 'application/json'));
    await store.put('other', text('xyz'));
    const pics = await store.list('draft/pic/');
    expect(pics.map((e) => e.key)).toEqual(['draft/pic/a', 'draft/pic/b']);
    expect(pics.map((e) => e.size)).toEqual([1, 2]);
    expect(pics.map((e) => e.type)).toEqual(['image/jpeg', 'image/png']);
    expect(pics[0].at).toBe(20);
    expect((await store.list()).length).toBe(4);
    expect(await store.totalSize()).toBe(1 + 2 + 2 + 3);
    expect(await store.totalSize('draft/')).toBe(5);
  });

  it('keeps namespaces apart: one store never sees or deletes the keys of another', async () => {
    const backend = memoryBlobBackend();
    const a = createBlobStore('recorder', backend);
    const b = createBlobStore('recorder-2', backend);
    await a.put('take/1', text('a'));
    await b.put('take/1', text('bbb'));
    expect(await (await a.get('take/1'))!.text()).toBe('a');
    expect((await a.list()).map((e) => e.key)).toEqual(['take/1']);
    expect(await a.totalSize()).toBe(1);
    expect(await a.deletePrefix('')).toBe(1);
    expect(await (await b.get('take/1'))!.text()).toBe('bbb');
  });

  it('deletes everything under a prefix and says how many', async () => {
    const store = createBlobStore('scanner', memoryBlobBackend());
    for (const k of ['draft/pic/1', 'draft/pic/2', 'draft/state.json', 'drafty']) await store.put(k, text(k));
    expect(await store.deletePrefix('draft/')).toBe(3);
    expect((await store.list()).map((e) => e.key)).toEqual(['drafty']);
    expect(await store.deletePrefix('draft/')).toBe(0);
  });

  it('keeps small JSON values beside the blobs and falls back on a missing or broken one', async () => {
    const store = createBlobStore('scanner', memoryBlobBackend());
    await store.putJSON('draft/state.json', { pages: 2, title: 'Ode' });
    expect(await store.getJSON('draft/state.json', null)).toEqual({ pages: 2, title: 'Ode' });
    await store.put('broken.json', text('{nope'));
    expect(await store.getJSON('broken.json', { ok: false })).toEqual({ ok: false });
    expect(await store.getJSON('missing.json', 7)).toBe(7);
  });

  it('turns a full disk into a clear "full" error and keeps what was there', async () => {
    const store = createBlobStore('recorder', memoryBlobBackend({ quota: 10 }));
    await store.put('take/1', text('12345678'));
    const err = await store.put('take/2', text('12345')).then(() => null, (e: unknown) => e);
    expect(isBlobStoreError(err)).toBe(true);
    expect((err as BlobStoreError).reason).toBe('full');
    expect((err as BlobStoreError).message).toMatch(/no room left/);
    expect(await store.get('take/2')).toBeNull();
    expect(await (await store.get('take/1'))!.text()).toBe('12345678');
    // Replacing an entry counts only the difference.
    await store.put('take/1', text('1234567890'));
  });

  it('stores bytes when the browser cannot store a Blob as it is (older Safari), and reads them back as a Blob', async () => {
    const backend = memoryBlobBackend({ refuseBlobs: true });
    const store = createBlobStore('recorder', backend);
    await store.put('take/1', text('wave', 'audio/wav'));
    const got = await store.get('take/1');
    expect(got).toBeInstanceOf(Blob);
    expect(got!.type).toBe('audio/wav');
    expect(await got!.text()).toBe('wave');
    expect((await store.list())[0]).toMatchObject({ key: 'take/1', size: 4, type: 'audio/wav' });
  });

  it('refuses bad keys, bad names and things that are not blobs with a sentence', async () => {
    expect(() => createBlobStore('Bad Name', memoryBlobBackend())).toThrow(/slugs/);
    const store = createBlobStore('recorder', memoryBlobBackend());
    await expect(store.put('', text('x'))).rejects.toMatchObject({ name: 'BlobStoreError', reason: 'failed' });
    await expect(store.put('k', 'text' as unknown as Blob)).rejects.toMatchObject({ reason: 'failed' });
  });

  it('a memory store says it does not survive the page and why', () => {
    const store = createBlobStore('recorder', memoryBlobBackend(), { notice: 'Private window.' });
    expect(store.persistent).toBe(false);
    expect(store.notice).toBe('Private window.');
  });
});

describe('browser refusals become clear errors', () => {
  it('maps what browsers throw to a reason', () => {
    expect(toBlobStoreError(new DOMException('x', 'QuotaExceededError')).reason).toBe('full');
    expect(toBlobStoreError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' }).reason).toBe('full');
    expect(toBlobStoreError(new DOMException('The operation is insecure.', 'SecurityError')).reason).toBe('unavailable');
    expect(toBlobStoreError(new DOMException('A mutation operation was attempted on a database that did not allow mutations.', 'InvalidStateError')).reason).toBe('unavailable');
    expect(toBlobStoreError(new Error('disk on fire')).reason).toBe('failed');
    const kept = new BlobStoreError('full');
    expect(toBlobStoreError(kept)).toBe(kept);
  });

  /** A stand-in IDBFactory whose open() behaves the way a refusing browser does. */
  function factory(how: 'throws' | 'silent' | 'error' | 'quota'): IDBFactory {
    return {
      open() {
        if (how === 'throws') throw new DOMException('The operation is insecure.', 'SecurityError');
        const req: Record<string, unknown> = {};
        if (how === 'error' || how === 'quota') {
          setTimeout(() => {
            req.error = how === 'quota' ? new DOMException('full', 'QuotaExceededError') : new DOMException('A mutation operation was attempted', 'InvalidStateError');
            (req.onerror as () => void)?.();
          }, 0);
        }
        return req as unknown as IDBOpenDBRequest;
      },
    } as unknown as IDBFactory;
  }

  it('no IndexedDB at all', async () => {
    await expect(openBlobDatabase(undefined)).rejects.toMatchObject({ reason: 'unavailable' });
  });
  it('open() throws (private window)', async () => {
    await expect(openBlobDatabase(factory('throws'))).rejects.toMatchObject({ reason: 'unavailable', message: expect.stringMatching(/not letting the app keep files/) });
  });
  it('open() fails', async () => {
    await expect(openBlobDatabase(factory('error'))).rejects.toMatchObject({ reason: 'unavailable' });
  });
  it('open() says the disk is full', async () => {
    await expect(openBlobDatabase(factory('quota'))).rejects.toMatchObject({ reason: 'full' });
  });
  it('open() never answers', async () => {
    await expect(openBlobDatabase(factory('silent'), 20)).rejects.toMatchObject({ reason: 'unavailable' });
  });

  it('openBlobStore rejects in Node (no IndexedDB), or hands back a memory store when asked', async () => {
    await expect(openBlobStore('recorder')).rejects.toMatchObject({ name: 'BlobStoreError', reason: 'unavailable' });
    const store = await openBlobStore('recorder', { memoryFallback: true });
    expect(store.persistent).toBe(false);
    expect(store.notice).toMatch(/until you close the page/);
    await store.put('take/1', new Blob(['x']));
    expect(await store.totalSize()).toBe(1);
  });
});
