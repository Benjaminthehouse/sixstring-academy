import { describe, expect, it } from 'vitest';
import {
  IDENTITY,
  MARKER_CELL_FRACTION,
  NECK_PRESETS,
  applyHomography,
  boardEdgeY,
  boardEdgePlaneLine,
  boardOutline,
  boardWidthAt,
  checkPlausibleView,
  clipPolygonToFrame,
  comparePoses,
  composeHomographies,
  computeVisibleFrets,
  confirmFretAt,
  createPoseSmoother,
  createRng,
  decomposeHomography,
  determinant,
  expectedOrientation,
  extrapolatePose,
  fitLine,
  fretAtX,
  fretCellAtX,
  fretPlaneLine,
  fretSpacing,
  fretSpacingPx,
  fretX,
  homographyFromLineSegments,
  homographyFromPoints,
  homographyFromPointsOnLines,
  homographyJacobian,
  homographyOrientation,
  inlayPositions,
  interpolatePoses,
  intersectLines,
  invertHomography,
  lineThrough,
  locatePixel,
  makePose,
  markerHintPlanePoints,
  markerPlanePosition,
  mirrorPose,
  multiply,
  nearestStringAt,
  neckModel,
  normalizeHomography,
  percentile,
  pointLineDistance,
  poseControlPoints,
  poseDistancePx,
  poseFromCalibrationTaps,
  projectFretWire,
  projectMarker,
  projectString,
  projectStringAt,
  ransac,
  ransacHomography,
  renumberPose,
  reprojectionErrors,
  scalePose,
  stringPlaneLine,
  stringSpacingAt,
  stringY,
  toGray,
  transformLine,
  type PointOnLine,
  type SegmentOnLine,
} from './geometry';
import type { FretboardPose, Mat3, NeckModel, Point } from './types';

const W = 640;
const H = 360;

/** A pinhole view of the neck plane: right-handed player, true image, like the benchmark renderer. */
function cameraHomography(opts: { focal?: number; rollDeg?: number; yawDeg?: number; pitchDeg?: number; pxPerMm?: number; anchorX?: number; u?: number; v?: number } = {}, model: NeckModel = NECK_PRESETS.steel): Mat3 {
  const f = opts.focal ?? 520;
  // Positive roll raises the headstock (the usual playing posture), as in the benchmark renderer.
  const roll = (-(opts.rollDeg ?? 12) * Math.PI) / 180;
  const yaw = ((opts.yawDeg ?? 18) * Math.PI) / 180;
  const pitch = ((opts.pitchDeg ?? 14) * Math.PI) / 180;
  const scale = opts.pxPerMm ?? 1.05;
  // Neck axes in camera coordinates (X right, Y down, Z forward), fronto-parallel first.
  let a = [-1, 0, 0];
  let b = [0, Math.cos(pitch), -Math.sin(pitch)];
  const ry = (p: number[]): number[] => [Math.cos(yaw) * p[0] + Math.sin(yaw) * p[2], p[1], -Math.sin(yaw) * p[0] + Math.cos(yaw) * p[2]];
  const rz = (p: number[]): number[] => [Math.cos(roll) * p[0] - Math.sin(roll) * p[1], Math.sin(roll) * p[0] + Math.cos(roll) * p[1], p[2]];
  a = rz(ry(a));
  b = rz(ry(b));
  const Z = f / scale;
  const u = (opts.u ?? 0.5) * W;
  const v = (opts.v ?? 0.5) * H;
  const anchor = [((u - W / 2) * Z) / f, ((v - H / 2) * Z) / f, Z];
  const ax = opts.anchorX ?? fretX(model, 7);
  const ay = model.nutWidth / 2;
  const t = [anchor[0] - ax * a[0] - ay * b[0], anchor[1] - ax * a[1] - ay * b[1], anchor[2] - ax * a[2] - ay * b[2]];
  const cx = W / 2;
  const cy = H / 2;
  return [
    f * a[0] + cx * a[2], f * b[0] + cx * b[2], f * t[0] + cx * t[2],
    f * a[1] + cy * a[2], f * b[1] + cy * b[2], f * t[1] + cy * t[2],
    a[2], b[2], t[2],
  ];
}

function poseOf(Hm: Mat3, model: NeckModel = NECK_PRESETS.steel, extras: Partial<FretboardPose> = {}): FretboardPose {
  return makePose(Hm, model, W, H, { numbering: 'nut', numberingConfidence: 1, ...extras });
}

function expectMatClose(a: Mat3, b: Mat3, tol = 1e-9): void {
  const na = normalizeHomography(a);
  const nb = normalizeHomography(b);
  for (let i = 0; i < 9; i++) expect(Math.abs(na[i] - nb[i])).toBeLessThan(tol * Math.max(1, Math.abs(nb[i])));
}

function gauss(rng: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}

describe('neck model', () => {
  it('places frets by the twelfth-root-of-two rule', () => {
    for (const model of Object.values(NECK_PRESETS)) {
      expect(fretX(model, 0)).toBe(0);
      expect(fretX(model, 12)).toBeCloseTo(model.scaleLength / 2, 9);
      expect(fretX(model, 24)).toBeCloseTo(model.scaleLength * 0.75, 9);
      for (let n = 1; n < model.fretCount; n++) {
        // Each cell is 2^(-1/12) as long as the one before it.
        expect(fretSpacing(model, n + 1) / fretSpacing(model, n)).toBeCloseTo(Math.pow(2, -1 / 12), 9);
        expect(fretAtX(model, fretX(model, n))).toBeCloseTo(n, 9);
      }
    }
    // Sanity against a real instrument: first fret of a 648 mm scale is 36.4 mm from the nut.
    expect(fretX(NECK_PRESETS.electric, 1)).toBeCloseTo(36.37, 2);
  });

  it('assigns cells: fret n is played between wire n-1 and wire n', () => {
    const m = NECK_PRESETS.steel;
    expect(fretCellAtX(m, -5)).toBe(0);
    expect(fretCellAtX(m, 0)).toBe(0);
    expect(fretCellAtX(m, 1)).toBe(1);
    expect(fretCellAtX(m, fretX(m, 4) + 0.01)).toBe(5);
    expect(fretCellAtX(m, fretX(m, 5) - 0.01)).toBe(5);
    expect(fretCellAtX(m, fretX(m, 5))).toBe(5);
    expect(fretCellAtX(m, m.scaleLength + 10)).toBe(m.fretCount + 1);
  });

  it('orders strings bass to treble across y and keeps them on the board', () => {
    for (const m of Object.values(NECK_PRESETS)) {
      for (const n of [0, 5, 12, m.fretCount]) {
        const x = fretX(m, n);
        for (let s = m.stringCount; s > 1; s--) expect(stringY(m, s, x)).toBeLessThan(stringY(m, s - 1, x));
        expect(stringY(m, m.stringCount, x)).toBeGreaterThan(boardEdgeY(m, x, 'bass') + 2);
        expect(stringY(m, 1, x)).toBeLessThan(boardEdgeY(m, x, 'treble') - 2);
        expect(stringSpacingAt(m, x) * 5).toBeCloseTo(stringY(m, 1, x) - stringY(m, 6, x), 9);
      }
      expect(boardEdgeY(m, 0, 'bass')).toBe(0);
      expect(boardEdgeY(m, 0, 'treble')).toBe(m.nutWidth);
      expect(boardWidthAt(m, m.scaleLength / 2)).toBeCloseTo(m.width12, 9);
    }
  });

  it('finds the nearest string and puts markers just behind the wire', () => {
    const m = NECK_PRESETS.electric;
    for (let s = 1; s <= 6; s++) {
      for (let f = 0; f <= m.fretCount; f++) {
        const p = markerPlanePosition(m, s, f);
        expect(fretCellAtX(m, p.x)).toBe(f);
        const near = nearestStringAt(m, Math.max(0, p.x), p.y);
        expect(near.string).toBe(s);
        expect(Math.abs(near.offset)).toBeLessThan(1e-9);
        if (f > 0) {
          const frac = (p.x - fretX(m, f - 1)) / fretSpacing(m, f);
          expect(frac).toBeCloseTo(MARKER_CELL_FRACTION, 9);
          expect(frac).toBeGreaterThan(0.5);
        }
      }
    }
    expect(nearestStringAt(m, 100, stringY(m, 3, 100) + 0.3 * stringSpacingAt(m, 100)).offset).toBeCloseTo(0.3, 9);
  });

  it('places marker-mode stickers mid-cell on the chosen edge', () => {
    const m = NECK_PRESETS.steel;
    const bass = markerHintPlanePoints(m, { frets: [3, 12] });
    expect(bass).toHaveLength(2);
    expect(bass[0].x).toBeCloseTo((fretX(m, 2) + fretX(m, 3)) / 2, 9);
    expect(bass[0].y).toBeCloseTo(boardEdgeY(m, bass[0].x, 'bass'), 9);
    expect(bass[1].x).toBeCloseTo((fretX(m, 11) + fretX(m, 12)) / 2, 9);
    const treble = markerHintPlanePoints(m, { frets: [5], placement: 'treble-edge' });
    expect(treble[0].y).toBeCloseTo(boardEdgeY(m, treble[0].x, 'treble'), 9);
    expect(markerHintPlanePoints(m, { frets: [7], placement: 'board' })[0].y).toBe(m.nutWidth / 2);
    // Two stickers plus the two edge lines they do not sit on are not enough for a pose, but they pin the numbering.
    expect(fretCellAtX(m, bass[0].x)).toBe(3);
    expect(fretCellAtX(m, bass[1].x)).toBe(12);
  });

  it('lists inlays with a double dot at 12 and applies overrides', () => {
    const dots = inlayPositions(NECK_PRESETS.electric);
    expect(dots.filter((d) => d.fret === 12)).toHaveLength(2);
    expect(dots.map((d) => d.fret).filter((f, i, a) => a.indexOf(f) === i)).toEqual([3, 5, 7, 9, 12, 15, 17, 19, 21]);
    const dot5 = dots.find((d) => d.fret === 5) as { x: number };
    expect(dot5.x).toBeCloseTo((fretX(NECK_PRESETS.electric, 4) + fretX(NECK_PRESETS.electric, 5)) / 2, 9);
    const custom = neckModel('electric', { scaleLength: 628 });
    expect(custom.preset).toBe('custom');
    expect(custom.nutWidth).toBe(NECK_PRESETS.electric.nutWidth);
    expect(neckModel().preset).toBe('steel');
  });
});

describe('homography basics', () => {
  const Hm = cameraHomography();

  it('round-trips points through a homography and its inverse', () => {
    const inv = invertHomography(Hm) as Mat3;
    expect(inv).not.toBeNull();
    for (const [x, y] of [[0, 0], [120, 30], [400, -5], [-80, 50]]) {
      const p = applyHomography(Hm, x, y);
      const q = applyHomography(inv, p.x, p.y);
      expect(q.x).toBeCloseTo(x, 7);
      expect(q.y).toBeCloseTo(y, 7);
    }
    expectMatClose(multiply(Hm, inv), IDENTITY, 1e-9);
    expect(invertHomography([1, 2, 3, 2, 4, 6, 0, 0, 1])).toBeNull();
    expect(invertHomography([NaN, 0, 0, 0, 1, 0, 0, 0, 1])).toBeNull();
  });

  it('composes in application order', () => {
    const shift: Mat3 = [1, 0, 10, 0, 1, -4, 0, 0, 1];
    const scale: Mat3 = [2, 0, 0, 0, 3, 0, 0, 0, 1];
    const both = composeHomographies(shift, scale);
    const p = applyHomography(both, 1, 1);
    expect(p).toEqual({ x: 22, y: -9 });
    expect(determinant(scale)).toBe(6);
    const three = composeHomographies(Hm, shift, scale);
    const q = applyHomography(Hm, 200, 20);
    const r = applyHomography(three, 200, 20);
    expect(r.x).toBeCloseTo((q.x + 10) * 2, 8);
    expect(r.y).toBeCloseTo((q.y - 4) * 3, 8);
  });

  it('has a Jacobian that matches finite differences', () => {
    const j = homographyJacobian(Hm, 210, 25);
    const e = 1e-4;
    const p = applyHomography(Hm, 210, 25);
    const px = applyHomography(Hm, 210 + e, 25);
    const py = applyHomography(Hm, 210, 25 + e);
    expect(j[0]).toBeCloseTo((px.x - p.x) / e, 4);
    expect(j[2]).toBeCloseTo((px.y - p.y) / e, 4);
    expect(j[1]).toBeCloseTo((py.x - p.x) / e, 4);
    expect(j[3]).toBeCloseTo((py.y - p.y) / e, 4);
  });

  it('knows which way round a view is', () => {
    const m = NECK_PRESETS.steel;
    // Right-handed player in a true image: the mapping reflects.
    expect(homographyOrientation(Hm, 200, 20)).toBe(-1);
    expect(expectedOrientation(false, false)).toBe(-1);
    const mirrored = mirrorPose(poseOf(Hm));
    expect(mirrored.mirrored).toBe(true);
    expect(homographyOrientation(mirrored.H, 200, 20)).toBe(1);
    expect(expectedOrientation(true, false)).toBe(1);
    expect(expectedOrientation(false, true)).toBe(1);
    expect(expectedOrientation(true, true)).toBe(-1);
    // The nut is to the right of the 12th fret for a right-handed player facing the camera.
    expect(applyHomography(Hm, 0, m.nutWidth / 2).x).toBeGreaterThan(applyHomography(Hm, m.scaleLength / 2, m.nutWidth / 2).x);
    // ...and the bass edge is above the treble edge.
    expect(applyHomography(Hm, 200, boardEdgeY(m, 200, 'bass')).y).toBeLessThan(applyHomography(Hm, 200, boardEdgeY(m, 200, 'treble')).y);
  });

  it('handles lines: through, intersect, transform, fit', () => {
    const l = lineThrough({ x: 0, y: 0 }, { x: 10, y: 0 }) as [number, number, number];
    expect(Math.abs(pointLineDistance(l, { x: 5, y: 3 }))).toBeCloseTo(3, 12);
    expect(lineThrough({ x: 1, y: 1 }, { x: 1, y: 1 })).toBeNull();
    const m = lineThrough({ x: 4, y: -2 }, { x: 4, y: 9 }) as [number, number, number];
    const cross = intersectLines(l, m) as Point;
    expect(cross.x).toBeCloseTo(4, 12);
    expect(cross.y).toBeCloseTo(0, 12);
    expect(intersectLines(l, l)).toBeNull();
    // A fret wire stays a line: both projected ends lie on the transformed line.
    const model = NECK_PRESETS.steel;
    const image = transformLine(Hm, fretPlaneLine(model, 7)) as [number, number, number];
    const [a, b] = projectFretWire({ H: Hm, model }, 7);
    expect(Math.abs(pointLineDistance(image, a))).toBeLessThan(1e-7);
    expect(Math.abs(pointLineDistance(image, b))).toBeLessThan(1e-7);
    const edge = transformLine(Hm, boardEdgePlaneLine(model, 'treble')) as [number, number, number];
    expect(Math.abs(pointLineDistance(edge, b))).toBeLessThan(1e-7);
    const str = transformLine(Hm, stringPlaneLine(model, 2)) as [number, number, number];
    expect(Math.abs(pointLineDistance(str, projectStringAt({ H: Hm, model }, 2, 300)))).toBeLessThan(1e-7);
    const rng = createRng(4);
    const pts: Point[] = [];
    for (let i = 0; i < 50; i++) pts.push({ x: i, y: 3 + 0.5 * i + 0.01 * gauss(rng) });
    const fit = fitLine(pts) as [number, number, number];
    expect(Math.abs(-fit[0] / fit[1] - 0.5)).toBeLessThan(1e-3);
    expect(Math.abs(pointLineDistance(fit, { x: 0, y: 3 }))).toBeLessThan(0.02);
    expect(fitLine([{ x: 1, y: 1 }])).toBeNull();
    expect(fitLine([{ x: 1, y: 1 }, { x: 1, y: 1 }])).toBeNull();
    // Vertical lines are no special case.
    const vertical = fitLine([{ x: 2, y: 0 }, { x: 2, y: 5 }, { x: 2, y: 9 }]) as [number, number, number];
    expect(Math.abs(pointLineDistance(vertical, { x: 5, y: 100 }))).toBeCloseTo(3, 9);
  });
});

describe('homography estimation', () => {
  const model = NECK_PRESETS.steel;
  const truth = cameraHomography({ yawDeg: 30, pitchDeg: 20, rollDeg: -15 });

  function gridPoints(): Point[] {
    const pts: Point[] = [];
    for (let n = 0; n <= 14; n += 2) for (const s of [1, 3, 6]) pts.push({ x: fretX(model, n), y: stringY(model, s, fretX(model, n)) });
    return pts;
  }

  it('recovers a known homography exactly from four points', () => {
    const src = [{ x: 0, y: 0 }, { x: 0, y: 43 }, { x: 322, y: 48 }, { x: 322, y: -5 }];
    const dst = src.map((p) => applyHomography(truth, p.x, p.y));
    const est = homographyFromPoints(src, dst) as Mat3;
    expect(est).not.toBeNull();
    expectMatClose(est, truth, 1e-7);
    expect(est[8]).toBe(1);
    expect(Math.max(...reprojectionErrors(est, src, dst))).toBeLessThan(1e-8);
  });

  it('recovers a known homography from many noisy points', () => {
    const rng = createRng(11);
    const src = gridPoints();
    for (const sigma of [0.3, 1.0]) {
      const dst = src.map((p) => {
        const q = applyHomography(truth, p.x, p.y);
        return { x: q.x + sigma * gauss(rng), y: q.y + sigma * gauss(rng) };
      });
      const est = homographyFromPoints(src, dst) as Mat3;
      expect(est).not.toBeNull();
      // Compare where markers would land rather than raw matrix entries.
      let worst = 0;
      for (let f = 1; f <= 14; f++) {
        for (let s = 1; s <= 6; s++) {
          const a = projectMarker({ H: est, model }, s, f);
          const b = projectMarker({ H: truth, model }, s, f);
          worst = Math.max(worst, Math.hypot(a.x - b.x, a.y - b.y));
        }
      }
      expect(worst).toBeLessThan(2.2 * sigma);
    }
  });

  it('honours weights', () => {
    const src = gridPoints();
    const dst = src.map((p) => applyHomography(truth, p.x, p.y));
    const weights = src.map(() => 1);
    dst[3] = { x: dst[3].x + 40, y: dst[3].y - 25 };
    const skewed = homographyFromPoints(src, dst) as Mat3;
    weights[3] = 1e-9;
    const fixed = homographyFromPoints(src, dst, weights) as Mat3;
    const probe = applyHomography(truth, 150, 20);
    const a = applyHomography(skewed, 150, 20);
    const b = applyHomography(fixed, 150, 20);
    expect(Math.hypot(a.x - probe.x, a.y - probe.y)).toBeGreaterThan(0.5);
    expect(Math.hypot(b.x - probe.x, b.y - probe.y)).toBeLessThan(1e-4);
  });

  it('rejects degenerate input', () => {
    const sq = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    expect(homographyFromPoints(sq.slice(0, 3), sq.slice(0, 3))).toBeNull();
    // All collinear.
    const line = [0, 1, 2, 3, 4].map((i) => ({ x: i * 10, y: i * 5 }));
    expect(homographyFromPoints(line, line.map((p) => ({ x: p.x + 3, y: p.y * 2 })))).toBeNull();
    // Three of four collinear, mapped to a proper quad: no invertible homography exists.
    const three = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 4, y: 7 }];
    expect(homographyFromPoints(three, sq)).toBeNull();
    // Three collinear on both sides: not unique.
    expect(homographyFromPoints(three, three.map((p) => ({ x: 2 * p.x + 1, y: 3 * p.y - 2 })))).toBeNull();
    // Repeated points.
    const same = [{ x: 3, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 3 }];
    expect(homographyFromPoints(same, sq)).toBeNull();
    expect(homographyFromPoints(sq, same)).toBeNull();
    expect(homographyFromPoints([sq[0], sq[0], sq[1], sq[2]], sq)).toBeNull();
    // Non-finite.
    expect(homographyFromPoints(sq, [{ x: NaN, y: 0 }, sq[1], sq[2], sq[3]])).toBeNull();
    expect(homographyFromPoints(sq, [{ x: Infinity, y: 0 }, sq[1], sq[2], sq[3]])).toBeNull();
    // A bow-tie target sends part of the square through infinity.
    expect(homographyFromPoints(sq, [sq[0], sq[1], sq[3], sq[2]])).toBeNull();
    // A proper quad is of course accepted.
    expect(homographyFromPoints(sq, [{ x: 10, y: 10 }, { x: 60, y: 14 }, { x: 55, y: 70 }, { x: 8, y: 50 }])).not.toBeNull();
  });

  it('fits from points on fret wires and board edges without point-to-point matches', () => {
    const rng = createRng(21);
    const obs: PointOnLine[] = [];
    // Points at arbitrary heights along several fret wires...
    for (const n of [1, 3, 4, 6, 9, 12]) {
      const line = fretPlaneLine(model, n);
      for (let k = 0; k < 3; k++) {
        const y = rng() * 40;
        obs.push({ point: applyHomography(truth, fretX(model, n), y), line });
      }
    }
    // ...and at arbitrary positions along both board edges.
    for (const side of ['bass', 'treble'] as const) {
      const line = boardEdgePlaneLine(model, side);
      for (let k = 0; k < 5; k++) {
        const x = rng() * 330;
        obs.push({ point: applyHomography(truth, x, boardEdgeY(model, x, side)), line });
      }
    }
    const est = homographyFromPointsOnLines(obs) as Mat3;
    expect(est).not.toBeNull();
    for (let f = 1; f <= 14; f++) {
      const a = projectMarker({ H: est, model }, 3, f);
      const b = projectMarker({ H: truth, model }, 3, f);
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-5);
    }
    // With pixel noise the fit degrades gracefully.
    const noisy = obs.map((o) => ({ ...o, point: { x: o.point.x + 0.4 * gauss(rng), y: o.point.y + 0.4 * gauss(rng) } }));
    const est2 = homographyFromPointsOnLines(noisy) as Mat3;
    expect(est2).not.toBeNull();
    for (let f = 1; f <= 14; f++) {
      const a = projectMarker({ H: est2, model }, 3, f);
      const b = projectMarker({ H: truth, model }, 3, f);
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(3);
    }
    // Fret wires alone say nothing about the position across the neck.
    expect(homographyFromPointsOnLines(obs.filter((o) => o.line[1] === 0))).toBeNull();
    expect(homographyFromPointsOnLines(obs.slice(0, 5))).toBeNull();
    // Two point pairs replace four line constraints.
    const pairs = [
      { plane: { x: 0, y: 0 }, image: applyHomography(truth, 0, 0) },
      { plane: { x: 300, y: 50 }, image: applyHomography(truth, 300, 50) },
    ];
    const mixed = homographyFromPointsOnLines(obs.filter((_, i) => i % 3 === 0), pairs) as Mat3;
    expect(mixed).not.toBeNull();
    const pm = applyHomography(mixed, 150, 20);
    const pt = applyHomography(truth, 150, 20);
    expect(Math.hypot(pm.x - pt.x, pm.y - pt.y)).toBeLessThan(1e-5);
  });

  it('fits from line correspondences: image segments assigned to fret wires and board edges', () => {
    const segments: SegmentOnLine[] = [];
    // A line detector finds a stretch of each wire, never its exact ends.
    for (const n of [0, 2, 5, 7, 10, 12]) {
      const x = fretX(model, n);
      segments.push({ line: fretPlaneLine(model, n), a: applyHomography(truth, x, 6 + n), b: applyHomography(truth, x, 40 - n) });
    }
    for (const side of ['bass', 'treble'] as const) {
      segments.push({ line: boardEdgePlaneLine(model, side), a: applyHomography(truth, 30, boardEdgeY(model, 30, side)), b: applyHomography(truth, 290, boardEdgeY(model, 290, side)) });
    }
    const est = homographyFromLineSegments(segments) as Mat3;
    expect(est).not.toBeNull();
    for (let f = 0; f <= 14; f++) {
      for (const st of [1, 6]) {
        const a = projectMarker({ H: est, model }, st, f);
        const b = projectMarker({ H: truth, model }, st, f);
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-5);
      }
    }
    // Strings work as the second direction too.
    const withStrings = homographyFromLineSegments([
      ...segments.slice(0, 6),
      { line: stringPlaneLine(model, 1), a: projectStringAt({ H: truth, model }, 1, 20), b: projectStringAt({ H: truth, model }, 1, 300) },
      { line: stringPlaneLine(model, 6), a: projectStringAt({ H: truth, model }, 6, 50), b: projectStringAt({ H: truth, model }, 6, 280) },
    ]) as Mat3;
    expect(withStrings).not.toBeNull();
    const pa = applyHomography(withStrings, 200, 30);
    const pb = applyHomography(truth, 200, 30);
    expect(Math.hypot(pa.x - pb.x, pa.y - pb.y)).toBeLessThan(1e-5);
    // Wires alone, or too few lines, do not determine a pose.
    expect(homographyFromLineSegments(segments.slice(0, 6))).toBeNull();
    expect(homographyFromLineSegments(segments.slice(0, 3))).toBeNull();
  });

  it('survives outliers with RANSAC and is reproducible', () => {
    const rng = createRng(5);
    const src: Point[] = [];
    const dst: Point[] = [];
    for (let i = 0; i < 60; i++) {
      const p = { x: rng() * 400, y: rng() * 50 };
      const q = applyHomography(truth, p.x, p.y);
      src.push(p);
      if (i % 5 < 2) dst.push({ x: rng() * W, y: rng() * H });
      else dst.push({ x: q.x + 0.3 * gauss(rng), y: q.y + 0.3 * gauss(rng) });
    }
    const a = ransacHomography(src, dst, { threshold: 1.5, rng: createRng(9) });
    const b = ransacHomography(src, dst, { threshold: 1.5, rng: createRng(9) });
    expect(a).not.toBeNull();
    expect(a).toEqual(b);
    const res = a as { H: Mat3; inliers: number[] };
    expect(res.inliers.length).toBeGreaterThanOrEqual(34);
    expect(res.inliers.every((i) => i % 5 >= 2 || reprojectionErrors(res.H, [src[i]], [dst[i]])[0] <= 1.5)).toBe(true);
    const p = applyHomography(res.H, 200, 25);
    const q = applyHomography(truth, 200, 25);
    expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeLessThan(0.5);
    expect(ransacHomography(src.slice(0, 3), dst.slice(0, 3), { threshold: 1 })).toBeNull();
  });

  it('runs generic RANSAC on a line with outliers', () => {
    const rng = createRng(77);
    const pts: Point[] = [];
    for (let i = 0; i < 40; i++) pts.push(i % 4 === 0 ? { x: rng() * 100, y: rng() * 100 } : { x: i, y: 2 * i + 1 + 0.05 * gauss(rng) });
    const res = ransac<Point, [number, number, number]>({
      data: pts,
      sampleSize: 2,
      fit: (s) => fitLine(s) as [number, number, number] | null,
      error: (l, p) => Math.abs(pointLineDistance(l, p)),
      threshold: 0.3,
      rng: createRng(3),
    });
    expect(res).not.toBeNull();
    const line = (res as { model: [number, number, number] }).model;
    expect(-line[0] / line[1]).toBeCloseTo(2, 1);
    expect((res as { inliers: number[] }).inliers.length).toBeGreaterThanOrEqual(30);
    expect(ransac({ data: [1], sampleSize: 2, fit: () => 1, error: () => 0, threshold: 1 })).toBeNull();
  });
});

describe('decomposition and plausibility', () => {
  const model = NECK_PRESETS.steel;

  it('recovers focal length and tilt of a synthetic camera', () => {
    for (const [yaw, pitch, focal] of [[30, 20, 520], [-20, 35, 430], [40, 0, 700], [10, 28, 560]]) {
      const Hm = cameraHomography({ yawDeg: yaw, pitchDeg: pitch, focal, rollDeg: 20 });
      const view = decomposeHomography(Hm, W, H);
      expect(view).not.toBeNull();
      const v = view as NonNullable<typeof view>;
      const trueTilt = (Math.acos(Math.cos((yaw * Math.PI) / 180) * Math.cos((pitch * Math.PI) / 180)) * 180) / Math.PI;
      expect(v.focalFromData).toBe(true);
      expect(v.focalPx / focal).toBeGreaterThan(0.97);
      expect(v.focalPx / focal).toBeLessThan(1.03);
      expect(Math.abs(v.tiltDeg - trueTilt)).toBeLessThan(1.5);
      expect(v.aspect).toBeCloseTo(1, 2);
      expect(Math.abs(v.skew)).toBeLessThan(0.01);
      // The helper's matrix is exactly K [a b t], so the true camera-to-nut distance can be read off it.
      const t = [(Hm[2] - (W / 2) * Hm[8]) / focal, (Hm[5] - (H / 2) * Hm[8]) / focal, Hm[8]];
      const trueDistance = Math.hypot(t[0], t[1], t[2]);
      expect(v.distanceMm / trueDistance).toBeGreaterThan(0.96);
      expect(v.distanceMm / trueDistance).toBeLessThan(1.04);
      // Any overall scale of the matrix gives the same answer.
      const scaled = Hm.map((x) => x * -3.7) as unknown as Mat3;
      expect((decomposeHomography(scaled, W, H) as { distanceMm: number }).distanceMm).toBeCloseTo(v.distanceMm, 6);
    }
  });

  it('copes with a front-on view where the focal length is unobservable', () => {
    const Hm = cameraHomography({ yawDeg: 0, pitchDeg: 0, rollDeg: 10 });
    const v = decomposeHomography(Hm, W, H);
    expect(v).not.toBeNull();
    expect((v as { focalFromData: boolean }).focalFromData).toBe(false);
    expect((v as { tiltDeg: number }).tiltDeg).toBeLessThan(1);
    expect((v as { aspect: number }).aspect).toBeCloseTo(1, 6);
    // Right-handed, true image, headstock raised by 10 degrees: nut -> bridge points left and down.
    expect((v as { rollDeg: number }).rollDeg).toBeCloseTo(170, 4);
    expect(decomposeHomography([NaN, 0, 0, 0, 1, 0, 0, 0, 1], W, H)).toBeNull();
  });

  it('accepts real views and rejects impossible ones', () => {
    for (const yaw of [-25, 0, 25, 45]) {
      for (const pitch of [0, 20, 38]) {
        const Hm = cameraHomography({ yawDeg: yaw, pitchDeg: pitch, rollDeg: 25 });
        const rep = checkPlausibleView(Hm, model, W, H, { mirrored: false, leftHanded: false });
        expect(rep.reasons).toEqual([]);
        expect(rep.plausible).toBe(true);
      }
    }
    const good = cameraHomography();
    // Wrong handedness flags: we would be looking at the back of the neck.
    expect(checkPlausibleView(good, model, W, H, { mirrored: true, leftHanded: false }).reasons).toContain('orientation');
    // Squashed across the neck by 4x: no camera does that at a believable tilt.
    const squashed = multiply(good, [1, 0, 0, 0, 0.2, 0, 0, 0, 1]);
    expect(checkPlausibleView(squashed, model, W, H).plausible).toBe(false);
    // Sheared.
    const sheared = multiply(good, [1, 0, 0, 0.9, 1, 0, 0, 0, 1]);
    expect(checkPlausibleView(sheared, model, W, H).reasons).toContain('skew');
    // Tiny.
    const tiny = multiply([0.05, 0, 300, 0, 0.05, 170, 0, 0, 1], good);
    expect(checkPlausibleView(tiny, model, W, H).reasons).toContain('too-small');
    // The horizon cuts through the board.
    const wild: Mat3 = [1, 0, 100, 0, 1, 100, 0.01, 0, -1];
    expect(checkPlausibleView(wild, model, W, H).reasons).toEqual(['behind-camera']);
    expect(checkPlausibleView([1, 0, 0, 0, NaN, 0, 0, 0, 1], model, W, H).reasons).toEqual(['not-finite']);
  });
});

describe('projection', () => {
  const model = NECK_PRESETS.electric;
  const Hm = cameraHomography({ yawDeg: 28, pitchDeg: 22, rollDeg: 18 }, model);
  const pose = poseOf(Hm, model);

  it('projects fret wires consistently with the fret formula', () => {
    const inv = invertHomography(Hm) as Mat3;
    let prev = 0;
    for (let n = 0; n <= model.fretCount; n++) {
      const [bass, treble] = projectFretWire(pose, n);
      const pb = applyHomography(inv, bass.x, bass.y);
      const pt = applyHomography(inv, treble.x, treble.y);
      expect(pb.x).toBeCloseTo(fretX(model, n), 6);
      expect(pt.x).toBeCloseTo(fretX(model, n), 6);
      expect(pt.y - pb.y).toBeCloseTo(boardWidthAt(model, fretX(model, n)), 6);
      if (n >= 2) expect((pb.x - prev) / (prev - fretX(model, n - 2))).toBeCloseTo(Math.pow(2, -1 / 12), 6);
      prev = pb.x;
      // Bass edge above treble edge in the image.
      expect(bass.y).toBeLessThan(treble.y);
    }
    // In the image the cells also shrink toward the body here (perspective could undo that, the plane cannot).
    expect(fretSpacingPx(pose, 2)).toBeGreaterThan(fretSpacingPx(pose, 12));
    expect(fretSpacingPx(pose, 0)).toBe(fretSpacingPx(pose, 1));
  });

  it('maps markers back to their own string and fret', () => {
    for (let s = 1; s <= 6; s++) {
      for (let f = 0; f <= model.fretCount; f++) {
        const p = projectMarker(pose, s, f);
        const loc = locatePixel(pose, p);
        expect(loc).not.toBeNull();
        const l = loc as NonNullable<typeof loc>;
        expect(l.string).toBe(s);
        expect(l.fret).toBe(f);
        expect(Math.abs(l.stringOffset)).toBeLessThan(1e-6);
        expect(l.onBoard).toBe(f > 0);
      }
    }
    const [a, b] = projectString(pose, 4, 2, 9);
    const la = locatePixel(pose, a) as { string: number; fretExact: number };
    const lb = locatePixel(pose, b) as { string: number; fretExact: number };
    expect(la.string).toBe(4);
    expect(la.fretExact).toBeCloseTo(2, 6);
    expect(lb.fretExact).toBeCloseTo(9, 6);
    // A point off the side of the neck is located but flagged.
    const off = applyHomography(Hm, 100, -30);
    expect((locatePixel(pose, off) as { onBoard: boolean; string: number }).onBoard).toBe(false);
    expect((locatePixel(pose, off) as { string: number }).string).toBe(6);
    // The result does not depend on how H happens to be scaled.
    const negated = Hm.map((v) => -v) as unknown as Mat3;
    expect(locatePixel({ H: negated, model }, projectMarker(pose, 2, 5))).toMatchObject({ string: 2, fret: 5 });
    expect(computeVisibleFrets(negated, model, W, H)).toEqual(pose.visibleFrets);
  });

  it('reports the visible fret range and the board outline', () => {
    const vis = pose.visibleFrets;
    expect(vis.max).toBeGreaterThan(vis.min);
    for (let n = 0; n <= model.fretCount; n++) {
      const p = applyHomography(Hm, fretX(model, n), model.nutWidth / 2);
      const inside = p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H;
      expect(inside).toBe(n >= vis.min && n <= vis.max);
    }
    const far: Mat3 = [1, 0, 5000, 0, 1, 5000, 0, 0, 1];
    expect(computeVisibleFrets(far, model, W, H)).toEqual({ min: 0, max: -1 });
    const quad = boardOutline(pose);
    expect(quad).toHaveLength(4);
    expect(quad[0]).toEqual(projectFretWire(pose, 0)[0]);
    const part = boardOutline(pose, { min: 3, max: 9 });
    expect(part[1]).toEqual(projectFretWire(pose, 3)[1]);
    expect(part[2]).toEqual(projectFretWire(pose, 9)[1]);
    const clipped = boardOutline(pose, undefined, true);
    for (const p of clipped) {
      expect(p.x).toBeGreaterThanOrEqual(-1e-9);
      expect(p.x).toBeLessThanOrEqual(W + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(-1e-9);
      expect(p.y).toBeLessThanOrEqual(H + 1e-9);
    }
    expect(clipPolygonToFrame([{ x: -10, y: -10 }, { x: 10, y: -10 }, { x: 10, y: 10 }, { x: -10, y: 10 }], 100, 100)).toHaveLength(4);
    expect(clipPolygonToFrame([{ x: -10, y: -10 }, { x: -5, y: -10 }, { x: -5, y: -5 }], 100, 100)).toHaveLength(0);
  });
});

describe('pose transforms', () => {
  const model = NECK_PRESETS.steel;
  const Hm = cameraHomography({ yawDeg: 22, pitchDeg: 18, rollDeg: 14 });
  const pose = poseOf(Hm);

  it('scales and mirrors', () => {
    const big = scalePose(pose, 2);
    expect(big.frameWidth).toBe(2 * W);
    const a = projectMarker(pose, 3, 5);
    const b = projectMarker(big, 3, 5);
    expect(b.x).toBeCloseTo(2 * a.x, 9);
    expect(b.y).toBeCloseTo(2 * a.y, 9);
    expect(big.visibleFrets).toEqual(pose.visibleFrets);
    const m = mirrorPose(pose);
    const c = projectMarker(m, 3, 5);
    expect(c.x).toBeCloseTo(W - a.x, 9);
    expect(c.y).toBeCloseTo(a.y, 9);
    const back = mirrorPose(m);
    expect(back.mirrored).toBe(false);
    expectMatClose(back.H, pose.H, 1e-9);
  });

  it('renumbers frets exactly along the neck', () => {
    for (const delta of [-2, 1, 3]) {
      const shifted = renumberPose(pose, delta, 'user', 1);
      expect(shifted.numbering).toBe('user');
      for (let n = Math.max(0, -delta); n <= 12; n++) {
        const oldMid = applyHomography(pose.H, fretX(model, n), model.nutWidth / 2);
        const newMid = applyHomography(shifted.H, fretX(model, n + delta), model.nutWidth / 2);
        expect(Math.hypot(oldMid.x - newMid.x, oldMid.y - newMid.y)).toBeLessThan(1e-7);
        // The edges move by well under a string spacing.
        const oldEdge = applyHomography(pose.H, fretX(model, n), boardEdgeY(model, fretX(model, n), 'bass'));
        const newEdge = applyHomography(shifted.H, fretX(model, n + delta), boardEdgeY(model, fretX(model, n + delta), 'bass'));
        expect(Math.hypot(oldEdge.x - newEdge.x, oldEdge.y - newEdge.y)).toBeLessThan(2.5);
      }
      const err = comparePoses(shifted, pose);
      expect(err.numberingOffset).toBe(delta);
      expect(err.fretErrorAligned.max).toBeLessThan(1e-6);
      expect(err.cellAccuracyAligned).toBe(1);
      expect(err.cellAccuracy).toBeLessThan(0.05);
      // Shifting back restores the pose (exactly along the neck, to a fraction of a pixel across it).
      const back = renumberPose(shifted, -delta);
      expect(poseDistancePx(back, pose)).toBeLessThan(0.5);
      expect(comparePoses(back, pose).fretError.max).toBeLessThan(1e-6);
    }
    expect(renumberPose(pose, 0).H).toBe(pose.H);
  });

  it('confirms a fret with one tap', () => {
    // A detector locked on correctly but believes everything is two frets lower than it is.
    const wrong = renumberPose(pose, -2);
    const tap = projectMarker(pose, 3, 7);
    expect((locatePixel(wrong, tap) as { fret: number }).fret).toBe(5);
    const fixed = confirmFretAt(wrong, tap, 7) as FretboardPose;
    expect(fixed.numbering).toBe('user');
    expect(fixed.numberingConfidence).toBe(1);
    const err = comparePoses(fixed, pose);
    expect(err.numberingOffset).toBe(0);
    expect(err.cellAccuracy).toBe(1);
    expect(err.fretError.max).toBeLessThan(1e-6);
  });

  it('builds a pose from four calibration taps in any order', () => {
    const nut = projectFretWire(pose, 0);
    const twelve = projectFretWire(pose, 12);
    const orders: [[Point, Point], [Point, Point]][] = [
      [[nut[0], nut[1]], [twelve[0], twelve[1]]],
      [[nut[1], nut[0]], [twelve[0], twelve[1]]],
      [[nut[0], nut[1]], [twelve[1], twelve[0]]],
      [[nut[1], nut[0]], [twelve[1], twelve[0]]],
    ];
    for (const [n, f] of orders) {
      const cal = poseFromCalibrationTaps({ nut: n, fret: f }, W, H, { model: 'steel' }) as FretboardPose;
      expect(cal).not.toBeNull();
      expect(cal.numbering).toBe('user');
      const err = comparePoses(cal, pose);
      expect(err.cellAccuracy).toBe(1);
      expect(err.markerErrorPx.max).toBeLessThan(1e-6);
    }
    // A different reference fret.
    const seven = projectFretWire(pose, 7);
    const cal7 = poseFromCalibrationTaps({ nut, fret: seven, fretNumber: 7 }, W, H) as FretboardPose;
    expect(comparePoses(cal7, pose).markerErrorPx.max).toBeLessThan(1e-6);
    // Bass side down (the image is upside down): the same taps must give the flipped assignment.
    const flipped = poseFromCalibrationTaps({ nut, fret: twelve }, W, H, { bassSideUp: false }) as FretboardPose;
    expect(comparePoses(flipped, pose).bassSideCorrect).toBe(false);
    // A neck standing upright in the image: "up" is meaningless, the handedness flags decide.
    const upright = poseOf(cameraHomography({ rollDeg: 88, yawDeg: 5, pitchDeg: 5 }));
    const un = projectFretWire(upright, 0);
    const uf = projectFretWire(upright, 12);
    for (const n of [[un[0], un[1]], [un[1], un[0]]] as [Point, Point][]) {
      const cal = poseFromCalibrationTaps({ nut: n, fret: uf }, W, H) as FretboardPose;
      expect(comparePoses(cal, upright).cellAccuracy).toBe(1);
    }
    // Garbage taps.
    const p = { x: 10, y: 10 };
    expect(poseFromCalibrationTaps({ nut: [p, p], fret: [p, p] }, W, H)).toBeNull();
    expect(poseFromCalibrationTaps({ nut: [nut[0], nut[1]], fret: [nut[0], nut[1]] }, W, H)).toBeNull();
  });

  it('interpolates, extrapolates and measures distance', () => {
    const other = poseOf(cameraHomography({ yawDeg: 30, pitchDeg: 10, rollDeg: 20, u: 0.55 }));
    expect(poseDistancePx(interpolatePoses(pose, other, 0), pose)).toBeLessThan(1e-6);
    expect(poseDistancePx(interpolatePoses(pose, other, 1), other)).toBeLessThan(1e-6);
    const half = interpolatePoses(pose, other, 0.5);
    const cp = poseControlPoints(pose);
    const co = poseControlPoints(other);
    const ch = poseControlPoints(half);
    for (let i = 0; i < 4; i++) {
      expect(ch[i].x).toBeCloseTo((cp[i].x + co[i].x) / 2, 6);
      expect(ch[i].y).toBeCloseTo((cp[i].y + co[i].y) / 2, 6);
    }
    expect(poseDistancePx(half, pose)).toBeGreaterThan(1);
    // Constant velocity: stepping from `pose` to `half` again lands on `other`.
    expect(poseDistancePx(extrapolatePose(pose, half), other)).toBeLessThan(1e-6);
    expect(poseDistancePx(pose, pose)).toBe(0);
  });

  it('smooths jitter at rest without lagging far behind motion', () => {
    const rng = createRng(31);
    const jitter = (p: FretboardPose, sigma: number): FretboardPose => {
      const pts = poseControlPoints(p).map((c) => ({ x: c.x + sigma * gauss(rng), y: c.y + sigma * gauss(rng) }));
      return { ...p, H: homographyFromPoints([{ x: 0, y: 0 }, { x: 0, y: model.nutWidth }, { x: model.scaleLength / 2, y: boardEdgeY(model, model.scaleLength / 2, 'treble') }, { x: model.scaleLength / 2, y: boardEdgeY(model, model.scaleLength / 2, 'bass') }], pts) as Mat3 };
    };
    const smoother = createPoseSmoother();
    let rawWobble = 0;
    let smoothWobble = 0;
    let prevRaw: FretboardPose | null = null;
    let prevSmooth: FretboardPose | null = null;
    for (let i = 0; i < 90; i++) {
      const raw = jitter(pose, 0.6);
      const out = smoother.update(raw, i * 33.3);
      if (prevRaw && prevSmooth && i > 20) {
        rawWobble += poseDistancePx(raw, prevRaw);
        smoothWobble += poseDistancePx(out, prevSmooth);
      }
      prevRaw = raw;
      prevSmooth = out;
    }
    expect(smoothWobble).toBeLessThan(0.45 * rawWobble);
    expect(poseDistancePx(prevSmooth as FretboardPose, pose)).toBeLessThan(1.2);
    // Now the guitar moves 150 px per second: the output must stay close to the input.
    const moving = createPoseSmoother();
    let lag = 0;
    for (let i = 0; i < 60; i++) {
      const shifted = { ...pose, H: multiply([1, 0, i * 5, 0, 1, 0, 0, 0, 1], pose.H) };
      const out = moving.update(shifted, i * 33.3);
      if (i > 30) lag = Math.max(lag, poseDistancePx(out, shifted));
    }
    expect(lag).toBeLessThan(6);
    // A teleport resets instead of smearing.
    const jumped = { ...pose, H: multiply([1, 0, 400, 0, 1, 100, 0, 0, 1], pose.H) };
    expect(poseDistancePx(moving.update(jumped, 61 * 33.3), jumped)).toBeLessThan(1e-9);
    moving.reset();
    expect(moving.update(pose, 0)).toBe(pose);
  });
});

describe('pose error metrics', () => {
  const model = NECK_PRESETS.steel;
  const pose = poseOf(cameraHomography({ yawDeg: 25, pitchDeg: 20, rollDeg: 12 }));

  it('reports zero error for the truth itself', () => {
    const e = comparePoses(pose, pose);
    expect(e.fretError.max).toBeLessThan(1e-9);
    expect(e.stringError.max).toBeLessThan(1e-9);
    expect(e.markerErrorPx.max).toBeLessThan(1e-9);
    expect(e.cellAccuracy).toBe(1);
    expect(e.cellAccuracyAligned).toBe(1);
    expect(e.cellCount).toBeGreaterThan(40);
    expect(e.numberingOffset).toBe(0);
    expect(e.nutDirectionCorrect).toBe(true);
    expect(e.bassSideCorrect).toBe(true);
  });

  it('measures a slide along the neck in fret spacings and across it in string spacings', () => {
    // Slide the estimate 20% of a cell toward the bridge everywhere: x' = x_n + 0.2 * (x_n - x_(n-1)).
    // A uniform stretch about the saddle does exactly that (cells are proportional to L - x).
    const k = 0.2 * (Math.pow(2, 1 / 12) - 1);
    const L = model.scaleLength;
    const slid = { ...pose, H: multiply(pose.H, [1 - k, 0, k * L, 0, 1, 0, 0, 0, 1]) };
    const e = comparePoses(slid, pose);
    expect(e.fretError.median).toBeCloseTo(0.2, 2);
    expect(e.fretError.p90).toBeCloseTo(0.2, 2);
    expect(e.numberingOffset).toBe(0);
    expect(e.cellAccuracy).toBe(1);
    // Half a cell: markers start to land in the next fret.
    const k2 = 0.5 * (Math.pow(2, 1 / 12) - 1);
    const far = { ...pose, H: multiply(pose.H, [1 - k2, 0, k2 * L, 0, 1, 0, 0, 0, 1]) };
    expect(comparePoses(far, pose).cellAccuracy).toBeLessThan(0.2);
    // Shift across the neck by 30% of the string spacing at the nut.
    const dy = 0.3 * stringSpacingAt(model, 0);
    const across = { ...pose, H: multiply(pose.H, [1, 0, 0, 0, 1, dy, 0, 0, 1]) };
    const ea = comparePoses(across, pose);
    expect(ea.stringError.median).toBeGreaterThan(0.2);
    expect(ea.stringError.median).toBeLessThan(0.3);
    expect(ea.fretError.max).toBeLessThan(1e-6);
    expect(ea.cellAccuracy).toBe(1);
    const across2 = { ...pose, H: multiply(pose.H, [1, 0, 0, 0, 1, 2.4 * dy, 0, 0, 1]) };
    expect(comparePoses(across2, pose).cellAccuracy).toBeLessThan(0.5);
  });

  it('flags a reversed neck and a swapped bass side', () => {
    // Estimate that thinks the nut is where the 12th fret is and vice versa.
    const x12 = model.scaleLength / 2;
    const reversed = { ...pose, H: multiply(pose.H, [-1, 0, x12, 0, 1, 0, 0, 0, 1]) };
    const e = comparePoses(reversed, pose);
    expect(e.nutDirectionCorrect).toBe(false);
    expect(e.bassSideCorrect).toBe(true);
    expect(e.cellAccuracy).toBeLessThan(0.2);
    const upside = { ...pose, H: multiply(pose.H, [1, 0, 0, 0, -1, model.nutWidth, 0, 0, 1]) };
    const e2 = comparePoses(upside, pose);
    expect(e2.bassSideCorrect).toBe(false);
    expect(e2.nutDirectionCorrect).toBe(true);
    expect(e2.cellAccuracy).toBe(0);
    // Fret wires still line up: only the strings are wrong.
    expect(e2.fretError.max).toBeLessThan(1e-6);
  });

  it('is fair to an estimate that assumed a slightly different neck', () => {
    // Same image positions for the nut and 12th-fret corners, but fitted with the electric preset.
    const other = NECK_PRESETS.electric;
    const taps = { nut: projectFretWire(pose, 0), fret: projectFretWire(pose, 12) };
    const est = poseFromCalibrationTaps(taps, W, H, { model: other }) as FretboardPose;
    const e = comparePoses(est, pose);
    expect(e.cellAccuracy).toBe(1);
    // Between the taps the frets agree closely; a mismatched taper acts like spurious perspective,
    // so the error grows where the fit extrapolates past the 12th fret.
    expect(e.fretError.median).toBeLessThan(0.05);
    expect(e.fretError.max).toBeLessThan(0.25);
    expect(e.stringError.max).toBeLessThan(0.15);
  });

  it('handles an empty visible range and percentiles', () => {
    const none = { ...pose, visibleFrets: { min: 0, max: -1 } };
    const e = comparePoses(pose, none);
    expect(e.cellCount).toBe(0);
    expect(e.fretError.count).toBe(0);
    expect(percentile([], 0.5)).toBeNaN();
    expect(percentile([3, 1, 2], 0.5)).toBe(2);
    expect(percentile([1, 2, 3, 4], 0.9)).toBeCloseTo(3.7, 9);
    expect(percentile([Infinity, Infinity], 0.5)).toBe(Infinity);
  });
});

describe('frame helpers', () => {
  it('converts RGBA to luminance and reuses buffers', () => {
    const frame = { data: new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255]), width: 2, height: 2 };
    const g = toGray(frame);
    expect(Array.from(g.data as Uint8Array)).toEqual([255, 0, 77, 149]);
    const again = toGray(frame, g);
    expect(again).toBe(g);
    expect(createRng(5)()).toBe(createRng(5)());
    expect(createRng(5)()).not.toBe(createRng(6)());
  });
});
