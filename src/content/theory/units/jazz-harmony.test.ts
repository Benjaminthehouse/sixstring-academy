/**
 * Unit 34 of the Theory Path, cross-checked against the engines: every shape written beside a
 * chord, every two-five-one and turnaround built from its numerals (`romanToChord`), the guide
 * tones and how each 7th falls to the next 3rd, the shells (root, 3rd and 7th only), each drop-2
 * and drop-3 voicing made from its close voicing by the drop rule, the comping rhythms, what each
 * listening question plays, and that every lesson still teaches with the guitar or the sound off.
 */
import { describe, expect, it } from 'vitest';
import {
  chordNotes, chordPcs, chordTones, intervalBetween, parseChord, romanToChord, scaleNotes, scalePcs, transpose,
} from '@/core/theory';
import { buildVoicing, midiAt, moveVoicing, tryBuildVoicing } from '@/core/guitar';
import {
  formatProblems, isGenerated, parseRhythm, plainText, soundPlan, tokenize, validateCourse,
  type ChoiceExercise, type ChordBuildExercise, type Exercise, type FillBlanksExercise, type Lesson, type ListenChoiceExercise,
  type MatchPairsExercise, type OrderExercise, type PlayChordExercise, type PlayPhraseExercise, type RichText, type Step,
  type TapRhythmExercise, type TypeAnswerExercise,
} from '@/lessons';
import { adaptUnit, isListeningStep, MIN_QUIET_EXERCISES } from '@/features/learn/model/conditions';
import { THEORY_GLOSSARY } from '../glossary';
import unit from './jazz-harmony';

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
const correctOption = (e: { options: Array<{ text?: RichText; correct?: boolean }> }): RichText => e.options.find((o) => o.correct)?.text ?? '';
const listens = (l: Lesson): ListenChoiceExercise[] => exercises(l.steps).filter((e): e is ListenChoiceExercise => e.type === 'listen-choice');
const findIn = <T extends Exercise>(pool: Exercise[], type: T['type'], text: RegExp): T => {
  const found = pool.find((e) => e.type === type && text.test(plainText(('prompt' in e ? e.prompt : undefined) ?? '')));
  if (!found) throw new Error(`no ${type} matching ${text}`);
  return found as T;
};
const inLesson = (id: string): Exercise[] => [...exercises(lesson(id).steps), ...exercises((lesson(id).facts ?? []).map((f) => f.ask))];

/** Every string in the unit (texts, captions, options, facts). */
function texts(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) texts(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) texts(v, out);
  return out;
}
/** The values of the tags of one kind in a text: `{c:Am7}` -> 'Am7'. */
function tagged(text: RichText, type: 'chord' | 'roman' | 'note' | 'key'): string[] {
  return tokenize(text).flatMap((t) => (t.type === type && 'value' in t ? [String(t.value)] : []));
}
/** Every chord figure in the unit that names both a symbol and a shape. */
function chordFigures(value: unknown, out: Array<{ symbol: string; frets: string }> = []): Array<{ symbol: string; frets: string }> {
  if (Array.isArray(value)) for (const v of value) chordFigures(v, out);
  else if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (o.kind === 'chord' && typeof o.symbol === 'string' && typeof o.frets === 'string') out.push({ symbol: o.symbol, frets: o.frets });
    for (const v of Object.values(o)) chordFigures(v, out);
  }
  return out;
}
const pcOf = (note: string): number => scalePcs(note, 'major')[0];
const rootOf = (symbol: string): string => parseChord(symbol)!.root;
const keyTonic = (text: RichText): string => tagged(text, 'key')[0];
const tone = (symbol: string, role: string): string => chordTones(symbol).find((t) => t.role === role)!.note;
/** Drop the nth-highest note of a close voicing (MIDI) an octave: drop 2, drop 3. */
const drop = (close: number[], n: number): number[] => {
  const sorted = [...close].sort((a, b) => a - b);
  const i = sorted.length - n;
  return [...sorted.slice(0, i), sorted[i] - 12, ...sorted.slice(i + 1)].sort((a, b) => a - b);
};
const sameSet = (a: Iterable<number>, b: Iterable<number>): boolean => {
  const x = [...new Set(a)].sort((p, q) => p - q).join('.');
  const y = [...new Set(b)].sort((p, q) => p - q).join('.');
  return x === y;
};
const SHAPE = /\{c:([^}]+)\}\s*\(?((?:[x0-9]{6})|(?:[x0-9]{1,2}(?:-[x0-9]{1,2}){5}))\)?/g;

describe('jazz-harmony: the unit on its own', () => {
  it('is valid for the lesson engine, with no warnings', () => {
    const problems = validateCourse({ id: 'theory-path', title: 'Theory Path', teacher: 'none', level: 'expert', units: [unit], glossary: [...THEORY_GLOSSARY] });
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('starts every fact id with the unit word', () => {
    for (const l of unit.lessons) for (const f of l.facts ?? []) expect(f.id).toMatch(/^jazz-/);
  });
});

describe('jazz-harmony: every shape written in the text', () => {
  // "{c:Am7} (x02010)" and "{c:Gmaj7} 3x44xx" in prose, captions and facts.
  const pairs: Array<[string, string]> = [];
  for (const text of texts(unit)) for (const m of text.matchAll(SHAPE)) pairs.push([m[1], m[2]]);

  it('finds the shapes', () => {
    expect(pairs.length).toBeGreaterThan(30);
  });

  it('sounds exactly the chord it is written beside', () => {
    for (const [symbol, shape] of pairs) {
      const v = tryBuildVoicing(symbol, shape);
      expect(v, `${symbol} ${shape}`).not.toBeNull();
      expect(v!.chord, `${symbol} ${shape}`).toBe(symbol);
    }
  });

  it('builds every chord figure, chord-build, play-chord and matched shape as its chord', () => {
    const figures = chordFigures(unit);
    expect(figures.length).toBeGreaterThanOrEqual(5);
    for (const f of figures) expect(buildVoicing(f.symbol, f.frets).chord, `${f.symbol} ${f.frets}`).toBe(f.symbol);
    const shaped: Array<ChordBuildExercise | PlayChordExercise> = [
      ...ofType<ChordBuildExercise>('chord-build').filter((e) => e.task === 'fingers'),
      ...ofType<PlayChordExercise>('play-chord'),
    ];
    expect(shaped.length).toBe(19); // seven play-chord steps, their seven alternatives, five chord-builds
    for (const e of shaped) expect(buildVoicing(e.chord, e.frets!).chord, `${e.chord} ${String(e.frets)}`).toBe(e.chord);
    const matched = ofType<MatchPairsExercise>('match-pairs').flatMap((e) => e.pairs).filter((p) => /^[x0-9]{6}$/.test(plainText(p.left)));
    expect(matched.length).toBe(17);
    for (const p of matched) expect(buildVoicing(tagged(p.right, 'chord')[0], plainText(p.left)).chord).toBe(tagged(p.right, 'chord')[0]);
  });
});

describe('jazz-harmony: two-five-ones', () => {
  const twoFiveOne = (key: string): string[] => ['ii7', 'V7', 'Imaj7'].map((r) => romanToChord(r, key));

  it('builds the major two-five-one of every key it names', () => {
    expect(twoFiveOne('C')).toEqual(['Dm7', 'G7', 'Cmaj7']);
    expect(twoFiveOne('G')).toEqual(['Am7', 'D7', 'Gmaj7']);
    expect(twoFiveOne('F')).toEqual(['Gm7', 'C7', 'Fmaj7']);
    expect(twoFiveOne('D')).toEqual(['Em7', 'A7', 'Dmaj7']);
    expect(twoFiveOne('Eb')).toEqual(['Fm7', 'Bb7', 'Ebmaj7']);
    for (const key of ['C', 'G', 'F', 'D', 'Eb', 'Bb', 'A']) {
      const roots = twoFiveOne(key).map(rootOf);
      expect(intervalBetween(roots[0], roots[1]), key).toBe('P4'); // up a fourth = down a fifth
      expect(intervalBetween(roots[1], roots[2]), key).toBe('P4');
    }
  });

  it('fills and types the chords the engine gives', () => {
    for (const e of ofType<FillBlanksExercise>('fill-blanks').filter((x) => /\{r:ii\}–\{r:V\}–\{r:I\}/.test(String(x.prompt)))) {
      const key = keyTonic(e.prompt).split(' ')[0];
      const given = tagged(e.text, 'chord');
      expect([given[0], tagged(e.blanks[0], 'chord')[0], given[1]], plainText(e.prompt)).toEqual(twoFiveOne(key));
    }
    for (const e of ofType<TypeAnswerExercise>('type-answer').filter((x) => /\{r:ii\} chord of a two-five-one/.test(String(x.prompt)))) {
      expect(e.answer.value, plainText(e.prompt)).toBe(twoFiveOne(keyTonic(e.prompt).split(' ')[0])[0]);
    }
  });

  it('reads the tune in two keys', () => {
    const q = findIn<ChoiceExercise>(inLesson('major-two-five-one'), 'choice', /A tune runs/);
    const chords = tagged(q.prompt, 'chord');
    expect(chords.slice(0, 3)).toEqual(twoFiveOne('D'));
    expect(chords.slice(3)).toEqual(twoFiveOne('C'));
    expect(chordNotes('A7')).toContain('C#');
    expect(chordNotes('Dmaj7')).toContain('F#');
    for (const c of ['G7', 'Cmaj7']) expect(chordNotes(c).every((n) => scaleNotes('C', 'major').includes(n)), c).toBe(true);
  });

  it('builds the minor two-five-one from the minor key', () => {
    expect(['iiø7', 'V7'].map((r) => romanToChord(r, 'A minor'))).toEqual(['Bm7b5', 'E7']);
    expect(['iiø7', 'V7'].map((r) => romanToChord(r, 'D minor'))).toEqual(['Em7b5', 'A7']);
    expect(chordNotes('Bm7b5')).toEqual(['B', 'D', 'F', 'A']);
    expect(chordNotes('F#m7b5')).toEqual(['F#', 'A', 'C', 'E']);
    for (const e of ofType<ChoiceExercise>('choice').filter((x) => /Which notes make \{c:/.test(String(x.prompt)))) {
      const symbol = tagged(e.prompt, 'chord')[0];
      for (const o of e.options) expect(tagged(o.text!, 'note').join(' ') === chordNotes(symbol).join(' '), `${symbol}: ${plainText(o.text!)}`).toBe(!!o.correct);
    }
    const fill = findIn<FillBlanksExercise>(inLesson('minor-two-five-one'), 'fill-blanks', /D minor/);
    expect(tagged(fill.blanks[0], 'chord')[0]).toBe(romanToChord('V7', 'D minor'));
    expect(chordNotes('A7')).toContain('C#');
    expect(chordNotes('Am7')).toContain('C');
  });

  it('spells the flat 9 of E7 inside A harmonic minor', () => {
    expect(chordTones('E7b9').find((t) => t.degree === 'b9')!.note).toBe('F');
    const typed = findIn<TypeAnswerExercise>(inLesson('minor-two-five-one'), 'type-answer', /E7/);
    expect(typed.answer.value).toBe('F');
    const harmonic = scaleNotes('A', 'harmonic-minor');
    expect(harmonic).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G#']);
    for (const n of chordNotes('E7b9')) expect(harmonic, n).toContain(n);
    expect(buildVoicing('Am6', 'x02212').chord).toBe('Am6');
  });
});

describe('jazz-harmony: guide tones', () => {
  const at = (string: number, fret: number): number => midiAt({ string, fret });

  it('puts the guide tones of Dm7 G7 Cmaj7 on strings 3 and 2', () => {
    const pairs = [
      { chord: 'Dm7', low: at(3, 5), high: at(2, 6) },
      { chord: 'G7', low: at(3, 4), high: at(2, 6) },
      { chord: 'Cmaj7', low: at(3, 4), high: at(2, 5) },
    ];
    for (const p of pairs) {
      const guide = [tone(p.chord, 'third'), tone(p.chord, 'seventh')].map(pcOf);
      expect(sameSet([p.low % 12, p.high % 12], guide), p.chord).toBe(true);
    }
    // Each 7th falls a half step to the next 3rd; the other guide tone stays.
    const down = (a: string, b: string): number => (pcOf(a) - pcOf(b) + 12) % 12;
    expect(down(tone('Dm7', 'seventh'), tone('G7', 'third'))).toBe(1); // C to B
    expect(down(tone('G7', 'seventh'), tone('Cmaj7', 'third'))).toBe(1); // F to E
    expect(tone('Dm7', 'third')).toBe(tone('G7', 'seventh')); // F stays
    expect(tone('G7', 'third')).toBe(tone('Cmaj7', 'seventh')); // B stays
    const phrase = exercises(lesson('guide-tones').steps).find((e): e is PlayPhraseExercise => e.type === 'play-phrase')!;
    expect(phrase.notes.map((n) => ('fret' in n ? at(n.string, n.fret) : 0))).toEqual(pairs.flatMap((p) => [p.low, p.high]));
    const order = phrase.alternative as OrderExercise;
    expect(order.tiles.map((t) => tagged(t, 'note'))).toEqual([['C', 'F'], ['B', 'F'], ['B', 'E']]);
    const card = lesson('guide-tones').steps[1];
    if (isGenerated(card) || card.type !== 'card' || card.figure?.kind !== 'tab') throw new Error('expected a tab card');
    expect(card.figure.notes.filter((n) => 'fret' in n)).toEqual(phrase.notes.map((n) => ({ ...n, duration: 'q' })));
  });

  it('answers each guide-tone question with the 3rd and 7th', () => {
    const asked = ofType<ChoiceExercise>('choice').filter((e) => /guide tones of/.test(plainText(e.prompt)));
    expect(asked.length).toBe(3);
    for (const e of asked) {
      const symbol = tagged(e.prompt, 'chord')[0];
      const guide = [tone(symbol, 'third'), tone(symbol, 'seventh')];
      for (const o of e.options) expect(tagged(o.text!, 'note').join(' ') === guide.join(' '), `${symbol}: ${plainText(o.text!)}`).toBe(!!o.correct);
    }
    // The distractors belong to the chords their "why" names.
    expect([tone('Am7', 'third'), tone('Am7', 'seventh')]).toEqual(['C', 'G']);
    expect([tone('Amaj7', 'third'), tone('Amaj7', 'seventh')]).toEqual(['C#', 'G#']);
    expect([tone('Fm7', 'third'), tone('Fm7', 'seventh')]).toEqual(['Ab', 'Eb']);
    expect([tone('F7', 'third'), tone('F7', 'seventh')]).toEqual(['A', 'Eb']);
    for (const e of ofType<FillBlanksExercise>('fill-blanks').filter((x) => /guide tone/.test(plainText(x.prompt)))) {
      const [from, to] = tagged(e.text, 'chord');
      expect(tagged(e.text, 'note')[0], plainText(e.text)).toBe(tone(from, 'seventh'));
      expect(tagged(e.blanks[0], 'note')[0], plainText(e.text)).toBe(tone(to, 'third'));
    }
  });
});

describe('jazz-harmony: shell voicings', () => {
  const shells: Array<[string, string]> = [
    ['Gmaj7', '3x44xx'], ['G7', '3x34xx'], ['Gm7', '3x33xx'],
    ['Cmaj7', 'x3x45x'], ['C7', 'x3x35x'], ['Cm7', 'x3x34x'],
    ['Dm7', 'x5x56x'], ['A7', '5x56xx'], ['Fmaj7', 'x-8-x-9-10-x'],
  ];

  it('plays only the root, 3rd and 7th, root in the bass', () => {
    for (const [symbol, shape] of shells) {
      const v = buildVoicing(symbol, shape);
      expect(v.chord, shape).toBe(symbol);
      expect(v.omitted, shape).toEqual(['5']);
      expect(v.notes.map((n) => n.role).sort(), shape).toEqual(['root', 'seventh', 'third']);
      expect(v.notes[0].role, shape).toBe('root');
    }
  });

  it('moves the G7 shell to A7 and the Cmaj7 shell to Fmaj7', () => {
    expect(moveVoicing(buildVoicing('G7', '3x34xx'), 2)!.frets).toEqual(buildVoicing('A7', '5x56xx').frets);
    expect(moveVoicing(buildVoicing('Cmaj7', 'x3x45x'), 5)!.frets).toEqual(buildVoicing('Fmaj7', 'x-8-x-9-10-x').frets);
    // Gmaj7 -> G7 moves string 4; G7 -> Gm7 moves string 3.
    const diff = (a: string, b: string): number[] => buildVoicing('G', '320003').frets.map((_f, i) => i).filter((i) => buildVoicing(a === '3x44xx' ? 'Gmaj7' : 'G7', a).frets[i] !== buildVoicing(b === '3x34xx' ? 'G7' : 'Gm7', b).frets[i]).map((i) => 6 - i);
    expect(diff('3x44xx', '3x34xx')).toEqual([4]);
    expect(diff('3x34xx', '3x33xx')).toEqual([3]);
  });

  it('tells the Dm7 shell from its neighbours', () => {
    expect(buildVoicing('D7', 'x5x57x').notes.find((n) => n.string === 2)!.note).toBe('F#');
    expect(buildVoicing('DmMaj7', 'x5x66x').notes.find((n) => n.string === 3)!.note).toBe('C#');
    const q = findIn<ChoiceExercise>(inLesson('shell-voicings'), 'choice', /Which shell is/);
    expect(buildVoicing('Dm7', plainText(correctOption(q))).chord).toBe('Dm7');
    expect(romanToChord('ii7', 'C')).toBe('Dm7');
  });
});

describe('jazz-harmony: drop-2 and drop-3 voicings', () => {
  it('makes x3545x and 3324xx by dropping the second-highest note of a close Cmaj7', () => {
    expect(drop([55, 59, 60, 64], 2)).toEqual(buildVoicing('Cmaj7', 'x3545x').midi); // G B C E -> C G B E
    expect(drop([48, 52, 55, 59], 2)).toEqual(buildVoicing('Cmaj7/G', '3324xx').midi); // C E G B -> G C E B
    for (const close of [[55, 59, 60, 64], [48, 52, 55, 59]]) expect(sameSet(close.map((m) => m % 12), chordPcs('Cmaj7'))).toBe(true);
    const card = lesson('drop-2-voicings').steps[0];
    if (isGenerated(card) || card.type !== 'card' || card.figure?.kind !== 'keyboard') throw new Error('expected a keyboard card');
    const keys = card.figure.keys.map((k) => (typeof k === 'string' ? k : k.note));
    expect(keys).toEqual(['G3', 'B3', 'C4', 'E4']);
    const dropped = card.figure.keys.find((k) => typeof k !== 'string' && k.role === 'target');
    expect(typeof dropped === 'object' && dropped.note).toBe('C4'); // the second-highest
  });

  it('makes 3x443x by dropping the third-highest note of a close Gmaj7', () => {
    expect(drop([54, 55, 59, 62], 3)).toEqual(buildVoicing('Gmaj7', '3x443x').midi); // F# G B D -> G F# B D
    const card = lesson('drop-3-voicings').steps[0];
    if (isGenerated(card) || card.type !== 'card' || card.figure?.kind !== 'keyboard') throw new Error('expected a keyboard card');
    expect(card.figure.keys.map((k) => (typeof k === 'string' ? k : k.note))).toEqual(['F#3', 'G3', 'B3', 'D4']);
    expect(buildVoicing('Gmaj7', '3x443x').notes.map((n) => n.note)).toEqual(['G', 'F#', 'B', 'D']);
    // G7 and Gm7 lower the 7th, then the 3rd as well.
    expect(buildVoicing('G7', '3x343x').notes.map((n) => n.note)).toEqual(['G', 'F', 'B', 'D']);
    expect(buildVoicing('Gm7', '3x333x').notes.map((n) => n.note)).toEqual(['G', 'F', 'Bb', 'D']);
  });

  it('orders each dropped voicing as the drop rule gives it', () => {
    const orders = ofType<OrderExercise>('order').filter((e) => /Drop/.test(plainText(e.prompt)));
    expect(orders.length).toBe(4);
    for (const e of orders) {
      const closeNotes = tagged(e.prompt, 'note');
      const n = /second-highest/.test(plainText(e.prompt)) ? 2 : 3;
      // Close voicings start at the octave above the dropped note's landing place: G3 or F#3 or B3.
      let midi = 0;
      const close = closeNotes.map((name) => {
        const pc = pcOf(name);
        midi = midi === 0 ? 48 + ((pc - 48) % 12 + 12) % 12 : midi + (((pc - midi) % 12) + 12) % 12 || midi + 12;
        return midi;
      });
      const result = drop(close, n).map((m) => m % 12);
      expect(e.tiles.map((t) => pcOf(tagged(t, 'note')[0])), plainText(e.prompt)).toEqual(result);
    }
  });

  it('sits drop 2 on neighbouring strings and skips the string above a drop-3 bass', () => {
    for (const shape of ['x3545x', '3324xx']) {
      const used = parseFretsLike(shape).map((f, i) => (f === null ? -1 : i)).filter((i) => i >= 0);
      expect(used.length, shape).toBe(4);
      expect(used[3] - used[0], shape).toBe(3);
    }
    for (const shape of ['3x443x', '3x343x', '3x333x']) expect(parseFretsLike(shape)[1], shape).toBeNull();
    const typed = findIn<TypeAnswerExercise>(inLesson('drop-2-voicings'), 'type-answer', /bass/);
    expect(typed.answer.value).toBe(buildVoicing('Cmaj7/G', '3324xx').notes[0].note);
  });
});

function parseFretsLike(shape: string): Array<number | null> {
  return [...shape].map((c) => (c === 'x' ? null : Number(c)));
}

describe('jazz-harmony: turnarounds', () => {
  it('builds each turnaround from its numerals', () => {
    expect(['I', 'vi7', 'ii7', 'V7'].map((r) => romanToChord(r, 'C'))).toEqual(['C', 'Am7', 'Dm7', 'G7']);
    expect(['I', 'VI7', 'ii7', 'V7'].map((r) => romanToChord(r, 'C'))).toEqual(['C', 'A7', 'Dm7', 'G7']);
    expect(['iii7', 'VI7', 'ii7', 'V7'].map((r) => romanToChord(r, 'C'))).toEqual(['Em7', 'A7', 'Dm7', 'G7']);
    expect(['Imaj7', 'VI7', 'ii7', 'V7'].map((r) => romanToChord(r, 'F'))).toEqual(['Fmaj7', 'D7', 'Gm7', 'C7']);
    expect(['Imaj7', 'VI7', 'ii7', 'V7'].map((r) => romanToChord(r, 'G'))).toEqual(['Gmaj7', 'E7', 'Am7', 'D7']);
    for (const e of ofType<FillBlanksExercise>('fill-blanks').filter((x) => /\{r:VI7\}/.test(String(x.prompt)))) {
      const key = keyTonic(e.prompt).split(' ')[0];
      const romans = tagged(e.prompt, 'roman');
      const given = tagged(e.text, 'chord');
      const blank = tagged(e.blanks[0], 'chord')[0];
      const at = String(e.text).split(/\s+/).indexOf('___');
      const filled = [...given.slice(0, at), blank, ...given.slice(at)];
      expect(filled.map(rootOf), plainText(e.prompt)).toEqual(romans.map((r) => rootOf(romanToChord(r, key))));
      expect(blank, plainText(e.prompt)).toBe(romanToChord(romans[at], key));
    }
  });

  it('pulls A7 into Dm7 and starts iii-VI7-ii-V7 on a tonic substitute', () => {
    expect(intervalBetween('A', 'D')).toBe('P4');
    expect(transpose(tone('A7', 'third'), 'm2')).toBe('D'); // C# is the leading tone of D
    const shared = chordNotes('Em7').filter((n) => chordNotes('Cmaj7').includes(n));
    expect(shared).toEqual(['E', 'G', 'B']);
    const match = findIn<MatchPairsExercise>(inLesson('turnarounds'), 'match-pairs', /numeral/);
    for (const p of match.pairs) expect(romanToChord(tagged(p.left, 'roman')[0], 'C')).toBe(tagged(p.right, 'chord')[0]);
    const outside = match.pairs.map((p) => tagged(p.right, 'chord')[0]).filter((c) => chordNotes(c).some((n) => !scaleNotes('C', 'major').includes(n)));
    expect(outside).toEqual(['A7']);
  });
});

describe('jazz-harmony: comping rhythms', () => {
  it('taps one chord per beat, then the "&" of 1 and beat 3', () => {
    const taps = ofType<TapRhythmExercise>('tap-rhythm');
    expect(taps.length).toBe(2);
    const onsets = (pattern: string): number[] => parseRhythm({ pattern }).events.filter((e) => e.attack).map((e) => e.tick / 960);
    expect(onsets(taps[0].rhythm.pattern)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(onsets(taps[1].rhythm.pattern)).toEqual([0.5, 2, 4.5, 6]);
    const card = lesson('comping').steps[4];
    if (isGenerated(card) || card.type !== 'card' || card.figure?.kind !== 'rhythm') throw new Error('expected a rhythm card');
    expect(onsets(card.figure.pattern)).toEqual([0.5, 2]);
    // The first tap needs no click: it still runs with the sound off.
    expect(isListeningStep(taps[0])).toBe(false);
  });

  it('strums on every beat, or on the "&" of 1 and beat 3', () => {
    const beats = (q: { sound: { kind: string } }): number[] => {
      const plan = soundPlan(q.sound as ListenChoiceExercise['sound']);
      return plan.events.map((e) => Math.round((e.at * plan.tempo) / 60 * 2) / 2);
    };
    const card = lesson('comping').steps[1];
    if (isGenerated(card) || card.type !== 'card' || card.figure?.kind !== 'audio') throw new Error('expected an audio card');
    expect(beats(card.figure)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    const [q] = listens(lesson('comping'));
    expect(beats(q)).toEqual([0.5, 2, 4.5, 6]);
    expect(plainText(correctOption(q))).toBe('Syncopated');
  });
});

describe('jazz-harmony: what each listening question plays', () => {
  const chordsOf = (q: ListenChoiceExercise): string[] => {
    if (q.sound.kind !== 'progression') throw new Error('expected a progression');
    return q.sound.chords;
  };

  it('major-two-five-one: a two-five-one in D', () => {
    const [q] = listens(lesson('major-two-five-one'));
    expect(chordsOf(q)).toEqual(['ii7', 'V7', 'Imaj7'].map((r) => romanToChord(r, 'D')));
    expect(plainText(correctOption(q))).toMatch(/^Yes/);
  });

  it('minor-two-five-one: the minor version in A minor; the checkpoint plays the major one', () => {
    const [q] = listens(lesson('minor-two-five-one'));
    expect(chordsOf(q)).toEqual(['Bm7b5', 'E7', 'Am']);
    expect(plainText(correctOption(q))).toBe('Minor');
    const cp = exercises(unit.checkpoint!.steps!).find((e): e is ListenChoiceExercise => e.type === 'listen-choice')!;
    expect(chordsOf(cp)).toEqual(['ii7', 'V7', 'Imaj7'].map((r) => romanToChord(r, 'C')));
    expect(plainText(correctOption(cp))).toBe('Major');
  });

  it('turnarounds: iii-VI7-ii-V7 in C', () => {
    const [q] = listens(lesson('turnarounds'));
    expect(chordsOf(q)).toEqual(['iii7', 'VI7', 'ii7', 'V7'].map((r) => romanToChord(r, 'C')));
    expect(tagged(correctOption(q), 'roman')).toEqual(['iii', 'VI7', 'ii', 'V7']);
  });
});

describe('jazz-harmony: on the go', () => {
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
