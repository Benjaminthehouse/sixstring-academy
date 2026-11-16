/**
 * Review checks: shapes checked by hand, string by string (standard tuning, low E first), and the
 * bugs the review found in labels, notes, formulas, hints and "Where it is used".
 */
import { describe, expect, it } from 'vitest';
import { formatFrets } from '@/core/guitar';
import { chordUsage, keysOf } from './usage';
import { strumHint } from './hints';
import { displayDegree } from './symbols';
import { defaultVoicing, shapeNote, voicingLabel, voicingSet } from './voicings';

/** Every shape below was checked note by note against the fretboard and for a playable fingering. */
const HAND_CHECKED: Array<{ chord: string; frets: string; fingers: string; notes: string }> = [
  { chord: 'Em', frets: '022000', fingers: '023000', notes: 'E B E G B E' },
  { chord: 'G', frets: '320003', fingers: '210003', notes: 'G B D G B G' },
  { chord: 'C', frets: 'x32010', fingers: '-32010', notes: 'C E G C E' },
  { chord: 'F', frets: 'xx3211', fingers: '--3211', notes: 'F A C F' },
  { chord: 'Dm7', frets: 'xx0211', fingers: '--0211', notes: 'D A C F' },
  { chord: 'B7', frets: 'x21202', fingers: '-21304', notes: 'B D# A B F#' },
  { chord: 'C7', frets: 'x32310', fingers: '-32410', notes: 'C E Bb C E' },
  { chord: 'Bm', frets: 'x24432', fingers: '-13421', notes: 'B F# B D F#' },
  { chord: 'F#m', frets: '244222', fingers: '134111', notes: 'F# C# F# A C# F#' },
  { chord: 'Bb', frets: 'x13331', fingers: '-12341', notes: 'Bb F Bb D F' },
  { chord: 'Cm', frets: 'x35543', fingers: '-13421', notes: 'C G C Eb G' },
  { chord: 'Cdim7', frets: 'x3424x', fingers: '-2314-', notes: 'C Gb Bbb Eb' },
  { chord: 'F#m7b5', frets: 'xx4555', fingers: '--1234', notes: 'F# C E A' },
  { chord: 'Bbmaj7', frets: 'x13231', fingers: '-13241', notes: 'Bb F A D F' },
  { chord: 'C13b9', frets: 'x32325', fingers: '-21314', notes: 'C E Bb Db A' },
  { chord: 'Ebm9', frets: 'x6466x', fingers: '-2134-', notes: 'Eb Gb Db F' },
  { chord: 'D/F#', frets: '200232', fingers: '100243', notes: 'F# A D A D F#' },
];

describe('hand-checked shapes', () => {
  for (const h of HAND_CHECKED) {
    it(`${h.chord} opens on ${h.frets}`, () => {
      const v = defaultVoicing(h.chord)!;
      expect(formatFrets(v.frets).toLowerCase()).toBe(h.frets);
      expect(v.fingers.map((f) => (f === null ? '-' : String(f))).join('')).toBe(h.fingers);
      expect(v.notes.map((n) => n.note).join(' ')).toBe(h.notes);
    });
  }
  it('names the fret the root is really on in shell and jazz labels', () => {
    const e7 = voicingSet('E7').all.find((v) => formatFrets(v.frets) === 'x767xx')!;
    expect(voicingLabel(e7)).toBe('Shell voicing, root on string 5, fret 7');
    const c13 = defaultVoicing('C13b9')!;
    expect(voicingLabel(c13)).toBe('Jazz voicing, root on string 5, fret 3');
    // Every such label names the fret of an actual root note.
    for (const symbol of ['D7', 'G7', 'Cmaj7', 'Bbmaj7', 'Am7', 'Ebm9', 'Abmaj7#11']) {
      for (const v of voicingSet(symbol).all) {
        const m = /root on string (\d), fret (\d+)/.exec(voicingLabel(v));
        if (!m) continue;
        const note = v.notes.find((n) => n.string === Number(m[1]))!;
        expect(note.fret, `${symbol} ${voicingLabel(v)}`).toBe(Number(m[2]));
        expect(note.note, `${symbol} ${voicingLabel(v)}`).toBe(v.root);
      }
    }
  });
});

describe('what a shape leaves out is said of that shape', () => {
  it('the open C7 has no fifth; its barre shapes do', () => {
    const set = voicingSet('C7');
    expect(set.note).toBeNull();
    expect(shapeNote(defaultVoicing('C7')!)).toMatch(/leaves out the fifth/);
    const barre = set.all.find((v) => formatFrets(v.frets) === 'x35353')!;
    expect(shapeNote(barre)).toBeNull();
  });
  it('names other degrees in words', () => {
    expect(shapeNote({ omitted: ['9'] })).toMatch(/leaves out the ninth\./);
    expect(shapeNote({ omitted: ['5', 'b9'] })).toMatch(/the fifth and the flat ninth/);
  });
});

describe('formula display', () => {
  it('writes a double flat as one sign, not ♭b', () => {
    expect(displayDegree('bb7')).toBe('𝄫7');
    expect(displayDegree('b5')).toBe('♭5');
    expect(displayDegree('#11')).toBe('♯11');
    expect(displayDegree('13')).toBe('13');
  });
});

describe('hints', () => {
  it('says "We heard" (not "We also heard") when nothing was missing', () => {
    const g = defaultVoicing('G')!;
    const hint = strumHint(g, { missing: [], extra: [6] }, (n) => n);
    expect(hint.text.startsWith('We heard an F#')).toBe(true);
    const both = strumHint(g, { missing: [11], extra: [6] }, (n) => n);
    expect(both.text).toMatch(/We also heard an F#/);
  });
});

describe('where it is used', () => {
  it('never gives an example in a key with seven sharps or flats', () => {
    for (const s of ['Cdim7', 'Cdim', 'F#', 'C#', 'Cb', 'Gb', 'Ebm', 'G#m']) {
      for (const ex of chordUsage(s).examples) expect(['Cb major', 'C# major', 'Ab minor', 'A# minor'], `${s}: ${ex.key}`).not.toContain(ex.key);
      for (const k of keysOf(s)) expect(['Cb major', 'C# major', 'Ab minor', 'A# minor'], `${s}: ${k.key}`).not.toContain(k.key);
    }
  });
  it('labels diminished passing chords by their own type', () => {
    const dim7 = chordUsage('Cdim7').examples;
    expect(dim7.map((e) => `${e.romans} in ${e.key}: ${e.chords.join(' ')}`)).toEqual(['I–♭iii°7–ii in A major: A Cdim7 Bm']);
    const triad = chordUsage('C#dim').examples.map((e) => e.romans);
    expect(triad).toContain('I–♯i°–ii');
    expect(triad).toContain('vii°–i');
    expect(chordUsage('C#dim7').examples.map((e) => e.romans)).toContain('vii°7–i');
  });
});
