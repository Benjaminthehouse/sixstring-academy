/**
 * Unit 27 of the Theory Path, cross-checked against the engines: every chord shape written next to
 * a chord name or drawn as a figure, every spelling the text quotes, the bass notes and inversions
 * of the slash chords, the falling and rising bass lines, the pedal figures, what each listening
 * question plays, and that every lesson still teaches with the guitar or the sound off.
 */
import { describe, expect, it } from 'vitest';
import { chordNotes, chordPcs, identifyChord, intervalBetween, parseChord } from '@/core/theory';
import { buildVoicing, chordVoicings, midiAt, tryBuildVoicing } from '@/core/guitar';
import {
  formatProblems, isGenerated, plainText, soundPlan, tokenize, validateCourse,
  type ChordBuildExercise, type ChoiceExercise, type Exercise, type FillBlanksExercise, type Lesson, type ListenChoiceExercise,
  type MatchPairsExercise, type PlayChordExercise, type RichText, type Sound, type Step, type TypeAnswerExercise,
} from '@/lessons';
import { adaptUnit, isListeningStep, MIN_QUIET_EXERCISES } from '@/features/learn/model/conditions';
import { THEORY_GLOSSARY } from '../glossary';
import unit from './colour-chords';

const lesson = (id: string): Lesson => {
  const found = unit.lessons.find((l) => l.id === id);
  if (!found) throw new Error(`no lesson ${id}`);
  return found;
};
const exercises = (steps: readonly unknown[]): Exercise[] =>
  (steps as Step[]).filter((s): s is Exercise => !!s && typeof s === 'object' && !isGenerated(s) && s.type !== 'card');
/** Every literal exercise: lesson steps, play alternatives, fact asks and the checkpoint. */
const allExercises = (): Exercise[] => {
  const top = [
    ...unit.lessons.flatMap((l) => [...exercises(l.steps), ...exercises((l.facts ?? []).map((f) => f.ask))]),
    ...exercises(unit.checkpoint?.steps ?? []),
  ];
  return [...top, ...exercises(top.flatMap((e) => ('alternative' in e ? [e.alternative] : [])))];
};
const ofType = <T extends Exercise>(type: T['type']): T[] => allExercises().filter((e): e is T => e.type === type);
const correctText = (e: { options: Array<{ text?: RichText; correct?: boolean }> }): string => plainText(e.options.find((o) => o.correct)?.text ?? '');
const listens = (l: Lesson): ListenChoiceExercise[] => exercises(l.steps).filter((e): e is ListenChoiceExercise => e.type === 'listen-choice');

/** Every string in a value (texts, captions, options, facts), with the {text, say} form unwrapped. */
function texts(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) texts(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) texts(v, out);
  return out;
}

/** Every object of the unit with this `kind` (figures, sounds). */
function kinds<T>(kind: string, value: unknown = unit, out: T[] = []): T[] {
  if (Array.isArray(value)) for (const v of value) kinds(kind, v, out);
  else if (value && typeof value === 'object') {
    if ((value as { kind?: unknown }).kind === kind) out.push(value as T);
    for (const v of Object.values(value)) kinds(kind, v, out);
  }
  return out;
}

/** The values of the tags of one kind in a text: `{c:Am7}` -> 'Am7'. */
function tagged(text: RichText, type: 'chord' | 'note' | 'degree' | 'roman' | 'key'): string[] {
  return tokenize(text).flatMap((t) => (t.type === type && 'value' in t ? [String(t.value)] : []));
}
const sortedPcs = (pcs: Iterable<number>): number[] => [...new Set([...pcs].map((p) => ((p % 12) + 12) % 12))].sort((a, b) => a - b);
/** The lowest MIDI note of each strum or pluck of a sound. */
const basses = (sound: Sound): number[] => soundPlan(sound).events.map((ev) => Math.min(...ev.midi));
const pcOf = (note: string): number => chordPcs(note)[0];

describe('colour-chords: the unit on its own', () => {
  it('is valid for the lesson engine, with no warnings', () => {
    const problems = validateCourse({ id: 'theory-path', title: 'Theory Path', teacher: 'none', level: 'intermediate', units: [unit], glossary: [...THEORY_GLOSSARY] });
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('starts every fact id with the unit word', () => {
    for (const l of unit.lessons) for (const f of l.facts ?? []) expect(f.id).toMatch(/^colour-/);
  });
});

describe('colour-chords: every shape', () => {
  // "{c:Asus4} (x02230)", "{c:Am7} (x02010)", "{c:F} (133211)".
  const pairs: Array<[string, string]> = [];
  for (const text of texts(unit)) for (const m of text.matchAll(/\{c:([^}]+)\} \(([x0-9]{6})\)/g)) pairs.push([m[1], m[2]]);

  it('sounds exactly the chord written beside it, bass included', () => {
    expect(pairs.length).toBeGreaterThanOrEqual(25);
    for (const [symbol, shape] of pairs) {
      const v = tryBuildVoicing(symbol, shape);
      expect(v, `${symbol} ${shape}`).not.toBeNull();
      expect(v!.chord, `${symbol} ${shape}`).toBe(symbol);
    }
  });

  it('draws every chord figure and builds every chord-build and play-chord shape as the chord it names', () => {
    const figures = kinds<{ symbol?: string; frets: string }>('chord').filter((f): f is { symbol: string; frets: string } => typeof f.symbol === 'string');
    expect(figures.length).toBe(7);
    for (const f of figures) expect(buildVoicing(f.symbol, f.frets).chord, `${f.symbol} ${f.frets}`).toBe(f.symbol);
    const shaped = [...ofType<ChordBuildExercise>('chord-build').filter((e) => e.task === 'fingers'), ...ofType<PlayChordExercise>('play-chord')];
    expect(shaped.length).toBe(10);
    for (const e of shaped) expect(buildVoicing(e.chord, e.frets!).chord, `${e.chord} ${String(e.frets)}`).toBe(e.chord);
  });

  it('changes only the strings the cards say', () => {
    const diff = (a: string, b: string): number[] => [...a].flatMap((c, i) => (c !== b[i] ? [6 - i] : []));
    expect(diff('xx0232', 'xx0233')).toEqual([1]); // D to Dsus4
    expect(diff('xx0232', 'xx0230')).toEqual([1]); // D to Dsus2
    expect(diff('x02220', 'x02230')).toEqual([2]); // A to Asus4
    expect(diff('x02220', 'x02200')).toEqual([2]); // A to Asus2
    expect(diff('x32010', 'x32030')).toEqual([2]); // C to Cadd9: string 2, fret 1 to 3
    expect(diff('x32010', 'x22010')).toEqual([5]); // C to C/B: only the bass
    expect(diff('x02210', '3x2210')).toEqual([6, 5]); // Am to Am/G: G added, string 5 muted
    expect(diff('x02230', 'x02030')).toEqual([3]); // Asus4 to A7sus4: the open G on string 3
    // The degree each choice on the moving string gives.
    const top = (chord: string, frets: string, string: number): string => buildVoicing(chord, frets).notes.find((x) => x.string === string)!.degree;
    expect([top('Dsus2', 'xx0230', 1), top('D', 'xx0232', 1), top('Dsus4', 'xx0233', 1)]).toEqual(['2', '3', '4']);
    expect([top('Asus2', 'x02200', 2), top('A', 'x02220', 2), top('Asus4', 'x02230', 2)]).toEqual(['2', '3', '4']);
    expect(top('A7sus4', 'x02030', 3)).toBe('b7');
    expect(top('Cadd9', 'x32030', 2)).toBe('9');
    expect(top('Am6', 'x02212', 1)).toBe('6');
    expect(buildVoicing('C6', 'x35555').notes.map((x) => x.note)).toEqual(['C', 'G', 'C', 'E', 'A']);
    expect(buildVoicing('Am7', 'x02010').notes.map((x) => x.note)).toEqual(['A', 'E', 'G', 'C', 'E']);
  });
});

describe('colour-chords: spellings', () => {
  it('spells every "chord is notes" phrase in the text', () => {
    // "{c:Dsus4} is {n:D} {n:G} {n:A}", "{c:Am6} (x02212) is ...", "{c:Am7} (x02010): {n:A} ...".
    let checked = 0;
    for (const text of texts(unit)) {
      for (const m of text.matchAll(/\{c:([^}]+)\}(?: \([x0-9]{6}\))?(?: is|:) ((?:\{n:[^}]+\} ?){3,})/g)) {
        const listed = tagged(m[2], 'note');
        const notes = chordNotes(m[1], { withBass: true });
        // In chord order (a prefix, as in "C E G plus D"), or every note in another order.
        if (listed.join(' ') !== notes.slice(0, listed.length).join(' ')) expect([...listed].sort(), m[0]).toEqual([...notes].sort());
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(20);
  });

  it('quotes the facts of the syllabus', () => {
    expect(chordNotes('Csus2')).toEqual(['C', 'D', 'G']);
    expect(chordNotes('Csus4')).toEqual(['C', 'F', 'G']);
    expect(chordNotes('Gsus4')).toEqual(['G', 'C', 'D']);
    expect(chordNotes('A7sus4')).toEqual(['A', 'D', 'E', 'G']);
    expect(chordNotes('Cadd9')).toEqual(['C', 'E', 'G', 'D']);
    expect(chordNotes('C9')).toEqual(['C', 'E', 'G', 'Bb', 'D']);
    expect(chordNotes('Cadd4')).toEqual(['C', 'E', 'F', 'G']);
    expect(chordNotes('Cadd11')).toEqual(['C', 'E', 'G', 'F']);
    expect(chordNotes('C6')).toEqual(['C', 'E', 'G', 'A']);
    expect(chordNotes('Am6')).toEqual(['A', 'C', 'E', 'F#']);
    expect(chordNotes('C6/9')).toEqual(['C', 'E', 'G', 'A', 'D']);
    expect(chordNotes('G6')).toEqual(['G', 'B', 'D', 'E']);
    expect(chordNotes('D6')).toEqual(['D', 'F#', 'A', 'B']);
    expect(chordNotes('A6')).toEqual(['A', 'C#', 'E', 'F#']);
    expect(chordNotes('Dm6')).toEqual(['D', 'F', 'A', 'B']);
    expect(chordNotes('G6/9')).toEqual(['G', 'B', 'D', 'E', 'A']);
    expect(chordNotes('E7sus4')).toEqual(['E', 'A', 'B', 'D']);
    expect(chordNotes('Esus4')).toEqual(['E', 'A', 'B']);
    expect(chordNotes('G9')).toEqual(['G', 'B', 'D', 'F', 'A']);
    expect(chordNotes('Gadd9')).toEqual(['G', 'B', 'D', 'A']);
    // Major and minor 6ths, and the 9th as the 2nd an octave up.
    expect(intervalBetween('A', 'F#')).toBe('M6');
    expect(intervalBetween('G', 'E')).toBe('M6');
    expect(intervalBetween('D', 'Bb')).toBe('m6');
    expect(intervalBetween('C4', 'D5')).toBe('M9');
  });

  it('answers every typed added note, 6th and bass', () => {
    const typed = ofType<TypeAnswerExercise>('type-answer').filter((e) => e.answer.kind === 'note' && tagged(e.prompt, 'chord').length > 0);
    expect(typed.length).toBe(5);
    for (const e of typed) {
      const c = parseChord(tagged(e.prompt, 'chord')[0])!;
      const want = /bass/.test(plainText(e.prompt)) ? c.bass : c.notes[c.notes.length - 1];
      expect(e.answer.kind === 'note' && e.answer.value, plainText(e.prompt)).toBe(want);
      expect(e.answer.kind === 'note' && e.answer.spelling).toBe('exact');
    }
    // The next step down from G in the bass line.
    const next = ofType<TypeAnswerExercise>('type-answer').find((e) => /keeps falling/.test(plainText(e.prompt)))!;
    expect(next.answer.kind === 'note' && intervalBetween(next.answer.value, 'G')).toBe('M2');
  });

  it('fills every chord blank with the missing chord tone, and banks only notes outside the chord', () => {
    const fills = ofType<FillBlanksExercise>('fill-blanks').filter((e) => /^\{c:[^}]+\} =/.test(String(e.text)));
    expect(fills.length).toBe(6);
    for (const e of fills) {
      const symbol = tagged(e.text, 'chord')[0];
      const filled = [...tagged(e.text, 'note'), ...e.blanks.map((b) => tagged(b, 'note')[0])].sort();
      expect(filled, symbol).toEqual([...chordNotes(symbol)].sort());
      for (const w of e.bank ?? []) expect(chordPcs(symbol), `${symbol} bank ${String(w)}`).not.toContain(pcOf(tagged(w, 'note')[0]));
    }
  });

  it('matches chords with their notes', () => {
    const [e] = ofType<MatchPairsExercise>('match-pairs').filter((x) => /with its notes/.test(plainText(x.prompt)));
    for (const p of e.pairs) expect(tagged(p.right, 'note'), plainText(p.left)).toEqual(chordNotes(tagged(p.left, 'chord')[0]));
  });

  it('gives every chord-spelling choice the right notes, and its "That is" options the chord they name', () => {
    const choices = ofType<ChoiceExercise>('choice').filter((e) => /notes make (it )?up/.test(plainText(e.prompt)));
    expect(choices.length).toBe(4);
    for (const e of choices) {
      const symbol = tagged(e.prompt, 'chord').at(-1)!;
      expect(tagged(e.options.find((o) => o.correct)!.text!, 'note'), symbol).toEqual(chordNotes(symbol));
      for (const o of e.options.filter((x) => !x.correct)) {
        const named = /^That is \{c:([^}]+)\}/.exec(String(o.why ?? ''));
        if (named) expect(tagged(o.text!, 'note'), `${symbol}: ${named[1]}`).toEqual(chordNotes(named[1]));
        expect(sortedPcs(tagged(o.text!, 'note').map(pcOf)), symbol).not.toEqual(sortedPcs(chordPcs(symbol)));
      }
    }
  });

  it('answers the "which has a 7th", "added note" and "same notes" choices', () => {
    const hasSeventh = (s: string): boolean => parseChord(s)!.type.degrees.some((d) => d === 'b7' || d === '7');
    for (const e of ofType<ChoiceExercise>('choice').filter((x) => /has a 7th/.test(plainText(x.prompt)))) {
      for (const o of e.options) expect(hasSeventh(tagged(o.text!, 'chord')[0]), plainText(o.text!)).toBe(!!o.correct);
    }
    const dm6 = ofType<ChoiceExercise>('choice').find((x) => /\{c:Dm6\} add/.test(String(x.prompt)))!;
    expect(correctText(dm6)).toBe(chordNotes('Dm6')[3]);
    for (const e of ofType<ChoiceExercise>('choice').filter((x) => /same four notes/.test(plainText(x.prompt)))) {
      const of = tagged(e.prompt, 'chord')[0];
      for (const o of e.options) expect(sortedPcs(chordPcs(tagged(o.text!, 'chord')[0])).join() === sortedPcs(chordPcs(of)).join(), plainText(o.text!)).toBe(!!o.correct);
    }
    expect(identifyChord(['C', 'E', 'G', 'A'])).toBe('C6');
    expect(identifyChord(['A', 'C', 'E', 'G'])).toBe('Am7');
    expect(identifyChord(['G', 'B', 'D', 'E'])).toBe('G6');
  });

  it('resolves each sus4 to the major chord on its root', () => {
    for (const [sus, home] of [['Dsus4', 'D'], ['Asus4', 'A'], ['Esus4', 'E']]) {
      const four = chordNotes(sus)[1];
      const three = chordNotes(home)[1];
      expect(intervalBetween(three, four), sus).toBe('m2'); // the 4th falls a half step to the 3rd
    }
  });
});

describe('colour-chords: slash chords', () => {
  const isInversion = (symbol: string): boolean => {
    const c = parseChord(symbol)!;
    return c.bass !== null && c.notes.includes(c.bass);
  };

  it('names the bass notes and inversions the lessons say', () => {
    const pairs = ofType<MatchPairsExercise>('match-pairs').filter((e) => /bass note/.test(plainText(e.prompt))).flatMap((e) => e.pairs);
    expect(pairs.length).toBe(4);
    for (const p of pairs) expect(parseChord(tagged(p.left, 'chord')[0])!.bass).toBe(tagged(p.right, 'note')[0]);
    expect(isInversion('D/F#')).toBe(true);
    expect(intervalBetween('D', 'F#')).toBe('M3'); // the 3rd: first inversion
    expect(isInversion('G/B')).toBe(true);
    expect(isInversion('C/E')).toBe(true);
    expect(isInversion('D/A')).toBe(true);
    for (const s of ['D/C', 'C/D', 'C/F', 'C/Bb']) expect(isInversion(s), s).toBe(false);
    // D/C has the notes of D7 with the 7th in the bass; C/B those of Cmaj7.
    expect(sortedPcs(chordPcs('D/C'))).toEqual(sortedPcs(chordPcs('D7')));
    expect(sortedPcs(chordPcs('C/B'))).toEqual(sortedPcs(chordPcs('Cmaj7')));
    expect(intervalBetween('C', 'B')).toBe('M7');
    expect(intervalBetween('D', 'C')).toBe('m7');
  });

  it('offers exactly one right kind in the inversion choices', () => {
    const q = ofType<ChoiceExercise>('choice').filter((e) => /is an inversion\?|bass note from outside/.test(plainText(e.prompt)));
    expect(q.length).toBe(2);
    for (const e of q) {
      const outside = /outside/.test(plainText(e.prompt));
      for (const o of e.options) expect(isInversion(tagged(o.text!, 'chord')[0]), plainText(o.text!)).toBe(o.correct ? !outside : outside);
    }
  });
});

describe('colour-chords: bass lines', () => {
  it('lets the bass fall C B A G F in the audio and on the neck', () => {
    const walk = lesson('walking-bass-with-slash-chords');
    const card = walk.steps[1] as { figure: { sound: Sound } };
    expect(basses(card.figure.sound)).toEqual([48, 47, 45, 43, 41]); // C3 B2 A2 G2 F2
    const dots = (walk.steps[0] as unknown as { figure: { dots: Array<{ string: number; fret: number }> } }).figure.dots;
    expect(dots.map((d) => midiAt(d))).toEqual([48, 47, 45, 43, 41]);
    // The barre F reaches F2; the small F's lowest note is F3, so the line would jump up.
    expect(Math.min(...buildVoicing('F', '133211').midi)).toBe(41);
    expect(Math.min(...buildVoicing('F', 'xx3211').midi)).toBe(53);
    expect(chordVoicings('F')[0].frets).toEqual([1, 3, 3, 2, 1, 1]);
  });

  it('plays the lines the listening questions describe', () => {
    const [falls, rises] = listens(lesson('walking-bass-with-slash-chords'));
    expect(basses(falls.sound)).toEqual([48, 47, 45, 43]);
    expect(correctText(falls)).toMatch(/falls/);
    expect(basses(rises.sound)).toEqual([43, 47, 48, 50]); // G2 B2 C3 D3
    expect(correctText(rises)).toMatch(/rises/);
  });

  it('orders every bass-line question by a bass that falls one step at a time', () => {
    const orders = allExercises().filter((e) => e.type === 'order' && /bass falls/.test(plainText(e.prompt)));
    expect(orders.length).toBe(3);
    for (const e of orders) {
      if (e.type !== 'order') continue;
      const bass = e.tiles.map((t) => {
        const c = parseChord(tagged(t, 'chord')[0])!;
        return c.bass ?? c.root;
      });
      for (let i = 1; i < bass.length; i++) expect(['m2', 'M2'], bass.join(' ')).toContain(intervalBetween(bass[i], bass[i - 1]));
    }
  });
});

describe('colour-chords: pedal points', () => {
  const tabOf = (i: number): Array<{ string: number; fret: number }> =>
    (lesson('pedal-points').steps[i] as unknown as { figure: { notes: Array<{ string: number; fret: number }> } }).figure.notes;

  it('holds the open D under D, Dsus4, D, Dsus2 and the open A under A, Asus4, A, Asus2', () => {
    const DEGREES = ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'];
    const degree = (root: string, midi: number): string => DEGREES[(midi - chordPcs(root)[0] + 120) % 12];
    // The figures a learner reads: the open string, held, then the moving top note (3, 4, 3, 2).
    const split = (notes: Array<{ string: number; fret: number }>): [number, number[]] => [midiAt(notes[0]), notes.slice(1).map((x) => midiAt(x))];
    const [dBass, dTop] = split(tabOf(0));
    expect(dBass).toBe(50);
    expect(dTop.every((m) => m > dBass)).toBe(true);
    expect(dTop.map((m) => degree('D', m))).toEqual(['3', '4', '3', '2']);
    expect(split(tabOf(2))[0]).toBe(50);
    const [aBass, aTop] = split(tabOf(5));
    expect(aBass).toBe(45);
    expect(aTop.map((m) => degree('A', m))).toEqual(['3', '4', '3', '2']);
    // Each top note belongs to the chord the card names.
    ['D', 'Dsus4', 'D', 'Dsus2'].forEach((c, i) => expect(chordPcs(c)).toContain(dTop[i] % 12));
    ['A', 'Asus4', 'A', 'Asus2'].forEach((c, i) => expect(chordPcs(c)).toContain(aTop[i] % 12));
    // The sound plays the full chords, one string at a time, the open D first each time.
    const [held] = listens(lesson('pedal-points'));
    const groups = (held.sound as { notes: Array<{ string: number; fret: number }> }).notes;
    const four: number[][] = [];
    for (let i = 0; i < groups.length; i += 4) four.push(groups.slice(i, i + 4).map((x) => midiAt(x)));
    expect(four.map((g) => g[0])).toEqual([50, 50, 50, 50]);
    expect(four.every((g) => Math.min(...g) === 50)).toBe(true);
    expect(four.map((g) => sortedPcs(g))).toEqual(['D', 'Dsus4', 'D', 'Dsus2'].map((c) => sortedPcs(chordPcs(c))));
    // String 1 goes up to the 4th, then down to the 2nd; Dm (the bank's trap) would take it to the minor 3rd.
    expect(intervalBetween('D', 'G')).toBe('P4');
    expect(intervalBetween('D', 'E')).toBe('M2');
    expect(buildVoicing('Dm', 'xx0231').notes.find((x) => x.string === 1)!.degree).toBe('b3');
  });

  it('plays a held bass, then a moving one', () => {
    const [held, moving] = listens(lesson('pedal-points'));
    const lows = soundPlan(held.sound).events.filter((_e, i) => i % 4 === 0).map((e) => e.midi[0]);
    expect(new Set(lows)).toEqual(new Set([50]));
    expect(correctText(held)).toMatch(/^Held/);
    expect(new Set(basses(moving.sound)).size).toBe(4);
    expect(correctText(moving)).toMatch(/^Moving/);
  });
});

describe('colour-chords: what the other listening questions play', () => {
  it('sus-chords: D to Dsus4 ends on the 4th, so it is suspended', () => {
    const [q] = listens(lesson('sus-chords'));
    const last = soundPlan(q.sound).events.at(-1)!.midi.map((m) => m % 12);
    expect(last).toContain(7); // G
    expect(last).not.toContain(6); // no F#
    expect(correctText(q)).toMatch(/^Suspended/);
  });

  it('sixth-chords: G6, with its 6th', () => {
    const [q] = listens(lesson('sixth-chords'));
    expect(sortedPcs(soundPlan(q.sound).events.flatMap((e) => e.midi))).toEqual(sortedPcs(chordPcs('G6')));
    expect(correctText(q)).toBe('A 6 chord');
  });

  it('slash-chords: D, then D over F sharp', () => {
    const [q] = listens(lesson('slash-chords'));
    const [first, second] = soundPlan(q.sound).events;
    expect(Math.min(...first.midi) % 12).toBe(2); // D
    expect(Math.min(...second.midi) % 12).toBe(6); // F#
    expect(sortedPcs(second.midi)).toEqual(sortedPcs(chordPcs('D')));
    expect(tagged(q.options.find((o) => o.correct)!.text!, 'note')).toEqual(['F#']);
  });

  it('the checkpoint: A, Asus4, A ends resolved', () => {
    const q = exercises(unit.checkpoint!.steps!).find((e): e is ListenChoiceExercise => e.type === 'listen-choice')!;
    expect(sortedPcs(soundPlan(q.sound).events.at(-1)!.midi)).toEqual(sortedPcs(chordPcs('A')));
    expect(correctText(q)).toMatch(/^Resolved/);
  });
});

describe('colour-chords: fair questions', () => {
  it('shuffles every choice: none keeps the right answer in a fixed first place', () => {
    for (const e of ofType<ChoiceExercise>('choice')) expect(e.shuffle, plainText(e.prompt)).not.toBe(false);
  });

  it('shows the open-A figure with its own question, and only strings 5 and 2 in it', () => {
    const q = ofType<ChoiceExercise>('choice').find((e) => /which open string is the pedal/.test(plainText(e.prompt)))!;
    const notes = (q.figure as { kind: string; notes: Array<{ string: number; fret: number }> }).notes;
    expect(q.figure?.kind).toBe('tab');
    expect(midiAt(notes[0])).toBe(45); // the open A
    expect([...new Set(notes.map((x) => x.string))].sort()).toEqual([2, 5]);
    // The other open strings it offers are not the pedal: string 4 is fretted in every A shape.
    for (const shape of ['x02220', 'x02230', 'x02200']) expect(shape[2]).toBe('2');
  });
});

describe('colour-chords: on the go', () => {
  it('still teaches with the sound off and with the guitar away', () => {
    for (const c of [{ guitar: false, sound: true }, { guitar: false, sound: false }, { guitar: true, sound: false }]) {
      const adapted = adaptUnit(unit, c);
      for (const l of adapted.lessons) {
        const asked = l.steps.filter((s) => isGenerated(s) || s.type !== 'card');
        expect(asked.length, `${l.id} ${JSON.stringify(c)}`).toBeGreaterThanOrEqual(MIN_QUIET_EXERCISES + 2);
        expect(asked.some((s) => !isGenerated(s) && s.type.startsWith('play-')), `${l.id}: a play step is left`).toBe(false);
        if (!c.sound) expect(asked.some((s) => isListeningStep(s)), `${l.id}: a listening step is left`).toBe(false);
      }
      expect(adapted.checkpoint?.steps?.length ?? 0, JSON.stringify(c)).toBeGreaterThanOrEqual(12);
    }
  });

  it('asks every listening idea again in a question that needs no sound', () => {
    const quiet = unit.lessons.map((l) => exercises(l.steps).filter((e) => !isListeningStep(e)).flatMap((e) => texts(e)).join(' '));
    const [sus, , sixth, slash, walk, pedal] = quiet;
    expect(sus).toMatch(/neither major nor minor/);
    expect(sixth).toMatch(/6th/);
    expect(slash).toMatch(/bass/);
    expect(walk).toMatch(/falls|falling/);
    expect(pedal).toMatch(/pedal/);
  });
});
