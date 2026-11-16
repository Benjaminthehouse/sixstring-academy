import { describe, expect, it } from 'vitest';
import { chordVoicings, midiAt, scalePositions } from '@/core/guitar';
import { chordPcs, circleOfFifths, keySignaturePositions, parseNote, scalePcs, staffPosition } from '@/core/theory';
import { degreeSemitones, figureProblems, keyAlteration, positionProblem, resolveFigure, shownAccidental, voicingFor } from './figures';
import type { Figure } from './types';

const ok = (figure: Figure): void => expect(figureProblems(figure), JSON.stringify(figure)).toEqual([]);
const bad = (figure: Figure, pattern: RegExp): void => expect(figureProblems(figure).join(' | '), JSON.stringify(figure)).toMatch(pattern);

describe('fretboard figures', () => {
  it('accepts dots whose claims match the neck', () => {
    ok({ kind: 'fretboard', dots: [{ string: 6, fret: 3, note: 'G' }, { string: 5, fret: 2, note: 'B2' }, { string: 1, fret: 0, note: 'E4' }] });
    ok({ kind: 'fretboard', root: 'A', frets: [5, 8], dots: [{ string: 6, fret: 5, degree: '1' }, { string: 6, fret: 8, degree: 'b3' }, { string: 5, fret: 7, degree: '5' }] });
    ok({ kind: 'fretboard', tuning: 'drop-d', dots: [{ string: 6, fret: 0, note: 'D' }] });
    ok({ kind: 'fretboard', capo: 2, dots: [{ string: 6, fret: 0, note: 'F#' }] });
    ok({ kind: 'fretboard', dots: [{ string: 2, fret: 1, note: 'C', label: 'do', role: 'root', finger: 1 }], labels: 'finger' });
  });

  it('rejects positions that do not exist', () => {
    bad({ kind: 'fretboard', dots: [{ string: 7, fret: 0 }] }, /string 7 does not exist.*1 to 6/);
    bad({ kind: 'fretboard', dots: [{ string: 0, fret: 0 }] }, /string 0 does not exist/);
    bad({ kind: 'fretboard', dots: [{ string: 1, fret: 23 }] }, /fret 23 is not on the neck/);
    bad({ kind: 'fretboard', dots: [{ string: 1, fret: -1 }] }, /fret -1/);
    bad({ kind: 'fretboard', dots: [{ string: 1, fret: 1.5 }] }, /fret 1.5/);
    bad({ kind: 'fretboard', capo: 4, dots: [{ string: 1, fret: 20 }] }, /fret 20 is not on the neck \(0 to 18/);
  });

  it('rejects claims the neck contradicts, and says what is really there', () => {
    bad({ kind: 'fretboard', dots: [{ string: 6, fret: 3, note: 'A' }] }, /Dot 1 \(string 6, fret 3\) is G2 on the neck, not A/);
    bad({ kind: 'fretboard', dots: [{ string: 6, fret: 3, note: 'G3' }] }, /is G2 on the neck, not G3/);
    bad({ kind: 'fretboard', dots: [{ string: 6, fret: 3, note: 'H' }] }, /not a note name/);
    bad({ kind: 'fretboard', root: 'A', dots: [{ string: 6, fret: 8, degree: '3' }] }, /is the b3 of A, not the 3/);
    bad({ kind: 'fretboard', dots: [{ string: 6, fret: 8, degree: '3' }] }, /has no "root"/);
    bad({ kind: 'fretboard', root: 'A', dots: [{ string: 6, fret: 8, degree: 'x' }] }, /not a degree label/);
  });

  it('rejects malformed figures', () => {
    bad({ kind: 'fretboard' }, /no dots/);
    bad({ kind: 'fretboard', dots: [] }, /no dots/);
    bad({ kind: 'fretboard', tuning: 'nope', dots: [{ string: 1, fret: 0 }] }, /not a tuning/);
    bad({ kind: 'fretboard', capo: 20, dots: [{ string: 1, fret: 0 }] }, /Capo 20/);
    bad({ kind: 'fretboard', frets: [5, 2], dots: [{ string: 1, fret: 3 }] }, /fret range \[5, 2\] is not valid/);
    bad({ kind: 'fretboard', frets: [0, 20], dots: [{ string: 1, fret: 3 }] }, /spans 21 frets/);
    bad({ kind: 'fretboard', frets: [5, 8], dots: [{ string: 1, fret: 3 }] }, /outside the fret range/);
    bad({ kind: 'fretboard', dots: [{ string: 1, fret: 3 }, { string: 1, fret: 3 }] }, /listed twice/);
    bad({ kind: 'fretboard', root: 'Q', dots: [{ string: 1, fret: 3 }] }, /root "Q" is not a note/);
    bad({ kind: 'fretboard', derive: { scale: 'nope', tonic: 'A' } }, /not a scale id/);
    bad({ kind: 'fretboard', derive: { chord: '???' } }, /not a chord symbol/);
    bad({ kind: 'fretboard', derive: { note: 'C6' }, frets: [0, 3] }, /Nothing to show/);
  });

  it('resolves dots with pitch, spelled note, degree, role and label', () => {
    const r = resolveFigure({ kind: 'fretboard', root: 'A', labels: 'degree', frets: [5, 8], dots: [{ string: 6, fret: 5 }, { string: 6, fret: 8 }, { string: 5, fret: 7, label: 'five' }] });
    expect(r.frets).toEqual([5, 8]);
    expect(r.dots).toEqual([
      { string: 6, fret: 5, midi: 45, note: 'A', degree: '1', role: 'root', label: '1', finger: null },
      { string: 6, fret: 8, midi: 48, note: 'C', degree: 'b3', role: 'third', label: 'b3', finger: null },
      { string: 5, fret: 7, midi: 52, note: 'E', degree: '5', role: 'fifth', label: 'five', finger: null },
    ]);
    expect(r.tuning.id).toBe('standard');
    const wide = resolveFigure({ kind: 'fretboard', dots: [{ string: 1, fret: 7 }] });
    expect(wide.frets).toEqual([0, 7]);
    expect(wide.dots[0]).toMatchObject({ midi: midiAt({ string: 1, fret: 7 }), note: 'B', label: 'B', degree: null, role: 'tone' });
  });

  it('derives dots from a scale, a chord or a note with the engine', () => {
    const scale = resolveFigure({ kind: 'fretboard', derive: { scale: 'minor-pentatonic', tonic: 'A' }, frets: [5, 8] });
    const expected = scalePositions('A', 'minor-pentatonic', { minFret: 5, maxFret: 8 });
    expect(scale.dots).toHaveLength(expected.length);
    expect(scale.dots.every((d) => scalePcs('A', 'minor-pentatonic').includes(d.midi % 12))).toBe(true);
    expect(scale.dots.find((d) => d.string === 6 && d.fret === 5)).toMatchObject({ note: 'A', degree: '1', role: 'root' });
    expect(scale.root).toBe('A');

    const chord = resolveFigure({ kind: 'fretboard', derive: { chord: 'C' }, frets: [0, 3], strings: [5, 4, 3] });
    expect(chord.dots.map((d) => `${d.string}:${d.fret}:${d.note}`)).toEqual(['5:3:C', '4:2:E', '3:0:G']);
    expect(chord.dots.every((d) => chordPcs('C').includes(d.midi % 12))).toBe(true);

    const note = resolveFigure({ kind: 'fretboard', derive: { note: 'E' }, frets: [0, 5] });
    expect(note.dots.map((d) => `${d.string}:${d.fret}`)).toEqual(['6:0', '4:2', '2:5', '1:0']);
    const exact = resolveFigure({ kind: 'fretboard', derive: { note: 'E4' }, frets: [0, 5] });
    expect(exact.dots.every((d) => d.midi === 64)).toBe(true);
    expect(exact.dots.length).toBe(2);
  });

  it('spells derived notes the way the scale does', () => {
    const fSharp = resolveFigure({ kind: 'fretboard', derive: { scale: 'major', tonic: 'F#' }, frets: [0, 4], strings: [1] });
    expect(fSharp.dots.map((d) => d.note)).toContain('E#');
    expect(fSharp.dots.map((d) => d.note)).not.toContain('F');
  });

  it('hand-placed dots win over derived ones at the same place', () => {
    const r = resolveFigure({ kind: 'fretboard', derive: { chord: 'C' }, frets: [0, 3], strings: [5], dots: [{ string: 5, fret: 3, label: 'here', role: 'target' }] });
    expect(r.dots).toHaveLength(1);
    expect(r.dots[0]).toMatchObject({ label: 'here', role: 'target', note: 'C', degree: '1' });
  });
});

describe('chord figures', () => {
  it('looks a symbol up in the library', () => {
    ok({ kind: 'chord', symbol: 'C' });
    const r = resolveFigure({ kind: 'chord', symbol: 'C' })!;
    const lib = chordVoicings('C')[0];
    expect(r.frets).toEqual([...lib.frets]);
    expect(r.fingers).toEqual([...lib.fingers]);
    expect(r.midi).toEqual([...lib.midi]);
    expect(r.symbol).toBe('C');
    expect(r.notes.map((n) => n.note)).toEqual(lib.notes.map((n) => n.note));
    expect(voicingFor('C', undefined)!.id).toBe(lib.id);
  });

  it('checks a given shape against the symbol', () => {
    ok({ kind: 'chord', symbol: 'Em', frets: '022000' });
    ok({ kind: 'chord', symbol: 'G', frets: [3, 2, 0, 0, 0, 3] });
    bad({ kind: 'chord', symbol: 'C', frets: 'x32011' }, /is not C: not in C: F on string 1/);
    bad({ kind: 'chord', symbol: 'Em', frets: '0220' }, /has 4 strings but Standard tuning has 6/);
    bad({ kind: 'chord', symbol: 'Em', frets: 'hello!' }, /cannot be read/);
    bad({ kind: 'chord', symbol: 'Zz' }, /not a chord symbol/);
    bad({ kind: 'chord' }, /neither "symbol" nor "frets"/);
    bad({ kind: 'chord', frets: 'xxxxxx' }, /Every string of the shape is muted/);
    expect(resolveFigure({ kind: 'chord', symbol: 'C', frets: 'x32011' })).toBeNull();
  });

  it('names a bare shape', () => {
    ok({ kind: 'chord', frets: 'x02210' });
    expect(resolveFigure({ kind: 'chord', frets: 'x02210' })!.symbol).toBe('Am');
    expect(resolveFigure({ kind: 'chord', frets: 'x02210' })!.midi).toEqual([45, 52, 57, 60, 64]);
  });
});

describe('staff figures', () => {
  it('places notes as the guitar reads them: an octave above the sound', () => {
    ok({ kind: 'staff', notes: ['E2', 'E3', 'G3', 'F4', 'E4'] });
    const r = resolveFigure({ kind: 'staff', notes: ['E3', { note: 'G3', label: 'open G', duration: 'h' }, 'E2'] });
    expect(r.guitar).toBe(true);
    expect(r.notes.map((n) => n.position)).toEqual([0, 2, -7]);
    expect(r.notes[0].position).toBe(staffPosition('E3').position);
    expect(r.notes[1]).toMatchObject({ label: 'open G', duration: 'h', midi: 55, stem: 'up' });
    expect(r.notes[2].ledgerPositions).toEqual([-2, -4, -6]);
    expect(resolveFigure({ kind: 'staff', notes: ['E4'], guitar: false }).notes[0].position).toBe(0);
  });

  it('draws only the accidentals the key signature does not already give', () => {
    const r = resolveFigure({ kind: 'staff', key: 'G major', notes: ['F#3', 'F3', 'C#4', 'G3', 'Bb3'] });
    expect(r.key).toEqual({ name: 'G major', fifths: 1, accidentals: ['F#'], positions: keySignaturePositions(1) });
    expect(r.notes.map((n) => n.accidental)).toEqual([null, 'natural', 'sharp', null, 'flat']);
    expect(resolveFigure({ kind: 'staff', notes: ['F#3'] }).notes[0].accidental).toBe('sharp');
    expect(shownAccidental('Bb', null)).toBe('flat');
    expect(keyAlteration(null, 'F')).toBe(0);
  });

  it('rejects notes without an octave, out of reach, or malformed', () => {
    bad({ kind: 'staff', notes: ['E'] }, /has no octave/);
    bad({ kind: 'staff', notes: ['H3'] }, /not a note/);
    bad({ kind: 'staff', notes: ['C1'] }, /ledger lines/);
    bad({ kind: 'staff', notes: ['F##3'] }, /double accidental/);
    bad({ kind: 'staff', notes: [{ note: 'E3', duration: 'zz' }] }, /not a duration code/);
    bad({ kind: 'staff', key: 'Q major', notes: ['E3'] }, /not a key/);
    bad({ kind: 'staff', time: 'x', notes: ['E3'] }, /not a time signature/);
    bad({ kind: 'staff', notes: [] }, /staff is empty/);
    ok({ kind: 'staff', key: 'D major', notes: [] });
  });
});

describe('keyboard figures', () => {
  it('resolves keys with pitch and colour, in whole octaves by default', () => {
    ok({ kind: 'keyboard', keys: ['C4', 'E4', 'G4'] });
    const r = resolveFigure({ kind: 'keyboard', keys: ['E4', { note: 'F#4', label: 'F♯ / G♭', role: 'target' }] });
    expect(r.from).toBe(60);
    expect(r.to).toBe(71);
    expect(r.keys).toEqual([
      { midi: 64, note: 'E', label: 'E', role: 'tone', black: false },
      { midi: 66, note: 'F#', label: 'F♯ / G♭', role: 'target', black: true },
    ]);
    expect(resolveFigure({ kind: 'keyboard', keys: ['C4', 'C5'], from: 'C4', to: 'C5' })).toMatchObject({ from: 60, to: 72 });
  });

  it('rejects bad keys and ranges', () => {
    bad({ kind: 'keyboard', keys: ['C'] }, /has no octave/);
    bad({ kind: 'keyboard', keys: ['H4'] }, /not a note/);
    bad({ kind: 'keyboard', keys: [] }, /highlights no keys/);
    bad({ kind: 'keyboard', keys: ['C4'], from: 'C#4' }, /cannot start on the black key/);
    bad({ kind: 'keyboard', keys: ['C4'], from: 'C5', to: 'C6' }, /outside the range/);
    bad({ kind: 'keyboard', keys: ['C2', 'C7'] }, /more than three octaves/);
    bad({ kind: 'keyboard', keys: ['C4'], from: 'C5', to: 'C4' }, /"to" must be higher/);
  });
});

describe('circle figures', () => {
  it('marks the selected key and the highlights on the engine\'s circle', () => {
    ok({ kind: 'circle', key: 'G major', highlight: ['C major', 'D major', 'E minor'] });
    const r = resolveFigure({ kind: 'circle', key: 'G major', highlight: ['C major', 'D major', 'E minor'] })!;
    expect(r.slots).toHaveLength(12);
    expect(r.slots.map((s) => s.major[0])).toEqual(circleOfFifths().map((s) => s.major[0].name));
    expect(r.slots[1]).toMatchObject({ major: ['G major'], minor: ['E minor'], fifths: 1, majorState: 'selected', minorState: 'highlight' });
    expect(r.slots[0].majorState).toBe('highlight');
    expect(r.slots[2].majorState).toBe('highlight');
    expect(r.slots[3].majorState).toBeNull();
    expect(r.key).toEqual({ name: 'G major', mode: 'major', fifths: 1, accidentals: ['F#'] });
    expect(resolveFigure({ kind: 'circle', key: 'F# minor' })!.slots[3].minorState).toBe('selected');
    // Both spellings of an overlapping slot light the same slot.
    expect(resolveFigure({ kind: 'circle', key: 'Gb major' })!.slots[6].majorState).toBe('selected');
  });

  it('rejects unknown and theoretical keys', () => {
    bad({ kind: 'circle', key: 'Q major' }, /not a key/);
    bad({ kind: 'circle', key: 'G# major' }, /more than seven sharps or flats/);
    bad({ kind: 'circle', key: 'C major', highlight: ['nope'] }, /highlighted key "nope" is not a key/);
    expect(resolveFigure({ kind: 'circle', key: 'Q major' })).toBeNull();
  });
});

describe('rhythm, tab and audio figures', () => {
  it('resolves a rhythm with events, counting and onset times', () => {
    ok({ kind: 'rhythm', pattern: 'q e e q q', tempo: 60 });
    const r = resolveFigure({ kind: 'rhythm', pattern: 'q e e q q', tempo: 60 });
    expect(r.events.map((e) => e.count)).toEqual(['1', '2', '&', '3', '4']);
    expect(r.onsetTimes).toEqual([0, 1, 1.5, 2, 3]);
    expect(r.counting).toBe(true);
    expect(resolveFigure({ kind: 'rhythm', pattern: 'q q q q', counting: false })).toMatchObject({ counting: false, onsetTimes: null, tempo: null, time: '4/4' });
    bad({ kind: 'rhythm', pattern: 'q q q' }, /Bar 1 lasts 3/);
    bad({ kind: 'rhythm', pattern: 'q q q q | q q q q | q q q q' }, /has 3 bars/);
    bad({ kind: 'rhythm', pattern: 'q q q q', tempo: 10 }, /Tempo 10/);
  });

  it('resolves a tab phrase with pitches and timing from the neck', () => {
    const figure: Figure = { kind: 'tab', notes: [{ string: 6, fret: 0, duration: 'q' }, { rest: true, duration: 'e' }, { string: 5, fret: 2, duration: 'e' }] };
    ok(figure);
    const r = resolveFigure(figure);
    if (r?.kind !== 'tab') throw new Error('not a tab');
    expect(r.notes).toEqual([
      { rest: false, string: 6, fret: 0, midi: 40, note: 'E2', tick: 0, ticks: 960, duration: 'q', technique: null },
      { rest: true, string: null, fret: null, midi: null, note: null, tick: 960, ticks: 480, duration: 'e', technique: null },
      { rest: false, string: 5, fret: 2, midi: 47, note: 'B2', tick: 1440, ticks: 480, duration: 'e', technique: null },
    ]);
    expect(r.totalTicks).toBe(1920);
    bad({ kind: 'tab', notes: [{ string: 8, fret: 0, duration: 'q' }] }, /string 8/);
    bad({ kind: 'tab', notes: [] }, /no notes/);
  });

  it('resolves an audio figure to a plan, with strum slots for the arrows', () => {
    ok({ kind: 'audio', sound: { kind: 'chord', chord: 'Em' }, label: 'Hear it' });
    const r = resolveFigure({ kind: 'audio', sound: { kind: 'strum', chord: 'Em', pattern: 'D-DU-UDU', repeat: 1 } });
    expect(r.plan.events).toHaveLength(6);
    expect(r.strum).toHaveLength(8);
    expect(resolveFigure({ kind: 'audio', sound: { kind: 'chord', chord: 'Em' } }).strum).toBeNull();
    bad({ kind: 'audio', sound: { kind: 'chord', chord: 'Xx' } }, /not a chord symbol/);
  });

  it('rejects unknown kinds', () => {
    bad({ kind: 'hologram' } as unknown as Figure, /not a figure kind/);
    expect(resolveFigure({ kind: 'hologram' } as unknown as Figure)).toBeNull();
  });
});

describe('helpers', () => {
  it('degreeSemitones agrees with the theory engine for every chromatic degree', async () => {
    const { CHROMATIC_DEGREES, degreeToInterval, semitones } = await import('@/core/theory');
    CHROMATIC_DEGREES.forEach((label) => expect(degreeSemitones(label), label).toBe(semitones(degreeToInterval(label)) % 12));
    expect(degreeSemitones('b5')).toBe(6);
    expect(degreeSemitones('#5')).toBe(8);
    expect(degreeSemitones('bb7')).toBe(9);
    expect(degreeSemitones('9')).toBe(2);
    expect(degreeSemitones('x')).toBeNull();
  });

  it('positionProblem follows the tuning and the capo', () => {
    expect(positionProblem({ string: 6, fret: 22 })).toBeNull();
    expect(positionProblem({ string: 4, fret: 0 }, { tuning: 'ukulele' })).toBeNull();
    expect(positionProblem({ string: 5, fret: 0 }, { tuning: 'ukulele' })).toMatch(/1 to 4/);
    expect(positionProblem({ string: 1, fret: 20 }, { capo: 3 })).toMatch(/0 to 19/);
    expect(parseNote('E4')!.midi).toBe(midiAt({ string: 1, fret: 0 }));
  });
});
