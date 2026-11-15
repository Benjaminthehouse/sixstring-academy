/**
 * Seeded randomness and procedural noise for the scene renderer. Nothing here (or anywhere in
 * `testing/`) may call `Math.random`: every frame must be reproducible from its seed.
 */

/** Mix two 32-bit integers into one well-scrambled 32-bit integer. */
export function mix32(a: number, b: number): number {
  let h = (a ^ Math.imul(b, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** 32-bit FNV-1a hash of a string. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Seeded generator with the helpers scene sampling needs. */
export class Rng {
  private state: number;
  private readonly origin: number;

  constructor(seed: number) {
    this.origin = seed >>> 0;
    this.state = mix32(seed >>> 0, 0x1234567);
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform in [lo, hi). */
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }

  /** Uniform integer in [lo, hi] (inclusive). */
  int(lo: number, hi: number): number {
    return lo + Math.min(hi - lo, Math.floor(this.next() * (hi - lo + 1)));
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** One element of a non-empty list. */
  pick<T>(items: readonly T[]): T {
    return items[Math.min(items.length - 1, Math.floor(this.next() * items.length))];
  }

  /** One element chosen with the given relative weights. */
  weighted<T>(items: readonly (readonly [T, number])[]): T {
    let total = 0;
    for (const [, w] of items) total += w;
    let r = this.next() * total;
    for (const [item, w] of items) {
      r -= w;
      if (r < 0) return item;
    }
    return items[items.length - 1][0];
  }

  /** Standard normal deviate. */
  gauss(): number {
    return Math.sqrt(-2 * Math.log(1 - this.next())) * Math.cos(2 * Math.PI * this.next());
  }

  /** A 32-bit integer, for seeding other things. */
  seed(): number {
    return Math.floor(this.next() * 4294967296) >>> 0;
  }

  /**
   * An independent stream named by `label`. It depends only on this generator's ORIGINAL seed and
   * the label, not on how many numbers were drawn, so adding a parameter to one part of a scene
   * never reshuffles the others.
   */
  fork(label: string): Rng {
    return new Rng(mix32(this.origin, hashString(label)));
  }
}

/** Hash of integer lattice coordinates to [0, 1). */
export function hash2(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1) ^ seed) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1) with unit lattice spacing. */
export function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Two octaves of value noise in [0, 1): cheap fractal texture for wood, cloth and walls. */
export function fbm2(x: number, y: number, seed: number): number {
  return (valueNoise(x, y, seed) * 2 + valueNoise(x * 2.03 + 11.5, y * 2.03 - 7.25, seed ^ 0x5bd1e995)) / 3;
}

/** Clamp to [0, 1]. */
export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Hermite smoothstep between two edges. */
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
