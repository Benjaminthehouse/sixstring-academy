/**
 * Unit 20 of the Theory Path, cross-checked against the engines: the two pentatonic formulas and
 * every relative pair (`getScale`, `scalePcs`, `transpose`), the five boxes of A minor pentatonic
 * with their fingering, roots and starting notes (`scalePatterns`), every fret list a fact quotes,
 * how the boxes overlap and repeat, the major pentatonic in the same shapes, every bend and its
 * target (`midiAt`), every phrase and what each listening question plays.
 */
import { describe, expect, it } from 'vitest';
import { midiAt, noteAt, positionsForPitchClass, scalePatterns } from '@/core/guitar';
import { degreeInScale, getScale, noteToMidi, pcName, scaleNotes, scalePcs, transpose } from '@/core/theory';
import {
  estimateLessonSeconds, findTargets, formatProblems, plainText, resolveFigure, soundPlan, validateCourse,
  type CardStep, type ChoiceExercise, type Exercise, type FillBlanksExercise, type FretboardFigure, type FretboardFindExercise,
  type FretboardNameExercise, type Lesson, type ListenChoiceExercise, type MatchPairsExercise, type OrderExercise, type PlayNoteExercise, type PlayPhraseExercise,
  type Step, type TabFigure, type TabNote, type TypeAnswerExercise,
} from '@/lessons';
import { assembleTheory } from '../index';
import unit, { BOX_1, BOX_2, BOX_3, BOX_4, BOX_4_OPEN, BOX_5, BOX_5_LOW, FINGERS_2, FINGERS_3, FINGERS_4, OVER_A_DRONE, OVER_C_DRONE, TRAVEL_PHRASE } from './pentatonic-boxes';

type Pos = { string: number; fret: number };
type Spot = readonly [number, number, string];

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
const sorted = (list: ReadonlyArray<Pos>): string[] => list.map(key).sort();
const spots = (box: readonly Spot[]): Pos[] => box.map(([string, fret]) => ({ string, fret }));
const played = (notes: TabNote[]): Pos[] => notes.flatMap((n) => ('rest' in n ? [] : [{ string: n.string, fret: n.fret }]));
const nameAt = (p: Pos): string => pcName(noteAt(p, { context: { tonic: 'A', scale: 'minor-pentatonic' } }));
const finds = (pred: (e: FretboardFindExercise) => boolean): FretboardFindExercise[] =>
  everyExercise().filter((e): e is FretboardFindExercise => e.type === 'fretboard-find' && pred(e));
const sameFrets = (e: FretboardFindExercise, lo: number, hi: number): boolean => e.frets[0] === lo && e.frets[1] === hi;

const UP = scalePatterns('A', 'minor-pentatonic', { upTheNeck: true });
const LOW = scalePatterns('A', 'minor-pentatonic');
const BOXES = [BOX_1, BOX_2, BOX_3, BOX_4, BOX_5];
const FINGERS: Record<number, readonly number[]> = { 1: FINGERS_2, 2: FINGERS_3, 3: FINGERS_4 };

/** This unit alone, as the registry assembles it; prerequisites outside it are theory.test.ts's to check. */
function unitCourse() {
  const course = assembleTheory([unit]).course;
  const ids = new Set(unit.lessons.map((l) => l.id));
  const units = course.units
    .filter((u) => u.id === unit.id)
    .map((u) => ({ ...u, lessons: u.lessons.map((l) => ({ ...l, requires: (l.requires ?? []).filter((r) => ids.has(r)) })) }));
  return { ...course, units };
}

/** "String 6 frets 8, 10; strings 4 and 3 frets 12, 14; ..." as string -> frets. */
function fretList(text: string): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (const part of text.replace(/\.$/, '').split(';')) {
    const m = /strings? ([\d ,and]+?) frets? ([\d, ]+)$/i.exec(part.trim());
    if (!m) throw new Error(`cannot read "${part}"`);
    const frets = m[2].split(/[ ,]+/).filter(Boolean).map(Number);
    for (const s of m[1].match(/\d/g)!.map(Number)) out.set(s, frets);
  }
  return out;
}
/** Every "frets 8 and 10 on strings 6, 2 and 1" or "string 3 uses 9 and 12" in a text, as string -> frets. */
function pairClaims(text: string): Map<number, number[]> {
  const out = new Map<number, number[]>();
  const list = (s: string): number[] => s.match(/\d+/g)!.map(Number);
  for (const m of text.matchAll(/(\d+) and (\d+) on strings? (\d+(?:(?:, | and )\d+)*)/gi)) for (const s of list(m[3])) out.set(s, [Number(m[1]), Number(m[2])]);
  for (const m of text.matchAll(/strings? (\d+(?:(?:, | and )\d+)*) uses? (?:frets )?(\d+) and (\d+)/gi)) for (const s of list(m[1])) out.set(s, [Number(m[2]), Number(m[3])]);
  for (const m of text.matchAll(/strings? (\d) at (?:frets )?(\d+) and (\d+)/gi)) out.set(Number(m[1]), [Number(m[2]), Number(m[3])]);
  return new Map([...out].sort((a, b) => b[0] - a[0]));
}
const byString = (box: readonly Spot[]): Map<number, number[]> => {
  const out = new Map<number, number[]>();
  for (const [s, f] of box) out.set(s, [...(out.get(s) ?? []), f]);
  return out;
};

describe('pentatonic-boxes: the engine accepts the unit on its own', () => {
  it('has no errors and no warnings', () => {
    const problems = validateCourse(unitCourse());
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('starts every fact id with "boxes-" and keeps each lesson near its planned minutes', () => {
    for (const l of unit.lessons) {
      for (const f of l.facts ?? []) expect(f.id).toMatch(/^boxes-/);
      expect(Math.abs(estimateLessonSeconds(l) / 60 - l.minutes), l.id).toBeLessThanOrEqual(1.5);
    }
  });
});

describe('pentatonic-boxes: the two formulas and the relative pairs', () => {
  it('minor pentatonic is 1 b3 4 5 b7: natural minor without 2 and b6', () => {
    const minor = getScale('minor-pentatonic')!.degrees;
    expect(minor).toEqual(['1', 'b3', '4', '5', 'b7']);
    expect(getScale('minor')!.degrees.filter((d) => !minor.includes(d))).toEqual(['2', 'b6']);
    const q = exercises(lesson('pentatonic-formulas')).find((e): e is ChoiceExercise => e.type === 'choice' && /natural minor/.test(plainText(e.prompt)))!;
    expect(correctText(q)).toBe('2 and ♭6');
  });

  it('major pentatonic is 1 2 3 5 6: the major scale without 4 and 7', () => {
    const major = getScale('major-pentatonic')!.degrees;
    expect(major).toEqual(['1', '2', '3', '5', '6']);
    expect(getScale('major')!.degrees.filter((d) => !major.includes(d))).toEqual(['4', '7']);
    const q = exercises(lesson('pentatonic-formulas')).find((e): e is ChoiceExercise => e.type === 'choice' && /major scale/.test(plainText(e.prompt)))!;
    expect(correctText(q)).toBe('4 and 7');
  });

  it('every formula fill-in fills to the formula, and no bank word belongs in it', () => {
    const fills = everyExercise().filter((e): e is FillBlanksExercise => e.type === 'fill-blanks');
    expect(fills.length).toBe(5);
    for (const f of fills) {
      const scale = /major/.test(plainText(f.prompt)) ? 'major-pentatonic' : 'minor-pentatonic';
      const degrees = getScale(scale)!.degrees;
      const tokens = [...String(f.text).matchAll(/\{d:([^}]+)\}|___/g)].map((m) => m[1] ?? '___');
      let b = 0;
      const filled = tokens.map((t) => (t === '___' ? /\{d:([^}]+)\}/.exec(f.blanks[b++])![1] : t));
      expect(filled, String(f.prompt)).toEqual(degrees);
      for (const w of f.bank ?? []) expect(degrees).not.toContain(/\{d:([^}]+)\}/.exec(w)![1]);
    }
  });

  it('each minor pentatonic shares its notes with the major pentatonic a minor third above', () => {
    for (const [minor, major] of [['A', 'C'], ['E', 'G'], ['D', 'F'], ['B', 'D']]) {
      expect(transpose(minor, 'm3')).toBe(major);
      expect([...scalePcs(minor, 'minor-pentatonic')].sort()).toEqual([...scalePcs(major, 'major-pentatonic')].sort());
    }
    expect(scaleNotes('D', 'minor-pentatonic')).toEqual(['D', 'F', 'G', 'A', 'C']);
    expect(scaleNotes('F', 'major-pentatonic')).toEqual(['F', 'G', 'A', 'C', 'D']);
    expect(scaleNotes('G', 'major-pentatonic')).toEqual(['G', 'A', 'B', 'D', 'E']);
    expect(scaleNotes('D', 'major-pentatonic')).toEqual(['D', 'E', 'F#', 'A', 'B']);
    // Every "which major/minor pentatonic has the same notes" question picks the relative, and only it.
    const pairs = everyExercise().filter((e): e is ChoiceExercise => e.type === 'choice' && /(same notes as|uses the boxes of)/.test(plainText(e.prompt)));
    expect(pairs.length).toBe(6);
    for (const q of pairs) {
      const asked = /\{n:([A-G][#b]?)\} (major|minor) pentatonic/.exec(String(q.prompt))!;
      const scale = asked[2] === 'minor' ? 'minor-pentatonic' : 'major-pentatonic';
      const other = asked[2] === 'minor' ? 'major-pentatonic' : 'minor-pentatonic';
      const want = [...scalePcs(asked[1], scale)].sort().join();
      for (const o of q.options) {
        const tonic = /\{n:([A-G][#b]?)\}/.exec(String(o.text))![1];
        expect([...scalePcs(tonic, other)].sort().join() === want, `${plainText(q.prompt)} ${plainText(o.text!)}`).toBe(!!o.correct);
      }
    }
  });

  it('the typed answer is E minor pentatonic, and the box pictures label the right degrees', () => {
    const typed = exercises(lesson('pentatonic-formulas')).find((e): e is TypeAnswerExercise => e.type === 'type-answer')!;
    expect(typed.answer.kind === 'text' && typed.answer.value).toBe(scaleNotes('E', 'minor-pentatonic').join(' '));
    const [inA, inC] = cards(lesson('pentatonic-formulas')).map((c) => c.figure as FretboardFigure);
    for (const [fig, tonic, scale] of [[inA, 'A', 'minor-pentatonic'], [inC, 'C', 'major-pentatonic']] as const) {
      expect(sorted(fig.dots!)).toEqual(sorted(spots(BOX_1)));
      for (const d of fig.dots!) expect(d.degree).toBe(degreeInScale(tonic, scale, d.note!));
    }
  });
});

describe('pentatonic-boxes: the five boxes', () => {
  it('are the engine boxes of A minor pentatonic, note for note, in playing order', () => {
    expect(UP.map((p) => p.id)).toEqual(['box-1', 'box-2', 'box-3', 'box-4', 'box-5']);
    BOXES.forEach((box, i) => {
      expect(box.map(([s, f, n]) => `${s}:${f}${n}`), `box ${i + 1}`).toEqual(UP[i].notes.map((n) => `${n.string}:${n.fret}${n.note}`));
      for (const [s, f, n] of box) expect(nameAt({ string: s, fret: f })).toBe(n);
      const midi = UP[i].notes.map((n) => n.midi);
      for (let k = 1; k < midi.length; k++) expect(midi[k]).toBeGreaterThan(midi[k - 1]);
    });
  });

  it('use the engine fingering where the lessons show fingers', () => {
    for (const [i, fingers] of Object.entries(FINGERS)) expect([...fingers], `box ${Number(i) + 1}`).toEqual(UP[Number(i)].notes.map((n) => n.finger));
  });

  it('twelve frets lower, box 4 is in open position and box 5 at frets 2 to 5', () => {
    expect(BOX_4_OPEN.map(([s, f]) => `${s}:${f}`)).toEqual(LOW[3].notes.map((n) => `${n.string}:${n.fret}`));
    expect(BOX_5_LOW.map(([s, f]) => `${s}:${f}`)).toEqual(LOW[4].notes.map((n) => `${n.string}:${n.fret}`));
    expect([LOW[3].minFret, LOW[3].maxFret]).toEqual([0, 3]);
    expect([LOW[4].minFret, LOW[4].maxFret]).toEqual([2, 5]);
  });

  it('each starts on string 6 on the next note of the scale: A C D E G at frets 5 8 10 12 15', () => {
    expect(BOXES.map((b) => b[0][2])).toEqual(scaleNotes('A', 'minor-pentatonic'));
    expect(BOXES.map((b) => b[0][1])).toEqual([5, 8, 10, 12, 15]);
    expect(BOXES.every((b) => b[0][0] === 6)).toBe(true);
    const starts = everyExercise().filter((e): e is MatchPairsExercise => e.type === 'match-pairs' && /first note/.test(plainText(e.prompt)));
    expect(starts.length).toBe(3);
    for (const m of starts) {
      for (const p of m.pairs) {
        const box = BOXES[Number(/Box (\d)/.exec(plainText(p.left))![1]) - 1];
        expect(/\{n:([A-G])\}/.exec(String(p.right))![1]).toBe(box[0][2]);
        const fret = /fret (\d+)/.exec(plainText(p.right));
        if (fret) expect(Number(fret[1])).toBe(box[0][1]);
      }
    }
  });

  it('has its roots where the lessons say', () => {
    const roots = UP.map((p) => sorted(p.roots));
    expect(roots[1]).toEqual(sorted([{ string: 4, fret: 7 }, { string: 2, fret: 10 }]));
    // Box 3's two roots are an octave apart: three strings higher, two frets back.
    expect(midiAt({ string: 2, fret: 10 }) - midiAt({ string: 5, fret: 12 })).toBe(12);
    expect(roots[2]).toEqual(sorted([{ string: 5, fret: 12 }, { string: 2, fret: 10 }]));
    expect(roots[3]).toEqual(sorted([{ string: 5, fret: 12 }, { string: 3, fret: 14 }]));
    expect(roots[4]).toEqual(sorted([{ string: 6, fret: 17 }, { string: 3, fret: 14 }, { string: 1, fret: 17 }]));
    const rootFinds = finds((e) => 'note' in e.find && e.find.note === 'A');
    expect(rootFinds.length).toBe(3);
    for (const f of rootFinds) {
      const box = sameFrets(f, 7, 10) ? 1 : sameFrets(f, 9, 13) ? 2 : -1;
      expect(sorted(findTargets(f))).toEqual(roots[box]);
    }
  });

  it('every fret list a fact or card quotes is the box', () => {
    const facts = new Map(unit.lessons.flatMap((l) => l.facts ?? []).map((f) => [f.id, plainText(f.back)]));
    const quoted: Array<[string, readonly Spot[]]> = [['boxes-box-2-frets', BOX_2], ['boxes-box-3-frets', BOX_3], ['boxes-box-4-frets', BOX_4], ['boxes-box-5-frets', BOX_5]];
    for (const [id, box] of quoted) expect(fretList(facts.get(id)!), id).toEqual(byString(box));
    // The syllabus quotes the same lists.
    expect(fretList('String 6 frets 8, 10; string 5 frets 7, 10; string 4 frets 7, 10; string 3 frets 7, 9; string 2 frets 8, 10; string 1 frets 8, 10')).toEqual(byString(BOX_2));
    // The cards and the find explanations word it as pairs ("frets 8 and 10 on strings 6, 2 and 1"):
    // read every pair back and require the whole box, all six strings.
    const cardsOf: Array<[string, number, readonly Spot[]]> = [['box-2', 1, BOX_2], ['box-3', 1, BOX_3], ['boxes-4-and-5', 0, BOX_4], ['boxes-4-and-5', 1, BOX_5]];
    for (const [id, i, box] of cardsOf) expect(pairClaims(plainText(cards(lesson(id))[i].body)), `${id} card ${i + 1}`).toEqual(byString(box));
    const wanted: Array<[number, number, readonly Spot[]]> = [[7, 10, BOX_2], [9, 13, BOX_3], [12, 15, BOX_4], [14, 17, BOX_5], [0, 3, BOX_4_OPEN], [2, 5, BOX_5_LOW]];
    let checked = 0;
    for (const f of finds((e) => 'scale' in e.find)) {
      const box = wanted.find(([lo, hi]) => sameFrets(f, lo, hi));
      if (!box) continue;
      expect(pairClaims(plainText(f.explain)), plainText(f.prompt)).toEqual(byString(box[2]));
      checked++;
    }
    expect(checked).toBe(10);
    // Open-position box 4 has five open strings: open string 2 (B) is not in the scale.
    expect(BOX_4_OPEN.filter(([, f]) => f === 0).map(([s]) => s)).toEqual([6, 5, 4, 3, 1]);
    expect(nameAt({ string: 2, fret: 0 })).toBe('B');
    expect(scaleNotes('A', 'minor-pentatonic')).not.toContain('B');
  });

  it('every "tap every note of box N" asks for exactly that box', () => {
    const wanted: Array<[number, number, readonly Spot[]]> = [[7, 10, BOX_2], [9, 13, BOX_3], [12, 15, BOX_4], [14, 17, BOX_5], [0, 3, BOX_4_OPEN], [2, 5, BOX_5_LOW]];
    const scaleFinds = finds((e) => 'scale' in e.find && !sameFrets(e, 11, 13));
    expect(scaleFinds.length).toBe(10);
    for (const f of scaleFinds) {
      const box = wanted.find(([lo, hi]) => sameFrets(f, lo, hi));
      expect(box, plainText(f.prompt)).toBeDefined();
      expect(sorted(findTargets(f)), plainText(f.prompt)).toEqual(sorted(spots(box![2])));
      expect(findTargets(f)).toHaveLength(12);
    }
  });

  it('box 3 is the only five-fret box; the others fit in four', () => {
    expect(UP.map((p) => p.maxFret - p.minFret + 1)).toEqual([4, 4, 5, 4, 4]);
    expect([UP[2].minFret, UP[2].maxFret]).toEqual([9, 13]);
    const q = exercises(lesson('box-3')).find((e): e is ChoiceExercise => e.type === 'choice')!;
    expect(correctText(q)).toBe('Five: frets 9 to 13');
    // The hand shifts for string 3 and back for string 2, as the card says.
    expect(UP[2].notes.filter((n) => n.shift).map((n) => key(n))).toEqual(['3:9', '2:10']);
  });

  it('names string 3 fret 9 as E', () => {
    const q = exercises(lesson('box-3')).find((e): e is FretboardNameExercise => e.type === 'fretboard-name')!;
    expect(nameAt(q.position)).toBe('E');
    expect(BOX_3.some(([s, f]) => s === q.position.string && f === q.position.fret)).toBe(true);
  });
});

describe('pentatonic-boxes: how the boxes link and repeat', () => {
  const top = (box: readonly Spot[], s: number) => Math.max(...box.filter(([bs]) => bs === s).map(([, f]) => f));
  const bottom = (box: readonly Spot[], s: number) => Math.min(...box.filter(([bs]) => bs === s).map(([, f]) => f));

  it('the top note of each box on every string is the bottom note of the next, and box 5 hands over to box 1 twelve frets up', () => {
    const next = [BOX_2, BOX_3, BOX_4, BOX_5, BOX_1.map(([s, f, n]) => [s, f + 12, n] as const)];
    BOXES.forEach((box, i) => {
      for (let s = 1; s <= 6; s++) expect(top(box, s), `box ${i + 1}, string ${s}`).toBe(bottom(next[i], s));
    });
    for (let s = 1; s <= 6; s++) expect(top(BOX_5_LOW, s)).toBe(bottom(BOX_1, s));
  });

  it('the shared notes of boxes 3 and 4 are the six the lesson asks for, between frets 11 and 13', () => {
    const shared = BOX_3.filter(([s, f]) => BOX_4.some(([s4, f4]) => s4 === s && f4 === f));
    expect(sorted(spots(shared))).toEqual(sorted([6, 5, 4, 3, 1].map((string) => ({ string, fret: 12 })).concat([{ string: 2, fret: 13 }])));
    const shareFinds = finds((e) => sameFrets(e, 11, 13));
    expect(shareFinds.length).toBe(3);
    for (const f of shareFinds) expect(sorted(findTargets(f))).toEqual(sorted(spots(shared)));
    // Fret 11 holds no note of the scale on any string.
    for (let s = 1; s <= 6; s++) expect(scalePcs('A', 'minor-pentatonic')).not.toContain(midiAt({ string: s, fret: 11 }) % 12);
  });

  it('the box-1 overlap picture dims box 1, rings the shared notes and marks the roots of box 2', () => {
    const fig = cards(lesson('box-2'))[0].figure as FretboardFigure;
    const has = (box: readonly Spot[], p: Pos) => box.some(([s, f]) => s === p.string && f === p.fret);
    expect(sorted(fig.dots!)).toEqual(sorted([...spots(BOX_1), ...spots(BOX_2)].filter((p, i, a) => a.findIndex((q) => key(q) === key(p)) === i)));
    for (const d of fig.dots!) {
      const role = !has(BOX_2, d) ? 'ghost' : d.note === 'A' ? 'root' : has(BOX_1, d) ? 'target' : 'tone';
      expect(d.role, key(d)).toBe(role);
    }
  });

  it('the derived pictures draw the five boxes end to end, and boxes 4 and 5 low on the neck', () => {
    const all = resolveFigure(cards(lesson('connecting-the-boxes'))[0].figure as FretboardFigure);
    const union = (boxes: ReadonlyArray<readonly Spot[]>) => [...new Set(boxes.flatMap((b) => spots(b).map(key)))].sort();
    expect(all.dots.map(key).sort()).toEqual(union(BOXES));
    const low = resolveFigure(cards(lesson('boxes-4-and-5'))[2].figure as FretboardFigure);
    expect(low.dots.map(key).sort()).toEqual(union([BOX_4_OPEN, BOX_5_LOW]));
  });

  it('the order questions follow the cycle, and box 1 comes back at fret 17', () => {
    const orders = everyExercise().filter((e): e is OrderExercise => e.type === 'order' && /climb the neck/.test(plainText(e.prompt)));
    expect(orders.length).toBe(3);
    const cycle = ['Box 1', 'Box 2', 'Box 3', 'Box 4', 'Box 5'];
    for (const o of orders) {
      const start = cycle.indexOf(plainText(o.tiles[0]));
      expect(o.tiles.map((t) => plainText(t))).toEqual(o.tiles.map((_t, i) => cycle[(start + i) % 5]));
    }
    expect(BOX_1[0][1] + 12).toBe(17);
    expect(nameAt({ string: 6, fret: 17 })).toBe('A');
    // Box 2 an octave up still fits on a 22-fret neck.
    expect(Math.max(...BOX_2.map(([, f]) => f + 12))).toBe(22);
  });

  it('the travelling phrase slides up string 3 from box 1 into box 2 and on into box 3, ending on the root', () => {
    const notes = played(TRAVEL_PHRASE);
    const onThree = notes.filter((n) => n.string === 3).map((n) => n.fret);
    expect(onThree).toEqual([5, 7, 9, 12]);
    const has = (box: readonly Spot[], p: Pos) => box.some(([s, f]) => s === p.string && f === p.fret);
    expect(has(BOX_1, { string: 3, fret: 7 }) && !has(BOX_2, { string: 3, fret: 5 })).toBe(true);
    expect(has(BOX_2, { string: 3, fret: 9 }) && !has(BOX_1, { string: 3, fret: 9 })).toBe(true);
    expect(has(BOX_3, { string: 3, fret: 12 }) && !has(BOX_2, { string: 3, fret: 12 })).toBe(true);
    for (const n of notes) expect(BOXES.some((b) => has(b, n)), key(n)).toBe(true);
    expect(nameAt(notes[notes.length - 1])).toBe('A');
    const beats: Record<string, number> = { e: 0.5, q: 1, h: 2 };
    expect(TRAVEL_PHRASE.reduce((sum, n) => sum + beats[n.duration], 0)).toBe(4);
    const l = lesson('connecting-the-boxes');
    expect((cards(l)[2].figure as TabFigure).notes).toEqual(TRAVEL_PHRASE);
    const play = exercises(l).find((e): e is PlayPhraseExercise => e.type === 'play-phrase')!;
    expect(play.notes).toEqual(TRAVEL_PHRASE);
    expect(sorted(findTargets(play.alternative as FretboardFindExercise))).toEqual(['3:9']);
  });
});

describe('pentatonic-boxes: playing the boxes', () => {
  it('each box is played in two halves that climb it note for note, and each tapping version lists its half in order', () => {
    const plays: Array<[string, readonly Spot[]]> = [['box-2', BOX_2], ['box-3', BOX_3], ['boxes-4-and-5', BOX_5_LOW]];
    for (const [id, box] of plays) {
      const halves = exercises(lesson(id)).filter((e): e is PlayPhraseExercise => e.type === 'play-phrase');
      expect(halves.length, id).toBe(2);
      expect(halves.flatMap((h) => played(h.notes).map(key)), id).toEqual(spots(box).map(key));
      halves.forEach((h, i) => {
        const alt = h.alternative as OrderExercise;
        expect(alt.tiles.map((t) => plainText(t)), id).toEqual(box.slice(i * 6, i * 6 + 6).map(([s, f]) => `String ${s} fret ${f}`));
        expect(pairClaims(plainText(alt.explain)), id).toEqual(byString(box.slice(i * 6, i * 6 + 6)));
      });
    }
  });

  it('no play-phrase holds more than six notes (what a phone shows without scrolling sideways)', () => {
    const phrases = everyExercise().filter((e): e is PlayPhraseExercise => e.type === 'play-phrase');
    expect(phrases.length).toBe(7);
    for (const p of phrases) expect(played(p.notes).length, plainText(p.prompt)).toBeLessThanOrEqual(6);
  });
});

describe('pentatonic-boxes: the major pentatonic in the same boxes', () => {
  it('box 1 of C major pentatonic (root on string 6 at fret 8) is box 2 of A minor, and its Cs are the roots', () => {
    const cBox = scalePatterns('C', 'major-pentatonic')[0];
    expect(cBox.notes.map((n) => key(n))).toEqual(spots(BOX_2).map(key));
    expect(key(cBox.notes[0])).toBe('6:8');
    expect(sorted(cBox.roots)).toEqual(['1:8', '4:10', '6:8']);
    const cFind = finds((e) => 'note' in e.find && e.find.note === 'C')[0];
    expect(sorted(findTargets(cFind))).toEqual(sorted(cBox.roots));
    const fig = cards(lesson('major-pentatonic-boxes'))[0].figure as FretboardFigure;
    for (const d of fig.dots!) expect(d.degree).toBe(degreeInScale('C', 'major-pentatonic', d.note!));
  });

  it('box 1 of G major pentatonic is box 2 of E minor pentatonic, at frets 2 to 5', () => {
    const g = scalePatterns('G', 'major-pentatonic')[0];
    const e = scalePatterns('E', 'minor-pentatonic')[1];
    expect(g.notes.map((n) => key(n))).toEqual(e.notes.map((n) => key(n)));
    expect([g.minFret, g.maxFret]).toEqual([2, 5]);
    const fig = resolveFigure(cards(lesson('major-pentatonic-boxes'))[1].figure as FretboardFigure);
    expect(fig.dots.map(key).sort()).toEqual(sorted(g.notes));
    expect(midiAt({ string: 6, fret: 3 }) % 12).toBe(7); // the root G at fret 3
  });

  it('the drones: the same box over A, then over C; the second is the major one', () => {
    const q = exercises(lesson('major-pentatonic-boxes')).find((e): e is ListenChoiceExercise => e.type === 'listen-choice')!;
    expect(q.sound.kind === 'tab' && q.sound.notes).toEqual([...OVER_A_DRONE, { rest: true, duration: 'h' }, ...OVER_C_DRONE]);
    for (const [line, drone] of [[OVER_A_DRONE, 45], [OVER_C_DRONE, 48]] as const) {
      const midi = played(line).map((p) => midiAt(p));
      expect(midi.filter((_m, i) => i % 2 === 0).every((m) => m === drone)).toBe(true);
      const melody = played(line).filter((_p, i) => i % 2 === 1);
      for (const p of melody) expect(BOX_2.some(([s, f]) => s === p.string && f === p.fret)).toBe(true);
      // The line runs root to root over its drone.
      expect(midiAt(melody[0]) % 12).toBe(drone % 12);
      expect(midiAt(melody[melody.length - 1]) % 12).toBe(drone % 12);
    }
    expect(key(played(OVER_C_DRONE)[0])).toBe('6:8'); // the C drone is the box's own lowest note
    expect(correctText(q)).toBe('The second');
    const plan = soundPlan(q.sound).events.flatMap((e) => e.midi);
    expect(plan.length).toBe(24);
  });
});

describe('pentatonic-boxes: bends that land', () => {
  const bends = lesson('bends-that-land');

  it('string 3 fret 7 (D) bent a whole step is E, the pitch of fret 9; string 2 fret 8 (G) bent is A, the pitch of fret 10', () => {
    expect(midiAt({ string: 3, fret: 7 }) + 2).toBe(midiAt({ string: 3, fret: 9 }));
    expect(midiAt({ string: 3, fret: 9 })).toBe(noteToMidi('E4'));
    expect(midiAt({ string: 2, fret: 8 }) + 2).toBe(midiAt({ string: 2, fret: 10 }));
    expect(midiAt({ string: 2, fret: 10 })).toBe(noteToMidi('A4'));
    expect([nameAt({ string: 3, fret: 7 }), nameAt({ string: 2, fret: 8 })]).toEqual(['D', 'G']);
    expect(degreeInScale('A', 'minor-pentatonic', 'E')).toBe('5');
    expect(degreeInScale('A', 'minor-pentatonic', 'G')).toBe('b7');
    // Both bends start inside box 1.
    for (const [s, f] of [[3, 7], [2, 8]]) expect(BOX_1.some(([bs, bf]) => bs === s && bf === f)).toBe(true);
  });

  it('the play step listens for E4 and its tapping version, and the string 2 find, want the fretted targets', () => {
    const play = exercises(bends).find((e): e is PlayNoteExercise => e.type === 'play-note')!;
    expect(play.note).toBe('E4');
    expect(sorted(findTargets(play.alternative as FretboardFindExercise))).toEqual(['3:9']);
    for (const f of finds((e) => 'note' in e.find && e.find.note === 'A4')) expect(sorted(findTargets(f))).toEqual(['2:10']);
  });

  it('the listening question plays the target, then a bend a half step flat', () => {
    const q = exercises(bends).find((e): e is ListenChoiceExercise => e.type === 'listen-choice')!;
    const [target, bend] = soundPlan(q.sound).events.flatMap((e) => e.midi);
    expect(target).toBe(64);
    expect(target - bend).toBe(1);
    expect(correctText(q)).toMatch(/^Flat/);
  });

  it('the whole-step bend choices land on scale notes exactly when they are marked right', () => {
    const pcs = new Set(scalePcs('A', 'minor-pentatonic'));
    const q = exercises(bends).find((e): e is ChoiceExercise => e.type === 'choice' && /lands on a note of the scale/.test(plainText(e.prompt)))!;
    for (const o of q.options) {
      const [from, to] = [...String(o.text).matchAll(/\{n:([A-G][#b]?)\}/g)].map((m) => noteToMidi(m[1]) % 12);
      expect((to - from + 12) % 12).toBe(2);
      expect(pcs.has(to), plainText(o.text!)).toBe(!!o.correct);
    }
    // "Whole-step bends that land in the scale start on C, D or G."
    expect(scaleNotes('A', 'minor-pentatonic').filter((n) => pcs.has((noteToMidi(n) + 2) % 12))).toEqual(['C', 'D', 'G']);
    // Bending the b7 (G) a whole step lands on the root; a half step would land outside the scale.
    expect(transpose('G', 'M2')).toBe('A');
    expect(pcs.has((noteToMidi('G') + 1) % 12)).toBe(false);
  });
});

describe('pentatonic-boxes: on the go (Sound off, Guitar off)', () => {
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
    expect((unit.checkpoint?.steps ?? []).filter((s) => !listening(s)).length).toBe(unit.checkpoint?.steps?.length);
  });

  it('no idea is asked only by ear: every lesson with a listening question also asks it in a quiet one', () => {
    const l = lesson('major-pentatonic-boxes');
    expect(quiet(l).some((s) => !('generate' in s) && s.type === 'true-false')).toBe(true);
    const b = lesson('bends-that-land');
    expect(quiet(b).filter((s) => !('generate' in s) && s.type === 'fretboard-find').length).toBeGreaterThanOrEqual(2);
  });
});

describe('pentatonic-boxes: positions are real', () => {
  it('every typed dot claims the note that is really there', () => {
    for (const l of unit.lessons) {
      for (const c of cards(l)) {
        if (c.figure?.kind !== 'fretboard' || !c.figure.dots) continue;
        for (const d of c.figure.dots) if (d.note) expect(pcName(noteAt(d, { context: { prefer: 'sharps' } })), `${l.id} ${key(d)}`).toBe(d.note);
      }
    }
    expect(positionsForPitchClass('A', { minFret: 7, maxFret: 10 }).map(key).sort()).toEqual(['2:10', '4:7']);
  });
});
