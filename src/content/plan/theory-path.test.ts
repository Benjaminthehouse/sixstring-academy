/**
 * Checks the Theory Path syllabus (theory-path.json): its structure, its prerequisite graph, and
 * the musical claims in it, cross-checked against the theory and guitar engines.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  bestCapo, fretDistance, identifyFretted, parseFrets, scalePattern, scalePositions, tuningFrequencies,
} from '@/core/guitar';
import {
  chordNotes, chordPcs, chroma, diatonicChords, key, modalInterchange, parseChord, parseTimeSignature,
  relativeKey, scaleNotes, secondaryDominants, semitones, staffPosition, SWING, TEMPO_MARKINGS,
  tritoneSubstitute,
} from '@/core/theory';

interface Exercise { type: string; idea: string }
interface Lesson {
  id: string; title: string; teaches: string; prerequisites: string[]; facts: string[];
  onTheGuitar: string; exercises: Exercise[]; generators: string[]; minutes: number;
}
interface Unit { id: string; title: string; summary: string; whyItMatters: string; lessons: Lesson[]; checkpoint: string }
interface Stage { id: string; title: string; units: Unit[] }
interface Course { course: { id: string; title: string; stages: Stage[] } }

const data = JSON.parse(readFileSync(new URL('./theory-path.json', import.meta.url), 'utf8')) as Course;
const stages = data.course.stages;
const units = stages.flatMap((s) => s.units);
const lessons = units.flatMap((u) => u.lessons);
const byId = new Map(lessons.map((l) => [l.id, l]));
const order = new Map(lessons.map((l, i) => [l.id, i]));

/** Exercise types the lesson engine offers (src/lessons/types.ts). */
const EXERCISE_TYPES = new Set([
  'choice', 'true-false', 'match-pairs', 'order', 'fill-blanks', 'type-answer', 'listen-choice', 'tap-rhythm',
  'fretboard-find', 'fretboard-name', 'chord-build', 'staff-read', 'staff-place', 'play-note', 'play-chord',
  'play-phrase', 'flashcard',
]);
/** Generator names registered in src/lessons/generators/params.ts. */
const GENERATORS = new Set([
  'interval-name', 'interval-note', 'semitones-match', 'interval-on-neck', 'note-on-string', 'open-strings', 'step-up',
  'enharmonic', 'scale-notes', 'scale-formula', 'key-signature', 'relative-key', 'degree-in-key', 'fifths-order',
  'chord-tones', 'diatonic-chord', 'roman-chord', 'chord-shape', 'neck-tones', 'note-value-math', 'meter', 'rhythm-tap',
  'rhythm-ear', 'higher-lower', 'interval-ear', 'chord-quality-ear', 'scale-ear', 'cadence-ear', 'staff-note', 'play-note',
]);
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LESSON_KEYS = ['id', 'title', 'teaches', 'prerequisites', 'facts', 'onTheGuitar', 'exercises', 'generators', 'minutes'];

/** Everything a lesson says, for claim lookups. */
const textOf = (l: Lesson): string =>
  [l.title, l.teaches, ...l.facts, l.onTheGuitar, ...l.exercises.map((e) => e.idea)].join('\n');
/** The lesson must contain the snippet: ties each engine check below to the authored text. */
function says(lessonId: string, snippet: string): void {
  const l = byId.get(lessonId);
  expect(l, `lesson ${lessonId}`).toBeDefined();
  expect(textOf(l as Lesson), `${lessonId} should say "${snippet}"`).toContain(snippet);
}
const OPEN = [64, 59, 55, 50, 45, 40]; // sounding MIDI of strings 1..6
const midiAt = (string: number, fret: number): number => OPEN[string - 1] + fret;
const pcSet = (xs: number[]): string => [...new Set(xs.map((m) => ((m % 12) + 12) % 12))].sort((a, b) => a - b).join(',');

describe('theory path: structure', () => {
  it('has the course, three stages in order, and the planned size', () => {
    expect(data.course.id).toBe('theory-path');
    expect(data.course.title.length).toBeGreaterThan(0);
    expect(stages.map((s) => s.id)).toEqual(['beginner', 'intermediate', 'expert']);
    for (const s of stages) expect(s.title.length).toBeGreaterThan(0);
    expect(units.length).toBeGreaterThanOrEqual(35);
    expect(units.length).toBeLessThanOrEqual(45);
    expect(lessons.length).toBeGreaterThanOrEqual(200);
    expect(lessons.length).toBeLessThanOrEqual(280);
  });

  it('gives every unit a unique slug id, its texts and 5 to 8 lessons', () => {
    expect(new Set(units.map((u) => u.id)).size).toBe(units.length);
    for (const u of units) {
      expect(u.id, u.id).toMatch(SLUG);
      for (const k of ['title', 'summary', 'whyItMatters', 'checkpoint'] as const) expect(u[k].trim().length, `${u.id}.${k}`).toBeGreaterThan(0);
      expect(u.lessons.length, u.id).toBeGreaterThanOrEqual(5);
      expect(u.lessons.length, u.id).toBeLessThanOrEqual(8);
    }
  });

  it('gives every lesson a unique unit/slug id and exactly the planned fields', () => {
    expect(new Set(lessons.map((l) => l.id)).size).toBe(lessons.length);
    // The slug alone is unique too, so it can serve as the lesson engine's Lesson.id.
    const slugs = lessons.map((l) => l.id.split('/')[1]);
    expect(slugs.filter((s, i) => slugs.indexOf(s) !== i)).toEqual([]);
    for (const u of units) {
      for (const l of u.lessons) {
        expect(Object.keys(l).sort(), l.id).toEqual([...LESSON_KEYS].sort());
        const [unitId, slug, ...rest] = l.id.split('/');
        expect(unitId, l.id).toBe(u.id);
        expect(rest, l.id).toEqual([]);
        expect(slug, l.id).toMatch(SLUG);
        expect(units.some((x) => x.id === slug), `${l.id}: slug equals a unit id`).toBe(false);
        for (const k of ['title', 'teaches', 'onTheGuitar'] as const) expect(l[k].trim().length, `${l.id}.${k}`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps 2 to 5 distinct facts, at least 3 allowed exercises, known generators and 2 to 5 minutes per lesson', () => {
    for (const l of lessons) {
      expect(l.facts.length, l.id).toBeGreaterThanOrEqual(2);
      expect(l.facts.length, l.id).toBeLessThanOrEqual(5);
      expect(new Set(l.facts).size, l.id).toBe(l.facts.length);
      for (const f of l.facts) expect(f.trim().length, l.id).toBeGreaterThan(10);
      expect(l.exercises.length, l.id).toBeGreaterThanOrEqual(3);
      for (const e of l.exercises) {
        expect(EXERCISE_TYPES.has(e.type), `${l.id}: ${e.type}`).toBe(true);
        expect(e.idea.trim().length, l.id).toBeGreaterThan(10);
      }
      for (const g of l.generators) expect(GENERATORS.has(g), `${l.id}: ${g}`).toBe(true);
      expect(Number.isInteger(l.minutes), l.id).toBe(true);
      expect(l.minutes, l.id).toBeGreaterThanOrEqual(2);
      expect(l.minutes, l.id).toBeLessThanOrEqual(5);
    }
  });

  it('has prerequisites that exist, come earlier, are not repeated and form no cycle', () => {
    lessons.forEach((l, i) => {
      if (i === 0) expect(l.prerequisites).toEqual([]);
      else expect(l.prerequisites.length, `${l.id} has no prerequisite`).toBeGreaterThan(0);
      expect(new Set(l.prerequisites).size, l.id).toBe(l.prerequisites.length);
      for (const p of l.prerequisites) {
        expect(byId.has(p), `${l.id} -> missing ${p}`).toBe(true);
        expect(order.get(p) as number, `${l.id} -> ${p} comes later`).toBeLessThan(i);
      }
    });
    // Belt and braces: depth-first search for a cycle.
    const state = new Map<string, 1 | 2>();
    const visit = (id: string, path: string[]): void => {
      if (state.get(id) === 2) return;
      expect(state.get(id), `cycle: ${[...path, id].join(' -> ')}`).not.toBe(1);
      state.set(id, 1);
      for (const p of byId.get(id)?.prerequisites ?? []) visit(p, [...path, id]);
      state.set(id, 2);
    };
    for (const l of lessons) visit(l.id, []);
  });

  it('contains no placeholders and writes accidentals in ASCII', () => {
    const all = JSON.stringify(data);
    expect(all).not.toMatch(/authors:|TODO|TBD|\.\.\./);
    expect(all).not.toMatch(/[♯♭𝄪𝄫♮]/u);
  });
});

describe('theory path: claims agree with the engines', () => {
  it('spells scales as the engine does', () => {
    const closed: Array<[string, string, string]> = [
      ['major-scale/g-major', 'G', 'major'], ['major-scale/building-major-scales', 'D', 'major'],
      ['major-scale/building-major-scales', 'F', 'major'], ['major-scale/the-step-pattern', 'C', 'major'],
    ];
    for (const [id, tonic, scale] of closed) says(id, [...scaleNotes(tonic, scale), tonic].join(' '));
    const open: Array<[string, string, string]> = [
      ['minor-scales/natural-minor', 'A', 'minor'], ['minor-scales/harmonic-minor', 'A', 'harmonic-minor'],
      ['minor-scales/melodic-minor', 'A', 'melodic-minor'], ['minor-scales/parallel-minor', 'C', 'minor'],
      ['first-scale/a-minor-pentatonic', 'A', 'minor-pentatonic'], ['major-scale/major-pentatonic', 'C', 'major-pentatonic'],
      ['pentatonic-boxes/pentatonic-formulas', 'E', 'minor-pentatonic'], ['the-blues/the-blues-scale', 'A', 'minor-blues'],
      ['the-blues/the-major-blues-scale', 'A', 'major-blues'], ['modes/modes-against-major', 'A', 'mixolydian'],
      ['symmetric-sounds/whole-tone-scale', 'C', 'whole-tone'], ['symmetric-sounds/diminished-scales', 'C', 'diminished-half-whole'],
      ['symmetric-sounds/diminished-scales', 'C', 'diminished-whole-half'], ['scales-beyond/bebop-scales', 'G', 'bebop-dominant'],
      ['scales-beyond/bebop-scales', 'C', 'bebop-major'], ['altered-dominants/seven-alt-and-the-altered-scale', 'G', 'altered'],
      ['scales-beyond/phrygian-dominant', 'E', 'phrygian-dominant'], ['scales-beyond/phrygian-dominant', 'B', 'phrygian-dominant'],
      ['scales-beyond/exotic-scales', 'A', 'hungarian-minor'], ['scales-beyond/exotic-scales', 'E', 'double-harmonic'],
      ['scales-beyond/melodic-minor-modes', 'G', 'lydian-dominant'],
    ];
    for (const [id, tonic, scale] of open) says(id, scaleNotes(tonic, scale).join(' '));
    // Parent-scale and same-notes claims.
    expect(new Set(scaleNotes('G', 'lydian-dominant'))).toEqual(new Set(scaleNotes('D', 'melodic-minor')));
    expect(new Set(scaleNotes('G', 'altered'))).toEqual(new Set(scaleNotes('Ab', 'melodic-minor')));
    expect(new Set(scaleNotes('E', 'altered'))).toEqual(new Set(scaleNotes('F', 'melodic-minor')));
    expect(new Set(scaleNotes('A', 'dorian'))).toEqual(new Set(scaleNotes('G', 'major')));
    expect(new Set(scaleNotes('A', 'minor-pentatonic'))).toEqual(new Set(scaleNotes('C', 'major-pentatonic')));
    expect(new Set(scaleNotes('E', 'phrygian-dominant'))).toEqual(new Set(scaleNotes('A', 'harmonic-minor')));
  });

  it('spells chords as the engine does', () => {
    const cases: Array<[string, string]> = [
      ['triads-and-inversions/four-triads', 'Cdim'], ['triads-and-inversions/four-triads', 'Caug'],
      ['seventh-chords/the-five-formulas', 'Cdim7'], ['altered-dominants/altered-tensions', 'G7b9'],
      ['altered-dominants/altered-tensions', 'G7#9'], ['altered-dominants/tritone-substitution', 'Db7'],
      ['altered-dominants/tritone-substitution', 'G7'], ['extended-chords/ninth-chords', 'C9'],
      ['extended-chords/ninth-chords', 'Cmaj9'], ['extended-chords/ninth-chords', 'Cm9'],
      ['extended-chords/elevenths', 'Am11'], ['extended-chords/elevenths', 'Cmaj7#11'], ['extended-chords/thirteenths', 'C13'],
      ['colour-chords/sus-chords', 'Csus2'], ['colour-chords/sus-chords', 'Csus4'], ['colour-chords/add-chords', 'Cadd9'],
      ['colour-chords/add-chords', 'C9'], ['colour-chords/add-chords', 'Cadd4'], ['colour-chords/sixth-chords', 'C6'],
      ['colour-chords/sixth-chords', 'Am6'], ['jazz-harmony/minor-two-five-one', 'Bm7b5'],
      ['secondary-dominants/secondary-leading-tone-chords', 'F#dim7'], ['secondary-dominants/secondary-leading-tone-chords', 'D7b9'],
      ['altered-dominants/diminished-as-dominant', 'Bdim7'], ['altered-dominants/diminished-as-dominant', 'G7b9'],
      ['major-and-minor-chords/e-and-e-minor', 'E'], ['major-and-minor-chords/e-and-e-minor', 'Em'],
      ['symmetric-sounds/augmented-in-progressions', 'G+'],
    ];
    for (const [id, symbol] of cases) says(id, chordNotes(symbol).join(' '));
    expect(tritoneSubstitute('G7')).toBe('Db7');
    expect(pcSet(chordNotes('C6').map((n) => chroma(n)))).toBe(pcSet(chordNotes('Am7').map((n) => chroma(n))));
    expect(pcSet(chordNotes('Bdim7').map((n) => chroma(n)))).toBe(pcSet(chordNotes('Ddim7').map((n) => chroma(n))));
    expect(pcSet(chordNotes('Eaug').map((n) => chroma(n)))).toBe(pcSet(chordNotes('Caug').map((n) => chroma(n))));
  });

  it('lists the diatonic chords, numerals and borrowed chords as the engine does', () => {
    const list = (k: string, opts?: { sevenths?: boolean }) => diatonicChords(k, opts).map((c) => c.symbol);
    const joinAnd = (xs: string[]) => `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
    says('chords-in-a-key/triads-from-the-scale', joinAnd(list('C')));
    says('chords-in-a-key/the-major-key-pattern', joinAnd(list('G')));
    says('seventh-chords/sevenths-in-a-key', joinAnd(list('C', { sevenths: true })));
    says('seventh-chords/sevenths-in-a-key', diatonicChords('C', { sevenths: true }).map((c) => c.roman).join(' '));
    says('minor-key-harmony/natural-minor-chords', joinAnd(list('A minor')));
    says('minor-key-harmony/natural-minor-chords', diatonicChords('A minor').map((c) => c.roman).join(' '));
    says('chords-in-a-key/roman-numerals', diatonicChords('C').map((c) => c.roman).join(' '));
    const sec = secondaryDominants('C').map((s) => `${s.symbol} (${s.roman})`);
    says('secondary-dominants/the-five-in-c', `${sec.slice(0, -1).join(', ')} and ${sec[sec.length - 1]}`);
    const borrowed = new Set(modalInterchange('C').map((c) => c.symbol));
    for (const c of ['Fm', 'Ab', 'Bb', 'Eb']) expect(borrowed.has(c), c).toBe(true);
    says('modal-harmony-and-borrowing/modal-interchange', 'Fm (iv), Ab (bVI), Bb (bVII) and Eb (bIII)');
  });

  it('counts key signatures and relative keys as the engine does', () => {
    const sharp = ['G', 'D', 'A', 'E', 'B', 'F#', 'C#'].map((t, i) => [t, key(t).signature.count, i + 1]);
    for (const [t, count, n] of sharp) expect(count, String(t)).toBe(n);
    says('circle-of-fifths/sharp-keys', 'G major has 1 sharp, D 2, A 3, E 4, B 5, F# 6 and C# 7');
    const flat = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'].map((t, i) => [t, key(t).signature.count, i + 1]);
    for (const [t, count, n] of flat) expect(count, String(t)).toBe(n);
    says('circle-of-fifths/flat-keys', 'F major has 1 flat, Bb 2, Eb 3, Ab 4, Db 5, Gb 6 and Cb 7');
    expect(key('G').signature.accidentals.concat(key('C#').signature.accidentals.slice(1)).join(' ')).toBe('F# C# G# D# A# E# B#');
    expect(key('Cb').signature.accidentals.join(' ')).toBe('Bb Eb Ab Db Gb Cb Fb');
    for (const [maj, min] of [['C', 'A'], ['G', 'E'], ['F', 'D']]) expect(relativeKey(`${maj} major`).tonic).toBe(min);
    says('minor-scales/relative-minor', 'C major and A minor are relatives; so are G major and E minor, and F major and D minor.');
  });

  it('gives interval sizes, compound intervals and tuning facts that match', () => {
    const sizes: Array<[string, number]> = [['m2', 1], ['M2', 2], ['m3', 3], ['M3', 4], ['P4', 5], ['A4', 6], ['d5', 6], ['P5', 7], ['m6', 8], ['M6', 9], ['m7', 10], ['M7', 11], ['P8', 12], ['M9', 14], ['P11', 17], ['M13', 21]];
    for (const [i, n] of sizes) expect(semitones(i), i).toBe(n);
    says('intervals-2/compound-intervals', 'A major ninth is 14 half steps, a perfect eleventh 17 and a major thirteenth 21.');
    const hz = tuningFrequencies('standard').map((f) => Number(f.toFixed(1)));
    expect(hz).toEqual([82.4, 110, 146.8, 196, 246.9, 329.6]);
    says('tuning-and-physics/frequency-and-concert-pitch', 'about 82.4, 110, 146.8, 196, 246.9 and 329.6 Hz');
    expect(fretDistance(12, 648)).toBeCloseTo(324, 6);
    expect(fretDistance(24, 1)).toBeCloseTo(0.75, 9);
    expect((1 - 2 ** (-1 / 12)) * 100).toBeCloseTo(5.6, 1);
    const cents = (r: number) => 1200 * Math.log2(r);
    expect(Math.round(cents(3 / 2) - 700)).toBe(2);
    expect(Math.round(400 - cents(5 / 4))).toBe(14);
    // Harmonics of the low E: 2x, 3x, 4x the fundamental are E3, B3, E4 (MIDI 52, 59, 64).
    for (const [n, midi] of [[2, 52], [3, 59], [4, 64]]) expect(40 + 12 * Math.log2(n)).toBeCloseTo(midi, 1);
    expect(12 * Math.log2(3 / 2)).toBeCloseTo(7.02, 2); // the 1/3 node sits at fret 7.02
  });

  it('places notes on the neck as stated', () => {
    // Fifth-fret rule (fret 4 on string 3) and the octave shapes.
    for (const s of [6, 5, 4, 2]) expect(midiAt(s, 5)).toBe(OPEN[s - 2]);
    expect(midiAt(3, 4)).toBe(OPEN[1]);
    for (let f = 0; f <= 12; f++) {
      expect(midiAt(4, f + 2)).toBe(midiAt(6, f) + 12);
      expect(midiAt(3, f + 2)).toBe(midiAt(5, f) + 12);
      expect(midiAt(2, f + 3)).toBe(midiAt(4, f) + 12);
      expect(midiAt(1, f + 3)).toBe(midiAt(3, f) + 12);
      expect(midiAt(1, f)).toBe(midiAt(6, f) + 24);
    }
    // Natural notes on strings 6 and 5.
    const naturals = (s: number) => scalePositions('C', 'major', { minFret: 0, maxFret: 12 }).filter((n) => n.string === s).map((n) => `${n.note} (${n.fret})`);
    says('notes-on-the-neck/string-6-naturals', 'E (open), F (1), G (3), A (5), B (7), C (8), D (10) and E (12)');
    expect(naturals(6).slice(1).join(', ')).toBe('F (1), G (3), A (5), B (7), C (8), D (10), E (12)');
    expect(naturals(5).slice(1).join(', ')).toBe('B (2), C (3), D (5), E (7), F (8), G (10), A (12)');
    // The five boxes of A minor pentatonic, as written in the facts.
    const boxes: Record<number, Record<number, number[]>> = {
      1: { 6: [5, 8], 5: [5, 7], 4: [5, 7], 3: [5, 7], 2: [5, 8], 1: [5, 8] },
      2: { 6: [8, 10], 5: [7, 10], 4: [7, 10], 3: [7, 9], 2: [8, 10], 1: [8, 10] },
      3: { 6: [10, 12], 5: [10, 12], 4: [10, 12], 3: [9, 12], 2: [10, 13], 1: [10, 12] },
      4: { 6: [12, 15], 5: [12, 15], 4: [12, 14], 3: [12, 14], 2: [13, 15], 1: [12, 15] },
      5: { 6: [15, 17], 5: [15, 17], 4: [14, 17], 3: [14, 17], 2: [15, 17], 1: [15, 17] },
    };
    for (const [n, want] of Object.entries(boxes)) {
      const p = scalePattern('A', 'minor-pentatonic', 'box', Number(n) - 1); // index 0 is box 1
      expect(p, `box ${n}`).not.toBeNull();
      const got: Record<number, number[]> = {};
      for (const note of p?.notes ?? []) {
        const fret = note.fret < Math.min(...Object.values(want).flat()) ? note.fret + 12 : note.fret;
        (got[note.string] ??= []).push(fret);
      }
      expect(got, `box ${n}`).toEqual(want);
    }
    says('first-scale/the-box-at-fret-5', 'frets 5 and 8 on strings 6, 2 and 1, and frets 5 and 7 on strings 5, 4 and 3');
    says('pentatonic-boxes/box-2', 'string 6 frets 8, 10; string 5 frets 7, 10; string 4 frets 7, 10; string 3 frets 7, 9; string 2 frets 8, 10; string 1 frets 8, 10');
    // C major pentatonic box 1 has the frets of A minor pentatonic box 2.
    const frets = (tonic: string, scale: string, box: number) => scalePattern(tonic, scale, 'box', box - 1)?.notes.map((x) => `${x.string}:${x.fret}`).join(' ');
    expect(frets('C', 'major-pentatonic', 1)).toBe(frets('A', 'minor-pentatonic', 2));
    // Added notes in fifth position, and the fifth-position naturals.
    const at = (tonic: string, scale: string, note: string) => scalePositions(tonic, scale, { minFret: 4, maxFret: 8 }).filter((n) => n.note === note).map((n) => `${n.string}:${n.fret}`).join(' ');
    expect(at('A', 'minor', 'B')).toBe('6:7 3:4 1:7');
    expect(at('A', 'minor', 'F')).toBe('5:8 2:6');
    expect(at('A', 'dorian', 'F#')).toBe('4:4 2:7');
    const fifth: Record<number, number[]> = {};
    for (const n of scalePositions('C', 'major', { minFret: 4, maxFret: 8 })) (fifth[n.string] ??= []).push(n.fret);
    expect(fifth).toEqual({ 6: [5, 7, 8], 5: [5, 7, 8], 4: [5, 7], 3: [4, 5, 7], 2: [5, 6, 8], 1: [5, 7, 8] });
  });

  it('names three-string triad shapes correctly', () => {
    // [lesson, strings low to high, frets, chord, bass]
    const shapes: Array<[string, number[], number[], string, string]> = [
      ['triads-and-inversions/major-triads-strings-3-2-1', [3, 2, 1], [4, 3, 3], 'G', 'B'],
      ['triads-and-inversions/major-triads-strings-3-2-1', [3, 2, 1], [7, 8, 7], 'G', 'D'],
      ['triads-and-inversions/major-triads-strings-3-2-1', [3, 2, 1], [12, 12, 10], 'G', 'G'],
      ['triads-and-inversions/major-triads-strings-3-2-1', [3, 2, 1], [6, 5, 5], 'A', 'C#'],
      ['triads-and-inversions/minor-triads-strings-3-2-1', [3, 2, 1], [3, 3, 3], 'Gm', 'Bb'],
      ['triads-and-inversions/minor-triads-strings-3-2-1', [3, 2, 1], [7, 8, 6], 'Gm', 'D'],
      ['triads-and-inversions/minor-triads-strings-3-2-1', [3, 2, 1], [12, 11, 10], 'Gm', 'G'],
      ['triads-and-inversions/triads-strings-4-3-2', [4, 3, 2], [3, 2, 1], 'F', 'F'],
      ['triads-and-inversions/triads-strings-4-3-2', [4, 3, 2], [7, 5, 6], 'F', 'A'],
      ['triads-and-inversions/triads-strings-4-3-2', [4, 3, 2], [10, 10, 10], 'F', 'C'],
      ['triads-and-inversions/four-triads', [4, 3, 2], [10, 9, 8], 'C', 'C'],
      ['triads-and-inversions/four-triads', [4, 3, 2], [10, 8, 8], 'Cm', 'C'],
      ['triads-and-inversions/four-triads', [4, 3, 2], [10, 8, 7], 'Cdim', 'C'],
      ['triads-and-inversions/four-triads', [4, 3, 2], [10, 9, 9], 'Caug', 'C'],
      ['voice-leading/inversions-for-smoothness', [3, 2, 1], [5, 5, 3], 'C', 'C'],
      ['voice-leading/inversions-for-smoothness', [3, 2, 1], [2, 3, 2], 'D', 'A'],
    ];
    for (const [id, strings, fr, chord, bass] of shapes) {
      const text = textOf(byId.get(id) as Lesson);
      expect(text.includes(fr.join('-')) || text.includes(`frets ${fr.join(', ')}`), `${id} should give ${fr.join('-')}`).toBe(true);
      const midi = strings.map((s, i) => midiAt(s, fr[i]));
      expect(pcSet(midi), `${id} ${fr.join('-')}`).toBe(pcSet(chordPcs(chord)));
      expect(midi[0] % 12, `${id} ${fr.join('-')} bass`).toBe(chroma(bass));
    }
    // C major triads up strings 3-2-1.
    const keyRun: Array<[number[], string]> = [[[5, 5, 3], 'C'], [[7, 6, 5], 'Dm'], [[9, 8, 7], 'Em'], [[10, 10, 8], 'F'], [[12, 12, 10], 'G'], [[14, 13, 12], 'Am']];
    for (const [fr, chord] of keyRun) {
      says('triads-and-inversions/the-key-on-one-string-set', `${chord} ${fr.join('-')}`);
      const midi = [3, 2, 1].map((s, i) => midiAt(s, fr[i]));
      expect(pcSet(midi), chord).toBe(pcSet(chordPcs(chord)));
      expect(midi[0] % 12, chord).toBe(chordPcs(chord)[0]);
    }
  });

  it('names every six-string chord shape in the text correctly', () => {
    // "Name (frets)" or "Name frets": every sounded note must belong to the chord, and the bass must be
    // the slash bass, or the root when there is no slash (except where the text says otherwise).
    const shape = /(?<![A-Za-z#])([A-G][#b]?[A-Za-z0-9#+/]*)\s+\(?((?:[x0-9]{6})|(?:[x0-9]{1,2}(?:-[x0-9]{1,2}){5}))(?![x0-9-])/g;
    const otherBass = new Set(['G7 x5546x']);
    let checked = 0;
    for (const l of lessons) {
      for (const m of textOf(l).matchAll(shape)) {
        const [, symbol, fretText] = m;
        const named = parseChord(symbol);
        if (!named) continue;
        const frets = parseFrets(fretText);
        const midi = frets.flatMap((f, i) => (f === null ? [] : [OPEN[5 - i] + f]));
        expect(midi.length, `${l.id}: ${symbol} ${fretText}`).toBeGreaterThan(1);
        const allowed = new Set(chordPcs(named));
        for (const n of midi) expect(allowed.has(n % 12), `${l.id}: ${symbol} ${fretText} has an outside note`).toBe(true);
        if (!otherBass.has(`${symbol} ${fretText}`)) {
          const bass = named.bass ?? named.root;
          expect(Math.min(...midi) % 12, `${l.id}: ${symbol} ${fretText} bass`).toBe(chroma(bass));
        }
        // The shape must sound the chord's quality: identifyFretted finds the named chord (or its enharmonic twin).
        const found = identifyFretted(fretText).matches.some((x) => pcSet(chordPcs(x.chord)) === pcSet(chordPcs(named)));
        const third = named.type.degrees.find((d) => d === '3' || d === 'b3' || d === '2' || d === '4');
        if (third && !found) {
          // Rootless or reduced voicings: at least the 3rd (or sus tone) and any 7th must sound.
          const tones = chordNotes(named).map((n) => chroma(n));
          const thirdPc = tones[named.type.degrees.indexOf(third)];
          expect(midi.some((n) => n % 12 === thirdPc), `${l.id}: ${symbol} ${fretText} lacks its 3rd`).toBe(true);
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(120);
  });

  it('writes the open strings and landmark notes on the staff where stated', () => {
    const pos = (n: string) => staffPosition(n).position;
    expect(pos('E2')).toBe(-7); // below the third ledger line
    expect(staffPosition('E2').ledgerLines).toBe(-3);
    expect(pos('A2')).toBe(-4); // on the second ledger line below
    expect(pos('C3')).toBe(-2); // on the first ledger line below
    expect(pos('D3')).toBe(-1); // the space under the staff
    expect(pos('E3')).toBe(0); // the bottom line
    expect(pos('F2')).toBe(-6); // the third ledger line
    expect(pos('G2')).toBe(-5);
    expect(pos('G3')).toBe(2); // the second line
    expect(pos('B3')).toBe(4); // the middle line
    expect(pos('C4')).toBe(5); // the third space
    expect(pos('E4')).toBe(7); // the top space
    expect(pos('F4')).toBe(8); // the top line
    expect(pos('A4')).toBe(10); // the first ledger line above
    expect(pos('C5')).toBe(12); // the second ledger line above
    says('reading-the-staff/ledger-lines', 'Open string 6 (low E) is written just below the third ledger line under the staff.');
    says('reading-the-staff/an-octave-lower', 'played at string 2 fret 1 and sounds C4');
    says('reading-up-the-neck/ledger-lines-above', 'sounds A4: string 1 fret 5');
  });

  it('gets the rhythm, cadence and capo facts right', () => {
    expect(parseTimeSignature('6/8')?.beats).toBe(2);
    expect(parseTimeSignature('9/8')?.beats).toBe(3);
    expect(parseTimeSignature('12/8')?.beats).toBe(4);
    expect(parseTimeSignature('6/8')?.kind).toBe('compound');
    expect(parseTimeSignature('7/8')?.kind).toBe('odd');
    expect(SWING.triplet).toBeCloseTo(2 / 3, 6);
    const andante = TEMPO_MARKINGS.find((t) => t.name === 'Andante');
    expect([andante?.min, andante?.max]).toEqual([76, 108]);
    says('triplets-swing-syncopation/tempo-words', 'about 76 to 108 BPM');
    // 3 against 2 in six steps: twos on 0 and 3, threes on 0, 2 and 4, so counts 1 3 4 5.
    const hits = [...new Set([0, 3, 0, 2, 4])].sort().map((x) => x + 1);
    expect(hits).toEqual([1, 3, 4, 5]);
    const capo = bestCapo(['Bb', 'Eb', 'F', 'Gm']);
    expect(capo?.capo).toBe(3);
    expect(capo?.shapes.map((s) => s.shape)).toEqual(['G', 'C', 'D', 'Em']);
    says('capo-and-transposition/capo-arithmetic', 'G, C, D and Em shapes and the capo at fret 3');
  });
});
