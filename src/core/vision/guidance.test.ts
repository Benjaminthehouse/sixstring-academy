import { describe, expect, it } from 'vitest';
import { makePose, neckModel } from './geometry';
import { OPERATING_LIMITS, frameStats, guide, viewStats, type FrameStats, type GuideInput, type ViewStats } from './guidance';
import type { Frame, Mat3 } from './types';

/** A frame from a luminance function plus Gaussian noise of a known sigma (Box-Muller, seeded). */
function frame(w: number, h: number, lum: (x: number, y: number) => number, sigma = 0): Frame {
  const data = new Uint8ClampedArray(w * h * 4);
  let s = 12345;
  const rnd = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s + 0.5) / 4294967296;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = sigma ? sigma * Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd()) : 0;
      const v = lum(x, y) + n;
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

/** Pinhole camera looking at the neck plane, tilted `tiltDeg` about the image's horizontal axis. */
function cameraPose(tiltDeg: number): ReturnType<typeof makePose> {
  const a = (tiltDeg * Math.PI) / 180;
  const f = 560;
  const r1 = [-1, 0, 0];
  const r2 = [0, Math.cos(a), Math.sin(a)];
  const t = [200, -20 * Math.cos(a), 600];
  const H: Mat3 = [f * r1[0] + 320 * r1[2], f * r2[0] + 320 * r2[2], f * t[0] + 320 * t[2], f * r1[1] + 180 * r1[2], f * r2[1] + 180 * r2[2], f * t[1] + 180 * t[2], r1[2], r2[2], t[2]];
  return makePose(H, neckModel('steel'), 640, 360);
}

describe('frameStats', () => {
  it('estimates sensor noise on a smooth picture and ignores edges', () => {
    for (const sigma of [2, 6, 12]) {
      const f = frame(320, 180, (x, y) => 60 + 0.3 * x + (x > 160 ? 50 : 0) + 0.2 * y, sigma);
      const st = frameStats(f);
      expect(st.noise).toBeGreaterThan(sigma * 0.7);
      expect(st.noise).toBeLessThan(sigma * 1.35 + 0.5);
    }
    // No noise: a few hard edges do not read as noise.
    expect(frameStats(frame(320, 180, (x) => (Math.floor(x / 40) % 2 ? 200 : 40))).noise).toBeLessThan(1);
  });
  it('measures brightness and clipping', () => {
    const st = frameStats(frame(200, 100, (x) => (x < 100 ? 255 : 40)));
    expect(st.clipped).toBeGreaterThan(0.4);
    expect(st.clipped).toBeLessThan(0.6);
    expect(st.brightness).toBeGreaterThan(130);
    expect(frameStats(frame(200, 100, () => 10)).brightness).toBeLessThan(OPERATING_LIMITS.minBrightness);
  });
});

describe('viewStats', () => {
  it('reads the view angle from the foreshortening', () => {
    expect(viewStats(cameraPose(0)).offNormalDeg).toBeLessThan(6);
    expect(Math.abs(viewStats(cameraPose(40)).offNormalDeg - 40)).toBeLessThan(5);
    expect(Math.abs(viewStats(cameraPose(60)).offNormalDeg - 60)).toBeLessThan(5);
  });
  it('gives the string spacing in frame pixels', () => {
    const v = viewStats(cameraPose(0));
    // 560 px focal at 600 mm: about 0.93 px per mm; steel strings are about 7.5 mm apart mid-neck.
    expect(v.stringSpacingPx).toBeGreaterThan(5.5);
    expect(v.stringSpacingPx).toBeLessThan(9);
    expect(v.visibleFrets).toBeGreaterThan(5);
  });
});

describe('guide', () => {
  const lit: FrameStats = { brightness: 110, clipped: 0, noise: 3 };
  const good: ViewStats = { stringSpacingPx: 9, offNormalDeg: 20, visibleFrets: 14, nutInView: true };
  const base: GuideInput = { state: 'locked', frame: lit, view: good, numberingConfirmed: true, question: null, suggestCalibration: false, coasting: false, stringsSeen: null };
  const code = (over: Partial<GuideInput>): string => guide({ ...base, ...over }).code;

  it('says ok and trusts a locked board inside the limits', () => {
    const g = guide(base);
    expect(g.code).toBe('ok');
    expect(g.trust).toBe('auto');
    expect(g.measures.stringSpacingPx).toBe(9);
  });
  it('coaches the light while nothing is found, then offers calibration', () => {
    expect(code({ state: 'searching', view: null, frame: { brightness: 12, clipped: 0, noise: 4 } })).toBe('too-dark');
    expect(code({ state: 'searching', view: null, frame: { brightness: 90, clipped: 0, noise: 30 } })).toBe('too-dark');
    expect(code({ state: 'searching', view: null, frame: { brightness: 200, clipped: 0.5, noise: 2 } })).toBe('too-bright');
    expect(code({ state: 'searching', view: null })).toBe('point-camera');
    const g = guide({ ...base, state: 'searching', view: null, suggestCalibration: true });
    expect(g.code).toBe('calibrate');
    expect(g.trust).toBe('calibrate');
  });
  it('names no button in the calibrate line unless the screen gives its label', () => {
    // No camera screen has a button called "Calibrate": the default words must not send the learner looking for one.
    const plain = guide({ ...base, state: 'searching', view: null, suggestCalibration: true });
    expect(plain.message).not.toMatch(/\bTap\b|Calibrate/);
    expect(plain.message).toContain('nut and the 12th fret');
    const named = guide({ ...base, state: 'candidate', suggestCalibration: true, calibrateLabel: 'Mark the neck' });
    expect(named.code).toBe('calibrate');
    expect(named.message).toBe('Automatic tracking is struggling here. Tap Mark the neck and mark the nut and the 12th fret.');
    expect(guide({ ...base, state: 'searching', view: null, suggestCalibration: true, calibrateLabel: '  ' }).message).toBe(plain.message);
  });
  it('asks to hold still when the board is lost or carried through blur', () => {
    expect(code({ state: 'lost' })).toBe('hold-still');
    expect(code({ state: 'candidate', coasting: true })).toBe('hold-still');
  });
  it('flags a wrong guitar type before anything else on a followed board', () => {
    const g = guide({ ...base, state: 'candidate', stringsSeen: 7 });
    expect(g.code).toBe('check-guitar-type');
    expect(g.message).toContain('7 strings');
    expect(g.trust).toBe('confirm');
  });
  it('asks for a closer or straighter view outside the operating limits, even when locked', () => {
    expect(code({ view: { ...good, stringSpacingPx: OPERATING_LIMITS.minStringSpacingPx - 0.5 } })).toBe('move-closer');
    const g = guide({ ...base, view: { ...good, offNormalDeg: OPERATING_LIMITS.maxOffNormalDeg + 3 } });
    expect(g.code).toBe('tilt-toward-camera');
    expect(g.trust).toBe('wait');
  });
  it('asks to show the nut, then for the one tap, while the numbers are a guess', () => {
    expect(code({ state: 'candidate', numberingConfirmed: false, view: { ...good, nutInView: false } })).toBe('show-nut');
    const g = guide({ ...base, state: 'candidate', numberingConfirmed: false, question: { fret: 5 } });
    expect(g.code).toBe('confirm-fret');
    expect(g.message).toContain('fret 5');
    expect(g.trust).toBe('confirm');
  });
  it('waits on a board that is not held long enough yet', () => {
    const g = guide({ ...base, state: 'candidate' });
    expect(g.code).toBe('hold-still');
    expect(g.trust).toBe('wait');
    expect(code({ state: 'candidate', suggestCalibration: true })).toBe('calibrate');
  });
});
