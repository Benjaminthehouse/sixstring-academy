import { describe, expect, it } from 'vitest';
import { createRng } from '../geometry';
import { FRET_RATIO, fitFretPattern, fretIndexAt, fretU, type FretCandidate } from './fretfit';

/** Image positions of frets under a 1-D projective view: scale in px per scale length, `persp` = C of the map. */
function comb(frets: number[], scale: number, offset: number, persp: number, reversed = false): number[] {
  return frets.map((n) => {
    const x = 1 - Math.pow(FRET_RATIO, n);
    const u = (scale * x + offset) / (persp * x + 1);
    return reversed ? 1000 - u : u;
  });
}

/** True when the fitted relative indices of the listed candidates differ exactly like the true fret numbers. */
function consistent(indices: (number | null)[], truth: (number | null)[]): { matched: number; wrong: number; falseInliers: number } {
  let offset: number | null = null;
  let matched = 0;
  let wrong = 0;
  let falseInliers = 0;
  for (let i = 0; i < truth.length; i++) {
    const t = truth[i];
    const m = indices[i];
    if (t === null) {
      if (m !== null) falseInliers++;
      continue;
    }
    if (m === null) continue;
    if (offset === null) offset = m - t;
    if (m - t === offset) matched++;
    else wrong++;
  }
  return { matched, wrong, falseInliers };
}

describe('fitFretPattern', () => {
  it('recovers a clean comb exactly', () => {
    const frets = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const us = comb(frets, 900, 40, 0);
    const fit = fitFretPattern(us.map((u) => ({ u, weight: 1 })), { direction: 1 });
    expect(fit).not.toBeNull();
    expect(fit!.inliers).toBe(13);
    expect(fit!.missing).toBe(0);
    expect(fit!.rms).toBeLessThan(0.01);
    expect(consistent(fit!.indices, frets)).toEqual({ matched: 13, wrong: 0, falseInliers: 0 });
    // The model reproduces the positions and inverts.
    const m0 = fit!.indices[0]!;
    expect(fretU(fit!, m0 + 5)).toBeCloseTo(us[5], 3);
    expect(fretIndexAt(fit!, us[7])).toBeCloseTo(m0 + 7, 3);
  });

  it('bridges the frets hidden by a hand and ignores spurious candidates when the depth ratio is roughly known', () => {
    const rng = createRng(7);
    let fullyRight = 0;
    const trials = 60;
    for (let trial = 0; trial < trials; trial++) {
      const first = Math.floor(rng() * 6);
      const count = 9 + Math.floor(rng() * 8);
      const all = Array.from({ length: count }, (_, i) => first + i);
      // A hand hides 2-4 consecutive frets somewhere inside.
      const handAt = 1 + Math.floor(rng() * (count - 6));
      const handLen = 2 + Math.floor(rng() * 3);
      const visible = all.filter((_, i) => i < handAt || i >= handAt + handLen);
      const persp = (rng() - 0.5) * 0.5;
      const us = comb(visible, 700 + rng() * 500, 30 + rng() * 40, persp);
      const cands: FretCandidate[] = us.map((u) => ({ u: u + (rng() - 0.5) * 0.8, weight: 0.7 + rng() * 0.6 }));
      const truth: (number | null)[] = [...visible];
      // Two or three spurious candidates (finger edges, glints) at random places.
      const lo = Math.min(...us);
      const hi = Math.max(...us);
      const extra = 2 + Math.floor(rng() * 2);
      for (let k = 0; k < extra; k++) {
        cands.push({ u: lo + rng() * (hi - lo), weight: 0.4 + rng() * 0.4 });
        truth.push(null);
      }
      // What the board edges would tell: the depth ratio between the two ends, to about 10%.
      const w = (n: number): number => persp * (1 - Math.pow(FRET_RATIO, n)) + 1;
      const rho = (w(visible[visible.length - 1]) / w(visible[0])) * (1 + (rng() - 0.5) * 0.1);
      const fit = fitFretPattern(cands, { direction: 1, depthRatio: [rho / 1.1, rho * 1.1] });
      // With only five frets in view a noisy one can cost the fit; that must stay rare.
      if (!fit) { if (process.env.FRETFIT_DEBUG) console.log(trial, 'null', visible.join(',')); continue; }
      const c = consistent(fit.indices, truth);
      if (c.wrong === 0 && c.matched >= visible.length - 1 && c.falseInliers <= 2) fullyRight++;
      else if (process.env.FRETFIT_DEBUG) console.log(trial, c, visible.join(','), fit.indices.join(','), 'rms', fit.rms.toFixed(3), 'miss', fit.missing, 'score', fit.score.toFixed(2));
    }
    // Sparse combs with a wide gap stay ambiguous now and then; nearly all must come out right.
    expect(fullyRight / trials).toBeGreaterThanOrEqual(0.9);
  });

  it('needs no depth hint when the hand hides little', () => {
    const rng = createRng(11);
    for (let trial = 0; trial < 30; trial++) {
      const first = Math.floor(rng() * 5);
      const all = Array.from({ length: 13 }, (_, i) => first + i);
      const handAt = 4 + Math.floor(rng() * 4);
      const visible = all.filter((_, i) => i < handAt || i >= handAt + 2);
      const persp = (rng() - 0.5) * 0.4;
      const us = comb(visible, 800 + rng() * 300, 40, persp);
      const fit = fitFretPattern(us.map((u) => ({ u: u + (rng() - 0.5) * 0.5, weight: 1 })), { direction: 1 });
      expect(fit, `trial ${trial}`).not.toBeNull();
      expect(consistent(fit!.indices, visible), `trial ${trial}`).toEqual({ matched: visible.length, wrong: 0, falseInliers: 0 });
      expect(fit!.missing).toBe(2);
    }
  });

  it('fits a comb whose nut is toward larger u when told so', () => {
    const frets = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const us = comb(frets, 800, 20, 0.15, true);
    const fit = fitFretPattern(us.map((u) => ({ u, weight: 1 })), { direction: -1 });
    expect(fit).not.toBeNull();
    expect(fit!.direction).toBe(-1);
    expect(consistent(fit!.indices, frets)).toEqual({ matched: 10, wrong: 0, falseInliers: 0 });
    // Indices decrease with u.
    expect(fit!.indices[0]!).toBeLessThan(fit!.indices[9]!);
    expect(us[0]).toBeGreaterThan(us[9]);
  });

  it('finds the direction by itself on a long comb with moderate perspective', () => {
    const frets = Array.from({ length: 15 }, (_, i) => i);
    for (const reversed of [false, true]) {
      const us = comb(frets, 900, 30, 0.1, reversed);
      const fit = fitFretPattern(us.map((u) => ({ u, weight: 1 })));
      expect(fit).not.toBeNull();
      expect(fit!.direction).toBe(reversed ? -1 : 1);
      expect(fit!.inliers).toBe(15);
    }
  });

  it('reports how much of the comb is unexplained', () => {
    // Uniformly spaced bars with random jitter are a poor fret comb: few inliers or many gaps.
    const rng = createRng(3);
    const cands: FretCandidate[] = Array.from({ length: 14 }, (_, i) => ({ u: 20 + i * 23 + (rng() - 0.5) * 16, weight: 1 }));
    const fit = fitFretPattern(cands, { direction: 1 });
    if (fit) expect(fit.inliers - fit.missing - fit.spurious).toBeLessThan(11);
  });

  it('returns null for too few candidates', () => {
    expect(fitFretPattern([{ u: 1, weight: 1 }, { u: 20, weight: 1 }, { u: 38, weight: 1 }])).toBeNull();
    expect(fitFretPattern([])).toBeNull();
  });
});
