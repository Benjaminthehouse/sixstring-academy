/**
 * Simulated devices for tests: each has its own progress store, learner data, (optionally) song
 * library, session storage and fake Supabase client, plus the real account layer and the real sync
 * engine, all on one shared fake server. Used by `account.test.ts` and `devices.test.ts`; not part
 * of the app.
 */
import { createActions, createProgressStore, memoryStorage, type ProgressActions, type ProgressStore } from '@/core/progress';
import { createLearnerData, memoryKv, type LearnerData } from '../storage-scope';
import { appDataPort, createCloudSync, type CloudSync, type SyncSongs, type SyncStatus, type SyncTimers } from '../sync';
import { createAccounts, type Accounts, type AccountState } from './account';
import type { CloudConfig } from './config';
import { supabaseDatabase } from './db';
import { createFakeClient, memoryTransport, type FakeSupabaseServer, type MemoryTransport } from './fake';
import type { AuthStorage, SupabaseLike } from './types';

/** The configuration a test copy runs with. */
export const TEST_CONFIG: CloudConfig = { url: 'https://fake.supabase.invalid', anonKey: 'fake-anon-key-for-unit-tests', fake: true };

const timers: SyncTimers = { set: (fn, ms) => setTimeout(fn, ms), clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>) };

const OFF: SyncStatus = { state: 'off', issue: 'signed-out', provider: null, message: '', lastSyncedAt: null, pending: false, songs: null };

/** What survives a page reload on one device. */
export interface DeviceStorage {
  session: AuthStorage & { map: Map<string, string> };
  kv: Map<string, string>;
  memory: { meta: unknown };
  store: ProgressStore;
  data: LearnerData;
  learnerKv: ReturnType<typeof memoryKv>;
  songs: SyncSongs | null;
  transport: MemoryTransport;
}

/** One simulated device. */
export interface TestDevice {
  name: string;
  server: FakeSupabaseServer;
  storage: DeviceStorage;
  client: SupabaseLike;
  accounts: Accounts;
  store: ProgressStore;
  actions: ProgressActions;
  data: LearnerData;
  transport: MemoryTransport;
  /** The current sync service (replaced on sign-in and sign-out). */
  sync(): CloudSync | null;
  status(): SyncStatus;
  account(): AccountState;
  /** A feature writes a learner key (and the tracker notices it). */
  write(key: string, value: unknown): void;
  read(key: string): unknown;
  /** Sign in by reading the code from the fake mailbox. */
  signIn(email: string): Promise<boolean>;
  /** The browser goes offline / online (tells the engine and the database, as the window events do). */
  goOffline(): void;
  goOnline(): void;
  /** The page became visible or got focus. */
  poke(): void;
  /** "Reload the page": new account layer, client and engine on the same storage. Call `start()` on it. */
  reload(): TestDevice;
  /** What the shell does at startup: start the sync service (which reads the account). */
  start(): Promise<void>;
  reloads: number;
  removals: number;
}

function sessionStore(): DeviceStorage['session'] {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

/** Wait for fake time to pass (the caller provides it, e.g. `vi.advanceTimersByTimeAsync`). */
export type Pass = (ms: number) => Promise<void>;

/** A new device (or, with `storage`, the same device after a reload). Call `start()` on it. */
export function testDevice(server: FakeSupabaseServer, name: string, options: { storage?: DeviceStorage; songs?: SyncSongs | null; config?: CloudConfig | null } = {}): TestDevice {
  const learnerKv = options.storage?.learnerKv ?? memoryKv();
  const storage: DeviceStorage = options.storage ?? {
    session: sessionStore(),
    kv: new Map(),
    memory: { meta: null },
    store: createProgressStore({ clock: { now: () => Date.now(), timeZone: 'UTC' }, storage: memoryStorage(), deviceId: name }),
    data: createLearnerData(learnerKv, () => Date.now()),
    learnerKv,
    songs: options.songs ?? null,
    transport: memoryTransport(server, { latencyMs: 10 }),
  };
  const transport = storage.transport;
  const client = createFakeClient(transport, { storage: storage.session });
  const port = appDataPort(storage.store, storage.data, storage.songs);
  // Each device its own repeatable random numbers: two real devices never share them, and save ids
  // made in the same (fake) millisecond must still differ.
  let seed = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 2147483647, 7) || 7;
  const random = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const onlineWatchers = new Set<() => void>();
  const pokes = new Set<() => void>();
  let current: CloudSync | null = null;

  const makeSync = (): CloudSync =>
    createCloudSync({
      host: () => 'standalone',
      accountsOffered: () => options.config !== null,
      account: () => accounts.link(),
      online: () => transport.online,
      watchOnline: (changed) => {
        onlineWatchers.add(changed);
        return () => onlineWatchers.delete(changed);
      },
      progress: () => port,
      loadMeta: () => storage.memory.meta,
      saveMeta: (meta) => {
        storage.memory.meta = JSON.parse(JSON.stringify(meta)) as unknown;
      },
      random,
    });

  const device: TestDevice = {
    name,
    server,
    storage,
    client,
    accounts: null as unknown as Accounts,
    store: storage.store,
    actions: createActions(() => storage.store),
    data: storage.data,
    transport,
    sync: () => current,
    status: () => current?.status() ?? OFF,
    account: () => device.accounts.state(),
    write(key, value) {
      storage.learnerKv.write(key, JSON.stringify(value));
      storage.data.notice();
    },
    read(key) {
      const raw = storage.learnerKv.read(key);
      return raw === null ? null : (JSON.parse(raw) as unknown);
    },
    async signIn(email) {
      const sent = await device.accounts.sendCode(email);
      if (!sent && device.account().phase !== 'code-sent') return false;
      return device.accounts.verifyCode(server.lastCode(email) ?? '');
    },
    goOffline() {
      transport.setOnline(false);
      for (const changed of [...onlineWatchers]) changed();
    },
    goOnline() {
      transport.setOnline(true);
      for (const changed of [...onlineWatchers]) changed();
      for (const poke of [...pokes]) poke();
    },
    poke() {
      for (const poke of [...pokes]) poke();
    },
    reload() {
      current?.stop();
      const next = testDevice(server, name, { storage, config: options.config });
      next.reloads = device.reloads;
      next.removals = device.removals;
      return next;
    },
    reloads: 0,
    removals: 0,
    async start() {
      await facade.restart();
    },
  };

  const facade = {
    async restart(): Promise<SyncStatus> {
      current?.stop();
      current = makeSync();
      return current.start();
    },
    stop() {
      current?.stop();
    },
    flush(): Promise<void> {
      return current ? current.flush() : Promise.resolve();
    },
    status: () => device.status(),
  };

  const accounts = createAccounts({
    config: () => (options.config === undefined ? TEST_CONFIG : options.config),
    unavailable: () => (options.config === null ? 'not-configured' : null),
    client: async () => client,
    sessionStorage: storage.session,
    kv: { read: (k) => storage.kv.get(k) ?? null, write: (k, v) => void storage.kv.set(k, v), remove: (k) => void storage.kv.delete(k) },
    database: (c, uid) =>
      supabaseDatabase(c, uid, {
        timers,
        watch: (poke) => {
          pokes.add(poke);
          return () => pokes.delete(poke);
        },
      }),
    sync: facade,
    forgetSync: () => {
      storage.memory.meta = null;
    },
    removeLocal: async () => {
      device.removals += 1;
      storage.store.dispatch({ type: 'reset', keepPrefs: false });
      for (const key of storage.data.keys(['learner'])) storage.data.remove(key);
    },
    reload: () => {
      device.reloads += 1;
    },
    now: () => Date.now(),
    online: () => transport.online,
    timers,
  });
  device.accounts = accounts;
  return device;
}
