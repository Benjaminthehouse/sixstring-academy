/**
 * Generators about time: note values, time signatures, and rhythms to tap or recognise.
 * Lengths come from the theory engine's rhythm module (ticks, bar capacity).
 */
import { barCapacity, dottedTicks, noteValue, parseTimeSignature, ticksToDuration, PPQ, type NoteValueId } from '@/core/theory';
import { parseRhythm } from '../rhythm';
import type { Rng } from '../rng';
import type { ListenChoiceExercise, TapRhythmExercise, TypeAnswerExercise } from '../types';
import { article, cap, checkParams, choiceOf, count, defineGenerator, distinct, pool, retry } from './core';

type PlainValue = 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth';
const VALUES: readonly PlainValue[] = ['whole', 'half', 'quarter', 'eighth', 'sixteenth'];
const VALUES_EASY_FIRST: PlainValue[] = ['quarter', 'half', 'whole', 'eighth', 'sixteenth'];

const ticksOf = (value: NoteValueId): number => noteValue(value)!.ticks;

/** "2 beats", "1 beat", "half a beat", "1½ beats". */
function beatsWords(ticks: number): string {
  const beats = ticks / PPQ;
  if (beats === 0.5) return 'half a beat';
  if (beats === 0.25) return 'a quarter of a beat';
  if (beats === 0.75) return 'three quarters of a beat';
  if (beats === 1.5) return '1½ beats';
  return count(beats, 'beat');
}

/** "half note", "dotted quarter note". */
function valueName(value: NoteValueId, dots = 0): string {
  return `${dots ? 'dotted ' : ''}${noteValue(value)!.name}`;
}

/** "a half note", "an eighth note". */
function withArticle(name: string): string {
  return `${article(name)} ${name}`;
}

function nameOfTicks(ticks: number): string | null {
  const d = ticksToDuration(ticks);
  return d && !d.tuplet && (d.dots ?? 0) <= 1 ? valueName(d.value, d.dots ?? 0) : null;
}

function validValues(values: readonly string[] | undefined, allowed: readonly string[]): boolean {
  return values === undefined || (Array.isArray(values) && values.length > 0 && values.every((v) => allowed.includes(v)));
}

export const noteValueMath = defineGenerator({
  kind: 'note-value-math',
  summary: 'Note-value arithmetic: how many fit, how many beats, what two add up to.',
  produces: ['type-answer', 'choice'],
  params: [
    { name: 'ask', type: "'fit' | 'beats' | 'sum'", default: "'fit'", description: 'How many X fit in a Y; how many beats X lasts in 4/4; what X plus Y equals.' },
    { name: 'values', type: "('whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth')[]", default: 'quarter half whole eighth sixteenth', description: 'Note values, easiest first (at least two).' },
    { name: 'dotted', type: 'boolean', default: 'false', description: 'Include dotted notes.' },
  ],
  check: (p) =>
    checkParams()
      .oneOf('ask', p.ask, ['fit', 'beats', 'sum'])
      .need(validValues(p.values, VALUES) && (p.values?.length ?? 2) >= 2, '"values" must list at least two of whole, half, quarter, eighth, sixteenth.')
      .bool('dotted', p.dotted).problems,
  make(p, { rng, difficulty }) {
    const values = pool(p.values ?? VALUES_EASY_FIRST, difficulty, 3);
    const ask = p.ask ?? 'fit';
    if (ask === 'beats') {
      const value = rng.pick(values);
      // No dotted whole note: at six beats it cannot fit in a bar of 4/4.
      const dots = p.dotted && value !== 'sixteenth' && value !== 'whole' && rng.chance(0.4) ? 1 : 0;
      const ticks = dots ? dottedTicks(ticksOf(value)) : ticksOf(value);
      // Wrong answers stay within what the lesson has taught: dotted lengths only when dotted notes are in play.
      const others = [...VALUES.map((v) => ticksOf(v)), ...(p.dotted ? (['half', 'quarter', 'eighth'] as const).map((v) => dottedTicks(ticksOf(v))) : [])];
      return choiceOf(
        rng,
        {
          prompt: `In 4/4 time, how long does ${withArticle(valueName(value, dots))} last?`,
          explain: `A quarter note is one beat in 4/4. ${cap(withArticle(valueName(value, dots)))} lasts ${beatsWords(ticks)}${dots ? `: the dot adds half of the note's own length` : ''}.`,
        },
        cap(beatsWords(ticks)),
        distinct(rng.shuffle(others), (t) => t, 3, [ticks]).map((t) => cap(beatsWords(t))),
      );
    }
    if (ask === 'sum') {
      // Without dotted notes in play, only sums that make a plain note (two quarters make a half).
      const needsDot = (ticks: number): boolean => !p.dotted && !VALUES.some((v) => ticksOf(v) === ticks);
      const pair = retry(
        40,
        () => [rng.pick(values), rng.pick(values)] as const,
        // Nothing longer than a whole note: a "double whole note" is not worth a beginner's time.
        ([a, b]) => nameOfTicks(ticksOf(a) + ticksOf(b)) !== null && ticksOf(a) + ticksOf(b) <= ticksOf('whole') && !needsDot(ticksOf(a) + ticksOf(b)),
        () => ['quarter', 'quarter'] as const,
      );
      const total = ticksOf(pair[0]) + ticksOf(pair[1]);
      const right = nameOfTicks(total)!;
      const candidates = [...VALUES.map((v) => valueName(v)), ...(p.dotted ? [valueName('half', 1), valueName('quarter', 1)] : [])];
      return choiceOf(
        rng,
        {
          prompt: `${cap(withArticle(valueName(pair[0])))} plus ${withArticle(valueName(pair[1]))} lasts as long as which note?`,
          explain: `${cap(beatsWords(ticksOf(pair[0])))} plus ${beatsWords(ticksOf(pair[1]))} makes ${beatsWords(total)}: ${withArticle(right)}.`,
        },
        cap(right),
        distinct(rng.shuffle(candidates), (n) => n, 3, [right]).map(cap),
      );
    }
    const sorted = [...values].sort((a, b) => ticksOf(b) - ticksOf(a));
    const longIndex = rng.int(sorted.length - 1);
    const long = sorted[longIndex];
    const short = rng.pick(sorted.slice(longIndex + 1));
    const dots = p.dotted && rng.chance(0.4) ? 1 : 0;
    const longTicks = dots ? dottedTicks(ticksOf(long)) : ticksOf(long);
    const answer = longTicks / ticksOf(short);
    const out: TypeAnswerExercise = {
      type: 'type-answer',
      answer: { kind: 'number', value: answer },
      input: 'keypad',
      prompt: `How many ${noteValue(short)!.name}s fit in one ${valueName(long, dots)}?`,
      explain: `${cap(withArticle(valueName(long, dots)))} lasts ${beatsWords(longTicks)} and ${withArticle(noteValue(short)!.name)} lasts ${beatsWords(ticksOf(short))}, so ${answer} fit.`,
    };
    return out;
  },
});

const UNIT_NAMES: Record<number, PlainValue> = { 1: 'whole', 2: 'half', 4: 'quarter', 8: 'eighth', 16: 'sixteenth' };

export const meter = defineGenerator({
  kind: 'meter',
  summary: 'Time signatures: what the two numbers mean and how many notes fill a bar.',
  produces: ['type-answer', 'choice'],
  params: [
    { name: 'ask', type: "'beats' | 'unit' | 'fill'", default: "'beats'", description: 'The top number; the note the bottom number stands for; how many of a note value fill a bar.' },
    { name: 'signatures', type: 'string[]', default: '4/4 3/4 2/4 6/8', description: 'Time-signature pool, easiest first.' },
  ],
  check: (p) =>
    checkParams()
      .oneOf('ask', p.ask, ['beats', 'unit', 'fill'])
      .list('signatures', p.signatures, (s) => {
        const ts = typeof s === 'string' ? parseTimeSignature(s) : null;
        return ts !== null && ts.denominator in UNIT_NAMES && /^\d+\/\d+$/.test(s);
      }, "['4/4', '3/4', '6/8']").problems,
  make(p, { rng, difficulty }) {
    const text = rng.pick(pool(p.signatures ?? ['4/4', '3/4', '2/4', '6/8'], difficulty, 2));
    const ts = parseTimeSignature(text)!;
    const unit = UNIT_NAMES[ts.denominator];
    const unitName = noteValue(unit)!.name;
    const meaning = `In ${ts.text} the top number says how many, the bottom which note: ${ts.numerator} ${unitName}s in every bar.`;
    if (p.ask === 'unit') {
      return choiceOf(
        rng,
        { prompt: `In ${ts.text} time, which note value does the bottom number stand for?`, explain: meaning },
        cap(unitName),
        distinct(rng.shuffle(VALUES.map((v) => noteValue(v)!.name)), (n) => n, 3, [unitName]).map(cap),
      );
    }
    if (p.ask === 'fill') {
      const bar = barCapacity(ts);
      const fitting = VALUES.filter((v) => v !== unit && bar % ticksOf(v) === 0 && bar / ticksOf(v) >= 2 && bar / ticksOf(v) <= 16);
      const value = rng.pick(fitting.length ? fitting : [unit]);
      const answer = bar / ticksOf(value);
      const out: TypeAnswerExercise = {
        type: 'type-answer',
        answer: { kind: 'number', value: answer },
        input: 'keypad',
        prompt: `How many ${noteValue(value)!.name}s fill one bar of ${ts.text}?`,
        explain: `${meaning} That bar holds ${answer} ${noteValue(value)!.name}${answer === 1 ? '' : 's'}.`,
      };
      return out;
    }
    const out: TypeAnswerExercise = {
      type: 'type-answer',
      answer: { kind: 'number', value: ts.numerator },
      input: 'keypad',
      prompt: `In ${ts.text} time, how many ${unitName}s are in each bar?`,
      explain: meaning,
    };
    return out;
  },
});

// ── Rhythms ────────────────────────────────────────────────────────────────────────────────────

type RhythmValue = 'half' | 'quarter' | 'eighth' | 'sixteenth';
const RHYTHM_VALUES: readonly RhythmValue[] = ['half', 'quarter', 'eighth', 'sixteenth'];

/** A one-beat (or, for a half note, two-beat) building block of a 4/4 bar. */
interface Cell {
  code: string;
  beats: 1 | 2;
  needs: RhythmValue;
  rest?: boolean;
}

const CELLS: readonly Cell[] = [
  { code: 'q', beats: 1, needs: 'quarter' },
  { code: 'e e', beats: 1, needs: 'eighth' },
  { code: 'h', beats: 2, needs: 'half' },
  { code: 'qr', beats: 1, needs: 'quarter', rest: true },
  { code: 'e s s', beats: 1, needs: 'sixteenth' },
  { code: 's s e', beats: 1, needs: 'sixteenth' },
  { code: 's s s s', beats: 1, needs: 'sixteenth' },
];

/** One bar of 4/4 from the allowed cells. The first beat always carries a note, so there is something to line up with. */
function buildBar(rng: Rng, cells: readonly Cell[], first: boolean): string {
  const parts: string[] = [];
  let beat = 0;
  while (beat < 4) {
    const fitting = cells.filter((c) => c.beats <= 4 - beat && (c.beats === 1 || beat % 2 === 0) && !(c.rest && beat === 0 && first));
    const cell = rng.pick(fitting.length ? fitting : [CELLS[0]]);
    parts.push(cell.code);
    beat += cell.beats;
  }
  return parts.join(' ');
}

function cellsFor(values: readonly RhythmValue[] | undefined, rests: boolean | undefined, difficulty: number): Cell[] {
  const allowed = pool(values ?? ['quarter', 'half', 'eighth'], difficulty, 2);
  const cells = CELLS.filter((c) => allowed.includes(c.needs) && (!c.rest || rests === true));
  return cells.length ? cells : [CELLS[0]];
}

/** How to count a rhythm aloud: "1, 2 &, (3), 4". Rests are in brackets. */
function counting(pattern: string): string {
  const parsed = parseRhythm(pattern);
  const groups: string[] = [];
  for (const e of parsed.events) {
    const label = e.rest ? `(${e.count})` : e.count;
    if (/^\(?\d/.test(label) || groups.length === 0) groups.push(label);
    else groups[groups.length - 1] += ` ${label}`;
  }
  return groups.join(', ');
}

function patternOf(rng: Rng, cells: readonly Cell[], bars: number): string {
  return retry(
    20,
    () => Array.from({ length: bars }, (_u, i) => buildBar(rng, cells, i === 0)).join(' | '),
    (pattern) => {
      const onsets = parseRhythm(pattern).onsets.length;
      return onsets >= 3 && onsets <= 16;
    },
    () => Array.from({ length: bars }, () => 'q q q q').join(' | '),
  );
}

export const rhythmTap = defineGenerator({
  kind: 'rhythm-tap',
  summary: 'Tap a generated rhythm in 4/4.',
  produces: ['tap-rhythm'],
  params: [
    { name: 'values', type: "('half' | 'quarter' | 'eighth' | 'sixteenth')[]", default: 'quarter half eighth', description: 'Note values allowed, easiest first.' },
    { name: 'bars', type: 'number', default: '1', description: 'Bars, 1 or 2.' },
    { name: 'rests', type: 'boolean', default: 'false', description: 'Allow quarter rests.' },
    { name: 'tempo', type: 'number', default: '80', description: 'Beats per minute, 50 to 140.' },
    { name: 'show', type: "'notation' | 'audio' | 'both'", default: "'both'", description: 'What the learner gets before tapping.' },
  ],
  check: (p) =>
    checkParams()
      .need(validValues(p.values, RHYTHM_VALUES), '"values" must list one or more of half, quarter, eighth, sixteenth.')
      .int('bars', p.bars, 1, 2)
      .bool('rests', p.rests)
      .int('tempo', p.tempo, 50, 140)
      .oneOf('show', p.show, ['notation', 'audio', 'both']).problems,
  make(p, { rng, difficulty }) {
    const pattern = patternOf(rng, cellsFor(p.values, p.rests, difficulty), p.bars ?? 1);
    const show = p.show ?? 'both';
    const out: TapRhythmExercise = {
      type: 'tap-rhythm',
      rhythm: { pattern, time: '4/4' },
      tempo: p.tempo ?? 80,
      show,
      prompt: show === 'audio' ? 'Listen, then tap the rhythm back.' : 'Tap this rhythm along with the click.',
      explain: `Count it out loud: ${counting(pattern)}. Tap only where a note starts and let long notes ring.`,
    };
    return out;
  },
});

export const rhythmEar = defineGenerator({
  kind: 'rhythm-ear',
  summary: 'Hear a one-bar rhythm and choose its notation.',
  produces: ['listen-choice'],
  params: [
    { name: 'values', type: "('half' | 'quarter' | 'eighth' | 'sixteenth')[]", default: 'quarter half eighth', description: 'Note values allowed, easiest first.' },
    { name: 'tempo', type: 'number', default: '80', description: 'Beats per minute, 50 to 140.' },
  ],
  check: (p) =>
    checkParams()
      .need(validValues(p.values, RHYTHM_VALUES), '"values" must list one or more of half, quarter, eighth, sixteenth.')
      .int('tempo', p.tempo, 50, 140).problems,
  make(p, { rng, difficulty }) {
    const cells = cellsFor(p.values, false, Math.max(difficulty, 0.5));
    const signature = (pattern: string): string => parseRhythm(pattern).onsets.join(',');
    const right = patternOf(rng, cells, 1);
    const seen = new Set([signature(right)]);
    const wrong: string[] = [];
    // Different rhythms must SOUND different: compare where the notes start, not how they are written.
    for (let attempt = 0; attempt < 60 && wrong.length < 2; attempt++) {
      const candidate = patternOf(rng, attempt < 40 ? cells : CELLS.filter((c) => !c.rest), 1);
      if (seen.has(signature(candidate))) continue;
      seen.add(signature(candidate));
      wrong.push(candidate);
    }
    for (const spare of ['q q q q', 'h h', 'e e e e e e e e']) {
      if (wrong.length >= 2) break;
      if (!seen.has(signature(spare))) {
        seen.add(signature(spare));
        wrong.push(spare);
      }
    }
    const tempo = p.tempo ?? 80;
    const out: ListenChoiceExercise = {
      type: 'listen-choice',
      sound: { kind: 'rhythm', pattern: right, tempo },
      options: rng.shuffle([
        { figure: { kind: 'rhythm' as const, pattern: right }, correct: true },
        ...wrong.map((pattern) => ({ figure: { kind: 'rhythm' as const, pattern } })),
      ]),
      prompt: 'Which rhythm do you hear?',
      explain: `It goes: ${counting(right)}. Count along while you listen and the long and short notes fall into place.`,
    };
    return out;
  },
});

/** The time and rhythm generators. */
export const TIME_GENERATORS = [noteValueMath, meter, rhythmTap, rhythmEar] as const;
