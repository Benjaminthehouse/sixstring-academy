/**
 * Dev, unit 11: Improvising with intent (plan: `dev/dev-improvising` in
 * src/content/plan/teachers.json).
 *
 * Solos that follow the chords: arpeggios, chord tones on beat 1, the third at every change, a
 * motif developed with space around it, the Dorian and Mixolydian colours, and a planned two-chorus
 * blues solo with a story. Dev's voice: a bandmate who ties every idea to something to play tonight.
 *
 * Chord tones, thirds and mode notes come from the theory and guitar engines (`chordNotes`,
 * `scalePositions`), and `dev-improvising.test.ts` checks every fret the text names, every chord
 * shape, Dev's motif and target line against the chords under them, the library's studies the tasks
 * open, the jam tracks' chords and tempos, and every Player tempo.
 *
 * Dev's motif and its four variations are written here, not in the song library, so the lesson
 * plays them itself (play-phrase at 72 BPM) instead of sending the learner to the Player. Old Joe
 * Clark and Red Haired Boy are not in the library yet: their tasks fall back to the nearest pieces
 * that are (Mode Study: A Mixolydian at the tune's tempo; Drunken Sailor, the E Dorian tune).
 */
import { noteAt, scalePositions } from '@/core/guitar';
import type { FretDot, TabNote } from '@/lessons';
import type { TeacherLesson, TeacherUnit } from '../types';
import { playerTask, toolTask } from '../tasks';

// ── Helpers ────────────────────────────────────────────────────────────────────────────────────

/** One tab note. */
function t(string: number, fret: number, duration: string): TabNote {
  return { string, fret, duration };
}

/** A rest. */
function r(duration: string): TabNote {
  return { rest: true, duration };
}

/** A dot whose note is claimed from the engine. */
function dot(string: number, fret: number, extra: Partial<FretDot> = {}): FretDot {
  return { string, fret, note: noteAt({ string, fret }, { context: { prefer: 'sharps' } }), ...extra };
}

/** A scale in a fret range as dots, the tonic marked as root and one colour note as target. */
function modeDots(tonic: string, scale: string, colour: string, frets: [number, number]): FretDot[] {
  return scalePositions(tonic, scale, { minFret: frets[0], maxFret: frets[1] }).map((n) => ({
    string: n.string,
    fret: n.fret,
    note: n.note,
    ...(n.isRoot ? { role: 'root' as const } : n.note === colour ? { role: 'target' as const } : {}),
  }));
}

/** The C arpeggio from the study: string 5, fret 3 up to string 2, fret 1. */
const C_ARPEGGIO: FretDot[] = [
  dot(5, 3, { degree: '1', role: 'root' }), dot(4, 2, { degree: '3', role: 'third' }), dot(3, 0, { degree: '5', role: 'fifth' }), dot(2, 1, { degree: '1', role: 'root' }),
];

/** The F arpeggio from the study (the small F): string 4, fret 3 up to string 1, fret 1. */
const F_ARPEGGIO: FretDot[] = [
  dot(4, 3, { degree: '1', role: 'root' }), dot(3, 2, { degree: '3', role: 'third' }), dot(2, 1, { degree: '5', role: 'fifth' }), dot(1, 1, { degree: '1', role: 'root' }),
];

/** The C arpeggio up and back down, as the study plays it in quarter notes: C E G C G E C. */
export const C_ARPEGGIO_UP_DOWN: TabNote[] = [t(5, 3, 'q'), t(4, 2, 'q'), t(3, 0, 'q'), t(2, 1, 'q'), t(3, 0, 'q'), t(4, 2, 'q'), t(5, 3, 'h')];

/** Triad Arpeggios in First Position, bar 13 (`st-arpeggio-triads`): F, then G, as a tune. */
export const ARPEGGIO_TUNE_BAR_13: TabNote[] = [t(4, 3, 'e'), t(3, 2, 'e'), t(2, 1, 'e'), t(3, 2, 'e'), t(3, 0, 'e'), t(2, 0, 'e'), t(2, 3, 'e'), t(2, 0, 'e')];

/** One note held over C, Am and F, then a fret down for G: C C C B, a bar each on beat 1. */
export const ONE_NOTE_LINE: TabNote[] = [t(1, 8, 'w'), t(1, 8, 'w'), t(1, 8, 'w'), t(1, 7, 'w')];

/** The thirds of C, Am, F and G in the E-shape position of C major (frets 7 to 10). */
const THIRDS_7_10: FretDot[] = [dot(5, 7), dot(3, 9), dot(6, 8), dot(4, 10), dot(1, 8), dot(4, 7), dot(2, 10), dot(6, 7), dot(4, 9), dot(1, 7)].map((d) => ({ ...d, role: 'target' as const }));

/**
 * Dev's target line over C Am F G: each bar starts on the third of its chord (E, C, A, B), and the
 * note before each change is a step from the next target (B to C, G to A, C to B).
 */
export const TARGET_LINE: TabNote[] = [
  t(3, 9, 'h'), t(2, 8, 'q'), t(1, 7, 'q'),
  t(1, 8, 'h'), t(1, 7, 'q'), t(2, 8, 'q'),
  t(2, 10, 'h'), t(2, 8, 'q'), t(1, 8, 'q'),
  t(1, 7, 'w'),
];

/**
 * Dev's motif in A minor pentatonic box 1: A C E D (up, up, down a step), then a bar of space.
 * Quick notes that follow each other sit on different strings, so the tab stays easy to read.
 */
export const MOTIF: TabNote[] = [t(4, 7, 'e'), t(3, 5, 'e'), t(2, 5, 'q'), t(3, 7, 'h'), r('w')];
/** Variation 1: the same rhythm and the same up, up, down shape on new notes: C E A G. */
export const MOTIF_NEW_NOTES: TabNote[] = [t(3, 5, 'e'), t(2, 5, 'e'), t(1, 5, 'q'), t(2, 8, 'h'), r('w')];
/** Variation 2: the same notes, a new rhythm (long-short at the start). */
export const MOTIF_NEW_RHYTHM: TabNote[] = [t(4, 7, 'q.'), t(3, 5, 'e'), t(2, 5, 'q'), t(3, 7, 'q'), r('w')];
/** Variation 3: moved up the neck into box 4, the same notes an octave higher. */
export const MOTIF_UP_THE_NECK: TabNote[] = [t(3, 14, 'e'), t(2, 13, 'e'), t(1, 12, 'q'), t(2, 15, 'h'), r('w')];
/** Variation 4: extended, a G at string 2, fret 8 added at the end, to be bent up a whole step to A. */
export const MOTIF_WITH_BEND: TabNote[] = [t(4, 7, 'e'), t(3, 5, 'e'), t(2, 5, 'q'), t(3, 7, 'h'), t(2, 8, 'h'), r('h')];

/** The planned ending of the blues solo: down box 1 to the A at string 4, fret 7, held two beats. */
export const SOLO_ENDING: TabNote[] = [t(1, 8, 'q'), t(1, 5, 'q'), t(2, 8, 'q'), t(2, 5, 'q'), t(3, 7, 'q'), t(3, 5, 'q'), t(4, 7, 'h')];

// ── 1. Arpeggios ───────────────────────────────────────────────────────────────────────────────

const arpeggios: TeacherLesson = {
  id: 'arpeggios',
  title: 'Arpeggios',
  teaches: 'An arpeggio is a chord played one note at a time, so every note is a chord tone and fits the chord.',
  minutes: 5,
  skill: 'teacher:dev:arpeggios',
  steps: [
    {
      type: 'card',
      title: 'Chords, one note at a time',
      body: 'An {t:arpeggio} is a chord played one note at a time. It is the most direct way to make a solo fit the chords, because every note is a {t:chord-tone}. Tonight: every chord of {k:C major} as an arpeggio from its root, then a tune made of them.',
      figure: { kind: 'fretboard', frets: [0, 4], root: 'C', labels: 'degree', dots: C_ARPEGGIO, caption: 'The {c:C} arpeggio: root, third, fifth, root.' },
    },
    {
      type: 'choice',
      prompt: 'Which notes make the {c:Em} arpeggio?',
      options: [
        { text: '{n:E} {n:G} {n:B}', correct: true },
        { text: '{n:E} {n:G#} {n:B}', why: 'That is {c:E} major. {c:Em} has the minor third, {n:G}.' },
        { text: '{n:E} {n:A} {n:C}', why: 'Those are the notes of {c:Am}, starting on its fifth.' },
      ],
      explain: '{c:Em} is {n:E}, {n:G} and {n:B}: root, minor third, fifth. In the study it is string 4, fret 2, then the open strings 3, 2 and 1.',
      fact: 'c-major-arpeggios',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each chord of {k:C major} with its arpeggio.',
      pairs: [
        { left: '{c:C}', right: '{n:C} {n:E} {n:G}' },
        { left: '{c:Dm}', right: '{n:D} {n:F} {n:A}' },
        { left: '{c:F}', right: '{n:F} {n:A} {n:C}' },
        { left: '{c:G}', right: '{n:G} {n:B} {n:D}' },
        { left: '{c:Am}', right: '{n:A} {n:C} {n:E}' },
      ],
      explain: 'Each takes every other note of the scale from its root: root, third, fifth. The minor ones, {c:Dm} {c:Em} {c:Am}, have the third a half step lower.',
      fact: 'c-major-arpeggios',
    },
    {
      type: 'choice',
      prompt: 'Here is the {c:F} arpeggio from the study, the small F shape. Which note is its third?',
      figure: { kind: 'fretboard', frets: [0, 4], root: 'F', labels: 'degree', dots: F_ARPEGGIO, caption: 'The {c:F} arpeggio: string 4, fret 3 up to string 1, fret 1.' },
      options: [
        { text: '{n:A}, string 3, fret 2', correct: true },
        { text: '{n:C}, string 2, fret 1', why: '{n:C} is the fifth of {c:F}.' },
        { text: '{n:F}, string 1, fret 1', why: 'That {n:F} is the root again, an octave up.' },
      ],
      explain: '{c:F} is {n:F} {n:A} {n:C}: string 4, fret 3 ({n:F}), string 3, fret 2 ({n:A}), string 2, fret 1 ({n:C}), string 1, fret 1 ({n:F}).',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap every note of {c:F} from the nut to fret 3.',
      find: { chord: 'F' },
      mode: 'all',
      octave: 'any',
      frets: [0, 3],
      explain: 'Seven: {n:F} on string 6, fret 1, string 4, fret 3 and string 1, fret 1; {n:A} open on string 5 and at string 3, fret 2; {n:C} at string 5, fret 3 and string 2, fret 1.',
    },
    playerTask({
      id: 'triads-60',
      title: 'Triad Arpeggios at 60 BPM',
      song: 'st-arpeggio-triads',
      tempo: 68,
      minutes: 5,
      body: 'Play Triad Arpeggios in First Position at 68 % (60 BPM), alternate picked: down on the beat, up on the "and". Say each chord name as it arrives.',
      tip: 'Let the notes ring into each other a little. It should sound like the chord, spread out.',
    }),
    {
      type: 'play-phrase',
      prompt: 'Play the {c:C} arpeggio up and back down: {n:C} {n:E} {n:G} {n:C}, {n:G} {n:E} {n:C}.',
      notes: C_ARPEGGIO_UP_DOWN,
      octave: 'exact',
      tempo: 60,
      explain: 'String 5, fret 3 ({n:C}), string 4, fret 2 ({n:E}), the open string 3 ({n:G}), string 2, fret 1 ({n:C}), and back down to the root.',
      alternative: {
        type: 'order',
        prompt: 'Put the {c:C} arpeggio in order, up from the root.',
        tiles: ['{n:C}', '{n:E}', '{n:G}', '{n:C}'],
        distractors: ['{n:D}', '{n:F}'],
        explain: 'Root, third, fifth, root: {n:C} {n:E} {n:G} {n:C}. Every other note of the scale.',
      },
    },
    playerTask({
      id: 'triads-80',
      title: 'Triad Arpeggios at 80 BPM',
      song: 'st-arpeggio-triads',
      tempo: 91,
      minutes: 4,
      body: 'Now at 91 % (80 BPM). Bars 13 to 16 are a short tune made of the same arpeggios: listen to the top notes sing {n:C} {n:D}, {n:E} {n:C}, {n:D} {n:B}, {n:C}.',
    }),
    { generate: 'chord-tones', params: { types: ['major', 'minor'], roots: ['C', 'G', 'F', 'A', 'D', 'E'], ask: 'notes' } },
    {
      type: 'card',
      title: 'A melody from arpeggios',
      body: 'Arpeggios are not just exercises: they are melody. Bar 13 of the study spells {c:F}, then {c:G}, and the top of each group makes a tune of its own. Steal that idea for the jam: play each chord as an arpeggio, then start changing the order.',
      figure: { kind: 'tab', tempo: 80, notes: ARPEGGIO_TUNE_BAR_13, caption: 'Bar 13: {c:F} then {c:G}, one note at a time.' },
    },
    toolTask({
      id: 'arpeggio-jam',
      title: 'Jam: arpeggiate the changes',
      tool: 'progressions',
      params: ['fifties-i-vi-iv-v', 'c', 'jam'],
      minutes: 5,
      body: 'Set the band to 72 BPM: {c:C} {c:Am} {c:F} {c:G}, a bar each. Arpeggiate each chord as it comes, up, down or in any order. When that is easy, leave out a note or two and let it breathe.',
    }),
    {
      type: 'true-false',
      statement: 'Every note of an arpeggio is a chord tone of its chord.',
      answer: true,
      explain: 'That is the whole trick: an arpeggio is the chord itself, one note at a time, so over that chord it cannot clash.',
      fact: 'arpeggio-def',
    },
  ],
  facts: [
    { id: 'arpeggio-def', front: 'What is an arpeggio, and why does it fit a chord?', back: 'A chord played one note at a time. Every note is a chord tone, so it always fits that chord.' },
    { id: 'c-major-arpeggios', front: 'The arpeggios of the chords of {k:C major}?', back: '{c:C} {n:C} {n:E} {n:G}; {c:Dm} {n:D} {n:F} {n:A}; {c:Em} {n:E} {n:G} {n:B}; {c:F} {n:F} {n:A} {n:C}; {c:G} {n:G} {n:B} {n:D}; {c:Am} {n:A} {n:C} {n:E}.' },
  ],
};

// ── 2. Chord tones on the beat ─────────────────────────────────────────────────────────────────

const chordTonesOnTheBeat: TeacherLesson = {
  id: 'chord-tones-on-the-beat',
  title: 'Chord tones on the beat',
  teaches: 'Put a chord tone, the root, third or fifth, on beat 1 of every bar; any scale note can pass in between.',
  minutes: 5,
  skill: 'teacher:dev:chord-tones-on-the-beat',
  steps: [
    {
      type: 'card',
      title: 'The game',
      body: 'A solo sounds connected to the band when its strong beats land on chord tones: the root, third or fifth of the chord being played. In between, any note of the scale works as a {t:passing-note}. So here is the game: on every beat 1, play a note of the current chord.',
      tip: 'Over {c:C} {c:Am} {c:F} {c:G} the scale is {k:C major}: no sharps, no flats.',
    },
    {
      type: 'choice',
      prompt: 'The band hits {c:F} on beat 1. Which note do you put there?',
      options: [
        { text: '{n:A}', correct: true },
        { text: '{n:G}', why: '{n:G} is in the scale, so it is fine as a passing note, but it is not in {c:F}.' },
        { text: '{n:B}', why: '{n:B} is in the scale, but against {c:F} on beat 1 it rubs.' },
        { text: '{n:E}', why: '{n:E} is in the scale but not in {c:F}: save it for between the beats.' },
      ],
      explain: '{c:F} is {n:F} {n:A} {n:C}, so {n:A}, its third, is a chord tone. The others are scale notes: good for passing, not for landing.',
      fact: 'chord-tones-strong-beats',
    },
    {
      type: 'card',
      title: 'One position, four chords',
      body: 'Stay in the E-shape position of {k:C major}, frets 7 to 10, and find the chord tones of each chord there: {c:C} is {n:C} {n:E} {n:G}, {c:Am} is {n:A} {n:C} {n:E}, {c:F} is {n:F} {n:A} {n:C}, {c:G} is {n:G} {n:B} {n:D}. Here is {c:C}.',
      figure: { kind: 'fretboard', frets: [7, 10], root: 'C', labels: 'degree', derive: { chord: 'C' }, caption: 'The chord tones of {c:C}, frets 7 to 10.' },
    },
    {
      type: 'fretboard-find',
      prompt: 'Now {c:Am}: tap every {n:A}, {n:C} and {n:E} from fret 7 to fret 10.',
      find: { chord: 'Am' },
      mode: 'all',
      octave: 'any',
      frets: [7, 10],
      explain: 'Seven of them. {c:Am} shares {n:C} and {n:E} with {c:C}, so most of your landing spots stay where they were.',
      fact: 'c-am-f-g-tones',
    },
    {
      type: 'fretboard-find',
      prompt: '{c:F}: tap every {n:F}, {n:A} and {n:C} from fret 7 to fret 10.',
      find: { chord: 'F' },
      mode: 'all',
      octave: 'any',
      frets: [7, 10],
      explain: 'Seven again. {n:A} and {n:C} carry over from {c:Am}; {n:F} is new, at string 5, fret 8 and string 3, fret 10.',
      fact: 'c-am-f-g-tones',
    },
    {
      type: 'fretboard-find',
      prompt: '{c:G}: tap every {n:G}, {n:B} and {n:D} from fret 7 to fret 10.',
      find: { chord: 'G' },
      mode: 'all',
      octave: 'any',
      frets: [7, 10],
      explain: 'Eight. {c:G} shares nothing with {c:F}, so this is the change to watch: aim for a {n:B} or a {n:D} right on its beat 1.',
      fact: 'c-am-f-g-tones',
    },
    toolTask({
      id: 'one-note-a-bar',
      title: 'Jam: one note a bar',
      tool: 'progressions',
      params: ['fifties-i-vi-iv-v', 'c', 'jam'],
      minutes: 5,
      body: 'Set the band to 66 BPM. Play one note per bar, on beat 1, and make it a chord tone every time. Stay in frets 7 to 10. Sounds too simple? That is the point: hear each note lock with the chord.',
    }),
    {
      type: 'play-phrase',
      prompt: 'One note can serve three chords: hold {n:C} at string 1, fret 8 for {c:C}, {c:Am} and {c:F}, then step down to {n:B} for {c:G}.',
      notes: ONE_NOTE_LINE,
      octave: 'exact',
      tempo: 66,
      explain: '{n:C} is in {c:C}, {c:Am} and {c:F}, so it stays a chord tone for three bars. {c:G} has no {n:C}, so it moves a half step to {n:B}, the third of {c:G}.',
      alternative: {
        type: 'choice',
        prompt: 'You hold {n:C} through {c:C}, {c:Am} and {c:F}. The band moves to {c:G}. Where does the note go?',
        options: [
          { text: 'Down a fret to {n:B}', correct: true },
          { text: 'It stays on {n:C}', why: '{c:G} is {n:G} {n:B} {n:D}: no {n:C}, so it would rub on beat 1.' },
          { text: 'Up a fret to {n:C#}', why: '{n:C#} is not even in the scale.' },
        ],
        explain: '{n:B} is the third of {c:G}, one fret below {n:C}: the smallest move that lands on a chord tone.',
      },
    },
    {
      type: 'true-false',
      statement: 'Between the strong beats, any note of the scale can pass, even if it is not in the chord.',
      answer: true,
      explain: 'Passing notes on the weak beats join the chord tones into a line. Land on the chord at beat 1 and the ear forgives everything in between.',
      fact: 'chord-tones-strong-beats',
    },
    toolTask({
      id: 'eighths-between',
      title: 'Jam: two notes a beat between',
      tool: 'progressions',
      params: ['fifties-i-vi-iv-v', 'c', 'jam'],
      minutes: 5,
      body: 'Same jam, 66 BPM, now with eighth notes between the downbeats: chord tone on beat 1, scale notes after it. Record a minute on your phone and listen: do the beat 1s lock with the chords?',
    }),
    { generate: 'neck-tones', params: { what: 'chord', chords: ['C', 'Am', 'F', 'G'] } },
  ],
  facts: [
    { id: 'chord-tones-strong-beats', front: 'Where do chord tones go in a solo, and what goes in between?', back: 'On the strong beats, beat 1 above all. In between, any note of the scale can pass.' },
    { id: 'c-am-f-g-tones', front: 'The chord tones of {c:C}, {c:Am}, {c:F} and {c:G}?', back: '{c:C} {n:C} {n:E} {n:G}; {c:Am} {n:A} {n:C} {n:E}; {c:F} {n:F} {n:A} {n:C}; {c:G} {n:G} {n:B} {n:D}.' },
  ],
};

// ── 3. Aim for the third ───────────────────────────────────────────────────────────────────────

const targetNotes: TeacherLesson = {
  id: 'target-notes',
  title: 'Aim for the third',
  teaches: 'Land on the third of each new chord right at the change: over {c:C} {c:Am} {c:F} {c:G}, {n:E} {n:C} {n:A} {n:B}.',
  minutes: 5,
  skill: 'teacher:dev:target-notes',
  steps: [
    {
      type: 'card',
      title: 'The strongest move you have',
      body: 'The third tells the ear whether a chord is major or minor, so landing on it right at a change is the strongest move you have. Over {c:C} {c:Am} {c:F} {c:G} the thirds are {n:E}, {n:C}, {n:A} and {n:B}. Plan each phrase to arrive on the next chord\'s third and your solo starts to sound composed.',
      figure: { kind: 'fretboard', frets: [7, 10], dots: THIRDS_7_10, caption: 'The thirds: {n:E} for {c:C}, {n:C} for {c:Am}, {n:A} for {c:F}, {n:B} for {c:G}.' },
    },
    {
      type: 'choice',
      prompt: 'Which note is the third of {c:Am}?',
      options: [
        { text: '{n:C}', correct: true },
        { text: '{n:E}', why: '{n:E} is the fifth of {c:Am}: a chord tone, but not the one that says minor.' },
        { text: '{n:C#}', why: '{n:C#} would make it {c:A} major.' },
        { text: '{n:A}', why: '{n:A} is the root.' },
      ],
      explain: '{c:Am} is {n:A} {n:C} {n:E}. {n:C}, three half steps above {n:A}, is the minor third: the note that makes it minor.',
      fact: 'third-defines-chord',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each chord with its third.',
      pairs: [
        { left: '{c:C}', right: '{n:E}' },
        { left: '{c:Am}', right: '{n:C}' },
        { left: '{c:F}', right: '{n:A}' },
        { left: '{c:G}', right: '{n:B}' },
      ],
      explain: 'The middle note of each triad: {c:C} {n:C} {n:E} {n:G}, {c:Am} {n:A} {n:C} {n:E}, {c:F} {n:F} {n:A} {n:C}, {c:G} {n:G} {n:B} {n:D}.',
      fact: 'thirds-c-am-f-g',
    },
    {
      type: 'fretboard-find',
      prompt: 'In this position: tap every {n:A}, the third of {c:F}, from fret 7 to fret 10.',
      find: { note: 'A' },
      mode: 'all',
      octave: 'any',
      frets: [7, 10],
      explain: 'Two: string 4, fret 7 and string 2, fret 10. When the band goes to {c:F}, one of them is where your phrase lands.',
    },
    {
      type: 'fretboard-find',
      prompt: 'And every {n:B}, the third of {c:G}, from fret 7 to fret 10.',
      find: { note: 'B' },
      mode: 'all',
      octave: 'any',
      frets: [7, 10],
      explain: 'Three: string 6, fret 7, string 4, fret 9 and string 1, fret 7. {n:B} is a half step under {n:C}, the easiest target to slide into.',
    },
    {
      type: 'card',
      title: 'Travel to the target',
      body: 'Here is a line that lands on every third right on the change: {n:E} over {c:C}, {n:C} over {c:Am}, {n:A} over {c:F}, {n:B} over {c:G}. The last note before each change is a step from the next target, so the line walks into it.',
      figure: { kind: 'tab', tempo: 66, notes: TARGET_LINE, caption: 'Each bar starts on the third of its chord.' },
    },
    {
      type: 'play-phrase',
      prompt: 'Play the line: every bar starts on the third, every change is approached by a step.',
      notes: TARGET_LINE,
      octave: 'exact',
      tempo: 66,
      explain: '{n:E} {n:G} {n:B}, then {n:C} {n:B} {n:G}, then {n:A} {n:G} {n:C}, then {n:B}: {n:B} steps up to {n:C}, {n:G} up to {n:A}, {n:C} down to {n:B}.',
      alternative: {
        type: 'order',
        prompt: 'Put the four targets in the order of the changes: {c:C} {c:Am} {c:F} {c:G}.',
        tiles: ['{n:E}', '{n:C}', '{n:A}', '{n:B}'],
        distractors: ['{n:G}'],
        explain: 'The thirds, chord by chord: {n:E} for {c:C}, {n:C} for {c:Am}, {n:A} for {c:F}, {n:B} for {c:G}.',
      },
    },
    toolTask({
      id: 'thirds-only',
      title: 'Jam: only the thirds',
      tool: 'progressions',
      params: ['fifties-i-vi-iv-v', 'c', 'jam'],
      minutes: 5,
      body: 'Set the band to 66 BPM and play only the thirds, one per bar, on beat 1: {n:E} {n:C} {n:A} {n:B}. Then approach each one from a step above or below, on beat 4 of the bar before.',
    }),
    {
      type: 'fretboard-name',
      prompt: 'The root (R) is {n:G}. What interval is the note at string 1, fret 7 above it?',
      position: { string: 1, fret: 7 },
      root: { string: 2, fret: 8 },
      ask: 'interval',
      spelling: 'any',
      options: ['M3', 'm3', 'P4', 'M2'],
      explain: 'String 2, fret 8 is {n:G} and string 1, fret 7 is {n:B}, four half steps up: a major third. That is why {c:G} sounds major.',
      fact: 'third-defines-chord',
    },
    toolTask({
      id: 'land-on-thirds',
      title: 'Jam: a free solo on the thirds',
      tool: 'progressions',
      params: ['fifties-i-vi-iv-v', 'c', 'jam'],
      minutes: 5,
      body: 'Now 72 BPM and play freely, but land on the third at every change. Record a take: does it sound like you meant every change?',
    }),
    {
      type: 'true-false',
      statement: 'The third of a chord is the note that tells the ear whether it is major or minor.',
      answer: true,
      explain: 'Root and fifth are the same in {c:A} and {c:Am}; only the third changes, {n:C#} or {n:C}. Land on it and the ear hears the new chord at once.',
      fact: 'third-defines-chord',
    },
  ],
  facts: [
    { id: 'third-defines-chord', front: 'Why aim for the third at a chord change?', back: 'The third tells the ear whether the chord is major or minor, so landing on it says "new chord" louder than any other note.' },
    { id: 'thirds-c-am-f-g', front: 'The thirds of {c:C}, {c:Am}, {c:F} and {c:G}?', back: '{n:E}, {n:C}, {n:A} and {n:B}.' },
    { id: 'approach-by-step', front: 'How do you walk into a target note?', back: 'Play a note a step above or below it just before the change, then land on the target right on beat 1.' },
  ],
};

// ── 4. Motifs and space ────────────────────────────────────────────────────────────────────────

const motifsAndSpace: TeacherLesson = {
  id: 'motifs-and-space',
  title: 'Motifs and space',
  teaches: 'Build a solo from one short motif: play it, repeat it, vary it, and leave space between the phrases.',
  minutes: 5,
  skill: 'teacher:dev:motifs-and-space',
  steps: [
    {
      type: 'card',
      title: 'Develop one idea',
      body: 'Great solos are not strings of licks; they develop an idea. Take a short {t:motif}, three to five notes. Play it, repeat it, then vary it: change the rhythm, move it to another chord tone, add a bend at the end. And leave space between phrases, so the band and the listener can breathe.',
      figure: { kind: 'tab', tempo: 72, notes: MOTIF, caption: 'My motif: {n:A} {n:C} {n:E} {n:D}, then a bar of space.' },
    },
    {
      type: 'choice',
      prompt: 'My first variation. What changed?',
      figure: { kind: 'tab', tempo: 72, notes: MOTIF_NEW_NOTES, caption: 'Variation 1.' },
      options: [
        { text: 'The notes; the rhythm stayed', correct: true },
        { text: 'The rhythm; the notes stayed', why: 'The rhythm is the same: two eighths, a quarter, a half. The notes are new.' },
        { text: 'It moved up an octave', why: 'An octave up would be the same notes. These are new ones: {n:C} {n:E} {n:A} {n:G}.' },
      ],
      explain: 'Same rhythm and the same shape, up, up, then down a step, on new notes: {n:C} {n:E} {n:A} {n:G} instead of {n:A} {n:C} {n:E} {n:D}. The ear hears the same idea, moved.',
      fact: 'motif-variations',
    },
    {
      type: 'choice',
      prompt: 'Variation 2. What changed this time?',
      figure: { kind: 'tab', tempo: 72, notes: MOTIF_NEW_RHYTHM, caption: 'Variation 2.' },
      options: [
        { text: 'The rhythm; the notes stayed', correct: true },
        { text: 'The notes; the rhythm stayed', why: 'The notes are the same {n:A} {n:C} {n:E} {n:D}: only their lengths changed.' },
        { text: 'A bend was added', why: 'No bend here: the same four notes.' },
      ],
      explain: 'Same four notes, new rhythm: a long {n:A} (a dotted quarter), a short {n:C}, then even quarters. Rhythm is the cheapest variation and one of the strongest.',
      fact: 'motif-variations',
    },
    {
      type: 'choice',
      prompt: 'Variation 3. What changed?',
      figure: { kind: 'tab', tempo: 72, notes: MOTIF_UP_THE_NECK, caption: 'Variation 3.' },
      options: [
        { text: 'It moved up the neck, an octave higher', correct: true },
        { text: 'The rhythm; the notes stayed', why: 'The rhythm is the original one. Look at the frets: 14, 13, 12, 15.' },
        { text: 'The notes changed to a new scale', why: 'Still {n:A} {n:C} {n:E} {n:D}, just an octave up.' },
      ],
      explain: 'The same notes and rhythm an octave higher, in box 4: string 3, fret 14 ({n:A}), string 2, fret 13 ({n:C}), string 1, fret 12 ({n:E}), string 2, fret 15 ({n:D}). Moving up the neck lifts the energy.',
      fact: 'motif-variations',
    },
    {
      type: 'card',
      title: 'Variation 4, and the space',
      body: 'The last one is the motif extended: one more note, {n:G} at string 2, fret 8, bent a whole step up to {n:A}, the bend from Lick: Bends in Tune. Notice every version ends with space. A bar of rest is not a gap; it is the band\'s turn.',
      figure: { kind: 'tab', tempo: 72, notes: MOTIF_WITH_BEND, caption: 'Variation 4: bend the last note up a whole step.' },
    },
    {
      type: 'play-phrase',
      prompt: 'Play my motif at 72 BPM: {n:A} {n:C} {n:E} {n:D}, then a full bar of silence.',
      notes: MOTIF.filter((n) => !('rest' in n)),
      octave: 'exact',
      tempo: 72,
      explain: 'String 4, fret 7 ({n:A}), string 3, fret 5 ({n:C}), string 2, fret 5 ({n:E}), then string 3, fret 7 ({n:D}), held for two beats. Then nothing: count the empty bar.',
      alternative: {
        type: 'order',
        prompt: 'Put my motif in order.',
        tiles: ['{n:A}', '{n:C}', '{n:E}', '{n:D}'],
        distractors: ['{n:G}'],
        explain: '{n:A} {n:C} {n:E}, up, up, then down a step to {n:D}: four notes of A minor pentatonic box 1.',
      },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap the motif\'s rhythm, then sit through the bar of space without a tap.',
      rhythm: { pattern: 'e e q h | wr' },
      tempo: 72,
      show: 'both',
      explain: 'Two eighths, a quarter, a half, then a whole bar of rest. Counting through the silence is a skill: come back in on time.',
      fact: 'space-between-phrases',
    },
    toolTask({
      id: 'motif-jam',
      title: 'Jam: one motif, four variations',
      tool: 'progressions',
      params: ['minor-i-bvi-bvii', 'a', 'jam'],
      minutes: 6,
      body: 'Set the band to 92 BPM: {c:Am} {c:F} {c:G} {c:Am}. Pick one motif, mine or yours, and play at least four variations of it, with a bar of rest after every phrase.',
      tip: 'Stuck? Change one thing only: the rhythm, the start note, or the octave.',
    }),
    {
      type: 'true-false',
      statement: 'A solo with rests in it sounds less finished than one with a note on every beat.',
      answer: false,
      explain: 'Space makes the phrases readable: the listener hears where each idea starts and ends, and the band gets room to answer.',
      fact: 'space-between-phrases',
    },
    toolTask({
      id: 'motif-record',
      title: 'Record two minutes',
      tool: 'progressions',
      params: ['minor-i-bvi-bvii', 'a', 'jam'],
      minutes: 4,
      body: 'Same jam, 92 BPM. Record a two-minute solo on your phone, then listen back and count how often you came back to your motif.',
    }),
    {
      type: 'choice',
      prompt: 'You listen back: the motif came once, then two minutes of new ideas. What do you try on the next take?',
      options: [
        { text: 'Bring the motif back, varied, every few bars', correct: true },
        { text: 'Play more notes so it sounds busier', why: 'More notes is not more story. Come back to the idea.' },
        { text: 'Learn a few new licks first', why: 'Licks help, but a solo hangs together because one idea keeps returning.' },
      ],
      explain: 'Repetition with change is what makes a solo sound composed. The listener recognises the motif and follows what you do to it.',
      fact: 'motif-variations',
    },
  ],
  facts: [
    { id: 'motif-variations', front: 'Name three ways to vary a motif.', back: 'Change its rhythm; move it to other notes or another chord tone; move it up the neck; add a bend at the end.' },
    { id: 'space-between-phrases', front: 'Why leave space between phrases?', back: 'So the band and the listener can breathe: each idea is heard, and the band gets room to answer.' },
  ],
};

// ── 5. Two new colours: Dorian and Mixolydian ──────────────────────────────────────────────────

const A_DORIAN_FIFTH = modeDots('A', 'dorian', 'F#', [4, 8]);
const A_MIXOLYDIAN_FIFTH = modeDots('A', 'mixolydian', 'G', [4, 8]);

const dorianAndMixolydian: TeacherLesson = {
  id: 'dorian-and-mixolydian',
  title: 'Two new colours: Dorian and Mixolydian',
  teaches: 'A Dorian is A minor with {n:F#}, over {c:Am} to {c:D}; A Mixolydian is A major with {n:G}, over {c:A} to {c:G}.',
  minutes: 5,
  skill: 'teacher:dev:dorian-and-mixolydian',
  steps: [
    {
      type: 'card',
      title: 'Dorian: minor, but brighter',
      body: 'A Dorian is A minor with {n:F#} instead of {n:F}: it still sounds minor, but brighter. Its vamp is {c:Am} (x02210) to {c:D} (xx0232), and the {c:D} chord carries the {n:F#} at string 1, fret 2. That one note is the {t:colour-note}.',
      figure: { kind: 'fretboard', frets: [4, 8], dots: A_DORIAN_FIFTH, caption: 'A Dorian in fifth position: {n:F#} marked.' },
    },
    {
      type: 'choice',
      prompt: 'Which note turns A minor into A Dorian?',
      options: [
        { text: '{n:F#}', correct: true },
        { text: '{n:C#}', why: '{n:C#} would make the chord on {n:A} major. Dorian keeps the minor third, {n:C}.' },
        { text: '{n:G#}', why: '{n:G#} gives the harmonic minor, a different, darker colour.' },
        { text: '{n:Bb}', why: '{n:Bb} gives Phrygian, the darkest of the minor modes.' },
      ],
      explain: 'A minor is {n:A} {n:B} {n:C} {n:D} {n:E} {n:F} {n:G}. Raise {n:F} to {n:F#} and you have A Dorian: a minor scale with a bright sixth.',
      fact: 'dorian-colour',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap both {n:F#}s in fifth position, frets 4 to 8.',
      find: { note: 'F#' },
      mode: 'all',
      octave: 'any',
      frets: [4, 8],
      explain: 'String 4, fret 4 and string 2, fret 7. The Dorian study leans on the one at string 2, fret 7 every time the band plays {c:D}.',
    },
    {
      type: 'card',
      title: 'Mixolydian: major, but bluesy',
      body: 'A Mixolydian is A major with {n:G} instead of {n:G#}: it sounds major, but bluesy and relaxed. Its vamp is {c:A} (x02220) to {c:G} (320003). Many fiddle tunes live here: Old Joe Clark and Red Haired Boy are A Mixolydian. And Drunken Sailor, which you know, is E Dorian.',
      figure: { kind: 'fretboard', frets: [4, 8], dots: A_MIXOLYDIAN_FIFTH, caption: 'A Mixolydian in fifth position: {n:G} marked.' },
    },
    {
      type: 'choice',
      prompt: 'Which note turns A major into A Mixolydian?',
      options: [
        { text: '{n:G}', correct: true },
        { text: '{n:G#}', why: '{n:G#} is the note A major already has. Mixolydian lowers it.' },
        { text: '{n:F}', why: 'Lowering {n:F#} would give another mode. Mixolydian keeps {n:F#}.' },
        { text: '{n:C}', why: '{n:C} would make it minor. Mixolydian keeps the major third, {n:C#}.' },
      ],
      explain: 'A major is {n:A} {n:B} {n:C#} {n:D} {n:E} {n:F#} {n:G#}. Lower {n:G#} to {n:G} and you have A Mixolydian: major with a flat seventh.',
      fact: 'mixolydian-colour',
    },
    playerTask({
      id: 'dorian-study',
      title: 'Mode Study: A Dorian',
      song: 'st-mode-dorian',
      tempo: 75,
      minutes: 5,
      body: 'At 75 % (72 BPM), fifth position. Over every {c:D} the melody lands on {n:F#}: lean on it and hear the colour.',
    }),
    {
      type: 'listen-choice',
      prompt: 'Listen to this vamp. Which colour is it?',
      sound: { kind: 'progression', chords: ['Am', 'D', 'Am', 'D'], beats: 4, tempo: 96 },
      options: [{ text: 'Dorian: minor with a bright sixth', correct: true }, { text: 'Mixolydian: major with a flat seventh' }],
      shuffle: false,
      explain: 'Home is {c:Am}, so it is minor, and the {c:D} chord carries {n:F#}: A Dorian.',
      fact: 'mode-vamps',
    },
    playerTask({
      id: 'mixolydian-study',
      title: 'Mode Study: A Mixolydian',
      song: 'st-mode-mixolydian',
      tempo: 69,
      minutes: 5,
      body: 'At 69 % (72 BPM), second position with open strings. Over every {c:G} the tune lands on {n:G}; it ends {n:G} to {n:A}, the flat seventh rising home.',
    }),
    toolTask({
      id: 'mixolydian-jam',
      title: 'Jam: land on the G',
      tool: 'progressions',
      params: ['mixolydian-i-bvii', 'a', 'jam'],
      minutes: 5,
      body: 'Set the band to 104 BPM: {c:A} to {c:G}. Improvise in A Mixolydian and land on {n:G} at least four times, best over the {c:G} chord.',
    }),
    {
      type: 'listen-choice',
      prompt: 'And this vamp?',
      sound: { kind: 'progression', chords: ['A', 'G', 'A', 'G'], beats: 4, tempo: 104 },
      options: [{ text: 'Dorian: minor with a bright sixth' }, { text: 'Mixolydian: major with a flat seventh', correct: true }],
      shuffle: false,
      explain: 'Home is {c:A} major, and the {c:G} chord is built on the flat seventh, {n:G}: A Mixolydian.',
      fact: 'mode-vamps',
    },
    playerTask({
      id: 'old-joe-clark',
      title: 'Old Joe Clark',
      song: 'old-joe-clark',
      tempo: 83,
      minutes: 5,
      body: 'At 83 % (80 BPM), then 100 % (96 BPM). Every G in this tune is natural: that is the Mixolydian sound.',
      fallback: {
        tool: 'player',
        params: ['st-mode-mixolydian', 't92'],
        title: 'A Mixolydian at fiddle speed',
        body: 'Old Joe Clark is not in the Songs library yet. Meanwhile, play Mode Study: A Mixolydian at 92 % (96 BPM), the tune\'s speed. Every G is natural.',
      },
    }),
    {
      type: 'true-false',
      statement: 'Drunken Sailor is in E Dorian: E minor with {n:C#} instead of {n:C}.',
      answer: true,
      explain: 'E minor is {n:E} {n:F#} {n:G} {n:A} {n:B} {n:C} {n:D}. Raise the sixth, {n:C}, to {n:C#} and you have E Dorian, the colour of the shanty\'s tune.',
      fact: 'modal-tunes',
    },
    playerTask({
      id: 'red-haired-boy',
      title: 'Red Haired Boy',
      song: 'red-haired-boy',
      mode: 'wait',
      minutes: 5,
      body: 'The same mode in a longer tune, in wait mode. G natural all the way, over {c:A}, {c:D} and {c:G}.',
      fallback: {
        tool: 'player',
        params: ['drunken-sailor', 'wait'],
        title: 'Drunken Sailor: E Dorian',
        body: 'Red Haired Boy is not in the Songs library yet. Meanwhile, the other colour: in Drunken Sailor pick the Tune track as yours and play it in wait mode. Listen for the {n:C#}, the bright sixth of E Dorian.',
      },
    }),
    { generate: 'scale-ear', params: { scales: ['dorian', 'mixolydian'] } },
  ],
  facts: [
    { id: 'dorian-colour', front: 'What is A Dorian, and how does it sound?', back: 'A minor with {n:F#} instead of {n:F}: minor, but brighter. Its vamp is {c:Am} to {c:D}.' },
    { id: 'mixolydian-colour', front: 'What is A Mixolydian, and how does it sound?', back: 'A major with {n:G} instead of {n:G#}: major, but bluesy and relaxed. Its vamp is {c:A} to {c:G}.' },
    { id: 'mode-vamps', front: 'Which chord carries the colour note in the Dorian and Mixolydian vamps in A?', back: 'Dorian {c:Am} to {c:D}: {c:D} carries {n:F#}. Mixolydian {c:A} to {c:G}: {c:G} is built on {n:G}.' },
    { id: 'modal-tunes', front: 'Name tunes in A Mixolydian and E Dorian.', back: 'Old Joe Clark and Red Haired Boy are A Mixolydian; Drunken Sailor is E Dorian.' },
  ],
};

// ── 6. A solo with a story (milestone) ─────────────────────────────────────────────────────────

const soloWithAStory: TeacherLesson = {
  id: 'solo-with-a-story',
  title: 'A solo with a story',
  teaches: 'A solo with a story starts low with a motif, climbs, peaks in the second chorus and ends clearly on {n:A}.',
  minutes: 5,
  skill: 'teacher:dev:solo-with-a-story',
  steps: [
    {
      type: 'card',
      title: 'Give it a shape',
      body: 'A solo with a story has a shape. Start low and simple, with a motif. Build: move up the neck, play more notes, add bends. Peak in the second chorus. Then wind down and end clearly on the home note. Plan it on paper first, then let it breathe when you play.',
      tip: 'Plan the shape, not the notes. The notes come on the night.',
    },
    {
      type: 'order',
      prompt: 'Put the story of the solo in order.',
      tiles: ['Motif, low', 'Climb', 'Peak', 'Wind down', 'End on {n:A}'],
      explain: 'Low and simple, then up the neck with more notes and bends, the peak in chorus 2, down again, and a clear last note on {n:A}.',
      fact: 'solo-shape',
    },
    {
      type: 'card',
      title: 'Your map: two choruses in A',
      body: 'Chorus 1: boxes 5 and 1, low, your motif with space around it. Chorus 2: climb through boxes 2 and 3 with more notes and bends, peak in box 4 (from fret 12) around bar 9, then wind down to box 1 and land on {n:A}. Write it down.',
      figure: { kind: 'fretboard', frets: [2, 14], root: 'A', labels: 'degree', derive: { scale: 'minor-pentatonic', tonic: 'A' }, caption: 'From box 5 at fret 2 up to box 4, which starts at fret 12.' },
    },
    {
      type: 'choice',
      prompt: 'Where does the peak of your solo go?',
      options: [
        { text: 'Box 4, in the second chorus', correct: true },
        { text: 'Box 1, right at the start', why: 'Start low and simple. A solo that peaks at once has nowhere to go.' },
        { text: 'The very last bar', why: 'The last bars wind down to the home note. The peak comes before.' },
      ],
      explain: 'Chorus 1 sets up the motif, chorus 2 climbs, and box 4 around bar 9 is the high point. After that, come home.',
      fact: 'solo-shape',
    },
    playerTask({
      id: 'climb-route',
      title: 'The route up the neck',
      song: 'st-pent-connect',
      bars: [1, 8],
      tempo: 91,
      minutes: 4,
      body: 'Warm up the climb: Pentatonic Across the Neck, bars 1 to 8, at 91 % (80 BPM). Box 5 up to box 4, a slide into each one: that is your route for chorus 2.',
    }),
    playerTask({
      id: 'peak-bends',
      title: 'Bends for the peak',
      song: 'st-lick-bend',
      minutes: 4,
      body: 'Lick: Bends in Tune at 72 BPM. Bends are your peak: hear the target, then bend up to it. Whole steps in tune, every time.',
    }),
    {
      type: 'true-false',
      statement: 'A clear ending lands on the home note, {n:A}, and lets it ring.',
      answer: true,
      explain: 'The last note tells the listener the story is over. Land on {n:A}, hold it, add a little vibrato, and stop.',
      fact: 'solo-shape',
    },
    playerTask({
      id: 'ending-vibrato',
      title: 'Long notes for the ending',
      song: 'st-lick-vibrato',
      minutes: 4,
      body: 'Lick: Vibrato at 60 BPM: short runs into long notes that sing. Your solo\'s last {n:A} gets the same treatment.',
    }),
    {
      type: 'choice',
      prompt: 'Before you record, check my list. Which one is NOT on it?',
      options: [
        { text: 'Every box in the first chorus', correct: true },
        { text: 'A motif, with space around it', why: 'That is on the list: it is how the story starts.' },
        { text: 'Target notes at the changes', why: 'On the list: thirds and roots right on the change.' },
        { text: 'A clear ending on {n:A}', why: 'On the list: the last word.' },
      ],
      explain: 'The list: a motif, space, at least two techniques (slides, bends, vibrato), target notes at the changes and a clear ending on {n:A}. Chorus 1 stays low on purpose.',
      fact: 'solo-checklist',
    },
    toolTask({
      id: 'story-jam',
      title: 'Jam: two choruses, three takes',
      tool: 'progressions',
      params: ['blues-quick-change', 'a', 'jam'],
      minutes: 8,
      body: 'Set the band to 92 BPM: the 12-bar in A with the quick change. Play your two choruses three times, recording each take on your phone. Keep the best and check it against my list.',
      tip: 'A wrong note at the peak is fine. Bend it, repeat it, make it sound meant.',
    }),
    {
      type: 'play-phrase',
      id: 'show',
      prompt: 'Your show: the ending you planned, down box 1 to the {n:A} at string 4, fret 7. Count in, and let that last note ring.',
      notes: SOLO_ENDING,
      octave: 'exact',
      tempo: 80,
      pass: 0.8,
      explain: '{n:C} {n:A} {n:G} {n:E}, {n:D} {n:C}, then {n:A}: down box 1 to the home note, held for two beats. Six of the seven notes is a pass.',
      alternative: {
        type: 'order',
        prompt: 'Put the notes of the ending in order, high to low.',
        tiles: ['{n:C}', '{n:A}', '{n:G}', '{n:E}', '{n:D}', '{n:C}', '{n:A}'],
        explain: '{n:C} {n:A} {n:G} {n:E} {n:D} {n:C} {n:A}: A minor pentatonic, walking down to the home note.',
      },
    },
  ],
  facts: [
    { id: 'solo-shape', front: 'The shape of a solo with a story?', back: 'Start low and simple with a motif; build up the neck with more notes and bends; peak in the second chorus; wind down and end on the home note.' },
    { id: 'solo-checklist', front: 'Dev\'s checklist for a recorded solo?', back: 'A motif, space, at least two techniques, target notes at the changes, and a clear ending on the home note.' },
  ],
};

/** Unit 11 of Dev's course. */
const unit: TeacherUnit = {
  id: 'dev-improvising',
  title: 'Improvising with intent',
  theme: 'improvisation',
  description: 'Make solos follow the chords with arpeggios and target notes, build them from motifs, and add Dorian and Mixolydian.',
  lessons: [arpeggios, chordTonesOnTheBeat, targetNotes, motifsAndSpace, dorianAndMixolydian, soloWithAStory],
  checkpoint: { sample: 8, maxMistakes: 2 },
  milestone: {
    lesson: 'solo-with-a-story',
    step: 'show',
    piece: 'your two-chorus solo',
    celebrate: 'You planned a solo, played it with a beginning, a climb and an ending, and landed it on {n:A}. That is not noodling any more: that is saying something. Next: doing it by ear, in a band.',
  },
  glossary: [
    { id: 'chord-tone', term: 'chord tone', definition: 'A note that belongs to the chord being played. A phrase that ends on one sounds settled.' },
    { id: 'passing-note', term: 'passing note', definition: 'A note between two chord tones, on a weak beat, that joins them into a line. It need not be in the chord.' },
    { id: 'motif', term: 'motif', definition: 'A short musical idea, three to five notes, that a solo repeats and varies so the listener can follow it.' },
    { id: 'colour-note', term: 'colour note', definition: 'The note that sets a mode apart from plain major or minor: the bright sixth of Dorian, the flat seventh of Mixolydian.' },
  ],
};

export default unit;
