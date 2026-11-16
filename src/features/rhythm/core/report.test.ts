import { describe, expect, it } from 'vitest';
import type { SessionResult } from '../engine/session';
import { activityFor } from './report';

const stats = { accuracy: 0.8, stars: 2, miss: 1, extra: 0, ok: 1, wrongDirection: 0, bestRun: 5, total: 10, meanMs: 12.4, sdMs: 20.6, hits: 8 };
const result = (patch: Partial<SessionResult>): SessionResult => ({ stats: stats as unknown as SessionResult['stats'], judgements: [], completed: true, durationSec: 31.6, due: 10, ...patch });
const spec = { skill: 'rhythm:read:1', title: 'Reading 1', params: ['read', '1'] };

describe('what a rhythm round reports', () => {
  it('a finished round, with its stars and tempo', () => {
    const a = activityFor(spec, result({}), 92)!;
    expect(a).toMatchObject({ kind: 'rhythm', id: 'rhythm:read:1', completed: true, stars: 2, durationSec: 32, data: { bpm: 92 }, meta: { bpm: 92, meanMs: 12, sdMs: 21 } });
  });

  it('a round left part way (another screen, a reload) still counts, without stars', () => {
    const a = activityFor(spec, result({ completed: false, due: 6, durationSec: 14 }), 92)!;
    expect(a.completed).toBe(false);
    expect(a.stars).toBe(0);
  });

  it('nothing for a round stopped before anything much was due, or one that is not scored', () => {
    expect(activityFor(spec, result({ completed: false, due: 3 }), 92)).toBeNull();
    expect(activityFor(spec, result({ completed: false, due: 8, stats: { ...stats, hits: 2 } as unknown as SessionResult['stats'] }), 92)).toBeNull();
    expect(activityFor({ ...spec, record: false }, result({}), 92)).toBeNull();
  });
});
