/**
 * Unit 18 of the Theory Path, cross-checked against the engines: the four triad formulas and
 * spellings, every three-string shape the text quotes (found independently by searching the neck),
 * the inversion each slash name and shape stands for, every six-string shape, the chords of C major
 * on strings 3-2-1, what each listening question and sound plays, and that every lesson still
 * teaches with the guitar or the sound off.
 */
import { describe, expect, it } from 'vitest';
import { chordNotes, chordPcs, chroma, diatonicChords, getChordType, intervalBetween, parseChord, semitones } from '@/core/theory';
import { buildVoicing, identifyFretted, midiAt } from '@/core/guitar';
import {
  findTargets, formatProblems, isGenerated, plainText, soundPlan, tokenize, validateCourse,
  type ChordBuildExercise, type Exercise, type FillBlanksExercise, type FretboardFindExercise, type Lesson, type ListenChoiceExercise,
  type MatchPairsExercise, type PlayPhraseExercise, type RichText, type Step, type TypeAnswerExercise,
} from '@/lessons';
import { adaptUnit, isListeningStep, MIN_QUIET_EXERCISES } from '@/features/learn/model/conditions';
import { THEORY_GLOSSARY } from '../glossary';
import unit from './triads-and-inversions';

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
const tagged = (text: RichText, type: 'chord' | 'note' | 'degree' | 'roman'): string[] =>
  tokenize(text).flatMap((t) => (t.type === type && 'value' in t ? [String(t.value)] : []));

/**
 * Every text that states something: cards, captions, prompts, explains, facts, right options.
 * Wrong options (and their "why") are left out: they hold shapes that are wrong on purpose.
 */
function claims(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) claims(v, out);
  else if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if ('options' in o && Array.isArray(o.options)) {
      for (const [k, v] of Object.entries(o)) if (k !== 'options') claims(v, out);
      for (const opt of o.options as Array<Record<string, unknown>>) if (opt.correct) claims(opt, out);
    } else for (const v of Object.values(o)) claims(v, out);
  }
  return out;
}

type StringSet = [number, number, number];
type Role = 'root' | 'third' | 'fifth';
const ROLES: Role[] = ['root', 'third', 'fifth'];

/**
 * The close triad shapes of a chord on three strings, found by searching the neck (no library):
 * every fretted (no open string) triple within three frets whose notes are exactly the triad,
 * keyed by the chord tone in the bass, lowest on the neck first.
 */
function searchTriads(symbol: string, strings: StringSet, maxFret = 17): Record<Role, number[][]> {
  const tones = chordNotes(symbol).map((n) => chroma(n));
  const out: Record<Role, number[][]> = { root: [], third: [], fifth: [] };
  for (let a = 1; a <= maxFret; a++)
    for (let b = 1; b <= maxFret; b++)
      for (let c = 1; c <= maxFret; c++) {
        const frets = [a, b, c];
        if (Math.max(...frets) - Math.min(...frets) > 3) continue;
        const pcs = frets.map((f, i) => midiAt({ string: strings[i], fret: f }) % 12);
        if (new Set(pcs).size !== 3 || !pcs.every((p) => tones.includes(p))) continue;
        out[ROLES[tones.indexOf(pcs[0])]].push(frets);
      }
  for (const r of ROLES) out[r].sort((x, y) => Math.min(...x) - Math.min(...y));
  return out;
}
const dash = (frets: number[]): string => frets.join('-');
const lowest = (symbol: string, strings: StringSet): Record<Role, string> => {
  const found = searchTriads(symbol, strings);
  return { root: dash(found.root[0]), third: dash(found.third[0]), fifth: dash(found.fifth[0]) };
};
/** A three-string shape as six frets, low to high, for identifyFretted. */
const six = (strings: StringSet, frets: number[]): Array<number | null> => {
  const out: Array<number | null> = [null, null, null, null, null, null];
  strings.forEach((s, i) => (out[6 - s] = frets[i]));
  return out;
};
const S321: StringSet = [3, 2, 1];
const S432: StringSet = [4, 3, 2];

describe('triads-and-inversions: the unit on its own', () => {
  it('is valid for the lesson engine, with no warnings', () => {
    const problems = validateCourse({ id: 'theory-path', title: 'Theory Path', teacher: 'none', level: 'intermediate', units: [unit], glossary: [...THEORY_GLOSSARY] });
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('starts every fact id with the unit word', () => {
    for (const l of unit.lessons) for (const f of l.facts ?? []) expect(f.id).toMatch(/^triads-/);
  });
});

describe('triads-and-inversions: the four triads', () => {
  it('gives each triad its catalogue formula and thirds', () => {
    expect(getChordType('major')!.degrees).toEqual(['1', '3', '5']);
    expect(getChordType('minor')!.degrees).toEqual(['1', 'b3', '5']);
    expect(getChordType('dim')!.degrees).toEqual(['1', 'b3', 'b5']);
    expect(getChordType('aug')!.degrees).toEqual(['1', '3', '#5']);
    const want: Record<string, string> = { Major: 'major', Minor: 'minor', Diminished: 'dim', Augmented: 'aug' };
    const formulas = ofType<MatchPairsExercise>('match-pairs').filter((e) => /formula/.test(plainText(e.prompt)));
    expect(formulas.length).toBe(2);
    for (const p of formulas.flatMap((e) => e.pairs)) expect(tagged(p.right, 'degree')).toEqual(getChordType(want[plainText(p.left)])!.degrees);
    // The stacked thirds: root to 3rd, then 3rd to 5th, in each of the four.
    const thirds = (symbol: string): string[] => {
      const [r, t, f] = chordNotes(symbol);
      return [intervalBetween(r, t), intervalBetween(t, f)];
    };
    expect(thirds('C')).toEqual(['M3', 'm3']);
    expect(thirds('Cm')).toEqual(['m3', 'M3']);
    expect(thirds('Cdim')).toEqual(['m3', 'm3']);
    expect(thirds('Caug')).toEqual(['M3', 'M3']);
    const stacks = ofType<MatchPairsExercise>('match-pairs').find((e) => /thirds stacked/.test(plainText(e.prompt)))!;
    const words: Record<string, string> = { M3: 'Major 3rd', m3: 'minor 3rd' };
    for (const p of stacks.pairs) {
      const [low, high] = thirds(`C${parseChord(`C${{ Major: '', Minor: 'm', Diminished: 'dim', Augmented: 'aug' }[plainText(p.left)]}`)!.type.symbol}`);
      expect(plainText(p.right).toLowerCase()).toBe(`${words[low]} + ${words[high]}`.toLowerCase());
    }
    // Four and three half steps; a diminished 5th is six, an augmented 5th eight.
    expect([semitones('M3'), semitones('m3'), semitones('d5'), semitones('A5'), semitones('P5')]).toEqual([4, 3, 6, 8, 7]);
  });

  it('spells C diminished and C augmented, and fills the blanks with them', () => {
    expect(chordNotes('Cdim')).toEqual(['C', 'Eb', 'Gb']);
    expect(chordNotes('Caug')).toEqual(['C', 'E', 'G#']);
    expect(chordNotes('Bdim')).toEqual(['B', 'D', 'F']);
    for (const e of ofType<FillBlanksExercise>('fill-blanks')) {
      const symbol = tagged(e.prompt, 'chord')[0];
      const shown = tokenize(e.text).filter((t) => t.type === 'note').map((t) => String((t as { value: string }).value));
      expect([...shown, ...e.blanks.map((b) => tagged(b, 'note')[0])], symbol).toEqual(chordNotes(symbol));
      for (const w of e.bank ?? []) expect(chordNotes(symbol), symbol).not.toContain(tagged(w, 'note')[0]);
      expect(e.spelling).toBe('exact');
    }
    expect(parseChord('C+')!.symbol).toBe('Caug');
    expect(parseChord('C°')!.symbol).toBe('Cdim');
  });

  it('draws the root, the two 3rds and the three 5ths of C on strings 4-3-2', () => {
    const fig = lesson('four-triads').steps[0] as { figure: { dots: Array<{ string: number; fret: number; degree: string }> } };
    const pcOf = (d: { string: number; fret: number }) => midiAt(d) % 12;
    const byDegree = Object.fromEntries(fig.figure.dots.map((d) => [d.degree, pcOf(d)]));
    expect(byDegree).toEqual({ 1: 0, b3: 3, 3: 4, b5: 6, 5: 7, '#5': 8 });
    // The four shapes the syllabus names: C 10-9-8, Cm 10-8-8, Cdim 10-8-7, Caug 10-9-9.
    expect(identifyFretted(six(S432, [10, 9, 8])).symbol).toBe('C');
    expect(identifyFretted(six(S432, [10, 8, 8])).symbol).toBe('Cm');
    expect(identifyFretted(six(S432, [10, 8, 7])).symbol).toBe('Cdim');
    expect(buildVoicing('Caug', six(S432, [10, 9, 9])).chord).toBe('Caug');
  });
});

describe('triads-and-inversions: inversions and slash names', () => {
  const bassRole = (symbol: string): Role => {
    const c = parseChord(symbol)!;
    const notes = chordNotes(c.root + c.type.symbol);
    const bass = c.bass ?? c.root;
    return ROLES[notes.findIndex((n) => chroma(n) === chroma(bass))];
  };
  const name: Record<Role, string> = { root: 'Root position', third: 'First inversion', fifth: 'Second inversion' };

  it('names the open C and its two inversions by their bass', () => {
    expect(identifyFretted('x32010').symbol).toBe('C');
    expect(identifyFretted('032010').symbol).toBe('C/E');
    expect(identifyFretted('332010').symbol).toBe('C/G');
    expect(midiAt({ string: 5, fret: 3 }) % 12).toBe(0); // the bass of open C is C
    expect(midiAt({ string: 6, fret: 3 }) % 12).toBe(7); // string 6, fret 3 is G
  });

  it('answers every inversion question as the bass says', () => {
    expect(bassRole('G/B')).toBe('third');
    expect(bassRole('C/G')).toBe('fifth');
    expect(bassRole('D/F#')).toBe('third');
    const asked = ofType<{ type: 'choice'; prompt: RichText; options: Array<{ text?: RichText; correct?: boolean }> } & Exercise>('choice').filter((e) =>
      /^Which inversion is \{c:[^}]+\}\?$/.test(String(e.prompt)),
    );
    expect(asked.length).toBe(3);
    for (const e of asked) expect(correctText(e), String(e.prompt)).toBe(name[bassRole(tagged(e.prompt, 'chord')[0])]);
    const pairs = ofType<MatchPairsExercise>('match-pairs').filter((e) => /inversion/.test(plainText(e.prompt))).flatMap((e) => e.pairs);
    expect(pairs.length).toBe(3);
    for (const p of pairs) expect(plainText(p.right)).toBe(name[bassRole(tagged(p.left, 'chord')[0])]);
  });

  it('expects the right slash chord in every typed answer', () => {
    const typed = ofType<TypeAnswerExercise>('type-answer');
    expect(typed.length).toBe(2);
    for (const e of typed) {
      if (e.answer.kind !== 'chord') throw new Error('expected a chord answer');
      const [symbol] = tagged(e.prompt, 'chord');
      const role: Role = /first inversion/.test(plainText(e.prompt)) ? 'third' : 'fifth';
      expect(e.answer.value).toBe(`${symbol}/${chordNotes(symbol)[ROLES.indexOf(role)]}`);
    }
  });
});

describe('triads-and-inversions: the shapes on three strings', () => {
  it('finds the G major and G minor shapes the lessons quote on strings 3-2-1, in their order up the neck', () => {
    expect(lowest('G', S321)).toEqual({ third: '4-3-3', fifth: '7-8-7', root: '12-12-10' });
    expect(lowest('Gm', S321)).toEqual({ third: '3-3-3', fifth: '7-8-6', root: '12-11-10' });
    // Up the neck: first inversion, second inversion, root position, then first inversion again 12 frets up.
    const g = searchTriads('G', S321);
    const climb = (['third', 'fifth', 'root'] as Role[]).map((r) => Math.min(...g[r][0]));
    expect(climb).toEqual([...climb].sort((a, b) => a - b));
    expect(g.third.map(dash)).toContain('16-15-15');
    for (const [frets, symbol] of [['4-3-3', 'G/B'], ['7-8-7', 'G/D'], ['12-12-10', 'G'], ['3-3-3', 'Gm/Bb'], ['7-8-6', 'Gm/D'], ['12-11-10', 'Gm']]) {
      expect(identifyFretted(six(S321, frets.split('-').map(Number))).symbol, frets).toBe(symbol);
    }
  });

  it('finds the A, A minor and F shapes it quotes', () => {
    const a = searchTriads('A', S321);
    expect(dash(a.third[0])).toBe('6-5-5');
    expect(dash(a.fifth[0])).toBe('9-10-9');
    expect(identifyFretted(six(S321, [2, 2, 0])).symbol).toBe('A'); // the open-string root position
    expect(dash(searchTriads('Am', S321).fifth[0])).toBe('9-10-8');
    expect(lowest('F', S432)).toEqual({ root: '3-2-1', third: '7-5-6', fifth: '10-10-10' });
    expect(dash(searchTriads('G', S432).root[0])).toBe('5-4-3');
    // C in root position differs on the two sets: the G-B gap moves.
    expect(dash(searchTriads('C', S321).root[0])).toBe('5-5-3');
    expect(dash(searchTriads('C', S432).root[0])).toBe('10-9-8');
    expect(semitones(intervalBetween('G', 'B'))).toBe(4); // strings 3 and 2
    expect(semitones(intervalBetween('D', 'G'))).toBe(5); // strings 4 and 3
    expect(semitones(intervalBetween('B', 'E'))).toBe(5); // strings 2 and 1
  });

  it('turns each major shape minor by moving its 3rd one fret', () => {
    const g = lowest('G', S321);
    const gm = lowest('Gm', S321);
    for (const r of ROLES) {
      const [maj, min] = [g[r], gm[r]].map((s) => s.split('-').map(Number));
      const moved = maj.map((f, i) => f - min[i]);
      expect(moved.filter((d) => d !== 0), r).toEqual([1]);
      const string = S321[moved.findIndex((d) => d === 1)];
      expect(midiAt({ string, fret: maj[moved.indexOf(1)] }) % 12, r).toBe(chroma('B')); // the 3rd of G
    }
    // The match-pairs pair each G shape with its Gm shape.
    const pairs = ofType<MatchPairsExercise>('match-pairs').find((e) => /\{c:Gm\} shape/.test(plainText(e.prompt) + String(e.prompt)))!.pairs;
    for (const p of pairs) {
      const maj = plainText(p.left);
      const role = ROLES.find((r) => g[r] === maj)!;
      expect(plainText(p.right)).toBe(gm[role]);
    }
  });

  it('quotes no three-string shape it has not checked', () => {
    const checked = new Set<string>();
    for (const symbol of ['G', 'Gm', 'A', 'Am', 'F', 'C', 'Cm', 'Cdim', 'Caug', 'Dm', 'Em', 'Bdim']) {
      for (const set of [S321, S432]) for (const r of ROLES) for (const s of searchTriads(symbol, set)[r]) checked.add(dash(s));
    }
    checked.add('2-2-0');
    // "4-3-2" and "3-2-1" also name the string sets ("on 4-3-2"); 4-3-2 is never quoted as frets.
    const quoted = claims(unit)
      .flatMap((t) => [...t.matchAll(/(?<![\d-])\d{1,2}-\d{1,2}-\d{1,2}(?![\d-])/g)].map((m) => m[0]))
      .filter((q) => q !== '4-3-2');
    expect(quoted.length).toBeGreaterThan(40);
    for (const q of quoted) expect(checked.has(q), q).toBe(true);
  });

  it('quotes the right six-string shapes', () => {
    const shapes: Record<string, string> = { x32010: 'C', '032010': 'C/E', '332010': 'C/G', xx3211: 'F', xx5433: 'G' };
    const quoted = claims(unit).flatMap((t) => [...t.matchAll(/(?<![\w-])[x0-9]{6}(?![\w-])/g)].map((m) => m[0]));
    expect(new Set(quoted)).toEqual(new Set(Object.keys(shapes)));
    for (const [shape, symbol] of Object.entries(shapes)) expect(identifyFretted(shape).symbol, shape).toBe(symbol);
    // The small F is the root-position triad 3-2-1 on strings 4-3-2 plus F on string 1.
    expect(midiAt({ string: 1, fret: 1 }) % 12).toBe(chroma('F'));
  });

  it('builds every chord-build shape as the chord it names', () => {
    const builds = ofType<ChordBuildExercise>('chord-build').filter((e) => e.task === 'fingers');
    expect(builds.length).toBeGreaterThanOrEqual(10);
    for (const e of builds) expect(buildVoicing(e.chord, e.frets!).chord, `${e.chord} ${String(e.frets)}`).toBe(e.chord);
  });

  it('asks every fretboard-find for exactly the notes its explanation names', () => {
    const want: Record<string, string[]> = {
      A: ['3:6 C#', '2:5 E', '1:5 A'],
      'B4': ['1:7 B'],
      G: ['4:5 G', '3:4 B', '2:3 D'],
      Am: ['3:14 A', '2:13 C', '1:12 E'],
    };
    const finds = ofType<FretboardFindExercise>('fretboard-find');
    expect(finds.length).toBe(4);
    for (const e of finds) {
      const key = 'chord' in e.find ? e.find.chord : 'note' in e.find ? e.find.note : '';
      expect(findTargets(e).map((t) => `${t.string}:${t.fret} ${t.note}`), key).toEqual(want[key]);
    }
  });
});

describe('triads-and-inversions: the chords of C major on one string set', () => {
  const key = diatonicChords('C major');

  it('climbs the key in root position on strings 3-2-1 from fret 5', () => {
    const climb = key.map((c) => {
      const root = searchTriads(c.symbol, S321).root.find((s) => s[0] >= 5)!;
      return `${c.symbol} ${c.roman} ${dash(root)}`;
    });
    expect(climb).toEqual(['C I 5-5-3', 'Dm ii 7-6-5', 'Em iii 9-8-7', 'F IV 10-10-8', 'G V 12-12-10', 'Am vi 14-13-12', 'Bdim vii° 16-15-13']);
    // The first card's dots: roots on string 3 with their numerals, chords in key order.
    const fig = lesson('the-key-on-one-string-set').steps[0] as { figure: { dots: Array<{ string: number; fret: number; label?: string }> } };
    const roots = fig.figure.dots.filter((d) => d.string === 3);
    expect(roots.map((d) => d.label)).toEqual(key.slice(0, 6).map((c) => c.roman));
    expect(roots.map((d) => midiAt(d) % 12)).toEqual(key.slice(0, 6).map((c) => chroma(c.root)));
    // The top of the climb: C again at 17-17-15.
    expect(searchTriads('C', S321).root.map(dash)).toContain('17-17-15');
  });

  it('plays the triads in key order in the sound and the two phrases', () => {
    const climb = lesson('the-key-on-one-string-set').steps[1] as { figure: { sound: Parameters<typeof soundPlan>[0] } };
    const plucks = soundPlan(climb.figure.sound).events.map((e) => e.midi[0]);
    const groups = Array.from({ length: plucks.length / 3 }, (_u, i) => plucks.slice(i * 3, i * 3 + 3));
    expect(groups.map((g) => key.find((c) => [...c.notes].map(chroma).sort().join() === g.map((m) => m % 12).sort().join())?.symbol)).toEqual(key.map((c) => c.symbol));
    const phrases = exercises(lesson('the-key-on-one-string-set').steps).filter((e): e is PlayPhraseExercise => e.type === 'play-phrase');
    expect(phrases.length).toBe(2);
    const chordsOf = (p: PlayPhraseExercise): string[] =>
      Array.from({ length: p.notes.length / 3 }, (_u, i) => {
        const group = p.notes.slice(i * 3, i * 3 + 3);
        expect(group.map((n) => ('string' in n ? n.string : 0))).toEqual(S321);
        return identifyFretted(six(S321, group.map((n) => ('fret' in n ? n.fret : 0)))).symbol ?? '';
      });
    expect(chordsOf(phrases[0])).toEqual(['C', 'Dm', 'Em']);
    expect(chordsOf(phrases[1])).toEqual(['F', 'G', 'Am']);
    for (const p of phrases) expect(p.notes.length).toBeLessThanOrEqual(16);
  });

  it('answers the key questions', () => {
    expect(identifyFretted(six(S321, [10, 10, 8])).symbol).toBe('F');
    expect(identifyFretted(six(S321, [9, 8, 7])).symbol).toBe('Em');
    expect(key[2].roman).toBe('iii');
    expect(key[3].symbol).toBe('F');
    // C, F and G share one shape, Dm, Em and Am another: same fret differences.
    const shape = (s: string): string => {
      const f = searchTriads(s, S321).root.find((x) => x[0] >= 5)!;
      return f.map((x) => x - f[0]).join();
    };
    expect(new Set(['C', 'F', 'G'].map(shape)).size).toBe(1);
    expect(new Set(['Dm', 'Em', 'Am'].map(shape)).size).toBe(1);
    expect(shape('C')).not.toBe(shape('Dm'));
    expect(shape('Bdim')).not.toBe(shape('C'));
    expect(shape('Bdim')).not.toBe(shape('Dm'));
    // The wrong order tiles need notes outside the key.
    expect(chordNotes('D')).toContain('F#');
    expect(chordNotes('E')).toContain('G#');
  });
});

describe('triads-and-inversions: what each listening question and sound plays', () => {
  const pcs = (midi: number[]): number[] => [...new Set(midi.map((m) => m % 12))].sort((a, b) => a - b);
  const sorted = (symbol: string): number[] => [...chordPcs(symbol)].sort((a, b) => a - b);

  it('four-triads: the four triads, then C augmented', () => {
    const card = lesson('four-triads').steps[1] as { figure: { sound: Parameters<typeof soundPlan>[0] } };
    expect(soundPlan(card.figure.sound).events.map((e) => pcs(e.midi))).toEqual(['C', 'Cm', 'Cdim', 'Caug'].map(sorted));
    const [q] = listens(lesson('four-triads'));
    expect(pcs(soundPlan(q.sound).events.flatMap((e) => e.midi))).toEqual(sorted('Caug'));
    expect(correctText(q)).toBe('Augmented');
  });

  it('triad-inversions: C/E (E in the bass) then C (C in the bass)', () => {
    const [q] = listens(lesson('triad-inversions'));
    const [first, second] = soundPlan(q.sound).events;
    expect(Math.min(...first.midi) % 12).toBe(chroma('E'));
    expect(Math.min(...second.midi) % 12).toBe(chroma('C'));
    expect(pcs(first.midi)).toEqual(sorted('C'));
    expect(pcs(second.midi)).toEqual(sorted('C'));
    expect(correctText(q)).toBe('The second');
  });

  it('minor-triads: G then Gm on the card, Gm in the question', () => {
    const card = lesson('minor-triads-strings-3-2-1').steps.find((s) => !isGenerated(s) && s.type === 'card' && s.figure?.kind === 'tab') as { figure: { notes: Array<{ string: number; fret: number }> } };
    const midi = card.figure.notes.map((n) => midiAt(n));
    expect(pcs(midi.slice(0, 3))).toEqual(sorted('G'));
    expect(pcs(midi.slice(3))).toEqual(sorted('Gm'));
    const [q] = listens(lesson('minor-triads-strings-3-2-1'));
    expect(pcs(soundPlan(q.sound).events.flatMap((e) => e.midi))).toEqual(sorted('Gm'));
    expect(correctText(q)).toBe('Minor');
  });

  it('major-triads: the three G shapes, each one G', () => {
    const card = lesson('major-triads-strings-3-2-1').steps.find((s) => !isGenerated(s) && s.type === 'card' && s.figure?.kind === 'tab') as { figure: { notes: Array<{ string: number; fret: number }> } };
    const midi = card.figure.notes.map((n) => midiAt(n));
    for (let i = 0; i < 9; i += 3) expect(pcs(midi.slice(i, i + 3))).toEqual(sorted('G'));
  });
});

describe('triads-and-inversions: on the go', () => {
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
