import { describe, expect, it, vi } from 'vitest';
import { createDecodeCache } from './player';

const blob = (text: string) => new Blob([text]);

describe('decoded take cache', () => {
  it('keeps nothing while no screen holds it (a take saved after leaving is not left in memory)', async () => {
    const decode = vi.fn(async (b: Blob) => b.text());
    const cache = createDecodeCache(decode);
    expect(await cache.decode('a', blob('one'))).toBe('one');
    expect(cache.size()).toBe(0);
    await cache.decode('a', blob('one'));
    expect(decode).toHaveBeenCalledTimes(2);
  });

  it('decodes each take once while held, keeps the last three, and drops them all on release', async () => {
    const decode = vi.fn(async (b: Blob) => b.text());
    const cache = createDecodeCache(decode);
    const release = cache.hold();
    await cache.decode('a', blob('A'));
    await cache.decode('a', blob('A'));
    expect(decode).toHaveBeenCalledTimes(1);
    await cache.decode('b', blob('B'));
    await cache.decode('c', blob('C'));
    await cache.decode('a', blob('A'));
    await cache.decode('d', blob('D'));
    expect(cache.size()).toBe(3);
    // `b` was the least recently used: decoding it again is new work.
    await cache.decode('b', blob('B'));
    expect(decode).toHaveBeenCalledTimes(5);
    release();
    expect(cache.size()).toBe(0);
    release();
    expect(cache.size()).toBe(0);
  });

  it('lets go only when the last holder does (StrictMode mounts twice)', async () => {
    const cache = createDecodeCache(async (b: Blob) => b.text());
    const first = cache.hold();
    const second = cache.hold();
    await cache.decode('a', blob('A'));
    first();
    expect(cache.size()).toBe(1);
    second();
    expect(cache.size()).toBe(0);
  });

  it('does not keep a failed decode, so a later try can work', async () => {
    let fail = true;
    const cache = createDecodeCache(async (b: Blob) => {
      if (fail) throw new Error('cannot decode');
      return b.text();
    });
    cache.hold();
    expect(await cache.decode('a', blob('A'))).toBeNull();
    expect(cache.size()).toBe(0);
    fail = false;
    expect(await cache.decode('a', blob('A'))).toBe('A');
    cache.forget('a');
    expect(cache.size()).toBe(0);
  });
});
