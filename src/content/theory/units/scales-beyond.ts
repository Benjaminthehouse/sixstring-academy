/**
 * Theory Path, unit 37: Scales beyond the basics. Written from the syllabus entries in
 * `src/content/plan/theory-path.json` (unit `scales-beyond`), one lesson per entry, in order: each
 * lesson opens with the "on the guitar" picture, asks the planned exercises, ends with the planned
 * drills, and turns every planned fact into a review card.
 *
 * Every scale, degree, mode and fret quoted here is cross-checked against `@/core/theory` and
 * `@/core/guitar` in `scales-beyond.test.ts`.
 *
 * Three things the plan asks for are done differently, because of what the engine can grade and
 * play (see the unit test and the report):
 * - "Type the notes of a scale" cannot be one typed answer (a text answer ignores sharps), so each
 *   such exercise types the scale's telling note and an `order` question then spells the scale.
 * - A lesson `Sound` cannot hold a chord under a melody, so "over a chord" and "over a drone" are
 *   played as a guitarist practises alone: the drone note is struck again before every note of the
 *   line (as the modes unit does), and the avoid-note question plays the chord with the note in it.
 * - The `scale-notes` drill takes scales of five to seven notes, so the bebop lesson drills the
 *   two seven-note scales the bebop scales are built from.
 */
import { scaleMidi } from '@/core/theory';
import { openStringMidi } from '@/core/guitar';
import type { Lesson, TabNote, Unit } from '@/lessons';

const U = 'scales-beyond';

type Spot = { string: number; fret: number };

/** Where a melody note goes: the thinnest string that reaches it, so the frets stay low. */
function place(midi: number): Spot {
  for (let string = 1; string <= 6; string++) {
    const open = openStringMidi(string);
    if (midi >= open) return { string, fret: midi - open };
  }
  throw new RangeError(`MIDI ${midi} is below the low E string`);
}

/** One octave of a scale, up from `tonic` (MIDI), as eighth notes. */
function line(tonic: number, scale: string): TabNote[] {
  return scaleMidi(tonic, scale).map((m) => ({ ...place(m), duration: 'e' as const }));
}

/** One octave of a scale with the drone note struck before every note of it. */
function overDrone(drone: Spot, tonic: number, scale: string): TabNote[] {
  return line(tonic, scale).flatMap((n) => [{ ...drone, duration: 'e' as const }, n]);
}

const OPEN_A: Spot = { string: 5, fret: 0 };
const OPEN_E: Spot = { string: 6, fret: 0 };
/** The low G a guitarist lets ring under G7: string 6, fret 3. */
const LOW_G: Spot = { string: 6, fret: 3 };
const E3 = 52;
const G3 = 55;
const A3 = 57;
const BB3 = 58;
const B3 = 59;

/** G bebop dominant falling from G on string 1 in eighth notes: G, F, D and B land on beats 1 to 4. */
const BEBOP_RUN: TabNote[] = [
  { string: 1, fret: 3, duration: 'e' },
  { string: 1, fret: 2, duration: 'e' },
  { string: 1, fret: 1, duration: 'e' },
  { string: 1, fret: 0, duration: 'e' },
  { string: 2, fret: 3, duration: 'e' },
  { string: 2, fret: 1, duration: 'e' },
  { string: 2, fret: 0, duration: 'e' },
  { string: 3, fret: 2, duration: 'e' },
  { string: 3, fret: 0, duration: 'w' },
];

const chordScales: Lesson = {
  id: 'chord-scales',
  title: 'A scale for every chord',
  teaches: 'Chord-scale thinking gives each chord a scale with its tones and tensions, and flags notes to avoid holding.',
  minutes: 3,
  skill: `theory:${U}:chord-scales`,
  steps: [
    {
      type: 'card',
      title: 'A scale for every chord',
      body: '{t:chord-scale|Chord-scale} thinking gives each chord its own scale: one that holds every {t:chord-tone|chord tone} plus the {t:extension|extensions} that suit it. Over {c:Cmaj7} that is {n:C} Ionian: the chord tones {n:C} {n:E} {n:G} {n:B}, with {n:D} and {n:A} as colours.',
      figure: {
        kind: 'fretboard',
        frets: [7, 10],
        derive: { scale: 'major', tonic: 'C' },
        dots: [
          { string: 6, fret: 10, note: 'D', role: 'ghost' },
          { string: 3, fret: 7, note: 'D', role: 'ghost' },
          { string: 1, fret: 10, note: 'D', role: 'ghost' },
          { string: 4, fret: 7, note: 'A', role: 'ghost' },
          { string: 2, fret: 10, note: 'A', role: 'ghost' },
          { string: 5, fret: 8, note: 'F', role: 'target' },
          { string: 3, fret: 10, note: 'F', role: 'target' },
        ],
        caption: '{n:C} Ionian at fret 7. Bright: {c:Cmaj7}. Pale: {n:D}, {n:A}. Marked: {n:F}.',
      },
    },
    {
      type: 'card',
      title: 'The note to keep moving',
      body: 'Hold {n:F} over {c:Cmaj7} and it rubs against {n:E}, the 3rd, a half step below. That is an {t:avoid-note|avoid note}: a scale note a half step above a chord tone, which clashes if you hold it. Pass through it, {n:F} to {n:E}, and it sounds fine.',
      figure: { kind: 'audio', sound: { kind: 'notes', notes: ['C3', 'E3', 'G3', 'B3', 'F4'], together: true }, label: 'Hear {n:F} held on {c:Cmaj7}' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each chord of {k:C major} with its scale.',
      pairs: [
        { left: '{c:Cmaj7}', right: '{n:C} Ionian' },
        { left: '{c:Dm7}', right: '{n:D} Dorian' },
        { left: '{c:G7}', right: '{n:G} Mixolydian' },
        { left: '{c:Bm7b5}', right: '{n:B} Locrian' },
      ],
      explain: 'Each diatonic chord takes the mode that starts on its root: the same seven notes of {k:C major}, with the chord as home.',
      fact: 'beyond-diatonic-chord-scales',
    },
    {
      type: 'choice',
      prompt: 'Which note is the avoid note over {c:Cmaj7} in {n:C} Ionian?',
      options: [
        { text: '{n:F}', correct: true },
        { text: '{n:D}', why: '{n:D} is the 9th, a whole step above {n:C}: a colour that sits well.' },
        { text: '{n:A}', why: '{n:A} is the 13th, a whole step above {n:G}: it sits well too.' },
        { text: '{n:B}', why: '{n:B} is a chord tone, the 7th of {c:Cmaj7}.' },
      ],
      explain: '{n:F} is a half step above {n:E}, the 3rd of {c:Cmaj7}. Held against the chord it clashes; as a passing note it is fine.',
      fact: 'beyond-avoid-note',
    },
    {
      type: 'listen-choice',
      prompt: 'A {c:Cmaj7} with one more note held on top. Does it clash?',
      sound: { kind: 'notes', notes: ['C3', 'E3', 'G3', 'B3', 'F4'], together: true },
      options: [{ text: 'Yes: the top note rubs against the 3rd', correct: true }, { text: 'No: it blends in' }],
      shuffle: false,
      explain: 'The top note was {n:F}, the avoid note: it grinds against the {n:E} below it.',
    },
    {
      type: 'listen-choice',
      prompt: 'And with this top note?',
      sound: { kind: 'notes', notes: ['C3', 'E3', 'G3', 'B3', 'D4'], together: true },
      options: [{ text: 'Yes: the top note rubs against the 3rd' }, { text: 'No: it blends in', correct: true }],
      shuffle: false,
      explain: 'The top note was {n:D}, the 9th: a whole step above the root, it adds colour without a clash.',
    },
    {
      type: 'true-false',
      statement: 'You should never play an avoid note over its chord.',
      answer: false,
      explain: 'Passing through it is fine: {n:F} moving on to {n:E} over {c:Cmaj7} sounds smooth. Only holding it, or landing on it, clashes.',
      fact: 'beyond-avoid-note',
    },
    {
      type: 'choice',
      prompt: 'Which scale goes with {c:Em7} in {k:C major}?',
      options: [
        { text: '{n:E} Phrygian', correct: true },
        { text: '{n:E} Dorian', why: '{n:E} Dorian has {n:F#} and {n:C#}, which are not in {k:C major}.' },
        { text: '{n:E} Aeolian', why: '{n:E} Aeolian has {n:F#}, which is not in {k:C major}.' },
      ],
      explain: '{n:E} is degree 3 of {k:C major}, and the mode from degree 3 is Phrygian: E F G A B C D.',
      fact: 'beyond-chord-scale',
    },
    {
      type: 'choice',
      prompt: 'In {n:G} Mixolydian over {c:G7}, which note is the avoid note?',
      options: [
        { text: '{n:C}', correct: true },
        { text: '{n:A}', why: '{n:A} is the 9th, a whole step above {n:G}.' },
        { text: '{n:E}', why: '{n:E} is the 13th, a whole step above {n:D}.' },
        { text: '{n:F}', why: '{n:F} is a chord tone, the 7th of {c:G7}.' },
      ],
      explain: '{n:C} is a half step above {n:B}, the 3rd of {c:G7}: held, it clashes, just like {n:F} over {c:Cmaj7}.',
      fact: 'beyond-avoid-note',
    },
    { generate: 'scale-notes', params: { scales: ['major', 'dorian', 'mixolydian', 'locrian'], tonics: ['C', 'D', 'G', 'B'], form: 'order' } },
  ],
  facts: [
    {
      id: 'beyond-chord-scale',
      front: 'What does chord-scale thinking give each chord?',
      back: 'A scale that contains its chord tones and the tensions that suit it.',
    },
    {
      id: 'beyond-diatonic-chord-scales',
      front: 'In a major key, which scales go with {r:Imaj7}, {r:ii7}, {r:V7} and {r:viiø7}?',
      back: 'Their own modes: Ionian, Dorian, Mixolydian and Locrian. In {k:C major}: {n:C} Ionian, {n:D} Dorian, {n:G} Mixolydian, {n:B} Locrian.',
      ask: {
        type: 'match-pairs',
        prompt: 'Match each chord of {k:C major} with its scale.',
        pairs: [
          { left: '{c:Cmaj7}', right: '{n:C} Ionian' },
          { left: '{c:Dm7}', right: '{n:D} Dorian' },
          { left: '{c:G7}', right: '{n:G} Mixolydian' },
          { left: '{c:Bm7b5}', right: '{n:B} Locrian' },
        ],
        explain: 'Each chord takes the mode that starts on its root.',
      },
    },
    {
      id: 'beyond-avoid-note',
      front: 'What is an avoid note?',
      back: 'A scale note a half step above a chord tone that clashes if held: {n:F} over {c:Cmaj7}, above the 3rd, {n:E}.',
    },
  ],
};

const melodicMinorModes: Lesson = {
  id: 'melodic-minor-modes',
  title: 'The modes of melodic minor',
  teaches: 'Melodic minor\'s modes fit four jazz chords: sharp-11 dominant, half-diminished, altered, major 7 sharp 5.',
  minutes: 4,
  skill: `theory:${U}:melodic-minor-modes`,
  steps: [
    {
      type: 'card',
      title: 'One scale, more homes',
      body: '{n:D} {t:melodic-minor} is {n:D} {n:E} {n:F} {n:G} {n:A} {n:B} {n:C#}. Like the major scale, it has a {t:mode} on every note. Start it on {n:G}, its 4th note, and you get {n:G} {t:lydian-dominant|Lydian dominant}: {d:1} {d:2} {d:3} {d:#4} {d:5} {d:6} {d:b7}, the scale for {c:G7#11}.',
      figure: {
        kind: 'fretboard',
        frets: [2, 5],
        root: 'G',
        labels: 'degree',
        dots: [
          { string: 6, fret: 3, note: 'G', degree: '1' },
          { string: 6, fret: 5, note: 'A', degree: '2' },
          { string: 5, fret: 2, note: 'B', degree: '3' },
          { string: 5, fret: 4, note: 'C#', degree: '#4' },
          { string: 5, fret: 5, note: 'D', degree: '5' },
          { string: 4, fret: 2, note: 'E', degree: '6' },
          { string: 4, fret: 3, note: 'F', degree: 'b7' },
          { string: 4, fret: 5, note: 'G', degree: '1' },
          { string: 3, fret: 2, note: 'A', degree: '2' },
          { string: 3, fret: 4, note: 'B', degree: '3' },
          { string: 2, fret: 2, note: 'C#', degree: '#4' },
          { string: 2, fret: 3, note: 'D', degree: '5' },
          { string: 2, fret: 5, note: 'E', degree: '6' },
          { string: 1, fret: 3, note: 'G', degree: '1' },
          { string: 1, fret: 5, note: 'A', degree: '2' },
        ],
        caption: '{n:D} melodic minor at fret 2, counted from {n:G}: Lydian dominant.',
      },
    },
    {
      type: 'card',
      title: 'Hear it over a low G',
      body: 'Lydian dominant is Mixolydian with a raised 4th. Over {c:G7} that {n:C#} is the {d:#11}: bright and a little restless, where Mixolydian\'s {n:C} would rub against the 3rd.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: overDrone(LOW_G, G3, 'lydian-dominant'), tempo: 110 }, label: 'Hear {n:G} Lydian dominant' },
    },
    {
      type: 'type-answer',
      prompt: '{n:G} Lydian dominant is {n:G} Mixolydian with a raised 4th. Type that raised 4th.',
      answer: { kind: 'note', value: 'C#', spelling: 'exact' },
      input: 'keypad',
      explain: 'The 4th of {n:G} is {n:C}; raised, it is {n:C#}. Spell it {n:C#}, not {n:Db}: it is an augmented 4th above {n:G}.',
      fact: 'beyond-lydian-dominant',
    },
    {
      type: 'order',
      prompt: 'Spell {n:G} Lydian dominant, from {n:G}.',
      tiles: ['{n:G}', '{n:A}', '{n:B}', '{n:C#}', '{n:D}', '{n:E}', '{n:F}'],
      distractors: ['{n:C}', '{n:F#}'],
      explain: '{n:G} {n:A} {n:B} {n:C#} {n:D} {n:E} {n:F}: the notes of {n:D} melodic minor, from {n:G}. Raised 4th, flat 7th.',
      fact: 'beyond-lydian-dominant',
    },
    {
      type: 'card',
      title: 'From the 6th note',
      body: 'Start the same notes on {n:B}, the 6th note: {n:B} Locrian natural 2, {d:1} {d:2} {d:b3} {d:4} {d:b5} {d:b6} {d:b7}. It is Locrian with a major 2nd, {n:C#}, and it fits half-diminished chords such as {c:Bm7b5}.',
      figure: {
        kind: 'fretboard',
        frets: [2, 5],
        root: 'B',
        labels: 'degree',
        dots: [
          { string: 6, fret: 3, note: 'G', degree: 'b6' },
          { string: 6, fret: 5, note: 'A', degree: 'b7' },
          { string: 5, fret: 2, note: 'B', degree: '1' },
          { string: 5, fret: 4, note: 'C#', degree: '2' },
          { string: 5, fret: 5, note: 'D', degree: 'b3' },
          { string: 4, fret: 2, note: 'E', degree: '4' },
          { string: 4, fret: 3, note: 'F', degree: 'b5' },
          { string: 4, fret: 5, note: 'G', degree: 'b6' },
          { string: 3, fret: 2, note: 'A', degree: 'b7' },
          { string: 3, fret: 4, note: 'B', degree: '1' },
          { string: 2, fret: 2, note: 'C#', degree: '2' },
          { string: 2, fret: 3, note: 'D', degree: 'b3' },
          { string: 2, fret: 5, note: 'E', degree: '4' },
          { string: 1, fret: 3, note: 'G', degree: 'b6' },
          { string: 1, fret: 5, note: 'A', degree: 'b7' },
        ],
        caption: 'The same notes counted from {n:B}: Locrian natural 2.',
      },
    },
    {
      type: 'choice',
      prompt: 'Which chord does {n:B} Locrian natural 2 fit?',
      options: [
        { text: '{c:Bm7b5}', correct: true },
        { text: '{c:Bm7}', why: '{c:Bm7} has {n:F#}, a perfect 5th; this scale has {n:F}, a flat 5th.' },
        { text: '{c:B7}', why: '{c:B7} has {n:D#}, a major 3rd; this scale has {n:D}.' },
        { text: '{c:Bdim7}', why: '{c:Bdim7} needs {n:Ab}; this scale has {n:A}, the flat 7th of {c:Bm7b5}.' },
      ],
      explain: '{c:Bm7b5} is {n:B} {n:D} {n:F} {n:A}: root, flat 3rd, flat 5th and flat 7th, all in the scale.',
      fact: 'beyond-locrian-natural-2',
    },
    {
      type: 'card',
      title: 'From the 7th note',
      body: 'Start on {n:C#}, the 7th note: the {t:altered-scale|altered scale}. Against {n:C#} its notes are the root, {d:b9}, {d:#9}, 3rd ({n:F}, the same pitch as {n:E#}), {d:#11}, {d:b13} and {d:b7}: every altered tension, so it fits {c:C#7alt}. And from {n:F}, the 3rd note, Lydian augmented fits {c:Fmaj7#5}.',
      figure: {
        kind: 'fretboard',
        frets: [2, 5],
        root: 'C#',
        labels: 'degree',
        dots: [
          { string: 6, fret: 3, note: 'G', degree: '#11' },
          { string: 6, fret: 5, note: 'A', degree: 'b13' },
          { string: 5, fret: 2, note: 'B', degree: 'b7' },
          { string: 5, fret: 4, note: 'C#', degree: '1' },
          { string: 5, fret: 5, note: 'D', degree: 'b9' },
          { string: 4, fret: 2, note: 'E', degree: '#9' },
          { string: 4, fret: 3, note: 'F', degree: '3' },
          { string: 4, fret: 5, note: 'G', degree: '#11' },
          { string: 3, fret: 2, note: 'A', degree: 'b13' },
          { string: 3, fret: 4, note: 'B', degree: 'b7' },
          { string: 2, fret: 2, note: 'C#', degree: '1' },
          { string: 2, fret: 3, note: 'D', degree: 'b9' },
          { string: 2, fret: 5, note: 'E', degree: '#9' },
          { string: 1, fret: 3, note: 'G', degree: '#11' },
          { string: 1, fret: 5, note: 'A', degree: 'b13' },
        ],
        caption: 'The same notes counted from {n:C#}: the altered scale.',
      },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each chord with the mode of melodic minor that fits it.',
      pairs: [
        { left: '{c:G7#11}', right: 'Lydian dominant' },
        { left: '{c:Bm7b5}', right: 'Locrian natural 2' },
        { left: '{c:C#7alt}', right: 'Altered scale' },
        { left: '{c:Fmaj7#5}', right: 'Lydian augmented' },
      ],
      explain: 'Modes 4, 6, 7 and 3 of {n:D} melodic minor, started on {n:G}, {n:B}, {n:C#} and {n:F}: each one holds every note of its chord.',
      fact: 'beyond-altered-lydian-augmented',
    },
    {
      type: 'listen-choice',
      prompt: 'Over a low {n:G}: Mixolydian or Lydian dominant?',
      sound: { kind: 'tab', notes: overDrone(LOW_G, G3, 'lydian-dominant'), tempo: 110 },
      options: [{ text: 'Lydian dominant', correct: true }, { text: 'Mixolydian' }],
      shuffle: false,
      explain: 'The 4th note was {n:C#}, a raised 4th: Lydian dominant. Mixolydian has {n:C} there.',
    },
    {
      type: 'true-false',
      statement: '{n:G} Lydian dominant uses the same notes as {n:D} melodic minor.',
      answer: true,
      explain: '{n:G} is the 4th note of {n:D} melodic minor, so mode 4 from {n:G} keeps every note: {n:G} {n:A} {n:B} {n:C#} {n:D} {n:E} {n:F}.',
      fact: 'beyond-lydian-dominant',
    },
    { generate: 'scale-notes', params: { scales: ['melodic-minor', 'lydian-dominant', 'locrian-natural-2', 'altered', 'lydian-augmented'], tonics: ['D', 'G', 'C', 'F'], form: 'order' } },
    { generate: 'scale-ear', params: { scales: ['mixolydian', 'lydian-dominant', 'altered'] } },
  ],
  facts: [
    {
      id: 'beyond-lydian-dominant',
      front: 'Which mode of melodic minor fits {c:G7#11}?',
      back: 'Mode 4, Lydian dominant: {d:1} {d:2} {d:3} {d:#4} {d:5} {d:6} {d:b7}. {n:G} Lydian dominant has the notes of {n:D} melodic minor.',
    },
    {
      id: 'beyond-locrian-natural-2',
      front: 'Which mode of melodic minor fits a half-diminished chord such as {c:Bm7b5}?',
      back: 'Mode 6, Locrian natural 2: {d:1} {d:2} {d:b3} {d:4} {d:b5} {d:b6} {d:b7}.',
    },
    {
      id: 'beyond-altered-lydian-augmented',
      front: 'Which modes of melodic minor fit {c:G7alt} and {c:Cmaj7#5}?',
      back: 'Mode 7, the altered scale, fits {c:G7alt}. Mode 3, Lydian augmented ({d:1} {d:2} {d:3} {d:#4} {d:#5} {d:6} {d:7}), fits {c:Cmaj7#5}.',
      ask: {
        type: 'match-pairs',
        prompt: 'Match each chord with the mode of melodic minor that fits it.',
        pairs: [
          { left: '{c:G7alt}', right: 'Altered scale' },
          { left: '{c:Cmaj7#5}', right: 'Lydian augmented' },
          { left: '{c:Am7b5}', right: 'Locrian natural 2' },
          { left: '{c:D7#11}', right: 'Lydian dominant' },
        ],
        explain: 'The altered scale is mode 7, Lydian augmented mode 3, Locrian natural 2 mode 6 and Lydian dominant mode 4 of melodic minor.',
      },
    },
  ],
};

const phrygianDominant: Lesson = {
  id: 'phrygian-dominant',
  title: 'Phrygian dominant',
  teaches: 'Phrygian dominant, mode 5 of harmonic minor, is the sound of a minor key\'s dominant, of flamenco and of metal.',
  minutes: 3,
  skill: `theory:${U}:phrygian-dominant`,
  steps: [
    {
      type: 'card',
      title: 'Mode 5 of harmonic minor',
      body: '{n:A} {t:harmonic-minor} is {n:A} {n:B} {n:C} {n:D} {n:E} {n:F} {n:G#}. Start it on {n:E}, its 5th note, and you get {n:E} {t:phrygian-dominant|Phrygian dominant}: {n:E} {n:F} {n:G#} {n:A} {n:B} {n:C} {n:D}. It is Phrygian with a major 3rd, {n:G#}, so it fits the {c:E} chord (022100).',
      figure: {
        kind: 'fretboard',
        frets: [0, 4],
        derive: { scale: 'phrygian-dominant', tonic: 'E' },
        dots: [
          { string: 6, fret: 1, note: 'F', role: 'target' },
          { string: 4, fret: 3, note: 'F', role: 'target' },
          { string: 1, fret: 1, note: 'F', role: 'target' },
          { string: 6, fret: 4, note: 'G#', role: 'target' },
          { string: 3, fret: 1, note: 'G#', role: 'target' },
          { string: 1, fret: 4, note: 'G#', role: 'target' },
        ],
        caption: '{n:E} Phrygian dominant in open position. Marked: {n:F} and {n:G#}.',
      },
    },
    {
      type: 'card',
      title: 'Where you hear it',
      body: 'The {t:andalusian-cadence|Andalusian cadence} walks down {c:Am} {c:G} {c:F} {c:E}. Over that last {c:E}, the {n:F} and {n:G#} of Phrygian dominant give the Spanish sound of flamenco, and the same scale drives much metal guitar.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['Am', 'G', 'F', 'E'], tempo: 80 }, label: 'Hear {c:Am} {c:G} {c:F} {c:E}' },
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap the note that makes {n:E} Phrygian dominant sound dominant: its major 3rd, on string 6.',
      find: { note: 'G#2' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 5],
      strings: [6],
      explain: 'String 6, fret 4: {n:G#}, a major 3rd above the open {n:E}. Plain Phrygian has {n:G} at fret 3.',
      fact: 'beyond-e-phrygian-dominant',
    },
    {
      type: 'type-answer',
      prompt: '{n:B} Phrygian dominant has a major 3rd. Type it.',
      answer: { kind: 'note', value: 'D#', spelling: 'exact' },
      input: 'keypad',
      explain: 'A major third above {n:B} is {n:D#}: {n:B} {n:C} {n:D#} {n:E} {n:F#} {n:G} {n:A}, the notes of {n:E} harmonic minor from {n:B}.',
      fact: 'beyond-phrygian-dominant-formula',
    },
    {
      type: 'listen-choice',
      prompt: 'Over a low {n:E}: Phrygian or Phrygian dominant?',
      sound: { kind: 'tab', notes: overDrone(OPEN_E, E3, 'phrygian-dominant'), tempo: 110 },
      options: [{ text: 'Phrygian dominant', correct: true }, { text: 'Phrygian' }],
      shuffle: false,
      explain: 'The 3rd note was {n:G#}, a major 3rd above {n:E}, after the half step to {n:F}: Phrygian dominant. Plain Phrygian has {n:G}.',
    },
    {
      type: 'choice',
      prompt: 'Phrygian dominant is a mode of which scale?',
      options: [
        { text: 'Harmonic minor', correct: true },
        { text: 'Melodic minor', why: 'Mode 5 of melodic minor has a natural 2nd: {d:1} {d:2} {d:3} {d:4} {d:5} {d:b6} {d:b7}.' },
        { text: 'Major', why: 'Mode 3 of major is plain Phrygian, with a minor 3rd.' },
      ],
      explain: 'Start {n:A} harmonic minor on its 5th note, {n:E}, and you get {n:E} Phrygian dominant.',
      fact: 'beyond-phrygian-dominant-formula',
    },
    {
      type: 'true-false',
      statement: '{n:E} Phrygian dominant has the same notes as {n:A} harmonic minor.',
      answer: true,
      explain: 'Both are {n:A} {n:B} {n:C} {n:D} {n:E} {n:F} {n:G#}; Phrygian dominant just treats {n:E} as home.',
      fact: 'beyond-e-phrygian-dominant',
    },
    {
      type: 'choice',
      prompt: 'In {k:A minor}, which chord does {n:E} Phrygian dominant fit?',
      options: [
        { text: '{c:E7b9}', correct: true },
        { text: '{c:Em7}', why: '{c:Em7} has {n:G}; the scale has {n:G#}.' },
        { text: '{c:Emaj7}', why: '{c:Emaj7} needs {n:D#}; the scale has {n:D}, a flat 7th.' },
      ],
      explain: '{c:E7b9} is {n:E} {n:G#} {n:B} {n:D} {n:F}: the dominant of {k:A minor} with its flat 9, all inside the scale.',
      fact: 'beyond-phrygian-dominant-use',
    },
    { generate: 'scale-notes', params: { scales: ['phrygian-dominant', 'harmonic-minor'], tonics: ['E', 'A', 'B', 'D'], form: 'odd-one-out' } },
    { generate: 'scale-ear', params: { scales: ['phrygian', 'phrygian-dominant', 'harmonic-minor'] } },
  ],
  facts: [
    {
      id: 'beyond-phrygian-dominant-formula',
      front: 'What is Phrygian dominant, and where does it come from?',
      back: '{d:1} {d:b2} {d:3} {d:4} {d:5} {d:b6} {d:b7}: mode 5 of harmonic minor.',
    },
    {
      id: 'beyond-e-phrygian-dominant',
      front: 'Spell {n:E} Phrygian dominant.',
      back: '{n:E} {n:F} {n:G#} {n:A} {n:B} {n:C} {n:D}: the notes of {n:A} harmonic minor, centred on {n:E}.',
      ask: {
        type: 'order',
        prompt: 'Spell {n:E} Phrygian dominant, from {n:E}.',
        tiles: ['{n:E}', '{n:F}', '{n:G#}', '{n:A}', '{n:B}', '{n:C}', '{n:D}'],
        distractors: ['{n:G}'],
        explain: 'Half step, then a wide step to the major 3rd: {n:E} {n:F} {n:G#} {n:A} {n:B} {n:C} {n:D}.',
      },
    },
    {
      id: 'beyond-phrygian-dominant-use',
      front: 'Where do you hear Phrygian dominant?',
      back: 'Over the dominant of a minor key, such as {c:E7b9} in {k:A minor}, and all through flamenco and much metal guitar.',
    },
  ],
};

const bebopScales: Lesson = {
  id: 'bebop-scales',
  title: 'Bebop scales',
  teaches: 'Bebop scales add one chromatic passing note so that eighth-note runs keep chord tones on the beats.',
  minutes: 3,
  skill: `theory:${U}:bebop-scales`,
  steps: [
    {
      type: 'card',
      title: 'Eight notes to the bar',
      body: 'Add one {t:chromatic} passing note, {n:F#}, to {n:G} Mixolydian and you get the {t:bebop-scale|bebop dominant scale}: {n:G} {n:A} {n:B} {n:C} {n:D} {n:E} {n:F} {n:F#}. Run it down from {n:G} in eighth notes: {n:G}, {n:F}, {n:D} and {n:B} fall on beats 1 to 4, all tones of {c:G7}.',
      figure: { kind: 'tab', notes: BEBOP_RUN, tempo: 100, caption: 'Beats 1 to 4: {n:G} {n:F} {n:D} {n:B}. Then {n:G} again on the next beat 1.' },
    },
    {
      type: 'card',
      title: 'Hear the run',
      body: 'Listen for the chord tones landing on the beat. Without the {n:F#}, the same run puts {n:E}, {n:C} and {n:A} on beats 2, 3 and 4: the chord tones slip off the beat.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: BEBOP_RUN, tempo: 100 }, label: 'Hear {n:G} bebop dominant' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete {n:G} bebop dominant.',
      text: '{n:G} {n:A} {n:B} {n:C} {n:D} {n:E} {n:F} ___',
      blanks: ['{n:F#}'],
      bank: ['{n:G#}', '{n:C#}'],
      explain: '{n:G} Mixolydian plus its major 7th, {n:F#}: the passing note between {n:F} and {n:G}.',
      fact: 'beyond-bebop-dominant',
    },
    {
      type: 'choice',
      prompt: 'Run {n:G} bebop dominant down from {n:G} on beat 1. Which note lands on beat 3?',
      options: [
        { text: '{n:D}', correct: true },
        { text: '{n:E}', why: '{n:E} falls on the "and" of beat 2, between {n:F} and {n:D}.' },
        { text: '{n:C}', why: '{n:C} falls on the "and" of beat 3, just after {n:D}.' },
        { text: '{n:F}', why: '{n:F} lands on beat 2.' },
      ],
      explain: '{n:G} (1) {n:F#} {n:F} (2) {n:E} {n:D} (3) {n:C} {n:B} (4) {n:A}: the chord tones of {c:G7} take the beats.',
      fact: 'beyond-bebop-why',
    },
    {
      type: 'card',
      title: 'Bebop major',
      body: 'The **bebop major** scale adds {n:G#}, the {d:#5}, to {n:C} major: {n:C} {n:D} {n:E} {n:F} {n:G} {n:G#} {n:A} {n:B}. Run down from {n:C} on the beat and {n:C}, {n:A}, {n:G} and {n:E} take the beats: the notes of {c:C6}.',
      figure: {
        kind: 'keyboard',
        keys: [{ note: 'C4', role: 'root' }, 'D4', 'E4', 'F4', 'G4', { note: 'G#4', role: 'target' }, 'A4', 'B4'],
        from: 'C4',
        to: 'C5',
        caption: '{n:C} bebop major: the major scale plus {n:G#}.',
      },
    },
    {
      type: 'choice',
      prompt: 'Which note does bebop major add to {n:C} major?',
      options: [
        { text: '{n:G#}', correct: true },
        { text: '{n:Bb}', why: 'Adding {n:Bb} to {n:C} major gives {n:C} bebop dominant, not bebop major.' },
        { text: '{n:F#}', why: '{n:F#} would be a raised 4th, the colour of Lydian.' },
        { text: '{n:Eb}', why: '{n:Eb} would be a flat 3rd, a minor colour.' },
      ],
      explain: 'Bebop major is the major scale plus the {d:#5}: {n:G#}, between {n:G} and {n:A}.',
      fact: 'beyond-bebop-major',
    },
    {
      type: 'play-phrase',
      prompt: 'Play {n:G} bebop dominant down from {n:G} on string 1, fret 3, in even eighth notes.',
      notes: BEBOP_RUN,
      octave: 'exact',
      tempo: 80,
      explain: 'Frets 3 2 1 0 on string 1, 3 1 0 on string 2, then 2 and 0 on string 3: {n:G} {n:F#} {n:F} {n:E} {n:D} {n:C} {n:B} {n:A} {n:G}.',
      alternative: {
        type: 'order',
        prompt: 'Put {n:G} bebop dominant in order, falling from {n:G}.',
        tiles: ['{n:G}', '{n:F#}', '{n:F}', '{n:E}', '{n:D}', '{n:C}', '{n:B}', '{n:A}'],
        explain: 'Down from {n:G}: {n:G} {n:F#} {n:F} {n:E} {n:D} {n:C} {n:B} {n:A}, then {n:G} on the next beat 1.',
      },
    },
    {
      type: 'true-false',
      statement: 'Running down from {n:G} on beat 1, the passing note {n:F#} lands on a beat.',
      answer: false,
      explain: '{n:F#} falls on the "and" of beat 1, between {n:G} and {n:F}. Started from a chord tone on the beat, the passing note falls off the beat, so chord tones keep the beats.',
      fact: 'beyond-bebop-why',
    },
    { generate: 'scale-notes', params: { scales: ['mixolydian', 'major'], tonics: ['G', 'C', 'F', 'D'], form: 'order' } },
  ],
  facts: [
    {
      id: 'beyond-bebop-why',
      front: 'Why do bebop scales add a note?',
      back: 'One chromatic passing note makes eight notes, so an eighth-note run that starts on a chord tone on the beat keeps chord tones on the beats.',
    },
    {
      id: 'beyond-bebop-dominant',
      front: 'Spell {n:G} bebop dominant.',
      back: '{n:G} {n:A} {n:B} {n:C} {n:D} {n:E} {n:F} {n:F#}: Mixolydian plus the major 7th.',
      ask: {
        type: 'order',
        prompt: 'Spell {n:G} bebop dominant, from {n:G}.',
        tiles: ['{n:G}', '{n:A}', '{n:B}', '{n:C}', '{n:D}', '{n:E}', '{n:F}', '{n:F#}'],
        explain: '{n:G} Mixolydian with {n:F#} added between {n:F} and {n:G}.',
      },
    },
    {
      id: 'beyond-bebop-major',
      front: 'Spell {n:C} bebop major.',
      back: '{n:C} {n:D} {n:E} {n:F} {n:G} {n:G#} {n:A} {n:B}: the major scale plus {d:#5}.',
    },
  ],
};

const exoticScales: Lesson = {
  id: 'exotic-scales',
  title: 'Exotic scales',
  teaches: 'A few scales from outside the major-minor system give instantly recognisable colours on guitar.',
  minutes: 3,
  skill: `theory:${U}:exotic-scales`,
  steps: [
    {
      type: 'card',
      title: 'Harmonic minor, sharpened',
      body: 'Hungarian minor is {d:1} {d:2} {d:b3} {d:#4} {d:5} {d:b6} {d:7}: harmonic minor with a raised 4th. In {n:A}: {n:A} {n:B} {n:C} {n:D#} {n:E} {n:F} {n:G#}. Two {t:augmented-second|augmented seconds}, {n:C} to {n:D#} and {n:F} to {n:G#}, give it its dark, dramatic colour.',
      figure: {
        kind: 'fretboard',
        frets: [4, 8],
        derive: { scale: 'hungarian-minor', tonic: 'A' },
        dots: [
          { string: 5, fret: 6, note: 'D#', role: 'target' },
          { string: 3, fret: 8, note: 'D#', role: 'target' },
          { string: 2, fret: 4, note: 'D#', role: 'target' },
        ],
        caption: '{n:A} Hungarian minor around fifth position. Marked: the raised 4th, {n:D#}.',
      },
    },
    {
      type: 'card',
      title: 'Five-note Japanese scales',
      body: 'Hirajoshi uses five notes, {d:1} {d:2} {d:b3} {d:5} {d:b6}: in {n:A}, {n:A} {n:B} {n:C} {n:E} {n:F}. The In scale is another, {d:1} {d:b2} {d:4} {d:5} {d:b6}. Half steps with wide gaps between them make both sound spare and haunting.',
      figure: {
        kind: 'fretboard',
        frets: [4, 8],
        derive: { scale: 'hirajoshi', tonic: 'A' },
        dots: [
          { string: 6, fret: 8, note: 'C', role: 'target' },
          { string: 5, fret: 8, note: 'F', role: 'target' },
          { string: 3, fret: 5, note: 'C', role: 'target' },
          { string: 2, fret: 6, note: 'F', role: 'target' },
          { string: 1, fret: 8, note: 'C', role: 'target' },
        ],
        caption: '{n:A} hirajoshi. Marked: {n:C} and {n:F}, each a half step above a scale note.',
      },
    },
    {
      type: 'listen-choice',
      prompt: 'Over a low {n:A}: Hungarian minor or harmonic minor?',
      sound: { kind: 'tab', notes: overDrone(OPEN_A, A3, 'hungarian-minor'), tempo: 110 },
      options: [{ text: 'Hungarian minor', correct: true }, { text: 'Harmonic minor' }],
      shuffle: false,
      explain: 'The 4th note was {n:D#}, a raised 4th, after a wide step up from {n:C}: Hungarian minor. Harmonic minor has {n:D}.',
    },
    {
      type: 'choice',
      prompt: 'How many notes does hirajoshi have?',
      options: [{ text: '5', correct: true }, { text: '6' }, { text: '7', why: 'Seven is the size of Hungarian minor and double harmonic.' }, { text: '8' }],
      shuffle: false,
      explain: 'Five: {d:1} {d:2} {d:b3} {d:5} {d:b6}. It is a pentatonic scale, like the In scale.',
      fact: 'beyond-japanese-pentatonics',
    },
    {
      type: 'card',
      title: 'Double harmonic',
      body: 'Double harmonic is {d:1} {d:b2} {d:3} {d:4} {d:5} {d:b6} {d:7}, with an augmented second in each half: {d:b2} to {d:3} and {d:b6} to {d:7}. In {n:E}: {n:E} {n:F} {n:G#} {n:A} {n:B} {n:C} {n:D#}.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: overDrone(OPEN_E, E3, 'double-harmonic'), tempo: 110 }, label: 'Hear {n:E} double harmonic' },
    },
    {
      type: 'type-answer',
      prompt: 'In {n:E} double harmonic, which note is an augmented second above {n:F}? Type it.',
      answer: { kind: 'note', value: 'G#', spelling: 'exact' },
      input: 'keypad',
      explain: 'An augmented second spans three half steps on neighbouring letters: {n:F} to {n:G#}. Then {n:A}, {n:B}, {n:C} and another one, {n:C} to {n:D#}.',
      fact: 'beyond-double-harmonic',
    },
    {
      type: 'order',
      prompt: 'Spell {n:E} double harmonic, from {n:E}.',
      tiles: ['{n:E}', '{n:F}', '{n:G#}', '{n:A}', '{n:B}', '{n:C}', '{n:D#}'],
      distractors: ['{n:G}', '{n:D}'],
      explain: '{n:E} {n:F} {n:G#} {n:A} {n:B} {n:C} {n:D#}: a half step and an augmented second in each half.',
      fact: 'beyond-double-harmonic',
    },
    {
      type: 'true-false',
      statement: 'Hungarian minor is harmonic minor with a raised 4th.',
      answer: true,
      explain: '{n:A} harmonic minor is {n:A} {n:B} {n:C} {n:D} {n:E} {n:F} {n:G#}; raise {n:D} to {n:D#} and you have {n:A} Hungarian minor.',
      fact: 'beyond-hungarian-minor',
    },
    {
      type: 'choice',
      prompt: 'Which scale is {n:A} {n:Bb} {n:D} {n:E} {n:F}?',
      options: [
        { text: '{n:A} In', correct: true },
        { text: '{n:A} hirajoshi', why: 'Hirajoshi has {n:B} and {n:C}: a whole step, then a half step, above {n:A}.' },
        { text: '{n:A} minor pentatonic', why: 'Minor pentatonic is {n:A} {n:C} {n:D} {n:E} {n:G}.' },
      ],
      explain: '{d:1} {d:b2} {d:4} {d:5} {d:b6}: the In scale, with half steps from {n:A} to {n:Bb} and from {n:E} to {n:F}.',
      fact: 'beyond-japanese-pentatonics',
    },
    { generate: 'scale-notes', params: { scales: ['hungarian-minor', 'double-harmonic', 'hirajoshi', 'in'], tonics: ['A', 'E', 'D'], form: 'odd-one-out' } },
    { generate: 'scale-ear', params: { scales: ['harmonic-minor', 'hungarian-minor', 'hirajoshi', 'double-harmonic'] } },
  ],
  facts: [
    {
      id: 'beyond-hungarian-minor',
      front: 'What is Hungarian minor?',
      back: '{d:1} {d:2} {d:b3} {d:#4} {d:5} {d:b6} {d:7}: harmonic minor with a raised 4th. In {n:A}: {n:A} {n:B} {n:C} {n:D#} {n:E} {n:F} {n:G#}.',
    },
    {
      id: 'beyond-double-harmonic',
      front: 'What is the double harmonic scale?',
      back: '{d:1} {d:b2} {d:3} {d:4} {d:5} {d:b6} {d:7}, with two augmented seconds: {d:b2} to {d:3} and {d:b6} to {d:7}.',
    },
    {
      id: 'beyond-japanese-pentatonics',
      front: 'Name two Japanese pentatonic scales and their degrees.',
      back: 'Hirajoshi, {d:1} {d:2} {d:b3} {d:5} {d:b6}, and In, {d:1} {d:b2} {d:4} {d:5} {d:b6}.',
    },
  ],
};

const pentatonicSuperimposition: Lesson = {
  id: 'pentatonic-superimposition',
  title: 'Pentatonics on other roots',
  teaches: 'Playing a pentatonic on another root than the chord adds chosen colour tones while keeping familiar shapes.',
  minutes: 4,
  skill: `theory:${U}:pentatonic-superimposition`,
  steps: [
    {
      type: 'card',
      title: 'Same box, new colours',
      body: 'Over {c:Am7}, play box 1 of {n:B} minor pentatonic at fret 7. Its notes, {n:B} {n:D} {n:E} {n:F#} {n:A}, are the 9th, 11th, 5th, 6th and root of {n:A}. That {n:F#} is the Dorian 6th: a shape you know, a colour you choose. This is called {t:superimposition}.',
      figure: {
        kind: 'fretboard',
        frets: [7, 10],
        root: 'A',
        labels: 'degree',
        dots: [
          { string: 6, fret: 7, note: 'B', degree: '9' },
          { string: 6, fret: 10, note: 'D', degree: '11' },
          { string: 5, fret: 7, note: 'E', degree: '5' },
          { string: 5, fret: 9, note: 'F#', degree: '6' },
          { string: 4, fret: 7, note: 'A', degree: '1' },
          { string: 4, fret: 9, note: 'B', degree: '9' },
          { string: 3, fret: 7, note: 'D', degree: '11' },
          { string: 3, fret: 9, note: 'E', degree: '5' },
          { string: 2, fret: 7, note: 'F#', degree: '6' },
          { string: 2, fret: 10, note: 'A', degree: '1' },
          { string: 1, fret: 7, note: 'B', degree: '9' },
          { string: 1, fret: 10, note: 'D', degree: '11' },
        ],
        caption: '{n:B} minor pentatonic, box 1, counted from {n:A}: what it gives over {c:Am7}.',
      },
    },
    {
      type: 'card',
      title: 'Hear it over a low A',
      body: 'The low {n:A} stands in for the {c:Am7} chord. The line starts a step above its root, and the {n:F#} brings the brighter Dorian colour.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: overDrone(OPEN_A, B3, 'minor-pentatonic'), tempo: 110 }, label: 'Hear {n:B} pentatonic over {n:A}' },
    },
    {
      type: 'choice',
      prompt: 'Over {c:Cmaj7}, which pentatonic gives a Lydian colour?',
      options: [
        { text: '{n:D} major pentatonic', correct: true },
        { text: '{n:G} major pentatonic', why: '{n:G} {n:A} {n:B} {n:D} {n:E} has no {n:F#}: it only gives the plain Ionian colours of {n:C}.' },
        { text: '{n:F} major pentatonic', why: 'It holds {n:F}, the avoid note over {c:Cmaj7}, not the Lydian {n:F#}.' },
      ],
      explain: '{n:D} major pentatonic is {n:D} {n:E} {n:F#} {n:A} {n:B}: over {n:C} the 9th, 3rd, {d:#11}, 13th and 7th. The {n:F#} is the Lydian {d:#4}.',
      fact: 'beyond-d-major-over-cmaj7',
    },
    {
      type: 'type-answer',
      prompt: 'Over {c:Am7}, which degree is {n:F#} in {n:B} minor pentatonic? Type it.',
      answer: { kind: 'degree', value: '6', spelling: 'exact', accept: ['13'] },
      input: 'keyboard',
      explain: '{n:F#} is a major sixth above {n:A}: the 6th (or 13th), the note that makes it Dorian.',
      fact: 'beyond-b-minor-over-am7',
    },
    {
      type: 'card',
      title: 'Over an altered dominant',
      body: 'Over {c:G7alt}, play {n:Bb} minor pentatonic: {n:Bb} {n:Db} {n:Eb} {n:F} {n:Ab}. Against {n:G} those are the {d:#9}, {d:b5}, {d:b13}, {d:b7} and {d:b9}: four altered tensions and the 7th, in a box you already know.',
      figure: {
        kind: 'fretboard',
        frets: [6, 9],
        root: 'G',
        labels: 'degree',
        dots: [
          { string: 6, fret: 6, note: 'Bb', degree: '#9' },
          { string: 6, fret: 9, note: 'Db', degree: 'b5' },
          { string: 5, fret: 6, note: 'Eb', degree: 'b13' },
          { string: 5, fret: 8, note: 'F', degree: 'b7' },
          { string: 4, fret: 6, note: 'Ab', degree: 'b9' },
          { string: 4, fret: 8, note: 'Bb', degree: '#9' },
          { string: 3, fret: 6, note: 'Db', degree: 'b5' },
          { string: 3, fret: 8, note: 'Eb', degree: 'b13' },
          { string: 2, fret: 6, note: 'F', degree: 'b7' },
          { string: 2, fret: 9, note: 'Ab', degree: 'b9' },
          { string: 1, fret: 6, note: 'Bb', degree: '#9' },
          { string: 1, fret: 9, note: 'Db', degree: 'b5' },
        ],
        caption: '{n:Bb} minor pentatonic, box 1, counted from {n:G}: what it gives over {c:G7alt}.',
      },
    },
    {
      type: 'listen-choice',
      prompt: 'Over a low {n:G}, standing in for {c:G7alt}: which pentatonic is this?',
      sound: { kind: 'tab', notes: overDrone(LOW_G, BB3, 'minor-pentatonic'), tempo: 110 },
      options: [{ text: '{n:Bb} minor pentatonic', correct: true }, { text: '{n:G} minor pentatonic' }],
      shuffle: false,
      explain: 'The line never touched {n:G}: it started on {n:Bb} and rubbed against the low {n:G} with altered tensions. {n:G} minor pentatonic starts and ends on {n:G}.',
    },
    {
      type: 'listen-choice',
      prompt: 'And this one, over the same low {n:G}?',
      sound: { kind: 'tab', notes: overDrone(LOW_G, G3, 'minor-pentatonic'), tempo: 110 },
      options: [{ text: '{n:Bb} minor pentatonic' }, { text: '{n:G} minor pentatonic', correct: true }],
      shuffle: false,
      explain: 'It started and ended on {n:G}, the root: {n:G} minor pentatonic, the familiar bluesy sound.',
    },
    {
      type: 'true-false',
      statement: 'Over {c:Am7}, {n:B} minor pentatonic gives a Dorian colour.',
      answer: true,
      explain: 'It brings {n:F#}, the major 6th of {n:A}: the note that tells Dorian from natural minor.',
      fact: 'beyond-b-minor-over-am7',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each chord with the pentatonic that colours it.',
      pairs: [
        { left: '{c:Am7}, Dorian', right: '{n:B} minor pentatonic' },
        { left: '{c:Cmaj7}, Lydian', right: '{n:D} major pentatonic' },
        { left: '{c:G7alt}, altered', right: '{n:Bb} minor pentatonic' },
      ],
      explain: 'Each pentatonic sits on another root than the chord: a step above {n:A}, a step above {n:C}, a minor third above {n:G}.',
      fact: 'beyond-bb-minor-over-g7alt',
    },
    {
      type: 'choice',
      prompt: 'Over {c:G7alt}, which tension is the {n:Ab} of {n:Bb} minor pentatonic?',
      options: [
        { text: '{d:b9}', correct: true },
        { text: '{d:#9}', why: 'The {d:#9} of {n:G} is {n:Bb}, the root of the pentatonic.' },
        { text: '{d:b13}', why: 'The {d:b13} of {n:G} is {n:Eb}.' },
        { text: '{d:#11}', why: 'The {d:#11} of {n:G} sounds as {n:Db}.' },
      ],
      explain: '{n:Ab} is a half step above {n:G}: the flat 9.',
      fact: 'beyond-bb-minor-over-g7alt',
    },
  ],
  facts: [
    {
      id: 'beyond-b-minor-over-am7',
      front: 'Over {c:Am7}, what does {n:B} minor pentatonic give you?',
      back: '{n:B} {n:D} {n:E} {n:F#} {n:A}: the 9th, 11th, 5th, 6th and root of {n:A}. A Dorian colour.',
    },
    {
      id: 'beyond-d-major-over-cmaj7',
      front: 'Over {c:Cmaj7}, which pentatonic gives a Lydian colour?',
      back: '{n:D} major pentatonic, {n:D} {n:E} {n:F#} {n:A} {n:B}: the 9th, 3rd, {d:#11}, 13th and 7th of {n:C}.',
    },
    {
      id: 'beyond-bb-minor-over-g7alt',
      front: 'Over {c:G7alt}, what does {n:Bb} minor pentatonic give you?',
      back: '{n:Bb} {n:Db} {n:Eb} {n:F} {n:Ab}: the {d:#9}, {d:b5}, {d:b13}, {d:b7} and {d:b9} of {n:G}.',
    },
  ],
};

/** Unit 37 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'Scales beyond the basics',
  theme: 'scales',
  description: 'Chord-scale thinking, the modes of melodic and harmonic minor, bebop scales, exotic scales and pentatonic superimposition.',
  lessons: [chordScales, melodicMinorModes, phrygianDominant, bebopScales, exoticScales, pentatonicSuperimposition],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      {
        type: 'match-pairs',
        prompt: 'Match each chord of {k:C major} with its scale.',
        pairs: [
          { left: '{c:Dm7}', right: '{n:D} Dorian' },
          { left: '{c:G7}', right: '{n:G} Mixolydian' },
          { left: '{c:Bm7b5}', right: '{n:B} Locrian' },
          { left: '{c:Cmaj7}', right: '{n:C} Ionian' },
        ],
        explain: 'Each diatonic chord takes the mode that starts on its root.',
      },
      {
        type: 'choice',
        prompt: 'Which note is the avoid note over {c:Cmaj7}?',
        options: [
          { text: '{n:F}', correct: true },
          { text: '{n:D}', why: 'The 9th sits a whole step above the root: a good colour.' },
          { text: '{n:A}', why: 'The 13th sits a whole step above the 5th: a good colour.' },
        ],
        explain: '{n:F} is a half step above {n:E}, the 3rd: held, it clashes.',
      },
      {
        type: 'true-false',
        statement: 'An avoid note is fine as a passing note.',
        answer: true,
        explain: 'It only clashes when held against the chord. Moving through it, {n:F} to {n:E} over {c:Cmaj7}, sounds smooth.',
      },
      {
        type: 'match-pairs',
        prompt: 'Match each chord with the mode of melodic minor that fits it.',
        pairs: [
          { left: '{c:D7#11}', right: 'Lydian dominant' },
          { left: '{c:Em7b5}', right: 'Locrian natural 2' },
          { left: '{c:G7alt}', right: 'Altered scale' },
          { left: '{c:Ebmaj7#5}', right: 'Lydian augmented' },
        ],
        explain: 'Modes 4, 6, 7 and 3 of melodic minor.',
      },
      {
        type: 'choice',
        prompt: '{n:G} Lydian dominant has the same notes as which melodic minor scale?',
        options: [
          { text: '{n:D} melodic minor', correct: true },
          { text: '{n:G} melodic minor', why: '{n:G} melodic minor has {n:Bb}, a minor 3rd above {n:G}.' },
          { text: '{n:C} melodic minor', why: '{n:C} melodic minor has {n:Eb}; Lydian dominant from {n:G} has {n:E}.' },
        ],
        explain: '{n:G} is the 4th note of {n:D} melodic minor, and Lydian dominant is mode 4.',
      },
      {
        type: 'type-answer',
        prompt: 'Type the raised 4th of {n:G} Lydian dominant.',
        answer: { kind: 'note', value: 'C#', spelling: 'exact' },
        input: 'keypad',
        explain: '{n:G} {n:A} {n:B} {n:C#} {n:D} {n:E} {n:F}: the 4th, {n:C}, is raised to {n:C#}.',
      },
      {
        type: 'choice',
        prompt: 'Phrygian dominant is mode 5 of which scale?',
        options: [
          { text: 'Harmonic minor', correct: true },
          { text: 'Melodic minor', why: 'Mode 5 of melodic minor is Mixolydian with a flat 6th.' },
          { text: 'Major', why: 'Mode 5 of major is Mixolydian.' },
        ],
        explain: 'Start harmonic minor on its 5th note: {n:E} {n:F} {n:G#} {n:A} {n:B} {n:C} {n:D} from {n:A} harmonic minor.',
      },
      {
        type: 'type-answer',
        prompt: 'Type the 3rd of {n:B} Phrygian dominant.',
        answer: { kind: 'note', value: 'D#', spelling: 'exact' },
        input: 'keypad',
        explain: 'Phrygian dominant has a major 3rd: {n:B} to {n:D#}.',
      },
      {
        type: 'choice',
        prompt: 'In {k:A minor}, which chord does Phrygian dominant fit?',
        options: [
          { text: '{c:E7b9}', correct: true },
          { text: '{c:Em7}', why: 'The scale has {n:G#}, not {n:G}.' },
          { text: '{c:Am7}', why: '{c:Am7} has {n:G}; the scale has {n:G#}. Phrygian dominant is for the dominant, not the tonic chord.' },
        ],
        explain: '{c:E7b9}, the dominant of {k:A minor} with its flat 9: every note is in {n:E} Phrygian dominant.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Complete {n:G} bebop dominant.',
        text: '{n:G} {n:A} {n:B} {n:C} {n:D} {n:E} {n:F} ___',
        blanks: ['{n:F#}'],
        bank: ['{n:G#}', '{n:E}'],
        explain: 'Mixolydian plus the major 7th, {n:F#}.',
      },
      {
        type: 'choice',
        prompt: 'Which note does bebop major add to {n:C} major?',
        options: [{ text: '{n:G#}', correct: true }, { text: '{n:Bb}' }, { text: '{n:C#}' }, { text: '{n:F#}' }],
        explain: 'The {d:#5}, {n:G#}: {n:C} {n:D} {n:E} {n:F} {n:G} {n:G#} {n:A} {n:B}.',
      },
      {
        type: 'choice',
        prompt: 'Why does a bebop scale add a chromatic passing note?',
        options: [
          { text: 'To keep chord tones on the beats in eighths', correct: true },
          { text: 'To make the scale sound more minor', why: 'The added note is chromatic, between two scale notes; it changes nothing about major or minor.' },
          { text: 'To add an avoid note on purpose', why: 'The passing note falls off the beat and moves straight on, so it is never held against the chord.' },
        ],
        explain: 'Eight notes in a bar of eighths: start on a chord tone on the beat and the chord tones keep landing on the beats.',
      },
      {
        type: 'true-false',
        statement: 'Hungarian minor is harmonic minor with a raised 4th.',
        answer: true,
        explain: '{n:A} Hungarian minor: {n:A} {n:B} {n:C} {n:D#} {n:E} {n:F} {n:G#}.',
      },
      {
        type: 'choice',
        prompt: 'Which scale has two augmented seconds, {d:b2} to {d:3} and {d:b6} to {d:7}?',
        options: [
          { text: 'Double harmonic', correct: true },
          { text: 'Hirajoshi', why: 'Hirajoshi has five notes: {d:1} {d:2} {d:b3} {d:5} {d:b6}.' },
          { text: 'Harmonic minor', why: 'Harmonic minor has one augmented second, {d:b6} to {d:7}.' },
        ],
        explain: 'Double harmonic, {d:1} {d:b2} {d:3} {d:4} {d:5} {d:b6} {d:7}: an augmented second in each half.',
      },
      {
        type: 'choice',
        prompt: 'Which scale is {n:A} {n:B} {n:C} {n:E} {n:F}?',
        options: [
          { text: '{n:A} hirajoshi', correct: true },
          { text: '{n:A} In', why: 'The In scale has {n:Bb} and {n:D}: {d:1} {d:b2} {d:4} {d:5} {d:b6}.' },
          { text: '{n:A} minor pentatonic', why: 'Minor pentatonic is {n:A} {n:C} {n:D} {n:E} {n:G}.' },
        ],
        explain: '{d:1} {d:2} {d:b3} {d:5} {d:b6}: hirajoshi, a five-note Japanese scale.',
      },
      {
        type: 'choice',
        prompt: 'Over {c:Cmaj7}, which pentatonic gives a Lydian colour?',
        options: [
          { text: '{n:D} major pentatonic', correct: true },
          { text: '{n:G} major pentatonic', why: 'It has no {n:F#}.' },
          { text: '{n:C} minor pentatonic', why: 'It has {n:Eb} and {n:Bb}, which clash with {c:Cmaj7}.' },
        ],
        explain: '{n:D} {n:E} {n:F#} {n:A} {n:B}: the {n:F#} is the Lydian {d:#11}.',
      },
      {
        type: 'type-answer',
        prompt: 'Over {c:Am7}, which degree is {n:F#} in {n:B} minor pentatonic? Type it.',
        answer: { kind: 'degree', value: '6', spelling: 'exact', accept: ['13'] },
        input: 'keyboard',
        explain: '{n:F#} is a major sixth above {n:A}: the Dorian 6th.',
      },
      { generate: 'scale-ear', params: { scales: ['lydian-dominant', 'phrygian-dominant', 'hungarian-minor'] } },
    ],
  },
};

export default unit;
