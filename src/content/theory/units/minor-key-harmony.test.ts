/**
 * Unit 24 of the Theory Path, cross-checked against the engines: the chords and numerals of A, D
 * and E minor (natural, harmonic and melodic), the classical numerals, every progression it spells,
 * the relative keys, the chord shapes and the notes it points at on them, and what each listening
 * question plays.
 */
import { describe, expect, it } from 'vitest';
import {
  chordNotes, detectKeyFromChords, diatonicChords, intervalBetween, key, parseChord, progressionToChords, relativeKey, romanToChord,
  romanToClassicalMinor, scaleNotes, semitones,
} from '@/core/theory';
import { identifyFretted } from '@/core/guitar';
import {
  GLOSSARY, findTargets, plainText, type Exercise, type FillBlanksExercise, type Figure, type FretboardFindExercise, type Lesson, type ListenChoiceExercise, type RichText,
  type Step,
} from '@/lessons';
import { THEORY_GLOSSARY } from '../glossary';
import unit from './minor-key-harmony';

const lesson = (id: string): Lesson => {
  const found = unit.lessons.find((l) => l.id === id);
  if (!found) throw new Error(`no lesson ${id}`);
  return found;
};
const exercises = (l: Lesson): Exercise[] => l.steps.filter((s: Step): s is Exercise => !('generate' in s) && s.type !== 'card');
const listens = (l: Lesson): ListenChoiceExercise[] => exercises(l).filter((e): e is ListenChoiceExercise => e.type === 'listen-choice');
const chordsHeard = (e: ListenChoiceExercise): string[] => (e.sound.kind === 'progression' ? e.sound.chords : []);
const answer = (e: ListenChoiceExercise): string => plainText(e.options.find((o) => o.correct)?.text ?? '');
const symbols = (k: string, minor?: 'natural' | 'harmonic' | 'melodic'): string[] => diatonicChords(k, minor ? { minor } : {}).map((c) => c.symbol);
const romans = (k: string): string[] => diatonicChords(k).map((c) => c.roman);
const noteOn = (frets: string, string: number): string => identifyFretted(frets).notes.find((n) => n.string === string)!.note;
/** The chord symbols written in a rich text, in order. */
const chordTags = (t: RichText): string[] => [...(typeof t === 'string' ? t : t.text).matchAll(/\{c:([^}]+)\}/g)].map((m) => m[1]);

/** Every object of the unit that matches `test`, wherever it sits. */
function collect<T>(test: (v: Record<string, unknown>) => boolean): T[] {
  const out: T[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') {
      if (test(value as Record<string, unknown>)) out.push(value as T);
      Object.values(value).forEach(walk);
    }
  };
  walk(unit);
  return out;
}

describe('minor-key-harmony: the chords of a minor key', () => {
  it('stacks minor, diminished, major, minor, minor, major, major in natural minor', () => {
    expect(symbols('A minor')).toEqual(['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G']);
    expect(symbols('E minor')).toEqual(['Em', 'F#dim', 'G', 'Am', 'Bm', 'C', 'D']);
    expect(symbols('D minor')).toEqual(['Dm', 'Edim', 'F', 'Gm', 'Am', 'Bb', 'C']);
    const qualities = symbols('A minor').map((s) => parseChord(s)!.type.id);
    expect(qualities).toEqual(['minor', 'dim', 'major', 'minor', 'minor', 'major', 'major']);
    expect(symbols('A minor')).toEqual(symbols('C major').slice(5).concat(symbols('C major').slice(0, 5)));
  });

  it('writes the numerals the app way, and knows the classical ones', () => {
    expect(romans('A minor')).toEqual(['i', 'ii°', 'bIII', 'iv', 'v', 'bVI', 'bVII']);
    expect(['bIII', 'bVI', 'bVII'].map(romanToClassicalMinor)).toEqual(['III', 'VI', 'VII']);
    expect(progressionToChords('III VI VII', 'A minor', { classical: true })).toEqual(['C', 'F', 'G']);
    // In the app's convention a bare III, VI or VII sits a major 3rd, 6th or 7th above the tonic.
    expect(['III', 'VI', 'VII'].map((r) => parseChord(romanToChord(r, 'A minor'))!.root)).toEqual(['C#', 'F#', 'G#']);
    expect(intervalBetween('A', 'C')).toBe('m3');
    expect(intervalBetween('A', 'F')).toBe('m6');
  });

  it('completes the E minor chords with C (the fill-in)', () => {
    const fill = exercises(lesson('natural-minor-chords')).find((e): e is FillBlanksExercise => e.type === 'fill-blanks')!;
    const shown = chordTags(fill.text);
    const all = [...shown.slice(0, 5), ...fill.blanks.flatMap(chordTags), ...shown.slice(5)];
    expect(all).toEqual(symbols('E minor'));
  });

  it('draws Bdim as x2343x and F as the small barre xx3211', () => {
    expect(identifyFretted('x2343x').symbol).toBe('Bdim');
    expect(identifyFretted('xx3211').symbol).toBe('F');
  });
});

describe('minor-key-harmony: the raised 7th', () => {
  it('makes V major and vii diminished in harmonic minor', () => {
    const fifthAndSeventh = (k: string) => [diatonicChords(k, { minor: 'harmonic' })[4].symbol, diatonicChords(k, { minor: 'harmonic' })[6].symbol];
    expect(fifthAndSeventh('A minor')).toEqual(['E', 'G#dim']);
    expect(fifthAndSeventh('D minor')).toEqual(['A', 'C#dim']);
    expect(fifthAndSeventh('E minor')).toEqual(['B', 'D#dim']);
    expect(chordNotes('G#dim')).toEqual(['G#', 'B', 'D']);
    expect(chordNotes('B')).toEqual(['B', 'D#', 'F#']);
  });

  it('names the leading tones G#, C# and D#, each a half step below the tonic', () => {
    for (const [tonic, lead] of [['A', 'G#'], ['D', 'C#'], ['E', 'D#']]) {
      expect(scaleNotes(tonic, 'harmonic-minor')[6]).toBe(lead);
      expect(semitones(intervalBetween(lead, tonic))).toBe(1);
    }
    // The subtonic of natural minor is a whole step below.
    expect(scaleNotes('A', 'minor')[6]).toBe('G');
    expect(semitones(intervalBetween('G', 'A'))).toBe(2);
  });

  it('finds G# on string 3, fret 1 of E and E7, where Em has the open G', () => {
    expect(identifyFretted('022100').symbol).toBe('E');
    expect(identifyFretted('020100').symbol).toBe('E7');
    expect(identifyFretted('022000').symbol).toBe('Em');
    expect(noteOn('022100', 3)).toBe('G#');
    expect(noteOn('020100', 3)).toBe('G#');
    expect(noteOn('022000', 3)).toBe('G');
  });

  it('plays V-i in the listening question', () => {
    const [q] = listens(lesson('the-major-v'));
    expect(chordsHeard(q)).toEqual(['Am', 'Dm', 'E', 'Am']);
    expect(chordsHeard(q)[2]).toBe(diatonicChords('A minor', { minor: 'harmonic' })[4].symbol);
    expect(answer(q)).toBe('Major V to i');
  });
});

describe('minor-key-harmony: progressions', () => {
  it('spells each loop and cadence in its key', () => {
    expect(progressionToChords('i bVII bVI bVII', 'A minor')).toEqual(['Am', 'G', 'F', 'G']);
    expect(progressionToChords('i bVI bIII bVII', 'A minor')).toEqual(['Am', 'F', 'C', 'G']);
    expect(progressionToChords('i bVI bIII bVII', 'E minor')).toEqual(['Em', 'C', 'G', 'D']);
    expect(progressionToChords('i bVII bVI bVII', 'E minor')).toEqual(['Em', 'D', 'C', 'D']);
    expect(progressionToChords('i iv v', 'A minor')).toEqual(['Am', 'Dm', 'Em']);
    expect(progressionToChords('i iv V', 'A minor')).toEqual(['Am', 'Dm', 'E']);
    expect(progressionToChords('i bVII bVI V', 'A minor')).toEqual(['Am', 'G', 'F', 'E']);
    expect(progressionToChords('i bVII bVI V', 'D minor')).toEqual(['Dm', 'C', 'Bb', 'A']);
    expect(progressionToChords('i bVII bVI V', 'E minor')).toEqual(['Em', 'D', 'C', 'B']);
  });

  it('matches every numeral line with its chords in A minor', () => {
    const matches = collect<{ type: string; pairs: Array<{ left: RichText; right: RichText }> }>((v) => v.type === 'match-pairs');
    let checked = 0;
    for (const m of matches) {
      for (const p of m.pairs) {
        const left = plainText(p.left);
        if (!left.includes('–')) continue;
        expect(progressionToChords(left, 'A minor').join(' '), left).toBe(plainText(p.right));
        checked++;
      }
    }
    expect(checked).toBe(6);
  });

  it('plays the loops and cadences the listening questions name', () => {
    const [loop] = listens(lesson('minor-progressions'));
    expect(chordsHeard(loop)).toEqual(progressionToChords('i bVI bIII bVII', 'A minor'));
    expect(answer(loop)).toBe('i–♭VI–♭III–♭VII');
    const [andalusian] = listens(lesson('the-andalusian-cadence'));
    expect(chordsHeard(andalusian)).toEqual(progressionToChords('i bVII bVI V', 'D minor'));
    expect(answer(andalusian)).toMatch(/^Yes/);
  });

  it('walks the bass down A G F E with Am, G, the full F barre and E', () => {
    const bass = ['x02210', '320003', '133211', '022100'].map((f) => {
      const notes = identifyFretted(f).notes;
      return notes.reduce((low, n) => (n.midi < low.midi ? n : low)).note;
    });
    expect(bass).toEqual(['A', 'G', 'F', 'E']);
    expect(identifyFretted('133211').symbol).toBe('F');
  });

  it('checks the Andalusian fill-in and order questions against the engine', () => {
    const fill = exercises(lesson('the-andalusian-cadence')).find((e): e is FillBlanksExercise => e.type === 'fill-blanks')!;
    const shown = chordTags(fill.text);
    expect([shown[0], ...fill.blanks.flatMap(chordTags), ...shown.slice(1)]).toEqual(progressionToChords('i bVII bVI V', 'E minor'));
    const orders = collect<{ type: string; tiles: RichText[] }>((v) => v.type === 'order' && Array.isArray(v.tiles) && chordTags((v.tiles as RichText[])[0]).length > 0);
    expect(orders.length).toBe(3);
    for (const o of orders) {
      const chords = o.tiles.flatMap(chordTags);
      const tonic = parseChord(chords[0])!.root;
      expect(chords, chords.join(' ')).toEqual(progressionToChords('i bVII bVI V', `${tonic} minor`));
    }
  });
});

describe('minor-key-harmony: relative keys and bright colours', () => {
  it('pairs C major with A minor, which share their signature and chords', () => {
    expect(relativeKey('C major').name).toBe('A minor');
    expect(key('C major').signature.fifths).toBe(key('A minor').signature.fifths);
    expect([...symbols('A minor')].sort()).toEqual([...symbols('C major')].sort());
  });

  it('borrows E7 from A minor: its G# is not in C major', () => {
    expect(chordNotes('E7')).toEqual(['E', 'G#', 'B', 'D']);
    expect(scaleNotes('C', 'major')).not.toContain('G#');
    expect(symbols('C major')).not.toContain('E7');
    expect(romanToChord('V7', 'A minor')).toBe('E7');
    // The fact's ask: B7 pulls G major toward E minor.
    expect(relativeKey('G major').name).toBe('E minor');
    expect(romanToChord('V7', 'E minor')).toBe('B7');
    expect(chordNotes('B7')).toEqual(['B', 'D#', 'F#', 'A']);
  });

  it('hears the chorus at home on C', () => {
    const [q] = listens(lesson('relative-keys-in-songs'));
    expect(detectKeyFromChords(chordsHeard(q))[0].key.name).toBe('C major');
    expect(answer(q)).toBe('At home on C');
  });

  it('raises the 6th to F# for the major IV, and the 3rd to C# for the Picardy third', () => {
    expect(scaleNotes('A', 'melodic-minor')[5]).toBe('F#');
    expect(diatonicChords('A minor', { minor: 'melodic' })[3].symbol).toBe('D');
    expect(diatonicChords('A minor', { minor: 'melodic' })[5].symbol).toBe('F#dim');
    expect(diatonicChords('D minor', { minor: 'melodic' })[5].symbol).toBe('Bdim');
    expect(noteOn('xx0232', 1)).toBe('F#');
    expect(noteOn('xx0231', 1)).toBe('F');
    expect(noteOn('x02220', 2)).toBe('C#');
    expect(noteOn('x02210', 2)).toBe('C');
    const [q] = listens(lesson('minor-key-colours'));
    expect(chordsHeard(q).at(-1)).toBe('A');
    expect(answer(q)).toBe('On a major chord');
  });
});

describe('minor-key-harmony: questions that teach, not give away', () => {
  it('never lists the right answer first in a question that keeps its order', () => {
    // Unshuffled options show as written; an answer that is always first could be picked by
    // position alone. Yes before No is a natural order, with the answer second.
    const fixed = collect<Extract<Exercise, { type: 'choice' }>>((v) => v.type === 'choice' && v.shuffle === false);
    for (const c of fixed) expect(c.options.findIndex((o) => o.correct), plainText(c.prompt)).toBeGreaterThan(0);
  });

  it('links harmonic and melodic minor to terms the glossary defines, as the raised notes say', () => {
    const known = new Set([...GLOSSARY, ...THEORY_GLOSSARY].map((t) => t.id));
    const ids: string[] = [];
    const walk = (v: unknown): void => {
      if (typeof v === 'string') for (const m of v.matchAll(/\{t:([a-z0-9-]+)/g)) ids.push(m[1]);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(unit);
    expect(ids).toEqual(expect.arrayContaining(['harmonic-minor', 'melodic-minor', 'leading-tone', 'subtonic']));
    for (const id of ids) expect(known.has(id), id).toBe(true);
    // The borrowed note of each lesson is the one that scale raises.
    expect(scaleNotes('A', 'harmonic-minor')[6]).toBe('G#');
    expect(scaleNotes('A', 'minor')[6]).toBe('G');
    expect(scaleNotes('A', 'melodic-minor')[5]).toBe('F#');
    expect(scaleNotes('A', 'minor')[5]).toBe('F');
  });
});

describe('minor-key-harmony: the shapes it writes and points at', () => {
  it('draws every chord box as the chord it names', () => {
    const boxes = collect<Extract<Figure, { kind: 'chord' }>>((v) => v.kind === 'chord' && typeof v.frets === 'string');
    expect(boxes.length).toBeGreaterThanOrEqual(6);
    for (const b of boxes) expect(identifyFretted(String(b.frets)).symbol, `${b.symbol} ${String(b.frets)}`).toBe(b.symbol);
  });

  it('names every shape written in the text after its chord', () => {
    const found: Array<[string, string]> = [];
    const walk = (value: unknown): void => {
      if (typeof value === 'string') for (const m of value.matchAll(/\{c:([^}]+)\}\s\(?([x0-9]{6})\)?/g)) found.push([m[1], m[2]]);
      else if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') Object.values(value).forEach(walk);
    };
    walk(unit);
    expect(found.length).toBeGreaterThan(10);
    for (const [symbol, frets] of found) expect(identifyFretted(frets).symbol, `${symbol} ${frets}`).toBe(symbol);
  });

  it('asks every fretboard-find for one place, the one its explanation names', () => {
    const finds = collect<FretboardFindExercise>((v) => v.type === 'fretboard-find');
    expect(finds).toHaveLength(3);
    for (const f of finds) {
      const targets = findTargets(f);
      expect(targets, plainText(f.prompt)).toHaveLength(1);
      expect(plainText(f.explain).toLowerCase()).toContain(`string ${targets[0].string}, fret ${targets[0].fret}`);
    }
  });
});
