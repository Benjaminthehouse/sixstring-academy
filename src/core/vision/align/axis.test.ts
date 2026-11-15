import { describe, expect, it } from 'vitest';
import { neckModel } from '../geometry';
import { AxisSearch, angleDiffDeg, computeRidgeField, findAxisCandidates } from './axis';
import { SIGMA_FINE, gaussianBlur, toWorkingGray } from './image';
import { paintBoard, simpleView } from './synthetic';

const model = neckModel('steel');

function fieldOf(rollDeg: number, maple = false) {
  const H = simpleView(model, 600, 180, 1.3, rollDeg);
  const frame = paintBoard({ width: 640, height: 360, H, model, maple, strings: false });
  const { gray } = toWorkingGray(frame);
  return computeRidgeField(gaussianBlur(gray, SIGMA_FINE));
}

describe('ridge field', () => {
  it('marks fret wires as bright ridges with the normal along the neck', () => {
    const field = fieldOf(0);
    // Wire 5 of a 1.3 px/mm board with the nut at x = 600: column 600 - 1.3 * fretX(5).
    const x = Math.round(600 - 1.3 * model.scaleLength * (1 - Math.pow(2, -5 / 12)));
    let found = 0;
    for (let dx = -1; dx <= 1; dx++) {
      const i = 180 * 640 + x + dx;
      if (field.strength[i] > 0 && angleDiffDeg(field.normalDeg[i], 0) <= 12) found++;
    }
    expect(found).toBeGreaterThan(0);
    expect(field.count).toBeGreaterThan(200);
    expect(field.count).toBeLessThanOrEqual(field.index.length);
  });

  it('gives dark wires on a light board the opposite sign', () => {
    const field = fieldOf(0, true);
    const x = Math.round(600 - 1.3 * model.scaleLength * (1 - Math.pow(2, -5 / 12)));
    let negative = 0;
    for (let dx = -1; dx <= 1; dx++) if (field.strength[180 * 640 + x + dx] < 0) negative++;
    expect(negative).toBeGreaterThan(0);
  });

  it('is silent on a flat image', () => {
    const frame = { data: new Uint8ClampedArray(640 * 360 * 4).fill(128), width: 640, height: 360 };
    const field = computeRidgeField(gaussianBlur(toWorkingGray(frame).gray, SIGMA_FINE));
    expect(field.count).toBe(0);
    expect(findAxisCandidates(field)).toHaveLength(0);
  });
});

describe('axis search', () => {
  it.each([0, 14, -20, 33])('finds the neck axis of a board rolled by %d degrees first', (roll) => {
    const field = fieldOf(roll);
    const [first] = findAxisCandidates(field, 3);
    expect(first).toBeDefined();
    expect(first.polarity).toBe(1);
    // The axis direction: simpleView rotates the neck by -roll (undirected angle).
    expect(angleDiffDeg(first.thetaDeg, -roll)).toBeLessThanOrEqual(6);
    // ... and it passes through the board: within half a board width of the 7th fret on the centre line.
    const H = simpleView(model, 600, 180, 1.3, roll);
    const x7 = model.scaleLength * (1 - Math.pow(2, -7 / 12));
    const px = H[0] * x7 + H[1] * (model.nutWidth / 2) + H[2];
    const py = H[3] * x7 + H[4] * (model.nutWidth / 2) + H[5];
    const a = (first.thetaDeg * Math.PI) / 180;
    const dist = Math.abs(-(px - first.cx) * Math.sin(a) + (py - first.cy) * Math.cos(a));
    expect(dist).toBeLessThan(0.5 * 1.3 * model.width12);
  });

  it('explains a structure away: the second candidate is somewhere else', () => {
    const field = fieldOf(10);
    const search = new AxisSearch(field);
    const a = search.next();
    const b = search.next(0);
    expect(a).not.toBeNull();
    if (a && b) {
      const sameLine = angleDiffDeg(a.thetaDeg, b.thetaDeg) < 8 && Math.hypot(a.cx - b.cx, a.cy - b.cy) < 20;
      expect(sameLine).toBe(false);
      expect(b.votes).toBeLessThan(a.votes);
    }
  });

  it('does not vote for a line along a single long ridge', () => {
    // One long bright horizontal line: every pixel has a vertical normal and votes for near-vertical axes only.
    const data = new Uint8ClampedArray(640 * 360 * 4).fill(60);
    for (let x = 40; x < 600; x++) for (const y of [179, 180]) for (let c = 0; c < 3; c++) data[(y * 640 + x) * 4 + c] = 230;
    const field = computeRidgeField(gaussianBlur(toWorkingGray({ data, width: 640, height: 360 }).gray, SIGMA_FINE));
    const candidates = findAxisCandidates(field, 4, 0);
    for (const c of candidates) expect(angleDiffDeg(c.thetaDeg, 0)).toBeGreaterThan(40);
  });
});
