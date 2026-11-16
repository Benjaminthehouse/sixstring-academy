/**
 * Chord formulas, scale formulas, the harmony table and tunings: every row comes from the engines,
 * and samples are checked against hand-written truth.
 */
import { describe, expect, it } from 'vitest';
import { CHORD_TYPES, MAJOR_KEYS, MINOR_KEYS, SCALES, chordNotes, scaleNotes } from '@/core/theory';
import { TUNINGS, tuning } from '@/core/guitar';
import { CHORD_ROOTS, chordGroups } from './chords';
import { harmonyTable } from './harmony';
import { scaleGroups } from './scales';
import { changeSummary, retuneWords, tuningGroups } from './tunings';

describe('chord formulas', () => {
  const groups = chordGroups('C');
  const rows = groups.flatMap((g) => g.rows);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

  it('has every catalog chord type exactly once', () => {
    expect(rows.map((r) => r.id).sort()).toEqual(CHORD_TYPES.filter((t) => !t.custom).map((t) => t.id).sort());
  });

  // Hand-written truth sample.
  it('spells the formulas and notes of common chords on C', () => {
    const show = (id: string) => `${byId[id].symbol}: ${byId[id].degrees.join(' ')} = ${byId[id].notes.join(' ')}`;
    expect(show('major')).toBe('C: 1 3 5 = C E G');
    expect(show('minor')).toBe('Cm: 1 b3 5 = C Eb G');
    expect(show('dim')).toBe('Cdim: 1 b3 b5 = C Eb Gb');
    expect(show('aug')).toBe('Caug: 1 3 #5 = C E G#');
    expect(show('5')).toBe('C5: 1 5 = C G');
    expect(show('sus4')).toBe('Csus4: 1 4 5 = C F G');
    expect(show('7')).toBe('C7: 1 3 5 b7 = C E G Bb');
    expect(show('maj7')).toBe('Cmaj7: 1 3 5 7 = C E G B');
    expect(show('m7')).toBe('Cm7: 1 b3 5 b7 = C Eb G Bb');
    expect(show('m7b5')).toBe('Cm7b5: 1 b3 b5 b7 = C Eb Gb Bb');
    expect(show('dim7')).toBe('Cdim7: 1 b3 b5 bb7 = C Eb Gb Bbb');
    expect(show('6')).toBe('C6: 1 3 5 6 = C E G A');
    expect(show('9')).toBe('C9: 1 3 5 b7 9 = C E G Bb D');
    expect(show('add9')).toBe('Cadd9: 1 3 5 9 = C E G D');
    expect(show('7sharp9')).toBe('C7#9: 1 3 5 b7 #9 = C E G Bb D#');
  });

  it('spells every row on every offered root as the engine does', () => {
    for (const root of CHORD_ROOTS) {
      for (const r of chordGroups(root).flatMap((g) => g.rows)) {
        expect(r.notes).toEqual(chordNotes(r.symbol));
        expect(r.notes[0]).toBe(root);
      }
    }
  });

  it('links each row to its page in Chords', () => {
    expect(byId.maj7.chordPage).toBe('c-maj7');
    expect(byId.major.chordPage).toBe('c-major');
    for (const r of rows) expect(r.chordPage).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('puts the first chords first', () => {
    expect(groups[0].rows.slice(0, 2).map((r) => r.id)).toEqual(['major', 'minor']);
  });
});

describe('scale formulas', () => {
  const groups = scaleGroups(0);
  const rows = groups.flatMap((g) => g.rows);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

  it('has every catalog scale exactly once', () => {
    expect(rows.map((r) => r.id).sort()).toEqual(SCALES.map((s) => s.id).sort());
  });

  // Hand-written truth sample.
  it('matches the formulas, steps and notes of common scales', () => {
    const show = (id: string) => `${byId[id].degrees.join(' ')} | ${byId[id].steps.join(' ')} | ${byId[id].notes.join(' ')}`;
    expect(show('major')).toBe('1 2 3 4 5 6 7 | W W H W W W H | C D E F G A B');
    expect(show('minor')).toBe('1 2 b3 4 5 b6 b7 | W H W W H W W | C D Eb F G Ab Bb');
    expect(show('dorian')).toBe('1 2 b3 4 5 6 b7 | W H W W W H W | C D Eb F G A Bb');
    expect(show('mixolydian')).toBe('1 2 3 4 5 6 b7 | W W H W W H W | C D E F G A Bb');
    expect(show('harmonic-minor').startsWith('1 2 b3 4 5 b6 7 | W H W W H')).toBe(true);
    expect(byId['minor-pentatonic'].notes).toEqual(['C', 'Eb', 'F', 'G', 'Bb']);
    expect(byId['minor-blues'].degrees).toEqual(['1', 'b3', '4', 'b5', '5', 'b7']);
  });

  it('keeps the modes of the major scale in mode order', () => {
    expect(groups[0].rows.slice(0, 7).map((r) => r.id)).toEqual(['major', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'minor', 'locrian']);
  });

  it('spells each scale from its simplest tonic on every root', () => {
    for (let pc = 0; pc < 12; pc++) {
      for (const r of scaleGroups(pc).flatMap((g) => g.rows)) expect(r.notes).toEqual(scaleNotes(r.tonic, r.id));
    }
    // F#/Gb: the major scale picks the spelling with fewer accidentals (a tie goes to the commoner name).
    const gb = scaleGroups(6).flatMap((g) => g.rows).find((r) => r.id === 'major')!;
    expect(['F#', 'Gb']).toContain(gb.tonic);
    expect(scaleGroups(9).flatMap((g) => g.rows).find((r) => r.id === 'dorian')!.scalePage).toEqual(['a', 'dorian']);
  });
});

describe('chords in every key', () => {
  it('lists the 15 major keys with I ii iii IV V vi vii°', () => {
    const t = harmonyTable('major');
    expect(t.rows.map((r) => r.key.name)).toEqual(MAJOR_KEYS.map((k) => k.name));
    expect(t.columns.map((c) => c.roman)).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
    expect(t.columns.map((c) => c.function)).toEqual(['tonic', 'subdominant', 'tonic', 'subdominant', 'dominant', 'tonic', 'dominant']);
    // Hand-written truth.
    const row = (name: string) => t.rows.find((r) => r.key.name === name)!.chords.join(' ');
    expect(row('C major')).toBe('C Dm Em F G Am Bdim');
    expect(row('D major')).toBe('D Em F#m G A Bm C#dim');
    expect(row('Bb major')).toBe('Bb Cm Dm Eb F Gm Adim');
    expect(row('F# major')).toBe('F# G#m A#m B C# D#m E#dim');
  });

  it('lists the 15 minor keys with the harmonic V and vii°', () => {
    const t = harmonyTable('minor');
    expect(t.rows.map((r) => r.key.name)).toEqual(MINOR_KEYS.map((k) => k.name));
    expect(t.columns.map((c) => `${c.roman}${c.harmonic ? '*' : ''}`)).toEqual(['i', 'ii°', 'bIII', 'iv', 'v', 'bVI', 'bVII', 'V*', 'vii°*']);
    const row = (name: string) => t.rows.find((r) => r.key.name === name)!.chords.join(' ');
    expect(row('A minor')).toBe('Am Bdim C Dm Em F G E G#dim');
    expect(row('C minor')).toBe('Cm Ddim Eb Fm Gm Ab Bb G Bdim');
    expect(row('G# minor')).toBe('G#m A#dim B C#m D#m E F# D# F##dim');
  });

  it('every row has a chord in every column', () => {
    for (const mode of ['major', 'minor'] as const) {
      for (const sevenths of [false, true]) {
        const t = harmonyTable(mode, sevenths);
        for (const r of t.rows) expect(r.chords).toHaveLength(t.columns.length);
      }
    }
    expect(harmonyTable('major', true).rows[0].chords).toEqual(['Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'Am7', 'Bm7b5']);
  });
});

describe('tunings', () => {
  const groups = tuningGroups();
  const rows = groups.flatMap((g) => g.rows);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

  it('shows every catalog tuning once', () => {
    expect(rows.map((r) => r.id).sort()).toEqual(TUNINGS.filter((t) => !t.custom).map((t) => t.id).sort());
  });

  it('matches the engine’s notes', () => {
    for (const r of rows) expect(r.notes).toEqual(tuning(r.id).notes);
    expect(byId.standard.notes).toEqual(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
    expect(byId['drop-d'].notes).toEqual(['D2', 'A2', 'D3', 'G3', 'B3', 'E4']);
    expect(byId.dadgad.notes.join(' ')).toBe('D2 A2 D3 G3 A3 D4');
  });

  // Hand-written truth of what to retune from standard.
  it('says which strings to change', () => {
    expect(byId.standard.changes).toEqual([]);
    expect(changeSummary(byId['drop-d'].changes)).toBe('String 6 down a whole step.');
    expect(changeSummary(byId['open-g'].changes)).toBe('Strings 6, 5 and 1 down a whole step.');
    expect(changeSummary(byId.dadgad.changes)).toBe('Strings 6, 2 and 1 down a whole step.');
    expect(changeSummary(byId['half-step-down'].changes)).toBe('Strings 6, 5, 4, 3, 2 and 1 down a half step.');
    expect(changeSummary(byId['open-d'].changes)).toBe('Strings 6, 2 and 1 down a whole step; String 3 down a half step.');
    expect(changeSummary(byId['open-dm'].changes)).toBe('Strings 6, 3, 2 and 1 down a whole step.');
    expect(byId.bass.changes).toEqual([]);
    expect(retuneWords(3)).toBe('up 3 half steps');
    expect(retuneWords(-12)).toBe('down an octave');
  });

  it('groups players’ way', () => {
    expect(groups.map((g) => g.id)).toEqual(['standard', 'drop', 'open', 'other', 'extended', 'bass', 'ukulele']);
    expect(groups.find((g) => g.id === 'drop')!.rows.map((r) => r.id)).toEqual(['drop-d', 'double-drop-d', 'drop-c-sharp', 'drop-c']);
  });
});
