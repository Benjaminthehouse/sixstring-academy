/**
 * A small seeded random number generator. Everything random in the lesson engine (generated
 * exercises, shuffled options, sampled drills) draws from one of these, so a seed always gives the
 * same result: tests can pin it and a saved session restores exactly.
 */

/** A deterministic random source. */
export interface Rng {
  /** A float in [0, 1). */
  next(): number;
  /** An integer in [0, n). */
  int(n: number): number;
  /** An integer in [min, max], both inclusive. */
  range(min: number, max: number): number;
  /** One element of a non-empty list. */
  pick<T>(list: readonly T[]): T;
  /** True with probability `p` (default one half). */
  chance(p?: number): boolean;
  /** A shuffled copy. */
  shuffle<T>(list: readonly T[]): T[];
  /** `count` different elements, in random order (fewer when the list is shorter). */
  sample<T>(list: readonly T[], count: number): T[];
}

/** FNV-1a over the text form of the parts: a stable 32-bit seed from ids and numbers. */
export function hashSeed(...parts: ReadonlyArray<string | number>): number {
  let h = 0x811c9dc5;
  const text = parts.join('\u0001');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A generator for a seed (mulberry32: tiny, fast and well distributed for this purpose). */
export function createRng(seed: number): Rng {
  let a = (Number.isFinite(seed) ? Math.floor(seed) : 0) >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number): number => (n <= 1 ? 0 : Math.floor(next() * n));
  const shuffle = <T>(list: readonly T[]): T[] => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  return {
    next,
    int,
    range: (min, max) => min + int(Math.max(0, max - min) + 1),
    pick: (list) => {
      if (list.length === 0) throw new RangeError('Cannot pick from an empty list');
      return list[int(list.length)];
    },
    chance: (p = 0.5) => next() < p,
    shuffle,
    sample: (list, count) => shuffle(list).slice(0, Math.max(0, count)),
  };
}

/**
 * A shuffle that is guaranteed not to return the original order (when the list has two or more
 * different positions): an "arrange these" exercise must never arrive already solved.
 */
export function shuffleAway<T>(list: readonly T[], rng: Rng, same: (a: T, b: T) => boolean = Object.is): T[] {
  const inOrder = (candidate: readonly T[]): boolean => candidate.every((item, i) => same(item, list[i]));
  if (list.length < 2 || list.every((item) => same(item, list[0]))) return [...list];
  for (let attempt = 0; attempt < 8; attempt++) {
    const out = rng.shuffle(list);
    if (!inOrder(out)) return out;
  }
  // Rotating by one always changes the order of a list that is not all one value.
  return [...list.slice(1), list[0]];
}
