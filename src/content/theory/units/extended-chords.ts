/**
 * Theory Path, unit 31: Extended chords: 9, 11 and 13. Written from the syllabus entries in
 * `src/content/plan/theory-path.json` (unit `extended-chords`), one lesson per entry, in order:
 * each lesson opens with the "on the guitar" picture, asks the planned exercises, ends with the
 * planned drill, and turns every planned fact into a review card.
 *
 * Every spelling, degree, shape and diatonic claim is cross-checked against `@/core/theory` and
 * `@/core/guitar` in `extended-chords.test.ts`.
 *
 * Notes for readers of the code:
 * - `teaches` is shown as plain text on the map, so it spells symbols out in words ("sharp 11").
 * - A chord figure always prints the chord's name, so no question uses one as an answer option.
 * - The natural-11 versus sharp-11 listening question plays close voicings (C E G B with F or F#
 *   on top): there the natural 11 sits a minor 9th above the 3rd, which is exactly the clash the
 *   lesson describes. The library guitar shapes would move the 11 below the 3rd.
 */
import type { Lesson, Unit } from '@/lessons';

const U = 'extended-chords';

/** Roots easiest first: open-chord keys, then the flat side. */
const ROOTS = ['C', 'G', 'D', 'A', 'F', 'E'];

const beyondTheSeventh: Lesson = {
  id: 'beyond-the-seventh',
  title: 'Beyond the seventh',
  teaches: 'Extended chords keep stacking thirds above the 7th, adding the 9th, 11th and 13th.',
  minutes: 3,
  skill: `theory:${U}:beyond-the-seventh`,
  steps: [
    {
      type: 'card',
      title: 'Keep stacking thirds',
      body: 'A {t:seventh-chord} is three thirds stacked on a root: {c:C7} is {n:C} {n:E} {n:G} {n:Bb}. Keep going, a third at a time: {n:D}, {n:F}, {n:A}. Those notes are the 9th, 11th and 13th, and chords that use them are {t:extended-chord|extended chords}.',
      figure: {
        kind: 'fretboard',
        frets: [0, 5],
        root: 'C',
        labels: 'degree',
        dots: [
          { string: 5, fret: 3, note: 'C3', degree: '1', role: 'root' },
          { string: 4, fret: 2, note: 'E3', degree: '3', role: 'third' },
          { string: 3, fret: 0, note: 'G3', degree: '5', role: 'fifth' },
          { string: 3, fret: 3, note: 'Bb3', degree: 'b7', role: 'seventh' },
          { string: 2, fret: 3, note: 'D4', degree: '9', role: 'tone' },
          { string: 1, fret: 1, note: 'F4', degree: '11', role: 'tone' },
          { string: 1, fret: 5, note: 'A4', degree: '13', role: 'tone' },
        ],
        caption: '{n:C} stacked in thirds, low to high: 1 3 5 {d:b7} 9 11 13.',
      },
    },
    {
      type: 'card',
      title: 'Hear the stack',
      body: 'Listen to the seven notes rolled from the bottom up. Each one is a third above the last. Up to {n:Bb} it is {c:C7}; the top three notes are the {t:extension|extensions}.',
      figure: { kind: 'audio', sound: { kind: 'notes', notes: ['C3', 'E3', 'G3', 'Bb3', 'D4', 'F4', 'A4'], tempo: 200 }, label: 'Hear the stack, low to high' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Stack thirds up from {n:C}. Which note is missing?',
      text: '{n:C}  {n:E}  {n:G}  {n:Bb}  ___  {n:F}  {n:A}',
      blanks: ['{n:D}'],
      bank: ['{n:B}', '{n:C#}', '{n:Eb}'],
      explain: 'A third above {n:Bb} is {n:D}: the 9th. Then come {n:F}, the 11th, and {n:A}, the 13th.',
    },
    {
      type: 'card',
      title: 'Past the octave',
      body: 'Count on past the octave and the numbers keep going: the 8th is the root again, so the **9th** is the 2nd, the **11th** the 4th and the **13th** the 6th, one octave higher. Take away 7 to find the simple note: in {n:C}, {n:D}, {n:F} and {n:A}.',
      figure: {
        kind: 'keyboard',
        keys: [
          { note: 'C4', label: '1', role: 'root' },
          { note: 'D4', label: '2' },
          { note: 'C5', label: '8', role: 'root' },
          { note: 'D5', label: '9', role: 'target' },
        ],
        from: 'C4',
        // Ends on the 9th: a tenth white key is cropped at phone width.
        to: 'D5',
        caption: 'The 9th is the 2nd, an octave higher.',
      },
    },
    {
      type: 'choice',
      prompt: 'The 13th is which note of the scale, an octave higher?',
      options: [
        { text: 'The 6th', correct: true },
        { text: 'The 3rd', why: 'The 3rd an octave up is the 10th. Take away 7: 13 is the 6th.' },
        { text: 'The 5th', why: 'The 5th an octave up is the 12th.' },
        { text: 'The 7th', why: 'The 7th an octave up would be the 14th.' },
      ],
      explain: 'Take away 7 from a number above the octave to find its simple name: 13 − 7 = 6. Over {n:C}, the 13th is {n:A}.',
      fact: 'extended-octave-up',
    },
    {
      type: 'true-false',
      statement: 'Over a {n:C} root, the 11th is {n:F}.',
      answer: true,
      explain: 'The 11th is the 4th an octave higher. The 4th above {n:C} is {n:F}.',
      fact: 'extended-octave-up',
    },
    {
      type: 'card',
      title: '9 or add9?',
      body: 'A chord named **9** has the 7th as well: {c:C9} is {n:C} {n:E} {n:G} {n:Bb} {n:D}. When the 9th is added to a plain triad with no 7th, the name says **add**: {c:Cadd9} is {n:C} {n:E} {n:G} {n:D}, an {t:added-note-chord}.',
      figure: { kind: 'chord', symbol: 'Cadd9', frets: 'x32030', caption: '{c:Cadd9} (x32030): open {c:C} with {n:D} on string 2.' },
    },
    {
      type: 'choice',
      prompt: 'Which of these chords has a {n:Bb} in it?',
      options: [
        { text: '{c:C9}', correct: true },
        { text: '{c:Cadd9}', why: 'add9 means a 9th on a plain triad: {n:C} {n:E} {n:G} {n:D}, with no 7th.' },
        { text: '{c:Cmaj9}', why: '{c:Cmaj9} has the major 7th, {n:B}, not {n:Bb}.' },
        { text: '{c:C}', why: 'A plain {c:C} is just {n:C} {n:E} {n:G}.' },
      ],
      explain: 'A 9 chord always contains a 7th: {c:C9} is {c:C7} plus {n:D}, so it has {n:Bb}. {c:Cadd9} has the 9th but no 7th.',
      fact: 'extended-nine-vs-add9',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each extension of a {n:C} chord with its note.',
      pairs: [
        { left: '9th', right: '{n:D}' },
        { left: '11th', right: '{n:F}' },
        { left: '13th', right: '{n:A}' },
      ],
      explain: 'The 9th, 11th and 13th are the 2nd, 4th and 6th an octave up: over {n:C}, {n:D}, {n:F} and {n:A}.',
    },
    { generate: 'chord-tones', params: { types: ['9', 'add9'], roots: ROOTS, ask: 'notes' } },
    { generate: 'chord-tones', params: { types: ['9', 'add9'], roots: ROOTS, ask: 'name' } },
  ],
  facts: [
    {
      id: 'extended-stacking',
      front: 'What is an extended chord?',
      back: 'A seventh chord with more thirds stacked on top: the 9th, the 11th and the 13th.',
    },
    {
      id: 'extended-nine-vs-add9',
      front: 'What is the difference between {c:C9} and {c:Cadd9}?',
      back: '{c:C9} has a 7th under its 9th: {n:C} {n:E} {n:G} {n:Bb} {n:D}. {c:Cadd9} has the 9th and no 7th: {n:C} {n:E} {n:G} {n:D}.',
      ask: {
        type: 'choice',
        prompt: 'Which chord has a 9th but no 7th?',
        options: [
          { text: '{c:Gadd9}', correct: true },
          { text: '{c:G9}', why: 'A 9 chord always has a 7th: {c:G9} is {n:G} {n:B} {n:D} {n:F} {n:A}.' },
          { text: '{c:Gmaj9}', why: '{c:Gmaj9} has the major 7th, {n:F#}.' },
        ],
        explain: 'add9 puts the 9th on a plain triad: {c:Gadd9} is {n:G} {n:B} {n:D} {n:A}, with no 7th.',
      },
    },
    {
      id: 'extended-octave-up',
      front: 'Which simple notes are the 9th, 11th and 13th?',
      back: 'The 2nd, 4th and 6th, an octave higher. Over {n:C}: {n:D}, {n:F} and {n:A}.',
    },
  ],
};

const ninthChords: Lesson = {
  id: 'ninth-chords',
  title: 'Ninth chords',
  teaches: 'The three main ninth chords are the dominant 9, major 9 and minor 9, each a seventh chord plus the 9th.',
  minutes: 3,
  skill: `theory:${U}:ninth-chords`,
  steps: [
    {
      type: 'card',
      title: 'Three ninths',
      body: 'Add a 9th to the three main seventh chords and you get the three main ninth chords: **dominant 9** {c:C9}, **major 9** {c:Cmaj9} and **minor 9** {c:Cm9}. Each keeps its seventh chord and adds the same 9th: {n:D} above {n:C}.',
      figure: { kind: 'chord', symbol: 'C9', frets: 'x32333', caption: '{c:C9} (x32333): the 9th, {n:D}, is on string 2.' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each ninth chord with its notes.',
      pairs: [
        { left: '{c:C9}', right: '{n:C} {n:E} {n:G} {n:Bb} {n:D}' },
        { left: '{c:Cmaj9}', right: '{n:C} {n:E} {n:G} {n:B} {n:D}' },
        { left: '{c:Cm9}', right: '{n:C} {n:Eb} {n:G} {n:Bb} {n:D}' },
      ],
      explain: '{c:C9} is {c:C7} plus {n:D}; {c:Cmaj9} is {c:Cmaj7} plus {n:D}; {c:Cm9} is {c:Cm7} plus {n:D}.',
      fact: 'extended-ninth-spellings',
    },
    {
      type: 'type-answer',
      prompt: 'Type the 9th of {c:A9}.',
      answer: { kind: 'note', value: 'B', spelling: 'exact' },
      input: 'keypad',
      explain: 'The 9th is the 2nd an octave up: a whole step above {n:A} is {n:B}. {c:A9} is {n:A} {n:C#} {n:E} {n:G} {n:B}.',
    },
    {
      type: 'card',
      title: 'Four fingers, five notes',
      body: 'Guitar 9th chords often leave out the 5th so the 9th fits under four fingers. {c:Cmaj9} (x3243x) and {c:Cm9} (x3133x) both skip it: root, 3rd, 7th and 9th from string 5 up. The {c:C9} grip keeps its 5th, the {n:G} on top.',
      figure: { kind: 'chord', symbol: 'Cmaj9', frets: 'x3243x', caption: '{c:Cmaj9} (x3243x): root, 3rd, 7th and 9th, no 5th.' },
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'C9',
      frets: 'x32333',
      accept: 'any-voicing',
      prompt: 'Place {c:C9}: x32333.',
      explain: 'Fret 3 on string 5 ({n:C}), fret 2 on string 4 ({n:E}), then fret 3 across strings 3, 2 and 1: {n:Bb}, {n:D} and {n:G}.',
      fact: 'extended-c9-shape',
    },
    {
      type: 'listen-choice',
      prompt: 'Listen. Is this a dominant 9 or a minor 9 chord?',
      sound: { kind: 'chord', chord: 'Cm9', frets: 'x3133x' },
      options: [{ text: 'Dominant 9' }, { text: 'Minor 9', correct: true }],
      shuffle: false,
      explain: 'That was {c:Cm9} (x3133x): its minor 3rd, {n:Eb}, gives the softer, darker colour. {c:C9} has {n:E} and sounds brighter and bluesier.',
    },
    {
      type: 'choice',
      prompt: 'Which note does {c:Cmaj9} have that {c:C9} does not?',
      options: [
        { text: '{n:B}', correct: true },
        { text: '{n:Bb}', why: '{n:Bb}, the minor 7th, belongs to {c:C9}.' },
        { text: '{n:D}', why: 'Both have the 9th, {n:D}.' },
        { text: '{n:Eb}', why: '{n:Eb} is the 3rd of {c:Cm9}.' },
      ],
      explain: 'The two chords differ only in their 7th: {c:Cmaj9} has the major 7th {n:B}, {c:C9} the minor 7th {n:Bb}.',
      fact: 'extended-ninth-spellings',
    },
    {
      type: 'choice',
      prompt: 'Why do many guitar 9th chords leave out the 5th?',
      options: [
        { text: 'So the 9th fits under four fingers', correct: true },
        { text: 'Because the 5th clashes with the 9th', why: 'The 5th and the 9th are a 5th apart: no clash. It is dropped for room, not for sound.' },
        { text: 'To make the chord minor', why: 'Major or minor is set by the 3rd, which stays.' },
      ],
      explain: 'The 5th adds the least colour, so it is the first note to go when a chord has more notes than you have fingers.',
      fact: 'extended-ninth-no-fifth',
    },
    {
      type: 'play-chord',
      prompt: 'Strum {c:Cm9} (x3133x) once and let it ring.',
      chord: 'Cm9',
      frets: 'x3133x',
      explain: 'Middle finger on fret 3 of string 5, index on fret 1 of string 4, ring and little fingers on fret 3 of strings 3 and 2. Strings 6 and 1 stay silent.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'Cm9',
        frets: 'x3133x',
        accept: 'any-voicing',
        prompt: 'Build {c:Cm9}: root {n:C} on string 5, then {n:Eb}, {n:Bb} and {n:D}.',
        explain: '{c:Cm9} (x3133x): {n:C} at fret 3 of string 5, {n:Eb} at fret 1 of string 4, {n:Bb} and {n:D} at fret 3 of strings 3 and 2.',
      },
    },
    { generate: 'chord-tones', params: { types: ['9', 'maj9', 'm9'], roots: ROOTS, ask: 'notes' } },
    { generate: 'chord-quality-ear', params: { types: ['9', 'm9', 'maj9'] } },
  ],
  facts: [
    {
      id: 'extended-ninth-spellings',
      front: 'Spell {c:C9}, {c:Cmaj9} and {c:Cm9}.',
      back: '{c:C9}: {n:C} {n:E} {n:G} {n:Bb} {n:D}. {c:Cmaj9}: {n:C} {n:E} {n:G} {n:B} {n:D}. {c:Cm9}: {n:C} {n:Eb} {n:G} {n:Bb} {n:D}.',
      ask: {
        type: 'match-pairs',
        prompt: 'Match each ninth chord with its notes.',
        pairs: [
          { left: '{c:G9}', right: '{n:G} {n:B} {n:D} {n:F} {n:A}' },
          { left: '{c:Gmaj9}', right: '{n:G} {n:B} {n:D} {n:F#} {n:A}' },
          { left: '{c:Gm9}', right: '{n:G} {n:Bb} {n:D} {n:F} {n:A}' },
        ],
        explain: 'Each is its seventh chord plus the 9th, {n:A}: {c:G7}, {c:Gmaj7} and {c:Gm7}.',
      },
    },
    {
      id: 'extended-c9-shape',
      front: 'What is a common {c:C9} shape with its root on string 5?',
      back: 'x32333: {n:C} on string 5, {n:E} on 4, then {n:Bb}, {n:D} and {n:G} across fret 3.',
      figure: { kind: 'chord', symbol: 'C9', frets: 'x32333' },
    },
    {
      id: 'extended-ninth-no-fifth',
      front: 'Why do guitar 9th chords often leave out the 5th?',
      back: 'So the 9th fits under four fingers. The 5th adds the least colour, so it is the first note to go.',
    },
  ],
};

const elevenths: Lesson = {
  id: 'elevenths',
  title: 'Elevenths: natural and sharp',
  teaches: 'Minor chords take a natural 11; major and dominant ones usually take a sharp 11, clear of the 3rd.',
  minutes: 4,
  skill: `theory:${U}:elevenths`,
  steps: [
    {
      type: 'card',
      title: 'An 11th on a minor chord',
      body: 'Play {c:Am11} (530000): {n:A} {n:C} {n:D} {n:G} {n:B} {n:E} from string 6 up. The open {n:D} is the 11th, and it rings sweetly: on a minor chord the 11th sits a whole step above the minor 3rd, not a half step, so there is no harsh rub.',
      figure: { kind: 'chord', symbol: 'Am11', frets: '530000', caption: '{c:Am11} (530000): the open {n:D} on string 4 is the 11th.' },
    },
    {
      type: 'type-answer',
      prompt: 'Type the 11th of {c:Dm11}.',
      answer: { kind: 'note', value: 'G', spelling: 'exact' },
      input: 'keypad',
      explain: 'The 11th is the 4th an octave up: the 4th above {n:D} is {n:G}. {c:Dm11} is {n:D} {n:F} {n:A} {n:C} {n:E} {n:G}.',
      fact: 'extended-minor-eleven',
    },
    {
      type: 'card',
      title: 'The clash on a major chord',
      body: 'On a major or dominant chord the natural 11 is trouble. In {c:Cmaj7} the 11th is {n:F}, a minor 9th above the 3rd, {n:E}: a sharp rub. Raise it to {n:F#}, the {d:#11}, and the chord rings: {c:Cmaj7#11} is {n:C} {n:E} {n:G} {n:B} {n:F#}.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['Cmaj7add11', 'Cmaj7#11'], voicing: 'close', beats: 4, tempo: 60 }, label: 'Natural 11, then sharp 11' },
    },
    {
      type: 'listen-choice',
      prompt: 'Listen: {c:Cmaj7} with an 11th on top, in two versions. Which one has the rub: the first or the second?',
      sound: { kind: 'progression', chords: ['Cmaj7#11', 'Cmaj7add11'], voicing: 'close', beats: 4, tempo: 60 },
      options: [{ text: 'The first' }, { text: 'The second', correct: true }],
      shuffle: false,
      explain: 'The second had the natural 11, {n:F}, a minor 9th above the 3rd {n:E}: that is the rub. The first had {n:F#}, the {d:#11}, which rings smoothly.',
    },
    {
      type: 'true-false',
      statement: 'The natural 11 is a common addition to major 7th chords.',
      answer: false,
      explain: 'On {c:Cmaj7} the natural 11, {n:F}, clashes with the 3rd, {n:E}. Players use the {d:#11}, {n:F#}, instead.',
      fact: 'extended-eleven-clash',
    },
    {
      type: 'card',
      title: 'An easy sharp 11',
      body: '{c:Fmaj7#11} is an easy open shape: xx3200. Strings 4 and 3 give {n:F} and {n:A}; the open {n:B} is the {d:#11} and the open {n:E} is the major 7th. There is no 5th, and nobody misses it.',
      figure: { kind: 'chord', symbol: 'Fmaj7#11', frets: 'xx3200', caption: '{c:Fmaj7#11} (xx3200): the open {n:B} on string 2 is the {d:#11}.' },
    },
    {
      type: 'choice',
      prompt: 'Which 11th does a dominant chord such as {c:G7} usually take?',
      options: [
        { text: 'The sharp 11, {n:C#}', correct: true },
        { text: 'The natural 11, {n:C}', why: '{n:C} sits a minor 9th above the 3rd, {n:B}, and clashes with it.' },
        { text: 'No 11th is possible', why: 'The {d:#11} is common: {c:G7#11} is {n:G} {n:B} {n:D} {n:F} {n:C#}.' },
      ],
      explain: 'Major and dominant chords have a major 3rd, which clashes with the natural 11. The {d:#11} avoids that: over {n:G} it is {n:C#}. A dominant that keeps the natural 11 usually drops its 3rd: a {t:suspended-chord|sus} chord.',
      fact: 'extended-sharp-eleven',
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete {c:Cmaj7#11}.',
      text: '{n:C}  {n:E}  {n:G}  {n:B}  ___',
      blanks: ['{n:F#}'],
      bank: ['{n:F}', '{n:Gb}', '{n:D}'],
      spelling: 'exact',
      explain: 'The 11th of {n:C} is {n:F}; raised a half step it is {n:F#}. An 11th above {n:C} is always some kind of F, so it is spelled {n:F#}, not {n:Gb}.',
      fact: 'extended-sharp-eleven',
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'Fmaj7#11',
      frets: 'xx3200',
      accept: 'any-voicing',
      prompt: 'Build {c:Fmaj7#11}: {n:F} and {n:A} on strings 4 and 3, strings 2 and 1 open, strings 6 and 5 not played.',
      explain: 'xx3200: {n:F} at fret 3 of string 4, {n:A} at fret 2 of string 3, then the open {n:B} ({d:#11}) and {n:E} (the major 7th).',
    },
    { generate: 'chord-tones', params: { types: ['m11', 'maj7sharp11'], roots: ['A', 'D', 'E', 'C', 'G', 'F'], ask: 'notes' } },
  ],
  facts: [
    {
      id: 'extended-eleven-clash',
      front: 'Why is the natural 11 usually avoided on major and dominant chords?',
      back: 'It sits a minor 9th above the 3rd ({n:F} over {n:E} in {n:C}) and clashes with it.',
    },
    {
      id: 'extended-minor-eleven',
      front: 'Which chords take the natural 11 easily? Spell {c:Am11}.',
      back: 'Minor chords: their 11th sits a whole step above the minor 3rd, not a half step, so it does not clash. {c:Am11} is {n:A} {n:C} {n:E} {n:G} {n:B} {n:D}.',
    },
    {
      id: 'extended-sharp-eleven',
      front: 'Which 11th do major and dominant chords usually take? Spell {c:Cmaj7#11}.',
      back: 'The {d:#11}: {c:Cmaj7#11} is {n:C} {n:E} {n:G} {n:B} {n:F#}.',
      ask: {
        type: 'type-answer',
        prompt: 'Type the {d:#11} of {c:Gmaj7#11}.',
        answer: { kind: 'note', value: 'C#', spelling: 'exact' },
        input: 'keypad',
        explain: 'The 11th of {n:G} is {n:C}; raised a half step it is {n:C#}.',
      },
    },
  ],
};

const thirteenths: Lesson = {
  id: 'thirteenths',
  title: 'Thirteenth chords',
  teaches: 'A 13th chord is a dominant 9 plus the 13th, usually without the 11th; on guitar four notes do the job.',
  minutes: 3,
  skill: `theory:${U}:thirteenths`,
  steps: [
    {
      type: 'card',
      title: 'The 13th on top',
      body: 'A 13th chord is a dominant 9 with the 13th on top: {c:C13} is {n:C} {n:E} {n:G} {n:Bb} {n:D} {n:A}. The 11th is normally left out: it clashes with the 3rd. On guitar four notes are enough: root, {d:b7}, 3rd and 13th, as in this {c:G13}.',
      figure: {
        kind: 'fretboard',
        frets: [2, 6],
        root: 'G',
        labels: 'degree',
        dots: [
          { string: 6, fret: 3, note: 'G2', degree: '1', role: 'root' },
          { string: 4, fret: 3, note: 'F3', degree: 'b7', role: 'seventh' },
          { string: 3, fret: 4, note: 'B3', degree: '3', role: 'third' },
          { string: 2, fret: 5, note: 'E4', degree: '13', role: 'tone' },
        ],
        caption: '{c:G13} (3x345x): root, {d:b7}, 3rd and 13th.',
      },
    },
    {
      type: 'card',
      title: 'One finger up',
      body: 'Play {c:G7} as 3x343x: root, {d:b7}, 3rd and 5th. Now move the note on string 2 up two frets, from {n:D} to {n:E}. The 5th becomes the 13th, and {c:G7} becomes {c:G13} (3x345x).',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['G7', 'G13'], beats: 4, tempo: 60 }, label: 'Hear {c:G7}, then {c:G13}' },
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'G13',
      frets: '3x345x',
      accept: 'any-voicing',
      prompt: 'Turn {c:G7} (3x343x) into {c:G13}: move the note on string 2 up two frets.',
      // A chord picture, not a sound: a step with an audio figure is left out when the sound is off.
      figure: { kind: 'chord', symbol: 'G7', frets: '3x343x', caption: 'Start from {c:G7} (3x343x): the {n:D} on string 2 is the 5th.' },
      explain: '{c:G13} is 3x345x: {n:G} on string 6, {n:F} on string 4, {n:B} on string 3 and {n:E} at fret 5 of string 2.',
      fact: 'extended-g13-shape',
    },
    {
      type: 'choice',
      prompt: 'Which note does {c:G13} (3x345x) add to {c:G7} (3x343x)?',
      options: [
        { text: '{n:E}', correct: true },
        { text: '{n:D}', why: '{n:D} is the 5th of {c:G7}: the note that gives way.' },
        { text: '{n:A}', why: '{n:A} is the 9th of {n:G}; this four-note shape has none.' },
        { text: '{n:C}', why: '{n:C} is the 11th, normally left out of a 13th chord.' },
      ],
      explain: 'String 2 moves from fret 3 to fret 5: {n:D}, the 5th, becomes {n:E}, the 13th (the 6th an octave up).',
    },
    {
      type: 'listen-choice',
      prompt: 'Listen. Is this {c:G7} or {c:G13}?',
      sound: { kind: 'chord', chord: 'G13', frets: '3x345x' },
      options: [{ text: '{c:G7}' }, { text: '{c:G13}', correct: true }],
      shuffle: false,
      explain: 'That was {c:G13}: the {n:E} on top, a whole step above where the 5th would be, gives it its warm, jazzy brightness.',
    },
    {
      type: 'true-false',
      statement: '{c:C6} and {c:C13} are the same chord.',
      answer: false,
      explain: '{c:C6} is {n:C} {n:E} {n:G} {n:A}, a {t:sixth-chord} with no 7th. {c:C13} has the {d:b7}, {n:Bb}, too (and usually the 9th): it is a dominant chord.',
      fact: 'extended-six-vs-thirteen',
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete {c:C13} as it is usually spelled.',
      text: '{n:C}  {n:E}  {n:G}  ___  {n:D}  ___',
      blanks: ['{n:Bb}', '{n:A}'],
      bank: ['{n:B}', '{n:F}', '{n:Ab}'],
      explain: '{c:C13} is {c:C9} ({n:C} {n:E} {n:G} {n:Bb} {n:D}) with the 13th, {n:A}, on top. The 11th, {n:F}, is left out.',
      fact: 'extended-thirteen-spelling',
    },
    {
      type: 'choice',
      prompt: 'A chord has a 6th and a {d:b7} above its root. What is it?',
      options: [
        { text: 'A 13th chord', correct: true },
        { text: 'A 6 chord', why: 'A 6 chord has no 7th at all.' },
        { text: 'An add9 chord', why: 'An add9 chord has a 9th, no 6th and no 7th.' },
      ],
      explain: 'With a {d:b7} in the chord, its 6th is named the 13th, and the {d:b7} makes the chord dominant: a 13th chord.',
      fact: 'extended-six-vs-thirteen',
    },
    { generate: 'chord-tones', params: { types: ['13', '9'], roots: ROOTS, ask: 'notes' } },
  ],
  facts: [
    {
      id: 'extended-thirteen-spelling',
      front: 'Spell {c:C13} as it is usually played.',
      back: '{n:C} {n:E} {n:G} {n:Bb} {n:D} {n:A}: the 11th is normally left out.',
    },
    {
      id: 'extended-g13-shape',
      front: 'Which four notes make a guitar 13th chord? Give a {c:G13} shape.',
      back: 'Root, {d:b7}, 3rd and 13th: {c:G13} = 3x345x ({n:G} {n:F} {n:B} {n:E}).',
      ask: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'G13',
        frets: '3x345x',
        accept: 'any-voicing',
        prompt: 'Build {c:G13} with the root on string 6.',
        explain: '3x345x: root {n:G}, {d:b7} {n:F}, 3rd {n:B} and 13th {n:E}.',
      },
    },
    {
      id: 'extended-six-vs-thirteen',
      front: 'What tells a 13th chord from a 6 chord?',
      back: 'The {d:b7}. A chord with a 6th and a {d:b7} is a 13th chord; a 6 chord has no 7th.',
    },
  ],
};

const whatToLeaveOut: Lesson = {
  id: 'what-to-leave-out',
  title: 'What to leave out',
  teaches: 'With too many notes to play, keep the 3rd and 7th; drop the 5th first, then the root, then lesser extensions.',
  minutes: 3,
  skill: `theory:${U}:what-to-leave-out`,
  steps: [
    {
      type: 'card',
      title: 'Six notes, four fingers',
      body: '{c:C13} has six notes: {n:C} {n:E} {n:G} {n:Bb} {n:D} {n:A}. You cannot play them all, so choose. Keep the 3rd and 7th: they make the chord dominant. Drop the 5th first; next the root, if a bass player has it, then lesser extensions. Here the 5th and the 9th go.',
      figure: { kind: 'chord', symbol: 'C13', frets: 'x3x355', caption: '{c:C13} (x3x355): {n:C}, {n:Bb}, {n:E} and {n:A}.' },
    },
    {
      type: 'card',
      title: 'Hear all six',
      body: 'First all six notes of {c:C13}, stacked in thirds. The four-note grip above leaves out {n:G} and {n:D}, and still says {c:C13}: root, 3rd, {d:b7} and 13th carry the sound.',
      figure: { kind: 'audio', sound: { kind: 'notes', notes: ['C3', 'E3', 'G3', 'Bb3', 'D4', 'A4'], together: true }, label: 'Hear all six notes' },
    },
    {
      type: 'choice',
      prompt: 'Which note of a 9th chord is usually dropped first?',
      options: [
        { text: 'The 5th', correct: true },
        { text: 'The 3rd', why: 'The 3rd says major or minor: keep it.' },
        { text: 'The 7th', why: 'The 7th says which kind of seventh chord it is: keep it.' },
        { text: 'The 9th', why: 'The 9th is what makes it a 9th chord.' },
      ],
      explain: 'The 5th is the same in almost every chord, so it adds the least. It goes first.',
      fact: 'extended-drop-order',
    },
    {
      type: 'choice',
      prompt: 'Which two notes define a chord\'s quality?',
      options: [
        { text: 'The 3rd and the 7th', correct: true },
        { text: 'The root and the 5th', why: 'Root and 5th are the same in {c:C7}, {c:Cmaj7} and {c:Cm7}: they cannot tell those apart.' },
        { text: 'The 5th and the 9th', why: 'Neither one says major or minor, or which 7th.' },
      ],
      explain: 'The 3rd says major or minor; the 7th says major 7, minor 7 or dominant. Together they name the chord, so they stay.',
      fact: 'extended-keep-three-seven',
    },
    {
      type: 'card',
      title: 'Lift one finger',
      body: 'The {c:C9} grip x32333 has five notes, and the {n:G} on string 1 is its 5th. Lift that finger, or let it mute the string, and you have a four-note {c:C9}: x3233x. The 3rd, 7th and 9th are all still there.',
      figure: { kind: 'chord', symbol: 'C9', frets: 'x3233x', caption: '{c:C9} (x3233x): no 5th, still {c:C9}.' },
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'C9',
      frets: 'x3233x',
      accept: 'this-shape',
      prompt: 'Start from {c:C9} (x32333) and drop its 5th: mute string 1.',
      figure: { kind: 'chord', symbol: 'C9', frets: 'x32333', caption: 'Start from {c:C9} (x32333).' },
      explain: 'x3233x: {n:C}, {n:E}, {n:Bb} and {n:D}. The {n:G} on string 1 was the 5th, the note you can spare.',
    },
    {
      type: 'true-false',
      statement: 'Root, 3rd, 7th and 13th are enough to sound a 13th chord.',
      answer: true,
      explain: 'The 3rd and {d:b7} make it dominant, the 13th gives it its name and the root says where it stands. The 5th and the 9th can go.',
      fact: 'extended-four-note-thirteen',
    },
    {
      type: 'choice',
      prompt: 'A bass player is playing {n:G}. You play {c:G13} with root, 3rd, {d:b7} and 13th. Which note can you leave out?',
      options: [
        { text: 'The root', correct: true },
        { text: 'The 3rd', why: 'Without the 3rd nobody can tell major from minor.' },
        { text: 'The {d:b7}', why: 'Without the {d:b7} it is a 6 chord, not a 13th.' },
        { text: 'The 13th', why: 'Without the 13th it is just {c:G7}.' },
      ],
      explain: 'The bass already sounds the root, so your grip can skip it: 3rd, {d:b7} and 13th still say {c:G13}.',
      fact: 'extended-drop-order',
    },
    {
      type: 'order',
      prompt: 'You have too many notes for {c:C13}. Put these in the order you would drop them, first to last.',
      tiles: ['The 5th', 'The root', 'The 9th'],
      distractors: ['The 3rd'],
      explain: 'The 5th goes first; then the root, when a bass player has it; then a lesser extension such as the 9th. The 3rd never goes: it makes the chord.',
      fact: 'extended-drop-order',
    },
    { generate: 'chord-tones', params: { types: ['9', '13', 'm9'], roots: ROOTS, ask: 'tone' } },
  ],
  facts: [
    {
      id: 'extended-drop-order',
      front: 'A chord has more notes than you can play. What goes first, second and third?',
      back: 'The 5th first, then the root (especially if a bass player has it), then the less important extensions.',
      ask: {
        type: 'order',
        prompt: 'Put these in the order you would drop them from a big chord, first to last.',
        tiles: ['The 5th', 'The root', 'The 9th'],
        distractors: ['The 7th'],
        explain: 'The 5th first, then the root (when the bass has it), then lesser extensions. The 3rd and 7th stay.',
      },
    },
    {
      id: 'extended-keep-three-seven',
      front: 'Which two notes define a chord\'s quality and are always kept?',
      back: 'The 3rd and the 7th.',
    },
    {
      id: 'extended-four-note-thirteen',
      front: 'Which four notes are enough to sound a 13th chord?',
      back: 'Root, 3rd, {d:b7} and 13th, as in {c:C13} played x3x355.',
    },
  ],
};

const extensionsInAKey: Lesson = {
  id: 'extensions-in-a-key',
  title: 'Which extensions fit the key',
  teaches: 'In a major key a diatonic 9th fits every chord but those on degrees 3 and 7; the chord on 4 takes a sharp 11.',
  minutes: 4,
  skill: `theory:${U}:extensions-in-a-key`,
  steps: [
    {
      type: 'card',
      title: 'Ninths that stay home',
      body: 'Put a 9th on each seventh chord of {k:C major} and check it against the scale. {c:Cmaj9}, {c:Dm9}, {c:Fmaj9}, {c:G9} and {c:Am9} use only notes of the key. Two fail: the 9th of {n:E} is {n:F#}, and the 9th of {n:B} is {n:C#}.',
      figure: { kind: 'chord', symbol: 'Dm9', frets: 'x5355x', caption: '{c:Dm9} (x5355x): {n:D} {n:F} {n:C} {n:E}, all in {k:C major}.' },
    },
    {
      type: 'choice',
      prompt: 'In {k:C major}, is {c:Dm9} diatonic?',
      options: [
        { text: 'Yes: {n:D} {n:F} {n:A} {n:C} {n:E} are all in the key', correct: true },
        { text: 'No: the 9th of {n:D} is {n:Eb}', why: 'The 9th is a whole step above the root: over {n:D} that is {n:E}, which is in the key.' },
        { text: 'No: minor chords cannot take a 9th', why: '{c:Dm9} and {c:Am9} are everyday chords; minor chords take a 9th easily.' },
      ],
      shuffle: false,
      explain: '{c:Dm9} is {n:D} {n:F} {n:A} {n:C} {n:E}: every note is in {k:C major}, so the chord is {t:diatonic}.',
      fact: 'extended-diatonic-ninths',
    },
    {
      type: 'card',
      title: 'Two that leave the key',
      body: 'The {r:iii7} chord, {c:Em7}, would need {n:F#} for its 9th, and the {r:viiø7} chord, {c:Bm7b5}, would need {n:C#}. Neither note is in {k:C major}. So inside the key, {c:Em7} and {c:Bm7b5} go without a natural 9th.',
      figure: {
        kind: 'fretboard',
        frets: [4, 8],
        root: 'E',
        dots: [
          { string: 5, fret: 7, note: 'E', role: 'root' },
          { string: 4, fret: 5, note: 'G', role: 'third' },
          { string: 3, fret: 7, note: 'D', role: 'seventh' },
          { string: 2, fret: 7, note: 'F#', role: 'target' },
        ],
        caption: '{c:Em9} (x7577x): its 9th, {n:F#}, is not in {k:C major}.',
      },
    },
    {
      type: 'choice',
      prompt: 'Which {k:C major} chord cannot take a natural 9 inside the key: {c:Em7} or {c:Am7}?',
      options: [
        { text: '{c:Em7}: its 9th is {n:F#}', correct: true },
        { text: '{c:Am7}: its 9th is {n:Bb}', why: 'A whole step above {n:A} is {n:B}, which is in the key: {c:Am9} is diatonic.' },
      ],
      shuffle: false,
      explain: 'The 9th of {n:E} is {n:F#}, outside {k:C major}. The 9th of {n:A} is {n:B}, inside it.',
      fact: 'extended-em9-outside',
    },
    {
      type: 'card',
      title: 'A sharp 11 inside the key',
      body: '{c:Fmaj7} is the {r:IVmaj7} chord of {k:C major}. Its {d:#11} is {n:B}, a note of the key, so {c:Fmaj7#11} is fully diatonic. That bright, floating sound is Lydian, and every major key has it on degree 4.',
      figure: { kind: 'chord', symbol: 'Fmaj7#11', frets: 'xx3200', caption: '{c:Fmaj7#11} (xx3200): the {d:#11}, {n:B}, is in {k:C major}.' },
    },
    {
      type: 'type-answer',
      prompt: 'Type the {d:#11} of {c:Fmaj7#11}.',
      answer: { kind: 'note', value: 'B', spelling: 'exact' },
      input: 'keypad',
      explain: 'The 11th of {n:F} is {n:Bb}; raised a half step it is {n:B}. {n:B} is the 7th note of {k:C major}, so the chord stays in the key.',
      fact: 'extended-fmaj7-sharp-eleven',
    },
    {
      type: 'true-false',
      statement: '{c:G9} uses only notes of {k:C major}.',
      answer: true,
      explain: '{c:G9} is {n:G} {n:B} {n:D} {n:F} {n:A}: every note is in {k:C major}. It is the key\'s own dominant with a 9th on top.',
      fact: 'extended-diatonic-ninths',
    },
    {
      type: 'card',
      title: 'Three movable grips',
      body: 'Three movable grips, each with its root on string 5: {c:Cmaj9} x3243x, {c:Dm9} x5355x and {c:G9} x-10-9-10-10-x. Play {c:Dm9}, {c:G9}, {c:Cmaj9}: a {r:ii}–{r:V}–{r:I} with a 9th on every chord, all inside the key.',
      figure: { kind: 'chord', symbol: 'G9', frets: 'x-10-9-10-10-x', caption: '{c:G9} (x-10-9-10-10-x): root on string 5, fret 10.' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each chord of {k:C major} with its 9th.',
      pairs: [
        { left: '{c:Cmaj7}', right: '{n:D}' },
        { left: '{c:Dm7}', right: '{n:E}' },
        { left: '{c:G7}', right: '{n:A}' },
        { left: '{c:Em7}', right: '{n:F#}' },
      ],
      explain: 'The 9th is a whole step above the root. Only {n:F#}, the 9th of {c:Em7}, falls outside {k:C major}.',
    },
    { generate: 'diatonic-chord', params: { ask: 'chord', sevenths: true, modes: ['major'], maxAccidentals: 2 } },
    { generate: 'diatonic-chord', params: { ask: 'quality', sevenths: true, modes: ['major'], maxAccidentals: 2 } },
  ],
  facts: [
    {
      id: 'extended-diatonic-ninths',
      front: 'Which ninth chords of {k:C major} use only notes of the key?',
      back: '{c:Cmaj9}, {c:Dm9}, {c:Fmaj9}, {c:G9} and {c:Am9}.',
    },
    {
      id: 'extended-em9-outside',
      front: 'Why is {c:Em9} not diatonic to {k:C major}?',
      back: 'The 9th of {n:E} is {n:F#}, which is not in {k:C major}.',
      ask: {
        type: 'choice',
        prompt: 'Which of these ninth chords is not diatonic to {k:C major}?',
        options: [
          { text: '{c:Em9}', correct: true },
          { text: '{c:Am9}', why: '{c:Am9} is {n:A} {n:C} {n:E} {n:G} {n:B}: all in the key.' },
          { text: '{c:Fmaj9}', why: '{c:Fmaj9} is {n:F} {n:A} {n:C} {n:E} {n:G}: all in the key.' },
        ],
        explain: '{c:Em9} needs {n:F#} for its 9th, and {n:F#} is not in {k:C major}.',
      },
    },
    {
      id: 'extended-fmaj7-sharp-eleven',
      front: 'Is {c:Fmaj7#11} diatonic to {k:C major}? Why?',
      back: 'Yes: the {d:#11} of {n:F} is {n:B}, a note of {k:C major}.',
    },
  ],
};

/** Unit 31 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'Extended chords: 9, 11 and 13',
  theme: 'chords',
  description: 'Ninth, eleventh and thirteenth chords, which notes to keep and drop, and which extensions belong to a key.',
  lessons: [beyondTheSeventh, ninthChords, elevenths, thirteenths, whatToLeaveOut, extensionsInAKey],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      {
        type: 'choice',
        prompt: 'The 11th is which note of the scale, an octave higher?',
        options: [
          { text: 'The 4th', correct: true },
          { text: 'The 2nd', why: 'The 2nd an octave up is the 9th.' },
          { text: 'The 6th', why: 'The 6th an octave up is the 13th.' },
        ],
        explain: 'Take away 7: 11 − 7 = 4. Over {n:C} the 11th is {n:F}.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Stack thirds up from {n:G}. Which note is missing?',
        text: '{n:G}  {n:B}  {n:D}  {n:F}  ___  {n:C}  {n:E}',
        blanks: ['{n:A}'],
        bank: ['{n:G#}', '{n:Bb}', '{n:F#}'],
        explain: 'A third above {n:F} is {n:A}: the 9th of {n:G}. Then {n:C}, the 11th, and {n:E}, the 13th.',
      },
      {
        type: 'choice',
        prompt: 'Which chord has a 9th but no 7th?',
        options: [
          { text: '{c:Dadd9}', correct: true },
          { text: '{c:D9}', why: 'A 9 chord always has a 7th: {c:D9} is {n:D} {n:F#} {n:A} {n:C} {n:E}.' },
          { text: '{c:Dm9}', why: '{c:Dm9} has the 7th {n:C} as well.' },
        ],
        explain: 'add9 is a triad plus the 9th: {c:Dadd9} is {n:D} {n:F#} {n:A} {n:E}.',
      },
      {
        type: 'match-pairs',
        prompt: 'Match each ninth chord with its notes.',
        pairs: [
          { left: '{c:G9}', right: '{n:G} {n:B} {n:D} {n:F} {n:A}' },
          { left: '{c:Gmaj9}', right: '{n:G} {n:B} {n:D} {n:F#} {n:A}' },
          { left: '{c:Gm9}', right: '{n:G} {n:Bb} {n:D} {n:F} {n:A}' },
        ],
        explain: 'Each is its seventh chord plus the 9th, {n:A}.',
      },
      {
        type: 'type-answer',
        prompt: 'Type the 9th of {c:E9}.',
        answer: { kind: 'note', value: 'F#', spelling: 'exact' },
        input: 'keypad',
        explain: 'A whole step above {n:E} is {n:F#}. {c:E9} is {n:E} {n:G#} {n:B} {n:D} {n:F#}.',
      },
      {
        type: 'chord-build',
        task: 'fingers',
        chord: 'C9',
        frets: 'x32333',
        accept: 'any-voicing',
        prompt: 'Build {c:C9} with its root on string 5.',
        explain: 'x32333: {n:C}, {n:E}, then {n:Bb}, {n:D} and {n:G} across fret 3.',
      },
      {
        type: 'true-false',
        statement: 'Major 7th chords usually take the natural 11.',
        answer: false,
        explain: 'The natural 11 sits a minor 9th above the major 3rd and clashes. Major and dominant chords take the {d:#11}.',
      },
      {
        type: 'type-answer',
        prompt: 'Type the 11th of {c:Am11}.',
        answer: { kind: 'note', value: 'D', spelling: 'exact' },
        input: 'keypad',
        explain: 'The 4th above {n:A} is {n:D}, so the 11th is {n:D}. Minor chords take it easily.',
      },
      {
        type: 'choice',
        prompt: 'Which note is the {d:#11} of {c:Cmaj7#11}?',
        options: [
          { text: '{n:F#}', correct: true },
          { text: '{n:F}', why: '{n:F} is the natural 11: it clashes with the 3rd.' },
          { text: '{n:G}', why: '{n:G} is the 5th.' },
        ],
        explain: 'The 11th of {n:C} is {n:F}; raised a half step it is {n:F#}.',
      },
      {
        type: 'chord-build',
        task: 'fingers',
        chord: 'G13',
        frets: '3x345x',
        accept: 'any-voicing',
        prompt: 'Build {c:G13} with four notes: root, {d:b7}, 3rd and 13th.',
        explain: '3x345x: {n:G}, {n:F}, {n:B} and {n:E}.',
      },
      {
        type: 'true-false',
        statement: 'A 13th chord usually leaves out the 11th.',
        answer: true,
        explain: 'On a dominant chord the 11th clashes with the 3rd, so {c:C13} is played {n:C} {n:E} {n:G} {n:Bb} {n:D} {n:A}.',
      },
      {
        type: 'choice',
        prompt: 'Which note of a big chord is usually dropped first?',
        options: [
          { text: 'The 5th', correct: true },
          { text: 'The 3rd', why: 'The 3rd defines major or minor.' },
          { text: 'The 7th', why: 'The 7th defines the kind of seventh chord.' },
        ],
        explain: 'The 5th goes first, then the root (when the bass has it), then lesser extensions.',
      },
      {
        type: 'choice',
        prompt: 'Which ninth chord is not diatonic to {k:C major}?',
        options: [
          { text: '{c:Em9}', correct: true },
          { text: '{c:Dm9}', why: '{n:D} {n:F} {n:A} {n:C} {n:E}: all in the key.' },
          { text: '{c:G9}', why: '{n:G} {n:B} {n:D} {n:F} {n:A}: all in the key.' },
        ],
        explain: 'The 9th of {n:E} is {n:F#}, which is not in {k:C major}.',
      },
      {
        type: 'type-answer',
        prompt: 'Type the {d:#11} of {c:Fmaj7#11}.',
        answer: { kind: 'note', value: 'B', spelling: 'exact' },
        input: 'keypad',
        explain: 'The 11th of {n:F} is {n:Bb}; raised it is {n:B}, a note of {k:C major}.',
      },
      {
        type: 'listen-choice',
        prompt: 'Listen. Is this a dominant 9 or a minor 9 chord?',
        sound: { kind: 'chord', chord: 'C9', frets: 'x32333' },
        options: [{ text: 'Dominant 9', correct: true }, { text: 'Minor 9' }],
        shuffle: false,
        explain: 'That was {c:C9}: its major 3rd, {n:E}, and minor 7th, {n:Bb}, give the bright, bluesy dominant sound.',
      },
      { generate: 'chord-tones', params: { types: ['9', 'maj9', 'm9'], roots: ROOTS, ask: 'notes' } },
    ],
  },
};

export default unit;
