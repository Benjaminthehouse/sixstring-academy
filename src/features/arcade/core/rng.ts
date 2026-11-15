/**
 * Seeded randomness for round generators. Every round is a pure function of its seed, so a round
 * can be replayed, tested and shared (the daily challenge is the same for everyone on a day).
 */

/** A source of numbers in [0, 1). */
export type Rng = () => number;

/** mulberry32: small, fast and good enough for shuffling notes. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A 32-bit hash of a string (FNV-1a), for seeds made of words: `hashSeed('2026-11-15:a-minor')`. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** An integer in [0, n). */
export function randInt(rng: Rng, n: number): number {
  return Math.min(n - 1, Math.floor(rng() * n));
}

/** One element of a non-empty list. */
export function pick<T>(rng: Rng, list: readonly T[]): T {
  return list[randInt(rng, list.length)];
}

/** A shuffled copy (Fisher–Yates). */
export function shuffle<T>(rng: Rng, list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * `count` items drawn from `pool` in a fair rotation: every item comes up once before any comes up
 * again, and an item never follows one that is `same` as it (when the pool allows that).
 */
export function rotation<T>(rng: Rng, pool: readonly T[], count: number, same: (a: T, b: T) => boolean = Object.is): T[] {
  const out: T[] = [];
  if (pool.length === 0) return out;
  let bag: T[] = [];
  while (out.length < count) {
    if (bag.length === 0) bag = shuffle(rng, pool);
    const last = out[out.length - 1];
    const i = out.length === 0 ? 0 : bag.findIndex((x) => !same(x, last));
    if (i >= 0) {
      out.push(bag.splice(i, 1)[0]);
      continue;
    }
    // Everything left in this bag repeats the last item: open the next bag early and keep the
    // leftovers for later, so the rotation stays fair.
    const fresh = shuffle(rng, pool);
    const j = fresh.findIndex((x) => !same(x, last));
    if (j < 0) {
      out.push(bag.shift() as T);
      continue;
    }
    out.push(fresh[j]);
    bag = [...bag, ...fresh.filter((_, k) => k !== j)];
  }
  return out;
}

/** A fresh seed for an ordinary round (not reproducible on purpose). */
export function freshSeed(): number {
  return (Math.floor(Math.random() * 0xffffffff) ^ Date.now()) >>> 0;
}
