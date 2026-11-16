import { describe, expect, it } from 'vitest';
import { createFretboardDetector } from './detector';
import { scoreAlt } from './testing/alt-bench';
import { altCondition, createAltCache, renderAlt } from './testing/alt-scenes';
import { FretboardTracker } from './tracker';
import type { Detector, DetectionResult } from './types';

// Temporary experiment: the e2e 'jump' scene played back and forth with frames skipped as a loaded machine does.
describe('jump sim', () => {
  it('logs', () => {
    const cond = altCondition('typical');
    const seed = Number(process.env.SIM_SEED ?? 12);
    const a = cond.build(seed);
    const b = cond.build(seed + 1000);
    const FR = 150;
    const frames = [];
    const ca = createAltCache();
    const cb = createAltCache();
    for (let i = 0; i < FR; i++) frames.push(i >= 75 ? renderAlt(b, i, cb) : renderAlt(a, i, ca));
    const order = [...Array(FR).keys(), ...[...Array(FR - 2).keys()].map((k) => FR - 2 - k)];
    for (const skipMax of (process.env.SIM_SKIP ?? '1,3,6').split(',').map(Number)) {
      const inner = createFretboardDetector();
      let last: DetectionResult | null = null;
      const det: Detector = { name: 'w', detect: (f, o) => (last = inner.detect(f, o)), track: (f, p, o) => (last = inner.track(f, p, o)), reset: () => inner.reset?.() };
      const tracker = new FretboardTracker({ model: a.hints.model, detector: det });
      let rng = 7;
      const rand = () => ((rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648);
      let jumps = 0;
      let locked = 0;
      let wrong = 0;
      let candidate = 0;
      const wrongAt: number[] = [];
      const jumpAt: number[] = [];
      for (let loop = 0; loop < 2; loop++) {
        for (let k = 0; k < order.length; k += 1 + Math.floor(rand() * skipMax)) {
          const i = order[k];
          const t = (loop * order.length + k) * 33.3;
          last = null;
          const u = tracker.update(frames[i].frame, t);
          const st = (last as DetectionResult | null)?.diagnostics.stats ?? {};
          if (st.jump) {
            jumps++;
            jumpAt.push(i);
          }
          if (u.state === 'candidate') candidate++;
          if (u.state === 'locked' && u.pose) {
            const s = scoreAlt(u.pose, frames[i].truth);
            if (s.cells > 0) {
              locked++;
              if (s.accuracy < 0.9) {
                wrong++;
                wrongAt.push(i);
              }
            }
          }
        }
      }
      console.log(`skip<=${skipMax}: locked ${locked}, wrong ${wrong} at ${wrongAt.slice(0, 20).join(',')}, candidate ${candidate}, jumps ${jumps} at ${jumpAt.join(',')}`);
    }
    expect(true).toBe(true);
  }, 1_800_000);
});
