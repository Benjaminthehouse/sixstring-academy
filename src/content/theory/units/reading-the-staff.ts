/**
 * Theory Path, unit 13: Reading music: the staff. Written from the syllabus entries in
 * `src/content/plan/theory-path.json` (unit `reading-the-staff`), one lesson per entry, in order:
 * each lesson opens with its "on the guitar" picture, asks the planned exercises, ends with the
 * planned drills, and turns every planned fact into a review card.
 *
 * Data is sounding pitch, as everywhere in the app: a staff figure draws it an octave higher, the
 * way guitar music is written (open string 1 is E4 in the data and sits in the top space).
 * `reading-the-staff.test.ts` checks every staff position, fret, the melody and the listening
 * question against the theory and guitar engines.
 *
 * Staff labels are plain text that the learner's naming setting does not reach, so the staffs
 * here label notes only with numbers and string names; letter names live in captions and text,
 * where `{n:}` tags show them in the learner's own naming.
 *
 * The planned "eight-bar quarter-note melody" is shown whole on a staff; its play steps check two
 * of its two-bar phrases (six notes each), because a longer play step's tab runs off a phone.
 */
import type { Figure, Lesson, StaffNote, TabNote, Unit } from '@/lessons';

const U = 'reading-the-staff';

/** A staff figure of whole notes: one note head per place, with optional labels under them. */
const staff = (notes: Array<string | [note: string, label: string]>, caption?: string): Figure => ({
  kind: 'staff',
  notes: notes.map((n): StaffNote => (typeof n === 'string' ? { note: n, duration: 'w' } : { note: n[0], duration: 'w', label: n[1] })),
  ...(caption ? { caption } : {}),
});

/** One note of the tune: where it is played and the sounding pitch the staff shows. */
type TuneNote = [string: number, fret: number, pitch: string, duration: string];

/**
 * An original eight-bar melody on strings 1 to 3 in first position, natural notes only, moving in
 * quarter notes with half and whole notes to close each two-bar phrase. One array per bar.
 */
export const TUNE_BARS: ReadonlyArray<readonly TuneNote[]> = [
  [[2, 1, 'C4', 'q'], [2, 3, 'D4', 'q'], [1, 0, 'E4', 'q'], [1, 3, 'G4', 'q']],
  [[1, 1, 'F4', 'h'], [1, 0, 'E4', 'h']],
  [[2, 3, 'D4', 'q'], [1, 0, 'E4', 'q'], [1, 1, 'F4', 'q'], [2, 3, 'D4', 'q']],
  [[2, 1, 'C4', 'w']],
  [[3, 0, 'G3', 'q'], [3, 2, 'A3', 'q'], [2, 0, 'B3', 'q'], [2, 1, 'C4', 'q']],
  [[2, 3, 'D4', 'h'], [1, 0, 'E4', 'h']],
  [[1, 1, 'F4', 'q'], [1, 0, 'E4', 'q'], [2, 3, 'D4', 'q'], [2, 0, 'B3', 'q']],
  [[2, 1, 'C4', 'w']],
];
export const TUNE: readonly TuneNote[] = TUNE_BARS.flat();
/**
 * The two phrases the play steps check, six notes each: a play step draws its tab at full width,
 * and longer phrases run off a 360 px phone. Bars 1-2 stay on strings 2 and 1; bars 5-6 start on
 * string 3. Between them they use all eight notes of the lesson.
 */
export const TUNE_OPENING: readonly TuneNote[] = [...TUNE_BARS[0], ...TUNE_BARS[1]];
export const TUNE_LOW: readonly TuneNote[] = [...TUNE_BARS[4], ...TUNE_BARS[5]];
const tab = (notes: readonly TuneNote[]): TabNote[] => notes.map(([string, fret, , duration]) => ({ string, fret, duration }));
/** Where a tune note is played, as an order tile: "String 2, fret 1" or "String 3, open". */
export const placeTile = ([string, fret]: readonly [number, number, ...unknown[]]): string => (fret === 0 ? `String ${string}, open` : `String ${string}, fret ${fret}`);
const tuneStaff = (notes: readonly TuneNote[], caption?: string): Figure => ({
  kind: 'staff',
  time: '4/4',
  notes: notes.map(([, , note, duration]) => ({ note, duration })),
  ...(caption ? { caption } : {}),
});

// ── 1. Five lines, four spaces ────────────────────────────────────────────────────────────────

const theStaff: Lesson = {
  id: 'the-staff',
  title: 'Five lines, four spaces',
  teaches: 'Standard notation writes notes on a staff of five lines and four spaces, and higher notes sit higher.',
  minutes: 2,
  skill: `theory:${U}:the-staff`,
  steps: [
    {
      type: 'card',
      title: 'Five lines',
      body: '{t:standard-notation|Standard notation} writes notes on a {t:staff}: five lines, counted **from the bottom**. A note sits either **on a line**, with the line running through its head, or **in a space** between two lines.',
      figure: staff([['E3', '1'], ['G3', '2'], ['B3', '3'], ['D4', '4'], ['F4', '5']], 'A note on each line, counted from the bottom: lines 1 to 5.'),
    },
    {
      type: 'choice',
      prompt: 'Is this note on a line or in a space?',
      figure: staff(['B3']),
      options: [
        { text: 'On a line', correct: true },
        { text: 'In a space', why: 'A note in a space sits between two lines. Here a line runs right through the note head.' },
      ],
      shuffle: false,
      explain: 'The middle line runs right through its head, so it sits on a line: line 3 of 5.',
      fact: 'staff-line-or-space',
    },
    {
      type: 'card',
      title: 'Four spaces',
      body: 'Between the five lines are **four spaces**, also counted from the bottom. Lines and spaces take turns, and each step up, line to space or space to line, is the next letter of the {t:musical-alphabet|musical alphabet}.',
      figure: staff([['F3', '1'], ['A3', '2'], ['C4', '3'], ['E4', '4']], 'A note in each space, counted from the bottom: spaces 1 to 4.'),
    },
    {
      type: 'true-false',
      statement: 'A staff has four lines and five spaces.',
      answer: false,
      explain: 'It is the other way round: five lines, with four spaces between them.',
      fact: 'staff-lines-and-spaces',
    },
    {
      type: 'choice',
      prompt: 'And this one: on a line or in a space?',
      figure: staff(['A3']),
      options: [
        { text: 'On a line', why: 'No line runs through it: it sits between lines 2 and 3.' },
        { text: 'In a space', correct: true },
      ],
      shuffle: false,
      explain: 'It sits between two lines, in space 2. A line would run through the middle of its head.',
      fact: 'staff-line-or-space',
    },
    {
      type: 'card',
      title: 'Higher on the staff, higher in pitch',
      body: 'The staff is a ladder of {t:pitch}: the higher a note sits, the higher it sounds. Open string 3, {n:G}, is written on line 2. Open string 1, the high {n:E}, sounds higher, so it sits higher: in the top space.',
      figure: staff([['G3', 'String 3'], ['E4', 'String 1']], 'Open string 3 on line 2; open string 1 in the top space.'),
      tip: 'Try it: pluck open string 3, then open string 1. Up on the staff, up in sound.',
    },
    {
      type: 'choice',
      prompt: 'Which note sounds higher?',
      figure: staff([['D4', 'Note 1'], ['A3', 'Note 2']]),
      options: [
        { text: 'Note 1', correct: true },
        { text: 'Note 2', why: 'Note 2 sits lower on the staff, in space 2, so it sounds lower.' },
      ],
      shuffle: false,
      explain: 'Note 1 sits higher on the staff, on line 4, so it sounds higher than note 2 in space 2.',
      fact: 'staff-higher-is-higher',
    },
    {
      type: 'listen-choice',
      prompt: 'Listen to two notes. Which staff shows what you heard?',
      sound: { kind: 'notes', notes: ['E4', 'G3'], tempo: 70 },
      options: [
        { figure: staff(['E4', 'G3']), correct: true },
        { figure: staff(['G3', 'E4']) },
      ],
      explain: 'You heard open string 1, the high {n:E}, then open string 3, {n:G}: high, then low. So the first note sits higher on the staff.',
    },
  ],
  facts: [
    {
      id: 'staff-lines-and-spaces',
      front: 'How many lines and spaces does a staff have?',
      back: 'Five lines and four spaces, both counted from the bottom.',
      ask: {
        type: 'true-false',
        statement: 'A staff has five lines and four spaces.',
        answer: true,
        explain: 'Five lines, with four spaces between them. Both are counted from the bottom.',
      },
    },
    {
      id: 'staff-higher-is-higher',
      front: 'A note sits higher on the staff. Does it sound higher or lower?',
      back: 'Higher. The higher a note sits on the staff, the higher it sounds.',
      ask: {
        type: 'choice',
        prompt: 'Which note sounds higher?',
        figure: staff([['F3', 'Note 1'], ['D4', 'Note 2']]),
        options: [
          { text: 'Note 1', why: 'Note 1 sits low, in space 1, so it sounds lower.' },
          { text: 'Note 2', correct: true },
        ],
        shuffle: false,
        explain: 'Note 2 sits higher on the staff, on line 4, so it sounds higher.',
      },
    },
    { id: 'staff-line-or-space', front: 'Where can a note sit on the staff?', back: 'On a line, with the line running through its head, or in a space between two lines.' },
  ],
};

// ── 2. The treble clef ────────────────────────────────────────────────────────────────────────

const theTrebleClef: Lesson = {
  id: 'the-treble-clef',
  title: 'The treble clef',
  teaches: 'Guitar music uses the treble clef, whose lines are E G B D F and spaces F A C E from the bottom.',
  minutes: 3,
  skill: `theory:${U}:the-treble-clef`,
  steps: [
    {
      type: 'card',
      title: 'The G clef',
      body: 'Guitar music begins each staff with a {t:treble-clef}. It is also called the **G clef**: its curl circles line 2, so a note on line 2 is {n:G}. Every other line and space takes its letter from there, one step at a time.',
      figure: staff(['G3'], 'The clef curls round line 2. A note on that line is {n:G}.'),
    },
    {
      type: 'choice',
      prompt: 'The treble clef is also called the G clef. Why?',
      options: [
        { text: 'Its curl circles the G line, line 2', correct: true },
        { text: 'It is only used for music in G', why: 'The clef is used for music in every key. Its name comes from the line it marks.' },
        { text: 'G is the lowest note it can show', why: 'Notes go below the G line too: down to the bottom line and lower.' },
      ],
      explain: 'The curl of the clef wraps round line 2, the second line from the bottom, and marks it as {n:G}.',
      fact: 'staff-treble-clef-g',
    },
    {
      type: 'card',
      title: 'The lines: E G B D F',
      body: 'From the bottom, the five lines are {n:E} {n:G} {n:B} {n:D} {n:F}. A sentence makes them stick: **E**very **G**ood **B**oy **D**eserves **F**ruit. The {n:G} on line 2 is the one the clef circles.',
      figure: staff(['E3', 'G3', 'B3', 'D4', 'F4'], 'Lines from the bottom: {n:E} {n:G} {n:B} {n:D} {n:F}.'),
    },
    {
      type: 'staff-read',
      prompt: 'Name the note on the middle line.',
      note: 'B3',
      options: ['B', 'D', 'G', 'A'],
      explain: 'Lines from the bottom: {n:E} {n:G} {n:B} {n:D} {n:F}. The middle line, line 3, is {n:B}: Every Good **B**oy.',
    },
    {
      type: 'choice',
      prompt: 'Which sentence gives the lines of the treble staff, from the bottom?',
      options: [
        { text: 'Every Good Boy Deserves Fruit', correct: true },
        { text: 'Good Boys Do Fine Always', why: 'G B D F A are the lines of the bass clef, used for bass guitar and a piano\'s left hand.' },
        { text: 'FACE', why: 'FACE spells the four spaces, not the five lines.' },
      ],
      explain: 'E G B D F: Every Good Boy Deserves Fruit. The spaces in between spell FACE.',
      fact: 'staff-every-good-boy',
    },
    {
      type: 'card',
      title: 'The spaces: F A C E',
      body: 'The four spaces, from the bottom, are {n:F} {n:A} {n:C} {n:E}: they spell **FACE**. Lines and spaces take turns, so reading up the staff runs through the alphabet: {n:E} {n:F} {n:G} {n:A} {n:B} {n:C} {n:D} {n:E} {n:F}.',
      figure: staff(['F3', 'A3', 'C4', 'E4'], 'Spaces from the bottom: {n:F} {n:A} {n:C} {n:E}.'),
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the spaces of the treble staff, from the bottom.',
      text: '{n:F}   ___   {n:C}   ___',
      blanks: ['{n:A}', '{n:E}'],
      bank: ['{n:G}', '{n:D}'],
      explain: 'The spaces spell FACE: {n:F} {n:A} {n:C} {n:E}. {n:G} and {n:D} sit on lines.',
      fact: 'staff-treble-names',
    },
    {
      type: 'staff-place',
      prompt: 'Put {n:F} on the staff. Any octave will do.',
      note: 'F',
      octave: 'any',
      explain: '{n:F} has two homes on the staff: the bottom space (the F of FACE) and the top line (the F of Fruit).',
      fact: 'staff-treble-names',
    },
    {
      type: 'card',
      title: 'Each place is a fret',
      body: 'Every line and space is a place on the guitar. The {n:E} on the bottom line is string 4, fret 2. The {n:F} on the top line is string 1, fret 1. The next lessons fill in the rest, string by string.',
      figure: {
        kind: 'fretboard',
        frets: [0, 4],
        dots: [
          { string: 4, fret: 2, note: 'E3', finger: 2 },
          { string: 1, fret: 1, note: 'F4', finger: 1 },
        ],
        caption: 'Bottom-line {n:E}: string 4, fret 2. Top-line {n:F}: string 1, fret 1.',
      },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each place on the staff with its note.',
      pairs: [
        { left: 'Bottom line', right: '{n:E}' },
        { left: 'Line 2', right: '{n:G}' },
        { left: 'Space 3', right: '{n:C}' },
        { left: 'Top line', right: '{n:F}' },
      ],
      explain: 'Lines from the bottom: E G B D F. Spaces: F A C E. So line 1 is {n:E}, line 2 {n:G}, space 3 {n:C} and line 5 {n:F}.',
      fact: 'staff-treble-names',
    },
    { generate: 'staff-note', params: { ask: 'read' } },
    { generate: 'staff-note', params: { ask: 'place' } },
  ],
  facts: [
    {
      id: 'staff-treble-clef-g',
      front: 'Why is the treble clef also called the G clef?',
      back: 'Its curl circles line 2, the second line from the bottom, which is {n:G}. Guitar music is written in this clef.',
    },
    {
      id: 'staff-treble-names',
      front: 'Name the lines and the spaces of the treble staff, from the bottom.',
      back: 'Lines: {n:E} {n:G} {n:B} {n:D} {n:F}. Spaces: {n:F} {n:A} {n:C} {n:E}.',
      ask: { generate: 'staff-note', params: { ask: 'read' } },
    },
    {
      id: 'staff-every-good-boy',
      front: 'Which sentence helps you remember the lines of the treble staff?',
      back: 'Every Good Boy Deserves Fruit: {n:E} {n:G} {n:B} {n:D} {n:F}, from the bottom.',
    },
  ],
};

// ── 3. Guitar sounds an octave lower ──────────────────────────────────────────────────────────

const anOctaveLower: Lesson = {
  id: 'an-octave-lower',
  title: 'Guitar sounds an octave lower',
  teaches: 'Guitar music is written one octave higher than it sounds, so it fits on the treble staff.',
  minutes: 3,
  skill: `theory:${U}:an-octave-lower`,
  steps: [
    {
      type: 'card',
      title: 'Written high, sounds low',
      body: 'Guitar notes are low. Written at the pitch they sound, most would hang far below the staff on {t:ledger-line|ledger lines}. So guitar music is written **one {t:octave} higher** than it sounds. You read the note as written and play it; the guitar sounds it an octave lower.',
      figure: staff(['C4'], 'Written in space 3: the {n:C} at string 2, fret 1.'),
    },
    {
      type: 'true-false',
      statement: 'A guitar sounds an octave higher than its music is written.',
      answer: false,
      explain: 'The other way round: guitar music is written an octave higher than it sounds, so the guitar sounds an octave below the page.',
      fact: 'staff-written-octave-up',
    },
    {
      type: 'card',
      title: 'Middle C',
      body: 'Press string 2 at fret 1. That {n:C} is written in space 3, but it **sounds** {n:C4}: the {n:C} in the middle of a piano, called {t:middle-c|middle C}. Piano music writes that same sound lower, on a ledger line below the staff.',
      // Seven white keys with middle C in the centre fit a phone; the key names itself in the
      // learner's naming (a plain-text label would not, and "Middle C" overflows one key).
      figure: { kind: 'keyboard', keys: [{ note: 'C4', role: 'root' }], from: 'G3', to: 'F4', caption: 'Middle C, {n:C4}: string 2, fret 1 on the guitar.' },
    },
    {
      type: 'choice',
      prompt: 'Where do you play the {n:C} written in space 3?',
      figure: staff(['C4']),
      options: [
        { text: 'String 2, fret 1', correct: true },
        { text: 'String 5, fret 3', why: 'That {n:C} sounds an octave lower, so it is written lower too: on a ledger line below the staff.' },
        { text: 'String 1, fret 8', why: 'That {n:C} sounds an octave higher, so it is written above the staff.' },
      ],
      explain: 'String 2, fret 1. It is written in space 3 and sounds {n:C4}, middle C.',
      fact: 'staff-third-space-c',
    },
    {
      type: 'staff-read',
      prompt: 'Name the note in space 3.',
      note: 'C4',
      options: ['C', 'A', 'E', 'D'],
      explain: 'Spaces from the bottom: {n:F} {n:A} {n:C} {n:E}. Space 3 is {n:C}: string 2, fret 1, sounding middle C.',
    },
    {
      type: 'play-note',
      prompt: 'Play the {n:C} written in space 3: string 2, fret 1.',
      figure: staff(['C4']),
      note: 'C4',
      octave: 'exact',
      where: { string: 2, fret: 1 },
      explain: 'String 2, fret 1 is {n:C}: written in space 3, sounding middle C, {n:C4}.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap where you play the {n:C} written in space 3.',
        figure: staff(['C4']),
        find: { note: 'C4' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 4],
        explain: 'String 2, fret 1: the {n:C} written in space 3. It sounds middle C.',
      },
    },
    {
      type: 'card',
      title: 'The little 8',
      body: 'Guitar music often prints a small **8** under the treble clef, as on the staffs in this app. It means *sounds an octave lower than written*. Many books print a plain treble clef instead. Read guitar music the same way either way: it always sounds an octave below the page.',
      figure: staff(['E3', 'G3', 'B3', 'D4', 'F4'], 'Look under the clef: the small 8 means an octave lower.'),
    },
    {
      type: 'choice',
      prompt: 'What does a small 8 under the treble clef mean?',
      options: [
        { text: 'It sounds an octave lower than written', correct: true },
        { text: 'Play everything at fret 8', why: 'The 8 is about octaves, not frets.' },
        { text: 'Play every bar eight times', why: 'Repeats have their own signs. This 8 means an octave lower.' },
      ],
      explain: 'The 8 stands for an octave: eight letter names from one {n:C} up to the next, counting both. The music sounds one octave lower than written.',
      fact: 'staff-clef-8',
    },
    {
      type: 'true-false',
      statement: 'Guitar music with a plain treble clef, no 8, sounds exactly where it is written.',
      answer: false,
      explain: 'Guitar music is written an octave higher than it sounds, with or without the little 8. Read it and play it the same way.',
      fact: 'staff-clef-8',
    },
    { generate: 'staff-note', params: { ask: 'read' } },
  ],
  facts: [
    {
      id: 'staff-written-octave-up',
      front: 'Is guitar music written at the pitch the guitar sounds?',
      back: 'No: it is written one octave higher than it sounds, so that it fits on the treble staff.',
    },
    {
      id: 'staff-clef-8',
      front: 'What does a small 8 under the treble clef mean?',
      back: 'The music sounds an octave lower than written. Guitar music with a plain treble clef is read the same way.',
      ask: {
        type: 'true-false',
        statement: 'A treble clef with a small 8 under it means the music sounds an octave lower than written.',
        answer: true,
        explain: 'The 8 shows the octave shift of guitar music. A plain treble clef in guitar music means the same.',
      },
    },
    {
      id: 'staff-third-space-c',
      front: 'Where do you play the {n:C} written in space 3, and what does it sound?',
      back: 'String 2, fret 1, in first position. It sounds {n:C4}, middle C on the piano.',
      ask: {
        type: 'fretboard-find',
        prompt: 'Tap where you play the {n:C} written in space 3.',
        figure: staff(['C4']),
        find: { note: 'C4' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 4],
        explain: 'String 2, fret 1. It is written in space 3 and sounds middle C.',
      },
    },
  ],
};

// ── 4. The open strings on the staff ──────────────────────────────────────────────────────────

const openStringsOnTheStaff: Lesson = {
  id: 'open-strings-on-the-staff',
  title: 'The open strings on the staff',
  teaches: 'Open strings 1 to 4 are written in the top space, on the middle line, on line 2 and just below the staff.',
  minutes: 3,
  skill: `theory:${U}:open-strings-on-the-staff`,
  steps: [
    {
      type: 'card',
      title: 'Four open strings, written',
      body: 'Open strings 4, 3, 2 and 1 are {n:D} {n:G} {n:B} {n:E}. On the staff, {n:D} sits in the space **just below** the bottom line, {n:G} on **line 2**, {n:B} on the **middle line** and the high {n:E} in the **top space**.',
      figure: staff([['D3', '4'], ['G3', '3'], ['B3', '2'], ['E4', '1']], 'Open strings 4, 3, 2 and 1 as written. The numbers are strings.'),
    },
    {
      type: 'match-pairs',
      prompt: 'Match each place on the staff with its open string.',
      pairs: [
        { left: 'Top space', right: 'String 1' },
        { left: 'Middle line', right: 'String 2' },
        { left: 'Line 2', right: 'String 3' },
        { left: 'Space below the staff', right: 'String 4' },
      ],
      explain: 'Open strings 1, 2, 3 and 4 are written in the top space, on the middle line, on line 2 and in the space below the staff.',
    },
    {
      type: 'staff-read',
      prompt: 'Name the note written on line 2.',
      note: 'G3',
      options: ['G', 'B', 'E', 'F'],
      explain: 'Lines from the bottom: {n:E} {n:G} {n:B} {n:D} {n:F}. Line 2 is {n:G}: open string 3.',
      fact: 'staff-open-2-3',
    },
    {
      type: 'card',
      title: 'Hear them climb',
      body: 'Play open strings 4, 3, 2 and 1, or listen. Each string sounds higher than the last, and each is written higher: below the staff, line 2, the middle line, the top space.',
      figure: { kind: 'audio', sound: { kind: 'notes', notes: ['D3', 'G3', 'B3', 'E4'], tempo: 70 }, label: 'Open strings 4 to 1' },
      tip: 'String 4 is the open {n:D}: the third string counted from the thick side.',
    },
    {
      type: 'choice',
      prompt: 'Which open string is written here?',
      figure: staff(['B3']),
      options: [
        { text: 'String 2, {n:B}', correct: true },
        { text: 'String 3, {n:G}', why: 'Open string 3 is {n:G}, one line lower: line 2.' },
        { text: 'String 1, {n:E}', why: 'Open string 1 is the high {n:E}, in the top space.' },
        { text: 'String 4, {n:D}', why: 'Open string 4 is {n:D}, in the space below the staff.' },
      ],
      explain: 'A note on the middle line is {n:B}: open string 2.',
      fact: 'staff-open-2-3',
    },
    {
      type: 'play-note',
      prompt: 'Read this note. It is an open string: play it.',
      figure: staff(['G3']),
      note: 'G3',
      octave: 'exact',
      explain: 'Line 2 is {n:G}: open string 3.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Read this note. It is an open string: tap it.',
        figure: staff(['G3']),
        find: { note: 'G3' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 4],
        explain: 'Line 2 is {n:G}, written for open string 3.',
      },
    },
    {
      type: 'true-false',
      statement: 'Open string 4, {n:D}, is written on the bottom line of the staff.',
      answer: false,
      explain: 'The bottom line is {n:E}: string 4 at fret 2. The open {n:D} sits one step lower, in the space just below the staff.',
      fact: 'staff-open-4',
    },
    {
      type: 'choice',
      prompt: 'Where is open string 1, the high {n:E}, written?',
      options: [
        { text: 'In the top space', correct: true },
        { text: 'On the top line', why: 'The top line is {n:F}: string 1, fret 1.' },
        { text: 'On the bottom line', why: 'That {n:E} sounds an octave lower: string 4, fret 2.' },
        { text: 'Below the staff', why: 'Below the staff are lower notes, like the open {n:D}.' },
      ],
      explain: 'The top space is {n:E}, the last letter of FACE: open string 1.',
      fact: 'staff-open-1',
    },
    { generate: 'staff-note', params: { ask: 'read', low: 'D3', high: 'F4' } },
  ],
  facts: [
    { id: 'staff-open-1', front: 'Where is open string 1, the high {n:E}, written on the staff?', back: 'In the top space of the staff.' },
    {
      id: 'staff-open-2-3',
      front: 'Where are open strings 2 and 3 written on the staff?',
      back: 'Open string 2, {n:B}, on the middle line. Open string 3, {n:G}, on line 2, the second line from the bottom.',
    },
    {
      id: 'staff-open-4',
      front: 'Where is open string 4, {n:D}, written on the staff?',
      back: 'In the space just below the bottom line.',
      ask: {
        type: 'choice',
        prompt: 'Which open string is written here?',
        figure: staff(['D3']),
        options: [
          { text: 'String 4, {n:D}', correct: true },
          { text: 'String 3, {n:G}', why: 'Open string 3 is {n:G}, on line 2.' },
          { text: 'String 6, {n:E}', why: 'The open low {n:E} is written much lower, below three ledger lines.' },
        ],
        explain: 'The space just below the bottom line is {n:D}: open string 4.',
      },
    },
  ],
};

// ── 5. Ledger lines and the low strings ───────────────────────────────────────────────────────

const ledgerLines: Lesson = {
  id: 'ledger-lines',
  title: 'Ledger lines and the low strings',
  teaches: 'Ledger lines extend the staff; the low open strings A and E are written two and three ledger lines below it.',
  minutes: 3,
  skill: `theory:${U}:ledger-lines`,
  steps: [
    {
      type: 'card',
      title: 'Lines below the staff',
      body: 'Some notes are too low or too high for the staff. Short {t:ledger-line|ledger lines} extend it, below or above, just for the notes that need them. The {n:C} on **one** ledger line below is string 5, fret 3. Open string 5, {n:A}, sits on the **second**. The open low {n:E}, string 6, hangs **below the third**.',
      figure: staff(['C3', 'A2', 'E2'], 'One, two and three ledger lines: string 5 fret 3, open 5, open 6.'),
    },
    {
      type: 'staff-read',
      prompt: 'Name the note on the second ledger line below the staff.',
      note: 'A2',
      options: ['A', 'C', 'E', 'G'],
      explain: 'Two ledger lines down is {n:A}: open string 5. Count down from {n:C} on the first: {n:C}, {n:B}, {n:A}.',
      fact: 'staff-open-5',
    },
    {
      type: 'card',
      title: 'Keep counting down',
      body: 'Ledger lines and the spaces between them carry on the alphabet. Down from the {n:D} under the staff: {n:C} on the first ledger line, {n:B} below it, {n:A} on the second, {n:G} below it, {n:F} on the third, and {n:E} below that.',
      figure: { kind: 'staff', notes: ['D3', 'C3', 'B2', 'A2', 'G2', 'F2', 'E2'], caption: 'From {n:D} down to the low {n:E}: space, line, space, line.' },
    },
    {
      type: 'staff-place',
      prompt: 'Put the note for open string 6 on the staff, where guitar music writes it.',
      note: 'E2',
      octave: 'exact',
      explain: 'Open string 6 is the low {n:E}. It hangs just below the third ledger line under the staff.',
      fact: 'staff-open-6',
    },
    {
      type: 'choice',
      prompt: 'Where do you play the {n:C} on one ledger line below the staff?',
      figure: staff(['C3']),
      options: [
        { text: 'String 5, fret 3', correct: true },
        { text: 'String 2, fret 1', why: 'That {n:C} sounds an octave higher, so it is written in space 3.' },
        { text: 'Open string 5', why: 'Open string 5 is {n:A}, one ledger line further down.' },
      ],
      explain: 'String 5, fret 3. It sounds {n:C3}, an octave below middle C.',
      fact: 'staff-ledger-c',
    },
    {
      type: 'true-false',
      statement: 'Ledger lines are short extra lines that extend the staff above or below.',
      answer: true,
      explain: 'A ledger line is drawn just for the note that needs it, as if the staff went on for one more line.',
      fact: 'staff-ledger-lines',
    },
    {
      type: 'play-note',
      prompt: 'Read this note. It is an open string: play it.',
      figure: staff(['A2']),
      note: 'A2',
      octave: 'exact',
      explain: 'Two ledger lines below the staff is {n:A}: open string 5.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Read this note. It is an open string: tap it.',
        figure: staff(['A2']),
        find: { note: 'A2' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 4],
        explain: 'Two ledger lines below the staff is {n:A}: open string 5.',
      },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each written place with what you play.',
      pairs: [
        { left: 'Space below the staff', right: 'Open string 4' },
        { left: 'First ledger line', right: 'String 5, fret 3' },
        { left: 'Second ledger line', right: 'Open string 5' },
        { left: 'Below third ledger line', right: 'Open string 6' },
      ],
      explain: 'Going down: open {n:D} just below the staff, {n:C} on the first ledger line, open {n:A} on the second, open low {n:E} under the third.',
    },
    { generate: 'staff-note', params: { ask: 'read', low: 'E2', high: 'G3' } },
  ],
  facts: [
    {
      id: 'staff-ledger-lines',
      front: 'What are ledger lines?',
      back: 'Short extra lines that extend the staff above or below, for notes too high or too low for it.',
    },
    {
      id: 'staff-open-5',
      front: 'Where is open string 5, {n:A}, written?',
      back: 'On the second ledger line below the staff.',
      ask: {
        type: 'choice',
        prompt: 'Which open string is written here?',
        figure: staff(['A2']),
        options: [
          { text: 'String 5, {n:A}', correct: true },
          { text: 'String 6, {n:E}', why: 'The low {n:E} hangs lower still, below the third ledger line.' },
          { text: 'String 4, {n:D}', why: 'Open string 4 sits just below the staff, with no ledger line.' },
        ],
        explain: 'The second ledger line below the staff is {n:A}: open string 5.',
      },
    },
    {
      id: 'staff-open-6',
      front: 'Where is open string 6, the low {n:E}, written?',
      back: 'Just below the third ledger line under the staff.',
      ask: {
        type: 'staff-place',
        prompt: 'Put the note for open string 6 on the staff, where guitar music writes it.',
        note: 'E2',
        octave: 'exact',
        explain: 'The low {n:E} hangs just below the third ledger line under the staff.',
      },
    },
    {
      id: 'staff-ledger-c',
      front: 'Where do you play the {n:C} written on one ledger line below the staff?',
      back: 'String 5, fret 3, in first position. It sounds {n:C3}, an octave below middle C.',
    },
  ],
};

// ── 6. Reading on strings 1 to 3 ──────────────────────────────────────────────────────────────

const readingStrings1To3: Lesson = {
  id: 'reading-strings-1-to-3',
  title: 'Reading on strings 1 to 3',
  teaches: 'First-position naturals on strings 1 to 3: G A on string 3, B C D on string 2, E F G on string 1.',
  minutes: 4,
  skill: `theory:${U}:reading-strings-1-to-3`,
  steps: [
    {
      type: 'card',
      title: 'First position',
      body: 'In {t:position|first position} your hand sits by the nut and each finger takes one fret: finger 1 on fret 1, finger 2 on fret 2, up to finger 4 on fret 4. The finger number matches the fret. On strings 1 to 3 that gives eight natural notes.',
      figure: {
        kind: 'fretboard',
        frets: [0, 4],
        dots: [
          { string: 3, fret: 0, note: 'G3' }, { string: 3, fret: 2, note: 'A3', finger: 2 },
          { string: 2, fret: 0, note: 'B3' }, { string: 2, fret: 1, note: 'C4', finger: 1 }, { string: 2, fret: 3, note: 'D4', finger: 3 },
          { string: 1, fret: 0, note: 'E4' }, { string: 1, fret: 1, note: 'F4', finger: 1 }, { string: 1, fret: 3, note: 'G4', finger: 3 },
        ],
        caption: 'Strings 3 to 1: {n:G} {n:A}, {n:B} {n:C} {n:D}, {n:E} {n:F} {n:G}.',
      },
    },
    {
      type: 'card',
      title: 'The same notes on the staff',
      body: 'Those eight notes climb the staff from line 2 to just above the top line. String 3: {n:G} open, {n:A} fret 2. String 2: {n:B} open, {n:C} fret 1, {n:D} fret 3. String 1: {n:E} open, {n:F} fret 1, {n:G} fret 3.',
      figure: { kind: 'staff', notes: ['G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4'], caption: '{n:G} on line 2 up to {n:G} just above the top line.' },
    },
    {
      type: 'staff-read',
      prompt: 'Name the note on line 4.',
      note: 'D4',
      options: ['D', 'B', 'F', 'C'],
      explain: 'Lines from the bottom: E G B D F. Line 4 is {n:D}: string 2, fret 3, played with finger 3.',
    },
    {
      type: 'fretboard-find',
      prompt: 'This {n:F} is on the top line. Tap where you play it in first position.',
      figure: staff(['F4']),
      find: { note: 'F4' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 4],
      strings: [1, 2, 3],
      explain: 'String 1, fret 1, with finger 1. The {n:F} in the bottom space is an octave lower: string 4, fret 3.',
      fact: 'staff-first-position-naturals',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap where the {n:D} on line 4 is played in first position.',
      figure: staff(['D4']),
      find: { note: 'D4' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 4],
      strings: [1, 2, 3],
      explain: 'String 2, fret 3, with finger 3: three frets above the open {n:B}.',
      fact: 'staff-first-position-naturals',
    },
    {
      type: 'choice',
      prompt: 'Which finger plays {n:C} on string 2, fret 1?',
      options: [
        { text: 'Finger 1', correct: true },
        { text: 'Finger 2', why: 'Finger 2 is for fret 2, like the {n:A} on string 3.' },
        { text: 'Finger 3', why: 'Finger 3 is for fret 3, like the {n:D} on string 2.' },
        { text: 'Finger 4', why: 'Finger 4 is for fret 4. None of these eight notes needs it.' },
      ],
      shuffle: false,
      explain: 'In first position the finger matches the fret: fret 1, finger 1.',
      fact: 'staff-finger-matches-fret',
    },
    {
      type: 'true-false',
      statement: 'In first position, finger 3 plays the notes at fret 3.',
      answer: true,
      explain: 'One finger per fret: finger 3 plays fret 3, such as {n:D} on string 2 and {n:G} on string 1.',
      fact: 'staff-one-finger-per-fret',
    },
    {
      type: 'card',
      title: 'A tune to read',
      body: 'Here is a tune written for this lesson, eight bars long, using only these eight notes. Read it slowly: name each note, find its fret, then play it, counting four beats in every bar. Next, play two of its phrases for the app.',
      figure: tuneStaff(TUNE, 'Count 1 2 3 4 in every bar. Each two bars make a phrase.'),
    },
    {
      type: 'play-phrase',
      prompt: 'Read bars 1 and 2 and play them. Take it slowly.',
      figure: tuneStaff(TUNE_OPENING),
      notes: tab(TUNE_OPENING),
      octave: 'exact',
      tempo: 70,
      explain: 'Up {n:C} {n:D} {n:E} to {n:G}, then {n:F} and {n:E} as half notes: string 2 at frets 1 and 3, then string 1.',
      alternative: {
        type: 'fill-blanks',
        prompt: 'Read bar 1 and fill in the missing notes.',
        figure: tuneStaff(TUNE_BARS[0]),
        text: '{n:C}   ___   {n:E}   ___',
        blanks: ['{n:D}', '{n:G}'],
        bank: ['{n:F}', '{n:B}'],
        explain: 'Bar 1 climbs {n:C} (space 3), {n:D} (line 4), {n:E} (space 4), then {n:G}, just above the top line.',
      },
    },
    {
      type: 'play-phrase',
      prompt: 'Now bars 5 and 6. They start low, on string 3.',
      figure: tuneStaff(TUNE_LOW),
      notes: tab(TUNE_LOW),
      octave: 'exact',
      tempo: 70,
      explain: 'Up step by step from the open {n:G}: {n:A} at string 3 fret 2, then {n:B} {n:C} {n:D} on string 2, and {n:E}, open string 1.',
      alternative: {
        type: 'order',
        prompt: 'Read bars 5 and 6 and put the places you play in order.',
        figure: tuneStaff(TUNE_LOW),
        tiles: TUNE_LOW.map(placeTile),
        distractors: [placeTile([1, 3])],
        explain: 'Step by step up from line 2: {n:G} open string 3, {n:A} string 3 fret 2, {n:B} open string 2, {n:C} fret 1, {n:D} fret 3, then {n:E}, open string 1. The {n:G} at string 1 fret 3 is an octave higher.',
      },
    },
    { generate: 'staff-note', params: { ask: 'read', low: 'G3', high: 'G4' } },
    { generate: 'play-note', params: { strings: [3, 2, 1], frets: [0, 3], naturals: true } },
  ],
  facts: [
    {
      id: 'staff-one-finger-per-fret',
      front: 'In first position, which finger plays which fret?',
      back: 'One finger per fret: finger 1 on fret 1, finger 2 on fret 2, finger 3 on fret 3, finger 4 on fret 4.',
    },
    {
      id: 'staff-first-position-naturals',
      front: 'Name the first-position natural notes on strings 3, 2 and 1.',
      back: 'String 3: {n:G} open, {n:A} fret 2. String 2: {n:B} open, {n:C} fret 1, {n:D} fret 3. String 1: {n:E} open, {n:F} fret 1, {n:G} fret 3.',
      ask: {
        type: 'fretboard-find',
        prompt: 'Tap where you play this note in first position.',
        figure: staff(['A3']),
        find: { note: 'A3' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 4],
        strings: [1, 2, 3],
        explain: 'The {n:A} in space 2 is string 3, fret 2, with finger 2.',
      },
    },
    {
      id: 'staff-finger-matches-fret',
      front: 'In first position, which finger plays {n:C} on string 2, fret 1?',
      back: 'Finger 1: in first position the finger number matches the fret number.',
    },
  ],
};

/** Unit 13 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'Reading music: the staff',
  theme: 'reading',
  description: 'The staff, the treble clef, how guitar music is written an octave up, the open strings on the staff, and first reading on strings 1 to 3.',
  lessons: [theStaff, theTrebleClef, anOctaveLower, openStringsOnTheStaff, ledgerLines, readingStrings1To3],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      {
        type: 'true-false',
        statement: 'A staff has five lines and four spaces.',
        answer: true,
        explain: 'Five lines with four spaces between them, both counted from the bottom.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Complete the lines of the treble staff, from the bottom.',
        text: '{n:E}   ___   {n:B}   ___   {n:F}',
        blanks: ['{n:G}', '{n:D}'],
        bank: ['{n:A}', '{n:C}'],
        explain: 'Every Good Boy Deserves Fruit: {n:E} {n:G} {n:B} {n:D} {n:F}. {n:A} and {n:C} are spaces.',
      },
      {
        type: 'staff-read',
        prompt: 'Which note is this?',
        note: 'C4',
        options: ['C', 'A', 'E', 'B'],
        explain: 'Space 3 is {n:C}: the C of FACE.',
      },
      {
        type: 'true-false',
        statement: 'Guitar music sounds one octave lower than it is written.',
        answer: true,
        explain: 'Guitar music is written an octave higher than it sounds, so it fits on the treble staff.',
      },
      {
        type: 'match-pairs',
        prompt: 'Match each written place with its open string.',
        pairs: [
          { left: 'Below third ledger line', right: 'String 6' },
          { left: 'Second ledger line', right: 'String 5' },
          { left: 'Space below the staff', right: 'String 4' },
          { left: 'Line 2', right: 'String 3' },
          { left: 'Middle line', right: 'String 2' },
          { left: 'Top space', right: 'String 1' },
        ],
        explain: 'From low to high: {n:E} below three ledger lines, {n:A} on the second, {n:D} below the staff, {n:G} on line 2, {n:B} on the middle line, {n:E} in the top space.',
      },
      {
        type: 'staff-place',
        prompt: 'Put the note for open string 5 on the staff, where guitar music writes it.',
        note: 'A2',
        octave: 'exact',
        explain: 'Open string 5, {n:A}, sits on the second ledger line below the staff.',
      },
      {
        type: 'staff-read',
        prompt: 'Which note is this?',
        note: 'E2',
        options: ['E', 'F', 'G', 'D'],
        explain: 'Below the third ledger line under the staff is the low {n:E}: open string 6.',
      },
      {
        type: 'fretboard-find',
        prompt: 'Tap where you play this note in first position.',
        figure: staff(['F4']),
        find: { note: 'F4' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 4],
        strings: [1, 2, 3],
        explain: 'The {n:F} on the top line is string 1, fret 1, with finger 1.',
      },
      {
        type: 'fretboard-find',
        prompt: 'Tap where you play this note in first position.',
        figure: staff(['C4']),
        find: { note: 'C4' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 4],
        strings: [1, 2, 3],
        explain: 'The {n:C} in space 3 is string 2, fret 1. It sounds middle C.',
      },
      {
        type: 'choice',
        prompt: 'Where do you play the {n:G} written on line 2?',
        figure: staff(['G3']),
        options: [
          { text: 'Open string 3', correct: true },
          { text: 'String 1, fret 3', why: 'That {n:G} is an octave higher, written just above the top line.' },
          { text: 'String 6, fret 3', why: 'That {n:G} is an octave lower, written below the staff on ledger lines.' },
        ],
        explain: 'Line 2 is {n:G}: open string 3.',
      },
      {
        type: 'choice',
        prompt: 'Which notes does this bar play?',
        figure: tuneStaff(TUNE_BARS[4]),
        options: [
          { text: '{n:G} {n:A} {n:B} {n:C}', correct: true },
          { text: '{n:F} {n:G} {n:A} {n:B}', why: 'That reads every note one line or space too low. The first note is on line 2: {n:G}.' },
          { text: '{n:A} {n:B} {n:C} {n:D}', why: 'That reads every note one line or space too high. The first note is on line 2: {n:G}.' },
        ],
        explain: 'Line 2 {n:G}, space 2 {n:A}, the middle line {n:B}, space 3 {n:C}: one step up each time.',
      },
      {
        type: 'order',
        prompt: 'Read this bar and put the places you play in order.',
        figure: tuneStaff(TUNE_BARS[0]),
        tiles: TUNE_BARS[0].map(placeTile),
        explain: 'The bar is {n:C} {n:D} {n:E} {n:G}: string 2 at frets 1 and 3, then string 1 open and at fret 3.',
      },
      { generate: 'staff-note', params: { ask: 'read', low: 'E2', high: 'G4' } },
    ],
  },
};

export default unit;
