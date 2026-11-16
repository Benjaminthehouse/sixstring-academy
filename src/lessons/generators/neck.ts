/**
 * Generators that live on the fretboard: notes along a string, intervals from a root, chord
 * shapes, chord and scale tones in a region, and playing a note into the microphone.
 * Pitches come from the guitar engine (`midiAt`), spellings from the theory engine.
 */
import { chordVoicings, midiAt, positionsForMidi, positionsForPitchClass, spellMidi, tuning as resolveTuning } from '@/core/guitar';
import {
  chordNotes, chordPcs, distractorIntervals, distractorNotes, getScale, interval, intervalName, intervalToDegree, parseChord, parseInterval, parseNote, scaleNotes,
  scalePcs, semitonesToDegree, semitonesToInterval,
} from '@/core/theory';
import { spellInterval } from '../grade';
import { COUNT_LIMITS, MAX_FRET } from '../limits';
import type { Rng } from '../rng';
import type {
  ChordBuildExercise, Exercise, FretboardFindExercise, FretboardNameExercise, NeckPosition, OrderExercise, PlayNoteExercise, TypeAnswerExercise,
} from '../types';
import { article, cap, checkParams, choiceOf, count, defineGenerator, distinct, intervalDistractors, noteList, ordinal, pool, respell, retry, scaleTitle } from './core';

const NATURAL_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);
const INTERVALS_EASY_FIRST = ['P5', 'P4', 'M3', 'm3', 'P8', 'M2', 'm2', 'M6', 'm6', 'm7', 'M7', 'A4'];

// Going up a string, notes are named with sharps throughout (E F F# G G# A), never a mix of sharps and flats
// (or with flats throughout when a drill asks for them).
const noteAtPos = (pos: NeckPosition, tuning?: string, prefer: 'sharps' | 'flats' = 'sharps'): string => spellMidi(midiAt(pos, { tuning }), { prefer }, { octave: false });
const where = (pos: NeckPosition): string => (pos.fret === 0 ? `open string ${pos.string}` : `string ${pos.string}, fret ${pos.fret}`);

function validStrings(strings: readonly number[] | undefined): boolean {
  return strings === undefined || (Array.isArray(strings) && strings.length > 0 && strings.every((s) => Number.isInteger(s) && s >= 1 && s <= 6));
}

/** How far from the root, in frets, a note still sits in the same hand position (and so belongs on the picture). */
const REACH = 4;

/** The degree label of an interval for a degree question: 1–7 for simple ones, 9 11 13 (♭9 ♯9 ♯11 ♭13) for compound ones; null otherwise. */
function degreeOfInterval(name: string): string | null {
  const ivl = parseInterval(name);
  if (!ivl) return null;
  if (ivl.semitones <= 12) return semitonesToDegree(ivl.semitones % 12);
  const degree = intervalToDegree(ivl.name);
  return /^[b#]?(9|11|13)$/.test(degree) ? degree : null;
}

const COMPOUND_DEGREES = ['b9', '9', '#9', '11', '#11', 'b13', '13'];
const COMPOUND_FALLBACK = ['m9', 'M9', 'm10', 'M10', 'P11', 'P12', 'm13', 'M13', 'P8', 'M7'];

/** A root and an interval placed on the neck: its answers, and the picture that shows them. */
interface Placement {
  ivl: string;
  root: NeckPosition;
  /** Answers inside the root's own fret range (what `name` and `degree` questions point at). */
  targets: NeckPosition[];
  /** Answers within a hand's reach of the root: the shapes a learner is taught. */
  near: NeckPosition[];
  /** Frets the picture shows: the root's range widened to hold `near`; null when that does not fit a phone. */
  picture: [number, number] | null;
}

function place(ivl: string, root: NeckPosition, lo: number, hi: number): Placement {
  const midi = midiAt(root) + interval(ivl).semitones;
  const notRoot = (t: NeckPosition): boolean => !(t.string === root.string && t.fret === root.fret);
  const targets = positionsForMidi(midi, { minFret: lo, maxFret: hi }).filter(notRoot);
  const everywhere = positionsForMidi(midi, { minFret: 0, maxFret: MAX_FRET }).filter(notRoot);
  let near = everywhere.filter((t) => Math.abs(t.fret - root.fret) <= REACH);
  // On the thinnest strings the only place may be further along the same string: show the nearest.
  if (near.length === 0 && everywhere.length > 0) {
    const gap = Math.min(...everywhere.map((t) => Math.abs(t.fret - root.fret)));
    near = everywhere.filter((t) => Math.abs(t.fret - root.fret) === gap);
  }
  const frets = [lo, hi, ...near.map((t) => t.fret)];
  const picture: [number, number] = [Math.min(...frets), Math.max(...frets)];
  const fits = near.length > 0 && picture[1] - picture[0] + 1 <= COUNT_LIMITS.fretSpan[1];
  return { ivl, root, targets, near, picture: fits ? picture : null };
}

/** Whether a placement can make a question of this kind. */
function usable(c: Placement, ask: 'find' | 'name' | 'degree'): boolean {
  const compound = interval(c.ivl).semitones > 12;
  // Simple intervals named on the neck keep the original rule (a second dot inside the root's range).
  if (!compound && ask !== 'find') return c.targets.length > 0;
  if (ask === 'degree' && degreeOfInterval(c.ivl) === null) return false;
  return c.picture !== null;
}

/** Every root position of the params, in a fixed order. */
function roots(strings: readonly number[], lo: number, hi: number): NeckPosition[] {
  return strings.flatMap((string) => Array.from({ length: hi - lo + 1 }, (_u, i) => ({ string, fret: lo + i })));
}

/** Wrong interval names for a compound answer: its simple twin (M2 for M9) first, then nearby sizes. */
function compoundDistractors(rng: Rng, answer: string, poolList: readonly string[]): string[] {
  const ivl = interval(answer);
  const candidates = [ivl.simple, ...distractorIntervals(answer, { count: 6 }), ...rng.shuffle(poolList), ...COMPOUND_FALLBACK];
  return distinct(candidates.filter((i) => (parseInterval(i)?.semitones ?? 0) >= 1 && (parseInterval(i)?.direction ?? 0) > 0), (i) => interval(i).semitones, 3, [ivl.semitones]);
}

export const intervalOnNeck = defineGenerator({
  kind: 'interval-on-neck',
  summary: 'A root is shown on the fretboard: find the note an interval above it, or name the interval or degree of a second dot. Compound intervals (9ths to 13ths) are named from a picture.',
  produces: ['fretboard-find', 'fretboard-name', 'choice'],
  params: [
    { name: 'intervals', type: 'string[]', default: 'P5 P4 M3 m3 P8 M2 m2 M6 m6 m7 M7 A4', description: 'Interval pool, easiest first. Compound intervals (M9, M10, P11, M13 ... up to P15) are allowed where the neck fits them.' },
    { name: 'ask', type: "'find' | 'name' | 'degree'", default: "'find'", description: 'Tap the note; name the interval; or name the scale degree (9, 11, 13 for compound intervals).' },
    { name: 'strings', type: 'number[]', default: '[6, 5]', description: 'Strings the root may be on.' },
    { name: 'frets', type: '[number, number]', default: '[0, 7]', description: 'Frets the root may be on, inclusive (at least 4 frets wide). The picture widens so every answer near the root is on it.' },
  ],
  check: (p) => {
    const check = checkParams()
      .intervals('intervals', p.intervals, 1, true)
      .oneOf('ask', p.ask, ['find', 'name', 'degree'])
      .need(validStrings(p.strings), '"strings" must be a list of string numbers from 1 to 6, like [6, 5].')
      .span('frets', p.frets, 0, 15, 3);
    if (check.problems.length > 0) return check.problems;
    const ask = p.ask ?? 'find';
    const [lo, hi] = p.frets ?? [0, 7];
    const all = roots(p.strings ?? [6, 5], lo, hi);
    for (const ivl of p.intervals ?? []) {
      if (interval(ivl).semitones <= 12) continue;
      if (ask === 'degree' && degreeOfInterval(ivl) === null) {
        check.need(false, `"${ivl}" has no degree name (degrees above the octave are 9, 11 and 13 with ♭ or ♯). Use ask: 'name' for it, or take it out.`);
      } else if (!all.some((root) => usable(place(ivl, root, lo, hi), ask))) {
        check.need(false, `"${ivl}" does not fit: from no root on strings ${(p.strings ?? [6, 5]).join(', ')} between frets ${lo} and ${hi} is it on the neck near enough to show. Use lower strings for the root or a lower interval.`);
      }
    }
    return check.problems;
  },
  make(p, { rng, difficulty }) {
    const intervals = pool(p.intervals ?? INTERVALS_EASY_FIRST, difficulty);
    const strings = p.strings ?? [6, 5];
    const [lo, hi] = p.frets ?? [0, 7];
    const ask = p.ask ?? 'find';
    const pick = retry(
      40,
      () => place(rng.pick(intervals), { string: rng.pick(strings), fret: rng.range(lo, hi) }, lo, hi),
      (c) => usable(c, ask),
      // Out of luck: the first placement that works, or a fifth above the low string's lowest fret.
      () => intervals.flatMap((ivl) => roots(strings, lo, hi).map((root) => place(ivl, root, lo, hi))).find((c) => usable(c, ask)) ?? place('P5', { string: 6, fret: lo }, lo, hi),
    );
    const ivl = interval(pick.ivl);
    const name = intervalName(ivl.name);
    const compound = ivl.semitones > 12;
    // The same spelling the grader's feedback uses, so prompt and answer agree.
    const { root: rootNote, target: targetNote } = spellInterval(midiAt(pick.root), ivl.name);
    const shown = [{ ...pick.root, role: 'root' as const, label: 'R' }];
    const size = compound
      ? `${count(ivl.semitones, 'half step')}, an octave plus ${article(intervalName(ivl.simple))} ${intervalName(ivl.simple)}`
      : `${count(ivl.semitones, 'half step')} (${count(ivl.semitones, 'fret')} on one string)`;
    const fact = `${cap(article(name))} ${name} above {n:${rootNote}} is {n:${targetNote}}: ${size} higher.`;
    if ((ask === 'name' || ask === 'degree') && compound) {
      // The lesson engine names positions up to an octave apart, so a compound interval is asked
      // as a choice beside a picture of both dots (the second one in the root's hand position).
      const position = rng.pick(pick.near);
      const figure = {
        kind: 'fretboard' as const,
        frets: pick.picture!,
        labels: 'none' as const,
        dots: [{ ...pick.root, role: 'root' as const, label: 'R' }, { ...position, role: 'target' as const, label: '?' }],
      };
      if (ask === 'degree') {
        const degree = degreeOfInterval(ivl.name)!;
        const wrong = distinct(
          [...COMPOUND_DEGREES].sort((a, b) => Math.abs(COMPOUND_DEGREES.indexOf(a) - COMPOUND_DEGREES.indexOf(degree)) - Math.abs(COMPOUND_DEGREES.indexOf(b) - COMPOUND_DEGREES.indexOf(degree))),
          (d) => d,
          3,
          [degree],
        );
        return choiceOf(
          rng,
          { prompt: `The root (R) is {n:${rootNote}}. Which degree is the other dot (?), counted above the octave?`, explain: `${fact} Above the octave, that note is the {d:${degree}}.`, figure },
          `{d:${degree}}`,
          wrong.map((d) => `{d:${d}}`),
        );
      }
      return choiceOf(
        rng,
        { prompt: `The root (R) is {n:${rootNote}}. What interval is the other dot (?) above it?`, explain: fact, figure },
        cap(name),
        compoundDistractors(rng, ivl.name, p.intervals ?? INTERVALS_EASY_FIRST).map((i) => cap(intervalName(i))),
      );
    }
    if (ask === 'name' || ask === 'degree') {
      const position = rng.pick(pick.targets);
      const base: Omit<FretboardNameExercise, 'ask' | 'options' | 'prompt' | 'explain'> = { type: 'fretboard-name', position, root: pick.root, spelling: 'any' };
      if (ask === 'degree') {
        const degree = semitonesToDegree(ivl.semitones % 12);
        const others = [1, -1, 2, -2, 3, -3].map((d) => semitonesToDegree((((ivl.semitones + d) % 12) + 12) % 12));
        const out: FretboardNameExercise = {
          ...base,
          ask: 'degree',
          options: rng.shuffle([degree, ...distinct(others, (d) => d, 3, [degree])]),
          prompt: `The root (R) is {n:${rootNote}}. Which scale degree is the other note?`,
          explain: `${fact} Counted from the root, that note is the {d:${degree}}.`,
        };
        return out;
      }
      const value = semitonesToInterval(ivl.semitones);
      const wrong = intervalDistractors(rng, value, p.intervals ?? INTERVALS_EASY_FIRST);
      const out: FretboardNameExercise = {
        ...base,
        ask: 'interval',
        options: rng.shuffle([value, ...wrong]),
        prompt: `The root (R) is {n:${rootNote}}. What interval is the other note above it?`,
        explain: fact,
      };
      return out;
    }
    const out: FretboardFindExercise = {
      type: 'fretboard-find',
      find: { interval: ivl.name, from: pick.root },
      mode: 'one',
      octave: 'exact',
      // Every answer within the root's hand position is on the picture, not just those inside `frets`.
      frets: pick.picture ?? [lo, hi],
      shown,
      prompt: `The dot (R) is {n:${rootNote}}. Tap the note ${article(name)} ${name} above it.`,
      explain: fact,
    };
    return out;
  },
});

export const noteOnString = defineGenerator({
  kind: 'note-on-string',
  summary: 'Notes along one string: name a position, find a note, or give its fret number.',
  produces: ['fretboard-name', 'fretboard-find', 'type-answer'],
  params: [
    { name: 'strings', type: 'number[]', default: '[6]', description: 'Strings to draw from.' },
    { name: 'frets', type: '[number, number]', default: '[0, 5]', description: 'Fret range, inclusive.' },
    { name: 'naturals', type: 'boolean', default: 'false', description: 'Only ask about natural notes.' },
    { name: 'ask', type: "'name' | 'find' | 'fret'", default: "'name'", description: 'Name the shown position; tap the named note; or type its fret number.' },
    { name: 'spelling', type: "'sharps' | 'flats' | 'both'", default: "'sharps'", description: 'Name the in-between notes with sharps, with flats, or either (each question picks one).' },
  ],
  check: (p) =>
    checkParams()
      .need(validStrings(p.strings), '"strings" must be a list of string numbers from 1 to 6, like [6, 5].')
      .span('frets', p.frets, 0, 15, 2)
      .bool('naturals', p.naturals)
      .oneOf('ask', p.ask, ['name', 'find', 'fret'])
      .oneOf('spelling', p.spelling, ['sharps', 'flats', 'both']).problems,
  make(p, { rng }) {
    const strings = p.strings ?? [6];
    const [lo, hi] = p.frets ?? [0, 5];
    const ask = p.ask ?? 'name';
    const string = rng.pick(strings);
    const frets = Array.from({ length: hi - lo + 1 }, (_u, i) => lo + i)
      .filter((f) => !p.naturals || NATURAL_PCS.has(midiAt({ string, fret: f }) % 12))
      // "Which fret is E?" on the E string has the dull answer zero.
      .filter((f) => ask !== 'fret' || f > 0 || hi === 0);
    const fret = rng.pick(frets.length ? frets : [lo]);
    const prefer: 'sharps' | 'flats' = p.spelling === 'flats' ? 'flats' : p.spelling === 'both' ? (rng.chance() ? 'sharps' : 'flats') : 'sharps';
    const position = { string, fret };
    const note = noteAtPos(position, undefined, prefer);
    const open = noteAtPos({ string, fret: 0 }, undefined, prefer);
    const walk = Array.from({ length: fret + 1 }, (_u, f) => noteAtPos({ string, fret: f }, undefined, prefer));
    const counted = fret === 0 ? `String ${string} played open is {n:${open}}.` : fret <= 5 ? `String ${string} is {n:${open}} when open, and each fret is a half step: ${noteList(walk, ', ')}.` : `String ${string} is {n:${open}} when open. Fret ${fret} is ${fret} half steps higher: {n:${note}}.`;
    if (ask === 'find') {
      const out: FretboardFindExercise = {
        type: 'fretboard-find',
        find: { note },
        mode: 'one',
        octave: 'any',
        frets: [lo, hi],
        strings: [string],
        prompt: `Find {n:${note}} on string ${string}.`,
        explain: counted,
      };
      return out;
    }
    if (ask === 'fret') {
      const same = positionsForPitchClass(parseNote(note)!.chroma, { minFret: lo, maxFret: hi }).filter((q) => q.string === string && q.fret !== fret).map((q) => q.fret);
      const out: TypeAnswerExercise = {
        type: 'type-answer',
        answer: same.length ? { kind: 'number', value: fret, accept: same } : { kind: 'number', value: fret },
        input: 'keypad',
        prompt: `On string ${string}, which fret is {n:${note}}?`,
        explain: counted,
      };
      return out;
    }
    const out: FretboardNameExercise = {
      type: 'fretboard-name',
      position,
      ask: 'note',
      spelling: 'any',
      // Wrong options use the drill's names too: a sharps drill never shows a flat.
      options: rng.shuffle([note, ...distractorNotes(note, { count: 3 }).map((n) => respell(n, prefer))]),
      prompt: `Which note is at ${where(position)}?`,
      explain: counted,
    };
    return out;
  },
});

export const openStrings = defineGenerator({
  kind: 'open-strings',
  summary: 'The names of the open strings: order them, name one, or find the string of a note.',
  produces: ['order', 'choice'],
  params: [
    { name: 'ask', type: "'order' | 'name' | 'number'", default: "'order'", description: 'Arrange low to high; which note is string N; or which string is the open N.' },
    { name: 'tuning', type: 'string', default: "'standard'", description: 'Tuning id (six strings).' },
  ],
  check: (p) => {
    const check = checkParams().oneOf('ask', p.ask, ['order', 'name', 'number']);
    try {
      check.need(resolveTuning(p.tuning).stringCount === 6, `"tuning" must be a six-string tuning; "${p.tuning}" is not.`);
    } catch {
      check.need(false, `"tuning" is "${p.tuning}", which the guitar engine does not know. Use an id such as standard or drop-d.`);
    }
    return check.problems;
  },
  make(p, { rng }) {
    const t = resolveTuning(p.tuning);
    const names = t.notes.map((n) => parseNote(n)!.pcName);
    const lowToHigh = `Low to high, the open strings are ${noteList(names)}.`;
    const explain = t.id === 'standard' ? `${lowToHigh} String 6 is the thickest, string 1 the thinnest.` : `${lowToHigh} That is ${t.name} tuning.`;
    const numberOf = (index: number): number => t.stringCount - index;
    if (p.ask === 'name') {
      const index = rng.int(names.length);
      const others = distinct(rng.shuffle(names), (n) => n, 3, [names[index]]);
      return choiceOf(rng, { prompt: `Which note is the open ${ordinal(numberOf(index))} string?`, explain }, `{n:${names[index]}}`, others.map((n) => `{n:${n}}`));
    }
    if (p.ask === 'number') {
      const unique = names.map((n, i) => ({ n, i })).filter(({ n }) => names.filter((m) => m === n).length === 1);
      const pick = rng.pick(unique.length ? unique : [{ n: names[1], i: 1 }]);
      const others = rng.shuffle(names.map((n, i) => ({ n, i })).filter(({ n }) => n !== pick.n)).slice(0, 3);
      return choiceOf(
        rng,
        { prompt: `Which string is the open {n:${pick.n}}?`, explain },
        `String ${numberOf(pick.i)}`,
        others.map(({ i }) => `String ${numberOf(i)}`),
      );
    }
    const out: OrderExercise = {
      type: 'order',
      prompt: 'Put the open strings in order, from the thickest (string 6) to the thinnest (string 1).',
      tiles: names.map((n) => `{n:${n}}`),
      explain,
    };
    return out;
  },
});

export const chordShape = defineGenerator({
  kind: 'chord-shape',
  summary: 'Build an open chord on the fretboard by placing the fingers.',
  produces: ['chord-build'],
  params: [
    { name: 'chords', type: 'string[]', default: 'Em Am E A D G C Dm', description: 'Chord pool, easiest first. Each needs a shape in the chord library.' },
    { name: 'accept', type: "'any-voicing' | 'this-shape'", default: "'any-voicing'", description: 'Accept any correct voicing, or only the library shape.' },
  ],
  check: (p) =>
    checkParams()
      .list('chords', p.chords, (c) => typeof c === 'string' && parseChord(c) !== null && chordVoicings(c).length > 0, "['Em', 'Am', 'G']")
      .oneOf('accept', p.accept, ['any-voicing', 'this-shape']).problems,
  make(p, { rng, difficulty }) {
    const symbol = rng.pick(pool(p.chords ?? ['Em', 'Am', 'E', 'A', 'D', 'G', 'C', 'Dm'], difficulty));
    const voicing = chordVoicings(symbol)[0];
    // A barre is one finger across several strings: say so instead of listing every string under it.
    const barre = voicing.barres[0];
    const under = (n: { string: number; fret: number }): boolean =>
      !!barre && n.fret === barre.fret && n.string >= Math.min(barre.fromString, barre.toString) && n.string <= Math.max(barre.fromString, barre.toString);
    const fretted = voicing.notes.filter((n) => n.fret > 0 && !under(n)).map((n) => `string ${n.string} fret ${n.fret} ({n:${n.note}})`);
    const press = barre
      ? `Lay your index finger across fret ${barre.fret} from string ${Math.max(barre.fromString, barre.toString)} to string ${Math.min(barre.fromString, barre.toString)} (a {t:barre})${fretted.length ? `, then press ${fretted.join(', ')}` : ''}`
      : `Press ${fretted.join(', ')}`;
    const open = voicing.notes.filter((n) => n.fret === 0).length;
    const out: ChordBuildExercise = {
      type: 'chord-build',
      task: 'fingers',
      chord: symbol,
      frets: [...voicing.frets],
      accept: p.accept ?? 'any-voicing',
      prompt: `Build {c:${symbol}}: put your fingers on the fretboard.`,
      explain: `{c:${symbol}} is ${noteList(chordNotes(symbol), ', ')}. ${press}${open ? `; the ${open === 1 ? 'open string adds' : 'open strings add'} the rest` : ''}.`,
    };
    return out;
  },
});

export const neckTones = defineGenerator({
  kind: 'neck-tones',
  summary: 'Tap every note of a chord or scale inside a small box of the neck.',
  produces: ['fretboard-find'],
  params: [
    { name: 'what', type: "'chord' | 'scale'", default: "'chord'", description: 'Find chord tones or scale notes.' },
    { name: 'chords', type: 'string[]', default: 'C G D A E Am Em Dm', description: 'Chord pool, easiest first.' },
    { name: 'scales', type: 'string[]', default: "['minor-pentatonic', 'major']", description: 'Scale ids, easiest first.' },
    { name: 'tonics', type: 'string[]', default: 'A E G C D', description: 'Tonic pool for scales.' },
    { name: 'span', type: 'number', default: '4', description: 'Width of the box in frets, 3 to 5.' },
    { name: 'strings', type: 'number[]', default: '[6, 5, 4]', description: 'Strings of the box (at most three).' },
  ],
  check: (p) =>
    checkParams()
      .oneOf('what', p.what, ['chord', 'scale'])
      .list('chords', p.chords, (c) => typeof c === 'string' && parseChord(c) !== null, "['C', 'Am']")
      .scales('scales', p.scales)
      .notes('tonics', p.tonics)
      .int('span', p.span, 3, 5)
      .need(validStrings(p.strings) && (p.strings?.length ?? 3) <= 3, '"strings" must list one to three string numbers from 1 to 6, like [6, 5, 4].').problems,
  make(p, { rng, difficulty }) {
    const strings = p.strings ?? [6, 5, 4];
    const span = p.span ?? 4;
    const scale = p.what === 'scale' ? getScale(rng.pick(pool(p.scales ?? ['minor-pentatonic', 'major'], difficulty, 1)))! : null;
    const tonic = rng.pick(p.tonics ?? ['A', 'E', 'G', 'C', 'D']);
    const chord = rng.pick(pool(p.chords ?? ['C', 'G', 'D', 'A', 'E', 'Am', 'Em', 'Dm'], difficulty));
    const pcs = scale ? scalePcs(tonic, scale) : chordPcs(chord);
    const countIn = (lo: number): number => pcs.flatMap((pc) => positionsForPitchClass(pc, { minFret: lo, maxFret: lo + span - 1 })).filter((q) => strings.includes(q.string)).length;
    // Open position first: it is where beginners live. Otherwise any box with a sensible number of targets.
    const lo = retry(12, () => (rng.chance(0.5) ? 0 : rng.range(0, 7)), (start) => countIn(start) >= 2 && countIn(start) <= 12, () => 0);
    const frets: [number, number] = [lo, lo + span - 1];
    const box = `strings ${strings.join(', ')}, frets ${frets[0]} to ${frets[1]}`;
    const notes = scale ? scaleNotes(tonic, scale) : chordNotes(chord);
    // "Every note of D" could mean every D; say "the D chord" / "the D minor pentatonic scale".
    const label = scale ? `the {n:${tonic}} ${scaleTitle(scale.name)} scale` : `the {c:${chord}} chord`;
    const out: FretboardFindExercise = {
      type: 'fretboard-find',
      find: scale ? { scale: scale.id, tonic } : { chord },
      mode: 'all',
      octave: 'any',
      frets,
      strings,
      prompt: `Tap every note of ${label} on ${box}.`,
      explain: `${cap(label)} is ${noteList(notes, ', ')}. Every one of those notes inside the box counts, in any octave.`,
    };
    return out;
  },
});

export const playNote = defineGenerator({
  kind: 'play-note',
  summary: 'Play a note of a string into the microphone. Falls back to tapping it on the fretboard.',
  produces: ['play-note'],
  mic: true,
  params: [
    { name: 'strings', type: 'number[]', default: '[6, 5, 4, 3, 2, 1]', description: 'Strings to draw from.' },
    { name: 'frets', type: '[number, number]', default: '[0, 3]', description: 'Fret range, inclusive.' },
    { name: 'naturals', type: 'boolean', default: 'true', description: 'Only natural notes.' },
  ],
  check: (p) =>
    checkParams()
      .need(validStrings(p.strings), '"strings" must be a list of string numbers from 1 to 6, like [6, 5].')
      .span('frets', p.frets, 0, 15)
      .bool('naturals', p.naturals).problems,
  make(p, { rng }) {
    const [lo, hi] = p.frets ?? [0, 3];
    const string = rng.pick(p.strings ?? [6, 5, 4, 3, 2, 1]);
    const frets = Array.from({ length: hi - lo + 1 }, (_u, i) => lo + i).filter((f) => p.naturals === false || NATURAL_PCS.has(midiAt({ string, fret: f }) % 12));
    const fret = rng.pick(frets.length ? frets : [lo]);
    const position = { string, fret };
    const midi = midiAt(position);
    const full = spellMidi(midi, { prefer: 'sharps' });
    const note = parseNote(full)!.pcName;
    const open = noteAtPos({ string, fret: 0 });
    const explain = fret === 0 ? `The open ${ordinal(string)} string is {n:${note}}.` : `String ${string}, fret ${fret} is {n:${note}}: ${count(fret, 'half step')} above the open {n:${open}}.`;
    const alternative: Exercise = {
      type: 'fretboard-find',
      find: { note: full },
      mode: 'one',
      octave: 'exact',
      frets: [Math.min(lo, 0), Math.max(hi, 4)],
      strings: [string],
      prompt: `Tap {n:${note}} on string ${string}.`,
      explain,
    };
    const out: PlayNoteExercise = {
      type: 'play-note',
      note: full,
      octave: 'exact',
      where: position,
      prompt: fret === 0 ? `Play the open ${ordinal(string)} string: {n:${note}}.` : `Play {n:${note}}: string ${string}, fret ${fret}.`,
      explain,
      alternative,
    };
    return out;
  },
});

/** The fretboard generators. */
export const NECK_GENERATORS = [intervalOnNeck, noteOnString, openStrings, chordShape, neckTones, playNote] as const;
