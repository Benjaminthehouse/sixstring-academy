/**
 * Unit 3 of the Theory Path, cross-checked against the engines: the letters and the steps between
 * them, every fret a question accepts, the sharp and flat spellings, the enharmonic pairs, what each
 * listening question plays and the chromatic scale.
 */
import { describe, expect, it } from 'vitest';
import { midiAt, noteAt, openStringMidi } from '@/core/guitar';
import { chroma, enharmonicEqual, getScale, LETTERS, midiToNote, noteToMidi, parseNote, pcName, spellInKey, transposeBySemitones } from '@/core/theory';
import {
  answerText, findTargets, generateExercise, grade, plainText, solve, soundPlan,
  type Exercise, type ExerciseStep, type FretboardFindExercise, type Lesson, type ListenChoiceExercise, type Step,
} from '@/lessons';
import unit from './the-musical-alphabet';

const lesson = (id: string): Lesson => {
  const found = unit.lessons.find((l) => l.id === id);
  if (!found) throw new Error(`no lesson ${id}`);
  return found;
};
const literal = (s: Step | ExerciseStep): s is Exercise => !('generate' in s) && s.type !== 'card';
/** Every literal exercise of a lesson: its steps, the tapping alternatives, the facts' review questions. */
function exercisesOf(l: Lesson): Exercise[] {
  const out: Exercise[] = [];
  const add = (s: Step | ExerciseStep | undefined): void => {
    if (!s || !literal(s)) return;
    out.push(s);
    if ('alternative' in s) add(s.alternative);
  };
  l.steps.forEach(add);
  (l.facts ?? []).forEach((f) => add(f.ask));
  return out;
}
const checkpoint = (): Exercise[] => (unit.checkpoint?.steps ?? []).filter(literal);
const everything = (): Exercise[] => [...unit.lessons.flatMap(exercisesOf), ...checkpoint()];
const of = <K extends Exercise['type']>(list: Exercise[], type: K) => list.filter((e): e is Extract<Exercise, { type: K }> => e.type === type);
const byPrompt = <T extends Exercise>(list: T[], re: RegExp): T => {
  const hit = list.find((e) => 'prompt' in e && re.test(ascii(e.prompt)));
  if (!hit) throw new Error(`no exercise asks ${re}`);
  return hit;
};
/** Text as ASCII (F#, not the displayed F♯), so it can be compared with the engines' names. */
const ascii = (t: unknown): string => plainText((t ?? '') as string, { format: { ascii: true } });
const texts = (list: readonly unknown[]): string[] => list.map(ascii);
const correctTexts = (e: { options: Array<{ text?: unknown; correct?: boolean }> }): string[] => e.options.filter((o) => o.correct).map((o) => ascii(o.text));
const pos = (string: number, fret: number) => ({ string, fret });
const targets = (e: FretboardFindExercise): string[] => findTargets(e).map((p) => `${p.string}:${p.fret}`).sort();
/** Half steps from one note up to the next (pitch classes). */
const up = (a: string, b: string): number => (chroma(b) - chroma(a) + 12) % 12;
const sharpName = (string: number, fret: number): string => noteAt(pos(string, fret), { context: { prefer: 'sharps' }, octave: false });

describe('the-musical-alphabet: the letters', () => {
  it('uses the engine\'s seven letters, in order', () => {
    expect(LETTERS.join('')).toBe('CDEFGAB');
    const fill = of(exercisesOf(lesson('seven-letters')), 'fill-blanks')[0];
    // C D _ F _ A _ : the letters after C, with E, G and B missing.
    expect(texts(fill.blanks)).toEqual(['E', 'G', 'B']);
    const after = byPrompt(of(exercisesOf(lesson('seven-letters')), 'choice'), /after/);
    expect(correctTexts(after)).toEqual([LETTERS[(LETTERS.indexOf('G') + 1) % 7]]);
    const rising = of(exercisesOf(lesson('seven-letters')), 'order')[0];
    expect(texts(rising.tiles)).toEqual(['D', 'E', 'F', 'G']);
  });

  it('walks string 5 through the natural notes at the frets it names', () => {
    const naturals = [0, 2, 3, 5, 7, 8, 10, 12];
    expect(naturals.map((f) => sharpName(5, f)).join(' ')).toBe('A B C D E F G A');
    // Every other fret of 0..12 on string 5 holds a sharp or flat.
    for (let f = 0; f <= 12; f++) expect(naturals.includes(f)).toBe(parseNote(sharpName(5, f))!.alt === 0);
    const phrase = of(lesson('seven-letters').steps.filter(literal), 'play-phrase')[0];
    // The phrase plays the wrap: E F G, then A again at fret 12, an octave above the open string.
    expect(phrase.notes.map((n) => ('fret' in n ? n.fret : -1))).toEqual([7, 8, 10, 12]);
    expect(phrase.notes.map((n) => ('fret' in n ? sharpName(n.string, n.fret) : '')).join(' ')).toBe('E F G A');
    expect(midiAt(pos(5, 12)) - midiAt(pos(5, 0))).toBe(12);
    if (!phrase.alternative || !('tiles' in phrase.alternative)) throw new Error('the walk has an order alternative');
    expect(texts(phrase.alternative.tiles).join(' ')).toBe(naturals.map((f) => sharpName(5, f)).join(' '));
    const octave = byPrompt(of(everything(), 'fretboard-find'), /one octave above the open string/);
    expect(targets(octave)).toEqual(['5:12']);
  });
});

describe('the-musical-alphabet: half and whole steps', () => {
  it('has half steps only between E-F and B-C', () => {
    const halves = LETTERS.filter((l, i) => up(l, LETTERS[(i + 1) % 7]) === 1).map((l, _i) => `${l}${LETTERS[(LETTERS.indexOf(l) + 1) % 7]}`);
    expect(halves).toEqual(['EF', 'BC']);
    for (const pair of ['CD', 'DE', 'FG', 'GA', 'AB']) expect(up(pair[0], pair[1])).toBe(2);
  });

  it('marks exactly the whole-step pairs right, and the half-step pairs', () => {
    for (const e of of(everything(), 'choice')) {
      if (!e.multiple) continue;
      const half = /half step/.test(plainText(e.prompt));
      for (const o of e.options) {
        const [a, b] = ascii(o.text).split(' and ');
        expect(o.correct === true, ascii(o.text)).toBe(half ? up(a, b) === 1 : up(a, b) === 2);
      }
    }
    const single = byPrompt(of(exercisesOf(lesson('e-f-and-b-c')), 'choice'), /only a half step/);
    const [a, b] = correctTexts(single)[0].split(' and ');
    expect(up(a, b)).toBe(1);
  });

  it('accepts the right fret in every tapping question', () => {
    const finds = of(everything(), 'fretboard-find');
    expect(targets(byPrompt(finds, /whole step above it/))).toEqual(['6:5']);
    expect(midiAt(pos(6, 5)) - midiAt(pos(6, 3))).toBe(2);
    expect(targets(byPrompt(finds, /string 6, tap F/))).toEqual(['6:1']);
    expect(targets(byPrompt(finds, /string 5, tap C/))).toEqual(['5:3']);
    expect(targets(byPrompt(finds, /open string is B\. Tap C/))).toEqual(['2:1']);
    expect(targets(byPrompt(finds, /Tap G# on string 6/))).toEqual(['6:4']);
    expect(targets(byPrompt(finds, /Tap F# on string 6/))).toEqual(['6:2']);
    expect(targets(byPrompt(finds, /Tap Bb on string 5/))).toEqual(['5:1']);
    expect(targets(byPrompt(finds, /Tap Ab on string 6/))).toEqual(['6:4']);
    expect(targets(byPrompt(finds, /Tap Db on string 5/))).toEqual(['5:4']);
    expect(targets(byPrompt(finds, /Tap Gb on string 6/))).toEqual(['6:2']);
    expect(targets(byPrompt(finds, /twelve half steps above open string 6/))).toEqual(['6:12']);
    expect(targets(byPrompt(finds, /every note of string 1/))).toEqual(['1:0', '1:1', '1:2', '1:3', '1:4', '1:5']);
  });

  it('plays what the listening questions say', () => {
    const heard = (e: ListenChoiceExercise) => soundPlan(e.sound).events.flatMap((ev) => ev.midi);
    const [steps] = of(lesson('half-and-whole-steps').steps.filter(literal), 'listen-choice');
    const [f, g] = heard(steps);
    expect([f, g]).toEqual([midiAt(pos(1, 1)), midiAt(pos(1, 3))]);
    expect(g - f).toBe(2);
    expect(correctTexts(steps)).toEqual(['A whole step']);
    const [pairs] = of(lesson('e-f-and-b-c').steps.filter(literal), 'listen-choice');
    const [e1, f1, f2, g2] = heard(pairs);
    expect([e1, f1, f2, g2].map((m) => pcName(noteAt(pos(1, m - openStringMidi(1)))))).toEqual(['E', 'F', 'F', 'G']);
    expect(f1 - e1).toBe(1);
    expect(g2 - f2).toBe(2);
    expect(correctTexts(pairs)).toEqual(['The first pair']);
  });

  it('plays a half step then a whole step on string 1, and E F G on string 6', () => {
    const [first] = of(lesson('half-and-whole-steps').steps.filter(literal), 'play-phrase');
    const m = first.notes.map((n) => ('fret' in n ? midiAt(n) : 0));
    expect([m[1] - m[0], m[2] - m[1]]).toEqual([1, 2]);
    const [efg] = of(lesson('e-f-and-b-c').steps.filter(literal), 'play-phrase');
    expect(efg.notes.map((n) => ('fret' in n ? pcName(noteAt(n)) : '')).join('')).toBe('EFG');
  });
});

describe('the-musical-alphabet: sharps, flats and their two names', () => {
  it('spells the sharps and flats on the frets it names', () => {
    expect(sharpName(6, 2)).toBe('F#');
    expect(sharpName(6, 4)).toBe('G#');
    expect(transposeBySemitones('C', 1, 'sharps')).toBe('C#');
    expect(noteToMidi('Bb2')).toBe(midiAt(pos(5, 1)));
    expect(noteToMidi('Ab2')).toBe(midiAt(pos(6, 4)));
    expect(noteToMidi('Eb4') + 1).toBe(noteToMidi('E4'));
    const typed = of(exercisesOf(lesson('sharps')), 'type-answer')[0];
    expect(typed.answer).toMatchObject({ kind: 'note', value: sharpName(6, 2), spelling: 'exact' });
    const flat = of(exercisesOf(lesson('flats')), 'fretboard-name')[0];
    expect(spellInKey(midiAt(flat.position) % 12, flat.key!)).toBe('Ab');
    expect(grade(flat, { type: 'fretboard-name', text: 'G#' }).correct).toBe(false);
    expect(grade(flat, { type: 'fretboard-name', text: 'Ab' }).correct).toBe(true);
  });

  it('pairs each sharp with the flat on the same fret', () => {
    for (const e of of(everything(), 'match-pairs')) {
      if (!/sharp with the flat/.test(plainText(e.prompt))) continue;
      expect(e.pairs).toHaveLength(5);
      for (const p of e.pairs) {
        const [s, f] = [ascii(p.left), ascii(p.right)];
        expect(enharmonicEqual(s, f), `${s} ${f}`).toBe(true);
        expect(parseNote(s)!.alt).toBe(1);
        expect(parseNote(f)!.alt).toBe(-1);
      }
    }
    const twin = byPrompt(of(exercisesOf(lesson('one-sound-two-names')), 'choice'), /sounds the same as/);
    expect(enharmonicEqual('A#', correctTexts(twin)[0])).toBe(true);
  });

  it('draws the two names of string 6 on the same frets', () => {
    const [sharpsCard, flatsCard] = lesson('one-sound-two-names').steps.filter((s) => 'type' in s && s.type === 'card' && s.figure?.kind === 'fretboard');
    const dots = (s: Step) => ('type' in s && s.type === 'card' && s.figure?.kind === 'fretboard' ? s.figure.dots ?? [] : []);
    const inBetween = dots(sharpsCard).filter((d) => parseNote(d.note!)!.alt !== 0).map((d) => d.fret);
    expect(inBetween).toEqual([2, 4, 6, 9, 11]);
    expect(dots(flatsCard).map((d) => d.fret)).toEqual(inBetween);
    for (const d of dots(flatsCard)) expect(noteToMidi(d.note!)).toBe(midiAt(d));
  });
});

describe('the-musical-alphabet: the twelve notes', () => {
  it('counts twelve notes and twelve frets to the octave', () => {
    expect(getScale('chromatic')!.size).toBe(12);
    for (let s = 1; s <= 6; s++) expect(midiAt(pos(s, 12)) - midiAt(pos(s, 0))).toBe(12);
    const order = of(exercisesOf(lesson('the-twelve-notes')), 'order')[0];
    expect(texts(order.tiles)).toEqual([0, 1, 2, 3, 4, 5].map((f) => sharpName(1, f)));
  });

  it('fills the chromatic scale with one half step between every pair', () => {
    const fill = of(exercisesOf(lesson('the-twelve-notes')), 'fill-blanks')[0];
    const blanks = texts(fill.blanks);
    const line = ascii(fill.text).split(/\s+/).map((t) => (t === '___' ? blanks.shift()! : t));
    expect(line).toHaveLength(13);
    for (let i = 1; i < line.length; i++) expect(up(line[i - 1], line[i]), `${line[i - 1]} ${line[i]}`).toBe(1);
    expect(line[0]).toBe(line[12]);
  });
});

describe('the-musical-alphabet: what the tips promise about the drills', () => {
  const drills = (l: Lesson, kind: string) => l.steps.filter((s): s is Extract<Step, { generate: string }> => 'generate' in s && s.generate === kind);
  const runs = (step: Extract<Step, { generate: string }>) =>
    Array.from({ length: 60 }, (_x, seed) => [0, 0.5, 1].map((difficulty) => generateExercise(step, { seed: seed + 1, difficulty, level: 'beginner' }))).flat();

  it('half-and-whole-steps: every right note is a plain letter, before sharps and flats are taught', () => {
    const l = lesson('half-and-whole-steps');
    for (const step of drills(l, 'step-up')) {
      for (const ex of runs(step)) expect(parseNote(ascii(answerText(ex)))!.alt, ascii(answerText(ex))).toBe(0);
    }
    for (const e of exercisesOf(l)) {
      if (e.type === 'choice' && /note/.test(plainText(e.prompt))) for (const t of correctTexts(e)) expect(parseNote(t)?.alt ?? 0).toBe(0);
    }
  });

  it('flats: the drill names the in-between frets with sharps, as the tip warns', () => {
    expect(sharpName(5, 1)).toBe('A#');
    expect(enharmonicEqual('A#', 'Bb')).toBe(true);
    expect(noteToMidi('Bb2')).toBe(midiAt(pos(5, 1)));
    for (const step of drills(lesson('flats'), 'note-on-string')) {
      for (const ex of runs(step)) {
        if (ex.type !== 'fretboard-name') throw new Error('fretboard-name');
        const name = ascii(answerText(ex));
        expect(parseNote(name)!.alt, name).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('the-twelve-notes: names fret 4 of string 1 both ways, as the play view may show it', () => {
    const [phrase] = of(lesson('the-twelve-notes').steps.filter(literal), 'play-phrase');
    // The play view spells its note chips with midiToNote's default: fret 4 of string 1 shows as Ab4.
    expect(midiToNote(midiAt(pos(1, 4)))).toBe('Ab4');
    expect(sharpName(1, 4)).toBe('G#');
    expect(ascii(phrase.explain)).toMatch(/G# .*Ab/);
  });

  it('keeps every play-phrase short enough to fit a phone screen', () => {
    // The play view draws the tab at its full width (about 50 px a note); seven or more notes
    // are wider than a 360 px phone and scroll the whole page sideways.
    for (const l of unit.lessons) for (const e of of(l.steps.filter(literal), 'play-phrase')) expect(e.notes.length, l.id).toBeLessThanOrEqual(6);
  });
});

describe('the-musical-alphabet: every exercise', () => {
  it('accepts its own answer, and play steps play where they say', () => {
    for (const e of everything()) {
      if (e.type === 'play-note') expect(noteToMidi(e.note), plainText(e.prompt)).toBe(midiAt(e.where!));
      if (e.type === 'play-note' || e.type === 'play-chord' || e.type === 'play-phrase' || e.type === 'flashcard') continue;
      expect(grade(e, solve(e)).correct, 'prompt' in e ? plainText(e.prompt ?? '') : '').toBe(true);
    }
  });

  it('names the checkpoint\'s fret 3 of string 6 as the engine does', () => {
    const name = of(checkpoint(), 'fretboard-name')[0];
    expect(pcName(noteAt(name.position))).toBe('G');
  });

  it('names every fact after the unit', () => {
    for (const l of unit.lessons) for (const f of l.facts ?? []) expect(f.id).toMatch(/^alphabet-/);
  });

  it('asks every question so it stands on its own (practice and placement ask them one at a time)', () => {
    for (const e of everything()) {
      if (!('prompt' in e) || !e.prompt) continue;
      const p = plainText(e.prompt);
      expect(p, p).not.toMatch(/^(And|So|Now)\b|\bthat note\b|\bthis one\b/);
    }
  });
});
