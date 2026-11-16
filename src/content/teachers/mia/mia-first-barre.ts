/**
 * Mia, unit 10: Your first barre chord (plan: `mia/mia-first-barre` in src/content/plan/teachers.json).
 *
 * F climbed in steps: Fmaj7 (finger 1 stays from Am), the small F with a two-string barre, G7 and
 * La Cucaracha, the full F barre (the E shape moved up a fret, finger 1 as a new nut), the key of C
 * with the band, Bm (the Am shape moved up two frets behind a barre), and Auld Lang Syne as the
 * unit's performance. Every lesson follows its plan entry: the plan's `explain` in Mia's voice on
 * the cards, its `show` as figures, its `practice` as exercises (`Mic` always with a tapping
 * alternative) or tasks that send the learner to the Player, Technique, the chord trainer or a jam
 * track and back.
 *
 * Music from the song library: Change: Am-Fmaj7 and C-F (`st-change-am-fmaj7-c-f`, 72 BPM), First
 * Barre: F (`st-barre-f`, 72 BPM) and Auld Lang Syne (`auld-lang-syne`, 80 BPM, verse and chorus on
 * D A D G | D A Bm7 D). The song's chart uses the open Bm7 (x20202) for learners without a barre;
 * this unit's milestone asks for the barre Bm in its place (same root, and every note of Bm is in
 * Bm7), and the performance follows the verse's bass notes. La Cucaracha is not in the library
 * yet: its tasks name the planned song and fall back until it lands, to the nearest library study
 * (Change: G-C and C-G7, bars 9 to 16, for its new change) or a jam on the same chords
 * (`folk-i-iv-i-v` in C for C, F and G7). `mia-first-barre.test.ts` checks the shapes, fingers and
 * notes, the keys, the BPM of every Player task, the library's studies and Auld Lang Syne's chords.
 */
import type { TeacherLesson, TeacherUnit } from '../types';
import { playerParams, playerTask, techniqueTask, toolTask } from '../tasks';

// ── 1. Fmaj7 and the small F ────────────────────────────────────────────────────────────────────

const fmaj7AndSmallF: TeacherLesson = {
  id: 'fmaj7-and-small-f',
  title: 'F major seven and the small F',
  teaches: 'From A minor to F major seven finger 1 stays put; the small F lays finger 1 flat across strings 2 and 1.',
  minutes: 5,
  skill: 'teacher:mia:fmaj7-and-small-f',
  steps: [
    {
      type: 'card',
      title: 'F, one step at a time',
      body: '{c:F} is the famous hurdle, so we climb toward it in steps. First {c:Fmaj7}: finger 3 on string 4, fret 3 ({n:F}), finger 2 on string 3, fret 2 ({n:A}), finger 1 on string 2, fret 1 ({n:C}), with string 1 open. Strum strings 4 to 1.',
      figure: { kind: 'chord', symbol: 'Fmaj7', frets: 'xx3210', fingers: 'xx3210', caption: '{c:Fmaj7}: strings 4 to 1.' },
    },
    {
      type: 'choice',
      prompt: 'From {c:Am} to {c:Fmaj7}, which finger does not move at all?',
      options: [
        { text: 'Finger 1, on string 2, fret 1', correct: true },
        { text: 'Finger 2', why: 'Finger 2 moves from string 4 to string 3, fret 2.' },
        { text: 'Finger 3', why: 'Finger 3 moves from string 3, fret 2 to string 4, fret 3.' },
      ],
      explain: 'Finger 1 stays on string 2, fret 1 ({n:C}). Finger 2 moves to string 3, fret 2 and finger 3 to string 4, fret 3.',
      fact: 'am-fmaj7',
    },
    {
      type: 'play-chord',
      prompt: 'Strum {c:Fmaj7} from string 4: frets 3, 2 and 1 on strings 4, 3 and 2, with string 1 open.',
      chord: 'Fmaj7',
      frets: 'xx3210',
      explain: '{c:Fmaj7} is {n:F}, {n:A}, {n:C} and the open {n:E}: four strings, starting on string 4.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'Fmaj7',
        frets: 'xx3210',
        accept: 'this-shape',
        prompt: 'Build {c:Fmaj7}.',
        explain: 'String 4 fret 3, string 3 fret 2, string 2 fret 1, with string 1 open.',
      },
    },
    {
      type: 'card',
      title: 'The small F: your first barre',
      body: 'Now the small {c:F}: keep fingers 3 and 2 where they are, and lay finger 1 flat across strings 2 and 1 at fret 1. One finger pressing several strings at the same fret is a {t:barre}; this is a two-string barre. String 1 now sounds {n:F}. Strum strings 4 to 1.',
      figure: { kind: 'chord', symbol: 'F', frets: 'xx3211', fingers: 'xx3211', caption: 'The small {c:F}: finger 1 flat across strings 2 and 1.' },
    },
    {
      type: 'play-phrase',
      prompt: 'Hold the small F and pick the two strings under finger 1: string 2 fret 1, string 1 fret 1, twice. Both should ring.',
      notes: [
        { string: 2, fret: 1, duration: 'q' },
        { string: 1, fret: 1, duration: 'q' },
        { string: 2, fret: 1, duration: 'q' },
        { string: 1, fret: 1, duration: 'q' },
      ],
      octave: 'exact',
      tempo: 60,
      explain: 'String 2, fret 1 is {n:C} and string 1, fret 1 is {n:F}. If one is dull, roll finger 1 slightly onto its side and move it closer to the fret wire.',
      alternative: {
        type: 'choice',
        prompt: 'In the small F, which two notes sound under the flat finger 1?',
        options: [
          { text: '{n:C} on string 2 and {n:F} on string 1', correct: true },
          { text: '{n:C} on string 2 and the open {n:E}', why: 'The open {n:E} belongs to {c:Fmaj7}. In the small F, finger 1 covers string 1 too: {n:F}.' },
          { text: '{n:B} on string 2 and {n:E} on string 1', why: 'Those are the open strings. Fret 1 raises each by one fret.' },
        ],
        explain: 'Fret 1 of string 2 is {n:C}, fret 1 of string 1 is {n:F}: one fret above the open {n:B} and {n:E}.',
      },
    },
    {
      type: 'play-chord',
      prompt: 'Now strum the small F from string 4.',
      chord: 'F',
      frets: 'xx3211',
      explain: 'The small {c:F} is {n:F}, {n:A}, {n:C} and {n:F}. If string 1 buzzes, the flat finger needs to sit right behind the fret wire.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'F',
        frets: 'xx3211',
        accept: 'this-shape',
        prompt: 'Build the small F: three fingers, four strings.',
        explain: 'String 4 fret 3, string 3 fret 2, and finger 1 across strings 2 and 1 at fret 1.',
      },
    },
    {
      type: 'choice',
      prompt: 'From {c:C} to the small F, what does finger 1 do?',
      options: [
        { text: 'Stays at fret 1, flat over strings 2 and 1', correct: true },
        { text: 'Moves to string 1 only', why: 'It keeps string 2 too: it lies flat across both.' },
        { text: 'Lifts off: F needs only two fingers', why: 'The small F needs finger 1 for its barre on strings 2 and 1.' },
      ],
      explain: 'Finger 1 stays at fret 1 and flattens across strings 2 and 1, while fingers 3 and 2 each move over one string toward string 1.',
      fact: 'c-to-small-f',
    },
    playerTask({
      id: 'change-ladder',
      title: 'Change study: A minor, F and friends',
      song: 'st-change-am-fmaj7-c-f',
      tempo: 83,
      minutes: 5,
      body: 'The whole change study at about 60 BPM: {c:Am} and {c:Fmaj7}, then {c:C} and the small F, one strum a bar, then two, then four, then a change every two beats. Land each new chord on the beat, even if the strum before it catches open strings.',
    }),
    toolTask({
      id: 'f-minute',
      title: 'One-minute changes toward F',
      tool: 'chords',
      params: ['trainer', 'a-minor', 'f-major-7'],
      minutes: 3,
      body: 'One minute of {c:Am} to {c:Fmaj7} and back, counting the changes where every string rang. Then pick {c:C} and {c:F}: the trainer shows the small F. Another minute, and note both scores.',
    }),
    { generate: 'chord-shape', params: { chords: ['Fmaj7', 'Am', 'C'] } },
  ],
  facts: [
    { id: 'am-fmaj7', front: '{c:Am} to {c:Fmaj7}: which finger stays?', back: 'Finger 1, on string 2, fret 1 ({n:C}). Finger 2 goes to string 3 fret 2, finger 3 to string 4 fret 3.' },
    { id: 'small-f', front: 'How do you play the small F?', back: 'Finger 3 on string 4 fret 3, finger 2 on string 3 fret 2, finger 1 flat across strings 2 and 1 at fret 1. Strum strings 4 to 1.' },
    { id: 'c-to-small-f', front: '{c:C} to the small F: what does finger 1 do?', back: 'It stays at fret 1 and lies flat across strings 2 and 1; fingers 3 and 2 each move over one string.' },
  ],
};

// ── 2. La Cucaracha, and G7 ─────────────────────────────────────────────────────────────────────

/** C to G7 four times, as the microphone hears it: the bass of each chord, a half note each. */
const C_G7_BASS = [
  { string: 5, fret: 3, duration: 'h' },
  { string: 6, fret: 3, duration: 'h' },
  { string: 5, fret: 3, duration: 'h' },
  { string: 6, fret: 3, duration: 'h' },
  { string: 5, fret: 3, duration: 'h' },
  { string: 6, fret: 3, duration: 'h' },
  { string: 5, fret: 3, duration: 'h' },
  { string: 6, fret: 3, duration: 'h' },
] as const;

const laCucaracha: TeacherLesson = {
  id: 'la-cucaracha',
  title: 'La Cucaracha, and G seven',
  teaches: 'G seven is the C shape\'s fingers 3 and 2 moved one string toward string 6, and finger 1 on string 1, fret 1.',
  minutes: 5,
  skill: 'teacher:mia:la-cucaracha',
  steps: [
    {
      type: 'card',
      title: 'A bouncing folk song',
      body: 'La Cucaracha is a Spanish and Mexican folk song known in the 19th century, and it bounces on {c:C}, {c:G7} and {c:F}. {c:G7} is the one new chord, and an easy one: from {c:C}, move fingers 3 and 2 together one string toward string 6, and put finger 1 on string 1, fret 1 ({n:F}).',
      figure: { kind: 'chord', symbol: 'G7', frets: '320001', fingers: '320001', caption: '{c:G7}: all six strings.' },
    },
    {
      type: 'choice',
      prompt: 'From {c:C} to {c:G7}, what do fingers 3 and 2 do?',
      options: [
        { text: 'Move together, one string toward string 6', correct: true },
        { text: 'Stay where they are', why: 'In {c:G7} they sit on strings 6 and 5, one string over from {c:C}.' },
        { text: 'Swap places', why: 'They keep their shape: finger 3 still one fret higher than finger 2, both one string over.' },
      ],
      explain: 'Finger 3 goes from string 5 to string 6, fret 3, finger 2 from string 4 to string 5, fret 2, and finger 1 hops to string 1, fret 1.',
      fact: 'c-to-g7',
    },
    {
      type: 'play-chord',
      prompt: 'Strum {c:G7} on all six strings: string 6 fret 3, string 5 fret 2, string 1 fret 1.',
      chord: 'G7',
      frets: '320001',
      explain: '{c:G7} is {n:G}, {n:B}, {n:D} and {n:F}. The {n:F} on string 1, fret 1 is its 7.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'G7',
        frets: '320001',
        accept: 'this-shape',
        prompt: 'Build {c:G7}.',
        explain: 'String 6 fret 3, string 5 fret 2 and string 1 fret 1, with strings 4, 3 and 2 open.',
      },
    },
    {
      type: 'card',
      title: 'G seven leans toward home',
      body: 'Just as {c:D7} leans toward {c:G}, {c:G7} leans toward home, {c:C}. Listen: after {c:G7}, the {c:C} sounds like arriving.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['C', 'G7', 'C'], beats: 4, tempo: 72 }, label: 'Hear {c:C}, {c:G7}, {c:C}' },
    },
    {
      type: 'listen-choice',
      prompt: 'Mia plays {c:C}, then {c:G7}, and stops. Does it sound finished?',
      sound: { kind: 'progression', chords: ['C', 'G7'], beats: 4, tempo: 72 },
      options: [{ text: 'No: it leans, waiting for {c:C}', correct: true }, { text: 'Yes: it sounds finished' }],
      shuffle: false,
      explain: 'Ending on {c:G7} leaves you hanging: it wants to go home to {c:C}. Songs in C come back to {c:C} to finish.',
    },
    {
      type: 'play-phrase',
      prompt: 'Change {c:C} to {c:G7} four times, one strum each. The microphone follows the bass: string 5 fret 3, then string 6 fret 3.',
      notes: [...C_G7_BASS],
      octave: 'any',
      tempo: 60,
      explain: 'The bass of {c:C} is {n:C}, string 5, fret 3; the bass of {c:G7} is {n:G}, string 6, fret 3. Finger 3 makes the hop between them.',
      alternative: {
        type: 'choice',
        prompt: 'Changing {c:C} to {c:G7}, which finger lands on string 1?',
        options: [
          { text: 'Finger 1, at fret 1', correct: true },
          { text: 'Finger 2, at fret 2', why: 'Finger 2 moves to string 5, fret 2.' },
          { text: 'Finger 3, at fret 3', why: 'Finger 3 moves to string 6, fret 3.' },
        ],
        explain: 'Finger 1 leaves string 2 and lands on string 1, fret 1, while fingers 3 and 2 move one string toward string 6.',
      },
    },
    toolTask({
      id: 'g7-minute',
      title: 'One-minute changes: C and G seven',
      tool: 'chords',
      params: ['trainer', 'c-major', 'g-7'],
      minutes: 3,
      body: 'One minute of {c:C} to {c:G7} and back, counting the clean changes. Then pick {c:C} and {c:F}, the small F, for another minute. Note both scores.',
    }),
    playerTask({
      id: 'cucaracha',
      title: 'La Cucaracha',
      song: 'la-cucaracha',
      tempo: 73,
      minutes: 5,
      body: 'Play La Cucaracha at about 88 BPM on {c:C}, {c:G7} and the small F. Keep it bright and bouncy: light down-up eighths, with an accent on 2 and 4. When the changes land, go to 87 % (about 104 BPM).',
      fallback: {
        tool: 'player',
        params: playerParams('st-change-g-c-c-g7', { bars: [9, 16], tempo: 83 }),
        title: 'Change study: C and G seven',
        body: 'La Cucaracha is not in the Songs library yet, so practise its new change: bars 9 to 16 of this study, {c:C} and {c:G7}, at about 60 BPM, then at 100 % (72 BPM). Keep each strum light, and land every change on the beat.',
      },
    }),
    {
      type: 'choice',
      prompt: 'For extra bounce you add chucks. On which beats do they go?',
      options: [
        { text: 'Beats 2 and 4', correct: true },
        { text: 'Beats 1 and 3', why: 'Beats 1 and 3 carry the bass of the chord. The chucks answer on 2 and 4.' },
        { text: 'Every beat', why: 'Then there is no chord left. Chucks on 2 and 4 only, where you accent.' },
      ],
      explain: 'On 2 and 4, the heel of your strumming hand lands on the strings with the pick: a short "chk" where you used to accent.',
      fact: 'chucks-2-4',
    },
    playerTask({
      id: 'cucaracha-chucks',
      title: 'La Cucaracha, with chucks',
      song: 'la-cucaracha',
      tempo: 87,
      minutes: 4,
      body: 'Again at about 104 BPM, now with chucks on 2 and 4 for extra bounce. Then try the target tempo, 100 % (120 BPM).',
      fallback: {
        tool: 'progressions',
        params: ['folk-i-iv-i-v', 'c', 'jam'],
        title: 'Jam on C, F and G seven, with chucks',
        body: 'La Cucaracha is not in the Songs library yet, so jam on its chords: the band plays {c:C}, {c:F}, {c:C}, {c:G}; you play the small F, and {c:G7} where it plays {c:G}. Down-up eighths with chucks on 2 and 4, at 104 BPM, then 120.',
      },
    }),
    { generate: 'chord-shape', params: { chords: ['G7', 'C'] } },
  ],
  facts: [
    { id: 'c-to-g7', front: '{c:C} to {c:G7}: how do the fingers move?', back: 'Fingers 3 and 2 move together one string toward string 6; finger 1 hops to string 1, fret 1 ({n:F}).' },
    { id: 'g7-to-c', front: 'Which chord does {c:G7} lean toward?', back: '{c:C}, home. Just as {c:D7} leans toward {c:G}.' },
    { id: 'chucks-2-4', front: 'Where do chucks go in a bouncy strum?', back: 'On beats 2 and 4, where you would accent.' },
  ],
};

// ── 3. The full F barre ─────────────────────────────────────────────────────────────────────────

const theFullF: TeacherLesson = {
  id: 'the-full-f',
  title: 'The full F barre',
  teaches: 'The full F lays finger 1 across all six strings at fret 1, with the E shape one fret higher in front of it.',
  minutes: 5,
  skill: 'teacher:mia:the-full-f',
  steps: [
    {
      type: 'card',
      title: 'Finger 1 across all six',
      body: 'The full {c:F}: finger 1 lies flat across all six strings at fret 1, rolled slightly onto its bony side, right behind the fret wire. In front of it, fingers 3, 4 and 2 make an E shape: 3 on string 5, fret 3 ({n:C}), 4 on string 4, fret 3 ({n:F}), 2 on string 3, fret 2 ({n:A}).',
      figure: { kind: 'chord', symbol: 'F', frets: '133211', fingers: '134211', caption: 'The full {c:F}: the barre across all six strings at fret 1.' },
    },
    {
      type: 'choice',
      prompt: 'Which part of finger 1 makes the barre?',
      options: [
        { text: 'Its bony side, rolled slightly over', correct: true },
        { text: 'Its soft pad, flat on the strings', why: 'The soft pad has creases that let strings buzz. Roll slightly onto the harder, bony side.' },
        { text: 'Just the tip', why: 'The tip covers one string. A barre needs the whole finger laid flat.' },
      ],
      explain: 'Roll finger 1 a little toward the headstock, onto its bony side, and keep it right behind the fret wire.',
      fact: 'barre-placement',
    },
    {
      type: 'card',
      title: 'The E shape, one fret up',
      body: 'Look closely: fingers 3, 4 and 2 make the {c:E} shape, moved up one fret. Finger 1 does the job the nut did for {c:E}, a new nut at fret 1. Every note of {c:E} goes up one fret, and {c:E} becomes {c:F}.',
      figure: {
        kind: 'fretboard',
        frets: [0, 4],
        labels: 'finger',
        dots: [
          { string: 6, fret: 1, note: 'F2', finger: 1 },
          { string: 5, fret: 3, note: 'C3', finger: 3 },
          { string: 4, fret: 3, note: 'F3', finger: 4 },
          { string: 3, fret: 2, note: 'A3', finger: 2 },
          { string: 2, fret: 1, note: 'C4', finger: 1 },
          { string: 1, fret: 1, note: 'F4', finger: 1 },
        ],
        caption: 'The full {c:F}: the {c:E} shape one fret up, finger 1 as the nut.',
      },
    },
    {
      type: 'choice',
      prompt: 'The full {c:F} is which open chord, moved up one fret?',
      options: [
        { text: '{c:E}, with finger 1 as a new nut', correct: true },
        { text: '{c:Am}, with finger 1 as a new nut', why: '{c:Am} moved up uses a barre from string 5: that is how you will play {c:Bm}.' },
        { text: '{c:C}', why: 'The {c:C} shape is different. Look at strings 5, 4 and 3: they are the {c:E} shape, one fret higher.' },
      ],
      explain: '{c:E} is 0 2 2 1 0 0 from string 6; {c:F} is 1 3 3 2 1 1: every fret one higher, with finger 1 across where the open strings were.',
      fact: 'f-is-e-shape',
    },
    {
      type: 'card',
      title: 'Arm weight, not a crushing thumb',
      body: 'Squeeze gently with the hand and let the weight of your arm pull back slightly, instead of crushing with the thumb. If a string is dead, play string by string and adjust. If it hurts, stop: strength comes in weeks, not minutes.',
      tip: 'Release the barre between tries. Holding it for minutes builds strain, not strength.',
    },
    {
      type: 'choice',
      prompt: 'Your thumb starts to ache while you hold the barre. What do you do?',
      options: [
        { text: 'Stop and rest; next time let the arm do it', correct: true },
        { text: 'Squeeze harder until it rings', why: 'A clean barre comes from placement and arm weight, not force. Squeezing harder only hurts.' },
        { text: 'Hold it longer to build strength', why: 'Long holds strain the hand. Short presses with rests build it safely.' },
      ],
      explain: 'Stop and rest. A sore thumb means it is squeezing; let the arm hang back and the finger sit right behind the fret.',
      fact: 'barre-pressure',
    },
    techniqueTask({
      id: 'barre-strength',
      title: 'Barre Strength Without Strain',
      exercise: 'tech-barre-strength',
      minutes: 5,
      body: 'Finger 1 alone at fret 5, where it is easiest: pick each string from 6 to 1. Then press for 2 beats and release for 2, 8 times. Then the same at fret 3, and at fret 1. Stop at five minutes or at the first ache.',
    }),
    {
      type: 'play-phrase',
      prompt: 'Hold the full F and pick it string by string, from string 6 fret 1 to string 1 fret 1.',
      notes: [
        { string: 6, fret: 1, duration: 'q' },
        { string: 5, fret: 3, duration: 'q' },
        { string: 4, fret: 3, duration: 'q' },
        { string: 3, fret: 2, duration: 'q' },
        { string: 2, fret: 1, duration: 'q' },
        { string: 1, fret: 1, duration: 'q' },
      ],
      octave: 'exact',
      tempo: 60,
      explain: '{n:F}, {n:C}, {n:F}, {n:A}, {n:C}, {n:F}: six strings, six clear notes. A dead string? Adjust that finger: closer to the fret, or rolled a little.',
      alternative: {
        type: 'order',
        prompt: 'Put the notes of the full F in order, from string 6 to string 1.',
        tiles: ['{n:F}', '{n:C}', '{n:F}', '{n:A}', '{n:C}', '{n:F}'],
        distractors: ['{n:E}'],
        explain: 'String 6 fret 1 {n:F}, string 5 fret 3 {n:C}, string 4 fret 3 {n:F}, string 3 fret 2 {n:A}, string 2 fret 1 {n:C}, string 1 fret 1 {n:F}.',
      },
    },
    {
      type: 'play-chord',
      prompt: 'Now strum the full F on all six strings.',
      chord: 'F',
      frets: '133211',
      explain: 'All six strings ring in the full {c:F}. If it does not pass, pick it string by string to find the dead one, and adjust that finger.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'F',
        frets: '133211',
        accept: 'this-shape',
        prompt: 'Build the full F: finger 1 across fret 1, and the E shape in front.',
        explain: 'Fret 1 on every string, with string 5 fret 3, string 4 fret 3 and string 3 fret 2 on top.',
      },
    },
    playerTask({
      id: 'first-barre',
      title: 'First Barre: F',
      song: 'st-barre-f',
      tempo: 83,
      minutes: 5,
      body: 'At about 60 BPM, two strums a bar: {c:C} to {c:F} and back, then {c:Am} to {c:F}. After each {c:F} bar, pick the six strings one by one to check the barre. On a bad day, {c:Fmaj7} is a fine stand-in.',
    }),
    {
      type: 'true-false',
      statement: 'On a bad day, playing {c:Fmaj7} instead of the full F is fine.',
      answer: true,
      explain: 'Same root, no barre. Strength comes in weeks: a bad day is a day to play {c:Fmaj7} and keep the music going.',
    },
  ],
  facts: [
    { id: 'f-is-e-shape', front: 'The full {c:F} (1 3 3 2 1 1) is which shape moved up?', back: 'The {c:E} shape (0 2 2 1 0 0), one fret up, with finger 1 across all six strings as a new nut.' },
    { id: 'barre-placement', front: 'Where does the barre finger go?', back: 'Flat across the strings right behind the fret wire, rolled slightly onto its bony side.' },
    { id: 'barre-pressure', front: 'A barre chord: where does the pressure come from?', back: 'A gentle squeeze of the hand and the weight of the arm pulling back, not a crushing thumb. If it hurts, stop.' },
  ],
};

// ── 4. The barre F at work: the key of C ────────────────────────────────────────────────────────

const fInTheKeyOfC: TeacherLesson = {
  id: 'f-in-the-key-of-c',
  title: 'The barre F at work: the key of C',
  teaches: 'C, F and G are chords one, four and five of C major, and A minor is six: the barre F opens up the key.',
  minutes: 5,
  skill: 'teacher:mia:f-in-the-key-of-c',
  steps: [
    {
      type: 'card',
      title: 'A whole key in four chords',
      body: '{c:C}, {c:F} and {c:G} are the {r:I}, {r:IV} and {r:V} of {k:C major}, and {c:Am} is its {r:vi}. With the barre {c:F} you have just learned, a whole new key opens up. Listen to all four, one after another.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['C', 'Am', 'F', 'G'], beats: 4, tempo: 66 }, label: 'Hear {c:C}, {c:Am}, {c:F}, {c:G}' },
    },
    {
      type: 'match-pairs',
      prompt: 'In {k:C major}, match each roman numeral with its chord.',
      pairs: [
        { left: '{r:I}', right: '{c:C}' },
        { left: '{r:IV}', right: '{c:F}' },
        { left: '{r:V}', right: '{c:G}' },
        { left: '{r:vi}', right: '{c:Am}' },
      ],
      explain: 'Count up the {k:C major} scale, C D E F G A B: {n:C} is 1, {n:F} is 4, {n:G} is 5 and {n:A} is 6. The small numeral {r:vi} marks a minor chord.',
      fact: 'key-of-c',
    },
    {
      type: 'card',
      title: 'Light between, firm on the beat',
      body: 'Keep the barre light between chords and squeeze only as you land, on the beat. If a change is not ready, play the small F and try the barre again next time round. Listen to how the {t:progression}, the chords in their order, sounds with the full six-string F: deeper and stronger.',
      figure: { kind: 'chord', symbol: 'F', frets: '133211', fingers: '134211', caption: 'The barre {c:F}: squeeze as you land, relax between.' },
    },
    {
      type: 'choice',
      prompt: 'The band is coming to {c:F} and your barre is not ready. What do you do?',
      options: [
        { text: 'Play the small F, and try the barre next time', correct: true },
        { text: 'Stop and fix the barre', why: 'The band keeps going. Land on time with the small F instead.' },
        { text: 'Skip the chord and wait', why: 'A gap where {c:F} should be is louder than a small F. Play the small one.' },
      ],
      explain: 'Landing on time matters more than the full shape. The small F has the same root and fits every time; the barre comes back next round.',
      fact: 'light-barre',
    },
    {
      type: 'play-phrase',
      prompt: 'One strum each, two beats long: {c:C}, {c:Am}, the barre {c:F}, {c:G}. The microphone hears the bass: string 5 fret 3, open 5, string 6 frets 1, 3.',
      notes: [
        { string: 5, fret: 3, duration: 'h' },
        { string: 5, fret: 0, duration: 'h' },
        { string: 6, fret: 1, duration: 'h' },
        { string: 6, fret: 3, duration: 'h' },
      ],
      octave: 'any',
      tempo: 66,
      explain: 'The bass notes are {n:C}, {n:A}, {n:F} and {n:G}. With the full barre, {c:F} has its own low root on string 6, fret 1: that is the deeper sound.',
      alternative: {
        type: 'order',
        prompt: 'Put the chords in order: {r:I}, {r:vi}, {r:IV}, {r:V} in {k:C major}.',
        tiles: ['{c:C}', '{c:Am}', '{c:F}', '{c:G}'],
        distractors: ['{c:Em}'],
        explain: '{r:I} is {c:C}, {r:vi} is {c:Am}, {r:IV} is {c:F} and {r:V} is {c:G}.',
      },
    },
    toolTask({
      id: 'barre-minute',
      title: 'One-minute changes with the barre',
      tool: 'chords',
      params: ['trainer', 'c-major', 'f-major'],
      minutes: 3,
      body: 'One minute of {c:C} to {c:F} and back. The trainer draws the small F, but play the full barre, all six strings. Then pick {c:Am} and {c:F} for another minute. Note both scores.',
    }),
    { generate: 'roman-chord', params: { direction: 'to-chord', numerals: ['I', 'IV', 'V', 'vi'], modes: ['major'], maxAccidentals: 0 } },
    toolTask({
      id: 'jam-fifties',
      title: 'Jam: C, A minor, F, G',
      tool: 'progressions',
      params: ['fifties-i-vi-iv-v', 'c', 'jam'],
      minutes: 4,
      body: 'The band plays {c:C}, {c:Am}, {c:F}, {c:G}, a bar each. Set it to 66 BPM and strum down-up eighths, with the barre on every {c:F}. Squeeze on the beat, relax between.',
    }),
    {
      type: 'true-false',
      statement: 'Between chords, you keep the barre squeezed hard so it is ready.',
      answer: false,
      explain: 'Keep it light between chords and squeeze only as you land, on the beat. A barre held hard all the time tires the hand fast.',
      fact: 'light-barre',
    },
    toolTask({
      id: 'jam-folk',
      title: 'Jam: C, F, C, G',
      tool: 'progressions',
      params: ['folk-i-iv-i-v', 'c', 'jam'],
      minutes: 4,
      body: 'Now {c:C}, {c:F}, {c:C}, {c:G} with the folk pattern, at 92 BPM. More changes to {c:F} this time: if one is not ready, play the small F and try the barre again next round.',
    }),
    {
      type: 'choice',
      prompt: 'In the key of C, which chord is {r:IV}?',
      options: [{ text: '{c:F}', correct: true }, { text: '{c:G}', why: '{c:G} is {r:V}, built on the 5th note.' }, { text: '{c:Am}', why: '{c:Am} is {r:vi}.' }, { text: '{c:Dm}' }],
      explain: '{n:F} is the 4th note of {k:C major}, so {c:F} is {r:IV}: the chord your barre has just unlocked.',
      fact: 'key-of-c',
    },
  ],
  facts: [
    { id: 'key-of-c', front: 'The {r:I}, {r:IV}, {r:V} and {r:vi} of {k:C major}?', back: '{c:C}, {c:F}, {c:G} and {c:Am}.' },
    { id: 'light-barre', front: 'How do you change to a barre chord in time?', back: 'Keep the barre light between chords and squeeze as you land, on the beat. Not ready? Play the small F this time round.' },
  ],
};

// ── 5. Bm, a barre from string 5 ────────────────────────────────────────────────────────────────

const bmBarre: TeacherLesson = {
  id: 'bm-barre',
  title: 'B minor, a barre from string 5',
  teaches: 'B minor is the A minor shape moved up two frets, with finger 1 barring strings 5 to 1 at fret 2.',
  minutes: 5,
  skill: 'teacher:mia:bm-barre',
  steps: [
    {
      type: 'card',
      title: 'A barre from string 5',
      body: '{c:Bm}: finger 1 lies across strings 5 to 1 at fret 2. Then finger 3 on string 4, fret 4 ({n:F#}), finger 4 on string 3, fret 4 ({n:B}) and finger 2 on string 2, fret 3 ({n:D}). Strum from string 5, and leave string 6 out.',
      figure: { kind: 'chord', symbol: 'Bm', frets: 'x24432', fingers: 'x13421', caption: '{c:Bm}: strings 5 to 1, the barre at fret 2.' },
    },
    {
      type: 'card',
      title: 'The A minor shape, two frets up',
      body: 'Fingers 3, 4 and 2 make the {c:Am} shape, moved up two frets. Finger 1 takes the place of the nut, and {c:Am} becomes {c:Bm}. Faint dots: {c:Am}. Solid dots: {c:Bm}.',
      figure: {
        kind: 'fretboard',
        frets: [0, 5],
        dots: [
          { string: 4, fret: 2, note: 'E3', role: 'ghost' },
          { string: 3, fret: 2, note: 'A3', role: 'ghost' },
          { string: 2, fret: 1, note: 'C4', role: 'ghost' },
          { string: 5, fret: 2, note: 'B2', finger: 1 },
          { string: 4, fret: 4, note: 'F#3', finger: 3 },
          { string: 3, fret: 4, note: 'B3', finger: 4 },
          { string: 2, fret: 3, note: 'D4', finger: 2 },
          { string: 1, fret: 2, note: 'F#4', finger: 1 },
        ],
        caption: 'Faint: {c:Am}. Solid: {c:Bm}, the same shape two frets up.',
      },
    },
    {
      type: 'choice',
      prompt: '{c:Bm} is which open chord, moved up two frets behind a barre?',
      options: [
        { text: '{c:Am}', correct: true },
        { text: '{c:Em}', why: 'The {c:Em} shape has its root on string 6. {c:Bm} starts on string 5, like {c:Am}.' },
        { text: '{c:Dm}', why: '{c:Dm} starts on string 4. {c:Bm} is the {c:Am} shape.' },
      ],
      explain: '{c:Am} is x 0 2 2 1 0; {c:Bm} is x 2 4 4 3 2: every fret two higher, with finger 1 across where the open strings were.',
      fact: 'bm-shape',
    },
    {
      type: 'fretboard-name',
      prompt: 'Finger 3 in {c:Bm} presses string 4, fret 4. Which note is it?',
      position: { string: 4, fret: 4 },
      ask: 'note',
      spelling: 'any',
      options: ['F#', 'G', 'F', 'E'],
      explain: 'String 4, fret 4 is {n:F#}: the open {n:D}, then {n:E} at fret 2 and {n:F#} at fret 4. It is the fifth of {c:Bm}.',
    },
    {
      type: 'play-phrase',
      prompt: 'Hold {c:Bm} and pick it string by string: string 5 fret 2, string 4 fret 4, string 3 fret 4, string 2 fret 3, string 1 fret 2.',
      notes: [
        { string: 5, fret: 2, duration: 'q' },
        { string: 4, fret: 4, duration: 'q' },
        { string: 3, fret: 4, duration: 'q' },
        { string: 2, fret: 3, duration: 'q' },
        { string: 1, fret: 2, duration: 'q' },
      ],
      octave: 'exact',
      tempo: 60,
      explain: '{n:B}, {n:F#}, {n:B}, {n:D}, {n:F#}. Strings 5 and 1 sound under the barre; if one is dead, roll finger 1 slightly onto its side.',
      alternative: {
        type: 'order',
        prompt: 'Put the notes of {c:Bm} in order, from string 5 to string 1.',
        tiles: ['{n:B}', '{n:F#}', '{n:B}', '{n:D}', '{n:F#}'],
        distractors: ['{n:A}'],
        explain: 'String 5 fret 2 {n:B}, string 4 fret 4 {n:F#}, string 3 fret 4 {n:B}, string 2 fret 3 {n:D}, string 1 fret 2 {n:F#}.',
      },
    },
    {
      type: 'play-chord',
      prompt: 'Now strum {c:Bm} from string 5.',
      chord: 'Bm',
      frets: 'x24432',
      explain: '{c:Bm} is {n:B}, {n:D} and {n:F#}. Start the strum on string 5 and miss string 6.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'Bm',
        frets: 'x24432',
        accept: 'this-shape',
        prompt: 'Build {c:Bm}: the barre at fret 2, and the {c:Am} shape in front.',
        explain: 'Fret 2 across strings 5 to 1, with string 4 fret 4, string 3 fret 4 and string 2 fret 3 on top.',
      },
    },
    {
      type: 'card',
      title: 'Where B minor lives',
      body: '{c:Bm} shows up all over songs in {k:D major}, as the chord built on the 6th note of the scale. Count up the {k:D major} scale, {n:D} {n:E} {n:F#} {n:G} {n:A} {n:B}: the 6th note is {n:B}. Listen to it beside {c:D}, {c:G} and {c:A}.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['D', 'Bm', 'G', 'A'], beats: 4, tempo: 72 }, label: 'Hear {c:D}, {c:Bm}, {c:G}, {c:A}' },
    },
    {
      type: 'choice',
      prompt: 'In {k:D major}, {c:Bm} is built on which note of the scale?',
      options: [{ text: 'The 6th: {n:B}', correct: true }, { text: 'The 5th: {n:A}', why: 'The 5th note, {n:A}, carries the {c:A} chord.' }, { text: 'The 2nd: {n:E}', why: 'The 2nd note carries {c:Em}.' }],
      explain: '{n:D} {n:E} {n:F#} {n:G} {n:A} {n:B}: {n:B} is the 6th note, so {c:Bm} is the {r:vi} of {k:D major}, just as {c:Am} is the {r:vi} of {k:C major}.',
      fact: 'bm-in-d',
    },
    techniqueTask({
      id: 'barre-strength-2',
      title: 'Barre strength at fret 2',
      exercise: 'tech-barre-strength',
      minutes: 4,
      body: 'Barre Strength Without Strain, at fret 2 and on strings 5 to 1 only: pick each string, then press for 2 beats and release for 2, 8 times. Roll finger 1 onto its side for any dead string. Stop at the first ache.',
    }),
    toolTask({
      id: 'bm-minute',
      title: 'One-minute changes: D and B minor',
      tool: 'chords',
      params: ['trainer', 'd-major', 'b-minor'],
      minutes: 3,
      body: 'One minute of {c:D} to {c:Bm} and back, counting the clean changes. Then pick {c:Bm} and {c:G} for another minute. Note both scores.',
      tip: 'Aim finger 1 at fret 2 first; the other fingers land in front of it.',
    }),
    { generate: 'chord-shape', params: { chords: ['Bm', 'Am', 'D'] } },
  ],
  facts: [
    { id: 'bm-shape', front: 'How do you play {c:Bm}?', back: 'The {c:Am} shape two frets up: finger 1 across strings 5 to 1 at fret 2, finger 3 on string 4 fret 4, finger 4 on string 3 fret 4, finger 2 on string 2 fret 3.' },
    { id: 'bm-in-d', front: 'Where does {c:Bm} come from in {k:D major}?', back: 'It is the chord on the 6th note of the scale, {n:B}: the {r:vi} chord.' },
  ],
};

// ── 6. Auld Lang Syne (milestone) ───────────────────────────────────────────────────────────────

/** The verse of Auld Lang Syne in this course's arrangement, one chord a bar. */
const VERSE_CHORDS = ['D', 'A', 'D', 'G', 'D', 'A', 'Bm', 'D'];
/** Its bass notes, one a bar, as the microphone follows them. */
const VERSE_BASS = [
  { string: 4, fret: 0, duration: 'w' },
  { string: 5, fret: 0, duration: 'w' },
  { string: 4, fret: 0, duration: 'w' },
  { string: 6, fret: 3, duration: 'w' },
  { string: 4, fret: 0, duration: 'w' },
  { string: 5, fret: 0, duration: 'w' },
  { string: 5, fret: 2, duration: 'w' },
  { string: 4, fret: 0, duration: 'w' },
] as const;

const auldLangSyne: TeacherLesson = {
  id: 'auld-lang-syne',
  title: 'Auld Lang Syne',
  teaches: 'Each line of Auld Lang Syne starts with a pickup: count yourself in and come in on the first full bar.',
  minutes: 5,
  skill: 'teacher:mia:auld-lang-syne',
  steps: [
    {
      type: 'card',
      title: 'A song for every New Year',
      body: 'Auld Lang Syne sets Robert Burns\'s words of 1788 to a Scottish tune, and it is sung at New Year all over the world. It uses {c:D}, {c:A}, {c:G} and your new {c:Bm}. Each line starts with a {t:pickup}, so count yourself in and come in on the first full bar.',
    },
    {
      type: 'choice',
      prompt: 'A line starts with a pickup. When do you strum your first chord?',
      options: [
        { text: 'On beat 1 of the first full bar', correct: true },
        { text: 'On the pickup, with the first word', why: 'The pickup comes before the bar. Let it go by, and strum on the next beat 1.' },
        { text: 'Whenever you are ready', why: 'The beat does not wait. Count yourself in and land on beat 1.' },
      ],
      explain: 'The pickup is a note before the first full bar. You count, let it go by, and strum your first chord on beat 1.',
      fact: 'pickup-line',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Count "1, 2, 3" silently, tap the pickup on 4, then tap your first strum on the next 1.',
      rhythm: { pattern: 'qr qr qr q | w' },
      tempo: 80,
      show: 'both',
      explain: 'The pickup sits on beat 4, and the first full bar starts on the next 1: that is where your first {c:D} goes.',
    },
    {
      type: 'card',
      title: 'The chords, one a bar',
      body: 'The verse goes {c:D} {c:A} {c:D} {c:G}, then {c:D} {c:A} {c:Bm} {c:D}, one chord a bar, and the chorus uses the same eight. The song\'s {t:chord-chart} shows {c:Bm7}, an easier open shape: play your barre {c:Bm} there instead. That {c:Bm} is your milestone: it must land on time, even if it is not perfect yet.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: [...VERSE_CHORDS], beats: 4, tempo: 80 }, label: 'Hear the verse chords' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Fill in the two missing chords of the verse.',
      text: '{c:D} {c:A} {c:D} ___ | {c:D} {c:A} ___ {c:D}',
      blanks: ['{c:G}', '{c:Bm}'],
      bank: ['{c:Em}', '{c:E}'],
      explain: 'Line 1 ends on {c:G}; line 2 has the barre chord, {c:Bm}, in bar 7, before it comes home to {c:D}.',
    },
    toolTask({
      id: 'a-bm-minute',
      title: 'One-minute changes: A and B minor',
      tool: 'chords',
      params: ['trainer', 'a-major', 'b-minor'],
      minutes: 3,
      body: 'One minute of {c:A} to {c:Bm} and back: the change into bar 7 of the verse. Count the changes where every string rang, and try to beat your score from last time.',
    }),
    {
      type: 'play-chord',
      prompt: 'Strum {c:Bm} from string 5, as you will in bar 7.',
      chord: 'Bm',
      frets: 'x24432',
      explain: '{c:Bm}: the barre across strings 5 to 1 at fret 2. Land it, strum it, and keep going.',
      alternative: { generate: 'chord-shape', params: { chords: ['Bm'] } },
    },
    playerTask({
      id: 'auld-lang-syne-play',
      title: 'Auld Lang Syne',
      song: 'auld-lang-syne',
      tempo: 83,
      minutes: 6,
      body: 'About 66 BPM, then 100 % (80 BPM). Strum as the chart shows, or down-up eighths. Where it says {c:Bm7}, play your barre {c:Bm}. Count yourself in through each pickup. If you can, record one take on your phone, listen back, and choose one thing to improve.',
      tip: 'The barre not ready in time? Keep the beat and play the open {c:Bm7} this time round.',
    }),
    {
      type: 'card',
      title: 'Your show',
body: 'The verse of Auld Lang Syne at 80 BPM, with the barre {c:Bm}. Count yourself in, let the pickup go by, and strum each chord once, on beat 1, and let it ring. The microphone follows your bass notes, one a bar. Keep going through any mistake, and land the {c:Bm} on time.',
    },
    {
      type: 'play-phrase',
      id: 'show',
      prompt: 'Your show: the verse of Auld Lang Syne. The bass notes: open 4, open 5, open 4, string 6 fret 3, open 4, open 5, string 5 fret 2, open 4.',
      notes: [...VERSE_BASS],
      octave: 'any',
      tempo: 80,
      pass: 0.8,
      explain: '{c:D} {c:A} {c:D} {c:G}, {c:D} {c:A} {c:Bm} {c:D}. The bass of {c:Bm} is {n:B}, under your barre at string 5, fret 2.',
      alternative: {
        type: 'order',
        prompt: 'Put the verse of Auld Lang Syne in order, two bars to a tile.',
        tiles: ['{c:D} {c:A}', '{c:D} {c:G}', '{c:D} {c:A}', '{c:Bm} {c:D}'],
        explain: '{c:D} {c:A}, {c:D} {c:G}, then {c:D} {c:A} again, and the barre {c:Bm} coming home to {c:D}.',
      },
    },
  ],
  facts: [
    { id: 'pickup-line', front: 'A line starts with a pickup. When do you strum your first chord?', back: 'On beat 1 of the first full bar. Count yourself in and let the pickup go by.' },
    { id: 'land-on-time', front: 'A barre change is not perfect yet. What matters most?', back: 'That it lands on time. Keep the beat; the shape gets cleaner with practice.' },
  ],
};

/** Unit 10 of Mia's course. */
const unit: TeacherUnit = {
  id: 'mia-first-barre',
  title: 'Your first barre chord',
  theme: 'chords',
  description: 'Climb to F in steps, from F major seven to the small F to the full barre, add G seven and B minor, and use them in songs.',
  lessons: [fmaj7AndSmallF, laCucaracha, theFullF, fInTheKeyOfC, bmBarre, auldLangSyne],
  checkpoint: { sample: 8, maxMistakes: 2 },
  milestone: {
    lesson: 'auld-lang-syne',
    step: 'show',
    piece: 'Auld Lang Syne',
    song: 'auld-lang-syne',
    celebrate: 'You played the verse of Auld Lang Syne with a barre chord in it. A few weeks ago {c:F} was the famous hurdle; now you have two barre chords. Next: your first scale, and your first solo.',
  },
  glossary: [
    { id: 'pickup', term: 'pickup', definition: 'A note or two before the first full bar of a song. You wait through it and come in on the next beat 1.' },
    { id: 'chord-chart', term: 'chord chart', definition: 'The chords of a song written in order, line by line, often above the words.' },
  ],
};

export default unit;
