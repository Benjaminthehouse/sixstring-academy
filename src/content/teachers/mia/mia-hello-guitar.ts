/**
 * Mia, unit 1: Hello, guitar (plan: `mia/mia-hello-guitar` in src/content/plan/teachers.json).
 *
 * The model unit for authors. Every lesson follows its plan entry: the plan's `explain` is said in
 * Mia's voice on the cards, its `show` becomes the figures and drawings, its `practice` steps become
 * exercises (`Lesson`, `Mic` with a tapping alternative) or tasks that send the learner to the
 * Player, Tuner, Metronome or Technique and back. Mia's voice: patient, concrete, one idea at a
 * time, no word before it is explained.
 *
 * Music: Hot Cross Buns is in the song library. The Open-String Duet (`st-open-string-duet`) is not
 * yet, so its tasks carry a Metronome fallback that does the same job: a steady beat on open strings.
 */
import type { TeacherLesson, TeacherUnit } from '../types';
import { playerTask, techniqueTask, toolTask } from '../tasks';

const OPEN_STRINGS = [
  { string: 6, fret: 0, note: 'E2' },
  { string: 5, fret: 0, note: 'A2' },
  { string: 4, fret: 0, note: 'D3' },
  { string: 3, fret: 0, note: 'G3' },
  { string: 2, fret: 0, note: 'B3' },
  { string: 1, fret: 0, note: 'E4' },
] as const;

/** The Metronome version of the Open-String Duet's student part, until the duet is in the library. */
const DUET_FALLBACK = {
  tool: 'metronome' as const,
  body: 'The duet is not in your song library yet, so we use the Metronome. Set it to 60 {t:bpm|BPM}, one click a second. Play the open string 6 with your thumb on every click for 8 clicks, then string 5, then string 4.',
};

// ── 1. Meet your guitar ─────────────────────────────────────────────────────────────────────────

const meetYourGuitar: TeacherLesson = {
  id: 'meet-your-guitar',
  title: 'Meet your guitar',
  teaches: 'Strings are numbered 1 (thinnest) to 6 (thickest); a string played with no finger on it is open.',
  minutes: 4,
  skill: 'teacher:mia:meet-your-guitar',
  steps: [
    {
      type: 'card',
      id: 'hello',
      title: 'Hello, I am Mia',
      art: 'guitar-parts',
      body: 'Today you need your guitar on your lap and one thumb. First, its parts: the {t:tuning-peg|tuning pegs} on the {t:headstock}, the {t:nut}, the neck with its metal {t:fret|frets}, the body with its {t:soundhole} and the {t:bridge}, where the strings end.',
      tip: 'An electric guitar has pickups where the soundhole would be. Everything else is the same.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each part with its job.',
      pairs: [
        { left: 'Tuning pegs', right: 'Tighten or loosen strings' },
        { left: 'Frets', right: 'Change the note' },
        { left: 'Bridge', right: 'Holds the strings' },
        { left: 'Soundhole', right: 'You pluck just over it' },
      ],
      explain: 'The pegs on the headstock tune each string, the frets on the neck change its note, the bridge holds the strings on the body, and you pluck over the soundhole.',
    },
    {
      type: 'card',
      title: 'Six strings, counted from the thin one',
      body: 'The strings are numbered from the thinnest, string 1, to the thickest, string 6. String 6 is the one nearest your face when you hold the guitar, and it sounds the lowest.',
      figure: { kind: 'fretboard', frets: [0, 3], dots: [...OPEN_STRINGS], caption: 'The six open strings: string 6 at the bottom, string 1 on top.' },
      tip: 'In pictures like this one the thin string 1 is drawn on top, as if you looked down at the neck.',
    },
    {
      type: 'true-false',
      statement: 'String 1 is the thickest string.',
      answer: false,
      explain: 'String 1 is the thinnest one, farthest from your face. String 6 is the thickest, and it sounds the lowest.',
      fact: 'string-numbers',
    },
    {
      type: 'choice',
      prompt: 'Hold your guitar. Which string is nearest your face?',
      options: [
        { text: 'String 6, the thickest', correct: true },
        { text: 'String 1, the thinnest', why: 'String 1 is at the other edge, nearest the floor.' },
        { text: 'String 3' },
        { text: 'String 4' },
      ],
      explain: 'The thick string 6 sits on top, nearest your face. Thick strings vibrate slowly, so it is the lowest sound.',
      fact: 'string-numbers',
    },
    {
      type: 'card',
      title: 'Open strings',
      body: 'A string played with no finger on it is an {t:open-string|open string}, and today open strings are all you need. Listen to all six, from string 6 up to string 1: low and deep to high and bright.',
      figure: { kind: 'audio', sound: { kind: 'notes', notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'], tempo: 72 }, label: 'Hear the six open strings' },
    },
    {
      type: 'play-note',
      prompt: 'Rest the guitar on your lap. With your thumb, pluck string 6 and let it ring.',
      note: 'E2',
      octave: 'exact',
      where: { string: 6, fret: 0 },
      explain: 'String 6 played open is the low {n:E}, the deepest sound on the guitar. A brush of the thumb is enough.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap the open string 6.',
        find: { note: 'E2' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 3],
        explain: 'String 6 is the thickest, drawn at the bottom of the neck. Played open it is the low {n:E}.',
      },
    },
    {
      type: 'play-note',
      prompt: 'Now string 3: count up from the thin string 1. Pluck it with your thumb.',
      note: 'G3',
      octave: 'exact',
      where: { string: 3, fret: 0 },
      explain: 'Counting from the thinnest, string 3 is the third one. Played open it is {n:G}.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap the open string 3.',
        find: { note: 'G3' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 3],
        explain: 'String 3 is the third from the top in the picture. Played open it is {n:G}.',
      },
    },
    {
      type: 'play-note',
      prompt: 'And string 1, the thinnest. A gentle pluck is enough.',
      note: 'E4',
      octave: 'exact',
      where: { string: 1, fret: 0 },
      explain: 'String 1 is the high {n:E}: the same note name as string 6, two octaves higher.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap the open string 1.',
        find: { note: 'E4' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 3],
        explain: 'String 1 is the thinnest, drawn on top. Played open it is the high {n:E}.',
      },
    },
    playerTask({
      id: 'duet-first-bars',
      title: 'Your first music: the Open-String Duet',
      song: 'st-open-string-duet',
      bars: [1, 4],
      minutes: 3,
      body: 'Play along with bars 1 to 4: only the open string 6, one thumb stroke on every beat, while the app plays the tune above you. A {t:bar} is a group of four beats, the steady pulse you could tap your foot to.',
      tip: 'Do not chase the tune. Your job is the steady beat underneath it.',
      fallback: DUET_FALLBACK,
    }),
    {
      type: 'choice',
      prompt: 'You pluck a string with no finger pressing it. What is that called?',
      options: [
        { text: 'An open string', correct: true },
        { text: 'A fret', why: 'A fret is one of the metal strips across the neck.' },
        { text: 'A tuning peg', why: 'The pegs on the headstock tune the strings.' },
      ],
      explain: 'A string played with no finger on it is an open string. Everything you played today was open.',
      fact: 'open-string',
    },
  ],
  facts: [
    { id: 'string-numbers', front: 'Which string is string 1, and which is string 6?', back: 'String 1 is the thinnest (the high {n:E}); string 6 is the thickest (the low {n:E}), nearest your face.' },
    { id: 'open-string', front: 'What is an open string?', back: 'A string played with no finger pressing it down.' },
  ],
};

// ── 2. Sitting and holding ──────────────────────────────────────────────────────────────────────

const sitAndHold: TeacherLesson = {
  id: 'sit-and-hold',
  title: 'Sitting and holding',
  teaches: 'Sit with the guitar on your thigh, neck slightly up, shoulders down and your thumb behind the neck.',
  minutes: 4,
  skill: 'teacher:mia:sit-and-hold',
  steps: [
    {
      type: 'card',
      id: 'posture',
      title: 'Sit like this',
      art: 'posture',
      body: "Rest the guitar's waist on your right thigh (left if you play left-handed), neck pointing slightly up. Back upright, shoulders down. Your picking forearm lies over the top edge of the body, so your hand falls over the strings by itself.",
      tip: 'Do not lean over to look at the neck. Tilt your head a little instead.',
    },
    {
      type: 'choice',
      prompt: "Where does the guitar's waist rest when you sit?",
      options: [
        { text: 'On your thigh, neck slightly up', correct: true },
        { text: 'Flat on your lap, strings up', why: 'Lying flat, your hands cannot reach the strings comfortably.' },
        { text: 'Under your arm, neck down', why: 'A neck pointing down makes your fretting wrist bend sharply.' },
      ],
      explain: 'The dip in the middle of the guitar sits on your thigh, so the guitar balances by itself and the neck points slightly up.',
      fact: 'guitar-on-thigh',
    },
    {
      type: 'true-false',
      statement: 'Your fretting thumb rests behind the neck, roughly opposite your middle finger.',
      answer: true,
      explain: 'Behind the neck, not squeezing: it is a light counterweight for the fingers in front. Your wrist stays fairly straight.',
    },
    {
      type: 'card',
      title: 'Check for tension',
      body: 'Every few minutes, freeze and check: jaw loose, shoulders down, thumb not squeezing. Sore fingertips in the first weeks are normal; they toughen up. Aching joints, numbness or sharp pain are not normal: stop and rest.',
      tip: 'Short sessions every day beat one long one. Ten minutes is plenty to begin.',
    },
    {
      type: 'choice',
      prompt: 'After your first week, your fingertips are a little sore. What does it mean?',
      options: [
        { text: 'Normal: they toughen up', correct: true },
        { text: 'Stop playing for a month', why: 'No need: a little soreness at the fingertips is how they get stronger.' },
        { text: 'Press harder to get used to it', why: 'Pressing harder only hurts more. Use just enough pressure for a clear note.' },
      ],
      explain: 'Fingertips get a little sore in the first weeks and then toughen. Keep sessions short and press only as hard as you need.',
      fact: 'pain-rule',
    },
    {
      type: 'choice',
      prompt: 'You feel a sharp pain in your wrist while you play. What do you do?',
      options: [
        { text: 'Stop and rest', correct: true },
        { text: 'Play through it', why: 'Never play into pain. It is your body asking you to stop.' },
        { text: 'Play faster to finish sooner', why: 'Speed adds tension. Stop and rest instead.' },
      ],
      explain: 'Sharp pain, aching joints or numbness mean stop and rest. If it lasts, see a doctor or physiotherapist.',
      fact: 'pain-rule',
    },
    {
      type: 'card',
      title: 'The Open-String Duet',
      body: 'Your part uses only open strings, one stroke per beat: string 6 for bars 1 to 4, string 5 for bars 5 to 8, string 4 for bars 9 to 12, then one bar each of {n:E}, {n:A}, {n:D}, {n:E}. The app plays the tune above you.',
      figure: {
        kind: 'tab',
        tempo: 60,
        notes: [
          { string: 6, fret: 0, duration: 'q' },
          { string: 6, fret: 0, duration: 'q' },
          { string: 6, fret: 0, duration: 'q' },
          { string: 6, fret: 0, duration: 'q' },
          { string: 5, fret: 0, duration: 'q' },
          { string: 5, fret: 0, duration: 'q' },
          { string: 5, fret: 0, duration: 'q' },
          { string: 5, fret: 0, duration: 'q' },
        ],
        caption: 'Bar 1 on string 6, then bar 5 on string 5: one thumb stroke per beat.',
      },
    },
    {
      type: 'play-phrase',
      prompt: 'Play four beats on the open string 6, then four on string 5, with your thumb.',
      notes: [
        { string: 6, fret: 0, duration: 'q' },
        { string: 6, fret: 0, duration: 'q' },
        { string: 6, fret: 0, duration: 'q' },
        { string: 6, fret: 0, duration: 'q' },
        { string: 5, fret: 0, duration: 'q' },
        { string: 5, fret: 0, duration: 'q' },
        { string: 5, fret: 0, duration: 'q' },
        { string: 5, fret: 0, duration: 'q' },
      ],
      octave: 'exact',
      tempo: 60,
      explain: 'Four low {n:E} notes on string 6, then four {n:A} notes on string 5. Even strokes, even loudness: that is a steady beat.',
      alternative: {
        type: 'tap-rhythm',
        prompt: 'Tap four steady beats with the click, as your thumb would play them.',
        rhythm: { pattern: 'q q q q' },
        tempo: 60,
        show: 'both',
        explain: 'One tap on every click: a steady beat, like the thumb strokes of the duet.',
      },
    },
    playerTask({
      id: 'duet-whole',
      title: 'Play the whole Open-String Duet',
      song: 'st-open-string-duet',
      minutes: 4,
      body: 'Sit as you learned, then play the whole duet at 60 {t:bpm|BPM} (60 beats per minute, one a second) while the app plays the tune and chords. If you lose your place, keep counting and come back in on the next bar.',
      tip: 'Every minute or so, freeze for a second and check your shoulders and thumb.',
      fallback: DUET_FALLBACK,
    }),
    {
      type: 'true-false',
      statement: 'A short session every day is better than one long session a week.',
      answer: true,
      explain: 'Hands learn from repetition and rest. Ten relaxed minutes a day builds more than an hour once a week, and it is kinder to your fingertips.',
    },
  ],
  facts: [
    { id: 'guitar-on-thigh', front: "Where does the guitar's waist rest when you sit?", back: 'On your right thigh (left if you play left-handed), with the neck pointing slightly up.' },
    { id: 'pain-rule', front: 'Sore fingertips are normal at first. What is not?', back: 'Aching joints, numbness or sharp pain. Stop and rest; if it lasts, see a doctor.' },
  ],
};

// ── 3. Tuning up ────────────────────────────────────────────────────────────────────────────────

const tuneUp: TeacherLesson = {
  id: 'tune-up',
  title: 'Tuning up',
  teaches: 'Flat means too low (tighten), sharp means too high (loosen); always finish by tightening up to the note.',
  minutes: 4,
  skill: 'teacher:mia:tune-up',
  steps: [
    {
      type: 'card',
      title: 'Tune first, every time',
      body: 'Strings drift out of tune every day, so tuning is the first thing you do when you pick up the guitar. Pluck one string and read the {t:tuner}: **flat** means too low, so tighten the peg a little; **sharp** means too high, so loosen it.',
      figure: { kind: 'fretboard', frets: [0, 3], dots: [...OPEN_STRINGS], caption: 'Standard tuning, string 6 to 1: E A D G B E.' },
    },
    {
      type: 'choice',
      prompt: 'The Tuner says string 5 is flat. What do you do?',
      options: [
        { text: 'Tighten its peg a little', correct: true },
        { text: 'Loosen its peg a little', why: 'Loosening lowers the string, and it is already too low.' },
        { text: 'Pluck it harder', why: 'Plucking harder makes it louder, not higher.' },
      ],
      explain: 'Flat means too low. Tightening the string raises its note, so give the peg a small turn and pluck again.',
      fact: 'flat-sharp',
    },
    {
      type: 'true-false',
      statement: 'Sharp on the Tuner means the string is too high.',
      answer: true,
      explain: 'Sharp is too high, flat is too low. A sharp string needs loosening, a little at a time.',
      fact: 'flat-sharp',
    },
    {
      type: 'listen-choice',
      prompt: 'The first note is the right {n:A}. The second is your string 5. Is it flat or sharp?',
      sound: { kind: 'notes', notes: ['A2', 'G#2'], tempo: 60 },
      options: [{ text: 'Flat: too low', correct: true }, { text: 'Sharp: too high' }],
      shuffle: false,
      explain: 'Your string sounded lower than the right note, so it is flat. Tighten the peg to bring it up.',
    },
    {
      type: 'card',
      title: 'Come up to the note',
      body: 'Always finish by tightening up to the note. If you go past it, drop below and come back up: a string brought up to pitch tends to stay there. Small turns, then pluck again.',
      tip: 'Not sure which way a peg turns? Turn it a little while the string rings and listen.',
    },
    {
      type: 'order',
      prompt: 'Put the steps of tuning one string in order.',
      tiles: ['Pluck it', 'Read the Tuner', 'Turn the peg', 'Pluck again'],
      explain: 'Pluck, read, turn a little, then pluck again to check. Repeat until the Tuner says in tune.',
    },
    toolTask({
      id: 'tune-all',
      title: 'Tune all six strings',
      tool: 'tuner',
      minutes: 4,
      body: 'Tune string 6 to {n:E}, then strings 5 to 1, until each one shows in tune. Then loosen string 3 a little on purpose and bring it back up to {n:G}, so you learn which way its peg turns.',
      tip: 'No microphone? Play the reference tone and turn the peg until your string and the tone stop wobbling against each other.',
    }),
    {
      type: 'listen-choice',
      prompt: 'Now the right {n:D} first, then your string 4. Flat or sharp?',
      sound: { kind: 'notes', notes: ['D3', 'D#3'], tempo: 60 },
      options: [{ text: 'Flat: too low' }, { text: 'Sharp: too high', correct: true }],
      shuffle: false,
      explain: 'Your string sounded higher, so it is sharp. Loosen it below the note, then tighten up to it.',
    },
    {
      type: 'play-note',
      prompt: 'Play the open string 5, in tune.',
      note: 'A2',
      octave: 'exact',
      where: { string: 5, fret: 0 },
      explain: 'The open string 5 is {n:A}. If it sounded off, go back to the Tuner: tuning is never wasted time.',
      alternative: {
        type: 'listen-choice',
        prompt: 'The right {n:A} first, then your string 5. In tune, or flat?',
        sound: { kind: 'notes', notes: ['A2', 'A2'], tempo: 60 },
        options: [{ text: 'In tune', correct: true }, { text: 'Flat: too low' }],
        shuffle: false,
        explain: 'Both notes were the same {n:A}: your string is in tune.',
      },
    },
    {
      type: 'play-note',
      prompt: 'And the open string 2, in tune.',
      note: 'B3',
      octave: 'exact',
      where: { string: 2, fret: 0 },
      explain: 'The open string 2 is {n:B}, the second thinnest string.',
      alternative: {
        type: 'listen-choice',
        prompt: 'The right {n:B} first, then your string 2. In tune, or sharp?',
        sound: { kind: 'notes', notes: ['B3', 'C4'], tempo: 60 },
        options: [{ text: 'In tune' }, { text: 'Sharp: too high', correct: true }],
        shuffle: false,
        explain: 'Your string was higher than {n:B}, so it is sharp: loosen it below the note, then come back up.',
      },
    },
    {
      type: 'true-false',
      statement: 'You tune every time you pick up the guitar, because strings drift.',
      answer: true,
      explain: 'Temperature, playing and time all pull strings out of tune. A minute of tuning makes everything after it sound better.',
    },
  ],
  facts: [
    { id: 'flat-sharp', front: 'On a tuner, what do flat and sharp mean?', back: 'Flat: too low, so tighten the peg. Sharp: too high, so loosen it.' },
    { id: 'tune-up-to', front: 'Why finish tuning by tightening up to the note?', back: 'A string brought up to pitch stays there. If you go past it, drop below and come back up.' },
    {
      id: 'standard-tuning',
      front: 'Name the open strings from string 6 to string 1.',
      back: '{n:E} {n:A} {n:D} {n:G} {n:B} {n:E}',
      ask: { generate: 'open-strings', params: { ask: 'order' } },
    },
  ],
};

// ── 4. Holding the pick ─────────────────────────────────────────────────────────────────────────

const thePick: TeacherLesson = {
  id: 'the-pick',
  title: 'Holding the pick',
  teaches: 'Hold the pick between thumb pad and the side of your index finger, 2 to 3 mm showing, and move from the wrist.',
  minutes: 4,
  skill: 'teacher:mia:the-pick',
  steps: [
    {
      type: 'card',
      id: 'grip',
      title: 'The grip',
      art: 'pick-grip',
      body: 'Hold the {t:pick} between the pad of your thumb and the side of your index finger, near its tip, with just 2 to 3 mm showing. Firm enough that it does not turn, loose enough that your hand stays soft.',
      tip: 'If the pick spins in your fingers, grip a little firmer, not harder: press with the thumb pad, not the tip.',
    },
    {
      type: 'choice',
      prompt: 'How much of the pick should show past your fingers?',
      options: [
        { text: '2 to 3 mm', correct: true },
        { text: 'Half of the pick', why: 'Too much pick flops around and catches the strings.' },
        { text: 'None at all', why: 'With nothing showing, the pick cannot reach the strings.' },
      ],
      explain: 'Just the tip, 2 to 3 mm: enough to strike the string cleanly, short enough to stay in control.',
      fact: 'pick-grip',
    },
    {
      type: 'card',
      title: 'Small, and from the wrist',
      body: 'The motion is small and comes from the wrist, like flicking a drop of water off your hand, not a swing from the elbow. Strike one string and stop just past it. A {t:downstroke} moves toward the floor, an {t:upstroke} toward the ceiling.',
      figure: {
        kind: 'tab',
        tempo: 60,
        notes: [
          { string: 6, fret: 0, duration: 'q' },
          { string: 6, fret: 0, duration: 'q' },
          { string: 6, fret: 0, duration: 'q' },
          { string: 6, fret: 0, duration: 'q' },
          { string: 1, fret: 0, duration: 'e' },
          { string: 1, fret: 0, duration: 'e' },
          { string: 1, fret: 0, duration: 'e' },
          { string: 1, fret: 0, duration: 'e' },
          { string: 1, fret: 0, duration: 'e' },
          { string: 1, fret: 0, duration: 'e' },
          { string: 1, fret: 0, duration: 'e' },
          { string: 1, fret: 0, duration: 'e' },
        ],
        caption: 'Bar 1: downstrokes on string 6. Bar 2: down-up on string 1.',
      },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each word with what it means.',
      pairs: [
        { left: 'Downstroke', right: 'Pick moves to the floor' },
        { left: 'Upstroke', right: 'Pick moves to the ceiling' },
        { left: 'The motion', right: 'Comes from the wrist' },
      ],
      explain: 'Down toward the floor, up toward the ceiling, and both from a relaxed wrist, not the elbow.',
      fact: 'pick-motion',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap a downstroke on every click: four in a bar.',
      rhythm: { pattern: 'q q q q' },
      tempo: 60,
      show: 'both',
      explain: 'One stroke per click, each the same size. Steady and even is the whole goal today.',
    },
    {
      type: 'play-phrase',
      prompt: 'Play 8 downstrokes on the open string 3, one on each click.',
      notes: [
        { string: 3, fret: 0, duration: 'q' },
        { string: 3, fret: 0, duration: 'q' },
        { string: 3, fret: 0, duration: 'q' },
        { string: 3, fret: 0, duration: 'q' },
        { string: 3, fret: 0, duration: 'q' },
        { string: 3, fret: 0, duration: 'q' },
        { string: 3, fret: 0, duration: 'q' },
        { string: 3, fret: 0, duration: 'q' },
      ],
      octave: 'exact',
      tempo: 60,
      explain: 'Eight {n:G} notes on the open string 3. If a stroke caught string 4 too, make the motion smaller.',
      alternative: {
        type: 'tap-rhythm',
        prompt: 'Tap 8 even downstrokes, one on each click.',
        rhythm: { pattern: 'q q q q | q q q q' },
        tempo: 60,
        show: 'both',
        explain: 'Eight even strokes over two bars, one on every click.',
      },
    },
    {
      type: 'card',
      title: 'Down, then up',
      body: 'Now down-up: down on the click, up halfway between clicks, the pick passing back through the same string. Count "1 and 2 and": down on the numbers, up on the "and".',
      tip: 'Keep the up as small as the down. If the ups are louder, your wrist is swinging too wide.',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap down-up: two even taps for every click.',
      rhythm: { pattern: 'e e e e e e e e' },
      tempo: 60,
      show: 'both',
      explain: 'Two taps per click: down on the beat, up halfway between. That is eighth notes, and your first alternate picking.',
    },
    techniqueTask({
      id: 'alternate-open',
      title: 'Down-up on every string',
      exercise: 'tech-alternate-open',
      minutes: 5,
      body: 'Start at 60 {t:bpm|BPM}: down-up on string 1 for two bars, then strings 2 to 6. Go up 4 BPM only after two clean passes in a row. Clean means every stroke on the beat and the same loudness.',
      tip: 'Slow and even beats fast and messy. You are teaching your hands, not racing them.',
    }),
    {
      type: 'true-false',
      statement: 'The picking motion comes from the elbow.',
      answer: false,
      explain: 'It comes from the wrist, small and relaxed, like flicking water off your hand. The elbow stays almost still.',
      fact: 'pick-motion',
    },
  ],
  facts: [
    { id: 'pick-grip', front: 'How do you hold a pick?', back: 'Between the pad of your thumb and the side of your index finger, with 2 to 3 mm showing.' },
    { id: 'pick-motion', front: 'Where does the picking motion come from?', back: 'The wrist: a small motion, like flicking a drop of water off your hand.' },
  ],
};

// ── 5. Your first tune: Hot Cross Buns ──────────────────────────────────────────────────────────

/** Hot Cross Buns, version A (day one): bar 3 as four quarter notes. All on string 3. */
const BUNS_A = [
  { string: 3, fret: 4, duration: 'q' },
  { string: 3, fret: 2, duration: 'q' },
  { string: 3, fret: 0, duration: 'h' },
  { string: 3, fret: 4, duration: 'q' },
  { string: 3, fret: 2, duration: 'q' },
  { string: 3, fret: 0, duration: 'h' },
  { string: 3, fret: 0, duration: 'q' },
  { string: 3, fret: 0, duration: 'q' },
  { string: 3, fret: 2, duration: 'q' },
  { string: 3, fret: 2, duration: 'q' },
  { string: 3, fret: 4, duration: 'q' },
  { string: 3, fret: 2, duration: 'q' },
  { string: 3, fret: 0, duration: 'h' },
];

const hotCrossBuns: TeacherLesson = {
  id: 'hot-cross-buns',
  title: 'Your first tune: Hot Cross Buns',
  teaches: 'Press with the fingertip just behind the fret, and read tab: lines are strings, numbers are frets.',
  minutes: 5,
  skill: 'teacher:mia:hot-cross-buns',
  steps: [
    {
      type: 'card',
      id: 'press',
      title: 'Press just behind the fret',
      art: 'fretting',
      body: 'Press with the very tip of your finger just behind the fret wire, on the side nearer the body: not on top of the wire, not in the middle of the space. Use just enough pressure for a clear note.',
      tip: 'Buzzing? Move closer to the wire or press a little harder. Muffled? Curve the finger so it stands on its tip.',
    },
    {
      type: 'choice',
      prompt: 'Your note buzzes. What helps most?',
      options: [
        { text: 'Move closer to the fret wire', correct: true },
        { text: 'Press in the middle of the space', why: 'The middle of the space is the hardest place to get a clean note.' },
        { text: 'Pluck more softly', why: 'A softer pluck is quieter, but the buzz stays.' },
      ],
      explain: 'Just behind the fret wire, a light press gives a clean note. Further back, you need much more pressure and it still buzzes.',
      fact: 'where-to-press',
    },
    {
      type: 'card',
      title: 'Reading tab',
      body: 'In {t:tab} each line is a string, with string 1 on top. The numbers are the frets to press, and 0 means open. Hot Cross Buns lives on string 3: {n:B} at fret 4, {n:A} at fret 2 and the open {n:G}.',
      figure: { kind: 'tab', tempo: 72, notes: [...BUNS_A], caption: 'Hot Cross Buns, all on string 3: 4 2 0, 4 2 0, 0 0 2 2, 4 2 0.' },
    },
    {
      type: 'choice',
      prompt: 'In tab, what does a 0 on a line mean?',
      options: [
        { text: 'Play that string open', correct: true },
        { text: 'Do not play that string', why: 'A string you do not play simply has no number.' },
        { text: 'Press fret 10', why: 'Fret 10 is written 10. A 0 is the open string.' },
      ],
      explain: 'Numbers are frets, and 0 means no fret at all: the open string.',
      fact: 'tab-zero',
    },
    {
      type: 'card',
      title: 'Your hand in second position',
      body: 'Before you start, put finger 1 over fret 2 and finger 3 over fret 4 on string 3. Your hand is now in second {t:position}, so nothing has to stretch: each finger has its own fret.',
      figure: {
        kind: 'fretboard',
        frets: [0, 5],
        labels: 'finger',
        dots: [
          { string: 3, fret: 2, note: 'A3', finger: 1 },
          { string: 3, fret: 4, note: 'B3', finger: 3 },
        ],
        caption: 'Finger 1 on fret 2 ({n:A}), finger 3 on fret 4 ({n:B}).',
      },
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap {n:A} on string 3.',
      find: { note: 'A3' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 5],
      strings: [3],
      explain: 'String 3, fret 2 is {n:A}, under your first finger.',
      fact: 'buns-notes',
    },
    {
      type: 'play-note',
      prompt: 'Play {n:B}: string 3, fret 4, with finger 3. Let it ring clearly.',
      note: 'B3',
      octave: 'exact',
      where: { string: 3, fret: 4 },
      explain: 'String 3, fret 4 is {n:B}, the first note of the tune. A clear ring means your fingertip is just behind the fret.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap {n:B} on string 3.',
        find: { note: 'B3' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 5],
        strings: [3],
        explain: 'String 3, fret 4 is {n:B}, under your third finger.',
      },
    },
    {
      type: 'play-phrase',
      prompt: 'Play the first bar: {n:B}, {n:A}, then the open {n:G}, held for two beats.',
      notes: [
        { string: 3, fret: 4, duration: 'q' },
        { string: 3, fret: 2, duration: 'q' },
        { string: 3, fret: 0, duration: 'h' },
      ],
      octave: 'exact',
      tempo: 72,
      explain: 'Fret 4, fret 2, then lift your fingers for the open string: {n:B} {n:A} {n:G}, falling like a sigh.',
      alternative: {
        type: 'order',
        prompt: 'Put the notes of the first bar in order.',
        tiles: ['{n:B}', '{n:A}', '{n:G}'],
        distractors: ['{n:C}'],
        explain: 'The tune starts high and steps down: {n:B} at fret 4, {n:A} at fret 2, the open {n:G}.',
      },
    },
    playerTask({
      id: 'buns-wait',
      title: 'Hot Cross Buns in wait mode',
      song: 'hot-cross-buns',
      mode: 'wait',
      minutes: 6,
      body: {
        text: 'In wait mode the music waits until you play each right note, so take all the time you need. In the Player, bar 3 is eight quick notes, "one a penny, two a penny": count 1 & 2 & 3 & 4 & out loud.',
        say: 'In wait mode the music waits until you play each right note, so take all the time you need. In the Player, bar 3 is eight quick notes, one a penny, two a penny: count one and two and three and four and, out loud.',
      },
      tip: 'When wait mode feels easy, play it in Listen mode at a slower speed, then at full speed.',
    }),
    {
      type: 'tap-rhythm',
      prompt: 'Bar 3 in the Player: tap its eight quick notes, two for every click.',
      rhythm: { pattern: 'e e e e e e e e' },
      tempo: 60,
      show: 'both',
      explain: 'Eight eighth notes: two for every beat. Counting "1 and 2 and" keeps them even.',
    },
    {
      type: 'fretboard-name',
      prompt: 'Which note is string 3, fret 2?',
      position: { string: 3, fret: 2 },
      ask: 'note',
      spelling: 'any',
      options: ['A', 'B', 'G', 'C'],
      explain: 'String 3, fret 2 is {n:A}: the middle note of Hot Cross Buns.',
      fact: 'buns-notes',
    },
  ],
  facts: [
    { id: 'where-to-press', front: 'Where do you press a string for a clean note?', back: 'With the fingertip, just behind the fret wire, on the side nearer the body.' },
    { id: 'tab-zero', front: 'In tab, what does 0 mean?', back: 'Play that string open, with no finger on it.' },
    { id: 'buns-notes', front: 'The three notes of Hot Cross Buns on string 3?', back: '{n:B} at fret 4, {n:A} at fret 2, and the open {n:G}.' },
  ],
};

// ── 6. Your first-week show (milestone) ─────────────────────────────────────────────────────────

const firstWeekShow: TeacherLesson = {
  id: 'first-week-show',
  title: 'Your first-week show',
  teaches: 'When you play with others, keep going: let a wrong note go and come back in on the next beat.',
  minutes: 4,
  skill: 'teacher:mia:first-week-show',
  steps: [
    {
      type: 'card',
      title: 'One rule: keep going',
      body: 'Musicians have one rule when the band is playing: keep going. If a note goes wrong, let it go and come back in on the next beat. Nobody remembers a wrong note, but everybody notices a stop.',
      tip: 'Today you play Hot Cross Buns from start to finish. That is a performance.',
    },
    {
      type: 'choice',
      prompt: 'You play a wrong note in the middle of the tune. What do you do?',
      options: [
        { text: 'Keep going, in on the next beat', correct: true },
        { text: 'Stop and start from the top', why: 'Stopping is the one thing everyone notices. Keep the beat going.' },
        { text: 'Repeat the note until it is right', why: 'The band will not wait. Let it go and catch the next beat.' },
      ],
      explain: 'Keep going. The beat carries on without you, so step back in with it on the next beat.',
      fact: 'keep-going',
    },
    toolTask({
      id: 'show-tune',
      title: 'Tune up for the show',
      tool: 'tuner',
      minutes: 2,
      body: 'Every show starts in tune. Tune all six strings, string 6 to string 1, finishing each one by tightening up to the note.',
    }),
    {
      type: 'tap-rhythm',
      prompt: 'Count yourself in: tap the four beats of the count-in.',
      rhythm: { pattern: 'q q q q' },
      tempo: 72,
      show: 'both',
      explain: 'A count-in is four even beats before the music starts: "1, 2, 3, 4", and you come in on the next 1.',
    },
    techniqueTask({
      id: 'warm-up',
      title: 'The five-minute warm-up',
      exercise: 'tech-warm-up',
      minutes: 5,
      body: 'Warm up before you perform: open-string picking, a slow finger exercise, an easy change. From now on, every session starts with tuning and these five minutes.',
      tip: 'Cold hands? Warm them first. Never stretch to discomfort.',
    }),
    {
      type: 'true-false',
      statement: 'From now on, every session starts with tuning and a warm-up.',
      answer: true,
      explain: 'A minute of tuning and five minutes of warm-up make everything after them sound better and feel easier.',
    },
    {
      type: 'card',
      title: 'Your programme',
      body: 'Hot Cross Buns, all on string 3, at 72 {t:bpm|BPM}. Hand in second position, count yourself in, play it start to finish. About 8 notes in 10 is a pass, and a wrong note is just a note.',
      figure: { kind: 'tab', tempo: 72, notes: [...BUNS_A], caption: 'Hot Cross Buns: 4 2 0, 4 2 0, 0 0 2 2, 4 2 0.' },
    },
    playerTask({
      id: 'show-band',
      title: 'Rehearse with the band',
      song: 'hot-cross-buns',
      mode: 'flow',
      minutes: 4,
      body: 'In the Player, play Hot Cross Buns with the band in Flow mode, start to finish, not stopping. The microphone listens and scores each note. Then come back for your show.',
      tip: 'The quick notes in bar 3 are the tricky part. Count "1 and 2 and" and keep going.',
    }),
    {
      type: 'play-phrase',
      id: 'show',
      prompt: 'Your show: play Hot Cross Buns from start to finish, and keep going.',
      notes: [...BUNS_A],
      octave: 'exact',
      tempo: 72,
      pass: 0.8,
      explain: 'Hot Cross Buns: {n:B} {n:A} {n:G}, {n:B} {n:A} {n:G}, {n:G} {n:G} {n:A} {n:A}, {n:B} {n:A} {n:G}. About 8 notes in 10 is a pass.',
      alternative: {
        type: 'order',
        prompt: 'Put the four bars of Hot Cross Buns in order.',
        tiles: ['{n:B} {n:A} {n:G}', '{n:B} {n:A} {n:G}', '{n:G} {n:G} {n:A} {n:A}', '{n:B} {n:A} {n:G}'],
        explain: 'Twice {n:B} {n:A} {n:G}, then the quick notes {n:G} {n:G} {n:A} {n:A}, then {n:B} {n:A} {n:G} to finish.',
      },
    },
  ],
  facts: [{ id: 'keep-going', front: 'A wrong note while the band plays: what do you do?', back: 'Keep going, and come back in on the next beat. Everybody notices a stop.' }],
};

/** Unit 1 of Mia's course. */
const unit: TeacherUnit = {
  id: 'mia-hello-guitar',
  title: 'Hello, guitar',
  theme: 'basics',
  description: 'Hold the guitar comfortably, tune it, make clear sounds with thumb and pick, and play your first tune.',
  lessons: [meetYourGuitar, sitAndHold, tuneUp, thePick, hotCrossBuns, firstWeekShow],
  checkpoint: { sample: 8, maxMistakes: 2 },
  milestone: {
    lesson: 'first-week-show',
    step: 'show',
    piece: 'Hot Cross Buns',
    song: 'hot-cross-buns',
    celebrate: 'You played a whole tune, start to finish, and kept going. A week ago that guitar was a stranger. Next we make chords: same hands, same patience, much bigger sound.',
  },
  glossary: [
    { id: 'headstock', term: 'headstock', definition: 'The end of the neck past the nut, where the tuning pegs are.' },
    { id: 'tuning-peg', term: 'tuning peg', definition: 'A key on the headstock. Turning it tightens or loosens one string, which raises or lowers its note.' },
    { id: 'bridge', term: 'bridge', definition: 'The strip on the body that holds the strings at the far end from the headstock.' },
    { id: 'soundhole', term: 'soundhole', definition: 'The round hole in the body of an acoustic guitar. You pluck the strings just over it.' },
    { id: 'tuner', term: 'tuner', definition: 'An app or device that shows whether a string is flat (too low), sharp (too high) or in tune.' },
  ],
};

export default unit;
