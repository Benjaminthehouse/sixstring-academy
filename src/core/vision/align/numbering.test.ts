import { describe, expect, it } from 'vitest';
import { comparePoses, fretX, makePose, multiply, neckModel } from '../geometry';
import type { Mat3 } from '../types';
import { buildPyramid, toWorkingGray } from './image';
import { boardEndAt, measureInlays, nutBarAt, resolveMarkers, resolveNumbering } from './numbering';
import { visibleSpan } from './refine';
import { renumberHomography, rigidity } from './rigidity';
import { scorePose } from './score';
import { paintBoard, simpleView } from './synthetic';

const model = neckModel('steel');
const W = 640;
const Hh = 360;

function scene(H: Mat3, extra: Partial<Parameters<typeof paintBoard>[0]> = {}) {
  const { fine, coarse } = buildPyramid(toWorkingGray(paintBoard({ width: W, height: Hh, H, model, ...extra })).gray);
  return { fine, coarse };
}

/** Numbering context the detector would build: plausibility of a pose under each shift. */
function contextOf(H: Mat3, first: number, last: number) {
  const xRef = fretX(model, (first + last) / 2);
  return {
    maxFret: model.fretCount + 2,
    implausibility: (delta: number): number => {
      const r = rigidity(renumberHomography(H, model, delta, xRef), W, Hh);
      return !r || r.tiltDeg > 68 ? 9 : r.residual + Math.max(0, r.tiltDeg - 45) * 0.012;
    },
  };
}

describe('rigidity and renumbering', () => {
  const H = simpleView(model, 600, 185, 1.45, 8);

  it('is about zero for a true view and large for a view no camera could produce', () => {
    expect(rigidity(H, W, Hh)?.residual ?? 1).toBeLessThan(0.02);
    // Stretch the board to twice its width: frets on frets, but no longer a rigid view of this neck face-on.
    const wide = multiply(H, [1, 0, 0, 0, 2, -model.nutWidth / 2, 0, 0, 1]);
    const r = rigidity(wide, W, Hh);
    // Explained as a tilted view it would need about 60 degrees of tilt ...
    expect(r && (r.residual > 0.2 || r.tiltDeg > 50)).toBe(true);
    // ... and a shear has no such excuse.
    const sheared = multiply(H, [1, 0, 0, 0.5, 1, 0, 0, 0, 1]);
    expect(rigidity(sheared, W, Hh)?.residual ?? 0).toBeGreaterThan(0.25);
  });

  it('renumbering keeps every wire on a wire', () => {
    for (const delta of [-3, -1, 1, 2, 5]) {
      const shifted = renumberHomography(H, model, delta, fretX(model, 6));
      const err = comparePoses(makePose(shifted, model, W, Hh), makePose(H, model, W, Hh));
      expect(err.numberingOffset).toBe(delta);
      expect(err.fretErrorAligned.median).toBeLessThan(1e-6);
      // Across the neck the fit is exact at the reference fret and close elsewhere.
      expect(err.stringError.median).toBeLessThan(0.08);
    }
  });
});

describe('nut and inlay evidence', () => {
  const H = simpleView(model, 600, 185, 1.45, 8);
  const { fine } = scene(H);

  it('sees the nut bar at line 0 and nothing like it at ordinary frets', () => {
    const nut = nutBarAt(fine, H, model, 0);
    expect(nut.bar).toBeGreaterThan(40);
    for (const n of [2, 4, 7]) expect(nutBarAt(fine, H, model, n, 0).bar).toBeLessThan(0.3 * nut.bar);
  });

  it('sees the board end where a dark nut leaves no bar', () => {
    const dark = scene(H, { nut: false });
    // Without the bone nut the dark board simply gives way to the (lighter) headstock.
    expect(nutBarAt(dark.fine, H, model, 0).bar).toBeLessThan(12);
    expect(boardEndAt(dark.fine, H, model, 0)).toBeGreaterThan(30);
    expect(boardEndAt(dark.fine, H, model, 3)).toBeLessThan(10);
  });

  it('measures dots in cells 3, 5, 7, 9 and the double dot at 12', () => {
    const cells = measureInlays(fine, H, model, 1, 1, 13);
    const by = new Map(cells.map((c) => [c.cell, c]));
    for (const c of [3, 5, 7, 9]) expect(by.get(c)?.single ?? 0).toBeGreaterThan(40);
    for (const c of [2, 4, 6, 8, 10, 11]) expect(Math.abs(by.get(c)?.single ?? 0)).toBeLessThan(15);
    expect(by.get(12)?.double ?? 0).toBeGreaterThan(40);
    expect(by.get(12)?.single ?? 0).toBeLessThan(15);
  });
});

describe('resolveNumbering', () => {
  it('numbers from the nut when it is in view, whatever the provisional numbering', () => {
    const H = simpleView(model, 600, 185, 1.45, 8);
    const { fine, coarse } = scene(H, { inlays: false });
    for (const wrong of [-2, 0, 3]) {
      const provisional = renumberHomography(H, model, wrong, fretX(model, 6));
      const span = visibleSpan(provisional, model, W, Hh, -6, model.fretCount + 6);
      const score = scorePose(fine, coarse, provisional, model, 1, span);
      const decision = resolveNumbering(fine, coarse, provisional, model, 1, score, contextOf(provisional, score.seenSpan.min, score.seenSpan.max));
      expect(decision.source).toBe('nut');
      expect(decision.delta + wrong).toBe(0);
      expect(decision.confidence).toBeGreaterThanOrEqual(0.6);
    }
  });

  it('numbers from the inlays when the nut is out of the frame', () => {
    // Slide the board right so the nut and the first frets leave the frame: frets 3..17 or so stay.
    const H = simpleView(model, 780, 185, 1.45, 4);
    const { fine, coarse } = scene(H);
    for (const wrong of [-2, 1, 2]) {
      const provisional = renumberHomography(H, model, wrong, fretX(model, 9));
      const span = visibleSpan(provisional, model, W, Hh, -6, model.fretCount + 6);
      const score = scorePose(fine, coarse, provisional, model, 1, span);
      const decision = resolveNumbering(fine, coarse, provisional, model, 1, score, contextOf(provisional, score.seenSpan.min, score.seenSpan.max));
      expect(decision.source).toBe('inlays');
      expect(decision.delta + wrong).toBe(0);
      expect(decision.confidence).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('admits it is guessing when there is neither nut nor inlay in view', () => {
    const H = simpleView(model, 780, 185, 1.45, 4);
    const { fine, coarse } = scene(H, { inlays: false });
    const span = visibleSpan(H, model, W, Hh, -6, model.fretCount + 6);
    const score = scorePose(fine, coarse, H, model, 1, span);
    const decision = resolveNumbering(fine, coarse, H, model, 1, score, contextOf(H, score.seenSpan.min, score.seenSpan.max));
    expect(decision.source).toBe('assumed');
    expect(decision.confidence).toBeLessThan(0.5);
    // The geometric guess is at least in the neighbourhood.
    expect(Math.abs(decision.delta)).toBeLessThanOrEqual(3);
  });
});

describe('resolveMarkers', () => {
  // No nut, no inlays in view: only two green stickers at frets 5 and 9 can say which fret is which.
  const H = simpleView(model, 780, 185, 1.45, 4);
  const frame = paintBoard({ width: W, height: Hh, H, model, inlays: false, stickers: { frets: [5, 9], rgb: [40, 240, 90] } });
  const { fine, coarse } = buildPyramid(toWorkingGray(frame).gray);

  it('numbers the frets from two stickers, with or without a hue hint', () => {
    for (const wrong of [-2, 0, 3]) {
      const provisional = renumberHomography(H, model, wrong, fretX(model, 9));
      const span = visibleSpan(provisional, model, W, Hh, -6, model.fretCount + 6);
      const score = scorePose(fine, coarse, provisional, model, 1, span);
      for (const hue of [135, undefined]) {
        const decision = resolveMarkers(frame, provisional, model, score, { frets: [5, 9], hue }, model.fretCount + 2);
        expect(decision).not.toBeNull();
        expect(decision?.source).toBe('markers');
        expect((decision?.delta ?? NaN) + wrong).toBe(0);
        expect(decision?.confidence ?? 0).toBeGreaterThanOrEqual(0.6);
      }
    }
  });

  it('finds nothing when there are no stickers, or the hue is wrong', () => {
    const plain = paintBoard({ width: W, height: Hh, H, model, inlays: false });
    const span = visibleSpan(H, model, W, Hh, -6, model.fretCount + 6);
    const score = scorePose(fine, coarse, H, model, 1, span);
    expect(resolveMarkers(plain, H, model, score, { frets: [5, 9] }, model.fretCount + 2)).toBeNull();
    // Magenta hint, green stickers.
    expect(resolveMarkers(frame, H, model, score, { frets: [5, 9], hue: 315 }, model.fretCount + 2)).toBeNull();
  });
});
