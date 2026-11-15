/**
 * Generators that live on the fretboard: notes along a string, intervals from a root, chord
 * shapes, chord and scale tones in a region, and playing a note into the microphone.
 * Pitches come from the guitar engine (`midiAt`), spellings from the theory engine.
 */
import { chordVoicings, midiAt, positionsForMidi, positionsForPitchClass, spellMidi, tuning as resolveTuning } from '@/core/guitar';
import {
  chordNotes, chordPcs, distractorIntervals, distractorNotes, getScale, interval, intervalName, parseChord, parseNote, scaleNotes,
  scalePcs, semitonesToDegree, semitonesToInterval,
} from '@/core/theory';
import { spellInterval } from '../grade';
import type {
  ChordBuildExercise, Exercise, FretboardFindExercise, FretboardNameExercise, NeckPosition, OrderExercise, PlayNoteExercise, TypeAnswerExercise,
} from '../types';
import { article, cap, checkParams, choiceOf, count, defineGenerator, distinct, noteList, ordinal, pool, retry } from './core';

const NATURAL_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);
const INTERVALS_EASY_FIRST = ['P5', 'P4', 'M3', 'm3', 'P8', 'M2', 'm2', 'M6', 'm6', 'm7', 'M7', 'A4'];

// Going up a string, notes are named with sharps throughout (E F F# G G# A), never a mix of sharps and flats.
const noteAtPos = (pos: NeckPosition, tuning?: string): string => spellMidi(midiAt(pos, { tuning }), { prefer: 'sharps' }, { octave: false });
const where = (pos: NeckPosition): string => (pos.fret === 0 ? `open string ${pos.string}` : `string ${pos.string}, fret ${pos.fret}`);

function validStrings(strings: readonly number[] | undefined): boolean {
  return strings === undefined || (Array.isArray(strings) && strings.length > 0 && strings.every((s) => Number.isInteger(s) && s >= 1 && s <= 6));
}

export const intervalOnNeck = defineGenerator({
  kind: 'interval-on-neck',
  summary: 'A root is shown on the fretboard: find the note an interval above it, or name the interval or degree of a second dot.',
  produces: ['fretboard-find', 'fretboard-name'],
  params: [
    { name: 'intervals', type: 'string[]', default: 'P5 P4 M3 m3 P8 M2 m2 M6 m6 m7 M7 A4', description: 'Interval pool, easiest first.' },
    { name: 'ask', type: "'find' | 'name' | 'degree'", default: "'find'", description: 'Tap the note; name the interval; or name the scale degree.' },
    { name: 'strings', type: 'number[]', default: '[6, 5]', description: 'Strings the root may be on.' },
    { name: 'frets', type: '[number, number]', default: '[0, 7]', description: 'Fret range used, inclusive (at least 4 frets wide).' },
  ],
  check: (p) =>
    checkParams()
      .intervals('intervals', p.intervals)
      .oneOf('ask', p.ask, ['find', 'name', 'degree'])
      .need(validStrings(p.strings), '"strings" must be a list of string numbers from 1 to 6, like [6, 5].')
      .span('frets', p.frets, 0, 15, 3).problems,
  make(p, { rng, difficulty }) {
    const intervals = pool(p.intervals ?? INTERVALS_EASY_FIRST, difficulty);
    const strings = p.strings ?? [6, 5];
    const [lo, hi] = p.frets ?? [0, 7];
    const range = { minFret: lo, maxFret: hi };
    const candidate = (ivl: string, root: NeckPosition): { ivl: string; root: NeckPosition; targets: NeckPosition[] } => ({
      ivl,
      root,
      targets: positionsForMidi(midiAt(root) + interval(ivl).semitones, range).filter((t) => !(t.string === root.string && t.fret === root.fret)),
    });
    const pick = retry(
      40,
      () => candidate(rng.pick(intervals), { string: rng.pick(strings), fret: rng.range(lo, hi) }),
      (c) => c.targets.length > 0,
      // A fifth above the low string's lowest fret is always two frets up on the next string.
      () => candidate('P5', { string: 6, fret: lo }),
    );
    const ivl = interval(pick.ivl);
    const name = intervalName(ivl.name);
    // The same spelling the grader's feedback uses, so prompt and answer agree.
    const { root: rootNote, target: targetNote } = spellInterval(midiAt(pick.root), ivl.name);
    const shown = [{ ...pick.root, role: 'root' as const, label: 'R' }];
    const fact = `${cap(article(name))} ${name} above {n:${rootNote}} is {n:${targetNote}}: ${count(ivl.semitones, 'half step')} (${count(ivl.semitones, 'fret')} on one string) higher.`;
    if (p.ask === 'name' || p.ask === 'degree') {
      const position = rng.pick(pick.targets);
      const base: Omit<FretboardNameExercise, 'ask' | 'options' | 'prompt' | 'explain'> = { type: 'fretboard-name', position, root: pick.root, spelling: 'any' };
      if (p.ask === 'degree') {
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
      const out: FretboardNameExercise = {
        ...base,
        ask: 'interval',
        options: rng.shuffle([value, ...distractorIntervals(value, { count: 3 })]),
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
      frets: [lo, hi],
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
  ],
  check: (p) =>
    checkParams()
      .need(validStrings(p.strings), '"strings" must be a list of string numbers from 1 to 6, like [6, 5].')
      .span('frets', p.frets, 0, 15, 2)
      .bool('naturals', p.naturals)
      .oneOf('ask', p.ask, ['name', 'find', 'fret']).problems,
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
    const position = { string, fret };
    const note = noteAtPos(position);
    const open = noteAtPos({ string, fret: 0 });
    const walk = Array.from({ length: fret + 1 }, (_u, f) => noteAtPos({ string, fret: f }));
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
      options: rng.shuffle([note, ...distractorNotes(note, { count: 3 })]),
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
    const fretted = voicing.notes.filter((n) => n.fret > 0).map((n) => `string ${n.string} fret ${n.fret} ({n:${n.note}})`);
    const open = voicing.notes.filter((n) => n.fret === 0).length;
    const out: ChordBuildExercise = {
      type: 'chord-build',
      task: 'fingers',
      chord: symbol,
      frets: [...voicing.frets],
      accept: p.accept ?? 'any-voicing',
      prompt: `Build {c:${symbol}}: put your fingers on the fretboard.`,
      explain: `{c:${symbol}} is ${noteList(chordNotes(symbol), ', ')}. Press ${fretted.join(', ')}${open ? `; the ${open === 1 ? 'open string adds' : 'open strings add'} the rest` : ''}.`,
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
    const label = scale ? `{n:${tonic}} ${scale.name.toLowerCase()}` : `{c:${chord}}`;
    const out: FretboardFindExercise = {
      type: 'fretboard-find',
      find: scale ? { scale: scale.id, tonic } : { chord },
      mode: 'all',
      octave: 'any',
      frets,
      strings,
      prompt: `Tap every note of ${label} on ${box}.`,
      explain: `${label} is ${noteList(notes, ', ')}. Every one of those notes inside the box counts, in any octave.`,
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
