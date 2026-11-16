/**
 * Prof. Varga, unit 3: Advanced picking (plan: `elena/elena-advanced-picking` in
 * src/content/plan/teachers.json).
 *
 * Elena's voice: rigorous, dry, respectful. Five techniques added to alternate picking: economy
 * picking, sweeps on three and five strings, string skipping, hybrid picking, and speed built in
 * bursts, with tremolo. Each lesson's tab is the Technique exercise's own material (`@/content/technique`),
 * cross-checked note for note in `elena-advanced-picking.test.ts`. Health first: every task that can
 * strain the hand says when to stop.
 *
 * Music from the library: Sweep-Picked Arpeggios (`st-arpeggio-sweep`, 72 BPM), In the Hall of the
 * Mountain King (`hall-of-the-mountain-king`, 60 rising to 160 BPM). Devil's Dream, the William Tell
 * galop and Paganini's Caprice No. 24 carry fallbacks until they are in the library (the last two
 * need a printed edition, so the fallback teaches Scan and Import).
 */
import type { TabNote } from '@/lessons';
import type { TeacherLesson, TeacherUnit } from '../types';
import { playerTask, techniqueTask, toolTask } from '../tasks';

/** One tab note. */
function t(string: number, fret: number, duration: string): TabNote {
  return { string, fret, duration };
}

/** G major three notes per string, strings 6 and 5 (the start of the economy-picking run). */
export const ECONOMY_START: TabNote[] = [t(6, 3, 'e'), t(6, 5, 'e'), t(6, 7, 'e'), t(5, 3, 'e'), t(5, 5, 'e'), t(5, 7, 'e'), t(4, 4, 'e'), t(4, 5, 'e')];

/** The three-string A minor sweep, down and back: A C E C A. */
export const SWEEP_AM: TabNote[] = [t(3, 14, 'e'), t(2, 13, 'e'), t(1, 12, 'e'), t(2, 13, 'e'), t(3, 14, 'h')];

/** The three-string C sweep: G C E C G. */
export const SWEEP_C: TabNote[] = [t(3, 12, 'e'), t(2, 13, 'e'), t(1, 12, 'e'), t(2, 13, 'e'), t(3, 12, 'h')];

/** The five-string A minor arpeggio, up with the hammer-on to fret 17 and back down. */
export const SWEEP_FIVE: TabNote[] = [
  t(5, 12, 's'), t(4, 14, 's'), t(3, 14, 's'), t(2, 13, 's'), t(1, 12, 's'), t(1, 17, 's'),
  t(1, 12, 's'), t(2, 13, 's'), t(3, 14, 's'), t(4, 14, 's'), t(5, 12, 'e'), { rest: true, duration: 'q' },
];

/** Octaves skipping a string: A to A, then D to D. */
export const SKIP_OCTAVES: TabNote[] = [t(6, 5, 'e'), t(4, 7, 'e'), t(6, 5, 'e'), t(4, 7, 'e'), t(5, 5, 'e'), t(3, 7, 'e'), t(5, 5, 'e'), t(3, 7, 'e')];

/** Hybrid picking over C: pick on string 5, m on 2, pick on 4, a on 1. */
export const HYBRID_C: TabNote[] = [t(5, 3, 'e'), t(2, 1, 'e'), t(4, 2, 'e'), t(1, 0, 'e'), t(5, 3, 'e'), t(2, 1, 'e'), t(4, 2, 'e'), t(1, 0, 'e')];

/** The speed-burst figure C B A G. */
export const BURST: TabNote[] = [t(1, 8, 's'), t(1, 7, 's'), t(1, 5, 's'), t(2, 8, 's')];

// ── 1. Economy picking ──────────────────────────────────────────────────────────────────────────

const economyPicking: TeacherLesson = {
  id: 'economy-picking',
  title: 'Economy picking',
  teaches: 'Economy picking alternates on each string but continues the stroke across a change in the same direction.',
  minutes: 4,
  skill: 'teacher:elena:economy-picking',
  steps: [
    {
      type: 'card',
      title: 'Alternate, until it pays not to',
      body: '{t:economy-picking|Economy picking} alternates on each string, but when you cross to the next string in the direction the pick is already travelling, you continue the stroke instead of reversing it. Ascending with three notes per string: down-up-down, then down again on the next string, in one motion.',
      figure: { kind: 'tab', tempo: 60, notes: ECONOMY_START, caption: '{k:G major}, three per string: down-up-down, down-up-down, down-up.' },
    },
    {
      type: 'choice',
      prompt: 'Ascending, three notes per string. Which strokes on the first two strings?',
      options: [
        { text: 'Down-up-down, down-up-down', correct: true },
        { text: 'Down-up-down, up-down-up', why: 'That is strict alternate picking: the pick reverses at the string change.' },
        { text: 'Down-down-down, down-down-down', why: 'All downstrokes: tiring, and it caps your speed.' },
        { text: 'Up-down-up, up-down-up', why: 'That is the descending pattern, the mirror image.' },
      ],
      explain: 'Alternate on the string, then let the last downstroke carry on through the next string: two downs in a row, one motion.',
      fact: 'economy-strokes',
    },
    {
      type: 'card',
      title: 'Descending, and the catch',
      body: 'Descending, it mirrors: up-down-up on each string, the upstroke carrying on across the change. It saves movement, and it also changes the accent pattern, so practise it slowly with a click: the sweeping change tends to rush.',
    },
    {
      type: 'true-false',
      statement: 'Economy picking changes the accent pattern compared with strict alternate picking.',
      answer: true,
      explain: 'The strokes no longer fall down on the beat and up off it, so the natural accents move. A click keeps the time true while the strokes change underneath it.',
      fact: 'economy-strokes',
    },
    techniqueTask({
      id: 'economy-60',
      title: 'Economy Picking at 60 BPM',
      exercise: 'tech-economy-picking',
      minutes: 6,
      body: 'Economy Picking at 60 BPM, triplets, one string per beat: ascending only until it is clean, then descending, then both. Over the coming weeks climb the ladder toward 132 BPM, 4 BPM a rung.',
      tip: 'Play just the last note of one string and the first of the next with one push of the pick, until it is one gesture.',
    }),
    {
      type: 'play-phrase',
      prompt: 'One octave of the run, economy picked: {n:G} up to {n:G}.',
      notes: ECONOMY_START,
      octave: 'exact',
      tempo: 60,
      explain: '{n:G} {n:A} {n:B}, {n:C} {n:D} {n:E}, {n:F#} {n:G}: down-up-down, down-up-down, down-up. Every note sounding, evenly, in order.',
      alternative: {
        type: 'order',
        prompt: 'Put one octave of the run in order, from string 6 fret 3.',
        tiles: ['{n:G}', '{n:A}', '{n:B}', '{n:C}', '{n:D}', '{n:E}', '{n:F#}', '{n:G}'],
        distractors: ['{n:F}'],
        explain: '{k:G major}: {n:G} {n:A} {n:B} on string 6, {n:C} {n:D} {n:E} on string 5, {n:F#} {n:G} on string 4. Record yourself and listen for the sweep rushing.',
      },
    },
    toolTask({
      id: 'accented-sixteenths',
      title: 'Sixteenths, first note accented',
      tool: 'metronome',
      minutes: 3,
      body: 'Set sixteenth subdivisions with the beat accented, at 60 BPM. Play the run in groups of four against it: the accent stays on the click while the strokes, grouped in threes by the strings, change underneath.',
    }),
    {
      type: 'choice',
      prompt: 'The sweeping string change keeps rushing. The remedy?',
      options: [
        { text: 'Slower, letting the second note wait', correct: true },
        { text: 'Accent the sweep to control it', why: 'Accenting it draws attention to the very note that is early.' },
        { text: 'Use two strokes there after all', why: 'That is alternate picking, a fine technique, but not this one.' },
      ],
      explain: 'The sweep tends to rush. Stay with the count and let the second note wait for its turn; at a tempo where that is possible, it becomes habit.',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap the three {k:G major} notes on string 5 between frets 3 and 7: the second string of the run.',
      find: { scale: 'major', tonic: 'G' },
      mode: 'all',
      octave: 'any',
      strings: [5],
      frets: [3, 7],
      explain: 'Frets 3, 5 and 7: {n:C}, {n:D}, {n:E}. Down-up-down ascending, up-down-up descending.',
    },
  ],
  facts: [
    { id: 'economy-strokes', front: 'Economy picking, ascending three notes per string: the strokes?', back: 'Down-up-down on each string; the last downstroke carries on through the next string in one motion. Descending: up-down-up.' },
    { id: 'economy-with-a-click', front: 'Why practise economy picking slowly, with a click?', back: 'It changes the accent pattern, and the sweeping string change tends to rush.' },
  ],
};

// ── 2. Sweep picking on three strings ───────────────────────────────────────────────────────────

const sweepThree: TeacherLesson = {
  id: 'sweep-picking-three',
  title: 'Sweep picking on three strings',
  teaches: 'A sweep is one continuous stroke, one note per string; each finger lifts the moment its note has sounded.',
  minutes: 4,
  skill: 'teacher:elena:sweep-picking-three',
  steps: [
    {
      type: 'card',
      title: 'One stroke, three notes',
      body: 'A {t:sweep-picking|sweep} is one continuous pick stroke across several strings, one note per string, like a slow strum that the fretting hand turns into single notes. The fretting hand does the hard part: each finger lifts the moment its note has sounded, so the notes never ring together. Start painfully slowly.',
      figure: { kind: 'tab', tempo: 50, notes: SWEEP_AM, caption: '{c:Am}: down through {n:A} {n:C} {n:E}, up through {n:C} {n:A}.' },
    },
    {
      type: 'choice',
      prompt: 'What makes a sweep sound like notes rather than a strum?',
      options: [
        { text: 'Each finger lifts as the next note sounds', correct: true },
        { text: 'Picking each string harder', why: 'Louder is not more separate. The fretting hand separates the notes.' },
        { text: 'A separate stroke for each string', why: 'Then it is no longer a sweep, but alternate picking.' },
      ],
      explain: 'The pick moves in one stroke; the fretting fingers lift behind it, so only one note sounds at a time.',
      fact: 'sweep-lift',
    },
    {
      type: 'card',
      title: 'Then C',
      body: 'Then {c:C}: string 3 fret 12 ({n:G}), string 2 fret 13 ({n:C}), string 1 fret 12 ({n:E}). The pick never leaves the strings: after each note it rests on the next string, then pushes through.',
      figure: { kind: 'tab', tempo: 50, notes: SWEEP_C, caption: '{c:C}: {n:G} {n:C} {n:E} down, {n:C} {n:G} up.' },
    },
    {
      type: 'fretboard-name',
      prompt: 'Both shapes share string 2, fret 13. Which note is it?',
      position: { string: 2, fret: 13 },
      ask: 'note',
      spelling: 'any',
      options: ['C', 'B', 'D', 'A'],
      explain: 'String 2 fret 13 is {n:C}: the third of {c:Am} and the root of {c:C}. One note, two jobs.',
    },
    techniqueTask({
      id: 'sweep-three',
      title: 'Sweep Picking: Three Strings',
      exercise: 'tech-sweep-three-string',
      minutes: 6,
      body: 'At 50 BPM, in triplets: down in one stroke, up in one stroke, the last note held for the rest of the beat. {c:Am}, then {c:C}. Up the ladder in 5 BPM steps, only when every note is separate.',
      tip: 'Practise the down sweep alone, very slowly. Speed is merely precision repeated.',
    }),
    {
      type: 'play-phrase',
      prompt: 'One sweep up and back on {c:Am}: string 3 fret 14, string 2 fret 13, string 1 fret 12, and back.',
      notes: SWEEP_AM,
      octave: 'exact',
      tempo: 50,
      explain: '{n:A} {n:C} {n:E} {n:C} {n:A}, each note alone. If two rang together, a finger stayed down too long.',
      alternative: {
        type: 'order',
        prompt: 'Put the notes of one {c:Am} sweep, down and back, in order.',
        tiles: ['{n:A}', '{n:C}', '{n:E}', '{n:C}', '{n:A}'],
        distractors: ['{n:G}'],
        explain: 'Down through {n:A} {n:C} {n:E}, back up through {n:C} {n:A}. On your guitar, record it and listen for notes ringing together.',
      },
    },
    {
      type: 'true-false',
      statement: 'In a down-sweep the pick lifts off the strings between notes.',
      answer: false,
      explain: 'It never leaves them: it rests on the next string after each note, then pushes through. One stroke, not three.',
      fact: 'sweep-lift',
    },
    {
      type: 'listen-choice',
      prompt: 'A student\'s recording of the {c:Am} sweep. Clean, or blurred?',
      sound: { kind: 'notes', notes: ['A4', 'C5', 'E5'], together: true },
      options: [{ text: 'Clean: separate notes' }, { text: 'Blurred: they rang together', correct: true }],
      shuffle: false,
      explain: 'All three notes sounded at once, as a strum would. Lift each finger as the next note sounds, and slow down until you can.',
    },
    { generate: 'chord-tones', params: { types: ['minor', 'major'], roots: ['A', 'C', 'G', 'E', 'D'], ask: 'notes' } },
  ],
  facts: [
    { id: 'sweep-lift', front: 'In a sweep, what keeps the notes from ringing together?', back: 'The fretting hand: each finger lifts the moment its note has sounded. The pick moves in one continuous stroke.' },
    { id: 'sweep-three-shapes', front: 'The three-string {c:Am} and {c:C} sweep shapes around fret 12?', back: '{c:Am}: string 3 fret 14, string 2 fret 13, string 1 fret 12. {c:C}: string 3 fret 12, string 2 fret 13, string 1 fret 12.' },
  ],
};

// ── 3. Sweep picking on five strings ────────────────────────────────────────────────────────────

const sweepFive: TeacherLesson = {
  id: 'sweep-picking-five',
  title: 'Sweep picking on five strings',
  teaches: 'Sweep the five-string A minor arpeggio, rolling (never barring) one finger across strings 4 and 3 at fret 14.',
  minutes: 4,
  skill: 'teacher:elena:sweep-picking-five',
  steps: [
    {
      type: 'card',
      title: 'Five strings, two octaves',
      body: 'Five strings: string 5 fret 12 ({n:A}), string 4 fret 14 ({n:E}), string 3 fret 14 ({n:A}), string 2 fret 13 ({n:C}), string 1 fret 12 ({n:E}), then a hammer-on to string 1 fret 17 ({n:A}), a pull-off back, and down again.',
      figure: { kind: 'tab', tempo: 50, notes: SWEEP_FIVE, caption: '{c:Am} over two octaves: up, the hammer to fret 17, and back.' },
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap every note of {c:Am} on strings 5 to 1 between frets 12 and 14.',
      find: { chord: 'Am' },
      mode: 'all',
      octave: 'any',
      strings: [5, 4, 3, 2, 1],
      frets: [12, 14],
      explain: 'Five: {n:A} at string 5 fret 12, {n:E} and {n:A} at fret 14 on strings 4 and 3, {n:C} at string 2 fret 13, {n:E} at string 1 fret 12. The sweep plays exactly these.',
    },
    {
      type: 'card',
      title: 'Roll, do not barre',
      body: 'Strings 4 and 3 at fret 14 need one finger rolled from one string to the other, from its pad to its tip, so only one note sounds at a time. Roll, do not barre, or the notes bleed together.',
      tip: 'It is a big reach at fret 14. Keep the thumb loose, and stop if the wrist aches.',
    },
    {
      type: 'choice',
      prompt: 'Strings 4 and 3 at fret 14 bleed into each other. Why?',
      options: [
        { text: 'The finger barres instead of rolling', correct: true },
        { text: 'The pick is moving too slowly', why: 'A slow sweep is exactly how it should start.' },
        { text: 'The hammer-on is too strong', why: 'The hammer-on is on string 1; it cannot make strings 4 and 3 ring together.' },
      ],
      explain: 'Barred, both notes are held down at once and ring together. Rolled, the finger frets one string, then the other, and only one sounds.',
      fact: 'roll-not-barre',
    },
    techniqueTask({
      id: 'sweep-five',
      title: 'Sweep Picking: Five Strings',
      exercise: 'tech-sweep-five-string',
      minutes: 6,
      body: 'At 50 BPM, sextuplets: six notes a beat. The picking palm trails the pick and rests on the strings you have left. Stop for the day if the wrist aches; the reach does not improve by force.',
    }),
    {
      type: 'true-false',
      statement: 'The picking palm can help: it trails behind the pick and mutes the strings you have left.',
      answer: true,
      explain: 'Both hands mute: the fretting fingers lift behind each note, and the picking palm rests on the strings already played.',
    },
    playerTask({
      id: 'arpeggio-study-wait',
      title: 'Sweep-Picked Arpeggios, wait mode',
      song: 'st-arpeggio-sweep',
      mode: 'wait',
      minutes: 5,
      body: 'Wait mode first: the music waits for each note, so you can check every roll and every lift. Bars 1 to 4 are triplets on three and five strings, bars 5 to 7 sextuplets.',
    }),
    playerTask({
      id: 'arpeggio-study-tempo',
      title: 'Sweep-Picked Arpeggios at 60 BPM',
      song: 'st-arpeggio-sweep',
      tempo: 83,
      minutes: 5,
      body: 'Then at about 60 BPM; 100 % (72 BPM) is the goal. Record your top clean tempo on your phone and listen for bleeding notes: two notes sounding at once is the fault, not the speed.',
    }),
    {
      type: 'fretboard-name',
      prompt: 'The root (R) is {n:A}. Which degree is the marked note, the second of the sweep?',
      position: { string: 4, fret: 14 },
      root: { string: 5, fret: 12 },
      ask: 'degree',
      spelling: 'any',
      options: ['5', '4', 'b3', 'b6'],
      explain: 'String 4 fret 14 is {n:E}, seven half steps above the {n:A} at string 5 fret 12: the fifth of {c:Am}.',
    },
    { generate: 'chord-tones', params: { types: ['minor', 'major'], roots: ['A', 'E', 'D', 'C', 'G'], ask: 'tone' } },
  ],
  facts: [
    { id: 'roll-not-barre', front: 'Two neighbouring strings at the same fret in a sweep: barre or roll?', back: 'Roll one finger from string to string, so only one note sounds at a time. A barre makes them bleed together.' },
    { id: 'sweep-five-shape', front: 'The five-string {c:Am} sweep shape?', back: 'String 5 fret 12, string 4 fret 14, string 3 fret 14, string 2 fret 13, string 1 fret 12, then a hammer-on to string 1 fret 17 ({n:A}).' },
  ],
};

// ── 4. String skipping ──────────────────────────────────────────────────────────────────────────

const stringSkipping: TeacherLesson = {
  id: 'string-skipping',
  title: 'String skipping',
  teaches: 'Skip strings with strict alternate picking and keep your time: octaves first, then box 1 on skipped pairs.',
  minutes: 4,
  skill: 'teacher:elena:string-skipping',
  steps: [
    {
      type: 'card',
      title: 'The jump must not change your time',
      body: 'Skipping a string with the pick is a jump, and the jump must not change your time. Start with octaves: string 6 fret 5 ({n:A}) to string 4 fret 7 ({n:A}), and string 5 fret 5 ({n:D}) to string 3 fret 7 ({n:D}).',
      figure: { kind: 'tab', tempo: 60, notes: SKIP_OCTAVES, caption: 'Octaves one string apart: {n:A} to {n:A}, {n:D} to {n:D}.' },
    },
    {
      type: 'play-phrase',
      prompt: 'The octave pairs, alternate picked: {n:A} to {n:A}, then {n:D} to {n:D}.',
      notes: SKIP_OCTAVES,
      octave: 'exact',
      tempo: 60,
      explain: 'String 6 fret 5 and string 4 fret 7 are both {n:A}, an octave apart; string 5 fret 5 and string 3 fret 7 are both {n:D}. Both notes of each pair, and nothing in between.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'The dot is {n:A}, string 6 fret 5. Tap the {n:A} an octave higher, one string skipped.',
        find: { interval: 'P8', from: { string: 6, fret: 5 } },
        mode: 'one',
        octave: 'exact',
        frets: [4, 8],
        shown: [{ string: 6, fret: 5, label: 'R' }],
        explain: 'Skip string 5 and go two frets up: string 4 fret 7 is the {n:A} an octave above.',
      },
    },
    {
      type: 'card',
      title: 'Box 1, split in pairs',
      body: 'Then {n:A} minor pentatonic box 1 on the string pairs 6 and 4, 5 and 3, 4 and 2, 3 and 1, up and back, strictly alternate. The finger fretting the lower string lies lightly across the skipped one to silence it. Wide intervals sound fresh after years of stepwise scales.',
      figure: { kind: 'fretboard', frets: [5, 8], derive: { scale: 'minor-pentatonic', tonic: 'A' }, caption: 'Box 1: play it on strings 6 and 4, 5 and 3, 4 and 2, 3 and 1.' },
    },
    {
      type: 'choice',
      prompt: 'You skip from string 6 to string 4. What keeps string 5 silent?',
      options: [
        { text: 'The fretting finger lies across it', correct: true },
        { text: 'A higher arc of the pick', why: 'A high arc wastes time and still lets string 5 ring in sympathy.' },
        { text: 'Picking string 4 more softly', why: 'Volume does not silence a neighbouring string.' },
      ],
      explain: 'The finger fretting the lower note lies lightly across the skipped string. The pick only has to clear it, by the smallest arc that does.',
      fact: 'skip-silence',
    },
    {
      type: 'fretboard-name',
      prompt: 'A skipped pair in box 1. The root (R) is {n:A}: which interval is the marked note above it?',
      position: { string: 2, fret: 8 },
      root: { string: 4, fret: 7 },
      ask: 'interval',
      spelling: 'any',
      options: ['m7', 'P5', 'M6', 'P8'],
      explain: 'String 2 fret 8 is {n:G}, ten half steps above the {n:A} at string 4 fret 7: a minor seventh. Stepwise, those two notes are four scale steps apart.',
    },
    techniqueTask({
      id: 'skipping-ladder',
      title: 'String Skipping at 60 BPM',
      exercise: 'tech-string-skipping',
      minutes: 6,
      body: 'The octaves, then the pentatonic skips, at 60 BPM and up the ladder 4 BPM at a time. The pick moves in a small arc over the skipped string: just high enough to clear it. Your time must not hiccup at the jump.',
    }),
    {
      type: 'true-false',
      statement: 'When you skip a string, the pick should arc well clear of the strings so it cannot catch one.',
      answer: false,
      explain: 'Just high enough to clear one string, no more. A high arc takes longer and the time hiccups at every jump.',
      fact: 'skip-silence',
    },
    toolTask({
      id: 'skipping-jam',
      title: 'Jam with skipped strings only',
      tool: 'progressions',
      params: ['funk-one-chord-minor', 'a', 'jam'],
      minutes: 5,
      body: 'Improvise over {c:Am7} at 96 BPM, on skipped strings only: no two notes in a row on neighbouring strings. Box 1 gives the notes; the rule gives the sound. Then record a stepwise phrase and a skipped one, and compare them.',
    }),
    { generate: 'interval-on-neck', params: { intervals: ['P8', 'm7', 'P5', 'P4'], ask: 'find', strings: [6, 5], frets: [3, 9] } },
  ],
  facts: [
    { id: 'skip-silence', front: 'Skipping a string with the pick: what silences the skipped string?', back: 'The finger fretting the lower note lies lightly across it. The pick arcs only just clear of it.' },
    { id: 'skip-octaves', front: 'The octave shapes that skip one string, on strings 6 and 4 or 5 and 3?', back: 'Two strings up and two frets up: string 6 fret 5 to string 4 fret 7 ({n:A}), string 5 fret 5 to string 3 fret 7 ({n:D}).' },
  ],
};

// ── 5. Hybrid picking ───────────────────────────────────────────────────────────────────────────

const hybridPicking: TeacherLesson = {
  id: 'hybrid-picking',
  title: 'Hybrid picking',
  teaches: 'Hybrid picking holds the pick between thumb and index and plucks higher strings with the middle and ring.',
  minutes: 4,
  skill: 'teacher:elena:hybrid-picking',
  steps: [
    {
      type: 'card',
      title: 'Pick and fingers',
      body: '{t:hybrid-picking|Hybrid picking} keeps the pick between thumb and index and frees the middle (m) and ring (a) fingers to pluck higher strings, at the same time as the pick or in between. You get the reach of fingerstyle with the attack of a pick.',
      figure: { kind: 'chord', symbol: 'C', frets: 'x32010', caption: 'Over {c:C}: the pick on strings 5 and 4, m and a above.' },
    },
    {
      type: 'choice',
      prompt: 'In hybrid picking, which fingers pluck?',
      options: [
        { text: 'Middle (m) and ring (a)', correct: true },
        { text: 'Thumb and index', why: 'They are holding the pick.' },
        { text: 'Index and middle', why: 'The index is busy holding the pick against the thumb.' },
      ],
      explain: 'Thumb and index hold the pick as usual; the middle and ring fingers are free, so they pluck.',
      fact: 'hybrid-fingers',
    },
    {
      type: 'card',
      title: 'Over C',
      body: 'Over {c:C} (x32010): the pick on string 5, m on string 2, the pick on string 4, a on string 1, in eighth notes. Then pinch: the pick and m together, string 5 and string 2 at once.',
      figure: { kind: 'tab', tempo: 60, notes: HYBRID_C, caption: 'Pick, m, pick, a: {n:C} {n:C} {n:E} {n:E}.' },
    },
    {
      type: 'play-phrase',
      prompt: 'Pick on string 5, m on string 2, pick on string 4, a on string 1. Twice.',
      notes: HYBRID_C,
      octave: 'exact',
      tempo: 60,
      explain: '{n:C} on string 5, {n:C} on string 2, {n:E} on string 4, {n:E} on string 1: the pick takes the bass, the fingers the treble.',
      alternative: {
        type: 'order',
        prompt: 'Put the four strokes of the pattern in order.',
        tiles: ['Pick, string 5', 'm, string 2', 'Pick, string 4', 'a, string 1'],
        distractors: ['i, string 3'],
        explain: 'Pick on 5, m on 2, pick on 4, a on 1. The index never plucks: it is holding the pick.',
      },
    },
    techniqueTask({
      id: 'hybrid-ladder',
      title: 'Hybrid Picking at 60 BPM',
      exercise: 'tech-hybrid-picking',
      minutes: 5,
      body: 'The pattern, then the pinch, from 60 BPM up the ladder. Pluck with the pad and a little nail, moving up and slightly out: never yank the string away from the guitar.',
      tip: 'If the pick turns when the fingers pluck, practise the pinch alone, slowly.',
    }),
    {
      type: 'true-false',
      statement: 'When the fingers pluck, it is fine for the pick grip to loosen a little.',
      answer: false,
      explain: 'The grip must stay put: pick and finger close toward each other like a small pinch. Practise the pinch alone until it does.',
      fact: 'hybrid-fingers',
    },
    toolTask({
      id: 'hybrid-jam',
      title: 'Jam: country with pick and fingers',
      tool: 'progressions',
      params: ['country-ii7', 'g', 'jam'],
      minutes: 5,
      body: 'Over {c:G}, {c:A7}, {c:D7}, {c:G}, the band at 110 BPM: bass notes with the pick on the beat, chord stabs with m and a on the and.',
    }),
    playerTask({
      id: 'devils-dream',
      title: 'Devil\'s Dream, the A part',
      song: 'devils-dream',
      minutes: 5,
      body: 'The A part, first with the pick alone, then with hybrid picking: let m and a take the open strings that ring between the fretted notes. Slowly at first; the tune is quicker than it looks.',
      fallback: {
        tool: 'player',
        params: ['irish-washerwoman'],
        title: 'A fiddle tune, hybrid picked',
        body: 'Devil\'s Dream is not in the Songs library yet. Take The Irish Washerwoman\'s A part instead: with the pick alone first, then let m and a pluck the open strings and the top notes.',
      },
    }),
    {
      type: 'match-pairs',
      prompt: 'Over {c:C}: match each finger with its string.',
      pairs: [
        { left: 'The pick', right: 'Strings 5 and 4' },
        { left: 'm (middle)', right: 'String 2' },
        { left: 'a (ring)', right: 'String 1' },
      ],
      explain: 'The pick takes the bass on strings 5 and 4; m plucks string 2 and a plucks string 1.',
    },
  ],
  facts: [
    { id: 'hybrid-fingers', front: 'Hybrid picking: who does what?', back: 'Thumb and index hold the pick; the middle (m) and ring (a) fingers pluck higher strings, with the pick or between its strokes.' },
    { id: 'hybrid-pinch', front: 'In hybrid picking, what is a pinch?', back: 'The pick and a finger striking at the same moment: over {c:C}, the pick on string 5 and m on string 2.' },
  ],
};

// ── 6. Speed, safely ────────────────────────────────────────────────────────────────────────────

const speedAndTremolo: TeacherLesson = {
  id: 'speed-and-tremolo',
  title: 'Speed, safely',
  teaches: 'Raise your top tempo in short bursts above it, each followed by rest; keep tremolo loose and tiny.',
  minutes: 5,
  skill: 'teacher:elena:speed-and-tremolo',
  steps: [
    {
      type: 'card',
      title: 'Bursts, not grinding',
      body: 'Speed is built in short bursts above your comfortable tempo, each followed by rest, not by grinding at the edge for minutes. Then return to your comfortable tempo: it will feel slower than it used to.',
      figure: { kind: 'tab', tempo: 80, notes: [...BURST, { rest: true, duration: 'q' }, ...BURST, ...BURST], caption: 'The burst figure: once, a beat of rest, then twice.' },
    },
    {
      type: 'choice',
      prompt: 'How is top speed built?',
      options: [
        { text: 'Short bursts above your tempo, then rest', correct: true },
        { text: 'Minutes on end at the edge of your speed', why: 'Grinding at the edge builds tension, and tension is the enemy of speed.' },
        { text: 'Only ever at your comfortable tempo', why: 'Comfortable tempo is where accuracy lives, but speed needs short visits beyond it.' },
      ],
      explain: 'Short, loose bursts above your top tempo, each followed by rest. Afterwards your comfortable tempo feels slower than it did.',
      fact: 'speed-bursts',
    },
    {
      type: 'play-phrase',
      prompt: 'The figure twice, in sixteenths: {n:C} {n:B} {n:A} {n:G}, {n:C} {n:B} {n:A} {n:G}.',
      notes: [...BURST, ...BURST],
      octave: 'exact',
      tempo: 80,
      explain: 'String 1 frets 8, 7, 5, then string 2 fret 8: {n:C} {n:B} {n:A} {n:G}. Loose, almost thrown, then rest.',
      alternative: {
        type: 'order',
        prompt: 'Put the four notes of the burst figure in order.',
        tiles: ['{n:C}', '{n:B}', '{n:A}', '{n:G}'],
        distractors: ['{n:D}'],
        explain: 'String 1 fret 8 {n:C}, fret 7 {n:B}, fret 5 {n:A}, then string 2 fret 8 {n:G}: down the scale.',
      },
    },
    techniqueTask({
      id: 'speed-bursts',
      title: 'Speed Bursts',
      exercise: 'tech-speed-bursts',
      minutes: 5,
      body: 'Set a tempo just above your comfortable top. The figure once, a beat of rest; twice in a row, rest; then four times. Shake out before each burst. A few minutes only, then back to your normal tempo, and notice.',
      tip: 'A tense burst is too fast. Drop the tempo one step; looseness is the skill.',
    }),
    {
      type: 'card',
      title: 'Tremolo: loose and tiny',
      body: '{t:tremolo-picking|Tremolo picking}, very fast alternation on one note, needs a loose wrist and a tiny motion. Sixteenths first; thirty-seconds at no more than half the tempo. Change notes on the beat without stopping the hand. A burning forearm means stop at once and rest.',
    },
    {
      type: 'true-false',
      statement: 'Thirty-second tremolo is practised at no more than half the tempo of your sixteenths.',
      answer: true,
      explain: 'At half the tempo, thirty-seconds move the hand exactly as fast as sixteenths did. Faster than that, and tension wins.',
      fact: 'tremolo-loose',
    },
    techniqueTask({
      id: 'tremolo',
      title: 'Tremolo Picking',
      exercise: 'tech-tremolo-picking',
      minutes: 5,
      body: 'On the open string 1, sixteenths up the ladder, then the same pitch at string 2 fret 5, changing on the beat. Thirty-seconds at half the tempo or less. Thirty seconds of tremolo, thirty of rest.',
    }),
    playerTask({
      id: 'mountain-king',
      title: 'In the Hall of the Mountain King',
      song: 'hall-of-the-mountain-king',
      minutes: 5,
      body: 'The theme climbs from 60 BPM toward 160 by itself, one step per statement. Strictly alternate picked, every note short. Stop at the first statement you cannot play cleanly: that tempo is tomorrow\'s burst.',
    }),
    {
      type: 'choice',
      prompt: 'In Mountain King, the statement at 120 BPM goes ragged. What now?',
      options: [
        { text: 'Practise at 100, with short bursts at 120', correct: true },
        { text: 'Play it at 120 until it is clean', why: 'That is grinding at the edge, rehearsing the ragged version.' },
        { text: 'Skip ahead to 140 to stretch yourself', why: 'If 120 is ragged, 140 will be worse, and tense.' },
      ],
      explain: 'Work at the last clean tempo and visit the next one in short bursts, with rest. That is how the ragged statement becomes clean.',
      fact: 'speed-bursts',
    },
    playerTask({
      id: 'longer-goals',
      title: 'Longer goals: Rossini and Paganini',
      song: 'william-tell-galop',
      minutes: 5,
      body: 'The William Tell galop: the gallop rhythm, two sixteenths and an eighth, picked strictly down-up-down. Then, as a goal for months, the theme of Paganini\'s Caprice No. 24.',
      fallback: {
        tool: 'player',
        params: ['hall-of-the-mountain-king', 'm17-24'],
        title: 'Longer goals: bring your own edition',
        body: 'The galop and Paganini\'s Caprice No. 24 need a printed edition, and are not in the library. If you own one, bring it in with Scan and Import (Tools) and learn it in the Player. Meanwhile: Mountain King\'s last two statements, 140 and 160 BPM.',
      },
    }),
    {
      type: 'match-pairs',
      prompt: 'Match each part of safe speed work with its rule.',
      pairs: [
        { left: 'A burst', right: 'Short, above your tempo' },
        { left: 'Rest', right: 'After every burst' },
        { left: 'Tremolo', right: 'Loose wrist, tiny motion' },
        { left: 'Thirty-seconds', right: 'Half the tempo or less' },
      ],
      explain: 'Bursts are short and above your tempo; rest follows every one; tremolo stays loose and small; thirty-seconds come at half the tempo or less.',
      fact: 'tremolo-loose',
    },
  ],
  facts: [
    { id: 'speed-bursts', front: 'How do you raise your top tempo safely?', back: 'Short bursts just above it, each followed by rest; then back to your comfortable tempo, which now feels slower.' },
    { id: 'tremolo-loose', front: 'What does tremolo picking need?', back: 'A loose wrist and a tiny motion. Thirty-seconds at no more than half the tempo; stop at once if the forearm burns.' },
  ],
};

/** Unit 3 of Prof. Varga's course. */
const unit: TeacherUnit = {
  id: 'elena-advanced-picking',
  title: 'Advanced picking',
  theme: 'technique',
  description: 'Add economy and sweep picking, string skipping, hybrid picking and controlled speed to your alternate picking.',
  lessons: [economyPicking, sweepThree, sweepFive, stringSkipping, hybridPicking, speedAndTremolo],
  checkpoint: { sample: 8, maxMistakes: 2 },
  glossary: [
    { id: 'economy-picking', term: 'economy picking', definition: 'Alternate picking on each string, but one continuing stroke where the next string lies in the direction the pick is already moving.' },
    { id: 'sweep-picking', term: 'sweep picking', definition: 'One continuous pick stroke across several strings, one note per string; the fretting hand lifts each note to keep them separate.' },
    { id: 'hybrid-picking', term: 'hybrid picking', definition: 'Playing with the pick between thumb and index while the middle and ring fingers pluck other strings.' },
    { id: 'tremolo-picking', term: 'tremolo picking', definition: 'Very fast, even alternate picking on one note, from a loose wrist.' },
  ],
};

export default unit;
