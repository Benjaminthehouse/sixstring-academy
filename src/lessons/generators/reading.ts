/**
 * Reading generators: a bar of tab (name it, find it, play it), a sight-reading passage on the
 * staff that stays in one key and one hand position, and key signatures on the staff. Pitches come
 * from the guitar engine (`midiAt`), spellings from the theory engine (`spellInKey`, `spellMidi`).
 */
import { midiAt, spellMidi } from '@/core/guitar';
import { getKey, parseNote, scalePcs, spellInKey, type Key } from '@/core/theory';
import { MAX_FRET } from '../limits';
import type { Rng } from '../rng';
import type {
  ChoiceExercise, FretboardFindExercise, NeckPosition, PlayPhraseExercise, StaffFigure, StaffReadExercise, TabFigure, TabNote,
} from '../types';
import { checkParams, choiceOf, count, defineGenerator, distinct, keyPool, keysFromList, keysUpTo, noteList, ordinal, pool, retry } from './core';

const NATURAL_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);

type Fretted = { string: number; fret: number; duration: string };

const nameOf = (midi: number): string => spellMidi(midi, { prefer: 'sharps' }, { octave: false });
const fullNameOf = (midi: number): string => spellMidi(midi, { prefer: 'sharps' });
const pcKey = (names: readonly string[]): string => names.map((n) => parseNote(n)?.chroma ?? -1).join('.');

function validStrings(strings: readonly number[] | undefined): boolean {
  return strings === undefined || (Array.isArray(strings) && strings.length > 0 && strings.every((s) => Number.isInteger(s) && s >= 1 && s <= 6));
}

// ── A bar of tab ───────────────────────────────────────────────────────────────────────────────

/** Durations that fill one bar of 4/4 with `n` notes: quarters up to four notes, eighths above, the last note held. */
export function barDurations(n: number): string[] {
  if (n <= 4) return [['w'], ['h', 'h'], ['q', 'q', 'h'], ['q', 'q', 'q', 'q']][Math.max(0, n - 1)];
  const last: Record<number, string> = { 5: 'h', 6: 'q.', 7: 'q', 8: 'e' };
  return [...Array.from({ length: n - 1 }, () => 'e'), last[n]];
}

interface TabSettings {
  strings: number[];
  frets: [number, number];
  length: number;
  naturals: boolean;
}

function tabSettings(p: { strings?: number[]; frets?: [number, number]; length?: number; naturals?: boolean }): TabSettings {
  return { strings: p.strings ?? [1, 2], frets: p.frets ?? [0, 3], length: p.length ?? 4, naturals: p.naturals !== false };
}

/** The places a bar may use. */
function tabPlaces(s: TabSettings): NeckPosition[] {
  const out: NeckPosition[] = [];
  for (const string of s.strings) {
    for (let fret = s.frets[0]; fret <= s.frets[1]; fret++) {
      if (!s.naturals || NATURAL_PCS.has(midiAt({ string, fret }) % 12)) out.push({ string, fret });
    }
  }
  return out;
}

function tabCheck(p: { strings?: number[]; frets?: [number, number]; length?: number; naturals?: boolean }): string[] {
  const check = checkParams()
    .need(validStrings(p.strings), '"strings" must be a list of string numbers from 1 to 6, like [1, 2].')
    .span('frets', p.frets, 0, 15, 1)
    .need(!p.frets || !Array.isArray(p.frets) || p.frets[1] - p.frets[0] <= 12, '"frets" may span 12 frets at most, so the bar fits one picture.')
    .int('length', p.length, 3, 8)
    .bool('naturals', p.naturals);
  if (check.problems.length > 0) return check.problems;
  const pitches = new Set(tabPlaces(tabSettings(p)).map((q) => midiAt(q)));
  check.need(pitches.size >= 3, 'These strings and frets give fewer than three different notes. Add strings, widen "frets", or allow sharps (naturals: false).');
  return check.problems;
}

/** A bar: a walk over the allowed places, mostly by small leaps, never the same place twice in a row. */
function makeBar(rng: Rng, s: TabSettings): Fretted[] {
  const places = tabPlaces(s);
  const durations = barDurations(s.length);
  return retry(
    20,
    () => {
      const out: NeckPosition[] = [rng.pick(places)];
      while (out.length < s.length) {
        const prev = out[out.length - 1];
        const near = places.filter((q) => !(q.string === prev.string && q.fret === prev.fret) && Math.abs(midiAt(q) - midiAt(prev)) <= 5);
        out.push(rng.pick(near.length ? near : places.filter((q) => q !== prev)));
      }
      return out.map((q, i) => ({ ...q, duration: durations[i] }));
    },
    (bar) => new Set(bar.map((q) => midiAt(q))).size >= Math.min(3, s.length),
    () => places.slice(0, s.length).map((q, i) => ({ ...q, duration: durations[i] })),
  );
}

const tabFigure = (bar: readonly Fretted[]): TabFigure => ({ kind: 'tab', notes: bar.map((n) => ({ string: n.string, fret: n.fret, duration: n.duration })), time: '4/4' });
const HOW_TAB_READS = 'Each line is a string, the top line the thinnest (string 1); each number is a fret.';

/** The notes a learner names when they read the bar wrongly, each a classic tab mistake. */
function misreadings(rng: Rng, bar: readonly Fretted[], s: TabSettings): string[][] {
  const names = (q: ReadonlyArray<{ string: number; fret: number }>): string[] => q.map((n) => nameOf(midiAt(n)));
  const places = tabPlaces(s);
  const singleChanges: string[][] = [];
  for (const i of rng.shuffle(bar.map((_n, index) => index))) {
    for (const q of rng.shuffle(places.filter((q) => q.string === bar[i].string && q.fret !== bar[i].fret && midiAt(q) !== midiAt(bar[i])))) {
      singleChanges.push(names(bar.map((n, j) => (j === i ? q : n))));
      break;
    }
  }
  return [
    // Upside down: the top line read as the thickest string.
    names(bar.map((n) => ({ string: 7 - n.string, fret: n.fret }))),
    // The string's own name instead of the fretted note.
    names(bar.map((n) => ({ string: n.string, fret: 0 }))),
    // Every fret counted one short.
    names(bar.map((n) => ({ string: n.string, fret: Math.max(0, n.fret - 1) }))),
    ...singleChanges,
  ];
}

/** The wrong note lists for a bar: misreadings with a different sound, natural notes only when the drill is. */
function wrongLists(rng: Rng, bar: readonly Fretted[], s: TabSettings, n: number): string[][] {
  const right = bar.map((q) => nameOf(midiAt(q)));
  return distinct(
    misreadings(rng, bar, s).filter((list) => !s.naturals || list.every((name) => parseNote(name)!.alt === 0)),
    pcKey,
    n,
    [pcKey(right)],
  );
}

/** The "which notes does this bar play" question (also the microphone drill's fallback). */
function namesQuestion(rng: Rng, bar: readonly Fretted[], s: TabSettings): ChoiceExercise {
  const right = bar.map((q) => nameOf(midiAt(q)));
  return choiceOf(
    rng,
    { prompt: 'Which notes does this bar of tab play?', explain: `${HOW_TAB_READS} This bar plays ${noteList(right)}.`, figure: tabFigure(bar) },
    noteList(right),
    wrongLists(rng, bar, s, 3).map((list) => noteList(list)),
  );
}

const tabParamDocs = [
  { name: 'strings', type: 'number[]', default: '[1, 2]', description: 'Strings the bar uses.' },
  { name: 'frets', type: '[number, number]', default: '[0, 3]', description: 'Fret range, inclusive (12 frets wide at most).' },
  { name: 'length', type: 'number', default: '4', description: 'Notes in the bar, 3 to 8 (quarters up to four, eighths above).' },
  { name: 'naturals', type: 'boolean', default: 'true', description: 'Only natural notes (and only natural wrong options).' },
];

export const tabRead = defineGenerator({
  kind: 'tab-read',
  summary: 'A bar of tab is shown: name its notes, name one of them, or tap where one is played.',
  produces: ['choice', 'fretboard-find'],
  params: [{ name: 'ask', type: "'notes' | 'note' | 'find'", default: "'notes'", description: 'Which notes the bar plays; which is the Nth note; or tap where the Nth note is played.' }, ...tabParamDocs],
  check: (p) => [...checkParams().oneOf('ask', p.ask, ['notes', 'note', 'find']).problems, ...tabCheck(p)],
  make(p, { rng }) {
    const s = tabSettings(p);
    const bar = makeBar(rng, s);
    const ask = p.ask ?? 'notes';
    if (ask === 'notes') return namesQuestion(rng, bar, s);
    const index = rng.int(bar.length);
    const q = bar[index];
    const midi = midiAt(q);
    const name = nameOf(midi);
    const located = `The ${ordinal(index + 1)} number, ${q.fret}, is on the ${ordinal(q.string)} line from the top: string ${q.string}. ${q.fret === 0 ? `Played open, string ${q.string} is` : `Fret ${q.fret} of string ${q.string} is`} {n:${name}}.`;
    if (ask === 'find') {
      const out: FretboardFindExercise = {
        type: 'fretboard-find',
        find: { note: fullNameOf(midi) },
        mode: 'one',
        octave: 'exact',
        frets: [Math.max(0, s.frets[1] - 12), Math.max(4, s.frets[1])],
        figure: tabFigure(bar),
        prompt: `Tap the place this tab plays its ${ordinal(index + 1)} note.`,
        explain: `${located} The same pitch anywhere else counts too.`,
      };
      return out;
    }
    const open = nameOf(midiAt({ string: q.string, fret: 0 }));
    const flipped = nameOf(midiAt({ string: 7 - q.string, fret: q.fret }));
    const neighbours = [1, -1, 2, -2, 3, -3, 4, 5]
      .map((d) => q.fret + d)
      .filter((f) => f >= 0 && f <= MAX_FRET)
      .map((f) => nameOf(midiAt({ string: q.string, fret: f })));
    const wrong = distinct([open, flipped, ...neighbours].filter((n) => !s.naturals || parseNote(n)!.alt === 0), (n) => parseNote(n)!.chroma, 3, [parseNote(name)!.chroma]);
    return choiceOf(
      rng,
      { prompt: `Which note is the ${ordinal(index + 1)} note of this bar?`, explain: located, figure: tabFigure(bar) },
      `{n:${name}}`,
      wrong.map((n) => `{n:${n}}`),
    );
  },
});

export const tabPlay = defineGenerator({
  kind: 'tab-play',
  summary: 'Play a generated bar of tab into the microphone. Falls back to naming its notes.',
  produces: ['play-phrase'],
  mic: true,
  params: [...tabParamDocs, { name: 'tempo', type: 'number', default: '70', description: 'Beats per minute, 40 to 120.' }],
  check: (p) => [...tabCheck(p), ...checkParams().int('tempo', p.tempo, 40, 120).problems],
  make(p, { rng }) {
    const s = tabSettings(p);
    const bar = makeBar(rng, s);
    const names = bar.map((q) => nameOf(midiAt(q)));
    const out: PlayPhraseExercise = {
      type: 'play-phrase',
      notes: bar.map((n): TabNote => ({ string: n.string, fret: n.fret, duration: n.duration })),
      octave: 'exact',
      tempo: p.tempo ?? 70,
      prompt: 'Play this bar of tab, one note at a time.',
      explain: `${HOW_TAB_READS} The bar is ${noteList(names)}.`,
      alternative: namesQuestion(rng, bar, s),
    };
    return out;
  },
});

// ── Sight-reading ──────────────────────────────────────────────────────────────────────────────

const SIGHT_KEYS = ['C major', 'A minor', 'G major', 'E minor', 'F major', 'D major'];

/** The frets a hand position covers: first position is frets 1–4 with the open strings, position N is frets N to N+3. */
export function positionFrets(position: number): [number, number] {
  return position <= 1 ? [0, 4] : [position, position + 3];
}

const positionWords = (position: number): string => (position <= 1 ? 'first position' : `${ordinal(position)} position`);

/** Every note of the key a hand position reaches, low to high, each at its place (open strings first in first position). */
export function positionNotes(key: Key, position: number): Array<{ midi: number; at: NeckPosition }> {
  const pcs = new Set(scalePcs(key.tonic, key.mode === 'minor' ? 'minor' : 'major'));
  const [lo, hi] = positionFrets(position);
  const byMidi = new Map<number, NeckPosition>();
  for (let string = 6; string >= 1; string--) {
    for (let fret = lo; fret <= hi; fret++) {
      const midi = midiAt({ string, fret });
      if (!pcs.has(midi % 12)) continue;
      const known = byMidi.get(midi);
      // Two places in reach (B on the open 2nd string or the 3rd string's fourth fret): the lower fret wins.
      if (!known || fret < known.fret) byMidi.set(midi, { string, fret });
    }
  }
  return [...byMidi.entries()].sort((a, b) => a[0] - b[0]).map(([midi, at]) => ({ midi, at }));
}

/** At most this many notes in a passage: it has to fit a phone screen as a staff and as a line of note names. */
const MAX_PASSAGE_NOTES = 12;

/** Note values of 1 or 2 bars of 4/4 (quarters, plus eighth pairs and halves when allowed), 4 to 12 notes. */
function sightRhythm(rng: Rng, bars: number, values: ReadonlyArray<'half' | 'quarter' | 'eighth'>): string[] {
  return retry(
    20,
    () => {
      const out: string[] = [];
      let pairs = 0;
      for (let bar = 0; bar < bars; bar++) {
        for (let beat = 0; beat < 4; ) {
          const cells: string[][] = [['q']];
          if (values.includes('eighth') && pairs < MAX_PASSAGE_NOTES - bars * 4) cells.push(['e', 'e']);
          if (values.includes('half') && beat % 2 === 0) cells.push(['h']);
          const cell = rng.pick(cells);
          out.push(...cell);
          if (cell.length === 2) pairs++;
          beat += cell[0] === 'h' ? 2 : 1;
        }
      }
      return out;
    },
    (durations) => durations.length >= 4 && durations.length <= MAX_PASSAGE_NOTES,
    () => Array.from({ length: bars * 4 }, () => 'q'),
  );
}

interface Passage {
  key: Key;
  position: number;
  midis: number[];
  places: NeckPosition[];
  durations: string[];
}

/** A passage: a stepwise walk through the key inside the position, from a tonic back to a tonic. */
function makePassage(rng: Rng, key: Key, position: number, durations: string[]): Passage {
  const notes = positionNotes(key, position);
  const tonicPc = parseNote(key.tonic)!.chroma;
  const tonics = notes.map((n, i) => ({ n, i })).filter(({ n }) => n.midi % 12 === tonicPc).map(({ i }) => i);
  const n = durations.length;
  const steps = [1, -1, 1, -1, 2, -2, 1, -1, 3, -3, 0];
  const indexes = retry(
    40,
    () => {
      const out = [rng.pick(tonics)];
      while (out.length < n - 1) {
        const prev = out[out.length - 1];
        let next = prev + rng.pick(steps);
        if (next < 0 || next >= notes.length) next = prev - (next - prev);
        out.push(Math.max(0, Math.min(notes.length - 1, next)));
      }
      const last = out[out.length - 1];
      const home = tonics.reduce((best, t) => (Math.abs(t - last) < Math.abs(best - last) ? t : best), tonics[0]);
      out.push(home);
      return out;
    },
    (idx) => Math.abs(idx[idx.length - 1] - idx[idx.length - 2]) <= 3 && new Set(idx).size >= Math.min(4, n - 1),
    // A scale run up from the lowest tonic and back.
    () => Array.from({ length: n }, (_u, i) => Math.min(notes.length - 1, tonics[0] + (i < n / 2 ? i : n - 1 - i))),
  );
  return { key, position, midis: indexes.map((i) => notes[i].midi), places: indexes.map((i) => notes[i].at), durations };
}

const passageNames = (passage: Passage, midis: readonly number[] = passage.midis): string[] => midis.map((m) => spellInKey(m % 12, passage.key));

function staffOf(passage: Passage): StaffFigure {
  return {
    kind: 'staff',
    key: passage.key.name,
    time: '4/4',
    notes: passage.midis.map((m, i) => ({ note: spellInKey(m, passage.key), duration: passage.durations[i] })),
  };
}

function tabOf(places: readonly NeckPosition[], durations: readonly string[]): TabFigure {
  return { kind: 'tab', time: '4/4', notes: places.map((q, i) => ({ string: q.string, fret: q.fret, duration: durations[i] })) };
}

/** What the key signature does, in words: "G major has F♯ in its signature". */
function signatureWords(key: Key): string {
  const acc = key.signature.accidentals;
  return acc.length === 0 ? `{k:${key.name}} has no sharps or flats.` : `{k:${key.name}} has ${noteList(acc, ', ')} in its signature.`;
}

export const sightReading = defineGenerator({
  kind: 'sight-reading',
  summary: 'A short passage on the staff that stays in one key and one hand position: name its notes, or choose the tab that plays it.',
  produces: ['choice'],
  params: [
    { name: 'ask', type: "'notes' | 'tab'", default: "'notes'", description: 'Which notes the passage plays; or which tab plays it in the position.' },
    { name: 'positions', type: 'number[]', default: '[1]', description: 'Hand positions (fret of the index finger, 1 to 12), easiest first. 1 is first position with the open strings.' },
    { name: 'keys', type: 'string[]', default: 'C major, A minor, G major, E minor, F major, D major', description: 'Keys, easiest first. Minor keys use their natural minor notes.' },
    { name: 'bars', type: 'number', default: '2', description: 'Bars of 4/4, 1 or 2.' },
    { name: 'values', type: "('half' | 'quarter' | 'eighth')[]", default: "['quarter']", description: 'Note values the rhythm may use.' },
  ],
  check: (p) => {
    const check = checkParams()
      .oneOf('ask', p.ask, ['notes', 'tab'])
      .list('positions', p.positions, (n) => Number.isInteger(n) && n >= 1 && n <= 12, '[1, 2, 5, 7]')
      .keys('keys', p.keys)
      .int('bars', p.bars, 1, 2)
      .list('values', p.values, (v) => v === 'half' || v === 'quarter' || v === 'eighth', "['quarter', 'eighth']")
      .need(!p.values || p.values.includes('quarter'), '"values" must include quarter: the passage is built on quarter-note beats, with eighths and halves mixed in.');
    if (check.problems.length > 0) return check.problems;
    for (const key of keysFromList(p.keys ?? SIGHT_KEYS)) {
      for (const position of p.positions ?? [1]) {
        const notes = positionNotes(key, position);
        const tonicPc = parseNote(key.tonic)!.chroma;
        check.need(notes.some((n) => n.midi % 12 === tonicPc) && notes.length >= 8, `In ${positionWords(position)}, ${key.name} has too few notes in reach for a passage. Use another position or key.`);
      }
    }
    return check.problems;
  },
  make(p, { rng, difficulty }) {
    const keys = pool(keysFromList(p.keys ?? SIGHT_KEYS), difficulty, 2);
    const key = rng.pick(keys);
    const position = rng.pick(pool(p.positions ?? [1], difficulty, 1));
    const durations = sightRhythm(rng, p.bars ?? 2, p.values ?? ['quarter']);
    const passage = makePassage(rng, key, position, durations);
    const names = passageNames(passage);
    const [lo, hi] = positionFrets(position);
    const where = `${positionWords(position)} (frets ${lo === 0 ? `${lo} to ${hi}, open strings too` : `${lo} to ${hi}`})`;
    const notesIndex = positionNotes(key, position);
    const indexOf = (midi: number): number => notesIndex.findIndex((n) => n.midi === midi);
    const shifted = (i: number, by: number): number[] => passage.midis.map((m, j) => (j === i ? (notesIndex[indexOf(m) + by]?.midi ?? m) : m));
    const spots = rng.shuffle(passage.midis.map((_m, i) => i));

    if ((p.ask ?? 'notes') === 'tab') {
      const right = tabOf(passage.places, durations);
      const altered = passage.midis.map((m, i) => ({ i, alt: parseNote(names[i])!.alt })).filter((x) => x.alt !== 0);
      const candidates: TabFigure[] = [];
      // The signature forgotten: every sharp played natural, a fret lower (a flat, a fret higher).
      if (altered.length > 0) candidates.push(tabOf(passage.places.map((q, i) => ({ ...q, fret: q.fret - (parseNote(names[i])!.alt) })), durations));
      // Played where it is written: guitar sounds an octave below the staff.
      if (passage.places.every((q) => q.fret + 12 <= MAX_FRET)) candidates.push(tabOf(passage.places.map((q) => ({ ...q, fret: q.fret + 12 })), durations));
      // One note on the wrong string, or the wrong fret.
      for (const i of spots) {
        const q = passage.places[i];
        const other = q.string > 1 ? q.string - 1 : q.string + 1;
        candidates.push(tabOf(passage.places.map((x, j) => (j === i ? { string: other, fret: q.fret } : x)), durations));
        candidates.push(tabOf(passage.places.map((x, j) => (j === i ? { ...x, fret: x.fret + (x.fret >= hi ? -1 : 1) } : x)), durations));
      }
      const sound = (t: TabFigure): string => t.notes.map((n) => ('rest' in n ? 'r' : midiAt(n))).join('.');
      const wrong = distinct(candidates.filter((t) => t.notes.every((n) => 'rest' in n || (n.fret >= 0 && n.fret <= MAX_FRET))), sound, 2, [sound(right)]);
      const out: ChoiceExercise = {
        type: 'choice',
        prompt: `Which tab plays this passage in ${positionWords(position)}?`,
        figure: staffOf(passage),
        options: rng.shuffle([{ figure: right, correct: true }, ...wrong.map((figure) => ({ figure }))]),
        explain: `${signatureWords(key)} The notes are ${noteList(names)}, sounding an octave below where they are written, played in ${where}.`,
      };
      return out;
    }

    const lists: string[][] = [];
    // The key signature forgotten: its sharps or flats played natural.
    if (names.some((n) => parseNote(n)!.alt !== 0)) lists.push(names.map((n) => parseNote(n)!.letter));
    // One note read a step off (a line for the space beside it), or a third off (the next line).
    for (const i of spots) {
      lists.push(passageNames(passage, shifted(i, rng.chance() ? 1 : -1)));
      lists.push(passageNames(passage, shifted(i, rng.chance() ? 2 : -2)));
    }
    const wrong = distinct(lists, pcKey, 3, [pcKey(names)]);
    return choiceOf(
      rng,
      {
        prompt: 'Which notes does this passage play?',
        explain: `${signatureWords(key)} So the passage reads ${noteList(names)}. Play it in ${where}.`,
        figure: staffOf(passage),
      },
      noteList(names),
      wrong.map((list) => noteList(list)),
    );
  },
});

// ── Key signatures on the staff ────────────────────────────────────────────────────────────────

/** How to read a key from its signature, with the rule that gives it away. */
export function signatureRule(key: Key): string {
  const acc = key.signature.accidentals;
  const major = key.mode === 'major' ? key : (getKey(key.relative) ?? key);
  const majorRule =
    acc.length === 0
      ? `No sharps or flats: {k:${major.name}}.`
      : key.fifths > 0
        ? `The last sharp, {n:${acc[acc.length - 1]}}, is a half step below the key note: {k:${major.name}}.`
        : acc.length === 1
          ? `One flat, {n:${acc[0]}}, is the signature of {k:${major.name}}.`
          : `The second-to-last flat, {n:${acc[acc.length - 2]}}, names the key: {k:${major.name}}.`;
  return key.mode === 'major' ? majorRule : `${majorRule} Its relative minor, a minor third lower, is {k:${key.name}}.`;
}

const staffOnly = (key: Key): StaffFigure => ({ kind: 'staff', key: key.name, notes: [] });

/** Keys a learner confuses with this one: the same count of the other sign, and the neighbours on the circle. */
function rivalKeys(key: Key): Key[] {
  const f = key.fifths;
  const same = keysUpTo(7, [key.mode]);
  return distinct([-f, f + 1, f - 1, f + 2, f - 2, f + 3].filter((n) => n !== f && Math.abs(n) <= 7), (n) => n, 6)
    .map((n) => same.find((k) => k.fifths === n))
    .filter((k): k is Key => k !== undefined);
}

export const staffKey = defineGenerator({
  kind: 'staff-key',
  summary: 'Key signatures on the staff: name the key, pick the staff that shows a key, or read a note the signature alters.',
  produces: ['choice', 'staff-read'],
  params: [
    { name: 'ask', type: "'name' | 'pick' | 'read'", default: "'name'", description: 'Which key has the signature shown; which staff shows a key; or name a note the signature alters.' },
    { name: 'modes', type: "('major' | 'minor')[]", default: "['major']", description: 'Modes to draw keys from.' },
    { name: 'maxAccidentals', type: 'number', default: '4', description: 'Largest signature used, 1 to 7.' },
    { name: 'keys', type: 'string[]', default: 'from modes and maxAccidentals', description: 'An explicit key pool, easiest first. Replaces modes and maxAccidentals.' },
  ],
  check: (p) =>
    checkParams()
      .oneOf('ask', p.ask, ['name', 'pick', 'read'])
      .list('modes', p.modes, (m) => m === 'major' || m === 'minor', "['major', 'minor']")
      .int('maxAccidentals', p.maxAccidentals, 1, 7)
      .keys('keys', p.keys)
      .keysOrSignature(p)
      .need(!p.keys || keysFromList(p.keys).some((k) => k.fifths !== 0), '"keys" needs at least one key with sharps or flats: C major and A minor have nothing to read.').problems,
  make(p, { rng, difficulty }) {
    const ask = p.ask ?? 'name';
    const keys = keyPool(p, difficulty).filter((k) => k.fifths !== 0);
    const key = rng.pick(keys.length ? keys : keysUpTo(1, p.modes ?? ['major']).filter((k) => k.fifths !== 0));
    const signs = `${count(Math.abs(key.fifths), key.fifths > 0 ? 'sharp' : 'flat')}, ${noteList(key.signature.accidentals, ', ')}`;
    if (ask === 'pick') {
      const out: ChoiceExercise = {
        type: 'choice',
        prompt: `Which staff shows the key signature of {k:${key.name}}?`,
        options: rng.shuffle([{ figure: staffOnly(key), correct: true }, ...rivalKeys(key).slice(0, 3).map((k) => ({ figure: staffOnly(k) }))]),
        explain: `{k:${key.name}} has ${signs}. ${signatureRule(key)}`,
      };
      return out;
    }
    if (ask === 'read') {
      // A note on the five lines (sounding E3 to F4), usually one the signature alters.
      const pcs = new Set(scalePcs(key.tonic, key.mode === 'minor' ? 'minor' : 'major'));
      const onStaff = Array.from({ length: 14 }, (_u, i) => 52 + i).filter((m) => pcs.has(m % 12));
      const altered = onStaff.filter((m) => parseNote(spellInKey(m, key))!.alt !== 0);
      const midi = rng.pick(altered.length && rng.chance(0.75) ? altered : onStaff);
      const full = spellInKey(midi, key);
      const n = parseNote(full)!;
      const sign = key.fifths > 0 ? '#' : 'b';
      // The same letter without the signature's sign (or with it): the mistake the question is about.
      // Cb, Fb, E# and B# are skipped: they would read as another white key.
      const twin = n.alt === 0 ? `${n.letter}${sign}` : n.letter;
      const twins = NATURAL_PCS.has(parseNote(twin)!.chroma) && parseNote(twin)!.alt !== 0 ? [] : [twin];
      const above = spellInKey((midi + (pcs.has((midi + 1) % 12) ? 1 : 2)) % 12, key);
      const below = spellInKey((midi + 12 - (pcs.has((midi + 11) % 12) ? 1 : 2)) % 12, key);
      const options = distinct([n.pcName, ...twins, above, below], (x) => parseNote(x)!.chroma, 4);
      const out: StaffReadExercise = {
        type: 'staff-read',
        note: full,
        key: key.name,
        options: rng.shuffle(options),
        prompt: 'Which note is this? Mind the key signature.',
        explain:
          n.alt !== 0
            ? `${signatureWords(key)} So every ${n.letter} is played as {n:${n.pcName}}, this one too, with no sign beside it.`
            : `This is {n:${n.pcName}}. ${signatureWords(key)} It leaves ${n.letter} alone.`,
      };
      return out;
    }
    const rivals = rivalKeys(key).slice(0, 3);
    return choiceOf(
      rng,
      { prompt: `Which ${key.mode} key has this key signature?`, explain: `It shows ${signs}. ${signatureRule(key)}`, figure: staffOnly(key), spelling: 'exact' },
      `{k:${key.name}}`,
      rivals.map((k) => `{k:${k.name}}`),
    );
  },
});

/** The reading generators. */
export const READING_GENERATORS = [tabRead, tabPlay, sightReading, staffKey] as const;
