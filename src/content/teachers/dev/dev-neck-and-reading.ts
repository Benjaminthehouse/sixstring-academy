/**
 * Dev, unit 10: Know the neck, read the music (plan: `dev/dev-neck-and-reading` in
 * src/content/plan/teachers.json).
 *
 * First the neck: strings 6 and 5 made instant with landmarks, then every note on every string with
 * the octave shapes. Then the staff: strings 1 to 3 in C, all six strings in G with F#, the sharps of
 * D and A major with dots, ties and second position, and a real piece read from notation, the Minuet
 * in G. Dev's voice: a bandmate who ties every idea to something to play tonight.
 *
 * Every note on the neck and the staff is computed from the guitar engine (`noteAt`), never typed,
 * and `dev-neck-and-reading.test.ts` checks every "string N, fret M ({n:X})" the text names, the
 * staff figures against the tab they come from, the study bars against the song library, and every
 * Player tempo against the song's own.
 *
 * The Player shows the score as tab, or as tab with notation above it; it has no notation-only view,
 * so the reading tasks ask for "Tab and notes" and a strip of paper over the tab. The library's
 * Minuet in G is the melody alone, so the app cannot play the bass the plan mentions: the learner
 * plays with the Player's click instead. Dance of the Sugar Plum Fairy is not in the library (it
 * needs a printed edition): its task falls back to In the Hall of the Mountain King, the nearest
 * piece that is (a single-line classical theme in E minor, staccato, with chromatic notes).
 */
import { noteAt } from '@/core/guitar';
import type { FretDot, StaffNote, TabNote } from '@/lessons';
import type { TeacherLesson, TeacherUnit } from '../types';
import { playerTask, techniqueTask, toolTask } from '../tasks';

// ── Helpers: notes from the engine ─────────────────────────────────────────────────────────────

/** One tab note. */
function t(string: number, fret: number, duration: string): TabNote {
  return { string, fret, duration };
}

/** The note at a position, with octave, spelled for a key (or with sharps). */
function pitch(string: number, fret: number, key?: string): string {
  return noteAt({ string, fret }, { context: key ? { key } : { prefer: 'sharps' } });
}

/** The note name at a position, without octave. */
function name(string: number, fret: number, key?: string): string {
  return noteAt({ string, fret }, { context: key ? { key } : { prefer: 'sharps' }, octave: false });
}

/** A dot whose note is claimed from the engine (so the validator checks it again). */
function dot(string: number, fret: number, extra: Partial<FretDot> = {}): FretDot {
  return { string, fret, note: pitch(string, fret), ...extra };
}

/** A tab phrase as notes on the staff (sounding pitch: the staff draws it an octave up). */
export function staffOf(tab: readonly TabNote[], key: string): StaffNote[] {
  return tab.flatMap((n): StaffNote[] => ('rest' in n ? [] : [{ note: pitch(n.string, n.fret, key), duration: n.duration }]));
}

/** Strings 6 and 5 from the nut to fret 12, every note; sharps faded so the naturals stand out. */
const NECK_6_AND_5: FretDot[] = [6, 5].flatMap((s) =>
  Array.from({ length: 13 }, (_, f) => {
    const n = name(s, f);
    return n.length === 1 ? dot(s, f) : dot(s, f, { role: 'ghost' });
  }),
);

/** First position on strings 3, 2 and 1: open G up to G at string 1, fret 3 (C major). */
export const TOP_STRINGS_C: TabNote[] = [t(3, 0, 'q'), t(3, 2, 'q'), t(2, 0, 'q'), t(2, 1, 'q'), t(2, 3, 'q'), t(1, 0, 'q'), t(1, 1, 'q'), t(1, 3, 'q')];

/** First position on strings 6, 5 and 4: open E up to F at string 4, fret 3. */
export const LOW_STRINGS: TabNote[] = [t(6, 0, 'q'), t(6, 1, 'q'), t(6, 3, 'q'), t(5, 0, 'q'), t(5, 2, 'q'), t(5, 3, 'q'), t(4, 0, 'q'), t(4, 2, 'q'), t(4, 3, 'q')];

/** Reading: First Position in C, bars 1 to 4 (the library's study, `st-read-first-c`). */
export const READ_C_BARS_1_4: TabNote[] = [
  t(1, 0, 'q'), t(2, 3, 'q'), t(1, 0, 'q'), t(1, 1, 'q'),
  t(1, 3, 'h'), t(1, 0, 'h'),
  t(1, 1, 'q'), t(1, 0, 'q'), t(2, 3, 'q'), t(2, 1, 'q'),
  t(2, 0, 'h'), t(3, 0, 'h'),
];

/** Reading: First Position in G, bars 1 to 4 (`st-read-first-g`): strings 6 to 3. */
export const READ_G_BARS_1_4: TabNote[] = [
  t(6, 3, 'q'), t(5, 2, 'q'), t(4, 0, 'q'), t(3, 0, 'q'),
  t(4, 4, 'q'), t(4, 2, 'q'), t(4, 0, 'h'),
  t(4, 2, 'q'), t(5, 3, 'q'), t(5, 0, 'q'), t(5, 3, 'q'),
  t(4, 0, 'e'), t(5, 3, 'e'), t(5, 2, 'q'), t(5, 0, 'h'),
];

/** Reading: Second Position, bar 1 (`st-read-second-position`): A B C# E C#, no open strings. */
export const SECOND_POSITION_BAR_1: TabNote[] = [t(3, 2, 'q'), t(3, 4, 'e'), t(2, 2, 'e'), t(2, 5, 'q'), t(2, 2, 'q')];

/**
 * Every sharp of A major in first position (the nut to fret 4): F# on strings 6, 4 and 1, C# on
 * strings 5 and 2, G# on strings 6, 3 and 1. The sharps D and A major add (C#, G#) are marked.
 */
export const FIRST_POSITION_A_SHARPS: FretDot[] = [
  dot(6, 2), dot(6, 4, { role: 'target' }), dot(5, 4, { role: 'target' }), dot(4, 4), dot(3, 1, { role: 'target' }), dot(2, 2, { role: 'target' }), dot(1, 2), dot(1, 4, { role: 'target' }),
];

/** A major on strings 3 to 1 in second position, one finger per fret from fret 2. */
const A_MAJOR_SECOND_POSITION: FretDot[] = [
  dot(3, 2, { finger: 1, role: 'root' }), dot(3, 4, { finger: 3 }), dot(2, 2, { finger: 1, role: 'target' }), dot(2, 3, { finger: 2 }),
  dot(2, 5, { finger: 4 }), dot(1, 2, { finger: 1 }), dot(1, 4, { finger: 3, role: 'target' }), dot(1, 5, { finger: 4, role: 'root' }),
];

/** Minuet in G (melody), bars 1 to 4 (`minuet-in-g-melody`): sixteen notes in 3/4. */
export const MINUET_BARS_1_4: TabNote[] = [
  t(2, 3, 'q'), t(3, 0, 'e'), t(3, 2, 'e'), t(2, 0, 'e'), t(2, 1, 'e'),
  t(2, 3, 'q'), t(3, 0, 'q'), t(3, 0, 'q'),
  t(1, 0, 'q'), t(2, 1, 'e'), t(2, 3, 'e'), t(1, 0, 'e'), t(1, 2, 'e'),
  t(1, 3, 'q'), t(3, 0, 'q'), t(3, 0, 'q'),
];

// ── 1. Strings 6 and 5, instantly ───────────────────────────────────────────────────────────────

const notesOn6And5: TeacherLesson = {
  id: 'notes-on-6-and-5',
  title: 'Strings 6 and 5, instantly',
  teaches: 'Landmarks make strings 6 and 5 instant: fret 5 and fret 12 on each, the inlay dots as signposts.',
  minutes: 5,
  skill: 'teacher:dev:notes-on-6-and-5',
  steps: [
    {
      type: 'card',
      title: 'Make it instant',
      body: 'You already know the natural notes on strings 6 and 5: every barre chord you play hangs its root there. Tonight we make them instant, under three seconds a note, so you can call any chord anywhere without counting up from the nut.',
      figure: { kind: 'fretboard', frets: [0, 12], dots: NECK_6_AND_5, caption: 'Strings 6 and 5 to fret 12: naturals bright, sharps faded.' },
    },
    {
      type: 'card',
      title: 'Four landmarks',
      body: 'String 6, fret 5 is {n:A} and string 6, fret 12 is {n:E}. String 5, fret 5 is {n:D} and string 5, fret 12 is {n:A}. The inlay dots at frets 3, 5, 7, 9 and 12 are your signposts: start at the nearest one and count a fret or two.',
      figure: {
        kind: 'fretboard',
        frets: [0, 12],
        dots: [dot(6, 5, { role: 'target' }), dot(6, 12, { role: 'target' }), dot(5, 5, { role: 'target' }), dot(5, 12, { role: 'target' })],
        caption: 'The landmarks sit on the dots at fret 5 and fret 12.',
      },
      tip: 'Fret 12 is the open string an octave up, which is why it is {n:E} on string 6 and {n:A} on string 5.',
    },
    {
      type: 'choice',
      prompt: 'String 6, fret 5 is {n:A}. Which note is string 6, fret 7, on the next dot?',
      options: [
        { text: '{n:B}', correct: true },
        { text: '{n:C}', why: '{n:B} to {n:C} is only a half step, so {n:C} is one fret further, at fret 8.' },
        { text: '{n:A#}', why: '{n:A#} is fret 6, one fret above the landmark.' },
        { text: '{n:G}', why: '{n:G} is below the landmark, at fret 3.' },
      ],
      explain: '{n:A} to {n:B} is a whole step, two frets: fret 5 to fret 7. Landmark first, then count.',
      fact: 'neck-landmarks-6-5',
    },
    {
      type: 'fretboard-name',
      prompt: 'Which note is string 5, fret 7? Start from the landmark at fret 5.',
      position: { string: 5, fret: 7 },
      ask: 'note',
      spelling: 'any',
      options: ['E', 'D', 'F', 'C'],
      explain: 'String 5, fret 5 is {n:D}; two frets up, string 5, fret 7 is {n:E}: the root of the A-shape {c:E} barre.',
      fact: 'neck-landmarks-6-5',
    },
    {
      type: 'type-answer',
      prompt: 'Which note is string 5, fret 8?',
      answer: { kind: 'note', value: 'F', spelling: 'any' },
      input: 'keypad',
      explain: 'From {n:D} at fret 5: {n:E} at fret 7, then a half step to {n:F} at fret 8. Your A-shape {c:F} barre lives right there.',
    },
    {
      type: 'card',
      title: 'Sharps and flats: one fret either side',
      body: 'Every sharp or flat is one fret either side of a natural: one fret up is sharp, one fret down is flat. String 6, fret 6 is one above {n:A} and one below {n:B}, so it is {n:A#} or {n:Bb}: two names, one fret.',
    },
    {
      type: 'true-false',
      statement: 'String 6, fret 4 can be called {n:G#} or {n:Ab}.',
      answer: true,
      explain: 'Fret 3 is {n:G} and fret 5 is {n:A}, so fret 4 is one fret above {n:G} and one below {n:A}: {n:G#} or {n:Ab}.',
      fact: 'sharp-flat-one-fret',
    },
    toolTask({
      id: 'sprint-6-5',
      title: 'One-minute sprints on 6 and 5',
      tool: 'fretboard',
      params: ['drill', 'sprint'],
      minutes: 6,
      body: 'Open the one-minute sprint, tap Change, keep only strings 6 and 5 and pick All 12 notes. Name as many as you can in a minute and aim for 25 right. Three rounds, then come back.',
      tip: 'Say the landmark before each answer: "fret 5 is {n:A}, so fret 7 is {n:B}." Soon you skip the counting.',
    }),
    {
      type: 'play-note',
      prompt: 'I call {n:C}. Play it on string 6.',
      note: 'C3',
      octave: 'exact',
      where: { string: 6, fret: 8 },
      explain: 'String 6, fret 8 is {n:C}: three frets above the {n:A} landmark ({n:A#}, {n:B}, {n:C}). It is the root of the E-shape {c:C} barre.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap {n:C} on string 6.',
        find: { note: 'C3' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 12],
        strings: [6],
        explain: 'String 6, fret 8 is {n:C}, three frets above the landmark {n:A} at fret 5.',
      },
    },
    {
      type: 'play-note',
      prompt: 'Now the same {n:C} on string 5.',
      note: 'C3',
      octave: 'exact',
      where: { string: 5, fret: 3 },
      explain: 'String 5, fret 3 is the very same pitch: five frets lower, one string over. Any note on string 6 is on string 5 five frets down.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap {n:C} on string 5.',
        find: { note: 'C3' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 12],
        strings: [5],
        explain: 'String 5, fret 3 is {n:C}, the root of your open {c:C} chord and of the A-shape {c:C} barre.',
      },
    },
    { generate: 'note-on-string', params: { strings: [6, 5], frets: [0, 12], ask: 'name' } },
    { generate: 'note-on-string', params: { strings: [6, 5], frets: [0, 12], ask: 'find' } },
  ],
  facts: [
    { id: 'neck-landmarks-6-5', front: 'The landmarks on strings 6 and 5?', back: 'String 6: fret 5 is {n:A}, fret 12 is {n:E}. String 5: fret 5 is {n:D}, fret 12 is {n:A}.' },
    { id: 'sharp-flat-one-fret', front: 'Where do the sharps and flats sit on a string?', back: 'One fret either side of a natural: one fret up is sharp, one fret down is flat.' },
    {
      id: 'string-5-fret-8',
      front: 'Which note is string 5, fret 8?',
      back: '{n:F}: the root of the A-shape {c:F} barre.',
      ask: { type: 'type-answer', prompt: 'Which note is string 5, fret 8?', answer: { kind: 'note', value: 'F', spelling: 'any' }, input: 'keypad', explain: 'Landmark {n:D} at fret 5, {n:E} at 7, {n:F} at 8.' },
    },
  ],
};

// ── 2. Every note on every string ───────────────────────────────────────────────────────────────

const notesEverywhere: TeacherLesson = {
  id: 'notes-everywhere',
  title: 'Every note on every string',
  teaches: 'Octave shapes carry strings 6 and 5 across: two strings over and two frets up, three across the B string.',
  minutes: 5,
  skill: 'teacher:dev:notes-everywhere',
  steps: [
    {
      type: 'card',
      title: 'Octave shapes',
      body: 'Octave shapes carry what you know on strings 6 and 5 across the neck. From string 6 the octave is two strings over and two frets up: string 6, fret 3 ({n:G}) to string 4, fret 5 ({n:G}). From string 5 the same: string 5, fret 3 ({n:C}) to string 3, fret 5 ({n:C}).',
      figure: {
        kind: 'fretboard',
        frets: [2, 6],
        dots: [dot(6, 3, { role: 'root' }), dot(4, 5, { role: 'root' }), dot(5, 3, { role: 'target' }), dot(3, 5, { role: 'target' })],
        caption: 'Two strings over, two frets up: {n:G} to {n:G}, {n:C} to {n:C}.',
      },
    },
    {
      type: 'fretboard-find',
      prompt: 'The dot is {n:A}, string 6, fret 5. Tap the {n:A} an octave higher with the octave shape.',
      find: { interval: 'P8', from: { string: 6, fret: 5 } },
      mode: 'one',
      octave: 'exact',
      frets: [4, 9],
      shown: [{ string: 6, fret: 5, label: 'R' }],
      explain: 'Two strings over and two frets up: string 4, fret 7 is {n:A}, an octave above string 6, fret 5.',
      fact: 'octave-shape-6-5',
    },
    {
      type: 'card',
      title: 'Across the B string, one fret more',
      body: 'Strings 3 and 2 are tuned a fret closer than the other pairs, so a shape that crosses them stretches by one fret. From string 4: two strings over, three frets up, string 4, fret 2 ({n:E}) to string 2, fret 5 ({n:E}). The same from string 3 to string 1. And string 1 has exactly the same notes as string 6.',
      figure: {
        kind: 'fretboard',
        frets: [1, 6],
        dots: [dot(4, 2, { role: 'root' }), dot(2, 5, { role: 'root' }), dot(3, 2, { role: 'target' }), dot(1, 5, { role: 'target' })],
        caption: 'Across the B string: two strings over, three frets up.',
      },
    },
    {
      type: 'choice',
      prompt: 'String 4, fret 5 is {n:G}. Where is the {n:G} an octave higher, with the octave shape?',
      options: [
        { text: 'String 2, fret 8', correct: true },
        { text: 'String 2, fret 7', why: 'String 2, fret 7 is {n:F#}. Across the B string the shape needs one fret more: three frets up, not two.' },
        { text: 'String 3, fret 7', why: 'String 3, fret 7 is {n:D}. The octave is two strings over, not one.' },
        { text: 'String 1, fret 5', why: 'String 1, fret 5 is {n:A}, a step too high.' },
      ],
      explain: 'Two strings over and three frets up, because the shape crosses the B string: string 2, fret 8 is {n:G}.',
      fact: 'octave-shape-b-string',
    },
    {
      type: 'true-false',
      statement: 'String 1 has exactly the same notes as string 6, two octaves higher.',
      answer: true,
      explain: 'Both are {n:E} strings. String 6, fret 3 is {n:G}, so string 1, fret 3 is {n:G}; whatever you know on one, you know on the other.',
      fact: 'string-1-is-6',
    },
    {
      type: 'card',
      title: 'Every C on the neck',
      body: 'Put it together: find the note on strings 6 and 5, then carry it across with the shapes. From the nut to fret 12 there are six {n:C}s: string 6, fret 8; string 5, fret 3; string 4, fret 10; string 3, fret 5; string 2, fret 1; string 1, fret 8.',
      figure: { kind: 'fretboard', frets: [0, 12], derive: { note: 'C' }, caption: 'Every {n:C} from the nut to fret 12.' },
      tip: 'Got a camera? The Live Fretboard in Tools labels the notes under your fingers while you hunt.',
    },
    {
      type: 'fretboard-find',
      prompt: 'Your turn: tap every {n:F#} from the nut to fret 12.',
      find: { note: 'F#' },
      mode: 'all',
      octave: 'any',
      frets: [0, 12],
      explain: 'Six: string 6, fret 2; string 5, fret 9; string 4, fret 4; string 3, fret 11; string 2, fret 7; string 1, fret 2. Strings 6 and 1 match, as always.',
    },
    toolTask({
      id: 'find-every-one',
      title: 'Find every one',
      tool: 'fretboard',
      params: ['drill', 'find-every-note'],
      minutes: 4,
      body: 'Two rounds of Find every one, about a minute each, on all six strings (tap Change if your settings leave strings out). For each note: strings 6 and 5 first, then carry it across with the octave shapes.',
    }),
    {
      type: 'play-note',
      prompt: 'Play {n:G} on string 4, with the octave shape from string 6, fret 3.',
      note: 'G3',
      octave: 'exact',
      where: { string: 4, fret: 5 },
      explain: 'String 6, fret 3 is {n:G}; two strings over and two frets up, string 4, fret 5 is the {n:G} an octave higher.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap the {n:G} on string 4 that is an octave above string 6, fret 3.',
        find: { note: 'G3' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 12],
        strings: [4],
        explain: 'String 4, fret 5 is {n:G}: two strings over, two frets up from string 6, fret 3.',
      },
    },
    {
      type: 'play-note',
      prompt: 'Now {n:E} on string 2, from string 4, fret 2.',
      note: 'E4',
      octave: 'exact',
      where: { string: 2, fret: 5 },
      explain: 'Across the B string: two strings over, three frets up. String 2, fret 5 is {n:E}, the same pitch as the open string 1.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap the {n:E} on string 2 that is an octave above string 4, fret 2.',
        find: { note: 'E4' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 12],
        strings: [2],
        explain: 'String 2, fret 5 is {n:E}: three frets up, because the shape crosses the B string.',
      },
    },
    techniqueTask({
      id: 'octaves-muted',
      title: 'Octave Shapes with Muting',
      exercise: 'tech-octaves',
      minutes: 5,
      body: 'Play the G major scale in octaves on strings 6 and 4, from string 6, fret 3 ({n:G}), with finger 1 lightly touching string 5 to mute it. Start at 60 BPM and strum all three strings: only two notes should sound.',
      tip: 'Touch the middle string, do not press it. Pressed, it rings; touched, it stays silent.',
    }),
    { generate: 'interval-on-neck', params: { intervals: ['P8'], ask: 'find', strings: [6, 5], frets: [0, 9] } },
  ],
  facts: [
    { id: 'octave-shape-6-5', front: 'The octave shape from string 6 or string 5?', back: 'Two strings over, two frets up: string 6, fret 3 ({n:G}) to string 4, fret 5 ({n:G}).' },
    { id: 'octave-shape-b-string', front: 'The octave shape from string 4 or string 3?', back: 'Two strings over, three frets up, because it crosses the B string: string 4, fret 2 ({n:E}) to string 2, fret 5 ({n:E}).' },
    { id: 'string-1-is-6', front: 'Which string has the same notes as string 6?', back: 'String 1, two octaves higher: both are {n:E} strings, fret for fret.' },
  ],
};

// ── 3. Reading music: strings 1 to 3 ───────────────────────────────────────────────────────────

const readingStrings1To3: TeacherLesson = {
  id: 'reading-strings-1-to-3',
  title: 'Reading music: strings 1 to 3',
  teaches: 'Guitar is written in treble clef an octave up: open G, B and E sit on line 2, the middle line, the top space.',
  minutes: 5,
  skill: 'teacher:dev:reading-strings-1-to-3',
  steps: [
    {
      type: 'card',
      title: 'Why read notation',
      body: 'Tab says where. Standard notation also says exactly when, and it is what most printed music uses. Guitar music is written in the {t:treble-clef|treble clef}, an octave higher than it sounds. We start on the top three strings in first position: eight notes, {n:G} up to {n:G}.',
      figure: { kind: 'staff', key: 'C major', notes: staffOf(TOP_STRINGS_C, 'C major').map((n) => n.note), caption: 'Strings 3, 2 and 1 in first position: open {n:G} to {n:G} at fret 3.' },
    },
    {
      type: 'card',
      title: 'Three anchors',
      body: 'The open string 3 ({n:G}) is written on the second line from the bottom, the open string 2 ({n:B}) on the middle line, and the open string 1 ({n:E}) in the top space. Every other note is a step from one of them: line, space, line.',
      figure: {
        kind: 'fretboard',
        frets: [0, 3],
        dots: TOP_STRINGS_C.map((n) => ('rest' in n ? null : dot(n.string, n.fret, n.fret === 0 ? { role: 'target' } : {}))).filter((d): d is FretDot => d !== null),
        caption: 'The same eight notes on the neck, one finger per fret.',
      },
    },
    {
      type: 'choice',
      prompt: 'On the staff, where is the open string 3, {n:G}, written?',
      options: [
        { text: 'The second line from the bottom', correct: true },
        { text: 'The middle line', why: 'The middle line is {n:B}, the open string 2.' },
        { text: 'The top space', why: 'The top space is {n:E}, the open string 1.' },
        { text: 'The bottom line', why: 'The bottom line is {n:E} at string 4, fret 2, an octave below the open string 1.' },
      ],
      explain: 'The treble clef curls around the second line, the {n:G} line, and that is where the open string 3 is written.',
      fact: 'staff-open-strings-1-3',
    },
    {
      type: 'staff-read',
      prompt: 'Name this note. It is one of the three anchors.',
      note: 'B3',
      options: ['B', 'D', 'G', 'C'],
      explain: '{n:B} on the middle line: the open string 2.',
      fact: 'staff-open-strings-1-3',
    },
    {
      type: 'staff-read',
      prompt: 'And this one?',
      note: 'E4',
      options: ['E', 'F', 'D', 'G'],
      explain: 'The top space is {n:E}: the open string 1.',
    },
    {
      type: 'staff-place',
      prompt: 'Put the note for string 2, fret 1 ({n:C}) on the staff, at its exact pitch.',
      note: 'C4',
      octave: 'exact',
      explain: 'One step above the open {n:B} on the middle line: {n:C} sits in the third space.',
    },
    {
      type: 'card',
      title: 'Tonight\'s study, bars 1 to 4',
      body: 'Read the notes, not the numbers: {n:E} {n:D} {n:E} {n:F}, {n:G} {n:E}, {n:F} {n:E} {n:D} {n:C}, {n:B} {n:G}. A quarter note gets one beat, a half note two.',
      figure: { kind: 'staff', key: 'C major', time: '4/4', notes: staffOf(READ_C_BARS_1_4, 'C major'), caption: 'Reading: First Position in C, bars 1 to 4.' },
    },
    { generate: 'staff-note', params: { ask: 'read', low: 'G3', high: 'G4' } },
    { generate: 'staff-note', params: { ask: 'read', low: 'G3', high: 'G4' } },
    playerTask({
      id: 'read-c-wait',
      title: 'The C study from the staff',
      song: 'st-read-first-c',
      mode: 'wait',
      minutes: 5,
      body: 'In the Player\'s options, set the score to Tab and notes and read the staff on top. If your eyes slide down to the tab, lay a strip of paper over it. Wait mode waits for each right note: read, find, play.',
    }),
    { generate: 'staff-note', params: { ask: 'read', low: 'G3', high: 'G4' } },
    playerTask({
      id: 'read-c-60',
      title: 'The C study in time',
      song: 'st-read-first-c',
      tempo: 83,
      minutes: 4,
      body: 'Now in time at 83 % (60 BPM), still from the staff, while the teacher strums the chords. Miss a note? Land on the next beat like nothing happened.',
    }),
    {
      type: 'play-phrase',
      prompt: 'Play bars 1 and 2, reading the staff: {n:E} {n:D} {n:E} {n:F}, then {n:G} and {n:E}, two beats each.',
      figure: { kind: 'staff', key: 'C major', time: '4/4', notes: staffOf(READ_C_BARS_1_4.slice(0, 6), 'C major') },
      notes: READ_C_BARS_1_4.slice(0, 6),
      octave: 'exact',
      tempo: 60,
      explain: 'Open string 1, string 2, fret 3, open string 1, string 1, fret 1, then string 1, fret 3 and the open string 1 again: top space, fourth line, top space, top line, the space above, top space.',
      alternative: {
        type: 'order',
        prompt: 'Put the notes of bars 1 and 2 in order.',
        tiles: ['{n:E}', '{n:D}', '{n:E}', '{n:F}', '{n:G}', '{n:E}'],
        distractors: ['{n:C}'],
        explain: '{n:E} {n:D} {n:E} {n:F}, then {n:G} and {n:E}: the tune steps around the open string 1.',
      },
    },
  ],
  facts: [
    { id: 'guitar-octave-higher', front: 'How is guitar music written?', back: 'In the treble clef, an octave higher than it sounds.' },
    { id: 'staff-open-strings-1-3', front: 'Where are the open strings 3, 2 and 1 written?', back: 'Open {n:G}: the second line from the bottom. Open {n:B}: the middle line. Open {n:E}: the top space.' },
  ],
};

// ── 4. Reading all six strings ─────────────────────────────────────────────────────────────────

const readingAllSixStrings: TeacherLesson = {
  id: 'reading-all-six-strings',
  title: 'Reading all six strings',
  teaches: 'Low strings hang below the staff on ledger lines, and in {k:G major} every F is played as {n:F#}.',
  minutes: 5,
  skill: 'teacher:dev:reading-all-six-strings',
  steps: [
    {
      type: 'card',
      title: 'Below the staff',
      body: 'The low strings take you below the staff onto {t:ledger-line|ledger lines}, short extra lines for notes the five cannot hold. The open string 6 ({n:E}) is written below three ledger lines, the open string 5 ({n:A}) on the second, the open string 4 ({n:D}) just under the staff.',
      figure: { kind: 'staff', notes: staffOf(LOW_STRINGS, 'C major').map((n) => n.note), caption: 'First position on strings 6, 5 and 4: {n:E} up to {n:F}.' },
    },
    {
      type: 'staff-read',
      prompt: 'Name this note.',
      note: 'E2',
      options: ['E', 'G', 'F', 'C'],
      explain: 'Below three ledger lines: the open string 6, the lowest note on the guitar.',
      fact: 'staff-low-e',
    },
    { generate: 'staff-note', params: { ask: 'read', low: 'E2', high: 'F3' } },
    {
      type: 'card',
      title: 'One sharp: {n:F#}',
      body: '{k:G major} has one sharp in its {t:key-signature}, {n:F#}, so every F you read is played as {n:F#}: string 4, fret 4 ({n:F#}) and string 1, fret 2 ({n:F#}). The sharp is written once at the start of each line, not before every note.',
      figure: { kind: 'staff', key: 'G major', notes: [pitch(4, 4, 'G major'), pitch(1, 2, 'G major')], caption: 'The key signature of {k:G major}: one sharp, on the top line.' },
    },
    {
      type: 'staff-read',
      prompt: 'This is in {k:G major}. Which note do you play?',
      note: 'F#3',
      key: 'G major',
      options: ['F#', 'F', 'G', 'E'],
      explain: 'The first space is F, and the key signature makes it {n:F#}: string 4, fret 4.',
      fact: 'g-major-f-sharp',
    },
    {
      type: 'choice',
      prompt: 'In {k:G major} you read an F on the top line. Which fret of string 1 do you play?',
      options: [
        { text: 'Fret 2: {n:F#}', correct: true },
        { text: 'Fret 1: {n:F}', why: 'Fret 1 is F natural. The key signature turns every F into {n:F#}.' },
        { text: 'Fret 3: {n:G}', why: 'Fret 3 is {n:G}, the note above.' },
      ],
      explain: 'Top line, F, sharpened by the key signature: string 1, fret 2 ({n:F#}).',
      fact: 'g-major-f-sharp',
    },
    {
      type: 'card',
      title: 'Read ahead',
      body: 'Let your eyes stay a beat in front of your fingers: while you play one note, read the next. Here are bars 1 to 4 of tonight\'s study, on strings 6 to 3.',
      figure: { kind: 'staff', key: 'G major', time: '4/4', notes: staffOf(READ_G_BARS_1_4, 'G major'), caption: 'Reading: First Position in G, bars 1 to 4.' },
    },
    playerTask({
      id: 'read-g-wait',
      title: 'The G study from the staff',
      song: 'st-read-first-g',
      mode: 'wait',
      minutes: 5,
      body: 'Set the score to Tab and notes and read the staff. Each time wait mode waits, look one note ahead. Every F is {n:F#}: string 4, fret 4 and string 1, fret 2.',
    }),
    {
      type: 'play-phrase',
      prompt: 'Play bar 1, reading the staff: {n:G} {n:B} {n:D} {n:G}, from below the staff up to its second line.',
      figure: { kind: 'staff', key: 'G major', time: '4/4', notes: staffOf(READ_G_BARS_1_4.slice(0, 4), 'G major') },
      notes: READ_G_BARS_1_4.slice(0, 4),
      octave: 'exact',
      tempo: 60,
      explain: 'String 6, fret 3 ({n:G}), string 5, fret 2 ({n:B}), the open string 4 ({n:D}) and the open string 3 ({n:G}): the notes of {c:G}, climbing.',
      alternative: {
        type: 'order',
        prompt: 'Put the notes of bar 1 in order, low to high.',
        tiles: ['{n:G}', '{n:B}', '{n:D}', '{n:G}'],
        distractors: ['{n:F}'],
        explain: '{n:G} {n:B} {n:D} {n:G}: a {c:G} chord, one note at a time.',
      },
    },
    playerTask({
      id: 'read-g-60',
      title: 'The G study in time',
      song: 'st-read-first-g',
      tempo: 75,
      minutes: 4,
      body: 'Now at 75 % (60 BPM), from the staff. Bars 9 to 12 are bars 1 to 4 an octave higher on strings 3 to 1: same tune, other lines.',
    }),
    {
      type: 'true-false',
      statement: 'In {k:G major}, an F written in the first space is played at string 4, fret 4.',
      answer: true,
      explain: 'The first space is F, the key signature makes it {n:F#}, and string 4, fret 4 is {n:F#}.',
    },
    playerTask({
      id: 'minuet-first-half',
      title: 'A real piece: Minuet in G',
      song: 'minuet-in-g-melody',
      bars: [1, 16],
      mode: 'wait',
      minutes: 5,
      body: 'Bars 1 to 16 of the Minuet in G, the first half, from the staff in wait mode. It is in {k:G major} too, three beats to a bar: watch the F on the top line in bar 3.',
    }),
    { generate: 'staff-note', params: { ask: 'read', low: 'E2', high: 'F3' } },
  ],
  facts: [
    { id: 'staff-low-e', front: 'How is the open string 6 written?', back: 'Below three ledger lines under the staff: the lowest note on the guitar.' },
    { id: 'g-major-f-sharp', front: 'In {k:G major}, how do you play every F?', back: 'As {n:F#}: string 4, fret 4 and string 1, fret 2 in first position.' },
    { id: 'read-ahead', front: 'Where should your eyes be while you read?', back: 'A beat ahead of your fingers: play one note while you read the next.' },
  ],
};

// ── 5. Sharps, dots, ties and second position ──────────────────────────────────────────────────

const readingSharpsAndRhythm: TeacherLesson = {
  id: 'reading-sharps-and-rhythm',
  title: 'Sharps, dots, ties and second position',
  teaches: 'D major adds {n:C#} and A major {n:G#}; a dot adds half a note\'s length, a tie joins two notes into one.',
  minutes: 5,
  skill: 'teacher:dev:reading-sharps-and-rhythm',
  steps: [
    {
      type: 'card',
      title: 'Two more sharps',
      body: '{k:D major} adds {n:C#} to the {n:F#}: string 5, fret 4 ({n:C#}) and string 2, fret 2 ({n:C#}). {k:A major} adds {n:G#} as well: string 3, fret 1 ({n:G#}), and fret 4 of strings 6 and 1. Same rule: the signature says it once, you play it every time.',
      figure: {
        kind: 'fretboard',
        frets: [0, 4],
        dots: FIRST_POSITION_A_SHARPS,
        caption: 'Every sharp of {k:A major} in first position; {n:C#} and {n:G#} marked.',
      },
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap both {n:C#}s in first position, from the nut to fret 4.',
      figure: { kind: 'staff', key: 'D major', notes: [pitch(5, 4, 'D major'), pitch(2, 2, 'D major')], caption: 'The key signature of {k:D major}: {n:F#} and {n:C#}.' },
      find: { note: 'C#' },
      mode: 'all',
      octave: 'any',
      frets: [0, 4],
      explain: 'String 5, fret 4 and string 2, fret 2: the two {n:C#}s of {k:D major} in first position.',
      fact: 'd-and-a-sharps',
    },
    {
      type: 'card',
      title: 'Dots and ties',
      body: 'A {t:dotted-note|dot} makes a note half as long again: a dotted quarter lasts a beat and a half, so the eighth after it lands on an "and". A {t:tie} joins two notes into one longer sound, even across a bar line: pick the first, hold through the second.',
      figure: { kind: 'rhythm', pattern: 'q. e q q | ~q q h', tempo: 72, caption: 'A dotted quarter, then a tie across the bar line.' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap it: a dotted quarter, an eighth, two quarters.',
      rhythm: { pattern: 'q. e q q' },
      tempo: 72,
      show: 'both',
      explain: 'Long, short: the dotted quarter takes beat 1 and half of beat 2, so the eighth falls on the "and" of 2.',
      fact: 'dot-and-tie',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Now a tie across the bar line: no tap on beat 1 of bar 2.',
      rhythm: { pattern: 'h q q | ~q q h' },
      tempo: 72,
      show: 'both',
      explain: 'The last quarter of bar 1 is tied into bar 2, so you hold it through the bar line and tap again on beat 2.',
      fact: 'dot-and-tie',
    },
    toolTask({
      id: 'read-dots-ties',
      title: 'Read and tap: dots, then ties',
      tool: 'rhythm',
      params: ['read', '5'],
      minutes: 4,
      body: 'Two rounds of Read and tap at the Dotted notes level, then step back to the list and play a round of Ties. Count the dotted quarter out loud: "1 (2) and".',
    }),
    playerTask({
      id: 'read-sharps',
      title: 'Sharps and Dotted Rhythms',
      song: 'st-read-first-sharps',
      mode: 'wait',
      minutes: 6,
      body: 'From the staff, in wait mode: bars 1 to 8 in {k:D major}, bars 9 to 16 in {k:A major}. Then switch to Listen at 83 % (60 BPM). The ties run from bar 3 into bar 4 and from bar 11 into bar 12: hold, do not pick again.',
    }),
    {
      type: 'choice',
      prompt: 'Second position: finger 1 sits at fret 2, and no open strings are needed. Which finger plays string 2, fret 5 ({n:E})?',
      figure: { kind: 'fretboard', frets: [2, 5], labels: 'note', dots: A_MAJOR_SECOND_POSITION, caption: '{k:A major} on strings 3 to 1, second position.' },
      options: [
        { text: 'Finger 4', correct: true },
        { text: 'Finger 3', why: 'Finger 3 covers fret 4: string 2, fret 4 is not in this scale.' },
        { text: 'Finger 1', why: 'Finger 1 stays at fret 2.' },
      ],
      explain: 'One finger per fret from fret 2: fret 2 finger 1, fret 3 finger 2, fret 4 finger 3, fret 5 finger 4. Every note is fretted, so you can shape and stop each one.',
      fact: 'second-position',
    },
    playerTask({
      id: 'second-position',
      title: 'Reading: Second Position, bars 1 to 8',
      song: 'st-read-second-position',
      bars: [1, 8],
      mode: 'wait',
      minutes: 5,
      body: 'Bars 1 to 8 from the staff, in wait mode: {k:A major} on strings 3 to 1, finger 1 parked at fret 2 and not one open string.',
    }),
    playerTask({
      id: 'sugar-plum',
      title: 'Sugar Plum Fairy, from the staff',
      song: 'dance-of-the-sugar-plum-fairy',
      mode: 'wait',
      minutes: 5,
      body: 'The theme of Tchaikovsky\'s Dance of the Sugar Plum Fairy, from the staff in wait mode. Light and detached: let each note go before the next. Check every accidental against the key signature.',
      fallback: {
        tool: 'player',
        params: ['hall-of-the-mountain-king', 'm1-4', 'wait'],
        title: 'Mountain King, from the staff',
        body: 'The Sugar Plum Fairy is not in the library yet; if you have a printed copy, bring it in with Scan and Import. Tonight read In the Hall of the Mountain King, bars 1 to 4, in wait mode: {k:E minor}, short and detached, with {n:A#} and {n:F} to catch.',
      },
    }),
    {
      type: 'play-phrase',
      prompt: 'Play bar 1 of Second Position from the staff: {n:A} {n:B} {n:C#} {n:E} {n:C#}, finger 1 at fret 2.',
      figure: { kind: 'staff', key: 'A major', time: '4/4', notes: staffOf(SECOND_POSITION_BAR_1, 'A major') },
      notes: SECOND_POSITION_BAR_1,
      octave: 'exact',
      tempo: 60,
      explain: 'String 3, fret 2 ({n:A}) and fret 4 ({n:B}), then string 2, fret 2 ({n:C#}), fret 5 ({n:E}) with finger 4, and back to fret 2.',
      alternative: {
        type: 'order',
        prompt: 'Put the notes of bar 1 in order.',
        tiles: ['{n:A}', '{n:B}', '{n:C#}', '{n:E}', '{n:C#}'],
        distractors: ['{n:C}'],
        explain: '{n:A} {n:B} {n:C#} {n:E} {n:C#}. In {k:A major} every C is {n:C#}.',
      },
    },
  ],
  facts: [
    { id: 'd-and-a-sharps', front: 'Which sharps do {k:D major} and {k:A major} add, and where in first position?', back: '{k:D major} adds {n:C#} (string 5, fret 4 and string 2, fret 2); {k:A major} adds {n:G#} too (string 3, fret 1, and fret 4 of strings 6 and 1).' },
    { id: 'dot-and-tie', front: 'What do a dot and a tie do to a note?', back: 'A dot makes it half as long again. A tie joins two notes into one longer sound, even across a bar line.' },
    { id: 'second-position', front: 'What is second position?', back: 'Finger 1 at fret 2, one finger per fret up to fret 5: no open strings needed.' },
  ],
};

// ── 6. Read a real piece: Minuet in G (milestone) ──────────────────────────────────────────────

const readARealPiece: TeacherLesson = {
  id: 'read-a-real-piece',
  title: 'Read a real piece: Minuet in G',
  teaches: 'Read the Minuet in G from notation: two halves, each played twice, as the repeat signs say.',
  minutes: 5,
  skill: 'teacher:dev:read-a-real-piece',
  steps: [
    {
      type: 'card',
      title: 'A real piece',
      body: 'Tonight you read a real piece: the Minuet in G, long credited to Bach and now attributed to Christian Petzold. Two halves, each repeated, mostly in first position. Guitar is written an octave higher than it sounds, so your part reads exactly like the keyboard\'s right hand.',
      figure: { kind: 'staff', key: 'G major', time: '3/4', notes: staffOf(MINUET_BARS_1_4.slice(0, 8), 'G major'), caption: 'Minuet in G, bars 1 and 2.' },
    },
    {
      type: 'choice',
      prompt: 'Why does your guitar part read exactly like the keyboard\'s right hand?',
      options: [
        { text: 'Guitar is written an octave above its sound', correct: true },
        { text: 'The guitar plays the bass line', why: 'The bass is the keyboard\'s left hand. You play the upper voice.' },
        { text: 'The minuet was written for guitar', why: 'It comes from a keyboard notebook of 1725.' },
      ],
      explain: 'Guitar music is written an octave higher than it sounds, so the keyboard\'s upper voice can be read as it stands, note for note.',
      fact: 'minuet-who',
    },
    {
      type: 'staff-read',
      prompt: 'The minuet\'s first note. Which is it?',
      note: 'D4',
      key: 'G major',
      options: ['D', 'B', 'F', 'G'],
      explain: 'The fourth line is {n:D}: string 2, fret 3.',
    },
    {
      type: 'card',
      title: 'The road map',
      body: 'Watch the {t:repeat-sign|repeat signs}: two dots by a double bar mean play that half again. So the road map is first half, first half again, second half, second half again. Reading the road map is part of reading.',
    },
    {
      type: 'order',
      prompt: 'Put the minuet\'s road map in order.',
      tiles: ['1st half', '1st half again', '2nd half', '2nd half again'],
      explain: 'Each half ends with a repeat sign, so each is played twice before you move on.',
      fact: 'minuet-road-map',
    },
    {
      type: 'card',
      title: 'The one shift',
      body: 'Bar 17 starts on {n:B} at string 1, fret 7. During the long open {n:G} that ends the first half, slide your hand up so finger 1 sits at fret 5: {n:A} at string 1, fret 5, {n:B} at fret 7 with finger 3, {n:G} at string 2, fret 8 with finger 4. After the {n:A} that starts bar 18, come back.',
      figure: { kind: 'fretboard', frets: [5, 8], labels: 'finger', dots: [dot(1, 5, { finger: 1 }), dot(1, 7, { finger: 3, role: 'target' }), dot(2, 8, { finger: 4 })], caption: 'Bars 17 and 18: finger 1 at fret 5.' },
    },
    {
      type: 'fretboard-name',
      prompt: 'Which note is string 1, fret 7, where the second half starts?',
      position: { string: 1, fret: 7 },
      ask: 'note',
      spelling: 'any',
      options: ['B', 'A', 'C', 'G'],
      explain: 'String 1, fret 7 is {n:B}, written above the staff: the high point that opens the second half.',
    },
    playerTask({
      id: 'minuet-a',
      title: 'First half, from the staff',
      song: 'minuet-in-g-melody',
      bars: [1, 16],
      mode: 'wait',
      minutes: 5,
      body: 'Score on Tab and notes, eyes on the staff. Bars 1 to 16 in wait mode. Lean a little on beat 1 of every bar: it is a dance in three.',
    }),
    playerTask({
      id: 'minuet-b',
      title: 'Second half, from the staff',
      song: 'minuet-in-g-melody',
      bars: [17, 32],
      mode: 'wait',
      minutes: 5,
      body: 'Bars 17 to 32 in wait mode. Make the shift to fret 5 before bar 17 and come back after the {n:A} in bar 18.',
    }),
    {
      type: 'true-false',
      statement: 'The hand moves up during the long {n:G} that ends the first half, so finger 1 sits at fret 5 for bar 17.',
      answer: true,
      explain: 'That {n:G} is the open string 3, so the hand is free to move while it rings. You arrive in time for {n:B} at string 1, fret 7.',
      fact: 'minuet-shift',
    },
    playerTask({
      id: 'minuet-80',
      title: 'The whole minuet at 80 BPM',
      song: 'minuet-in-g-melody',
      tempo: 80,
      minutes: 5,
      body: 'All of it with the repeats at 80 % (80 BPM), from the staff. The library\'s minuet is the melody alone, so turn the Click on in the options: it holds the beat a bass line would.',
    }),
    playerTask({
      id: 'minuet-100',
      title: 'The whole minuet at 100 BPM',
      song: 'minuet-in-g-melody',
      mode: 'flow',
      minutes: 4,
      body: 'Now at full speed, 100 BPM, in Flow mode: start to finish with the repeats, not stopping. Then come back for the show.',
    }),
    {
      type: 'play-phrase',
      id: 'show',
      prompt: 'Your show: the minuet\'s opening, bars 1 to 4. Read the staff, count three in, and keep going.',
      figure: { kind: 'staff', key: 'G major', time: '3/4', notes: staffOf(MINUET_BARS_1_4, 'G major') },
      notes: MINUET_BARS_1_4,
      octave: 'exact',
      tempo: 80,
      pass: 0.8,
      explain: '{n:D}, {n:G} {n:A} {n:B} {n:C}, {n:D} {n:G} {n:G}; {n:E}, {n:C} {n:D} {n:E} {n:F#}, {n:G} {n:G} {n:G}. About 8 notes in 10 is a pass.',
      alternative: {
        type: 'order',
        prompt: 'Put the first four bars of the minuet in order.',
        tiles: ['{n:D} {n:G} {n:A} {n:B} {n:C}', '{n:D} {n:G} {n:G}', '{n:E} {n:C} {n:D} {n:E} {n:F#}', '{n:G} {n:G} {n:G}'],
        explain: 'Bar 1 climbs from {n:D} through {n:G} {n:A} {n:B} {n:C}; bar 2 is {n:D} {n:G} {n:G}; bar 3 climbs again to {n:F#}; bar 4 lands on {n:G}.',
      },
    },
  ],
  facts: [
    { id: 'minuet-who', front: 'Who wrote the Minuet in G?', back: 'Christian Petzold, it is now thought; for a long time it was credited to Bach. It comes from a keyboard notebook of 1725.' },
    { id: 'minuet-road-map', front: 'The Minuet in G\'s road map?', back: 'Two halves, each repeated: first half, first half again, second half, second half again.' },
    { id: 'minuet-shift', front: 'Where does the Minuet in G leave first position?', back: 'Bar 17: finger 1 moves to fret 5 for {n:B} at string 1, fret 7, and comes back after bar 18 begins.' },
  ],
};

/** Unit 10 of Dev's course. */
const unit: TeacherUnit = {
  id: 'dev-neck-and-reading',
  title: 'Know the neck, read the music',
  theme: 'reading',
  description: 'Name any note on the neck in seconds, then read standard notation in first and second position, up to a real minuet.',
  lessons: [notesOn6And5, notesEverywhere, readingStrings1To3, readingAllSixStrings, readingSharpsAndRhythm, readARealPiece],
  checkpoint: { sample: 8, maxMistakes: 2 },
  milestone: {
    lesson: 'read-a-real-piece',
    step: 'show',
    piece: 'the Minuet in G',
    song: 'minuet-in-g-melody',
    celebrate: 'You read a real piece off the page and played it from the staff. That is a new skill for life: any printed melody is yours now, no tab needed. Next we take all these notes and start saying something with them.',
  },
  glossary: [
    { id: 'repeat-sign', term: 'repeat sign', definition: 'Two dots beside a double bar line: play the music between the repeat signs again before going on.' },
  ],
};

export default unit;
