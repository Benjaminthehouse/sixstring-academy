/**
 * Dev, unit 5: The blues (plan: `dev/dev-blues` in src/content/plan/teachers.json).
 *
 * The 12-bar in E with the quick change and the open-string shuffle, movable dominant sevenths
 * around the 5th fret, two turnarounds, the blues scale and its blue note, major and minor
 * pentatonic mixed with target notes at the changes, and the minor blues. Dev's voice: a bandmate
 * who ties every idea to something to play tonight.
 *
 * Music from the song library: 12-Bar Blues Shuffle in E (quick change) and in A, Blues
 * Turnarounds in E and A, Pentatonic Box 1 Lick (box 1 for the blues scale), Minor Blues in A.
 * `dev-blues.test.ts` checks every fret, note and degree the text names against the guitar and
 * theory engines, the chord charts and turnaround lines against the library's studies, and each
 * Player tempo against the song's own.
 */
import { scalePatterns } from '@/core/guitar';
import type { FretDot, TabNote } from '@/lessons';
import type { TeacherLesson, TeacherUnit } from '../types';
import { playerTask, toolTask } from '../tasks';

/** One tab note. */
function t(string: number, fret: number, duration: string): TabNote {
  return { string, fret, duration };
}

/** The quick-change 12-bar in E, bar by bar (the study's chart). */
export const QUICK_CHANGE_E = ['E', 'A', 'E', 'E', 'A', 'A', 'E', 'E', 'B7', 'A', 'E', 'B7'] as const;

/** The minor blues in A, bar by bar (the study's chart). */
export const MINOR_BLUES_A = ['Am7', 'Am7', 'Am7', 'Am7', 'Dm7', 'Dm7', 'Am7', 'Am7', 'E7', 'Dm7', 'Am7', 'E7'] as const;

/** The turnaround line in E: string 3, frets 7 6 5 4 (each with the open strings 6 and 1 in the study). */
export const TURNAROUND_E: TabNote[] = [t(3, 7, 'q'), t(3, 6, 'q'), t(3, 5, 'q'), t(3, 4, 'q')];

/** The turnaround line in A: string 4, frets 5 4 3 2 (with the open strings 5 and 1 in the study). */
export const TURNAROUND_A: TabNote[] = [t(4, 5, 'q'), t(4, 4, 'q'), t(4, 3, 'q'), t(4, 2, 'q')];

/** The blue-note passage, five times: string 3 fret 7 (D), string 3 fret 8 (Eb), string 2 fret 5 (E). */
export const BLUE_NOTE_PASSAGE: TabNote[] = [
  ...[0, 1, 2, 3].flatMap(() => [t(3, 7, 'e'), t(3, 8, 'e'), t(2, 5, 'q')]),
  t(3, 7, 'q'), t(3, 8, 'q'), t(2, 5, 'h'),
];

/** Dev's lick: two bars in box 1 that pass through the blue note twice and come home to A. */
export const DEV_BLUES_LICK: TabNote[] = [
  t(2, 8, 'e'), t(2, 5, 'e'), t(3, 7, 'e'), t(3, 8, 'e'), t(2, 5, 'q'), t(3, 7, 'e'), t(3, 5, 'e'),
  t(5, 5, 'e'), t(5, 6, 'e'), t(5, 7, 'e'), t(4, 5, 'e'), t(4, 7, 'h'),
];

/** Minor Blues in A, melody bars 1 and 2 (box 1). */
export const MINOR_BLUES_MELODY_1_2: TabNote[] = [
  { rest: true, duration: 'q' }, t(2, 5, 'e'), t(2, 8, 'e'), t(1, 5, 'h'),
  t(2, 8, 'e'), t(1, 5, 'e'), t(2, 8, 'e'), t(2, 5, 'e'), t(3, 7, 'q'), t(3, 5, 'q'),
];

/** A minor pentatonic box 1 (frets 5 to 8), from the engine. */
const BOX_1 = scalePatterns('A', 'minor-pentatonic').find((p) => p.id === 'box-1')!;
/** A major pentatonic at frets 2 to 5 (the box 1 shape of F# minor pentatonic), from the engine. */
const MAJOR_AT_2 = scalePatterns('F#', 'minor-pentatonic').find((p) => p.id === 'box-1')!;

/** Box 1 with the two blue notes added and highlighted. */
const BOX_1_WITH_BLUE: FretDot[] = [
  ...BOX_1.notes.map((n) => ({ string: n.string, fret: n.fret, note: n.note })),
  { string: 5, fret: 6, note: 'Eb', role: 'target' },
  { string: 3, fret: 8, note: 'Eb', role: 'target' },
];

/** Box 1 (plain) and the major pentatonic shape at fret 2 (faded), one dot per position. */
const MINOR_AND_MAJOR: FretDot[] = [
  ...BOX_1.notes.map((n) => ({ string: n.string, fret: n.fret, note: n.note, role: 'tone' as const })),
  ...MAJOR_AT_2.notes.filter((m) => !BOX_1.notes.some((n) => n.string === m.string && n.fret === m.fret)).map((n) => ({ string: n.string, fret: n.fret, note: n.note, role: 'ghost' as const })),
];

// ── 1. The 12-bar in E, quick change ───────────────────────────────────────────────────────────

const bluesInE: TeacherLesson = {
  id: 'blues-in-e',
  title: 'The 12-bar in E, quick change',
  teaches: 'The quick change puts {c:A} in bar 2 of the blues in E, and the {c:B7} in bar 12 turns the form around.',
  minutes: 5,
  skill: 'teacher:dev:blues-in-e',
  steps: [
    {
      type: 'card',
      title: 'One twist: the quick change',
      body: 'Here is the deal: the {t:twelve-bar} you know, with one twist. Bar 2 jumps to {c:A} and straight back, the {t:quick-change}. The whole form: {c:E} {c:A} {c:E} {c:E}, {c:A} {c:A} {c:E} {c:E}, {c:B7} {c:A} {c:E} {c:B7}. That last {c:B7} turns the form around, back to the top.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: [...QUICK_CHANGE_E], beats: 2, tempo: 96 }, label: 'Hear the 12 bars' },
    },
    {
      type: 'order',
      prompt: 'Put the three lines of the quick-change blues in E in order.',
      tiles: ['{c:E} {c:A} {c:E} {c:E}', '{c:A} {c:A} {c:E} {c:E}', '{c:B7} {c:A} {c:E} {c:B7}'],
      distractors: ['{c:E} {c:E} {c:E} {c:E}', '{c:B7} {c:B7} {c:E} {c:E}'],
      explain: 'Line 1 has the quick change, {c:A} in bar 2. Line 2 starts on {c:A}. Line 3 is {c:B7} {c:A} {c:E}, and the last {c:B7} sends you back to the top.',
      fact: 'blues-quick-change',
    },
    {
      type: 'card',
      title: 'The shuffle on E',
      body: 'Your right hand plays a {t:shuffle}, long-short. On {c:E}: the open string 6 with string 5, fret 2 ({n:B}), then with string 5, fret 4 ({n:C#}), back and forth. Finger 1 stays on fret 2, finger 3 reaches fret 4.',
      figure: { kind: 'fretboard', frets: [0, 4], labels: 'finger', dots: [{ string: 6, fret: 0, note: 'E', role: 'root' }, { string: 5, fret: 2, note: 'B', finger: 1 }, { string: 5, fret: 4, note: 'C#', finger: 3 }], caption: 'The E shuffle: the open string 6 with fret 2, then fret 4, of string 5.' },
    },
    {
      type: 'fretboard-name',
      prompt: 'The root (R) is the open {n:E}. Which degree does finger 3 add at string 5, fret 4?',
      position: { string: 5, fret: 4 },
      root: { string: 6, fret: 0 },
      ask: 'degree',
      spelling: 'any',
      options: ['6', '5', 'b7', '4'],
      explain: 'String 5, fret 4 is {n:C#}, the 6th of {n:E}. The shuffle rocks between the 5th ({n:B}, fret 2) and the 6th: that rocking is the sound.',
      fact: 'shuffle-in-e',
    },
    {
      type: 'card',
      title: 'The same move on A',
      body: 'On {c:A} the same shape moves one string over: the open string 5 with string 4, fret 2 ({n:E}), then string 4, fret 4 ({n:F#}). Same fingers, same long-short.',
      figure: { kind: 'fretboard', frets: [0, 4], labels: 'finger', dots: [{ string: 5, fret: 0, note: 'A', role: 'root' }, { string: 4, fret: 2, note: 'E', finger: 1 }, { string: 4, fret: 4, note: 'F#', finger: 3 }], caption: 'The A shuffle: the open string 5 with fret 2, then fret 4, of string 4.' },
    },
    {
      type: 'choice',
      prompt: 'On the {c:A} bars, which strings carry the shuffle?',
      options: [
        { text: 'The open string 5 with string 4', correct: true },
        { text: 'The open string 6 with string 5', why: 'That is the shuffle on {c:E}. For {c:A} it moves one string toward the floor.' },
        { text: 'The open string 4 with string 3', why: 'That would be a shuffle on {c:D}, a string too far.' },
      ],
      explain: 'Each shuffle sits on its chord\'s open root: string 6 for {c:E}, string 5 for {c:A}, with frets 2 and 4 of the next string.',
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'B7',
      frets: 'x21202',
      accept: 'this-shape',
      prompt: 'Build {c:B7} (x21202), the chord that turns the form around in bars 9 and 12.',
      explain: '{c:B7}: finger 2 on string 5, fret 2, finger 1 on string 4, fret 1, finger 3 on string 3, fret 2, the open string 2, finger 4 on string 1, fret 2.',
    },
    playerTask({
      id: 'shuffle-e',
      title: 'The 12-bar shuffle in E',
      song: 'st-blues-shuffle-e',
      tempo: 91,
      minutes: 5,
      body: 'Play the 12-Bar Blues Shuffle in E at 91 % (80 BPM), twice through. Say the chord names as they come: the quick change to {c:A} in bar 2 is the one that catches people. {c:B7} is strummed, still swinging.',
      tip: 'Keep the long-short in the right hand even when the left hand is busy changing.',
    }),
    {
      type: 'true-false',
      statement: 'In the quick-change blues in E, bar 2 is {c:A}.',
      answer: true,
      explain: 'That is the quick change: bar 2 moves to the {r:IV} chord, {c:A}, and bar 3 is back on {c:E}.',
      fact: 'blues-quick-change',
    },
    toolTask({
      id: 'quick-change-jam',
      title: 'Jam: three choruses in E',
      tool: 'progressions',
      params: ['blues-quick-change', 'e', 'jam'],
      minutes: 5,
      body: 'Set the band to 96 BPM in E and shuffle for three choruses, 36 bars. Bar 2 goes to {c:A}, bars 9 and 12 to {c:B7}. If you get lost, wait for the {c:B7} in bar 9: then it is {c:A}, {c:E}, {c:B7} and the top.',
    }),
    {
      type: 'choice',
      prompt: 'What does the {c:B7} in bar 12 do?',
      options: [
        { text: 'Turns the form around, back to the top', correct: true },
        { text: 'Ends the song', why: 'A song can end on {c:E}; {c:B7} in bar 12 says: once more from the top.' },
        { text: 'Starts the quick change', why: 'The quick change is bar 2, the {c:A}.' },
      ],
      explain: '{c:B7} is the {t:dominant} of E: it pulls back to {c:E}, so bar 12 sends the band to the top of the form.',
      fact: 'blues-turnaround-chord',
    },
  ],
  facts: [
    { id: 'blues-quick-change', front: 'What is the quick change in a 12-bar blues?', back: 'Bar 2 moves to the {r:IV} chord and back. In E: {c:E} {c:A} {c:E} {c:E}, {c:A} {c:A} {c:E} {c:E}, {c:B7} {c:A} {c:E} {c:B7}.' },
    { id: 'shuffle-in-e', front: 'Which notes make the shuffle on {c:E}?', back: 'The open string 6 ({n:E}) with string 5, fret 2 ({n:B}), then fret 4 ({n:C#}): the 5th and the 6th, long-short.' },
    { id: 'blues-turnaround-chord', front: 'Why does a 12-bar blues in E end bar 12 on {c:B7}?', back: 'It is the V chord: it pulls back to {c:E} and turns the form around to the top.' },
  ],
};

// ── 2. Seventh chords up the neck ──────────────────────────────────────────────────────────────

const dominantSevenths: TeacherLesson = {
  id: 'dominant-sevenths',
  title: 'Seventh chords up the neck',
  teaches: '{c:A7} (575655), {c:D7} (x57575) and {c:E7} (x79797) keep a whole blues in A around the 5th fret.',
  minutes: 5,
  skill: 'teacher:dev:dominant-sevenths',
  steps: [
    {
      type: 'card',
      title: 'Three sevenths, one job',
      body: 'A blues usually turns all three chords into dominant {t:seventh-chord|sevenths}, and they all have the same restless job: they want to move. Movable shapes keep the whole blues near the 5th fret. {c:A7} is the E shape at fret 5; its flat seventh, {n:G}, is on string 4.',
      figure: { kind: 'chord', symbol: 'A7', frets: '575655', caption: '{c:A7}, E shape at fret 5. The seventh: string 4, fret 5.' },
    },
    {
      type: 'fretboard-find',
      prompt: 'Here is {c:A7} at fret 5. Tap its flat seventh, the note that makes it a seventh chord.',
      find: { note: 'G' },
      mode: 'one',
      octave: 'any',
      frets: [5, 7],
      shown: [
        { string: 6, fret: 5 }, { string: 5, fret: 7 }, { string: 4, fret: 5 },
        { string: 3, fret: 6 }, { string: 2, fret: 5 }, { string: 1, fret: 5 },
      ],
      explain: 'String 4, fret 5 is {n:G}, the {d:b7} of {n:A}. Move it up to fret 7, an {n:A}, and the chord is a plain {c:A} barre.',
      fact: 'flat-sevenths-a-blues',
    },
    {
      type: 'card',
      title: 'The A shape for {c:D7} and {c:E7}',
      body: '{c:D7} and {c:E7} are the A shape, rooted on string 5: {c:D7} at fret 5 (x57575), {c:E7} two frets higher (x79797). Their sevenths, {n:C} and {n:D}, sit on string 3. The flat seventh in each chord is the blues\' signature.',
      figure: { kind: 'chord', symbol: 'D7', frets: 'x57575', caption: '{c:D7}, A shape at fret 5. Slide it up two frets for {c:E7}.' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each chord with its flat seventh.',
      pairs: [
        { left: '{c:A7}', right: '{n:G}' },
        { left: '{c:D7}', right: '{n:C}' },
        { left: '{c:E7}', right: '{n:D}' },
      ],
      explain: 'The flat seventh is a whole step under the root: {n:G} under {n:A}, {n:C} under {n:D}, {n:D} under {n:E}.',
      fact: 'flat-sevenths-a-blues',
    },
    {
      type: 'play-chord',
      prompt: 'Strum {c:A7} at fret 5 (575655) once and let it ring.',
      chord: 'A7',
      frets: '575655',
      explain: 'Index across fret 5, ring finger on string 5, fret 7, middle finger on string 3, fret 6. The index on string 4 plays the seventh, {n:G}.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'A7', frets: '575655', accept: 'this-shape', prompt: 'Build {c:A7} as the E shape at fret 5.', explain: '{c:A7} at fret 5: 575655, with the seventh, {n:G}, at string 4, fret 5.' },
    },
    {
      type: 'play-chord',
      prompt: 'Now {c:D7} (x57575), strings 5 to 1.',
      chord: 'D7',
      frets: 'x57575',
      explain: 'Index on string 5, fret 5 for the root, then frets 7, 5, 7, 5. Mute string 6 with the tip of the index.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'D7', frets: 'x57575', accept: 'this-shape', prompt: 'Build {c:D7} as the A shape at fret 5.', explain: '{c:D7} at fret 5: x57575, with the seventh, {n:C}, at string 3, fret 5.' },
    },
    {
      type: 'play-chord',
      prompt: 'And {c:E7} (x79797): the same shape, two frets higher.',
      chord: 'E7',
      frets: 'x79797',
      explain: 'Slide the whole {c:D7} shape up two frets and it is {c:E7}, with its seventh, {n:D}, at string 3, fret 7.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'E7', frets: 'x79797', accept: 'this-shape', prompt: 'Build {c:E7} as the A shape at fret 7.', explain: '{c:E7} at fret 7: x79797, with the seventh, {n:D}, at string 3, fret 7.' },
    },
    toolTask({
      id: 'sevenths-jam',
      title: 'Jam: sevenths around fret 5',
      tool: 'progressions',
      params: ['blues-12-bar', 'a', 'jam'],
      minutes: 4,
      body: 'Set the band to 88 BPM. Shuffle-strum {c:A7}, {c:D7} and {c:E7} with these shapes, and make the strums on 2 and 4 short chops: hit, then let the fretting hand go light so the chord stops.',
    }),
    { generate: 'chord-quality-ear', params: { types: ['7', 'maj7'] } },
    playerTask({
      id: 'shuffle-a-sevenths',
      title: 'The 12-bar shuffle in A, two ways',
      song: 'st-blues-shuffle-a',
      minutes: 4,
      body: 'Play the 12-Bar Blues Shuffle in A at 84 BPM, twice through: the two-string shuffle in the first chorus, then the three seventh shapes around the 5th fret in the second, one chord per bar as the chart says.',
    }),
    toolTask({
      id: 'sevenths-ear',
      title: 'Ear: three kinds of seventh',
      tool: 'ear',
      params: ['chords', '6'],
      minutes: 3,
      body: 'In Ear Training, Chord quality, level 6: major seventh, dominant seventh or minor seventh. Ten questions. The dominant seventh is the restless one, the blues one.',
    }),
    {
      type: 'choice',
      prompt: 'Which note makes {c:E7} a dominant seventh chord?',
      options: [
        { text: '{n:D}', correct: true },
        { text: '{n:D#}', why: '{n:D#} is the major seventh: it would make {c:Emaj7}, smooth rather than restless.' },
        { text: '{n:C#}', why: '{n:C#} is the 6th of {n:E}: it would make a sixth chord.' },
      ],
      explain: '{c:E7} is {n:E} {n:G#} {n:B} {n:D}: the flat seventh, {n:D}, a whole step under the root, is what makes it restless.',
      fact: 'blues-sevenths-job',
    },
  ],
  facts: [
    { id: 'blues-sevenths-job', front: 'Why are the chords of a blues usually dominant sevenths?', back: 'A dominant seventh is restless: it wants to move. In a blues all three chords have that job, and the flat seventh is the blues\' signature.' },
    { id: 'sevenths-up-the-neck', front: 'Movable {c:A7}, {c:D7} and {c:E7} near the 5th fret?', back: '{c:A7} 575655 (E shape), {c:D7} x57575 and {c:E7} x79797 (A shape).' },
    { id: 'flat-sevenths-a-blues', front: 'The flat sevenths of {c:A7}, {c:D7} and {c:E7}?', back: '{n:G}, {n:C} and {n:D}: each a whole step under its root.' },
  ],
};

// ── 3. Turnarounds ─────────────────────────────────────────────────────────────────────────────

const turnarounds: TeacherLesson = {
  id: 'turnarounds',
  title: 'Turnarounds',
  teaches: 'A turnaround fills bars 11 and 12 with a line falling by half steps, {d:b7} {d:6} {d:b6} {d:5}, then the V chord.',
  minutes: 5,
  skill: 'teacher:dev:turnarounds',
  steps: [
    {
      type: 'card',
      title: 'Here we go again',
      body: 'A {t:turnaround} fills bars 11 and 12 and tells the band: here we go again. In E, over the open string 6, a line falls a fret at a time on string 3, from fret 7 ({n:D}) to fret 4 ({n:B}), each note with the open string 1. Then {c:B7}.',
      figure: { kind: 'tab', tempo: 80, notes: TURNAROUND_E, caption: 'The line in E on string 3, frets 7 6 5 4, over the open strings 6 and 1.' },
    },
    {
      type: 'order',
      prompt: 'Put the notes of the turnaround in E in the order they fall.',
      tiles: ['{n:D}', '{n:C#}', '{n:C}', '{n:B}'],
      distractors: ['{n:A}'],
      explain: 'String 3, frets 7, 6, 5, 4: {n:D} {n:C#} {n:C} {n:B}, a half step at a time down to the 5th of {n:E}.',
      fact: 'turnaround-e',
    },
    {
      type: 'fretboard-name',
      prompt: 'The root (R) is {n:E}. Which degree is the turnaround note on string 3, fret 6?',
      position: { string: 3, fret: 6 },
      root: { string: 4, fret: 2 },
      ask: 'degree',
      spelling: 'any',
      options: ['6', 'b6', '5', 'b7'],
      explain: 'String 3, fret 6 is {n:C#}, the 6th of {n:E}. The line runs {d:b7} {d:6} {d:b6} {d:5}: {n:D} {n:C#} {n:C} {n:B}.',
      fact: 'turnaround-degrees',
    },
    {
      type: 'card',
      title: 'The same idea in A',
      body: 'In A, over the open string 5: string 4, frets 5, 4, 3, 2 ({n:G} {n:F#} {n:F} {n:E}), each with the open string 1, then {c:E7}. Both lines run {d:b7}, {d:6}, {d:b6}, {d:5} of the key.',
      figure: { kind: 'tab', tempo: 80, notes: TURNAROUND_A, caption: 'The line in A on string 4, frets 5 4 3 2, over the open strings 5 and 1.' },
      tip: 'Left hand: fingers 4, 3, 2, 1, one per fret, walking down. Thumb on the bass, fingers on the line and string 1.',
    },
    {
      type: 'choice',
      prompt: 'Which degrees do both turnaround lines run?',
      options: [
        { text: '{d:b7} {d:6} {d:b6} {d:5}', correct: true },
        { text: '{d:5} {d:b6} {d:6} {d:b7}', why: 'Those are the right notes going up. The turnaround falls.' },
        { text: '{d:7} {d:b7} {d:6} {d:b6}', why: 'It starts a fret lower, on the flat seventh, and lands on the 5th.' },
      ],
      explain: 'In E: {n:D} {n:C#} {n:C} {n:B}. In A: {n:G} {n:F#} {n:F} {n:E}. Flat seventh down to the fifth, a half step at a time.',
      fact: 'turnaround-degrees',
    },
    playerTask({
      id: 'turnaround-loops',
      title: 'Loop the two turnarounds',
      song: 'st-blues-turnarounds',
      bars: [1, 2],
      tempo: 75,
      minutes: 4,
      body: 'Loop bars 1 and 2, the E turnaround, at 75 % (60 BPM), swung long-short. Then set the loop to bars 3 and 4, the A turnaround, and play that one until it is just as easy.',
      tip: 'The line is the star. Keep the open strings quieter than the moving note.',
    }),
    {
      type: 'true-false',
      statement: 'The A turnaround ends on {c:E7}, which leads back to {c:A} at the top.',
      answer: true,
      explain: '{c:E7} is the V chord in A. Like {c:B7} in E, it pulls back home and turns the form around.',
    },
    playerTask({
      id: 'turnaround-choruses',
      title: 'Turnarounds in full choruses',
      song: 'st-blues-turnarounds',
      minutes: 4,
      body: 'Now the whole study at 80 BPM: both turnarounds, then a full 12-bar chorus in E and one in A, each ending with its turnaround and a last chord.',
    }),
    {
      type: 'choice',
      prompt: 'You are playing a 12-bar in A. In which bars does the turnaround go?',
      options: [
        { text: 'Bars 11 and 12', correct: true },
        { text: 'Bars 1 and 2', why: 'Bars 1 and 2 start the form. The turnaround ends it.' },
        { text: 'Bars 9 and 10', why: 'In A, bars 9 and 10 are {c:E} and {c:D}. The turnaround comes right after them.' },
      ],
      explain: 'The turnaround is the last two bars: the falling line in bar 11, the V chord in bar 12.',
      fact: 'turnaround-bars',
    },
    toolTask({
      id: 'turnaround-jam',
      title: 'Jam: a turnaround every chorus',
      tool: 'progressions',
      params: ['blues-quick-change', 'e', 'jam'],
      minutes: 4,
      body: 'Set the band to 90 BPM in E. Shuffle, and every time bars 11 and 12 come round, play your turnaround: the falling line on string 3, then {c:B7}. Count the bars out loud at first.',
    }),
    {
      type: 'fretboard-find',
      prompt: 'Tap where the E turnaround starts: the flat seventh of {n:E} on string 3.',
      find: { note: 'D' },
      mode: 'one',
      octave: 'any',
      frets: [0, 8],
      strings: [3],
      explain: 'String 3, fret 7 is {n:D}, the {d:b7} of {n:E}. From there the line falls a fret at a time to fret 4.',
      fact: 'turnaround-e',
    },
  ],
  facts: [
    { id: 'turnaround-bars', front: 'What is a blues turnaround, and where does it go?', back: 'Bars 11 and 12: a phrase that leads back to the top of the form, ending on the V chord.' },
    { id: 'turnaround-e', front: 'The turnaround line in E?', back: 'String 3, frets 7 6 5 4 ({n:D} {n:C#} {n:C} {n:B}) over the open strings 6 and 1, then {c:B7}.' },
    { id: 'turnaround-degrees', front: 'Which degrees does the classic falling turnaround run?', back: '{d:b7} {d:6} {d:b6} {d:5}. In A: {n:G} {n:F#} {n:F} {n:E}, then {c:E7}.' },
  ],
};

// ── 4. The blues scale ─────────────────────────────────────────────────────────────────────────

const bluesScaleSolo: TeacherLesson = {
  id: 'blues-scale-solo',
  title: 'The blues scale',
  teaches: 'The A blues scale is minor pentatonic plus {n:Eb}, the flat fifth: a blue note you pass through, never stop on.',
  minutes: 5,
  skill: 'teacher:dev:blues-scale-solo',
  steps: [
    {
      type: 'card',
      title: 'One more note',
      body: 'Add one note to A minor pentatonic and you have the A blues scale: {n:A} {n:C} {n:D} {n:Eb} {n:E} {n:G}. The new note, {n:Eb}, is the flat fifth, a {t:blue-note}. In box 1 it sits at string 5, fret 6 and string 3, fret 8.',
      figure: { kind: 'fretboard', frets: [5, 8], dots: BOX_1_WITH_BLUE, caption: 'Box 1 plus the blue note, {n:Eb}, highlighted.' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the A blues scale.',
      text: '{n:A}  {n:C}  {n:D}  ___  {n:E}  ___',
      blanks: ['{n:Eb}', '{n:G}'],
      bank: ['{n:F}', '{n:Bb}', '{n:F#}'],
      explain: 'A minor pentatonic, {n:A} {n:C} {n:D} {n:E} {n:G}, with the flat fifth, {n:Eb}, between {n:D} and {n:E}.',
      fact: 'blues-scale-notes',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap both {n:Eb} notes in box 1, between fret 5 and fret 8.',
      find: { note: 'Eb' },
      mode: 'all',
      octave: 'any',
      frets: [5, 8],
      explain: 'String 5, fret 6 and string 3, fret 8: each one a fret above a {n:D} of the box, on its way up to {n:E}.',
      fact: 'blues-scale-box-1',
    },
    {
      type: 'card',
      title: 'Pass through it',
      body: 'The flat third and the flat seventh, {n:C} and {n:G}, are blue notes too, and you already play them. {n:Eb} is the spicy one: treat it as a passing note. Slide or step through it to {n:D} or {n:E}; do not stop on it.',
      figure: { kind: 'tab', tempo: 84, notes: DEV_BLUES_LICK, caption: 'My lick: through {n:Eb} on string 3, then on string 5, home to {n:A}.' },
      tip: 'Both times the blue note walks from {n:D} to {n:E}. Steal that move tonight.',
    },
    {
      type: 'choice',
      prompt: 'Where does {n:Eb} belong in a blues phrase in A?',
      options: [
        { text: 'Passing through, on the way to {n:D} or {n:E}', correct: true },
        { text: 'As the last note of a phrase', why: 'Stop on it and it sounds like a wrong note, not the blues. Let it pass.' },
        { text: 'Held as long as you can', why: 'A long {n:Eb} hangs in the air with nowhere to go. Move through it.' },
      ],
      explain: 'The flat fifth is tension. Slide or step through it to {n:D} or {n:E} and the tension releases: that is the blues sound.',
      fact: 'blue-note-passing',
    },
    {
      type: 'play-phrase',
      prompt: 'Play the blue-note passage five times: string 3, frets 7 and 8, then string 2, fret 5.',
      notes: BLUE_NOTE_PASSAGE,
      octave: 'exact',
      tempo: 70,
      explain: '{n:D} {n:Eb} {n:E}, five times: fingers 3 and 4 on string 3, finger 1 on string 2, fret 5. The {n:Eb} never stops; it lands on {n:E}.',
      alternative: {
        type: 'order',
        prompt: 'Put the notes of the blue-note passage in order.',
        tiles: ['{n:D}', '{n:Eb}', '{n:E}'],
        distractors: ['{n:F}'],
        explain: 'String 3, fret 7 ({n:D}), fret 8 ({n:Eb}), then string 2, fret 5 ({n:E}): up a half step at a time.',
      },
    },
    toolTask({
      id: 'blues-scale-scales',
      title: 'The A blues scale in Scales',
      tool: 'scales',
      params: ['a', 'minor-blues', 'position-1'],
      minutes: 3,
      body: 'Open the A blues scale at frets 5 to 8 and switch the labels to degrees. Play it up and down slowly, and say "flat five" out loud every time you pass {n:Eb}.',
    }),
    { generate: 'scale-ear', params: { scales: ['minor-pentatonic', 'minor-blues'] } },
    toolTask({
      id: 'blues-scale-jam',
      title: 'Jam: the blue note in every chorus',
      tool: 'progressions',
      params: ['blues-12-bar', 'a', 'jam'],
      minutes: 5,
      body: 'Set the band to 84 BPM. Solo for three choruses with the blue note in every chorus, but never as the last note of a phrase: let it pass through to {n:D} or {n:E}.',
      tip: 'Start with my lick, then change one note of it each chorus.',
    }),
    {
      type: 'true-false',
      statement: 'In the A blues scale, {n:Eb} is the flat fifth of {n:A}.',
      answer: true,
      explain: '{n:A} up to {n:E} is a fifth; {n:Eb} is a half step lower, the flat fifth ({d:b5}), half an octave above {n:A}.',
      fact: 'blues-scale-notes',
    },
  ],
  facts: [
    {
      id: 'blues-scale-notes',
      front: 'The notes of the A blues scale?',
      back: '{n:A} {n:C} {n:D} {n:Eb} {n:E} {n:G}: minor pentatonic plus the flat fifth.',
      ask: { generate: 'scale-notes', params: { scales: ['minor-blues'], tonics: ['A'], form: 'order' } },
    },
    { id: 'blue-note-passing', front: 'How do you use the flat fifth in a blues solo?', back: 'As a passing note: slide or step through it to the 4th or the 5th. Never end a phrase on it.' },
    { id: 'blues-scale-box-1', front: 'Where is {n:Eb} in A minor pentatonic box 1?', back: 'String 5, fret 6 and string 3, fret 8.' },
  ],
};

// ── 5. Major and minor, mixed ──────────────────────────────────────────────────────────────────

const majorAndMinorMix: TeacherLesson = {
  id: 'major-and-minor-mix',
  title: 'Major and minor, mixed',
  teaches: 'Mix A minor and A major pentatonic over a blues, and land on each chord\'s target note as it arrives.',
  minutes: 5,
  skill: 'teacher:dev:major-and-minor-mix',
  steps: [
    {
      type: 'card',
      title: 'Tough and sweet',
      body: 'Over a blues in A, minor pentatonic (box 1) sounds tough and bluesy, and major pentatonic (the box 1 shape at fret 2) sounds sweet. Great blues players mix the two in one solo, sometimes in one phrase.',
      figure: { kind: 'fretboard', frets: [2, 8], dots: MINOR_AND_MAJOR, caption: 'Plain: A minor pentatonic, box 1. Faded: A major pentatonic at fret 2.' },
    },
    { generate: 'scale-ear', params: { scales: ['minor-pentatonic', 'major-pentatonic'] } },
    {
      type: 'card',
      title: 'Aim for the chord',
      body: 'The ear-opener: target the chord as it arrives. Over {c:A7}, land on its third, {n:C#} at string 3, fret 6. Over {c:D7}, its seventh, {n:C} at string 3, fret 5. Over {c:E7}, its third, {n:G#} at string 4, fret 6.',
      figure: {
        kind: 'fretboard',
        frets: [4, 7],
        dots: [
          { string: 3, fret: 6, note: 'C#', label: 'A7', role: 'target' },
          { string: 3, fret: 5, note: 'C', label: 'D7', role: 'target' },
          { string: 4, fret: 6, note: 'G#', label: 'E7', role: 'target' },
        ],
        caption: 'The three targets, each marked with its chord.',
      },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each chord with its target note.',
      pairs: [
        { left: '{c:A7}', right: '{n:C#}, string 3 fret 6' },
        { left: '{c:D7}', right: '{n:C}, string 3 fret 5' },
        { left: '{c:E7}', right: '{n:G#}, string 4 fret 6' },
      ],
      explain: 'The third of {c:A7} is {n:C#}, the seventh of {c:D7} is {n:C}, the third of {c:E7} is {n:G#}. All three sit within a fret of box 1.',
      fact: 'blues-targets-a',
    },
    {
      type: 'play-note',
      prompt: 'The band hits {c:A7}. Play its target, the third: string 3, fret 6.',
      note: 'C#4',
      octave: 'exact',
      where: { string: 3, fret: 6 },
      explain: '{n:C#} is the third of {c:A7}: the major sound. In box 1 you play {n:C} at fret 5, one fret below it.',
      alternative: { type: 'fretboard-find', prompt: 'Tap the third of {c:A7} near the 5th fret.', find: { note: 'C#4' }, mode: 'one', octave: 'exact', frets: [4, 8], explain: 'String 3, fret 6 is {n:C#}, the third of {c:A7}.' },
    },
    {
      type: 'play-note',
      prompt: 'Now {c:D7}. Play its target, the seventh: string 3, fret 5.',
      note: 'C4',
      octave: 'exact',
      where: { string: 3, fret: 5 },
      explain: '{n:C} is the flat seventh of {c:D7}. It is also in box 1, so minor pentatonic hands it to you.',
      alternative: { type: 'fretboard-find', prompt: 'Tap the seventh of {c:D7} near the 5th fret.', find: { note: 'C4' }, mode: 'one', octave: 'exact', frets: [4, 8], explain: 'String 3, fret 5 is {n:C}, the seventh of {c:D7}.' },
    },
    {
      type: 'play-note',
      prompt: 'And {c:E7}. Play its target, the third: string 4, fret 6.',
      note: 'G#3',
      octave: 'exact',
      where: { string: 4, fret: 6 },
      explain: '{n:G#} is the third of {c:E7}, a half step under {n:A}, the home note: it pulls the band home.',
      alternative: { type: 'fretboard-find', prompt: 'Tap the third of {c:E7} near the 5th fret.', find: { note: 'G#3' }, mode: 'one', octave: 'exact', frets: [4, 8], explain: 'String 4, fret 6 is {n:G#}, the third of {c:E7}.' },
    },
    toolTask({
      id: 'mix-jam',
      title: 'Jam: minor, major, then both',
      tool: 'progressions',
      params: ['blues-12-bar', 'a', 'jam'],
      minutes: 6,
      body: 'Set the band to 80 BPM. Chorus 1: minor pentatonic only. Chorus 2: major pentatonic only. Chorus 3: both, landing on the targets at the changes. Record chorus 3 on your phone and listen: do the targets land right as the chords change?',
    }),
    {
      type: 'true-false',
      statement: 'Over {c:D7}, the {n:C} at string 3, fret 5 is the chord\'s seventh.',
      answer: true,
      explain: '{c:D7} is {n:D} {n:F#} {n:A} {n:C}: {n:C} is its flat seventh, and it sits right in box 1.',
      fact: 'blues-targets-a',
    },
    {
      type: 'choice',
      prompt: 'Over {c:E7}, which note do you aim for?',
      options: [
        { text: '{n:G#}, the third', correct: true },
        { text: '{n:G}', why: '{n:G} is in minor pentatonic and sounds bluesy, but {n:G#} is the chord\'s own third.' },
        { text: '{n:F#}', why: '{n:F#} is not in {c:E7} at all.' },
      ],
      explain: '{c:E7} is {n:E} {n:G#} {n:B} {n:D}. Its third, {n:G#}, sits one fret above the {n:G} of box 1, on string 4.',
      fact: 'blues-targets-a',
    },
  ],
  facts: [
    { id: 'blues-mix-pentatonics', front: 'Over a blues in A, how do minor and major pentatonic sound?', back: 'Minor (box 1): tough and bluesy. Major (the box 1 shape at fret 2): sweet. Great blues players mix the two.' },
    { id: 'blues-targets-a', front: 'Target notes for {c:A7}, {c:D7} and {c:E7} near the 5th fret?', back: '{c:A7}: its third, {n:C#} (string 3, fret 6). {c:D7}: its seventh, {n:C} (string 3, fret 5). {c:E7}: its third, {n:G#} (string 4, fret 6).' },
  ],
};

// ── 6. The minor blues ─────────────────────────────────────────────────────────────────────────

const minorBlues: TeacherLesson = {
  id: 'minor-blues',
  title: 'The minor blues',
  teaches: 'The minor blues makes its first and fourth chords minor, {c:Am7} and {c:Dm7}, and keeps {c:E7}, whose {n:G#} pulls home.',
  minutes: 5,
  skill: 'teacher:dev:minor-blues',
  steps: [
    {
      type: 'card',
      title: 'Minor, and still the blues',
      body: 'The minor blues keeps the 12-bar form but makes the {r:i} and {r:iv} chords minor: {c:Am7} (x02010) and {c:Dm7} (xx0211). {c:E7} (020100) stays a dominant seventh, because its {n:G#} pulls home to {n:A}.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: [...MINOR_BLUES_A], beats: 2, tempo: 96 }, label: 'Hear the minor blues' },
    },
    {
      type: 'order',
      prompt: 'Put the three lines of the minor blues in A in order.',
      tiles: ['{c:Am7} {c:Am7} {c:Am7} {c:Am7}', '{c:Dm7} {c:Dm7} {c:Am7} {c:Am7}', '{c:E7} {c:Dm7} {c:Am7} {c:E7}'],
      distractors: ['{c:E7} {c:E7} {c:Am7} {c:Am7}'],
      explain: 'Four bars of {c:Am7}, two of {c:Dm7}, two of {c:Am7}, then {c:E7} {c:Dm7} {c:Am7} {c:E7}. The same 12-bar shape as a major blues.',
      fact: 'minor-blues-form',
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'Dm7',
      frets: 'xx0211',
      accept: 'this-shape',
      prompt: 'Build {c:Dm7} (xx0211), the {r:iv} chord of the minor blues.',
      explain: '{c:Dm7}: finger 2 on string 3, fret 2, and finger 1 flat across strings 2 and 1 at fret 1, with the open string 4 as the root.',
    },
    {
      type: 'choice',
      prompt: 'Why does the minor blues keep {c:E7} instead of {c:Em7}?',
      options: [
        { text: 'Its {n:G#} pulls home to {n:A}', correct: true },
        { text: '{c:Em7} is not in the key of A minor', why: '{c:Em7} is in A minor, but its {n:G} sits a whole step under {n:A} and does not pull home.' },
        { text: '{c:E7} is easier to play', why: 'Both are open chords. The reason is the sound: the {n:G#}.' },
      ],
      explain: '{n:G#} is a half step under {n:A}. That small step is the strongest pull back home in the key.',
      fact: 'minor-blues-e7',
    },
    {
      type: 'card',
      title: 'The tune, in box 1',
      body: 'The study\'s tune lives in box 1 and sings in three lines like a blues verse: a line over {c:Am7}, the same idea higher over {c:Dm7}, and an answer over the turnaround. A minor pentatonic fits the whole form; over the {c:E7} bars, {n:G#} is a lovely target.',
      figure: { kind: 'tab', tempo: 80, notes: MINOR_BLUES_MELODY_1_2, caption: 'Bars 1 and 2 of the melody: box 1, a long {n:A} with vibrato.' },
    },
    {
      type: 'fretboard-name',
      prompt: 'Over {c:E7}, the tune can lean on string 4, fret 6, a fret above box 1\'s {n:G}. Which note is it?',
      position: { string: 4, fret: 6 },
      ask: 'note',
      spelling: 'any',
      options: ['G#', 'G', 'A', 'F#'],
      explain: 'String 4, fret 6 is {n:G#}, the third of {c:E7}. It is not in A minor pentatonic, which is exactly why it stands out over that chord.',
      fact: 'minor-blues-e7',
    },
    playerTask({
      id: 'minor-blues-rhythm',
      title: 'Minor Blues in A: rhythm',
      song: 'st-minor-blues-a',
      tempo: 90,
      minutes: 4,
      body: 'Pick the Rhythm track and play it at 90 % (72 BPM): {c:Am7}, {c:Dm7} and {c:E7}, strummed down, down-up, down, down-up, twice through.',
    }),
    {
      type: 'true-false',
      statement: 'In the minor blues in A, bars 5 and 6 are {c:Dm7}.',
      answer: true,
      explain: 'As in any 12-bar, bars 5 and 6 are the {r:iv} chord: here {c:Dm7}. Then two bars of {c:Am7}.',
      fact: 'minor-blues-form',
    },
    playerTask({
      id: 'minor-blues-melody',
      title: 'Minor Blues in A: the melody',
      song: 'st-minor-blues-a',
      tempo: 90,
      minutes: 5,
      body: 'Now pick the Melody track: 90 % (72 BPM), then 110 % (88 BPM). Give the long notes vibrato and let the rests breathe: they are where a singer takes a breath.',
    }),
    toolTask({
      id: 'minor-blues-jam',
      title: 'Jam: melody, then your solo',
      tool: 'progressions',
      params: ['blues-minor', 'a', 'jam'],
      minutes: 5,
      body: 'Set the band to 80 BPM. Alternate: one chorus of the study\'s melody, one chorus of your own solo in A minor pentatonic. Over the {c:E7} bars, try landing on {n:G#}.',
    }),
    {
      type: 'choice',
      prompt: 'Which scale fits the whole minor blues in A?',
      options: [
        { text: 'A minor pentatonic', correct: true },
        { text: 'A major pentatonic', why: 'Its {n:C#} clashes with the {n:C} in {c:Am7} and {c:Dm7}.' },
        { text: 'E minor pentatonic', why: 'It swaps {n:C} for {n:B}, and its home is {n:E}, not {n:A}.' },
      ],
      explain: '{n:A} {n:C} {n:D} {n:E} {n:G} sits well over {c:Am7} and {c:Dm7}, and over {c:E7} its {n:E} and {n:D} are chord tones. Add {n:G#} over {c:E7} as a target.',
    },
  ],
  facts: [
    { id: 'minor-blues-form', front: 'The 12-bar minor blues in A, bar by bar?', back: 'Four bars of {c:Am7}, two of {c:Dm7}, two of {c:Am7}, then {c:E7} {c:Dm7} {c:Am7} {c:E7}.' },
    { id: 'minor-blues-e7', front: 'Why does a minor blues in A keep {c:E7}?', back: 'Its third, {n:G#}, is a half step under {n:A}, so it pulls home. Over those bars {n:G#} is a lovely target.' },
    { id: 'minor-blues-chords', front: 'The chords of a minor blues, as numerals?', back: '{r:i}, {r:iv} and {r:V7}: in A, {c:Am7}, {c:Dm7} and {c:E7}. The first and fourth chords turn minor; the {r:V7} stays a dominant seventh.' },
  ],
};

/** Unit 5 of Dev's course. */
const unit: TeacherUnit = {
  id: 'dev-blues',
  title: 'The blues',
  theme: 'songs',
  description: 'The 12-bar in E and A with shuffles, sevenths and turnarounds, solos with the blues scale and target notes, and the minor blues.',
  lessons: [bluesInE, dominantSevenths, turnarounds, bluesScaleSolo, majorAndMinorMix, minorBlues],
  checkpoint: { sample: 8, maxMistakes: 2 },
  glossary: [
    { id: 'twelve-bar', term: '12-bar blues', definition: 'A form of 12 bars on the I, IV and V chords, repeated over and over: the backbone of the blues.' },
    { id: 'quick-change', term: 'quick change', definition: 'A 12-bar blues whose second bar moves to the IV chord and straight back to the I.' },
    { id: 'shuffle', term: 'shuffle', definition: 'A swung, long-short feel; on guitar, a bass-string figure that rocks between the 5th and 6th of the chord.' },
    { id: 'turnaround', term: 'turnaround', definition: 'A short phrase in the last two bars of a form that leads back to the top, usually ending on the V chord.' },
    { id: 'blue-note', term: 'blue note', definition: 'The flat third, flat fifth or flat seventh of the key: notes that bend the major sound toward the blues.' },
    { id: 'chord-tone', term: 'chord tone', definition: 'A note that belongs to the chord being played. A phrase that ends on one sounds settled.' },
  ],
};

export default unit;
