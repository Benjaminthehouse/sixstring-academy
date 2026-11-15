/**
 * Demo course, unit 2: half and whole steps, the major scale, first chords and first rhythms.
 * `demo.test.ts` cross-checks its facts against the theory and guitar engines.
 */
import type { Lesson, Unit } from '../types';

const halfAndWholeSteps: Lesson = {
  id: 'half-and-whole-steps',
  title: 'Half steps and whole steps',
  teaches: 'A half step is one fret and a whole step is two; twelve half steps make an octave.',
  minutes: 4,
  skill: 'theory:building-blocks:half-and-whole-steps',
  steps: [
    {
      type: 'card',
      title: 'The half step',
      body: 'A {t:half-step} is the smallest move in music: **one fret**. A {t:whole-step} is two half steps: **two frets**.',
      figure: {
        kind: 'fretboard',
        frets: [0, 4],
        dots: [
          { string: 6, fret: 1, note: 'F', role: 'root' },
          { string: 6, fret: 2, note: 'F#' },
          { string: 6, fret: 3, note: 'G' },
        ],
        caption: '{n:F} to {n:F#} is a half step. {n:F} to {n:G} is a whole step.',
      },
    },
    {
      type: 'choice',
      prompt: 'How many frets is a whole step?',
      options: [{ text: '1' }, { text: '2', correct: true }, { text: '3' }, { text: '12' }],
      shuffle: false,
      explain: 'A whole step is two half steps, and each half step is one fret: two frets.',
      fact: 'half-step',
    },
    { generate: 'step-up' },
    {
      type: 'true-false',
      statement: '{n:B} up to {n:C} is a whole step.',
      answer: false,
      explain: '{n:B} to {n:C} is only a half step: there is no note between them. The same goes for {n:E} to {n:F}.',
    },
    {
      type: 'card',
      title: 'Naming the distance',
      body: 'The distance between two notes is called an {t:interval}. Small ones first: a half step is a **minor second**, a whole step a **major second**, and twelve half steps make an **octave**.',
      figure: { kind: 'keyboard', keys: [{ note: 'C4', role: 'root' }, { note: 'C5', role: 'root' }], from: 'C4', to: 'C5', caption: '{n:C} to the next {n:C}: one octave, twelve half steps.' },
    },
    { generate: 'semitones-match', params: { intervals: ['m2', 'M2', 'P8'], pairs: 3 } },
    { generate: 'higher-lower' },
    {
      type: 'type-answer',
      prompt: 'How many half steps are there in one octave?',
      answer: { kind: 'number', value: 12 },
      input: 'keypad',
      explain: 'An octave is twelve half steps: twelve frets up one string brings you to the same note name, higher.',
      fact: 'octave-size',
    },
    {
      type: 'fretboard-find',
      prompt: 'The dot is {n:G}. Tap the note a whole step above it on the same string.',
      find: { interval: 'M2', from: { string: 6, fret: 3 } },
      mode: 'one',
      octave: 'exact',
      frets: [0, 7],
      strings: [6],
      shown: [{ string: 6, fret: 3, role: 'root', label: 'G' }],
      explain: 'A whole step is two frets: from {n:G} at fret 3 up to {n:A} at fret 5.',
    },
    {
      type: 'listen-choice',
      prompt: 'Listen to the two notes. Are they a half step or a whole step apart?',
      sound: { kind: 'interval', from: 'E3', interval: 'M2', play: 'up' },
      options: [{ text: 'A half step' }, { text: 'A whole step', correct: true }],
      shuffle: false,
      explain: 'That was {n:E} up to {n:F#}: two frets, a whole step. A half step from {n:E} would land on {n:F}.',
    },
  ],
  facts: [
    { id: 'half-step', front: 'How many frets is a half step? And a whole step?', back: 'A half step is one fret; a whole step is two.' },
    {
      id: 'octave-size',
      front: 'How many half steps make an octave?',
      back: 'Twelve.',
      ask: {
        type: 'type-answer',
        prompt: 'How many half steps make an octave?',
        answer: { kind: 'number', value: 12 },
        input: 'keypad',
        explain: 'Twelve half steps, which is twelve frets, make one octave.',
      },
    },
  ],
};

const majorScale: Lesson = {
  id: 'major-scale',
  title: 'The major scale',
  teaches: 'The major scale follows the steps whole, whole, half, whole, whole, whole, half from any starting note.',
  minutes: 4,
  skill: 'theory:building-blocks:major-scale',
  steps: [
    {
      type: 'card',
      title: 'A recipe of steps',
      body: 'The {t:major-scale} is built from a fixed pattern of steps: **whole, whole, half, whole, whole, whole, half**. Start on {n:C} and you get {n:C} {n:D} {n:E} {n:F} {n:G} {n:A} {n:B}: no sharps or flats.',
      figure: { kind: 'keyboard', keys: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'], from: 'C4', to: 'C5' },
      tip: 'The two half steps fall between notes 3 and 4, and between 7 and 8.',
    },
    { generate: 'scale-formula', params: { scales: ['major'] }, fact: 'major-formula' },
    {
      type: 'fill-blanks',
      prompt: 'Complete the {n:C} major scale.',
      text: '{n:C}  {n:D}  ___  {n:F}  {n:G}  ___  {n:B}',
      blanks: ['{n:E}', '{n:A}'],
      bank: ['{n:F#}', '{n:Bb}'],
      explain: '{n:C} major uses only the natural notes: C D E F G A B.',
    },
    {
      type: 'card',
      title: 'Same recipe, new start',
      body: 'Start the same pattern on {n:G} and one note has to change to keep the steps right: {n:G} {n:A} {n:B} {n:C} {n:D} {n:E} {n:F#}. That one sharp is the {t:key-signature} of {k:G major}.',
      figure: { kind: 'staff', key: 'G major', notes: ['G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F#4'] },
    },
    { generate: 'scale-notes', params: { scales: ['major'], tonics: ['G', 'C'], form: 'order' } },
    {
      type: 'choice',
      prompt: 'Why does {k:G major} need {n:F#} instead of {n:F}?',
      options: [
        { text: 'To keep a whole step between notes 6 and 7', correct: true },
        { text: 'Because sharps sound brighter', why: 'The sharp is there to keep the step pattern, not for colour.' },
        { text: 'To avoid using the letter F', why: 'The letter F is still used: {n:F#} is an F.' },
        { text: 'Because {n:F} is missing on the guitar', why: '{n:F} is at fret 1 of both E strings.' },
      ],
      explain: 'The pattern needs a whole step from note 6, {n:E}, to note 7, and {n:E} to {n:F} is only a half step. Raising it to {n:F#} keeps the pattern.',
      fact: 'g-major-sharp',
    },
    {
      type: 'flashcard',
      front: 'What is the step pattern of the major scale?',
      back: 'Whole, whole, half, whole, whole, whole, half.',
    },
    {
      type: 'choice',
      prompt: 'How many sharps does {k:G major} have?',
      options: [{ text: 'None' }, { text: '1', correct: true }, { text: '2' }, { text: '3' }],
      shuffle: false,
      explain: '{k:G major} has one sharp, {n:F#}. {k:C major} has none.',
    },
    { generate: 'scale-notes', params: { scales: ['major'], tonics: ['C', 'G'], form: 'odd-one-out' } },
    { generate: 'scale-notes', params: { scales: ['major'], tonics: ['G'], form: 'fill' } },
  ],
  facts: [
    {
      id: 'major-formula',
      front: 'What is the step pattern of the major scale?',
      back: 'Whole, whole, half, whole, whole, whole, half.',
      ask: { generate: 'scale-formula', params: { scales: ['major'] } },
    },
    { id: 'g-major-sharp', front: 'Which sharp does {k:G major} have?', back: '{n:F#}' },
  ],
};

const firstChords: Lesson = {
  id: 'first-chords',
  title: 'Your first chords',
  teaches: 'A chord stacks a root, a third and a fifth; the third decides whether it is major or minor.',
  minutes: 4,
  skill: 'theory:building-blocks:first-chords',
  steps: [
    {
      type: 'card',
      title: 'Three notes at once',
      body: 'A {t:chord} is three or more notes sounding together. The simplest kind, a {t:triad}, stacks a {t:root}, a third and a fifth. {c:Em} is {n:E}, {n:G} and {n:B}.',
      figure: { kind: 'chord', symbol: 'Em' },
      tip: '{c:Em} needs only two fingers, both at fret 2. Strum all six strings.',
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'Em',
      accept: 'any-voicing',
      prompt: 'Build {c:Em}: two fingers at fret 2, on strings 5 and 4.',
      explain: 'Fret 2 on string 5 and on string 4 gives {n:B} and {n:E}; the open strings supply the rest of {c:Em}.',
    },
    { generate: 'chord-tones', params: { types: ['minor'], roots: ['E', 'A'], ask: 'notes' }, fact: 'em-notes' },
    {
      type: 'card',
      title: 'Major and minor',
      body: 'Change one note and the mood changes. {c:E} is {n:E} {n:G#} {n:B}; {c:Em} is {n:E} {n:G} {n:B}. Only the third moves: a {t:major-chord} sounds bright, a {t:minor-chord} darker.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['E', 'Em'], tempo: 60, beats: 4 }, label: 'Hear {c:E}, then {c:Em}' },
    },
    { generate: 'chord-quality-ear' },
    {
      type: 'chord-build',
      task: 'missing-note',
      chord: 'E',
      given: ['E', 'B'],
      options: ['G#', 'G', 'A', 'F#'],
      prompt: 'The {c:E} chord has {n:E}, {n:B} and one more note. Which?',
      explain: '{c:E} is a major chord, so its third is {n:G#}. With {n:G} instead it would be {c:Em}.',
      fact: 'major-vs-minor',
    },
    {
      type: 'true-false',
      statement: '{c:Em} and {c:E} differ by just one note.',
      answer: true,
      explain: 'Only the third changes: {n:G} in {c:Em}, {n:G#} in {c:E}. On the guitar that is one finger: string 3, fret 1.',
    },
    {
      type: 'play-chord',
      chord: 'Em',
      prompt: 'Strum {c:Em}: all six strings, slowly.',
      explain: 'Every string should ring. If one sounds dull, press closer to the fret, or arch your fingers so they clear the next string.',
      alternative: { generate: 'chord-shape', params: { chords: ['Em'] } },
    },
    { generate: 'chord-shape', params: { chords: ['Em', 'Am', 'E'] } },
    { generate: 'chord-tones', params: { types: ['major', 'minor'], roots: ['E', 'A'], ask: 'missing' } },
  ],
  facts: [
    { id: 'triad', front: 'Which three chord tones make a triad?', back: 'Root, third and fifth.' },
    {
      id: 'em-notes',
      front: 'Which notes make up {c:Em}?',
      back: '{n:E}, {n:G} and {n:B}.',
      figure: { kind: 'chord', symbol: 'Em' },
      ask: { generate: 'chord-tones', params: { types: ['minor'], roots: ['E'], ask: 'notes' } },
    },
    { id: 'major-vs-minor', front: 'What is the difference between a major and a minor chord?', back: 'The third: in a minor chord it is one half step lower.' },
  ],
};

const countingRhythm: Lesson = {
  id: 'counting-rhythm',
  title: 'Counting rhythm',
  teaches: 'A quarter note lasts one beat and two eighth notes share a beat: count 1 & 2 & 3 & 4 &.',
  minutes: 4,
  skill: 'theory:building-blocks:counting-rhythm',
  steps: [
    {
      type: 'card',
      title: 'The beat',
      body: 'The {t:beat} is the steady pulse you tap your foot to. In 4/4 time there are four beats in every {t:bar}, and a {t:quarter-note} lasts one beat. Count **1 2 3 4**.',
      figure: { kind: 'rhythm', pattern: 'q q q q', tempo: 80 },
    },
    {
      type: 'tap-rhythm',
      rhythm: { pattern: 'q q q q' },
      tempo: 80,
      show: 'both',
      prompt: 'Tap four quarter notes along with the click.',
      explain: 'One tap on every beat: 1, 2, 3, 4. Keep the gaps even; steady matters more than fast.',
    },
    {
      type: 'card',
      title: 'Splitting the beat',
      body: 'Two {t:eighth-note|eighth notes} share one beat. Count them **1 & 2 & 3 & 4 &**: the numbers land on the beat, the "&" halfway between.',
      figure: { kind: 'rhythm', pattern: 'e e e e q q', tempo: 80 },
    },
    { generate: 'note-value-math', params: { ask: 'fit', values: ['quarter', 'eighth'] }, fact: 'eighth-notes' },
    {
      type: 'tap-rhythm',
      rhythm: { pattern: 'q e e q q' },
      tempo: 80,
      show: 'both',
      prompt: 'Tap this rhythm: quarter, two eighths, quarter, quarter.',
      explain: 'Count 1, 2 &, 3, 4. The two eighth notes fit inside beat 2.',
    },
    { generate: 'rhythm-ear', params: { values: ['quarter', 'eighth'], tempo: 80 } },
    {
      type: 'true-false',
      statement: 'In 4/4 time a bar holds four quarter-note beats.',
      answer: true,
      explain: 'The top 4 says four beats in a bar; the bottom 4 says each beat is a quarter note.',
      fact: 'quarter-note',
    },
    {
      type: 'card',
      title: 'Down and up',
      body: 'When you {t:strum}, your hand keeps time like a pendulum: **down** on the numbers, **up** on the "&". This pattern goes down, down-up, up-down-up.',
      figure: { kind: 'audio', sound: { kind: 'strum', chord: 'Em', pattern: 'D-DU-UDU', tempo: 80, repeat: 2 }, label: 'Hear the strum' },
    },
    {
      type: 'choice',
      prompt: 'In that strumming pattern, where do the up-strokes fall?',
      options: [
        { text: 'On the "&" between beats', correct: true },
        { text: 'On beats 1 and 3' },
        { text: 'On every beat', why: 'The beats get the down-strokes.' },
        { text: 'Only on beat 4' },
      ],
      explain: 'Down-strokes land on the numbers and up-strokes on the "&", so the hand never has to hurry or stop.',
    },
    { generate: 'rhythm-tap', params: { values: ['quarter', 'eighth'], tempo: 80 } },
    { generate: 'note-value-math', params: { ask: 'beats', values: ['quarter', 'eighth'] } },
  ],
  facts: [
    { id: 'quarter-note', front: 'How long does a quarter note last in 4/4 time?', back: 'One beat.' },
    {
      id: 'eighth-notes',
      front: 'How many eighth notes fill one beat in 4/4 time?',
      back: 'Two. Count them "1 &".',
      ask: { generate: 'note-value-math', params: { ask: 'fit', values: ['quarter', 'eighth'] } },
    },
  ],
};

/** Unit 2 of the demo course. */
export const BUILDING_BLOCKS: Unit = {
  id: 'building-blocks',
  title: 'Building blocks',
  theme: 'basics',
  description: 'Half and whole steps, the major scale, your first chords and your first rhythms.',
  lessons: [halfAndWholeSteps, majorScale, firstChords, countingRhythm],
  checkpoint: {
    maxMistakes: 2,
    steps: [
      { generate: 'step-up' },
      { generate: 'semitones-match', params: { intervals: ['m2', 'M2', 'P8'], pairs: 3 } },
      { generate: 'scale-formula', params: { scales: ['major'] } },
      { generate: 'scale-notes', params: { scales: ['major'], tonics: ['C', 'G'], form: 'fill' } },
      { generate: 'chord-tones', params: { types: ['major', 'minor'], roots: ['E', 'A'], ask: 'notes' } },
      { generate: 'chord-quality-ear' },
      { generate: 'note-value-math', params: { ask: 'fit', values: ['quarter', 'eighth'] } },
      { generate: 'rhythm-tap', params: { values: ['quarter', 'eighth'] } },
    ],
  },
};
