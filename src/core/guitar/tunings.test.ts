import { describe, expect, it } from 'vitest';
import { noteToMidi } from '@/core/theory';
import {
  TUNINGS, STANDARD_TUNING, customTuning, getTuning, hasStandardIntervals, identifyTuning, nearestString, retuneSteps,
  stringTargets, tuning, tuningFrequencies, tuningFromMidi, tuningIntervals, tuningsFor,
} from './index';

describe('tuning catalog', () => {
  const expected: Record<string, number[]> = {
    standard: [40, 45, 50, 55, 59, 64],
    'half-step-down': [39, 44, 49, 54, 58, 63],
    'whole-step-down': [38, 43, 48, 53, 57, 62],
    'drop-d': [38, 45, 50, 55, 59, 64],
    'double-drop-d': [38, 45, 50, 55, 59, 62],
    'drop-c-sharp': [37, 44, 49, 54, 58, 63],
    'drop-c': [36, 43, 48, 53, 57, 62],
    dadgad: [38, 45, 50, 55, 57, 62],
    'open-g': [38, 43, 50, 55, 59, 62],
    'open-d': [38, 45, 50, 54, 57, 62],
    'open-e': [40, 47, 52, 56, 59, 64],
    'open-a': [40, 45, 52, 57, 61, 64],
    'open-c': [36, 43, 48, 55, 60, 64],
    'open-dm': [38, 45, 50, 53, 57, 62],
    'open-em': [40, 47, 52, 55, 59, 64],
    'all-fourths': [40, 45, 50, 55, 60, 65],
    nashville: [52, 57, 62, 67, 59, 64],
    'standard-7': [35, 40, 45, 50, 55, 59, 64],
    bass: [28, 33, 38, 43],
    ukulele: [67, 60, 64, 69],
  };

  it('holds every required tuning with the right open strings', () => {
    for (const [id, midi] of Object.entries(expected)) {
      const t = getTuning(id);
      expect(t, id).not.toBeNull();
      expect([...t!.midi], id).toEqual(midi);
    }
  });

  it('keeps ids unique, notes in step with MIDI, and every entry described', () => {
    expect(new Set(TUNINGS.map((t) => t.id)).size).toBe(TUNINGS.length);
    for (const t of TUNINGS) {
      expect(t.notes.map((n) => noteToMidi(n)), t.id).toEqual([...t.midi]);
      expect(t.stringCount).toBe(t.midi.length);
      expect(t.label.split(' ')).toHaveLength(t.stringCount);
      expect(t.description.length, t.id).toBeGreaterThan(20);
      expect(t.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(t.custom).toBe(false);
    }
  });

  it('open chords really are the chords their tunings are named after', () => {
    const pcs = (id: string) => [...new Set(tuning(id).midi.map((m) => m % 12))].sort((a, b) => a - b);
    expect(pcs('open-g')).toEqual([2, 7, 11]); // G B D
    expect(pcs('open-d')).toEqual([2, 6, 9]); // D F# A
    expect(pcs('open-e')).toEqual([4, 8, 11]); // E G# B
    expect(pcs('open-a')).toEqual([1, 4, 9]); // A C# E
    expect(pcs('open-c')).toEqual([0, 4, 7]); // C E G
    expect(pcs('open-dm')).toEqual([2, 5, 9]); // D F A
    expect(pcs('open-em')).toEqual([4, 7, 11]); // E G B
    expect(pcs('dadgad')).toEqual([2, 7, 9]); // D G A = Dsus4
  });

  it('flags re-entrant tunings', () => {
    expect(tuning('ukulele').reentrant).toBe(true);
    expect(tuning('nashville').reentrant).toBe(true);
    expect(tuning('standard').reentrant).toBe(false);
    expect(tuning('ukulele-low-g').reentrant).toBe(false);
  });

  it('finds tunings by id, name and alias', () => {
    expect(getTuning('Drop D')?.id).toBe('drop-d');
    expect(getTuning('DADGAD')?.id).toBe('dadgad');
    expect(getTuning('Eb standard')?.id).toBe('half-step-down');
    expect(getTuning('E♭ Standard')?.id).toBe('half-step-down');
    expect(getTuning('drop c#')?.id).toBe('drop-c-sharp');
    expect(getTuning('Open D minor')?.id).toBe('open-dm');
    expect(getTuning('nonsense')).toBeNull();
    expect(tuning()).toBe(STANDARD_TUNING);
    expect(tuning(undefined)).toBe(STANDARD_TUNING);
    expect(() => tuning('nonsense')).toThrow(RangeError);
  });

  it('lists tunings per instrument', () => {
    expect(tuningsFor('guitar').every((t) => t.instrument === 'guitar')).toBe(true);
    expect(tuningsFor('guitar', 7).map((t) => t.id)).toContain('standard-7');
    expect(tuningsFor('bass', 4).map((t) => t.id)).toEqual(['bass', 'bass-drop-d']);
    expect(tuningsFor('ukulele').length).toBeGreaterThanOrEqual(2);
  });
});

describe('custom tunings', () => {
  it('recognises catalog tunings written as note names', () => {
    expect(customTuning('DADGAD')).toBe(getTuning('dadgad'));
    expect(customTuning('D A D G A D')).toBe(getTuning('dadgad'));
    expect(customTuning('E A D G B E')).toBe(STANDARD_TUNING);
    expect(customTuning(['C2', 'G2', 'C3', 'G3', 'C4', 'E4'])).toBe(getTuning('open-c'));
    expect(customTuning('CGCGCE')).toBe(getTuning('open-c'));
    expect(customTuning('C#G#C#F#A#D#')).toBe(getTuning('drop-c-sharp'));
    expect(customTuning('Eb Ab Db Gb Bb Eb')).toBe(getTuning('half-step-down'));
    expect(customTuning('G C E A')).toBe(getTuning('ukulele'));
    expect(customTuning('E A D G')).toBe(getTuning('bass'));
    expect(customTuning('B E A D G B E')).toBe(getTuning('standard-7'));
    expect(tuning('D A D G A D')).toBe(getTuning('dadgad'));
  });

  it('builds new tunings with octaves near the usual string pitch', () => {
    const t = customTuning('C G D A E G');
    expect(t.custom).toBe(true);
    expect([...t.midi]).toEqual([36, 43, 50, 57, 64, 67]);
    expect([...t.notes]).toEqual(['C2', 'G2', 'D3', 'A3', 'E4', 'G4']);
    expect(t.label).toBe('C G D A E G');
    // The id of a custom tuning resolves for the rest of the session, so voicings can refer to it.
    expect(tuning(t.id)).toBe(t);
    const named = customTuning('F A C G B E', { id: 'my-tuning', name: 'Mine' });
    expect(named.id).toBe('my-tuning');
    expect(named.name).toBe('Mine');
    expect(getTuning('my-tuning')).toBe(named);
  });

  it('spells octaves correctly across the B#/Cb line', () => {
    expect([...customTuning(['Cb2', 'B#2']).midi]).toEqual([35, 48]);
    expect(customTuning('Cb Fb', { instrument: 'guitar' }).notes.every((n) => /\d$/.test(n))).toBe(true);
  });

  it('rejects unreadable input', () => {
    expect(() => customTuning('E')).toThrow(RangeError);
    expect(() => customTuning('E A H')).toThrow(RangeError);
    expect(() => customTuning([])).toThrow(RangeError);
  });

  it('builds tunings from MIDI numbers', () => {
    expect(tuningFromMidi([40, 45, 50, 55, 59, 64])).toBe(STANDARD_TUNING);
    expect(tuning([38, 45, 50, 55, 59, 64]).id).toBe('drop-d');
    const t = tuningFromMidi([39, 46, 51, 55, 58, 63]);
    expect(t.custom).toBe(true);
    expect([...t.notes]).toEqual(['Eb2', 'Bb2', 'Eb3', 'G3', 'Bb3', 'Eb4']);
    expect(identifyTuning([38, 45, 50, 55, 57, 62])?.id).toBe('dadgad');
    expect(identifyTuning([1, 2, 3])).toBeNull();
    expect(() => tuningFromMidi([40])).toThrow(RangeError);
  });
});

describe('tuner targets', () => {
  it('gives equal-tempered frequencies for the concert pitch', () => {
    const f = tuningFrequencies('standard');
    expect(f[1]).toBeCloseTo(110, 6); // A2
    expect(f[0]).toBeCloseTo(82.4069, 3);
    expect(f[5]).toBeCloseTo(329.6276, 3);
    const low = tuningFrequencies('standard', 432);
    expect(low[1]).toBeCloseTo(108, 6);
    expect(low[0] / f[0]).toBeCloseTo(432 / 440, 9);
    expect(tuningFrequencies('drop-d')[0]).toBeCloseTo(73.4162, 3);
  });

  it('lists a target per string with string numbers the guitarist way', () => {
    const targets = stringTargets('drop-d', { a4: 442 });
    expect(targets.map((t) => t.string)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(targets[0]).toMatchObject({ string: 6, index: 0, midi: 38, note: 'D2' });
    expect(targets[1].frequency).toBeCloseTo(110.5, 6);
    expect(stringTargets('ukulele').map((t) => t.note)).toEqual(['G4', 'C4', 'E4', 'A4']);
  });

  it('matches a heard pitch to the nearest string', () => {
    const flatA = nearestString(108)!;
    expect(flatA.string).toBe(5);
    expect(flatA.cents).toBeCloseTo(-31.77, 1);
    expect(flatA.inTune).toBe(false);
    expect(nearestString(329.7)!).toMatchObject({ string: 1, inTune: true });
    expect(nearestString(73.5, 'drop-d')!.string).toBe(6);
    expect(nearestString(0)).toBeNull();
    expect(nearestString(NaN)).toBeNull();
  });

  it('says how to retune from standard', () => {
    const steps = retuneSteps('dadgad');
    expect(steps.filter((s) => s.semitones !== 0).map((s) => [s.string, s.semitones])).toEqual([[6, -2], [2, -2], [1, -2]]);
    expect(retuneSteps('drop-d')[0]).toMatchObject({ string: 6, from: 'E2', to: 'D2', semitones: -2 });
    expect(() => retuneSteps('bass')).toThrow(RangeError);
  });

  it('knows which tunings keep the standard shapes', () => {
    expect(tuningIntervals('standard')).toEqual([5, 5, 5, 4, 5]);
    for (const id of ['standard', 'half-step-down', 'whole-step-down', 'standard-7']) expect(hasStandardIntervals(id), id).toBe(true);
    for (const id of ['drop-d', 'dadgad', 'open-g', 'all-fourths', 'bass', 'ukulele', 'nashville']) expect(hasStandardIntervals(id), id).toBe(false);
  });
});
