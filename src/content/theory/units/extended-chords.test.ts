/**
 * Unit 31 of the Theory Path, cross-checked against the engines: every chord shape written next
 * to a chord name, every spelling and typed extension, the degrees on the fretboard figures, the
 * clash of the natural 11, what to drop first, which ninths are diatonic to C major, what each
 * listening question plays, and that every lesson still teaches with the guitar or the sound off.
 */
import { describe, expect, it } from 'vitest';
import {
  chordNotes, chordPcs, chordTones, diatonicChords, intervalBetween, parseChord, scaleNotes, semitones, simplifyInterval, transpose,
} from '@/core/theory';
import { buildVoicing, midiAt, noteAt, tryBuildVoicing } from '@/core/guitar';
import {
  formatProblems, isGenerated, plainText, resolveFigure, soundPlan, tokenize, validateCourse,
  type ChoiceExercise, type ChordBuildExercise, type Exercise, type Figure, type FillBlanksExercise, type Lesson, type ListenChoiceExercise,
  type MatchPairsExercise, type PlayChordExercise, type RichText, type Step, type TypeAnswerExercise,
} from '@/lessons';
import { adaptUnit, isListeningStep, MIN_QUIET_EXERCISES } from '@/features/learn/model/conditions';
import { THEORY_GLOSSARY } from '../glossary';
import unit from './extended-chords';

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

/** Every string in the unit (texts, captions, options, facts). */
function texts(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) texts(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) texts(v, out);
  return out;
}
/** The values of the tags of one kind in a text: `{c:Am7}` -> 'Am7'. */
function tagged(text: RichText, type: 'chord' | 'note' | 'degree' | 'key'): string[] {
  return tokenize(text).flatMap((t) => (t.type === type && 'value' in t ? [String(t.value)] : []));
}
const sortedPcs = (pcs: Iterable<number>): number[] => [...new Set(pcs)].sort((a, b) => a - b);
/** The note of a chord at a degree label ('9', '11', '#11', '13', 'b7'). */
const toneOf = (symbol: string, degree: string): string => {
  const t = chordTones(symbol).find((x) => x.degree === degree);
  if (!t) throw new Error(`${symbol} has no ${degree}`);
  return t.note;
};
const SHAPE = String.raw`([x0-9]{6}|x(?:-(?:x|\d{1,2})){5})`;
/** Every chord figure in the unit (cards, prompts, facts) that names both a symbol and a shape. */
function chordFigures(value: unknown, out: Array<{ symbol: string; frets: string }> = []): Array<{ symbol: string; frets: string }> {
  if (Array.isArray(value)) for (const v of value) chordFigures(v, out);
  else if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (o.kind === 'chord' && typeof o.symbol === 'string' && typeof o.frets === 'string') out.push({ symbol: o.symbol, frets: o.frets });
    for (const v of Object.values(o)) chordFigures(v, out);
  }
  return out;
}

describe('extended-chords: the unit on its own', () => {
  it('is valid for the lesson engine, with no warnings', () => {
    const problems = validateCourse({ id: 'theory-path', title: 'Theory Path', teacher: 'none', level: 'expert', units: [unit], glossary: [...THEORY_GLOSSARY] });
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('starts every fact id with the unit word', () => {
    for (const l of unit.lessons) for (const f of l.facts ?? []) expect(f.id).toMatch(/^extended-/);
  });
});

describe('extended-chords: every shape written in the text', () => {
  // "{c:Am11} (530000)", "{c:Cmaj9} x3243x", "{c:G9} (x-10-9-10-10-x)".
  const pairs: Array<[string, string]> = [];
  for (const text of texts(unit)) for (const m of text.matchAll(new RegExp(String.raw`\{c:([^}]+)\}\s*\(?${SHAPE}\)?`, 'g'))) pairs.push([m[1], m[2]]);

  it('finds the shapes', () => {
    expect(pairs.length).toBeGreaterThan(15);
  });

  it('sounds exactly the chord it is written beside', () => {
    for (const [symbol, shape] of pairs) {
      const v = tryBuildVoicing(symbol, shape);
      expect(v, `${symbol} ${shape}`).not.toBeNull();
      expect(v!.chord, `${symbol} ${shape}`).toBe(symbol);
    }
  });

  it('builds every chord figure, chord-build and play-chord shape as the chord it names', () => {
    const figures = chordFigures(unit);
    expect(figures.length).toBeGreaterThanOrEqual(12);
    for (const f of figures) expect(buildVoicing(f.symbol, f.frets).chord, `${f.symbol} ${f.frets}`).toBe(f.symbol);
    const shaped: Array<ChordBuildExercise | PlayChordExercise> = [
      ...ofType<ChordBuildExercise>('chord-build').filter((e) => e.task === 'fingers'),
      ...ofType<PlayChordExercise>('play-chord'),
    ];
    expect(shaped.length).toBeGreaterThanOrEqual(8);
    for (const e of shaped) expect(buildVoicing(e.chord, e.frets!).chord, `${e.chord} ${String(e.frets)}`).toBe(e.chord);
  });

  it('says what the guitar grips leave out', () => {
    expect(buildVoicing('Cmaj9', 'x3243x').omitted).toEqual(['5']);
    expect(buildVoicing('Cm9', 'x3133x').omitted).toEqual(['5']);
    expect(buildVoicing('C9', 'x32333').omitted).toEqual([]);
    // The G on string 1 of x32333 is the 5th; lifting it leaves 3rd, 7th and 9th.
    expect(buildVoicing('C9', 'x32333').notes.find((n) => n.string === 1)!.degree).toBe('5');
    expect(buildVoicing('C9', 'x3233x').notes.map((n) => n.degree)).toEqual(['1', '3', 'b7', '9']);
    // The four-note grips: root, b7, 3rd, 13th.
    expect(buildVoicing('G13', '3x345x').notes.map((n) => n.degree)).toEqual(['1', 'b7', '3', '13']);
    expect(buildVoicing('C13', 'x3x355').notes.map((n) => n.degree)).toEqual(['1', 'b7', '3', '13']);
    // Am11 from string 6 up: A C D G B E.
    expect(buildVoicing('Am11', '530000').notes.map((n) => n.note)).toEqual(['A', 'C', 'D', 'G', 'B', 'E']);
    expect(buildVoicing('Am11', '530000').notes.find((n) => n.string === 4)!.degree).toBe('11');
    // Fmaj7#11 xx3200: F A B E, the open B the #11.
    expect(buildVoicing('Fmaj7#11', 'xx3200').notes.map((n) => `${n.note}:${n.degree}`)).toEqual(['F:1', 'A:3', 'B:#11', 'E:7']);
    // Cadd9 x32030: the D on string 2.
    expect(noteAt({ string: 2, fret: 3 }, { context: { chord: 'Cadd9' }, octave: false })).toBe('D');
  });

  it('moves one note from G7 to G13: the 5th up to the 13th', () => {
    const g7 = buildVoicing('G7', '3x343x');
    const g13 = buildVoicing('G13', '3x345x');
    const changed = g7.notes.filter((n) => g13.notes.find((m) => m.string === n.string)!.fret !== n.fret);
    expect(changed.map((n) => n.string)).toEqual([2]);
    expect(changed[0].note).toBe('D');
    expect(g13.notes.find((n) => n.string === 2)!.note).toBe('E');
    const choice = exercises(lesson('thirteenths').steps).find((e) => e.type === 'choice' && /add to/.test(plainText(e.prompt))) as ChoiceExercise;
    expect(correctText(choice)).toBe('E');
  });
});

describe('extended-chords: stacking thirds', () => {
  it('draws C stacked in thirds from C3 to A4 with the right degrees', () => {
    const card = lesson('beyond-the-seventh').steps[0];
    if (isGenerated(card) || card.type !== 'card' || card.figure?.kind !== 'fretboard') throw new Error('expected a fretboard card');
    const dots = card.figure.dots!;
    const midi = dots.map((d) => midiAt(d));
    expect(midi).toEqual([48, 52, 55, 58, 62, 65, 69]);
    expect(midi.slice(1).map((m, i) => m - midi[i])).toEqual([4, 3, 3, 4, 3, 4]); // thirds all the way up
    expect(dots.map((d) => d.degree)).toEqual(['1', '3', '5', 'b7', '9', '11', '13']);
    expect([toneOf('C13', '9'), toneOf('C11', '11'), toneOf('C13', '13')]).toEqual(['D', 'F', 'A']);
    // The audio plays the same stack.
    const audio = lesson('beyond-the-seventh').steps[1];
    if (isGenerated(audio) || audio.type !== 'card' || audio.figure?.kind !== 'audio') throw new Error('expected an audio card');
    expect(soundPlan(audio.figure.sound).events.flatMap((e) => e.midi)).toEqual(midi);
  });

  it('names the 9th, 11th and 13th as the 2nd, 4th and 6th an octave up', () => {
    expect(simplifyInterval('M9')).toBe('M2');
    expect(simplifyInterval('P11')).toBe('P4');
    expect(simplifyInterval('M13')).toBe('M6');
    expect(semitones('M9') - 12).toBe(semitones('M2'));
    const q = exercises(lesson('beyond-the-seventh').steps).find((e) => e.type === 'choice' && /13th/.test(plainText(e.prompt))) as ChoiceExercise;
    expect(correctText(q)).toBe('The 6th');
    const cp = exercises(unit.checkpoint!.steps!).find((e) => e.type === 'choice' && /11th is which/.test(plainText(e.prompt))) as ChoiceExercise;
    expect(correctText(cp)).toBe('The 4th');
    // The match-pairs over C.
    const pairs = ofType<MatchPairsExercise>('match-pairs').find((e) => /extension of a/.test(plainText(e.prompt)))!.pairs;
    const chordWith: Record<string, string> = { '9th': 'C9', '11th': 'C11', '13th': 'C13' };
    for (const p of pairs) {
      const label = plainText(p.left);
      expect(tagged(p.right, 'note')[0], label).toBe(toneOf(chordWith[label], label.replace('th', '')));
    }
  });

  it('fills the stacks of thirds with the right note', () => {
    const stacks = ofType<FillBlanksExercise>('fill-blanks').filter((e) => /Stack thirds/.test(plainText(e.prompt)));
    expect(stacks.length).toBe(2);
    for (const e of stacks) {
      const root = tagged(e.prompt, 'note')[0];
      expect(e.blanks.map((b) => tagged(b, 'note')[0])).toEqual([toneOf(`${root}9`, '9')]);
      const shown = tagged(e.text, 'note');
      expect(shown).toEqual([...chordNotes(`${root}7`), toneOf(`${root}11`, '11'), toneOf(`${root}13`, '13')]);
      for (const w of e.bank ?? []) expect(chordNotes(`${root}13`)).not.toContain(tagged(w, 'note')[0]);
    }
  });
});

describe('extended-chords: spellings', () => {
  it('spells the chords it quotes', () => {
    expect(chordNotes('C9')).toEqual(['C', 'E', 'G', 'Bb', 'D']);
    expect(chordNotes('Cmaj9')).toEqual(['C', 'E', 'G', 'B', 'D']);
    expect(chordNotes('Cm9')).toEqual(['C', 'Eb', 'G', 'Bb', 'D']);
    expect(chordNotes('Cadd9')).toEqual(['C', 'E', 'G', 'D']);
    expect(chordNotes('A9')).toEqual(['A', 'C#', 'E', 'G', 'B']);
    expect(chordNotes('Am11')).toEqual(['A', 'C', 'E', 'G', 'B', 'D']);
    expect(chordNotes('Dm11')).toEqual(['D', 'F', 'A', 'C', 'E', 'G']);
    expect(chordNotes('Cmaj7#11')).toEqual(['C', 'E', 'G', 'B', 'F#']);
    expect(chordNotes('G7#11')).toEqual(['G', 'B', 'D', 'F', 'C#']);
    expect(chordNotes('C13')).toEqual(['C', 'E', 'G', 'Bb', 'D', 'A']);
    expect(chordNotes('C6')).toEqual(['C', 'E', 'G', 'A']);
    expect(chordNotes('E9')).toEqual(['E', 'G#', 'B', 'D', 'F#']);
    expect(chordNotes('D9')).toEqual(['D', 'F#', 'A', 'C', 'E']);
    expect(chordNotes('Dadd9')).toEqual(['D', 'F#', 'A', 'E']);
    expect(chordNotes('Gadd9')).toEqual(['G', 'B', 'D', 'A']);
    expect(chordNotes('G9')).toEqual(['G', 'B', 'D', 'F', 'A']);
    // 9 has the 7th, add9 does not.
    expect(chordNotes('C9')).toContain('Bb');
    expect(chordNotes('Cadd9')).not.toContain('Bb');
    expect(chordNotes('Cmaj9')).toContain('B');
    // 13 has the b7, 6 does not; the 11th is left out of the 13th.
    expect(chordNotes('C13')).toContain('Bb');
    expect(chordNotes('C6')).not.toContain('Bb');
    expect(chordNotes('C13')).not.toContain('F');
  });

  it('matches every chord in a match-pairs with its notes', () => {
    const spelled = ofType<MatchPairsExercise>('match-pairs').filter((e) => /with its notes/.test(plainText(e.prompt)));
    expect(spelled.length).toBe(3);
    for (const p of spelled.flatMap((e) => e.pairs)) {
      const symbol = tagged(p.left, 'chord')[0];
      expect(tagged(p.right, 'note'), symbol).toEqual(chordNotes(symbol));
    }
  });

  it('types and picks every extension as the engine spells it', () => {
    const typed = ofType<TypeAnswerExercise>('type-answer');
    expect(typed.length).toBe(7);
    for (const e of typed) {
      const symbol = tagged(e.prompt, 'chord')[0];
      const degree = tagged(e.prompt, 'degree')[0] ?? /the (\d+)th of/.exec(plainText(e.prompt))![1];
      expect(e.answer.kind === 'note' && e.answer.spelling).toBe('exact');
      expect(e.answer.value, `${symbol} ${degree}`).toBe(toneOf(symbol, degree));
    }
    // The fill-blanks of Cmaj7#11 and C13.
    const fills = ofType<FillBlanksExercise>('fill-blanks').filter((e) => /^Complete/.test(plainText(e.prompt)));
    expect(fills.length).toBe(2);
    for (const e of fills) {
      const symbol = tagged(e.prompt, 'chord')[0];
      const shown = tagged(e.text, 'note');
      const blanks = e.blanks.map((b) => tagged(b, 'note')[0]);
      let b = 0;
      const all = tokenize(e.text).filter((t) => t.type === 'note' || t.type === 'blank').map((t) => (t.type === 'blank' ? blanks[b++] : String((t as { value: string }).value)));
      expect(all, symbol).toEqual(chordNotes(symbol));
      expect(shown.length + blanks.length).toBe(chordNotes(symbol).length);
    }
    const sharp = exercises(unit.checkpoint!.steps!).find((e) => e.type === 'choice' && /#11/.test(String(e.prompt))) as ChoiceExercise;
    expect(correctText(sharp)).toBe('F♯');
    expect(toneOf('Cmaj7#11', '#11')).toBe('F#');
    expect(toneOf('G7#11', '#11')).toBe('C#');
  });
});

describe('extended-chords: why the 11 is sharpened, and what to drop', () => {
  it('puts the natural 11 a minor 9th above a major 3rd, but a major 9th above a minor 3rd', () => {
    expect(intervalBetween('E3', 'F4')).toBe('m9'); // C: 3rd E, 11th F
    expect(intervalBetween('B3', 'C5')).toBe('m9'); // G7: 3rd B, 11th C
    expect(intervalBetween('C3', 'D4')).toBe('M9'); // Am: 3rd C, 11th D
    expect(intervalBetween('E3', 'F#4')).toBe('M9'); // the #11 clears the clash
  });

  it('plays the rub in the second chord of the listening question, and not in the first', () => {
    const q = listens(lesson('elevenths'))[0];
    const events = soundPlan(q.sound).events;
    expect(events.length).toBe(2);
    const [first, second] = events.map((e) => e.midi);
    const third = 52; // E3
    expect(first).toContain(third);
    expect(second).toContain(third);
    expect(first.some((m) => m - third === 13)).toBe(false);
    expect(second.some((m) => m - third === 13)).toBe(true);
    expect(sortedPcs(first.map((m) => m % 12))).toEqual(sortedPcs(chordPcs('Cmaj7#11')));
    expect(sortedPcs(second.map((m) => m % 12))).toEqual(sortedPcs([...chordPcs('Cmaj7'), 5]));
    expect(correctText(q)).toBe('The second');
  });

  it('drops the 5th first and keeps the 3rd and 7th', () => {
    for (const symbol of ['C9', 'Cm9', 'C13', 'G13']) {
      const tones = chordTones(symbol);
      const fifth = tones.find((t) => t.degree === '5')!;
      expect(fifth.omittable, symbol).toBe(true);
      expect(Math.max(...tones.map((t) => t.priority)), symbol).toBe(fifth.priority);
      for (const t of tones.filter((x) => ['3', 'b3', '7', 'b7'].includes(x.degree))) expect(t.priority, `${symbol} ${t.degree}`).toBe(1);
    }
    // The 9th is a lesser tension of a 13th chord than the 13th itself.
    expect(chordTones('C13').find((t) => t.degree === '9')!.priority).toBeGreaterThan(chordTones('C13').find((t) => t.degree === '13')!.priority);
    // Root and 5th cannot tell C7, Cmaj7 and Cm7 apart.
    for (const s of ['C7', 'Cmaj7', 'Cm7']) expect(chordNotes(s)).toEqual(expect.arrayContaining(['C', 'G']));
  });
});

describe('extended-chords: extensions in C major', () => {
  const scale = scaleNotes('C', 'major');
  const inKey = (symbol: string): boolean => chordNotes(symbol).every((n) => scale.includes(n));

  it('keeps the 9th inside the key on every degree but 3 and 7', () => {
    const sevenths = diatonicChords('C major', { sevenths: true });
    const ninths = sevenths.map((c) => transpose(c.root, 'M2'));
    expect(ninths.map((n) => scale.includes(n))).toEqual([true, true, false, true, true, true, false]);
    expect(ninths[2]).toBe('F#');
    expect(ninths[6]).toBe('C#');
    for (const s of ['Cmaj9', 'Dm9', 'Fmaj9', 'G9', 'Am9']) expect(inKey(s), s).toBe(true);
    expect(inKey('Em9')).toBe(false);
    expect(inKey('Fmaj7#11')).toBe(true);
    expect(toneOf('Fmaj7#11', '#11')).toBe('B');
    expect(sevenths.map((c) => c.symbol)).toEqual(['Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'Am7', 'Bm7b5']);
  });

  it('matches each C major chord with its 9th', () => {
    const pairs = ofType<MatchPairsExercise>('match-pairs').find((e) => /with its 9th/.test(plainText(e.prompt)))!.pairs;
    for (const p of pairs) {
      const symbol = tagged(p.left, 'chord')[0];
      expect(tagged(p.right, 'note')[0], symbol).toBe(transpose(parseChord(symbol)!.root, 'M2'));
    }
  });

  it('draws the Em9 grip with its outside 9th', () => {
    expect(buildVoicing('Em9', 'x7577x').notes.map((n) => `${n.note}:${n.degree}`)).toEqual(['E:1', 'G:b3', 'D:b7', 'F#:9']);
  });
});

describe('extended-chords: what each listening question plays', () => {
  it('ninth-chords: the Cm9 grip, a minor 9', () => {
    const q = listens(lesson('ninth-chords'))[0];
    if (q.sound.kind !== 'chord') throw new Error('expected a chord');
    expect(buildVoicing(q.sound.chord, q.sound.frets as string).chord).toBe('Cm9');
    expect(correctText(q)).toBe('Minor 9');
  });

  it('thirteenths: the G13 grip', () => {
    const q = listens(lesson('thirteenths'))[0];
    if (q.sound.kind !== 'chord') throw new Error('expected a chord');
    expect(buildVoicing(q.sound.chord, q.sound.frets as string).chord).toBe('G13');
    expect(correctText(q)).toBe('G13');
  });

  it('checkpoint: the C9 grip, a dominant 9', () => {
    const q = exercises(unit.checkpoint!.steps!).find((e): e is ListenChoiceExercise => e.type === 'listen-choice')!;
    if (q.sound.kind !== 'chord') throw new Error('expected a chord');
    expect(buildVoicing(q.sound.chord, q.sound.frets as string).chord).toBe('C9');
    expect(correctText(q)).toBe('Dominant 9');
  });

  it('what-to-leave-out: all six notes of C13 together', () => {
    const card = lesson('what-to-leave-out').steps[1];
    if (isGenerated(card) || card.type !== 'card' || card.figure?.kind !== 'audio') throw new Error('expected an audio card');
    const midi = soundPlan(card.figure.sound).events.flatMap((e) => e.midi);
    expect(midi.length).toBe(6);
    expect(sortedPcs(midi.map((m) => m % 12))).toEqual(sortedPcs(chordPcs('C13')));
  });
});

describe('extended-chords: on the go', () => {
  it('keeps every chord-build when the sound is off (no grip is hidden behind an audio figure)', () => {
    const builds = (steps: readonly Step[]): number =>
      steps.filter((s) => !isGenerated(s) && s.type === 'chord-build').length;
    for (const l of unit.lessons) {
      const quiet = adaptUnit(unit, { guitar: true, sound: false }).lessons.find((x) => x.id === l.id)!;
      expect(builds(quiet.steps), l.id).toBeGreaterThanOrEqual(builds(l.steps));
    }
    // The G7-to-G13 move in particular: still asked, starting from the G7 picture.
    const quiet = adaptUnit(unit, { guitar: true, sound: false }).lessons.find((x) => x.id === 'thirteenths')!;
    const move = exercises(quiet.steps).find((e): e is ChordBuildExercise => e.type === 'chord-build' && e.chord === 'G13');
    expect(move).toBeDefined();
    expect(move!.figure).toMatchObject({ kind: 'chord', symbol: 'G7', frets: '3x343x' });
    // And the sound of the move is on the card that describes it.
    const card = lesson('thirteenths').steps.find((s) => !isGenerated(s) && s.type === 'card' && s.title === 'One finger up');
    if (!card || isGenerated(card) || card.type !== 'card' || card.figure?.kind !== 'audio' || card.figure.sound.kind !== 'progression') throw new Error('expected the G7 to G13 audio');
    expect(card.figure.sound.chords).toEqual(['G7', 'G13']);
  });

  // An interactive piano takes 34 px a white key: nine fit a 390 px phone; at 360 px the ninth
  // scrolls inside the piano's own frame (allowed), a tenth would be cut off at 390 px too.
  it('keeps every keyboard figure within nine white keys, so none is cropped on a 390 px phone', () => {
    const boards: Figure[] = [];
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') {
        if ((v as { kind?: string }).kind === 'keyboard') boards.push(v as Figure);
        Object.values(v).forEach(walk);
      }
    };
    walk(unit);
    expect(boards.length).toBeGreaterThan(0);
    for (const f of boards) {
      const r = resolveFigure(f);
      if (!r || r.kind !== 'keyboard') throw new Error('expected a keyboard');
      const whites = Array.from({ length: r.to - r.from + 1 }, (_x, i) => r.from + i).filter((m) => ![1, 3, 6, 8, 10].includes(m % 12)).length;
      expect(whites).toBeLessThanOrEqual(9);
      // Every labelled key is drawn.
      for (const k of r.keys) expect(k.midi >= r.from && k.midi <= r.to, k.note).toBe(true);
    }
  });

  it('puts the 11th of the Am11 grip a whole step above the minor 3rd, as the card says', () => {
    const am11 = buildVoicing('Am11', '530000');
    const third = am11.notes.find((n) => n.degree === 'b3')!;
    const eleventh = am11.notes.find((n) => n.degree === '11')!;
    expect(midiAt(eleventh) - midiAt(third)).toBe(2);
    expect(semitones(intervalBetween(third.note, eleventh.note))).toBe(2);
  });

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
});
