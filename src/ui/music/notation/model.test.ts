import { describe, expect, it } from 'vitest';
import { breakLines, keySpec, measureAccidentals, normaliseItems, parseNotation, signatureAlterations, splitMeasures, stretchLine, timeOf, vexKey } from './model';

describe('parseNotation', () => {
  it('reads notes, chords, rests, dots, ties and bars', () => {
    const { items, errors } = parseNotation('E4/q F#4/8 G4 | (C4 E4 G4)/h. r/q B3/8~ B3');
    expect(errors).toEqual([]);
    expect(items).toEqual([
      { keys: ['E4'], duration: 'q', dots: undefined, tie: undefined },
      { keys: ['F#4'], duration: '8', dots: undefined, tie: undefined },
      { keys: ['G4'], duration: '8', dots: undefined, tie: undefined },
      '|',
      { keys: ['C4', 'E4', 'G4'], duration: 'h', dots: 1, tie: undefined },
      { rest: true, duration: 'q', dots: undefined },
      { keys: ['B3'], duration: '8', dots: undefined, tie: true },
      { keys: ['B3'], duration: '8', dots: undefined, tie: undefined },
    ]);
  });

  it('reports what it cannot read and keeps going', () => {
    const { items, errors } = parseNotation('E4/q H4/q C/q D4/x F4/w');
    expect(items).toHaveLength(2);
    expect(errors).toHaveLength(3);
  });
});

describe('normaliseItems and splitMeasures', () => {
  it('turns plain pitch strings into quarter notes', () => {
    const { notes } = normaliseItems(['C4', 'E4', { keys: ['G4', 'C5'], duration: 'half', color: 'deg-1' }]);
    expect(notes.map((n) => [n.keys.join('+'), n.duration, n.ticks])).toEqual([['C4', 'q', 960], ['E4', 'q', 960], ['G4+C5', 'h', 1920]]);
    expect(notes[2].colors).toEqual(['deg-1', 'deg-1']);
  });

  it('bars by the time signature and ties a note across the barline', () => {
    const { notes, bars } = normaliseItems('C4/h. D4/h E4/q');
    const m = splitMeasures(notes, bars, timeOf('4/4'));
    expect(m).toHaveLength(2);
    expect(m[0].notes.map((n) => `${n.keys[0]}/${n.duration}${n.tie ? '~' : ''}`)).toEqual(['C4/h', 'D4/q~']);
    expect(m[1].notes.map((n) => `${n.keys[0]}/${n.duration}${n.continuation ? '*' : ''}`)).toEqual(['D4/q*', 'E4/q']);
    expect(m.map((x) => x.ticks)).toEqual([3840, 1920]);
  });

  it('keeps explicit bars and chunks free notes without splitting them', () => {
    const { notes, bars } = normaliseItems('C4/w | D4/w');
    expect(splitMeasures(notes, bars, null).map((x) => x.notes.length)).toEqual([1, 1]);
    const free = normaliseItems('C4 D4 E4 F4 G4 A4 B4 C5');
    expect(splitMeasures(free.notes, free.bars, null).map((x) => x.notes.length)).toEqual([4, 4]);
  });

  it('splits a long rest into rests, not ties', () => {
    const { notes } = normaliseItems('C4/h r/w');
    const m = splitMeasures(notes, [], timeOf('4/4'));
    expect(m[0].notes.map((n) => `${n.rest ? 'r' : n.keys[0]}/${n.duration}${n.tie ? '~' : ''}`)).toEqual(['C4/h', 'r/h']);
    expect(m[1].notes.map((n) => `${n.rest ? 'r' : n.keys[0]}/${n.duration}${n.tie ? '~' : ''}`)).toEqual(['r/h']);
  });
});

describe('measureAccidentals', () => {
  it('prints nothing for notes in the key signature', () => {
    expect(measureAccidentals([{ keys: ['F#4'] }, { keys: ['G4'] }], 1)).toEqual([[null], [null]]);
  });

  it('prints a natural against the signature and lets it last the bar', () => {
    expect(measureAccidentals([{ keys: ['F4'] }, { keys: ['F4'] }, { keys: ['F#4'] }], 1)).toEqual([['n'], [null], ['#']]);
  });

  it('treats each octave separately and spells E# in F# major without a sign', () => {
    expect(measureAccidentals([{ keys: ['C#4'] }, { keys: ['C#5'] }, { keys: ['C4'] }], 0)).toEqual([['#'], ['#'], ['n']]);
    expect(measureAccidentals([{ keys: ['E#4'] }], 6)).toEqual([[null]]);
    expect(measureAccidentals([{ keys: ['F##4'] }], 0)).toEqual([['##']]);
  });

  it('does not re-mark a note tied over from the bar before', () => {
    expect(measureAccidentals([{ keys: ['G#4'], continuation: true }, { keys: ['G#4'] }], 0)).toEqual([[null], ['#']]);
  });
});

describe('keys, VexFlow keys, signatures', () => {
  it('reads key signatures', () => {
    expect(keySpec('G major')).toMatchObject({ fifths: 1, vex: 'G', tonic: 'G' });
    expect(keySpec('E minor')).toMatchObject({ fifths: 1, vex: 'G', tonic: 'E' });
    expect(keySpec('Bb')).toMatchObject({ fifths: -2, vex: 'Bb' });
    expect(keySpec(undefined)).toMatchObject({ fifths: 0, vex: 'C', tonic: null });
    expect(signatureAlterations(-3)).toEqual({ B: -1, E: -1, A: -1 });
  });

  it('writes guitar pitch an octave up', () => {
    expect(vexKey('E2', 1)).toBe('e/3');
    expect(vexKey('F#3', 1)).toBe('f#/4');
    expect(vexKey('Bb4')).toBe('bb/4');
  });
});

describe('line breaking', () => {
  it('fills lines greedily, the first carrying the clef, key and time', () => {
    expect(breakLines([100, 100, 100, 100], 360, 40, 20)).toEqual([[0, 1, 2], [3]]);
    expect(breakLines([100, 100, 100, 100], 250, 40, 20)).toEqual([[0], [1, 2], [3]]);
    expect(breakLines([500], 300, 40)).toEqual([[0]]);
  });

  it('stretches full lines and lets a short last line breathe a little', () => {
    expect(stretchLine([100, 100], 400, false)).toEqual([200, 200]);
    expect(stretchLine([100, 100], 400, true)).toEqual([135, 135]);
    expect(stretchLine([150, 150], 400, true)).toEqual([200, 200]);
  });
});
