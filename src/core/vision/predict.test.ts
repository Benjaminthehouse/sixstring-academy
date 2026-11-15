import { describe, expect, it } from 'vitest';
import { poseFromTaps } from './calibration';
import { poseDistancePx, renumberPose, transformPose } from './geometry';
import { PosePredictor } from './predict';
import type { FretboardPose } from './types';

const W = 640;
const H = 360;

function basePose(): FretboardPose {
  return poseFromTaps({ nut: [{ x: 560, y: 150 }, { x: 562, y: 190 }], fret: [{ x: 200, y: 158 }, { x: 203, y: 212 }] }, W, H) as FretboardPose;
}

function moved(pose: FretboardPose, dx: number, dy: number, rotDeg = 0): FretboardPose {
  const a = (rotDeg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  // Rotate about the frame centre, then shift.
  const cx = W / 2;
  const cy = H / 2;
  return transformPose(pose, [c, -s, cx - c * cx + s * cy + dx, s, c, cy - s * cx - c * cy + dy, 0, 0, 1], W, H);
}

describe('PosePredictor', () => {
  const base = basePose();

  it('carries a steadily moving board to the display time', () => {
    // 120 px/s to the right and a slow turn, answers 50 ms behind the display.
    const p = new PosePredictor();
    const at = (t: number): FretboardPose => moved(base, 0.12 * t, 0.03 * t, 0.004 * t);
    let raw = 0;
    let predicted = 0;
    let n = 0;
    for (let i = 0; i < 30; i++) {
      const t = i * 33.3;
      p.push(at(t), t);
      if (i < 3) continue;
      const display = t + 50;
      raw += poseDistancePx(at(t), at(display));
      predicted += poseDistancePx(p.predict(display) as FretboardPose, at(display));
      n++;
    }
    expect(raw / n).toBeGreaterThan(4);
    expect(predicted / n).toBeLessThan(0.15 * (raw / n));
  });

  it('works on poses that crossed a worker boundary (copies, not the same model object)', () => {
    const p = new PosePredictor();
    const at = (t: number): FretboardPose => structuredClone(moved(base, 0.1 * t, 0));
    for (let i = 0; i < 6; i++) p.push(at(i * 33.3), i * 33.3);
    expect(p.speedPxPerSecond).toBeGreaterThan(50);
    expect(poseDistancePx(p.predict(5 * 33.3 + 40) as FretboardPose, at(5 * 33.3 + 40))).toBeLessThan(0.5);
  });

  it('leaves a still board exactly where it is', () => {
    const p = new PosePredictor();
    for (let i = 0; i < 10; i++) p.push(moved(base, 0.05 * Math.sin(i), 0.05 * Math.cos(i)), i * 33.3);
    const out = p.predict(9 * 33.3 + 60) as FretboardPose;
    expect(poseDistancePx(out, p.latest as FretboardPose)).toBe(0);
  });

  it('does not extrapolate across a jump, a renumbering or a long gap', () => {
    const p = new PosePredictor();
    for (let i = 0; i < 5; i++) p.push(moved(base, 4 * i, 0), i * 33.3);
    // A re-detection 150 px away: no velocity from that.
    p.push(moved(base, 170, 0), 5 * 33.3);
    expect(p.speedPxPerSecond).toBe(0);
    expect(poseDistancePx(p.predict(5 * 33.3 + 80) as FretboardPose, moved(base, 170, 0))).toBe(0);
    // Moving again, then the numbers shift: restart.
    p.push(moved(base, 174, 0), 6 * 33.3);
    expect(p.speedPxPerSecond).toBeGreaterThan(0);
    p.push(renumberPose(moved(base, 178, 0), 1, 'user', 1), 7 * 33.3);
    expect(p.speedPxPerSecond).toBe(0);
    // A gap of half a second (a dropped stretch of frames): restart.
    const q = new PosePredictor();
    q.push(moved(base, 0, 0), 0);
    q.push(moved(base, 4, 0), 33);
    expect(q.speedPxPerSecond).toBeGreaterThan(0);
    q.push(moved(base, 8, 0), 600);
    expect(q.speedPxPerSecond).toBe(0);
  });

  it('caps the lead and never predicts into the past', () => {
    const p = new PosePredictor({ maxLeadMs: 60 });
    for (let i = 0; i < 6; i++) p.push(moved(base, 5 * i, 0), i * 33.3);
    const last = p.latest as FretboardPose;
    const far = p.predict(5 * 33.3 + 1000) as FretboardPose;
    const capped = p.predict(5 * 33.3 + 60) as FretboardPose;
    expect(poseDistancePx(far, capped)).toBeLessThan(1e-6);
    expect(poseDistancePx(p.predict(5 * 33.3 - 20) as FretboardPose, last)).toBe(0);
    expect(new PosePredictor().predict(100)).toBeNull();
  });
});
