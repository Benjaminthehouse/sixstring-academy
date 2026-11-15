/**
 * Ear-training generators: every one produces a listen-choice exercise whose sound is data
 * (`sound.ts` turns it into plucks and strums) and whose answer the theory engine names.
 */
import {
  chordNotes, classifyCadence, getChordType, getScale, interval, intervalName, midiToNote, parseNote, progressionToChords, type CadenceType,
} from '@/core/theory';
import type { Rng } from '../rng';
import type { ChoiceOption, ListenChoiceExercise } from '../types';
import { article, cap, checkParams, count, defineGenerator, distinct, noteList, pool } from './core';

const INTERVALS_BY_EAR = ['P8', 'P5', 'M3', 'm3', 'P4', 'M2', 'm2', 'M6', 'm6', 'm7', 'M7', 'A4'];
const TYPES_BY_EAR = ['major', 'minor', 'dim', 'aug', 'sus4', '7', 'maj7', 'm7'];
const SCALES_BY_EAR = ['major', 'minor', 'minor-pentatonic', 'major-pentatonic', 'harmonic-minor', 'dorian', 'mixolydian', 'minor-blues'];

/** Options for "which of these was it": the right label and up to three others from the pool in play. */
function labelled<T>(rng: Rng, right: T, others: readonly T[], label: (item: T) => string): ChoiceOption[] {
  const wrong = rng.shuffle(others).slice(0, 3);
  return rng.shuffle([{ text: label(right), correct: true }, ...wrong.map((item) => ({ text: label(item) }))]);
}

export const higherLower = defineGenerator({
  kind: 'higher-lower',
  summary: 'Two notes are played: is the second higher or lower?',
  produces: ['listen-choice'],
  params: [
    { name: 'maxSemitones', type: 'number', default: '12', description: 'Largest gap in half steps (the easiest questions).' },
    { name: 'minSemitones', type: 'number', default: '1', description: 'Smallest gap in half steps (the hardest questions).' },
  ],
  check: (p) =>
    checkParams()
      .int('maxSemitones', p.maxSemitones, 1, 12)
      .int('minSemitones', p.minSemitones, 1, 12)
      .need((p.minSemitones ?? 1) <= (p.maxSemitones ?? 12), '"minSemitones" must not be larger than "maxSemitones".').problems,
  make(p, { rng, difficulty }) {
    const min = p.minSemitones ?? 1;
    const max = p.maxSemitones ?? 12;
    // Wide gaps are easy to hear; as the difficulty rises the gap closes toward the minimum.
    const ceiling = Math.max(min, Math.round(max - (max - min) * difficulty));
    const floor = Math.max(min, Math.round(ceiling / 2));
    const gap = rng.range(floor, ceiling);
    const up = rng.chance();
    const first = rng.range(52, 62);
    const second = first + (up ? gap : -gap);
    const a = midiToNote(first);
    const b = midiToNote(second);
    const out: ListenChoiceExercise = {
      type: 'listen-choice',
      sound: { kind: 'notes', notes: [a, b], tempo: 66 },
      options: [{ text: 'Higher', correct: up }, { text: 'Lower', correct: !up }],
      shuffle: false,
      prompt: 'Is the second note higher or lower than the first?',
      explain: `The second note, {n:${b}}, is ${count(gap, 'half step')} ${up ? 'above' : 'below'} the first, {n:${a}}. On one string that is ${count(gap, 'fret')} toward the ${up ? 'body' : 'headstock'}.`,
    };
    return out;
  },
});

export const intervalEar = defineGenerator({
  kind: 'interval-ear',
  summary: 'Hear an interval and name it.',
  produces: ['listen-choice'],
  params: [
    { name: 'intervals', type: 'string[]', default: 'P8 P5 M3 m3 P4 M2 m2 M6 m6 m7 M7 A4', description: 'Interval pool, easiest first (at least two different sizes).' },
    { name: 'play', type: "'up' | 'down' | 'together'", default: "'up'", description: 'How the two notes are played.' },
  ],
  check: (p) =>
    checkParams()
      .intervals('intervals', p.intervals, 2)
      .oneOf('play', p.play, ['up', 'down', 'together'])
      .need(!p.intervals || new Set(p.intervals.map((i) => { try { return interval(i).semitones; } catch { return -1; } })).size >= 2, '"intervals" needs at least two intervals of different sizes: A4 and d5 sound the same.').problems,
  make(p, { rng, difficulty }) {
    // Intervals of the same size sound the same, so only one name per size is offered.
    const inPlay = pool(distinct(p.intervals ?? INTERVALS_BY_EAR, (i) => interval(i).semitones, 99), difficulty, 2);
    const ivl = interval(rng.pick(inPlay));
    const low = rng.range(48, 57);
    const from = midiToNote(low);
    const to = midiToNote(low + ivl.semitones);
    const name = intervalName(ivl.name);
    const out: ListenChoiceExercise = {
      type: 'listen-choice',
      sound: { kind: 'interval', from, interval: ivl.name, play: p.play ?? 'up' },
      options: labelled(rng, ivl.name, inPlay.filter((i) => interval(i).semitones !== ivl.semitones), (i) => cap(intervalName(i))),
      prompt: 'Which interval do you hear?',
      explain: `That was ${article(name)} ${name}: ${count(ivl.semitones, 'half step')}, here {n:${from}} and {n:${to}}.`,
    };
    return out;
  },
});

export const chordQualityEar = defineGenerator({
  kind: 'chord-quality-ear',
  summary: 'Hear a chord and name its quality.',
  produces: ['listen-choice'],
  params: [{ name: 'types', type: 'string[]', default: "['major', 'minor']", description: 'Chord type ids, easiest first (at least two that sound different).' }],
  check: (p) =>
    checkParams()
      .chordTypes('types', p.types, 2)
      .need(!p.types || new Set(p.types.map((t) => getChordType(t)?.semitones.join('.') ?? t)).size === p.types.length, '"types" holds two chord types with the same notes; they cannot be told apart by ear. Remove one.').problems,
  make(p, { rng, difficulty }) {
    const inPlay = pool(p.types ?? ['major', 'minor'], difficulty, 2).map((id) => getChordType(id)!);
    const type = rng.pick(inPlay);
    const root = rng.pick(['C', 'D', 'E', 'F', 'G', 'A']);
    const symbol = `${root}${type.symbol}`;
    const label = (t: typeof type): string => cap(t.name);
    const out: ListenChoiceExercise = {
      type: 'listen-choice',
      sound: { kind: 'chord', chord: symbol, voicing: 'close', octave: 3, style: 'strum' },
      options: labelled(rng, type, inPlay.filter((t) => t.id !== type.id), label),
      prompt: 'What kind of chord do you hear?',
      explain: `That was {c:${symbol}}, ${article(type.name)} ${type.name}${/chord$/.test(type.name) ? '' : ' chord'}: ${noteList(chordNotes(symbol), ', ')} (degrees ${type.degrees.map((d) => `{d:${d}}`).join(' ')}).`,
    };
    return out;
  },
});

export const scaleEar = defineGenerator({
  kind: 'scale-ear',
  summary: 'Hear a scale and name it.',
  produces: ['listen-choice'],
  params: [{ name: 'scales', type: 'string[]', default: "['major', 'minor']", description: 'Scale ids, easiest first (at least two that sound different).' }],
  check: (p) =>
    checkParams()
      .scales('scales', p.scales)
      .need((p.scales?.length ?? 2) >= 2, '"scales" needs at least two scales to choose between.')
      .need(!p.scales || new Set(p.scales.map((s) => getScale(s)?.semitones.join('.') ?? s)).size === p.scales.length, '"scales" holds two scales with the same notes (such as minor and aeolian); they cannot be told apart by ear. Remove one.').problems,
  make(p, { rng, difficulty }) {
    const inPlay = pool(p.scales ?? ['major', 'minor'], difficulty, 2).map((id) => getScale(id)!);
    const scale = rng.pick(inPlay);
    const tonic = midiToNote(rng.range(45, 52));
    const out: ListenChoiceExercise = {
      type: 'listen-choice',
      sound: { kind: 'scale', tonic, scale: scale.id, direction: 'up' },
      options: labelled(rng, scale, inPlay.filter((s) => s.id !== scale.id), (s) => s.name),
      prompt: 'Which scale do you hear?',
      explain: `That was the ${scale.name.toLowerCase()} scale, starting on {n:${parseNote(tonic)!.pcName}}: degrees ${scale.degrees.map((d) => `{d:${d}}`).join(' ')}.`,
    };
    return out;
  },
});

const CADENCE_PHRASES: Record<CadenceType, string[]> = {
  authentic: ['I', 'IV', 'V', 'I'],
  half: ['I', 'vi', 'IV', 'V'],
  plagal: ['I', 'V', 'IV', 'I'],
  deceptive: ['I', 'IV', 'V', 'vi'],
};

const CADENCE_LABELS: Record<CadenceType, string> = {
  authentic: 'Authentic: {r:V} to {r:I}',
  half: 'Half: it stops on {r:V}',
  plagal: 'Plagal: {r:IV} to {r:I}',
  deceptive: 'Deceptive: {r:V} to {r:vi}',
};

export const cadenceEar = defineGenerator({
  kind: 'cadence-ear',
  summary: 'Hear a four-chord phrase and name the cadence that ends it.',
  produces: ['listen-choice'],
  params: [{ name: 'types', type: "('authentic' | 'half' | 'plagal' | 'deceptive')[]", default: "['authentic', 'half']", description: 'Cadence pool, easiest first (at least two).' }],
  check: (p) =>
    checkParams().list('types', p.types, (t) => t in CADENCE_PHRASES, "['authentic', 'half']", 2).need(!p.types || new Set(p.types).size === p.types.length, '"types" lists a cadence twice. List each once.').problems,
  make(p, { rng, difficulty }) {
    const inPlay: CadenceType[] = pool<CadenceType>(p.types ?? ['authentic', 'half'], difficulty, 2);
    const type = rng.pick(inPlay);
    const key = `${rng.pick(['C', 'G', 'D', 'A', 'F'])} major`;
    const chords = progressionToChords(CADENCE_PHRASES[type], key);
    const cadence = classifyCadence(chords, key);
    // The phrase table is typed by hand; the engine must agree with it before it is taught.
    if (!cadence || cadence.type !== type) throw new RangeError(`The ${type} phrase ${chords.join(' ')} was classified as ${cadence?.type ?? 'nothing'}`);
    const last = chords.slice(-2);
    const out: ListenChoiceExercise = {
      type: 'listen-choice',
      sound: { kind: 'progression', chords, tempo: 84, beats: 2 },
      options: labelled(rng, type, inPlay.filter((t) => t !== type), (t) => CADENCE_LABELS[t]),
      prompt: 'How does this phrase end?',
      explain: `It ended {c:${last[0]}} to {c:${last[1]}} in {k:${key}}: {r:${cadence.romans[0]}} to {r:${cadence.romans[1]}}. ${cadence.description}`,
    };
    return out;
  },
});

/** The ear-training generators. */
export const EAR_GENERATORS = [higherLower, intervalEar, chordQualityEar, scaleEar, cadenceEar] as const;

/** Default pools, exported so tests can check them against the engine. */
export const EAR_DEFAULTS = { intervals: INTERVALS_BY_EAR, types: TYPES_BY_EAR, scales: SCALES_BY_EAR } as const;
