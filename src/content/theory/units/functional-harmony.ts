/**
 * Theory Path, unit 22: How chords work (function and cadence). Written from the syllabus entries in
 * `src/content/plan/theory-path.json` (unit `functional-harmony`), one lesson per entry, in order:
 * each lesson opens with its "on the guitar" picture, asks the planned exercises, ends with the
 * planned drill, and turns every planned fact into a review card.
 *
 * Every chord, numeral, function and cadence quoted here is cross-checked against the theory engine
 * in `functional-harmony.test.ts` (diatonic chords, `classifyCadence`, `progressionToChords`, chord
 * tones, the shapes on the neck and what each listening question plays).
 *
 * Listening is never the only place an idea is asked: with Sound off every lesson still asks each
 * idea as a choice, a match or a true-or-false question.
 */
import type { Lesson, Unit } from '@/lessons';

const U = 'functional-harmony';

const threeFunctions: Lesson = {
  id: 'three-functions',
  title: 'Home, away and tension',
  teaches: 'Each chord in a key does one of three jobs: tonic (home), subdominant (moving away) or dominant (tension).',
  minutes: 4,
  skill: `theory:${U}:three-functions`,
  steps: [
    {
      type: 'card',
      title: 'Three jobs',
      body: 'Every chord in a key has a job. The {t:tonic} chord is **home**. The {t:subdominant} chord **moves away**. The {t:dominant} chord builds **tension** that wants to go home. In {k:C major} the three main ones are {c:C}, {c:F} and {c:G}.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['C', 'F', 'G', 'C'], tempo: 72, beats: 4 }, label: 'Home, away, tension, home' },
      tip: 'Play it: {c:C} x32010, {c:F} xx3211, {c:G} 320003, then {c:C} again. Say "home, away, tension, home" as you change.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each chord of {k:C major} with its job.',
      pairs: [
        { left: '{c:C}', right: 'Tonic: home' },
        { left: '{c:F}', right: 'Subdominant: away' },
        { left: '{c:G}', right: 'Dominant: tension' },
      ],
      explain: '{c:C} is {r:I}, home. {c:F} is {r:IV}, which moves away. {c:G} is {r:V}, the tension that pulls back to {c:C}.',
      fact: 'functional-main-chords',
    },
    {
      type: 'card',
      title: 'Tension wants to go home',
      body: 'Stop on {c:G} and the music hangs in the air, waiting. Go on to {c:C} and it settles. Many progressions follow this cycle: tonic, subdominant, dominant, tonic. Because the subdominant usually comes just before the dominant, it is also called the {t:predominant}.',
      figure: { kind: 'chord', symbol: 'G', frets: '320003', caption: '{c:G}, the dominant chord ({r:V}) of {k:C major}.' },
    },
    {
      type: 'listen-choice',
      prompt: 'Listen to four chords in {k:C major}. Does the phrase end on the tonic or on the dominant?',
      sound: { kind: 'progression', chords: ['C', 'F', 'C', 'G'], tempo: 72, beats: 4 },
      options: [{ text: 'On the tonic: it sounds finished' }, { text: 'On the dominant: it hangs', correct: true }],
      shuffle: false,
      explain: 'It went {c:C} {c:F} {c:C} {c:G} and stopped on {c:G}, the dominant. It sounds unfinished because {c:G} wants to move on to {c:C}.',
    },
    {
      type: 'choice',
      prompt: 'Which job is tension that wants to resolve home?',
      options: [
        { text: 'Dominant', correct: true },
        { text: 'Subdominant', why: 'The subdominant moves away from home; it usually leads on to the dominant.' },
        { text: 'Tonic', why: 'The tonic is home itself: there is nowhere left to resolve to.' },
      ],
      shuffle: false,
      explain: 'The dominant chord ({c:G} in {k:C major}) is full of tension and pulls back to the tonic.',
      fact: 'functional-three-jobs',
    },
    {
      type: 'order',
      prompt: 'Put the jobs in the order many progressions follow, starting from home.',
      tiles: ['Tonic', 'Subdominant', 'Dominant', 'Tonic'],
      explain: 'Home, away, tension, home: tonic, subdominant, dominant, tonic. In {k:C major} that is {c:C} {c:F} {c:G} {c:C}.',
      fact: 'functional-cycle',
    },
    {
      type: 'true-false',
      statement: 'The subdominant is also called the predominant, because it usually comes just before the dominant.',
      answer: true,
      explain: '"Pre" means before: the predominant ({c:F} in {k:C major}) usually leads into the dominant ({c:G}).',
      fact: 'functional-predominant',
    },
    {
      type: 'card',
      title: 'Every degree has a name',
      body: 'Each note of the scale has a name too: 1 tonic, 2 supertonic, 3 mediant, 4 subdominant, 5 dominant, 6 submediant, 7 {t:leading-tone|leading tone}. The leading tone sits a half step below the tonic and leads up to it: {n:B} to {n:C}.',
      figure: {
        kind: 'fretboard',
        frets: [0, 3],
        root: 'C',
        labels: 'degree',
        dots: [
          { string: 5, fret: 3, note: 'C', degree: '1', role: 'root' },
          { string: 4, fret: 0, note: 'D', degree: '2' },
          { string: 4, fret: 2, note: 'E', degree: '3' },
          { string: 4, fret: 3, note: 'F', degree: '4' },
          { string: 3, fret: 0, note: 'G', degree: '5' },
          { string: 3, fret: 2, note: 'A', degree: '6' },
          { string: 2, fret: 0, note: 'B', degree: '7' },
          { string: 2, fret: 1, note: 'C', degree: '1', role: 'root' },
        ],
        caption: '{k:C major} in open position, labelled by degree.',
      },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each scale degree with its name.',
      pairs: [
        { left: 'Degree 1', right: 'Tonic' },
        { left: 'Degree 3', right: 'Mediant' },
        { left: 'Degree 4', right: 'Subdominant' },
        { left: 'Degree 5', right: 'Dominant' },
        { left: 'Degree 7', right: 'Leading tone' },
      ],
      explain: 'The seven names: 1 tonic, 2 supertonic, 3 mediant, 4 subdominant, 5 dominant, 6 submediant, 7 leading tone.',
      fact: 'functional-degree-names',
    },
    {
      type: 'choice',
      prompt: 'In {k:G major}, which chord is the main dominant chord?',
      options: [
        { text: '{c:D}', correct: true },
        { text: '{c:C}', why: '{c:C} is {r:IV} in {k:G major}: the subdominant.' },
        { text: '{c:G}', why: '{c:G} is {r:I}, the tonic: home.' },
        { text: '{c:Em}', why: '{c:Em} is {r:vi} in {k:G major}, a chord close to home.' },
      ],
      explain: 'The dominant is built on degree 5. In {k:G major} that is {n:D}, so {c:D} ({r:V}) is the dominant chord.',
      fact: 'functional-main-chords',
    },
    { generate: 'roman-chord', params: { direction: 'to-chord', numerals: ['I', 'V', 'IV'], maxAccidentals: 2 } },
    { generate: 'roman-chord', params: { direction: 'to-roman', numerals: ['I', 'V', 'IV'], maxAccidentals: 2 } },
  ],
  facts: [
    {
      id: 'functional-three-jobs',
      front: 'What three jobs do the chords of a key do?',
      back: 'Tonic (home), subdominant (moving away) and dominant (tension that wants to return home).',
      ask: {
        type: 'match-pairs',
        prompt: 'Match each job with what it does.',
        pairs: [
          { left: 'Tonic', right: 'Home' },
          { left: 'Subdominant', right: 'Moving away' },
          { left: 'Dominant', right: 'Tension' },
        ],
        explain: 'The tonic is home, the subdominant moves away, and the dominant is the tension that wants to return home.',
      },
    },
    {
      id: 'functional-main-chords',
      front: 'In a major key, which chords are the main tonic, subdominant and dominant chords?',
      back: '{r:I} is the main tonic chord, {r:IV} the main subdominant chord and {r:V} the main dominant chord.',
      ask: {
        type: 'match-pairs',
        prompt: 'Match each numeral with its job in a major key.',
        pairs: [
          { left: '{r:I}', right: 'Tonic' },
          { left: '{r:IV}', right: 'Subdominant' },
          { left: '{r:V}', right: 'Dominant' },
        ],
        explain: '{r:I} is home, {r:IV} moves away and {r:V} is the tension that pulls back to {r:I}.',
      },
    },
    {
      id: 'functional-cycle',
      front: 'Which cycle of jobs do many progressions follow?',
      back: 'Tonic, subdominant, dominant, tonic: home, away, tension, home.',
      ask: {
        type: 'order',
        prompt: 'Put the jobs in the order many progressions follow, starting from home.',
        tiles: ['Tonic', 'Subdominant', 'Dominant', 'Tonic'],
        explain: 'Home, away, tension, home: tonic, subdominant, dominant, tonic.',
      },
    },
    { id: 'functional-predominant', front: 'What is another name for the subdominant function, and why?', back: 'The predominant: it usually comes just before the dominant.' },
    {
      id: 'functional-degree-names',
      front: 'Name the seven scale degrees, from 1 to 7.',
      back: '1 tonic, 2 supertonic, 3 mediant, 4 subdominant, 5 dominant, 6 submediant, 7 leading tone.',
      ask: {
        type: 'match-pairs',
        prompt: 'Match each scale degree with its name.',
        pairs: [
          { left: 'Degree 2', right: 'Supertonic' },
          { left: 'Degree 3', right: 'Mediant' },
          { left: 'Degree 6', right: 'Submediant' },
          { left: 'Degree 7', right: 'Leading tone' },
        ],
        explain: '1 tonic, 2 supertonic, 3 mediant, 4 subdominant, 5 dominant, 6 submediant, 7 leading tone.',
      },
    },
  ],
};

const substituteChords: Lesson = {
  id: 'substitute-chords',
  title: 'Chords that do the same job',
  teaches: 'The chords on degrees 6 and 3 can stand in for the tonic, 2 for the subdominant and 7 for the dominant.',
  minutes: 3,
  skill: `theory:${U}:substitute-chords`,
  steps: [
    {
      type: 'card',
      title: 'Shared notes, shared job',
      body: '{c:F} is {n:F} {n:A} {n:C}. {c:Dm} is {n:D} {n:F} {n:A}. They share two notes, {n:F} and {n:A}, so {c:Dm} can do the job of {c:F}: it moves away from home. Chords that share two notes can often replace each other.',
      figure: { kind: 'chord', symbol: 'Dm', frets: 'xx0231', caption: '{c:Dm}: {n:D} {n:F} {n:A}, the {r:ii} chord of {k:C major}.' },
      tip: 'Play {c:Dm}, then {c:F} (xx3211). String 3, fret 2 ({n:A}) and string 1, fret 1 ({n:F}) are in both chords.',
    },
    {
      type: 'choice',
      prompt: 'Which chord can replace {r:IV} as a subdominant chord?',
      options: [
        { text: '{r:ii}', correct: true },
        { text: '{r:V}', why: '{r:V} is the dominant: tension, not moving away.' },
        { text: '{r:I}', why: '{r:I} is home itself, the tonic.' },
        { text: '{r:iii}', why: '{r:iii} shares two notes with {r:I}: it is a weak tonic stand-in.' },
      ],
      explain: '{r:ii} ({c:Dm} in {k:C major}) shares two notes with {r:IV} ({c:F}), so it does the same job: it moves away from home.',
      fact: 'functional-substitutes',
    },
    {
      type: 'card',
      title: 'Three groups',
      body: 'In {k:C major} the chords fall into three groups. Tonic: {c:C}, with {c:Am} and, more weakly, {c:Em}. Subdominant: {c:F} and {c:Dm}. Dominant: {c:G} and {c:Bdim}. Each stand-in shares two notes with the main chord of its group.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['F', 'G', 'C', 'Dm', 'G', 'C'], tempo: 72, beats: 2 }, label: '{c:F} {c:G} {c:C}, then {c:Dm} {c:G} {c:C}' },
    },
    {
      type: 'listen-choice',
      prompt: 'Listen. Did you hear {r:IV}–{r:V}–{r:I} or {r:ii}–{r:V}–{r:I}?',
      sound: { kind: 'progression', chords: ['Dm', 'G', 'C'], tempo: 72, beats: 4 },
      options: [{ text: '{r:IV}–{r:V}–{r:I}' }, { text: '{r:ii}–{r:V}–{r:I}', correct: true }],
      shuffle: false,
      explain: 'It started on {c:Dm}, a minor chord: {r:ii}. {r:IV} would have been {c:F}, a major chord. Both lead to {c:G} and home to {c:C} in the same way.',
    },
    {
      type: 'true-false',
      statement: '{r:vi} is a tonic-function chord.',
      answer: true,
      explain: '{r:vi} ({c:Am} in {k:C major}: {n:A} {n:C} {n:E}) shares {n:C} and {n:E} with {r:I} ({c:C}), so it can stand in for home.',
      fact: 'functional-substitutes',
    },
    {
      type: 'match-pairs',
      prompt: 'In {k:C major}, match each stand-in chord with its job.',
      pairs: [
        { left: '{c:Am}', right: 'Tonic' },
        { left: '{c:Dm}', right: 'Subdominant' },
        { left: '{c:Bdim}', right: 'Dominant' },
      ],
      explain: '{c:Am} shares {n:C} and {n:E} with {c:C}; {c:Dm} shares {n:F} and {n:A} with {c:F}; {c:Bdim} ({n:B} {n:D} {n:F}) shares {n:B} and {n:D} with {c:G}.',
      fact: 'functional-substitutes',
    },
    {
      type: 'choice',
      prompt: 'Which two notes do {c:Am} and {c:C} share?',
      options: [
        { text: '{n:C} and {n:E}', correct: true },
        { text: '{n:A} and {n:C}', why: '{n:A} is not in {c:C}, which is {n:C} {n:E} {n:G}.' },
        { text: '{n:E} and {n:G}', why: '{n:G} is not in {c:Am}, which is {n:A} {n:C} {n:E}.' },
        { text: '{n:G} and {n:A}', why: 'Neither chord has both: {c:C} has {n:G}, {c:Am} has {n:A}.' },
      ],
      explain: '{c:Am} is {n:A} {n:C} {n:E} and {c:C} is {n:C} {n:E} {n:G}: they share {n:C} and {n:E}. That is why {c:Am} can stand in for {c:C}.',
      fact: 'functional-shared-notes',
    },
    {
      type: 'choice',
      prompt: '{r:ii}–{r:V}–{r:I} and {r:IV}–{r:V}–{r:I} do the same job. Why?',
      options: [
        { text: '{r:ii} and {r:IV} share two notes', correct: true },
        { text: 'Both start on the tonic', why: 'Neither does: they start on {r:ii} or {r:IV}, away from home.' },
        { text: 'Both use a diminished chord', why: 'In a major key {r:ii}, {r:IV}, {r:V} and {r:I} are minor or major, never diminished.' },
      ],
      shuffle: false,
      explain: '{c:Dm} and {c:F} share {n:F} and {n:A}: both are subdominant chords, so both lead to {c:G} and then home to {c:C}.',
      fact: 'functional-two-five-one-job',
    },
    { generate: 'diatonic-chord', params: { ask: 'chord', modes: ['major'], maxAccidentals: 2 } },
    { generate: 'diatonic-chord', params: { ask: 'quality', modes: ['major'], maxAccidentals: 2 } },
  ],
  facts: [
    {
      id: 'functional-substitutes',
      front: 'In a major key, which chords can stand in for {r:I}, {r:IV} and {r:V}?',
      back: '{r:vi} (and, more weakly, {r:iii}) can stand in for the tonic; {r:ii} acts as a subdominant chord; {r:vii°} acts as a dominant chord.',
      ask: {
        type: 'match-pairs',
        prompt: 'In a major key, match each stand-in chord with its job.',
        pairs: [
          { left: '{r:vi}', right: 'Tonic' },
          { left: '{r:ii}', right: 'Subdominant' },
          { left: '{r:vii°}', right: 'Dominant' },
        ],
        explain: '{r:vi} shares two notes with {r:I}, {r:ii} with {r:IV}, and {r:vii°} with {r:V}.',
      },
    },
    {
      id: 'functional-shared-notes',
      front: 'Why can {c:Dm} often replace {c:F}?',
      back: 'Chords that share two notes can often replace each other: {c:Dm} ({n:D} {n:F} {n:A}) shares {n:F} and {n:A} with {c:F} ({n:F} {n:A} {n:C}).',
    },
    {
      id: 'functional-two-five-one-job',
      front: 'Why do {r:ii}–{r:V}–{r:I} and {r:IV}–{r:V}–{r:I} do the same job?',
      back: '{r:ii} and {r:IV} share two notes, so both are subdominant chords leading to {r:V} and home.',
    },
  ],
};

const whyVPullsHome: Lesson = {
  id: 'why-v-pulls-home',
  title: 'Why V pulls home',
  teaches: 'The dominant seventh holds the key\'s 7th and 4th notes: a tritone that resolves by half steps onto the tonic.',
  minutes: 4,
  skill: `theory:${U}:why-v-pulls-home`,
  steps: [
    {
      type: 'card',
      title: 'Two notes that want to move',
      body: '{c:G7} is the {r:V7} chord of {k:C major}: {n:G} {n:B} {n:D} {n:F}. Two of its notes sit a half step from a note of {c:C}. {n:B}, the {t:leading-tone|leading tone}, wants to rise to {n:C}. {n:F}, degree 4, wants to fall to {n:E}.',
      figure: { kind: 'chord', symbol: 'G7', frets: '320001', caption: '{c:G7}: the open {n:B} on string 2 and {n:F} at string 1, fret 1.' },
    },
    {
      type: 'choice',
      prompt: 'Which note of {c:G7} resolves up a half step to {n:C}?',
      options: [
        { text: '{n:B}', correct: true },
        { text: '{n:F}', why: '{n:F} goes the other way: it falls a half step to {n:E}.' },
        { text: '{n:D}', why: '{n:D} is a whole step from {n:C}, not a half step.' },
        { text: '{n:G}', why: '{n:G} is in both chords, so it simply stays.' },
      ],
      explain: '{n:B} is the leading tone of {k:C major}: one half step below {n:C}, so it pulls up to it.',
      fact: 'functional-leading-tone',
    },
    {
      type: 'card',
      title: 'See it on the neck',
      body: 'Play {c:G7} (320001), then {c:C} (x32010), and watch the top two strings. On string 2 the open {n:B} rises to {n:C} at fret 1. On string 1, {n:F} at fret 1 falls to the open {n:E}. Each moves just one fret: a half step.',
      figure: {
        kind: 'fretboard',
        frets: [0, 3],
        dots: [
          { string: 2, fret: 0, note: 'B', role: 'tone' },
          { string: 2, fret: 1, note: 'C', role: 'root' },
          { string: 1, fret: 1, note: 'F', role: 'tone' },
          { string: 1, fret: 0, note: 'E', role: 'third' },
        ],
        caption: '{c:G7} to {c:C}: {n:B} up to {n:C}, {n:F} down to {n:E}.',
      },
      tip: 'Play the change slowly and listen to the top two strings: you can hear both notes slide into place.',
    },
    {
      type: 'true-false',
      statement: 'When {c:G7} moves to {c:C}, its {n:F} falls a half step to {n:E}.',
      answer: true,
      explain: '{n:F} is degree 4 of {k:C major}. It sits a half step above {n:E}, the third of {c:C}, and falls onto it.',
      fact: 'functional-fourth-falls',
    },
    {
      type: 'card',
      title: 'A tritone inside',
      body: '{n:B} and {n:F} are a {t:tritone} apart: six half steps, the most restless interval in the key. In {c:G7} they are the 3rd and the 7th. When both move a half step, {n:B} up and {n:F} down, the tension dissolves into {c:C}. That is why {r:V7}–{r:I} sounds so strong.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['G7', 'C'], tempo: 60, beats: 4 }, label: 'Hear {c:G7} resolve to {c:C}' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the sentence.',
      text: 'In {c:G7} the tritone is {n:B} and ___.',
      blanks: ['{n:F}'],
      bank: ['{n:D}', '{n:G}', '{n:E}'],
      explain: '{c:G7} is {n:G} {n:B} {n:D} {n:F}. Its 3rd, {n:B}, and its 7th, {n:F}, are six half steps apart: a tritone.',
      fact: 'functional-dominant-tritone',
    },
    {
      type: 'listen-choice',
      prompt: 'Listen. Did the last chord resolve home, or stop on the tension?',
      sound: { kind: 'progression', chords: ['C', 'F', 'G7'], tempo: 72, beats: 4 },
      options: [{ text: 'It resolved home' }, { text: 'It stopped on the tension', correct: true }],
      shuffle: false,
      explain: 'It ended on {c:G7}, the dominant seventh. Its {n:B} and {n:F} are left hanging, so the music asks to go on to {c:C}.',
    },
    {
      type: 'choice',
      prompt: 'In {k:G major} the {r:V7} chord is {c:D7}: {n:D} {n:F#} {n:A} {n:C}. Which of its notes rises a half step to {n:G}?',
      options: [
        { text: '{n:F#}', correct: true },
        { text: '{n:C}', why: '{n:C} is degree 4 of {k:G major}: it falls a half step to {n:B}.' },
        { text: '{n:A}', why: '{n:A} is a whole step above {n:G}.' },
        { text: '{n:D}', why: '{n:D} is also in {c:G}, so it can simply stay.' },
      ],
      explain: '{n:F#} is the leading tone of {k:G major}, a half step below {n:G}. Together with {n:C} it forms the tritone of {c:D7}.',
      fact: 'functional-leading-tone',
    },
    {
      type: 'choice',
      prompt: 'Why does {c:G7} pull home even more strongly than {c:G}?',
      options: [
        { text: 'Its {n:F} forms a tritone with {n:B}', correct: true },
        { text: 'It has no leading tone', why: 'Both {c:G} and {c:G7} contain {n:B}, the leading tone.' },
        { text: 'It is a minor chord', why: '{c:G7} is a dominant seventh: a major triad with a minor 7th on top.' },
      ],
      shuffle: false,
      explain: '{c:G} already has the leading tone {n:B}. {c:G7} adds {n:F}, which falls to {n:E}, and the {n:B}–{n:F} tritone wants to resolve.',
      fact: 'functional-dominant-tritone',
    },
    { generate: 'chord-tones', params: { types: ['7'], roots: ['G', 'D', 'A', 'E', 'C'], ask: 'tone' } },
    { generate: 'chord-tones', params: { types: ['7'], roots: ['G', 'D', 'A', 'E', 'C'], ask: 'notes' } },
  ],
  facts: [
    {
      id: 'functional-leading-tone',
      front: 'Which note of the {r:V} chord pulls up to the tonic?',
      back: 'The leading tone (degree 7), a half step below the tonic: {n:B} to {n:C} in {k:C major}.',
    },
    {
      id: 'functional-fourth-falls',
      front: 'Which note does {r:V7} add, and where does it go?',
      back: 'Degree 4 ({n:F} in {c:G7}), which falls a half step to degree 3 ({n:E}).',
    },
    {
      id: 'functional-dominant-tritone',
      front: 'Which tritone sits inside {r:V7}, and why does it matter?',
      back: 'Its 3rd and 7th ({n:B} and {n:F} in {c:G7}). Both resolve by half steps, which is what makes {r:V7}–{r:I} so strong.',
      ask: {
        type: 'fill-blanks',
        prompt: 'Complete the sentence.',
        text: 'In {c:D7} the tritone is {n:F#} and ___.',
        blanks: ['{n:C}'],
        bank: ['{n:D}', '{n:A}', '{n:G}'],
        explain: '{c:D7} is {n:D} {n:F#} {n:A} {n:C}. Its 3rd, {n:F#}, and its 7th, {n:C}, are six half steps apart: a tritone.',
      },
    },
  ],
};

const cadences: Lesson = {
  id: 'cadences',
  title: 'Cadences: how phrases end',
  teaches: 'A cadence is the chord move that ends a phrase; authentic, plagal, half and deceptive cover most music.',
  minutes: 4,
  skill: `theory:${U}:cadences`,
  steps: [
    {
      type: 'card',
      title: 'How phrases end',
      body: 'Music comes in phrases, like sentences. The chord move that ends a phrase is a {t:cadence}. Some cadences sound like a full stop, others like a comma. Four kinds cover most music: authentic, plagal, half and deceptive.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['G', 'C', 'D7', 'G'], tempo: 76, beats: 4 }, label: 'Hear a phrase end' },
    },
    {
      type: 'choice',
      prompt: 'What is a cadence?',
      options: [
        { text: 'The chord move that ends a phrase', correct: true },
        { text: 'The first chord of a song', why: 'A cadence is about endings: the last two chords of a phrase.' },
        { text: 'A fast strumming pattern', why: 'Strumming is rhythm; a cadence is a move between chords.' },
      ],
      shuffle: false,
      explain: 'A cadence is the chord movement that ends a phrase, like punctuation at the end of a sentence.',
      fact: 'functional-cadence-meaning',
    },
    {
      type: 'card',
      title: 'Full stops: authentic and plagal',
      body: '{r:V} to {r:I} is an **authentic** cadence. In {k:G major}: {c:D7} to {c:G}. It sounds the most final of all. {r:IV} to {r:I} is a **plagal** cadence: {c:C} to {c:G}. It also ends home, but more gently.',
      figure: { kind: 'chord', symbol: 'D7', frets: 'xx0212', caption: '{c:D7}, {r:V7} in {k:G major}, resolves to {c:G} (320003).' },
    },
    {
      type: 'choice',
      prompt: 'In {k:G major}, {c:C} to {c:G} is which cadence?',
      options: [
        { text: 'Authentic', why: 'Authentic is {r:V} to {r:I}: {c:D} or {c:D7} to {c:G} in this key.' },
        { text: 'Plagal', correct: true },
        { text: 'Half', why: 'A half cadence stops on {r:V}, {c:D} here; this one ends home on {c:G}.' },
        { text: 'Deceptive', why: 'Deceptive is {r:V} to {r:vi}: {c:D} to {c:Em} in this key.' },
      ],
      shuffle: false,
      explain: '{c:C} is {r:IV} and {c:G} is {r:I}: {r:IV} to {r:I} is a plagal cadence.',
      fact: 'functional-authentic-plagal',
    },
    {
      type: 'card',
      title: 'A comma and a surprise',
      body: 'A phrase that stops on {r:V} ends with a **half** cadence: {c:Am} to {c:D} in {k:G major}. It sounds like a comma. {r:V} to {r:vi} is a **deceptive** cadence: {c:D} to {c:Em}. The ear expects {c:G} and gets a surprise.',
      figure: { kind: 'chord', symbol: 'Em', frets: '022000', caption: '{c:Em}, {r:vi} in {k:G major}: the surprise after {c:D}.' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each chord move with its cadence.',
      pairs: [
        { left: '{r:V} to {r:I}', right: 'Authentic' },
        { left: '{r:IV} to {r:I}', right: 'Plagal' },
        { left: 'Ends on {r:V}', right: 'Half' },
        { left: '{r:V} to {r:vi}', right: 'Deceptive' },
      ],
      explain: 'Authentic and plagal end home on {r:I}. A half cadence stops on {r:V}. A deceptive cadence goes from {r:V} to {r:vi} instead of {r:I}.',
      fact: 'functional-half-deceptive',
    },
    {
      type: 'listen-choice',
      prompt: 'Listen to this phrase in {k:G major}. Which cadence ends it?',
      sound: { kind: 'progression', chords: ['G', 'Em', 'Am', 'D'], tempo: 76, beats: 4 },
      options: [{ text: 'Authentic' }, { text: 'Plagal' }, { text: 'Half', correct: true }, { text: 'Deceptive' }],
      shuffle: false,
      explain: 'It went {c:G} {c:Em} {c:Am} {c:D} and stopped on {c:D}, the {r:V} chord: a half cadence. It sounds like a comma, waiting for more.',
    },
    {
      type: 'choice',
      prompt: 'In {k:C major}, {c:G} to {c:Am} is which cadence?',
      options: [
        { text: 'Authentic', why: 'Authentic would be {c:G} to {c:C}, {r:V} to {r:I}.' },
        { text: 'Plagal', why: 'Plagal would be {c:F} to {c:C}, {r:IV} to {r:I}.' },
        { text: 'Half', why: 'A half cadence stops on {c:G}; this one moves on to {c:Am}.' },
        { text: 'Deceptive', correct: true },
      ],
      shuffle: false,
      explain: '{c:G} is {r:V} and {c:Am} is {r:vi}. The ear expects {c:C} and gets {c:Am}: a deceptive cadence.',
      fact: 'functional-half-deceptive',
    },
    {
      type: 'true-false',
      statement: 'A half cadence sounds like a full stop.',
      answer: false,
      explain: 'A half cadence ends on {r:V}, so it sounds like a comma. The authentic cadence, {r:V} to {r:I}, is the full stop.',
      fact: 'functional-cadence-finality',
    },
    { generate: 'cadence-ear', params: { types: ['authentic', 'half', 'plagal', 'deceptive'] } },
  ],
  facts: [
    { id: 'functional-cadence-meaning', front: 'What is a cadence?', back: 'The chord movement that ends a phrase.' },
    {
      id: 'functional-authentic-plagal',
      front: 'Which chords make an authentic cadence, and which a plagal one?',
      back: 'Authentic: {r:V} (or {r:V7}) to {r:I}. Plagal: {r:IV} to {r:I}.',
    },
    {
      id: 'functional-half-deceptive',
      front: 'What are a half cadence and a deceptive cadence?',
      back: 'Half: a phrase that ends on {r:V}. Deceptive: {r:V} to {r:vi}.',
      ask: {
        type: 'match-pairs',
        prompt: 'Match each chord move with its cadence.',
        pairs: [
          { left: '{r:V} to {r:I}', right: 'Authentic' },
          { left: '{r:IV} to {r:I}', right: 'Plagal' },
          { left: 'Ends on {r:V}', right: 'Half' },
          { left: '{r:V} to {r:vi}', right: 'Deceptive' },
        ],
        explain: 'Authentic and plagal end home on {r:I}; a half cadence stops on {r:V}; a deceptive one goes from {r:V} to {r:vi}.',
      },
    },
    {
      id: 'functional-cadence-finality',
      front: 'Which cadence sounds the most final, and what does a half cadence sound like?',
      back: 'The authentic cadence sounds the most final; a half cadence sounds like a comma, not a full stop.',
    },
  ],
};

const hearingCadences: Lesson = {
  id: 'hearing-cadences',
  title: 'Hearing cadences',
  teaches: 'Each cadence has its own feel: to name one, ask whether it ended home, and how it got there.',
  minutes: 3,
  skill: `theory:${U}:hearing-cadences`,
  steps: [
    {
      type: 'card',
      title: 'Two questions',
      body: 'To name a cadence by ear, ask two questions. Did it end home, on {r:I}? Then it is authentic (from {r:V}) or plagal (from {r:IV}). Did it not? Then it stopped on {r:V} (half) or went from {r:V} to {r:vi} (deceptive).',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['C', 'F', 'G7', 'C'], tempo: 76, beats: 4 }, label: 'An authentic ending' },
    },
    {
      type: 'listen-choice',
      prompt: 'A phrase in {k:D major}. Authentic or half cadence?',
      sound: { kind: 'progression', chords: ['D', 'Bm', 'G', 'A'], tempo: 76, beats: 4 },
      options: [{ text: 'Authentic: it ends home' }, { text: 'Half: it stops on {r:V}', correct: true }],
      shuffle: false,
      explain: 'It stopped on {c:A}, the {r:V} chord of {k:D major}: a half cadence. It sounds unfinished, as if it waits for the next phrase.',
    },
    {
      type: 'choice',
      prompt: 'A phrase ends on {r:V}. How does it sound?',
      options: [
        { text: 'Unfinished: it waits for more', correct: true },
        { text: 'Final, like a full stop', why: 'Only a cadence that lands on {r:I} sounds final.' },
        { text: 'Like a wrong turn', why: 'That is the deceptive cadence, {r:V} to {r:vi}.' },
      ],
      shuffle: false,
      explain: 'Ending on {r:V} leaves the tension unresolved: a half cadence sounds like a comma that waits for the next phrase.',
      fact: 'functional-half-unfinished',
    },
    {
      type: 'card',
      title: 'The surprise',
      body: 'In a deceptive cadence the ear expects {r:I} after {r:V} and hears {r:vi} instead: {c:G7} to {c:Am} in {k:C major}, not {c:G7} to {c:C}. {c:Am} shares two notes with {c:C}, {n:C} and {n:E}, so it sounds close to home, but not quite.',
      figure: { kind: 'chord', symbol: 'Am', frets: 'x02210', caption: '{c:Am}: {n:A} {n:C} {n:E}, two notes shared with {c:C}.' },
    },
    {
      type: 'listen-choice',
      prompt: 'A phrase in {k:C major}. Authentic or deceptive cadence?',
      sound: { kind: 'progression', chords: ['C', 'F', 'G7', 'Am'], tempo: 76, beats: 4 },
      options: [{ text: 'Authentic: {r:V} to {r:I}' }, { text: 'Deceptive: {r:V} to {r:vi}', correct: true }],
      shuffle: false,
      explain: 'The phrase went {c:G7} to {c:Am}: {r:V} to {r:vi}. It promised home and swerved.',
    },
    {
      type: 'true-false',
      statement: 'A deceptive cadence surprises because the ear expects {r:I} after {r:V}.',
      answer: true,
      explain: 'After {r:V} the ear expects home. {r:vi} shares two of {r:I}\'s notes, so it sounds nearly right, which is exactly the surprise.',
      fact: 'functional-deceptive-surprise',
    },
    {
      type: 'card',
      title: 'Amen',
      body: 'The plagal cadence, {r:IV} to {r:I}, is the "Amen" sung at the end of many hymns. It lands home softly, without the pull of a leading tone. In {k:G major} it is {c:C} to {c:G}. Play it next: {c:C} (x32010), then {c:G} (320003).',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['G', 'D', 'C', 'G'], tempo: 76, beats: 4 }, label: 'Hear the Amen ending' },
    },
    {
      type: 'play-chord',
      prompt: 'A plagal cadence in {k:G major}: first strum {c:C}, the {r:IV} chord.',
      chord: 'C',
      frets: 'x32010',
      explain: '{c:C} is {r:IV} in {k:G major}: {n:C} {n:E} {n:G}. Leave string 6 silent.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'C',
        frets: 'x32010',
        accept: 'any-voicing',
        prompt: 'Build {c:C}, the {r:IV} chord of {k:G major}.',
        explain: '{c:C} is {n:C} {n:E} {n:G}: string 5 fret 3, string 4 fret 2, string 2 fret 1, with strings 3 and 1 open.',
      },
    },
    {
      type: 'play-chord',
      prompt: 'Now land home: strum {c:G}, the {r:I} chord.',
      chord: 'G',
      frets: '320003',
      explain: '{c:C} to {c:G} is {r:IV} to {r:I}: the "Amen" ending. All six strings ring in {c:G}.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'G',
        frets: '320003',
        accept: 'any-voicing',
        prompt: 'Build {c:G}, the {r:I} chord that ends the plagal cadence.',
        explain: '{c:G} is {n:G} {n:B} {n:D}: string 6 fret 3, string 5 fret 2, string 1 fret 3, the rest open.',
      },
    },
    {
      type: 'choice',
      prompt: 'Which cadence is the "Amen" at the end of many hymns?',
      options: [
        { text: 'Plagal: {r:IV} to {r:I}', correct: true },
        { text: 'Authentic: {r:V} to {r:I}', why: 'Authentic is the strongest full stop, but the "Amen" uses {r:IV}, not {r:V}.' },
        { text: 'Deceptive: {r:V} to {r:vi}', why: 'Deceptive does not end home at all.' },
      ],
      shuffle: false,
      explain: 'The "Amen" is {r:IV} to {r:I}, a plagal cadence: in {k:G major}, {c:C} to {c:G}.',
      fact: 'functional-plagal-amen',
    },
    { generate: 'cadence-ear', params: { types: ['authentic', 'half', 'deceptive', 'plagal'] } },
  ],
  facts: [
    {
      id: 'functional-deceptive-surprise',
      front: 'Why does a deceptive cadence sound like a surprise?',
      back: 'The ear expects {r:I} after {r:V} and hears {r:vi}, which shares two of {r:I}\'s notes.',
    },
    {
      id: 'functional-plagal-amen',
      front: 'Which cadence is the "Amen" ending of many hymns?',
      back: 'The plagal cadence, {r:IV} to {r:I}.',
    },
    {
      id: 'functional-half-unfinished',
      front: 'How does a phrase ending on {r:V} sound?',
      back: 'Unfinished: it waits for the next phrase.',
    },
  ],
};

const commonProgressions: Lesson = {
  id: 'common-progressions',
  title: 'The progressions everyone uses',
  teaches: 'A handful of progressions built from the three jobs turn up again and again, in every key.',
  minutes: 4,
  skill: `theory:${U}:common-progressions`,
  steps: [
    {
      type: 'card',
      title: 'Four you will meet everywhere',
      body: 'Built from home, away and tension, a few progressions turn up in every key: {r:I}–{r:IV}–{r:V}–{r:I}, {r:I}–{r:vi}–{r:IV}–{r:V}, {r:ii}–{r:V}–{r:I} and {r:I}–{r:V}–{r:vi}–{r:IV}. Learn them in {k:G major} with {c:G}, {c:Em}, {c:C}, {c:D} and {c:Am}.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['G', 'Em', 'C', 'D'], tempo: 80, beats: 4 }, label: 'Hear {r:I}–{r:vi}–{r:IV}–{r:V} in G' },
      tip: 'The shapes: {c:G} 320003, {c:Em} 022000, {c:C} x32010, {c:D} xx0232, {c:Am} x02210.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each progression with its chords in {k:G major}.',
      pairs: [
        { left: '{r:I}–{r:IV}–{r:V}–{r:I}', right: '{c:G} {c:C} {c:D} {c:G}' },
        { left: '{r:I}–{r:vi}–{r:IV}–{r:V}', right: '{c:G} {c:Em} {c:C} {c:D}' },
        { left: '{r:ii}–{r:V}–{r:I}', right: '{c:Am} {c:D} {c:G}' },
      ],
      explain: 'In {k:G major}: {r:I} {c:G}, {r:ii} {c:Am}, {r:IV} {c:C}, {r:V} {c:D}, {r:vi} {c:Em}.',
    },
    {
      type: 'listen-choice',
      prompt: 'Which progression do you hear: {r:I}–{r:vi}–{r:IV}–{r:V} or {r:I}–{r:IV}–{r:V}–{r:I}?',
      sound: { kind: 'progression', chords: ['G', 'C', 'D', 'G'], tempo: 80, beats: 4 },
      options: [{ text: '{r:I}–{r:vi}–{r:IV}–{r:V}' }, { text: '{r:I}–{r:IV}–{r:V}–{r:I}', correct: true }],
      shuffle: false,
      explain: 'It went {c:G} {c:C} {c:D} {c:G}: tonic, subdominant, dominant, tonic. The other would have gone to {c:Em}, a minor chord, second.',
    },
    {
      type: 'choice',
      prompt: 'Which jobs does {r:I}–{r:IV}–{r:V}–{r:I} move through?',
      options: [
        { text: 'Tonic, subdominant, dominant, tonic', correct: true },
        { text: 'Tonic, dominant, subdominant, tonic', why: 'That order would be {r:I}–{r:V}–{r:IV}–{r:I}.' },
        { text: 'Dominant, tonic, subdominant, dominant', why: 'It starts on {r:I}, the tonic: home.' },
      ],
      shuffle: false,
      explain: '{r:I} is home, {r:IV} moves away, {r:V} builds tension and {r:I} resolves it: the full cycle.',
      fact: 'functional-one-four-five',
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete {r:ii}–{r:V}–{r:I} in {k:G major}.',
      text: '___  {c:D}  {c:G}',
      blanks: ['{c:Am}'],
      bank: ['{c:Em}', '{c:C}', '{c:Bm}'],
      explain: '{r:ii} is built on {n:A}, the 2nd note of {k:G major}: {c:Am}. Then {c:D} ({r:V}) and home to {c:G}.',
      fact: 'functional-two-five-one',
    },
    {
      type: 'card',
      title: 'One loop, two starts',
      body: '{c:G} {c:D} {c:Em} {c:C} is {r:I}–{r:V}–{r:vi}–{r:IV}, one of the most used loops in pop. Start the same loop on {c:Em} and you get {r:vi}–{r:IV}–{r:I}–{r:V}: the same chords in the same order, with a darker first chord.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['Em', 'C', 'G', 'D'], tempo: 80, beats: 4 }, label: 'Hear {r:vi}–{r:IV}–{r:I}–{r:V} in G' },
    },
    {
      type: 'true-false',
      statement: 'Started on its third chord, the loop {r:I}–{r:V}–{r:vi}–{r:IV} becomes {r:vi}–{r:IV}–{r:I}–{r:V}.',
      answer: true,
      explain: 'Go round {r:I} {r:V} {r:vi} {r:IV} starting from {r:vi}: {r:vi} {r:IV} {r:I} {r:V}. The same loop, a different first chord.',
      fact: 'functional-same-loop',
    },
    {
      type: 'choice',
      prompt: 'Which is the classic 1950s progression?',
      options: [
        { text: '{r:I}–{r:vi}–{r:IV}–{r:V}', correct: true },
        { text: '{r:ii}–{r:V}–{r:I}', why: 'That is the central progression of jazz.' },
        { text: '{r:I}–{r:IV}–{r:V}–{r:I}', why: 'That is the basic tonic, subdominant, dominant cycle.' },
      ],
      explain: '{r:I}–{r:vi}–{r:IV}–{r:V} is the 1950s progression: in {k:C major}, {c:C} {c:Am} {c:F} {c:G}.',
      fact: 'functional-fifties',
    },
    {
      type: 'play-chord',
      prompt: 'In {k:G major}, {r:vi} is {c:Em}. Strum it once, then loop {c:G} {c:Em} {c:C} {c:D} at your own pace.',
      chord: 'Em',
      frets: '022000',
      explain: '{c:Em} is {n:E} {n:G} {n:B}: two fingers at fret 2 on strings 5 and 4. It shares {n:G} and {n:B} with {c:G}.',
      alternative: { generate: 'chord-shape', params: { chords: ['Em'] } },
    },
    { generate: 'roman-chord', params: { direction: 'to-chord', numerals: ['I', 'V', 'IV', 'vi', 'ii'], maxAccidentals: 2 } },
    { generate: 'roman-chord', params: { direction: 'to-roman', numerals: ['I', 'V', 'IV', 'vi', 'ii'], maxAccidentals: 2 } },
  ],
  facts: [
    { id: 'functional-one-four-five', front: 'Which jobs does {r:I}–{r:IV}–{r:V}–{r:I} move through?', back: 'Tonic, subdominant, dominant, tonic.' },
    { id: 'functional-fifties', front: 'What is the classic 1950s progression?', back: '{r:I}–{r:vi}–{r:IV}–{r:V}: in {k:C major}, {c:C} {c:Am} {c:F} {c:G}.' },
    {
      id: 'functional-two-five-one',
      front: 'What is the central progression of jazz?',
      back: '{r:ii}–{r:V}–{r:I}: in {k:C major}, {c:Dm} {c:G} {c:C}.',
      ask: {
        type: 'fill-blanks',
        prompt: 'Complete {r:ii}–{r:V}–{r:I} in {k:C major}.',
        text: '___  {c:G}  {c:C}',
        blanks: ['{c:Dm}'],
        bank: ['{c:Am}', '{c:F}', '{c:Em}'],
        explain: '{r:ii} is built on {n:D}, the 2nd note of {k:C major}: {c:Dm}. Then {c:G} ({r:V}) and home to {c:C}.',
      },
    },
    {
      id: 'functional-same-loop',
      front: 'How are {r:vi}–{r:IV}–{r:I}–{r:V} and {r:I}–{r:V}–{r:vi}–{r:IV} related?',
      back: 'They are the same loop, started on a different chord.',
    },
  ],
};

const findingTheKey: Lesson = {
  id: 'finding-the-key',
  title: 'Finding the key of a song',
  teaches: 'List the chords, find the major key that holds them all, and listen for the chord that feels like home.',
  minutes: 3,
  skill: `theory:${U}:finding-the-key`,
  steps: [
    {
      type: 'card',
      title: 'Three clues',
      body: 'To find a song\'s key: list its chords, find the major key that holds them all, then listen for home. {c:G}, {c:C}, {c:D} and {c:Em} all live in {k:G major}, where they are {r:I}, {r:IV}, {r:V} and {r:vi}.',
      figure: { kind: 'circle', key: 'G major', highlight: ['C major', 'D major', 'E minor'], show: 'both', caption: '{k:G major} with its neighbours {k:C major}, {k:D major} and {k:E minor}.' },
    },
    {
      type: 'choice',
      prompt: 'The chords are {c:D}, {c:A}, {c:Bm} and {c:G}. Which major key holds them all?',
      options: [
        { text: '{k:D major}', correct: true },
        { text: '{k:A major}', why: '{k:A major} has {c:D} but not {c:G}: its 7th note is {n:G#}.' },
        { text: '{k:G major}', why: '{k:G major} has {c:D} and {c:Bm}, but {c:Am} instead of {c:A}.' },
        { text: '{k:E major}', why: '{k:E major} has {c:A} but no {c:D} or {c:G}: it has {n:D#} and {n:G#}.' },
      ],
      explain: 'In {k:D major}: {c:D} is {r:I}, {c:G} {r:IV}, {c:A} {r:V} and {c:Bm} {r:vi}. All four belong.',
      fact: 'functional-key-from-chords',
    },
    {
      type: 'card',
      title: 'Home decides',
      body: 'A set of chords fits a major key and its {t:relative-minor|relative minor} equally well: {c:Am}, {c:F}, {c:C} and {c:G} fit both {k:C major} and {k:A minor}. What decides is home: the chord the music feels at rest on, often the first and last chord.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['C', 'G', 'Am', 'F', 'C'], tempo: 76, beats: 2 }, label: 'Hear a loop at home on {c:C}' },
    },
    {
      type: 'listen-choice',
      prompt: 'The loop {c:Am} {c:F} {c:C} {c:G}: does it feel at home on {c:Am} or on {c:C}?',
      sound: { kind: 'progression', chords: ['Am', 'F', 'C', 'G', 'Am'], tempo: 76, beats: 2 },
      options: [{ text: 'At home on {c:Am}', correct: true }, { text: 'At home on {c:C}' }],
      shuffle: false,
      explain: 'It starts on {c:Am} and comes back to rest there, so it is in {k:A minor}, the relative minor of {k:C major}. Same chords, different home.',
    },
    {
      type: 'true-false',
      statement: 'The first chord of a song is always its key.',
      answer: false,
      explain: 'Often, not always: many songs start away from home, on {r:IV} or {r:vi}. Trust the chord the song feels at rest on, usually the last one.',
      fact: 'functional-key-home-chord',
    },
    {
      type: 'choice',
      prompt: 'The chords are {c:A}, {c:E}, {c:F#m} and {c:D}. Which major key holds them all?',
      options: [
        { text: '{k:A major}', correct: true },
        { text: '{k:E major}', why: '{k:E major} has {c:A} and {c:E} but not {c:D}: its 7th note is {n:D#}.' },
        { text: '{k:D major}', why: '{k:D major} has {c:A} and {c:D}, but {c:Em} instead of {c:E}.' },
        { text: '{k:G major}', why: '{k:G major} has {c:D}, but neither {c:A} nor {c:E}.' },
      ],
      explain: 'In {k:A major}: {c:A} {r:I}, {c:D} {r:IV}, {c:E} {r:V}, {c:F#m} {r:vi}.',
      fact: 'functional-key-from-chords',
    },
    {
      type: 'choice',
      prompt: 'The chords {c:Am}, {c:F}, {c:C} and {c:G} fit {k:C major} and {k:A minor}. What decides which key a song using them is in?',
      options: [
        { text: 'The chord that sounds like home', correct: true },
        { text: 'The first chord, every time', why: 'Songs often start away from home; listen for where the music rests.' },
        { text: 'The chord played the most', why: 'A chord can be played often without being home; what matters is where the music rests.' },
      ],
      shuffle: false,
      explain: 'Relative keys share their chords. If the music rests on {c:C} it is in {k:C major}; if it rests on {c:Am}, {k:A minor}.',
      fact: 'functional-key-relative',
    },
    {
      type: 'type-answer',
      prompt: 'A song uses {c:E}, {c:A}, {c:B} and {c:C#m}, and it comes to rest on {c:E}. Type the tonic of its key.',
      answer: { kind: 'note', value: 'E', spelling: 'exact' },
      input: 'keypad',
      explain: '{c:E} {r:I}, {c:A} {r:IV}, {c:B} {r:V} and {c:C#m} {r:vi} all belong to {k:E major}, and the song rests on {c:E}: the key is {k:E major}.',
    },
    {
      type: 'choice',
      prompt: 'A song uses {c:C}, {c:G}, {c:Am} and {c:F}, and it ends at rest on {c:C}. Which key is it in?',
      options: [
        { text: '{k:C major}', correct: true },
        { text: '{k:A minor}', why: 'The chords fit {k:A minor} too, but then the song would rest on {c:Am}.' },
        { text: '{k:G major}', why: '{k:G major} has no {c:F}: its 7th note is {n:F#}.' },
        { text: '{k:F major}', why: '{k:F major} has {c:Gm}, not {c:G}: it has {n:Bb}, not {n:B}.' },
      ],
      explain: 'All four chords belong to {k:C major} ({r:I} {r:V} {r:vi} {r:IV}), and the song rests on {c:C}: home.',
      fact: 'functional-key-home-chord',
    },
  ],
  facts: [
    {
      id: 'functional-key-home-chord',
      front: 'Which chord is the tonic chord of a song\'s key?',
      back: 'The chord the song feels at rest on: often, but not always, its first and last chord.',
    },
    {
      id: 'functional-key-from-chords',
      front: 'All the chords of a song fit one major key. What do you look for?',
      back: 'Its {r:I}, {r:IV} and {r:V}: {c:G}, {c:C}, {c:D} and {c:Em} point to {k:G major}.',
    },
    {
      id: 'functional-key-relative',
      front: 'The chords fit a major key and its relative minor. What decides the key?',
      back: 'The chord that sounds like home: {c:C} for {k:C major}, {c:Am} for {k:A minor}.',
    },
  ],
};

/** Unit 22 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'Chord function and cadence',
  theme: 'harmony',
  description: 'Tonic, subdominant and dominant, why V pulls home, the four cadences, common progressions, and how to find a song\'s key.',
  lessons: [threeFunctions, substituteChords, whyVPullsHome, cadences, hearingCadences, commonProgressions, findingTheKey],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      {
        type: 'match-pairs',
        prompt: 'Match each chord of {k:C major} with its job.',
        pairs: [
          { left: '{c:C}', right: 'Tonic: home' },
          { left: '{c:F}', right: 'Subdominant: away' },
          { left: '{c:G}', right: 'Dominant: tension' },
        ],
        explain: '{c:C} is {r:I}, {c:F} is {r:IV} and {c:G} is {r:V}.',
      },
      {
        type: 'choice',
        prompt: 'Which chord can replace {r:IV} as a subdominant chord?',
        options: [
          { text: '{r:ii}', correct: true },
          { text: '{r:V}', why: '{r:V} is the dominant chord.' },
          { text: '{r:vi}', why: '{r:vi} shares two notes with {r:I}: it stands in for the tonic.' },
        ],
        shuffle: false,
        explain: '{r:ii} shares two notes with {r:IV} ({c:Dm} and {c:F} in {k:C major}), so it does the same job.',
      },
      {
        type: 'true-false',
        statement: '{r:vi} can stand in for the tonic chord.',
        answer: true,
        explain: '{r:vi} shares two notes with {r:I}: {c:Am} and {c:C} share {n:C} and {n:E}.',
      },
      {
        type: 'match-pairs',
        prompt: 'Match each scale degree with its name.',
        pairs: [
          { left: 'Degree 2', right: 'Supertonic' },
          { left: 'Degree 3', right: 'Mediant' },
          { left: 'Degree 6', right: 'Submediant' },
          { left: 'Degree 7', right: 'Leading tone' },
        ],
        explain: '1 tonic, 2 supertonic, 3 mediant, 4 subdominant, 5 dominant, 6 submediant, 7 leading tone.',
      },
      {
        type: 'choice',
        prompt: 'Which note of {c:G7} rises a half step to {n:C}?',
        options: [
          { text: '{n:B}', correct: true },
          { text: '{n:F}', why: '{n:F} falls a half step to {n:E}.' },
          { text: '{n:D}', why: '{n:D} is a whole step from {n:C}.' },
          { text: '{n:G}', why: '{n:G} is in both chords and stays.' },
        ],
        explain: '{n:B} is the leading tone of {k:C major}, a half step below {n:C}.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Complete the sentence.',
        text: 'In {c:A7} the tritone is ___ and {n:G}.',
        blanks: ['{n:C#}'],
        bank: ['{n:C}', '{n:E}', '{n:A}'],
        explain: '{c:A7} is {n:A} {n:C#} {n:E} {n:G}. Its 3rd, {n:C#}, and its 7th, {n:G}, are a tritone apart.',
      },
      {
        type: 'match-pairs',
        prompt: 'Match each chord move with its cadence.',
        pairs: [
          { left: '{r:V} to {r:I}', right: 'Authentic' },
          { left: '{r:IV} to {r:I}', right: 'Plagal' },
          { left: 'Ends on {r:V}', right: 'Half' },
          { left: '{r:V} to {r:vi}', right: 'Deceptive' },
        ],
        explain: 'Authentic and plagal end home; a half cadence stops on {r:V}; a deceptive one goes from {r:V} to {r:vi}.',
      },
      {
        type: 'choice',
        prompt: 'In {k:D major}, {c:A7} to {c:Bm} is which cadence?',
        options: [
          { text: 'Authentic', why: 'Authentic would be {c:A7} to {c:D}.' },
          { text: 'Plagal', why: 'Plagal would be {c:G} to {c:D}.' },
          { text: 'Half', why: 'A half cadence would stop on {c:A7}.' },
          { text: 'Deceptive', correct: true },
        ],
        shuffle: false,
        explain: '{c:A7} is {r:V7} and {c:Bm} is {r:vi} in {k:D major}: a deceptive cadence.',
      },
      {
        type: 'choice',
        prompt: 'A phrase in {k:G major} ends {c:Am} to {c:D}. Which cadence is it?',
        options: [
          { text: 'Authentic', why: 'It does not end on {c:G}, home.' },
          { text: 'Plagal', why: 'Plagal is {c:C} to {c:G}.' },
          { text: 'Half', correct: true },
          { text: 'Deceptive', why: 'Deceptive would be {c:D} to {c:Em}.' },
        ],
        shuffle: false,
        explain: 'It stops on {c:D}, the {r:V} chord: a half cadence, like a comma.',
      },
      {
        type: 'true-false',
        statement: 'The authentic cadence sounds the most final.',
        answer: true,
        explain: '{r:V} to {r:I}: the leading tone rises home and the tension resolves completely.',
      },
      { generate: 'cadence-ear', params: { types: ['authentic', 'half', 'plagal', 'deceptive'] } },
      {
        type: 'choice',
        prompt: 'Which jobs does {r:I}–{r:IV}–{r:V}–{r:I} move through?',
        options: [
          { text: 'Tonic, subdominant, dominant, tonic', correct: true },
          { text: 'Tonic, dominant, subdominant, tonic', why: 'That order would be {r:I}–{r:V}–{r:IV}–{r:I}.' },
          { text: 'Subdominant, tonic, dominant, tonic', why: 'It starts on {r:I}: home.' },
        ],
        shuffle: false,
        explain: '{r:I} home, {r:IV} away, {r:V} tension, {r:I} home again.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Complete {r:I}–{r:vi}–{r:IV}–{r:V} in {k:G major}.',
        text: '{c:G}  ___  {c:C}  {c:D}',
        blanks: ['{c:Em}'],
        bank: ['{c:Am}', '{c:Bm}', '{c:E}'],
        explain: '{r:vi} in {k:G major} is built on {n:E}: {c:Em}.',
      },
      {
        type: 'choice',
        prompt: 'Which is the central progression of jazz?',
        options: [
          { text: '{r:ii}–{r:V}–{r:I}', correct: true },
          { text: '{r:I}–{r:vi}–{r:IV}–{r:V}', why: 'That is the classic 1950s progression.' },
          { text: '{r:I}–{r:V}–{r:vi}–{r:IV}', why: 'That is the great pop loop.' },
        ],
        explain: '{r:ii}–{r:V}–{r:I}: in {k:C major}, {c:Dm} {c:G} {c:C}.',
      },
      {
        type: 'true-false',
        statement: '{r:vi}–{r:IV}–{r:I}–{r:V} is the same loop as {r:I}–{r:V}–{r:vi}–{r:IV}, started on another chord.',
        answer: true,
        explain: 'Start {r:I} {r:V} {r:vi} {r:IV} on {r:vi} and you get {r:vi} {r:IV} {r:I} {r:V}.',
      },
      {
        type: 'choice',
        prompt: 'The chords are {c:C}, {c:F}, {c:G} and {c:Dm}. Which major key holds them all?',
        options: [
          { text: '{k:C major}', correct: true },
          { text: '{k:F major}', why: '{k:F major} has {c:Gm}, not {c:G}.' },
          { text: '{k:G major}', why: '{k:G major} has no {c:F}: its 7th note is {n:F#}.' },
        ],
        explain: 'In {k:C major}: {c:C} {r:I}, {c:Dm} {r:ii}, {c:F} {r:IV}, {c:G} {r:V}.',
      },
      { generate: 'roman-chord', params: { numerals: ['I', 'V', 'IV', 'vi', 'ii'], maxAccidentals: 3 } },
    ],
  },
};

export default unit;
