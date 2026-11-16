/**
 * Theory Path, unit 42: Reading music up the neck. Written from the syllabus entries in
 * `src/content/plan/theory-path.json` (unit `reading-up-the-neck`), one lesson per entry, in order:
 * each lesson opens with its "on the guitar" picture, asks the planned exercises, ends with the
 * planned drills, and turns every planned fact into a review card.
 *
 * Data is sounding pitch, as everywhere in the app: the staff figures draw it an octave higher, the
 * way guitar music is written. `reading-up-the-neck.test.ts` checks every staff place, fret,
 * position, melody, fingering and listening question against the theory and guitar engines.
 *
 * What the figures cannot draw is taught in words beside a figure that can:
 * - The staff figure has no position marks, circled string numbers or 8va brackets. Position and
 *   string marks are written as labels under the note heads ("V ②"), and the 8va passage is shown
 *   as the written notes labelled with the frets 8va moves them to.
 * - There is no checklist panel: the sight-reading checklist is an order exercise.
 * - The synth cannot play the squeak of a sliding hand, so "smooth or audible shift" plays what a
 *   listener does hear: a steady line (the shift hidden under an open string) against a line whose
 *   next note arrives late.
 */
import type { Lesson, StaffNote, TabNote, Unit } from '@/lessons';

const U = 'reading-up-the-neck';

/** One note of a phrase: where it is played and the sounding pitch the staff shows. */
export type Note = [string: number, fret: number, pitch: string, duration: string];
const tab = (notes: Note[]): TabNote[] => notes.map(([string, fret, , duration]) => ({ string, fret, duration }));
const staff = (notes: Note[]): StaffNote[] => notes.map(([, , note, duration]) => ({ note, duration }));
/** The notes with the fret each one is played at, written under its head. */
const fretted = (notes: Note[]): StaffNote[] => notes.map(([, fret, note]) => ({ note, duration: 'q', label: String(fret) }));

/** The natural notes of fifth position, low to high: strings 6 to 4, then strings 3 to 1. */
export const FIFTH_LOW: Note[] = [
  [6, 5, 'A2', 'q'], [6, 7, 'B2', 'q'], [6, 8, 'C3', 'q'],
  [5, 5, 'D3', 'q'], [5, 7, 'E3', 'q'], [5, 8, 'F3', 'q'],
  [4, 5, 'G3', 'q'], [4, 7, 'A3', 'q'],
];
export const FIFTH_HIGH: Note[] = [
  [3, 4, 'B3', 'q'], [3, 5, 'C4', 'q'], [3, 7, 'D4', 'q'],
  [2, 5, 'E4', 'q'], [2, 6, 'F4', 'q'], [2, 8, 'G4', 'q'],
  [1, 5, 'A4', 'q'], [1, 7, 'B4', 'q'], [1, 8, 'C5', 'q'],
];

/** An original eight-bar melody in A minor, all in fifth position, in two four-bar halves. */
export const FIFTH_MELODY_A: Note[] = [
  [4, 7, 'A3', 'h'], [3, 5, 'C4', 'h'],
  [2, 5, 'E4', 'q'], [1, 5, 'A4', 'q'], [2, 8, 'G4', 'h'],
  [2, 6, 'F4', 'q'], [2, 5, 'E4', 'q'], [3, 7, 'D4', 'h'],
  [2, 5, 'E4', 'w'],
];
export const FIFTH_MELODY_B: Note[] = [
  [1, 8, 'C5', 'h'], [1, 7, 'B4', 'h'],
  [1, 5, 'A4', 'q'], [2, 8, 'G4', 'q'], [2, 6, 'F4', 'h'],
  [2, 5, 'E4', 'q'], [3, 7, 'D4', 'q'], [3, 5, 'C4', 'q'], [3, 4, 'B3', 'q'],
  [4, 7, 'A3', 'w'],
];

/** One note of a fingering: string, fret, sounding pitch, duration, and the position the hand is in. */
export type Fingered = [string: number, fret: number, pitch: string, duration: string, position: number];
const tabOf = (notes: Fingered[]): TabNote[] => notes.map(([string, fret, , duration]) => ({ string, fret, duration }));

/**
 * An original eight-bar melody in G major, fingered two ways. In first position the high A (string
 * 1, fret 5) is out of reach and the C sits at fret 1, so the hand shifts three times; in second
 * position every note lies under the hand.
 */
export const G_FIRST_POSITION: Fingered[] = [
  [3, 0, 'G3', 'q', 1], [2, 0, 'B3', 'q', 1], [2, 3, 'D4', 'h', 1],
  [2, 1, 'C4', 'q', 1], [2, 0, 'B3', 'q', 1], [3, 2, 'A3', 'h', 1],
  [2, 0, 'B3', 'q', 1], [2, 3, 'D4', 'q', 1], [1, 5, 'A4', 'h', 2],
  [1, 3, 'G4', 'q', 2], [1, 2, 'F#4', 'q', 2], [1, 3, 'G4', 'h', 2],
  [1, 0, 'E4', 'q', 2], [2, 1, 'C4', 'q', 1], [2, 0, 'B3', 'h', 1],
  [3, 2, 'A3', 'q', 1], [2, 0, 'B3', 'q', 1], [2, 1, 'C4', 'h', 1],
  [2, 3, 'D4', 'q', 1], [1, 2, 'F#4', 'q', 1], [1, 5, 'A4', 'h', 2],
  [1, 3, 'G4', 'w', 2],
];
export const G_SECOND_POSITION: Fingered[] = [
  [4, 5, 'G3', 'q', 2], [3, 4, 'B3', 'q', 2], [2, 3, 'D4', 'h', 2],
  [3, 5, 'C4', 'q', 2], [3, 4, 'B3', 'q', 2], [3, 2, 'A3', 'h', 2],
  [3, 4, 'B3', 'q', 2], [2, 3, 'D4', 'q', 2], [1, 5, 'A4', 'h', 2],
  [1, 3, 'G4', 'q', 2], [1, 2, 'F#4', 'q', 2], [1, 3, 'G4', 'h', 2],
  [2, 5, 'E4', 'q', 2], [3, 5, 'C4', 'q', 2], [3, 4, 'B3', 'h', 2],
  [3, 2, 'A3', 'q', 2], [3, 4, 'B3', 'q', 2], [3, 5, 'C4', 'h', 2],
  [2, 3, 'D4', 'q', 2], [1, 2, 'F#4', 'q', 2], [1, 5, 'A4', 'h', 2],
  [1, 3, 'G4', 'w', 2],
];
const G_MELODY_STAFF: StaffNote[] = G_SECOND_POSITION.map(([, , note, duration]) => ({ note, duration }));

/** A shift hidden under an open string: the quarter notes never stumble. Second position, then seventh. */
export const SHIFT_HIDDEN: TabNote[] = [
  { string: 4, fret: 5, duration: 'q' }, { string: 3, fret: 2, duration: 'q' }, { string: 2, fret: 0, duration: 'q' }, { string: 3, fret: 7, duration: 'q' },
  { string: 3, fret: 9, duration: 'q' }, { string: 3, fret: 7, duration: 'q' }, { string: 2, fret: 8, duration: 'h' },
];
/** The same line with no open string to cover the move: the hand arrives late and the beat stumbles. */
export const SHIFT_HEARD: TabNote[] = [
  { string: 4, fret: 5, duration: 'q' }, { string: 3, fret: 2, duration: 'q' }, { string: 3, fret: 4, duration: 'q' }, { rest: true, duration: 'e' }, { string: 3, fret: 7, duration: 'e' },
  { string: 3, fret: 9, duration: 'q' }, { string: 3, fret: 7, duration: 'q' }, { string: 2, fret: 8, duration: 'h' },
];

/** The 8va passage: written on string 1 at frets 0, 1, 3 and 5; marked 8va it moves twelve frets up. */
export const LOCO_PASSAGE: Note[] = [[1, 0, 'E4', 'q'], [1, 1, 'F4', 'q'], [1, 3, 'G4', 'q'], [1, 5, 'A4', 'q']];
export const OTTAVA_PASSAGE: Note[] = [[1, 12, 'E5', 'q'], [1, 13, 'F5', 'q'], [1, 15, 'G5', 'q'], [1, 17, 'A5', 'q']];

/** Written G to E above the staff, played on string 1 at frets 3 to 12. */
export const ABOVE_STAFF: Note[] = [
  [1, 3, 'G4', 'q'], [1, 5, 'A4', 'q'], [1, 7, 'B4', 'q'], [1, 8, 'C5', 'q'], [1, 10, 'D5', 'q'], [1, 12, 'E5', 'q'],
];

/**
 * An original sixteen-bar piece in G major, 3/4 time, all in second position (frets 2 to 5).
 * Range: F sharp at string 4, fret 4 up to A at string 1, fret 5. The first eight bars are read.
 */
export const SIGHT_PIECE: Note[] = [
  [4, 5, 'G3', 'h'], [3, 4, 'B3', 'q'],
  [2, 3, 'D4', 'h.'],
  [3, 5, 'C4', 'q'], [3, 4, 'B3', 'q'], [3, 2, 'A3', 'q'],
  [3, 4, 'B3', 'h.'],
  [4, 5, 'G3', 'h'], [3, 2, 'A3', 'q'],
  [3, 4, 'B3', 'q'], [3, 5, 'C4', 'q'], [2, 3, 'D4', 'q'],
  [2, 5, 'E4', 'h'], [1, 2, 'F#4', 'q'],
  [2, 3, 'D4', 'h.'],
  [1, 3, 'G4', 'h'], [1, 2, 'F#4', 'q'],
  [2, 5, 'E4', 'h'], [2, 3, 'D4', 'q'],
  [3, 5, 'C4', 'q'], [2, 3, 'D4', 'q'], [2, 5, 'E4', 'q'],
  [1, 5, 'A4', 'h.'],
  [1, 3, 'G4', 'q'], [1, 2, 'F#4', 'q'], [2, 5, 'E4', 'q'],
  [2, 3, 'D4', 'h'], [3, 4, 'B3', 'q'],
  [3, 2, 'A3', 'q'], [4, 4, 'F#3', 'q'], [3, 2, 'A3', 'q'],
  [4, 5, 'G3', 'h.'],
];
/** Bars 1 to 8 of the piece: the eight bars the learner sight-reads. */
export const SIGHT_FIRST_EIGHT: Note[] = SIGHT_PIECE.slice(0, 15);

const whatAPositionIs: Lesson = {
  id: 'what-a-position-is',
  title: 'Positions and how they are marked',
  teaches: 'A position is named after the fret under the first finger; music can mark the position and the string.',
  minutes: 3,
  skill: `theory:${U}:what-a-position-is`,
  steps: [
    {
      type: 'card',
      title: 'One note, three places',
      body: 'Most notes on the guitar can be played in more than one place. The {n:E} written in the top space of the staff is the open string 1. It is also string 2 at fret 5, and string 3 at fret 9. All three sound exactly the same pitch.',
      figure: {
        kind: 'fretboard',
        frets: [0, 9],
        dots: [
          { string: 1, fret: 0, note: 'E4', role: 'root' },
          { string: 2, fret: 5, note: 'E4', role: 'root' },
          { string: 3, fret: 9, note: 'E4', role: 'root' },
        ],
        caption: 'The same {n:E}: string 1 open, string 2 fret 5, string 3 fret 9.',
      },
    },
    {
      type: 'card',
      title: 'Positions',
      body: 'Your fretting hand covers four frets, one finger per fret. The {t:position} is named after the fret under your **first finger**. With it on fret 5 you are in **fifth position**, and fingers 1 to 4 cover frets 5 to 8.',
      figure: {
        kind: 'fretboard',
        frets: [3, 9],
        labels: 'finger',
        dots: [
          { string: 2, fret: 5, note: 'E4', finger: 1 },
          { string: 2, fret: 6, note: 'F4', finger: 2 },
          { string: 2, fret: 7, note: 'F#4', finger: 3 },
          { string: 2, fret: 8, note: 'G4', finger: 4 },
        ],
        caption: 'Fifth position: finger 1 on fret 5, finger 4 on fret 8.',
      },
      tip: 'Keep your thumb behind the neck, roughly behind finger 2. When the position changes, the whole hand moves with it.',
    },
    {
      type: 'choice',
      prompt: { text: 'In seventh position, which fret is under your first finger?', say: 'In seventh position, which fret is under your first finger?' },
      options: [
        { text: 'Fret 1', why: 'Fret 1 under the first finger is first position.' },
        { text: 'Fret 5', why: 'That is fifth position.' },
        { text: 'Fret 7', correct: true },
        { text: 'Fret 10', why: 'In seventh position fret 10 is under your fourth finger, at the top of the hand.' },
      ],
      shuffle: false,
      explain: 'A position is named after the fret under the first finger: seventh position puts it on fret 7, and the hand covers frets 7 to 10.',
      fact: 'reading-up-position-name',
    },
    {
      type: 'true-false',
      statement: 'In fifth position your four fingers cover frets 5 to 8.',
      answer: true,
      explain: 'Finger 1 sits on fret 5, so fingers 2, 3 and 4 fall on frets 6, 7 and 8: one finger per fret.',
      fact: 'reading-up-position-name',
    },
    {
      type: 'card',
      title: 'Marking the string and the position',
      body: {
        text: 'Music can say where to play. A circled number such as ③ names the **string**: play this note on string 3. A roman numeral such as V names the **position**: first finger at fret 5. A plain small number by a note is the **finger** to use.',
        say: 'Music can say where to play. A circled number, such as circled three, names the string: play this note on string 3. A roman numeral, such as five, names the position: first finger at fret 5. A plain small number by a note is the finger to use.',
      },
      figure: {
        kind: 'staff',
        notes: [
          { note: 'E4', duration: 'h', label: 'open' },
          { note: 'E4', duration: 'h', label: 'V ②' },
          { note: 'E4', duration: 'h', label: 'IX ③' },
        ],
        caption: 'One written {n:E}, marked for three places on the neck.',
      },
    },
    {
      type: 'choice',
      prompt: 'What does a circled 4 above a note mean?',
      options: [
        { text: 'Play it on string 4', correct: true },
        { text: 'Play it at fret 4', why: 'Music does not mark frets with circles: a circled number is always a string.' },
        { text: 'Play it with finger 4', why: 'A finger is a plain small number by the note, with no circle.' },
        { text: 'Play it in fourth position', why: 'A position is written as a roman numeral, not a circled number.' },
      ],
      explain: 'A circled number names the string. A circled 4 means: find this note on string 4.',
      fact: 'reading-up-position-marks',
    },
    {
      type: 'fretboard-find',
      prompt: 'This {n:E} is written in the top space. Tap where it is played on string 2, in fifth position.',
      figure: { kind: 'staff', notes: [{ note: 'E4', duration: 'w', label: '②' }] },
      find: { note: 'E4' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 9],
      strings: [2],
      explain: 'String 2, fret 5, under your first finger in fifth position. It sounds exactly like the open string 1.',
      fact: 'reading-up-many-places',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each mark with what it tells you.',
      pairs: [
        { left: { text: 'A circled 3 (③)', say: 'A circled three' }, right: 'Play on string 3' },
        { left: { text: 'Position V', say: 'Position five' }, right: 'Finger 1 at fret 5' },
        { left: { text: 'Position IX', say: 'Position nine' }, right: 'Finger 1 at fret 9' },
        { left: 'A small 3 by the note', right: 'Use finger 3' },
      ],
      explain: { text: 'Circles name strings, roman numerals name positions, and plain small numbers name fingers. Position V and IX put finger 1 at frets 5 and 9.', say: 'Circles name strings, roman numerals name positions, and plain small numbers name fingers. Positions five and nine put finger 1 at frets 5 and 9.' },
      fact: 'reading-up-position-marks',
    },
    {
      type: 'choice',
      prompt: 'Which of these plays the same {n:E} as the open string 1?',
      options: [
        { text: 'String 2, fret 5', correct: true },
        { text: 'String 2, fret 7', why: 'String 2 at fret 7 is {n:F#}, two frets too high.' },
        { text: 'String 3, fret 7', why: 'String 3 at fret 7 is {n:D}. The {n:E} on string 3 is at fret 9.' },
        { text: 'String 6, fret 12', why: 'That is an {n:E} too, but one octave lower.' },
      ],
      explain: 'String 2 is tuned to {n:B}; five frets up is {n:E}, the same pitch as the open string 1. That is why you tune string 1 to string 2 at fret 5.',
      fact: 'reading-up-many-places',
    },
    { generate: 'note-on-string', params: { strings: [2], frets: [5, 8], naturals: true, ask: 'name' } },
    {
      type: 'play-note',
      prompt: 'Now play the same {n:E} in ninth position: string 3, fret 9, with your first finger.',
      note: 'E4',
      octave: 'exact',
      where: { string: 3, fret: 9 },
      explain: 'String 3 at fret 9 is the {n:E} of the top space again: the same pitch as the open string 1, with a warmer, rounder sound.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap this {n:E} on string 3, in ninth position.',
        figure: { kind: 'staff', notes: [{ note: 'E4', duration: 'w', label: 'IX ③' }] },
        find: { note: 'E4' },
        mode: 'one',
        octave: 'exact',
        frets: [5, 12],
        strings: [3],
        explain: 'String 3, fret 9: finger 1 in ninth position. String 3 is tuned to {n:G}, and nine frets up is {n:E}.',
      },
    },
  ],
  facts: [
    {
      id: 'reading-up-position-name',
      front: 'What names a position on the neck?',
      back: 'The fret under your first finger. In fifth position the fingers cover frets 5 to 8.',
      ask: {
        type: 'choice',
        prompt: 'In ninth position, which frets do your four fingers cover?',
        options: [
          { text: 'Frets 9 to 12', correct: true },
          { text: 'Frets 6 to 9', why: 'Fret 9 is under the first finger, the lowest of the four.' },
          { text: 'Frets 1 to 4', why: 'That is first position.' },
        ],
        explain: 'Ninth position puts the first finger on fret 9, so the hand covers frets 9, 10, 11 and 12.',
      },
    },
    {
      id: 'reading-up-many-places',
      front: 'Can a written note be played in more than one place?',
      back: 'Usually, yes: most notes can be played in several positions. The fingering or the markings in the music show which one is meant.',
    },
    {
      id: 'reading-up-position-marks',
      front: 'How does music mark the position and the string?',
      back: { text: 'The position with a roman numeral (V for fifth position); the string with a circled number, so a circled 3 means play on string 3.', say: 'The position with a roman numeral, five for fifth position; the string with a circled number, so a circled 3 means play on string 3.' },
    },
  ],
};

const fifthPosition: Lesson = {
  id: 'fifth-position',
  title: 'Fifth position',
  teaches: 'In fifth position the naturals lie at frets 5 to 8, with a stretch back to fret 4 for B on string 3.',
  minutes: 4,
  skill: `theory:${U}:fifth-position`,
  steps: [
    {
      type: 'card',
      title: 'The natural notes of fifth position',
      body: 'Put your first finger at fret 5. Each finger keeps its own fret: 1 on fret 5, 2 on 6, 3 on 7, 4 on 8. The natural notes fall under those fingers on every string, from the {n:A} at string 6, fret 5 up to the {n:C} at string 1, fret 8.',
      figure: {
        kind: 'fretboard',
        frets: [4, 8],
        dots: [...FIFTH_LOW, ...FIFTH_HIGH].map(([string, fret, note]) => ({ string, fret, note })),
        caption: 'Fifth position: every natural note from fret 4 to fret 8.',
      },
    },
    {
      type: 'fretboard-find',
      prompt: 'In fifth position, tap every {n:G}.',
      find: { note: 'G' },
      mode: 'all',
      octave: 'any',
      frets: [4, 8],
      explain: 'There are two: string 4 at fret 5, under finger 1, and string 2 at fret 8, under finger 4.',
      fact: 'reading-up-fifth-naturals',
    },
    {
      type: 'card',
      title: 'Strings 6, 5 and 4 on the staff',
      body: 'String 6 gives {n:A} {n:B} {n:C}, string 5 {n:D} {n:E} {n:F}, string 4 {n:G} {n:A}. The lowest, {n:A} at string 6, fret 5, is written on the second ledger line below the staff. The numbers under the notes are frets.',
      figure: { kind: 'staff', notes: fretted(FIFTH_LOW), caption: 'Frets 5 7 8 on strings 6 and 5, then 5 7 on string 4.' },
    },
    {
      type: 'staff-read',
      prompt: 'Which note is this, in the second space of the staff?',
      note: 'A3',
      options: ['A', 'F', 'C', 'G'],
      explain: 'The spaces from the bottom spell F A C E, so the second space is {n:A}. In fifth position you play it at string 4, fret 7, with finger 3.',
    },
    {
      type: 'choice',
      prompt: 'Where is this {n:A} played in fifth position?',
      figure: { kind: 'staff', notes: [{ note: 'A3', duration: 'w' }] },
      options: [
        { text: 'String 4, fret 7', correct: true },
        { text: 'String 3, fret 2', why: 'Same pitch, but that is first position: fret 2 is below the hand in fifth position.' },
        { text: 'String 5, fret 7', why: 'String 5 at fret 7 is {n:E}, written on the bottom line.' },
        { text: 'String 1, fret 5', why: 'That {n:A} is an octave higher, on the first ledger line above the staff.' },
      ],
      explain: 'The {n:A} in the second space is string 4, fret 7, under finger 3 in fifth position.',
      fact: 'reading-up-fifth-naturals',
    },
    {
      type: 'card',
      title: 'Strings 3, 2 and 1, and one stretch',
      body: 'String 3 gives {n:B} {n:C} {n:D}, string 2 {n:E} {n:F} {n:G}, string 1 {n:A} {n:B} {n:C}. String 3 is the odd one: its {n:B} is at fret 4, below the position. Stretch your first finger back to reach it, then bring it home to fret 5.',
      figure: { kind: 'staff', notes: fretted(FIFTH_HIGH), caption: 'Frets 4 5 7, then 5 6 8, then 5 7 8 on strings 3, 2 and 1.' },
      tip: 'Stretch only the first finger. The rest of the hand stays in fifth position, ready for the next note.',
    },
    {
      type: 'choice',
      prompt: 'Which natural note of fifth position lies outside frets 5 to 8?',
      options: [
        { text: '{n:B} on string 3', correct: true },
        { text: '{n:C} on string 1', why: 'String 1, fret 8 is under finger 4, inside the position.' },
        { text: '{n:A} on string 6', why: 'String 6, fret 5 is under finger 1, inside the position.' },
        { text: '{n:F} on string 2', why: 'String 2, fret 6 is under finger 2, inside the position.' },
      ],
      explain: 'The {n:B} on string 3 is at fret 4, so the first finger stretches back one fret to play it.',
      fact: 'reading-up-fifth-stretch',
    },
    {
      type: 'fretboard-find',
      prompt: 'This {n:C} sits on the second ledger line above the staff. Tap where it is played in fifth position.',
      figure: { kind: 'staff', notes: [{ note: 'C5', duration: 'w' }] },
      find: { note: 'C5' },
      mode: 'one',
      octave: 'exact',
      frets: [4, 8],
      explain: 'String 1, fret 8, under finger 4: the highest note of fifth position. It sounds {n:C5}.',
      fact: 'reading-up-fifth-top',
    },
    {
      type: 'card',
      title: 'Read a melody in fifth position',
      body: 'An original eight-bar melody in {k:A minor}. Every note lies under the hand in fifth position, and bar 7 uses the stretch for {n:B}. Name the notes first, then find each one before you play.',
      figure: { kind: 'staff', time: '4/4', notes: staff([...FIFTH_MELODY_A, ...FIFTH_MELODY_B]), caption: 'Eight bars in {k:A minor}, all in fifth position.' },
    },
    {
      type: 'play-phrase',
      prompt: 'Play bars 1 to 4 from the staff, slowly. The tab is there to check yourself.',
      figure: { kind: 'staff', time: '4/4', notes: staff(FIFTH_MELODY_A) },
      notes: tab(FIFTH_MELODY_A),
      octave: 'exact',
      tempo: 66,
      explain: '{n:A} at string 4, fret 7, {n:C} at string 3, fret 5, then up to string 1 for {n:A} and back down string 2: {n:G}, {n:F}, {n:E}. The phrase rests on {n:E}.',
      alternative: {
        type: 'fill-blanks',
        prompt: 'Read bars 1 to 4 and fill in the missing notes.',
        figure: { kind: 'staff', time: '4/4', notes: staff(FIFTH_MELODY_A) },
        text: '{n:A} {n:C} | {n:E} {n:A} ___ | {n:F} ___ {n:D} | {n:E}',
        blanks: ['{n:G}', '{n:E}'],
        bank: ['{n:B}', '{n:C}'],
        explain: 'Bar 2 ends on {n:G}, in the space above the staff; bar 3 steps down {n:F} {n:E} {n:D}, and bar 4 holds {n:E}.',
      },
    },
    {
      type: 'play-phrase',
      prompt: 'Now bars 5 to 8. Read them first, then play.',
      figure: { kind: 'staff', time: '4/4', notes: staff(FIFTH_MELODY_B) },
      notes: tab(FIFTH_MELODY_B),
      octave: 'exact',
      tempo: 66,
      explain: 'Down from {n:C} at string 1, fret 8 all the way to {n:A}: string 1, then string 2, then string 3 with the stretch to fret 4 for {n:B}, and home to string 4, fret 7.',
      alternative: {
        type: 'fill-blanks',
        prompt: 'Read bars 5 to 8 and fill in the missing notes.',
        figure: { kind: 'staff', time: '4/4', notes: staff(FIFTH_MELODY_B) },
        text: '{n:C} {n:B} | {n:A} {n:G} {n:F} | {n:E} ___ {n:C} ___ | {n:A}',
        blanks: ['{n:D}', '{n:B}'],
        bank: ['{n:G}', '{n:F}'],
        explain: 'Bar 7 walks down by step: {n:E} {n:D} {n:C} {n:B}, the {n:B} at string 3, fret 4. Then the melody lands on {n:A}.',
      },
    },
    { generate: 'staff-note', params: { ask: 'read', low: 'A2', high: 'C5' } },
  ],
  facts: [
    {
      id: 'reading-up-fifth-naturals',
      front: 'Name the natural notes of fifth position, string by string, with their frets.',
      back: 'String 6: {n:A} {n:B} {n:C} (5, 7, 8). String 5: {n:D} {n:E} {n:F} (5, 7, 8). String 4: {n:G} {n:A} (5, 7). String 3: {n:B} {n:C} {n:D} (4, 5, 7). String 2: {n:E} {n:F} {n:G} (5, 6, 8). String 1: {n:A} {n:B} {n:C} (5, 7, 8).',
      ask: {
        type: 'fretboard-find',
        prompt: 'In fifth position, tap every {n:D}.',
        find: { note: 'D' },
        mode: 'all',
        octave: 'any',
        frets: [4, 8],
        explain: 'Two: string 5 at fret 5 and string 3 at fret 7.',
      },
    },
    {
      id: 'reading-up-fifth-stretch',
      front: 'In fifth position, how do you reach the {n:B} on string 3?',
      back: 'Stretch the first finger back to fret 4, then bring it home to fret 5.',
    },
    {
      id: 'reading-up-fifth-top',
      front: 'What is the highest note of fifth position, and where is it written?',
      back: 'String 1, fret 8: it sounds {n:C5} and is written on the second ledger line above the staff.',
    },
  ],
};

const choosingAPosition: Lesson = {
  id: 'choosing-a-position',
  title: 'Choosing a position',
  teaches: 'Choose the position that keeps most of a passage under the hand, and shift where the move is easiest to hide.',
  minutes: 3,
  skill: `theory:${U}:choosing-a-position`,
  steps: [
    {
      type: 'card',
      title: 'Where should your hand sit?',
      body: 'Most notes can be played in several places, so every piece leaves you a choice. Pick the {t:position} that keeps the most notes under your hand, so that you {t:shift} as little as possible. Here is an original melody in {k:G major} to try it on.',
      figure: { kind: 'staff', key: 'G major', time: '4/4', notes: G_MELODY_STAFF, caption: 'Eight bars in {k:G major}: from {n:G} up to the high {n:A}.' },
    },
    {
      type: 'card',
      title: 'First position: three shifts',
      body: 'Read in first position, the melody runs into trouble. The high {n:A} at string 1, fret 5 is above the hand, so it shifts up for bar 3, back down for the {n:C} at fret 1 in bar 5, and up again in bar 7. Three moves in eight bars.',
      figure: { kind: 'tab', tempo: 92, notes: tabOf(G_FIRST_POSITION), caption: 'First position with open strings: the hand shifts three times.' },
    },
    {
      type: 'fretboard-find',
      prompt: 'Now put your first finger at fret 2. In second position, where do you play the {n:C} of bar 2?',
      find: { note: 'C4' },
      mode: 'one',
      octave: 'exact',
      frets: [2, 5],
      explain: 'String 3, fret 5, under finger 4. In second position the {n:C} moves from string 2 to string 3, so the hand never needs fret 1.',
      fact: 'reading-up-fewest-shifts',
    },
    {
      type: 'card',
      title: 'Second position: no shifts',
      body: 'With finger 1 at fret 2 the whole melody lies between frets 2 and 5. The high {n:A} is finger 4 at string 1, fret 5, the {n:C} is finger 4 at string 3, fret 5, and the hand never moves.',
      figure: { kind: 'tab', tempo: 92, notes: tabOf(G_SECOND_POSITION), caption: 'Second position: frets 2 to 5, no shifts at all.' },
    },
    {
      type: 'choice',
      prompt: 'Why is second position the better choice for this melody?',
      options: [
        { text: 'Every note lies under the hand: no shifts', correct: true },
        { text: 'It uses more open strings', why: 'It uses none: every note is fretted between frets 2 and 5.' },
        { text: 'It sounds an octave higher', why: 'The notes are the same pitches; only the places on the neck change.' },
      ],
      explain: 'The best position keeps the most notes under the hand with the fewest shifts. Here second position holds all of them.',
      fact: 'reading-up-fewest-shifts',
    },
    {
      type: 'true-false',
      statement: 'The best position is always the lowest one.',
      answer: false,
      explain: 'The best position is the one that fits the passage. This melody fits second position better than first, and an {k:A minor} melody that climbs to {n:C5} fits fifth.',
    },
    {
      type: 'card',
      title: 'Keys that fit',
      body: 'Some keys lie well in one position. {k:G major} fits second position (frets 2 to 5). {k:A minor} fits fifth position (frets 5 to 8, plus the stretch). {k:A major} fits fourth position (frets 4 to 7).',
      figure: { kind: 'fretboard', frets: [2, 5], derive: { scale: 'major', tonic: 'G' }, root: 'G', caption: '{k:G major} in second position: every note between frets 2 and 5.' },
    },
    {
      type: 'choice',
      prompt: 'A melody in {k:A minor} runs from the {n:A} in the second space up to the {n:C} on the second ledger line above. Which position suits it?',
      options: [
        { text: 'Fifth position', correct: true },
        { text: 'First position', why: 'The high {n:C} is at string 1, fret 8: far above first position.' },
        { text: 'Second position', why: 'The high {n:B} and {n:C} at frets 7 and 8 are still out of reach.' },
      ],
      explain: 'Fifth position holds every note from {n:A3} at string 4, fret 7 up to {n:C5} at string 1, fret 8, so the melody needs no shift.',
      fact: 'reading-up-key-positions',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each key with the position it lies well in.',
      pairs: [
        { left: '{k:G major}', right: 'Second position' },
        { left: '{k:A minor}', right: 'Fifth position' },
        { left: '{k:A major}', right: 'Fourth position' },
      ],
      explain: '{k:G major} fits frets 2 to 5, {k:A major} frets 4 to 7, and {k:A minor} frets 5 to 8 with a stretch back for {n:B}.',
      fact: 'reading-up-key-positions',
    },
    {
      type: 'card',
      title: 'Hide the shift',
      body: 'When you must move, move where nobody hears it: during a rest, a repeated note, or an **open string**. Here an open {n:B} rings while the hand travels from second position to seventh. The beat never stumbles.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: SHIFT_HIDDEN, tempo: 84 }, label: 'Hear a hidden shift' },
    },
    {
      type: 'listen-choice',
      prompt: 'Now the same climb with no open string to cover the move. Did the shift stay hidden?',
      sound: { kind: 'tab', notes: SHIFT_HEARD, tempo: 84 },
      options: [
        { text: 'Hidden: the beat kept going' },
        { text: 'Heard: one note arrived late', correct: true },
      ],
      shuffle: false,
      explain: 'The {n:D} came half a beat late, after a gap: the hand was still travelling. With an open string to play during the move, the beat stays steady.',
    },
    {
      type: 'choice',
      prompt: 'You must shift up the neck. When is the best moment?',
      options: [
        { text: 'During a rest or an open string', correct: true },
        { text: 'In the middle of a held note', why: 'Lifting the finger cuts the held note short: everyone hears the gap.' },
        { text: 'Between two quick fretted notes', why: 'Quick notes leave no time to move: the next one tends to arrive late.' },
      ],
      explain: 'Shift when the hand is free and the music does not need it: a rest, an open string or a repeated note hides the move.',
      fact: 'reading-up-shift-moment',
    },
  ],
  facts: [
    {
      id: 'reading-up-fewest-shifts',
      front: 'How do you choose a position for a passage?',
      back: 'Choose the one that keeps most of its notes under the hand, with the fewest shifts.',
    },
    {
      id: 'reading-up-key-positions',
      front: 'Which positions suit {k:G major}, {k:A minor} and {k:A major}?',
      back: '{k:G major}: second position (frets 2 to 5). {k:A minor}: fifth position. {k:A major}: fourth position (frets 4 to 7).',
      ask: {
        type: 'choice',
        prompt: 'Which position suits a melody in {k:G major} that stays between {n:G3} and {n:A4}?',
        options: [
          { text: 'Second position', correct: true },
          { text: 'Fifth position', why: 'Possible, but the {n:B} at string 3, fret 4 needs a stretch. Second position needs none.' },
          { text: 'First position', why: 'The high {n:A} at string 1, fret 5 is above first position.' },
        ],
        explain: '{k:G major} lies well in second position, frets 2 to 5: from {n:G3} at string 4, fret 5 to {n:A4} at string 1, fret 5.',
      },
    },
    {
      id: 'reading-up-shift-moment',
      front: 'Where is the best place to shift?',
      back: 'During an open string, a repeated note or a rest, where the move is easiest to hide.',
    },
  ],
};

const ledgerLinesAbove: Lesson = {
  id: 'ledger-lines-above',
  title: 'Ledger lines above the staff and 8va',
  teaches: 'High notes use ledger lines above the staff, and 8va tells you to play an octave higher than written.',
  minutes: 3,
  skill: `theory:${U}:ledger-lines-above`,
  steps: [
    {
      type: 'card',
      title: 'Above the staff',
      body: 'Notes higher than the top line, {n:F}, go on {t:ledger-line|ledger lines} above the staff. Read them like the staff itself: space, line, space, line. On the guitar they are string 1 notes, from {n:G} at fret 3 up to {n:E} at fret 12.',
      figure: { kind: 'staff', notes: ABOVE_STAFF.map(([, fret, note]) => ({ note, duration: 'q', label: String(fret) })), caption: 'Written {n:G} to {n:E} above the staff: string 1, frets 3 to 12.' },
      tip: 'Count the ledger lines first: one line is {n:A}, two lines is {n:C}, three lines is {n:E}.',
    },
    {
      type: 'staff-read',
      prompt: 'Which note sits on the first ledger line above the staff?',
      note: 'A4',
      options: ['A', 'G', 'C', 'B'],
      explain: 'Above the top line {n:F} comes {n:G} in the space, then {n:A} on the first ledger line. It sounds {n:A4}: string 1, fret 5.',
      fact: 'reading-up-ledger-a',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap where this {n:C}, on the second ledger line above the staff, is played.',
      figure: { kind: 'staff', notes: [{ note: 'C5', duration: 'w' }] },
      find: { note: 'C5' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 12],
      explain: 'String 1, fret 8. Ledger line one is {n:A} at fret 5, the space above it {n:B} at fret 7, and ledger line two {n:C} at fret 8.',
      fact: 'reading-up-ledger-c',
    },
    {
      type: 'choice',
      prompt: 'This {n:E} sits on the third ledger line above the staff. Where is it played?',
      figure: { kind: 'staff', notes: [{ note: 'E5', duration: 'w' }] },
      options: [
        { text: 'String 1, fret 12', correct: true },
        { text: 'String 1, open', why: 'The open string 1 is written an octave lower, in the top space of the staff.' },
        { text: 'String 2, fret 5', why: 'That is the same pitch as the open string 1: the top space.' },
        { text: 'String 1, fret 10', why: 'That is {n:D}, in the space just below the third ledger line.' },
      ],
      explain: 'Three ledger lines up is {n:E}, one octave above the open string 1: string 1, fret 12.',
    },
    {
      type: 'card',
      title: '8va: an octave higher',
      body: { text: 'Notes higher still would need a ladder of ledger lines. So music writes them an octave lower and marks them **8va** with a dashed line. It means: play an octave higher than written, until the line ends or the word *loco* says back to normal. On one string that is 12 frets higher.', say: 'Notes higher still would need a ladder of ledger lines. So music writes them an octave lower and marks them ottava, eight v a, with a dashed line. It means: play an octave higher than written, until the line ends or the word loco says back to normal. On one string that is 12 frets higher.' },
      figure: { kind: 'staff', notes: LOCO_PASSAGE.map(([, , note], i) => ({ note, duration: 'q', label: String(OTTAVA_PASSAGE[i][1]) })), caption: 'Marked 8va: string 1 at frets 12, 13, 15 and 17, not 0, 1, 3 and 5.' },
    },
    {
      type: 'card',
      title: 'Hear it',
      body: 'First the four notes as written, on string 1 at frets 0, 1, 3 and 5. Then the same four with 8va, at frets 12, 13, 15 and 17: the same names, one octave up.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: [...tab(LOCO_PASSAGE), ...tab(OTTAVA_PASSAGE)], tempo: 90 }, label: 'As written, then 8va' },
    },
    {
      type: 'choice',
      prompt: 'What does 8va over a passage mean?',
      options: [
        { text: 'Play it an octave higher than written', correct: true },
        { text: 'Play it an octave lower than written', why: 'That is 8vb, with the dashed line below the staff.' },
        { text: 'Play it eight frets higher', why: 'An octave is twelve frets. The 8 counts letter names: {n:E} up to the next {n:E} is eight letters.' },
        { text: 'Play the passage eight times', why: 'Repeats use repeat signs. 8va is about pitch, not repeats.' },
      ],
      explain: '8va (all\'ottava) means play an octave higher than written, until the dashed line ends or *loco* appears.',
      fact: 'reading-up-8va',
    },
    {
      type: 'fretboard-find',
      prompt: 'This {n:G}, in the space above the staff, is marked 8va. Tap where you play it on string 1.',
      figure: { kind: 'staff', notes: [{ note: 'G4', duration: 'w', label: '8va' }] },
      find: { note: 'G5' },
      mode: 'one',
      octave: 'exact',
      frets: [3, 15],
      strings: [1],
      explain: 'Without the 8va it is string 1, fret 3. An octave higher is twelve frets up: string 1, fret 15.',
      fact: 'reading-up-8va',
    },
    {
      type: 'true-false',
      statement: 'After an 8va passage, *loco* means keep playing an octave higher.',
      answer: false,
      explain: '*Loco* means "in place": go back to playing the notes where they are written.',
      fact: 'reading-up-8va',
    },
    {
      type: 'play-note',
      prompt: 'Play the {n:A} on the first ledger line above the staff: string 1, fret 5.',
      figure: { kind: 'staff', notes: [{ note: 'A4', duration: 'w' }] },
      note: 'A4',
      octave: 'exact',
      where: { string: 1, fret: 5 },
      explain: 'The first ledger line above is {n:A}, sounding {n:A4}: string 1, fret 5, the same note the open string 5 sounds two octaves lower.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap the {n:A} on the first ledger line above the staff, on string 1.',
        figure: { kind: 'staff', notes: [{ note: 'A4', duration: 'w' }] },
        find: { note: 'A4' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 12],
        strings: [1],
        explain: 'String 1, fret 5: the {n:A} on the first ledger line above the staff.',
      },
    },
    { generate: 'staff-note', params: { ask: 'read', low: 'G4', high: 'E5' } },
  ],
  facts: [
    {
      id: 'reading-up-ledger-a',
      front: 'Which note is on the first ledger line above the staff, and where is it played?',
      back: '{n:A}, sounding {n:A4}: string 1, fret 5.',
    },
    {
      id: 'reading-up-ledger-c',
      front: 'Which note is on the second ledger line above the staff, and where is it played?',
      back: '{n:C}, sounding {n:C5}: string 1, fret 8.',
      ask: {
        type: 'fretboard-find',
        prompt: 'Tap where the {n:C} on the second ledger line above the staff is played.',
        figure: { kind: 'staff', notes: [{ note: 'C5', duration: 'w' }] },
        find: { note: 'C5' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 12],
        explain: 'String 1, fret 8.',
      },
    },
    {
      id: 'reading-up-8va',
      front: 'What do 8va and loco mean?',
      back: '8va over a passage: play it an octave higher than written. *Loco*: go back to playing as written.',
    },
  ],
};

const sightReadingRoutine: Lesson = {
  id: 'sight-reading-routine',
  title: 'A sight-reading routine',
  teaches: 'Before you play, scan the key, time, range and positions; then play slowly without stopping, reading ahead.',
  minutes: 3,
  skill: `theory:${U}:sight-reading-routine`,
  steps: [
    {
      type: 'card',
      title: 'Look before you play',
      body: '{t:sight-reading|Sight-reading} is playing music you have never seen. Spend half a minute scanning it first: the **key signature**, the **time signature**, the **range** (the highest and lowest notes) and the **positions** it needs. Here is an original piece to scan.',
      figure: { kind: 'staff', key: 'G major', time: '3/4', notes: staff(SIGHT_PIECE), caption: 'Sixteen bars in {k:G major}, 3/4 time.' },
    },
    {
      type: 'order',
      prompt: 'Put the sight-reading routine in order.',
      tiles: ['Check the key', 'Check the time', 'Find the range', 'Play, no stops'],
      explain: 'Scan what the start of the line shows first: the key signature, then the time signature. Then find the highest and lowest notes, and only then play.',
      fact: 'reading-up-scan-first',
    },
    {
      type: 'choice',
      prompt: 'The key signature of this piece has one sharp, on the {n:F} line. What does it tell you?',
      figure: { kind: 'staff', key: 'G major', time: '3/4', notes: staff(SIGHT_PIECE.slice(12, 17)) },
      options: [
        { text: 'Every {n:F} is played as {n:F#}', correct: true },
        { text: 'Only the first {n:F} is sharp', why: 'A key signature lasts the whole piece, in every bar and every octave.' },
        { text: 'Play the whole piece a half step higher', why: 'Only the {n:F} notes change. Every other note stays as written.' },
      ],
      explain: 'One sharp means {k:G major}: every {n:F} is {n:F#}, here at string 1, fret 2 in bars 7 and 9.',
      fact: 'reading-up-scan-first',
    },
    {
      type: 'choice',
      prompt: 'The piece runs from {n:F#} at string 4, fret 4 to {n:A} at string 1, fret 5. Which position fits it?',
      options: [
        { text: 'Second position', correct: true },
        { text: 'First position', why: 'The high {n:A} at fret 5 lies above first position.' },
        { text: 'Fifth position', why: 'Possible, but the {n:F#} at string 4 and the {n:B} at string 3 would both need a stretch back to fret 4.' },
      ],
      explain: 'Everything lies between frets 2 and 5: second position, the home of {k:G major}. So this piece needs no shifts.',
      fact: 'reading-up-scan-first',
    },
    {
      type: 'card',
      title: 'Keep going, read ahead',
      body: 'Then count in at a tempo slow enough to stay steady, such as 60 beats per minute. When a note goes wrong, **keep going**: the beat matters more than any single note. And **read ahead**: while you play one beat, your eyes are already on the next.',
      tip: 'Mistakes are fine. Stopping to fix them is the habit to drop.',
    },
    {
      type: 'true-false',
      statement: 'When sight-reading, you should stop and fix every wrong note.',
      answer: false,
      explain: 'Keep going. A steady beat with a wrong note sounds like music; stopping breaks it for everyone listening, and for you.',
      fact: 'reading-up-keep-going',
    },
    {
      type: 'choice',
      prompt: 'While you play the first beat of a bar, where should your eyes be?',
      options: [
        { text: 'On the next beat or bar', correct: true },
        { text: 'On the note you are playing', why: 'You have already read it. Look ahead so the next note is ready.' },
        { text: 'On your fretting hand', why: 'Your hand knows the position. Keep your eyes on the music.' },
      ],
      explain: 'Read ahead: look at the next beat or bar while you play this one, so nothing takes you by surprise.',
      fact: 'reading-up-read-ahead',
    },
    {
      type: 'play-phrase',
      prompt: 'Sight-read bars 1 to 8 at 60 beats per minute, in second position. Do not stop, whatever happens.',
      figure: { kind: 'staff', key: 'G major', time: '3/4', notes: staff(SIGHT_FIRST_EIGHT) },
      notes: tab(SIGHT_FIRST_EIGHT),
      octave: 'exact',
      tempo: 60,
      explain: 'Bars 1 to 4 climb {n:G} {n:B} {n:D} and step back down to {n:B}; bars 5 to 8 climb again to {n:E} and {n:F#} and rest on {n:D}.',
      alternative: {
        type: 'fill-blanks',
        prompt: 'Read bars 1 to 8 and fill in the missing notes. Mind the key signature.',
        figure: { kind: 'staff', key: 'G major', time: '3/4', notes: staff(SIGHT_FIRST_EIGHT) },
        text: '{n:G} {n:B} | {n:D} | {n:C} {n:B} {n:A} | {n:B} | {n:G} {n:A} | ___ {n:C} {n:D} | {n:E} ___ | {n:D}',
        blanks: ['{n:B}', '{n:F#}'],
        bank: ['{n:F}', '{n:A}'],
        explain: 'Bar 6 starts on {n:B}, on the middle line. The note on the top line in bar 7 is an {n:F}, and the key signature makes it {n:F#}.',
      },
    },
    { generate: 'staff-note', params: { ask: 'read', low: 'G3', high: 'A4' } },
  ],
  facts: [
    {
      id: 'reading-up-scan-first',
      front: 'What do you check before you sight-read?',
      back: 'The key signature, the time signature, the highest and lowest notes, and any position changes.',
      ask: {
        type: 'order',
        prompt: 'Put the sight-reading routine in order.',
        tiles: ['Check the key', 'Check the time', 'Find the range', 'Play, no stops'],
        explain: 'Key signature, time signature, range, then play without stopping.',
      },
    },
    {
      id: 'reading-up-keep-going',
      front: 'What do you do about a wrong note while sight-reading?',
      back: 'Keep going at a slow, steady tempo: a wrong note is better than stopping.',
    },
    {
      id: 'reading-up-read-ahead',
      front: 'Where should your eyes be while you sight-read?',
      back: 'Ahead: on the next beat or bar while you play the current one.',
    },
  ],
};

/** Unit 42 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'Reading: positions up the neck',
  theme: 'reading',
  description: 'Positions and how they are marked, fifth position, choosing where to play, ledger lines above the staff and a sight-reading routine.',
  lessons: [whatAPositionIs, fifthPosition, choosingAPosition, ledgerLinesAbove, sightReadingRoutine],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      {
        type: 'choice',
        prompt: 'In ninth position, which fret is under your first finger?',
        options: [{ text: 'Fret 1' }, { text: 'Fret 5' }, { text: 'Fret 9', correct: true }, { text: 'Fret 12', why: 'Fret 12 is under finger 4 in ninth position.' }],
        shuffle: false,
        explain: 'A position is named after the fret under the first finger: ninth position covers frets 9 to 12.',
      },
      {
        type: 'choice',
        prompt: 'What does a circled 2 above a note mean?',
        options: [
          { text: 'Play it on string 2', correct: true },
          { text: 'Play it with finger 2', why: 'A finger is a plain number with no circle.' },
          { text: 'Play it in second position', why: 'A position is marked with a roman numeral.' },
        ],
        explain: 'A circled number names the string.',
      },
      {
        type: 'fretboard-find',
        prompt: 'In fifth position, tap every {n:C}.',
        find: { note: 'C' },
        mode: 'all',
        octave: 'any',
        frets: [4, 8],
        explain: 'Three: string 6 at fret 8, string 3 at fret 5 and string 1 at fret 8.',
      },
      {
        type: 'choice',
        prompt: 'Where is this {n:B}, on the middle line, played in fifth position?',
        figure: { kind: 'staff', notes: [{ note: 'B3', duration: 'w' }] },
        options: [
          { text: 'String 3, fret 4', correct: true },
          { text: 'String 4, fret 7', why: 'That is {n:A}, in the second space.' },
          { text: 'String 3, fret 6', why: 'String 3 at fret 6 is {n:C#}.' },
          { text: 'String 4, fret 9', why: 'Same pitch, but fret 9 is above fifth position.' },
        ],
        explain: 'The {n:B} on the middle line is string 3, fret 4: the one stretch of fifth position, with the first finger reaching back.',
      },
      {
        type: 'choice',
        prompt: 'A melody in {k:A major} runs from {n:A} at string 6, fret 5 up to {n:B} at string 1, fret 7. Which position holds it all?',
        options: [
          { text: 'Fourth position', correct: true },
          { text: 'First position', why: 'The high {n:B} at string 1, fret 7 is far above first position.' },
          { text: 'Fifth position', why: 'The {n:C#} on string 5 and the {n:G#} on string 1 sit at fret 4, below the hand.' },
          { text: 'Ninth position', why: 'The low {n:A} at string 6, fret 5 is below the hand.' },
        ],
        explain: '{k:A major} lies well in fourth position: every note from string 6, fret 5 to string 1, fret 7 is between frets 4 and 7.',
      },
      {
        type: 'choice',
        prompt: 'Where is the best place to shift?',
        options: [
          { text: 'During an open string or a rest', correct: true },
          { text: 'In the middle of a held note', why: 'Lifting the finger cuts the note short.' },
          { text: 'Between two quick fretted notes', why: 'There is no time to move: the next note arrives late.' },
        ],
        explain: 'Shift where the move is hidden: an open string, a repeated note or a rest.',
      },
      {
        type: 'true-false',
        statement: 'The best position is always the lowest one.',
        answer: false,
        explain: 'The best position is the one that keeps the passage under the hand with the fewest shifts.',
      },
      {
        type: 'staff-read',
        prompt: 'Which note is this?',
        note: 'C5',
        options: ['C', 'A', 'E', 'G'],
        explain: 'Second ledger line above the staff: {n:C}, string 1, fret 8.',
      },
      {
        type: 'fretboard-find',
        prompt: 'This {n:A}, on the first ledger line above the staff, is marked 8va. Tap where you play it on string 1.',
        figure: { kind: 'staff', notes: [{ note: 'A4', duration: 'w', label: '8va' }] },
        find: { note: 'A5' },
        mode: 'one',
        octave: 'exact',
        frets: [5, 17],
        strings: [1],
        explain: 'As written it is string 1, fret 5. With 8va it sounds an octave higher: string 1, fret 17.',
      },
      {
        type: 'choice',
        prompt: 'What does *loco* mean after an 8va passage?',
        options: [
          { text: 'Play as written again', correct: true },
          { text: 'Stay an octave higher', why: 'That is what 8va asks; loco cancels it.' },
          { text: 'Play an octave lower than written', why: 'That would be 8vb.' },
        ],
        explain: '*Loco* means "in place": back to the written pitch.',
      },
      {
        type: 'order',
        prompt: 'Put the sight-reading routine in order.',
        tiles: ['Check the key', 'Check the time', 'Find the range', 'Play, no stops'],
        explain: 'Key signature, time signature, range, then play without stopping.',
      },
      {
        type: 'true-false',
        statement: 'When sight-reading, you should stop and fix every wrong note.',
        answer: false,
        explain: 'Keep the beat going: a wrong note is better than stopping.',
      },
      {
        type: 'play-phrase',
        prompt: 'Read and play bars 1 to 4 of the melody in fifth position.',
        figure: { kind: 'staff', time: '4/4', notes: staff(FIFTH_MELODY_A) },
        notes: tab(FIFTH_MELODY_A),
        octave: 'exact',
        tempo: 66,
        explain: '{n:A} {n:C}, {n:E} {n:A} {n:G}, {n:F} {n:E} {n:D}, {n:E}: all between frets 5 and 8.',
        alternative: {
          type: 'fill-blanks',
          prompt: 'Read bars 1 to 4 and fill in the missing notes.',
          figure: { kind: 'staff', time: '4/4', notes: staff(FIFTH_MELODY_A) },
          text: '{n:A} ___ | {n:E} {n:A} {n:G} | {n:F} {n:E} ___ | {n:E}',
          blanks: ['{n:C}', '{n:D}'],
          bank: ['{n:B}', '{n:F}'],
          explain: 'Bar 1 is {n:A} and {n:C}, in the second and third spaces; bar 3 steps down {n:F} {n:E} and ends on {n:D}, on the fourth line.',
        },
      },
      { generate: 'staff-note', params: { ask: 'read', low: 'A2', high: 'C5' } },
    ],
  },
};

export default unit;
