import { describe, expect, it } from 'vitest';
import { QualityController } from './quality';

/** Feed `count` frames costing `ms` each at 30 fps from `start`; returns the time after the last. */
function feed(q: QualityController, kind: 'track' | 'detect', ms: number, count: number, start: number): number {
  let t = start;
  for (let i = 0; i < count; i++) {
    q.record(kind, ms, t);
    t += 33.3;
  }
  return t;
}

describe('QualityController', () => {
  it('starts at the largest size and ignores the warm-up', () => {
    const q = new QualityController();
    expect(q.settings).toEqual({ workingWidth: 640, detectIntervalMs: 0, level: 0 });
    // Slow first frames (just-in-time compilation) do not count.
    feed(q, 'track', 120, 50, 0);
    expect(q.settings.workingWidth).toBe(640);
  });

  it('steps down when tracking is over budget and back up when there is headroom', () => {
    const q = new QualityController({ warmupMs: 0 });
    let t = feed(q, 'track', 60, 10, 0);
    expect(q.settings.workingWidth).toBe(544);
    // Still over budget, but the cooldown holds the next step back for a moment.
    t = feed(q, 'track', 60, 10, t);
    expect(q.settings.workingWidth).toBe(544);
    t = feed(q, 'track', 60, 60, t);
    expect(q.settings.workingWidth).toBe(480);
    t = feed(q, 'track', 60, 60, t);
    expect(q.settings.workingWidth).toBe(480);
    // Plenty of headroom for 3 s: one step up at a time.
    t = feed(q, 'track', 12, 60, t);
    expect(q.settings.workingWidth).toBe(480);
    t = feed(q, 'track', 12, 60, t);
    expect(q.settings.workingWidth).toBe(544);
    t = feed(q, 'track', 12, 150, t);
    expect(q.settings.workingWidth).toBe(640);
    // Borderline (the bigger size would not fit): stays.
    const r = new QualityController({ warmupMs: 0, startWidth: 480 });
    feed(r, 'track', 30, 300, 0);
    expect(r.settings.workingWidth).toBe(480);
  });

  it('spaces out detections that are over budget', () => {
    const q = new QualityController({ warmupMs: 0 });
    feed(q, 'detect', 60, 6, 0);
    expect(q.settings.detectIntervalMs).toBe(0);
    feed(q, 'detect', 150, 12, 1000);
    // 150 ms detections at a duty of 0.75: a 50 ms pause after each.
    expect(q.settings.detectIntervalMs).toBe(50);
    expect(q.settings.workingWidth).toBe(640);
    // Far over budget: also a smaller frame.
    feed(q, 'detect', 400, 12, 3000);
    expect(q.settings.workingWidth).toBe(544);
    expect(q.settings.detectIntervalMs).toBeLessThanOrEqual(500);
  });

  it('respects custom ladders and ignores nonsense', () => {
    const q = new QualityController({ widths: [320, 960, 640], warmupMs: 0 });
    expect(q.settings.workingWidth).toBe(960);
    expect(q.record('track', NaN, 0)).toBe(false);
    expect(q.record('track', -5, 0)).toBe(false);
    feed(q, 'track', 200, 120, 0);
    expect(q.settings.workingWidth).toBe(320);
  });
});
