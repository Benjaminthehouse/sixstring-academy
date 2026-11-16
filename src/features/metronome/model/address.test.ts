import { describe, expect, it } from 'vitest';
import { applyAddress, metronomeParams, parseMetronomeParams, type MetronomeAddress } from './address';
import { accentsOf, DEFAULT_SETTINGS, describeSetup, sanitizeSettings, setupOf } from './settings';

const SAFE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

describe('metronome address', () => {
  it('reads tempo, meter, grouping, subdivision, swing, accents and silent bars', () => {
    expect(parseMetronomeParams(['t80'])).toEqual({ tempo: 80 });
    expect(parseMetronomeParams(['96'])).toEqual({ tempo: 96 });
    expect(parseMetronomeParams(['3-4'])).toEqual({ meter: '3/4' });
    expect(parseMetronomeParams(['7-8-2-2-3'])).toEqual({ meter: '7/8' });
    expect(parseMetronomeParams(['7-8-3-2-2'])).toEqual({ meter: '7/8(3+2+2)' });
    expect(parseMetronomeParams(['eighth'])).toEqual({ subdivision: 'eighth' });
    expect(parseMetronomeParams(['beats'])).toEqual({ subdivision: 'none' });
    expect(parseMetronomeParams(['triplet'])).toEqual({ subdivision: 'triplet' });
    expect(parseMetronomeParams(['swing-60'])).toEqual({ swing: 0.6 });
    expect(parseMetronomeParams(['swing-67'])).toEqual({ swing: 2 / 3 });
    expect(parseMetronomeParams(['accents-2-3-1'])).toEqual({ accents: [2, 3, 1] });
    expect(parseMetronomeParams(['gap-1-1'])).toEqual({ gap: { play: 1, mute: 1 } });
    expect(parseMetronomeParams(['t50', '3-4', 'accents-2-3-1'])).toEqual({ tempo: 50, meter: '3/4', accents: [2, 3, 1] });
  });

  it('keeps values in range and ignores what it does not know', () => {
    expect(parseMetronomeParams(['t999'])).toEqual({ tempo: 400 });
    expect(parseMetronomeParams(['swing-90'])).toEqual({ swing: 0.75 });
    expect(parseMetronomeParams(['13-8'])).toBeNull(); // not offered by the picker
    expect(parseMetronomeParams(['7-8-4-3'])).toBeNull(); // not a grouping the picker offers
    expect(parseMetronomeParams(['gap-0-2'])).toBeNull();
    expect(parseMetronomeParams(['accents-4-1'])).toBeNull();
    expect(parseMetronomeParams(['hello', 'presets'])).toBeNull();
    expect(parseMetronomeParams([])).toBeNull();
  });

  it('writes slug-safe params that read back to the same address', () => {
    const cases: MetronomeAddress[] = [
      { tempo: 80 },
      { tempo: 72, meter: '3/4', accents: [3, 1, 1] },
      { meter: '7/8(3+2+2)', subdivision: 'eighth', tempo: 80 },
      { swing: 0.6 },
      { subdivision: 'none' },
      { tempo: 80, accents: [3, 0, 0, 0], gap: { play: 1, mute: 1 } },
    ];
    for (const a of cases) {
      const params = metronomeParams(a);
      for (const p of params) expect(p, JSON.stringify(a)).toMatch(SAFE);
      expect(parseMetronomeParams(params), params.join('--')).toEqual(a);
    }
    expect(metronomeParams({ tempo: 50, meter: '3/4', accents: [2, 3, 1] })).toEqual(['t50', '3-4', 'accents-2-3-1']);
    expect(metronomeParams({ meter: '7/8' })).toEqual(['7-8']);
  });

  it('applies a whole setup and keeps the learner’s own things', () => {
    const before = sanitizeSettings({
      ...DEFAULT_SETTINGS,
      tempo: 140,
      meter: '7/8(3+2+2)',
      subdivision: 'sixteenth',
      accents: [0, 3, 1],
      volume: 0.6,
      countIn: 1,
      timerMinutes: 10,
      vibrate: true,
      trainer: { on: true, start: 100, target: 140, step: 5, every: 4 },
      gap: { on: true, play: 2, mute: 2 },
    });
    // "Set the Metronome to 80 BPM": plain 4/4 at 80, nothing left over from last time.
    const plain = applyAddress(before, { tempo: 80 });
    expect(setupOf(plain)).toMatchObject({ tempo: 80, meter: '4/4', accents: null, subdivision: 'none', countIn: 1 });
    expect(plain.trainer.on).toBe(false);
    expect(plain.gap.on).toBe(false);
    expect([plain.volume, plain.timerMinutes, plain.vibrate]).toEqual([0.6, 10, true]);
    expect(describeSetup(setupOf(plain))).toBe('80 BPM · 4/4');

    // Elena's sarabande: 3/4, beat 2 strong, beat 1 medium.
    const sarabande = applyAddress(before, parseMetronomeParams(['t50', '3-4', 'accents-2-3-1'])!);
    expect(sarabande.meter).toBe('3/4');
    expect(accentsOf(sarabande)).toEqual([2, 3, 1]);

    // "7/8, grouped 2+2+3, Eighths, 80 BPM."
    const seven = applyAddress(before, parseMetronomeParams(['7-8-2-2-3', 'eighth', 't80'])!);
    expect([seven.meter, seven.subdivision, seven.tempo]).toEqual(['7/8', 'eighth', 80]);

    // Swing alone means swung eighths.
    const swung = applyAddress(before, { swing: 0.6 });
    expect([swung.subdivision, swung.swing]).toEqual(['swing', 0.6]);

    // "One click every two bars": accents on 1 only, one bar played, one silent.
    const sparse = applyAddress(before, parseMetronomeParams(['t80', 'accents-3-0-0-0', 'gap-1-1'])!);
    expect(sparse.gap).toEqual({ on: true, play: 1, mute: 1 });
    expect(accentsOf(sparse)).toEqual([3, 0, 0, 0]);

    // Accents for another meter are ignored rather than half applied.
    expect(applyAddress(before, { meter: '3/4', accents: [3, 1, 1, 1] }).accents).toBeNull();
    // No tempo named: the learner's tempo stays.
    expect(applyAddress(before, { meter: '6/8' }).tempo).toBe(140);
  });
});
