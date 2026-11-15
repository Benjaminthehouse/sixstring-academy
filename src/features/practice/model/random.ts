/**
 * Small deterministic randomness: the plan for a day must be the same every time the screen opens
 * (so a reload never reshuffles it) and different from one day to the next.
 */

/** A 32-bit FNV-1a hash of a string. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A seeded generator of numbers in [0, 1) (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick an index with probability proportional to its weight (non-positive weights are never picked). */
export function weightedIndex(weights: readonly number[], random: () => number): number {
  let total = 0;
  for (const w of weights) if (w > 0) total += w;
  if (total <= 0) return -1;
  let r = random() * total;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i];
    if (w <= 0) continue;
    if (r < w) return i;
    r -= w;
  }
  for (let i = weights.length - 1; i >= 0; i--) if (weights[i] > 0) return i;
  return -1;
}

/** A short random id (no crypto needed: ids only have to be unique on this device). */
export function makeId(prefix = ''): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
