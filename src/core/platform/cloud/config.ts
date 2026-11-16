/**
 * Whether this copy of the app offers accounts, and where its Supabase project is.
 *
 * The project URL and the anon (public) key are build-time variables, `VITE_SUPABASE_URL` and
 * `VITE_SUPABASE_ANON_KEY` (on Netlify: Site configuration > Environment variables, then redeploy).
 * The anon key is public by design: row-level security in `supabase/schema.sql` is what keeps one
 * learner's rows from every other. Without both variables (local development, tests, a copy
 * someone built for themselves) accounts are simply not offered and everything stays on the
 * device. Inside a Claude artifact the viewer's own sync is used instead and the network is closed.
 *
 * Browser checks use a stand-in backend: a development build that finds `window.__ssaCloudFake`
 * (a function the check exposes) talks to it instead of Supabase. Production builds leave that
 * path out entirely.
 */
import { host } from '../env';

/** Where accounts live for this copy of the app. */
export interface CloudConfig {
  url: string;
  anonKey: string;
  /** A stand-in backend for browser checks (development builds only). */
  fake: boolean;
}

/**
 * Why accounts are not offered here. `secret-key`: the build was given a secret key (the
 * `service_role` key, or an `sb_secret_` key) instead of the anon public one; it is never used.
 */
export type CloudUnavailable = 'artifact' | 'not-configured' | 'misconfigured' | 'secret-key';

/** The function a browser check exposes to stand in for Supabase: one JSON request in, one JSON answer out. */
export type CloudFakeBinding = (request: string) => Promise<string>;

declare global {
  interface Window {
    /** Set by browser checks only (see `fake.ts`). */
    __ssaCloudFake?: CloudFakeBinding;
  }
}

/** What `readCloudConfig` looks at. */
export interface CloudEnv {
  url: unknown;
  anonKey: unknown;
  artifact: boolean;
  /** A browser check's stand-in backend is present (and this is a development build). */
  fake: boolean;
}

const FAKE: CloudConfig = { url: 'https://fake.supabase.invalid', anonKey: 'fake-anon-key-for-browser-checks', fake: true };

function cleanUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/\/+$/, '');
  try {
    const url = new URL(text);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    // A Supabase project is served over HTTPS; plain http only for a project running on this computer.
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    // The Project URL is the bare address; `.../rest/v1` (shown beside it in some dashboards) is not.
    if (url.pathname !== '/' && url.pathname !== '') return null;
    return text;
  } catch {
    return null;
  }
}

function cleanKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const key = value.trim();
  return key.length >= 20 && !/\s/.test(key) ? key : null;
}

/** The `role` a legacy Supabase key (a JWT) claims, or null when it is not one. */
function jwtRole(key: string): string | null {
  const part = key.split('.')[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const payload = JSON.parse(atob(base64)) as { role?: unknown };
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

/**
 * True for a key that must never be in a web page: it skips row-level security, so anyone who
 * opens the page could read and change every learner's rows.
 */
export function isSecretKey(key: string): boolean {
  return /^sb_secret_/i.test(key) || jwtRole(key) === 'service_role';
}

/** The configuration, or why there is none. Pure, for tests. */
export function readCloudConfig(env: CloudEnv): { config: CloudConfig; reason: null } | { config: null; reason: CloudUnavailable } {
  if (env.artifact) return { config: null, reason: 'artifact' };
  if (env.fake) return { config: FAKE, reason: null };
  const given = (typeof env.url === 'string' && env.url.trim() !== '') || (typeof env.anonKey === 'string' && env.anonKey.trim() !== '');
  if (!given) return { config: null, reason: 'not-configured' };
  const url = cleanUrl(env.url);
  const anonKey = cleanKey(env.anonKey);
  if (anonKey && isSecretKey(anonKey)) return { config: null, reason: 'secret-key' };
  if (!url || !anonKey) return { config: null, reason: 'misconfigured' };
  return { config: { url, anonKey, fake: false }, reason: null };
}

function currentEnv(): CloudEnv {
  const vars = import.meta.env as Record<string, unknown>;
  return {
    url: vars.VITE_SUPABASE_URL,
    anonKey: vars.VITE_SUPABASE_ANON_KEY,
    artifact: host() === 'artifact',
    fake: import.meta.env.DEV && typeof window !== 'undefined' && typeof window.__ssaCloudFake === 'function',
  };
}

let cached: ReturnType<typeof readCloudConfig> | null = null;

/** This copy's accounts configuration, or null when accounts are not offered. */
export function cloudConfig(): CloudConfig | null {
  cached ??= readCloudConfig(currentEnv());
  return cached.config;
}

/** Why accounts are not offered (null when they are). */
export function cloudUnavailableReason(): CloudUnavailable | null {
  cached ??= readCloudConfig(currentEnv());
  return cached.reason;
}

/** True when this copy offers accounts (sign in with an email code, sync between devices). */
export function accountsOffered(): boolean {
  return cloudConfig() !== null;
}
