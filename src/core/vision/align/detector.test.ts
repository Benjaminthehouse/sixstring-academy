import { describe, expect, it } from 'vitest';
import { comparePoses, createRng, makePose, multiply, neckModel, renumberPose } from '../geometry';
import { renderScene } from '../testing/render';
import { sampleNegativeScene, sampleScene } from '../testing/scene';
import type { Frame, FretboardPose, Mat3 } from '../types';
import { createAlignDetector, createDetector } from './index';
import { paintBoard, simpleView } from './synthetic';

const model = neckModel('steel');
const W = 640;
const Hh = 360;
const truthOf = (H: Mat3, width = W, height = Hh): FretboardPose => makePose(H, model, width, height, { numbering: 'nut', numberingConfidence: 1 });

describe('detect on a painted board', () => {
  it.each([
    ['face on', simpleView(model, 600, 185, 1.45, 0)],
    ['rolled 20 degrees', simpleView(model, 590, 250, 1.3, 20)],
    ['rolled the other way', simpleView(model, 600, 120, 1.3, -15)],
    ['small in the frame', simpleView(model, 520, 180, 0.85, 6)],
  ])('finds it, on the right strings and frets, numbered from the nut: %s', (_name, H) => {
    const detector = createAlignDetector();
    const out = detector.detect(paintBoard({ width: W, height: Hh, H, model }), { model: 'steel' });
    expect(out.pose).not.toBeNull();
    const pose = out.pose as FretboardPose;
    const err = comparePoses(pose, truthOf(H));
    expect(err.cellAccuracy).toBeGreaterThanOrEqual(0.95);
    expect(err.numberingOffset).toBe(0);
    expect(err.nutDirectionCorrect && err.bassSideCorrect).toBe(true);
    expect(err.fretErrorAligned.median).toBeLessThan(0.03);
    expect(err.stringError.median).toBeLessThan(0.1);
    expect(pose.numbering).toBe('nut');
    expect(pose.numberingConfidence).toBeGreaterThanOrEqual(0.5);
    expect(pose.confidence).toBeGreaterThan(0.6);
    expect(pose.frameWidth).toBe(W);
    expect(out.diagnostics.timings.total).toBeGreaterThan(0);
  });

  it('handles a light board with dark wires', () => {
    const H = simpleView(model, 600, 185, 1.45, 5);
    const out = createAlignDetector().detect(paintBoard({ width: W, height: Hh, H, model, maple: true }), { model: 'steel' });
    expect(out.pose).not.toBeNull();
    expect(comparePoses(out.pose as FretboardPose, truthOf(H)).cellAccuracy).toBeGreaterThanOrEqual(0.95);
  });

  it('handles a mirrored image when told so, and a hand over four frets', () => {
    const H0 = simpleView(model, 600, 185, 1.45, 5);
    // Mirror the image horizontally: u -> W - u.
    const H = multiply([-1, 0, W, 0, 1, 0, 0, 0, 1], H0);
    const frame = paintBoard({ width: W, height: Hh, H, model, hiddenFrets: [5, 6, 7, 8] });
    const out = createAlignDetector().detect(frame, { model: 'steel', mirrored: true });
    expect(out.pose).not.toBeNull();
    const err = comparePoses(out.pose as FretboardPose, { ...truthOf(H), mirrored: true });
    expect(err.cellAccuracy).toBeGreaterThanOrEqual(0.95);
    expect(err.nutDirectionCorrect).toBe(true);
    expect((out.pose as FretboardPose).mirrored).toBe(true);
  });

  it('returns poses in the coordinates of the frame it was given, whatever its size', () => {
    for (const [width, height] of [[1280, 720], [480, 270]] as const) {
      const k = width / W;
      const H = simpleView(model, 600 * k, 185 * k, 1.45 * k, 6);
      const out = createAlignDetector().detect(paintBoard({ width, height, H, model }), { model: 'steel' });
      expect(out.pose).not.toBeNull();
      const pose = out.pose as FretboardPose;
      expect(pose.frameWidth).toBe(width);
      expect(pose.frameHeight).toBe(height);
      expect(comparePoses(pose, truthOf(H, width, height)).cellAccuracy).toBeGreaterThanOrEqual(0.95);
    }
  });
});

describe('detect with hints', () => {
  const H = simpleView(model, 780, 185, 1.45, 4);
  // Nut out of the frame, no inlays: the numbering cannot be read off this image.
  const frame = paintBoard({ width: W, height: Hh, H, model, inlays: false });

  it('says so when it cannot number the frets, and takes a one-tap confirmation', () => {
    const blind = createAlignDetector().detect(frame, { model: 'steel' });
    expect(blind.pose).not.toBeNull();
    expect((blind.pose as FretboardPose).numbering).toBe('assumed');
    expect((blind.pose as FretboardPose).numberingConfidence).toBeLessThan(0.5);
    // Tap the middle of the 7th cell on the board centre line.
    const x = (model.scaleLength * (1 - Math.pow(2, -6 / 12)) + model.scaleLength * (1 - Math.pow(2, -7 / 12))) / 2;
    const point = { x: H[0] * x + H[1] * (model.nutWidth / 2) + H[2], y: H[3] * x + H[4] * (model.nutWidth / 2) + H[5] };
    const out = createAlignDetector().detect(frame, { model: 'steel', fretHint: { point, fret: 7 } });
    const pose = out.pose as FretboardPose;
    expect(pose.numbering).toBe('user');
    expect(pose.numberingConfidence).toBe(1);
    expect(comparePoses(pose, truthOf(H)).numberingOffset).toBe(0);
  });

  it('reads stickers in marker mode', () => {
    const marked = paintBoard({ width: W, height: Hh, H, model, inlays: false, stickers: { frets: [5, 9], rgb: [255, 50, 210] } });
    const out = createAlignDetector().detect(marked, { model: 'steel', markers: { frets: [5, 9], hue: 315 } });
    const pose = out.pose as FretboardPose;
    expect(pose.numbering).toBe('markers');
    expect(comparePoses(pose, truthOf(H)).numberingOffset).toBe(0);
  });

  it('only looks inside the region it is given', () => {
    const board = paintBoard({ width: W, height: Hh, H: simpleView(model, 600, 185, 1.45, 0), model });
    expect(createAlignDetector().detect(board, { region: { x: 0, y: 0, width: 640, height: 60 } }).pose).toBeNull();
    expect(createAlignDetector().detect(board, { region: { x: 0, y: 100, width: 640, height: 180 } }).pose).not.toBeNull();
    expect(createAlignDetector().detect(board, { region: [{ x: 20, y: 120 }, { x: 630, y: 110 }, { x: 630, y: 260 }, { x: 20, y: 250 }] }).pose).not.toBeNull();
  });
});

describe('detect says no', () => {
  const blank = (fill: (x: number, y: number) => number): Frame => {
    const data = new Uint8ClampedArray(W * Hh * 4);
    for (let y = 0; y < Hh; y++) {
      for (let x = 0; x < W; x++) {
        const v = fill(x, y);
        const i = (y * W + x) * 4;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
    }
    return { data, width: W, height: Hh };
  };

  it('on a flat frame, on noise, on even stripes and on a single fence of bars', () => {
    const rng = createRng(3);
    const detector = createAlignDetector();
    expect(detector.detect(blank(() => 128)).pose).toBeNull();
    expect(detector.detect(blank(() => 60 + 120 * rng())).pose).toBeNull();
    expect(detector.detect(blank((_x, y) => (Math.floor(y / 9) % 2 ? 210 : 60))).pose).toBeNull();
    // Thin bright bars, evenly spaced, 60 pixels long: a radiator or a row of fence posts.
    expect(detector.detect(blank((x, y) => (y > 150 && y < 210 && x > 100 && x < 540 && x % 22 < 2 ? 220 : 50))).pose).toBeNull();
  });

  it('on malformed input, without throwing', () => {
    const detector = createAlignDetector();
    expect(detector.detect({ data: new Uint8ClampedArray(0), width: 0, height: 0 }).pose).toBeNull();
    expect(detector.detect({ data: new Uint8ClampedArray(16), width: 640, height: 360 }).pose).toBeNull();
    expect(detector.detect(undefined as unknown as Frame).diagnostics.reason).toBe('bad-frame');
    const pose = truthOf(simpleView(model, 600, 185, 1.45, 0));
    expect(detector.track({ data: new Uint8ClampedArray(0), width: 0, height: 0 }, pose).pose).toBeNull();
    expect(detector.track(blank(() => 128), { ...pose, H: [NaN, 0, 0, 0, 0, 0, 0, 0, 0] as unknown as Mat3 }).pose).toBeNull();
  });
});

describe('track', () => {
  /** A slow pan and turn: the pose of frame i. */
  const poseAt = (i: number): Mat3 => simpleView(model, 600 - 2.2 * i, 185 + 1.1 * i, 1.45, 4 + 0.25 * i);

  it('follows a moving board for 12 frames at sub-cell accuracy and keeps the numbering it was given', () => {
    const detector = createAlignDetector();
    // Start from a pose whose numbering was confirmed by the user and is deliberately NOT what the image shows.
    let pose: FretboardPose = renumberPose(truthOf(poseAt(0)), 2, 'user', 1);
    for (let i = 1; i <= 12; i++) {
      const out = detector.track(paintBoard({ width: W, height: Hh, H: poseAt(i), model, seed: i }), pose, { timeMs: i * 33 });
      expect(out.pose).not.toBeNull();
      pose = out.pose as FretboardPose;
      const err = comparePoses(pose, truthOf(poseAt(i)));
      expect(err.numberingOffset).toBe(2);
      expect(err.cellAccuracyAligned).toBeGreaterThanOrEqual(0.95);
      expect(err.fretErrorAligned.median).toBeLessThan(0.05);
      expect(pose.numbering).toBe('tracked');
      expect(pose.numberingConfidence).toBe(1);
    }
  });

  it('is steady on a still board', () => {
    const detector = createAlignDetector();
    const H = poseAt(3);
    let pose = truthOf(H);
    let worst = 0;
    for (let i = 1; i <= 8; i++) {
      const out = detector.track(paintBoard({ width: W, height: Hh, H, model, seed: 100 + i, noise: 3 }), pose, { timeMs: i * 33 });
      const next = out.pose as FretboardPose;
      expect(next).not.toBeNull();
      if (i > 2) for (let k = 0; k < 9; k++) worst = Math.max(worst, Math.abs(next.H[k] - pose.H[k]) * (k === 2 || k === 5 ? 1 : 300));
      pose = next;
    }
    // Frame-to-frame change well under a pixel anywhere on the board.
    expect(worst).toBeLessThan(0.35);
  });

  it('gives up when the board is gone, and detect() picks it up again with the old numbering', () => {
    const detector = createAlignDetector();
    const H = poseAt(2);
    const start = renumberPose(truthOf(H), 1, 'user', 1);
    const empty = paintBoard({ width: W, height: Hh, H: simpleView(model, 5000, 5000, 1.45, 0), model });
    expect(detector.track(empty, start, { timeMs: 33 }).pose).toBeNull();
    expect(detector.detect(empty, { previousPose: start, timeMs: 33 }).pose).toBeNull();
    // The board reappears a couple of pixels away.
    const back = paintBoard({ width: W, height: Hh, H: simpleView(model, 600 - 2.2 * 2 + 2, 185 + 1.1 * 2 - 1, 1.45, 4.5), model });
    const out = detector.detect(back, { previousPose: start, timeMs: 66 });
    expect(out.pose).not.toBeNull();
    const err = comparePoses(out.pose as FretboardPose, truthOf(simpleView(model, 600 - 2.2 * 2 + 2, 185 + 1.1 * 2 - 1, 1.45, 4.5)));
    expect(err.numberingOffset).toBe(1);
    expect((out.pose as FretboardPose).numbering).toBe('tracked');
  });
});

describe('benchmark scenes (rendered)', () => {
  it('detects an easy scene and rejects an empty room', () => {
    const detector = createDetector();
    const scene = renderScene(sampleScene('easy', 3));
    const out = detector.detect(scene.frame, scene.truth.hints);
    expect(out.pose).not.toBeNull();
    const err = comparePoses(out.pose as FretboardPose, scene.truth.pose as FretboardPose);
    expect(err.cellAccuracy).toBeGreaterThanOrEqual(0.9);
    expect(err.numberingOffset).toBe(0);
    const negative = renderScene(sampleNegativeScene(1));
    expect(detector.detect(negative.frame, negative.truth.hints).pose).toBeNull();
  }, 60_000);
});
