/**
 * Theory Path, unit 7: Your first scale. Written from the syllabus entries in
 * `src/content/plan/theory-path.json` (unit `first-scale`), one lesson per entry, in order: each
 * lesson opens with the "on the guitar" picture, asks the planned exercises, ends with the planned
 * drill, and turns every planned fact into a review card. `first-scale.test.ts` cross-checks the
 * scale, the box-1 shape and fingering, its roots, the moved boxes and every phrase against the
 * theory and guitar engines (`scaleNotes`, `scalePatterns`).
 *
 * Two planned sounds are approximated (README, "Known limits"): a lesson `Sound` plays one line at
 * a time, so the last lesson's phrases cannot sound over an A drone; the two versions are played
 * one after the other instead, and the ending decides which sounds finished. The "phrase of your
 * own" in "Where the roots are" cannot be graded, so the play step is a short given phrase that ends
 * on the root, and its explanation invites the learner to make up their own.
 */
import type { FretDot, Lesson, TabNote, Unit } from '@/lessons';

const U = 'first-scale';

const note = (string: number, fret: number, duration = 'q'): TabNote => ({ string, fret, duration });
const dot = (string: number, fret: number, n: string, extra: Partial<FretDot> = {}): FretDot => ({ string, fret, note: n, ...extra });
const finger = (fret: number): 1 | 3 | 4 => (fret === 5 ? 1 : fret === 7 ? 3 : 4);

/** A minor pentatonic, box 1 at fret 5, in playing order from the lowest note: [string, fret, note]. */
const BOX: Array<[number, number, string]> = [
  [6, 5, 'A'], [6, 8, 'C'], [5, 5, 'D'], [5, 7, 'E'], [4, 5, 'G'], [4, 7, 'A'],
  [3, 5, 'C'], [3, 7, 'D'], [2, 5, 'E'], [2, 8, 'G'], [1, 5, 'A'], [1, 8, 'C'],
];
/** Box 1 as dots, fingers shown, roots marked. */
const BOX_DOTS: FretDot[] = BOX.map(([s, f, n]) => dot(s, f, n, { finger: finger(f), ...(n === 'A' ? { role: 'root' as const } : {}) }));
/** Box 1 as a tab line, lowest note to highest. */
const BOX_UP: TabNote[] = BOX.map(([s, f]) => note(s, f));
const tile = (s: number, f: number): string => `String ${s}, fret ${f}`;

/** Two short tunes on string 5 with the same notes: the first ends on D, the second on the tonic A. */
const TUNE_ON_D: TabNote[] = [note(5, 0), note(5, 3), note(5, 5), note(5, 7), note(5, 5), note(5, 3), note(5, 5, 'h')];
const TUNE_ON_A: TabNote[] = [note(5, 0), note(5, 3), note(5, 5), note(5, 7), note(5, 5), note(5, 3), note(5, 0, 'h')];

/** Two phrases in box 1: the first ends on the root A (string 4, fret 7), the second on D. */
const PHRASE_ON_ROOT: TabNote[] = [note(3, 5), note(3, 7), note(3, 5), note(4, 7, 'h.')];
const PHRASE_ON_D: TabNote[] = [note(3, 5), note(4, 7), note(3, 5), note(3, 7, 'h.')];
/** The play step of "Where the roots are": G E G A, landing on the root at string 4, fret 7. */
const ROOT_LANDING: TabNote[] = [note(4, 5), note(5, 7), note(4, 5), note(4, 7, 'h')];

/** An original two-bar phrase in box 1, written for this course: once ending on D, once on A. */
const IDEA: TabNote[] = [note(4, 7), note(3, 5), note(3, 7), note(3, 5), note(4, 7), note(4, 5)];
const IDEA_ON_D: TabNote[] = [...IDEA, note(3, 7, 'h')];
const IDEA_ON_A: TabNote[] = [...IDEA, note(4, 7, 'h')];

const whatAScaleIs: Lesson = {
  id: 'what-a-scale-is',
  title: 'What a scale is',
  teaches: 'A scale is a set of notes in order of pitch, built on a home note, the tonic, which gives it its name.',
  minutes: 2,
  skill: `theory:${U}:what-a-scale-is`,
  steps: [
    {
      type: 'card',
      title: 'Notes in order',
      body: 'A {t:scale} is a set of notes arranged **in order of pitch**, from low to high. Here is one scale on string 5: {n:A} {n:C} {n:D} {n:E} {n:G}, and then {n:A} again at fret 12. Each note is a little higher than the one before.',
      figure: {
        kind: 'fretboard',
        frets: [0, 12],
        strings: [5],
        derive: { scale: 'minor-pentatonic', tonic: 'A' },
        caption: 'One scale on string 5, from the open string to fret 12.',
      },
    },
    {
      type: 'card',
      title: 'The home note',
      body: 'Every scale has a **home note**, its {t:tonic}. Tunes made from the scale feel finished when they end there. The scale is named after its tonic: this one starts and ends on {n:A}, so it is an {n:A} scale.',
      figure: { kind: 'audio', sound: { kind: 'scale', tonic: 'A2', scale: 'minor-pentatonic', direction: 'up-down', tempo: 100 }, label: 'Hear it up and down' },
    },
    {
      type: 'choice',
      prompt: 'What is the home note of a scale called?',
      options: [
        { text: 'The tonic', correct: true },
        { text: 'The octave', why: 'An octave is a distance: from a note to the next one with the same name.' },
        { text: 'The sharp', why: 'A sharp raises a note by a half step. The home note is the tonic.' },
        { text: 'The open string', why: 'Here the tonic happens to be the open {n:A}, but a tonic can sit anywhere on the neck.' },
      ],
      explain: 'The home note of a scale is its tonic: the note tunes from the scale come back to.',
      fact: 'first-scale-tonic',
    },
    {
      type: 'listen-choice',
      prompt: 'Two short tunes use the same notes. Which one sounds finished?',
      sound: { kind: 'tab', notes: [...TUNE_ON_D, { rest: true, duration: 'h' }, ...TUNE_ON_A], tempo: 100 },
      options: [{ text: 'The first tune' }, { text: 'The second tune', correct: true }],
      shuffle: false,
      explain: 'The second tune ends on {n:A}, the tonic, so it sounds at home. The first stops on {n:D} and seems to wait for more.',
    },
    {
      type: 'true-false',
      statement: 'A scale is named after its tonic.',
      answer: true,
      explain: 'The tonic gives the scale its name: a scale with {n:A} as its home note is an {n:A} scale.',
      fact: 'first-scale-tonic',
    },
    {
      type: 'order',
      prompt: 'A scale lists its notes in order of pitch. Put these in order, low to high, starting on the tonic {n:A}.',
      tiles: ['{n:A}', '{n:C}', '{n:D}', '{n:E}', '{n:G}'],
      explain: 'On string 5 they climb {n:A} (open), {n:C} (3), {n:D} (5), {n:E} (7), {n:G} (10): each one higher than the last.',
      fact: 'first-scale-meaning',
    },
    {
      type: 'card',
      title: 'Each scale has its own sound',
      body: 'Different scales choose **different notes**, and that choice gives each scale its own sound. The {n:A} scale you heard has five notes and sounds a little dark. Here is another scale on the same tonic, {n:A} major, with seven notes: it sounds brighter.',
      figure: { kind: 'audio', sound: { kind: 'scale', tonic: 'A2', scale: 'major', direction: 'up', tempo: 100 }, label: 'Hear A major' },
    },
    {
      type: 'choice',
      prompt: 'Two scales share the tonic {n:A} but use different notes. What is different?',
      options: [
        { text: 'Their sound', correct: true },
        { text: 'Nothing: same tonic, same scale', why: 'The tonic is only the home note. Different notes make a different scale.' },
        { text: 'Their home note', why: 'Both have {n:A} as home: that is what sharing a tonic means.' },
      ],
      shuffle: false,
      explain: 'The notes a scale chooses give it its sound. Same home note, different notes: a different scale with a different sound.',
      fact: 'first-scale-own-sound',
    },
  ],
  facts: [
    {
      id: 'first-scale-meaning',
      front: 'What is a scale?',
      back: 'A set of notes arranged in order of pitch.',
      ask: {
        type: 'choice',
        prompt: 'What is a scale?',
        options: [
          { text: 'A set of notes in order of pitch', correct: true },
          { text: 'Several notes played together', why: 'Notes played together make a chord.' },
          { text: 'The speed of the beat', why: 'That is the tempo.' },
        ],
        explain: 'A scale is a set of notes arranged in order of pitch, low to high.',
      },
    },
    {
      id: 'first-scale-tonic',
      front: 'What is the tonic of a scale?',
      back: 'Its home note. The scale is named after it.',
      ask: {
        type: 'true-false',
        statement: 'The tonic is the home note of a scale, and the scale is named after it.',
        answer: true,
        explain: 'An {n:A} scale has {n:A} as its tonic, its home note.',
      },
    },
    { id: 'first-scale-own-sound', front: 'Why do different scales sound different?', back: 'They choose different notes, which gives each scale its own sound.' },
  ],
};

const aMinorPentatonic: Lesson = {
  id: 'a-minor-pentatonic',
  title: 'Five notes: A C D E G',
  teaches: 'The A minor pentatonic scale has five notes: A C D E G.',
  minutes: 3,
  skill: `theory:${U}:a-minor-pentatonic`,
  steps: [
    {
      type: 'card',
      title: 'Five notes',
      body: 'Your first real scale is the **{n:A} minor {t:pentatonic|pentatonic}**. It has just **five notes**: {n:A} {n:C} {n:D} {n:E} {n:G}. Then {n:A} comes round again, an octave higher. On string 5 they sit at frets 0, 3, 5, 7, 10 and 12.',
      figure: {
        kind: 'fretboard',
        frets: [0, 12],
        strings: [5],
        derive: { scale: 'minor-pentatonic', tonic: 'A' },
        caption: '{n:A} minor pentatonic on string 5.',
      },
    },
    {
      type: 'card',
      title: 'Penta means five',
      body: '*Penta* is Greek for five, so *pentatonic* means five notes. The minor pentatonic is one of the most used scales in rock, blues and pop guitar: countless riffs and solos come from it.',
      figure: { kind: 'audio', sound: { kind: 'scale', tonic: 'A2', scale: 'minor-pentatonic', direction: 'up', tempo: 100 }, label: 'Hear it, low to high' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the {n:A} minor pentatonic scale.',
      text: '{n:A}  ___  {n:D}  {n:E}  ___',
      blanks: ['{n:C}', '{n:G}'],
      bank: ['{n:B}', '{n:F}'],
      explain: '{n:A} minor pentatonic is {n:A} {n:C} {n:D} {n:E} {n:G}. It skips {n:B} and {n:F}.',
      fact: 'first-scale-a-minor-pentatonic',
    },
    {
      type: 'choice',
      prompt: 'Which note is **not** in {n:A} minor pentatonic?',
      options: [
        { text: '{n:C}', why: '{n:C} is the second note of the scale.' },
        { text: '{n:D}', why: '{n:D} is the third note of the scale.' },
        { text: '{n:F}', correct: true },
        { text: '{n:G}', why: '{n:G} is the fifth note of the scale.' },
      ],
      shuffle: false,
      explain: 'The scale is {n:A} {n:C} {n:D} {n:E} {n:G}. There is no {n:F}: from {n:E} it jumps straight to {n:G}.',
      fact: 'first-scale-a-minor-pentatonic',
    },
    {
      type: 'true-false',
      statement: 'Pentatonic means a scale of five notes.',
      answer: true,
      explain: '*Penta* is Greek for five: a pentatonic scale has five notes, like {n:A} {n:C} {n:D} {n:E} {n:G}.',
      fact: 'first-scale-pentatonic-word',
    },
    {
      type: 'fretboard-find',
      prompt: 'On string 5, tap every note of {n:A} minor pentatonic from the open string to fret 12.',
      hint: 'There are six, counting both {n:A}s. On a small screen, slide the neck to reach fret 12.',
      find: { scale: 'minor-pentatonic', tonic: 'A' },
      mode: 'all',
      octave: 'any',
      frets: [0, 12],
      strings: [5],
      explain: '{n:A} open, {n:C} at 3, {n:D} at 5, {n:E} at 7, {n:G} at 10 and {n:A} again at 12.',
      fact: 'first-scale-a-minor-pentatonic',
    },
    { generate: 'scale-notes', params: { scales: ['minor-pentatonic'], tonics: ['A'], form: 'order' } },
    { generate: 'scale-notes', params: { scales: ['minor-pentatonic'], tonics: ['A'], form: 'fill' } },
    { generate: 'scale-notes', params: { scales: ['minor-pentatonic'], tonics: ['A'], form: 'odd-one-out' } },
  ],
  facts: [
    {
      id: 'first-scale-a-minor-pentatonic',
      front: 'Name the five notes of the A minor pentatonic scale.',
      back: '{n:A} {n:C} {n:D} {n:E} {n:G}',
      ask: { generate: 'scale-notes', params: { scales: ['minor-pentatonic'], tonics: ['A'], form: 'order' } },
    },
    { id: 'first-scale-pentatonic-word', front: 'What does "pentatonic" mean?', back: 'Five notes: "penta" is Greek for five.' },
    { id: 'first-scale-pentatonic-popular', front: 'Where is the minor pentatonic used?', back: 'Everywhere in rock, blues and pop guitar: it is one of the most used scales of all.' },
  ],
};

const theBoxAtFret5: Lesson = {
  id: 'the-box-at-fret-5',
  title: 'The box at fret 5',
  teaches: 'The most used shape of A minor pentatonic covers frets 5 to 8 on all six strings.',
  minutes: 4,
  skill: `theory:${U}:the-box-at-fret-5`,
  steps: [
    {
      type: 'card',
      title: 'A shape for the hand',
      body: 'Guitarists rarely play a scale along one string. They use a **shape** that covers a few frets on all six strings. The most used shape of {n:A} minor pentatonic sits at **frets 5 to 8**, with two notes on every string.',
      figure: { kind: 'fretboard', frets: [4, 9], labels: 'finger', dots: BOX_DOTS, caption: 'Box 1 at fret 5. Numbers are fingers: 1 index, 3 ring, 4 little.' },
    },
    {
      type: 'card',
      title: 'Box 1',
      body: 'On strings **6, 2 and 1** the box uses frets **5 and 8**. On strings **5, 4 and 3** it uses frets **5 and 7**. Many players call it **box 1** (or position 1). Its lowest note, string 6 at fret 5, is the tonic {n:A}.',
      figure: { kind: 'tab', tempo: 80, notes: BOX_UP, caption: 'Box 1 from its lowest note to its highest.' },
    },
    {
      type: 'choice',
      prompt: 'On which strings does box 1 use frets 5 and 8?',
      options: [
        { text: 'Strings 6, 2 and 1', correct: true },
        { text: 'Strings 5, 4 and 3', why: 'Those use frets 5 and 7.' },
        { text: 'All six strings', why: 'Only the outer strings reach fret 8: strings 5, 4 and 3 stop at fret 7.' },
        { text: 'Strings 6 and 5 only', why: 'String 5 uses frets 5 and 7. Strings 2 and 1 use 5 and 8, like string 6.' },
      ],
      explain: 'Frets 5 and 8 on strings 6, 2 and 1; frets 5 and 7 on strings 5, 4 and 3.',
      fact: 'first-scale-box-1-frets',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap every note of box 1: {n:A} minor pentatonic between frets 5 and 8.',
      find: { scale: 'minor-pentatonic', tonic: 'A' },
      mode: 'all',
      octave: 'any',
      frets: [5, 8],
      explain: 'Two notes on each string: frets 5 and 8 on strings 6, 2 and 1, frets 5 and 7 on strings 5, 4 and 3. Twelve in all.',
      fact: 'first-scale-box-1-frets',
    },
    {
      type: 'card',
      title: 'One finger per fret',
      body: 'A common {t:fingering} keeps your hand still: **first finger** on fret 5, **third finger** on fret 7, **fourth finger** (the little one) on fret 8. Your hand sits in fifth {t:position} and never has to move.',
      tip: 'Keep your thumb behind the neck, about level with your second finger, and press with the fingertips.',
    },
    {
      type: 'choice',
      prompt: 'In box 1, which finger usually plays fret 8?',
      options: [
        { text: 'The fourth finger', correct: true },
        { text: 'The third finger', why: 'The third finger plays fret 7.' },
        { text: 'The first finger', why: 'The first finger stays on fret 5.' },
        { text: 'The second finger', why: 'Box 1 has no notes at fret 6, so the second finger rests.' },
      ],
      shuffle: false,
      explain: 'One finger per fret: 1 on fret 5, 3 on fret 7, 4 on fret 8.',
      fact: 'first-scale-box-1-fingers',
    },
    {
      type: 'order',
      prompt: 'Put the box notes of strings 6, 5 and 4 in playing order, from the lowest note up.',
      tiles: BOX.slice(0, 6).map(([s, f]) => tile(s, f)),
      explain: 'Low to high: string 6 at frets 5 and 8, string 5 at frets 5 and 7, string 4 at frets 5 and 7. That is {n:A} {n:C} {n:D} {n:E} {n:G} {n:A}.',
    },
    {
      type: 'true-false',
      statement: 'The lowest note of box 1 is the tonic, {n:A}.',
      answer: true,
      explain: 'String 6 at fret 5 is {n:A}, the tonic: box 1 starts on its home note.',
      fact: 'first-scale-box-1-name',
    },
    {
      type: 'play-phrase',
      prompt: 'Play box 1 from its lowest note to its highest, one note at a time.',
      notes: BOX_UP,
      octave: 'exact',
      tempo: 60,
      explain: 'Two notes per string, string 6 up to string 1: {n:A} {n:C} {n:D} {n:E} {n:G} {n:A} {n:C} {n:D} {n:E} {n:G} {n:A} {n:C}.',
      alternative: {
        type: 'order',
        prompt: 'Put the box notes of strings 3, 2 and 1 in playing order, from the lowest note up.',
        tiles: BOX.slice(6).map(([s, f]) => tile(s, f)),
        explain: 'String 3 at frets 5 and 7, string 2 at frets 5 and 8, string 1 at frets 5 and 8: {n:C} {n:D} {n:E} {n:G} {n:A} {n:C}.',
      },
    },
    { generate: 'neck-tones', params: { what: 'scale', scales: ['minor-pentatonic'], tonics: ['A'], span: 4, strings: [6, 5] } },
  ],
  facts: [
    {
      id: 'first-scale-box-1-frets',
      front: 'Which frets does box 1 of A minor pentatonic use on each string?',
      back: 'Frets 5 and 8 on strings 6, 2 and 1; frets 5 and 7 on strings 5, 4 and 3.',
      ask: {
        type: 'fretboard-find',
        prompt: 'Tap every note of box 1: {n:A} minor pentatonic between frets 5 and 8.',
        find: { scale: 'minor-pentatonic', tonic: 'A' },
        mode: 'all',
        octave: 'any',
        frets: [5, 8],
        explain: 'Frets 5 and 8 on strings 6, 2 and 1; frets 5 and 7 on strings 5, 4 and 3.',
      },
    },
    { id: 'first-scale-box-1-name', front: 'What do many players call the A minor pentatonic shape at frets 5 to 8?', back: 'Box 1 (or position 1). Its lowest note is the tonic, {n:A}.' },
    { id: 'first-scale-box-1-fingers', front: 'A common fingering for box 1?', back: 'First finger on fret 5, third finger on fret 7, fourth finger on fret 8.' },
  ],
};

const rootsInTheBox: Lesson = {
  id: 'roots-in-the-box',
  title: 'Where the roots are',
  teaches: 'Box 1 of A minor pentatonic contains three A notes, and phrases that end on one of them sound settled.',
  minutes: 3,
  skill: `theory:${U}:roots-in-the-box`,
  steps: [
    {
      type: 'card',
      title: 'Three As',
      body: 'Box 1 holds the tonic {n:A} **three times**: string 6 at fret 5, string 4 at fret 7 and string 1 at fret 5. Guitarists often call the tonic notes inside a shape its **{t:root|roots}**.',
      figure: { kind: 'fretboard', frets: [4, 9], dots: BOX.map(([s, f, n]) => dot(s, f, n, n === 'A' ? { role: 'root', label: 'R' } : {})), caption: 'The three roots of box 1 (R), among the other notes.' },
      tip: 'String 6, fret 5 to string 4, fret 7 is the octave shape you know: two strings across, two frets up.',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap all three {n:A} notes in box 1, between frets 5 and 8.',
      find: { note: 'A' },
      mode: 'all',
      octave: 'any',
      frets: [5, 8],
      explain: 'String 6 at fret 5, string 4 at fret 7 and string 1 at fret 5: three {n:A}s, each an octave apart.',
      fact: 'first-scale-box-1-roots',
    },
    {
      type: 'card',
      title: 'Ending at home',
      body: 'A phrase that ends on a root sounds **settled**, like a sentence that ends with a full stop. End it anywhere else and it sounds more like a question, waiting for more.',
      figure: { kind: 'tab', tempo: 80, notes: PHRASE_ON_ROOT, caption: 'A short phrase in box 1 that ends on the root at string 4, fret 7.' },
    },
    {
      type: 'listen-choice',
      prompt: 'Two phrases from the box. Which one ends on the root?',
      sound: { kind: 'tab', notes: [...PHRASE_ON_ROOT, { rest: true, duration: 'q' }, ...PHRASE_ON_D], tempo: 80 },
      options: [{ text: 'The first phrase', correct: true }, { text: 'The second phrase' }],
      shuffle: false,
      explain: 'The first ends on {n:A}, the root at string 4, fret 7, and sounds settled. The second stops on {n:D} and seems to wait for more.',
    },
    {
      type: 'true-false',
      statement: 'Guitarists often call the tonic notes inside a scale shape its roots.',
      answer: true,
      explain: 'In box 1 of {n:A} minor pentatonic, the roots are the three {n:A}s.',
      fact: 'first-scale-roots-word',
    },
    {
      type: 'choice',
      prompt: 'Which of these box 1 notes is a root?',
      options: [
        { text: 'String 4, fret 7', correct: true },
        { text: 'String 4, fret 5', why: 'That is {n:G}. The root on string 4 is at fret 7.' },
        { text: 'String 5, fret 5', why: 'That is {n:D}. String 5 has no root in box 1.' },
        { text: 'String 2, fret 8', why: 'That is {n:G}. String 2 has no root in box 1.' },
      ],
      explain: 'The roots of box 1 are string 6 at fret 5, string 4 at fret 7 and string 1 at fret 5.',
      fact: 'first-scale-box-1-roots',
    },
    {
      type: 'choice',
      prompt: 'You want a phrase from the box to sound finished. Which note should it end on?',
      options: [
        { text: '{n:A}, a root', correct: true },
        { text: '{n:D}', why: '{n:D} sounds unfinished here: it wants to move on.' },
        { text: '{n:G}', why: '{n:G} leans toward {n:A}, so it sounds like it wants one more note.' },
      ],
      explain: 'In {n:A} minor pentatonic, ending on {n:A}, the root, sounds settled.',
      fact: 'first-scale-end-on-root',
    },
    {
      type: 'play-phrase',
      prompt: 'Play this short phrase from the box. It lands on the root at string 4, fret 7.',
      notes: ROOT_LANDING,
      octave: 'exact',
      tempo: 70,
      explain: '{n:G}, {n:E}, {n:G}, then home to {n:A}. Now make up your own: any notes of the box, ending on one of the three roots.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'The phrase {n:G}, {n:E}, {n:G} wants to end on the root on string 4. Tap it.',
        find: { note: 'A3' },
        mode: 'one',
        octave: 'exact',
        frets: [5, 8],
        strings: [4],
        explain: 'The root on string 4 is at fret 7: {n:A}, two frets above the {n:G} at fret 5.',
      },
    },
  ],
  facts: [
    {
      id: 'first-scale-box-1-roots',
      front: 'Where are the A notes (the roots) in box 1 of A minor pentatonic?',
      back: 'String 6 at fret 5, string 4 at fret 7 and string 1 at fret 5.',
      ask: {
        type: 'fretboard-find',
        prompt: 'Tap all three {n:A} notes in box 1, between frets 5 and 8.',
        find: { note: 'A' },
        mode: 'all',
        octave: 'any',
        frets: [5, 8],
        explain: 'String 6 at fret 5, string 4 at fret 7 and string 1 at fret 5.',
      },
    },
    { id: 'first-scale-roots-word', front: 'What do guitarists often call the tonic notes inside a scale shape?', back: 'Its roots.' },
    { id: 'first-scale-end-on-root', front: 'How does a phrase that ends on the root sound?', back: 'Settled, like a sentence that ends with a full stop.' },
  ],
};

const movingTheBox: Lesson = {
  id: 'moving-the-box',
  title: 'Move the box, change the key',
  teaches: 'Slide the box along the neck and the tonic moves too: it is the string 6 note under your first finger.',
  minutes: 3,
  skill: `theory:${U}:moving-the-box`,
  steps: [
    {
      type: 'card',
      title: 'A shape that slides',
      body: 'Box 1 uses no open strings, so you can **slide the whole shape** along the neck. The shape stays the same; what changes is the **tonic**, and with it the {t:key}: which note is home. Here the box starts at fret 3.',
      figure: {
        kind: 'fretboard',
        frets: [3, 6],
        derive: { scale: 'minor-pentatonic', tonic: 'G' },
        caption: 'Box 1 at fret 3: the string 6 note under finger 1 is {n:G}.',
      },
    },
    {
      type: 'card',
      title: 'Find the tonic on string 6',
      body: 'To name the box, look at **string 6** under your **first finger**: that note is the tonic. At fret 5 it is {n:A}: {n:A} minor pentatonic. At fret 3, {n:G} minor pentatonic. At fret 8, {n:C} minor pentatonic.',
      figure: {
        kind: 'fretboard',
        frets: [8, 11],
        derive: { scale: 'minor-pentatonic', tonic: 'C' },
        caption: 'Box 1 at fret 8: {n:C} minor pentatonic.',
      },
      tip: 'Each fret you move the box moves the tonic a half step: from fret 7 ({n:B}) to fret 8 ({n:C}), for example.',
    },
    {
      type: 'choice',
      prompt: 'Box 1 with your first finger at fret 7 on string 6 is which minor pentatonic?',
      options: [
        { text: '{n:B} minor pentatonic', correct: true },
        { text: '{n:A} minor pentatonic', why: '{n:A} is at fret 5. Fret 7 is two frets higher.' },
        { text: '{n:C} minor pentatonic', why: '{n:C} is at fret 8, one fret higher.' },
        { text: '{n:G} minor pentatonic', why: '{n:G} is at fret 3.' },
      ],
      explain: 'String 6 at fret 7 is {n:B}, so the box there is {n:B} minor pentatonic.',
      fact: 'first-scale-tonic-on-string-6',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap the string 6 root for box 1 of {n:D} minor pentatonic.',
      find: { note: 'D3' },
      mode: 'one',
      octave: 'exact',
      frets: [6, 12],
      strings: [6],
      explain: 'String 6 at fret 10 is {n:D}: put your first finger there and the box is {n:D} minor pentatonic.',
      fact: 'first-scale-tonic-on-string-6',
    },
    {
      type: 'true-false',
      statement: 'Moving box 1 up one fret raises its tonic by a half step.',
      answer: true,
      explain: 'One fret is one half step, so the whole box, and its tonic, rise by a half step: from {n:B} at fret 7 to {n:C} at fret 8.',
      fact: 'first-scale-fret-half-step',
    },
    {
      type: 'type-answer',
      prompt: 'Box 1 starts at string 6, fret 12. Which minor pentatonic is it? Type the tonic.',
      answer: { kind: 'note', value: 'E', spelling: 'exact' },
      input: 'keypad',
      explain: 'Fret 12 repeats the open string an octave up: {n:E}. So the box there is {n:E} minor pentatonic.',
    },
    {
      type: 'choice',
      prompt: 'You slide box 1 from fret 5 down to fret 3. What changes?',
      options: [
        { text: 'The tonic: {n:A} becomes {n:G}', correct: true },
        { text: 'The shape', why: 'The shape stays exactly the same: that is why it can slide.' },
        { text: 'Nothing at all', why: 'The notes all move down two frets, so the tonic changes: {n:A} becomes {n:G}.' },
      ],
      explain: 'Same shape, new place: every note moves down two frets, so the tonic moves from {n:A} to {n:G}.',
      fact: 'first-scale-move-box',
    },
    { generate: 'note-on-string', params: { strings: [6], frets: [0, 12], naturals: true, ask: 'find' } },
    { generate: 'note-on-string', params: { strings: [6], frets: [0, 12], naturals: true, ask: 'name' } },
  ],
  facts: [
    { id: 'first-scale-move-box', front: 'What happens when you slide the whole box along the neck?', back: 'The shape stays the same and the tonic changes.' },
    {
      id: 'first-scale-tonic-on-string-6',
      front: 'Box 1 sits somewhere on the neck. How do you tell its tonic?',
      back: 'It is the string 6 note under your first finger: at fret 3 the box is {n:G} minor pentatonic, at fret 8 {n:C} minor pentatonic.',
      ask: {
        type: 'choice',
        prompt: 'Box 1 starts at fret 3 on string 6. Which minor pentatonic is it?',
        options: [
          { text: '{n:G} minor pentatonic', correct: true },
          { text: '{n:A} minor pentatonic', why: '{n:A} is at fret 5.' },
          { text: '{n:C} minor pentatonic', why: '{n:C} is at fret 8.' },
        ],
        explain: 'String 6 at fret 3 is {n:G}: the box there is {n:G} minor pentatonic.',
      },
    },
    { id: 'first-scale-fret-half-step', front: 'You move the box one fret. How far does its tonic move?', back: 'A half step, the same as one fret.' },
  ],
};

const makingMusicWithFiveNotes: Lesson = {
  id: 'making-music-with-five-notes',
  title: 'Making music with five notes',
  teaches: 'Short repeated ideas, space between phrases and endings on the root turn a scale into music.',
  minutes: 3,
  skill: `theory:${U}:making-music-with-five-notes`,
  steps: [
    {
      type: 'card',
      title: 'Say it twice',
      body: 'A scale is not music yet. Three habits make it so. First: play a **short idea**, then **repeat** it with a new ending. A listener hears the repeat and knows you meant it. Here is an idea in box 1, played twice: only the last note changes.',
      figure: { kind: 'tab', tempo: 80, notes: [...IDEA_ON_D, { rest: true, duration: 'h' }, ...IDEA_ON_A], caption: 'An original two-bar idea, twice: it ends on {n:D}, then on {n:A}.' },
    },
    {
      type: 'choice',
      prompt: 'What is the simplest way to make a melody sound like you meant it?',
      options: [
        { text: 'Repeat a short idea, then change its ending', correct: true },
        { text: 'Play every note of the box as fast as you can', why: 'Speed alone sounds like an exercise. A repeated idea sounds like music.' },
        { text: 'Never play the same thing twice', why: 'Repeating is what lets a listener hear your idea; change the ending to keep it fresh.' },
      ],
      explain: 'Repeat a short idea and change only its ending: the listener recognises it and hears it go somewhere new.',
      fact: 'first-scale-repeat-idea',
    },
    {
      type: 'card',
      title: 'Leave some space',
      body: 'Second: leave **silence** between phrases. You do not have to play all the time. A short pause lets the last idea land, like a breath between sentences, and gives the next one more weight.',
    },
    {
      type: 'true-false',
      statement: 'A good solo uses every note of the box in every bar.',
      answer: false,
      explain: 'Good solos choose a few notes and leave space between phrases. Five notes and some silence are plenty.',
      fact: 'first-scale-leave-space',
    },
    {
      type: 'card',
      title: 'End at home',
      body: 'Third: **end on a root**. In {n:A} minor, the note {n:A} sounds the most at rest. The first version of the idea ends on {n:D}, string 3 at fret 7, and sounds like a question. The second ends on {n:A}, string 4 at fret 7, and sounds finished.',
      figure: {
        kind: 'fretboard',
        frets: [4, 9],
        dots: [dot(3, 7, 'D4', { role: 'tone' }), dot(4, 7, 'A3', { role: 'root' })],
        caption: 'The two endings: {n:D} at string 3, fret 7 and the root {n:A} at string 4, fret 7.',
      },
    },
    {
      type: 'listen-choice',
      prompt: 'The idea is played twice. Which version sounds finished?',
      sound: { kind: 'tab', notes: [...IDEA_ON_D, { rest: true, duration: 'h' }, ...IDEA_ON_A], tempo: 80 },
      options: [{ text: 'The first version' }, { text: 'The second version', correct: true }],
      shuffle: false,
      explain: 'The second version ends on {n:A}, the root, and sounds at rest. The first stops on {n:D} and leaves you waiting.',
    },
    {
      type: 'choice',
      prompt: 'In {n:A} minor, which ending note sounds the most at rest?',
      options: [
        { text: '{n:A}', correct: true },
        { text: '{n:D}', why: '{n:D} sounds like a question: it wants to move on.' },
        { text: '{n:E}', why: '{n:E} sounds open, not finished: it leans back toward {n:A}.' },
        { text: '{n:C}', why: '{n:C} is close to home, but {n:A} itself is the resting place.' },
      ],
      explain: 'In {n:A} minor the home note is {n:A}: ending there sounds the most at rest.',
      fact: 'first-scale-rest-on-a',
    },
    {
      type: 'play-phrase',
      prompt: 'Play the idea ending on {n:D}, then play it again ending on the root, {n:A}.',
      notes: [...IDEA_ON_D, ...IDEA_ON_A],
      octave: 'exact',
      tempo: 80,
      explain: 'Only the last note changes: string 3, fret 7 ({n:D}) the first time, string 4, fret 7 ({n:A}) the second. Hear how the second one comes home.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'The idea ends on {n:D}, string 3, fret 7. Tap a root of the box to end on instead.',
        figure: { kind: 'tab', tempo: 80, notes: IDEA_ON_D },
        find: { note: 'A' },
        mode: 'one',
        octave: 'any',
        frets: [5, 8],
        explain: 'Any of the three {n:A}s will do; the nearest is string 4, fret 7, just one string away.',
      },
    },
  ],
  facts: [
    {
      id: 'first-scale-repeat-idea',
      front: 'What is the simplest way to make a melody sound intentional?',
      back: 'Repeat a short idea, then change its ending.',
    },
    { id: 'first-scale-leave-space', front: 'Do you have to play all the time in a solo?', back: 'No: leaving silence between phrases sounds musical.' },
    {
      id: 'first-scale-rest-on-a',
      front: 'In A minor, which ending note sounds the most at rest?',
      back: '{n:A}, the home note.',
      ask: {
        type: 'choice',
        prompt: 'In {n:A} minor, which ending note sounds the most at rest?',
        options: [{ text: '{n:A}', correct: true }, { text: '{n:D}' }, { text: '{n:E}' }, { text: '{n:G}' }],
        explain: 'In {n:A} minor the home note is {n:A}: ending there sounds the most at rest.',
      },
    },
  ],
};

/** Unit 7 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'Your first scale',
  theme: 'scales',
  description: 'What a scale is, and the A minor pentatonic scale in the shape guitarists use most.',
  lessons: [whatAScaleIs, aMinorPentatonic, theBoxAtFret5, rootsInTheBox, movingTheBox, makingMusicWithFiveNotes],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      {
        type: 'choice',
        prompt: 'What is a scale?',
        options: [
          { text: 'A set of notes in order of pitch', correct: true },
          { text: 'Several notes played together', why: 'Notes played together make a chord.' },
          { text: 'The speed of the beat', why: 'That is the tempo.' },
        ],
        explain: 'A scale is a set of notes arranged in order of pitch.',
      },
      {
        type: 'choice',
        prompt: 'What is the home note of a scale called?',
        options: [{ text: 'The tonic', correct: true }, { text: 'The octave' }, { text: 'The sharp' }, { text: 'The fret' }],
        explain: 'The tonic is the home note, and the scale is named after it.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Complete the {n:A} minor pentatonic scale.',
        text: '{n:A}  ___  {n:D}  ___  {n:G}',
        blanks: ['{n:C}', '{n:E}'],
        bank: ['{n:B}', '{n:F}'],
        explain: '{n:A} minor pentatonic is {n:A} {n:C} {n:D} {n:E} {n:G}.',
      },
      {
        type: 'choice',
        prompt: 'Which note is **not** in {n:A} minor pentatonic?',
        options: [{ text: '{n:B}', correct: true }, { text: '{n:C}' }, { text: '{n:E}' }, { text: '{n:G}' }],
        shuffle: false,
        explain: 'The scale is {n:A} {n:C} {n:D} {n:E} {n:G}: it has no {n:B}.',
      },
      {
        type: 'fretboard-find',
        prompt: 'Tap every note of box 1: {n:A} minor pentatonic between frets 5 and 8.',
        find: { scale: 'minor-pentatonic', tonic: 'A' },
        mode: 'all',
        octave: 'any',
        frets: [5, 8],
        explain: 'Frets 5 and 8 on strings 6, 2 and 1; frets 5 and 7 on strings 5, 4 and 3.',
      },
      {
        type: 'choice',
        prompt: 'On which strings does box 1 use frets 5 and 7?',
        options: [
          { text: 'Strings 5, 4 and 3', correct: true },
          { text: 'Strings 6, 2 and 1', why: 'Those use frets 5 and 8.' },
          { text: 'All six strings' },
        ],
        explain: 'Frets 5 and 7 on strings 5, 4 and 3; frets 5 and 8 on strings 6, 2 and 1.',
      },
      {
        type: 'fretboard-find',
        prompt: 'Tap the three roots of box 1, between frets 5 and 8.',
        find: { note: 'A' },
        mode: 'all',
        octave: 'any',
        frets: [5, 8],
        explain: 'The {n:A}s: string 6 at fret 5, string 4 at fret 7 and string 1 at fret 5.',
      },
      {
        type: 'choice',
        prompt: 'Box 1 with your first finger at fret 3 on string 6 is which minor pentatonic?',
        options: [
          { text: '{n:G} minor pentatonic', correct: true },
          { text: '{n:A} minor pentatonic', why: 'That is at fret 5.' },
          { text: '{n:C} minor pentatonic', why: 'That is at fret 8.' },
        ],
        explain: 'String 6 at fret 3 is {n:G}.',
      },
      {
        type: 'type-answer',
        prompt: 'Box 1 starts at string 6, fret 10. Which minor pentatonic is it? Type the tonic.',
        answer: { kind: 'note', value: 'D', spelling: 'exact' },
        input: 'keypad',
        explain: 'String 6 at fret 10 is {n:D}: {n:D} minor pentatonic.',
      },
      {
        type: 'fretboard-find',
        prompt: 'Tap the string 6 root for box 1 of {n:C} minor pentatonic.',
        find: { note: 'C3' },
        mode: 'one',
        octave: 'exact',
        frets: [6, 12],
        strings: [6],
        explain: 'String 6 at fret 8 is {n:C}.',
      },
      {
        type: 'true-false',
        statement: 'Sliding box 1 to another fret changes its shape.',
        answer: false,
        explain: 'The shape stays the same; only the tonic changes.',
      },
      {
        type: 'choice',
        prompt: 'In {n:A} minor, which ending note sounds the most at rest?',
        options: [{ text: '{n:A}', correct: true }, { text: '{n:D}' }, { text: '{n:E}' }, { text: '{n:G}' }],
        explain: 'Ending on the root, {n:A}, sounds settled.',
      },
      { generate: 'scale-notes', params: { scales: ['minor-pentatonic'], tonics: ['A'], form: 'order' } },
    ],
  },
};

export default unit;
