/**
 * Prof. Elena Varga, unit 5: Jazz harmony and comping (plan: `elena/elena-jazz-harmony` in
 * src/content/plan/teachers.json).
 *
 * Elena's voice: conservatory rigour, dry humour, high standards, deep respect for the student.
 * Every lesson follows its plan entry: the `explain` on the cards, the `show` as chord boxes and
 * fretboards with each tone labelled, staff and rhythm figures, the `practice` as in-lesson
 * exercises (every chord the microphone hears has a chord-build alternative) or tasks that send the
 * learner to the Player, the jam tracks of Progressions and Ear Training, and back.
 *
 * Two places where the lessons say more than the plan, on purpose (see the report): the drop-2
 * grips on strings 4 to 1 have a chord tone other than the root at the bottom, which the cards say;
 * and the drop-3 lesson comps with the root-on-5 Cmaj7 (x3x453), which stays under the hand after
 * G7 (3x343x), while the plan's root-on-6 Cmaj7 (8x998x) is taught as the grip five frets away.
 * The guide-tone lesson's no-microphone way is an in-lesson exercise, not the Player's wait mode
 * (which listens too). Voicings that leave a tone of their symbol out (the shells, the ninths and
 * the thirteenth, the bossa {c:D7}) are checked by the microphone picked string by string (`picked`), not strummed:
 * the strum check scores a strum against every tone of the symbol, so it cannot pass them reliably
 * (the test simulates it). Full four-note grips are strummed.
 *
 * Music from the library: Jazz Comping: Shell Voicings (`st-jazz-shells`, 120 BPM), Jazz Comping:
 * Drop-2 Voicings (`st-jazz-drop2`, 120 BPM), Jazz Comping: Minor ii-V-i (`st-jazz-minor-ii-v`,
 * 116 BPM, a bossa) and Bossa-Style Groove (`st-bossa-groove`, 116 BPM). The jams are the ii-V-I in
 * C and F, the swung minor ii-V-i, the I-vi-ii-V, the Dorian vamp and the minor bossa loop of
 * `@/content/progressions`. The minor study is a bossa only, so the plan's swung version of it is
 * a jam on the swung minor ii-V-i. `elena-jazz-harmony.test.ts` cross-checks every shape, tone, voice
 * motion, tempo and chart against the engines and the library.
 */
import type { TabNote } from '@/lessons';
import type { TeacherLesson, TeacherUnit } from '../types';
import { playerTask, toolTask } from '../tasks';

/**
 * A shape picked one string at a time, low to high, in quarter notes. The microphone's chord check
 * compares a strum with every tone of the chord symbol, so a voicing that leaves tones out (a
 * shell without its fifth, a {c:G13} without its fifth and ninth) can sound perfect and still fail
 * it; picked string by string, every note of the grip is checked exactly.
 */
export function picked(shape: string): TabNote[] {
  const frets = shape.includes('-') ? shape.split('-') : shape.split('');
  return frets.flatMap((f, i) => (f === 'x' ? [] : [{ string: 6 - i, fret: Number(f), duration: 'q' as const }]));
}

/** The shapes the unit teaches, low string first (two-digit frets hyphenated). */
export const SHAPES = {
  shells: { Dm7: 'x535xx', G7: '3x34xx', Cmaj7: 'x324xx', Am7: '5x55xx' },
  drop2: { Dm7: 'xx3535', G7: 'xx3433', Cmaj7: 'xx2413' },
  drop2F: { Gm7: 'x-x-8-10-8-10', C7: 'xx8988', Fmaj7: 'xx7968' },
  drop3: { Dm7: 'x5x565', G7: '3x343x', Cmaj7: 'x3x453', Cmaj7Root6: '8x998x' },
  drop3F: { Gm7: 'x-10-x-10-11-10', C7: '8x898x', Fmaj7: 'x-8-x-9-10-8' },
  extended: { Dm9: 'x5355x', G13: '3x345x', Cmaj9: 'x3243x' },
  minor: { Bm7b5: 'x2323x', E7: 'xx2434', Am7: 'xx2213', Am6: 'xx2212' },
  bossa: { Am7: '5x555x', D7: 'x5453x' },
} as const;

/** The two guide-tone lines of Dm7-G7-Cmaj7, on strings 3 and 4. */
export const GUIDE_LINES = {
  sevenths: [
    { string: 3, fret: 5, duration: 'h' },
    { string: 3, fret: 4, duration: 'h' },
    { string: 3, fret: 4, duration: 'h' },
  ],
  thirds: [
    { string: 4, fret: 3, duration: 'h' },
    { string: 4, fret: 3, duration: 'h' },
    { string: 4, fret: 2, duration: 'h' },
  ],
} as const;

// ── 1. Shell voicings on a ii-V-I ───────────────────────────────────────────────────────────────

const shellsIiVI: TeacherLesson = {
  id: 'shells-ii-v-i',
  title: 'Shell voicings on a two-five-one',
  teaches: 'A shell is root, third and seventh: the fifth goes unless it is altered, and the hand barely moves.',
  minutes: 5,
  skill: 'teacher:elena:shells-ii-v-i',
  steps: [
    {
      type: 'card',
      title: 'Three notes are a chord',
      body: 'The third and the seventh define a chord\'s quality. The fifth adds almost nothing unless it is altered, as in {c:Bm7b5}, so jazz guitarists drop it. What remains is a {t:shell-voicing|shell}: root, third and seventh. {c:Dm7} as a shell: x535xx.',
      figure: {
        kind: 'fretboard',
        frets: [2, 6],
        root: 'D',
        labels: 'degree',
        dots: [
          { string: 5, fret: 5, degree: '1', role: 'root' },
          { string: 4, fret: 3, degree: 'b3', role: 'third' },
          { string: 3, fret: 5, degree: 'b7', role: 'seventh' },
        ],
        caption: '{c:Dm7} shell: root, minor third, minor seventh.',
      },
    },
    {
      type: 'choice',
      prompt: 'Which tone of {c:G7} may a shell leave out?',
      options: [
        { text: 'The fifth, {n:D}', correct: true },
        { text: 'The third, {n:B}', why: 'Without {n:B} nobody can tell {c:G7} from {c:Gm7}. The third stays.' },
        { text: 'The seventh, {n:F}', why: 'Without {n:F} it is a plain {c:G} triad. The seventh stays.' },
      ],
      explain: '{c:G7} is {n:G} {n:B} {n:D} {n:F}. The third and seventh give its quality, the root its name; the unaltered fifth, {n:D}, can go.',
      fact: 'jazz-shell-tones',
    },
    {
      type: 'card',
      title: 'The three shells',
      body: 'For {r:ii}–{r:V}–{r:I} in {k:C major}: {c:Dm7} (x535xx), {c:G7} (3x34xx) and {c:Cmaj7} (x324xx). The root moves between strings 5 and 6, so the hand barely moves: the upper notes stay or step by one fret.',
      figure: {
        kind: 'fretboard',
        frets: [2, 6],
        root: 'G',
        labels: 'degree',
        dots: [
          { string: 6, fret: 3, degree: '1', role: 'root' },
          { string: 4, fret: 3, degree: 'b7', role: 'seventh' },
          { string: 3, fret: 4, degree: '3', role: 'third' },
        ],
        caption: '{c:G7} shell: root on string 6, seventh, third.',
      },
      tip: 'Strum only the three strings of the shell; the fretting fingers rest lightly on the others to mute them.',
    },
    {
      type: 'play-phrase',
      prompt: 'The {c:Dm7} shell, x535xx: pick strings 5, 4 and 3 in turn, then strum them.',
      notes: picked(SHAPES.shells.Dm7),
      octave: 'exact',
      tempo: 60,
      explain: 'String 5 fret 5 ({n:D}), string 4 fret 3 ({n:F}), string 3 fret 5 ({n:C}): root, third, seventh. One string at a time, a muffled finger cannot hide.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'Dm7', frets: SHAPES.shells.Dm7, accept: 'this-shape', prompt: 'Build the {c:Dm7} shell: root on string 5, strings 2 and 1 muted.', explain: 'x535xx: {n:D} on string 5 fret 5, {n:F} on string 4 fret 3, {n:C} on string 3 fret 5.' },
    },
    {
      type: 'play-phrase',
      prompt: 'Now the {c:G7} shell, 3x34xx, string 5 muted: strings 6, 4 and 3 in turn.',
      notes: picked(SHAPES.shells.G7),
      octave: 'exact',
      tempo: 60,
      explain: 'String 6 fret 3 ({n:G}), string 4 fret 3 ({n:F}), string 3 fret 4 ({n:B}). {n:F} did not move from {c:Dm7}; {n:C} fell to {n:B}.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'G7', frets: SHAPES.shells.G7, accept: 'this-shape', prompt: 'Build the {c:G7} shell: root on string 6, string 5 muted.', explain: '3x34xx: {n:G} on string 6, {n:F} on string 4 fret 3, {n:B} on string 3 fret 4.' },
    },
    {
      type: 'play-phrase',
      prompt: 'And the {c:Cmaj7} shell, x324xx: strings 5, 4 and 3 in turn.',
      notes: picked(SHAPES.shells.Cmaj7),
      octave: 'exact',
      tempo: 60,
      explain: 'String 5 fret 3 ({n:C}), string 4 fret 2 ({n:E}), string 3 fret 4 ({n:B}). {n:B} stayed; {n:F} fell to {n:E}.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'Cmaj7', frets: SHAPES.shells.Cmaj7, accept: 'this-shape', prompt: 'Build the {c:Cmaj7} shell: root on string 5.', explain: 'x324xx: {n:C} on string 5 fret 3, {n:E} on string 4 fret 2, {n:B} on string 3 fret 4.' },
    },
    {
      type: 'card',
      title: 'Short, then Charleston',
      body: 'Comp first in short quarter notes: squeeze for the chord, relax at once, so each one stops before the next, like a soft drum. Then the {t:charleston|Charleston}: beat 1 and the and of 2, then silence. In the study it swings, so that second chord comes late and lazy.',
      figure: { kind: 'rhythm', pattern: 'q. e hr', tempo: 100, caption: 'The Charleston: beat 1 and the and of 2.' },
    },
    playerTask({
      id: 'shells-quarters',
      title: 'Shells four to the bar',
      song: 'st-jazz-shells',
      bars: [1, 8],
      tempo: 83,
      minutes: 4,
      body: 'Bars 1 to 8 of the shell study at 83 % (100 {t:bpm|BPM}): short quarter notes, every chord stopped before the next. Watch how little the hand moves while the walking bass does the travelling.',
    }),
    {
      type: 'tap-rhythm',
      prompt: 'Tap two bars of the Charleston with the click.',
      rhythm: { pattern: 'q. e hr | q. e hr' },
      tempo: 100,
      show: 'both',
      explain: 'Beat 1, then the and of 2, then rest through beats 3 and 4. Straight here; swung in the study, the second chord falls on the last third of beat 2.',
      fact: 'jazz-charleston',
    },
    playerTask({
      id: 'shells-charleston',
      title: 'Shells in the Charleston',
      song: 'st-jazz-shells',
      bars: [9, 16],
      tempo: 83,
      minutes: 4,
      body: 'Bars 9 to 16 at 83 % (100 {t:bpm|BPM}), the Charleston: beat 1, then the and of 2, swung. Count "1 trip-let 2 trip-LET" and play on the 1 and on that last syllable.',
    }),
    toolTask({
      id: 'jam-shells',
      title: 'Jam: shells only',
      tool: 'progressions',
      params: ['jazz-ii-v-i', 'c', 'jam'],
      minutes: 5,
      body: 'The {r:ii}–{r:V}–{r:I} jam in {k:C major} at 110 {t:bpm|BPM}: shells only, nothing else. Four to the bar for a chorus, then the Charleston for a chorus.',
    }),
    { generate: 'chord-tones', params: { types: ['m7', '7', 'maj7'], roots: ['D', 'G', 'C'], ask: 'tone' } },
  ],
  facts: [
    { id: 'jazz-shell-tones', front: 'Which tones does a shell voicing keep?', back: 'Root, third and seventh. The fifth goes, unless it is altered (as in {c:Bm7b5}).' },
    { id: 'jazz-shells-c', front: 'The shells of {c:Dm7}, {c:G7} and {c:Cmaj7}?', back: 'x535xx, 3x34xx and x324xx: the root alternates between strings 5 and 6.' },
    { id: 'jazz-charleston', front: 'What is the Charleston comping rhythm?', back: 'A chord on beat 1 and another on the and of 2, then two beats of space.' },
  ],
};

// ── 2. Guide tones ──────────────────────────────────────────────────────────────────────────────

const guideTones: TeacherLesson = {
  id: 'guide-tones',
  title: 'Guide tones',
  teaches: 'In a two-five-one each seventh falls a half step to the next third, and each third stays as the next seventh.',
  minutes: 5,
  skill: 'teacher:elena:guide-tones',
  steps: [
    {
      type: 'card',
      title: 'Two voices carry the harmony',
      body: 'A chord\'s third and seventh are its {t:guide-tone|guide tones}. Through {c:Dm7}, {c:G7} and {c:Cmaj7}, each seventh falls a half step to become the next chord\'s third, and each third stays to become the next seventh. {n:C}, the seventh of {c:Dm7}, falls to {n:B}, the third of {c:G7}, which stays as the seventh of {c:Cmaj7}.',
      figure: {
        kind: 'staff',
        time: '4/4',
        notes: [
          { note: 'C4', duration: 'w', label: '7th' },
          { note: 'B3', duration: 'w', label: '3rd' },
          { note: 'B3', duration: 'w', label: '7th' },
        ],
        caption: 'Line one, {c:Dm7} to {c:G7} to {c:Cmaj7}: {n:C} {n:B} {n:B}.',
      },
    },
    {
      type: 'fill-blanks',
      prompt: 'Fill in the missing third or seventh of each chord.',
      text: '{c:Dm7}: ___ and {n:C}    {c:G7}: ___ and ___    {c:Cmaj7}: ___ and {n:B}',
      blanks: ['{n:F}', '{n:B}', '{n:F}', '{n:E}'],
      bank: ['{n:G}', '{n:A}', '{n:D}'],
      explain: 'Thirds then sevenths: {c:Dm7} {n:F} and {n:C}, {c:G7} {n:B} and {n:F}, {c:Cmaj7} {n:E} and {n:B}.',
      fact: 'jazz-guide-tones',
    },
    {
      type: 'card',
      title: 'Line two',
      body: '{n:F}, the third of {c:Dm7}, stays as the seventh of {c:G7} and falls to {n:E}, the third of {c:Cmaj7}. The two lines, {n:C} {n:B} {n:B} and {n:F} {n:F} {n:E}, are the skeleton of the harmony, and of good solos. On the neck they sit on strings 3 and 4, inside the shells.',
      figure: {
        kind: 'fretboard',
        frets: [1, 6],
        dots: [
          { string: 3, fret: 5, note: 'C4', role: 'seventh' },
          { string: 3, fret: 4, note: 'B3', role: 'third' },
          { string: 4, fret: 3, note: 'F3', role: 'third' },
          { string: 4, fret: 2, note: 'E3', role: 'third' },
        ],
        caption: 'String 3: {n:C} to {n:B}. String 4: {n:F} to {n:E}.',
      },
    },
    {
      type: 'order',
      prompt: 'Put line two in order, from {c:Dm7} to {c:Cmaj7}.',
      figure: { kind: 'audio', sound: { kind: 'notes', notes: ['F3', 'F3', 'E3'], tempo: 60 }, label: 'Hear line two' },
      tiles: ['{n:F}', '{n:F}', '{n:E}'],
      distractors: ['{n:G}', '{n:Eb}'],
      explain: '{n:F} is the third of {c:Dm7} and the seventh of {c:G7}; it falls a half step to {n:E}, the third of {c:Cmaj7}.',
      fact: 'jazz-guide-lines',
    },
    {
      type: 'listen-choice',
      prompt: 'Which guide-tone line do you hear?',
      sound: { kind: 'notes', notes: ['C4', 'B3', 'B3'], tempo: 60 },
      options: [
        { text: '{n:C} {n:B} {n:B}: line one', correct: true },
        { text: '{n:F} {n:F} {n:E}: line two' },
        { text: '{n:C} {n:D} {n:E}: a scale' },
      ],
      explain: 'A half step down and then held: {n:C} to {n:B}, the seventh of {c:Dm7} becoming the third of {c:G7}.',
    },
    {
      type: 'play-phrase',
      prompt: 'Play line one in half notes on string 3: fret 5, fret 4, fret 4.',
      notes: [...GUIDE_LINES.sevenths],
      octave: 'exact',
      tempo: 80,
      explain: '{n:C}, {n:B}, {n:B}: the seventh of {c:Dm7}, the third of {c:G7}, the seventh of {c:Cmaj7}.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'On string 3, tap where line one falls to: {n:B}, the third of {c:G7}.',
        find: { note: 'B3' },
        mode: 'one',
        octave: 'exact',
        frets: [2, 6],
        strings: [3],
        explain: 'String 3 fret 4 is {n:B}, one fret below the {n:C} at fret 5.',
      },
    },
    {
      type: 'play-phrase',
      prompt: 'Now line two on string 4: fret 3, fret 3, fret 2.',
      notes: [...GUIDE_LINES.thirds],
      octave: 'exact',
      tempo: 80,
      explain: '{n:F}, {n:F}, {n:E}: the third of {c:Dm7}, the seventh of {c:G7}, the third of {c:Cmaj7}.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'On string 4, tap where line two lands: {n:E}, the third of {c:Cmaj7}.',
        find: { note: 'E3' },
        mode: 'one',
        octave: 'exact',
        frets: [1, 5],
        strings: [4],
        explain: 'String 4 fret 2 is {n:E}, one fret below the {n:F} at fret 3.',
      },
    },
    playerTask({
      id: 'hear-guide-tones',
      title: 'Hear them inside the shells',
      song: 'st-jazz-shells',
      bars: [1, 8],
      tempo: 83,
      minutes: 3,
      body: 'Play bars 1 to 8 of the shell study at 83 % (100 {t:bpm|BPM}) and listen to strings 3 and 4 only: {n:C} to {n:B}, and {n:F} to {n:E}. The shells are the guide tones with a root underneath.',
    }),
    toolTask({
      id: 'jam-guide-tones',
      title: 'Jam: guide tones, then decorate',
      tool: 'progressions',
      params: ['jazz-ii-v-i', 'c', 'jam'],
      minutes: 6,
      body: 'The {r:ii}–{r:V}–{r:I} in {k:C major} at 100 {t:bpm|BPM}. A chorus of each line in half notes, then decorate: approach each guide tone from a step above or below, and land on it on beat 1.',
      tip: 'If you lose the line, stop decorating. The skeleton first; the ornament earns its place.',
    }),
    {
      type: 'true-false',
      statement: 'In this progression, the seventh of each chord moves down a half step to the third of the next.',
      answer: true,
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['Dm7', 'G7', 'Cmaj7'], beats: 4, tempo: 80, voicing: 'close' }, label: 'Hear the three chords' },
      explain: '{n:C} (seventh of {c:Dm7}) to {n:B} (third of {c:G7}); {n:F} (seventh of {c:G7}) to {n:E} (third of {c:Cmaj7}). The other guide tone holds still each time.',
      fact: 'jazz-guide-lines',
    },
    {
      type: 'choice',
      prompt: 'Which two notes are the guide tones of {c:G7}?',
      options: [
        { text: '{n:B} and {n:F}', correct: true },
        { text: '{n:G} and {n:D}', why: 'The root and fifth: they name the chord but do not give its quality.' },
        { text: '{n:B} and {n:D}', why: '{n:D} is the fifth. The seventh, {n:F}, is the other guide tone.' },
      ],
      explain: 'The third, {n:B}, and the seventh, {n:F}: together they make the tritone that gives {c:G7} its pull toward {c:C}.',
      fact: 'jazz-guide-tones',
    },
  ],
  facts: [
    { id: 'jazz-guide-tones', front: 'What are a chord\'s guide tones?', back: 'Its third and its seventh: the two notes that define its quality.' },
    { id: 'jazz-guide-lines', front: 'The two guide-tone lines of {c:Dm7} {c:G7} {c:Cmaj7}?', back: '{n:C} {n:B} {n:B} and {n:F} {n:F} {n:E}: each seventh falls a half step to the next third; each third stays as the next seventh.' },
  ],
};

// ── 3. Drop-2 voicings ──────────────────────────────────────────────────────────────────────────

const drop2: TeacherLesson = {
  id: 'drop-2',
  title: 'Drop-2 voicings',
  teaches: 'Drop the second-highest note of a close chord an octave: a four-string grip whose voices move by step.',
  minutes: 5,
  skill: 'teacher:elena:drop-2',
  steps: [
    {
      type: 'card',
      title: 'Drop the second voice',
      body: 'A {t:drop-2} voicing takes a {t:close-position|close} four-note chord and drops its second-highest note an octave: a playable four-string grip. {c:Dm7} close is {n:C} {n:D} {n:F} {n:A}. Drop the {n:F} and you have {n:F} {n:C} {n:D} {n:A}: xx3535, on strings 4 to 1.',
      figure: {
        kind: 'fretboard',
        frets: [2, 6],
        root: 'D',
        labels: 'degree',
        dots: [
          { string: 4, fret: 3, degree: 'b3', role: 'third' },
          { string: 3, fret: 5, degree: 'b7', role: 'seventh' },
          { string: 2, fret: 3, degree: '1', role: 'root' },
          { string: 1, fret: 5, degree: '5', role: 'fifth' },
        ],
        caption: 'Drop-2 {c:Dm7}, xx3535: the third is the lowest note.',
      },
    },
    {
      type: 'choice',
      prompt: '{c:G7} in close position is {n:B} {n:D} {n:F} {n:G}. Which note does drop-2 move down an octave?',
      options: [
        { text: '{n:F}', correct: true },
        { text: '{n:D}', why: 'Third from the top. Dropping that one makes a drop-3 voicing.' },
        { text: '{n:G}', why: 'The top note stays on top: it is the melody of the voicing.' },
        { text: '{n:B}', why: 'Already the lowest. Nothing to drop.' },
      ],
      explain: 'From the top: {n:G}, then {n:F}. Dropping {n:F} gives {n:F} {n:B} {n:D} {n:G}: xx3433.',
      fact: 'jazz-drop-2',
    },
    {
      type: 'card',
      title: 'Four voices, small steps',
      body: '{c:Dm7} (xx3535), {c:G7} (xx3433), {c:Cmaj7} (xx2413). Watch the voices: {n:F} stays, {n:C} goes to {n:B}, {n:D} stays, {n:A} goes to {n:G}. Then {n:F} goes to {n:E}, {n:B} stays, {n:D} goes to {n:C} and {n:G} stays. Never more than two frets.',
      figure: { kind: 'chord', symbol: 'G7', frets: SHAPES.drop2.G7 },
      tip: 'None of the three has its root at the bottom. Strictly they are inversions; in a band the bass player supplies the root.',
    },
    {
      type: 'match-pairs',
      prompt: 'From {c:Dm7} to {c:G7}: match each string with its voice.',
      pairs: [
        { left: 'String 4', right: '{n:F} stays {n:F}' },
        { left: 'String 3', right: '{n:C} falls to {n:B}' },
        { left: 'String 2', right: '{n:D} stays {n:D}' },
        { left: 'String 1', right: '{n:A} falls to {n:G}' },
      ],
      explain: 'Two voices hold and two fall: {n:C} a half step to {n:B}, {n:A} a whole step to {n:G}. The hand changes shape without travelling.',
      fact: 'jazz-drop-2-c',
    },
    {
      type: 'play-chord',
      prompt: 'Drop-2 {c:Dm7}: xx3535, strings 4 to 1.',
      chord: 'Dm7',
      frets: SHAPES.drop2.Dm7,
      explain: '{n:F} {n:C} {n:D} {n:A}, low to high. Strings 6 and 5 stay silent: rest a finger tip against them.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'Dm7', frets: SHAPES.drop2.Dm7, accept: 'this-shape', prompt: 'Build drop-2 {c:Dm7} on strings 4 to 1.', explain: 'xx3535: fret 3 on strings 4 and 2, fret 5 on strings 3 and 1.' },
    },
    {
      type: 'play-chord',
      prompt: 'Drop-2 {c:G7}: xx3433. Two fingers fall a fret or two; two stay.',
      chord: 'G7',
      frets: SHAPES.drop2.G7,
      explain: '{n:F} {n:B} {n:D} {n:G}: {n:C} fell to {n:B} on string 3, {n:A} to {n:G} on string 1.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'G7', frets: SHAPES.drop2.G7, accept: 'this-shape', prompt: 'Build drop-2 {c:G7} on strings 4 to 1.', explain: 'xx3433: fret 3 on strings 4, 2 and 1, fret 4 on string 3.' },
    },
    {
      type: 'play-chord',
      prompt: 'Drop-2 {c:Cmaj7}: xx2413.',
      chord: 'Cmaj7',
      frets: SHAPES.drop2.Cmaj7,
      explain: '{n:E} {n:B} {n:C} {n:G}: {n:F} fell to {n:E}, {n:D} to {n:C}; {n:B} and {n:G} held.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'Cmaj7', frets: SHAPES.drop2.Cmaj7, accept: 'this-shape', prompt: 'Build drop-2 {c:Cmaj7} on strings 4 to 1.', explain: 'xx2413: string 4 fret 2, string 3 fret 4, string 2 fret 1, string 1 fret 3.' },
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'Fmaj7',
      frets: SHAPES.drop2F.Fmaj7,
      accept: 'this-shape',
      prompt: 'Move every shape up 5 frets and you are in {k:F major}. Build {c:Fmaj7}: the {c:Cmaj7} grip, five frets higher.',
      explain: 'xx2413 plus five is xx7968: {n:A} {n:E} {n:F} {n:C}. With {c:Gm7} (xx8-10-8-10) and {c:C7} (xx8988), the progression sits between frets 6 and 10.',
      fact: 'jazz-drop-2-c',
    },
    playerTask({
      id: 'drop2-study',
      title: 'Jazz Comping: Drop-2 Voicings',
      song: 'st-jazz-drop2',
      tempo: 83,
      minutes: 5,
      body: 'The drop-2 study at 83 % (100 {t:bpm|BPM}): half notes first, so you hear each voice move, then the Charleston. Bars 9 to 16 are the same in {k:F major}, five frets up. Listen to the top voice: {n:A}, {n:G}, {n:G} in {k:C major}.',
      tip: 'The top voice is a melody, whether you meant one or not. Make it sing.',
    }),
    {
      type: 'choice',
      prompt: 'Slide the drop-2 {c:Dm7} grip (xx3535) up five frets. Which chord?',
      options: [
        { text: '{c:Gm7}', correct: true },
        { text: '{c:G7}', why: 'The shape is still minor seventh; only its root moves, from {n:D} to {n:G}.' },
        { text: '{c:Em7}', why: 'Two frets up would give {c:Em7}. Five frets is a fourth: {n:D} to {n:G}.' },
      ],
      explain: 'Five frets is a perfect fourth: {n:D} up a fourth is {n:G}. The minor-seventh shape stays minor seventh, so {c:Dm7} becomes {c:Gm7}, the {r:ii} of {k:F major}.',
    },
    toolTask({
      id: 'jam-drop2-f',
      title: 'Jam: drop-2 in F',
      tool: 'progressions',
      params: ['jazz-ii-v-i', 'f', 'jam'],
      minutes: 5,
      body: 'The {r:ii}–{r:V}–{r:I} in {k:F major} at 110 {t:bpm|BPM}: {c:Gm7}, {c:C7}, {c:Fmaj7} with the drop-2 shapes between frets 6 and 10. Short chords; let the voices, not the hand, do the moving.',
    }),
    {
      type: 'true-false',
      statement: 'The drop-2 {c:Dm7} on strings 4 to 1 has its root on the lowest string.',
      answer: false,
      explain: 'The lowest note is {n:F}, the third; {n:D} is on string 2. Drop-2 grips on the top strings rarely have the root at the bottom, which is why they sit so well over a bass line.',
      fact: 'jazz-drop-2',
    },
  ],
  facts: [
    { id: 'jazz-drop-2', front: 'What is a drop-2 voicing?', back: 'A close four-note chord with its second-highest note dropped an octave: a four-string grip.' },
    { id: 'jazz-drop-2-c', front: 'Drop-2 {c:Dm7}, {c:G7}, {c:Cmaj7} on strings 4 to 1?', back: 'xx3535, xx3433, xx2413. Up 5 frets for {c:Gm7}, {c:C7}, {c:Fmaj7} in {k:F major}.' },
  ],
};

// ── 4. Drop-3 voicings ──────────────────────────────────────────────────────────────────────────

const drop3: TeacherLesson = {
  id: 'drop-3',
  title: 'Drop-3 voicings',
  teaches: 'Drop the third-highest note of a close chord an octave: a grip with the root in the bass and a skipped string.',
  minutes: 5,
  skill: 'teacher:elena:drop-3',
  steps: [
    {
      type: 'card',
      title: 'Drop the third voice',
      body: 'A {t:drop-3} voicing drops the third-highest note of a close chord an octave, which leaves a skipped string inside the grip. With the root on string 5: {c:Dm7}, x5x565. Full, piano-like, and with the root in the bass: ideal when there is no bass player.',
      figure: { kind: 'chord', symbol: 'Dm7', frets: SHAPES.drop3.Dm7, fingers: 'x2x341', caption: 'Drop-3 {c:Dm7}: root on string 5, string 4 muted.' },
    },
    {
      type: 'choice',
      prompt: '{c:Cmaj7} close is {n:B} {n:C} {n:E} {n:G}. Which note does drop-3 send down an octave?',
      options: [
        { text: '{n:C}', correct: true },
        { text: '{n:E}', why: 'Second from the top: that would be drop-2.' },
        { text: '{n:B}', why: 'Already the lowest. The third from the top is the one that drops.' },
      ],
      explain: 'From the top: {n:G}, {n:E}, {n:C}. Dropping {n:C} puts the root in the bass: {n:C} {n:B} {n:E} {n:G}.',
      fact: 'jazz-drop-3',
    },
    {
      type: 'card',
      title: 'Root on 6, root on 5',
      body: 'With the root on string 6: {c:G7}, 3x343x, and {c:Cmaj7}, 8x998x. But 8x998x is five frets from {c:G7}. To comp the progression without travelling, take the root-on-5 {c:Cmaj7}, x3x453: {n:B} stays where it was, on string 3 fret 4.',
      figure: { kind: 'chord', symbol: 'G7', frets: SHAPES.drop3.G7, fingers: '2x341x', caption: 'Drop-3 {c:G7}: root on string 6, string 5 muted.' },
      tip: 'The finger on the bass note leans lightly against the skipped string to keep it silent.',
    },
    {
      type: 'choice',
      prompt: 'After {c:G7} at 3x343x, which drop-3 {c:Cmaj7} keeps your hand where it is?',
      options: [
        { text: 'x3x453, root on string 5', correct: true },
        { text: '8x998x, root on string 6', why: 'A correct drop-3 {c:Cmaj7}, but five frets away. Use it when you are already up there.' },
        { text: 'x324xx, the shell', why: 'A good chord, but a three-note shell, not a drop-3 grip.' },
      ],
      explain: 'x3x453 stays within frets 3 to 5, and {n:B} on string 3 fret 4 does not move at all (the finger on it changes: 4 in {c:G7}, 3 in {c:Cmaj7}). The bass goes from string 6 to string 5, as with the shells.',
      fact: 'jazz-drop-3-c',
    },
    {
      type: 'play-chord',
      prompt: 'Drop-3 {c:Dm7}: x5x565, string 4 muted.',
      chord: 'Dm7',
      frets: SHAPES.drop3.Dm7,
      explain: '{n:D} {n:C} {n:F} {n:A}, low to high. If string 4 rings, it adds a note the grip never asked for: let the finger on string 5 lean against it.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'Dm7', frets: SHAPES.drop3.Dm7, accept: 'this-shape', prompt: 'Build drop-3 {c:Dm7}: root on string 5, strings 6 and 4 muted.', explain: 'x5x565: fret 5 on strings 5, 3 and 1, fret 6 on string 2.' },
    },
    {
      type: 'play-chord',
      prompt: 'Drop-3 {c:G7}: 3x343x, string 5 muted.',
      chord: 'G7',
      frets: SHAPES.drop3.G7,
      explain: '{n:G} {n:F} {n:B} {n:D}: {n:C} on string 3 fell to {n:B}, as in every voicing of this progression.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'G7', frets: SHAPES.drop3.G7, accept: 'this-shape', prompt: 'Build drop-3 {c:G7}: root on string 6, strings 5 and 1 muted.', explain: '3x343x: fret 3 on strings 6, 4 and 2, fret 4 on string 3.' },
    },
    {
      type: 'play-chord',
      prompt: 'Drop-3 {c:Cmaj7}: x3x453, string 4 muted.',
      chord: 'Cmaj7',
      frets: SHAPES.drop3.Cmaj7,
      explain: '{n:C} {n:B} {n:E} {n:G}: the same fingering as {c:Dm7}, two frets lower and one fret wider.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'Cmaj7', frets: SHAPES.drop3.Cmaj7, accept: 'this-shape', prompt: 'Build drop-3 {c:Cmaj7} with the root on string 5.', explain: 'x3x453: string 5 fret 3, string 3 fret 4, string 2 fret 5, string 1 fret 3.' },
    },
    {
      type: 'true-false',
      statement: 'In a drop-3 grip the skipped string must be muted, usually by the finger on the bass note.',
      answer: true,
      explain: 'The underside of the finger on string 6 or 5 touches the skipped string. Left ringing, it sounds an open note the voicing never asked for.',
    },
    toolTask({
      id: 'jam-drop3',
      title: 'Jam: drop-3, four to the bar',
      tool: 'progressions',
      params: ['jazz-ii-v-i', 'c', 'jam'],
      minutes: 6,
      body: 'The {r:ii}–{r:V}–{r:I} in {k:C major} at 100 {t:bpm|BPM}: drop-3 grips four to the bar, short and even, x5x565, 3x343x, x3x453. Your grips carry their own bass note: listen to it against the band\'s.',
    }),
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'Gm7',
      frets: SHAPES.drop3F.Gm7,
      accept: 'this-shape',
      prompt: 'Into {k:F major}: move the drop-3 {c:Dm7} up five frets and build {c:Gm7}.',
      explain: 'x5x565 plus five: x-10-x-10-11-10. {n:G} {n:F} {n:Bb} {n:D}, root on string 5.',
      fact: 'jazz-drop-3-c',
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'C7',
      frets: SHAPES.drop3F.C7,
      accept: 'this-shape',
      prompt: 'Move the drop-3 {c:G7} up five frets: build {c:C7}.',
      explain: '3x343x plus five: 8x898x. {n:C} {n:Bb} {n:E} {n:G}, root on string 6.',
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'Fmaj7',
      frets: SHAPES.drop3F.Fmaj7,
      accept: 'this-shape',
      prompt: 'And the root-on-5 {c:Cmaj7} up five frets: build {c:Fmaj7}.',
      explain: 'x3x453 plus five: x-8-x-9-10-8. {n:F} {n:E} {n:A} {n:C}: the {r:ii}–{r:V}–{r:I} in {k:F major} between frets 8 and 11.',
    },
  ],
  facts: [
    { id: 'jazz-drop-3', front: 'What is a drop-3 voicing?', back: 'A close four-note chord with its third-highest note dropped an octave: root in the bass and a skipped, muted string.' },
    { id: 'jazz-drop-3-c', front: 'Drop-3 {c:Dm7}, {c:G7}, {c:Cmaj7} in one place?', back: 'x5x565, 3x343x, x3x453 (frets 3 to 6). {c:Cmaj7} with the root on string 6 is 8x998x.' },
  ],
};

// ── 5. Ninths and thirteenths ───────────────────────────────────────────────────────────────────

const extendedVoicings: TeacherLesson = {
  id: 'extended-voicings',
  title: 'Ninths and thirteenths',
  teaches: 'Keep the third and seventh, drop the fifth (often the root), and add one colour: a 9 or a 13.',
  minutes: 5,
  skill: 'teacher:elena:extended-voicings',
  steps: [
    {
      type: 'card',
      title: 'Above the seventh',
      body: '{t:extension|Extensions} are the notes above the seventh, the {d:9}, {d:11} and {d:13}, and they are what makes jazz harmony shimmer. On guitar you rarely play them all. Drop the fifth and often the root, keep the third and seventh, and add one colour.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['Dm7', 'G7', 'Cmaj7'], beats: 4, tempo: 80 }, label: 'The plain sevenths' },
    },
    {
      type: 'choice',
      prompt: 'Six strings, a seven-note {c:G13}. What does a guitarist keep?',
      options: [
        { text: 'Third and seventh, plus one colour', correct: true },
        { text: 'Root and fifth, plus one colour', why: 'Root and fifth say nothing about the quality. The third and seventh do.' },
        { text: 'Every tone up to the 13th', why: 'Seven notes will not fit under four fingers, and would sound like mud if they did.' },
      ],
      explain: 'The guide tones define the chord; one extension colours it. The fifth goes first, the root often next, since the bass plays it.',
      fact: 'jazz-extension-rule',
    },
    {
      type: 'card',
      title: 'Three colours',
      body: '{c:Dm9} (x5355x), {c:G13} (3x345x) and {c:Cmaj9} (x3243x) all keep their guide tones, and their top voice moves {n:E}, {n:E}, {n:D}: a small melody riding on the changes.',
      figure: {
        kind: 'fretboard',
        frets: [2, 6],
        root: 'G',
        labels: 'degree',
        dots: [
          { string: 6, fret: 3, degree: '1', role: 'root' },
          { string: 4, fret: 3, degree: 'b7', role: 'seventh' },
          { string: 3, fret: 4, degree: '3', role: 'third' },
          { string: 2, fret: 5, degree: '13', role: 'tone' },
        ],
        caption: '{c:G13}: the {c:G7} shell with {n:E}, the thirteenth, on top.',
      },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each chord with its colour tone, the top note of the voicing.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['Dm9', 'G13', 'Cmaj9'], beats: 4, tempo: 80 }, label: 'The extended chords' },
      pairs: [
        { left: '{c:Dm9}', right: '{n:E}, the ninth' },
        { left: '{c:G13}', right: '{n:E}, the thirteenth' },
        { left: '{c:Cmaj9}', right: '{n:D}, the ninth' },
      ],
      explain: '{n:E} is a ninth above {n:D} and a thirteenth above {n:G}; {n:D} is a ninth above {n:C}. One note, {n:E}, colours two chords.',
      fact: 'jazz-extended-c',
    },
    {
      type: 'play-phrase',
      prompt: '{c:Dm9}: x5355x, the {c:Dm7} shell with {n:E} on string 2. Pick strings 5 to 2 in turn, then strum.',
      notes: picked(SHAPES.extended.Dm9),
      octave: 'exact',
      tempo: 60,
      explain: '{n:D} {n:F} {n:C} {n:E}: root, third, seventh, ninth.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'Dm9', frets: SHAPES.extended.Dm9, accept: 'this-shape', prompt: 'Build {c:Dm9}: the {c:Dm7} shell plus string 2 fret 5.', explain: 'x5355x: {n:D} {n:F} {n:C} and {n:E} on string 2 fret 5.' },
    },
    {
      type: 'play-phrase',
      prompt: '{c:G13}: 3x345x, the {c:G7} shell with {n:E} on top. Pick strings 6, 4, 3 and 2 in turn, then strum.',
      notes: picked(SHAPES.extended.G13),
      octave: 'exact',
      tempo: 60,
      explain: '{n:G} {n:F} {n:B} {n:E}: root, seventh, third, thirteenth. No fifth, no ninth: nobody misses them.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'G13', frets: SHAPES.extended.G13, accept: 'this-shape', prompt: 'Build {c:G13}: the {c:G7} shell plus string 2 fret 5.', explain: '3x345x: {n:G} {n:F} {n:B} and {n:E} on string 2 fret 5.' },
    },
    {
      type: 'play-phrase',
      prompt: '{c:Cmaj9}: x3243x. Strings 5 to 2 in turn, then strum, and hear the top voice step down.',
      notes: picked(SHAPES.extended.Cmaj9),
      octave: 'exact',
      tempo: 60,
      explain: '{n:C} {n:E} {n:B} {n:D}: root, third, seventh, ninth. The top voice stepped down from {n:E} to {n:D}.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'Cmaj9', frets: SHAPES.extended.Cmaj9, accept: 'this-shape', prompt: 'Build {c:Cmaj9}: the {c:Cmaj7} shell plus string 2 fret 3.', explain: 'x3243x: {n:C} {n:E} {n:B} and {n:D} on string 2 fret 3.' },
    },
    {
      type: 'listen-choice',
      prompt: 'Plain seventh, or extended?',
      sound: { kind: 'chord', chord: 'G13', frets: SHAPES.extended.G13, style: 'arpeggio' },
      options: [{ text: 'Plain seventh' }, { text: 'Extended', correct: true }],
      shuffle: false,
      explain: 'That was {c:G13}: the top note, {n:E}, sits above the seventh, {n:F}, a major sixth plus an octave above the root.',
    },
    { generate: 'chord-quality-ear', params: { types: ['7', '9', '13'] } },
    toolTask({
      id: 'ear-colours',
      title: 'Ear Training: dominant colours',
      tool: 'ear',
      params: ['chords', '9'],
      minutes: 4,
      body: 'Chord quality, level 9: the seventh, ninth, thirteenth and the two altered ninths. Ten questions. Listen to the top of each chord: that is where the colour sits.',
    }),
    toolTask({
      id: 'jam-extended',
      title: 'Jam: shells, then colours',
      tool: 'progressions',
      params: ['jazz-ii-v-i', 'c', 'jam'],
      minutes: 5,
      body: 'The {r:ii}–{r:V}–{r:I} in {k:C major} at 110 {t:bpm|BPM}. Alternate: a chorus of shells, then a chorus of {c:Dm9}, {c:G13} and {c:Cmaj9}. Hear the top voice sing {n:E}, {n:E}, {n:D}.',
    }),
    {
      type: 'choice',
      prompt: 'In {c:G13} as 3x345x, which note is the thirteenth?',
      options: [
        { text: '{n:E}', correct: true },
        { text: '{n:D}', why: '{n:D} is the fifth, which this voicing leaves out.' },
        { text: '{n:A}', why: '{n:A} is the ninth, also left out here.' },
        { text: '{n:C}', why: '{n:C} would be the eleventh, which clashes with the third, {n:B}.' },
      ],
      explain: 'Thirteen is six plus an octave: {n:E} above {n:G}, on string 2 fret 5.',
      fact: 'jazz-extended-c',
    },
  ],
  facts: [
    { id: 'jazz-extensions', front: 'What are a chord\'s extensions?', back: 'The tones above the seventh: the {d:9}, {d:11} and {d:13}.' },
    { id: 'jazz-extension-rule', front: 'How does a guitarist voice an extended chord?', back: 'Keep the third and seventh, drop the fifth (often the root too), and add one colour tone.' },
    { id: 'jazz-extended-c', front: 'Extended voicings for {c:Dm7} {c:G7} {c:Cmaj7}?', back: '{c:Dm9} x5355x, {c:G13} 3x345x, {c:Cmaj9} x3243x: the top voice moves {n:E}, {n:E}, {n:D}.' },
  ],
};

// ── 6. The minor ii-V-i ─────────────────────────────────────────────────────────────────────────

const minorIiVI: TeacherLesson = {
  id: 'minor-ii-v-i',
  title: 'The minor two-five-one',
  teaches: 'In minor the {r:ii} chord is half-diminished and the {r:V} takes the raised seventh from harmonic minor.',
  minutes: 5,
  skill: 'teacher:elena:minor-ii-v-i',
  steps: [
    {
      type: 'card',
      title: 'Minor has its own',
      body: 'In minor the {r:ii} chord is {t:half-diminished}, and the {r:V} borrows the raised seventh from harmonic minor. In {k:A minor}: {c:Bm7b5} (x2323x), {c:E7} (xx2434), {c:Am7} (xx2213). That is {r:iiø7}, {r:V7}, {r:i7}.',
      figure: { kind: 'chord', symbol: 'Bm7b5', frets: SHAPES.minor.Bm7b5, caption: '{c:Bm7b5}: {n:B} {n:F} {n:A} {n:D}, low to high.' },
    },
    {
      type: 'choice',
      prompt: 'In {k:A minor}, which chord is {r:iiø7}?',
      options: [
        { text: '{c:Bm7b5}', correct: true },
        { text: '{c:Bm7}', why: 'That needs {n:F#}, which is not in {k:A minor}. The fifth above {n:B} here is {n:F}.' },
        { text: '{c:Bdim7}', why: 'Its seventh is {n:Ab}: one half step too low. The key gives {n:A}.' },
      ],
      explain: 'Stack thirds on {n:B} in {k:A minor}: {n:B} {n:D} {n:F} {n:A}. A minor seventh chord with a flat fifth: half-diminished.',
      fact: 'jazz-minor-ii-v-i',
    },
    {
      type: 'play-chord',
      prompt: '{c:Bm7b5}: x2323x.',
      chord: 'Bm7b5',
      frets: SHAPES.minor.Bm7b5,
      explain: '{n:B} {n:F} {n:A} {n:D}: root, flat fifth, seventh, third. Here the fifth is altered, so it stays.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'Bm7b5', frets: SHAPES.minor.Bm7b5, accept: 'this-shape', prompt: 'Build {c:Bm7b5} with the root on string 5.', explain: 'x2323x: fret 2 on strings 5 and 3, fret 3 on strings 4 and 2.' },
    },
    {
      type: 'play-chord',
      prompt: '{c:E7}: xx2434. Listen for {n:G#} on top.',
      chord: 'E7',
      frets: SHAPES.minor.E7,
      explain: '{n:E} {n:B} {n:D} {n:G#}: the {n:G#} on string 1 fret 4 is the leading tone, one fret below {n:A}.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'E7', frets: SHAPES.minor.E7, accept: 'this-shape', prompt: 'Build {c:E7} on strings 4 to 1.', explain: 'xx2434: string 4 fret 2, string 3 fret 4, string 2 fret 3, string 1 fret 4.' },
    },
    {
      type: 'play-chord',
      prompt: '{c:Am7}: xx2213. {n:G#} falls back to {n:G}.',
      chord: 'Am7',
      frets: SHAPES.minor.Am7,
      explain: '{n:E} {n:A} {n:C} {n:G}: the fifth is lowest, so strictly {c:Am7/E}. String 4 kept its {n:E}; string 1 fell from {n:G#} to {n:G}.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'Am7', frets: SHAPES.minor.Am7, accept: 'this-shape', prompt: 'Build {c:Am7} on strings 4 to 1.', explain: 'xx2213: fret 2 on strings 4 and 3, fret 1 on string 2, fret 3 on string 1.' },
    },
    playerTask({
      id: 'minor-study-comp',
      title: 'The minor study: comping',
      song: 'st-jazz-minor-ii-v',
      bars: [1, 8],
      tempo: 86,
      minutes: 3,
      body: 'Bars 1 to 8 of the minor study at 86 % (100 {t:bpm|BPM}), as a bossa: thumb on the bass, fingers on the rest of the grip. In the study the open {n:A} string sounds under {c:Am7}. Lean a little on {c:E7}.',
    }),
    {
      type: 'card',
      title: 'The note that pulls home',
      body: 'The {n:G#} in {c:E7} is what makes the {r:V} pull home: it rises a half step to {n:A}. Over {c:E7}, play {n:A} harmonic minor: {n:A} {n:B} {n:C} {n:D} {n:E} {n:F} {n:G#}.',
      figure: { kind: 'fretboard', frets: [4, 8], root: 'A', labels: 'degree', derive: { scale: 'harmonic-minor', tonic: 'A' }, caption: '{n:A} harmonic minor, fifth position. {n:G#} is the 7.' },
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap every {n:G#} in fifth position, frets 4 to 8.',
      find: { note: 'G#' },
      mode: 'all',
      octave: 'any',
      frets: [4, 8],
      explain: 'Three: string 6 fret 4, string 4 fret 6 and string 1 fret 4. Know where they are before {c:E7} arrives.',
      fact: 'jazz-minor-leading-tone',
    },
    toolTask({
      id: 'jam-minor-swing',
      title: 'Jam: the minor two-five-one, swung',
      tool: 'progressions',
      params: ['jazz-minor-ii-v-i', 'a', 'jam'],
      minutes: 3,
      body: 'Now swung, with the band at 100 {t:bpm|BPM}: {c:Bm7b5}, {c:E7b9}, then two bars of {c:Am6}. Your {c:E7} grip fits under the band\'s {c:E7b9}. For {c:Am6}, lower the top note of the {c:Am7} grip a fret: xx2212. Short chords, four to the bar, then the Charleston.',
    }),
    {
      type: 'true-false',
      statement: 'Over {c:E7} in {k:A minor}, the {n:G} of natural minor fits as well as {n:G#}.',
      answer: false,
      explain: '{n:G} clashes with the chord\'s own third, {n:G#}. Harmonic minor gives {n:G#}: the leading tone that pulls up to {n:A}.',
      fact: 'jazz-minor-leading-tone',
    },
    playerTask({
      id: 'minor-study-melody',
      title: 'The minor study: the melody',
      song: 'st-jazz-minor-ii-v',
      bars: [9, 16],
      tempo: 86,
      minutes: 4,
      body: 'Bars 9 to 16 at 86 % (100 {t:bpm|BPM}): the melody over the progression, in seventh position. Find the {n:G#} over each {c:E7}, string 2 fret 9, and give it its weight before it rises to {n:A}.',
    }),
    toolTask({
      id: 'jam-minor-bossa',
      title: 'Jam: the minor bossa loop',
      tool: 'progressions',
      params: ['latin-bossa-minor-loop', 'a', 'jam'],
      minutes: 4,
      body: 'The minor bossa loop in {k:A minor} at 120 {t:bpm|BPM}: {c:Am7}, {c:Dm7}, {c:Bm7b5}, {c:E7b9}. Comp with your new voicings (your {c:E7} grip fits under the band\'s {c:E7b9}); over {c:E7b9}, lines in {n:A} harmonic minor.',
    }),
    {
      type: 'fill-blanks',
      prompt: 'Complete {n:A} harmonic minor, the scale for {c:E7}.',
      text: '{n:A}  {n:B}  {n:C}  {n:D}  {n:E}  {n:F}  ___',
      blanks: ['{n:G#}'],
      bank: ['{n:G}', '{n:F#}'],
      explain: 'Natural minor with its seventh raised: {n:G} becomes {n:G#}, the third of {c:E7} and the leading tone of {k:A minor}.',
      fact: 'jazz-minor-leading-tone',
    },
  ],
  facts: [
    { id: 'jazz-minor-ii-v-i', front: 'The minor {r:iiø7}–{r:V7}–{r:i7} in {k:A minor}, with voicings?', back: '{c:Bm7b5} (x2323x), {c:E7} (xx2434), {c:Am7} (xx2213).' },
    { id: 'jazz-minor-leading-tone', front: 'Why is the {r:V} of {k:A minor} {c:E7}, not {c:Em7}?', back: 'It borrows the raised seventh, {n:G#}, from harmonic minor: the leading tone that pulls home to {n:A}.' },
  ],
};

// ── 7. Comping and the bossa groove ─────────────────────────────────────────────────────────────

const compingAndBossa: TeacherLesson = {
  id: 'comping-and-bossa',
  title: 'Comping and the bossa groove',
  teaches: 'Comping is short chords in varied rhythms with space for the soloist; the bossa puts the thumb on 1 and 3.',
  minutes: 5,
  skill: 'teacher:elena:comping-and-bossa',
  steps: [
    {
      type: 'card',
      title: 'Accompany, and complement',
      body: '{t:comping|Comping} means accompanying, and complementing: short chords, varied rhythms, space for the soloist. Learn three rhythms well: four to the bar, the Charleston, and {t:anticipation|anticipations} on the and of 4, tied into the next bar.',
      figure: { kind: 'rhythm', pattern: 'hr qr er e | ~h hr', tempo: 100, caption: 'An anticipation: the next chord arrives on the and of 4.' },
    },
    {
      type: 'choice',
      prompt: 'Which of these is the Charleston?',
      options: [
        { text: 'Beat 1 and the and of 2', figure: { kind: 'rhythm', pattern: 'q. e hr' }, correct: true },
        { text: 'Four to the bar', figure: { kind: 'rhythm', pattern: 'q q q q' }, why: 'A short chord on every beat: the steady one.' },
        { text: 'The and of 4', figure: { kind: 'rhythm', pattern: 'hr qr er e' }, why: 'That is the anticipation, pushing into the next bar.' },
      ],
      explain: 'The Charleston: a chord on 1, another on the and of 2, then two beats of space.',
      fact: 'jazz-comping-rhythms',
    },
    {
      type: 'card',
      title: 'The bossa',
      body: 'The bossa: the thumb plays the root on 1 and 3, calm and even, while the fingers pluck the chord in a syncopated two-bar pattern over {c:Am7} (5x555x) and {c:D7} (x5453x). Bar one: beat 1, the and of 2, beat 4. Bar two: the and of 1, beat 3, the and of 3.',
      figure: { kind: 'rhythm', pattern: 'q. q. q | er q. e q.', tempo: 100, caption: 'The fingers\' two-bar pattern. The thumb adds the root on 1 and 3.' },
    },
    {
      type: 'choice',
      prompt: 'In the bossa, what does the thumb play?',
      options: [
        { text: 'The root, on beats 1 and 3', correct: true },
        { text: 'The root, on every and', why: 'The fingers own the off-beats. The thumb is the calm one.' },
        { text: 'The top note of the chord', why: 'The fingers have the upper notes; the thumb keeps to the bass.' },
      ],
      explain: 'Thumb on the root, on 1 and 3: string 6 fret 5 ({n:A}) for {c:Am7}, string 5 fret 5 ({n:D}) for {c:D7}.',
      fact: 'jazz-bossa-thumb',
    },
    {
      type: 'play-chord',
      prompt: '{c:Am7}: 5x555x, a first-finger barre with string 5 left out.',
      chord: 'Am7',
      frets: SHAPES.bossa.Am7,
      explain: '{n:A} {n:G} {n:C} {n:E}: root, seventh, third, fifth. The thumb takes {n:A}, the fingers the other three.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'Am7', frets: SHAPES.bossa.Am7, accept: 'this-shape', prompt: 'Build the bossa {c:Am7}: root on string 6, string 5 silent.', explain: '5x555x: fret 5 on strings 6, 4, 3 and 2; strings 5 and 1 not played.' },
    },
    {
      type: 'play-phrase',
      prompt: '{c:D7}: x5453x. Pluck it string by string, the thumb\'s {n:D} first, then strings 4, 3 and 2.',
      notes: picked(SHAPES.bossa.D7),
      octave: 'exact',
      tempo: 60,
      explain: '{n:D} {n:F#} {n:C} {n:D}. In the fingers {n:C} stays on string 3 while {n:G} falls to {n:F#} and {n:E} to {n:D}.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'D7', frets: SHAPES.bossa.D7, accept: 'this-shape', prompt: 'Build the bossa {c:D7}: root on string 5.', explain: 'x5453x: string 5 fret 5, string 4 fret 4, string 3 fret 5, string 2 fret 3.' },
    },
    playerTask({
      id: 'bossa-groove',
      title: 'Bossa-Style Groove',
      song: 'st-bossa-groove',
      tempo: 86,
      minutes: 6,
      body: 'The bossa study at 86 % (100 {t:bpm|BPM}). When the thumb is calm and even and the fingers land where they should, raise it to 103 % (120 BPM).',
      tip: 'Say it aloud: "ONE, and-of-two, four; and-of-one, THREE, and." The thumb never joins the off-beats.',
    }),
    {
      type: 'tap-rhythm',
      prompt: 'Tap the fingers\' two-bar bossa pattern with the click.',
      rhythm: { pattern: 'q. q. q | er q. e q.' },
      tempo: 90,
      show: 'both',
      explain: 'Bar one: 1, the and of 2, 4. Bar two: the and of 1, 3, the and of 3. Half of it lands between the beats: that is the syncopation.',
    },
    {
      type: 'card',
      title: 'The turnaround in shells',
      body: 'The {r:I}–{r:vi}–{r:ii}–{r:V} turnaround in {k:C major}, two chords a bar: {c:Cmaj7} x324xx, {c:Am7} 5x55xx, {c:Dm7} x535xx, {c:G7} 3x34xx. Only {c:Am7} is new: the {c:G7} shell two frets higher, with its third a fret lower. The bass still alternates between strings 5 and 6.',
      figure: { kind: 'chord', symbol: 'Am7', frets: SHAPES.shells.Am7, caption: '{c:Am7} shell, root on string 6: root, seventh, minor third.' },
    },
    toolTask({
      id: 'jam-turnaround',
      title: 'Jam: the turnaround in shells',
      tool: 'progressions',
      params: ['jazz-i-vi-ii-v', 'c', 'jam'],
      minutes: 5,
      body: 'The turnaround with the band in {k:C major} at 120 {t:bpm|BPM}, two chords a bar, in shells only. Change the comping rhythm every four bars: four to the bar, the Charleston, anticipations, and round again.',
    }),
    {
      type: 'true-false',
      statement: 'Good comping fills every beat, so the soloist is never alone.',
      answer: false,
      explain: 'Comping complements: short chords and space. A soloist with no room to breathe is not accompanied but crowded.',
      fact: 'jazz-comping',
    },
    toolTask({
      id: 'jam-bossa-vamp',
      title: 'Jam: the bossa vamp',
      tool: 'progressions',
      params: ['dorian-i-iv', 'a', 'jam'],
      minutes: 4,
      body: 'The Dorian vamp in {n:A} at 110 {t:bpm|BPM}: {c:Am7} to {c:D7}, a bar each, so the groove\'s two bars fall one on each chord. Thumb on 1 and 3, and keep it going without speeding up.',
    }),
    {
      type: 'match-pairs',
      prompt: 'Match each comping idea with what it does.',
      pairs: [
        { left: 'Four to the bar', right: 'A short chord on every beat' },
        { left: 'Charleston', right: '1 and the and of 2' },
        { left: 'Anticipation', right: 'The and of 4, tied over' },
        { left: 'Bossa thumb', right: 'The root on 1 and 3' },
      ],
      explain: 'Three comping rhythms and the bossa\'s anchor. Vary the first three behind a soloist; keep the last one steady.',
      fact: 'jazz-comping-rhythms',
    },
  ],
  facts: [
    { id: 'jazz-comping', front: 'What does comping mean?', back: 'Accompanying, and complementing: short chords, varied rhythms, space for the soloist.' },
    { id: 'jazz-comping-rhythms', front: 'Three comping rhythms to know well?', back: 'Four to the bar; the Charleston (1 and the and of 2); anticipations on the and of 4.' },
    { id: 'jazz-bossa-thumb', front: 'In the bossa groove, what does the thumb do?', back: 'Plays the root on beats 1 and 3, while the fingers pluck the chord in a syncopated two-bar pattern.' },
  ],
};

/** Unit 5 of Prof. Varga's course. */
const unit: TeacherUnit = {
  id: 'elena-jazz-harmony',
  title: 'Jazz harmony and comping',
  theme: 'harmony',
  description: 'Comp the major and minor two-five-one with shells, guide tones, drop-2, drop-3 and extended voicings, swung and bossa.',
  lessons: [shellsIiVI, guideTones, drop2, drop3, extendedVoicings, minorIiVI, compingAndBossa],
  checkpoint: { sample: 8, maxMistakes: 2 },
  glossary: [
    { id: 'shell-voicing', term: 'shell voicing', definition: 'A three-note jazz chord: root, third and seventh, with the fifth left out.' },
    { id: 'guide-tone', term: 'guide tone', definition: 'The third or the seventh of a chord: the two notes that define its quality.' },
    { id: 'close-position', term: 'close position', definition: 'A chord voiced as tightly as possible, all its notes within one octave.' },
    { id: 'drop-2', term: 'drop-2', definition: 'A voicing made by dropping the second-highest note of a close-position four-note chord an octave.' },
    { id: 'drop-3', term: 'drop-3', definition: 'A voicing made by dropping the third-highest note of a close-position four-note chord an octave. It skips a string.' },
    { id: 'extension', term: 'extension', definition: 'A chord tone above the seventh: the 9, 11 or 13.' },
    { id: 'half-diminished', term: 'half-diminished', definition: 'A seventh chord of root, minor third, flat fifth and minor seventh: {c:Am7b5} is {n:A} {n:C} {n:Eb} {n:G}.' },
    { id: 'charleston', term: 'Charleston', definition: 'A comping rhythm: a chord on beat 1 and another on the and of 2.' },
    { id: 'comping', term: 'comping', definition: 'Accompanying a soloist with chords, and complementing them: short, rhythmic, leaving space.' },
    { id: 'anticipation', term: 'anticipation', definition: 'A chord played half a beat early, on the and of 4, and tied into the bar where it belongs.' },
  ],
};

export default unit;
