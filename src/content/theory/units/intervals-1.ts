/**
 * Theory Path, unit 10: Intervals: measuring distance. Written from the syllabus entries in
 * `src/content/plan/theory-path.json` (unit `intervals-1`), one lesson per entry, in order: each
 * lesson opens with the "on the guitar" picture, asks the planned exercises, ends with the planned
 * drills, and turns every planned fact into a review card. `intervals-1.test.ts` cross-checks every
 * interval, half-step count, fret, tune opening and chord tone the text quotes against the theory
 * and guitar engines.
 *
 * Planned sounds that a lesson `Sound` cannot play exactly: "C-G melodic, then together" is split
 * between the card (melodic) and the listening question (together). The tune openings are played
 * on string 5 from the open A (the planned figure), each followed by its bare interval.
 */
import type { FretDot, Lesson, TabNote, Unit } from '@/lessons';

const U = 'intervals-1';

const note = (string: number, fret: number, duration = 'q'): TabNote => ({ string, fret, duration });
const rest = (duration: string): TabNote => ({ rest: true, duration });
const dot = (string: number, fret: number, n: string, extra: Partial<FretDot> = {}): FretDot => ({ string, fret, note: n, ...extra });
const root = (string: number, fret: number, n: string): FretDot => dot(string, fret, n, { role: 'root', label: 'R' });

/** The opening of each traditional tune on string 5 from the open A, then its bare interval. */
export const TUNES = {
  /** Frere Jacques in A: A B C# A. */
  frereJacques: [note(5, 0), note(5, 2), note(5, 4), note(5, 0)],
  /** When the Saints in A: "Oh when the saints", A C# D E. */
  saints: [note(5, 0), note(5, 4), note(5, 5), note(5, 7, 'h')],
  /** Wagner's Bridal Chorus in D, from its upbeat A: "Here comes the bride", A D D D. */
  bridal: [note(5, 0), note(5, 5, 'e.'), note(5, 5, 's'), note(5, 5, 'h')],
  /** Twinkle Twinkle in A: A A E E F# F# E. */
  twinkle: [note(5, 0), note(5, 0), note(5, 7), note(5, 7), note(5, 9), note(5, 9), note(5, 7, 'h')],
  /** My Bonnie in D, from its upbeat A: "My Bonnie lies", A F# E D. */
  bonnie: [note(5, 0), note(5, 9, 'q.'), note(5, 7, 'e'), note(5, 5)],
} as const;

/** A tune's opening, a short pause, then its first interval on its own. */
const withBare = (tune: readonly TabNote[], fret: number): TabNote[] => [...tune, rest('q'), note(5, 0), note(5, fret, 'h')];

// ── 1. What an interval is ────────────────────────────────────────────────────────────────────

const whatAnIntervalIs: Lesson = {
  id: 'what-an-interval-is',
  title: 'What an interval is',
  teaches: 'An interval is the distance between two notes, numbered by counting letter names, both ends included.',
  minutes: 2,
  skill: `theory:${U}:what-an-interval-is`,
  steps: [
    {
      type: 'card',
      title: 'Measuring the distance',
      body: 'An {t:interval} is the distance in pitch between two notes. To number it, count letter names from the lower note up to the higher one, and count both ends. On string 5, {n:C} at fret 3 is 1, then {n:D} is 2, {n:E} 3, {n:F} 4 and {n:G} 5.',
      figure: {
        kind: 'fretboard',
        frets: [2, 10],
        dots: [
          dot(5, 3, 'C', { label: '1', role: 'root' }),
          dot(5, 5, 'D', { label: '2' }),
          dot(5, 7, 'E', { label: '3' }),
          dot(5, 8, 'F', { label: '4' }),
          dot(5, 10, 'G', { label: '5' }),
        ],
        caption: 'String 5: count the letters up from {n:C}.',
      },
    },
    {
      type: 'choice',
      prompt: 'Count the letters from {n:C} up to {n:G}. Which interval is it?',
      options: [
        { text: 'A third', why: 'A third is three letters, such as C D E.' },
        { text: 'A fourth', why: 'C D E F is four letters: that only reaches {n:F}. Keep counting to {n:G}.' },
        { text: 'A fifth', correct: true },
        { text: 'A sixth', why: 'A sixth is six letters: C D E F G A.' },
      ],
      shuffle: false,
      explain: 'C D E F G: five letter names, counting both {n:C} and {n:G}. So {n:C} up to {n:G} is a fifth.',
      fact: 'intervals-counting',
    },
    {
      type: 'true-false',
      statement: '{n:C} up to {n:E} is a second.',
      answer: false,
      explain: 'Count both ends: C D E is three letter names, so {n:C} up to {n:E} is a third. A second is two neighbouring letters, like {n:C} to {n:D}.',
      fact: 'intervals-counting',
    },
    {
      type: 'order',
      prompt: 'Count from {n:D} up to {n:A}: put the letter names in order.',
      tiles: ['{n:D}', '{n:E}', '{n:F}', '{n:G}', '{n:A}'],
      explain: 'D E F G A: five letter names, so {n:D} up to {n:A} is a fifth.',
    },
    {
      type: 'card',
      title: 'One after the other, or together',
      body: 'Play {n:C} and then {n:G}: that is a {t:melodic-interval|melodic interval}, one note after the other. Play them at the same time and it is a {t:harmonic-interval|harmonic interval}. The distance is the same either way: a fifth.',
      figure: { kind: 'audio', sound: { kind: 'interval', from: 'C3', interval: 'P5', play: 'up' }, label: 'Hear {n:C}, then {n:G}' },
      tip: 'On the guitar: {n:C} is string 5, fret 3 and {n:G} is string 4, fret 5. Pluck them in turn, then together.',
    },
    {
      type: 'listen-choice',
      prompt: 'Listen. Were the two notes played one after the other, or together?',
      sound: { kind: 'interval', from: 'C3', interval: 'P5', play: 'together' },
      options: [{ text: 'One after the other: melodic' }, { text: 'Together: harmonic', correct: true }],
      shuffle: false,
      explain: 'Both notes sounded at once, so it was a harmonic interval: {n:C} and {n:G}, a fifth apart.',
    },
    {
      type: 'choice',
      prompt: 'You strum two strings at the same time. What kind of interval do you hear?',
      options: [
        { text: 'A harmonic interval', correct: true },
        { text: 'A melodic interval', why: 'Melodic means one note after the other, as in a tune.' },
      ],
      shuffle: false,
      explain: 'Notes sounding together make a harmonic interval; one after the other, a melodic interval.',
      fact: 'intervals-melodic-harmonic',
    },
    {
      type: 'fretboard-find',
      prompt: 'The dot is {n:C}, string 5 fret 3. Tap the natural note (no sharp or flat) a third higher on the same string.',
      find: { note: 'E3' },
      mode: 'one',
      octave: 'exact',
      // Seven frets fit a phone without scrolling the neck; the answer (fret 7) stays in view.
      frets: [2, 8],
      strings: [5],
      shown: [dot(5, 3, 'C', { role: 'root', label: '1' })],
      explain: 'C D E: three letters, so the natural note a third above {n:C} is {n:E}, at fret 7 of string 5. {n:Eb} at fret 6 is a third above {n:C} too, a smaller one: the next lesson explains.',
      fact: 'intervals-counting',
    },
  ],
  facts: [
    {
      id: 'intervals-meaning',
      front: 'What is an interval?',
      back: 'The distance in pitch between two notes.',
      ask: {
        type: 'choice',
        prompt: 'What does an interval measure?',
        options: [
          { text: 'The distance in pitch between two notes', correct: true },
          { text: 'How long a note lasts', why: 'That is a note value.' },
          { text: 'How loud a note is', why: 'That is volume.' },
        ],
        explain: 'An interval is the distance in pitch between two notes.',
      },
    },
    {
      id: 'intervals-counting',
      front: 'How do you find the number of an interval?',
      back: 'Count letter names from the lower note up to the upper one, counting both: {n:C} to {n:E} is a third (C D E).',
      ask: {
        type: 'choice',
        prompt: 'Count the letters: which interval is {n:E} up to {n:B}?',
        options: [{ text: 'A third' }, { text: 'A fourth' }, { text: 'A fifth', correct: true }, { text: 'A sixth' }],
        shuffle: false,
        explain: 'E F G A B: five letter names, counting both ends, so {n:E} up to {n:B} is a fifth.',
      },
    },
    {
      id: 'intervals-melodic-harmonic',
      front: 'What is the difference between a melodic and a harmonic interval?',
      back: 'Melodic: the two notes one after the other. Harmonic: both at the same time.',
    },
  ],
};

// ── 2. Seconds and thirds ─────────────────────────────────────────────────────────────────────

const secondsAndThirds: Lesson = {
  id: 'seconds-and-thirds',
  title: 'Seconds and thirds',
  teaches: 'A minor second is one half step, a major second two, a minor third three and a major third four.',
  minutes: 3,
  skill: `theory:${U}:seconds-and-thirds`,
  steps: [
    {
      type: 'card',
      title: 'Counting half steps too',
      body: 'The letters give an interval its number; the {t:half-step|half steps} between the notes give its **quality**. {n:G} up to {n:Ab} is a second of one half step: a **minor second** ({i:m2}). {n:G} up to {n:A} is a second of two half steps: a **major second** ({i:M2}).',
      figure: {
        kind: 'fretboard',
        frets: [2, 8],
        dots: [root(6, 3, 'G'), dot(6, 4, 'Ab', { label: 'm2' }), dot(6, 5, 'A', { label: 'M2' }), dot(6, 6, 'Bb', { label: 'm3' }), dot(6, 7, 'B', { label: 'M3' })],
        caption: 'String 6 from {n:G} (R): one fret for each half step.',
      },
    },
    {
      type: 'choice',
      prompt: 'On string 6, {n:G} is fret 3 and {n:A} is fret 5. Which interval is {n:G} up to {n:A}?',
      options: [
        { text: 'A minor second', why: 'A minor second is one fret: {n:G} up to {n:Ab}.' },
        { text: 'A major second', correct: true },
        { text: 'A minor third', why: 'A third spans three letters, such as G A B.' },
        { text: 'A major third', why: 'A third spans three letters, such as G A B.' },
      ],
      shuffle: false,
      explain: 'Two letters (G A), so a second; two frets, so two half steps: a major second.',
      fact: 'intervals-seconds',
    },
    {
      type: 'card',
      title: 'Minor and major thirds',
      body: '{n:G} up to {n:Bb} spans three letters (G A B) and three half steps: a **minor third** ({i:m3}). {n:G} up to {n:B} is four half steps: a **major third** ({i:M3}). You met these two in chords: the third decides major or minor.',
      figure: { kind: 'audio', sound: { kind: 'notes', notes: ['G2', 'Bb2', 'G2', 'B2'], tempo: 80 }, label: 'Hear {i:m3}, then {i:M3}' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each interval with its size.',
      pairs: [
        { left: 'Minor second', right: '1 half step' },
        { left: 'Major second', right: '2 half steps' },
        { left: 'Minor third', right: '3 half steps' },
        { left: 'Major third', right: '4 half steps' },
      ],
      explain: 'Each half step is one fret: {i:m2} is 1, {i:M2} 2, {i:m3} 3 and {i:M3} 4.',
      fact: 'intervals-thirds',
    },
    {
      type: 'fretboard-find',
      prompt: 'The dot is {n:G}, string 6 fret 3. Tap the note a major third higher on the same string.',
      find: { interval: 'M3', from: { string: 6, fret: 3 } },
      mode: 'one',
      octave: 'exact',
      frets: [2, 8],
      strings: [6],
      shown: [root(6, 3, 'G')],
      explain: 'A major third is four half steps: four frets up from fret 3 is fret 7, {n:B}.',
      fact: 'intervals-small-frets',
    },
    {
      type: 'choice',
      prompt: 'Which interval is {n:D} up to {n:F}?',
      options: [
        { text: 'A minor second' },
        { text: 'A major second', why: 'D E F is three letters: a third, not a second.' },
        { text: 'A minor third', correct: true },
        { text: 'A major third', why: 'That would be {n:D} up to {n:F#}: four half steps.' },
      ],
      shuffle: false,
      explain: 'D E F is three letters: a third. {n:D} to {n:E} is two half steps and {n:E} to {n:F} only one, so three in all: a minor third.',
      fact: 'intervals-thirds',
    },
    {
      type: 'true-false',
      statement: 'A minor third is one half step smaller than a major third.',
      answer: true,
      explain: 'A minor third is three half steps and a major third four: one fret apart on the same string.',
    },
    { generate: 'semitones-match', params: { intervals: ['m2', 'M2', 'm3', 'M3'], pairs: 3 } },
    { generate: 'interval-name', params: { intervals: ['M3', 'm3', 'M2', 'm2'], roots: ['C', 'G', 'D', 'A', 'E', 'F'] } },
  ],
  facts: [
    {
      id: 'intervals-seconds',
      front: 'How many half steps are a minor second and a major second?',
      back: 'A minor second ({i:m2}) is one half step; a major second ({i:M2}) is two.',
    },
    {
      id: 'intervals-thirds',
      front: 'How many half steps are a minor third and a major third?',
      back: 'A minor third ({i:m3}) is three half steps; a major third ({i:M3}) is four.',
      ask: { generate: 'interval-name', params: { intervals: ['M3', 'm3'], roots: ['C', 'G', 'D', 'A', 'E', 'F'] } },
    },
    {
      id: 'intervals-small-frets',
      front: 'On one string, how many frets are {i:m2}, {i:M2}, {i:m3} and {i:M3}?',
      back: '1, 2, 3 and 4 frets: one fret for every half step.',
    },
  ],
};

// ── 3. Fourths, fifths and octaves ────────────────────────────────────────────────────────────

const fourthsFifthsOctaves: Lesson = {
  id: 'fourths-fifths-octaves',
  title: 'Fourths, fifths and octaves',
  teaches: 'A perfect fourth is 5 half steps, a perfect fifth 7, an octave 12; open strings are mostly fourths apart.',
  minutes: 3,
  skill: `theory:${U}:fourths-fifths-octaves`,
  steps: [
    {
      type: 'card',
      title: 'The perfect intervals',
      body: 'A **perfect fourth** ({i:P4}) is five half steps, a **perfect fifth** ({i:P5}) seven, and a **perfect octave** ({i:P8}) twelve. With the {t:unison}, these are the {t:perfect-interval|perfect intervals}: they are called perfect, never major or minor. From {n:A} on string 6, all three sit under your hand.',
      figure: {
        kind: 'fretboard',
        frets: [3, 8],
        dots: [root(6, 5, 'A'), dot(5, 5, 'D', { label: 'P4' }), dot(5, 7, 'E', { label: 'P5' }), dot(4, 7, 'A', { label: 'P8' })],
        caption: 'From {n:A} (R): {i:P4} is {n:D}, {i:P5} is {n:E}, {i:P8} is {n:A}.',
      },
    },
    {
      type: 'fretboard-find',
      prompt: 'The dot is {n:A}, string 6 fret 5. Tap the perfect fifth above it on string 5.',
      find: { interval: 'P5', from: { string: 6, fret: 5 } },
      mode: 'one',
      octave: 'exact',
      frets: [3, 9],
      strings: [5],
      shown: [root(6, 5, 'A')],
      explain: 'Seven half steps above {n:A} is {n:E}. On the next string it is just two frets up: string 5, fret 7, the power-chord shape.',
      fact: 'intervals-perfect-sizes',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each interval with its size.',
      pairs: [
        { left: 'Major third', right: '4 half steps' },
        { left: 'Perfect fourth', right: '5 half steps' },
        { left: 'Perfect fifth', right: '7 half steps' },
        { left: 'Octave', right: '12 half steps' },
      ],
      explain: 'A perfect fourth is 5 half steps, a perfect fifth 7 and an octave 12. A major third, 4, is one half step smaller than a fourth.',
      fact: 'intervals-perfect-sizes',
    },
    {
      type: 'true-false',
      statement: 'A fifth can be called major or minor, like a third.',
      answer: false,
      explain: 'Unisons, fourths, fifths and octaves are the perfect intervals: their usual size is called perfect, never major or minor.',
      fact: 'intervals-perfect-names',
    },
    {
      type: 'card',
      title: 'Fourths between the strings',
      body: 'Most neighbouring open strings are a perfect fourth apart: {n:E} up to {n:A}, {n:A} to {n:D}, {n:D} to {n:G}, and {n:B} to {n:E}. One pair is different: {n:G} to {n:B} is a major third. That is why, on string 3, fret 4 (not fret 5) matches the next open string.',
      figure: {
        kind: 'fretboard',
        frets: [0, 4],
        dots: [dot(6, 0, 'E'), dot(5, 0, 'A'), dot(4, 0, 'D'), dot(3, 0, 'G'), dot(2, 0, 'B'), dot(1, 0, 'E')],
        caption: 'Low to high: {i:P4}, {i:P4}, {i:P4}, {i:M3}, {i:P4}.',
      },
    },
    {
      type: 'choice',
      prompt: 'Which neighbouring open strings are not a perfect fourth apart?',
      options: [
        { text: 'Strings 6 and 5: {n:E} and {n:A}' },
        { text: 'Strings 4 and 3: {n:D} and {n:G}' },
        { text: 'Strings 3 and 2: {n:G} and {n:B}', correct: true },
        { text: 'Strings 2 and 1: {n:B} and {n:E}' },
      ],
      shuffle: false,
      explain: '{n:G} up to {n:B} is four half steps, a major third. Every other pair of neighbours is five half steps apart: a perfect fourth.',
      fact: 'intervals-open-strings',
    },
    {
      type: 'choice',
      prompt: 'Fret 5 of string 6 sounds the same note as open string 5. Why fret 5?',
      options: [
        { text: 'They are a perfect fourth (5 half steps) apart', correct: true },
        { text: 'They are a perfect fifth (7 half steps) apart', why: 'A fifth would need fret 7.' },
        { text: 'Fret 5 has a dot on the neck', why: 'The dot is only a landmark. The reason is the distance between the strings.' },
      ],
      shuffle: false,
      explain: 'Open string 5, {n:A}, is a perfect fourth above open string 6, {n:E}: five half steps, so five frets.',
      fact: 'intervals-perfect-sizes',
    },
    { generate: 'semitones-match', params: { intervals: ['P4', 'P5', 'P8', 'M3', 'm3', 'M2', 'm2'], pairs: 4 } },
    { generate: 'interval-on-neck', params: { intervals: ['P5', 'P4', 'P8', 'M3', 'm3'], ask: 'find', strings: [6, 5], frets: [0, 7] } },
  ],
  facts: [
    {
      id: 'intervals-perfect-sizes',
      front: 'How many half steps are a perfect fourth, a perfect fifth and an octave?',
      back: '{i:P4} is 5, {i:P5} is 7 and {i:P8} is 12.',
      ask: { generate: 'semitones-match', params: { intervals: ['P4', 'P5', 'P8'], pairs: 3 } },
    },
    {
      id: 'intervals-perfect-names',
      front: 'Which intervals are called perfect?',
      back: 'The unison, the fourth, the fifth and the octave: {i:P1}, {i:P4}, {i:P5} and {i:P8}.',
    },
    {
      id: 'intervals-open-strings',
      front: 'Which neighbouring open strings are not a perfect fourth apart?',
      back: 'Strings 3 and 2, {n:G} and {n:B}: a major third. All the other neighbours are a perfect fourth apart.',
    },
  ],
};

// ── 4. Sixths and sevenths ────────────────────────────────────────────────────────────────────

const sixthsAndSevenths: Lesson = {
  id: 'sixths-and-sevenths',
  title: 'Sixths and sevenths',
  teaches: 'A minor sixth is eight half steps, a major sixth nine, a minor seventh ten and a major seventh eleven.',
  minutes: 3,
  skill: `theory:${U}:sixths-and-sevenths`,
  steps: [
    {
      type: 'card',
      title: 'Sixths: eight and nine frets',
      body: 'Bigger intervals work the same way. From {n:C} on string 5, fret 3: eight frets up is {n:Ab}, a **minor sixth** ({i:m6}); nine frets up is {n:A}, a **major sixth** ({i:M6}). C D E F G A is six letters, so both are sixths.',
      figure: {
        kind: 'fretboard',
        frets: [3, 15],
        dots: [root(5, 3, 'C'), dot(5, 11, 'Ab', { label: 'm6' }), dot(5, 12, 'A', { label: 'M6' }), dot(5, 13, 'Bb', { label: 'm7' }), dot(5, 14, 'B', { label: 'M7' }), dot(5, 15, 'C', { label: 'P8' })],
        caption: 'From {n:C} (R): {i:m6}, {i:M6}, {i:m7}, {i:M7}, then the octave.',
      },
    },
    {
      type: 'choice',
      prompt: 'Which interval is {n:C} up to {n:A}?',
      options: [
        { text: 'A minor sixth', why: 'That is {n:C} up to {n:Ab}: eight half steps.' },
        { text: 'A major sixth', correct: true },
        { text: 'A minor seventh', why: 'A seventh spans seven letters: C D E F G A B.' },
        { text: 'A major seventh', why: 'A seventh spans seven letters: C D E F G A B.' },
      ],
      shuffle: false,
      explain: 'C D E F G A: six letters, a sixth. Nine half steps make it a major sixth: fret 3 to fret 12 on string 5.',
      fact: 'intervals-from-c',
    },
    {
      type: 'card',
      title: 'Sevenths: ten and eleven frets',
      body: 'Ten frets up from {n:C} is {n:Bb}, a **minor seventh** ({i:m7}). Eleven is {n:B}, a **major seventh** ({i:M7}): just one half step below the octave, {n:C} at fret 15.',
      figure: { kind: 'audio', sound: { kind: 'notes', notes: ['C3', 'Ab3', 'C3', 'A3', 'C3', 'Bb3', 'C3', 'B3'], tempo: 90 }, label: 'Hear each one after {n:C}' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each interval with its size.',
      pairs: [
        { left: 'Minor sixth', right: '8 half steps' },
        { left: 'Major sixth', right: '9 half steps' },
        { left: 'Minor seventh', right: '10 half steps' },
        { left: 'Major seventh', right: '11 half steps' },
      ],
      explain: 'Each step up the list adds one half step: {i:m6} 8, {i:M6} 9, {i:m7} 10 and {i:M7} 11. One more, 12, is the octave.',
      fact: 'intervals-sixths',
    },
    {
      type: 'choice',
      prompt: 'Which interval is {n:C} up to {n:Bb}?',
      options: [
        { text: 'A minor sixth', why: 'A sixth spans six letters, C to A. {n:Bb} sits on B, the seventh letter from C.' },
        { text: 'A major sixth', why: 'That is {n:C} up to {n:A}: nine half steps.' },
        { text: 'A minor seventh', correct: true },
        { text: 'A major seventh', why: 'That is {n:C} up to {n:B}: eleven half steps.' },
      ],
      shuffle: false,
      explain: 'C D E F G A B: seven letters, a seventh. {n:Bb} is ten half steps above {n:C}, so it is a minor seventh.',
      fact: 'intervals-from-c',
    },
    {
      type: 'listen-choice',
      prompt: 'Is this interval a major seventh or an octave?',
      sound: { kind: 'interval', from: 'C3', interval: 'M7', play: 'up' },
      options: [{ text: 'A major seventh', correct: true }, { text: 'An octave' }],
      shuffle: false,
      explain: 'It was {n:C} up to {n:B}, a major seventh: one half step short of the octave, so it sounds tense instead of blending into one note.',
    },
    {
      type: 'true-false',
      statement: 'A major seventh is one half step below the octave.',
      answer: true,
      explain: 'A major seventh is eleven half steps and the octave twelve: on string 5, {n:B} at fret 14 sits one fret below {n:C} at fret 15.',
      fact: 'intervals-sevenths',
    },
    {
      type: 'fretboard-find',
      prompt: 'The dot is {n:C}, string 5 fret 3. Tap the minor seventh above it on the same string.',
      find: { interval: 'm7', from: { string: 5, fret: 3 } },
      mode: 'one',
      octave: 'exact',
      frets: [3, 15],
      strings: [5],
      shown: [root(5, 3, 'C')],
      explain: 'Ten half steps above {n:C} is {n:Bb}: fret 13, two frets below the octave at fret 15.',
      fact: 'intervals-sevenths',
    },
    { generate: 'semitones-match', params: { intervals: ['m6', 'M6', 'm7', 'M7', 'P5', 'P4', 'M3', 'm3'], pairs: 4 } },
    { generate: 'interval-name', params: { intervals: ['M6', 'm7', 'M7', 'm6', 'P5', 'P4', 'M3', 'm3'], roots: ['C', 'G', 'D', 'A', 'F'] } },
  ],
  facts: [
    {
      id: 'intervals-sixths',
      front: 'How many half steps are a minor sixth and a major sixth?',
      back: 'A minor sixth ({i:m6}) is eight half steps; a major sixth ({i:M6}) is nine.',
    },
    {
      id: 'intervals-sevenths',
      front: 'How many half steps are a minor seventh and a major seventh?',
      back: 'A minor seventh ({i:m7}) is ten; a major seventh ({i:M7}) is eleven, one half step below the octave.',
    },
    {
      id: 'intervals-from-c',
      front: 'From {n:C}, which notes are a major sixth, a minor seventh and a major seventh up?',
      back: '{n:A} ({i:M6}), {n:Bb} ({i:m7}) and {n:B} ({i:M7}).',
      ask: { generate: 'interval-note', params: { intervals: ['M6', 'm7', 'M7'], roots: ['C'] } },
    },
  ],
};

// ── 5. The tritone ────────────────────────────────────────────────────────────────────────────

const theTritone: Lesson = {
  id: 'the-tritone',
  title: 'The tritone',
  teaches: 'Six half steps, exactly half an octave, is the tritone, spelled as an augmented fourth or a diminished fifth.',
  minutes: 2,
  skill: `theory:${U}:the-tritone`,
  steps: [
    {
      type: 'card',
      title: 'Half an octave',
      body: 'Six half steps is exactly half an octave, and this interval has its own name: the {t:tritone}, because it spans three whole steps. Above the open {n:A} string it is fret 6: {n:D#}, also called {n:Eb}. Across two strings it is string 6 fret 5 with string 5 fret 6.',
      figure: {
        kind: 'fretboard',
        frets: [0, 7],
        dots: [root(5, 0, 'A'), root(6, 5, 'A'), dot(5, 6, 'D#', { role: 'target' })],
        caption: 'Two {n:A}s (R), each a tritone below string 5, fret 6.',
      },
    },
    {
      type: 'fretboard-find',
      prompt: 'The dot is the open {n:A} string. Tap the tritone above it on string 5.',
      find: { interval: 'A4', from: { string: 5, fret: 0 } },
      mode: 'one',
      octave: 'exact',
      frets: [0, 8],
      strings: [5],
      shown: [root(5, 0, 'A')],
      explain: 'Six half steps above {n:A}: fret 6 of string 5, {n:D#} (or {n:Eb}). That is exactly halfway to the octave at fret 12.',
      fact: 'intervals-tritone-size',
    },
    {
      type: 'true-false',
      statement: 'A tritone is seven half steps.',
      answer: false,
      explain: 'A tritone is six half steps, half an octave. Seven half steps is a perfect fifth, one fret higher.',
      fact: 'intervals-tritone-size',
    },
    {
      type: 'card',
      title: 'Two spellings, one restless sound',
      body: 'Spelled as a fourth, the tritone is an **augmented fourth** ({i:A4}): {n:C} up to {n:F#}. Spelled as a fifth, it is a **diminished fifth** ({i:d5}): {n:C} up to {n:Gb}. Same fret, same sound. And that sound is **tense and restless**, as if it wants to move on.',
      figure: { kind: 'audio', sound: { kind: 'interval', from: 'A2', interval: 'A4', play: 'up' }, label: 'Hear the tritone' },
    },
    {
      type: 'choice',
      prompt: 'Which interval is {n:C} up to {n:Gb}?',
      options: [
        { text: 'An augmented fourth', why: 'That would be {n:C} up to {n:F#}: C D E F is four letters.' },
        { text: 'A diminished fifth', correct: true },
        { text: 'A perfect fifth', why: '{n:C} up to {n:G} is a perfect fifth, seven half steps. {n:Gb} is one half step lower.' },
      ],
      shuffle: false,
      explain: 'C D E F G: five letters, so a fifth. Six half steps, one fewer than a perfect fifth, make it a diminished fifth: a tritone.',
      fact: 'intervals-tritone-spelling',
    },
    {
      type: 'listen-choice',
      prompt: 'Listen: a tritone or a perfect fifth?',
      sound: { kind: 'interval', from: 'A2', interval: 'A4', play: 'together' },
      options: [{ text: 'A tritone', correct: true }, { text: 'A perfect fifth' }],
      shuffle: false,
      explain: 'That was {n:A} with {n:D#}: six half steps, the tense tritone. A perfect fifth, one fret wider, sounds open and stable.',
    },
    {
      type: 'choice',
      prompt: 'How does the tritone usually sound?',
      options: [
        { text: 'Tense and restless', correct: true },
        { text: 'Calm and settled', why: 'That is more like a perfect fifth or an octave.' },
        { text: 'Like one note, as an octave does', why: 'Only octaves and unisons blend into one note like that.' },
      ],
      shuffle: false,
      explain: 'The tritone is the restless interval: it seems to want to move somewhere else.',
      fact: 'intervals-tritone-sound',
    },
    { generate: 'interval-ear', params: { intervals: ['A4', 'P5', 'P4', 'P8'], play: 'up' } },
  ],
  facts: [
    { id: 'intervals-tritone-size', front: 'What is a tritone?', back: 'The interval of six half steps: exactly half an octave.' },
    {
      id: 'intervals-tritone-spelling',
      front: 'What are the two spellings of the tritone?',
      back: 'As a fourth, an augmented fourth ({i:A4}, {n:C} to {n:F#}); as a fifth, a diminished fifth ({i:d5}, {n:C} to {n:Gb}).',
    },
    { id: 'intervals-tritone-sound', front: 'How does the tritone sound?', back: 'Tense and restless.' },
  ],
};

// ── 6. Hearing intervals with tunes you know ──────────────────────────────────────────────────

const intervalsByEar: Lesson = {
  id: 'intervals-by-ear',
  title: 'Hearing intervals with tunes you know',
  teaches: 'You can recognise an interval by remembering a familiar tune that starts with it.',
  minutes: 4,
  skill: `theory:${U}:intervals-by-ear`,
  steps: [
    {
      type: 'card',
      title: 'A tune for each interval',
      body: 'Many players learn intervals by ear with tunes. Each of these old tunes opens with one:\n{i:M2} Frère Jacques\n{i:M3} When the Saints Go Marching In\n{i:P4} Here Comes the Bride\n{i:P5} Twinkle Twinkle, from its 2nd note to its 3rd\n{i:M6} My Bonnie Lies over the Ocean',
      figure: {
        kind: 'fretboard',
        frets: [0, 9],
        dots: [root(5, 0, 'A'), dot(5, 2, 'B', { label: 'M2' }), dot(5, 4, 'C#', { label: 'M3' }), dot(5, 5, 'D', { label: 'P4' }), dot(5, 7, 'E', { label: 'P5' }), dot(5, 9, 'F#', { label: 'M6' })],
        caption: 'Each first leap, on string 5 from the open {n:A} (R).',
      },
    },
    {
      type: 'card',
      title: 'Seconds and thirds',
      body: '**Frère Jacques** starts with a major second up, two frets: {n:A} to {n:B}. **When the Saints Go Marching In** starts with a major third up, four frets: {n:A} to {n:C#}, on "Oh when". Listen to each opening, then to its bare interval.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: [...withBare(TUNES.frereJacques, 2), rest('h'), ...withBare(TUNES.saints, 4)], tempo: 100 }, label: 'Hear the two openings' },
    },
    {
      type: 'listen-choice',
      prompt: 'Hear an interval. Which tune starts with it?',
      sound: { kind: 'interval', from: 'A2', interval: 'M3', play: 'up' },
      options: [{ text: 'When the Saints Go Marching In', correct: true }, { text: 'Frère Jacques' }],
      shuffle: false,
      explain: 'That was a major third, four half steps: {n:A} up to {n:C#}, the "Oh when" that opens When the Saints.',
      fact: 'intervals-tune-saints',
    },
    {
      type: 'card',
      title: 'Fourths and fifths',
      body: "**Here Comes the Bride**, Wagner's Bridal Chorus, starts with a perfect fourth up, five frets: {n:A} to {n:D}. **Twinkle Twinkle Little Star** repeats its first note, then leaps a perfect fifth, seven frets: {n:A} {n:A} {n:E}.",
      figure: { kind: 'audio', sound: { kind: 'tab', notes: [...withBare(TUNES.bridal, 5), rest('h'), ...withBare(TUNES.twinkle, 7)], tempo: 100 }, label: 'Hear the two openings' },
    },
    {
      type: 'choice',
      prompt: 'In Twinkle Twinkle Little Star, which leap is the perfect fifth?',
      options: [
        { text: 'From the 1st note to the 2nd', why: 'The first two notes are the same: "Twin-kle".' },
        { text: 'From the 2nd note to the 3rd', correct: true },
        { text: 'From the 3rd note to the 4th', why: 'The 3rd and 4th notes are the same, too.' },
      ],
      shuffle: false,
      explain: '"Twin-kle, twin-kle": the first two notes are the same, then the tune leaps up a perfect fifth. From the open {n:A}: {n:A} {n:A} {n:E} {n:E}.',
      fact: 'intervals-tune-twinkle',
    },
    {
      type: 'card',
      title: 'A big leap: the sixth',
      body: '**My Bonnie Lies over the Ocean** starts with a major sixth up, nine frets: {n:A} to {n:F#}, on "My Bon-". A sixth is a wide, warm leap, clearly bigger than a fifth.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: withBare(TUNES.bonnie, 9), tempo: 100 }, label: 'Hear My Bonnie' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each tune with the interval it opens with.',
      pairs: [
        { left: 'Frère Jacques', right: 'Major second' },
        { left: 'When the Saints', right: 'Major third' },
        { left: 'Here Comes the Bride', right: 'Perfect fourth' },
        { left: 'Twinkle Twinkle', right: 'Perfect fifth' },
        { left: 'My Bonnie', right: 'Major sixth' },
      ],
      explain: 'Frère Jacques {i:M2}, When the Saints {i:M3}, Here Comes the Bride {i:P4}, Twinkle Twinkle {i:P5} (2nd to 3rd note), My Bonnie {i:M6}.',
      fact: 'intervals-tune-frere-jacques',
    },
    {
      type: 'listen-choice',
      prompt: 'Hear an interval and name it.',
      sound: { kind: 'interval', from: 'A2', interval: 'P4', play: 'up' },
      options: [{ text: 'Major third' }, { text: 'Perfect fourth', correct: true }, { text: 'Perfect fifth' }, { text: 'Major sixth' }],
      shuffle: false,
      explain: 'That was a perfect fourth, five half steps: the start of Here Comes the Bride.',
    },
    {
      type: 'fretboard-find',
      prompt: 'Here Comes the Bride starts with a perfect fourth up. From the open {n:A} string, tap its second note on string 5.',
      find: { interval: 'P4', from: { string: 5, fret: 0 } },
      mode: 'one',
      octave: 'exact',
      frets: [0, 9],
      strings: [5],
      shown: [root(5, 0, 'A')],
      explain: 'Five half steps above {n:A}: string 5, fret 5, {n:D}. "Here comes" goes {n:A} up to {n:D}.',
      fact: 'intervals-tune-bridal',
    },
    {
      type: 'choice',
      prompt: 'Which tune opens with a major sixth?',
      options: [
        { text: 'My Bonnie Lies over the Ocean', correct: true },
        { text: 'Frère Jacques', why: 'Frère Jacques opens with a major second.' },
        { text: 'Here Comes the Bride', why: 'That one opens with a perfect fourth.' },
        { text: 'When the Saints Go Marching In', why: 'That one opens with a major third.' },
      ],
      explain: 'My Bonnie leaps up a major sixth on "My Bon-": from the open {n:A} string to {n:F#} at fret 9.',
      fact: 'intervals-tune-bonnie',
    },
    { generate: 'interval-ear', params: { intervals: ['P5', 'M3', 'P4', 'M2', 'M6'], play: 'up' } },
    { generate: 'interval-ear', params: { intervals: ['P4', 'P5', 'M6', 'M3', 'M2'], play: 'up' } },
  ],
  facts: [
    {
      id: 'intervals-tune-twinkle',
      front: 'Which interval does Twinkle Twinkle Little Star leap from its 2nd note to its 3rd?',
      back: 'A perfect fifth up ({i:P5}).',
    },
    {
      id: 'intervals-tune-frere-jacques',
      front: 'Which interval does Frère Jacques start with?',
      back: 'A major second up ({i:M2}).',
      ask: {
        type: 'choice',
        prompt: 'Which interval does Frère Jacques start with?',
        options: [{ text: 'A major second up', correct: true }, { text: 'A major third up' }, { text: 'A perfect fourth up' }],
        explain: 'Frère Jacques climbs one step at a time from its first note: a major second up, two frets.',
      },
    },
    { id: 'intervals-tune-saints', front: 'Which interval does When the Saints Go Marching In start with?', back: 'A major third up ({i:M3}).' },
    { id: 'intervals-tune-bridal', front: "Which interval does Here Comes the Bride (Wagner's Bridal Chorus) start with?", back: 'A perfect fourth up ({i:P4}).' },
    { id: 'intervals-tune-bonnie', front: 'Which interval does My Bonnie Lies over the Ocean start with?', back: 'A major sixth up ({i:M6}).' },
  ],
};

// ── 7. Intervals inside chords ────────────────────────────────────────────────────────────────

/** Open A (x02220) and open Am (x02210), labelled with their formula numbers from the root A. */
const OPEN_A: FretDot[] = [dot(5, 0, 'A', { degree: '1', role: 'root', label: '1' }), dot(4, 2, 'E', { degree: '5' }), dot(3, 2, 'A', { degree: '1', role: 'root', label: '1' }), dot(2, 2, 'C#', { degree: '3' }), dot(1, 0, 'E', { degree: '5' })];
const OPEN_AM: FretDot[] = [dot(5, 0, 'A', { degree: '1', role: 'root', label: '1' }), dot(4, 2, 'E', { degree: '5' }), dot(3, 2, 'A', { degree: '1', role: 'root', label: '1' }), dot(2, 1, 'C', { degree: 'b3' }), dot(1, 0, 'E', { degree: '5' })];

const intervalsInChords: Lesson = {
  id: 'intervals-in-chords',
  title: 'Intervals inside chords',
  teaches: 'Chords are intervals stacked on a root: a major triad is 1 3 5, a minor triad 1 flat-3 5, a power chord 1 5.',
  minutes: 3,
  skill: `theory:${U}:intervals-in-chords`,
  steps: [
    {
      type: 'card',
      title: 'Chords are stacked intervals',
      body: 'A chord is a set of intervals above its {t:root}. {c:A} is {n:A} {n:C#} {n:E}: the root, a major third ({i:M3}) and a perfect fifth ({i:P5}) above it. Written as a {t:chord-formula|chord formula}, that is **1 3 5**.',
      figure: { kind: 'fretboard', frets: [0, 3], root: 'A', labels: 'degree', dots: OPEN_A, caption: 'Open {c:A}, x02220: every dot is 1, 3 or 5.' },
    },
    {
      type: 'card',
      title: 'Minor: a lower third',
      body: '{c:Am} is {n:A} {n:C} {n:E}: the root, a minor third ({i:m3}) and the same perfect fifth. Its formula is **1 {d:b3} 5**. In formulas, 3 means a major third above the root and {d:b3} a minor third, one half step lower.',
      figure: { kind: 'fretboard', frets: [0, 3], root: 'A', labels: 'degree', dots: OPEN_AM, caption: 'Open {c:Am}, x02210: the third drops one fret.' },
    },
    {
      type: 'chord-build',
      task: 'missing-note',
      chord: 'Am',
      given: ['A', 'E'],
      options: ['C', 'C#', 'B', 'D'],
      spelling: 'any',
      prompt: 'Open {c:Am} with string 2 left out gives only {n:A} and {n:E}. Which note completes the chord?',
      figure: { kind: 'fretboard', frets: [0, 3], root: 'A', labels: 'degree', dots: OPEN_AM.filter((d) => d.string !== 2) },
      explain: 'The missing note is the minor third, {n:C} ({d:b3}): string 2, fret 1 in open {c:Am}. {n:C#} would make it {c:A} major.',
      fact: 'intervals-minor-triad',
    },
    {
      type: 'choice',
      prompt: 'Which formula is a minor triad?',
      options: [
        { text: '1 3 5', why: 'That is a major triad: its 3 is a major third.' },
        { text: '1 {d:b3} 5', correct: true },
        { text: '1 5', why: 'That is a power chord: no third at all.' },
      ],
      shuffle: false,
      explain: 'A minor triad is the root, a minor third ({d:b3}) and a perfect fifth: 1 {d:b3} 5.',
      fact: 'intervals-formula-numbers',
    },
    {
      type: 'fretboard-name',
      prompt: 'In open {c:A}, the root is the open string 5 (R). Which formula number is the other dot?',
      position: { string: 4, fret: 2 },
      root: { string: 5, fret: 0 },
      ask: 'degree',
      spelling: 'any',
      options: ['5', '3', 'b3', '4'],
      explain: 'String 4, fret 2 is {n:E}: seven half steps above {n:A}, a perfect fifth. In the formula it is the 5.',
      fact: 'intervals-major-triad',
    },
    {
      type: 'card',
      title: 'Power chords: 1 5',
      body: 'A {t:power-chord|power chord} keeps only the root and the perfect fifth: **1 5**. With no third it is neither major nor minor. {c:A5} is string 6 fret 5 with string 5 fret 7, often with the octave {n:A} added on string 4.',
      figure: { kind: 'chord', symbol: 'A5', frets: '577xxx', caption: '{c:A5}: root, fifth and octave.' },
    },
    {
      type: 'true-false',
      statement: 'A power chord has a third.',
      answer: false,
      explain: 'A power chord is 1 5: the root and the perfect fifth, with no third, so it is neither major nor minor.',
      fact: 'intervals-power-formula',
    },
    {
      type: 'choice',
      prompt: 'Which interval above the root do {c:A}, {c:Am} and {c:A5} all have?',
      options: [
        { text: 'A perfect fifth', correct: true },
        { text: 'A major third', why: '{c:Am} has a minor third, and {c:A5} no third at all.' },
        { text: 'A minor third', why: '{c:A} has a major third, and {c:A5} no third at all.' },
      ],
      shuffle: false,
      explain: 'All three have {n:E}, a perfect fifth (seven half steps) above {n:A}. Only the third changes, or goes.',
    },
    { generate: 'chord-tones', params: { types: ['major', 'minor'], roots: ['A', 'E', 'D', 'C', 'G'], ask: 'tone' } },
    { generate: 'interval-on-neck', params: { intervals: ['P5', 'M3', 'm3'], ask: 'find', strings: [6, 5], frets: [0, 7] } },
  ],
  facts: [
    {
      id: 'intervals-major-triad',
      front: 'What is a major triad, as intervals?',
      back: 'The root, a major third and a perfect fifth above it: 1 3 5. {c:A} is {n:A} {n:C#} {n:E}.',
    },
    {
      id: 'intervals-minor-triad',
      front: 'What is a minor triad, as intervals?',
      back: 'The root, a minor third and a perfect fifth above it: 1 {d:b3} 5. {c:Am} is {n:A} {n:C} {n:E}.',
      ask: { generate: 'chord-tones', params: { types: ['minor'], roots: ['A', 'E', 'D', 'C', 'G'], ask: 'missing' } },
    },
    {
      id: 'intervals-formula-numbers',
      front: 'In a chord formula, what do 3 and {d:b3} mean?',
      back: '3 is a major third above the root; {d:b3} is a minor third, one half step lower.',
    },
    { id: 'intervals-power-formula', front: 'What is the formula of a power chord?', back: '1 5: a root and a perfect fifth, with no third.' },
  ],
};

/** Unit 10 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'Intervals: measuring distance',
  theme: 'intervals',
  description: 'Name the distance between two notes, from the half step to the octave, and hear the common ones.',
  lessons: [whatAnIntervalIs, secondsAndThirds, fourthsFifthsOctaves, sixthsAndSevenths, theTritone, intervalsByEar, intervalsInChords],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      {
        type: 'choice',
        prompt: 'Count the letters: which interval is {n:F} up to {n:D}?',
        options: [{ text: 'A fourth' }, { text: 'A fifth' }, { text: 'A sixth', correct: true }, { text: 'A seventh' }],
        shuffle: false,
        explain: 'F G A B C D: six letter names, counting both ends, so {n:F} up to {n:D} is a sixth.',
      },
      {
        type: 'true-false',
        statement: '{n:F} up to {n:A} is a third.',
        answer: true,
        explain: 'F G A: three letter names, counting both ends. Four half steps make it a major third.',
      },
      {
        type: 'match-pairs',
        prompt: 'Match each interval with its size.',
        pairs: [
          { left: 'Minor second', right: '1 half step' },
          { left: 'Major third', right: '4 half steps' },
          { left: 'Perfect fourth', right: '5 half steps' },
          { left: 'Tritone', right: '6 half steps' },
        ],
        explain: 'A minor second is 1 half step, a major third 4, a perfect fourth 5 and the tritone 6, half an octave.',
      },
      {
        type: 'match-pairs',
        prompt: 'Match each interval with its size.',
        pairs: [
          { left: 'Perfect fifth', right: '7 half steps' },
          { left: 'Minor sixth', right: '8 half steps' },
          { left: 'Major sixth', right: '9 half steps' },
          { left: 'Minor seventh', right: '10 half steps' },
          { left: 'Major seventh', right: '11 half steps' },
        ],
        explain: 'From the perfect fifth up, each interval adds one half step: 7, 8, 9, 10, 11. Then 12 is the octave.',
      },
      {
        type: 'choice',
        prompt: 'Which of these is a perfect interval?',
        options: [
          { text: 'A fifth ({i:P5})', correct: true },
          { text: 'A major third ({i:M3})', why: 'Thirds are major or minor, never perfect.' },
          { text: 'A minor sixth ({i:m6})', why: 'Sixths are major or minor, never perfect.' },
          { text: 'A major second ({i:M2})', why: 'Seconds are major or minor, never perfect.' },
        ],
        explain: 'The perfect intervals are the unison, the fourth, the fifth and the octave.',
      },
      {
        type: 'choice',
        prompt: 'How many half steps make a tritone?',
        options: [{ text: '5' }, { text: '6', correct: true }, { text: '7' }],
        shuffle: false,
        explain: 'A tritone is six half steps, exactly half an octave: an augmented fourth or a diminished fifth.',
      },
      {
        type: 'choice',
        prompt: 'Open strings 3 and 2, {n:G} and {n:B}, are which interval apart?',
        options: [
          { text: 'A major third', correct: true },
          { text: 'A perfect fourth', why: 'That is the distance between the other neighbouring open strings, not these two.' },
          { text: 'A perfect fifth', why: 'A fifth is seven half steps; {n:G} to {n:B} is four.' },
        ],
        shuffle: false,
        explain: '{n:G} up to {n:B} is four half steps: a major third. Every other pair of neighbouring open strings is a perfect fourth apart.',
      },
      {
        type: 'fretboard-find',
        prompt: 'The dot is the open {n:D} string, string 4. Tap the perfect fourth above it on string 3.',
        find: { interval: 'P4', from: { string: 4, fret: 0 } },
        mode: 'one',
        octave: 'exact',
        frets: [0, 5],
        strings: [3],
        shown: [root(4, 0, 'D')],
        explain: 'Five half steps above {n:D} is {n:G}: the open string 3. Neighbouring open strings are a perfect fourth apart.',
      },
      { generate: 'interval-name', params: { intervals: ['P5', 'P4', 'M3', 'm3', 'M2', 'm2', 'P8', 'M6', 'm6', 'm7', 'M7'], roots: ['C', 'G', 'D', 'A', 'E', 'F'] } },
      { generate: 'interval-ear', params: { intervals: ['P5', 'P4', 'M3', 'M2', 'M6'], play: 'up' } },
      {
        type: 'chord-build',
        task: 'missing-note',
        chord: 'E',
        given: ['E', 'B'],
        options: ['G#', 'G', 'A', 'F#'],
        spelling: 'any',
        prompt: 'The {c:E} major chord has the root {n:E} and the fifth {n:B}. Which note is its major third?',
        explain: 'A major third is four half steps above {n:E}: {n:G#}. With {n:G}, a minor third, the chord would be {c:Em}.',
      },
      {
        type: 'choice',
        prompt: 'Which formula is a major triad?',
        options: [
          { text: '1 3 5', correct: true },
          { text: '1 {d:b3} 5', why: 'The minor third makes that a minor triad.' },
          { text: '1 5', why: 'That is a power chord: no third.' },
        ],
        shuffle: false,
        explain: 'A major triad is the root, a major third and a perfect fifth: 1 3 5.',
      },
      {
        type: 'fretboard-name',
        prompt: 'In open {c:E}, string 4 fret 2 is the root {n:E} (R). Which formula number is the other dot?',
        position: { string: 3, fret: 1 },
        root: { string: 4, fret: 2 },
        ask: 'degree',
        spelling: 'any',
        options: ['3', 'b3', '5', '4'],
        explain: 'String 3, fret 1 is {n:G#}: four half steps above {n:E}, a major third. In the formula it is the 3.',
      },
      { generate: 'semitones-match', params: { intervals: ['P5', 'P4', 'M3', 'm3', 'M2', 'm2', 'P8', 'M6', 'm6', 'm7', 'M7', 'A4'], pairs: 5 } },
    ],
  },
};

export default unit;
