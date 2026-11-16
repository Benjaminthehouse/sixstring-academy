/**
 * Mia, unit 3: Melodies from tab (plan: `mia/mia-melodies-from-tab` in src/content/plan/teachers.json).
 *
 * Tab with its rhythm, the notes of strings 1 and 2, then melodies on the top three strings:
 * Au Clair de la Lune, Mary Had a Little Lamb, Lightly Row, Twinkle, Twinkle, London Bridge, Ode to
 * Joy and, for the recital's encore, the Jingle Bells chorus. Every lesson follows its plan entry:
 * the `explain` in Mia's voice on the cards, the `show` as tab, fretboards and rhythms, the
 * `practice` as exercises (microphone steps with a tapping alternative) and Player tasks.
 *
 * Every tune quoted here is the library's (`src/content/songs/<id>/song.sixtab`), note for note;
 * `mia-melodies-from-tab.test.ts` checks it, and checks the BPM each task names against the song's
 * own tempo and the task's percentage. Play steps say string and fret in words, because the
 * listening meter names notes with octaves (B3), which Mia has not taught.
 */
import type { TabNote } from '@/lessons';
import type { TeacherLesson, TeacherUnit } from '../types';
import { playerTask, techniqueTask, toolTask } from '../tasks';

/** One tab note. */
function n(string: number, fret: number, duration: string): TabNote {
  return { string, fret, duration };
}

/** Au Clair de la Lune, bars 1 to 4 (the library's "Day one: A"). */
export const AU_CLAIR_A: TabNote[] = [
  n(3, 0, 'q'), n(3, 0, 'q'), n(3, 0, 'q'), n(3, 2, 'q'),
  n(2, 0, 'h'), n(3, 2, 'h'),
  n(3, 0, 'q'), n(2, 0, 'q'), n(3, 2, 'q'), n(3, 2, 'q'),
  n(3, 0, 'w'),
];

/** Mary Had a Little Lamb, all 8 bars. */
export const MARY: TabNote[] = [
  n(2, 0, 'q'), n(3, 2, 'q'), n(3, 0, 'q'), n(3, 2, 'q'),
  n(2, 0, 'q'), n(2, 0, 'q'), n(2, 0, 'h'),
  n(3, 2, 'q'), n(3, 2, 'q'), n(3, 2, 'h'),
  n(2, 0, 'q'), n(2, 3, 'q'), n(2, 3, 'h'),
  n(2, 0, 'q'), n(3, 2, 'q'), n(3, 0, 'q'), n(3, 2, 'q'),
  n(2, 0, 'q'), n(2, 0, 'q'), n(2, 0, 'q'), n(2, 0, 'q'),
  n(3, 2, 'q'), n(3, 2, 'q'), n(2, 0, 'q'), n(3, 2, 'q'),
  n(3, 0, 'w'),
];

/** Twinkle, line A (bars 1 to 4, and again as bars 9 to 12). */
export const TWINKLE_A: TabNote[] = [
  n(3, 0, 'q'), n(3, 0, 'q'), n(2, 3, 'q'), n(2, 3, 'q'),
  n(1, 0, 'q'), n(1, 0, 'q'), n(2, 3, 'h'),
  n(2, 1, 'q'), n(2, 1, 'q'), n(2, 0, 'q'), n(2, 0, 'q'),
  n(3, 2, 'q'), n(3, 2, 'q'), n(3, 0, 'h'),
];

/** Ode to Joy, line 1 (bars 1 to 4), ending on A with the dotted rhythm. */
export const ODE_LINE_1: TabNote[] = [
  n(2, 0, 'q'), n(2, 0, 'q'), n(2, 1, 'q'), n(2, 3, 'q'),
  n(2, 3, 'q'), n(2, 1, 'q'), n(2, 0, 'q'), n(3, 2, 'q'),
  n(3, 0, 'q'), n(3, 0, 'q'), n(3, 2, 'q'), n(2, 0, 'q'),
  n(2, 0, 'q.'), n(3, 2, 'e'), n(3, 2, 'h'),
];

/** Ode to Joy, line B (bars 9 to 12), with the B-C eighth notes and the low open D. */
export const ODE_LINE_B: TabNote[] = [
  n(3, 2, 'q'), n(3, 2, 'q'), n(2, 0, 'q'), n(3, 0, 'q'),
  n(3, 2, 'q'), n(2, 0, 'e'), n(2, 1, 'e'), n(2, 0, 'q'), n(3, 0, 'q'),
  n(3, 2, 'q'), n(2, 0, 'e'), n(2, 1, 'e'), n(2, 0, 'q'), n(3, 2, 'q'),
  n(3, 0, 'q'), n(3, 2, 'q'), n(4, 0, 'h'),
];

/** Jingle Bells, the first line of the chorus (bars 1 to 4): the recital's show. */
export const JINGLE_LINE_1: TabNote[] = [
  n(2, 0, 'q'), n(2, 0, 'q'), n(2, 0, 'h'),
  n(2, 0, 'q'), n(2, 0, 'q'), n(2, 0, 'h'),
  n(2, 0, 'q'), n(2, 3, 'q'), n(3, 0, 'q.'), n(3, 2, 'e'),
  n(2, 0, 'w'),
];

// ── 1. Tab and its rhythm ───────────────────────────────────────────────────────────────────────

const tabAndRhythm: TeacherLesson = {
  id: 'tab-and-rhythm',
  title: 'Tab and its rhythm',
  teaches: 'In tab the top line is string 1 and a number is a fret; listen first to hear how long each note lasts.',
  minutes: 5,
  skill: 'teacher:mia:tab-and-rhythm',
  steps: [
    {
      type: 'card',
      title: 'Six lines, six strings',
      body: 'In {t:tab} each line is a string. The top line is string 1, the thinnest, and the bottom line is string 6. It looks upside down until you hold the guitar and look down at the strings: the thin string 1 is the far one, at the top of what you see.',
      figure: {
        kind: 'tab',
        tempo: 80,
        notes: [n(6, 0, 'q'), n(5, 0, 'q'), n(4, 0, 'q'), n(3, 0, 'q'), n(2, 0, 'q'), n(1, 0, 'q')],
        caption: 'The open strings from string 6 (bottom line) to string 1 (top line).',
      },
      tip: 'A number is a fret, and 0 is an open string.',
    },
    {
      type: 'choice',
      prompt: 'This tab shows one note. Which string and fret?',
      figure: { kind: 'tab', tempo: 80, notes: [n(2, 3, 'h')] },
      options: [
        { text: 'String 2, fret 3', correct: true },
        { text: 'String 5, fret 3', why: 'That is counting from the bottom. In tab the top line is string 1, so the second line from the top is string 2.' },
        { text: 'String 3, fret 2', why: 'The line is the string and the number is the fret, not the other way round.' },
        { text: 'String 2, open', why: 'Open would be a 0. This number is 3.' },
      ],
      explain: 'Second line from the top: string 2. The number 3: fret 3. That is {n:D}.',
      fact: 'tab-top-line',
    },
    {
      type: 'choice',
      prompt: 'And this one?',
      figure: { kind: 'tab', tempo: 80, notes: [n(3, 0, 'h')] },
      options: [
        { text: 'Open string 3', correct: true },
        { text: 'Open string 4', why: 'Counting from the bottom gives string 4. Count from the top: string 1, 2, 3.' },
        { text: 'String 3, fret 1', why: 'A 0 means no fret at all: the open string.' },
      ],
      explain: 'Third line from the top is string 3, and 0 means open: the open {n:G}.',
      fact: 'tab-top-line',
    },
    {
      type: 'card',
      title: 'Tab shows where, not how long',
      body: 'Plain tab does not show how long notes last, so the tab in the Player adds stems under the numbers, like sheet music. A {t:quarter-note|quarter note} lasts one beat, a {t:half-note|half note} two and a {t:whole-note|whole note} four. Bar 2 of Au Clair de la Lune is two half notes: {n:B} on beats 1 and 2, {n:A} on 3 and 4.',
      figure: { kind: 'rhythm', pattern: 'q q q q | h h', tempo: 80, caption: 'Bars 1 and 2: four quarter notes, then two half notes.' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap bar 2: two half notes, each held for two clicks.',
      rhythm: { pattern: 'h h' },
      tempo: 80,
      show: 'both',
      explain: 'One tap on beat 1 and one on beat 3. Each half note fills two beats, so let the clicks in between go by.',
    },
    {
      type: 'card',
      title: 'Listen first, then read',
      body: 'The best habit with any new tab: hear the tune first, then read it. Press Hear it and follow the numbers. Open string 3 is {n:G}, string 3, fret 2 is {n:A}, and open string 2 is {n:B}.',
      figure: { kind: 'tab', tempo: 80, notes: [...AU_CLAIR_A], caption: 'Au Clair de la Lune, bars 1 to 4: G G G A, B A, G B A A, G.' },
    },
    {
      type: 'choice',
      prompt: 'The last {n:G} of bar 4 is a whole note. How many beats does it last?',
      options: [{ text: '1' }, { text: '2', why: 'Two beats is a half note, like the {n:B} and {n:A} of bar 2.' }, { text: '3' }, { text: '4', correct: true }],
      shuffle: false,
      explain: 'A whole note fills the whole bar of 4/4: four beats. Count all four and let it ring.',
      fact: 'note-lengths',
    },
    playerTask({
      id: 'clair-wait',
      title: 'Au Clair de la Lune in wait mode',
      song: 'au-clair-de-la-lune',
      mode: 'wait',
      bars: [1, 4],
      minutes: 3,
      body: 'Bars 1 to 4 in wait mode: the music waits until you play each right note. Finger 1 plays string 3, fret 2, as in Hot Cross Buns. Watch the stems under the tab for how long to hold each note.',
    }),
    {
      type: 'play-phrase',
      prompt: 'Play bars 1 and 2: {n:G} three times on the open string 3, {n:A} at string 3, fret 2, then {n:B} on the open string 2 and {n:A} again, two beats each.',
      notes: AU_CLAIR_A.slice(0, 6),
      octave: 'exact',
      tempo: 80,
      explain: 'Open string 3 three times, fret 2, then the open string 2 and back to fret 2: {n:G} {n:G} {n:G} {n:A}, {n:B} {n:A}.',
      alternative: {
        type: 'order',
        prompt: 'Put the four bars of Au Clair de la Lune in order.',
        tiles: ['{n:G} {n:G} {n:G} {n:A}', '{n:B} {n:A}', '{n:G} {n:B} {n:A} {n:A}', '{n:G}'],
        explain: 'It walks up from {n:G} to {n:B}, comes back through {n:A}, and settles on a long {n:G}.',
      },
    },
    playerTask({
      id: 'clair-80',
      title: 'Au Clair de la Lune at 80 BPM',
      song: 'au-clair-de-la-lune',
      bars: [1, 4],
      minutes: 3,
      body: 'The same 4 bars at 80 {t:bpm|BPM} with the teacher strumming. Count the quarter notes out loud, 1 2 3 4, all the way through, and hold every long note for its full count.',
      tip: 'The common slip is cutting the long notes short. Keep counting through them.',
    }),
    {
      type: 'true-false',
      statement: 'In tab, the bottom line is string 6, the thickest.',
      answer: true,
      explain: 'Top line string 1, bottom line string 6. Look down at the strings while you hold the guitar and the picture matches.',
      fact: 'tab-top-line',
    },
  ],
  facts: [
    { id: 'tab-top-line', front: 'In tab, which string is the top line?', back: 'String 1, the thinnest. The bottom line is string 6, and a number is the fret to press.' },
    { id: 'tab-note-length', front: 'Plain tab shows the string and the fret. What does it leave out?', back: 'How long each note lasts. Listen first, or read the stems the Player adds under the tab.' },
    { id: 'note-lengths', front: 'In 4/4, how long do a quarter, a half and a whole note last?', back: 'A quarter note one beat, a half note two beats, a whole note four.' },
  ],
};

// ── 2. Notes on strings 1 and 2 ─────────────────────────────────────────────────────────────────

const strings1And2: TeacherLesson = {
  id: 'strings-1-and-2',
  title: 'Notes on strings 1 and 2',
  teaches: 'One finger per fret: E, F and G on string 1, B, C and D on string 2, with fingers 1 and 3.',
  minutes: 5,
  skill: 'teacher:mia:strings-1-and-2',
  steps: [
    {
      type: 'card',
      title: 'One finger per fret',
      body: 'On strings 1 and 2 your hand stays still and the fingers do the work: finger 1 plays fret 1, finger 3 plays fret 3. String 1: open {n:E}, fret 1 {n:F}, fret 3 {n:G}. String 2: open {n:B}, fret 1 {n:C}, fret 3 {n:D}.',
      figure: {
        kind: 'fretboard',
        frets: [0, 3],
        dots: [
          { string: 1, fret: 0, note: 'E4' },
          { string: 1, fret: 1, note: 'F4', finger: 1 },
          { string: 1, fret: 3, note: 'G4', finger: 3 },
          { string: 2, fret: 0, note: 'B3' },
          { string: 2, fret: 1, note: 'C4', finger: 1 },
          { string: 2, fret: 3, note: 'D4', finger: 3 },
        ],
        caption: 'Fret 1 is always finger 1, fret 3 always finger 3.',
      },
      tip: 'Put the hand in place before you play, finger 1 over fret 1 and finger 3 over fret 3, and let it stay there.',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap {n:C} on string 2.',
      find: { note: 'C4' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 3],
      strings: [2],
      explain: 'String 2, fret 1 is {n:C}, one fret above the open {n:B}. Finger 1 plays it.',
      fact: 'top-strings-notes',
    },
    {
      type: 'card',
      title: 'Two pairs with nothing between',
      body: '{n:E} to {n:F} and {n:B} to {n:C} are only one fret apart. They are the two places in the {t:musical-alphabet|musical alphabet} with no note in between. Everywhere else, neighbouring letters are two frets apart, like {n:F} at fret 1 and {n:G} at fret 3.',
    },
    {
      type: 'choice',
      prompt: 'Which two pairs of letters have no note in between? Pick both.',
      multiple: true,
      options: [
        { text: 'E and F', correct: true },
        { text: 'B and C', correct: true },
        { text: 'F and G', why: '{n:F} to {n:G} is two frets: fret 1 to fret 3 on string 1.' },
        { text: 'C and D', why: '{n:C} to {n:D} is two frets: fret 1 to fret 3 on string 2.' },
      ],
      explain: '{n:E}-{n:F} and {n:B}-{n:C} are one fret apart. That is why the open {n:E} and {n:B} strings have their next note at fret 1.',
      fact: 'e-f-b-c',
    },
    { generate: 'play-note', params: { strings: [1, 2], frets: [0, 3], naturals: true } },
    { generate: 'play-note', params: { strings: [1, 2], frets: [0, 3], naturals: true } },
    { generate: 'play-note', params: { strings: [1, 2], frets: [0, 3], naturals: true } },
    { generate: 'play-note', params: { strings: [1, 2], frets: [0, 3], naturals: true } },
    { generate: 'play-note', params: { strings: [1, 2], frets: [0, 3], naturals: true } },
    playerTask({
      id: 'string-1-study',
      title: 'First Notes on String 1',
      song: 'st-first-notes-string-1',
      mode: 'wait',
      minutes: 4,
      body: 'Wait mode first, until every note rings clean. Then switch to Listen at 72 {t:bpm|BPM}, the full speed, with the teacher strumming {c:C} and {c:G7} under you.',
    }),
    playerTask({
      id: 'string-2-study',
      title: 'First Notes on String 2',
      song: 'st-first-notes-string-2',
      mode: 'wait',
      minutes: 4,
      body: 'Bars 1 to 4 stay on string 2. Bars 5 to 8 cross between strings 2 and 1: keep the pick close to the strings as it moves. Wait mode, then Listen at 72 {t:bpm|BPM}.',
    }),
    {
      type: 'true-false',
      statement: 'On string 2, {n:C} is at fret 1 and {n:D} is at fret 3.',
      answer: true,
      explain: 'Open string 2 is {n:B}; one fret up is {n:C}, two more is {n:D}. Finger 1, then finger 3.',
      fact: 'top-strings-notes',
    },
    playerTask({
      id: 'string-3-again',
      title: 'First Notes on String 3, all 8 bars',
      song: 'st-first-notes-string-3',
      mode: 'wait',
      minutes: 3,
      body: 'Back to the study you began in week one, and now all 8 bars: bars 5 to 8 cross strings 3, 2 and 1 with the notes you have just learned. In first position, string 3, fret 2 is finger 2.',
    }),
    techniqueTask({
      id: 'spider',
      title: 'The Chromatic Spider, one string',
      exercise: 'tech-spider',
      minutes: 3,
      body: 'At 50 {t:bpm|BPM}, play the Fifth position part on one string only: frets 5, 6, 7, 8 with fingers 1, 2, 3, 4, then back down. It wakes up all four fingers. Leave the other strings for another week.',
      tip: 'Keep each finger close to the string when it lifts. Never stretch into pain.',
    }),
    {
      type: 'fretboard-name',
      prompt: 'Which note is string 2, fret 3?',
      position: { string: 2, fret: 3 },
      ask: 'note',
      spelling: 'any',
      options: ['D', 'C', 'E', 'B'],
      explain: 'String 2, fret 3 is {n:D}, under finger 3: two frets above {n:C}.',
      fact: 'top-strings-notes',
    },
  ],
  facts: [
    {
      id: 'top-strings-notes',
      front: 'Name the notes at frets 0, 1 and 3 of strings 1 and 2.',
      back: 'String 1: {n:E}, {n:F}, {n:G}. String 2: {n:B}, {n:C}, {n:D}. Finger 1 on fret 1, finger 3 on fret 3.',
      ask: { generate: 'note-on-string', params: { strings: [1, 2], frets: [0, 3], naturals: true, ask: 'name' } },
    },
    { id: 'e-f-b-c', front: 'Which two pairs of letters have no note in between?', back: '{n:E} and {n:F}, {n:B} and {n:C}: only one fret apart.' },
    { id: 'one-finger-per-fret', front: 'What does "one finger per fret" mean?', back: 'Each finger has its own fret, finger 1 on fret 1 and so on, so the hand stays still and the fingers do the work.' },
  ],
};

// ── 3. Mary Had a Little Lamb ───────────────────────────────────────────────────────────────────

const maryHadALittleLamb: TeacherLesson = {
  id: 'mary-had-a-little-lamb',
  title: 'Mary Had a Little Lamb',
  teaches: 'A tune on strings 3 and 2: cross between the strings with a small pick movement, close to the strings.',
  minutes: 5,
  skill: 'teacher:mia:mary-had-a-little-lamb',
  steps: [
    {
      type: 'card',
      title: 'Four notes on two strings',
      body: 'This tune lives on two strings: the open string 3 ({n:G}), string 3, fret 2 ({n:A}) with finger 2, the open string 2 ({n:B}) and string 2, fret 3 ({n:D}) with finger 3. Your hand is in first {t:position}: finger 1 over fret 1, one finger per fret.',
      figure: {
        kind: 'fretboard',
        frets: [0, 3],
        dots: [
          { string: 3, fret: 0, note: 'G3' },
          { string: 3, fret: 2, note: 'A3', finger: 2 },
          { string: 2, fret: 0, note: 'B3' },
          { string: 2, fret: 3, note: 'D4', finger: 3 },
        ],
        caption: 'The four notes: {n:G} and {n:A} on string 3, {n:B} and {n:D} on string 2.',
      },
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap {n:D} on string 2.',
      find: { note: 'D4' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 3],
      strings: [2],
      explain: 'String 2, fret 3 is {n:D}, under finger 3: the high note of bar 4.',
      fact: 'mary-notes',
    },
    {
      type: 'card',
      title: 'The whole tune, and one tricky moment',
      body: 'Steady quarter notes, like walking, with a held note to end bars 2, 3 and 4 and a long {n:G} to finish. The tricky moment is crossing from string 3 to string 2: keep the pick movement small and close to the strings, so it has less distance to travel.',
      figure: { kind: 'tab', tempo: 96, notes: [...MARY], caption: 'All 8 bars. Press Hear it before you read.' },
    },
    {
      type: 'choice',
      prompt: 'Crossing from string 3 to string 2, what helps most?',
      options: [
        { text: 'A small pick movement, close to the strings', correct: true },
        { text: 'A big swing, to be sure of the string', why: 'A big swing takes longer and often catches the wrong string.' },
        { text: 'Lifting the hand off between notes', why: 'Then the hand has to find its place again every time.' },
      ],
      explain: 'The less the pick travels, the sooner it arrives. Keep it close to the strings and move it just far enough.',
      fact: 'string-crossing',
    },
    {
      type: 'play-phrase',
      prompt: 'Play bars 3 and 4: {n:A} three times at string 3, fret 2, then {n:B} on the open string 2 and {n:D} twice at string 2, fret 3.',
      notes: MARY.slice(7, 13),
      octave: 'exact',
      tempo: 72,
      explain: '{n:A} {n:A} {n:A}, then across to string 2 for {n:B} {n:D} {n:D}. The crossing is the moment to keep small.',
      alternative: {
        type: 'order',
        prompt: 'Put the first four bars of Mary Had a Little Lamb in order.',
        tiles: ['{n:B} {n:A} {n:G} {n:A}', '{n:B} {n:B} {n:B}', '{n:A} {n:A} {n:A}', '{n:B} {n:D} {n:D}'],
        explain: 'Down and back up, three {n:B}s, three {n:A}s, then {n:B} and two {n:D}s.',
      },
    },
    playerTask({
      id: 'mary-wait',
      title: 'Mary Had a Little Lamb in wait mode',
      song: 'mary-had-a-little-lamb',
      mode: 'wait',
      minutes: 3,
      body: 'The whole tune in wait mode. The music waits for each right note, so use the time to keep your hand still: finger 2 for fret 2 on string 3, finger 3 for fret 3 on string 2.',
    }),
    playerTask({
      id: 'mary-loop',
      title: 'Loop the crossing at 72 BPM',
      song: 'mary-had-a-little-lamb',
      bars: [3, 4],
      tempo: 75,
      minutes: 3,
      body: 'Bars 3 and 4 on a loop at 72 {t:bpm|BPM}: {n:A} {n:A} {n:A}, then {n:B} {n:D} {n:D}. Let it go round until the move from string 3 to string 2 feels smooth.',
    }),
    {
      type: 'true-false',
      statement: 'The tune ends on the open string 3, {n:G}, held for four beats.',
      answer: true,
      explain: 'Bar 8 is one whole note: the open {n:G}, home. Let it ring for all four beats.',
    },
    playerTask({
      id: 'mary-band',
      title: 'Mary with the teacher at 80 BPM',
      song: 'mary-had-a-little-lamb',
      tempo: 83,
      minutes: 3,
      body: 'The whole tune at 80 {t:bpm|BPM} while the teacher strums {c:G}, with {c:D7} in bars 3 and 7. When it is steady, set the speed to 100 % (96 BPM).',
    }),
    {
      type: 'card',
      title: 'A second tune: Lightly Row',
      body: 'Lightly Row uses the same two strings and adds one note: {n:C} at string 2, fret 1, for finger 1. Now three fingers each have their own fret, and your hand still does not move.',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap the new note: {n:C} on string 2.',
      find: { note: 'C4' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 3],
      strings: [2],
      explain: 'String 2, fret 1 is {n:C}, under finger 1.',
    },
    playerTask({
      id: 'lightly-row',
      title: 'Lightly Row',
      song: 'lightly-row',
      mode: 'wait',
      minutes: 4,
      body: 'Wait mode first. Then Listen at 72 {t:bpm|BPM} (set the speed to 82 %), and at 88, the full speed. Fingers 1, 2 and 3 each keep their own fret.',
    }),
    {
      type: 'fretboard-name',
      prompt: 'Which note is string 3, fret 2?',
      position: { string: 3, fret: 2 },
      ask: 'note',
      spelling: 'any',
      options: ['A', 'G', 'B', 'C'],
      explain: 'String 3, fret 2 is {n:A}, under finger 2. In Mary you cross from it to the open {n:B} on string 2 and back.',
      fact: 'mary-notes',
    },
  ],
  facts: [
    { id: 'mary-notes', front: 'Mary Had a Little Lamb: where are {n:A} and {n:D}?', back: '{n:A}: string 3, fret 2, finger 2. {n:D}: string 2, fret 3, finger 3. {n:G} and {n:B} are open strings.' },
    { id: 'string-crossing', front: 'How do you cross cleanly from one string to the next?', back: 'Keep the pick movement small and close to the strings, so it has less distance to travel.' },
  ],
};

// ── 4. Twinkle, Twinkle, Little Star ────────────────────────────────────────────────────────────

const twinkleTwinkle: TeacherLesson = {
  id: 'twinkle-twinkle',
  title: 'Twinkle, Twinkle, Little Star',
  teaches: 'Twinkle starts with a jump of a fifth, G up to D, and has an A B A shape.',
  minutes: 5,
  skill: 'teacher:mia:twinkle-twinkle',
  steps: [
    {
      type: 'card',
      title: 'Six notes on three strings',
      body: 'Twinkle uses six notes across strings 3, 2 and 1: the open {n:G}, {n:A} at string 3, fret 2, the open {n:B}, {n:C} at string 2, fret 1, {n:D} at string 2, fret 3, and the open string 1, {n:E}.',
      figure: {
        kind: 'fretboard',
        frets: [0, 3],
        dots: [
          { string: 3, fret: 0, note: 'G3' },
          { string: 3, fret: 2, note: 'A3', finger: 2 },
          { string: 2, fret: 0, note: 'B3' },
          { string: 2, fret: 1, note: 'C4', finger: 1 },
          { string: 2, fret: 3, note: 'D4', finger: 3 },
          { string: 1, fret: 0, note: 'E4' },
        ],
        caption: 'Every note of Twinkle, in first position.',
      },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each note with its place.',
      pairs: [
        { left: '{n:A}', right: 'String 3, fret 2' },
        { left: '{n:C}', right: 'String 2, fret 1' },
        { left: '{n:D}', right: 'String 2, fret 3' },
        { left: '{n:E}', right: 'Open string 1' },
      ],
      explain: '{n:A} at string 3, fret 2; {n:C} and {n:D} at frets 1 and 3 of string 2; {n:E} is the open string 1.',
      fact: 'twinkle-notes',
    },
    {
      type: 'card',
      title: 'The first move: a jump',
      body: 'The tune starts with a jump of a {t:fifth}, from the open {n:G} up to {n:D} on string 2. It is a fifth because {n:G} to {n:D} spans five letter names: G A B C D. Practise just that jump, five times in a row, until your pick lands on string 2 without looking.',
      figure: { kind: 'tab', tempo: 72, notes: TWINKLE_A.slice(0, 4), caption: 'Bar 1: G G, then the jump to D D.' },
    },
    {
      type: 'choice',
      prompt: 'Why is {n:G} up to {n:D} called a fifth?',
      options: [
        { text: 'It spans five letter names, G to D', correct: true },
        { text: 'D is at fret 5', why: 'This {n:D} is at string 2, fret 3.' },
        { text: 'It is five frets higher', why: 'On one string {n:D} is seven frets above {n:G}. A fifth counts letter names: G A B C D.' },
      ],
      explain: 'Count the letters from {n:G} up to {n:D}, both included: G A B C D. Five letters, so it is a fifth.',
      fact: 'fifth-letters',
    },
    {
      type: 'play-phrase',
      prompt: 'Play the jump twice: {n:G} {n:G} on the open string 3, then {n:D} {n:D} at string 2, fret 3.',
      notes: [...TWINKLE_A.slice(0, 4), ...TWINKLE_A.slice(0, 4)],
      octave: 'exact',
      tempo: 72,
      explain: 'Two open {n:G}s, then the jump to {n:D}: string 2, fret 3, finger 3. If you landed on {n:C} or {n:B}, look at fret 3 before you play.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap where the jump lands: {n:D} on string 2.',
        find: { note: 'D4' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 3],
        strings: [2],
        explain: 'The jump lands on string 2, fret 3: {n:D}, under finger 3.',
      },
    },
    {
      type: 'card',
      title: 'A B A: the first line comes back',
      body: 'Twinkle has an A B A shape. Line A is the first line. Line B is new and is played twice. Then line A comes back to end the song, so you already know the last line before you get there.',
      figure: { kind: 'tab', tempo: 92, notes: [...TWINKLE_A], caption: 'Line A, bars 1 to 4: G G D D, E E D, C C B B, A A G.' },
    },
    {
      type: 'order',
      prompt: 'Put the four lines of Twinkle in order.',
      tiles: ['Twinkle, twinkle', 'Up above', 'Like a diamond', 'Twinkle, twinkle'],
      explain: 'A (Twinkle, twinkle), B (Up above), B again (Like a diamond), then A (Twinkle, twinkle) to finish.',
      fact: 'aba-form',
    },
    playerTask({
      id: 'twinkle-72',
      title: 'Twinkle: wait mode, then 72 BPM',
      song: 'twinkle-twinkle-little-star',
      mode: 'wait',
      minutes: 4,
      body: 'Wait mode first, the whole tune. Then switch to Listen at 72 {t:bpm|BPM} (set the speed to 78 %) with the teacher strumming {c:G}, {c:C} and {c:D7}.',
    }),
    playerTask({
      id: 'twinkle-92',
      title: 'Twinkle at 92 BPM',
      song: 'twinkle-twinkle-little-star',
      minutes: 3,
      body: 'Now at 92 {t:bpm|BPM}, the full speed, start to finish. Keep going through any slip: the next bar is always a fresh start.',
    }),
    {
      type: 'true-false',
      statement: 'The last line of Twinkle is the same as the first.',
      answer: true,
      explain: 'That is the A B A shape: line A comes back to end the song.',
      fact: 'aba-form',
    },
    {
      type: 'card',
      title: 'London Bridge: long, then short',
      body: 'London Bridge has two beats in a bar and the same six notes. On the word Lon-don the rhythm goes long, then short: a {t:dotted-note|dotted} note, then a quick one that squeezes in just before the next beat.',
      figure: { kind: 'rhythm', pattern: 'e. s e e | e e q', time: '2/4', tempo: 80, caption: 'Bars 1 and 2: Lon-don Bridge is fall-ing down.' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap bar 1 of London Bridge: long, short, then two even notes.',
      rhythm: { pattern: 'e. s e e', time: '2/4' },
      tempo: 70,
      show: 'both',
      explain: 'Lon (long) - don (short) Bridge is: the second tap comes just before beat 2.',
    },
    playerTask({
      id: 'london-bridge',
      title: 'London Bridge',
      song: 'london-bridge',
      mode: 'wait',
      minutes: 4,
      body: 'Wait mode first. Then Listen at 80 {t:bpm|BPM} (set the speed to 87 %) and at 92, the full speed. Listen for the long-short on every Lon-don.',
    }),
    {
      type: 'choice',
      prompt: 'On the word Lon-don, how does the rhythm go?',
      options: [
        { text: 'Long, then short', correct: true },
        { text: 'Short, then long', why: 'The dotted note comes first: Lon is long.' },
        { text: 'Two even notes', why: 'Even notes would be two eighth notes. The dot makes the first one longer.' },
      ],
      explain: 'Lon is the dotted note, long; don squeezes in just before the next beat.',
    },
  ],
  facts: [
    { id: 'twinkle-notes', front: 'Where are {n:C}, {n:D} and {n:E} on the top strings?', back: '{n:C}: string 2, fret 1. {n:D}: string 2, fret 3. {n:E}: the open string 1.' },
    { id: 'fifth-letters', front: 'Why is {n:G} up to {n:D} called a fifth?', back: 'It spans five letter names, both ends included: G A B C D.' },
    { id: 'aba-form', front: 'What does A B A mean for a tune?', back: 'A first part, a different middle part, then the first part again. Twinkle, Twinkle is built that way.' },
  ],
};

// ── 5. Ode to Joy ───────────────────────────────────────────────────────────────────────────────

const odeToJoy: TeacherLesson = {
  id: 'ode-to-joy',
  title: 'Ode to Joy',
  teaches: 'Ode to Joy moves by step, and its dotted rhythm is a beat and a half, a half beat, then two beats.',
  minutes: 5,
  skill: 'teacher:mia:ode-to-joy',
  steps: [
    {
      type: 'card',
      title: 'A tune that moves by step',
      body: 'Beethoven\'s theme moves almost entirely by step: each note goes to the next letter, up or down, like {n:B} to {n:C} or {n:A} to {n:G}. It lives on strings 3 and 2: {n:A} at string 3, fret 2, {n:C} at string 2, fret 1, {n:D} at string 2, fret 3, and the open {n:G} and {n:B}.',
      figure: { kind: 'tab', tempo: 96, notes: [...ODE_LINE_1], caption: 'Line 1: B B C D, D C B A, G G A B, B A A.' },
    },
    {
      type: 'choice',
      prompt: 'A tune that moves by step goes...',
      options: [
        { text: 'To the next letter, up or down', correct: true },
        { text: 'Over a letter each time', why: 'That would be a skip, like {n:G} to {n:B}. Ode to Joy almost never does it.' },
        { text: 'Always on the same note', why: 'A repeated note is not a step. Ode to Joy has a few, but mostly it walks.' },
      ],
      explain: 'By step means to the very next letter: {n:B} to {n:C}, {n:C} to {n:D}, {n:A} to {n:G}.',
      fact: 'by-step',
    },
    {
      type: 'card',
      title: 'The famous rhythm',
      body: 'Its famous rhythm comes at the end of line 1: {n:B} held for a beat and a half (a {t:dotted-note|dotted} quarter), {n:A} short, then {n:A} held. Count 1 2 & 3 4: {n:B} on 1, the short {n:A} on the and of 2, the long {n:A} on 3.',
      figure: { kind: 'rhythm', pattern: 'q. e h', tempo: 72, caption: 'Bar 4: dotted quarter, eighth, half note.' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap bar 4 with the click: long, short, then held.',
      rhythm: { pattern: 'q. e h' },
      tempo: 72,
      show: 'both',
      explain: 'Tap on 1, on the and of 2, and on 3. The first note fills a beat and a half; the last one fills beats 3 and 4.',
      fact: 'dotted-quarter',
    },
    {
      type: 'play-phrase',
      prompt: 'Play bars 3 and 4: {n:G} {n:G} on the open string 3, {n:A} at string 3, fret 2, {n:B} on the open string 2, then the long {n:B}, the short {n:A} and the held {n:A}.',
      notes: ODE_LINE_1.slice(8),
      octave: 'exact',
      tempo: 72,
      explain: '{n:G} {n:G} {n:A} {n:B}, then {n:B} for a beat and a half, a quick {n:A} and a long {n:A}.',
      alternative: {
        type: 'tap-rhythm',
        prompt: 'Tap bars 3 and 4: four even beats, then long, short, held.',
        rhythm: { pattern: 'q q q q | q. e h' },
        tempo: 72,
        show: 'both',
        explain: 'Four quarter notes, then the dotted rhythm: 1 2 3 4 | 1 (2) & 3 (4).',
      },
    },
    {
      type: 'card',
      title: 'Line B and the low D',
      body: 'The theme is A A B A: line 1, line 1 again with a home ending, a new line B, then line 1 once more. Line B has two quick pairs, {n:B} {n:C} in one beat ({t:eighth-note|eighth notes}), and ends on the low {n:D}, the open string 4.',
      figure: { kind: 'tab', tempo: 72, notes: [...ODE_LINE_B], caption: 'Line B, bars 9 to 12: the eighth notes, then the low D.' },
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap the low {n:D} that ends line B.',
      find: { note: 'D3' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 3],
      explain: 'The low {n:D} is the open string 4, one string past the {n:A} on string 3 just before it. Let it ring for two beats.',
      fact: 'low-d',
    },
    playerTask({
      id: 'ode-wait',
      title: 'Ode to Joy in wait mode',
      song: 'ode-to-joy-theme',
      mode: 'wait',
      minutes: 4,
      body: 'The whole theme in wait mode, all 16 bars. Watch the stems in bar 4: the dotted note is the long one.',
    }),
    playerTask({
      id: 'ode-loop-b',
      title: 'Loop line B at 72 BPM',
      song: 'ode-to-joy-theme',
      bars: [9, 12],
      tempo: 75,
      minutes: 3,
      body: 'Bars 9 to 12 on a loop at 72 {t:bpm|BPM}: the quick {n:B} {n:C} pairs and the low {n:D}. Let it go round until the eighth notes are even and the {n:D} rings.',
    }),
    {
      type: 'choice',
      prompt: 'In bar 4, which note is the dotted quarter, held for a beat and a half?',
      options: [
        { text: '{n:B}', correct: true },
        { text: '{n:A}', why: '{n:A} comes twice: first short, then held for two beats.' },
        { text: '{n:G}', why: 'Bar 4 has no {n:G}: it is {n:B}, then {n:A} twice.' },
      ],
      explain: 'Bar 4 is {n:B} for a beat and a half, a short {n:A}, then a long {n:A}.',
      fact: 'dotted-quarter',
    },
    playerTask({
      id: 'ode-band',
      title: 'Ode to Joy with the teacher at 80 BPM',
      song: 'ode-to-joy-theme',
      tempo: 83,
      minutes: 4,
      body: 'The whole theme at 80 {t:bpm|BPM} while the teacher strums {c:G} and {c:D}. When it flows, set the speed to 100 % (96 BPM).',
    }),
    {
      type: 'true-false',
      statement: 'Line B of Ode to Joy ends on the open string 4, the low {n:D}.',
      answer: true,
      explain: 'Bars 9 to 12 end on the low {n:D}, the open string 4, held for two beats before line 1 comes back.',
      fact: 'low-d',
    },
  ],
  facts: [
    { id: 'by-step', front: 'What does it mean when a tune moves by step?', back: 'Each note goes to the very next letter, up or down: {n:B} to {n:C}, {n:A} to {n:G}.' },
    { id: 'dotted-quarter', front: 'How long does a dotted quarter note last?', back: 'A beat and a half: the dot adds half the note\'s length again.' },
    { id: 'low-d', front: 'Where is the low {n:D} that ends line B of Ode to Joy?', back: 'The open string 4.' },
  ],
};

// ── 6. Melody recital (milestone) ───────────────────────────────────────────────────────────────

const melodyRecital: TeacherLesson = {
  id: 'melody-recital',
  title: 'Melody recital',
  teaches: 'In a recital you play song after song without restarting: a mistake is a speed bump, not a stop sign.',
  minutes: 5,
  skill: 'teacher:mia:melody-recital',
  steps: [
    {
      type: 'card',
      title: 'A recital',
      body: 'A recital is playing songs one after another without restarting, and that is a different skill from practising one song. Tune, take a breath, count in, and treat each mistake as a speed bump, not a stop sign.',
      tip: 'Your set: Mary Had a Little Lamb, Twinkle, Twinkle and Ode to Joy, then an encore.',
    },
    {
      type: 'choice',
      prompt: 'In the middle of Twinkle you play a wrong note. What do you do?',
      options: [
        { text: 'Keep going: a speed bump, not a stop sign', correct: true },
        { text: 'Start the song again', why: 'A recital never restarts. Keep the beat and carry on.' },
        { text: 'Stop and fix that note', why: 'Fix it in practice tomorrow. Tonight, keep going.' },
      ],
      explain: 'Let the wrong note go and come back in on the next beat. The audience remembers the music, not the bump.',
      fact: 'speed-bump',
    },
    toolTask({
      id: 'recital-tune',
      title: 'Tune up for the recital',
      tool: 'tuner',
      minutes: 2,
      body: 'Every recital starts in tune. Tune all six strings, string 6 to string 1, finishing each one by tightening up to the note.',
    }),
    {
      type: 'card',
      title: 'Your set list',
      body: '1. Mary Had a Little Lamb at 96 {t:bpm|BPM}.\n2. Twinkle, Twinkle, Little Star at 92.\n3. Ode to Joy at 96.\nEach one in Flow mode with the band: the microphone listens, and about 8 notes in 10 right and on time is a pass. No microphone? Choose Tap along.',
    },
    {
      type: 'true-false',
      statement: 'Between songs in a recital, you go straight on to the next one.',
      answer: true,
      explain: 'Take a breath, count in, and start the next song. No do-overs: that is what makes it a recital.',
      fact: 'speed-bump',
    },
    playerTask({
      id: 'set-mary',
      title: 'Song 1: Mary Had a Little Lamb',
      song: 'mary-had-a-little-lamb',
      mode: 'flow',
      minutes: 2,
      body: 'Flow mode at 96 {t:bpm|BPM}, the full speed, with the band. Count yourself in and play it start to finish. Then come straight back for song 2.',
    }),
    playerTask({
      id: 'set-twinkle',
      title: 'Song 2: Twinkle, Twinkle',
      song: 'twinkle-twinkle-little-star',
      mode: 'flow',
      minutes: 2,
      body: 'Flow mode at 92 {t:bpm|BPM}. A breath, a count-in, and keep going through any bump.',
    }),
    {
      type: 'choice',
      prompt: 'Just before each song starts, what do you do?',
      options: [
        { text: 'Take a breath and count in', correct: true },
        { text: 'Play the first note to check it', why: 'Checking notes is for practice. Before a song, breathe and count in.' },
        { text: 'Read the whole tab again', why: 'You know it. Trust your hands, breathe and count in.' },
      ],
      explain: 'A breath settles you and the count-in sets the beat, so the first note lands on time.',
    },
    playerTask({
      id: 'set-ode',
      title: 'Song 3: Ode to Joy',
      song: 'ode-to-joy-theme',
      mode: 'flow',
      minutes: 2,
      body: 'Flow mode at 96 {t:bpm|BPM}, all 16 bars. Watch for the dotted rhythm at the end of each line and the low {n:D} in line B.',
    }),
    {
      type: 'card',
      title: 'Your encore: Jingle Bells',
      body: 'Jingle Bells is your encore. The chorus sits on strings 3 and 2 with lots of repeated notes, so it is quick to learn and fun to play: the open string 3 ({n:G}), string 3, fret 2 ({n:A}), the open string 2 ({n:B}), string 2, fret 1 ({n:C}) and string 2, fret 3 ({n:D}).',
      figure: { kind: 'tab', tempo: 84, notes: [...JINGLE_LINE_1], caption: 'The first line of the chorus: B B B, B B B, B D G A, B.' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap bars 3 and 4: jin-gle all the way.',
      rhythm: { pattern: 'q q q. e | w' },
      tempo: 84,
      show: 'both',
      explain: 'Two even beats, a long note and a short one, then a whole note: the same dotted rhythm as in Ode to Joy.',
    },
    playerTask({
      id: 'jingle-bells',
      title: 'Jingle Bells, the chorus',
      song: 'jingle-bells',
      mode: 'wait',
      minutes: 4,
      body: 'Wait mode first, the whole chorus. Then Listen at 84 {t:bpm|BPM} (set the speed to 84 %) and at 100, the full speed, with the teacher strumming the chords.',
    }),
    {
      type: 'play-phrase',
      id: 'show',
      prompt: 'Your encore, line 1 of Jingle Bells: {n:B} is the open string 2, {n:D} string 2, fret 3, {n:G} and {n:A} the open string 3 and fret 2.',
      notes: [...JINGLE_LINE_1],
      octave: 'exact',
      tempo: 84,
      pass: 0.8,
      explain: '{n:B} {n:B} {n:B}, {n:B} {n:B} {n:B}, {n:B} {n:D} {n:G} {n:A}, {n:B}. About 8 notes in 10 is a pass.',
      alternative: {
        type: 'order',
        prompt: 'Put the four bars of the first line of the Jingle Bells chorus in order.',
        tiles: ['{n:B} {n:B} {n:B}', '{n:B} {n:B} {n:B}', '{n:B} {n:D} {n:G} {n:A}', '{n:B}'],
        distractors: ['{n:C} {n:C} {n:C}'],
        explain: 'Twice {n:B} {n:B} {n:B}, then {n:B} {n:D} {n:G} {n:A}, and a long {n:B} to finish the line.',
      },
    },
  ],
  facts: [
    { id: 'speed-bump', front: 'In a recital, what is a mistake?', back: 'A speed bump, not a stop sign. Keep going and come back in on the next beat.' },
  ],
};

/** Unit 3 of Mia's course. */
const unit: TeacherUnit = {
  id: 'mia-melodies-from-tab',
  title: 'Melodies from tab',
  theme: 'reading',
  description: 'Read tab with its rhythm and play well-known melodies on the top three strings, then give a recital.',
  lessons: [tabAndRhythm, strings1And2, maryHadALittleLamb, twinkleTwinkle, odeToJoy, melodyRecital],
  checkpoint: { sample: 8, maxMistakes: 2 },
  milestone: {
    lesson: 'melody-recital',
    step: 'show',
    piece: 'the first line of Jingle Bells',
    song: 'jingle-bells',
    celebrate: 'You played the first line of your encore to the end and kept going. Three melodies and an encore make a recital, and tab is now yours to read. Next: two new chords, {c:D} and {c:A7}, and a steady beat to strum them to.',
  },
  glossary: [
    { id: 'fifth', term: 'fifth', definition: 'The distance from a note to the note five letter names higher, counting both: G up to D is a fifth.' },
  ],
};

export default unit;
