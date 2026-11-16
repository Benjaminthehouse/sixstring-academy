/**
 * Theory Path, unit 24: Harmony in minor keys. Written from the syllabus entries in
 * `src/content/plan/theory-path.json` (unit `minor-key-harmony`), one lesson per entry, in order:
 * each lesson opens with its "on the guitar" picture, asks the planned exercises, ends with the
 * planned drills, and turns every planned fact into a review card.
 *
 * Numerals follow the app's convention (A minor is i ii° bIII iv v bVI bVII, each root measured
 * against the major scale); the first lesson says so and names the classical III VI VII.
 * `minor-key-harmony.test.ts` cross-checks every chord, numeral, scale note, progression, shape and
 * listening question against the theory and guitar engines.
 */
import type { Lesson, Unit } from '@/lessons';

const U = 'minor-key-harmony';

const naturalMinorChords: Lesson = {
  id: 'natural-minor-chords',
  title: 'The chords of a minor key',
  teaches: 'Stacking thirds in natural minor gives minor, diminished, major, minor, minor, major and major chords.',
  minutes: 4,
  skill: `theory:${U}:natural-minor-chords`,
  steps: [
    {
      type: 'card',
      title: 'Seven chords from natural minor',
      body: 'Stack thirds on each note of {k:A minor} ({n:A} {n:B} {n:C} {n:D} {n:E} {n:F} {n:G}), using only the notes of the scale, and you get seven chords: {c:Am} {c:Bdim} {c:C} {c:Dm} {c:Em} {c:F} {c:G}. They are the chords of {k:C major}, starting from {c:Am}.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G', 'Am'], tempo: 96, beats: 2 }, label: 'Hear the seven chords' },
    },
    {
      type: 'card',
      title: 'Minor, diminished, major ...',
      body: 'The qualities always come in this order: **minor, diminished, major, minor, minor, major, major**. On the guitar: {c:Am} x02210, {c:Bdim} x2343x, {c:C} x32010, {c:Dm} xx0231, {c:Em} 022000, {c:F} xx3211, {c:G} 320003.',
      figure: { kind: 'chord', symbol: 'Bdim', frets: 'x2343x', caption: '{c:Bdim}: {n:B} {n:D} {n:F}, the only diminished chord.' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the chords of {k:E minor}.',
      text: '{c:Em}  {c:F#dim}  {c:G}  {c:Am}  {c:Bm}  ___  {c:D}',
      blanks: ['{c:C}'],
      bank: ['{c:Cm}', '{c:C#dim}', '{c:B}'],
      explain: 'Degree 6 of {k:E minor} is {n:C}. Stacking thirds from the scale gives {n:C} {n:E} {n:G}: {c:C}, a major chord, the 6th quality in the pattern.',
      fact: 'minor-key-triad-qualities',
    },
    {
      type: 'true-false',
      statement: 'In natural minor, the chord on degree 5 is major.',
      answer: false,
      explain: 'In natural minor it is minor: {c:Em} ({n:E} {n:G} {n:B}) in {k:A minor}. It only turns major when the 7th note is raised, which is the next lesson.',
      fact: 'minor-key-triad-qualities',
    },
    {
      type: 'card',
      title: 'Numerals in a minor key',
      body: 'This app writes the seven chords of {k:A minor} as {r:i}, {r:ii°}, {r:bIII}, {r:iv}, {r:v}, {r:bVI}, {r:bVII}. Each root is measured against the major scale: {n:C} is a flat 3rd above {n:A}, so {c:C} is {r:bIII}. Many classical books write {r:III}, {r:VI} and {r:VII} instead.',
      figure: { kind: 'chord', symbol: 'F', frets: 'xx3211', caption: '{c:F}, {r:bVI} in {k:A minor}: a flat 6th above {n:A}.' },
    },
    {
      type: 'choice',
      prompt: 'In {k:A minor}, which chord is {r:bVI}?',
      options: [
        { text: '{c:F}', correct: true },
        { text: '{c:G}', why: '{c:G} is {r:bVII}, built on the 7th note.' },
        { text: '{c:C}', why: '{c:C} is {r:bIII}, built on the 3rd note.' },
        { text: '{c:Dm}', why: '{c:Dm} is {r:iv}, built on the 4th note.' },
      ],
      explain: 'Degree 6 of {k:A minor} is {n:F}, a flat 6th above {n:A}. The chord built there is {c:F}, a major chord, so it is written {r:bVI}.',
      fact: 'minor-key-numerals',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each numeral with its chord in {k:A minor}.',
      pairs: [
        { left: '{r:i}', right: '{c:Am}' },
        { left: '{r:bIII}', right: '{c:C}' },
        { left: '{r:iv}', right: '{c:Dm}' },
        { left: '{r:v}', right: '{c:Em}' },
        { left: '{r:bVII}', right: '{c:G}' },
      ],
      explain: 'In {k:A minor}: {r:i} {c:Am}, {r:ii°} {c:Bdim}, {r:bIII} {c:C}, {r:iv} {c:Dm}, {r:v} {c:Em}, {r:bVI} {c:F}, {r:bVII} {c:G}.',
      fact: 'minor-key-a-minor-chords',
    },
    {
      type: 'choice',
      prompt: 'A classical book calls the chord on degree 7 of {k:A minor} {r:VII}. How does this app write it?',
      options: [
        { text: '{r:bVII}', correct: true },
        { text: '{r:vii°}', why: '{r:vii°} is the diminished chord on a raised 7th: {c:G#dim} in {k:A minor}.' },
        { text: '{r:VII}', why: 'Here {r:VII} would be built a major 7th above {n:A}, on {n:G#}.' },
      ],
      shuffle: false,
      explain: '{n:G} is a flat 7th above {n:A}, measured against the major scale, so this app writes {c:G} as {r:bVII}.',
      fact: 'minor-key-numerals',
    },
    { generate: 'diatonic-chord', params: { ask: 'quality', modes: ['minor'], maxAccidentals: 2 } },
    { generate: 'roman-chord', params: { direction: 'to-chord', modes: ['minor'], numerals: ['i', 'iv', 'v', 'bVII', 'bVI', 'bIII', 'ii°'], maxAccidentals: 2 } },
  ],
  facts: [
    {
      id: 'minor-key-triad-qualities',
      front: 'What are the qualities of the natural-minor triads, from degree 1 to 7?',
      back: 'Minor, diminished, major, minor, minor, major, major.',
      ask: {
        type: 'order',
        prompt: 'Put the qualities of the natural-minor triads in order, from degree 1 to 7.',
        tiles: ['Minor', 'Diminished', 'Major', 'Minor', 'Minor', 'Major', 'Major'],
        explain: 'Minor, diminished, major, minor, minor, major, major: in {k:A minor}, {c:Am} {c:Bdim} {c:C} {c:Dm} {c:Em} {c:F} {c:G}.',
      },
    },
    {
      id: 'minor-key-a-minor-chords',
      front: 'Name the seven chords of {k:A minor}.',
      back: '{c:Am} {c:Bdim} {c:C} {c:Dm} {c:Em} {c:F} {c:G}.',
      ask: { generate: 'diatonic-chord', params: { ask: 'chord', modes: ['minor'], maxAccidentals: 0 } },
    },
    {
      id: 'minor-key-numerals',
      front: 'How does this app write the chords of a minor key in roman numerals?',
      back: '{r:i} {r:ii°} {r:bIII} {r:iv} {r:v} {r:bVI} {r:bVII}, measuring each root against the major scale. Many classical books write {r:III}, {r:VI} and {r:VII} instead.',
    },
  ],
};

const theMajorV: Lesson = {
  id: 'the-major-v',
  title: 'The borrowed major V',
  teaches: 'Raising the 7th of the minor scale makes the chord on degree 5 major, giving minor keys a strong pull home.',
  minutes: 3,
  skill: `theory:${U}:the-major-v`,
  steps: [
    {
      type: 'card',
      title: 'One raised note',
      body: 'In natural minor the chord on degree 5 is minor: {c:Em} in {k:A minor}. Raise the 7th note, {n:G}, to {n:G#}, as harmonic minor does, and it becomes {c:E}: a major {r:V}. On the guitar it is one finger: {c:E} (022100) has {n:G#} at string 3, fret 1, where {c:Em} has the open {n:G}.',
      figure: { kind: 'chord', symbol: 'E', frets: '022100', caption: '{c:E}: {n:G#} at string 3, fret 1. {c:Em} (022000) has the open {n:G}.' },
    },
    {
      type: 'choice',
      prompt: 'What is the major {r:V} chord in {k:D minor}?',
      options: [
        { text: '{c:A}', correct: true },
        { text: '{c:Am}', why: '{c:Am} is the natural-minor {r:v}: its {n:C} is not raised.' },
        { text: '{c:C}', why: '{c:C} is {r:bVII}, built on the 7th note.' },
        { text: '{c:Bb}', why: '{c:Bb} is {r:bVI}, built on the 6th note.' },
      ],
      explain: 'Degree 5 of {k:D minor} is {n:A}. With the 7th raised from {n:C} to {n:C#}, the chord is {n:A} {n:C#} {n:E}: {c:A}, or {c:A7} with a 7th on top.',
      fact: 'minor-key-major-five',
    },
    {
      type: 'card',
      title: 'Hear the pull',
      body: 'Play {c:Am} {c:Dm} {c:Em} {c:Am}, then {c:Am} {c:Dm} {c:E} {c:Am}. The second ending sounds far more final: {n:G#}, the {t:leading-tone|leading tone}, rises a half step to {n:A}. {r:V}–{r:i} is the strong cadence of a minor key.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['Am', 'Dm', 'Em', 'Am', 'Am', 'Dm', 'E', 'Am'], tempo: 84, beats: 2 }, label: 'Hear {r:v}–{r:i}, then {r:V}–{r:i}' },
    },
    {
      type: 'listen-choice',
      prompt: 'Listen. Did this minor-key phrase end with {r:v}–{r:i} or {r:V}–{r:i}?',
      sound: { kind: 'progression', chords: ['Am', 'Dm', 'E', 'Am'], tempo: 84, beats: 4 },
      options: [{ text: 'Minor {r:v} to {r:i}' }, { text: 'Major {r:V} to {r:i}', correct: true }],
      shuffle: false,
      explain: 'The chord before the last was {c:E}, major: its {n:G#} rose a half step to {n:A}. {c:Em} would have had a plain {n:G}, a whole step below.',
    },
    {
      type: 'type-answer',
      prompt: 'Type the leading tone of {k:E minor}: its raised 7th note.',
      answer: { kind: 'note', value: 'D#', spelling: 'exact' },
      input: 'keypad',
      explain: 'The 7th note of {k:E minor} is {n:D}; harmonic minor raises it to {n:D#}, a half step below {n:E}. So the major {r:V} is {c:B}: {n:B} {n:D#} {n:F#}.',
      fact: 'minor-key-leading-tone',
    },
    {
      type: 'fretboard-find',
      prompt: 'In the open {c:E} chord, tap the leading tone of {k:A minor}.',
      find: { note: 'G#3' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 3],
      shown: [
        { string: 6, fret: 0, note: 'E2' },
        { string: 5, fret: 2, note: 'B2' },
        { string: 4, fret: 2, note: 'E3' },
        { string: 2, fret: 0, note: 'B3' },
        { string: 1, fret: 0, note: 'E4' },
      ],
      explain: '{n:G#} is at string 3, fret 1 in {c:E} (022100): a half step below {n:A}, the tonic it pulls up to.',
      fact: 'minor-key-leading-tone',
    },
    {
      type: 'true-false',
      statement: 'The raised 7th also gives a diminished chord on degree 7: {c:G#dim} in {k:A minor}.',
      answer: true,
      explain: '{n:G#} {n:B} {n:D} is a diminished triad, {r:vii°}. Like {c:E}, it holds the leading tone {n:G#}.',
      fact: 'minor-key-dim-seven',
    },
    { generate: 'diatonic-chord', params: { ask: 'chord', modes: ['minor'], maxAccidentals: 2 } },
    { generate: 'cadence-ear', params: { types: ['authentic', 'half'] } },
  ],
  facts: [
    {
      id: 'minor-key-major-five',
      front: 'What does the raised 7th of harmonic minor do to the chord on degree 5?',
      back: 'It makes it major: {r:V}, {c:E} or {c:E7} in {k:A minor}.',
      ask: {
        type: 'choice',
        prompt: 'What is the major {r:V} chord in {k:A minor}?',
        options: [
          { text: '{c:E}', correct: true },
          { text: '{c:Em}', why: '{c:Em} is the natural-minor {r:v}, with a plain {n:G}.' },
          { text: '{c:G}', why: '{c:G} is {r:bVII}.' },
        ],
        explain: 'With {n:G} raised to {n:G#}, the chord on {n:E} is {n:E} {n:G#} {n:B}: {c:E}.',
      },
    },
    {
      id: 'minor-key-leading-tone',
      front: 'Why does the major {r:V} make {r:V}–{r:i} a strong cadence in a minor key?',
      back: 'It holds the leading tone ({n:G#} in {k:A minor}), which pulls up a half step to the tonic.',
    },
    {
      id: 'minor-key-dim-seven',
      front: 'Which chord does the raised 7th give on degree 7 of a minor key?',
      back: 'A diminished chord, {r:vii°}: {c:G#dim} in {k:A minor}.',
    },
  ],
};

const minorProgressions: Lesson = {
  id: 'minor-progressions',
  title: 'Common minor progressions',
  teaches: 'A few loops built from the chords of a minor key make up much of minor-key rock and pop.',
  minutes: 3,
  skill: `theory:${U}:minor-progressions`,
  steps: [
    {
      type: 'card',
      title: 'Minor-key loops',
      body: 'Two loops carry a great deal of minor-key rock and pop: {r:i}–{r:bVII}–{r:bVI}–{r:bVII} ({c:Am} {c:G} {c:F} {c:G}) and {r:i}–{r:bVI}–{r:bIII}–{r:bVII} ({c:Am} {c:F} {c:C} {c:G}). Underneath them sit the basics: {r:i}–{r:iv}–{r:v} and {r:i}–{r:iv}–{r:V}.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['Am', 'G', 'F', 'G', 'Am'], tempo: 84, beats: 4 }, label: 'Hear {c:Am} {c:G} {c:F} {c:G}' },
      tip: 'Shapes: {c:Am} x02210, {c:G} 320003, {c:F} xx3211, {c:C} x32010. In {k:E minor}: {c:Em} 022000, {c:D} xx0232, {c:C}, {c:G}.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each progression with its chords in {k:A minor}.',
      pairs: [
        { left: '{r:i}–{r:bVII}–{r:bVI}–{r:bVII}', right: '{c:Am} {c:G} {c:F} {c:G}' },
        { left: '{r:i}–{r:bVI}–{r:bIII}–{r:bVII}', right: '{c:Am} {c:F} {c:C} {c:G}' },
        { left: '{r:i}–{r:iv}–{r:V}', right: '{c:Am} {c:Dm} {c:E}' },
      ],
      explain: 'In {k:A minor}: {r:i} {c:Am}, {r:bIII} {c:C}, {r:iv} {c:Dm}, {r:V} {c:E}, {r:bVI} {c:F}, {r:bVII} {c:G}.',
      fact: 'minor-key-rock-loops',
    },
    {
      type: 'listen-choice',
      prompt: 'Which loop do you hear: {r:i}–{r:bVII}–{r:bVI}–{r:bVII} or {r:i}–{r:bVI}–{r:bIII}–{r:bVII}?',
      sound: { kind: 'progression', chords: ['Am', 'F', 'C', 'G'], tempo: 84, beats: 4 },
      options: [{ text: '{r:i}–{r:bVII}–{r:bVI}–{r:bVII}' }, { text: '{r:i}–{r:bVI}–{r:bIII}–{r:bVII}', correct: true }],
      shuffle: false,
      explain: 'It went {c:Am} {c:F} {c:C} {c:G}: {r:i}–{r:bVI}–{r:bIII}–{r:bVII}. The other loop goes down {c:Am} {c:G} {c:F} and back up to {c:G}.',
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete {r:i}–{r:bVI}–{r:bIII}–{r:bVII} in {k:E minor}.',
      text: '{c:Em}  {c:C}  ___  {c:D}',
      blanks: ['{c:G}'],
      bank: ['{c:Gm}', '{c:B}', '{c:A}'],
      explain: '{r:bIII} in {k:E minor} is built on {n:G}, the 3rd note of the scale: {c:G}. The loop is {c:Em} {c:C} {c:G} {c:D}.',
      fact: 'minor-key-rock-loops',
    },
    {
      type: 'card',
      title: 'The rock ending',
      body: 'Many rock songs end {r:bVII}–{r:i}: {c:G} to {c:Am}. Its {r:bVII} is built on the {t:subtonic}, {n:G}, a whole step below the tonic. There is no leading tone a half step below {n:A}, so the ending sounds strong but open, not pulled tight like {c:E} to {c:Am}.',
      figure: { kind: 'chord', symbol: 'G', frets: '320003', caption: '{c:G}, {r:bVII} in {k:A minor}, built on the subtonic {n:G}.' },
    },
    {
      type: 'choice',
      prompt: 'Why does {c:G} to {c:Am} pull less tightly than {c:E} to {c:Am}?',
      options: [
        { text: '{c:G} has no leading tone, only {n:G}', correct: true },
        { text: '{c:G} is a minor chord', why: '{c:G} is major: {n:G} {n:B} {n:D}.' },
        { text: '{c:G} is not in {k:A minor}', why: '{c:G} is {r:bVII}, one of the natural-minor chords of {k:A minor}.' },
      ],
      shuffle: false,
      explain: '{c:G} is built on the subtonic {n:G}, a whole step below {n:A}. {c:E} holds {n:G#}, a half step below, which pulls up to {n:A}.',
      fact: 'minor-key-subtonic-ending',
    },
    {
      type: 'true-false',
      statement: 'In {k:A minor}, {r:i}–{r:iv}–{r:V} is {c:Am} {c:Dm} {c:E}.',
      answer: true,
      explain: '{r:i} is {c:Am}, {r:iv} is {c:Dm}, and the major {r:V} (with {n:G#}) is {c:E}. With the natural-minor {r:v} it would be {c:Am} {c:Dm} {c:Em}.',
      fact: 'minor-key-basic-progressions',
    },
    {
      type: 'play-chord',
      prompt: 'Play {c:Am} {c:G} {c:F} {c:G} at your own pace. First strum {c:F} (xx3211), the hardest change, once.',
      chord: 'F',
      frets: 'xx3211',
      explain: '{c:F} is {n:F} {n:A} {n:C}: the index finger flattens across strings 1 and 2 at fret 1. It is {r:bVI} in {k:A minor}.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'F',
        frets: 'xx3211',
        accept: 'any-voicing',
        prompt: 'Build {c:F}, the {r:bVI} chord of {k:A minor}.',
        explain: 'The small {c:F}: string 4 fret 3, string 3 fret 2, strings 2 and 1 at fret 1. {n:F} {n:A} {n:C}.',
      },
    },
    { generate: 'roman-chord', params: { direction: 'to-chord', modes: ['minor'], numerals: ['i', 'iv', 'v', 'V', 'bVII', 'bVI', 'bIII'], maxAccidentals: 2 } },
    { generate: 'roman-chord', params: { direction: 'to-roman', modes: ['minor'], numerals: ['i', 'iv', 'v', 'bVII', 'bVI', 'bIII'], maxAccidentals: 2 } },
  ],
  facts: [
    {
      id: 'minor-key-rock-loops',
      front: 'Name two common minor-key loops of rock and pop.',
      back: '{r:i}–{r:bVII}–{r:bVI}–{r:bVII} ({c:Am} {c:G} {c:F} {c:G}) and {r:i}–{r:bVI}–{r:bIII}–{r:bVII} ({c:Am} {c:F} {c:C} {c:G}).',
    },
    {
      id: 'minor-key-basic-progressions',
      front: 'What are the basic minor-key progressions?',
      back: '{r:i}–{r:iv}–{r:v} and {r:i}–{r:iv}–{r:V}: in {k:A minor}, {c:Am} {c:Dm} {c:Em} and {c:Am} {c:Dm} {c:E}.',
    },
    {
      id: 'minor-key-subtonic-ending',
      front: 'What is the {r:bVII}–{r:i} rock ending, and why has it no leading tone?',
      back: '{c:G} to {c:Am} in {k:A minor}. Its {r:bVII} is built on the subtonic, a whole step below the tonic, so no note pulls up by a half step.',
    },
  ],
};

const theAndalusianCadence: Lesson = {
  id: 'the-andalusian-cadence',
  title: 'The Andalusian cadence',
  teaches: 'The Andalusian cadence is a falling minor progression: the tonic chord, then the chords on 7, 6 and a major 5.',
  minutes: 3,
  skill: `theory:${U}:the-andalusian-cadence`,
  steps: [
    {
      type: 'card',
      title: 'Four chords walking down',
      body: 'The {t:andalusian-cadence|Andalusian cadence} is {r:i}–{r:bVII}–{r:bVI}–{r:V}: in {k:A minor}, {c:Am} {c:G} {c:F} {c:E}. Each chord steps down from the one before, and the major {c:E} at the end pulls back to {c:Am}. Strum each chord for one bar.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['Am', 'G', 'F', 'E', 'Am'], tempo: 84, beats: 4 }, label: 'Hear the Andalusian cadence' },
      tip: '{c:Am} x02210, {c:G} 320003, {c:F} xx3211 (or the full barre 133211), {c:E} 022100.',
    },
    {
      type: 'order',
      prompt: 'Put the Andalusian cadence in {k:A minor} in order.',
      tiles: ['{c:Am}', '{c:G}', '{c:F}', '{c:E}'],
      explain: '{r:i}–{r:bVII}–{r:bVI}–{r:V}: {c:Am} {c:G} {c:F} {c:E}, each a step lower.',
      fact: 'minor-key-andalusian',
    },
    {
      type: 'card',
      title: 'The falling bass',
      body: 'Listen to the lowest notes: the bass walks down a step at a time from the tonic to the 5th, {n:A} {n:G} {n:F} {n:E}. With the full {c:F} barre (133211) you can see it on strings 5 and 6: open {n:A}, then {n:G} at fret 3, {n:F} at fret 1 and the open low {n:E}.',
      figure: {
        kind: 'fretboard',
        frets: [0, 4],
        dots: [
          { string: 5, fret: 0, note: 'A2', role: 'root' },
          { string: 6, fret: 3, note: 'G2', role: 'tone' },
          { string: 6, fret: 1, note: 'F2', role: 'tone' },
          { string: 6, fret: 0, note: 'E2', role: 'fifth' },
        ],
        caption: 'The bass line: {n:A} {n:G} {n:F} {n:E}.',
      },
    },
    {
      type: 'choice',
      prompt: 'What does the bass do in the Andalusian cadence?',
      options: [
        { text: 'Walks down a step at a time: {n:A} {n:G} {n:F} {n:E}', correct: true },
        { text: 'Climbs up: {n:A} {n:B} {n:C} {n:D}', why: 'It falls, from the tonic down to the 5th.' },
        { text: 'Stays on {n:A} throughout', why: 'Each chord has its own root: {n:A}, {n:G}, {n:F}, {n:E}.' },
      ],
      shuffle: false,
      explain: 'The roots of {c:Am} {c:G} {c:F} {c:E} fall a step at a time from the tonic {n:A} to the 5th, {n:E}.',
      fact: 'minor-key-andalusian-bass',
    },
    {
      type: 'listen-choice',
      prompt: 'A progression in {k:D minor}. Is this the Andalusian cadence?',
      sound: { kind: 'progression', chords: ['Dm', 'C', 'Bb', 'A'], tempo: 84, beats: 4 },
      options: [{ text: 'Yes: it walks down to a major {r:V}', correct: true }, { text: 'No: it is another loop' }],
      shuffle: false,
      explain: 'It was {c:Dm} {c:C} {c:Bb} {c:A}: {r:i}–{r:bVII}–{r:bVI}–{r:V} in {k:D minor}, the bass falling {n:D} {n:C} {n:Bb} {n:A}.',
    },
    {
      type: 'type-answer',
      prompt: 'Type the last chord of the Andalusian cadence in {k:D minor}.',
      answer: { kind: 'chord', value: 'A', spelling: 'exact' },
      input: 'keyboard',
      explain: 'The cadence ends on the major {r:V}. In {k:D minor} that is {c:A} ({n:A} {n:C#} {n:E}), with the raised 7th {n:C#}.',
      fact: 'minor-key-andalusian',
    },
    {
      type: 'true-false',
      statement: 'The Andalusian cadence ends on a minor {r:v} chord.',
      answer: false,
      explain: 'It ends on the major {r:V}: {c:E}, not {c:Em}, in {k:A minor}. Its {n:G#} is what pulls the loop back to {c:Am}.',
      fact: 'minor-key-andalusian',
    },
    {
      type: 'choice',
      prompt: 'Which music is the Andalusian cadence most at home in?',
      options: [
        { text: 'Flamenco', correct: true },
        { text: 'The 12-bar blues', why: 'The blues is built on {r:I}, {r:IV} and {r:V} dominant sevenths.' },
        { text: 'Hymns, as the "Amen"', why: 'The "Amen" is the plagal cadence, {r:IV} to {r:I}.' },
      ],
      shuffle: false,
      explain: 'It is central to flamenco, and it also turns up in many rock and pop songs.',
      fact: 'minor-key-andalusian-flamenco',
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the Andalusian cadence in {k:E minor}.',
      text: '{c:Em}  ___  {c:C}  {c:B}',
      blanks: ['{c:D}'],
      bank: ['{c:Dm}', '{c:D#dim}', '{c:A}'],
      explain: '{r:i}–{r:bVII}–{r:bVI}–{r:V} in {k:E minor}: {c:Em} {c:D} {c:C} {c:B}. {r:bVII} is {c:D}, built on {n:D}.',
      fact: 'minor-key-andalusian',
    },
  ],
  facts: [
    {
      id: 'minor-key-andalusian',
      front: 'What is the Andalusian cadence?',
      back: '{r:i}–{r:bVII}–{r:bVI}–{r:V}: in {k:A minor}, {c:Am} {c:G} {c:F} {c:E}.',
      ask: {
        type: 'order',
        prompt: 'Put the Andalusian cadence in {k:A minor} in order.',
        tiles: ['{c:Am}', '{c:G}', '{c:F}', '{c:E}'],
        explain: '{r:i}–{r:bVII}–{r:bVI}–{r:V}: {c:Am} {c:G} {c:F} {c:E}.',
      },
    },
    { id: 'minor-key-andalusian-bass', front: 'What does the bass of the Andalusian cadence do?', back: 'It walks down a step at a time from the tonic to the 5th: {n:A} {n:G} {n:F} {n:E}.' },
    { id: 'minor-key-andalusian-flamenco', front: 'Where does the Andalusian cadence come from, and where else is it heard?', back: 'It is central to flamenco and also turns up in many rock and pop songs.' },
  ],
};

const relativeKeysInSongs: Lesson = {
  id: 'relative-keys-in-songs',
  title: 'Moving between relative keys',
  teaches: 'Relative keys share their chords, so songs can move between major and relative minor with no new chords.',
  minutes: 3,
  skill: `theory:${U}:relative-keys-in-songs`,
  steps: [
    {
      type: 'card',
      title: 'Same chords, a new home',
      body: '{k:C major} and {k:A minor} are relative keys: the same notes, so the same seven chords. A song can rest on {c:Am} in the verse and on {c:C} in the chorus without a single new chord, and without a new key signature.',
      figure: { kind: 'circle', key: 'C major', highlight: ['A minor'], show: 'both', caption: '{k:C major} and its relative minor, {k:A minor}: no sharps or flats.' },
    },
    {
      type: 'true-false',
      statement: 'Moving to the relative minor needs a new key signature.',
      answer: false,
      explain: 'Relative keys share their key signature: {k:C major} and {k:A minor} both have no sharps or flats. Only the home chord changes.',
      fact: 'minor-key-relative-shared',
    },
    {
      type: 'card',
      title: 'A verse and a chorus',
      body: 'Our original chart: the verse loops {c:Am} {c:F} {c:C} {c:G} and rests on {c:Am}. The chorus loops {c:C} {c:G} {c:Am} {c:F} and rests on {c:C}. Before the verse comes back, an {c:E7} pulls the music home to {c:Am}.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['Am', 'F', 'C', 'G', 'C', 'G', 'Am', 'F', 'E7', 'Am'], tempo: 92, beats: 2 }, label: 'Hear verse, chorus, return' },
      tip: '{c:Am} x02210, {c:F} xx3211, {c:C} x32010, {c:G} 320003, {c:E7} 020100.',
    },
    {
      type: 'listen-choice',
      prompt: 'Does this section feel at home on {c:Am} or on {c:C}?',
      sound: { kind: 'progression', chords: ['C', 'G', 'Am', 'F', 'C'], tempo: 84, beats: 2 },
      options: [{ text: 'At home on {c:Am}' }, { text: 'At home on {c:C}', correct: true }],
      shuffle: false,
      explain: 'It was the chorus, {c:C} {c:G} {c:Am} {c:F}, starting and resting on {c:C}: there it is in {k:C major}.',
    },
    {
      type: 'choice',
      prompt: 'A verse rests on {c:Am}, the chorus on {c:C}. What changes between them?',
      options: [
        { text: 'The chord that feels like home', correct: true },
        { text: 'The key signature', why: '{k:C major} and {k:A minor} share their signature: no sharps or flats.' },
        { text: 'All the chords', why: 'Relative keys share all seven chords: none has to change.' },
      ],
      shuffle: false,
      explain: 'The verse feels at home on {c:Am} ({r:vi} of C) and the chorus on {c:C} ({r:I}), with the same chords and the same signature.',
      fact: 'minor-key-verse-chorus',
    },
    {
      type: 'card',
      title: 'The chord that pulls to minor',
      body: '{c:E7} is not one of the chords of {k:C major}: its {n:G#} is borrowed from {k:A minor} with its raised 7th. It is the major {r:V} of the relative minor, and nothing pulls more clearly toward {c:Am}.',
      figure: { kind: 'chord', symbol: 'E7', frets: '020100', caption: '{c:E7}: {n:G#} at string 3, fret 1 pulls up to {n:A}.' },
    },
    {
      type: 'choice',
      prompt: 'Which chord pulls a {k:C major} song toward {k:A minor}?',
      options: [
        { text: '{c:E7}', correct: true },
        { text: '{c:G7}', why: '{c:G7} is {r:V7} of {k:C major}: it pulls home to {c:C}.' },
        { text: '{c:Dm}', why: '{c:Dm} belongs to both keys and pulls neither way strongly.' },
        { text: '{c:F}', why: '{c:F} belongs to both keys: it moves away from home in either.' },
      ],
      explain: '{c:E7} ({n:E} {n:G#} {n:B} {n:D}) is the major {r:V} of {k:A minor}. Its {n:G#} rises to {n:A}.',
      fact: 'minor-key-relative-pull',
    },
    {
      type: 'fretboard-find',
      prompt: 'In the open {c:E7} chord, tap the note that {k:C major} does not have.',
      find: { note: 'G#3' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 3],
      shown: [
        { string: 6, fret: 0, note: 'E2' },
        { string: 5, fret: 2, note: 'B2' },
        { string: 4, fret: 0, note: 'D3' },
        { string: 2, fret: 0, note: 'B3' },
        { string: 1, fret: 0, note: 'E4' },
      ],
      explain: '{n:G#} at string 3, fret 1 (020100) is the leading tone of {k:A minor}. {k:C major} has a plain {n:G}.',
      fact: 'minor-key-relative-pull',
    },
    { generate: 'relative-key', params: { direction: 'both', maxAccidentals: 3 } },
    { generate: 'relative-key', params: { direction: 'minor', maxAccidentals: 3 } },
  ],
  facts: [
    {
      id: 'minor-key-relative-shared',
      front: 'Why can a song move between relative keys without any new chords?',
      back: 'Relative keys share all their diatonic chords, and their key signature.',
    },
    {
      id: 'minor-key-verse-chorus',
      front: 'How can a verse and a chorus feel at home in different keys with the same chords?',
      back: 'The verse rests on {r:vi} ({c:Am} in C) and the chorus on {r:I} ({c:C}): the home feeling changes, the key signature does not.',
    },
    {
      id: 'minor-key-relative-pull',
      front: 'Which chord most clearly pulls a major-key song toward its relative minor?',
      back: 'The major {r:V} of the relative minor: {c:E} or {c:E7} in {k:C major}.',
      ask: {
        type: 'choice',
        prompt: 'Which chord pulls a {k:G major} song toward {k:E minor}?',
        options: [
          { text: '{c:B7}', correct: true },
          { text: '{c:D7}', why: '{c:D7} is {r:V7} of {k:G major}: it pulls home to {c:G}.' },
          { text: '{c:Am}', why: '{c:Am} belongs to both keys.' },
        ],
        explain: '{c:B7} ({n:B} {n:D#} {n:F#} {n:A}) is the major {r:V} of {k:E minor}. Its {n:D#} rises to {n:E}.',
      },
    },
  ],
};

const minorKeyColours: Lesson = {
  id: 'minor-key-colours',
  title: 'The Picardy third and the major four',
  teaches: 'Two bright colours in minor: ending on a major tonic chord, and a major chord on 4 from melodic minor.',
  minutes: 3,
  skill: `theory:${U}:minor-key-colours`,
  steps: [
    {
      type: 'card',
      title: 'A major ending',
      body: 'A piece in {k:A minor} can end on {c:A} instead of {c:Am}: {c:Dm} {c:E} {c:A}. That bright, major last chord is a {t:picardy-third|Picardy third}. One note makes the difference: {c:A} has {n:C#} where {c:Am} has {n:C}.',
      figure: { kind: 'chord', symbol: 'A', frets: 'x02220', caption: '{c:A}: {n:C#} at string 2, fret 2. {c:Am} (x02210) has {n:C} at fret 1.' },
    },
    {
      type: 'listen-choice',
      prompt: 'A minor-key ending. Did it end on a minor or a major tonic chord?',
      sound: { kind: 'progression', chords: ['Dm', 'E', 'A'], tempo: 72, beats: 4 },
      options: [{ text: 'On a minor chord' }, { text: 'On a major chord', correct: true }],
      shuffle: false,
      explain: 'It ended {c:Dm} {c:E} {c:A}: a major {c:A} where the key leads you to expect {c:Am}. That is a Picardy third.',
    },
    {
      type: 'true-false',
      statement: 'A Picardy third is a major chord at the end of a minor-key piece.',
      answer: true,
      explain: 'The piece stays minor until the very last chord, which turns major: {c:A} to end in {k:A minor}.',
      fact: 'minor-key-picardy',
    },
    {
      type: 'card',
      title: 'A brighter four',
      body: 'In {k:A minor} the chord on degree 4 is {c:Dm}. Melodic minor raises the 6th note, {n:F}, to {n:F#}, which turns it into {c:D}: a major {r:IV}. Try {c:Am} {c:D} {c:Am} {c:D}: still minor, but brighter.',
      figure: { kind: 'chord', symbol: 'D', frets: 'xx0232', caption: '{c:D}: {n:F#} at string 1, fret 2. {c:Dm} (xx0231) has {n:F} at fret 1.' },
    },
    {
      type: 'choice',
      prompt: 'In {k:A minor}, which note makes the {r:IV} chord major?',
      options: [
        { text: '{n:F#}', correct: true },
        { text: '{n:C#}', why: '{n:C#} makes the tonic chord major: the Picardy third.' },
        { text: '{n:G#}', why: '{n:G#} is the raised 7th: it makes the {r:V} chord major.' },
        { text: '{n:Bb}', why: '{n:Bb} is not in {k:A minor} at all.' },
      ],
      explain: '{c:Dm} is {n:D} {n:F} {n:A}. Raise the {n:F} (the 6th note of {k:A minor}) to {n:F#}, as melodic minor does, and you get {c:D}.',
      fact: 'minor-key-raised-sixth',
    },
    {
      type: 'choice',
      prompt: 'What is the major {r:IV} chord in {k:A minor}?',
      options: [
        { text: '{c:D}', correct: true },
        { text: '{c:Dm}', why: '{c:Dm} is the natural-minor {r:iv}.' },
        { text: '{c:F}', why: '{c:F} is {r:bVI}.' },
        { text: '{c:E}', why: '{c:E} is the major {r:V}.' },
      ],
      explain: 'The chord on degree 4 is built on {n:D}. With the raised 6th, {n:F#}, it is {n:D} {n:F#} {n:A}: {c:D}.',
      fact: 'minor-key-major-four',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap the note on string 1 that turns {c:Dm} into {c:D}.',
      find: { note: 'F#4' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 4],
      strings: [1],
      explain: '{n:F#} at string 1, fret 2. In {c:Dm} that finger sits at fret 1, on {n:F}.',
      fact: 'minor-key-raised-sixth',
    },
    {
      type: 'choice',
      prompt: 'Which ending in {k:A minor} uses a Picardy third?',
      options: [
        { text: '{c:Dm} {c:E} {c:A}', correct: true },
        { text: '{c:Dm} {c:E} {c:Am}', why: 'Ending on {c:Am} is the plain minor ending.' },
        { text: '{c:F} {c:G} {c:Am}', why: 'This also ends on minor {c:Am}.' },
      ],
      shuffle: false,
      explain: 'The Picardy third is the major tonic chord at the end: {c:A}, with {n:C#}, instead of {c:Am}.',
      fact: 'minor-key-picardy',
    },
  ],
  facts: [
    { id: 'minor-key-picardy', front: 'What is a Picardy third?', back: 'Ending a minor-key piece on a major tonic chord: {c:A} to end in {k:A minor}.' },
    { id: 'minor-key-major-four', front: 'What does a major {r:IV} do in a minor key?', back: 'It gives a brighter minor sound: {c:D} in {k:A minor}.' },
    {
      id: 'minor-key-raised-sixth',
      front: 'Which note makes the {r:IV} chord major in a minor key?',
      back: 'The raised 6th of melodic minor ({n:F#} in {k:A minor}), in place of the natural minor\'s {n:F}.',
    },
  ],
};

/** Unit 24 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'Harmony in minor keys',
  theme: 'harmony',
  description: 'The chords of a minor key, the borrowed major V, common minor progressions, the Andalusian cadence and other minor-key colours.',
  lessons: [naturalMinorChords, theMajorV, minorProgressions, theAndalusianCadence, relativeKeysInSongs, minorKeyColours],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      {
        type: 'order',
        prompt: 'Put the qualities of the natural-minor triads in order, from degree 1 to 7.',
        tiles: ['Minor', 'Diminished', 'Major', 'Minor', 'Minor', 'Major', 'Major'],
        explain: 'Minor, diminished, major, minor, minor, major, major.',
      },
      {
        type: 'choice',
        prompt: 'In {k:E minor}, which chord is {r:bVII}?',
        options: [
          { text: '{c:D}', correct: true },
          { text: '{c:D#dim}', why: 'That is {r:vii°}, on the raised 7th.' },
          { text: '{c:C}', why: '{c:C} is {r:bVI}.' },
          { text: '{c:Bm}', why: '{c:Bm} is {r:v}.' },
        ],
        explain: '{n:D} is a flat 7th above {n:E}; the chord built on it is {c:D}: {r:bVII}.',
      },
      {
        type: 'true-false',
        statement: 'In natural minor, the chord on degree 5 is minor.',
        answer: true,
        explain: 'In natural minor it is {r:v}: {c:Em} in {k:A minor}. Raising the 7th makes it major.',
      },
      {
        type: 'choice',
        prompt: 'Many classical books write the chords on degrees 3, 6 and 7 of a minor key as {r:III}, {r:VI}, {r:VII}. How does this app write them?',
        options: [
          { text: '{r:bIII}, {r:bVI}, {r:bVII}', correct: true },
          { text: '{r:iii}, {r:vi}, {r:vii°}', why: 'Those are the minor and diminished chords of a major key.' },
          { text: '{r:III}, {r:VI}, {r:VII}', why: 'In this app those would sit a major 3rd, 6th and 7th above the tonic.' },
        ],
        shuffle: false,
        explain: 'This app measures every root against the major scale, so the 3rd, 6th and 7th of natural minor carry a flat.',
      },
      {
        type: 'choice',
        prompt: 'What is the major {r:V} chord in {k:E minor}?',
        options: [
          { text: '{c:B}', correct: true },
          { text: '{c:Bm}', why: '{c:Bm} is the natural-minor {r:v}, with a plain {n:D}.' },
          { text: '{c:D}', why: '{c:D} is {r:bVII}.' },
        ],
        explain: 'Raise the 7th, {n:D}, to {n:D#}: the chord on {n:B} becomes {n:B} {n:D#} {n:F#}, {c:B}.',
      },
      {
        type: 'choice',
        prompt: 'Which diminished chord does the raised 7th give in {k:D minor}?',
        options: [
          { text: '{c:C#dim}', correct: true },
          { text: '{c:Edim}', why: '{c:Edim} is {r:ii°}, from natural minor.' },
          { text: '{c:Bdim}', why: '{c:Bdim} is built on the 6th of melodic minor, not the 7th.' },
        ],
        explain: 'The raised 7th of {k:D minor} is {n:C#}; stacked thirds give {n:C#} {n:E} {n:G}: {c:C#dim}, {r:vii°}.',
      },
      {
        type: 'type-answer',
        prompt: 'Type the leading tone of {k:D minor}.',
        answer: { kind: 'note', value: 'C#', spelling: 'exact' },
        input: 'keypad',
        explain: 'The 7th note of {k:D minor}, {n:C}, raised a half step: {n:C#}.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Complete {r:i}–{r:bVII}–{r:bVI}–{r:bVII} in {k:E minor}.',
        text: '{c:Em}  ___  {c:C}  {c:D}',
        blanks: ['{c:D}'],
        bank: ['{c:Dm}', '{c:B}', '{c:A}'],
        explain: '{r:bVII} in {k:E minor} is {c:D} and {r:bVI} is {c:C}: {c:Em} {c:D} {c:C} {c:D}.',
      },
      {
        type: 'choice',
        prompt: 'Why does {c:G} to {c:Am} have no leading tone?',
        options: [
          { text: '{c:G} is built on the subtonic, a whole step below', correct: true },
          { text: '{c:G} is a diminished chord', why: '{c:G} is major.' },
          { text: '{c:Am} is not the tonic', why: '{c:Am} is the tonic chord of {k:A minor}.' },
        ],
        shuffle: false,
        explain: '{n:G} is a whole step below {n:A}. Only a raised {n:G#} would pull up by a half step.',
      },
      {
        type: 'match-pairs',
        prompt: 'Match each progression with its chords in {k:A minor}.',
        pairs: [
          { left: '{r:i}–{r:iv}–{r:v}', right: '{c:Am} {c:Dm} {c:Em}' },
          { left: '{r:i}–{r:bVI}–{r:bIII}–{r:bVII}', right: '{c:Am} {c:F} {c:C} {c:G}' },
          { left: '{r:i}–{r:bVII}–{r:bVI}–{r:V}', right: '{c:Am} {c:G} {c:F} {c:E}' },
        ],
        explain: 'The basic minor progression, the rock loop and the Andalusian cadence.',
      },
      {
        type: 'order',
        prompt: 'Put the Andalusian cadence in {k:D minor} in order.',
        tiles: ['{c:Dm}', '{c:C}', '{c:Bb}', '{c:A}'],
        explain: '{r:i}–{r:bVII}–{r:bVI}–{r:V} in {k:D minor}: {c:Dm} {c:C} {c:Bb} {c:A}.',
      },
      {
        type: 'choice',
        prompt: 'A verse rests on {c:Am} and the chorus on {c:C}. Does the key signature change?',
        options: [
          { text: 'No: relative keys share it', correct: true },
          { text: 'Yes: one sharp is added', why: 'No sharp is needed: the chords are the same.' },
        ],
        shuffle: false,
        explain: '{k:C major} and {k:A minor} share their key signature and all seven chords.',
      },
      {
        type: 'choice',
        prompt: 'Which chord pulls a {k:C major} song toward {k:A minor}?',
        options: [
          { text: '{c:E7}', correct: true },
          { text: '{c:G7}', why: '{c:G7} pulls home to {c:C}.' },
          { text: '{c:F}', why: '{c:F} belongs to both keys.' },
        ],
        explain: '{c:E7} is the major {r:V} of {k:A minor}: its {n:G#} rises to {n:A}.',
      },
      {
        type: 'true-false',
        statement: 'A Picardy third is a major tonic chord at the end of a minor-key piece.',
        answer: true,
        explain: 'For example {c:A} to end a piece in {k:A minor}.',
      },
      {
        type: 'choice',
        prompt: 'In {k:A minor}, what is the major {r:IV} chord, made with the raised 6th of melodic minor?',
        options: [
          { text: '{c:D}', correct: true },
          { text: '{c:Dm}', why: '{c:Dm} is the natural-minor {r:iv}.' },
          { text: '{c:F#dim}', why: 'That chord sits on the raised 6th itself.' },
        ],
        explain: 'With {n:F#} in place of {n:F}, the chord on {n:D} is {n:D} {n:F#} {n:A}: {c:D}.',
      },
      { generate: 'roman-chord', params: { modes: ['minor'], numerals: ['i', 'iv', 'v', 'bVII', 'bVI', 'bIII'], maxAccidentals: 2 } },
    ],
  },
};

export default unit;
