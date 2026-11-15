/**
 * A small seeded random generator. Every question is built from one seed, so a round can be
 * replayed exactly (tests, bug reports) and the sound always matches the answer it was graded on.
 */

/** Deterministic random helpers over one 32-bit seed (mulberry32). */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Integer in [lo, hi], both ends included. */
  int(lo: number, hi: number): number;
  /** One element of a non-empty list. */
  pick<T>(items: readonly T[]): T;
  /** A shuffled copy. */
  shuffle<T>(items: readonly T[]): T[];
  /** True with probability `p` (default one half). */
  chance(p?: number): boolean;
  /** An element chosen with probability proportional to its weight (weights ≥ 0). */
  weighted<T>(items: readonly T[], weights: readonly number[]): T;
}

/** Create a generator from a seed (any finite number; it is folded to 32 bits). */
export function makeRng(seed: number): Rng {
  let s = Math.floor(Number.isFinite(seed) ? seed : 0) >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number): number => {
    const a = Math.ceil(Math.min(lo, hi));
    const b = Math.floor(Math.max(lo, hi));
    return a + Math.floor(next() * (b - a + 1));
  };
  return {
    next,
    int,
    pick: (items) => items[Math.floor(next() * items.length)],
    shuffle: (items) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    chance: (p = 0.5) => next() < p,
    weighted: (items, weights) => {
      let total = 0;
      for (let i = 0; i < items.length; i++) total += Math.max(0, weights[i] ?? 0);
      if (!(total > 0)) return items[Math.floor(next() * items.length)];
      let r = next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= Math.max(0, weights[i] ?? 0);
        if (r < 0) return items[i];
      }
      return items[items.length - 1];
    },
  };
}

/** Mix several numbers into one 32-bit seed (FNV-1a over their bits). */
export function mixSeed(...parts: Array<number | string>): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const text = String(part);
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= 0x2c;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
