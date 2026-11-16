/**
 * Theory Path, unit 38: Voice leading. Written from the syllabus entries in
 * `src/content/plan/theory-path.json` (unit `voice-leading`), one lesson per entry, in order: each
 * lesson opens with the "on the guitar" picture, asks the planned exercises, ends with the planned
 * drills, and turns every planned fact into a review card.
 *
 * Every shape, note, motion and fret quoted here is cross-checked against `@/core/theory` and
 * `@/core/guitar` in `voice-leading.test.ts`.
 *
 * What a lesson `Sound` can play shapes how the examples are heard:
 * - A progression is strummed in the chord library's first shapes (C x32010, Am x02210, G Dsus4 D),
 *   which is exactly the voice leading the first and sixth lessons talk about.
 * - Chosen shapes in sequence (the triads on strings 3-2-1, the line cliché, the drop-2 ii-V-I) are
 *   picked as arpeggios, low string to high, so each string's voice can be followed.
 * - Two voices moving together are played as two-note chords in close position (`voicing: 'close'`
 *   with power chords and "no 5" chords): C5 is C3 + G3, Dmno5 is D3 + F3. The chord names are never
 *   shown; the test checks every pair of notes that sounds.
 */
import type { Lesson, TabNote, Unit } from '@/lessons';

const U = 'voice-leading';

type Spot = { string: number; fret: number };

/** The fretted strings of a shape (`x5756x`, or `x-10-12-10-12-x` above fret 9), low string first. */
function spots(shape: string): Spot[] {
  const parts = shape.includes('-') ? shape.split('-') : shape.split('');
  return parts.flatMap((p, i) => (p === 'x' ? [] : [{ string: 6 - i, fret: Number(p) }]));
}

/** Chord shapes picked one after another as arpeggios, low string to high. */
function arpeggios(shapes: string[], duration: TabNote['duration'] = 'e'): TabNote[] {
  return shapes.flatMap((shape) => spots(shape).map((s) => ({ ...s, duration })));
}

/** G (first inversion), C, D (second inversion), G on strings 3-2-1, all within frets 2 to 5. */
const TRIADS_321 = ['xxx433', 'xxx553', 'xxx232', 'xxx433'];
/** The Am line cliché on strings 4 to 1: only string 4 moves, A G# G F#. */
const AM_CLICHE = ['xx7555', 'xx6555', 'xx5555', 'xx4555'];
/** The major line cliché: only string 3 moves, G G# A Bb. */
const C_CLICHE = ['x32010', 'x32110', 'x32210', 'x32310'];
/** Drop-2 voicings of Dm7, G7 (with D in the bass) and Cmaj7 on strings 5 to 2. */
const TWO_FIVE_ONE = ['x5756x', 'x5546x', 'x3545x'];
/** The same chords with the G7 an octave position away: every voice leaps. */
const TWO_FIVE_ONE_JUMPY = ['x5756x', 'x-10-12-10-12-x', 'x3545x'];
/** G major in sixths on strings 3 and 1, pair by pair: [string 3 fret, string 1 fret]. */
const G_SIXTHS: Array<[number, number]> = [[0, 0], [2, 2], [4, 3], [5, 5], [7, 7], [9, 8], [11, 10], [12, 12]];

const whatVoiceLeadingIs: Lesson = {
  id: 'what-voice-leading-is',
  title: 'What voice leading is',
  teaches: 'Voice leading is how each chord note moves to the next chord; smooth leading keeps shared notes and steps.',
  minutes: 3,
  skill: `theory:${U}:what-voice-leading-is`,
  steps: [
    {
      type: 'card',
      title: 'Every note goes somewhere',
      body: 'Change from {c:C} (x32010) to {c:Am} (x02210) and follow each string. Strings 4, 2 and 1 keep {n:E}, {n:C} and {n:E}. String 3 moves {n:G} up to {n:A}, and the bass moves {n:C} down to {n:A}. How each note moves is {t:voice-leading|voice leading}; each line of notes is a {t:voice}.',
      figure: {
        kind: 'fretboard',
        frets: [0, 3],
        dots: [
          { string: 5, fret: 3, note: 'C', role: 'ghost' },
          { string: 3, fret: 0, note: 'G', role: 'ghost' },
          { string: 5, fret: 0, note: 'A', role: 'target' },
          { string: 4, fret: 2, note: 'E' },
          { string: 3, fret: 2, note: 'A', role: 'target' },
          { string: 2, fret: 1, note: 'C' },
          { string: 1, fret: 0, note: 'E' },
        ],
        caption: '{c:Am}. Highlighted: its two new notes. Pale: where {c:C} had them.',
      },
    },
    {
      type: 'card',
      title: 'Keep what you can',
      body: 'The notes two chords share are {t:common-tone|common tones}. Smooth voice leading keeps them where they are and moves the other voices by the smallest steps. {c:C} and {c:Am} share {n:C} and {n:E}, so only {n:G} has to move.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['C', 'Am', 'C', 'Am'], tempo: 70 }, label: 'Hear {c:C} to {c:Am}' },
      tip: 'Leave your fingers on strings 4 and 2 when you change: they do not need to move.',
    },
    {
      type: 'choice',
      prompt: 'Going from {c:C} to {c:Am}, which notes stay?',
      options: [
        { text: '{n:C} and {n:E}', correct: true },
        { text: '{n:C} and {n:G}', why: '{n:G} is not in {c:Am}: it moves up a whole step to {n:A}.' },
        { text: '{n:E} and {n:G}', why: '{n:G} has to move; {n:C} stays.' },
        { text: '{n:A} and {n:E}', why: '{n:A} is new: {c:C} has no {n:A}.' },
      ],
      explain: '{c:C} is {n:C} {n:E} {n:G} and {c:Am} is {n:A} {n:C} {n:E}: they share {n:C} and {n:E}, and only {n:G} moves, to {n:A}.',
      fact: 'voice-c-to-am',
    },
    {
      type: 'fretboard-find',
      prompt: '{c:C} becomes {c:Am}. The notes it keeps are shown. Tap the two new notes, both {n:A}.',
      find: { note: 'A' },
      mode: 'all',
      octave: 'any',
      frets: [0, 3],
      shown: [
        { string: 4, fret: 2, note: 'E' },
        { string: 2, fret: 1, note: 'C' },
        { string: 1, fret: 0, note: 'E' },
      ],
      explain: 'The open 5th string and string 3 at fret 2: the bass falls {n:C} to {n:A}, and string 3 climbs {n:G} to {n:A}.',
      fact: 'voice-leading-meaning',
    },
    {
      type: 'true-false',
      statement: 'Smooth voice leading keeps the common tones and moves the other voices by the smallest steps.',
      answer: true,
      explain: 'That is the whole recipe: hold what the chords share, and step, do not leap, with the rest.',
      fact: 'voice-smooth-leading',
    },
    {
      type: 'listen-choice',
      prompt: 'Four chords. Smooth or jumpy voice leading?',
      sound: { kind: 'progression', chords: ['C', 'Am', 'F', 'G'], tempo: 70, voicing: 'close' },
      options: [{ text: 'Smooth' }, { text: 'Jumpy', correct: true }],
      shuffle: false,
      explain: 'Every chord was in root position, so all three voices leapt together at each change: jumpy.',
    },
    {
      type: 'listen-choice',
      prompt: 'And these four?',
      sound: { kind: 'progression', chords: ['C', 'Am', 'Fmaj7', 'C'], tempo: 70 },
      options: [{ text: 'Smooth', correct: true }, { text: 'Jumpy' }],
      shuffle: false,
      explain: 'Open {c:C}, {c:Am}, {c:Fmaj7} and {c:C} share most of their notes, so at each change only one or two voices move, by a step: smooth.',
    },
    {
      type: 'choice',
      prompt: '{c:Am} (x02210) to {c:Fmaj7} (xx3210): which string changes its note?',
      options: [
        { text: 'String 4: {n:E} up to {n:F}', correct: true },
        { text: 'String 3: {n:A} up to {n:Bb}', why: 'String 3 stays at fret 2: {n:A} is in both chords.' },
        { text: 'String 2: {n:C} down to {n:B}', why: 'String 2 keeps {n:C} at fret 1.' },
      ],
      explain: 'Only string 4 moves, one fret: {n:E} to {n:F}. The bass {n:A} simply stops, and {n:A}, {n:C} and {n:E} stay: smooth voice leading.',
      fact: 'voice-smooth-leading',
    },
  ],
  facts: [
    {
      id: 'voice-leading-meaning',
      front: 'What is voice leading?',
      back: 'How each note, or voice, of one chord moves to a note of the next chord.',
    },
    {
      id: 'voice-smooth-leading',
      front: 'What makes voice leading smooth?',
      back: 'Keeping the common tones, the notes the chords share, and moving the other voices by the smallest steps.',
    },
    {
      id: 'voice-c-to-am',
      front: 'Going from {c:C} to {c:Am}, what stays and what moves?',
      back: '{n:C} and {n:E} stay; only {n:G} has to move, up a whole step to {n:A}.',
      ask: {
        type: 'choice',
        prompt: 'From {c:C} to {c:Am}, which note has to move?',
        options: [
          { text: '{n:G}, up to {n:A}', correct: true },
          { text: '{n:E}, up to {n:F}', why: '{n:E} is in both chords: it stays.' },
          { text: '{n:C}, down to {n:B}', why: '{n:C} is in both chords: it stays.' },
        ],
        explain: '{c:C} and {c:Am} share {n:C} and {n:E}; only {n:G} moves, a whole step up to {n:A}.',
      },
    },
  ],
};

const inversionsForSmoothness: Lesson = {
  id: 'inversions-for-smoothness',
  title: 'Choosing inversions for smooth changes',
  teaches: 'Pick inversions that keep shared notes on the same strings, and your hand stays put while voices move by step.',
  minutes: 3,
  skill: `theory:${U}:inversions-for-smoothness`,
  steps: [
    {
      type: 'card',
      title: 'Three triads, one hand position',
      body: 'On strings 3, 2 and 1, play {c:G} at frets 4-3-3 ({n:B} lowest), {c:C} at 5-5-3 and {c:D} at 2-3-2 ({n:A} lowest). All three sit between frets 2 and 5. The right {t:inversion|inversions} keep shared notes on the same string, so no voice moves more than three frets.',
      figure: {
        kind: 'fretboard',
        frets: [2, 5],
        dots: [
          { string: 3, fret: 2, note: 'A' },
          { string: 3, fret: 4, note: 'B' },
          { string: 3, fret: 5, note: 'C' },
          { string: 2, fret: 3, note: 'D' },
          { string: 2, fret: 5, note: 'E' },
          { string: 1, fret: 2, note: 'F#' },
          { string: 1, fret: 3, note: 'G', role: 'root' },
        ],
        caption: '{c:G} 4-3-3, {c:C} 5-5-3 and {c:D} 2-3-2 on strings 3, 2, 1.',
      },
    },
    {
      type: 'card',
      title: 'Hear {r:I} {r:IV} {r:V} {r:I}',
      body: 'Each chord is picked from string 3 up to string 1. Follow the top voice: {n:G}, {n:G}, {n:F#}, {n:G}. It barely moves, and neither does your hand.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: arpeggios(TRIADS_321), tempo: 100 }, label: 'Hear {c:G} {c:C} {c:D} {c:G}' },
    },
    {
      type: 'choice',
      prompt: 'From {c:G} (4-3-3) to {c:C} (5-5-3), which string keeps its note?',
      options: [
        { text: 'String 1: {n:G}', correct: true },
        { text: 'String 2', why: 'String 2 moves {n:D} up a whole step to {n:E}.' },
        { text: 'String 3', why: 'String 3 moves {n:B} up a half step to {n:C}.' },
        { text: 'None of them', why: '{n:G} is in both chords, and it stays on string 1, fret 3.' },
      ],
      explain: 'String 1 keeps {n:G} at fret 3, while {n:B} steps up to {n:C} and {n:D} steps up to {n:E}.',
      fact: 'voice-g-to-c-321',
    },
    {
      type: 'play-chord',
      prompt: 'Play {c:C} on strings 3, 2 and 1: frets 5-5-3.',
      chord: 'C',
      frets: 'xxx553',
      explain: 'Fret 5 on strings 3 and 2 ({n:C} and {n:E}), fret 3 on string 1 ({n:G}): the same {n:G} you held for {c:G}.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'C',
        frets: 'xxx553',
        accept: 'this-shape',
        prompt: 'Build {c:C} on strings 3, 2 and 1, keeping string 1 at fret 3 from the {c:G} shape.',
        explain: 'Frets 5-5-3: {n:C} {n:E} {n:G}, with {n:G} on string 1 shared with {c:G}.',
      },
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'D/A',
      frets: 'xxx232',
      accept: 'this-shape',
      prompt: 'Build {c:D} in second inversion, {n:A} lowest, on strings 3, 2 and 1 near frets 2 to 5.',
      explain: 'Frets 2-3-2: {n:A} {n:D} {n:F#}. It sits right under the {c:G} and {c:C} shapes, so the hand hardly moves.',
      fact: 'voice-g-c-d-strings-321',
    },
    {
      type: 'choice',
      prompt: 'From {c:D} (2-3-2) back to {c:G} (4-3-3), which note stays?',
      options: [
        { text: '{n:D}, on string 2', correct: true },
        { text: '{n:A}, on string 3', why: '{n:A} steps up a whole step to {n:B}.' },
        { text: '{n:F#}, on string 1', why: '{n:F#} steps up a half step to {n:G}.' },
      ],
      explain: '{n:D} is in both chords and stays at string 2, fret 3; the other two voices step up to {n:B} and {n:G}.',
      fact: 'voice-g-c-d-strings-321',
    },
    {
      type: 'true-false',
      statement: 'Choosing inversions that keep shared notes on the same strings makes chord changes smoother.',
      answer: true,
      explain: 'The shared notes stay under the same fingers, and the other voices only step: less movement for your hand and your ear.',
      fact: 'voice-inversions-same-strings',
    },
    { generate: 'neck-tones', params: { what: 'chord', chords: ['G', 'C', 'D'], strings: [3, 2, 1], span: 4 } },
  ],
  facts: [
    {
      id: 'voice-inversions-same-strings',
      front: 'How do inversions make chord changes smoother?',
      back: 'Choose the inversions that keep the shared notes on the same strings: your hand stays put and the other voices move by small steps.',
    },
    {
      id: 'voice-g-c-d-strings-321',
      front: 'Where are {c:G}, {c:C} and {c:D} on strings 3-2-1 in one hand position?',
      back: '{c:G} at 4-3-3, {c:C} at 5-5-3 and {c:D} at 2-3-2: all within frets 2 to 5.',
    },
    {
      id: 'voice-g-to-c-321',
      front: 'From {c:G} (4-3-3) to {c:C} (5-5-3) on strings 3-2-1, what moves?',
      back: 'String 1 keeps {n:G}, while {n:B} and {n:D} step up to {n:C} and {n:E}.',
    },
  ],
};

const kindsOfMotion: Lesson = {
  id: 'kinds-of-motion',
  title: 'Parallel, similar, contrary, oblique',
  teaches: 'Two voices move in parallel, similar, contrary or oblique motion; contrary motion keeps them most independent.',
  minutes: 3,
  skill: `theory:${U}:kinds-of-motion`,
  steps: [
    {
      type: 'card',
      title: 'Two voices, four ways to move',
      body: 'Pick strings 3 and 1 together, then move. Both up the same distance: {t:parallel-motion|parallel}. Both up, by different distances: {t:similar-motion|similar}. One up, one down: {t:contrary-motion|contrary}. One holds while the other moves: {t:oblique-motion|oblique}.',
      figure: {
        kind: 'fretboard',
        frets: [0, 3],
        dots: [
          { string: 3, fret: 0, note: 'G', label: '1' },
          { string: 3, fret: 2, note: 'A', label: '2' },
          { string: 1, fret: 0, note: 'E', label: '1' },
          { string: 1, fret: 2, note: 'F#', label: '2' },
        ],
        caption: 'Parallel: both voices move up two frets, from the 1s to the 2s.',
      },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each move of two voices with its name.',
      pairs: [
        { left: 'Both up 2 frets', right: 'Parallel' },
        { left: 'Up 2 frets and up 3', right: 'Similar' },
        { left: 'One up, one down', right: 'Contrary' },
        { left: 'One holds, one moves', right: 'Oblique' },
      ],
      explain: 'Same way, same distance: parallel. Same way, new distance: similar. Opposite ways: contrary. One still: oblique.',
      fact: 'voice-parallel-similar',
    },
    {
      type: 'card',
      title: 'Contrary and oblique',
      body: 'Contrary motion keeps two parts most independent: as one voice climbs, the other falls, and the ear hears two separate lines. Oblique motion comes free on guitar: let an open string ring while you play a melody above it.',
      figure: {
        kind: 'fretboard',
        frets: [0, 3],
        dots: [
          { string: 3, fret: 2, note: 'A', label: '1' },
          { string: 3, fret: 0, note: 'G', label: '2' },
          { string: 1, fret: 0, note: 'E', label: '1' },
          { string: 1, fret: 1, note: 'F', label: '2' },
        ],
        caption: 'Contrary: string 3 falls {n:A} to {n:G} while string 1 rises {n:E} to {n:F}.',
      },
    },
    {
      type: 'listen-choice',
      prompt: 'Two voices. Do they move in contrary or parallel motion?',
      sound: { kind: 'progression', chords: ['Dmno5', 'C5', 'Dmno5'], tempo: 70, voicing: 'close' },
      options: [{ text: 'Contrary', correct: true }, { text: 'Parallel' }],
      shuffle: false,
      explain: 'The low voice went down a step and back ({n:D} {n:C} {n:D}) while the high voice went up and back ({n:F} {n:G} {n:F}): opposite directions.',
    },
    {
      type: 'choice',
      prompt: 'An open string rings while a melody moves above it. Which motion is that?',
      options: [
        { text: 'Oblique', correct: true },
        { text: 'Parallel', why: 'In parallel motion both voices move. The open string holds still.' },
        { text: 'Contrary', why: 'In contrary motion both voices move, in opposite directions.' },
      ],
      explain: 'One voice, the open string, holds while the other moves: oblique motion.',
      fact: 'voice-open-string-oblique',
    },
    {
      type: 'choice',
      prompt: 'Which motion is this: string 3 from 1 to 2 and string 1 from 1 to 2?',
      figure: {
        kind: 'fretboard',
        frets: [0, 3],
        dots: [
          { string: 3, fret: 0, note: 'G', label: '1' },
          { string: 3, fret: 2, note: 'A', label: '2' },
          { string: 1, fret: 0, note: 'E', label: '1' },
          { string: 1, fret: 3, note: 'G', label: '2' },
        ],
      },
      options: [
        { text: 'Similar', correct: true },
        { text: 'Parallel', why: 'String 3 moves two frets but string 1 moves three: the distance between them changes.' },
        { text: 'Contrary', why: 'Both voices move up.' },
        { text: 'Oblique', why: 'Both voices move; neither holds.' },
      ],
      explain: 'Both go up, string 3 by two frets ({n:G} to {n:A}) and string 1 by three ({n:E} to {n:G}): same direction, different distances.',
      fact: 'voice-parallel-similar',
    },
    {
      type: 'true-false',
      statement: 'In contrary motion, both voices move in the same direction.',
      answer: false,
      explain: 'Contrary motion is opposite directions: one voice up, the other down.',
      fact: 'voice-contrary-oblique',
    },
    {
      type: 'listen-choice',
      prompt: 'And these two voices: contrary or parallel?',
      sound: { kind: 'progression', chords: ['Cno5', 'Dmno5', 'Emno5'], tempo: 70, voicing: 'close' },
      options: [{ text: 'Contrary' }, { text: 'Parallel', correct: true }],
      shuffle: false,
      explain: 'Both voices climbed together, a third apart all the way ({n:C} {n:D} {n:E} under {n:E} {n:F} {n:G}): parallel motion.',
    },
    {
      type: 'choice',
      prompt: 'Which motion keeps two parts most independent?',
      options: [
        { text: 'Contrary', correct: true },
        { text: 'Parallel', why: 'Parallel voices move as one, which makes them least independent.' },
        { text: 'Similar', why: 'Similar voices still go the same way.' },
      ],
      explain: 'When one voice rises as the other falls, the ear follows two separate lines.',
      fact: 'voice-contrary-oblique',
    },
  ],
  facts: [
    {
      id: 'voice-parallel-similar',
      front: 'What is the difference between parallel and similar motion?',
      back: 'Both move two voices the same way. Parallel keeps the same interval between them; similar changes it.',
    },
    {
      id: 'voice-contrary-oblique',
      front: 'What are contrary and oblique motion?',
      back: 'Contrary: the voices move in opposite directions. Oblique: one voice holds while the other moves.',
    },
    {
      id: 'voice-open-string-oblique',
      front: 'An open string rings under a moving melody. Which motion is it?',
      back: 'Oblique motion: one voice, the open string, holds while the other moves.',
    },
  ],
};

const parallelFifths: Lesson = {
  id: 'parallel-fifths',
  title: 'Parallel fifths and the rule of style',
  teaches: 'Classical style avoids parallel fifths, rock riffs live on them, and parallel 3rds and 6ths fit any style.',
  minutes: 3,
  skill: `theory:${U}:parallel-fifths`,
  steps: [
    {
      type: 'card',
      title: 'Parallel fifths',
      body: 'Play {c:C5}, {c:D5}, {c:E5} and {c:F5} on strings 5 and 4. Both voices climb together a perfect fifth apart: {t:parallel-fifths|parallel fifths}. Classical part writing avoids them, and parallel octaves too, because the two voices fuse into one and lose their independence.',
      figure: {
        kind: 'fretboard',
        frets: [3, 10],
        dots: [
          { string: 5, fret: 3, note: 'C' },
          { string: 5, fret: 5, note: 'D' },
          { string: 5, fret: 7, note: 'E' },
          { string: 5, fret: 8, note: 'F' },
          { string: 4, fret: 5, note: 'G' },
          { string: 4, fret: 7, note: 'A' },
          { string: 4, fret: 9, note: 'B' },
          { string: 4, fret: 10, note: 'C' },
        ],
        caption: 'Power chords {c:C5} {c:D5} {c:E5} {c:F5}: parallel fifths on strings 5 and 4.',
      },
    },
    {
      type: 'card',
      title: 'The classical fix',
      body: 'Keep the bass {n:C} {n:D} {n:E} {n:F}, but move the top voice {n:G} {n:F} {n:G} {n:A}. The first move is contrary, the rest are parallel thirds, and the two parts stay independent.',
      figure: {
        kind: 'fretboard',
        frets: [3, 8],
        dots: [
          { string: 5, fret: 3, note: 'C' },
          { string: 5, fret: 5, note: 'D' },
          { string: 5, fret: 7, note: 'E' },
          { string: 5, fret: 8, note: 'F' },
          { string: 4, fret: 5, note: 'G' },
          { string: 4, fret: 3, note: 'F' },
          { string: 4, fret: 7, note: 'A' },
        ],
        caption: 'Bass on string 5: {n:C} {n:D} {n:E} {n:F}. Top on string 4: {n:G} {n:F} {n:G} {n:A}.',
      },
    },
    {
      type: 'listen-choice',
      prompt: 'Two voices climb together. Parallel fifths or parallel thirds?',
      sound: { kind: 'progression', chords: ['C5', 'D5', 'E5', 'F5'], tempo: 80, voicing: 'close' },
      options: [{ text: 'Parallel fifths', correct: true }, { text: 'Parallel thirds' }],
      shuffle: false,
      explain: 'A hollow, bare sound, the two voices almost one: fifths, the sound of a power-chord riff.',
    },
    {
      type: 'true-false',
      statement: 'Parallel fifths are wrong in every style of music.',
      answer: false,
      explain: 'Power-chord riffs are made of nothing else. The rule against them belongs to classical part writing, not to all music.',
      fact: 'voice-fifths-style',
    },
    {
      type: 'card',
      title: 'Thirds and sixths are welcome',
      body: 'Parallel thirds and sixths keep two voices distinct and sound sweet, so nearly every style uses them: they are the sound of harmonised guitar lines. Play {k:G major} in sixths on strings 3 and 1. Most pairs share a fret; where the scale has a half step, string 1 is one fret lower.',
      figure: {
        kind: 'fretboard',
        frets: [0, 12],
        dots: [
          ...G_SIXTHS.map(([f]) => ({ string: 3, fret: f })),
          ...G_SIXTHS.map(([, f]) => ({ string: 1, fret: f })),
        ],
        caption: '{k:G major} in sixths: string 3 has the scale, string 1 a sixth above.',
      },
    },
    {
      type: 'play-phrase',
      prompt: 'Play {k:G major} in sixths, pair by pair: string 3, then string 1.',
      notes: G_SIXTHS.flatMap(([low, high]) => [
        { string: 3, fret: low, duration: 'e' as const },
        { string: 1, fret: high, duration: 'e' as const },
      ]),
      octave: 'exact',
      tempo: 80,
      explain: 'Frets 0-0, 2-2, 4-3, 5-5, 7-7, 9-8, 11-10, 12-12: {n:G} under {n:E}, {n:A} under {n:F#}, {n:B} under {n:G}, and so on up to {n:G} under {n:E}.',
      fact: 'voice-parallel-sixths',
      alternative: {
        type: 'order',
        prompt: 'Put the {k:G major} sixths in order up the neck (string 3 fret, then string 1 fret).',
        tiles: G_SIXTHS.map(([low, high]) => `${low}-${high}`),
        explain: '0-0, 2-2, 4-3, 5-5, 7-7, 9-8, 11-10, 12-12: string 3 plays {k:G major}, and string 1 stays a sixth above.',
      },
    },
    {
      type: 'listen-choice',
      prompt: 'And these two voices: parallel fifths or parallel thirds?',
      sound: { kind: 'progression', chords: ['Cno5', 'Dmno5', 'Emno5', 'Fno5'], tempo: 80, voicing: 'close' },
      options: [{ text: 'Parallel fifths' }, { text: 'Parallel thirds', correct: true }],
      shuffle: false,
      explain: 'A warmer, fuller sound with two clear voices: thirds ({n:C} {n:D} {n:E} {n:F} under {n:E} {n:F} {n:G} {n:A}).',
    },
    {
      type: 'choice',
      prompt: 'Why does classical part writing avoid parallel fifths?',
      options: [
        { text: 'The two voices fuse and lose their independence', correct: true },
        { text: 'Fifths are dissonant', why: 'The fifth is one of the most consonant intervals. That is exactly why two voices a fifth apart melt into one.' },
        { text: 'Fifths are out of tune on guitar', why: 'Fifths are in tune. The rule is about the independence of the parts.' },
      ],
      explain: 'Voices moving in parallel perfect fifths or octaves sound like one voice, which weakens the independence of the parts.',
      fact: 'voice-parallel-fifths-rule',
    },
    {
      type: 'choice',
      prompt: 'Which parallel intervals are welcome in almost every style?',
      options: [
        { text: 'Thirds and sixths', correct: true },
        { text: 'Fifths and octaves', why: 'These are the ones classical part writing avoids.' },
        { text: 'Seconds and sevenths', why: 'In parallel, these dissonant intervals are rare outside special effects.' },
      ],
      explain: 'Parallel thirds and sixths keep two distinct voices and sound sweet: the sound of harmonised guitar lines.',
      fact: 'voice-parallel-sixths',
    },
  ],
  facts: [
    {
      id: 'voice-parallel-fifths-rule',
      front: 'Why does classical part writing avoid parallel fifths and octaves?',
      back: 'Two voices moving in parallel perfect fifths or octaves fuse together, which weakens the independence of the parts.',
    },
    {
      id: 'voice-fifths-style',
      front: 'Are parallel fifths wrong?',
      back: 'Only in a style that avoids them. Power-chord riffs are made entirely of parallel fifths: the rule belongs to classical part writing, not to all music.',
      ask: {
        type: 'true-false',
        statement: 'A power-chord riff is made of parallel fifths.',
        answer: true,
        explain: 'Each power chord is a root and its fifth, and the riff moves them together: parallel fifths, and perfectly good rock.',
      },
    },
    {
      id: 'voice-parallel-sixths',
      front: 'Which parallel intervals suit almost every style?',
      back: 'Thirds and sixths: the sound of harmonised guitar lines, such as {k:G major} in sixths on strings 3 and 1.',
    },
  ],
};

const lineCliches: Lesson = {
  id: 'line-cliches',
  title: 'Line clichés',
  teaches: 'A line cliché holds a chord while one voice moves chromatically, turning one chord into a moving progression.',
  minutes: 3,
  skill: `theory:${U}:line-cliches`,
  steps: [
    {
      type: 'card',
      title: 'One chord, one moving line',
      body: 'Hold {c:Am} as xx7555 and move only string 4 down, one fret at a time: frets 7, 6, 5, 4. The chord stays, but the line {n:A} {n:G#} {n:G} {n:F#} turns it into {c:Am}, {c:AmMaj7/G#}, {c:Am7/G} and {c:Am6/F#}. That is a {t:line-cliche|line cliché}.',
      figure: {
        kind: 'fretboard',
        frets: [4, 7],
        dots: [
          { string: 4, fret: 7, note: 'A', role: 'root' },
          { string: 4, fret: 6, note: 'G#', role: 'target' },
          { string: 4, fret: 5, note: 'G', role: 'target' },
          { string: 4, fret: 4, note: 'F#', role: 'target' },
          { string: 3, fret: 5, note: 'C' },
          { string: 2, fret: 5, note: 'E' },
          { string: 1, fret: 5, note: 'A', role: 'root' },
        ],
        caption: 'Strings 3 to 1 stay at fret 5; string 4 walks down {n:A} {n:G#} {n:G} {n:F#}.',
      },
    },
    {
      type: 'card',
      title: 'Hear the line',
      body: 'Each chord is picked from string 4 up, so the moving voice is the first note of each group. Everything above it stays the same.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: arpeggios(AM_CLICHE), tempo: 110 }, label: 'Hear the {c:Am} cliché' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the moving voice of the {c:Am} line cliché.',
      text: '{n:A}, {n:G#}, {n:G}, ___',
      blanks: ['{n:F#}'],
      bank: ['{n:F}', '{n:E}'],
      explain: 'Down a half step each time: {n:A}, {n:G#}, {n:G}, {n:F#}. The last chord is {c:Am6}.',
      fact: 'voice-line-cliche',
    },
    {
      type: 'play-chord',
      prompt: 'Play {c:AmMaj7/G#}: the {c:Am} shape xx7555 with string 4 at fret 6.',
      chord: 'AmMaj7/G#',
      frets: 'xx6555',
      explain: 'String 4, fret 6 is {n:G#}, the major 7th of {n:A}, under {n:C} {n:E} {n:A} at fret 5.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'AmMaj7/G#',
        frets: 'xx6555',
        accept: 'this-shape',
        prompt: 'Build {c:AmMaj7/G#} from the {c:Am} shape xx7555: move only string 4, down one fret.',
        explain: 'xx6555: {n:G#} {n:C} {n:E} {n:A}.',
      },
    },
    {
      type: 'play-chord',
      prompt: 'Two frets further down on string 4: {c:Am6/F#} (xx4555).',
      chord: 'Am6/F#',
      frets: 'xx4555',
      explain: 'String 4, fret 4 is {n:F#}, the 6th of {n:A}. The cliché has walked {n:A} {n:G#} {n:G} {n:F#}.',
      fact: 'voice-am-cliche-frets',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'Am6/F#',
        frets: 'xx4555',
        accept: 'this-shape',
        prompt: 'Build {c:Am6/F#}: the {c:Am} shape xx7555 with string 4 three frets lower.',
        explain: 'xx4555: {n:F#} {n:C} {n:E} {n:A}.',
      },
    },
    {
      type: 'choice',
      prompt: 'The {c:Am} shape xx7555 with string 4 at fret 5 is which chord?',
      options: [
        { text: '{c:Am7/G}', correct: true },
        { text: '{c:AmMaj7/G#}', why: 'That is string 4 at fret 6.' },
        { text: '{c:Am6/F#}', why: 'That is string 4 at fret 4.' },
      ],
      explain: 'String 4, fret 5 is {n:G}, the flat 7th of {n:A}: {c:Am7} with {n:G} in the bass.',
      fact: 'voice-am-cliche-frets',
    },
    {
      type: 'listen-choice',
      prompt: 'Four chords with one moving voice. Is it rising or falling?',
      sound: { kind: 'tab', notes: arpeggios(AM_CLICHE), tempo: 110 },
      options: [{ text: 'Rising' }, { text: 'Falling', correct: true }],
      shuffle: false,
      explain: 'The first note of each chord fell a half step at a time: {n:A} {n:G#} {n:G} {n:F#}, the minor line cliché.',
    },
    {
      type: 'card',
      title: 'The major version climbs',
      body: 'On a major chord the line usually climbs from the 5th: {c:C}, {c:Caug}, {c:C6}, {c:C7}, with {n:G} {n:G#} {n:A} {n:Bb} on string 3 of the open {c:C} shape (x32010, x32110, x32210, x32310).',
    },
    {
      type: 'listen-choice',
      prompt: 'And this moving voice: rising or falling?',
      sound: { kind: 'tab', notes: arpeggios(C_CLICHE), tempo: 120 },
      options: [{ text: 'Rising', correct: true }, { text: 'Falling' }],
      shuffle: false,
      explain: 'The third note of each chord climbed {n:G} {n:G#} {n:A} {n:Bb}: the major line cliché, from {c:C} to {c:C7}.',
    },
    {
      type: 'true-false',
      statement: 'In a line cliché, the whole chord changes at every step.',
      answer: false,
      explain: 'Only one voice moves, by a half step; the rest of the chord stays where it is.',
      fact: 'voice-line-cliche',
    },
    {
      type: 'choice',
      prompt: 'In the major cliché {c:C}, {c:Caug}, {c:C6}, {c:C7}, which voice moves?',
      options: [
        { text: 'The 5th, climbing', correct: true },
        { text: 'The root, falling', why: 'The root {n:C} stays in every chord.' },
        { text: 'The 3rd, climbing', why: 'The 3rd {n:E} stays in every chord.' },
      ],
      explain: 'The 5th, {n:G}, climbs {n:G#}, {n:A}, {n:Bb}, while {n:C} and {n:E} hold.',
      fact: 'voice-major-cliche',
    },
  ],
  facts: [
    {
      id: 'voice-line-cliche',
      front: 'What is a line cliché?',
      back: 'A chord held while one voice, often an inner voice or the bass, moves chromatically: {c:Am}, {c:AmMaj7}, {c:Am7}, {c:Am6} ({n:A} {n:G#} {n:G} {n:F#}).',
    },
    {
      id: 'voice-am-cliche-frets',
      front: 'How do you play the {c:Am} line cliché on strings 4 to 1?',
      back: 'Hold xx7555 and move only string 4 down a fret at a time, to frets 6, 5 and 4: {c:AmMaj7/G#}, {c:Am7/G}, {c:Am6/F#}.',
    },
    {
      id: 'voice-major-cliche',
      front: 'What does the line cliché do on a major chord?',
      back: 'The 5th climbs: {c:C}, {c:Caug}, {c:C6}, {c:C7} ({n:G} {n:G#} {n:A} {n:Bb}).',
    },
  ],
};

const nonChordTones: Lesson = {
  id: 'non-chord-tones',
  title: 'Notes outside the chord',
  teaches: 'Notes outside the chord are named by how they move: passing tones, neighbours, suspensions, appoggiaturas.',
  minutes: 4,
  skill: `theory:${U}:non-chord-tones`,
  steps: [
    {
      type: 'card',
      title: 'Passing and neighbour tones',
      body: 'Over {c:C} (x32010), play string 2 at frets 1, 3, 5: {n:C} {n:D} {n:E}. The {n:D} is not in the chord: it is a {t:passing-tone|passing tone}, stepping between two chord tones. Then string 1 at 0, 1, 0: {n:E} {n:F} {n:E}. The {n:F} steps away and back: a {t:neighbour-tone|neighbour tone}.',
      figure: {
        kind: 'tab',
        tempo: 80,
        notes: [
          { string: 2, fret: 1, duration: 'q' },
          { string: 2, fret: 3, duration: 'q' },
          { string: 2, fret: 5, duration: 'h' },
          { string: 1, fret: 0, duration: 'q' },
          { string: 1, fret: 1, duration: 'q' },
          { string: 1, fret: 0, duration: 'h' },
        ],
        caption: 'Over {c:C}: the {n:D} passes, the {n:F} is a neighbour. Both are {t:non-chord-tone|non-chord tones}.',
      },
    },
    {
      type: 'choice',
      prompt: 'Over a {c:C} chord the melody plays {n:E} {n:F} {n:E}. What is the {n:F}?',
      options: [
        { text: 'A neighbour tone', correct: true },
        { text: 'A passing tone', why: 'A passing tone moves on to a different chord tone. This {n:F} comes back to {n:E}.' },
        { text: 'A suspension', why: 'A suspension is held over from the chord before. This {n:F} steps up from {n:E}.' },
        { text: 'A chord tone', why: '{c:C} is {n:C} {n:E} {n:G}: no {n:F}.' },
      ],
      explain: 'It steps away from {n:E} and straight back: a neighbour tone.',
      fact: 'voice-neighbour-tone',
    },
    {
      type: 'choice',
      prompt: 'Over {c:C} the melody plays {n:C} {n:D} {n:E}. What is the {n:D}?',
      options: [
        { text: 'A passing tone', correct: true },
        { text: 'A neighbour tone', why: 'A neighbour returns to the note it left. This {n:D} goes on to {n:E}.' },
        { text: 'An appoggiatura', why: 'An appoggiatura is reached by a leap. This {n:D} is reached by step.' },
      ],
      explain: 'It moves by step between two different chord tones, {n:C} and {n:E}: a passing tone.',
      fact: 'voice-passing-tone',
    },
    {
      type: 'card',
      title: 'Held over, then falling',
      body: 'Play {c:G} (320003), {c:Dsus4} (xx0233), then {c:D} (xx0232), keeping string 1 at fret 3. The {n:G} belongs to {c:G}. Held into the {c:D} chord it clashes, then falls a step to {n:F#}. That is a {t:suspension}: a 4-3 suspension, since {n:G} is the 4th of {n:D} and {n:F#} its 3rd.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['G', 'Dsus4', 'D'], tempo: 70 }, label: 'Hear {c:G} {c:Dsus4} {c:D}' },
    },
    {
      type: 'play-chord',
      prompt: 'Play {c:Dsus4} (xx0233): string 1 stays at fret 3, where it was in {c:G}.',
      chord: 'Dsus4',
      frets: 'xx0233',
      explain: 'The {n:G} on string 1 is the suspension. Now lift your little finger and let it fall to fret 2, {n:F#}: {c:D}.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'Dsus4',
        frets: 'xx0233',
        accept: 'this-shape',
        prompt: 'Build {c:Dsus4}, keeping string 1 at fret 3 from the {c:G} chord.',
        explain: 'xx0233: {n:D} {n:A} {n:D} {n:G}. The {n:G} on top is held over from {c:G}.',
      },
    },
    {
      type: 'listen-choice',
      prompt: 'Three chords. Did the held note resolve down by step?',
      sound: { kind: 'progression', chords: ['G', 'Dsus4', 'D'], tempo: 70 },
      options: [{ text: 'Yes: it fell a step', correct: true }, { text: 'No: it stayed where it was' }],
      shuffle: false,
      explain: 'The top {n:G} held through {c:Dsus4}, then fell to {n:F#} in {c:D}: a suspension and its resolution.',
    },
    {
      type: 'choice',
      prompt: 'In {c:G}, {c:Dsus4}, {c:D}, which note is the suspension?',
      options: [
        { text: '{n:G}', correct: true },
        { text: '{n:F#}', why: '{n:F#} is where the suspension resolves: the 3rd of {c:D}.' },
        { text: '{n:A}', why: '{n:A} is the 5th of {c:D}: a chord tone.' },
      ],
      explain: '{n:G} belongs to {c:G}, is held into the {c:D} chord as its 4th, then falls to {n:F#}.',
      fact: 'voice-suspension',
    },
    {
      type: 'card',
      title: 'Leap in, step out',
      body: 'An {t:appoggiatura} leaps to a non-chord tone on a strong beat, leans on it, then steps to a chord tone. Over {c:C}: {n:C}, then a leap up to {n:F} on beat 1, falling a step to {n:E}.',
      figure: {
        kind: 'tab',
        tempo: 80,
        notes: [
          { string: 2, fret: 1, duration: 'w' },
          { string: 1, fret: 1, duration: 'h' },
          { string: 1, fret: 0, duration: 'h' },
        ],
        caption: 'Over {c:C}: the {n:F} on the strong beat is the appoggiatura.',
      },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each non-chord tone with how it moves.',
      pairs: [
        { left: 'Passing tone', right: 'Steps between chord tones' },
        { left: 'Neighbour tone', right: 'Steps away and back' },
        { left: 'Suspension', right: 'Held over, falls by step' },
        { left: 'Appoggiatura', right: 'Leaps in, then steps' },
      ],
      explain: 'Each is named by its motion: in by step or by leap, out by step, held or not.',
      fact: 'voice-appoggiatura',
    },
    {
      type: 'listen-choice',
      prompt: 'And these three: did the held note resolve down by step?',
      sound: { kind: 'progression', chords: ['G', 'Dsus4', 'G'], tempo: 70 },
      options: [{ text: 'Yes: it fell a step' }, { text: 'No: it stayed where it was', correct: true }],
      shuffle: false,
      explain: 'The top {n:G} held all the way and the music went back to {c:G}: the tension never resolved down.',
    },
    {
      type: 'true-false',
      statement: 'A suspension resolves by leaping up.',
      answer: false,
      explain: 'A suspension resolves down by step: {n:G} to {n:F#} in {c:Dsus4} to {c:D}.',
      fact: 'voice-suspension',
    },
  ],
  facts: [
    {
      id: 'voice-passing-tone',
      front: 'What is a passing tone?',
      back: 'A non-chord tone that moves by step between two different chord tones: over {c:C}, the {n:D} in {n:C} {n:D} {n:E}.',
    },
    {
      id: 'voice-neighbour-tone',
      front: 'What is a neighbour tone?',
      back: 'A non-chord tone that steps away from a chord tone and back: over {c:C}, the {n:F} in {n:E} {n:F} {n:E}.',
    },
    {
      id: 'voice-suspension',
      front: 'What is a suspension?',
      back: 'A note held over from the chord before, where it clashes, then resolved down by step: {n:G} held from {c:G} into {c:D}, falling to {n:F#}, is a 4-3 suspension.',
    },
    {
      id: 'voice-appoggiatura',
      front: 'What is an appoggiatura?',
      back: 'A non-chord tone reached by a leap on a strong beat, which then resolves by step.',
      ask: {
        type: 'choice',
        prompt: 'Over {c:C}, a melody leaps from {n:C} up to {n:F} on the beat, then steps down to {n:E}. What is the {n:F}?',
        options: [
          { text: 'An appoggiatura', correct: true },
          { text: 'A passing tone', why: 'A passing tone is reached by step. This {n:F} is reached by a leap.' },
          { text: 'A neighbour tone', why: 'A neighbour steps away from a note and back to it.' },
        ],
        explain: 'Leap in on a strong beat, step out: an appoggiatura.',
      },
    },
  ],
};

const voiceLedTwoFiveOne: Lesson = {
  id: 'voice-led-two-five-one',
  title: 'A voice-led two-five-one',
  teaches: 'With four-note voicings, every voice of a two-five-one can stay or move by step, so the hand barely moves.',
  minutes: 4,
  skill: `theory:${U}:voice-led-two-five-one`,
  steps: [
    {
      type: 'card',
      title: 'Three chords, four voices',
      body: 'Play {c:Dm7} (x5756x), {c:G7/D} (x5546x) and {c:Cmaj7} (x3545x) on strings 5 to 2: {t:drop-2} shapes. Follow each string. Every voice either stays or moves by a step, never more than a whole step, so your hand barely moves through the {t:two-five-one}.',
      figure: {
        kind: 'fretboard',
        frets: [3, 7],
        dots: [
          { string: 5, fret: 5, note: 'D' },
          { string: 5, fret: 3, note: 'C', role: 'root' },
          { string: 4, fret: 7, note: 'A' },
          { string: 4, fret: 5, note: 'G' },
          { string: 3, fret: 5, note: 'C', role: 'root' },
          { string: 3, fret: 4, note: 'B', role: 'target' },
          { string: 2, fret: 6, note: 'F', role: 'target' },
          { string: 2, fret: 5, note: 'E' },
        ],
        caption: 'Each string is one voice: {n:D}-{n:D}-{n:C}, {n:A}-{n:G}-{n:G}, {n:C}-{n:B}-{n:B}, {n:F}-{n:F}-{n:E}.',
      },
    },
    {
      type: 'card',
      title: 'Hear it slowly',
      body: 'Each chord is picked from string 5 up to string 2. Use the slower button first, then hear it in time: the four lines barely move.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: arpeggios(TWO_FIVE_ONE), tempo: 90 }, label: 'Hear {c:Dm7} {c:G7} {c:Cmaj7}' },
    },
    {
      type: 'choice',
      prompt: 'From {c:Dm7} (x5756x) to {c:G7/D} (x5546x), which voices stay?',
      options: [
        { text: '{n:D} on string 5 and {n:F} on string 2', correct: true },
        { text: '{n:A} on string 4 and {n:C} on string 3', why: 'Those two move down: {n:A} to {n:G}, {n:C} to {n:B}.' },
        { text: 'Only {n:D} on string 5', why: '{n:F} on string 2 stays too: it is the 3rd of {c:Dm7} and the 7th of {c:G7}.' },
      ],
      explain: '{n:D} stays as the bass and {n:F} stays on top, while {n:A} falls to {n:G} and {n:C} falls to {n:B}.',
      fact: 'voice-251-shapes',
    },
    {
      type: 'play-chord',
      prompt: 'Play {c:Dm7}: x5756x, strings 5 to 2.',
      chord: 'Dm7',
      frets: 'x5756x',
      explain: '{n:D} {n:A} {n:C} {n:F}, from string 5 up. Mute strings 6 and 1 with spare fingers.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'Dm7',
        frets: 'x5756x',
        accept: 'this-shape',
        prompt: 'Build {c:Dm7} on strings 5 to 2 with {n:D} at fret 5 of string 5.',
        explain: 'x5756x: {n:D} {n:A} {n:C} {n:F}.',
      },
    },
    {
      type: 'play-chord',
      prompt: 'Now {c:G7/D} (x5546x): only strings 4 and 3 move.',
      chord: 'G7/D',
      frets: 'x5546x',
      explain: 'String 4 falls to {n:G} and string 3 to {n:B}; {n:D} and {n:F} stay put.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'G7/D',
        frets: 'x5546x',
        accept: 'this-shape',
        prompt: 'Build {c:G7/D} from {c:Dm7} (x5756x): move only strings 4 and 3.',
        explain: 'x5546x: {n:D} {n:G} {n:B} {n:F}. String 4 fell two frets, string 3 one.',
      },
    },
    {
      type: 'play-chord',
      prompt: 'And {c:Cmaj7} (x3545x): now strings 5 and 2 move.',
      chord: 'Cmaj7',
      frets: 'x3545x',
      explain: 'The bass falls {n:D} to {n:C} and the top falls {n:F} to {n:E}; {n:G} and {n:B} stay.',
      fact: 'voice-four-note-251',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'Cmaj7',
        frets: 'x3545x',
        accept: 'this-shape',
        prompt: 'Build {c:Cmaj7} from {c:G7/D} (x5546x): move only strings 5 and 2.',
        explain: 'x3545x: {n:C} {n:G} {n:B} {n:E}.',
      },
    },
    {
      type: 'card',
      title: 'The guide tones',
      body: 'Watch the 3rds and 7ths, the {t:guide-tone|guide tones}. The 7th of {c:Dm7}, {n:C}, falls a half step to {n:B}, the 3rd of {c:G7}. The 7th of {c:G7}, {n:F}, falls a half step to {n:E}, the 3rd of {c:Cmaj7}.',
    },
    {
      type: 'choice',
      prompt: 'The 7th of {c:G7}, {n:F}, moves to which note of {c:Cmaj7}?',
      options: [
        { text: '{n:E}, a half step down', correct: true },
        { text: '{n:G}, a whole step up', why: '{n:G} is already in the {c:G7} shape on string 4, and it stays.' },
        { text: '{n:F}: it stays', why: '{n:F} is not in {c:Cmaj7}. It falls a half step to {n:E}, the 3rd.' },
      ],
      explain: '{n:F} falls a half step to {n:E}, the 3rd of {c:Cmaj7}, just as {n:C} fell to {n:B} one chord earlier.',
      fact: 'voice-guide-tones-251',
    },
    {
      type: 'listen-choice',
      prompt: 'Voice-led or jumpy two-five-one?',
      sound: { kind: 'tab', notes: arpeggios(TWO_FIVE_ONE), tempo: 100 },
      options: [{ text: 'Voice-led', correct: true }, { text: 'Jumpy' }],
      shuffle: false,
      explain: 'The three chords stayed in one place on the neck, each voice stepping or holding: voice-led.',
    },
    {
      type: 'listen-choice',
      prompt: 'And this one?',
      sound: { kind: 'tab', notes: arpeggios(TWO_FIVE_ONE_JUMPY), tempo: 100 },
      options: [{ text: 'Voice-led' }, { text: 'Jumpy', correct: true }],
      shuffle: false,
      explain: 'The {c:G7} leapt five frets up the neck and back, and every voice jumped with it: jumpy.',
    },
    {
      type: 'true-false',
      statement: 'In x5756x, x5546x, x3545x, no voice moves more than a whole step.',
      answer: true,
      explain: 'String 5: {n:D} {n:D} {n:C}. String 4: {n:A} {n:G} {n:G}. String 3: {n:C} {n:B} {n:B}. String 2: {n:F} {n:F} {n:E}. Every move is a half or whole step, or none.',
      fact: 'voice-four-note-251',
    },
  ],
  facts: [
    {
      id: 'voice-four-note-251',
      front: 'With four-note voicings, how far must each voice move in a {r:ii}-{r:V}-{r:I}?',
      back: 'No further than a step: each voice either stays or moves by a half or whole step.',
    },
    {
      id: 'voice-251-shapes',
      front: 'Give voice-led shapes for {c:Dm7}, {c:G7} and {c:Cmaj7} on strings 5 to 2.',
      back: '{c:Dm7} x5756x, {c:G7} x5546x (with {n:D} in the bass), {c:Cmaj7} x3545x: no voice moves more than a whole step.',
    },
    {
      id: 'voice-guide-tones-251',
      front: 'In {c:Dm7} {c:G7} {c:Cmaj7}, how do the guide tones move?',
      back: 'By half step: {n:C}, the 7th of {c:Dm7}, to {n:B}, the 3rd of {c:G7}; and {n:F}, the 7th of {c:G7}, to {n:E}, the 3rd of {c:Cmaj7}.',
      ask: {
        type: 'choice',
        prompt: 'In {c:Dm7} to {c:G7}, the 7th of {c:Dm7}, {n:C}, moves to which note?',
        options: [
          { text: '{n:B}, the 3rd of {c:G7}', correct: true },
          { text: '{n:D}, the 5th of {c:G7}', why: '{n:C} moves by the smallest step, a half step down.' },
          { text: '{n:G}, the root of {c:G7}', why: 'That is a leap of a fourth; the guide tone moves by half step.' },
        ],
        explain: '{n:C} falls a half step to {n:B}: each 7th falls to the next chord\'s 3rd.',
      },
    },
  ],
};

/** Unit 38 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'Voice leading',
  theme: 'composition',
  description: 'How the notes of one chord move to the next: common tones, motion types, parallel fifths, line clichés, non-chord tones, smooth sevenths.',
  lessons: [whatVoiceLeadingIs, inversionsForSmoothness, kindsOfMotion, parallelFifths, lineCliches, nonChordTones, voiceLedTwoFiveOne],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      {
        type: 'choice',
        prompt: 'Going from {c:C} to {c:Am}, which notes stay?',
        options: [
          { text: '{n:C} and {n:E}', correct: true },
          { text: '{n:E} and {n:G}', why: '{n:G} moves up to {n:A}.' },
          { text: '{n:C} and {n:G}', why: '{n:G} moves up to {n:A}.' },
        ],
        explain: 'They share {n:C} and {n:E}; only {n:G} moves, to {n:A}.',
      },
      {
        type: 'true-false',
        statement: 'Smooth voice leading moves every voice by a big leap to the new chord.',
        answer: false,
        explain: 'Smooth voice leading keeps the common tones and moves the other voices by the smallest steps.',
      },
      {
        type: 'choice',
        prompt: 'On strings 3-2-1, from {c:G} (4-3-3) to {c:C} (5-5-3), which string keeps its note?',
        options: [
          { text: 'String 1', correct: true },
          { text: 'String 2', why: 'It moves {n:D} up to {n:E}.' },
          { text: 'String 3', why: 'It moves {n:B} up to {n:C}.' },
        ],
        explain: 'String 1 keeps {n:G} at fret 3.',
      },
      {
        type: 'chord-build',
        task: 'fingers',
        chord: 'D/A',
        frets: 'xxx232',
        accept: 'this-shape',
        prompt: 'Build {c:D} with {n:A} lowest on strings 3, 2 and 1, near frets 2 to 5.',
        explain: 'Frets 2-3-2: {n:A} {n:D} {n:F#}, the second inversion of {c:D}.',
      },
      {
        type: 'match-pairs',
        prompt: 'Match each move of two voices with its name.',
        pairs: [
          { left: 'Same way, same interval', right: 'Parallel' },
          { left: 'Same way, new interval', right: 'Similar' },
          { left: 'Opposite ways', right: 'Contrary' },
          { left: 'One holds, one moves', right: 'Oblique' },
        ],
        explain: 'Parallel keeps the distance, similar changes it, contrary goes opposite ways, oblique holds one voice.',
      },
      {
        type: 'choice',
        prompt: 'An open string rings under a moving melody. Which motion is that?',
        options: [{ text: 'Oblique', correct: true }, { text: 'Parallel' }, { text: 'Contrary' }, { text: 'Similar' }],
        explain: 'One voice holds while the other moves: oblique.',
      },
      {
        type: 'choice',
        prompt: 'Why does classical part writing avoid parallel fifths and octaves?',
        options: [
          { text: 'The voices fuse and lose their independence', correct: true },
          { text: 'They are dissonant', why: 'Fifths and octaves are the most consonant intervals: that is why they fuse.' },
          { text: 'They cannot be played on guitar', why: 'Every power-chord riff plays them.' },
        ],
        explain: 'Parallel perfect fifths and octaves make two voices sound like one.',
      },
      {
        type: 'true-false',
        statement: 'Parallel fifths are wrong in every style of music.',
        answer: false,
        explain: 'Power-chord riffs are built on them. The rule belongs to classical part writing.',
      },
      {
        type: 'choice',
        prompt: 'Which parallel intervals suit almost every style?',
        options: [
          { text: 'Thirds and sixths', correct: true },
          { text: 'Fifths and octaves', why: 'Classical writing avoids these in parallel.' },
          { text: 'Seconds and sevenths', why: 'These clash in parallel.' },
        ],
        explain: 'Parallel thirds and sixths are the sound of harmonised guitar lines.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Complete the moving voice of the {c:Am} line cliché.',
        text: '{n:A}, {n:G#}, ___, {n:F#}',
        blanks: ['{n:G}'],
        bank: ['{n:F}', '{n:Bb}'],
        explain: 'A half step at a time: {n:A}, {n:G#}, {n:G}, {n:F#}.',
      },
      {
        type: 'choice',
        prompt: 'The {c:Am} shape xx7555 with string 4 at fret 6 is which chord?',
        options: [
          { text: '{c:AmMaj7/G#}', correct: true },
          { text: '{c:Am7/G}', why: 'That is fret 5.' },
          { text: '{c:Am6/F#}', why: 'That is fret 4.' },
        ],
        explain: 'String 4, fret 6 is {n:G#}, the major 7th of {n:A}.',
      },
      {
        type: 'match-pairs',
        prompt: 'Match each non-chord tone with how it moves.',
        pairs: [
          { left: 'Passing tone', right: 'Steps between chord tones' },
          { left: 'Neighbour tone', right: 'Steps away and back' },
          { left: 'Suspension', right: 'Held over, falls by step' },
          { left: 'Appoggiatura', right: 'Leaps in, then steps' },
        ],
        explain: 'Each non-chord tone is named by how it moves in and out.',
      },
      {
        type: 'choice',
        prompt: 'Over {c:C} the melody plays {n:E} {n:F} {n:E}. What is the {n:F}?',
        options: [{ text: 'A neighbour tone', correct: true }, { text: 'A passing tone' }, { text: 'A suspension' }],
        explain: 'It steps away from {n:E} and back.',
      },
      {
        type: 'choice',
        prompt: 'In {c:G}, {c:Dsus4}, {c:D}, which note is suspended?',
        options: [
          { text: '{n:G}', correct: true },
          { text: '{n:F#}', why: '{n:F#} is the resolution.' },
          { text: '{n:D}', why: '{n:D} is the root of both {c:Dsus4} and {c:D}.' },
        ],
        explain: '{n:G}, held over from {c:G}, falls to {n:F#}: a 4-3 suspension.',
      },
      {
        type: 'choice',
        prompt: 'From {c:Dm7} (x5756x) to {c:G7/D} (x5546x), which voices stay?',
        options: [
          { text: '{n:D} and {n:F}', correct: true },
          { text: '{n:A} and {n:C}', why: 'They fall to {n:G} and {n:B}.' },
          { text: 'None of them', why: '{n:D} and {n:F} are in both chords and stay on their strings.' },
        ],
        explain: '{n:D} on string 5 and {n:F} on string 2 stay; {n:A} and {n:C} step down.',
      },
      {
        type: 'choice',
        prompt: 'In {c:G7} to {c:Cmaj7}, where does the 7th of {c:G7}, {n:F}, go?',
        options: [
          { text: 'Down a half step to {n:E}', correct: true },
          { text: 'Up a whole step to {n:G}', why: '{n:G} is already there; {n:F} takes the nearest step, down to {n:E}.' },
          { text: 'It stays on {n:F}', why: '{n:F} is not in {c:Cmaj7}.' },
        ],
        explain: '{n:F} falls a half step to {n:E}, the 3rd of {c:Cmaj7}.',
      },
      {
        type: 'listen-choice',
        prompt: 'Two voices climb together. Parallel fifths or parallel thirds?',
        sound: { kind: 'progression', chords: ['C5', 'D5', 'E5', 'F5'], tempo: 80, voicing: 'close' },
        options: [{ text: 'Parallel fifths', correct: true }, { text: 'Parallel thirds' }],
        shuffle: false,
        explain: 'The bare, hollow sound of fifths: two voices that almost melt into one.',
      },
    ],
  },
};

export default unit;
