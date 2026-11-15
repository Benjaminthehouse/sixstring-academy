/** One piece of confetti. Positions and sizes are in CSS pixels; angles in radians. */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  /** Index into the palette. */
  color: number;
  /** 0 = rectangle, 1 = circle, 2 = pick (rounded triangle). */
  shape: 0 | 1 | 2;
  rotation: number;
  spin: number;
  /** Phase of the side-to-side flutter. */
  wobble: number;
  /** Seconds lived. */
  age: number;
  /** Seconds until it fades out completely. */
  life: number;
}

/** A source of numbers in [0, 1). */
export type Rng = () => number;

/** Small deterministic generator (mulberry32) so bursts can be reproduced in tests. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Options for one burst. */
export interface BurstOptions {
  count: number;
  /** Launch point in pixels. */
  x: number;
  y: number;
  /** Number of colours available. */
  colors: number;
  /** Launch speed in px/s. Default 1400 (the fastest pieces climb about 500 px). Roughly twice the area's height fills it. */
  power?: number;
  /** Half-width of the launch cone in radians, centred on straight up. Default ~1.15 (a wide fan). */
  spread?: number;
  rng?: Rng;
}

/** Create the particles of one upward burst. */
export function createBurst(options: BurstOptions): Particle[] {
  const { count, x, y, colors, power = 1400, spread = 1.15, rng = Math.random } = options;
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (rng() * 2 - 1) * spread;
    const speed = power * (0.45 + rng() * 0.75);
    out.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 6 + rng() * 6,
      color: Math.floor(rng() * Math.max(1, colors)),
      shape: (Math.floor(rng() * 3) as 0 | 1 | 2),
      rotation: rng() * Math.PI * 2,
      spin: (rng() * 2 - 1) * 9,
      wobble: rng() * Math.PI * 2,
      age: 0,
      life: 1.6 + rng() * 1.2,
    });
  }
  return out;
}

const GRAVITY = 1150;
const DRAG = 1.6;

/**
 * Advance the simulation by `dt` seconds, in place. Returns the particles still alive: those that
 * have not outlived their life and have not fallen below `floorY`.
 */
export function stepParticles(particles: Particle[], dt: number, floorY: number): Particle[] {
  const alive: Particle[] = [];
  const damp = Math.exp(-DRAG * dt);
  for (const p of particles) {
    p.age += dt;
    if (p.age >= p.life) continue;
    p.vx *= damp;
    p.vy = p.vy * damp + GRAVITY * dt;
    p.wobble += dt * 7;
    p.x += (p.vx + Math.sin(p.wobble) * 40) * dt;
    p.y += p.vy * dt;
    p.rotation += p.spin * dt;
    if (p.y - p.size > floorY) continue;
    alive.push(p);
  }
  return alive;
}

/** How high (px) a piece launched straight up at `speed` px/s climbs before gravity and drag stop it. */
export function riseHeight(speed: number): number {
  let vy = -Math.max(0, speed);
  let y = 0;
  const dt = 1 / 120;
  const damp = Math.exp(-DRAG * dt);
  // Same integration as stepParticles, without the flutter, until the piece starts to fall.
  for (let i = 0; i < 1200 && vy < 0; i++) {
    vy = vy * damp + GRAVITY * dt;
    y += vy * dt;
  }
  return Math.max(0, -y);
}

/**
 * Launch power for `createBurst` so that the fastest pieces peak about `targetRise` px above the
 * launch point (they leave at up to 1.2 x power). Lets one burst fill a small card or a whole screen.
 */
export function launchPowerFor(targetRise: number): number {
  let lo = 0;
  let hi = 6000;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (riseHeight(mid * 1.2) < targetRise) lo = mid;
    else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

/** Opacity of a particle: fully visible, then fading over the last 30% of its life. */
export function particleAlpha(p: Particle): number {
  const t = p.age / p.life;
  return t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3);
}

/** Particle counts for the named intensities. */
export const BURST_COUNTS = { low: 36, medium: 80, high: 150 } as const;
