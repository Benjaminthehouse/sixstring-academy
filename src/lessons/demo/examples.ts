/**
 * One example of every exercise type and every figure kind. They are the examples printed in the
 * authoring guide (API.md quotes the text between the `<example:...>` markers, and a test keeps the
 * two identical), and the lesson gallery can render them. All of them pass `exerciseProblems`.
 */
import type { Exercise, ExerciseType, Figure, FigureKind } from '../types';

/** One valid exercise per type. */
export const EXERCISE_EXAMPLES: { [T in ExerciseType]: Extract<Exercise, { type: T }> } = {
  // <example:choice>
  choice: {
    type: 'choice',
    prompt: 'Which note is the fifth of {c:C}?',
    options: [
      { text: '{n:G}', correct: true },
      { text: '{n:E}', why: '{n:E} is the third of {c:C}.' },
      { text: '{n:F}' },
      { text: '{n:A}' },
    ],
    explain: '{c:C} is {n:C}, {n:E} and {n:G}: root, third and fifth.',
  },
  // </example:choice>
  // <example:true-false>
  'true-false': {
    type: 'true-false',
    statement: 'A {t:capo} at fret 2 raises every open string by a whole step.',
    answer: true,
    explain: 'Each fret is a half step, so two frets raise every string by a whole step.',
  },
  // </example:true-false>
  // <example:match-pairs>
  'match-pairs': {
    type: 'match-pairs',
    prompt: 'Match each chord with its notes.',
    pairs: [
      { left: '{c:C}', right: '{n:C} {n:E} {n:G}' },
      { left: '{c:G}', right: '{n:G} {n:B} {n:D}' },
      { left: '{c:Am}', right: '{n:A} {n:C} {n:E}' },
    ],
    explain: 'A triad takes every other letter name from its root: root, third, fifth.',
  },
  // </example:match-pairs>
  // <example:order>
  order: {
    type: 'order',
    prompt: 'Put the first four sharps in the order they appear in a key signature.',
    tiles: ['{n:F#}', '{n:C#}', '{n:G#}', '{n:D#}'],
    distractors: ['{n:B#}'],
    explain: 'Sharps always arrive in the order F C G D A E B, each a fifth above the last.',
  },
  // </example:order>
  // <example:fill-blanks>
  'fill-blanks': {
    type: 'fill-blanks',
    prompt: 'Complete the {n:A} minor scale.',
    text: '{n:A}  {n:B}  ___  {n:D}  {n:E}  ___  {n:G}',
    blanks: ['{n:C}', '{n:F}'],
    bank: ['{n:C#}', '{n:F#}'],
    explain: '{n:A} natural minor has no sharps or flats: A B C D E F G.',
  },
  // </example:fill-blanks>
  // <example:type-answer>
  'type-answer': {
    type: 'type-answer',
    prompt: 'Which note is sharp in the key signature of {k:G major}?',
    // A key-signature question: the NAME matters, so G flat is not accepted for F sharp.
    answer: { kind: 'note', value: 'F#', spelling: 'exact' },
    input: 'keypad',
    explain: '{k:G major} has one sharp, {n:F#}: the seventh note of its scale.',
  },
  // </example:type-answer>
  // <example:listen-choice>
  'listen-choice': {
    type: 'listen-choice',
    prompt: 'Is this chord major or minor?',
    sound: { kind: 'chord', chord: 'Am', voicing: 'close', octave: 3 },
    options: [{ text: 'Major' }, { text: 'Minor', correct: true }],
    shuffle: false,
    explain: 'That was {c:Am}: its third, {n:C}, is a minor third above the root, which gives the darker sound.',
  },
  // </example:listen-choice>
  // <example:tap-rhythm>
  'tap-rhythm': {
    type: 'tap-rhythm',
    prompt: 'Tap this rhythm along with the click.',
    rhythm: { pattern: 'q e e q q' },
    tempo: 80,
    show: 'both',
    explain: 'Count 1, 2 &, 3, 4: the two eighth notes share beat 2.',
  },
  // </example:tap-rhythm>
  // <example:fretboard-find>
  'fretboard-find': {
    type: 'fretboard-find',
    prompt: 'Tap every {n:E} from the open strings to fret 5.',
    find: { note: 'E' },
    mode: 'all',
    // Any octave counts here; write find: { note: 'E4' } with octave: 'exact' to ask for one pitch.
    octave: 'any',
    frets: [0, 5],
    explain: 'There are four: the two open {n:E} strings, string 4 at fret 2 and string 2 at fret 5.',
  },
  // </example:fretboard-find>
  // <example:fretboard-name>
  'fretboard-name': {
    type: 'fretboard-name',
    prompt: 'The root (R) is {n:A}. What interval is the other note above it?',
    position: { string: 5, fret: 7 },
    root: { string: 6, fret: 5 },
    ask: 'interval',
    spelling: 'any',
    options: ['P5', 'P4', 'M3', 'm6'],
    explain: 'String 5, fret 7 is {n:E}, seven half steps above {n:A}: a perfect fifth. This two-fret shape is a power chord.',
  },
  // </example:fretboard-name>
  // <example:chord-build>
  'chord-build': {
    type: 'chord-build',
    task: 'fingers',
    chord: 'Am',
    frets: 'x02210',
    accept: 'any-voicing',
    prompt: 'Build {c:Am} on the fretboard.',
    explain: '{c:Am} is {n:A}, {n:C} and {n:E}: fret 2 on strings 4 and 3, fret 1 on string 2, and the open {n:A} and {n:E} strings.',
  },
  // </example:chord-build>
  // <example:staff-read>
  'staff-read': {
    type: 'staff-read',
    prompt: 'Which note is this?',
    note: 'D4',
    options: ['D', 'B', 'F', 'C'],
    explain: '{n:D} sits on the fourth line. Lines from the bottom: E G B D F.',
  },
  // </example:staff-read>
  // <example:staff-place>
  'staff-place': {
    type: 'staff-place',
    prompt: 'Put {n:F#} on the staff. Any octave will do.',
    note: 'F#',
    octave: 'any',
    explain: 'F lives in the first space and on the top line; the sharp sign goes just before the note head.',
  },
  // </example:staff-place>
  // <example:play-note>
  'play-note': {
    type: 'play-note',
    prompt: 'Play {n:G}: string 6, fret 3.',
    note: 'G2',
    octave: 'exact',
    where: { string: 6, fret: 3 },
    explain: 'Three frets above the open {n:E} string: {n:F}, {n:F#}, {n:G}.',
    alternative: {
      type: 'fretboard-find',
      prompt: 'Tap {n:G} on string 6.',
      find: { note: 'G2' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 5],
      explain: 'String 6, fret 3 is {n:G}.',
    },
  },
  // </example:play-note>
  // <example:play-chord>
  'play-chord': {
    type: 'play-chord',
    prompt: 'Strum {c:G} once, slowly.',
    chord: 'G',
    explain: 'All six strings ring in {c:G}. If the low string buzzes, move your finger closer to fret 3.',
    alternative: { generate: 'chord-shape', params: { chords: ['G'] } },
  },
  // </example:play-chord>
  // <example:play-phrase>
  'play-phrase': {
    type: 'play-phrase',
    prompt: 'Play the first three notes of {n:C} major: {n:C}, {n:D}, {n:E}.',
    notes: [
      { string: 5, fret: 3, duration: 'q' },
      { string: 4, fret: 0, duration: 'q' },
      { string: 4, fret: 2, duration: 'h' },
    ],
    octave: 'exact',
    tempo: 70,
    explain: '{n:C} at fret 3 of string 5, then the open 4th string, {n:D}, and {n:E} at its fret 2.',
    alternative: {
      type: 'order',
      prompt: 'Put the first three notes of {n:C} major in order.',
      tiles: ['{n:C}', '{n:D}', '{n:E}'],
      distractors: ['{n:Eb}'],
      explain: 'The {n:C} major scale starts {n:C}, {n:D}, {n:E}: two whole steps.',
    },
  },
  // </example:play-phrase>
  // <example:flashcard>
  flashcard: {
    type: 'flashcard',
    front: 'What is the relative minor of {k:C major}?',
    back: '{k:A minor}: it starts on the sixth note of the {n:C} major scale.',
    backFigure: { kind: 'circle', key: 'A minor', highlight: ['C major'] },
  },
  // </example:flashcard>
};

/** One valid figure per kind. */
export const FIGURE_EXAMPLES: { [K in FigureKind]: Extract<Figure, { kind: K }> } = {
  // <example:figure-fretboard>
  fretboard: {
    kind: 'fretboard',
    frets: [5, 8],
    root: 'A',
    labels: 'degree',
    dots: [
      { string: 6, fret: 5, note: 'A', degree: '1' },
      { string: 6, fret: 8, note: 'C', degree: 'b3' },
      { string: 5, fret: 5, note: 'D', degree: '4' },
      { string: 5, fret: 7, note: 'E', degree: '5', finger: 3 },
    ],
    caption: 'The start of {n:A} minor pentatonic, box 1.',
  },
  // </example:figure-fretboard>
  // <example:figure-chord>
  chord: { kind: 'chord', symbol: 'C', frets: 'x32010', fingers: 'x32010' },
  // </example:figure-chord>
  // <example:figure-staff>
  staff: { kind: 'staff', key: 'G major', notes: ['G3', 'A3', 'B3', { note: 'D4', duration: 'h', label: 'D' }], time: '4/4' },
  // </example:figure-staff>
  // <example:figure-keyboard>
  keyboard: { kind: 'keyboard', keys: ['C4', 'E4', { note: 'G4', label: '5th', role: 'fifth' }], from: 'C4', to: 'B4' },
  // </example:figure-keyboard>
  // <example:figure-circle>
  circle: { kind: 'circle', key: 'G major', highlight: ['C major', 'D major', 'E minor'], show: 'both' },
  // </example:figure-circle>
  // <example:figure-rhythm>
  rhythm: { kind: 'rhythm', pattern: 'q e e h | q. e q qr', time: '4/4', tempo: 90 },
  // </example:figure-rhythm>
  // <example:figure-tab>
  tab: {
    kind: 'tab',
    tempo: 80,
    notes: [
      { string: 6, fret: 0, duration: 'q' },
      { string: 6, fret: 3, duration: 'q' },
      { rest: true, duration: 'q' },
      { string: 5, fret: 2, duration: 'q' },
    ],
  },
  // </example:figure-tab>
  // <example:figure-audio>
  audio: { kind: 'audio', sound: { kind: 'strum', chord: 'Em', pattern: 'D-DU-UDU', tempo: 80 }, label: 'Hear the strum' },
  // </example:figure-audio>
};
