import { describe, expect, it, vi } from 'vitest';
import { createWakeLock } from './wake-lock';

interface FakeSentinel {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: 'release', listener: () => void) => void;
  /** What the system does when the tab is hidden or the battery runs low. */
  systemRelease: () => void;
}

function fakeEnvironment(options: { supported?: boolean; refuse?: boolean } = {}) {
  const sentinels: FakeSentinel[] = [];
  let refuse = options.refuse === true;
  const request = vi.fn(async () => {
    if (refuse) throw new DOMException('not allowed', 'NotAllowedError');
    const listeners: Array<() => void> = [];
    const sentinel: FakeSentinel = {
      released: false,
      release: async () => {
        sentinel.systemRelease();
      },
      addEventListener: (_type, listener) => listeners.push(listener),
      systemRelease: () => {
        if (sentinel.released) return;
        sentinel.released = true;
        for (const listener of listeners) listener();
      },
    };
    sentinels.push(sentinel);
    return sentinel;
  });
  const visibilityListeners = new Set<() => void>();
  const doc = {
    visibilityState: 'visible',
    addEventListener: (_type: 'visibilitychange', listener: () => void) => visibilityListeners.add(listener),
    removeEventListener: (_type: 'visibilitychange', listener: () => void) => visibilityListeners.delete(listener),
  };
  const setVisible = (visible: boolean): void => {
    doc.visibilityState = visible ? 'visible' : 'hidden';
    for (const listener of [...visibilityListeners]) listener();
  };
  const lock = createWakeLock({ api: () => (options.supported === false ? null : { request }), doc: () => doc });
  return { lock, request, sentinels, setVisible, visibilityListeners, setRefuse: (value: boolean) => (refuse = value) };
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('wake lock', () => {
  it('takes the lock on request and gives it back on release', async () => {
    const env = fakeEnvironment();
    expect(env.lock.state()).toEqual({ supported: true, wanted: false, active: false });
    expect(await env.lock.request()).toBe(true);
    expect(env.lock.state()).toEqual({ supported: true, wanted: true, active: true });
    env.lock.release();
    expect(env.sentinels[0].released).toBe(true);
    expect(env.lock.state()).toEqual({ supported: true, wanted: false, active: false });
    expect(env.visibilityListeners.size).toBe(0); // nothing left listening
  });

  it('counts holders: the screen stays on until the last one lets go', async () => {
    const env = fakeEnvironment();
    const releaseTuner = env.lock.keepAwake();
    const releasePlayer = env.lock.keepAwake();
    await flush();
    expect(env.request).toHaveBeenCalledTimes(1); // one lock for everybody
    releaseTuner();
    releaseTuner(); // a second call of the same release does nothing
    expect(env.sentinels[0].released).toBe(false);
    expect(env.lock.state().active).toBe(true);
    releasePlayer();
    expect(env.sentinels[0].released).toBe(true);
    expect(env.lock.state().wanted).toBe(false);
  });

  it('takes the lock again when the tab comes back', async () => {
    const env = fakeEnvironment();
    await env.lock.request();
    env.setVisible(false);
    env.sentinels[0].systemRelease(); // browsers drop the lock when the page is hidden
    expect(env.lock.state()).toMatchObject({ wanted: true, active: false });
    env.setVisible(true);
    await flush();
    expect(env.request).toHaveBeenCalledTimes(2);
    expect(env.lock.state().active).toBe(true);
  });

  it('does not ask while hidden, and not after everyone has let go', async () => {
    const env = fakeEnvironment();
    env.setVisible(false);
    expect(await env.lock.request()).toBe(false);
    expect(env.request).not.toHaveBeenCalled();
    env.lock.release();
    env.setVisible(true);
    await flush();
    expect(env.request).not.toHaveBeenCalled();
  });

  it('tolerates a refusal and tries again at the next chance', async () => {
    const env = fakeEnvironment({ refuse: true });
    expect(await env.lock.request()).toBe(false);
    expect(env.lock.state()).toEqual({ supported: true, wanted: true, active: false });
    env.setRefuse(false);
    env.setVisible(false);
    env.setVisible(true);
    await flush();
    expect(env.lock.state().active).toBe(true);
  });

  it('lets go of a lock that arrives after everyone has left', async () => {
    const env = fakeEnvironment();
    const pending = env.lock.request();
    env.lock.release();
    expect(await pending).toBe(false);
    expect(env.sentinels[0].released).toBe(true);
    expect(env.lock.state().active).toBe(false);
  });

  it('does nothing, quietly, where the API does not exist', async () => {
    const env = fakeEnvironment({ supported: false });
    expect(await env.lock.request()).toBe(false);
    expect(env.lock.state()).toEqual({ supported: false, wanted: true, active: false });
    env.lock.release();
    env.lock.release(); // more releases than requests are harmless
    expect(env.lock.state().wanted).toBe(false);
  });

  it('tells subscribers when the snapshot changes, and only then', async () => {
    const env = fakeEnvironment();
    const seen: boolean[] = [];
    const stop = env.lock.subscribe(() => seen.push(env.lock.state().active));
    const first = env.lock.state();
    expect(env.lock.state()).toBe(first); // stable between changes
    await env.lock.request();
    await env.lock.request();
    expect(seen).toEqual([false, true]); // wanted, then active; the second request changed nothing
    stop();
    env.lock.release();
    env.lock.release();
    expect(seen).toHaveLength(2);
  });
});
