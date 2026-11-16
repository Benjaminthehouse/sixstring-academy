/**
 * Theory Path, unit 27: Colour chords (sus, add, 6 and slash). Written from the syllabus entries in
 * `src/content/plan/theory-path.json` (unit `colour-chords`), one lesson per entry, in order: each
 * lesson opens with the "on the guitar" picture, asks the planned exercises, ends with the planned
 * drills, and turns every planned fact into a review card.
 *
 * Every spelling, shape, bass note and listening question is cross-checked against `@/core/theory`
 * and `@/core/guitar` in `colour-chords.test.ts`.
 *
 * Notes for readers of the code:
 * - `teaches` is shown as plain text on the map, so it names chords in words, never as symbols.
 * - A chord figure always prints the chord's name, so no question uses one as an answer option.
 * - The falling bass line ends on F: the syllabus names the small F (xx3211), whose lowest note is
 *   the F an octave above G2, so the line would jump up. The lesson plays the barre F (133211), as
 *   the audio does, and says why.
 */
import type { Lesson, Unit } from '@/lessons';

const U = 'colour-chords';

const susChords: Lesson = {
  id: 'sus-chords',
  title: 'Suspended chords',
  teaches: 'A suspended chord replaces the 3rd with the 2nd or the 4th, so it is neither major nor minor.',
  minutes: 3,
  skill: `theory:${U}:sus-chords`,
  steps: [
    {
      type: 'card',
      title: 'Swap out the 3rd',
      body: 'The 3rd decides major or minor. A {t:suspended-chord|suspended chord} leaves it out and uses the 2nd or the 4th instead. In the {c:D} shape the 3rd, {n:F#}, is on string 1. Lift that finger for the open {n:E}: {c:Dsus2}. Reach up to {n:G} at fret 3: {c:Dsus4}.',
      figure: {
        kind: 'fretboard',
        frets: [0, 4],
        root: 'D',
        labels: 'degree',
        dots: [
          { string: 4, fret: 0, note: 'D', degree: '1', role: 'root' },
          { string: 3, fret: 2, note: 'A', degree: '5', role: 'fifth' },
          { string: 2, fret: 3, note: 'D', degree: '1', role: 'root' },
          { string: 1, fret: 0, note: 'E', degree: '2', role: 'tone' },
          { string: 1, fret: 2, note: 'F#', degree: '3', role: 'third' },
          { string: 1, fret: 3, note: 'G', degree: '4', role: 'tone' },
        ],
        caption: 'The {c:D} shape. String 1 picks the 2, the 3 or the 4.',
      },
    },
    {
      type: 'card',
      title: 'Hear the 3rd come and go',
      body: 'Listen: {c:D}, {c:Dsus4}, {c:D}, {c:Dsus2}, {c:D}. Only the top note moves. The sus chords sound open and unsettled, as if waiting; {c:D} sounds like arriving.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['D', 'Dsus4', 'D', 'Dsus2', 'D'], beats: 2, tempo: 72 }, label: 'Hear the top note move' },
    },
    {
      type: 'choice',
      prompt: 'What does {c:Dsus4} have in place of the 3rd?',
      options: [
        { text: 'The 4th, {n:G}', correct: true },
        { text: 'The 2nd, {n:E}', why: 'That is {c:Dsus2}: there the 2nd replaces the 3rd.' },
        { text: 'Nothing: it keeps {n:F#}', why: '{n:F#} is the 3rd itself, and a sus chord leaves it out.' },
        { text: 'The minor 3rd, {n:F}', why: '{n:F} makes {c:Dm}: a minor chord, not a suspended one.' },
      ],
      explain: 'The number says which note replaces the 3rd. {c:Dsus4} is {n:D} {n:G} {n:A}: root, 4th and 5th.',
      fact: 'colour-sus-replaces-third',
    },
    {
      type: 'true-false',
      statement: '{c:Dsus2} is a minor chord, because it has no {n:F#}.',
      answer: false,
      explain: 'With no 3rd at all, {c:Dsus2} ({n:D} {n:E} {n:A}) is neither major nor minor. A minor chord needs a minor 3rd: {n:F} in {c:Dm}.',
      fact: 'colour-sus-no-third',
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete {c:Gsus4}.',
      text: '{c:Gsus4} = {n:G}  ___  {n:D}',
      blanks: ['{n:C}'],
      bank: ['{n:B}', '{n:A}', '{n:Bb}'],
      explain: 'The 4th above {n:G} is {n:C}, so {c:Gsus4} is {n:G} {n:C} {n:D}. {n:B} is the 3rd of plain {c:G}, and {n:A} the 2nd of {c:Gsus2}.',
      fact: 'colour-sus-replaces-third',
    },
    {
      type: 'card',
      title: 'A sus4 wants to go home',
      body: 'A sus4 leans. It often {t:resolve|resolves} to the major chord on the same root, the 4th falling to the 3rd: {c:Dsus4} (xx0233) to {c:D} (xx0232). The {c:A} shape works the same way, on string 2: {c:Asus2} (x02200), {c:A} (x02220), {c:Asus4} (x02230).',
      figure: {
        kind: 'fretboard',
        frets: [0, 4],
        root: 'A',
        labels: 'degree',
        dots: [
          { string: 5, fret: 0, note: 'A', degree: '1', role: 'root' },
          { string: 4, fret: 2, note: 'E', degree: '5', role: 'fifth' },
          { string: 3, fret: 2, note: 'A', degree: '1', role: 'root' },
          { string: 2, fret: 0, note: 'B', degree: '2', role: 'tone' },
          { string: 2, fret: 2, note: 'C#', degree: '3', role: 'third' },
          { string: 2, fret: 3, note: 'D', degree: '4', role: 'tone' },
          { string: 1, fret: 0, note: 'E', degree: '5', role: 'fifth' },
        ],
        caption: 'The {c:A} shape. String 2 picks the 2, the 3 or the 4.',
      },
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'Asus4',
      frets: 'x02230',
      accept: 'any-voicing',
      prompt: 'Build {c:Asus4}: start from {c:A} and move the 3rd on string 2 up to the 4th.',
      figure: { kind: 'chord', symbol: 'A', frets: 'x02220', caption: 'Start from {c:A} (x02220).' },
      explain: '{c:Asus4} is x02230: fret 2 on strings 4 and 3, fret 3 on string 2 ({n:D}, the 4th), and the open {n:A} and {n:E} strings.',
    },
    {
      type: 'true-false',
      statement: '{c:Asus4} usually resolves to {c:A}: its 4th, {n:D}, falls to the 3rd, {n:C#}.',
      answer: true,
      explain: 'A sus4 leans toward the major chord on its own root. On the guitar, string 2 drops from fret 3 to fret 2.',
      fact: 'colour-sus4-resolves',
    },
    {
      type: 'listen-choice',
      prompt: 'Two chords. Does the phrase end suspended or resolved?',
      sound: { kind: 'progression', chords: ['D', 'Dsus4'], beats: 2, tempo: 72 },
      options: [{ text: 'Suspended: it still wants to move', correct: true }, { text: 'Resolved: it sounds settled' }],
      shuffle: false,
      explain: 'It went {c:D} to {c:Dsus4}: the 3rd rose to the 4th and stayed there, so the phrase hangs in the air. Played the other way round, {c:Dsus4} to {c:D}, it resolves.',
    },
    {
      type: 'choice',
      prompt: 'Add the {d:b7} to a sus4 and you get a 7sus4, such as {c:A7sus4} (x02030). Which notes make it up?',
      figure: { kind: 'chord', symbol: 'A7sus4', frets: 'x02030', caption: 'The open {n:G} on string 3 is the {d:b7}.' },
      options: [
        { text: '{n:A} {n:D} {n:E} {n:G}', correct: true },
        { text: '{n:A} {n:C#} {n:E} {n:G}', why: 'That is {c:A7}: it has the 3rd, {n:C#}.' },
        { text: '{n:A} {n:D} {n:E}', why: 'That is {c:Asus4}, with no 7th.' },
        { text: '{n:A} {n:D} {n:E} {n:G#}', why: '{n:G#} is the major 7th. A 7sus4 has the flat 7th, {n:G}.' },
      ],
      explain: 'Root, 4th, 5th and flat 7th: {n:A} {n:D} {n:E} {n:G}. In {k:D major} it often takes the place of {c:A7}, the {r:V7}, or comes just before it.',
      fact: 'colour-7sus4',
    },
    { generate: 'chord-tones', params: { types: ['sus4', 'sus2', '7sus4'], roots: ['D', 'A', 'E', 'G', 'C'], ask: 'notes' } },
    { generate: 'chord-quality-ear', params: { types: ['major', 'sus4', 'sus2'] } },
  ],
  facts: [
    {
      id: 'colour-sus-replaces-third',
      front: 'What is a suspended chord? Spell {c:Csus2} and {c:Csus4}.',
      back: 'A chord with the 3rd replaced by the 2nd (sus2) or the 4th (sus4). {c:Csus2} is {n:C} {n:D} {n:G}; {c:Csus4} is {n:C} {n:F} {n:G}.',
      ask: {
        type: 'fill-blanks',
        prompt: 'Complete {c:Csus4}.',
        text: '{c:Csus4} = {n:C}  ___  {n:G}',
        blanks: ['{n:F}'],
        bank: ['{n:E}', '{n:D}', '{n:Eb}'],
        explain: 'The 4th above {n:C} is {n:F}: {c:Csus4} is {n:C} {n:F} {n:G}. {n:D} would make {c:Csus2}; {n:E} or {n:Eb} would put a 3rd back.',
      },
    },
    { id: 'colour-sus-no-third', front: 'Is a sus chord major or minor?', back: 'Neither. It has no 3rd, and the 3rd is what makes a chord major or minor.' },
    {
      id: 'colour-sus4-resolves',
      front: 'Where does a sus4 chord usually go next?',
      back: 'To the major chord on the same root, the 4th falling to the 3rd: {c:Dsus4} (xx0233) to {c:D} (xx0232).',
    },
    {
      id: 'colour-7sus4',
      front: 'What is a 7sus4 chord, and how is it often used?',
      back: 'A sus4 with the {d:b7} added: {c:A7sus4} (x02030) is {n:A} {n:D} {n:E} {n:G}. It often stands in for {r:V7}, or comes just before it.',
    },
  ],
};

const addChords: Lesson = {
  id: 'add-chords',
  title: 'Added-note chords',
  teaches: 'An add chord keeps the triad and adds one note, such as the 9th, without a 7th.',
  minutes: 3,
  skill: `theory:${U}:add-chords`,
  steps: [
    {
      type: 'card',
      title: 'Keep the 3rd, add a colour',
      body: 'An {t:added-note-chord|add chord} keeps the whole triad and adds one more note. The favourite is the 9th, the 2nd an octave up: {c:Cadd9} is {n:C} {n:E} {n:G} plus {n:D}. From {c:C} (x32010), move the note on string 2 from fret 1 to fret 3: {c:Cadd9} (x32030).',
      figure: {
        kind: 'fretboard',
        frets: [0, 4],
        root: 'C',
        labels: 'degree',
        dots: [
          { string: 5, fret: 3, note: 'C', degree: '1', role: 'root' },
          { string: 4, fret: 2, note: 'E', degree: '3', role: 'third' },
          { string: 3, fret: 0, note: 'G', degree: '5', role: 'fifth' },
          { string: 2, fret: 3, note: 'D', degree: '9', role: 'tone' },
          { string: 1, fret: 0, note: 'E', degree: '3', role: 'third' },
        ],
        caption: '{c:Cadd9} (x32030): the {n:D} on string 2 is the 9th.',
      },
    },
    {
      type: 'card',
      title: 'Add9 or 9?',
      body: 'Listen to {c:C}, {c:Cadd9}, then {c:C9}. {c:C9} has the 9th **and** the 7th, {n:Bb}: {n:C} {n:E} {n:G} {n:Bb} {n:D}. That 7th makes it bluesy and restless. An add chord has no 7th: "add" means just this one note.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['C', 'Cadd9', 'C9'], beats: 2, tempo: 66 }, label: 'Hear {c:C}, {c:Cadd9}, {c:C9}' },
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'Cadd9',
      frets: 'x32030',
      accept: 'any-voicing',
      prompt: 'Build {c:Cadd9}: the {c:C} shape with string 2 at fret 3 instead of fret 1.',
      figure: { kind: 'chord', symbol: 'C', frets: 'x32010', caption: 'Start from {c:C} (x32010).' },
      explain: '{c:Cadd9} is x32030: {n:C} at fret 3 of string 5, {n:E} at fret 2 of string 4, the open {n:G}, then {n:D}, the 9th, at fret 3 of string 2, and the open {n:E}.',
    },
    {
      type: 'choice',
      prompt: 'Which of these chords has a 7th in it?',
      options: [
        { text: '{c:C9}', correct: true },
        { text: '{c:Cadd9}', why: '"Add" means the 9th and nothing else: {n:C} {n:E} {n:G} {n:D}, no 7th.' },
        { text: '{c:Csus4}', why: '{c:Csus4} is {n:C} {n:F} {n:G}: no 3rd and no 7th.' },
        { text: '{c:Cadd4}', why: '{c:Cadd4} is {n:C} {n:E} {n:F} {n:G}: a triad plus the 4th.' },
      ],
      explain: 'A plain 9 chord includes the {d:b7}: {c:C9} is {n:C} {n:E} {n:G} {n:Bb} {n:D}. {c:Cadd9} skips the 7th.',
      fact: 'colour-add9-vs-9',
    },
    {
      type: 'type-answer',
      prompt: 'Which note does {c:Gadd9} add to the {c:G} triad?',
      answer: { kind: 'note', value: 'A', spelling: 'exact' },
      input: 'keypad',
      explain: 'The 9th is the 2nd an octave up. The 2nd above {n:G} is {n:A}, so {c:Gadd9} is {n:G} {n:B} {n:D} {n:A}.',
      fact: 'colour-add9',
    },
    {
      type: 'card',
      title: 'Add4 and add11',
      body: 'Add the 4th instead and you get {c:Cadd4}: {n:C} {n:E} {n:F} {n:G}. Unlike {c:Csus4}, it keeps the 3rd, so the {n:E} and {n:F} rub a half step apart. Put that {n:F} an octave higher, above the rest of the chord, and it is called {c:Cadd11}.',
      figure: {
        kind: 'keyboard',
        keys: [
          { note: 'C4', label: '1', role: 'root' },
          { note: 'E4', label: '3', role: 'third' },
          { note: 'F4', label: '4', role: 'tone' },
          { note: 'G4', label: '5', role: 'fifth' },
        ],
        from: 'C4',
        to: 'B4',
        caption: '{c:Cadd4}: the 3rd and the 4th side by side.',
      },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each chord with its notes.',
      pairs: [
        { left: '{c:Cadd9}', right: '{n:C} {n:E} {n:G} {n:D}' },
        { left: '{c:C9}', right: '{n:C} {n:E} {n:G} {n:Bb} {n:D}' },
        { left: '{c:Cadd4}', right: '{n:C} {n:E} {n:F} {n:G}' },
        { left: '{c:Csus4}', right: '{n:C} {n:F} {n:G}' },
      ],
      explain: 'Add9 and add4 keep the triad and add one note; a 9 chord also has the {d:b7}; a sus4 drops the 3rd.',
      fact: 'colour-add4',
    },
    {
      type: 'true-false',
      statement: '{c:Cadd4} and {c:Csus4} are two names for the same chord.',
      answer: false,
      explain: '{c:Cadd4} keeps the 3rd: {n:C} {n:E} {n:F} {n:G}. {c:Csus4} drops it: {n:C} {n:F} {n:G}. Only the sus chord is neither major nor minor.',
      fact: 'colour-add4',
    },
    { generate: 'chord-tones', params: { types: ['add9', '9', 'add4'], roots: ['C', 'G', 'D', 'A', 'F'], ask: 'notes' } },
    { generate: 'chord-tones', params: { types: ['add9'], roots: ['C', 'G', 'D', 'A', 'F', 'E'], ask: 'missing' } },
  ],
  facts: [
    {
      id: 'colour-add9',
      front: 'What is an add9 chord? Spell {c:Cadd9}.',
      back: 'A triad plus the 9th, with no 7th: {c:Cadd9} is {n:C} {n:E} {n:G} {n:D}.',
      ask: {
        type: 'type-answer',
        prompt: 'Which note does {c:Dadd9} add to the {c:D} triad?',
        answer: { kind: 'note', value: 'E', spelling: 'exact' },
        input: 'keypad',
        explain: 'The 9th above {n:D} is {n:E} (the 2nd, an octave up): {c:Dadd9} is {n:D} {n:F#} {n:A} {n:E}.',
      },
    },
    {
      id: 'colour-add9-vs-9',
      front: 'What is the difference between {c:Cadd9} and {c:C9}?',
      back: '{c:C9} also has the {d:b7}: {n:C} {n:E} {n:G} {n:Bb} {n:D}. {c:Cadd9} has no 7th: {n:C} {n:E} {n:G} {n:D}.',
    },
    {
      id: 'colour-add4',
      front: 'What is {c:Cadd4}, and how is add11 different?',
      back: '{c:Cadd4} keeps the 3rd and adds the 4th: {n:C} {n:E} {n:F} {n:G}. In {c:Cadd11} the same added note sits an octave higher.',
    },
  ],
};

const sixthChords: Lesson = {
  id: 'sixth-chords',
  title: 'Sixth chords',
  teaches: 'A 6 chord adds the major 6th to a triad, and C6 has the same notes as A minor 7.',
  minutes: 3,
  skill: `theory:${U}:sixth-chords`,
  steps: [
    {
      type: 'card',
      title: 'Add the 6th',
      body: 'A {t:sixth-chord|6 chord} is a major triad plus the major 6th. {c:C6} is {n:C} {n:E} {n:G} and {n:A}. This shape, x35555, puts the {n:A} on top: a sweet, settled sound you hear at the end of many swing and pop songs.',
      figure: {
        kind: 'fretboard',
        frets: [2, 6],
        dots: [
          { string: 5, fret: 3, note: 'C', role: 'root' },
          { string: 4, fret: 5, note: 'G', role: 'fifth' },
          { string: 3, fret: 5, note: 'C', role: 'root' },
          { string: 2, fret: 5, note: 'E', role: 'third' },
          { string: 1, fret: 5, note: 'A', role: 'tone' },
        ],
        caption: '{c:C6} (x35555): the {n:A} on string 1 is the 6th.',
      },
      tip: 'Fret string 5 with your first finger, and flatten your third finger across strings 4 to 1 at fret 5.',
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete {c:G6}.',
      text: '{c:G6} = {n:G}  {n:B}  {n:D}  ___',
      blanks: ['{n:E}'],
      bank: ['{n:F}', '{n:F#}', '{n:Eb}'],
      explain: 'The major 6th above {n:G} is {n:E}, nine half steps up: {c:G6} is {n:G} {n:B} {n:D} {n:E}. {n:F} would make {c:G7} and {n:F#} {c:Gmaj7}.',
      fact: 'colour-sixth-chord',
    },
    {
      type: 'card',
      title: 'Same four notes',
      body: 'Now play {c:Am7} (x02010): {n:A} {n:C} {n:E} {n:G}. Those are the four notes of {c:C6}. Only the bass decides the name: with {n:C} lowest the chord sounds like {c:C6}, with {n:A} lowest like {c:Am7}.',
      figure: {
        kind: 'fretboard',
        frets: [0, 4],
        dots: [
          { string: 5, fret: 0, note: 'A', role: 'root' },
          { string: 4, fret: 2, note: 'E', role: 'tone' },
          { string: 3, fret: 0, note: 'G', role: 'tone' },
          { string: 2, fret: 1, note: 'C', role: 'tone' },
          { string: 1, fret: 0, note: 'E', role: 'tone' },
        ],
        caption: '{c:Am7} (x02010): {n:A} {n:C} {n:E} {n:G}, the notes of {c:C6}.',
      },
    },
    {
      type: 'choice',
      prompt: 'Which chord has the same four notes as {c:C6}?',
      options: [
        { text: '{c:Am7}', correct: true },
        { text: '{c:Cmaj7}', why: '{c:Cmaj7} has {n:B}, not {n:A}: {n:C} {n:E} {n:G} {n:B}.' },
        { text: '{c:Am}', why: '{c:Am} has only three notes, {n:A} {n:C} {n:E}: no {n:G}.' },
        { text: '{c:C7}', why: '{c:C7} adds {n:Bb}, not {n:A}.' },
      ],
      explain: '{c:C6} is {n:C} {n:E} {n:G} {n:A} and {c:Am7} is {n:A} {n:C} {n:E} {n:G}: the same notes. The bass note decides which name fits.',
      fact: 'colour-c6-am7',
    },
    {
      type: 'listen-choice',
      prompt: 'A plain major triad, or a 6 chord?',
      sound: { kind: 'chord', chord: 'G6', voicing: 'close', octave: 3 },
      options: [{ text: 'A plain major triad' }, { text: 'A 6 chord', correct: true }],
      shuffle: false,
      explain: 'That was {c:G6}: {n:G} {n:B} {n:D} with {n:E} on top. The added 6th sounds sweet and a little hazy compared with a plain triad.',
    },
    {
      type: 'card',
      title: 'Minor 6 and 6/9',
      body: 'Add the **major** 6th to a minor triad for a minor 6: {c:Am6} (x02212) is {n:A} {n:C} {n:E} {n:F#}. Add both the 6th and the 9th to a major triad for a 6/9: {c:C6/9} (x32233) is {n:C} {n:E} {n:G} {n:A} {n:D}, a favourite last chord in jazz.',
      figure: { kind: 'chord', symbol: 'Am6', frets: 'x02212', caption: 'The {n:F#} on string 1, fret 2 is the 6th of {c:Am6}.' },
    },
    {
      type: 'type-answer',
      prompt: 'Which note is the 6th of {c:Am6}?',
      answer: { kind: 'note', value: 'F#', spelling: 'exact' },
      input: 'keypad',
      explain: 'A minor 6 uses the major 6th: {n:F#}, nine half steps above {n:A}. {n:F} would be the minor 6th, which a minor 6 chord does not use.',
      fact: 'colour-minor-sixth',
    },
    {
      type: 'choice',
      prompt: 'Which notes make up {c:C6/9}?',
      options: [
        { text: '{n:C} {n:E} {n:G} {n:A} {n:D}', correct: true },
        { text: '{n:C} {n:E} {n:G} {n:A}', why: 'That is {c:C6}: the 9th, {n:D}, is missing.' },
        { text: '{n:C} {n:E} {n:G} {n:D}', why: 'That is {c:Cadd9}: the 6th, {n:A}, is missing.' },
        { text: '{n:C} {n:E} {n:G} {n:Bb} {n:D}', why: 'That is {c:C9}, with a {d:b7} in place of the 6th.' },
      ],
      explain: 'A 6/9 is a major triad plus the 6th and the 9th: {n:C} {n:E} {n:G}, then {n:A} and {n:D}. There is no 7th.',
      fact: 'colour-six-nine',
    },
    { generate: 'chord-tones', params: { types: ['6', 'm6', '69'], roots: ['C', 'G', 'D', 'A', 'E', 'F'], ask: 'notes' } },
    { generate: 'chord-quality-ear', params: { types: ['major', '6'] } },
  ],
  facts: [
    {
      id: 'colour-sixth-chord',
      front: 'What is a 6 chord? Spell {c:C6}.',
      back: 'A major triad plus the major 6th: {c:C6} is {n:C} {n:E} {n:G} {n:A}.',
      ask: {
        type: 'fill-blanks',
        prompt: 'Complete {c:D6}.',
        text: '{c:D6} = {n:D}  {n:F#}  {n:A}  ___',
        blanks: ['{n:B}'],
        bank: ['{n:Bb}', '{n:C}', '{n:C#}'],
        explain: 'The major 6th above {n:D} is {n:B}: {c:D6} is {n:D} {n:F#} {n:A} {n:B}.',
      },
    },
    {
      id: 'colour-minor-sixth',
      front: 'What is a minor 6 chord? Spell {c:Am6}.',
      back: 'A minor triad plus the major 6th: {c:Am6} is {n:A} {n:C} {n:E} {n:F#}.',
    },
    {
      id: 'colour-c6-am7',
      front: 'Which chord has the same four notes as {c:C6}?',
      back: '{c:Am7}: {n:A} {n:C} {n:E} {n:G}. The bass note decides which name fits.',
    },
    {
      id: 'colour-six-nine',
      front: 'What is a 6/9 chord? Spell {c:C6/9}.',
      back: 'A major triad plus the 6th and the 9th: {c:C6/9} (x32233) is {n:C} {n:E} {n:G} {n:A} {n:D}.',
    },
  ],
};

const slashChords: Lesson = {
  id: 'slash-chords',
  title: 'Slash chords',
  teaches: 'A slash chord names a chord and its bass note: a chord tone (an inversion) or a new note for colour.',
  minutes: 3,
  skill: `theory:${U}:slash-chords`,
  steps: [
    {
      type: 'card',
      title: 'Chord over bass',
      body: 'A {t:slash-chord|slash chord} names a chord and its lowest note: chord, slash, bass. {c:D/F#} is a {c:D} chord with {n:F#} at the bottom. Hold the {c:D} shape and add string 6 at fret 2 with your thumb or first finger, leaving string 5 silent: 2x0232.',
      figure: { kind: 'chord', symbol: 'D/F#', frets: '2x0232', caption: 'Thumb (or finger 1) on string 6, fret 2; string 5 muted.' },
    },
    {
      type: 'choice',
      prompt: 'Is {c:D/F#} an inversion of {c:D}?',
      options: [
        { text: 'Yes: first inversion, the 3rd in the bass', correct: true },
        { text: 'Yes: second inversion, the 5th in the bass', why: 'The 5th of {c:D} is {n:A}. {n:F#} is its 3rd.' },
        { text: 'No: {n:F#} is not in {c:D}', why: '{c:D} is {n:D} {n:F#} {n:A}, so {n:F#} is one of its notes: the 3rd.' },
      ],
      explain: '{c:D} is {n:D} {n:F#} {n:A}. With its 3rd, {n:F#}, lowest, {c:D/F#} is {c:D} in first inversion.',
      fact: 'colour-slash-inversion',
    },
    {
      type: 'card',
      title: 'G over B',
      body: '{c:G/B} (x20003) is the same idea: a {c:G} chord with its 3rd, {n:B}, in the bass. When the bass is one of the chord\'s own notes, the slash chord is an {t:inversion}. {c:G/B} is a favourite stepping stone between {c:C} and {c:Am}: the bass goes {n:C}, {n:B}, {n:A}.',
      figure: { kind: 'chord', symbol: 'G/B', frets: 'x20003', caption: 'String 6 is silent: the {n:B} on string 5 is the lowest note.' },
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'G/B',
      frets: 'x20003',
      accept: 'any-voicing',
      prompt: 'Build {c:G/B}: a {c:G} chord with {n:B} as its lowest note.',
      explain: '{c:G/B} is x20003: {n:B} at fret 2 of string 5, the open {n:D}, {n:G} and {n:B} strings, and {n:G} at fret 3 of string 1. Leave string 6 silent so {n:B} is the bass.',
    },
    {
      type: 'card',
      title: 'A new bass note',
      body: 'The bass can also be a note that is **not** in the chord. {c:D/C} (x30232) puts {n:C} under {c:D}. Those are the notes of {c:D7}, but with the 7th, {n:C}, at the bottom: a darker sound that leans forward, often toward {c:G/B}.',
      figure: { kind: 'chord', symbol: 'D/C', frets: 'x30232', caption: 'The {c:D} shape over {n:C} at fret 3 of string 5.' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each slash chord with its bass note.',
      pairs: [
        { left: '{c:D/F#}', right: '{n:F#}' },
        { left: '{c:G/B}', right: '{n:B}' },
        { left: '{c:D/C}', right: '{n:C}' },
        { left: '{c:C/E}', right: '{n:E}' },
      ],
      explain: 'The note after the slash is always the bass: chord first, then the lowest note.',
      fact: 'colour-slash-meaning',
    },
    {
      type: 'true-false',
      statement: '{c:D/C} is an inversion of {c:D}.',
      answer: false,
      explain: '{n:C} is not one of {n:D} {n:F#} {n:A}, so {c:D/C} is not an inversion. It is {c:D} over a new bass note: the notes of {c:D7}, with {n:C} lowest.',
      fact: 'colour-slash-new-bass',
    },
    {
      type: 'listen-choice',
      prompt: 'The top of the chord stays {c:D}; the second time, the bass changes. To which note?',
      sound: { kind: 'progression', chords: ['D', 'D/F#'], beats: 2, tempo: 66 },
      options: [{ text: '{n:D}' }, { text: '{n:F#}', correct: true }, { text: '{n:C}' }],
      shuffle: false,
      explain: 'It went {c:D} to {c:D/F#}: the bass dropped from {n:D} to {n:F#} on string 6, the chord\'s own 3rd, so it still sounds bright. {n:C} would have sounded darker and restless.',
    },
    {
      type: 'choice',
      prompt: 'Which of these slash chords is an inversion?',
      options: [
        { text: '{c:C/E}', correct: true },
        { text: '{c:C/D}', why: '{n:D} is not in {c:C}: it is a new bass note.' },
        { text: '{c:C/F}', why: '{n:F} is not in {c:C}: it is a new bass note.' },
        { text: '{c:C/Bb}', why: '{n:Bb} is not in {c:C}: it is a new bass note.' },
      ],
      explain: '{c:C} is {n:C} {n:E} {n:G}. Only {c:C/E} has one of those notes, the 3rd, in the bass: first inversion.',
      fact: 'colour-slash-inversion',
    },
  ],
  facts: [
    {
      id: 'colour-slash-meaning',
      front: 'What does a slash chord such as {c:D/F#} mean?',
      back: 'A chord and its bass note, written chord/bass: {c:D/F#} is a {c:D} chord with {n:F#} lowest.',
      ask: {
        type: 'type-answer',
        prompt: 'Which note is the bass of {c:A/C#}?',
        answer: { kind: 'note', value: 'C#', spelling: 'exact' },
        input: 'keypad',
        explain: 'The note after the slash is the bass: {c:A/C#} is an {c:A} chord with {n:C#}, its 3rd, lowest.',
      },
    },
    {
      id: 'colour-slash-inversion',
      front: 'When is a slash chord an inversion?',
      back: 'When the bass is one of the chord\'s notes: {c:D/F#} is {c:D} in first inversion, with its 3rd lowest.',
    },
    {
      id: 'colour-slash-new-bass',
      front: 'What does {c:D/C} add to {c:D}?',
      back: 'A bass note from outside the chord: {n:C} under {n:D} {n:F#} {n:A}. The notes are those of {c:D7}, with {n:C} in the bass.',
    },
  ],
};

const walkingBass: Lesson = {
  id: 'walking-bass-with-slash-chords',
  title: 'Bass lines with slash chords',
  teaches: 'Slash chords let the bass walk down by step while the chords change: C, C over B, A minor, A minor over G.',
  minutes: 3,
  skill: `theory:${U}:walking-bass-with-slash-chords`,
  steps: [
    {
      type: 'card',
      title: 'A bass that walks',
      body: 'Play {c:C} (x32010), {c:C/B} (x22010), {c:Am} (x02210) and {c:Am/G} (3x2210), two beats each. Listen to the lowest note: {n:C}, {n:B}, {n:A}, {n:G}, one step at a time. The {t:bass-line|bass line} walks down while the hand keeps nearly the same shape.',
      figure: {
        kind: 'fretboard',
        frets: [0, 4],
        dots: [
          { string: 5, fret: 3, note: 'C3', role: 'root' },
          { string: 5, fret: 2, note: 'B2', role: 'target' },
          { string: 5, fret: 0, note: 'A2', role: 'target' },
          { string: 6, fret: 3, note: 'G2', role: 'target' },
          { string: 6, fret: 1, note: 'F2', role: 'target' },
        ],
        caption: 'The bass line {n:C} {n:B} {n:A} {n:G} {n:F} on strings 5 and 6.',
      },
    },
    {
      type: 'card',
      title: 'Down to F',
      body: 'Finish on {c:F}. To keep the bass falling to {n:F} on string 6, fret 1, play the barre {c:F} (133211). The small {c:F} (xx3211) works too, but its lowest {n:F} is an octave higher, so the line jumps up at the end.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['C', 'C/B', 'Am', 'Am/G', 'F'], beats: 2, tempo: 76 }, label: 'Hear the bass walk down' },
    },
    {
      type: 'order',
      prompt: 'Put these chords in order so that the bass falls one step at a time.',
      tiles: ['{c:C}', '{c:C/B}', '{c:Am}', '{c:Am/G}'],
      explain: 'Their bass notes are {n:C}, {n:B}, {n:A} and {n:G}: each one step below the last.',
      fact: 'colour-walking-bass',
    },
    {
      type: 'play-chord',
      prompt: 'Play {c:C/B}: your {c:C} shape with the bass on string 5 moved from fret 3 down to fret 2.',
      chord: 'C/B',
      frets: 'x22010',
      explain: '{c:C/B} is x22010: {n:B} at fret 2 of string 5 under {n:E}, {n:G}, {n:C} and {n:E}. If the bass is weak, press string 5 a little harder and keep string 6 silent.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'C/B',
        frets: 'x22010',
        accept: 'any-voicing',
        prompt: 'Build {c:C/B}: the {c:C} shape with {n:B} in the bass on string 5.',
        explain: '{c:C/B} is x22010: the {c:C} shape with its bass moved down one fret, from {n:C} to {n:B}.',
      },
    },
    {
      type: 'true-false',
      statement: '{c:C/B} can also be named {c:Cmaj7/B}.',
      answer: true,
      explain: '{n:B} is the major 7th of {c:C}, so {c:C/B} ({n:B} {n:C} {n:E} {n:G}) holds every note of {c:Cmaj7}, with the 7th in the bass.',
      fact: 'colour-c-over-b',
    },
    {
      type: 'listen-choice',
      prompt: 'Listen to the lowest notes. Does the bass line fall, rise or stay put?',
      sound: { kind: 'progression', chords: ['C', 'C/B', 'Am', 'Am/G'], beats: 2, tempo: 76 },
      options: [{ text: 'It falls, step by step', correct: true }, { text: 'It rises, step by step' }, { text: 'It stays on one note' }],
      shuffle: false,
      explain: 'That was {c:C}, {c:C/B}, {c:Am}, {c:Am/G}: the bass fell {n:C}, {n:B}, {n:A}, {n:G}.',
    },
    {
      type: 'choice',
      prompt: 'How do you turn {c:Am} (x02210) into {c:Am/G}?',
      options: [
        { text: 'Add {n:G} at fret 3 of string 6', correct: true },
        { text: 'Slide the whole shape up three frets', why: 'That moves every note and makes a new chord. Only the bass should change.' },
        { text: 'Lift the finger on string 2', why: 'That changes a note at the top of the chord, not the bass.' },
      ],
      explain: 'Keep the {c:Am} shape and change only the lowest note: add {n:G} at fret 3 of string 6. Most players mute string 5 (3x2210), though its open {n:A} may ring too.',
      fact: 'colour-slash-shapes',
    },
    {
      type: 'play-chord',
      prompt: 'Play {c:Am/G}: the {c:Am} shape with {n:G} at fret 3 of string 6 and string 5 muted.',
      chord: 'Am/G',
      frets: '3x2210',
      explain: '{c:Am/G} is 3x2210. Reach the {n:G} with your little finger or wrap your thumb over, and let the side of that finger touch string 5 to keep it silent.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'Am/G',
        frets: '3x2210',
        accept: 'any-voicing',
        prompt: 'Build {c:Am/G}: an {c:Am} chord with {n:G} as its lowest note.',
        explain: '{c:Am/G} is 3x2210: the {c:Am} shape on strings 4 to 1 with {n:G} at fret 3 of string 6.',
      },
    },
    {
      type: 'listen-choice',
      prompt: 'A new line: {c:G}, {c:G/B}, {c:C}, {c:D}. Which way does the bass go?',
      sound: { kind: 'progression', chords: ['G', 'G/B', 'C', 'D'], beats: 2, tempo: 76 },
      options: [{ text: 'It falls, step by step' }, { text: 'It rises, step by step', correct: true }, { text: 'It stays on one note' }],
      shuffle: false,
      explain: 'The bass climbed {n:G}, {n:B}, {n:C}, {n:D}: the slash chord {c:G/B} fills the gap between {n:G} and {n:C}.',
    },
    {
      type: 'type-answer',
      prompt: 'The bass goes {n:C}, {n:B}, {n:A}, {n:G}. If it keeps falling by step, which note comes next?',
      answer: { kind: 'note', value: 'F', spelling: 'exact' },
      input: 'keypad',
      explain: 'One letter down from {n:G} is {n:F}: the bass of {c:F}, the chord that often ends this line.',
      fact: 'colour-walking-bass',
    },
  ],
  facts: [
    {
      id: 'colour-walking-bass',
      front: 'How do slash chords make a bass line walk?',
      back: 'The chords change while the bass moves one step at a time: {c:C}, {c:C/B}, {c:Am}, {c:Am/G}, with the bass {n:C} {n:B} {n:A} {n:G}.',
      ask: {
        type: 'order',
        prompt: 'Put these chords in order so that the bass falls one step at a time.',
        tiles: ['{c:C}', '{c:C/B}', '{c:Am}', '{c:Am/G}'],
        explain: 'The bass notes {n:C}, {n:B}, {n:A}, {n:G} fall one step at a time.',
      },
    },
    { id: 'colour-c-over-b', front: 'What else can {c:C/B} be called, and why?', back: '{c:Cmaj7/B}: its bass, {n:B}, is the major 7th of {c:C}.' },
    {
      id: 'colour-slash-shapes',
      front: 'How do guitarists usually play slash chords?',
      back: 'They keep a familiar chord shape and change only the lowest note: {c:Am} (x02210) becomes {c:Am/G} (3x2210).',
    },
  ],
};

/** The pedal figure over open D: D, Dsus4, D, Dsus2, picked one note at a time. */
const D_PEDAL = [2, 3, 2, 0].flatMap((top) => [
  { string: 4, fret: 0, duration: 'e' as const },
  { string: 3, fret: 2, duration: 'e' as const },
  { string: 2, fret: 3, duration: 'e' as const },
  { string: 1, fret: top, duration: 'e' as const },
]);
/** The D figure as a learner reads it: pick the open D once and let it ring while string 1 moves. */
const D_PEDAL_TAB = [
  { string: 4, fret: 0, duration: 'q' as const },
  ...[2, 3, 2].map((fret) => ({ string: 1, fret, duration: 'q' as const })),
  { string: 1, fret: 0, duration: 'h' as const },
];
/** The same over the open A: A, Asus4, A, Asus2, the moving note on string 2. */
const A_PEDAL_TAB = [
  { string: 5, fret: 0, duration: 'q' as const },
  ...[2, 3, 2].map((fret) => ({ string: 2, fret, duration: 'q' as const })),
  { string: 2, fret: 0, duration: 'h' as const },
];

const pedalPoints: Lesson = {
  id: 'pedal-points',
  title: 'Pedal points',
  teaches: 'A pedal point is one note, usually in the bass, held or repeated while the chords above it change.',
  minutes: 3,
  skill: `theory:${U}:pedal-points`,
  steps: [
    {
      type: 'card',
      title: 'One note stays',
      body: 'A {t:pedal-point|pedal point} is one note, usually in the bass, held or repeated while the chords above it change. Open strings make easy pedals. In this figure the open {n:D} string sounds under every chord while string 1 moves: {c:D}, {c:Dsus4}, {c:D}, {c:Dsus2}.',
      figure: { kind: 'tab', tempo: 84, notes: D_PEDAL_TAB, caption: 'Pick the open {n:D} and let it ring while string 1 moves.' },
    },
    {
      type: 'true-false',
      statement: 'In a pedal point, the bass note changes with every chord.',
      answer: false,
      explain: 'The opposite: the pedal note stays put, held or repeated, while the chords above it change.',
      fact: 'colour-pedal-meaning',
    },
    {
      type: 'choice',
      prompt: 'Which note is the pedal in this figure?',
      figure: { kind: 'tab', tempo: 84, notes: D_PEDAL_TAB },
      options: [
        { text: 'The open {n:D} string, the lowest note', correct: true },
        { text: 'The note on string 1', why: 'String 1 is the note that moves: {n:F#}, {n:G}, {n:F#}, {n:E}.' },
        { text: 'None: every note moves', why: 'The open {n:D} comes back under every chord: it is the pedal.' },
      ],
      explain: 'The open {n:D} on string 4 rings under every chord while the top note moves: that low, held note is the pedal.',
      fact: 'colour-pedal-meaning',
    },
    {
      type: 'play-chord',
      prompt: 'Play {c:Dsus4} (xx0233), then {c:D} (xx0232), letting the open {n:D} string ring under both.',
      chord: 'Dsus4',
      frets: 'xx0233',
      explain: '{c:Dsus4} is xx0233: open {n:D}, {n:A} at fret 2 of string 3, {n:D} at fret 3 of string 2 and {n:G} at fret 3 of string 1. The open {n:D} keeps ringing as the top note falls back to {n:F#}.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'Dsus4',
        frets: 'xx0233',
        accept: 'any-voicing',
        prompt: 'Build {c:Dsus4} over the open {n:D} string.',
        explain: '{c:Dsus4} is xx0233: the {c:D} shape with string 1 at fret 3, {n:G}, the 4th.',
      },
    },
    {
      type: 'listen-choice',
      prompt: 'Listen to the bass. Is it held (a pedal) or moving?',
      sound: { kind: 'tab', tempo: 84, notes: D_PEDAL },
      options: [{ text: 'Held: one bass note under every chord', correct: true }, { text: 'Moving: a new bass note for each chord' }],
      shuffle: false,
      explain: 'The open {n:D} came back at the start of every group while the top note moved: a pedal point.',
    },
    {
      type: 'card',
      title: 'Over the open A',
      body: 'The same trick works one string lower. Keep the open {n:A} string ringing while string 2 moves: {c:A} (x02220), {c:Asus4} (x02230), {c:A}, {c:Asus2} (x02200).',
      figure: { kind: 'tab', tempo: 84, notes: A_PEDAL_TAB, caption: 'Pick the open {n:A} and let it ring while string 2 moves.' },
    },
    {
      type: 'choice',
      prompt: 'In this figure over the open {n:A}, which open string is the pedal?',
      figure: { kind: 'tab', tempo: 84, notes: A_PEDAL_TAB },
      options: [
        { text: 'String 5, {n:A}', correct: true },
        { text: 'String 6, {n:E}', why: 'String 6 is not played in this figure.' },
        { text: 'String 4, {n:D}', why: 'In these {c:A} shapes string 4 is held at fret 2, an {n:E}: part of each chord, not the pedal.' },
        { text: 'String 2, {n:B}', why: 'String 2 is the moving voice: {n:C#}, {n:D}, {n:C#}, {n:B}.' },
      ],
      explain: 'The open {n:A} on string 5 sounds under all four chords: the pedal. String 2 is the note that moves.',
      fact: 'colour-pedal-open-strings',
    },
    {
      type: 'listen-choice',
      prompt: 'And this one: is the bass held or moving?',
      sound: { kind: 'progression', chords: ['C', 'C/B', 'Am', 'Am/G'], beats: 2, tempo: 76 },
      options: [{ text: 'Held: one bass note under every chord' }, { text: 'Moving: a new bass note for each chord', correct: true }],
      shuffle: false,
      explain: 'That was the walking line from the last lesson: {n:C}, {n:B}, {n:A}, {n:G}. A moving bass is the opposite of a pedal.',
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the classic pedal figure over the open {n:D}. String 1 goes up to the 4th, then down to the 2nd.',
      text: '{c:D}  ___  {c:D}  ___',
      blanks: ['{c:Dsus4}', '{c:Dsus2}'],
      bank: ['{c:Dm}', '{c:D7}'],
      explain: '{c:D} (xx0232), {c:Dsus4} (xx0233), {c:D}, {c:Dsus2} (xx0230): the 3rd rises to the 4th, comes back, then falls to the 2nd, all over the open {n:D}.',
      fact: 'colour-pedal-d-figure',
    },
  ],
  facts: [
    { id: 'colour-pedal-meaning', front: 'What is a pedal point?', back: 'One note, usually in the bass, held or repeated while the chords above it change.' },
    {
      id: 'colour-pedal-open-strings',
      front: 'Which notes make easy pedals on the guitar?',
      back: 'Open strings: chords can move above the open string 5 ({n:A}) or the open string 4 ({n:D}) while it keeps ringing.',
    },
    {
      id: 'colour-pedal-d-figure',
      front: 'Name a classic guitar pedal figure over the open {n:D} string.',
      back: '{c:D}, {c:Dsus4}, {c:D}, {c:Dsus2} (xx0232, xx0233, xx0232, xx0230), with the open {n:D} ringing under every chord.',
    },
  ],
};

/** Unit 27 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'Sus, add, 6 and slash chords',
  theme: 'chords',
  description: 'Suspended, added-note and sixth chords, slash chords, bass lines and pedal points.',
  lessons: [susChords, addChords, sixthChords, slashChords, walkingBass, pedalPoints],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      {
        type: 'fill-blanks',
        prompt: 'Complete {c:Esus4}.',
        text: '{c:Esus4} = {n:E}  ___  {n:B}',
        blanks: ['{n:A}'],
        bank: ['{n:G#}', '{n:G}', '{n:F#}'],
        explain: 'The 4th above {n:E} is {n:A}: {c:Esus4} is {n:E} {n:A} {n:B}. {n:G#} would be the 3rd of {c:E}, {n:F#} the 2nd of {c:Esus2}.',
      },
      {
        type: 'true-false',
        statement: 'A sus2 chord is a minor chord.',
        answer: false,
        explain: 'A sus2 has no 3rd, so it is neither major nor minor: {c:Asus2} is {n:A} {n:B} {n:E}.',
      },
      {
        type: 'choice',
        prompt: 'Where does {c:Esus4} most often resolve?',
        options: [
          { text: '{c:E}', correct: true },
          { text: '{c:Em}', why: 'The 4th usually falls to the major 3rd, {n:G#}: that gives {c:E}.' },
          { text: '{c:Esus2}', why: 'That swaps one suspension for another; it does not resolve.' },
          { text: '{c:A}', why: 'A sus4 resolves on its own root, {n:E}.' },
        ],
        explain: 'A sus4 usually resolves to the major chord on the same root: {n:A} falls to {n:G#}, and {c:Esus4} becomes {c:E}.',
      },
      {
        type: 'choice',
        prompt: 'Which notes make up {c:E7sus4}?',
        options: [
          { text: '{n:E} {n:A} {n:B} {n:D}', correct: true },
          { text: '{n:E} {n:G#} {n:B} {n:D}', why: 'That is {c:E7}: it keeps the 3rd, {n:G#}.' },
          { text: '{n:E} {n:A} {n:B}', why: 'That is {c:Esus4}: the {d:b7} is missing.' },
          { text: '{n:E} {n:A} {n:B} {n:D#}', why: '{n:D#} is the major 7th; a 7sus4 has the flat 7th, {n:D}.' },
        ],
        explain: 'Root, 4th, 5th and {d:b7}: {n:E} {n:A} {n:B} {n:D}.',
      },
      {
        type: 'choice',
        prompt: 'Which of these chords has a 7th in it?',
        options: [
          { text: '{c:G9}', correct: true },
          { text: '{c:Gadd9}', why: 'An add9 is the triad plus the 9th only: {n:G} {n:B} {n:D} {n:A}.' },
          { text: '{c:G6}', why: '{c:G6} adds the 6th, {n:E}, not a 7th.' },
          { text: '{c:Gsus4}', why: '{c:Gsus4} is {n:G} {n:C} {n:D}: no 7th.' },
        ],
        explain: '{c:G9} is {n:G} {n:B} {n:D} {n:F} {n:A}: the 9th and the {d:b7}. {c:Gadd9} leaves the 7th out.',
      },
      {
        type: 'type-answer',
        prompt: 'Which note does {c:Fadd9} add to the {c:F} triad?',
        answer: { kind: 'note', value: 'G', spelling: 'exact' },
        input: 'keypad',
        explain: 'The 9th above {n:F} is {n:G}: {c:Fadd9} is {n:F} {n:A} {n:C} {n:G}.',
      },
      {
        type: 'true-false',
        statement: '{c:Cadd4} keeps the 3rd of the chord, {n:E}.',
        answer: true,
        explain: 'Add chords keep the triad: {c:Cadd4} is {n:C} {n:E} {n:F} {n:G}. It is {c:Csus4} that drops the {n:E}.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Complete {c:A6}.',
        text: '{c:A6} = {n:A}  {n:C#}  {n:E}  ___',
        blanks: ['{n:F#}'],
        bank: ['{n:F}', '{n:G}', '{n:G#}'],
        explain: 'The major 6th above {n:A} is {n:F#}: {c:A6} is {n:A} {n:C#} {n:E} {n:F#}.',
      },
      {
        type: 'choice',
        prompt: 'Which chord has the same four notes as {c:G6}?',
        options: [
          { text: '{c:Em7}', correct: true },
          { text: '{c:Gmaj7}', why: '{c:Gmaj7} has {n:F#}, not {n:E}.' },
          { text: '{c:Em}', why: '{c:Em} has three notes, {n:E} {n:G} {n:B}: no {n:D}.' },
          { text: '{c:Bm7}', why: '{c:Bm7} is {n:B} {n:D} {n:F#} {n:A}.' },
        ],
        explain: '{c:G6} is {n:G} {n:B} {n:D} {n:E}; {c:Em7} is {n:E} {n:G} {n:B} {n:D}. Same notes: the bass decides the name.',
      },
      {
        type: 'choice',
        prompt: 'Which note does {c:Dm6} add to the {c:Dm} triad?',
        options: [
          { text: '{n:B}', correct: true },
          { text: '{n:Bb}', why: '{n:Bb} is the minor 6th. A minor 6 chord adds the major 6th.' },
          { text: '{n:C}', why: '{n:C} would make {c:Dm7}.' },
          { text: '{n:E}', why: '{n:E} is the 9th above {n:D}, not the 6th.' },
        ],
        explain: 'A minor 6 is a minor triad plus the major 6th: {c:Dm6} is {n:D} {n:F} {n:A} {n:B}.',
      },
      {
        type: 'choice',
        prompt: 'Which notes make up {c:G6/9}?',
        options: [
          { text: '{n:G} {n:B} {n:D} {n:E} {n:A}', correct: true },
          { text: '{n:G} {n:B} {n:D} {n:E}', why: 'That is {c:G6}: the 9th, {n:A}, is missing.' },
          { text: '{n:G} {n:B} {n:D} {n:F} {n:A}', why: 'That is {c:G9}, with the {d:b7} in place of the 6th.' },
        ],
        explain: 'A 6/9 adds the 6th and the 9th to the major triad: {n:G} {n:B} {n:D}, then {n:E} and {n:A}.',
      },
      {
        type: 'choice',
        prompt: 'Which slash chord has a bass note from outside the chord?',
        options: [
          { text: '{c:D/C}', correct: true },
          { text: '{c:D/F#}', why: '{n:F#} is the 3rd of {c:D}: an inversion.' },
          { text: '{c:D/A}', why: '{n:A} is the 5th of {c:D}: second inversion.' },
          { text: '{c:G/B}', why: '{n:B} is the 3rd of {c:G}: an inversion.' },
        ],
        explain: '{n:C} is not in {c:D} ({n:D} {n:F#} {n:A}), so {c:D/C} adds a new bass note, the notes of {c:D7} over {n:C}. The others are inversions.',
      },
      {
        type: 'order',
        prompt: 'Put these chords in order so that the bass falls one step at a time, starting on {n:G}.',
        tiles: ['{c:G}', '{c:G/F#}', '{c:Em}', '{c:Em/D}'],
        explain: 'Their bass notes are {n:G}, {n:F#}, {n:E} and {n:D}: one step down each time, the same idea as {c:C}, {c:C/B}, {c:Am}, {c:Am/G}.',
      },
      {
        type: 'true-false',
        statement: 'In a pedal point, one note stays the same while the chords above it change.',
        answer: true,
        explain: 'That is what a pedal is: one note, usually the bass, held or repeated under changing chords, like the open {n:D} under {c:D}, {c:Dsus4} and {c:Dsus2}.',
      },
      {
        type: 'chord-build',
        task: 'fingers',
        chord: 'Dsus2',
        frets: 'xx0230',
        accept: 'any-voicing',
        prompt: 'Build {c:Dsus2} over the open {n:D} string.',
        explain: '{c:Dsus2} is xx0230: the {c:D} shape with string 1 open, so {n:E}, the 2nd, replaces the 3rd.',
      },
      {
        type: 'listen-choice',
        prompt: 'Does this phrase end suspended or resolved?',
        sound: { kind: 'progression', chords: ['A', 'Asus4', 'A'], beats: 2, tempo: 72 },
        options: [{ text: 'Suspended: it still wants to move' }, { text: 'Resolved: it sounds settled', correct: true }],
        shuffle: false,
        explain: 'It went {c:A}, {c:Asus4}, {c:A}: the 4th fell back to the 3rd, so the phrase ends at rest.',
      },
    ],
  },
};

export default unit;
