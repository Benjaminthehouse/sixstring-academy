/**
 * Theory Path, unit 2: The six strings. Written from the syllabus entries in
 * `src/content/plan/theory-path.json` (unit `the-six-strings`), one lesson per entry, in order:
 * each lesson opens with the "on the guitar" picture, asks the planned exercises, ends with the
 * planned drill, and turns every planned fact into a review card.
 *
 * `the-six-strings.test.ts` cross-checks every string, fret and pitch the text quotes against the
 * guitar engine: the open strings, their octave numbers, the fifth-fret rule and what each
 * listening question plays.
 *
 * There is no tuner figure, so "Using a tuner" describes the tuner face in words beside the open
 * string it is tuning. The out-of-tune listening question of "The fifth-fret rule" plays two notes a
 * fret apart (the synth only plays whole half steps): a real, fast wobble, and the text says so.
 */
import type { Lesson, Unit } from '@/lessons';

const U = 'the-six-strings';

const stringNumbers: Lesson = {
  id: 'string-numbers',
  title: 'String numbers',
  teaches: 'The strings are numbered 1 to 6, from the thinnest (highest) to the thickest (lowest).',
  minutes: 2,
  skill: `theory:${U}:string-numbers`,
  requires: ['pitch-high-and-low'],
  steps: [
    {
      type: 'card',
      title: 'Six strings, six numbers',
      body: 'Guitarists give every string a number from **1 to 6**: the {t:string-numbers}. String 1 is the thinnest, string 6 the thickest. Fretboard pictures in this app draw string 1 at the **top**, just as tab does.',
      figure: {
        kind: 'fretboard',
        frets: [0, 3],
        dots: [
          { string: 1, fret: 0, note: 'E4', label: '1' },
          { string: 2, fret: 0, note: 'B3', label: '2' },
          { string: 3, fret: 0, note: 'G3', label: '3' },
          { string: 4, fret: 0, note: 'D3', label: '4' },
          { string: 5, fret: 0, note: 'A2', label: '5' },
          { string: 6, fret: 0, note: 'E2', label: '6' },
        ],
        caption: 'Each string with its number: string 1 on top, string 6 at the bottom.',
      },
    },
    {
      type: 'choice',
      prompt: 'Which string is the thickest?',
      options: [
        { text: 'String 1', why: 'String 1 is the thinnest. The numbers start from the thin side.' },
        { text: 'String 3', why: 'String 3 is in the middle. The numbers count up toward the thick side.' },
        { text: 'String 6', correct: true },
      ],
      shuffle: false,
      explain: 'The numbers run from the thinnest string, string 1, to the thickest, string 6.',
      fact: 'six-strings-thin-to-thick',
    },
    {
      type: 'true-false',
      statement: 'String 1 is the lowest-sounding string.',
      answer: false,
      explain: 'String 1 is the thinnest, and a thin string vibrates fastest, so it sounds the highest. String 6, the thickest, sounds the lowest.',
      fact: 'six-strings-high-to-low',
    },
    {
      type: 'card',
      title: 'The way you hold it',
      body: 'When you hold the guitar to play, string 6 is on top, nearest your face, and string 1 is nearest the floor. Tab, and the fretboard pictures in this app, put string 1 on top instead. Lost? Find the thickest string: that is always string 6.',
      tip: 'Say the numbers aloud as you touch each string, from the thick one: 6, 5, 4, 3, 2, 1.',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap open string 4.',
      find: { note: 'D3' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 3],
      hint: 'String 1 is the top line. Count down from there.',
      explain: 'Count down from string 1 on the top line: 1, 2, 3, 4. Played {t:open-string|open}, string 4 sounds {n:D}.',
    },
    {
      type: 'order',
      prompt: 'Put the strings in order, from the highest-sounding to the lowest.',
      tiles: ['String 1', 'String 2', 'String 3', 'String 4', 'String 5', 'String 6'],
      explain: 'The thinner the string, the higher it sounds: from string 1, the thinnest and highest, to string 6, the thickest and lowest.',
      fact: 'six-strings-high-to-low',
    },
    {
      type: 'choice',
      prompt: 'You hold the guitar to play. Which string is nearest your face?',
      options: [
        { text: 'String 6, the thickest', correct: true },
        { text: 'String 1, the thinnest', why: 'String 1 is nearest the floor when you play.' },
      ],
      shuffle: false,
      explain: 'In playing position the thick string 6 is on top, nearest your face. String 1 is nearest the floor.',
      fact: 'six-strings-6-nearest-face',
    },
    {
      type: 'true-false',
      statement: 'In tab and in this app\'s fretboard pictures, string 1 is drawn at the top.',
      answer: true,
      explain: 'Tab always puts string 1, the thinnest, on the top line and string 6 on the bottom line, and the fretboard pictures in this app do the same.',
      fact: 'six-strings-1-on-top',
    },
    {
      type: 'play-note',
      prompt: 'Pluck string 1, the thinnest, open.',
      note: 'E4',
      octave: 'exact',
      where: { string: 1, fret: 0 },
      explain: 'Open string 1 is the high {n:E}: the thinnest string and the highest open note on the guitar.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap open string 1, the thinnest.',
        find: { note: 'E4' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 3],
        explain: 'String 1 is the top line of the picture. Played open, it sounds the high {n:E}.',
      },
    },
  ],
  facts: [
    {
      id: 'six-strings-thin-to-thick',
      front: 'Which string is string 1, and which is string 6?',
      back: 'String 1 is the thinnest string; string 6 is the thickest.',
      ask: {
        type: 'choice',
        prompt: 'Which string is string 1?',
        options: [
          { text: 'The thinnest', correct: true },
          { text: 'The thickest', why: 'The thickest string is string 6. The numbers start from the thin side.' },
          { text: 'The middle one', why: 'Six strings have no single middle one; string 1 is the thinnest.' },
        ],
        shuffle: false,
        explain: 'String 1 is the thinnest string and string 6 the thickest.',
      },
    },
    {
      id: 'six-strings-high-to-low',
      front: 'Which string sounds the highest, and which the lowest?',
      back: 'String 1 sounds the highest; string 6 sounds the lowest.',
    },
    {
      id: 'six-strings-6-nearest-face',
      front: 'You hold the guitar to play. Which string is nearest your face?',
      back: 'String 6, the thickest. String 1 is nearest the floor.',
    },
    {
      id: 'six-strings-1-on-top',
      front: 'In tab and in this app\'s fretboard pictures, which string is drawn at the top?',
      back: 'String 1, the thinnest. String 6 is drawn at the bottom.',
    },
  ],
};

const stringNames: Lesson = {
  id: 'string-names',
  title: 'E A D G B E',
  teaches: 'In standard tuning the open strings, from string 6 to string 1, are E A D G B E.',
  minutes: 3,
  skill: `theory:${U}:string-names`,
  requires: ['string-numbers'],
  steps: [
    {
      type: 'card',
      title: 'Six names to know',
      body: 'Each open string has a note name. From string 6 to string 1 they are {n:E} {n:A} {n:D} {n:G} {n:B} {n:E}. Strings 6 and 1 are both {n:E}: the low E and the high E, two {t:octave|octaves} apart.',
      figure: {
        kind: 'fretboard',
        frets: [0, 3],
        dots: [
          { string: 6, fret: 0, note: 'E2' },
          { string: 5, fret: 0, note: 'A2' },
          { string: 4, fret: 0, note: 'D3' },
          { string: 3, fret: 0, note: 'G3' },
          { string: 2, fret: 0, note: 'B3' },
          { string: 1, fret: 0, note: 'E4' },
        ],
        caption: 'String 6 (bottom) to string 1 (top): {n:E} {n:A} {n:D} {n:G} {n:B} {n:E}.',
      },
    },
    {
      type: 'card',
      title: 'Hear them, remember them',
      body: 'Listen from string 6 up to string 1: each string sounds higher than the one before. A sentence helps you remember the names: **E**very **A**pple **D**oes **G**row **B**ig **E**ventually.',
      figure: { kind: 'audio', sound: { kind: 'notes', notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'], tempo: 80 }, label: 'Play strings 6 to 1' },
      tip: 'Make up your own sentence if you like. A silly one sticks best.',
    },
    {
      type: 'order',
      prompt: 'Put the open strings in order, from string 6 to string 1.',
      tiles: ['{n:E}', '{n:A}', '{n:D}', '{n:G}', '{n:B}', '{n:E}'],
      distractors: ['{n:C}'],
      explain: 'From string 6 to string 1: {n:E} {n:A} {n:D} {n:G} {n:B} {n:E}. **E**very **A**pple **D**oes **G**row **B**ig **E**ventually.',
      fact: 'six-strings-open-names',
    },
    {
      type: 'choice',
      prompt: 'Which note is open string 3?',
      options: [
        { text: '{n:G}', correct: true },
        { text: '{n:D}', why: '{n:D} is string 4, just below it in pitch.' },
        { text: '{n:B}', why: '{n:B} is string 2, just above it in pitch.' },
        { text: '{n:A}', why: '{n:A} is string 5.' },
      ],
      explain: 'Count up from string 6: {n:E} (6), {n:A} (5), {n:D} (4), {n:G} (3). Open string 3 is {n:G}.',
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the open strings, from string 6 to string 1.',
      text: '{n:E}  {n:A}  ___  {n:G}  ___  {n:E}',
      blanks: ['{n:D}', '{n:B}'],
      bank: ['{n:C}', '{n:F}'],
      explain: 'E A **D** G **B** E: **D**oes is string 4 and **B**ig is string 2.',
    },
    {
      type: 'card',
      title: 'Standard tuning',
      body: 'The notes the open strings are tuned to are called a {t:tuning}. E A D G B E is **standard tuning**: the one most songs, chord charts and lessons use, this course included.',
    },
    {
      type: 'choice',
      prompt: 'What is a tuning?',
      options: [
        { text: 'The notes the open strings are tuned to', correct: true },
        { text: 'How loud the strings ring', why: 'That is volume. A tuning is the set of notes of the open strings.' },
        { text: 'The order of the frets', why: 'The frets never change. A tuning sets the notes of the open strings.' },
      ],
      explain: 'A tuning is the set of notes the six open strings are tuned to. Standard tuning is E A D G B E.',
      fact: 'six-strings-standard-tuning',
    },
    {
      type: 'true-false',
      statement: 'Strings 6 and 1 are both called {n:E}.',
      answer: true,
      explain: 'Both are {n:E}: string 6 is the low E and string 1 the high E, two octaves higher.',
      fact: 'six-strings-two-es',
    },
    {
      type: 'play-note',
      prompt: 'Play the open {n:D} string: string 4, no fingers.',
      note: 'D3',
      octave: 'exact',
      where: { string: 4, fret: 0 },
      explain: 'String 4 played open is {n:D}: **D**oes, the third word of the sentence.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap the open {n:D} string.',
        find: { note: 'D3' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 3],
        explain: 'The open {n:D} is string 4: {n:E} {n:A} **{n:D}** {n:G} {n:B} {n:E}, counting from string 6.',
      },
    },
    { generate: 'open-strings', params: { ask: 'name' } },
    { generate: 'open-strings', params: { ask: 'number' } },
  ],
  facts: [
    {
      id: 'six-strings-open-names',
      front: 'Name the open strings in standard tuning, from string 6 to string 1.',
      back: '{n:E} {n:A} {n:D} {n:G} {n:B} {n:E}',
      ask: { generate: 'open-strings', params: { ask: 'order' } },
    },
    {
      id: 'six-strings-two-es',
      front: 'Strings 6 and 1 share a name. What is it, and how far apart are they?',
      back: 'Both are {n:E}, two octaves apart: string 6 is the low E, string 1 the high E.',
    },
    {
      id: 'six-strings-memory-sentence',
      front: 'What sentence helps you remember the open strings, from string 6 up?',
      back: '**E**very **A**pple **D**oes **G**row **B**ig **E**ventually: {n:E} {n:A} {n:D} {n:G} {n:B} {n:E}.',
    },
    {
      id: 'six-strings-standard-tuning',
      front: 'What is a tuning, and what is standard tuning?',
      back: 'A tuning is the set of notes the open strings are tuned to. Standard tuning, E A D G B E, is the one most songs and lessons use.',
    },
  ],
};

const usingATuner: Lesson = {
  id: 'using-a-tuner',
  title: 'Using a tuner',
  teaches: 'A tuner shows whether a string is flat (too low) or sharp (too high); tighten to raise, loosen to lower.',
  minutes: 3,
  skill: `theory:${U}:using-a-tuner`,
  requires: ['string-names'],
  steps: [
    {
      type: 'card',
      title: 'What a tuner shows',
      body: 'A {t:tuner} listens to one string and shows the nearest note name, here {n:A}. A needle or light shows how close you are. Left of centre means **flat**: a little too low. Right of centre means **sharp**: a little too high. In the middle, the string is in tune.',
      figure: {
        kind: 'fretboard',
        frets: [0, 3],
        dots: [{ string: 5, fret: 0, note: 'A2', role: 'target' }],
        caption: 'The tuner hears open string 5 and reads {n:A}, needle left: flat.',
      },
    },
    {
      type: 'choice',
      prompt: 'Your tuner reads {n:D} and the needle is left of centre. What does that mean?',
      options: [
        { text: 'The string is a little too low: flat', correct: true },
        { text: 'The string is a little too high: sharp', why: 'Sharp is right of centre. Left of centre is flat: too low.' },
        { text: 'The string is in tune', why: 'In tune is the very centre. Left of centre is flat.' },
      ],
      shuffle: false,
      explain: 'Left of centre is flat: the string is slightly lower than {n:D}.',
      fact: 'six-strings-flat-and-sharp',
    },
    {
      type: 'card',
      title: 'Tighten to raise',
      body: 'Each string is wound round a {t:tuning-peg} on the {t:headstock}. Turn the peg to **tighten** the string and its pitch goes **up**. **Loosen** it and the pitch goes **down**. So a flat string needs tightening, and a sharp one loosening.',
      tip: 'Turn slowly while the string rings. Too far? Go a little below the note, then tighten up to it: the string holds its tuning better.',
    },
    {
      type: 'choice',
      prompt: 'Your tuner reads {n:D} with the needle left of centre: flat. What do you do?',
      options: [
        { text: 'Tighten the string', correct: true },
        { text: 'Loosen the string', why: 'Loosening lowers the pitch, and a flat string is already too low.' },
        { text: 'Press the string at fret 1', why: 'That plays a different note. The open string itself needs tuning.' },
      ],
      shuffle: false,
      explain: 'Flat means too low, and tightening raises the pitch. Tighten a little at a time until the needle sits in the middle.',
      fact: 'six-strings-tighten-raises',
    },
    {
      type: 'true-false',
      statement: 'Loosening a string raises its pitch.',
      answer: false,
      explain: 'It is the other way round: loosening lowers the pitch, and tightening raises it.',
      fact: 'six-strings-tighten-raises',
    },
    {
      type: 'card',
      title: 'Letters and numbers',
      body: 'Some tuners add a number to the letter, like {n:A2}. It says **which octave** the note is in. Standard tuning sounds {n:E2} {n:A2} {n:D3} {n:G3} {n:B3} {n:E4}. The number goes up by one at each C: just above {n:B3} comes {n:C4}.',
      figure: {
        kind: 'keyboard',
        keys: [
          { note: 'B3', label: 'B3' },
          { note: 'C4', label: 'C4', role: 'target' },
        ],
        from: 'C3',
        to: 'B4',
        caption: 'On a piano: the octave number changes at C, so {n:B3} is followed by {n:C4}.',
      },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each string with the pitch it sounds.',
      pairs: [
        { left: 'String 6', right: '{n:E2}' },
        { left: 'String 5', right: '{n:A2}' },
        { left: 'String 4', right: '{n:D3}' },
        { left: 'String 3', right: '{n:G3}' },
        { left: 'String 2', right: '{n:B3}' },
        { left: 'String 1', right: '{n:E4}' },
      ],
      explain: 'From string 6 to string 1: {n:E2} {n:A2} {n:D3} {n:G3} {n:B3} {n:E4}. The two E strings share a letter; their numbers tell them apart.',
      fact: 'six-strings-sounding-pitches',
    },
    {
      type: 'choice',
      prompt: 'Which note comes just above {n:B3}?',
      options: [
        { text: '{n:C4}', correct: true },
        { text: '{n:C3}', why: 'The octave number goes up by one at each C, so the C just above {n:B3} is {n:C4}.' },
        { text: '{n:A3}', why: '{n:A3} is below {n:B3}.' },
        { text: '{n:B4}', why: '{n:B4} is a whole octave above {n:B3}.' },
      ],
      explain: 'After {n:B} the letters start again at {n:C}, and that is where the octave number goes up: {n:B3}, then {n:C4}.',
      fact: 'six-strings-octave-numbers',
    },
    {
      type: 'play-note',
      prompt: 'Tune string 5 with a tuner until the needle sits in the middle. Then play it open: {n:A2}.',
      note: 'A2',
      octave: 'exact',
      where: { string: 5, fret: 0 },
      figure: { kind: 'audio', sound: { kind: 'notes', notes: ['A2'], tempo: 60 }, label: 'Hear the A2 reference' },
      explain: 'Open string 5 is {n:A2}. When the needle sits in the middle and stays there, it is in tune.',
      alternative: {
        type: 'choice',
        prompt: 'Your tuner hears string 5 and reads {n:A}, with the needle right of centre. What do you do?',
        options: [
          { text: 'Loosen the string a little', correct: true },
          { text: 'Tighten the string a little', why: 'Tightening raises the pitch, and a sharp string is already too high.' },
          { text: 'Nothing: it is in tune', why: 'In tune is the very centre. Right of centre is sharp: too high.' },
        ],
        shuffle: false,
        explain: 'Right of centre is sharp, a little too high. Loosening lowers the pitch back to {n:A}.',
      },
    },
    { generate: 'open-strings', params: { ask: 'name' } },
  ],
  facts: [
    {
      id: 'six-strings-flat-and-sharp',
      front: 'When you tune, what do flat and sharp mean?',
      back: 'Flat: slightly too low. Sharp: slightly too high.',
    },
    {
      id: 'six-strings-tighten-raises',
      front: 'How do you raise the pitch of a string? And lower it?',
      back: 'Tighten it to raise the pitch; loosen it to lower the pitch.',
      ask: {
        type: 'choice',
        prompt: 'Your tuner says the open {n:G} string is flat. What do you do?',
        options: [
          { text: 'Tighten it', correct: true },
          { text: 'Loosen it', why: 'Loosening lowers the pitch, and a flat string is already too low.' },
        ],
        shuffle: false,
        explain: 'Flat means too low, and tightening raises the pitch.',
      },
    },
    {
      id: 'six-strings-sounding-pitches',
      front: 'Which pitches do the open strings of standard tuning sound, with their octave numbers?',
      back: '{n:E2} {n:A2} {n:D3} {n:G3} {n:B3} {n:E4}, from string 6 to string 1. The number tells which octave the note is in.',
    },
    {
      id: 'six-strings-octave-numbers',
      front: 'Where does the octave number of a note go up by one?',
      back: 'At each C: the note just above {n:B3} is {n:C4}.',
    },
  ],
};

const theFifthFretRule: Lesson = {
  id: 'the-fifth-fret-rule',
  title: 'The fifth-fret rule',
  teaches: 'Fret 5 of each string matches the next thinner open string, except on string 3, where fret 4 does.',
  minutes: 3,
  skill: `theory:${U}:the-fifth-fret-rule`,
  requires: ['using-a-tuner'],
  steps: [
    {
      type: 'card',
      title: 'Strings that share a note',
      body: 'Press string 6 at fret 5 and you get {n:A}: the very same note as open string 5. It works all the way across: fret 5 of a string matches the next thinner open string. One exception: on string 3, {n:G}, it is **fret 4** that matches open string 2.',
      figure: {
        kind: 'fretboard',
        frets: [0, 5],
        dots: [
          { string: 6, fret: 5, note: 'A2', role: 'target' },
          { string: 5, fret: 0, note: 'A2' },
          { string: 5, fret: 5, note: 'D3', role: 'target' },
          { string: 4, fret: 0, note: 'D3' },
          { string: 4, fret: 5, note: 'G3', role: 'target' },
          { string: 3, fret: 0, note: 'G3' },
          { string: 3, fret: 4, note: 'B3', role: 'target' },
          { string: 2, fret: 0, note: 'B3' },
          { string: 2, fret: 5, note: 'E4', role: 'target' },
          { string: 1, fret: 0, note: 'E4' },
        ],
        caption: 'Each coloured dot matches the next open string. String 3 uses fret 4.',
      },
      tip: 'This is how to tune without a tuner: get string 6 right, then tune open string 5 to it at fret 5, and so on across. Open string 2 matches string 3 at fret 4.',
    },
    {
      type: 'choice',
      prompt: 'Which fret on string 3 matches open string 2?',
      options: [
        { text: 'Fret 3', why: 'Fret 3 is one fret too low: it does not reach {n:B}.' },
        { text: 'Fret 4', correct: true },
        { text: 'Fret 5', why: 'Fret 5 of string 3 is {n:C}, one fret too high. String 3 is the exception.' },
        { text: 'Fret 7', why: 'That is much too high. String 3 needs fret 4.' },
      ],
      shuffle: false,
      explain: 'String 3 is {n:G}. Four frets higher is {n:B}, the note of open string 2. This is the one string where fret 5 does not work.',
      fact: 'six-strings-string-3-fret-4',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap the fret on string 4 that matches open string 3.',
      find: { note: 'G3' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 7],
      strings: [4],
      explain: 'Open string 3 is {n:G}. String 4 at fret 5 is the same {n:G}: the fifth-fret rule.',
      fact: 'six-strings-fifth-fret-rule',
    },
    {
      type: 'true-false',
      statement: 'On string 2, fret 5 matches open string 1.',
      answer: true,
      explain: 'String 2 is {n:B}. Five frets higher is {n:E}, the note of open string 1. After the string 3 exception, the rule is back.',
      fact: 'six-strings-fifth-fret-rule',
    },
    {
      type: 'card',
      title: 'Steady or wobbling',
      body: 'Two notes at exactly the same pitch are in {t:unison}: they blend into one smooth, steady sound. If one is slightly off, you hear a wobble, called {t:beating}. The closer the two notes get, the slower the wobble, until it stops.',
      figure: { kind: 'audio', sound: { kind: 'notes', notes: ['A2', 'A2'], together: true }, label: 'Hear two strings in tune' },
    },
    {
      type: 'listen-choice',
      prompt: 'Two strings are played together. Do they sound steady, or wobbling?',
      sound: { kind: 'notes', notes: ['A2', 'A2'], together: true },
      options: [{ text: 'Steady: in tune', correct: true }, { text: 'Wobbling: out of tune' }],
      shuffle: false,
      explain: 'That was string 6 at fret 5 with open string 5: both {n:A}, exactly the same pitch. A unison sounds smooth and steady.',
    },
    {
      type: 'listen-choice',
      prompt: 'Listen to these two strings ringing together. Steady, or wobbling?',
      sound: { kind: 'notes', notes: ['G#2', 'A2'], together: true },
      options: [{ text: 'Steady: in tune' }, { text: 'Wobbling: out of tune', correct: true }],
      shuffle: false,
      explain: 'That was string 6 at fret 4 against open string 5: a whole fret apart, so the wobble is fast and rough. A string only slightly off wobbles slowly.',
    },
    {
      type: 'true-false',
      statement: 'Two strings slightly out of tune make a wobbling sound.',
      answer: true,
      explain: 'That wobble is called beating. It slows down as the strings get closer and stops when they are in unison.',
      fact: 'six-strings-unison-and-beating',
    },
    {
      type: 'play-note',
      prompt: 'Play string 6 at fret 5. It should match open string 5: {n:A2}.',
      note: 'A2',
      octave: 'exact',
      where: { string: 6, fret: 5 },
      explain: 'String 6 at fret 5 is {n:A2}, the same as open string 5. Play one, then the other: they should sound like the same note.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap the fret on string 6 that matches open string 5.',
        find: { note: 'A2' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 7],
        strings: [6],
        explain: 'Open string 5 is {n:A}. String 6 at fret 5 is the same {n:A}.',
      },
      fact: 'six-strings-fret-5-is-a',
    },
    {
      type: 'choice',
      prompt: 'Which string breaks the fifth-fret rule?',
      options: [
        { text: 'String 3, the {n:G} string', correct: true },
        { text: 'String 6, the low {n:E} string', why: 'String 6 at fret 5 is {n:A}, which matches open string 5.' },
        { text: 'String 4, the {n:D} string', why: 'String 4 at fret 5 is {n:G}, which matches open string 3.' },
      ],
      explain: 'On string 3, fret 4 matches open string 2, {n:B}. Every other pair uses fret 5.',
      fact: 'six-strings-string-3-fret-4',
    },
  ],
  facts: [
    {
      id: 'six-strings-fret-5-is-a',
      front: 'Which note is string 6 at fret 5?',
      back: '{n:A}: the same note as open string 5.',
      ask: {
        type: 'fretboard-name',
        prompt: 'Which note is string 6 at fret 5?',
        position: { string: 6, fret: 5 },
        ask: 'note',
        spelling: 'any',
        options: ['A', 'G', 'B', 'D'],
        explain: 'String 6 at fret 5 is {n:A}, the same note as open string 5.',
      },
    },
    {
      id: 'six-strings-fifth-fret-rule',
      front: 'On which strings does fret 5 match the next thinner open string?',
      back: 'Strings 6, 5, 4 and 2. String 3 is the exception.',
    },
    {
      id: 'six-strings-string-3-fret-4',
      front: 'On string 3, which fret matches open string 2?',
      back: 'Fret 4: {n:B}, the same note as open string 2.',
    },
    {
      id: 'six-strings-unison-and-beating',
      front: 'What is a unison, and how do two strings slightly out of tune sound?',
      back: 'Two notes at exactly the same pitch are in unison. Slightly out of tune, they make a wobbling sound called beating.',
    },
  ],
};

const upAndDownTheNeck: Lesson = {
  id: 'up-and-down-the-neck',
  title: 'High, low and up the neck',
  teaches: 'On the guitar, "high" and "up" mean higher in pitch, so "up the neck" means toward the body.',
  minutes: 2,
  skill: `theory:${U}:up-and-down-the-neck`,
  requires: ['the-fifth-fret-rule'],
  steps: [
    {
      type: 'card',
      title: 'High means pitch',
      body: 'On the guitar, **high** and **low** always mean pitch, not place. The high {n:E} string is string 1, the one nearest the floor. The low {n:E} string is string 6, nearest your face. It sounds upside down, but every guitarist says it this way.',
      figure: {
        kind: 'fretboard',
        frets: [0, 3],
        dots: [
          { string: 6, fret: 0, note: 'E2', role: 'root' },
          { string: 1, fret: 0, note: 'E4', role: 'target' },
        ],
        caption: 'String 6, the low {n:E}, and string 1, the high {n:E}.',
      },
    },
    {
      type: 'true-false',
      statement: 'The high {n:E} string is the one nearest the ceiling when you play.',
      answer: false,
      explain: 'The high E is string 1, the thinnest, and it is nearest the floor. "High" means high in pitch, not high in the room.',
      fact: 'six-strings-higher-is-pitch',
    },
    {
      type: 'card',
      title: 'Up the neck',
      body: 'Each fret toward the body gives a higher note. So **up the neck** means toward the body, to higher frets. **Down the neck** means back toward the headstock and the {t:nut}.',
      figure: {
        kind: 'fretboard',
        frets: [0, 12],
        dots: [
          { string: 1, fret: 0, note: 'E4' },
          { string: 1, fret: 5, note: 'A4' },
          { string: 1, fret: 12, note: 'E5', role: 'target' },
        ],
        caption: 'Up the neck: away from the nut, toward the body. Each step up is higher.',
      },
    },
    {
      type: 'true-false',
      statement: 'Moving up the neck means moving toward the headstock.',
      answer: false,
      explain: 'Up the neck means toward the body, where the frets give higher notes. Toward the headstock is down the neck.',
      fact: 'six-strings-up-the-neck',
    },
    {
      type: 'choice',
      prompt: 'Your teacher says: "Play the same note higher up the neck." Which way does your hand move?',
      options: [
        { text: 'Toward the body', correct: true },
        { text: 'Toward the headstock', why: 'That is down the neck, toward the lower frets.' },
        { text: 'Toward the floor', why: 'That moves your hand to thinner strings, not along the neck.' },
      ],
      explain: 'Up the neck is toward the body, to higher frets. The same note can be found there on a thicker string.',
      fact: 'six-strings-up-the-neck',
    },
    {
      type: 'fretboard-name',
      prompt: 'Which note is this open string?',
      position: { string: 1, fret: 0 },
      ask: 'note',
      spelling: 'any',
      options: ['E', 'B', 'A', 'G'],
      explain: 'Open string 1 is {n:E}: the high E string, the thinnest one.',
      fact: 'six-strings-low-and-high-e',
    },
    {
      type: 'choice',
      prompt: 'Which string do guitarists call the low {n:E}?',
      options: [
        { text: 'String 6, the thickest', correct: true },
        { text: 'String 1, the thinnest', why: 'That is the high E: it sounds two octaves higher.' },
      ],
      shuffle: false,
      explain: 'The low E is string 6, the thickest and lowest-sounding string. String 1 is the high E.',
      fact: 'six-strings-low-and-high-e',
    },
    {
      type: 'play-note',
      prompt: 'Move up the neck: play string 1 at fret 5.',
      note: 'A4',
      octave: 'exact',
      where: { string: 1, fret: 5 },
      explain: 'Five frets up the neck from the open high {n:E} is {n:A}: a higher note, because you moved toward the body.',
      alternative: {
        type: 'choice',
        prompt: 'You slide from fret 2 to fret 7 on string 1. Did you move up or down the neck?',
        options: [
          { text: 'Up: toward the body, to a higher note', correct: true },
          { text: 'Down: toward the headstock, to a lower note', why: 'Fret 7 is nearer the body than fret 2, and it sounds higher.' },
        ],
        shuffle: false,
        explain: 'Higher fret numbers are nearer the body and sound higher: from fret 2 to fret 7 is up the neck.',
      },
    },
    { generate: 'open-strings', params: { ask: 'number' } },
  ],
  facts: [
    {
      id: 'six-strings-higher-is-pitch',
      front: 'On the guitar, does "higher" mean higher in pitch or higher in space?',
      back: 'Higher in pitch. The highest string, string 1, is the one nearest the floor.',
    },
    {
      id: 'six-strings-up-the-neck',
      front: 'Which way is "up the neck"?',
      back: 'Toward the body: to higher frets and higher notes.',
      ask: {
        type: 'true-false',
        statement: 'Moving up the neck means moving toward the body.',
        answer: true,
        explain: 'Up the neck is toward the body, where the frets give higher notes.',
      },
    },
    {
      id: 'six-strings-low-and-high-e',
      front: 'Which string is the "low E", and which the "high E"?',
      back: 'The low E is string 6, the thickest. The high E is string 1, the thinnest.',
    },
  ],
};

/** Unit 2 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'The six strings',
  theme: 'basics',
  description: 'Number, name and tune the six open strings, and learn what "high", "low" and "up the neck" mean.',
  lessons: [stringNumbers, stringNames, usingATuner, theFifthFretRule, upAndDownTheNeck],
  checkpoint: {
    maxMistakes: 2,
    steps: [
      {
        type: 'choice',
        prompt: 'Which string is string 1?',
        options: [
          { text: 'The thinnest', correct: true },
          { text: 'The thickest', why: 'The thickest string is string 6.' },
        ],
        shuffle: false,
        explain: 'Strings are numbered from the thinnest, string 1, to the thickest, string 6.',
      },
      {
        type: 'true-false',
        statement: 'String 6 sounds the lowest.',
        answer: true,
        explain: 'String 6 is the thickest string, and it sounds the lowest.',
      },
      {
        type: 'order',
        prompt: 'Put the open strings in order, from string 6 to string 1.',
        tiles: ['{n:E}', '{n:A}', '{n:D}', '{n:G}', '{n:B}', '{n:E}'],
        distractors: ['{n:C}'],
        explain: 'Standard tuning from string 6 to string 1: {n:E} {n:A} {n:D} {n:G} {n:B} {n:E}.',
      },
      { generate: 'open-strings', params: { ask: 'name' } },
      {
        type: 'choice',
        prompt: 'What is standard tuning?',
        options: [
          { text: 'E A D G B E, from string 6 to string 1', correct: true },
          { text: 'E B G D A E, from string 6 to string 1', why: 'That is standard tuning read the other way, from string 1 to string 6.' },
          { text: 'A D G C E A, from string 6 to string 1', why: 'Standard tuning starts on the low E.' },
        ],
        explain: 'Standard tuning, the one most music uses, is E A D G B E from string 6 to string 1.',
      },
      {
        type: 'match-pairs',
        prompt: 'Match each string with the pitch it sounds.',
        pairs: [
          { left: 'String 6', right: '{n:E2}' },
          { left: 'String 4', right: '{n:D3}' },
          { left: 'String 3', right: '{n:G3}' },
          { left: 'String 1', right: '{n:E4}' },
        ],
        explain: 'Standard tuning sounds {n:E2} {n:A2} {n:D3} {n:G3} {n:B3} {n:E4}, from string 6 to string 1.',
      },
      {
        type: 'choice',
        prompt: 'Your tuner reads {n:G} with the needle right of centre. What do you do?',
        options: [
          { text: 'Loosen the string a little', correct: true },
          { text: 'Tighten the string a little', why: 'Right of centre is sharp, already too high. Tightening raises it further.' },
          { text: 'Nothing: it is in tune', why: 'In tune is the very centre.' },
        ],
        shuffle: false,
        explain: 'Right of centre is sharp, slightly too high. Loosening lowers the pitch.',
      },
      {
        type: 'true-false',
        statement: 'Tightening a string raises its pitch.',
        answer: true,
        explain: 'Tighten to raise the pitch, loosen to lower it.',
      },
      {
        type: 'fretboard-find',
        prompt: 'Tap the fret on string 5 that matches open string 4.',
        find: { note: 'D3' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 7],
        strings: [5],
        explain: 'String 5 at fret 5 is {n:D}, the note of open string 4.',
      },
      {
        type: 'choice',
        prompt: 'Which fret on string 3 matches open string 2?',
        options: [
          { text: 'Fret 4', correct: true },
          { text: 'Fret 5', why: 'String 3 is the exception: fret 5 there is {n:C}, one fret too high.' },
          { text: 'Fret 6', why: 'Too high. The match is at fret 4.' },
        ],
        shuffle: false,
        explain: 'On string 3, {n:G}, fret 4 is {n:B}: the note of open string 2.',
      },
      {
        type: 'true-false',
        statement: 'Up the neck means toward the body.',
        answer: true,
        explain: 'Up the neck is toward the body, to higher frets and higher notes.',
      },
    ],
  },
};

export default unit;
