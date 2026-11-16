/**
 * Theory Path, unit 15: Key signatures and the circle of fifths. Written from the syllabus entries
 * in `src/content/plan/theory-path.json` (unit `circle-of-fifths`), one lesson per entry, in order:
 * each lesson opens with its "on the guitar" picture, asks the planned exercises, ends with the
 * planned drills, and turns every planned fact into a review card.
 *
 * `circle-of-fifths.test.ts` cross-checks every key signature, count, key name, enharmonic pair,
 * neighbour key, I-IV-V set, fret and listening phrase against the theory and guitar engines.
 *
 * Notes for readers of the code:
 * - The `key-signature` drill draws sharp and flat keys together (it has no "sharps only" pool),
 *   so the first three lessons, which come before the flat keys are taught, keep it to the
 *   signatures of one accidental (C, G and F major, all met in the first lesson). The sharp keys
 *   are drilled there by authored questions and by `fifths-order` with the order of sharps.
 * - A staff figure cannot circle a sharp or draw an arrow: the captions point at the last sharp
 *   and the second-to-last flat in words.
 * - `teaches` is shown as plain text on the map, so it carries no music symbols.
 */
import type { Lesson, TabNote, Unit } from '@/lessons';

const U = 'circle-of-fifths';

/** The key-signature melody: G F# E on string 1, then the same an octave lower on strings 3 and 4. */
const G_MELODY: TabNote[] = [
  { string: 1, fret: 3, duration: 'q' },
  { string: 1, fret: 2, duration: 'q' },
  { string: 1, fret: 0, duration: 'h' },
  { string: 3, fret: 0, duration: 'q' },
  { string: 4, fret: 4, duration: 'q' },
  { string: 4, fret: 2, duration: 'h' },
];

/** A scale phrase from G with its 7th as F (the notes of C major), then as F# (G major). */
const phraseFromG = (seventhFret: number): TabNote[] => [
  { string: 3, fret: 0, duration: 'e' },
  { string: 3, fret: 2, duration: 'e' },
  { string: 2, fret: 0, duration: 'e' },
  { string: 2, fret: 1, duration: 'e' },
  { string: 2, fret: 3, duration: 'e' },
  { string: 1, fret: 0, duration: 'e' },
  { string: 1, fret: seventhFret, duration: 'e' },
  { string: 1, fret: 3, duration: 'q.' },
];
/** The listening question of "Neighbours on the circle": first with F, then with F#. */
const NEIGHBOUR_PHRASES: TabNote[] = [...phraseFromG(1), { rest: true, duration: 'h' }, ...phraseFromG(2)];

const keySignatures: Lesson = {
  id: 'key-signatures',
  title: 'What a key signature is',
  teaches: 'A key signature lists the key\'s sharps or flats once per line, and they apply to every note with that letter.',
  minutes: 3,
  skill: `theory:${U}:key-signatures`,
  steps: [
    {
      type: 'card',
      title: 'Sharps written once',
      body: 'A {t:key-signature} is the group of sharps or flats written at the start of every staff line, just after the clef. {k:G major} has one sharp, {n:F#}, so its signature is a sharp on the top line, the F line.',
      figure: {
        kind: 'staff',
        key: 'G major',
        time: '4/4',
        notes: [
          { note: 'G4', duration: 'q' },
          { note: 'F#4', duration: 'q' },
          { note: 'E4', duration: 'h' },
          { note: 'G3', duration: 'q' },
          { note: 'F#3', duration: 'q' },
          { note: 'E3', duration: 'h' },
        ],
        caption: 'No sign beside either F: the signature makes both of them {n:F#}.',
      },
    },
    {
      type: 'staff-read',
      prompt: 'The signature has one sharp, {n:F#}. Which note is this?',
      note: 'F#3',
      key: 'G major',
      options: ['F#', 'F', 'E', 'G'],
      explain: 'The bottom space is F, and the sharp in the signature turns every F into {n:F#}. On the guitar it is string 4, fret 4.',
      fact: 'circle-signature-meaning',
    },
    {
      type: 'card',
      title: 'Every F, in every octave',
      body: 'The sharp sits on one line, but it changes **every** F in the piece, high or low: string 1 at fret 2 and string 4 at fret 4 alike. A {t:natural-sign} beside a note cancels it, for the rest of that bar.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: G_MELODY, tempo: 80 }, label: 'Hear the melody' },
    },
    {
      type: 'true-false',
      statement: 'A sharp in the key signature only affects the notes on that exact line.',
      answer: false,
      explain: 'It affects every note with that letter, in every octave. In {k:G major} the sharp sits on the top line, yet the F in the bottom space is {n:F#} too.',
      fact: 'circle-signature-every-octave',
    },
    {
      type: 'fretboard-find',
      prompt: 'In {k:G major} every F is {n:F#}. Tap every {n:F#} from the open strings to fret 4.',
      find: { note: 'F#' },
      mode: 'all',
      octave: 'any',
      frets: [0, 4],
      explain: 'There are three: string 6 at fret 2, string 4 at fret 4 and string 1 at fret 2. In {k:G major} you play every one of them sharp.',
      fact: 'circle-signature-every-octave',
    },
    {
      type: 'card',
      title: 'Flats, or nothing at all',
      body: 'A signature holds sharps **or** flats, never both. {k:F major} has one flat, {n:Bb}, on the middle line, so every B is played {n:Bb}. {k:C major} has no sharps or flats at all: its staff starts bare.',
      figure: { kind: 'staff', key: 'F major', notes: [{ note: 'Bb3', duration: 'h' }], caption: 'One flat, {n:Bb}: the signature of {k:F major}.' },
    },
    {
      type: 'choice',
      prompt: 'How many sharps or flats does {k:C major} have?',
      options: [
        { text: 'None', correct: true },
        { text: '1 sharp', why: 'One sharp, {n:F#}, is {k:G major}.' },
        { text: '1 flat', why: 'One flat, {n:Bb}, is {k:F major}.' },
        { text: '2 sharps', why: 'Two sharps belong to a key further from C.' },
      ],
      shuffle: false,
      explain: '{k:C major} uses only the natural notes, C D E F G A B, so its staff has no key signature at all.',
      fact: 'circle-c-major-none',
    },
    {
      type: 'staff-read',
      prompt: 'This piece is in {k:F major}. Which note is this?',
      note: 'Bb3',
      key: 'F major',
      options: ['Bb', 'B', 'A', 'C'],
      explain: 'The middle line is B, and the flat in the signature makes it {n:Bb}. On the guitar: string 3, fret 3.',
    },
    { generate: 'key-signature', params: { ask: 'count', maxAccidentals: 1 } },
    { generate: 'key-signature', params: { ask: 'accidentals', maxAccidentals: 1 } },
  ],
  facts: [
    {
      id: 'circle-signature-meaning',
      front: 'What is a key signature?',
      back: 'The group of sharps or flats written at the start of every staff line, just after the clef: the key\'s sharps or flats, written once.',
      ask: {
        type: 'choice',
        prompt: 'Where is a key signature written?',
        options: [
          { text: 'At the start of every staff line', correct: true },
          { text: 'Only at the very start of the piece', why: 'It is written again at the start of every line, so it is always in view.' },
          { text: 'Beside each note it changes', why: 'Signs beside notes are accidentals. The signature saves writing them.' },
        ],
        explain: 'A key signature is written just after the clef on every staff line.',
      },
    },
    {
      id: 'circle-signature-every-octave',
      front: 'A key signature has one sharp, on the F line. Which notes does it change?',
      back: 'Every F, in every octave, all through the piece, unless a natural sign cancels it.',
      ask: {
        type: 'true-false',
        statement: 'The sharp in the signature of {k:G major} makes every F in the piece an {n:F#}, high or low.',
        answer: true,
        explain: 'A sharp or flat in the signature applies to every note of that letter, in every octave, unless a natural sign cancels it.',
      },
    },
    {
      id: 'circle-c-major-none',
      front: 'How many sharps or flats does C major have?',
      back: 'None: {k:C major} uses only the natural notes, so it has no key signature.',
      ask: {
        type: 'type-answer',
        prompt: 'How many sharps or flats are in the key signature of {k:C major}? Type a number.',
        answer: { kind: 'number', value: 0 },
        input: 'keypad',
        explain: '{k:C major} uses only the natural notes: no sharps, no flats.',
      },
    },
  ],
};

const sharpKeys: Lesson = {
  id: 'sharp-keys',
  title: 'The sharp keys',
  teaches: 'Each sharp key starts a perfect fifth above the last and adds one sharp, in the fixed order F C G D A E B.',
  minutes: 3,
  skill: `theory:${U}:sharp-keys`,
  steps: [
    {
      type: 'card',
      title: 'Up a fifth, one more sharp',
      body: 'Start on {k:C major}: no sharps. Go up a {i:P5}, seven half steps, to {n:G}: {k:G major} has one sharp. Up another fifth to {n:D}: two sharps. Then {n:A}, three, and {n:E}, four. Each new key keeps the old sharps and adds one.',
      figure: {
        kind: 'fretboard',
        frets: [3, 9],
        dots: [
          { string: 6, fret: 3, note: 'G2', role: 'root' },
          { string: 5, fret: 5, note: 'D3', role: 'root' },
          { string: 4, fret: 7, note: 'A3', role: 'root' },
          { string: 3, fret: 9, note: 'E4', role: 'root' },
        ],
        caption: '{n:G}, {n:D}, {n:A}, {n:E}: each tonic a fifth above the last.',
      },
    },
    {
      type: 'choice',
      prompt: 'How many sharps does {k:E major} have?',
      options: [
        { text: '2' },
        { text: '3', why: '{k:A major} has three. {n:E} is the next key up, so it adds one more.' },
        { text: '4', correct: true },
        { text: '5', why: 'Five sharps is {k:B major}, a fifth above {n:E}.' },
      ],
      shuffle: false,
      explain: 'Count the fifths up from {n:C}: G 1, D 2, A 3, E 4. {k:E major} has four sharps: {n:F#} {n:C#} {n:G#} {n:D#}.',
      fact: 'circle-sharp-counts',
    },
    {
      type: 'fretboard-find',
      prompt: '{n:G} is at string 6, fret 3. The next sharp key is a fifth up: tap its tonic on string 5.',
      find: { interval: 'P5', from: { string: 6, fret: 3 } },
      mode: 'one',
      octave: 'exact',
      frets: [3, 9],
      strings: [5],
      shown: [{ string: 6, fret: 3, note: 'G', role: 'root' }],
      explain: 'A fifth above {n:G} is {n:D}: string 5, fret 5, one string over and two frets up. {k:D major} has two sharps.',
      fact: 'circle-sharp-keys-fifths',
    },
    {
      type: 'card',
      title: 'The order of sharps',
      body: 'Sharps always arrive in the same order, the {t:order-of-sharps}: {n:F#}, {n:C#}, {n:G#}, {n:D#}, {n:A#}, {n:E#}, {n:B#}. Each is a fifth above the last. A key with three sharps has the first three, never any others.',
      figure: { kind: 'staff', key: 'E major', notes: [], caption: '{k:E major}: four sharps, in order {n:F#} {n:C#} {n:G#} {n:D#}.' },
    },
    {
      type: 'order',
      prompt: 'Put these sharps in the order they are written in a key signature.',
      tiles: ['{n:F#}', '{n:C#}', '{n:G#}', '{n:D#}'],
      explain: 'Sharps always come in the order F C G D A E B, each a fifth above the last: {n:F#}, {n:C#}, {n:G#}, {n:D#}.',
      fact: 'circle-order-of-sharps',
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the sharp keys, each a fifth above the last.',
      text: '{n:C}  {n:G}  {n:D}  ___  {n:E}  ___',
      blanks: ['{n:A}', '{n:B}'],
      bank: ['{n:F}', '{n:G#}'],
      explain: 'Each key is a fifth above the last: C G D A E B, then {n:F#} and {n:C#}.',
      fact: 'circle-sharp-keys-fifths',
    },
    {
      type: 'choice',
      prompt: 'Which of these is the key signature of {k:D major}?',
      options: [
        { figure: { kind: 'staff', key: 'D major', notes: [] }, correct: true },
        { figure: { kind: 'staff', key: 'A major', notes: [] }, why: 'Three sharps: that is {k:A major}.' },
        { figure: { kind: 'staff', key: 'G major', notes: [] }, why: 'One sharp: that is {k:G major}.' },
      ],
      explain: '{k:D major} has two sharps, the first two of the order: {n:F#} and {n:C#}.',
      fact: 'circle-sharp-counts',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each major key with its number of sharps.',
      pairs: [
        { left: '{k:G major}', right: '1 sharp' },
        { left: '{k:D major}', right: '2 sharps' },
        { left: '{k:A major}', right: '3 sharps' },
        { left: '{k:B major}', right: '5 sharps' },
      ],
      explain: 'Each step up a fifth adds a sharp: G 1, D 2, A 3, E 4, B 5, then {n:F#} 6 and {n:C#} 7.',
      fact: 'circle-sharp-counts',
    },
    { generate: 'fifths-order', params: { ask: 'sharps', count: 5 } },
    { generate: 'key-signature', params: { ask: 'count', maxAccidentals: 1 } },
  ],
  facts: [
    {
      id: 'circle-sharp-keys-fifths',
      front: 'Name the sharp major keys in order, starting from C.',
      back: '{n:C} {n:G} {n:D} {n:A} {n:E} {n:B} {n:F#} {n:C#}: each a perfect fifth above the last, each with one more sharp.',
      ask: {
        type: 'order',
        prompt: 'Put these sharp keys in order, each a fifth above the last, starting from {n:G}.',
        tiles: ['{n:G}', '{n:D}', '{n:A}', '{n:E}', '{n:B}'],
        explain: 'Each sharp key is a perfect fifth above the last: G, D, A, E, B, then {n:F#} and {n:C#}.',
      },
    },
    {
      id: 'circle-sharp-counts',
      front: 'How many sharps does each sharp major key have?',
      back: '{k:G major} 1, {k:D major} 2, {k:A major} 3, {k:E major} 4, {k:B major} 5, {k:F# major} 6 and {k:C# major} 7.',
      ask: {
        type: 'match-pairs',
        prompt: 'Match each major key with its number of sharps.',
        pairs: [
          { left: '{k:D major}', right: '2 sharps' },
          { left: '{k:E major}', right: '4 sharps' },
          { left: '{k:F# major}', right: '6 sharps' },
          { left: '{k:C# major}', right: '7 sharps' },
        ],
        explain: 'Each step up a fifth adds a sharp: G 1, D 2, A 3, E 4, B 5, {n:F#} 6, {n:C#} 7.',
      },
    },
    {
      id: 'circle-order-of-sharps',
      front: 'In what order are sharps written in a key signature?',
      back: 'F C G D A E B: {n:F#} {n:C#} {n:G#} {n:D#} {n:A#} {n:E#} {n:B#}, each a fifth above the last.',
      ask: { generate: 'fifths-order', params: { ask: 'sharps', count: 7 } },
    },
  ],
};

const namingSharpKeys: Lesson = {
  id: 'naming-sharp-keys',
  title: 'Naming a sharp key',
  teaches: 'In a sharp signature the last sharp is degree 7 of the major key, so the key is a half step above it.',
  minutes: 3,
  skill: `theory:${U}:naming-sharp-keys`,
  steps: [
    {
      type: 'card',
      title: 'Read the last sharp',
      body: 'To name a sharp key, look at the **last** sharp, the one furthest right. It is degree 7 of the major key, a half step below the {t:tonic}. Go up a half step and you have the key.',
      figure: { kind: 'staff', key: 'E major', notes: [], caption: 'Four sharps. The last is {n:D#}; a half step up is {n:E}: {k:E major}.' },
    },
    {
      type: 'choice',
      prompt: 'A key signature has two sharps, {n:F#} and {n:C#}. Which major key is it?',
      options: [
        { text: '{k:D major}', correct: true },
        { text: '{k:C# major}', why: 'The last sharp is degree 7, not the key itself. {k:C# major} has all seven sharps.' },
        { text: '{k:A major}', why: '{k:A major} has three sharps: its last sharp is {n:G#}.' },
        { text: '{k:G major}', why: '{k:G major} has just one sharp, {n:F#}.' },
      ],
      explain: 'The last sharp is {n:C#}. A half step above it is {n:D}: two sharps is {k:D major}.',
      fact: 'circle-last-sharp-rule',
    },
    {
      type: 'card',
      title: 'One fret up',
      body: 'A half step is one fret. With four sharps the last is {n:D#}: on string 5 that is fret 6. One fret up, at fret 7, is {n:E}, the tonic of the key.',
      figure: {
        kind: 'fretboard',
        frets: [4, 8],
        dots: [
          { string: 5, fret: 6, note: 'D#', label: '7', role: 'tone' },
          { string: 5, fret: 7, note: 'E', role: 'root' },
        ],
        caption: 'The last sharp, {n:D#} (degree 7), then the tonic {n:E}, one fret up.',
      },
    },
    {
      type: 'true-false',
      statement: 'With four sharps the key is a half step above {n:D#}, so it is {k:E major}.',
      answer: true,
      explain: 'The four sharps are {n:F#} {n:C#} {n:G#} {n:D#}. The last, {n:D#}, is degree 7 of {k:E major}.',
      fact: 'circle-last-sharp-rule',
    },
    {
      type: 'fretboard-find',
      prompt: 'Three sharps: the last is {n:G#}, at string 6, fret 4. Tap the tonic of the key on string 6.',
      find: { note: 'A2' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 7],
      strings: [6],
      shown: [{ string: 6, fret: 4, note: 'G#', role: 'tone' }],
      explain: 'One fret above {n:G#} is {n:A}, at fret 5: three sharps is {k:A major}.',
      fact: 'circle-three-sharps-a',
    },
    {
      type: 'type-answer',
      prompt: 'Five sharps: {n:F#} {n:C#} {n:G#} {n:D#} {n:A#}. Type the major key.',
      answer: { kind: 'note', value: 'B', spelling: 'exact' },
      input: 'keypad',
      explain: 'The last sharp is {n:A#}. A half step above it is {n:B}: {k:B major} has five sharps.',
      fact: 'circle-last-sharp-rule',
    },
    {
      type: 'card',
      title: 'A sentence to remember',
      body: 'Many players remember the order of sharps with a sentence: **F**ather **C**harles **G**oes **D**own **A**nd **E**nds **B**attle. Each first letter is the next sharp: F C G D A E B.',
    },
    {
      type: 'choice',
      prompt: 'In "Father Charles Goes Down And Ends Battle", which sharp does "Ends" stand for?',
      options: [
        { text: '{n:E#}', correct: true },
        { text: '{n:F}', why: 'It sounds the same, but a sharp keeps its letter: the sixth sharp is {n:E#}.' },
        { text: '{n:E}', why: 'Every word stands for a sharp: "Ends" is E sharp.' },
        { text: '{n:A#}', why: '{n:A#} is "And", the fifth sharp.' },
      ],
      spelling: 'exact',
      explain: 'Each word gives the next sharp: F C G D A **E** B. The sixth sharp, in {k:F# major}, is {n:E#}.',
      fact: 'circle-sharps-mnemonic',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each last sharp with its major key.',
      pairs: [
        { left: '{n:F#}', right: '{k:G major}' },
        { left: '{n:C#}', right: '{k:D major}' },
        { left: '{n:G#}', right: '{k:A major}' },
        { left: '{n:A#}', right: '{k:B major}' },
      ],
      explain: 'The key is always a half step above the last sharp: {n:F#} to {n:G}, {n:C#} to {n:D}, {n:G#} to {n:A}, {n:A#} to {n:B}.',
      fact: 'circle-last-sharp-rule',
    },
    { generate: 'key-signature', params: { ask: 'key', maxAccidentals: 1 } },
  ],
  facts: [
    {
      id: 'circle-last-sharp-rule',
      front: 'How do you name a major key from its sharps?',
      back: 'The last sharp is degree 7 of the key: go up a half step from it. Last sharp {n:D#}: {k:E major}.',
      ask: {
        type: 'choice',
        prompt: 'The last sharp of a key signature is {n:A#}. Which major key is it?',
        options: [
          { text: '{k:B major}', correct: true },
          { text: '{k:A major}', why: '{k:A major} has three sharps; its last is {n:G#}.' },
          { text: '{k:E major}', why: '{k:E major} has four sharps; its last is {n:D#}.' },
          { text: '{k:F# major}', why: '{k:F# major} has six sharps; its last is {n:E#}.' },
        ],
        explain: 'The last sharp is degree 7: a half step above {n:A#} is {n:B}, so the key is {k:B major}.',
      },
    },
    {
      id: 'circle-three-sharps-a',
      front: 'Which major key has three sharps?',
      back: '{k:A major}: {n:F#} {n:C#} {n:G#}. The last sharp, {n:G#}, plus a half step gives {n:A}.',
    },
    {
      id: 'circle-sharps-mnemonic',
      front: 'What sentence helps you remember the order of sharps?',
      back: '**F**ather **C**harles **G**oes **D**own **A**nd **E**nds **B**attle: F C G D A E B.',
    },
  ],
};

const flatKeys: Lesson = {
  id: 'flat-keys',
  title: 'The flat keys',
  teaches: 'Each flat key starts a perfect fifth below the last and adds one flat, in the order B E A D G C F.',
  minutes: 3,
  skill: `theory:${U}:flat-keys`,
  steps: [
    {
      type: 'card',
      title: 'Down a fifth, one more flat',
      body: 'Now go the other way. From {n:C}, a {i:P5} down is {n:F}: {k:F major} has one flat. Down another fifth is {n:Bb}: two flats. Then {n:Eb}, three, and {n:Ab}, four. Each new key keeps the old flats and adds one.',
      figure: {
        kind: 'fretboard',
        frets: [0, 4],
        dots: [
          { string: 6, fret: 1, note: 'F', role: 'root' },
          { string: 5, fret: 1, note: 'Bb', role: 'root' },
          { string: 4, fret: 1, note: 'Eb', role: 'root' },
          { string: 3, fret: 1, note: 'Ab', role: 'root' },
        ],
        caption: 'At fret 1: {n:F}, {n:Bb}, {n:Eb}, {n:Ab}, the first four flat keys.',
      },
      tip: 'Each tonic here sits a fourth above the last. A fourth up lands on the same letter as a fifth down.',
    },
    {
      type: 'choice',
      prompt: 'How many flats does {k:Eb major} have?',
      options: [
        { text: '1', why: 'One flat is {k:F major}.' },
        { text: '2', why: 'Two flats is {k:Bb major}, the key just before.' },
        { text: '3', correct: true },
        { text: '4', why: 'Four flats is {k:Ab major}, the key after.' },
      ],
      shuffle: false,
      explain: 'Count the fifths down from {n:C}: {n:F} 1, {n:Bb} 2, {n:Eb} 3. Its flats are {n:Bb} {n:Eb} {n:Ab}.',
      fact: 'circle-flat-counts',
    },
    {
      type: 'card',
      title: 'The order of flats',
      body: 'Flats arrive in the order {n:Bb}, {n:Eb}, {n:Ab}, {n:Db}, {n:Gb}, {n:Cb}, {n:Fb}: B E A D G C F. That is the order of sharps backwards, and each flat is a fifth below the last.',
      figure: { kind: 'staff', key: 'Ab major', notes: [], caption: '{k:Ab major}: four flats, in order {n:Bb} {n:Eb} {n:Ab} {n:Db}.' },
    },
    {
      type: 'order',
      prompt: 'Put these flats in the order they are written in a key signature.',
      tiles: ['{n:Bb}', '{n:Eb}', '{n:Ab}', '{n:Db}'],
      explain: 'Flats always come in the order B E A D G C F: {n:Bb}, {n:Eb}, {n:Ab}, {n:Db}.',
      fact: 'circle-order-of-flats',
    },
    {
      type: 'true-false',
      statement: 'The order of flats is the order of sharps backwards.',
      answer: true,
      explain: 'Sharps go F C G D A E B; flats go B E A D G C F. Read one backwards and you get the other.',
      fact: 'circle-order-of-flats',
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the flat keys, each a fifth below the last.',
      text: '{n:F}  {n:Bb}  ___  {n:Ab}  ___',
      blanks: ['{n:Eb}', '{n:Db}'],
      bank: ['{n:E}', '{n:Gb}'],
      explain: 'Each key is a fifth below the last: {n:F} {n:Bb} {n:Eb} {n:Ab} {n:Db}, then {n:Gb} and {n:Cb}.',
      fact: 'circle-flat-keys-fifths',
    },
    {
      type: 'fretboard-find',
      prompt: 'The tonic of {k:Bb major} is at string 5, fret 1. Tap the tonic of the next flat key on string 4.',
      find: { note: 'Eb3' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 4],
      strings: [4],
      shown: [{ string: 5, fret: 1, note: 'Bb', role: 'root' }],
      explain: 'A fifth below {n:Bb} is {n:Eb}: {k:Eb major}, with three flats. On string 4 it is fret 1, right beside the {n:Bb}.',
      fact: 'circle-flat-keys-fifths',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each major key with its number of flats.',
      pairs: [
        { left: '{k:F major}', right: '1 flat' },
        { left: '{k:Bb major}', right: '2 flats' },
        { left: '{k:Ab major}', right: '4 flats' },
        { left: '{k:Db major}', right: '5 flats' },
      ],
      explain: 'Each step down a fifth adds a flat: F 1, {n:Bb} 2, {n:Eb} 3, {n:Ab} 4, {n:Db} 5, {n:Gb} 6, {n:Cb} 7.',
      fact: 'circle-flat-counts',
    },
    { generate: 'fifths-order', params: { ask: 'flats', count: 5 } },
    { generate: 'key-signature', params: { ask: 'count', maxAccidentals: 4 } },
  ],
  facts: [
    {
      id: 'circle-flat-keys-fifths',
      front: 'Name the flat major keys in order, starting from C.',
      back: '{n:C} {n:F} {n:Bb} {n:Eb} {n:Ab} {n:Db} {n:Gb} {n:Cb}: each a perfect fifth below the last, each with one more flat.',
      ask: {
        type: 'order',
        prompt: 'Put these flat keys in order, each a fifth below the last, starting from {n:F}.',
        tiles: ['{n:F}', '{n:Bb}', '{n:Eb}', '{n:Ab}', '{n:Db}'],
        explain: 'Each flat key is a perfect fifth below the last: {n:F}, {n:Bb}, {n:Eb}, {n:Ab}, {n:Db}, then {n:Gb} and {n:Cb}.',
      },
    },
    {
      id: 'circle-order-of-flats',
      front: 'In what order are flats written in a key signature?',
      back: 'B E A D G C F: {n:Bb} {n:Eb} {n:Ab} {n:Db} {n:Gb} {n:Cb} {n:Fb}. It is the order of sharps backwards.',
      ask: { generate: 'fifths-order', params: { ask: 'flats', count: 7 } },
    },
    {
      id: 'circle-flat-counts',
      front: 'How many flats does each flat major key have?',
      back: '{k:F major} 1, {k:Bb major} 2, {k:Eb major} 3, {k:Ab major} 4, {k:Db major} 5, {k:Gb major} 6 and {k:Cb major} 7.',
      ask: {
        type: 'match-pairs',
        prompt: 'Match each major key with its number of flats.',
        pairs: [
          { left: '{k:Bb major}', right: '2 flats' },
          { left: '{k:Eb major}', right: '3 flats' },
          { left: '{k:Db major}', right: '5 flats' },
          { left: '{k:Gb major}', right: '6 flats' },
        ],
        explain: 'Each step down a fifth adds a flat: F 1, {n:Bb} 2, {n:Eb} 3, {n:Ab} 4, {n:Db} 5, {n:Gb} 6, {n:Cb} 7.',
      },
    },
  ],
};

const namingFlatKeys: Lesson = {
  id: 'naming-flat-keys',
  title: 'Naming a flat key',
  teaches: 'With two or more flats, the second-to-last flat names the major key; one flat is F major.',
  minutes: 2,
  skill: `theory:${U}:naming-flat-keys`,
  steps: [
    {
      type: 'card',
      title: 'The second-to-last flat',
      body: 'With two or more flats, the **second-to-last** flat names the key. Three flats, {n:Bb} {n:Eb} {n:Ab}: the second-to-last is {n:Eb}, so the key is {k:Eb major}. One flat has no second-to-last: just remember {k:F major}.',
      figure: { kind: 'staff', key: 'Eb major', notes: [], caption: 'Three flats: the second-to-last, {n:Eb}, names the key.' },
    },
    {
      type: 'choice',
      prompt: 'Four flats: {n:Bb} {n:Eb} {n:Ab} {n:Db}. Which major key is it?',
      options: [
        { text: '{k:Ab major}', correct: true },
        { text: '{k:Db major}', why: 'The last flat is not the key: count back one, to {n:Ab}. {k:Db major} has five flats.' },
        { text: '{k:Eb major}', why: '{k:Eb major} has three flats.' },
        { text: '{k:Bb major}', why: '{k:Bb major} has two flats.' },
      ],
      explain: 'The second-to-last flat is {n:Ab}, so four flats is {k:Ab major}.',
      fact: 'circle-second-last-flat',
    },
    {
      type: 'type-answer',
      prompt: 'Type the major key with two flats, {n:Bb} and {n:Eb}.',
      answer: { kind: 'note', value: 'Bb', spelling: 'exact' },
      input: 'keypad',
      explain: 'The second-to-last flat is {n:Bb}: {k:Bb major} has two flats.',
      fact: 'circle-second-last-flat',
    },
    {
      type: 'true-false',
      statement: 'One flat in the key signature means {k:Bb major}.',
      answer: false,
      explain: 'One flat, {n:Bb}, is {k:F major}. With one flat there is no second-to-last, so this is the one to remember.',
      fact: 'circle-one-flat-f',
    },
    {
      type: 'card',
      title: 'Find it on the neck',
      body: '{k:Eb major} starts on {n:Eb}: string 5, fret 6. Every flat key but one has a flat in its name: {n:Bb}, {n:Eb}, {n:Ab}, {n:Db}, {n:Gb}, {n:Cb}. Only {k:F major} does not.',
      figure: { kind: 'fretboard', frets: [4, 8], dots: [{ string: 5, fret: 6, note: 'Eb', role: 'root' }], caption: '{n:Eb}, the tonic of {k:Eb major}: string 5, fret 6.' },
    },
    {
      type: 'choice',
      prompt: 'Which flat major key has no flat in its name?',
      options: [
        { text: '{k:F major}', correct: true },
        { text: '{k:Bb major}', why: '{n:Bb} is a flat note.' },
        { text: '{k:C major}', why: '{k:C major} has no flats at all.' },
        { text: '{k:Eb major}', why: '{n:Eb} is a flat note.' },
      ],
      explain: '{k:F major} has one flat, {n:Bb}, but its tonic is a plain {n:F}. Every other flat major key starts on a flat note.',
      fact: 'circle-flat-names',
    },
    { generate: 'key-signature', params: { ask: 'key', maxAccidentals: 4 } },
  ],
  facts: [
    {
      id: 'circle-second-last-flat',
      front: 'How do you name a major key from two or more flats?',
      back: 'The second-to-last flat names the key: {n:Bb} {n:Eb} {n:Ab} gives {k:Eb major}.',
      ask: {
        type: 'choice',
        prompt: 'Five flats: {n:Bb} {n:Eb} {n:Ab} {n:Db} {n:Gb}. Which major key is it?',
        options: [
          { text: '{k:Db major}', correct: true },
          { text: '{k:Gb major}', why: 'Count back one from the last flat. {k:Gb major} has six flats.' },
          { text: '{k:Ab major}', why: '{k:Ab major} has four flats.' },
        ],
        explain: 'The second-to-last flat is {n:Db}: five flats is {k:Db major}.',
      },
    },
    { id: 'circle-one-flat-f', front: 'Which major key has one flat?', back: '{k:F major}. Its one flat is {n:Bb}.' },
    {
      id: 'circle-flat-names',
      front: 'Which flat major key has no flat in its name?',
      back: '{k:F major}. Every other flat major key, from {k:Bb major} to {k:Cb major}, has a flat in its name.',
    },
  ],
};

const theCircle: Lesson = {
  id: 'the-circle',
  title: 'The circle of fifths',
  teaches: 'The circle of fifths puts the 12 major keys in a ring of rising fifths: sharps clockwise, flats anticlockwise.',
  minutes: 4,
  skill: `theory:${U}:the-circle`,
  steps: [
    {
      type: 'card',
      title: 'A clock of keys',
      body: 'Put {n:C} at the top of a clock and step clockwise a {i:P5} at a time: {n:C} {n:G} {n:D} {n:A} {n:E} {n:B} {n:F#}. The flat keys follow, {n:Db} {n:Ab} {n:Eb} {n:Bb} {n:F}, and you are back at {n:C}. That is the {t:circle-of-fifths}.',
      figure: { kind: 'circle', key: 'C major', show: 'major', caption: 'Clockwise: one more sharp, or one flat fewer, at every step.' },
    },
    {
      type: 'order',
      prompt: 'Going clockwise from {n:C}, put these keys in order.',
      tiles: ['{n:G}', '{n:D}', '{n:A}', '{n:E}'],
      explain: 'Each step clockwise is a fifth up: C, G, D, A, E. The signatures grow too: 1, 2, 3 and 4 sharps.',
      fact: 'circle-clockwise-order',
    },
    {
      type: 'choice',
      prompt: 'Which key is one step clockwise from {k:Eb major}?',
      options: [
        { text: '{k:Bb major}', correct: true },
        { text: '{k:Ab major}', why: '{k:Ab major} is one step anticlockwise: a fifth down, with one more flat.' },
        { text: '{k:E major}', why: '{k:E major} is a half step up, not a fifth: it is five steps away round the circle.' },
        { text: '{k:F major}', why: '{k:F major} is two steps clockwise from {k:Eb major}.' },
      ],
      explain: 'Clockwise is a fifth up: from {n:Eb}, a fifth up is {n:Bb}. {k:Bb major} has two flats, one fewer than {k:Eb major}.',
      fact: 'circle-clockwise-adds-sharps',
    },
    {
      type: 'card',
      title: 'Fifths on the neck',
      body: 'A fifth up is the {t:power-chord} shape: one string over, two frets up. From {n:G} at string 6, fret 3, climb to {n:D} at string 5, fret 5, then {n:A} at string 4, fret 7. That is three keys clockwise round the circle.',
      figure: {
        kind: 'fretboard',
        frets: [3, 7],
        dots: [
          { string: 6, fret: 3, note: 'G2', role: 'root' },
          { string: 5, fret: 5, note: 'D3', role: 'root' },
          { string: 4, fret: 7, note: 'A3', role: 'root' },
        ],
        caption: '{n:G}, {n:D}, {n:A}: fifths, one string over and two frets up each time.',
      },
    },
    {
      type: 'fretboard-find',
      prompt: '{n:D} is at string 5, fret 5. Tap the next key clockwise on string 4.',
      find: { interval: 'P5', from: { string: 5, fret: 5 } },
      mode: 'one',
      octave: 'exact',
      frets: [3, 8],
      strings: [4],
      shown: [{ string: 5, fret: 5, note: 'D', role: 'root' }],
      explain: 'Clockwise is a fifth up: {n:A}, at string 4, fret 7. {k:A major} has three sharps, one more than {k:D major}.',
      fact: 'circle-clockwise-order',
    },
    {
      type: 'card',
      title: 'Three pairs at the bottom',
      body: 'At the bottom of the circle three keys have two names. {k:B major} (5 sharps) sounds the same as {k:Cb major} (7 flats), {k:F# major} (6 sharps) as {k:Gb major} (6 flats), and {k:C# major} (7 sharps) as {k:Db major} (5 flats). They are {t:enharmonic-key|enharmonic keys}.',
      figure: { kind: 'circle', key: 'F# major', highlight: ['B major', 'Db major'], show: 'major', caption: 'The three bottom slots each hold two names for one key.' },
    },
    {
      type: 'true-false',
      statement: '{k:F# major} and {k:Gb major} sound the same.',
      answer: true,
      explain: 'Every pitch is shared: {n:F#} is {n:Gb}, {n:G#} is {n:Ab}, and so on. {k:F# major} is written with six sharps, {k:Gb major} with six flats.',
      fact: 'circle-enharmonic-pairs',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each key with the key that sounds the same.',
      pairs: [
        { left: '{k:B major}', right: '{k:Cb major}' },
        { left: '{k:F# major}', right: '{k:Gb major}' },
        { left: '{k:C# major}', right: '{k:Db major}' },
      ],
      explain: 'The three pairs sit at the bottom of the circle: {k:B major} and {k:Cb major}, {k:F# major} and {k:Gb major}, {k:C# major} and {k:Db major}.',
      fact: 'circle-enharmonic-pairs',
    },
    {
      type: 'choice',
      prompt: 'You go one step anticlockwise from {k:D major}. What happens to the key signature?',
      options: [
        { text: 'It loses a sharp', correct: true },
        { text: 'It gains a sharp', why: 'Clockwise adds a sharp: one step clockwise is {k:A major}, with three.' },
        { text: 'It gains a flat', why: 'Flats come only once the sharps are used up: anticlockwise from D takes a sharp away first.' },
      ],
      shuffle: false,
      explain: 'Anticlockwise is a fifth down, to {k:G major}: the two sharps of {k:D major} become one.',
      fact: 'circle-clockwise-adds-sharps',
    },
    { generate: 'fifths-order', params: { ask: 'keys', count: 4 } },
  ],
  facts: [
    {
      id: 'circle-clockwise-order',
      front: 'Name the major keys clockwise round the circle of fifths, starting from C.',
      back: '{n:C} {n:G} {n:D} {n:A} {n:E} {n:B} {n:F#} (or {n:Gb}) {n:Db} {n:Ab} {n:Eb} {n:Bb} {n:F}: each a perfect fifth above the last.',
      ask: { generate: 'fifths-order', params: { ask: 'keys', count: 5 } },
    },
    {
      id: 'circle-clockwise-adds-sharps',
      front: 'What happens to the key signature as you go clockwise round the circle? And anticlockwise?',
      back: 'Clockwise adds a sharp or removes a flat. Anticlockwise adds a flat or removes a sharp.',
    },
    {
      id: 'circle-enharmonic-pairs',
      front: 'Which three pairs of major keys sound the same?',
      back: '{k:B major} and {k:Cb major}, {k:F# major} and {k:Gb major}, {k:C# major} and {k:Db major}: they share the bottom of the circle.',
    },
  ],
};

const neighbourKeys: Lesson = {
  id: 'neighbour-keys',
  title: 'Neighbours on the circle',
  teaches: 'Neighbouring keys on the circle differ by one note, and a key\'s one, four and five chords sit side by side.',
  minutes: 3,
  skill: `theory:${U}:neighbour-keys`,
  steps: [
    {
      type: 'card',
      title: 'One note apart',
      body: '{k:C major} and {k:G major} sit side by side on the circle, and their scales differ by **one note**: {n:F} in C, {n:F#} in G. Every pair of neighbours is like this: one step round the circle changes just one note.',
      figure: { kind: 'circle', key: 'C major', highlight: ['G major', 'F major'], show: 'major', caption: '{k:C major} with its neighbours, {k:G major} and {k:F major}.' },
    },
    {
      type: 'choice',
      prompt: 'Which key differs from {k:D major} by just one note?',
      options: [
        { text: '{k:A major}', correct: true },
        { text: '{k:Bb major}', why: '{k:Bb major} is far round the circle: it changes four notes of {k:D major}.' },
        { text: '{k:E major}', why: '{k:E major} is two steps away, so it changes two notes.' },
      ],
      explain: '{k:A major} is one step clockwise: it keeps every note of {k:D major} except {n:G}, which becomes {n:G#}.',
      fact: 'circle-neighbours-one-note',
    },
    {
      type: 'card',
      title: 'Dominant and subdominant keys',
      body: 'One step clockwise is the {t:dominant} key, built on degree 5: from {k:C major}, that is {k:G major}. One step anticlockwise is the {t:subdominant} key, built on degree 4: {k:F major}.',
      figure: { kind: 'chord', symbol: 'G', frets: '320003', caption: '{c:G}, the chord on degree 5 of {k:C major}.' },
    },
    {
      type: 'choice',
      prompt: 'What is the subdominant key of {k:G major}?',
      options: [
        { text: '{k:C major}', correct: true },
        { text: '{k:D major}', why: '{k:D major} is the dominant key: one step clockwise, on degree 5.' },
        { text: '{k:A major}', why: '{k:A major} is two steps clockwise from {n:G}.' },
        { text: '{k:F major}', why: '{k:F major} is two steps anticlockwise from {n:G}.' },
      ],
      explain: 'One step anticlockwise from {n:G} is {n:C}, degree 4 of {k:G major}: {k:C major} is its subdominant key.',
      fact: 'circle-dominant-subdominant',
    },
    {
      type: 'card',
      title: 'Three chords side by side',
      body: 'In {k:C major} the chords {r:I}, {r:IV} and {r:V} are {c:C}, {c:F} and {c:G}: the home key and its two neighbours on the circle. Find any key on the circle, and its three main chords sit together.',
      figure: { kind: 'chord', symbol: 'F', frets: 'xx3211', caption: '{c:F} (xx3211), the {r:IV} chord of {k:C major}.' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each key with its {r:I}, {r:IV} and {r:V} chords.',
      pairs: [
        { left: '{k:C major}', right: '{c:C} {c:F} {c:G}' },
        { left: '{k:G major}', right: '{c:G} {c:C} {c:D}' },
        { left: '{k:D major}', right: '{c:D} {c:G} {c:A}' },
      ],
      explain: 'Each key\'s {r:I}, {r:IV} and {r:V} are the key and its two neighbours on the circle: F C G, C G D, G D A.',
      fact: 'circle-one-four-five',
    },
    {
      type: 'true-false',
      statement: '{k:C major} and {k:G major} differ only by {n:F} and {n:F#}.',
      answer: true,
      explain: '{k:C major} is C D E F G A B; {k:G major} is G A B C D E {n:F#}. Six notes are shared; only F becomes {n:F#}.',
      fact: 'circle-neighbours-one-note',
    },
    {
      type: 'listen-choice',
      prompt: 'The same phrase is played twice, with one note changed. Which time is it in {k:G major}?',
      sound: { kind: 'tab', notes: NEIGHBOUR_PHRASES, tempo: 96 },
      options: [{ text: 'The first time' }, { text: 'The second time', correct: true }],
      shuffle: false,
      explain: 'The second time the 7th note was {n:F#}, the one note that turns {k:C major} into {k:G major}. Hear how it leans up into the last note, {n:G}.',
    },
    { generate: 'roman-chord', params: { direction: 'to-chord', numerals: ['I', 'IV', 'V'], maxAccidentals: 4 } },
    { generate: 'fifths-order', params: { ask: 'keys', count: 3 } },
  ],
  facts: [
    {
      id: 'circle-neighbours-one-note',
      front: 'By how many notes do neighbouring keys on the circle differ?',
      back: 'Only one: {k:C major} and {k:G major} differ only by {n:F} and {n:F#}.',
    },
    {
      id: 'circle-dominant-subdominant',
      front: 'Which key is one step clockwise from a key? And one step anticlockwise?',
      back: 'Clockwise: the dominant key, built on degree 5. Anticlockwise: the subdominant key, built on degree 4. From {k:C major}: {k:G major} and {k:F major}.',
      ask: {
        type: 'choice',
        prompt: 'What is the dominant key of {k:A major}?',
        options: [
          { text: '{k:E major}', correct: true },
          { text: '{k:D major}', why: '{k:D major} is the subdominant key: one step anticlockwise.' },
          { text: '{k:B major}', why: '{k:B major} is two steps clockwise from {n:A}.' },
        ],
        explain: 'One step clockwise from {n:A} is {n:E}, degree 5 of {k:A major}: {k:E major} is its dominant key.',
      },
    },
    {
      id: 'circle-one-four-five',
      front: 'Where do the {r:I}, {r:IV} and {r:V} chords of a key sit on the circle?',
      back: 'Side by side: the key and its two neighbours. In {k:C major}: {c:F}, {c:C} and {c:G}.',
      ask: { generate: 'roman-chord', params: { direction: 'to-chord', numerals: ['I', 'IV', 'V'], maxAccidentals: 3 } },
    },
  ],
};

/** Unit 15 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'Key signatures, circle of fifths',
  theme: 'keys',
  description: 'How key signatures work, the order of sharps and flats, naming keys from signatures, and the circle of fifths.',
  lessons: [keySignatures, sharpKeys, namingSharpKeys, flatKeys, namingFlatKeys, theCircle, neighbourKeys],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      {
        type: 'true-false',
        statement: 'A flat in the key signature applies only to the octave where it is written.',
        answer: false,
        explain: 'A sharp or flat in the signature applies to every note with that letter, in every octave, unless a natural sign cancels it.',
      },
      { generate: 'fifths-order', params: { ask: 'sharps', count: 5 } },
      { generate: 'fifths-order', params: { ask: 'flats', count: 5 } },
      {
        type: 'choice',
        prompt: 'A key signature has three sharps: {n:F#} {n:C#} {n:G#}. Which major key is it?',
        options: [
          { text: '{k:A major}', correct: true },
          { text: '{k:G# major}', why: 'The last sharp is degree 7: go up a half step from {n:G#}.' },
          { text: '{k:E major}', why: '{k:E major} has four sharps.' },
          { text: '{k:D major}', why: '{k:D major} has two sharps.' },
        ],
        explain: 'The last sharp, {n:G#}, is degree 7. A half step above it is {n:A}: {k:A major}.',
      },
      {
        type: 'choice',
        prompt: 'A key signature has five flats: {n:Bb} {n:Eb} {n:Ab} {n:Db} {n:Gb}. Which major key is it?',
        options: [
          { text: '{k:Db major}', correct: true },
          { text: '{k:Gb major}', why: 'The last flat is not the key: count back one, to {n:Db}.' },
          { text: '{k:Ab major}', why: '{k:Ab major} has four flats.' },
          { text: '{k:Eb major}', why: '{k:Eb major} has three flats.' },
        ],
        explain: 'The second-to-last flat names the key: {n:Db}, so five flats is {k:Db major}.',
      },
      {
        type: 'true-false',
        statement: 'One flat in the key signature means {k:F major}.',
        answer: true,
        explain: 'One flat, {n:Bb}, is {k:F major}: the one flat key whose name has no flat.',
      },
      { generate: 'key-signature', params: { ask: 'count', maxAccidentals: 7 } },
      { generate: 'key-signature', params: { ask: 'key', maxAccidentals: 6 } },
      {
        type: 'type-answer',
        prompt: 'Type the major key with six sharps.',
        answer: { kind: 'note', value: 'F#', spelling: 'exact' },
        input: 'keypad',
        explain: 'Six sharps end on {n:E#}; a half step above it is {n:F#}. {k:F# major} sounds the same as {k:Gb major}, which is written with six flats.',
      },
      { generate: 'fifths-order', params: { ask: 'keys', count: 4 } },
      {
        type: 'match-pairs',
        prompt: 'Match each key with the key that sounds the same.',
        pairs: [
          { left: '{k:B major}', right: '{k:Cb major}' },
          { left: '{k:F# major}', right: '{k:Gb major}' },
          { left: '{k:C# major}', right: '{k:Db major}' },
        ],
        explain: 'The three enharmonic pairs share the bottom of the circle.',
      },
      {
        type: 'choice',
        prompt: 'Which key is one step anticlockwise from {k:A major}?',
        options: [
          { text: '{k:D major}', correct: true },
          { text: '{k:E major}', why: '{k:E major} is one step clockwise: a fifth up.' },
          { text: '{k:G major}', why: '{k:G major} is two steps anticlockwise.' },
        ],
        explain: 'Anticlockwise is a fifth down: from {n:A} to {n:D}. Three sharps become two.',
      },
      {
        type: 'choice',
        prompt: 'Which key differs from {k:F major} by just one note?',
        options: [
          { text: '{k:C major}', correct: true },
          { text: '{k:G major}', why: '{k:G major} is two steps away from {k:F major}, so two notes change.' },
          { text: '{k:D major}', why: '{k:D major} is three steps away: three notes change.' },
          { text: '{k:Eb major}', why: '{k:Eb major} is two steps away, on the flat side.' },
        ],
        explain: '{k:C major} is {k:F major}\'s clockwise neighbour: it keeps every note except {n:Bb}, which becomes {n:B}.',
      },
      {
        type: 'match-pairs',
        prompt: 'Match each key with its {r:I}, {r:IV} and {r:V} chords.',
        pairs: [
          { left: '{k:A major}', right: '{c:A} {c:D} {c:E}' },
          { left: '{k:F major}', right: '{c:F} {c:Bb} {c:C}' },
          { left: '{k:E major}', right: '{c:E} {c:A} {c:B}' },
        ],
        explain: 'A key\'s {r:I}, {r:IV} and {r:V} are the key and its two neighbours on the circle: D A E, {n:Bb} F C, A E B.',
      },
    ],
  },
};

export default unit;
