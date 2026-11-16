import { describe, expect, it } from 'vitest';
import { TUNINGS } from '@/core/guitar';
import { parseTunerParams, tunerParams } from './address';
import { MAX_CREDIT_SEC, tuneActivity } from './credit';

describe('tuner address', () => {
  it('reads a tuning by id or by a common name, and a capo', () => {
    expect(parseTunerParams(['dadgad'])?.tuning?.id).toBe('dadgad');
    expect(parseTunerParams(['drop-d'])?.tuning?.id).toBe('drop-d');
    expect(parseTunerParams(['open-g'])?.tuning?.id).toBe('open-g');
    expect(parseTunerParams(['eb-standard'])?.tuning?.id).toBe('half-step-down');
    expect(parseTunerParams(['vestapol'])?.tuning?.id).toBe('open-d');
    expect(parseTunerParams(['standard', 'capo-2'])).toMatchObject({ tuning: { id: 'standard' }, capo: 2 });
    expect(parseTunerParams(['capo-3'])).toEqual({ capo: 3 });
    expect(parseTunerParams(['capo-40'])).toEqual({ capo: 12 });
  });

  it('ignores what it does not know', () => {
    expect(parseTunerParams([])).toBeNull();
    expect(parseTunerParams(['banjo-g'])).toBeNull();
    expect(parseTunerParams(['custom-1234'])).toBeNull();
  });

  it('writes params that read back for every catalog tuning', () => {
    for (const t of TUNINGS) {
      const params = tunerParams({ tuning: t.id, capo: 2 });
      for (const p of params) expect(p).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(parseTunerParams(params)).toMatchObject({ tuning: { id: t.id }, capo: 2 });
    }
    expect(tunerParams({ tuning: 'DADGAD' })).toEqual(['dadgad']);
    expect(tunerParams({ tuning: 'standard', capo: 0 })).toEqual(['standard']);
  });
});

describe('credit for tuning', () => {
  it('gives nothing for nothing tuned', () => {
    expect(tuneActivity([false, false, false, false, false, false], { seconds: 60, tuningName: 'Standard' })).toBeNull();
    expect(tuneActivity([], { seconds: 60, tuningName: 'Standard' })).toBeNull();
  });

  it('gives a finished tuning for every string', () => {
    expect(tuneActivity([true, true, true, true, true, true], { seconds: 75.4, tuningName: 'Standard' })).toEqual({ kind: 'tuner', durationSec: 75, route: 'tuner', title: 'Tuned to Standard' });
  });

  it('gives partial credit for a run with strings skipped', () => {
    const a = tuneActivity([true, true, false, true, false, true], { seconds: 90, tuningName: 'DADGAD' });
    expect(a).toMatchObject({ kind: 'tuner', completed: false, count: 4, durationSec: 90, title: 'Tuned 4 of 6 strings (DADGAD)' });
    expect(a!.accuracy).toBeCloseTo(4 / 6, 6);
  });

  it('keeps the time sensible', () => {
    expect(tuneActivity([true, false], { seconds: 0.2, tuningName: 'x' })!.durationSec).toBe(1);
    expect(tuneActivity([true, false], { seconds: 99999, tuningName: 'x' })!.durationSec).toBe(MAX_CREDIT_SEC);
  });
});
