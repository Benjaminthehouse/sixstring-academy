/**
 * Unit 21 of the Theory Path, cross-checked against the engines: the minor and major blues scales
 * and their added notes (`getScale`, `scaleNotes`), where those notes sit around box 1
 * (`scalePatterns`, `positionsForPitchClass`), the 12-bar charts in A, E and G and their numerals
 * (`romanToChord`), every chord's notes and every open shape the text writes (`chordNotes`,
 * `buildVoicing`), which notes lie outside the key (`inKey`), the phrases over A7, and what each
 * listening question plays.
 */
import { describe, expect, it } from 'vitest';
import { buildVoicing, chordVoicings, midiAt, noteAt, positionsForPitchClass, scalePatterns } from '@/core/guitar';
import { chordFitsScale, chordNotes, chordTones, getScale, inKey, noteToMidi, pcName, romanToChord, scaleNotes, scalePcs, transpose } from '@/core/theory';
import {
  estimateLessonSeconds, findTargets, formatProblems, plainText, soundPlan, validateCourse,
  type CardStep, type ChoiceExercise, type ChordBuildExercise, type Exercise, type FillBlanksExercise, type FretboardFigure,
  type FretboardFindExercise, type Lesson, type ListenChoiceExercise, type MatchPairsExercise, type OrderExercise,
  type PlayChordExercise, type PlayPhraseExercise, type Step, type TabNote, type TypeAnswerExercise,
} from '@/lessons';
import { assembleTheory } from '../index';
import unit, {
  B3_TO_3, BLUE_LICK, BLUE_NOTES_BOX_1, GRITTY_PHRASE, MAJOR_BLUES_ADDED, MINOR_BLUES_A, QUICK_CHANGE_E, QUICK_CHANGE_NUMERALS,
  SWEET_PHRASE, TWELVE_BAR_A, TWELVE_BAR_NUMERALS,
} from './the-blues';

type Pos = { string: number; fret: number };

const lesson = (id: string): Lesson => {
  const found = unit.lessons.find((l) => l.id === id);
  if (!found) throw new Error(`no lesson ${id}`);
  return found;
};
const cards = (l: Lesson): CardStep[] => l.steps.filter((s: Step): s is CardStep => !('generate' in s) && s.type === 'card');
const exercises = (l: Lesson): Exercise[] => l.steps.filter((s: Step): s is Exercise => !('generate' in s) && s.type !== 'card');
const checkpoint = (): Exercise[] => (unit.checkpoint?.steps ?? []).filter((s): s is Exercise => !('generate' in s));
const asks = (l: Lesson): Exercise[] => (l.facts ?? []).flatMap((f) => (f.ask && !('generate' in f.ask) ? [f.ask as Exercise] : []));
const everyExercise = (): Exercise[] => [...unit.lessons.flatMap((l) => [...exercises(l), ...asks(l)]), ...checkpoint()];
const correctText = (e: ChoiceExercise | ListenChoiceExercise): string => plainText(e.options.find((o) => o.correct)!.text!);
const key = (p: Pos): string => `${p.string}:${p.fret}`;
const played = (notes: TabNote[]): Pos[] => notes.flatMap((n) => ('rest' in n ? [] : [{ string: n.string, fret: n.fret }]));
const pcAt = (p: Pos): number => midiAt(p) % 12;
const chordsIn = (text: unknown): string[] => [...String(text).matchAll(/\{c:([^}]+)\}/g)].map((m) => m[1]);
const romansIn = (text: unknown): string[] => [...String(text).matchAll(/\{r:([^}]+)\}/g)].map((m) => m[1]);
const notesIn = (text: unknown): string[] => [...String(text).matchAll(/\{n:([^}]+)\}/g)].map((m) => m[1]);
/** The chord every bar of a numeral chart stands for in a key. */
const chart = (numerals: string[], tonic: string, seventh = ''): string[] => numerals.map((r) => romanToChord(`${r}${seventh}`, tonic));
const sameSet = (a: Iterable<number>, b: Iterable<number>): boolean => [...new Set(a)].sort().join() === [...new Set(b)].sort().join();

/** This unit alone, as the registry assembles it; prerequisites outside it are theory.test.ts's to check. */
function unitCourse() {
  const course = assembleTheory([unit]).course;
  const ids = new Set(unit.lessons.map((l) => l.id));
  const units = course.units
    .filter((u) => u.id === unit.id)
    .map((u) => ({ ...u, lessons: u.lessons.map((l) => ({ ...l, requires: (l.requires ?? []).filter((r) => ids.has(r)) })) }));
  return { ...course, units };
}

describe('the-blues: the engine accepts the unit on its own', () => {
  it('has no errors and no warnings', () => {
    const problems = validateCourse(unitCourse());
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('starts every fact id with "blues-" and keeps each lesson near its planned minutes', () => {
    for (const l of unit.lessons) {
      for (const f of l.facts ?? []) expect(f.id).toMatch(/^blues-/);
      expect(Math.abs(estimateLessonSeconds(l) / 60 - l.minutes), l.id).toBeLessThanOrEqual(1.5);
    }
  });
});

describe('the-blues: the two blues scales', () => {
  it('minor blues is minor pentatonic plus the b5: 1 b3 4 b5 5 b7; A blues is A C D Eb E G', () => {
    const blues = getScale('minor-blues')!.degrees;
    expect(blues).toEqual(['1', 'b3', '4', 'b5', '5', 'b7']);
    expect(blues.filter((d) => !getScale('minor-pentatonic')!.degrees.includes(d))).toEqual(['b5']);
    expect(scaleNotes('A', 'minor-blues')).toEqual(['A', 'C', 'D', 'Eb', 'E', 'G']);
    expect(notesIn(lesson('the-blues-scale').facts![1].back)).toEqual(scaleNotes('A', 'minor-blues'));
    const added = exercises(lesson('the-blues-scale')).find((e): e is ChoiceExercise => e.type === 'choice')!;
    expect(correctText(added)).toBe('The ♭5');
  });

  it('the blue note of E blues is Bb, of A blues Eb, spelled as flat 5s', () => {
    const typed = everyExercise().filter((e): e is TypeAnswerExercise => e.type === 'type-answer');
    expect(typed.length).toBe(2);
    for (const t of typed) {
      const tonic = /\{n:([A-G])\} blues/.exec(String(t.prompt))![1];
      expect(t.answer.kind === 'note' && t.answer.value).toBe(scaleNotes(tonic, 'minor-blues')[3]);
      expect(t.answer.kind === 'note' && t.answer.spelling).toBe('exact');
      expect(transpose(tonic, 'd5')).toBe(scaleNotes(tonic, 'minor-blues')[3]);
    }
    expect(scaleNotes('E', 'minor-blues')).toEqual(['E', 'G', 'A', 'Bb', 'B', 'D']);
  });

  it('in box 1 the blue notes are string 5 fret 6 and string 3 fret 8, one fret above each D', () => {
    const inBox = positionsForPitchClass('Eb', { minFret: 5, maxFret: 8 }).map(key).sort();
    expect(BLUE_NOTES_BOX_1.map(([s, f]) => `${s}:${f}`).sort()).toEqual(inBox);
    for (const [s, f] of BLUE_NOTES_BOX_1) expect(pcName(noteAt({ string: s, fret: f - 1 }))).toBe('D');
    const find = exercises(lesson('the-blues-scale')).find((e): e is FretboardFindExercise => e.type === 'fretboard-find')!;
    expect(findTargets(find).map(key).sort()).toEqual(inBox);
    // The engine's blues position 1 is box 1 plus exactly those two notes.
    const pos1 = scalePatterns('A', 'minor-blues')[0].notes.map(key).sort();
    const box1 = scalePatterns('A', 'minor-pentatonic')[0].notes.map(key);
    expect(pos1).toEqual([...box1, ...inBox].sort());
    const fig = cards(lesson('the-blues-scale'))[0].figure as FretboardFigure;
    expect(fig.dots!.map(key).sort()).toEqual(pos1);
  });

  it('the lick plays D Eb D on string 3, then the root', () => {
    expect(played(BLUE_LICK).map((p) => pcName(noteAt(p, { context: { tonic: 'A', scale: 'minor-blues' } })))).toEqual(['D', 'Eb', 'D', 'A']);
    expect(played(BLUE_LICK).slice(0, 3).every((p) => p.string === 3)).toBe(true);
    expect(cards(lesson('the-blues-scale'))[1].figure).toMatchObject({ kind: 'tab', notes: BLUE_LICK });
  });

  it('the listening question plays the A blues scale, six notes', () => {
    const q = exercises(lesson('the-blues-scale')).find((e): e is ListenChoiceExercise => e.type === 'listen-choice')!;
    const midi = soundPlan(q.sound).events.flatMap((e) => e.midi);
    expect(midi[0]).toBe(45);
    expect(sameSet(midi.map((m) => m % 12), scalePcs('A', 'minor-blues'))).toBe(true);
    expect(new Set(midi.map((m) => m % 12)).size).toBe(6);
    expect(correctText(q)).toBe('Blues scale');
  });

  it('major blues is major pentatonic plus the b3: 1 2 b3 3 5 6; A major blues is A B C C# E F#', () => {
    const blues = getScale('major-blues')!.degrees;
    expect(blues).toEqual(['1', '2', 'b3', '3', '5', '6']);
    expect(blues.filter((d) => !getScale('major-pentatonic')!.degrees.includes(d))).toEqual(['b3']);
    expect(scaleNotes('A', 'major-blues')).toEqual(['A', 'B', 'C', 'C#', 'E', 'F#']);
    expect(notesIn(lesson('the-major-blues-scale').facts![1].back)).toEqual(scaleNotes('A', 'major-blues'));
    const fills = everyExercise().filter((e): e is FillBlanksExercise => e.type === 'fill-blanks' && /major blues/.test(plainText(e.prompt)));
    expect(fills.length).toBe(2);
    for (const f of fills) {
      let b = 0;
      const filled = [...String(f.text).matchAll(/\{n:([^}]+)\}|___/g)].map((m) => m[1] ?? notesIn(f.blanks[b++])[0]);
      expect(filled).toEqual(scaleNotes('A', 'major-blues'));
      for (const w of f.bank ?? []) expect(scaleNotes('A', 'major-blues')).not.toContain(notesIn(w)[0]);
    }
  });

  it('the major box is the engine box 1 of A major pentatonic, and the added Cs are every C between frets 4 and 8', () => {
    const fig = cards(lesson('the-major-blues-scale'))[0].figure as FretboardFigure;
    const box = scalePatterns('A', 'major-pentatonic')[0];
    expect([box.minFret, box.maxFret]).toEqual([4, 7]);
    expect(key(box.notes[0])).toBe('6:5');
    const cs = positionsForPitchClass('C', { minFret: 4, maxFret: 8 }).map(key).sort();
    expect(MAJOR_BLUES_ADDED.map(([s, f]) => `${s}:${f}`).sort()).toEqual(cs);
    expect(cs).toEqual(expect.arrayContaining(['3:5', '1:8']));
    expect(fig.dots!.map(key).sort()).toEqual([...box.notes.map(key), ...cs].sort());
  });

  it('the b3-to-3 move is C to C# on string 3 (frets 5 and 6), then E on string 2', () => {
    const names = played(B3_TO_3).map((p) => pcName(noteAt(p, { context: { tonic: 'A', scale: 'major-blues' } })));
    expect(names).toEqual(['C', 'C#', 'E']);
    expect(played(B3_TO_3).map(key)).toEqual(['3:5', '3:6', '2:5']);
    const play = exercises(lesson('the-major-blues-scale')).find((e): e is PlayPhraseExercise => e.type === 'play-phrase')!;
    expect(play.notes).toEqual(B3_TO_3);
    expect((play.alternative as OrderExercise).tiles.map((t) => notesIn(t)[0])).toEqual(names);
  });
});

describe('the-blues: the 12-bar form', () => {
  it('the chart in A is I I I I | IV IV I I | V IV I I', () => {
    expect(TWELVE_BAR_NUMERALS).toEqual(['I', 'I', 'I', 'I', 'IV', 'IV', 'I', 'I', 'V', 'IV', 'I', 'I']);
    expect(chart(TWELVE_BAR_NUMERALS, 'A')).toEqual(TWELVE_BAR_A);
    const l = lesson('the-12-bar-form');
    expect(chordsIn(cards(l)[0].body)).toEqual(TWELVE_BAR_A);
    expect(romansIn(cards(l)[1].body).slice(-12)).toEqual(TWELVE_BAR_NUMERALS);
    for (const c of [cards(l)[0], cards(l)[2]]) {
      expect(c.figure?.kind === 'audio' && c.figure.sound.kind === 'progression' && c.figure.sound.chords).toEqual(TWELVE_BAR_A);
    }
  });

  it('bar 10 is IV and bar 9 is V (E in A); the order of bars 5 to 12 is the chart', () => {
    const bar10 = exercises(lesson('the-12-bar-form')).find((e): e is ChoiceExercise => e.type === 'choice')!;
    expect(correctText(bar10)).toBe(TWELVE_BAR_NUMERALS[9]);
    const fill = exercises(lesson('the-12-bar-form')).find((e): e is FillBlanksExercise => e.type === 'fill-blanks')!;
    const filled = [...String(fill.text).matchAll(/\{c:([^}]+)\}|___/g)].map((m) => m[1] ?? chordsIn(fill.blanks[0])[0]);
    expect(filled).toEqual(TWELVE_BAR_A);
    for (const w of fill.bank ?? []) expect(chordsIn(w)[0]).not.toBe(TWELVE_BAR_A[8]);
    const orders = everyExercise().filter((e): e is OrderExercise => e.type === 'order' && /bars 5 to 12/.test(plainText(e.prompt)));
    expect(orders.length).toBe(2);
    for (const o of orders) expect(o.tiles.map((t) => romansIn(t)[0])).toEqual(TWELVE_BAR_NUMERALS.slice(4));
    const play = exercises(lesson('the-12-bar-form')).find((e): e is PlayChordExercise => e.type === 'play-chord')!;
    expect(play.chord).toBe(TWELVE_BAR_A[8]);
    expect(buildVoicing('E', '022100').chord).toBe('E');
  });

  it('the three chords of a blues in A, E and G are I, IV and V of each key', () => {
    const pairs = everyExercise().filter((e): e is MatchPairsExercise => e.type === 'match-pairs' && /three chords of its 12-bar/.test(plainText(e.prompt)));
    expect(pairs.length).toBe(3);
    for (const m of pairs) {
      for (const p of m.pairs) {
        const tonic = notesIn(p.left)[0];
        expect(chordsIn(p.right), tonic).toEqual(['I', 'IV', 'V'].map((r) => romanToChord(r, tonic)));
      }
    }
    expect(['I', 'IV', 'V'].map((r) => romanToChord(r, 'G'))).toEqual(['G', 'C', 'D']);
  });
});

describe('the-blues: dominant seventh chords', () => {
  it('a dominant seventh is 1 3 5 b7: a major triad plus a minor seventh', () => {
    for (const c of ['A7', 'D7', 'E7', 'B7']) {
      expect(chordTones(c).map((t) => t.degree)).toEqual(['1', '3', '5', 'b7']);
      expect(chordNotes(c).slice(0, 3)).toEqual(chordNotes(c.slice(0, -1)));
      expect(transpose(chordNotes(c)[0], 'm7')).toBe(chordNotes(c)[3]);
    }
    expect(chordNotes('A7')).toEqual(['A', 'C#', 'E', 'G']);
    expect(chordNotes('D7')).toEqual(['D', 'F#', 'A', 'C']);
    expect(chordNotes('B7')).toEqual(['B', 'D#', 'F#', 'A']);
    const fill = exercises(lesson('dominant-sevenths')).find((e): e is FillBlanksExercise => e.type === 'fill-blanks')!;
    expect(notesIn(fill.blanks[0])[0]).toBe(chordNotes('D7')[3]);
    for (const w of fill.bank ?? []) expect(chordNotes('D7')).not.toContain(notesIn(w)[0]);
    expect(chordNotes('Dmaj7')[3]).toBe('C#');
  });

  it('every open shape the unit writes is the chord it names, and the first shape in the library', () => {
    const shapes: Array<[string, string]> = [['A7', 'x02020'], ['D7', 'xx0212'], ['E7', '020100'], ['B7', 'x21202'], ['Am7', 'x02010'], ['Dm7', 'xx0211'], ['Em7', '020000'], ['E', '022100']];
    const text = JSON.stringify(unit);
    for (const [chord, frets] of shapes) {
      expect(text, frets).toContain(frets);
      expect(buildVoicing(chord, frets).chord, frets).toBe(chord);
      expect(chordVoicings(chord)[0].frets.map((f) => (f === null ? 'x' : String(f))).join(''), chord).toBe(frets);
    }
    // No other six-character shape hides in the text.
    const written = [...new Set([...text.matchAll(/(?<![\w-])([x0-9]{6})(?![\w-])/g)].map((m) => m[1]).filter((s) => /x|^0/.test(s)))];
    expect(written.sort()).toEqual(shapes.map(([, f]) => f).sort());
    const pairs = everyExercise().filter((e): e is MatchPairsExercise => e.type === 'match-pairs' && /open shape/.test(plainText(e.prompt)));
    for (const m of pairs) for (const p of m.pairs) expect(buildVoicing(chordsIn(p.left)[0], plainText(p.right)).chord).toBe(chordsIn(p.left)[0]);
  });

  it('the flat 7 of each open shape is where the text says', () => {
    const at = (chord: string, frets: string, string: number) => buildVoicing(chord, frets).notes.find((n) => n.string === string)!;
    expect(at('A7', 'x02020', 3)).toMatchObject({ fret: 0, note: 'G', degree: 'b7' });
    expect(at('D7', 'xx0212', 2)).toMatchObject({ fret: 1, note: 'C', degree: 'b7' });
    expect(at('E7', '020100', 4)).toMatchObject({ fret: 0, note: 'D', degree: 'b7' });
    // A to A7 lifts the finger on string 3; E to E7 lifts the one on string 4.
    expect(buildVoicing('A', 'x02220').notes.find((n) => n.string === 3)!.fret).toBe(2);
    expect(buildVoicing('E', '022100').notes.find((n) => n.string === 4)!.fret).toBe(2);
  });

  it('the b7 of I7 and IV7 is outside the major key; the b7 of V7 is inside', () => {
    expect(inKey('G', 'A major')).toBe(false);
    expect(inKey('C', 'A major')).toBe(false);
    expect(inKey('D', 'A major')).toBe(true);
    expect(romanToChord('V7', 'A')).toBe('E7');
  });

  it('the listening question plays A, then A7', () => {
    const q = exercises(lesson('dominant-sevenths')).find((e): e is ListenChoiceExercise => e.type === 'listen-choice')!;
    expect(q.sound).toMatchObject({ kind: 'progression', chords: ['A', 'A7'] });
    expect(correctText(q)).toBe('A7');
    const build = everyExercise().filter((e): e is ChordBuildExercise => e.type === 'chord-build' && e.task === 'fingers');
    for (const b of build) expect(buildVoicing(b.chord, b.task === 'fingers' ? String(b.frets) : '').chord).toBe(b.chord);
  });
});

describe('the-blues: quick change and turnaround', () => {
  it('the chart in E is I7 IV7 I7 I7 | IV7 IV7 I7 I7 | V7 IV7 I7 V7', () => {
    expect(QUICK_CHANGE_NUMERALS).toEqual(['I', 'IV', 'I', 'I', 'IV', 'IV', 'I', 'I', 'V', 'IV', 'I', 'V']);
    expect(chart(QUICK_CHANGE_NUMERALS, 'E', '7')).toEqual(QUICK_CHANGE_E);
    // Only bars 2 and 12 differ from the basic form.
    expect(QUICK_CHANGE_NUMERALS.map((r, i) => (r === TWELVE_BAR_NUMERALS[i] ? '' : `${i + 1}:${r}`)).filter(Boolean)).toEqual(['2:IV', '12:V']);
    const l = lesson('quick-change-and-turnaround');
    expect(chordsIn(cards(l)[0].body)).toEqual(QUICK_CHANGE_E);
    const audio = cards(l)[1].figure;
    expect(audio?.kind === 'audio' && audio.sound.kind === 'progression' && audio.sound.chords).toEqual([...QUICK_CHANGE_E, 'E7']);
  });

  it('the order, fill-in and choices agree with the chart', () => {
    const l = lesson('quick-change-and-turnaround');
    const order = exercises(l).find((e): e is OrderExercise => e.type === 'order')!;
    expect(order.tiles.map((t) => chordsIn(t)[0])).toEqual(QUICK_CHANGE_E.slice(8));
    const fills = everyExercise().filter((e): e is FillBlanksExercise => e.type === 'fill-blanks' && /quick change/.test(plainText(e.prompt)));
    expect(fills.length).toBe(2);
    for (const f of fills) {
      let b = 0;
      const filled = [...String(f.text).matchAll(/\{r:([^}]+)\}|___/g)].map((m) => m[1] ?? romansIn(f.blanks[b++])[0]);
      expect(filled).toEqual(QUICK_CHANGE_NUMERALS);
    }
    const bar = everyExercise().filter((e): e is ChoiceExercise => e.type === 'choice' && /first go to/.test(plainText(e.prompt)));
    for (const q of bar) expect(correctText(q)).toBe(`Bar ${QUICK_CHANGE_NUMERALS.indexOf('IV') + 1}`);
    const turn = everyExercise().filter((e): e is ChoiceExercise => e.type === 'choice' && /chord is in bar 12/.test(plainText(e.prompt)));
    expect(turn.length).toBe(2);
    for (const q of turn) expect(correctText(q)).toBe(QUICK_CHANGE_E[11]);
    const play = exercises(l).find((e): e is PlayChordExercise => e.type === 'play-chord')!;
    expect(play.chord).toBe(QUICK_CHANGE_E[11]);
    // B7's D# is the leading tone of E: a half step below it.
    expect((noteToMidi('E') - noteToMidi('D#') + 12) % 12).toBe(1);
  });
});

describe('the-blues: minor or major pentatonic over a blues', () => {
  const A7 = new Set(chordNotes('A7').map((n) => noteToMidi(n) % 12));

  it('A minor pentatonic brings C, a half step below the C# of A7; A major pentatonic holds the C#', () => {
    expect(scaleNotes('A', 'minor-pentatonic')).toContain('C');
    expect(chordNotes('A7')).toContain('C#');
    expect(chordNotes('A7')).not.toContain('C');
    expect(scaleNotes('A', 'major-pentatonic')).toEqual(['A', 'B', 'C#', 'E', 'F#']);
    // The other notes of minor pentatonic named in the question fit: E and G are in A7.
    expect(chordNotes('A7')).toEqual(expect.arrayContaining(['E', 'G']));
  });

  it('the gritty phrase stays in A minor pentatonic box 1 and ends on C; the sweet one stays in A major box 1 and ends on C#', () => {
    const minorBox = new Set(scalePatterns('A', 'minor-pentatonic')[0].notes.map(key));
    const majorBox = new Set(scalePatterns('A', 'major-pentatonic')[0].notes.map(key));
    for (const p of played(GRITTY_PHRASE)) expect(minorBox.has(key(p)), key(p)).toBe(true);
    for (const p of played(SWEET_PHRASE)) expect(majorBox.has(key(p)), key(p)).toBe(true);
    const last = (notes: TabNote[]) => played(notes)[played(notes).length - 1];
    expect(pcAt(last(GRITTY_PHRASE))).toBe(noteToMidi('C') % 12);
    expect(pcAt(last(SWEET_PHRASE))).toBe(noteToMidi('C#') % 12);
    expect(A7.has(pcAt(last(SWEET_PHRASE)))).toBe(true);
    expect(A7.has(pcAt(last(GRITTY_PHRASE)))).toBe(false);
  });

  it('each listening question picks the A7 shape x02020, then its phrase', () => {
    const qs = exercises(lesson('which-pentatonic-over-a-blues')).filter((e): e is ListenChoiceExercise => e.type === 'listen-choice');
    expect(qs.length).toBe(2);
    const arpeggio = buildVoicing('A7', 'x02020').midi;
    for (const [q, phrase, answer] of [[qs[0], GRITTY_PHRASE, 'Minor pentatonic'], [qs[1], SWEET_PHRASE, 'Major pentatonic']] as const) {
      const midi = soundPlan(q.sound).events.flatMap((e) => e.midi);
      expect(midi.slice(0, 5)).toEqual(arpeggio);
      expect(midi.slice(5)).toEqual(played(phrase).map((p) => midiAt(p)));
      expect(correctText(q)).toBe(answer);
    }
    const play = exercises(lesson('which-pentatonic-over-a-blues')).find((e): e is PlayPhraseExercise => e.type === 'play-phrase')!;
    expect(play.notes).toEqual([...GRITTY_PHRASE, ...SWEET_PHRASE]);
    const alt = play.alternative as ChoiceExercise;
    expect(notesIn(alt.options.find((o) => o.correct)!.text)).toEqual([chordNotes('A7')[1]]);
  });
});

describe('the-blues: the minor blues', () => {
  it('is the 12-bar with minor chords on i and iv: Am7, Dm7 and E7 in A', () => {
    const minor: Record<string, string> = { I: 'Am7', IV: 'Dm7', V: 'E7' };
    expect(MINOR_BLUES_A).toEqual(TWELVE_BAR_NUMERALS.map((r) => minor[r]));
    expect(['i7', 'iv7'].map((r) => romanToChord(r, 'A minor'))).toEqual(['Am7', 'Dm7']);
    expect(chordsIn(cards(lesson('the-minor-blues'))[0].body).slice(-12)).toEqual(MINOR_BLUES_A);
    expect(chordNotes('Am7')).toEqual(['A', 'C', 'E', 'G']);
    expect(chordNotes('Dm7')).toEqual(['D', 'F', 'A', 'C']);
  });

  it('its E7 comes from harmonic minor, and its G# leads up to A', () => {
    expect(chordFitsScale('E7', scaleNotes('A', 'harmonic-minor'))).toBe(true);
    expect(chordFitsScale('E7', scaleNotes('A', 'minor'))).toBe(false);
    expect(chordNotes('E7')).toContain('G#');
    expect(noteToMidi('A') - noteToMidi('G#')).toBe(1);
  });

  it('the blues scale meets no major third in Am7 or Dm7, unlike A7 and D7', () => {
    for (const c of ['Am7', 'Dm7']) expect(chordNotes(c)).not.toContain('C#');
    expect(chordNotes('Am7')).toContain('C');
    expect(chordNotes('A7')).toContain('C#');
    expect(chordNotes('D7')).toContain('F#');
  });

  it('the fill-in, choices, listening question and play step agree with the chart', () => {
    const fills = everyExercise().filter((e): e is FillBlanksExercise => e.type === 'fill-blanks' && /minor blues/.test(plainText(e.prompt)));
    expect(fills.length).toBe(2);
    for (const f of fills) {
      let b = 0;
      const filled = [...String(f.text).matchAll(/\{c:([^}]+)\}|___/g)].map((m) => m[1] ?? chordsIn(f.blanks[b++])[0]);
      expect(filled).toEqual(MINOR_BLUES_A);
      for (const w of f.bank ?? []) expect(['Dm7', 'Dm']).not.toContain(chordsIn(w)[0]);
    }
    const sets = everyExercise().filter((e): e is ChoiceExercise => e.type === 'choice' && /make a minor blues/.test(plainText(e.prompt)));
    expect(sets.length).toBe(3);
    for (const q of sets) expect(chordsIn(q.options.find((o) => o.correct)!.text)).toEqual(['Am7', 'Dm7', 'E7']);
    const bar9 = exercises(lesson('the-minor-blues')).find((e): e is ChoiceExercise => e.type === 'choice' && /bar 9/.test(plainText(e.prompt)))!;
    expect(correctText(bar9)).toBe(MINOR_BLUES_A[8]);
    const q = exercises(lesson('the-minor-blues')).find((e): e is ListenChoiceExercise => e.type === 'listen-choice')!;
    expect(q.sound).toMatchObject({ kind: 'progression', chords: MINOR_BLUES_A });
    const play = exercises(lesson('the-minor-blues')).find((e): e is PlayChordExercise => e.type === 'play-chord')!;
    expect(play.chord).toBe(MINOR_BLUES_A[4]);
  });
});

describe('the-blues: on the go (Sound off, Guitar off)', () => {
  const EAR_DRILLS = new Set(['higher-lower', 'interval-ear', 'chord-quality-ear', 'scale-ear', 'cadence-ear', 'rhythm-ear', 'rhythm-tap']);
  const listening = (s: Step): boolean =>
    'generate' in s
      ? EAR_DRILLS.has(String(s.generate))
      : s.type === 'listen-choice' || s.type === 'tap-rhythm' || (s.type !== 'card' && 'figure' in s && s.figure?.kind === 'audio');
  const quiet = (l: Lesson): Step[] =>
    l.steps.flatMap((s): Step[] => {
      if (!('generate' in s) && s.type === 'card') return [];
      const tap = !('generate' in s) && (s.type === 'play-note' || s.type === 'play-chord' || s.type === 'play-phrase') ? s.alternative : s;
      return listening(tap) ? [] : [tap];
    });

  it('every lesson keeps at least four questions, and every play step has a tapping version that needs no sound', () => {
    for (const l of unit.lessons) {
      expect(quiet(l).length, l.id).toBeGreaterThanOrEqual(4);
      for (const s of l.steps) {
        if (!('generate' in s) && (s.type === 'play-note' || s.type === 'play-chord' || s.type === 'play-phrase')) expect(listening(s.alternative), l.id).toBe(false);
      }
    }
    expect((unit.checkpoint?.steps ?? []).every((s) => !listening(s))).toBe(true);
  });
});
