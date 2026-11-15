import { describe, expect, it } from 'vitest';
import { applyHomography, comparePoses, controlPlanePoints, createRng, homographyFromPoints, makePose, multiply, neckModel } from '../geometry';
import type { Mat3, NeckModel } from '../types';
import { buildPyramid, toWorkingGray, type Pyramid } from './image';
import { refineHomography, refineRigid, visibleSpan, wireResponse } from './refine';
import { renumberHomography, rigidity } from './rigidity';
import { scorePose } from './score';
import { paintBoard, simpleView } from './synthetic';

const model = neckModel('steel');
const W = 640;
const Hh = 360;
/** A board that fills most of the frame, rolled a little: frets 0..14 or so in view. */
const TRUE_H = simpleView(model, 600, 185, 1.45, 8);

function pyramidOf(H: Mat3, extra: Partial<Parameters<typeof paintBoard>[0]> = {}): Pyramid {
  return buildPyramid(toWorkingGray(paintBoard({ width: W, height: Hh, H, model, ...extra })).gray);
}

/** Move the four control points (board corners at the nut and the 12th fret) by up to `px` pixels each. */
function perturb(H: Mat3, m: NeckModel, px: number, seed: number): Mat3 {
  const rng = createRng(seed);
  const plane = controlPlanePoints(m);
  const image = plane.map((p) => {
    const q = applyHomography(H, p.x, p.y);
    return { x: q.x + (rng() * 2 - 1) * px, y: q.y + (rng() * 2 - 1) * px };
  });
  return homographyFromPoints(plane, image) as Mat3;
}

const errorOf = (H: Mat3): ReturnType<typeof comparePoses> => comparePoses(makePose(H, model, W, Hh), makePose(TRUE_H, model, W, Hh));

describe('wire response', () => {
  const { fine, coarse } = pyramidOf(TRUE_H);
  it('is high on a wire, low in the middle of a cell, for the right polarity only', () => {
    const on = applyHomography(TRUE_H, model.scaleLength * (1 - Math.pow(2, -5 / 12)), 14);
    const off = applyHomography(TRUE_H, model.scaleLength * (1 - Math.pow(2, -5.5 / 12)), 14);
    const n = { x: -Math.cos((8 * Math.PI) / 180), y: Math.sin((8 * Math.PI) / 180) };
    expect(wireResponse(fine, coarse, on.x, on.y, n.x, n.y, 1)).toBeGreaterThan(20);
    expect(wireResponse(fine, coarse, off.x, off.y, n.x, n.y, 1)).toBeLessThan(2);
    expect(wireResponse(fine, coarse, on.x, on.y, n.x, n.y, -1)).toBeLessThan(2);
  });
});

describe('scorePose', () => {
  const { fine, coarse } = pyramidOf(TRUE_H);
  const span = visibleSpan(TRUE_H, model, W, Hh, 0, model.fretCount);
  const truth = scorePose(fine, coarse, TRUE_H, model, 1, span);

  it('rates the true pose highly', () => {
    expect(span.max - span.min).toBeGreaterThanOrEqual(10);
    expect(truth.seen).toBeGreaterThanOrEqual(span.max - span.min);
    expect(truth.coverage).toBeGreaterThan(0.95);
    expect(truth.cleanliness).toBeGreaterThan(0.95);
    expect(truth.fill).toBeGreaterThan(0.95);
    expect(truth.overrun).toBeLessThan(0.1);
    expect(truth.thickness).toBeLessThan(0.25);
    expect(truth.strings).toBeGreaterThan(0.1);
    expect(Math.abs(truth.lateral)).toBeLessThan(0.3);
    expect(truth.quality).toBeGreaterThan(0.85);
  });

  it('prefers the true pose over one slid by half a fret along the neck', () => {
    // Stretch about the saddle: every wire moves by the same fraction of its cell.
    const k = 0.5 * (Math.pow(2, 1 / 12) - 1);
    const slid = multiply(TRUE_H, [1 - k, 0, k * model.scaleLength, 0, 1, 0, 0, 0, 1]);
    const s = scorePose(fine, coarse, slid, model, 1, visibleSpan(slid, model, W, Hh, 0, model.fretCount));
    expect(s.quality).toBeLessThan(0.3 * truth.quality);
  });

  it('prefers the true pose over half and double fret spacing', () => {
    // Renumbering by 12 halves every fret distance from the nut (the board looks an octave higher): half the wires hang in mid-cell.
    for (const scale of [0.5, 2]) {
      const scaled = multiply(TRUE_H, [1 / scale, 0, 0, 0, 1, 0, 0, 0, 1]);
      const s = scorePose(fine, coarse, scaled, model, 1, visibleSpan(scaled, model, W, Hh, 0, model.fretCount));
      expect(s.quality).toBeLessThan(0.6 * truth.quality);
    }
  });

  it('scores a pose shifted by exactly one fret as well as the truth: spacing alone cannot number frets', () => {
    const shifted = renumberHomography(TRUE_H, model, 1, model.scaleLength * 0.3);
    const s = scorePose(fine, coarse, shifted, model, 1, visibleSpan(shifted, model, W, Hh, 0, model.fretCount));
    expect(s.quality).toBeGreaterThan(0.8 * truth.quality);
  });

  it('notices a pose slid across the neck by one string', () => {
    const spacing = (model.stringSpanNut + model.stringSpanBridge) / 2 / 5;
    const slipped = multiply(TRUE_H, [1, 0, 0, 0, 1, spacing, 0, 0, 1]);
    const s = scorePose(fine, coarse, slipped, model, 1, span);
    expect(Math.abs(s.lateral)).toBeGreaterThan(0.5);
    expect(s.quality).toBeLessThan(truth.quality);
  });

  it('forgives one run of hidden frets but not frets missing here and there', () => {
    const hand = pyramidOf(TRUE_H, { hiddenFrets: [5, 6, 7, 8] });
    const sHand = scorePose(hand.fine, hand.coarse, TRUE_H, model, 1, span);
    expect(sHand.longestGap).toBe(4);
    expect(sHand.coverage).toBeGreaterThan(0.85);
    const scattered = pyramidOf(TRUE_H, { hiddenFrets: [2, 4, 6, 8, 10] });
    const sScattered = scorePose(scattered.fine, scattered.coarse, TRUE_H, model, 1, span);
    expect(sScattered.coverage).toBeLessThan(sHand.coverage - 0.15);
  });
});

describe('refineHomography (8 parameters)', () => {
  const { fine, coarse } = pyramidOf(TRUE_H);
  const span = visibleSpan(TRUE_H, model, W, Hh, 0, model.fretCount);

  it('leaves the true pose where it is', () => {
    const r = refineHomography(fine, coarse, TRUE_H, model, 1, span);
    const e = errorOf(r.H);
    expect(r.matched).toBeGreaterThan(40);
    expect(e.fretErrorAligned.median).toBeLessThan(0.02);
    expect(e.stringError.median).toBeLessThan(0.06);
    expect(e.cellAccuracy).toBe(1);
  });

  it('converges from any start with the control points up to 2 pixels off, and mostly from 3 (the stated basin)', () => {
    const run = (px: number): number => {
      let converged = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const start = perturb(TRUE_H, model, px, seed);
        const before = errorOf(start);
        const after = errorOf(refineHomography(fine, coarse, start, model, 1, span).H);
        // Never worse than the start.
        expect(after.fretErrorAligned.median).toBeLessThanOrEqual(before.fretErrorAligned.median + 0.01);
        if (after.cellAccuracy >= 0.98 && after.fretErrorAligned.median < 0.03 && after.stringError.median < 0.1) converged++;
      }
      return converged;
    };
    expect(run(2)).toBe(20);
    expect(run(3)).toBeGreaterThanOrEqual(17);
    // Beyond that the far frets start more than a third of a cell out and may lock one wire off.
    expect(run(4)).toBeGreaterThanOrEqual(13);
  });

  it('is not pulled off by a hand over four frets', () => {
    const hand = pyramidOf(TRUE_H, { hiddenFrets: [4, 5, 6, 7] });
    const r = refineHomography(hand.fine, hand.coarse, perturb(TRUE_H, model, 3, 5), model, 1, span);
    const e = errorOf(r.H);
    expect(e.cellAccuracy).toBeGreaterThanOrEqual(0.98);
    expect(e.fretErrorAligned.median).toBeLessThan(0.03);
  });

  it('follows dark wires on a light board', () => {
    const maple = pyramidOf(TRUE_H, { maple: true });
    const r = refineHomography(maple.fine, maple.coarse, perturb(TRUE_H, model, 3, 9), model, -1, span);
    expect(errorOf(r.H).cellAccuracy).toBeGreaterThanOrEqual(0.98);
  });

  it('reports no matches on a blank image and returns the input', () => {
    const blank = buildPyramid(toWorkingGray({ data: new Uint8ClampedArray(W * Hh * 4).fill(120), width: W, height: Hh }).gray);
    const r = refineHomography(blank.fine, blank.coarse, TRUE_H, model, 1, span);
    expect(r.matched).toBe(0);
    expect(r.H).toBe(TRUE_H);
  });
});

describe('refineRigid (6 parameters)', () => {
  const span = visibleSpan(TRUE_H, model, W, Hh, 0, model.fretCount);
  const focal = 0.8 * W;

  it('follows a board that moved a few pixels and turned a little, keeping its shape', () => {
    // An in-plane motion of the image about the frame centre: a rigid motion of a board seen face-on.
    for (const [dx, dy, deg] of [[3, -2, 0.4], [-3, 2, -0.5], [2, 3, 0.3]] as const) {
      const a = (deg * Math.PI) / 180;
      const c = Math.cos(a);
      const s2 = Math.sin(a);
      const T: Mat3 = [c, -s2, W / 2 - c * (W / 2) + s2 * (Hh / 2) + dx, s2, c, Hh / 2 - s2 * (W / 2) - c * (Hh / 2) + dy, 0, 0, 1];
      const moved = multiply(T, TRUE_H);
      const { fine, coarse } = pyramidOf(moved);
      const r = refineRigid(fine, coarse, TRUE_H, focal, model, 1, span, { radii: [5, 3.5, 2.5, 1.5, 1], stringsFrom: 0 });
      const e = comparePoses(makePose(r.H, model, W, Hh), makePose(moved, model, W, Hh));
      expect(e.cellAccuracy).toBeGreaterThanOrEqual(0.98);
      expect(e.fretErrorAligned.median).toBeLessThan(0.03);
      expect(e.stringError.median).toBeLessThan(0.1);
      // Still a rigid view of the same board under the same camera.
      expect(rigidity(r.H, W, Hh)?.residual ?? 1).toBeLessThan(0.03);
    }
  });

  it('cannot bend: a start that is right along the neck but sheared across it keeps its shape', () => {
    // Shear the start across the neck (strings no longer parallel to the true ones). Eight free
    // parameters would follow whatever the edges suggest; six cannot change the board's shape.
    const { fine, coarse } = pyramidOf(TRUE_H);
    const r = refineRigid(fine, coarse, TRUE_H, focal, model, 1, span, { radii: [3, 2, 1], stringsFrom: 0 });
    const before = controlPlanePoints(model).map((p) => applyHomography(TRUE_H, p.x, p.y));
    const after = controlPlanePoints(model).map((p) => applyHomography(r.H, p.x, p.y));
    // Side lengths of the control quadrilateral are unchanged to a fraction of a pixel.
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      expect(Math.hypot(after[i].x - after[j].x, after[i].y - after[j].y)).toBeCloseTo(Math.hypot(before[i].x - before[j].x, before[i].y - before[j].y), 0);
    }
  });
});
