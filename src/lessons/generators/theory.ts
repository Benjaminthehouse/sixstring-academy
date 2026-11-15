/**
 * Generators for written theory: intervals, notes, scales, keys, chords and roman numerals.
 * Every fact in a generated exercise is computed by the theory engine.
 */
import {
  chordNotes, chordPcs, chordTones, circleOfFifths, diatonicChords, distractorIntervals, distractorNotes, enharmonics,
  getChordType, getScale, interval, intervalName, keySignature, neighborKeys, parallelChord, parseChord, parseInterval, parseNote, parseRoman,
  pcToNote, relativeKey, romanToChord, scaleContains, scaleNotes, similarChordTypes, transpose, type Key,
} from '@/core/theory';
import type { ChordBuildExercise, FillBlanksExercise, MatchPairsExercise, OrderExercise } from '../types';
import { article, awkward, cap, checkParams, choiceOf, count, defineGenerator, distinct, keysUpTo, noteList, ordinal, pool, retry } from './core';

const NATURALS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const INTERVALS_EASY_FIRST = ['P5', 'P4', 'M3', 'm3', 'M2', 'm2', 'P8', 'M6', 'm6', 'm7', 'M7', 'A4'];
const ROOTS_EASY_FIRST = ['C', 'G', 'D', 'A', 'E', 'F', 'B', 'Bb', 'Eb', 'F#', 'Ab', 'C#'];

const pcOf = (name: string): number => parseNote(name)?.chroma ?? -1;
const maskOf = (notes: readonly string[]): number => notes.reduce((mask, n) => mask | (1 << pcOf(n)), 0);

/** Letter names from one note up to another, inclusive: C, D, E. */
function lettersBetween(from: string, steps: number): string {
  const start = NATURALS.indexOf(parseNote(from)?.letter ?? 'C');
  return Array.from({ length: steps }, (_u, i) => NATURALS[(start + i) % 7]).join(', ');
}

function signatureWords(fifths: number): string {
  return fifths === 0 ? 'no sharps or flats' : count(Math.abs(fifths), fifths > 0 ? 'sharp' : 'flat');
}

function signatureNotes(key: Key): string {
  return key.signature.accidentals.length === 0 ? '' : `: ${noteList(key.signature.accidentals, ', ')}`;
}

/** Keys allowed at a difficulty: the simplest signatures first. */
function keysFor(maxAccidentals: number | undefined, modes: ReadonlyArray<'major' | 'minor'> | undefined, difficulty: number): Key[] {
  return pool(keysUpTo(maxAccidentals ?? 4, modes ?? ['major']), difficulty, 4);
}

// ── Intervals ──────────────────────────────────────────────────────────────────────────────────

export const intervalName_ = defineGenerator({
  kind: 'interval-name',
  summary: 'Two notes are named; choose the interval between them.',
  produces: ['choice'],
  params: [
    { name: 'intervals', type: 'string[]', default: 'P5 P4 M3 m3 M2 m2 P8 M6 m6 m7 M7 A4', description: 'Interval pool, easiest first.' },
    { name: 'roots', type: 'string[]', default: 'C G D A E F B Bb Eb F# Ab C#', description: 'Lower-note pool, easiest first.' },
  ],
  check: (p) => checkParams().intervals('intervals', p.intervals, 2).notes('roots', p.roots).problems,
  make(p, { rng, difficulty }) {
    const intervals = pool(p.intervals ?? INTERVALS_EASY_FIRST, difficulty);
    const roots = pool(p.roots ?? ROOTS_EASY_FIRST, difficulty, 4);
    const pick = retry(
      12,
      () => {
        const ivl = rng.pick(intervals);
        const root = rng.pick(roots);
        return { ivl, root, upper: transpose(root, ivl) };
      },
      (c) => !awkward(c.upper),
      () => ({ ivl: intervals[0], root: 'C', upper: transpose('C', intervals[0]) }),
    );
    const ivl = interval(pick.ivl);
    const wrong = distractorIntervals(ivl.name, { count: 3 });
    return choiceOf(
      rng,
      {
        prompt: `Which interval is it from {n:${pick.root}} up to {n:${pick.upper}}?`,
        explain: `${lettersBetween(pick.root, ivl.number)}: ${count(ivl.number, 'letter name')} make it ${ivl.number === 8 ? 'an octave' : `a ${ordinal(ivl.number)}`}, and ${count(ivl.semitones, 'half step')} ${ivl.semitones === 1 ? 'makes' : 'make'} it ${article(intervalName(ivl.name))} ${intervalName(ivl.name)}.`,
      },
      cap(intervalName(ivl.name)),
      wrong.map((w) => cap(intervalName(w))),
    );
  },
});

export const intervalNote = defineGenerator({
  kind: 'interval-note',
  summary: 'Choose the note an interval above (or below) a given note. The spelling counts.',
  produces: ['choice'],
  params: [
    { name: 'intervals', type: 'string[]', default: 'P5 P4 M3 m3 M2 m2 P8 M6 m6 m7 M7 A4', description: 'Interval pool, easiest first.' },
    { name: 'roots', type: 'string[]', default: 'C G D A E F B Bb Eb F# Ab C#', description: 'Starting-note pool, easiest first.' },
    { name: 'direction', type: "'up' | 'down'", default: "'up'", description: 'Measure upwards or downwards.' },
  ],
  check: (p) => checkParams().intervals('intervals', p.intervals).notes('roots', p.roots).oneOf('direction', p.direction, ['up', 'down']).problems,
  make(p, { rng, difficulty }) {
    const intervals = pool(p.intervals ?? INTERVALS_EASY_FIRST, difficulty);
    const roots = pool(p.roots ?? ROOTS_EASY_FIRST, difficulty, 4);
    const down = p.direction === 'down';
    const make = (ivl: string, root: string): { ivl: string; root: string; target: string } => ({ ivl, root, target: transpose(root, down ? `-${ivl}` : ivl) });
    const pick = retry(12, () => make(rng.pick(intervals), rng.pick(roots)), (c) => !awkward(c.target), () => make(intervals[0], 'C'));
    const ivl = interval(pick.ivl);
    const name = intervalName(ivl.name);
    const wrong = distractorNotes(pick.target, { count: 3, exclude: [pick.root] });
    return choiceOf(
      rng,
      {
        prompt: `Which note is ${article(name)} ${name} ${down ? 'below' : 'above'} {n:${pick.root}}?`,
        explain: `${cap(article(name))} ${name} is ${count(ivl.semitones, 'half step')} and spans ${count(ivl.number, 'letter name')}. From {n:${pick.root}} going ${down ? 'down' : 'up'}, that is {n:${pick.target}}.`,
      },
      `{n:${pick.target}}`,
      wrong.map((n) => `{n:${n}}`),
    );
  },
});

export const semitonesMatch = defineGenerator({
  kind: 'semitones-match',
  summary: 'Match interval names with their size in half steps.',
  produces: ['match-pairs'],
  params: [
    { name: 'intervals', type: 'string[]', default: 'P5 P4 M3 m3 M2 m2 P8 M6 m6 m7 M7 A4', description: 'Interval pool, easiest first.' },
    { name: 'pairs', type: 'number', default: '4', description: 'Pairs per exercise, 3 to 5.' },
  ],
  check: (p) =>
    checkParams()
      .intervals('intervals', p.intervals, 3)
      .int('pairs', p.pairs, 3, 5)
      .need(
        !p.intervals || !p.intervals.every((i) => parseInterval(i)) || new Set(p.intervals.map((i) => interval(i).semitones)).size >= (p.pairs ?? 4),
        `"intervals" needs at least ${p.pairs ?? 4} intervals of different sizes (A4 and d5 are the same size), one per pair.`,
      ).problems,
  make(p, { rng, difficulty }) {
    const wanted = p.pairs ?? 4;
    // One name per size: A4 and d5 would be two tiles with the same partner.
    const intervals = pool(distinct(p.intervals ?? INTERVALS_EASY_FIRST, (i) => interval(i).semitones, 99), difficulty, wanted);
    const chosen = rng.sample(intervals, wanted).sort((a, b) => interval(a).semitones - interval(b).semitones);
    const largest = chosen[chosen.length - 1];
    const out: MatchPairsExercise = {
      type: 'match-pairs',
      prompt: 'Match each interval with its size.',
      pairs: chosen.map((i) => ({ left: cap(intervalName(i)), right: count(interval(i).semitones, 'half step') })),
      explain: `One half step is one fret. ${cap(article(intervalName(largest)))} ${intervalName(largest)} is ${count(interval(largest).semitones, 'fret')} up one string.`,
    };
    return out;
  },
});

// ── Single notes ───────────────────────────────────────────────────────────────────────────────

export const stepUp = defineGenerator({
  kind: 'step-up',
  summary: 'Which note is one or more frets (half steps) above a note?',
  produces: ['choice'],
  params: [
    { name: 'steps', type: 'number[]', default: '[1, 2]', description: 'Distances in half steps to draw from (1 to 11).' },
    { name: 'roots', type: 'string[]', default: 'C D E F G A B', description: 'Starting-note pool.' },
  ],
  check: (p) => checkParams().list('steps', p.steps, (s) => Number.isInteger(s) && s >= 1 && s <= 11, '[1, 2]').notes('roots', p.roots).problems,
  make(p, { rng }) {
    const steps = rng.pick(p.steps ?? [1, 2]);
    const root = rng.pick(p.roots ?? NATURALS);
    const rootPc = pcOf(root);
    const walk = Array.from({ length: steps + 1 }, (_u, i) => (i === 0 ? root : pcToNote((rootPc + i) % 12, 'sharps')));
    const target = walk[walk.length - 1];
    const twin = enharmonics(target).find((n) => Math.abs(parseNote(n)?.alt ?? 9) === 1 && !NATURALS.includes(target));
    const distance = steps === 1 ? 'one fret (a half step)' : steps === 2 ? 'two frets (a whole step)' : `${steps} frets`;
    const shown = walk.length <= 6 ? `: ${noteList(walk, ', ')}` : '';
    return choiceOf(
      rng,
      {
        prompt: `On one string, which note is ${distance} above {n:${root}}?`,
        explain: `Each fret raises the note by a half step${shown}. ${count(steps, 'fret')} above {n:${root}} is {n:${target}}${twin ? `, also called {n:${twin}}` : ''}.`,
      },
      `{n:${target}}`,
      distractorNotes(target, { count: 3, exclude: [root] }).map((n) => `{n:${n}}`),
    );
  },
});

export const enharmonic = defineGenerator({
  kind: 'enharmonic',
  summary: 'Which note sounds the same as this one?',
  produces: ['choice'],
  params: [{ name: 'notes', type: 'string[]', default: 'C# D# F# G# A# Db Eb Gb Ab Bb', description: 'Notes to ask about, easiest first. Black keys only (a sharp or a flat).' }],
  check: (p) =>
    checkParams().list('notes', p.notes, (n) => typeof n === 'string' && Math.abs(parseNote(n)?.alt ?? 0) === 1 && parseNote(n)?.octave === null && [1, 3, 6, 8, 10].includes(pcOf(n)), "['C#', 'Eb'] (black keys only)").problems,
  make(p, { rng, difficulty }) {
    const asked = rng.pick(pool(p.notes ?? ['C#', 'D#', 'F#', 'G#', 'A#', 'Db', 'Eb', 'Gb', 'Ab', 'Bb'], difficulty, 5));
    const twin = enharmonics(asked).find((n) => Math.abs(parseNote(n)?.alt ?? 9) <= 1) ?? asked;
    const a = parseNote(asked)!;
    const below = a.alt > 0 ? a.letter : parseNote(twin)!.letter;
    const above = a.alt > 0 ? parseNote(twin)!.letter : a.letter;
    return choiceOf(
      rng,
      {
        prompt: `Which note sounds the same as {n:${asked}}?`,
        explain: `The fret between {n:${below}} and {n:${above}} has two names: {n:${a.alt > 0 ? asked : twin}} (a half step above {n:${below}}) and {n:${a.alt > 0 ? twin : asked}} (a half step below {n:${above}}).`,
      },
      `{n:${twin}}`,
      distractorNotes(twin, { count: 3, exclude: [asked] }).map((n) => `{n:${n}}`),
    );
  },
});

// ── Scales ─────────────────────────────────────────────────────────────────────────────────────

const TONICS_EASY_FIRST = ['C', 'G', 'D', 'F', 'A', 'E', 'Bb', 'Eb', 'B', 'Ab'];

export const scaleNotes_ = defineGenerator({
  kind: 'scale-notes',
  summary: 'The notes of a scale: arrange them, complete them, or spot the outsider.',
  produces: ['order', 'fill-blanks', 'choice'],
  params: [
    { name: 'scales', type: 'string[]', default: "['major']", description: 'Scale ids, easiest first (5 to 7 notes).' },
    { name: 'tonics', type: 'string[]', default: 'C G D F A E Bb Eb B Ab', description: 'Tonic pool, easiest first.' },
    { name: 'form', type: "'order' | 'fill' | 'odd-one-out'", default: "'order'", description: 'Arrange the notes, complete the scale, or find the note that is not in it.' },
  ],
  check: (p) =>
    checkParams()
      .scales('scales', p.scales)
      .list('scales', p.scales, (s) => (getScale(s)?.size ?? 0) >= 5 && (getScale(s)?.size ?? 99) <= 7, "['major', 'minor-pentatonic'] (5 to 7 notes)")
      .notes('tonics', p.tonics)
      .oneOf('form', p.form, ['order', 'fill', 'odd-one-out']).problems,
  make(p, { rng, difficulty }) {
    const scales = pool(p.scales ?? ['major'], difficulty, 2);
    const tonics = pool(p.tonics ?? TONICS_EASY_FIRST, difficulty, 4);
    const pick = retry(
      12,
      () => {
        const scale = getScale(rng.pick(scales))!;
        const tonic = rng.pick(tonics);
        return { scale, tonic, notes: scaleNotes(tonic, scale) };
      },
      (c) => !c.notes.some(awkward),
      () => ({ scale: getScale(scales[0])!, tonic: 'C', notes: scaleNotes('C', scales[0]) }),
    );
    const { scale, tonic, notes } = pick;
    const title = `{n:${tonic}} ${scale.name.toLowerCase()}`;
    const spelled = `The ${title} scale is ${noteList(notes)}.`;
    const form = p.form ?? 'order';
    if (form === 'fill') {
      const holes = rng.sample(notes.map((_n, i) => i).slice(1), Math.min(2, notes.length - 1)).sort((a, b) => a - b);
      const blanks = holes.map((i) => `{n:${notes[i]}}`);
      const wrong = distinct(
        holes.flatMap((i) => distractorNotes(notes[i], { count: 3, exclude: notes })),
        (n) => pcOf(n),
        2,
        notes.map(pcOf),
      );
      const out: FillBlanksExercise = {
        type: 'fill-blanks',
        prompt: `Complete the ${title} scale.`,
        text: notes.map((n, i) => (holes.includes(i) ? '___' : `{n:${n}}`)).join('  '),
        blanks,
        bank: wrong.map((n) => `{n:${n}}`),
        explain: spelled,
      };
      return out;
    }
    if (form === 'odd-one-out') {
      const outsider = retry(
        12,
        () => rng.pick(distractorNotes(rng.pick(notes), { count: 4 })),
        (n) => !scaleContains(tonic, scale, n),
        () => pcToNote((pcOf(tonic) + [1, 3, 6, 8, 10].find((s) => !scale.semitones.includes(s))!) % 12, 'sharps'),
      );
      const insiders = rng.sample(notes, 3);
      return choiceOf(
        rng,
        { prompt: `Which of these notes is NOT in the ${title} scale?`, explain: `${spelled} There is no {n:${outsider}} in it.` },
        `{n:${outsider}}`,
        insiders.map((n) => `{n:${n}}`),
      );
    }
    const out: OrderExercise = {
      type: 'order',
      prompt: `Put the notes of the ${title} scale in order, starting on {n:${tonic}}.`,
      tiles: notes.map((n) => `{n:${n}}`),
      explain: `${spelled} Every letter appears once, in alphabetical order.`,
    };
    if (scale.size !== 7) out.explain = spelled;
    return out;
  },
});

const STEP_WORDS: Record<number, string> = { 1: 'Half', 2: 'Whole', 3: 'Whole + half', 4: 'Two wholes' };

export const scaleFormula = defineGenerator({
  kind: 'scale-formula',
  summary: 'Put the whole and half steps of a scale in order.',
  produces: ['order'],
  params: [{ name: 'scales', type: 'string[]', default: "['major', 'minor']", description: 'Scale ids, easiest first (5 to 7 notes).' }],
  check: (p) =>
    checkParams()
      .scales('scales', p.scales)
      .list('scales', p.scales, (s) => {
        const scale = getScale(s);
        return !!scale && scale.size >= 5 && scale.size <= 7 && scale.steps.every((step) => step in STEP_WORDS);
      }, "['major', 'minor']").problems,
  make(p, { rng, difficulty }) {
    const scale = getScale(rng.pick(pool(p.scales ?? ['major', 'minor'], difficulty, 2)))!;
    const notes = scaleNotes('C', scale, { closed: true });
    const out: OrderExercise = {
      type: 'order',
      prompt: `Build the ${scale.name.toLowerCase()} scale: put its steps in order.`,
      tiles: scale.steps.map((s) => STEP_WORDS[s]),
      explain: `${cap(scale.name)} goes ${scale.steps.map((s) => STEP_WORDS[s].toLowerCase()).join(', ')}. From {n:C}: ${noteList(notes)}.`,
    };
    return out;
  },
});

// ── Keys ───────────────────────────────────────────────────────────────────────────────────────

export const keySignature_ = defineGenerator({
  kind: 'key-signature',
  summary: 'Sharps and flats of a key: how many, which key, which notes. The spelling counts.',
  produces: ['choice'],
  params: [
    { name: 'ask', type: "'count' | 'key' | 'accidentals'", default: "'count'", description: 'How many sharps or flats; which key has a signature; which notes are altered.' },
    { name: 'modes', type: "('major' | 'minor')[]", default: "['major']", description: 'Modes to draw keys from.' },
    { name: 'maxAccidentals', type: 'number', default: '4', description: 'Largest signature used, 1 to 7.' },
  ],
  check: (p) =>
    checkParams()
      .oneOf('ask', p.ask, ['count', 'key', 'accidentals'])
      .list('modes', p.modes, (m) => m === 'major' || m === 'minor', "['major', 'minor']")
      .int('maxAccidentals', p.maxAccidentals, 1, 7).problems,
  make(p, { rng, difficulty }) {
    const ask = p.ask ?? 'count';
    const keys = keysFor(p.maxAccidentals, p.modes, difficulty).filter((k) => ask !== 'accidentals' || k.fifths !== 0);
    const key = rng.pick(keys.length ? keys : keysUpTo(1, p.modes ?? ['major']).filter((k) => k.fifths !== 0));
    const f = key.fifths;
    const has = `{k:${key.name}} has ${signatureWords(f)}${signatureNotes(key)}.`;
    const around = [f + 1, f - 1, -f, f + 2, f - 2, f + 3].filter((n) => n !== f && Math.abs(n) <= 7);
    if (ask === 'key') {
      const others = distinct(around, (n) => n, 3).map((n) => keySignature(n)).map((s) => (key.mode === 'major' ? keysUpTo(7, ['major']) : keysUpTo(7, ['minor'])).find((k) => k.fifths === s.fifths)!);
      return choiceOf(
        rng,
        { prompt: `Which ${key.mode} key has ${signatureWords(f)}?`, explain: has, spelling: 'exact' },
        `{k:${key.name}}`,
        others.map((k) => `{k:${k.name}}`),
      );
    }
    if (ask === 'accidentals') {
      const kind = f > 0 ? 'sharp' : 'flat';
      // Near misses: the neighbouring signatures, the same count of the other sign, and the next one minus its first note.
      const shifted = Math.abs(f) < 7 ? keySignature(f + Math.sign(f)).accidentals.slice(1) : [];
      const sets: string[][] = [...around.map((n) => keySignature(n).accidentals), shifted];
      const wrong = distinct(sets.filter((s) => s.length > 0), (s) => s.join(' '), 3, [key.signature.accidentals.join(' ')]);
      return choiceOf(
        rng,
        { prompt: `Which notes are ${kind} in {k:${key.name}}?`, explain: `${has} ${cap(kind)}s always arrive in the same order.`, spelling: 'exact' },
        noteList(key.signature.accidentals),
        wrong.map((s) => noteList(s)),
      );
    }
    return choiceOf(
      rng,
      { prompt: `How many sharps or flats does {k:${key.name}} have?`, explain: has },
      cap(signatureWords(f)),
      distinct(around, (n) => n, 3).map((n) => cap(signatureWords(n))),
    );
  },
});

export const relativeKey_ = defineGenerator({
  kind: 'relative-key',
  summary: 'The relative minor of a major key, or the relative major of a minor key.',
  produces: ['choice'],
  params: [
    { name: 'direction', type: "'minor' | 'major' | 'both'", default: "'minor'", description: 'Which relative is asked for.' },
    { name: 'maxAccidentals', type: 'number', default: '4', description: 'Largest signature used, 0 to 7.' },
  ],
  check: (p) => checkParams().oneOf('direction', p.direction, ['minor', 'major', 'both']).int('maxAccidentals', p.maxAccidentals, 0, 7).problems,
  make(p, { rng, difficulty }) {
    const direction = p.direction ?? 'minor';
    const fromMode: 'major' | 'minor' = direction === 'minor' ? 'major' : direction === 'major' ? 'minor' : rng.chance() ? 'major' : 'minor';
    const key = rng.pick(keysFor(p.maxAccidentals, [fromMode], difficulty));
    const answer = relativeKey(key);
    const near = neighborKeys(key);
    const wrong = distinct([near.parallel, near.dominantRelative, near.subdominantRelative], (k) => pcOf(k.tonic), 3, [pcOf(answer.tonic)]);
    const major = fromMode === 'major' ? key : answer;
    const minor = fromMode === 'major' ? answer : key;
    return choiceOf(
      rng,
      {
        prompt: `What is the relative ${answer.mode} of {k:${key.name}}?`,
        explain: `{k:${major.name}} and {k:${minor.name}} share one key signature (${signatureWords(key.fifths)}). The relative minor starts on the 6th note of the major scale: ${noteList(major.scale.slice(0, 6))}.`,
      },
      `{k:${answer.name}}`,
      wrong.map((k) => `{k:${k.name}}`),
    );
  },
});

export const degreeInKey = defineGenerator({
  kind: 'degree-in-key',
  summary: 'Scale degrees: which note is degree N of a key, or which degree is this note?',
  produces: ['choice'],
  params: [
    { name: 'ask', type: "'note' | 'degree'", default: "'note'", description: 'Ask for the note of a degree, or the degree of a note.' },
    { name: 'modes', type: "('major' | 'minor')[]", default: "['major']", description: 'Modes to draw keys from.' },
    { name: 'maxAccidentals', type: 'number', default: '4', description: 'Largest signature used, 0 to 7.' },
    { name: 'degrees', type: 'number[]', default: '[5, 3, 4, 2, 6, 7]', description: 'Degrees to ask about (1 to 7), easiest first.' },
  ],
  check: (p) =>
    checkParams()
      .oneOf('ask', p.ask, ['note', 'degree'])
      .list('modes', p.modes, (m) => m === 'major' || m === 'minor', "['major', 'minor']")
      .int('maxAccidentals', p.maxAccidentals, 0, 7)
      .list('degrees', p.degrees, (d) => Number.isInteger(d) && d >= 1 && d <= 7, '[5, 3, 4]').problems,
  make(p, { rng, difficulty }) {
    const key = rng.pick(keysFor(p.maxAccidentals, p.modes, difficulty));
    const degree = rng.pick(pool(p.degrees ?? [5, 3, 4, 2, 6, 7], difficulty));
    const note = key.scale[degree - 1];
    const counted = `Count up the scale: ${key.scale.slice(0, degree).map((n, i) => (i === degree - 1 ? `**{n:${n}}**` : `{n:${n}}`)).join(' ')}.`;
    if (p.ask === 'degree') {
      const others = [degree + 1, degree - 1, degree + 2, degree - 2, degree + 3].map((d) => ((d - 1 + 7) % 7) + 1);
      return choiceOf(
        rng,
        { prompt: `In {k:${key.name}}, which scale degree is {n:${note}}?`, explain: `${counted} {n:${note}} is the ${ordinal(degree)} note.` },
        `The ${ordinal(degree)}`,
        distinct(others, (d) => d, 3, [degree]).map((d) => `The ${ordinal(d)}`),
      );
    }
    const neighbours = [key.scale[degree % 7], key.scale[(degree + 5) % 7], ...distractorNotes(note, { count: 3 })];
    return choiceOf(
      rng,
      { prompt: `What is the ${ordinal(degree)} note of the {k:${key.name}} scale?`, explain: counted },
      `{n:${note}}`,
      distinct(neighbours, (n) => pcOf(n), 3, [pcOf(note)]).map((n) => `{n:${n}}`),
    );
  },
});

export const fifthsOrder = defineGenerator({
  kind: 'fifths-order',
  summary: 'The circle of fifths, and the order of sharps and flats.',
  produces: ['order'],
  params: [
    { name: 'ask', type: "'keys' | 'sharps' | 'flats'", default: "'keys'", description: 'Major keys clockwise, or the order sharps / flats are written.' },
    { name: 'count', type: 'number', default: '4', description: 'Tiles per exercise, 3 to 7.' },
  ],
  check: (p) => checkParams().oneOf('ask', p.ask, ['keys', 'sharps', 'flats']).int('count', p.count, 3, 7).problems,
  make(p, { rng }) {
    const n = p.count ?? 4;
    if (p.ask === 'sharps' || p.ask === 'flats') {
      const sharps = p.ask === 'sharps';
      const all = keySignature(sharps ? 7 : -7).accidentals;
      const out: OrderExercise = {
        type: 'order',
        prompt: `Put the first ${n} ${p.ask} in the order they are written in a key signature.`,
        tiles: all.slice(0, n).map((a) => `{n:${a}}`),
        explain: `${cap(p.ask)} always arrive in the order ${noteList(all)}: each one a perfect fifth ${sharps ? 'above' : 'below'} the last.`,
      };
      return out;
    }
    const slots = circleOfFifths();
    // Stay on the sharp side or the flat side so every tile has one obvious name.
    // Slots 0–6 are C G D A E B F#, slots 7–12 are Db Ab Eb Bb F C.
    const start = rng.pick(Array.from({ length: 12 }, (_u, i) => i).filter((i) => i + n - 1 <= 6 || (i >= 7 && i + n - 1 <= 12)));
    const names = Array.from({ length: n }, (_u, i) => slots[(start + i) % 12].major[0].tonic);
    const out: OrderExercise = {
      type: 'order',
      prompt: `Going clockwise round the circle of fifths, put these major keys in order, starting from {n:${names[0]}}.`,
      tiles: names.map((name) => `{n:${name}}`),
      explain: `Each step clockwise is a perfect fifth up: ${noteList(names, ' → ')}. Every step adds a sharp or takes away a flat.`,
    };
    return out;
  },
});

// ── Chords ─────────────────────────────────────────────────────────────────────────────────────

const ROLE_WORDS: Record<string, string> = { root: 'root', third: 'third', fifth: 'fifth', seventh: 'seventh', sixth: 'sixth', ninth: 'ninth', fourth: 'fourth', second: 'second' };

function chordSummary(symbol: string): string {
  const c = parseChord(symbol)!;
  const tones = chordTones(c).map((t) => `${t.role === 'root' ? 'root' : `${intervalName(t.interval)}`} {n:${t.note}}`);
  return `{c:${symbol}} is ${article(c.type.name)} ${c.type.name}${/chord$/.test(c.type.name) ? '' : ' chord'}: ${tones.join(', ')}.`;
}

export const chordTones_ = defineGenerator({
  kind: 'chord-tones',
  summary: 'The notes inside a chord: all of them, one of them, the missing one, or the chord they spell.',
  produces: ['choice', 'chord-build'],
  params: [
    { name: 'types', type: 'string[]', default: "['major', 'minor']", description: 'Chord type ids, easiest first.' },
    { name: 'roots', type: 'string[]', default: 'C G D A E F B Bb Eb F# Ab C#', description: 'Root pool, easiest first.' },
    { name: 'ask', type: "'notes' | 'tone' | 'missing' | 'name'", default: "'notes'", description: 'All the notes; one tone (third, fifth ...); the missing note; or name the chord from its notes.' },
  ],
  check: (p) => checkParams().chordTypes('types', p.types).notes('roots', p.roots).oneOf('ask', p.ask, ['notes', 'tone', 'missing', 'name']).problems,
  make(p, { rng, difficulty }) {
    const types = pool(p.types ?? ['major', 'minor'], difficulty, 2).map((t) => getChordType(t)!);
    const roots = pool(p.roots ?? ROOTS_EASY_FIRST, difficulty, 4);
    const pick = retry(
      12,
      () => {
        const type = rng.pick(types);
        const symbol = `${rng.pick(roots)}${type.symbol}`;
        return { type, symbol, notes: chordNotes(symbol) };
      },
      (c) => !c.notes.some(awkward),
      () => ({ type: types[0], symbol: `C${types[0].symbol}`, notes: chordNotes(`C${types[0].symbol}`) }),
    );
    const { type, symbol, notes } = pick;
    const root = notes[0];
    const summary = chordSummary(symbol);
    const ask = p.ask ?? 'notes';
    // Same root, nearby types: the classic confusions (major for minor, 7 for maj7).
    const cousins = similarChordTypes(type, { sameSize: true, maxTier: Math.max(2, type.tier), limit: 6 }).map((t) => `${root}${t.symbol}`);
    const neighbours = [transpose(root, 'M2'), transpose(root, 'P4'), transpose(root, 'P5')].filter((n) => !awkward(n)).map((n) => `${n}${type.symbol}`);
    const rivals = distinct(
      [...cousins.slice(0, 2), ...neighbours, ...cousins.slice(2)].filter((s) => parseChord(s) && !chordNotes(s).some(awkward)),
      (s) => maskOf(chordNotes(s)),
      3,
      [maskOf(notes)],
    );

    if (ask === 'name') {
      return choiceOf(rng, { prompt: `Which chord has the notes ${noteList(notes)}?`, explain: summary }, `{c:${symbol}}`, rivals.map((s) => `{c:${s}}`));
    }
    if (ask === 'tone' || ask === 'missing') {
      const tones = chordTones(symbol).filter((t) => t.role !== 'root');
      const tone = rng.pick(tones);
      const others = [
        ...distractorNotes(tone.note, { count: 2, exclude: notes }),
        ...notes.filter((n) => n !== tone.note),
        ...distractorNotes(tone.note, { count: 6, exclude: notes }),
      ];
      if (ask === 'missing') {
        const wrong = distinct(distractorNotes(tone.note, { count: 6, exclude: notes }), (n) => pcOf(n), 3, notes.map(pcOf));
        const given = notes.filter((n) => n !== tone.note);
        const out: ChordBuildExercise = {
          type: 'chord-build',
          task: 'missing-note',
          chord: symbol,
          given,
          options: rng.shuffle([tone.note, ...wrong]),
          spelling: 'any',
          prompt: `The {c:${symbol}} chord has the notes ${noteList(given, ', ')} and one more. Which?`,
          explain: summary,
        };
        return out;
      }
      const role = ROLE_WORDS[tone.role] ?? tone.role;
      return choiceOf(
        rng,
        { prompt: `What is the ${role} of the {c:${symbol}} chord?`, explain: summary },
        `{n:${tone.note}}`,
        distinct(others, (n) => pcOf(n), 3, [pcOf(tone.note)]).map((n) => `{n:${n}}`),
      );
    }
    return choiceOf(rng, { prompt: `Which notes make up the {c:${symbol}} chord?`, explain: summary }, noteList(notes), rivals.map((s) => noteList(chordNotes(s))));
  },
});

const QUALITY_LABELS: Record<string, string> = {
  major: 'Major', minor: 'Minor', dim: 'Diminished', aug: 'Augmented', maj7: 'Major seventh', m7: 'Minor seventh', '7': 'Dominant seventh', m7b5: 'Half-diminished',
};

const DEGREES_EASY_FIRST = [1, 4, 5, 6, 2, 3, 7];

export const diatonicChord = defineGenerator({
  kind: 'diatonic-chord',
  summary: 'The chords that belong to a key: which chord sits on a degree, and what quality it has.',
  produces: ['choice'],
  params: [
    { name: 'ask', type: "'chord' | 'quality'", default: "'chord'", description: 'Name the chord on a degree, or say whether it is major, minor or diminished.' },
    { name: 'modes', type: "('major' | 'minor')[]", default: "['major']", description: 'Modes to draw keys from.' },
    { name: 'maxAccidentals', type: 'number', default: '4', description: 'Largest signature used, 0 to 7.' },
    { name: 'sevenths', type: 'boolean', default: 'false', description: 'Seventh chords instead of triads.' },
  ],
  check: (p) =>
    checkParams()
      .oneOf('ask', p.ask, ['chord', 'quality'])
      .list('modes', p.modes, (m) => m === 'major' || m === 'minor', "['major', 'minor']")
      .int('maxAccidentals', p.maxAccidentals, 0, 7)
      .bool('sevenths', p.sevenths).problems,
  make(p, { rng, difficulty }) {
    const key = rng.pick(keysFor(p.maxAccidentals, p.modes, difficulty));
    const chords = diatonicChords(key, { sevenths: p.sevenths === true });
    const degree = rng.pick(pool(DEGREES_EASY_FIRST, difficulty, 4));
    const chord = chords[degree - 1];
    const stack = `Stack thirds on {n:${chord.root}} using only notes of {k:${key.name}}: ${noteList(chord.notes)} is {c:${chord.symbol}}.`;
    if (p.ask === 'quality') {
      const labels = p.sevenths ? ['maj7', 'm7', '7', 'm7b5'] : ['major', 'minor', 'dim'];
      const right = QUALITY_LABELS[chord.type.id] ?? cap(chord.type.name);
      const wrong = labels.map((id) => QUALITY_LABELS[id]).filter((label) => label !== right);
      const exercise = choiceOf(
        rng,
        { prompt: `In {k:${key.name}}, what kind of chord is built on the ${ordinal(degree)} note, {n:${chord.root}}?`, explain: stack, shuffle: false },
        right,
        wrong,
      );
      // A fixed, familiar order: the learner should think about the chord, not hunt for the label.
      exercise.options.sort((a, b) => labels.map((id) => QUALITY_LABELS[id]).indexOf(String(a.text)) - labels.map((id) => QUALITY_LABELS[id]).indexOf(String(b.text)));
      return exercise;
    }
    const flipped = parallelChord(chord.symbol);
    const others = [flipped, chords[degree % 7].symbol, chords[(degree + 5) % 7].symbol, chords[(degree + 1) % 7].symbol, chords[(degree + 2) % 7].symbol].filter((s): s is string => !!s);
    return choiceOf(
      rng,
      { prompt: `In {k:${key.name}}, which chord is built on the ${ordinal(degree)} note of the scale?`, explain: stack },
      `{c:${chord.symbol}}`,
      distinct(others, (s) => `${maskOf(chordNotes(s))}:${pcOf(parseChord(s)!.root)}`, 3, [`${maskOf(chord.notes)}:${pcOf(chord.root)}`]).map((s) => `{c:${s}}`),
    );
  },
});

export const romanChord = defineGenerator({
  kind: 'roman-chord',
  summary: 'Roman numerals and the chords they stand for in a key.',
  produces: ['choice'],
  params: [
    { name: 'direction', type: "'to-chord' | 'to-roman'", default: "'to-chord'", description: 'Numeral given, choose the chord; or chord given, choose the numeral.' },
    { name: 'numerals', type: 'string[]', default: 'the diatonic triads of the key, I IV V first', description: 'Numeral pool, easiest first.' },
    { name: 'modes', type: "('major' | 'minor')[]", default: "['major']", description: 'Modes to draw keys from.' },
    { name: 'maxAccidentals', type: 'number', default: '4', description: 'Largest signature used, 0 to 7.' },
  ],
  check: (p) =>
    checkParams()
      .oneOf('direction', p.direction, ['to-chord', 'to-roman'])
      .list('numerals', p.numerals, (n) => typeof n === 'string' && parseRoman(n) !== null, "['I', 'IV', 'V', 'vi']")
      .list('modes', p.modes, (m) => m === 'major' || m === 'minor', "['major', 'minor']")
      .int('maxAccidentals', p.maxAccidentals, 0, 7).problems,
  make(p, { rng, difficulty }) {
    const key = rng.pick(keysFor(p.maxAccidentals, p.modes, difficulty));
    const diatonic = diatonicChords(key);
    const own = DEGREES_EASY_FIRST.map((d) => diatonic[d - 1].roman);
    const numerals = pool(p.numerals ?? own, difficulty, 3);
    const numeral = parseRoman(rng.pick(numerals))!;
    const symbol = romanToChord(numeral, key);
    const chord = parseChord(symbol)!;
    const others = diatonic.filter((c) => pcOf(c.root) !== pcOf(chord.root));
    const explain = `{r:${numeral.text}} is the ${chord.type.name}${/chord$/.test(chord.type.name) ? '' : ' chord'} on the ${ordinal(numeral.degree)} note of the scale. In {k:${key.name}} that note is {n:${chord.root}}, so the chord is {c:${symbol}}.`;
    if (p.direction === 'to-roman') {
      return choiceOf(
        rng,
        { prompt: `In the key of {k:${key.name}}, what is the roman numeral of {c:${symbol}}?`, explain },
        `{r:${numeral.text}}`,
        // Numerals that differ only by case would read the same in a tile; offer other degrees.
        distinct(rng.shuffle(others), (c) => parseRoman(c.roman)!.degree, 3, [numeral.degree]).map((c) => `{r:${c.roman}}`),
      );
    }
    const flipped = parallelChord(symbol);
    const candidates = [flipped, ...rng.shuffle(others).map((c) => c.symbol)].filter((s): s is string => !!s);
    return choiceOf(
      rng,
      { prompt: `In the key of {k:${key.name}}, which chord is {r:${numeral.text}}?`, explain },
      `{c:${symbol}}`,
      distinct(candidates, (s) => `${chordPcs(s).slice().sort((a, b) => a - b).join('.')}`, 3, [`${chordPcs(symbol).slice().sort((a, b) => a - b).join('.')}`]).map((s) => `{c:${s}}`),
    );
  },
});

/** The written-theory generators. */
export const THEORY_GENERATORS = [
  intervalName_, intervalNote, semitonesMatch, stepUp, enharmonic, scaleNotes_, scaleFormula, keySignature_, relativeKey_, degreeInKey,
  fifthsOrder, chordTones_, diatonicChord, romanChord,
] as const;
