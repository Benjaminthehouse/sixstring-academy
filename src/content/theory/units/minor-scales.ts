/**
 * Theory Path, unit 16: The minor scales. Written from the syllabus entries in
 * `src/content/plan/theory-path.json` (unit `minor-scales`), one lesson per entry, in order: each
 * lesson opens with its "on the guitar" picture, asks the planned exercises, ends with the planned
 * drills, and turns every planned fact into a review card.
 *
 * `minor-scales.test.ts` cross-checks every scale spelling, degree, step pattern, relative and
 * parallel key, signature, fret, the fifth-position phrase and what each listening question plays
 * against the theory and guitar engines.
 *
 * Notes for readers of the code:
 * - The planned fifth-position phrase runs from string 6, fret 5 to string 1, fret 8: seventeen
 *   notes, more than a play-phrase may hold (16), and a play step draws its phrase as tab that
 *   cannot scroll on its own, so more than six notes push a 360 px phone sideways. The card shows
 *   the whole climb as tab; the learner plays it in three parts, two strings at a time.
 * - A fretboard figure has one highlight colour (`target`): the shared notes of relative keys, the
 *   lowered notes of C minor, the F to G# gap and the added B and F notes use it, and the captions
 *   name them.
 * - `teaches` is shown as plain text on the map, so it carries no music symbols.
 */
import type { Lesson, TabNote, Unit } from '@/lessons';

const U = 'minor-scales';

/** A natural minor in fifth position, from string 6, fret 5 up to string 1, fret 8 (A2 to C5). */
const FIFTH_POSITION: TabNote[] = [
  { string: 6, fret: 5, duration: 'q' },
  { string: 6, fret: 7, duration: 'q' },
  { string: 6, fret: 8, duration: 'q' },
  { string: 5, fret: 5, duration: 'q' },
  { string: 5, fret: 7, duration: 'q' },
  { string: 5, fret: 8, duration: 'q' },
  { string: 4, fret: 5, duration: 'q' },
  { string: 4, fret: 7, duration: 'q' },
  { string: 3, fret: 4, duration: 'q' },
  { string: 3, fret: 5, duration: 'q' },
  { string: 3, fret: 7, duration: 'q' },
  { string: 2, fret: 5, duration: 'q' },
  { string: 2, fret: 6, duration: 'q' },
  { string: 2, fret: 8, duration: 'q' },
  { string: 1, fret: 5, duration: 'q' },
  { string: 1, fret: 7, duration: 'q' },
  { string: 1, fret: 8, duration: 'h' },
];
/** The same climb two strings at a time (a play step shows its phrase as tab: six notes fit a phone). */
const onStrings = (strings: number[]): TabNote[] =>
  FIFTH_POSITION.filter((n) => 'string' in n && strings.includes(n.string)).map((n) => ({ ...n, duration: 'q' }));
const STRINGS_6_5 = onStrings([6, 5]);
const STRINGS_4_3 = onStrings([4, 3]);
const STRINGS_2_1 = onStrings([2, 1]);

/** D natural minor, then D major, on strings 4 to 2 (the parallel-minor listening question). */
const D_MINOR_THEN_MAJOR: TabNote[] = [
  { string: 4, fret: 0, duration: 'e' },
  { string: 4, fret: 2, duration: 'e' },
  { string: 4, fret: 3, duration: 'e' },
  { string: 3, fret: 0, duration: 'e' },
  { string: 3, fret: 2, duration: 'e' },
  { string: 3, fret: 3, duration: 'e' },
  { string: 2, fret: 1, duration: 'e' },
  { string: 2, fret: 3, duration: 'q' },
  { rest: true, duration: 'h' },
  { string: 4, fret: 0, duration: 'e' },
  { string: 4, fret: 2, duration: 'e' },
  { string: 4, fret: 4, duration: 'e' },
  { string: 3, fret: 0, duration: 'e' },
  { string: 3, fret: 2, duration: 'e' },
  { string: 3, fret: 4, duration: 'e' },
  { string: 2, fret: 2, duration: 'e' },
  { string: 2, fret: 3, duration: 'q' },
];

/** A melody with one sharp (F#) that comes to rest on E: E minor. */
const ENDS_ON_E: TabNote[] = [
  { string: 4, fret: 2, duration: 'q' },
  { string: 3, fret: 0, duration: 'q' },
  { string: 2, fret: 0, duration: 'q' },
  { string: 3, fret: 2, duration: 'q' },
  { string: 3, fret: 0, duration: 'q' },
  { string: 4, fret: 4, duration: 'q' },
  { string: 4, fret: 2, duration: 'h' },
];

const naturalMinor: Lesson = {
  id: 'natural-minor',
  title: 'The natural minor scale',
  teaches: 'Natural minor follows W H W W H W W, which is the major scale with a flat 3rd, 6th and 7th.',
  minutes: 3,
  skill: `theory:${U}:natural-minor`,
  steps: [
    {
      type: 'card',
      title: 'Whole, half, whole, whole ...',
      body: 'The {t:minor-scale|natural minor scale} follows the steps **W H W W H W W** (W a whole step, H a half step). From the open {n:A} string that gives {n:A} {n:B} {n:C} {n:D} {n:E} {n:F} {n:G} {n:A}. The half steps are the one-fret moves: frets 2 to 3 and 7 to 8.',
      figure: {
        kind: 'fretboard',
        frets: [0, 12],
        strings: [5],
        derive: { scale: 'minor', tonic: 'A' },
        caption: '{n:A} natural minor on string 5: frets 0 2 3 5 7 8 10 12.',
      },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the step pattern of natural minor.',
      text: 'W  H  W  W  ___  W  W',
      blanks: ['H'],
      bank: ['W'],
      explain: 'Natural minor goes W H W W H W W. On string 5 the second half step is {n:E} to {n:F}, frets 7 to 8.',
      fact: 'minor-scales-natural-pattern',
    },
    {
      type: 'card',
      title: 'Major, with three notes lowered',
      body: 'Compare natural minor with the major scale on the same {t:tonic}: the 3rd, 6th and 7th are each a half step lower. As degrees, natural minor is {d:1} {d:2} {d:b3} {d:4} {d:5} {d:b6} {d:b7}.',
      figure: { kind: 'audio', sound: { kind: 'scale', tonic: 'A2', scale: 'minor', direction: 'up', tempo: 100 }, label: 'Hear A natural minor' },
    },
    {
      type: 'choice',
      prompt: 'Which degrees are lowered in natural minor, compared with the major scale on the same tonic?',
      options: [
        { text: 'The 3rd, 6th and 7th', correct: true },
        { text: 'The 2nd, 3rd and 6th', why: 'The 2nd stays put: a whole step above the tonic in both scales.' },
        { text: 'Only the 3rd and 7th', why: 'The 6th is lowered too: {d:b6}.' },
        { text: 'The 4th, 5th and 6th', why: 'The 4th and 5th are the same in major and natural minor.' },
      ],
      explain: 'Natural minor is {d:1} {d:2} {d:b3} {d:4} {d:5} {d:b6} {d:b7}: the 3rd, 6th and 7th are a half step lower than in major.',
      fact: 'minor-scales-natural-degrees',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap every note of {n:A} natural minor on string 5, from the open string to fret 12.',
      find: { scale: 'minor', tonic: 'A' },
      mode: 'all',
      octave: 'any',
      frets: [0, 12],
      strings: [5],
      explain: 'Frets 0 2 3 5 7 8 10 12: {n:A} {n:B} {n:C} {n:D} {n:E} {n:F} {n:G} {n:A}. The one-fret moves are the half steps.',
      fact: 'minor-scales-a-natural',
    },
    {
      type: 'true-false',
      statement: '{n:A} natural minor has no sharps or flats.',
      answer: true,
      explain: '{n:A} {n:B} {n:C} {n:D} {n:E} {n:F} {n:G}: all natural notes, the same seven as {k:C major}.',
      fact: 'minor-scales-a-natural',
    },
    {
      type: 'type-answer',
      prompt: 'Type degree {d:b6} of {n:E} natural minor.',
      answer: { kind: 'note', value: 'C', spelling: 'exact' },
      input: 'keypad',
      hint: 'Find the 6th note of {k:E major}, then lower it a half step.',
      explain: '{n:E} natural minor is {n:E} {n:F#} {n:G} {n:A} {n:B} {n:C} {n:D}. Its 6th note is {n:C}: {k:E major} has {n:C#} there, a half step higher.',
      fact: 'minor-scales-natural-degrees',
    },
    { generate: 'scale-formula', params: { scales: ['major', 'minor'] } },
    { generate: 'scale-notes', params: { scales: ['minor'], tonics: ['A', 'E', 'D'], form: 'fill' } },
  ],
  facts: [
    {
      id: 'minor-scales-natural-pattern',
      front: 'What is the step pattern of the natural minor scale?',
      back: 'W H W W H W W: whole, half, whole, whole, half, whole, whole.',
      ask: { generate: 'scale-formula', params: { scales: ['minor'] } },
    },
    {
      id: 'minor-scales-natural-degrees',
      front: 'How does natural minor differ from the major scale on the same tonic?',
      back: 'Its 3rd, 6th and 7th are a half step lower: {d:1} {d:2} {d:b3} {d:4} {d:5} {d:b6} {d:b7}.',
    },
    {
      id: 'minor-scales-a-natural',
      front: 'What are the notes of A natural minor?',
      back: '{n:A} {n:B} {n:C} {n:D} {n:E} {n:F} {n:G}: all natural notes, starting on {n:A}.',
      ask: { generate: 'scale-notes', params: { scales: ['minor'], tonics: ['A'], form: 'order' } },
    },
  ],
};

const relativeMinor: Lesson = {
  id: 'relative-minor',
  title: 'The relative minor',
  teaches: 'Every major key has a relative minor with the same notes, whose tonic is degree 6 of the major scale.',
  minutes: 3,
  skill: `theory:${U}:relative-minor`,
  steps: [
    {
      type: 'card',
      title: 'Same notes, new home',
      body: 'Count up {k:C major}: {n:C} {n:D} {n:E} {n:F} {n:G} **{n:A}**. Start on that 6th note and play the same seven notes, and you get {k:A minor}. Every major key has a {t:relative-minor} like this: the same notes and the same key signature.',
      figure: {
        kind: 'fretboard',
        frets: [2, 5],
        derive: { scale: 'major', tonic: 'C' },
        dots: [
          { string: 6, fret: 5, note: 'A', role: 'target' },
          { string: 3, fret: 2, note: 'A', role: 'target' },
          { string: 1, fret: 5, note: 'A', role: 'target' },
        ],
        caption: 'The notes of {k:C major}, with the tonic of {k:A minor} highlighted.',
      },
    },
    {
      type: 'choice',
      prompt: 'What is the relative minor of {k:D major}?',
      options: [
        { text: '{k:B minor}', correct: true },
        { text: '{k:D minor}', why: '{k:D minor} has the same tonic, but not the same notes: {n:F} and {n:C} instead of {n:F#} and {n:C#}.' },
        { text: '{k:F# minor}', why: '{n:F#} is degree 3 of {k:D major}, not degree 6.' },
        { text: '{k:E minor}', why: '{n:E} is degree 2 of {k:D major}.' },
      ],
      explain: '{k:D major} is {n:D} {n:E} {n:F#} {n:G} {n:A} **{n:B}** {n:C#}. Its 6th note is {n:B}, so {k:B minor} is its relative minor, with the same two sharps.',
      fact: 'minor-scales-relative-sixth',
    },
    {
      type: 'card',
      title: 'Three frets down',
      body: 'The relative minor\'s tonic is also a {i:m3} below the major tonic: three half steps, three frets down one string. From {n:C} at string 5, fret 3, go down three frets to the open string: {n:A}.',
      figure: {
        kind: 'fretboard',
        frets: [0, 4],
        dots: [
          { string: 5, fret: 3, note: 'C', role: 'root' },
          { string: 5, fret: 0, note: 'A', role: 'target' },
        ],
        caption: '{n:C} at fret 3, {n:A} three frets lower: relative keys.',
      },
    },
    {
      type: 'fretboard-find',
      prompt: '{n:C} is at string 5, fret 3. Tap the tonic of its relative minor on the same string.',
      find: { note: 'A2' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 5],
      strings: [5],
      shown: [{ string: 5, fret: 3, note: 'C', role: 'root' }],
      explain: 'Three frets below {n:C} is {n:A}, the open string: {k:A minor} is the relative minor of {k:C major}.',
      fact: 'minor-scales-relative-sixth',
    },
    {
      type: 'type-answer',
      prompt: 'Type the tonic of the relative major of {k:F# minor}.',
      answer: { kind: 'note', value: 'A', spelling: 'exact' },
      input: 'keypad',
      hint: 'The relative major is three half steps above the minor tonic.',
      explain: 'Go up a minor third, three half steps, from {n:F#}: {n:G}, {n:G#}, {n:A}. {k:F# minor} and {k:A major} share three sharps.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each major key with its relative minor.',
      pairs: [
        { left: '{k:C major}', right: '{k:A minor}' },
        { left: '{k:G major}', right: '{k:E minor}' },
        { left: '{k:F major}', right: '{k:D minor}' },
        { left: '{k:D major}', right: '{k:B minor}' },
      ],
      explain: 'Each relative minor starts on degree 6 of its major key, three half steps below its tonic.',
      fact: 'minor-scales-relative-pairs',
    },
    {
      type: 'true-false',
      statement: '{k:G major} and {k:E minor} use exactly the same notes.',
      answer: true,
      explain: 'Both use G A B C D E {n:F#}, with one sharp in the signature. {n:E} is degree 6 of {k:G major}.',
      fact: 'minor-scales-relative-same-notes',
    },
    { generate: 'relative-key', params: { direction: 'minor', maxAccidentals: 2 } },
    { generate: 'relative-key', params: { direction: 'both', maxAccidentals: 3 } },
  ],
  facts: [
    {
      id: 'minor-scales-relative-same-notes',
      front: 'What do a major key and its relative minor share?',
      back: 'The same seven notes and the same key signature. Only the home note is different.',
    },
    {
      id: 'minor-scales-relative-sixth',
      front: 'Where is the tonic of a major key\'s relative minor?',
      back: 'On degree 6 of the major scale: a minor third (three half steps) below the major tonic. From {n:C}: {n:A}.',
      ask: { generate: 'relative-key', params: { direction: 'minor', maxAccidentals: 3 } },
    },
    {
      id: 'minor-scales-relative-pairs',
      front: 'Name the relative minors of C, G and F major.',
      back: '{k:C major} and {k:A minor}; {k:G major} and {k:E minor}; {k:F major} and {k:D minor}.',
      ask: {
        type: 'match-pairs',
        prompt: 'Match each major key with its relative minor.',
        pairs: [
          { left: '{k:C major}', right: '{k:A minor}' },
          { left: '{k:G major}', right: '{k:E minor}' },
          { left: '{k:F major}', right: '{k:D minor}' },
        ],
        explain: 'The relative minor starts on degree 6: {n:A} in C, {n:E} in G, {n:D} in F.',
      },
    },
  ],
};

const parallelMinor: Lesson = {
  id: 'parallel-minor',
  title: 'The parallel minor',
  teaches: 'Parallel major and minor share a tonic but not their notes; relative keys share notes but not a tonic.',
  minutes: 3,
  skill: `theory:${U}:parallel-minor`,
  steps: [
    {
      type: 'card',
      title: 'Same tonic, other notes',
      body: '{k:C major} and {k:C minor} are {t:parallel-key|parallel keys}: both start on {n:C}, but they do not share all their notes. {n:C} natural minor is {n:C} {n:D} {n:Eb} {n:F} {n:G} {n:Ab} {n:Bb}: the 3rd, 6th and 7th of {k:C major}, each lowered.',
      figure: {
        kind: 'fretboard',
        frets: [3, 6],
        strings: [5, 4, 3],
        derive: { scale: 'minor', tonic: 'C' },
        dots: [
          { string: 5, fret: 6, note: 'Eb', role: 'target' },
          { string: 4, fret: 6, note: 'Ab', role: 'target' },
          { string: 3, fret: 3, note: 'Bb', role: 'target' },
        ],
        caption: '{n:C} natural minor from string 5, fret 3, with {n:Eb}, {n:Ab}, {n:Bb} highlighted.',
      },
    },
    {
      type: 'choice',
      prompt: 'What is the parallel minor of {k:G major}?',
      options: [
        { text: '{k:G minor}', correct: true },
        { text: '{k:E minor}', why: '{k:E minor} is the relative minor: the same notes, another tonic.' },
        { text: '{k:D minor}', why: 'A parallel key keeps the tonic, {n:G}.' },
        { text: '{k:B minor}', why: 'A parallel key keeps the tonic, {n:G}.' },
      ],
      explain: 'Parallel keys share their tonic: {k:G major} and {k:G minor} both start on {n:G}.',
      fact: 'minor-scales-parallel-meaning',
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete {n:C} natural minor.',
      text: '{n:C}  {n:D}  ___  {n:F}  {n:G}  ___  ___',
      blanks: ['{n:Eb}', '{n:Ab}', '{n:Bb}'],
      bank: ['{n:E}', '{n:A}', '{n:B}'],
      explain: '{n:C} natural minor lowers the 3rd, 6th and 7th of {k:C major}: {n:Eb}, {n:Ab} and {n:Bb}. That makes three flats.',
      fact: 'minor-scales-c-minor',
    },
    {
      type: 'card',
      title: 'Hear the difference',
      body: 'Same first note, same last note, a different mood. Listen to {n:C} major, then {n:C} natural minor: the three lowered notes darken the second one.',
      figure: {
        kind: 'audio',
        sound: { kind: 'notes', notes: ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4', 'C3', 'D3', 'Eb3', 'F3', 'G3', 'Ab3', 'Bb3', 'C4'], tempo: 132 },
        label: 'Hear C major, then C minor',
      },
    },
    {
      type: 'listen-choice',
      prompt: 'Two scales on the same tonic, {n:D}. Which one was minor?',
      sound: { kind: 'tab', notes: D_MINOR_THEN_MAJOR, tempo: 100 },
      options: [{ text: 'The first', correct: true }, { text: 'The second' }],
      shuffle: false,
      explain: 'The first had {n:F}, {n:Bb} and {n:C}: {n:D} natural minor. The second had {n:F#}, {n:B} and {n:C#}: {n:D} major.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each description with its key.',
      pairs: [
        { left: 'Relative minor of C', right: '{k:A minor}' },
        { left: 'Parallel minor of C', right: '{k:C minor}' },
        { left: 'Relative minor of G', right: '{k:E minor}' },
        { left: 'Parallel minor of G', right: '{k:G minor}' },
      ],
      explain: 'A relative minor shares the notes and starts on degree 6. A parallel minor shares the tonic.',
      fact: 'minor-scales-relative-vs-parallel',
    },
    {
      type: 'true-false',
      statement: 'Relative keys share a tonic; parallel keys share their notes.',
      answer: false,
      explain: 'It is the other way round: relative keys share their notes ({k:C major} and {k:A minor}); parallel keys share a tonic ({k:C major} and {k:C minor}).',
      fact: 'minor-scales-relative-vs-parallel',
    },
    { generate: 'scale-notes', params: { scales: ['minor', 'major'], tonics: ['C', 'G', 'A', 'D', 'E'], form: 'odd-one-out' } },
    { generate: 'scale-notes', params: { scales: ['minor'], tonics: ['C', 'G', 'D', 'A'], form: 'fill' } },
  ],
  facts: [
    {
      id: 'minor-scales-parallel-meaning',
      front: 'What are parallel major and minor keys?',
      back: 'Keys that share the same tonic, such as {k:C major} and {k:C minor}.',
    },
    {
      id: 'minor-scales-c-minor',
      front: 'What are the notes of C natural minor?',
      back: '{n:C} {n:D} {n:Eb} {n:F} {n:G} {n:Ab} {n:Bb}, with three flats in its key signature.',
      ask: { generate: 'scale-notes', params: { scales: ['minor'], tonics: ['C'], form: 'fill' } },
    },
    {
      id: 'minor-scales-relative-vs-parallel',
      front: 'What do relative keys share? And parallel keys?',
      back: 'Relative keys share their notes ({k:C major} and {k:A minor}). Parallel keys share a tonic ({k:C major} and {k:C minor}).',
      ask: {
        type: 'true-false',
        statement: '{k:C major} and {k:C minor} are relative keys.',
        answer: false,
        explain: 'They share a tonic, so they are parallel keys. The relative minor of {k:C major} is {k:A minor}, with the same notes.',
      },
    },
  ],
};

const minorKeySignatures: Lesson = {
  id: 'minor-key-signatures',
  title: 'Minor key signatures',
  teaches: 'A minor key uses its relative major\'s key signature, so each signature belongs to one major and one minor key.',
  minutes: 3,
  skill: `theory:${U}:minor-key-signatures`,
  steps: [
    {
      type: 'card',
      title: 'One signature, two keys',
      body: 'A minor key uses the key signature of its relative major. One sharp is {k:G major} **or** {k:E minor}. To find the minor key of a signature, find the major key, then go down a {i:m3}: three half steps.',
      figure: { kind: 'staff', key: 'G major', notes: [], caption: 'One sharp: {k:G major} or {k:E minor}.' },
    },
    {
      type: 'choice',
      prompt: 'Which minor key has two sharps?',
      options: [
        { text: '{k:B minor}', correct: true },
        { text: '{k:D minor}', why: '{k:D minor} has one flat. Two sharps is {k:D major}, and its relative minor is three half steps lower.' },
        { text: '{k:E minor}', why: '{k:E minor} has one sharp, like {k:G major}.' },
        { text: '{k:F# minor}', why: '{k:F# minor} has three sharps, like {k:A major}.' },
      ],
      explain: 'Two sharps is {k:D major}. Go down a minor third from {n:D}: {n:B}. So two sharps is also {k:B minor}.',
      fact: 'minor-scales-signature-method',
    },
    {
      type: 'card',
      title: 'Two flats: G minor',
      body: 'Two flats is {k:Bb major}. Three half steps below {n:Bb} is {n:G}, so two flats is also {k:G minor}. The same works for every signature, sharps or flats.',
      figure: { kind: 'staff', key: 'Bb major', notes: [], caption: 'Two flats: {k:Bb major} or {k:G minor}.' },
    },
    {
      type: 'choice',
      prompt: 'A key signature has three flats. Which minor key is it?',
      options: [
        { text: '{k:C minor}', correct: true },
        { text: '{k:Eb minor}', why: '{k:Eb minor} has six flats. Three flats is {k:Eb major}; its relative minor is three half steps lower.' },
        { text: '{k:G minor}', why: '{k:G minor} has two flats.' },
        { text: '{k:F minor}', why: '{k:F minor} has four flats.' },
      ],
      explain: 'Three flats is {k:Eb major}. A minor third below {n:Eb} is {n:C}: three flats is also {k:C minor}.',
      fact: 'minor-scales-signature-method',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each key signature with its minor key.',
      pairs: [
        { left: '1 sharp', right: '{k:E minor}' },
        { left: '2 sharps', right: '{k:B minor}' },
        { left: '1 flat', right: '{k:D minor}' },
        { left: '2 flats', right: '{k:G minor}' },
      ],
      explain: 'Find the major key, then go down three half steps: G to E, D to B, F to D, {n:Bb} to G.',
      fact: 'minor-scales-signature-shared',
    },
    {
      type: 'card',
      title: 'Which one is home?',
      body: 'The signature cannot tell {k:G major} from {k:E minor}. The music can: the chord and note it treats as home, usually where it ends. On string 6 the two tonics sit three frets apart: the open {n:E} and {n:G} at fret 3.',
      figure: {
        kind: 'fretboard',
        frets: [0, 4],
        dots: [
          { string: 6, fret: 0, note: 'E', role: 'root' },
          { string: 6, fret: 3, note: 'G', role: 'target' },
        ],
        caption: 'One sharp: {n:E} for the minor key, {n:G} for the major key.',
      },
    },
    {
      type: 'listen-choice',
      prompt: 'This melody uses one sharp, {n:F#}. Where does it come to rest?',
      sound: { kind: 'tab', notes: ENDS_ON_E, tempo: 90 },
      options: [{ text: 'On {n:G}: {k:G major}' }, { text: 'On {n:E}: {k:E minor}', correct: true }],
      shuffle: false,
      explain: 'It settled on {n:E}, so it is in {k:E minor}. The same notes coming home to {n:G} would sound like {k:G major}.',
    },
    {
      type: 'choice',
      prompt: 'A piece has one sharp in its signature. How can you tell whether it is in {k:G major} or {k:E minor}?',
      options: [
        { text: 'By the chord and note it treats as home', correct: true },
        { text: 'By the number of sharps', why: 'Both keys have the same single sharp.' },
        { text: 'By where the sharp is written', why: 'The signature is the same for both keys.' },
      ],
      explain: 'Only the music can tell: a piece in {k:E minor} keeps coming home to {n:E} and the {c:Em} chord, usually ending there.',
      fact: 'minor-scales-home-decides',
    },
    { generate: 'key-signature', params: { ask: 'count', modes: ['minor'], maxAccidentals: 3 } },
    { generate: 'relative-key', params: { direction: 'both', maxAccidentals: 4 } },
  ],
  facts: [
    {
      id: 'minor-scales-signature-shared',
      front: 'Which key signature does a minor key use?',
      back: 'The signature of its relative major: {k:A minor} has none, like {k:C major}; {k:E minor} has one sharp, like {k:G major}.',
    },
    {
      id: 'minor-scales-signature-method',
      front: 'How do you find the minor key of a key signature?',
      back: 'Find the major key, then go down a minor third: one sharp is {k:G major} or {k:E minor}.',
      ask: { generate: 'key-signature', params: { ask: 'key', modes: ['minor'], maxAccidentals: 3 } },
    },
    {
      id: 'minor-scales-home-decides',
      front: 'A key signature fits one major and one minor key. What shows which one a piece is in?',
      back: 'The chord and note the music treats as home, usually where it ends.',
    },
  ],
};

const harmonicMinor: Lesson = {
  id: 'harmonic-minor',
  title: 'Harmonic minor',
  teaches: 'Harmonic minor raises the 7th of natural minor, giving a leading tone and a major V chord.',
  minutes: 4,
  skill: `theory:${U}:harmonic-minor`,
  steps: [
    {
      type: 'card',
      title: 'Raise the 7th',
      body: '{t:harmonic-minor|Harmonic minor} is natural minor with the 7th raised a half step: {d:1} {d:2} {d:b3} {d:4} {d:5} {d:b6} {d:7}. In {n:A}, the {n:G} becomes {n:G#}: {n:A} {n:B} {n:C} {n:D} {n:E} {n:F} {n:G#}.',
      figure: {
        kind: 'fretboard',
        frets: [0, 12],
        strings: [5],
        derive: { scale: 'harmonic-minor', tonic: 'A' },
        dots: [
          { string: 5, fret: 8, note: 'F', role: 'target' },
          { string: 5, fret: 11, note: 'G#', role: 'target' },
        ],
        caption: 'String 5: frets 0 2 3 5 7 8 11 12. {n:F} to {n:G#} is three frets.',
      },
    },
    {
      type: 'type-answer',
      prompt: 'Type the raised 7th of {n:D} harmonic minor.',
      answer: { kind: 'note', value: 'C#', spelling: 'exact' },
      input: 'keypad',
      hint: 'The 7th of {n:D} natural minor is {n:C}.',
      explain: '{n:D} natural minor is {n:D} {n:E} {n:F} {n:G} {n:A} {n:Bb} {n:C}. Raise the 7th a half step: {n:C#}. Its letter stays C, so it is not {n:Db}.',
      fact: 'minor-scales-harmonic-formula',
    },
    {
      type: 'card',
      title: 'A leading tone and a major V',
      body: 'The raised 7th sits a half step below the tonic, so it pulls up into it: a {t:leading-tone}. It also changes the chord on degree 5: {c:Em} ({n:E} {n:G} {n:B}) becomes {c:E} ({n:E} {n:G#} {n:B}), a major {r:V} in {k:A minor}.',
      figure: { kind: 'chord', symbol: 'E', frets: '022100', caption: '{c:E}: {n:G#} at string 3, fret 1. {c:Em} (022000) has the open {n:G}.' },
    },
    {
      type: 'choice',
      prompt: 'In {k:A minor}, what does the raised 7th do to the chord on degree 5?',
      options: [
        { text: 'Turns {c:Em} into {c:E}', correct: true },
        { text: 'Turns {c:E} into {c:Em}', why: 'Raising {n:G} to {n:G#} makes the chord major, not minor.' },
        { text: 'Turns {c:Em} into {c:E7}', why: '{c:E7} adds a {n:D}. Raising {n:G} to {n:G#} changes the third.' },
      ],
      explain: 'The chord on degree 5 is {n:E} {n:G} {n:B}. Raising {n:G} to {n:G#} gives {n:E} {n:G#} {n:B}: {c:E}, a major chord.',
      fact: 'minor-scales-harmonic-leading-tone',
    },
    {
      type: 'card',
      title: 'The gap',
      body: 'Raising the 7th leaves a wide step between degrees {d:b6} and {d:7}: {n:F} to {n:G#} in {n:A}, three half steps. It is an {t:augmented-second}, {i:A2}, and it gives harmonic minor its distinctive sound.',
      figure: { kind: 'audio', sound: { kind: 'scale', tonic: 'A2', scale: 'harmonic-minor', direction: 'up', tempo: 100 }, label: 'Hear A harmonic minor' },
    },
    {
      type: 'choice',
      prompt: 'How many half steps are there between degrees {d:b6} and {d:7} of harmonic minor?',
      options: [
        { text: '1', why: 'One half step is {d:7} up to the tonic: {n:G#} to {n:A}.' },
        { text: '2', why: 'That would be a whole step. From {n:F} to {n:G#} is {n:F#}, {n:G}, {n:G#}: three.' },
        { text: '3', correct: true },
        { text: '4' },
      ],
      shuffle: false,
      explain: 'From {d:b6} to {d:7} is three half steps: {n:F} to {n:G#} in {n:A}, frets 8 to 11 on string 5. It is an augmented second.',
      fact: 'minor-scales-harmonic-gap',
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete {n:A} harmonic minor.',
      text: '{n:A}  {n:B}  {n:C}  {n:D}  {n:E}  ___  ___',
      blanks: ['{n:F}', '{n:G#}'],
      bank: ['{n:F#}', '{n:G}'],
      explain: 'Harmonic minor keeps the {d:b6} of natural minor, {n:F}, and raises the 7th, {n:G}, to {n:G#}.',
      fact: 'minor-scales-harmonic-a',
    },
    {
      type: 'listen-choice',
      prompt: 'Natural minor or harmonic minor?',
      sound: { kind: 'scale', tonic: 'D3', scale: 'harmonic-minor', direction: 'up', tempo: 100 },
      options: [{ text: 'Natural minor' }, { text: 'Harmonic minor', correct: true }],
      shuffle: false,
      explain: 'Listen near the top: the wide step from {n:Bb} up to {n:C#}, then a half step into {n:D}. That is {n:D} harmonic minor.',
    },
    { generate: 'scale-notes', params: { scales: ['harmonic-minor'], tonics: ['A', 'E', 'D'], form: 'order' } },
    { generate: 'scale-ear', params: { scales: ['minor', 'harmonic-minor'] } },
  ],
  facts: [
    {
      id: 'minor-scales-harmonic-formula',
      front: 'What is harmonic minor?',
      back: 'Natural minor with a raised 7th: {d:1} {d:2} {d:b3} {d:4} {d:5} {d:b6} {d:7}.',
    },
    {
      id: 'minor-scales-harmonic-a',
      front: 'What are the notes of A harmonic minor?',
      back: '{n:A} {n:B} {n:C} {n:D} {n:E} {n:F} {n:G#}.',
      ask: { generate: 'scale-notes', params: { scales: ['harmonic-minor'], tonics: ['A'], form: 'fill' } },
    },
    {
      id: 'minor-scales-harmonic-leading-tone',
      front: 'What does the raised 7th of harmonic minor do?',
      back: 'It is a leading tone, a half step below the tonic, and it makes the chord on degree 5 major: {c:E} instead of {c:Em} in {k:A minor}.',
    },
    {
      id: 'minor-scales-harmonic-gap',
      front: 'What is the step from {d:b6} to {d:7} in harmonic minor?',
      back: 'An augmented second: three half steps, {n:F} to {n:G#} in {n:A}. It gives harmonic minor its distinctive sound.',
    },
  ],
};

const melodicMinor: Lesson = {
  id: 'melodic-minor',
  title: 'Melodic minor',
  teaches: 'Melodic minor raises both the 6th and the 7th of natural minor, smoothing out the augmented second.',
  minutes: 3,
  skill: `theory:${U}:melodic-minor`,
  steps: [
    {
      type: 'card',
      title: 'Raise the 6th as well',
      body: '{t:melodic-minor|Melodic minor} raises both the 6th and the 7th of natural minor: {d:1} {d:2} {d:b3} {d:4} {d:5} {d:6} {d:7}. In {n:A}: {n:A} {n:B} {n:C} {n:D} {n:E} {n:F#} {n:G#}. The three-fret gap is gone.',
      figure: {
        kind: 'fretboard',
        frets: [0, 12],
        strings: [5],
        derive: { scale: 'melodic-minor', tonic: 'A' },
        caption: 'String 5: frets 0 2 3 5 7 9 11 12. No step wider than two frets.',
      },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete {n:A} melodic minor, going up.',
      text: '{n:A}  {n:B}  {n:C}  {n:D}  {n:E}  ___  ___  {n:A}',
      blanks: ['{n:F#}', '{n:G#}'],
      bank: ['{n:F}', '{n:G}'],
      explain: 'Melodic minor raises the 6th and 7th of natural minor: {n:F} becomes {n:F#} and {n:G} becomes {n:G#}.',
      fact: 'minor-scales-melodic-a',
    },
    {
      type: 'choice',
      prompt: 'Melodic minor differs from the major scale on the same tonic by one note. Which degree?',
      options: [
        { text: 'The 3rd', correct: true },
        { text: 'The 6th', why: 'Melodic minor raises the 6th, so there it matches major.' },
        { text: 'The 7th', why: 'The 7th is raised too: the same as major.' },
        { text: 'The 5th', why: 'The 5th is the same in every one of these scales.' },
      ],
      explain: 'Melodic minor is {d:1} {d:2} {d:b3} {d:4} {d:5} {d:6} {d:7}: only the {d:b3} differs from major. {n:A} melodic minor has {n:C} where {k:A major} has {n:C#}.',
      fact: 'minor-scales-melodic-formula',
    },
    {
      type: 'card',
      title: 'Up one way, down another',
      body: 'In classical music melodic minor is played raised going up, and as natural minor coming down: {n:G}, {n:F}, {n:E}. In jazz the raised form is used both ways.',
      figure: {
        kind: 'audio',
        sound: { kind: 'notes', notes: ['A2', 'B2', 'C3', 'D3', 'E3', 'F#3', 'G#3', 'A3', 'G3', 'F3', 'E3', 'D3', 'C3', 'B2', 'A2'], tempo: 120 },
        label: 'Up melodic, down natural',
      },
    },
    {
      type: 'true-false',
      statement: 'In classical music, melodic minor keeps its raised 6th and 7th coming down as well as going up.',
      answer: false,
      explain: 'Classical music raises them going up and uses natural minor coming down. Jazz keeps the raised form both ways.',
      fact: 'minor-scales-melodic-up-down',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each minor scale with its top three degrees.',
      pairs: [
        { left: 'Natural minor', right: '{d:5} {d:b6} {d:b7}' },
        { left: 'Harmonic minor', right: '{d:5} {d:b6} {d:7}' },
        { left: 'Melodic minor', right: '{d:5} {d:6} {d:7}' },
      ],
      explain: 'All three share {d:1} {d:2} {d:b3} {d:4} {d:5}. Harmonic minor raises the 7th; melodic minor raises the 6th and the 7th.',
    },
    {
      type: 'listen-choice',
      prompt: 'Which minor scale did you hear?',
      sound: { kind: 'scale', tonic: 'A2', scale: 'melodic-minor', direction: 'up', tempo: 100 },
      options: [{ text: 'Natural minor' }, { text: 'Harmonic minor' }, { text: 'Melodic minor', correct: true }],
      shuffle: false,
      explain: 'The 6th and 7th were both raised, {n:F#} and {n:G#}, with no wide gap: {n:A} melodic minor.',
    },
    { generate: 'scale-notes', params: { scales: ['melodic-minor', 'harmonic-minor'], tonics: ['A', 'E', 'D'], form: 'fill' } },
    { generate: 'scale-ear', params: { scales: ['minor', 'harmonic-minor', 'melodic-minor'] } },
  ],
  facts: [
    {
      id: 'minor-scales-melodic-formula',
      front: 'What is melodic minor?',
      back: 'Natural minor with a raised 6th and 7th: {d:1} {d:2} {d:b3} {d:4} {d:5} {d:6} {d:7}. It is the major scale with a {d:b3}.',
    },
    {
      id: 'minor-scales-melodic-a',
      front: 'What are the notes of A melodic minor?',
      back: '{n:A} {n:B} {n:C} {n:D} {n:E} {n:F#} {n:G#}.',
      ask: { generate: 'scale-notes', params: { scales: ['melodic-minor'], tonics: ['A'], form: 'fill' } },
    },
    {
      id: 'minor-scales-melodic-up-down',
      front: 'How is melodic minor used in classical music? And in jazz?',
      back: 'Classical: the raised 6th and 7th going up, natural minor coming down. Jazz: the raised form both ways.',
    },
  ],
};

const minorInFifthPosition: Lesson = {
  id: 'minor-in-fifth-position',
  title: 'A minor in fifth position',
  teaches: 'A natural minor in fifth position is box 1 of A minor pentatonic with two notes added: B and F.',
  minutes: 4,
  skill: `theory:${U}:minor-in-fifth-position`,
  steps: [
    {
      type: 'card',
      title: 'Fifth position',
      body: 'In fifth {t:position} your first finger covers fret 5 and each finger takes one fret: fingers 1 2 3 4 on frets 5 6 7 8. Box 1 of {n:A} minor pentatonic lives here. Add two notes, {n:B} and {n:F}, and it becomes {n:A} natural minor.',
      figure: {
        kind: 'fretboard',
        frets: [4, 8],
        derive: { scale: 'minor-pentatonic', tonic: 'A' },
        dots: [
          { string: 6, fret: 7, note: 'B', role: 'target' },
          { string: 5, fret: 8, note: 'F', role: 'target' },
          { string: 3, fret: 4, note: 'B', role: 'target' },
          { string: 2, fret: 6, note: 'F', role: 'target' },
          { string: 1, fret: 7, note: 'B', role: 'target' },
        ],
        caption: 'Box 1 of {n:A} minor pentatonic, with the added {n:B} and {n:F} highlighted.',
      },
    },
    {
      type: 'choice',
      prompt: 'Which two notes turn {n:A} minor pentatonic into {n:A} natural minor?',
      options: [
        { text: '{n:B} and {n:F}', correct: true },
        { text: '{n:B} and {n:F#}', why: '{n:A} natural minor has a plain {n:F}: no sharps at all.' },
        { text: '{n:C} and {n:G}', why: 'Those are already in the pentatonic: A C D E G.' },
        { text: '{n:Bb} and {n:F}', why: '{n:A} natural minor has a plain {n:B}, a whole step above {n:A}.' },
      ],
      explain: 'The pentatonic is {n:A} {n:C} {n:D} {n:E} {n:G}. Add {n:B} (degree 2) and {n:F} (degree {d:b6}) and you have all seven: A B C D E F G.',
      fact: 'minor-scales-pentatonic-plus',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap every {n:F} in fifth position, frets 4 to 8.',
      find: { note: 'F' },
      mode: 'all',
      octave: 'any',
      frets: [4, 8],
      explain: 'Two {n:F}s: string 5 at fret 8, under your fourth finger, and string 2 at fret 6, under your second.',
      fact: 'minor-scales-fifth-position-f',
    },
    {
      type: 'card',
      title: 'The added B notes',
      body: 'The {n:B} notes sit at string 6, fret 7, string 1, fret 7, and string 3, fret 4. That last one is a stretch: reach back with your first finger to fret 4, then return to fret 5.',
      figure: {
        kind: 'fretboard',
        frets: [4, 8],
        dots: [
          { string: 6, fret: 7, note: 'B', finger: 3, role: 'target' },
          { string: 3, fret: 4, note: 'B', finger: 1, role: 'target' },
          { string: 1, fret: 7, note: 'B', finger: 3, role: 'target' },
        ],
        caption: 'The three {n:B}s of fifth position. String 3, fret 4 is the stretch.',
      },
      tip: 'Keep your thumb behind the neck near fret 5. Only the first finger moves back, and only for that one note.',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap every {n:B} in fifth position, frets 4 to 8.',
      find: { note: 'B' },
      mode: 'all',
      octave: 'any',
      frets: [4, 8],
      explain: 'Three {n:B}s: string 6 at fret 7, string 3 at fret 4 (the stretch) and string 1 at fret 7.',
      fact: 'minor-scales-fifth-position-b',
    },
    {
      type: 'card',
      title: 'Two strings at a time',
      body: 'Now climb {n:A} natural minor from string 6, fret 5 to string 1, fret 8: one finger per fret, with the stretch on string 3. Learn it two strings at a time, then join the three parts.',
      figure: { kind: 'tab', notes: FIFTH_POSITION, tempo: 80, caption: '{n:A} natural minor in fifth position, from {n:A} up to {n:C}.' },
    },
    {
      type: 'play-phrase',
      prompt: 'Strings 6 and 5: play frets 5, 7, 8, then 5, 7, 8.',
      notes: STRINGS_6_5,
      octave: 'exact',
      tempo: 70,
      explain: '{n:A} {n:B} {n:C} on string 6, then {n:D} {n:E} {n:F} on string 5: fingers 1, 3 and 4 on each string.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap every note of {n:A} natural minor on strings 6 and 5, frets 4 to 8.',
        find: { scale: 'minor', tonic: 'A' },
        mode: 'all',
        octave: 'any',
        frets: [4, 8],
        strings: [6, 5],
        explain: 'String 6: frets 5 7 8 ({n:A} {n:B} {n:C}). String 5: frets 5 7 8 ({n:D} {n:E} {n:F}).',
      },
    },
    {
      type: 'play-phrase',
      prompt: 'Strings 4 and 3: play frets 5, 7, then 4, 5, 7. Stretch back for fret 4.',
      notes: STRINGS_4_3,
      octave: 'exact',
      tempo: 70,
      explain: '{n:G} {n:A} on string 4, then {n:B} {n:C} {n:D} on string 3. The {n:B} at fret 4 is the stretch with your first finger.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap every note of {n:A} natural minor on strings 4 and 3, frets 4 to 8.',
        find: { scale: 'minor', tonic: 'A' },
        mode: 'all',
        octave: 'any',
        frets: [4, 8],
        strings: [4, 3],
        explain: 'String 4: frets 5 7 ({n:G} {n:A}). String 3: frets 4 5 7 ({n:B} {n:C} {n:D}).',
      },
    },
    {
      type: 'play-phrase',
      prompt: 'Strings 2 and 1: play frets 5, 6, 8, then 5, 7, 8.',
      notes: STRINGS_2_1,
      octave: 'exact',
      tempo: 70,
      explain: '{n:E} {n:F} {n:G} on string 2, then {n:A} {n:B} {n:C} on string 1. Join all three parts and you have the whole position.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap every note of {n:A} natural minor on strings 2 and 1, frets 4 to 8.',
        find: { scale: 'minor', tonic: 'A' },
        mode: 'all',
        octave: 'any',
        frets: [4, 8],
        strings: [2, 1],
        explain: 'String 2: frets 5 6 8 ({n:E} {n:F} {n:G}). String 1: frets 5 7 8 ({n:A} {n:B} {n:C}).',
      },
    },
    { generate: 'neck-tones', params: { what: 'scale', scales: ['minor'], tonics: ['A'], strings: [3, 2, 1], span: 5 } },
    { generate: 'scale-notes', params: { scales: ['minor-pentatonic', 'minor'], tonics: ['A', 'E', 'D'], form: 'odd-one-out' } },
  ],
  facts: [
    {
      id: 'minor-scales-pentatonic-plus',
      front: 'Which two notes turn A minor pentatonic into A natural minor?',
      back: '{n:B} (degree 2) and {n:F} (degree {d:b6}).',
    },
    {
      id: 'minor-scales-fifth-position-b',
      front: 'In fifth position, where are the added B notes?',
      back: 'String 6, fret 7; string 3, fret 4 (a stretch back); string 1, fret 7.',
      ask: {
        type: 'fretboard-find',
        prompt: 'Tap every {n:B} in fifth position, frets 4 to 8.',
        find: { note: 'B' },
        mode: 'all',
        octave: 'any',
        frets: [4, 8],
        explain: 'String 6 at fret 7, string 3 at fret 4 and string 1 at fret 7.',
      },
    },
    {
      id: 'minor-scales-fifth-position-f',
      front: 'In fifth position, where are the added F notes?',
      back: 'String 5, fret 8 and string 2, fret 6.',
      ask: {
        type: 'fretboard-find',
        prompt: 'Tap every {n:F} in fifth position, frets 4 to 8.',
        find: { note: 'F' },
        mode: 'all',
        octave: 'any',
        frets: [4, 8],
        explain: 'String 5 at fret 8 and string 2 at fret 6.',
      },
    },
  ],
};

/** Unit 16 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'The minor scales',
  theme: 'scales',
  description: 'Natural, harmonic and melodic minor, relative and parallel keys, minor key signatures, and minor on the neck.',
  lessons: [naturalMinor, relativeMinor, parallelMinor, minorKeySignatures, harmonicMinor, melodicMinor, minorInFifthPosition],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      { generate: 'scale-formula', params: { scales: ['minor'] } },
      {
        type: 'choice',
        prompt: 'Which degrees make up natural minor?',
        options: [
          { text: '{d:1} {d:2} {d:b3} {d:4} {d:5} {d:b6} {d:b7}', correct: true },
          { text: '{d:1} {d:2} {d:b3} {d:4} {d:5} {d:b6} {d:7}', why: 'That is harmonic minor, with a raised 7th.' },
          { text: '{d:1} {d:2} {d:b3} {d:4} {d:5} {d:6} {d:7}', why: 'That is melodic minor, with a raised 6th and 7th.' },
          { text: '{d:1} {d:2} {d:3} {d:4} {d:5} {d:6} {d:7}', why: 'That is the major scale.' },
        ],
        explain: 'Natural minor is the major scale with its 3rd, 6th and 7th lowered: {d:1} {d:2} {d:b3} {d:4} {d:5} {d:b6} {d:b7}.',
      },
      { generate: 'relative-key', params: { direction: 'both', maxAccidentals: 4 } },
      {
        type: 'choice',
        prompt: 'What is the parallel minor of {k:D major}?',
        options: [
          { text: '{k:D minor}', correct: true },
          { text: '{k:B minor}', why: '{k:B minor} is the relative minor: the same notes, another tonic.' },
          { text: '{k:A minor}', why: 'A parallel key keeps the tonic, {n:D}.' },
        ],
        explain: 'Parallel keys share their tonic: {k:D major} and {k:D minor}.',
      },
      {
        type: 'true-false',
        statement: 'Relative keys share a tonic.',
        answer: false,
        explain: 'Relative keys share their notes and key signature; parallel keys share a tonic.',
      },
      { generate: 'key-signature', params: { ask: 'key', modes: ['minor'], maxAccidentals: 4 } },
      {
        type: 'choice',
        prompt: 'Which minor key has three sharps?',
        options: [
          { text: '{k:F# minor}', correct: true },
          { text: '{k:A minor}', why: '{k:A minor} has no sharps. Three sharps is {k:A major}; go down a minor third.' },
          { text: '{k:C# minor}', why: '{k:C# minor} has four sharps.' },
          { text: '{k:B minor}', why: '{k:B minor} has two sharps.' },
        ],
        explain: 'Three sharps is {k:A major}. A minor third below {n:A} is {n:F#}: {k:F# minor}.',
      },
      {
        type: 'type-answer',
        prompt: 'Type the raised 7th of {n:E} harmonic minor.',
        answer: { kind: 'note', value: 'D#', spelling: 'exact' },
        input: 'keypad',
        explain: '{n:E} natural minor has {n:D} as its 7th. Raised a half step it is {n:D#}, the leading tone of {k:E minor}.',
      },
      {
        type: 'choice',
        prompt: 'How many half steps are there between degrees {d:b6} and {d:7} of harmonic minor?',
        options: [{ text: '1' }, { text: '2' }, { text: '3', correct: true }, { text: '4' }],
        shuffle: false,
        explain: 'Three: an augmented second, {n:F} to {n:G#} in {n:A}.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Complete {n:A} melodic minor, going up.',
        text: '{n:A}  {n:B}  {n:C}  {n:D}  {n:E}  ___  ___',
        blanks: ['{n:F#}', '{n:G#}'],
        bank: ['{n:F}', '{n:G}'],
        explain: 'Melodic minor raises the 6th and the 7th of natural minor: {n:F#} and {n:G#}.',
      },
      {
        type: 'true-false',
        statement: 'In classical music, melodic minor comes down as natural minor.',
        answer: true,
        explain: 'Classical music raises the 6th and 7th going up and uses natural minor coming down.',
      },
      { generate: 'scale-ear', params: { scales: ['minor', 'harmonic-minor', 'melodic-minor'] } },
      {
        type: 'choice',
        prompt: 'Which two notes turn {n:A} minor pentatonic into {n:A} natural minor?',
        options: [
          { text: '{n:B} and {n:F}', correct: true },
          { text: '{n:B} and {n:F#}', why: '{n:A} natural minor has a plain {n:F}.' },
          { text: '{n:C} and {n:G}', why: 'Those are already in the pentatonic.' },
        ],
        explain: 'A C D E G plus {n:B} and {n:F} gives A B C D E F G.',
      },
      {
        type: 'fretboard-find',
        prompt: 'Tap every {n:F} in fifth position, frets 4 to 8.',
        find: { note: 'F' },
        mode: 'all',
        octave: 'any',
        frets: [4, 8],
        explain: 'String 5 at fret 8 and string 2 at fret 6.',
      },
    ],
  },
};

export default unit;
