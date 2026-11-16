/**
 * Theory Path, unit 21: The blues. Written from the syllabus entries in
 * `src/content/plan/theory-path.json` (unit `the-blues`), one lesson per entry, in order: each
 * lesson opens with the "on the guitar" picture, asks the planned exercises, ends with the planned
 * drills, and turns every planned fact into a review card.
 *
 * `the-blues.test.ts` cross-checks every scale spelling, blue note, chord tone, chord shape, the
 * 12-bar charts in A, E and G, the numerals, the phrases and what each listening question plays
 * against the theory and guitar engines (`scaleNotes`, `chordNotes`, `buildVoicing`,
 * `progressionToChords`, `midiAt`).
 *
 * Notes for readers of the code:
 * - `teaches` is shown as plain text on the map, so it names chords and degrees in words.
 * - The microphone hears one chord at a time, so "play through the 12 bars" is a card with the
 *   backing to strum along with, followed by a play-chord step that listens for the new chord of
 *   the lesson (the V chord, the turnaround chord, the minor iv chord).
 * - A lesson `Sound` plays one line at a time, so "a phrase over an A7 backing" picks the A7
 *   shape first and then plays the phrase. The quarter-tone curl on the C cannot be graded (the
 *   microphone would hear it as neither C nor C#), so the phrase is graded on its plain notes and
 *   the curl is offered once the note has sounded.
 */
import type { FretDot, Lesson, Sound, TabNote, Unit } from '@/lessons';

const U = 'the-blues';

const note = (string: number, fret: number, duration = 'q'): TabNote => ({ string, fret, duration });
const rest = (duration: string): TabNote => ({ rest: true, duration });
const dot = (string: number, fret: number, n: string, extra: Partial<FretDot> = {}): FretDot => ({ string, fret, note: n, ...extra });

/** Box 1 of A minor pentatonic: [string, fret, note], lowest note first. */
const A_MINOR_BOX: ReadonlyArray<readonly [number, number, string]> = [
  [6, 5, 'A'], [6, 8, 'C'], [5, 5, 'D'], [5, 7, 'E'], [4, 5, 'G'], [4, 7, 'A'],
  [3, 5, 'C'], [3, 7, 'D'], [2, 5, 'E'], [2, 8, 'G'], [1, 5, 'A'], [1, 8, 'C'],
];
/** Box 1 of A major pentatonic, root on string 6 at fret 5, frets 4 to 7. */
const A_MAJOR_BOX: ReadonlyArray<readonly [number, number, string]> = [
  [6, 5, 'A'], [6, 7, 'B'], [5, 4, 'C#'], [5, 7, 'E'], [4, 4, 'F#'], [4, 7, 'A'],
  [3, 4, 'B'], [3, 6, 'C#'], [2, 5, 'E'], [2, 7, 'F#'], [1, 5, 'A'], [1, 7, 'B'],
];
const IN_A: Record<string, string> = { A: '1', B: '2', C: 'b3', 'C#': '3', D: '4', Eb: 'b5', E: '5', 'F#': '6', G: 'b7' };
const boxDots = (box: ReadonlyArray<readonly [number, number, string]>, extra: ReadonlyArray<readonly [number, number, string]> = []): FretDot[] => [
  ...box.map(([s, f, n]) => dot(s, f, n, { degree: IN_A[n], ...(n === 'A' ? { role: 'root' as const } : {}) })),
  ...extra.map(([s, f, n]) => dot(s, f, n, { degree: IN_A[n], role: 'target' as const })),
];

/** The blue notes (Eb) inside box 1 of A minor pentatonic, and the added C notes of A major blues near box 1. */
export const BLUE_NOTES_BOX_1: ReadonlyArray<readonly [number, number, string]> = [[5, 6, 'Eb'], [3, 8, 'Eb']];
export const MAJOR_BLUES_ADDED: ReadonlyArray<readonly [number, number, string]> = [[6, 8, 'C'], [3, 5, 'C'], [1, 8, 'C']];

/** An original lick: string 3, D Eb D, then down to the root on string 4. */
export const BLUE_LICK: TabNote[] = [note(3, 7, 'e'), note(3, 8, 'e'), note(3, 7), note(4, 7, 'h')];
/** The b3 to 3 move of the major blues: C to C# on string 3 (a hammer-on), then E on string 2. */
export const B3_TO_3: TabNote[] = [note(3, 5, 'e'), note(3, 6, 'e'), note(2, 5, 'h.')];

/** The 12-bar blues, one chord per bar. */
export const TWELVE_BAR_A = ['A', 'A', 'A', 'A', 'D', 'D', 'A', 'A', 'E', 'D', 'A', 'A'];
export const TWELVE_BAR_NUMERALS = ['I', 'I', 'I', 'I', 'IV', 'IV', 'I', 'I', 'V', 'IV', 'I', 'I'];
export const QUICK_CHANGE_E = ['E7', 'A7', 'E7', 'E7', 'A7', 'A7', 'E7', 'E7', 'B7', 'A7', 'E7', 'B7'];
export const QUICK_CHANGE_NUMERALS = ['I', 'IV', 'I', 'I', 'IV', 'IV', 'I', 'I', 'V', 'IV', 'I', 'V'];
export const MINOR_BLUES_A = ['Am7', 'Am7', 'Am7', 'Am7', 'Dm7', 'Dm7', 'Am7', 'Am7', 'E7', 'Dm7', 'Am7', 'Am7'];

/** A7 picked string by string (x02020), then a phrase from box 1: the gritty one ends on C, the sweet one on C#. */
const A7_PICKED: TabNote[] = [note(5, 0, 'e'), note(4, 2, 'e'), note(3, 0, 'e'), note(2, 2, 'e'), note(1, 0, 'e'), rest('q.')];
export const GRITTY_PHRASE: TabNote[] = [note(2, 5, 'e'), note(2, 8, 'e'), note(2, 5, 'e'), note(3, 7, 'e'), note(3, 5, 'h')];
export const SWEET_PHRASE: TabNote[] = [note(2, 5, 'e'), note(2, 7, 'e'), note(2, 5, 'e'), note(3, 4, 'e'), note(3, 6, 'h')];
const OVER_A7 = (phrase: TabNote[]): Sound => ({ kind: 'tab', tempo: 90, notes: [...A7_PICKED, ...phrase] });

const theBluesScale: Lesson = {
  id: 'the-blues-scale',
  title: 'The blues scale',
  teaches: 'The minor blues scale is the minor pentatonic with one added note, the flat 5, called the blue note.',
  minutes: 3,
  skill: `theory:${U}:the-blues-scale`,
  steps: [
    {
      type: 'card',
      title: 'One extra note',
      body: 'Add one note to the minor pentatonic, the {d:b5}, and you have the {t:blues-scale|blues scale}: {d:1} {d:b3} {d:4} {d:b5} {d:5} {d:b7}. In {n:A}: {n:A} {n:C} {n:D} {n:Eb} {n:E} {n:G}. In box 1 the {n:Eb} sits one fret above {n:D}: string 5 at fret 6 and string 3 at fret 8.',
      figure: { kind: 'fretboard', frets: [4, 9], root: 'A', labels: 'degree', dots: boxDots(A_MINOR_BOX, BLUE_NOTES_BOX_1), caption: 'Box 1 of {n:A} minor pentatonic plus the two {d:b5}s, ringed: the {n:A} blues scale.' },
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap both blue notes, the {n:Eb}s, in box 1 of {n:A} minor pentatonic (frets 5 to 8).',
      find: { note: 'Eb' },
      mode: 'all',
      octave: 'any',
      frets: [5, 8],
      explain: 'String 5 at fret 6 and string 3 at fret 8: each one fret above a {n:D}, between the {d:4} and the {d:5}.',
      fact: 'blues-a-blues-notes',
    },
    {
      type: 'choice',
      prompt: 'Which note does the blues scale add to the minor pentatonic?',
      options: [
        { text: 'The {d:b5}', correct: true },
        { text: 'The {d:2}', why: 'The {d:2} belongs to natural minor. The blues scale adds the {d:b5}.' },
        { text: 'The {d:3}', why: 'The {d:3} is the major 3rd: the major blues scale has it, not this one.' },
        { text: 'The {d:6}', why: 'The {d:6} is not in the minor blues scale.' },
      ],
      explain: 'Minor pentatonic {d:1} {d:b3} {d:4} {d:5} {d:b7}, plus the {d:b5} between the {d:4} and the {d:5}: {d:1} {d:b3} {d:4} {d:b5} {d:5} {d:b7}.',
      fact: 'blues-scale-formula',
    },
    {
      type: 'card',
      title: 'The blue note',
      body: 'That {d:b5} is the {t:blue-note|blue note} (the {d:b3} and {d:b7} are blue notes too). It is tense, so it is usually **passed through** on the way to the {d:4} or the {d:5}, not held. In this original lick, string 3 goes {n:D}, {n:Eb}, {n:D}, then drops to the root.',
      figure: { kind: 'tab', tempo: 80, notes: BLUE_LICK, caption: '{n:D} {n:Eb} {n:D} on string 3, then {n:A} on string 4, fret 7.' },
    },
    {
      type: 'listen-choice',
      prompt: 'Listen to this scale from {n:A}. Is it the minor pentatonic or the blues scale?',
      sound: { kind: 'scale', tonic: 'A2', scale: 'minor-blues', direction: 'up', tempo: 100 },
      options: [{ text: 'Minor pentatonic' }, { text: 'Blues scale', correct: true }],
      shuffle: false,
      explain: 'Six notes, not five: between {n:D} and {n:E} it squeezed in {n:Eb}, so three notes in a row climb by half steps, {n:D} {n:Eb} {n:E}.',
    },
    {
      type: 'type-answer',
      prompt: 'Type the blue note of the {n:E} blues scale: its {d:b5}.',
      answer: { kind: 'note', value: 'Bb', spelling: 'exact' },
      input: 'keypad',
      explain: '{n:E} blues is {n:E} {n:G} {n:A} {n:Bb} {n:B} {n:D}. The {d:b5} is a half step below the {d:5}, {n:B}: as a flat 5 it is spelled {n:Bb}, not {n:A#}.',
    },
    {
      type: 'true-false',
      statement: 'The blue note is usually held for a long time, as the note a phrase ends on.',
      answer: false,
      explain: 'The {d:b5} is tense. It is usually passed through on the way to the {d:4} or the {d:5}, as in {n:D} {n:Eb} {n:D} or {n:D} {n:Eb} {n:E}.',
      fact: 'blues-blue-note',
    },
    { generate: 'scale-notes', params: { scales: ['minor-blues'], tonics: ['A', 'E', 'D', 'G'], form: 'order' } },
    { generate: 'scale-ear', params: { scales: ['minor-pentatonic', 'minor-blues'] } },
  ],
  facts: [
    {
      id: 'blues-scale-formula',
      front: 'What is the minor blues scale?',
      back: 'The minor pentatonic plus the {d:b5}: {d:1} {d:b3} {d:4} {d:b5} {d:5} {d:b7}.',
      ask: {
        type: 'choice',
        prompt: 'Which note turns the minor pentatonic into the blues scale?',
        options: [{ text: 'The {d:b5}', correct: true }, { text: 'The {d:2}' }, { text: 'The {d:3}' }, { text: 'The {d:6}' }],
        explain: 'The blues scale is {d:1} {d:b3} {d:4} {d:b5} {d:5} {d:b7}: the minor pentatonic plus the {d:b5}.',
      },
    },
    {
      id: 'blues-a-blues-notes',
      front: 'Spell the A blues scale.',
      back: '{n:A} {n:C} {n:D} {n:Eb} {n:E} {n:G}',
      ask: { generate: 'scale-notes', params: { scales: ['minor-blues'], tonics: ['A'], form: 'order' } },
    },
    {
      id: 'blues-blue-note',
      front: 'What is the blue note of the blues scale, and how is it usually played?',
      back: 'The added {d:b5} (the {d:b3} and {d:b7} are blue notes too). It is usually passed through on the way to the {d:4} or the {d:5}, not held.',
      ask: {
        type: 'true-false',
        statement: 'The {d:b5} of the blues scale is usually passed through on the way to the {d:4} or the {d:5}.',
        answer: true,
        explain: 'It is the tense blue note: a step between the {d:4} and the {d:5}, rarely a resting place.',
      },
    },
  ],
};

const theMajorBluesScale: Lesson = {
  id: 'the-major-blues-scale',
  title: 'The major blues scale',
  teaches: 'The major blues scale is the major pentatonic plus the flat 3, used for a sweeter, country-flavoured blues.',
  minutes: 3,
  skill: `theory:${U}:the-major-blues-scale`,
  steps: [
    {
      type: 'card',
      title: 'Major pentatonic plus one',
      body: 'The {t:major-blues-scale|major blues scale} adds the {d:b3} to the major pentatonic: {d:1} {d:2} {d:b3} {d:3} {d:5} {d:6}. In {n:A}: {n:A} {n:B} {n:C} {n:C#} {n:E} {n:F#}. Its box 1 has the root on string 6 at fret 5 and spans frets 4 to 7; the added {n:C}s sit at string 3 fret 5, string 1 fret 8 and string 6 fret 8.',
      figure: { kind: 'fretboard', frets: [4, 8], root: 'A', labels: 'degree', dots: boxDots(A_MAJOR_BOX, MAJOR_BLUES_ADDED), caption: 'Box 1 of {n:A} major pentatonic, with the added {d:b3}s ringed.' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the {n:A} major blues scale.',
      text: '{n:A}  {n:B}  ___  {n:C#}  {n:E}  {n:F#}',
      blanks: ['{n:C}'],
      bank: ['{n:D}', '{n:G}', '{n:G#}'],
      explain: '{n:A} major pentatonic is {n:A} {n:B} {n:C#} {n:E} {n:F#}. The major blues adds the {d:b3}, {n:C}, just below the {d:3}, {n:C#}.',
      fact: 'blues-a-major-blues-notes',
    },
    {
      type: 'choice',
      prompt: 'Which note does the major blues scale add to the major pentatonic?',
      options: [
        { text: 'The {d:b3}', correct: true },
        { text: 'The {d:b5}', why: 'The {d:b5} is what the minor blues scale adds to the minor pentatonic.' },
        { text: 'The {d:4}', why: 'The {d:4} is left out of both the major pentatonic and the major blues.' },
        { text: 'The {d:b7}', why: 'The {d:b7} belongs to the minor pentatonic and to dominant chords, not to this scale.' },
      ],
      explain: 'Major pentatonic {d:1} {d:2} {d:3} {d:5} {d:6}, plus the {d:b3}: {d:1} {d:2} {d:b3} {d:3} {d:5} {d:6}.',
      fact: 'blues-major-blues-formula',
    },
    {
      type: 'card',
      title: 'From flat 3 to 3',
      body: 'The {d:b3} is there to lead into the {d:3}. Play {n:C} on string 3 at fret 5 and {t:hammer-on|hammer on} to fret 6, {n:C#}: minor slides into major. Then land on {n:E} at string 2, fret 5. That little rise is a classic blues and country sound.',
      figure: { kind: 'tab', tempo: 80, notes: B3_TO_3, caption: 'String 3: 5 then hammer on to 6 ({n:C} to {n:C#}), then {n:E} on string 2.' },
    },
    {
      type: 'play-phrase',
      prompt: 'Pick {n:C} on string 3 at fret 5, hammer on to fret 6, then play {n:E} on string 2 at fret 5.',
      notes: B3_TO_3,
      octave: 'exact',
      tempo: 70,
      explain: '{n:C}, {n:C#}, {n:E}: the {d:b3} rising to the {d:3}, then the {d:5}. Hammer firmly so the {n:C#} sounds without a second pick.',
      alternative: {
        type: 'order',
        prompt: 'Put the notes of the {d:b3}-to-{d:3} move in {n:A} in order.',
        tiles: ['{n:C}', '{n:C#}', '{n:E}'],
        distractors: ['{n:D}'],
        explain: '{n:C} (the {d:b3}) rises a half step to {n:C#} (the {d:3}), then the line lands on {n:E} (the {d:5}).',
      },
    },
    {
      type: 'true-false',
      statement: 'Moving from the {d:b3} up to the {d:3} is a classic blues and country sound.',
      answer: true,
      explain: 'Sliding or hammering from {n:C} to {n:C#} over an {n:A} chord bends minor into major: one of the most used moves in blues and country guitar.',
      fact: 'blues-b3-to-3',
    },
    {
      type: 'choice',
      prompt: 'In {n:A}, the {d:b3}-to-{d:3} move goes from which note to which?',
      options: [
        { text: '{n:C} to {n:C#}', correct: true },
        { text: '{n:B} to {n:C}', why: 'That is the {d:2} to the {d:b3}.' },
        { text: '{n:C#} to {n:E}', why: 'That is the {d:3} to the {d:5}.' },
        { text: '{n:Eb} to {n:E}', why: 'That is the {d:b5} to the {d:5}, from the minor blues scale.' },
      ],
      explain: 'The {d:b3} of {n:A} is {n:C} and the {d:3} is {n:C#}: one fret apart, string 3 at frets 5 and 6.',
      fact: 'blues-b3-to-3',
    },
    { generate: 'scale-notes', params: { scales: ['major-blues', 'minor-blues'], tonics: ['A', 'E', 'G', 'D', 'C'], form: 'fill' } },
  ],
  facts: [
    {
      id: 'blues-major-blues-formula',
      front: 'What is the major blues scale?',
      back: 'The major pentatonic plus the {d:b3}: {d:1} {d:2} {d:b3} {d:3} {d:5} {d:6}.',
      ask: {
        type: 'choice',
        prompt: 'Which note does the major blues scale add to the major pentatonic?',
        options: [{ text: 'The {d:b3}', correct: true }, { text: 'The {d:b5}' }, { text: 'The {d:4}' }, { text: 'The {d:b7}' }],
        explain: 'Major blues is {d:1} {d:2} {d:b3} {d:3} {d:5} {d:6}: the major pentatonic plus the {d:b3}.',
      },
    },
    {
      id: 'blues-a-major-blues-notes',
      front: 'Spell the A major blues scale.',
      back: '{n:A} {n:B} {n:C} {n:C#} {n:E} {n:F#}',
      ask: { generate: 'scale-notes', params: { scales: ['major-blues'], tonics: ['A'], form: 'order' } },
    },
    {
      id: 'blues-b3-to-3',
      front: 'What is the classic major-blues move in A?',
      back: 'The {d:b3} rising to the {d:3}, {n:C} to {n:C#}, by a slide or a hammer-on.',
    },
  ],
};

const theTwelveBarForm: Lesson = {
  id: 'the-12-bar-form',
  title: 'The 12-bar form',
  teaches: 'The 12-bar blues is a fixed 12-bar pattern of the one, four and five chords that repeats for the whole song.',
  minutes: 4,
  skill: `theory:${U}:the-12-bar-form`,
  steps: [
    {
      type: 'card',
      title: 'Twelve bars, three chords',
      body: 'The {t:twelve-bar-blues|12-bar blues} is a chord pattern twelve {t:bar|bars} long, built from {r:I}, {r:IV} and {r:V}. It repeats, unchanged, for the whole song. In {n:A}, read it as three lines of four bars:\n| {c:A} | {c:A} | {c:A} | {c:A} |\n| {c:D} | {c:D} | {c:A} | {c:A} |\n| {c:E} | {c:D} | {c:A} | {c:A} |',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: TWELVE_BAR_A, beats: 4, tempo: 132 }, label: 'Hear the 12 bars in A' },
    },
    {
      type: 'choice',
      prompt: 'Which chord is in bar 10 of the basic 12-bar blues?',
      options: [
        { text: '{r:IV}', correct: true },
        { text: '{r:V}', why: '{r:V} is bar 9. Bar 10 steps back down to {r:IV}.' },
        { text: '{r:I}', why: '{r:I} comes back in bar 11.' },
      ],
      explain: 'Bars 9 to 12 are {r:V} {r:IV} {r:I} {r:I}: in {n:A}, {c:E} {c:D} {c:A} {c:A}.',
      fact: 'blues-twelve-bar-pattern',
    },
    {
      type: 'card',
      title: 'In numerals',
      body: 'In {t:roman-numerals|numerals} the pattern fits any key: four bars of {r:I}, two of {r:IV}, two of {r:I}, one of {r:V}, one of {r:IV}, two of {r:I}.\n{r:I} {r:I} {r:I} {r:I} | {r:IV} {r:IV} {r:I} {r:I} | {r:V} {r:IV} {r:I} {r:I}',
      figure: { kind: 'chord', symbol: 'E', frets: '022100', caption: 'In {n:A}, {r:V} is {c:E}: the chord of bar 9.' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the 12-bar blues in {n:A}.',
      text: '{c:A} {c:A} {c:A} {c:A} | {c:D} {c:D} {c:A} {c:A} | ___ {c:D} {c:A} {c:A}',
      blanks: ['{c:E}'],
      bank: ['{c:D}', '{c:Bm}', '{c:G}'],
      explain: 'Bar 9 is {r:V}, the high point of the form: {c:E} in {n:A}. Then {c:D} ({r:IV}) and two bars of {c:A} ({r:I}).',
      fact: 'blues-twelve-bar-pattern',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each key with the three chords of its 12-bar blues.',
      pairs: [
        { left: 'Blues in {n:A}', right: '{c:A}, {c:D}, {c:E}' },
        { left: 'Blues in {n:E}', right: '{c:E}, {c:A}, {c:B}' },
        { left: 'Blues in {n:G}', right: '{c:G}, {c:C}, {c:D}' },
      ],
      explain: 'Each blues uses {r:I}, {r:IV} and {r:V} of its key: {n:A} {n:D} {n:E}, {n:E} {n:A} {n:B}, {n:G} {n:C} {n:D}.',
      fact: 'blues-twelve-bar-keys',
    },
    {
      type: 'card',
      title: 'Play along',
      body: 'Strum the 12 bars in {n:A} with the backing: four down-strums a bar, counting 1 2 3 4. Change chord right on beat 1 of bars 5, 7, 9, 10 and 11. After bar 12, go round again from bar 1.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: TWELVE_BAR_A, beats: 4, tempo: 96 }, label: 'Backing, slower' },
      tip: 'Keep your strumming hand moving even while the other hand changes chord. Arriving on time matters more than a perfect chord.',
    },
    {
      type: 'play-chord',
      prompt: 'Bar 9 is {r:V}, the one new chord. Strum {c:E} and let it ring.',
      chord: 'E',
      frets: '022100',
      explain: '{r:V} in {n:A} is {c:E}: {n:E} {n:G#} {n:B}, all six strings. It is the furthest the 12 bars travel from home.',
      alternative: { generate: 'chord-shape', params: { chords: ['E'] } },
    },
    {
      type: 'true-false',
      statement: 'In a 12-bar blues, the chord pattern changes from one verse to the next.',
      answer: false,
      explain: 'The 12 bars repeat unchanged for the whole song, verses and solos alike. That is why anyone can join a blues jam after hearing it once.',
      fact: 'blues-twelve-bar-what',
    },
    { generate: 'roman-chord', params: { direction: 'to-chord', numerals: ['I', 'IV', 'V'], modes: ['major'], maxAccidentals: 4 } },
    { generate: 'roman-chord', params: { direction: 'to-roman', numerals: ['I', 'IV', 'V'], modes: ['major'], maxAccidentals: 4 } },
  ],
  facts: [
    {
      id: 'blues-twelve-bar-what',
      front: 'What is the 12-bar blues?',
      back: 'A 12-bar chord pattern built from {r:I}, {r:IV} and {r:V} that repeats for the whole song.',
      ask: {
        type: 'true-false',
        statement: 'The 12-bar blues is a 12-bar pattern of {r:I}, {r:IV} and {r:V} that repeats for the whole song.',
        answer: true,
        explain: 'Twelve bars, three chords, round and round: verses and solos use the same pattern.',
      },
    },
    {
      id: 'blues-twelve-bar-pattern',
      front: 'What is the basic 12-bar blues pattern?',
      back: 'Four bars of {r:I}, two of {r:IV}, two of {r:I}, one of {r:V}, one of {r:IV}, two of {r:I}.',
      ask: {
        type: 'order',
        prompt: 'Put bars 5 to 12 of the basic 12-bar blues in order.',
        tiles: ['{r:IV}', '{r:IV}', '{r:I}', '{r:I}', '{r:V}', '{r:IV}', '{r:I}', '{r:I}'],
        explain: 'After four bars of {r:I}: {r:IV} {r:IV} {r:I} {r:I} | {r:V} {r:IV} {r:I} {r:I}.',
      },
    },
    {
      id: 'blues-twelve-bar-keys',
      front: 'Which three chords make a 12-bar blues in A, in E and in G?',
      back: 'In {n:A}: {c:A}, {c:D}, {c:E}. In {n:E}: {c:E}, {c:A}, {c:B}. In {n:G}: {c:G}, {c:C}, {c:D}.',
      ask: {
        type: 'match-pairs',
        prompt: 'Match each key with the three chords of its 12-bar blues.',
        pairs: [
          { left: 'Blues in {n:A}', right: '{c:A}, {c:D}, {c:E}' },
          { left: 'Blues in {n:E}', right: '{c:E}, {c:A}, {c:B}' },
          { left: 'Blues in {n:G}', right: '{c:G}, {c:C}, {c:D}' },
        ],
        explain: '{r:I}, {r:IV} and {r:V} of each key.',
      },
    },
  ],
};

const dominantSevenths: Lesson = {
  id: 'dominant-sevenths',
  title: 'Dominant seventh chords',
  teaches: 'The blues usually turns all three chords into dominant sevenths, a major triad with a minor seventh added.',
  minutes: 4,
  skill: `theory:${U}:dominant-sevenths`,
  steps: [
    {
      type: 'card',
      title: 'A major chord plus a flat 7',
      body: 'A {t:dominant-seventh|dominant seventh chord} is a major triad with a {i:m7} added above the root: {d:1} {d:3} {d:5} {d:b7}. It is written with a plain 7: {c:A7} is {n:A} {n:C#} {n:E} plus {n:G}. In the open shape x02020, the open 3rd string is that {n:G}.',
      figure: { kind: 'chord', symbol: 'A7', frets: 'x02020', caption: 'Open {c:A7}: the open {n:G} on string 3 is the {d:b7}.' },
    },
    {
      type: 'listen-choice',
      prompt: 'You hear {c:A}, then a second chord. Is the second chord {c:A} again, or {c:A7}?',
      sound: { kind: 'progression', chords: ['A', 'A7'], beats: 4, tempo: 80 },
      options: [{ text: '{c:A} again' }, { text: '{c:A7}', correct: true }],
      shuffle: false,
      explain: 'The second chord was {c:A7}: the finger on string 3 lifts, so the open {n:G} rings. That {d:b7} adds a restless, bluesy edge.',
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete {c:D7}.',
      text: '{c:D7}:  {n:D}  {n:F#}  {n:A}  ___',
      blanks: ['{n:C}'],
      bank: ['{n:C#}', '{n:B}', '{n:G}'],
      explain: '{c:D7} is a {c:D} major triad, {n:D} {n:F#} {n:A}, plus the {i:m7} above {n:D}: {n:C}. {n:C#} would be a major 7th, which makes {c:Dmaj7}.',
      fact: 'blues-dominant-seventh-formula',
    },
    {
      type: 'card',
      title: 'All three chords',
      body: 'In a blues, all three chords are usually dominant sevenths: {r:I7}, {r:IV7} and {r:V7}. In {n:A}: {c:A7}, {c:D7} and {c:E7}. Open shapes: {c:A7} x02020, {c:D7} xx0212, {c:E7} 020100. In {c:D7} the {d:b7} is {n:C}, at string 2 fret 1; in {c:E7} it is the open {n:D}.',
      figure: { kind: 'chord', symbol: 'D7', frets: 'xx0212', caption: 'Open {c:D7}: {n:C} on string 2, fret 1, is the {d:b7}.' },
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'E7',
      frets: '020100',
      accept: 'any-voicing',
      prompt: 'Build {c:E7} on the fretboard.',
      hint: 'Start from open {c:E} and lift one finger.',
      explain: 'Open {c:E7} is 020100: open {c:E} with the finger on string 4 lifted, so the open {n:D}, the {d:b7}, rings.',
      fact: 'blues-open-sevenths',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each chord with its open shape (strings 6 to 1).',
      pairs: [
        { left: '{c:A7}', right: 'x02020' },
        { left: '{c:D7}', right: 'xx0212' },
        { left: '{c:E7}', right: '020100' },
      ],
      explain: '{c:A7} is open {c:A} without the fret 2 on string 3; {c:E7} is open {c:E} without the fret 2 on string 4; {c:D7} moves the string 2 note of open {c:D} down to fret 1.',
      fact: 'blues-open-sevenths',
    },
    {
      type: 'true-false',
      statement: 'In the key of {k:A major}, the {n:G} in {c:A7} belongs to the key.',
      answer: false,
      explain: '{k:A major} has {n:G#}, not {n:G}. The {d:b7} of {c:A7} and the {n:C} of {c:D7} are outside the key. The blues breaks the usual key rules on purpose: that clash is part of its sound.',
      fact: 'blues-outside-the-key',
    },
    {
      type: 'choice',
      prompt: 'In a 12-bar blues in {n:A}, which three chords are usually played?',
      options: [
        { text: '{c:A7}, {c:D7}, {c:E7}', correct: true },
        { text: '{c:A}, {c:D}, {c:E7}', why: 'Those are the key\'s own chords: common in pop, but a blues usually turns all three into sevenths.' },
        { text: '{c:Amaj7}, {c:Dmaj7}, {c:E7}', why: 'Major 7ths sound smooth and sweet. The blues uses the flat 7.' },
        { text: '{c:Am7}, {c:Dm7}, {c:E7}', why: 'That is the minor blues, at the end of this unit.' },
      ],
      explain: 'All three as dominant sevenths: {r:I7} {c:A7}, {r:IV7} {c:D7}, {r:V7} {c:E7}.',
      fact: 'blues-all-dominant',
    },
    { generate: 'chord-tones', params: { types: ['7'], roots: ['A', 'D', 'E', 'G', 'C', 'B'], ask: 'notes' } },
    { generate: 'chord-shape', params: { chords: ['E7', 'A7', 'D7'] } },
  ],
  facts: [
    {
      id: 'blues-dominant-seventh-formula',
      front: 'What is a dominant seventh chord?',
      back: 'A major triad plus a minor 7th: {d:1} {d:3} {d:5} {d:b7}. {c:A7} is {n:A} {n:C#} {n:E} {n:G}.',
      ask: { generate: 'chord-tones', params: { types: ['7'], roots: ['A', 'D', 'E'], ask: 'notes' } },
    },
    {
      id: 'blues-all-dominant',
      front: 'Which chords does a blues in A usually use?',
      back: 'All three as dominant sevenths: {c:A7}, {c:D7} and {c:E7}.',
      ask: {
        type: 'choice',
        prompt: 'In a 12-bar blues in {n:A}, which three chords are usually played?',
        options: [{ text: '{c:A7}, {c:D7}, {c:E7}', correct: true }, { text: '{c:A}, {c:D}, {c:E7}' }, { text: '{c:Amaj7}, {c:Dmaj7}, {c:E7}' }],
        explain: 'A blues usually makes all three chords dominant sevenths.',
      },
    },
    {
      id: 'blues-outside-the-key',
      front: 'In a blues, are the 7ths of {r:I7} and {r:IV7} in the major key?',
      back: 'No: the {d:b7} of {r:I7} and of {r:IV7} is outside the major key ({n:G} and {n:C} in {n:A}). The blues breaks the usual key rules on purpose.',
      ask: {
        type: 'true-false',
        statement: 'In a blues in {n:A}, the {n:C} of {c:D7} is outside the key of {k:A major}.',
        answer: true,
        explain: '{k:A major} has {n:C#}. The blues uses the flat 7 anyway: that is its sound.',
      },
    },
    {
      id: 'blues-open-sevenths',
      front: 'What are the open shapes of {c:A7}, {c:D7} and {c:E7}?',
      back: '{c:A7} x02020, {c:D7} xx0212, {c:E7} 020100.',
      ask: {
        type: 'match-pairs',
        prompt: 'Match each chord with its open shape (strings 6 to 1).',
        pairs: [
          { left: '{c:A7}', right: 'x02020' },
          { left: '{c:D7}', right: 'xx0212' },
          { left: '{c:E7}', right: '020100' },
        ],
        explain: '{c:A7} x02020, {c:D7} xx0212, {c:E7} 020100.',
      },
    },
  ],
};

const quickChangeAndTurnaround: Lesson = {
  id: 'quick-change-and-turnaround',
  title: 'Quick change and turnaround',
  teaches: 'Two common variations: the quick change (four chord in bar 2) and the turnaround (five chord in bar 12).',
  minutes: 3,
  skill: `theory:${U}:quick-change-and-turnaround`,
  steps: [
    {
      type: 'card',
      title: 'Two common changes',
      body: 'The {t:quick-change|quick change} goes to {r:IV} in bar 2 and back to {r:I} in bar 3. The {t:turnaround} puts {r:V} in bar 12, which pulls the song back to bar 1. In {n:E}, with both:\n| {c:E7} | {c:A7} | {c:E7} | {c:E7} |\n| {c:A7} | {c:A7} | {c:E7} | {c:E7} |\n| {c:B7} | {c:A7} | {c:E7} | {c:B7} |',
      figure: { kind: 'chord', symbol: 'B7', frets: 'x21202', caption: 'Open {c:B7}, the {r:V7} of {n:E}: x21202.' },
    },
    {
      type: 'choice',
      prompt: 'In a quick-change blues, where does the music first go to {r:IV}?',
      options: [
        { text: 'Bar 2', correct: true },
        { text: 'Bar 3', why: 'Bar 3 is already back on {r:I}.' },
        { text: 'Bar 5', why: 'That is where the basic 12-bar first goes to {r:IV}. The quick change gets there three bars early.' },
        { text: 'Bar 9', why: 'Bar 9 holds {r:V}.' },
      ],
      shuffle: false,
      explain: 'The quick change moves to {r:IV} in bar 2, back to {r:I} in bar 3, then carries on as usual, with {r:IV} again in bars 5 and 6.',
      fact: 'blues-quick-change',
    },
    {
      type: 'order',
      prompt: 'Put bars 9 to 12 of a blues in {n:E} with a turnaround in order.',
      tiles: ['{c:B7}', '{c:A7}', '{c:E7}', '{c:B7}'],
      explain: 'Bars 9 to 12 are {r:V7} {r:IV7} {r:I7} {r:V7}: {c:B7} {c:A7} {c:E7} {c:B7}. The last {c:B7} is the turnaround: it leads back to {c:E7} in bar 1.',
      fact: 'blues-turnaround',
    },
    {
      type: 'card',
      title: 'Hear both changes',
      body: 'Listen for the early move in bar 2, and for the {c:B7} at the very end, which makes bar 1 feel like a fresh start. Then strum along: four strums a bar.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: [...QUICK_CHANGE_E, 'E7'], beats: 4, tempo: 120 }, label: 'Both changes, in E' },
    },
    {
      type: 'play-chord',
      prompt: 'Bar 12 holds the turnaround chord. Strum {c:B7} (x21202) and let it ring.',
      chord: 'B7',
      frets: 'x21202',
      explain: '{c:B7} is {n:B} {n:D#} {n:F#} {n:A}: the {r:V7} of {n:E}. Its {n:D#} leans up to {n:E}, which is why it pulls the form back to bar 1.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'B7',
        frets: 'x21202',
        accept: 'any-voicing',
        prompt: 'Build {c:B7}, the turnaround chord in {n:E}.',
        hint: 'String 6 is not played; string 2 rings open.',
        explain: 'Open {c:B7} is x21202: {n:B} {n:D#} {n:A} {n:B} {n:F#} from string 5 to string 1.',
      },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the 12 bars with both the quick change and the turnaround.',
      text: '{r:I} ___ {r:I} {r:I} | {r:IV} {r:IV} {r:I} {r:I} | {r:V} {r:IV} {r:I} ___',
      blanks: ['{r:IV}', '{r:V}'],
      bank: ['{r:I}', '{r:ii}'],
      explain: 'The quick change puts {r:IV} in bar 2 and the turnaround puts {r:V} in bar 12. The rest is the basic 12-bar.',
      fact: 'blues-both-changes',
    },
    {
      type: 'true-false',
      statement: 'A turnaround is a passage at the end of a form that leads back to its start.',
      answer: true,
      explain: 'The simplest blues turnaround is {r:V} in bar 12: it leaves the form open, so bar 1 arrives as a new beginning.',
      fact: 'blues-turnaround',
    },
    { generate: 'roman-chord', params: { direction: 'to-roman', numerals: ['I', 'IV', 'V'], modes: ['major'], maxAccidentals: 4 } },
  ],
  facts: [
    {
      id: 'blues-quick-change',
      front: 'What is the quick change in a 12-bar blues?',
      back: 'It moves to {r:IV} in bar 2 and back to {r:I} in bar 3.',
      ask: {
        type: 'choice',
        prompt: 'In a quick-change blues, where does the music first go to {r:IV}?',
        options: [{ text: 'Bar 2', correct: true }, { text: 'Bar 3' }, { text: 'Bar 5' }, { text: 'Bar 9' }],
        shuffle: false,
        explain: 'The quick change goes to {r:IV} in bar 2 and back to {r:I} in bar 3.',
      },
    },
    {
      id: 'blues-turnaround',
      front: 'What is a turnaround, and the simplest one in a blues?',
      back: 'A passage at the end of a form that leads back to the start. The simplest blues turnaround plays {r:V} in bar 12.',
      ask: {
        type: 'choice',
        prompt: 'A blues in {n:E} has a turnaround. Which chord is in bar 12?',
        options: [{ text: '{c:B7}', correct: true }, { text: '{c:E7}' }, { text: '{c:A7}' }],
        explain: 'The simplest turnaround plays {r:V7} in bar 12: {c:B7} in {n:E}.',
      },
    },
    {
      id: 'blues-both-changes',
      front: 'Write the 12 bars with the quick change and the turnaround.',
      back: '{r:I} {r:IV} {r:I} {r:I} | {r:IV} {r:IV} {r:I} {r:I} | {r:V} {r:IV} {r:I} {r:V}',
      ask: {
        type: 'fill-blanks',
        prompt: 'Complete the 12 bars with both the quick change and the turnaround.',
        text: '{r:I} ___ {r:I} {r:I} | {r:IV} {r:IV} {r:I} {r:I} | {r:V} {r:IV} {r:I} ___',
        blanks: ['{r:IV}', '{r:V}'],
        bank: ['{r:I}', '{r:vi}'],
        explain: '{r:IV} in bar 2 for the quick change, {r:V} in bar 12 for the turnaround.',
      },
    },
  ],
};

const whichPentatonicOverABlues: Lesson = {
  id: 'which-pentatonic-over-a-blues',
  title: 'Minor or major pentatonic over a blues',
  teaches: 'Over a dominant blues, minor pentatonic on the tonic sounds gritty, major pentatonic sweet; players mix them.',
  minutes: 3,
  skill: `theory:${U}:which-pentatonic-over-a-blues`,
  steps: [
    {
      type: 'card',
      title: 'The gritty side',
      body: 'Over a dominant blues in {n:A}, two scales on the tonic work. **{n:A} minor pentatonic** is the gritty one: its {n:C}, the {d:b3}, rubs against the {n:C#} in {c:A7}. That clash is not a mistake. It is the sound of the blues.',
      figure: { kind: 'fretboard', frets: [4, 9], root: 'A', labels: 'degree', dots: boxDots(A_MINOR_BOX), caption: '{n:A} minor pentatonic, box 1 at fret 5: its {d:b3} is {n:C}.' },
    },
    {
      type: 'choice',
      prompt: 'Over {c:A7}, which note of {n:A} minor pentatonic rubs against the chord\'s {n:C#}?',
      options: [
        { text: '{n:C}, the {d:b3}', correct: true },
        { text: '{n:E}, the {d:5}', why: '{n:E} is in {c:A7} itself, so it fits.' },
        { text: '{n:G}, the {d:b7}', why: '{n:G} is the {d:b7} of {c:A7}: also in the chord.' },
        { text: '{n:D}, the {d:4}', why: '{n:D} is a passing note here, but the famous clash is the {d:b3} against the {d:3}.' },
      ],
      explain: '{c:A7} has the major 3rd, {n:C#}. Minor pentatonic brings the minor 3rd, {n:C}, a half step below it: the bluesy clash.',
      fact: 'blues-minor-over-dominant',
    },
    {
      type: 'card',
      title: 'The sweet side',
      body: '**{n:A} major pentatonic**, {n:A} {n:B} {n:C#} {n:E} {n:F#}, holds the chord\'s own {n:C#}, so it sounds sweeter and more country. Its box 1 has the root on string 6 at fret 5 and spans frets 4 to 7, one fret lower than the minor box.',
      figure: { kind: 'fretboard', frets: [3, 8], root: 'A', labels: 'degree', dots: boxDots(A_MAJOR_BOX), caption: '{n:A} major pentatonic, box 1: its {d:3} is {n:C#}, the chord\'s own 3rd.' },
    },
    {
      type: 'listen-choice',
      prompt: '{c:A7} is picked, then a phrase. Is the phrase from minor pentatonic or major pentatonic?',
      sound: OVER_A7(GRITTY_PHRASE),
      options: [{ text: 'Minor pentatonic', correct: true }, { text: 'Major pentatonic' }],
      shuffle: false,
      explain: 'It ended on {n:C}, the {d:b3}, right after the chord\'s {n:C#}: the gritty minor pentatonic sound.',
    },
    {
      type: 'listen-choice',
      prompt: 'And this one, after the same {c:A7}: minor pentatonic or major pentatonic?',
      sound: OVER_A7(SWEET_PHRASE),
      options: [{ text: 'Minor pentatonic' }, { text: 'Major pentatonic', correct: true }],
      shuffle: false,
      explain: 'It used {n:F#} and {n:B} and ended on {n:C#}, the chord\'s own 3rd: the sweet major pentatonic sound.',
    },
    {
      type: 'play-phrase',
      prompt: 'Over {c:A7}, play the gritty phrase ending on {n:C}, then the sweet one ending on {n:C#}.',
      notes: [...GRITTY_PHRASE, ...SWEET_PHRASE],
      octave: 'exact',
      tempo: 70,
      explain: 'First {n:E} {n:G} {n:E} {n:D} {n:C} from the minor box, then {n:E} {n:F#} {n:E} {n:B} {n:C#} from the major box. Once the {n:C} has rung, try curling it a {t:quarter-tone|quarter tone} sharp: the classic blues in-between.',
      alternative: {
        type: 'choice',
        prompt: 'Your gritty phrase ends on {n:C}. Which note would end it sweet instead, on the 3rd of {c:A7}?',
        options: [
          { text: '{n:C#}', correct: true },
          { text: '{n:D}', why: '{n:D} is the {d:4}: not in {c:A7}, so it sounds unfinished.' },
          { text: '{n:B}', why: '{n:B} is the {d:2}: sweet, but not the 3rd of the chord.' },
        ],
        explain: '{c:A7} is {n:A} {n:C#} {n:E} {n:G}. Ending on {n:C#}, the chord\'s 3rd, is the sweet major pentatonic sound.',
      },
    },
    {
      type: 'true-false',
      statement: 'Minor pentatonic over a major-key blues sounds wrong and is avoided.',
      answer: false,
      explain: 'It is the most used blues sound of all. The {d:b3} against the chord\'s {d:3} is the bluesy clash, and players lean into it, often curling the {d:b3} a little sharp.',
      fact: 'blues-minor-over-dominant',
    },
    {
      type: 'choice',
      prompt: 'Which scale sounds sweeter and more country over a blues in {n:A}?',
      options: [
        { text: '{n:A} major pentatonic', correct: true },
        { text: '{n:A} minor pentatonic', why: 'That is the gritty one: its {n:C} rubs against the chord\'s {n:C#}.' },
        { text: '{n:C} major pentatonic', why: 'It has the same notes as {n:A} minor pentatonic, so over {c:A7} it sounds gritty too.' },
      ],
      explain: '{n:A} major pentatonic holds {n:C#}, the 3rd of {c:A7}, and leaves out {n:C}: no clash, a sweeter sound.',
      fact: 'blues-major-over-dominant',
    },
    {
      type: 'true-false',
      statement: 'Blues guitarists often mix minor and major pentatonic in the same phrase.',
      answer: true,
      explain: 'Many phrases start in one box and finish in the other, often rising from {n:C} to {n:C#} on the way: gritty and sweet in one line.',
      fact: 'blues-mix-both',
    },
    { generate: 'scale-ear', params: { scales: ['minor-pentatonic', 'major-pentatonic'] } },
  ],
  facts: [
    {
      id: 'blues-minor-over-dominant',
      front: 'Over a dominant blues in A, what does A minor pentatonic give you?',
      back: 'The classic bluesy clash: its {n:C}, the {d:b3}, against the chord\'s {n:C#}, the {d:3}.',
      ask: {
        type: 'choice',
        prompt: 'Over {c:A7}, which note of {n:A} minor pentatonic rubs against the chord\'s {n:C#}?',
        options: [{ text: '{n:C}, the {d:b3}', correct: true }, { text: '{n:E}, the {d:5}' }, { text: '{n:G}, the {d:b7}' }],
        explain: 'The {d:b3}, {n:C}, a half step below the chord\'s 3rd: the bluesy clash.',
      },
    },
    { id: 'blues-major-over-dominant', front: 'How does A major pentatonic sound over a blues in A?', back: 'Sweeter and more country: it holds the chord\'s own 3rd, {n:C#}.' },
    {
      id: 'blues-mix-both',
      front: 'Do blues players choose minor or major pentatonic?',
      back: 'Often both: they mix minor and major pentatonic in the same phrase.',
      ask: {
        type: 'true-false',
        statement: 'Blues guitarists often mix minor and major pentatonic in the same phrase.',
        answer: true,
        explain: 'Gritty and sweet in one line is a classic blues sound.',
      },
    },
  ],
};

const theMinorBlues: Lesson = {
  id: 'the-minor-blues',
  title: 'The minor blues',
  teaches: 'A minor blues keeps the 12 bars with minor one and four chords, and the tonic\'s blues scale fits it closely.',
  minutes: 3,
  skill: `theory:${U}:the-minor-blues`,
  steps: [
    {
      type: 'card',
      title: 'The same 12 bars, in minor',
      body: 'A {t:minor-blues|minor blues} keeps the 12-bar form but makes {r:i} and {r:iv} minor. In {n:A}: {c:Am7}, {c:Dm7} and {c:E7}, the major {r:V} from {t:harmonic-minor|harmonic minor}. Plain {c:Am}, {c:Dm} or {c:Em7} work too.\n| {c:Am7} | {c:Am7} | {c:Am7} | {c:Am7} |\n| {c:Dm7} | {c:Dm7} | {c:Am7} | {c:Am7} |\n| {c:E7} | {c:Dm7} | {c:Am7} | {c:Am7} |',
      figure: { kind: 'chord', symbol: 'Am7', frets: 'x02010', caption: 'Open {c:Am7}, the {r:i} chord: x02010.' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the minor blues in {n:A}: which chord fills bars 5 and 6?',
      text: '{c:Am7} {c:Am7} {c:Am7} {c:Am7} | ___ ___ {c:Am7} {c:Am7} | {c:E7} {c:Dm7} {c:Am7} {c:Am7}',
      blanks: ['{c:Dm7}', '{c:Dm7}'],
      bank: ['{c:D7}', '{c:E7}'],
      explain: 'Bars 5 and 6 are {r:iv}: {c:Dm7}, or plain {c:Dm}. {c:D7} would turn it back into a dominant blues.',
      fact: 'blues-minor-blues-form',
    },
    {
      type: 'card',
      title: 'The other two shapes',
      body: '{c:Dm7} is xx0211 and {c:E7} is 020100. Keep {c:E7} a dominant seventh: its {n:G#} leads up to {n:A} and pulls the form home. For a darker, softer turn, play {c:Em7} (020000) instead.',
      figure: { kind: 'chord', symbol: 'Dm7', frets: 'xx0211', caption: 'Open {c:Dm7}, the {r:iv} chord: xx0211.' },
    },
    {
      type: 'listen-choice',
      prompt: 'Listen to this 12-bar. Is it a dominant blues or a minor blues?',
      sound: { kind: 'progression', chords: MINOR_BLUES_A, beats: 2, tempo: 150 },
      options: [{ text: 'A dominant blues' }, { text: 'A minor blues', correct: true }],
      shuffle: false,
      explain: 'It was {c:Am7} and {c:Dm7} on {r:i} and {r:iv}, with {c:E7} in bar 9: the minor blues. A dominant blues would have {c:A7} and {c:D7}.',
    },
    {
      type: 'play-chord',
      prompt: 'Bars 5 and 6 are {r:iv}. Strum {c:Dm7} (xx0211) and let it ring.',
      chord: 'Dm7',
      frets: 'xx0211',
      explain: '{c:Dm7} is {n:D} {n:F} {n:A} {n:C}. Play the whole minor blues once through: four bars of {c:Am7}, two of {c:Dm7}, two of {c:Am7}, then {c:E7} {c:Dm7} {c:Am7} {c:Am7}.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'Dm7',
        frets: 'xx0211',
        accept: 'any-voicing',
        prompt: 'Build {c:Dm7}, the {r:iv} chord of the minor blues in {n:A}.',
        hint: 'Strings 6 and 5 are not played. One finger can lie across strings 2 and 1 at fret 1.',
        explain: 'Open {c:Dm7} is xx0211: open {n:D}, then {n:A}, {n:C} and {n:F}.',
      },
    },
    {
      type: 'true-false',
      statement: 'The {n:A} blues scale fits {c:Am7} and {c:Dm7} without the major-minor clash of a dominant blues.',
      answer: true,
      explain: 'Neither chord has a major 3rd for the scale\'s {n:C} to rub against: {c:Am7} holds that very {n:C}, and {c:Dm7} is {n:D} {n:F} {n:A} {n:C}.',
      fact: 'blues-minor-blues-scale',
    },
    {
      type: 'choice',
      prompt: 'Which chords make a minor blues in {n:A}?',
      options: [
        { text: '{c:Am7}, {c:Dm7}, {c:E7}', correct: true },
        { text: '{c:A7}, {c:D7}, {c:E7}', why: 'That is the dominant blues in {n:A}.' },
        { text: '{c:Am7}, {c:D7}, {c:E7}', why: '{c:D7} has {n:F#}, a major 3rd: the {r:iv} chord of a minor blues is minor.' },
      ],
      explain: 'Minor chords on {r:i} and {r:iv}, {c:Am7} and {c:Dm7}, and usually a dominant {c:E7} on {r:V}.',
      fact: 'blues-minor-blues-chords',
    },
    {
      type: 'choice',
      prompt: 'In the minor blues in {n:A}, which chord is in bar 9?',
      options: [
        { text: '{c:E7}', correct: true },
        { text: '{c:Dm7}', why: '{c:Dm7} is in bars 5, 6 and 10.' },
        { text: '{c:Am7}', why: '{c:Am7} comes back in bar 11.' },
      ],
      explain: 'Bar 9 is {r:V}, as in every 12-bar: {c:E7} in {n:A} minor.',
    },
    { generate: 'chord-quality-ear', params: { types: ['m7', '7'] } },
  ],
  facts: [
    {
      id: 'blues-minor-blues-form',
      front: 'What is a minor blues?',
      back: 'The 12-bar form with minor chords on {r:i} and {r:iv}.',
      ask: {
        type: 'fill-blanks',
        prompt: 'Complete the minor blues in {n:A}: which chord fills bars 5 and 6?',
        text: '{c:Am7} {c:Am7} {c:Am7} {c:Am7} | ___ ___ {c:Am7} {c:Am7} | {c:E7} {c:Dm7} {c:Am7} {c:Am7}',
        blanks: ['{c:Dm7}', '{c:Dm7}'],
        bank: ['{c:D7}', '{c:E7}'],
        explain: 'Bars 5 and 6 are {r:iv}, a minor chord: {c:Dm7}.',
      },
    },
    {
      id: 'blues-minor-blues-chords',
      front: 'Which chords make a minor blues in A?',
      back: '{c:Am} (or {c:Am7}), {c:Dm} (or {c:Dm7}) and {c:E7} (or {c:Em7}).',
      ask: {
        type: 'choice',
        prompt: 'Which chords make a minor blues in {n:A}?',
        options: [{ text: '{c:Am7}, {c:Dm7}, {c:E7}', correct: true }, { text: '{c:A7}, {c:D7}, {c:E7}' }, { text: '{c:Am7}, {c:D7}, {c:E7}' }],
        explain: 'Minor {r:i} and {r:iv}, and usually {c:E7} on {r:V}.',
      },
    },
    {
      id: 'blues-minor-blues-scale',
      front: 'Why does the blues scale of the tonic fit a minor blues so well?',
      back: 'Its {d:b3} matches the minor {r:i} and {r:iv} chords, so there is no major-minor clash.',
    },
  ],
};

/** Unit 21 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'The blues',
  theme: 'harmony',
  description: 'The blues scales, the 12-bar form, dominant seventh chords, common variations, and which scale to use over which chord.',
  lessons: [theBluesScale, theMajorBluesScale, theTwelveBarForm, dominantSevenths, quickChangeAndTurnaround, whichPentatonicOverABlues, theMinorBlues],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      {
        type: 'choice',
        prompt: 'Which note turns the minor pentatonic into the blues scale?',
        options: [{ text: 'The {d:b5}', correct: true }, { text: 'The {d:2}' }, { text: 'The {d:3}' }, { text: 'The {d:6}' }],
        explain: 'The blues scale is {d:1} {d:b3} {d:4} {d:b5} {d:5} {d:b7}.',
      },
      {
        type: 'type-answer',
        prompt: 'Type the blue note of the {n:A} blues scale: its {d:b5}.',
        answer: { kind: 'note', value: 'Eb', spelling: 'exact' },
        input: 'keypad',
        explain: '{n:A} blues is {n:A} {n:C} {n:D} {n:Eb} {n:E} {n:G}. Its {d:b5} is {n:Eb}, a half step below {n:E}.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Complete the {n:A} major blues scale.',
        text: '{n:A}  {n:B}  ___  {n:C#}  {n:E}  {n:F#}',
        blanks: ['{n:C}'],
        bank: ['{n:D}', '{n:G}'],
        explain: 'Major pentatonic plus the {d:b3}: {n:A} {n:B} {n:C} {n:C#} {n:E} {n:F#}.',
      },
      {
        type: 'order',
        prompt: 'Put bars 5 to 12 of the basic 12-bar blues in order.',
        tiles: ['{r:IV}', '{r:IV}', '{r:I}', '{r:I}', '{r:V}', '{r:IV}', '{r:I}', '{r:I}'],
        explain: 'After four bars of {r:I}: {r:IV} {r:IV} {r:I} {r:I} | {r:V} {r:IV} {r:I} {r:I}.',
      },
      {
        type: 'match-pairs',
        prompt: 'Match each key with the three chords of its 12-bar blues.',
        pairs: [
          { left: 'Blues in {n:A}', right: '{c:A}, {c:D}, {c:E}' },
          { left: 'Blues in {n:E}', right: '{c:E}, {c:A}, {c:B}' },
          { left: 'Blues in {n:G}', right: '{c:G}, {c:C}, {c:D}' },
        ],
        explain: '{r:I}, {r:IV} and {r:V} of each key.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Complete the formula of a dominant seventh chord.',
        text: '{d:1}  {d:3}  {d:5}  ___',
        blanks: ['{d:b7}'],
        bank: ['{d:7}', '{d:6}'],
        explain: 'A major triad plus a minor 7th: {d:1} {d:3} {d:5} {d:b7}. With a {d:7} it would be a major seventh chord.',
      },
      {
        type: 'chord-build',
        task: 'fingers',
        chord: 'A7',
        frets: 'x02020',
        accept: 'any-voicing',
        prompt: 'Build {c:A7} on the fretboard.',
        explain: 'Open {c:A7} is x02020: open {c:A} with string 3 left open for the {d:b7}, {n:G}.',
      },
      {
        type: 'true-false',
        statement: 'In a blues in {n:A}, the {n:C} of {c:D7} is outside the key of {k:A major}.',
        answer: true,
        explain: '{k:A major} has {n:C#}. The blues uses the flat 7 anyway: that is its sound.',
      },
      {
        type: 'choice',
        prompt: 'In a quick-change blues, where does the music first go to {r:IV}?',
        options: [{ text: 'Bar 2', correct: true }, { text: 'Bar 3' }, { text: 'Bar 5' }, { text: 'Bar 9' }],
        shuffle: false,
        explain: 'The quick change goes to {r:IV} in bar 2 and back to {r:I} in bar 3.',
      },
      {
        type: 'choice',
        prompt: 'A blues in {n:E} has a turnaround. Which chord is in bar 12?',
        options: [{ text: '{c:B7}', correct: true }, { text: '{c:E7}' }, { text: '{c:A7}' }],
        explain: 'The simplest turnaround plays {r:V7} in bar 12: {c:B7} in {n:E}.',
      },
      {
        type: 'choice',
        prompt: 'Over {c:A7}, which scale gives the gritty clash of a {d:b3} against the chord\'s {d:3}?',
        options: [{ text: '{n:A} minor pentatonic', correct: true }, { text: '{n:A} major pentatonic' }, { text: '{n:E} major pentatonic' }],
        explain: '{n:A} minor pentatonic brings {n:C}, a half step below the {n:C#} of {c:A7}.',
      },
      {
        type: 'true-false',
        statement: 'Blues guitarists often mix minor and major pentatonic in the same phrase.',
        answer: true,
        explain: 'Gritty and sweet in one line is a classic blues sound.',
      },
      {
        type: 'choice',
        prompt: 'Which chords make a minor blues in {n:A}?',
        options: [{ text: '{c:Am7}, {c:Dm7}, {c:E7}', correct: true }, { text: '{c:A7}, {c:D7}, {c:E7}' }, { text: '{c:Am7}, {c:D7}, {c:E7}' }],
        explain: 'Minor {r:i} and {r:iv}, and usually {c:E7} on {r:V}.',
      },
      { generate: 'chord-tones', params: { types: ['7'], roots: ['A', 'D', 'E', 'G', 'C', 'B'], ask: 'missing' } },
    ],
  },
};

export default unit;
