import { describe, expect, it } from 'vitest';
import { BURST_COUNTS, createBurst, launchPowerFor, particleAlpha, riseHeight, seededRng, stepParticles } from './confetti';
import { countdownLabelSeconds } from './CountdownRing';

describe('confetti simulation', () => {
  it('seededRng is deterministic and in range', () => {
    const a = seededRng(42);
    const b = seededRng(42);
    const c = seededRng(43);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    const seqC = Array.from({ length: 20 }, () => c());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('creates the requested burst, launched upwards from the origin', () => {
    const burst = createBurst({ count: BURST_COUNTS.medium, x: 200, y: 600, colors: 8, rng: seededRng(7) });
    expect(burst).toHaveLength(80);
    for (const p of burst) {
      expect(p.x).toBe(200);
      expect(p.y).toBe(600);
      expect(p.vy).toBeLessThan(0);
      expect(p.color).toBeGreaterThanOrEqual(0);
      expect(p.color).toBeLessThan(8);
      expect([0, 1, 2]).toContain(p.shape);
      expect(p.life).toBeGreaterThan(1.5);
    }
    // A fan, not a column: some go left and some go right.
    expect(burst.some((p) => p.vx < 0)).toBe(true);
    expect(burst.some((p) => p.vx > 0)).toBe(true);
  });

  it('is reproducible with the same seed', () => {
    const a = createBurst({ count: 10, x: 0, y: 0, colors: 3, rng: seededRng(1) });
    const b = createBurst({ count: 10, x: 0, y: 0, colors: 3, rng: seededRng(1) });
    expect(a).toEqual(b);
  });

  it('rises, falls back under gravity, and every piece is gone within a few seconds', () => {
    let particles = createBurst({ count: 60, x: 300, y: 700, colors: 8, power: 1400, rng: seededRng(3) });
    let highest = 700;
    let frames = 0;
    while (particles.length > 0 && frames < 60 * 10) {
      particles = stepParticles(particles, 1 / 60, 800);
      for (const p of particles) highest = Math.min(highest, p.y);
      frames += 1;
    }
    expect(particles).toHaveLength(0);
    // The fastest pieces climb roughly 500 px before gravity wins.
    expect(highest).toBeLessThan(350);
    expect(highest).toBeGreaterThan(100);
    expect(frames).toBeLessThan(60 * 4);
  });

  it('drops particles that fall below the floor', () => {
    const [p] = createBurst({ count: 1, x: 0, y: 0, colors: 1, rng: seededRng(9) });
    p.y = 1000;
    p.vy = 100;
    expect(stepParticles([p], 1 / 60, 500)).toHaveLength(0);
  });

  it('a zero-length step changes nothing', () => {
    const burst = createBurst({ count: 5, x: 10, y: 10, colors: 2, rng: seededRng(5) });
    const before = JSON.stringify(burst);
    expect(stepParticles(burst, 0, 1000)).toHaveLength(5);
    expect(JSON.stringify(burst)).toBe(before);
  });

  it('fades out over the last part of its life', () => {
    const [p] = createBurst({ count: 1, x: 0, y: 0, colors: 1, rng: seededRng(2) });
    p.life = 2;
    p.age = 0.5;
    expect(particleAlpha(p)).toBe(1);
    p.age = 1.7;
    expect(particleAlpha(p)).toBeCloseTo(0.5, 5);
    p.age = 2;
    expect(particleAlpha(p)).toBe(0);
  });
});

describe('launch power', () => {
  it('riseHeight grows with speed and is zero at rest', () => {
    expect(riseHeight(0)).toBe(0);
    expect(riseHeight(500)).toBeGreaterThan(riseHeight(250));
    // Drag makes the climb shorter than the drag-free v^2 / 2g.
    expect(riseHeight(1000)).toBeLessThan((1000 * 1000) / (2 * 1150));
    expect(riseHeight(1000)).toBeGreaterThan(150);
  });

  it('launchPowerFor makes the fastest pieces peak near the target, for small and large areas', () => {
    for (const target of [120, 300, 600, 900]) {
      const power = launchPowerFor(target);
      expect(Math.abs(riseHeight(power * 1.2) - target)).toBeLessThan(target * 0.03 + 2);
    }
    expect(launchPowerFor(600)).toBeGreaterThan(launchPowerFor(150));
  });

  it('a burst launched with that power actually reaches the target height in the simulation', () => {
    const target = 400;
    let particles = createBurst({ count: 400, x: 0, y: 0, colors: 1, power: launchPowerFor(target), spread: 0.05, rng: seededRng(11) });
    let highest = 0;
    for (let i = 0; i < 600 && particles.length; i++) {
      particles = stepParticles(particles, 1 / 120, 10_000);
      for (const p of particles) highest = Math.min(highest, p.y);
    }
    expect(-highest).toBeGreaterThan(target * 0.85);
    expect(-highest).toBeLessThan(target * 1.1);
  });
});

describe('countdownLabelSeconds', () => {
  it('shows the full number at the start and 0 only at the end', () => {
    expect(countdownLabelSeconds(10_000)).toBe(10);
    expect(countdownLabelSeconds(9_999)).toBe(10);
    expect(countdownLabelSeconds(9_000)).toBe(9);
    expect(countdownLabelSeconds(1)).toBe(1);
    expect(countdownLabelSeconds(0)).toBe(0);
    expect(countdownLabelSeconds(-50)).toBe(0);
  });
});
