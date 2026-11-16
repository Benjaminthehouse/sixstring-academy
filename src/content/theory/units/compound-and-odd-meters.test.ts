/**
 * Unit 30 of the Theory Path, cross-checked against the engines: every beat count, grouping and
 * kind of meter the text gives (against `parseTimeSignature`), every listening pattern (where its
 * low notes fall, which chord shape it comes from), the shuffle that sounds the same in 4/4 and
 * 12/8, the hemiola and 3-against-2 onsets, and that every lesson still teaches with the guitar or
 * the sound off.
 */
import { describe, expect, it } from 'vitest';
import { barCapacity, beatPositions, chordPcs, durationTicks, parseTimeSignature } from '@/core/theory';
import { buildVoicing, midiAt } from '@/core/guitar';
import {
  formatProblems, isGenerated, parseRhythm, plainText, rhythmOnsetTimes, validateCourse,
  type ChoiceExercise, type Exercise, type FillBlanksExercise, type Lesson, type ListenChoiceExercise, type MatchPairsExercise,
  type RichText, type Step, type TabNote, type TapRhythmExercise,
} from '@/lessons';
import { adaptUnit, isListeningStep, MIN_QUIET_EXERCISES } from '@/features/learn/model/conditions';
import { THEORY_GLOSSARY } from '../glossary';
import unit, { AM_SIX_EIGHT, AM_THREE_FOUR, E7_TWELVE_EIGHT, RIFF_2_2_3, RIFF_3_2_2, THREE_AGAINST_TWO } from './compound-and-odd-meters';

const EIGHTH = durationTicks('eighth');
const QUARTER = durationTicks('quarter');

const lesson = (id: string): Lesson => {
  const found = unit.lessons.find((l) => l.id === id);
  if (!found) throw new Error(`no lesson ${id}`);
  return found;
};
const exercises = (steps: readonly unknown[]): Exercise[] =>
  (steps as Step[]).filter((s): s is Exercise => !!s && typeof s === 'object' && !isGenerated(s) && s.type !== 'card');
/** Every literal exercise: lesson steps, fact asks and the checkpoint. */
const allExercises = (): Exercise[] => [
  ...unit.lessons.flatMap((l) => [...exercises(l.steps), ...exercises((l.facts ?? []).map((f) => f.ask))]),
  ...exercises(unit.checkpoint?.steps ?? []),
];
const ofType = <T extends Exercise>(type: T['type']): T[] => allExercises().filter((e): e is T => e.type === type);
const correctText = (e: { options: Array<{ text?: RichText; correct?: boolean }> }): string => plainText(e.options.find((o) => o.correct)?.text ?? '');
const listens = (l: Lesson): ListenChoiceExercise[] => exercises(l.steps).filter((e): e is ListenChoiceExercise => e.type === 'listen-choice');
const taps = (l: Lesson): TapRhythmExercise[] => exercises(l.steps).filter((e): e is TapRhythmExercise => e.type === 'tap-rhythm');
const tabNotes = (e: ListenChoiceExercise): Array<{ string: number; fret: number; duration: string }> => {
  if (e.sound.kind !== 'tab') throw new Error('expected a tab sound');
  return e.sound.notes.filter((n): n is { string: number; fret: number; duration: string } => 'string' in n);
};
const pitches = (notes: ReadonlyArray<{ string: number; fret: number }>): number[] => notes.map((n) => midiAt(n));
const pos = (list: ReadonlyArray<readonly [number, number] | readonly [number, number, string]>) => list.map(([string, fret]) => ({ string, fret }));
/** Ticks of a plain, dotted or triplet duration code (`q`, `q.`, `et`), from the theory engine. */
const ticksOf = (code: string): number => {
  const m = /^(h|q|e)(\.?)(t?)$/.exec(code);
  if (!m) throw new Error(`unexpected duration ${code}`);
  const value = ({ h: 'half', q: 'quarter', e: 'eighth' } as const)[m[1] as 'h' | 'q' | 'e'];
  return durationTicks(value, { dots: m[2] ? 1 : undefined, tuplet: m[3] ? 3 : undefined });
};
/** Onsets of a tab phrase, in ticks. */
const tabOnsets = (notes: readonly TabNote[]): number[] => {
  const out: number[] = [];
  let t = 0;
  for (const n of notes) {
    if (!('rest' in n)) out.push(t);
    t += ticksOf(n.duration);
  }
  return out;
};
/** "Simple duple", "Compound triple", ... from the engine's own reading of a time signature. */
function kindName(sig: string): string {
  const ts = parseTimeSignature(sig)!;
  const count = ['', 'single', 'duple', 'triple', 'quadruple'][ts.beats];
  return `${ts.kind === 'compound' ? 'Compound' : 'Simple'} ${count}`;
}
/** True when each group of `size` notes starts on the lowest note of the group. */
const groupsStartLow = (midi: number[], sizes: number[]): boolean => {
  let at = 0;
  for (const size of sizes) {
    const group = midi.slice(at, at + size);
    if (group.slice(1).some((m) => m <= group[0])) return false;
    at += size;
  }
  return at === midi.length;
};

describe('compound-and-odd-meters: the unit on its own', () => {
  it('is valid for the lesson engine, with no warnings', () => {
    const problems = validateCourse({ id: 'theory-path', title: 'Theory Path', teacher: 'none', level: 'expert', units: [unit], glossary: [...THEORY_GLOSSARY] });
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('starts every fact id with the unit word', () => {
    for (const l of unit.lessons) for (const f of l.facts ?? []) expect(f.id).toMatch(/^meters-/);
  });
});

describe('compound-and-odd-meters: what each time signature is', () => {
  it('reads the meters the way the lessons describe them', () => {
    expect([2, 3].map((n) => parseTimeSignature(`${n}/4`)!.kind)).toEqual(['simple', 'simple']);
    for (const [sig, beats] of [['6/8', 2], ['9/8', 3], ['12/8', 4]] as const) {
      const ts = parseTimeSignature(sig)!;
      expect(ts.kind, sig).toBe('compound');
      expect(ts.beats, sig).toBe(beats);
      // The beat is a dotted quarter: three eighths.
      expect(ts.beatTicks.every((t) => t === durationTicks('quarter', { dots: 1 }) && t === 3 * EIGHTH), sig).toBe(true);
    }
    // Simple beats split in two.
    expect(parseTimeSignature('2/4')!.beatTicks).toEqual([2 * EIGHTH, 2 * EIGHTH]);
    // 3/4 and 6/8 hold the same six eighths, grouped differently.
    expect(barCapacity('3/4')).toBe(6 * EIGHTH);
    expect(barCapacity('6/8')).toBe(6 * EIGHTH);
    expect(parseTimeSignature('3/4')!.beatTicks.map((t) => t / EIGHTH)).toEqual([2, 2, 2]);
    expect(parseTimeSignature('6/8')!.grouping).toEqual([3, 3]);
    // Common and cut time.
    expect(parseTimeSignature('C')!.text).toBe('4/4');
    expect(parseTimeSignature('cut')!.text).toBe('2/2');
    expect(parseTimeSignature('2/2')!.beatTicks).toEqual([2 * QUARTER, 2 * QUARTER]);
  });

  it('names each meter in the match-pairs as the engine reads it', () => {
    const kinds = ofType<MatchPairsExercise>('match-pairs').filter((e) => /with its kind/.test(plainText(e.prompt)));
    expect(kinds.length).toBe(3);
    for (const p of kinds.flatMap((e) => e.pairs)) expect(plainText(p.right), plainText(p.left)).toBe(kindName(plainText(p.left)));
  });

  it('answers every "how many beats" question with the engine\'s beat count', () => {
    const questions = ofType<ChoiceExercise>('choice').filter((e) => /How many beats are in a bar of/.test(plainText(e.prompt)));
    expect(questions.length).toBe(4);
    for (const q of questions) {
      const sig = /bar of (\d+\/\d+)/.exec(plainText(q.prompt))![1];
      expect(correctText(q), sig).toBe(String(parseTimeSignature(sig)!.beats));
    }
  });

  it('counts the eighths of the odd meters and their groupings', () => {
    expect(barCapacity('7/8') / EIGHTH).toBe(7);
    expect(barCapacity('2+3+2/8') / EIGHTH).toBe(7);
    expect(correctText(exercises(lesson('odd-meters').steps).find((e) => e.type === 'choice' && /eighth notes are in a bar of 7\/8/.test(plainText(e.prompt))) as ChoiceExercise)).toBe('7');
    // Five and seven cannot be split evenly into twos or threes.
    for (const n of [5, 7]) expect([n % 2, n % 3].every((r) => r !== 0)).toBe(true);
    expect(parseTimeSignature('7/8')!.kind).toBe('odd');
    expect(parseTimeSignature('5/4')!.kind).toBe('odd');
    // Where the groups start, in eighths: the checkpoint's options.
    const starts = (sig: string): number[] => {
      const out: number[] = [];
      let at = 1;
      for (const g of parseTimeSignature(sig)!.grouping) {
        out.push(at);
        at += g;
      }
      return out;
    };
    expect(starts('2+2+3/8')).toEqual([1, 3, 5]);
    expect(starts('3+2+2/8')).toEqual([1, 4, 6]);
    expect(starts('2+3+2/8')).toEqual([1, 3, 6]);
  });

  it('matches each grouping with a time signature that holds it', () => {
    const groupings = ofType<MatchPairsExercise>('match-pairs').filter((e) => /grouping of eighth notes/.test(plainText(e.prompt)));
    expect(groupings.length).toBe(1);
    for (const p of groupings[0].pairs) {
      const groups = plainText(p.left).split('+').map(Number);
      const sig = plainText(p.right);
      const ts = parseTimeSignature(sig)!;
      expect(groups.reduce((a, b) => a + b, 0) * EIGHTH, sig).toBe(barCapacity(sig));
      const felt = ts.kind === 'simple' ? ts.beatTicks.map((t) => t / EIGHTH) : ts.grouping;
      expect(felt, sig).toEqual(groups);
    }
  });

  it('puts the strong counts of 6/8 on 1 and 4, and adds up the mixed meter', () => {
    expect(beatPositions('6/8').map((t) => t / EIGHTH + 1)).toEqual([1, 4]);
    for (const e of ofType<FillBlanksExercise>('fill-blanks').filter((x) => /strong counts/.test(plainText(x.prompt)))) expect(e.blanks).toEqual(['4']);
    const beats = ['3/4', '2/4', '3/4', '2/4'].reduce((n, sig) => n + barCapacity(sig) / QUARTER, 0);
    expect(beats).toBe(10);
    expect(correctText(exercises(lesson('mixed-meter-and-hemiola').steps).find((e) => e.type === 'choice' && /3\/4, 2\/4/.test(plainText(e.prompt))) as ChoiceExercise)).toBe(String(beats));
  });
});

describe('compound-and-odd-meters: what the guitar plays', () => {
  it('picks the Am patterns from the x02210 shape', () => {
    const am = buildVoicing('Am', 'x02210');
    for (const p of [...pos(AM_SIX_EIGHT), ...pos(AM_THREE_FOUR)]) {
      expect(am.frets[6 - p.string], `string ${p.string}`).toBe(p.fret);
      expect(chordPcs('Am')).toContain(midiAt(p) % 12);
    }
  });

  it('marks 6/8 and 3/4 by where the low notes fall, and the two patterns cannot be confused', () => {
    const six = pitches(pos(AM_SIX_EIGHT));
    const three = pitches(pos(AM_THREE_FOUR));
    expect(groupsStartLow(six, [3, 3])).toBe(true);
    expect(groupsStartLow(six, [2, 2, 2])).toBe(false);
    expect(groupsStartLow(three, [2, 2, 2])).toBe(true);
    expect(groupsStartLow(three, [3, 3])).toBe(false);
  });

  it('plays the 12/8 grooves from the E7 (020100) and A7 (x02020) shapes, a quarter and an eighth in every beat', () => {
    const e7 = buildVoicing('E7', '020100');
    for (const p of pos(E7_TWELVE_EIGHT)) {
      expect(e7.frets[6 - p.string]).toBe(p.fret);
      expect(chordPcs('E7')).toContain(midiAt(p) % 12);
    }
    expect(E7_TWELVE_EIGHT.reduce((t, n) => t + ticksOf(n[2]), 0)).toBe(barCapacity('12/8'));
    const groove = tabNotes(listens(lesson('nine-and-twelve-eight'))[0]);
    const a7 = buildVoicing('A7', 'x02020');
    for (const n of groove) {
      expect(a7.frets[6 - n.string]).toBe(n.fret);
      expect(chordPcs('A7')).toContain(midiAt(n) % 12);
    }
    expect(groove.reduce((t, n) => t + ticksOf(n.duration), 0)).toBe(2 * barCapacity('12/8'));
    expect(correctText(listens(lesson('nine-and-twelve-eight'))[0])).toMatch(/^12\/8/);
  });

  it('shows a shuffle that sounds the same in 4/4 triplets and in 12/8', () => {
    const fourFour = rhythmOnsetTimes({ pattern: 'qt et qt et qt et qt et', time: '4/4' }, 60);
    const twelveEight = rhythmOnsetTimes({ pattern: 'q e q e q e q e', time: '12/8' }, 90);
    expect(fourFour.length).toBe(twelveEight.length);
    fourFour.forEach((t, i) => expect(t).toBeCloseTo(twelveEight[i], 9));
    // Both are the figures the lesson shows.
    const card = lesson('nine-and-twelve-eight').steps.find((s) => !isGenerated(s) && s.type === 'card' && s.figure?.kind === 'rhythm' && s.figure.time === '4/4');
    expect(card && !isGenerated(card) && card.type === 'card' && card.figure?.kind === 'rhythm' ? card.figure.pattern : '').toBe('qt et qt et qt et qt et');
  });

  it('starts every group of the 7/8 riffs on the open low E, and nowhere else', () => {
    const lowE = (list: ReadonlyArray<readonly [number, number]>): number[] => pitches(pos(list)).flatMap((m, i) => (m === 40 ? [i] : []));
    expect(RIFF_2_2_3.every(([s]) => s === 6) && RIFF_3_2_2.every(([s]) => s === 6)).toBe(true);
    expect(lowE(RIFF_2_2_3)).toEqual([0, 2, 4]);
    expect(lowE(RIFF_3_2_2)).toEqual([0, 3, 5]);
    expect(groupsStartLow(pitches(pos(RIFF_2_2_3)), parseTimeSignature('2+2+3/8')!.grouping)).toBe(true);
    expect(groupsStartLow(pitches(pos(RIFF_3_2_2)), parseTimeSignature('3+2+2/8')!.grouping)).toBe(true);
    const q = listens(lesson('odd-meters'))[0];
    expect(pitches(tabNotes(q)).slice(0, 7)).toEqual(pitches(pos(RIFF_3_2_2)));
    expect(correctText(q)).toBe('3+2+2');
  });

  it('puts the hemiola accents every second beat, across the bar line', () => {
    // Tap: beat 1 and 3 of bar 1, then beat 2 of bar 2.
    const tap = taps(lesson('mixed-meter-and-hemiola'))[0];
    const onsets = parseRhythm(tap.rhythm).onsets;
    expect(onsets).toEqual([0, 2 * QUARTER, 4 * QUARTER]);
    const bar = barCapacity('3/4');
    expect(onsets.map((t) => [Math.floor(t / bar) + 1, (t % bar) / QUARTER + 1])).toEqual([[1, 1], [1, 3], [2, 2]]);
    // Listening: two plain bars (low A on beats 1 of each), then the low A every second beat.
    const q = listens(lesson('mixed-meter-and-hemiola'))[0];
    const lowA = pitches(tabNotes(q)).flatMap((m, i) => (m === 45 ? [i] : []));
    expect(lowA).toEqual([0, 3, 6, 8, 10]);
    expect(correctText(q)).toBe('Three groups of two');
  });

  it('starts each bar of the mixed-meter example with the low A: 3/4, 2/4, 3/4, 2/4', () => {
    const card = lesson('mixed-meter-and-hemiola').steps[0];
    if (isGenerated(card) || card.type !== 'card' || card.figure?.kind !== 'audio' || card.figure.sound.kind !== 'tab') throw new Error('expected a tab audio card');
    const notes = card.figure.sound.notes.filter((n): n is { string: number; fret: number; duration: string } => 'string' in n);
    expect(notes.every((n) => n.duration === 'q')).toBe(true);
    expect(pitches(notes).flatMap((m, i) => (m === 45 ? [i] : []))).toEqual([0, 3, 5, 8]);
  });

  it('places 3 against 2 on the six-step grid: twos on 1 and 4, threes on 1, 3 and 5', () => {
    const bar = barCapacity('2/4');
    const step = bar / 6;
    const twos = [0, bar / 2];
    const threes = [0, bar / 3, (2 * bar) / 3];
    const combined = [...new Set([...twos, ...threes])].sort((a, b) => a - b);
    const notes = THREE_AGAINST_TWO.map(([string, fret, duration]) => ({ string, fret, duration }));
    expect(tabOnsets(notes)).toEqual(combined);
    expect(notes.reduce((t, n) => t + ticksOf(n.duration), 0)).toBe(bar);
    expect(combined.map((t) => t / step + 1)).toEqual([1, 3, 4, 5]);
    expect(twos.map((t) => t / step + 1)).toEqual([1, 4]);
    expect(threes.map((t) => t / step + 1)).toEqual([1, 3, 5]);
    // The thumb (string 6) plays the twos; the fingers (string 1) the threes it does not share.
    const onsets = tabOnsets(notes);
    expect(onsets.filter((_t, i) => notes[i].string === 6)).toEqual(twos);
    expect(onsets.filter((_t, i) => notes[i].string === 1)).toEqual(threes.slice(1));
    // The 6/8 picture and the taps show the same steps.
    expect(parseRhythm({ pattern: 'q e e q', time: '6/8' }).onsets.map((t) => t / EIGHTH + 1)).toEqual([1, 3, 4, 5]);
    const [combinedTap, threesTap] = taps(lesson('three-against-two'));
    expect(parseRhythm(combinedTap.rhythm).onsets.slice(0, 4).map((t) => t / EIGHTH + 1)).toEqual([1, 3, 4, 5]);
    expect(parseRhythm(threesTap.rhythm).onsets.slice(0, 3)).toEqual(threes);
    // The blanks and the silent steps.
    const fill = exercises(lesson('three-against-two').steps).find((e): e is FillBlanksExercise => e.type === 'fill-blanks')!;
    expect(fill.blanks).toEqual([String(twos[1] / step + 1), String(threes[1] / step + 1)]);
    const silent = [1, 2, 3, 4, 5, 6].filter((s) => !combined.map((t) => t / step + 1).includes(s));
    expect(silent).toEqual([2, 6]);
    const q = exercises(lesson('three-against-two').steps).find((e) => e.type === 'choice' && /silent/.test(plainText(e.prompt))) as ChoiceExercise;
    expect(correctText(q)).toBe(silent.join(' and '));
  });

  it('plays straight eighths where the answer says straight, and 3 against 2 where it says so', () => {
    const [polyrhythm, straight] = listens(lesson('three-against-two'));
    expect(correctText(polyrhythm)).toBe('3 against 2');
    expect(tabNotes(polyrhythm).map((n) => n.duration).slice(0, 4)).toEqual(['qt', 'et', 'et', 'qt']);
    expect(correctText(straight)).toBe('Straight eighth notes');
    expect(new Set(tabNotes(straight).map((n) => n.duration))).toEqual(new Set(['e']));
  });

  it('asks for the beats of 12/8 and the group starts of 7/8 in the taps', () => {
    const twelve = taps(lesson('nine-and-twelve-eight'))[0];
    expect(parseRhythm(twelve.rhythm).onsets.slice(0, 4).map((t) => t / EIGHTH + 1)).toEqual([1, 4, 7, 10]);
    const seven = taps(lesson('odd-meters'))[0];
    expect(parseRhythm(seven.rhythm).onsets.slice(0, 3).map((t) => t / EIGHTH + 1)).toEqual([1, 3, 5]);
    const sixes = taps(lesson('six-eight'))[0];
    expect(parseRhythm(sixes.rhythm).onsets.length).toBe(12);
  });

  it('answers each "two or three" and "3/4 or 6/8" question with what it plays', () => {
    const [three] = listens(lesson('simple-and-compound'));
    expect(groupsStartLow(pitches(tabNotes(three)), [3, 3, 3, 3])).toBe(true);
    expect(correctText(three)).toBe('Into three');
    const [asThreeFour, asSixEight] = listens(lesson('six-eight'));
    expect(pitches(tabNotes(asThreeFour)).slice(0, 6)).toEqual(pitches(pos(AM_THREE_FOUR)));
    expect(correctText(asThreeFour)).toMatch(/^3\/4/);
    expect(pitches(tabNotes(asSixEight)).slice(0, 6)).toEqual(pitches(pos(AM_SIX_EIGHT)));
    expect(correctText(asSixEight)).toMatch(/^6\/8/);
  });
});

describe('compound-and-odd-meters: on the go', () => {
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
