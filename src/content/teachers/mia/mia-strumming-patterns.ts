/**
 * Mia, unit 7: Strumming patterns (plan: `mia/mia-strumming-patterns` in src/content/plan/teachers.json).
 *
 * The folk pattern with its miss on 3 (and Wade in the Water's own groove, as unit 6 promised),
 * keeping it going through whole songs, accents and chucks on 2 and 4, feeling 6/8, Silent Night
 * strummed and then with a first fingerpicking pattern, boom-chick with alternating bass notes,
 * and a set of three songs in three strums, with Oh! Susanna as the encore the microphone hears.
 * Every lesson follows its plan entry: the plan's `explain` in Mia's voice on the cards, its
 * `show` as figures, its `practice` as exercises (`Mic` with a tapping alternative) or tasks that
 * send the learner to the Player, Rhythm, the Metronome, Technique, the Tuner, the chord trainer
 * or the Practice Plan and back.
 *
 * Music from the song library: Strumming: The Folk Pattern (80 BPM), Strumming: 6/8 (84 quarters,
 * a dotted quarter of 56), Strumming: Boom-Chick (88), Silent Night (75 quarters, 50 big beats),
 * Row, Row, Row Your Boat (84 quarters, 56), Greensleeves (81 quarters, 54), She'll Be Coming
 * 'Round the Mountain (108), Oh! Susanna (92) and Amazing Grace (84). Three planned songs are not
 * in the library: Wade in the Water falls back to a jam on its chords (Em, Am, B7), Down by the
 * Riverside to She'll Be Coming 'Round the Mountain (the same G, C and D7, at the plan's 108) and
 * Go Tell It on the Mountain to a jam on G, C and D7. Their tempos are the repertoire plan's
 * (84, 108, 100). `mia-strumming-patterns.test.ts` checks the patterns, the bass notes, the
 * picking pattern and the encore against the library and the engines.
 */
import type { TabNote } from '@/lessons';
import type { TeacherLesson, TeacherUnit } from '../types';
import { playerTask, techniqueTask, toolTask } from '../tasks';

/** The folk pattern as one character per eighth note (D down, U up, - miss), and as note lengths. */
export const FOLK_PATTERN = 'D-DU-UDU';
export const FOLK_RHYTHM = 'q e q e e e';

/** The 6/8 strum: down, down, up, twice a bar. */
export const SIX_EIGHT_PATTERN = 'DDUDDU';

/** One bar of the Silent Night picking pattern on G, as the library's fingerpicked part has it: p i m, p a m. */
export const PICKING_G: TabNote[] = [
  { string: 6, fret: 3, duration: 'e' },
  { string: 3, fret: 0, duration: 'e' },
  { string: 2, fret: 0, duration: 'e' },
  { string: 4, fret: 0, duration: 'e' },
  { string: 1, fret: 3, duration: 'e' },
  { string: 2, fret: 0, duration: 'e' },
];

/** The boom-chick bass notes of Strumming: Boom-Chick, two bars of each chord (G, C, D7), strums left out. */
export const BOOM_BASS: TabNote[] = [
  { string: 6, fret: 3, duration: 'h' },
  { string: 4, fret: 0, duration: 'h' },
  { string: 6, fret: 3, duration: 'h' },
  { string: 4, fret: 0, duration: 'h' },
  { string: 5, fret: 3, duration: 'h' },
  { string: 6, fret: 3, duration: 'h' },
  { string: 5, fret: 3, duration: 'h' },
  { string: 6, fret: 3, duration: 'h' },
  { string: 4, fret: 0, duration: 'h' },
  { string: 5, fret: 0, duration: 'h' },
  { string: 4, fret: 0, duration: 'h' },
  { string: 5, fret: 0, duration: 'h' },
];

/**
 * The encore: Oh! Susanna's first two lines and its chorus in boom-chick, one bass note on beat 1
 * of each 2/4 bar (the strum on beat 2 is the learner's). A chord starts on its root and alternates
 * bar to bar: G with string 6 fret 3 and the open string 4, C with string 5 fret 3 and string 6
 * fret 3, D7 on the open string 4.
 */
export const SUSANNA_BASS: TabNote[] = [
  // I come from Alabama with a banjo on my knee: G G G D7
  { string: 6, fret: 3, duration: 'h' },
  { string: 4, fret: 0, duration: 'h' },
  { string: 6, fret: 3, duration: 'h' },
  { string: 4, fret: 0, duration: 'h' },
  // I'm going to Louisiana, my true love for to see: G G G(D7 on beat 2) G
  { string: 6, fret: 3, duration: 'h' },
  { string: 4, fret: 0, duration: 'h' },
  { string: 6, fret: 3, duration: 'h' },
  { string: 6, fret: 3, duration: 'h' },
  // Oh! Susanna, oh don't you cry for me: C C G D7
  { string: 5, fret: 3, duration: 'h' },
  { string: 6, fret: 3, duration: 'h' },
  { string: 6, fret: 3, duration: 'h' },
  { string: 4, fret: 0, duration: 'h' },
  // for I come from Alabama with a banjo on my knee: G G G(D7 on beat 2) G
  { string: 6, fret: 3, duration: 'h' },
  { string: 4, fret: 0, duration: 'h' },
  { string: 6, fret: 3, duration: 'h' },
  { string: 6, fret: 3, duration: 'h' },
];

/** Three-four and six-eight, each two bars of six eighth notes: the low notes show how they group. */
const WALTZ_G: TabNote[] = [6, 2, 4, 2, 4, 2, 6, 2, 4, 2, 4, 2].map((s) => ({ string: s, fret: s === 6 ? 3 : 0, duration: 'e' }));
const SIX_EIGHT_G: TabNote[] = [...PICKING_G, ...PICKING_G];
const WALTZ_AM: TabNote[] = [
  { string: 5, fret: 0, duration: 'e' },
  { string: 3, fret: 2, duration: 'e' },
  { string: 4, fret: 2, duration: 'e' },
  { string: 2, fret: 1, duration: 'e' },
  { string: 4, fret: 2, duration: 'e' },
  { string: 3, fret: 2, duration: 'e' },
];
const SIX_EIGHT_AM: TabNote[] = [
  { string: 5, fret: 0, duration: 'e' },
  { string: 3, fret: 2, duration: 'e' },
  { string: 2, fret: 1, duration: 'e' },
  { string: 4, fret: 2, duration: 'e' },
  { string: 3, fret: 2, duration: 'e' },
  { string: 2, fret: 1, duration: 'e' },
];
const SIX_EIGHT_EM: TabNote[] = [
  { string: 6, fret: 0, duration: 'e' },
  { string: 3, fret: 0, duration: 'e' },
  { string: 2, fret: 0, duration: 'e' },
  { string: 5, fret: 2, duration: 'e' },
  { string: 3, fret: 0, duration: 'e' },
  { string: 2, fret: 0, duration: 'e' },
];

const METER_OPTIONS = (correct: '3/4' | '6/8') => [
  { text: '3/4: three beats, each split in two', correct: correct === '3/4' },
  { text: '6/8: two beats, each split in three', correct: correct === '6/8' },
];

// ── 1. The folk pattern ─────────────────────────────────────────────────────────────────────────

const theFolkPattern: TeacherLesson = {
  id: 'the-folk-pattern',
  title: 'The folk pattern',
  teaches: 'The folk pattern is down, down-up, miss, up, down-up, and the hand never stops moving, even on the miss.',
  minutes: 5,
  skill: 'teacher:mia:the-folk-pattern',
  steps: [
    {
      type: 'card',
      title: 'The folk pattern',
      body: 'You hear this pattern in countless folk and pop songs. Count "1 2 & 3 & 4 &": down on 1, down on 2, up on the & of 2, miss on 3, up on the & of 3, down on 4, up on the & of 4. A miss means your hand moves down but skips the strings.',
      figure: { kind: 'audio', sound: { kind: 'strum', chord: 'G', pattern: FOLK_PATTERN, tempo: 72 }, label: 'Hear it on {c:G}' },
    },
    {
      type: 'choice',
      prompt: 'In the folk pattern, what does your strumming hand do on beat 3?',
      options: [
        { text: 'Moves down, just missing the strings', correct: true },
        { text: 'Stops and waits for the next up', why: 'If the hand stops, the up after it comes late. It keeps swinging, just above the strings.' },
        { text: 'Strums down, like on 1 and 2', why: 'Beat 3 is the miss: the hand goes down but skips the strings.' },
      ],
      explain: 'On 3 the hand swings down as usual but stays just above the strings. Then it comes back up through them on the & of 3.',
      fact: 'folk-miss',
    },
    {
      type: 'card',
      title: 'The hand never stops',
      body: 'The secret is the miss: your hand never stops moving. It swings down on every number and up on every &, like a pendulum, and only touches the strings where the pattern says. Written as note lengths, the up before the miss rings on through beat 3.',
      figure: { kind: 'rhythm', pattern: FOLK_RHYTHM, time: '4/4', tempo: 72, caption: 'Six strums a bar. Nothing new starts on beat 3: that is the miss.' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap the folk pattern with the click: one tap for every strum that touches the strings.',
      rhythm: { pattern: FOLK_RHYTHM },
      tempo: 60,
      show: 'both',
      explain: 'Down on 1, down-up on 2, nothing on 3, up on the & of 3, down-up on 4: six taps. The quiet beat 3 is where your hand misses the strings.',
      fact: 'folk-pattern',
    },
    {
      type: 'order',
      prompt: 'Put the strokes of the folk pattern in order, from beat 1.',
      tiles: ['1: down', '2: down', '&: up', '3: miss', '&: up', '4: down', '&: up'],
      distractors: ['3: down'],
      explain: 'Down, down-up, miss, up, down-up. Beat 3 is the only number where the hand does not touch the strings.',
      fact: 'folk-pattern',
    },
    techniqueTask({
      id: 'constant-motion',
      title: 'Constant Strumming Motion',
      exercise: 'tech-strum-constant',
      minutes: 4,
      body: 'Hold {c:Em} and play the full pattern with the miss for 8 bars at 60 BPM, then 8 bars on {c:G}. Watch your hand on beat 3: it keeps swinging, just above the strings.',
      tip: 'Upstrokes only need the top three or four strings. Brush them lightly.',
    }),
    {
      type: 'true-false',
      statement: 'On the miss, your hand stops moving for a moment.',
      answer: false,
      explain: 'It never stops. A steady swing, down on every number and up on every &, is what puts each strum on time.',
      fact: 'folk-miss',
    },
    toolTask({
      id: 'folk-trainer',
      title: 'Tap it in the rhythm trainer',
      tool: 'rhythm',
      params: ['strum', 'folk-pop'],
      minutes: 3,
      body: 'This is the trainer\'s folk and pop strum, the same pattern. Tap it with the trainer until it is in your body, saying the counts out loud. Slow the tempo down if you need to.',
    }),
    playerTask({
      id: 'folk-study',
      title: 'Strumming: The Folk Pattern',
      song: 'st-strum-folk',
      tempo: 75,
      minutes: 4,
      body: 'Play it at 60 BPM: {c:G}, {c:C}, {c:D} and {c:G}, four bars each, the same pattern in every bar. The bass plays on beat 3, so you hear the beat you miss. Then try 95 % (76 BPM).',
      tip: 'Change chords on beat 1. If a change is late, keep the hand swinging and catch the next 1.',
    }),
    {
      type: 'choice',
      prompt: 'Which strokes of the folk pattern are upstrokes? Pick all of them.',
      multiple: true,
      options: [
        { text: 'The & of 2', correct: true },
        { text: 'The & of 3', correct: true },
        { text: 'The & of 4', correct: true },
        { text: 'Beat 3', why: 'Beat 3 is the miss: the hand moves down without touching the strings.' },
        { text: 'Beat 1', why: 'Beat 1 is a downstroke, like every number you strum.' },
      ],
      explain: 'Ups always fall on the &: the & of 2, the & of 3 and the & of 4. Every number is a down, or the miss on 3.',
    },
    playerTask({
      id: 'wade',
      title: 'Wade in the Water, with its own groove',
      song: 'wade-in-the-water',
      tempo: 86,
      minutes: 4,
      body: 'The folk pattern is Wade in the Water\'s own swaying groove: down on 1, down-up on 2, up on the & of 3, down-up on 4. Play it on {c:Em}, {c:Am} and {c:B7} at about 72 BPM, then at 100 % (84 BPM).',
      fallback: {
        tool: 'progressions',
        params: ['classical-minor-cadence', 'e', 'jam'],
        title: 'Jam on E minor, A minor and B seven',
        body: 'Wade in the Water is not in the Songs library yet, so jam on its chords with the band: {c:Em}, {c:Am}, {c:B7}, {c:Em}, over and over. Set the tempo to 72 BPM and play the folk pattern, its own swaying groove, then try 84.',
      },
    }),
    {
      type: 'listen-choice',
      prompt: 'Mia strums two bars. Which rhythm is it?',
      sound: { kind: 'strum', chord: 'G', pattern: FOLK_PATTERN, tempo: 72 },
      options: [
        { text: 'Down, down-up, miss, up, down-up', correct: true },
        { text: 'Down-up on every count and every &', why: 'That would have no gap. Listen again for the quiet beat 3.' },
        { text: 'One downstrum on every beat', why: 'That is four strums a bar. You heard six, with ups between.' },
      ],
      explain: 'Down, down-up, a gap on 3, up, down-up: the folk pattern. The gap you heard on beat 3 is the miss.',
    },
  ],
  facts: [
    { id: 'folk-pattern', front: 'The folk pattern, stroke by stroke?', back: 'Down on 1, down-up on 2, miss on 3, up on the & of 3, down-up on 4.' },
    { id: 'folk-miss', front: 'In the folk pattern, what does your hand do on the miss?', back: 'It keeps swinging down, just above the strings, so the up after it lands on time.' },
  ],
};

// ── 2. Down by the Riverside ────────────────────────────────────────────────────────────────────

const downByTheRiverside: TeacherLesson = {
  id: 'down-by-the-riverside',
  title: 'Down by the Riverside',
  teaches: 'Keep the pattern going through a whole song: if a change is not ready, strum the old chord. The beat first.',
  minutes: 5,
  skill: 'teacher:mia:down-by-the-riverside',
  steps: [
    {
      type: 'card',
      title: 'One chord for a long time',
      body: 'Down by the Riverside sits on one chord for long stretches: {c:G}, then {c:D7}, then {c:C}. That is perfect for keeping a pattern going while you sing. Go Tell It on the Mountain uses the same three chords, with a livelier refrain.',
      figure: { kind: 'audio', sound: { kind: 'strum', chord: 'G', pattern: `${FOLK_PATTERN}|${FOLK_PATTERN}`, tempo: 96 }, label: 'The folk pattern at 96 BPM' },
    },
    {
      type: 'choice',
      prompt: 'Which chord box is {c:D7}?',
      options: [
        { figure: { kind: 'chord', symbol: 'D7', frets: 'xx0212', fingers: 'xx0213' }, correct: true },
        { figure: { kind: 'chord', symbol: 'D', frets: 'xx0232', fingers: 'xx0132' }, why: 'This is {c:D}: string 2 at fret 3. In {c:D7} that finger moves to fret 1 ({n:C}).' },
        { figure: { kind: 'chord', symbol: 'C', frets: 'x32010', fingers: 'x32010' }, why: 'This is {c:C}, strummed from string 5.' },
      ],
      explain: '{c:D7}: string 3 fret 2, string 2 fret 1, string 1 fret 2, strummed from the open string 4.',
    },
    {
      type: 'card',
      title: 'The beat comes first',
      body: 'If a change is not ready, keep strumming the old chord and change when your fingers get there. The beat matters more than the chord: a singer can carry on over the wrong chord, but not over a stopped beat.',
      tip: 'Keep the strumming hand swinging no matter what the other hand is doing.',
    },
    {
      type: 'choice',
      prompt: 'The song moves to {c:D7}, but your fingers are not ready. What do you do?',
      options: [
        { text: 'Keep strumming {c:G} until they are', correct: true },
        { text: 'Stop and wait for your fingers', why: 'A stop is the one thing everybody hears. Keep the beat going on the old chord.' },
        { text: 'Slow down until the change is ready', why: 'The singer and the band keep their tempo. Keep yours, on the old chord.' },
      ],
      explain: 'Keep the beat going on the old chord, then change when your fingers are ready. The beat matters more than the chord.',
      fact: 'beat-first',
    },
    {
      type: 'play-chord',
      prompt: 'Strum {c:D7} once, from the open string 4.',
      chord: 'D7',
      frets: 'xx0212',
      explain: '{c:D7}: string 3 fret 2, string 2 fret 1, string 1 fret 2. Four strings ring; strings 6 and 5 stay quiet.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'D7',
        frets: 'xx0212',
        accept: 'this-shape',
        prompt: 'Build {c:D7}.',
        explain: 'String 3 fret 2, string 2 fret 1, string 1 fret 2, over the open string 4.',
      },
    },
    playerTask({
      id: 'riverside',
      title: 'Down by the Riverside',
      song: 'down-by-the-riverside',
      tempo: 78,
      minutes: 4,
      body: 'Play it at about 84 BPM with the folk pattern on {c:G}, {c:D7} and {c:C}, all the way through. Sing if you like. Then 100 % (108 BPM).',
      tip: 'A late change? Keep strumming the old chord and change on the next 1.',
      fallback: {
        tool: 'player',
        params: ['coming-round-the-mountain', 't78'],
        title: 'The folk pattern through a whole song',
        body: 'Down by the Riverside is not in the Songs library yet, so keep the folk pattern going through She\'ll Be Coming \'Round the Mountain, on the same {c:G}, {c:C} and {c:D7}, at about 84 BPM. Then try 100 % (108 BPM).',
      },
    }),
    {
      type: 'true-false',
      statement: 'Go Tell It on the Mountain uses the same three chords as Down by the Riverside: {c:G}, {c:C} and {c:D7}.',
      answer: true,
      explain: 'Both songs use {c:G}, {c:C} and {c:D7}. Go Tell It on the Mountain has a livelier refrain, so it is a good second song for the same pattern.',
    },
    playerTask({
      id: 'go-tell',
      title: 'Go Tell It on the Mountain',
      song: 'go-tell-it-on-the-mountain',
      tempo: 84,
      minutes: 4,
      body: 'Play it at 84 BPM with the folk pattern on {c:G}, {c:C} and {c:D7}. Then 100 % (100 BPM), and let the refrain lift.',
      fallback: {
        tool: 'progressions',
        params: ['classical-plagal', 'g', 'jam'],
        title: 'Jam on G, C and D seven',
        body: 'Go Tell It on the Mountain is not in the Songs library yet, so jam on its three chords: {c:G}, {c:C}, {c:D7}, {c:G}, {c:C}, {c:G}. Pick the Folk strum style, set 84 BPM, and keep the folk pattern going. Then try 100.',
      },
    }),
    toolTask({
      id: 'g-d7-c-minute',
      title: 'One-minute changes: G, D seven, C',
      tool: 'chords',
      params: ['trainer', 'g-major', 'd-7'],
      minutes: 3,
      body: 'One minute of {c:G} to {c:D7} and back, then pick {c:D7} and {c:C} for another minute. Count the clean changes and note both scores.',
    }),
    { generate: 'chord-shape', params: { chords: ['D7', 'G', 'C'] } },
  ],
  facts: [
    { id: 'beat-first', front: 'A chord change is not ready. What do you do?', back: 'Keep strumming the old chord and change when you can: the beat matters more than the chord.' },
    { id: 'riverside-chords', front: 'The three chords of Down by the Riverside?', back: '{c:G}, {c:D7} and {c:C}, each for long stretches.' },
  ],
};

// ── 3. Accents and chucks ───────────────────────────────────────────────────────────────────────

const accentsAndChucks: TeacherLesson = {
  id: 'accents-and-chucks',
  title: 'Accents and chucks',
  teaches: 'Accent beats 2 and 4, or make them chucks: the fretting fingers relax onto the strings and the strum clicks.',
  minutes: 5,
  skill: 'teacher:mia:accents-and-chucks',
  steps: [
    {
      type: 'card',
      title: 'Accents on 2 and 4',
      body: 'An accent is a strum played a little louder than the others. In down-up eighths, accent beats 2 and 4: "1 & **2** & 3 & **4** &". That is where a drummer hits the snare drum, and it makes any song bounce.',
      figure: { kind: 'rhythm', pattern: 'e e e e e e e e', time: '4/4', tempo: 80, caption: 'Down-up eighths: strum beats 2 and 4 a little louder.' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap only the accents: beats 2 and 4, while you count "1 2 3 4".',
      rhythm: { pattern: 'qr q qr q | qr q qr q' },
      tempo: 80,
      show: 'both',
      explain: 'Two taps a bar, on 2 and 4. Those are the strums to play a little louder.',
      fact: 'backbeat',
    },
    toolTask({
      id: 'accents-80',
      title: 'Accents with the Metronome',
      tool: 'metronome',
      minutes: 3,
      body: 'Set the Metronome to 80 BPM. Strum down-up eighths on {c:G}, a little louder on 2 and 4, for two minutes. Louder, never earlier: the accents stay exactly on the click.',
    }),
    {
      type: 'card',
      title: 'The chuck',
      body: 'A muted strum, or {t:chuck}, is a click instead of a chord. Relax your fretting fingers so they still touch the strings but no longer press them, and strum. With an open chord, lay your fingers lightly across all six strings. Chucks on 2 and 4 give any song a drummer\'s backbeat.',
      figure: { kind: 'audio', sound: { kind: 'strum', chord: 'G', pattern: 'DUXUDUXU', tempo: 80 }, label: 'Hear chucks on 2 and 4' },
    },
    {
      type: 'choice',
      prompt: 'How does your fretting hand make a chuck?',
      options: [
        { text: 'The fingers relax: they touch, not press', correct: true },
        { text: 'The fingers press harder', why: 'Pressing makes the chord ring. For a chuck the fingers relax.' },
        { text: 'The fingers lift off the strings', why: 'Then the open strings ring out. The fingers stay touching the strings, just not pressing.' },
      ],
      explain: 'Relaxed fingers still touch the strings but stop them ringing, so the strum sounds as a click.',
      fact: 'chuck-how',
    },
    {
      type: 'listen-choice',
      prompt: 'Mia strums {c:G}. Did you hear chucks on 2 and 4?',
      sound: { kind: 'strum', chord: 'G', pattern: 'DUXUDUXU', tempo: 80 },
      options: [{ text: 'Yes: clicks on 2 and 4', correct: true }, { text: 'No: every strum rang' }],
      shuffle: false,
      explain: 'Beats 2 and 4 were clicks, not chords: the fingers relaxed for those two strums and pressed again for the rest.',
    },
    toolTask({
      id: 'chuck-drill',
      title: 'Chucks in the rhythm trainer',
      tool: 'rhythm',
      params: ['strum', 'chuck'],
      minutes: 3,
      body: 'This is the folk pattern with a chuck on 2 and 4. The trainer mutes with the heel of the strumming hand; today, mute with your relaxed fretting fingers instead. Both make the same click.',
    }),
    {
      type: 'true-false',
      statement: 'A chuck on beats 2 and 4 gives a song a drummer\'s backbeat.',
      answer: true,
      explain: 'Beats 2 and 4 are where a drummer hits the snare. A click there turns your guitar into the drum kit.',
      fact: 'backbeat',
    },
    techniqueTask({
      id: 'right-strings',
      title: 'Strum Only the Right Strings',
      exercise: 'tech-strum-accuracy',
      minutes: 4,
      body: 'Now that you know {c:E}, play all three chords: {c:D} from string 4, {c:A} from string 5, {c:E} on all six, two bars each. Aim the first downstroke at the chord\'s lowest string.',
    }),
    {
      type: 'match-pairs',
      prompt: 'Match each chord with where its strum starts.',
      pairs: [
        { left: '{c:D}', right: 'String 4' },
        { left: '{c:A}', right: 'String 5' },
        { left: '{c:E}', right: 'String 6: all six' },
      ],
      explain: '{c:D} starts on the open string 4, {c:A} on the open string 5 and {c:E} on the open string 6. Each lowest string is the note the chord is named after.',
    },
    playerTask({
      id: 'mountain-chucks',
      title: 'Coming \'Round the Mountain, with chucks',
      song: 'coming-round-the-mountain',
      minutes: 4,
      body: 'She\'ll Be Coming \'Round the Mountain at 108 BPM: down-up eighths on {c:G}, {c:C} and {c:D7}, with a chuck on every 2 and 4. Sing along if you like: the chucks are your drummer.',
      tip: 'Most changes come on beat 1, just after the chuck on 4: relaxed fingers are already on their way.',
    }),
    {
      type: 'choice',
      prompt: 'Where do the chucks go for a backbeat?',
      options: [
        { text: 'Beats 2 and 4', correct: true },
        { text: 'Beats 1 and 3', why: 'Beats 1 and 3 carry the chords. The snare, and your chucks, answer on 2 and 4.' },
        { text: 'On every &', why: 'The & strums are the light upstrokes. The chucks go on 2 and 4.' },
      ],
      explain: 'Beats 2 and 4, where a drummer hits the snare: that is the backbeat.',
      fact: 'backbeat',
    },
  ],
  facts: [
    { id: 'chuck-how', front: 'How do you play a chuck (a muted strum)?', back: 'Relax the fretting fingers so they touch the strings without pressing, and strum: you hear a click instead of a chord.' },
    { id: 'backbeat', front: 'Where do accents or chucks go for a backbeat?', back: 'On beats 2 and 4, where a drummer hits the snare.' },
  ],
};

// ── 4. Feeling 6/8 ──────────────────────────────────────────────────────────────────────────────

const sixEightTime: TeacherLesson = {
  id: 'six-eight-time',
  title: 'Feeling 6/8',
  teaches: '6/8 has six quick counts in two groups of three, with the weight on 1 and 4: it rocks like a boat.',
  minutes: 5,
  skill: 'teacher:mia:six-eight-time',
  steps: [
    {
      type: 'card',
      title: 'Two big beats',
      body: '6/8 has six quick counts in a bar, grouped in two threes: "**1** 2 3 **4** 5 6", with the weight on 1 and 4. It rocks like a boat rather than marching. Those two heavy counts are its big beats: listen for the low note that starts each group.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: [...SIX_EIGHT_AM, ...SIX_EIGHT_AM], tempo: 75 }, label: 'Hear two groups of three' },
      tip: 'You may also see a bar of 6/8 counted "1 & a 2 & a": the same two big beats, each split in three.',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap all six counts with the click, a little stronger on 1 and 4.',
      rhythm: { pattern: 'e e e e e e | e e e e e e', time: '6/8' },
      tempo: 75,
      show: 'both',
      explain: 'Six even taps a bar. The stronger 1 and 4 split them into two groups of three.',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Now tap only 1 and 4, while you say all six counts out loud.',
      rhythm: { pattern: 'q. q. | q. q.', time: '6/8' },
      tempo: 75,
      show: 'both',
      explain: 'Two taps a bar, each lasting three counts: those are the big beats of 6/8.',
      fact: 'six-eight',
    },
    {
      type: 'choice',
      prompt: 'In 6/8, which counts carry the weight?',
      options: [
        { text: '1 and 4', correct: true },
        { text: '1, 3 and 5', why: 'That groups the six counts in twos, which is how 3/4 feels.' },
        { text: 'All six the same', why: 'Then nothing rocks. The weight on 1 and 4 makes the two groups of three.' },
      ],
      explain: '1 and 4 start the two groups of three: "**1** 2 3 **4** 5 6".',
      fact: 'six-eight',
    },
    {
      type: 'card',
      title: 'The 6/8 strum',
      body: 'The strum: down on 1, down on 2, up on 3, down on 4, down on 5, up on 6, with 1 and 4 a little louder. Each group of three is "down, down, up", so the hand swings down twice and comes back up once.',
      figure: { kind: 'rhythm', pattern: 'e e e e e e', time: '6/8', tempo: 75, caption: 'Down, down, up on 1 2 3; down, down, up on 4 5 6.' },
    },
    {
      type: 'order',
      prompt: 'Put the six strokes of the 6/8 strum in order.',
      tiles: ['1: down', '2: down', '3: up', '4: down', '5: down', '6: up'],
      distractors: ['3: down'],
      explain: 'Down, down, up, twice: one group of three on each big beat.',
      fact: 'six-eight-strum',
    },
    playerTask({
      id: 'strum-six-eight',
      title: 'Strumming: 6/8',
      song: 'st-strum-6-8',
      tempo: 79,
      minutes: 4,
      body: 'Play it at 79 % (44 big beats a minute): {c:Em}, {c:C}, {c:D} and {c:Em}, four bars each, counting one big beat per group of three. Then 100 % (56 big beats a minute).',
      tip: 'The teacher\'s bass plays on 1 and 4. Let it tell you where the big beats are.',
    }),
    {
      type: 'listen-choice',
      prompt: 'Listen to the low notes. Is this 3/4 or 6/8?',
      sound: { kind: 'tab', notes: WALTZ_G, tempo: 80 },
      options: METER_OPTIONS('3/4'),
      shuffle: false,
      explain: 'A low note came every two notes: three beats in a bar, each split in two. That is 3/4.',
    },
    playerTask({
      id: 'row-your-boat',
      title: 'Row, Row, Row Your Boat',
      song: 'row-row-row-your-boat',
      mode: 'wait',
      minutes: 4,
      body: 'A tune that rocks in 6/8, in first position: finger 1 for fret 1, 2 for fret 2, 3 for fret 3. Wait mode first; then 86 % (48 big beats a minute) and 100 % (56 big beats a minute). Play it twice: the app\'s second voice comes in 2 bars after you, as a round.',
    }),
    {
      type: 'listen-choice',
      prompt: 'And this one: 3/4 or 6/8?',
      sound: { kind: 'tab', notes: SIX_EIGHT_G, tempo: 75 },
      options: METER_OPTIONS('6/8'),
      shuffle: false,
      explain: 'A low note came every three notes: two big beats in a bar, each split in three. That is 6/8.',
    },
    playerTask({
      id: 'greensleeves-strum',
      title: 'Greensleeves: strum on 1 and 4',
      song: 'greensleeves-melody',
      minutes: 4,
      body: 'In Options, under Parts, mute the Teacher part: the app plays the tune and you strum at 54 big beats a minute, once on 1 and once on 4. {c:Am}, {c:G}, {c:E} and {c:C}, mostly one a bar; the cadence bars go {c:Am} to {c:E}.',
    }),
    {
      type: 'listen-choice',
      prompt: 'Mia plays {c:Am}. 3/4 or 6/8?',
      sound: { kind: 'tab', notes: [...WALTZ_AM, ...WALTZ_AM], tempo: 80 },
      options: METER_OPTIONS('3/4'),
      shuffle: false,
      explain: 'The low notes, {n:A} and then {n:E}, came on every other note: three beats of two. That is 3/4.',
    },
    {
      type: 'listen-choice',
      prompt: 'Last one, on {c:Em}: 3/4 or 6/8?',
      sound: { kind: 'tab', notes: [...SIX_EIGHT_EM, ...SIX_EIGHT_EM], tempo: 75 },
      options: METER_OPTIONS('6/8'),
      shuffle: false,
      explain: 'The low {n:E} and {n:B} came on every third note: "**1** 2 3 **4** 5 6". Two big beats: 6/8.',
    },
  ],
  facts: [
    { id: 'six-eight', front: 'How do you count 6/8?', back: 'Six quick counts in two groups of three, "1 2 3 4 5 6", with the weight on 1 and 4.' },
    { id: 'six-eight-strum', front: 'The 6/8 strum?', back: 'Down, down, up on 1 2 3, and again on 4 5 6, with 1 and 4 a little louder.' },
  ],
};

// ── 5. Silent Night, strummed and picked ────────────────────────────────────────────────────────

const silentNight: TeacherLesson = {
  id: 'silent-night',
  title: 'Silent Night, strummed and picked',
  teaches: 'Silent Night is in 6/8: strum on 1 and 4, then pick it, the thumb on 1 and 4 and i, m, a on strings 3, 2, 1.',
  minutes: 5,
  skill: 'teacher:mia:silent-night',
  steps: [
    {
      type: 'card',
      title: 'A carol in 6/8',
      body: 'Silent Night was composed in 1818 by Franz Xaver Gruber, and it is in 6/8: two slow beats in each bar, each made of three counts. It needs {c:G}, {c:D7} and {c:C}. First, strum softly on counts 1 and 4 only.',
      figure: { kind: 'rhythm', pattern: 'q. q. | q. q.', time: '6/8', tempo: 75, caption: 'One soft strum on 1 and one on 4, each ringing for three counts.' },
    },
    {
      type: 'choice',
      prompt: 'In Silent Night, where do your soft strums go?',
      options: [
        { text: 'On counts 1 and 4', correct: true },
        { text: 'On all six counts', why: 'Six strums a bar would crowd this slow, gentle carol. One on each big beat is enough.' },
        { text: 'On counts 1, 3 and 5', why: 'That would group the counts in twos. In 6/8 the big beats are 1 and 4.' },
      ],
      explain: 'One soft strum on each big beat, counts 1 and 4, and let it ring through the other counts.',
      fact: 'silent-night-strum',
    },
    {
      type: 'true-false',
      statement: 'Silent Night was composed in 1818 by Franz Xaver Gruber.',
      answer: true,
      explain: 'Gruber wrote the tune in 1818 for words by Joseph Mohr. It has been sung in 6/8 ever since.',
    },
    playerTask({
      id: 'silent-strum',
      title: 'Silent Night, strummed',
      song: 'silent-night',
      bars: [1, 24],
      tempo: 88,
      minutes: 4,
      body: 'Bars 1 to 24 at 88 % (44 big beats a minute): one soft downstrum on 1 and one on 4, on {c:G}, {c:D7} and {c:C}, while the app plays the tune. Then 100 % (50 big beats a minute).',
    }),
    {
      type: 'card',
      title: 'Your first fingerpicking',
      body: 'Now pick it instead, with your thumb and fingers: {t:fingerpicking}. Each has a letter: the thumb is p, the index i, the middle finger m and the ring finger a. The thumb plays a bass note on counts 1 and 4, and i, m and a pluck strings 3, 2 and 1 in between.',
      figure: { kind: 'tab', tempo: 75, time: '6/8', notes: [...PICKING_G], caption: 'One bar on {c:G}: p i m, then p a m.' },
      tip: 'The letters come from Spanish: pulgar, índice, medio, anular.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each letter with its finger.',
      pairs: [
        { left: 'p', right: 'Thumb' },
        { left: 'i', right: 'Index finger' },
        { left: 'm', right: 'Middle finger' },
        { left: 'a', right: 'Ring finger' },
      ],
      explain: 'p for the thumb, i for the index, m for the middle and a for the ring finger. The little finger rests.',
      fact: 'pima',
    },
    {
      type: 'order',
      prompt: 'Put one bar of the pattern on {c:G} in order, count 1 to 6.',
      tiles: ['p: string 6', 'i: string 3', 'm: string 2', 'p: string 4', 'a: string 1', 'm: string 2'],
      distractors: ['a: string 3'],
      explain: 'Count 1, the thumb on string 6, fret 3 ({n:G}); 2, i on the open string 3; 3, m on the open string 2; 4, the thumb on the open string 4; 5, a on string 1, fret 3; 6, m on the open string 2.',
      fact: 'silent-night-picking',
    },
    techniqueTask({
      id: 'pima-first',
      title: 'Free-Stroke Arpeggios: meet p i m a',
      exercise: 'tech-pima-free-stroke',
      minutes: 4,
      body: 'Only the first pattern, at 60 BPM, to meet your picking fingers: hold {c:C}, then p on string 5, i on 3, m on 2, a on 1, one string at a time. Each finger plucks and moves on into the air, without touching the next string.',
    }),
    {
      type: 'play-phrase',
      prompt: 'Hold {c:G} and pick one bar: p on string 6, i, m, then p on string 4, a, m.',
      notes: [...PICKING_G],
      octave: 'exact',
      tempo: 75,
      explain: 'String 6 fret 3 ({n:G}), the open strings 3 and 2 ({n:G}, {n:B}), the open string 4 ({n:D}), string 1 fret 3 ({n:G}) and the open string 2 again: all notes of {c:G}.',
      alternative: {
        type: 'fill-blanks',
        prompt: 'Complete the pattern: which finger plucks each string?',
        text: 'Thumb on string 6, ___ on string 3, m on string 2; thumb on string 4, ___ on string 1, m on string 2.',
        blanks: ['i', 'a'],
        bank: ['p', 'm'],
        explain: 'i plays string 3, m string 2 and a string 1. The thumb, p, takes the bass on counts 1 and 4.',
      },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each chord with where the thumb starts on count 1.',
      pairs: [
        { left: '{c:G}', right: 'String 6, fret 3' },
        { left: '{c:D7}', right: 'The open string 4' },
        { left: '{c:C}', right: 'String 5, fret 3' },
      ],
      explain: 'The thumb starts on each chord\'s bass note: {n:G}, {n:D} and {n:C}. On count 4 it plays string 4: open for {c:G} and {c:D7}, fret 2 for {c:C}.',
      fact: 'silent-night-picking',
    },
    playerTask({
      id: 'silent-picked',
      title: 'Silent Night, fingerpicked',
      song: 'silent-night',
      bars: [25, 48],
      tempo: 88,
      minutes: 5,
      body: 'Bars 25 to 48 are the picked verse, at 88 % (44 big beats a minute). Loop the first two bars on {c:G} until they flow, then play the whole verse on {c:G}, {c:D7} and {c:C}.',
      tip: 'Plant your fingers on strings 3, 2 and 1 before you start, and keep the hand still: only the fingertips move.',
    }),
    {
      type: 'choice',
      prompt: 'Which finger plucks string 1 in this pattern?',
      options: [
        { text: 'a, the ring finger', correct: true },
        { text: 'p, the thumb', why: 'The thumb plays the bass notes on counts 1 and 4.' },
        { text: 'i, the index finger', why: 'i plucks string 3. a, the ring finger, plays string 1.' },
      ],
      explain: 'One finger for each string: i on string 3, m on string 2, a on string 1, and the thumb on the bass.',
      fact: 'pima',
    },
  ],
  facts: [
    { id: 'silent-night-strum', front: 'How do you strum Silent Night?', back: 'Softly, once on count 1 and once on count 4 of each 6/8 bar.' },
    { id: 'pima', front: 'What do p, i, m and a stand for?', back: 'The thumb, index, middle and ring finger of your picking hand.' },
    { id: 'silent-night-picking', front: 'The picking pattern of Silent Night on {c:G}?', back: 'p on string 6, i on 3, m on 2; p on string 4, a on 1, m on 2.' },
  ],
};

// ── 6. Boom-chick ───────────────────────────────────────────────────────────────────────────────

const boomChick: TeacherLesson = {
  id: 'boom-chick',
  title: 'Boom-chick',
  teaches: 'Boom-chick is a bass note, then a light strum: in 4/4 the bass on 1 and 3, the strum on 2 and 4.',
  minutes: 5,
  skill: 'teacher:mia:boom-chick',
  steps: [
    {
      type: 'card',
      title: 'Boom, then chick',
      body: '{t:boom-chick|Boom-chick} is country and folk accompaniment: pick one bass note (boom), then strum the higher strings (chick). In 4/4 the bass goes on beats 1 and 3, the strum on 2 and 4. Keep the strum short and light so the bass notes stand out.',
      figure: { kind: 'rhythm', pattern: 'q q q q', time: '4/4', tempo: 80, caption: 'Boom on 1, chick on 2, boom on 3, chick on 4.' },
    },
    {
      type: 'choice',
      prompt: 'In 4/4 boom-chick, where do the bass notes go?',
      options: [
        { text: 'On beats 1 and 3', correct: true },
        { text: 'On beats 2 and 4', why: 'Beats 2 and 4 are the chicks: the light strums.' },
        { text: 'On every beat', why: 'Then there is no chick. The bass and the strum take turns.' },
      ],
      explain: 'Boom on 1 and 3, chick on 2 and 4: the bass and the strum take turns.',
      fact: 'boom-chick',
    },
    {
      type: 'card',
      title: 'Two bass notes for each chord',
      body: 'Alternate two bass notes in each chord. Under {c:G}: string 6, fret 3 ({n:G}), then the open string 4 ({n:D}). Under {c:C}: string 5, fret 3 ({n:C}), then string 6, fret 3 ({n:G}), finger 3 hopping across. Under {c:D7}: the open string 4 ({n:D}), then the open string 5 ({n:A}).',
      figure: {
        kind: 'fretboard',
        frets: [0, 3],
        dots: [
          { string: 6, fret: 3, note: 'G2' },
          { string: 5, fret: 3, note: 'C3' },
          { string: 5, fret: 0, note: 'A2' },
          { string: 4, fret: 0, note: 'D3' },
        ],
        caption: 'The bass notes of {c:G}, {c:C} and {c:D7}: {n:G}, {n:C}, {n:A} and {n:D}.',
      },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each chord with its two bass notes.',
      pairs: [
        { left: '{c:G}', right: '{n:G}, then {n:D}' },
        { left: '{c:C}', right: '{n:C}, then {n:G}' },
        { left: '{c:D7}', right: '{n:D}, then {n:A}' },
      ],
      explain: 'Each chord starts on the note it is named after, then alternates: {c:G} with the open {n:D}, {c:C} with the {n:G} on string 6, {c:D7} with the open {n:A}.',
      fact: 'boom-chick-bass',
    },
    {
      type: 'play-phrase',
      prompt: 'Bass notes only, so your pick learns the jumps: two bars each of {c:G}, {c:C} and {c:D7}, as the screen shows.',
      notes: [...BOOM_BASS],
      octave: 'exact',
      tempo: 72,
      explain: '{c:G}: string 6 fret 3, then the open string 4. {c:C}: string 5 fret 3, then string 6 fret 3. {c:D7}: the open string 4, then the open string 5.',
      alternative: {
        type: 'order',
        prompt: 'Put the bass notes in order: {c:G} first, then {c:C}, then {c:D7}.',
        tiles: ['{n:G}', '{n:D}', '{n:C}', '{n:G}', '{n:D}', '{n:A}'],
        distractors: ['{n:E}'],
        explain: '{c:G}: {n:G} then {n:D}. {c:C}: {n:C} then {n:G}. {c:D7}: {n:D} then {n:A}.',
      },
    },
    playerTask({
      id: 'boom-chick-study',
      title: 'Strumming: Boom-Chick',
      song: 'st-boom-chick',
      tempo: 82,
      minutes: 4,
      body: 'Play it at about 72 BPM: {c:G}, {c:C}, {c:D7} and {c:G}, four bars each, bass on 1 and 3, a light strum of strings 4 to 1 on 2 and 4. Then 100 % (88 BPM).',
      tip: 'Bar 4 walks up to {c:C} with a bass note on every beat. Just follow the tab.',
    }),
    {
      type: 'true-false',
      statement: 'In boom-chick, the strum is as loud as the bass notes.',
      answer: false,
      explain: 'Keep the strum short and light, so the bass notes stand out. The boom leads; the chick answers softly.',
      fact: 'boom-chick',
    },
    {
      type: 'card',
      title: 'Oh! Susanna, in 2/4',
      body: 'Oh! Susanna is in 2/4, two beats in a bar: the bass goes on beat 1 and the strum on beat 2, and the bass notes alternate from bar to bar. A word about the song: it was written for minstrel shows, which mocked Black Americans, and we sing only the verse and chorus that do not.',
      figure: { kind: 'rhythm', pattern: 'q q | q q', time: '2/4', tempo: 80, caption: 'Boom on 1, chick on 2, in every bar.' },
    },
    {
      type: 'choice',
      prompt: 'In 2/4, where does the boom go?',
      options: [
        { text: 'On beat 1 of every bar', correct: true },
        { text: 'On beats 1 and 3', why: 'A 2/4 bar has only two beats. Boom on 1, chick on 2.' },
        { text: 'On beat 2', why: 'Beat 2 is the chick, the light strum.' },
      ],
      explain: 'Two beats a bar: boom on 1, chick on 2. The bass notes alternate from one bar to the next.',
      fact: 'boom-chick-two-four',
    },
    playerTask({
      id: 'susanna-boom',
      title: 'Oh! Susanna in boom-chick',
      song: 'oh-susanna',
      tempo: 87,
      minutes: 4,
      body: 'In Options, under Parts, mute Your strum: the app plays the tune, you play boom-chick at 80 BPM on {c:G}, {c:C} and {c:D7}, bass on 1, strum on 2. Wait through the first half-beat: the tune starts before bar 1. Then 100 % (92 BPM).',
      tip: 'The chorus starts on {c:C}: its bass is string 5, fret 3.',
    }),
    {
      type: 'choice',
      prompt: 'Under {c:C}, which finger hops between string 5 and string 6?',
      options: [
        { text: 'Finger 3', correct: true },
        { text: 'Finger 1', why: 'Finger 1 stays on string 2, fret 1 the whole time.' },
        { text: 'Finger 2', why: 'Finger 2 stays on string 4, fret 2. Finger 3 does the hopping.' },
      ],
      explain: 'Finger 3 plays string 5, fret 3 ({n:C}), then hops to string 6, fret 3 ({n:G}), and back. Fingers 1 and 2 stay put.',
      fact: 'boom-chick-bass',
    },
  ],
  facts: [
    { id: 'boom-chick', front: 'What is boom-chick in 4/4?', back: 'A bass note on beats 1 and 3 (boom) and a short, light strum on 2 and 4 (chick).' },
    { id: 'boom-chick-bass', front: 'The two bass notes of {c:G}, {c:C} and {c:D7} in boom-chick?', back: '{c:G}: {n:G} (string 6 fret 3), {n:D} (open 4). {c:C}: {n:C} (string 5 fret 3), {n:G}. {c:D7}: {n:D} (open 4), {n:A} (open 5).' },
    { id: 'boom-chick-two-four', front: 'Boom-chick in 2/4?', back: 'Bass on beat 1, strum on beat 2, the bass notes alternating from bar to bar.' },
  ],
};

// ── 7. Three songs, three strums (milestone) ────────────────────────────────────────────────────

const strumSongbook: TeacherLesson = {
  id: 'strum-songbook',
  title: 'Three songs, three strums',
  teaches: 'A strum sets a song\'s mood: boom-chick, the folk pattern and the waltz, played back to back like a concert.',
  minutes: 5,
  skill: 'teacher:mia:strum-songbook',
  steps: [
    {
      type: 'card',
      title: 'Today\'s set',
      body: 'Choosing a strum is part of playing a song, because the pattern sets its mood. Today\'s set: Oh! Susanna in boom-chick, Down by the Riverside with the folk pattern, and Amazing Grace as a waltz. Play the set without stopping between songs, like a short concert.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each song with its strum.',
      pairs: [
        { left: 'Oh! Susanna', right: 'Boom-chick' },
        { left: 'Down by the Riverside', right: 'The folk pattern' },
        { left: 'Amazing Grace', right: 'The waltz' },
      ],
      explain: 'Oh! Susanna bounces in boom-chick, Down by the Riverside rolls along with the folk pattern, and Amazing Grace sways as a waltz.',
      fact: 'set-strums',
    },
    toolTask({
      id: 'set-tune',
      title: 'Tune up for the set',
      tool: 'tuner',
      minutes: 2,
      body: 'Every set starts in tune: all six strings, string 6 to string 1, each one brought up to its note.',
    }),
    techniqueTask({
      id: 'set-warm-up',
      title: 'The Five-Minute Warm-Up',
      exercise: 'tech-warm-up',
      minutes: 5,
      body: 'Five easy minutes for both hands before you perform. Nothing fast, nothing hard.',
    }),
    {
      type: 'choice',
      prompt: 'Song 1, Oh! Susanna, in boom-chick. Where does the bass note go in each 2/4 bar?',
      figure: { kind: 'rhythm', pattern: 'q q', time: '2/4', caption: 'Oh! Susanna: boom, chick.' },
      options: [
        { text: 'On beat 1', correct: true },
        { text: 'On beat 2', why: 'Beat 2 is the chick: the short, light strum.' },
        { text: 'On both beats', why: 'Then there is no chick. The bass and the strum take turns.' },
      ],
      explain: 'Two beats a bar: the bass note on 1, the light strum on 2.',
    },
    playerTask({
      id: 'set-susanna',
      title: 'Song 1: Oh! Susanna',
      song: 'oh-susanna',
      minutes: 3,
      body: 'Mute Your strum under Parts and play boom-chick with the tune at 92 BPM: bass on 1, strum on 2, on {c:G}, {c:C} and {c:D7}. Then straight on to the next song.',
    }),
    {
      type: 'choice',
      prompt: 'Song 2, Down by the Riverside, with the folk pattern. Which beat is the miss?',
      figure: { kind: 'rhythm', pattern: FOLK_RHYTHM, time: '4/4', caption: 'Down by the Riverside: the folk pattern.' },
      options: [
        { text: 'Beat 3', correct: true },
        { text: 'Beat 1', why: 'Beat 1 is a downstroke. The miss is on 3.' },
        { text: 'Beat 4', why: 'Beat 4 is a down-up. The miss is on 3.' },
      ],
      shuffle: false,
      explain: 'Down, down-up, the miss on 3, up, down-up: six strums a bar.',
    },
    playerTask({
      id: 'set-riverside',
      title: 'Song 2: Down by the Riverside',
      song: 'down-by-the-riverside',
      minutes: 3,
      body: 'The folk pattern at 108 BPM on {c:G}, {c:D7} and {c:C}. Change late rather than stop: the beat comes first.',
      fallback: {
        tool: 'player',
        params: ['coming-round-the-mountain'],
        title: 'Song 2: the folk pattern',
        body: 'Down by the Riverside is not in the Songs library yet, so play She\'ll Be Coming \'Round the Mountain with the folk pattern instead, at 108 BPM on {c:G}, {c:C} and {c:D7}. Change late rather than stop.',
      },
    }),
    {
      type: 'choice',
      prompt: 'And the closer, Amazing Grace, as a waltz. Which pattern?',
      figure: { kind: 'rhythm', pattern: 'q e e e e', time: '3/4', caption: 'Amazing Grace: three beats a bar.' },
      options: [
        { text: 'Bass on 1, down-up on 2 and 3', correct: true },
        { text: 'Bass on 1 and 3, strum on 2 and 4', why: 'That is boom-chick in 4/4. Amazing Grace has three beats in a bar.' },
        { text: 'Down on 1 and 4 of six counts', why: 'That is 6/8, like Silent Night.' },
      ],
      explain: 'Three beats: the bass note on 1, then down-up on 2 and down-up on 3.',
      fact: 'set-strums',
    },
    playerTask({
      id: 'set-grace',
      title: 'Song 3: Amazing Grace',
      song: 'amazing-grace',
      mode: 'flow',
      minutes: 3,
      body: 'The waltz at 84 BPM in Flow mode: the microphone listens to your chords, and about 8 bars in 10 clean and on time is a pass. Keep going through any mistake.',
    }),
    {
      type: 'true-false',
      statement: 'In a set, you stop the song to fix a wrong chord, then start again.',
      answer: false,
      explain: 'Never stop the song: let the wrong chord go and catch the next beat. Between songs, keep the gaps short, like a concert.',
    },
    toolTask({
      id: 'set-journal',
      title: 'Write the set in your journal',
      tool: 'practice',
      params: ['journal'],
      minutes: 2,
      body: 'Log today\'s set, and pick the song that felt weakest: that is tomorrow\'s practice.',
    }),
    {
      type: 'card',
      title: 'Your encore',
      body: 'One more, for me: Oh! Susanna in boom-chick, its first two lines and the chorus at 92 {t:bpm|BPM}. The screen shows your bass notes, one a bar; the strum on beat 2 is up to you. Wait through the pickup, and keep going through any mistake.',
    },
    {
      type: 'play-phrase',
      id: 'show',
      prompt: 'Your encore: Oh! Susanna in boom-chick, two lines and the chorus. The microphone follows your bass notes.',
      notes: [...SUSANNA_BASS],
      octave: 'any',
      tempo: 92,
      pass: 0.8,
      explain: 'Lines 1 and 2 on {c:G} with {c:D7} at their ends, then the chorus from {c:C}: bass on 1, strum on 2. About 8 bass notes in 10 is a pass.',
      alternative: {
        type: 'order',
        prompt: 'Put the four chord lines of your encore in order.',
        tiles: ['{c:G} {c:G} {c:G} {c:D7}', '{c:G} {c:G} {c:G} {c:G}', '{c:C} {c:C} {c:G} {c:D7}', '{c:G} {c:G} {c:G} {c:G}'],
        explain: 'Line 1 ends on {c:D7}, line 2 comes home to {c:G} (with {c:D7} on beat 2 of its third bar), the chorus starts on {c:C}, and its last line is line 2 again.',
      },
    },
  ],
  facts: [
    { id: 'set-strums', front: 'Oh! Susanna, Down by the Riverside, Amazing Grace: which strums?', back: 'Boom-chick, the folk pattern, and the waltz (bass on 1, down-up on 2 and 3).' },
    { id: 'strum-sets-mood', front: 'Why is choosing a strum part of playing a song?', back: 'The pattern sets the song\'s mood: boom-chick bounces, the folk pattern rolls along, a waltz sways.' },
  ],
};

/** Unit 7 of Mia's course. */
const unit: TeacherUnit = {
  id: 'mia-strumming-patterns',
  title: 'Strumming patterns',
  theme: 'rhythm',
  description: 'The folk pattern, accents and chucks, 6/8, a first fingerpicking pattern and boom-chick, kept going through whole songs.',
  lessons: [theFolkPattern, downByTheRiverside, accentsAndChucks, sixEightTime, silentNight, boomChick, strumSongbook],
  checkpoint: { sample: 8, maxMistakes: 2 },
  milestone: {
    lesson: 'strum-songbook',
    step: 'show',
    piece: 'Oh! Susanna in boom-chick',
    song: 'oh-susanna',
    celebrate: 'You played Oh! Susanna in boom-chick to the end: bass on 1, strum on 2, and you kept going. Three patterns, three moods, and now you choose. Next: notes on all six strings, riffs and a first showpiece.',
  },
  glossary: [
    { id: 'chuck', term: 'chuck', definition: 'A muted strum: the fretting fingers relax so they touch the strings without pressing, and the strum sounds as a click.' },
    { id: 'boom-chick', term: 'boom-chick', definition: 'An accompaniment: a bass note on its own (boom), then a short, light strum of the higher strings (chick).' },
    { id: 'fingerpicking', term: 'fingerpicking', definition: 'Playing the strings with the thumb and fingers instead of a pick: p is the thumb, i the index, m the middle, a the ring finger.' },
  ],
};

export default unit;
