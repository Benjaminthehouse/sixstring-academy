/** A small seeded random generator (mulberry32), so rounds can be replayed in tests. */

/** Deterministic random helpers over one 32-bit seed. */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** One element of a non-empty list. */
  pick<T>(items: readonly T[]): T;
  /** An element chosen with probability proportional to its weight (weights ≥ 0; all zero = uniform). */
  weighted<T>(items: readonly T[], weights: readonly number[]): T;
  /** True with probability `p` (default one half). */
  chance(p?: number): boolean;
}

/** A generator from a seed (any number; folded to 32 bits). */
export function makeRng(seed: number): Rng {
  let s = Math.floor(Number.isFinite(seed) ? seed : 0) >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    pick: (items) => items[Math.floor(next() * items.length)],
    chance: (p = 0.5) => next() < p,
    weighted: (items, weights) => {
      let total = 0;
      for (const w of weights) total += w > 0 && Number.isFinite(w) ? w : 0;
      if (total <= 0) return items[Math.floor(next() * items.length)];
      let r = next() * total;
      for (let i = 0; i < items.length; i++) {
        const w = weights[i] > 0 && Number.isFinite(weights[i]) ? weights[i] : 0;
        if (r < w) return items[i];
        r -= w;
      }
      return items[items.length - 1];
    },
  };
}

/** A fresh seed for a new round. */
export function freshSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}
