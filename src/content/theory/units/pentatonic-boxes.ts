/**
 * Theory Path, unit 20: The pentatonic in five boxes. Written from the syllabus entries in
 * `src/content/plan/theory-path.json` (unit `pentatonic-boxes`), one lesson per entry, in order:
 * each lesson opens with the "on the guitar" picture, asks the planned exercises, ends with the
 * planned drills, and turns every planned fact into a review card.
 *
 * `pentatonic-boxes.test.ts` cross-checks every box, fret, finger, root, shared note, formula,
 * relative pair, bend and phrase quoted here against the theory and guitar engines
 * (`scaleNotes`, `scalePatterns`, `midiAt`).
 *
 * Notes for readers of the code:
 * - `teaches` is shown as plain text on the map, so it spells degrees out ("flat 3").
 * - A play step draws its tab without a scroll box of its own, so a 12-note box would push a phone
 *   page sideways. "Play the box up and down" is therefore graded going up, in two 6-note halves
 *   (strings 6 to 4, then 3 to 1); the explanation sends the learner back down the same way.
 * - A fretboard figure has no "faded box" or shading per box. Box 2's picture dims box 1
 *   (`ghost`), rings the shared notes (`target`) and marks the roots; the captions say so.
 * - A lesson `Sound` cannot bend or detune a note, nor hold a drone under a line. The bend
 *   questions play where a bend arrives (in tune, or stopped a half step short, at the pitch of
 *   the fret below the target); the drones are struck before every note of the line, the way a
 *   guitarist practises over a drone alone.
 */
import type { FretDot, Lesson, PlayPhraseExercise, TabNote, Unit } from '@/lessons';

const U = 'pentatonic-boxes';

/** A note of a box: [string, fret, note]. */
type Spot = readonly [number, number, string];

const note = (string: number, fret: number, duration = 'q'): TabNote => ({ string, fret, duration });
const dot = (string: number, fret: number, n: string, extra: Partial<FretDot> = {}): FretDot => ({ string, fret, note: n, ...extra });

/** The five boxes of A minor pentatonic up the neck from fret 5, each in playing order (lowest note first). */
export const BOX_1: readonly Spot[] = [
  [6, 5, 'A'], [6, 8, 'C'], [5, 5, 'D'], [5, 7, 'E'], [4, 5, 'G'], [4, 7, 'A'],
  [3, 5, 'C'], [3, 7, 'D'], [2, 5, 'E'], [2, 8, 'G'], [1, 5, 'A'], [1, 8, 'C'],
];
export const BOX_2: readonly Spot[] = [
  [6, 8, 'C'], [6, 10, 'D'], [5, 7, 'E'], [5, 10, 'G'], [4, 7, 'A'], [4, 10, 'C'],
  [3, 7, 'D'], [3, 9, 'E'], [2, 8, 'G'], [2, 10, 'A'], [1, 8, 'C'], [1, 10, 'D'],
];
export const BOX_3: readonly Spot[] = [
  [6, 10, 'D'], [6, 12, 'E'], [5, 10, 'G'], [5, 12, 'A'], [4, 10, 'C'], [4, 12, 'D'],
  [3, 9, 'E'], [3, 12, 'G'], [2, 10, 'A'], [2, 13, 'C'], [1, 10, 'D'], [1, 12, 'E'],
];
export const BOX_4: readonly Spot[] = [
  [6, 12, 'E'], [6, 15, 'G'], [5, 12, 'A'], [5, 15, 'C'], [4, 12, 'D'], [4, 14, 'E'],
  [3, 12, 'G'], [3, 14, 'A'], [2, 13, 'C'], [2, 15, 'D'], [1, 12, 'E'], [1, 15, 'G'],
];
export const BOX_5: readonly Spot[] = [
  [6, 15, 'G'], [6, 17, 'A'], [5, 15, 'C'], [5, 17, 'D'], [4, 14, 'E'], [4, 17, 'G'],
  [3, 14, 'A'], [3, 17, 'C'], [2, 15, 'D'], [2, 17, 'E'], [1, 15, 'G'], [1, 17, 'A'],
];
/** Boxes 4 and 5 twelve frets lower: open position and frets 2 to 5. */
export const BOX_4_OPEN: readonly Spot[] = BOX_4.map(([s, f, n]) => [s, f - 12, n] as const);
export const BOX_5_LOW: readonly Spot[] = BOX_5.map(([s, f, n]) => [s, f - 12, n] as const);

/** The usual fingering of each box, note for note in playing order (the guitar engine's). */
export const FINGERS_2 = [2, 4, 1, 4, 1, 4, 1, 3, 2, 4, 2, 4] as const;
export const FINGERS_3 = [1, 3, 1, 3, 1, 3, 1, 4, 1, 4, 1, 3] as const;
export const FINGERS_4 = [1, 4, 1, 4, 1, 3, 1, 3, 2, 4, 1, 4] as const;

/** Degrees of the five notes in A minor and in C major. */
const IN_A_MINOR: Record<string, string> = { A: '1', C: 'b3', D: '4', E: '5', G: 'b7' };
const IN_C_MAJOR: Record<string, string> = { C: '1', D: '2', E: '3', G: '5', A: '6' };

const has = (box: readonly Spot[], s: number, f: number): boolean => box.some(([bs, bf]) => bs === s && bf === f);
/** A box as dots: roots (A, or `home`) marked, optionally with fingers or degree claims. */
const boxDots = (box: readonly Spot[], opts: { fingers?: readonly number[]; degrees?: Record<string, string>; home?: string } = {}): FretDot[] =>
  box.map(([s, f, n], i) =>
    dot(s, f, n, {
      ...(n === (opts.home ?? 'A') ? { role: 'root' as const } : {}),
      ...(opts.fingers ? { finger: opts.fingers[i] as 1 | 2 | 3 | 4 } : {}),
      ...(opts.degrees ? { degree: opts.degrees[n] } : {}),
    }),
  );
/** A box as a tab line, lowest note to highest, the top note held. */
const upTheBox = (box: readonly Spot[]): TabNote[] => box.map(([s, f], i) => note(s, f, i === box.length - 1 ? 'h' : 'q'));
/** An order tile naming a position. At most 16 characters: "String 6 fret 10". */
const tile = ([s, f]: Spot): string => `String ${s} fret ${f}`;
/**
 * Half a box (three strings, six notes) as a play step with its tapping version. A play step draws
 * its phrase as tab that does not scroll on its own, and six notes is what fits a 360 px phone.
 */
const playHalf = (box: readonly Spot[], name: string, half: 0 | 1, prompt: string): PlayPhraseExercise => {
  const part = box.slice(half * 6, half * 6 + 6);
  const strings = half === 0 ? '6, 5 and 4' : '3, 2 and 1';
  const names = part.map(([, , n]) => `{n:${n}}`).join(' ');
  const where = [0, 2, 4].map((i) => `string ${part[i][0]} at ${i === 0 ? 'frets ' : ''}${part[i][1]} and ${part[i + 1][1]}`).join(', ');
  return {
    type: 'play-phrase',
    prompt,
    notes: upTheBox(part),
    octave: 'exact',
    tempo: 70,
    explain: `Strings ${strings}, two notes each, low to high: ${names}.${half === 1 ? ' Then come back down the whole box, from the top.' : ''}`,
    alternative: {
      type: 'order',
      prompt: `Put the ${name} notes of strings ${strings} in playing order, lowest first.`,
      tiles: part.map(tile),
      explain: `${where.charAt(0).toUpperCase()}${where.slice(1)}: ${names}.`,
    },
  };
};

/** Box 1 and box 2 together: box 1 dimmed, the shared notes ringed, box 2's roots marked. */
const BOXES_1_AND_2: FretDot[] = [...BOX_1, ...BOX_2.filter(([s, f]) => !has(BOX_1, s, f))].map(([s, f, n]) =>
  dot(s, f, n, { role: !has(BOX_2, s, f) ? 'ghost' : n === 'A' ? 'root' : has(BOX_1, s, f) ? 'target' : 'tone' }),
);

/** An original phrase that travels up string 3 from box 1 into box 2 and on into box 3, ending on the root. */
export const TRAVEL_PHRASE: TabNote[] = [note(3, 5, 'e'), note(3, 7, 'e'), note(3, 9), note(3, 12), note(2, 10)];

/** The same box (box 2 of A minor, box 1 of C major) over two drones, the drone struck before every note. */
const overDrone = (drone: readonly [number, number], line: ReadonlyArray<readonly [number, number]>): TabNote[] =>
  line.flatMap(([s, f]) => [note(drone[0], drone[1], 'e'), note(s, f, 'e')]);
export const OVER_A_DRONE: TabNote[] = overDrone([5, 0], [[4, 7], [4, 10], [3, 7], [3, 9], [2, 8], [2, 10]]);
export const OVER_C_DRONE: TabNote[] = overDrone([6, 8], [[4, 10], [3, 7], [3, 9], [2, 8], [2, 10], [1, 8]]);

const pentatonicFormulas: Lesson = {
  id: 'pentatonic-formulas',
  title: 'Minor and major pentatonic',
  teaches: 'Minor pentatonic is 1, flat 3, 4, 5, flat 7; major is 1 2 3 5 6; each minor matches the major a minor 3rd up.',
  minutes: 3,
  skill: `theory:${U}:pentatonic-formulas`,
  steps: [
    {
      type: 'card',
      title: 'The minor pentatonic formula',
      body: 'You know box 1 of the {n:A} minor {t:pentatonic|pentatonic} scale. As {t:degree|degrees} of {n:A}, its five notes are {d:1} {d:b3} {d:4} {d:5} {d:b7}: natural minor without its {d:2} and {d:b6}. This formula works in any key.',
      figure: {
        kind: 'fretboard',
        frets: [4, 8],
        root: 'A',
        labels: 'degree',
        dots: boxDots(BOX_1, { degrees: IN_A_MINOR }),
        caption: 'Box 1 of {n:A} minor pentatonic, each note labelled by its degree in {n:A}.',
      },
      tip: 'Each dropped note leaves a three-fret gap, a whole + half step: {n:A} to {n:C}, {n:E} to {n:G}. Major pentatonic has two such gaps too.',
    },
    {
      type: 'choice',
      prompt: 'Which two degrees of natural minor does the minor pentatonic leave out?',
      options: [
        { text: '{d:2} and {d:b6}', correct: true },
        { text: '{d:b3} and {d:b7}', why: 'Those stay: the {d:b3} and the {d:b7} give the scale its minor sound.' },
        { text: '{d:4} and {d:5}', why: 'The 4th and 5th stay. In box 1 they are {n:D} and {n:E}.' },
        { text: '{d:1} and {d:5}', why: 'The root and the 5th always stay.' },
      ],
      explain: 'Natural minor is {d:1} {d:2} {d:b3} {d:4} {d:5} {d:b6} {d:b7}. Drop the {d:2} and the {d:b6} and five notes remain: {d:1} {d:b3} {d:4} {d:5} {d:b7}. In {n:A}, that removes {n:B} and {n:F}.',
      fact: 'boxes-minor-formula',
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the minor pentatonic formula.',
      text: '{d:1}  ___  {d:4}  {d:5}  ___',
      blanks: ['{d:b3}', '{d:b7}'],
      bank: ['{d:3}', '{d:7}', '{d:2}'],
      explain: 'Minor pentatonic is {d:1} {d:b3} {d:4} {d:5} {d:b7}. The {d:b3} and the {d:b7} make it minor; a plain {d:3} or {d:7} would sound major.',
      fact: 'boxes-minor-formula',
    },
    {
      type: 'card',
      title: 'Same frets, major formula',
      body: 'Now call {n:C} home. The very same frets are {n:C} major pentatonic: {d:1} {d:2} {d:3} {d:5} {d:6}, the major scale without its {d:4} and {d:7}. A C D E G and C D E G A are one set of notes with two homes.',
      figure: {
        kind: 'fretboard',
        frets: [4, 8],
        root: 'C',
        labels: 'degree',
        dots: boxDots(BOX_1, { degrees: IN_C_MAJOR, home: 'C' }),
        caption: 'The same box, labelled by degree in {n:C} major: {n:C} is now {d:1}.',
      },
    },
    {
      type: 'true-false',
      statement: '{n:A} minor pentatonic and {n:C} major pentatonic use exactly the same five notes.',
      answer: true,
      explain: 'Both are A C D E G. Only the home note changes: {n:A} for the minor, {n:C} for the major.',
      fact: 'boxes-relative-pair',
    },
    {
      type: 'choice',
      prompt: 'Which two degrees of the major scale does the major pentatonic leave out?',
      options: [
        { text: '{d:4} and {d:7}', correct: true },
        { text: '{d:3} and {d:6}', why: 'The {d:3} and the {d:6} stay: major pentatonic is {d:1} {d:2} {d:3} {d:5} {d:6}.' },
        { text: '{d:2} and {d:5}', why: 'Both stay. In {n:C} they are {n:D} and {n:G}.' },
        { text: '{d:1} and {d:3}', why: 'The root always stays, and the {d:3} is what makes it major.' },
      ],
      explain: 'Major is {d:1} {d:2} {d:3} {d:4} {d:5} {d:6} {d:7}. Leave out {d:4} and {d:7} and you have {d:1} {d:2} {d:3} {d:5} {d:6}. In {n:C}, that removes {n:F} and {n:B}.',
      fact: 'boxes-major-formula',
    },
    {
      type: 'card',
      title: 'Twins, a minor third apart',
      body: 'The two homes are always a {t:minor-third|minor third} apart: three frets. Count three frets up string 6 from a minor root to reach its major twin: {n:E} (open) to {n:G} (fret 3), {n:A} (fret 5) to {n:C} (fret 8).',
      figure: {
        kind: 'fretboard',
        frets: [0, 8],
        strings: [6],
        dots: [dot(6, 0, 'E', { role: 'root' }), dot(6, 3, 'G', { role: 'target' }), dot(6, 5, 'A', { role: 'root' }), dot(6, 8, 'C', { role: 'target' })],
        caption: 'String 6: two minor roots ({n:E}, {n:A}) and, three frets up, their major twins.',
      },
      tip: 'Twins like these are relative keys: {k:A minor} and {k:C major} share all their notes.',
    },
    {
      type: 'choice',
      prompt: 'Which major pentatonic has the same notes as {n:D} minor pentatonic?',
      options: [
        { text: '{n:F} major pentatonic', correct: true },
        { text: '{n:D} major pentatonic', why: 'Same root, different notes: {n:D} major pentatonic has {n:F#} and {n:B}.' },
        { text: '{n:B} major pentatonic', why: '{n:B} is a minor 3rd below {n:D}. Count up, not down: three frets above {n:D} is {n:F}.' },
        { text: '{n:A} major pentatonic', why: '{n:A} is a 5th above {n:D}. Its major pentatonic has {n:C#} and {n:F#}.' },
      ],
      explain: '{n:D} minor pentatonic is D F G A C. A minor 3rd above {n:D} is {n:F}, and {n:F} major pentatonic is F G A C D: the same five notes.',
      fact: 'boxes-relative-pair',
    },
    {
      type: 'type-answer',
      prompt: 'Type the five notes of {n:E} minor pentatonic, from {n:E} up.',
      answer: { kind: 'text', value: 'E G A B D', accept: ['EGABD', 'E G A H D', 'Mi Sol La Si Re'] },
      input: 'keyboard',
      explain: '{d:1} {d:b3} {d:4} {d:5} {d:b7} from {n:E} is {n:E} {n:G} {n:A} {n:B} {n:D}. Its major twin, a minor 3rd up, is {n:G} major pentatonic: G A B D E.',
      fact: 'boxes-minor-formula',
    },
    { generate: 'scale-notes', params: { scales: ['minor-pentatonic', 'major-pentatonic'], tonics: ['A', 'E', 'D', 'G', 'C'], form: 'order' } },
    { generate: 'scale-formula', params: { scales: ['minor-pentatonic', 'major-pentatonic'] } },
  ],
  facts: [
    {
      id: 'boxes-minor-formula',
      front: 'What is the minor pentatonic formula, and what does it leave out of natural minor?',
      back: '{d:1} {d:b3} {d:4} {d:5} {d:b7}: natural minor without degrees {d:2} and {d:b6}.',
      ask: {
        type: 'fill-blanks',
        prompt: 'Complete the minor pentatonic formula.',
        text: '{d:1}  ___  {d:4}  {d:5}  ___',
        blanks: ['{d:b3}', '{d:b7}'],
        bank: ['{d:3}', '{d:7}', '{d:6}'],
        explain: 'Minor pentatonic is {d:1} {d:b3} {d:4} {d:5} {d:b7}: natural minor without its {d:2} and {d:b6}.',
      },
    },
    {
      id: 'boxes-major-formula',
      front: 'What is the major pentatonic formula, and what does it leave out of the major scale?',
      back: '{d:1} {d:2} {d:3} {d:5} {d:6}: the major scale without degrees {d:4} and {d:7}.',
      ask: {
        type: 'fill-blanks',
        prompt: 'Complete the major pentatonic formula.',
        text: '{d:1}  {d:2}  ___  {d:5}  ___',
        blanks: ['{d:3}', '{d:6}'],
        bank: ['{d:b3}', '{d:4}', '{d:7}'],
        explain: 'Major pentatonic is {d:1} {d:2} {d:3} {d:5} {d:6}: the major scale without its {d:4} and {d:7}.',
      },
    },
    {
      id: 'boxes-relative-pair',
      front: 'Which major pentatonic has the same notes as A minor pentatonic? And as E minor pentatonic?',
      back: '{n:C} major pentatonic, a minor 3rd above {n:A}. {n:E} minor pentatonic matches {n:G} major pentatonic.',
      ask: {
        type: 'choice',
        prompt: 'Which major pentatonic has the same notes as {n:E} minor pentatonic?',
        options: [
          { text: '{n:G} major pentatonic', correct: true },
          { text: '{n:E} major pentatonic', why: 'Same root, different notes: it has {n:G#} and {n:C#}.' },
          { text: '{n:C} major pentatonic', why: 'That one matches {n:A} minor pentatonic.' },
          { text: '{n:B} major pentatonic', why: '{n:B} is a 5th above {n:E}, not a minor 3rd.' },
        ],
        explain: 'A minor 3rd above {n:E} is {n:G}. {n:E} minor pentatonic, E G A B D, and {n:G} major pentatonic, G A B D E, share all five notes.',
      },
    },
  ],
};

const box2: Lesson = {
  id: 'box-2',
  title: 'Box 2',
  teaches: 'Box 2 of the minor pentatonic starts on the scale\'s second note on string 6 and overlaps the top of box 1.',
  minutes: 3,
  skill: `theory:${U}:box-2`,
  steps: [
    {
      type: 'card',
      title: 'The next box up',
      body: 'Box 1 is one of **five** {t:pentatonic-box|boxes} that cover the neck. **Box 2** starts where box 1 ends: on string 6 at fret 8, {n:C}, the scale\'s second note. Its lower notes are box 1\'s upper notes.',
      figure: { kind: 'fretboard', frets: [4, 11], dots: BOXES_1_AND_2, caption: 'Box 1 dimmed, box 2 bright. Ringed notes are in both; the roots are marked.' },
    },
    {
      type: 'choice',
      prompt: 'On which note does box 2 of {n:A} minor pentatonic start, on string 6?',
      options: [
        { text: '{n:C}, at fret 8', correct: true },
        { text: '{n:A}, at fret 5', why: 'That is where box 1 starts.' },
        { text: '{n:D}, at fret 10', why: 'That is the top of box 2 on string 6, and where box 3 starts.' },
        { text: '{n:B}, at fret 7', why: '{n:B} is not in {n:A} minor pentatonic.' },
      ],
      explain: 'Each box starts on the next note of the scale. Box 1 starts on {n:A}, so box 2 starts on {n:C}, the second note: string 6, fret 8.',
      fact: 'boxes-box-starts',
    },
    {
      type: 'card',
      title: 'Box 2, string by string',
      body: 'Two notes on every string: frets **8 and 10** on strings 6, 2 and 1; **7 and 10** on strings 5 and 4; **7 and 9** on string 3. The roots are string 4 at fret 7 and string 2 at fret 10. Your first finger covers fret 7, your little finger fret 10.',
      figure: { kind: 'fretboard', frets: [6, 11], labels: 'finger', dots: boxDots(BOX_2, { fingers: FINGERS_2 }), caption: 'Box 2 with fingers: 1 index, 2 middle, 3 ring, 4 little.' },
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap every note of box 2: {n:A} minor pentatonic between frets 7 and 10.',
      find: { scale: 'minor-pentatonic', tonic: 'A' },
      mode: 'all',
      octave: 'any',
      frets: [7, 10],
      explain: 'Frets 8 and 10 on strings 6, 2 and 1; 7 and 10 on strings 5 and 4; 7 and 9 on string 3. Twelve notes, two per string.',
      fact: 'boxes-box-2-frets',
    },
    {
      type: 'true-false',
      statement: 'The lowest note of box 2 on each string is the highest note of box 1 on that string.',
      answer: true,
      explain: 'Box 1 tops out at fret 8 on strings 6, 2 and 1 and at fret 7 on strings 5, 4 and 3. Box 2 starts on exactly those notes, so you can cross from one box to the other with no gap.',
      fact: 'boxes-box-2-overlap',
    },
    playHalf(BOX_2, 'box 2', 0, 'Play the lower half of box 2 up: strings 6, 5 and 4, one finger per fret.'),
    playHalf(BOX_2, 'box 2', 1, 'Now the upper half of box 2: strings 3, 2 and 1, up to the top of the box.'),
    {
      type: 'match-pairs',
      prompt: 'Each box starts on string 6 on the next note of the scale, A C D E G. Match each box with its first note.',
      pairs: [
        { left: 'Box 1', right: '{n:A}, fret 5' },
        { left: 'Box 2', right: '{n:C}, fret 8' },
        { left: 'Box 3', right: '{n:D}, fret 10' },
        { left: 'Box 4', right: '{n:E}, fret 12' },
        { left: 'Box 5', right: '{n:G}, fret 15' },
      ],
      explain: 'The boxes climb string 6 on the scale\'s notes in order: {n:A} at fret 5, {n:C} at 8, {n:D} at 10, {n:E} at 12, {n:G} at 15. Then box 1 again on the {n:A} at fret 17.',
      fact: 'boxes-box-starts',
    },
    { generate: 'neck-tones', params: { what: 'scale', scales: ['minor-pentatonic'], tonics: ['A', 'E', 'G', 'D', 'C'], span: 4, strings: [6, 5, 4] } },
  ],
  facts: [
    {
      id: 'boxes-box-2-frets',
      front: 'Which frets does box 2 of A minor pentatonic use on each string?',
      back: 'String 6 frets 8, 10; string 5 frets 7, 10; string 4 frets 7, 10; string 3 frets 7, 9; string 2 frets 8, 10; string 1 frets 8, 10.',
      ask: {
        type: 'fretboard-find',
        prompt: 'Tap every note of box 2: {n:A} minor pentatonic between frets 7 and 10.',
        find: { scale: 'minor-pentatonic', tonic: 'A' },
        mode: 'all',
        octave: 'any',
        frets: [7, 10],
        explain: 'Frets 8 and 10 on strings 6, 2 and 1; 7 and 10 on strings 5 and 4; 7 and 9 on string 3.',
      },
    },
    {
      id: 'boxes-box-2-overlap',
      front: 'How does box 2 join box 1?',
      back: 'Box 2 shares its lower notes with the upper notes of box 1.',
      ask: {
        type: 'true-false',
        statement: 'Box 2 shares its lower notes with the upper notes of box 1.',
        answer: true,
        explain: 'The top note of box 1 on each string is the bottom note of box 2: frets 8 on strings 6, 2 and 1, fret 7 on strings 5, 4 and 3.',
      },
    },
    {
      id: 'boxes-box-starts',
      front: 'On which note does each box of A minor pentatonic start on string 6?',
      back: 'On the next note of the scale each time: box 1 on {n:A}, box 2 on {n:C}, box 3 on {n:D}, box 4 on {n:E} and box 5 on {n:G}.',
      ask: {
        type: 'match-pairs',
        prompt: 'Match each box of {n:A} minor pentatonic with its first note on string 6.',
        pairs: [
          { left: 'Box 1', right: '{n:A}' },
          { left: 'Box 2', right: '{n:C}' },
          { left: 'Box 3', right: '{n:D}' },
          { left: 'Box 4', right: '{n:E}' },
          { left: 'Box 5', right: '{n:G}' },
        ],
        explain: 'Each box starts on the next note of the scale, A C D E G.',
      },
    },
  ],
};

const box3: Lesson = {
  id: 'box-3',
  title: 'Box 3',
  teaches: 'Box 3 continues up the neck from box 2, starting on the scale\'s third note on string 6.',
  minutes: 3,
  skill: `theory:${U}:box-3`,
  steps: [
    {
      type: 'card',
      title: 'Box 3: from fret 10',
      body: 'Box 3 picks up where box 2 ends. It starts on string 6 at fret 10 with {n:D}, the scale\'s third note, and shares its lower notes with the top of box 2. Its roots are string 5 at fret 12 and string 2 at fret 10.',
      figure: { kind: 'fretboard', frets: [8, 14], dots: boxDots(BOX_3), caption: 'Box 3 of {n:A} minor pentatonic, with its two roots marked.' },
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap the two roots, the {n:A}s, in box 3 (frets 9 to 13).',
      find: { note: 'A' },
      mode: 'all',
      octave: 'any',
      frets: [9, 13],
      explain: 'String 5 at fret 12 and string 2 at fret 10: both {n:A}, an octave apart. The higher one, string 2 at fret 10, is also the top root of box 2.',
      fact: 'boxes-box-3-roots',
    },
    {
      type: 'fretboard-name',
      prompt: 'This note is in box 3. Which note is it?',
      position: { string: 3, fret: 9 },
      ask: 'note',
      spelling: 'any',
      options: ['E', 'D', 'G', 'C'],
      explain: 'Open string 3 is {n:G}; nine frets up is {n:E}, the {d:5} of {n:A}. It is the lowest note of box 3 on string 3.',
    },
    {
      type: 'card',
      title: 'The widest box',
      body: 'Box 3 is the only box that spans **five frets**, 9 to 13. Strings 6, 5, 4 and 1 use frets 10 and 12. String 3 uses 9 and 12, string 2 uses 10 and 13: slide your first finger back to fret 9 for string 3, then up to fret 10 again.',
      figure: { kind: 'fretboard', frets: [8, 14], labels: 'finger', dots: boxDots(BOX_3, { fingers: FINGERS_3 }), caption: 'Box 3 with fingers. On string 3 the first finger moves back one fret.' },
    },
    {
      type: 'choice',
      prompt: 'How many frets does box 3 span?',
      options: [
        { text: 'Five: frets 9 to 13', correct: true },
        { text: 'Four: frets 10 to 13', why: 'String 3 reaches down to fret 9.' },
        { text: 'Four: frets 9 to 12', why: 'String 2 reaches up to fret 13.' },
        { text: 'Three: frets 10 to 12', why: 'Strings 3 and 2 reach one fret further each way.' },
      ],
      shuffle: false,
      explain: 'String 3 starts at fret 9 and string 2 ends at fret 13, so box 3 spans five frets. The other boxes fit in four.',
      fact: 'boxes-box-3-widest',
    },
    playHalf(BOX_3, 'box 3', 0, 'Play the lower half of box 3 up: strings 6, 5 and 4, frets 10 and 12.'),
    playHalf(BOX_3, 'box 3', 1, 'Now the upper half: strings 3, 2 and 1. Slide your first finger back to fret 9 for string 3.'),
    {
      type: 'true-false',
      statement: 'Box 3 starts on string 6 on {n:D}, the third note of {n:A} minor pentatonic.',
      answer: true,
      explain: 'A C D E G: box 1 starts on {n:A}, box 2 on {n:C}, box 3 on {n:D}, at string 6, fret 10.',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap every note of box 3: {n:A} minor pentatonic between frets 9 and 13.',
      find: { scale: 'minor-pentatonic', tonic: 'A' },
      mode: 'all',
      octave: 'any',
      frets: [9, 13],
      explain: 'Frets 10 and 12 on strings 6, 5, 4 and 1; 9 and 12 on string 3; 10 and 13 on string 2. Twelve notes.',
      fact: 'boxes-box-3-frets',
    },
    { generate: 'neck-tones', params: { what: 'scale', scales: ['minor-pentatonic'], tonics: ['A', 'E', 'G', 'D', 'C'], span: 5, strings: [3, 2, 1] } },
  ],
  facts: [
    {
      id: 'boxes-box-3-frets',
      front: 'Which frets does box 3 of A minor pentatonic use on each string?',
      back: 'String 6 frets 10, 12; string 5 frets 10, 12; string 4 frets 10, 12; string 3 frets 9, 12; string 2 frets 10, 13; string 1 frets 10, 12.',
      ask: {
        type: 'fretboard-find',
        prompt: 'Tap every note of box 3: {n:A} minor pentatonic between frets 9 and 13.',
        find: { scale: 'minor-pentatonic', tonic: 'A' },
        mode: 'all',
        octave: 'any',
        frets: [9, 13],
        explain: 'Frets 10 and 12 on strings 6, 5, 4 and 1; 9 and 12 on string 3; 10 and 13 on string 2.',
      },
    },
    {
      id: 'boxes-box-3-roots',
      front: 'Where are the roots (A) in box 3 of A minor pentatonic?',
      back: 'String 5 at fret 12 and string 2 at fret 10.',
      ask: {
        type: 'fretboard-find',
        prompt: 'Tap the two roots, the {n:A}s, in box 3 (frets 9 to 13).',
        find: { note: 'A' },
        mode: 'all',
        octave: 'any',
        frets: [9, 13],
        explain: 'String 5 at fret 12 and string 2 at fret 10.',
      },
    },
    { id: 'boxes-box-3-widest', front: 'Which box of the minor pentatonic is the widest?', back: 'Box 3: it spans five frets, from fret 9 to fret 13 in {n:A}.' },
  ],
};

const boxes4And5: Lesson = {
  id: 'boxes-4-and-5',
  title: 'Boxes 4 and 5',
  teaches: 'Boxes 4 and 5 complete the cycle, and in A they also appear low on the neck in open and second position.',
  minutes: 4,
  skill: `theory:${U}:boxes-4-and-5`,
  steps: [
    {
      type: 'card',
      title: 'Box 4: from fret 12',
      body: 'Box 4 starts on string 6 at fret 12 with {n:E}, the fourth note. Frets 12 and 15 on strings 6, 5 and 1; 12 and 14 on strings 4 and 3; 13 and 15 on string 2. Its roots are string 5 at fret 12 and string 3 at fret 14.',
      figure: { kind: 'fretboard', frets: [11, 16], labels: 'finger', dots: boxDots(BOX_4, { fingers: FINGERS_4 }), caption: 'Box 4 of {n:A} minor pentatonic, with fingers and its roots marked.' },
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap every note of box 4: {n:A} minor pentatonic between frets 12 and 15.',
      find: { scale: 'minor-pentatonic', tonic: 'A' },
      mode: 'all',
      octave: 'any',
      frets: [12, 15],
      explain: 'Frets 12 and 15 on strings 6, 5 and 1; 12 and 14 on strings 4 and 3; 13 and 15 on string 2.',
      fact: 'boxes-box-4-frets',
    },
    {
      type: 'card',
      title: 'Box 5: from fret 15',
      body: 'Box 5 starts on {n:G} at fret 15, the fifth note. Frets 15 and 17 on strings 6, 5, 2 and 1; 14 and 17 on strings 4 and 3. Its roots: strings 6 and 1 at fret 17, string 3 at fret 14. Its top notes are the bottom of box 1 again, an octave up.',
      figure: { kind: 'fretboard', frets: [13, 18], dots: boxDots(BOX_5), caption: 'Box 5 of {n:A} minor pentatonic, with its three roots marked.' },
    },
    {
      type: 'choice',
      prompt: 'Box 5 of {n:A} minor pentatonic starts on which note on string 6?',
      options: [
        { text: '{n:G}, at fret 15', correct: true },
        { text: '{n:E}, at fret 12', why: 'That is where box 4 starts.' },
        { text: '{n:A}, at fret 17', why: 'That is box 1 again, an octave above fret 5.' },
        { text: '{n:F}, at fret 13', why: '{n:F} is not in {n:A} minor pentatonic.' },
      ],
      explain: 'A C D E G: the fifth note is {n:G}, so box 5 starts on string 6 at fret 15.',
    },
    {
      type: 'card',
      title: 'Twelve frets lower',
      body: 'Fret 12 repeats the open strings, so a box at fret 12 or higher also sits **twelve frets lower**. Box 4 drops to **open position**, frets 0 to 3, with five open strings. Box 5 drops to frets 2 to 5, just below box 1. Same shapes, same notes, an octave down.',
      figure: { kind: 'fretboard', frets: [0, 5], derive: { scale: 'minor-pentatonic', tonic: 'A' }, caption: 'Frets 0 to 5: box 4 (frets 0 to 3) and box 5 (frets 2 to 5).' },
    },
    {
      type: 'choice',
      prompt: 'Which box of {n:A} minor pentatonic is in open position?',
      options: [
        { text: 'Box 4', correct: true },
        { text: 'Box 1', why: 'Box 1 starts at fret 5.' },
        { text: 'Box 5', why: 'Box 5 sits at frets 2 to 5, just above open position.' },
        { text: 'Box 2', why: 'Box 2 is at frets 7 to 10.' },
      ],
      shuffle: false,
      explain: 'Box 4 lives at frets 12 to 15; twelve frets lower it uses frets 0 to 3, with every open string except string 2, whose open {n:B} is not in the scale.',
      fact: 'boxes-low-boxes',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap every note of box 4 in open position: {n:A} minor pentatonic from the open strings to fret 3.',
      find: { scale: 'minor-pentatonic', tonic: 'A' },
      mode: 'all',
      octave: 'any',
      frets: [0, 3],
      explain: 'Frets 0 and 3 on strings 6, 5 and 1; 0 and 2 on strings 4 and 3; 1 and 3 on string 2, whose open {n:B} is not in the scale. Twelve notes.',
      fact: 'boxes-low-boxes',
    },
    playHalf(BOX_5_LOW, 'low box 5', 0, 'Play the lower half of box 5, low on the neck: strings 6, 5 and 4, around frets 2 to 5.'),
    playHalf(BOX_5_LOW, 'low box 5', 1, 'Now the upper half: strings 3, 2 and 1. Fret 5 at the top is where box 1 begins.'),
    {
      type: 'true-false',
      statement: 'Low on the neck, the top notes of box 5 are the bottom notes of box 1 at fret 5.',
      answer: true,
      explain: 'Low box 5 tops out at fret 5 on every string, exactly where box 1 starts. The five boxes join up into one cycle.',
    },
    { generate: 'neck-tones', params: { what: 'scale', scales: ['minor-pentatonic'], tonics: ['A', 'E', 'G', 'D', 'C'], span: 4, strings: [4, 3, 2] } },
  ],
  facts: [
    {
      id: 'boxes-box-4-frets',
      front: 'Which frets does box 4 of A minor pentatonic use on each string?',
      back: 'String 6 frets 12, 15; string 5 frets 12, 15; strings 4 and 3 frets 12, 14; string 2 frets 13, 15; string 1 frets 12, 15.',
      ask: {
        type: 'fretboard-find',
        prompt: 'Tap every note of box 4: {n:A} minor pentatonic between frets 12 and 15.',
        find: { scale: 'minor-pentatonic', tonic: 'A' },
        mode: 'all',
        octave: 'any',
        frets: [12, 15],
        explain: 'Frets 12 and 15 on strings 6, 5 and 1; 12 and 14 on strings 4 and 3; 13 and 15 on string 2.',
      },
    },
    {
      id: 'boxes-box-5-frets',
      front: 'Which frets does box 5 of A minor pentatonic use on each string?',
      back: 'String 6 frets 15, 17; string 5 frets 15, 17; strings 4 and 3 frets 14, 17; string 2 frets 15, 17; string 1 frets 15, 17.',
      ask: {
        type: 'fretboard-find',
        prompt: 'Tap every note of box 5: {n:A} minor pentatonic between frets 14 and 17.',
        find: { scale: 'minor-pentatonic', tonic: 'A' },
        mode: 'all',
        octave: 'any',
        frets: [14, 17],
        explain: 'Frets 15 and 17 on strings 6, 5, 2 and 1; 14 and 17 on strings 4 and 3.',
      },
    },
    {
      id: 'boxes-low-boxes',
      front: 'Where are boxes 4 and 5 of A minor pentatonic low on the neck?',
      back: 'Twelve frets lower: box 4 is in open position (frets 0 to 3) and box 5 sits around frets 2 to 5.',
      ask: {
        type: 'choice',
        prompt: 'Which box of {n:A} minor pentatonic is in open position?',
        options: [{ text: 'Box 4', correct: true }, { text: 'Box 1' }, { text: 'Box 5' }, { text: 'Box 3' }],
        shuffle: false,
        explain: 'Box 4 at frets 12 to 15 drops twelve frets to open position. Box 5 then sits at frets 2 to 5.',
      },
    },
  ],
};

const connectingTheBoxes: Lesson = {
  id: 'connecting-the-boxes',
  title: 'Connecting the boxes',
  teaches: 'The five boxes link end to end, and sliding between them on one string lets a solo travel along the neck.',
  minutes: 3,
  skill: `theory:${U}:connecting-the-boxes`,
  steps: [
    {
      type: 'card',
      title: 'Five boxes, one neck',
      body: 'Put the five boxes side by side and they **link end to end**: the top notes of each box are the bottom notes of the next. From fret 5 to fret 17, boxes 1 to 5 cover the neck with {n:A} minor pentatonic.',
      figure: { kind: 'fretboard', frets: [5, 17], derive: { scale: 'minor-pentatonic', tonic: 'A' }, caption: 'Frets 5 to 17: boxes 1 to 5 of {n:A} minor pentatonic, end to end.' },
    },
    {
      type: 'fretboard-find',
      prompt: 'Box 3 ends where box 4 begins. Between frets 11 and 13, tap the six notes they share.',
      find: { scale: 'minor-pentatonic', tonic: 'A' },
      mode: 'all',
      octave: 'any',
      frets: [11, 13],
      explain: 'Fret 12 on strings 6, 5, 4, 3 and 1, and fret 13 on string 2: the top of box 3 and the bottom of box 4. Fret 11 has no scale notes at all.',
      fact: 'boxes-link-end-to-end',
    },
    {
      type: 'card',
      title: 'Round again',
      body: 'After box 5 the cycle starts over: **box 1 again at fret 17**, twelve frets above fret 5, then box 2, and so on. It works going down too: below box 1 comes box 5 at frets 2 to 5, then box 4 in open position.',
      figure: { kind: 'fretboard', frets: [5, 17], strings: [6], derive: { note: 'A' }, caption: 'String 6: box 1 starts on {n:A} at fret 5 and again at fret 17.' },
    },
    {
      type: 'order',
      prompt: 'You start in box 3 and climb the neck. Put the boxes you play through in order.',
      tiles: ['Box 3', 'Box 4', 'Box 5', 'Box 1', 'Box 2'],
      explain: 'On string 6: box 3 from fret 10, box 4 from 12, box 5 from 15, then box 1 again from fret 17 and box 2 from 20. The cycle repeats every twelve frets.',
      fact: 'boxes-cycle-repeats',
    },
    {
      type: 'choice',
      prompt: 'Box 1 of {n:A} minor pentatonic starts at fret 5. Where does the next box 1 up the neck start?',
      options: [
        { text: 'Fret 17', correct: true },
        { text: 'Fret 12', why: 'Fret 12 is where box 4 starts.' },
        { text: 'Fret 15', why: 'Fret 15 is where box 5 starts on string 6.' },
        { text: 'Fret 10', why: 'Fret 10 is where box 3 starts.' },
      ],
      shuffle: false,
      explain: 'The boxes repeat every twelve frets: 5 + 12 = 17, the {n:A} an octave above.',
      fact: 'boxes-cycle-repeats',
    },
    {
      type: 'card',
      title: 'Slide to change box',
      body: 'To travel, {t:slide} along one string from one box into the next. In this original phrase, string 3 carries you from box 1 (fret 7) into box 2 (fret 9), then on into box 3 (fret 12). Keep the finger pressed so the note rings as it moves.',
      figure: { kind: 'tab', tempo: 80, notes: TRAVEL_PHRASE, caption: 'Slide 7 to 9, then 9 to 12, on string 3. It ends on the root, string 2 fret 10.' },
    },
    {
      type: 'play-phrase',
      prompt: 'Play the phrase: slide up string 3 from box 1 into box 2, then into box 3, and end on the root.',
      notes: TRAVEL_PHRASE,
      octave: 'exact',
      tempo: 70,
      explain: '{n:C}, {n:D}, slide to {n:E} (box 2), slide on to {n:G} (box 3), then home to the root, {n:A}. Two slides, three boxes, one bar.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'The phrase leaves box 1 at string 3, fret 7 and slides up into box 2. On string 3, tap the fret it lands on.',
        find: { note: 'E4' },
        mode: 'one',
        octave: 'exact',
        frets: [5, 10],
        strings: [3],
        explain: 'Fret 9, {n:E}: the next scale note up string 3. Box 2 uses frets 7 and 9 on string 3, so the slide lands on its upper note.',
      },
    },
    {
      type: 'choice',
      prompt: 'Why slide along one string between boxes?',
      options: [
        { text: 'It joins two boxes in one smooth move', correct: true },
        { text: 'It is the only way to leave a box', why: 'You can also shift the whole hand or jump. A slide is simply the smoothest.' },
        { text: 'It keeps you in the same box', why: 'A slide carries you into the next box.' },
      ],
      explain: 'A slide moves the hand while the note keeps sounding, so the solo travels along the neck without a gap.',
      fact: 'boxes-slide-between',
    },
    { generate: 'neck-tones', params: { what: 'scale', scales: ['minor-pentatonic'], tonics: ['A', 'E', 'G', 'D', 'C'], span: 5, strings: [6, 5, 4] } },
  ],
  facts: [
    {
      id: 'boxes-link-end-to-end',
      front: 'How do the five pentatonic boxes fit together?',
      back: 'End to end: the top notes of each box are the bottom notes of the next.',
      ask: {
        type: 'fretboard-find',
        prompt: 'Box 3 ends where box 4 begins. Between frets 11 and 13, tap the six notes they share.',
        find: { scale: 'minor-pentatonic', tonic: 'A' },
        mode: 'all',
        octave: 'any',
        frets: [11, 13],
        explain: 'Fret 12 on strings 6, 5, 4, 3 and 1, and fret 13 on string 2.',
      },
    },
    {
      id: 'boxes-cycle-repeats',
      front: 'What comes after box 5?',
      back: 'Box 1 again, twelve frets above where it started: in {n:A}, at fret 17.',
      ask: {
        type: 'order',
        prompt: 'You start in box 4 and climb the neck. Put the boxes you play through in order.',
        tiles: ['Box 4', 'Box 5', 'Box 1', 'Box 2'],
        explain: 'After box 5 comes box 1 again, twelve frets higher, then box 2.',
      },
    },
    { id: 'boxes-slide-between', front: 'How do you move smoothly from one box to the next in a solo?', back: 'Slide along one string into the next box, with the note still ringing.' },
  ],
};

const majorPentatonicBoxes: Lesson = {
  id: 'major-pentatonic-boxes',
  title: 'Major pentatonic in the same boxes',
  teaches: 'The major pentatonic uses the same five shapes as its relative minor pentatonic; only the home note changes.',
  minutes: 3,
  skill: `theory:${U}:major-pentatonic-boxes`,
  steps: [
    {
      type: 'card',
      title: 'Same frets, new home',
      body: 'Here is box 2 of {n:A} minor pentatonic again. Make {n:C} the home note and these frets become **box 1 of {n:C} major pentatonic**, with its root on string 6 at fret 8. Same notes, same shape: only the root changes.',
      figure: {
        kind: 'fretboard',
        frets: [6, 11],
        root: 'C',
        labels: 'degree',
        dots: boxDots(BOX_2, { degrees: IN_C_MAJOR, home: 'C' }),
        caption: 'Box 2 of {n:A} minor, as {n:C} major pentatonic: degrees in {n:C}.',
      },
    },
    {
      type: 'true-false',
      statement: '{n:C} major pentatonic uses the same frets as {n:A} minor pentatonic.',
      answer: true,
      explain: 'They have the same five notes, C D E G A, so every box is the same. Only the home note moves, from {n:A} to {n:C}.',
      fact: 'boxes-c-major-same-frets',
    },
    {
      type: 'listen-choice',
      prompt: 'The same box is played over two different {t:drone|drones}. Which one sounds major?',
      sound: { kind: 'tab', tempo: 120, notes: [...OVER_A_DRONE, { rest: true, duration: 'h' }, ...OVER_C_DRONE] },
      options: [{ text: 'The first' }, { text: 'The second', correct: true }],
      shuffle: false,
      explain: 'The second struck {n:C} under every note, so {n:C} was home: {n:C} major pentatonic, bright and open. Over the {n:A} drone the same frets sounded minor.',
    },
    {
      type: 'fretboard-find',
      prompt: 'In the {n:C} major pentatonic box at frets 7 to 10, tap every {n:C}: its roots.',
      find: { note: 'C' },
      mode: 'all',
      octave: 'any',
      frets: [7, 10],
      explain: 'String 6 at fret 8, string 4 at fret 10 and string 1 at fret 8. In {n:A} minor these were the {d:b3}s; in {n:C} major they are home.',
      fact: 'boxes-c-major-box-1',
    },
    {
      type: 'card',
      title: 'Every box, two names',
      body: 'This works for all five shapes. A major pentatonic uses the boxes of its {t:relative-minor|relative minor}, the minor pentatonic a minor 3rd below. {n:G} major pentatonic uses the boxes of {n:E} minor pentatonic, and box 1 of the major is always box 2 of the minor.',
      figure: { kind: 'fretboard', frets: [2, 5], derive: { scale: 'major-pentatonic', tonic: 'G' }, caption: 'Box 1 of {n:G} major pentatonic: box 2 of {n:E} minor, root on fret 3.' },
    },
    {
      type: 'choice',
      prompt: '{n:G} major pentatonic uses the boxes of which minor pentatonic?',
      options: [
        { text: '{n:E} minor pentatonic', correct: true },
        { text: '{n:G} minor pentatonic', why: 'Same root, different notes: {n:G} minor pentatonic has {n:Bb} and {n:F}.' },
        { text: '{n:B} minor pentatonic', why: '{n:B} is a major 3rd above {n:G}. The relative minor is a minor 3rd below.' },
        { text: '{n:D} minor pentatonic', why: '{n:D} is a 5th above {n:G}. Count three frets down from {n:G} instead.' },
      ],
      explain: 'Three frets below {n:G} is {n:E}. {n:G} major pentatonic, G A B D E, has the same notes and boxes as {n:E} minor pentatonic, E G A B D.',
      fact: 'boxes-major-same-shapes',
    },
    {
      type: 'choice',
      prompt: 'Box 1 of {n:C} major pentatonic has its root on string 6 at fret 8. It has exactly the frets of which {n:A} minor box?',
      options: [
        { text: 'Box 2', correct: true },
        { text: 'Box 1', why: 'Box 1 of {n:A} minor starts at fret 5, on {n:A}. Its {n:C} on string 6 is its top note.' },
        { text: 'Box 3', why: 'Box 3 starts at fret 10, on {n:D}.' },
        { text: 'Box 5', why: 'Box 5 starts on {n:G}, at fret 15 or fret 3.' },
      ],
      shuffle: false,
      explain: 'Box 2 of {n:A} minor starts on {n:C} at fret 8, the root of {n:C} major. Same frets, frets 7 to 10.',
      fact: 'boxes-c-major-box-1',
    },
    { generate: 'neck-tones', params: { what: 'scale', scales: ['major-pentatonic', 'minor-pentatonic'], tonics: ['C', 'G', 'A', 'D', 'E'], span: 4, strings: [6, 5, 4] } },
    { generate: 'scale-ear', params: { scales: ['major-pentatonic', 'minor-pentatonic'] } },
  ],
  facts: [
    {
      id: 'boxes-major-same-shapes',
      front: 'Which boxes does a major pentatonic use?',
      back: 'The same five shapes as its relative minor pentatonic, a minor 3rd below. Only the root changes.',
      ask: {
        type: 'choice',
        prompt: '{n:D} major pentatonic uses the boxes of which minor pentatonic?',
        options: [
          { text: '{n:B} minor pentatonic', correct: true },
          { text: '{n:D} minor pentatonic', why: 'Same root, different notes.' },
          { text: '{n:F#} minor pentatonic', why: '{n:F#} is a major 3rd above {n:D}. Count three frets down instead.' },
          { text: '{n:A} minor pentatonic', why: 'That one shares its boxes with {n:C} major.' },
        ],
        explain: 'Three frets below {n:D} is {n:B}. {n:D} major pentatonic, {n:D} {n:E} {n:F#} {n:A} {n:B}, has the notes and boxes of {n:B} minor pentatonic.',
      },
    },
    {
      id: 'boxes-c-major-same-frets',
      front: 'Which frets does C major pentatonic use?',
      back: 'The same frets as {n:A} minor pentatonic, with {n:C} as home.',
      ask: {
        type: 'true-false',
        statement: '{n:C} major pentatonic uses the same frets as {n:A} minor pentatonic, with {n:C} as home.',
        answer: true,
        explain: 'Both scales are C D E G A: the same frets everywhere on the neck.',
      },
    },
    {
      id: 'boxes-c-major-box-1',
      front: 'Box 1 of C major pentatonic has its root on string 6 at fret 8. Which A minor box has the same frets?',
      back: 'Box 2 of {n:A} minor pentatonic, frets 7 to 10.',
      ask: {
        type: 'choice',
        prompt: 'Box 1 of {n:C} major pentatonic, root on string 6 at fret 8, has the frets of which {n:A} minor box?',
        options: [{ text: 'Box 2', correct: true }, { text: 'Box 1' }, { text: 'Box 3' }, { text: 'Box 4' }],
        shuffle: false,
        explain: 'Box 2 of {n:A} minor starts on {n:C} at fret 8: the same frets, 7 to 10.',
      },
    },
  ],
};

const bendsThatLand: Lesson = {
  id: 'bends-that-land',
  title: 'Bends that land on scale notes',
  teaches: 'A bend should land exactly on a scale note, usually a whole step up; check it against the fretted target.',
  minutes: 3,
  skill: `theory:${U}:bends-that-land`,
  steps: [
    {
      type: 'card',
      title: 'Aim for a note',
      body: 'A {t:bend} raises a note by pushing the string sideways. A good bend **lands on a scale note**: usually a whole step up, the pitch of two frets higher, sometimes a half step, one fret. In box 1, bend string 3 at fret 7 ({n:D}) until it sounds like fret 9 ({n:E}).',
      figure: {
        kind: 'fretboard',
        frets: [4, 10],
        dots: [dot(3, 7, 'D', { label: 'D' }), dot(3, 9, 'E', { role: 'target' }), dot(2, 8, 'G', { label: 'G' }), dot(2, 10, 'A', { role: 'target' })],
        caption: 'Bend from each plain dot to the pitch of the ringed one: 7 to 9, and 8 to 10.',
      },
    },
    {
      type: 'choice',
      prompt: 'You bend string 3 at fret 7, {n:D}, up a whole step. Which note should you reach?',
      options: [
        { text: '{n:E}, the {d:5}', correct: true },
        { text: '{n:Eb}, the {d:b5}', why: 'That is only a half step: a bend that stopped short.' },
        { text: '{n:F}', why: 'That is three half steps up: an overbend, and not a note of the scale.' },
        { text: '{n:G}, the {d:b7}', why: '{n:G} is five half steps up: far too far for a bend.' },
      ],
      explain: 'A whole step is two frets: fret 7 bent to the pitch of fret 9, {n:D} to {n:E}. {n:E} is the {d:5} of {n:A}, a strong note to land on.',
      fact: 'boxes-bend-d-to-e',
    },
    {
      type: 'card',
      title: 'Check it against the target',
      body: 'To know where to stop, **play the target first**: string 3, fret 9. Play it now and keep its sound in your ear. Then pick fret 7 and bend until it matches. Bend with your third finger, and put your first and second fingers on the string behind it to push too: three fingers are stronger than one.',
      tip: 'On strings 1 to 3, push the string up toward the thicker strings. If the two pitches wobble against each other, you are not there yet.',
    },
    {
      type: 'listen-choice',
      prompt: 'First the target, fret 9. Then where the bend arrived. Was the bend in tune, flat or sharp?',
      sound: { kind: 'tab', tempo: 70, notes: [note(3, 9, 'h'), note(3, 8, 'h')] },
      options: [{ text: 'In tune' }, { text: 'Flat: it stopped short', correct: true }, { text: 'Sharp: it went too far' }],
      shuffle: false,
      explain: 'The second note was lower than the target: the bend stopped a half step short, at the pitch of fret 8. Push a little further, until the two sound the same.',
    },
    {
      type: 'play-note',
      prompt: 'You have heard the target, fret 9. Now pick string 3 at fret 7 and bend it up a whole step until it sounds like fret 9. Hold it there.',
      note: 'E4',
      octave: 'exact',
      figure: { kind: 'fretboard', frets: [4, 10], strings: [3], dots: [dot(3, 7, 'D', { label: 'D' }), dot(3, 9, 'E', { role: 'target' })], caption: 'Bend fret 7 up to the pitch of fret 9: {n:E}.' },
      explain: 'In tune, the bend sounds exactly like fret 9: {n:E}, the {d:5}. If it sounds low, push further; if it wobbles above the target, ease off.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Your bend starts on string 3, fret 7, and goes up a whole step. On string 3, tap the fret it has to sound like.',
        find: { note: 'E4' },
        mode: 'one',
        octave: 'exact',
        frets: [5, 10],
        strings: [3],
        explain: 'Two frets up: fret 9, {n:E}. Play it first, then bend fret 7 to match.',
      },
    },
    {
      type: 'choice',
      prompt: 'You bend the {d:b7} of {n:A} minor pentatonic, {n:G} on string 2 at fret 8, up a whole step. Where do you land?',
      options: [
        { text: 'On the root, {n:A}', correct: true },
        { text: 'On {n:G#}', why: 'Only a half step, and {n:G#} is not in the scale: the bend would land on a sour note.' },
        { text: 'On the {d:b3}, {n:C}', why: '{n:C} is five half steps above {n:G}, a perfect 4th: far too far for a whole-step bend.' },
      ],
      explain: 'A whole step above {n:G} is {n:A}: string 2, fret 8 bent to the pitch of fret 10. Bending up to the root is one of the most satisfying sounds in a solo.',
      fact: 'boxes-bend-g-to-a',
    },
    {
      type: 'true-false',
      statement: 'To check a bend, play the target fret first and then bend until the two sound the same.',
      answer: true,
      explain: 'The fretted target is your tuning fork: play string 3, fret 9 for {n:E}, then bend fret 7 until it matches.',
      fact: 'boxes-bend-check',
    },
    {
      type: 'fretboard-find',
      prompt: 'You bend string 2 at fret 8, {n:G}, up a whole step. On string 2, tap the fret it must match.',
      find: { note: 'A4' },
      mode: 'one',
      octave: 'exact',
      frets: [5, 12],
      strings: [2],
      explain: 'Fret 10: {n:A}, the root, two frets above {n:G}.',
      fact: 'boxes-bend-g-to-a',
    },
    {
      type: 'choice',
      prompt: 'Which whole-step bend in {n:A} minor pentatonic lands on a note of the scale?',
      options: [
        { text: '{n:D} up to {n:E}', correct: true },
        { text: '{n:A} up to {n:B}', why: '{n:B} is not in {n:A} minor pentatonic: from the root, the next note up is {n:C}.' },
        { text: '{n:E} up to {n:F#}', why: '{n:F#} is not in the scale: from {n:E}, the next note up is {n:G}.' },
      ],
      explain: 'Whole-step bends that land in the scale start on {n:C}, {n:D} or {n:G}: to {n:D}, {n:E} and {n:A}. From {n:A} or {n:E} the next scale note is a minor 3rd away.',
      fact: 'boxes-bend-in-tune',
    },
  ],
  facts: [
    {
      id: 'boxes-bend-in-tune',
      front: 'Where should a bend land?',
      back: 'Exactly on a scale note: usually a whole step up (the pitch of two frets higher), or a half step (one fret).',
    },
    {
      id: 'boxes-bend-d-to-e',
      front: 'In box 1 of A minor pentatonic, you bend string 3 at fret 7 up a whole step. Which note do you reach?',
      back: 'From {n:D} to {n:E}, the {d:5}: the pitch of string 3, fret 9.',
      ask: {
        type: 'choice',
        prompt: 'In box 1, you bend string 3 at fret 7, {n:D}, up a whole step. Which note do you reach?',
        options: [{ text: '{n:E}, the {d:5}', correct: true }, { text: '{n:Eb}, the {d:b5}' }, { text: '{n:G}, the {d:b7}' }],
        explain: 'Two frets up from fret 7 is fret 9: {n:E}.',
      },
    },
    {
      id: 'boxes-bend-g-to-a',
      front: 'Bend string 2, fret 8 (G) up a whole step. Which note do you reach?',
      back: '{n:A}, the root: the pitch of string 2, fret 10.',
      ask: {
        type: 'fretboard-find',
        prompt: 'You bend string 2 at fret 8, {n:G}, up a whole step. On string 2, tap the fret it must match.',
        find: { note: 'A4' },
        mode: 'one',
        octave: 'exact',
        frets: [5, 12],
        strings: [2],
        explain: 'Fret 10: {n:A}, the root.',
      },
    },
    {
      id: 'boxes-bend-check',
      front: 'How do you check that a bend is in tune?',
      back: 'Play the target fret first (string 3, fret 9 for {n:E}), then bend until the bent note matches it.',
    },
  ],
};

/** Unit 20 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'The pentatonic in five boxes',
  theme: 'scales',
  description: 'All five boxes of the minor pentatonic, how they link up the neck, the major pentatonic in the same shapes, and in-tune bends.',
  lessons: [pentatonicFormulas, box2, box3, boxes4And5, connectingTheBoxes, majorPentatonicBoxes, bendsThatLand],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      {
        type: 'fill-blanks',
        prompt: 'Complete the minor pentatonic formula.',
        text: '{d:1}  ___  {d:4}  {d:5}  ___',
        blanks: ['{d:b3}', '{d:b7}'],
        bank: ['{d:3}', '{d:7}'],
        explain: 'Minor pentatonic is {d:1} {d:b3} {d:4} {d:5} {d:b7}: natural minor without its {d:2} and {d:b6}.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Complete the major pentatonic formula.',
        text: '{d:1}  {d:2}  ___  {d:5}  ___',
        blanks: ['{d:3}', '{d:6}'],
        bank: ['{d:4}', '{d:7}'],
        explain: 'Major pentatonic is {d:1} {d:2} {d:3} {d:5} {d:6}: the major scale without its {d:4} and {d:7}.',
      },
      {
        type: 'choice',
        prompt: 'Which major pentatonic has the same notes as {n:A} minor pentatonic?',
        options: [{ text: '{n:C} major pentatonic', correct: true }, { text: '{n:A} major pentatonic' }, { text: '{n:E} major pentatonic' }, { text: '{n:F} major pentatonic' }],
        explain: 'A minor 3rd above {n:A} is {n:C}: {n:C} major pentatonic, C D E G A, has the same notes.',
      },
      {
        type: 'match-pairs',
        prompt: 'Match each box of {n:A} minor pentatonic with its first note on string 6.',
        pairs: [
          { left: 'Box 1', right: '{n:A}, fret 5' },
          { left: 'Box 2', right: '{n:C}, fret 8' },
          { left: 'Box 3', right: '{n:D}, fret 10' },
          { left: 'Box 4', right: '{n:E}, fret 12' },
          { left: 'Box 5', right: '{n:G}, fret 15' },
        ],
        explain: 'Each box starts on the next note of the scale, A C D E G, climbing string 6.',
      },
      {
        type: 'fretboard-find',
        prompt: 'Tap the two roots, the {n:A}s, in box 2 (frets 7 to 10).',
        find: { note: 'A' },
        mode: 'all',
        octave: 'any',
        frets: [7, 10],
        explain: 'String 4 at fret 7 and string 2 at fret 10.',
      },
      {
        type: 'fretboard-find',
        prompt: 'Tap every note of box 3: {n:A} minor pentatonic between frets 9 and 13.',
        find: { scale: 'minor-pentatonic', tonic: 'A' },
        mode: 'all',
        octave: 'any',
        frets: [9, 13],
        explain: 'Frets 10 and 12 on strings 6, 5, 4 and 1; 9 and 12 on string 3; 10 and 13 on string 2.',
      },
      {
        type: 'choice',
        prompt: 'Which box of {n:A} minor pentatonic is in open position?',
        options: [{ text: 'Box 4', correct: true }, { text: 'Box 1' }, { text: 'Box 2' }, { text: 'Box 5' }],
        shuffle: false,
        explain: 'Box 4, at frets 12 to 15, drops twelve frets to open position.',
      },
      {
        type: 'fretboard-find',
        prompt: 'Tap every note of box 5 low on the neck: {n:A} minor pentatonic between frets 2 and 5.',
        find: { scale: 'minor-pentatonic', tonic: 'A' },
        mode: 'all',
        octave: 'any',
        frets: [2, 5],
        explain: 'Frets 3 and 5 on strings 6, 5, 2 and 1; 2 and 5 on strings 4 and 3.',
      },
      {
        type: 'fretboard-find',
        prompt: 'Box 3 ends where box 4 begins. Between frets 11 and 13, tap the six notes they share.',
        find: { scale: 'minor-pentatonic', tonic: 'A' },
        mode: 'all',
        octave: 'any',
        frets: [11, 13],
        explain: 'Fret 12 on strings 6, 5, 4, 3 and 1, and fret 13 on string 2.',
      },
      {
        type: 'order',
        prompt: 'You start in box 4 and climb the neck. Put the boxes you play through in order.',
        tiles: ['Box 4', 'Box 5', 'Box 1', 'Box 2'],
        explain: 'After box 5 comes box 1 again, twelve frets higher, then box 2.',
      },
      {
        type: 'choice',
        prompt: 'Box 1 of {n:C} major pentatonic, root on string 6 at fret 8, has the frets of which {n:A} minor box?',
        options: [{ text: 'Box 2', correct: true }, { text: 'Box 1' }, { text: 'Box 3' }, { text: 'Box 5' }],
        shuffle: false,
        explain: 'Box 2 of {n:A} minor starts on {n:C} at fret 8. Only the home note differs.',
      },
      {
        type: 'choice',
        prompt: '{n:G} major pentatonic uses the boxes of which minor pentatonic?',
        options: [{ text: '{n:E} minor pentatonic', correct: true }, { text: '{n:G} minor pentatonic' }, { text: '{n:B} minor pentatonic' }, { text: '{n:D} minor pentatonic' }],
        explain: 'Its relative minor, a minor 3rd below {n:G}: {n:E}.',
      },
      {
        type: 'choice',
        prompt: 'In box 1, you bend string 3 at fret 7, {n:D}, up a whole step. Which degree of {n:A} do you reach?',
        options: [{ text: 'The {d:5}, {n:E}', correct: true }, { text: 'The {d:b5}, {n:Eb}' }, { text: 'The {d:b7}, {n:G}' }],
        explain: 'Two frets up from fret 7 is the pitch of fret 9: {n:E}, the {d:5}.',
      },
      {
        type: 'fretboard-find',
        prompt: 'You bend string 2 at fret 8, {n:G}, up a whole step. On string 2, tap the fret it must match.',
        find: { note: 'A4' },
        mode: 'one',
        octave: 'exact',
        frets: [5, 12],
        strings: [2],
        explain: 'Fret 10: {n:A}, the root.',
      },
      { generate: 'scale-notes', params: { scales: ['minor-pentatonic', 'major-pentatonic'], tonics: ['A', 'E', 'D', 'G', 'C'], form: 'order' } },
    ],
  },
};

export default unit;
