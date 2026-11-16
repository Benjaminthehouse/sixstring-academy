/**
 * Theory Path, unit 29: Improvising, notes that fit. Written from the syllabus entries in
 * `src/content/plan/theory-path.json` (unit `improvising-1`), one lesson per entry, in order: each
 * lesson opens with the "on the guitar" picture, asks the planned exercises, ends with the planned
 * drills, and turns every planned fact into a review card.
 *
 * Every fret, note, degree and phrase is cross-checked against `@/core/theory` and `@/core/guitar`
 * in `improvising-1.test.ts`. All phrases are original, in box 1 of A minor pentatonic (frets 5
 * to 8) or the fifth position around it.
 *
 * Notes for readers of the code:
 * - A lesson sound plays one line at a time (no backing band under a melody), so the listening
 *   questions set the harmony first: an arpeggio of the chord, then the line.
 * - The syllabus asks the learner to "play your own answer" to a call. A free answer cannot be
 *   checked by the microphone, so the play step gives an answer to play and invites the learner to
 *   invent more; the lesson's other questions ask what makes an answer sound finished.
 */
import type { Lesson, TabNote, Unit } from '@/lessons';

const U = 'improvising-1';

type Dur = 'w' | 'h' | 'q' | 'e';
const n = (string: number, fret: number, duration: Dur): TabNote => ({ string, fret, duration });
const rest = (duration: Dur): TabNote => ({ rest: true, duration });

/** Box 1 of A minor pentatonic (frets 5 to 8), low to high, as plain positions. */
const BOX_1: Array<{ string: number; fret: number }> = [
  { string: 6, fret: 5 }, { string: 6, fret: 8 }, { string: 5, fret: 5 }, { string: 5, fret: 7 }, { string: 4, fret: 5 }, { string: 4, fret: 7 },
  { string: 3, fret: 5 }, { string: 3, fret: 7 }, { string: 2, fret: 5 }, { string: 2, fret: 8 }, { string: 1, fret: 5 }, { string: 1, fret: 8 },
];

/** A major arpeggio from string 6, fret 5, up and back. */
const A_ARPEGGIO = [n(6, 5, 'q'), n(5, 4, 'q'), n(5, 7, 'q'), n(4, 7, 'q'), n(5, 7, 'q'), n(5, 4, 'q'), n(6, 5, 'h')];
/** A minor arpeggio, one octave up. */
const AM_ARPEGGIO = [n(6, 5, 'q'), n(6, 8, 'q'), n(5, 7, 'q'), n(4, 7, 'q')];
/** Open Am (x02210) picked low to high: sets the harmony before a line. */
const AM_CHORD = [n(5, 0, 'e'), n(4, 2, 'e'), n(3, 2, 'e'), n(2, 1, 'e'), rest('h')];
/** Over Am then Dm: chord tones on beats 1 and 3 (A, C | D, F), passing notes between. */
const STRONG_LINE = [n(4, 7, 'q'), n(3, 4, 'q'), n(3, 5, 'q'), n(3, 4, 'q'), n(3, 7, 'q'), n(2, 5, 'q'), n(2, 6, 'h')];
/** Over Am: non-chord tones (B, D) on beats 1 and 3, each stepping to a chord tone. */
const WEAK_LINE = [n(3, 4, 'q'), n(4, 7, 'q'), n(3, 7, 'q'), n(3, 5, 'q')];
/** Over A7 then D7: C# (3rd of A7) falls a half step to C (b7 of D7) on beat 1. */
const TARGET_LINE = [n(2, 5, 'q'), n(3, 6, 'q'), n(4, 7, 'q'), n(3, 6, 'q'), n(3, 5, 'w')];
/** The motif: A C D, short-short-long. */
const MOTIF = [n(4, 7, 'e'), n(3, 5, 'e'), n(3, 7, 'q')];
/** The motif one box note higher: C D E. */
const SEQUENCE = [n(3, 5, 'e'), n(3, 7, 'e'), n(2, 5, 'q')];
/** The motif with a new ending: A C G. */
const NEW_ENDING = [n(4, 7, 'e'), n(3, 5, 'e'), n(4, 5, 'q')];
/** The motif's notes in a new rhythm: long-short-short. */
const NEW_RHYTHM = [n(4, 7, 'q'), n(3, 5, 'e'), n(3, 7, 'e')];
/** Two bars ending on D (string 3, fret 7), a non-chord tone over Am: a question. */
const CALL = [n(4, 7, 'e'), n(3, 5, 'e'), n(3, 7, 'q'), n(3, 5, 'q'), n(4, 7, 'q'), n(3, 5, 'q'), n(3, 7, 'h'), rest('q')];
/** Two bars ending on A (string 4, fret 7) on beat 1: an answer. */
const ANSWER = [n(4, 7, 'e'), n(3, 5, 'e'), n(3, 7, 'q'), n(3, 5, 'q'), n(4, 5, 'q'), n(4, 7, 'w')];

const arpeggios: Lesson = {
  id: 'arpeggios',
  title: 'Arpeggios',
  teaches: 'An arpeggio is a chord played one note at a time, which turns chord tones into a melody.',
  minutes: 3,
  skill: `theory:${U}:arpeggios`,
  steps: [
    {
      type: 'card',
      title: 'A chord, one note at a time',
      body: 'An {t:arpeggio} is a chord played one note at a time. Over a chord, its arpeggio is a ready-made melody of chord tones. Here is {c:A} from string 6, fret 5: the root, the 3rd ({n:C#}), the 5th ({n:E}) and the root again, an octave up.',
      figure: {
        kind: 'fretboard',
        frets: [4, 8],
        root: 'A',
        labels: 'degree',
        dots: [
          { string: 6, fret: 5, note: 'A2', degree: '1', role: 'root' },
          { string: 5, fret: 4, note: 'C#3', degree: '3', role: 'third' },
          { string: 5, fret: 7, note: 'E3', degree: '5', role: 'fifth' },
          { string: 4, fret: 7, note: 'A3', degree: '8', label: '8', role: 'root' },
        ],
        caption: 'One octave of {c:A}: {d:1} {d:3} {d:5} and 8, the root again.',
      },
    },
    {
      type: 'play-phrase',
      prompt: 'Play the {c:A} arpeggio up from string 6, fret 5, and back down.',
      notes: A_ARPEGGIO,
      octave: 'exact',
      tempo: 76,
      explain: '{n:A} {n:C#} {n:E} {n:A}, then back down {n:E} {n:C#} {n:A}. Keep your hand in one place: first finger on fret 4, second on fret 5, third and fourth for fret 7.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap the four notes of the {c:A} arpeggio on strings 6 to 4, frets 4 to 7.',
        find: { chord: 'A' },
        mode: 'all',
        octave: 'any',
        frets: [4, 7],
        strings: [6, 5, 4],
        explain: 'String 6 fret 5 ({n:A}), string 5 frets 4 and 7 ({n:C#}, {n:E}) and string 4 fret 7 ({n:A}): {d:1} {d:3} {d:5} 8.',
      },
    },
    {
      type: 'fretboard-find',
      prompt: 'Now {c:C}: tap every note of the {c:C} chord on strings 5 to 3, frets 3 to 7. The root is at string 5, fret 3.',
      find: { chord: 'C' },
      mode: 'all',
      octave: 'any',
      frets: [3, 7],
      strings: [5, 4, 3],
      explain: 'String 5 frets 3 and 7 ({n:C} and {n:E}), string 4 fret 5 ({n:G}) and string 3 fret 5 ({n:C}): one octave of the {c:C} arpeggio, root, 3rd, 5th and root.',
      fact: 'improvising-arpeggio-formulas',
    },
    {
      type: 'card',
      title: 'Minor: move the 3rd',
      body: 'A minor arpeggio is {d:1} {d:b3} {d:5}: the 3rd comes down a half step. For {c:Am}, the {n:C#} on string 5, fret 4 becomes {n:C}, easiest to reach at string 6, fret 8. Same root, same 5th, a darker colour.',
      figure: {
        kind: 'fretboard',
        frets: [4, 8],
        root: 'A',
        labels: 'degree',
        dots: [
          { string: 6, fret: 5, note: 'A2', degree: '1', role: 'root' },
          { string: 6, fret: 8, note: 'C3', degree: 'b3', role: 'third' },
          { string: 5, fret: 7, note: 'E3', degree: '5', role: 'fifth' },
          { string: 4, fret: 7, note: 'A3', degree: '8', label: '8', role: 'root' },
        ],
        caption: 'One octave of {c:Am}: {d:1} {d:b3} {d:5} and 8.',
      },
    },
    {
      type: 'listen-choice',
      prompt: 'Is this a major or a minor arpeggio?',
      sound: { kind: 'tab', tempo: 80, notes: AM_ARPEGGIO },
      options: [{ text: 'Major' }, { text: 'Minor', correct: true }],
      shuffle: false,
      explain: 'That was {c:Am}: {n:A} {n:C} {n:E} {n:A}. The 3rd, {n:C}, is three half steps above the root, a minor 3rd.',
    },
    {
      type: 'choice',
      prompt: 'Which degrees make a minor arpeggio?',
      options: [
        { text: '{d:1} {d:b3} {d:5}', correct: true },
        { text: '{d:1} {d:3} {d:5}', why: 'That is the major arpeggio: its 3rd is not lowered.' },
        { text: '{d:1} {d:b3} {d:b5}', why: 'A lowered 5th as well makes a diminished arpeggio.' },
        { text: '{d:1} {d:4} {d:5}', why: 'That is a sus4: no 3rd at all.' },
      ],
      explain: 'Major is {d:1} {d:3} {d:5}; minor lowers the 3rd: {d:1} {d:b3} {d:5}. Both add 8, the root an octave up, to finish the shape.',
      fact: 'improvising-arpeggio-formulas',
    },
    {
      type: 'true-false',
      statement: 'An arpeggio is a scale played quickly.',
      answer: false,
      explain: 'An arpeggio uses only the notes of a chord, one at a time: {c:A} gives {n:A} {n:C#} {n:E}. A scale walks through every note of the key.',
      fact: 'improvising-arpeggio-meaning',
    },
    { generate: 'neck-tones', params: { what: 'chord', chords: ['A', 'Am', 'C', 'G', 'E', 'Em', 'D', 'Dm'], span: 4, strings: [6, 5, 4] } },
    { generate: 'chord-tones', params: { types: ['major', 'minor'], roots: ['A', 'C', 'G', 'E', 'D'], ask: 'notes' } },
  ],
  facts: [
    { id: 'improvising-arpeggio-meaning', front: 'What is an arpeggio?', back: 'A chord played one note at a time.' },
    {
      id: 'improvising-arpeggio-formulas',
      front: 'Which degrees make a major arpeggio, and a minor one?',
      back: 'Major: {d:1} {d:3} {d:5} (and 8, the octave). Minor: {d:1} {d:b3} {d:5} (and 8).',
    },
    {
      id: 'improvising-arpeggio-a-shape',
      front: 'Where is one octave of {c:A} from string 6, fret 5? And of {c:Am}?',
      back: '{c:A}: string 6 fret 5, string 5 frets 4 and 7, string 4 fret 7. For {c:Am}, the 3rd moves to string 6, fret 8.',
      ask: {
        type: 'fretboard-find',
        prompt: 'Tap the four notes of the {c:Am} arpeggio on strings 6 to 4, frets 5 to 8.',
        find: { chord: 'Am' },
        mode: 'all',
        octave: 'any',
        frets: [5, 8],
        strings: [6, 5, 4],
        explain: 'String 6 frets 5 and 8 ({n:A}, {n:C}), string 5 fret 7 ({n:E}) and string 4 fret 7 ({n:A}).',
      },
    },
  ],
};

const seventhArpeggios: Lesson = {
  id: 'seventh-arpeggios',
  title: 'Seventh-chord arpeggios',
  teaches: 'A seventh arpeggio adds the 7th, and over a chord its own arpeggio gives the most "inside" notes.',
  minutes: 3,
  skill: `theory:${U}:seventh-arpeggios`,
  steps: [
    {
      type: 'card',
      title: 'Add the 7th',
      body: 'A seventh arpeggio adds the 7th to the triad. {c:Am7} is {n:A} {n:C} {n:E} {n:G}. Now look at box 1 of {n:A} minor pentatonic: four of its five notes are {c:Am7}. Only {n:D} is left over.',
      figure: {
        kind: 'fretboard',
        frets: [5, 8],
        root: 'A',
        labels: 'degree',
        dots: [
          { string: 6, fret: 5, note: 'A', degree: '1', role: 'root' },
          { string: 6, fret: 8, note: 'C', degree: 'b3', role: 'third' },
          { string: 5, fret: 5, note: 'D', degree: '4', role: 'ghost' },
          { string: 5, fret: 7, note: 'E', degree: '5', role: 'fifth' },
          { string: 4, fret: 5, note: 'G', degree: 'b7', role: 'seventh' },
          { string: 4, fret: 7, note: 'A', degree: '1', role: 'root' },
          { string: 3, fret: 5, note: 'C', degree: 'b3', role: 'third' },
          { string: 3, fret: 7, note: 'D', degree: '4', role: 'ghost' },
          { string: 2, fret: 5, note: 'E', degree: '5', role: 'fifth' },
          { string: 2, fret: 8, note: 'G', degree: 'b7', role: 'seventh' },
          { string: 1, fret: 5, note: 'A', degree: '1', role: 'root' },
          { string: 1, fret: 8, note: 'C', degree: 'b3', role: 'third' },
        ],
        caption: 'Box 1: {c:Am7} in colour, the two {n:D}s faded.',
      },
    },
    {
      type: 'fretboard-find',
      prompt: 'Box 1 is marked. Tap every note in it that is not in {c:Am7}.',
      find: { note: 'D' },
      mode: 'all',
      octave: 'any',
      frets: [5, 8],
      shown: BOX_1.map((p) => ({ ...p, role: 'tone' as const })),
      explain: 'The two {n:D}s, string 5 fret 5 and string 3 fret 7. Every other note of the box is {n:A}, {n:C}, {n:E} or {n:G}: the {c:Am7} arpeggio.',
      fact: 'improvising-am7-in-pentatonic',
    },
    {
      type: 'type-answer',
      prompt: 'Type the four notes of {c:Dm7}, from the root up.',
      answer: { kind: 'text', value: 'D F A C', accept: ['DFAC', 'Re Fa La Do'] },
      input: 'keyboard',
      explain: '{c:Dm7} is root, minor 3rd, 5th and minor 7th: {n:D} {n:F} {n:A} {n:C}.',
      fact: 'improvising-seventh-arpeggio',
    },
    {
      type: 'card',
      title: 'The most inside notes',
      body: 'Over a chord, its own arpeggio gives the most stable notes you can play: they are the chord itself. Over {c:Am7}, every {n:A}, {n:C}, {n:E} and {n:G} in the box fits; {n:D} adds colour on the way between them.',
      figure: {
        kind: 'audio',
        sound: { kind: 'tab', tempo: 80, notes: [n(6, 5, 'e'), n(6, 8, 'e'), n(5, 7, 'e'), n(4, 5, 'e'), n(4, 7, 'e'), n(3, 5, 'e'), n(2, 5, 'e'), n(2, 8, 'e'), n(1, 5, 'w')] },
        label: 'Hear the {c:Am7} arpeggio',
      },
    },
    {
      type: 'true-false',
      statement: 'Over {c:Am7}, the notes of the {c:Am7} arpeggio are the most stable notes you can play.',
      answer: true,
      explain: 'They are the chord itself: {n:A} {n:C} {n:E} {n:G}. Any of them can sit on a strong beat or end a phrase and sound at home.',
      fact: 'improvising-own-arpeggio',
    },
    {
      type: 'play-phrase',
      prompt: 'Over {c:Am7}: climb its arpeggio in box 1, then end on {n:G}.',
      notes: [n(6, 5, 'q'), n(6, 8, 'q'), n(5, 7, 'q'), n(4, 5, 'q'), n(3, 5, 'q'), n(3, 7, 'q'), n(4, 5, 'h')],
      octave: 'exact',
      tempo: 72,
      explain: '{n:A} {n:C} {n:E} {n:G}, then {n:C} and {n:D} and back to a long {n:G}: the 7th of {c:Am7}, a chord tone with an open sound to end on.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap every note of {c:Am7} in box 1, frets 5 to 8.',
        find: { chord: 'Am7' },
        mode: 'all',
        octave: 'any',
        frets: [5, 8],
        explain: 'Ten notes: every note of box 1 except the two {n:D}s. {c:Am7} is {n:A} {n:C} {n:E} {n:G}.',
      },
    },
    {
      type: 'choice',
      prompt: 'Which note turns the {c:Am} arpeggio into {c:Am7}?',
      options: [
        { text: '{n:G}', correct: true },
        { text: '{n:G#}', why: '{n:G#} is the major 7th: {n:A} {n:C} {n:E} {n:G#} is a minor-major 7 chord.' },
        { text: '{n:F}', why: '{n:F} is the minor 6th above {n:A}, not a 7th.' },
        { text: '{n:D}', why: '{n:D} is the 4th: in the scale, but not in the chord.' },
      ],
      explain: 'A minor 7 chord adds the minor 7th, ten half steps above the root: {n:G} above {n:A}.',
      fact: 'improvising-seventh-arpeggio',
    },
    { generate: 'chord-tones', params: { types: ['m7', '7', 'maj7'], roots: ['A', 'D', 'E', 'G', 'C'], ask: 'notes' } },
    { generate: 'neck-tones', params: { what: 'chord', chords: ['Am7', 'Dm7', 'Em7', 'G7', 'Cmaj7'], span: 4, strings: [6, 5, 4] } },
  ],
  facts: [
    {
      id: 'improvising-seventh-arpeggio',
      front: 'What does a seventh arpeggio add? Spell {c:Am7}.',
      back: 'The 7th, on top of the triad: {c:Am7} is {n:A} {n:C} {n:E} {n:G}.',
    },
    {
      id: 'improvising-own-arpeggio',
      front: 'Over a chord, which notes are the most stable you can play?',
      back: 'The notes of its own arpeggio: its root, 3rd, 5th and 7th.',
    },
    {
      id: 'improvising-am7-in-pentatonic',
      front: 'How does {n:A} minor pentatonic relate to {c:Am7}?',
      back: 'It contains the whole {c:Am7} arpeggio ({n:A} {n:C} {n:E} {n:G}) plus {n:D}.',
    },
  ],
};

const chordTonesOnStrongBeats: Lesson = {
  id: 'chord-tones-on-strong-beats',
  title: 'Chord tones on strong beats',
  teaches: 'Chord tones on the strong beats, other scale notes between them: that makes a line outline the chords.',
  minutes: 3,
  skill: `theory:${U}:chord-tones-on-strong-beats`,
  steps: [
    {
      type: 'card',
      title: 'Stable and passing',
      body: '{t:chord-tone|Chord tones}, the 1, 3, 5 and 7 of the chord being played, sound stable. Other scale notes sound like passing colour. So line them up with the beat: chord tones on the {t:strong-beat|strong beats}, 1 and 3 in 4/4, other notes between. This line lands on {n:A} and {n:C} over {c:Am}, then {n:D} and {n:F} over {c:Dm}.',
      figure: { kind: 'tab', tempo: 80, notes: STRONG_LINE, caption: 'Bar 1 over {c:Am}, bar 2 over {c:Dm}: chord tones on beats 1 and 3.' },
    },
    {
      type: 'choice',
      prompt: 'Over {c:Dm}, which of these notes is a chord tone?',
      options: [
        { text: '{n:F}', correct: true },
        { text: '{n:E}', why: '{n:E} is in the scale, but {c:Dm} is {n:D} {n:F} {n:A}.' },
        { text: '{n:G}', why: '{n:G} is the 4th above {n:D}: a passing note over this chord.' },
      ],
      explain: '{c:Dm} is {n:D} {n:F} {n:A}. {n:F}, its minor 3rd, is the chord tone; {n:E} and {n:G} are passing notes.',
      fact: 'improvising-chord-tones-stable',
    },
    {
      type: 'listen-choice',
      prompt: 'Each line follows an {c:Am} chord. Which line puts chord tones on beats 1 and 3?',
      sound: { kind: 'tab', tempo: 80, notes: [...AM_CHORD, ...STRONG_LINE.slice(0, 4), ...AM_CHORD, ...WEAK_LINE] },
      options: [{ text: 'The first line', correct: true }, { text: 'The second line' }],
      shuffle: false,
      explain: 'The first line put {n:A} and {n:C} on beats 1 and 3: it sat on the chord. The second put {n:B} and {n:D} there, so each strong beat leaned until it stepped to a chord tone.',
    },
    {
      type: 'true-false',
      statement: 'A note outside the chord on a strong beat sounds tense, and usually moves by step to a chord tone.',
      answer: true,
      explain: 'On a strong beat a non-chord tone stands out and pulls. Stepping to the nearest chord tone, as {n:B} to {n:A} or {n:D} to {n:C} over {c:Am}, releases it.',
      fact: 'improvising-strong-beat-tension',
    },
    {
      type: 'fretboard-find',
      prompt: 'Over {c:Am}, tap every chord tone in box 1, frets 5 to 8.',
      find: { chord: 'Am' },
      mode: 'all',
      octave: 'any',
      frets: [5, 8],
      explain: 'Every {n:A}, {n:C} and {n:E} in the box: eight safe landing places for beats 1 and 3.',
      fact: 'improvising-chord-tones-stable',
    },
    {
      type: 'play-phrase',
      prompt: 'Over {c:Am}: chord tones on beats 1 and 3 ({n:C}, {n:E}), then {n:A}.',
      notes: [n(3, 5, 'e'), n(3, 7, 'e'), n(3, 5, 'e'), n(4, 7, 'e'), n(2, 5, 'q'), n(3, 7, 'q'), n(4, 7, 'h')],
      octave: 'exact',
      tempo: 70,
      explain: 'Count "1 & 2 & 3 4": {n:C} on 1, {n:E} on 3 and {n:A} on the next 1, all chord tones of {c:Am}. The {n:D}s fall between them, on the "&" of 1 and on beat 4.',
      alternative: {
        type: 'choice',
        prompt: 'Over {c:Am}, which note could sit on beat 3 so that the line follows the chord?',
        options: [
          { text: '{n:E}', correct: true },
          { text: '{n:D}', why: '{n:D} is not in {c:Am}: on beat 3 it would sound tense.' },
          { text: '{n:B}', why: '{n:B} is not in {c:Am} ({n:A} {n:C} {n:E}).' },
          { text: '{n:F}', why: '{n:F} is not in {c:Am}, and not in {n:A} minor pentatonic either.' },
        ],
        explain: '{n:E} is the 5th of {c:Am}: a chord tone, so it sounds stable on a strong beat.',
      },
    },
    {
      type: 'fill-blanks',
      prompt: 'Over {c:Dm}, make beat 3 a chord tone.',
      text: 'Beats 1 2 3 4:  {n:D}  {n:E}  ___  {n:E}',
      blanks: ['{n:F}'],
      bank: ['{n:G}', '{n:B}'],
      explain: '{c:Dm} is {n:D} {n:F} {n:A}: {n:F} on beat 3 keeps the line on the chord, with the passing {n:E} on beats 2 and 4.',
      fact: 'improvising-strong-beats',
    },
    { generate: 'chord-tones', params: { types: ['minor', 'major', 'm7'], roots: ['A', 'D', 'E', 'G', 'C'], ask: 'tone' } },
  ],
  facts: [
    {
      id: 'improvising-chord-tones-stable',
      front: 'Which notes sound stable over a chord, and how do the others sound?',
      back: 'Its chord tones, the 1, 3, 5 and 7 of the chord being played. Other scale notes sound like passing colour.',
    },
    {
      id: 'improvising-strong-beats',
      front: 'Where do the chord tones go to make a line follow the chords?',
      back: 'On the strong beats, 1 and 3 in 4/4, with other scale notes between them.',
    },
    {
      id: 'improvising-strong-beat-tension',
      front: 'How does a note outside the chord sound on a strong beat?',
      back: 'Tense. It usually moves by step to a chord tone.',
    },
  ],
};

const targetNotes: Lesson = {
  id: 'target-notes',
  title: 'Aiming at the change',
  teaches: 'A target note is a chord tone you aim to land on as the chord changes, and the 3rd is the strongest target.',
  minutes: 4,
  skill: `theory:${U}:target-notes`,
  steps: [
    {
      type: 'card',
      title: 'Aim for the change',
      body: 'A {t:target-note|target note} is a chord tone you aim to land on just as the chord changes. The strongest target is the 3rd of the new chord: it tells the ear at once whether that chord is major or minor. Going from {c:A7} to {c:D7}, aim for {n:F#}, the 3rd of {c:D7}.',
      figure: {
        kind: 'fretboard',
        frets: [3, 7],
        dots: [
          { string: 3, fret: 6, note: 'C#', label: 'C#', role: 'third' },
          { string: 4, fret: 4, note: 'F#', role: 'target' },
          { string: 2, fret: 7, note: 'F#', role: 'target' },
          { string: 3, fret: 5, note: 'C', role: 'seventh' },
        ],
        caption: '{n:C#}: 3rd of {c:A7}. {n:F#}: 3rd of {c:D7}. {n:C}: {d:b7} of {c:D7}.',
      },
    },
    {
      type: 'fretboard-find',
      prompt: 'Between frets 2 and 7, tap every {n:F#}: the 3rd of {c:D7}.',
      find: { note: 'F#' },
      mode: 'all',
      octave: 'any',
      frets: [2, 7],
      explain: 'Four: string 6 fret 2, string 4 fret 4, string 2 fret 7 and string 1 fret 2. Know where they are before the {c:D7} arrives.',
      fact: 'improvising-target-note',
    },
    {
      type: 'choice',
      prompt: 'The chord changes to {c:E7}. Which note marks the change most clearly?',
      options: [
        { text: '{n:G#}', correct: true },
        { text: '{n:E}', why: 'The root is safe, but it does not say whether the chord is major or minor.' },
        { text: '{n:B}', why: 'The 5th is the same in {c:E} and {c:Em}, so it tells the ear little.' },
      ],
      explain: '{n:G#} is the 3rd of {c:E7}: it says "major" at once, and it is a half step from {n:G}, the 3rd of a minor chord.',
      fact: 'improvising-third-strongest',
    },
    {
      type: 'card',
      title: 'A half step says it all',
      body: 'Hold {n:C#} at string 3, fret 6 over {c:A7}: its 3rd. When the chord changes to {c:D7}, let it fall one fret to {n:C}, the {d:b7} of {c:D7}. One finger, one fret, and the change is unmistakable.',
      figure: { kind: 'tab', tempo: 80, notes: TARGET_LINE, caption: 'Bar 1 over {c:A7}, bar 2 over {c:D7}: {n:C#} falls to {n:C} on beat 1.' },
    },
    {
      type: 'play-phrase',
      prompt: 'Over {c:A7} then {c:D7}: play this line and land on {n:C}, string 3 fret 5, on beat 1 of the {c:D7} bar.',
      notes: TARGET_LINE,
      octave: 'exact',
      tempo: 72,
      explain: '{n:E} {n:C#} {n:A} {n:C#} over {c:A7}, all chord tones, then {n:C} right on the change: the {d:b7} of {c:D7}, a half step below the {n:C#} you just played.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap the note that lands on beat 1 of the {c:D7} bar: the {n:C} a half step below the {n:C#} at string 3, fret 6.',
        find: { note: 'C4' },
        mode: 'one',
        octave: 'exact',
        frets: [4, 8],
        explain: 'String 3, fret 5: {n:C}, the {d:b7} of {c:D7}, one fret below the {n:C#} of {c:A7}.',
      },
    },
    {
      type: 'true-false',
      statement: 'Over {c:A7} to {c:D7}, the 3rd of {c:A7}, {n:C#}, falls a half step to {n:C}, the {d:b7} of {c:D7}.',
      answer: true,
      explain: '{c:A7} is {n:A} {n:C#} {n:E} {n:G}; {c:D7} is {n:D} {n:F#} {n:A} {n:C}. {n:C#} to {n:C} is one fret: the smallest move that still changes the sound.',
      fact: 'improvising-a7-d7-half-step',
    },
    {
      type: 'fretboard-find',
      prompt: 'Between frets 4 and 7, tap every {n:G#}: the 3rd of {c:E7}.',
      find: { note: 'G#' },
      mode: 'all',
      octave: 'any',
      frets: [4, 7],
      explain: 'Three: string 6 fret 4, string 4 fret 6 and string 1 fret 4. Land on one as {c:E7} arrives.',
      fact: 'improvising-third-strongest',
    },
    { generate: 'chord-tones', params: { types: ['7', 'major', 'minor'], roots: ['A', 'D', 'E', 'G', 'C'], ask: 'tone' } },
  ],
  facts: [
    {
      id: 'improvising-target-note',
      front: 'What is a target note?',
      back: 'A chord tone you aim to land on at the moment the chord changes.',
    },
    {
      id: 'improvising-third-strongest',
      front: 'Why is the 3rd the strongest target note?',
      back: 'It tells the ear whether the new chord is major or minor.',
      ask: {
        type: 'choice',
        prompt: 'The chord changes to {c:Dm}. Which note says "minor" most clearly?',
        options: [
          { text: '{n:F}', correct: true },
          { text: '{n:D}', why: 'The root is the same in {c:D} and {c:Dm}.' },
          { text: '{n:A}', why: 'The 5th is the same in {c:D} and {c:Dm}.' },
        ],
        explain: '{n:F} is the minor 3rd of {c:Dm}; {c:D} major would have {n:F#}.',
      },
    },
    {
      id: 'improvising-a7-d7-half-step',
      front: 'Over {c:A7} to {c:D7}, which small move marks the change?',
      back: '{n:C#}, the 3rd of {c:A7}, down a half step to {n:C}, the {d:b7} of {c:D7}: string 3, fret 6 to fret 5.',
    },
  ],
};

const motifs: Lesson = {
  id: 'motifs',
  title: 'Motifs',
  teaches: 'A motif is a short idea that you repeat and develop, which makes a solo sound composed rather than random.',
  minutes: 3,
  skill: `theory:${U}:motifs`,
  steps: [
    {
      type: 'card',
      title: 'A short idea',
      body: 'A {t:motif} is a short musical idea, a few notes or a rhythm, that you repeat and develop. Here is one in box 1: {n:A}, {n:C}, {n:D}, short-short-long. Play it, rest, play it again: already it sounds like a tune, not a scale.',
      figure: { kind: 'tab', tempo: 84, notes: [...MOTIF, rest('h'), ...MOTIF, rest('h')], caption: 'The motif, twice: {n:A} {n:C} {n:D}.' },
    },
    {
      type: 'card',
      title: 'Four ways to develop it',
      body: '**Repeat** it. Move it to other notes of the scale, keeping its shape: a {t:melodic-sequence|sequence}. **Change its rhythm.** Or keep its start and **change its ending**. A solo built from one or two motifs, developed like this, sounds composed rather than random.',
      figure: { kind: 'tab', tempo: 84, notes: [...MOTIF, ...MOTIF, ...SEQUENCE, ...NEW_RHYTHM], caption: 'Original, repeat, sequence one box note up, new rhythm.' },
    },
    {
      type: 'choice',
      prompt: 'The motif is {n:A} {n:C} {n:D}. Which is a sequence of it, starting one box note higher?',
      options: [
        { text: '{n:C} {n:D} {n:E}', correct: true },
        { text: '{n:A} {n:C} {n:D}', why: 'The same notes again: that is a repeat.' },
        { text: '{n:A} {n:C} {n:G}', why: 'Same start, new last note: that is a new ending.' },
        { text: '{n:D} {n:C} {n:A}', why: 'That plays the motif backwards: a new idea, not a sequence.' },
      ],
      explain: 'A sequence keeps the shape and moves it: each note steps up to the next note of the box. {n:A} {n:C} {n:D} becomes {n:C} {n:D} {n:E}.',
      fact: 'improvising-motif-develop',
    },
    {
      type: 'listen-choice',
      prompt: 'A motif, then a second phrase. Was the second a repeat, a sequence or a new idea?',
      sound: { kind: 'tab', tempo: 84, notes: [...MOTIF, rest('h'), ...SEQUENCE, rest('h')] },
      options: [{ text: 'A repeat' }, { text: 'A sequence', correct: true }, { text: 'A new idea' }],
      shuffle: false,
      explain: 'Same rhythm, same shape, one box note higher: {n:A} {n:C} {n:D}, then {n:C} {n:D} {n:E}. That is a sequence.',
    },
    {
      type: 'order',
      prompt: 'This tab plays the motif four ways. Put their names in the order played.',
      figure: { kind: 'tab', tempo: 84, notes: [...MOTIF, ...SEQUENCE, ...NEW_ENDING, ...MOTIF] },
      tiles: ['Original', 'Sequence', 'New ending', 'Repeat'],
      explain: '{n:A} {n:C} {n:D} (the original), {n:C} {n:D} {n:E} (a sequence), {n:A} {n:C} {n:G} (a new ending), then {n:A} {n:C} {n:D} again (a repeat).',
      fact: 'improvising-motif-develop',
    },
    {
      type: 'play-phrase',
      prompt: 'Play the motif, then its sequence one box note higher.',
      notes: [...MOTIF, ...SEQUENCE, rest('h')],
      octave: 'exact',
      tempo: 76,
      explain: '{n:A} {n:C} {n:D}, then {n:C} {n:D} {n:E}: the same short-short-long, one step up the box. Your fingers make the same small move each time.',
      alternative: {
        type: 'order',
        prompt: 'The motif is {n:A} {n:C} {n:D}. Put the notes of its sequence, one box note higher, in order.',
        tiles: ['{n:C}', '{n:D}', '{n:E}'],
        distractors: ['{n:A}'],
        explain: 'Each note moves to the next note of the box: {n:A} to {n:C}, {n:C} to {n:D}, {n:D} to {n:E}.',
      },
    },
    {
      type: 'listen-choice',
      prompt: 'And this second phrase: a repeat, a sequence or a new idea?',
      sound: { kind: 'tab', tempo: 84, notes: [...MOTIF, rest('h'), n(2, 8, 'q'), n(2, 5, 'e'), n(1, 5, 'e'), rest('h')] },
      options: [{ text: 'A repeat' }, { text: 'A sequence' }, { text: 'A new idea', correct: true }],
      shuffle: false,
      explain: 'The second phrase, {n:G} {n:E} {n:A}, had new notes, a new direction and a new rhythm: a new idea.',
    },
    {
      type: 'true-false',
      statement: 'A solo built from one or two developed motifs tends to sound more composed than a string of unrelated notes.',
      answer: true,
      explain: 'Repeating and developing an idea gives the listener something to follow, the way a story keeps coming back to its characters.',
      fact: 'improvising-motif-composed',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each way of developing a motif with what stays the same.',
      pairs: [
        { left: 'Repeat', right: 'Everything' },
        { left: 'Sequence', right: 'Its shape and rhythm' },
        { left: 'New rhythm', right: 'Its notes' },
        { left: 'New ending', right: 'Its first notes' },
      ],
      explain: 'A repeat keeps everything; a sequence keeps the shape and rhythm on new notes; a new rhythm keeps the notes; a new ending keeps the start.',
      fact: 'improvising-motif-develop',
    },
  ],
  facts: [
    {
      id: 'improvising-motif-meaning',
      front: 'What is a motif?',
      back: 'A short musical idea, a few notes or a rhythm, that is repeated and developed.',
    },
    {
      id: 'improvising-motif-develop',
      front: 'Name four ways to develop a motif.',
      back: 'Repeat it; move it to other notes (a sequence); change its rhythm; change its ending.',
    },
    {
      id: 'improvising-motif-composed',
      front: 'What does building a solo from motifs do?',
      back: 'A solo built from one or two developed motifs sounds composed rather than random.',
    },
  ],
};

const callAndResponse: Lesson = {
  id: 'call-and-response',
  title: 'Call and response, and space',
  teaches: 'Pairing a phrase with an answer, with rests between phrases, gives a solo shape and makes it easy to follow.',
  minutes: 3,
  skill: `theory:${U}:call-and-response`,
  steps: [
    {
      type: 'card',
      title: 'The call',
      body: '{t:call-and-response|Call and response} pairs a phrase, the call, with an answering phrase. This two-bar call ends on {n:D} at string 3, fret 7. Over {c:Am}, {n:D} is not a chord tone, so the phrase sounds unfinished, like a question.',
      figure: { kind: 'tab', tempo: 84, notes: CALL, caption: 'The call: it stops on {n:D}, string 3, fret 7.' },
    },
    {
      type: 'card',
      title: 'The answer',
      body: 'Leave a bar of rest, then answer. This answer starts like the call but comes home to {n:A}, the root, right on beat 1. A chord tone on a strong beat sounds finished.',
      figure: { kind: 'tab', tempo: 84, notes: ANSWER, caption: 'The answer: it lands on {n:A}, string 4, fret 7, on beat 1.' },
    },
    {
      type: 'listen-choice',
      prompt: 'Two phrases over {c:Am}. Which one sounds like a question, waiting for an answer?',
      sound: { kind: 'tab', tempo: 84, notes: [...AM_CHORD, ...ANSWER, rest('w'), ...CALL] },
      options: [{ text: 'The first' }, { text: 'The second', correct: true }],
      shuffle: false,
      explain: 'The second phrase stopped on {n:D}, outside the {c:Am} chord, so it hangs like a question. The first came to rest on {n:A}, the root, on a strong beat.',
    },
    {
      type: 'true-false',
      statement: 'Good solos leave no rests: every beat should have a note.',
      answer: false,
      explain: 'Rests give the listener time to hear each phrase, and give you time to plan the next one. Space is part of the music.',
      fact: 'improvising-rests',
    },
    {
      type: 'choice',
      prompt: 'The call ended on {n:D}. Over {c:Am}, which ending would make the answer sound most finished?',
      options: [
        { text: '{n:A} on beat 1', correct: true },
        { text: '{n:D} on beat 4', why: '{n:D} is not in {c:Am}, and beat 4 is weak: it would sound like another question.' },
        { text: '{n:B} on beat 1', why: '{n:B} is not in {c:Am}: on a strong beat it sounds tense, not finished.' },
        { text: '{n:G} on the "&" of 4', why: 'An offbeat ending keeps the phrase moving instead of closing it.' },
      ],
      explain: 'A chord tone on a strong beat sounds finished. {n:A}, the root of {c:Am}, on beat 1 closes the phrase.',
      fact: 'improvising-endings',
    },
    {
      type: 'play-phrase',
      prompt: 'Play this answer from box 1, ending on {n:A} at string 4, fret 7. Then make up answers of your own.',
      notes: ANSWER,
      octave: 'exact',
      tempo: 76,
      explain: '{n:A} {n:C} {n:D} {n:C} {n:G}, then the long {n:A} on beat 1: it starts like the call and comes home where the call did not.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'The answer comes home on {n:A} at string 4, fret 7. Tap that note.',
        find: { note: 'A3' },
        mode: 'one',
        octave: 'exact',
        frets: [5, 8],
        explain: 'String 4, fret 7 is {n:A}, the root of {c:Am}: the most finished note to end on.',
      },
    },
    {
      type: 'choice',
      prompt: 'Why leave a rest between phrases?',
      options: [
        { text: 'Time to hear it, and to plan the next phrase', correct: true },
        { text: 'It makes the next phrase louder', why: 'A rest is silence in time; it does not change the volume.' },
        { text: 'Only to rest your hand', why: 'It does help your hand, but mostly it helps the listener follow the solo.' },
      ],
      shuffle: false,
      explain: 'Rests give the listener time to hear each phrase, and give you time to plan the next one.',
      fact: 'improvising-rests',
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the rule for endings.',
      text: 'A chord tone on a strong beat sounds ___. Ending anywhere else sounds like a ___.',
      blanks: ['finished', 'question'],
      bank: ['louder', 'faster'],
      explain: 'Ending on a chord tone on a strong beat closes a phrase; ending elsewhere leaves it open and invites an answer.',
      fact: 'improvising-endings',
    },
  ],
  facts: [
    {
      id: 'improvising-call-response',
      front: 'What is call and response?',
      back: 'A phrase (the call) paired with an answering phrase, like a question and its answer.',
    },
    {
      id: 'improvising-rests',
      front: 'Why leave rests between phrases?',
      back: 'They give the listener time to hear each phrase, and give you time to plan the next one.',
    },
    {
      id: 'improvising-endings',
      front: 'Which endings sound finished, and which invite an answer?',
      back: 'A chord tone on a strong beat sounds finished. Ending anywhere else invites an answer.',
    },
  ],
};

/** Unit 29 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'Improvising: notes that fit',
  theme: 'improvisation',
  description: 'Arpeggios, chord tones on strong beats, target notes at chord changes, motifs, and call and response.',
  lessons: [arpeggios, seventhArpeggios, chordTonesOnStrongBeats, targetNotes, motifs, callAndResponse],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      {
        type: 'true-false',
        statement: 'An arpeggio is a chord played one note at a time.',
        answer: true,
        explain: 'That is all an arpeggio is: the notes of one chord, one after another.',
      },
      {
        type: 'choice',
        prompt: 'Which degrees make a major arpeggio?',
        options: [
          { text: '{d:1} {d:3} {d:5}', correct: true },
          { text: '{d:1} {d:b3} {d:5}', why: 'That is minor: the 3rd is lowered.' },
          { text: '{d:1} {d:2} {d:3}', why: 'Those are the first three notes of the scale, not a chord.' },
          { text: '{d:1} {d:4} {d:5}', why: 'That is a sus4: no 3rd.' },
        ],
        explain: 'A major arpeggio is root, major 3rd and 5th: {d:1} {d:3} {d:5}, plus 8 for the octave.',
      },
      {
        type: 'fretboard-find',
        prompt: 'Tap every note of {c:C} on strings 5 to 3, frets 3 to 7.',
        find: { chord: 'C' },
        mode: 'all',
        octave: 'any',
        frets: [3, 7],
        strings: [5, 4, 3],
        explain: 'String 5 frets 3 and 7, string 4 fret 5, string 3 fret 5: {n:C} {n:E} {n:G} {n:C}.',
      },
      {
        type: 'choice',
        prompt: 'Which notes make up {c:Em7}?',
        options: [
          { text: '{n:E} {n:G} {n:B} {n:D}', correct: true },
          { text: '{n:E} {n:G#} {n:B} {n:D}', why: 'That is {c:E7}: its 3rd is major.' },
          { text: '{n:E} {n:G} {n:B} {n:D#}', why: '{n:D#} is the major 7th; a minor 7 chord has {n:D}.' },
          { text: '{n:E} {n:G} {n:B}', why: 'That is {c:Em}, with no 7th.' },
        ],
        explain: '{c:Em7} is root, minor 3rd, 5th and minor 7th: {n:E} {n:G} {n:B} {n:D}.',
      },
      {
        type: 'choice',
        prompt: 'Which note of {n:A} minor pentatonic is not in {c:Am7}?',
        options: [{ text: '{n:D}', correct: true }, { text: '{n:C}' }, { text: '{n:E}' }, { text: '{n:G}' }],
        explain: '{n:A} minor pentatonic is {n:A} {n:C} {n:D} {n:E} {n:G}; {c:Am7} is {n:A} {n:C} {n:E} {n:G}. Only {n:D} is extra.',
      },
      {
        type: 'choice',
        prompt: 'Over {c:G}, which of these notes is a chord tone?',
        options: [
          { text: '{n:B}', correct: true },
          { text: '{n:A}', why: '{c:G} is {n:G} {n:B} {n:D}: {n:A} is a passing note.' },
          { text: '{n:C}', why: '{n:C} is the 4th above {n:G}, not in the chord.' },
          { text: '{n:E}', why: '{n:E} is the 6th above {n:G}, not in the chord.' },
        ],
        explain: '{c:G} is {n:G} {n:B} {n:D}: {n:B}, its 3rd, is the chord tone.',
      },
      {
        type: 'true-false',
        statement: 'To make a line follow the chords, put the chord tones on beats 2 and 4 and the other notes on 1 and 3.',
        answer: false,
        explain: 'The other way round: chord tones on the strong beats, 1 and 3, and other notes between them.',
      },
      {
        type: 'true-false',
        statement: 'A note outside the chord on a strong beat usually moves by step to a chord tone.',
        answer: true,
        explain: 'It sounds tense, and stepping to the nearest chord tone releases it.',
      },
      {
        type: 'choice',
        prompt: 'The chord changes to {c:Dm}. Which target note says "minor" most clearly?',
        options: [
          { text: '{n:F}', correct: true },
          { text: '{n:D}', why: 'The root is the same in {c:D} and {c:Dm}.' },
          { text: '{n:A}', why: 'The 5th is the same in {c:D} and {c:Dm}.' },
        ],
        explain: 'The 3rd decides major or minor: {n:F} is the minor 3rd of {c:Dm}.',
      },
      {
        type: 'fretboard-find',
        prompt: 'Between frets 2 and 6, tap every {n:C#}: the 3rd of {c:A7}.',
        find: { note: 'C#' },
        mode: 'all',
        octave: 'any',
        frets: [2, 6],
        explain: 'Three: string 5 fret 4, string 3 fret 6 and string 2 fret 2.',
      },
      {
        type: 'choice',
        prompt: 'The motif is {n:C} {n:D} {n:E} in {n:A} minor pentatonic. Which is a sequence of it, one box note higher?',
        options: [
          { text: '{n:D} {n:E} {n:G}', correct: true },
          { text: '{n:D} {n:E} {n:F#}', why: '{n:F#} is not in {n:A} minor pentatonic: after {n:E} the next box note is {n:G}.' },
          { text: '{n:C} {n:D} {n:E}', why: 'That is a repeat.' },
          { text: '{n:C} {n:D} {n:A}', why: 'Same start, new last note: a new ending.' },
        ],
        explain: 'Each note moves to the next note of the scale ({n:A} {n:C} {n:D} {n:E} {n:G}): {n:C} to {n:D}, {n:D} to {n:E}, {n:E} to {n:G}.',
      },
      {
        type: 'match-pairs',
        prompt: 'Match each way of developing a motif with what it does.',
        pairs: [
          { left: 'Repeat', right: 'The same notes again' },
          { left: 'Sequence', right: 'Same shape, other notes' },
          { left: 'New rhythm', right: 'Same notes, new timing' },
          { left: 'New ending', right: 'Same start, new last note' },
        ],
        explain: 'Four ways to keep one idea going: repeat it, move it (a sequence), change its rhythm or change its ending.',
      },
      {
        type: 'true-false',
        statement: 'Rests between phrases give the listener time to hear them.',
        answer: true,
        explain: 'And they give you time to plan the next phrase. Space is part of the solo.',
      },
      {
        type: 'choice',
        prompt: 'Over {c:Am}, which ending sounds most finished?',
        options: [
          { text: '{n:A} on beat 1', correct: true },
          { text: '{n:D} on beat 1', why: '{n:D} is not in {c:Am}: on a strong beat it sounds tense.' },
          { text: '{n:C} on the "&" of 4', why: 'A chord tone, but on an offbeat: the phrase keeps moving.' },
        ],
        explain: 'A chord tone on a strong beat sounds finished: {n:A}, the root, on beat 1.',
      },
      {
        type: 'listen-choice',
        prompt: 'Is this a major or a minor arpeggio?',
        sound: { kind: 'tab', tempo: 80, notes: A_ARPEGGIO.slice(0, 4) },
        options: [{ text: 'Major', correct: true }, { text: 'Minor' }],
        shuffle: false,
        explain: 'That was {c:A}: {n:A} {n:C#} {n:E} {n:A}. The 3rd, {n:C#}, is four half steps above the root, a major 3rd.',
      },
    ],
  },
};

export default unit;
