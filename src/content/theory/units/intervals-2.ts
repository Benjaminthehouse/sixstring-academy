/**
 * Theory Path, unit 14: Intervals: quality, spelling and shapes. Written from the syllabus entries
 * in `src/content/plan/theory-path.json` (unit `intervals-2`), one lesson per entry, in order: each
 * lesson opens with its "on the guitar" picture, asks the planned exercises, ends with the planned
 * drills, and turns every planned fact into a review card.
 *
 * `intervals-2.test.ts` cross-checks every interval label on the neck, every inversion, every
 * compound size, every consonance category and the answer of every fretboard question against
 * the theory and guitar engines.
 *
 * Planned figures the engine cannot draw as such: "one fret labelled both D# and Eb" shows the
 * dot as D# with both names in the caption (a dot carries one name), and the "audio of harmonic
 * intervals from A2" plays one interval per sound, spread over the cards and listening questions.
 * The `semitones-match` drill only handles intervals up to the octave, so the compound sizes are
 * asked in authored questions and the drill rehearses the simple intervals they are built on.
 */
import type { FretDot, Lesson, Unit } from '@/lessons';

const U = 'intervals-2';

const dot = (string: number, fret: number, note: string, label?: string, extra: Partial<FretDot> = {}): FretDot => ({
  string, fret, note, ...(label ? { label } : {}), ...extra,
});
const root = (string: number, fret: number, note: string): FretDot => dot(string, fret, note, 'R', { role: 'root' });

// ── 1. Interval quality ───────────────────────────────────────────────────────────────────────

const intervalQuality: Lesson = {
  id: 'interval-quality',
  title: 'Interval quality: perfect to diminished',
  teaches: "An interval's full name is a quality plus a number, and only some numbers can be major and minor.",
  minutes: 4,
  skill: `theory:${U}:interval-quality`,
  steps: [
    {
      type: 'card',
      title: 'Number and quality',
      body: 'An {t:interval} has a two-part name. The **number** counts letter names: {n:C} up to {n:G} is C D E F G, five letters, so a fifth. The {t:interval-quality|quality} gives its exact size: perfect, major, minor, augmented or diminished. Together: a **perfect fifth**.',
      figure: {
        kind: 'fretboard',
        frets: [3, 10],
        dots: [root(5, 3, 'C3'), dot(5, 10, 'G3', 'P5')],
        caption: 'String 5: {n:C} at fret 3, {n:G} at fret 10. Seven half steps: {i:P5}.',
      },
    },
    {
      type: 'choice',
      prompt: 'In the name *major third*, which word is the quality?',
      options: [
        { text: 'Major', correct: true },
        { text: 'Third', why: 'Third is the number: it counts three letter names, as in C D E.' },
      ],
      shuffle: false,
      explain: '*Major* is the quality, the exact size. *Third* is the number of letter names it spans.',
      fact: 'interval-full-name',
    },
    {
      type: 'card',
      title: 'Two families',
      body: 'Seconds, thirds, sixths and sevenths come in two sizes: **major**, and **minor**, a half step smaller. Unisons, fourths, fifths and octaves have one usual size, called **perfect**. So there is a perfect fifth, but never a major fifth.',
      figure: {
        kind: 'fretboard',
        frets: [3, 10],
        dots: [root(5, 3, 'C3'), dot(5, 6, 'Eb3', 'm3'), dot(5, 7, 'E3', 'M3'), dot(5, 8, 'F3', 'P4'), dot(5, 10, 'G3', 'P5')],
        caption: 'From {n:C}: a {i:m3} and a {i:M3}, but one {i:P4} and one {i:P5}.',
      },
    },
    {
      type: 'choice',
      prompt: 'Which of these can be perfect?',
      options: [
        { text: 'A third', why: 'Thirds are major or minor, never perfect.' },
        { text: 'A fifth', correct: true },
        { text: 'A sixth', why: 'Sixths are major or minor, never perfect.' },
      ],
      shuffle: false,
      explain: 'Fifths belong to the perfect family, with unisons, fourths and octaves.',
      fact: 'interval-perfect-or-major-minor',
    },
    {
      type: 'true-false',
      statement: 'A fourth can be major.',
      answer: false,
      explain: 'Fourths are perfect, never major or minor. Make a perfect fourth a half step wider and it becomes augmented.',
      fact: 'interval-perfect-or-major-minor',
    },
    {
      type: 'card',
      title: 'Augmented and diminished',
      body: 'Keep the letters, change the size. A perfect or major interval made a half step **wider** is {t:augmented}: {n:C} to {n:G#}. A perfect or minor interval made a half step **narrower** is {t:diminished}: {n:C} to {n:Gb}. Both are still fifths: the letters still run C to G.',
      figure: {
        kind: 'fretboard',
        frets: [3, 11],
        dots: [root(5, 3, 'C3'), dot(5, 9, 'Gb3', 'd5'), dot(5, 10, 'G3', 'P5'), dot(5, 11, 'G#3', 'A5')],
        caption: 'From {n:C}: {i:d5} at fret 9, {i:P5} at fret 10, {i:A5} at fret 11.',
      },
    },
    {
      type: 'choice',
      prompt: '{n:C} to {n:G#} is a what?',
      options: [
        { text: 'Augmented fifth', correct: true },
        { text: 'Minor sixth', why: 'Same size, but {n:C} to {n:G#} uses the letters C to G: a fifth. The minor sixth above {n:C} is {n:Ab}.' },
        { text: 'Major fifth', why: 'There is no major fifth: fifths are perfect, augmented or diminished.' },
        { text: 'Diminished fifth', why: 'Diminished is narrower than perfect: {n:C} to {n:Gb}.' },
      ],
      explain: '{n:C} to {n:G} is a perfect fifth. {n:G#} makes it a half step wider with the same letters, so it is augmented.',
      fact: 'interval-augmented',
    },
    {
      type: 'fretboard-find',
      prompt: 'The dot is {n:C}, string 5 fret 3. Tap the augmented fifth above it on the same string.',
      find: { interval: 'A5', from: { string: 5, fret: 3 } },
      mode: 'one',
      octave: 'exact',
      frets: [3, 12],
      strings: [5],
      shown: [root(5, 3, 'C3')],
      explain: 'The perfect fifth is seven frets up, at fret 10. Augmented is one fret wider: fret 11, {n:G#}.',
      fact: 'interval-augmented',
    },
    {
      type: 'choice',
      prompt: '{n:E} to {n:Bb}: what is it?',
      options: [
        { text: 'Diminished fifth', correct: true },
        { text: 'Augmented fourth', why: 'Same size, but it spans five letters, E F G A B: a fifth. The augmented fourth above {n:E} is {n:A#}.' },
        { text: 'Minor fifth', why: 'Fifths are never minor: a perfect fifth made narrower is diminished.' },
        { text: 'Perfect fifth', why: 'The perfect fifth above {n:E} is {n:B}. {n:Bb} is a half step lower.' },
      ],
      explain: '{n:E} to {n:B} is a perfect fifth. {n:Bb} narrows it by a half step with the same letters, so it is a diminished fifth.',
      fact: 'interval-diminished',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each interval from {n:C} with its name.',
      pairs: [
        { left: '{n:C} to {n:G}', right: 'Perfect fifth' },
        { left: '{n:C} to {n:G#}', right: 'Augmented fifth' },
        { left: '{n:C} to {n:Gb}', right: 'Diminished fifth' },
        { left: '{n:C} to {n:Eb}', right: 'Minor third' },
      ],
      explain: 'Three fifths, all C to G in letters: perfect, a half step wider (augmented) and a half step narrower (diminished). {n:C} to {n:Eb} spans C D E: a minor third.',
    },
    { generate: 'interval-name', params: { intervals: ['P5', 'M3', 'm3', 'P4', 'M6', 'm6', 'A4', 'd5', 'A5', 'M2', 'm2', 'm7', 'M7'], roots: ['C', 'G', 'D', 'F', 'A', 'E'] } },
  ],
  facts: [
    {
      id: 'interval-full-name',
      front: "What are the two parts of an interval's full name?",
      back: 'Its quality plus its number: **major third**, **perfect fifth**. The number counts letter names; the quality gives the exact size.',
    },
    {
      id: 'interval-perfect-or-major-minor',
      front: 'Which interval numbers can be major or minor, and which can be perfect?',
      back: 'Seconds, thirds, sixths and sevenths: major or minor. Unisons, fourths, fifths and octaves: perfect, never major or minor.',
      ask: {
        type: 'choice',
        prompt: 'Which of these can be major or minor?',
        options: [
          { text: 'A sixth', correct: true },
          { text: 'A fourth', why: 'Fourths are perfect, never major or minor.' },
          { text: 'A fifth', why: 'Fifths are perfect, never major or minor.' },
          { text: 'An octave', why: 'Octaves are perfect, never major or minor.' },
        ],
        explain: 'Seconds, thirds, sixths and sevenths come as major or minor. Unisons, fourths, fifths and octaves are perfect.',
      },
    },
    {
      id: 'interval-augmented',
      front: 'What makes an interval augmented?',
      back: 'A major or perfect interval made a half step wider, keeping its letters: {n:C} to {n:G#} is an augmented fifth.',
    },
    {
      id: 'interval-diminished',
      front: 'What makes an interval diminished?',
      back: 'A minor or perfect interval made a half step narrower, keeping its letters: {n:C} to {n:Gb} is a diminished fifth.',
    },
  ],
};

// ── 2. The spelling decides the name ──────────────────────────────────────────────────────────

const spellingCounts: Lesson = {
  id: 'spelling-counts',
  title: 'The spelling decides the name',
  teaches: 'Two intervals can sound the same yet have different names, because the number comes from the letters.',
  minutes: 3,
  skill: `theory:${U}:spelling-counts`,
  steps: [
    {
      type: 'card',
      title: 'Count the letters first',
      body: "An interval's number comes from the **letters**, not the frets. {n:C} to {n:D#} spans two letters, C D: a second. {n:C} to {n:Eb} spans three, C D E: a third. Both are three half steps, the very same fret, yet one is an augmented second and the other a minor third.",
      figure: {
        kind: 'fretboard',
        frets: [3, 6],
        dots: [root(5, 3, 'C3'), dot(5, 6, 'D#3')],
        caption: 'Fret 6 is {n:D#} and also {n:Eb}: one sound, two names.',
      },
    },
    {
      type: 'choice',
      prompt: 'How many letter names does {n:C} to {n:D#} span?',
      options: [
        { text: 'Two, C and D: a second', correct: true },
        { text: 'Three, C D E: a third', why: '{n:D#} is a kind of D, so the letters are just C and D. {n:C} to {n:Eb} would be a third.' },
      ],
      shuffle: false,
      explain: '{n:D#} is a D with a sharp, so {n:C} to {n:D#} spans C and D: a second. Three half steps make it an augmented second.',
      fact: 'interval-c-d-sharp-e-flat',
    },
    {
      type: 'choice',
      prompt: '{n:E} to {n:G#}: major third or diminished fourth?',
      options: [
        { text: 'Major third', correct: true },
        { text: 'Diminished fourth', why: '{n:E} to {n:G#} spans three letters, E F G: a third. A diminished fourth needs an A: {n:E} to {n:Ab}.' },
      ],
      shuffle: false,
      explain: 'Three letters, E F G, make a third, and four half steps make it major.',
    },
    {
      type: 'card',
      title: 'Enharmonic intervals',
      body: 'Intervals that sound the same but are spelled differently are {t:enharmonic-interval|enharmonic intervals}: {i:A2} and {i:m3}, {i:M3} and {i:d4}, {i:A4} and {i:d5}. On the guitar they are the same frets. Which name is right depends on the notes the music needs.',
    },
    {
      type: 'true-false',
      statement: '{i:A4} and {i:d5} are enharmonic intervals: the same size, spelled differently.',
      answer: true,
      explain: 'Both are six half steps, the tritone. {n:C} to {n:F#} is an augmented fourth; {n:C} to {n:Gb} is a diminished fifth.',
      fact: 'interval-enharmonic',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each pair of notes with its interval.',
      pairs: [
        { left: '{n:C} to {n:D#}', right: 'Augmented second' },
        { left: '{n:C} to {n:Eb}', right: 'Minor third' },
        { left: '{n:E} to {n:G#}', right: 'Major third' },
        { left: '{n:E} to {n:Ab}', right: 'Diminished fourth' },
      ],
      explain: 'Count the letters for the number: C D is a second, C D E a third, E F G a third, E F G A a fourth. The size then gives the quality.',
      fact: 'interval-c-d-sharp-e-flat',
    },
    {
      type: 'card',
      title: 'Spell by the number',
      body: 'To find the major third above {n:B}, count three letters first: B C D. So the answer is some kind of {n:D}. Four half steps above {n:B} is the sound of {n:D#}, so it is {n:D#}, never {n:Eb}: {n:B} to {n:Eb} spans four letters, a fourth.',
      figure: {
        kind: 'fretboard',
        frets: [2, 6],
        dots: [root(5, 2, 'B2'), dot(5, 6, 'D#3')],
        caption: '{n:B} up to {n:D#}: four half steps, three letters.',
      },
    },
    {
      type: 'type-answer',
      prompt: 'Type the note a major third above {n:B}.',
      answer: { kind: 'note', value: 'D#', spelling: 'exact' },
      input: 'keypad',
      explain: 'Three letters, B C D, so a kind of {n:D}; four half steps up is {n:D#}. {n:Eb} sounds the same but would make a diminished fourth.',
      fact: 'interval-spell-by-number',
    },
    {
      type: 'type-answer',
      prompt: 'Type the note a minor third above {n:F#}.',
      answer: { kind: 'note', value: 'A', spelling: 'exact' },
      input: 'keypad',
      explain: 'Three letters, F G A, so a kind of {n:A}; three half steps above {n:F#} is plain {n:A}.',
      fact: 'interval-spell-by-number',
    },
    { generate: 'interval-note', params: { intervals: ['M3', 'm3', 'P5', 'P4', 'M6', 'm6', 'M2', 'm7'], roots: ['B', 'E', 'A', 'F#', 'D', 'Bb', 'Eb', 'C#'] } },
    { generate: 'interval-name', params: { intervals: ['M3', 'm3', 'A2', 'd4', 'A4', 'd5', 'P4', 'P5', 'A5', 'm6'], roots: ['C', 'G', 'D', 'F', 'E', 'A'] } },
  ],
  facts: [
    {
      id: 'interval-c-d-sharp-e-flat',
      front: 'Name {n:C} to {n:D#} and {n:C} to {n:Eb}. Why do the names differ?',
      back: '{n:C} to {n:D#} is an augmented second (two letters, C D); {n:C} to {n:Eb} is a minor third (three letters, C D E). Both are three half steps.',
    },
    { id: 'interval-enharmonic', front: 'What are enharmonic intervals?', back: 'Intervals that sound the same but are spelled differently, such as {i:A4} and {i:d5}.' },
    {
      id: 'interval-spell-by-number',
      front: 'Is the major third above {n:B} spelled {n:D#} or {n:Eb}?',
      back: '{n:D#}. Count the letters first: B C D makes a third. {n:B} to {n:Eb} would be a diminished fourth.',
      ask: {
        type: 'type-answer',
        prompt: 'Type the note a major third above {n:F#}.',
        answer: { kind: 'note', value: 'A#', spelling: 'exact' },
        input: 'keypad',
        explain: 'Three letters, F G A, so a kind of {n:A}; four half steps above {n:F#} is {n:A#}, not {n:Bb}.',
      },
    },
  ],
};

// ── 3. Turning intervals upside down ──────────────────────────────────────────────────────────

const intervalInversions: Lesson = {
  id: 'interval-inversions',
  title: 'Turning intervals upside down',
  teaches: 'Inverting an interval moves one note an octave; the pair adds up to nine, qualities swapped.',
  minutes: 3,
  skill: `theory:${U}:interval-inversions`,
  steps: [
    {
      type: 'card',
      title: 'Flip it over',
      body: 'To {t:interval-inversion|invert} an interval, move its lower note up an octave, above the other. {n:C} up to {n:E} is a major third. Lift the {n:C} an octave and you have {n:E} up to {n:C}: a minor sixth. Same two letter names, new distance.',
      figure: {
        kind: 'fretboard',
        frets: [0, 6],
        dots: [dot(5, 3, 'C3', undefined, { role: 'root' }), dot(4, 2, 'E3'), dot(3, 5, 'C4', undefined, { role: 'root' })],
        caption: '{n:C} up to {n:E}: {i:M3}. {n:E} up to the next {n:C}: {i:m6}.',
      },
    },
    {
      type: 'choice',
      prompt: 'How do you invert {n:G} up to {n:B}?',
      options: [
        { text: 'Move the {n:G} up an octave', correct: true },
        { text: 'Move the {n:B} up an octave', why: 'That makes the interval wider, a tenth. To invert, the lower note goes up, or the upper note down.' },
        { text: 'Move both notes up an octave', why: 'Moving both keeps the same interval, just higher.' },
      ],
      explain: 'Lift the lower note, {n:G}, above the {n:B}: {n:B} up to {n:G} is the inversion. Moving the {n:B} down an octave does the same.',
      fact: 'interval-inversion-meaning',
    },
    {
      type: 'card',
      title: 'Nine, and swap',
      body: 'An interval and its inversion always add up to **nine**: a third becomes a sixth (3 + 6), a second a seventh, a fourth a fifth. The quality flips too: major turns minor and minor turns major, augmented turns diminished, and perfect stays perfect.',
      figure: { kind: 'audio', sound: { kind: 'notes', notes: ['C3', 'E3', 'E3', 'C4'], tempo: 60 }, label: 'Third, then its inversion' },
    },
    {
      type: 'choice',
      prompt: 'What is the inversion of a major second?',
      options: [
        { text: 'Minor seventh', correct: true },
        { text: 'Major seventh', why: 'The number is right, 2 + 7 = 9, but major turns into minor.' },
        { text: 'Minor second', why: 'Inverting changes the number: a second becomes a seventh.' },
        { text: 'Minor sixth', why: '2 + 6 is 8, not 9: a second inverts to a seventh.' },
      ],
      explain: '2 + 7 = 9, so a seventh, and major turns minor: a minor seventh. {n:C} up to {n:D} inverts to {n:D} up to {n:C}.',
      fact: 'interval-inversion-qualities',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each interval with its inversion.',
      pairs: [
        { left: '{i:M3}', right: '{i:m6}' },
        { left: '{i:P4}', right: '{i:P5}' },
        { left: '{i:m2}', right: '{i:M7}' },
        { left: '{i:A4}', right: '{i:d5}' },
      ],
      explain: 'Each pair adds up to nine with the quality flipped: major and minor swap, augmented and diminished swap, perfect stays perfect.',
      fact: 'interval-inversion-nine',
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the rule.',
      text: 'A perfect fifth inverts to a perfect ___.',
      blanks: ['fourth'],
      bank: ['fifth', 'sixth', 'third'],
      explain: '5 + 4 = 9, and perfect stays perfect: a perfect fourth. {n:C} up to {n:G} inverts to {n:G} up to {n:C}.',
      fact: 'interval-inversion-nine',
    },
    {
      type: 'true-false',
      statement: 'Inverting a perfect interval always gives another perfect interval.',
      answer: true,
      explain: 'Fourths and fifths swap, and so do unisons and octaves, all staying perfect: {i:P4} inverts to {i:P5}.',
      fact: 'interval-inversion-qualities',
    },
    {
      type: 'choice',
      prompt: '{n:C} up to {n:E} is a major third. What is {n:E} up to {n:C}?',
      options: [
        { text: 'Minor sixth', correct: true },
        { text: 'Major sixth', why: 'The number is right, but major turns into minor.' },
        { text: 'Minor third', why: 'Inverting changes the number: 3 + 6 = 9, so a sixth.' },
      ],
      explain: '3 + 6 = 9 and major turns minor: {n:E} up to {n:C} is a minor sixth, eight half steps.',
      fact: 'interval-inversion-c-e',
    },
    {
      type: 'fretboard-find',
      prompt: 'The dot is {n:E}, string 4 fret 2. Tap a {n:C} above it: the minor sixth.',
      find: { interval: 'm6', from: { string: 4, fret: 2 } },
      mode: 'one',
      octave: 'exact',
      frets: [0, 6],
      shown: [root(4, 2, 'E3')],
      explain: 'Eight half steps above {n:E} is {n:C}: string 3 at fret 5, or string 2 at fret 1.',
      fact: 'interval-inversion-c-e',
    },
    { generate: 'interval-name', params: { intervals: ['m6', 'M6', 'm7', 'M7', 'P5', 'P4', 'M3', 'm3', 'd5', 'A4'] } },
  ],
  facts: [
    {
      id: 'interval-inversion-meaning',
      front: 'How do you invert an interval?',
      back: 'Move its lower note up an octave, or its upper note down an octave, so the two notes swap places.',
    },
    {
      id: 'interval-inversion-nine',
      front: 'An interval and its inversion: what do their numbers add up to?',
      back: 'Nine. A third inverts to a sixth, a second to a seventh, a fourth to a fifth.',
      ask: {
        type: 'fill-blanks',
        prompt: 'Complete the rule.',
        text: 'A third inverts to a ___.',
        blanks: ['sixth'],
        bank: ['fifth', 'seventh', 'second'],
        explain: 'An interval and its inversion add up to nine: 3 + 6 = 9.',
      },
    },
    { id: 'interval-inversion-qualities', front: 'What happens to the quality when you invert an interval?', back: 'Major and minor swap, augmented and diminished swap, and perfect stays perfect.' },
    { id: 'interval-inversion-c-e', front: '{n:C} up to {n:E} is a major third. What is {n:E} up to {n:C}?', back: 'A minor sixth: 3 + 6 = 9, and major turns minor.' },
  ],
};

// ── 4. Interval shapes on neighbouring strings ────────────────────────────────────────────────

const adjacentStringShapes: Lesson = {
  id: 'adjacent-string-shapes',
  title: 'Interval shapes on neighbouring strings',
  teaches: 'On neighbouring strings (not G-B) the same fret is a fourth; each fret either way changes it a half step.',
  minutes: 4,
  skill: `theory:${U}:adjacent-string-shapes`,
  steps: [
    {
      type: 'card',
      title: 'Five shapes from one root',
      body: 'Put a root on string 6 and look at string 5. The **same fret** is a perfect fourth. One fret **higher** is the tritone, two frets higher a perfect fifth. One fret **lower** is a major third, two frets lower a minor third. Each fret is one half step.',
      figure: {
        kind: 'fretboard',
        frets: [2, 8],
        dots: [root(6, 5, 'A2'), dot(5, 3, 'C3', 'm3'), dot(5, 4, 'C#3', 'M3'), dot(5, 5, 'D3', 'P4'), dot(5, 6, 'D#3', 'A4'), dot(5, 7, 'E3', 'P5')],
        caption: 'From {n:A} (R) on string 6: {i:m3} {i:M3} {i:P4} {i:A4} {i:P5} on string 5.',
      },
      tip: 'The same shapes work on strings 5 and 4, and 4 and 3. Strings 3 and 2 need one change, two lessons from now.',
    },
    {
      type: 'choice',
      prompt: 'On neighbouring strings (not G and B), what is the same fret?',
      options: [
        { text: 'A perfect fourth', correct: true },
        { text: 'A perfect fifth', why: 'The fifth is two frets higher on the thinner string.' },
        { text: 'A major third', why: 'The major third is one fret lower on the thinner string.' },
      ],
      explain: 'Neighbouring strings (except G and B) are tuned a perfect fourth apart, so the same fret on the thinner string is a fourth higher.',
      fact: 'interval-shape-same-fret',
    },
    {
      type: 'fretboard-find',
      prompt: 'The dot is {n:G}, string 6 fret 3. Tap the perfect fifth above it on string 5.',
      find: { interval: 'P5', from: { string: 6, fret: 3 } },
      mode: 'one',
      octave: 'exact',
      frets: [1, 7],
      strings: [5],
      shown: [root(6, 3, 'G2')],
      explain: 'Two frets higher on the next string: string 5, fret 5, {n:D}. Root and fifth together are the power-chord shape.',
      fact: 'interval-shape-higher',
    },
    {
      type: 'fretboard-name',
      prompt: 'The root (R) is string 5, fret 7. What interval is the other dot above it?',
      position: { string: 4, fret: 6 },
      root: { string: 5, fret: 7 },
      ask: 'interval',
      spelling: 'any',
      options: ['M3', 'm3', 'P4', 'A4'],
      explain: 'String 5 fret 7 is {n:E}; string 4 fret 6 is {n:G#}. One fret lower on the next string is a major third: four half steps.',
      fact: 'interval-shape-lower',
    },
    {
      type: 'fretboard-find',
      prompt: 'The dot is {n:D}, string 5 fret 5. Tap the minor third above it on string 4.',
      find: { interval: 'm3', from: { string: 5, fret: 5 } },
      mode: 'one',
      octave: 'exact',
      frets: [1, 7],
      strings: [4],
      shown: [root(5, 5, 'D3')],
      explain: 'Two frets lower on the next string: string 4, fret 3, {n:F}. Three half steps above {n:D}.',
      fact: 'interval-shape-lower',
    },
    {
      type: 'true-false',
      statement: 'From a root on string 6, string 5 one fret higher is a tritone.',
      answer: true,
      explain: 'The same fret is a fourth, five half steps; one fret more makes six, the tritone: {n:A} to {n:D#}.',
      fact: 'interval-shape-higher',
    },
    {
      type: 'play-phrase',
      prompt: 'Play {n:A} on string 6 fret 5, then its major third, {n:C#}, on string 5 fret 4.',
      notes: [{ string: 6, fret: 5, duration: 'h' }, { string: 5, fret: 4, duration: 'h' }],
      octave: 'exact',
      tempo: 70,
      explain: 'One fret lower on the next string is the major third. Play the two together and you hear the bright start of an {c:A} chord.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'The dot is {n:A}, string 6 fret 5. Tap the major third above it on string 5.',
        find: { interval: 'M3', from: { string: 6, fret: 5 } },
        mode: 'one',
        octave: 'exact',
        frets: [2, 8],
        strings: [5],
        shown: [root(6, 5, 'A2')],
        explain: 'One fret lower on the next string: string 5, fret 4, {n:C#}.',
      },
    },
    {
      type: 'match-pairs',
      prompt: 'Root on the thicker string: match each shape with its interval.',
      pairs: [
        { left: 'Two frets lower', right: 'Minor third' },
        { left: 'One fret lower', right: 'Major third' },
        { left: 'Same fret', right: 'Perfect fourth' },
        { left: 'Two frets higher', right: 'Perfect fifth' },
      ],
      explain: 'The same fret is a fourth, and each fret is a half step: one lower a major third, two lower a minor third, two higher a fifth.',
    },
    { generate: 'interval-on-neck', params: { intervals: ['P5', 'P4', 'M3', 'm3', 'A4'], ask: 'find', strings: [6, 5], frets: [1, 8] } },
    { generate: 'interval-on-neck', params: { intervals: ['P5', 'P4', 'M3', 'm3', 'A4'], ask: 'name', strings: [6, 5], frets: [1, 8] } },
  ],
  facts: [
    {
      id: 'interval-shape-same-fret',
      front: 'On neighbouring strings (not G and B), what interval is the same fret?',
      back: "A perfect fourth: the thinner string's note is five half steps higher.",
    },
    {
      id: 'interval-shape-higher',
      front: 'Root on one string: what are one and two frets higher on the next thinner string?',
      back: 'One fret higher is the tritone; two frets higher is the perfect fifth. (Not across strings 3 and 2.)',
    },
    {
      id: 'interval-shape-lower',
      front: 'Root on one string: what are one and two frets lower on the next thinner string?',
      back: 'One fret lower is a major third; two frets lower a minor third. (Not across strings 3 and 2.)',
      ask: {
        type: 'fretboard-find',
        prompt: 'The dot is {n:A}, string 6 fret 5. Tap the minor third above it on string 5.',
        find: { interval: 'm3', from: { string: 6, fret: 5 } },
        mode: 'one',
        octave: 'exact',
        frets: [1, 8],
        strings: [5],
        shown: [root(6, 5, 'A2')],
        explain: 'Two frets lower on the next string: string 5, fret 3, {n:C}.',
      },
    },
  ],
};

// ── 5. Sixths, sevenths and octaves across a string ───────────────────────────────────────────

const skipAStringShapes: Lesson = {
  id: 'skip-a-string-shapes',
  title: 'Sixths, sevenths, octaves over a string',
  teaches: 'Skipping a string (not across G-B), two frets higher is an octave; each fret lower is a half step smaller.',
  minutes: 3,
  skill: `theory:${U}:skip-a-string-shapes`,
  steps: [
    {
      type: 'card',
      title: 'Across one string',
      body: 'Now skip a string: root on string 6, note on string 4. **Two frets higher** is the octave, the shape you know. Shrink it fret by fret: one fret higher is a major seventh, the same fret a minor seventh, one fret lower a major sixth, two frets lower a minor sixth.',
      figure: {
        kind: 'fretboard',
        frets: [0, 6],
        dots: [root(6, 3, 'G2'), dot(4, 1, 'Eb3', 'm6'), dot(4, 2, 'E3', 'M6'), dot(4, 3, 'F3', 'm7'), dot(4, 4, 'F#3', 'M7'), dot(4, 5, 'G3', 'P8')],
        caption: 'From {n:G} (R) on string 6: {i:m6} {i:M6} {i:m7} {i:M7} {i:P8} on string 4.',
      },
      tip: 'Use it from string 6 to 4 and from 5 to 3. A shape that crosses strings 3 and 2 needs one more fret: that is the next lesson.',
    },
    {
      type: 'fretboard-find',
      prompt: 'The dot is {n:C}, string 5 fret 3. Tap the minor seventh above it on string 3.',
      find: { interval: 'm7', from: { string: 5, fret: 3 } },
      mode: 'one',
      octave: 'exact',
      frets: [1, 7],
      strings: [3],
      shown: [root(5, 3, 'C3')],
      explain: 'The same fret, one string skipped: string 3, fret 3, {n:Bb}. Ten half steps above {n:C}.',
      fact: 'interval-skip-sevenths',
    },
    {
      type: 'fretboard-name',
      prompt: 'The root (R) is string 6, fret 5. What interval is the other dot above it?',
      position: { string: 4, fret: 4 },
      root: { string: 6, fret: 5 },
      ask: 'interval',
      spelling: 'any',
      options: ['M6', 'm6', 'm7', 'P5'],
      explain: 'String 6 fret 5 is {n:A}; string 4 fret 4 is {n:F#}. One fret lower across a string is a major sixth: nine half steps.',
      fact: 'interval-skip-sixths',
    },
    {
      type: 'true-false',
      statement: 'From string 6 to string 4, one fret higher is an octave.',
      answer: false,
      explain: 'The octave is two frets higher. One fret higher is a major seventh, a half step short of it.',
      fact: 'interval-skip-octave',
    },
    {
      type: 'choice',
      prompt: 'Root on string 5. Which fret of string 3 is its octave?',
      options: [
        { text: 'Two frets higher', correct: true },
        { text: 'One fret higher', why: 'That is a major seventh, a half step short.' },
        { text: 'The same fret', why: 'That is a minor seventh.' },
        { text: 'Two frets lower', why: 'That is a minor sixth.' },
      ],
      shuffle: false,
      explain: 'Strings 5 and 3 work like strings 6 and 4: the octave is two frets higher. {n:C} at string 5 fret 3 has its octave at string 3 fret 5.',
      fact: 'interval-skip-octave',
    },
    {
      type: 'play-phrase',
      prompt: 'Play {n:C} on string 5 fret 3, then its octave on string 3 fret 5.',
      notes: [{ string: 5, fret: 3, duration: 'h' }, { string: 3, fret: 5, duration: 'h' }],
      octave: 'exact',
      tempo: 70,
      explain: 'One string skipped, two frets higher: the octave shape. To play both at once, rest a finger lightly on string 4 so it stays silent.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'The dot is {n:C}, string 5 fret 3. Tap its octave on string 3.',
        find: { interval: 'P8', from: { string: 5, fret: 3 } },
        mode: 'one',
        octave: 'exact',
        frets: [1, 7],
        strings: [3],
        shown: [root(5, 3, 'C3')],
        explain: 'Two frets higher, one string skipped: string 3, fret 5.',
      },
    },
    {
      type: 'match-pairs',
      prompt: 'Root on string 6, note on string 4: match each shape with its interval.',
      pairs: [
        { left: 'Two frets lower', right: 'Minor sixth' },
        { left: 'One fret lower', right: 'Major sixth' },
        { left: 'Same fret', right: 'Minor seventh' },
        { left: 'One fret higher', right: 'Major seventh' },
        { left: 'Two frets higher', right: 'Octave' },
      ],
      explain: 'Two frets higher is the octave, and each fret lower takes off a half step: major seventh, minor seventh, major sixth, minor sixth.',
    },
    { generate: 'interval-on-neck', params: { intervals: ['P8', 'm7', 'M7', 'M6', 'm6'], ask: 'find', strings: [6, 5], frets: [1, 8] } },
  ],
  facts: [
    { id: 'interval-skip-octave', front: 'With one string between (6 to 4, or 5 to 3), where is the octave?', back: 'Two frets higher.' },
    { id: 'interval-skip-sevenths', front: 'With one string between, where are the major and minor sevenths?', back: 'One fret higher is a major seventh; the same fret is a minor seventh.' },
    {
      id: 'interval-skip-sixths',
      front: 'With one string between, where are the major and minor sixths?',
      back: 'One fret lower is a major sixth; two frets lower is a minor sixth.',
      ask: {
        type: 'fretboard-name',
        prompt: 'The root (R) is string 5, fret 3. What interval is the other dot above it?',
        position: { string: 3, fret: 1 },
        root: { string: 5, fret: 3 },
        ask: 'interval',
        spelling: 'any',
        options: ['m6', 'M6', 'P5', 'm7'],
        explain: 'Two frets lower, one string skipped: a minor sixth, eight half steps above {n:C}.',
      },
    },
  ],
};

// ── 6. The B-string shift ─────────────────────────────────────────────────────────────────────

const theBStringShift: Lesson = {
  id: 'the-b-string-shift',
  title: 'The B-string shift',
  teaches: 'Any interval shape that crosses from string 3 to string 2 needs one extra fret on string 2.',
  minutes: 3,
  skill: `theory:${U}:the-b-string-shift`,
  steps: [
    {
      type: 'card',
      title: 'One pair is different',
      body: 'Strings 3 and 2, {n:G} and {n:B}, are tuned a major third apart, not a fourth. So any shape that crosses from string 3 to string 2 needs **one extra fret** on string 2. From {n:A} on string 3 fret 2, the perfect fourth is {n:D} at string 2 fret 3, and the fifth {n:E} at fret 5.',
      figure: {
        kind: 'fretboard',
        frets: [0, 6],
        dots: [
          root(5, 2, 'B2'), dot(4, 2, 'E3', 'P4'), dot(4, 4, 'F#3', 'P5'),
          root(3, 2, 'A3'), dot(2, 3, 'D4', 'P4', { role: 'target' }), dot(2, 5, 'E4', 'P5', { role: 'target' }),
        ],
        caption: 'Strings 5 and 4: {i:P4} at the same fret. Strings 3 and 2: one fret higher.',
      },
    },
    {
      type: 'choice',
      prompt: 'Strings 3 and 2 at the same fret make which interval?',
      options: [
        { text: 'A major third', correct: true },
        { text: 'A perfect fourth', why: 'That is every other pair of neighbours. {n:G} to {n:B} is a half step less.' },
        { text: 'A minor third', why: '{n:G} to {n:B} is four half steps: a major third.' },
      ],
      explain: 'Open {n:G} and open {n:B} are four half steps apart, so the same fret on strings 3 and 2 is a major third, a half step less than a fourth.',
      fact: 'interval-b-string-same-fret',
    },
    {
      type: 'fretboard-find',
      prompt: 'The dot is {n:C}, string 3 fret 5. Tap the perfect fifth above it on string 2.',
      find: { interval: 'P5', from: { string: 3, fret: 5 } },
      mode: 'one',
      octave: 'exact',
      frets: [3, 9],
      strings: [2],
      shown: [root(3, 5, 'C4')],
      explain: 'On other pairs the fifth is two frets higher; across {n:G} and {n:B}, three: string 2, fret 8, {n:G}.',
      fact: 'interval-b-string-shift',
    },
    {
      type: 'fretboard-find',
      prompt: 'The dot is {n:G}, string 4 fret 5. Tap the octave above it on string 2.',
      find: { interval: 'P8', from: { string: 4, fret: 5 } },
      mode: 'one',
      octave: 'exact',
      frets: [3, 10],
      strings: [2],
      shown: [root(4, 5, 'G3')],
      explain: 'Skipping string 3, the octave is three frets higher, not two: the shape lands on the B string, so it gains a fret. String 2, fret 8.',
      fact: 'interval-b-string-shift',
    },
    {
      type: 'true-false',
      statement: 'From {n:A} on string 3 fret 2, the perfect fourth is on string 2 at fret 2.',
      answer: false,
      explain: 'String 2 at fret 2 is {n:C#}, a major third above {n:A}. The fourth, {n:D}, is one fret higher: string 2, fret 3.',
      fact: 'interval-b-string-a-example',
    },
    {
      type: 'fretboard-name',
      prompt: 'The root (R) is string 3, fret 2. What interval is the other dot above it?',
      position: { string: 2, fret: 5 },
      root: { string: 3, fret: 2 },
      ask: 'interval',
      spelling: 'any',
      options: ['P5', 'A4', 'M3', 'm6'],
      explain: 'String 3 fret 2 is {n:A}; string 2 fret 5 is {n:E}: seven half steps, a perfect fifth. Three frets higher across {n:G} and {n:B}, not two.',
      fact: 'interval-b-string-a-example',
    },
    {
      type: 'play-phrase',
      prompt: 'Play {n:A} on string 3 fret 2, then its fourth, {n:D}, on string 2 fret 3.',
      notes: [{ string: 3, fret: 2, duration: 'h' }, { string: 2, fret: 3, duration: 'h' }],
      octave: 'exact',
      tempo: 70,
      explain: 'Across {n:G} and {n:B} the fourth is one fret higher, not at the same fret. Play them together: it is the open, hollow sound of a fourth.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'The dot is {n:A}, string 3 fret 2. Tap the perfect fourth above it on string 2.',
        find: { interval: 'P4', from: { string: 3, fret: 2 } },
        mode: 'one',
        octave: 'exact',
        frets: [0, 6],
        strings: [2],
        shown: [root(3, 2, 'A3')],
        explain: 'One fret higher across {n:G} and {n:B}: string 2, fret 3, {n:D}.',
      },
    },
    {
      type: 'choice',
      prompt: 'On strings 4 and 3 the fifth is two frets higher. Moved to strings 3 and 2, where is it?',
      options: [
        { text: 'Three frets higher', correct: true },
        { text: 'Two frets higher', why: 'That works on the other pairs. On strings 3 and 2 it gives a tritone.' },
        { text: 'One fret higher', why: 'On strings 3 and 2, one fret higher is the perfect fourth.' },
      ],
      shuffle: false,
      explain: 'Add one fret whenever a shape crosses from string 3 to string 2: two frets higher becomes three.',
      fact: 'interval-b-string-shift',
    },
    { generate: 'interval-on-neck', params: { intervals: ['P4', 'P5', 'M3', 'P8'], ask: 'find', strings: [4, 3], frets: [2, 9] } },
  ],
  facts: [
    {
      id: 'interval-b-string-shift',
      front: 'What changes when an interval shape crosses from string 3 to string 2?',
      back: 'The note on string 2 moves one fret higher than on the other string pairs.',
    },
    {
      id: 'interval-b-string-same-fret',
      front: 'What interval is the same fret on strings 3 and 2?',
      back: 'A major third, not a perfect fourth: open {n:G} and {n:B} are four half steps apart.',
    },
    {
      id: 'interval-b-string-a-example',
      front: 'From {n:A} on string 3 fret 2, where are the perfect fourth and fifth on string 2?',
      back: 'The fourth, {n:D}, at fret 3; the fifth, {n:E}, at fret 5.',
      ask: {
        type: 'fretboard-find',
        prompt: 'The dot is {n:A}, string 3 fret 2. Tap the perfect fifth above it on string 2.',
        find: { interval: 'P5', from: { string: 3, fret: 2 } },
        mode: 'one',
        octave: 'exact',
        frets: [0, 7],
        strings: [2],
        shown: [root(3, 2, 'A3')],
        explain: 'Three frets higher across {n:G} and {n:B}: string 2, fret 5, {n:E}.',
      },
    },
  ],
};

// ── 7. Ninths, elevenths and thirteenths ──────────────────────────────────────────────────────

const compoundIntervals: Lesson = {
  id: 'compound-intervals',
  title: 'Ninths, elevenths and thirteenths',
  teaches: "Intervals larger than an octave are compound intervals, named by adding 7 to the simple interval's number.",
  minutes: 3,
  skill: `theory:${U}:compound-intervals`,
  steps: [
    {
      type: 'card',
      title: 'Past the octave',
      body: 'An interval wider than an octave is a {t:compound-interval}. Name it by adding **7** to the simple interval: a second plus an octave is a **ninth**, a fourth plus an octave an **eleventh**, a sixth plus an octave a **thirteenth**. Count letters to check: C D E F G A B C D is nine.',
      figure: {
        kind: 'fretboard',
        frets: [0, 6],
        dots: [root(5, 3, 'C3'), dot(2, 3, 'D4', 'M9'), dot(1, 1, 'F4', 'P11'), dot(1, 5, 'A4', 'M13')],
        caption: 'From {n:C} (R): {n:D} is a {i:M9}, {n:F} a {i:P11}, {n:A} a {i:M13}.',
      },
    },
    {
      type: 'choice',
      prompt: 'A ninth is an octave plus which interval?',
      options: [
        { text: 'A second', correct: true },
        { text: 'A third', why: '3 + 7 = 10: a third plus an octave is a tenth.' },
        { text: 'A fourth', why: 'A fourth plus an octave is an eleventh.' },
      ],
      shuffle: false,
      explain: '2 + 7 = 9: a second plus an octave. {n:C} up to the {n:D} in the next octave is a ninth.',
      fact: 'interval-compound-add-seven',
    },
    {
      type: 'card',
      title: 'Add 12 half steps',
      body: 'The octave adds 12 half steps and keeps the quality. A major second is 2 half steps, so a major ninth is 14. A perfect fourth, 5, becomes a perfect eleventh, 17. A major sixth, 9, becomes a major thirteenth, 21.',
      figure: { kind: 'audio', sound: { kind: 'interval', from: 'C3', interval: 'M9', play: 'together' }, label: 'Hear a major ninth' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each interval with its size.',
      pairs: [
        { left: '{i:P8}', right: '12 half steps' },
        { left: '{i:M9}', right: '14 half steps' },
        { left: '{i:P11}', right: '17 half steps' },
        { left: '{i:M13}', right: '21 half steps' },
      ],
      explain: 'Add 12 to the simple interval: {i:M2} is 2, so {i:M9} is 14; {i:P4} is 5, so {i:P11} is 17; {i:M6} is 9, so {i:M13} is 21.',
      fact: 'interval-compound-sizes',
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the rule.',
      text: 'An eleventh is a ___ plus an octave.',
      blanks: ['fourth'],
      bank: ['third', 'fifth', 'sixth'],
      explain: '11 − 7 = 4: a fourth plus an octave, like {n:C} on string 5 up to {n:F} on string 1.',
      fact: 'interval-compound-add-seven',
    },
    {
      type: 'true-false',
      statement: 'Any interval wider than an octave is called a compound interval.',
      answer: true,
      explain: 'Intervals up to the octave are simple; anything wider is compound: ninths, tenths, elevenths and so on.',
      fact: 'interval-compound-meaning',
    },
    {
      type: 'fretboard-find',
      prompt: 'The dot is {n:C}, string 5 fret 3. Tap the major ninth above it.',
      find: { interval: 'M9', from: { string: 5, fret: 3 } },
      mode: 'one',
      octave: 'exact',
      frets: [0, 5],
      shown: [root(5, 3, 'C3')],
      explain: 'Fourteen half steps above {n:C} is the {n:D} in the next octave: string 2, fret 3. That {n:D} is the 9 of a {c:Cadd9} chord.',
      fact: 'interval-compound-sizes',
    },
    {
      type: 'choice',
      prompt: 'Which note is a major thirteenth above {n:C}?',
      options: [
        { text: '{n:A}', correct: true },
        { text: '{n:B}', why: '{n:B} is the seventh above {n:C}. A thirteenth is a sixth plus an octave.' },
        { text: '{n:F}', why: '{n:F} is the eleventh: a fourth plus an octave.' },
        { text: '{n:D}', why: '{n:D} is the ninth: a second plus an octave.' },
      ],
      explain: '13 − 7 = 6: a thirteenth is a sixth plus an octave. The major sixth above {n:C} is {n:A}, so the major thirteenth is the {n:A} an octave higher.',
    },
    { generate: 'semitones-match', params: { intervals: ['M2', 'P4', 'M6', 'm3', 'M3', 'P5', 'm7'], pairs: 4 } },
  ],
  facts: [
    { id: 'interval-compound-meaning', front: 'What is a compound interval?', back: 'An interval larger than an octave, such as a ninth.' },
    {
      id: 'interval-compound-add-seven',
      front: 'How do you name an interval one octave wider than a simple one?',
      back: 'Add 7 to its number: a second becomes a ninth, a fourth an eleventh, a sixth a thirteenth.',
      ask: {
        type: 'choice',
        prompt: 'A thirteenth is an octave plus which interval?',
        options: [
          { text: 'A sixth', correct: true },
          { text: 'A fifth', why: '5 + 7 = 12: a fifth plus an octave is a twelfth.' },
          { text: 'A seventh', why: '7 + 7 = 14: a seventh plus an octave is a fourteenth.' },
        ],
        shuffle: false,
        explain: '13 − 7 = 6: a thirteenth is a sixth plus an octave.',
      },
    },
    { id: 'interval-compound-sizes', front: 'How many half steps are a major ninth, a perfect eleventh and a major thirteenth?', back: '14, 17 and 21: the simple interval plus 12.' },
  ],
};

// ── 8. Stable and tense ───────────────────────────────────────────────────────────────────────

const consonanceAndDissonance: Lesson = {
  id: 'consonance-and-dissonance',
  title: 'Stable and tense',
  teaches: 'Consonant intervals sound stable and dissonant ones sound tense and want to move.',
  minutes: 3,
  skill: `theory:${U}:consonance-and-dissonance`,
  steps: [
    {
      type: 'card',
      title: 'Rest or pull',
      body: 'Play two notes together. Some blend and sit still: a {t:consonance}. Others rub and seem to want to move: a {t:dissonance}. Dissonance is not wrong. It is tension, and music uses it to build a pull that a consonance then relaxes.',
      figure: {
        kind: 'fretboard',
        frets: [0, 4],
        dots: [
          root(5, 0, 'A2'), dot(5, 4, 'C#3', 'M3'), dot(4, 2, 'E3', 'P5'), dot(4, 4, 'F#3', 'M6'), dot(3, 2, 'A3', 'P8'),
          dot(5, 1, 'Bb2', 'm2', { role: 'target' }), dot(4, 1, 'D#3', 'A4', { role: 'target' }), dot(3, 1, 'G#3', 'M7', { role: 'target' }),
        ],
        caption: 'From open {n:A}: {i:P8} {i:P5} {i:M3} {i:M6} rest; {i:m2} {i:M7} {i:A4} pull.',
      },
    },
    {
      type: 'listen-choice',
      prompt: 'Two notes together: consonant or dissonant?',
      sound: { kind: 'interval', from: 'A2', interval: 'P5', play: 'together' },
      options: [{ text: 'Consonant: stable', correct: true }, { text: 'Dissonant: tense' }],
      shuffle: false,
      explain: 'That was {n:A} and {n:E}, a perfect fifth: the two notes blend into one steady sound, the power chord.',
    },
    {
      type: 'card',
      title: 'Perfect and imperfect',
      body: 'Consonances come in two kinds. **Perfect consonances** are the {t:unison}, the octave and the perfect fifth: the most stable of all. **Imperfect consonances** are thirds and sixths: stable, but warmer. **Dissonances** are seconds, sevenths and the {t:tritone}.',
      figure: { kind: 'audio', sound: { kind: 'interval', from: 'A2', interval: 'M6', play: 'together' }, label: 'Hear a major sixth' },
    },
    {
      type: 'choice',
      prompt: 'Which is an imperfect consonance?',
      options: [
        { text: 'A major sixth', correct: true },
        { text: 'A perfect fifth', why: 'The perfect fifth is a perfect consonance, like the octave and the unison.' },
        { text: 'A minor second', why: 'A minor second is a dissonance: two notes a half step apart rub hard.' },
      ],
      explain: 'Thirds and sixths, major or minor, are the imperfect consonances: stable, with a warm colour.',
      fact: 'interval-consonance-kinds',
    },
    {
      type: 'listen-choice',
      prompt: 'And these two: consonant or dissonant?',
      sound: { kind: 'interval', from: 'A2', interval: 'M7', play: 'together' },
      options: [{ text: 'Consonant: stable' }, { text: 'Dissonant: tense', correct: true }],
      shuffle: false,
      explain: 'That was {n:A} and {n:G#}, a major seventh: a half step short of the octave, it rubs and wants to move, often up to the octave.',
    },
    {
      type: 'choice',
      prompt: 'Which of these are dissonant? Choose all that are.',
      multiple: true,
      options: [
        { text: '{i:m2}', correct: true },
        { text: '{i:P5}' },
        { text: '{i:M7}', correct: true },
        { text: '{i:M3}' },
        { text: '{i:A4}', correct: true },
        { text: '{i:M6}' },
      ],
      explain: 'Seconds, sevenths and the tritone ({i:A4}) are dissonant. Fifths, thirds and sixths are consonant.',
      fact: 'interval-dissonances',
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the two kinds of consonance.',
      text: 'Thirds and sixths are ___ consonances. Octaves are ___ consonances.',
      blanks: ['imperfect', 'perfect'],
      bank: ['dissonant'],
      explain: 'Unisons, octaves and perfect fifths are perfect consonances; thirds and sixths are imperfect ones.',
      fact: 'interval-consonance-kinds',
    },
    {
      type: 'true-false',
      statement: 'In classical harmony, a perfect fourth above the bass is treated as a dissonance.',
      answer: true,
      explain: 'On its own a fourth sounds open and fairly stable, but above the bass note classical rules want it to move, usually down to a third.',
      fact: 'interval-fourth-above-bass',
    },
    {
      type: 'listen-choice',
      prompt: 'Hear two notes together and name the interval.',
      sound: { kind: 'interval', from: 'A2', interval: 'm7', play: 'together' },
      options: [{ text: '{i:P5}' }, { text: '{i:M3}' }, { text: '{i:m7}', correct: true }, { text: '{i:P8}' }],
      explain: 'That was {n:A} and {n:G}, ten half steps: a minor seventh. It clashes gently: the tension inside an {c:A7} chord.',
    },
    {
      type: 'choice',
      prompt: 'You hold a major seventh, then move its top note up to the octave. What happens to the sound?',
      options: [
        { text: 'The tension relaxes into a stable sound', correct: true },
        { text: 'A stable sound turns tense', why: 'It is the other way round: the seventh is the tense one, the octave the stable one.' },
        { text: 'Nothing: both are consonant', why: 'The major seventh is a dissonance; the octave is a perfect consonance.' },
      ],
      explain: 'A dissonance moving to a consonance is said to {t:resolve}: tension, then release. Music does it all the time.',
      fact: 'interval-consonance-meaning',
    },
    { generate: 'interval-ear', params: { intervals: ['P8', 'P5', 'M3', 'm7', 'm2', 'M6'], play: 'together' } },
  ],
  facts: [
    {
      id: 'interval-consonance-meaning',
      front: 'What is the difference between a consonance and a dissonance?',
      back: 'A consonance sounds stable. A dissonance sounds tense and seems to want to move.',
    },
    {
      id: 'interval-consonance-kinds',
      front: 'Which intervals are perfect consonances, and which are imperfect?',
      back: 'Perfect: unisons, octaves and perfect fifths. Imperfect: thirds and sixths.',
      ask: {
        type: 'choice',
        prompt: 'Which is a perfect consonance?',
        options: [
          { text: '{i:P5}', correct: true },
          { text: '{i:M3}', why: 'Thirds are imperfect consonances.' },
          { text: '{i:m7}', why: 'Sevenths are dissonant.' },
        ],
        explain: 'Unisons, octaves and perfect fifths are the perfect consonances.',
      },
    },
    { id: 'interval-dissonances', front: 'Which intervals are dissonant?', back: 'Seconds, sevenths and the tritone.' },
    {
      id: 'interval-fourth-above-bass',
      front: 'How does classical harmony treat a perfect fourth above the bass?',
      back: 'As a dissonance that wants to move, usually down to a third, although a fourth on its own sounds fairly stable.',
    },
  ],
};

/** Unit 14 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'Intervals: quality and shapes',
  theme: 'intervals',
  description: 'Full interval names, spelling by letters, inversions, interval shapes on the neck, compound intervals and consonance.',
  lessons: [
    intervalQuality, spellingCounts, intervalInversions, adjacentStringShapes, skipAStringShapes, theBStringShift, compoundIntervals,
    consonanceAndDissonance,
  ],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      {
        type: 'choice',
        prompt: 'Which of these can be perfect?',
        options: [
          { text: 'A fourth', correct: true },
          { text: 'A third', why: 'Thirds are major or minor.' },
          { text: 'A sixth', why: 'Sixths are major or minor.' },
          { text: 'A seventh', why: 'Sevenths are major or minor.' },
        ],
        explain: 'Unisons, fourths, fifths and octaves are the perfect intervals.',
      },
      {
        type: 'choice',
        prompt: '{n:D} to {n:Ab}: what is it?',
        options: [
          { text: 'Diminished fifth', correct: true },
          { text: 'Augmented fourth', why: 'Same size, but {n:D} to {n:Ab} spans five letters, D E F G A: a fifth. The augmented fourth above {n:D} is {n:G#}.' },
          { text: 'Minor fifth', why: 'Fifths are never minor.' },
          { text: 'Perfect fifth', why: 'The perfect fifth above {n:D} is {n:A}; {n:Ab} is a half step lower.' },
        ],
        explain: '{n:D} to {n:A} is a perfect fifth; {n:Ab} narrows it by a half step with the same letters: a diminished fifth.',
      },
      {
        type: 'type-answer',
        prompt: 'Type the note a major third above {n:F#}.',
        answer: { kind: 'note', value: 'A#', spelling: 'exact' },
        input: 'keypad',
        explain: 'Three letters, F G A, so a kind of {n:A}; four half steps above {n:F#} is {n:A#}.',
      },
      {
        type: 'choice',
        prompt: '{n:C} to {n:D#} and {n:C} to {n:Eb} are both three half steps. What are they called?',
        options: [
          { text: 'Augmented second and minor third', correct: true },
          { text: 'Both minor thirds', why: '{n:C} to {n:D#} spans only C and D: a second.' },
          { text: 'Minor third and augmented second', why: 'Reversed: {n:C} to {n:D#} spans two letters, so it is the second.' },
        ],
        explain: 'The letters give the number: C D is a second, C D E a third. So {n:C} to {n:D#} is an augmented second and {n:C} to {n:Eb} a minor third.',
      },
      {
        type: 'match-pairs',
        prompt: 'Match each interval with its inversion.',
        pairs: [
          { left: '{i:M2}', right: '{i:m7}' },
          { left: '{i:m3}', right: '{i:M6}' },
          { left: '{i:P5}', right: '{i:P4}' },
          { left: '{i:d5}', right: '{i:A4}' },
        ],
        explain: 'Each pair adds up to nine, with major and minor swapped, diminished and augmented swapped, and perfect kept perfect.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Complete the rule.',
        text: 'An interval and its inversion add up to ___.',
        blanks: ['nine'],
        bank: ['eight', 'seven', 'twelve'],
        explain: 'A third and a sixth, a second and a seventh, a fourth and a fifth: each pair adds up to nine.',
      },
      {
        type: 'fretboard-find',
        prompt: 'The dot is {n:A}, string 6 fret 5. Tap the major third above it on string 5.',
        find: { interval: 'M3', from: { string: 6, fret: 5 } },
        mode: 'one',
        octave: 'exact',
        frets: [2, 8],
        strings: [5],
        shown: [root(6, 5, 'A2')],
        explain: 'One fret lower on the next string: string 5, fret 4, {n:C#}.',
      },
      {
        type: 'fretboard-name',
        prompt: 'The root (R) is string 5, fret 3. What interval is the other dot above it?',
        position: { string: 4, fret: 1 },
        root: { string: 5, fret: 3 },
        ask: 'interval',
        spelling: 'any',
        options: ['m3', 'M3', 'P4', 'M2'],
        explain: 'Two frets lower on the next string is a minor third: three half steps above {n:C}.',
      },
      {
        type: 'fretboard-find',
        prompt: 'The dot is {n:G}, string 6 fret 3. Tap the major seventh above it on string 4.',
        find: { interval: 'M7', from: { string: 6, fret: 3 } },
        mode: 'one',
        octave: 'exact',
        frets: [1, 7],
        strings: [4],
        shown: [root(6, 3, 'G2')],
        explain: 'One string skipped, one fret higher: string 4, fret 4, {n:F#}.',
      },
      {
        type: 'fretboard-name',
        prompt: 'The root (R) is string 5, fret 5. What interval is the other dot above it?',
        position: { string: 3, fret: 3 },
        root: { string: 5, fret: 5 },
        ask: 'interval',
        spelling: 'any',
        options: ['m6', 'M6', 'm7', 'P5'],
        explain: 'One string skipped, two frets lower: a minor sixth, eight half steps above {n:D}.',
      },
      {
        type: 'fretboard-find',
        prompt: 'The dot is {n:D}, string 3 fret 7. Tap the perfect fourth above it on string 2.',
        find: { interval: 'P4', from: { string: 3, fret: 7 } },
        mode: 'one',
        octave: 'exact',
        frets: [5, 10],
        strings: [2],
        shown: [root(3, 7, 'D4')],
        explain: 'Across {n:G} and {n:B} the fourth is one fret higher: string 2, fret 8, {n:G}.',
      },
      {
        type: 'true-false',
        statement: 'The same fret on strings 3 and 2 is a perfect fourth.',
        answer: false,
        explain: 'Strings 3 and 2 are a major third apart, so the same fret is a major third. A fourth needs one fret more on string 2.',
      },
      {
        type: 'match-pairs',
        prompt: 'Match each interval with its size.',
        pairs: [
          { left: '{i:M9}', right: '14 half steps' },
          { left: '{i:P11}', right: '17 half steps' },
          { left: '{i:M13}', right: '21 half steps' },
        ],
        explain: 'Each is a simple interval plus an octave, 12 half steps: 2 + 12, 5 + 12 and 9 + 12.',
      },
      {
        type: 'choice',
        prompt: 'A thirteenth is an octave plus which interval?',
        options: [
          { text: 'A sixth', correct: true },
          { text: 'A fifth', why: 'A fifth plus an octave is a twelfth.' },
          { text: 'A fourth', why: 'A fourth plus an octave is an eleventh.' },
        ],
        shuffle: false,
        explain: '13 − 7 = 6: a sixth plus an octave.',
      },
      {
        type: 'choice',
        prompt: 'Which is a perfect consonance?',
        options: [
          { text: '{i:P5}', correct: true },
          { text: '{i:M3}', why: 'Thirds are imperfect consonances.' },
          { text: '{i:m7}', why: 'Sevenths are dissonant.' },
          { text: '{i:A4}', why: 'The tritone is dissonant.' },
        ],
        explain: 'Unisons, octaves and perfect fifths are the perfect consonances.',
      },
      {
        type: 'listen-choice',
        prompt: 'Two notes together: consonant or dissonant?',
        sound: { kind: 'interval', from: 'A2', interval: 'm2', play: 'together' },
        options: [{ text: 'Consonant: stable' }, { text: 'Dissonant: tense', correct: true }],
        shuffle: false,
        explain: 'That was {n:A} and {n:Bb}, a minor second: two notes a half step apart rub hard.',
      },
      {
        type: 'listen-choice',
        prompt: 'And these two: consonant or dissonant?',
        sound: { kind: 'interval', from: 'A2', interval: 'M6', play: 'together' },
        options: [{ text: 'Consonant: stable', correct: true }, { text: 'Dissonant: tense' }],
        shuffle: false,
        explain: 'That was {n:A} and {n:F#}, a major sixth: an imperfect consonance, stable and warm.',
      },
    ],
  },
};

export default unit;
