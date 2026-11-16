/**
 * Demo course, unit 1: the musical alphabet, the open strings, the low E string and the staff.
 * Real content, written to the authoring guide (API.md): one idea per lesson, show then ask,
 * and a reason with every answer. `demo.test.ts` cross-checks its facts against the engines.
 */
import type { Lesson, Unit } from '../types';

const musicalAlphabet: Lesson = {
  id: 'musical-alphabet',
  title: 'The musical alphabet',
  teaches: 'Notes are named with seven letters, A to G, and most neighbours have a sharp or flat between them.',
  minutes: 3,
  skill: 'theory:first-notes:musical-alphabet',
  steps: [
    {
      type: 'card',
      title: 'Seven letters',
      body: 'Music names its notes with seven letters: **A B C D E F G**. After {n:G} the letters start again at {n:A}, only higher.',
      figure: { kind: 'keyboard', keys: ['A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4'], from: 'A3', to: 'A4' },
      tip: 'Say them out loud going up, then back down. It feels silly and it works.',
    },
    {
      type: 'order',
      prompt: 'Put the note names in order, starting from {n:A}.',
      tiles: ['{n:A}', '{n:B}', '{n:C}', '{n:D}', '{n:E}', '{n:F}', '{n:G}'],
      explain: 'The {t:musical-alphabet} runs A B C D E F G and then begins again at A.',
    },
    {
      type: 'choice',
      prompt: 'Which note comes after {n:G}?',
      options: [
        { text: '{n:A}', correct: true },
        { text: '{n:F}', why: '{n:F} comes just before {n:G}.' },
        { text: '{n:C}' },
        { text: '{n:B}' },
      ],
      explain: 'There are only seven letters. After {n:G} the alphabet starts again at {n:A}.',
    },
    {
      type: 'card',
      title: 'Sharps and flats',
      body: 'Between most letters there is one more note. It borrows a neighbour\'s name: {n:F#} (F {t:sharp}) is just above {n:F}, and {n:Gb} (G {t:flat}) is just below {n:G}. They are the same sound.',
      figure: {
        kind: 'keyboard',
        keys: [{ note: 'F4', label: 'F' }, { note: 'F#4', label: 'F♯', role: 'target' }, { note: 'G4', label: 'G' }],
        from: 'C4',
        to: 'B4',
        caption: 'One key, two names: {n:F#} and {n:Gb}.',
      },
    },
    {
      type: 'true-false',
      statement: '{n:F#} and {n:Gb} are two names for the same pitch.',
      answer: true,
      explain: 'They are {t:enharmonic}: one sound, two names. Which name is used depends on the key of the music.',
    },
    { generate: 'enharmonic', params: { notes: ['C#', 'D#', 'F#', 'G#', 'A#'] }, fact: 'enharmonic' },
    {
      type: 'card',
      title: 'Two pairs with nothing between',
      body: '{n:B} to {n:C} and {n:E} to {n:F} are already next-door neighbours: no note sits between them. That makes twelve different notes before the names repeat.',
      figure: { kind: 'keyboard', keys: ['E4', 'F4', 'B4', 'C5'], from: 'C4', to: 'C5' },
    },
    {
      type: 'choice',
      prompt: 'Which pair of notes has NO sharp or flat between them?',
      options: [
        { text: '{n:E} and {n:F}', correct: true },
        { text: '{n:C} and {n:D}', why: '{n:C#} sits between them.' },
        { text: '{n:F} and {n:G}', why: '{n:F#} sits between them.' },
        { text: '{n:A} and {n:B}', why: '{n:A#} sits between them.' },
      ],
      explain: '{n:E} to {n:F} and {n:B} to {n:C} are the two pairs with nothing in between. Every other pair of neighbouring letters has a sharp or flat between them.',
      fact: 'natural-neighbours',
    },
    {
      type: 'fill-blanks',
      prompt: 'Fill in the missing notes, going up one note at a time.',
      text: '{n:C}  {n:C#}  {n:D}  ___  {n:E}  ___  {n:F#}',
      blanks: ['{n:D#}', '{n:F}'],
      bank: ['{n:G}', '{n:Db}'],
      explain: 'Going up by the smallest step: {n:C}, {n:C#}, {n:D}, {n:D#}, {n:E}, then straight to {n:F}, because nothing sits between {n:E} and {n:F}.',
    },
    {
      type: 'choice',
      prompt: 'How many different notes are there before the names repeat?',
      options: [{ text: '7' }, { text: '8' }, { text: '12', correct: true }, { text: '14' }],
      shuffle: false,
      explain: 'Seven letters plus five sharps or flats make twelve. On a guitar that is twelve frets: the 12th fret is the open string\'s note again, higher.',
    },
  ],
  facts: [
    { id: 'alphabet', front: 'Which seven letters name the notes?', back: 'A B C D E F G, then A again.' },
    {
      id: 'enharmonic',
      front: 'What does "enharmonic" mean?',
      back: 'Two names for one pitch, such as {n:C#} and {n:Db}.',
      ask: { generate: 'enharmonic' },
    },
    { id: 'natural-neighbours', front: 'Which two pairs of letters have no sharp or flat between them?', back: '{n:E} and {n:F}, and {n:B} and {n:C}.' },
  ],
};

// <example:lesson>
const openStrings: Lesson = {
  id: 'open-strings',
  title: 'The six open strings',
  teaches: 'The open strings are E A D G B E, numbered 6 (thickest) to 1 (thinnest).',
  minutes: 3,
  skill: 'theory:first-notes:open-strings',
  steps: [
    {
      type: 'card',
      title: 'Six strings, counted from the thin one',
      body: 'Strings are numbered **1 to 6** from the thinnest to the thickest. Played {t:open-string|open}, with no finger down, they sound {n:E} {n:A} {n:D} {n:G} {n:B} {n:E} from string 6 up to string 1.',
      figure: {
        kind: 'fretboard',
        frets: [0, 3],
        dots: [
          { string: 6, fret: 0, note: 'E' },
          { string: 5, fret: 0, note: 'A' },
          { string: 4, fret: 0, note: 'D' },
          { string: 3, fret: 0, note: 'G' },
          { string: 2, fret: 0, note: 'B' },
          { string: 1, fret: 0, note: 'E' },
        ],
      },
      tip: 'String 6 is the one nearest your face when you hold the guitar, and it sounds the lowest.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each string with its open note.',
      pairs: [
        { left: 'String 5', right: '{n:A}' },
        { left: 'String 4', right: '{n:D}' },
        { left: 'String 3', right: '{n:G}' },
        { left: 'String 2', right: '{n:B}' },
      ],
      explain: 'From string 6 to string 1 the open notes are E A D G B E. Strings 6 and 1 are both {n:E}, two octaves apart.',
    },
    { generate: 'open-strings', params: { ask: 'order' }, fact: 'open-strings' },
    {
      type: 'choice',
      prompt: 'Which string sounds the lowest?',
      options: [
        { text: 'String 6, the thickest', correct: true },
        { text: 'String 1, the thinnest', why: 'String 1 is the highest: thin strings vibrate fastest.' },
        { text: 'String 3' },
        { text: 'String 5' },
      ],
      explain: 'Thicker strings vibrate more slowly, so they sound lower. String 6, the low {n:E}, is the lowest note in standard {t:tuning}.',
    },
    {
      type: 'card',
      title: 'Hear them',
      body: 'Listen to the six open strings from low to high. Many players remember them with a sentence: **E**ddie **A**te **D**ynamite, **G**ood **B**ye **E**ddie.',
      figure: { kind: 'audio', sound: { kind: 'notes', notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'], tempo: 80 }, label: 'Play the open strings' },
    },
    { generate: 'open-strings', params: { ask: 'name' } },
    {
      type: 'play-note',
      prompt: 'Play the open {n:A} string: string 5, no fingers.',
      note: 'A2',
      octave: 'exact',
      where: { string: 5, fret: 0 },
      explain: 'String 5 played open is {n:A}. A clear, steady note means you plucked just that one string.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap the open {n:A} string.',
        find: { note: 'A2' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 3],
        explain: 'The open 5th string is {n:A}.',
      },
    },
    { generate: 'open-strings', params: { ask: 'number' } },
    {
      type: 'true-false',
      statement: 'String 1 and string 6 are both called {n:E}.',
      answer: true,
      explain: 'Both are {n:E}: string 6 is the low E and string 1 the high E, two {t:octave|octaves} higher.',
    },
  ],
  facts: [
    {
      id: 'open-strings',
      front: 'Name the six open strings from string 6 to string 1.',
      back: '{n:E} {n:A} {n:D} {n:G} {n:B} {n:E}',
      ask: { generate: 'open-strings', params: { ask: 'order' } },
    },
    { id: 'string-numbers', front: 'Which string is number 1?', back: 'The thinnest, highest string: the high {n:E}.' },
  ],
};
// </example:lesson>

const lowEString: Lesson = {
  id: 'low-e-string',
  title: 'Notes on the low E string',
  teaches: 'Each fret raises a string by one half step, so string 6 climbs E, F, F sharp, G and on up.',
  minutes: 4,
  skill: 'theory:first-notes:low-e-string',
  steps: [
    {
      type: 'card',
      title: 'One fret, one step',
      body: 'Each {t:fret} raises a string by one small step. On string 6 the notes climb {n:E} (open), {n:F}, {n:F#}, {n:G}, {n:G#}, and reach {n:A} at fret 5.',
      figure: {
        kind: 'fretboard',
        frets: [0, 5],
        dots: [
          { string: 6, fret: 0, note: 'E' },
          { string: 6, fret: 1, note: 'F' },
          { string: 6, fret: 3, note: 'G' },
          { string: 6, fret: 5, note: 'A' },
        ],
      },
      tip: 'Press just behind the fret wire, not on top of it: the note rings clearly with less effort.',
    },
    {
      type: 'fretboard-name',
      prompt: 'Which note is string 6 at fret 1?',
      position: { string: 6, fret: 1 },
      ask: 'note',
      spelling: 'any',
      options: ['F', 'E', 'F#', 'G'],
      explain: 'The open string is {n:E}. One fret higher, with no note in between, is {n:F}.',
    },
    {
      type: 'fretboard-find',
      prompt: 'Find {n:G} on string 6.',
      find: { note: 'G' },
      mode: 'one',
      octave: 'any',
      frets: [0, 5],
      strings: [6],
      explain: 'Count up from the open {n:E}: {n:F} at fret 1, {n:F#} at fret 2, {n:G} at fret 3.',
    },
    {
      type: 'true-false',
      statement: '{n:E} to {n:F} is one fret, because no note sits between them.',
      answer: true,
      explain: '{n:E} and {n:F} are neighbours with nothing in between, so {n:F} is at fret 1. The same is true of {n:B} and {n:C}.',
    },
    { generate: 'note-on-string', params: { strings: [6], frets: [1, 5], naturals: true, ask: 'fret' } },
    {
      type: 'card',
      title: 'The fifth-fret trick',
      body: 'Fret 5 of string 6 is {n:A}: the same note as the open 5th string. That is how guitarists tune one string to the next, and how the neck fits together.',
      figure: {
        kind: 'fretboard',
        frets: [0, 5],
        dots: [
          { string: 6, fret: 5, note: 'A', role: 'target' },
          { string: 5, fret: 0, note: 'A', role: 'target' },
        ],
      },
    },
    {
      type: 'choice',
      prompt: 'Which open string sounds the same as string 6 at fret 5?',
      options: [{ text: 'String 5', correct: true }, { text: 'String 4' }, { text: 'String 3' }, { text: 'String 1' }],
      shuffle: false,
      explain: 'String 6 at fret 5 is {n:A}, exactly the pitch of the open 5th string.',
      fact: 'fifth-fret',
    },
    {
      type: 'play-phrase',
      prompt: 'Play {n:E}, {n:F}, {n:G} on string 6: open, fret 1, fret 3.',
      notes: [
        { string: 6, fret: 0, duration: 'q' },
        { string: 6, fret: 1, duration: 'q' },
        { string: 6, fret: 3, duration: 'q' },
      ],
      octave: 'exact',
      tempo: 70,
      explain: 'Open, first fret, third fret: {n:E}, {n:F}, {n:G}. Use your first finger for fret 1 and your third finger for fret 3.',
      alternative: {
        type: 'order',
        prompt: 'Put these string 6 notes in order, from the open string up to fret 3.',
        tiles: ['{n:E}', '{n:F}', '{n:F#}', '{n:G}'],
        explain: 'Open {n:E}, then {n:F} at fret 1, {n:F#} at fret 2 and {n:G} at fret 3.',
      },
    },
    { generate: 'note-on-string', params: { strings: [6], frets: [0, 5], naturals: true, ask: 'name' } },
    { generate: 'note-on-string', params: { strings: [6], frets: [0, 5], ask: 'find' } },
  ],
  facts: [
    { id: 'fret-half-step', front: 'How far does one fret move a note?', back: 'One half step: the smallest step in music.' },
    {
      id: 'fifth-fret',
      front: 'Which note is string 6 at fret 5?',
      back: '{n:A}: the same as the open 5th string.',
      ask: {
        type: 'fretboard-name',
        prompt: 'Which note is string 6 at fret 5?',
        position: { string: 6, fret: 5 },
        ask: 'note',
        spelling: 'any',
        options: ['A', 'G', 'B', 'A#'],
        explain: 'Fret 5 of string 6 is {n:A}, the same pitch as the open 5th string.',
      },
    },
  ],
};

const readingTheStaff: Lesson = {
  id: 'reading-the-staff',
  title: 'Notes on the staff',
  teaches: 'The staff lines are E G B D F and the spaces F A C E; guitar music sounds an octave lower than written.',
  minutes: 4,
  skill: 'theory:first-notes:reading-the-staff',
  steps: [
    {
      type: 'card',
      title: 'Five lines, four spaces',
      body: 'Written music uses a {t:staff} of five lines, and guitar music uses the {t:treble-clef}. From the bottom, the lines are {n:E} {n:G} {n:B} {n:D} {n:F} and the spaces spell {n:F} {n:A} {n:C} {n:E}.',
      figure: {
        kind: 'staff',
        notes: [
          { note: 'E3', label: 'E' },
          { note: 'G3', label: 'G' },
          { note: 'B3', label: 'B' },
          { note: 'D4', label: 'D' },
          { note: 'F4', label: 'F' },
        ],
      },
      tip: 'Higher on the staff means higher in pitch.',
    },
    {
      type: 'staff-read',
      prompt: 'Which note is this?',
      note: 'G3',
      options: ['G', 'E', 'B', 'A'],
      explain: 'The second line from the bottom is {n:G}. The treble clef curls around that line, which is why it is also called the G clef.',
    },
    { generate: 'staff-note', params: { ask: 'read' } },
    {
      type: 'card',
      title: 'Guitar sounds lower than it reads',
      body: 'Guitar music is written one {t:octave} higher than it sounds, so the notes sit neatly on the staff. The open 3rd string, {n:G}, is written on the second line.',
      figure: { kind: 'staff', notes: [{ note: 'G3', label: 'open G' }] },
    },
    {
      type: 'staff-place',
      prompt: 'Put {n:B} on the staff: the open 2nd string.',
      note: 'B3',
      octave: 'exact',
      explain: 'The open {n:B} string is written on the middle line. Lines from the bottom: E G B D F.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each space of the staff with its note, counting from the bottom.',
      pairs: [
        { left: '1st space', right: '{n:F}' },
        { left: '2nd space', right: '{n:A}' },
        { left: '3rd space', right: '{n:C}' },
        { left: '4th space', right: '{n:E}' },
      ],
      explain: 'The spaces spell F A C E from the bottom up.',
      fact: 'staff-spaces',
    },
    { generate: 'staff-note', params: { ask: 'place' } },
    {
      type: 'flashcard',
      front: 'Name the five lines of the staff, bottom to top.',
      back: '{n:E} {n:G} {n:B} {n:D} {n:F}. One way to remember: Every Good Boy Deserves Fruit.',
      fact: 'staff-lines',
    },
    { generate: 'staff-note', params: { ask: 'read' } },
    {
      type: 'staff-read',
      prompt: 'Which note sits on the bottom line?',
      note: 'E3',
      options: ['E', 'F', 'D', 'G'],
      explain: 'The bottom line is {n:E}. On the guitar it sounds as the {n:E} at fret 2 of the 4th string.',
    },
  ],
  facts: [
    { id: 'staff-lines', front: 'Name the five lines of the staff, bottom to top.', back: '{n:E} {n:G} {n:B} {n:D} {n:F}' },
    { id: 'staff-spaces', front: 'What do the four spaces of the staff spell?', back: 'F A C E, from the bottom up.' },
    { id: 'guitar-octave', front: 'How does written guitar music relate to its sound?', back: 'It sounds one octave lower than it is written.' },
  ],
};

/** Unit 1 of the demo course. */
export const FIRST_NOTES: Unit = {
  id: 'first-notes',
  title: 'First notes',
  theme: 'notes',
  description: 'The musical alphabet, the six strings, your first notes on the neck and on the staff.',
  lessons: [musicalAlphabet, openStrings, lowEString, readingTheStaff],
  checkpoint: { sample: 8, maxMistakes: 2 },
};
