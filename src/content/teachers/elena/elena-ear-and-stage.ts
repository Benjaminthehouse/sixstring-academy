/**
 * Prof. Varga, unit 13: Transcription and performance (plan: `elena/elena-ear-and-stage` in
 * src/content/plan/teachers.json). The last unit of the course.
 *
 * Elena's voice: conservatory rigour, dry humour, high standards, deep respect for the student.
 * Every fact of each plan entry's `explain` is on the cards; the `show` becomes the figures (the
 * audio is the "recording" with its replay button, the empty staff and the reveal are staff and tab
 * figures); the `practice` steps become in-lesson exercises or tasks that send the learner to Ear
 * Training, Progressions, the Player, Technique, the Metronome and the Practice Plan, and back.
 *
 * The music written for this unit (cross-checked by `elena-ear-and-stage.test.ts`):
 *   MELODY  Elena's original 8-bar melody in G major, 3/4: two phrases, the first ending on A over
 *           an implied D (a half close), the second at home on G.
 *   SOLO    Elena's original two-chorus blues solo in A (A7, D7, E7), straight eighths: one motif
 *           (E C# A, the fifth, third and root of A7) moved to D7, played backwards in chorus 2, and
 *           a chord tone on every struck beat 1 and 3 except the blue third in bar 2.
 * The progressions are the catalog's own (`jazz-i-vi7-ii-v` and `classical-deceptive` in C).
 *
 * Swaps, because the planned classical solos are not in the song library (they need a printed
 * edition this project cannot consult): Lagrima and the Prelude BWV 999 (memorising) -> the A minor
 * study in 3/4 (`st-pimami-3-4`: a continuous arpeggio over a thumb bass, a tune on top in bars 9
 * to 16), with Scan & Import taught for the learner's own edition; Gran Vals (recital opener) -> the
 * same study, memorised in lesson 4; Asturias (centrepiece) -> the Concert Tremolo Etude
 * (`st-concert-tremolo-etude`: a thumb line against repeated treble notes). The jazz ballad
 * (`st-chord-melody-2`) is the library's. The closer, which the plan leaves open, is The Irish
 * Washerwoman (`irish-washerwoman`), and its opening is the unit's performance. There is no melodic
 * or bass-line dictation drill in Ear Training: the nearest drills are Melody playback (level 7)
 * and Scale degrees (level 4). The plan's "Record" steps have no screen: Elena asks for a phone
 * recording beside the Player's Flow mode and the Practice Plan's session timer.
 */
import { noteAt } from '@/core/guitar';
import type { TabNote } from '@/lessons';
import type { TeacherLesson, TeacherUnit } from '../types';
import { playerTask, techniqueTask, toolTask } from '../tasks';

/** One tab note. */
function t(string: number, fret: number, duration: string): TabNote {
  return { string, fret, duration };
}

/** A rest. */
function r(duration: string): TabNote {
  return { rest: true, duration };
}

// ── The music ──────────────────────────────────────────────────────────────────────────────────

/** Elena's 8-bar melody, G major, 3/4, bar by bar, all in first position. */
export const MELODY_BARS: readonly TabNote[][] = [
  [t(4, 0, 'q'), t(3, 0, 'q'), t(2, 0, 'q')], //   D G B
  [t(2, 3, 'h'), t(2, 1, 'q')], //                  D C
  [t(2, 0, 'q.'), t(3, 2, 'e'), t(3, 0, 'q')], //   B A G
  [t(3, 2, 'h.')], //                               A: phrase 1 ends open, on the second degree
  [t(4, 0, 'q'), t(3, 0, 'q'), t(2, 0, 'q')], //   D G B
  [t(1, 0, 'h'), t(2, 3, 'q')], //                  E D
  [t(2, 1, 'q'), t(3, 2, 'q'), t(4, 4, 'q')], //   C A F#: D7 without its root
  [t(3, 0, 'h.')], //                               G: home
];

/** The whole melody, as one phrase. */
export const MELODY: TabNote[] = MELODY_BARS.flat();

/** The melody's tempo, in quarter notes a minute. */
export const MELODY_TEMPO = 84;

/** The melody as notation, spelled in G major (the reveal). */
export const MELODY_STAFF = MELODY.filter((n): n is TabNote & { string: number; fret: number } => 'string' in n).map((n) => ({
  note: noteAt(n, { context: { key: 'G major' } }),
  duration: n.duration,
}));

/** The chord of each bar of Elena's solo: two choruses of the 12-bar blues in A, the second ending on A7. */
export const SOLO_CHORDS: readonly string[] = [
  'A7', 'A7', 'A7', 'A7', 'D7', 'D7', 'A7', 'A7', 'E7', 'D7', 'A7', 'E7',
  'A7', 'A7', 'A7', 'A7', 'D7', 'D7', 'A7', 'A7', 'E7', 'D7', 'A7', 'A7',
];

/** Elena's two-chorus blues solo, bar by bar, 4/4, around fifth position. */
export const SOLO_BARS: readonly TabNote[][] = [
  // Chorus 1
  [r('q'), t(2, 5, 'e'), t(3, 6, 'e'), t(4, 7, 'q'), r('q')], //               1  the motif: E C# A
  [t(3, 5, 'e'), t(3, 6, 'e'), t(2, 5, 'q'), r('h')], //                       2  C (the blue third) C# E
  [r('q'), t(2, 5, 'e'), t(3, 6, 'e'), t(4, 7, 'q'), r('q')], //               3  the motif again
  [t(2, 8, 'h'), t(2, 5, 'q'), r('q')], //                                     4  G, leaning toward D7
  [r('q'), t(1, 5, 'e'), t(2, 7, 'e'), t(3, 7, 'q'), r('q')], //               5  the motif on D7: A F# D
  [t(3, 5, 'e'), t(3, 7, 'e'), t(2, 7, 'q'), r('h')], //                       6  C D F#
  [r('q'), t(2, 5, 'e'), t(3, 6, 'e'), t(4, 7, 'q'), r('q')], //               7  the motif, home
  [t(4, 7, 'h'), r('h')], //                                                   8  space
  [t(2, 5, 'q'), t(3, 7, 'e'), t(3, 4, 'e'), t(4, 6, 'q'), r('q')], //         9  E7: E D B G#
  [t(3, 7, 'q'), t(4, 7, 'e'), t(4, 4, 'e'), t(3, 5, 'q'), r('q')], //         10 D7: D A F# C
  [t(3, 6, 'q'), t(4, 7, 'h.')], //                                            11 C# A
  [t(4, 6, 'q'), t(3, 4, 'q'), t(3, 7, 'q'), r('q')], //                       12 E7: G# B D
  // Chorus 2
  [r('q'), t(4, 7, 'e'), t(3, 6, 'e'), t(2, 5, 'q'), r('q')], //               13 the motif backwards: A C# E
  [t(1, 5, 'q'), t(2, 8, 'e'), t(2, 5, 'e'), t(1, 5, 'h')], //                 14 A G E A
  [r('q'), t(4, 7, 'e'), t(3, 6, 'e'), t(2, 5, 'q'), r('q')], //               15 backwards again
  [t(1, 5, 'e'), t(1, 8, 'e'), t(1, 5, 'e'), t(2, 8, 'e'), t(2, 5, 'q'), r('q')], // 16 up to C
  [r('q'), t(3, 7, 'e'), t(2, 7, 'e'), t(1, 5, 'q'), r('q')], //               17 backwards on D7: D F# A
  [t(1, 8, 'q'), t(1, 5, 'e'), t(2, 7, 'e'), t(3, 7, 'h')], //                 18 C A F# D
  [t(2, 5, 'e'), t(3, 6, 'e'), t(4, 7, 'q'), r('h')], //                       19 the motif, a beat early
  [r('h'), t(4, 7, 'q'), t(4, 5, 'q')], //                                     20 A G
  [t(1, 7, 'q'), t(1, 7, 'q'), t(2, 5, 'e'), t(3, 7, 'e'), t(4, 6, 'q')], //   21 E7: B B E D G#
  [t(1, 5, 'q'), t(2, 7, 'q'), t(3, 7, 'q'), t(3, 5, 'q')], //                 22 D7: A F# D C
  [r('q'), t(2, 5, 'e'), t(3, 6, 'e'), t(4, 7, 'q'), t(5, 7, 'q')], //         23 the motif closes it, then E
  [t(6, 5, 'w')], //                                                           24 the low A
];

/** The whole solo, as one phrase. */
export const SOLO: TabNote[] = SOLO_BARS.flat();

/** The solo's tempo, in quarter notes a minute. */
export const SOLO_TEMPO = 100;

/** The jazz turnaround with a secondary dominant (`jazz-i-vi7-ii-v` in C), two chords to a bar. */
export const TURNAROUND: readonly string[] = ['Cmaj7', 'A7', 'Dm7', 'G7'];

/** The deceptive cadence (`classical-deceptive` in C), one chord to a bar. */
export const DECEPTIVE: readonly string[] = ['C', 'F', 'G7', 'Am', 'F', 'Dm', 'G7', 'C'];

/** The tune on top of bars 9 to 15 of the A minor study in 3/4 (`st-pimami-3-4`), one note a bar. */
export const STUDY_TUNE: TabNote[] = [t(1, 0, 'h.'), t(1, 1, 'h.'), t(1, 4, 'h.'), t(1, 0, 'h.'), t(1, 3, 'h.'), t(1, 1, 'h.'), t(1, 0, 'h.')];

/** The pickup and the first two bars of The Irish Washerwoman, as the library has them. */
export const WASHERWOMAN_OPENING: TabNote[] = [
  t(2, 3, 'e'), t(2, 1, 'e'),
  t(2, 0, 'e'), t(3, 0, 'e'), t(3, 0, 'e'), t(4, 0, 'e'), t(3, 0, 'e'), t(3, 0, 'e'),
  t(2, 0, 'e'), t(3, 0, 'e'), t(2, 0, 'e'), t(2, 3, 'e'), t(2, 1, 'e'), t(2, 0, 'e'),
];

// ── 1. Transcribing a melody ───────────────────────────────────────────────────────────────────

const transcribingMelodies: TeacherLesson = {
  id: 'transcribing-melodies',
  title: 'Transcribing a melody',
  teaches: 'Transcribe in passes: form and key, then the rhythm of one phrase, then the pitches, then check every note.',
  minutes: 5,
  skill: 'teacher:elena:transcribing-melodies',
  steps: [
    {
      type: 'card',
      title: 'The best ear training there is',
      body: '{t:transcription|Transcription} trains the ear more than anything else. Work in passes: the form and the key; the rhythm of one phrase, tapped; the pitches; then every note checked against the recording. Eight bars of mine: listen three times before you write a thing.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: MELODY, tempo: MELODY_TEMPO }, label: 'Eight bars (play again)' },
    },
    {
      type: 'listen-choice',
      prompt: 'Pass one: where is home, and how many beats to the bar?',
      sound: { kind: 'tab', notes: MELODY, tempo: MELODY_TEMPO },
      options: [
        { text: '{k:G major}, three beats a bar', correct: true },
        { text: '{k:E minor}, three beats a bar', why: 'The same signature, but the melody climbs a {c:G} triad and comes to rest on {n:G}.' },
        { text: '{k:G major}, four beats a bar', why: 'Count along: the strong beat returns every three, and the long notes last two or three beats.' },
        { text: '{k:D major}, three beats a bar', why: '{k:D major} needs {n:C#}; bars 2 and 7 have {n:C} natural.' },
      ],
      explain: 'It opens on a {c:G} arpeggio, leans on {n:F#} as its leading note and ends on {n:G}: {k:G major}, in 3/4.',
      fact: 'es-transcribe-passes',
    },
    {
      type: 'card',
      title: 'Pass two: the rhythm of one phrase',
      body: 'Now the rhythm alone, one phrase at a time, and tap it before you write it: the hand decides what the ear only suspects. Phrase one is bars 1 to 4.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: MELODY_BARS.slice(0, 4).flat(), tempo: MELODY_TEMPO }, label: 'Phrase one' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Bars 3 and 4 of phrase one: listen, then tap what you heard.',
      rhythm: { pattern: 'q. e q | h.', time: '3/4' },
      tempo: MELODY_TEMPO,
      show: 'audio',
      explain: 'A dotted quarter and an eighth, a quarter, then one note held through the whole of bar 4: the end of the phrase.',
    },
    {
      type: 'card',
      title: 'Pass three: the pitches',
      body: 'Write the key and time signatures first, then fill the bars. Find the first note, then hear each next note as an interval from the last. Mine starts on the open string 4, {n:D}. Write it in notation: the act of writing forces you to decide.',
      figure: { kind: 'staff', key: 'G major', time: '3/4', notes: [], caption: 'Your page: {k:G major} and 3/4. The notes are yours to write.' },
    },
    {
      type: 'order',
      prompt: 'Bars 1 and 2: put the pitches in order.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: MELODY_BARS.slice(0, 2).flat(), tempo: MELODY_TEMPO }, label: 'Bars 1 and 2' },
      tiles: ['{n:D}', '{n:G}', '{n:B}', '{n:D}', '{n:C}'],
      distractors: ['{n:E}'],
      explain: 'Up the {c:G} triad, {n:D} {n:G} {n:B}, to the high {n:D}, then a step down to {n:C}: the open strings 4, 3 and 2, then frets 3 and 1 of string 2.',
      fact: 'es-transcribe-passes',
    },
    {
      type: 'fill-blanks',
      prompt: 'Phrase two. Fill in bar 7.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: MELODY_BARS.slice(4).flat(), tempo: MELODY_TEMPO }, label: 'Phrase two' },
      text: 'Bar 7: {n:C}  ___  ___   Bar 8: {n:G}',
      blanks: ['{n:A}', '{n:F#}'],
      bank: ['{n:F}', '{n:B}'],
      explain: '{n:C} {n:A} {n:F#}, falling thirds that spell {c:D7} without its root, then home to {n:G}. {n:F} natural would not lead home.',
    },
    {
      type: 'staff-place',
      prompt: 'Write the last note of bar 7, the leading note, on your staff. It is string 4, fret 4.',
      note: 'F#3',
      octave: 'exact',
      key: 'G major',
      explain: 'String 4, fret 4 sounds {n:F#3}, written in the bottom space. The key signature already sharpens it, so it needs no sign of its own.',
    },
    {
      type: 'card',
      title: 'Pass four: check every note',
      body: 'Check every note against the recording, bar by bar, and count your errors: a wrong pitch is one, a wrong length another. Then compare with mine. The errors tell you which pass to repeat.',
      figure: { kind: 'staff', key: 'G major', time: '3/4', notes: MELODY_STAFF, caption: 'The reveal: two four-bar phrases.' },
    },
    {
      type: 'choice',
      prompt: 'Your bar 3 reads three even quarter notes. Which pass do you repeat?',
      options: [
        { text: 'The rhythm pass: tap bar 3 again', correct: true },
        { text: 'The pitch pass', why: 'The pitches may well be right. It is the lengths that are wrong.' },
        { text: 'All of it, from the key', why: 'One wrong rhythm is not a wrong key. Repeat the pass that failed, not the whole transcription.' },
      ],
      explain: 'Bar 3 is a dotted quarter, an eighth and a quarter. Wrong lengths go back to the rhythm pass: tap the bar until the hand agrees with the ear.',
    },
    toolTask({
      id: 'melodic-dictation',
      title: 'Ear: melodic dictation',
      tool: 'ear',
      params: ['melody', '7'],
      minutes: 6,
      body: 'Melody playback, level 7: six-note phrases with leaps and repeats, the longest the drill offers. Sing each phrase back before you answer. If you cannot sing it, you have not yet heard it.',
    }),
    playerTask({
      id: 'korobeiniki-by-ear',
      title: 'Korobeiniki, by ear',
      song: 'korobeiniki',
      bars: [1, 4],
      tempo: 70,
      minutes: 8,
      body: 'Bars 1 to 4 of Korobeiniki on loop at 70 % (70 BPM), the screen turned away. The four passes, on paper, in notation. Then bars 5 to 8. Only then look at the score, and count your errors.',
    }),
    {
      type: 'order',
      prompt: 'Put the four passes of a transcription in order.',
      tiles: ['Form and key', 'Rhythm', 'Pitches', 'Check it all'],
      explain: 'The form and the key first; then the rhythm of a phrase, tapped; then the pitches; then every note checked against the recording.',
      fact: 'es-transcribe-passes',
    },
  ],
  facts: [
    { id: 'es-transcribe-passes', front: 'The four passes of a transcription?', back: 'The form and the key; the rhythm of one phrase, tapped; the pitches; then every note checked against the recording.' },
    { id: 'es-write-it-down', front: 'Why write a transcription in notation?', back: 'Because the act of writing forces you to decide: every pitch, every length.' },
  ],
};

// ── 2. Transcribing harmony ────────────────────────────────────────────────────────────────────

const transcribingHarmony: TeacherLesson = {
  id: 'transcribing-harmony',
  title: 'Transcribing harmony',
  teaches: 'Transcribe harmony from the bottom up: the bass line first, then each chord\'s quality, then the extensions.',
  minutes: 5,
  skill: 'teacher:elena:transcribing-harmony',
  steps: [
    {
      type: 'card',
      title: 'From the bottom up',
      body: 'Harmony is transcribed from the bottom up. Find the bass line and sing it: most of the time it gives you the roots. Then each chord\'s quality: major, minor, dominant or diminished. Only then the sevenths and extensions. Three rows on your chart. Four chords, two to a bar:',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: [...TURNAROUND], beats: 2, tempo: 100 }, label: 'Four chords (play again)' },
    },
    {
      type: 'listen-choice',
      prompt: 'Row one, the bass. Sing it, then choose.',
      sound: { kind: 'progression', chords: [...TURNAROUND], beats: 2, tempo: 100 },
      options: [
        { text: '{n:C} {n:A} {n:D} {n:G}', correct: true },
        { text: '{n:C} {n:A} {n:F} {n:G}', why: 'Chord 3 shares three notes with an {c:F} chord, but its bass is {n:D}, a fourth above the {n:A}.' },
        { text: '{n:C} {n:E} {n:D} {n:G}', why: 'The second bass note falls from {n:C}; it does not rise.' },
      ],
      explain: 'The bass falls from {n:C} to {n:A}, rises a fourth to {n:D} and falls a fifth to {n:G}: four roots in {k:C major}.',
      fact: 'es-harmony-bottom-up',
    },
    toolTask({
      id: 'bass-dictation',
      title: 'Ear: bass notes as degrees',
      tool: 'ear',
      params: ['degrees', '4'],
      minutes: 4,
      body: 'Bass-line dictation, one note at a time: Scale degrees, level 4. Each note is heard against its key; name its degree, as you would name a bass note under a chord. Sing down to the tonic before you answer.',
    }),
    {
      type: 'card',
      title: 'Row two: the quality',
      body: 'Now each chord\'s quality. The third first: major or minor. Then the seventh, and which one. In {k:C major}, a chord on {n:A} ought to be {c:Am7}. Listen to the second chord alone, and to its third in particular.',
      figure: { kind: 'audio', sound: { kind: 'chord', chord: 'A7', voicing: 'close', octave: 3 }, label: 'Chord 2 alone' },
    },
    {
      type: 'listen-choice',
      prompt: 'Chord 2. Which quality?',
      sound: { kind: 'chord', chord: 'A7', voicing: 'close', octave: 3 },
      options: [
        { text: 'Dominant seventh', correct: true },
        { text: 'Minor seventh', why: 'That is what the key leads you to expect. The third you hear is major: {n:C#}.' },
        { text: 'Major seventh', why: 'The seventh is a whole step below the octave, not a half step: {n:G}, not {n:G#}.' },
      ],
      explain: '{n:A} {n:C#} {n:E} {n:G}: a dominant seventh. Its {n:C#} lies outside {k:C major} and leads to {n:D}: it is the {t:secondary-dominant} of {c:Dm7}.',
      fact: 'es-a7-in-c',
    },
    {
      type: 'fill-blanks',
      prompt: 'Fill in the chart, the rows combined into chord symbols.',
      text: '{c:Cmaj7}  ___  |  {c:Dm7}  ___',
      blanks: ['{c:A7}', '{c:G7}'],
      bank: ['{c:Am7}', '{c:Gmaj7}'],
      explain: '{c:Cmaj7} {c:A7} | {c:Dm7} {c:G7}: {r:Imaj7} {r:V7/ii} {r:ii7} {r:V7}. The {c:A7} borrows the pull of a dominant to reach {c:Dm7}.',
      fact: 'es-a7-in-c',
    },
    { generate: 'chord-quality-ear', params: { types: ['maj7', '7', 'm7', 'm7b5'] } },
    toolTask({
      id: 'sevenths-drill',
      title: 'Ear: five sevenths',
      tool: 'ear',
      params: ['chords', '7'],
      minutes: 4,
      body: 'Chord quality, level 7: major seventh, dominant, minor seventh, half-diminished and diminished seventh. The third first, then the seventh. Stay until you are right nine times in ten.',
    }),
    toolTask({
      id: 'deceptive-hidden',
      title: 'Jam: a chart you cannot see',
      tool: 'progressions',
      params: ['classical-deceptive', 'c', 'jam'],
      minutes: 4,
      body: 'An eight-bar progression in {k:C major}. Start the band, then turn the screen away. Write the bass first, then the qualities, then any sevenths: four times through. Then look. That is the reveal.',
    }),
    {
      type: 'order',
      prompt: 'Its bass line, bar by bar. Put it in order.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: [...DECEPTIVE], beats: 2, tempo: 72 }, label: 'Eight bars' },
      tiles: ['{n:C}', '{n:F}', '{n:G}', '{n:A}', '{n:F}', '{n:D}', '{n:G}', '{n:C}'],
      explain: '{n:C} {n:F} {n:G} {n:A}, {n:F} {n:D} {n:G} {n:C}: {c:C} {c:F} {c:G7} {c:Am}, {c:F} {c:Dm} {c:G7} {c:C}.',
      fact: 'es-deceptive-bass',
    },
    {
      type: 'choice',
      prompt: 'Bar 4 surprises the ear. What happens there?',
      options: [
        { text: '{c:G7} goes to {c:Am}, not home', correct: true },
        { text: '{c:G7} goes home to {c:C}', why: 'That is bar 8. In bar 4 the bass rises a step instead, from {n:G} to {n:A}.' },
        { text: 'The phrase stops on {c:G7}', why: 'A half close would stop on {r:V}. Here {r:V7} moves on, to {r:vi}.' },
      ],
      explain: 'A deceptive cadence: {r:V7} to {r:vi}. The bass rises from {n:G} to {n:A} instead of falling to {n:C}, and the phrase has to try again.',
      fact: 'es-deceptive-bass',
    },
    { generate: 'cadence-ear', params: { types: ['authentic', 'deceptive', 'half', 'plagal'] } },
    toolTask({
      id: 'turnaround-band',
      title: 'Jam: the turnaround, with the band',
      tool: 'progressions',
      params: ['jazz-i-vi7-ii-v', 'c', 'jam'],
      minutes: 3,
      body: 'Now the four chords you transcribed above, with the band. Turn the screen away and comp from your own chart. Then look, and check every symbol against the screen.',
    }),
    {
      type: 'true-false',
      statement: 'You listen for ninths and thirteenths before you have settled the bass line.',
      answer: false,
      explain: 'Extensions come last. The bass gives the roots, the thirds and sevenths give the qualities, and only then is there anything for an extension to extend.',
      fact: 'es-harmony-bottom-up',
    },
  ],
  facts: [
    { id: 'es-harmony-bottom-up', front: 'In which order do you transcribe a progression?', back: 'From the bottom up: the bass line first (sing it: it usually gives the roots), then each chord\'s quality, then sevenths and extensions.' },
    { id: 'es-a7-in-c', front: 'In {k:C major} you hear {c:A7} where {c:Am7} belongs. What gives it away?', back: 'Its third, {n:C#}, outside the key: {c:A7} is the secondary dominant of {c:Dm7}, {r:V7/ii}.' },
    { id: 'es-deceptive-bass', front: 'How does a deceptive cadence sound in the bass?', back: '{r:V7} should fall to {r:I}; instead the bass rises a step to {r:vi}: {c:G7} to {c:Am} in {k:C major}.' },
  ],
};

// ── 3. Transcribing a solo ─────────────────────────────────────────────────────────────────────

const transcribingASolo: TeacherLesson = {
  id: 'transcribing-a-solo',
  title: 'Transcribing a solo',
  teaches: 'Transcribe a solo two bars at a time, learn it at tempo, and analyse its chord tones, motif and space.',
  minutes: 5,
  skill: 'teacher:elena:transcribing-a-solo',
  steps: [
    {
      type: 'card',
      title: 'Phrasing, which no book can teach',
      body: 'Learning a solo by ear teaches phrasing, which no book can. Transcribe a short solo, mine or one from a recording you own, for your private study. Learn it at tempo; analyse it; then write a solo of your own in the same style. Mine: two choruses of blues in {k:A major}.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: SOLO, tempo: SOLO_TEMPO }, label: 'Two choruses (play again)' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Two bars at a time. Bars 1 and 2: listen, then tap the rhythm.',
      rhythm: { pattern: 'qr e e q qr | e e q hr' },
      tempo: SOLO_TEMPO,
      show: 'audio',
      explain: 'A beat of silence, two eighths and a quarter, silence; then two eighths, a quarter and two beats of rest. The space belongs to the phrase.',
    },
    {
      type: 'order',
      prompt: 'Now the pitches of bars 1 and 2, around fifth position.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: SOLO_BARS.slice(0, 2).flat(), tempo: SOLO_TEMPO }, label: 'Bars 1 and 2' },
      tiles: ['{n:E}', '{n:C#}', '{n:A}', '{n:C}', '{n:C#}', '{n:E}'],
      distractors: ['{n:G}'],
      explain: '{n:E} {n:C#} {n:A}: the fifth, third and root of {c:A7}, falling. Then {n:C}, the blue third, straight up to {n:C#} and {n:E}.',
    },
    {
      type: 'play-phrase',
      prompt: 'Bars 1 to 4 from your transcription, at 100 BPM if you can, with the space where it belongs.',
      notes: SOLO_BARS.slice(0, 4).flat(),
      octave: 'exact',
      tempo: SOLO_TEMPO,
      explain: 'The motif, {n:E} {n:C#} {n:A}; its answer, {n:C} {n:C#} {n:E}; the motif again; then a long {n:G}, the seventh of {c:A7}, leaning toward {c:D7}.',
      alternative: {
        type: 'order',
        prompt: 'Put bars 3 and 4 in order.',
        tiles: ['{n:E}', '{n:C#}', '{n:A}', '{n:G}', '{n:E}'],
        distractors: ['{n:F#}'],
        explain: 'Bar 3 is the motif again, {n:E} {n:C#} {n:A}; bar 4 holds {n:G} at string 2, fret 8, then falls to {n:E}.',
      },
    },
    {
      type: 'card',
      title: 'Then analyse it',
      body: 'Annotate four things: the chord tones on the strong beats, the motif and what becomes of it, the space, and the techniques. The audio plays plain notes, so the techniques are yours to choose: a slide into the first {n:E}, say. Bar 5 is the place to start.',
      figure: { kind: 'tab', tempo: SOLO_TEMPO, notes: [...SOLO_BARS[0], ...SOLO_BARS[4]], caption: 'Bar 1 over {c:A7}, then bar 5 over {c:D7}.' },
    },
    {
      type: 'choice',
      prompt: 'Bar 5 plays {n:A} {n:F#} {n:D} over {c:D7}. What is it?',
      options: [
        { text: 'The bar 1 motif, moved to fit {c:D7}', correct: true },
        { text: 'A new idea', why: 'The same rhythm and the same shape: fifth, third, root, falling. Only the chord has changed.' },
        { text: 'A scale run', why: 'A run moves by step. This falls in thirds, exactly like bar 1.' },
      ],
      explain: 'Bar 1 falls through the fifth, third and root of {c:A7}; bar 5 does the same on {c:D7}. One idea, made to fit each chord.',
      fact: 'es-motif-moves',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each place in the solo with what happens there.',
      pairs: [
        { left: 'Bar 2, beat 1', right: 'The blue third, resolved' },
        { left: 'Bar 8', right: 'Two beats of space' },
        { left: 'Bars 13 and 15', right: 'The motif backwards' },
        { left: 'Bars 16 and 18', right: 'The high point, {n:C}' },
        { left: 'Bar 23', right: 'The motif closes it' },
      ],
      explain: 'A note outside the chord that resolves at once; silence to let the phrase breathe; the motif turned round; the climb to its top note; the first idea to end.',
      fact: 'es-solo-analysis',
    },
    {
      type: 'choice',
      prompt: 'What does the solo play on beats 1 and 3?',
      options: [
        { text: 'Chord tones, with one exception', correct: true },
        { text: 'Any note of the pentatonic', why: 'Over {c:A7} that would include {n:D} and {n:C} on strong beats. Look again: they are chord tones.' },
        { text: 'Mostly rests', why: 'There is space, but most strong beats carry a note.' },
      ],
      explain: 'Every note struck on beat 1 or 3 is a tone of the chord of the moment, except the blue {n:C} in bar 2, which moves at once to {n:C#}. That is why the solo sounds like the changes.',
      fact: 'es-solo-analysis',
    },
    {
      type: 'card',
      title: 'Into the Player',
      body: 'To play your transcription in the Player, type it as text tab and paste it into Scan & Import, in Tools: proofread, save, and it opens there. Play it with my recording here, then without. Then a second solo, by ear.',
    },
    playerTask({
      id: 'second-solo',
      title: 'A second solo, by ear',
      song: 'st-minor-blues-a',
      bars: [1, 2],
      minutes: 12,
      body: 'Minor Blues in A at 80 BPM, bars 1 and 2 on loop, the screen turned away: rhythm, then pitches, on paper. Then bars 3 and 4, and on. Then look, count your errors, play it along with the Player, then in Wait mode, where the music waits for you.',
    }),
    {
      type: 'true-false',
      statement: 'A solo in this style needs a new idea in every bar.',
      answer: false,
      explain: 'One motif, moved to fit each chord, turned round and answered with space, carries two whole choruses. New ideas in every bar is not a style; it is a list.',
      fact: 'es-motif-moves',
    },
    toolTask({
      id: 'own-solo',
      title: 'Two choruses of your own',
      tool: 'progressions',
      params: ['blues-12-bar', 'a', 'jam'],
      minutes: 8,
      body: 'Now two choruses of your own over the 12-bar in {k:A major}, in the same style: one motif fitted to each chord, chord tones on beats 1 and 3, room to breathe. The band shuffles, so swing your eighths. Play with it at 100 BPM, and record it.',
    }),
    {
      type: 'choice',
      prompt: 'Which of these is a solo "in the same style"?',
      options: [
        { text: 'One motif of your own, fitted to each chord', correct: true },
        { text: 'Mine, note for note, a fret higher', why: 'That is my solo, transposed. The style is the method, not the notes.' },
        { text: 'Every note of the scale, fast', why: 'Fast is not a style. Chord tones, a motif and space are.' },
      ],
      explain: 'The style is how the solo works: a motif that follows the chords, chord tones on the strong beats, and space. Your notes, my method.',
    },
  ],
  facts: [
    { id: 'es-solo-analysis', front: 'Four things to annotate in a transcribed solo?', back: 'The chord tones on the strong beats, the motif and how it develops, the space, and the techniques.' },
    { id: 'es-motif-moves', front: 'How does a blues solo fit one motif to three chords?', back: 'It moves the motif onto each chord\'s tones: fifth, third, root of {c:A7} ({n:E} {n:C#} {n:A}) becomes that of {c:D7} ({n:A} {n:F#} {n:D}).' },
  ],
};

// ── 4. Memorising securely ─────────────────────────────────────────────────────────────────────

const memorising: TeacherLesson = {
  id: 'memorising',
  title: 'Memorising securely',
  teaches: 'Back finger memory with aural, visual and analytical memory, and test it by starting anywhere.',
  minutes: 5,
  skill: 'teacher:elena:memorising',
  steps: [
    {
      type: 'card',
      title: 'Finger memory fails at the worst moment',
      body: 'Finger memory alone can fail under pressure, and it tends to fail at the worst moment. Back it up: aural memory, so you can sing it; visual memory, so you see the shapes and the score; analytical memory, so you know the harmony and the form.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each kind of memory with its test.',
      pairs: [
        { left: 'Finger', right: 'The hands play it' },
        { left: 'Aural', right: 'You can sing it' },
        { left: 'Visual', right: 'You see shapes and score' },
        { left: 'Analytical', right: 'You know harmony and form' },
      ],
      explain: 'Four memories, each tested its own way. When the fingers falter on stage, the other three carry you to the next bar.',
      fact: 'es-four-memories',
    },
    {
      type: 'card',
      title: 'A memory map',
      body: 'Begin with something short: the {k:A minor} study in 3/4. Section A, bars 1 to 8, arpeggios; section B, bars 9 to 16, a tune on top. Every four bars the same harmony, ending on a cadence. So four starting points: bars 1, 5, 9 and 13.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['Am', 'Dm', 'E', 'Am'], beats: 3, tempo: 66 }, label: 'Four bars of harmony' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the map: the chords of every four bars.',
      text: '{c:Am}  ___  ___  {c:Am}',
      blanks: ['{c:Dm}', '{c:E}'],
      bank: ['{c:G}', '{c:Em}'],
      explain: '{r:i} {r:iv} {r:V} {r:i} in {k:A minor}. The {c:E} is major, with {n:G#}, the leading note. In bar 13 the {c:Am} gains a seventh, {n:G}.',
      fact: 'es-memory-map',
    },
    {
      type: 'choice',
      prompt: 'Bars 15 and 16, {c:E} to {c:Am}. Which cadence?',
      options: [
        { text: 'Authentic: {r:V} to {r:i}', correct: true },
        { text: 'Half: it stops on {r:V}', why: 'A half cadence ends on {c:E}. Here {c:E} goes on to {c:Am}.' },
        { text: 'Plagal: {r:iv} to {r:i}', why: 'That would be {c:Dm} to {c:Am}.' },
      ],
      explain: '{c:E} to {c:Am}, the dominant to the tonic: an authentic cadence, at bars 4, 8, 12 and 16.',
    },
    {
      type: 'type-answer',
      prompt: 'In which bar does section B begin, with the tune on top?',
      answer: { kind: 'number', value: 9 },
      input: 'keypad',
      explain: 'Bar 9: the thumb and the a finger pluck together on beat 1, and the a finger carries the tune.',
      fact: 'es-memory-map',
    },
    {
      type: 'card',
      title: 'Test it',
      body: 'Then test the map. Start from any section, not only the top. Play it in your head, away from the guitar. Write out the form. If you can begin only at bar 1, you know the piece the way one knows a tunnel: from one end.',
    },
    toolTask({
      id: 'start-anywhere',
      title: 'Start anywhere',
      tool: 'player',
      params: ['st-pimami-3-4', 'm7'],
      minutes: 6,
      body: 'The study opens at bar 7. Start there and play on to the next cadence. Then tap bars 12, 3, 14 and 10 on the score, one at a time, and start from each. A bar you cannot start from is a gap in the map: mark it.',
    }),
    {
      type: 'play-phrase',
      prompt: 'Section B\'s tune, from memory: sing it first, then play it alone on string 1.',
      notes: STUDY_TUNE,
      octave: 'exact',
      tempo: 66,
      explain: '{n:E} {n:F} {n:G#} {n:E}, then {n:G} {n:F} {n:E}: open, fret 1, fret 4, open, fret 3, fret 1, open. One note a bar, over {c:Am} {c:Dm} {c:E} {c:Am}, {c:Am7} {c:Dm} {c:E}.',
      alternative: {
        type: 'order',
        prompt: 'Put section B\'s tune in order.',
        tiles: ['{n:E}', '{n:F}', '{n:G#}', '{n:E}', '{n:G}', '{n:F}', '{n:E}'],
        distractors: ['{n:A}'],
        explain: 'Up to {n:G#}, the leading note over {c:E}, and back to {n:E}; then down from {n:G}, the seventh of {c:Am7}, to {n:E}.',
      },
    },
    toolTask({
      id: 'in-your-head',
      title: 'Play it in your head',
      tool: 'metronome',
      minutes: 5,
      body: 'Away from the guitar: set 66 BPM, close your eyes, and play section A in your head with the click, every note and every finger. Then write the form and the chords of your current piece from memory. Where the picture blurs, that is the bar to study.',
    }),
    {
      type: 'card',
      title: 'Your own piece',
      body: 'Then your own piece. Lagrima and the Prelude BWV 999 make good first subjects; neither is in the library, so scan your edition: Tools, Scan & Import. Lagrima: a section in {k:E major}, one in {k:E minor}, then the opening again. The Prelude: {k:D minor} on the guitar, one long arpeggio.',
      tip: 'Proofread the scan bar by bar before you memorise a note of it. A misread note, memorised, is twice the work to remove.',
    },
    {
      type: 'true-false',
      statement: 'If you can start a piece only from bar 1, it is securely memorised.',
      answer: false,
      explain: 'Secure means you can start from any section, play it in your head and write out its form. From bar 1 only is finger memory, and finger memory alone fails under pressure.',
      fact: 'es-test-memory',
    },
  ],
  facts: [
    { id: 'es-four-memories', front: 'Which memories back up finger memory?', back: 'Aural (you can sing it), visual (you see the shapes and the score) and analytical (you know the harmony and the form).' },
    { id: 'es-memory-map', front: 'What goes on a memory map?', back: 'The form, the keys and the cadences, and a starting point for each section.' },
    { id: 'es-test-memory', front: 'How do you test a memorised piece?', back: 'Start from any section, play it in your head away from the guitar, and write out the form.' },
  ],
};

// ── 5. Preparing to perform ────────────────────────────────────────────────────────────────────

const performance: TeacherLesson = {
  id: 'performance',
  title: 'Preparing to perform',
  teaches: 'Practise performing itself: run-throughs with no restarts, and on the day keep the beat and rejoin.',
  minutes: 5,
  skill: 'teacher:elena:performance',
  steps: [
    {
      type: 'card',
      title: 'Nerves mean you care',
      body: 'Nerves are normal, and partly useful: they mean you care. What helps is preparation that includes performing: run-throughs for a friend, or for the recorder, with no restarts allowed. A run-through you may restart is merely practice in a nicer chair.',
    },
    {
      type: 'choice',
      prompt: 'A week before, your hands shake at the very thought. What helps most?',
      options: [
        { text: 'Run-throughs, with no restarts', correct: true },
        { text: 'Only the hard bars, again and again', why: 'Necessary, but it is not performing. Performing is practised by performing.' },
        { text: 'Leaving the piece alone until the day', why: 'Avoidance feeds nerves. Rehearse the performance itself.' },
      ],
      explain: 'Nerves mean you care. Rehearse the thing that frightens you: the whole piece, for a listener or the recorder, without stopping.',
      fact: 'es-nerves',
    },
    {
      type: 'card',
      title: 'The month before',
      body: 'For the month before: three run-throughs a week, one dress rehearsal, a warm-up plan, and {t:recovery-point|recovery points} marked in the score. A recovery point is a place you can rejoin after a slip: the start of a phrase, with an easy shape and a clear chord.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each item of the checklist with when it happens.',
      pairs: [
        { left: 'Run-throughs', right: 'Three a week' },
        { left: 'Dress rehearsal', right: 'Once, before the day' },
        { left: 'Warm-up plan', right: 'Before every run-through' },
        { left: 'Recovery points', right: 'Marked in the score' },
      ],
      explain: 'Three run-throughs a week for the month before, one dress rehearsal, the same warm-up every time, and the recovery points pencilled in where you can see them.',
      fact: 'es-perform-month',
    },
    techniqueTask({
      id: 'warm-up-plan',
      title: 'Your warm-up plan',
      exercise: 'tech-warm-up',
      minutes: 5,
      body: 'The Five-Minute Warm-Up, as written: open strings, the spider, two easy chords, slurs, a slow scale. Use it before every run-through, so that on the day the routine itself tells your hands what comes next.',
    }),
    {
      type: 'card',
      title: 'On the day',
      body: 'On the day: slow your breathing, and start a touch slower than you think. If something goes wrong, keep the beat and rejoin at the next phrase. The audience follows your confidence, not your notes.',
    },
    {
      type: 'choice',
      prompt: 'Your memory slips in bar 10 of the {k:A minor} study. What now?',
      options: [
        { text: 'Keep the beat, rejoin at bar 13', correct: true },
        { text: 'Stop, and start again', why: 'The one thing every listener notices is a stop.' },
        { text: 'Go back to bar 9', why: 'Going back is a restart in disguise. The beat goes forward; so do you.' },
      ],
      explain: 'Bar 13 begins the next phrase: a recovery point. Count through the lost bars and come in on its first beat.',
      fact: 'es-on-the-day',
    },
    {
      type: 'tap-rhythm',
      prompt: 'A lost bar: tap beat 1, count 2, 3 and 4 in silence, then rejoin on every beat.',
      rhythm: { pattern: 'q h.r | q q q q' },
      tempo: 66,
      show: 'both',
      explain: 'The bar went by without you, but the count did not stop, so you came back in exactly on the next 1.',
    },
    techniqueTask({
      id: 'nerves-tension',
      title: 'Nerves and tension',
      exercise: 'tech-play-without-pain',
      minutes: 3,
      body: 'Nerves arrive as tension: jaw, shoulders, thumb. Read Play Without Pain and take its light-pressure exercise. Aching joints, numbness or sharp pain mean stop: before a performance as at any other time.',
    }),
    {
      type: 'choice',
      prompt: 'Which bar makes the best recovery point?',
      options: [
        { text: 'A phrase start with an easy shape', correct: true },
        { text: 'The hardest bar in the piece', why: 'The last place you want to land after a slip.' },
        { text: 'The final bar', why: 'Rejoining at the end is not rejoining; it is stopping politely.' },
      ],
      explain: 'Mark three in your piece: the start of a phrase, an easy shape, a clear chord. In the {k:A minor} study, bars 5, 9 and 13.',
      fact: 'es-perform-month',
    },
    playerTask({
      id: 'run-through',
      title: 'A run-through, as if live',
      song: 'st-pimami-3-4',
      mode: 'flow',
      minutes: 4,
      body: 'The {k:A minor} study, or your own scanned piece, in Flow mode: start to finish, no restarts, as if live. Record it on your phone as well. If something goes wrong, rejoin at your next recovery point.',
    }),
    {
      type: 'card',
      title: 'With others',
      body: 'This week, play your piece for one person: a friend, a relative, the neighbour who has been listening through the wall in any case. Tell them nothing in advance about the difficult bars.',
    },
    {
      type: 'true-false',
      statement: 'A run-through counts as a run-through only if you allow no restarts.',
      answer: true,
      explain: 'The point is to practise what a performance demands: going on. With restarts allowed it is ordinary practice, which is also good, but different.',
      fact: 'es-nerves',
    },
  ],
  facts: [
    { id: 'es-nerves', front: 'Nerves before a performance: what are they, and what helps?', back: 'Normal and partly useful: they mean you care. Preparation that includes performing helps: run-throughs for a friend or the recorder, no restarts.' },
    { id: 'es-perform-month', front: 'The checklist for the month before a performance?', back: 'Three run-throughs a week, one dress rehearsal, a warm-up plan, and recovery points marked in the score.' },
    { id: 'es-on-the-day', front: 'Something goes wrong on stage. What do you do?', back: 'Keep the beat and rejoin at the next phrase. The audience follows your confidence, not your notes.' },
  ],
};

// ── 6. The recital (milestone) ─────────────────────────────────────────────────────────────────

const recital: TeacherLesson = {
  id: 'recital',
  title: 'The recital',
  teaches: 'A recital is a programme: a secure opener, the hardest piece in the middle, a closer that leaves them smiling.',
  minutes: 5,
  skill: 'teacher:elena:recital',
  steps: [
    {
      type: 'card',
      title: 'A programme, not a list',
      body: 'A recital is a programme, not a list. Open with something secure, put the most demanding piece in the middle, and end with something that leaves them smiling. Include one piece of your own, one classical piece, and one jazz or blues performance. Fifteen minutes, about.',
    },
    {
      type: 'choice',
      prompt: 'Which piece opens your recital?',
      options: [
        { text: 'The one you are surest of', correct: true },
        { text: 'Your hardest, while you are fresh', why: 'Fresh, and also at your most nervous. The hardest piece goes in the middle, once the hands have settled.' },
        { text: 'Your newest piece', why: 'Newest means least secure. Open with the one that cannot go wrong.' },
      ],
      explain: 'Open with something secure, so the first minutes settle the nerves instead of feeding them. The demanding piece goes in the middle.',
      fact: 'es-programme',
    },
    {
      type: 'card',
      id: 'programme',
      title: 'Five slots',
      body: 'Opener, centrepiece, your own piece, jazz or blues, closer. Say Gran Vals to open, Asturias in the middle, the jazz-ballad chord melody for jazz. Neither is in the library: scan your editions, or take the {k:A minor} study and the Concert Tremolo Etude. Close with a jig.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each slot with a piece for it.',
      pairs: [
        { left: 'Opener', right: 'Gran Vals' },
        { left: 'Centrepiece', right: 'Asturias' },
        { left: 'Your own', right: 'Your composition' },
        { left: 'Jazz', right: 'The jazz ballad' },
        { left: 'Closer', right: 'The Irish Washerwoman' },
      ],
      explain: 'A secure waltz to open, the most demanding piece in the middle, your own and a jazz ballad between, and a jig to send them home smiling.',
      fact: 'es-programme-contents',
    },
    {
      type: 'type-answer',
      prompt: 'The jazz ballad is 32 bars of 4/4 at 60 BPM. How many seconds does it last?',
      answer: { kind: 'number', value: 128 },
      input: 'keypad',
      explain: 'Thirty-two bars of four beats is 128 beats; at 60 a minute, one a second: 128 seconds, a little over two minutes. Time every piece so, then run it to check.',
    },
    toolTask({
      id: 'build-programme',
      title: 'Build the programme',
      tool: 'practice',
      minutes: 6,
      body: 'In the Practice Plan: one Songs block per piece, in programme order, each as long as the piece, saved as a routine called Recital. Then a focus goal, the recital itself, dated four weeks from today. Each week: three run-throughs. In the last, one is the dress rehearsal.',
    }),
    playerTask({
      id: 'ballad-flow',
      title: 'Rehearse the jazz piece',
      song: 'st-chord-melody-2',
      mode: 'flow',
      minutes: 4,
      body: 'The jazz ballad, all 32 bars in Flow mode at 60 BPM, without stopping. Keep the top note singing through the jumps between eighth and tenth position; let a chord arrive a moment late rather than cut the tune short.',
    }),
    {
      type: 'choice',
      prompt: 'You introduce each piece. How?',
      options: [
        { text: 'One sentence: what to listen for', correct: true },
        { text: 'Its whole history, with dates', why: 'They came to hear it, not to read the programme note aloud.' },
        { text: 'An apology, in advance', why: 'Never apologise in advance. If nothing goes wrong, you will have apologised for nothing.' },
      ],
      explain: 'One sentence each: what it is and what to listen for. Then play.',
    },
    toolTask({
      id: 'recital-recorded',
      title: 'The recital, recorded',
      tool: 'practice',
      params: ['routines'],
      minutes: 15,
      body: 'Start your Recital routine, set your phone recording, and give the whole programme, start to finish, introducing each piece in one sentence. No restarts. Listen back tomorrow, not tonight.',
    }),
    {
      type: 'choice',
      prompt: 'Afterwards, your plan for next year. Which goal would I accept?',
      options: [
        { text: 'Asturias complete, at 120 BPM, by June', correct: true },
        { text: 'Learn more pieces', why: 'No number and no date: you would never know you had arrived.' },
        { text: 'Get better at reading', why: 'An adjective, not a goal. How much better, and by when?' },
      ],
      explain: 'Every goal has a number and a date. You no longer need a teacher to tell you what is next; you need only the habit of asking.',
      fact: 'es-next-year',
    },
    toolTask({
      id: 'next-year',
      title: 'Next year, in writing',
      tool: 'practice',
      params: ['goals'],
      minutes: 5,
      body: 'Mark the recital goal achieved. Then four goals for the year, one each for repertoire, technique, theory and ear, each with a number and a date. The plan keeps three open at once: pin the three that come first, and keep the fourth in your journal.',
    }),
    {
      type: 'play-phrase',
      id: 'show',
      prompt: 'Your closer: the pickup and two bars of The Irish Washerwoman, at full speed, without stopping.',
      notes: WASHERWOMAN_OPENING,
      octave: 'exact',
      tempo: 138,
      pass: 0.8,
      explain: 'The pickup {n:D} {n:C}, then {n:B} {n:G} {n:G}, {n:D} {n:G} {n:G}, {n:B} {n:G} {n:B}, {n:D} {n:C} {n:B}: two groups of three to the bar, a little weight on 1 and 4.',
      alternative: {
        type: 'order',
        prompt: 'Put bar 1 of The Irish Washerwoman in order.',
        tiles: ['{n:B}', '{n:G}', '{n:G}', '{n:D}', '{n:G}', '{n:G}'],
        distractors: ['{n:A}'],
        explain: 'The open {n:B}, the open {n:G} twice, the open {n:D}, and {n:G} twice more: two groups of three.',
      },
    },
  ],
  facts: [
    { id: 'es-programme', front: 'How do you order a recital programme?', back: 'Open with something secure, put the most demanding piece in the middle, and end with something that leaves them smiling.' },
    { id: 'es-programme-contents', front: 'What must a recital programme include?', back: 'One piece of your own, one classical piece, and one jazz or blues performance: about fifteen minutes.' },
    { id: 'es-next-year', front: 'After the recital, who decides what is next?', back: 'You do: a written plan for the year in repertoire, technique, theory and ear, each goal with a number and a date.' },
  ],
};

/** Unit 13 of Prof. Varga's course, the last. */
const unit: TeacherUnit = {
  id: 'elena-ear-and-stage',
  title: 'Transcription and performance',
  theme: 'ear',
  description: 'Transcribe melodies, harmony and solos by ear, memorise securely, prepare to perform, and give a 15-minute recital.',
  lessons: [transcribingMelodies, transcribingHarmony, transcribingASolo, memorising, performance, recital],
  checkpoint: { sample: 8, maxMistakes: 2 },
  milestone: {
    lesson: 'recital',
    step: 'show',
    piece: 'The Irish Washerwoman',
    song: 'irish-washerwoman',
    celebrate: 'A programme, played through, and a jig to send them home: that is a recital. You no longer need me to tell you what is next, only the habit of asking. Keep it. It has been a privilege to teach you.',
  },
  glossary: [
    { id: 'transcription', term: 'transcription', definition: 'Writing down music you hear, its key, meter, rhythm and pitches, in notation or tab.' },
    { id: 'secondary-dominant', term: 'secondary dominant', definition: 'The dominant of a chord other than the tonic, placed before it: {c:A7} before {c:Dm7} in {k:C major}.' },
    { id: 'recovery-point', term: 'recovery point', definition: 'A place marked in the score where you can rejoin after a slip: a phrase start with an easy shape.' },
  ],
};

export default unit;
