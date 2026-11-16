/**
 * Theory Path, unit 28: Transposing, the capo and Nashville numbers. Written from the syllabus
 * entries in `src/content/plan/theory-path.json` (unit `capo-and-transposition`), one lesson per
 * entry, in order: each lesson opens with the "on the guitar" picture, asks the planned exercises,
 * ends with the planned drill, and turns every planned fact into a review card.
 *
 * Every transposition, capo sum, numeral and chart reading is cross-checked against
 * `@/core/theory` and `@/core/guitar` in `capo-and-transposition.test.ts`.
 *
 * Notes for readers of the code:
 * - Capo shapes are drawn as fretboard figures with a capo: the dots count from the capo and are
 *   labelled with the notes they SOUND (the engine checks them), the caption names the shape. The
 *   chord-box figure does not draw a capo, and the chord-build grid does not reach above it.
 * - A play-chord step has no capo field: its chord box draws the A it sounds counted from the nut
 *   (542225, with an automatic barre at fret 2), so the step also shows the G shape behind the
 *   capo as its picture. Its tapping version asks what it sounds.
 * - The syllabus asks the learner to TYPE "6-" for E minor in G. The answer checker drops the minus
 *   sign (a plain "6" would pass too), so the lesson asks for the degree as a number and then for
 *   the written form as a choice.
 */
import type { Lesson, Unit } from '@/lessons';

const U = 'capo-and-transposition';

/** The G shape, one string at a time: open, then with the capo at fret 2 (frets on the wood). */
const G_SHAPE_TWICE = [
  ...[3, 2, 0, 0, 0, 3].map((fret, i) => ({ string: 6 - i, fret, duration: 'e' as const })),
  { rest: true as const, duration: 'q' as const },
  ...[3, 2, 0, 0, 0, 3].map((fret, i) => ({ string: 6 - i, fret: fret + 2, duration: 'e' as const })),
  { rest: true as const, duration: 'q' as const },
];

/** The G shape behind a capo at fret 2: frets count from the capo, notes are what it sounds (A). */
const G_SHAPE_AT_CAPO_2 = {
  kind: 'fretboard' as const,
  capo: 2,
  frets: [0, 5] as [number, number],
  dots: [
    { string: 6, fret: 3, note: 'A2' },
    { string: 5, fret: 2, note: 'C#3' },
    { string: 4, fret: 0, note: 'E3' },
    { string: 3, fret: 0, note: 'A3' },
    { string: 2, fret: 0, note: 'C#4' },
    { string: 1, fret: 3, note: 'A4' },
  ],
  caption: 'Shape {c:G}, capo at fret 2: the notes of {c:A}.',
};

const transposing: Lesson = {
  id: 'transposing',
  title: 'Transposing',
  teaches: 'To transpose is to move every chord by the same interval into a new key; writing numerals first makes it easy.',
  minutes: 4,
  skill: `theory:${U}:transposing`,
  steps: [
    {
      type: 'card',
      title: 'Same song, new key',
      body: 'To {t:transpose} a song is to move every note and chord by the same {t:interval}, into a new {t:key}. Take {c:C} {c:Am} {c:F} {c:G}. Move every chord up a whole step, two frets: {c:D} {c:Bm} {c:G} {c:A}. It is the same song, a little higher.',
      figure: {
        kind: 'fretboard',
        frets: [0, 5],
        dots: [
          { string: 5, fret: 3, note: 'C', role: 'ghost' },
          { string: 5, fret: 5, note: 'D', role: 'root' },
          { string: 5, fret: 0, note: 'A', role: 'ghost' },
          { string: 5, fret: 2, note: 'B', role: 'root' },
          { string: 4, fret: 3, note: 'F', role: 'ghost' },
          { string: 4, fret: 5, note: 'G', role: 'root' },
          { string: 6, fret: 3, note: 'G', role: 'ghost' },
          { string: 6, fret: 5, note: 'A', role: 'root' },
        ],
        caption: 'Each root moves two frets up its string: a whole step.',
      },
    },
    {
      type: 'fill-blanks',
      prompt: 'Move {c:G} {c:C} {c:D} up a whole step.',
      text: '{c:G}  {c:C}  {c:D}   becomes   {c:A}  ___  {c:E}',
      blanks: ['{c:D}'],
      bank: ['{c:C#}', '{c:Eb}', '{c:Dm}'],
      explain: 'Every chord moves two half steps: {n:G} to {n:A}, {n:C} to {n:D}, {n:D} to {n:E}. A major chord stays major, so {c:C} becomes {c:D}.',
      fact: 'capo-transpose-meaning',
    },
    {
      type: 'true-false',
      statement: 'Transposing can turn a minor chord into a major chord.',
      answer: false,
      explain: 'Only the roots move. Every chord keeps its quality: minor stays minor, and a 7 stays a 7. {c:Am} up a whole step is {c:Bm}, never {c:B}.',
      fact: 'capo-transpose-qualities',
    },
    {
      type: 'type-answer',
      prompt: 'Transpose {c:Em7} up a perfect fourth.',
      answer: { kind: 'chord', value: 'Am7', spelling: 'exact' },
      input: 'keyboard',
      explain: 'A perfect fourth above {n:E} is {n:A}, five half steps up. The quality stays the same, so {c:Em7} becomes {c:Am7}.',
      fact: 'capo-transpose-qualities',
    },
    {
      type: 'card',
      title: 'Numbers first',
      body: 'A safer way: write the chords as {t:roman-numerals|roman numerals} first. In {k:C major}, {c:C} {c:Am} {c:F} {c:G} is {r:I} {r:vi} {r:IV} {r:V}. Now read the numerals in the new key: in {k:D major} they are {c:D} {c:Bm} {c:G} {c:A}. Every chord comes out right, quality and all.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['C', 'Am', 'F', 'G', 'D', 'Bm', 'G', 'A'], beats: 2, tempo: 90 }, label: 'Hear it in C, then in D' },
    },
    {
      type: 'listen-choice',
      prompt: 'Two progressions. Is the second the same progression in a new key?',
      sound: { kind: 'progression', chords: ['G', 'D', 'Em', 'C', 'A', 'E', 'F#m', 'D'], beats: 2, tempo: 90, voicing: 'close' },
      options: [
        { text: 'Yes, moved higher', correct: true },
        { text: 'Yes, moved lower' },
        { text: 'No: a different progression' },
      ],
      shuffle: false,
      explain: 'It was {r:I} {r:V} {r:vi} {r:IV} twice: {c:G} {c:D} {c:Em} {c:C}, then {c:A} {c:E} {c:F#m} {c:D}, a whole step higher. The shape of the tune stayed the same.',
    },
    {
      type: 'fill-blanks',
      prompt: 'Read {r:I} {r:vi} {r:IV} {r:V} in {k:D major}.',
      text: '{c:D}  {c:Bm}  {c:G}  ___',
      blanks: ['{c:A}'],
      bank: ['{c:Am}', '{c:E}', '{c:F#m}'],
      explain: 'The 5th note of {k:D major} is {n:A}, and {r:V} is major: {c:A}. So {r:I} {r:vi} {r:IV} {r:V} is {c:D} {c:Bm} {c:G} {c:A}.',
      fact: 'capo-transpose-numerals',
    },
    {
      type: 'choice',
      prompt: 'In {k:G major}, {r:I} {r:V} {r:vi} {r:IV} is {c:G} {c:D} {c:Em} {c:C}. What is it in {k:A major}?',
      options: [
        { text: '{c:A} {c:E} {c:F#m} {c:D}', correct: true },
        { text: '{c:A} {c:E} {c:F#} {c:D}', why: '{r:vi} is a minor chord in every major key: {c:F#m}, not {c:F#}.' },
        { text: '{c:A} {c:D} {c:E} {c:F#m}', why: 'Those are the right chords in the wrong order: keep {r:I} {r:V} {r:vi} {r:IV}.' },
        { text: '{c:A} {c:Eb} {c:Fm} {c:Db}', why: 'Every chord must move by the same step as {n:G} to {n:A}: two half steps.' },
      ],
      explain: 'In {k:A major}, {r:I} is {c:A}, {r:V} is {c:E}, {r:vi} is {c:F#m} and {r:IV} is {c:D}.',
      fact: 'capo-transpose-numerals',
    },
    { generate: 'roman-chord', params: { direction: 'to-chord', numerals: ['I', 'IV', 'V', 'vi', 'ii'], maxAccidentals: 3 } },
    { generate: 'roman-chord', params: { direction: 'to-roman', numerals: ['I', 'IV', 'V', 'vi', 'ii'], maxAccidentals: 3 } },
  ],
  facts: [
    {
      id: 'capo-transpose-meaning',
      front: 'What does it mean to transpose a piece of music?',
      back: 'To move it to a new key by moving every note and chord by the same interval.',
    },
    {
      id: 'capo-transpose-whole-step',
      front: 'Transpose {c:C} {c:Am} {c:F} {c:G} up a whole step.',
      back: '{c:D} {c:Bm} {c:G} {c:A}.',
      ask: {
        type: 'fill-blanks',
        prompt: 'Transpose {c:C} {c:Am} {c:F} {c:G} up a whole step.',
        text: '{c:D}  ___  {c:G}  {c:A}',
        blanks: ['{c:Bm}'],
        bank: ['{c:B}', '{c:Bbm}', '{c:Cm}'],
        explain: '{n:A} up a whole step is {n:B}, and the chord stays minor: {c:Am} becomes {c:Bm}.',
      },
    },
    {
      id: 'capo-transpose-qualities',
      front: 'What happens to chord qualities when you transpose?',
      back: 'Nothing: minor stays minor and a 7 stays a 7. Only the roots move.',
    },
    {
      id: 'capo-transpose-numerals',
      front: 'Why write chords as roman numerals before transposing? What is {r:I} {r:V} {r:vi} {r:IV} in G and in A?',
      back: 'Read in the new key, the numerals keep every chord right: {r:I} {r:V} {r:vi} {r:IV} is {c:G} {c:D} {c:Em} {c:C} in G and {c:A} {c:E} {c:F#m} {c:D} in A.',
    },
  ],
};

const theCapo: Lesson = {
  id: 'the-capo',
  title: 'How a capo works',
  teaches: 'A capo raises every open string by the number of frets it sits at, so the same shapes sound higher.',
  minutes: 2,
  skill: `theory:${U}:the-capo`,
  steps: [
    {
      type: 'card',
      title: 'A movable nut',
      body: 'A {t:capo} clamps across all six strings at one fret. Each open string now starts that many half steps higher, so every shape you know sounds higher too. With the capo at fret 2, the {c:G} shape sounds {c:A}.',
      figure: G_SHAPE_AT_CAPO_2,
    },
    {
      type: 'choice',
      prompt: 'An {c:E} shape with the capo at fret 3 sounds which chord?',
      options: [
        { text: '{c:G}', correct: true },
        { text: '{c:E}', why: 'That is the shape. The capo raises it by three half steps.' },
        { text: '{c:F}', why: '{c:F} is only one half step above {c:E}: that would be capo 1.' },
        { text: '{c:A}', why: '{c:A} is five half steps above {c:E}: capo 5.' },
      ],
      explain: 'Three frets are three half steps: {n:E} to {n:F}, {n:F#}, {n:G}. The {c:E} shape at capo 3 sounds {c:G}.',
      fact: 'capo-raises-strings',
    },
    {
      type: 'type-answer',
      prompt: 'With the capo at fret 2, which note does open string 6 sound?',
      answer: { kind: 'note', value: 'F#', spelling: 'any' },
      input: 'keypad',
      explain: 'Open string 6 is {n:E}. Two half steps higher it is {n:F#}, the note at fret 2.',
      fact: 'capo-raises-strings',
    },
    {
      type: 'card',
      title: 'Named by shape',
      body: 'Players name chords by **shape**: "play {c:G} with the capo on 2" means the {c:G} shape, which sounds {c:A}. Tab for capo songs usually counts frets **from the capo**: a 0 means the capo fret, a 2 means two frets above it.',
      figure: { kind: 'tab', capo: 2, tempo: 80, notes: [{ string: 3, fret: 0, duration: 'q' }, { string: 2, fret: 0, duration: 'q' }, { string: 1, fret: 3, duration: 'h' }], caption: 'Capo 2: these 0s are played at the capo, the 3 at fret 5.' },
    },
    {
      type: 'true-false',
      statement: 'In most capo tab, with the capo at fret 2, a 0 means the open string behind the capo.',
      answer: false,
      explain: 'The strings behind the capo cannot sound. In capo tab a 0 usually means the string played at the capo fret, here fret 2.',
      fact: 'capo-tab-counts',
    },
    {
      type: 'choice',
      prompt: 'Capo at fret 3. The tab shows a 2 on string 1. Which fret is that, counted from the {t:nut}?',
      options: [{ text: 'Fret 2' }, { text: 'Fret 3' }, { text: 'Fret 5', correct: true }, { text: 'Fret 6' }],
      shuffle: false,
      explain: 'Capo tab usually counts from the capo: 2 frets above fret 3 is fret 5.',
      fact: 'capo-tab-counts',
    },
    {
      type: 'play-chord',
      prompt: 'Put the capo at fret 2 and strum the {c:G} shape, as in the picture. It sounds {c:A}: the chord box below shows those notes counted from the nut.',
      figure: G_SHAPE_AT_CAPO_2,
      chord: 'A',
      frets: '542225',
      explain: 'Your {c:G} shape now sounds {c:A}: {n:A} {n:C#} {n:E}. If a string buzzes, move the capo right up against the fret wire.',
      alternative: {
        type: 'choice',
        prompt: 'The capo is at fret 2 and you strum the {c:G} shape. Which chord do you hear?',
        options: [
          { text: '{c:A}', correct: true },
          { text: '{c:G}', why: 'That is the shape. The capo raises it by two half steps.' },
          { text: '{c:Ab}', why: 'That is one half step up: capo 1.' },
          { text: '{c:B}', why: 'That is four half steps up: capo 4.' },
        ],
        explain: '{n:G} plus two half steps is {n:A}: the {c:G} shape at capo 2 sounds {c:A}.',
      },
    },
    {
      type: 'listen-choice',
      prompt: 'The {c:G} shape is played twice, one string at a time. Which time was the capo at fret 2?',
      sound: { kind: 'tab', tempo: 100, notes: G_SHAPE_TWICE },
      options: [{ text: 'The first time' }, { text: 'The second time', correct: true }],
      shuffle: false,
      explain: 'The second time sounded a whole step higher: the capo raised every string by two half steps, so the {c:G} shape sounded {c:A}.',
    },
  ],
  facts: [
    {
      id: 'capo-raises-strings',
      front: 'What does a capo do to the strings?',
      back: 'It clamps across them at one fret and raises every open string by that many half steps.',
    },
    {
      id: 'capo-shape-names',
      front: 'With a capo, how are chords named? What does a {c:G} shape at capo 2 sound?',
      back: 'By shape. They sound higher: a {c:G} shape with the capo at fret 2 sounds {c:A}.',
      ask: {
        type: 'choice',
        prompt: 'A {c:D} shape with the capo at fret 2 sounds which chord?',
        options: [
          { text: '{c:E}', correct: true },
          { text: '{c:D}', why: 'That is the shape. It sounds two half steps higher.' },
          { text: '{c:Eb}', why: 'That is one half step up: capo 1.' },
          { text: '{c:F#}', why: 'That is four half steps up: capo 4.' },
        ],
        explain: '{n:D} plus two half steps is {n:E}: the {c:D} shape at capo 2 sounds {c:E}.',
      },
    },
    {
      id: 'capo-tab-counts',
      front: 'In tab for a capo song, what does 0 mean?',
      back: 'The capo fret. Capo tab usually counts frets from the capo, not from the nut.',
    },
  ],
};

const capoArithmetic: Lesson = {
  id: 'capo-arithmetic',
  title: 'Capo arithmetic',
  teaches: 'Sounding chord = shape + capo; to play a hard key with easy shapes, take the capo away from the key.',
  minutes: 4,
  skill: `theory:${U}:capo-arithmetic`,
  steps: [
    {
      type: 'card',
      title: 'Shape plus capo',
      body: 'The rule: **sounding chord = shape + capo**, counted in half steps. A {c:C} shape with the capo at fret 3 goes up three half steps, from {n:C} to {n:Eb}: it sounds {c:Eb}. The quality never changes: a minor shape still sounds minor.',
      figure: {
        kind: 'fretboard',
        capo: 3,
        frets: [0, 6],
        dots: [
          { string: 5, fret: 3, note: 'Eb3' },
          { string: 4, fret: 2, note: 'G3' },
          { string: 3, fret: 0, note: 'Bb3' },
          { string: 2, fret: 1, note: 'Eb4' },
          { string: 1, fret: 0, note: 'G4' },
        ],
        caption: 'Shape {c:C}, capo at fret 3: the notes of {c:Eb}.',
      },
    },
    {
      type: 'type-answer',
      prompt: 'Capo at fret 5, {c:D} shape. Which chord sounds?',
      answer: { kind: 'chord', value: 'G', spelling: 'exact' },
      input: 'keyboard',
      explain: 'Five half steps up from {n:D}: {n:D#}, {n:E}, {n:F}, {n:F#}, {n:G}. The {c:D} shape at capo 5 sounds {c:G}.',
      fact: 'capo-shape-plus-capo',
    },
    {
      type: 'choice',
      prompt: 'Capo at fret 2, {c:Am} shape. Which chord sounds?',
      options: [
        { text: '{c:Bm}', correct: true },
        { text: '{c:B}', why: 'A minor shape sounds minor wherever the capo is.' },
        { text: '{c:Am}', why: 'That is the shape. The capo raises it by two half steps.' },
        { text: '{c:Cm}', why: '{n:C} is three half steps above {n:A}: that would be capo 3.' },
      ],
      explain: '{n:A} plus two half steps is {n:B}, and the chord stays minor: {c:Bm}.',
      fact: 'capo-shape-plus-capo',
    },
    {
      type: 'card',
      title: 'Key minus capo',
      body: 'Now the other way round. You want a hard key but easy shapes: **shape = key − capo**. Count from the shape up to the key, and that is the capo fret. For {k:Bb major} with {c:G} shapes: {n:G} to {n:Bb} is three half steps, so the capo goes at fret 3.',
      figure: {
        kind: 'fretboard',
        capo: 3,
        frets: [0, 6],
        dots: [
          { string: 6, fret: 3, note: 'Bb2' },
          { string: 5, fret: 2, note: 'D3' },
          { string: 4, fret: 0, note: 'F3' },
          { string: 3, fret: 0, note: 'Bb3' },
          { string: 2, fret: 0, note: 'D4' },
          { string: 1, fret: 3, note: 'Bb4' },
        ],
        caption: 'Shape {c:G}, capo at fret 3: the notes of {c:Bb}.',
      },
    },
    {
      type: 'choice',
      prompt: 'You want to play in {k:A major} with {c:G} shapes. Where does the capo go?',
      options: [{ text: 'Fret 1' }, { text: 'Fret 2', correct: true }, { text: 'Fret 3' }, { text: 'Fret 4' }],
      shuffle: false,
      explain: 'From {n:G} up to {n:A} is two half steps, so the capo goes at fret 2. Check: {c:G} shape + 2 = {c:A}.',
      fact: 'capo-key-minus-capo',
    },
    {
      type: 'fill-blanks',
      prompt: 'A song in {k:E major}, capo at fret 4. Which shapes do you play?',
      text: 'Capo 4, key of {n:E}: the shapes of ___ major.',
      blanks: ['{n:C}'],
      bank: ['{n:G#}', '{n:D}', '{n:B}'],
      explain: '{n:E} minus four half steps: {n:Eb}, {n:D}, {n:C#}, {n:C}. So the {k:C major} shapes {c:C} {c:F} {c:G} sound {c:E} {c:A} {c:B}.',
      fact: 'capo-key-minus-capo',
    },
    {
      type: 'card',
      title: 'A whole song',
      body: 'A song in {k:Bb major} uses {c:Bb}, {c:Eb}, {c:F} and {c:Gm}: four barre chords. Put the capo at fret 3 and they become {c:G}, {c:C}, {c:D} and {c:Em} shapes, all open chords.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['Bb', 'Eb', 'F', 'Gm'], beats: 2, tempo: 80 }, label: 'Hear the song in B flat' },
    },
    {
      type: 'match-pairs',
      prompt: 'Capo at fret 3: match each chord you hear with the shape you play.',
      pairs: [
        { left: '{c:Bb}', right: '{c:G} shape' },
        { left: '{c:Eb}', right: '{c:C} shape' },
        { left: '{c:F}', right: '{c:D} shape' },
        { left: '{c:Gm}', right: '{c:Em} shape' },
      ],
      explain: 'Each sounding chord is three half steps above its shape: {n:G} to {n:Bb}, {n:C} to {n:Eb}, {n:D} to {n:F}, {n:E} to {n:G}.',
      fact: 'capo-song-at-three',
    },
    {
      type: 'type-answer',
      prompt: 'Capo at fret 3, {c:Em} shape. Which chord sounds?',
      answer: { kind: 'chord', value: 'Gm', spelling: 'exact' },
      input: 'keyboard',
      explain: '{n:E} plus three half steps is {n:G}, and a minor shape stays minor: {c:Gm}.',
      fact: 'capo-song-at-three',
    },
  ],
  facts: [
    {
      id: 'capo-shape-plus-capo',
      front: 'How do you work out the chord a capo shape sounds? A {c:C} shape at capo 3?',
      back: 'Sounding chord = shape + capo fret in half steps: a {c:C} shape at capo 3 sounds {c:Eb}.',
      ask: {
        type: 'choice',
        prompt: 'A {c:C} shape with the capo at fret 3 sounds which chord?',
        options: [
          { text: '{c:Eb}', correct: true },
          { text: '{c:D}', why: '{n:D} is two half steps above {n:C}: capo 2.' },
          { text: '{c:E}', why: '{n:E} is four half steps above {n:C}: capo 4.' },
          { text: '{c:Cm}', why: 'A capo never changes the quality: a major shape sounds major.' },
        ],
        explain: '{n:C} plus three half steps is {n:Eb}: the {c:C} shape at capo 3 sounds {c:Eb}.',
      },
    },
    {
      id: 'capo-key-minus-capo',
      front: 'You want {k:Bb major} with {c:G} shapes. Where does the capo go?',
      back: 'At fret 3: from {n:G} up to {n:Bb} is three half steps. Shape = key − capo.',
    },
    {
      id: 'capo-song-at-three',
      front: 'Which shapes play {c:Bb}, {c:Eb}, {c:F} and {c:Gm} with the capo at fret 3?',
      back: '{c:G}, {c:C}, {c:D} and {c:Em}.',
    },
  ],
};

const choosingAKey: Lesson = {
  id: 'choosing-a-key',
  title: 'Choosing a key to sing in',
  teaches: 'Move a song down if it is too high to sing and up if too low, then pick a capo spot that keeps easy shapes.',
  minutes: 3,
  skill: `theory:${U}:choosing-a-key`,
  steps: [
    {
      type: 'card',
      title: 'Fit the song to your voice',
      body: 'If a song sits too high for your voice, {t:transpose} it **down**. Too low, transpose it **up**. A song in {k:G major} that is a whole step too high moves down to {k:F major}: every chord two frets lower.',
      figure: {
        kind: 'fretboard',
        frets: [0, 4],
        dots: [
          { string: 6, fret: 3, note: 'G', role: 'ghost' },
          { string: 6, fret: 1, note: 'F', role: 'root' },
        ],
        caption: 'Down a whole step: {n:G} to {n:F}, two frets lower.',
      },
    },
    {
      type: 'choice',
      prompt: 'A song in {k:G major} is a whole step too high for you. Which key do you try?',
      options: [
        { text: '{k:F major}', correct: true },
        { text: '{k:A major}', why: 'That is a whole step up: even higher.' },
        { text: '{k:Gb major}', why: 'That is only a half step down.' },
        { text: '{k:E major}', why: 'That is three half steps down: more than you need.' },
      ],
      explain: 'Too high means move down. A whole step down from {n:G} is {n:F}: {k:F major}.',
      fact: 'capo-key-for-voice',
    },
    {
      type: 'fill-blanks',
      prompt: 'Too low? Move {c:C} {c:F} {c:G} up a whole step.',
      text: '{c:D}  ___  {c:A}',
      blanks: ['{c:G}'],
      bank: ['{c:Gm}', '{c:F#}', '{c:Bb}'],
      explain: '{n:F} up a whole step is {n:G}, and the chord stays major: {c:D} {c:G} {c:A}.',
      fact: 'capo-key-for-voice',
    },
    {
      type: 'card',
      title: 'Back to easy shapes',
      body: 'The new key may be full of barre chords. Look for a capo spot that turns them into open shapes. In {k:F major}, {c:F} {c:Bb} {c:C} are hard; with the capo at fret 3, the {c:D} {c:G} {c:A} shapes play them.',
      figure: {
        kind: 'fretboard',
        capo: 3,
        frets: [0, 6],
        dots: [
          { string: 4, fret: 0, note: 'F3' },
          { string: 3, fret: 2, note: 'C4' },
          { string: 2, fret: 3, note: 'F4' },
          { string: 1, fret: 2, note: 'A4' },
        ],
        caption: 'Shape {c:D}, capo at fret 3: the notes of {c:F}.',
      },
    },
    {
      type: 'type-answer',
      prompt: 'You play {c:D} shapes. At which fret does the capo go so they sound in {k:E major}?',
      answer: { kind: 'number', value: 2 },
      input: 'keypad',
      explain: 'From {n:D} up to {n:E} is two half steps: capo at fret 2. The {c:D} {c:G} {c:A} shapes then sound {c:E} {c:A} {c:B}.',
      fact: 'capo-after-transposing',
    },
    {
      type: 'card',
      title: 'Two guitars, one key',
      body: 'Two guitars can play one song in different shapes for a fuller sound. Guitar 1 plays open {c:G} {c:C} {c:D}. Guitar 2 puts the capo at fret 5 and plays the {c:D} {c:G} {c:A} shapes: they sound {c:G} {c:C} {c:D} too, higher up the neck.',
      figure: { kind: 'audio', sound: { kind: 'notes', notes: ['G2', 'B2', 'D3', 'G3', 'B3', 'G4', 'D4', 'B4'], together: true }, label: 'Hear both guitars on G' },
    },
    {
      type: 'true-false',
      statement: '{c:G} shapes in open position and {c:C} shapes with the capo at fret 7 both sound in {k:G major}.',
      answer: true,
      explain: '{n:C} plus seven half steps is {n:G}: the {c:C} {c:F} {c:G} shapes at capo 7 sound {c:G} {c:C} {c:D}.',
      fact: 'capo-two-guitars',
    },
    {
      type: 'choice',
      prompt: 'Guitar 1 plays open {c:C} {c:F} {c:G}. Guitar 2 has the capo at fret 5. Which shapes does it play?',
      options: [
        { text: '{c:G} {c:C} {c:D}', correct: true },
        { text: '{c:F} {c:Bb} {c:C}', why: 'Those are five half steps above, and the capo adds five more: they would sound in {k:Bb major}.' },
        { text: '{c:D} {c:G} {c:A}', why: 'At capo 5 these sound {c:G} {c:C} {c:D}: the key of G, not C.' },
        { text: '{c:A} {c:D} {c:E}', why: 'At capo 5 these sound {c:D} {c:G} {c:A}.' },
      ],
      explain: 'Shape = key − capo: {n:C} minus five half steps is {n:G}. The {c:G} {c:C} {c:D} shapes at capo 5 sound {c:C} {c:F} {c:G}.',
      fact: 'capo-two-guitars',
    },
    {
      type: 'type-answer',
      prompt: 'A song uses {c:Ab}, {c:Db} and {c:Eb}. At which fret does a capo let you play them as {c:G}, {c:C} and {c:D}?',
      answer: { kind: 'number', value: 1 },
      input: 'keypad',
      explain: 'From {n:G} up to {n:Ab} is one half step: capo at fret 1, and the open {c:G} {c:C} {c:D} shapes sound {c:Ab} {c:Db} {c:Eb}.',
      fact: 'capo-after-transposing',
    },
  ],
  facts: [
    {
      id: 'capo-key-for-voice',
      front: 'A song is too high for your voice. Which way do you transpose it? And too low?',
      back: 'Too high: transpose it down. Too low: transpose it up.',
    },
    {
      id: 'capo-two-guitars',
      front: 'How can two guitars play one song in different shapes?',
      back: 'With different capo positions: open {c:G} shapes and {c:D} shapes at capo 5 both sound in {k:G major}.',
    },
    {
      id: 'capo-after-transposing',
      front: 'After transposing to a new key, what should you look for?',
      back: 'A capo position that turns the new chords into open shapes.',
    },
  ],
};

const nashvilleNumbers: Lesson = {
  id: 'nashville-numbers',
  title: 'The Nashville number system',
  teaches: 'The Nashville number system writes chords as numbers of the key, so one chart works in any key.',
  minutes: 3,
  skill: `theory:${U}:nashville-numbers`,
  steps: [
    {
      type: 'card',
      title: 'Chords as numbers',
      body: 'The {t:nashville-numbers|Nashville number system} writes chords as numbers of the key: the chord on the 1st note of the scale is 1, on the 4th note 4, and so on. In {k:G major}, 1 4 5 is {c:G} {c:C} {c:D}. It is {t:roman-numerals|roman numerals} written as plain digits.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['G', 'C', 'D', 'G'], beats: 2, tempo: 90 }, label: 'Hear 1 4 5 1 in G' },
    },
    {
      type: 'card',
      title: 'Minus and slash',
      body: 'A minor chord gets a minus sign or a small m: 6- (or 6m) in {k:G major} is {c:Em}. A slash number marks the bass: 1/3 in {k:C major} is {c:C/E}, the 1 chord over the 3rd note of the key.',
      figure: { kind: 'chord', symbol: 'C/E', frets: '032010', caption: '1/3 in {k:C major}: {c:C} over its 3rd, {n:E}.' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Read the chart 1 4 6- 5 in {k:D major}.',
      text: '{c:D}  {c:G}  ___  {c:A}',
      blanks: ['{c:Bm}'],
      bank: ['{c:B}', '{c:F#m}', '{c:Em}'],
      explain: 'The 6th note of {k:D major} is {n:B}, and the minus makes it minor: {c:Bm}.',
      fact: 'capo-nashville-meaning',
    },
    {
      type: 'type-answer',
      prompt: 'In {k:G major}, {c:Em} is built on which note of the scale? Type its number.',
      answer: { kind: 'number', value: 6 },
      input: 'keypad',
      explain: '{k:G major} runs {n:G} {n:A} {n:B} {n:C} {n:D} {n:E} {n:F#}: {n:E} is the 6th note, so {c:Em} is the 6 chord.',
      fact: 'capo-nashville-minus',
    },
    {
      type: 'choice',
      prompt: 'So how is {c:Em} written on a number chart in {k:G major}?',
      options: [
        { text: { text: '6-', say: 'six minus' }, correct: true },
        { text: { text: '6', say: 'six' }, why: 'A plain 6 means a major chord, {c:E}. Minor chords get a minus.' },
        { text: { text: '3-', say: 'three minus' }, why: '3- in {k:G major} is {c:Bm}, the chord on the 3rd note.' },
        { text: { text: '2-', say: 'two minus' }, why: '2- in {k:G major} is {c:Am}, the chord on the 2nd note.' },
      ],
      explain: '{c:Em} is the chord on the 6th note, and it is minor: 6- (or 6m).',
      fact: 'capo-nashville-minus',
    },
    {
      type: 'choice',
      prompt: 'In {k:C major}, what is 5/7?',
      options: [
        { text: '{c:G/B}', correct: true },
        { text: '{c:G7}', why: 'After a slash, the number is a bass note, not a 7th.' },
        { text: '{c:G/F}', why: 'That would be 5/4: {n:F} is the 4th note of {k:C major}.' },
        { text: '{c:B/G}', why: 'The chord comes first and the bass after the slash: 5 over 7.' },
      ],
      explain: '5 is the chord on {n:G}; /7 puts the 7th note of the key, {n:B}, in the bass: {c:G/B}.',
      fact: 'capo-nashville-slash',
    },
    {
      type: 'card',
      title: 'One chart, any key',
      body: 'A chart names no key, so it works in all of them: the band just needs to hear "in D". Take 1 | 5 | 6- | 4 | 1/3 | 4 | 5 | 1. In {k:G major}: {c:G} {c:D} {c:Em} {c:C} {c:G/B} {c:C} {c:D} {c:G}. In {k:D major}: {c:D} {c:A} {c:Bm} {c:G} {c:D/F#} {c:G} {c:A} {c:D}.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['D', 'A', 'Bm', 'G', 'D/F#', 'G', 'A', 'D'], beats: 2, tempo: 90 }, label: 'Hear the chart in D' },
    },
    {
      type: 'choice',
      prompt: 'The band leader says "1 4 5 1, in A". Which chords do you play?',
      options: [
        { text: '{c:A} {c:D} {c:E} {c:A}', correct: true },
        { text: '{c:A} {c:Dm} {c:Em} {c:A}', why: 'Plain numbers are major chords; a minor one would carry a minus.' },
        { text: '{c:A} {c:E} {c:D} {c:A}', why: 'That is 1 5 4 1: the numbers are in the wrong order.' },
        { text: '{c:G} {c:C} {c:D} {c:G}', why: 'That is 1 4 5 1 in G. The leader asked for A.' },
      ],
      explain: 'In {k:A major} the 1st, 4th and 5th notes are {n:A}, {n:D} and {n:E}: {c:A} {c:D} {c:E} {c:A}.',
      fact: 'capo-nashville-any-key',
    },
    { generate: 'roman-chord', params: { direction: 'to-chord', numerals: ['I', 'IV', 'V', 'vi', 'ii', 'iii'], maxAccidentals: 3 } },
  ],
  facts: [
    {
      id: 'capo-nashville-meaning',
      front: 'What is the Nashville number system? What is 1 4 5 in {k:G major}?',
      back: 'Chords written as numbers of the key: 1 4 5 in {k:G major} is {c:G} {c:C} {c:D}.',
    },
    {
      id: 'capo-nashville-minus',
      front: 'How does a number chart show a minor chord? Write {c:Em} in {k:G major}.',
      back: 'With a minus sign or a small m: {c:Em} in {k:G major} is 6- (or 6m).',
    },
    {
      id: 'capo-nashville-slash',
      front: 'What does a slash number such as 1/3 mean? What is 1/3 in {k:C major}?',
      back: 'The number after the slash is the bass note: 1/3 in {k:C major} is {c:C/E}.',
      ask: {
        type: 'choice',
        prompt: 'In {k:G major}, what is 1/3?',
        options: [
          { text: '{c:G/B}', correct: true },
          { text: '{c:Bm}', why: 'That would be 3-: the chord on the 3rd note.' },
          { text: '{c:G/D}', why: 'That would be 1/5: {n:D} is the 5th note of {k:G major}.' },
          { text: '{c:B/G}', why: 'The chord comes first, then the bass: 1 over 3.' },
        ],
        explain: '1 is {c:G}; /3 puts the 3rd note of the key, {n:B}, in the bass: {c:G/B}.',
      },
    },
    {
      id: 'capo-nashville-any-key',
      front: 'Why does one number chart work in any key?',
      back: 'Its numbers name no key. The band only needs to be told the key, and reads the same chart.',
    },
  ],
};

/** Unit 28 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'Transposing, capo and Nashville',
  theme: 'keys',
  description: 'Moving music to a new key by interval and by numerals, capo arithmetic, choosing a key, and writing progressions as numbers.',
  lessons: [transposing, theCapo, capoArithmetic, choosingAKey, nashvilleNumbers],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      {
        type: 'type-answer',
        prompt: 'Transpose {c:Am7} up a whole step.',
        answer: { kind: 'chord', value: 'Bm7', spelling: 'exact' },
        input: 'keyboard',
        explain: '{n:A} up a whole step is {n:B}, and the quality stays: {c:Am7} becomes {c:Bm7}.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Transpose {c:G} {c:Em} {c:C} {c:D} up a perfect fourth.',
        text: '{c:C}  {c:Am}  ___  {c:G}',
        blanks: ['{c:F}'],
        bank: ['{c:F#}', '{c:Fm}', '{c:E}'],
        explain: 'A perfect fourth is five half steps: {n:C} up to {n:F}. The chord stays major, so {c:C} becomes {c:F}.',
      },
      {
        type: 'true-false',
        statement: 'Transposed up a whole step, {c:Em} becomes {c:F#}.',
        answer: false,
        explain: 'The root moves from {n:E} to {n:F#}, but minor stays minor: {c:F#m}.',
      },
      {
        type: 'choice',
        prompt: 'What is {r:I} {r:V} {r:vi} {r:IV} in {k:D major}?',
        options: [
          { text: '{c:D} {c:A} {c:Bm} {c:G}', correct: true },
          { text: '{c:D} {c:A} {c:B} {c:G}', why: '{r:vi} is minor: {c:Bm}.' },
          { text: '{c:D} {c:G} {c:Bm} {c:A}', why: 'That is {r:I} {r:IV} {r:vi} {r:V}: the order is wrong.' },
          { text: '{c:D} {c:Am} {c:Bm} {c:G}', why: '{r:V} is major: {c:A}.' },
        ],
        explain: 'In {k:D major}: {r:I} {c:D}, {r:V} {c:A}, {r:vi} {c:Bm}, {r:IV} {c:G}.',
      },
      {
        type: 'choice',
        prompt: 'Capo at fret 4, {c:G} shape. Which chord sounds?',
        options: [
          { text: '{c:B}', correct: true },
          { text: '{c:Bb}', why: '{n:Bb} is three half steps above {n:G}: capo 3.' },
          { text: '{c:C}', why: '{n:C} is five half steps above {n:G}: capo 5.' },
          { text: '{c:Bm}', why: 'A major shape sounds major wherever the capo is.' },
        ],
        explain: '{n:G} plus four half steps: {n:G#}, {n:A}, {n:A#}, {n:B}. The {c:G} shape at capo 4 sounds {c:B}.',
      },
      {
        type: 'true-false',
        statement: 'In most capo tab, a 0 means the string played at the capo fret.',
        answer: true,
        explain: 'Capo tab usually counts from the capo: 0 is the capo fret, 1 the fret above it, and so on.',
      },
      {
        type: 'type-answer',
        prompt: 'You want {k:D major} with {c:C} shapes. At which fret does the capo go?',
        answer: { kind: 'number', value: 2 },
        input: 'keypad',
        explain: 'From {n:C} up to {n:D} is two half steps: capo at fret 2.',
      },
      {
        type: 'choice',
        prompt: 'A song uses {c:Ab}, {c:Db}, {c:Eb} and {c:Fm}. With the capo at fret 1, which shapes do you play?',
        options: [
          { text: '{c:G} {c:C} {c:D} {c:Em}', correct: true },
          { text: '{c:A} {c:D} {c:E} {c:F#m}', why: 'Those are a half step above the song: the capo must go the other way.' },
          { text: '{c:G} {c:C} {c:D} {c:E}', why: 'A minor chord needs a minor shape: {c:Fm} is played as {c:Em}.' },
          { text: '{c:F} {c:Bb} {c:C} {c:Dm}', why: 'Those are three half steps below: capo 3.' },
        ],
        explain: 'Shape = key − capo: each chord one half step lower. {c:Ab} {c:Db} {c:Eb} {c:Fm} become {c:G} {c:C} {c:D} {c:Em}.',
      },
      {
        type: 'choice',
        prompt: 'Guitar 1 plays open {c:D} {c:G} {c:A}. Guitar 2 has the capo at fret 7. Which shapes match it?',
        options: [
          { text: '{c:G} {c:C} {c:D}', correct: true },
          { text: '{c:A} {c:D} {c:E}', why: 'At capo 7 these sound {c:E} {c:A} {c:B}.' },
          { text: '{c:C} {c:F} {c:G}', why: 'At capo 7 these sound {c:G} {c:C} {c:D}.' },
          { text: '{c:D} {c:G} {c:A}', why: 'At capo 7 the same shapes sound {c:A} {c:D} {c:E}.' },
        ],
        explain: '{n:D} minus seven half steps is {n:G}: the {c:G} {c:C} {c:D} shapes at capo 7 sound {c:D} {c:G} {c:A}.',
      },
      {
        type: 'choice',
        prompt: 'A song in {k:C major} is a whole step too low for you. Which key do you try?',
        options: [
          { text: '{k:D major}', correct: true },
          { text: '{k:Bb major}', why: 'That is a whole step down: even lower.' },
          { text: '{k:Db major}', why: 'That is only a half step up.' },
          { text: '{k:E major}', why: 'That is two whole steps up: more than you need.' },
        ],
        explain: 'Too low means move up. A whole step up from {n:C} is {n:D}.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Read the chart 1 5 6- 4 in {k:A major}.',
        text: '{c:A}  {c:E}  ___  {c:D}',
        blanks: ['{c:F#m}'],
        bank: ['{c:F#}', '{c:C#m}', '{c:Bm}'],
        explain: 'The 6th note of {k:A major} is {n:F#}, and the minus makes it minor: {c:F#m}.',
      },
      {
        type: 'choice',
        prompt: 'In {k:G major}, what is 5/7?',
        options: [
          { text: '{c:D/F#}', correct: true },
          { text: '{c:D7}', why: 'After a slash the number is a bass note, not a 7th.' },
          { text: '{c:F#/D}', why: 'The chord comes first, then the bass: 5 over 7.' },
          { text: '{c:D/C}', why: '{n:C} is the 4th note of {k:G major}: that would be 5/4.' },
        ],
        explain: '5 in {k:G major} is {c:D}; the 7th note of the key, {n:F#}, goes in the bass: {c:D/F#}.',
      },
      {
        type: 'choice',
        prompt: 'In {k:G major}, how is {c:Am} written on a number chart?',
        options: [
          { text: { text: '2-', say: 'two minus' }, correct: true },
          { text: { text: '2', say: 'two' }, why: 'A plain 2 is a major chord: {c:A}.' },
          { text: { text: '6-', say: 'six minus' }, why: '6- in {k:G major} is {c:Em}.' },
          { text: { text: '1-', say: 'one minus' }, why: '1 is the key chord, {c:G}.' },
        ],
        explain: '{n:A} is the 2nd note of {k:G major}, and the chord is minor: 2-.',
      },
      {
        type: 'listen-choice',
        prompt: 'Is the second progression the same as the first, in a new key?',
        sound: { kind: 'progression', chords: ['A', 'E', 'F#m', 'D', 'G', 'D', 'Em', 'C'], beats: 2, tempo: 90, voicing: 'close' },
        options: [{ text: 'Yes, moved higher' }, { text: 'Yes, moved lower', correct: true }, { text: 'No: a different progression' }],
        shuffle: false,
        explain: 'Both were {r:I} {r:V} {r:vi} {r:IV}: {c:A} {c:E} {c:F#m} {c:D}, then {c:G} {c:D} {c:Em} {c:C}, a whole step lower.',
      },
    ],
  },
};

export default unit;
