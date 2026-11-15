import { describe, expect, it } from 'vitest';
import { poseFromTaps } from './calibration';
import { MarkerAnchor, createBlobScratch, expectMarkers, findColorBlobs, markerHypotheses, readMarkerNumbering, sampleMarkerColor } from './color-markers';
import { applyHomography, markerHintPlanePoints, poseDistancePx, makePose, renumberPose } from './geometry';
import type { Frame, FretboardPose, MarkerColor, MarkerHint } from './types';

const W = 320;
const H = 180;

/** A brown-ish board colour with a little noise, and coloured squares. */
function frameWith(squares: { x: number; y: number; size: number; rgb: [number, number, number] }[]): Frame {
  const data = new Uint8ClampedArray(W * H * 4);
  let seed = 7;
  const rnd = (): number => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return (seed >>> 8) / 16777216;
  };
  for (let i = 0; i < W * H; i++) {
    const n = (rnd() - 0.5) * 16;
    data[i * 4] = 92 + n;
    data[i * 4 + 1] = 64 + n;
    data[i * 4 + 2] = 48 + n;
    data[i * 4 + 3] = 255;
  }
  for (const s of squares) {
    for (let y = Math.round(s.y - s.size / 2); y < Math.round(s.y + s.size / 2); y++) {
      for (let x = Math.round(s.x - s.size / 2); x < Math.round(s.x + s.size / 2); x++) {
        const i = (y * W + x) * 4;
        data[i] = s.rgb[0];
        data[i + 1] = s.rgb[1];
        data[i + 2] = s.rgb[2];
      }
    }
  }
  return { data, width: W, height: H };
}

const PINK: [number, number, number] = [240, 60, 170];
const GREEN: [number, number, number] = [60, 220, 90];

describe('sampleMarkerColor', () => {
  it('finds the tape colour under a tap that is a few pixels off', () => {
    const f = frameWith([{ x: 100, y: 60, size: 6, rgb: PINK }]);
    const c = sampleMarkerColor(f, { x: 103, y: 62 }, 6);
    expect(c).not.toBeNull();
    expect(Math.abs((c?.hue ?? 0) - 323)).toBeLessThan(6);
    expect(c?.saturation).toBeGreaterThan(0.6);
  });

  it('refuses greys, the wood of the board and dark corners', () => {
    const f = frameWith([]);
    expect(sampleMarkerColor(f, { x: 50, y: 50 })).toBeNull();
    const grey = frameWith([{ x: 60, y: 60, size: 10, rgb: [150, 150, 155] }]);
    expect(sampleMarkerColor(grey, { x: 60, y: 60 })).toBeNull();
  });
});

describe('findColorBlobs', () => {
  it('finds each patch of the sampled colour and nothing else', () => {
    const f = frameWith([
      { x: 40, y: 40, size: 6, rgb: PINK },
      { x: 200, y: 120, size: 8, rgb: PINK },
      { x: 120, y: 100, size: 8, rgb: GREEN },
    ]);
    const pink = sampleMarkerColor(f, { x: 40, y: 40 }) as NonNullable<ReturnType<typeof sampleMarkerColor>>;
    const scratch = createBlobScratch();
    const blobs = findColorBlobs(f, pink, {}, scratch);
    expect(blobs).toHaveLength(2);
    expect(blobs[0].x).toBeCloseTo(200, 0);
    expect(blobs[0].y).toBeCloseTo(120, 0);
    expect(blobs[1].x).toBeCloseTo(40, 0);
    // Inside a box only the patch in it.
    const boxed = findColorBlobs(f, pink, { box: { x0: 150, y0: 80, x1: 260, y1: 170 } }, scratch);
    expect(boxed).toHaveLength(1);
    expect(boxed[0].area).toBe(64);
    // A darker shade of the same tape (in the shadow of the hand) still matches.
    const dim = frameWith([{ x: 80, y: 80, size: 6, rgb: [150, 40, 108] }]);
    expect(findColorBlobs(dim, pink)).toHaveLength(1);
  });
});

describe('marker anchors', () => {
  const truth = poseFromTaps({ nut: [{ x: 300, y: 70 }, { x: 301, y: 92 }], fret: [{ x: 110, y: 74 }, { x: 112, y: 103 }] }, W, H) as FretboardPose;
  const hint: MarkerHint = { frets: [5, 12] };

  it('a pair of blobs gives a board hypothesis close to the real one', () => {
    const at = markerHintPlanePoints(truth.model, hint).map((p) => applyHomography(truth.H, p.x, p.y));
    const [Hs] = markerHypotheses(at[0], at[1], truth.model, hint, { mirrored: false, leftHanded: false });
    const guess = makePose(Hs, truth.model, W, H);
    // The markers land exactly; the rest of the board within a fraction of a cell.
    const back = markerHintPlanePoints(truth.model, hint).map((p) => applyHomography(Hs, p.x, p.y));
    for (let k = 0; k < 2; k++) expect(Math.hypot(back[k].x - at[k].x, back[k].y - at[k].y)).toBeLessThan(1e-6);
    expect(poseDistancePx(guess, truth, { min: 3, max: 12 })).toBeLessThan(4);
    // Same-colour markers: both assignments are offered.
    expect(markerHypotheses(at[0], at[1], truth.model, hint, {}, true)).toHaveLength(2);
  });

  it('reads the fret numbering off the cells the blobs sit in', () => {
    const exp = expectMarkers(truth.H, truth.model, hint);
    const blob = (k: number, cells = 0) => {
      // Slide along the neck by whole cells: re-project the marker `cells` frets further.
      const p = markerHintPlanePoints(truth.model, { ...hint, frets: [hint.frets[k] + cells] })[0];
      const q = applyHomography(truth.H, p.x, p.y);
      return { x: q.x, y: q.y, area: 9, score: 1 };
    };
    expect(readMarkerNumbering(truth.H, truth.model, hint, [blob(0), blob(1)])).toEqual({ delta: 0, seen: 2, conflicts: 0 });
    // The pose is one fret off: the blobs sit one cell lower than it thinks.
    expect(readMarkerNumbering(truth.H, truth.model, hint, [blob(0, -1), blob(1, -1)])).toEqual({ delta: 1, seen: 2, conflicts: 0 });
    expect(readMarkerNumbering(truth.H, truth.model, hint, [null, blob(1, 2)])).toEqual({ delta: -2, seen: 1, conflicts: 0 });
    // A blob far from the bass edge (on the hand, the body) is not a marker.
    const stray = { x: exp[0].at.x, y: exp[0].at.y + 6 * exp[0].acrossPx, area: 9, score: 1 };
    expect(readMarkerNumbering(truth.H, truth.model, hint, [stray, null])).toBeNull();
  });
});

describe('MarkerAnchor.check', () => {
  const truth = poseFromTaps({ nut: [{ x: 300, y: 70 }, { x: 301, y: 92 }], fret: [{ x: 110, y: 74 }, { x: 112, y: 103 }] }, W, H) as FretboardPose;
  const hint: MarkerHint = { frets: [5, 12] };
  /** A frame with pink tape where the true board has its markers (on `shown` of the two). */
  const frameFor = (shown: [boolean, boolean]): Frame => {
    const pts = markerHintPlanePoints(truth.model, hint).map((p) => applyHomography(truth.H, p.x, p.y));
    return frameWith(pts.filter((_, k) => shown[k]).map((p) => ({ x: p.x, y: p.y, size: 4, rgb: PINK })));
  };
  const both = frameFor([true, true]);
  const pink = sampleMarkerColor(both, markerHintPlanePoints(truth.model, hint).map((p) => applyHomography(truth.H, p.x, p.y))[0]) as MarkerColor;
  const colored: MarkerHint = { ...hint, colors: [pink] };

  it('confirms right numbers and fixes a guess at once when both markers agree', () => {
    const a = new MarkerAnchor();
    const ok = a.check(both, { ...truth, numbering: 'nut', numberingConfidence: 0.7 }, colored);
    expect(ok.numbering).toBe('markers');
    expect(ok.numberingConfidence).toBeGreaterThanOrEqual(0.97);
    const guess = renumberPose({ ...truth, numbering: 'assumed', numberingConfidence: 0.2 }, 2);
    const fixed = a.check(both, guess, colored);
    expect(fixed.numbering).toBe('markers');
    expect(poseDistancePx(fixed, truth)).toBeLessThan(0.1);
  });

  it('needs two frames to overrule numbers read off the nut, and one marker never decides a guess', () => {
    const a = new MarkerAnchor();
    const firm = renumberPose({ ...truth, numbering: 'nut', numberingConfidence: 0.8 }, 1);
    expect(a.check(both, firm, colored)).toBe(firm);
    expect(poseDistancePx(a.check(both, firm, colored), truth)).toBeLessThan(0.1);
    const one = frameFor([true, false]);
    const b = new MarkerAnchor();
    const guess = { ...truth, numbering: 'assumed' as const, numberingConfidence: 0.2 };
    for (let i = 0; i < 5; i++) expect(b.check(one, guess, colored)).toBe(guess);
    const shifted = renumberPose(guess, 1);
    for (let i = 0; i < 5; i++) expect(b.check(one, shifted, colored)).toBe(shifted);
    // ... but it backs up numbers that rest on something.
    expect(b.check(one, { ...truth, numbering: 'nut', numberingConfidence: 0.7 }, colored).numbering).toBe('markers');
  });
});
