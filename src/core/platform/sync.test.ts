import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActions, createProgressStore, memoryStorage, type ProgressActions, type ProgressState, type ProgressStore } from '@/core/progress';
import { createLibrary, memoryStore, songSyncPort, type Library } from '@/core/library';
import { CAMPFIRE_GROOVE, ODE_TO_JOY, sixTab } from '@/core/song';
import { createLearnerData, memoryKv, type LearnerData } from './storage-scope';
import {
  SONG_SYNC_LIMITS,
  appDataPort,
  bodyKey,
  checksum,
  createCloudSync,
  isPristine,
  materialKey,
  progressStorePort,
  songCarry,
  splitBody,
  strongerStreak,
  type CloudSync,
  type SyncDeps,
  type SyncStatus,
} from './sync';

// ---------------------------------------------------------------------------------------------
// A fake of the artifact `db` capability: documents in memory, live listeners, scripted failures
// ---------------------------------------------------------------------------------------------

type Doc = Record<string, unknown>;
interface Snapshot {
  id: string;
  exists: boolean;
  data(): Doc | undefined;
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
}
type Op = 'get' | 'set' | 'delete';

class FakeDb {
  docs = new Map<string, Doc>();
  log: Array<{ op: Op; path: string }> = [];
  /** Network round trip of every call, in (fake) milliseconds. */
  latency = 20;
  /** When false, listeners hear nothing (offline, or a host that has not answered yet). */
  delivering = true;
  subscriptions = 0;
  unsubscribed = 0;
  private listeners = new Map<string, Set<{ next: (snap: Snapshot) => void; error?: (e: { code: string }) => void }>>();
  private failures: Array<{ op: Op; code: string; match?: RegExp }> = [];
  private active = 0;
  maxConcurrent = 0;

  /** The next matching call rejects with this code. */
  fail(op: Op, code: string, times = 1, match?: RegExp): void {
    for (let i = 0; i < times; i++) this.failures.push({ op, code, match });
  }

  writes(pattern?: RegExp): string[] {
    return this.log.filter((entry) => entry.op === 'set' && (!pattern || pattern.test(entry.path))).map((entry) => entry.path);
  }

  snapshot(path: string, fromCache = false): Snapshot {
    const stored = this.docs.get(path);
    const copy = stored ? (JSON.parse(JSON.stringify(stored)) as Doc) : undefined;
    return { id: path.split('/').pop() ?? '', exists: !!stored, data: () => copy, metadata: { fromCache, hasPendingWrites: false } };
  }

  /** Deliver the current state of a document to its listeners (as the server, or from a cache). */
  emit(path: string, fromCache = false): void {
    for (const listener of [...(this.listeners.get(path) ?? [])]) listener.next(this.snapshot(path, fromCache));
  }

  /** Deliver a made-up snapshot, e.g. what a stale local cache would claim. */
  emitRaw(path: string, exists: boolean, fromCache: boolean): void {
    const base = this.snapshot(path, fromCache);
    const snap: Snapshot = exists ? base : { ...base, exists: false, data: () => undefined };
    for (const listener of [...(this.listeners.get(path) ?? [])]) listener.next(snap);
  }

  clearFailures(): void {
    this.failures.length = 0;
  }

  /** Kill every listener on a document with a terminal error. */
  breakListeners(path: string, code: string): void {
    const all = [...(this.listeners.get(path) ?? [])];
    this.listeners.delete(path);
    for (const listener of all) listener.error?.({ code });
  }

  private async call(op: Op, path: string): Promise<void> {
    this.log.push({ op, path });
    this.active += 1;
    this.maxConcurrent = Math.max(this.maxConcurrent, this.active);
    try {
      await new Promise((resolve) => setTimeout(resolve, this.latency));
      const index = this.failures.findIndex((f) => f.op === op && (!f.match || f.match.test(path)));
      if (index >= 0) {
        const [failure] = this.failures.splice(index, 1);
        throw { code: failure.code, message: `scripted ${failure.code}` };
      }
    } finally {
      this.active -= 1;
    }
  }

  doc(path: string) {
    const segments = path.split('/');
    if (segments.length % 2 !== 0 || segments.some((s) => !/^[A-Za-z0-9_\-.~:@+]{1,200}$/.test(s) || s === '.' || s === '..')) {
      throw new TypeError(`bad document path: ${path}`);
    }
    return {
      id: segments[segments.length - 1],
      path,
      get: async (): Promise<Snapshot> => {
        await this.call('get', path);
        return this.snapshot(path);
      },
      set: async (data: Doc): Promise<void> => {
        await this.call('set', path);
        // The real store refuses documents over 256 KiB.
        if (new TextEncoder().encode(JSON.stringify(data)).length > 262144) throw { code: 'invalid_argument', message: 'document too large' };
        this.docs.set(path, JSON.parse(JSON.stringify(data)) as Doc);
        if (this.delivering) this.emit(path);
      },
      delete: async (): Promise<void> => {
        await this.call('delete', path);
        this.docs.delete(path);
        if (this.delivering) this.emit(path);
      },
      onSnapshot: (next: (snap: Snapshot) => void, error?: (e: { code: string }) => void): (() => void) => {
        this.subscriptions += 1;
        const entry = { next, error };
        if (!this.listeners.has(path)) this.listeners.set(path, new Set());
        this.listeners.get(path)?.add(entry);
        if (this.delivering) setTimeout(() => this.listeners.get(path)?.has(entry) && next(this.snapshot(path)), this.latency);
        return () => {
          if (this.listeners.get(path)?.delete(entry)) this.unsubscribed += 1;
        };
      },
    };
  }
}

// ---------------------------------------------------------------------------------------------
// Devices: a real progress store plus a sync service on the fake database
// ---------------------------------------------------------------------------------------------

const START = Date.parse('2026-03-02T09:00:00Z');
const DAY = 86_400_000;
const head = (uid = 'u_ana'): string => `data/users/${uid}/progress`;

interface Device {
  store: ProgressStore;
  actions: ProgressActions;
  sync: CloudSync;
  state(): ProgressState;
  status(): SyncStatus;
  /** What the device remembers between visits. */
  memory: { meta: unknown };
  restart(overrides?: Partial<SyncDeps> & { uid?: string | null }): Device;
}

function device(db: FakeDb | null, name: string, options: Partial<SyncDeps> & { uid?: string | null; store?: ProgressStore; memory?: { meta: unknown } } = {}): Device {
  const { uid, store: givenStore, memory: givenMemory, ...deps } = options;
  const store = givenStore ?? createProgressStore({ clock: { now: () => Date.now(), timeZone: 'UTC' }, storage: memoryStorage(), deviceId: name });
  const actions = createActions(() => store);
  const memory = givenMemory ?? { meta: null as unknown };
  const sync = createCloudSync({
    host: () => 'artifact',
    capability: async <T>(capability: string) => {
      if (capability === 'db') return db as T | null;
      if (capability === 'user') return { id: async () => (uid === undefined ? 'u_ana' : uid) } as T;
      return null;
    },
    progress: () => progressStorePort(store),
    loadMeta: () => memory.meta,
    saveMeta: (meta) => {
      memory.meta = JSON.parse(JSON.stringify(meta)) as unknown;
    },
    random: () => 0.5,
    ...deps,
  });
  const self: Device = {
    store,
    actions,
    sync,
    state: () => store.getState(),
    status: () => sync.status(),
    memory,
    restart: (overrides = {}) => {
      sync.stop();
      return device(db, name, { ...options, ...overrides, store, memory });
    },
  };
  return self;
}

/** Let (fake) time pass, running timers and the promises between them. */
const pass = (ms: number): Promise<void> => vi.advanceTimersByTimeAsync(ms).then(() => undefined);

/** Practise enough today to meet the daily goal. */
function practise(d: Device, lessons = 2): void {
  for (let i = 0; i < lessons; i++) {
    d.actions.recordActivity({ kind: 'theory-lesson', id: `theory:unit-${Math.floor(Math.random() * 1e6)}:lesson-${i}`, title: 'A lesson', accuracy: 1, durationSec: 240 });
  }
}

/** Build a streak: meet the goal on each of `days` consecutive days, ending today. */
function buildStreak(d: Device, days: number): void {
  for (let i = 0; i < days; i++) {
    if (i > 0) vi.setSystemTime(Date.now() + DAY);
    d.store.tick();
    practise(d);
  }
}

function remoteExport(db: FakeDb, uid = 'u_ana'): { stamp: string; state: ProgressState } {
  const doc = db.docs.get(head(uid)) as { body?: string; parts: number; gen: string } | undefined;
  if (!doc) throw new Error('no cloud copy');
  let body = doc.body ?? '';
  if (doc.parts > 0) {
    body = '';
    for (let i = 0; i < doc.parts; i++) body += String((db.docs.get(`${head(uid)}.${doc.gen}.${i}`) as { data: string }).data);
  }
  return JSON.parse(body) as { stamp: string; state: ProgressState };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});
afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------------------------
// Where sync is off
// ---------------------------------------------------------------------------------------------

describe('cloud sync is a no-op outside a capable artifact', () => {
  it('does nothing in the standalone app', async () => {
    const capability = vi.fn(async () => null);
    const progress = vi.fn();
    const sync = createCloudSync({ host: () => 'standalone', capability, progress });
    const status = await sync.start();
    expect(status).toMatchObject({ state: 'off', issue: 'standalone', pending: false, lastSyncedAt: null });
    expect(status.message).toMatch(/saved on this device/);
    expect(capability).not.toHaveBeenCalled();
    expect(progress).not.toHaveBeenCalled();
    await sync.flush();
    await pass(60_000);
    expect(sync.status().state).toBe('off');
  });

  it('is off when the database or the identity is missing, and never falls back to a shared path', async () => {
    const noDb = device(null, 'laptop');
    expect(await noDb.sync.start()).toMatchObject({ state: 'off', issue: 'not-offered' });

    const db = new FakeDb();
    const anonymous = device(db, 'laptop', { uid: null });
    expect(await anonymous.sync.start()).toMatchObject({ state: 'off', issue: 'not-offered' });

    const weird = device(db, 'laptop', { uid: 'not a valid/segment' });
    expect(await weird.sync.start()).toMatchObject({ state: 'off', issue: 'not-offered' });

    practise(anonymous);
    await pass(120_000);
    expect(db.log).toEqual([]);
    expect(db.subscriptions).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// One device
// ---------------------------------------------------------------------------------------------

describe('one device', () => {
  it('saves to the private per-user path once the (empty) cloud has been read', async () => {
    const db = new FakeDb();
    const laptop = device(db, 'laptop');
    practise(laptop);
    const seen: string[] = [];
    laptop.sync.subscribe(() => seen.push(laptop.status().state));
    expect((await laptop.sync.start()).state).toBe('syncing');
    expect(db.writes()).toEqual([]); // nothing is written before the cloud copy was read
    await pass(200);

    expect(db.writes()).toEqual(['data/users/u_ana/progress']);
    const doc = db.docs.get(head()) as Doc;
    expect(doc).toMatchObject({ app: 'sixstring-academy', kind: 'progress-sync', v: 1, parts: 0, epoch: 0, stamp: laptop.store.changeStamp() });
    expect(remoteExport(db).state.xp.total).toBe(laptop.state().xp.total);
    expect(laptop.status()).toMatchObject({ state: 'synced', issue: null, pending: false });
    expect(laptop.status().lastSyncedAt).toBeGreaterThanOrEqual(START);
    expect(laptop.status().lastSyncedAt).toBeLessThanOrEqual(Date.now());
    expect(laptop.status().message).toMatch(/backed up/);
    expect(seen).toContain('synced');
    expect(db.subscriptions).toBe(1);
  });

  it('writes only on change, after a quiet period, never two at once and not too often', async () => {
    const db = new FakeDb();
    const laptop = device(db, 'laptop');
    await laptop.sync.start();
    await pass(200);
    expect(db.writes()).toHaveLength(1);

    // Nothing changes for an hour: nothing is written.
    await pass(3_600_000);
    expect(db.writes()).toHaveLength(1);

    // A burst of changes becomes one write, after the quiet period.
    for (let i = 0; i < 6; i++) {
      laptop.actions.awardXp(5, 'test');
      await pass(500);
    }
    expect(laptop.status()).toMatchObject({ state: 'syncing', pending: true });
    await pass(4000);
    expect(db.writes()).toHaveLength(1);
    await pass(1500);
    expect(db.writes()).toHaveLength(2);
    expect(remoteExport(db).state.xp.total).toBe(30);
    expect(laptop.status()).toMatchObject({ state: 'synced', pending: false });

    // Changes arriving in quick succession afterwards respect the minimum interval (20 s).
    laptop.actions.awardXp(5, 'test');
    await pass(6000);
    expect(db.writes()).toHaveLength(2);
    await pass(15_000);
    expect(db.writes()).toHaveLength(3);
    expect(db.maxConcurrent).toBe(1);
  });

  it('does not let a steady trickle of changes postpone the save for ever', async () => {
    const db = new FakeDb();
    const laptop = device(db, 'laptop');
    await laptop.sync.start();
    await pass(200);
    await pass(30_000);
    const before = db.writes().length;
    // A change every 3 seconds would restart a 5 second quiet period for ever.
    for (let i = 0; i < 30; i++) {
      laptop.actions.awardXp(1, 'test');
      await pass(3000);
    }
    expect(db.writes().length).toBeGreaterThan(before);
    expect(db.writes().length).toBeLessThanOrEqual(before + 4); // 90 s of activity: a handful of writes, not 30
  });

  it('skips the write when only bookkeeping changed', async () => {
    const db = new FakeDb();
    const laptop = device(db, 'laptop');
    practise(laptop);
    await laptop.sync.start();
    await pass(200);
    expect(db.writes()).toHaveLength(1);
    // Re-importing its own data moves the revision and time stamp but nothing the learner sees.
    await pass(30_000);
    const stamp = laptop.store.changeStamp();
    laptop.store.importData(laptop.store.exportData(), 'newest-wins');
    expect(laptop.store.changeStamp()).not.toBe(stamp);
    await pass(60_000);
    expect(db.writes()).toHaveLength(1);
    expect(laptop.status().state).toBe('synced');
  });

  it('flush() writes at once; stop() ends listening and writing', async () => {
    const db = new FakeDb();
    const laptop = device(db, 'laptop');
    await laptop.sync.start();
    await pass(200);
    laptop.actions.awardXp(5, 'test');
    const flushed = laptop.sync.flush();
    await pass(100);
    await flushed;
    expect(db.writes()).toHaveLength(2);

    laptop.sync.stop();
    expect(db.unsubscribed).toBe(1);
    laptop.actions.awardXp(5, 'test');
    await pass(120_000);
    expect(db.writes()).toHaveLength(2);
    expect(laptop.status().state).toBe('off');
  });

  it('picks up where it left off on the next visit without rewriting unchanged data', async () => {
    const db = new FakeDb();
    let laptop = device(db, 'laptop');
    practise(laptop);
    await laptop.sync.start();
    await pass(200);
    expect(db.writes()).toHaveLength(1);

    laptop = laptop.restart();
    await laptop.sync.start();
    await pass(200);
    expect(db.writes()).toHaveLength(1); // same data, same save: nothing to do
    expect(laptop.status().state).toBe('synced');
  });
});

// ---------------------------------------------------------------------------------------------
// Two devices
// ---------------------------------------------------------------------------------------------

describe('two devices', () => {
  it('an untouched install takes the cloud copy over, blank slate and all, and writes nothing back', async () => {
    const db = new FakeDb();
    const laptop = device(db, 'laptop');
    laptop.actions.completeOnboarding({ name: 'Ana', avatar: 'guitar', experience: 'intermediate', dailyGoalXp: 20, handedness: 'left' });
    buildStreak(laptop, 3);
    laptop.actions.loseHeart();
    laptop.actions.grantGems(200, 'test');
    laptop.actions.buy('streak-freeze');
    await laptop.sync.start();
    await pass(200);
    const writes = db.writes().length;

    await pass(5 * 60_000);
    const phone = device(db, 'phone');
    expect(isPristine(phone.state())).toBe(true);
    await phone.sync.start();
    await pass(200);

    const a = laptop.state();
    const b = phone.state();
    expect(b.profile).toMatchObject({ name: 'Ana', experience: 'intermediate', onboarded: true });
    expect(b.prefs.handedness).toBe('left');
    expect(b.xp.total).toBe(a.xp.total);
    expect(b.streak.current).toBe(3);
    // The things a "newest side wins" merge would have blanked out with the phone's defaults:
    expect(b.streak.freezes).toBe(a.streak.freezes);
    expect(b.streak.freezes).toBeGreaterThan(0);
    expect(b.hearts.count).toBe(a.hearts.count);
    expect(b.gems.balance).toBe(a.gems.balance);
    expect(b.meta.deviceId).toBe('phone'); // still its own install
    expect(db.writes()).toHaveLength(writes); // the phone had nothing to add
    expect(phone.status().state).toBe('synced');
    expect(laptop.state().streak.freezes).toBe(a.streak.freezes);
  });

  it('merges progress made on both devices and joins the two halves of one streak', async () => {
    const db = new FakeDb();
    const laptop = device(db, 'laptop');
    buildStreak(laptop, 50); // fifty days in a row on the laptop, ending "yesterday"
    await laptop.sync.start();
    await pass(200);
    expect(laptop.state().streak.current).toBe(50);
    const laptopXp = laptop.state().xp.total;

    // Next day, on a phone that is offline at first: today's goal is met there.
    vi.setSystemTime(Date.now() + DAY);
    db.delivering = false;
    const phone = device(db, 'phone');
    phone.store.tick();
    practise(phone);
    expect(phone.state().streak.current).toBe(1);
    const phoneXp = phone.state().xp.total;
    await phone.sync.start();
    await pass(1000);
    expect(db.writes(/progress$/)).toHaveLength(1); // offline: the phone has not overwritten anything

    // The connection comes back.
    db.delivering = true;
    db.emit(head());
    await pass(30_000);

    const merged = phone.state();
    expect(merged.streak.current).toBe(51); // not the phone's 1, not the laptop's stale 50
    expect(merged.streak.longest).toBe(51);
    expect(merged.xp.total).toBe(laptopXp + phoneXp);
    expect(Object.keys(merged.days)).toHaveLength(51);

    // The laptop hears about it and ends up with the same progress.
    laptop.store.tick();
    await pass(60_000);
    expect(laptop.state().streak.current).toBe(51);
    expect(laptop.state().xp.total).toBe(laptopXp + phoneXp);
    expect(materialKey(remoteExport(db).state)).toBe(materialKey(laptop.state()));
    expect(materialKey(phone.state())).toBe(materialKey(laptop.state()));

    // And then everything is quiet: no ping-pong between the two.
    const settled = db.writes().length;
    await pass(30 * 60_000);
    expect(db.writes()).toHaveLength(settled);
    expect(laptop.status().state).toBe('synced');
    expect(phone.status().state).toBe('synced');
    expect(db.maxConcurrent).toBeLessThanOrEqual(2); // each device writes one document at a time
  });

  it('never loses XP: the merged total is at least the higher of the two', async () => {
    const db = new FakeDb();
    const laptop = device(db, 'laptop');
    practise(laptop, 6);
    await laptop.sync.start();
    await pass(200);

    db.delivering = false;
    const phone = device(db, 'phone');
    practise(phone, 1);
    await phone.sync.start();
    await pass(500);
    const higher = Math.max(laptop.state().xp.total, phone.state().xp.total);
    db.delivering = true;
    db.emit(head());
    await pass(60_000);
    expect(phone.state().xp.total).toBeGreaterThanOrEqual(higher);
    expect(laptop.state().xp.total).toBeGreaterThanOrEqual(higher);
    expect(remoteExport(db).state.xp.total).toBeGreaterThanOrEqual(higher);
  });

  it('checks the cloud once more right before writing, in case the listener is behind', async () => {
    const db = new FakeDb();
    const laptop = device(db, 'laptop');
    practise(laptop);
    await laptop.sync.start();
    await pass(200);
    const phone = device(db, 'phone');
    await phone.sync.start();
    await pass(200);

    // The phone stops hearing live updates, the laptop saves more progress.
    db.delivering = false;
    await pass(30_000);
    practise(laptop, 3);
    await pass(30_000);
    const laptopXp = laptop.state().xp.total;
    expect(remoteExport(db).state.xp.total).toBe(laptopXp);

    // The phone now saves something of its own. It must not wipe out what the laptop saved.
    phone.actions.awardXp(7, 'test');
    await pass(30_000);
    expect(remoteExport(db).state.xp.total).toBeGreaterThanOrEqual(laptopXp);
    expect(phone.state().xp.total).toBeGreaterThanOrEqual(laptopXp);
  });

  it('a reset travels: other devices take the fresh start over instead of merging old progress back', async () => {
    const db = new FakeDb();
    const laptop = device(db, 'laptop');
    practise(laptop, 4);
    await laptop.sync.start();
    await pass(200);
    const phone = device(db, 'phone');
    await phone.sync.start();
    await pass(200);
    expect(phone.state().xp.total).toBeGreaterThan(0);

    await pass(60_000);
    laptop.actions.resetProgress();
    expect(laptop.state().xp.total).toBe(0);
    await pass(60_000);

    expect((db.docs.get(head()) as { epoch: number }).epoch).toBeGreaterThan(0);
    expect(remoteExport(db).state.xp.total).toBe(0);
    expect(phone.state().xp.total).toBe(0); // not merged back to the old total
    expect(laptop.state().xp.total).toBe(0);
    await pass(10 * 60_000);
    expect(remoteExport(db).state.xp.total).toBe(0);
    expect(phone.status().state).toBe('synced');
  });

  it('a backup restored with "replace" wins everywhere too', async () => {
    const db = new FakeDb();
    const laptop = device(db, 'laptop');
    practise(laptop, 2);
    const backup = JSON.parse(JSON.stringify(laptop.store.exportData())) as unknown;
    const backupXp = laptop.state().xp.total;
    practise(laptop, 6);
    await laptop.sync.start();
    await pass(200);
    const phone = device(db, 'phone');
    await phone.sync.start();
    await pass(200);
    expect(phone.state().xp.total).toBeGreaterThan(backupXp);

    await pass(60_000);
    expect(laptop.store.importData(backup, 'replace').ok).toBe(true); // the learner restores the older backup
    await pass(60_000);
    expect(laptop.state().xp.total).toBe(backupXp);
    expect(phone.state().xp.total).toBe(backupXp); // not merged back up to the newer total
    expect(remoteExport(db).state.xp.total).toBe(backupXp);
  });

  it('two tabs of one browser do not echo each other', async () => {
    const db = new FakeDb();
    // One browser profile: both tabs share the stored progress and the stored sync memory.
    const storage = memoryStorage();
    const memory = { meta: null as unknown };
    const clock = { now: () => Date.now(), timeZone: 'UTC' };
    const storeA = createProgressStore({ clock, storage, deviceId: 'browser' });
    const storeB = createProgressStore({ clock, storage, deviceId: 'browser' });
    // What the browser's `storage` event does in the real app.
    storeA.subscribe(() => {
      storeA.flush();
      storeB.syncFromStorage();
    });
    storeB.subscribe(() => {
      storeB.flush();
      storeA.syncFromStorage();
    });
    const tabA = device(db, 'browser', { store: storeA, memory });
    const tabB = device(db, 'browser', { store: storeB, memory });
    await tabA.sync.start();
    await tabB.sync.start();
    await pass(60_000);
    const start = db.writes().length;

    practise(tabA, 2);
    expect(tabB.state().xp.total).toBe(tabA.state().xp.total);
    await pass(60_000);
    const after = db.writes().length;
    expect(after - start).toBeGreaterThanOrEqual(1);
    expect(after - start).toBeLessThanOrEqual(2); // at worst each tab saved the change once
    expect(remoteExport(db).state.xp.total).toBe(tabA.state().xp.total);

    await pass(60 * 60_000); // and then silence
    expect(db.writes()).toHaveLength(after);
    expect(tabA.status().state).toBe('synced');
    expect(tabB.status().state).toBe('synced');
  });

  it('after a reset, a copy from before it that shows up in the cloud is replaced, not merged back in', async () => {
    const db = new FakeDb();
    const laptop = device(db, 'laptop');
    practise(laptop, 4);
    await laptop.sync.start();
    await pass(200);
    const old = JSON.parse(JSON.stringify(db.docs.get(head()))) as Doc;

    await pass(60_000);
    laptop.actions.resetProgress();
    await pass(60_000);
    expect(remoteExport(db).state.xp.total).toBe(0);

    // A device that had not heard of the reset writes its old copy over the fresh start.
    db.docs.set(head(), { ...old, gen: 'late0001' });
    db.emit(head());
    await pass(60_000);
    expect(laptop.state().xp.total).toBe(0);
    expect(remoteExport(db).state.xp.total).toBe(0);
    expect(laptop.status().state).toBe('synced');
  });
});

// ---------------------------------------------------------------------------------------------
// Loading and failures
// ---------------------------------------------------------------------------------------------

describe('loading and failures', () => {
  it('never writes before a confirmed read: a cached "nothing there" does not count', async () => {
    const db = new FakeDb();
    const laptop = device(db, 'laptop');
    practise(laptop, 5);
    await laptop.sync.start();
    await pass(200);
    const laptopXp = laptop.state().xp.total;

    db.delivering = false;
    const phone = device(db, 'phone');
    practise(phone, 1);
    await phone.sync.start();
    await pass(100);
    db.emitRaw(head(), false, true); // a stale local cache says there is no document
    await pass(60_000);
    expect(db.writes()).toEqual([head()]); // still only the laptop's save
    expect(remoteExport(db).state.xp.total).toBe(laptopXp);
    expect(phone.status()).toMatchObject({ state: 'error', issue: 'unreachable', pending: true });

    // The server answers: the phone merges first and only then writes.
    db.delivering = true;
    db.emit(head());
    await pass(60_000);
    expect(remoteExport(db).state.xp.total).toBeGreaterThanOrEqual(laptopXp);
    expect(phone.state().xp.total).toBeGreaterThanOrEqual(laptopXp);
    expect(phone.status().state).toBe('synced');
  });

  it('reports "unreachable" after ten seconds, keeps the one listener, and recovers by itself', async () => {
    const db = new FakeDb();
    db.delivering = false;
    const laptop = device(db, 'laptop');
    practise(laptop);
    await laptop.sync.start();
    await pass(9000);
    expect(laptop.status()).toMatchObject({ state: 'syncing', issue: null });
    await pass(1500);
    expect(laptop.status()).toMatchObject({ state: 'error', issue: 'unreachable' });
    expect(laptop.status().message).toMatch(/safe on this device/);
    expect(db.writes()).toEqual([]);

    // A cached snapshot arrives first; it is not proof of what the server holds.
    db.emit(head(), true);
    await pass(30_000);
    expect(db.writes()).toEqual([]);
    expect(laptop.status().issue).toBe('unreachable');

    await pass(10 * 60_000);
    expect(db.subscriptions).toBe(1); // never re-subscribed, never reloaded: the listener reconnects itself
    db.delivering = true;
    db.emit(head());
    await pass(1000);
    expect(db.writes()).toEqual([head()]);
    expect(laptop.status()).toMatchObject({ state: 'synced', issue: null });
  });

  it('backs off on write errors with growing pauses, then recovers', async () => {
    const db = new FakeDb();
    const laptop = device(db, 'laptop');
    await laptop.sync.start();
    await pass(30_000);
    const before = db.log.filter((entry) => entry.op === 'set').length;
    const attempts = (): number => db.log.filter((entry) => entry.op === 'set').length - before;
    let elapsed = 0;
    const until = async (ms: number): Promise<void> => {
      await pass(ms - elapsed);
      elapsed = ms;
    };

    db.fail('set', 'unavailable', 4);
    laptop.actions.awardXp(5, 'test');
    // Attempts follow the quiet period (5 s) and then pauses of 2, 4, 8 and 16 seconds.
    await until(5_300);
    expect(attempts()).toBe(1);
    expect(laptop.status()).toMatchObject({ state: 'syncing', pending: true }); // one hiccup is not worth an alarm
    await until(6_800);
    expect(attempts()).toBe(1);
    await until(7_500);
    expect(attempts()).toBe(2);
    expect(laptop.status()).toMatchObject({ state: 'error', issue: 'retrying', pending: true });
    expect(laptop.status().message).toMatch(/keep trying/);
    await until(10_800);
    expect(attempts()).toBe(2);
    await until(11_600);
    expect(attempts()).toBe(3);
    await until(18_800);
    expect(attempts()).toBe(3);
    await until(19_700);
    expect(attempts()).toBe(4);
    await until(34_800);
    expect(attempts()).toBe(4);
    await until(35_900);
    expect(attempts()).toBe(5); // and this one goes through
    expect(remoteExport(db).state.xp.total).toBe(5);
    expect(laptop.status()).toMatchObject({ state: 'synced', issue: null, pending: false });
    expect(db.maxConcurrent).toBe(1);
  });

  it('rests longer when the store says a rate budget is used up', async () => {
    const db = new FakeDb();
    const laptop = device(db, 'laptop');
    await laptop.sync.start();
    await pass(30_000);
    db.fail('set', 'resource_exhausted', 1);
    laptop.actions.awardXp(5, 'test');
    await pass(5100);
    const sets = db.log.filter((entry) => entry.op === 'set').length;
    await pass(7500);
    expect(db.log.filter((entry) => entry.op === 'set')).toHaveLength(sets); // 8 s, not 2 s
    await pass(1000);
    expect(db.log.filter((entry) => entry.op === 'set')).toHaveLength(sets + 1);
  });

  it('a refused write means this viewer may not save: reading goes on, writing stops', async () => {
    const db = new FakeDb();
    const laptop = device(db, 'laptop');
    practise(laptop, 2);
    await laptop.sync.start();
    await pass(200);

    const viewer = device(db, 'tablet');
    db.fail('set', 'invalid_argument', 1, /tablet|progress$/);
    await viewer.sync.start();
    await pass(200);
    viewer.actions.awardXp(5, 'test');
    await pass(60_000);
    expect(viewer.status()).toMatchObject({ state: 'error', issue: 'read-only' });
    const sets = db.log.filter((entry) => entry.op === 'set').length;
    viewer.actions.awardXp(5, 'test');
    await viewer.sync.flush();
    await pass(10 * 60_000);
    expect(db.log.filter((entry) => entry.op === 'set')).toHaveLength(sets); // no further attempts
    expect(viewer.state().xp.total).toBeGreaterThan(0); // local progress is untouched
  });

  it('pauses when the database is full and tries again much later', async () => {
    const db = new FakeDb();
    const laptop = device(db, 'laptop');
    db.fail('set', 'quota_exceeded', 1);
    practise(laptop);
    await laptop.sync.start();
    await pass(500);
    expect(laptop.status()).toMatchObject({ state: 'error', issue: 'storage-full', pending: true });
    await pass(9 * 60_000);
    expect(db.docs.has(head())).toBe(false);
    await pass(90_000);
    expect(db.docs.has(head())).toBe(true);
    expect(laptop.status()).toMatchObject({ state: 'synced', issue: null });
  });

  it('shuts down for the page load when access is revoked', async () => {
    const db = new FakeDb();
    const laptop = device(db, 'laptop');
    await laptop.sync.start();
    await pass(200);
    await pass(30_000);
    db.fail('get', 'revoked', 1);
    laptop.actions.awardXp(5, 'test');
    await pass(6000);
    expect(laptop.status()).toMatchObject({ state: 'off', issue: 'revoked' });
    expect(db.unsubscribed).toBe(1);
    const calls = db.log.length;
    laptop.actions.awardXp(5, 'test');
    await pass(10 * 60_000);
    expect(db.log).toHaveLength(calls);
  });

  it('subscribes afresh, after a pause, when the listener dies', async () => {
    const db = new FakeDb();
    const laptop = device(db, 'laptop');
    practise(laptop);
    await laptop.sync.start();
    await pass(200);
    db.breakListeners(head(), 'unavailable');
    expect(db.subscriptions).toBe(1);
    await pass(9000);
    expect(db.subscriptions).toBe(1);
    await pass(2000);
    expect(db.subscriptions).toBe(2);
    expect(laptop.status().state).toBe('synced');

    db.breakListeners(head(), 'revoked');
    expect(laptop.status()).toMatchObject({ state: 'off', issue: 'revoked' });
  });

  it('does not overwrite a cloud copy written by a newer version of the app', async () => {
    const db = new FakeDb();
    db.docs.set(head(), { app: 'sixstring-academy', kind: 'progress-sync', v: 2, gen: 'zz9', layout: 'something this version cannot read' });
    const laptop = device(db, 'laptop');
    practise(laptop);
    await laptop.sync.start();
    await pass(60_000);
    expect(laptop.status()).toMatchObject({ state: 'error', issue: 'update-needed' });
    expect(laptop.status().message).toMatch(/newer version/);
    expect(db.writes()).toEqual([]);
    expect((db.docs.get(head()) as Doc).gen).toBe('zz9');

    // The same when the envelope is known but the progress data inside is from a newer schema.
    const db2 = new FakeDb();
    const future = JSON.stringify({ app: 'sixstring-academy', kind: 'progress-export', v: 999, exportedAt: 1, stamp: 'x', state: { xp: { total: 5 } } });
    db2.docs.set(head(), { app: 'sixstring-academy', kind: 'progress-sync', v: 1, gen: 'abc', stamp: 'x', epoch: 0, at: 1, chars: future.length, sum: checksum(future), parts: 0, body: future });
    const other = device(db2, 'laptop');
    practise(other);
    await other.sync.start();
    await pass(60_000);
    expect(other.status()).toMatchObject({ state: 'error', issue: 'update-needed' });
    expect(db2.writes()).toEqual([]);
  });

  it('replaces a damaged cloud copy with the good local one', async () => {
    for (const damaged of [
      { kind: 'progress-sync', v: 1, gen: 'bad1', stamp: 's', epoch: 0, chars: 5, sum: 'ffffffff', parts: 0, body: 'not the body the checksum describes' },
      { some: 'other document entirely' },
      { kind: 'progress-sync', v: 1, gen: 'bad2', stamp: 's', epoch: 0, chars: 9, sum: checksum('{"oops":1'), parts: 0, body: '{"oops":1' },
    ]) {
      const db = new FakeDb();
      db.docs.set(head(), damaged);
      const laptop = device(db, 'laptop');
      practise(laptop);
      await laptop.sync.start();
      await pass(2 * 60_000);
      expect(remoteExport(db).state.xp.total).toBe(laptop.state().xp.total);
      expect(laptop.status().state).toBe('synced');
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Large states
// ---------------------------------------------------------------------------------------------

describe('exports larger than one document', () => {
  function fatten(d: Device, skills: number): void {
    for (let i = 0; i < skills; i++) {
      d.actions.markSkill(`scale:exotic-scale-number-${i}:position-${i % 7}`, { completed: true, data: { note: `ü♯ practice note ${i} "quoted"`, bpm: 60 + i } });
    }
  }

  it('is split into part documents under the size limit and put back together elsewhere', async () => {
    const db = new FakeDb();
    const laptop = device(db, 'laptop');
    practise(laptop);
    fatten(laptop, 2500);
    const size = JSON.stringify(laptop.store.exportData()).length;
    expect(size).toBeGreaterThan(400_000);
    await laptop.sync.start();
    await pass(2000);

    const doc = db.docs.get(head()) as { parts: number; gen: string; body?: string; chars: number };
    expect(doc.parts).toBeGreaterThanOrEqual(2);
    expect(doc.body).toBeUndefined();
    expect(doc.chars).toBe(size);
    const parts = [...db.docs.keys()].filter((path) => path.startsWith(`${head()}.`));
    expect(parts).toHaveLength(doc.parts);
    for (const path of parts) expect(path).toMatch(/^data\/users\/u_ana\/progress\.[a-z0-9]+\.\d+$/);
    // The head is written last, so a reader never finds a head without its parts.
    const sets = db.writes();
    expect(sets[sets.length - 1]).toBe(head());
    expect(laptop.status().state).toBe('synced');

    const phone = device(db, 'phone');
    await phone.sync.start();
    await pass(2000);
    expect(Object.keys(phone.state().skills)).toHaveLength(Object.keys(laptop.state().skills).length);
    expect(materialKey(phone.state())).toBe(materialKey(laptop.state()));
  });

  it('removes the parts of the save it replaces', async () => {
    const db = new FakeDb();
    const laptop = device(db, 'laptop');
    fatten(laptop, 2500);
    await laptop.sync.start();
    await pass(2000);
    const first = (db.docs.get(head()) as { gen: string }).gen;

    await pass(30_000);
    laptop.actions.awardXp(5, 'test');
    await pass(30_000);
    const second = db.docs.get(head()) as { gen: string; parts: number };
    expect(second.gen).not.toBe(first);
    const parts = [...db.docs.keys()].filter((path) => path.startsWith(`${head()}.`));
    expect(parts).toHaveLength(second.parts);
    expect(parts.every((path) => path.includes(`.${second.gen}.`))).toBe(true);
    expect(db.maxConcurrent).toBe(1);
  });

  it('cleans up after a save that was interrupted half-way, and keeps the previous save readable meanwhile', async () => {
    const db = new FakeDb();
    let laptop = device(db, 'laptop');
    fatten(laptop, 2500);
    await laptop.sync.start();
    await pass(2000);
    const good = db.docs.get(head()) as { gen: string; parts: number };

    await pass(30_000);
    laptop.actions.awardXp(5, 'test');
    // The page dies after the second part of the new save was written (the head never is).
    db.fail('set', 'unavailable', 50, /progress$/);
    await pass(5500);
    const orphans = [...db.docs.keys()].filter((path) => path.startsWith(`${head()}.`) && !path.includes(`.${good.gen}.`));
    expect(orphans.length).toBeGreaterThan(0);
    expect((db.docs.get(head()) as { gen: string }).gen).toBe(good.gen); // the old save is still whole
    const reader = device(db, 'phone');
    await reader.sync.start();
    await pass(2000);
    expect(Object.keys(reader.state().skills)).toHaveLength(2500);
    reader.sync.stop();

    // Next visit: the listener confirms the old head, and the leftovers are swept away.
    db.clearFailures();
    laptop = laptop.restart();
    await laptop.sync.start();
    await pass(60_000);
    const current = db.docs.get(head()) as { gen: string; parts: number };
    const parts = [...db.docs.keys()].filter((path) => path.startsWith(`${head()}.`));
    expect(parts.every((path) => path.includes(`.${current.gen}.`))).toBe(true);
    expect(parts).toHaveLength(current.parts);
    expect(remoteExport(db).state.xp.total).toBe(5);
  });

  it('waits for the newer save when the parts of the head it holds are already gone', async () => {
    const db = new FakeDb();
    const laptop = device(db, 'laptop');
    fatten(laptop, 2500);
    await laptop.sync.start();
    await pass(2000);

    db.delivering = false;
    const phone = device(db, 'phone');
    await phone.sync.start();
    // The phone is handed a head whose parts another device has just replaced and deleted.
    const stale = JSON.parse(JSON.stringify(db.docs.get(head()))) as Doc;
    const live = db.docs.get(head()) as Doc;
    db.docs.set(head(), { ...stale, gen: 'gone0000' });
    db.emit(head());
    await pass(3000);
    expect(isPristine(phone.state())).toBe(true); // nothing usable yet
    expect(phone.status().state).toBe('syncing');
    expect(db.writes(/progress$/)).toHaveLength(1); // and it did not write over anything

    db.docs.set(head(), live);
    db.delivering = true;
    db.emit(head());
    await pass(3000);
    expect(Object.keys(phone.state().skills)).toHaveLength(2500);
    expect(phone.status().state).toBe('synced');
  });
});

// ---------------------------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------------------------

describe('a second account on the same device', () => {
  it('keeps the accounts apart when the first one was fully saved', async () => {
    const db = new FakeDb();
    const tablet = device(db, 'tablet', { uid: 'u_ana' });
    practise(tablet, 6);
    await tablet.sync.start();
    await pass(200);
    const anaXp = tablet.state().xp.total;

    // Ben has his own progress in the cloud, made elsewhere.
    const elsewhere = device(db, 'bens-phone', { uid: 'u_ben' });
    practise(elsewhere, 1);
    await elsewhere.sync.start();
    await pass(200);
    const benXp = elsewhere.state().xp.total;
    expect(benXp).not.toBe(anaXp);

    // Ben opens the app on the tablet.
    const asBen = tablet.restart({ uid: 'u_ben' });
    await asBen.sync.start();
    await pass(60_000);
    expect(asBen.state().xp.total).toBe(benXp); // his progress, not a blend of both
    expect(remoteExport(db, 'u_ben').state.xp.total).toBe(benXp);
    expect(remoteExport(db, 'u_ana').state.xp.total).toBe(anaXp); // hers is untouched
    expect(db.writes(/u_ana/)).toHaveLength(1);
  });

  it('merges instead when the first account left unsaved progress behind', async () => {
    const db = new FakeDb();
    const tablet = device(db, 'tablet', { uid: 'u_ana' });
    practise(tablet, 2);
    await tablet.sync.start();
    await pass(200);
    tablet.sync.stop();
    practise(tablet, 2); // practised after sync stopped: only on this device
    const local = tablet.state().xp.total;

    const elsewhere = device(db, 'bens-phone', { uid: 'u_ben' });
    practise(elsewhere, 1);
    await elsewhere.sync.start();
    await pass(200);

    const asBen = tablet.restart({ uid: 'u_ben' });
    await asBen.sync.start();
    await pass(60_000);
    expect(asBen.state().xp.total).toBeGreaterThanOrEqual(local); // nothing unsaved is thrown away
  });
});

// ---------------------------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------------------------

describe('strongerStreak', () => {
  const day = (offset: number): string => new Date(Date.UTC(2026, 2, 20) + offset * DAY).toISOString().slice(0, 10);
  const metDays = (from: number, to: number, extra: Record<string, unknown> = {}): Record<string, unknown> => {
    const days: Record<string, unknown> = {};
    for (let i = from; i <= to; i++) days[day(i)] = { xp: 20, goal: 20, met: true, sec: 0, n: 1, kinds: {} };
    return { ...days, ...extra };
  };
  const state = (days: Record<string, unknown>, streak: Record<string, unknown>, today = day(0)) => ({
    days,
    streak: { current: 0, longest: 0, lastGoalDay: null, lastGoalAt: null, coveredThrough: null, startedOn: null, freezes: 0, milestones: [], ...streak },
    meta: { today },
  });

  it('joins two halves of one unbroken run', () => {
    const laptop = state(metDays(-50, -1), { current: 50, longest: 50, lastGoalDay: day(-1), coveredThrough: day(-1), startedOn: day(-50), lastGoalAt: 111 });
    const phone = state(metDays(0, 0), { current: 1, longest: 1, lastGoalDay: day(0), coveredThrough: day(0), startedOn: day(0), lastGoalAt: 999 });
    const merged = state(metDays(-50, 0), { current: 1, longest: 50, lastGoalDay: day(0), coveredThrough: day(0), startedOn: day(0), lastGoalAt: 999 });
    expect(strongerStreak(merged, [phone, laptop])).toEqual({ current: 51, longest: 51, lastGoalDay: day(0), coveredThrough: day(0), startedOn: day(-50), lastGoalAt: 999 });
  });

  it('counts a streak longer than the stored history by building on a side’s own counter', () => {
    // Only the last 10 days are stored, but the laptop knows its run was 400 days long.
    const laptop = state(metDays(-10, -1), { current: 400, longest: 400, lastGoalDay: day(-1), coveredThrough: day(-1), startedOn: day(-400) });
    const merged = state(metDays(-10, 0), { current: 1, longest: 400, lastGoalDay: day(0), coveredThrough: day(0), startedOn: day(0) });
    expect(strongerStreak(merged, [laptop])).toMatchObject({ current: 401, longest: 401, startedOn: day(-400) });
  });

  it('lets frozen days bridge the run without counting them', () => {
    const frozen = { [day(-2)]: { xp: 0, goal: 20, met: false, frozen: true, sec: 0, n: 0, kinds: {} } };
    const merged = state({ ...metDays(-5, -3), ...frozen, ...metDays(-1, 0) }, { current: 2, longest: 3, lastGoalDay: day(0) });
    expect(strongerStreak(merged, [])).toMatchObject({ current: 5, coveredThrough: day(0), startedOn: day(-5) });
  });

  it('accepts a run that ended yesterday (today is not over yet)', () => {
    const merged = state(metDays(-4, -1), { current: 2, longest: 4, lastGoalDay: day(-1) });
    expect(strongerStreak(merged, [])).toMatchObject({ current: 4, lastGoalDay: day(-1), coveredThrough: day(-1) });
  });

  it('does not revive a run that is really broken', () => {
    // Fifty days long ago, a gap, then today.
    const old = state(metDays(-60, -11), { current: 50, longest: 50, lastGoalDay: day(-11) });
    const merged = state({ ...metDays(-60, -11), ...metDays(0, 0) }, { current: 1, longest: 50, lastGoalDay: day(0) });
    expect(strongerStreak(merged, [old])).toBeNull();
    // Nothing recent at all.
    expect(strongerStreak(state(metDays(-30, -5), { current: 0, longest: 26 }), [])).toBeNull();
  });

  it('has nothing to repair when the merge already kept the longest streak', () => {
    const merged = state(metDays(-6, 0), { current: 7, longest: 7, lastGoalDay: day(0) });
    expect(strongerStreak(merged, [merged])).toBeNull();
    expect(strongerStreak(state(metDays(-2, 0), { current: 12, longest: 12, lastGoalDay: day(0) }), [])).toBeNull(); // a longer counter is trusted
  });

  it('shrugs off malformed input', () => {
    expect(strongerStreak(null, [])).toBeNull();
    expect(strongerStreak({ days: {}, streak: {}, meta: {} }, [null, 3, 'x'])).toBeNull();
    expect(strongerStreak(state(metDays(-1, 0), { current: 1 }), [{ streak: { current: 'many', lastGoalDay: 5 } }])).toMatchObject({ current: 2 });
  });
});

describe('document helpers', () => {
  it('splitBody keeps every piece under the byte budget and joins back exactly', () => {
    const text = `{"q":"${'"\\'.repeat(300)}","u":"${'ü♯𝄪'.repeat(200)}","a":"${'plain '.repeat(500)}"}`;
    for (const budget of [64, 200, 1000, 100_000]) {
      const pieces = splitBody(text, budget);
      expect(pieces.join('')).toBe(text);
      for (const piece of pieces) {
        expect(new TextEncoder().encode(JSON.stringify(piece)).length - 2).toBeLessThanOrEqual(budget);
        // No piece starts or ends in the middle of a surrogate pair.
        expect(/^[\uDC00-\uDFFF]/.test(piece)).toBe(false);
        expect(/[\uD800-\uDBFF]$/.test(piece)).toBe(false);
      }
    }
    expect(splitBody('short', 1000)).toEqual(['short']);
    expect(splitBody('', 1000)).toEqual(['']);
  });

  it('checksum notices any change', () => {
    expect(checksum('abc')).toBe(checksum('abc'));
    expect(checksum('abc')).not.toBe(checksum('abd'));
    expect(checksum('')).toMatch(/^[0-9a-f]{8}$/);
  });

  it('materialKey ignores bookkeeping and key order, and nothing else', () => {
    const a = { xp: { total: 10, byTag: { scales: 4, chords: 6 } }, days: { '2026-03-01': { xp: 10 } }, meta: { rev: 3, updatedAt: 100 } };
    const b = { meta: { rev: 9, updatedAt: 999 }, days: { '2026-03-01': { xp: 10 } }, xp: { byTag: { chords: 6, scales: 4 }, total: 10 } };
    expect(materialKey(a)).toBe(materialKey(b));
    expect(materialKey({ ...a, xp: { ...a.xp, total: 11 } })).not.toBe(materialKey(a));
    expect(materialKey({ list: [1, 2] })).not.toBe(materialKey({ list: [2, 1] }));
    expect(materialKey({ a: undefined, b: 1 })).toBe(materialKey({ b: 1 }));
  });

  it('isPristine recognises an install nobody has used', () => {
    const fresh = createProgressStore({ clock: { now: () => Date.now(), timeZone: 'UTC' }, storage: memoryStorage(), deviceId: 'new' });
    expect(isPristine(fresh.getState())).toBe(true);
    createActions(() => fresh).awardXp(5, 'test');
    expect(isPristine(fresh.getState())).toBe(false);
    expect(isPristine(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// The rest of the learner's data, and the learner's songs
// ---------------------------------------------------------------------------------------------

interface DataDevice extends Device {
  kv: ReturnType<typeof memoryKv>;
  data: LearnerData;
  lib: Library;
  /** A feature writes a key (and the tracker notices it). */
  write(key: string, value: unknown): void;
  read(key: string): unknown;
}

function dataDevice(db: FakeDb | null, name: string, options: Partial<SyncDeps> & { uid?: string | null } = {}): DataDevice {
  const kv = memoryKv();
  const data = createLearnerData(kv, () => Date.now());
  let seed = name.length + 3;
  const lib = createLibrary({ store: memoryStore(), broadcast: false, random: () => ((seed = (seed * 16807) % 2147483647) / 2147483647) });
  const store = createProgressStore({ clock: { now: () => Date.now(), timeZone: 'UTC' }, storage: memoryStorage(), deviceId: name });
  const port = appDataPort(store, data, songSyncPort(lib));
  const d = device(db, name, { store, progress: () => port, ...options } as Partial<SyncDeps> & { uid?: string | null; store: ProgressStore });
  return Object.assign(d, {
    kv,
    data,
    lib,
    write(key: string, value: unknown) {
      kv.write(key, JSON.stringify(value));
      data.notice();
    },
    read(key: string): unknown {
      const raw = kv.read(key);
      return raw === null ? null : (JSON.parse(raw) as unknown);
    },
  });
}

function remoteBody(db: FakeDb, uid = 'u_ana'): { data?: Record<string, { at: number; value?: unknown }>; songs?: { carried: boolean; items?: Record<string, unknown>; reason?: string } } {
  return remoteExport(db, uid) as unknown as ReturnType<typeof remoteBody>;
}

const songDoc = (id: string, uid = 'u_ana'): string => `data/users/${uid}/song.${id}`;

describe('the rest of the learner’s data', () => {
  it('travels to another device, but not the calibration, the AI key or device notes', async () => {
    const db = new FakeDb();
    const laptop = dataDevice(db, 'laptop');
    practise(laptop);
    laptop.write('practice.data', { v: 1, journal: [{ id: 'j1', endedAt: 5 }], routines: [], goals: [] });
    laptop.write('metronome.settings', { bpm: 96 });
    laptop.write('rhythm.calibration', { v: 1, tapMs: 40, tapAt: 1 });
    laptop.kv.write('ai.anthropic-key', 'sk-ant-secret');
    laptop.kv.write('player.micNotice', 'true');
    await laptop.sync.start();
    await pass(200);
    const body = remoteBody(db);
    expect(Object.keys(body.data ?? {}).sort()).toEqual(['metronome.settings', 'practice.data']);
    expect(JSON.stringify(body)).not.toContain('sk-ant');

    const phone = dataDevice(db, 'phone');
    await phone.sync.start();
    await pass(200);
    expect(phone.read('practice.data')).toEqual(laptop.read('practice.data'));
    expect(phone.read('metronome.settings')).toEqual({ bpm: 96 });
    expect(phone.kv.read('rhythm.calibration')).toBeNull();
    expect(phone.kv.read('ai.anthropic-key')).toBeNull();
    expect(phone.kv.read('player.micNotice')).toBeNull();
    expect(phone.status().state).toBe('synced');
  });

  it('a change made on either device reaches the other, key by key, and a deletion too', async () => {
    const db = new FakeDb();
    const laptop = dataDevice(db, 'laptop');
    practise(laptop);
    laptop.write('metronome.settings', { bpm: 96 });
    laptop.write('progressions.saved', [{ id: 'my-blues', updatedAt: 1 }]);
    await laptop.sync.start();
    await pass(200);
    const phone = dataDevice(db, 'phone');
    await phone.sync.start();
    await pass(200);
    expect(phone.read('progressions.saved')).toEqual([{ id: 'my-blues', updatedAt: 1 }]);

    await pass(30_000);
    phone.write('metronome.settings', { bpm: 120 });
    await pass(60_000);
    expect(laptop.read('metronome.settings')).toEqual({ bpm: 120 });

    laptop.kv.remove('progressions.saved');
    laptop.data.notice();
    await pass(60_000);
    expect(phone.read('progressions.saved')).toBeNull();
    expect(phone.read('metronome.settings')).toEqual({ bpm: 120 });
    expect(laptop.status().state).toBe('synced');
    expect(phone.status().state).toBe('synced');
  });

  it('two devices that both added journal entries while apart keep them all; the newer setting wins', async () => {
    const db = new FakeDb();
    const laptop = dataDevice(db, 'laptop');
    practise(laptop);
    laptop.write('practice.data', { v: 1, journal: [{ id: 'a', endedAt: 1 }], routines: [], goals: [] });
    await laptop.sync.start();
    await pass(200);
    const phone = dataDevice(db, 'phone');
    await phone.sync.start();
    await pass(200);
    phone.sync.stop(); // the phone goes offline

    await pass(30_000);
    phone.write('practice.data', { v: 1, journal: [{ id: 'a', endedAt: 1 }, { id: 'phone', endedAt: 2 }], routines: [], goals: [] });
    phone.write('chords.dots', 'notes');
    await pass(30_000);
    laptop.write('practice.data', { v: 1, journal: [{ id: 'a', endedAt: 1 }, { id: 'laptop', endedAt: 3 }], routines: [], goals: [] });
    laptop.write('chords.dots', 'fingers');
    await pass(60_000);

    const back = phone.restart(); // back online
    await back.sync.start();
    await pass(90_000);
    const ids = (value: unknown) => ((value as { journal: Array<{ id: string }> }).journal ?? []).map((e) => e.id).sort();
    expect(ids(phone.read('practice.data'))).toEqual(['a', 'laptop', 'phone']);
    expect(ids(laptop.read('practice.data'))).toEqual(['a', 'laptop', 'phone']);
    expect(phone.read('chords.dots')).toBe('fingers');
    expect(laptop.read('chords.dots')).toBe('fingers');
  });

  it('a reset on one device takes the synced data away on the other, but not what was never synced', async () => {
    const db = new FakeDb();
    const laptop = dataDevice(db, 'laptop');
    practise(laptop);
    laptop.write('practice.data', { v: 1, journal: [{ id: 'a', endedAt: 1 }], routines: [], goals: [] });
    await laptop.sync.start();
    await pass(200);
    const phone = dataDevice(db, 'phone');
    await phone.sync.start();
    await pass(200);
    expect(phone.read('practice.data')).not.toBeNull();
    phone.sync.stop();
    phone.write('tuner.tunings', [{ id: 'dadgad' }]); // made while offline: never synced
    const back = phone.restart();

    await pass(30_000);
    laptop.actions.resetProgress();
    laptop.kv.remove('practice.data');
    laptop.data.notice();
    await pass(60_000); // the reset reaches the cloud before the phone is back
    await back.sync.start();
    await pass(90_000);
    expect(phone.read('practice.data')).toBeNull();
    expect(phone.state().xp.total).toBe(0);
    expect(phone.read('tuner.tunings')).toEqual([{ id: 'dadgad' }]);
  });

  it('a cloud copy written by an older app, without the data, leaves the data alone and gets it back', async () => {
    const db = new FakeDb();
    const laptop = dataDevice(db, 'laptop');
    practise(laptop);
    laptop.write('metronome.settings', { bpm: 96 });
    await laptop.sync.start();
    await pass(200);
    await pass(30_000);
    // An older app on another device saves over it with progress only.
    const old = JSON.stringify({ ...laptop.store.exportData(), stamp: 'old-app' });
    const epoch = (db.docs.get(head()) as { epoch: number }).epoch;
    const written = db.doc(head()).set({ app: 'sixstring-academy', kind: 'progress-sync', v: 1, gen: 'oldapp1', stamp: 'old-app', epoch, at: Date.now(), chars: old.length, sum: checksum(old), parts: 0, body: old });
    await pass(100);
    await written;
    expect(remoteBody(db).data).toBeUndefined();
    await pass(60_000);
    expect(laptop.read('metronome.settings')).toEqual({ bpm: 96 });
    expect(remoteBody(db).data?.['metronome.settings']?.value).toEqual({ bpm: 96 });
  });
});

describe('the learner’s songs', () => {
  it('travel with their ids, one document each; an edit and a deletion travel too', async () => {
    const db = new FakeDb();
    const laptop = dataDevice(db, 'laptop');
    practise(laptop);
    const song = await laptop.lib.save(sixTab(ODE_TO_JOY));
    await laptop.sync.start();
    await pass(500);
    expect(db.docs.has(songDoc(song.id))).toBe(true);
    expect(remoteBody(db).songs).toMatchObject({ carried: true });
    expect(laptop.status().songs).toMatchObject({ synced: true, count: 1, reason: null });

    const phone = dataDevice(db, 'phone');
    await phone.sync.start();
    await pass(500);
    expect((await phone.lib.get(song.id))?.title).toBe('Ode to Joy');

    await pass(30_000);
    await phone.lib.update(song.id, { notes: 'Slow down in bar 3' });
    await pass(60_000);
    expect((await laptop.lib.get(song.id))?.notes).toBe('Slow down in bar 3');
    const songWrites = db.writes(/song\./).length;

    // Progress alone changing does not upload the songs again.
    practise(laptop);
    await pass(60_000);
    expect(db.writes(/song\./).length).toBe(songWrites);

    await laptop.lib.remove(song.id);
    await pass(60_000);
    expect(await phone.lib.get(song.id)).toBeNull();
    expect(db.docs.has(songDoc(song.id))).toBe(false);
  });

  it('songs that do not fit stay on each device, nothing is deleted, and the status says why', async () => {
    const db = new FakeDb();
    const laptop = dataDevice(db, 'laptop');
    practise(laptop);
    for (let i = 0; i <= SONG_SYNC_LIMITS.songs; i++) await laptop.lib.save(sixTab(ODE_TO_JOY));
    await laptop.sync.start();
    await pass(1000);
    expect(remoteBody(db).songs).toMatchObject({ carried: false, reason: 'count' });
    expect(db.writes(/song\./)).toEqual([]);
    expect(laptop.status().songs).toMatchObject({ synced: false, reason: 'count', count: SONG_SYNC_LIMITS.songs + 1 });

    const phone = dataDevice(db, 'phone');
    const own = await phone.lib.save(sixTab(CAMPFIRE_GROOVE));
    await phone.sync.start();
    await pass(1000);
    expect((await phone.lib.list({ scope: 'mine' })).map((s) => s.id)).toEqual([own.id]);
    expect(phone.status().songs).toMatchObject({ synced: false, reason: 'elsewhere' });
    expect((await laptop.lib.list({ scope: 'mine' })).length).toBe(SONG_SYNC_LIMITS.songs + 1);
  });
});

describe('song and data helpers', () => {
  it('songCarry names the limit a library goes over', () => {
    const songs = (n: number, bytes: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`my-s-${i}`, { bytes }]));
    expect(songCarry(songs(3, 10_000))).toEqual({ synced: true, count: 3, bytes: 30_000, reason: null });
    expect(songCarry(songs(SONG_SYNC_LIMITS.songs + 1, 10))).toMatchObject({ synced: false, reason: 'count' });
    expect(songCarry(songs(1, SONG_SYNC_LIMITS.songBytes + 1))).toMatchObject({ synced: false, reason: 'size' });
    expect(songCarry(songs(20, 150_000))).toMatchObject({ synced: false, reason: 'total' });
  });

  it('bodyKey ignores change times and bookkeeping, and sees data values and the song list', () => {
    const body = { state: { xp: { total: 1 }, meta: { rev: 1 } }, data: { 'chords.dots': { at: 5, value: 'notes' } }, songs: { carried: true, items: { 'my-a': { sum: 'x', bytes: 1, u: 1 } } } };
    const later = { ...body, state: { ...body.state, meta: { rev: 9 } }, data: { 'chords.dots': { at: 99, value: 'notes' } } };
    expect(bodyKey(later)).toBe(bodyKey(body));
    expect(bodyKey({ ...body, data: { 'chords.dots': { at: 5, value: 'fingers' } } })).not.toBe(bodyKey(body));
    expect(bodyKey({ ...body, songs: { carried: true, items: {} } })).not.toBe(bodyKey(body));
    expect(bodyKey({ ...body, songs: { carried: true, items: {} } }, false)).toBe(bodyKey(body, false));
  });
});
