/**
 * Dev, unit 7: Fingerstyle, thumb and fingers (plan: `dev/dev-fingerstyle` in
 * src/content/plan/teachers.json).
 *
 * p i m a and three arpeggio patterns, p-i-m-a-m-i across a 3/4 bar with a first pinch, Travis
 * picking (an alternating thumb that never stops), a melody over the Travis thumb, thumb-lead and
 * the steady-thumb blues, and a complete fingerstyle solo: Greensleeves. Dev's voice: a bandmate
 * who ties every idea to something to play tonight.
 *
 * Music from the song library: Fingerstyle: p i m a (66 BPM), p i m a m i in 3/4 (66), Travis
 * Picking (80), Travis Picking with a Melody (80), Thumb-Lead Melody with Brush Strums (88),
 * Fingerstyle Blues in E (84), Greensleeves (fingerstyle) (81 quarters = 54 dotted quarters).
 * All Through the Night, The Ash Grove and Down by the Riverside (Travis style) carry fallbacks
 * (O Come, All Ye Faithful, Brahms' Lullaby and the Travis melody study) until they are in the
 * library. `dev-fingerstyle.test.ts` checks every fret, note and shape the text names against the
 * engines, every tab figure against the library's studies, and every Player tempo.
 */
import type { TabNote } from '@/lessons';
import type { TeacherLesson, TeacherUnit } from '../types';
import { playerTask, techniqueTask } from '../tasks';

/** One tab note. */
function t(string: number, fret: number, duration: string): TabNote {
  return { string, fret, duration };
}

/** p-i-m-a twice over C (x32010): bar 1 of Fingerstyle: p i m a. */
export const PIMA_C: TabNote[] = [t(5, 3, 'e'), t(3, 0, 'e'), t(2, 1, 'e'), t(1, 0, 'e'), t(5, 3, 'e'), t(3, 0, 'e'), t(2, 1, 'e'), t(1, 0, 'e')];

/** p-i-m-a-m-i over Am (x02210): bar 1 of the 3/4 study. */
export const PIMAMI_AM: TabNote[] = [t(5, 0, 'e'), t(3, 2, 'e'), t(2, 1, 'e'), t(1, 0, 'e'), t(2, 1, 'e'), t(3, 2, 'e')];

/** p-i-m-a-m-i over E (022100): bar 3 of the 3/4 study. */
export const PIMAMI_E: TabNote[] = [t(6, 0, 'e'), t(3, 1, 'e'), t(2, 0, 'e'), t(1, 0, 'e'), t(2, 0, 'e'), t(3, 1, 'e')];

/** The Travis thumb alone on C: string 5, 4, 6, 4, one per beat. */
export const TRAVIS_THUMB_C: TabNote[] = [t(5, 3, 'q'), t(4, 2, 'q'), t(6, 3, 'q'), t(4, 2, 'q')];

/** Bar 1 of Travis Picking: thumb, i, thumb, m, thumb, i, thumb, m. */
export const TRAVIS_C: TabNote[] = [t(5, 3, 'e'), t(2, 1, 'e'), t(4, 2, 'e'), t(1, 0, 'e'), t(6, 3, 'e'), t(2, 1, 'e'), t(4, 2, 'e'), t(1, 0, 'e')];

/** The tune of bars 1 and 2 of Travis Picking with a Melody (the top notes, with their lengths). */
export const TRAVIS_TUNE_1_2: TabNote[] = [t(1, 0, 'q.'), t(1, 3, 'q.'), t(1, 0, 'q'), t(2, 3, 'q'), t(2, 1, 'h.')];

/** The thumb's tune in bar 1 of Thumb-Lead Melody with Brush Strums (a brush after each). */
export const CARTER_THUMB_1: TabNote[] = [t(5, 3, 'q'), t(4, 0, 'q'), t(4, 2, 'q'), t(5, 3, 'q')];

/** The blue-note slide of the fingerstyle blues: string 3, fret 3 (Bb) to fret 4 (B), then A and G. */
export const DELTA_SLIDE: TabNote[] = [t(3, 3, 'q'), t(3, 4, 'e'), t(3, 2, 'q'), t(3, 0, 'e')];

/** The tune of Greensleeves, bars 1 and 2 after the pickup (the top line of the arrangement). */
export const GREENSLEEVES_TUNE_1_2: TabNote[] = [
  t(2, 1, 'q'), t(2, 3, 'e'), t(1, 0, 'e.'), t(1, 2, 's'), t(1, 0, 'e'),
  t(2, 3, 'q'), t(2, 0, 'e'), t(3, 0, 'e.'), t(3, 2, 's'), t(2, 0, 'e'),
];

/** The show: the tune note on every dotted-quarter beat of the A section (bars 1 to 8 after the pickup). */
export const GREENSLEEVES_SHOW: TabNote[] = [
  [2, 1], [1, 0], [2, 3], [3, 0], [2, 1], [3, 2], [2, 0], [4, 2],
  [2, 1], [1, 0], [2, 3], [3, 0], [2, 1], [3, 1], [3, 2],
].map(([s, f]) => t(s, f, 'q.'));

/** The chords of the A section, bar by bar. */
export const GREENSLEEVES_A_CHORDS = ['Am', 'G', 'Am', 'E', 'Am', 'G', 'Am E', 'Am'] as const;

// ── 1. Thumb and fingers: p i m a ───────────────────────────────────────────────────────────────

const pima: TeacherLesson = {
  id: 'p-i-m-a',
  title: 'Thumb and fingers: p i m a',
  teaches: 'The thumb (p) plays the bass, and i, m and a pluck strings 3, 2 and 1: one finger, one string.',
  minutes: 5,
  skill: 'teacher:dev:p-i-m-a',
  steps: [
    {
      type: 'card',
      title: 'Every finger gets a job',
      body: 'Here is the deal: in fingerstyle every finger has one job. The thumb, {t:pima|p}, plays the bass strings, 6 to 4. The index, i, takes string 3, the middle, m, string 2, and the ring finger, a, string 1. Rest each one on its string and you are ready.',
      figure: {
        kind: 'fretboard',
        frets: [0, 3],
        dots: [
          { string: 5, fret: 3, note: 'C', label: 'p' },
          { string: 3, fret: 0, note: 'G', label: 'i' },
          { string: 2, fret: 1, note: 'C', label: 'm' },
          { string: 1, fret: 0, note: 'E', label: 'a' },
        ],
        caption: 'Over {c:C}: p on string 5, i on 3, m on 2, a on 1.',
      },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each finger with its job.',
      pairs: [
        { left: 'p, the thumb', right: 'Bass, strings 6 to 4' },
        { left: 'i, the index', right: 'String 3' },
        { left: 'm, the middle', right: 'String 2' },
        { left: 'a, the ring finger', right: 'String 1' },
      ],
      explain: 'The thumb takes the bass and each finger owns one treble string: i on 3, m on 2, a on 1. The letters come from the Spanish names the classical players use.',
      fact: 'fs-pima-jobs',
    },
    {
      type: 'card',
      title: 'From the knuckle',
      body: 'Pluck from the knuckle, where the finger joins the hand, and let the finger follow through toward your palm. The hand stays still above the strings: the fingers do the moving, not the wrist. The thumb pushes down and forward, toward the floor. That is a {t:free-stroke}.',
      tip: 'Watch the back of your hand. If it bounces, the hand is doing the fingers\' job.',
    },
    {
      type: 'choice',
      prompt: 'Your notes come out uneven and the back of your hand bounces. What is going on?',
      options: [
        { text: 'The hand is pulling: pluck from the knuckles', correct: true },
        { text: 'Your fingers are too relaxed', why: 'Relaxed is good. The trouble is the whole hand moving instead of the fingers.' },
        { text: 'You need longer nails', why: 'Nails change the tone, not the evenness. Keep the hand still.' },
      ],
      explain: 'When the hand pulls, every note comes out different. Keep the hand still and pluck from the knuckle: each finger, the same small move.',
      fact: 'fs-pima-knuckle',
    },
    {
      type: 'card',
      title: 'Three patterns',
      body: 'Over {c:C} (x32010) the thumb plays string 5, fret 3 ({n:C}). Start with p-i-m-a, up the strings. Then p-a-m-i: thumb, then down from the top. Then p-i-m-a-m-i: up and back down. Every note the same loudness.',
      figure: { kind: 'tab', tempo: 66, notes: PIMA_C, caption: 'p-i-m-a twice over {c:C}: bar 1 of the study.' },
    },
    {
      type: 'play-phrase',
      prompt: 'Play p-i-m-a twice over {c:C}, slowly: eight even notes.',
      notes: PIMA_C,
      octave: 'exact',
      tempo: 60,
      explain: '{n:C} on string 5, then the open {n:G}, {n:C} on string 2, fret 1 and the open {n:E}, twice. If one note jumps out, that finger is pulling too hard.',
      alternative: {
        type: 'order',
        prompt: 'p-i-m-a over {c:C}: put the strings in the order they are played.',
        tiles: ['String 5', 'String 3', 'String 2', 'String 1'],
        distractors: ['String 4'],
        explain: 'The thumb on string 5 for {c:C}, then i, m and a up the strings: 3, 2, 1.',
      },
    },
    techniqueTask({
      id: 'free-stroke',
      title: 'Free-stroke arpeggios on C',
      exercise: 'tech-pima-free-stroke',
      minutes: 4,
      body: 'Over {c:C}, one bar per pattern at 60 BPM: p-i-m-a, then p-a-m-i, then p-i-m-a-m-i. Go up the ladder 4 BPM at a time, and only when every note is even. Hand still; the fingers do the work.',
      tip: 'Fingers that fly far from the strings cost you time. Keep them close.',
    }),
    {
      type: 'choice',
      prompt: 'The study moves to {c:Dm} (xx0231). Which string does the thumb play now?',
      options: [
        { text: 'String 4, the open {n:D}', correct: true },
        { text: 'String 5', why: 'String 5 is the root for {c:C} and {c:Am}. In {c:Dm} it is not played.' },
        { text: 'String 6', why: 'String 6 is the root for {c:G7}. {c:Dm} starts on string 4.' },
      ],
      explain: 'The thumb follows the root: string 5 for {c:C} and {c:Am} (x02210), string 4 for {c:Dm}, string 6 for {c:G7} (320001). Look at the next bass note before the change.',
      fact: 'fs-thumb-root',
    },
    playerTask({
      id: 'pima-study-1',
      title: 'The p i m a study, bars 1 to 8',
      song: 'st-pima-arpeggios',
      bars: [1, 8],
      tempo: 91,
      minutes: 4,
      body: 'Loop bars 1 to 8 at 91 % (60 BPM): p-i-m-a over {c:C}, then over {c:Am}. Let each chord ring while you hold it. When every note is even, go to 121 % (80 BPM).',
    }),
    {
      type: 'true-false',
      statement: 'In bars 15 and 16 of the study, the thumb and a pluck together on beat 1.',
      answer: true,
      explain: 'That is a {t:pinch}: thumb and a squeeze toward each other and two notes sound at once, the bass and a top note.',
    },
    playerTask({
      id: 'pima-study-2',
      title: 'The p i m a study, bars 9 to 16',
      song: 'st-pima-arpeggios',
      bars: [9, 16],
      tempo: 91,
      minutes: 4,
      body: 'Now bars 9 to 16 at 91 % (60 BPM): p-a-m-i over {c:Dm}, then p-i-m-a-m-i-m-i over {c:G7}, with the pinch on beat 1 of bars 15 and 16. Then the whole study at 121 % (80 BPM).',
    }),
    playerTask({
      id: 'all-through-the-night',
      title: 'All Through the Night',
      song: 'all-through-the-night',
      tempo: 83,
      minutes: 5,
      body: 'Let the app play the melody and accompany it with p-i-m-a, twice a bar, on {c:G}, {c:C}, {c:D} and {c:Em}, at 83 % (about 60 BPM). Thumb on the root: string 6 for {c:G} and {c:Em}, 5 for {c:C}, 4 for {c:D}.',
      fallback: {
        tool: 'player',
        params: ['o-come-all-ye-faithful', 't75'],
        title: 'O Come, All Ye Faithful in p i m a',
        body: 'All Through the Night is not in the Songs library yet. Let the app play the tune of O Come, All Ye Faithful at 75 % (66 BPM) and play p-i-m-a in place of the strum: once per chord, twice where a chord fills the bar. Thumb on the root of each chord.',
      },
    }),
    {
      type: 'choice',
      prompt: 'Which pattern plays the thumb, then comes down from the top string?',
      options: [
        { text: 'p-a-m-i', correct: true },
        { text: 'p-i-m-a', why: 'p-i-m-a goes up from the thumb: i, m, then a on top.' },
        { text: 'p-i-m-a-m-i', why: 'That one goes up to a and back down, six notes.' },
      ],
      explain: 'p-a-m-i: the thumb, then a on string 1, m on 2, i on 3. Over {c:C} that is string 5, then 1, 2, 3.',
      fact: 'fs-pima-patterns',
    },
  ],
  facts: [
    { id: 'fs-pima-jobs', front: 'In fingerstyle, which strings do p, i, m and a play?', back: 'p, the thumb: the bass strings 6 to 4. i: string 3. m: string 2. a: string 1.' },
    { id: 'fs-pima-knuckle', front: 'How do you pluck evenly with the fingers?', back: 'From the knuckle, with the hand still above the strings: the fingers move, not the hand.' },
    { id: 'fs-pima-patterns', front: 'The three first arpeggio patterns?', back: 'p-i-m-a (up), p-a-m-i (thumb, then down from the top) and p-i-m-a-m-i (up and back down).' },
    { id: 'fs-thumb-root', front: 'Which string does the thumb play in an arpeggio?', back: 'The root\'s: string 5 for {c:C} and {c:Am}, string 4 for {c:Dm}, string 6 for {c:G7}.' },
  ],
};

// ── 2. A flowing arpeggio in 3/4 ────────────────────────────────────────────────────────────────

const threeFour: TeacherLesson = {
  id: 'three-four-arpeggio',
  title: 'A flowing arpeggio in 3/4',
  teaches: 'p-i-m-a-m-i is six eighth notes, exactly one bar of 3/4: thumb on the root, up to a and back down.',
  minutes: 5,
  skill: 'teacher:dev:three-four-arpeggio',
  steps: [
    {
      type: 'card',
      title: 'Six notes, one bar',
      body: 'Count with me: p-i-m-a-m-i is six eighth notes, and six eighths fill a bar of 3/4 exactly. Thumb on the root, up to a, back down to i, and the next bar starts. It flows like water, which is why waltzes and slow songs love it.',
      figure: { kind: 'tab', tempo: 66, time: '3/4', notes: PIMAMI_AM, caption: 'p-i-m-a-m-i over {c:Am}: one full bar of 3/4.' },
    },
    {
      type: 'type-answer',
      prompt: 'How many eighth notes fill one bar of 3/4?',
      answer: { kind: 'number', value: 6 },
      input: 'keypad',
      explain: 'Three beats, two eighths each: six. p-i-m-a-m-i is six notes, so the pattern and the bar end together.',
      fact: 'fs-pimami-bar',
    },
    {
      type: 'card',
      title: 'Four chords, three thumb strings',
      body: 'The study runs {c:Am} (x02210), {c:Dm} (xx0231), {c:E} (022100) and {c:Am} again, a bar each, with the thumb on strings 5, 4, 6 and 5. The fingers keep their strings; only the thumb moves.',
      figure: { kind: 'chord', symbol: 'E', frets: '022100', caption: '{c:E}: the thumb drops to the open string 6.' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each chord of the study with its thumb string.',
      pairs: [
        { left: '{c:Am}', right: 'String 5, open' },
        { left: '{c:Dm}', right: 'String 4, open' },
        { left: '{c:E}', right: 'String 6, open' },
      ],
      explain: 'Each chord\'s root is an open string: {n:A} on string 5, {n:D} on string 4, {n:E} on string 6. That is where the thumb goes.',
      fact: 'fs-pimami-thumbs',
    },
    {
      type: 'play-phrase',
      prompt: 'Play p-i-m-a-m-i over {c:Am}, then over {c:E}: two bars, twelve even notes.',
      notes: [...PIMAMI_AM, ...PIMAMI_E],
      octave: 'exact',
      tempo: 60,
      explain: 'Over {c:Am}: string 5, 3, 2, 1, 2, 3. Over {c:E} the thumb drops to string 6, and the fingers play strings 3, 2, 1, 2, 3 again.',
      alternative: {
        type: 'order',
        prompt: 'p-i-m-a-m-i over {c:Am}: put the strings in the order they are played.',
        tiles: ['String 5', 'String 3', 'String 2', 'String 1', 'String 2', 'String 3'],
        distractors: ['String 4'],
        explain: 'The thumb on string 5, then up 3, 2, 1 and back down 2, 3.',
      },
    },
    playerTask({
      id: 'pimami-study-1',
      title: 'The 3/4 study, bars 1 to 8',
      song: 'st-pimami-3-4',
      bars: [1, 8],
      tempo: 91,
      minutes: 4,
      body: 'Loop bars 1 to 8 at 91 % (60 BPM). Count "1 and 2 and 3 and": the thumb is always on 1. Keep the a note on string 1 as soft as the rest; it is the top of the wave, not a shout.',
    }),
    {
      type: 'card',
      title: 'Your first pinch',
      body: 'From bar 9 a melody note sits on top of beat 1: a plucks string 1 at the same moment as the thumb. That is a {t:pinch}, two notes in one moment. Squeeze thumb and a toward each other, as if you were picking up a coin.',
      figure: { kind: 'audio', sound: { kind: 'notes', notes: ['A2', 'E4'], together: true }, label: 'Hear a pinch' },
    },
    {
      type: 'fretboard-name',
      prompt: 'In bar 11, over {c:E}, the pinched melody note is string 1, fret 4. Which note is it?',
      position: { string: 1, fret: 4 },
      ask: 'note',
      spelling: 'any',
      options: ['G#', 'G', 'A', 'F#'],
      explain: 'String 1, fret 4 is {n:G#}, the third of {c:E}. The melody over the first four bars runs {n:E}, {n:F}, {n:G#}, {n:E}.',
      fact: 'fs-pimami-melody',
    },
    playerTask({
      id: 'pimami-study-2',
      title: 'The 3/4 study, bars 9 to 16',
      song: 'st-pimami-3-4',
      bars: [9, 16],
      tempo: 91,
      minutes: 4,
      body: 'Now bars 9 to 16 at 91 % (60 BPM), with the melody pinched on beat 1: {n:E}, {n:F}, {n:G#}, {n:E}, then {n:G}, {n:F}, {n:E}. Let the melody note sing a little louder than the arpeggio under it.',
    }),
    {
      type: 'true-false',
      statement: 'In a pinch, the thumb and a finger pluck at the same moment.',
      answer: true,
      explain: 'Two notes, one moment: the bass from the thumb and the melody from a, squeezed together.',
      fact: 'fs-pinch',
    },
    playerTask({
      id: 'ash-grove',
      title: 'The Ash Grove',
      song: 'the-ash-grove',
      tempo: 75,
      minutes: 5,
      body: 'The app plays the melody; you play p-i-m-a-m-i, a pattern per bar, on {c:G}, {c:C}, {c:D} and {c:Em}. At 75 % (72 BPM), then 100 % (96 BPM). Record a verse on your phone and listen: the thumb notes should be a little louder than the fingers.',
      fallback: {
        tool: 'player',
        params: ['brahms-lullaby'],
        title: 'Brahms\' Lullaby in p i m a m i',
        body: 'The Ash Grove is not in the Songs library yet, so take another waltz in {k:G major}: Brahms\' Lullaby at 100 % (72 BPM). Let the app play the melody; you play p-i-m-a-m-i, a bar each, on {c:G}, {c:C} and {c:D7}. Record it: is the thumb a little louder?',
      },
    }),
    {
      type: 'choice',
      prompt: 'You listen back and the bass disappears under the fingers. What do you change?',
      options: [
        { text: 'Give the thumb a little more weight', correct: true },
        { text: 'Pluck every finger harder', why: 'That raises everything at once, and the bass is still buried.' },
        { text: 'Leave the thumb out', why: 'The thumb is the floor of the whole sound. Keep it, a little stronger.' },
      ],
      explain: 'The bass is the floor and the beat. Let the thumb lean in a touch more than i, m and a, and the wave sits on solid ground.',
    },
  ],
  facts: [
    { id: 'fs-pimami-bar', front: 'Why does p-i-m-a-m-i suit 3/4?', back: 'It is six eighth notes, and six eighths fill one bar of 3/4 exactly: thumb on beat 1, up and back down.' },
    { id: 'fs-pimami-thumbs', front: 'Thumb strings for {c:Am}, {c:Dm} and {c:E}?', back: 'Open string 5 ({n:A}), open string 4 ({n:D}) and open string 6 ({n:E}): each chord\'s root.' },
    { id: 'fs-pinch', front: 'What is a pinch in fingerstyle?', back: 'The thumb and a finger plucking together: a bass note and a melody note in one moment.' },
    { id: 'fs-pimami-melody', front: 'Where is {n:G#} for a melody over {c:E} in open position?', back: 'String 1, fret 4: the third of {c:E}.' },
  ],
};

// ── 3. Travis picking ───────────────────────────────────────────────────────────────────────────

const travis: TeacherLesson = {
  id: 'travis-picking',
  title: 'Travis picking',
  teaches: 'In Travis picking the thumb alternates two bass strings on every beat, and i and m pick in between.',
  minutes: 5,
  skill: 'teacher:dev:travis-picking',
  steps: [
    {
      type: 'card',
      title: 'The engine of folk fingerstyle',
      body: '{t:travis-picking|Travis picking} is the engine under folk and country fingerstyle. The thumb plays every beat, alternating between two bass strings, steady as a clock: an {t:alternating-bass}. On {c:C} it goes string 5, 4, 6, 4. Get the thumb on autopilot first; the fingers come later.',
      figure: { kind: 'tab', tempo: 60, notes: TRAVIS_THUMB_C, caption: 'The thumb alone on {c:C}: strings 5, 4, 6, 4, one per beat.' },
    },
    {
      type: 'order',
      prompt: 'Put the thumb\'s four notes on {c:C} in order, beat 1 to beat 4.',
      tiles: ['String 5, fret 3', 'String 4, fret 2', 'String 6, fret 3', 'String 4, fret 2'],
      distractors: ['String 5, open'],
      explain: 'Root on string 5, string 4, then string 6, fret 3, and string 4 again. The thumb alternates: low, middle, lower, middle.',
      fact: 'fs-travis-c',
    },
    {
      type: 'card',
      title: 'Finger 3 hops',
      body: 'On {c:C} (x32010) the thumb plays string 5, fret 3 ({n:C}), string 4, string 6, fret 3 ({n:G}), string 4. So your finger 3 hops: it leaves the {n:C} for the {n:G} on beat 3 and comes back for beat 1.',
      figure: {
        kind: 'fretboard',
        frets: [0, 3],
        labels: 'finger',
        dots: [
          { string: 5, fret: 3, note: 'C', finger: 3, role: 'root' },
          { string: 6, fret: 3, note: 'G', finger: 3 },
          { string: 4, fret: 2, note: 'E', finger: 2 },
        ],
        caption: 'Finger 3 moves between string 5 and string 6 at fret 3.',
      },
    },
    {
      type: 'fretboard-name',
      prompt: 'On beat 3, finger 3 hops to string 6, fret 3. Which note does the thumb play there?',
      position: { string: 6, fret: 3 },
      ask: 'note',
      spelling: 'any',
      options: ['G', 'A', 'F', 'C'],
      explain: 'String 6, fret 3 is {n:G}, the fifth of {c:C}. Root on 1, fifth on 3: that is the alternating bass.',
      fact: 'fs-travis-c',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Away from the guitar: tap the thumb on your knee, one tap per click, for two bars.',
      rhythm: { pattern: 'q q q q | q q q q' },
      tempo: 60,
      show: 'both',
      explain: 'Eight even taps: the thumb never speeds up, never slows down, never stops. That is the clock everything else hangs on.',
    },
    techniqueTask({
      id: 'travis-thumb',
      title: 'The Travis thumb, muted',
      exercise: 'tech-travis-thumb',
      minutes: 3,
      body: 'Rest the edge of your picking hand lightly on strings 4 to 6 by the bridge and play the thumb alone on {c:C}, string 5, 4, 6, 4, for 2 minutes at 60 BPM. Steady as a clock. Then add the pinch on beat 1.',
      tip: 'If the mute kills the bass completely, ease off: the notes should thump, not vanish.',
    }),
    {
      type: 'card',
      title: 'Fingers in between',
      body: 'Now the fingers drop in between the thumb notes: i plucks string 2 on the "and" of 1 and 3, m plucks string 1 on the "and" of 2 and 4. Thumb, i, thumb, m, thumb, i, thumb, m: eight even eighth notes.',
      figure: { kind: 'tab', tempo: 60, notes: TRAVIS_C, caption: 'Bar 1 of Travis Picking: thumb on the beats, i and m on the "ands".' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Now only the fingers\' part: tap on every "and", between the clicks.',
      rhythm: { pattern: 'er e er e er e er e' },
      tempo: 60,
      show: 'both',
      explain: 'The finger notes all fall on the "and": off the beat, between the thumb notes. Tap it on a table while your foot keeps the beat.',
    },
    {
      type: 'play-phrase',
      prompt: 'Play bar 1 of Travis Picking on {c:C}: thumb, i, thumb, m, four times.',
      notes: TRAVIS_C,
      octave: 'exact',
      tempo: 60,
      explain: 'Thumb on strings 5, 4, 6, 4; i on string 2 ({n:C}), m on string 1 ({n:E}) in between. Eight even notes.',
      alternative: {
        type: 'match-pairs',
        prompt: 'Match each finger with what it plays on {c:C}.',
        pairs: [
          { left: 'Thumb', right: 'Strings 5, 4, 6, 4' },
          { left: 'i', right: 'String 2, on 1 & and 3 &' },
          { left: 'm', right: 'String 1, on 2 & and 4 &' },
        ],
        explain: 'The thumb owns the beats and alternates the bass; i and m fill the "ands" on strings 2 and 1.',
      },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each chord of the study with its thumb notes.',
      pairs: [
        { left: '{c:C} (x32010)', right: 'Strings 5, 4, 6, 4' },
        { left: '{c:G7} (320001)', right: 'String 6, fret 3; open 4' },
        { left: '{c:Am} (x02210)', right: 'Open 5; string 4, fret 2' },
      ],
      explain: 'Root, then the next string up: {c:G7} rocks between {n:G} and the open {n:D}, {c:Am} between the open {n:A} and {n:E}. Only {c:C} uses three strings.',
      fact: 'fs-travis-chords',
    },
    playerTask({
      id: 'travis-study',
      title: 'Travis Picking',
      song: 'st-travis-picking',
      tempo: 75,
      minutes: 5,
      body: 'Play the study at 75 % (60 BPM), then 100 % (80 BPM): {c:C}, {c:Am}, {c:G7}, {c:C}, bass lightly muted. Bars 9 to 16 add a pinch on beat 1, thumb and m together.',
    }),
    {
      type: 'choice',
      prompt: 'The fingers are getting quick and your thumb starts rushing to keep up. What do you do?',
      options: [
        { text: 'Slow down: the thumb is the clock', correct: true },
        { text: 'Let the thumb follow the fingers', why: 'Then there is no clock at all, and the groove falls apart.' },
        { text: 'Drop the thumb for a bar', why: 'The thumb never stops in Travis picking. Slow down instead.' },
      ],
      explain: 'In Travis picking the thumb sets the time and the fingers fit around it. When it wobbles, the tempo is too fast for now.',
      fact: 'fs-travis-clock',
    },
  ],
  facts: [
    { id: 'fs-travis-what', front: 'What is Travis picking?', back: 'The thumb alternates two bass strings on every beat, steady as a clock, while i and m pick the treble strings in between.' },
    { id: 'fs-travis-c', front: 'The Travis thumb on {c:C} (x32010)?', back: 'String 5, fret 3 ({n:C}), string 4, string 6, fret 3 ({n:G}), string 4. Finger 3 hops between strings 5 and 6.' },
    { id: 'fs-travis-chords', front: 'The Travis thumb on {c:G7} and {c:Am}?', back: '{c:G7}: string 6, fret 3 and the open string 4. {c:Am}: the open string 5 and string 4, fret 2.' },
    { id: 'fs-travis-clock', front: 'Your Travis thumb wobbles. Why, and what then?', back: 'The tempo is too fast for now. Slow down until the thumb is steady: it is the clock.' },
  ],
};

// ── 4. A melody over the Travis thumb ───────────────────────────────────────────────────────────

const travisMelody: TeacherLesson = {
  id: 'travis-melody',
  title: 'A melody over the Travis thumb',
  teaches: 'Over the Travis thumb, each melody note lands with a thumb note (a pinch) or between two (syncopated).',
  minutes: 5,
  skill: 'teacher:dev:travis-melody',
  steps: [
    {
      type: 'card',
      title: 'From a pattern to a tune',
      body: 'Now the fingers stop playing a pattern and play a tune. The thumb keeps its job. Each melody note either falls with a thumb note, a pinch, or between two thumb notes, off the beat: {t:syncopation}. In the study\'s first bar the tune lands on beat 1, the "and" of 2, and beat 4.',
      figure: { kind: 'rhythm', pattern: 'q. q. q', time: '4/4', tempo: 60, caption: 'The tune of bar 1: on 1, on the "and" of 2, on 4.' },
    },
    {
      type: 'choice',
      prompt: 'A melody note falls on the "and" of 2, between two thumb notes. What is that called?',
      options: [
        { text: 'Syncopated: off the beat', correct: true },
        { text: 'A pinch', why: 'A pinch lands with a thumb note, on the beat. This one falls between them.' },
        { text: 'A rest', why: 'A rest is a silence. This is a note, just off the beat.' },
      ],
      explain: 'Off the beat is syncopated. Between the thumb notes is the only place it can go, so the thumb never has to change.',
      fact: 'fs-melody-two-places',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap the tune of bar 1: on beat 1, on the "and" of 2, on beat 4.',
      rhythm: { pattern: 'q. q. q' },
      tempo: 60,
      show: 'both',
      explain: 'Long, long, short: the second note comes half a beat early, on the "and" of 2. That push is what makes fingerstyle swing along.',
    },
    {
      type: 'card',
      title: 'The thumb is your metronome',
      body: 'If the thumb stumbles, slow down: it is your {t:metronome}. Pinch the notes on the beat; let the off-beat notes fall between thumb strokes. In the study the tune stays on strings 1 and 2: m plucks string 1, i plucks string 2.',
      figure: { kind: 'tab', tempo: 60, notes: TRAVIS_TUNE_1_2, caption: 'The tune of bars 1 and 2 alone: {n:E} {n:G} {n:E}, {n:D} {n:C}.' },
    },
    playerTask({
      id: 'travis-melody-study',
      title: 'Travis Picking with a Melody',
      song: 'st-travis-melody',
      tempo: 75,
      minutes: 5,
      body: 'Play the study at 75 % (60 BPM), then 95 % (76 BPM). First play the tune alone, then add the thumb under it. Bass a little quieter than the tune: the thumb drives, the tune sings.',
    }),
    {
      type: 'play-phrase',
      prompt: 'Play bars 1 and 2 of the study with the thumb going. The microphone follows the tune.',
      notes: TRAVIS_TUNE_1_2,
      octave: 'exact',
      tempo: 60,
      explain: '{n:E} pinched on beat 1, {n:G} on the "and" of 2, {n:E} pinched on 4, then {n:D} and {n:C} on string 2. The thumb keeps alternating under all of it.',
      alternative: {
        type: 'order',
        prompt: 'Put the tune of bars 1 and 2 in order.',
        tiles: ['{n:E}', '{n:G}', '{n:E}', '{n:D}', '{n:C}'],
        distractors: ['{n:F}'],
        explain: '{n:E} on string 1, {n:G} at string 1, fret 3, {n:E} again, then {n:D} and {n:C} on string 2, frets 3 and 1.',
      },
    },
    {
      type: 'card',
      title: 'Down by the Riverside in C',
      body: 'Down by the Riverside, Travis style, in {k:C major}: {c:C}, {c:G7} and {c:F} (xx3211). Under {c:F} the thumb alternates string 4, fret 3 ({n:F}) and string 3, fret 2 ({n:A}). The melody notes sit on top of the shapes.',
      figure: { kind: 'chord', symbol: 'F', frets: 'xx3211', caption: '{c:F}: the thumb on string 4, fret 3 and string 3, fret 2.' },
    },
    {
      type: 'fretboard-find',
      prompt: 'Under {c:F} (xx3211), tap both thumb notes on strings 4 and 3.',
      find: { chord: 'F' },
      mode: 'all',
      octave: 'any',
      frets: [0, 3],
      strings: [4, 3],
      explain: 'String 4, fret 3 is {n:F} and string 3, fret 2 is {n:A}: the root and the third of {c:F}, a string apart.',
      fact: 'fs-travis-f',
    },
    playerTask({
      id: 'riverside-wait',
      title: 'Down by the Riverside, wait mode',
      song: 'down-by-the-riverside-travis',
      mode: 'wait',
      bars: [1, 8],
      minutes: 5,
      body: 'Wait mode, the first 8 bars: the music waits for each right note. Find the melody notes first; the thumb notes under them are patterns you already know.',
      fallback: {
        tool: 'player',
        params: ['st-travis-melody', 'm9-16', 'wait'],
        title: 'The Travis melody, bars 9 to 16',
        body: 'Down by the Riverside (Travis style) is not in the Songs library yet. Meanwhile, take the second half of the Travis melody study in wait mode, bars 9 to 16: the same {c:C}, {c:G7} and {c:F}, with {c:F} on strings 4 and 3 under the thumb.',
      },
    }),
    {
      type: 'match-pairs',
      prompt: 'Match each chord with its Travis thumb.',
      pairs: [
        { left: '{c:C}', right: 'Strings 5, 4, 6, 4' },
        { left: '{c:G7}', right: 'Strings 6 and 4' },
        { left: '{c:F}', right: 'Strings 4 and 3' },
      ],
      explain: '{c:C} alternates three strings; {c:G7} rocks between string 6, fret 3 and the open string 4; {c:F} between string 4, fret 3 and string 3, fret 2.',
      fact: 'fs-travis-f',
    },
    playerTask({
      id: 'riverside-whole',
      title: 'Down by the Riverside, all of it',
      song: 'down-by-the-riverside-travis',
      tempo: 80,
      minutes: 5,
      body: 'The whole arrangement at 80 % (64 BPM), then 100 % (80 BPM). If you drop a melody note, keep the thumb going and catch the next one.',
      fallback: {
        tool: 'player',
        params: ['st-travis-melody'],
        title: 'The Travis melody at full speed',
        body: 'Down by the Riverside (Travis style) is not in the Songs library yet. Play the whole Travis melody study at 100 % (80 BPM) instead. If you drop a melody note, keep the thumb going and catch the next one.',
      },
    }),
    {
      type: 'choice',
      prompt: 'The tune gets syncopated and your thumb starts to follow it off the beat. What helps?',
      options: [
        { text: 'Slow down until the thumb stays put', correct: true },
        { text: 'Syncopate the thumb too', why: 'Then nothing holds the beat. The thumb stays on it, always.' },
        { text: 'Play the tune on the beat instead', why: 'Then it is a different tune. Keep the push, slow the tempo.' },
      ],
      explain: 'The thumb is the metronome. Slow down until it holds steady under the off-beat notes, then build the tempo back up.',
    },
  ],
  facts: [
    { id: 'fs-melody-two-places', front: 'Over a Travis thumb, where can a melody note fall?', back: 'With a thumb note, as a pinch on the beat, or between two thumb notes, off the beat: syncopated.' },
    { id: 'fs-travis-f', front: 'The Travis thumb under {c:F} (xx3211)?', back: 'String 4, fret 3 ({n:F}) and string 3, fret 2 ({n:A}).' },
    { id: 'fs-melody-strings', front: 'In the Travis melody study, who plays the tune?', back: 'm on string 1 and i on string 2. The thumb keeps its alternating bass.' },
  ],
};

// ── 5. Thumb-lead and fingerstyle blues ─────────────────────────────────────────────────────────

const thumbLead: TeacherLesson = {
  id: 'thumb-lead-and-blues',
  title: 'Thumb-lead and fingerstyle blues',
  teaches: 'In thumb-lead the thumb plays the tune; in the fingerstyle blues it thumps one string under the tune.',
  minutes: 5,
  skill: 'teacher:dev:thumb-lead-and-blues',
  steps: [
    {
      type: 'card',
      title: 'Engine two: the thumb sings',
      body: 'Two more fingerstyle engines. First, {t:thumb-lead}: the thumb plays the melody on strings 6 to 4, and on every "and" the index brushes down across strings 3 to 1. Tune on the beat, brush on the "and". In the study\'s first bar the thumb sings {n:C} {n:D} {n:E} {n:C}.',
      figure: { kind: 'tab', tempo: 70, notes: CARTER_THUMB_1, caption: 'Bar 1, the thumb\'s tune only: a brush follows every note.' },
    },
    {
      type: 'fretboard-name',
      prompt: 'The thumb\'s third note in bar 1 is string 4, fret 2. Which note is it?',
      position: { string: 4, fret: 2 },
      ask: 'note',
      spelling: 'any',
      options: ['E', 'F', 'D', 'F#'],
      explain: 'String 4, fret 2 is {n:E}. The tune climbs {n:C}, the open {n:D}, {n:E}, then drops back to {n:C}.',
    },
    {
      type: 'choice',
      prompt: 'In thumb-lead style, when does the index brush the top strings?',
      options: [
        { text: 'On the "and", between the tune notes', correct: true },
        { text: 'On the beat, with the thumb', why: 'The beat belongs to the tune in the thumb. The brush answers it on the "and".' },
        { text: 'Only at the end of each bar', why: 'The brush comes after every tune note, all the way through.' },
      ],
      explain: 'Thumb on the beat, brush on the "and": tune, chord, tune, chord. Keep the brushes light so the tune stays on top.',
      fact: 'fs-thumb-lead',
    },
    playerTask({
      id: 'thumb-lead-study',
      title: 'Thumb-lead with brush strums',
      song: 'st-carter-style',
      tempo: 80,
      minutes: 5,
      body: 'Play the study at 80 % (70 BPM): {c:C}, {c:F} and {c:G7}. Brushes light, from i alone; the tune is in the thumb, so let those notes ring and keep them louder than the brushes.',
    }),
    {
      type: 'card',
      title: 'Engine three: the steady thumb',
      body: 'The fingerstyle blues: the thumb thumps steady quarter notes on an open low string, string 6 for {c:E7}, string 5 for {c:A7}, and never changes. The fingers play a blues tune in open E on top, flat fifth included: string 3, fret 3 ({n:Bb}), a blue note that slides up to {n:B}.',
      figure: { kind: 'tab', tempo: 60, notes: DELTA_SLIDE, caption: 'The blue-note move on string 3: {n:Bb} slides to {n:B}, then {n:A} and {n:G}.' },
    },
    {
      type: 'choice',
      prompt: 'In the blues in E, which note is the flat fifth at string 3, fret 3?',
      options: [
        { text: '{n:Bb}', correct: true },
        { text: '{n:B}', why: '{n:B} is the plain fifth, one fret higher: the tune slides from the {n:Bb} up to it.' },
        { text: '{n:A}', why: '{n:A} is string 3, fret 2: the fourth of {n:E}.' },
        { text: '{n:G}', why: '{n:G} is the open string 3: the flat third of {n:E}.' },
      ],
      explain: '{n:E} up to {n:B} is a fifth; a fret lower, {n:Bb}, is the flat fifth, the bluest note of all. In the tune it never sits still: it slides up to {n:B}.',
      fact: 'fs-blues-blue-note',
    },
    {
      type: 'play-note',
      prompt: 'Play the blue note: string 3, fret 3, with finger 3.',
      note: 'Bb3',
      octave: 'exact',
      where: { string: 3, fret: 3 },
      explain: 'String 3, fret 3 is {n:Bb}, the flat fifth of {n:E}. In the tune you pluck it and slide straight up a fret to {n:B}.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap the flat fifth of {n:E} on string 3, in open position.',
        find: { note: 'Bb3' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 4],
        strings: [3],
        explain: 'String 3, fret 3 is {n:Bb}, a fret below the plain fifth, {n:B}.',
      },
    },
    techniqueTask({
      id: 'thumb-independence',
      title: 'Thumb independence',
      exercise: 'tech-thumb-independence',
      minutes: 4,
      body: 'At 50 BPM: hold {c:E} (022100) and let the thumb play steady quarters, the open string 6 and string 4, fret 2 ({n:E}), while i plays off the beat on string 3. Then i and m add a little syncopated tune on strings 1 and 2.',
      tip: 'The classic slip: the thumb follows the fingers into the syncopation. Say "1 2 3 4" out loud with the thumb.',
    }),
    {
      type: 'true-false',
      statement: 'In the fingerstyle blues, the thumb follows the tune into its syncopations.',
      answer: false,
      explain: 'The thumb never follows: steady quarters on one open string per chord, lightly muted, while the tune pushes and pulls on top.',
      fact: 'fs-steady-thumb',
    },
    playerTask({
      id: 'delta-blues',
      title: 'Fingerstyle Blues in E',
      song: 'st-delta-blues-e',
      tempo: 71,
      minutes: 5,
      body: 'Play the blues at 71 % (60 BPM), then 90 % (76 BPM). It swings: long-short in every beat. The thumb thumps string 6 under {c:E7}, string 5 under {c:A7}, and string 5, fret 2 under {c:B7}.',
    }),
    {
      type: 'match-pairs',
      prompt: 'Match each fingerstyle engine with the thumb\'s job.',
      pairs: [
        { left: 'Travis picking', right: 'Alternates two strings' },
        { left: 'Thumb-lead', right: 'Plays the tune' },
        { left: 'Steady-thumb blues', right: 'Repeats one open string' },
      ],
      explain: 'Three engines, three thumbs: alternating for Travis, singing for thumb-lead, thumping one string for the blues. The fingers fit around whichever you choose.',
      fact: 'fs-three-engines',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap the blue note of the blues in E: the flat fifth, on string 3.',
      find: { note: 'Bb' },
      mode: 'one',
      octave: 'any',
      frets: [0, 4],
      strings: [3],
      explain: 'String 3, fret 3 is {n:Bb}. Pluck it, slide up to fret 4, and you have the blues in one move.',
      fact: 'fs-blues-blue-note',
    },
  ],
  facts: [
    { id: 'fs-thumb-lead', front: 'What is thumb-lead fingerstyle?', back: 'The thumb plays the melody on strings 6 to 4, on the beat, and the index brushes the top strings on every "and".' },
    { id: 'fs-steady-thumb', front: 'What does the thumb do in a fingerstyle blues?', back: 'Steady quarter notes on one open low string per chord, never changing, while the fingers play the tune.' },
    { id: 'fs-blues-blue-note', front: 'The blue note of a blues in E, on string 3?', back: 'Fret 3, {n:Bb}: the flat fifth. It slides up a fret to {n:B}.' },
    { id: 'fs-three-engines', front: 'The thumb in Travis, thumb-lead and the steady-thumb blues?', back: 'Travis: alternates two bass strings. Thumb-lead: plays the tune. Blues: repeats one open string.' },
  ],
};

// ── 6. A complete fingerstyle solo: Greensleeves (milestone) ────────────────────────────────────

const greensleeves: TeacherLesson = {
  id: 'fingerstyle-solo',
  title: 'A complete solo: Greensleeves',
  teaches: 'Greensleeves in 6/8: a bass note on each dotted-quarter beat, the tune on top, chord notes in between.',
  minutes: 5,
  skill: 'teacher:dev:fingerstyle-solo',
  steps: [
    {
      type: 'card',
      title: 'A tune from 1580',
      body: 'Greensleeves was registered in 1580 and is still one of the best fingerstyle tunes there is. Our setting puts a bass note on each dotted-quarter beat, two per bar of 6/8, the tune on top and chord notes in between. The harmony: {c:Am}, {c:G}, {c:Am}, {c:E} and so on.',
      figure: { kind: 'tab', tempo: 81, time: '6/8', notes: GREENSLEEVES_TUNE_1_2, caption: 'The tune of bars 1 and 2, the line on top of the bass.' },
    },
    {
      type: 'choice',
      prompt: 'How many bass notes does your thumb play in each bar of this setting?',
      options: [
        { text: 'Two, one on each dotted-quarter beat', correct: true },
        { text: 'Six, one per eighth note', why: 'Six eighths fill the bar, but only two of them are beats.' },
        { text: 'Three, like a waltz', why: 'A waltz is 3/4. 6/8 sways in two big beats of three eighths.' },
      ],
      explain: '6/8 has two beats, each a dotted quarter. The thumb marks both, and the tune and the chord notes move above it.',
      fact: 'fs-greensleeves-bass',
    },
    {
      type: 'card',
      title: 'F or F sharp: pick one',
      body: 'Both {n:F} and {n:F#} are traditional for the sixth note of the tune\'s scale. Choose one and keep it. Our arrangement takes {n:F#} every time: string 1, fret 2 ({n:F#}) up high and string 4, fret 4 ({n:F#}) down low.',
      tip: 'Swapping between the two halfway through is the one thing that really sounds wrong.',
    },
    {
      type: 'true-false',
      statement: 'In this arrangement, the sixth note of the scale is {n:F#} every time it comes.',
      answer: true,
      explain: '{n:F} and {n:F#} are both traditional; this setting chose {n:F#} and keeps it, high and low. Whichever you choose, keep it.',
      fact: 'fs-greensleeves-sixth',
    },
    {
      type: 'card',
      title: 'Four shapes under the tune',
      body: 'The left hand works from four chords: {c:Am} (x02210), {c:G} (320003), {c:E} (022100) and {c:C} (x32010), with tune notes added on top. The A section: {c:Am}, {c:G}, {c:Am}, {c:E}, then {c:Am}, {c:G}, a bar of {c:Am} to {c:E}, and home to {c:Am}.',
      figure: { kind: 'chord', symbol: 'E', frets: '022100', caption: '{c:E}: its {n:G#} leads the tune back home to {n:A}.' },
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'E',
      frets: '022100',
      accept: 'this-shape',
      prompt: 'Build {c:E} (022100), the chord under the end of each phrase.',
      explain: '{c:E}: fingers 2 and 3 on string 5 and 4 at fret 2, finger 1 on string 3, fret 1 ({n:G#}). That {n:G#} is a half step under {n:A}, so the tune wants to go home.',
    },
    playerTask({
      id: 'greensleeves-wait',
      title: 'Greensleeves, the A section',
      song: 'greensleeves-fingerstyle',
      mode: 'wait',
      bars: [1, 9],
      minutes: 5,
      body: 'Wait mode, the A section: the pickup and eight bars. The music waits for each right note, so find every bass note and tune note at your own speed. Thumb on each beat, the tune on top.',
    }),
    {
      type: 'order',
      prompt: 'Put the chords of the first four bars of the A section in order.',
      tiles: ['{c:Am}', '{c:G}', '{c:Am}', '{c:E}'],
      distractors: ['{c:Dm}'],
      explain: '{c:Am}, {c:G}, {c:Am}, {c:E}: the phrase goes out and comes back, and the {c:E} turns it round for the second half.',
      fact: 'fs-greensleeves-chords',
    },
    playerTask({
      id: 'greensleeves-loop',
      title: 'Greensleeves, two bars at a time',
      song: 'greensleeves-fingerstyle',
      bars: [2, 3],
      tempo: 74,
      minutes: 5,
      body: 'Loop bars 2 and 3 at 74 % (40 BPM, counting dotted quarters), until they are easy. Then move the loop: bars 4 and 5, 6 and 7, 8 and 9. Then join them up two loops at a time.',
      tip: 'Play the tune alone first, then add the bass under it.',
    }),
    {
      type: 'choice',
      prompt: 'Two bars keep falling apart at full speed. What is the smart move?',
      options: [
        { text: 'Loop just those two bars, slower', correct: true },
        { text: 'Keep playing the whole piece until it comes', why: 'Every run-through rehearses the mistake again. Isolate it.' },
        { text: 'Skip them in performance', why: 'A piece with a hole in it is not finished. Loop it, then join it back in.' },
      ],
      explain: 'Loop the trouble spot slowly until it is boring, then put it back into the bars around it. That is how a whole piece gets clean.',
    },
    playerTask({
      id: 'greensleeves-whole',
      title: 'Greensleeves, the whole piece',
      song: 'greensleeves-fingerstyle',
      tempo: 85,
      minutes: 5,
      body: 'The whole piece, A and B, at 85 % (46 BPM, counting dotted quarters), then 100 % (54 BPM). Two slow, swaying beats in every bar. Record a complete take on your phone: does the tune sit on top of the bass?',
    }),
    {
      type: 'card',
      title: 'Your show',
      body: 'Gig time: the A section, start to finish. The pickup, eight bars, a bass note on every beat and the tune on top. Count yourself in, two slow beats: "1 2 3, 4 5 6". The microphone follows the tune note on each beat. A wrong note is just a note; keep the thumb going.',
    },
    {
      type: 'play-phrase',
      id: 'show',
      prompt: 'Your show: Greensleeves, the A section, start to finish. Keep the thumb going.',
      notes: GREENSLEEVES_SHOW,
      octave: 'exact',
      tempo: 81,
      pass: 0.8,
      explain: 'On the beats the tune goes {n:C} {n:E}, {n:D} {n:G}, {n:C} {n:A}, {n:B} {n:E}, then {n:C} {n:E}, {n:D} {n:G}, {n:C} {n:G#} and home to {n:A}. About 8 in 10 is a pass.',
      alternative: {
        type: 'order',
        prompt: 'Put the eight bars of the A section in order, chord by chord.',
        tiles: ['{c:Am}', '{c:G}', '{c:Am}', '{c:E}', '{c:Am}', '{c:G}', '{c:Am} {c:E}', '{c:Am}'],
        explain: '{c:Am} {c:G} {c:Am} {c:E}, then {c:Am} {c:G}, a bar that moves from {c:Am} to {c:E}, and home to {c:Am}.',
      },
    },
  ],
  facts: [
    { id: 'fs-greensleeves-bass', front: 'In a 6/8 fingerstyle setting, where does the thumb play?', back: 'On each dotted-quarter beat: two bass notes a bar, with the tune and chord notes above.' },
    { id: 'fs-greensleeves-sixth', front: 'Greensleeves: {n:F} or {n:F#} for the sixth note of its scale?', back: 'Both are traditional. Choose one and keep it all the way through.' },
    { id: 'fs-greensleeves-chords', front: 'The chords of Greensleeves\' first four bars?', back: '{c:Am}, {c:G}, {c:Am}, {c:E}.' },
  ],
};

/** Unit 7 of Dev's course. */
const unit: TeacherUnit = {
  id: 'dev-fingerstyle',
  title: 'Fingerstyle: thumb and fingers',
  theme: 'technique',
  description: 'A thumb on the bass and fingers on top: arpeggios, Travis picking, thumb-lead, the blues and a complete solo.',
  lessons: [pima, threeFour, travis, travisMelody, thumbLead, greensleeves],
  checkpoint: { sample: 8, maxMistakes: 2 },
  milestone: {
    lesson: 'fingerstyle-solo',
    step: 'show',
    piece: 'Greensleeves',
    song: 'greensleeves-fingerstyle',
    celebrate: 'That was a whole fingerstyle solo: bass, tune and harmony from one right hand, in 6/8, and you kept it moving. Next we make your chords richer: seventh chords, four colours at a time.',
  },
  glossary: [
    { id: 'pima', term: 'p i m a', definition: 'The picking-hand fingers: p the thumb, i the index, m the middle, a the ring finger (from their Spanish names).' },
    { id: 'free-stroke', term: 'free stroke', definition: 'A finger plucks the string and swings clear, toward the palm, without coming to rest on the next string.' },
    { id: 'pinch', term: 'pinch', definition: 'The thumb and a finger plucking at the same moment: a bass note and a melody note together.' },
    { id: 'travis-picking', term: 'Travis picking', definition: 'Fingerstyle with an alternating thumb on every beat and the fingers picking in between.' },
    { id: 'alternating-bass', term: 'alternating bass', definition: 'A thumb part that rocks between two bass strings, one note per beat, usually the root and the fifth.' },
    { id: 'thumb-lead', term: 'thumb-lead', definition: 'A fingerstyle where the thumb plays the melody on the bass strings and a finger brushes the chord in between.' },
  ],
};

export default unit;
