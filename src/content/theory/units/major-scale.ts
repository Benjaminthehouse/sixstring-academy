/**
 * Theory Path, unit 11: The major scale. Written from the syllabus entries in
 * `src/content/plan/theory-path.json` (unit `major-scale`), one lesson per entry, in order: each
 * lesson opens with the "on the guitar" picture, asks the planned exercises, ends with the planned
 * drills, and turns every planned fact into a review card. `major-scale.test.ts` cross-checks every
 * scale spelling, step, degree, fret, finger and phrase against the theory and guitar engines
 * (`scaleNotes`, `getScale`, `scalePatterns`, `midiAt`).
 *
 * Planned sounds that a lesson `Sound` cannot play: a scale over a drone (it plays one line at a
 * time). "Major pentatonic" therefore plays two phrases on the same five notes, one circling and
 * ending on A, one circling and ending on C, and asks which sounds major.
 */
import type { FretDot, Lesson, TabNote, Unit } from '@/lessons';

const U = 'major-scale';

const note = (string: number, fret: number, duration = 'q'): TabNote => ({ string, fret, duration });
const rest = (duration: string): TabNote => ({ rest: true, duration });
const dot = (string: number, fret: number, n: string, extra: Partial<FretDot> = {}): FretDot => ({ string, fret, note: n, ...extra });

/** One string, a run of frets, in quarter notes with a held last note. */
const run = (string: number, frets: readonly number[]): TabNote[] => frets.map((f, i) => note(string, f, i === frets.length - 1 ? 'h' : 'q'));

/** C major along string 5 and G major along string 6: W W H W W W H from the tonic. */
export const C_ON_5 = [3, 5, 7, 8, 10, 12, 14, 15] as const;
export const G_ON_6 = [3, 5, 7, 8, 10, 12, 14, 15] as const;
const C_MAJOR = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
/** C major pentatonic on string 5: [fret, note, degree]. */
export const C_PENTATONIC_ON_5: ReadonlyArray<readonly [number, string, string]> = [[3, 'C', '1'], [5, 'D', '2'], [7, 'E', '3'], [10, 'G', '5'], [12, 'A', '6']];

/** One octave of G major from string 6 fret 3, in second position: [string, fret, note, degree, finger]. */
export const G_SHAPE: ReadonlyArray<readonly [number, number, string, string, 1 | 2 | 3 | 4]> = [
  [6, 3, 'G', '1', 2], [6, 5, 'A', '2', 4],
  [5, 2, 'B', '3', 1], [5, 3, 'C', '4', 2], [5, 5, 'D', '5', 4],
  [4, 2, 'E', '6', 1], [4, 4, 'F#', '7', 3], [4, 5, 'G', '1', 4],
];
const SHAPE_UP: TabNote[] = G_SHAPE.map(([s, f], i) => note(s, f, i === G_SHAPE.length - 1 ? 'h' : 'q'));
const SHAPE_UP_DOWN: TabNote[] = [...G_SHAPE.map(([s, f]) => note(s, f)), ...G_SHAPE.slice(0, -1).reverse().map(([s, f], i, all) => note(s, f, i === all.length - 1 ? 'h' : 'q'))];

/** The same shape moved up two frets: A major from string 6 fret 5. */
export const A_SHAPE: ReadonlyArray<readonly [number, number, string, string]> = [
  [6, 5, 'A', '1'], [6, 7, 'B', '2'],
  [5, 4, 'C#', '3'], [5, 5, 'D', '4'], [5, 7, 'E', '5'],
  [4, 4, 'F#', '6'], [4, 6, 'G#', '7'], [4, 7, 'A', '1'],
];

/** A minor pentatonic, box 1 at fret 5: [string, fret, note]. */
const BOX1: ReadonlyArray<readonly [number, number, string]> = [
  [6, 5, 'A'], [6, 8, 'C'], [5, 5, 'D'], [5, 7, 'E'], [4, 5, 'G'], [4, 7, 'A'],
  [3, 5, 'C'], [3, 7, 'D'], [2, 5, 'E'], [2, 8, 'G'], [1, 5, 'A'], [1, 8, 'C'],
];

/** Original phrases in the G major shape: one stops on the leading tone, one goes home. */
export const PHRASE_HANGING: TabNote[] = [note(4, 5), note(4, 2), note(5, 5), note(4, 2), note(4, 4, 'h')];
/** Two original phrases on the notes C D E G A: the first leans on A, the second on C. */
export const PHRASE_ON_A: TabNote[] = [note(5, 0), note(5, 3), note(5, 7), note(5, 5), note(5, 3), note(5, 0, 'h')];
export const PHRASE_ON_C: TabNote[] = [note(5, 3), note(5, 7), note(5, 10), note(5, 7), note(5, 5), note(5, 3, 'h')];

// ── 1. Whole, whole, half ─────────────────────────────────────────────────────────────────────

const theStepPattern: Lesson = {
  id: 'the-step-pattern',
  title: 'Whole, whole, half',
  teaches: 'The major scale follows the step pattern whole, whole, half, whole, whole, whole, half.',
  minutes: 3,
  skill: `theory:${U}:the-step-pattern`,
  steps: [
    {
      type: 'card',
      title: 'A recipe of steps',
      body: 'The {t:major-scale|major scale} is built from a recipe of {t:whole-step|whole steps} (W, two frets) and half steps (H, one fret): **W W H W W W H**. Start on {n:C} at string 5, fret 3, and follow the recipe up the string: frets 3, 5, 7, 8, 10, 12, 14 and 15.',
      figure: { kind: 'fretboard', frets: [3, 15], strings: [5], derive: { scale: 'major', tonic: 'C' }, caption: '{n:C} major on string 5. The steps between dots: W W H W W W H.' },
    },
    {
      type: 'fill-blanks',
      prompt: "Complete the major scale's step pattern.",
      text: 'W  W  ___  W  W  W  ___',
      blanks: ['H', 'H'],
      bank: ['W'],
      explain: 'Whole, whole, half, whole, whole, whole, half: W W H W W W H. The half steps come after the 3rd note and after the 7th.',
      fact: 'major-scale-pattern',
    },
    {
      type: 'choice',
      prompt: 'Between which two notes of the major scale is the first half step?',
      options: [
        { text: 'Notes 2 and 3', why: 'The second step is a W: notes 2 and 3 are two frets apart.' },
        { text: 'Notes 3 and 4', correct: true },
        { text: 'Notes 4 and 5', why: 'The fourth step is a W.' },
        { text: 'Notes 7 and 8', why: 'That is the second half step, at the top of the scale.' },
      ],
      shuffle: false,
      explain: 'W W H: after two whole steps comes the first half step, between notes 3 and 4. In {n:C} major that is {n:E} to {n:F}.',
      fact: 'major-scale-c-half-steps',
    },
    {
      type: 'card',
      title: 'No sharps, no flats',
      body: 'In {n:C} major the half steps land on {n:E} to {n:F} and {n:B} to {n:C}: the two pairs of natural notes with nothing between them. So {n:C} major uses only natural notes: C D E F G A B C.',
      figure: { kind: 'audio', sound: { kind: 'scale', tonic: 'C3', scale: 'major', direction: 'up', tempo: 100 }, label: 'Hear {n:C} major' },
    },
    {
      type: 'true-false',
      statement: '{n:C} major uses only natural notes, with no sharps or flats.',
      answer: true,
      explain: 'Its half steps fall on {n:E} to {n:F} and {n:B} to {n:C}, exactly where the natural notes are already a half step apart.',
      fact: 'major-scale-c-naturals',
    },
    {
      type: 'play-phrase',
      prompt: 'Play {n:C} major up string 5: frets 3, 5, 7, 8, 10, 12, 14, 15.',
      notes: run(5, C_ON_5),
      octave: 'exact',
      tempo: 70,
      explain: 'Two frets for each W, one for each H: 3, 5, 7, 8, 10, 12, 14, 15. Slide your hand along the string as you climb.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap every note of {n:C} major on string 5, from fret 3 to fret 15.',
        find: { scale: 'major', tonic: 'C' },
        mode: 'all',
        octave: 'any',
        frets: [3, 15],
        strings: [5],
        explain: 'W W H W W W H from fret 3: frets 3, 5, 7, 8, 10, 12, 14 and 15.',
      },
    },
    {
      type: 'choice',
      prompt: 'You are on {n:E}, string 5 fret 7, climbing {n:C} major. The next step is a half step. Which fret comes next?',
      options: [
        { text: 'Fret 8', correct: true },
        { text: 'Fret 9', why: 'Fret 9 is a whole step up: {n:F#}, which is not in {n:C} major.' },
        { text: 'Fret 10', why: 'That skips {n:F}: fret 10 is {n:G}.' },
      ],
      shuffle: false,
      explain: 'A half step is one fret: fret 8, {n:F}. Notes 3 and 4 of a major scale are always a half step apart.',
      fact: 'major-scale-c-half-steps',
    },
    { generate: 'scale-formula', params: { scales: ['major'] } },
  ],
  facts: [
    {
      id: 'major-scale-pattern',
      front: 'What is the step pattern of the major scale?',
      back: 'W W H W W W H: whole, whole, half, whole, whole, whole, half.',
      ask: { generate: 'scale-formula', params: { scales: ['major'] } },
    },
    {
      id: 'major-scale-c-naturals',
      front: 'Which notes are in {n:C} major?',
      back: 'Only the natural notes: C D E F G A B C.',
      ask: { generate: 'scale-notes', params: { scales: ['major'], tonics: ['C'], form: 'order' } },
    },
    {
      id: 'major-scale-c-half-steps',
      front: 'Where are the half steps in {n:C} major?',
      back: '{n:E} to {n:F} and {n:B} to {n:C}: between scale notes 3 and 4, and 7 and 8.',
    },
  ],
};

// ── 2. Scale degrees ──────────────────────────────────────────────────────────────────────────

const scaleDegrees: Lesson = {
  id: 'scale-degrees',
  title: 'Scale degrees',
  teaches: 'The notes of a scale are numbered 1 to 7 from the tonic; these numbers are its degrees.',
  minutes: 3,
  skill: `theory:${U}:scale-degrees`,
  steps: [
    {
      type: 'card',
      title: 'Numbers for the notes',
      body: 'Number the notes of a scale from its {t:tonic}: in {n:C} major, {n:C} is 1, {n:D} 2, {n:E} 3, and so on up to {n:B}, 7. These numbers are the scale {t:degree|degrees}. The next {n:C}, at fret 15, is the tonic again an octave higher, so it is 1 again, not 8.',
      figure: {
        kind: 'fretboard',
        frets: [3, 15],
        root: 'C',
        labels: 'degree',
        dots: C_ON_5.map((f, i) => dot(5, f, C_MAJOR[i % 7], { degree: String((i % 7) + 1), ...(i % 7 === 0 ? { role: 'root' as const, label: '1' } : {}) })),
        caption: '{n:C} major on string 5, each dot labelled with its degree.',
      },
    },
    {
      type: 'choice',
      prompt: 'Which note is degree 5 of {n:C} major?',
      options: [
        { text: '{n:E}', why: '{n:E} is degree 3.' },
        { text: '{n:F}', why: '{n:F} is degree 4.' },
        { text: '{n:G}', correct: true },
        { text: '{n:A}', why: '{n:A} is degree 6.' },
      ],
      shuffle: false,
      explain: 'Count from the tonic: {n:C} 1, {n:D} 2, {n:E} 3, {n:F} 4, **{n:G} 5**.',
      fact: 'major-scale-degrees-meaning',
    },
    {
      type: 'true-false',
      statement: 'The {n:C} one octave above the tonic of {n:C} major is called degree 1 again.',
      answer: true,
      explain: 'Degrees run from 1 to 7. The eighth note is the tonic again, an octave higher, so it is 1 again.',
      fact: 'major-scale-degree-eight',
    },
    {
      type: 'card',
      title: 'Do re mi',
      body: 'Singers give the degrees of the major scale syllables, called {t:solfege}: **do re mi fa sol la ti**, and **do** again at the octave. Do is always the tonic: in {n:C} major do is {n:C}, in {n:G} major it is {n:G}. Sing along as {n:C} major plays.',
      figure: { kind: 'audio', sound: { kind: 'scale', tonic: 'C3', scale: 'major', direction: 'up', tempo: 80 }, label: 'Do re mi, up to do' },
      tip: 'Some countries use do re mi as fixed names for the notes, with do always {n:C}. Here they name degrees, so do moves with the key.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each degree with its syllable.',
      pairs: [
        { left: 'Degree 1', right: 'do' },
        { left: 'Degree 3', right: 'mi' },
        { left: 'Degree 5', right: 'sol' },
        { left: 'Degree 7', right: 'ti' },
      ],
      explain: 'do re mi fa sol la ti: degree 1 is do, 3 is mi, 5 is sol and 7 is ti.',
      fact: 'major-scale-solfege',
    },
    {
      type: 'fretboard-name',
      prompt: 'The root (R) is {n:C}, string 5 fret 3. Which degree of {n:C} major is the other dot?',
      position: { string: 5, fret: 12 },
      root: { string: 5, fret: 3 },
      ask: 'degree',
      spelling: 'any',
      options: ['6', '5', '7', '4'],
      explain: 'Fret 12 is {n:A}: C D E F G A, the 6th note of {n:C} major.',
      fact: 'major-scale-degrees-meaning',
    },
    {
      type: 'choice',
      prompt: 'In {n:C} major, which degree is {n:F}?',
      options: [{ text: 'Degree 3' }, { text: 'Degree 4', correct: true }, { text: 'Degree 5' }, { text: 'Degree 6' }],
      shuffle: false,
      explain: 'C D E F: {n:F} is the 4th note, degree 4 (fa).',
    },
    { generate: 'degree-in-key', params: { ask: 'note', maxAccidentals: 0 } },
    { generate: 'degree-in-key', params: { ask: 'degree', maxAccidentals: 0 } },
  ],
  facts: [
    {
      id: 'major-scale-degrees-meaning',
      front: 'What are scale degrees?',
      back: 'The numbers 1 to 7 given to the notes of a scale, counted from the tonic.',
      ask: { generate: 'degree-in-key', params: { ask: 'note', maxAccidentals: 0 } },
    },
    {
      id: 'major-scale-degree-eight',
      front: 'What is the 8th note of a major scale called?',
      back: 'The tonic again, an octave higher, so it is degree 1 again.',
    },
    {
      id: 'major-scale-solfege',
      front: 'Which syllables do singers give the degrees of the major scale?',
      back: 'do re mi fa sol la ti, then do again at the octave.',
    },
  ],
};

// ── 3. G major and its F sharp ────────────────────────────────────────────────────────────────

const gMajor: Lesson = {
  id: 'g-major',
  title: 'G major and its F sharp',
  teaches: 'Starting the step pattern on G needs one sharp, F sharp, so the half step falls between degrees 7 and 8.',
  minutes: 3,
  skill: `theory:${U}:g-major`,
  steps: [
    {
      type: 'card',
      title: 'Start on G',
      body: 'Follow W W H W W W H from {n:G}, string 6 fret 3: frets 3, 5, 7, 8, 10, 12, 14 and 15. That gives {n:G} {n:A} {n:B} {n:C} {n:D} {n:E}, then fret 14: not {n:F} but {n:F#}, one sharp. Then {n:G} again.',
      figure: {
        kind: 'fretboard',
        frets: [3, 15],
        dots: G_ON_6.map((f, i) => dot(6, f, ['G', 'A', 'B', 'C', 'D', 'E', 'F#', 'G'][i], i === 6 ? { role: 'target' } : i === 0 || i === 7 ? { role: 'root' } : {})),
        caption: '{n:G} major on string 6. Fret 14 is {n:F#}.',
      },
    },
    {
      type: 'card',
      title: 'Why F sharp?',
      body: 'From {n:E}, degree 6, the pattern needs a whole step: two frets up, {n:F#}. A plain {n:F} would be only a half step above {n:E}, and leave a whole step at the top. With {n:F#}, degrees 7 to 8 are the half step the pattern ends with.',
      figure: { kind: 'audio', sound: { kind: 'scale', tonic: 'G2', scale: 'major', direction: 'up', tempo: 100 }, label: 'Hear {n:G} major' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete {n:G} major.',
      text: '{n:G}  {n:A}  {n:B}  {n:C}  {n:D}  {n:E}  ___  {n:G}',
      blanks: ['{n:F#}'],
      bank: ['{n:F}', '{n:Gb}'],
      spelling: 'exact',
      explain: 'G A B C D E, then {n:F#}, then G: every letter once, and {n:F#} keeps the half step between degrees 7 and 8.',
      fact: 'major-scale-g-notes',
    },
    {
      type: 'choice',
      prompt: 'Degree 7 of {n:G} major sounds at fret 14 of string 6. Why is it called {n:F#} and not {n:Gb}?',
      options: [
        { text: 'Each letter is used once, and G is already taken', correct: true },
        { text: 'Sharps always sound higher than flats', why: '{n:F#} and {n:Gb} are the very same pitch: only the name differs.' },
        { text: 'Fret 14 of string 6 is always called {n:F#}', why: 'That fret has two names; the scale decides which one to use.' },
      ],
      shuffle: false,
      explain: 'A major scale uses each letter name once. {n:G} is already degree 1, so degree 7 takes the letter F: {n:F#}.',
      fact: 'major-scale-letter-once',
    },
    {
      type: 'true-false',
      statement: '{n:G} major contains the note {n:F}.',
      answer: false,
      explain: '{n:G} major has {n:F#} instead. Its one sharp keeps the last step, 7 to 8, a half step.',
      fact: 'major-scale-g-f-sharp',
    },
    {
      type: 'play-phrase',
      prompt: 'Play {n:G} major up string 6, from fret 3 to fret 15.',
      notes: run(6, G_ON_6),
      octave: 'exact',
      tempo: 70,
      explain: 'Frets 3, 5, 7, 8, 10, 12, 14, 15: the same W W H W W W H as {n:C} major on string 5. Fret 14 is the {n:F#}.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap every note of {n:G} major on string 6, from fret 3 to fret 15.',
        find: { scale: 'major', tonic: 'G' },
        mode: 'all',
        octave: 'any',
        frets: [3, 15],
        strings: [6],
        explain: 'Frets 3, 5, 7, 8, 10, 12, 14 and 15. Fret 14, {n:F#}, is the one sharp.',
      },
    },
    {
      type: 'choice',
      prompt: 'On string 6, which fret plays {n:F#}, degree 7 of {n:G} major?',
      options: [
        { text: 'Fret 13', why: 'Fret 13 is {n:F}: one half step too low.' },
        { text: 'Fret 14', correct: true },
        { text: 'Fret 15', why: 'Fret 15 is {n:G}, the tonic again.' },
      ],
      shuffle: false,
      explain: 'Fret 12 is {n:E}, degree 6. A whole step up, two frets, is fret 14: {n:F#}.',
    },
    { generate: 'scale-notes', params: { scales: ['major'], tonics: ['G', 'C'], form: 'fill' } },
    { generate: 'scale-notes', params: { scales: ['major'], tonics: ['G', 'C'], form: 'odd-one-out' } },
  ],
  facts: [
    {
      id: 'major-scale-g-notes',
      front: 'Spell the {n:G} major scale.',
      back: '{n:G} {n:A} {n:B} {n:C} {n:D} {n:E} {n:F#} {n:G}',
      ask: { generate: 'scale-notes', params: { scales: ['major'], tonics: ['G'], form: 'order' } },
    },
    {
      id: 'major-scale-g-f-sharp',
      front: 'Why does {n:G} major need {n:F#} rather than {n:F}?',
      back: 'To keep a half step between degrees 7 and 8, {n:F#} to {n:G}. With {n:F}, degrees 7 to 8 would be a whole step.',
    },
    {
      id: 'major-scale-letter-once',
      front: 'Why is the 7th note of {n:G} major called {n:F#}, not {n:Gb}?',
      back: 'A major scale uses each letter name exactly once, and {n:G} is already the tonic.',
    },
  ],
};

// ── 4. Building any major scale ───────────────────────────────────────────────────────────────

const buildingMajorScales: Lesson = {
  id: 'building-major-scales',
  title: 'Building any major scale',
  teaches: 'Write the seven letters from the tonic, then add sharps or flats until the steps follow W W H W W W H.',
  minutes: 4,
  skill: `theory:${U}:building-major-scales`,
  steps: [
    {
      type: 'card',
      title: 'Two steps to any major scale',
      body: '**1.** Write the seven letters from the tonic. **2.** Check each step against W W H W W W H, and add a sharp or a flat where a step is wrong. For {n:D}: D E F G A B C. {n:E} to {n:F} must be a whole step, so {n:F} becomes {n:F#}; {n:B} to {n:C} too, so {n:C} becomes {n:C#}.',
      figure: {
        kind: 'fretboard',
        frets: [5, 17],
        dots: [5, 7, 9, 10, 12, 14, 16, 17].map((f, i) => dot(5, f, ['D', 'E', 'F#', 'G', 'A', 'B', 'C#', 'D'][i], i === 2 || i === 6 ? { role: 'target' } : i === 0 || i === 7 ? { role: 'root' } : {})),
        caption: '{n:D} major on string 5, from fret 5. Its sharps: {n:F#} and {n:C#}.',
      },
    },
    {
      type: 'choice',
      prompt: 'Which of these is {n:D} major?',
      options: [
        { text: '{n:D} {n:E} {n:F} {n:G} {n:A} {n:B} {n:C}', why: 'With plain {n:F} and {n:C} the half steps land in the wrong places.' },
        { text: '{n:D} {n:E} {n:F#} {n:G} {n:A} {n:B} {n:C#}', correct: true },
        { text: '{n:D} {n:E} {n:Gb} {n:G} {n:A} {n:B} {n:Db}', why: 'The right pitches, the wrong names: G twice, D twice, and no F or C.' },
      ],
      shuffle: false,
      spelling: 'exact',
      explain: 'D E F G A B C, fixed to W W H W W W H: {n:F} rises to {n:F#} and {n:C} to {n:C#}. Each letter appears once.',
      fact: 'major-scale-d-notes',
    },
    {
      type: 'card',
      title: 'Flats work the same way',
      body: 'For {n:F}: F G A B C D E. Notes 3 to 4 must be a half step, but {n:A} to {n:B} is a whole step, so {n:B} drops to {n:Bb}. Why not {n:A#}? The letter A is already used. And a major scale never mixes sharps and flats: it uses one kind or the other.',
      figure: {
        kind: 'fretboard',
        frets: [8, 20],
        dots: [8, 10, 12, 13, 15, 17, 19, 20].map((f, i) => dot(5, f, ['F', 'G', 'A', 'Bb', 'C', 'D', 'E', 'F'][i], i === 3 ? { role: 'target' } : i === 0 || i === 7 ? { role: 'root' } : {})),
        caption: '{n:F} major on string 5, from fret 8. Its one flat: {n:Bb}.',
      },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete {n:F} major.',
      text: '{n:F}  {n:G}  {n:A}  ___  {n:C}  {n:D}  {n:E}  {n:F}',
      blanks: ['{n:Bb}'],
      bank: ['{n:B}', '{n:A#}'],
      spelling: 'exact',
      explain: 'F G A, then {n:Bb}, then C D E F. {n:Bb} makes notes 3 to 4 a half step, and its letter, B, is the one not used yet.',
      fact: 'major-scale-f-notes',
    },
    {
      type: 'type-answer',
      prompt: 'Spell {n:A} major and type its seventh note.',
      answer: { kind: 'note', value: 'G#', spelling: 'exact' },
      input: 'keypad',
      hint: 'Write A B C D E F G, then fix each step to fit W W H W W W H.',
      explain: '{n:A} major is {n:A} {n:B} {n:C#} {n:D} {n:E} {n:F#} {n:G#}: three sharps. Its seventh note, {n:G#}, is a half step below the tonic.',
      fact: 'major-scale-spelling-method',
    },
    {
      type: 'true-false',
      statement: 'A major scale can use sharps and flats together.',
      answer: false,
      explain: 'Each major scale uses only sharps or only flats: {n:D} major has {n:F#} and {n:C#}, {n:F} major has {n:Bb}.',
      fact: 'major-scale-no-mixing',
    },
    { generate: 'scale-notes', params: { scales: ['major'], tonics: ['C', 'G', 'D', 'F', 'A'], form: 'order' } },
    { generate: 'scale-notes', params: { scales: ['major'], tonics: ['C', 'G', 'D', 'F', 'A'], form: 'fill' } },
    { generate: 'scale-notes', params: { scales: ['major'], tonics: ['C', 'G', 'D', 'F', 'A'], form: 'odd-one-out' } },
  ],
  facts: [
    {
      id: 'major-scale-spelling-method',
      front: 'How do you spell any major scale?',
      back: 'Write the seven letters from the tonic, then add sharps or flats until the steps follow W W H W W W H.',
    },
    {
      id: 'major-scale-d-notes',
      front: 'Spell {n:D} major.',
      back: '{n:D} {n:E} {n:F#} {n:G} {n:A} {n:B} {n:C#} {n:D}: two sharps.',
      ask: { generate: 'scale-notes', params: { scales: ['major'], tonics: ['D'], form: 'order' } },
    },
    {
      id: 'major-scale-f-notes',
      front: 'Spell {n:F} major.',
      back: '{n:F} {n:G} {n:A} {n:Bb} {n:C} {n:D} {n:E} {n:F}: one flat.',
      ask: { generate: 'scale-notes', params: { scales: ['major'], tonics: ['F'], form: 'fill' } },
    },
    { id: 'major-scale-no-mixing', front: 'Can a major scale mix sharps and flats?', back: 'No. It uses sharps only or flats only.' },
  ],
};

// ── 5. The major scale in one position ────────────────────────────────────────────────────────

const oneOctaveShape: Lesson = {
  id: 'one-octave-shape',
  title: 'The major scale in one position',
  teaches: 'One octave of the major scale from a root on string 6 fits under the hand as a movable shape.',
  minutes: 4,
  skill: `theory:${U}:one-octave-shape`,
  steps: [
    {
      type: 'card',
      title: 'One octave under one hand',
      body: 'Put your hand in second {t:position}: one finger per fret, index on fret 2 up to little finger on fret 5. Start on {n:G}, string 6 fret 3, with your middle finger. Climb {n:G} {n:A} on string 6, {n:B} {n:C} {n:D} on string 5, then {n:E} {n:F#} {n:G} on string 4.',
      figure: {
        kind: 'fretboard',
        frets: [1, 6],
        labels: 'finger',
        dots: G_SHAPE.map(([s, f, n, d, finger]) => dot(s, f, n, { finger, ...(d === '1' ? { role: 'root' as const } : {}) })),
        caption: 'Finger numbers: 1 index, 2 middle, 3 ring, 4 little. The roots are {n:G}.',
      },
    },
    {
      type: 'card',
      title: 'The same shape in tab',
      body: 'As tab, low string first: string 6 frets 3 and 5, string 5 frets 2, 3 and 5, string 4 frets 2, 4 and 5. Inside it is still W W H W W W H: the strings simply take turns.',
      figure: { kind: 'tab', tempo: 80, notes: SHAPE_UP, caption: 'One octave of {n:G} major, up.' },
    },
    {
      type: 'play-phrase',
      prompt: 'Play one octave of {n:G} major from string 6 fret 3, up and back down.',
      notes: SHAPE_UP_DOWN,
      octave: 'exact',
      tempo: 70,
      explain: 'Up: 3 5, 2 3 5, 2 4 5. Then the same notes back down. Each finger stays on its own fret, so your hand never moves.',
      fact: 'major-scale-octave-shape-g',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap every note of {n:G} major on strings 6, 5 and 4, from fret 2 to fret 5.',
        find: { scale: 'major', tonic: 'G' },
        mode: 'all',
        octave: 'any',
        frets: [2, 5],
        strings: [6, 5, 4],
        explain: 'The eight notes of the shape, plus {n:F#} at string 6, fret 2: degree 7, just below the root.',
      },
    },
    {
      type: 'card',
      title: 'Move it, change the key',
      body: 'The shape uses no open strings, so it is a {t:movable-shape|movable shape}: slide it and the scale changes key. Put your middle finger on string 6 fret 5, {n:A}, and the same fingering plays {n:A} major. The root under that finger names the scale.',
      figure: {
        kind: 'fretboard',
        frets: [3, 8],
        root: 'A',
        labels: 'degree',
        dots: A_SHAPE.map(([s, f, n, d]) => dot(s, f, n, { degree: d, ...(d === '1' ? { role: 'root' as const, label: '1' } : {}) })),
        caption: '{n:A} major: the same shape, two frets higher.',
      },
    },
    {
      type: 'fretboard-find',
      prompt: 'Start the shape on {n:A}, string 6 fret 5. Tap every note of {n:A} major on strings 6, 5 and 4, frets 4 to 7.',
      find: { scale: 'major', tonic: 'A' },
      mode: 'all',
      octave: 'any',
      frets: [4, 7],
      strings: [6, 5, 4],
      explain: 'The eight notes of the shape from {n:A}, plus {n:G#} at string 6, fret 4: degree 7, below the root. Same fingers, two frets higher.',
      fact: 'major-scale-shape-movable',
    },
    {
      type: 'choice',
      prompt: 'You start the shape with your middle finger on string 6, fret 8. Which major scale do you play?',
      options: [
        { text: '{k:B major}', why: '{n:B} is at fret 7 of string 6.' },
        { text: '{k:C major}', correct: true },
        { text: '{k:D major}', why: '{n:D} is at fret 10 of string 6.' },
        { text: '{k:G major}', why: 'That is the shape at fret 3.' },
      ],
      shuffle: false,
      explain: 'String 6, fret 8 is {n:C}, so the shape plays {k:C major}. The root under your middle finger names the scale.',
      fact: 'major-scale-shape-movable',
    },
    {
      type: 'true-false',
      statement: 'In this shape, with one finger per fret, your middle finger plays the root on string 6.',
      answer: true,
      explain: 'Your hand covers four frets with the index finger one fret below the root. For {n:G} major: frets 2 to 5, middle finger on {n:G} at fret 3.',
      fact: 'major-scale-shape-fingers',
    },
    { generate: 'neck-tones', params: { what: 'scale', scales: ['major'], tonics: ['G', 'A', 'C'], strings: [6, 5, 4], span: 4 } },
  ],
  facts: [
    {
      id: 'major-scale-octave-shape-g',
      front: 'Where is one octave of {n:G} major, starting on string 6 fret 3?',
      back: 'String 6 frets 3 and 5; string 5 frets 2, 3 and 5; string 4 frets 2, 4 and 5.',
    },
    {
      id: 'major-scale-shape-movable',
      front: 'You play the one-octave shape from string 6, fret 5. Which scale is it?',
      back: '{k:A major}. The shape is movable: the root under your middle finger names the scale.',
      ask: {
        type: 'choice',
        prompt: 'The one-octave shape starts on string 6, fret 10. Which major scale is it?',
        options: [{ text: '{k:C major}' }, { text: '{k:D major}', correct: true }, { text: '{k:E major}' }],
        shuffle: false,
        explain: 'String 6, fret 10 is {n:D}, so the shape plays {k:D major}.',
      },
    },
    {
      id: 'major-scale-shape-fingers',
      front: 'Which fingers play the one-octave {n:G} major shape?',
      back: 'One finger per fret on frets 2 to 5, with the middle finger on the root, {n:G} at fret 3.',
    },
  ],
};

// ── 6. How the major scale sounds ─────────────────────────────────────────────────────────────

const theMajorSound: Lesson = {
  id: 'the-major-sound',
  title: 'How the major scale sounds',
  teaches: 'The major scale sounds bright and settled, and its seventh degree pulls strongly up to the tonic.',
  minutes: 3,
  skill: `theory:${U}:the-major-sound`,
  steps: [
    {
      type: 'card',
      title: 'Bright and settled',
      body: 'Play the {n:G} major shape and listen to its character: most people hear the major scale as **bright** and **settled**. Now look at degree 7, {n:F#} on string 4, fret 4. It sits just one half step below the top {n:G}.',
      figure: {
        kind: 'fretboard',
        frets: [1, 6],
        root: 'G',
        labels: 'degree',
        dots: G_SHAPE.map(([s, f, n, d]) => dot(s, f, n, { degree: d, ...(d === '1' ? { role: 'root' as const, label: '1' } : d === '7' ? { role: 'target' as const } : {}) })),
        caption: 'Degree 7, {n:F#}, is one fret below the top {n:G}.',
      },
    },
    {
      type: 'card',
      title: 'The pull of 7',
      body: 'Stop on degree 7 and the scale sounds unfinished: {n:F#} wants to rise the last half step to {n:G}. That pull is why degree 7 is called the {t:leading-tone|leading tone}: it leads you home to the tonic.',
      figure: {
        kind: 'audio',
        sound: { kind: 'tab', notes: [...G_SHAPE.slice(0, 7).map(([s, f], i) => note(s, f, i === 6 ? 'h' : 'q')), rest('h'), note(4, 4), note(4, 5, 'h')], tempo: 90 },
        label: 'Stop on 7, then go home',
      },
    },
    {
      type: 'listen-choice',
      prompt: 'Does this melody end on the tonic, or does it leave you hanging?',
      sound: { kind: 'tab', notes: PHRASE_HANGING, tempo: 90 },
      options: [{ text: 'It ends on the tonic' }, { text: 'It leaves me hanging', correct: true }],
      shuffle: false,
      explain: 'It stopped on {n:F#}, the leading tone, a half step short of {n:G}. Your ear expects one more note.',
    },
    {
      type: 'listen-choice',
      prompt: 'Is this the major scale or the minor pentatonic?',
      sound: { kind: 'scale', tonic: 'A2', scale: 'major', direction: 'up', tempo: 100 },
      options: [{ text: 'The major scale', correct: true }, { text: 'The minor pentatonic' }],
      shuffle: false,
      explain: 'Seven notes with a bright, settled sound: the {n:A} major scale. The minor pentatonic has five notes and a darker sound.',
    },
    {
      type: 'true-false',
      statement: 'The leading tone is degree 2 of the scale.',
      answer: false,
      explain: 'The leading tone is degree 7, a half step below the tonic: {n:F#} in {n:G} major, {n:B} in {n:C} major.',
      fact: 'major-scale-leading-tone',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap the leading tone of {n:G} major in the one-octave shape.',
      find: { note: 'F#3' },
      mode: 'one',
      octave: 'exact',
      frets: [1, 6],
      strings: [6, 5, 4],
      shown: [dot(6, 3, 'G', { role: 'root' }), dot(4, 5, 'G', { role: 'root' })],
      explain: 'Degree 7 is {n:F#}: string 4, fret 4, one fret below the top {n:G}.',
      fact: 'major-scale-leading-tone',
    },
    {
      type: 'choice',
      prompt: 'Which words best describe how the major scale usually sounds?',
      options: [
        { text: 'Bright and settled', correct: true },
        { text: 'Dark and sad', why: 'That is closer to how minor scales are often described.' },
        { text: 'Tense and restless', why: 'That describes the tritone.' },
      ],
      shuffle: false,
      explain: 'Most listeners hear the major scale as bright and settled.',
      fact: 'major-scale-bright',
    },
    {
      type: 'true-false',
      statement: 'Twinkle Twinkle Little Star uses only the notes of a major scale.',
      answer: true,
      explain: 'All its notes come from one major scale: in {n:C}, C C G G A A G, F F E E D D C. Frère Jacques does too.',
      fact: 'major-scale-traditional-tunes',
    },
    { generate: 'scale-ear', params: { scales: ['major', 'minor-pentatonic'] } },
  ],
  facts: [
    { id: 'major-scale-bright', front: 'How is the sound of the major scale usually described?', back: 'Bright and settled.' },
    {
      id: 'major-scale-leading-tone',
      front: 'What is the leading tone?',
      back: 'Degree 7 of the scale, a half step below the tonic, which pulls strongly up to it: {n:F#} in {n:G} major.',
      ask: {
        type: 'choice',
        prompt: 'Which note is the leading tone of {n:C} major?',
        options: [{ text: '{n:B}', correct: true }, { text: '{n:D}', why: '{n:D} is degree 2.' }, { text: '{n:G}', why: '{n:G} is degree 5.' }],
        explain: 'The leading tone is degree 7, a half step below the tonic: {n:B} in {n:C} major.',
      },
    },
    {
      id: 'major-scale-traditional-tunes',
      front: 'Name two traditional tunes that use only the notes of a major scale.',
      back: 'Twinkle Twinkle Little Star and Frère Jacques.',
    },
  ],
};

// ── 7. Major pentatonic ───────────────────────────────────────────────────────────────────────

const majorPentatonic: Lesson = {
  id: 'major-pentatonic',
  title: 'Major pentatonic: major scale minus two',
  teaches: 'The major pentatonic scale is the major scale without degrees 4 and 7: 1 2 3 5 6.',
  minutes: 3,
  skill: `theory:${U}:major-pentatonic`,
  steps: [
    {
      type: 'card',
      title: 'Leave out 4 and 7',
      body: 'Take {n:C} major, C D E F G A B, and leave out degrees 4 and 7: {n:F} and {n:B}. Five notes stay: {n:C} {n:D} {n:E} {n:G} {n:A}, degrees 1 2 3 5 6. That is {n:C} major {t:pentatonic}: on string 5, frets 3, 5, 7, 10 and 12.',
      figure: {
        kind: 'fretboard',
        frets: [3, 12],
        root: 'C',
        labels: 'degree',
        dots: C_PENTATONIC_ON_5.map(([f, n, d]) => dot(5, f, n, { degree: d, ...(d === '1' ? { role: 'root' as const, label: '1' } : {}) })),
        caption: '{n:C} major pentatonic on string 5: degrees 1 2 3 5 6.',
      },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete {n:C} major pentatonic.',
      text: '{n:C}  {n:D}  ___  {n:G}  ___',
      blanks: ['{n:E}', '{n:A}'],
      bank: ['{n:F}', '{n:B}'],
      explain: '{n:C} major pentatonic is C D E G A: the major scale without {n:F} (degree 4) and {n:B} (degree 7).',
      fact: 'major-scale-c-pentatonic',
    },
    {
      type: 'choice',
      prompt: 'Which two degrees of the major scale does major pentatonic leave out?',
      options: [
        { text: '1 and 5', why: 'The root and the fifth always stay.' },
        { text: '2 and 6', why: '2 and 6 stay: the scale is 1 2 3 5 6.' },
        { text: '3 and 7', why: 'Degree 3 stays: it gives the scale its major sound.' },
        { text: '4 and 7', correct: true },
      ],
      shuffle: false,
      explain: 'Major pentatonic keeps 1 2 3 5 6 and drops 4 and 7. Without them the scale has no half steps at all, which makes it sound open.',
      fact: 'major-scale-pentatonic-formula',
    },
    {
      type: 'card',
      title: 'Old friends: A minor pentatonic',
      body: 'Those five notes are exactly the notes of {n:A} minor pentatonic, A C D E G. Same notes, different home: {n:C} for {n:C} major pentatonic, {n:A} for {n:A} minor pentatonic. In box 1 at fret 5, the three {n:C}s become your new home notes.',
      figure: {
        kind: 'fretboard',
        frets: [4, 8],
        dots: BOX1.map(([s, f, n]) => dot(s, f, n, n === 'C' ? { role: 'root' } : {})),
        caption: 'Box 1 at fret 5. The {n:C}s are marked: home for {n:C} major pentatonic.',
      },
    },
    {
      type: 'listen-choice',
      prompt: 'Two phrases use the same five notes. Which one sounds major?',
      sound: { kind: 'tab', notes: [...PHRASE_ON_A, rest('h'), ...PHRASE_ON_C], tempo: 100 },
      options: [{ text: 'The first phrase' }, { text: 'The second phrase', correct: true }],
      shuffle: false,
      explain: 'The second circled {n:C}, {n:E} and {n:G} and came home to {n:C}: major. The first leaned on {n:A}, {n:C} and {n:E} and ended on {n:A}: minor.',
    },
    {
      type: 'true-false',
      statement: '{n:C} major pentatonic and {n:A} minor pentatonic contain the same five notes.',
      answer: true,
      explain: 'Both are C D E G A. They differ only in which note is home: {n:C} or {n:A}.',
      fact: 'major-scale-pentatonic-relative',
    },
    {
      type: 'fretboard-find',
      prompt: 'In box 1, tap every {n:C}: the home notes of {n:C} major pentatonic.',
      find: { note: 'C' },
      mode: 'all',
      octave: 'any',
      frets: [5, 8],
      explain: 'Box 1 holds three {n:C}s: string 6 fret 8, string 3 fret 5 and string 1 fret 8.',
      fact: 'major-scale-pentatonic-relative',
    },
    { generate: 'scale-notes', params: { scales: ['major-pentatonic'], tonics: ['C', 'G', 'D', 'A'], form: 'fill' } },
    { generate: 'scale-ear', params: { scales: ['major-pentatonic', 'minor-pentatonic'] } },
  ],
  facts: [
    {
      id: 'major-scale-pentatonic-formula',
      front: 'What is the major pentatonic scale?',
      back: 'The major scale without degrees 4 and 7: 1 2 3 5 6.',
    },
    {
      id: 'major-scale-c-pentatonic',
      front: 'Spell {n:C} major pentatonic.',
      back: '{n:C} {n:D} {n:E} {n:G} {n:A}',
      ask: { generate: 'scale-notes', params: { scales: ['major-pentatonic'], tonics: ['C'], form: 'order' } },
    },
    {
      id: 'major-scale-pentatonic-relative',
      front: 'Which minor pentatonic has the same notes as {n:C} major pentatonic?',
      back: '{n:A} minor pentatonic: both are C D E G A. They differ in which note is home.',
    },
  ],
};

/** Unit 11 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'The major scale',
  theme: 'scales',
  description: 'The step pattern behind the major scale, scale degrees, spelling major scales, and a movable one-octave shape.',
  lessons: [theStepPattern, scaleDegrees, gMajor, buildingMajorScales, oneOctaveShape, theMajorSound, majorPentatonic],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      { generate: 'scale-formula', params: { scales: ['major'] } },
      {
        type: 'choice',
        prompt: 'Which two notes of a major scale are a half step apart?',
        options: [{ text: 'Notes 1 and 2' }, { text: 'Notes 2 and 3' }, { text: 'Notes 3 and 4', correct: true }, { text: 'Notes 5 and 6' }],
        shuffle: false,
        explain: 'W W H W W W H: the half steps are between notes 3 and 4, and between 7 and 8.',
      },
      {
        type: 'match-pairs',
        prompt: 'Match each degree with its syllable.',
        pairs: [
          { left: 'Degree 1', right: 'do' },
          { left: 'Degree 2', right: 're' },
          { left: 'Degree 4', right: 'fa' },
          { left: 'Degree 6', right: 'la' },
        ],
        explain: 'do re mi fa sol la ti: 1 do, 2 re, 4 fa, 6 la.',
      },
      {
        type: 'choice',
        prompt: 'Which note is degree 6 of {n:G} major?',
        options: [{ text: '{n:D}' }, { text: '{n:E}', correct: true }, { text: '{n:F#}' }, { text: '{n:C}' }],
        shuffle: false,
        explain: 'Count up {n:G} major: {n:G} {n:A} {n:B} {n:C} {n:D} **{n:E}**. Degree 6 is {n:E}.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Complete {n:A} major.',
        text: '{n:A}  {n:B}  ___  {n:D}  {n:E}  ___  {n:G#}',
        blanks: ['{n:C#}', '{n:F#}'],
        bank: ['{n:C}', '{n:F}', '{n:Gb}'],
        spelling: 'exact',
        explain: '{n:A} major is {n:A} {n:B} {n:C#} {n:D} {n:E} {n:F#} {n:G#}: three sharps, each letter once. {n:Gb} is the right pitch but the wrong name, since G is already used.',
      },
      {
        type: 'type-answer',
        prompt: 'Type the fourth note of {n:F} major.',
        answer: { kind: 'note', value: 'Bb', spelling: 'exact' },
        input: 'keypad',
        explain: '{n:F} major is {n:F} {n:G} {n:A} {n:Bb} {n:C} {n:D} {n:E}: notes 3 to 4 must be a half step, so the fourth note is {n:Bb}, not {n:B} or {n:A#}.',
      },
      {
        type: 'choice',
        prompt: 'Which of these is {n:D} major?',
        options: [
          { text: '{n:D} {n:E} {n:F#} {n:G} {n:A} {n:B} {n:C#}', correct: true },
          { text: '{n:D} {n:E} {n:Gb} {n:G} {n:A} {n:B} {n:Db}', why: 'The right pitches, the wrong names: each letter must appear once.' },
          { text: '{n:D} {n:E} {n:F} {n:G} {n:A} {n:B} {n:C}', why: 'Plain {n:F} and {n:C} put the half steps in the wrong places.' },
        ],
        shuffle: false,
        spelling: 'exact',
        explain: '{n:D} major has two sharps, {n:F#} and {n:C#}, and uses each letter once.',
      },
      { generate: 'scale-notes', params: { scales: ['major'], tonics: ['C', 'G', 'D', 'F', 'A'], form: 'order' } },
      {
        type: 'choice',
        prompt: 'You play the one-octave shape with your middle finger on string 6, fret 10. Which major scale is it?',
        options: [{ text: '{k:C major}' }, { text: '{k:D major}', correct: true }, { text: '{k:E major}' }, { text: '{k:G major}' }],
        shuffle: false,
        explain: 'String 6, fret 10 is {n:D}: the shape is movable, and the root under your middle finger names the scale.',
      },
      {
        type: 'fretboard-find',
        prompt: 'Where does the one-octave shape start for {n:B} major? Tap its root on string 6.',
        find: { note: 'B2' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 12],
        strings: [6],
        explain: '{n:B} is at string 6, fret 7. Start the shape there with your middle finger and it plays {n:B} major.',
      },
      {
        type: 'true-false',
        statement: 'The leading tone is a half step below the tonic.',
        answer: true,
        explain: 'The leading tone is degree 7, a half step below the tonic, and it pulls up to it: {n:F#} in {n:G} major.',
      },
      {
        type: 'choice',
        prompt: 'Which degrees of the major scale make up major pentatonic?',
        options: [
          { text: '1 2 3 5 6', correct: true },
          { text: '1 2 4 5 7', why: 'Major pentatonic leaves out 4 and 7.' },
          { text: '1 3 4 5 7', why: 'Major pentatonic leaves out 4 and 7.' },
        ],
        shuffle: false,
        explain: 'Major pentatonic is the major scale without degrees 4 and 7: 1 2 3 5 6.',
      },
      {
        type: 'choice',
        prompt: 'Which minor pentatonic has the same five notes as {n:C} major pentatonic?',
        options: [
          { text: '{n:A} minor pentatonic', correct: true },
          { text: '{n:C} minor pentatonic', why: '{n:C} minor pentatonic is {n:C} {n:Eb} {n:F} {n:G} {n:Bb}: different notes.' },
          { text: '{n:E} minor pentatonic', why: '{n:E} minor pentatonic is E G A B D: it has {n:B}, not {n:C}.' },
        ],
        shuffle: false,
        explain: 'Both are C D E G A. They differ only in which note is home.',
      },
      { generate: 'scale-ear', params: { scales: ['major', 'minor-pentatonic'] } },
    ],
  },
};

export default unit;
