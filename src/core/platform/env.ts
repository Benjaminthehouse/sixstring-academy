/**
 * Where the app is running. Two hosts are supported:
 *
 *  - "standalone": served from its own origin (localhost, or any HTTPS static host / installed PWA).
 *    Everything works, including microphone and camera.
 *  - "artifact": published as a Claude artifact. The viewer's frame refuses microphone and camera,
 *    downloads and print, and blocks every network request except files published with the page.
 *    In exchange it offers `window.claude` capabilities (ask Claude with images, per-user data).
 */
export type Host = 'standalone' | 'artifact';

interface ClaudeGlobal {
  use: (name: string) => Promise<unknown>;
}

function claudeGlobal(): ClaudeGlobal | null {
  const c = (globalThis as { claude?: ClaudeGlobal }).claude;
  return c && typeof c.use === 'function' ? c : null;
}

export function host(): Host {
  if (typeof __ARTIFACT__ !== 'undefined' && __ARTIFACT__) return 'artifact';
  return claudeGlobal() ? 'artifact' : 'standalone';
}

export const isArtifact = (): boolean => host() === 'artifact';

/**
 * Resolve an artifact runtime capability ("sample", "db", "user", "downloads", "tts"), or null when
 * it is not available (standalone host, not granted, timed out). Never throws.
 */
export async function claudeCapability<T = unknown>(name: string): Promise<T | null> {
  const c = claudeGlobal();
  if (!c) return null;
  try {
    return ((await c.use(name)) as T) ?? null;
  } catch {
    return null;
  }
}

/** getUserMedia needs a secure context (https or localhost). */
export function isSecureContextForMedia(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext === true && !!navigator.mediaDevices?.getUserMedia;
}

export function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}
