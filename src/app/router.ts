/**
 * Hash router. The whole app is one page; a route is `#name` or `#name--param--param`.
 *
 * Why this shape: the app must also run inside a Claude artifact, whose host only passes a plain
 * `#name` (ASCII letters, digits, hyphens) between the address bar and the page. So no `#/path`,
 * no query strings, no pushState. Params are slug-safe ids joined by a double hyphen.
 */
import { useSyncExternalStore } from 'react';

export interface Route {
  /** Route name, e.g. "tuner". Lowercase letters, digits, single hyphens. */
  name: string;
  /** Slug-safe params, e.g. ["greensleeves"] for `#play--greensleeves`. */
  params: string[];
}

export const DEFAULT_ROUTE = 'home';
const SEP = '--';
const SAFE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Make any id safe to use as a route param (lowercase, hyphenated, no double hyphens). */
export function slug(input: string): string {
  return input
    .toLowerCase()
    .replace(/#/g, '-sharp')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '').trim().toLowerCase();
  if (!raw) return { name: DEFAULT_ROUTE, params: [] };
  const [name, ...params] = raw.split(SEP);
  if (!SAFE.test(name)) return { name: DEFAULT_ROUTE, params: [] };
  return { name, params: params.filter((p) => SAFE.test(p)) };
}

export function formatHash(name: string, ...params: Array<string | undefined>): string {
  const parts = [name, ...params.filter((p): p is string => !!p).map(slug)];
  return '#' + parts.join(SEP);
}

/** Use for `<a href>` so links are real links (middle-click, long-press, screen readers). */
export const href = formatHash;

export function navigate(name: string, ...params: Array<string | undefined>): void {
  const next = formatHash(name, ...params);
  if (window.location.hash === next) return;
  window.location.hash = next;
}

/** Replace the current history entry instead of pushing (for redirects). */
export function redirect(name: string, ...params: Array<string | undefined>): void {
  const next = formatHash(name, ...params);
  const url = window.location.pathname + window.location.search + next;
  window.history.replaceState(null, '', url);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function back(fallback: string = DEFAULT_ROUTE): void {
  if (window.history.length > 1) window.history.back();
  else navigate(fallback);
}

function subscribe(cb: () => void): () => void {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}
const getSnapshot = () => window.location.hash;

let cachedHash = '\u0000';
let cachedRoute: Route = { name: DEFAULT_ROUTE, params: [] };

export function currentRoute(): Route {
  const h = typeof window === 'undefined' ? '' : window.location.hash;
  if (h !== cachedHash) {
    cachedHash = h;
    cachedRoute = parseHash(h);
  }
  return cachedRoute;
}

/** Re-renders when the route changes. */
export function useRoute(): Route {
  useSyncExternalStore(subscribe, getSnapshot, () => '');
  return currentRoute();
}
