/**
 * Theory Path, unit 26: The modes. Written from the syllabus entries in
 * `src/content/plan/theory-path.json` (unit `modes`), one lesson per entry, in order: each lesson
 * opens with the "on the guitar" picture, asks the planned exercises, ends with the planned drills,
 * and turns every planned fact into a review card.
 *
 * Every scale, characteristic note, parent scale, vamp and fret quoted here is cross-checked
 * against `@/core/theory` and `@/core/guitar` in `modes.test.ts`.
 *
 * A lesson `Sound` cannot hold one note under a melody, so "over a drone" is played the way a
 * guitarist practises it alone: the drone note (an open string) is struck again before every note
 * of the scale. The scale lines themselves are computed here from the theory engine.
 */
import { scaleMidi } from '@/core/theory';
import { openStringMidi } from '@/core/guitar';
import type { Lesson, TabNote, Unit } from '@/lessons';

const U = 'modes';

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

/** One octave of a scale with the drone note struck before every note of it: 16 eighth notes. */
function overDrone(drone: Spot, tonic: number, scale: string): TabNote[] {
  return line(tonic, scale).flatMap((n) => [{ ...drone, duration: 'e' as const }, n]);
}

const OPEN_A: Spot = { string: 5, fret: 0 };
const OPEN_D: Spot = { string: 4, fret: 0 };
const OPEN_E: Spot = { string: 6, fret: 0 };
/** The low C a guitarist can let ring under C major: string 5, fret 3. */
const LOW_C: Spot = { string: 5, fret: 3 };
const A3 = 57;
const C4 = 60;
const D4 = 62;

/** The six modes asked by ear over an A drone, with the names a learner picks from. */
const MODE_OPTIONS = ['Ionian (major)', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Aeolian (natural minor)'];
function nameTheMode(scale: string, answer: string, explain: string, prompt = 'Over an {n:A} drone: which mode is this?') {
  return {
    type: 'listen-choice' as const,
    prompt,
    sound: { kind: 'tab' as const, notes: overDrone(OPEN_A, A3, scale), tempo: 110 },
    options: MODE_OPTIONS.map((text) => (text === answer ? { text, correct: true } : { text })),
    shuffle: false,
    explain,
  };
}

const modesAsRotations: Lesson = {
  id: 'modes-as-rotations',
  title: 'Same notes, new home',
  teaches: 'A mode is the scale you get by starting a scale on a different note and treating that note as home.',
  minutes: 3,
  skill: `theory:${U}:modes-as-rotations`,
  steps: [
    {
      type: 'card',
      title: 'Same notes, new home',
      body: 'Play the {n:C} major scale up string 5 from fret 3: C D E F G A B C. Now play the very same notes from {n:D} up to {n:D}, and hear {n:D} as home. No note changed, only home, yet it sounds new. That new scale is a {t:mode}: {n:D} Dorian.',
      figure: {
        kind: 'fretboard',
        frets: [3, 15],
        dots: [
          { string: 5, fret: 3, note: 'C', role: 'root' },
          { string: 5, fret: 5, note: 'D', role: 'target' },
          { string: 5, fret: 7, note: 'E' },
          { string: 5, fret: 8, note: 'F' },
          { string: 5, fret: 10, note: 'G' },
          { string: 5, fret: 12, note: 'A' },
          { string: 5, fret: 14, note: 'B' },
          { string: 5, fret: 15, note: 'C', role: 'root' },
        ],
        caption: '{n:C} major on string 5. Start on {n:C}: Ionian. Start on {n:D}: Dorian.',
      },
    },
    {
      type: 'card',
      title: 'Seven notes, seven modes',
      body: 'Start the major scale on each of its seven notes and you get seven modes: Ionian (from degree 1), Dorian (2), Phrygian (3), Lydian (4), Mixolydian (5), Aeolian (6) and Locrian (7). Ionian is the major scale itself.',
      figure: {
        kind: 'audio',
        sound: { kind: 'tab', notes: [...overDrone(LOW_C, C4, 'major'), ...overDrone(OPEN_D, D4, 'dorian')], tempo: 110 },
        label: 'Hear {n:C} Ionian, then {n:D} Dorian',
      },
      tip: 'The low note that keeps coming back in the audio, {n:C} and then {n:D}, is a {t:drone}: it tells your ear where home is.',
    },
    {
      type: 'order',
      prompt: 'Put these modes in order, starting from degree 1 of the major scale.',
      tiles: ['Ionian', 'Dorian', 'Phrygian', 'Lydian'],
      explain: 'Ionian starts on degree 1, Dorian on 2, Phrygian on 3 and Lydian on 4. Mixolydian, Aeolian and Locrian follow.',
      fact: 'modes-seven-names',
    },
    {
      type: 'choice',
      prompt: 'Which mode starts on degree 5 of the major scale?',
      options: [
        { text: 'Mixolydian', correct: true },
        { text: 'Lydian', why: 'Lydian starts on degree 4.' },
        { text: 'Aeolian', why: 'Aeolian starts on degree 6.' },
        { text: 'Dorian', why: 'Dorian starts on degree 2.' },
      ],
      explain: 'Ionian 1, Dorian 2, Phrygian 3, Lydian 4, Mixolydian 5, Aeolian 6, Locrian 7.',
      fact: 'modes-seven-names',
    },
    {
      type: 'card',
      title: 'Count from the start',
      body: 'To name a mode made of natural notes, find where it starts in {n:C} major. {n:E} is the 3rd note, so E F G A B C D E is {n:E} Phrygian. {n:A} is the 6th: {n:A} Aeolian, the natural minor scale you already know.',
      figure: {
        kind: 'fretboard',
        frets: [2, 14],
        dots: [
          { string: 4, fret: 2, note: 'E', role: 'root' },
          { string: 4, fret: 3, note: 'F', role: 'target' },
          { string: 4, fret: 5, note: 'G' },
          { string: 4, fret: 7, note: 'A' },
          { string: 4, fret: 9, note: 'B' },
          { string: 4, fret: 10, note: 'C' },
          { string: 4, fret: 12, note: 'D' },
          { string: 4, fret: 14, note: 'E', role: 'root' },
        ],
        caption: 'The natural notes from {n:E} to {n:E} on string 4: {n:E} Phrygian.',
      },
    },
    {
      type: 'choice',
      prompt: 'The natural notes from E to E make which mode?',
      options: [
        { text: '{n:E} Phrygian', correct: true },
        { text: '{n:E} Dorian', why: 'Dorian starts on degree 2 of a major scale. {n:E} is degree 3 of {n:C} major.' },
        { text: '{n:E} Aeolian', why: '{n:E} Aeolian has {n:F#}. The natural notes give {n:F}, a half step above {n:E}.' },
        { text: '{n:E} Lydian', why: 'Lydian starts on degree 4: from {n:F}, in {n:C} major.' },
      ],
      explain: '{n:E} is the 3rd note of {n:C} major, and the mode from degree 3 is Phrygian: E F G A B C D.',
    },
    {
      type: 'true-false',
      statement: '{n:D} Dorian uses exactly the same notes as {k:C major}.',
      answer: true,
      explain: 'A mode keeps every note of its scale and only moves home: {n:D} Dorian is D E F G A B C.',
      fact: 'modes-definition',
    },
    {
      type: 'choice',
      prompt: 'The natural notes from G to G make which mode?',
      options: [
        { text: '{n:G} Mixolydian', correct: true },
        { text: '{n:G} Ionian', why: '{n:G} Ionian is {k:G major}, with {n:F#}. The natural notes give {n:F}.' },
        { text: '{n:G} Lydian', why: 'Lydian starts on degree 4 of a major scale. {n:G} is degree 5 of {n:C} major.' },
        { text: '{n:G} Dorian', why: 'Dorian starts on degree 2: from {n:D}, in {n:C} major.' },
      ],
      explain: '{n:G} is the 5th note of {n:C} major, so G A B C D E F G is {n:G} Mixolydian.',
      fact: 'modes-white-key-examples',
    },
    { generate: 'scale-notes', params: { scales: ['dorian'], tonics: ['D'], form: 'order' } },
  ],
  facts: [
    {
      id: 'modes-definition',
      front: 'What is a mode?',
      back: 'A scale made by starting a scale on a different note and treating that note as home.',
    },
    {
      id: 'modes-seven-names',
      front: 'Name the seven modes of the major scale, from degree 1 to 7.',
      back: 'Ionian, Dorian, Phrygian, Lydian, Mixolydian, Aeolian, Locrian.',
      ask: {
        type: 'order',
        prompt: 'Put the seven modes in order, from degree 1 of the major scale.',
        tiles: ['Ionian', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Aeolian', 'Locrian'],
        explain: 'Degrees 1 to 7: Ionian, Dorian, Phrygian, Lydian, Mixolydian, Aeolian, Locrian.',
      },
    },
    {
      id: 'modes-white-key-examples',
      front: 'Which modes do the natural notes make from D to D, and from G to G?',
      back: '{n:D} to {n:D} is {n:D} Dorian; {n:G} to {n:G} is {n:G} Mixolydian.',
    },
  ],
};

const modesAgainstMajor: Lesson = {
  id: 'modes-against-major',
  title: 'Comparing each mode with major',
  teaches: 'Compared with major on the same tonic, each mode has its own changed notes, and they run from bright to dark.',
  minutes: 4,
  skill: `theory:${U}:modes-against-major`,
  steps: [
    {
      type: 'card',
      title: 'Measure against major',
      body: 'Set a mode beside the major scale on the **same** tonic and its colour shows. {n:A} major is {n:A} {n:B} {n:C#} {n:D} {n:E} {n:F#} {n:G#}. Each mode changes some of these notes. {n:A} Mixolydian, for one, has {n:G} in place of {n:G#}: a {d:b7}.',
      figure: {
        kind: 'fretboard',
        frets: [3, 8],
        root: 'A',
        labels: 'degree',
        dots: [
          { string: 6, fret: 5, note: 'A', degree: '1', role: 'root' },
          { string: 6, fret: 7, note: 'B', degree: '2' },
          { string: 5, fret: 4, note: 'C#', degree: '3' },
          { string: 5, fret: 5, note: 'D', degree: '4' },
          { string: 5, fret: 7, note: 'E', degree: '5' },
          { string: 4, fret: 4, note: 'F#', degree: '6' },
          { string: 4, fret: 6, note: 'G#', degree: '7' },
          { string: 4, fret: 7, note: 'A', degree: '1', role: 'root' },
        ],
        caption: '{n:A} major (Ionian), one octave up from string 6, fret 5.',
      },
    },
    {
      type: 'card',
      title: 'Bright to dark',
      body: 'Lydian {d:#4}. Ionian: no change. Mixolydian {d:b7}. Dorian {d:b3} {d:b7}. Aeolian {d:b3} {d:b6} {d:b7}. Phrygian {d:b2} {d:b3} {d:b6} {d:b7}. Locrian {d:b2} {d:b3} {d:b5} {d:b6} {d:b7}. Each step down the list lowers one more note, so it runs from brightest to darkest.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: [...line(A3, 'lydian'), ...line(A3, 'phrygian')], tempo: 100 }, label: 'Hear Lydian, then Phrygian' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each mode with how it differs from major.',
      pairs: [
        { left: 'Lydian', right: '{d:#4}' },
        { left: 'Mixolydian', right: '{d:b7}' },
        { left: 'Dorian', right: '{d:b3} {d:b7}' },
        { left: 'Phrygian', right: '{d:b2} {d:b3} {d:b6} {d:b7}' },
      ],
      explain: 'Measured against major on the same tonic: Lydian raises the 4th, Mixolydian lowers the 7th, Dorian the 3rd and 7th, Phrygian the 2nd, 3rd, 6th and 7th.',
      fact: 'modes-against-major',
    },
    {
      type: 'choice',
      prompt: 'Which mode is the natural minor scale?',
      options: [
        { text: 'Aeolian', correct: true },
        { text: 'Dorian', why: 'Dorian is minor too, but its 6th is raised: {d:6}, not {d:b6}.' },
        { text: 'Phrygian', why: 'Phrygian is minor with a flat 2nd as well.' },
        { text: 'Ionian', why: 'Ionian is the major scale.' },
      ],
      explain: 'Aeolian, the mode from degree 6, is {d:1} {d:2} {d:b3} {d:4} {d:5} {d:b6} {d:b7}: the natural minor scale.',
      fact: 'modes-ionian-aeolian',
    },
    {
      type: 'order',
      prompt: 'Put these modes in order, from brightest to darkest.',
      tiles: ['Lydian', 'Mixolydian', 'Dorian', 'Phrygian'],
      explain: 'The fewer notes a mode lowers, the brighter it sounds: Lydian raises one, Mixolydian lowers one, Dorian two, Phrygian four.',
      fact: 'modes-bright-to-dark',
    },
    {
      type: 'card',
      title: 'Spell a mode',
      body: 'To spell a mode, start from the major scale on its tonic and change the notes its formula names. {n:A} Mixolydian is {n:A} major with the 7th lowered: {n:G#} becomes {n:G}, giving {n:A} {n:B} {n:C#} {n:D} {n:E} {n:F#} {n:G}.',
      figure: {
        kind: 'fretboard',
        frets: [3, 8],
        root: 'A',
        labels: 'degree',
        dots: [
          { string: 6, fret: 5, note: 'A', degree: '1', role: 'root' },
          { string: 6, fret: 7, note: 'B', degree: '2' },
          { string: 5, fret: 4, note: 'C#', degree: '3' },
          { string: 5, fret: 5, note: 'D', degree: '4' },
          { string: 5, fret: 7, note: 'E', degree: '5' },
          { string: 4, fret: 4, note: 'F#', degree: '6' },
          { string: 4, fret: 5, note: 'G', degree: 'b7', role: 'target' },
          { string: 4, fret: 7, note: 'A', degree: '1', role: 'root' },
        ],
        caption: '{n:A} Mixolydian: the {n:G#} of {n:A} major drops a fret to {n:G}.',
      },
    },
    {
      type: 'type-answer',
      prompt: '{n:A} major has {n:G#} as its 7th. Type the 7th of {n:A} Mixolydian.',
      answer: { kind: 'note', value: 'G', spelling: 'exact' },
      input: 'keypad',
      explain: 'Mixolydian lowers the 7th: {n:G#} becomes {n:G}. {n:A} Mixolydian is {n:A} {n:B} {n:C#} {n:D} {n:E} {n:F#} {n:G}.',
      fact: 'modes-against-major',
    },
    {
      type: 'true-false',
      statement: 'Ionian is another name for the major scale.',
      answer: true,
      explain: 'Ionian is the mode from degree 1, so it is the major scale itself, with nothing changed.',
      fact: 'modes-ionian-aeolian',
    },
    { generate: 'scale-formula', params: { scales: ['major', 'mixolydian', 'dorian', 'lydian', 'minor', 'phrygian'] } },
    { generate: 'scale-notes', params: { scales: ['mixolydian', 'dorian', 'lydian'], tonics: ['A', 'D', 'G', 'E'], form: 'order' } },
  ],
  facts: [
    {
      id: 'modes-against-major',
      front: 'How does each mode differ from the major scale on the same tonic?',
      back: 'Lydian {d:#4}; Mixolydian {d:b7}; Dorian {d:b3} {d:b7}; Aeolian {d:b3} {d:b6} {d:b7}; Phrygian {d:b2} {d:b3} {d:b6} {d:b7}; Locrian {d:b2} {d:b3} {d:b5} {d:b6} {d:b7}.',
    },
    { id: 'modes-ionian-aeolian', front: 'Which modes are the major scale and the natural minor scale?', back: 'Ionian is the major scale; Aeolian is the natural minor.' },
    {
      id: 'modes-bright-to-dark',
      front: 'Order the seven modes from brightest to darkest.',
      back: 'Lydian, Ionian, Mixolydian, Dorian, Aeolian, Phrygian, Locrian.',
      ask: {
        type: 'order',
        prompt: 'Put the seven modes in order, from brightest to darkest.',
        tiles: ['Lydian', 'Ionian', 'Mixolydian', 'Dorian', 'Aeolian', 'Phrygian', 'Locrian'],
        explain: 'Each step down lowers one more note: Lydian, Ionian, Mixolydian, Dorian, Aeolian, Phrygian, Locrian.',
      },
    },
  ],
};

/** A Dorian in fifth position (frets 4 to 8), the raised 6th marked. */
const A_DORIAN_FIFTH: Lesson['steps'][number] & { type: 'card' } = {
  type: 'card',
  title: 'Minor with a brighter edge',
  body: 'Dorian is natural minor with one note raised: the **6th**. {n:A} natural minor has {n:F}; {n:A} Dorian has {n:F#}. Its formula is {d:1} {d:2} {d:b3} {d:4} {d:5} {d:6} {d:b7}: still minor, but brighter, a little hopeful.',
  figure: {
    kind: 'fretboard',
    frets: [4, 8],
    root: 'A',
    labels: 'degree',
    dots: [
      { string: 6, fret: 5, note: 'A', degree: '1', role: 'root' },
      { string: 6, fret: 7, note: 'B', degree: '2' },
      { string: 6, fret: 8, note: 'C', degree: 'b3' },
      { string: 5, fret: 5, note: 'D', degree: '4' },
      { string: 5, fret: 7, note: 'E', degree: '5' },
      { string: 4, fret: 4, note: 'F#', degree: '6', role: 'target' },
      { string: 4, fret: 5, note: 'G', degree: 'b7' },
      { string: 4, fret: 7, note: 'A', degree: '1', role: 'root' },
      { string: 3, fret: 4, note: 'B', degree: '2' },
      { string: 3, fret: 5, note: 'C', degree: 'b3' },
      { string: 3, fret: 7, note: 'D', degree: '4' },
      { string: 2, fret: 5, note: 'E', degree: '5' },
      { string: 2, fret: 7, note: 'F#', degree: '6', role: 'target' },
      { string: 2, fret: 8, note: 'G', degree: 'b7' },
      { string: 1, fret: 5, note: 'A', degree: '1', role: 'root' },
      { string: 1, fret: 7, note: 'B', degree: '2' },
      { string: 1, fret: 8, note: 'C', degree: 'b3' },
    ],
    caption: '{n:A} Dorian in fifth position: {n:F#} on strings 4 and 2.',
  },
};

const dorian: Lesson = {
  id: 'dorian',
  title: 'Dorian',
  teaches: 'Dorian is natural minor with a raised 6th: a minor sound with a brighter edge.',
  minutes: 3,
  skill: `theory:${U}:dorian`,
  steps: [
    A_DORIAN_FIFTH,
    {
      type: 'card',
      title: 'Its characteristic note',
      body: 'The raised 6th is Dorian\'s {t:characteristic-note}: the one that sets it apart from natural minor. You have met it before: it is the {n:F#} of the major {r:IV} chord, {c:D}, in {k:A minor}, now heard as part of a scale.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: overDrone(OPEN_A, A3, 'dorian'), tempo: 110 }, label: 'Hear {n:A} Dorian' },
    },
    {
      type: 'true-false',
      statement: 'Dorian is natural minor with a raised 6th.',
      answer: true,
      explain: 'Natural minor is {d:1} {d:2} {d:b3} {d:4} {d:5} {d:b6} {d:b7}. Raise the {d:b6} to {d:6} and you have Dorian.',
      fact: 'modes-dorian-formula',
    },
    {
      type: 'type-answer',
      prompt: 'Type the characteristic note of {n:E} Dorian.',
      answer: { kind: 'note', value: 'C#', spelling: 'exact' },
      input: 'keypad',
      explain: '{n:E} natural minor has {n:C}. Raise the 6th and {n:E} Dorian has {n:C#}: {n:E} {n:F#} {n:G} {n:A} {n:B} {n:C#} {n:D}.',
      fact: 'modes-dorian-note',
    },
    {
      type: 'card',
      title: 'The Dorian vamp',
      body: 'A {t:vamp} is a short chord pattern, often two chords, repeated over and over. Dorian loves the minor tonic and the major {r:IV}: {c:Am7} to {c:D} in {n:A} Dorian, {c:Dm} to {c:G} in {n:D} Dorian. The {n:F#} in {c:D} tells your ear: Dorian, not plain minor.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['Am7', 'D', 'Am7', 'D'], beats: 4, tempo: 90 }, label: 'Hear {c:Am7} to {c:D}' },
    },
    {
      type: 'choice',
      prompt: 'Which vamp suggests {n:D} Dorian?',
      options: [
        { text: '{c:Dm} to {c:G}', correct: true },
        { text: '{c:Dm} to {c:Gm}', why: '{c:Gm} has {n:Bb}, the {d:b6} of {n:D}: that is plain natural minor, Aeolian.' },
        { text: '{c:D} to {c:G}', why: 'A major tonic chord: that points to a major mode, not Dorian.' },
        { text: '{c:Dm} to {c:A}', why: '{c:A} has {n:C#}, the raised 7th of harmonic minor. {n:D} Dorian keeps {n:C}.' },
      ],
      explain: '{c:G} is the major {r:IV} of {n:D}, and its {n:B} is the raised 6th of {n:D} Dorian.',
      fact: 'modes-dorian-vamp',
    },
    {
      type: 'listen-choice',
      prompt: 'Over an {n:A} drone: Aeolian or Dorian?',
      sound: { kind: 'tab', notes: overDrone(OPEN_A, A3, 'dorian'), tempo: 110 },
      options: [{ text: 'Aeolian: natural minor, with {n:F}' }, { text: 'Dorian: with {n:F#}', correct: true }],
      shuffle: false,
      explain: 'That was {n:A} Dorian: listen for the 6th note up, {n:F#}, a whole step above {n:E}. Aeolian\'s {n:F} sits only a half step above it, darker.',
    },
    {
      type: 'play-phrase',
      prompt: 'Play this {n:A} Dorian phrase in fifth position, the kind of line that fits {c:Am7} to {c:D}. It leans on {n:F#}.',
      notes: [
        { string: 4, fret: 7, duration: 'q' },
        { string: 3, fret: 4, duration: 'q' },
        { string: 3, fret: 5, duration: 'q' },
        { string: 3, fret: 7, duration: 'q' },
        { string: 2, fret: 5, duration: 'q' },
        { string: 2, fret: 7, duration: 'h' },
        { string: 2, fret: 5, duration: 'q' },
        { string: 3, fret: 7, duration: 'q' },
        { string: 2, fret: 7, duration: 'q' },
        { string: 2, fret: 5, duration: 'q' },
        { string: 3, fret: 7, duration: 'q' },
        { string: 4, fret: 7, duration: 'w' },
      ],
      octave: 'exact',
      tempo: 80,
      explain: 'A B C D E, then the long {n:F#} at string 2, fret 7, back down to {n:A}. Holding the {n:F#} is what makes the phrase sound Dorian.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap every {n:F#} in fifth position, frets 4 to 8.',
        find: { note: 'F#' },
        mode: 'all',
        octave: 'any',
        frets: [4, 8],
        explain: 'Two: string 4 at fret 4 and string 2 at fret 7. These are the notes that turn {n:A} minor into {n:A} Dorian.',
      },
    },
    { generate: 'scale-notes', params: { scales: ['dorian'], tonics: ['A', 'D', 'E', 'G', 'C'], form: 'fill' } },
    { generate: 'scale-ear', params: { scales: ['minor', 'dorian'] } },
  ],
  facts: [
    {
      id: 'modes-dorian-formula',
      front: 'What is the formula of Dorian?',
      back: '{d:1} {d:2} {d:b3} {d:4} {d:5} {d:6} {d:b7}: natural minor with a raised 6th.',
    },
    {
      id: 'modes-dorian-note',
      front: 'What is the characteristic note of Dorian?',
      back: 'The raised 6th: {n:B} in {n:D} Dorian, {n:F#} in {n:A} Dorian.',
      ask: {
        type: 'type-answer',
        prompt: 'Type the characteristic note of {n:G} Dorian.',
        answer: { kind: 'note', value: 'E', spelling: 'exact' },
        input: 'keypad',
        explain: '{n:G} natural minor has {n:Eb}. Dorian raises the 6th: {n:E}.',
      },
    },
    {
      id: 'modes-dorian-vamp',
      front: 'Which vamp suits Dorian?',
      back: 'The minor tonic chord and the major {r:IV}, repeated: {c:Dm} to {c:G}, or {c:Am} to {c:D}.',
    },
  ],
};

const mixolydian: Lesson = {
  id: 'mixolydian',
  title: 'Mixolydian',
  teaches: 'Mixolydian is the major scale with a flat 7th, the sound of the dominant seventh chord.',
  minutes: 3,
  skill: `theory:${U}:mixolydian`,
  steps: [
    {
      type: 'card',
      title: 'Major with a flat 7th',
      body: 'Mixolydian is the major scale with its 7th lowered: {d:1} {d:2} {d:3} {d:4} {d:5} {d:6} {d:b7}. {n:A} major has {n:G#}; {n:A} Mixolydian has {n:G}. It is still major, but looser and bluesier.',
      figure: {
        kind: 'fretboard',
        frets: [4, 8],
        root: 'A',
        labels: 'degree',
        dots: [
          { string: 6, fret: 5, note: 'A', degree: '1', role: 'root' },
          { string: 6, fret: 7, note: 'B', degree: '2' },
          { string: 5, fret: 4, note: 'C#', degree: '3' },
          { string: 5, fret: 5, note: 'D', degree: '4' },
          { string: 5, fret: 7, note: 'E', degree: '5' },
          { string: 4, fret: 4, note: 'F#', degree: '6' },
          { string: 4, fret: 5, note: 'G', degree: 'b7', role: 'target' },
          { string: 4, fret: 7, note: 'A', degree: '1', role: 'root' },
          { string: 3, fret: 4, note: 'B', degree: '2' },
          { string: 3, fret: 6, note: 'C#', degree: '3' },
          { string: 3, fret: 7, note: 'D', degree: '4' },
          { string: 2, fret: 5, note: 'E', degree: '5' },
          { string: 2, fret: 7, note: 'F#', degree: '6' },
          { string: 2, fret: 8, note: 'G', degree: 'b7', role: 'target' },
          { string: 1, fret: 5, note: 'A', degree: '1', role: 'root' },
          { string: 1, fret: 7, note: 'B', degree: '2' },
        ],
        caption: '{n:A} Mixolydian around fret 5: {n:G} on strings 4 and 2.',
      },
    },
    {
      type: 'card',
      title: 'The dominant seventh\'s scale',
      body: 'Stack thirds from the tonic of Mixolydian and you get a dominant 7: {n:G} Mixolydian gives {c:G7}, {n:G} {n:B} {n:D} {n:F}. That is why Mixolydian fits a dominant 7. {c:G7} is the {r:V7} of {k:C major}, and {n:G} Mixolydian is the mode from degree 5 of {n:C} major.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: overDrone(OPEN_A, A3, 'mixolydian'), tempo: 110 }, label: 'Hear {n:A} Mixolydian' },
    },
    {
      type: 'type-answer',
      prompt: 'Type the {d:b7} of {n:D} Mixolydian.',
      answer: { kind: 'note', value: 'C', spelling: 'exact' },
      input: 'keypad',
      explain: '{n:D} major has {n:C#}. Mixolydian lowers it: {n:C}. {n:D} Mixolydian is {n:D} {n:E} {n:F#} {n:G} {n:A} {n:B} {n:C}.',
      fact: 'modes-mixolydian-formula',
    },
    {
      type: 'choice',
      prompt: 'Which chord does {n:E} Mixolydian fit best?',
      options: [
        { text: '{c:E7}', correct: true },
        { text: '{c:Emaj7}', why: '{c:Emaj7} has {n:D#}. Mixolydian\'s 7th is {n:D}.' },
        { text: '{c:Em7}', why: '{c:Em7} has {n:G}. Mixolydian\'s 3rd is major: {n:G#}.' },
        { text: '{c:Em7b5}', why: 'That needs {n:G} and {n:Bb}, neither of them in {n:E} Mixolydian.' },
      ],
      explain: '{n:E} Mixolydian is {n:E} {n:F#} {n:G#} {n:A} {n:B} {n:C#} {n:D}. Its 1, 3, 5 and {d:b7} are {n:E} {n:G#} {n:B} {n:D}: {c:E7}.',
      fact: 'modes-mixolydian-dominant',
    },
    {
      type: 'card',
      title: 'The Mixolydian vamp',
      body: 'Mixolydian loves the major chord a whole step **below** the tonic, the {r:bVII}: {c:A} to {c:G} in {n:A} Mixolydian, {c:G} to {c:F} in {n:G} Mixolydian. The {r:bVII} chord holds the {d:b7}: the {n:G} in {c:G}, the {n:F} in {c:F}.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['A', 'G', 'A', 'G'], beats: 4, tempo: 90 }, label: 'Hear {c:A} to {c:G}' },
    },
    {
      type: 'choice',
      prompt: 'Which chord pair suggests {n:G} Mixolydian?',
      options: [
        { text: '{c:G} to {c:F}', correct: true },
        { text: '{c:G} to {c:D}', why: '{c:D} has {n:F#}, the plain major 7th: that is {k:G major}, Ionian.' },
      ],
      shuffle: false,
      explain: '{c:F} is the {r:bVII} of {n:G}. Its {n:F} is the {d:b7} that makes {n:G} Mixolydian.',
      fact: 'modes-mixolydian-vamp',
    },
    {
      type: 'listen-choice',
      prompt: 'Over an {n:A} drone: Ionian or Mixolydian?',
      sound: { kind: 'tab', notes: overDrone(OPEN_A, A3, 'mixolydian'), tempo: 110 },
      options: [{ text: 'Ionian: major, with {n:G#}' }, { text: 'Mixolydian: with {n:G}', correct: true }],
      shuffle: false,
      explain: 'That was {n:A} Mixolydian. Listen near the top: {n:G} sits a whole step under the high {n:A}. Ionian\'s {n:G#} would lean right into it.',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap both {n:G} notes in this position, frets 4 to 8.',
      find: { note: 'G' },
      mode: 'all',
      octave: 'any',
      frets: [4, 8],
      explain: 'String 4 at fret 5 and string 2 at fret 8: the {d:b7} that turns {n:A} major into {n:A} Mixolydian.',
    },
    { generate: 'scale-notes', params: { scales: ['mixolydian'], tonics: ['G', 'A', 'D', 'E', 'C'], form: 'fill' } },
    { generate: 'scale-ear', params: { scales: ['major', 'mixolydian'] } },
  ],
  facts: [
    {
      id: 'modes-mixolydian-formula',
      front: 'What is the formula of Mixolydian?',
      back: '{d:1} {d:2} {d:3} {d:4} {d:5} {d:6} {d:b7}: the major scale with a flat 7th.',
      ask: {
        type: 'type-answer',
        prompt: 'Type the {d:b7} of {n:A} Mixolydian.',
        answer: { kind: 'note', value: 'G', spelling: 'exact' },
        input: 'keypad',
        explain: '{n:A} major has {n:G#}; Mixolydian lowers it to {n:G}.',
      },
    },
    {
      id: 'modes-mixolydian-dominant',
      front: 'Which chord does Mixolydian match, and why?',
      back: 'The dominant 7: Mixolydian\'s {d:b7} is that chord\'s 7th, so {n:G} Mixolydian fits {c:G7}.',
    },
    {
      id: 'modes-mixolydian-vamp',
      front: 'Which vamp suits Mixolydian?',
      back: 'The tonic chord and the major chord a whole step below it, the {r:bVII}: {c:G} to {c:F}, or {c:A} to {c:G}.',
    },
  ],
};

const lydian: Lesson = {
  id: 'lydian',
  title: 'Lydian',
  teaches: 'Lydian is the major scale with a raised 4th, a bright, floating major sound.',
  minutes: 3,
  skill: `theory:${U}:lydian`,
  steps: [
    {
      type: 'card',
      title: 'Major with a raised 4th',
      body: 'Lydian is the major scale with its 4th raised: {d:1} {d:2} {d:3} {d:#4} {d:5} {d:6} {d:7}. {n:D} major has {n:G}; {n:D} Lydian has {n:G#}. The result is bright, open and floating, a favourite sound in film music.',
      figure: {
        kind: 'fretboard',
        frets: [3, 8],
        root: 'D',
        labels: 'degree',
        dots: [
          { string: 5, fret: 5, note: 'D', degree: '1', role: 'root' },
          { string: 5, fret: 7, note: 'E', degree: '2' },
          { string: 4, fret: 4, note: 'F#', degree: '3' },
          { string: 4, fret: 6, note: 'G#', degree: '#4', role: 'target' },
          { string: 4, fret: 7, note: 'A', degree: '5' },
          { string: 3, fret: 4, note: 'B', degree: '6' },
          { string: 3, fret: 6, note: 'C#', degree: '7' },
          { string: 3, fret: 7, note: 'D', degree: '1', role: 'root' },
        ],
        caption: '{n:D} Lydian, one octave up from string 5, fret 5: {n:G#} is the {d:#4}.',
      },
    },
    {
      type: 'card',
      title: 'Its characteristic note',
      body: 'The {d:#4} is Lydian\'s characteristic note: {n:G#} in {n:D} Lydian, {n:B} in {n:F} Lydian, {n:C#} in {n:G} Lydian. It sits a {t:tritone} above the tonic, and unlike a plain 4th it does not lean down onto the 3rd. That is the floating feeling.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: overDrone(OPEN_D, D4, 'lydian'), tempo: 110 }, label: 'Hear {n:D} Lydian' },
    },
    {
      type: 'type-answer',
      prompt: 'Type the {d:#4} of {n:C} Lydian.',
      answer: { kind: 'note', value: 'F#', spelling: 'exact' },
      input: 'keypad',
      explain: '{n:C} major has {n:F}. Lydian raises it: {n:F#}. {n:C} Lydian is {n:C} {n:D} {n:E} {n:F#} {n:G} {n:A} {n:B}.',
      fact: 'modes-lydian-formula',
    },
    {
      type: 'true-false',
      statement: '{n:F} Lydian has {n:B}, not {n:Bb}.',
      answer: true,
      explain: '{n:F} major has {n:Bb}; Lydian raises the 4th to {n:B}. So {n:F} Lydian is the natural notes from {n:F}: F G A B C D E.',
      fact: 'modes-lydian-note',
    },
    {
      type: 'card',
      title: 'The Lydian vamp',
      body: 'Lydian\'s vamp moves from the tonic chord to the major chord a whole step **up**: {c:D} to {c:E} in {n:D} Lydian, {c:F} to {c:G} in {n:F} Lydian. The {n:G#} in {c:E} is the {d:#4} of {n:D}.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['D', 'E', 'D', 'E'], beats: 4, tempo: 90 }, label: 'Hear {c:D} to {c:E}' },
    },
    {
      type: 'choice',
      prompt: 'In {n:F} Lydian, which major chord sits a whole step above {n:F}?',
      options: [
        { text: '{c:G}', correct: true },
        { text: '{c:Gm}', why: 'In {k:F major} the chord on {n:G} is minor, with {n:Bb}. Lydian\'s {n:B} makes it major.' },
        { text: '{c:Bb}', why: '{n:Bb} is the plain 4th of {k:F major}, which Lydian raises.' },
        { text: '{c:Eb}', why: '{n:Eb} is a whole step below {n:F}, and it is not in {n:F} Lydian at all.' },
      ],
      explain: '{n:G} {n:B} {n:D} uses the raised 4th, {n:B}: {c:F} to {c:G} is the sound of {n:F} Lydian.',
      fact: 'modes-lydian-vamp',
    },
    {
      type: 'listen-choice',
      prompt: 'Over a {n:D} drone: Ionian or Lydian?',
      sound: { kind: 'tab', notes: overDrone(OPEN_D, D4, 'lydian'), tempo: 110 },
      options: [{ text: 'Ionian: major, with {n:G}' }, { text: 'Lydian: with {n:G#}', correct: true }],
      shuffle: false,
      explain: 'That was {n:D} Lydian: the 4th note, {n:G#}, floats a whole step above {n:F#} instead of resting a half step above it.',
    },
    {
      type: 'fretboard-find',
      prompt: 'The dot is {n:D}, the tonic. Tap the {d:#4} of {n:D} Lydian on string 4.',
      find: { note: 'G#3' },
      mode: 'one',
      octave: 'exact',
      frets: [3, 8],
      strings: [4],
      shown: [{ string: 5, fret: 5, note: 'D', label: 'R', role: 'root' }],
      explain: 'String 4 at fret 6 is {n:G#}, a tritone above the {n:D} at string 5, fret 5.',
    },
    { generate: 'scale-notes', params: { scales: ['lydian'], tonics: ['F', 'C', 'G', 'D', 'A'], form: 'odd-one-out' } },
    { generate: 'scale-ear', params: { scales: ['major', 'lydian'] } },
  ],
  facts: [
    {
      id: 'modes-lydian-formula',
      front: 'What is the formula of Lydian?',
      back: '{d:1} {d:2} {d:3} {d:#4} {d:5} {d:6} {d:7}: the major scale with a raised 4th.',
    },
    {
      id: 'modes-lydian-note',
      front: 'What is the characteristic note of Lydian?',
      back: 'The {d:#4}: {n:B} in {n:F} Lydian, {n:C#} in {n:G} Lydian.',
      ask: {
        type: 'type-answer',
        prompt: 'Type the characteristic note of {n:G} Lydian.',
        answer: { kind: 'note', value: 'C#', spelling: 'exact' },
        input: 'keypad',
        explain: '{n:G} major has {n:C}. Lydian raises the 4th: {n:C#}.',
      },
    },
    {
      id: 'modes-lydian-vamp',
      front: 'Which vamp suits Lydian?',
      back: 'The tonic chord to the major chord a whole step up: {c:F} to {c:G} in {n:F} Lydian.',
    },
  ],
};

const phrygianAndLocrian: Lesson = {
  id: 'phrygian-and-locrian',
  title: 'Phrygian and Locrian',
  teaches: 'Phrygian is natural minor with a flat 2nd; Locrian adds a flat 5th, which makes its tonic chord diminished.',
  minutes: 3,
  skill: `theory:${U}:phrygian-and-locrian`,
  steps: [
    {
      type: 'card',
      title: 'Minor with a flat 2nd',
      body: 'Phrygian is natural minor with its 2nd lowered: {d:1} {d:b2} {d:b3} {d:4} {d:5} {d:b6} {d:b7}. In open position it is just the natural notes from {n:E}: E F G A B C D. The {n:F}, a half step above the tonic, gives its dark, Spanish-sounding colour.',
      figure: {
        kind: 'fretboard',
        frets: [0, 3],
        root: 'E',
        labels: 'degree',
        dots: [
          { string: 6, fret: 0, note: 'E', degree: '1', role: 'root' },
          { string: 6, fret: 1, note: 'F', degree: 'b2', role: 'target' },
          { string: 6, fret: 3, note: 'G', degree: 'b3' },
          { string: 5, fret: 0, note: 'A', degree: '4' },
          { string: 5, fret: 2, note: 'B', degree: '5' },
          { string: 5, fret: 3, note: 'C', degree: 'b6' },
          { string: 4, fret: 0, note: 'D', degree: 'b7' },
          { string: 4, fret: 2, note: 'E', degree: '1', role: 'root' },
          { string: 4, fret: 3, note: 'F', degree: 'b2', role: 'target' },
          { string: 3, fret: 0, note: 'G', degree: 'b3' },
          { string: 3, fret: 2, note: 'A', degree: '4' },
          { string: 2, fret: 0, note: 'B', degree: '5' },
          { string: 2, fret: 1, note: 'C', degree: 'b6' },
          { string: 2, fret: 3, note: 'D', degree: 'b7' },
          { string: 1, fret: 0, note: 'E', degree: '1', role: 'root' },
          { string: 1, fret: 1, note: 'F', degree: 'b2', role: 'target' },
          { string: 1, fret: 3, note: 'G', degree: 'b3' },
        ],
        caption: '{n:E} Phrygian in open position: the {n:F} is the {d:b2}.',
      },
    },
    {
      type: 'card',
      title: 'The Phrygian move',
      body: 'Phrygian\'s signature move is the major chord a half step **above** the tonic, the {r:bII}, falling to {r:i}: {c:F} to {c:Em} in {n:E} Phrygian. Play {c:F} (133211), then {c:Em} (022000), and let the {c:F} sink into the {c:Em}.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['F', 'Em', 'F', 'Em'], beats: 4, tempo: 80 }, label: 'Hear {c:F} to {c:Em}' },
    },
    {
      type: 'type-answer',
      prompt: 'Type the {d:b2} of {n:A} Phrygian.',
      answer: { kind: 'note', value: 'Bb', spelling: 'exact' },
      input: 'keypad',
      explain: 'A half step above {n:A}, spelled with the letter B: {n:Bb}. {n:A} Phrygian is {n:A} {n:Bb} {n:C} {n:D} {n:E} {n:F} {n:G}.',
      fact: 'modes-phrygian-formula',
    },
    {
      type: 'choice',
      prompt: 'In {n:E} Phrygian, which chord is the {r:bII} that falls to {c:Em}?',
      options: [
        { text: '{c:F}', correct: true },
        { text: '{c:F#m}', why: '{n:F#} is a whole step above {n:E}, and {c:F#m} has {n:F#} and {n:C#}: neither is in {n:E} Phrygian.' },
        { text: '{c:D}', why: '{c:D} sits a whole step below {n:E}. The Phrygian move comes from a half step above.' },
        { text: '{c:B}', why: '{c:B} has {n:D#} and {n:F#}, neither of them in {n:E} Phrygian.' },
      ],
      explain: '{n:F} is a half step above {n:E}. {n:F} {n:A} {n:C} is major, and it sinks back to {c:Em}.',
      fact: 'modes-phrygian-move',
    },
    {
      type: 'listen-choice',
      prompt: 'Over an {n:E} drone: Phrygian or Aeolian?',
      sound: { kind: 'tab', notes: overDrone(OPEN_E, 52, 'phrygian'), tempo: 110 },
      options: [{ text: 'Phrygian: with {n:F}', correct: true }, { text: 'Aeolian: with {n:F#}' }],
      shuffle: false,
      explain: 'That was {n:E} Phrygian: its second note, {n:F}, is only a half step above {n:E}, which gives the dark, tense start.',
    },
    {
      type: 'card',
      title: 'Locrian: the unsettled one',
      body: 'Lower the 5th as well and you get Locrian: {d:1} {d:b2} {d:b3} {d:4} {d:b5} {d:b6} {d:b7}. Its tonic chord is diminished ({n:B} {n:D} {n:F} in {n:B} Locrian), so even its home chord sounds unsettled, and it rarely works as a home key. It fits {t:half-diminished} chords such as {c:Bm7b5} instead.',
      figure: { kind: 'chord', symbol: 'Bm7b5', frets: 'x2323x', caption: '{c:Bm7b5}: the seventh chord on the tonic of {n:B} Locrian.' },
    },
    {
      type: 'true-false',
      statement: 'The tonic chord of Locrian is diminished.',
      answer: true,
      explain: 'Locrian has a {d:b3} and a {d:b5}: {n:B} {n:D} {n:F} in {n:B} Locrian, a diminished triad. That is why it rarely feels like home.',
      fact: 'modes-locrian',
    },
    {
      type: 'choice',
      prompt: 'Which seventh chord does {n:B} Locrian fit?',
      options: [
        { text: '{c:Bm7b5}', correct: true },
        { text: '{c:Bm7}', why: '{c:Bm7} has {n:F#}. Locrian\'s 5th is flat: {n:F}.' },
        { text: '{c:B7}', why: '{c:B7} has {n:D#}. Locrian\'s 3rd is minor: {n:D}.' },
        { text: '{c:Bmaj7}', why: '{c:Bmaj7} has {n:D#}, {n:F#} and {n:A#}, none of them in {n:B} Locrian.' },
      ],
      explain: '{n:B} Locrian is B C D E F G A. Its 1, {d:b3}, {d:b5} and {d:b7} are {n:B} {n:D} {n:F} {n:A}: {c:Bm7b5}.',
      fact: 'modes-locrian',
    },
    { generate: 'scale-notes', params: { scales: ['phrygian', 'locrian'], tonics: ['E', 'A', 'B', 'D'], form: 'order' } },
    { generate: 'scale-ear', params: { scales: ['minor', 'phrygian'] } },
  ],
  facts: [
    {
      id: 'modes-phrygian-formula',
      front: 'What is the formula of Phrygian, and how does it sound?',
      back: '{d:1} {d:b2} {d:b3} {d:4} {d:5} {d:b6} {d:b7}: natural minor with a flat 2nd. Its colour is dark, often called Spanish-sounding.',
    },
    {
      id: 'modes-phrygian-move',
      front: 'What is Phrygian\'s signature chord move?',
      back: 'The major chord a half step above the tonic, {r:bII}, falling to {r:i}: {c:F} to {c:Em} in {n:E} Phrygian.',
    },
    {
      id: 'modes-locrian',
      front: 'Why is Locrian rarely a home key, and what does it fit?',
      back: 'Locrian is {d:1} {d:b2} {d:b3} {d:4} {d:b5} {d:b6} {d:b7}. Its tonic chord is diminished, so even home sounds unsettled, but it fits half-diminished chords such as {c:Bm7b5}.',
    },
  ],
};

const hearingTheModes: Lesson = {
  id: 'hearing-the-modes',
  title: 'Hearing the modes',
  teaches: 'A mode sounds like itself only when its tonic feels like home, so hear and play it over a drone or a vamp.',
  minutes: 4,
  skill: `theory:${U}:hearing-the-modes`,
  steps: [
    {
      ...A_DORIAN_FIFTH,
      title: 'Home makes the mode',
      body: '{n:A} Dorian and {k:G major} share every note. What makes one sound like Dorian is **home**: when {n:A} feels like the resting place, the same notes take on Dorian\'s colour. A {t:drone} or a repeating vamp is what gives the ear that home.',
      figure: { ...A_DORIAN_FIFTH.figure!, caption: '{n:A} Dorian: the notes of {k:G major}, centred on {n:A}.' } as typeof A_DORIAN_FIFTH.figure,
    },
    {
      type: 'card',
      title: 'Think of the parent scale',
      body: 'To play a mode, take the notes of its {t:parent-scale} and centre everything on the mode\'s tonic. {n:A} is the 2nd note of {k:G major}, so {n:A} Dorian uses the notes of {k:G major}. To hear a mode\'s colour, compare it with plain {n:A} major over the same drone. Hear that first.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: overDrone(OPEN_A, A3, 'major'), tempo: 110 }, label: 'Hear {n:A} major first' },
      tip: 'In the questions, the open {n:A} string is struck before every note: it plays the drone.',
    },
    {
      type: 'choice',
      prompt: 'Which major scale is the parent of {n:E} Mixolydian?',
      options: [
        { text: '{k:A major}', correct: true },
        { text: '{k:E major}', why: '{k:E major} has {n:D#}. {n:E} Mixolydian has {n:D}: it is not E\'s own major scale.' },
        { text: '{k:D major}', why: '{n:E} is the 2nd note of {k:D major}: that parent gives {n:E} Dorian.' },
        { text: '{k:B major}', why: '{n:E} is the 4th note of {k:B major}: that parent gives {n:E} Lydian.' },
      ],
      explain: 'Mixolydian starts on degree 5, and {n:E} is the 5th note of {k:A major}. So {n:E} Mixolydian is {n:E} {n:F#} {n:G#} {n:A} {n:B} {n:C#} {n:D}.',
      fact: 'modes-parent-scale',
    },
    {
      type: 'true-false',
      statement: '{n:A} Dorian uses the notes of {k:G major}.',
      answer: true,
      explain: 'Dorian starts on degree 2, and {n:A} is the 2nd note of {k:G major}: {n:A} {n:B} {n:C} {n:D} {n:E} {n:F#} {n:G}.',
      fact: 'modes-parent-scale',
    },
    nameTheMode('dorian', 'Dorian', 'That was {n:A} Dorian: minor, with a bright {n:F#} near the top.'),
    {
      type: 'match-pairs',
      prompt: 'Over an {n:A} drone, match each mode with what you hear.',
      pairs: [
        { left: 'Dorian', right: 'Minor, with {n:F#}' },
        { left: 'Phrygian', right: 'Minor, with {n:Bb}' },
        { left: 'Mixolydian', right: 'Major, with {n:G}' },
        { left: 'Lydian', right: 'Major, with {n:D#}' },
      ],
      explain: 'Over {n:A}: Dorian is minor but brighter ({n:F#}), Phrygian darker ({n:Bb}), Mixolydian major but bluesy ({n:G}), Lydian major and floating ({n:D#}).',
      fact: 'modes-colours-over-a',
    },
    nameTheMode('phrygian', 'Phrygian', 'That was {n:A} Phrygian: the dark {n:Bb} comes right after the tonic.'),
    nameTheMode('mixolydian', 'Mixolydian', 'That was {n:A} Mixolydian: major ({n:C#}), but with {n:G} instead of {n:G#} near the top.'),
    {
      type: 'choice',
      prompt: 'Over an {n:A} drone you hear {n:C}, {n:F#} and {n:G}. Which mode is it?',
      options: [
        { text: '{n:A} Dorian', correct: true },
        { text: '{n:A} Aeolian', why: 'Aeolian has {n:F}, not {n:F#}.' },
        { text: '{n:A} Mixolydian', why: 'Mixolydian has {n:C#}: it is a major mode.' },
        { text: '{n:A} Phrygian', why: 'Phrygian has {n:F}, and {n:Bb} as well.' },
      ],
      explain: '{n:C} is a minor 3rd above {n:A}, {n:F#} a major 6th, {n:G} a minor 7th: {d:b3}, {d:6}, {d:b7}. Only Dorian has all three.',
      fact: 'modes-colours-over-a',
    },
    {
      type: 'play-phrase',
      prompt: 'Pluck the open {n:A} string and let it ring as your drone. Then play {n:A} Mixolydian up from {n:A} on string 3 and end on {n:A}.',
      notes: [{ ...OPEN_A, duration: 'h' }, ...line(A3, 'mixolydian').map((n) => ('string' in n ? { ...n, duration: 'q' as const } : n))],
      octave: 'exact',
      tempo: 70,
      explain: 'The open {n:A} keeps ringing under {n:A} {n:B} {n:C#} {n:D} {n:E} {n:F#} {n:G} {n:A}: a real drone. The {n:G} at string 1, fret 3 is the {d:b7}; end on the {n:A} at fret 5.',
      alternative: {
        type: 'order',
        prompt: 'Put the notes of {n:A} Mixolydian in order, starting on {n:A}.',
        tiles: ['{n:A}', '{n:B}', '{n:C#}', '{n:D}', '{n:E}', '{n:F#}', '{n:G}'],
        distractors: ['{n:G#}'],
        explain: '{n:A} Mixolydian is {n:A} major with a flat 7th: {n:G}, not {n:G#}.',
      },
    },
    { generate: 'scale-ear', params: { scales: ['major', 'mixolydian', 'dorian', 'minor', 'lydian', 'phrygian'] } },
  ],
  facts: [
    {
      id: 'modes-need-a-home',
      front: 'When does a mode sound like itself?',
      back: 'Only when its tonic sounds like home, usually thanks to a drone or a repeating vamp.',
    },
    {
      id: 'modes-colours-over-a',
      front: 'Over an {n:A} drone, how do {n:A} Dorian, Phrygian and Mixolydian sound?',
      back: 'Dorian (with {n:F#}): minor but brighter. Phrygian (with {n:Bb}): darker. Mixolydian (with {n:C#} and {n:G}): major but bluesy.',
    },
    {
      id: 'modes-parent-scale',
      front: 'How do you find the notes of a mode?',
      back: 'Take its parent major scale and centre everything on the mode\'s tonic: {n:A} Dorian uses the notes of {k:G major}.',
      ask: {
        type: 'choice',
        prompt: 'Which major scale is the parent of {n:D} Mixolydian?',
        options: [
          { text: '{k:G major}', correct: true },
          { text: '{k:D major}', why: '{k:D major} has {n:C#}; {n:D} Mixolydian has {n:C}.' },
          { text: '{k:C major}', why: '{n:D} is the 2nd note of {k:C major}: that parent gives {n:D} Dorian.' },
        ],
        explain: 'Mixolydian starts on degree 5, and {n:D} is the 5th note of {k:G major}.',
      },
    },
  ],
};

/** Unit 26 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'The modes',
  theme: 'scales',
  description: 'The seven modes of the major scale as scales and as colours, their characteristic notes and vamps, and how to hear them.',
  lessons: [modesAsRotations, modesAgainstMajor, dorian, mixolydian, lydian, phrygianAndLocrian, hearingTheModes],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      {
        type: 'order',
        prompt: 'Put these modes in order, from degree 1 of the major scale.',
        tiles: ['Ionian', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian'],
        explain: 'Degrees 1 to 5: Ionian, Dorian, Phrygian, Lydian, Mixolydian. Aeolian and Locrian follow.',
      },
      {
        type: 'choice',
        prompt: 'The natural notes from A to A make which mode?',
        options: [
          { text: '{n:A} Aeolian', correct: true },
          { text: '{n:A} Dorian', why: '{n:A} Dorian has {n:F#}.' },
          { text: '{n:A} Phrygian', why: '{n:A} Phrygian has {n:Bb}.' },
        ],
        explain: '{n:A} is the 6th note of {n:C} major: the mode from degree 6 is Aeolian, the natural minor.',
      },
      {
        type: 'match-pairs',
        prompt: 'Match each mode with how it differs from major.',
        pairs: [
          { left: 'Lydian', right: '{d:#4}' },
          { left: 'Mixolydian', right: '{d:b7}' },
          { left: 'Dorian', right: '{d:b3} {d:b7}' },
          { left: 'Phrygian', right: '{d:b2} {d:b3} {d:b6} {d:b7}' },
          { left: 'Locrian', right: '{d:b2} {d:b3} {d:b5} {d:b6} {d:b7}' },
        ],
        explain: 'Each is measured against the major scale on the same tonic.',
      },
      {
        type: 'order',
        prompt: 'Put these modes in order, from brightest to darkest.',
        tiles: ['Lydian', 'Ionian', 'Mixolydian', 'Dorian', 'Aeolian', 'Phrygian'],
        explain: 'Each step lowers one more note: Lydian, Ionian, Mixolydian, Dorian, Aeolian, Phrygian, then Locrian.',
      },
      {
        type: 'type-answer',
        prompt: 'Type the characteristic note of {n:D} Dorian.',
        answer: { kind: 'note', value: 'B', spelling: 'exact' },
        input: 'keypad',
        explain: '{n:D} natural minor has {n:Bb}; Dorian raises the 6th to {n:B}.',
      },
      {
        type: 'type-answer',
        prompt: 'Type the characteristic note of {n:A} Lydian.',
        answer: { kind: 'note', value: 'D#', spelling: 'exact' },
        input: 'keypad',
        explain: '{n:A} major has {n:D}; Lydian raises the 4th to {n:D#}.',
      },
      {
        type: 'choice',
        prompt: 'Which vamp suggests {n:A} Mixolydian?',
        options: [
          { text: '{c:A} to {c:G}', correct: true },
          { text: '{c:A} to {c:E}', why: '{c:E} has {n:G#}: plain {k:A major}.' },
          { text: '{c:Am} to {c:G}', why: 'A minor tonic chord points to a minor mode.' },
          { text: '{c:A} to {c:B}', why: '{c:B} has {n:D#}: that is the Lydian vamp.' },
        ],
        explain: '{c:G} is the {r:bVII} of {n:A}: its {n:G} is Mixolydian\'s {d:b7}.',
      },
      {
        type: 'type-answer',
        prompt: 'Type the {d:b7} of {n:E} Mixolydian.',
        answer: { kind: 'note', value: 'D', spelling: 'exact' },
        input: 'keypad',
        explain: '{n:E} major has {n:D#}; Mixolydian lowers the 7th to {n:D}, the 7th of {c:E7}.',
      },
      {
        type: 'choice',
        prompt: 'Which vamp suggests {n:C} Lydian?',
        options: [
          { text: '{c:C} to {c:D}', correct: true },
          { text: '{c:C} to {c:Bb}', why: '{c:Bb} is the {r:bVII} of {n:C}: that is the Mixolydian vamp.' },
          { text: '{c:C} to {c:F}', why: '{c:F} holds the plain 4th, {n:F}: that is {k:C major}, Ionian.' },
          { text: '{c:Cm} to {c:F}', why: 'A minor tonic chord and a major {r:IV}: that is the Dorian vamp.' },
        ],
        explain: '{c:D} is the major chord a whole step above {n:C}. Its {n:F#} is the {d:#4} of {n:C} Lydian.',
      },
      {
        type: 'choice',
        prompt: 'Which vamp suggests {n:E} Dorian?',
        options: [
          { text: '{c:Em} to {c:A}', correct: true },
          { text: '{c:Em} to {c:Am}', why: '{c:Am} has {n:C}, the {d:b6}: plain natural minor.' },
          { text: '{c:E} to {c:A}', why: 'A major tonic chord points to a major mode.' },
        ],
        explain: '{c:A} is the major {r:IV} of {n:E}: its {n:C#} is the raised 6th of {n:E} Dorian.',
      },
      {
        type: 'choice',
        prompt: '{c:F} to {c:Em}, over and over, suggests which mode?',
        options: [
          { text: '{n:E} Phrygian', correct: true },
          { text: '{n:E} Aeolian', why: 'Aeolian has {n:F#}; {c:F} brings {n:F}, the {d:b2}.' },
          { text: '{n:F} Lydian', why: 'The home chord is {c:Em}, where the vamp comes to rest.' },
        ],
        explain: '{c:F} is the {r:bII} of {n:E}: the half-step fall to {c:Em} is the sound of Phrygian.',
      },
      {
        type: 'true-false',
        statement: 'Locrian is rarely used as a home key because its tonic chord is diminished.',
        answer: true,
        explain: 'With a {d:b3} and a {d:b5}, Locrian\'s tonic chord is diminished and sounds unsettled. It fits half-diminished chords instead.',
      },
      {
        type: 'choice',
        prompt: 'Which major scale is the parent of {n:B} Phrygian?',
        options: [
          { text: '{k:G major}', correct: true },
          { text: '{k:B major}', why: 'That is {n:B} Ionian, with {n:C#} and {n:D#}.' },
          { text: '{k:A major}', why: '{n:B} is the 2nd note of {k:A major}: that gives {n:B} Dorian.' },
          { text: '{k:E major}', why: '{n:B} is the 5th note of {k:E major}: that gives {n:B} Mixolydian.' },
        ],
        explain: 'Phrygian starts on degree 3, and {n:B} is the 3rd note of {k:G major}: {n:B} {n:C} {n:D} {n:E} {n:F#} {n:G} {n:A}.',
      },
      {
        type: 'choice',
        prompt: '{n:D} Lydian uses the notes of which major scale?',
        options: [
          { text: '{k:A major}', correct: true },
          { text: '{k:D major}', why: '{k:D major} has {n:G}; {n:D} Lydian has {n:G#}.' },
          { text: '{k:G major}', why: '{n:D} is the 5th note of {k:G major}: that gives {n:D} Mixolydian.' },
        ],
        explain: 'Lydian starts on degree 4, and {n:D} is the 4th note of {k:A major}: {n:D} {n:E} {n:F#} {n:G#} {n:A} {n:B} {n:C#}.',
      },
      nameTheMode('lydian', 'Lydian', 'That was {n:A} Lydian: major, with a floating {n:D#}.'),
      { generate: 'scale-ear', params: { scales: ['major', 'mixolydian', 'dorian', 'minor', 'lydian', 'phrygian'] } },
    ],
  },
};

export default unit;
