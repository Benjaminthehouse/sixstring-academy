import { describe, expect, it } from 'vitest';
import { poseFromTaps } from './calibration';
import { createVisionHost } from './protocol';
import { applyHomography, boardEdgeY, comparePoses, createRng, fretSpacingPx, fretX, poseControlPoints, poseDistancePx, poseFromControlPoints, renumberPose, transformPose } from './geometry';
import { renderScene } from './testing/render';
import { sampleNegativeScene, sampleScene } from './testing/scene';
import { buildSequence } from './testing/sequence';
import { FretboardTracker, PoseFilter, createSessionDetector, fretQuestion } from './tracker';
import type { DetectOptions, DetectionResult, Detector, Frame, FretboardPose } from './types';

const W = 640;
const H = 360;
const frame: Frame = { data: new Uint8ClampedArray(W * H * 4), width: W, height: H };

/** A neck seen front-on, nut on the right (a right-handed player in a true image). */
function basePose(): FretboardPose {
  return poseFromTaps({ nut: [{ x: 560, y: 150 }, { x: 562, y: 190 }], fret: [{ x: 200, y: 158 }, { x: 203, y: 212 }] }, W, H) as FretboardPose;
}

function shifted(pose: FretboardPose, dx: number): FretboardPose {
  return transformPose(pose, [1, 0, dx, 0, 1, 0, 0, 0, 1], W, H);
}

/** A scripted detector: `script(call)` decides what each call returns. */
function fakeDetector(script: (kind: 'detect' | 'track', options: DetectOptions | undefined, previous?: FretboardPose) => FretboardPose | null): Detector & { calls: string[] } {
  const calls: string[] = [];
  const result = (pose: FretboardPose | null): DetectionResult => ({ pose, diagnostics: { timings: { total: 1 }, reason: pose ? undefined : 'nothing' } });
  return {
    name: 'fake',
    calls,
    detect: (_f, o) => {
      calls.push('detect');
      return result(script('detect', o));
    },
    track: (_f, prev, o) => {
      calls.push('track');
      return result(script('track', o, prev));
    },
  };
}

function gauss(rng: () => number): number {
  return Math.sqrt(-2 * Math.log(Math.max(1e-12, rng()))) * Math.cos(2 * Math.PI * rng());
}

describe('PoseFilter', () => {
  const base = basePose();
  const rng = createRng(3);
  const noisy = (p: FretboardPose, sigma: number): FretboardPose =>
    poseFromControlPoints(poseControlPoints(p).map((q) => ({ x: q.x + sigma * gauss(rng), y: q.y + sigma * gauss(rng) })), p) as FretboardPose;

  it('steadies a still board at least twofold', () => {
    const filter = new PoseFilter();
    let raw = 0;
    let out = 0;
    let prevRaw: FretboardPose | null = null;
    let prevOut: FretboardPose | null = null;
    for (let i = 0; i < 90; i++) {
      const r = noisy(base, 0.5);
      const o = filter.update(r, i * 33.3);
      if (prevRaw && prevOut && i > 15) {
        raw += poseDistancePx(r, prevRaw) ** 2;
        out += poseDistancePx(o, prevOut) ** 2;
      }
      prevRaw = r;
      prevOut = o;
    }
    expect(Math.sqrt(out / raw)).toBeLessThan(0.5);
  });

  it('keeps up with motion: under a quarter of a string spacing of lag when swaying, a fast jerk or a slow drift', () => {
    const unit = fretSpacingPx(base, 7) / 4.2; // about one string spacing there
    for (const motion of [(i: number) => 40 * Math.sin((2 * Math.PI * i) / 30), (i: number) => (i < 20 ? 0 : 15 * Math.min(4, i - 19)), (i: number) => i]) {
      const filter = new PoseFilter();
      let worst = 0;
      for (let i = 0; i < 60; i++) {
        const truth = shifted(base, motion(i));
        const o = filter.update(truth, i * 33.3);
        if (i > 3) worst = Math.max(worst, poseDistancePx(o, truth) / unit);
      }
      expect(worst).toBeLessThan(0.25);
    }
  });

  it('jumps instead of gliding when the pose leaps by a fret (a renumbering, a re-detection)', () => {
    const filter = new PoseFilter();
    for (let i = 0; i < 10; i++) filter.update(base, i * 33);
    const jumped = renumberPose(base, 1);
    expect(poseDistancePx(filter.update(jumped, 10 * 33), jumped)).toBeLessThan(1e-6);
  });
});

describe('FretboardTracker state machine (scripted detector)', () => {
  it('goes searching -> candidate -> locked, with smoothing and hysteresis', () => {
    const truth = { ...basePose(), numbering: 'nut' as const, numberingConfidence: 0.9, confidence: 0.95 };
    const det = fakeDetector(() => truth);
    const tracker = new FretboardTracker({ detector: det });
    expect(tracker.state).toBe('searching');
    const states: string[] = [];
    for (let i = 0; i < 5; i++) states.push(tracker.update(frame, i * 33).state);
    expect(states).toEqual(['candidate', 'candidate', 'locked', 'locked', 'locked']);
    expect(det.calls).toEqual(['detect', 'track', 'track', 'track', 'track']);
    // A weaker frame does not drop the lock (hysteresis) ...
    const weak = fakeDetector(() => ({ ...truth, confidence: 0.4 }));
    const t2 = new FretboardTracker({ detector: weak, lockConfidence: 0.3 });
    for (let i = 0; i < 4; i++) t2.update(frame, i * 33);
    expect(t2.state).toBe('locked');
    t2.setOptions({ lockConfidence: 0.6, unlockConfidence: 0.3 });
    expect(t2.update(frame, 200).state).toBe('locked');
  });

  it('never locks on a pose whose fret numbers are a guess, and asks for one tap', () => {
    const guess = { ...basePose(), numbering: 'assumed' as const, numberingConfidence: 0.2, confidence: 0.95 };
    const tracker = new FretboardTracker({ detector: fakeDetector(() => guess), askAfterMs: 500 });
    let u = tracker.update(frame, 0);
    for (let i = 1; i <= 10; i++) u = tracker.update(frame, i * 33);
    expect(u.state).toBe('candidate');
    expect(u.numberingConfirmed).toBe(false);
    expect(u.question).toBeNull();
    for (let i = 11; i <= 20; i++) u = tracker.update(frame, i * 33);
    expect(u.question).not.toBeNull();
    const q = fretQuestion(guess);
    expect(q).not.toBeNull();
    // "That cell is fret 7": the numbers now rest on the user and the board locks.
    expect(tracker.confirmFret(u.question!.point, 7)).toBe(true);
    expect(tracker.state).toBe('locked');
    expect(tracker.pose!.numbering).toBe('user');
  });

  it('holds the last pose while lost, resumes the lock within the grace period, then searches', () => {
    let present = true;
    const truth = { ...basePose(), numbering: 'nut' as const, numberingConfidence: 0.9, confidence: 0.95 };
    const det = fakeDetector(() => (present ? truth : null));
    const tracker = new FretboardTracker({ detector: det, lostGraceMs: 300 });
    for (let i = 0; i < 4; i++) tracker.update(frame, i * 33);
    expect(tracker.state).toBe('locked');
    present = false;
    let u = tracker.update(frame, 140);
    expect(u.state).toBe('lost');
    expect(u.pose).not.toBeNull();
    expect(u.confidence).toBeLessThan(0.95);
    present = true;
    u = tracker.update(frame, 180);
    expect(u.state).toBe('locked');
    present = false;
    tracker.update(frame, 220);
    u = tracker.update(frame, 600);
    expect(u.state).toBe('searching');
    expect(u.pose).toBeNull();
    // While lost and searching, detection is told where the board was (fret numbers carry over).
    expect(det.calls.slice(-2)).toEqual(['detect', 'detect']);
  });

  it('takes over a calibrated pose at once and keeps following it', () => {
    const calibrated = basePose();
    const det = fakeDetector((kind, _o, prev) => (kind === 'track' && prev ? shifted(prev, 1) : null));
    const tracker = new FretboardTracker({ detector: det });
    tracker.calibrate(calibrated, 0);
    expect(tracker.state).toBe('locked');
    const u = tracker.update(frame, 33);
    expect(u.state).toBe('locked');
    expect(u.ran).toBe('track');
    expect(u.measured!.numbering).toBe('user');
    expect(tracker.shiftNumbering(2)).toBe(true);
    expect(comparePoses(tracker.pose!, renumberPose(u.measured!, 2)).cellAccuracy).toBeGreaterThan(0.99);
  });

  it('forgets the board when the orientation settings change, and survives a throwing detector', () => {
    const truth = { ...basePose(), numbering: 'nut' as const, numberingConfidence: 0.9 };
    const tracker = new FretboardTracker({ detector: fakeDetector(() => truth) });
    tracker.update(frame, 0);
    expect(tracker.state).toBe('candidate');
    tracker.setOptions({ smoothing: false });
    expect(tracker.state).toBe('candidate');
    tracker.setOptions({ mirrored: true });
    expect(tracker.state).toBe('searching');
    const broken: Detector = { name: 'broken', detect: () => { throw new Error('boom'); }, track: () => { throw new Error('boom'); } };
    const t2 = new FretboardTracker({ detector: broken });
    const u = t2.update(frame, 0);
    expect(u.state).toBe('searching');
    expect(u.reason).toBe('detector-error');
  });
});

describe('FretboardTracker on rendered scenes', () => {
  it('finds, numbers and locks onto a clean board in a few frames, and stays searching on a room without a guitar', () => {
    const scene = renderScene(sampleScene('easy', 0));
    const hints = scene.truth.hints;
    const tracker = new FretboardTracker({ bassSideUp: hints.bassSideUp, mirrored: hints.mirrored, leftHanded: hints.leftHanded, model: hints.model });
    let u = tracker.update(scene.frame, 0);
    expect(u.state).toBe('candidate');
    for (let i = 1; i < 4; i++) u = tracker.update(scene.frame, i * 33);
    expect(u.state).toBe('locked');
    expect(comparePoses(u.pose!, scene.truth.pose!).cellAccuracy).toBeGreaterThanOrEqual(0.95);
    const empty = renderScene(sampleNegativeScene(4));
    const t2 = new FretboardTracker();
    for (let i = 0; i < 3; i++) u = t2.update(empty.frame, i * 33);
    expect(u.state).toBe('searching');
    expect(u.pose).toBeNull();
  });

  it('follows a swaying neck from four slightly sloppy calibration taps', () => {
    const seq = buildSequence('sway', { frames: 8 });
    const first = renderScene(seq.frames[0]);
    const truth = first.truth.pose!;
    const rng = createRng(11);
    const jitter = (p: { x: number; y: number }): { x: number; y: number } => ({ x: p.x + 3 * (rng() - 0.5), y: p.y + 3 * (rng() - 0.5) });
    const end = (fret: number, side: 'bass' | 'treble'): { x: number; y: number } => {
      const x = fretX(truth.model, fret);
      return jitter(applyHomography(truth.H, x, boardEdgeY(truth.model, x, side)));
    };
    const hints = first.truth.hints;
    const tapped = poseFromTaps({ nut: [end(0, 'treble'), end(0, 'bass')], fret: [end(12, 'bass'), end(12, 'treble')] }, W, H, hints);
    expect(tapped).not.toBeNull();
    const tracker = new FretboardTracker({ ...hints, model: hints.model });
    tracker.calibrate(tapped!, 0);
    for (let i = 1; i < seq.frames.length; i++) {
      const scene = renderScene(seq.frames[i]);
      const u = tracker.update(scene.frame, (i * 1000) / seq.fps);
      expect(u.state, `frame ${i}`).toBe('locked');
      expect(comparePoses(u.pose!, scene.truth.pose!).cellAccuracy, `frame ${i}`).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('runs behind the Detector interface for the benchmark loop', () => {
    const seq = buildSequence('still', { frames: 4 });
    const session = createSessionDetector();
    const scenes = seq.frames.map((s) => renderScene(s));
    let pose: FretboardPose | null = { ...scenes[0].truth.pose!, numbering: 'user' };
    for (let i = 1; i < scenes.length; i++) {
      const out = session.track(scenes[i].frame, pose!, { ...scenes[i].truth.hints, timeMs: i * 33 });
      expect(out.pose, `frame ${i}`).not.toBeNull();
      // The loop's retry on the same frame returns the same answer without running again.
      expect(session.detect(scenes[i].frame, { previousPose: pose! }).pose).toBe(out.pose);
      pose = out.pose;
      expect(comparePoses(pose!, scenes[i].truth.pose!).cellAccuracy).toBeGreaterThanOrEqual(0.95);
    }
  });
});

describe('worker protocol host', () => {
  it('answers frames with updates and commands with the new state, and never throws', () => {
    const handle = createVisionHost();
    const update = handle({ type: 'frame', frame, timeMs: 0 });
    expect(update.type).toBe('update');
    if (update.type === 'update') expect(update.update.state).toBe('searching');
    const cal = handle({ type: 'calibrate', pose: basePose(), timeMs: 10 });
    expect(cal).toMatchObject({ type: 'state', ok: true, state: 'locked' });
    expect(handle({ type: 'shift-numbering', delta: 1 })).toMatchObject({ type: 'state', ok: true });
    expect(handle({ type: 'confirm-fret', point: { x: -5000, y: -5000 }, fret: 3 }).type).toBe('state');
    expect(handle({ type: 'options', options: { mirrored: true } })).toMatchObject({ type: 'state', state: 'searching' });
    expect(handle({ type: 'reset' })).toMatchObject({ type: 'state', ok: true, state: 'searching', pose: null });
    expect(handle({ type: 'nonsense' } as never).type).toBe('error');
    expect(handle({ type: 'frame', frame: null as never, timeMs: 0 }).type).not.toBe('state');
  });
});
