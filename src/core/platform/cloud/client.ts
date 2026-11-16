/**
 * The Supabase client, loaded on demand (it is a large module and most copies never need it).
 *
 * The session lives in platform storage under `sync.auth.*`, a key class that is never in a
 * backup, never synced, and kept by a reset (`storage-scope.ts`: `sync.*` is "device"). The
 * client refreshes the access token by itself and keeps the session through an offline start.
 * Nothing here logs: tokens never reach the console.
 */
import { readRaw, remove, writeRaw } from '../storage';
import type { CloudConfig } from './config';
import type { AuthStorage, SupabaseLike } from './types';

/** Where the session is kept: `sync.auth.session` (plus the client's own helper keys beside it). */
export const AUTH_STORAGE_PREFIX = 'sync.auth.';
/** The client's `storageKey`. */
export const AUTH_STORAGE_KEY = 'session';

/** The session store on platform storage. */
export function authStorage(): AuthStorage {
  return {
    getItem: (key) => readRaw(AUTH_STORAGE_PREFIX + key),
    setItem: (key, value) => {
      writeRaw(AUTH_STORAGE_PREFIX + key, value);
    },
    removeItem: (key) => remove(AUTH_STORAGE_PREFIX + key),
  };
}

/**
 * Who the stored session belongs to, read without the client (for an offline start, before the
 * client has loaded). Only the id and the email are read; the tokens are left alone.
 */
export function storedSessionUser(storage: AuthStorage = authStorage()): { id: string; email: string | null } | null {
  try {
    const raw = storage.getItem(AUTH_STORAGE_KEY);
    const value = raw ? (JSON.parse(raw) as { user?: { id?: unknown; email?: unknown }; refresh_token?: unknown }) : null;
    const user = value?.user;
    if (!user || typeof user.id !== 'string' || typeof value.refresh_token !== 'string') return null;
    return { id: user.id, email: typeof user.email === 'string' ? user.email : null };
  } catch {
    return null;
  }
}

let loading: { config: CloudConfig; client: Promise<SupabaseLike> } | null = null;

/** The client for this copy's project (one per page). Rejects only when the module cannot load. */
export function loadSupabase(config: CloudConfig): Promise<SupabaseLike> {
  if (loading && loading.config === config) return loading.client;
  const client = (async (): Promise<SupabaseLike> => {
    // Browser checks: a stand-in backend the check exposes (development builds only).
    if (import.meta.env.DEV && config.fake && typeof window !== 'undefined' && typeof window.__ssaCloudFake === 'function') {
      const fake = await import('./fake');
      return fake.createFakeClient(fake.bindingTransport(window.__ssaCloudFake), { storage: authStorage(), storageKey: AUTH_STORAGE_KEY });
    }
    const { createClient } = await import('@supabase/supabase-js');
    const real = createClient(config.url, config.anonKey, {
      auth: {
        storage: authStorage(),
        storageKey: AUTH_STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: true,
        // Sign-in is by a typed code, never a link: nothing to read from the address.
        detectSessionInUrl: false,
        debug: false,
      },
    });
    return real as unknown as SupabaseLike;
  })();
  loading = { config, client };
  client.catch(() => {
    if (loading?.client === client) loading = null; // a failed load (offline first visit) may be retried
  });
  return client;
}
