/**
 * Prof. Elena Varga, unit 6: Voice leading and chord melody (plan: `elena/elena-voice-leading` in
 * src/content/plan/teachers.json).
 *
 * Elena's voice: conservatory rigour, dry humour, high standards, deep respect for the student.
 * Every lesson follows its plan entry: the `explain` on the cards, the `show` as fretboards, chord
 * boxes, staff and tab, the `practice` as in-lesson exercises (every chord the microphone hears has
 * a chord-build alternative) or tasks that send the learner to the Player and to the jam tracks of
 * Progressions, and back.
 *
 * Where the lessons differ from the plan (see the report): the triads lesson plays the strings 4 to
 * 2 inversions by microphone and shows Dev's strings 3 to 1 shapes beside them, and its Canon route
 * on strings 4 to 2 keeps every voice within two frets for one pass (the repeat jumps back to fret
 * 7: the Canon climbs, so no route can come back to where it began in steps of two frets). The
 * major line cliche is taught as one moving voice on string 3 under the C shape, since the engine
 * (rightly) names C E A over C without its fifth Am/C, not C6. The reharmonisation phrase is the
 * plan's original 8-bar phrase in F with its own melody, and both versions are voiced in drop-2 on
 * strings 4 to 1 so that the top voice of every grip is the melody note. The plan's Record step is
 * a phone recording, since the app has no recorder.
 *
 * Music from the library: Chord Melody: First Ballad (`st-chord-melody-1`, 66 BPM), Chord Melody:
 * Jazz Ballad with Reharmonisation (`st-chord-melody-2`, 60 BPM: the plan's 66 would be faster than
 * the piece, so the lesson goes to 56 and then 60) and Canon in D (`canon-in-d`). Danny Boy (chord
 * melody, `danny-boy-chord-melody`) needs a printed source and carries a fallback to Greensleeves
 * (fingerstyle); the Jazz Ballad's tasks keep theirs in case it is ever renamed.
 * `elena-voice-leading.test.ts` cross-checks every shape, voice, route, top note, melody note,
 * tempo and chart against the engines and the library.
 */
import type { TabNote } from '@/lessons';
import type { TeacherLesson, TeacherUnit } from '../types';
import { playerTask, toolTask } from '../tasks';

/** A sounded tab note (never a rest): what every line of this unit is made of. */
export type Played = Extract<TabNote, { string: number }>;

/** The shapes the unit teaches, low string first (two-digit frets hyphenated). */
export const SHAPES = {
  /** C, Am, F and G as close triads on strings 3 to 1, one hand position. */
  close: { C: 'xxx553', 'Am/C': 'xxx555', 'F/C': 'xxx565', 'G/B': 'xxx433' },
  /** The order exercise's wrong turns: root-position shapes whose top voice leaps. */
  leaps: { Am: 'xxx210', F: 'x-x-x-10-10-8' },
  /** C in its three inversions on strings 4 to 2. */
  set42: { C: 'x-x-10-9-8-x', 'C/G': 'xx555x', 'C/E': 'xx201x' },
  /** Dev's three C shapes on strings 3 to 1. */
  set31: { C: 'xxx553', 'C/E': 'xxx988', 'C/G': 'x-x-x-12-13-12' },
  /** The minor line cliche in open position. */
  cliche: { Am: 'x02210', AmMaj7: 'x02110', Am7: 'x02010', Am6: 'x02212' },
  /** Four of the First Ballad's grips, each with a different melody note on top. */
  ballad: { C: 'x32013', Am: 'x07555', F: 'xx3211', G7: '32303x' },
  /** Drop-2 grips on strings 4 to 1 for the phrase in F, plain and reharmonised. */
  phrase: { Fmaj7: 'xx7968', Dm7: 'xx7768', D7: 'xx7778', Gm7: 'xx5766', C7: 'xx5556', Gb7: 'xx4656', Fmaj7Home: 'xx3555' },
  /** The jam's drop-2 grips for Gm7, Gb7 and Fmaj7 (unit 5's Gm7 and Fmaj7, and the substitute between). */
  subJam: { Gm7: 'x-x-8-10-8-10', C7: 'xx8988', Gb7: 'xx8979', Fmaj7: 'xx7968' },
} as const;

/** The Canon on strings 4 to 2, no voice moving more than two frets: D A Bm F#m G D G A, then D. */
export const CANON_ROUTE = [
  ['D/A', 'x-x-7-7-7-x'],
  ['A', 'x-x-7-6-5-x'],
  ['Bm', 'x-x-9-7-7-x'],
  ['F#m/A', 'x-x-7-6-7-x'],
  ['G/B', 'x-x-9-7-8-x'],
  ['D/A', 'x-x-7-7-7-x'],
  ['G/B', 'x-x-9-7-8-x'],
  ['A/C#', 'x-x-11-9-10-x'],
  ['D', 'x-x-12-11-10-x'],
] as const;

/** The original 8-bar phrase in F: its melody (two bars per chord), as sounding pitches. */
export const PHRASE_MELODY = [
  { note: 'C5', duration: 'h' },
  { note: 'A4', duration: 'h' },
  { note: 'G4', duration: 'h' },
  { note: 'E4', duration: 'h' },
  { note: 'C5', duration: 'h' },
  { note: 'A4', duration: 'h' },
  { note: 'D5', duration: 'w' },
  { note: 'Bb4', duration: 'h' },
  { note: 'G4', duration: 'h' },
  { note: 'D5', duration: 'h' },
  { note: 'C5', duration: 'h' },
  { note: 'Bb4', duration: 'h' },
  { note: 'E4', duration: 'h' },
  { note: 'Bb4', duration: 'w' },
] as const;

/** The same melody on strings 1 and 2, around the seventh fret (the hand of the drop-2 grips). */
export const PHRASE_TAB: Played[] = [
  { string: 1, fret: 8, duration: 'h' },
  { string: 1, fret: 5, duration: 'h' },
  { string: 2, fret: 8, duration: 'h' },
  { string: 2, fret: 5, duration: 'h' },
  { string: 1, fret: 8, duration: 'h' },
  { string: 1, fret: 5, duration: 'h' },
  { string: 1, fret: 10, duration: 'w' },
  { string: 1, fret: 6, duration: 'h' },
  { string: 2, fret: 8, duration: 'h' },
  { string: 1, fret: 10, duration: 'h' },
  { string: 1, fret: 8, duration: 'h' },
  { string: 1, fret: 6, duration: 'h' },
  { string: 2, fret: 5, duration: 'h' },
  { string: 1, fret: 6, duration: 'w' },
];

/** The First Ballad's opening tune, bars 1 and 2 (the top notes and the notes between them). */
export const BALLAD_TUNE: Played[] = [
  { string: 1, fret: 0, duration: 'q' },
  { string: 2, fret: 3, duration: 'e' },
  { string: 1, fret: 0, duration: 'e' },
  { string: 1, fret: 3, duration: 'h' },
  { string: 1, fret: 5, duration: 'q' },
  { string: 2, fret: 8, duration: 'e' },
  { string: 2, fret: 6, duration: 'e' },
  { string: 2, fret: 5, duration: 'h' },
];

// ── 1. Voice leading ────────────────────────────────────────────────────────────────────────────

const voiceLeadingPrinciples: TeacherLesson = {
  id: 'voice-leading-principles',
  title: 'Voice leading',
  teaches: 'Keep common tones, move the other voices by the smallest step, and choose inversions to do it.',
  minutes: 5,
  skill: 'teacher:elena:voice-leading-principles',
  steps: [
    {
      type: 'card',
      title: 'Several melodies at once',
      body: '{t:voice-leading|Voice leading} treats a progression as several melodies moving together. Keep {t:common-tone|common tones} where they are, move the other voices by the smallest step, and prefer {t:contrary-motion|contrary motion} between the outer voices. On guitar: choose inversions, not the root-position shape every time.',
      figure: {
        kind: 'fretboard',
        frets: [2, 6],
        root: 'C',
        labels: 'degree',
        dots: [
          { string: 3, fret: 5, degree: '1', role: 'root' },
          { string: 2, fret: 5, degree: '3', role: 'third' },
          { string: 1, fret: 3, degree: '5', role: 'fifth' },
        ],
        caption: '{c:C} as a close triad on strings 3 to 1: xxx553.',
      },
    },
    {
      type: 'choice',
      prompt: 'From {c:C} ({n:C} {n:E} {n:G}) to {c:Am} ({n:A} {n:C} {n:E}): which notes stay where they are?',
      options: [
        { text: '{n:C} and {n:E}', correct: true },
        { text: '{n:E} and {n:G}', why: '{n:G} is not in {c:Am}. It must move, and it moves one step, to {n:A}.' },
        { text: 'Only {n:C}', why: '{n:E} is in both chords too. Moving it is wasted motion.' },
        { text: 'None: every voice moves', why: 'Two of the three notes are shared. Keep them.' },
      ],
      explain: '{c:C} and {c:Am} share {n:C} and {n:E}. Keep both; only {n:G} moves, a whole step up to {n:A}. The result is {c:Am/C}, xxx555.',
      fact: 'vl-rules',
    },
    {
      type: 'card',
      title: 'Four chords, one position',
      body: '{c:C} xxx553, {c:Am/C} xxx555, {c:F/C} xxx565, {c:G/B} xxx433. To {c:Am/C} only {n:G} moves, up to {n:A}. To {c:F/C} only {n:E} moves, a half step to {n:F}. To {c:G/B} all three move, none further than a third. The hand never leaves frets 3 to 6.',
      figure: { kind: 'chord', symbol: 'F/C', frets: SHAPES.close['F/C'], caption: '{c:F/C}: {n:C} {n:F} {n:A}, low to high.' },
    },
    {
      type: 'match-pairs',
      prompt: 'From {c:F/C} to {c:G/B}: match each string with what its voice does.',
      pairs: [
        { left: 'String 3', right: '{n:C} falls to {n:B}' },
        { left: 'String 2', right: '{n:F} falls to {n:D}' },
        { left: 'String 1', right: '{n:A} falls to {n:G}' },
      ],
      explain: 'Each voice takes the nearest note of {c:G}: {n:C} a half step, {n:A} a whole step, {n:F} a minor third. Here top and bottom fall together; the rule says prefer contrary motion, not insist on it.',
      fact: 'vl-c-am-f-g',
    },
    {
      type: 'play-chord',
      prompt: '{c:C}: xxx553, strings 3 to 1 only.',
      chord: 'C',
      frets: SHAPES.close.C,
      explain: 'String 3 fret 5 ({n:C}), string 2 fret 5 ({n:E}), string 1 fret 3 ({n:G}). Pick the three strings; the others stay silent.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'C', frets: SHAPES.close.C, accept: 'this-shape', prompt: 'Build {c:C} as a close triad on strings 3 to 1.', explain: 'xxx553: {n:C} and {n:E} at fret 5, {n:G} on string 1 fret 3.' },
    },
    {
      type: 'play-chord',
      prompt: '{c:Am/C}: xxx555. One finger moves.',
      chord: 'Am/C',
      frets: SHAPES.close['Am/C'],
      explain: '{n:C} and {n:E} held; {n:G} rose a whole step to {n:A}, string 1 fret 5.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'Am/C', frets: SHAPES.close['Am/C'], accept: 'this-shape', prompt: 'Build {c:Am/C}: the {c:C} grip with its top voice raised to {n:A}.', explain: 'xxx555: strings 3, 2 and 1 at fret 5, {n:C} {n:E} {n:A}.' },
    },
    {
      type: 'play-chord',
      prompt: '{c:F/C}: xxx565. Again one finger moves.',
      chord: 'F/C',
      frets: SHAPES.close['F/C'],
      explain: '{n:E} rose a half step to {n:F} on string 2; {n:C} and {n:A} held.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'F/C', frets: SHAPES.close['F/C'], accept: 'this-shape', prompt: 'Build {c:F/C} on strings 3 to 1.', explain: 'xxx565: {n:C} on string 3 fret 5, {n:F} on string 2 fret 6, {n:A} on string 1 fret 5.' },
    },
    {
      type: 'play-chord',
      prompt: '{c:G/B}: xxx433. Every voice falls, by the nearest note.',
      chord: 'G/B',
      frets: SHAPES.close['G/B'],
      explain: '{n:B} on string 3 fret 4, {n:D} and {n:G} on strings 2 and 1 at fret 3. Back to {c:C}, {n:B} rises a half step to {n:C}.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'G/B', frets: SHAPES.close['G/B'], accept: 'this-shape', prompt: 'Build {c:G/B} on strings 3 to 1.', explain: 'xxx433: {n:B} on string 3 fret 4, {n:D} and {n:G} at fret 3.' },
    },
    {
      type: 'order',
      prompt: '{c:C}, {c:Am}, {c:F}, {c:G}: put one voicing of each in that order, so the top voice moves only by step.',
      tiles: ['{c:C} xxx553', '{c:Am/C} xxx555', '{c:F/C} xxx565', '{c:G/B} xxx433'],
      distractors: ['{c:Am} xxx210', '{c:F} x-x-x-10-10-8'],
      explain: 'The top voice sings {n:G}, {n:A}, {n:A}, {n:G}. {c:Am} at xxx210 would drop it to {n:E}; {c:F} at fret 10 would leap to {n:C}.',
      fact: 'vl-c-am-f-g',
    },
    toolTask({
      id: 'jam-four-voicings',
      title: 'Jam: four voicings, one position',
      tool: 'progressions',
      params: ['fifties-i-vi-iv-v', 'c', 'jam'],
      minutes: 6,
      body: 'The {r:I}–{r:vi}–{r:IV}–{r:V} in {k:C major} at 66 {t:bpm|BPM}, with these four voicings only: one gentle strum or pluck per beat on strings 3 to 1. Listen to the top voice, {n:G} {n:A} {n:A} {n:G}, against the band\'s bass.',
      tip: 'If a voice jumps, you grabbed a habit. Find the nearer note.',
    }),
    {
      type: 'true-false',
      statement: 'Contrary motion means the top and bottom voices move in opposite directions.',
      answer: true,
      explain: 'One rises while the other falls. It keeps the voices independent; similar motion is allowed, but contrary motion is preferred between the outer voices.',
      fact: 'vl-rules',
    },
    { generate: 'chord-tones', params: { types: ['major', 'minor'], roots: ['C', 'A', 'F', 'G'], ask: 'notes' } },
  ],
  facts: [
    { id: 'vl-rules', front: 'The three rules of voice leading?', back: 'Keep common tones where they are; move the other voices by the smallest step; prefer contrary motion between the outer voices.' },
    { id: 'vl-c-am-f-g', front: '{c:C} {c:Am} {c:F} {c:G} as close triads on strings 3 to 1, one position?', back: 'xxx553, xxx555 ({c:Am/C}), xxx565 ({c:F/C}), xxx433 ({c:G/B}). The top voice moves {n:G} {n:A} {n:A} {n:G}.' },
  ],
};

// ── 2. Triads on every string set ───────────────────────────────────────────────────────────────

const triadsAcrossStringSets: TeacherLesson = {
  id: 'triads-across-string-sets',
  title: 'Triads on every string set',
  teaches: 'Every string set holds each triad in three inversions; voice-lead on one set, no voice moving over two frets.',
  minutes: 5,
  skill: 'teacher:elena:triads-across-string-sets',
  steps: [
    {
      type: 'card',
      title: 'Three shapes on every set',
      body: 'Every triad has three inversions on each group of three neighbouring strings, a {t:string-set|string set}. Learn them as families by the bass note: root, third or fifth. {c:C} on strings 4 to 2: x-x-10-9-8-x (root), x-x-5-5-5-x (fifth), x-x-2-0-1-x (third).',
      figure: {
        kind: 'fretboard',
        frets: [0, 10],
        root: 'C',
        labels: 'degree',
        dots: [
          { string: 4, fret: 2, degree: '3', role: 'third' },
          { string: 3, fret: 0, degree: '5', role: 'fifth' },
          { string: 2, fret: 1, degree: '1', role: 'root' },
          { string: 4, fret: 5, degree: '5', role: 'fifth' },
          { string: 3, fret: 5, degree: '1', role: 'root' },
          { string: 2, fret: 5, degree: '3', role: 'third' },
          { string: 4, fret: 10, degree: '1', role: 'root' },
          { string: 3, fret: 9, degree: '3', role: 'third' },
          { string: 2, fret: 8, degree: '5', role: 'fifth' },
        ],
        caption: '{c:C} on strings 4 to 2: three shapes, three bass notes.',
      },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each shape on strings 4 to 2 with the chord it plays.',
      pairs: [
        { left: 'x-x-10-9-8-x', right: '{c:C}: root in the bass' },
        { left: 'x-x-5-5-5-x', right: '{c:C/G}: fifth in the bass' },
        { left: 'x-x-2-0-1-x', right: '{c:C/E}: third in the bass' },
      ],
      explain: 'The lowest string names the family: {n:C} at string 4 fret 10, {n:G} at fret 5, {n:E} at fret 2.',
      fact: 'vl-triads-c-4-2',
    },
    {
      type: 'play-chord',
      prompt: '{c:C} in root position on strings 4 to 2: x-x-10-9-8-x.',
      chord: 'C',
      frets: SHAPES.set42.C,
      explain: '{n:C} on string 4 fret 10, {n:E} on string 3 fret 9, {n:G} on string 2 fret 8. Strings 6, 5 and 1 stay silent.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'C', frets: SHAPES.set42.C, accept: 'this-shape', prompt: 'Build {c:C} with its root at the bottom of strings 4 to 2.', explain: 'x-x-10-9-8-x: {n:C}, {n:E}, {n:G}, low to high.' },
    },
    {
      type: 'play-chord',
      prompt: '{c:C/G}: x-x-5-5-5-x, one finger across three strings.',
      chord: 'C/G',
      frets: SHAPES.set42['C/G'],
      explain: '{n:G}, {n:C}, {n:E} at fret 5: the fifth in the bass.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'C/G', frets: SHAPES.set42['C/G'], accept: 'this-shape', prompt: 'Build {c:C/G} on strings 4 to 2.', explain: 'x-x-5-5-5-x: {n:G} on string 4, {n:C} on string 3, {n:E} on string 2.' },
    },
    {
      type: 'play-chord',
      prompt: '{c:C/E}: x-x-2-0-1-x, with the open {n:G} string inside.',
      chord: 'C/E',
      frets: SHAPES.set42['C/E'],
      explain: '{n:E} on string 4 fret 2, the open {n:G}, {n:C} on string 2 fret 1: the third in the bass.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'C/E', frets: SHAPES.set42['C/E'], accept: 'this-shape', prompt: 'Build {c:C/E} on strings 4 to 2.', explain: 'x-x-2-0-1-x: {n:E}, then the open {n:G}, then {n:C}.' },
    },
    {
      type: 'card',
      title: 'The set above',
      body: 'Dev\'s shapes on strings 3 to 1 are the same families, one set higher: {c:C} xxx553, {c:C/E} xxx988, {c:C/G} x-x-x-12-13-12. Every grip changes, because the major third between strings 3 and 2 moves from the top of the set to the bottom.',
      figure: {
        kind: 'fretboard',
        frets: [3, 13],
        root: 'C',
        labels: 'degree',
        dots: [
          { string: 3, fret: 5, degree: '1', role: 'root' },
          { string: 2, fret: 5, degree: '3', role: 'third' },
          { string: 1, fret: 3, degree: '5', role: 'fifth' },
          { string: 3, fret: 9, degree: '3', role: 'third' },
          { string: 2, fret: 8, degree: '5', role: 'fifth' },
          { string: 1, fret: 8, degree: '1', role: 'root' },
          { string: 3, fret: 12, degree: '5', role: 'fifth' },
          { string: 2, fret: 13, degree: '1', role: 'root' },
          { string: 1, fret: 12, degree: '3', role: 'third' },
        ],
        caption: '{c:C} on strings 3 to 1, the shapes from Dev\'s course.',
      },
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap {c:Am} in all three inversions on strings 4 to 2: every {n:A}, {n:C} and {n:E} up to fret 10.',
      find: { chord: 'Am' },
      mode: 'all',
      octave: 'any',
      strings: [4, 3, 2],
      frets: [0, 10],
      explain: 'Nine notes, three shapes: x-x-2-2-1-x ({c:Am/E}), x-x-7-5-5-x ({c:Am}) and x-x-10-9-10-x ({c:Am/C}).',
      fact: 'vl-triads-string-set',
    },
    {
      type: 'card',
      title: 'One set, two frets',
      body: 'Now voice-lead: one progression, one string set, no jump larger than two frets. The Canon is the classic workout. On strings 4 to 2: {c:D/A} 7-7-7, {c:A} 7-6-5, {c:Bm} 9-7-7, {c:F#m/A} 7-6-7, {c:G/B} 9-7-8, {c:D/A} 7-7-7, {c:G/B} 9-7-8, {c:A/C#} 11-9-10, landing on {c:D} 12-11-10.',
      figure: {
        kind: 'tab',
        tempo: 66,
        notes: [
          { string: 4, fret: 7, duration: 'e' },
          { string: 3, fret: 7, duration: 'e' },
          { string: 2, fret: 7, duration: 'q' },
          { string: 4, fret: 7, duration: 'e' },
          { string: 3, fret: 6, duration: 'e' },
          { string: 2, fret: 5, duration: 'q' },
          { string: 4, fret: 9, duration: 'e' },
          { string: 3, fret: 7, duration: 'e' },
          { string: 2, fret: 7, duration: 'q' },
          { string: 4, fret: 7, duration: 'e' },
          { string: 3, fret: 6, duration: 'e' },
          { string: 2, fret: 7, duration: 'q' },
        ],
        caption: 'The first four chords of the route, each picked low to high.',
      },
      tip: 'The route climbs; for the repeat, jump back to fret 7. That one jump is the price of the form.',
    },
    {
      type: 'choice',
      prompt: 'After {c:A} at x-x-7-6-5-x, which {c:Bm} keeps every voice within two frets?',
      options: [
        { text: 'x-x-9-7-7-x', correct: true },
        { text: 'x-x-4-4-3-x', why: 'A correct {c:Bm/F#}, but string 4 would move three frets.' },
        { text: 'x-x-12-11-12-x', why: 'A correct {c:Bm/D}, but far up the neck: string 2 would jump seven frets.' },
      ],
      explain: '{n:A} rises to {n:B} (two frets), {n:C#} to {n:D} (one), {n:E} to {n:F#} (two): root-position {c:Bm}, every voice by step.',
      fact: 'vl-triads-canon',
    },
    toolTask({
      id: 'jam-canon-4-2',
      title: 'Jam: the Canon on strings 4 to 2',
      tool: 'progressions',
      params: ['classical-canon', 'd', 'jam'],
      minutes: 6,
      body: 'The Canon in {k:D major} at 66 {t:bpm|BPM}, the chords of Pachelbel\'s Canon in D: the route on strings 4 to 2, one chord per bar, picked low to high. Then strum each chord once and let it ring, and listen to the three voices move.',
      tip: 'Say each chord\'s bass note aloud before you play it: root, third or fifth.',
    }),
    {
      type: 'true-false',
      statement: 'On strings 4 to 2, x-x-2-0-1-x has the third of {c:C}, {n:E}, in the bass.',
      answer: true,
      explain: 'String 4 fret 2 is {n:E}; the open {n:G} and {n:C} at string 2 fret 1 sit above it: {c:C/E}, first inversion.',
      fact: 'vl-triads-c-4-2',
    },
  ],
  facts: [
    { id: 'vl-triads-string-set', front: 'How many shapes does a triad have on one string set?', back: 'Three: root, third or fifth in the bass. Learn them as families by the bass note.' },
    { id: 'vl-triads-c-4-2', front: '{c:C} in its three inversions on strings 4 to 2?', back: 'x-x-10-9-8-x (root), x-x-2-0-1-x ({c:C/E}), x-x-5-5-5-x ({c:C/G}).' },
    { id: 'vl-triads-canon', front: 'The rule for voice-leading the Canon on one string set?', back: 'One set, no voice moving more than two frets: {c:D/A} 7-7-7, {c:A} 7-6-5, {c:Bm} 9-7-7 on strings 4 to 2.' },
  ],
};

// ── 3. Line cliches ─────────────────────────────────────────────────────────────────────────────

const lineCliches: TeacherLesson = {
  id: 'line-cliches',
  title: 'Line cliches',
  teaches: 'A line cliche holds a chord while one voice moves by half steps: {c:Am}, {c:AmMaj7}, {c:Am7}, {c:Am6}.',
  minutes: 5,
  skill: 'teacher:elena:line-cliches',
  steps: [
    {
      type: 'card',
      title: 'Hold the chord, move one voice',
      body: 'A {t:line-cliche|line cliche} holds a chord and moves one voice chromatically: {c:Am}, {c:AmMaj7}, {c:Am7}, {c:Am6}, the moving voice falling {n:A}, {n:G#}, {n:G}, {n:F#}. Nothing else changes, which is why the one voice is heard so clearly.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['Am', 'AmMaj7', 'Am7', 'Am6'], beats: 4, tempo: 66 }, label: 'Hear the minor line' },
    },
    {
      type: 'choice',
      prompt: 'Which note turns {c:Am} into {c:AmMaj7}?',
      options: [
        { text: '{n:G#}', correct: true },
        { text: '{n:G}', why: '{n:G} is the minor seventh: that makes {c:Am7}, the next chord.' },
        { text: '{n:F#}', why: '{n:F#} is the sixth: {c:Am6}, the last chord of the line.' },
        { text: '{n:B}', why: '{n:B} is the ninth, not part of the line.' },
      ],
      explain: '{n:G#} is a major seventh above {n:A}: a minor triad with a major seventh. The root, {n:A}, has stepped down a half step.',
      fact: 'vl-cliche-minor',
    },
    {
      type: 'card',
      title: 'Down string 3',
      body: 'In open position the line walks down string 3 from fret 2 to the open string, then lands on {n:F#} at the top of {c:Am6}: x02210, x02110, x02010, x02212. Let the moving voice sing; the rest of the hand barely moves.',
      figure: {
        kind: 'fretboard',
        frets: [0, 3],
        dots: [
          { string: 3, fret: 2, note: 'A3', role: 'target' },
          { string: 3, fret: 1, note: 'G#3', role: 'target' },
          { string: 3, fret: 0, note: 'G3', role: 'target' },
          { string: 1, fret: 2, note: 'F#4', role: 'target' },
        ],
        caption: 'The moving voice: {n:A}, {n:G#}, {n:G}, then {n:F#} on string 1.',
      },
    },
    {
      type: 'play-chord',
      prompt: '{c:Am}: x02210.',
      chord: 'Am',
      frets: SHAPES.cliche.Am,
      explain: 'Note the {n:A} on string 3 fret 2: that is the voice about to move.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'Am', frets: SHAPES.cliche.Am, accept: 'this-shape', prompt: 'Build open {c:Am}.', explain: 'x02210: fret 2 on strings 4 and 3, fret 1 on string 2.' },
    },
    {
      type: 'play-chord',
      prompt: '{c:AmMaj7}: x02110. String 3 down one fret.',
      chord: 'AmMaj7',
      frets: SHAPES.cliche.AmMaj7,
      explain: '{n:A} fell to {n:G#}, string 3 fret 1. It should sound tense and dark: that is the major seventh against the minor third.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'AmMaj7', frets: SHAPES.cliche.AmMaj7, accept: 'this-shape', prompt: 'Build {c:AmMaj7}: the {c:Am} grip with string 3 a fret lower.', explain: 'x02110: {n:A} {n:E} {n:G#} {n:C} {n:E}.' },
    },
    {
      type: 'play-chord',
      prompt: '{c:Am7}: x02010. String 3 open.',
      chord: 'Am7',
      frets: SHAPES.cliche.Am7,
      explain: '{n:G#} fell to the open {n:G}: the minor seventh.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'Am7', frets: SHAPES.cliche.Am7, accept: 'this-shape', prompt: 'Build open {c:Am7}.', explain: 'x02010: string 4 fret 2, string 3 open, string 2 fret 1.' },
    },
    {
      type: 'play-chord',
      prompt: '{c:Am6}: x02212. The line lands on string 1.',
      chord: 'Am6',
      frets: SHAPES.cliche.Am6,
      explain: '{n:F#} on string 1 fret 2, the sixth. String 3 is back on {n:A}, the root: the line has moved to the top.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'Am6', frets: SHAPES.cliche.Am6, accept: 'this-shape', prompt: 'Build {c:Am6}: {c:Am} with {n:F#} on string 1.', explain: 'x02212: {n:A} {n:E} {n:A} {n:C} {n:F#}.' },
    },
    {
      type: 'order',
      prompt: 'Put the moving voice of the minor line in order.',
      tiles: ['{n:A}', '{n:G#}', '{n:G}', '{n:F#}'],
      distractors: ['{n:F}', '{n:B}'],
      explain: 'Half step by half step: {n:A}, {n:G#}, {n:G}, {n:F#}. Root, major seventh, minor seventh, sixth.',
      fact: 'vl-cliche-minor',
    },
    toolTask({
      id: 'jam-line-minor',
      title: 'Jam: the minor line',
      tool: 'progressions',
      params: ['line-minor-down', 'a', 'jam'],
      minutes: 5,
      body: '{c:Am}, {c:AmMaj7}, {c:Am7}, {c:Am6} at 66 {t:bpm|BPM}, one bar each. Pick each grip low to high and lean on the moving note: it is the melody of the progression.',
    }),
    {
      type: 'card',
      title: 'The major line rises',
      body: 'The major version rises instead: {c:C}, {c:Caug}, {c:C6}, {c:C7}, the fifth climbing {n:G}, {n:G#}, {n:A}, {n:Bb}. Under the open {c:C} shape (x32010) it is string 3 again, going up: open, fret 1, fret 2, fret 3.',
      figure: {
        kind: 'fretboard',
        frets: [0, 3],
        root: 'C',
        labels: 'degree',
        dots: [
          { string: 3, fret: 0, degree: '5', role: 'target' },
          { string: 3, fret: 1, degree: '#5', role: 'target' },
          { string: 3, fret: 2, degree: '6', role: 'target' },
          { string: 3, fret: 3, degree: 'b7', role: 'target' },
        ],
        caption: 'Over {c:C}: the fifth, raised fifth, sixth, flat seventh.',
      },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the rising line of {c:C}, {c:Caug}, {c:C6}, {c:C7}.',
      text: '{n:G}  ___  {n:A}  ___',
      blanks: ['{n:G#}', '{n:Bb}'],
      bank: ['{n:F#}', '{n:B}'],
      explain: 'Half steps up from the fifth: {n:G}, {n:G#} (the augmented fifth), {n:A} (the sixth), {n:Bb} (the flat seventh).',
      fact: 'vl-cliche-major',
    },
    toolTask({
      id: 'jam-line-major',
      title: 'Jam: the major line',
      tool: 'progressions',
      params: ['line-major-up', 'c', 'jam'],
      minutes: 5,
      body: '{c:C}, {c:Caug}, {c:C6}, {c:C7} at 66 {t:bpm|BPM}. Hold the {c:C} shape and walk string 3 up, open to fret 3: {n:G}, {n:G#}, {n:A}, {n:Bb}. Then find the same climb one octave up, on string 1 from fret 3.',
      tip: 'Make the moving note the top of every strum, so the climb is heard.',
    }),
    {
      type: 'true-false',
      statement: 'In a line cliche the whole chord slides down a fret at a time.',
      answer: false,
      explain: 'Only one voice moves; the rest of the chord holds still. That contrast is the whole effect.',
      fact: 'vl-cliche-def',
    },
  ],
  facts: [
    { id: 'vl-cliche-def', front: 'What is a line cliche?', back: 'A chord held while one voice moves by half steps.' },
    { id: 'vl-cliche-minor', front: 'The minor line cliche in A, open position?', back: '{c:Am} x02210, {c:AmMaj7} x02110, {c:Am7} x02010, {c:Am6} x02212: {n:A} {n:G#} {n:G} {n:F#}.' },
    { id: 'vl-cliche-major', front: 'The major line cliche on {c:C}?', back: '{c:C}, {c:Caug}, {c:C6}, {c:C7}: the fifth rises {n:G}, {n:G#}, {n:A}, {n:Bb}.' },
  ],
};

// ── 4. Chord melody ─────────────────────────────────────────────────────────────────────────────

const chordMelody1: TeacherLesson = {
  id: 'chord-melody-1',
  title: 'Chord melody',
  teaches: 'In chord melody the tune is always the top note, with the chord built beneath it on the strong beats.',
  minutes: 5,
  skill: 'teacher:elena:chord-melody-1',
  steps: [
    {
      type: 'card',
      title: 'Tune and harmony at once',
      body: '{t:chord-melody|Chord melody} plays the tune and its harmony together. Put the melody note on the highest string you are using, build the chord beneath it on the strong beats, and between them let the melody run alone. Here is the First Ballad\'s opening tune.',
      figure: { kind: 'tab', tempo: 66, notes: [...BALLAD_TUNE], caption: 'Bars 1 and 2: a chord sits under the first note of each half bar.' },
    },
    {
      type: 'choice',
      prompt: 'Where does the melody note go in a chord-melody voicing?',
      options: [
        { text: 'On top: the highest note', correct: true },
        { text: 'In the bass', why: 'The bass is the chord\'s foundation. A tune down there is a bass line, not a melody.' },
        { text: 'Anywhere, if it is in the chord', why: 'Inside the chord the tune is lost. It must be the highest note.' },
      ],
      explain: 'The melody must always be the highest and loudest note. Everything else sits beneath it.',
      fact: 'vl-cm-rule',
    },
    {
      type: 'card',
      title: 'Choose by the top note',
      body: 'So choose each voicing by its top note, not by habit. In the First Ballad: {c:C} x32013 has {n:G} on top, {c:Am} x07555 has {n:A}, {c:F} xx3211 has {n:F}, {c:G7} 32303x has {n:D}. Four chords, four different melody notes.',
      figure: { kind: 'chord', symbol: 'C', frets: SHAPES.ballad.C, caption: '{c:C} with {n:G} on top: the open shape plus string 1 fret 3.' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each grip of the First Ballad with its top note.',
      pairs: [
        { left: '{c:C} x32013', right: '{n:G}' },
        { left: '{c:Am} x07555', right: '{n:A}' },
        { left: '{c:F} xx3211', right: '{n:F}' },
        { left: '{c:G7} 32303x', right: '{n:D}' },
      ],
      explain: 'String 1 fret 3 is {n:G}, fret 5 {n:A}, fret 1 {n:F}; in {c:G7} 32303x string 1 is silent and string 2 fret 3, {n:D}, is the top.',
      fact: 'vl-cm-top-notes',
    },
    {
      type: 'play-chord',
      prompt: '{c:C} with {n:G} on top: x32013.',
      chord: 'C',
      frets: SHAPES.ballad.C,
      explain: 'Pluck the bass with the thumb and the rest together, string 1 a little louder: the {n:G} is the tune.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'C', frets: SHAPES.ballad.C, accept: 'this-shape', prompt: 'Build {c:C} with {n:G} on top.', explain: 'x32013: open {c:C} with the little finger on string 1 fret 3.' },
    },
    {
      type: 'play-chord',
      prompt: '{c:Am} with {n:A} on top: x07555.',
      chord: 'Am',
      frets: SHAPES.ballad.Am,
      explain: 'The top {n:A} must ring over the barre. If it is swallowed, play it a touch harder than the rest.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'Am', frets: SHAPES.ballad.Am, accept: 'this-shape', prompt: 'Build {c:Am} with {n:A} on top, in fifth position.', explain: 'x07555: open {n:A}, fret 7 on string 4, fret 5 on strings 3 to 1.' },
    },
    {
      type: 'play-chord',
      prompt: '{c:F} with {n:F} on top: xx3211.',
      chord: 'F',
      frets: SHAPES.ballad.F,
      explain: 'The small {c:F}: {n:F} {n:A} {n:C} {n:F}, the melody on string 1 fret 1.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'F', frets: SHAPES.ballad.F, accept: 'this-shape', prompt: 'Build the small {c:F}, {n:F} on top.', explain: 'xx3211: string 4 fret 3, string 3 fret 2, strings 2 and 1 at fret 1.' },
    },
    {
      type: 'play-chord',
      prompt: '{c:G7} with {n:D} on top: 32303x, string 1 silent.',
      chord: 'G7',
      frets: SHAPES.ballad.G7,
      explain: '{n:G} {n:B} {n:F} {n:G} {n:D}: the melody is {n:D} on string 2. Touch string 1 with the underside of a finger to keep it quiet.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'G7', frets: SHAPES.ballad.G7, accept: 'this-shape', prompt: 'Build {c:G7} with {n:D} on top, string 1 muted.', explain: '32303x: fret 3 on strings 6, 4 and 2, fret 2 on string 5, string 3 open.' },
    },
    playerTask({
      id: 'ballad-wait',
      title: 'Chord Melody: First Ballad, wait mode',
      song: 'st-chord-melody-1',
      mode: 'wait',
      minutes: 6,
      body: 'The whole study in wait mode. First the top notes alone, hummed; then the chords beneath, string 1 a little louder than the rest.',
    }),
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'Am',
      frets: SHAPES.ballad.Am,
      accept: 'this-shape',
      prompt: 'The melody note is {n:A}, string 1 fret 5; the chord is {c:Am}. Build the study\'s grip beneath it, in fifth position over the open {n:A} string.',
      explain: 'x07555: the open {n:A} in the bass, then {n:A}, {n:C}, {n:E}, and {n:A} on top. Finger 1 lies across strings 3 to 1 at fret 5.',
    },
    playerTask({
      id: 'ballad-60',
      title: 'Chord Melody: First Ballad, in time',
      song: 'st-chord-melody-1',
      tempo: 91,
      minutes: 5,
      body: 'Now in time, at 91 % (60 {t:bpm|BPM}). In bars 2, 6 and 14 the hand moves to fifth position for the {c:Am} with {n:A} on top: hold the long note, then come straight back down.',
    }),
    playerTask({
      id: 'danny-boy',
      title: 'Danny Boy (chord melody)',
      song: 'danny-boy-chord-melody',
      mode: 'wait',
      bars: [1, 8],
      minutes: 8,
      body: 'The Londonderry Air as chord melody: the first 8 bars in wait mode, then the whole piece at about 54 BPM with {t:rubato}, stretching the top of each phrase. The melody stays on top.',
      fallback: {
        tool: 'player',
        params: ['greensleeves-fingerstyle', 'wait'],
        title: 'A traditional air, melody on top',
        body: 'Danny Boy is not in the Songs library yet. Take Greensleeves (fingerstyle) instead, in wait mode: the tune on top, the bass and chord notes beneath. Then play it through with gentle {t:rubato}, the melody always the loudest voice.',
      },
    }),
    {
      type: 'choice',
      prompt: 'Between the strong beats, what happens to the chord in chord melody?',
      options: [
        { text: 'The melody runs on alone', correct: true },
        { text: 'A new chord under every note', why: 'Too heavy, and unplayable at tempo. Chords go on the strong beats.' },
        { text: 'The bass takes the tune', why: 'The tune stays on top throughout.' },
      ],
      explain: 'Chords under the melody\'s strong beats; between them, single notes. The ear fills in the harmony.',
      fact: 'vl-cm-strong-beats',
    },
  ],
  facts: [
    { id: 'vl-cm-rule', front: 'The one rule of chord melody?', back: 'The melody is always the highest and loudest note: choose each voicing by its top note.' },
    { id: 'vl-cm-strong-beats', front: 'Where do the chords go in chord melody?', back: 'Under the melody\'s notes on the strong beats; between them the melody runs alone.' },
    { id: 'vl-cm-top-notes', front: 'Top notes of the First Ballad\'s {c:C} x32013, {c:Am} x07555, {c:F} xx3211, {c:G7} 32303x?', back: '{n:G}, {n:A}, {n:F}, {n:D}.' },
  ],
};

// ── 5. Reharmonisation ──────────────────────────────────────────────────────────────────────────

const reharmonisation: TeacherLesson = {
  id: 'reharmonisation',
  title: 'Reharmonisation',
  teaches: 'Keep the melody, change the chords: a secondary dominant before a chord, a tritone substitute for a dominant.',
  minutes: 5,
  skill: 'teacher:elena:reharmonisation',
  steps: [
    {
      type: 'card',
      title: 'Same tune, new chords',
      body: '{t:reharmonisation|Reharmonising} keeps the melody and changes the chords under it. Here is an original eight-bar phrase in {k:F major}, two bars to each chord: {c:Fmaj7}, {c:Dm7}, {c:Gm7}, {c:C7}. Read the melody first; it will not change.',
      figure: { kind: 'staff', key: 'F major', time: '4/4', notes: [...PHRASE_MELODY], caption: 'The melody. The chords change on bars 1, 3, 5 and 7.' },
    },
    {
      type: 'choice',
      prompt: 'In {k:F major}, which chord is the {t:secondary-dominant|secondary dominant} of {c:Gm7}?',
      options: [
        { text: '{c:D7}', correct: true },
        { text: '{c:C7}', why: 'That is the key\'s own dominant: it leads to {c:F}, not to {c:Gm7}.' },
        { text: '{c:A7}', why: '{c:A7} is the {r:V} of {n:D}: it leads to {c:Dm7}.' },
        { text: '{c:Db7}', why: 'That is the tritone substitute of {c:G7}, a different move.' },
      ],
      explain: '{c:D7} is the {r:V} of {n:G}, so it pulls to {c:Gm7}: {r:V7/ii}. Its {n:F#} leads up a half step to {n:G}.',
      fact: 'vl-reharm-secondary',
    },
    {
      type: 'card',
      title: 'Two dependable moves',
      body: 'One: a secondary dominant before a diatonic chord, {c:D7} for {c:Dm7}. Two: the {t:tritone-substitution|tritone substitution}, the dominant a tritone away, {c:Gb7} for {c:C7}. {c:C7} has {n:E} and {n:Bb}; {c:Gb7} has the same two pitches, spelled {n:Fb} and {n:Bb}.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['Fmaj7', 'D7', 'Gm7', 'Gb7', 'Fmaj7'], beats: 4, tempo: 72 }, label: 'Hear it reharmonised' },
    },
    {
      type: 'listen-choice',
      prompt: 'Plain or reharmonised?',
      sound: { kind: 'progression', chords: ['Fmaj7', 'D7', 'Gm7', 'Gb7'], beats: 4, tempo: 72 },
      options: [
        { text: 'Plain: {c:Dm7} and {c:C7}' },
        { text: 'Reharmonised: {c:D7} and {c:Gb7}', correct: true },
      ],
      shuffle: false,
      explain: 'The second chord was major ({c:D7}, with {n:F#}), and the fourth, {c:Gb7}, sat a half step above home instead of a fifth.',
    },
    {
      type: 'listen-choice',
      prompt: 'One chord of the plain phrase has been changed. Which?',
      sound: { kind: 'progression', chords: ['Fmaj7', 'Dm7', 'Gm7', 'Gb7'], beats: 4, tempo: 72 },
      options: [
        { text: 'The second: {c:D7} for {c:Dm7}' },
        { text: 'The fourth: {c:Gb7} for {c:C7}', correct: true },
        { text: 'The third: {c:G7} for {c:Gm7}' },
      ],
      explain: '{c:Dm7} stayed minor; the last chord was {c:Gb7}. Listen to the bass: it fell only a half step, {n:G} to {n:Gb}, where {c:C7} would have dropped to {n:C}.',
    },
    {
      type: 'choice',
      prompt: 'Which chord is the tritone substitute of {c:G7}?',
      options: [
        { text: '{c:Db7}', correct: true },
        { text: '{c:D7}', why: 'That is the {r:V} of {c:G7}, not its substitute.' },
        { text: '{c:C7}', why: 'A fifth below {n:G}, not a tritone.' },
        { text: '{c:Ab7}', why: 'A half step up, not a tritone. {c:Ab7} substitutes for {c:D7}.' },
      ],
      explain: '{n:G} up a tritone is {n:Db}. {c:G7} has {n:B} and {n:F}; {c:Db7} has {n:F} and {n:Cb}: the same tritone, its two notes swapping roles.',
      fact: 'vl-reharm-tritone',
    },
    {
      type: 'card',
      title: 'Test against the melody',
      body: 'Test every new chord against the melody note: if it clashes, it is wrong, however clever it looks. In bars 3 and 4 the melody has {n:C}, {n:A} and {n:D}, all in {c:D7}; an {n:F} there would clash with its {n:F#}. In bars 7 and 8, {n:Bb} and {n:E} belong to both {c:C7} and {c:Gb7}.',
      figure: { kind: 'chord', symbol: 'Gb7', frets: SHAPES.phrase.Gb7, caption: '{c:Gb7} in drop-2, xx4656: {n:Gb} {n:Db} {n:Fb} {n:Bb}, {n:Bb} on top.' },
    },
    {
      type: 'true-false',
      statement: 'Over {c:Gb7}, the melody\'s {n:E} in bar 7 is the chord\'s seventh, spelled {n:Fb}.',
      answer: true,
      explain: '{c:Gb7} is {n:Gb} {n:Bb} {n:Db} {n:Fb}. {n:Fb} sounds as {n:E}: over {c:C7} it was the third, over {c:Gb7} it is the seventh.',
      fact: 'vl-reharm-tritone',
    },
    playerTask({
      id: 'study-two-moves',
      title: 'Both moves in the Jazz Ballad',
      song: 'st-chord-melody-2',
      bars: [25, 32],
      tempo: 93,
      minutes: 4,
      body: 'The Jazz Ballad\'s last A section, bars 25 to 32, at 93 % (56 {t:bpm|BPM}): {c:D7} for {c:Dm7} in bar 26, {c:Gb7} for {c:C7} in bar 31. The tune does not change; listen to the colour under it.',
    }),
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'Gb7',
      frets: SHAPES.subJam.Gb7,
      accept: 'this-shape',
      prompt: 'From unit 5\'s drop-2 {c:C7} (xx8988), keep {n:Bb} and {n:E}, move string 2 down a fret and string 1 up a fret: build {c:Gb7}.',
      explain: 'xx8979: {n:Bb}, {n:Fb}, {n:Gb}, {n:Db}. Two notes kept, two moved a half step, {n:G} down to {n:Gb} and {n:C} up to {n:Db}: that is all a tritone substitution costs.',
    },
    toolTask({
      id: 'jam-tritone-sub',
      title: 'Jam: the tritone substitution',
      tool: 'progressions',
      params: ['jazz-tritone-sub', 'f', 'jam'],
      minutes: 6,
      body: '{c:Gm7}, {c:Gb7}, {c:Fmaj7} in {k:F major} at 100 {t:bpm|BPM}, comped in drop-2: x-x-8-10-8-10, xx8979, xx7968. No voice moves more than a fret. Short chords, four to the bar; then the Charleston.',
      tip: 'Hear the bass fall {n:G}, {n:Gb}, {n:F}: the substitute turns the root movement into a half step.',
    }),
    {
      type: 'match-pairs',
      prompt: 'Match each dominant with its tritone substitute.',
      pairs: [
        { left: '{c:C7}', right: '{c:Gb7}' },
        { left: '{c:G7}', right: '{c:Db7}' },
        { left: '{c:D7}', right: '{c:Ab7}' },
        { left: '{c:A7}', right: '{c:Eb7}' },
      ],
      explain: 'Each root moves a tritone, six half steps. Third and seventh trade places: {c:C7}\'s {n:E} and {n:Bb} are {c:Gb7}\'s {n:Fb} and {n:Bb}.',
      fact: 'vl-reharm-tritone',
    },
  ],
  facts: [
    { id: 'vl-reharm-rule', front: 'What does reharmonising keep, and what does it change?', back: 'It keeps the melody and changes the chords. Test every new chord against the melody note.' },
    { id: 'vl-reharm-secondary', front: 'In {k:F major}, which chord leads to {c:Gm7}, and why?', back: '{c:D7}: it is the {r:V} of {n:G}, {r:V7/ii}.' },
    { id: 'vl-reharm-tritone', front: 'Why can {c:Gb7} replace {c:C7}?', back: 'They share their tritone: {n:E} and {n:Bb} in {c:C7}, {n:Fb} and {n:Bb} in {c:Gb7}. The roots are a tritone apart.' },
  ],
};

// ── 6. A jazz-ballad arrangement ────────────────────────────────────────────────────────────────

const chordMelody2: TeacherLesson = {
  id: 'chord-melody-2',
  title: 'A jazz-ballad arrangement',
  teaches: 'A full chord-melody arrangement: AABA form, a contrasting B section, the melody singing over the harmony.',
  minutes: 5,
  skill: 'teacher:elena:chord-melody-2',
  steps: [
    {
      type: 'card',
      title: 'A full arrangement',
      body: 'Chord Melody: Jazz Ballad with Reharmonisation is an original 32-bar {t:aaba|AABA} ballad in {k:F major} on {c:Fmaj7}, {c:Dm7}, {c:Gm7} and {c:C7}, with a {c:D7} leading to {c:Gm7} and {c:Gb7} in place of {c:C7}: the two moves of the last lesson. Its bridge adds {c:A7} and {c:G7}.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['Fmaj7', 'D7', 'Gm7', 'Gb7', 'Fmaj7'], beats: 4, tempo: 60 }, label: 'The reharmonised bars' },
    },
    {
      type: 'order',
      prompt: 'Put the four sections of a 32-bar AABA tune in order.',
      tiles: ['A: bars 1-8', 'A: bars 9-16', 'B: bars 17-24', 'A: bars 25-32'],
      distractors: ['B: bars 9-16'],
      explain: 'Eight bars each: the theme, the theme again, a contrasting bridge, and the theme to close.',
      fact: 'vl-aaba',
    },
    {
      type: 'card',
      title: 'The B section must contrast',
      body: 'Take the voicings higher or thinner there: three strings instead of four, or grips higher on the neck. Balance is the test: the melody sings and the harmony sits beneath it, quieter, in every bar.',
    },
    {
      type: 'play-phrase',
      prompt: 'First the melody alone, as a singer would: the phrase from the last lesson, on strings 1 and 2.',
      notes: [...PHRASE_TAB],
      octave: 'exact',
      tempo: 66,
      explain: '{n:C} {n:A} {n:G} {n:E}, {n:C} {n:A} {n:D}, {n:Bb} {n:G} {n:D} {n:C}, {n:Bb} {n:E} {n:Bb}: every note sits under the hand of the drop-2 grips, frets 5 to 10.',
      alternative: {
        type: 'order',
        prompt: 'Put the notes on beat 1 of bars 1, 3, 5 and 7 in order: the melody the grips carry on top.',
        tiles: ['{n:C}', '{n:C}', '{n:Bb}', '{n:Bb}'],
        distractors: ['{n:A}', '{n:B}'],
        explain: '{n:C}, {n:C}, {n:Bb}, {n:Bb}, landing on {n:A} with {c:Fmaj7}: the top voice of every grip in the phrase.',
      },
    },
    {
      type: 'card',
      title: 'Melody on top of every grip',
      body: 'In drop-2 on strings 4 to 1 the reharmonised bars are {c:D7} xx7778, {c:Gm7} xx5766, {c:Gb7} xx4656 and {c:Fmaj7} xx3555. Their top voice is the melody, {n:C}, {n:Bb}, {n:Bb}, {n:A}, and the inner voices move by half and whole steps.',
      figure: { kind: 'chord', symbol: 'D7', frets: SHAPES.phrase.D7, caption: '{c:D7} in drop-2, {n:C} on top.' },
    },
    {
      type: 'play-chord',
      prompt: '{c:D7}: xx7778. The melody note {n:C} on top.',
      chord: 'D7',
      frets: SHAPES.phrase.D7,
      explain: '{n:A} {n:D} {n:F#} {n:C}, low to high. From {c:Fmaj7} xx7968 only two notes moved: {n:E} to {n:D}, {n:F} to {n:F#}.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'D7', frets: SHAPES.phrase.D7, accept: 'this-shape', prompt: 'Build drop-2 {c:D7} with {n:C} on top.', explain: 'xx7778: fret 7 on strings 4, 3 and 2, fret 8 on string 1.' },
    },
    {
      type: 'play-chord',
      prompt: '{c:Gm7}: xx5766. {n:Bb} on top.',
      chord: 'Gm7',
      frets: SHAPES.phrase.Gm7,
      explain: '{n:G} {n:D} {n:F} {n:Bb}: {n:A} fell to {n:G}, {n:F#} to {n:F}, {n:C} to {n:Bb}; {n:D} held.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'Gm7', frets: SHAPES.phrase.Gm7, accept: 'this-shape', prompt: 'Build drop-2 {c:Gm7} with {n:Bb} on top.', explain: 'xx5766: string 4 fret 5, string 3 fret 7, strings 2 and 1 at fret 6.' },
    },
    {
      type: 'play-chord',
      prompt: '{c:Gb7}: xx4656. Three voices slide down one fret; the top holds.',
      chord: 'Gb7',
      frets: SHAPES.phrase.Gb7,
      explain: '{n:Gb} {n:Db} {n:Fb} {n:Bb}: {n:G}, {n:D} and {n:F} each fell a half step, {n:Bb} stayed.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'Gb7', frets: SHAPES.phrase.Gb7, accept: 'this-shape', prompt: 'Build drop-2 {c:Gb7}: the {c:Gm7} grip with strings 4, 3 and 2 a fret lower.', explain: 'xx4656: {n:Gb} {n:Db} {n:Fb} {n:Bb}.' },
    },
    {
      type: 'play-chord',
      prompt: '{c:Fmaj7}: xx3555. Home, with {n:A} on top.',
      chord: 'Fmaj7',
      frets: SHAPES.phrase.Fmaj7Home,
      explain: '{n:F} {n:C} {n:E} {n:A}: three voices fell a half step again, and {n:Fb} became {n:E} without moving at all.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'Fmaj7', frets: SHAPES.phrase.Fmaj7Home, accept: 'this-shape', prompt: 'Build drop-2 {c:Fmaj7} with {n:A} on top.', explain: 'xx3555: string 4 fret 3, strings 3, 2 and 1 at fret 5.' },
    },
    playerTask({
      id: 'ballad-sections',
      title: 'The Jazz Ballad, A then B',
      song: 'st-chord-melody-2',
      mode: 'wait',
      bars: [1, 8],
      minutes: 8,
      body: 'The first A section, bars 1 to 8, in wait mode. Then the bridge, bars 17 to 24, through three secondary dominants, {c:A7}, {c:D7} and {c:G7}: make it contrast, lighter in touch, the melody louder than the grips.',
      fallback: {
        tool: 'player',
        params: ['st-chord-melody-1', 'wait'],
        title: 'The First Ballad: phrase and bridge',
        body: 'The Jazz Ballad is not in the Songs library yet. Take the First Ballad in wait mode, and compare its first phrase, bars 1 to 4, with its bridge, bars 9 to 12: different chords, the melody on top throughout.',
      },
    }),
    {
      type: 'true-false',
      statement: 'A voicing whose top note is not the melody note is fine, as long as the chord is right.',
      answer: false,
      explain: 'The right chord with the wrong top note changes the tune. In chord melody the top voice is the melody, always.',
      fact: 'vl-b-section',
    },
    playerTask({
      id: 'ballad-whole',
      title: 'The Jazz Ballad, all 32 bars',
      song: 'st-chord-melody-2',
      tempo: 93,
      minutes: 10,
      body: 'All 32 bars at 93 % (56 {t:bpm|BPM}), then 100 % (60 BPM). Then record yourself on your phone and listen as I would: is the melody on top, and do the voices move cleanly through {c:D7} and {c:Gb7}?',
      fallback: {
        tool: 'progressions',
        params: ['jazz-tritone-sub', 'f', 'jam'],
        title: 'The reharmonised bars with the band',
        body: 'The Jazz Ballad is not in the Songs library yet. Set this jam to 60 BPM and play the phrase as chord melody over it: a grip on beat 1 of each new chord, the melody alone between. Record it and listen for the melody on top.',
      },
    }),
    {
      type: 'choice',
      prompt: 'Your B section sounds like the A section played again. What do you change first?',
      options: [
        { text: 'The voicings: higher or thinner', correct: true },
        { text: 'The melody', why: 'The melody is the composer\'s. The arranger changes what sits under it.' },
        { text: 'The tempo, much faster', why: 'A ballad\'s bridge keeps the tempo. Contrast comes from colour and register.' },
      ],
      explain: 'Contrast in an arrangement comes from register and texture: lift the grips up the neck or drop a voice, and the bridge sounds new.',
      fact: 'vl-b-section',
    },
  ],
  facts: [
    { id: 'vl-aaba', front: 'What is 32-bar AABA form?', back: 'Four 8-bar sections: a theme, the theme again, a contrasting bridge (B), and the theme to close.' },
    { id: 'vl-b-section', front: 'How does a chord-melody arrangement make its B section contrast?', back: 'Higher or thinner voicings, with the melody still on top and louder than the harmony.' },
    { id: 'vl-reharm-drop2', front: 'The reharmonised bars in drop-2, strings 4 to 1?', back: '{c:D7} xx7778, {c:Gm7} xx5766, {c:Gb7} xx4656, {c:Fmaj7} xx3555: the top voice sings {n:C} {n:Bb} {n:Bb} {n:A}.' },
  ],
};

/** Unit 6 of Prof. Varga's course. */
const unit: TeacherUnit = {
  id: 'elena-voice-leading',
  title: 'Voice leading and chord melody',
  theme: 'harmony',
  description: 'Connect chords by the smallest steps: inversions, triads on every string set, line cliches, chord melody and reharmonisation.',
  lessons: [voiceLeadingPrinciples, triadsAcrossStringSets, lineCliches, chordMelody1, reharmonisation, chordMelody2],
  checkpoint: { sample: 8, maxMistakes: 2 },
  glossary: [
    { id: 'voice-leading', term: 'voice leading', definition: 'Moving from chord to chord as if each note were a singer: keep shared notes, move the others by the smallest step.' },
    { id: 'common-tone', term: 'common tone', definition: 'A note that two neighbouring chords share. Good voice leading keeps it in the same voice.' },
    { id: 'contrary-motion', term: 'contrary motion', definition: 'Two voices moving in opposite directions, one up while the other goes down.' },
    { id: 'string-set', term: 'string set', definition: 'A group of neighbouring strings used for a chord shape, such as strings 4 to 2 or 3 to 1.' },
    { id: 'line-cliche', term: 'line cliche', definition: 'A chord held while one of its voices moves by half steps, as in {c:Am}, {c:AmMaj7}, {c:Am7}, {c:Am6}.' },
    { id: 'chord-melody', term: 'chord melody', definition: 'Playing a tune and its harmony at once, the melody always the highest note.' },
    { id: 'rubato', term: 'rubato', definition: 'Stretching the time of a phrase for expression and giving it back after, so the music breathes.' },
    { id: 'reharmonisation', term: 'reharmonisation', definition: 'Keeping a melody but changing the chords beneath it.' },
    { id: 'secondary-dominant', term: 'secondary dominant', definition: 'The dominant of a chord other than the tonic, placed before it: {c:D7} before {c:Gm7} in {k:F major}.' },
    { id: 'tritone-substitution', term: 'tritone substitution', definition: 'Replacing a dominant seventh with the dominant seventh a tritone away, which shares its third and seventh.' },
    { id: 'aaba', term: 'AABA', definition: 'A 32-bar song form: an 8-bar theme, its repeat, a contrasting 8-bar bridge, and the theme again.' },
  ],
};

export default unit;
