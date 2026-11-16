/**
 * Theory Path, unit 19: CAGED, five shapes, one neck. Written from the syllabus entries in
 * `src/content/plan/theory-path.json` (unit `caged`), one lesson per entry, in order: each lesson
 * opens with the "on the guitar" picture, asks the planned exercises, ends with the planned drills,
 * and turns every planned fact into a review card.
 *
 * Every shape, root, fret and scale position quoted here is cross-checked against the engines in
 * `caged.test.ts` (the CAGED positions against `scalePatterns`, the shapes against `buildVoicing`).
 *
 * Where the syllabus asks for more than the engine can draw or grade, the lesson keeps the idea
 * and fits the limit (each change is in the unit's report):
 * - fretboard figures span at most 13 frets, so "frets 0 to 15" figures show frets 0 to 12;
 * - there is no "outline" on a fretboard figure, so shapes are shown one at a time (chord boxes,
 *   dots) and overlaps as ringed target dots;
 * - a play-phrase holds at most 16 notes, so the E-shape position is played up two octaves
 *   (15 notes) and, in the next lesson, back down, rather than up and down in one phrase;
 * - "Which shape plays A with its root on string 6 at fret 5?" has two right answers (the E shape
 *   and the G shape both root there), so the question names the barre at fret 5.
 */
import type { FretDot, Lesson, TabNote, Unit } from '@/lessons';

const U = 'caged';

/** A fretboard dot with its note claimed (checked by the validator). */
const at = (string: number, fret: number, note: string, role?: FretDot['role'], finger?: FretDot['finger']): FretDot => ({
  string, fret, note, ...(role ? { role } : {}), ...(finger ? { finger } : {}),
});

/** G major in the E-shape position (second position), as `scalePatterns('G', 'major')` lays it out. */
const G_E_POSITION: Array<[number, number, string, 1 | 2 | 3 | 4]> = [
  [6, 2, 'F#', 1], [6, 3, 'G', 2], [6, 5, 'A', 4],
  [5, 2, 'B', 1], [5, 3, 'C', 2], [5, 5, 'D', 4],
  [4, 2, 'E', 1], [4, 4, 'F#', 3], [4, 5, 'G', 4],
  [3, 2, 'A', 1], [3, 4, 'B', 3], [3, 5, 'C', 4],
  [2, 3, 'D', 2], [2, 5, 'E', 4],
  [1, 2, 'F#', 1], [1, 3, 'G', 2], [1, 5, 'A', 4],
];
/** That position as a climb, lowest G (string 6, fret 3) to the G two octaves up (string 1, fret 3). */
const G_E_CLIMB: TabNote[] = G_E_POSITION.filter(([s, f]) => !(s === 6 && f === 2) && !(s === 1 && f === 5)).map(([string, fret]) => ({ string, fret, duration: 'e' }));
/** The degree of each G major note, for the chord-tone colours. */
const G_DEGREE: Record<string, string> = { G: '1', A: '2', B: '3', C: '4', D: '5', E: '6', 'F#': '7' };
const G_ROLE: Record<string, FretDot['role']> = { G: 'root', B: 'third', D: 'fifth' };

/** Pick a shape string by string, low to high (frets low to high, null = not played). */
const arpeggio = (frets: Array<number | null>, last: string = 'q'): TabNote[] => {
  const played = frets.map((f, i) => ({ string: 6 - i, fret: f })).filter((n): n is { string: number; fret: number } => n.fret !== null);
  return played.map((n, i) => ({ ...n, duration: i === played.length - 1 ? last : 'e' }));
};

const fiveOpenShapes: Lesson = {
  id: 'five-open-shapes',
  title: 'Five shapes: C, A, G, E, D',
  teaches: 'The open C, A, G, E and D chords are five movable shapes that, linked together, cover the neck.',
  minutes: 3,
  skill: `theory:${U}:five-open-shapes`,
  steps: [
    {
      type: 'card',
      title: 'Five chords you know',
      body: 'You already play five open major chords: {c:C}, {c:A}, {c:G}, {c:E} and {c:D}. The {t:caged|CAGED system} treats each one as a **shape**: a pattern of fingers around its roots. Say them in that order and they spell CAGED.',
      figure: { kind: 'chord', symbol: 'C', frets: 'x32010', caption: 'The C shape: roots on string 5 (fret 3) and string 2 (fret 1).' },
    },
    {
      type: 'card',
      title: 'Every shape has its roots',
      body: 'Each shape keeps its roots in fixed places. The G shape has them on strings 6, 3 and 1; the E shape on strings 6, 4 and 1; the A shape on strings 5 and 3; the D shape on strings 4 and 2. Know where a shape keeps its roots and you can build it on any root.',
      figure: { kind: 'chord', symbol: 'G', frets: '320003', caption: 'The G shape: roots on strings 6, 3 and 1.' },
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'D',
      frets: 'xx0232',
      accept: 'any-voicing',
      prompt: 'Build the D shape: open {c:D}, with its lowest root on the open 4th string.',
      hint: 'Strings 6 and 5 are not played. Fingers on fret 2 of strings 3 and 1, fret 3 of string 2.',
      explain: 'Open {c:D} is xx0232: the open {n:D} on string 4 is the lowest root, and {n:D} on string 2 at fret 3 is the root again, an octave up.',
    },
    {
      type: 'choice',
      prompt: 'On which string is the lowest root of the A shape?',
      figure: { kind: 'chord', symbol: 'A', frets: 'x02220' },
      options: [
        { text: 'String 5', correct: true },
        { text: 'String 6', why: 'String 6 is not played in the A shape: x02220.' },
        { text: 'String 4', why: 'String 4 at fret 2 is {n:E}, the 5th of {c:A}.' },
        { text: 'String 3', why: 'String 3 at fret 2 is {n:A}, but it is the higher root. The lowest is the open 5th string.' },
      ],
      shuffle: false,
      explain: 'Open {c:A} is x02220. Its lowest note, the open 5th string, is {n:A}: the root. The A shape always has its lowest root on string 5.',
      fact: 'caged-five-shapes',
    },
    {
      type: 'order',
      prompt: 'Put the five shapes in CAGED order.',
      tiles: ['C shape', 'A shape', 'G shape', 'E shape', 'D shape'],
      explain: 'C, A, G, E, D: the letters of the word. It is also the order in which the shapes follow each other up the neck.',
      fact: 'caged-word-order',
    },
    {
      type: 'card',
      title: 'Shapes that move',
      body: 'An open shape leans on the {t:nut}: its open strings ring from there. Put a finger or a {t:barre} where the nut was and the whole shape is free to slide up the neck. It keeps its fingering and plays the same kind of chord on a new root.',
      figure: { kind: 'chord', symbol: 'E', frets: '022100', caption: 'The E shape: roots on strings 6, 4 and 1.' },
    },
    {
      type: 'true-false',
      statement: 'The C shape can only ever be played as the open {c:C} chord.',
      answer: false,
      explain: 'Replace its open strings with a barre and the C shape moves like the others. Two frets up it plays {c:D}, five frets up {c:F}.',
      fact: 'caged-movable',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each shape with the string of its lowest root.',
      pairs: [
        { left: 'E shape', right: 'String 6' },
        { left: 'A shape', right: 'String 5' },
        { left: 'D shape', right: 'String 4' },
      ],
      explain: 'Open {c:E} roots on the open 6th string, open {c:A} on the open 5th, open {c:D} on the open 4th. That stays true wherever the shapes move.',
      fact: 'caged-five-shapes',
    },
    { generate: 'chord-shape', params: { chords: ['E', 'A', 'D', 'C', 'G'] } },
  ],
  facts: [
    {
      id: 'caged-five-shapes',
      front: 'Which five open chords give the CAGED system its shapes?',
      back: 'The open major chords {c:C}, {c:A}, {c:G}, {c:E} and {c:D}.',
    },
    {
      id: 'caged-movable',
      front: 'How can an open chord shape be moved up the neck?',
      back: 'Replace its open strings with a finger or a barre. Then the whole shape slides to any fret and plays a chord on a new root.',
      ask: {
        type: 'true-false',
        statement: 'Put a barre where the nut was and an open chord shape can slide to any fret.',
        answer: true,
        explain: 'The barre stops the strings the open shape left open, so the shape no longer needs the nut.',
      },
    },
    {
      id: 'caged-word-order',
      front: 'What does the word CAGED tell you about the five shapes?',
      back: 'The order in which they follow each other up the neck: C, A, G, E, D, then C again.',
      ask: {
        type: 'order',
        prompt: 'Put the five shapes in CAGED order.',
        tiles: ['C shape', 'A shape', 'G shape', 'E shape', 'D shape'],
        explain: 'C, A, G, E, D: the order the shapes follow up the neck.',
      },
    },
  ],
};

const theBarre: Lesson = {
  id: 'the-barre',
  title: 'The barre replaces the nut',
  teaches: 'A barre is one finger pressing several strings at one fret, doing the job of the nut in a moved open shape.',
  minutes: 3,
  skill: `theory:${U}:the-barre`,
  steps: [
    {
      type: 'card',
      title: 'The open E, moved up',
      body: 'Play open {c:E}: 022100. Three fingers press frets, and three strings ring open from the {t:nut}. Now slide that shape up one fret. The fingers can move, but the open strings cannot: something has to stop them at fret 1.',
      figure: { kind: 'chord', symbol: 'E', frets: '022100', caption: 'Open {c:E}: strings 6, 2 and 1 ring open from the nut.' },
    },
    {
      type: 'card',
      title: 'One finger for the nut',
      body: 'That something is a {t:barre}: lay your first finger flat across all six strings at fret 1, and play the E shape with your other three fingers, one fret higher. The barre does the nut\'s job. The result, 133211, is {c:F}: a {t:barre-chord|barre chord}.',
      figure: { kind: 'chord', symbol: 'F', frets: '133211', caption: 'The E shape at fret 1: {c:F}, with the barre in place of the nut.' },
    },
    {
      type: 'true-false',
      statement: 'In a moved open shape, the barre does the job of the nut.',
      answer: true,
      explain: 'The nut stops the open strings of an open chord. Move the shape up and the barre stops those same strings at its new fret.',
      fact: 'caged-barre-is-the-nut',
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'F',
      frets: '133211',
      accept: 'this-shape',
      prompt: 'Build {c:F} as the E shape with a barre at fret 1.',
      hint: 'Fret 1 on every string for the barre; then the E shape one fret up: frets 3, 3, 2 on strings 5, 4, 3.',
      explain: '133211: the barre covers fret 1, and the E shape sits on top, one fret higher than open {c:E}.',
    },
    {
      type: 'choice',
      prompt: 'Which finger usually plays the barre?',
      options: [
        { text: 'The first finger, the index', correct: true },
        { text: 'The thumb', why: 'The thumb stays behind the neck and pushes against the barre.' },
        { text: 'The little finger', why: 'The little finger is the weakest; it usually plays one note of the shape.' },
        { text: 'The ring finger', why: 'The ring finger sometimes barres a few strings, but the full barre is the index.' },
      ],
      shuffle: false,
      explain: 'The first finger lies flat across the strings, leaving the other three free to play the shape above it.',
      fact: 'caged-barre-meaning',
    },
    {
      type: 'card',
      title: 'Make every string ring',
      body: 'Roll the first finger slightly so its bony outer edge presses, close behind the fret wire. Keep the thumb low behind the neck. Then pick the strings one at a time, 6 to 1. A string that buzzes or thuds needs a little more pressure, or the finger nearer the fret.',
      figure: { kind: 'tab', tempo: 70, notes: arpeggio([1, 3, 3, 2, 1, 1], 'h'), caption: '{c:F} picked string by string: each note should ring clearly.' },
      tip: 'Barre chords tire the hand at first. Rest often; strength comes in a few weeks.',
    },
    {
      type: 'play-chord',
      prompt: 'Play {c:F} (133211). Strum it, then pick each string to check it rings.',
      chord: 'F',
      frets: '133211',
      explain: 'All six strings should ring. If one buzzes, press the barre closer to the fret and roll the finger onto its harder edge.',
      alternative: {
        type: 'choice',
        prompt: 'You pick each string of your {c:F} barre, and string 2 buzzes. What do you try first?',
        options: [
          { text: 'Move the barre closer to the fret wire', correct: true },
          { text: 'Pick that string harder', why: 'A harder pick makes the buzz louder. Fix the pressure on the fret instead.' },
          { text: 'Press with the soft middle of the finger', why: 'The soft pad sinks between strings. The bony edge presses more evenly.' },
          { text: 'Lift the thumb off the neck', why: 'The thumb behind the neck helps the barre press.' },
        ],
        explain: 'Close behind the fret, a string needs the least pressure to ring. Then roll the finger onto its bony edge so no crease falls on a string.',
      },
      fact: 'caged-barre-technique',
    },
    {
      type: 'choice',
      prompt: 'In the {c:F} barre, 133211, which strings sound the barre itself?',
      options: [
        { text: 'Strings 6, 2 and 1', correct: true },
        { text: 'All six strings', why: 'It lies across all six, but on strings 5, 4 and 3 other fingers press higher frets.' },
        { text: 'Strings 5, 4 and 3', why: 'Those play frets 3, 3 and 2, pressed by the other fingers.' },
        { text: 'Only string 6', why: 'Strings 2 and 1 also sound fret 1: 133211.' },
      ],
      explain: 'The strings at fret 1, 6, 2 and 1, are exactly the strings open {c:E} leaves open. The barre stops them where the nut would.',
      fact: 'caged-barre-is-the-nut',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each part of a good barre with what it does.',
      pairs: [
        { left: 'First finger', right: 'Lies flat at one fret' },
        { left: 'Thumb', right: 'Stays behind the neck' },
        { left: 'Other fingers', right: 'Play the shape above' },
      ],
      explain: 'The first finger replaces the nut, the thumb gives it something to press against, and the other three fingers play the moved shape.',
      fact: 'caged-barre-technique',
    },
  ],
  facts: [
    {
      id: 'caged-barre-meaning',
      front: 'What is a barre?',
      back: 'One finger, usually the first, pressing several strings at the same fret.',
    },
    {
      id: 'caged-barre-is-the-nut',
      front: 'What job does the barre do in a moved open shape?',
      back: 'The nut\'s job: it stops the strings the open shape left open.',
      ask: {
        type: 'choice',
        prompt: 'In a moved open shape, what does the barre replace?',
        options: [
          { text: 'The nut', correct: true },
          { text: 'The bridge', why: 'The bridge stays where it is; the barre takes the place of the nut.' },
          { text: 'The thumb', why: 'The thumb stays behind the neck.' },
        ],
        shuffle: false,
        explain: 'Open chords ring their open strings from the nut. When the shape moves up, the barre stops those strings instead.',
      },
    },
    {
      id: 'caged-barre-technique',
      front: 'How do you get a barre to ring clearly?',
      back: 'Press with the bony side of the first finger, close behind the fret, thumb behind the neck. Then pick each string to check it rings.',
    },
  ],
};

const eShapeBarre: Lesson = {
  id: 'e-shape-barre',
  title: 'E-shape barre chords',
  teaches: 'The E shape moved up with a barre gives a major or minor chord named after its root on string 6.',
  minutes: 4,
  skill: `theory:${U}:e-shape-barre`,
  steps: [
    {
      type: 'card',
      title: 'Named by string 6',
      body: 'Slide the barred E shape along the neck and the chord takes the name of the barred note on string 6, its root. You know those notes: {n:F} at fret 1, {n:G} at 3, {n:A} at 5, {n:B} at 7, {n:C} at 8, {n:D} at 10.',
      figure: {
        kind: 'fretboard',
        frets: [0, 12],
        dots: [at(6, 1, 'F'), at(6, 3, 'G'), at(6, 5, 'A'), at(6, 7, 'B'), at(6, 8, 'C'), at(6, 10, 'D'), at(6, 12, 'E')],
        caption: 'The natural notes on string 6: the roots of E-shape barre chords.',
      },
    },
    {
      type: 'card',
      title: 'Same shape, new chord',
      body: 'Barre at fret 1 and the E shape is {c:F}, 133211. Move it to fret 3 and it is {c:G}, 355433. At fret 5 it is {c:A}, 577655. The fingers never change; only the fret does, and the root on string 6 names the chord.',
      figure: { kind: 'chord', symbol: 'G', frets: '355433', caption: 'The E shape barred at fret 3: {c:G}, root {n:G} on string 6.' },
    },
    {
      type: 'choice',
      prompt: 'An E-shape barre chord at fret 8 is which chord?',
      options: [
        { text: '{c:C}', correct: true },
        { text: '{c:B}', why: '{n:B} is at fret 7 on string 6.' },
        { text: '{c:D}', why: '{n:D} is at fret 10 on string 6.' },
        { text: '{c:Bb}', why: '{n:Bb} is at fret 6 on string 6.' },
      ],
      explain: 'String 6 at fret 8 is {n:C}, so the E shape barred there is {c:C}: 8-10-10-9-8-8.',
      fact: 'caged-e-shape-roots',
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'A',
      frets: '577655',
      accept: 'this-shape',
      prompt: 'Build {c:A} as an E-shape barre chord.',
      hint: '{n:A} is at fret 5 on string 6: barre there.',
      explain: 'Barre fret 5, then the E shape above it: 577655. The barred {n:A} on string 6 is the root.',
      fact: 'caged-e-shape-barre',
    },
    {
      type: 'card',
      title: 'Minor: lift one finger',
      body: 'In the E shape, the finger on string 3 plays the 3rd. Lift it and the barre beneath sounds one fret lower: the minor 3rd. {c:F} 133211 becomes {c:Fm} 133111. It is the open {c:Em} shape, moved up, and it works at every fret.',
      figure: { kind: 'chord', symbol: 'Fm', frets: '133111', caption: 'The E-minor shape at fret 1: {c:Fm}.' },
    },
    {
      type: 'true-false',
      statement: 'To make an E-shape barre chord minor, you lift the finger on string 3.',
      answer: true,
      explain: 'String 3 holds the 3rd. Lift the finger and the barre plays the note a fret lower, the minor 3rd: 133211 ({c:F}) becomes 133111 ({c:Fm}).',
      fact: 'caged-e-minor-shape',
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'Gm',
      frets: '355333',
      accept: 'this-shape',
      prompt: 'Build {c:Gm} as an E-minor-shape barre chord.',
      hint: 'Root {n:G} on string 6 at fret 3; the E-minor shape has two fingers above the barre.',
      explain: '355333: the barre at fret 3 with fret 5 on strings 5 and 4. String 3 plays the barre, {n:Bb}, the minor 3rd of {c:Gm}.',
      fact: 'caged-e-minor-shape',
    },
    {
      type: 'listen-choice',
      prompt: 'An E-shape barre chord is strummed. Is it major or minor?',
      sound: { kind: 'chord', chord: 'Am', frets: '577555', style: 'strum' },
      options: [{ text: 'Major' }, { text: 'Minor', correct: true }],
      shuffle: false,
      explain: 'That was {c:Am}, 577555: the E-minor shape at fret 5. String 3 plays the barre, {n:C}, the minor 3rd.',
    },
    {
      type: 'type-answer',
      prompt: 'An E-minor-shape barre chord with the barre at fret 10. Which chord is it?',
      answer: { kind: 'chord', value: 'Dm', spelling: 'any' },
      input: 'keyboard',
      explain: 'String 6 at fret 10 is {n:D}, and the minor shape makes it {c:Dm}: 10-12-12-10-10-10.',
      fact: 'caged-e-shape-roots',
    },
    { generate: 'chord-shape', params: { chords: ['F', 'Fm', 'F#', 'F#m', 'Gm', 'Ab'] } },
    { generate: 'chord-quality-ear', params: { types: ['major', 'minor'] } },
  ],
  facts: [
    {
      id: 'caged-e-shape-barre',
      front: 'What is an E-shape barre chord?',
      back: 'The open {c:E} shape moved up the neck, with a first-finger barre across all six strings.',
    },
    {
      id: 'caged-e-shape-roots',
      front: 'How is an E-shape barre chord named?',
      back: 'By its root, the barred note on string 6: at fret 1 {c:F} (133211), at fret 3 {c:G} (355433), at fret 5 {c:A} (577655).',
      ask: {
        type: 'choice',
        prompt: 'An E-shape barre chord at fret 3 is which chord?',
        options: [
          { text: '{c:G}', correct: true },
          { text: '{c:F}', why: '{c:F} is at fret 1.' },
          { text: '{c:A}', why: '{c:A} is at fret 5.' },
          { text: '{c:C}', why: '{c:C} is at fret 8.' },
        ],
        explain: 'String 6 at fret 3 is {n:G}: the E shape there is {c:G}, 355433.',
      },
    },
    {
      id: 'caged-e-minor-shape',
      front: 'How does an E-shape barre chord become minor?',
      back: 'Lift the finger from string 3 so the barre plays the minor 3rd: {c:F} 133211 becomes {c:Fm} 133111.',
      ask: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'Fm',
        frets: '133111',
        accept: 'this-shape',
        prompt: 'Build {c:Fm} as an E-minor-shape barre chord.',
        explain: '133111: the {c:F} barre with the finger on string 3 lifted, so string 3 sounds {n:Ab}, the minor 3rd.',
      },
    },
  ],
};

const aShapeBarre: Lesson = {
  id: 'a-shape-barre',
  title: 'A-shape barre chords',
  teaches: 'The A shape moved up with a barre gives a major or minor chord named after its root on string 5.',
  minutes: 4,
  skill: `theory:${U}:a-shape-barre`,
  steps: [
    {
      type: 'card',
      title: 'Named by string 5',
      body: 'Open {c:A}, x02220, has its root on the open 5th string. Barre strings 5 to 1 at fret 1 and play the A shape above it: x13331 is {c:Bb}. Like the E shape, it takes its name from its root, now the barred note on **string 5**. String 6 stays silent.',
      figure: { kind: 'chord', symbol: 'Bb', frets: 'x13331', caption: 'The A shape barred at fret 1: {c:Bb}, root on string 5.' },
    },
    {
      type: 'card',
      title: 'Up the neck on string 5',
      body: 'At fret 2 the A shape is {c:B}, x24442. At fret 3 it is {c:C}, x35553. You know the notes on string 5: {n:C} at 3, {n:D} at 5, {n:E} at 7, {n:F} at 8, {n:G} at 10.',
      figure: { kind: 'chord', symbol: 'C', frets: 'x35553', caption: 'The A shape barred at fret 3: {c:C}.' },
      tip: 'Many players press strings 4, 3 and 2 with one flattened ring finger instead of three fingers.',
    },
    {
      type: 'choice',
      prompt: 'Where is the root of an A-shape barre chord?',
      options: [
        { text: 'Under the barre on string 5', correct: true },
        { text: 'Under the barre on string 6', why: 'That is the E shape. The A shape does not play string 6.' },
        { text: 'On string 1', why: 'String 1 plays the barre too, but in the A shape that note is the 5th.' },
      ],
      shuffle: false,
      explain: 'The open A shape has its root on the open 5th string, so the barred A shape has it under the barre on string 5.',
      fact: 'caged-a-shape-barre',
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'D',
      frets: 'x57775',
      accept: 'this-shape',
      prompt: 'Build {c:D} as an A-shape barre chord.',
      hint: '{n:D} is at fret 5 on string 5. Mute string 6.',
      explain: 'Barre strings 5 to 1 at fret 5, then fret 7 on strings 4, 3 and 2: x57775, root {n:D} on string 5.',
      fact: 'caged-a-shape-roots',
    },
    {
      type: 'card',
      title: 'The A-minor shape',
      body: 'Open {c:Am} is x02210. Move it up with a barre and you get minor chords rooted on string 5. At fret 2 it is {c:Bm}, x24432: the shape most guitarists use for {c:Bm}.',
      figure: { kind: 'chord', symbol: 'Bm', frets: 'x24432', caption: 'The A-minor shape at fret 2: {c:Bm}.' },
    },
    {
      type: 'choice',
      prompt: 'An A-minor-shape barre chord at fret 7 is which chord?',
      options: [
        { text: '{c:Em}', correct: true },
        { text: '{c:E}', why: 'Right root, but the minor shape makes it {c:Em}.' },
        { text: '{c:Dm}', why: '{c:Dm} is two frets lower, at fret 5.' },
        { text: '{c:Bm}', why: 'An E-minor shape at fret 7 would be {c:Bm}. On string 5, fret 7 is {n:E}.' },
      ],
      explain: 'String 5 at fret 7 is {n:E}, and the A-minor shape makes it {c:Em}: x79987.',
      fact: 'caged-a-minor-shape',
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'Cm',
      frets: 'x35543',
      accept: 'this-shape',
      prompt: 'Build {c:Cm} as an A-minor-shape barre chord.',
      hint: '{n:C} is at fret 3 on string 5. Mute string 6.',
      explain: 'x35543: the barre at fret 3, fret 5 on strings 4 and 3, fret 4 on string 2. String 2 plays {n:Eb}, the minor 3rd.',
      fact: 'caged-a-minor-shape',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each A-shape barre chord with its name.',
      pairs: [
        { left: 'x13331', right: '{c:Bb}' },
        { left: 'x24432', right: '{c:Bm}' },
        { left: 'x35553', right: '{c:C}' },
        { left: 'x57775', right: '{c:D}' },
      ],
      explain: 'The barred note on string 5 names the root: {n:Bb} at 1, {n:B} at 2, {n:C} at 3, {n:D} at 5. x24432 has the minor shape, so it is {c:Bm}.',
      fact: 'caged-a-shape-roots',
    },
    {
      type: 'true-false',
      statement: 'An A-shape barre chord uses all six strings.',
      answer: false,
      explain: 'Like open {c:A}, it leaves string 6 out: the lowest note is the root on string 5.',
      fact: 'caged-a-shape-barre',
    },
    {
      type: 'type-answer',
      prompt: 'An A-shape major barre chord with the barre at fret 10. Which chord is it?',
      answer: { kind: 'chord', value: 'G', spelling: 'any' },
      input: 'keyboard',
      explain: 'String 5 at fret 10 is {n:G}, so the A shape there is {c:G}: x-10-12-12-12-10.',
      fact: 'caged-a-shape-roots',
    },
    { generate: 'chord-shape', params: { chords: ['Bb', 'B', 'Bm', 'Cm', 'C#m', 'Eb'] } },
  ],
  facts: [
    {
      id: 'caged-a-shape-barre',
      front: 'What is an A-shape barre chord?',
      back: 'The open {c:A} shape moved up the neck, with a barre on strings 5 to 1.',
    },
    {
      id: 'caged-a-shape-roots',
      front: 'How is an A-shape barre chord named?',
      back: 'By the barred note on string 5, its root: at fret 1 {c:Bb} (x13331), at fret 2 {c:B} (x24442), at fret 3 {c:C} (x35553).',
      ask: {
        type: 'choice',
        prompt: 'An A-shape barre chord at fret 2 is which chord?',
        options: [
          { text: '{c:B}', correct: true },
          { text: '{c:Bb}', why: '{c:Bb} is at fret 1.' },
          { text: '{c:C}', why: '{c:C} is at fret 3.' },
          { text: '{c:F#}', why: 'An E shape at fret 2 is {c:F#}. On string 5, fret 2 is {n:B}.' },
        ],
        explain: 'String 5 at fret 2 is {n:B}: the A shape there is {c:B}, x24442.',
      },
    },
    {
      id: 'caged-a-minor-shape',
      front: 'Which chord is the A-minor shape barred at fret 2?',
      back: '{c:Bm}, x24432: the open {c:Am} shape moved up two frets.',
    },
  ],
};

/** The five C major shapes, from the nut up (frets low to high). */
const C_SHAPES: Array<[string, Array<number | null>]> = [
  ['C shape', [null, 3, 2, 0, 1, 0]],
  ['A shape', [null, 3, 5, 5, 5, 3]],
  ['G shape', [8, 7, 5, 5, 5, 8]],
  ['E shape', [8, 10, 10, 9, 8, 8]],
  ['D shape', [null, null, 10, 12, 13, 12]],
];

const theCagedOrder: Lesson = {
  id: 'the-caged-order',
  title: 'C-A-G-E-D up the neck',
  teaches: 'For any major chord, the five shapes follow each other up the neck in the order C-A-G-E-D and then repeat.',
  minutes: 4,
  skill: `theory:${U}:the-caged-order`,
  steps: [
    {
      type: 'card',
      title: 'One chord, five shapes',
      body: 'Every {c:C} chord on the neck is made of {n:C}, {n:E} and {n:G}. The five shapes are five handfuls of these notes, and up the neck they come in the order of the word: C shape, A, G, E, D. After the D shape the C shape comes round again, 12 frets higher.',
      figure: { kind: 'fretboard', frets: [0, 12], derive: { chord: 'C' }, root: 'C', labels: 'degree', caption: 'Every {n:C}, {n:E} and {n:G} up to fret 12.' },
    },
    {
      type: 'card',
      title: 'Hear C in five places',
      body: '{c:C} picked in each shape in turn, from the nut up: the C shape (open), the A shape barred at fret 3, the G shape around frets 5 to 8, the E shape barred at fret 8 and the D shape, its root on string 4 at fret 10.',
      figure: {
        kind: 'tab',
        tempo: 110,
        notes: C_SHAPES.flatMap(([, frets]) => arpeggio(frets)),
        caption: 'C, A, G, E and D shapes of {c:C}, each picked low to high.',
      },
    },
    {
      type: 'choice',
      prompt: 'Going up the neck, which shape comes after the G shape?',
      options: [
        { text: 'The E shape', correct: true },
        { text: 'The A shape', why: 'The A shape comes before the G shape: C, A, G, E, D.' },
        { text: 'The D shape', why: 'The D shape comes after the E shape.' },
        { text: 'The C shape', why: 'The C shape follows the D shape.' },
      ],
      explain: 'C, A, G, E, D: after G comes E. For {c:C}, the G shape sits around frets 5 to 8 and the E shape is barred at fret 8.',
      fact: 'caged-order-repeats',
    },
    {
      type: 'order',
      prompt: 'Put the shapes of {c:C} major in order, from the nut up the neck.',
      tiles: ['C shape', 'A shape', 'G shape', 'E shape', 'D shape'],
      explain: 'Open {c:C} is the C shape, so the climb starts there: C shape (open), A (fret 3), G (frets 5 to 8), E (fret 8), D (root at fret 10).',
      fact: 'caged-c-major-shapes',
    },
    {
      type: 'fretboard-find',
      prompt: 'This is the A shape of {c:C}, barred at fret 3, with its roots missing. Tap the two {n:C} roots.',
      find: { note: 'C' },
      mode: 'all',
      octave: 'any',
      frets: [3, 5],
      shown: [{ string: 4, fret: 5 }, { string: 2, fret: 5 }, { string: 1, fret: 3 }],
      explain: 'The A shape keeps its roots on strings 5 and 3: {n:C} on string 5 at fret 3, and the {n:C} an octave up on string 3 at fret 5.',
    },
    {
      type: 'card',
      title: 'Neighbours share notes',
      body: 'The shapes overlap. The top of the A shape, fret 5, is the bottom of the G shape: the same {n:G}, {n:C} and {n:E} on strings 4, 3 and 2. Know where one shape ends and you know where the next begins.',
      figure: {
        kind: 'fretboard',
        frets: [2, 9],
        dots: [
          at(5, 3, 'C', 'root'), at(1, 3, 'G'),
          at(4, 5, 'G', 'target'), at(3, 5, 'C', 'target'), at(2, 5, 'E', 'target'),
          at(6, 8, 'C', 'root'), at(5, 7, 'E'), at(1, 8, 'C', 'root'),
        ],
        caption: 'A shape (frets 3 to 5) and G shape (5 to 8) share the ringed notes.',
      },
    },
    {
      type: 'true-false',
      statement: 'Neighbouring CAGED shapes of a chord share some of their notes.',
      answer: true,
      explain: 'The top edge of one shape is the bottom edge of the next. For {c:C}, the A and G shapes share fret 5 on strings 4, 3 and 2.',
      fact: 'caged-shared-notes',
    },
    {
      type: 'choice',
      prompt: 'Open {c:A} is the A shape. Which shape plays {c:A} next, higher up the neck?',
      options: [
        { text: 'The G shape', correct: true },
        { text: 'The E shape', why: 'The E shape comes after the G shape: A, G, E.' },
        { text: 'The C shape', why: 'The C shape comes just before the A shape.' },
        { text: 'The D shape', why: 'The D shape comes after the E shape.' },
      ],
      explain: 'The order is the same for every chord, starting wherever the open shape is: A, G, E, D, C. For {c:A} the G shape sits around frets 2 to 5.',
      fact: 'caged-order-repeats',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each shape of {c:C} with where it sits.',
      pairs: [
        { left: 'C shape', right: 'Open position' },
        { left: 'A shape', right: 'Barre at fret 3' },
        { left: 'E shape', right: 'Barre at fret 8' },
        { left: 'D shape', right: 'Root on string 4, fret 10' },
      ],
      explain: 'Each shape sits where its roots fall: {n:C} on string 5 at fret 3 for the A shape, on string 6 at fret 8 for the E shape, on string 4 at fret 10 for the D shape.',
      fact: 'caged-c-major-shapes',
    },
  ],
  facts: [
    {
      id: 'caged-order-repeats',
      front: 'In what order do the five shapes of a major chord follow each other up the neck?',
      back: 'C, A, G, E, D, then C again, 12 frets higher.',
      ask: {
        type: 'choice',
        prompt: 'Going up the neck, which shape comes after the G shape?',
        options: [
          { text: 'The E shape', correct: true },
          { text: 'The A shape', why: 'The A shape comes before the G shape.' },
          { text: 'The D shape', why: 'The D shape comes after the E shape.' },
        ],
        explain: 'C, A, G, E, D: after G comes E.',
      },
    },
    {
      id: 'caged-c-major-shapes',
      front: 'Where are the five shapes of {c:C} major on the neck?',
      back: 'C shape in open position, A shape barred at fret 3, G shape around frets 5 to 8, E shape barred at fret 8, D shape with its root on string 4, fret 10.',
    },
    {
      id: 'caged-shared-notes',
      front: 'How do neighbouring CAGED shapes fit together?',
      back: 'They share notes: the top edge of one shape is the bottom edge of the next.',
    },
  ],
};

const oneChordFivePlaces: Lesson = {
  id: 'one-chord-five-places',
  title: 'One chord in five places',
  teaches: 'Any major chord can be found in all five shapes by locating its roots on strings 6, 5 and 4.',
  minutes: 4,
  skill: `theory:${U}:one-chord-five-places`,
  steps: [
    {
      type: 'card',
      title: 'Find the roots first',
      body: 'To play a chord anywhere, start from its roots. For {c:G}: {n:G} on string 6 at fret 3, on string 4 at fret 5, on string 5 at fret 10. String 6 roots carry the E and G shapes, string 5 roots the A and C shapes, and string 4 roots the D shape.',
      figure: { kind: 'fretboard', frets: [0, 12], derive: { chord: 'G' }, root: 'G', labels: 'degree', caption: 'Every {n:G}, {n:B} and {n:D} up to fret 12; the 1s are the roots.' },
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap every {n:G} on strings 6, 5 and 4, from the open strings to fret 12.',
      find: { note: 'G' },
      mode: 'all',
      octave: 'any',
      frets: [0, 12],
      strings: [6, 5, 4],
      explain: 'String 6 at fret 3, string 4 at fret 5 and string 5 at fret 10. Those three roots anchor all five shapes of {c:G}.',
      fact: 'caged-find-by-roots',
    },
    {
      type: 'card',
      title: 'Five places for G',
      body: 'Up from the nut: the G shape (open {c:G}), the E shape barred at fret 3, the D shape on the string 4 root at fret 5, the C shape around fret 7 and the A shape barred at fret 10. From fret 12 the G shape comes round again.',
      figure: { kind: 'chord', symbol: 'G', frets: [null, 10, 9, 7, 8, 7], caption: '{c:G} as a C shape: root on string 5 at fret 10.' },
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'G',
      frets: [null, 10, 9, 7, 8, 7],
      accept: 'this-shape',
      prompt: 'Build {c:G} as a C shape, with its root on string 5 at fret 10.',
      hint: 'Open {c:C} is x32010. Here a barre at fret 7 takes the nut\'s place, so every fret is 7 higher.',
      explain: 'x-10-9-7-8-7: open {c:C}\'s shape moved up seven frets, with the first finger barring fret 7 on strings 3 to 1.',
    },
    {
      type: 'choice',
      prompt: 'You barre fret 5 and build {c:A} up from its root on string 6. Which shape is that?',
      options: [
        { text: 'The E shape', correct: true },
        { text: 'The G shape', why: 'The G shape also roots on string 6, but it reaches down toward the nut: frets 2 to 5 for {c:A}.' },
        { text: 'The A shape', why: 'The A shape roots on string 5.' },
        { text: 'The D shape', why: 'The D shape roots on string 4.' },
      ],
      explain: 'A barre on the string 6 root with the chord built above it is the E shape: {c:A} is 577655.',
      fact: 'caged-find-by-roots',
    },
    {
      type: 'listen-choice',
      prompt: '{c:G} is picked in two CAGED shapes. Which one sat higher on the neck?',
      sound: { kind: 'tab', tempo: 110, notes: [...arpeggio([null, 10, 12, 12, 12, 10], 'h'), ...arpeggio([3, 5, 5, 4, 3, 3], 'h')] },
      options: [{ text: 'The first', correct: true }, { text: 'The second' }],
      shuffle: false,
      explain: 'The first was the A shape barred at fret 10, from {n:G} on string 5. The second was the E shape at fret 3, from the low {n:G} on string 6: the same chord, lower.',
    },
    {
      type: 'true-false',
      statement: 'The same CAGED order works for minor chords, using the minor versions of the shapes.',
      answer: true,
      explain: 'Minor chords have C, A, G, E and D shapes too, such as the {c:Em} and {c:Am} shapes you barred earlier. They follow each other in the same order.',
      fact: 'caged-minor-shapes',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each shape of {c:G} with where it sits.',
      pairs: [
        { left: 'G shape', right: 'Open position' },
        { left: 'E shape', right: 'Barre at fret 3' },
        { left: 'D shape', right: 'Root on string 4, fret 5' },
        { left: 'A shape', right: 'Barre at fret 10' },
      ],
      explain: 'The roots place them: {n:G} on string 6 at fret 3 for the E shape, on string 4 at fret 5 for the D shape, on string 5 at fret 10 for the A shape.',
      fact: 'caged-g-major-shapes',
    },
    {
      type: 'choice',
      prompt: 'Which two shapes take their root from string 5?',
      options: [
        { text: 'The A shape and the C shape', correct: true },
        { text: 'The E shape and the G shape', why: 'Those two root on string 6.' },
        { text: 'The D shape and the A shape', why: 'The D shape roots on string 4.' },
      ],
      shuffle: false,
      explain: 'Open {c:A} and open {c:C} both have their lowest root on string 5, so their moved shapes do too.',
      fact: 'caged-find-by-roots',
    },
  ],
  facts: [
    {
      id: 'caged-find-by-roots',
      front: 'How do you find a chord in all five CAGED shapes?',
      back: 'Find its roots on strings 6, 5 and 4, and build each shape around them.',
      ask: {
        type: 'fretboard-find',
        prompt: 'Tap every {n:A} on strings 6, 5 and 4, from the open strings to fret 12.',
        find: { note: 'A' },
        mode: 'all',
        octave: 'any',
        frets: [0, 12],
        strings: [6, 5, 4],
        explain: '{n:A} is on string 6 at fret 5, on string 5 open and at fret 12, and on string 4 at fret 7.',
      },
    },
    {
      id: 'caged-g-major-shapes',
      front: 'Where are the five shapes of {c:G} major on the neck?',
      back: 'G shape open, E shape at fret 3, D shape around fret 5, C shape around fret 7, A shape at fret 10, then the G shape again from fret 12.',
    },
    {
      id: 'caged-minor-shapes',
      front: 'Does the CAGED order work for minor chords too?',
      back: 'Yes: the same order, using the minor versions of the shapes.',
    },
  ],
};

const majorScalePositions: Lesson = {
  id: 'major-scale-positions',
  title: 'The major scale in five positions',
  teaches: 'The major scale fits five overlapping positions, one around each CAGED shape, covering the whole neck.',
  minutes: 4,
  skill: `theory:${U}:major-scale-positions`,
  steps: [
    {
      type: 'card',
      title: 'A scale around a chord',
      body: 'Around the {c:G} barre at fret 3 (355433) lies a whole {t:scale-position|position} of {k:G major}: every scale note from fret 2 to fret 5, one finger per fret. Its chord is the E shape, so this is the **E-shape position**, also called second position.',
      figure: {
        kind: 'fretboard',
        frets: [1, 6],
        labels: 'finger',
        dots: G_E_POSITION.map(([s, f, note, finger]) => at(s, f, note, note === 'G' ? 'root' : undefined, finger)),
        caption: '{k:G major}, E-shape position. Numbers are fingers; the roots are ringed.',
      },
    },
    {
      type: 'card',
      title: 'Two octaves under one hand',
      body: 'From the low {n:G}, string 6 at fret 3, the position climbs two octaves to the {n:G} on string 1 at fret 3. Index finger at fret 2, middle at 3, ring at 4, little finger at 5. Play it up, then back down.',
      figure: { kind: 'tab', tempo: 90, notes: G_E_CLIMB, caption: 'G major from string 6, fret 3 to string 1, fret 3.' },
    },
    {
      type: 'fretboard-find',
      prompt: 'In the E-shape position of {k:G major} (frets 2 to 5), tap every {n:G}.',
      find: { note: 'G' },
      mode: 'all',
      octave: 'any',
      frets: [2, 5],
      explain: 'Three {n:G}s, two octaves: string 6 at fret 3, string 4 at fret 5 and string 1 at fret 3. They are the roots of the {c:G} barre in the same place.',
      fact: 'caged-g-e-shape-position',
    },
    {
      type: 'play-phrase',
      prompt: 'Play {k:G major} in the E-shape position, from string 6 at fret 3 up to string 1 at fret 3.',
      notes: G_E_CLIMB,
      octave: 'exact',
      tempo: 70,
      explain: 'Fifteen notes, two octaves: {n:G} {n:A} {n:B} {n:C} {n:D} {n:E} {n:F#} {n:G} and on up to the high {n:G}. Keep one finger per fret and the hand still.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap every note of {k:G major} on strings 6 and 5 in the E-shape position (frets 2 to 5).',
        find: { scale: 'major', tonic: 'G' },
        mode: 'all',
        octave: 'any',
        frets: [2, 5],
        strings: [6, 5],
        explain: 'String 6: frets 2, 3, 5 ({n:F#} {n:G} {n:A}). String 5: frets 2, 3, 5 ({n:B} {n:C} {n:D}).',
      },
      fact: 'caged-g-e-shape-position',
    },
    {
      type: 'card',
      title: 'Five positions, one neck',
      body: 'Each CAGED shape of {c:G} has a scale position around it. From the nut: G shape (frets 0 to 4), E shape (2 to 5), D shape (4 to 8), C shape (7 to 10), A shape (9 to 13). Neighbours overlap, so together they cover the neck, then repeat 12 frets up.',
      figure: { kind: 'fretboard', frets: [0, 12], derive: { scale: 'major', tonic: 'G' }, root: 'G', labels: 'degree', caption: '{k:G major} up to fret 12. The five positions share these notes.' },
    },
    {
      type: 'choice',
      prompt: 'Which position of {k:G major} sits around frets 7 to 10?',
      options: [
        { text: 'The C-shape position', correct: true },
        { text: 'The D-shape position', why: 'The D-shape position is around frets 4 to 8.' },
        { text: 'The A-shape position', why: 'The A-shape position is around frets 9 to 13.' },
        { text: 'The E-shape position', why: 'The E-shape position is frets 2 to 5.' },
      ],
      explain: 'Around frets 7 to 10 sits {c:G} as a C shape, x-10-9-7-8-7, and the scale position around it.',
      fact: 'caged-g-five-positions',
    },
    {
      type: 'order',
      prompt: 'Put the positions of {k:G major} in order, from the nut up the neck.',
      tiles: ['G shape', 'E shape', 'D shape', 'C shape', 'A shape'],
      explain: 'Open {c:G} is the G shape, so the climb starts there and follows CAGED from G: G, E, D, C, A.',
      fact: 'caged-g-five-positions',
    },
    {
      type: 'true-false',
      statement: 'Each position of the major scale overlaps the next one, as the chord shapes do.',
      answer: true,
      explain: 'The E-shape position of {k:G major} ends at fret 5, where the D-shape position begins (frets 4 to 8). Learn them one at a time and they join up.',
      fact: 'caged-positions-overlap',
    },
    {
      type: 'card',
      title: 'Three notes per string',
      body: 'Many players also use {t:three-notes-per-string|three-notes-per-string} patterns. From {n:G} on string 6 at fret 3, {k:G major} is frets 3 5 7 on strings 6 and 5, 4 5 7 on strings 4 and 3, and 5 7 8 on strings 2 and 1. Wider stretches, but every string picks the same.',
      figure: {
        kind: 'fretboard',
        frets: [2, 9],
        root: 'G',
        labels: 'degree',
        dots: [
          at(6, 3, 'G', 'root'), at(6, 5, 'A'), at(6, 7, 'B'),
          at(5, 3, 'C'), at(5, 5, 'D'), at(5, 7, 'E'),
          at(4, 4, 'F#'), at(4, 5, 'G', 'root'), at(4, 7, 'A'),
          at(3, 4, 'B'), at(3, 5, 'C'), at(3, 7, 'D'),
          at(2, 5, 'E'), at(2, 7, 'F#'), at(2, 8, 'G', 'root'),
          at(1, 5, 'A'), at(1, 7, 'B'), at(1, 8, 'C'),
        ],
        caption: '{k:G major}, three notes on every string, from string 6 at fret 3.',
      },
    },
    {
      type: 'choice',
      prompt: 'In that three-notes-per-string pattern of {k:G major}, which frets does string 2 use?',
      options: [
        { text: '5, 7 and 8', correct: true },
        { text: '4, 5 and 7', why: 'Those are strings 4 and 3.' },
        { text: '3, 5 and 7', why: 'Those are strings 6 and 5.' },
        { text: '5, 7 and 9', why: 'String 2 at fret 9 is {n:G#}, not in {k:G major}.' },
      ],
      explain: 'Strings 2 and 1 both use frets 5, 7 and 8. On string 2 that is {n:E} {n:F#} {n:G}.',
      fact: 'caged-three-per-string',
    },
    { generate: 'neck-tones', params: { what: 'scale', scales: ['major'], tonics: ['G', 'C', 'A', 'D'], strings: [6, 5, 4], span: 4 } },
  ],
  facts: [
    {
      id: 'caged-g-e-shape-position',
      front: 'Which frets make the E-shape position (second position) of {k:G major}?',
      back: 'String 6: 2, 3, 5. String 5: 2, 3, 5. String 4: 2, 4, 5. String 3: 2, 4, 5. String 2: 3, 5. String 1: 2, 3, 5.',
    },
    {
      id: 'caged-g-five-positions',
      front: 'Where are the five positions of {k:G major}?',
      back: 'Around frets 0 to 4 (G shape), 2 to 5 (E shape), 4 to 8 (D shape), 7 to 10 (C shape) and 9 to 13 (A shape), then again 12 frets higher.',
      ask: {
        type: 'order',
        prompt: 'Put the positions of {k:G major} in order, from the nut up the neck.',
        tiles: ['G shape', 'E shape', 'D shape', 'C shape', 'A shape'],
        explain: 'From open {c:G}, the G shape, the positions follow CAGED: G, E, D, C, A.',
      },
    },
    {
      id: 'caged-positions-overlap',
      front: 'Why can you learn the five positions one at a time?',
      back: 'Each position overlaps the next, as the chord shapes do, so learning them one by one links up the whole neck.',
    },
    {
      id: 'caged-three-per-string',
      front: 'What is the three-notes-per-string pattern of {k:G major} from string 6, fret 3?',
      back: 'Frets 3 5 7 on strings 6 and 5, 4 5 7 on strings 4 and 3, and 5 7 8 on strings 2 and 1.',
    },
  ],
};

const shapesInsideScales: Lesson = {
  id: 'shapes-inside-scales',
  title: 'Chord shapes inside scale positions',
  teaches: 'Each CAGED chord shape sits inside its scale position, showing you the root, third and fifth of the scale.',
  minutes: 3,
  skill: `theory:${U}:shapes-inside-scales`,
  steps: [
    {
      type: 'card',
      title: 'The chord inside the scale',
      body: 'Look at the E-shape position of {k:G major} again, with degrees {d:1}, {d:3} and {d:5} coloured: {n:G}, {n:B} and {n:D}. They are the {c:G} barre you know, 355433, plus one more {n:B} on string 5. The chord is the skeleton; the scale fills the gaps.',
      figure: {
        kind: 'fretboard',
        frets: [1, 6],
        root: 'G',
        labels: 'degree',
        dots: G_E_POSITION.map(([string, fret, note]) => ({ string, fret, note, degree: G_DEGREE[note], role: G_ROLE[note] ?? 'ghost' })),
        caption: '{k:G major}, E-shape position: the {c:G} chord tones in colour.',
      },
    },
    {
      type: 'true-false',
      statement: 'The chord tones inside a scale position form a CAGED chord shape.',
      answer: true,
      explain: 'Degrees {d:1}, {d:3} and {d:5} of the E-shape position are the E-shape {c:G} barre. Every position holds its own shape the same way.',
      fact: 'caged-chord-tones-shape',
    },
    {
      type: 'fretboard-find',
      prompt: 'In the E-shape position of {k:G major} (frets 2 to 5), tap every {n:B}, the 3rd.',
      find: { note: 'B' },
      mode: 'all',
      octave: 'any',
      frets: [2, 5],
      explain: 'Two {n:B}s: string 5 at fret 2 and string 3 at fret 4. The one on string 3 is the 3rd of the 355433 barre.',
      fact: 'caged-chord-inside-position',
    },
    {
      type: 'choice',
      prompt: 'In the E-shape position of {k:G major}, which note on string 5 is the 5th of the chord?',
      options: [
        { text: 'Fret 5, {n:D}', correct: true },
        { text: 'Fret 3, {n:C}', why: '{n:C} is the 4th of the scale, not a chord tone.' },
        { text: 'Fret 2, {n:B}', why: '{n:B} is the 3rd of {c:G}.' },
      ],
      shuffle: false,
      explain: '{c:G} is {n:G} {n:B} {n:D}. On string 5 the position has {n:B} (fret 2, the 3rd) and {n:D} (fret 5, the 5th).',
      fact: 'caged-chord-tones-shape',
    },
    {
      type: 'card',
      title: 'Why it helps',
      body: 'While you play a melody or a solo in this position, the chord shape shows you where home is. The root, 3rd and 5th sound settled over {c:G}; the other scale notes lead between them. Aim for a chord tone where a phrase ends.',
    },
    {
      type: 'play-phrase',
      prompt: 'Play the E-shape position of {k:G major} down: from string 1 at fret 3 to string 6 at fret 3.',
      notes: [...G_E_CLIMB].reverse(),
      octave: 'exact',
      tempo: 70,
      explain: 'Fifteen notes down two octaves, from high {n:G} to low {n:G}. Every third note or so lands on a {c:G} chord tone.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap every note of {k:G major} on strings 3, 2 and 1 in the E-shape position (frets 2 to 5).',
        find: { scale: 'major', tonic: 'G' },
        mode: 'all',
        octave: 'any',
        frets: [2, 5],
        strings: [3, 2, 1],
        explain: 'String 3: frets 2, 4, 5. String 2: frets 3, 5. String 1: frets 2, 3, 5.',
      },
    },
    {
      type: 'play-chord',
      prompt: 'Now strum the {c:G} chord inside that position: the E-shape barre at fret 3.',
      chord: 'G',
      frets: '355433',
      explain: '355433: the same frets your scale passed through, played together.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'G',
        frets: '355433',
        accept: 'this-shape',
        prompt: 'Build the {c:G} chord inside the E-shape position: the E-shape barre at fret 3.',
        explain: '355433: barre fret 3, then fret 5 on strings 5 and 4 and fret 4 on string 3.',
      },
      fact: 'caged-chord-inside-position',
    },
    {
      type: 'choice',
      prompt: 'Your phrase over {c:G} ends in the E-shape position. Which note sounds most settled to end on?',
      options: [
        { text: '{n:G}, string 1 at fret 3', correct: true },
        { text: '{n:F#}, string 1 at fret 2', why: '{n:F#} is the 7th: it pulls up to {n:G} instead of resting.' },
        { text: '{n:A}, string 1 at fret 5', why: '{n:A} is the 2nd, not a chord tone: it wants to move.' },
        { text: '{n:C}, string 3 at fret 5', why: '{n:C} is the 4th: over {c:G} it leans down to {n:B}.' },
      ],
      explain: '{n:G} is the root of {c:G}, the most settled chord tone. The chord shape inside the position shows you where it is.',
      fact: 'caged-chord-guides-solo',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each spot in the E-shape position with its role over {c:G}.',
      pairs: [
        { left: 'String 6, fret 3', right: 'Root' },
        { left: 'String 3, fret 4', right: 'Third' },
        { left: 'String 2, fret 3', right: 'Fifth' },
        { left: 'String 1, fret 2', right: 'Not a chord tone' },
      ],
      explain: '{n:G} on string 6, {n:B} on string 3 and {n:D} on string 2 are chord tones. {n:F#} on string 1 is a scale note between them.',
      fact: 'caged-chord-tones-shape',
    },
    { generate: 'neck-tones', params: { what: 'chord', chords: ['G', 'C', 'D', 'A', 'E'], strings: [6, 5, 4], span: 4 } },
  ],
  facts: [
    {
      id: 'caged-chord-inside-position',
      front: 'What sits inside each position of the major scale?',
      back: 'A CAGED chord shape: the E-shape chord inside the E-shape position, the A-shape chord inside the A-shape position, and so on.',
    },
    {
      id: 'caged-chord-tones-shape',
      front: 'Which notes of a major-scale position form its CAGED chord shape?',
      back: 'Degrees {d:1}, {d:3} and {d:5}: the root, 3rd and 5th.',
    },
    {
      id: 'caged-chord-guides-solo',
      front: 'How does knowing the chord shape under your hand help a melody or solo?',
      back: 'It shows where the root, 3rd and 5th are: the notes that sound most settled over the chord.',
    },
  ],
};

/** Unit 19 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'CAGED: five shapes, one neck',
  theme: 'fretboard',
  description: 'How the open C, A, G, E and D shapes become barre chords, link up to cover the whole neck, and frame the five positions of the major scale.',
  lessons: [fiveOpenShapes, theBarre, eShapeBarre, aShapeBarre, theCagedOrder, oneChordFivePlaces, majorScalePositions, shapesInsideScales],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      {
        type: 'order',
        prompt: 'Put the five shapes in CAGED order.',
        tiles: ['C shape', 'A shape', 'G shape', 'E shape', 'D shape'],
        explain: 'C, A, G, E, D: the order they follow up the neck.',
      },
      {
        type: 'match-pairs',
        prompt: 'Match each shape with the string of its lowest root.',
        pairs: [
          { left: 'E shape', right: 'String 6' },
          { left: 'A shape', right: 'String 5' },
          { left: 'D shape', right: 'String 4' },
        ],
        explain: 'Open {c:E}, {c:A} and {c:D} root on the open 6th, 5th and 4th strings.',
      },
      {
        type: 'true-false',
        statement: 'In a moved open shape, the barre does the job of the nut.',
        answer: true,
        explain: 'It stops the strings the open shape left open.',
      },
      {
        type: 'chord-build',
        task: 'fingers',
        chord: 'F',
        frets: '133211',
        accept: 'this-shape',
        prompt: 'Build {c:F} as the E shape with a barre at fret 1.',
        explain: '133211: the barre at fret 1 with the E shape one fret above.',
      },
      {
        type: 'choice',
        prompt: 'An E-shape barre chord at fret 8 is which chord?',
        options: [
          { text: '{c:C}', correct: true },
          { text: '{c:B}', why: '{n:B} is at fret 7.' },
          { text: '{c:D}', why: '{n:D} is at fret 10.' },
        ],
        explain: 'String 6 at fret 8 is {n:C}.',
      },
      {
        type: 'chord-build',
        task: 'fingers',
        chord: 'Gm',
        frets: '355333',
        accept: 'this-shape',
        prompt: 'Build {c:Gm} as an E-minor-shape barre chord.',
        explain: '355333: string 3 plays the barre, {n:Bb}, the minor 3rd.',
      },
      {
        type: 'chord-build',
        task: 'fingers',
        chord: 'D',
        frets: 'x57775',
        accept: 'this-shape',
        prompt: 'Build {c:D} as an A-shape barre chord.',
        explain: 'x57775: root {n:D} under the barre on string 5.',
      },
      {
        type: 'choice',
        prompt: 'An A-minor-shape barre chord at fret 7 is which chord?',
        options: [
          { text: '{c:Em}', correct: true },
          { text: '{c:E}', why: 'The minor shape makes it {c:Em}.' },
          { text: '{c:Bm}', why: 'On string 5, fret 7 is {n:E}.' },
        ],
        explain: 'String 5 at fret 7 is {n:E}: x79987 is {c:Em}.',
      },
      {
        type: 'type-answer',
        prompt: 'An A-shape major barre chord with the barre at fret 3. Which chord is it?',
        answer: { kind: 'chord', value: 'C', spelling: 'any' },
        input: 'keyboard',
        explain: 'String 5 at fret 3 is {n:C}: x35553 is {c:C}.',
      },
      {
        type: 'choice',
        prompt: 'Going up the neck, which shape comes after the G shape?',
        options: [
          { text: 'The E shape', correct: true },
          { text: 'The A shape', why: 'A comes before G.' },
          { text: 'The D shape', why: 'D comes after E.' },
        ],
        explain: 'C, A, G, E, D.',
      },
      {
        type: 'fretboard-find',
        prompt: 'Tap every {n:G} on strings 6, 5 and 4, from the open strings to fret 12.',
        find: { note: 'G' },
        mode: 'all',
        octave: 'any',
        frets: [0, 12],
        strings: [6, 5, 4],
        explain: 'String 6 at fret 3, string 4 at fret 5, string 5 at fret 10.',
      },
      {
        type: 'chord-build',
        task: 'fingers',
        chord: 'G',
        frets: [null, 10, 9, 7, 8, 7],
        accept: 'this-shape',
        prompt: 'Build {c:G} as a C shape, with its root on string 5 at fret 10.',
        explain: 'x-10-9-7-8-7: open {c:C}\'s shape seven frets up, barred at fret 7.',
      },
      {
        type: 'choice',
        prompt: 'Which position of {k:G major} sits around frets 7 to 10?',
        options: [
          { text: 'The C-shape position', correct: true },
          { text: 'The D-shape position', why: 'That one is around frets 4 to 8.' },
          { text: 'The A-shape position', why: 'That one is around frets 9 to 13.' },
        ],
        explain: 'Around frets 7 to 10 sits {c:G} as a C shape.',
      },
      {
        type: 'order',
        prompt: 'Put the positions of {k:G major} in order, from the nut up the neck.',
        tiles: ['G shape', 'E shape', 'D shape', 'C shape', 'A shape'],
        explain: 'From open {c:G}: G, E, D, C, A.',
      },
      {
        type: 'choice',
        prompt: 'In the three-notes-per-string pattern of {k:G major} from string 6 fret 3, which frets does string 2 use?',
        options: [
          { text: '5, 7 and 8', correct: true },
          { text: '4, 5 and 7', why: 'Those are strings 4 and 3.' },
          { text: '3, 5 and 7', why: 'Those are strings 6 and 5.' },
        ],
        explain: 'Strings 2 and 1 use frets 5, 7 and 8.',
      },
      {
        type: 'fretboard-find',
        prompt: 'In the E-shape position of {k:G major} (frets 2 to 5), tap every {n:B}, the 3rd.',
        find: { note: 'B' },
        mode: 'all',
        octave: 'any',
        frets: [2, 5],
        explain: 'String 5 at fret 2 and string 3 at fret 4.',
      },
      {
        type: 'true-false',
        statement: 'The chord tones inside a scale position form a CAGED chord shape.',
        answer: true,
        explain: 'Degrees 1, 3 and 5 of each position make its chord shape.',
      },
    ],
  },
};

export default unit;
