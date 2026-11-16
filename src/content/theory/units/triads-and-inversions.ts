/**
 * Theory Path, unit 18: Triads and inversions. Written from the syllabus entries in
 * `src/content/plan/theory-path.json` (unit `triads-and-inversions`), one lesson per entry, in
 * order: each lesson opens with the "on the guitar" picture, asks the planned exercises, ends with
 * the planned drills, and turns every planned fact into a review card.
 *
 * Every shape, spelling, inversion and fret quoted here is cross-checked against the engines in
 * `triads-and-inversions.test.ts`.
 *
 * Where the syllabus asks for more than the engine can draw or grade, the lesson keeps the idea
 * and fits the limit (each change is in the unit's report):
 * - fretboard figures span at most 13 frets, so the G major shapes are drawn on frets 2 to 13
 *   (not 2 to 16) and the C major triads on frets 3 to 14 (not 3 to 16), with vii° on its own figure;
 * - a play-phrase holds at most 16 notes, so climbing the six C major triads (18 notes) is two
 *   phrases of three triads, and the "climb and back" audio climbs I to vii° once.
 */
import type { FretDot, Lesson, Unit } from '@/lessons';

const U = 'triads-and-inversions';

/** A fretboard dot with its note and degree claimed (both are checked by the validator). */
const dot = (string: number, fret: number, note: string, degree: string, role: FretDot['role']): FretDot => ({ string, fret, note, degree, role });

const fourTriads: Lesson = {
  id: 'four-triads',
  title: 'Major, minor, diminished, augmented',
  teaches: 'Stacking two thirds gives four kinds of triad: major, minor, diminished and augmented.',
  minutes: 3,
  skill: `theory:${U}:four-triads`,
  steps: [
    {
      type: 'card',
      title: 'A root and two thirds',
      body: 'A {t:triad} is a {t:root} with two thirds stacked on it: root to 3rd, then 3rd to 5th. Each third is major (four half steps) or minor (three), so there are four ways to stack them. Here all four share one root, {n:C} on string 4 at fret 10.',
      figure: {
        kind: 'fretboard',
        frets: [6, 11],
        root: 'C',
        labels: 'degree',
        dots: [
          dot(4, 10, 'C', '1', 'root'),
          dot(3, 8, 'Eb', 'b3', 'third'),
          dot(3, 9, 'E', '3', 'third'),
          dot(2, 7, 'Gb', 'b5', 'fifth'),
          dot(2, 8, 'G', '5', 'fifth'),
          dot(2, 9, 'G#', '#5', 'fifth'),
        ],
        caption: 'Root on string 4, the 3rds on string 3, the 5ths on string 2.',
      },
    },
    {
      type: 'card',
      title: 'Four ways to stack',
      body: '**Major**: a major 3rd, then a minor 3rd. **Minor**: minor, then major. **{t:diminished-chord|Diminished}**: two minor 3rds, so the 5th shrinks to {d:b5}. **{t:augmented-triad|Augmented}**: two major 3rds, so the 5th grows to {d:#5}. On strings 4-3-2 that gives {c:C} 10-9-8, {c:Cm} 10-8-8, {c:Cdim} 10-8-7 and {c:Caug} 10-9-9.',
      figure: {
        kind: 'audio',
        sound: { kind: 'progression', chords: ['C', 'Cm', 'Cdim', 'Caug'], voicing: 'close', tempo: 60, beats: 2 },
        label: 'Hear all four triads',
        caption: '{c:C}, {c:Cm}, {c:Cdim}, then {c:Caug}.',
      },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each triad with the two thirds stacked in it, from the bottom up.',
      pairs: [
        { left: 'Major', right: 'Major 3rd + minor 3rd' },
        { left: 'Minor', right: 'Minor 3rd + major 3rd' },
        { left: 'Diminished', right: 'Minor 3rd + minor 3rd' },
        { left: 'Augmented', right: 'Major 3rd + major 3rd' },
      ],
      explain: 'Read a triad from the bottom: root to 3rd, then 3rd to 5th. Major and minor mix one of each; diminished stacks two minor 3rds, augmented two major 3rds.',
      fact: 'triads-stacked-thirds',
    },
    {
      type: 'listen-choice',
      prompt: 'Listen to this triad on {n:C}. Is it major, minor, diminished or augmented?',
      sound: { kind: 'chord', chord: 'Caug', voicing: 'close', octave: 3 },
      options: [{ text: 'Major' }, { text: 'Minor' }, { text: 'Diminished' }, { text: 'Augmented', correct: true }],
      shuffle: false,
      explain: 'That was {c:Caug}: {n:C} {n:E} {n:G#}, two major 3rds. The raised 5th makes it sound stretched and unsettled, as if it is waiting to move on.',
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete {c:Caug}: stack two major 3rds on {n:C}.',
      text: '{n:C}  {n:E}  ___',
      blanks: ['{n:G#}'],
      bank: ['{n:G}', '{n:Ab}', '{n:A}'],
      spelling: 'exact',
      explain: 'A major 3rd above {n:E} is {n:G#}. The 5th of a chord on {n:C} is always a G of some kind, so it is G sharp, not A flat: {c:Caug} is {n:C} {n:E} {n:G#}.',
      fact: 'triads-c-dim-aug',
    },
    {
      type: 'choice',
      prompt: 'Which triad is two minor 3rds stacked?',
      options: [
        { text: 'Diminished', correct: true },
        { text: 'Minor', why: 'A minor triad puts a major 3rd on top of the minor one.' },
        { text: 'Augmented', why: 'Augmented is two major 3rds.' },
        { text: 'Major', why: 'Major is a major 3rd with a minor 3rd on top.' },
      ],
      explain: 'Two minor 3rds give root, {d:b3} and {d:b5}: a diminished triad, such as {c:Bdim} ({n:B} {n:D} {n:F}), the chord on degree 7 of {k:C major}.',
      fact: 'triads-stacked-thirds',
    },
    {
      type: 'card',
      title: 'How they are written',
      body: 'Formulas: major {d:1} {d:3} {d:5}, minor {d:1} {d:b3} {d:5}, diminished {d:1} {d:b3} {d:b5}, augmented {d:1} {d:3} {d:#5}. Symbols: {c:C}, {c:Cm}, {c:Cdim} and {c:Caug}. Charts also write diminished with a small circle (°) and augmented with a plus sign (+).',
    },
    {
      type: 'fretboard-name',
      prompt: 'The root (R) is {n:C} on string 4. Which degree is the dot on string 3, fret 8?',
      position: { string: 3, fret: 8 },
      root: { string: 4, fret: 10 },
      ask: 'degree',
      spelling: 'any',
      options: ['b3', '3', '2', '4'],
      explain: 'String 3 at fret 8 is {n:Eb}, three half steps above {n:C}: the {d:b3}. Minor and diminished both use it; diminished also lowers the 5th, to string 2 at fret 7: {c:Cdim} is 10-8-7.',
      fact: 'triads-formulas',
    },
    {
      type: 'true-false',
      statement: 'An augmented triad has a perfect 5th above its root, like a major triad.',
      answer: false,
      explain: 'Two major 3rds add up to eight half steps, one more than a perfect 5th. That is the {d:#5} in augmented\'s formula, {d:1} {d:3} {d:#5}.',
      fact: 'triads-formulas',
    },
    { generate: 'chord-tones', params: { types: ['major', 'minor', 'dim', 'aug'], roots: ['C', 'G', 'D', 'F', 'A', 'E'], ask: 'notes' } },
    { generate: 'chord-quality-ear', params: { types: ['major', 'minor', 'dim', 'aug'] } },
  ],
  facts: [
    {
      id: 'triads-stacked-thirds',
      front: 'Which two thirds stack to make a major, a minor, a diminished and an augmented triad?',
      back: 'Major: a major 3rd, then a minor 3rd. Minor: minor, then major. Diminished: two minor 3rds. Augmented: two major 3rds.',
      ask: {
        type: 'choice',
        prompt: 'Which triad is two major 3rds stacked?',
        options: [
          { text: 'Augmented', correct: true },
          { text: 'Major', why: 'Major has a minor 3rd on top of its major 3rd.' },
          { text: 'Diminished', why: 'Diminished is two minor 3rds.' },
          { text: 'Minor', why: 'Minor is a minor 3rd with a major 3rd on top.' },
        ],
        explain: 'Two major 3rds give root, {d:3} and {d:#5}: an augmented triad, such as {c:Caug}, {n:C} {n:E} {n:G#}.',
      },
    },
    {
      id: 'triads-formulas',
      front: 'What are the formulas of the major, minor, diminished and augmented triads?',
      back: 'Major {d:1} {d:3} {d:5}, minor {d:1} {d:b3} {d:5}, diminished {d:1} {d:b3} {d:b5}, augmented {d:1} {d:3} {d:#5}.',
      ask: {
        type: 'match-pairs',
        prompt: 'Match each triad with its formula.',
        pairs: [
          { left: 'Major', right: '{d:1} {d:3} {d:5}' },
          { left: 'Minor', right: '{d:1} {d:b3} {d:5}' },
          { left: 'Diminished', right: '{d:1} {d:b3} {d:b5}' },
          { left: 'Augmented', right: '{d:1} {d:3} {d:#5}' },
        ],
        explain: 'Minor lowers the 3rd; diminished lowers the 3rd and the 5th; augmented raises the 5th.',
      },
    },
    {
      id: 'triads-c-dim-aug',
      front: 'Spell {c:Cdim} and {c:Caug}.',
      back: '{c:Cdim} is {n:C} {n:Eb} {n:Gb}. {c:Caug} is {n:C} {n:E} {n:G#}.',
      ask: {
        type: 'fill-blanks',
        prompt: 'Complete {c:Cdim}: two minor 3rds stacked on {n:C}.',
        text: '{n:C}  ___  ___',
        blanks: ['{n:Eb}', '{n:Gb}'],
        bank: ['{n:D#}', '{n:F#}', '{n:E}', '{n:G}'],
        spelling: 'exact',
        explain: 'A minor 3rd above {n:C} is {n:Eb}, and a minor 3rd above {n:Eb} is {n:Gb}. The letters stay C, E, G: {n:C} {n:Eb} {n:Gb}.',
      },
    },
    {
      id: 'triads-symbols',
      front: 'How do chord symbols write diminished and augmented?',
      back: 'Diminished: dim, or a small circle (°), as in {c:Cdim}. Augmented: aug, or a plus sign (+), as in {c:Caug}.',
    },
  ],
};

const triadInversions: Lesson = {
  id: 'triad-inversions',
  title: 'Root position and inversions',
  teaches: "A triad's inversion is named by its lowest note: root, third (first inversion) or fifth (second inversion).",
  minutes: 3,
  skill: `theory:${U}:triad-inversions`,
  steps: [
    {
      type: 'card',
      title: 'The lowest note decides',
      body: 'Strum open {c:C}, x32010. Its lowest note, string 5 at fret 3, is {n:C}: the root. A triad with its root at the bottom is in {t:root-position|root position}. The notes above can come in any order, even twice; only the lowest note, the bass, decides.',
      figure: { kind: 'chord', symbol: 'C', frets: 'x32010', caption: 'Open {c:C}: the bass is {n:C}, the root.' },
    },
    {
      type: 'card',
      title: 'Two inversions',
      body: 'Put another chord tone at the bottom and the triad is an {t:inversion}. The 3rd lowest is {t:first-inversion|first inversion}: let open string 6 ring under {c:C} (032010) and {n:E} is the bass. The 5th lowest is {t:second-inversion|second inversion}.',
      figure: { kind: 'chord', symbol: 'C/E', frets: '032010', caption: 'The open low {n:E}, the 3rd, is now the bass.' },
    },
    {
      type: 'true-false',
      statement: 'A triad is in root position only when its notes go root, 3rd, 5th from low to high.',
      answer: false,
      explain: 'Only the lowest note counts. Open {c:C}, x32010, goes {n:C} {n:E} {n:G} {n:C} {n:E} from low to high, and it is in root position because {n:C} is at the bottom.',
      fact: 'triads-root-position',
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'C/G',
      frets: '332010',
      // Only this shape: any-voicing would also accept open C (x32010) or C/E, which are not second inversion.
      accept: 'this-shape',
      prompt: 'Build {c:C} in second inversion: open {c:C} with string 6 at fret 3 added.',
      hint: 'Keep the open {c:C} shape and put a finger on string 6, fret 3.',
      explain: 'String 6 at fret 3 is {n:G}, the 5th of {c:C}. With the 5th at the bottom the chord is in second inversion, 332010.',
      fact: 'triads-first-second-inversion',
    },
    {
      type: 'card',
      title: 'Slash names',
      body: 'Chord charts write the bass after a slash. {c:C/E} means {c:C} with {n:E} in the bass: first inversion. {c:C/G} means {c:C} with {n:G} in the bass: second inversion. A {t:slash-chord|slash chord} like these tells you the inversion at a glance.',
      figure: { kind: 'chord', symbol: 'C/G', frets: '332010', caption: '{c:C/G}: the 5th, {n:G}, in the bass.' },
    },
    {
      type: 'choice',
      prompt: 'Which inversion is {c:G/B}?',
      options: [
        { text: 'First inversion', correct: true },
        { text: 'Second inversion', why: 'Second inversion has the 5th, {n:D}, in the bass: {c:G/D}.' },
        { text: 'Root position', why: 'Root position has {n:G} lowest. Here the bass is {n:B}.' },
      ],
      shuffle: false,
      explain: '{c:G} is {n:G} {n:B} {n:D}. {n:B} is its 3rd, and the 3rd in the bass makes first inversion.',
      fact: 'triads-slash-names',
    },
    {
      type: 'listen-choice',
      prompt: 'You hear two {c:C} chords. Which one has the root, {n:C}, in the bass?',
      sound: { kind: 'progression', chords: ['C/E', 'C'], tempo: 60, beats: 2 },
      options: [{ text: 'The first' }, { text: 'The second', correct: true }],
      shuffle: false,
      explain: 'The first was {c:C/E}, 032010, with the open low {n:E} under it. The second was open {c:C}, with the root at the bottom. Listen to the lowest note: the chord above hardly changes.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each chord with its inversion.',
      pairs: [
        { left: '{c:A/C#}', right: 'First inversion' },
        { left: '{c:F/C}', right: 'Second inversion' },
        { left: '{c:Am}', right: 'Root position' },
      ],
      explain: '{c:A} is {n:A} {n:C#} {n:E}, so {n:C#} in the bass is its 3rd. {c:F} is {n:F} {n:A} {n:C}, so {n:C} is its 5th. {c:Am} has its root at the bottom.',
      fact: 'triads-first-second-inversion',
    },
    {
      type: 'type-answer',
      prompt: 'Write {c:D} in first inversion as a slash chord.',
      answer: { kind: 'chord', value: 'D/F#', spelling: 'exact' },
      input: 'keyboard',
      explain: '{c:D} is {n:D} {n:F#} {n:A}. First inversion puts the 3rd, {n:F#}, in the bass: {c:D/F#}.',
      fact: 'triads-slash-names',
    },
    {
      type: 'choice',
      prompt: 'You let the open low {n:E} string ring under open {c:C}: 032010. What is the chord now?',
      options: [
        { text: '{c:C/E}, first inversion', correct: true },
        { text: '{c:C/G}, second inversion', why: 'That needs {n:G} in the bass: string 6 at fret 3.' },
        { text: '{c:Em}', why: 'The notes are still {n:C} {n:E} {n:G}: a {c:C} chord with a new bass.' },
        { text: '{c:C}, root position', why: 'The lowest note is now {n:E}, not {n:C}.' },
      ],
      explain: 'The open low {n:E} is the 3rd of {c:C}. With the 3rd in the bass the chord is {c:C/E}, first inversion.',
      fact: 'triads-open-c-e',
    },
    { generate: 'chord-tones', params: { types: ['major', 'minor'], roots: ['C', 'G', 'D', 'A', 'E', 'F'], ask: 'tone' } },
  ],
  facts: [
    {
      id: 'triads-root-position',
      front: 'When is a triad in root position?',
      back: 'When its root is the lowest note, whatever order the notes above it come in.',
      ask: {
        type: 'true-false',
        statement: 'Open {c:C}, x32010, is in root position: its lowest note is the root, {n:C}.',
        answer: true,
        explain: 'String 5 at fret 3 is {n:C}, the lowest note played. Root in the bass means root position.',
      },
    },
    {
      id: 'triads-first-second-inversion',
      front: 'What makes a triad first inversion, and what makes it second inversion?',
      back: 'First inversion: the 3rd is the lowest note. Second inversion: the 5th is the lowest note.',
    },
    {
      id: 'triads-slash-names',
      front: 'What do {c:C/E} and {c:C/G} mean?',
      back: '{c:C} with {n:E} in the bass (first inversion), and {c:C} with {n:G} in the bass (second inversion).',
      ask: {
        type: 'choice',
        prompt: 'Which inversion is {c:C/G}?',
        options: [
          { text: 'Second inversion', correct: true },
          { text: 'First inversion', why: 'First inversion has the 3rd, {n:E}, in the bass: {c:C/E}.' },
          { text: 'Root position', why: 'Root position has {n:C} in the bass.' },
        ],
        shuffle: false,
        explain: '{n:G} is the 5th of {c:C}, and the 5th in the bass makes second inversion.',
      },
    },
    {
      id: 'triads-open-c-e',
      front: 'Open {c:C} is x32010. What does adding the open low {n:E} string (032010) make it?',
      back: '{c:C/E}: the 3rd, {n:E}, moves into the bass, so the chord is in first inversion.',
    },
  ],
};

/** The three G major shapes on strings 3-2-1, low on the neck to high. */
const G_SHAPES_321: FretDot[] = [
  dot(3, 4, 'B', '3', 'third'),
  dot(2, 3, 'D', '5', 'fifth'),
  dot(1, 3, 'G', '1', 'root'),
  dot(3, 7, 'D', '5', 'fifth'),
  dot(2, 8, 'G', '1', 'root'),
  dot(1, 7, 'B', '3', 'third'),
  dot(3, 12, 'G', '1', 'root'),
  dot(2, 12, 'B', '3', 'third'),
  dot(1, 10, 'D', '5', 'fifth'),
];

const majorTriads321: Lesson = {
  id: 'major-triads-strings-3-2-1',
  title: 'Major triads on the top three strings',
  teaches: 'On strings 3-2-1 every major triad has three shapes, one per inversion, repeating up the neck in order.',
  minutes: 4,
  skill: `theory:${U}:major-triads-strings-3-2-1`,
  steps: [
    {
      type: 'card',
      title: 'Three small shapes of G',
      body: 'On strings 3, 2 and 1 a triad has one note per string. {c:G} fits there three ways, one per inversion: {n:B} lowest at frets 4-3-3, {n:D} lowest at 7-8-7, and {n:G} lowest at 12-12-10. Each is a small shape you can move anywhere on the neck.',
      figure: { kind: 'fretboard', frets: [2, 13], root: 'G', labels: 'degree', dots: G_SHAPES_321, caption: 'The three {c:G} shapes on strings 3-2-1, by degree.' },
    },
    {
      type: 'choice',
      prompt: 'On strings 3-2-1, the {c:G} shape at frets 4-3-3 has {n:B} lowest. Which inversion is it?',
      options: [
        { text: 'First inversion', correct: true },
        { text: 'Second inversion', why: 'Second inversion has the 5th, {n:D}, lowest: the 7-8-7 shape.' },
        { text: 'Root position', why: 'Root position has {n:G} lowest: the 12-12-10 shape.' },
      ],
      shuffle: false,
      explain: '{n:B} is the 3rd of {c:G}. With the 3rd at the bottom it is first inversion, {c:G/B}.',
      fact: 'triads-g-major-321',
    },
    {
      type: 'card',
      title: 'Hear the three shapes',
      body: 'Here each shape is picked from string 3 to string 1. The notes are always {n:G}, {n:B} and {n:D}, in a new order each time, so the chord climbs while staying {c:G}.',
      figure: {
        kind: 'tab',
        tempo: 90,
        notes: [
          { string: 3, fret: 4, duration: 'e' }, { string: 2, fret: 3, duration: 'e' }, { string: 1, fret: 3, duration: 'q' },
          { string: 3, fret: 7, duration: 'e' }, { string: 2, fret: 8, duration: 'e' }, { string: 1, fret: 7, duration: 'q' },
          { string: 3, fret: 12, duration: 'e' }, { string: 2, fret: 12, duration: 'e' }, { string: 1, fret: 10, duration: 'q' },
        ],
        caption: 'First inversion, second inversion, root position.',
      },
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'G/D',
      frets: [null, null, null, 7, 8, 7],
      accept: 'this-shape',
      prompt: 'Build {c:G} in second inversion on strings 3, 2 and 1.',
      hint: 'Mute strings 6, 5 and 4 (tap above the nut until they show ×). The 5th, {n:D}, goes lowest.',
      explain: 'Second inversion has the 5th lowest: {n:D} on string 3, fret 7, then {n:G} on string 2, fret 8, and {n:B} on string 1, fret 7.',
      fact: 'triads-g-major-321',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap the three notes of {c:A} in first inversion on strings 3, 2 and 1.',
      find: { chord: 'A' },
      mode: 'all',
      octave: 'any',
      frets: [3, 8],
      strings: [3, 2, 1],
      hint: 'It is the 4-3-3 shape of {c:G}, two frets higher.',
      explain: 'First inversion has the 3rd lowest: {n:C#} on string 3 at fret 6, {n:E} on string 2 at fret 5, {n:A} on string 1 at fret 5. The {c:G} shape 4-3-3, two frets up.',
    },
    {
      type: 'choice',
      prompt: 'In the {c:G} shape at frets 7-8-7, which string has the root?',
      options: [
        { text: 'String 2', correct: true },
        { text: 'String 3', why: 'String 3 at fret 7 is {n:D}, the 5th.' },
        { text: 'String 1', why: 'String 1 at fret 7 is {n:B}, the 3rd.' },
      ],
      shuffle: false,
      explain: 'String 2 at fret 8 is {n:G}, the root, in the middle of the shape. The 5th sits below it and the 3rd above.',
      fact: 'triads-three-shapes-321',
    },
    {
      type: 'card',
      title: 'Round and round',
      body: 'Climb the neck and the shapes come round in a fixed order: first inversion, second inversion, root position, then first inversion again, 12 frets higher. Every major triad does the same. {c:A} starts at 2-2-0 in root position, then 6-5-5 and 9-10-9.',
      figure: {
        kind: 'fretboard',
        frets: [0, 11],
        root: 'A',
        labels: 'degree',
        dots: [
          dot(3, 2, 'A', '1', 'root'), dot(2, 2, 'C#', '3', 'third'), dot(1, 0, 'E', '5', 'fifth'),
          dot(3, 6, 'C#', '3', 'third'), dot(2, 5, 'E', '5', 'fifth'), dot(1, 5, 'A', '1', 'root'),
          dot(3, 9, 'E', '5', 'fifth'), dot(2, 10, 'A', '1', 'root'), dot(1, 9, 'C#', '3', 'third'),
        ],
        caption: '{c:A} on strings 3-2-1: root position, first, then second inversion.',
      },
    },
    {
      type: 'order',
      prompt: 'Start from the {c:G} shape at 4-3-3 and climb the neck. Put the shapes in the order you meet them.',
      tiles: ['1st inversion', '2nd inversion', 'Root position'],
      explain: 'From first inversion (4-3-3) you reach second inversion (7-8-7), then root position (12-12-10). After that, first inversion again at 16-15-15.',
      fact: 'triads-shape-cycle',
    },
    {
      type: 'true-false',
      statement: 'Each triad shape moves as a block: slide the {c:G} shape 7-8-7 up two frets and it plays {c:A}.',
      answer: true,
      explain: 'Every note rises a whole step: {n:D} {n:G} {n:B} become {n:E} {n:A} {n:C#}. At 9-10-9 it is {c:A} in second inversion.',
      fact: 'triads-three-shapes-321',
    },
    { generate: 'neck-tones', params: { what: 'chord', chords: ['G', 'A', 'C', 'D', 'E', 'F'], strings: [3, 2, 1], span: 4 } },
  ],
  facts: [
    {
      id: 'triads-three-shapes-321',
      front: 'How many shapes does each major triad have on strings 3, 2 and 1?',
      back: 'Three, one for each inversion: root position, first inversion and second inversion.',
    },
    {
      id: 'triads-g-major-321',
      front: 'Where are the three {c:G} major shapes on strings 3-2-1?',
      back: 'First inversion at frets 4-3-3, second inversion at 7-8-7, root position at 12-12-10.',
      figure: { kind: 'fretboard', frets: [2, 13], root: 'G', labels: 'degree', dots: G_SHAPES_321 },
      ask: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'G/B',
        frets: [null, null, null, 4, 3, 3],
        accept: 'this-shape',
        prompt: 'Build {c:G} in first inversion on strings 3, 2 and 1.',
        hint: 'Mute strings 6, 5 and 4. The 3rd, {n:B}, goes lowest.',
        explain: 'First inversion has the 3rd lowest: {n:B} on string 3 at fret 4, {n:D} on string 2 at fret 3, {n:G} on string 1 at fret 3.',
      },
    },
    {
      id: 'triads-shape-cycle',
      front: 'In what order do a major triad\'s shapes come as you climb strings 3-2-1?',
      back: 'First inversion, second inversion, root position, and round again: the same shapes repeat 12 frets higher.',
    },
  ],
};

const minorTriads321: Lesson = {
  id: 'minor-triads-strings-3-2-1',
  title: 'Minor triads on the top three strings',
  teaches: 'Each minor triad shape on strings 3-2-1 is the major shape with its third lowered one fret.',
  minutes: 3,
  skill: `theory:${U}:minor-triads-strings-3-2-1`,
  steps: [
    {
      type: 'card',
      title: 'One fret makes it minor',
      body: 'A minor 3rd is a half step below the major 3rd. So each major shape turns minor by moving **one** note, the 3rd, down one fret; the root and 5th stay put. Here are the three {c:G} shapes with both 3rds: {d:3} for {c:G}, {d:b3} for {c:Gm}.',
      figure: {
        kind: 'fretboard',
        frets: [2, 13],
        root: 'G',
        labels: 'degree',
        dots: [
          dot(3, 3, 'Bb', 'b3', 'target'), dot(3, 4, 'B', '3', 'third'), dot(2, 3, 'D', '5', 'fifth'), dot(1, 3, 'G', '1', 'root'),
          dot(3, 7, 'D', '5', 'fifth'), dot(2, 8, 'G', '1', 'root'), dot(1, 6, 'Bb', 'b3', 'target'), dot(1, 7, 'B', '3', 'third'),
          dot(3, 12, 'G', '1', 'root'), dot(2, 11, 'Bb', 'b3', 'target'), dot(2, 12, 'B', '3', 'third'), dot(1, 10, 'D', '5', 'fifth'),
        ],
        caption: 'Each {d:3} has its {d:b3} one fret lower, on the same string.',
      },
    },
    {
      type: 'true-false',
      statement: 'To turn a major triad shape into the minor one, you lower its root one fret.',
      answer: false,
      explain: 'Only the 3rd moves. Lower the root and you get a different chord; lower the 3rd one fret and the major triad becomes minor.',
      fact: 'triads-minor-from-major',
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'Gm',
      frets: [null, null, null, 12, 11, 10],
      accept: 'this-shape',
      prompt: 'Build {c:Gm} in root position on strings 3, 2 and 1.',
      hint: 'Start from {c:G} at 12-12-10 and lower its 3rd, {n:B} on string 2, one fret.',
      explain: '{c:Gm} is {n:G} {n:Bb} {n:D}: string 3 at fret 12, string 2 at fret 11, string 1 at fret 10. The {c:G} shape 12-12-10 with its 3rd one fret lower.',
      fact: 'triads-g-minor-321',
    },
    {
      type: 'fretboard-find',
      prompt: 'This is {c:G} at frets 7-8-7. Tap the note you lower to make {c:Gm}.',
      find: { note: 'B4' },
      mode: 'one',
      octave: 'exact',
      frets: [5, 9],
      shown: [{ string: 3, fret: 7 }, { string: 2, fret: 8 }, { string: 1, fret: 7 }],
      explain: 'The 3rd of {c:G} is {n:B}, here on string 1 at fret 7. Lower it to fret 6, {n:Bb}, and the shape is {c:Gm}: 7-8-6.',
      fact: 'triads-minor-from-major',
    },
    {
      type: 'card',
      title: 'Hear the change',
      body: 'Listen to {c:G} at 7-8-7, then {c:Gm} at 7-8-6. One note moves a half step, and the bright chord turns darker.',
      figure: {
        kind: 'tab',
        tempo: 80,
        notes: [
          { string: 3, fret: 7, duration: 'e' }, { string: 2, fret: 8, duration: 'e' }, { string: 1, fret: 7, duration: 'h.' },
          { string: 3, fret: 7, duration: 'e' }, { string: 2, fret: 8, duration: 'e' }, { string: 1, fret: 6, duration: 'h.' },
        ],
        caption: '{c:G}, then {c:Gm}: only string 1 changes.',
      },
    },
    {
      type: 'listen-choice',
      prompt: 'A triad on strings 3, 2 and 1. Is it major or minor?',
      sound: { kind: 'chord', chord: 'Gm', frets: [null, null, null, 7, 8, 6], style: 'strum' },
      options: [{ text: 'Major' }, { text: 'Minor', correct: true }],
      shuffle: false,
      explain: 'That was {c:Gm} at 7-8-6: {n:D} {n:G} {n:Bb}. The minor 3rd, {n:Bb}, gives the darker sound.',
    },
    {
      type: 'choice',
      prompt: 'Which shape is {c:Gm} in first inversion on strings 3-2-1?',
      options: [
        { text: '3-3-3', correct: true },
        { text: '4-3-3', why: 'That is {c:G}: string 3 at fret 4 is {n:B}, the major 3rd.' },
        { text: '4-3-2', why: 'That lowers {n:G}, the root, to {n:F#}.' },
        { text: '4-2-3', why: 'That lowers {n:D}, the 5th.' },
      ],
      explain: 'First inversion has the 3rd lowest. {c:G}\'s is 4-3-3; lower its 3rd, {n:B} on string 3, one fret to {n:Bb}: 3-3-3, {n:Bb} {n:D} {n:G}.',
      fact: 'triads-g-minor-321',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each {c:G} shape on strings 3-2-1 with its {c:Gm} shape.',
      pairs: [
        { left: '4-3-3', right: '3-3-3' },
        { left: '7-8-7', right: '7-8-6' },
        { left: '12-12-10', right: '12-11-10' },
      ],
      explain: 'The 3rd moves one fret in each: on string 3 in 4-3-3, on string 1 in 7-8-7, on string 2 in 12-12-10.',
      fact: 'triads-know-the-third',
    },
    {
      type: 'choice',
      prompt: '{c:A} on strings 3-2-1 at frets 9-10-9 has its 3rd, {n:C#}, on string 1. Which shape is {c:Am}?',
      options: [
        { text: '9-10-8', correct: true },
        { text: '8-10-9', why: 'That lowers {n:E}, the 5th, not the 3rd.' },
        { text: '9-9-9', why: 'That lowers {n:A}, the root.' },
        { text: '9-10-10', why: 'That raises the 3rd instead of lowering it.' },
      ],
      explain: 'Lower the 3rd, {n:C#} on string 1, one fret to {n:C}: 9-10-8 is {c:Am}, {n:E} {n:A} {n:C}.',
      fact: 'triads-know-the-third',
    },
    { generate: 'neck-tones', params: { what: 'chord', chords: ['Gm', 'Am', 'Em', 'Dm', 'G', 'A'], strings: [3, 2, 1], span: 4 } },
    { generate: 'chord-quality-ear', params: { types: ['major', 'minor'] } },
  ],
  facts: [
    {
      id: 'triads-minor-from-major',
      front: 'How do you turn a major triad shape into the minor triad on the same root?',
      back: 'Lower the 3rd by one fret. The root and the 5th stay where they are.',
    },
    {
      id: 'triads-g-minor-321',
      front: 'Where are the three {c:Gm} shapes on strings 3-2-1?',
      back: 'First inversion 3-3-3, second inversion 7-8-6, root position 12-11-10.',
      ask: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'Gm/D',
        frets: [null, null, null, 7, 8, 6],
        accept: 'this-shape',
        prompt: 'Build {c:Gm} in second inversion on strings 3, 2 and 1.',
        hint: 'Mute strings 6, 5 and 4. The 5th, {n:D}, goes lowest.',
        explain: '{n:D} on string 3 at fret 7, {n:G} on string 2 at fret 8, {n:Bb} on string 1 at fret 6: the {c:G} shape 7-8-7 with its 3rd lowered.',
      },
    },
    {
      id: 'triads-know-the-third',
      front: 'Why know where the 3rd is in each triad shape?',
      back: 'Moving that one note a fret switches the chord between major and minor, anywhere on the neck.',
    },
  ],
};

const triads432: Lesson = {
  id: 'triads-strings-4-3-2',
  title: 'Triads on strings 4, 3 and 2',
  teaches: 'On strings 4-3-2 the triad shapes differ from 3-2-1 because of the B string, but the method is the same.',
  minutes: 3,
  skill: `theory:${U}:triads-strings-4-3-2`,
  steps: [
    {
      type: 'card',
      title: 'One string set lower',
      body: 'Move down one {t:string-set|string set}, to strings 4, 3 and 2. {c:F} has three shapes here, one per inversion: root position at frets 3-2-1, first inversion at 7-5-6, second inversion at 10-10-10. Up the neck they come round in the same order as before.',
      figure: {
        kind: 'fretboard',
        frets: [1, 12],
        root: 'F',
        labels: 'degree',
        dots: [
          dot(4, 3, 'F', '1', 'root'), dot(3, 2, 'A', '3', 'third'), dot(2, 1, 'C', '5', 'fifth'),
          dot(4, 7, 'A', '3', 'third'), dot(3, 5, 'C', '5', 'fifth'), dot(2, 6, 'F', '1', 'root'),
          dot(4, 10, 'C', '5', 'fifth'), dot(3, 10, 'F', '1', 'root'), dot(2, 10, 'A', '3', 'third'),
        ],
        caption: 'The three {c:F} shapes on strings 4-3-2, by degree.',
      },
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'F/C',
      frets: [null, null, 10, 10, 10, null],
      accept: 'this-shape',
      prompt: 'Build {c:F} in second inversion on strings 4, 3 and 2.',
      hint: 'Mute strings 6, 5 and 1. All three notes sit at the same fret.',
      explain: 'Second inversion has the 5th lowest: {n:C} on string 4, {n:F} on string 3 and {n:A} on string 2, all at fret 10.',
      fact: 'triads-f-major-432',
    },
    {
      type: 'choice',
      prompt: 'Strings 4-3-2 at frets 7-5-6 play {n:A}, {n:C} and {n:F}. Which chord and inversion is it?',
      options: [
        { text: '{c:F}, first inversion', correct: true },
        { text: '{c:F}, second inversion', why: 'Second inversion has the 5th, {n:C}, lowest. Here the bass is {n:A}.' },
        { text: '{c:Am}, root position', why: '{c:Am} is {n:A} {n:C} {n:E}. This chord has {n:F}, not {n:E}.' },
        { text: '{c:C}, first inversion', why: '{c:C} is {n:C} {n:E} {n:G}: none of them is {n:A} or {n:F}.' },
      ],
      explain: '{n:F} {n:A} {n:C} is {c:F}. Its 3rd, {n:A}, is lowest, so it is first inversion: {c:F/A}.',
      fact: 'triads-f-major-432',
    },
    {
      type: 'card',
      title: 'Why the shapes change',
      body: 'Most neighbouring strings are a 4th apart, but strings 3 and 2 (G and B) are only a major 3rd apart. On strings 3-2-1 that narrow gap is at the bottom of the set; on 4-3-2 it is at the top. So {c:C} in root position is 5-5-3 on one set and 10-9-8 on the other.',
      figure: {
        kind: 'fretboard',
        frets: [3, 10],
        root: 'C',
        labels: 'degree',
        dots: [
          dot(3, 5, 'C', '1', 'root'), dot(2, 5, 'E', '3', 'third'), dot(1, 3, 'G', '5', 'fifth'),
          dot(4, 10, 'C', '1', 'root'), dot(3, 9, 'E', '3', 'third'), dot(2, 8, 'G', '5', 'fifth'),
        ],
        caption: '{c:C} in root position: 5-5-3 on strings 3-2-1, 10-9-8 on 4-3-2.',
      },
    },
    {
      type: 'true-false',
      statement: 'Triad shapes on strings 4-3-2 are the same as on strings 3-2-1.',
      answer: false,
      explain: 'The narrow G-to-B gap sits in a different place in each set, so the shapes differ. You still find them the same way: root, 3rd and 5th, one per string.',
      fact: 'triads-432-differ',
    },
    {
      type: 'card',
      title: 'The small F',
      body: 'You may know the small {c:F}, xx3211. Its strings 4, 3 and 2 are the root-position triad, frets 3-2-1, and string 1 adds one more {n:F} on top. So it moves like any triad shape: two frets up, xx5433 is {c:G}.',
      figure: { kind: 'chord', symbol: 'F', frets: 'xx3211', caption: 'The small {c:F}: the triad 3-2-1 plus {n:F} on string 1.' },
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'G',
      frets: 'xx5433',
      accept: 'this-shape',
      prompt: 'Slide the small {c:F} (xx3211) up two frets to play {c:G}. Build it.',
      hint: 'Every finger moves up two frets; strings 6 and 5 stay silent.',
      explain: 'Two frets up, xx3211 becomes xx5433: {n:G} {n:B} {n:D} on strings 4-3-2, with another {n:G} on string 1.',
      fact: 'triads-small-f',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap the three notes of {c:G} in root position on strings 4, 3 and 2.',
      find: { chord: 'G' },
      mode: 'all',
      octave: 'any',
      frets: [3, 6],
      strings: [4, 3, 2],
      hint: 'It is the {c:F} shape 3-2-1, two frets higher.',
      explain: 'Root position has {n:G} lowest: string 4 at fret 5, then {n:B} on string 3 at fret 4 and {n:D} on string 2 at fret 3.',
    },
    { generate: 'neck-tones', params: { what: 'chord', chords: ['F', 'G', 'C', 'D', 'A', 'E'], strings: [4, 3, 2], span: 4 } },
  ],
  facts: [
    {
      id: 'triads-432-differ',
      front: 'Why do triad shapes on strings 4-3-2 differ from those on strings 3-2-1?',
      back: 'Strings 3 and 2 (G and B) are a major 3rd apart, the others a 4th. That narrow gap is at the bottom of 3-2-1 but the top of 4-3-2.',
    },
    {
      id: 'triads-f-major-432',
      front: 'Where are the three {c:F} major shapes on strings 4-3-2?',
      back: 'Root position 3-2-1, first inversion 7-5-6, second inversion 10-10-10.',
      ask: {
        type: 'choice',
        prompt: 'On strings 4-3-2, which shape is {c:F} in second inversion?',
        options: [
          { text: '10-10-10', correct: true },
          { text: '7-5-6', why: 'That is first inversion, with {n:A} lowest.' },
          { text: '3-2-1', why: 'That is root position, with {n:F} lowest.' },
        ],
        shuffle: false,
        explain: 'Second inversion has the 5th, {n:C}, lowest: {n:C} {n:F} {n:A}, all at fret 10.',
      },
    },
    {
      id: 'triads-small-f',
      front: 'How is the small {c:F} chord, xx3211, built from a triad?',
      back: 'It is the root-position {c:F} triad on strings 4-3-2 (frets 3-2-1) with another {n:F} added on string 1.',
    },
  ],
};

/** Root-position triads of C major on strings 3-2-1: [chord, numeral, string-3, string-2, string-1 frets]. */
const C_MAJOR_321: Array<[string, string, number, number, number]> = [
  ['C', 'I', 5, 5, 3],
  ['Dm', 'ii', 7, 6, 5],
  ['Em', 'iii', 9, 8, 7],
  ['F', 'IV', 10, 10, 8],
  ['G', 'V', 12, 12, 10],
  ['Am', 'vi', 14, 13, 12],
];
/** The notes of those triads, root, 3rd, 5th (checked against the neck by the validator). */
const C_MAJOR_NOTES: Record<string, [string, string, string]> = {
  C: ['C', 'E', 'G'], Dm: ['D', 'F', 'A'], Em: ['E', 'G', 'B'], F: ['F', 'A', 'C'], G: ['G', 'B', 'D'], Am: ['A', 'C', 'E'],
};
const triadPhrase = (chords: string[]) =>
  chords.flatMap((c) => {
    const row = C_MAJOR_321.find((r) => r[0] === c)!;
    return [
      { string: 3, fret: row[2], duration: 'e' },
      { string: 2, fret: row[3], duration: 'e' },
      { string: 1, fret: row[4], duration: 'q' },
    ];
  });

const theKeyOnOneStringSet: Lesson = {
  id: 'the-key-on-one-string-set',
  title: 'The chords of a key on three strings',
  teaches: 'Moving triads up the scale on one string set plays the chords of the key in order.',
  minutes: 4,
  skill: `theory:${U}:the-key-on-one-string-set`,
  steps: [
    {
      type: 'card',
      title: 'Climb the scale, play the key',
      body: 'Walk up the {k:C major} scale on string 3: {n:C} {n:D} {n:E} {n:F} {n:G} {n:A}. On each note build a root-position triad from notes of the scale only. You get the chords of the key in order, {r:I} {r:ii} {r:iii} {r:IV} {r:V} {r:vi}, on just three strings.',
      figure: {
        kind: 'fretboard',
        frets: [3, 14],
        dots: C_MAJOR_321.flatMap(([chord, numeral, s3, s2, s1]) => {
          const [root, third, fifth] = C_MAJOR_NOTES[chord];
          return [
            { string: 3, fret: s3, note: root, role: 'root' as const, label: numeral },
            { string: 2, fret: s2, note: third, role: 'tone' as const },
            { string: 1, fret: s1, note: fifth, role: 'tone' as const },
          ];
        }),
        caption: 'Each root, on string 3, carries its numeral.',
      },
    },
    {
      type: 'card',
      title: 'Hear the key climb',
      body: 'Here are the seven triads of {k:C major} on strings 3-2-1, picked one after another, from {c:C} up to {c:Bdim}. Hear how each one sounds a little different: three major, three minor, one diminished.',
      figure: {
        kind: 'audio',
        sound: {
          kind: 'tab',
          tempo: 100,
          notes: [
            ...triadPhrase(['C', 'Dm', 'Em', 'F', 'G', 'Am']),
            { string: 3, fret: 16, duration: 'e' }, { string: 2, fret: 15, duration: 'e' }, { string: 1, fret: 13, duration: 'q' },
          ],
        },
        label: 'Climb from {r:I} to {r:vii°}',
      },
    },
    {
      type: 'choice',
      prompt: 'In {k:C major}, which chord is played at frets 10-10-8 on strings 3-2-1?',
      options: [
        { text: '{c:F}', correct: true },
        { text: '{c:G}', why: '{c:G} is two frets higher, at 12-12-10.' },
        { text: '{c:Em}', why: '{c:Em} is at 9-8-7, a minor shape.' },
        { text: '{c:Dm}', why: '{c:Dm} is at 7-6-5.' },
      ],
      explain: 'String 3 at fret 10 is {n:F}, string 2 at fret 10 is {n:A}, string 1 at fret 8 is {n:C}: {c:F}, the {r:IV} chord.',
      fact: 'triads-c-major-321',
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'Em',
      frets: [null, null, null, 9, 8, 7],
      accept: 'this-shape',
      prompt: 'Build {c:Em} in root position on strings 3, 2 and 1.',
      hint: 'Its root, {n:E}, is on string 3 at fret 9.',
      explain: '{c:Em} is {n:E} {n:G} {n:B}: string 3 at fret 9, string 2 at fret 8, string 1 at fret 7. The {r:iii} chord of {k:C major}.',
      fact: 'triads-c-major-321',
    },
    {
      type: 'card',
      title: 'The shape follows the quality',
      body: 'The shape changes as you climb because the quality does. Major {c:C}, {c:F} and {c:G} share one shape; minor {c:Dm}, {c:Em} and {c:Am} share another. The diminished {c:Bdim} has a shape of its own, 16-15-13, and then {c:C} returns at 17-17-15.',
      figure: {
        kind: 'fretboard',
        frets: [11, 17],
        dots: [
          { string: 3, fret: 14, note: 'A', role: 'root', label: 'vi' }, { string: 2, fret: 13, note: 'C', role: 'tone' }, { string: 1, fret: 12, note: 'E', role: 'tone' },
          { string: 3, fret: 16, note: 'B', role: 'root', label: 'vii°' }, { string: 2, fret: 15, note: 'D', role: 'tone' }, { string: 1, fret: 13, note: 'F', role: 'tone' },
          { string: 3, fret: 17, note: 'C', role: 'root', label: 'I' }, { string: 2, fret: 17, note: 'E', role: 'tone' }, { string: 1, fret: 15, note: 'G', role: 'tone' },
        ],
        caption: 'The top of the climb: {c:Am}, {c:Bdim}, then {c:C} again.',
      },
    },
    {
      type: 'true-false',
      statement: 'On strings 3-2-1, {c:C}, {c:F} and {c:G} in root position all use the same shape.',
      answer: true,
      explain: 'They are all major: 5-5-3, 10-10-8 and 12-12-10. Same quality, same shape, on a new root.',
      fact: 'triads-shape-changes',
    },
    {
      type: 'play-phrase',
      prompt: 'Pick the first three triads of {k:C major} on strings 3, 2 and 1: {c:C} 5-5-3, {c:Dm} 7-6-5, {c:Em} 9-8-7.',
      notes: triadPhrase(['C', 'Dm', 'Em']),
      octave: 'exact',
      tempo: 70,
      explain: 'Each triad is picked from string 3 to string 1, root first. Major, minor, minor: {r:I} {r:ii} {r:iii}.',
      alternative: {
        type: 'order',
        prompt: 'Put the triads of {k:C major} in the order you meet them climbing strings 3-2-1 from fret 5.',
        tiles: ['{c:C}', '{c:Dm}', '{c:Em}', '{c:F}', '{c:G}', '{c:Am}'],
        distractors: ['{c:D}', '{c:E}'],
        explain: 'Up the scale from {n:C}: {c:C} {c:Dm} {c:Em} {c:F} {c:G} {c:Am}. {c:D} and {c:E} would need {n:F#} and {n:G#}, notes outside the key.',
      },
    },
    {
      type: 'play-phrase',
      prompt: 'Now the next three: {c:F} 10-10-8, {c:G} 12-12-10, {c:Am} 14-13-12.',
      notes: triadPhrase(['F', 'G', 'Am']),
      octave: 'exact',
      tempo: 70,
      explain: 'Major, major, minor: {r:IV} {r:V} {r:vi}. {c:F} and {c:G} share the shape of {c:C}; {c:Am} uses the minor shape of {c:Dm} and {c:Em}.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap the three notes of {c:Am} in root position on strings 3, 2 and 1.',
        find: { chord: 'Am' },
        mode: 'all',
        octave: 'any',
        frets: [11, 14],
        strings: [3, 2, 1],
        explain: '{n:A} on string 3 at fret 14, {n:C} on string 2 at fret 13, {n:E} on string 1 at fret 12: the {r:vi} chord of {k:C major}.',
      },
    },
    {
      type: 'choice',
      prompt: 'Which numeral is the {k:C major} triad at frets 9-8-7 on strings 3-2-1?',
      options: [
        { text: '{r:iii}', correct: true },
        { text: '{r:ii}', why: '{r:ii} is {c:Dm}, at 7-6-5.' },
        { text: '{r:IV}', why: '{r:IV} is {c:F}, at 10-10-8.' },
        { text: '{r:vi}', why: '{r:vi} is {c:Am}, at 14-13-12.' },
      ],
      explain: 'String 3 at fret 9 is {n:E}, degree 3 of the scale, and {n:E} {n:G} {n:B} is minor: {r:iii}.',
      fact: 'triads-key-up-the-set',
    },
    { generate: 'diatonic-chord', params: { ask: 'chord', modes: ['major'], maxAccidentals: 1 } },
    { generate: 'neck-tones', params: { what: 'chord', chords: ['C', 'F', 'G', 'Dm', 'Em', 'Am'], strings: [3, 2, 1], span: 4 } },
  ],
  facts: [
    {
      id: 'triads-key-up-the-set',
      front: 'What do you play when you move a triad up the scale on one string set?',
      back: 'The chords of the key, in order: in {k:C major}, {c:C} {c:Dm} {c:Em} {c:F} {c:G} {c:Am} {c:Bdim}.',
      ask: {
        type: 'order',
        prompt: 'Put the triads of {k:C major} in order up the scale, from {c:C}.',
        tiles: ['{c:C}', '{c:Dm}', '{c:Em}', '{c:F}', '{c:G}', '{c:Am}', '{c:Bdim}'],
        explain: 'One triad on each degree, from notes of the scale: major, minor, minor, major, major, minor, diminished.',
      },
    },
    {
      id: 'triads-c-major-321',
      front: 'Where are the root-position triads of {k:C major} on strings 3-2-1?',
      back: '{c:C} 5-5-3, {c:Dm} 7-6-5, {c:Em} 9-8-7, {c:F} 10-10-8, {c:G} 12-12-10, {c:Am} 14-13-12.',
    },
    {
      id: 'triads-shape-changes',
      front: 'Why does the triad shape change as you climb a key on one string set?',
      back: 'Major, minor and diminished triads have different shapes, so each chord\'s quality decides its shape.',
    },
  ],
};

/** Unit 18 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'Triads and inversions',
  theme: 'chords',
  description: 'The four kinds of triad, inversions and slash names, and compact triad shapes across the neck.',
  lessons: [fourTriads, triadInversions, majorTriads321, minorTriads321, triads432, theKeyOnOneStringSet],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      {
        type: 'match-pairs',
        prompt: 'Match each triad with its formula.',
        pairs: [
          { left: 'Major', right: '{d:1} {d:3} {d:5}' },
          { left: 'Minor', right: '{d:1} {d:b3} {d:5}' },
          { left: 'Diminished', right: '{d:1} {d:b3} {d:b5}' },
          { left: 'Augmented', right: '{d:1} {d:3} {d:#5}' },
        ],
        explain: 'Minor lowers the 3rd; diminished lowers the 3rd and the 5th; augmented raises the 5th.',
      },
      {
        type: 'choice',
        prompt: 'Which triad is two minor 3rds stacked?',
        options: [
          { text: 'Diminished', correct: true },
          { text: 'Minor', why: 'Minor puts a major 3rd on top of the minor one.' },
          { text: 'Augmented', why: 'Augmented is two major 3rds.' },
          { text: 'Major', why: 'Major is a major 3rd, then a minor 3rd.' },
        ],
        explain: 'Two minor 3rds give root, {d:b3} and {d:b5}: diminished.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Complete {c:Cdim}.',
        text: '{n:C}  ___  ___',
        blanks: ['{n:Eb}', '{n:Gb}'],
        bank: ['{n:D#}', '{n:F#}', '{n:E}', '{n:G}'],
        spelling: 'exact',
        explain: '{c:Cdim} is {n:C} {n:Eb} {n:Gb}: two minor 3rds, on the letters C, E and G.',
      },
      {
        type: 'choice',
        prompt: 'Which inversion is {c:D/F#}?',
        options: [
          { text: 'First inversion', correct: true },
          { text: 'Second inversion', why: 'Second inversion has the 5th, {n:A}, in the bass.' },
          { text: 'Root position', why: 'Root position has {n:D} in the bass.' },
        ],
        shuffle: false,
        explain: '{n:F#} is the 3rd of {c:D}, and the 3rd in the bass is first inversion.',
      },
      {
        type: 'type-answer',
        prompt: 'Write {c:C} in second inversion as a slash chord.',
        answer: { kind: 'chord', value: 'C/G', spelling: 'exact' },
        input: 'keyboard',
        explain: 'Second inversion puts the 5th in the bass. The 5th of {c:C} is {n:G}: {c:C/G}.',
      },
      {
        type: 'chord-build',
        task: 'fingers',
        chord: 'G/D',
        frets: [null, null, null, 7, 8, 7],
        accept: 'this-shape',
        prompt: 'Build {c:G} in second inversion on strings 3, 2 and 1.',
        explain: '{n:D} on string 3 at fret 7, {n:G} on string 2 at fret 8, {n:B} on string 1 at fret 7.',
      },
      {
        type: 'choice',
        prompt: '{c:G} on strings 3-2-1 has the shapes 4-3-3, 7-8-7 and 12-12-10. Which is root position?',
        options: [
          { text: '12-12-10', correct: true },
          { text: '7-8-7', why: 'Its lowest note is {n:D}, the 5th: second inversion.' },
          { text: '4-3-3', why: 'Its lowest note is {n:B}, the 3rd: first inversion.' },
        ],
        shuffle: false,
        explain: 'At 12-12-10 the lowest note is {n:G} on string 3: root position.',
      },
      {
        type: 'order',
        prompt: 'Climbing strings 3-2-1 from a first-inversion shape, put the shapes in the order you meet them.',
        tiles: ['1st inversion', '2nd inversion', 'Root position'],
        explain: 'First inversion, second inversion, root position, then round again 12 frets higher.',
      },
      {
        type: 'chord-build',
        task: 'fingers',
        chord: 'Gm',
        frets: [null, null, null, 12, 11, 10],
        accept: 'this-shape',
        prompt: 'Build {c:Gm} in root position on strings 3, 2 and 1.',
        explain: 'The {c:G} shape 12-12-10 with its 3rd lowered one fret: 12-11-10, {n:G} {n:Bb} {n:D}.',
      },
      {
        type: 'choice',
        prompt: 'On strings 4-3-2, which chord and inversion is 7-5-6?',
        options: [
          { text: '{c:F}, first inversion', correct: true },
          { text: '{c:F}, root position', why: 'Root position {c:F} is 3-2-1, with {n:F} lowest.' },
          { text: '{c:Am}, root position', why: 'The notes are {n:A} {n:C} {n:F}; {c:Am} needs {n:E}.' },
        ],
        explain: '{n:A} {n:C} {n:F} is {c:F} with its 3rd lowest: first inversion.',
      },
      {
        type: 'true-false',
        statement: 'Triad shapes on strings 4-3-2 are the same as on strings 3-2-1.',
        answer: false,
        explain: 'The narrow gap between strings 3 and 2 sits at the top of one set and the bottom of the other, so the shapes differ.',
      },
      {
        type: 'choice',
        prompt: 'In {k:C major}, which chord is at frets 10-10-8 on strings 3-2-1?',
        options: [
          { text: '{c:F}', correct: true },
          { text: '{c:G}', why: '{c:G} is at 12-12-10.' },
          { text: '{c:Em}', why: '{c:Em} is at 9-8-7.' },
        ],
        explain: '{n:F} {n:A} {n:C}: {c:F}, the {r:IV} chord.',
      },
      {
        type: 'choice',
        prompt: 'Moving a root-position triad up the {k:C major} scale on one string set, which chord comes after {c:Em}?',
        options: [
          { text: '{c:F}', correct: true },
          { text: '{c:Fm}', why: 'The chord on degree 4 of a major key is major.' },
          { text: '{c:G}', why: '{c:G} comes after {c:F}.' },
          { text: '{c:F#m}', why: '{n:F#} is not in {k:C major}.' },
        ],
        explain: 'Up the scale: {c:C} {c:Dm} {c:Em} {c:F} {c:G} {c:Am} {c:Bdim}.',
      },
      { generate: 'chord-tones', params: { types: ['major', 'minor', 'dim', 'aug'], roots: ['C', 'G', 'D', 'F', 'A', 'E'], ask: 'notes' } },
      { generate: 'chord-quality-ear', params: { types: ['major', 'minor', 'dim', 'aug'] } },
    ],
  },
};

export default unit;
