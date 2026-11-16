/**
 * Prof. Elena Varga, unit 7: Arpeggios and playing the changes (plan:
 * `elena/elena-playing-the-changes` in src/content/plan/teachers.json).
 *
 * Elena's voice: conservatory rigour, dry humour, high standards, deep respect for the student.
 * Every lesson follows its plan entry: the `explain` on the cards, the `show` as fretboards with
 * each tone labelled by its degree, staff and tab, the `practice` as in-lesson exercises (every
 * line the microphone hears has a tapping alternative) or tasks that send the learner to the
 * Player, the jam tracks of Progressions, Ear Training and Scales, and back.
 *
 * Where the lessons differ from the plan (see the report): the plan's "without a microphone: the
 * Player in wait mode" is an in-lesson exercise instead, since wait mode listens too. The example
 * lines of the horizontal/vertical and outside lessons are original and played in the lesson (tab
 * with sound at 80 BPM), and the Player task of the horizontal/vertical lesson uses the vertical
 * tune of the arpeggio study, bars 9 to 16. The altered dominant's "G7alt drone" is the Scales
 * screen's band, which vamps G7alt under the altered scale. The ii-V-I jam's catalog range starts
 * at 100 BPM; the plan's 96 and 92 are inside what the jam screen plays (its swing style goes down
 * to 90), and the test holds them to it.
 *
 * Music from the library: Seventh-Chord Arpeggios in C (`st-arpeggio-sevenths`, 104 BPM).
 * `elena-playing-the-changes.test.ts` cross-checks every arpeggio, line, enclosure, degree,
 * substitute, tension, tempo and chart against the engines and the library.
 */
import type { TabNote } from '@/lessons';
import type { TeacherLesson, TeacherUnit } from '../types';
import { playerTask, toolTask } from '../tasks';

const e = (string: number, fret: number): TabNote => ({ string, fret, duration: 'e' });
const q = (string: number, fret: number): TabNote => ({ string, fret, duration: 'q' });
const h = (string: number, fret: number): TabNote => ({ string, fret, duration: 'h' });
const w = (string: number, fret: number): TabNote => ({ string, fret, duration: 'w' });

/** The three ii-V-I arpeggios in fifth position, root to octave and back (as in the study). */
export const ARPEGGIOS: Record<'Dm7' | 'G7' | 'Cmaj7', TabNote[]> = {
  Dm7: [e(5, 5), e(5, 8), e(4, 7), e(3, 5), e(3, 7), e(3, 5), e(4, 7), e(5, 8), q(5, 5)],
  G7: [e(4, 5), e(3, 4), e(3, 7), e(2, 6), e(2, 8), e(2, 6), e(3, 7), e(3, 4), q(4, 5)],
  Cmaj7: [e(6, 8), e(5, 7), e(4, 5), e(3, 4), e(3, 5), e(3, 4), e(4, 5), e(5, 7), q(6, 8)],
};

/** Two original lines over Dm7 | G7 | Cmaj7 | Cmaj7: one scale throughout, or each chord's own tones. */
export const LINES: Record<'horizontal' | 'vertical', TabNote[]> = {
  horizontal: [q(5, 5), q(5, 7), q(5, 8), q(4, 5), q(4, 7), q(3, 4), q(3, 5), q(3, 7), q(2, 5), q(3, 7), q(3, 5), q(3, 4), w(3, 5)],
  vertical: [q(5, 5), q(5, 8), q(4, 7), q(3, 5), q(3, 4), q(3, 7), q(2, 8), q(2, 6), q(2, 5), q(3, 5), q(3, 4), q(4, 5), w(5, 7)],
};

/** Approaches and enclosures into the thirds: E of Cmaj7, B of G7, F of Dm7. */
export const ENCLOSURES: Record<'approachE' | 'intoE' | 'approachB' | 'intoB' | 'intoF', TabNote[]> = {
  approachE: [e(2, 4), h(2, 5)],
  intoE: [e(2, 6), e(2, 4), h(2, 5)],
  approachB: [e(3, 3), h(3, 4)],
  intoB: [e(3, 5), e(3, 3), h(3, 4)],
  intoF: [e(2, 8), e(2, 5), h(2, 6)],
};

/** The arpeggios a third up: Fmaj7 over Dm7, Bm7b5 over G7, Em7 over Cmaj7, up and back. */
export const THIRD_UP: Record<'Fmaj7' | 'Bm7b5' | 'Em7', TabNote[]> = {
  Fmaj7: [e(5, 8), e(4, 7), e(3, 5), e(2, 5), e(3, 5), e(4, 7), q(5, 8)],
  Bm7b5: [e(3, 4), e(3, 7), e(2, 6), e(1, 5), e(2, 6), e(3, 7), q(3, 4)],
  Em7: [e(5, 7), e(4, 5), e(3, 4), e(3, 7), e(3, 4), e(4, 5), q(5, 7)],
};

/** G altered in third position (the engine's E shape, frets 2 to 6), each note with its role over G7. */
export const G_ALTERED = [
  { string: 6, fret: 3, degree: '1' }, { string: 6, fret: 4, degree: 'b9' }, { string: 6, fret: 6, degree: '#9' },
  { string: 5, fret: 2, degree: '3' }, { string: 5, fret: 4, degree: 'b5' }, { string: 5, fret: 6, degree: 'b13' },
  { string: 4, fret: 3, degree: 'b7' }, { string: 4, fret: 5, degree: '1' }, { string: 4, fret: 6, degree: 'b9' },
  { string: 3, fret: 3, degree: '#9' }, { string: 3, fret: 4, degree: '3' }, { string: 3, fret: 6, degree: 'b5' },
  { string: 2, fret: 4, degree: 'b13' }, { string: 2, fret: 6, degree: 'b7' },
  { string: 1, fret: 3, degree: '1' }, { string: 1, fret: 4, degree: 'b9' }, { string: 1, fret: 6, degree: '#9' },
] as const;

/** The outside lines: a side-slip over Am7, and the Db7 arpeggio over G7 into Cmaj7. */
export const OUTSIDE: Record<'sideSlip' | 'db7', TabNote[]> = {
  sideSlip: [e(1, 5), e(2, 8), q(2, 5), e(1, 6), e(2, 9), q(2, 6), e(1, 5), e(2, 8), q(2, 5), h(3, 7)],
  db7: [e(5, 4), e(5, 8), e(4, 6), e(3, 4), h(3, 5)],
};

// ── 1. Seventh-chord arpeggios ──────────────────────────────────────────────────────────────────

const seventhArpeggios: TeacherLesson = {
  id: 'seventh-arpeggios',
  title: 'Seventh-chord arpeggios',
  teaches: 'Run each diatonic seventh of {k:C major} as an arpeggio in fifth position: the shortest path from chords to lines.',
  minutes: 5,
  skill: 'teacher:elena:seventh-arpeggios',
  steps: [
    {
      type: 'card',
      title: 'From chords to lines',
      body: 'Arpeggios are the shortest path from chords to lines. In fifth position, run each diatonic seventh of {k:C major} up and down, from the root to the octave and back. {c:Dm7}: {n:D} {n:F} {n:A} {n:C}.',
      figure: {
        kind: 'fretboard',
        frets: [4, 8],
        root: 'D',
        labels: 'degree',
        dots: [
          { string: 5, fret: 5, degree: '1', role: 'root' },
          { string: 5, fret: 8, degree: 'b3', role: 'third' },
          { string: 4, fret: 7, degree: '5', role: 'fifth' },
          { string: 3, fret: 5, degree: 'b7', role: 'seventh' },
          { string: 3, fret: 7, degree: '1', role: 'root' },
        ],
        caption: '{c:Dm7} in fifth position: root, third, fifth, seventh, root.',
      },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each seventh chord of {k:C major} with its notes.',
      pairs: [
        { left: '{c:Em7}', right: '{n:E} {n:G} {n:B} {n:D}' },
        { left: '{c:Fmaj7}', right: '{n:F} {n:A} {n:C} {n:E}' },
        { left: '{c:Am7}', right: '{n:A} {n:C} {n:E} {n:G}' },
        { left: '{c:Bm7b5}', right: '{n:B} {n:D} {n:F} {n:A}' },
      ],
      explain: 'Each stacks thirds from the scale: every other letter from the root. No sharps, no flats: they are all {k:C major}.',
      fact: 'sevenths-c',
    },
    {
      type: 'card',
      title: 'Seven chords, one position',
      body: '{c:Cmaj7} {n:C} {n:E} {n:G} {n:B}, {c:Dm7} {n:D} {n:F} {n:A} {n:C}, {c:Em7}, {c:Fmaj7}, {c:G7} {n:G} {n:B} {n:D} {n:F}, {c:Am7}, {c:Bm7b5}. All seven lie under the hand in fifth position, finger 1 at fret 5 and reaching back to fret 4 for {n:B}.',
      figure: {
        kind: 'fretboard',
        frets: [4, 8],
        root: 'G',
        labels: 'degree',
        dots: [
          { string: 4, fret: 5, degree: '1', role: 'root' },
          { string: 3, fret: 4, degree: '3', role: 'third' },
          { string: 3, fret: 7, degree: '5', role: 'fifth' },
          { string: 2, fret: 6, degree: 'b7', role: 'seventh' },
          { string: 2, fret: 8, degree: '1', role: 'root' },
        ],
        caption: '{c:G7} in fifth position.',
      },
    },
    { generate: 'diatonic-chord', params: { sevenths: true, maxAccidentals: 0 } },
    {
      type: 'play-phrase',
      prompt: 'The {c:Dm7} arpeggio, up and down: string 5 fret 5 to string 3 fret 7 and back.',
      notes: [...ARPEGGIOS.Dm7],
      octave: 'exact',
      tempo: 60,
      explain: '{n:D} {n:F} {n:A} {n:C} {n:D}, then back down to {n:D}. Alternate picking, down on the beat.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap every note of {c:Dm7} on strings 5 to 3, frets 5 to 8.',
        find: { chord: 'Dm7' },
        mode: 'all',
        octave: 'any',
        strings: [5, 4, 3],
        frets: [5, 8],
        explain: '{n:D} and {n:F} on string 5, {n:A} on string 4 fret 7, {n:C} and {n:D} on string 3.',
      },
    },
    {
      type: 'play-phrase',
      prompt: 'The {c:G7} arpeggio: string 4 fret 5 up to string 2 fret 8 and back.',
      notes: [...ARPEGGIOS.G7],
      octave: 'exact',
      tempo: 60,
      explain: '{n:G} {n:B} {n:D} {n:F} {n:G}: finger 1 reaches back to fret 4 for {n:B}.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap every note of {c:G7} on strings 4 to 2, frets 4 to 8.',
        find: { chord: 'G7' },
        mode: 'all',
        octave: 'any',
        strings: [4, 3, 2],
        frets: [4, 8],
        explain: '{n:G} on string 4 fret 5, {n:B} and {n:D} on string 3, {n:F} and {n:G} on string 2.',
      },
    },
    {
      type: 'play-phrase',
      prompt: 'The {c:Cmaj7} arpeggio: string 6 fret 8 up to string 3 fret 5 and back.',
      notes: [...ARPEGGIOS.Cmaj7],
      octave: 'exact',
      tempo: 60,
      explain: '{n:C} {n:E} {n:G} {n:B} {n:C}. The {n:B} is the major seventh, a half step under the octave: hear the difference from {c:G7}\'s {n:F}.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap every note of {c:Cmaj7} on strings 6 to 4, frets 4 to 8.',
        find: { chord: 'Cmaj7' },
        mode: 'all',
        octave: 'any',
        strings: [6, 5, 4],
        frets: [4, 8],
        explain: '{n:B} and {n:C} on string 6, {n:E} on string 5 fret 7, {n:G} on string 4 fret 5.',
      },
    },
    playerTask({
      id: 'arpeggio-study',
      title: 'Seventh-Chord Arpeggios in C',
      song: 'st-arpeggio-sevenths',
      bars: [1, 8],
      tempo: 58,
      minutes: 6,
      body: 'Bars 1 to 8, all seven chords, at 58 % (60 {t:bpm|BPM}). When it is clean twice running, 77 % (80 BPM). Say the four note names before each bar.',
      tip: 'The usual slip is the seventh: {n:B} in {c:Cmaj7}, {n:C} in {c:Dm7}, {n:F} in {c:G7}.',
    }),
    {
      type: 'true-false',
      statement: '{c:Bm7b5} is the only half-diminished seventh chord in {k:C major}.',
      answer: true,
      explain: 'Only the chord on the seventh degree has a flat fifth: {n:B} to {n:F}. The others are major seventh, minor seventh or dominant.',
      fact: 'sevenths-c',
    },
    toolTask({
      id: 'jam-arpeggios-only',
      title: 'Jam: arpeggios only',
      tool: 'progressions',
      params: ['jazz-ii-v-i', 'c', 'jam'],
      minutes: 6,
      body: 'The {r:ii}–{r:V}–{r:I} in {k:C major} at 100 {t:bpm|BPM}: arpeggios only, changing exactly with the chords. Then make an 8-bar melody of your own from the same notes, a chord tone on every beat 1.',
    }),
    {
      type: 'choice',
      prompt: 'Which two diatonic sevenths of {k:C major} are major seventh chords?',
      options: [
        { text: '{c:Cmaj7} and {c:Fmaj7}', correct: true },
        { text: '{c:Cmaj7} and {c:G7}', why: '{c:G7} has a minor seventh, {n:F}: it is the dominant.' },
        { text: '{c:Dm7} and {c:Am7}', why: 'Minor triads with minor sevenths: minor seventh chords.' },
      ],
      explain: 'On {r:I} and {r:IV}: {c:Cmaj7} ({n:B}) and {c:Fmaj7} ({n:E}), each with a major seventh above a major triad.',
      fact: 'sevenths-c',
    },
  ],
  facts: [
    { id: 'sevenths-c', front: 'The seven diatonic sevenths of {k:C major}?', back: '{c:Cmaj7} {c:Dm7} {c:Em7} {c:Fmaj7} {c:G7} {c:Am7} {c:Bm7b5}.' },
    { id: 'arpeggio-path', front: 'Why practise seventh arpeggios?', back: 'They are the shortest path from chords to lines: the chord\'s own notes, ready under the fingers.' },
  ],
};

// ── 2. Horizontal and vertical ──────────────────────────────────────────────────────────────────

const verticalAndHorizontal: TeacherLesson = {
  id: 'vertical-and-horizontal',
  title: 'Horizontal and vertical',
  teaches: 'Horizontal: one scale for a passage. Vertical: each chord\'s own arpeggio. Switch where the harmony moves.',
  minutes: 5,
  skill: 'teacher:elena:vertical-and-horizontal',
  steps: [
    {
      type: 'card',
      title: 'Horizontal',
      body: 'Over {c:Dm7}, {c:G7} and {c:Cmaj7} you can think of one {k:C major} scale throughout: {t:horizontal|horizontal}, easy and smooth. Here is such a line. Listen for the moment the chord changes: you will not hear it.',
      figure: { kind: 'tab', tempo: 80, notes: [...LINES.horizontal], caption: 'Bars 1 to 4: {c:Dm7}, {c:G7}, {c:Cmaj7}, {c:Cmaj7}.' },
    },
    {
      type: 'choice',
      prompt: 'In that line, which note falls on beat 1 of the {c:G7} bar?',
      options: [
        { text: '{n:A}, the ninth', correct: true },
        { text: '{n:B}, the third', why: '{n:B} comes on beat 2. Beat 1 is {n:A}, string 4 fret 7.' },
        { text: '{n:G}, the root', why: '{n:G} ended the {c:Dm7} bar, on beat 4.' },
      ],
      explain: 'The scale simply carries on: {n:A} on beat 1, then {n:B}, {n:C}, {n:D}. Correct in {k:C major}, but the arrival of {c:G7} goes unheard.',
      fact: 'horizontal-vertical',
    },
    {
      type: 'card',
      title: 'Vertical',
      body: 'Or think of each chord\'s own arpeggio and tensions: {t:vertical|vertical}, precise, and the way the harmony becomes audible in the line. The same four bars, each built from its chord: {n:C} falls to {n:B} into {c:G7}, {n:F} to {n:E} into {c:Cmaj7}.',
      figure: { kind: 'tab', tempo: 80, notes: [...LINES.vertical], caption: 'Each bar spells its chord; the guide tones move by half steps.' },
    },
    {
      type: 'fill-blanks',
      prompt: 'On beat 1 of each bar, the vertical line plays a chord tone. Which?',
      text: '{c:Dm7}: ___    {c:G7}: ___    {c:Cmaj7}: ___',
      blanks: ['{n:D}', '{n:B}', '{n:E}'],
      bank: ['{n:A}', '{n:C}'],
      explain: 'The root of {c:Dm7}, then the thirds of {c:G7} and {c:Cmaj7}: the notes that tell the ear the chord has changed.',
      fact: 'horizontal-vertical',
    },
    {
      type: 'listen-choice',
      prompt: 'Horizontal or vertical?',
      sound: { kind: 'tab', notes: [...LINES.vertical], tempo: 80 },
      options: [{ text: 'Horizontal: the scale throughout' }, { text: 'Vertical: each chord spelled', correct: true }],
      shuffle: false,
      explain: 'Four notes of {c:Dm7}, then {n:B} {n:D} {n:G} {n:F} of {c:G7}, then {c:Cmaj7}: arpeggios, so the changes can be heard without a band.',
    },
    {
      type: 'play-phrase',
      prompt: 'Play the vertical line, slowly, saying each chord name as its bar begins.',
      notes: [...LINES.vertical],
      octave: 'exact',
      tempo: 66,
      explain: '{n:D} {n:F} {n:A} {n:C}, {n:B} {n:D} {n:G} {n:F}, {n:E} {n:C} {n:B} {n:G}, {n:E}: all in fifth position.',
      alternative: {
        type: 'order',
        prompt: 'Put the first notes of the vertical line\'s four bars in order.',
        tiles: ['{n:D}', '{n:B}', '{n:E}', '{n:E}'],
        distractors: ['{n:A}', '{n:C}'],
        explain: 'Root of {c:Dm7}, third of {c:G7}, third of {c:Cmaj7}, and the low {n:E} to close.',
      },
    },
    {
      type: 'card',
      title: 'Switch',
      body: 'Good players switch: horizontal for long stretches in one key, vertical where the harmony moves or leaves the key. Over {c:E7} in {k:C major}, go vertical: its {n:G#} is not in the scale.',
      figure: { kind: 'fretboard', frets: [4, 7], root: 'E', labels: 'degree', derive: { chord: 'E7' }, caption: '{c:E7} in fifth position. {n:G#} is its third.' },
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap every note of {c:E7} on strings 4 to 2, frets 4 to 7.',
      find: { chord: 'E7' },
      mode: 'all',
      octave: 'any',
      strings: [4, 3, 2],
      frets: [4, 7],
      explain: '{n:G#} on string 4 fret 6, {n:B} and {n:D} on string 3 at frets 4 and 7, {n:E} on string 2 fret 5.',
      fact: 'when-vertical',
    },
    playerTask({
      id: 'study-tune',
      title: 'The study\'s tune: vertical',
      song: 'st-arpeggio-sevenths',
      bars: [9, 16],
      tempo: 77,
      minutes: 4,
      body: 'Bars 9 to 16 at 77 % (80 {t:bpm|BPM}): an 8-bar tune made of chord tones over {c:Dm7}, {c:G7}, {c:Cmaj7}. Listen to how it spells the changes, then play it.',
    }),
    toolTask({
      id: 'jam-horizontal-vertical',
      title: 'Jam: one chorus each way',
      tool: 'progressions',
      params: ['jazz-ii-v-i', 'c', 'jam'],
      minutes: 5,
      body: 'The {r:ii}–{r:V}–{r:I} in {k:C major} at 100 {t:bpm|BPM}: one chorus horizontal, the {k:C major} scale throughout; one vertical, each chord\'s own tones. Then mix them.',
    }),
    {
      type: 'true-false',
      statement: 'Over {c:E7} in {k:C major}, the {k:C major} scale has every note of the chord.',
      answer: false,
      explain: '{c:E7} is {n:E} {n:G#} {n:B} {n:D}. The scale has {n:G}, which clashes with the chord\'s third: go vertical there.',
      fact: 'when-vertical',
    },
    toolTask({
      id: 'jam-v-of-vi',
      title: 'Jam: vertical over {c:E7}',
      tool: 'progressions',
      params: ['secondary-v-of-vi', 'c', 'jam'],
      minutes: 5,
      body: '{c:C}, {c:E7}, {c:Am}, {c:F} at 92 {t:bpm|BPM}. Horizontal over {c:C}, {c:Am} and {c:F}; over {c:E7}, the {c:E7} arpeggio, landing on {n:G#} and letting it rise to {n:A} as {c:Am} arrives.',
    }),
    {
      type: 'choice',
      prompt: 'Eight bars of {c:Cmaj7}. Which way do you think?',
      options: [
        { text: 'Horizontal: one scale is enough', correct: true },
        { text: 'Vertical: a new arpeggio each beat', why: 'There is nothing to spell: one chord, one key. Save the precision for where the harmony moves.' },
      ],
      shuffle: false,
      explain: 'A long stretch in one key is horizontal country: the scale, phrased well. Vertical thinking earns its keep where the chords move.',
      fact: 'horizontal-vertical',
    },
  ],
  facts: [
    { id: 'horizontal-vertical', front: 'Horizontal or vertical playing?', back: 'Horizontal: one scale for a whole passage. Vertical: each chord\'s own arpeggio and tensions, so the harmony is audible.' },
    { id: 'when-vertical', front: 'When do you go vertical?', back: 'Where the harmony moves or leaves the key: over {c:E7} in {k:C major}, for its {n:G#}.' },
  ],
};

// ── 3. Approach notes and enclosures ────────────────────────────────────────────────────────────

const approachNotesAndEnclosures: TeacherLesson = {
  id: 'approach-notes-and-enclosures',
  title: 'Approach notes and enclosures',
  teaches: 'Approach a chord tone from a half step below, or enclose it: a step above, a half step below, then the target.',
  minutes: 5,
  skill: 'teacher:elena:approach-notes-and-enclosures',
  steps: [
    {
      type: 'card',
      title: 'The approach note',
      body: 'A chromatic {t:approach-note|approach note}, a half step below a chord tone on the weak part of a beat, makes the target sound inevitable. Into {n:E}, the third of {c:Cmaj7}: {n:D#} to {n:E}. Then the {t:enclosure|enclosure}: {n:F}, {n:D#}, {n:E}.',
      figure: {
        kind: 'staff',
        notes: [
          { note: 'D#4', duration: 'q' },
          { note: 'E4', duration: 'q' },
          { note: 'F4', duration: 'q' },
          { note: 'D#4', duration: 'q' },
          { note: 'E4', duration: 'w' },
        ],
        caption: 'Into {n:E}: the approach, then the enclosure.',
      },
    },
    {
      type: 'choice',
      prompt: 'Which note approaches {n:B}, the third of {c:G7}, from a half step below?',
      options: [
        { text: '{n:A#}', correct: true },
        { text: '{n:C}', why: '{n:C} is a half step above: half of an enclosure, not the approach from below.' },
        { text: '{n:A}', why: '{n:A} is a whole step below: a scale step, not a chromatic approach.' },
        { text: '{n:G}', why: '{n:G} is the root, a third below.' },
      ],
      explain: '{n:A#}, string 3 fret 3, rises a half step to {n:B} at fret 4. Put it on the and, the target on the beat.',
      fact: 'approach-note',
    },
    {
      type: 'card',
      title: 'Surround the target',
      body: 'An enclosure surrounds the target: a scale step above, a half step below, then the target. Into {n:B}: {n:C}, {n:A#}, {n:B}, on string 3. Aim these at the thirds of each chord and your lines start to sound like jazz.',
      figure: { kind: 'tab', tempo: 80, notes: [...ENCLOSURES.intoB], caption: 'The enclosure of {n:B}: string 3, frets 5, 3, 4.' },
    },
    {
      type: 'play-phrase',
      prompt: 'The enclosure into {n:E}: string 2, frets 6, 4, 5.',
      notes: [...ENCLOSURES.intoE],
      octave: 'exact',
      tempo: 80,
      explain: '{n:F}, {n:D#}, then {n:E}, held: the third of {c:Cmaj7}, approached from both sides.',
      alternative: {
        type: 'order',
        prompt: 'Put the enclosure of {n:E} in order.',
        tiles: ['{n:F}', '{n:D#}', '{n:E}'],
        distractors: ['{n:D}'],
        explain: 'A scale step above ({n:F}), a half step below ({n:D#}), then the target ({n:E}).',
      },
    },
    {
      type: 'play-phrase',
      prompt: 'The enclosure into {n:B}: string 3, frets 5, 3, 4.',
      notes: [...ENCLOSURES.intoB],
      octave: 'exact',
      tempo: 80,
      explain: '{n:C}, {n:A#}, then {n:B}: the third of {c:G7}.',
      alternative: {
        type: 'order',
        prompt: 'Put the enclosure of {n:B} in order.',
        tiles: ['{n:C}', '{n:A#}', '{n:B}'],
        distractors: ['{n:A}'],
        explain: 'A scale step above ({n:C}), a half step below ({n:A#}), then the target ({n:B}).',
      },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the enclosure of {n:F}, the third of {c:Dm7}.',
      text: '___  ___  {n:F}',
      blanks: ['{n:G}', '{n:E}'],
      bank: ['{n:F#}', '{n:Eb}'],
      explain: '{n:G} is the scale step above; {n:E} is a half step below, and in {k:C major} it is also the scale step. Then {n:F}.',
      fact: 'enclosure',
    },
    {
      type: 'listen-choice',
      prompt: 'Approach note or enclosure?',
      sound: { kind: 'tab', notes: [...ENCLOSURES.intoE], tempo: 80 },
      options: [{ text: 'An approach note' }, { text: 'An enclosure', correct: true }],
      shuffle: false,
      explain: 'Above, below, then the target: {n:F}, {n:D#}, {n:E}. An approach note is a single note leading in.',
    },
    toolTask({
      id: 'jam-enclosures',
      title: 'Jam: an enclosure at every change',
      tool: 'progressions',
      params: ['jazz-ii-v-i', 'c', 'jam'],
      minutes: 6,
      body: 'The {r:ii}–{r:V}–{r:I} in {k:C major} at 96 {t:bpm|BPM}. One enclosure at every chord change, landing on beat 1: {n:G} {n:E} {n:F} into {c:Dm7}, {n:C} {n:A#} {n:B} into {c:G7}, {n:F} {n:D#} {n:E} into {c:Cmaj7}.',
      tip: 'Start the enclosure on beat 4 and the target falls on 1 by itself.',
    }),
    {
      type: 'true-false',
      statement: 'An approach note belongs on the strong part of the beat, with the target after it.',
      answer: false,
      explain: 'The other way round: the approach on the weak part (the and), the target on the beat. Then the tension resolves where the ear expects it.',
      fact: 'approach-note',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each target with its enclosure.',
      pairs: [
        { left: '{n:E}, third of {c:Cmaj7}', right: '{n:F} {n:D#} {n:E}' },
        { left: '{n:B}, third of {c:G7}', right: '{n:C} {n:A#} {n:B}' },
        { left: '{n:F}, third of {c:Dm7}', right: '{n:G} {n:E} {n:F}' },
      ],
      explain: 'Above by a scale step, below by a half step, then the third. Three chords, three targets.',
      fact: 'enclosure',
    },
  ],
  facts: [
    { id: 'approach-note', front: 'What is a chromatic approach note?', back: 'A note a half step below a chord tone, on the weak part of a beat, leading into it on the beat.' },
    { id: 'enclosure', front: 'What is an enclosure?', back: 'A scale step above the target, a half step below it, then the target: {n:F} {n:D#} {n:E} into {n:E}.' },
    { id: 'enclosure-targets', front: 'Which notes do approaches and enclosures aim at first?', back: 'The thirds: {n:F} of {c:Dm7}, {n:B} of {c:G7}, {n:E} of {c:Cmaj7}.' },
  ],
};

// ── 4. Arpeggios a third up ─────────────────────────────────────────────────────────────────────

const arpeggioSubstitution: TeacherLesson = {
  id: 'arpeggio-substitution',
  title: 'Arpeggios a third up',
  teaches: 'Play the arpeggio built on a chord\'s third to reach its upper extensions: 3, 5, 7 and 9, with no new shapes.',
  minutes: 5,
  skill: 'teacher:elena:arpeggio-substitution',
  steps: [
    {
      type: 'card',
      title: 'Start on the third',
      body: 'Over {c:Cmaj7}, an {c:Em7} arpeggio ({n:E} {n:G} {n:B} {n:D}) gives you the third, fifth, seventh and ninth: a richer sound, with no new shapes to learn. You already played it in the study\'s third bar.',
      figure: {
        kind: 'fretboard',
        frets: [4, 8],
        root: 'C',
        labels: 'degree',
        dots: [
          { string: 5, fret: 7, degree: '3', role: 'third' },
          { string: 4, fret: 5, degree: '5', role: 'fifth' },
          { string: 3, fret: 4, degree: '7', role: 'seventh' },
          { string: 3, fret: 7, degree: '9', role: 'tone' },
          { string: 2, fret: 5, degree: '3', role: 'third' },
        ],
        caption: '{c:Em7} over {c:Cmaj7}: labelled as degrees of {c:Cmaj7}.',
      },
    },
    {
      type: 'choice',
      prompt: 'Over {c:Cmaj7}, what is the {n:D} of the {c:Em7} arpeggio?',
      options: [
        { text: 'The ninth', correct: true },
        { text: 'The seventh', why: 'The seventh of {c:Cmaj7} is {n:B}, the arpeggio\'s third note.' },
        { text: 'The eleventh', why: 'The eleventh would be {n:F}, which is not in {c:Em7}.' },
      ],
      explain: '{n:D} is a ninth above {n:C}: the extension the plain {c:Cmaj7} arpeggio never reaches.',
      fact: 'third-up-rule',
    },
    {
      type: 'card',
      title: 'Every chord, the same move',
      body: 'Over {c:Dm7}, {c:Fmaj7} ({n:F} {n:A} {n:C} {n:E}) does the same: third, fifth, seventh, ninth. Over {c:G7}, {c:Bm7b5} ({n:B} {n:D} {n:F} {n:A}). The principle never changes: start on the third.',
      figure: {
        kind: 'fretboard',
        frets: [3, 7],
        root: 'G',
        labels: 'degree',
        dots: [
          { string: 3, fret: 4, degree: '3', role: 'third' },
          { string: 3, fret: 7, degree: '5', role: 'fifth' },
          { string: 2, fret: 6, degree: 'b7', role: 'seventh' },
          { string: 1, fret: 5, degree: '9', role: 'tone' },
        ],
        caption: '{c:Bm7b5} over {c:G7}: 3, 5, flat 7 and 9 of {c:G7}.',
      },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each chord with the arpeggio a third up.',
      pairs: [
        { left: '{c:Cmaj7}', right: '{c:Em7}' },
        { left: '{c:Dm7}', right: '{c:Fmaj7}' },
        { left: '{c:G7}', right: '{c:Bm7b5}' },
        { left: '{c:Am7}', right: '{c:Cmaj7}' },
      ],
      explain: 'Each arpeggio starts on the chord\'s third and runs to its ninth. In one key the substitutes are simply the diatonic sevenths a third up.',
      fact: 'third-up-c',
    },
    {
      type: 'choice',
      prompt: 'Which arpeggio gives you the ninth over {c:Am7}?',
      options: [
        { text: '{c:Cmaj7}', correct: true },
        { text: '{c:Em7}', why: '{c:Em7} starts on the fifth of {c:Am7}: 5, flat 7, 9, 11. It skips the third.' },
        { text: '{c:Am7}', why: 'Its own arpeggio stops at the seventh, {n:G}.' },
        { text: '{c:G7}', why: '{c:G7} has {n:B} but also {n:F}, a clash with the chord\'s fifth.' },
      ],
      explain: '{c:Cmaj7} is {n:C} {n:E} {n:G} {n:B}: over {c:Am7} that is the flat third, fifth, flat seventh and ninth.',
      fact: 'third-up-rule',
    },
    {
      type: 'play-phrase',
      prompt: '{c:Fmaj7} over {c:Dm7}: string 5 fret 8 up to string 2 fret 5, and back.',
      notes: [...THIRD_UP.Fmaj7],
      octave: 'exact',
      tempo: 72,
      explain: '{n:F} {n:A} {n:C} {n:E}: flat third, fifth, flat seventh and ninth of {c:Dm7}.',
      alternative: {
        type: 'order',
        prompt: 'Put the {c:Fmaj7} arpeggio in order, from {n:F} up.',
        tiles: ['{n:F}', '{n:A}', '{n:C}', '{n:E}'],
        distractors: ['{n:D}'],
        explain: '{n:F} {n:A} {n:C} {n:E}: {c:Dm7} without its root, plus its ninth.',
      },
    },
    {
      type: 'play-phrase',
      prompt: '{c:Bm7b5} over {c:G7}: string 3 fret 4 up to string 1 fret 5, and back.',
      notes: [...THIRD_UP.Bm7b5],
      octave: 'exact',
      tempo: 72,
      explain: '{n:B} {n:D} {n:F} {n:A}: third, fifth, flat seventh and ninth of {c:G7}.',
      alternative: {
        type: 'order',
        prompt: 'Put the {c:Bm7b5} arpeggio in order, from {n:B} up.',
        tiles: ['{n:B}', '{n:D}', '{n:F}', '{n:A}'],
        distractors: ['{n:G}'],
        explain: '{n:B} {n:D} {n:F} {n:A}: {c:G7} without its root, plus its ninth.',
      },
    },
    {
      type: 'play-phrase',
      prompt: '{c:Em7} over {c:Cmaj7}: string 5 fret 7 up to string 3 fret 7, and back.',
      notes: [...THIRD_UP.Em7],
      octave: 'exact',
      tempo: 72,
      explain: '{n:E} {n:G} {n:B} {n:D}: third, fifth, seventh and ninth of {c:Cmaj7}.',
      alternative: {
        type: 'order',
        prompt: 'Put the {c:Em7} arpeggio in order, from {n:E} up.',
        tiles: ['{n:E}', '{n:G}', '{n:B}', '{n:D}'],
        distractors: ['{n:C}'],
        explain: '{n:E} {n:G} {n:B} {n:D}: {c:Cmaj7} without its root, plus its ninth.',
      },
    },
    playerTask({
      id: 'study-substitutes',
      title: 'The substitutes, inside the study',
      song: 'st-arpeggio-sevenths',
      bars: [3, 7],
      tempo: 77,
      minutes: 4,
      body: 'Bars 3 to 7 at 77 % (80 {t:bpm|BPM}): {c:Em7}, {c:Fmaj7}, {c:G7}, {c:Am7}, {c:Bm7b5}. Three of them are the substitutes you need. Name the chord each one sits over.',
    }),
    toolTask({
      id: 'jam-substitutes',
      title: 'Jam: the substitutes only',
      tool: 'progressions',
      params: ['jazz-ii-v-i', 'c', 'jam'],
      minutes: 6,
      body: 'The {r:ii}–{r:V}–{r:I} in {k:C major} at 100 {t:bpm|BPM}: only the arpeggios a third up. {c:Fmaj7} over {c:Dm7}, {c:Bm7b5} over {c:G7}, {c:Em7} over {c:Cmaj7}. Listen for the ninths.',
    }),
    {
      type: 'true-false',
      statement: 'Over {c:G7}, the {c:Bm7b5} arpeggio holds the ninth, {n:A}.',
      answer: true,
      explain: '{n:B} {n:D} {n:F} {n:A}: the {n:A} is a ninth above {n:G}. The root is left to the bass.',
      fact: 'third-up-c',
    },
  ],
  facts: [
    { id: 'third-up-rule', front: 'Arpeggio substitution: which arpeggio over a seventh chord?', back: 'The seventh arpeggio built on its third: it gives the 3, 5, 7 and 9.' },
    { id: 'third-up-c', front: 'Arpeggios a third up for {c:Dm7}, {c:G7}, {c:Cmaj7}?', back: '{c:Fmaj7}, {c:Bm7b5}, {c:Em7}.' },
  ],
};

// ── 5. The altered dominant ─────────────────────────────────────────────────────────────────────

const alteredDominant: TeacherLesson = {
  id: 'altered-dominant',
  title: 'The altered dominant',
  teaches: 'The altered scale holds every altered tension of a dominant: {n:G} altered is {n:Ab} melodic minor from {n:G}.',
  minutes: 5,
  skill: 'teacher:elena:altered-dominant',
  steps: [
    {
      type: 'card',
      title: 'Tensions that push',
      body: 'A dominant seventh can carry altered tensions: the {d:b9}, {d:#9}, {d:b5} and {d:#5} (or {d:b13}). All of them push harder toward resolution. Hear {c:G7} resolve, then {c:G7b9} and {c:G7#9}.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['G7', 'Cmaj7', 'G7b9', 'Cmaj7', 'G7#9', 'Cmaj7'], beats: 2, tempo: 72 }, label: 'Plain, then altered' },
    },
    {
      type: 'listen-choice',
      prompt: 'Plain {c:G7} or altered?',
      sound: { kind: 'chord', chord: 'G7#9', voicing: 'close', octave: 3 },
      options: [{ text: 'Plain {c:G7}' }, { text: 'Altered', correct: true }],
      shuffle: false,
      explain: 'That was {c:G7#9}: its {n:A#} sounds like a minor third, rubbing against the major third, {n:B}, a half step above it.',
    },
    {
      type: 'card',
      title: 'One scale holds them all',
      body: 'The {t:altered-scale|altered scale} holds them all. {n:G} altered is {n:G} {n:Ab} {n:Bb} {n:Cb} {n:Db} {n:Eb} {n:F}, which is {n:Ab} melodic minor starting on {n:G}. Over {c:G7}: {n:Ab} is the {d:b9}, {n:Bb} the {d:#9}, {n:Cb} the third, {n:Db} the {d:b5}, {n:Eb} the {d:b13}.',
      figure: { kind: 'fretboard', frets: [2, 6], root: 'G', labels: 'degree', dots: [...G_ALTERED], caption: '{n:G} altered in third position, as tensions of {c:G7}.' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete {n:G} altered.',
      text: '{n:G}  {n:Ab}  ___  {n:Cb}  {n:Db}  ___  {n:F}',
      blanks: ['{n:Bb}', '{n:Eb}'],
      bank: ['{n:A}', '{n:E}'],
      explain: 'Everything that can be altered is: flat and sharp nine ({n:Ab}, {n:Bb}), flat five ({n:Db}), flat thirteen ({n:Eb}). Only the root, third and seventh stay.',
      fact: 'g-altered',
    },
    {
      type: 'choice',
      prompt: '{n:G} altered has the same notes as which scale?',
      options: [
        { text: '{n:Ab} melodic minor', correct: true },
        { text: '{n:G} melodic minor', why: '{n:G} melodic minor has {n:A}, {n:D} and {n:E}: no tensions at all over {c:G7}.' },
        { text: '{n:Ab} major', why: '{n:Ab} major has {n:C}, which clashes with {c:G7}\'s third. Melodic minor has {n:Cb} instead.' },
      ],
      explain: '{n:Ab} melodic minor is {n:Ab} {n:Bb} {n:Cb} {n:Db} {n:Eb} {n:F} {n:G}. Start it on {n:G}, its seventh degree: the altered scale.',
      fact: 'g-altered',
    },
    {
      type: 'card',
      title: 'Resolve by step',
      body: 'Resolve each tension by step into the {c:C} chord: {n:Ab} to {n:G}, {n:Eb} to {n:E}, {n:Db} to {n:C}. A tension left hanging is merely a wrong note played with confidence.',
      figure: {
        kind: 'staff',
        time: '4/4',
        notes: [
          { note: 'Ab3', duration: 'h' },
          { note: 'G3', duration: 'h' },
          { note: 'Eb4', duration: 'h' },
          { note: 'E4', duration: 'h' },
          { note: 'Db4', duration: 'h' },
          { note: 'C4', duration: 'h' },
        ],
        caption: 'Three resolutions into {c:Cmaj7}: to its fifth, third and root.',
      },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each tension of {c:G7alt} with the note of {c:Cmaj7} it resolves to.',
      pairs: [
        { left: '{n:Ab}, the {d:b9}', right: '{n:G}, the fifth' },
        { left: '{n:Eb}, the {d:b13}', right: '{n:E}, the third' },
        { left: '{n:Db}, the {d:b5}', right: '{n:C}, the root' },
      ],
      explain: 'Each moves a half step: {n:Ab} down, {n:Eb} up, {n:Db} down. The tension and its release are next door to each other.',
      fact: 'altered-resolve',
    },
    toolTask({
      id: 'ear-dominant-colours',
      title: 'Ear Training: dominant colours',
      tool: 'ear',
      params: ['chords', '9'],
      minutes: 4,
      body: 'Chord quality, level 9: the plain seventh, the ninth and thirteenth, and the two altered ninths. One round. For each, ask first: plain or altered? Then which.',
    }),
    { generate: 'chord-quality-ear', params: { types: ['7', '7b9', '7sharp9'] } },
    toolTask({
      id: 'scales-altered',
      title: 'Scales: G altered over the band',
      tool: 'scales',
      params: ['g', 'altered', 'caged-e'],
      minutes: 5,
      body: '{n:G} altered in third position. Set Underneath to Band: it vamps {c:G7alt}. Play the scale slowly, then dwell on each tension, then on the third and seventh.',
    }),
    toolTask({
      id: 'jam-altered',
      title: 'Jam: altered over {c:G7} only',
      tool: 'progressions',
      params: ['jazz-ii-v-i', 'c', 'jam'],
      minutes: 6,
      body: 'The {r:ii}–{r:V}–{r:I} in {k:C major} at 92 {t:bpm|BPM}: {k:C major} over {c:Dm7}, the altered scale over {c:G7} only, then resolve by step into the {c:Cmaj7} bar: {n:Ab} to {n:G}, {n:Eb} to {n:E}.',
    }),
    {
      type: 'true-false',
      statement: 'Over {c:G7} resolving to {c:Cmaj7}, the {n:Eb} resolves up a half step to {n:E}, the third of {c:Cmaj7}.',
      answer: true,
      explain: 'The {d:b13} of {c:G7}, {n:Eb}, rises to {n:E}. The {d:b9}, {n:Ab}, falls to {n:G}.',
      fact: 'altered-resolve',
    },
  ],
  facts: [
    { id: 'altered-tensions', front: 'The altered tensions of a dominant seventh?', back: 'The {d:b9}, {d:#9}, {d:b5} and {d:#5} (also called the {d:b13}).' },
    { id: 'g-altered', front: '{n:G} altered, and its parent scale?', back: '{n:G} {n:Ab} {n:Bb} {n:Cb} {n:Db} {n:Eb} {n:F}: {n:Ab} melodic minor starting on {n:G}.' },
    { id: 'altered-resolve', front: 'How do the tensions of {c:G7alt} resolve into {c:C}?', back: 'By step: {n:Ab} to {n:G}, {n:Eb} to {n:E}, {n:Db} to {n:C}.' },
  ],
};

// ── 6. Going outside, and coming back ───────────────────────────────────────────────────────────

const outsideAndBack: TeacherLesson = {
  id: 'outside-and-back',
  title: 'Going outside, and coming back',
  teaches: 'Step outside on purpose, by side-slipping or a tritone-substitute arpeggio, then land on a chord tone.',
  minutes: 5,
  skill: 'teacher:elena:outside-and-back',
  steps: [
    {
      type: 'card',
      title: 'Tension needs release',
      body: 'Playing outside only convinces when you come back: tension needs release. The first safe way out: {t:side-slip|side-slip} a phrase a half step up and back. Over {c:Am7}: {n:A} minor pentatonic, the same shape in {n:Bb}, then home.',
      figure: { kind: 'tab', tempo: 80, notes: [...OUTSIDE.sideSlip], caption: 'A phrase in {n:A}, the same phrase a fret higher, and home.' },
    },
    {
      type: 'choice',
      prompt: 'Side-slip {n:A} minor pentatonic up a half step. Which scale are you in?',
      options: [
        { text: '{n:Bb} minor pentatonic', correct: true },
        { text: '{n:B} minor pentatonic', why: 'That is a whole step up: two frets.' },
        { text: '{n:A} Dorian', why: 'Still inside {c:Am7}. A side-slip leaves the key on purpose.' },
      ],
      explain: 'One fret up, the same shape: {n:Bb} {n:Db} {n:Eb} {n:F} {n:Ab}. Almost every note clashes with {c:Am7}, which is the point, as long as you come back.',
      fact: 'side-slip',
    },
    {
      type: 'play-phrase',
      prompt: 'Play the side-slip: three notes in {n:A}, three a fret higher, then home, landing on {n:D}.',
      notes: [...OUTSIDE.sideSlip],
      octave: 'exact',
      tempo: 80,
      explain: '{n:A} {n:G} {n:E}, then {n:Bb} {n:Ab} {n:F}, then {n:A} {n:G} {n:E} and {n:D}. Same fingers, same rhythm: the shape moves, the phrase stays.',
      alternative: {
        type: 'order',
        prompt: 'Put the slipped phrase, one fret above {n:A} {n:G} {n:E}, in order.',
        tiles: ['{n:Bb}', '{n:Ab}', '{n:F}'],
        distractors: ['{n:B}', '{n:G}'],
        explain: 'Each note a half step higher: {n:A} to {n:Bb}, {n:G} to {n:Ab}, {n:E} to {n:F}.',
      },
    },
    {
      type: 'card',
      title: 'The tritone arpeggio',
      body: 'The second way out: over the {r:V}, play the tritone substitute\'s arpeggio. Over {c:G7}, {c:Db7}: {n:Db} {n:F} {n:Ab} {n:Cb}. Then land on a chord tone of {c:Cmaj7}: here {n:Cb}, which is {n:B}, rises to {n:C}.',
      figure: { kind: 'tab', tempo: 80, notes: [...OUTSIDE.db7], caption: '{c:Db7} over {c:G7}, resolving to {n:C}.' },
    },
    {
      type: 'match-pairs',
      prompt: 'Over {c:G7}, what is each note of the {c:Db7} arpeggio?',
      pairs: [
        { left: '{n:Db}', right: 'the flat five' },
        { left: '{n:F}', right: 'the flat seven' },
        { left: '{n:Ab}', right: 'the flat nine' },
        { left: '{n:Cb}', right: 'the third, {n:B}' },
      ],
      explain: 'Two guide tones ({n:F} and {n:B}) and two altered tensions: {c:Db7} is outside only in name.',
      fact: 'db7-over-g7',
    },
    {
      type: 'play-phrase',
      prompt: 'Play {c:Db7} over {c:G7} and land on {n:C}: string 5 frets 4 and 8, string 4 fret 6, string 3 frets 4 and 5.',
      notes: [...OUTSIDE.db7],
      octave: 'exact',
      tempo: 80,
      explain: '{n:Db} {n:F} {n:Ab} {n:Cb}, then {n:C}: the arpeggio\'s third, which is {c:G7}\'s third, rises to {c:Cmaj7}\'s root.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap where the line lands: {n:C}, string 3.',
        find: { note: 'C4' },
        mode: 'one',
        octave: 'exact',
        strings: [3],
        frets: [2, 7],
        explain: 'String 3 fret 5 is {n:C}, one fret above the {n:B} at fret 4.',
      },
    },
    toolTask({
      id: 'jam-side-slip',
      title: 'Jam: one side-slip per chorus',
      tool: 'progressions',
      params: ['funk-one-chord-minor', 'a', 'jam'],
      minutes: 6,
      body: '{c:Am7} funk at 96 {t:bpm|BPM}. Play inside, then side-slip one phrase per chorus, up a fret and back, and come home on a chord tone. Commit: same rhythm, same strength.',
      tip: 'Timidity, not the notes, is what makes outside playing sound wrong.',
    }),
    {
      type: 'true-false',
      statement: 'Outside notes sound wrong mainly when they are played timidly and left unresolved.',
      answer: true,
      explain: 'Commit to the phrase, keep the rhythm strong, and land on a chord tone of the next chord. Hesitation is what the ear punishes.',
      fact: 'outside-rule',
    },
    toolTask({
      id: 'jam-db7',
      title: 'Jam: {c:Db7} over {c:G7}',
      tool: 'progressions',
      params: ['jazz-ii-v-i', 'c', 'jam'],
      minutes: 6,
      body: 'The {r:ii}–{r:V}–{r:I} in {k:C major} at 100 {t:bpm|BPM}. Over the {c:G7} bar, the {c:Db7} arpeggio; into the {c:Cmaj7} bar, land on {n:C}, {n:E} or {n:G}, on beat 1.',
    }),
    {
      type: 'choice',
      prompt: 'After going outside, where do you land?',
      options: [
        { text: 'On a chord tone of the next chord', correct: true },
        { text: 'Anywhere, if you keep going', why: 'Keep going, yes; but the return must land, or the excursion was an accident.' },
        { text: 'On the outside scale\'s root', why: 'That stays outside. The release is a chord tone of the harmony you came back to.' },
      ],
      explain: 'Tension needs release: a chord tone of the next chord, on a strong beat.',
      fact: 'outside-rule',
    },
  ],
  facts: [
    { id: 'outside-rule', front: 'When does playing outside convince?', back: 'When it comes back: commit to it, keep the rhythm strong, and land on a chord tone of the next chord.' },
    { id: 'side-slip', front: 'What is a side-slip?', back: 'A phrase moved a half step up or down and back: {n:A} minor pentatonic to {n:Bb} minor pentatonic, and home.' },
    { id: 'db7-over-g7', front: 'Why does {c:Db7} work over {c:G7}?', back: 'It is the tritone substitute: over {n:G} its notes are the flat five, flat seven, flat nine and third.' },
  ],
};

/** Unit 7 of Prof. Varga's course. */
const unit: TeacherUnit = {
  id: 'elena-playing-the-changes',
  title: 'Arpeggios and the changes',
  theme: 'improvisation',
  description: 'Spell the harmony in your lines: seventh arpeggios, horizontal and vertical, enclosures, substitutes and altered sounds.',
  lessons: [seventhArpeggios, verticalAndHorizontal, approachNotesAndEnclosures, arpeggioSubstitution, alteredDominant, outsideAndBack],
  checkpoint: { sample: 8, maxMistakes: 2 },
  glossary: [
    { id: 'horizontal', term: 'horizontal playing', definition: 'Improvising with one scale over a whole passage of chords.' },
    { id: 'vertical', term: 'vertical playing', definition: 'Improvising from each chord\'s own arpeggio and tensions, so the line spells the harmony.' },
    { id: 'approach-note', term: 'approach note', definition: 'A note a half step below (or above) a chord tone, on a weak beat, leading into it.' },
    { id: 'enclosure', term: 'enclosure', definition: 'Surrounding a target note: a scale step above, a half step below, then the target.' },
    { id: 'altered-scale', term: 'altered scale', definition: 'The seventh mode of melodic minor: a dominant\'s root, third and seventh with every tension altered.' },
    { id: 'side-slip', term: 'side-slip', definition: 'Moving a phrase a half step out of the key and back, on purpose.' },
  ],
};

export default unit;
