/**
 * Immersive screens: while the learner is inside a lesson, a song, the camera or a game, the
 * navigation gets out of the way.
 *
 *   focus  phones lose the tab bar and the top bar shrinks to a back button and the title;
 *          wide screens fold the sidebar to an icon rail.
 *   bare   as focus, and the phone top bar goes too. The screen must offer its own way out.
 *   none   full navigation, even on a route that is immersive by default.
 *
 * A small registry names the routes that are immersive by default; any component can ask for more
 * (or less) with `useImmersive()` while it is mounted. A request from a component always wins over
 * the registry.
 */
import { useEffect, useSyncExternalStore } from 'react';

/** How far the navigation steps back. */
export type ImmersiveLevel = 'none' | 'focus' | 'bare';

type Rule = (params: readonly string[]) => ImmersiveLevel;

/**
 * Routes that are immersive without asking: the player and the camera always, the lesson runners
 * and the games once a lesson or game is open (they are params of their feature).
 */
export const IMMERSIVE_ROUTES: Readonly<Record<string, Rule>> = {
  play: () => 'focus',
  camera: () => 'focus',
  learn: (params) => (params.length >= 2 ? 'focus' : 'none'),
  teachers: (params) => (params.length >= 2 ? 'focus' : 'none'),
  arcade: (params) => (params.length >= 1 ? 'focus' : 'none'),
};

const RANK: Record<ImmersiveLevel, number> = { none: 0, focus: 1, bare: 2 };

/** The stronger of two levels. */
export function strongerLevel(a: ImmersiveLevel, b: ImmersiveLevel): ImmersiveLevel {
  return RANK[b] > RANK[a] ? b : a;
}

/** What the registry says about a route. */
export function routeImmersion(name: string, params: readonly string[]): ImmersiveLevel {
  const rule = Object.prototype.hasOwnProperty.call(IMMERSIVE_ROUTES, name) ? IMMERSIVE_ROUTES[name] : undefined;
  return rule ? rule(params) : 'none';
}

/** The level the shell applies: the strongest live request, or the registry when nobody asked. */
export function resolveImmersion(requested: ImmersiveLevel | null, name: string, params: readonly string[]): ImmersiveLevel {
  return requested ?? routeImmersion(name, params);
}

// --- live requests ---------------------------------------------------------------------------

const requests = new Map<symbol, ImmersiveLevel>();
const listeners = new Set<() => void>();
let current: ImmersiveLevel | null = null;

function recompute(): void {
  let next: ImmersiveLevel | null = null;
  for (const level of requests.values()) next = next === null ? level : strongerLevel(next, level);
  if (next === current) return;
  current = next;
  for (const listener of [...listeners]) listener();
}

/**
 * Ask for an immersion level from outside React. Returns the function that withdraws the request.
 * Prefer `useImmersive` in components.
 */
export function requestImmersive(level: ImmersiveLevel = 'focus'): () => void {
  const token = Symbol('immersive');
  requests.set(token, level);
  recompute();
  return () => {
    if (requests.delete(token)) recompute();
  };
}

/** The strongest live request, or null when no component asked. */
export function requestedImmersion(): ImmersiveLevel | null {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Make the screen immersive while this component is mounted and `active` is true.
 *   useImmersive();                 // lesson runner, game round, play-along
 *   useImmersive(playing);          // only while the song is running
 *   useImmersive(true, 'bare');     // the screen draws its own header and exit
 *   useImmersive(true, 'none');     // keep the full navigation on a route that hides it by default
 */
export function useImmersive(active: boolean = true, level: ImmersiveLevel = 'focus'): void {
  useEffect(() => {
    if (!active) return undefined;
    return requestImmersive(level);
  }, [active, level]);
}

/** Shell side: the level in effect for the current route. Re-renders when a request changes. */
export function useImmersion(name: string, params: readonly string[]): ImmersiveLevel {
  const requested = useSyncExternalStore(subscribe, requestedImmersion, () => null);
  return resolveImmersion(requested, name, params);
}
