/**
 * Theory Path, unit 12: Chords that belong together. Written from the syllabus entries in
 * `src/content/plan/theory-path.json` (unit `chords-in-a-key`), one lesson per entry, in order:
 * each lesson opens with the "on the guitar" picture, asks the planned exercises, ends with the
 * planned drills, and turns every planned fact into a review card. `chords-in-a-key.test.ts`
 * cross-checks every chord of every key, numeral, shape, progression and shared note against the
 * theory and guitar engines (`harmonizeScale`, `progressionToChords`, `identifyFretted`).
 *
 * Two planned pictures are spread over several steps, because a figure shows one chord box: the
 * chord boxes of a key appear as answer options with their own boxes, and the "table" of numerals
 * over the chords of C and G is written into a card. Lesson titles avoid roman numerals and chord
 * symbols, which the course map shows as plain text.
 */
import type { ChordFigure, Lesson, Unit } from '@/lessons';

const U = 'chords-in-a-key';

/** A chord box with the open (or easy) shape the lesson names. */
const box = (symbol: string, frets: string, caption?: string): ChordFigure => ({ kind: 'chord', symbol, frets, ...(caption ? { caption } : {}) });

/** The shapes these lessons use, string 6 to string 1. */
export const SHAPES: Readonly<Record<string, string>> = {
  G: '320003', C: 'x32010', D: 'xx0232', Am: 'x02210', Em: '022000', Dm: 'xx0231', F: 'xx3211', Fm: 'xx3111',
  Bm: 'x24432', A: 'x02220', E: '022100', 'F#dim': 'xx421x', B: 'x24442', Bdim: 'x2343x',
};
const shape = (symbol: string): ChordFigure => box(symbol, SHAPES[symbol]);

// ── 1. What a key is ──────────────────────────────────────────────────────────────────────────

const whatAKeyIs: Lesson = {
  id: 'what-a-key-is',
  title: 'What a key is',
  teaches: "A piece is in a key when its notes come mainly from one scale and it feels at home on that scale's tonic.",
  minutes: 3,
  skill: `theory:${U}:what-a-key-is`,
  steps: [
    {
      type: 'card',
      title: 'Home base',
      body: "Most songs feel as if they have a home. A song is in a {t:key} when its notes come mainly from one scale and it feels at home on that scale's {t:tonic}. In the key of {k:G major}, the music uses the notes of the {n:G} major scale and feels at home on {n:G}.",
      figure: box('G', SHAPES.G, '{c:G}, 320003: the chord built on {n:G}.'),
    },
    {
      type: 'card',
      title: 'The home chord',
      body: 'The chord built on the tonic is the **home chord**. Many songs end on it, because ending there sounds finished. Listen: {c:G}, {c:C}, {c:D}, and home to {c:G}.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['G', 'C', 'D', 'G'], tempo: 80 }, label: 'Hear {c:G} {c:C} {c:D} {c:G}' },
      tip: 'On the guitar: {c:G} 320003, {c:C} x32010, {c:D} xx0232.',
    },
    {
      type: 'listen-choice',
      prompt: 'The same chords in another order. Does this one end on the home chord?',
      sound: { kind: 'progression', chords: ['G', 'C', 'G', 'D'], tempo: 80 },
      options: [{ text: 'Yes: it sounds finished' }, { text: 'No: it is left hanging', correct: true }],
      shuffle: false,
      explain: 'It ended on {c:D}, not on {c:G}, the home chord of {k:G major}, so it sounds as if something should follow.',
    },
    {
      type: 'choice',
      prompt: 'A song uses mainly the notes {n:G} {n:A} {n:B} {n:C} {n:D} {n:E} {n:F#} and ends on {n:G}. Which key is it in?',
      options: [
        { text: '{k:G major}', correct: true },
        { text: '{k:C major}', why: '{k:C major} has {n:F}, not {n:F#}, and would feel at home on {n:C}.' },
        { text: '{k:D major}', why: '{k:D major} has {n:C#}, not {n:C}, and would feel at home on {n:D}.' },
      ],
      explain: 'Those are the notes of the {n:G} major scale, and the song feels at home on {n:G}: it is in {k:G major}.',
      fact: 'chords-key-g-major',
    },
    {
      type: 'true-false',
      statement: 'A key is a single note.',
      answer: false,
      explain: 'A key is a whole scale with a home note: the key of {k:G major} uses all seven notes of {n:G} major and feels at home on {n:G}.',
      fact: 'chords-key-meaning',
    },
    {
      type: 'choice',
      prompt: 'Which of these is the home chord of {k:G major}?',
      options: [
        { text: '{c:G}', figure: shape('G'), correct: true },
        { text: '{c:C}', figure: shape('C'), why: '{c:C} is built on {n:C}, degree 4 of {n:G} major.' },
        { text: '{c:D}', figure: shape('D'), why: '{c:D} is built on {n:D}, degree 5 of {n:G} major.' },
      ],
      explain: 'The home chord is built on the tonic, {n:G}: the {c:G} chord.',
      fact: 'chords-key-home-chord',
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'C',
      frets: SHAPES.C,
      accept: 'any-voicing',
      prompt: 'Build the home chord of {k:C major} on the fretboard.',
      explain: '{k:C major} feels at home on {n:C}, so its home chord is {c:C}: {n:C} {n:E} {n:G}, played x32010.',
    },
    {
      type: 'choice',
      prompt: 'Why do so many songs end on the home chord?',
      options: [
        { text: 'Ending there sounds finished', correct: true },
        { text: 'It is always the easiest chord to play', why: 'Not always: in {k:F major} the home chord is {c:F}, a hard one at first.' },
        { text: 'It is always the loudest chord', why: 'Loudness has nothing to do with it: the home chord simply feels like home.' },
      ],
      shuffle: false,
      explain: 'The home chord is built on the tonic, the note the music feels drawn to. Ending there sounds settled and finished.',
      fact: 'chords-key-home-chord',
    },
  ],
  facts: [
    {
      id: 'chords-key-meaning',
      front: 'When is a piece of music in a key?',
      back: "When its notes come mainly from one scale and it feels at home on that scale's tonic.",
    },
    {
      id: 'chords-key-g-major',
      front: 'What does it mean that a song is in {k:G major}?',
      back: 'It uses mainly the notes of the {n:G} major scale and feels at home on {n:G}.',
    },
    { id: 'chords-key-home-chord', front: 'What is the home chord of a key?', back: 'The chord built on the tonic. Many songs end on it.' },
  ],
};

// ── 2. Stacking thirds in the scale ───────────────────────────────────────────────────────────

const triadsFromTheScale: Lesson = {
  id: 'triads-from-the-scale',
  title: 'Stacking thirds in the scale',
  teaches: 'Building a triad on each degree from every other note of the scale gives the seven chords of the key.',
  minutes: 4,
  skill: `theory:${U}:triads-from-the-scale`,
  steps: [
    {
      type: 'card',
      title: 'Every other note',
      body: 'Write out {n:C} major: C D E F G A B. Start on any note, then skip one and take one, twice. From {n:C}: {n:C}, skip D, {n:E}, skip F, {n:G}: the {c:C} chord. From {n:D}: {n:D} {n:F} {n:A}, the {c:Dm} chord. Each chord built like this is a {t:triad}.',
      figure: {
        kind: 'keyboard',
        keys: [{ note: 'C4', label: 'C', role: 'root' }, { note: 'E4', label: 'E', role: 'third' }, { note: 'G4', label: 'G', role: 'fifth' }],
        from: 'C4',
        to: 'B4',
        caption: 'Every other note of {n:C} major from {n:C}: {n:C} {n:E} {n:G}.',
      },
    },
    {
      type: 'fill-blanks',
      prompt: 'Stack thirds on {n:D} in {k:C major}.',
      text: '{n:D}  ___  {n:A}',
      blanks: ['{n:F}'],
      bank: ['{n:F#}', '{n:E}', '{n:G}'],
      explain: 'Skip {n:E}, take {n:F}; skip {n:G}, take {n:A}. {n:D} {n:F} {n:A} is {c:Dm}. {n:F#} is not in {k:C major}.',
      fact: 'chords-key-triads-stacking',
    },
    {
      type: 'choice',
      prompt: 'Which triad is built on degree 5 of {k:C major}?',
      options: [
        { text: '{c:G}: {n:G} {n:B} {n:D}', correct: true },
        { text: '{c:Gm}: {n:G} {n:Bb} {n:D}', why: '{n:Bb} is not in {k:C major}.' },
        { text: '{c:Em}: {n:E} {n:G} {n:B}', why: 'That one is built on degree 3, {n:E}.' },
        { text: '{c:Am}: {n:A} {n:C} {n:E}', why: 'That one is built on degree 6, {n:A}.' },
      ],
      explain: 'Degree 5 is {n:G}. Every other note from there: {n:G} {n:B} {n:D}, the {c:G} major chord.',
      fact: 'chords-key-c-triads',
    },
    {
      type: 'card',
      title: 'Seven chords for one key',
      body: 'Do it on all seven notes and you get the chords of the key: {c:C} {c:Dm} {c:Em} {c:F} {c:G} {c:Am} {c:Bdim}. They use only notes of {k:C major}, so they are its {t:diatonic} chords. Songs in {k:C major} are built mostly from them.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim', 'C'], tempo: 100, voicing: 'close' }, label: 'Hear the seven chords' },
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'Dm',
      frets: SHAPES.Dm,
      accept: 'any-voicing',
      prompt: 'Build {c:Dm}, the chord on degree 2 of {k:C major}.',
      explain: '{c:Dm} is {n:D} {n:F} {n:A}: the open string 4, fret 2 on string 3, fret 3 on string 2 and fret 1 on string 1. Written xx0231.',
    },
    {
      type: 'true-false',
      statement: 'The {c:D} major chord, {n:D} {n:F#} {n:A}, is a diatonic chord of {k:C major}.',
      answer: false,
      explain: '{n:F#} is not in {k:C major}, so {c:D} major is not one of its chords. The triad on {n:D} in {k:C major} is {c:Dm}: {n:D} {n:F} {n:A}.',
      fact: 'chords-key-diatonic',
    },
    {
      type: 'choice',
      prompt: 'Which chord is built on degree 4 of {k:C major}?',
      options: [
        { text: '{c:F}', figure: shape('F'), correct: true },
        { text: '{c:Fm}', figure: shape('Fm'), why: '{c:Fm} has {n:Ab}, which is not in {k:C major}.' },
        { text: '{c:Em}', figure: shape('Em'), why: '{c:Em} is built on degree 3, {n:E}.' },
      ],
      explain: 'Degree 4 is {n:F}: {n:F} {n:A} {n:C}, the {c:F} major chord. On the guitar the small {c:F}, xx3211, is the easy shape.',
    },
    { generate: 'diatonic-chord', params: { ask: 'chord', maxAccidentals: 1 } },
    { generate: 'chord-tones', params: { types: ['major', 'minor'], roots: ['C', 'D', 'E', 'F', 'G', 'A'], ask: 'notes' } },
  ],
  facts: [
    {
      id: 'chords-key-triads-stacking',
      front: 'How do you build the chords of a key?',
      back: 'On each degree of the scale, stack every other note of the scale: the root, then a third, then a fifth.',
    },
    {
      id: 'chords-key-c-triads',
      front: 'What are the seven triads of {k:C major}?',
      back: '{c:C} {c:Dm} {c:Em} {c:F} {c:G} {c:Am} {c:Bdim}',
      ask: { generate: 'diatonic-chord', params: { ask: 'chord', maxAccidentals: 0 } },
    },
    { id: 'chords-key-diatonic', front: 'What are diatonic chords?', back: "Chords built only from the notes of a key's scale." },
  ],
};

// ── 3. Major, minor, minor, major, major, minor, diminished ───────────────────────────────────

const theMajorKeyPattern: Lesson = {
  id: 'the-major-key-pattern',
  title: 'Maj, min, min, maj, maj, min, dim',
  teaches: 'In every major key the triads run major, minor, minor, major, major, minor, diminished.',
  minutes: 3,
  skill: `theory:${U}:the-major-key-pattern`,
  steps: [
    {
      type: 'card',
      title: 'One pattern, every key',
      body: 'Stack thirds in {n:G} major and you get {c:G} {c:Am} {c:Bm} {c:C} {c:D} {c:Em} {c:F#dim}: major, minor, minor, major, major, minor, diminished. That is the same pattern as in {k:C major}, because every major scale has the same steps. So **every** major key has it.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['G', 'Am', 'Bm', 'C', 'D', 'Em', 'F#dim', 'G'], tempo: 100, voicing: 'close' }, label: 'Hear the chords of {k:G major}' },
    },
    {
      type: 'choice',
      prompt: 'Which degree of a major key has the diminished triad?',
      options: [{ text: 'Degree 2' }, { text: 'Degree 4' }, { text: 'Degree 5' }, { text: 'Degree 7', correct: true }],
      shuffle: false,
      explain: 'Major, minor, minor, major, major, minor, diminished: the seventh chord is the diminished one. {c:Bdim} in {k:C major}, {c:F#dim} in {k:G major}.',
      fact: 'chords-key-pattern',
    },
    {
      type: 'card',
      title: 'The diminished chord',
      body: 'The chord on degree 7 is a {t:diminished-chord|diminished} triad: a minor third with another minor third on top. In {k:C major} it is {n:B} {n:D} {n:F}; in {k:G major}, {n:F#} {n:A} {n:C}. It sounds tense. On the guitar, play it on three strings: xx421x.',
      figure: box('F#dim', SHAPES['F#dim'], '{c:F#dim} on strings 4 to 2: {n:F#} {n:A} {n:C}.'),
    },
    {
      type: 'choice',
      prompt: '{c:Bdim} is {n:B} {n:D} {n:F}. Which thirds are stacked to make it?',
      options: [
        { text: 'A minor third, then another minor third', correct: true },
        { text: 'A major third, then a minor third', why: 'That stack is a major triad, such as {n:G} {n:B} {n:D}.' },
        { text: 'A minor third, then a major third', why: 'That stack is a minor triad, such as {n:D} {n:F} {n:A}.' },
      ],
      shuffle: false,
      explain: '{n:B} up to {n:D} is three half steps, and {n:D} up to {n:F} is three more: two minor thirds. That is a diminished triad.',
      fact: 'chords-key-diminished',
    },
    {
      type: 'match-pairs',
      prompt: 'In every major key: match each degree with the quality of its chord.',
      pairs: [
        { left: 'Degree 1', right: 'Major' },
        { left: 'Degree 2', right: 'Minor' },
        { left: 'Degree 7', right: 'Diminished' },
      ],
      explain: 'Major, minor, minor, major, major, minor, diminished: degree 1 is major, degree 2 minor, degree 7 diminished.',
      fact: 'chords-key-pattern',
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the chords of {k:D major}.',
      text: '{c:D}  {c:Em}  ___  {c:G}  {c:A}  {c:Bm}  {c:C#dim}',
      blanks: ['{c:F#m}'],
      bank: ['{c:F#}', '{c:Fm}', '{c:F#dim}'],
      explain: 'Degree 3 is minor in every major key. In {k:D major} degree 3 is {n:F#}, so the chord is {c:F#m}: {n:F#} {n:A} {n:C#}.',
      fact: 'chords-key-pattern',
    },
    {
      type: 'true-false',
      statement: 'Degree 4 of a major key has a minor chord.',
      answer: false,
      explain: 'Degree 4 is major: {c:F} in {k:C major}, {c:C} in {k:G major}. The minor chords sit on degrees 2, 3 and 6.',
    },
    {
      type: 'choice',
      prompt: 'Which chord is built on degree 6 of {k:G major}?',
      options: [
        { text: '{c:Em}', figure: shape('Em'), correct: true },
        { text: '{c:E}', figure: shape('E'), why: '{c:E} has {n:G#}, which is not in {k:G major}.' },
        { text: '{c:C}', figure: shape('C'), why: '{c:C} is built on degree 4.' },
        { text: '{c:Am}', figure: shape('Am'), why: '{c:Am} is built on degree 2.' },
      ],
      explain: 'Degree 6 of {n:G} major is {n:E}, and the chord on 6 is minor: {c:Em}, {n:E} {n:G} {n:B}, played 022000.',
      fact: 'chords-key-g-chords',
    },
    {
      type: 'choice',
      prompt: 'Which chord is built on degree 3 of {k:G major}?',
      options: [
        // Every option gets a box, so the picture never singles out the answer.
        { text: '{c:Bm}', figure: shape('Bm'), correct: true },
        { text: '{c:B}', figure: shape('B'), why: '{c:B} has {n:D#}, which is not in {k:G major}.' },
        { text: '{c:Bdim}', figure: shape('Bdim'), why: 'The diminished chord of {k:G major} is on degree 7: {c:F#dim}.' },
      ],
      explain: 'Degree 3 is minor: {n:B} {n:D} {n:F#}, the {c:Bm} chord. Its usual shape, x24432, is a barre chord you will learn later; so is {c:B}.',
      fact: 'chords-key-g-chords',
    },
    { generate: 'diatonic-chord', params: { ask: 'quality', maxAccidentals: 1 } },
    { generate: 'diatonic-chord', params: { ask: 'chord', maxAccidentals: 2 } },
  ],
  facts: [
    {
      id: 'chords-key-pattern',
      front: 'What are the qualities of the seven triads in every major key?',
      back: 'Major, minor, minor, major, major, minor, diminished, from degree 1 to degree 7.',
      ask: { generate: 'diatonic-chord', params: { ask: 'quality', maxAccidentals: 2 } },
    },
    {
      id: 'chords-key-diminished',
      front: 'What is a diminished triad?',
      back: 'A minor third with another minor third on top: {n:B} {n:D} {n:F} in {k:C major}.',
      ask: {
        type: 'choice',
        prompt: 'Which notes make the diminished triad of {k:C major}?',
        options: [
          { text: '{n:B} {n:D} {n:F}', correct: true },
          { text: '{n:B} {n:D} {n:F#}', why: 'That is {c:Bm}: {n:F#} is not in {k:C major}.' },
          { text: '{n:B} {n:D#} {n:F#}', why: 'That is {c:B} major.' },
        ],
        explain: 'Degree 7 of {k:C major} is {n:B}. Every other note from there: {n:B} {n:D} {n:F}, two minor thirds.',
      },
    },
    {
      id: 'chords-key-g-chords',
      front: 'What are the seven chords of {k:G major}?',
      back: '{c:G} {c:Am} {c:Bm} {c:C} {c:D} {c:Em} {c:F#dim}',
    },
  ],
};

// ── 4. Roman numerals ─────────────────────────────────────────────────────────────────────────

const romanNumerals: Lesson = {
  id: 'roman-numerals',
  title: 'Roman numerals',
  teaches: 'Roman numerals name chords by scale degree: upper case for major, lower case for minor, ° for diminished.',
  minutes: 3,
  skill: `theory:${U}:roman-numerals`,
  steps: [
    {
      type: 'card',
      title: 'Numbers for chords',
      body: 'Musicians name the chords of a key by the degree they are built on, in {t:roman-numerals|roman numerals}: {r:I} {r:ii} {r:iii} {r:IV} {r:V} {r:vi} {r:vii°}. **Upper case** means a major chord, **lower case** a minor chord, and **°** a diminished chord.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['C', 'F', 'G', 'C'], tempo: 80 }, label: 'Hear {r:I} {r:IV} {r:V} {r:I} in {n:C}' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each numeral with its chord in {k:C major}.',
      pairs: [
        { left: '{r:I}', right: '{c:C}' },
        { left: '{r:ii}', right: '{c:Dm}' },
        { left: '{r:IV}', right: '{c:F}' },
        { left: '{r:V}', right: '{c:G}' },
        { left: '{r:vi}', right: '{c:Am}' },
      ],
      explain: 'Count up {n:C} major: {r:I} {c:C}, {r:ii} {c:Dm}, {r:IV} {c:F}, {r:V} {c:G}, {r:vi} {c:Am}.',
      fact: 'chords-key-roman-names',
    },
    {
      type: 'choice',
      prompt: 'Why is {r:vi} written in lower case?',
      options: [
        { text: 'It is a minor chord', correct: true },
        { text: 'It is the sixth chord', why: 'The number tells you that; the case tells you the quality.' },
        { text: 'It is played softly', why: 'Case shows the quality of the chord: major or minor.' },
      ],
      shuffle: false,
      explain: 'Lower case means minor: {r:vi} is the minor chord on degree 6, {c:Am} in {k:C major}.',
      fact: 'chords-key-roman-case',
    },
    {
      type: 'card',
      title: 'Same numbers, any key',
      body: 'The numerals stay the same in every key; only the chords change.\nIn {k:C major}: {r:I} is {c:C}, {r:IV} is {c:F}, {r:V} is {c:G}.\nIn {k:G major}: {r:I} is {c:G}, {r:IV} is {c:C}, {r:V} is {c:D}.\nLearn a progression as numerals and you can play it in any key.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['G', 'C', 'D', 'G'], tempo: 80 }, label: 'Hear {r:I} {r:IV} {r:V} {r:I} in {n:G}' },
    },
    {
      type: 'choice',
      prompt: 'In {k:G major}, which chord is {r:IV}?',
      options: [
        { text: '{c:C}', figure: shape('C'), correct: true },
        { text: '{c:D}', figure: shape('D'), why: '{c:D} is {r:V} in {k:G major}.' },
        { text: '{c:Am}', figure: shape('Am'), why: '{c:Am} is {r:ii} in {k:G major}.' },
      ],
      explain: 'Count up {n:G} major: {n:G} {n:A} {n:B} **{n:C}**. Degree 4 is {n:C}, and {r:IV} is major: the {c:C} chord.',
      fact: 'chords-key-roman-any-key',
    },
    {
      type: 'true-false',
      statement: '{r:ii} stands for a major chord.',
      answer: false,
      explain: 'Lower case means minor: {r:ii} is the minor chord on degree 2, {c:Dm} in {k:C major} and {c:Am} in {k:G major}.',
      fact: 'chords-key-roman-case',
    },
    {
      type: 'fill-blanks',
      prompt: 'Fill in the missing chords of {k:G major}.',
      text: '{r:I} is {c:G}, {r:ii} is {c:Am}, {r:iii} is ___, {r:IV} is {c:C}, {r:V} is {c:D}, {r:vi} is ___',
      blanks: ['{c:Bm}', '{c:Em}'],
      bank: ['{c:B}', '{c:E}'],
      explain: '{r:iii} and {r:vi} are minor: {c:Bm} and {c:Em}. {c:B} and {c:E} major have notes outside {k:G major}.',
      fact: 'chords-key-roman-names',
    },
    {
      type: 'choice',
      prompt: 'Which numeral is the diminished chord of a major key?',
      options: [{ text: '{r:ii}' }, { text: '{r:V}' }, { text: '{r:vi}' }, { text: '{r:vii°}', correct: true }],
      shuffle: false,
      explain: 'The small circle ° marks a diminished chord: {r:vii°}, built on degree 7. In {k:C major} it is {c:Bdim}.',
    },
    { generate: 'roman-chord', params: { direction: 'to-chord', maxAccidentals: 1 } },
    { generate: 'roman-chord', params: { direction: 'to-roman', maxAccidentals: 1 } },
  ],
  facts: [
    {
      id: 'chords-key-roman-names',
      front: 'Name the seven chords of a major key in roman numerals.',
      back: '{r:I} {r:ii} {r:iii} {r:IV} {r:V} {r:vi} {r:vii°}',
      ask: { generate: 'roman-chord', params: { direction: 'to-roman', maxAccidentals: 1 } },
    },
    {
      id: 'chords-key-roman-case',
      front: 'In roman numerals, what do upper case, lower case and ° mean?',
      back: 'Upper case: a major chord. Lower case: a minor chord. °: a diminished chord.',
    },
    {
      id: 'chords-key-roman-any-key',
      front: 'What is {r:I}–{r:IV}–{r:V} in {k:C major}, and in {k:G major}?',
      back: '{c:C}–{c:F}–{c:G} in {k:C major}; {c:G}–{c:C}–{c:D} in {k:G major}. The numerals describe the progression in any key.',
      ask: { generate: 'roman-chord', params: { direction: 'to-chord', numerals: ['I', 'IV', 'V'], maxAccidentals: 1 } },
    },
  ],
};

// ── 5. I, IV and V ────────────────────────────────────────────────────────────────────────────

const oneFourFive: Lesson = {
  id: 'one-four-five',
  title: 'One, four and five',
  teaches: 'The chords on degrees 1, 4 and 5 are the three major chords of a major key, and carry countless songs.',
  minutes: 4,
  skill: `theory:${U}:one-four-five`,
  steps: [
    {
      type: 'card',
      title: 'Three major chords',
      body: 'Each major key has exactly three major chords: {r:I}, {r:IV} and {r:V}. In {k:G major} they are {c:G}, {c:C} and {c:D}, three of the first chords guitarists learn. Together they can accompany a huge number of folk, blues, rock and country songs.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['G', 'C', 'D', 'G'], tempo: 90, beats: 4 }, label: 'Hear {c:G} {c:C} {c:D} {c:G}' },
    },
    {
      type: 'choice',
      prompt: 'What is {r:V} in the key of {k:A major}?',
      options: [
        { text: '{c:E}', correct: true },
        { text: '{c:D}', why: '{c:D} is {r:IV} in {k:A major}.' },
        { text: '{c:Em}', why: '{r:V} is upper case, so major. {k:A major} has {n:G#}, not {n:G}.' },
        { text: '{c:Bm}', why: '{c:Bm} is {r:ii} in {k:A major}.' },
      ],
      explain: 'Count up {n:A} major: {n:A} {n:B} {n:C#} {n:D} **{n:E}**. Degree 5 is {n:E}, and {r:V} is major: {c:E}.',
      fact: 'chords-key-one-four-five-keys',
    },
    {
      type: 'card',
      title: 'Play it in G, then in A',
      body: 'Play {c:G}, {c:C}, {c:D}, {c:G}, four beats each. Then move the same {r:I}–{r:IV}–{r:V}–{r:I} to {k:A major}: {c:A} (x02220), {c:D} (xx0232), {c:E} (022100), {c:A}. Same numerals, new key, and still all open chords.',
      figure: box('E', SHAPES.E, '{r:V} in {k:A major}: {c:E}, 022100.'),
    },
    {
      type: 'play-chord',
      prompt: 'Play {r:IV} of {k:G major}: strum {c:C} once, slowly.',
      chord: 'C',
      frets: SHAPES.C,
      explain: 'In {k:G major}, {r:IV} is {c:C}: {n:C} {n:E} {n:G}. Leave string 6 silent: the x means do not play it.',
      alternative: { generate: 'chord-shape', params: { chords: ['C'] } },
    },
    {
      type: 'play-chord',
      prompt: 'Now {r:V} of {k:G major}: strum {c:D}.',
      chord: 'D',
      frets: SHAPES.D,
      explain: '{r:V} of {k:G major} is {c:D}: {n:D} {n:F#} {n:A}. Strum strings 4 to 1 only.',
      alternative: { generate: 'chord-shape', params: { chords: ['D'] } },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete {r:I}–{r:IV}–{r:V} in {k:D major}.',
      text: '{c:D}  ___  {c:A}',
      blanks: ['{c:G}'],
      bank: ['{c:Gm}', '{c:F#m}', '{c:E}'],
      explain: 'In {k:D major}, {r:IV} sits on degree 4, {n:G}, and it is major: {c:G}. So {r:I}–{r:IV}–{r:V} is {c:D}, {c:G}, {c:A}.',
      fact: 'chords-key-one-four-five-keys',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each key with its {r:I}, {r:IV} and {r:V}.',
      pairs: [
        { left: '{k:G major}', right: '{c:G} {c:C} {c:D}' },
        { left: '{k:D major}', right: '{c:D} {c:G} {c:A}' },
        { left: '{k:A major}', right: '{c:A} {c:D} {c:E}' },
        { left: '{k:E major}', right: '{c:E} {c:A} {c:B}' },
        { left: '{k:C major}', right: '{c:C} {c:F} {c:G}' },
      ],
      explain: 'Take degrees 1, 4 and 5 of each major scale: those are its three major chords.',
      fact: 'chords-key-one-four-five-keys',
    },
    {
      type: 'true-false',
      statement: 'In every major key, {r:I}, {r:IV} and {r:V} are major chords.',
      answer: true,
      explain: 'The pattern of a major key is major, minor, minor, major, major, minor, diminished: degrees 1, 4 and 5 are the major ones.',
      fact: 'chords-key-one-four-five',
    },
    {
      type: 'choice',
      prompt: 'Many folk, blues and country songs use only three chords. Which three, in roman numerals?',
      options: [
        { text: '{r:I}, {r:IV} and {r:V}', correct: true },
        { text: '{r:ii}, {r:iii} and {r:vi}', why: 'Those are the minor chords of the key.' },
        { text: '{r:I}, {r:ii} and {r:vii°}', why: '{r:vii°} is the tense diminished chord; it is rarely one of only three.' },
      ],
      shuffle: false,
      explain: 'A huge number of songs use only {r:I}, {r:IV} and {r:V}: {c:G}, {c:C} and {c:D} in {k:G major}.',
      fact: 'chords-key-three-chord-songs',
    },
    // Keys are drawn simplest signature first (C G F D Bb ...). Up to two accidentals keeps the drill to
    // C, G, F and D, keys this path has spelled, until a high difficulty adds Bb; A and E are asked above.
    { generate: 'roman-chord', params: { direction: 'to-chord', numerals: ['I', 'IV', 'V'], maxAccidentals: 2 } },
    { generate: 'roman-chord', params: { direction: 'to-roman', numerals: ['I', 'IV', 'V'], maxAccidentals: 2 } },
  ],
  facts: [
    { id: 'chords-key-one-four-five', front: 'Which are the three major chords of a major key?', back: '{r:I}, {r:IV} and {r:V}: the chords on degrees 1, 4 and 5.' },
    {
      id: 'chords-key-one-four-five-keys',
      front: 'What is {r:I}–{r:IV}–{r:V} in {k:G major}, {k:D major}, {k:A major}, {k:E major} and {k:C major}?',
      back: '{c:G}–{c:C}–{c:D}, {c:D}–{c:G}–{c:A}, {c:A}–{c:D}–{c:E}, {c:E}–{c:A}–{c:B} and {c:C}–{c:F}–{c:G}.',
      ask: { generate: 'roman-chord', params: { direction: 'to-chord', numerals: ['I', 'IV', 'V'], maxAccidentals: 2 } },
    },
    {
      id: 'chords-key-three-chord-songs',
      front: 'Which three chords carry a huge number of folk, blues, rock and country songs?',
      back: '{r:I}, {r:IV} and {r:V}.',
    },
  ],
};

// ── 6. Adding vi ──────────────────────────────────────────────────────────────────────────────

const theSixChord: Lesson = {
  id: 'the-six-chord',
  title: 'Adding the minor chord on 6',
  teaches: 'The minor chord on degree 6 joins the chords on 1, 4 and 5 in the most common progressions in pop.',
  minutes: 3,
  skill: `theory:${U}:the-six-chord`,
  steps: [
    {
      type: 'card',
      title: 'The minor chord on 6',
      body: 'The chord on degree 6, {r:vi}, is minor: {c:Am} in {k:C major}, {c:Em} in {k:G major}. Add it to {r:I}, {r:IV} and {r:V} and you have the four chords behind a great many pop songs. In {k:G major}: {c:G}, {c:C}, {c:D} and {c:Em}.',
      figure: box('Em', SHAPES.Em, '{r:vi} in {k:G major}: {c:Em}, 022000.'),
    },
    {
      type: 'choice',
      prompt: 'Which chord is {r:vi} in {k:D major}?',
      options: [
        { text: '{c:Bm}', correct: true },
        { text: '{c:B}', why: '{r:vi} is lower case: a minor chord.' },
        { text: '{c:F#m}', why: '{c:F#m} is {r:iii} in {k:D major}.' },
        { text: '{c:Em}', why: '{c:Em} is {r:ii} in {k:D major}.' },
      ],
      explain: 'Count up {n:D} major: {n:D} {n:E} {n:F#} {n:G} {n:A} **{n:B}**. Degree 6 is {n:B}, and {r:vi} is minor: {c:Bm}.',
      fact: 'chords-key-six-chord',
    },
    {
      type: 'card',
      title: 'The pop loop',
      body: '{r:I}–{r:V}–{r:vi}–{r:IV} is one of the most used progressions in pop music. In {k:G major}: {c:G}, {c:D}, {c:Em}, {c:C}. Give each chord one bar of down-up strumming and loop it. Play the same chords as {r:I}–{r:vi}–{r:IV}–{r:V} and you get the sound of many 1950s ballads.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['G', 'D', 'Em', 'C', 'G', 'Em', 'C', 'D'], tempo: 90 }, label: 'Hear both loops' },
      tip: 'If a change comes late, keep your strumming hand moving and let the last upstroke before it hit the open strings.',
    },
    {
      type: 'play-chord',
      prompt: 'Strum the new chord, {c:Em}: {r:vi} of {k:G major}.',
      chord: 'Em',
      frets: SHAPES.Em,
      explain: '{c:Em} is {n:E} {n:G} {n:B}: fret 2 on strings 5 and 4, with all six strings ringing. Now try the loop {c:G}, {c:D}, {c:Em}, {c:C}.',
      alternative: { generate: 'chord-shape', params: { chords: ['Em'] } },
    },
    {
      type: 'listen-choice',
      prompt: 'Which progression do you hear?',
      sound: { kind: 'progression', chords: ['G', 'D', 'Em', 'C'], tempo: 90 },
      options: [{ text: '{r:I}–{r:IV}–{r:V}–{r:I}' }, { text: '{r:I}–{r:V}–{r:vi}–{r:IV}', correct: true }],
      shuffle: false,
      explain: 'That was {c:G}, {c:D}, {c:Em}, {c:C}: {r:I}–{r:V}–{r:vi}–{r:IV}. The third chord was minor, and the loop did not come back home to {c:G}.',
    },
    {
      type: 'choice',
      prompt: '{c:C} ({n:C} {n:E} {n:G}) and {c:Am} ({n:A} {n:C} {n:E}) share two notes. Which two notes do {c:G} and {c:Em} share?',
      options: [
        { text: '{n:G} and {n:B}', correct: true },
        { text: '{n:E} and {n:G}', why: '{c:G} has no {n:E}: it is {n:G} {n:B} {n:D}.' },
        { text: '{n:B} and {n:D}', why: '{c:Em} has no {n:D}: it is {n:E} {n:G} {n:B}.' },
      ],
      explain: '{c:G} is {n:G} {n:B} {n:D} and {c:Em} is {n:E} {n:G} {n:B}: they share {n:G} and {n:B}. Sharing two notes is why {r:I} and {r:vi} sound so closely related.',
      fact: 'chords-key-shared-notes',
    },
    {
      type: 'true-false',
      statement: 'The {r:vi} chord of a major key is a major chord.',
      answer: false,
      explain: 'Lower case means minor: {r:vi} is the minor chord on degree 6, {c:Em} in {k:G major}.',
      fact: 'chords-key-six-chord',
    },
    {
      type: 'choice',
      prompt: 'Which is {r:I}–{r:V}–{r:vi}–{r:IV} in {k:C major}?',
      options: [
        { text: '{c:C} {c:G} {c:Am} {c:F}', correct: true },
        { text: '{c:C} {c:F} {c:G} {c:Am}', why: 'That is {r:I}–{r:IV}–{r:V}–{r:vi}.' },
        { text: '{c:C} {c:G} {c:A} {c:F}', why: '{r:vi} is minor: {c:Am}, not {c:A}.' },
      ],
      explain: 'In {k:C major}: {r:I} {c:C}, {r:V} {c:G}, {r:vi} {c:Am}, {r:IV} {c:F}.',
      fact: 'chords-key-pop-progression',
    },
    { generate: 'roman-chord', params: { direction: 'to-chord', numerals: ['vi', 'I', 'IV', 'V'], maxAccidentals: 2 } },
    { generate: 'diatonic-chord', params: { ask: 'chord', maxAccidentals: 2 } },
  ],
  facts: [
    {
      id: 'chords-key-six-chord',
      front: 'What is the {r:vi} chord of a major key?',
      back: 'The minor chord built on degree 6: {c:Am} in {k:C major}, {c:Em} in {k:G major}.',
      ask: { generate: 'roman-chord', params: { direction: 'to-chord', numerals: ['vi'], maxAccidentals: 2 } },
    },
    {
      id: 'chords-key-pop-progression',
      front: 'Name one of the most used progressions in pop, as numerals and in {k:G major}.',
      back: '{r:I}–{r:V}–{r:vi}–{r:IV}: {c:G}–{c:D}–{c:Em}–{c:C}.',
    },
    {
      id: 'chords-key-shared-notes',
      front: 'Why do {r:I} and {r:vi} sound closely related?',
      back: 'They share two notes: {c:C} ({n:C} {n:E} {n:G}) and {c:Am} ({n:A} {n:C} {n:E}) share {n:C} and {n:E}.',
    },
  ],
};

/** Unit 12 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'Chords that belong together',
  theme: 'harmony',
  description: 'What a key is, the seven chords of a major key, roman numerals, and the progressions built from them.',
  lessons: [whatAKeyIs, triadsFromTheScale, theMajorKeyPattern, romanNumerals, oneFourFive, theSixChord],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      {
        type: 'choice',
        prompt: 'When is a song in the key of {k:D major}?',
        options: [
          { text: "It uses {n:D} major's notes and feels at home on {n:D}", correct: true },
          { text: 'It uses only the note {n:D}', why: 'A key is a whole scale with a home note, not one note.' },
          { text: 'It starts on a {c:D} chord', why: 'Where a song starts does not decide its key: its notes and its home do.' },
        ],
        explain: 'A song is in {k:D major} when its notes come mainly from the {n:D} major scale and it feels at home on {n:D}.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Stack thirds on {n:E} in {k:C major}.',
        text: '{n:E}  ___  {n:B}',
        blanks: ['{n:G}'],
        bank: ['{n:G#}', '{n:F}', '{n:A}'],
        explain: 'Skip {n:F}, take {n:G}; skip {n:A}, take {n:B}. {n:E} {n:G} {n:B} is {c:Em}, the chord on degree 3.',
      },
      {
        type: 'order',
        prompt: 'Put the chord qualities of a major key in order, from degree 1 to degree 7.',
        tiles: ['Major', 'Minor', 'Minor', 'Major', 'Major', 'Minor', 'Diminished'],
        explain: 'Every major key runs major, minor, minor, major, major, minor, diminished.',
      },
      {
        type: 'match-pairs',
        prompt: 'In {k:D major}, match each numeral with its chord.',
        pairs: [
          { left: '{r:I}', right: '{c:D}' },
          { left: '{r:ii}', right: '{c:Em}' },
          { left: '{r:IV}', right: '{c:G}' },
          { left: '{r:V}', right: '{c:A}' },
          { left: '{r:vi}', right: '{c:Bm}' },
        ],
        explain: '{n:D} major is {n:D} {n:E} {n:F#} {n:G} {n:A} {n:B} {n:C#}: {r:I} {c:D}, {r:ii} {c:Em}, {r:IV} {c:G}, {r:V} {c:A}, {r:vi} {c:Bm}.',
      },
      {
        type: 'choice',
        prompt: 'Which numeral stands for a minor chord?',
        options: [{ text: '{r:I}' }, { text: '{r:IV}' }, { text: '{r:V}' }, { text: '{r:vi}', correct: true }],
        shuffle: false,
        explain: 'Lower case means minor: {r:vi}. Upper case {r:I}, {r:IV} and {r:V} are the major chords.',
      },
      {
        type: 'choice',
        prompt: 'Which is {r:I}–{r:V}–{r:vi}–{r:IV} in {k:C major}?',
        options: [
          { text: '{c:C} {c:G} {c:Am} {c:F}', correct: true },
          { text: '{c:C} {c:G} {c:A} {c:F}', why: '{r:vi} is minor: {c:Am}.' },
          { text: '{c:C} {c:F} {c:G} {c:Am}', why: 'That is {r:I}–{r:IV}–{r:V}–{r:vi}.' },
        ],
        explain: 'In {k:C major}: {r:I} {c:C}, {r:V} {c:G}, {r:vi} {c:Am}, {r:IV} {c:F}.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Complete {r:I}–{r:IV}–{r:V} in {k:E major}.',
        text: '{c:E}  {c:A}  ___',
        blanks: ['{c:B}'],
        bank: ['{c:Bm}', '{c:C#m}', '{c:G#m}'],
        explain: 'Degree 5 of {n:E} major is {n:B}, and {r:V} is major: {c:B}. So {r:I}–{r:IV}–{r:V} is {c:E}, {c:A}, {c:B}.',
      },
      {
        type: 'choice',
        prompt: 'Which is {r:I}–{r:V}–{r:vi}–{r:IV} in {k:A major}?',
        options: [
          { text: '{c:A} {c:E} {c:F#m} {c:D}', correct: true },
          { text: '{c:A} {c:E} {c:F#} {c:D}', why: '{r:vi} is minor: {c:F#m}.' },
          { text: '{c:A} {c:D} {c:E} {c:F#m}', why: 'That is {r:I}–{r:IV}–{r:V}–{r:vi}.' },
        ],
        explain: 'In {k:A major}: {r:I} {c:A}, {r:V} {c:E}, {r:vi} {c:F#m}, {r:IV} {c:D}.',
      },
      {
        type: 'choice',
        prompt: 'In {k:F major}, which chord is {r:IV}?',
        options: [
          { text: '{c:Bb}', correct: true },
          { text: '{c:Bbm}', why: '{r:IV} is upper case: a major chord.' },
          { text: '{c:C}', why: '{c:C} is {r:V} in {k:F major}.' },
          { text: '{c:Dm}', why: '{c:Dm} is {r:vi} in {k:F major}.' },
        ],
        explain: '{n:F} major is {n:F} {n:G} {n:A} {n:Bb} {n:C} {n:D} {n:E}. Degree 4 is {n:Bb}, and {r:IV} is major: {c:Bb}.',
      },
      {
        type: 'true-false',
        statement: 'In every major key, the chord on degree 7 is diminished.',
        answer: true,
        explain: 'Major, minor, minor, major, major, minor, diminished: {r:vii°} is diminished in every major key.',
      },
      { generate: 'diatonic-chord', params: { ask: 'chord', maxAccidentals: 1 } },
      { generate: 'roman-chord', params: { direction: 'to-roman', maxAccidentals: 1 } },
      {
        type: 'listen-choice',
        prompt: 'A phrase in {k:D major}. Does it end on the home chord?',
        sound: { kind: 'progression', chords: ['D', 'G', 'A', 'D'], tempo: 80 },
        options: [{ text: 'Yes: it sounds finished', correct: true }, { text: 'No: it is left hanging' }],
        shuffle: false,
        explain: 'It went {c:D}, {c:G}, {c:A} and back to {c:D}, the home chord of {k:D major}: {r:I}–{r:IV}–{r:V}–{r:I}.',
      },
      {
        type: 'chord-build',
        task: 'fingers',
        chord: 'D',
        frets: SHAPES.D,
        accept: 'any-voicing',
        prompt: 'Build the home chord of {k:D major}.',
        explain: 'The home chord of {k:D major} is {c:D}: {n:D} {n:F#} {n:A}, played xx0232.',
      },
    ],
  },
};

export default unit;
