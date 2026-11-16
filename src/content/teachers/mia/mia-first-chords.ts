/**
 * Mia, unit 2: Your first chords (plan: `mia/mia-first-chords` in src/content/plan/teachers.json).
 *
 * Chords in the plan's order: Em; E and Am as one moving shape; the one-finger G; A; E7. Each
 * lesson follows its plan entry: the `explain` in Mia's voice on the cards, the `show` as chord
 * boxes, fretboards and sounds, the `practice` as exercises (microphone steps always with a tapping
 * alternative) and tasks that send the learner to the chord trainer, the Metronome and the Player.
 *
 * Music from the song library: Strumming: Steady Quarters (60 BPM), Change: Am-E and E-B7 (72 BPM;
 * the Player at 83 % is 60 BPM), the Open-String Duet (80 BPM; 75 % is 60 BPM), Frere Jacques
 * (88 BPM; 86 % is about 76 BPM), Change: A and E7 (60 BPM) and Skip to My Lou (100 BPM; 80 % is
 * 80 BPM). The shapes and the tune quoted on a card are cross-checked in `mia-first-chords.test.ts`.
 *
 * Titles are plain text on every screen (the course map, task cards), so chord names are spelled
 * out there ("E minor"); in bodies they are tagged (`{c:Em}`) and shown as symbols.
 */
import type { TeacherLesson, TeacherUnit } from '../types';
import { playerTask, toolTask } from '../tasks';

/** The shapes of this unit, low string first, as the plan writes them. */
export const SHAPES = {
  Em: { frets: '022000', fingers: '023000' },
  E: { frets: '022100', fingers: '023100' },
  Am: { frets: 'x02210', fingers: 'x02310' },
  G: { frets: 'xx0003', fingers: 'xx0003' },
  A: { frets: 'x02220', fingers: 'x01230' },
  E7: { frets: '020100', fingers: '020100' },
} as const;

/** The A chord with the 2-1-3 fingering, for wide fingertips. */
export const A_WIDE_FINGERS = 'x02130';

/** The first four bars of the Frere Jacques tune (the library's Teacher track), heard on a card. */
export const JACQUES_TUNE = [
  { string: 3, fret: 0, duration: 'q' },
  { string: 3, fret: 2, duration: 'q' },
  { string: 2, fret: 0, duration: 'q' },
  { string: 3, fret: 0, duration: 'q' },
  { string: 3, fret: 0, duration: 'q' },
  { string: 3, fret: 2, duration: 'q' },
  { string: 2, fret: 0, duration: 'q' },
  { string: 3, fret: 0, duration: 'q' },
  { string: 2, fret: 0, duration: 'q' },
  { string: 2, fret: 1, duration: 'q' },
  { string: 2, fret: 3, duration: 'h' },
  { string: 2, fret: 0, duration: 'q' },
  { string: 2, fret: 1, duration: 'q' },
  { string: 2, fret: 3, duration: 'h' },
] as const;

type Shape = keyof typeof SHAPES;

/** A chord-build of one shape exactly as taught. */
function build(chord: Shape, prompt: string, explain: string, fact?: string) {
  return { type: 'chord-build' as const, task: 'fingers' as const, chord, frets: SHAPES[chord].frets, accept: 'this-shape' as const, prompt, explain, ...(fact ? { fact } : {}) };
}

// ── 1. Chord boxes and Em ───────────────────────────────────────────────────────────────────────

const chordBoxesAndEm: TeacherLesson = {
  id: 'chord-boxes-and-em',
  title: 'Chord boxes and E minor',
  teaches: 'A chord box shows strings up and down, frets across and fingers in dots; E minor is two fingers at fret 2.',
  minutes: 5,
  skill: 'teacher:mia:chord-boxes-and-em',
  steps: [
    {
      type: 'card',
      title: 'A chord, and its picture',
      body: 'A {t:chord} is several notes played together. A {t:chord-box|chord box} is a picture of where your fingers go. The up-and-down lines are the strings, string 6 on the left. The lines across are frets, and the thick line at the top is the {t:nut}.',
      figure: { kind: 'chord', symbol: 'Em', frets: SHAPES.Em.frets, fingers: SHAPES.Em.fingers, caption: 'The chord box of {c:Em}: two fingers, and all six strings ring.' },
      tip: 'The number in a dot is the finger: 1 index, 2 middle, 3 ring, 4 little. An o over a string means play it open; an x means leave it out.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each part of a chord box with what it means.',
      pairs: [
        { left: 'Up-and-down lines', right: 'The strings' },
        { left: 'Lines across', right: 'The frets' },
        { left: 'An o over a string', right: 'Play it open' },
        { left: 'An x over a string', right: 'Leave it out' },
        { left: 'A 3 in a dot', right: 'Your ring finger' },
      ],
      explain: 'Strings run up and down, string 6 on the left; frets run across, under the thick nut. o means open, x means do not play it, and a number in a dot is the finger to use.',
      fact: 'chord-box-lines',
    },
    {
      type: 'choice',
      prompt: 'In a chord box, which string is on the far left?',
      options: [
        { text: 'String 6, the thickest', correct: true },
        { text: 'String 1, the thinnest', why: 'String 1 is on the far right. The box is the neck standing up and facing you.' },
        { text: 'String 3', why: 'String 3 is in the middle, the fourth line from the left.' },
      ],
      explain: 'A chord box is the neck standing up, facing you, with the nut at the top: the thick string 6 on the left, the thin string 1 on the right.',
      fact: 'chord-box-lines',
    },
    {
      type: 'card',
      title: 'Your first chord: E minor',
      body: '{c:Em} (say "E minor") is the friendliest first chord. Finger 2 goes on string 5, fret 2 ({n:B}); finger 3 on string 4, fret 2 ({n:E}). Every other string is open, so all six ring. Arch your fingers so each one touches only its own string.',
      figure: {
        kind: 'fretboard',
        frets: [0, 3],
        labels: 'finger',
        dots: [
          { string: 5, fret: 2, note: 'B2', finger: 2 },
          { string: 4, fret: 2, note: 'E3', finger: 3 },
        ],
        caption: 'The same two fingers on the neck, seen as in tab: string 1 on top.',
      },
      tip: 'Some chord boxes show fingers 1 and 2 for {c:Em}. That works too, but 2 and 3 leave finger 1 free for the next chord, {c:E}.',
    },
    build('Em', 'Put the two fingers of {c:Em} on the empty chord box.', '{c:Em}: fret 2 on strings 5 and 4, and the other four strings open. Nothing has an x, so all six ring.', 'em-shape'),
    {
      type: 'choice',
      prompt: 'Which strings do you strum in {c:Em}?',
      options: [
        { text: 'All six', correct: true },
        { text: 'Strings 5 and 4 only', why: 'Those two have fingers on them, but the open strings belong to the chord too.' },
        { text: 'Strings 5 to 1', why: 'That is for a chord with an x over string 6. {c:Em} has no x.' },
      ],
      explain: 'No string has an x over it, so you strum all six, from string 6 down to string 1.',
    },
    {
      type: 'card',
      title: 'Hear it ring',
      body: 'Listen to {c:Em} one string at a time, from string 6 to string 1. Every note should ring. A dull thud means a finger is leaning on the next string: arch it more, so it stands on its tip.',
      figure: { kind: 'audio', sound: { kind: 'chord', chord: 'Em', frets: SHAPES.Em.frets, style: 'arpeggio' }, label: 'Hear it string by string' },
    },
    {
      type: 'play-chord',
      prompt: 'Pick {c:Em} one string at a time, 6 to 1, letting each ring, then strum it. The box says fingers 1 and 2; your 2 and 3 are fine.',
      chord: 'Em',
      frets: SHAPES.Em.frets,
      explain: 'All six strings ring in {c:Em}. If one sounded dull, arch that finger so it touches only its own string.',
      alternative: build('Em', 'From memory: build {c:Em}.', '{c:Em} is finger 2 on string 5, fret 2, and finger 3 on string 4, fret 2. All six strings ring.'),
    },
    {
      type: 'card',
      title: 'Four strums in every bar',
      body: 'Now strum {c:Em} with a {t:downstroke} on every beat: four in each {t:bar}, counting 1, 2, 3, 4 out loud. Keep your strumming hand going even if the chord is not perfect yet.',
      figure: { kind: 'audio', sound: { kind: 'strum', chord: 'Em', pattern: 'D-D-D-D-', tempo: 60, repeat: 2 }, label: 'Hear four strums a bar' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap the four downstrums of one bar, one on each click.',
      rhythm: { pattern: 'q q q q' },
      tempo: 60,
      show: 'both',
      explain: 'One strum on every beat, all the same size: 1, 2, 3, 4.',
    },
    toolTask({
      id: 'em-metronome',
      title: 'Strum E minor with the Metronome',
      tool: 'metronome',
      minutes: 4,
      body: 'Set the Metronome to 60 {t:bpm|BPM}, one click a second, and strum {c:Em} on every click: four strums a bar, 4 bars, then again. That is bars 1 to 4 of Strumming: Steady Quarters.',
      tip: 'Press only as hard as a clean note needs. Sore fingertips are normal at first; an aching hand or a sharp pain is not: stop and rest.',
    }),
    {
      type: 'choice',
      prompt: 'One string sounds dull when you strum {c:Em}. What helps most?',
      options: [
        { text: 'Arch the fingers so each touches one string', correct: true },
        { text: 'Strum much harder', why: 'A harder strum is louder, but the leaning finger still damps the string.' },
        { text: 'Leave that string out', why: '{c:Em} uses all six strings. Fix the finger instead.' },
      ],
      explain: 'A dull string is almost always a finger leaning on it. Stand each finger on its tip, just behind the fret wire.',
    },
  ],
  facts: [
    {
      id: 'chord-box-lines',
      front: 'In a chord box, what are the up-and-down lines, and what are the lines across?',
      back: 'Up and down: the strings, string 6 on the left. Across: the frets, under the thick nut. An o means open, an x means leave it out.',
    },
    { id: 'finger-numbers', front: 'Which fingers are 1, 2, 3 and 4?', back: '1 is the index finger, 2 the middle, 3 the ring and 4 the little finger.' },
    {
      id: 'em-shape',
      front: 'How do you play {c:Em}?',
      back: 'Finger 2 on string 5, fret 2; finger 3 on string 4, fret 2; strum all six strings.',
      ask: build('Em', 'Build {c:Em}.', '{c:Em}: finger 2 on string 5, fret 2, finger 3 on string 4, fret 2, all six strings.'),
    },
  ],
};

// ── 2. E and Am: one shape, two chords ──────────────────────────────────────────────────────────

const eAndAm: TeacherLesson = {
  id: 'e-and-am',
  title: 'E and A minor: one shape, two chords',
  teaches: 'E is E minor plus finger 1 on string 3, fret 1; the same shape one string over is A minor.',
  minutes: 5,
  skill: 'teacher:mia:e-and-am',
  steps: [
    {
      type: 'card',
      title: 'E is E minor plus one finger',
      body: 'Make {c:Em}. Keep fingers 2 and 3 where they are and add finger 1 on string 3, fret 1: {n:G#} ("G sharp", one fret above {n:G}). That is {c:E}. One note moves, the open {n:G} up to {n:G#}, and the dark {c:Em} turns bright.',
      figure: { kind: 'chord', symbol: 'E', frets: SHAPES.E.frets, fingers: SHAPES.E.fingers, caption: '{c:E}: finger 1 joins on string 3, fret 1.' },
    },
    {
      type: 'listen-choice',
      prompt: 'You hear {c:Em}, then {c:E}. Does the second chord sound brighter or darker?',
      sound: { kind: 'progression', chords: ['Em', 'E'], tempo: 60, beats: 4 },
      options: [{ text: 'Brighter', correct: true }, { text: 'Darker' }],
      shuffle: false,
      explain: '{c:E} is the bright one. Its {n:G#} is one fret above the {n:G} of {c:Em}, and that one note changes the mood of the whole chord.',
      fact: 'e-shape',
    },
    {
      type: 'play-chord',
      prompt: 'Play {c:E} string by string, then strum all six strings.',
      chord: 'E',
      frets: SHAPES.E.frets,
      explain: '{c:E} rings on all six strings. If string 3 buzzed, bring finger 1 right up to the fret wire.',
      alternative: build('E', 'Build {c:E} on the chord box.', '{c:E} is {c:Em} plus finger 1 on string 3, fret 1: frets 0 2 2 1 0 0 from string 6.'),
    },
    {
      type: 'card',
      title: 'Slide the shape one string over',
      body: 'Lift the whole {c:E} shape and move it one string toward string 1, without changing it: finger 2 on string 4, fret 2 ({n:E}), finger 3 on string 3, fret 2 ({n:A}), finger 1 on string 2, fret 1 ({n:C}). That is {c:Am}. Strum it from string 5; string 6 is left out.',
      figure: { kind: 'chord', symbol: 'Am', frets: SHAPES.Am.frets, fingers: SHAPES.Am.fingers, caption: '{c:Am}: the {c:E} shape one string over, with an x on string 6.' },
      tip: 'One shape that moves to make a new chord: that is the first secret of how the guitar works.',
    },
    {
      type: 'choice',
      prompt: 'Which string do you leave out in {c:Am}?',
      options: [
        { text: 'String 6', correct: true },
        { text: 'String 5', why: 'String 5 is the open {n:A}, the lowest note of {c:Am}: start the strum there.' },
        { text: 'String 1', why: 'String 1 rings open in {c:Am}.' },
        { text: 'None of them', why: 'Look at the box: string 6 has an x.' },
      ],
      explain: 'The x is over string 6. Start the strum on string 5, the open {n:A}, and let it run to string 1.',
      fact: 'am-shape',
    },
    {
      type: 'play-chord',
      prompt: 'Play {c:Am} string by string from string 5, then strum strings 5 to 1.',
      chord: 'Am',
      frets: SHAPES.Am.frets,
      explain: '{c:Am} rings on five strings, from the open {n:A} on string 5. If the low string 6 rang too, start the strum one string lower.',
      alternative: build('Am', 'Build {c:Am}, with string 6 left out.', '{c:Am}: an x on string 6, then frets 0 2 2 1 0 on strings 5 to 1.'),
    },
    toolTask({
      id: 'trainer-em-e',
      title: 'Change trainer: E minor to E',
      tool: 'chords',
      params: ['trainer', 'e-minor', 'e-major'],
      minutes: 1,
      body: 'Choose Changes in time, 60 {t:bpm|BPM}, 4 beats per chord, and change between {c:Em} and {c:E} for one minute. Only finger 1 moves. With the microphone on, the trainer counts your clean changes; without it, tap when your fingers land.',
      tip: 'Keep your thumb soft behind the neck. Sore fingertips are normal this week; an aching wrist or thumb is not: stop, shake it out and rest.',
    }),
    {
      type: 'true-false',
      statement: 'To go from {c:E} to {c:Am}, the three fingers keep their shape and move one string toward string 1.',
      answer: true,
      explain: 'Fingers 2, 3 and 1 stay in their triangle and all move over by one string. Only the chord box changes, not your hand.',
      fact: 'am-shape',
    },
    toolTask({
      id: 'trainer-e-am',
      title: 'Change trainer: E to A minor',
      tool: 'chords',
      params: ['trainer', 'e-major', 'a-minor'],
      minutes: 1,
      body: 'Same again for {c:E} and {c:Am}: 60 {t:bpm|BPM}, a change every 4 beats, for one minute. Move the three fingers together, as one shape.',
    }),
    playerTask({
      id: 'ladder-am-e',
      title: 'Change ladder: A minor and E',
      song: 'st-change-am-e-e-b7',
      bars: [1, 8],
      tempo: 83,
      minutes: 4,
      body: 'Bars 1 to 8 only, at about 60 {t:bpm|BPM}: one strum a bar, then two, then four, then a change every 2 beats. Strum {c:Am} from string 5 and {c:E} on all six. The second half has {c:B7}, which comes later.',
      tip: 'Keep the strumming hand moving through every change.',
    }),
    {
      type: 'fretboard-find',
      prompt: 'Tap the one note that turns {c:Em} into {c:E}.',
      find: { note: 'G#3' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 3],
      explain: 'String 3, fret 1 is {n:G#}, under finger 1. In {c:Em} that string rings open, as {n:G}.',
    },
    playerTask({
      id: 'duet-swap',
      title: 'Swap parts in the Open-String Duet',
      song: 'st-open-string-duet',
      bars: [1, 8],
      tempo: 75,
      minutes: 2,
      body: 'Now you play the chords. In Listen mode at 60 {t:bpm|BPM}, the app plays your old open-string part and the tune, and you strum {c:Em} for bars 1 to 4 and {c:Am} for bars 5 to 8, four downstrums a bar.',
      tip: 'Your chord sits right on top of the open string the app plays.',
    }),
    {
      type: 'choice',
      prompt: 'In {c:Am}, which finger plays string 2, fret 1?',
      options: [
        { text: 'Finger 1', correct: true },
        { text: 'Finger 2', why: 'Finger 2 is on string 4, fret 2.' },
        { text: 'Finger 3', why: 'Finger 3 is on string 3, fret 2.' },
      ],
      explain: 'Finger 1 moved over from string 3 to string 2, still at fret 1, and plays {n:C}.',
    },
  ],
  facts: [
    {
      id: 'e-shape',
      front: 'How does {c:Em} become {c:E}?',
      back: 'Keep fingers 2 and 3 and add finger 1 on string 3, fret 1 ({n:G#}). One note brightens the chord.',
      ask: build('E', 'Build {c:E}.', '{c:E}: {c:Em} plus finger 1 on string 3, fret 1.'),
    },
    {
      id: 'am-shape',
      front: 'How do you play {c:Am}?',
      back: 'The {c:E} shape one string toward string 1: fret 2 on strings 4 and 3, fret 1 on string 2. Strum from string 5.',
      ask: build('Am', 'Build {c:Am}.', '{c:Am}: an x on string 6, fret 2 on strings 4 and 3, fret 1 on string 2.'),
    },
  ],
};

// ── 3. One finger, one song: Frere Jacques ──────────────────────────────────────────────────────

const frereJacquesStrum: TeacherLesson = {
  id: 'frere-jacques-strum',
  title: 'One finger, one song: Frere Jacques',
  teaches: 'A one-finger G on strings 4 to 1 carries a whole song, so all your attention goes into a steady beat.',
  minutes: 5,
  skill: 'teacher:mia:frere-jacques-strum',
  steps: [
    {
      type: 'card',
      title: 'A G chord with one finger',
      body: 'This {c:G} uses one finger: finger 3 on string 1, fret 3 ({n:G}). Strings 4, 3 and 2 ring open. The x over strings 6 and 5 means miss them, so you strum strings 4 to 1 only: aim the pick at string 4 and let the strum stop after string 1.',
      figure: { kind: 'chord', symbol: 'G', frets: SHAPES.G.frets, fingers: SHAPES.G.fingers, caption: 'The one-finger {c:G}: an x over strings 6 and 5.' },
      tip: 'Some chord boxes show finger 1 here. Any finger works; I use finger 3, the finger that plays this note in the full {c:G} later on.',
    },
    build('G', 'Build the one-finger {c:G}. Tap above the nut to put an x on strings 6 and 5.', 'Finger 3 on string 1, fret 3, strings 4, 3 and 2 open, and an x on strings 6 and 5.', 'one-finger-g'),
    {
      type: 'play-chord',
      prompt: 'Strum the one-finger {c:G} four times, strings 4 to 1 only. The box shows finger 1 on string 1; your finger 3 is fine.',
      chord: 'G',
      frets: SHAPES.G.frets,
      explain: 'Four strings, four notes: {n:D}, {n:G}, {n:B} and {n:G}. If strings 6 and 5 rang, the microphone heard notes that do not belong: start the strum at string 4.',
      alternative: {
        type: 'choice',
        prompt: 'Which strings does this one-finger {c:G} use?',
        options: [
          { text: 'Strings 4 to 1', correct: true },
          { text: 'All six', why: 'Strings 6 and 5 have an x over them: miss them.' },
          { text: 'Only string 1', why: 'Finger 3 is on string 1, but strings 4, 3 and 2 ring open too.' },
        ],
        explain: 'An x over strings 6 and 5, so you strum the four thinnest strings: 4, 3, 2 and 1.',
      },
    },
    {
      type: 'card',
      title: 'One chord, so: the beat',
      body: 'Frère Jacques is a {t:round}: a second voice sings the same tune two bars later, and it still fits. The whole round works on this one chord, so all your attention can go into a steady beat: four downstrums in every bar.',
      figure: { kind: 'rhythm', pattern: 'q q q q', tempo: 76 },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap two bars of downstrums, four in each bar.',
      rhythm: { pattern: 'q q q q | q q q q' },
      tempo: 76,
      show: 'both',
      explain: 'Eight even strums, one on every beat. That is your whole part in Frère Jacques.',
    },
    {
      type: 'card',
      title: 'Hear the tune',
      body: 'This is how the tune begins. The app plays it while you strum, so hum along once before you start: it helps you keep your place.',
      figure: { kind: 'tab', tempo: 88, notes: [...JACQUES_TUNE], caption: 'The first four bars of the tune: the app plays this part.' },
    },
    playerTask({
      id: 'jacques-76',
      title: 'Frere Jacques at 76 BPM',
      song: 'frere-jacques',
      bars: [1, 8],
      tempo: 86,
      minutes: 4,
      body: 'All 8 bars at about 76 {t:bpm|BPM}: four downstrums a bar while the app plays the tune. Do not stop for anything. When it feels steady, set the speed to 100 % (88 BPM) and play it again.',
      tip: 'Lost your place? Keep strumming and listen for the start of the next bar.',
    }),
    {
      type: 'true-false',
      statement: 'An x over a string in a chord box means strum it very softly.',
      answer: false,
      explain: 'An x means miss that string completely. For this {c:G}, start the strum at string 4.',
      fact: 'x-means',
    },
    playerTask({
      id: 'jacques-round',
      title: 'Frere Jacques as a round',
      song: 'frere-jacques',
      bars: [9, 18],
      minutes: 3,
      body: 'Now the round, bars 9 to 18 at 88 {t:bpm|BPM}: the app plays the tune and a second voice comes in two bars later. Keep the same four strums a bar under both voices, right to the last strum.',
      tip: 'If the second voice pulls you off, count the beats, not the tune.',
    }),
    {
      type: 'choice',
      prompt: 'The second voice comes in while you strum. What changes in your part?',
      options: [
        { text: 'Nothing: the same four strums a bar', correct: true },
        { text: 'You change to a new chord', why: 'The whole round fits on one chord, so you stay on {c:G}.' },
        { text: 'You strum twice as fast', why: 'The beat stays the same. Only the tune gets busier.' },
      ],
      explain: 'A round fits on one chord, so your part stays exactly the same from the first bar to the last.',
      fact: 'round-song',
    },
  ],
  facts: [
    {
      id: 'one-finger-g',
      front: 'How do you play the one-finger {c:G}?',
      back: 'Finger 3 on string 1, fret 3. Strum strings 4 to 1 and miss strings 6 and 5.',
      ask: build('G', 'Build the one-finger {c:G}.', 'Finger 3 on string 1, fret 3, with an x on strings 6 and 5.'),
    },
    { id: 'x-means', front: 'In a chord box, what does an x over a string mean?', back: 'Leave that string out: do not strum it.' },
    { id: 'round-song', front: 'What is a round?', back: 'A song where a second voice starts the same tune a little later, and it still fits. Frère Jacques is one.' },
  ],
};

// ── 4. The A chord and your first change ────────────────────────────────────────────────────────

const theAChord: TeacherLesson = {
  id: 'the-a-chord',
  title: 'The A chord and your first change',
  teaches: 'A is three fingers side by side at fret 2; when you change chords, the beat matters more than the chord.',
  minutes: 5,
  skill: 'teacher:mia:the-a-chord',
  steps: [
    {
      type: 'card',
      title: 'A: three fingers in a row',
      body: '{c:A} puts three fingers side by side at fret 2: finger 1 on string 4, finger 2 on string 3, finger 3 on string 2. Squeeze them in so each sits just behind the fret. Strum from string 5, the open {n:A}, and miss string 6.',
      figure: { kind: 'chord', symbol: 'A', frets: SHAPES.A.frets, fingers: SHAPES.A.fingers, caption: '{c:A}: fingers 1, 2 and 3 on strings 4, 3 and 2.' },
      tip: 'Squeezing three fingers in is hard work at first. Sore fingertips are normal; an aching hand, wrist or thumb is not: stop, shake it out and rest.',
    },
    build('A', 'Build {c:A} on the chord box, with string 6 left out.', '{c:A}: an x on string 6, the open {n:A} on string 5, fret 2 on strings 4, 3 and 2, and string 1 open.', 'a-shape'),
    {
      type: 'card',
      title: 'Fingers too wide?',
      body: 'If three fingertips do not fit side by side, try 2-1-3: finger 2 on string 4, finger 1 on string 3, finger 3 on string 2. Same frets, same notes, a little more room.',
      figure: { kind: 'chord', symbol: 'A', frets: SHAPES.A.frets, fingers: A_WIDE_FINGERS, caption: '{c:A} with the 2-1-3 fingering.' },
    },
    {
      type: 'play-chord',
      prompt: 'Play {c:A} string by string from string 5, then strum strings 5 to 1.',
      chord: 'A',
      frets: SHAPES.A.frets,
      explain: 'Five strings ring in {c:A}: {n:A}, {n:E}, {n:A}, {n:C#} and {n:E}. If string 1 is quiet, finger 3 is touching it: bring it more upright.',
      alternative: build('A', 'From memory: build {c:A}.', '{c:A}: string 6 left out, fret 2 on strings 4, 3 and 2.'),
    },
    {
      type: 'card',
      title: 'Changing is a skill of its own',
      body: 'Look at the next chord before you need it. Move all the fingers together, as one hand. And it is fine to strum open strings on the last beat while your hand travels. The beat matters more than the chord.',
      tip: 'Nobody changes chords cleanly on day one. Changes get quicker every day you practise them.',
    },
    {
      type: 'choice',
      prompt: 'Your fingers are late for the next chord. What do you do?',
      options: [
        { text: 'Keep the beat, even on open strings', correct: true },
        { text: 'Stop until the chord is ready', why: 'A stop breaks the beat, and everybody hears it.' },
        { text: 'Slow down until the fingers arrive', why: 'Slowing inside a song breaks the beat too. Choose a slower tempo from the start instead.' },
      ],
      explain: 'Strum on time, on open strings if your hand is still travelling, and land the chord as soon as you can. The beat matters more than the chord.',
      fact: 'change-on-beat',
    },
    toolTask({
      id: 'trainer-em-a',
      title: 'Change trainer: E minor and A',
      tool: 'chords',
      params: ['trainer', 'e-minor', 'a-major'],
      minutes: 2,
      body: 'Choose Changes in time at 60 {t:bpm|BPM} with 4 beats per chord: {c:Em}, then {c:A}, and back, for one minute. Look at the next chord a beat early. With the microphone on, the trainer counts your clean changes; without it, tap when your fingers land.',
    }),
    {
      type: 'card',
      title: 'Strumming: Steady Quarters',
      body: 'This study is {c:Em} for 4 bars and {c:A} for 4 bars, then all of it again: 16 bars of four downstrums. Give beat 1 an {t:accent}, a slightly louder strum, so you always know where the bar begins.',
      figure: { kind: 'rhythm', pattern: 'q q q q | q q q q', tempo: 60, caption: 'Four downstrums a bar, beat 1 a little louder.' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the chart of Strumming: Steady Quarters.',
      text: '4 bars of ___, then 4 bars of ___, then all of it again.',
      blanks: ['{c:Em}', '{c:A}'],
      bank: ['{c:Am}', '{c:E}'],
      explain: '{c:Em} for 4 bars, {c:A} for 4 bars, twice: 16 bars in all.',
    },
    playerTask({
      id: 'quarters-60',
      title: 'Steady Quarters at 60 BPM',
      song: 'st-strum-quarters',
      minutes: 5,
      body: 'All 16 bars at 60 {t:bpm|BPM}: four downstrums a bar, beat 1 a little louder. Keep strumming through every change. After two clean runs, set the speed to 107 % (64 BPM) and play it again.',
      tip: 'In the {c:A} bars, start each strum on string 5.',
    }),
    {
      type: 'true-false',
      statement: 'In {c:A}, you strum all six strings.',
      answer: false,
      explain: 'String 6 has an x over it. Start the strum on string 5, the open {n:A}.',
      fact: 'a-shape',
    },
  ],
  facts: [
    {
      id: 'a-shape',
      front: 'How do you play {c:A}?',
      back: 'Fingers 1, 2 and 3 side by side at fret 2 on strings 4, 3 and 2. Strum from string 5 and miss string 6.',
      ask: build('A', 'Build {c:A}.', '{c:A}: fret 2 on strings 4, 3 and 2, with an x on string 6.'),
    },
    { id: 'change-on-beat', front: 'Your fingers are late for a chord change. What matters most?', back: 'The beat. Strum on time, on open strings if need be, and land the chord as soon as you can.' },
    { id: 'accent', front: 'What is an accent?', back: 'A slightly louder note or strum, like the strum on beat 1 that marks the start of each bar.' },
  ],
};

// ── 5. E7 and the change that lands on the beat ─────────────────────────────────────────────────

const aAndE7: TeacherLesson = {
  id: 'a-and-e7',
  title: 'E seven and changing on the beat',
  teaches: 'E seven is two fingers; between A and E seven no finger stays down: lift and land together, on the beat.',
  minutes: 5,
  skill: 'teacher:mia:a-and-e7',
  steps: [
    {
      type: 'card',
      title: 'E seven: two fingers',
      body: '{c:E7} (say "E seven") needs just two fingers: finger 2 on string 5, fret 2 ({n:B}), and finger 1 on string 3, fret 1 ({n:G#}). Every string rings, from string 6 to string 1.',
      figure: { kind: 'chord', symbol: 'E7', frets: SHAPES.E7.frets, fingers: SHAPES.E7.fingers, caption: '{c:E7}: two fingers, six strings.' },
      tip: 'It is {c:E} with finger 3 lifted: the open string 4, {n:D}, gives it its sound.',
    },
    build('E7', 'Build {c:E7} on the chord box.', '{c:E7}: fret 2 on string 5, fret 1 on string 3, and the other four strings open.', 'e7-shape'),
    {
      type: 'play-chord',
      prompt: 'Play {c:E7} string by string, then strum all six strings.',
      chord: 'E7',
      frets: SHAPES.E7.frets,
      explain: 'Six strings ring in {c:E7}: {n:E}, {n:B}, {n:D}, {n:G#}, {n:B} and {n:E}. Make sure finger 2 does not touch the open string 4.',
      alternative: build('E7', 'From memory: build {c:E7}.', '{c:E7}: finger 2 on string 5, fret 2, finger 1 on string 3, fret 1.'),
    },
    {
      type: 'card',
      title: 'Shapes in the air',
      body: 'Between {c:A} and {c:E7} no finger can stay down. So practise the shapes in the air: hold your hand just above the neck, form {c:E7} five times, then {c:A} five times, then switch between them with your eyes closed. Lift all the fingers together, land them together.',
    },
    {
      type: 'choice',
      prompt: 'Going from {c:A} to {c:E7}, which finger can stay where it is?',
      options: [
        { text: 'None: they all move', correct: true },
        { text: 'Finger 1', why: 'In {c:A} finger 1 is on string 4, fret 2; in {c:E7} it is on string 3, fret 1.' },
        { text: 'Finger 2', why: 'Finger 2 moves from string 3 in {c:A} to string 5 in {c:E7}.' },
      ],
      explain: 'Every finger moves, so lift them all at once and land them all at once.',
      fact: 'a-e7-change',
    },
    {
      type: 'card',
      title: 'The change lands on the beat',
      body: 'The rule from now on: the change lands on the beat, even if the strum just before it has to be on open strings. The study Change: {c:A} and {c:E7} builds up to it: one strum a bar, then two, then four, then a change every 2 beats.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['A', 'E7', 'A', 'E7'], tempo: 60, beats: 2 }, label: 'Hear a change every 2 beats' },
    },
    {
      type: 'order',
      prompt: 'Put the steps of the change ladder in order, slowest first.',
      tiles: ['1 strum a bar', '2 strums a bar', '4 strums a bar', 'Every 2 beats'],
      explain: 'The changes come closer each time: one strum a bar, two, four, and finally a new chord every 2 beats.',
    },
    playerTask({
      id: 'ladder-a-e7',
      title: 'Change ladder: A and E seven',
      song: 'st-change-a-e7',
      minutes: 4,
      body: 'Play the whole study at 60 {t:bpm|BPM}: the 8-bar ladder twice. Lift all the fingers together and land them on the beat. If a change is late, keep strumming and catch the next one.',
    }),
    {
      type: 'true-false',
      statement: 'While your fingers travel to the next chord, the strum before the change may be on open strings.',
      answer: true,
      explain: 'Yes. A strum on open strings, on time, sounds far better than a perfect chord that arrives late.',
      fact: 'a-e7-change',
    },
    toolTask({
      id: 'minute-a-e7',
      title: 'One-minute changes: A and E seven',
      tool: 'chords',
      params: ['trainer', 'a-major', 'e-7'],
      minutes: 2,
      body: 'Choose One-minute changes with {c:A} and {c:E7}: change back and forth for a minute, one strum each time a chord lands, and count every clean change. The trainer keeps your score: your first personal best, and the number to beat tomorrow.',
    }),
    {
      type: 'choice',
      prompt: 'Which chord do these two fingers make, with every string ringing?',
      figure: {
        kind: 'fretboard',
        frets: [0, 3],
        labels: 'finger',
        dots: [
          { string: 5, fret: 2, note: 'B2', finger: 2 },
          { string: 3, fret: 1, note: 'G#3', finger: 1 },
        ],
      },
      options: [
        { text: '{c:E7}', correct: true },
        { text: '{c:E}', why: '{c:E} has a third finger on string 4, fret 2.' },
        { text: '{c:Em}', why: '{c:Em} has fingers on strings 5 and 4, nothing on string 3.' },
        { text: '{c:A}', why: '{c:A} is three fingers at fret 2 on strings 4, 3 and 2.' },
      ],
      explain: 'Finger 2 on string 5, fret 2, and finger 1 on string 3, fret 1: {c:E7}.',
      fact: 'e7-shape',
    },
  ],
  facts: [
    {
      id: 'e7-shape',
      front: 'How do you play {c:E7}?',
      back: 'Finger 2 on string 5, fret 2, and finger 1 on string 3, fret 1. All six strings ring.',
      ask: build('E7', 'Build {c:E7}.', '{c:E7}: fret 2 on string 5, fret 1 on string 3, all six strings.'),
    },
    { id: 'a-e7-change', front: 'Changing between {c:A} and {c:E7}: which fingers stay down?', back: 'None. Lift all the fingers together and land them together, on the beat.' },
  ],
};

// ── 6. Skip to My Lou ───────────────────────────────────────────────────────────────────────────

const skipToMyLou: TeacherLesson = {
  id: 'skip-to-my-lou',
  title: 'Skip to My Lou',
  teaches: 'Strum one downstroke per beat in 2/4 and change between A and E seven on time, with the words.',
  minutes: 5,
  skill: 'teacher:mia:skip-to-my-lou',
  steps: [
    {
      type: 'card',
      title: 'Two beats in a bar',
      body: 'Skip to My Lou has two beats in a bar, written 2/4: the top number says two. It uses only {c:A} and {c:E7}, changing every two bars, with one quicker change at the very end. Strum one downstroke per beat and count 1, 2, 1, 2.',
      figure: { kind: 'rhythm', pattern: 'q q | q q', time: '2/4', tempo: 80, caption: 'Two bars of 2/4: one downstroke per beat.' },
    },
    {
      type: 'choice',
      prompt: 'In 2/4, how many downstrokes do you strum in each bar?',
      options: [{ text: '1' }, { text: '2', correct: true }, { text: '3' }, { text: '4', why: 'Four is for 4/4, like Frère Jacques. Here each bar has two beats.' }],
      shuffle: false,
      explain: 'The top number of 2/4 is the number of beats in a bar: two beats, so two downstrokes.',
      fact: 'two-four',
    },
    {
      type: 'card',
      title: 'The chord chart',
      body: 'Each sung line is two bars long. Line 1: {c:A}. Line 2: {c:E7}. Line 3: {c:A}. Last line: {c:E7} for one bar, then {c:A} to finish. A {t:chord-chart|chord chart} like this is all you need to strum a song.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['A', 'A', 'E7', 'E7', 'A', 'A', 'E7', 'A'], tempo: 80, beats: 2 }, label: 'Hear the chord chart' },
    },
    {
      type: 'order',
      prompt: 'Put the chords of the four lines in order.',
      tiles: ['{c:A}', '{c:E7}', '{c:A}', '{c:E7} then {c:A}'],
      explain: '{c:A}, {c:E7}, {c:A}, then {c:E7} turning back to {c:A} halfway through the last line.',
      fact: 'lou-chart',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap one strum per beat for two bars of 2/4.',
      rhythm: { pattern: 'q q | q q', time: '2/4' },
      tempo: 80,
      show: 'both',
      explain: 'Four even strums: 1, 2, 1, 2. The first beat of each bar is where a chord change can land.',
    },
    playerTask({
      id: 'lou-80',
      title: 'Skip to My Lou at 80 BPM',
      song: 'skip-to-my-lou',
      tempo: 80,
      minutes: 4,
      body: 'Strum along at 80 {t:bpm|BPM}, one downstroke per beat. The words of each line sit above its first strum: read them as you go. The Player plays your strum part, so lock onto it.',
    }),
    {
      type: 'card',
      title: 'Strum and sing',
      body: 'Strumming and singing together feels impossible at first, and that is normal. Build it in three steps: hum the tune while you strum, then speak the words in rhythm, then sing them. If you do not know the tune yet, speak the words in time with your strums.',
    },
    {
      type: 'true-false',
      statement: 'If a change comes late, slow the {t:tempo}, the speed of the beat, until every change lands on time.',
      answer: true,
      explain: 'Slower is how you get faster. Find the tempo where every change lands, then speed up a little at a time.',
      fact: 'slow-down',
    },
    playerTask({
      id: 'lou-hum',
      title: 'Hum, speak, then sing',
      song: 'skip-to-my-lou',
      tempo: 80,
      minutes: 5,
      body: 'Again at 80 {t:bpm|BPM}, three passes: hum while you strum, then speak the words in rhythm, then sing. Keep the strum going whatever your voice does.',
    }),
    playerTask({
      id: 'lou-faster',
      title: 'Up toward 100 BPM',
      song: 'skip-to-my-lou',
      tempo: 84,
      minutes: 5,
      body: 'Start at 84 {t:bpm|BPM} and raise the speed by 4 BPM after each clean pass, toward 100. When a change comes late, stop raising it: stay at that speed until you have two clean passes.',
    }),
    {
      type: 'choice',
      prompt: 'At 92 BPM, one change keeps coming late. What do you do?',
      options: [
        { text: 'Stay at 92 until two passes are clean', correct: true },
        { text: 'Push on to 100 anyway', why: 'A late change gets more practice at the wrong timing. Stay until it lands.' },
        { text: 'Go back to 80 for good', why: 'No need to start over: stay at the speed where it slipped until it is clean.' },
      ],
      explain: 'Stop raising the tempo where a change is late, and stay there for two clean passes. Then try the next 4 BPM.',
      fact: 'slow-down',
    },
  ],
  facts: [
    { id: 'two-four', front: 'What does 2/4 at the start of a song mean?', back: 'Two beats in every bar: count 1, 2, 1, 2.' },
    { id: 'lou-chart', front: 'Which chords does Skip to My Lou use, and how often do they change?', back: '{c:A} and {c:E7}, changing every two bars, with {c:E7} back to {c:A} halfway through the last line.' },
    { id: 'slow-down', front: 'A chord change keeps coming late. What do you do?', back: 'Slow the tempo until every change lands on time, then speed up 4 BPM at a time.' },
  ],
};

// ── 7. Your first songbook ──────────────────────────────────────────────────────────────────────

const firstSongbook: TeacherLesson = {
  id: 'first-songbook',
  title: 'Your first songbook',
  teaches: 'Chords stick when you recall them, so play each shape from memory, then your two songs at full speed.',
  minutes: 5,
  skill: 'teacher:mia:first-songbook',
  steps: [
    {
      type: 'card',
      title: 'From memory',
      body: 'Chords stick when you recall them, not when you look them up. So today, every shape from memory: no peeking. Then your first songbook, Frère Jacques and Skip to My Lou.',
      tip: 'One song you can really play is worth three you almost can.',
    },
    build('Am', 'From memory: {c:Am}.', '{c:Am}: an x on string 6, fret 2 on strings 4 and 3, fret 1 on string 2.', 'recall-chords'),
    build('E7', 'From memory: {c:E7}.', '{c:E7}: fret 2 on string 5, fret 1 on string 3, all six strings.'),
    build('G', 'From memory: the one-finger {c:G}.', 'Finger 3 on string 1, fret 3, with an x on strings 6 and 5.'),
    build('Em', 'From memory: {c:Em}.', '{c:Em}: fret 2 on strings 5 and 4, all six strings.'),
    build('A', 'From memory: {c:A}.', '{c:A}: an x on string 6, fret 2 on strings 4, 3 and 2.'),
    build('E', 'From memory: {c:E}.', '{c:E}: {c:Em} plus finger 1 on string 3, fret 1.'),
    {
      type: 'play-chord',
      prompt: 'Play {c:E}.',
      chord: 'E',
      frets: SHAPES.E.frets,
      explain: '{c:E}, all six strings: fret 2 on strings 5 and 4, fret 1 on string 3.',
      alternative: build('E', 'Build {c:E}.', '{c:E}: frets 0 2 2 1 0 0 from string 6.'),
    },
    {
      type: 'play-chord',
      prompt: 'Play {c:Am}.',
      chord: 'Am',
      frets: SHAPES.Am.frets,
      explain: '{c:Am}, strings 5 to 1: the {c:E} shape one string over.',
      alternative: build('Am', 'Build {c:Am}.', '{c:Am}: x 0 2 2 1 0 from string 6.'),
    },
    toolTask({
      id: 'minute-changes',
      title: 'Three one-minute changes',
      tool: 'chords',
      params: ['trainer', 'a-major', 'e-7'],
      minutes: 4,
      body: 'One-minute changes on three pairs: {c:A} and {c:E7}, {c:Em} and {c:A}, {c:E} and {c:Am}. Beat last time\'s score.',
    }),
    {
      type: 'play-chord',
      prompt: 'Play {c:A}.',
      chord: 'A',
      frets: SHAPES.A.frets,
      explain: '{c:A}, strings 5 to 1: three fingers at fret 2.',
      alternative: build('A', 'Build {c:A}.', '{c:A}: x 0 2 2 2 0 from string 6.'),
    },
    {
      type: 'play-chord',
      prompt: 'Play {c:E7}.',
      chord: 'E7',
      frets: SHAPES.E7.frets,
      explain: '{c:E7}, all six strings: two fingers.',
      alternative: build('E7', 'Build {c:E7}.', '{c:E7}: 0 2 0 1 0 0 from string 6.'),
    },
    playerTask({
      id: 'book-jacques',
      title: 'Songbook: Frere Jacques',
      song: 'frere-jacques',
      minutes: 3,
      body: 'Frère Jacques at 88 {t:bpm|BPM}, round and all: four strums a bar on strings 4 to 1.',
    }),
    playerTask({
      id: 'book-lou',
      title: 'Songbook: Skip to My Lou',
      song: 'skip-to-my-lou',
      minutes: 3,
      body: 'Skip to My Lou at 100 {t:bpm|BPM}, start to finish, with the words. Late change? Keep strumming.',
    }),
    {
      type: 'choice',
      prompt: 'Which chord is this? String 6 is left out.',
      figure: {
        kind: 'fretboard',
        frets: [0, 3],
        labels: 'finger',
        dots: [
          { string: 4, fret: 2, note: 'E3', finger: 2 },
          { string: 3, fret: 2, note: 'A3', finger: 3 },
          { string: 2, fret: 1, note: 'C4', finger: 1 },
        ],
      },
      options: [
        { text: '{c:Am}', correct: true },
        { text: '{c:E}', why: '{c:E} is the same shape one string lower, on strings 5, 4 and 3.' },
        { text: '{c:A}', why: '{c:A} has three fingers all at fret 2.' },
        { text: '{c:Em}', why: '{c:Em} has only two fingers.' },
      ],
      explain: 'Fret 2 on strings 4 and 3, fret 1 on string 2: {c:Am}.',
    },
  ],
  facts: [
    { id: 'recall-chords', front: 'Why practise chords from memory instead of looking at the box?', back: 'Chords stick when you recall them. Looking them up again and again teaches your eyes, not your hands.' },
    { id: 'one-song', front: 'Three songs you almost can play, or one you really can?', back: 'One you really can: start to finish, in time, without stopping.' },
  ],
};

/** Unit 2 of Mia's course. */
const unit: TeacherUnit = {
  id: 'mia-first-chords',
  title: 'Your first chords',
  theme: 'chords',
  description: 'Read a chord box, play E minor, E, A minor, A, E seven and a one-finger G, and strum your first songs with them.',
  lessons: [chordBoxesAndEm, eAndAm, frereJacquesStrum, theAChord, aAndE7, skipToMyLou, firstSongbook],
  checkpoint: { sample: 8, maxMistakes: 2 },
  glossary: [
    { id: 'chord-box', term: 'chord box', definition: 'A picture of a chord: strings up and down (string 6 on the left), frets across, fingers in the dots, o for open and x for not played.' },
    { id: 'round', term: 'round', definition: 'A song in which a second voice starts the same tune a few bars later, and the two still fit together.' },
    { id: 'accent', term: 'accent', definition: 'A note or strum played a little louder than the ones around it, such as beat 1 of every bar.' },
    { id: 'chord-chart', term: 'chord chart', definition: 'The chords of a song written in order, line by line, often above the words.' },
  ],
};

export default unit;
