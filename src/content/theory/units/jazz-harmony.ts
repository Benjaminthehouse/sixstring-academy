/**
 * Theory Path, unit 34: Jazz harmony basics. Written from the syllabus entries in
 * `src/content/plan/theory-path.json` (unit `jazz-harmony`), one lesson per entry, in order:
 * each lesson opens with the "on the guitar" picture, asks the planned exercises, ends with a
 * drill or a play step, and turns every planned fact into a review card.
 *
 * Every two-five-one, turnaround, guide tone, shell, drop-2 and drop-3 shape is cross-checked
 * against `@/core/theory` (`romanToChord`, `chordNotes`, `chordTones`) and `@/core/guitar`
 * (`buildVoicing`) in `jazz-harmony.test.ts`, including how each drop voicing is made from its
 * close voicing.
 *
 * Notes for readers of the code:
 * - The `roman-chord` drills ask only for numerals whose chord really sits on that note of the
 *   scale (ii7, V7, Imaj7, vi7, iii7, VI7), because the drill explains a numeral that way.
 * - A play-chord step listens for one chord, so a progression is shown on a card and the play step
 *   asks for one of its chords.
 * - The drop-voicing pictures use the keyboard figure: a staff figure draws notes one after another,
 *   while the keyboard shows the four notes of a close voicing at once.
 */
import type { Lesson, Unit } from '@/lessons';

const U = 'jazz-harmony';

/** Numerals of the two-five-one family whose chord is built on that degree of the major scale. */
const TWO_FIVE_ONE = ['ii7', 'V7', 'Imaj7'];

const majorTwoFiveOne: Lesson = {
  id: 'major-two-five-one',
  title: 'The major two-five-one',
  teaches: 'The major two-five-one is the minor 7th on 2, the dominant 7th on 5 and the major 7th on 1.',
  minutes: 3,
  skill: `theory:${U}:major-two-five-one`,
  steps: [
    {
      type: 'card',
      title: 'Two, five, one',
      body: 'The {t:two-five-one} is the core of jazz harmony: {r:ii7}, {r:V7}, {r:Imaj7}. In {k:G major} play {c:Am7} (x02010), {c:D7} (xx0212), {c:Gmaj7} (3x443x). Each root falls a fifth: {n:A} to {n:D} to {n:G}.',
      figure: { kind: 'circle', key: 'G major', highlight: ['A major', 'D major'], show: 'major', caption: 'Roots {n:A}, {n:D}, {n:G}: one step anticlockwise each time.' },
    },
    {
      type: 'card',
      title: 'Prepare, pull, rest',
      body: 'A minor 7th prepares, a dominant 7th pulls, a major 7th rests. In {k:C major} the same moves are {c:Dm7} {c:G7} {c:Cmaj7}. Listen to the {r:ii}–{r:V}–{r:I} in {k:G major}.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['Am7', 'D7', 'Gmaj7'], beats: 4, tempo: 80 }, label: 'Hear the two-five-one' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the {r:ii}–{r:V}–{r:I} in {k:F major}.',
      text: '{c:Gm7}  ___  {c:Fmaj7}',
      blanks: ['{c:C7}'],
      bank: ['{c:Cmaj7}', '{c:Cm7}', '{c:Bb7}'],
      explain: 'The {r:V7} of {k:F major} is {c:C7}: {n:C} {n:E} {n:G} {n:Bb}. The roots {n:G}, {n:C}, {n:F} fall a fifth each time.',
      fact: 'jazz-major-ii-v-i',
    },
    {
      type: 'type-answer',
      prompt: 'Type the {r:ii} chord of a two-five-one in {k:Bb major}.',
      answer: { kind: 'chord', value: 'Cm7', spelling: 'exact' },
      input: 'keyboard',
      explain: 'The 2nd note of {k:Bb major} is {n:C}, and the {r:ii} of a two-five-one is a minor 7th: {c:Cm7}, then {c:F7}, then {c:Bbmaj7}.',
    },
    {
      type: 'choice',
      prompt: 'How do the roots of a {r:ii}–{r:V}–{r:I} move?',
      options: [
        { text: 'Down a fifth each time', correct: true },
        { text: 'Up a fifth each time', why: 'Up a fifth from {n:D} is {n:A}. The two-five-one goes {n:D}, {n:G}, {n:C}.' },
        { text: 'Down a whole step each time', why: '{n:D} to {n:G} is not a step: it is a fifth down.' },
      ],
      shuffle: false,
      explain: '{n:D} to {n:G} to {n:C}: down a fifth each time, the same as up a fourth. It is often called the strongest root motion in tonal harmony.',
      fact: 'jazz-roots-fall-in-fifths',
    },
    {
      type: 'listen-choice',
      prompt: 'Is this a {r:ii}–{r:V}–{r:I}?',
      sound: { kind: 'progression', chords: ['Em7', 'A7', 'Dmaj7'], beats: 4, tempo: 80 },
      options: [{ text: 'Yes: minor 7, dominant 7, major 7', correct: true }, { text: 'No' }],
      shuffle: false,
      explain: 'Yes: {c:Em7} {c:A7} {c:Dmaj7}, the two-five-one of {k:D major}. The roots fell a fifth each time.',
    },
    {
      type: 'choice',
      prompt: 'A tune runs {c:Em7} {c:A7} {c:Dmaj7}, then {c:Dm7} {c:G7} {c:Cmaj7}. What is happening?',
      options: [
        { text: 'A two-five-one in D, then one in C', correct: true },
        { text: 'All six chords are in {k:C major}', why: '{c:A7} and {c:Dmaj7} need {n:C#} and {n:F#}: the first three are in {k:D major}.' },
        { text: 'All six chords are in {k:D major}', why: '{c:G7} and {c:Cmaj7} need {n:F} and {n:C}: the last three are in {k:C major}.' },
      ],
      explain: 'Many jazz standards move through two-five-ones in several keys. Spot each minor 7, dominant 7, major 7 group and you know where you are.',
      fact: 'jazz-standards-ii-v-i',
    },
    {
      type: 'play-chord',
      prompt: 'Strum {c:Gmaj7} (3x443x), the {r:I} of the two-five-one in {k:G major}.',
      chord: 'Gmaj7',
      frets: '3x443x',
      explain: '3x443x: {n:G} on string 6, then {n:F#}, {n:B} and {n:D}. Mute string 5 with the side of the finger on string 6.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'Gmaj7',
        frets: '3x443x',
        accept: 'any-voicing',
        prompt: 'Build {c:Gmaj7}, the {r:I} of the two-five-one in {k:G major}.',
        explain: '3x443x: {n:G}, string 5 muted, {n:F#} and {n:B} at fret 4, {n:D} at fret 3 of string 2.',
      },
    },
    { generate: 'roman-chord', params: { direction: 'to-chord', numerals: TWO_FIVE_ONE, modes: ['major'], maxAccidentals: 3 } },
  ],
  facts: [
    {
      id: 'jazz-major-ii-v-i',
      front: 'Which chords make the major two-five-one? Give them in {k:C major}.',
      back: '{r:ii7}, {r:V7} and {r:Imaj7}: {c:Dm7} {c:G7} {c:Cmaj7} in {k:C major}.',
      ask: {
        type: 'fill-blanks',
        prompt: 'Complete the {r:ii}–{r:V}–{r:I} in {k:C major}.',
        text: '{c:Dm7}  ___  {c:Cmaj7}',
        blanks: ['{c:G7}'],
        bank: ['{c:Gmaj7}', '{c:Gm7}', '{c:F7}'],
        explain: '{c:Dm7} {c:G7} {c:Cmaj7}: minor 7, dominant 7, major 7.',
      },
    },
    {
      id: 'jazz-roots-fall-in-fifths',
      front: 'How do the roots of a two-five-one move?',
      back: 'Down a fifth each time ({n:D} {n:G} {n:C}), often called the strongest root motion in tonal harmony.',
    },
    {
      id: 'jazz-standards-ii-v-i',
      front: 'What are many jazz standards built from?',
      back: 'Two-five-one progressions, in several keys.',
    },
  ],
};

const minorTwoFiveOne: Lesson = {
  id: 'minor-two-five-one',
  title: 'The minor two-five-one',
  teaches: 'The minor two-five-one uses a half-diminished two, a dominant five (often with a flat 9) and a minor tonic.',
  minutes: 3,
  skill: `theory:${U}:minor-two-five-one`,
  steps: [
    {
      type: 'card',
      title: 'The minor version',
      body: 'In a minor key the {r:ii} is {t:half-diminished}. In {k:A minor} play {c:Bm7b5} (x2323x), {c:E7} (020100), {c:Am6} (x02212). The {r:V7} is the dominant with a major 3rd from {t:harmonic-minor}, and the tonic is minor: {c:Am}, {c:Am6} or {c:AmMaj7}.',
      figure: { kind: 'chord', symbol: 'Bm7b5', frets: 'x2323x', caption: '{c:Bm7b5} (x2323x): {r:iiø7} in {k:A minor}.' },
    },
    {
      type: 'card',
      title: 'Darker all the way',
      body: '{c:Bm7b5} is {n:B} {n:D} {n:F} {n:A}: a diminished triad plus a minor 7th. Hear the minor two-five-one and listen for its shadowy start and its minor landing.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['Bm7b5', 'E7', 'Am6'], beats: 4, tempo: 76 }, label: 'Hear the minor version' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the minor {r:ii}–{r:V}–{r:i} in {k:D minor}.',
      text: '{c:Em7b5}  ___  {c:Dm}',
      blanks: ['{c:A7}'],
      bank: ['{c:Am7}', '{c:Amaj7}', '{c:Gm7}'],
      explain: 'The {r:V7} of {k:D minor} is {c:A7}, with the raised 7th {n:C#} from harmonic minor. {c:Am7} has {n:C} and pulls far less.',
    },
    {
      type: 'choice',
      prompt: 'Which notes make {c:Bm7b5}?',
      options: [
        { text: '{n:B} {n:D} {n:F} {n:A}', correct: true },
        { text: '{n:B} {n:D} {n:F#} {n:A}', why: 'That is {c:Bm7}, with a perfect 5th.' },
        { text: '{n:B} {n:D} {n:F} {n:Ab}', why: 'That is {c:Bdim7}: its 7th is a half step lower.' },
        { text: '{n:B} {n:D#} {n:F} {n:A}', why: 'That has a major 3rd, {n:D#}: not a minor chord at all.' },
      ],
      explain: 'Half-diminished: a minor 3rd ({n:D}), a diminished 5th ({n:F}) and a minor 7th ({n:A}) above {n:B}.',
      fact: 'jazz-half-diminished-spelling',
    },
    {
      type: 'type-answer',
      prompt: 'Type the {d:b9} of {c:E7b9}.',
      answer: { kind: 'note', value: 'F', spelling: 'exact' },
      input: 'keypad',
      explain: 'A 9th above {n:E} is {n:F#}. Flatten it: {n:F}. In {k:A minor} that is just the 6th note of the scale.',
    },
    {
      type: 'true-false',
      statement: '{c:E7b9} sounds natural in {k:A minor} because its {d:b9}, {n:F}, belongs to {n:A} harmonic minor.',
      answer: true,
      explain: '{n:A} harmonic minor is {n:A} {n:B} {n:C} {n:D} {n:E} {n:F} {n:G#}. {c:E7b9}, {n:E} {n:G#} {n:B} {n:D} {n:F}, uses only those notes.',
      fact: 'jazz-flat-nine-in-minor',
    },
    {
      type: 'listen-choice',
      prompt: 'Major two-five-one, or minor two-five-one?',
      sound: { kind: 'progression', chords: ['Bm7b5', 'E7', 'Am'], beats: 4, tempo: 76 },
      options: [{ text: 'Major' }, { text: 'Minor', correct: true }],
      shuffle: false,
      explain: 'Minor: it began on {c:Bm7b5}, half-diminished, and landed on {c:Am}. The major version would be {c:Bm7} {c:E7} {c:Amaj7}.',
    },
    {
      type: 'choice',
      prompt: 'Which is a minor two-five-one in {k:A minor}?',
      options: [
        { text: '{c:Bm7b5} {c:E7} {c:Am6}', correct: true },
        { text: '{c:Bm7} {c:E7} {c:Amaj7}', why: 'That is the major two-five-one of {k:A major}.' },
        { text: '{c:Bm7b5} {c:Em7} {c:Am}', why: '{c:Em7} has {n:G}, not {n:G#}: a minor {r:v} pulls home only weakly.' },
      ],
      explain: '{r:iiø7}, {r:V7}, minor tonic: {c:Bm7b5}, {c:E7}, then {c:Am}, {c:Am6} or {c:AmMaj7}.',
      fact: 'jazz-minor-ii-v-i',
    },
    {
      type: 'play-chord',
      prompt: 'Strum {c:Bm7b5} (x2323x), the {r:iiø7} of {k:A minor}.',
      chord: 'Bm7b5',
      frets: 'x2323x',
      explain: 'x2323x: {n:B}, {n:F}, {n:A} and {n:D}. Strings 6 and 1 stay silent.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'Bm7b5',
        frets: 'x2323x',
        accept: 'any-voicing',
        prompt: 'Build {c:Bm7b5}, the {r:iiø7} of {k:A minor}.',
        explain: 'x2323x: {n:B} at fret 2 of string 5, {n:F} at fret 3, {n:A} at fret 2, {n:D} at fret 3 of string 2.',
      },
    },
    { generate: 'chord-tones', params: { types: ['m7b5', '7b9'], roots: ['B', 'E', 'A', 'F#', 'D', 'C#'], ask: 'notes' } },
  ],
  facts: [
    {
      id: 'jazz-minor-ii-v-i',
      front: 'Which chords make the minor two-five-one in {k:A minor}?',
      back: '{r:iiø7}, {r:V7} and a minor tonic: {c:Bm7b5} {c:E7} {c:Am} (or {c:Am6}, or {c:AmMaj7}).',
      ask: {
        type: 'choice',
        prompt: 'Which is a minor two-five-one in {k:D minor}?',
        options: [
          { text: '{c:Em7b5} {c:A7} {c:Dm}', correct: true },
          { text: '{c:Em7} {c:A7} {c:Dmaj7}', why: 'That is the major two-five-one of {k:D major}.' },
          { text: '{c:Em7b5} {c:Am7} {c:Dm}', why: '{c:Am7} has {n:C}: without {n:C#} it pulls home only weakly.' },
        ],
        explain: '{c:Em7b5} {c:A7} {c:Dm}: half-diminished, dominant, minor.',
      },
    },
    {
      id: 'jazz-half-diminished-spelling',
      front: 'What is a half-diminished chord? Spell {c:Bm7b5}.',
      back: 'A diminished triad plus a minor 7th: {c:Bm7b5} is {n:B} {n:D} {n:F} {n:A}.',
    },
    {
      id: 'jazz-flat-nine-in-minor',
      front: 'Why does a {d:b9} on the dominant sound natural in a minor key?',
      back: 'In {k:A minor}, the {d:b9} of {c:E7}, {n:F}, belongs to {n:A} harmonic minor.',
    },
  ],
};

const guideTones: Lesson = {
  id: 'guide-tones',
  title: 'Guide tones',
  teaches: 'The 3rd and 7th are a chord\'s guide tones; through a two-five-one each 7th falls a half step to the next 3rd.',
  minutes: 4,
  skill: `theory:${U}:guide-tones`,
  steps: [
    {
      type: 'card',
      title: 'The notes that matter',
      body: 'A chord\'s 3rd and 7th are its {t:guide-tone|guide tones}: they tell major from minor, and dominant from major 7. Through {c:Dm7} {c:G7} {c:Cmaj7}, play just them on strings 3 and 2: {n:C} and {n:F}, then {n:B} and {n:F}, then {n:B} and {n:E}.',
      figure: {
        kind: 'fretboard',
        frets: [3, 7],
        dots: [
          { string: 3, fret: 5, note: 'C' },
          { string: 2, fret: 6, note: 'F' },
          { string: 3, fret: 4, note: 'B' },
          { string: 2, fret: 5, note: 'E' },
        ],
        caption: 'Strings 3 and 2: the guide tones of {c:Dm7}, {c:G7} and {c:Cmaj7}.',
      },
    },
    {
      type: 'card',
      title: 'Half a step at a time',
      body: 'On string 3, {n:C}, the 7th of {c:Dm7}, falls a half step to {n:B}, the 3rd of {c:G7}. On string 2, {n:F}, the 7th of {c:G7}, falls to {n:E}, the 3rd of {c:Cmaj7}. Each 7th falls a half step to the next 3rd.',
      figure: {
        kind: 'tab',
        tempo: 70,
        notes: [
          { string: 3, fret: 5, duration: 'q' },
          { string: 2, fret: 6, duration: 'q' },
          { string: 3, fret: 4, duration: 'q' },
          { string: 2, fret: 6, duration: 'q' },
          { string: 3, fret: 4, duration: 'q' },
          { string: 2, fret: 5, duration: 'q' },
          { rest: true, duration: 'h' },
        ],
        caption: 'Each pair, lower note first: {c:Dm7}, {c:G7}, {c:Cmaj7}.',
      },
    },
    {
      type: 'fill-blanks',
      prompt: 'Fill in the guide tone.',
      text: '{n:F}, the 7th of {c:G7}, falls a half step to ___, the 3rd of {c:Cmaj7}.',
      blanks: ['{n:E}'],
      bank: ['{n:Eb}', '{n:G}', '{n:D}'],
      explain: '{n:F} down a half step is {n:E}, the major 3rd of {c:Cmaj7}.',
      fact: 'jazz-seventh-falls-to-third',
    },
    {
      type: 'choice',
      prompt: 'Which notes are the guide tones of {c:A7}?',
      options: [
        { text: '{n:C#} and {n:G}', correct: true },
        { text: '{n:A} and {n:E}', why: 'Those are the root and the 5th: they say nothing about the quality.' },
        { text: '{n:C} and {n:G}', why: '{n:C} is a minor 3rd: those are the guide tones of {c:Am7}.' },
        { text: '{n:C#} and {n:G#}', why: '{n:G#} is a major 7th: those are the guide tones of {c:Amaj7}.' },
      ],
      explain: '{c:A7} is {n:A} {n:C#} {n:E} {n:G}. Its 3rd is {n:C#} and its 7th is {n:G}: together they spell a dominant 7th.',
      fact: 'jazz-guide-tones',
    },
    {
      type: 'card',
      title: 'The other one stays',
      body: 'While one guide tone falls, the other holds still. {n:F}, the 3rd of {c:Dm7}, stays to become the 7th of {c:G7}. {n:B}, the 3rd of {c:G7}, stays to become the 7th of {c:Cmaj7}. Two notes, tiny moves, the whole progression.',
    },
    {
      type: 'true-false',
      statement: '{n:B}, the 3rd of {c:G7}, stays put to become the 7th of {c:Cmaj7}.',
      answer: true,
      explain: '{c:Cmaj7} is {n:C} {n:E} {n:G} {n:B}: its 7th is the same {n:B}. So that guide tone holds while {n:F} falls to {n:E}.',
      fact: 'jazz-guide-tone-stays',
    },
    {
      type: 'choice',
      prompt: 'In {c:Dm7} to {c:G7}, where does {n:C}, the 7th of {c:Dm7}, go?',
      options: [
        { text: 'Down a half step to {n:B}, the 3rd', correct: true },
        { text: 'Up a whole step to {n:D}, the 5th', why: 'The 5th of {c:G7} adds little. The 7th falls a half step to the 3rd.' },
        { text: 'It stays as {n:C}', why: '{n:C} is not in {c:G7}: {n:G} {n:B} {n:D} {n:F}.' },
      ],
      explain: '{n:C} falls a half step to {n:B}, the 3rd of {c:G7}: each 7th falls to the next 3rd.',
    },
    {
      type: 'play-phrase',
      prompt: 'Play the guide tones of {c:Dm7} {c:G7} {c:Cmaj7} on strings 3 and 2, lower note first.',
      notes: [
        { string: 3, fret: 5, duration: 'q' },
        { string: 2, fret: 6, duration: 'q' },
        { string: 3, fret: 4, duration: 'q' },
        { string: 2, fret: 6, duration: 'q' },
        { string: 3, fret: 4, duration: 'q' },
        { string: 2, fret: 5, duration: 'h' },
      ],
      octave: 'exact',
      tempo: 70,
      explain: 'String 3 goes {n:C}, {n:B}, {n:B}; string 2 goes {n:F}, {n:F}, {n:E}. Each move is a half step or nothing at all.',
      alternative: {
        type: 'order',
        prompt: 'Put the guide-tone pairs of {c:Dm7} {c:G7} {c:Cmaj7} in order.',
        tiles: ['{n:C} {n:F}', '{n:B} {n:F}', '{n:B} {n:E}'],
        distractors: ['{n:C} {n:E}'],
        explain: '{c:Dm7}: {n:C} and {n:F}. {c:G7}: {n:B} and {n:F}. {c:Cmaj7}: {n:B} and {n:E}.',
      },
    },
    { generate: 'chord-tones', params: { types: ['7', 'm7', 'maj7'], roots: ['C', 'G', 'D', 'F', 'A', 'Bb'], ask: 'name' } },
  ],
  facts: [
    {
      id: 'jazz-guide-tones',
      front: 'What are guide tones?',
      back: 'The 3rd and 7th of each chord: together they tell its quality.',
      ask: {
        type: 'choice',
        prompt: 'Which notes are the guide tones of {c:Fmaj7}?',
        options: [
          { text: '{n:A} and {n:E}', correct: true },
          { text: '{n:Ab} and {n:Eb}', why: 'Those belong to {c:Fm7}.' },
          { text: '{n:A} and {n:Eb}', why: 'Those belong to {c:F7}.' },
          { text: '{n:F} and {n:C}', why: 'The root and 5th: no quality in them.' },
        ],
        explain: '{c:Fmaj7} is {n:F} {n:A} {n:C} {n:E}: 3rd {n:A}, 7th {n:E}.',
      },
    },
    {
      id: 'jazz-seventh-falls-to-third',
      front: 'In a two-five-one, where does each chord\'s 7th go?',
      back: 'Down a half step to the 3rd of the next chord: {n:C} to {n:B} ({c:Dm7} to {c:G7}), {n:F} to {n:E} ({c:G7} to {c:Cmaj7}).',
    },
    {
      id: 'jazz-guide-tone-stays',
      front: 'In {c:Dm7} {c:G7} {c:Cmaj7}, which guide tones stay put?',
      back: '{n:F}: 3rd of {c:Dm7}, then 7th of {c:G7}. {n:B}: 3rd of {c:G7}, then 7th of {c:Cmaj7}.',
    },
  ],
};

const shellVoicings: Lesson = {
  id: 'shell-voicings',
  title: 'Shell voicings',
  teaches: 'A shell voicing plays only the root, 3rd and 7th, which is enough to sound any seventh chord.',
  minutes: 4,
  skill: `theory:${U}:shell-voicings`,
  steps: [
    {
      type: 'card',
      title: 'Three notes are enough',
      body: 'A {t:shell-voicing} plays only the root, 3rd and 7th: the 5th adds little, so it goes. With the root on string 6: {c:Gmaj7} 3x44xx, {c:G7} 3x34xx, {c:Gm7} 3x33xx. From one to the next, only string 4 or string 3 moves.',
      figure: {
        kind: 'fretboard',
        frets: [2, 5],
        root: 'G',
        labels: 'degree',
        dots: [
          { string: 6, fret: 3, note: 'G', degree: '1', role: 'root' },
          { string: 4, fret: 3, note: 'F', degree: 'b7', role: 'seventh' },
          { string: 3, fret: 4, note: 'B', degree: '3', role: 'third' },
        ],
        caption: '{c:G7} shell (3x34xx): root, {d:b7}, 3.',
      },
    },
    {
      type: 'card',
      title: 'Root on string 5',
      body: 'With the root on string 5: {c:Cmaj7} x3x45x, {c:C7} x3x35x, {c:Cm7} x3x34x. The same three jobs one string higher: root, 7th on string 3, 3rd on string 2.',
      figure: {
        kind: 'fretboard',
        frets: [2, 6],
        root: 'C',
        labels: 'degree',
        dots: [
          { string: 5, fret: 3, note: 'C', degree: '1', role: 'root' },
          { string: 3, fret: 3, note: 'Bb', degree: 'b7', role: 'seventh' },
          { string: 2, fret: 5, note: 'E', degree: '3', role: 'third' },
        ],
        caption: '{c:C7} shell (x3x35x): root, {d:b7}, 3.',
      },
    },
    {
      type: 'choice',
      prompt: 'Which chord tone does a shell voicing leave out?',
      options: [
        { text: 'The 5th', correct: true },
        { text: 'The 3rd', why: 'The 3rd says major or minor: a shell always keeps it.' },
        { text: 'The 7th', why: 'The 7th says maj7, dominant or minor 7: a shell keeps it.' },
        { text: 'The root', why: 'A shell keeps the root in the bass.' },
      ],
      shuffle: false,
      explain: 'Root, 3rd and 7th tell you exactly which seventh chord it is. The 5th adds little, so the shell drops it.',
      fact: 'jazz-shell-voicing',
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'A7',
      frets: '5x56xx',
      accept: 'this-shape',
      prompt: 'Build an {c:A7} shell with the root on string 6: the {c:G7} shape, two frets higher.',
      explain: '5x56xx: {n:A} on string 6, {n:G} (the {d:b7}) on string 4, {n:C#} (the 3rd) on string 3.',
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'Fmaj7',
      frets: 'x-8-x-9-10-x',
      accept: 'this-shape',
      prompt: 'Build an {c:Fmaj7} shell with the root on string 5, at fret 8.',
      explain: 'x-8-x-9-10-x: {n:F} at fret 8 of string 5, {n:E} (the 7th) at fret 9 of string 3, {n:A} (the 3rd) at fret 10 of string 2.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each shell with its chord.',
      pairs: [
        { left: '3x44xx', right: '{c:Gmaj7}' },
        { left: '3x34xx', right: '{c:G7}' },
        { left: '3x33xx', right: '{c:Gm7}' },
        { left: 'x3x34x', right: '{c:Cm7}' },
      ],
      explain: 'String 4 holds the 7th of the G shells ({n:F#} or {n:F}), string 3 the 3rd ({n:B} or {n:Bb}). In x3x34x the {n:Eb} on string 2 makes it minor.',
      fact: 'jazz-shells-root-6',
    },
    {
      type: 'card',
      title: 'A shell two-five-one',
      body: '{c:Dm7} x5x56x, {c:G7} 3x34xx, {c:Cmaj7} x3x45x. Your hand stays between frets 3 and 6 while the root hops between strings 5 and 6. Watch string 3: {n:C}, {n:B}, {n:B}. The 7th of {c:Dm7} falls a fret to the 3rd of {c:G7}, which stays put as the 7th of {c:Cmaj7}.',
      figure: { kind: 'chord', symbol: 'Dm7', frets: 'x5x56x', caption: '{c:Dm7} shell (x5x56x): {n:D}, {n:C}, {n:F}.' },
    },
    {
      type: 'choice',
      prompt: 'Which shell is {c:Dm7} in the shell two-five-one in {k:C major}?',
      options: [
        { text: 'x5x56x', correct: true },
        { text: 'x5x57x', why: 'String 2 at fret 7 is {n:F#}, a major 3rd: that is a {c:D7} shell.' },
        { text: 'x5x66x', why: 'String 3 at fret 6 is {n:C#}, a major 7th: that is {c:DmMaj7}.' },
      ],
      explain: 'x5x56x: {n:D} on string 5, {n:C} (the {d:b7}) on string 3, {n:F} (the {d:b3}) on string 2.',
      fact: 'jazz-shell-ii-v-i',
    },
    {
      type: 'play-chord',
      prompt: 'Play the shells x5x56x, 3x34xx, x3x45x in turn. Strum the {c:G7}.',
      chord: 'G7',
      frets: '3x34xx',
      explain: '3x34xx: {n:G}, {n:F} and {n:B}. Let the fingertip on string 6 lean on string 5 to mute it.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'G7',
        frets: '3x34xx',
        accept: 'this-shape',
        prompt: 'Build the {c:G7} shell with the root on string 6.',
        explain: '3x34xx: {n:G} at fret 3 of string 6, {n:F} at fret 3 of string 4, {n:B} at fret 4 of string 3.',
      },
    },
    { generate: 'chord-tones', params: { types: ['maj7', '7', 'm7'], roots: ['G', 'C', 'A', 'F', 'D', 'Bb'], ask: 'tone' } },
  ],
  facts: [
    {
      id: 'jazz-shell-voicing',
      front: 'What is a shell voicing?',
      back: 'Just the root, 3rd and 7th of a chord. The 5th is left out.',
    },
    {
      id: 'jazz-shells-root-6',
      front: 'Give the shells of {c:Gmaj7}, {c:G7} and {c:Gm7} with the root on string 6.',
      back: '{c:Gmaj7} 3x44xx, {c:G7} 3x34xx, {c:Gm7} 3x33xx.',
      ask: {
        type: 'match-pairs',
        prompt: 'Match each shell with its chord.',
        pairs: [
          { left: '3x44xx', right: '{c:Gmaj7}' },
          { left: '3x34xx', right: '{c:G7}' },
          { left: '3x33xx', right: '{c:Gm7}' },
        ],
        explain: '{n:F#} or {n:F} on string 4 is the 7th; {n:B} or {n:Bb} on string 3 is the 3rd.',
      },
    },
    {
      id: 'jazz-shells-root-5',
      front: 'Give the shells of {c:Cmaj7}, {c:C7} and {c:Cm7} with the root on string 5.',
      back: '{c:Cmaj7} x3x45x, {c:C7} x3x35x, {c:Cm7} x3x34x.',
      ask: {
        type: 'match-pairs',
        prompt: 'Match each shell with its chord.',
        pairs: [
          { left: 'x3x45x', right: '{c:Cmaj7}' },
          { left: 'x3x35x', right: '{c:C7}' },
          { left: 'x3x34x', right: '{c:Cm7}' },
        ],
        explain: '{n:B} or {n:Bb} on string 3 is the 7th; {n:E} or {n:Eb} on string 2 is the 3rd.',
      },
    },
    {
      id: 'jazz-shell-ii-v-i',
      front: 'Play the shell two-five-one in {k:C major}.',
      back: '{c:Dm7} x5x56x, {c:G7} 3x34xx, {c:Cmaj7} x3x45x: small moves, the root hopping between strings 5 and 6.',
    },
  ],
};

const dropTwoVoicings: Lesson = {
  id: 'drop-2-voicings',
  title: 'Drop-2 voicings',
  teaches: 'Drop 2 takes the second-highest note of a close chord down an octave, so it fits four neighbouring strings.',
  minutes: 4,
  skill: `theory:${U}:drop-2-voicings`,
  steps: [
    {
      type: 'card',
      title: 'Close, then dropped',
      body: 'A chord in {t:close-position} packs its four notes inside one octave: {c:Cmaj7} as {n:G} {n:B} {n:C} {n:E}. That is awkward to finger. Take the second-highest note, {n:C}, down an octave: {n:C} {n:G} {n:B} {n:E}. That is a {t:drop-2} voicing.',
      figure: {
        kind: 'keyboard',
        keys: ['G3', 'B3', { note: 'C4', label: 'drop', role: 'target' }, 'E4'],
        from: 'G3',
        to: 'F4',
        caption: 'Close {c:Cmaj7}: {n:G} {n:B} {n:C} {n:E}. The {n:C} drops an octave.',
      },
    },
    {
      type: 'card',
      title: 'On four strings',
      body: 'Now it fits strings 5 to 2: x3545x, {n:C} {n:G} {n:B} {n:E}, with the root in the bass. Drop-2 voicings usually sit on four neighbouring strings: 6 to 3, 5 to 2 or 4 to 1.',
      figure: { kind: 'chord', symbol: 'Cmaj7', frets: 'x3545x', caption: '{c:Cmaj7} drop 2 (x3545x): {n:C} {n:G} {n:B} {n:E}.' },
    },
    {
      type: 'choice',
      prompt: 'Which note of a close voicing does drop 2 lower an octave?',
      options: [
        { text: 'The second from the top', correct: true },
        { text: 'The top note', why: 'The top note stays: it is often the melody.' },
        { text: 'The lowest note', why: 'Dropping the lowest note just makes the same chord lower.' },
        { text: 'The third from the top', why: 'That is drop 3, the next lesson.' },
      ],
      shuffle: false,
      explain: 'Drop 2: count down from the top note, take the 2nd one, and move it down an octave.',
      fact: 'jazz-drop-2-meaning',
    },
    {
      type: 'order',
      prompt: 'Close {c:Cmaj7} is {n:G} {n:B} {n:C} {n:E}, low to high. Drop its second-highest note an octave and order the result, low to high.',
      tiles: ['{n:C}', '{n:G}', '{n:B}', '{n:E}'],
      explain: 'The second-highest note is {n:C}. Down an octave it becomes the bass: {n:C} {n:G} {n:B} {n:E}, which is x3545x.',
      fact: 'jazz-drop-2-cmaj7',
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'Cmaj7',
      frets: 'x3545x',
      accept: 'this-shape',
      prompt: 'Place {c:Cmaj7} drop 2 on strings 5 to 2.',
      explain: 'x3545x: {n:C} at fret 3 of string 5, {n:G} at fret 5, {n:B} at fret 4, {n:E} at fret 5 of string 2.',
    },
    {
      type: 'card',
      title: 'Another start, another bass',
      body: 'Start from close {n:C} {n:E} {n:G} {n:B} instead. Its second-highest note is {n:G}: drop it and you get {n:G} {n:C} {n:E} {n:B}, {c:Cmaj7/G} (3324xx) on strings 6 to 3. Still drop 2, now with the 5th in the bass.',
      figure: { kind: 'audio', sound: { kind: 'chord', chord: 'Cmaj7/G', frets: '3324xx', style: 'arpeggio' }, label: 'Hear {c:Cmaj7/G}' },
    },
    {
      type: 'type-answer',
      prompt: 'Close {c:Cmaj7} is {n:C} {n:E} {n:G} {n:B}. After drop 2, which note is in the bass?',
      answer: { kind: 'note', value: 'G', spelling: 'exact' },
      input: 'keypad',
      explain: 'The second-highest note, {n:G}, drops an octave below the rest: {n:G} {n:C} {n:E} {n:B}, which is {c:Cmaj7/G}.',
      fact: 'jazz-drop-2-fifth-in-bass',
    },
    {
      type: 'true-false',
      statement: 'A drop-2 voicing sits on four neighbouring strings, such as strings 4 to 1.',
      answer: true,
      explain: 'Dropping one inner note opens the chord just enough for one note per string on four strings side by side: 6 to 3, 5 to 2 or 4 to 1.',
      fact: 'jazz-drop-2-strings',
    },
    {
      type: 'play-chord',
      prompt: 'Strum {c:Cmaj7/G} (3324xx), drop 2 on strings 6 to 3.',
      chord: 'Cmaj7/G',
      frets: '3324xx',
      explain: '3324xx: {n:G}, {n:C}, {n:E} and {n:B}. Strings 2 and 1 stay silent.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'Cmaj7/G',
        frets: '3324xx',
        accept: 'this-shape',
        prompt: 'Place {c:Cmaj7/G}, drop 2 on strings 6 to 3.',
        explain: '3324xx: {n:G} and {n:C} at fret 3, {n:E} at fret 2 of string 4, {n:B} at fret 4 of string 3.',
      },
    },
  ],
  facts: [
    {
      id: 'jazz-drop-2-meaning',
      front: 'How do you make a drop-2 voicing?',
      back: 'Take a close four-note chord and drop its second-highest note an octave.',
    },
    {
      id: 'jazz-drop-2-strings',
      front: 'Where do drop-2 voicings sit on the guitar?',
      back: 'On four neighbouring strings, such as strings 5 to 2 or 4 to 1.',
    },
    {
      id: 'jazz-drop-2-cmaj7',
      front: 'Where does {c:Cmaj7} drop 2, x3545x, come from?',
      back: 'From close {n:G} {n:B} {n:C} {n:E} with the {n:C} dropped an octave: {n:C} {n:G} {n:B} {n:E}, root in the bass.',
      ask: {
        type: 'order',
        prompt: 'Close {c:Cmaj7} is {n:G} {n:B} {n:C} {n:E}. Drop the second-highest note and order the result, low to high.',
        tiles: ['{n:C}', '{n:G}', '{n:B}', '{n:E}'],
        explain: '{n:C} drops to the bass: {n:C} {n:G} {n:B} {n:E}, x3545x.',
      },
    },
    {
      id: 'jazz-drop-2-fifth-in-bass',
      front: 'What does drop 2 make of close {n:C} {n:E} {n:G} {n:B}?',
      back: '{n:G} {n:C} {n:E} {n:B}: {c:Cmaj7/G} (3324xx), a drop 2 with the 5th in the bass.',
    },
  ],
};

const dropThreeVoicings: Lesson = {
  id: 'drop-3-voicings',
  title: 'Drop-3 voicings',
  teaches: 'Drop 3 lowers the third-highest note of a close chord an octave, leaving a gap above a bass on string 6 or 5.',
  minutes: 3,
  skill: `theory:${U}:drop-3-voicings`,
  steps: [
    {
      type: 'card',
      title: 'Drop the third from the top',
      body: 'Close {c:Gmaj7} as {n:F#} {n:G} {n:B} {n:D}. {t:drop-3|Drop 3} takes the third-highest note, {n:G}, down an octave: {n:G} {n:F#} {n:B} {n:D}. On the guitar that is 3x443x: the root on string 6, a skipped string, then three notes.',
      figure: {
        kind: 'keyboard',
        keys: ['F#3', { note: 'G3', label: 'drop', role: 'target' }, 'B3', 'D4'],
        from: 'F3',
        to: 'E4',
        caption: 'Close {c:Gmaj7}: {n:F#} {n:G} {n:B} {n:D}. The {n:G} drops an octave.',
      },
    },
    {
      type: 'card',
      title: 'A gap above the bass',
      body: 'The dropped note leaves a wide gap above the bass, which is why drop-3 shapes skip a string: the bass sits on string 6 or 5 and the next string is muted. Lower the 7th a fret and {c:Gmaj7} becomes {c:G7} (3x343x); lower the 3rd too and it is {c:Gm7} (3x333x).',
      figure: { kind: 'chord', symbol: 'Gmaj7', frets: '3x443x', caption: '{c:Gmaj7} drop 3 (3x443x): {n:G}, string 5 muted, {n:F#} {n:B} {n:D}.' },
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'Gmaj7',
      frets: '3x443x',
      accept: 'this-shape',
      prompt: 'Place {c:Gmaj7} drop 3, root on string 6.',
      explain: '3x443x: {n:G} at fret 3, string 5 muted, {n:F#} and {n:B} at fret 4, {n:D} at fret 3 of string 2.',
      fact: 'jazz-drop-3-gmaj7',
    },
    {
      type: 'choice',
      prompt: 'In a drop-3 voicing, which string is usually left out?',
      options: [
        { text: 'The one next to the bass', correct: true },
        { text: 'The top string', why: 'The top string often carries the melody note.' },
        { text: 'The bass string', why: 'The bass string holds the dropped note, usually the root.' },
      ],
      shuffle: false,
      explain: 'The dropped note lands nearly an octave below the next note up, too far for the next string to reach nearby. So that string is skipped: 3x443x mutes string 5.',
      fact: 'jazz-drop-3-skip-string',
    },
    {
      type: 'order',
      prompt: 'Close {c:Gmaj7} is {n:F#} {n:G} {n:B} {n:D}. Drop the third-highest note an octave and order the result, low to high.',
      tiles: ['{n:G}', '{n:F#}', '{n:B}', '{n:D}'],
      explain: 'Counting down from {n:D}: {n:B}, then {n:G}. The {n:G} drops to the bass: {n:G} {n:F#} {n:B} {n:D}, which is 3x443x.',
      fact: 'jazz-drop-3-meaning',
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'G7',
      frets: '3x343x',
      accept: 'this-shape',
      prompt: 'Change {c:Gmaj7} (3x443x) into {c:G7} by lowering one note a fret.',
      explain: 'Lower the {n:F#} on string 4 to {n:F}, the {d:b7}: 3x343x.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each drop-3 shape with its chord.',
      pairs: [
        { left: '3x443x', right: '{c:Gmaj7}' },
        { left: '3x343x', right: '{c:G7}' },
        { left: '3x333x', right: '{c:Gm7}' },
      ],
      explain: 'String 4 holds the 7th ({n:F#} or {n:F}) and string 3 the 3rd ({n:B} or {n:Bb}). Lower both for {c:Gm7}.',
    },
    {
      type: 'play-chord',
      prompt: 'Strum {c:Gm7} drop 3 (3x333x).',
      chord: 'Gm7',
      frets: '3x333x',
      explain: '3x333x: {n:G}, {n:F}, {n:Bb} and {n:D}, all at fret 3. Mute string 5 and string 1.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'Gm7',
        frets: '3x333x',
        accept: 'this-shape',
        prompt: 'Place {c:Gm7} drop 3, root on string 6.',
        explain: '3x333x: {n:G}, string 5 muted, then {n:F}, {n:Bb} and {n:D} at fret 3.',
      },
    },
  ],
  facts: [
    {
      id: 'jazz-drop-3-meaning',
      front: 'How do you make a drop-3 voicing?',
      back: 'Take a close four-note chord and drop its third-highest note an octave.',
    },
    {
      id: 'jazz-drop-3-skip-string',
      front: 'Where do drop-3 voicings usually sit?',
      back: 'With the bass on string 6 or 5, skipping the next string.',
    },
    {
      id: 'jazz-drop-3-gmaj7',
      front: 'Give {c:Gmaj7} drop 3 with the root on string 6.',
      back: '3x443x: {n:G} {n:F#} {n:B} {n:D}.',
      ask: {
        type: 'true-false',
        statement: '3x443x sounds {n:G} {n:F#} {n:B} {n:D}, low to high.',
        answer: true,
        explain: 'String 6 fret 3 {n:G}, string 4 fret 4 {n:F#}, string 3 fret 4 {n:B}, string 2 fret 3 {n:D}.',
      },
    },
  ],
};

const turnarounds: Lesson = {
  id: 'turnarounds',
  title: 'Turnarounds',
  teaches: 'A turnaround is a short progression that ends a section and leads back home; jazz uses a few standard ones.',
  minutes: 3,
  skill: `theory:${U}:turnarounds`,
  steps: [
    {
      type: 'card',
      title: 'Back to the top',
      body: 'A {t:turnaround} is a short progression at the end of a section that leads back to {r:I}. The plain one is {r:I}–{r:vi}–{r:ii}–{r:V}: {c:C} {c:Am7} {c:Dm7} {c:G7}. Jazz players often make the {r:vi} a dominant, {c:A7}, which pulls hard into {c:Dm7}.',
      figure: { kind: 'chord', symbol: 'A7', frets: '5x56xx', caption: '{c:A7} shell (5x56xx): {r:VI7}, the dominant of {c:Dm7}.' },
    },
    {
      type: 'card',
      title: 'Hear it go round',
      body: 'Play {c:Cmaj7} (x3545x), {c:A7} (5x56xx), {c:Dm7} (x5x56x), {c:G7} (3x34xx), and back to {c:Cmaj7}. From {c:A7} on, each root falls a fifth: {n:A}, {n:D}, {n:G}, {n:C}.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['Cmaj7', 'A7', 'Dm7', 'G7', 'Cmaj7'], beats: 2, tempo: 100 }, label: 'Hear the turnaround' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete {r:I}–{r:VI7}–{r:ii}–{r:V7} in {k:F major}.',
      text: '{c:Fmaj7}  {c:D7}  {c:Gm7}  ___',
      blanks: ['{c:C7}'],
      bank: ['{c:Cmaj7}', '{c:Cm7}', '{c:Bb7}'],
      explain: '{r:V7} of {k:F major} is {c:C7}, which leads back to {c:Fmaj7}: {n:D}, {n:G}, {n:C}, {n:F}, a fifth down each time.',
    },
    {
      type: 'choice',
      prompt: 'In {c:C} {c:Am7} {c:Dm7} {c:G7}, why do players often turn {c:Am7} into {c:A7}?',
      options: [
        { text: '{c:A7} is the dominant of {c:Dm7}', correct: true },
        { text: 'It moves the tune to {k:A major}', why: 'One chord does not change the key: {c:A7} only leans into {c:Dm7}.' },
        { text: 'It avoids the {r:ii} chord', why: 'The {r:ii} chord, {c:Dm7}, still follows. {c:A7} points straight at it.' },
      ],
      explain: '{c:A7} is the {r:V7} of {c:Dm7}: its {n:C#} rises to {n:D}, so the pull into {c:Dm7} is much stronger than from {c:Am7}.',
      fact: 'jazz-i-vi7-ii-v7',
    },
    {
      type: 'listen-choice',
      prompt: 'In {k:C major}: {r:I}–{r:vi}–{r:ii}–{r:V}, or {r:iii}–{r:VI7}–{r:ii}–{r:V7}?',
      sound: { kind: 'progression', chords: ['Em7', 'A7', 'Dm7', 'G7'], beats: 2, tempo: 100 },
      options: [{ text: '{r:I}–{r:vi}–{r:ii}–{r:V}' }, { text: '{r:iii}–{r:VI7}–{r:ii}–{r:V7}', correct: true }],
      shuffle: false,
      explain: 'It started on {c:Em7}, not {c:C}, and the second chord was {c:A7}, with {n:C#}: {r:iii}–{r:VI7}–{r:ii}–{r:V7}.',
    },
    {
      type: 'card',
      title: 'Starting on three',
      body: '{r:iii}–{r:VI7}–{r:ii}–{r:V7}, {c:Em7} {c:A7} {c:Dm7} {c:G7}, starts on {c:Em7}, a tonic substitute: it shares three notes with {c:Cmaj7}. Now every root falls a fifth, {n:E} {n:A} {n:D} {n:G}, then home to {n:C}.',
    },
    {
      type: 'true-false',
      statement: '{c:Em7} {c:A7} {c:Dm7} {c:G7} is a turnaround in {k:C major}.',
      answer: true,
      explain: '{r:iii}–{r:VI7}–{r:ii}–{r:V7}: {c:Em7} stands in for the tonic, and the chain of fifths leads back to {c:C}.',
      fact: 'jazz-iii-vi7-ii-v7',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each numeral with its chord in {k:C major}.',
      pairs: [
        { left: '{r:iii7}', right: '{c:Em7}' },
        { left: '{r:VI7}', right: '{c:A7}' },
        { left: '{r:ii7}', right: '{c:Dm7}' },
        { left: '{r:V7}', right: '{c:G7}' },
      ],
      explain: 'The turnaround {r:iii7}–{r:VI7}–{r:ii7}–{r:V7}: only {c:A7} has a note from outside the key, {n:C#}.',
    },
    {
      type: 'play-chord',
      prompt: 'Strum the {c:A7} shell (5x56xx), the {r:VI7} of the turnaround in {k:C major}.',
      chord: 'A7',
      frets: '5x56xx',
      explain: '5x56xx: {n:A}, {n:G} and {n:C#}. The {n:C#} is the note that pulls into {c:Dm7}.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'A7',
        frets: '5x56xx',
        accept: 'this-shape',
        prompt: 'Build the {c:A7} shell, root on string 6, for the turnaround in {k:C major}.',
        explain: '5x56xx: {n:A} at fret 5 of string 6, {n:G} at fret 5 of string 4, {n:C#} at fret 6 of string 3.',
      },
    },
    { generate: 'roman-chord', params: { direction: 'to-chord', numerals: ['ii7', 'V7', 'Imaj7', 'vi7', 'VI7', 'iii7'], modes: ['major'], maxAccidentals: 3 } },
  ],
  facts: [
    {
      id: 'jazz-turnaround-meaning',
      front: 'What is a turnaround?',
      back: 'A short progression at the end of a section that leads back to {r:I}.',
    },
    {
      id: 'jazz-i-vi7-ii-v7',
      front: 'How do jazz players often play {r:I}–{r:vi}–{r:ii}–{r:V} in {k:C major}?',
      back: 'As {r:I}–{r:VI7}–{r:ii}–{r:V7}: {c:C} {c:A7} {c:Dm7} {c:G7}, the {c:A7} pulling hard into {c:Dm7}.',
      ask: {
        type: 'fill-blanks',
        prompt: 'Complete {r:I}–{r:VI7}–{r:ii}–{r:V7} in {k:C major}.',
        text: '{c:C}  ___  {c:Dm7}  {c:G7}',
        blanks: ['{c:A7}'],
        bank: ['{c:Am7}', '{c:Amaj7}', '{c:E7}'],
        explain: '{r:VI7} is {c:A7}, the dominant of {c:Dm7}.',
      },
    },
    {
      id: 'jazz-iii-vi7-ii-v7',
      front: 'What is the {r:iii}–{r:VI7}–{r:ii}–{r:V7} turnaround in {k:C major}?',
      back: '{c:Em7} {c:A7} {c:Dm7} {c:G7}: it starts on {c:Em7}, a tonic substitute.',
    },
  ],
};

const comping: Lesson = {
  id: 'comping',
  title: 'Comping',
  teaches: 'Comping is accompanying a soloist with chords, from steady four-to-the-bar to sparse, syncopated hits.',
  minutes: 3,
  skill: `theory:${U}:comping`,
  steps: [
    {
      type: 'card',
      title: 'Playing for someone else',
      body: '{t:comping|Comping} is accompanying a soloist with chords. It is about *when* you play as much as *what*. Swing-era rhythm guitarists often hit a short three-note chord on every beat: four to the bar.',
      figure: { kind: 'rhythm', pattern: 'q q q q | q q q q', tempo: 110, caption: 'Four to the bar: one short chord on each beat.' },
    },
    {
      type: 'card',
      title: 'Short and steady',
      body: 'Try it on the shell two-five-one: {c:Dm7} x5x56x, {c:G7} 3x34xx, {c:Cmaj7} x3x45x, a bar each. Ease the pressure right after each strum, so every chord is short and the beat stays crisp.',
      figure: { kind: 'audio', sound: { kind: 'strum', chord: 'Dm7', pattern: 'D-D-D-D-', tempo: 110, repeat: 2 }, label: 'Hear four to the bar' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap four to the bar for two bars: one short chord on every beat.',
      rhythm: { pattern: 'q q q q | q q q q' },
      tempo: 100,
      show: 'notation',
      start: 'first-tap',
      explain: 'Eight even taps, one per beat. Steady matters more than loud: that even pulse is what a swing band leans on.',
    },
    {
      type: 'true-false',
      statement: 'Comping means playing as many chords as you can.',
      answer: false,
      explain: 'Comping supports the soloist. Placing chords well, and leaving space, matters more than playing many.',
      fact: 'jazz-comping-meaning',
    },
    {
      type: 'card',
      title: 'Leave room',
      body: 'Modern comping plays less: a few chords, often off the beat, so the soloist has space. Try a bar with just two hits: on the "&" of 1 and on beat 3.',
      figure: { kind: 'rhythm', pattern: 'er e qr q qr', tempo: 110, caption: 'Two hits: the "&" of 1, then beat 3.' },
    },
    {
      type: 'choice',
      prompt: 'In that sparse bar, where do the two chords fall?',
      options: [
        { text: 'On the "&" of 1 and on beat 3', correct: true },
        { text: 'On beats 1 and 3', why: 'The first hit comes just after beat 1, on its "&".' },
        { text: 'On beats 2 and 4', why: 'Beats 2 and 4 are rests in that bar.' },
      ],
      explain: 'An eighth rest on 1, a chord on its "&", a rest on 2, a chord on 3, a rest on 4.',
    },
    {
      type: 'listen-choice',
      prompt: 'Four to the bar, or syncopated comping?',
      sound: { kind: 'strum', chord: 'Dm7', pattern: '-D--D---', tempo: 110, repeat: 2 },
      options: [{ text: 'Four to the bar' }, { text: 'Syncopated', correct: true }],
      shuffle: false,
      explain: 'Only two chords a bar, the first just after beat 1: syncopated, sparse comping.',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap the sparse bar twice: the "&" of 1 and beat 3.',
      rhythm: { pattern: 'er e qr q qr | er e qr q qr' },
      tempo: 90,
      show: 'both',
      explain: 'Feel beat 1 and wait half a beat before the first tap. The second tap lands squarely on beat 3.',
    },
    {
      type: 'choice',
      prompt: 'Which describes modern comping?',
      options: [
        { text: 'Fewer chords, often syncopated, with space', correct: true },
        { text: 'A chord on every beat of every bar', why: 'That is four-to-the-bar, the swing-era style.' },
        { text: 'The same rhythm as the melody', why: 'Copying the melody crowds it. Comping answers and supports it.' },
      ],
      explain: 'Modern comping uses fewer, syncopated hits and leaves room for the soloist.',
      fact: 'jazz-modern-comping',
    },
    {
      type: 'play-chord',
      prompt: 'Comp on {c:Dm7}: strum the shell x5x56x, short, on beat 1.',
      chord: 'Dm7',
      frets: 'x5x56x',
      explain: 'x5x56x: {n:D}, {n:C} and {n:F}. Strum, then ease off at once: a short chord leaves room for the soloist.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'Dm7',
        frets: 'x5x56x',
        accept: 'this-shape',
        prompt: 'Build the {c:Dm7} shell, root on string 5, for comping.',
        explain: 'x5x56x: {n:D} at fret 5 of string 5, {n:C} at fret 5 of string 3, {n:F} at fret 6 of string 2.',
      },
    },
  ],
  facts: [
    {
      id: 'jazz-comping-meaning',
      front: 'What is comping?',
      back: 'Accompanying a soloist with chords, placed in rhythm to support the music.',
    },
    {
      id: 'jazz-four-to-the-bar',
      front: 'What is four-to-the-bar comping?',
      back: 'Short three-note chords on every beat, as swing-era rhythm guitarists often played.',
    },
    {
      id: 'jazz-modern-comping',
      front: 'How does modern comping usually sound?',
      back: 'Fewer chords, often syncopated hits, leaving room for the soloist.',
    },
  ],
};

/** Unit 34 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'Jazz harmony basics',
  theme: 'harmony',
  description: 'The major and minor two-five-one, guide tones, shell, drop-2 and drop-3 voicings, turnarounds and comping.',
  lessons: [majorTwoFiveOne, minorTwoFiveOne, guideTones, shellVoicings, dropTwoVoicings, dropThreeVoicings, turnarounds, comping],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      {
        type: 'fill-blanks',
        prompt: 'Complete the {r:ii}–{r:V}–{r:I} in {k:Eb major}.',
        text: '{c:Fm7}  ___  {c:Ebmaj7}',
        blanks: ['{c:Bb7}'],
        bank: ['{c:Bbmaj7}', '{c:Bbm7}', '{c:Ab7}'],
        explain: '{c:Fm7} {c:Bb7} {c:Ebmaj7}: roots {n:F}, {n:Bb}, {n:Eb}, a fifth down each time.',
      },
      {
        type: 'type-answer',
        prompt: 'Type the {r:ii} chord of a two-five-one in {k:A major}.',
        answer: { kind: 'chord', value: 'Bm7', spelling: 'exact' },
        input: 'keyboard',
        explain: 'The 2nd note of {k:A major} is {n:B}: {c:Bm7}, then {c:E7}, then {c:Amaj7}.',
      },
      {
        type: 'choice',
        prompt: 'Which is a minor two-five-one in {k:D minor}?',
        options: [
          { text: '{c:Em7b5} {c:A7} {c:Dm}', correct: true },
          { text: '{c:Em7} {c:A7} {c:Dmaj7}', why: 'That is the major two-five-one of {k:D major}.' },
          { text: '{c:Em7b5} {c:Am7} {c:Dm}', why: '{c:Am7} lacks the {n:C#} that pulls home.' },
        ],
        explain: 'Half-diminished {r:ii}, dominant {r:V7}, minor tonic: {c:Em7b5} {c:A7} {c:Dm}.',
      },
      {
        type: 'choice',
        prompt: 'Which notes make {c:F#m7b5}?',
        options: [
          { text: '{n:F#} {n:A} {n:C} {n:E}', correct: true },
          { text: '{n:F#} {n:A} {n:C#} {n:E}', why: 'That is {c:F#m7}, with a perfect 5th.' },
          { text: '{n:F#} {n:A} {n:C} {n:Eb}', why: 'That is {c:F#dim7}.' },
        ],
        explain: 'A diminished triad, {n:F#} {n:A} {n:C}, plus a minor 7th, {n:E}.',
      },
      {
        type: 'choice',
        prompt: 'Which notes are the guide tones of {c:D7}?',
        options: [
          { text: '{n:F#} and {n:C}', correct: true },
          { text: '{n:F} and {n:C}', why: '{n:F} is a minor 3rd: those belong to {c:Dm7}.' },
          { text: '{n:D} and {n:A}', why: 'Root and 5th: no quality in them.' },
        ],
        explain: '{c:D7} is {n:D} {n:F#} {n:A} {n:C}: 3rd {n:F#}, 7th {n:C}.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Fill in the guide tone.',
        text: '{n:C}, the 7th of {c:Dm7}, falls a half step to ___, the 3rd of {c:G7}.',
        blanks: ['{n:B}'],
        bank: ['{n:Bb}', '{n:D}', '{n:A}'],
        explain: 'Each 7th falls a half step to the next chord\'s 3rd: {n:C} to {n:B}.',
      },
      {
        type: 'match-pairs',
        prompt: 'Match each shell with its chord.',
        pairs: [
          { left: '3x44xx', right: '{c:Gmaj7}' },
          { left: '3x33xx', right: '{c:Gm7}' },
          { left: 'x3x35x', right: '{c:C7}' },
          { left: 'x5x56x', right: '{c:Dm7}' },
        ],
        explain: 'Root, 7th and 3rd only: the 5th is left out of every shell.',
      },
      {
        type: 'choice',
        prompt: 'Which chord tone does a shell voicing leave out?',
        options: [
          { text: 'The 5th', correct: true },
          { text: 'The 3rd', why: 'The 3rd says major or minor.' },
          { text: 'The 7th', why: 'The 7th says which kind of seventh chord.' },
        ],
        shuffle: false,
        explain: 'A shell is root, 3rd and 7th.',
      },
      {
        type: 'order',
        prompt: 'Close {c:Gmaj7} is {n:B} {n:D} {n:F#} {n:G}. Drop the second-highest note an octave and order the result, low to high.',
        tiles: ['{n:F#}', '{n:B}', '{n:D}', '{n:G}'],
        explain: 'Drop 2: the {n:F#} goes down an octave to the bass: {n:F#} {n:B} {n:D} {n:G}.',
      },
      {
        type: 'choice',
        prompt: 'Which note of a close voicing does drop 3 lower an octave?',
        options: [
          { text: 'The third from the top', correct: true },
          { text: 'The second from the top', why: 'That is drop 2.' },
          { text: 'The top note', why: 'The top note stays where it is.' },
        ],
        shuffle: false,
        explain: 'Drop 3 lowers the third-highest note, leaving a gap above the bass: 3x443x for {c:Gmaj7}.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Complete {r:I}–{r:VI7}–{r:ii}–{r:V7} in {k:G major}.',
        text: '{c:Gmaj7}  {c:E7}  {c:Am7}  ___',
        blanks: ['{c:D7}'],
        bank: ['{c:Dmaj7}', '{c:Dm7}', '{c:C7}'],
        explain: '{r:V7} of {k:G major} is {c:D7}, leading back to {c:Gmaj7}.',
      },
      {
        type: 'choice',
        prompt: 'Which turnaround in {k:C major} starts on a tonic substitute?',
        options: [
          { text: '{c:Em7} {c:A7} {c:Dm7} {c:G7}', correct: true },
          { text: '{c:C} {c:Am7} {c:Dm7} {c:G7}', why: 'That one starts on the tonic itself.' },
          { text: '{c:C} {c:A7} {c:Dm7} {c:G7}', why: 'That one starts on the tonic too.' },
        ],
        explain: '{r:iii}–{r:VI7}–{r:ii}–{r:V7}: {c:Em7} shares three notes with {c:Cmaj7}.',
      },
      {
        type: 'true-false',
        statement: 'Comping means playing as many chords as you can.',
        answer: false,
        explain: 'Comping supports the soloist: placing chords well, and leaving room, matters most.',
      },
      {
        type: 'choice',
        prompt: 'What is four-to-the-bar comping?',
        options: [
          { text: 'A short chord on every beat', correct: true },
          { text: 'Four chords in each beat', why: 'One chord per beat, four beats per bar.' },
          { text: 'A chord every four bars', why: 'That would leave the band without a pulse.' },
        ],
        shuffle: false,
        explain: 'Swing-era rhythm guitarists played short three-note chords on every beat.',
      },
      {
        type: 'listen-choice',
        prompt: 'Major two-five-one, or minor two-five-one?',
        sound: { kind: 'progression', chords: ['Dm7', 'G7', 'Cmaj7'], beats: 4, tempo: 80 },
        options: [{ text: 'Major', correct: true }, { text: 'Minor' }],
        shuffle: false,
        explain: '{c:Dm7} {c:G7} {c:Cmaj7}: a minor 7, a dominant 7 and a bright major 7 landing.',
      },
      { generate: 'roman-chord', params: { direction: 'to-chord', numerals: TWO_FIVE_ONE, modes: ['major'], maxAccidentals: 4 } },
    ],
  },
};

export default unit;
