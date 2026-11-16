/**
 * Mia, unit 5: G, C and three-chord songs (plan: `mia/mia-g-and-c` in src/content/plan/teachers.json).
 *
 * The full six-string G with finger 1 as the anchor from Em, a first three-chord song in D, the C
 * chord (and the G fingered 3-2-4 that makes G to C easy), D7 and its lean toward G, I-IV-V7 in
 * G major, and the milestone: Amazing Grace from memory. Every lesson follows its plan entry: the
 * plan's `explain` in Mia's voice on the cards, its `show` as figures, its `practice` as exercises
 * (`Mic` with a tapping alternative) or tasks that send the learner to the Player, Rhythm,
 * Progressions or the chord trainer and back.
 *
 * Music from the song library: Change: Em-D and Em-G (60 BPM), Change: G-C and C-G7 (72),
 * Change: G-D7 and D-G (72), She'll Be Coming 'Round the Mountain (108, the library's chart: line 2
 * stays on G and turns to D7 on its last word), Amazing Grace (3/4, 84) and Brahms' Lullaby (3/4,
 * 72). Michael, Row the Boat Ashore is not in the library: its tasks fall back to a jam on D, G and
 * A (the progression `folk-i-iv-i-v` in D: I IV I V I IV V I) until the song lands.
 * `mia-g-and-c.test.ts` checks the shapes, the charts, the bass line of the performance and the
 * BPM of every task against the engines and the library.
 */
import type { TeacherLesson, TeacherUnit } from '../types';
import { playerTask, toolTask } from '../tasks';

// ── 1. The G chord ──────────────────────────────────────────────────────────────────────────────

const theGChord: TeacherLesson = {
  id: 'the-g-chord',
  title: 'The G chord',
  teaches: 'Full G is fret 3 on string 6, fret 2 on string 5, fret 3 on string 1; from E minor, finger 1 is the anchor.',
  minutes: 5,
  skill: 'teacher:mia:the-g-chord',
  steps: [
    {
      type: 'card',
      title: 'The full G',
      body: 'Your one-finger {c:G} grows into the full six-string {c:G}. It stretches across the neck: finger 2 on string 6, fret 3 ({n:G}), finger 1 on string 5, fret 2 ({n:B}) and finger 3 on string 1, fret 3 ({n:G}). Strings 4, 3 and 2 ring open in the middle.',
      figure: { kind: 'chord', symbol: 'G', frets: '320003', fingers: '210003', caption: 'G: fingers 2, 1 and 3, with strings 4, 3 and 2 open.' },
    },
    {
      type: 'choice',
      prompt: 'Which strings ring open in the full {c:G}?',
      options: [
        { text: 'Strings 4, 3 and 2', correct: true },
        { text: 'Strings 6 and 5', why: 'Strings 6 and 5 have fingers 2 and 1 on them, at frets 3 and 2.' },
        { text: 'Only string 1', why: 'String 1 has finger 3 on it, at fret 3.' },
      ],
      explain: 'The three fingers sit on the outside strings, 6, 5 and 1, and the three middle strings, 4, 3 and 2, ring open. Every string sounds in {c:G}.',
      fact: 'g-full-shape',
    },
    {
      type: 'play-phrase',
      prompt: 'Hold {c:G} and play it string by string, from string 6 to string 1. Listen closely to the open strings 4, 3 and 2.',
      notes: [
        { string: 6, fret: 3, duration: 'q' },
        { string: 5, fret: 2, duration: 'q' },
        { string: 4, fret: 0, duration: 'q' },
        { string: 3, fret: 0, duration: 'q' },
        { string: 2, fret: 0, duration: 'q' },
        { string: 1, fret: 3, duration: 'q' },
      ],
      octave: 'exact',
      tempo: 60,
      explain: '{n:G}, {n:B}, then the open {n:D}, {n:G} and {n:B}, and {n:G} on top. If an open string sounded dull, finger 1 or 2 is leaning on it: arch them like a bridge.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'G',
        frets: '320003',
        accept: 'this-shape',
        prompt: 'Build the full {c:G}: three fingers, three open strings in the middle.',
        explain: 'String 6 fret 3, string 5 fret 2 and string 1 fret 3, with strings 4, 3 and 2 open.',
      },
    },
    {
      type: 'play-chord',
      prompt: 'Now strum {c:G} once, slowly, on all six strings.',
      chord: 'G',
      frets: '320003',
      explain: 'All six strings ring in {c:G}. A buzz on string 6 usually means finger 2 is too far from fret 3: move it closer.',
      alternative: { generate: 'chord-shape', params: { chords: ['G'], accept: 'this-shape' } },
    },
    {
      type: 'card',
      title: 'The anchor finger',
      body: 'Here is a trick for {c:Em} to {c:G}. Play {c:Em} with fingers 1 and 2 instead of 2 and 3. Now finger 1 sits on string 5, fret 2, and it is in the same place in {c:G}. It never leaves the string: it is the {t:anchor-finger|anchor}, and the other fingers swing around it.',
      figure: { kind: 'chord', symbol: 'Em', frets: '022000', fingers: '012000', caption: '{c:Em} with fingers 1 and 2: finger 1 stays put for {c:G}.' },
    },
    {
      type: 'true-false',
      statement: 'Going from {c:Em} (fingers 1 and 2) to {c:G}, finger 1 stays on string 5, fret 2.',
      answer: true,
      explain: 'String 5, fret 2 ({n:B}) is in both chords. Finger 1 stays pressed while finger 2 moves to string 6 and finger 3 lands on string 1.',
      fact: 'em-g-anchor',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap the anchor: the note finger 1 keeps pressed from {c:Em} to {c:G}.',
      find: { note: 'B2' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 4],
      explain: 'String 5, fret 2 is {n:B}, a note of both {c:Em} and {c:G}. Keep finger 1 there and the change gets much smaller.',
    },
    playerTask({
      id: 'em-g-ladder',
      title: 'Change ladder: E minor and G',
      song: 'st-change-em-d-em-g',
      bars: [9, 16],
      minutes: 4,
      body: 'Bars 9 to 16 of the change study, at 60 BPM: {c:Em} with fingers 1 and 2, then {c:G}, one strum a bar, then two, then four, then a change every two beats. Finger 1 never leaves string 5, fret 2.',
      tip: 'If finger 1 lifts by habit, press it a tiny bit harder on the change. Lightly, no squeezing.',
    }),
    toolTask({
      id: 'em-g-minute',
      title: 'One-minute changes: E minor to G',
      tool: 'chords',
      params: ['trainer', 'e-minor', 'g-major'],
      minutes: 2,
      body: 'One minute of {c:Em} to {c:G} and back, one strum per chord, with finger 1 as the anchor. Count the changes where every string rang, and note your score.',
    }),
    { generate: 'chord-shape', params: { chords: ['G', 'Em', 'D'] } },
  ],
  facts: [
    { id: 'g-full-shape', front: 'Where do the fingers go for the full G?', back: 'Finger 2 on string 6 fret 3, finger 1 on string 5 fret 2, finger 3 on string 1 fret 3; strings 4, 3 and 2 open.' },
    { id: 'em-g-anchor', front: 'The anchor for {c:Em} to {c:G}?', back: 'Play {c:Em} with fingers 1 and 2: finger 1 stays on string 5, fret 2 ({n:B}) for both chords.' },
  ],
};

// ── 2. Michael, Row the Boat Ashore ─────────────────────────────────────────────────────────────

/** Michael, Row is not in the song library yet: until it lands, its tasks jam on D, G and A. */
const MICHAEL_FALLBACK = { tool: 'progressions' as const, params: ['folk-i-iv-i-v', 'd', 'jam'] };

const michaelRow: TeacherLesson = {
  id: 'michael-row',
  title: 'Michael, Row the Boat Ashore',
  teaches: 'D, G and A are the chords on the 1st, 4th and 5th notes of the D major scale, so they sound like a family.',
  minutes: 5,
  skill: 'teacher:mia:michael-row',
  steps: [
    {
      type: 'card',
      title: 'A call and an answer',
      body: 'Michael, Row the Boat Ashore was sung by enslaved people on the Sea Islands, off the coast of South Carolina, and printed in 1867. One voice sings a line and everyone answers "Hallelujah". It needs three chords: {c:D}, {c:G} and {c:A}.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['D', 'G', 'D', 'A', 'D'], beats: 4, tempo: 92 }, label: 'Hear D, G and A' },
    },
    {
      type: 'choice',
      prompt: 'In Michael, Row the Boat Ashore, who sings "Hallelujah"?',
      options: [
        { text: 'Everyone, answering the line', correct: true },
        { text: 'One voice alone', why: 'One voice sings the line; the answer, Hallelujah, is everyone together.' },
        { text: 'Only the song leader', why: 'The leader sings the line. The answer, Hallelujah, is everyone together.' },
      ],
      explain: 'It is a call and response: one voice sings a line, and everyone answers "Hallelujah".',
    },
    {
      type: 'card',
      title: 'Three chords, one family',
      body: 'A song\'s {t:key} is its home note and the notes that belong with it. In the key of {n:D} they are {n:D} {n:E} {n:F#} {n:G} {n:A} {n:B} {n:C#}: played in order, the {n:D} major {t:scale}. {c:D}, {c:G} and {c:A} are the chords built on its 1st, 4th and 5th notes, which is why they sound like a family.',
      figure: { kind: 'audio', sound: { kind: 'scale', tonic: 'D3', scale: 'major', direction: 'up', tempo: 80 }, label: 'Hear the D major scale' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the notes of the key of {n:D}.',
      text: '{n:D}  {n:E}  ___  {n:G}  {n:A}  {n:B}  ___',
      blanks: ['{n:F#}', '{n:C#}'],
      bank: ['{n:F}', '{n:C}'],
      explain: 'The key of {n:D} has two sharps: {n:D} {n:E} {n:F#} {n:G} {n:A} {n:B} {n:C#}. That {n:F#} is the note on string 1, fret 2 in your {c:D} chord.',
      fact: 'key-of-d',
    },
    {
      type: 'choice',
      prompt: 'Counting from {n:D}, which note of the scale is {n:G}?',
      options: [
        { text: 'The 4th', correct: true },
        { text: 'The 5th', why: 'The 5th note is {n:A}: {n:D} {n:E} {n:F#} {n:G} {n:A}.' },
        { text: 'The 3rd', why: 'The 3rd note is {n:F#}. Count again from {n:D} as 1.' },
      ],
      explain: '{n:D} is 1, {n:E} 2, {n:F#} 3, {n:G} 4, {n:A} 5. So {c:G} is the chord on the 4th note and {c:A} the chord on the 5th.',
      fact: 'd-g-a-family',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each chord with the strings you strum.',
      pairs: [
        { left: '{c:D}', right: 'Strings 4 to 1' },
        { left: '{c:A}', right: 'Strings 5 to 1' },
        { left: '{c:G}', right: 'All six strings' },
      ],
      explain: 'Each chord starts on its own lowest string: {c:D} on the open string 4, {c:A} on the open string 5, {c:G} on string 6. Aim the first strum there.',
      fact: 'd-a-g-strings',
    },
    playerTask({
      id: 'michael-downstrums',
      title: 'Michael, Row: four downstrums a bar',
      song: 'michael-row-the-boat-ashore',
      tempo: 87,
      minutes: 4,
      body: 'Play it at about 80 BPM, four downstrums in every bar, {c:D}, {c:G} and {c:A}. Then go up to 100 % (92 BPM). Aim each first strum at the chord\'s lowest string.',
      tip: 'Hum the Hallelujah answers while you strum: it helps you feel where each line ends.',
      fallback: {
        ...MICHAEL_FALLBACK,
        title: 'Jam on D, G and A',
        body: 'Michael, Row is not in the Songs library yet, so jam on its three chords with the band: {c:D}, {c:G}, {c:D}, {c:A}, {c:D}, {c:G}, {c:A}, {c:D}. Turn the band down to about 80 BPM with the minus button, play four downstrums a bar, and aim each first strum at the chord\'s lowest string.',
      },
    }),
    {
      type: 'play-chord',
      prompt: 'Strum {c:A} once, starting on the open string 5.',
      chord: 'A',
      frets: 'x02220',
      explain: '{c:A} rings on strings 5 to 1. Starting on the open string 5 ({n:A}) gives it its full, clear sound, with no low {n:E} under it.',
      alternative: { generate: 'chord-shape', params: { chords: ['A', 'D', 'G'] } },
    },
    playerTask({
      id: 'michael-eighths',
      title: 'Michael, Row in down-up eighths',
      song: 'michael-row-the-boat-ashore',
      minutes: 4,
      body: 'Now down-up eighths at 92 BPM: down on every number, up on every &. Sing or hum the "Hallelujah" answer at the end of each line.',
      tip: 'Keep the hand swinging through the changes. A late chord is fine; a stopped hand is not.',
      fallback: {
        ...MICHAEL_FALLBACK,
        title: 'Jam on D, G and A, in eighths',
        body: 'The same jam with the band, now in down-up eighths: down on every number, up on every &. Raise the tempo toward 92 BPM when the changes feel easy, and hum along if a tune comes to you.',
      },
    }),
    toolTask({
      id: 'd-g-a-minute',
      title: 'One-minute changes: D, G and A',
      tool: 'chords',
      params: ['trainer', 'd-major', 'g-major'],
      minutes: 2,
      body: 'One minute of {c:D} to {c:G} and back, then pick {c:G} and {c:A} for another minute. Count the changes where every string rang, and note both scores.',
    }),
    {
      type: 'true-false',
      statement: '{c:D}, {c:G} and {c:A} are built on the 1st, 4th and 5th notes of the {n:D} major scale.',
      answer: true,
      explain: '{n:D} is the 1st note, {n:G} the 4th and {n:A} the 5th. Chords built on those three notes sound like one family, the family of the key.',
      fact: 'd-g-a-family',
    },
  ],
  facts: [
    { id: 'key-of-d', front: 'Name the notes of the key of D, in order.', back: '{n:D} {n:E} {n:F#} {n:G} {n:A} {n:B} {n:C#}: the {n:D} major scale.' },
    { id: 'd-g-a-family', front: 'Why do {c:D}, {c:G} and {c:A} sound like a family?', back: 'They are the chords built on the 1st, 4th and 5th notes of the {n:D} major scale.' },
    { id: 'd-a-g-strings', front: 'Which strings do you strum for {c:D}, {c:A} and {c:G}?', back: '{c:D} strings 4 to 1, {c:A} strings 5 to 1, {c:G} all six.' },
  ],
};

// ── 3. The C chord ──────────────────────────────────────────────────────────────────────────────

const theCChord: TeacherLesson = {
  id: 'the-c-chord',
  title: 'The C chord',
  teaches: 'C climbs in steps: fret 3 on string 5, fret 2 on string 4, fret 1 on string 2, with strings 3 and 1 open.',
  minutes: 5,
  skill: 'teacher:mia:the-c-chord',
  steps: [
    {
      type: 'card',
      title: 'C climbs in steps',
      body: '{c:C} climbs the neck in steps: finger 3 on string 5, fret 3 ({n:C}), finger 2 on string 4, fret 2 ({n:E}) and finger 1 on string 2, fret 1 ({n:C}). Strings 3 and 1 ring open, and string 6 is left out: start the strum on string 5.',
      figure: { kind: 'chord', symbol: 'C', frets: 'x32010', fingers: 'x32010', caption: 'C: fingers 3, 2 and 1 climbing, strings 3 and 1 open.' },
    },
    {
      type: 'fretboard-name',
      prompt: 'Finger 3 presses string 5, fret 3 in {c:C}. Which note is it?',
      position: { string: 5, fret: 3 },
      ask: 'note',
      spelling: 'any',
      options: ['C', 'B', 'D', 'A'],
      explain: 'String 5, fret 3 is {n:C}, the note the chord is named after and its lowest note.',
      fact: 'c-shape',
    },
    {
      type: 'play-phrase',
      prompt: 'Hold {c:C} and play it string by string, from string 5 to string 1. Listen for the open strings 3 and 1.',
      notes: [
        { string: 5, fret: 3, duration: 'q' },
        { string: 4, fret: 2, duration: 'q' },
        { string: 3, fret: 0, duration: 'q' },
        { string: 2, fret: 1, duration: 'q' },
        { string: 1, fret: 0, duration: 'q' },
      ],
      octave: 'exact',
      tempo: 60,
      explain: '{n:C}, {n:E}, the open {n:G}, {n:C}, and the open {n:E} on top. If string 3 or 1 sounded dull, a finger is leaning on it.',
      alternative: {
        type: 'order',
        prompt: 'Put the notes of {c:C} in order, from string 5 to string 1.',
        tiles: ['{n:C}', '{n:E}', '{n:G}', '{n:C}', '{n:E}'],
        distractors: ['{n:F}'],
        explain: 'String 5 fret 3 is {n:C}, string 4 fret 2 {n:E}, the open string 3 {n:G}, string 2 fret 1 {n:C} and the open string 1 {n:E}.',
      },
    },
    {
      type: 'card',
      title: 'Arch like a bridge',
      body: 'The usual problem with {c:C} is finger 1 or 2 leaning on the open string 3 or 1, so it sounds muffled. Arch your fingers like a bridge, so each fingertip comes down from above and touches only its own string.',
      tip: 'Check one string at a time. When all five ring, strum and enjoy it.',
    },
    {
      type: 'listen-choice',
      prompt: 'Mia plays {c:C} string by string, from string 5. It should be {n:C}, {n:E}, {n:G}, {n:C}, {n:E}. One string was muffled. Which?',
      sound: { kind: 'notes', notes: ['C3', 'E3', 'C4', 'E4'], tempo: 60 },
      options: [
        { text: 'String 3, the open {n:G}', correct: true },
        { text: 'String 1, the open {n:E}' },
        { text: 'String 5, the {n:C}' },
      ],
      explain: 'You heard {n:C}, {n:E}, then straight to {n:C}: the open {n:G} on string 3 was missing. Finger 2 was leaning on it. Arch it.',
    },
    {
      type: 'play-chord',
      prompt: 'Now strum {c:C} once, slowly, from string 5.',
      chord: 'C',
      frets: 'x32010',
      explain: 'Five strings ring in {c:C}: {n:C}, {n:E}, {n:G}, {n:C}, {n:E}. Every note belongs to {c:C}, which is why it sounds so warm.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'C',
        frets: 'x32010',
        accept: 'this-shape',
        prompt: 'Build {c:C}: three fingers climbing, string 6 left out.',
        explain: 'String 5 fret 3, string 4 fret 2 and string 2 fret 1, with strings 3 and 1 open.',
      },
    },
    {
      type: 'card',
      title: 'G with fingers 3, 2 and 4',
      body: 'For {c:G} to {c:C}, many players finger {c:G} another way: finger 3 on string 6, finger 2 on string 5, finger 4 on string 1. Then fingers 3 and 2 keep their shape and simply move one string toward string 1 for {c:C}, and finger 1 lands on string 2.',
      figure: { kind: 'chord', symbol: 'G', frets: '320003', fingers: '320004', caption: 'G with fingers 3, 2 and 4: the 3-2 pair moves over one string for C.' },
    },
    {
      type: 'choice',
      prompt: 'From {c:G} (fingers 3, 2 and 4) to {c:C}, what do fingers 3 and 2 do?',
      options: [
        { text: 'Keep their shape and move over one string', correct: true },
        { text: 'Stay exactly where they are', why: 'They move: from strings 6 and 5 to strings 5 and 4, toward string 1.' },
        { text: 'Swap places', why: 'Finger 3 stays above finger 2. The pair just moves one string toward string 1.' },
      ],
      explain: 'In {c:G} fingers 3 and 2 are on strings 6 and 5; in {c:C} they are on strings 5 and 4, the same shape one string over. Finger 1 lands on string 2, fret 1.',
      fact: 'g-c-pair',
    },
    playerTask({
      id: 'g-c-ladder',
      title: 'Change ladder: G and C',
      song: 'st-change-g-c-c-g7',
      bars: [1, 8],
      tempo: 83,
      minutes: 4,
      body: 'Bars 1 to 8 of the change study, at about 60 BPM: {c:G} fingered 3, 2 and 4, then {c:C}. One strum a bar, then two, then four, then a change every two beats.',
      tip: 'Lead with fingers 3 and 2 as one piece. Finger 1 can arrive a moment later.',
    }),
    toolTask({
      id: 'g-c-minute',
      title: 'One-minute changes: G to C',
      tool: 'chords',
      params: ['trainer', 'g-major', 'c-major'],
      minutes: 2,
      body: 'One minute of {c:G} to {c:C} and back. This is the hardest change so far, so whatever your score is today, it is simply the number to beat. Note it down.',
    }),
    { generate: 'chord-shape', params: { chords: ['C', 'G'] } },
  ],
  facts: [
    { id: 'c-shape', front: 'Where do the fingers go for C?', back: 'Finger 3 on string 5 fret 3, finger 2 on string 4 fret 2, finger 1 on string 2 fret 1; strings 3 and 1 open, string 6 left out.' },
    { id: 'g-c-pair', front: 'The easy way from {c:G} to {c:C}?', back: 'Finger {c:G} 3, 2 and 4: fingers 3 and 2 keep their shape and move one string toward string 1, and finger 1 lands on string 2, fret 1.' },
  ],
};

// ── 4. D7 and the pull toward home ──────────────────────────────────────────────────────────────

const theD7Chord: TeacherLesson = {
  id: 'the-d7-chord',
  title: 'D seven and the pull toward home',
  teaches: 'D seven is a slanted triangle on strings 3, 2 and 1; its added C makes it lean toward G.',
  minutes: 5,
  skill: 'teacher:mia:the-d7-chord',
  steps: [
    {
      type: 'card',
      title: 'D seven: a slanted triangle',
      body: '{c:D7} is a small slanted triangle: finger 2 on string 3, fret 2 ({n:A}), finger 1 on string 2, fret 1 ({n:C}) and finger 3 on string 1, fret 2 ({n:F#}). Strum strings 4 to 1, as for {c:D}.',
      figure: { kind: 'chord', symbol: 'D7', frets: 'xx0212', fingers: 'xx0213', caption: '{c:D7}: strings 4 to 1, the open string 4 at the bottom.' },
    },
    {
      type: 'choice',
      prompt: 'What does the 7 add to {c:D}?',
      options: [
        { text: 'One note: {n:C}', correct: true },
        { text: 'A seventh string', why: 'The guitar still has six strings. The 7 adds one note to the chord.' },
        { text: 'One note: {n:B}', why: '{n:B} is not in {c:D7}. The added note is {n:C}, on string 2, fret 1.' },
      ],
      explain: '{c:D} is {n:D}, {n:F#} and {n:A}. {c:D7} adds {n:C}, on string 2, fret 1, where {c:D} has {n:D} at fret 3.',
      fact: 'd7-adds-c',
    },
    {
      type: 'play-chord',
      prompt: 'Strum {c:D7} once, from the open string 4.',
      chord: 'D7',
      frets: 'xx0212',
      explain: 'Four strings ring: {n:D}, {n:A}, {n:C} and {n:F#}. If string 1 buzzes, finger 3 needs to come a little closer to fret 2.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'D7',
        frets: 'xx0212',
        accept: 'this-shape',
        prompt: 'Build {c:D7}: the slanted triangle on strings 3, 2 and 1.',
        explain: 'String 3 fret 2, string 2 fret 1 and string 1 fret 2, over the open string 4.',
      },
    },
    {
      type: 'card',
      title: 'Leaning toward home',
      body: 'That one extra note, {n:C}, makes {c:D7} lean forward. It sounds unfinished, as if it wants to move home to {c:G}. Listen: {c:D7}, then {c:G}. Hear how {c:G} settles it.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['D7', 'G'], beats: 4, tempo: 60 }, label: 'Hear {c:D7} move home to {c:G}' },
    },
    {
      type: 'listen-choice',
      prompt: 'Listen to how this ends. Does it sound finished, or leaning?',
      sound: { kind: 'progression', chords: ['G', 'C', 'D7'], beats: 4, tempo: 72 },
      options: [{ text: 'Finished, at home' }, { text: 'Leaning, not finished', correct: true }],
      shuffle: false,
      explain: 'It ended on {c:D7}, leaning toward {c:G}. You can almost hear the {c:G} that should come next.',
      fact: 'd7-leans',
    },
    {
      type: 'card',
      title: 'The four-finger G',
      body: 'For {c:D} to {c:G}, try this {c:G}: fingers 2 and 1 on strings 6 and 5 as usual, finger 3 on string 2, fret 3 ({n:D}) and finger 4 on string 1, fret 3. In {c:D}, finger 3 is already on string 2, fret 3: it stays put through the change.',
      figure: { kind: 'chord', symbol: 'G', frets: '320033', fingers: '210034', caption: 'The four-finger G: finger 3 on string 2, fret 3 stays from D.' },
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap the note that stays put between {c:D} and the four-finger {c:G}.',
      find: { note: 'D4' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 4],
      explain: 'String 2, fret 3 ({n:D}) is in both shapes, under finger 3. Keep it pressed and move the others around it.',
      fact: 'four-finger-g',
    },
    playerTask({
      id: 'g-d7-ladder',
      title: 'Change ladder: G, D seven, D and G',
      song: 'st-change-g-d7-d-g',
      tempo: 83,
      minutes: 4,
      body: 'Both halves of the change study at about 60 BPM: first {c:G} and {c:D7}, then {c:D} and the four-finger {c:G}, with finger 3 staying on string 2, fret 3. One strum a bar, then two, then four, then every two beats.',
    }),
    {
      type: 'listen-choice',
      prompt: 'And this one: finished, or leaning?',
      sound: { kind: 'progression', chords: ['G', 'C', 'D7', 'G'], beats: 4, tempo: 72 },
      options: [{ text: 'Finished, at home', correct: true }, { text: 'Leaning, not finished' }],
      shuffle: false,
      explain: 'This time {c:D7} moved on to {c:G}, and the music came home. That pull from {c:D7} to {c:G} is in thousands of songs.',
    },
    toolTask({
      id: 'g-d7-minute',
      title: 'One-minute changes: G to D seven',
      tool: 'chords',
      params: ['trainer', 'g-major', 'd-7'],
      minutes: 3,
      body: 'One minute of {c:G} to {c:D7} and back, then pick {c:D} and {c:G} for another minute with the four-finger {c:G}. Count the clean changes and note both scores.',
    }),
    {
      type: 'true-false',
      statement: 'You strum {c:D7} on strings 4 to 1, the same strings as {c:D}.',
      answer: true,
      explain: 'Both start on the open string 4 ({n:D}) and leave strings 6 and 5 out.',
    },
  ],
  facts: [
    { id: 'd7-adds-c', front: 'Where do the fingers go for {c:D7}, and what does the 7 add?', back: 'Finger 2 on string 3 fret 2, finger 1 on string 2 fret 1, finger 3 on string 1 fret 2. The 7 adds {n:C}.' },
    { id: 'd7-leans', front: 'How does {c:D7} sound on its own?', back: 'Unfinished, leaning forward: it wants to move home to {c:G}.' },
    { id: 'four-finger-g', front: 'Why use the four-finger {c:G} after {c:D}?', back: 'Finger 3 on string 2, fret 3 ({n:D}) is in both chords, so it stays put through the change.' },
  ],
};

// ── 5. She'll Be Coming 'Round the Mountain ─────────────────────────────────────────────────────

const comingRoundTheMountain: TeacherLesson = {
  id: 'coming-round-the-mountain',
  title: "She'll Be Coming 'Round the Mountain",
  teaches: 'G, C and D seven are the one, four and five-seven of G major: three chords for thousands of folk songs.',
  minutes: 5,
  skill: 'teacher:mia:coming-round-the-mountain',
  steps: [
    {
      type: 'card',
      title: 'Three chords, in numbers',
      body: '{c:G}, {c:C} and {c:D7} are the chords built on the 1st, 4th and 5th notes of the {n:G} major scale. Musicians write them as {t:roman-numerals}: {r:I}, {r:IV} and {r:V7}. Together these three chords carry thousands of folk songs.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['G', 'C', 'G', 'D7', 'G'], beats: 4, tempo: 96 }, label: 'Hear {r:I}, {r:IV}, {r:V7} in {n:G}' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each roman numeral with its chord in {k:G major}.',
      pairs: [
        { left: '{r:I}', right: '{c:G}' },
        { left: '{r:IV}', right: '{c:C}' },
        { left: '{r:V7}', right: '{c:D7}' },
      ],
      explain: 'In {k:G major} the 1st note is {n:G}, the 4th {n:C} and the 5th {n:D}: {r:I} is {c:G}, {r:IV} is {c:C} and {r:V7} is {c:D7}.',
      fact: 'g-one-four-five',
    },
    {
      type: 'card',
      title: 'The chart, line by line',
      body: 'Each line takes two bars. Line 1: {c:G}. Line 2: {c:G}, turning to {c:D7} on its last word, "comes". Line 3: {c:G}, then {c:C} for its second half. Line 4: {c:G}, {c:D7}, then {c:G} to finish. Each time through, add a verse, as the song is meant to be sung.',
      figure: { kind: 'chord', symbol: 'D7', frets: 'xx0212', fingers: 'xx0213', caption: '{c:D7} arrives at the end of line 2 and in line 4.' },
    },
    {
      type: 'order',
      prompt: 'Put the chord changes of one verse in order, from the chart.',
      tiles: ['{c:G}', '{c:D7}', '{c:G}', '{c:C}', '{c:G}', '{c:D7}', '{c:G}'],
      explain: '{c:G}, {c:D7} at the end of line 2, back to {c:G}, {c:C} in line 3, then {c:G}, {c:D7} and {c:G} in the last line.',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap down-up eighth notes with the click, and lean on beats 2 and 4.',
      rhythm: { pattern: 'e e e e e e e e' },
      tempo: 84,
      show: 'both',
      explain: 'Eight even strokes, a little stronger on 2 and 4. The lean on 2 and 4 gives the song its bounce; the timing stays exactly even.',
    },
    toolTask({
      id: 'backbeat',
      title: 'Down-up eighths, accents on 2 and 4',
      tool: 'rhythm',
      params: ['strum', 'backbeat'],
      minutes: 3,
      body: 'Strum or tap down-up eighths along with the trainer and dig in a little on beats 2 and 4, where a drummer would hit the snare. Everything else stays light. Two rounds, then come back.',
      tip: 'An accent is louder, never earlier. If you start to rush, make the other strums softer instead.',
    }),
    {
      type: 'choice',
      prompt: 'Which beats get the accent in this song?',
      options: [
        { text: 'Beats 2 and 4', correct: true },
        { text: 'Beat 1 only', why: 'In Drunken Sailor you leaned on 1. Here the bounce comes from 2 and 4.' },
        { text: 'Every &', why: 'The & strums are the light upstrums. The accents go on beats 2 and 4.' },
      ],
      explain: 'Leaning on 2 and 4 gives the song its bounce, like a drummer\'s snare.',
      fact: 'accent-two-four',
    },
    playerTask({
      id: 'mountain',
      title: "She'll Be Coming 'Round the Mountain",
      song: 'coming-round-the-mountain',
      tempo: 78,
      minutes: 5,
      body: 'Play it at about 84 BPM, down-up eighths with beats 2 and 4 a little harder. Then 89 % (about 96 BPM), then 100 % (108 BPM). Three verses: sing them if you can.',
      tip: 'The {c:D7} at the end of line 2 comes quickly. Look at the triangle while you still strum {c:G}.',
    }),
    {
      type: 'true-false',
      statement: 'In the key of {n:G}, {r:IV} is the {c:C} chord.',
      answer: true,
      explain: 'Count up the {n:G} major scale: {n:G} {n:A} {n:B} {n:C}. The 4th note is {n:C}, so {r:IV} is {c:C}.',
      fact: 'g-one-four-five',
    },
  ],
  facts: [
    { id: 'g-one-four-five', front: 'In {k:G major}, which chords are {r:I}, {r:IV} and {r:V7}?', back: '{c:G}, {c:C} and {c:D7}: the chords on the 1st, 4th and 5th notes of the scale.' },
    { id: 'accent-two-four', front: 'Where do the accents go in a bouncy folk strum?', back: 'On beats 2 and 4. Louder, never earlier.' },
  ],
};

// ── 6. Amazing Grace, from memory (milestone) ───────────────────────────────────────────────────

/** Bars 1 to 16 (verse 1) of Amazing Grace: the bass note on beat 1 of each bar, as the library's strum part has it. */
const GRACE_BASS = [
  { string: 6, fret: 3, duration: 'h.' },
  { string: 6, fret: 3, duration: 'h.' },
  { string: 5, fret: 3, duration: 'h.' },
  { string: 6, fret: 3, duration: 'h.' },
  { string: 6, fret: 3, duration: 'h.' },
  { string: 6, fret: 3, duration: 'h.' },
  { string: 4, fret: 0, duration: 'h.' },
  { string: 4, fret: 0, duration: 'h.' },
  { string: 6, fret: 3, duration: 'h.' },
  { string: 6, fret: 3, duration: 'h.' },
  { string: 5, fret: 3, duration: 'h.' },
  { string: 6, fret: 3, duration: 'h.' },
  { string: 6, fret: 0, duration: 'h.' },
  { string: 4, fret: 0, duration: 'h.' },
  { string: 6, fret: 3, duration: 'h.' },
  { string: 6, fret: 3, duration: 'h.' },
];

/** The opening of the tune (the pickup and bars 1 to 4), as the library's tune track has it. */
const GRACE_OPENING = [
  { string: 4, fret: 0, duration: 'q' },
  { string: 3, fret: 0, duration: 'h' },
  { string: 2, fret: 0, duration: 'e' },
  { string: 3, fret: 0, duration: 'e' },
  { string: 2, fret: 0, duration: 'h' },
  { string: 3, fret: 2, duration: 'q' },
  { string: 3, fret: 0, duration: 'h' },
  { string: 4, fret: 2, duration: 'q' },
  { string: 4, fret: 0, duration: 'h' },
];

const amazingGrace: TeacherLesson = {
  id: 'amazing-grace',
  title: 'Amazing Grace, from memory',
  teaches: 'Amazing Grace is a 3/4 hymn with a pickup on beat 3: bass on 1, down-up on 2 and 3, from memory.',
  minutes: 5,
  skill: 'teacher:mia:amazing-grace',
  steps: [
    {
      type: 'card',
      title: 'Your first song from memory',
      body: 'Amazing Grace is a hymn in waltz time, 3/4, and its tune uses only five notes. It is the first song you will play without looking at a chart. You need {c:G}, {c:C} and {c:D7}, and {c:Em} once if you like.',
      figure: { kind: 'tab', notes: [...GRACE_OPENING], tempo: 84, caption: 'The tune\'s first line, to hum: it starts on the open string 4.' },
    },
    {
      type: 'card',
      title: 'Bass, down-up, down-up',
      body: 'The pattern: a bass note on 1, then down-up on 2 and down-up on 3. Count "1, 2 &, 3 &". The bass notes: string 6, fret 3 under {c:G}, string 5, fret 3 under {c:C}, the open string 4 under {c:D7} and the open string 6 under {c:Em}.',
      figure: { kind: 'rhythm', pattern: 'q e e e e', time: '3/4', tempo: 84, caption: 'One bar: bass on 1, down-up on 2, down-up on 3.' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap two bars of the pattern with the click: "1, 2 &, 3 &".',
      rhythm: { pattern: 'q e e e e | q e e e e', time: '3/4' },
      tempo: 72,
      show: 'both',
      explain: 'Five strokes a bar: the bass note on 1, then down-up on 2 and down-up on 3.',
      fact: 'grace-pattern',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each chord with its bass note on beat 1.',
      pairs: [
        { left: '{c:G}', right: 'String 6, fret 3' },
        { left: '{c:C}', right: 'String 5, fret 3' },
        { left: '{c:D7}', right: 'The open string 4' },
        { left: '{c:Em}', right: 'The open string 6' },
      ],
      explain: 'Each bass note is the note the chord is named after: {n:G}, {n:C}, {n:D} and {n:E}, each the lowest note of its shape.',
    },
    {
      type: 'card',
      title: 'Find the first note',
      body: 'The tune starts with a pickup on beat 3: count "1 2" and let the singer start on 3; you come in with your bass note on the next 1. Before you start, hum the first note and find it on the guitar. It is {n:D}, the open string 4, and it rises to {n:G}.',
    },
    {
      type: 'play-note',
      prompt: 'Play the first note of the tune: the open string 4, {n:D}. Hum it with the string.',
      note: 'D3',
      octave: 'exact',
      where: { string: 4, fret: 0 },
      explain: 'The tune starts on {n:D}, the open string 4: the pickup on beat 3, before the first full bar.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap the first note of the tune: {n:D}, on the open string 4.',
        find: { note: 'D3' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 3],
        explain: 'The open string 4 is {n:D}, the pickup that starts the tune.',
      },
    },
    {
      type: 'play-note',
      prompt: 'And where it rises to: the open string 3, {n:G}.',
      note: 'G3',
      octave: 'exact',
      where: { string: 3, fret: 0 },
      explain: 'From {n:D} the tune rises to {n:G}, the open string 3, on beat 1 of the first full bar: just where your first bass note goes.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap the note the tune rises to: {n:G}, on the open string 3.',
        find: { note: 'G3' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 3],
        explain: 'The open string 3 is {n:G}, the home note of the song.',
      },
    },
    playerTask({
      id: 'grace-chart',
      title: 'Amazing Grace, with the chart',
      song: 'amazing-grace',
      tempo: 86,
      minutes: 4,
      body: 'Play it with the chart at about 72 BPM: wait through the pickup, then bass on 1, down-up on 2 and 3. Where the chart says {c:G7}, play plain {c:G}: {c:G7} comes later. Then try 100 % (84 BPM).',
    }),
    playerTask({
      id: 'grace-memory',
      title: 'Amazing Grace, from memory',
      song: 'amazing-grace',
      minutes: 4,
      body: 'Now at 84 BPM, from memory: after the count-in, turn the screen away or close your eyes, and play with the band. Lost? Do not stop: listen for the bass line and come back in on beat 1 of the next bar.',
    }),
    {
      type: 'true-false',
      statement: 'In Amazing Grace, your first bass note comes on beat 3, together with the singer.',
      answer: false,
      explain: 'The singer starts alone on beat 3, the pickup. Your first bass note comes on the next 1.',
    },
    playerTask({
      id: 'brahms-encore',
      title: "Your encore: Brahms' Lullaby",
      song: 'brahms-lullaby',
      minutes: 5,
      body: 'Same three chords, same 3/4, at 72 BPM. In Options, pick the Teacher part: bass, strum, strum on {c:G}, {c:D7} and {c:C} under the melody. Then pick the Melody and play the tune, from the open string 3 ({n:G}) up to string 1, fret 3 ({n:G}).',
    }),
    {
      type: 'card',
      title: 'Your show',
      body: 'Amazing Grace, verse 1, from memory, at 84 {t:bpm|BPM}. The screen shows only your bass notes, one a bar: the chords and the strum are up to you. Let the pickup go by, and keep going through any mistake.',
    },
    {
      type: 'play-phrase',
      id: 'show',
      prompt: 'Your show: verse 1 of Amazing Grace, from memory. Bass on 1, down-up on 2 and 3. The microphone follows your bass notes.',
      notes: [...GRACE_BASS],
      octave: 'any',
      tempo: 84,
      pass: 0.8,
      explain: 'Four lines of four bars: {c:G} {c:G} {c:C} {c:G}, {c:G} {c:G} {c:D7} {c:D7}, {c:G} {c:G} {c:C} {c:G} (plain {c:G} for the chart\'s {c:G7}), {c:Em} {c:D7} {c:G} {c:G}. About 8 bass notes in 10 is a pass.',
      alternative: {
        type: 'order',
        prompt: 'Put the four lines of Amazing Grace in order, from memory.',
        tiles: ['{c:G} {c:G} {c:C} {c:G}', '{c:G} {c:G} {c:D7} {c:D7}', '{c:G} {c:G} {c:C} {c:G}', '{c:Em} {c:D7} {c:G} {c:G}'],
        explain: 'Lines 1 and 3 are the same, {c:G} {c:G} {c:C} {c:G}; line 2 ends on {c:D7}, leaning; line 4 comes home through {c:Em} and {c:D7} to {c:G}.',
      },
    },
  ],
  facts: [
    { id: 'grace-pattern', front: 'The strum pattern of Amazing Grace?', back: 'Bass note on 1, then down-up on 2 and down-up on 3: "1, 2 &, 3 &".' },
    { id: 'lost-from-memory', front: 'Playing from memory, you get lost. What do you do?', back: 'Listen for the bass line and come back in on beat 1 of the next bar.' },
  ],
};

/** Unit 5 of Mia's course. */
const unit: TeacherUnit = {
  id: 'mia-g-and-c',
  title: 'G, C and three-chord songs',
  theme: 'chords',
  description: 'Add G, C and D seven, play the three main chords of a key in real songs, and play Amazing Grace from memory.',
  lessons: [theGChord, michaelRow, theCChord, theD7Chord, comingRoundTheMountain, amazingGrace],
  checkpoint: { sample: 8, maxMistakes: 2 },
  milestone: {
    lesson: 'amazing-grace',
    step: 'show',
    piece: 'Amazing Grace',
    song: 'amazing-grace',
    celebrate: 'You played Amazing Grace from memory: a pickup, a waltz strum and three chords, with no chart to lean on. That is how musicians play. Next come minor chords, and the darker songs they make.',
  },
  glossary: [
    { id: 'anchor-finger', term: 'anchor finger', definition: 'A finger that stays on its string and fret through a chord change, while the other fingers move around it.' },
  ],
};

export default unit;
