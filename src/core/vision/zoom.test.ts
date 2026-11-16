import { describe, expect, it } from 'vitest';
import { poseFromTaps } from './calibration';
import { placeMarkers, displayToFrame, frameToDisplay, displayTransform, type DisplayView } from './overlay';
import type { FretboardPose, FretPosition } from './types';
import { CropFollower, FULL_CROP, cropZoom, isFullCrop, neckCrop, videoCropTransform } from './zoom';

const W = 640;
const H = 360;

/** A neck across a 640x360 frame, nut on the right, the 12th fret about halfway: a typical webcam view. */
function pose(): FretboardPose {
  return poseFromTaps({ nut: [{ x: 600, y: 160 }, { x: 602, y: 200 }], fret: [{ x: 300, y: 165 }, { x: 302, y: 215 }], fretNumber: 12 }, W, H) as FretboardPose;
}

/** A minor pentatonic, box 1 (frets 5-8). */
const BOX1: FretPosition[] = [
  { string: 6, fret: 5 }, { string: 6, fret: 8 }, { string: 5, fret: 5 }, { string: 5, fret: 7 }, { string: 4, fret: 5 }, { string: 4, fret: 7 },
  { string: 3, fret: 5 }, { string: 3, fret: 7 }, { string: 2, fret: 5 }, { string: 2, fret: 8 }, { string: 1, fret: 5 }, { string: 1, fret: 8 },
];

/** An upright phone: the 16:9 picture is 358 px wide. */
const PHONE: DisplayView = { width: 358, height: 201, mirrored: true, fit: 'contain' };
/** A desktop stage. */
const DESKTOP: DisplayView = { width: 880, height: 495, mirrored: true, fit: 'contain' };

describe('display transform with a crop', () => {
  it('maps the crop onto the whole view and back, mirrored or not', () => {
    const crop = { x: 0.25, y: 0.3, width: 0.4, height: 0.4 };
    for (const mirrored of [false, true]) {
      const view: DisplayView = { width: 400, height: 225, mirrored, fit: 'contain' };
      const v = { ...view, crop };
      // The crop's corners land on the view's corners (same shape: no bands).
      const tl = frameToDisplay({ x: 0.25 * W, y: 0.3 * H }, v, W, H);
      const br = frameToDisplay({ x: 0.65 * W, y: 0.7 * H }, v, W, H);
      expect(Math.min(tl.x, br.x)).toBeCloseTo(0, 6);
      expect(Math.max(tl.x, br.x)).toBeCloseTo(400, 6);
      expect(tl.y).toBeCloseTo(0, 6);
      expect(br.y).toBeCloseTo(225, 6);
      const back = displayToFrame({ x: 123, y: 45 }, v, W, H);
      const again = frameToDisplay(back, v, W, H);
      expect(again.x).toBeCloseTo(123, 6);
      expect(again.y).toBeCloseTo(45, 6);
      expect(cropZoom(v, W, H)).toBeCloseTo(2.5, 6);
    }
    // No crop and the full crop are the same picture.
    expect(displayTransform({ width: 400, height: 225, fit: 'contain', crop: FULL_CROP }, W, H)).toEqual(displayTransform({ width: 400, height: 225, fit: 'contain' }, W, H));
  });
});

describe('neckCrop', () => {
  it('on an upright phone, zooms until the dots can be read, with every note in the picture', () => {
    const p = pose();
    const whole = displayTransform(PHONE, W, H).sx;
    const before = placeMarkers(p, BOX1).map((m) => m.radius * whole);
    const median = before.sort((a, b) => a - b)[before.length >> 1];
    expect(median).toBeLessThan(8);
    const crop = neckCrop(p, BOX1, PHONE);
    expect(isFullCrop(crop)).toBe(false);
    const view = { ...PHONE, crop };
    const zoom = cropZoom(view, W, H);
    expect(zoom).toBeGreaterThan(1.5);
    expect(zoom).toBeLessThanOrEqual(4 + 1e-9);
    // Readable dots (10 px radius wanted; the notes may stop the zoom a little short of it).
    expect(median * zoom).toBeGreaterThanOrEqual(Math.min(10, median * 4) - 0.5);
    // Every note is on screen, with room for its dot.
    for (const m of placeMarkers(p, BOX1)) {
      const d = frameToDisplay(m, view, W, H);
      expect(d.x).toBeGreaterThan(0);
      expect(d.x).toBeLessThan(PHONE.width);
      expect(d.y).toBeGreaterThan(0);
      expect(d.y).toBeLessThan(PHONE.height);
    }
    // The crop stays inside the frame and has the view's shape.
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.y).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.width).toBeLessThanOrEqual(1 + 1e-9);
    expect(crop.y + crop.height).toBeLessThanOrEqual(1 + 1e-9);
    expect((crop.width * W) / (crop.height * H)).toBeCloseTo(PHONE.width / PHONE.height, 6);
  });

  it('leaves a big picture alone, and has nothing to zoom on without notes', () => {
    // The neck close to the camera, filling the frame, on a desktop stage: dots already 10+ px.
    const close = poseFromTaps({ nut: [{ x: 630, y: 110 }, { x: 632, y: 200 }], fret: [{ x: 40, y: 120 }, { x: 44, y: 240 }], fretNumber: 12 }, W, H) as FretboardPose;
    expect(isFullCrop(neckCrop(close, BOX1, DESKTOP))).toBe(true);
    expect(isFullCrop(neckCrop(pose(), [], PHONE))).toBe(true);
  });

  it('in a view much taller than the picture (full screen, phone upright) keeps to the zoom limit and the notes', () => {
    const p = pose();
    const tall: DisplayView = { width: 390, height: 844, mirrored: true, fit: 'contain' };
    const crop = neckCrop(p, BOX1, tall);
    const view = { ...tall, crop };
    expect(isFullCrop(crop)).toBe(false);
    expect(cropZoom(view, W, H)).toBeLessThanOrEqual(4 + 1e-9);
    for (const m of placeMarkers(p, BOX1)) {
      const d = frameToDisplay(m, view, W, H);
      expect(d.x).toBeGreaterThan(0);
      expect(d.x).toBeLessThan(tall.width);
    }
  });

  it('never zooms past the notes: a chord spread from the nut to the 12th fret keeps them all in view', () => {
    const p = pose();
    const wide: FretPosition[] = [{ string: 6, fret: 0 }, { string: 1, fret: 12 }, { string: 3, fret: 7 }];
    const crop = neckCrop(p, wide, PHONE);
    const view = { ...PHONE, crop };
    for (const m of placeMarkers(p, wide)) {
      const d = frameToDisplay(m, view, W, H);
      expect(d.x).toBeGreaterThanOrEqual(0);
      expect(d.x).toBeLessThanOrEqual(PHONE.width);
    }
  });
});

describe('CropFollower', () => {
  it('glides to a new crop, ignores small moves, and snaps when asked', () => {
    const f = new CropFollower({ timeConstantMs: 200, deadband: 0.12 });
    const target = { x: 0.3, y: 0.3, width: 0.4, height: 0.4 };
    f.update(target, 0);
    expect(isFullCrop(f.current)).toBe(true);
    let c = f.update(target, 100);
    expect(c.width).toBeLessThan(1);
    expect(c.width).toBeGreaterThan(0.4);
    for (let t = 116; t <= 2000; t += 16) c = f.update(target, t);
    expect(c).toEqual(target);
    // A sway (2% of the crop) does not move the picture.
    c = f.update({ ...target, x: 0.308 }, 2016);
    for (let t = 2032; t <= 3000; t += 16) c = f.update({ ...target, x: 0.308 }, t);
    expect(c.x).toBe(0.3);
    // A real move does.
    for (let t = 3016; t <= 5000; t += 16) c = f.update({ ...target, x: 0.5 }, t);
    expect(c.x).toBeCloseTo(0.5, 3);
    expect(f.update(FULL_CROP, 5016, true)).toEqual(FULL_CROP);
    f.update(target, 5032);
    f.reset();
    expect(isFullCrop(f.current)).toBe(true);
  });
});

describe('videoCropTransform', () => {
  it('moves the contained video exactly where the overlay draws the frame', () => {
    const vw = 1280;
    const vh = 720;
    for (const mirrored of [false, true]) {
      const view: DisplayView = { width: 358, height: 240, mirrored, fit: 'contain', crop: { x: 0.2, y: 0.25, width: 0.45, height: 0.3 } };
      const css = videoCropTransform(view, vw, vh);
      expect(css).not.toBeNull();
      const [a, b, c, d, e, f] = (css as string).replace(/matrix\(|\)/g, '').split(',').map(Number);
      // A video pixel as object-fit: contain places it in the element box (no transform), then the CSS matrix.
      const base = displayTransform({ ...view, crop: undefined, mirrored: false }, vw, vh);
      for (const p of [{ x: 100, y: 80 }, { x: 900, y: 500 }, { x: 640, y: 360 }]) {
        const u = { x: p.x * base.sx + base.ox, y: p.y * base.sy + base.oy };
        const shown = { x: a * u.x + c * u.y + e, y: b * u.x + d * u.y + f };
        const want = frameToDisplay(p, view, vw, vh);
        expect(shown.x).toBeCloseTo(want.x, 2);
        expect(shown.y).toBeCloseTo(want.y, 2);
      }
    }
    expect(videoCropTransform({ width: 358, height: 240, fit: 'contain' }, vw, vh)).toBeNull();
  });
});
