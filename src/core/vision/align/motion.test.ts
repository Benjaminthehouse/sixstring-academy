import { describe, expect, it } from 'vitest';
import { applyHomography, neckModel } from '../geometry';
import { buildPyramid, toWorkingGray } from './image';
import { blendHomography, controlDistance, controlPointsOf, predictShift, searchShift, shiftRigidly } from './motion';
import { visibleSpan } from './refine';
import { rigidity } from './rigidity';
import { paintBoard, simpleView } from './synthetic';

const model = neckModel('steel');
const W = 640;
const Hh = 360;

describe('motion helpers', () => {
  const H = simpleView(model, 600, 185, 1.45, 8);

  it('predicts a constant-velocity shift and caps it', () => {
    const a = controlPointsOf(H, model);
    const b = a.map((p) => ({ x: p.x + 3, y: p.y - 2 }));
    expect(predictShift(a, b, 1, 50)).toEqual({ dx: 3, dy: -2 });
    expect(predictShift(a, b, 2, 50).dx).toBeCloseTo(6, 9);
    const capped = predictShift(a, b, 20, 10);
    expect(Math.hypot(capped.dx, capped.dy)).toBeCloseTo(10, 6);
    expect(controlDistance(a, b)).toBeCloseTo(Math.hypot(3, 2), 9);
  });

  it('shifts a pose rigidly: by the requested pixels near the frame centre, and still a rigid view', () => {
    const moved = shiftRigidly(H, 0.8 * W, W, Hh, 6, -4);
    const x = model.scaleLength * (1 - Math.pow(2, -7 / 12));
    const p = applyHomography(H, x, model.nutWidth / 2);
    const q = applyHomography(moved, x, model.nutWidth / 2);
    expect(q.x - p.x).toBeCloseTo(6, 0);
    expect(q.y - p.y).toBeCloseTo(-4, 0);
    expect(rigidity(moved, W, Hh)?.residual ?? 1).toBeLessThan(0.02);
    expect(shiftRigidly(H, 0.8 * W, W, Hh, 0, 0)).toBe(H);
  });

  it('blends control points', () => {
    const a = controlPointsOf(H, model);
    const b = a.map((p) => ({ x: p.x + 4, y: p.y }));
    const half = blendHomography(model, a, b, 0.5);
    expect(half).not.toBeNull();
    if (half) expect(controlPointsOf(half, model)[0].x).toBeCloseTo(a[0].x + 2, 6);
  });
});

describe('searchShift', () => {
  it('finds a displacement along and across the neck, without sliding along the wires', () => {
    const H = simpleView(model, 600, 185, 1.45, 0);
    const span = visibleSpan(H, model, W, Hh, 0, model.fretCount);
    for (const [dx, dy] of [[6, 0], [-8, 4], [0, -6], [4, 8]] as const) {
      const moved = simpleView(model, 600 + dx, 185 + dy, 1.45, 0);
      const { fine, coarse } = buildPyramid(toWorkingGray(paintBoard({ width: W, height: Hh, H: moved, model })).gray);
      const shift = searchShift(fine, coarse, H, model, 1, span, 12, 12, 2);
      expect(Math.abs(shift.dx - dx)).toBeLessThanOrEqual(2);
      expect(Math.abs(shift.dy - dy)).toBeLessThanOrEqual(2);
      expect(shift.best).toBeGreaterThanOrEqual(shift.zero * 0.95);
    }
  });

  it('never proposes a whole-fret slide: the range along the neck stays under half the widest spacings', () => {
    const H = simpleView(model, 600, 185, 0.8, 0);
    const span = visibleSpan(H, model, W, Hh, 0, model.fretCount);
    const { fine, coarse } = buildPyramid(toWorkingGray(paintBoard({ width: W, height: Hh, H, model })).gray);
    const shift = searchShift(fine, coarse, H, model, 1, span, 60, 4, 2);
    expect(Math.hypot(shift.dx, shift.dy)).toBeLessThanOrEqual(2);
  });
});
