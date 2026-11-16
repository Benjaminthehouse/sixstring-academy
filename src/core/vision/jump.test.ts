import { describe, expect, it } from 'vitest';
import { createFretboardDetector } from './detector';
import { scoreAlt } from './testing/alt-bench';
import { altCondition, createAltCache, renderAlt } from './testing/alt-scenes';
import { FretboardTracker } from './tracker';
import type { Detector, DetectionResult } from './types';

describe('jump experiment', () => {
  it('summary', () => {
    const SEEDS = (process.env.JUMP_SEEDS ?? '12').split(',').flatMap((s) => {
      const [a, b] = s.split('-').map(Number);
      return b !== undefined ? Array.from({ length: b - a + 1 }, (_, k) => a + k) : [a];
    });
    const CUTS = (process.env.JUMP_CUT ?? '24').split(',').map(Number);
    const AFTER = Number(process.env.JUMP_AFTER ?? 20);
    const tot = { lockedAfter: 0, wrongAfter: 0, rightAfter: 0, scenes: 0, scenesWrong: 0, scenesWrongEnd: 0, jumps: 0 };
    const rows: string[] = [];
    for (const seed of SEEDS) {
      for (const CUT of CUTS) {
        const cond = altCondition(process.env.JUMP_COND ?? 'typical');
        const a = cond.build(seed);
        const b = cond.build(seed + 1000);
        const ca = createAltCache();
        const cb = createAltCache();
        const inner = createFretboardDetector();
        let last: DetectionResult | null = null;
        const det: Detector = {
          name: 'wrap',
          detect: (f, o) => (last = inner.detect(f, o)),
          track: (f, p, o) => (last = inner.track(f, p, o)),
          reset: () => inner.reset?.(),
        };
        const tracker = new FretboardTracker({ model: a.hints.model, detector: det });
        let wrong = 0;
        let right = 0;
        let locked = 0;
        let lastWrong = false;
        const trail: string[] = [];
        for (let i = 0; i < CUT + AFTER; i++) {
          const after = i >= CUT;
          const { frame, truth } = renderAlt(after ? b : a, i, after ? cb : ca);
          last = null;
          const u = tracker.update(frame, i * 33.3);
          if (!after) continue;
          const st = (last as DetectionResult | null)?.diagnostics.stats ?? {};
          if (st.jump !== undefined) tot.jumps++;
          const s = u.pose && u.state === 'locked' ? scoreAlt(u.pose, truth) : null;
          if (u.state === 'locked' && s && s.cells > 0) {
            locked++;
            if (s.accuracy < 0.9) wrong++;
            else right++;
            lastWrong = s.accuracy < 0.9;
          } else lastWrong = false;
          trail.push(u.state === 'locked' ? (s && s.cells > 0 ? (s.accuracy < 0.9 ? `X${s.offset}` : 'L') : 'l') : u.state[0]);
        }
        tot.scenes++;
        tot.lockedAfter += locked;
        tot.wrongAfter += wrong;
        tot.rightAfter += right;
        if (wrong) tot.scenesWrong++;
        if (lastWrong) tot.scenesWrongEnd++;
        rows.push(`seed ${seed} cut ${CUT}: locked ${locked} wrong ${wrong} right ${right}  ${trail.join(' ')}`);
      }
    }
    console.log(rows.join('\n'));
    console.log(JSON.stringify(tot));
    expect(true).toBe(true);
  }, 3_600_000);
});
