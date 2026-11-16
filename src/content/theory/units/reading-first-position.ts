/**
 * Theory Path, unit 23: Reading in first position. Written from the syllabus entries in
 * `src/content/plan/theory-path.json` (unit `reading-first-position`), one lesson per entry, in
 * order: each lesson opens with its "on the guitar" picture, asks the planned exercises, ends with
 * the planned drills, and turns every planned fact into a review card.
 *
 * Data is sounding pitch, as everywhere in the app: the staff figures draw it an octave higher, the
 * way guitar music is written. `reading-first-position.test.ts` checks every staff position, fret,
 * melody and listening question against the theory and guitar engines.
 *
 * Two planned pictures cannot be drawn by the staff figure, which has no repeat signs, endings,
 * dynamics or articulation marks: "Repeats and road signs" and "Dynamics and articulation" teach
 * those signs in words and with chord boxes, staff phrases and (for staccato and tenuto) sound.
 * The staff figure does bar its notes when given a time signature, and then draws accidentals the
 * way a printed page does (a sharp lasts to the bar line), which "Accidentals last until the bar
 * line" relies on.
 */
import type { Lesson, StaffNote, TabNote, Unit } from '@/lessons';

const U = 'reading-first-position';

/** One note of a phrase: where it is played and the sounding pitch the staff shows. */
type Note = [string: number, fret: number, pitch: string, duration: string];
const tab = (notes: Note[]): TabNote[] => notes.map(([string, fret, , duration]) => ({ string, fret, duration }));
const staff = (notes: Note[]): StaffNote[] => notes.map(([, , note, duration]) => ({ note, duration }));

/**
 * An original eight-bar melody on strings 4 to 6 in first position (A natural minor), played in
 * two four-bar halves of six notes. A play step draws its tab at full width, so phrases stay at six
 * notes or fewer to fit a 360 px phone.
 */
const MELODY: Note[] = [
  [5, 0, 'A2', 'h'], [5, 2, 'B2', 'h'],
  [5, 3, 'C3', 'w'],
  [5, 2, 'B2', 'h'], [6, 3, 'G2', 'h'],
  [5, 0, 'A2', 'w'],
  [4, 2, 'E3', 'h'], [4, 0, 'D3', 'h'],
  [5, 3, 'C3', 'w'],
  [6, 1, 'F2', 'h'], [6, 0, 'E2', 'h'],
  [5, 0, 'A2', 'w'],
];
const MELODY_FIRST = MELODY.slice(0, 6);
const MELODY_LAST = MELODY.slice(6);

/** Two original bars on strings 1 to 3, frets 0 to 3: a dotted quarter, beamed eighths, half notes. */
const TWO_BARS: Note[] = [
  [3, 0, 'G3', 'q.'], [3, 2, 'A3', 'e'], [2, 0, 'B3', 'h'],
  [2, 1, 'C4', 'e'], [2, 3, 'D4', 'e'], [1, 0, 'E4', 'h.'],
];
const TWO_BARS_RHYTHM = 'q. e h | e e h.';

/** The two sections of the road-map example in G major, played A, A again, B (the opening card). */
const SECTION_A = ['G', 'C', 'D', 'G'];
const SECTION_B = ['C', 'G', 'D', 'G'];

/**
 * A four-bar phrase on strings 1 and 2 (frets 0 to 3), for dynamics. Its first two bars are the
 * opening of the traditional "Mary Had a Little Lamb" (public domain); bars 3 and 4 are new.
 */
const PHRASE: Note[] = [
  [1, 0, 'E4', 'q'], [2, 3, 'D4', 'q'], [2, 1, 'C4', 'q'], [2, 3, 'D4', 'q'],
  [1, 0, 'E4', 'q'], [1, 0, 'E4', 'q'], [1, 0, 'E4', 'h'],
  [1, 1, 'F4', 'q'], [1, 3, 'G4', 'q'], [1, 1, 'F4', 'q'], [1, 0, 'E4', 'q'],
  [2, 3, 'D4', 'q'], [2, 0, 'B3', 'q'], [2, 1, 'C4', 'h'],
];

const strings4To6: Lesson = {
  id: 'strings-4-to-6',
  title: 'Reading on strings 4 to 6',
  teaches: 'In first position the naturals on strings 4 to 6 are D E F, A B C and E F G, written on and below the staff.',
  minutes: 4,
  skill: `theory:${U}:strings-4-to-6`,
  steps: [
    {
      type: 'card',
      title: 'Down to the low E',
      body: 'On strings 4 to 6, {t:position|first position} gives nine natural notes. Guitar music is written an octave higher than it sounds, so they sit low: on the bottom of the staff and below it, on {t:ledger-line|ledger lines}. The open low {n:E} hangs below the third ledger line.',
      figure: {
        kind: 'staff',
        notes: ['E2', 'F2', 'G2', 'A2', 'B2', 'C3', 'D3', 'E3', 'F3'],
        caption: '{n:E} {n:F} {n:G} {n:A} {n:B} {n:C} {n:D} {n:E} {n:F}: open low {n:E} up to string 4, fret 3.',
      },
    },
    {
      type: 'card',
      title: 'Where each one is played',
      body: 'String 6: {n:E} open, {n:F} fret 1, {n:G} fret 3. String 5: {n:A} open, {n:B} fret 2, {n:C} fret 3. String 4: {n:D} open, {n:E} fret 2, {n:F} fret 3. Each string adds three notes, and they climb in order: {n:E} {n:F} {n:G} {n:A} {n:B} {n:C} {n:D} {n:E} {n:F}.',
      figure: {
        kind: 'fretboard',
        frets: [0, 3],
        dots: [
          { string: 6, fret: 0, note: 'E2' }, { string: 6, fret: 1, note: 'F2', finger: 1 }, { string: 6, fret: 3, note: 'G2', finger: 3 },
          { string: 5, fret: 0, note: 'A2' }, { string: 5, fret: 2, note: 'B2', finger: 2 }, { string: 5, fret: 3, note: 'C3', finger: 3 },
          { string: 4, fret: 0, note: 'D3' }, { string: 4, fret: 2, note: 'E3', finger: 2 }, { string: 4, fret: 3, note: 'F3', finger: 3 },
        ],
        caption: 'Strings 6 to 4 in first position: one finger per fret.',
      },
      tip: 'One finger per fret: index on fret 1, middle on fret 2, ring on fret 3. The hand stays put.',
    },
    {
      type: 'staff-read',
      prompt: 'Which note is this? It sits on the first ledger line below the staff.',
      note: 'C3',
      options: ['C', 'A', 'E', 'B'],
      explain: '{n:C} sits on the first ledger line below the staff. In first position it is string 5, fret 3.',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap where this written {n:C}, on the first ledger line below the staff, is played in first position.',
      figure: { kind: 'staff', notes: [{ note: 'C3', duration: 'w' }] },
      find: { note: 'C3' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 4],
      explain: 'String 5, fret 3. The {n:C} in the third space of the staff is an octave higher: string 2, fret 1.',
      fact: 'first-position-low-naturals',
    },
    {
      type: 'staff-place',
      prompt: 'Put the note for string 6, fret 3 on the staff. It sounds low, so it goes below the staff.',
      note: 'G2',
      octave: 'exact',
      hint: 'String 6, fret 3 is {n:G}. Count down from the {n:C} on the first ledger line: {n:B}, {n:A}, {n:G}.',
      explain: 'String 6, fret 3 is {n:G}. It hangs from the second ledger line below the staff, just above the {n:F} on the third ledger line.',
      fact: 'first-position-low-ledger',
    },
    {
      type: 'choice',
      prompt: 'This {n:E} is on the bottom line of the staff. Where is it played in first position?',
      figure: { kind: 'staff', notes: [{ note: 'E3', duration: 'w' }] },
      options: [
        { text: 'String 4, fret 2', correct: true },
        { text: 'String 6, open', why: 'The open low {n:E} is written an octave lower, below the third ledger line.' },
        { text: 'String 1, open', why: 'The open high {n:E} is written in the top space of the staff.' },
        { text: 'String 5, fret 2', why: 'String 5, fret 2 is {n:B}, written just below the first ledger line.' },
      ],
      explain: 'The {n:E} on the bottom line is string 4, fret 2. The {n:F} in the bottom space is the next fret up: string 4, fret 3.',
      fact: 'first-position-bottom-line',
    },
    {
      type: 'choice',
      prompt: 'This {n:F} is on the third ledger line below the staff. Where is it played?',
      figure: { kind: 'staff', notes: [{ note: 'F2', duration: 'w' }] },
      options: [
        { text: 'String 6, fret 1', correct: true },
        { text: 'String 4, fret 3', why: 'That {n:F} is an octave higher, in the bottom space of the staff.' },
        { text: 'String 6, fret 3', why: 'That is {n:G}, one step higher, hanging from the second ledger line.' },
        { text: 'String 1, fret 1', why: 'That {n:F} is two octaves higher, on the top line.' },
      ],
      explain: 'The {n:F} on the third ledger line is string 6, fret 1: one fret above the open low {n:E}, which hangs just below that line.',
      fact: 'first-position-low-ledger',
    },
    {
      type: 'card',
      title: 'Read a melody',
      body: 'Here is an original eight-bar melody on strings 4 to 6. Name the notes first, then find each one on the neck. Count four beats in every bar: two half notes, or one whole note held for all four.',
      figure: { kind: 'staff', time: '4/4', notes: staff(MELODY), caption: 'Eight bars on strings 4 to 6, in {k:A minor}.' },
    },
    {
      type: 'play-phrase',
      prompt: 'Play the first four bars from the staff, slowly. The tab under it is there to check yourself.',
      figure: { kind: 'staff', time: '4/4', notes: staff(MELODY_FIRST) },
      notes: tab(MELODY_FIRST),
      octave: 'exact',
      tempo: 72,
      explain: 'String 5: open {n:A}, {n:B} at fret 2, {n:C} at fret 3 held for a whole bar. Back to {n:B}, down to {n:G} at string 6, fret 3, and home to {n:A}.',
      alternative: {
        type: 'order',
        prompt: 'Read the first four bars and put their notes in order.',
        figure: { kind: 'staff', time: '4/4', notes: staff(MELODY_FIRST) },
        tiles: ['{n:A}', '{n:B}', '{n:C}', '{n:B}', '{n:G}', '{n:A}'],
        distractors: ['{n:E}'],
        explain: '{n:A} {n:B}, then {n:C} on the first ledger line, {n:B} again, {n:G} hanging from the second ledger line, and {n:A}.',
      },
    },
    {
      type: 'play-phrase',
      prompt: 'Now the last four bars. Read them first, then play.',
      figure: { kind: 'staff', time: '4/4', notes: staff(MELODY_LAST) },
      notes: tab(MELODY_LAST),
      octave: 'exact',
      tempo: 72,
      explain: '{n:E} at string 4, fret 2, the open {n:D} string, {n:C} at string 5, fret 3; then {n:F} and {n:E} on string 6 before the melody lands on the open {n:A}.',
      alternative: {
        type: 'order',
        prompt: 'Read the last four bars and put their notes in order.',
        figure: { kind: 'staff', time: '4/4', notes: staff(MELODY_LAST) },
        tiles: ['{n:E}', '{n:D}', '{n:C}', '{n:F}', '{n:E}', '{n:A}'],
        distractors: ['{n:G}'],
        explain: '{n:E} on the bottom line, {n:D} just below it, {n:C} on the first ledger line, then {n:F} and {n:E} at the third ledger line, and {n:A}.',
      },
    },
    { generate: 'staff-note', params: { ask: 'read', low: 'E2', high: 'F3' } },
    { generate: 'play-note', params: { strings: [6, 5, 4], frets: [0, 3], naturals: true } },
  ],
  facts: [
    {
      id: 'first-position-low-naturals',
      front: 'Name the first-position natural notes on strings 4, 5 and 6, with their frets.',
      back: 'String 4: {n:D} (open), {n:E} (2), {n:F} (3). String 5: {n:A} (open), {n:B} (2), {n:C} (3). String 6: {n:E} (open), {n:F} (1), {n:G} (3).',
    },
    {
      id: 'first-position-bottom-line',
      front: 'Where are the written {n:E} on the bottom line and the {n:F} in the bottom space played?',
      back: 'The {n:E} on the bottom line is string 4, fret 2; the {n:F} in the bottom space is string 4, fret 3.',
      ask: {
        type: 'choice',
        prompt: 'This {n:F} is in the bottom space of the staff. Where is it played in first position?',
        figure: { kind: 'staff', notes: [{ note: 'F3', duration: 'w' }] },
        options: [
          { text: 'String 4, fret 3', correct: true },
          { text: 'String 6, fret 1', why: 'That {n:F} is an octave lower, on the third ledger line below the staff.' },
          { text: 'String 1, fret 1', why: 'That {n:F} is two octaves higher, on the top line.' },
        ],
        explain: 'The {n:F} in the bottom space is string 4, fret 3, one fret above the {n:E} on the bottom line.',
      },
    },
    {
      id: 'first-position-low-ledger',
      front: 'Where are the written {n:F} on the third ledger line below the staff and the {n:G} just above it played?',
      back: 'The {n:F} on the third ledger line is string 6, fret 1; the {n:G} just above it, hanging from the second ledger line, is string 6, fret 3.',
    },
  ],
};

const accidentalsInABar: Lesson = {
  id: 'accidentals-in-a-bar',
  title: 'Accidentals last until the bar line',
  teaches: 'An accidental lasts to the end of its bar on that line or space, and a natural sign cancels it.',
  minutes: 3,
  skill: `theory:${U}:accidentals-in-a-bar`,
  steps: [
    {
      type: 'card',
      title: 'A sharp lasts the whole bar',
      body: 'A sharp or flat written before a note lasts until the next bar line. In bar 1 the second note in the bottom space has no sign, but it is still {n:F#}. The bar line wipes the slate clean: in bar 2 that note is plain {n:F} again.',
      figure: {
        kind: 'staff',
        time: '4/4',
        notes: [{ note: 'F#3', duration: 'q' }, { note: 'G3', duration: 'q' }, { note: 'F#3', duration: 'q' }, { note: 'E3', duration: 'q' }, { note: 'F3', duration: 'h' }, { note: 'G3', duration: 'h' }],
        caption: 'Bar 1: {n:F#} twice. Bar 2: plain {n:F}.',
      },
      tip: 'On the neck: {n:F#} in the bottom space is string 4, fret 4; plain {n:F} is fret 3.',
    },
    {
      type: 'choice',
      prompt: 'The bar starts with {n:F#} in the bottom space. What is the third note, on the same space with no sign?',
      figure: { kind: 'staff', time: '4/4', notes: [{ note: 'F#3', duration: 'q' }, { note: 'G3', duration: 'q' }, { note: 'F#3', duration: 'q' }, { note: 'A3', duration: 'q' }] },
      options: [
        { text: '{n:F#}', correct: true },
        { text: '{n:F}', why: 'The sharp at the start of the bar still applies: it lasts until the bar line.' },
        { text: '{n:G}', why: '{n:G} is on the second line, one step higher.' },
        { text: '{n:E}', why: '{n:E} is on the bottom line, one step lower.' },
      ],
      explain: 'The sharp lasts to the end of the bar, so the unsigned note in the same space is {n:F#} too: string 4, fret 4 both times.',
      fact: 'first-position-accidental-bar',
    },
    {
      type: 'true-false',
      statement: 'An accidental lasts for the rest of the piece.',
      answer: false,
      explain: 'Only to the end of its bar. After the bar line the note is plain again unless a new sign (or the key signature) says otherwise.',
      fact: 'first-position-accidental-bar',
    },
    {
      type: 'card',
      title: 'Only that line or space',
      body: 'An accidental changes only the notes on its own line or space. The {n:F} on the top line is an octave higher, so a sharp in the bottom space does not touch it: it stays plain {n:F}, string 1, fret 1.',
      figure: {
        kind: 'staff',
        time: '4/4',
        notes: [{ note: 'F#3', duration: 'q' }, { note: 'A3', duration: 'q' }, { note: 'F4', duration: 'q' }, { note: 'F#3', duration: 'q' }],
        caption: '{n:F#} low, plain {n:F} on the top line, {n:F#} low again.',
      },
    },
    {
      type: 'choice',
      prompt: 'This bar starts with {n:F#} in the bottom space. What is the note on the top line?',
      figure: { kind: 'staff', time: '4/4', notes: [{ note: 'F#3', duration: 'q' }, { note: 'A3', duration: 'q' }, { note: 'F4', duration: 'h' }] },
      options: [
        { text: '{n:F}', correct: true },
        { text: '{n:F#}', why: 'The sharp belongs to the bottom space only, not to the {n:F} an octave higher.' },
        { text: '{n:G}', why: '{n:G} would sit in the space above the top line.' },
      ],
      explain: 'An accidental applies to its own line or space only. The top-line note has no sign, so it is plain {n:F}: string 1, fret 1.',
      fact: 'first-position-accidental-same-line',
    },
    {
      type: 'card',
      title: 'Cancel it',
      body: 'A {t:natural-sign|natural sign} cancels a sharp or flat: from there to the bar line the note is plain. The bar line cancels accidentals too, with one exception: a note {t:tie|tied} across the bar line keeps its accidental for as long as the tie lasts.',
      figure: {
        kind: 'staff',
        time: '4/4',
        notes: [{ note: 'F#3', duration: 'q' }, { note: 'F#3', duration: 'q' }, { note: 'F3', duration: 'q' }, { note: 'F3', duration: 'q' }, { note: 'G3', duration: 'w' }],
        caption: 'Sharp, still sharp, a natural sign, still natural.',
      },
    },
    {
      type: 'choice',
      prompt: 'Which sign cancels a sharp?',
      options: [
        { text: 'A natural sign', correct: true },
        { text: 'A flat sign', why: 'A flat would lower the plain note: {n:Fb}, not {n:F}.' },
        { text: 'A second sharp', why: 'A second sharp sign changes nothing: the note stays sharp.' },
      ],
      explain: 'A natural sign cancels a sharp or a flat: the note is played plain until the bar line.',
      fact: 'first-position-natural-sign',
    },
    {
      type: 'staff-read',
      prompt: 'Which note is this?',
      note: 'F#3',
      options: ['F#', 'F', 'G', 'E'],
      explain: 'The sharp sign before the {n:F} in the bottom space makes it {n:F#}: string 4, fret 4.',
    },
    {
      type: 'fretboard-find',
      prompt: 'Bar 1 starts with {n:F#}; the third note, in the same space, has no sign. Tap where you play that third note.',
      figure: { kind: 'staff', time: '4/4', notes: [{ note: 'F#3', duration: 'q' }, { note: 'G3', duration: 'q' }, { note: 'F#3', duration: 'h' }] },
      find: { note: 'F#3' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 5],
      explain: 'The sharp still applies, so it is {n:F#}: string 4, fret 4, one fret above plain {n:F}.',
      fact: 'first-position-accidental-bar',
    },
    {
      type: 'choice',
      prompt: 'An {n:F#} at the end of a bar is tied across the bar line. What sounds after the bar line?',
      options: [
        { text: 'The same {n:F#}, still held', correct: true },
        { text: 'Plain {n:F}', why: 'A tied note keeps its accidental: the tie only holds the same note longer.' },
        { text: 'A new {n:F#}, picked again', why: 'A tie joins two notes into one: you do not pick again.' },
      ],
      explain: 'A tie holds one note across the bar line, accidental and all. Only the next new note on that space goes back to plain {n:F}.',
      fact: 'first-position-natural-sign',
    },
    { generate: 'staff-note', params: { ask: 'read', low: 'E3', high: 'F4', accidentals: true } },
  ],
  facts: [
    { id: 'first-position-accidental-bar', front: 'How long does an accidental written before a note last?', back: 'Until the end of that bar.' },
    {
      id: 'first-position-accidental-same-line',
      front: 'Does an accidental change the same letter in another octave?',
      back: 'No: it applies to notes on the same line or space only, not to the same letter in another octave.',
    },
    {
      id: 'first-position-natural-sign',
      front: 'What cancels an accidental, and what is the exception?',
      back: 'A natural sign cancels a sharp or flat, and so does the bar line, except that a note tied across the bar line keeps its accidental.',
      ask: {
        type: 'true-false',
        statement: 'A note tied across a bar line keeps its accidental.',
        answer: true,
        explain: 'A tie holds one note longer, accidental and all. The bar line cancels accidentals for new notes only.',
      },
    },
  ],
};

const sharpsAndFlatsInPosition: Lesson = {
  id: 'sharps-and-flats-in-position',
  title: 'Sharps and flats in first position',
  teaches: 'In first position a sharp is one fret up and a flat one down; flats on open strings move one string thicker.',
  minutes: 3,
  skill: `theory:${U}:sharps-and-flats-in-position`,
  steps: [
    {
      type: 'card',
      title: 'One fret up, one fret down',
      body: 'In first position a sharp is played one fret above its natural, and a flat one fret below, on the same string where possible. {n:F} is string 1, fret 1, so {n:F#} is fret 2. {n:C} is string 2, fret 1, so {n:C#} is fret 2.',
      figure: {
        kind: 'staff',
        notes: [{ note: 'F#4', duration: 'q' }, { note: 'C#4', duration: 'q' }, { note: 'Bb3', duration: 'q' }, { note: 'Eb4', duration: 'q' }],
        caption: 'Played at string 1 fret 2, string 2 fret 2, string 3 fret 3, string 2 fret 4.',
      },
    },
    {
      type: 'staff-read',
      prompt: 'Which note is this, on the top line with a sharp?',
      note: 'F#4',
      options: ['F#', 'F', 'G', 'E'],
      explain: 'The top line is {n:F}; the sharp makes it {n:F#}. In first position it is string 1, fret 2, one fret above {n:F}.',
      fact: 'first-position-sharps-on-top',
    },
    {
      type: 'card',
      title: 'A flat on an open string',
      body: 'A flat on an open-string note has no fret below it on that string. So play it on the next thicker string. {n:Bb}, below the open {n:B}, is string 3, fret 3. {n:Eb}, below the open high {n:E}, is string 2, fret 4.',
      figure: {
        kind: 'fretboard',
        frets: [0, 4],
        dots: [
          { string: 2, fret: 0, note: 'B3', role: 'ghost' },
          { string: 3, fret: 3, note: 'Bb3', role: 'target' },
          { string: 1, fret: 0, note: 'E4', role: 'ghost' },
          { string: 2, fret: 4, note: 'Eb4', role: 'target' },
        ],
        caption: '{n:Bb} below the open {n:B}; {n:Eb} below the open high {n:E}.',
      },
      tip: 'Fret 4 is the little finger\'s job in first position. Keep your thumb low behind the neck to reach it.',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap where this {n:Bb}, on the middle line with a flat, is played in first position.',
      figure: { kind: 'staff', notes: [{ note: 'Bb3', duration: 'w' }] },
      find: { note: 'Bb3' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 4],
      explain: 'The middle line is {n:B}, the open 2nd string. There is no fret below an open string, so {n:Bb} moves to string 3, fret 3.',
      fact: 'first-position-flat-open-string',
    },
    {
      type: 'staff-place',
      prompt: 'Put {n:Eb} in the top space: the note you play at string 2, fret 4.',
      note: 'Eb4',
      octave: 'exact',
      explain: 'The top space is {n:E}, the open high string. Add a flat before it: {n:Eb}, played one string thicker, at string 2, fret 4.',
    },
    {
      type: 'choice',
      prompt: '{n:C#} is written in the third space. Where is it played in first position?',
      options: [
        { text: 'String 2, fret 2', correct: true },
        { text: 'String 2, fret 1', why: 'String 2, fret 1 is plain {n:C}; the sharp adds one fret.' },
        { text: 'String 1, fret 2', why: 'String 1, fret 2 is {n:F#}, written on the top line.' },
        { text: 'String 3, fret 2', why: 'String 3, fret 2 is {n:A}, written in the second space.' },
      ],
      explain: '{n:C} is string 2, fret 1, so {n:C#} is the next fret up: string 2, fret 2.',
      fact: 'first-position-sharps-on-top',
    },
    {
      type: 'true-false',
      statement: '{n:Eb}, just below the open high {n:E}, is played on string 2, fret 4.',
      answer: true,
      explain: 'The open high {n:E} has no fret below it, so {n:Eb} moves to the next thicker string: string 2, fret 4.',
      fact: 'first-position-flat-open-string',
    },
    {
      type: 'choice',
      prompt: '{n:G} is the open 3rd string. Where is {n:G#} played in first position?',
      options: [
        { text: 'String 3, fret 1', correct: true },
        { text: 'String 3, fret 2', why: 'String 3, fret 2 is {n:A}, a whole step above {n:G}.' },
        { text: 'String 4, fret 4', why: 'String 4, fret 4 is {n:F#}, two half steps below {n:G#}.' },
      ],
      explain: 'A sharp is one fret above its natural. The open string is fret 0, so {n:G#} is string 3, fret 1.',
      fact: 'first-position-sharp-flat-frets',
    },
    {
      type: 'choice',
      prompt: '{n:Ab} sits just below the open 5th string, {n:A}. Where is it played in first position?',
      options: [
        { text: 'String 6, fret 4', correct: true },
        { text: 'String 5, fret 1', why: 'Fret 1 raises the open {n:A}; a flat needs a lower note.' },
        { text: 'String 6, fret 3', why: 'String 6, fret 3 is {n:G}, a half step below {n:Ab}.' },
      ],
      explain: 'A flat on an open-string note moves to the next thicker string: {n:Ab} is string 6, fret 4, one fret below the open {n:A}.',
      fact: 'first-position-flat-open-string',
    },
    { generate: 'staff-note', params: { ask: 'read', low: 'E3', high: 'F4', accidentals: true } },
    { generate: 'staff-note', params: { ask: 'place', low: 'E3', high: 'F4', accidentals: true } },
  ],
  facts: [
    {
      id: 'first-position-sharp-flat-frets',
      front: 'In first position, where is a sharp played, and where a flat?',
      back: 'A sharp one fret above its natural and a flat one fret below, on the same string where possible.',
    },
    {
      id: 'first-position-flat-open-string',
      front: 'Where do you play a flat on an open-string note, such as {n:Bb3} or {n:Eb4}?',
      back: 'On the next thicker string: {n:Bb3} at string 3, fret 3; {n:Eb4} at string 2, fret 4.',
      ask: {
        type: 'fretboard-find',
        prompt: 'Tap where {n:Eb}, just below the open high {n:E}, is played in first position.',
        figure: { kind: 'staff', notes: [{ note: 'Eb4', duration: 'w' }] },
        find: { note: 'Eb4' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 4],
        explain: 'No fret lies below an open string, so {n:Eb} moves to string 2, fret 4.',
      },
    },
    { id: 'first-position-sharps-on-top', front: 'Where are {n:F#} on string 1 and {n:C#} on string 2?', back: '{n:F#} on string 1 is fret 2; {n:C#} on string 2 is fret 2.' },
  ],
};

const rhythmOnTheStaff: Lesson = {
  id: 'rhythm-on-the-staff',
  title: 'Stems, beams and reading rhythm',
  teaches: 'Stems and beams show rhythm on the staff, and beams group notes by the beat so you can see each beat start.',
  minutes: 3,
  skill: `theory:${U}:rhythm-on-the-staff`,
  steps: [
    {
      type: 'card',
      title: 'Rhythm on the staff',
      body: 'Note heads give the pitch; stems, flags, beams and dots give the rhythm. Two eighth notes joined by a beam share one beat. A dot adds half the note\'s value: a dotted quarter lasts a beat and a half. Count along with the counts under the staff: a beat in brackets is held, not played.',
      figure: { kind: 'staff', time: '4/4', notes: staff(TWO_BARS), caption: 'Count: 1 (2) &, 3 (4) | 1 &, 2 (3 4). Strings 1 to 3, frets 0 to 3.' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap the rhythm of these two bars before you play them.',
      figure: { kind: 'staff', time: '4/4', notes: staff(TWO_BARS) },
      rhythm: { pattern: TWO_BARS_RHYTHM },
      tempo: 72,
      show: 'both',
      explain: 'Bar 1: a dotted quarter holds through beat 2, the eighth falls on "2 &", and a half note fills beats 3 and 4. Bar 2: two beamed eighths share beat 1, then a dotted half holds beats 2, 3 and 4.',
      fact: 'first-position-reading-routine',
    },
    {
      type: 'card',
      title: 'Stems up, stems down',
      body: 'Notes below the middle line usually have their stems going **up**, on the right of the note head. Notes above it have their stems going **down**, on the left. Notes on the middle line may go either way, usually down. That keeps the stems inside the staff, easy to read.',
      figure: {
        kind: 'staff',
        notes: [{ note: 'G3', duration: 'q', label: 'up' }, { note: 'A3', duration: 'q', label: 'up' }, { note: 'C4', duration: 'q', label: 'down' }, { note: 'E4', duration: 'q', label: 'down' }],
      },
    },
    {
      type: 'choice',
      prompt: 'This note sits above the middle line. If it had a stem, which way would it usually go?',
      figure: { kind: 'staff', notes: [{ note: 'D4', duration: 'w' }] },
      options: [{ text: 'Up, on the right', why: 'Stems go up for notes below the middle line, like {n:G} and {n:A}.' }, { text: 'Down, on the left', correct: true }],
      shuffle: false,
      explain: 'Above the middle line, stems usually go down on the left of the note head. This {n:D} is on the 4th line: string 2, fret 3.',
      fact: 'first-position-stems',
    },
    {
      type: 'choice',
      prompt: 'Why are eighth notes beamed together in groups?',
      options: [
        { text: 'So you can see where each beat starts', correct: true },
        { text: 'To show they are louder', why: 'Loudness is shown by dynamics such as *p* and *f*, not by beams.' },
        { text: 'To show they are played on one string', why: 'Standard notation shows pitch and rhythm; the string is your choice (or the tab\'s).' },
      ],
      explain: 'Beams group eighth and sixteenth notes by the beat. Each beamed group starts a beat, so you can count at a glance.',
      fact: 'first-position-beams',
    },
    {
      type: 'true-false',
      statement: 'A beam joins eighth notes that fall in the same beat.',
      answer: true,
      explain: 'In 4/4 two eighths make one beat, and the beam shows that pair, so you can see where each beat starts.',
      fact: 'first-position-beams',
    },
    {
      type: 'order',
      prompt: 'Put the steps for reading a new piece in order.',
      tiles: ['Tap the rhythm', 'Find the notes', 'Put it together'],
      explain: 'Rhythm first, then the notes, then both at once, slowly. Each step on its own is easy; together they make reading easy too.',
      fact: 'first-position-reading-routine',
    },
    {
      type: 'play-phrase',
      prompt: 'Now play the two bars on strings 1 to 3, slowly, counting as you go.',
      figure: { kind: 'staff', time: '4/4', notes: staff(TWO_BARS) },
      notes: tab(TWO_BARS),
      octave: 'exact',
      tempo: 66,
      explain: 'String 3: open {n:G}, then {n:A} at fret 2. The open {n:B}, then {n:C} and {n:D} at frets 1 and 3 of string 2, and the open high {n:E} held for three beats.',
      alternative: {
        type: 'order',
        prompt: 'Read the two bars and put their notes in order.',
        figure: { kind: 'staff', time: '4/4', notes: staff(TWO_BARS) },
        tiles: ['{n:G}', '{n:A}', '{n:B}', '{n:C}', '{n:D}', '{n:E}'],
        distractors: ['{n:F}'],
        explain: 'The two bars climb step by step from the second line: {n:G} {n:A} {n:B} {n:C} {n:D} {n:E}.',
      },
    },
    { generate: 'rhythm-tap', params: { values: ['quarter', 'eighth', 'half'], bars: 1, tempo: 72, show: 'notation' } },
  ],
  facts: [
    {
      id: 'first-position-stems',
      front: 'Which way do stems go for notes below the middle line, and for notes above it?',
      back: 'Below the middle line: usually up, on the right. Above it: down, on the left.',
      ask: {
        type: 'choice',
        prompt: 'This note sits below the middle line. If it had a stem, which way would it usually go?',
        figure: { kind: 'staff', notes: [{ note: 'A3', duration: 'w' }] },
        options: [{ text: 'Up, on the right', correct: true }, { text: 'Down, on the left', why: 'Stems go down for notes above the middle line.' }],
        shuffle: false,
        explain: 'Below the middle line, stems usually go up on the right of the note head.',
      },
    },
    { id: 'first-position-beams', front: 'What do beams on eighth and sixteenth notes show?', back: 'They group the notes by the beat, so each beat\'s start is easy to see.' },
    { id: 'first-position-reading-routine', front: 'What are the three steps for reading a new piece?', back: 'Tap its rhythm first, then find the notes, then put the two together.' },
  ],
};

const theRoadMap: Lesson = {
  id: 'the-road-map',
  title: 'Repeats and road signs',
  teaches: 'Repeat signs, endings, D.C., D.S., Fine and coda tell you the order in which to play the sections of a piece.',
  minutes: 4,
  skill: `theory:${U}:the-road-map`,
  steps: [
    {
      type: 'card',
      title: 'Signs that steer you',
      body: 'Music often repeats. Rather than write a section out twice, the page uses signs that tell you where to go next: repeat signs, first and second endings, D.C., D.S., Fine and Coda. Follow them like road signs. In the example, section A is written once but played twice, then B follows.',
      figure: {
        kind: 'audio',
        sound: { kind: 'progression', chords: [...SECTION_A, ...SECTION_A, ...SECTION_B], tempo: 100, beats: 2 },
        label: 'Hear A, A again, then B',
        caption: 'A ({c:G} {c:C} {c:D} {c:G}) twice, then B ({c:C} {c:G} {c:D} {c:G}).',
      },
    },
    {
      type: 'card',
      title: 'Repeats and endings',
      body: 'A {t:repeat-sign} is a thick and a thin bar line with two dots. Play to the closing sign, go back to the opening one (or to the very beginning if there is none) and play that passage again. With a 1st and a 2nd ending, play the 1st ending the first time; on the repeat, skip it and play the 2nd.',
    },
    {
      type: 'choice',
      prompt: 'What do two dots beside a thick and a thin bar line mean?',
      options: [
        { text: 'Play the passage again', correct: true },
        { text: 'Stop here: the piece ends', why: 'The end is marked by the word Fine or a final double bar without dots.' },
        { text: 'Play the passage louder', why: 'Loudness is written with dynamics such as *f*, not with bar lines.' },
      ],
      explain: 'Thick and thin bar lines with two dots are repeat signs: play the passage between them again.',
      fact: 'first-position-repeat-signs',
    },
    {
      type: 'order',
      prompt: 'Section A has repeat signs with a 1st and a 2nd ending, then B follows. Put what you play in order.',
      tiles: ['A, 1st ending', 'A, 2nd ending', 'B'],
      explain: 'First time through A you take the 1st ending, which sends you back. On the repeat you skip it, take the 2nd ending and go on to B.',
      fact: 'first-position-endings',
    },
    {
      type: 'true-false',
      statement: 'On the repeat, you play the 1st ending again.',
      answer: false,
      explain: 'The 1st ending is for the first time only. On the repeat, skip it and play the 2nd ending.',
      fact: 'first-position-endings',
    },
    {
      type: 'card',
      title: 'Back to the start, or to the sign',
      body: '{t:da-capo|D.C.} (da capo) sends you back to the beginning. {t:dal-segno|D.S.} (dal segno) sends you back to the sign, a slanted S with two dots. "al Fine" means stop at the word Fine (say "fee-nay": Italian for end). "al Coda" means play until "To Coda", then jump to the {t:coda}: a circle with a cross.',
    },
    {
      type: 'choice',
      prompt: 'What does D.C. al Fine mean?',
      options: [
        { text: 'Go back to the start, stop at Fine', correct: true },
        { text: 'Go back to the sign, stop at Fine', why: 'That is D.S. al Fine: D.S. means from the sign.' },
        { text: 'Jump to the coda', why: 'That is "To Coda"; al Fine means stop at the word Fine.' },
        { text: 'Play the last bar again', why: 'D.C. sends you all the way back to the beginning.' },
      ],
      explain: 'D.C. (da capo, "from the head") means go back to the beginning; al Fine means stop when you reach the word Fine.',
      fact: 'first-position-fine-coda',
    },
    {
      type: 'order',
      prompt: 'A ends with the word Fine, then B ends with D.C. al Fine. Put what you play in order.',
      tiles: ['A', 'B', 'A', 'Stop at Fine'],
      explain: 'Play A (go straight past Fine the first time), then B. D.C. sends you back to the start: play A again and stop at Fine.',
      fact: 'first-position-fine-coda',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each sign with what it means.',
      pairs: [
        { left: 'D.C.', right: 'From the beginning' },
        { left: 'D.S.', right: 'From the sign' },
        { left: 'Fine', right: 'The end' },
        { left: 'Coda', right: 'The closing section' },
      ],
      explain: 'D.C. is da capo, from the head; D.S. is dal segno, from the sign; Fine means end; the coda is the closing section.',
      fact: 'first-position-dc-ds',
    },
    {
      type: 'choice',
      prompt: 'You reach "D.S. al Coda". What do you do?',
      options: [
        { text: 'Go to the sign; at To Coda, jump to the coda', correct: true },
        { text: 'Go back to the very beginning', why: 'That is D.C.: D.S. means from the sign.' },
        { text: 'Stop at once', why: 'You stop at Fine, or at the end of the coda.' },
      ],
      explain: 'D.S. sends you back to the sign. Play on until "To Coda", then jump to the coda, marked with a circle and a cross.',
      fact: 'first-position-fine-coda',
    },
    {
      type: 'choice',
      prompt: 'What does the sign that D.S. sends you back to look like?',
      options: [
        { text: 'A slanted S with two dots', correct: true },
        { text: 'A circle with a cross', why: 'That marks the coda.' },
        { text: 'Two dots by a thick bar line', why: 'That is a repeat sign.' },
      ],
      explain: 'The segno ("sign") is a slanted S with two dots. D.S., dal segno, means go back to it.',
      fact: 'first-position-dc-ds',
    },
  ],
  facts: [
    {
      id: 'first-position-repeat-signs',
      front: 'What do repeat signs look like, and what do they mean?',
      back: 'Thick and thin bar lines with two dots: play the passage between them again.',
    },
    {
      id: 'first-position-endings',
      front: 'How do you play first and second endings?',
      back: 'Play the 1st ending the first time; on the repeat, skip it and play the 2nd ending.',
      ask: {
        type: 'order',
        prompt: 'Section A has a 1st and a 2nd ending, then B follows. Put what you play in order.',
        tiles: ['A, 1st ending', 'A, 2nd ending', 'B'],
        explain: 'The 1st ending the first time, the 2nd ending on the repeat, then on to B.',
      },
    },
    {
      id: 'first-position-dc-ds',
      front: 'What do D.C. and D.S. mean?',
      back: 'D.C. (da capo): go back to the beginning. D.S. (dal segno): go back to the sign, a slanted S with two dots.',
    },
    {
      id: 'first-position-fine-coda',
      front: 'What do "al Fine" and "al Coda" mean?',
      back: '"al Fine": stop at the word Fine. "al Coda": jump to the coda (a circle with a cross) when you reach "To Coda".',
    },
  ],
};

const dynamicsAndArticulation: Lesson = {
  id: 'dynamics-and-articulation',
  title: 'Dynamics and articulation',
  teaches: 'Letters and signs on the staff tell you how loud to play and how each note should start and end.',
  minutes: 3,
  skill: `theory:${U}:dynamics-and-articulation`,
  steps: [
    {
      type: 'card',
      title: 'How loud',
      body: '{t:dynamics|Dynamics} are Italian words, shortened to letters under the staff. *p* (piano) means soft and *f* (forte) loud. *m* (mezzo) means "fairly": *mp* is fairly soft, *mf* fairly loud. Doubled letters go further: *pp* very soft, *ff* very loud.',
      figure: { kind: 'staff', time: '4/4', notes: staff(PHRASE), caption: 'Try it: bar 1 *p*, grow louder through bar 3, and play bar 4 *f*.' },
    },
    {
      type: 'order',
      prompt: 'Order these from softest to loudest.',
      tiles: [
        { text: '*pp*', say: 'pianissimo' },
        { text: '*p*', say: 'piano' },
        { text: '*mp*', say: 'mezzo-piano' },
        { text: '*mf*', say: 'mezzo-forte' },
        { text: '*f*', say: 'forte' },
        { text: '*ff*', say: 'fortissimo' },
      ],
      explain: 'pp, p, mp, mf, f, ff: pianissimo, piano, mezzo-piano, mezzo-forte, forte, fortissimo.',
      fact: 'first-position-dynamics-order',
    },
    {
      type: 'choice',
      prompt: 'What does *mf* (mezzo-forte) mean?',
      options: [
        { text: 'Very soft', why: 'Very soft is *pp*, pianissimo.' },
        { text: 'Fairly soft', why: 'Fairly soft is *mp*, mezzo-piano.' },
        { text: 'Fairly loud', correct: true },
        { text: 'Very loud', why: 'Very loud is *ff*, fortissimo.' },
      ],
      shuffle: false,
      explain: '*f* is forte, loud, and mezzo means fairly: *mf* is fairly loud, one step softer than *f*.',
      fact: 'first-position-dynamics-order',
    },
    {
      type: 'card',
      title: 'Getting louder, getting softer',
      body: 'A {t:crescendo} (cresc., or a wedge that opens out) means grow gradually louder. A {t:diminuendo} (dim., or a wedge that closes) means grow gradually softer. On the guitar, pick a little harder, or a little softer, with each note: no sudden jump.',
    },
    {
      type: 'true-false',
      statement: 'A wedge that closes up, a diminuendo, means gradually softer.',
      answer: true,
      explain: 'An opening wedge (crescendo) grows louder; a closing wedge (diminuendo) grows softer, little by little.',
      fact: 'first-position-crescendo',
    },
    {
      type: 'card',
      title: 'Short or held',
      body: 'A dot above or below a note, {t:staccato}, means short and detached. A short line, {t:tenuto}, means hold it for its full length. To play staccato on the guitar, ease the fretting finger off right after the note, or touch an open string with your picking hand.',
      figure: {
        kind: 'audio',
        sound: {
          kind: 'tab',
          tempo: 80,
          notes: [
            { string: 1, fret: 0, duration: 'e' }, { rest: true, duration: 'e' }, { string: 2, fret: 3, duration: 'e' }, { rest: true, duration: 'e' },
            { string: 2, fret: 1, duration: 'e' }, { rest: true, duration: 'e' }, { string: 2, fret: 3, duration: 'e' }, { rest: true, duration: 'e' },
            { string: 1, fret: 0, duration: 'q' }, { string: 2, fret: 3, duration: 'q' }, { string: 2, fret: 1, duration: 'q' }, { string: 2, fret: 3, duration: 'q' },
          ],
        },
        label: 'Short, then held',
      },
    },
    {
      type: 'listen-choice',
      prompt: 'Listen. Was the phrase played staccato or tenuto?',
      sound: {
        kind: 'tab',
        tempo: 80,
        notes: [
          { string: 1, fret: 1, duration: 'e' }, { rest: true, duration: 'e' }, { string: 1, fret: 3, duration: 'e' }, { rest: true, duration: 'e' },
          { string: 1, fret: 1, duration: 'e' }, { rest: true, duration: 'e' }, { string: 1, fret: 0, duration: 'e' }, { rest: true, duration: 'e' },
        ],
      },
      options: [{ text: 'Staccato: short and detached', correct: true }, { text: 'Tenuto: held full length' }],
      shuffle: false,
      explain: 'Each note stopped halfway through its beat, leaving a gap before the next: short and detached, staccato.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each marking with its meaning.',
      pairs: [
        { left: { text: '*p*', say: 'piano' }, right: 'Soft' },
        { left: { text: '*f*', say: 'forte' }, right: 'Loud' },
        { left: 'cresc.', right: 'Getting louder' },
        { left: 'Staccato', right: 'Short and detached' },
      ],
      explain: '*p* is piano, soft; *f* is forte, loud; cresc. means grow louder; staccato means short and detached.',
    },
    {
      type: 'choice',
      prompt: 'A note has a short line above it. How do you play it?',
      options: [
        { text: 'Hold it for its full length', correct: true },
        { text: 'Short and detached', why: 'That is staccato, shown by a dot.' },
        { text: 'Gradually louder', why: 'That is a crescendo, shown by cresc. or an opening wedge.' },
      ],
      explain: 'A short line is a tenuto mark: hold the note for its full value, right up to the next one.',
      fact: 'first-position-staccato-tenuto',
    },
    {
      type: 'choice',
      prompt: 'Bar 1 is marked *p* and a crescendo leads to *f* in bar 4. How does the phrase go?',
      options: [
        { text: 'Soft, growing louder, ending loud', correct: true },
        { text: 'Loud, growing softer, ending soft', why: 'That would be *f*, a diminuendo, then *p*.' },
        { text: 'Soft all the way, then a sudden loud bar', why: 'A crescendo grows louder gradually, not all at once.' },
      ],
      explain: '*p* is soft; the crescendo grows louder little by little; *f* is loud.',
      fact: 'first-position-crescendo',
    },
  ],
  facts: [
    {
      id: 'first-position-dynamics-order',
      front: 'Name the dynamics from softest to loudest.',
      back: '*pp*, *p*, *mp*, *mf*, *f*, *ff*: pianissimo, piano, mezzo-piano, mezzo-forte, forte, fortissimo.',
    },
    {
      id: 'first-position-crescendo',
      front: 'What do a crescendo and a diminuendo mean?',
      back: 'Crescendo (cresc. or an opening wedge): gradually louder. Diminuendo (dim. or a closing wedge): gradually softer.',
    },
    {
      id: 'first-position-staccato-tenuto',
      front: 'What do a staccato dot and a tenuto line mean?',
      back: 'A dot above or below a note (staccato): short and detached. A short line (tenuto): hold it for its full length.',
      ask: {
        type: 'match-pairs',
        prompt: 'Match each marking with its meaning.',
        pairs: [
          { left: 'A dot (staccato)', right: 'Short and detached' },
          { left: 'A line (tenuto)', right: 'Held full length' },
          { left: 'cresc.', right: 'Gradually louder' },
        ],
        explain: 'A staccato dot means short; a tenuto line means held for its full length; cresc. means grow gradually louder.',
      },
    },
  ],
};

/** Unit 23 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'Reading in first position',
  theme: 'reading',
  description: 'All six strings in first position, accidentals within a bar, rhythm on the staff, repeats and road signs, dynamics and articulation.',
  lessons: [strings4To6, accidentalsInABar, sharpsAndFlatsInPosition, rhythmOnTheStaff, theRoadMap, dynamicsAndArticulation],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      {
        type: 'staff-read',
        prompt: 'Which note is this, below the third ledger line?',
        note: 'E2',
        options: ['E', 'F', 'G', 'D'],
        explain: 'The open low {n:E}, string 6, hangs just below the third ledger line below the staff.',
      },
      { generate: 'staff-note', params: { ask: 'read', low: 'E2', high: 'G4' } },
      {
        type: 'fretboard-find',
        prompt: 'Tap where this {n:B}, just below the first ledger line, is played in first position.',
        figure: { kind: 'staff', notes: [{ note: 'B2', duration: 'w' }] },
        find: { note: 'B2' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 4],
        explain: 'That {n:B} is string 5, fret 2.',
      },
      {
        type: 'choice',
        prompt: 'This {n:D} hangs just below the staff. Where is it played in first position?',
        figure: { kind: 'staff', notes: [{ note: 'D3', duration: 'w' }] },
        options: [
          { text: 'String 4, open', correct: true },
          { text: 'String 2, fret 3', why: 'That {n:D} is an octave higher, on the 4th line.' },
          { text: 'String 3, fret 2', why: 'String 3, fret 2 is {n:A}, in the second space.' },
        ],
        explain: 'The {n:D} just below the staff is the open 4th string.',
      },
      {
        type: 'choice',
        prompt: 'The bar starts with {n:C#} in the third space. What is the third note, on the same space with no sign?',
        figure: { kind: 'staff', time: '4/4', notes: [{ note: 'C#4', duration: 'q' }, { note: 'D4', duration: 'q' }, { note: 'C#4', duration: 'q' }, { note: 'B3', duration: 'q' }] },
        options: [
          { text: '{n:C#}', correct: true },
          { text: '{n:C}', why: 'The sharp lasts until the bar line.' },
          { text: '{n:D}', why: '{n:D} is on the 4th line, one step higher.' },
        ],
        explain: 'The sharp lasts to the bar line, so the unsigned note in the same space is {n:C#}: string 2, fret 2.',
      },
      {
        type: 'true-false',
        statement: 'A natural sign cancels a sharp or a flat for the rest of the bar.',
        answer: true,
        explain: 'After a natural sign the note is plain until the bar line.',
      },
      {
        type: 'true-false',
        statement: 'A note tied across the bar line loses its accidental.',
        answer: false,
        explain: 'A tie holds the same note longer, so it keeps its accidental.',
      },
      {
        type: 'fretboard-find',
        prompt: 'Tap where this {n:Eb}, in the top space with a flat, is played in first position.',
        figure: { kind: 'staff', notes: [{ note: 'Eb4', duration: 'w' }] },
        find: { note: 'Eb4' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 4],
        explain: 'No fret lies below the open high {n:E}, so {n:Eb} is played at string 2, fret 4.',
      },
      {
        type: 'staff-place',
        prompt: 'Put {n:Bb} on the middle line: the note you play at string 3, fret 3.',
        note: 'Bb3',
        octave: 'exact',
        explain: 'The middle line is {n:B}; with a flat it is {n:Bb}, played at string 3, fret 3.',
      },
      {
        type: 'choice',
        prompt: 'A note sits below the middle line. Which way does its stem usually go?',
        options: [{ text: 'Up, on the right', correct: true }, { text: 'Down, on the left', why: 'That is for notes above the middle line.' }],
        shuffle: false,
        explain: 'Below the middle line, stems usually go up, on the right of the note head.',
      },
      {
        type: 'choice',
        prompt: 'What do beams on eighth notes show?',
        options: [
          { text: 'Which notes share a beat', correct: true },
          { text: 'Which notes are louder', why: 'Dynamics show loudness.' },
          { text: 'Which string to play', why: 'Notation shows pitch and rhythm, not strings.' },
        ],
        explain: 'Beams group eighth and sixteenth notes by the beat.',
      },
      {
        type: 'order',
        prompt: 'Section A has a 1st and a 2nd ending, then B follows. Put what you play in order.',
        tiles: ['A, 1st ending', 'A, 2nd ending', 'B'],
        explain: 'The 1st ending the first time, the 2nd ending on the repeat, then B.',
      },
      {
        type: 'match-pairs',
        prompt: 'Match each sign with what it means.',
        pairs: [
          { left: 'D.C.', right: 'From the beginning' },
          { left: 'D.S.', right: 'From the sign' },
          { left: 'Fine', right: 'The end' },
          { left: 'Coda', right: 'The closing section' },
        ],
        explain: 'D.C. da capo, D.S. dal segno, Fine the end, the coda the closing section.',
      },
      {
        type: 'choice',
        prompt: 'What does D.S. al Coda mean?',
        options: [
          { text: 'Go to the sign; at To Coda, jump to the coda', correct: true },
          { text: 'Go back to the beginning and stop at Fine', why: 'That is D.C. al Fine.' },
          { text: 'Repeat the last section', why: 'Repeat signs do that.' },
        ],
        explain: 'D.S. means from the sign; al Coda means jump to the coda at "To Coda".',
      },
      {
        type: 'order',
        prompt: 'Order these from softest to loudest.',
        tiles: [{ text: '*pp*', say: 'pianissimo' }, { text: '*mp*', say: 'mezzo-piano' }, { text: '*mf*', say: 'mezzo-forte' }, { text: '*ff*', say: 'fortissimo' }],
        explain: 'pp, mp, mf, ff: very soft, fairly soft, fairly loud, very loud.',
      },
      {
        type: 'match-pairs',
        prompt: 'Match each marking with its meaning.',
        pairs: [
          { left: 'cresc.', right: 'Gradually louder' },
          { left: 'dim.', right: 'Gradually softer' },
          { left: 'Staccato', right: 'Short and detached' },
          { left: 'Tenuto', right: 'Held full length' },
        ],
        explain: 'Crescendo grows louder, diminuendo softer; staccato is short, tenuto held.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Read the first four bars of the melody and fill in the missing notes.',
        figure: { kind: 'staff', time: '4/4', notes: staff(MELODY_FIRST) },
        text: '{n:A} {n:B} | ___ | {n:B} ___ | {n:A}',
        blanks: ['{n:C}', '{n:G}'],
        bank: ['{n:E}', '{n:F}'],
        explain: 'Bar 2 is {n:C} on the first ledger line; bar 3 falls to {n:G}, hanging from the second ledger line, before the melody rests on {n:A}.',
      },
    ],
  },
};

export default unit;
