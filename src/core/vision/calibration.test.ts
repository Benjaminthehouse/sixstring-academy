import { describe, expect, it } from 'vitest';
import { defaultCalibrationQuad, nudgePose, poseFromQuad, poseFromTaps, poseFromWireTaps, shiftNumbering } from './calibration';
import { applyHomography, boardEdgeY, comparePoses, expectedOrientation, fretX, homographyOrientation, makePose, mirrorPose, neckModel, projectMarker } from './geometry';
import { displayToFrame, frameToDisplay, placeMarkers, poseForDisplay } from './overlay';
import type { FretboardPose, Point } from './types';

const W = 640;
const H = 360;
const model = neckModel('steel');

/** A true pose: right-handed player, true image (nut on the right), slight perspective. */
function truePose(): FretboardPose {
  const plane: Point[] = [
    { x: 0, y: boardEdgeY(model, 0, 'bass') },
    { x: 0, y: boardEdgeY(model, 0, 'treble') },
    { x: fretX(model, 12), y: boardEdgeY(model, fretX(model, 12), 'treble') },
    { x: fretX(model, 12), y: boardEdgeY(model, fretX(model, 12), 'bass') },
  ];
  const image: Point[] = [
    { x: 580, y: 140 },
    { x: 584, y: 184 },
    { x: 230, y: 214 },
    { x: 222, y: 152 },
  ];
  // Exact four-point homography through the generic tap helper (it is what we test against below).
  const pose = poseFromWireTaps({ fret: 0, ends: [image[0], image[1]] }, { fret: 12, ends: [image[3], image[2]] }, W, H);
  if (!pose) throw new Error('fixture');
  for (let i = 0; i < 4; i++) {
    const p = applyHomography(pose.H, plane[i].x, plane[i].y);
    if (Math.hypot(p.x - image[i].x, p.y - image[i].y) > 1e-6) throw new Error('fixture mismatch');
  }
  return pose;
}

function wireEnds(pose: FretboardPose, fret: number): [Point, Point] {
  const x = fretX(pose.model, fret);
  return [applyHomography(pose.H, x, boardEdgeY(pose.model, x, 'bass')), applyHomography(pose.H, x, boardEdgeY(pose.model, x, 'treble'))];
}

const same = (a: FretboardPose, b: FretboardPose): number => comparePoses(a, b).markerErrorPx.max;

describe('assisted calibration', () => {
  const truth = truePose();

  it('builds the pose from four taps in any order, numbered by the user', () => {
    const [nb, nt] = wireEnds(truth, 0);
    const [fb, ft] = wireEnds(truth, 12);
    for (const taps of [
      { nut: [nb, nt] as [Point, Point], fret: [fb, ft] as [Point, Point] },
      { nut: [nt, nb] as [Point, Point], fret: [fb, ft] as [Point, Point] },
      { nut: [nt, nb] as [Point, Point], fret: [ft, fb] as [Point, Point] },
    ]) {
      const pose = poseFromTaps(taps, W, H)!;
      expect(pose).not.toBeNull();
      expect(same(pose, truth)).toBeLessThan(1e-3);
      expect(pose.numbering).toBe('user');
      expect(pose.numberingConfidence).toBe(1);
      expect(pose.leftHanded).toBe(false);
    }
  });

  it('accepts any two known wires, and the 7th fret instead of the 12th', () => {
    const pose = poseFromWireTaps({ fret: 15, ends: wireEnds(truth, 15) }, { fret: 3, ends: wireEnds(truth, 3).reverse() as [Point, Point] }, W, H)!;
    expect(same(pose, truth)).toBeLessThan(1e-3);
    const seven = poseFromTaps({ nut: wireEnds(truth, 0), fret: wireEnds(truth, 7), fretNumber: 7 }, W, H)!;
    expect(same(seven, truth)).toBeLessThan(1e-3);
  });

  it('builds the pose from a dragged quadrilateral whatever corner the UI starts at', () => {
    const [nb, nt] = wireEnds(truth, 0);
    const [fb, ft] = wireEnds(truth, 12);
    const ring = [nb, nt, ft, fb];
    for (let start = 0; start < 4; start++) {
      for (const dir of [1, -1]) {
        const corners = [0, 1, 2, 3].map((k) => ring[(start + dir * k + 8) % 4]);
        const pose = poseFromQuad(corners, W, H)!;
        expect(pose, `start ${start} dir ${dir}`).not.toBeNull();
        expect(same(pose, truth)).toBeLessThan(1e-3);
      }
    }
    // A quad over frets 2 to 9.
    const q = poseFromQuad([...wireEnds(truth, 2), ...wireEnds(truth, 9).reverse()], W, H, { fromFret: 2, toFret: 9 })!;
    expect(same(q, truth)).toBeLessThan(1e-3);
  });

  it('respects the orientation hints and lets the taps decide the handedness', () => {
    const [nb, nt] = wireEnds(truth, 0);
    const [fb, ft] = wireEnds(truth, 12);
    // The same taps under "bass side down" put the low E on the lower edge.
    const flipped = poseFromTaps({ nut: [nb, nt], fret: [fb, ft] }, W, H, { bassSideUp: false })!;
    const low = projectMarker(flipped, 6, 5);
    const high = projectMarker(flipped, 1, 5);
    expect(low.y).toBeGreaterThan(high.y);
    // Bass edge down with the nut on the right is a left-handed view of a true image.
    expect(flipped.leftHanded).toBe(true);
    expect(homographyOrientation(flipped.H, 100, 20)).toBe(expectedOrientation(flipped.mirrored, flipped.leftHanded));
    // In a mirrored preview of the same scene the hints give back the mirrored pose.
    const m = mirrorPose(truth);
    const mt = poseFromTaps({ nut: wireEnds(m, 0), fret: wireEnds(m, 12) }, W, H, { mirrored: true })!;
    expect(same(mt, m)).toBeLessThan(1e-3);
    expect(mt.leftHanded).toBe(false);
  });

  it('rejects degenerate taps and quadrilaterals', () => {
    const p = { x: 100, y: 100 };
    expect(poseFromTaps({ nut: [p, p], fret: [p, p] }, W, H)).toBeNull();
    expect(poseFromWireTaps({ fret: 5, ends: wireEnds(truth, 5) }, { fret: 5, ends: wireEnds(truth, 12) }, W, H)).toBeNull();
    expect(poseFromQuad([p, p, p], W, H)).toBeNull();
    expect(poseFromQuad([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }], W, H)).toBeNull();
  });

  it('starts the drag UI with a quadrilateral that is itself a valid pose, nut where the hints say', () => {
    for (const mirrored of [false, true]) {
      const { taps, corners } = defaultCalibrationQuad(W, H, { mirrored });
      const a = poseFromTaps(taps, W, H, { mirrored })!;
      const b = poseFromQuad(corners, W, H, { mirrored })!;
      expect(a).not.toBeNull();
      expect(same(a, b)).toBeLessThan(1e-3);
      expect(a.leftHanded).toBe(false);
      const nut = applyHomography(a.H, 0, model.nutWidth / 2);
      expect(nut.x > W / 2).toBe(!mirrored);
    }
  });

  it('shifts the numbering and nudges the pose', () => {
    const up = shiftNumbering(truth, 2);
    expect(comparePoses(up, truth).numberingOffset).toBe(2);
    expect(up.numbering).toBe('user');
    expect(same(nudgePose(truth, {}), truth)).toBeLessThan(1e-6);
    const moved = nudgePose(truth, { dx: 3, dy: -2 });
    const a = projectMarker(truth, 3, 5);
    const b = projectMarker(moved, 3, 5);
    expect(b.x - a.x).toBeCloseTo(3, 6);
    expect(b.y - a.y).toBeCloseTo(-2, 6);
    const slid = nudgePose(truth, { alongFrets: 1 });
    expect(Math.abs(comparePoses(slid, truth).numberingOffset)).toBe(1);
    const across = nudgePose(truth, { acrossStrings: 1 });
    expect(comparePoses(across, truth).stringError.median).toBeGreaterThan(0.7);
    const turned = nudgePose(truth, { rotateDeg: 2, scale: 1.02 });
    expect(comparePoses(turned, truth).markerErrorPx.max).toBeGreaterThan(1);
    expect(comparePoses(turned, truth).cellAccuracy).toBeGreaterThan(0.5);
  });
});

describe('overlay helpers', () => {
  const pose = truePose();

  it('places markers in their cells with a radius that fits', () => {
    const marks = placeMarkers(pose, [
      { string: 6, fret: 3 },
      { string: 1, fret: 0 },
      { string: 3, fret: 30 },
    ]);
    expect(marks[0].visible).toBe(true);
    const p = projectMarker(pose, 6, 3);
    expect(marks[0].x).toBeCloseTo(p.x, 9);
    expect(marks[0].radius).toBeGreaterThan(2);
    expect(marks[0].radius).toBeLessThan(10);
    expect(marks[1].visible).toBe(true);
    expect(marks[2].visible).toBe(false);
  });

  it('converts between the tracked frame and a scaled, mirrored display', () => {
    const view = { width: 1280, height: 720, mirrored: true };
    const shown = poseForDisplay(pose, view);
    const inFrame = projectMarker(pose, 2, 5);
    const onScreen = projectMarker(shown, 2, 5);
    const back = displayToFrame(onScreen, view, W, H);
    expect(back.x).toBeCloseTo(inFrame.x, 6);
    expect(back.y).toBeCloseTo(inFrame.y, 6);
    const there = frameToDisplay(inFrame, view, W, H);
    expect(there.x).toBeCloseTo(onScreen.x, 6);
    expect(shown.mirrored).toBe(true);
    expect(makePose(pose.H, pose.model, W, H).frameWidth).toBe(W);
  });
});

describe('barrel', () => {
  it('exports the public API the digest documents', async () => {
    const vision = await import('./index');
    for (const name of [
      'FretboardTracker', 'PoseFilter', 'createSessionDetector', 'fretQuestion', 'createVisionHost', 'createFretboardDetector', 'createDetector',
      'poseFromTaps', 'poseFromWireTaps', 'poseFromQuad', 'defaultCalibrationQuad', 'shiftNumbering', 'nudgePose',
      'poseForDisplay', 'placeMarkers', 'displayToFrame', 'frameToDisplay',
      'projectMarker', 'projectFretWire', 'projectString', 'boardOutline', 'fretSpacingPx', 'locatePixel', 'scalePose', 'mirrorPose', 'renumberPose', 'confirmFretAt', 'neckModel',
    ]) {
      expect(typeof (vision as Record<string, unknown>)[name], name).toBe('function');
    }
    expect(vision.NECK_PRESETS.steel.stringCount).toBe(6);
  });
});
