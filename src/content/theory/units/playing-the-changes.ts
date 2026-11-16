/**
 * Theory Path, unit 40: Improvising, playing the changes. Written from the syllabus entries in
 * `src/content/plan/theory-path.json` (unit `playing-the-changes`), one lesson per entry, in order:
 * each lesson opens with the "on the guitar" picture, asks the planned exercises, ends with the
 * planned drills, and turns every planned fact into a review card.
 *
 * Every fret, note, degree, arpeggio and phrase is cross-checked against `@/core/theory` and
 * `@/core/guitar` in `playing-the-changes.test.ts`. All phrases are original.
 *
 * Notes for readers of the code:
 * - A lesson sound plays one line at a time (no backing band under a solo). Listening questions
 *   that need the harmony pick the chord first (its notes, low to high), then play the line; the
 *   prompt names the chords, and the questions ask what the line itself does (does it lean on
 *   the outside note, step smoothly between guide tones, reach the target from above or below).
 * - Play steps listen for single notes, so each one plays a line, and its tapping alternative
 *   finds the same notes on the neck or puts them in order.
 */
import type { FillBlanksExercise, Lesson, TabNote, Unit } from '@/lessons';

const U = 'playing-the-changes';

type Dur = 'w' | 'h.' | 'h' | 'q.' | 'q' | 'e';
const n = (string: number, fret: number, duration: Dur): TabNote => ({ string, fret, duration });
const rest = (duration: Dur): TabNote => ({ rest: true, duration });

/** Open C (x32010) picked low to high, to set the harmony before a line. */
const C_CHORD = [n(5, 3, 'e'), n(4, 2, 'e'), n(3, 0, 'e'), n(2, 1, 'e')];
/** Over C, A7 and Dm, one bar each, in the 7th-fret position: the C# of A7 shows it follows the chords. */
const VERTICAL_LINE = [
  n(6, 8, 'q'), n(5, 7, 'q'), n(5, 10, 'q'), n(5, 7, 'q'),
  n(6, 9, 'q'), n(5, 7, 'q'), n(4, 7, 'q'), n(5, 10, 'q'),
  n(5, 8, 'q'), n(4, 7, 'q'), n(3, 7, 'h'),
];
/** Over A7: its arpeggio, C# E A G, then the G falls to F, the 3rd of Dm. */
const A7_TO_DM = [n(6, 9, 'q'), n(5, 7, 'q'), n(4, 7, 'q'), n(5, 10, 'q'), n(5, 8, 'h')];
/** The guide-tone line through Dm7 G7 Cmaj7 on string 2: F, F, E. */
const GUIDE_LINE = [n(2, 6, 'w'), n(2, 6, 'w'), n(2, 5, 'w')];
/** The guide-tone line decorated with eighth notes in fifth position: F, F and E start the bars. */
const GUIDE_DECORATED = [
  n(2, 6, 'e'), n(2, 5, 'e'), n(3, 7, 'e'), n(3, 5, 'e'), n(4, 7, 'e'), n(3, 5, 'e'), n(3, 7, 'e'), n(2, 5, 'e'),
  n(2, 6, 'e'), n(3, 7, 'e'), n(2, 6, 'e'), n(1, 5, 'e'), n(2, 8, 'e'), n(2, 6, 'e'), n(3, 7, 'e'), n(2, 6, 'e'),
  n(2, 5, 'w'),
];
/** A quarter-note solo over Dm7 G7 Cmaj7 whose bars start on the guide tones F, F, E. */
const GUIDE_SOLO = [n(2, 6, 'q'), n(1, 5, 'q'), n(2, 8, 'q'), n(2, 5, 'q'), n(2, 6, 'q'), n(3, 7, 'q'), n(2, 8, 'q'), n(2, 6, 'q'), n(2, 5, 'w')];
/** The same rhythm landing on the roots D, G, C instead. */
const ROOT_SOLO = [n(3, 7, 'q'), n(2, 6, 'q'), n(2, 5, 'q'), n(3, 5, 'q'), n(2, 8, 'q'), n(2, 6, 'q'), n(3, 7, 'q'), n(2, 5, 'q'), n(3, 5, 'w')];
/** Over C, from beat 3: C held into beat 4, D# on its "&", then E on beat 1. */
const APPROACH_PHRASE = [n(3, 5, 'q.'), n(2, 4, 'e'), n(2, 5, 'q')];
/** C picked, then F stepping down into E on beat 1: an approach from above. */
const FROM_ABOVE = [...C_CHORD, rest('q'), rest('e'), n(2, 6, 'e'), n(2, 5, 'w')];
/** C picked, then D# stepping up into E on beat 1: an approach from below. */
const FROM_BELOW = [...C_CHORD, rest('q'), rest('e'), n(2, 4, 'e'), n(2, 5, 'w')];
/** The enclosure F, D# on beat 4, then E on beat 1. */
const ENCLOSURE_E = [n(2, 6, 'e'), n(2, 4, 'e'), n(2, 5, 'q')];
/** Over G7 into Cmaj7: G B D climb the chord, F and D# enclose E on beat 1. */
const G7_ENCLOSURE = [n(4, 5, 'q'), n(3, 4, 'q'), n(3, 7, 'q'), n(2, 6, 'e'), n(2, 4, 'e'), n(2, 5, 'w')];
/** Enclosing B, the 3rd of G7, on string 3: C and A# on beat 4, then B on beat 1. */
const ENCLOSURE_B = [n(3, 5, 'e'), n(3, 3, 'e'), n(3, 4, 'q')];
/** C picked, then an enclosure of E. */
const ENCLOSED = [...C_CHORD, rest('q'), n(2, 6, 'e'), n(2, 4, 'e'), n(2, 5, 'w')];
/** Cmaj7 (x3545x) picked, then the Em7 arpeggio from string 5, fret 7. */
const CMAJ7_CHORD = [n(5, 3, 'e'), n(4, 5, 'e'), n(3, 4, 'e'), n(2, 5, 'e'), rest('h')];
const EM7_ARPEGGIO = [n(5, 7, 'q'), n(4, 5, 'q'), n(4, 9, 'q'), n(3, 7, 'q'), n(3, 9, 'q'), n(2, 8, 'q'), n(1, 7, 'q'), n(1, 10, 'q')];
/** Over Dm7: a two-note idea from D minor pentatonic at fret 10 (A, D), the same shape a fret up, then home. */
const PHRASE_IN = [n(2, 10, 'h'), n(1, 10, 'h')];
const PHRASE_OUT = [n(2, 11, 'h'), n(1, 11, 'h')];
const PHRASE_HOME = [n(2, 10, 'h'), n(1, 10, 'h')];
/** A second idea that stays in D minor pentatonic (F, G). */
const PHRASE_STAY = [n(3, 10, 'h'), n(3, 12, 'h')];

/** The guide-tone line as a fill-in, for the play step's tapping version and the review card. */
const GUIDE_FILL: FillBlanksExercise = {
  type: 'fill-blanks',
  prompt: 'Complete the guide-tone line through {c:Dm7} {c:G7} {c:Cmaj7}, starting on the 3rd of {c:Dm7}.',
  text: '{c:Dm7}: ___   {c:G7}: ___   {c:Cmaj7}: ___',
  blanks: ['{n:F}', '{n:F}', '{n:E}'],
  bank: ['{n:G}', '{n:D}', '{n:A}'],
  explain: '{n:F} is the 3rd of {c:Dm7} and stays as the 7th of {c:G7}, then falls a half step to {n:E}, the 3rd of {c:Cmaj7}.',
};

const horizontalAndVertical: Lesson = {
  id: 'horizontal-and-vertical',
  title: 'One scale or every chord',
  teaches: 'Horizontal playing uses one scale for a passage; vertical playing follows each chord; good players mix both.',
  minutes: 3,
  skill: `theory:${U}:horizontal-and-vertical`,
  steps: [
    {
      type: 'card',
      title: 'One scale for the passage',
      body: 'Over {c:C} {c:Am} {c:F} {c:G}, every chord is in {k:C major}, so one scale fits them all. Play {n:C} major pentatonic, root at string 6, fret 8, between frets 7 and 10, and stay there: that is {t:horizontal-playing|playing horizontally}.',
      figure: { kind: 'fretboard', frets: [7, 10], root: 'C', derive: { scale: 'major-pentatonic', tonic: 'C' }, caption: '{n:C} major pentatonic, frets 7 to 10: one scale for all four chords.' },
    },
    {
      type: 'true-false',
      statement: 'Over {c:C} {c:Am} {c:F} {c:G}, one {k:C major} scale fits every chord.',
      answer: true,
      explain: 'All four chords are built from the notes of {k:C major}, so one scale, or its pentatonic, fits the whole passage.',
      fact: 'changes-when-vertical',
    },
    {
      type: 'card',
      title: 'Chord by chord',
      body: 'Now {c:C} {c:A7} {c:Dm} {c:G7}. {c:A7} is {n:A} {n:C#} {n:E} {n:G}, and {n:C#} is not in {k:C major}. Follow each chord with its own tones instead: {t:vertical-playing|playing vertically}. In the same position, the {n:C#} sits at string 6, fret 9.',
      figure: {
        kind: 'fretboard',
        frets: [7, 10],
        root: 'A',
        labels: 'degree',
        dots: [
          { string: 6, fret: 9, note: 'C#3', degree: '3', role: 'third' },
          { string: 5, fret: 7, note: 'E3', degree: '5', role: 'fifth' },
          { string: 5, fret: 10, note: 'G3', degree: 'b7', role: 'seventh' },
          { string: 4, fret: 7, note: 'A3', degree: '1', role: 'root' },
        ],
        caption: '{c:A7} in the same position: its 3rd, {n:C#}, at string 6, fret 9.',
      },
    },
    {
      type: 'choice',
      prompt: 'Over {c:C} {c:A7} {c:Dm} {c:G7}, which chord needs a note from outside {k:C major}?',
      options: [
        { text: '{c:A7}', correct: true },
        { text: '{c:Dm}', why: '{c:Dm} is {n:D} {n:F} {n:A}: every note is in {k:C major}.' },
        { text: '{c:G7}', why: '{c:G7} is the {r:V7} of C: {n:G} {n:B} {n:D} {n:F}, all in the key.' },
        { text: '{c:C}', why: '{c:C} is the home chord of {k:C major}.' },
      ],
      explain: '{c:A7} has {n:C#}, its 3rd. Play {n:C} over it and you clash with the chord; play {n:C#} and you follow it.',
    },
    {
      type: 'listen-choice',
      prompt: 'This line goes with {c:C} {c:A7} {c:Dm}, one bar each. Did it follow each chord, or stay on one scale?',
      sound: { kind: 'tab', tempo: 92, notes: VERTICAL_LINE },
      options: [{ text: 'It followed each chord', correct: true }, { text: 'It stayed on one scale' }],
      shuffle: false,
      explain: 'Bar 1 outlined {c:C}, bar 2 played {n:C#} {n:E} {n:A} {n:G} for {c:A7}, and bar 3 {n:F} {n:A} {n:D} for {c:Dm}. The {n:C#} is the giveaway: no single {k:C major} scale has it.',
    },
    {
      type: 'play-phrase',
      prompt: 'Over {c:A7}, play its arpeggio, {n:C#} {n:E} {n:A} {n:G}, then resolve to {n:F} on {c:Dm}.',
      notes: A7_TO_DM,
      octave: 'exact',
      tempo: 80,
      explain: '{n:C#} at string 6, fret 9; {n:E} and {n:G} at frets 7 and 10 of string 5; {n:A} at string 4, fret 7. Then {n:G}, the 7th of {c:A7}, falls a step to {n:F}, the 3rd of {c:Dm}.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap every note of {c:A7} on strings 6 to 4, frets 7 to 10.',
        find: { chord: 'A7' },
        mode: 'all',
        octave: 'any',
        frets: [7, 10],
        strings: [6, 5, 4],
        explain: 'String 6 fret 9 ({n:C#}), string 5 frets 7 and 10 ({n:E}, {n:G}) and string 4 fret 7 ({n:A}): the 3rd, 5th, 7th and root.',
      },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each way of playing with what it does.',
      pairs: [
        { left: 'Horizontal', right: 'One scale for all' },
        { left: 'Vertical', right: 'Each chord\'s own tones' },
        { left: 'Mixing the two', right: 'What most players do' },
      ],
      explain: 'Horizontal playing keeps one scale for a passage in one key; vertical playing follows each chord. Most improvisers move between the two.',
      fact: 'changes-horizontal-vertical',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap the {n:C#} that {c:A7} brings, on string 6 between frets 7 and 10.',
      find: { note: 'C#3' },
      mode: 'one',
      octave: 'exact',
      frets: [7, 10],
      strings: [6],
      explain: 'String 6, fret 9 is {n:C#}: one fret above the {n:C} root of the pentatonic shape, at fret 8.',
    },
    {
      type: 'choice',
      prompt: 'How do most improvisers use horizontal and vertical playing?',
      options: [
        { text: 'They mix the two', correct: true },
        { text: 'One scale, always', why: 'One scale clashes as soon as a chord leaves the key, as {c:A7} does in C.' },
        { text: 'Chord tones, always', why: 'Following every chord can sound like an exercise; over a passage in one key, one scale is simpler and freer.' },
      ],
      shuffle: false,
      explain: 'Most players stay on one scale while the chords stay in the key, then follow the chords that leave it, such as {c:A7} in C.',
      fact: 'changes-mix-both',
    },
  ],
  facts: [
    {
      id: 'changes-horizontal-vertical',
      front: 'What is the difference between playing horizontally and vertically?',
      back: 'Horizontally: one scale over a whole passage in one key. Vertically: following each chord with its own tones or scale.',
    },
    {
      id: 'changes-when-vertical',
      front: 'When can one scale work over a progression, and when must you play vertically?',
      back: 'One scale can work when every chord stays in one key; when chords leave the key, follow them vertically.',
      ask: {
        type: 'choice',
        prompt: 'Over {c:G} {c:E7} {c:Am} {c:D7}, which chord leaves {k:G major}?',
        options: [
          { text: '{c:E7}', correct: true },
          { text: '{c:Am}', why: '{c:Am} is the {r:ii} of {k:G major}.' },
          { text: '{c:D7}', why: '{c:D7} is the {r:V7} of {k:G major}.' },
          { text: '{c:G}', why: '{c:G} is the home chord.' },
        ],
        explain: '{c:E7} has {n:G#}, its 3rd, which is not in {k:G major}. Over it, follow the chord.',
      },
    },
    { id: 'changes-mix-both', front: 'Do improvisers play only horizontally or only vertically?', back: 'Neither: most mix the two approaches.' },
  ],
};

const guideToneLines: Lesson = {
  id: 'guide-tone-lines',
  title: 'Guide-tone lines',
  teaches: 'A guide-tone line is a slow melody of 3rds and 7ths; decorating it makes a solo that follows the changes.',
  minutes: 4,
  skill: `theory:${U}:guide-tone-lines`,
  steps: [
    {
      type: 'card',
      title: 'Two notes that tell the chord',
      body: 'A {t:guide-tone} is a chord\'s 3rd or 7th. Join them from chord to chord and you get a {t:guide-tone-line}: a slow melody that moves by step or stays. Through {c:Dm7} {c:G7} {c:Cmaj7}: {n:F} (the 3rd), {n:F} (the 7th), {n:E} (the 3rd), all on string 2.',
      figure: { kind: 'tab', tempo: 90, notes: GUIDE_LINE, caption: 'String 2, frets 6, 6, 5: one note for each of {c:Dm7} {c:G7} {c:Cmaj7}.' },
    },
    {
      type: 'choice',
      prompt: 'Which notes make a guide-tone line?',
      options: [
        { text: 'The 3rds and 7ths of the chords', correct: true },
        { text: 'The roots and 5ths', why: 'Roots and 5ths leap by fourths and fifths, and they do not tell a major chord from a minor one.' },
        { text: 'Any notes of the key', why: 'A guide-tone line picks the two notes that define each chord: its 3rd and 7th.' },
      ],
      explain: 'The 3rd and 7th tell a chord\'s quality. From one chord to the next in a {t:two-five-one} they move by a half step or stay put, which makes a smooth line.',
      fact: 'changes-guide-tone-line',
    },
    {
      type: 'fill-blanks',
      prompt: 'The other guide-tone line through {c:Dm7} {c:G7} {c:Cmaj7} starts on the 7th of {c:Dm7}.',
      text: '{c:Dm7}: {n:C}   {c:G7}: {n:B}   {c:Cmaj7}: ___',
      blanks: ['{n:B}'],
      bank: ['{n:C}', '{n:A}', '{n:G}'],
      explain: '{n:C} is the 7th of {c:Dm7}, {n:B} the 3rd of {c:G7}, and {n:B} stays as the 7th of {c:Cmaj7}: a half step down, then no move at all.',
    },
    {
      type: 'type-answer',
      prompt: 'Type the 7th of {c:G7}: the guide tone that holds over from {c:Dm7}.',
      answer: { kind: 'note', value: 'F', spelling: 'exact' },
      input: 'keypad',
      explain: '{c:G7} is {n:G} {n:B} {n:D} {n:F}. Its 7th, {n:F}, is the same note as the 3rd of {c:Dm7}, so the line holds still while the chord changes.',
      fact: 'changes-guide-line-ffe',
    },
    {
      type: 'card',
      title: 'Decorate it',
      body: 'To solo with it, keep the guide tones on the {t:downbeat|downbeats} and decorate between them. Here, in fifth position, eighth notes run between them, and each bar starts on its guide tone: {n:F}, {n:F}, then {n:E}.',
      figure: { kind: 'audio', sound: { kind: 'tab', tempo: 84, notes: GUIDE_DECORATED }, label: 'Hear the decorated line' },
      tip: 'Sing the slow line while you play the fast one. If you can hear {n:F}, {n:F}, {n:E} inside the run, you are on track.',
    },
    {
      type: 'play-phrase',
      prompt: 'Play the guide-tone line on string 2, one note a bar, over {c:Dm7} {c:G7} {c:Cmaj7}: {n:F}, {n:F}, {n:E}.',
      notes: GUIDE_LINE,
      octave: 'exact',
      tempo: 90,
      explain: 'Fret 6 for {c:Dm7} and again for {c:G7}, then fret 5 for {c:Cmaj7}. Pick the second {n:F} again: the note stays, but its job changes from 3rd to 7th.',
      alternative: GUIDE_FILL,
    },
    {
      type: 'listen-choice',
      prompt: 'A solo over {c:Dm7} {c:G7} {c:Cmaj7}, one bar each. Does each bar start on a guide tone, or on the root?',
      sound: { kind: 'tab', tempo: 88, notes: GUIDE_SOLO },
      options: [{ text: 'On a guide tone', correct: true }, { text: 'On the root' }],
      shuffle: false,
      explain: 'The bars began on {n:F}, {n:F}, then {n:E}: the guide-tone line, moving by a half step at most. Starting on the roots, {n:D} {n:G} {n:C}, would leap by fourths and fifths.',
    },
    {
      type: 'true-false',
      statement: 'To solo with a guide-tone line, keep the guide tones on the downbeats and decorate between them.',
      answer: true,
      explain: 'The guide tones on the strong beats spell out each chord; the notes between them are free to run, bend or pause.',
      fact: 'changes-guide-downbeats',
    },
    { generate: 'chord-tones', params: { types: ['m7', '7', 'maj7'], roots: ['D', 'G', 'C', 'A', 'F', 'E', 'Bb'], ask: 'tone' } },
  ],
  facts: [
    {
      id: 'changes-guide-tone-line',
      front: 'What is a guide-tone line?',
      back: 'A simple melody made of the 3rds and 7ths of the chords, moving by step or staying.',
    },
    {
      id: 'changes-guide-line-ffe',
      front: 'Give a guide-tone line through {c:Dm7} {c:G7} {c:Cmaj7}, starting on the 3rd of {c:Dm7}.',
      back: '{n:F}, {n:F}, {n:E}: the 3rd of {c:Dm7}, the 7th of {c:G7}, the 3rd of {c:Cmaj7}.',
      ask: GUIDE_FILL,
    },
    {
      id: 'changes-guide-downbeats',
      front: 'How do you solo with a guide-tone line?',
      back: 'Keep the guide tones on the downbeats and decorate between them.',
    },
  ],
};

const approachNotes: Lesson = {
  id: 'approach-notes',
  title: 'Approach notes',
  teaches: 'An approach note leads into a target note by step, from the scale step above or a half step below.',
  minutes: 3,
  skill: `theory:${U}:approach-notes`,
  steps: [
    {
      type: 'card',
      title: 'Lean into the target',
      body: 'An {t:approach-note} leads into a {t:target-note} by step: from the scale note above, or from a half step below. Over {c:C}, aim at {n:E}, its 3rd, at string 2, fret 5. Step down into it from {n:F} at fret 6, or up from {n:D#} at fret 4.',
      figure: {
        kind: 'fretboard',
        frets: [3, 7],
        dots: [
          { string: 2, fret: 4, note: 'D#4', role: 'tone' },
          { string: 2, fret: 5, note: 'E4', role: 'target' },
          { string: 2, fret: 6, note: 'F4', role: 'tone' },
        ],
        caption: 'The target {n:E}, with {n:D#} below and {n:F} above.',
      },
    },
    {
      type: 'choice',
      prompt: 'Over {c:C}, which note is the scale-step approach from above into {n:E}?',
      options: [
        { text: '{n:F}', correct: true },
        { text: '{n:D#}', why: '{n:D#} approaches from a half step below.' },
        { text: '{n:G}', why: '{n:G} is a chord tone a third above, not a step.' },
        { text: '{n:A}', why: '{n:A} is a fourth above: too far to lead in by step.' },
      ],
      explain: 'The next note up the {k:C major} scale from {n:E} is {n:F}. Played just before {n:E}, it leans down into the target.',
      fact: 'changes-approach-note',
    },
    {
      type: 'type-answer',
      prompt: 'Type the approach note a half step below {n:A}.',
      answer: { kind: 'note', value: 'G#', spelling: 'exact' },
      input: 'keypad',
      explain: 'A half step below {n:A} is {n:G#}. Spell it with the letter below, G, because it rises into {n:A}.',
    },
    {
      type: 'card',
      title: 'Off the beat, onto the beat',
      body: 'Put the approach note on the {t:offbeat|off-beat}, the "&", so the target lands on the beat. The tension falls on a weak moment and the release on a strong one. Here {n:D#} on the "&" of 4 slides into {n:E} on beat 1.',
      figure: { kind: 'tab', tempo: 80, notes: APPROACH_PHRASE, caption: '{n:C} on beat 3, held; {n:D#} on the "&" of 4; {n:E} on beat 1.' },
    },
    {
      type: 'play-phrase',
      prompt: 'Over {c:C}, play {n:C} on beat 3 and hold it. Then approach {n:E} from {n:D#} on the "&" of 4 and land on beat 1.',
      notes: APPROACH_PHRASE,
      octave: 'exact',
      tempo: 80,
      explain: '{n:C} at string 3, fret 5; then {n:D#} at string 2, fret 4 for only half a beat, and {n:E} at fret 5 on beat 1. Slide or re-pick, as long as {n:E} arrives on time.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap the approach note a half step below {n:E} on string 2.',
        find: { note: 'D#4' },
        mode: 'one',
        octave: 'exact',
        frets: [3, 7],
        strings: [2],
        explain: 'String 2, fret 4 is {n:D#}: one fret below the target {n:E} at fret 5.',
      },
    },
    {
      type: 'listen-choice',
      prompt: 'Over {c:C}, a line lands on {n:E}. Did it approach from above or from below?',
      sound: { kind: 'tab', tempo: 80, notes: FROM_ABOVE },
      options: [{ text: 'From above', correct: true }, { text: 'From below' }],
      shuffle: false,
      explain: 'After the {c:C} chord, {n:F} stepped down into {n:E}: an approach from the scale note above.',
    },
    {
      type: 'true-false',
      statement: 'A chromatic approach from a half step below works into almost any chord tone.',
      answer: true,
      explain: 'A half step below leads up strongly into any target: {n:B} into {n:C}, {n:F#} into {n:G}, {n:G#} into {n:A}.',
      fact: 'changes-chromatic-below',
    },
    {
      type: 'listen-choice',
      prompt: 'And this line, over {c:C} again: from above or from below?',
      sound: { kind: 'tab', tempo: 80, notes: FROM_BELOW },
      options: [{ text: 'From above' }, { text: 'From below', correct: true }],
      shuffle: false,
      explain: 'This time {n:D#}, a half step below, rose into {n:E}: a chromatic approach from below.',
    },
    {
      type: 'choice',
      prompt: 'You want the target to land on beat 1. Where does the approach note go?',
      options: [
        { text: 'On the "&" of 4, just before', correct: true },
        { text: 'On beat 1, with the target after it', why: 'Then the tense note takes the strong beat and the target arrives late.' },
        { text: 'On beat 3', why: 'Too early: the line would hang on the approach note before it reaches the target.' },
      ],
      shuffle: false,
      explain: 'On the "&" of 4 the approach note is a quick lean on a weak moment, and the target arrives exactly on beat 1.',
      fact: 'changes-approach-offbeat',
    },
    { generate: 'interval-note', params: { intervals: ['m2'], direction: 'down', roots: ['E', 'A', 'G', 'C', 'D', 'B', 'F'] } },
  ],
  facts: [
    {
      id: 'changes-approach-note',
      front: 'What is an approach note?',
      back: 'A note that leads into a target note by step: from the scale note above or from a half step below.',
    },
    {
      id: 'changes-chromatic-below',
      front: 'Which approach works into almost any chord tone?',
      back: 'A chromatic approach from a half step below.',
      ask: {
        type: 'type-answer',
        prompt: 'Type the approach note a half step below {n:G}.',
        answer: { kind: 'note', value: 'F#', spelling: 'exact' },
        input: 'keypad',
        explain: 'A half step below {n:G} is {n:F#}, spelled with the letter below because it rises into {n:G}.',
      },
    },
    {
      id: 'changes-approach-offbeat',
      front: 'Where does an approach note go, so that the target lands on the beat?',
      back: 'On the off-beat just before it, such as the "&" of 4 before beat 1.',
    },
  ],
};

const enclosures: Lesson = {
  id: 'enclosures',
  title: 'Enclosures',
  teaches: 'An enclosure surrounds a target with notes above and below before landing on it, usually on a strong beat.',
  minutes: 3,
  skill: `theory:${U}:enclosures`,
  steps: [
    {
      type: 'card',
      title: 'Surround the target',
      body: 'An {t:enclosure} surrounds a target note with notes above and below it before landing on it. The common one: the scale note above, the half step below, then the target. Into {n:E}, the 3rd of {c:Cmaj7}: {n:F}, {n:D#}, then {n:E} on beat 1.',
      figure: { kind: 'tab', tempo: 80, notes: ENCLOSURE_E, caption: '{n:F} and {n:D#} on beat 4, {n:E} on beat 1 of the {c:Cmaj7} bar.' },
    },
    {
      type: 'order',
      prompt: 'Order the common enclosure of {n:C}: the scale note above, the half step below, then the target.',
      tiles: ['{n:D}', '{n:B}', '{n:C}'],
      distractors: ['{n:E}'],
      explain: '{n:D} is the scale note above {n:C}, {n:B} the half step below, and {n:C} the target, landing last.',
    },
    {
      type: 'choice',
      prompt: 'Enclose {n:A} in {k:C major}, scale note above first. Which two notes come before {n:A}?',
      options: [
        { text: '{n:B}, then {n:G#}', correct: true },
        { text: '{n:G#}, then {n:B}', why: 'That starts below. It is an enclosure too, but the question asks for the scale note above first.' },
        { text: '{n:B}, then {n:G}', why: '{n:G} is a whole step below; the common enclosure uses the half step, {n:G#}.' },
        { text: '{n:Bb}, then {n:G#}', why: '{n:Bb} is a half step above; the common enclosure starts on the scale note, {n:B}.' },
      ],
      explain: '{n:B} is the next note of {k:C major} above {n:A}, and {n:G#} is the half step below. Together they close in on {n:A}.',
      fact: 'changes-enclosure-fde',
    },
    {
      type: 'card',
      title: 'Bebop timing',
      body: 'Bebop players used enclosures all the time, timed so the target lands on a strong beat. Hear one over {c:G7} into {c:Cmaj7}: {n:G} {n:B} {n:D} climb the chord, {n:F} and {n:D#} close in, and {n:E} arrives on beat 1.',
      figure: { kind: 'audio', sound: { kind: 'tab', tempo: 84, notes: G7_ENCLOSURE }, label: 'Hear the enclosure' },
    },
    {
      type: 'play-phrase',
      prompt: 'Enclose {n:B}, the 3rd of {c:G7}, on string 3: play {n:C} and {n:A#} on beat 4, then {n:B} on beat 1.',
      notes: ENCLOSURE_B,
      octave: 'exact',
      tempo: 80,
      explain: '{n:C} at fret 5, {n:A#} at fret 3, then {n:B} at fret 4: above, below, and in. Fingers 3, 1 and 2 keep the hand still.',
      alternative: {
        type: 'order',
        prompt: 'Order the enclosure of {n:B}, the 3rd of {c:G7}: scale note above, half step below, target.',
        tiles: ['{n:C}', '{n:A#}', '{n:B}'],
        distractors: ['{n:D}'],
        explain: '{n:C} is the scale note above {n:B}, {n:A#} the half step below, and {n:B} lands on beat 1.',
      },
    },
    {
      type: 'listen-choice',
      prompt: 'Over {c:C}, a line lands on {n:E}. Was the target enclosed, or approached from one side?',
      sound: { kind: 'tab', tempo: 80, notes: ENCLOSED },
      options: [{ text: 'Enclosed: above, then below', correct: true }, { text: 'Approached from one side' }],
      shuffle: false,
      explain: 'After the chord came {n:F}, above the target, then {n:D#}, below it, then {n:E}: an enclosure.',
    },
    {
      type: 'true-false',
      statement: 'Enclosures timed so the target lands on a strong beat are a hallmark of bebop.',
      answer: true,
      explain: 'Bebop lines are full of them: two quick notes on the off-beats around the target, and the chord tone itself on the beat.',
      fact: 'changes-enclosure-bebop',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap the half step below {n:B} on string 3, between frets 2 and 6.',
      find: { note: 'A#3' },
      mode: 'one',
      octave: 'exact',
      frets: [2, 6],
      strings: [3],
      explain: 'String 3, fret 3 is {n:A#}: one fret below {n:B} at fret 4.',
    },
    {
      type: 'listen-choice',
      prompt: 'And this line over {c:C}: enclosed, or from one side?',
      sound: { kind: 'tab', tempo: 80, notes: FROM_BELOW },
      options: [{ text: 'Enclosed: above, then below' }, { text: 'Approached from one side', correct: true }],
      shuffle: false,
      explain: 'Only {n:D#}, from below, led into {n:E}: a single approach note, not an enclosure.',
    },
    {
      type: 'choice',
      prompt: 'What makes an enclosure different from a single approach note?',
      options: [
        { text: 'It surrounds the target from above and below', correct: true },
        { text: 'It uses only chord tones', why: 'The surrounding notes are usually not chord tones: a scale note and a chromatic one.' },
        { text: 'It lands on an off-beat', why: 'An enclosure is usually timed so the target lands on a strong beat.' },
      ],
      explain: 'An approach note comes from one side; an enclosure visits both sides of the target before landing on it.',
      fact: 'changes-enclosure',
    },
  ],
  facts: [
    { id: 'changes-enclosure', front: 'What is an enclosure?', back: 'Notes above and below a target note, played just before landing on it.' },
    {
      id: 'changes-enclosure-fde',
      front: 'What is the common enclosure of {n:E}?',
      back: 'The scale note above, then the half step below, then the target: {n:F}, {n:D#}, {n:E}.',
      ask: {
        type: 'order',
        prompt: 'Order the common enclosure of {n:E}: scale note above, half step below, target.',
        tiles: ['{n:F}', '{n:D#}', '{n:E}'],
        distractors: ['{n:G}'],
        explain: '{n:F} is the scale note above {n:E}, {n:D#} the half step below, and {n:E} the target.',
      },
    },
    {
      id: 'changes-enclosure-bebop',
      front: 'In which style are enclosures a hallmark, and how are they timed?',
      back: 'Bebop: they are timed so the target lands on a strong beat.',
    },
  ],
};

const arpeggioSubstitution: Lesson = {
  id: 'arpeggio-substitution',
  title: 'Arpeggios a third up',
  teaches: "Playing the seventh arpeggio built on a chord's 3rd adds the 9th while keeping the 3rd, 5th and 7th.",
  minutes: 4,
  skill: `theory:${U}:arpeggio-substitution`,
  steps: [
    {
      type: 'card',
      title: 'Start on the 3rd',
      body: 'Over a chord, play the seventh arpeggio that starts on its 3rd. Over {c:Cmaj7} (x3545x), {c:Em7} gives {n:E} {n:G} {n:B} {n:D}: the 3rd, 5th and 7th of {c:Cmaj7}, plus {n:D}, the 9th, an {t:extension}. The root drops out and the colour gets richer.',
      figure: {
        kind: 'fretboard',
        frets: [5, 10],
        root: 'C',
        labels: 'degree',
        dots: [
          { string: 5, fret: 7, note: 'E3', degree: '3', role: 'third' },
          { string: 4, fret: 5, note: 'G3', degree: '5', role: 'fifth' },
          { string: 4, fret: 9, note: 'B3', degree: '7', role: 'seventh' },
          { string: 3, fret: 7, note: 'D4', degree: '9', role: 'target' },
          { string: 3, fret: 9, note: 'E4', degree: '3', role: 'third' },
          { string: 2, fret: 8, note: 'G4', degree: '5', role: 'fifth' },
          { string: 1, fret: 7, note: 'B4', degree: '7', role: 'seventh' },
          { string: 1, fret: 10, note: 'D5', degree: '9', role: 'target' },
        ],
        caption: '{c:Em7} from string 5, fret 7, named against {c:Cmaj7}: 3, 5, 7 and 9.',
      },
    },
    {
      type: 'listen-choice',
      prompt: 'First {c:Cmaj7}, then an arpeggio over it. Was it the {c:Cmaj7} arpeggio or the {c:Em7} arpeggio?',
      sound: { kind: 'tab', tempo: 92, notes: [...CMAJ7_CHORD, ...EM7_ARPEGGIO] },
      options: [{ text: 'The {c:Cmaj7} arpeggio' }, { text: 'The {c:Em7} arpeggio', correct: true }],
      shuffle: false,
      explain: 'It began on {n:E}, not {n:C}, and each octave topped out on {n:D}: {n:E} {n:G} {n:B} {n:D}, the 3, 5, 7 and 9 of {c:Cmaj7}.',
    },
    {
      type: 'type-answer',
      prompt: 'Over {c:Am7}, which seventh arpeggio starts on its 3rd? Type the chord.',
      answer: { kind: 'chord', value: 'Cmaj7', spelling: 'exact' },
      explain: 'The 3rd of {c:Am7} is {n:C}. Stacking thirds from {n:C} with the notes of {k:A minor} gives {n:C} {n:E} {n:G} {n:B}: {c:Cmaj7}, the {d:b3}, {d:5}, {d:b7} and {d:9} of {c:Am7}.',
    },
    {
      type: 'card',
      title: 'Through a two-five-one',
      body: 'The same move works on every chord of a {t:two-five-one}. Over {c:Dm7}, play {c:Fmaj7}: {n:F} {n:A} {n:C} {n:E}, the {d:b3}, {d:5}, {d:b7} and {d:9}. Over {c:G7}, play {c:Bm7b5}: {n:B} {n:D} {n:F} {n:A}, the {d:3}, {d:5}, {d:b7} and {d:9}, a {c:G9} sound without the root.',
    },
    {
      type: 'choice',
      prompt: '{c:Bm7b5} over {c:G7} adds which extension?',
      options: [
        { text: 'The 9th, {n:A}', correct: true },
        { text: 'The 11th, {n:C}', why: '{n:C} is not in {c:Bm7b5}, which is {n:B} {n:D} {n:F} {n:A}.' },
        { text: 'The 13th, {n:E}', why: '{n:E} is not in {c:Bm7b5} either.' },
        { text: 'The {d:b9}, {n:Ab}', why: '{c:Bm7b5} has {n:A} natural: the plain 9th of {c:G7}.' },
      ],
      explain: '{c:Bm7b5} is {n:B} {n:D} {n:F} {n:A}: the 3rd, 5th and 7th of {c:G7}, plus {n:A}, the 9th. Together they sound like {c:G9} with no root.',
      fact: 'changes-bm7b5-over-g7',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each chord with the seventh arpeggio that starts on its 3rd.',
      pairs: [
        { left: '{c:Cmaj7}', right: '{c:Em7}' },
        { left: '{c:Dm7}', right: '{c:Fmaj7}' },
        { left: '{c:G7}', right: '{c:Bm7b5}' },
        { left: '{c:Fmaj7}', right: '{c:Am7}' },
      ],
      explain: 'Each arpeggio starts on the 3rd of its chord and climbs in thirds through the key of C: 3, 5, 7, then the 9th on top.',
      fact: 'changes-em7-over-cmaj7',
    },
    {
      type: 'play-phrase',
      prompt: 'Over {c:Cmaj7}, play the {c:Em7} arpeggio from string 5, fret 7, up to string 2, fret 8.',
      notes: EM7_ARPEGGIO.slice(0, 6),
      octave: 'exact',
      tempo: 80,
      explain: '{n:E} {n:G} {n:B} {n:D}, then {n:E} {n:G} again: string 5 fret 7, string 4 frets 5 and 9, string 3 frets 7 and 9, string 2 fret 8. The top of the shape, frets 7 and 10 of string 1, adds {n:B} and {n:D}.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap every note of {c:Em7} on strings 5 to 3, frets 5 to 9.',
        find: { chord: 'Em7' },
        mode: 'all',
        octave: 'any',
        frets: [5, 9],
        strings: [5, 4, 3],
        explain: 'String 5 frets 5 and 7 ({n:D}, {n:E}), string 4 frets 5 and 9 ({n:G}, {n:B}), string 3 frets 7 and 9 ({n:D}, {n:E}).',
      },
    },
    {
      type: 'choice',
      prompt: 'Over {c:Dm7}, which arpeggio adds the 9th while keeping the {d:b3}, {d:5} and {d:b7}?',
      options: [
        { text: '{c:Fmaj7}', correct: true },
        { text: '{c:Am7}', why: '{c:Am7} starts on the 5th of {c:Dm7}: it gives the {d:5}, {d:b7}, {d:9} and 11, but no 3rd.' },
        { text: '{c:Dm7}', why: 'That is the chord itself: root, {d:b3}, {d:5} and {d:b7}, with no 9th.' },
        { text: '{c:F7}', why: '{c:F7} has {n:Eb}, the {d:b9} of {c:Dm7}, which clashes with the chord.' },
      ],
      explain: '{c:Fmaj7} starts on {n:F}, the 3rd of {c:Dm7}: {n:F} {n:A} {n:C} {n:E} are its {d:b3}, {d:5}, {d:b7} and {d:9}.',
      fact: 'changes-fmaj7-over-dm7',
    },
    { generate: 'chord-tones', params: { types: ['m7', 'maj7', 'm7b5'], roots: ['E', 'F', 'B', 'A', 'C', 'D', 'G'], ask: 'notes' } },
  ],
  facts: [
    {
      id: 'changes-em7-over-cmaj7',
      front: 'Over {c:Cmaj7}, what does an {c:Em7} arpeggio give?',
      back: '{n:E} {n:G} {n:B} {n:D}: the {d:3}, {d:5}, {d:7} and {d:9} of {c:Cmaj7}.',
      ask: {
        type: 'choice',
        prompt: 'Over {c:Cmaj7}, which note does an {c:Em7} arpeggio add?',
        options: [
          { text: '{n:D}, the 9th', correct: true },
          { text: '{n:C}, the root', why: '{c:Em7} is {n:E} {n:G} {n:B} {n:D}: the root drops out.' },
          { text: '{n:F}, the 11th', why: '{n:F} is not in {c:Em7}, and it clashes with the {n:E} of {c:Cmaj7}.' },
          { text: '{n:A}, the 13th', why: '{n:A} is not in {c:Em7}.' },
        ],
        explain: '{c:Em7} keeps the 3rd, 5th and 7th of {c:Cmaj7} ({n:E} {n:G} {n:B}) and adds {n:D}, the 9th.',
      },
    },
    {
      id: 'changes-fmaj7-over-dm7',
      front: 'Over {c:Dm7}, what does an {c:Fmaj7} arpeggio give?',
      back: '{n:F} {n:A} {n:C} {n:E}: the {d:b3}, {d:5}, {d:b7} and {d:9} of {c:Dm7}.',
    },
    {
      id: 'changes-bm7b5-over-g7',
      front: 'Over {c:G7}, what does a {c:Bm7b5} arpeggio give?',
      back: '{n:B} {n:D} {n:F} {n:A}: the {d:3}, {d:5}, {d:b7} and {d:9}, a {c:G9} sound without the root.',
    },
  ],
};

const playingOutside: Lesson = {
  id: 'playing-outside',
  title: 'Going outside and coming back',
  teaches: 'Outside playing leaves the key on purpose and works when the phrase is clear and resolves back inside.',
  minutes: 3,
  skill: `theory:${U}:playing-outside`,
  steps: [
    {
      type: 'card',
      title: 'Out on purpose',
      body: '{t:outside-playing|Outside playing} leaves the key on purpose for a moment. The simplest way is {t:side-slipping}: play a phrase, move it a half step, then bring it back. Over a {c:Dm7} {t:vamp}: {n:A} and {n:D} from {n:D} minor pentatonic at fret 10, the same shape at fret 11, then home again.',
      figure: { kind: 'tab', tempo: 84, notes: [...PHRASE_IN, ...PHRASE_OUT, ...PHRASE_HOME], caption: 'In at fret 10, out at fret 11, back at fret 10.' },
    },
    {
      type: 'listen-choice',
      prompt: 'Over a {c:Dm7} vamp: did the phrase slip outside and come back?',
      sound: { kind: 'tab', tempo: 84, notes: [...PHRASE_IN, ...PHRASE_OUT, ...PHRASE_HOME] },
      options: [{ text: 'Yes: out a half step, then back', correct: true }, { text: 'No: it stayed inside' }],
      shuffle: false,
      explain: 'The second phrase was the first one moved up a fret, to {n:Bb} and {n:Eb}: both outside {n:D} minor pentatonic. The third came home and settled on {n:D}.',
    },
    {
      type: 'true-false',
      statement: 'Outside phrases work best when they never resolve.',
      answer: false,
      explain: 'Outside notes sound like mistakes if they just stop. They work when the phrase is clear and lands convincingly back inside, as the third phrase does on {n:D}.',
      fact: 'changes-outside-works',
    },
    {
      type: 'choice',
      prompt: 'A {n:D} minor pentatonic phrase at fret 10 moves up one fret. Which scale does it play now?',
      options: [
        { text: '{n:Eb} minor pentatonic', correct: true },
        { text: '{n:E} minor pentatonic', why: 'That would be two frets up, a whole step.' },
        { text: '{n:C#} minor pentatonic', why: 'That is one fret down, not up.' },
        { text: '{n:D} minor pentatonic', why: 'The shape moved, so every note moved with it.' },
      ],
      explain: 'One fret is a half step, so the shape now plays {n:Eb} minor pentatonic: {n:Eb} {n:Gb} {n:Ab} {n:Bb} {n:Db}, none of them in {n:D} minor pentatonic.',
      fact: 'changes-side-slipping',
    },
    {
      type: 'play-phrase',
      prompt: 'Over {c:Dm7}, play {n:A} and {n:D} at fret 10, slide the shape up a fret, then bring it home to fret 10.',
      notes: [...PHRASE_IN, ...PHRASE_OUT, ...PHRASE_HOME],
      octave: 'exact',
      tempo: 84,
      explain: 'Strings 2 and 1 at fret 10, then both at fret 11 ({n:Bb} and {n:Eb}), then home, holding the {n:D} at string 1, fret 10. One finger can barre each pair.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'The phrase starts at string 2, fret 10. Slip it up a half step: tap where it starts now.',
        find: { note: 'A#4' },
        mode: 'one',
        octave: 'exact',
        frets: [8, 14],
        strings: [2],
        explain: 'One fret up: string 2, fret 11, the {n:Bb} that starts the outside phrase.',
      },
    },
    {
      type: 'card',
      title: 'The tritone trick',
      body: 'Another standard outside sound: over {c:G7}, play ideas from {c:Db7}, its {t:tritone-substitution|tritone substitute}. {c:Db7} is {n:Db} {n:F} {n:Ab} {n:Cb}. Over {c:G7} those are the {d:b5}, the {d:b7}, the {d:b9} and the 3rd ({n:Cb} sounds as {n:B}): tense, yet they lead straight home.',
      figure: {
        kind: 'fretboard',
        frets: [3, 7],
        root: 'G',
        labels: 'degree',
        dots: [
          { string: 4, fret: 3, note: 'F', degree: 'b7', role: 'seventh' },
          { string: 4, fret: 6, note: 'Ab', degree: 'b9', role: 'tone' },
          { string: 3, fret: 4, note: 'Cb', degree: '3', role: 'third' },
          { string: 3, fret: 6, note: 'Db', degree: 'b5', role: 'tone' },
          { string: 2, fret: 6, note: 'F', degree: 'b7', role: 'seventh' },
          { string: 1, fret: 4, note: 'Ab', degree: 'b9', role: 'tone' },
          { string: 1, fret: 7, note: 'Cb', degree: '3', role: 'third' },
        ],
        caption: 'The notes of {c:Db7} on strings 4 to 1, named against {c:G7}.',
      },
    },
    {
      type: 'choice',
      prompt: 'Over {c:G7}, ideas from which chord give the standard tritone outside sound?',
      options: [
        { text: '{c:Db7}', correct: true },
        { text: '{c:D7}', why: '{c:D7} is a fifth above {c:G7}, not a tritone, and its {n:F#} just clashes with the {n:F} of {c:G7}.' },
        { text: '{c:Ab7}', why: '{c:Ab7} is a half step above: that side-slips the chord; it is not the tritone sound.' },
        { text: '{c:C7}', why: '{c:C7} is a fourth above {c:G7}, not a tritone away.' },
      ],
      explain: '{c:Db7} is a tritone from {c:G7} and shares its 3rd and 7th ({n:B} as {n:Cb}, and {n:F}). Its other notes add the {d:b5} and {d:b9}. This is tritone {t:superimposition}.',
      fact: 'changes-db7-over-g7',
    },
    {
      type: 'type-answer',
      prompt: 'Type the tritone substitute of {c:G7}.',
      answer: { kind: 'chord', value: 'Db7', spelling: 'any' },
      explain: 'A tritone above {n:G} is {n:Db}, so the substitute is {c:Db7}: it shares {n:F} and {n:B} ({n:Cb}) with {c:G7}.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each outside idea with what it does.',
      pairs: [
        { left: 'Side-slipping', right: 'A half step out and back' },
        { left: 'Tritone superimposition', right: '{c:Db7} ideas over {c:G7}' },
        { left: 'Coming back inside', right: 'Releases the tension' },
      ],
      explain: 'Side-slipping shifts a phrase a half step; tritone superimposition plays the substitute dominant over the real one; landing back inside is what makes either sound intended.',
    },
    {
      type: 'listen-choice',
      prompt: 'Over {c:Dm7} again. Did this phrase slip outside, or stay inside?',
      sound: { kind: 'tab', tempo: 84, notes: [...PHRASE_IN, ...PHRASE_STAY, ...PHRASE_HOME] },
      options: [{ text: 'Yes: out a half step, then back' }, { text: 'No: it stayed inside', correct: true }],
      shuffle: false,
      explain: 'Every note came from {n:D} minor pentatonic: {n:A} {n:D}, then {n:F} {n:G}, then {n:A} {n:D} again. A new idea, but no notes outside.',
    },
  ],
  facts: [
    {
      id: 'changes-side-slipping',
      front: 'What is side-slipping?',
      back: 'Moving a phrase a half step away from the key and back, creating tension that resolves.',
    },
    { id: 'changes-outside-works', front: 'When does outside playing work?', back: 'When the outside phrase is clear and resolves convincingly back inside.' },
    {
      id: 'changes-db7-over-g7',
      front: 'Over {c:G7}, which chord\'s ideas give a standard outside sound?',
      back: '{c:Db7}, its tritone substitute: tritone superimposition.',
      ask: {
        type: 'type-answer',
        prompt: 'Over {c:G7}, ideas from which dominant 7th chord give the tritone outside sound? Type it.',
        answer: { kind: 'chord', value: 'Db7', spelling: 'any' },
        explain: '{c:Db7}, a tritone from {c:G7}: it shares the 3rd and 7th and adds the {d:b5} and {d:b9}.',
      },
    },
  ],
};

const unit: Unit = {
  id: U,
  title: 'Improvising: playing the changes',
  theme: 'improvisation',
  description: 'Horizontal and vertical playing, guide-tone lines, approach notes, enclosures, arpeggio substitution and outside playing.',
  lessons: [horizontalAndVertical, guideToneLines, approachNotes, enclosures, arpeggioSubstitution, playingOutside],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      {
        type: 'choice',
        prompt: 'Over {c:Am} {c:Dm} {c:Em} {c:Am}, all in {k:A minor}, what is the simplest way to solo?',
        options: [
          { text: 'One scale for the whole passage', correct: true },
          { text: 'A new scale for every chord', why: 'Every chord is in {k:A minor}, so one scale fits them all.' },
          { text: 'Only the roots of the chords', why: 'Roots alone make a bass line, not a solo.' },
        ],
        explain: 'When every chord stays in one key, one scale, here {k:A minor} or its pentatonic, works over the whole passage: playing horizontally.',
      },
      {
        type: 'choice',
        prompt: 'Over {c:F} {c:D7} {c:Gm} {c:C7}, which chord leaves {k:F major}?',
        options: [
          { text: '{c:D7}', correct: true },
          { text: '{c:Gm}', why: '{c:Gm} is the {r:ii} of {k:F major}.' },
          { text: '{c:C7}', why: '{c:C7} is the {r:V7} of {k:F major}.' },
          { text: '{c:F}', why: '{c:F} is the home chord.' },
        ],
        explain: '{c:D7} has {n:F#}, its 3rd, which {k:F major} does not have. Over it, play vertically.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Complete the guide-tone line through {c:Gm7} {c:C7} {c:Fmaj7}, starting on the 3rd of {c:Gm7}.',
        text: '{c:Gm7}: {n:Bb}   {c:C7}: {n:Bb}   {c:Fmaj7}: ___',
        blanks: ['{n:A}'],
        bank: ['{n:F}', '{n:C}', '{n:G}'],
        explain: '{n:Bb} is the 3rd of {c:Gm7} and the 7th of {c:C7}; it falls a half step to {n:A}, the 3rd of {c:Fmaj7}.',
      },
      {
        type: 'type-answer',
        prompt: 'Type the 3rd of {c:G7}, a guide tone.',
        answer: { kind: 'note', value: 'B', spelling: 'exact' },
        input: 'keypad',
        explain: '{c:G7} is {n:G} {n:B} {n:D} {n:F}: its 3rd is {n:B}, and its 7th, {n:F}, is the other guide tone.',
      },
      {
        type: 'type-answer',
        prompt: 'Type the approach note a half step below {n:D}.',
        answer: { kind: 'note', value: 'C#', spelling: 'exact' },
        input: 'keypad',
        explain: 'A half step below {n:D} is {n:C#}, spelled with the letter below because it rises into {n:D}.',
      },
      {
        type: 'choice',
        prompt: 'Over {c:C}, which note is the scale-step approach from above into {n:G}?',
        options: [
          { text: '{n:A}', correct: true },
          { text: '{n:F#}', why: '{n:F#} is the half step below.' },
          { text: '{n:B}', why: '{n:B} is a third above {n:G}, not a step.' },
          { text: '{n:E}', why: '{n:E} is a third below {n:G}.' },
        ],
        explain: 'The next note up the {k:C major} scale from {n:G} is {n:A}: it steps down into the target.',
      },
      {
        type: 'order',
        prompt: 'Order the common enclosure of {n:G}: scale note above, half step below, target.',
        tiles: ['{n:A}', '{n:F#}', '{n:G}'],
        distractors: ['{n:B}'],
        explain: '{n:A} is the scale note above {n:G}, {n:F#} the half step below, and {n:G} lands last, on the beat.',
      },
      {
        type: 'true-false',
        statement: 'An enclosure is usually timed so that its target lands on a strong beat.',
        answer: true,
        explain: 'The surrounding notes take the off-beats and the target lands on the beat, as in bebop lines.',
      },
      {
        type: 'choice',
        prompt: 'Over {c:Fmaj7}, which seventh arpeggio starts on its 3rd and adds the 9th?',
        options: [
          { text: '{c:Am7}', correct: true },
          { text: '{c:Cmaj7}', why: '{c:Cmaj7} starts on the 5th of {c:Fmaj7}.' },
          { text: '{c:Dm7}', why: '{c:Dm7} starts below the root, on the 6th.' },
          { text: '{c:Gm7}', why: '{c:Gm7} has {n:Bb}, which clashes with {c:Fmaj7}.' },
        ],
        explain: '{c:Am7} is {n:A} {n:C} {n:E} {n:G}: the 3rd, 5th and 7th of {c:Fmaj7}, plus {n:G}, the 9th.',
      },
      {
        type: 'match-pairs',
        prompt: 'Match each chord with the arpeggio a third above its root.',
        pairs: [
          { left: '{c:Cmaj7}', right: '{c:Em7}' },
          { left: '{c:G7}', right: '{c:Bm7b5}' },
          { left: '{c:Dm7}', right: '{c:Fmaj7}' },
        ],
        explain: 'Start each arpeggio on the chord\'s 3rd: it keeps the 3rd, 5th and 7th and adds the 9th.',
      },
      {
        type: 'choice',
        prompt: 'Over {c:Am7}, an {n:A} minor pentatonic phrase at fret 5 side-slips. Where does it go?',
        options: [
          { text: 'Up to fret 6, then back to fret 5', correct: true },
          { text: 'Up to fret 7, and stays there', why: 'Two frets is a whole step, and side-slipping comes back.' },
          { text: 'To fret 17, an octave up', why: 'An octave up is the same notes: still inside.' },
        ],
        explain: 'Side-slipping moves the phrase a half step, one fret, then brings it home, so the tension resolves.',
      },
      {
        type: 'type-answer',
        prompt: 'Type the tritone substitute of {c:D7}.',
        answer: { kind: 'chord', value: 'Ab7', spelling: 'any' },
        explain: 'A tritone above {n:D} is {n:Ab}: {c:Ab7} shares the 3rd and 7th of {c:D7}, {n:F#} (as {n:Gb}) and {n:C}.',
      },
      {
        type: 'true-false',
        statement: 'Outside phrases work best when they never resolve.',
        answer: false,
        explain: 'An outside phrase works when it is clear and lands convincingly back inside.',
      },
      {
        type: 'listen-choice',
        prompt: 'Over a {c:Dm7} vamp: did the phrase slip outside and come back?',
        sound: { kind: 'tab', tempo: 84, notes: [...PHRASE_IN, ...PHRASE_OUT, ...PHRASE_HOME] },
        options: [{ text: 'Yes: out a half step, then back', correct: true }, { text: 'No: it stayed inside' }],
        shuffle: false,
        explain: 'The middle phrase was the first one a fret higher, outside {n:D} minor pentatonic, and the last came home to {n:D}.',
      },
      {
        type: 'listen-choice',
        prompt: 'A solo over {c:Dm7} {c:G7} {c:Cmaj7}. Does each bar start on a guide tone, or on the root?',
        sound: { kind: 'tab', tempo: 88, notes: ROOT_SOLO },
        options: [{ text: 'On a guide tone' }, { text: 'On the root', correct: true }],
        shuffle: false,
        explain: 'The bars began on {n:D}, {n:G} and {n:C}: the roots, leaping by fourths and fifths. A guide-tone line would have moved {n:F}, {n:F}, {n:E}.',
      },
    ],
  },
};

export default unit;
