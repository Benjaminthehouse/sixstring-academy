/**
 * Dev, unit 9: The major scale, everywhere (plan: `dev/dev-major-scale` in
 * src/content/plan/teachers.json).
 *
 * G major over two octaves in first position with strict alternate picking, C major in the five
 * CAGED positions, one melody in five places, sequences and double stops, then two fiddle tunes
 * and a jig. Dev's voice: a bandmate who ties every idea to something to play tonight.
 *
 * Music from the song library: CAGED: The Major Scale in Five Positions (100 BPM, six bars a
 * position), CAGED: One Melody Everywhere (96 BPM, eight bars a position), The Irish Washerwoman
 * (138 quarters = 92 dotted quarters; A part bars 1 to 10 with the pickup and both endings, B part
 * bars 11 to 18). Soldier's Joy, Turkey in the Straw and Haste to the Wedding carry fallbacks (the
 * Rondo alla Turca theme, the bluegrass G-run study, The Irish Washerwoman) until they are in the
 * library. `dev-major-scale.test.ts` checks every fret, note, degree and position the text names
 * against the engines, every tab figure against the engine or the library, and every Player tempo.
 */
import type { TabNote } from '@/lessons';
import type { TeacherLesson, TeacherUnit } from '../types';
import { playerTask, techniqueTask, toolTask } from '../tasks';

/** One tab note. */
function t(string: number, fret: number, duration: string): TabNote {
  return { string, fret, duration };
}

/** G major in first position, two octaves up from string 6, fret 3 (the last note held). */
export const G_MAJOR_UP: TabNote[] = [
  t(6, 3, 'e'), t(5, 0, 'e'), t(5, 2, 'e'), t(5, 3, 'e'), t(4, 0, 'e'), t(4, 2, 'e'), t(4, 4, 'e'), t(3, 0, 'e'),
  t(3, 2, 'e'), t(2, 0, 'e'), t(2, 1, 'e'), t(2, 3, 'e'), t(1, 0, 'e'), t(1, 2, 'e'), t(1, 3, 'q'),
];

/** Bar 1 of the One Melody study in the C shape (open position). */
export const MELODY_C_SHAPE: TabNote[] = [t(1, 0, 'q'), t(1, 3, 'e'), t(1, 0, 'e'), t(2, 3, 'q'), t(2, 1, 'q')];

/** Bar 1 of the One Melody study in the E shape (7th position): the same five notes. */
export const MELODY_E_SHAPE: TabNote[] = [t(3, 9, 'q'), t(2, 8, 'e'), t(3, 9, 'e'), t(3, 7, 'q'), t(4, 10, 'q')];

/** C major in thirds from the root, E-shape position: C E, D F, E G, F A. */
export const THIRDS_E_SHAPE: TabNote[] = [t(6, 8, 'e'), t(5, 7, 'e'), t(6, 10, 'e'), t(5, 8, 'e'), t(5, 7, 'e'), t(5, 10, 'e'), t(5, 8, 'e'), t(4, 7, 'e')];

/** C major in groups of three from the root, E-shape position: C D E, D E F, E F G, F G A. */
export const THREES_E_SHAPE: TabNote[] = [
  t(6, 8, 'e'), t(6, 10, 'e'), t(5, 7, 'e'), t(6, 10, 'e'), t(5, 7, 'e'), t(5, 8, 'e'),
  t(5, 7, 'e'), t(5, 8, 'e'), t(5, 10, 'e'), t(5, 8, 'e'), t(5, 10, 'e'), t(4, 7, 'e'),
];

/** The first thirds of G major on strings 3 and 2, low note then high note. */
export const THIRDS_G_STRINGS_3_2 = [
  [{ string: 3, fret: 0 }, { string: 2, fret: 0 }],
  [{ string: 3, fret: 2 }, { string: 2, fret: 1 }],
  [{ string: 3, fret: 4 }, { string: 2, fret: 3 }],
  [{ string: 3, fret: 5 }, { string: 2, fret: 5 }],
  [{ string: 3, fret: 7 }, { string: 2, fret: 7 }],
] as const;

/** String crossing, pattern A: string 3, fret 5 down, string 2, fret 5 up, four times. */
export const CROSSING_A: TabNote[] = [0, 1, 2, 3].flatMap(() => [t(3, 5, 'e'), t(2, 5, 'e')]);

/** The Irish Washerwoman: the pickup and bars 1 and 2 of the A part. */
export const WASHERWOMAN_START: TabNote[] = [
  t(2, 3, 'e'), t(2, 1, 'e'),
  t(2, 0, 'e'), t(3, 0, 'e'), t(3, 0, 'e'), t(4, 0, 'e'), t(3, 0, 'e'), t(3, 0, 'e'),
  t(2, 0, 'e'), t(3, 0, 'e'), t(2, 0, 'e'), t(2, 3, 'e'), t(2, 1, 'e'), t(2, 0, 'e'),
];

// ── 1. G major in first position ────────────────────────────────────────────────────────────────

const firstPosition: TeacherLesson = {
  id: 'major-scale-first-position',
  title: 'G major in first position',
  teaches: 'G major in first position runs two octaves, string 6, fret 3 to string 1, fret 3, picked strictly down-up.',
  minutes: 5,
  skill: 'teacher:dev:major-scale-first-position',
  steps: [
    {
      type: 'card',
      title: 'The ruler behind everything',
      body: 'The {t:major-scale} is the ruler behind everything you have played: its seven notes give you keys, chords and melodies. {k:G major} in first position runs from string 6, fret 3 ({n:G}) up two octaves to string 1, fret 3 ({n:G}), with a third {n:G}, the open string 3, in the middle.',
      figure: { kind: 'fretboard', frets: [0, 4], root: 'G', labels: 'degree', derive: { scale: 'major', tonic: 'G' }, caption: '{k:G major}, frets 0 to 4, by degree. The three Gs are marked R, the root.' },
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap all three {n:G} notes of the two-octave run, frets 0 to 4.',
      find: { note: 'G' },
      mode: 'all',
      octave: 'any',
      frets: [0, 4],
      explain: 'String 6, fret 3, the open string 3 and string 1, fret 3: low, middle and top of the run, an octave apart.',
      fact: 'ms-g-first-position',
    },
    {
      type: 'card',
      title: 'One sharp, one finger per fret',
      body: 'The key has one sharp: {n:F#} at string 4, fret 4 and again at string 1, fret 2. Everything else is natural. One finger per fret: fret 1 is finger 1, fret 2 finger 2, fret 3 finger 3, fret 4 finger 4. Here is the run up.',
      figure: { kind: 'tab', tempo: 60, notes: G_MAJOR_UP, caption: '{k:G major}, two octaves up, in eighth notes.' },
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap both {n:F#} notes of the run, on strings 4 to 1.',
      find: { note: 'F#' },
      mode: 'all',
      octave: 'any',
      frets: [0, 4],
      strings: [4, 3, 2, 1],
      explain: 'String 4, fret 4 and string 1, fret 2: the seventh note, a half step under each {n:G}. Finger 4 takes the first, finger 2 the second.',
      fact: 'ms-g-sharp',
    },
    {
      type: 'card',
      title: 'Strictly down-up',
      body: 'Pick strictly down-up, starting down, even when you cross strings. Fifteen notes up means the top {n:G} lands on a downstroke, and the way back down starts with an up. Never two downs in a row: that is what keeps fast lines even later.',
      tip: 'Small motions. The pick stays close to the strings when it crosses to the next one.',
    },
    {
      type: 'choice',
      prompt: 'You play the run up, strictly alternating and starting down. Which stroke plays the top {n:G}?',
      options: [
        { text: 'A downstroke', correct: true },
        { text: 'An upstroke', why: 'Down, up, down ... the odd notes are downs, and the top {n:G} is note 15.' },
        { text: 'Either, it does not matter', why: 'It matters: strict alternation means the stroke is always decided by the count.' },
      ],
      explain: 'Fifteen notes: odd ones down, even ones up. Note 15, the top {n:G}, is a downstroke, and the first note down from it is an up.',
      fact: 'ms-strict-alternation',
    },
    {
      type: 'play-phrase',
      prompt: 'Play {k:G major} up two octaves at 60 BPM, strictly down-up.',
      notes: G_MAJOR_UP,
      octave: 'exact',
      tempo: 60,
      explain: '{n:G} {n:A} {n:B} {n:C} {n:D} {n:E} {n:F#}, twice, and the top {n:G}. Watch the string changes: that is where alternation slips.',
      alternative: {
        type: 'order',
        prompt: 'Put the notes of {k:G major} in order, from {n:G}.',
        tiles: ['{n:G}', '{n:A}', '{n:B}', '{n:C}', '{n:D}', '{n:E}', '{n:F#}'],
        distractors: ['{n:F}'],
        explain: 'Whole, whole, half, whole, whole, whole, half: {n:G} {n:A} {n:B} {n:C} {n:D} {n:E} {n:F#}. The half steps land on {n:B}-{n:C} and {n:F#}-{n:G}.',
      },
    },
    techniqueTask({
      id: 'alternate-g',
      title: 'Alternate picking: G major',
      exercise: 'tech-alternate-scale-g',
      minutes: 5,
      body: 'Two octaves up and down in eighth notes, starting at 60 BPM. Climb the tempo ladder 4 BPM at a time, and only after two clean passes: every note even, no stroke repeated, no open string ringing into the next note.',
    }),
    {
      type: 'card',
      title: 'Every note has a number',
      body: 'In the key, each note has a number, its {t:degree}: {n:G} is 1, {n:A} 2, {n:B} 3, and so on up to {n:F#}, 7. Knowing that {n:B} is the 3 of {k:G major} is what lets you build its chords and aim a solo later in the course.',
    },
    {
      type: 'choice',
      prompt: 'Which degree is {n:B} in {k:G major}?',
      options: [{ text: '3', correct: true }, { text: '2' }, { text: '5' }, { text: '6' }],
      shuffle: false,
      explain: '{n:G} 1, {n:A} 2, {n:B} 3: the third note of the scale, and the third of the {c:G} chord.',
      fact: 'ms-degrees',
    },
    { generate: 'degree-in-key', params: { ask: 'degree', maxAccidentals: 1, degrees: [3, 5, 4, 2, 6, 7] } },
    {
      type: 'fretboard-name',
      prompt: 'The root (R) is {n:G} at string 6, fret 3. Which degree is string 4, fret 4?',
      position: { string: 4, fret: 4 },
      root: { string: 6, fret: 3 },
      ask: 'degree',
      spelling: 'any',
      options: ['7', '6', 'b7', '5'],
      explain: 'String 4, fret 4 is {n:F#}, the seventh note of {k:G major}, a half step under the {n:G} on the open string 3.',
      fact: 'ms-g-sharp',
    },
  ],
  facts: [
    { id: 'ms-g-first-position', front: '{k:G major} in first position, two octaves: where does it start and end?', back: 'String 6, fret 3 ({n:G}) to string 1, fret 3 ({n:G}), with the open string 3 ({n:G}) in the middle.' },
    { id: 'ms-g-sharp', front: 'Where is {n:F#} in the first-position run of {k:G major}?', back: 'String 4, fret 4 and string 1, fret 2: the seventh note, under each {n:G}.' },
    { id: 'ms-strict-alternation', front: 'What is strict alternate picking?', back: 'Down on every odd note, up on every even one, even when you cross strings: never two strokes the same way in a row.' },
    { id: 'ms-degrees', front: 'The degrees of {k:G major}?', back: '{n:G} 1, {n:A} 2, {n:B} 3, {n:C} 4, {n:D} 5, {n:E} 6, {n:F#} 7.' },
  ],
};

// ── 2. C major in five positions ────────────────────────────────────────────────────────────────

const fivePositions: TeacherLesson = {
  id: 'five-positions',
  title: 'C major in five positions',
  teaches: 'C major has five CAGED positions up the neck; the chord shape inside each one shows you where the roots are.',
  minutes: 5,
  skill: 'teacher:dev:five-positions',
  steps: [
    {
      type: 'card',
      title: 'Five positions, five shapes',
      body: 'Each CAGED chord shape has a scale position around it. {k:C major}: the C shape at frets 0 to 3, the A shape at frets 2 to 6, the G shape at frets 4 to 8, the E shape at frets 7 to 10 and the D shape at frets 9 to 13. Learn each one root to root, then join them.',
      figure: { kind: 'fretboard', frets: [0, 3], root: 'C', labels: 'degree', derive: { scale: 'major', tonic: 'C' }, caption: 'Position 1, the C shape: every note of {k:C major} in frets 0 to 3.' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each position of {k:C major} with its frets.',
      pairs: [
        { left: 'C shape', right: 'Frets 0 to 3' },
        { left: 'A shape', right: 'Frets 2 to 6' },
        { left: 'G shape', right: 'Frets 4 to 8' },
        { left: 'E shape', right: 'Frets 7 to 10' },
        { left: 'D shape', right: 'Frets 9 to 13' },
      ],
      explain: 'C, A, G, E, D, climbing the neck: the same order as CAGED, and each position starts a fret or two below where the last one ends.',
      fact: 'ms-c-positions',
    },
    {
      type: 'card',
      title: 'The chord inside shows the roots',
      body: 'Inside each position sits the {c:C} chord of that shape, and its roots are your landmarks. In the E shape, frets 7 to 10, the roots are string 6, fret 8, string 4, fret 10 and string 1, fret 8: exactly the roots of the E-shape barre {c:C} at fret 8.',
      figure: { kind: 'fretboard', frets: [7, 10], root: 'C', labels: 'degree', derive: { scale: 'major', tonic: 'C' }, caption: 'The E-shape position, frets 7 to 10. R marks the roots.' },
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap every {n:C} in the E-shape position, frets 7 to 10.',
      find: { note: 'C' },
      mode: 'all',
      octave: 'any',
      frets: [7, 10],
      explain: 'String 6, fret 8, string 4, fret 10 and string 1, fret 8: the three roots of the E-shape {c:C} chord. Start and end the position on them.',
      fact: 'ms-roots-inside',
    },
    {
      type: 'choice',
      prompt: 'Which chord shape sits inside the position at frets 9 to 13?',
      options: [
        { text: 'The D shape', correct: true },
        { text: 'The E shape', why: 'The E shape is the position below it, frets 7 to 10.' },
        { text: 'The C shape', why: 'The C shape is open position, frets 0 to 3, and again twelve frets up.' },
      ],
      explain: 'The D shape: its roots are string 4, fret 10 and string 2, fret 13, the D-shape {c:C} chord at fret 10.',
      fact: 'ms-c-positions',
    },
    playerTask({
      id: 'caged-scale-c',
      title: 'Position 1: the C shape',
      song: 'st-caged-scale',
      bars: [1, 6],
      tempo: 60,
      minutes: 5,
      body: 'One position per session. Today the C shape, bars 1 to 6, at 60 % (60 BPM): the scale root to root and back, then a short tune in the same place. Next session the A shape, bars 7 to 12; then G 13 to 18, E 19 to 24, D 25 to 30.',
    }),
    {
      type: 'card',
      title: 'Where the positions overlap',
      body: 'Neighbouring positions overlap: the top of one is the bottom of the next. The C shape ends at fret 3 and the A shape starts at fret 2; the G shape ends at fret 8 and the E shape starts at fret 7. The shared notes are your doors from one position to the next.',
    },
    {
      type: 'true-false',
      statement: 'The A-shape position (frets 2 to 6) and the G-shape position (frets 4 to 8) share frets 4 to 6.',
      answer: true,
      explain: 'The A shape reaches up to fret 6 and the G shape starts at fret 4, so frets 4, 5 and 6 belong to both: slide into one from the other there.',
    },
    toolTask({
      id: 'caged-scales',
      title: 'C major in Scales, by degree',
      tool: 'scales',
      params: ['c', 'major', 'caged-a'],
      minutes: 4,
      body: 'Open {k:C major} in the A shape with the labels set to degrees. Play it slowly and say the degree of each note. Then switch to the G, E and D shapes: the 1s are always where the chord\'s roots are.',
    }),
    {
      type: 'fretboard-name',
      prompt: 'In the A shape the root (R) is {n:C} at string 5, fret 3. Which degree is string 3, fret 4?',
      position: { string: 3, fret: 4 },
      root: { string: 5, fret: 3 },
      ask: 'degree',
      spelling: 'any',
      options: ['7', '6', 'b7', '1'],
      explain: 'String 3, fret 4 is {n:B}, the seventh of {k:C major}, a fret under the next root at string 3, fret 5.',
    },
    toolTask({
      id: 'caged-arcade',
      title: 'Arcade: build the shape from memory',
      tool: 'arcade',
      params: ['shape-builder', 'c-major', 'caged-e'],
      minutes: 4,
      body: 'Shape Builder in the Scale Arcade, {k:C major}, the E shape: rebuild the whole position from memory, one position at a time. Then pick the A shape, and the others as you learn them.',
    }),
    {
      type: 'fretboard-find',
      prompt: 'Tap both {n:C} notes in the A-shape position, frets 2 to 6.',
      find: { note: 'C' },
      mode: 'all',
      octave: 'any',
      frets: [2, 6],
      explain: 'String 5, fret 3 and string 3, fret 5: the roots of the A-shape {c:C} chord (x35553), an octave apart.',
      fact: 'ms-roots-inside',
    },
  ],
  facts: [
    { id: 'ms-c-positions', front: 'The five CAGED positions of {k:C major}?', back: 'C shape frets 0 to 3, A shape 2 to 6, G shape 4 to 8, E shape 7 to 10, D shape 9 to 13.' },
    { id: 'ms-roots-inside', front: 'How do you find the roots inside a scale position?', back: 'They are the roots of the chord shape that sits inside it: in the E shape of {k:C major}, string 6, fret 8, string 4, fret 10 and string 1, fret 8.' },
  ],
};

// ── 3. One melody, five places ──────────────────────────────────────────────────────────────────

const oneMelody: TeacherLesson = {
  id: 'one-melody-everywhere',
  title: 'One melody, five places',
  teaches: 'Knowing a position means playing music in it: the same tune, the same notes, in five places on the neck.',
  minutes: 5,
  skill: 'teacher:dev:one-melody-everywhere',
  steps: [
    {
      type: 'card',
      title: 'Same notes, new place',
      body: 'Knowing a position means you can play music in it, not just a scale. The study takes one original 8-bar tune and moves it through all five positions: the same notes in different places, with different fingerings. This is how you stop being stuck in one corner of the neck.',
      figure: { kind: 'tab', tempo: 72, notes: MELODY_C_SHAPE, caption: 'Bar 1 in the C shape: {n:E} {n:G} {n:E} {n:D} {n:C}.' },
    },
    {
      type: 'choice',
      prompt: 'From one position of the study to the next, what changes?',
      options: [
        { text: 'The frets and fingers, not the notes', correct: true },
        { text: 'The notes of the tune', why: 'The tune is played at the same pitch every time. Only where you play it changes.' },
        { text: 'The key', why: 'All five positions are {k:C major}. The key stays, the hand moves.' },
      ],
      explain: 'Same tune, same pitch, five places. Each position gives the notes to different strings and different fingers.',
      fact: 'ms-one-tune',
    },
    playerTask({
      id: 'melody-c-wait',
      title: 'The tune in the C shape, wait mode',
      song: 'st-caged-melody',
      mode: 'wait',
      bars: [1, 8],
      minutes: 4,
      body: 'Position 1, the C shape, bars 1 to 8, in wait mode: the music waits for each right note. Open strings are part of this shape; let them ring only as long as the note lasts.',
    }),
    {
      type: 'fretboard-name',
      prompt: 'In the C shape, the tune\'s fourth note is string 2, fret 3. Which note is it?',
      position: { string: 2, fret: 3 },
      ask: 'note',
      spelling: 'any',
      options: ['D', 'C', 'E', 'B'],
      explain: 'String 2, fret 3 is {n:D}, between the {n:E} on string 1 and the {n:C} at string 2, fret 1.',
    },
    playerTask({
      id: 'melody-c-time',
      title: 'The tune in the C shape, in time',
      song: 'st-caged-melody',
      bars: [1, 8],
      tempo: 75,
      minutes: 3,
      body: 'Same 8 bars, now in time at 75 % (72 BPM), while the teacher strums the open {c:C} shape under you.',
    }),
    {
      type: 'card',
      title: 'The same bar in the E shape',
      body: 'Now bar 1 again in the E shape, 7th position: {n:E} at string 3, fret 9, {n:G} at string 2, fret 8, {n:E} again, {n:D} at string 3, fret 7 and {n:C} at string 4, fret 10. The same five notes, a whole new place. The teacher plays the E-shape {c:C} (8-10-10-9-8-8) under it.',
      figure: { kind: 'tab', tempo: 72, notes: MELODY_E_SHAPE, caption: 'Bar 1 in the E shape: the same {n:E} {n:G} {n:E} {n:D} {n:C}.' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each note of bar 1 with its place in the E shape.',
      pairs: [
        { left: '{n:E}', right: 'String 3, fret 9' },
        { left: '{n:G}', right: 'String 2, fret 8' },
        { left: '{n:D}', right: 'String 3, fret 7' },
        { left: '{n:C}', right: 'String 4, fret 10' },
      ],
      explain: 'In the C shape these are the open string 1, string 1, fret 3, string 2, fret 3 and string 2, fret 1. In the E shape the same pitches sit on strings 4 to 2.',
      fact: 'ms-one-tune',
    },
    {
      type: 'play-phrase',
      prompt: 'Play bar 1 in the E shape: {n:E} {n:G} {n:E} {n:D} {n:C}.',
      notes: MELODY_E_SHAPE,
      octave: 'exact',
      tempo: 72,
      explain: 'Finger 3 on string 3, fret 9, finger 2 on string 2, fret 8, finger 1 on string 3, fret 7, finger 4 on string 4, fret 10. Same pitches as in open position.',
      alternative: {
        type: 'order',
        prompt: 'Put the notes of bar 1 in order.',
        tiles: ['{n:E}', '{n:G}', '{n:E}', '{n:D}', '{n:C}'],
        distractors: ['{n:F}'],
        explain: '{n:E} {n:G} {n:E} {n:D} {n:C}: up a third, back, then down by steps to the root.',
      },
    },
    playerTask({
      id: 'melody-next',
      title: 'The next position, every session',
      song: 'st-caged-melody',
      mode: 'wait',
      bars: [9, 16],
      minutes: 4,
      body: 'Next session, the A shape: bars 9 to 16 in wait mode, then in time. Then G (17 to 24), E (25 to 32) and D (33 to 40), one per session, until all five are done.',
    }),
    {
      type: 'fretboard-name',
      prompt: 'In the G shape, 5th position, the tune\'s {n:D} is on string 3. Which note is string 3, fret 7?',
      position: { string: 3, fret: 7 },
      ask: 'note',
      spelling: 'any',
      options: ['D', 'C', 'E', 'B'],
      explain: 'String 3, fret 7 is {n:D}: the same {n:D} as string 2, fret 3 in open position, and string 3, fret 7 in the E shape too.',
    },
    toolTask({
      id: 'name-the-notes',
      title: 'Fretboard: name the notes',
      tool: 'fretboard',
      params: ['drill', 'name-the-note'],
      minutes: 3,
      body: 'Name the note, frets 0 to 12. When a dot lights up in the position you are learning, say its name and then where the tune uses it. Knowing the names is what turns a position into a map.',
    }),
    {
      type: 'true-false',
      statement: 'The study plays its tune at the same pitch in all five positions.',
      answer: true,
      explain: 'The tune stays between {n:G} and {n:G} an octave up, a range every position holds: only the frets and fingers change.',
      fact: 'ms-one-tune',
    },
  ],
  facts: [
    { id: 'ms-one-tune', front: 'Why play one tune in all five positions?', back: 'The notes stay the same and only the frets and fingers change, so you can play music anywhere on the neck.' },
    { id: 'ms-e-shape-tune', front: '{n:E} {n:G} {n:D} {n:C} in the E shape of {k:C major}?', back: '{n:E} string 3, fret 9; {n:G} string 2, fret 8; {n:D} string 3, fret 7; {n:C} string 4, fret 10.' },
  ],
};

// ── 4. Scale sequences ──────────────────────────────────────────────────────────────────────────

const sequences: TeacherLesson = {
  id: 'scale-sequences',
  title: 'Scale sequences',
  teaches: 'Sequences turn a scale into music: in thirds 1-3, 2-4; in threes 1-2-3, 2-3-4; in fours 1-2-3-4, 2-3-4-5.',
  minutes: 5,
  skill: 'teacher:dev:scale-sequences',
  steps: [
    {
      type: 'card',
      title: 'Stop reciting the alphabet',
      body: 'Running a scale straight up and down is like reciting the alphabet. {t:scale-sequence|Sequences} turn it into music and train the hand to skip. In thirds you play 1-3, 2-4, 3-5. In {k:C major}, E shape, from the root: {n:C} {n:E}, {n:D} {n:F}, {n:E} {n:G}, {n:F} {n:A}.',
      figure: { kind: 'tab', tempo: 60, notes: THIRDS_E_SHAPE, caption: '{k:C major} in thirds, E shape, from string 6, fret 8.' },
    },
    {
      type: 'order',
      prompt: 'Put the start of {k:C major} in thirds in order.',
      tiles: ['{n:C}', '{n:E}', '{n:D}', '{n:F}', '{n:E}', '{n:G}'],
      distractors: ['{n:B}'],
      explain: '1-3, 2-4, 3-5: {n:C} {n:E}, {n:D} {n:F}, {n:E} {n:G}. Each pair skips one note, and each new pair starts a step higher.',
      fact: 'ms-thirds',
    },
    {
      type: 'card',
      title: 'Groups of three and four',
      body: 'In groups of three: 1-2-3, 2-3-4, 3-4-5, three notes up, then start again a step higher. In groups of four: 1-2-3-4, 2-3-4-5. The Scales screen lays any sequence out in any position, with a click.',
      figure: { kind: 'tab', tempo: 60, notes: THREES_E_SHAPE, caption: 'Groups of three: {n:C} {n:D} {n:E}, {n:D} {n:E} {n:F}, and on.' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete {k:C major} in groups of three.',
      text: '{n:C} {n:D} {n:E},  {n:D} {n:E} ___,  ___ {n:F} {n:G}',
      blanks: ['{n:F}', '{n:E}'],
      bank: ['{n:G}', '{n:A}'],
      explain: 'Each group is three scale notes up, and each starts one note higher than the last: {n:C} {n:D} {n:E}, {n:D} {n:E} {n:F}, {n:E} {n:F} {n:G}.',
      fact: 'ms-groups',
    },
    toolTask({
      id: 'scales-thirds',
      title: 'Scales: C major in thirds',
      tool: 'scales',
      params: ['c', 'major', 'caged-e'],
      minutes: 4,
      body: 'Open {k:C major} in the E shape, go to Practise it and choose In thirds. Play it with the click at 60 BPM, up and down, until it is smooth. Say the degrees: 1-3, 2-4, 3-5.',
    }),
    {
      type: 'choice',
      prompt: 'In thirds, what comes after 1-3, 2-4, 3-5?',
      options: [{ text: '4-6', correct: true }, { text: '5-7', why: 'That skips a pair. Each new pair starts just one step higher.' }, { text: '4-5', why: 'That is a step, not a third. A third skips one note.' }],
      shuffle: false,
      explain: 'Move both numbers up one: 3-5 becomes 4-6. In {k:C major} that is {n:F} {n:A}.',
      fact: 'ms-thirds',
    },
    toolTask({
      id: 'scales-groups',
      title: 'Scales: groups of three and four',
      tool: 'scales',
      params: ['c', 'major', 'caged-e'],
      minutes: 4,
      body: 'Same position, now Groups of three, then Groups of four, at 60 BPM. Groups of three make the accents fall in new places: play the first note of each group a touch louder and hear the line roll.',
    }),
    {
      type: 'card',
      title: 'Thirds at the same time',
      body: 'Thirds also sound great together: a {t:double-stop}. The thirds of {k:G major} on strings 3 and 2: the open {n:G} with the open {n:B}, then {n:A} with {n:C}, {n:B} with {n:D}, {n:C} with {n:E}, climbing the neck. Country, soul and Celtic players live on these.',
      figure: {
        kind: 'fretboard',
        frets: [0, 7],
        dots: [
          { string: 3, fret: 0, note: 'G' }, { string: 2, fret: 0, note: 'B' },
          { string: 3, fret: 2, note: 'A' }, { string: 2, fret: 1, note: 'C' },
          { string: 3, fret: 4, note: 'B' }, { string: 2, fret: 3, note: 'D' },
          { string: 3, fret: 5, note: 'C' }, { string: 2, fret: 5, note: 'E' },
          { string: 3, fret: 7, note: 'D' }, { string: 2, fret: 7, note: 'F#' },
        ],
        caption: 'The thirds of {k:G major} on strings 3 and 2, five pairs.',
      },
    },
    {
      type: 'fretboard-name',
      prompt: 'The root (R) is {n:A} at string 3, fret 2. What interval is string 2, fret 1 above it?',
      position: { string: 2, fret: 1 },
      root: { string: 3, fret: 2 },
      ask: 'interval',
      spelling: 'any',
      options: ['m3', 'M3', 'P4', 'M2'],
      explain: 'String 2, fret 1 is {n:C}: three half steps above {n:A}, a minor third. In a key, the thirds are major or minor depending on where you are.',
      fact: 'ms-double-stops',
    },
    techniqueTask({
      id: 'double-stops',
      title: 'Double stops in thirds',
      exercise: 'tech-double-stops',
      minutes: 4,
      body: 'The thirds of {k:G major} on strings 3 and 2, both notes together, moving up the neck to fret 12 at 60 BPM. Pick both strings in one stroke, or pluck them with thumb and finger. Both notes the same loudness.',
      tip: 'Do not squeeze while you slide between pairs. Light pressure on the way, firm on arrival.',
    }),
    toolTask({
      id: 'sequence-jam',
      title: 'Jam: sequences, then freedom',
      tool: 'progressions',
      params: ['pop-axis', 'c', 'jam'],
      minutes: 5,
      body: 'Set the band to 92 BPM: {c:C}, {c:G}, {c:Am}, {c:F}. For one minute improvise with sequences only, in the E shape: thirds, threes, fours. Then break out of them and let a tune come. You will hear the sequences turn up in your lines anyway.',
    }),
    {
      type: 'true-false',
      statement: 'In groups of four, the second group starts on the second note of the scale.',
      answer: true,
      explain: '1-2-3-4, then 2-3-4-5: each group starts one note higher than the last. In {k:C major}: {n:C} {n:D} {n:E} {n:F}, then {n:D} {n:E} {n:F} {n:G}.',
      fact: 'ms-groups',
    },
  ],
  facts: [
    { id: 'ms-thirds', front: 'A scale in thirds, by degree?', back: '1-3, 2-4, 3-5, 4-6 ...: each pair skips one note and starts a step higher. In {k:C major}: {n:C} {n:E}, {n:D} {n:F}, {n:E} {n:G}.' },
    { id: 'ms-groups', front: 'A scale in groups of three and of four?', back: 'Threes: 1-2-3, 2-3-4, 3-4-5. Fours: 1-2-3-4, 2-3-4-5. Each group starts one note higher.' },
    { id: 'ms-double-stops', front: 'The first thirds of {k:G major} on strings 3 and 2?', back: 'Open {n:G} and {n:B}; {n:A} and {n:C} (frets 2 and 1); {n:B} and {n:D} (frets 4 and 3).' },
  ],
};

// ── 5. Fiddle tunes ─────────────────────────────────────────────────────────────────────────────

const fiddleTunes: TeacherLesson = {
  id: 'fiddle-tunes',
  title: 'Fiddle tunes',
  teaches: 'Fiddle tunes are AABB, eight bars a part, in continuous eighths: down on the beat, up on the "and", always.',
  minutes: 5,
  skill: 'teacher:dev:fiddle-tunes',
  steps: [
    {
      type: 'card',
      title: 'The best picking workout there is',
      body: 'Fiddle tunes are the guitarist\'s best picking workout: continuous eighth notes, string crossings and a clear {t:aabb-form|AABB form}, eight bars a part, each part played twice. Pick down on the beat and up on the "and", always. Soldier\'s Joy is in {k:D major}, Turkey in the Straw in {k:G major}.',
      figure: { kind: 'rhythm', pattern: 'e e e e | e e e e', time: '2/4', tempo: 72, caption: 'Two bars of 2/4: down on every number, up on every "and".' },
    },
    {
      type: 'order',
      prompt: 'Put the parts of a fiddle tune in the order they are played.',
      tiles: ['A part', 'A part again', 'B part', 'B part again'],
      distractors: ['C part'],
      explain: 'AABB: the A part twice, then the B part twice, eight bars each. Then the whole tune goes round again.',
      fact: 'ms-aabb',
    },
    {
      type: 'card',
      title: 'Crossing strings both ways',
      body: 'The hard part is crossing strings without breaking the down-up. Sometimes you go down on the lower string and up on the higher one; sometimes up on the lower and down on the higher. Each makes the pick escape a different way, and a fiddle tune needs both.',
      tip: 'Keep the wrist loose. A locked wrist catches the wrong string.',
    },
    {
      type: 'choice',
      prompt: 'In a fiddle tune in eighth notes, which stroke plays every "and"?',
      options: [
        { text: 'An upstroke, always', correct: true },
        { text: 'A downstroke when you cross strings', why: 'Crossing does not change the rule. The "and" is up, every time.' },
        { text: 'Whichever is easier', why: 'Then the count drifts. Down on the beat and up on the "and" keeps you locked to the time.' },
      ],
      explain: 'Down on every beat, up on every "and", even across strings. The hand keeps moving like a pendulum, and the beat stays in the hand.',
      fact: 'ms-fiddle-picking',
    },
    techniqueTask({
      id: 'string-crossing',
      title: 'String crossing both ways',
      exercise: 'tech-string-crossing',
      minutes: 4,
      body: 'At 60 BPM. Pattern A: string 3, fret 5 ({n:C}) down, string 2, fret 5 ({n:E}) up. Pattern B: the same two notes, up then down. A bar each, then strings 2 and 1, and 4 and 3. If one pattern is weaker, give it two bars.',
    }),
    {
      type: 'play-phrase',
      prompt: 'Play pattern A four times: string 3, fret 5 down, string 2, fret 5 up.',
      notes: CROSSING_A,
      octave: 'exact',
      tempo: 60,
      explain: '{n:C} on the beat with a downstroke, {n:E} on the "and" with an upstroke: the pick escapes upward between the strings.',
      alternative: {
        type: 'tap-rhythm',
        prompt: 'Tap the pattern: eight even notes, two for every click.',
        rhythm: { pattern: 'e e e e e e e e' },
        tempo: 60,
        show: 'both',
        explain: 'Down on the click, up between: eight even eighth notes. Your picking hand moves the same way, whichever string it is on.',
      },
    },
    playerTask({
      id: 'soldiers-joy-wait',
      title: 'Soldier\'s Joy, part by part',
      song: 'soldiers-joy',
      mode: 'wait',
      minutes: 5,
      body: 'Wait mode: the A part first, then the B part, until you can find every note. Pick strictly down-up from the start, even slowly: the stroke pattern is half of the tune.',
      fallback: {
        tool: 'player',
        params: ['rondo-alla-turca', 'wait'],
        title: 'Continuous notes: Rondo alla Turca',
        body: 'Soldier\'s Joy is not in the Songs library yet. Meanwhile, take another 2/4 tune of continuous notes: the Rondo alla Turca theme in wait mode, every note strictly down-up, even across strings.',
      },
    }),
    {
      type: 'true-false',
      statement: 'Soldier\'s Joy and Turkey in the Straw both have eight bars in each part.',
      answer: true,
      explain: 'Both are AABB tunes with eight-bar parts: 32 bars once round, with the repeats.',
      fact: 'ms-aabb',
    },
    playerTask({
      id: 'soldiers-joy-time',
      title: 'Soldier\'s Joy, the whole tune',
      song: 'soldiers-joy',
      tempo: 82,
      minutes: 5,
      body: 'The whole tune in time, AABB, at 82 % (about 72 BPM), then 100 % (88 BPM). If a string crossing trips you, loop those two bars slowly and put them back.',
      fallback: {
        tool: 'player',
        params: ['rondo-alla-turca', 't60'],
        title: 'Rondo alla Turca, in time',
        body: 'Soldier\'s Joy is not in the Songs library yet. Play the Rondo alla Turca theme in time at 60 % (about 65 BPM), strictly down-up all the way, and loop any two bars that trip you.',
      },
    }),
    {
      type: 'match-pairs',
      prompt: 'Match each tune with its key.',
      pairs: [
        { left: 'Soldier\'s Joy', right: '{k:D major}' },
        { left: 'Turkey in the Straw', right: '{k:G major}' },
        { left: 'Every fiddle tune', right: 'AABB, eight bars a part' },
      ],
      explain: 'Soldier\'s Joy sits in {k:D major} with {c:D}, {c:A} and {c:G}; Turkey in the Straw in {k:G major} with {c:G}, {c:C} and {c:D}. Both are AABB.',
    },
    playerTask({
      id: 'turkey-in-the-straw',
      title: 'Turkey in the Straw',
      song: 'turkey-in-the-straw',
      tempo: 82,
      minutes: 5,
      body: 'The same way: wait mode for each part, then in time at 82 % (about 72 BPM), then 100 % (88 BPM), with the app playing the backup chords {c:G}, {c:C} and {c:D}. Down on the beat, up on the "and".',
      fallback: {
        tool: 'player',
        params: ['st-bluegrass-g-run', 't60'],
        title: 'The G run, strictly down-up',
        body: 'Turkey in the Straw is not in the Songs library yet. Take its key and chords, {c:G}, {c:C} and {c:D}, in the bluegrass G-run study at 60 % (72 BPM): boom-chick backup, and the G run picked strictly down-up.',
      },
    }),
    {
      type: 'choice',
      prompt: 'Your line crosses from string 3 to string 2 on the "and". Which stroke plays it?',
      options: [
        { text: 'Up: the "and" is always up', correct: true },
        { text: 'Down, to cross more easily', why: 'Two downs in a row break the pendulum, and the next beat lands late.' },
        { text: 'It depends on the tune', why: 'Not in strict alternation: the count decides the stroke, never the string.' },
      ],
      explain: 'The count decides: "and" means up. Practise the crossings both ways and they stop being a problem.',
      fact: 'ms-fiddle-picking',
    },
  ],
  facts: [
    { id: 'ms-aabb', front: 'What is AABB form in a fiddle tune?', back: 'An eight-bar A part played twice, then an eight-bar B part played twice.' },
    { id: 'ms-fiddle-picking', front: 'How do you pick a fiddle tune in eighth notes?', back: 'Down on every beat, up on every "and", always, even when you cross strings.' },
    { id: 'ms-fiddle-keys', front: 'The keys of Soldier\'s Joy and Turkey in the Straw?', back: 'Soldier\'s Joy: {k:D major}. Turkey in the Straw: {k:G major}.' },
  ],
};

// ── 6. Jigs in 6/8 ──────────────────────────────────────────────────────────────────────────────

const jigs: TeacherLesson = {
  id: 'jig-time',
  title: 'Jigs in 6/8',
  teaches: 'A jig is 6/8, two beats of three eighths: pick each group down-up-down, or alternate down-up-down, up-down-up.',
  minutes: 5,
  skill: 'teacher:dev:jig-time',
  steps: [
    {
      type: 'card',
      title: 'Two beats of three',
      body: 'A {t:jig} is in 6/8: two beats per bar, each made of three eighth notes. Count "1 2 3 4 5 6" and lean on 1 and 4. Give the first note of each group a little more weight and you get the lilt that makes people dance.',
      figure: { kind: 'rhythm', pattern: 'e e e e e e', time: '6/8', tempo: 90, caption: 'One bar of 6/8: two groups of three, the weight on 1 and 4.' },
    },
    {
      type: 'choice',
      prompt: 'How many beats does a bar of 6/8 have in a jig?',
      options: [
        { text: 'Two, each of three eighth notes', correct: true },
        { text: 'Six, one per eighth note', why: 'Six eighths fill the bar, but the foot taps twice: on 1 and on 4.' },
        { text: 'Three, like a waltz', why: 'A waltz is 3/4, three beats of two eighths. 6/8 is two beats of three.' },
      ],
      explain: 'Two dotted-quarter beats, each split in three. That is why a jig rolls where a waltz steps.',
      fact: 'ms-jig-meter',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap two bars of 6/8 eighth notes, leaning a little on 1 and 4.',
      rhythm: { pattern: 'e e e e e e | e e e e e e', time: '6/8' },
      tempo: 90,
      show: 'both',
      explain: 'Twelve even taps in two groups of three per bar. The click is at 60 dotted quarters a minute, so each eighth lasts a third of a second.',
    },
    toolTask({
      id: 'rhythm-six-eight',
      title: 'Rhythm: six-eight time',
      tool: 'rhythm',
      params: ['read', '14'],
      minutes: 3,
      body: 'Reading level 14, Six-eight time: tap the rhythms you read in two groups of three, with the weight on 1 and 4. Count out loud. When a bar goes wrong, catch the next 1 and carry on.',
    }),
    {
      type: 'card',
      title: 'Two ways to pick a jig',
      body: 'Option one: down-up-down on each group, so every beat starts with a down. Option two, strict alternation: down-up-down, up-down-up, so the second beat starts with an up. The first is easier at first; the second keeps the hand moving evenly at speed. Here is bar 1 of The Irish Washerwoman.',
      figure: { kind: 'tab', tempo: 90, time: '6/8', notes: WASHERWOMAN_START.slice(2, 8), caption: 'Bar 1 of the A part: {n:B} {n:G} {n:G}, {n:D} {n:G} {n:G}.' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each way of picking with its strokes for one bar.',
      pairs: [
        { left: 'Option one', right: 'D U D, D U D' },
        { left: 'Option two', right: 'D U D, U D U' },
        { left: 'Notes 1 and 4', right: 'A little more weight' },
      ],
      explain: 'Option one restarts every beat with a down; option two never breaks the alternation. Either way, beats 1 and 4 get the lean.',
      fact: 'ms-jig-picking',
    },
    {
      type: 'play-phrase',
      prompt: 'Play the pickup and the first two bars of The Irish Washerwoman.',
      notes: WASHERWOMAN_START,
      octave: 'exact',
      tempo: 90,
      explain: 'Pickup {n:D} {n:C} on string 2, then {n:B} {n:G} {n:G}, {n:D} {n:G} {n:G}, {n:B} {n:G} {n:B}, {n:D} {n:C} {n:B}. Open strings do most of the work in the A part.',
      alternative: {
        type: 'order',
        prompt: 'Put the notes of bar 1 of the A part in order.',
        tiles: ['{n:B}', '{n:G}', '{n:G}', '{n:D}', '{n:G}', '{n:G}'],
        distractors: ['{n:A}'],
        explain: 'Bar 1: the open {n:B} on string 2, then {n:G} {n:G} on the open string 3, {n:D} on the open string 4, then {n:G} {n:G} again.',
      },
    },
    playerTask({
      id: 'washerwoman-a',
      title: 'The Irish Washerwoman, A part',
      song: 'irish-washerwoman',
      bars: [1, 10],
      tempo: 65,
      minutes: 5,
      body: 'Loop the A part, bars 1 to 10 with the pickup and both endings, at 65 % (60 BPM, counting dotted quarters). Choose your picking, option one or two, and keep it the whole way.',
    }),
    {
      type: 'true-false',
      statement: 'With strict alternation, the second group of three in a bar starts with an upstroke.',
      answer: true,
      explain: 'Down-up-down uses three strokes, so the next stroke is up: up-down-up. Two bars later you are back where you started.',
      fact: 'ms-jig-picking',
    },
    playerTask({
      id: 'washerwoman-b',
      title: 'The Irish Washerwoman, B part',
      song: 'irish-washerwoman',
      bars: [11, 18],
      tempo: 65,
      minutes: 5,
      body: 'Now the B part, bars 11 to 18, at 65 % (60 BPM). It moves to fifth position for the high notes: finger 1 on fret 5, 3 on fret 7, 4 on fret 8. Then the whole tune, AABB, at 83 % (76 BPM) and 100 % (92 BPM).',
    }),
    {
      type: 'fretboard-name',
      prompt: 'The B part opens on string 2, fret 8 in fifth position. Which note is it?',
      position: { string: 2, fret: 8 },
      ask: 'note',
      spelling: 'any',
      options: ['G', 'F#', 'A', 'E'],
      explain: 'String 2, fret 8 is {n:G}, an octave above the open string 3. Finger 4 takes it; finger 3 takes the {n:D} at string 3, fret 7 beside it.',
    },
    playerTask({
      id: 'haste-to-the-wedding',
      title: 'A second jig: Haste to the Wedding',
      song: 'haste-to-the-wedding',
      mode: 'wait',
      minutes: 5,
      body: 'A second jig, in {k:D major}, in wait mode: the A part, then the B part. Same picking choice as before, same lean on 1 and 4.',
      fallback: {
        tool: 'player',
        params: ['irish-washerwoman'],
        title: 'The Irish Washerwoman, option two',
        body: 'Haste to the Wedding is not in the Songs library yet. Play The Irish Washerwoman again at 100 % (92 BPM), this time with option two, strict alternation: down-up-down, up-down-up, all the way through.',
      },
    }),
    {
      type: 'choice',
      prompt: 'Which notes of a jig bar get a little more weight?',
      options: [
        { text: 'The first of each group of three', correct: true },
        { text: 'Every other note', why: 'That turns 6/8 into three groups of two, a different feel.' },
        { text: 'The last note of the bar', why: 'The lean is on 1 and 4, the starts of the two beats.' },
      ],
      explain: 'Notes 1 and 4, the first of each group. That small lean is the lilt of a jig.',
      fact: 'ms-jig-meter',
    },
  ],
  facts: [
    { id: 'ms-jig-meter', front: 'How does a jig in 6/8 count?', back: 'Two beats a bar, each three eighth notes: "1 2 3 4 5 6", with a little weight on 1 and 4.' },
    { id: 'ms-jig-picking', front: 'Two ways to pick a jig?', back: 'Down-up-down on every group, or strict alternation: down-up-down, up-down-up.' },
  ],
};

/** Unit 9 of Dev's course. */
const unit: TeacherUnit = {
  id: 'dev-major-scale',
  title: 'The major scale, everywhere',
  theme: 'scales',
  description: 'G major in first position, C major in five positions, sequences and double stops, then fiddle tunes and a jig.',
  lessons: [firstPosition, fivePositions, oneMelody, sequences, fiddleTunes, jigs],
  checkpoint: { sample: 8, maxMistakes: 2 },
  glossary: [
    { id: 'scale-sequence', term: 'sequence', definition: 'A scale played in a repeating pattern, such as thirds (1-3, 2-4 ...) or groups of three (1-2-3, 2-3-4 ...).' },
    { id: 'double-stop', term: 'double stop', definition: 'Two notes played at the same time on neighbouring strings, often a third or a sixth apart.' },
    { id: 'aabb-form', term: 'AABB form', definition: 'A tune of two parts, A and B, each usually eight bars, each played twice: the shape of most fiddle tunes.' },
    { id: 'jig', term: 'jig', definition: 'A lively dance tune in 6/8: two beats a bar, each split into three eighth notes.' },
  ],
};

export default unit;
