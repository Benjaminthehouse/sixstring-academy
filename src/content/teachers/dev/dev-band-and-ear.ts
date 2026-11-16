/**
 * Dev, unit 12: By ear, in time, in a band (plan: `dev/dev-band-and-ear` in
 * src/content/plan/teachers.json).
 *
 * The last unit of Dev's course: the key, the chords and the melody of a song by ear, any song in
 * any key with the capo and Nashville numbers, rhythm guitar that locks with a band, tone and
 * dynamics from the hands, and the gig: a 12-bar blues in A with an intro, rhythm, solo, comping and
 * an ending, then the hand-over check for Prof. Varga. Dev's voice: a bandmate who ties every idea
 * to something to play tonight.
 *
 * The music the lessons play themselves comes from the song library and is cross-checked by
 * `dev-band-and-ear.test.ts`: Auld Lang Syne (the library's tune, played in D and moved up a fourth
 * to G), the chords of Amazing Grace (the library's, moved up a whole step to A), the first two
 * phrases of Silent Night, the turnaround in A of Blues Turnarounds. Swing Low, Sweet Chariot and
 * Shenandoah are not in the library yet: the lessons teach with the nearest library tunes (Auld Lang
 * Syne: D major, level 3, a pentatonic tune; Silent Night: slow, long phrases, held notes), and the
 * Player tasks that name the planned songs fall back to library songs until they land.
 */
import type { FretDot, TabNote } from '@/lessons';
import type { TeacherLesson, TeacherUnit } from '../types';
import { playerTask, techniqueTask, toolTask } from '../tasks';

// ── Helpers ────────────────────────────────────────────────────────────────────────────────────

/** One tab note. */
function t(string: number, fret: number, duration: string): TabNote {
  return { string, fret, duration };
}

// ── The music ──────────────────────────────────────────────────────────────────────────────────

/**
 * Auld Lang Syne, line 1, in D, as the library's Tune track has it: the pickup, bars 1 to 3 and the
 * long B of bar 4 ("Should auld acquaintance be forgot, and never brought to mind?"). Ends on B.
 */
export const LINE_1_D: TabNote[] = [
  t(5, 0, 'q'),
  t(4, 0, 'q.'), t(4, 0, 'e'), t(4, 0, 'q'), t(4, 4, 'q'),
  t(4, 2, 'q.'), t(4, 0, 'e'), t(4, 2, 'q'), t(4, 4, 'q'),
  t(4, 0, 'q.'), t(4, 0, 'e'), t(4, 4, 'q'), t(3, 2, 'q'),
  t(2, 0, 'h.'),
];

/** Auld Lang Syne, line 2, in D: the pickup at the end of bar 4, bars 5 to 7 and the long D of bar 8. Ends at home. */
export const LINE_2_D: TabNote[] = [
  t(2, 0, 'q'),
  t(3, 2, 'q.'), t(4, 4, 'e'), t(4, 4, 'q'), t(4, 0, 'q'),
  t(4, 2, 'q.'), t(4, 0, 'e'), t(4, 2, 'q'), t(4, 4, 'q'),
  t(4, 0, 'q.'), t(5, 2, 'e'), t(5, 2, 'q'), t(5, 0, 'q'),
  t(4, 0, 'h.'),
];

/** The same two lines a fourth higher, in G, in first position (every note five half steps up). */
export const LINE_1_G: TabNote[] = [
  t(4, 0, 'q'),
  t(3, 0, 'q.'), t(3, 0, 'e'), t(3, 0, 'q'), t(2, 0, 'q'),
  t(3, 2, 'q.'), t(3, 0, 'e'), t(3, 2, 'q'), t(2, 0, 'q'),
  t(3, 0, 'q.'), t(3, 0, 'e'), t(2, 0, 'q'), t(2, 3, 'q'),
  t(1, 0, 'h.'),
];

/** Line 2 in G. */
export const LINE_2_G: TabNote[] = [
  t(1, 0, 'q'),
  t(2, 3, 'q.'), t(2, 0, 'e'), t(2, 0, 'q'), t(3, 0, 'q'),
  t(3, 2, 'q.'), t(3, 0, 'e'), t(3, 2, 'q'), t(2, 0, 'q'),
  t(3, 0, 'q.'), t(4, 2, 'e'), t(4, 2, 'q'), t(4, 0, 'q'),
  t(3, 0, 'h.'),
];

/**
 * The verse of Amazing Grace in A, a chord a bar: the library's chords (in G) moved up a whole step,
 * the two sevenths ({c:D7} and {c:G7}) played as plain triads, so only I, IV, V and vi are left.
 */
export const GRACE_IN_A: string[] = ['A', 'A', 'D', 'A', 'A', 'A', 'E', 'E', 'A', 'A', 'D', 'A', 'F#m', 'E', 'A', 'A'];

/** The bass of line 1 of Amazing Grace in A, on string 5: a root a bar, three beats each. */
export const GRACE_BASS_LINE_1: TabNote[] = [t(5, 0, 'h.'), t(5, 0, 'h.'), t(5, 5, 'h.'), t(5, 0, 'h.')];

/** Silent Night, phrase 1 (bars 1 to 4 of the library's Tune track, 6/8): "Silent night, holy night". */
export const SILENT_1: TabNote[] = [t(4, 0, 'q.'), t(4, 2, 'e'), t(4, 0, 'q'), t(5, 2, 'h.'), t(4, 0, 'q.'), t(4, 2, 'e'), t(4, 0, 'q'), t(5, 2, 'h.')];

/** Silent Night, phrase 2 (bars 5 to 8): "All is calm, all is bright". */
export const SILENT_2: TabNote[] = [t(3, 2, 'h'), t(3, 2, 'q'), t(4, 4, 'h.'), t(3, 0, 'h'), t(3, 0, 'q'), t(4, 0, 'h.')];

/** The A minor arpeggio of Dynamic Control (`tech-dynamics`): one bar of eighths. */
export const DYNAMICS_ARPEGGIO: TabNote[] = [t(5, 0, 'e'), t(3, 2, 'e'), t(2, 1, 'e'), t(1, 0, 'e'), t(5, 0, 'e'), t(3, 2, 'e'), t(2, 1, 'e'), t(1, 0, 'e')];

/**
 * The gig's turnaround and ending, as single notes: the line of the turnaround in A (Blues
 * Turnarounds, bar 3) falling G F# F E on string 4, the open E for {c:E7}, then the A at string 6,
 * fret 5, the root of the last {c:A7} (575655).
 */
export const GIG_ENDING: TabNote[] = [t(4, 5, 'q'), t(4, 4, 'q'), t(4, 3, 'q'), t(4, 2, 'q'), t(6, 0, 'w'), t(6, 5, 'w')];

/** The four roots of A's I, IV, V and vi on strings 6 and 5. */
const ROOTS_IN_A: FretDot[] = [
  { string: 6, fret: 5, note: 'A2', role: 'root' },
  { string: 5, fret: 0, note: 'A2', role: 'root' },
  { string: 5, fret: 5, note: 'D3' },
  { string: 6, fret: 0, note: 'E2' },
  { string: 5, fret: 7, note: 'E3' },
  { string: 6, fret: 2, note: 'F#2' },
];

/** Second-guitar triads on strings 3 to 1: G (frets 7 8 7) and Em (9 8 7). */
const G_TRIAD: FretDot[] = [
  { string: 3, fret: 7, note: 'D4' },
  { string: 2, fret: 8, note: 'G4', role: 'root' },
  { string: 1, fret: 7, note: 'B4' },
];
const EM_TRIAD: FretDot[] = [
  { string: 3, fret: 9, note: 'E4' },
  { string: 2, fret: 8, note: 'G4' },
  { string: 1, fret: 7, note: 'B4' },
];

// ── 1. Finding the key by ear ──────────────────────────────────────────────────────────────────

const keyByEar: TeacherLesson = {
  id: 'key-by-ear',
  title: 'Finding the key by ear',
  teaches: 'The home note is where a tune wants to rest: find it on string 6 or 5, then hear if it is major or minor.',
  minutes: 5,
  skill: 'teacher:dev:key-by-ear',
  steps: [
    {
      type: 'card',
      title: 'Every song has a home',
      body: 'Almost every song has a {t:home-note}: the one that feels like rest at the end. Hum along, find the note you keep wanting to land on, then find it on string 6 or 5: that is the {t:root} of the key. Then the home chord: major or minor? Two questions, and you have the key.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: [...LINE_1_D, ...LINE_2_D], tempo: 80 }, label: 'Hear Auld Lang Syne' },
    },
    {
      type: 'listen-choice',
      prompt: 'Line 1 of Auld Lang Syne. Does it come to rest at home?',
      sound: { kind: 'tab', notes: LINE_1_D, tempo: 80 },
      options: [{ text: 'No: it hangs, wanting more', correct: true }, { text: 'Yes: it sounds finished' }],
      shuffle: false,
      explain: 'It stops on {n:B}, the sixth note of the key, not on home: your ear wants the next line. A line that hangs like that is asking a question.',
      fact: 'be-home-note',
    },
    {
      type: 'listen-choice',
      prompt: 'Hum the end of the tune again. Which of its notes is home?',
      sound: { kind: 'tab', notes: LINE_2_D, tempo: 80 },
      figure: { kind: 'keyboard', keys: ['D4', 'E4', 'F#4', 'A4', 'B4'], caption: 'The five notes of the tune.' },
      options: [
        { text: '{n:D}', correct: true },
        { text: '{n:A}', why: 'The tune starts on {n:A}, but it never rests there.' },
        { text: '{n:B}', why: 'Line 1 stops on {n:B}, and it hangs. Line 2 goes on to rest.' },
        { text: '{n:E}' },
      ],
      explain: 'Line 2 lands on {n:D} and holds it for three beats: rest. Every other note of the tune leans towards it.',
      fact: 'be-home-note',
    },
    {
      type: 'play-note',
      prompt: 'Now find that home note on your guitar and play it: {n:D}, string 5, fret 5.',
      note: 'D3',
      octave: 'any',
      where: { string: 5, fret: 5 },
      explain: 'String 5, fret 5 is {n:D}, the root of the key. On string 6 it sits at fret 10, and the open string 4 is a {n:D} too.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap every {n:D} on strings 6 and 5, up to fret 12.',
        find: { note: 'D' },
        mode: 'all',
        octave: 'any',
        frets: [0, 12],
        strings: [6, 5],
        explain: 'Two of them: string 5, fret 5 and string 6, fret 10. Either one is where you hum the home note.',
      },
    },
    {
      type: 'card',
      title: 'Major or minor?',
      body: 'Now the home chord. Strum the major and the minor chord on the home note and hum the tune over each: one fits, one fights. Major sounds bright and settled, minor darker. Over Auld Lang Syne, {c:D} fits: the key is {k:D major}.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['D', 'Dm'], beats: 4, tempo: 80 }, label: 'Hear major, then minor' },
    },
    { generate: 'chord-quality-ear', params: { types: ['major', 'minor'] }, fact: 'be-major-or-minor' },
    {
      type: 'listen-choice',
      prompt: 'The whole tune. Find home on your guitar while it plays: which key is it in?',
      sound: { kind: 'tab', notes: [...LINE_1_D, ...LINE_2_D], tempo: 80 },
      options: [
        { text: '{k:D major}', correct: true },
        { text: '{k:B minor}', why: 'Same notes, but the tune rests on {n:D}, not {n:B}, and its home chord is major.' },
        { text: '{k:G major}' },
        { text: '{k:A major}', why: '{n:A} is where it starts, not where it rests.' },
      ],
      hint: 'Hum the last note and slide along string 5 until a note matches it.',
      explain: 'Home is {n:D} (string 5, fret 5) and {c:D} fits under it: {k:D major}.',
    },
    {
      type: 'listen-choice',
      prompt: 'Same tune, played again. Which key now?',
      sound: { kind: 'tab', notes: [...LINE_1_G, ...LINE_2_G], tempo: 80 },
      options: [
        { text: '{k:G major}', correct: true },
        { text: '{k:D major}', why: 'That was the first time. The last note sits higher now: find it again.' },
        { text: '{k:E minor}', why: 'Same notes as {k:G major}, but the tune rests on {n:G} and its chord is major.' },
        { text: '{k:C major}' },
      ],
      hint: 'Hum the last note, then look for that letter low on string 6.',
      explain: 'Home moved to {n:G}: the open string 3, or string 6, fret 3 an octave lower. Same tune, new home. That is all a change of key is.',
    },
    toolTask({
      id: 'home-note-drill',
      title: 'Ear: the home-note drill',
      tool: 'ear',
      params: ['degrees', '1'],
      minutes: 3,
      body: 'Scale degrees, level 1: the app plays a key, then one note. Is it home or the fifth? About ten questions. Sing home before you answer: if the note feels like rest, it is home.',
    }),
    toolTask({
      id: 'major-minor-drill',
      title: 'Ear: major or minor, ten times',
      tool: 'ear',
      params: ['scales', '1'],
      minutes: 2,
      body: 'Scales and modes, level 1: about ten short runs, each one major or minor. Answer fast: bright and settled is major, darker is minor.',
    }),
    {
      type: 'true-false',
      statement: 'The note a tune comes to rest on is usually the root of its key.',
      answer: true,
      explain: 'Find where the tune wants to rest, find that note on string 6 or 5, and you have the root. Major or minor finishes the job.',
      fact: 'be-home-note',
    },
    playerTask({
      id: 'swing-low-key',
      title: 'Find the key: Swing Low',
      song: 'swing-low-sweet-chariot',
      minutes: 3,
      body: 'Play Swing Low, Sweet Chariot at 72 BPM in listen mode, and do not look at the screen. Hum along, find home on string 6 or 5, then strum the major and the minor chord on it. Say the key out loud, then check the song in the Songs library.',
      fallback: {
        tool: 'player',
        params: ['joy-to-the-world'],
        title: 'Find the key: Joy to the World',
        body: 'Swing Low is not in the Songs library yet, so take Joy to the World, slow and broad at 72 BPM, in listen mode. Do not look at the screen: hum along, find home on string 6 or 5, then strum the major and the minor chord on it. Say the key out loud, then check the song in the Songs library.',
      },
    }),
    {
      type: 'choice',
      prompt: 'Home is {n:A}, and {c:Am} fights the tune while {c:A} fits. What is the key?',
      options: [
        { text: '{k:A major}', correct: true },
        { text: '{k:A minor}', why: 'The minor chord fought the tune, so the key is not minor.' },
        { text: '{k:E major}', why: '{n:E} is the fifth of the key, not home.' },
      ],
      explain: 'Home note {n:A}, home chord major: {k:A major}. Two questions, one key.',
      fact: 'be-major-or-minor',
    },
  ],
  facts: [
    { id: 'be-home-note', front: 'How do you find the key of a song by ear?', back: 'Find the home note, the one the tune wants to rest on: hum it, find it on string 6 or 5. That is the root of the key.' },
    { id: 'be-major-or-minor', front: 'You have the home note. What tells you major or minor?', back: 'The home chord: strum the major and the minor chord on that note under the tune. The one that fits is the key.' },
  ],
};

// ── 2. Chords by ear ───────────────────────────────────────────────────────────────────────────

const chordsByEar: TeacherLesson = {
  id: 'chords-by-ear',
  title: 'Chords by ear',
  teaches: 'Follow the bass to each root on string 6 or 5, then pick from the key\'s {r:I}, {r:IV}, {r:V} and {r:vi}.',
  minutes: 5,
  skill: 'teacher:dev:chords-by-ear',
  steps: [
    {
      type: 'card',
      title: 'A short list of suspects',
      body: 'Most songs use a handful of chords from their key, so once you know the key you have a short list to try: {r:I}, {r:IV}, {r:V} and {r:vi} first. In {k:A major} that is {c:A}, {c:D}, {c:E} and {c:F#m}. Tonight the app plays Amazing Grace in A, and you work out its chords with no chart.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['A', 'D', 'E', 'F#m'], beats: 3, tempo: 84 }, label: 'Hear the four in A' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each numeral with its chord in {k:A major}.',
      pairs: [
        { left: '{r:I}', right: '{c:A}' },
        { left: '{r:IV}', right: '{c:D}' },
        { left: '{r:V}', right: '{c:E}' },
        { left: '{r:vi}', right: '{c:F#m}' },
      ],
      explain: 'Count up the {k:A major} scale: {n:A} is 1, {n:D} is 4, {n:E} is 5, {n:F#} is 6. The chord on 6 is minor, the other three major.',
      fact: 'be-chord-menu',
    },
    {
      type: 'card',
      title: 'Follow the bass',
      body: 'The bass usually plays each chord\'s root, so listen low. Find the bass note on string 6 or 5 and you have the chord\'s letter; then decide major or minor. The roots in A: {n:A}, {n:D}, {n:E} and {n:F#}.',
      figure: { kind: 'fretboard', frets: [0, 7], dots: ROOTS_IN_A, caption: 'The roots of {c:A} {c:D} {c:E} {c:F#m} on strings 6 and 5.' },
    },
    {
      type: 'listen-choice',
      prompt: 'The band plays {c:A}, then another chord of the key. Which one?',
      sound: { kind: 'progression', chords: ['A', 'F#m'], beats: 4, tempo: 84 },
      options: [
        { text: '{r:IV}: {c:D}' },
        { text: '{r:V}: {c:E}' },
        { text: '{r:vi}: {c:F#m}', correct: true },
      ],
      explain: 'It turned darker, so minor, and the bass dropped to {n:F#}: the {r:vi} chord, {c:F#m}.',
      fact: 'be-chord-menu',
    },
    {
      type: 'fill-blanks',
      prompt: 'Amazing Grace in A, line 1, a chord a bar. Which chord is bar 3?',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: GRACE_IN_A.slice(0, 4), beats: 3, tempo: 84 }, label: 'Hear line 1' },
      text: '{c:A}  {c:A}  ___  {c:A}',
      blanks: ['{c:D}'],
      bank: ['{c:E}', '{c:F#m}'],
      explain: 'Bar 3 goes to {c:D}, the {r:IV} chord: the bass climbs to {n:D} and the chord stays bright.',
    },
    {
      type: 'play-phrase',
      prompt: 'Play the bass of line 1 on string 5, a note a bar, three beats each.',
      notes: GRACE_BASS_LINE_1,
      octave: 'exact',
      tempo: 84,
      explain: '{n:A}, {n:A}, {n:D}, {n:A}: the open string 5, then fret 5 for bar 3, the root of {c:D}.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Bar 3 of line 1 is {c:D}. Tap its root on string 5.',
        find: { note: 'D3' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 7],
        strings: [5],
        explain: 'String 5, fret 5 is {n:D}: the bass note under bar 3.',
      },
    },
    {
      type: 'fill-blanks',
      prompt: 'Line 4, the last one. Fill bars 1 and 2.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: GRACE_IN_A.slice(12, 16), beats: 3, tempo: 84 }, label: 'Hear line 4' },
      text: '___  ___  {c:A}  {c:A}',
      blanks: ['{c:F#m}', '{c:E}'],
      bank: ['{c:D}'],
      explain: 'Bar 1 is {c:F#m}, the {r:vi}: a minor colour on "blind". Bar 2 is {c:E}, the {r:V}, leading home to {c:A}.',
    },
    {
      type: 'card',
      title: 'The reveal',
      body: 'Amazing Grace in A, bar by bar: {c:A} {c:A} {c:D} {c:A}, {c:A} {c:A} {c:E} {c:E}, {c:A} {c:A} {c:D} {c:A}, {c:F#m} {c:E} {c:A} {c:A}. Four chords, all from the short list. Line 2 waits on {c:E}, the {r:V}, and line 3 is line 1 again: songs repeat.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: GRACE_IN_A, beats: 3, tempo: 84 }, label: 'Hear the whole verse' },
    },
    { generate: 'roman-chord', params: { direction: 'to-chord', numerals: ['I', 'IV', 'V', 'vi'] } },
    toolTask({
      id: 'chord-in-key-drill',
      title: 'Ear: the chord-in-key drill',
      tool: 'ear',
      params: ['progressions', '2'],
      minutes: 4,
      body: 'Chord progressions, level 2: name {r:I} {r:IV} {r:V} {r:I}, {r:I} {r:V} {r:vi} {r:IV} or {r:I} {r:vi} {r:IV} {r:V}. Follow the bass first, then hear which chord turns minor.',
    }),
    playerTask({
      id: 'grace-by-ear',
      title: 'Amazing Grace in G, by ear',
      song: 'amazing-grace',
      minutes: 6,
      body: 'The Player\'s Amazing Grace is in {k:G major}, at 84 BPM. Do not look at the chord names: follow the bass and write the chords bar by bar from the short list in G, {c:G} {c:C} {c:D} {c:Em}. Then compare.',
      tip: 'Two chords add a 7, {c:D7} and {c:G7}: same chord, one extra colour note.',
    }),
    {
      type: 'true-false',
      statement: 'The bass usually plays the root of each chord, so it tells you the chord\'s letter.',
      answer: true,
      explain: 'Find the bass note on string 6 or 5, then decide major or minor: that is the whole method.',
      fact: 'be-follow-the-bass',
    },
  ],
  facts: [
    { id: 'be-chord-menu', front: 'Which chords do you try first when you work out a song by ear?', back: 'The {r:I}, {r:IV}, {r:V} and {r:vi} of its key. In {k:A major}: {c:A}, {c:D}, {c:E} and {c:F#m}.' },
    { id: 'be-follow-the-bass', front: 'Where do you listen to find each chord?', back: 'The bass: it usually plays the root. Find it on string 6 or 5, then decide major or minor.' },
  ],
};

// ── 3. A melody by ear ─────────────────────────────────────────────────────────────────────────

const melodyByEar: TeacherLesson = {
  id: 'melody-by-ear',
  title: 'A melody by ear',
  teaches: 'Learn a tune by ear a phrase at a time: sing it, find the first note, then each next note close by.',
  minutes: 5,
  skill: 'teacher:dev:melody-by-ear',
  steps: [
    {
      type: 'card',
      title: 'A superpower, in small steps',
      body: 'Learning by ear is a superpower, and it is learned in small steps: listen to one phrase until you can sing it, find its first note, then find the rest one note at a time. Tonight: Silent Night, a tune you can already hum. Play phrase 1 a few times and sing it back.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: SILENT_1, tempo: 66 }, label: 'Phrase 1 (play it again)' },
    },
    {
      type: 'card',
      title: 'The first note, and only that',
      body: 'Here is the first note, and nothing else: the open string 4, {n:D}. Most melodies move by step or by a small leap, so the next note is usually close by: a fret or two away, or on the next string.',
      figure: { kind: 'fretboard', frets: [0, 4], dots: [{ string: 4, fret: 0, note: 'D3', role: 'target' }], caption: 'Phrase 1 starts here: the open string 4.' },
    },
    {
      type: 'listen-choice',
      prompt: 'Phrase 1: from the first note, does the second go up or down?',
      sound: { kind: 'tab', notes: SILENT_1, tempo: 66 },
      options: [{ text: 'Up a step', correct: true }, { text: 'Down a step' }, { text: 'A big leap up' }],
      shuffle: false,
      explain: 'Up a step, from {n:D} to {n:E} at string 4, fret 2, then straight back to {n:D}.',
      fact: 'be-steps-and-leaps',
    },
    {
      type: 'fretboard-find',
      prompt: 'The first note is shown. Listen: where does phrase 1 land? Tap its last note.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: SILENT_1, tempo: 66 }, label: 'Phrase 1' },
      find: { note: 'B2' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 4],
      strings: [6, 5, 4],
      shown: [{ string: 4, fret: 0, note: 'D3', role: 'target', label: 'D' }],
      explain: 'It drops a small leap to {n:B}, string 5, fret 2: {n:D} {n:E} {n:D} {n:B}, sung twice.',
    },
    {
      type: 'order',
      prompt: 'Phrase 2 starts high, then comes down. Put its notes in order.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: SILENT_2, tempo: 66 }, label: 'Phrase 2 (play it again)' },
      tiles: ['{n:A}', '{n:A}', '{n:F#}', '{n:G}', '{n:G}', '{n:D}'],
      distractors: ['{n:B}'],
      explain: '{n:A} {n:A}, down to {n:F#}, up a half step to {n:G} {n:G}, then down to {n:D}: steps and small leaps, as always.',
      fact: 'be-steps-and-leaps',
    },
    {
      type: 'card',
      title: 'Now check it against the tab',
      body: 'When you have it, check it against the tab. Phrase 1 is {n:D} {n:E} {n:D} {n:B}, twice; phrase 2 leaps up to {n:A}, the one big jump, and comes back down to {n:D}. If yours is different, find the first note that is off and fix only that one.',
      figure: { kind: 'tab', time: '6/8', tempo: 66, notes: [...SILENT_1, ...SILENT_2], caption: 'Silent Night, phrases 1 and 2.' },
    },
    {
      type: 'play-phrase',
      prompt: 'Play phrases 1 and 2, slowly, from memory if you can.',
      notes: [...SILENT_1, ...SILENT_2],
      octave: 'exact',
      tempo: 66,
      explain: 'String 4 open and fret 2, string 5, fret 2 for {n:B}; then string 3, fret 2 ({n:A}), string 4, fret 4 ({n:F#}), the open string 3 ({n:G}) and back to the open string 4.',
      alternative: {
        type: 'order',
        prompt: 'Put phrase 1 in order.',
        tiles: ['{n:D}', '{n:E}', '{n:D}', '{n:B}'],
        distractors: ['{n:C}'],
        explain: 'Up a step and back, then a small leap down: {n:D} {n:E} {n:D} {n:B}.',
      },
    },
    toolTask({
      id: 'melodic-dictation',
      title: 'Ear: melodic dictation',
      tool: 'ear',
      params: ['melody', '2'],
      minutes: 4,
      body: 'Melody playback, level 2, then level 3: hear three notes, then four, and play them back on the row, or on your guitar with the microphone. Sing each one before you answer.',
    }),
    {
      type: 'choice',
      prompt: 'You are stuck: the next note will not come. What do you try?',
      options: [
        { text: 'Sing it, then try a fret or two away', correct: true },
        { text: 'Jump to the tab and copy it', why: 'Check against the tab when you have it, not before: the finding is what trains your ear.' },
        { text: 'Try every fret from the nut up', why: 'The next note is nearly always close by. Start a fret or two away, up or down as you sang it.' },
      ],
      explain: 'Sing the note, decide up or down, and look close by: a step or a small leap covers most of any tune.',
      fact: 'be-ear-method',
    },
    playerTask({
      id: 'shenandoah-ears',
      title: 'Shenandoah, ears only',
      song: 'shenandoah',
      minutes: 6,
      body: 'Now a tune you do not know: Shenandoah, at 60 BPM, with the screen turned away. Loop one phrase at a time with the loop button, sing it, find its first note, then the rest. Then the next phrase.',
      fallback: {
        tool: 'player',
        params: ['silent-night', 'm9-12', 't80'],
        title: 'The rest of Silent Night, by ear',
        body: 'Shenandoah is not in the Songs library yet, so finish Silent Night by ear. Pick the Tune track, loop bars 9 to 12 at 80 % (60 BPM), then bars 17 to 20 and 21 to 24, with the screen turned away: sing each phrase, find its first note, then the rest.',
      },
    }),
    playerTask({
      id: 'shenandoah-check',
      title: 'Check it, then play it through',
      song: 'shenandoah',
      minutes: 4,
      body: 'Now look: compare your version with the tab, fix what differs, and play the whole melody with the app at 60 BPM.',
      fallback: {
        tool: 'player',
        params: ['silent-night', 't80'],
        body: 'Now look: compare your version with the Tune track\'s tab, fix what differs, and play the whole melody with the app at 80 % (60 BPM).',
      },
    }),
    {
      type: 'true-false',
      statement: 'Most melodies move by step or by a small leap, so the next note is usually close by.',
      answer: true,
      explain: 'That is why you search a fret or two away first. Big leaps happen, but they are rare, and you hear them coming.',
      fact: 'be-steps-and-leaps',
    },
  ],
  facts: [
    { id: 'be-ear-method', front: 'How do you learn a melody by ear?', back: 'One phrase at a time: listen until you can sing it, find its first note, then find the rest one note at a time. Then check against the tab.' },
    { id: 'be-steps-and-leaps', front: 'How do most melodies move?', back: 'By step or by a small leap, so the next note is usually close by: a fret or two away, or on the next string.' },
  ],
};

// ── 4. Any song, any key ───────────────────────────────────────────────────────────────────────

const capoAndKeys: TeacherLesson = {
  id: 'capo-and-keys',
  title: 'Any song, any key',
  teaches: 'Move every chord the same distance to change key; a capo at fret 3 makes {c:G} {c:C} {c:D} shapes sound {c:Bb} {c:Eb} {c:F}.',
  minutes: 5,
  skill: 'teacher:dev:capo-and-keys',
  steps: [
    {
      type: 'card',
      title: 'Move everything the same distance',
      body: 'You change key, or {t:transpose}, by moving every chord the same distance. With roman numerals that is easy, because {r:I} {r:IV} {r:V} means the same thing in every key: in G it is {c:G} {c:C} {c:D}, in A it is {c:A} {c:D} {c:E}. The singer says "too low", you move it all up.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['G', 'C', 'G', 'D', 'A', 'D', 'A', 'E'], beats: 2, tempo: 100 }, label: 'Hear it in G, then in A' },
    },
    {
      type: 'type-answer',
      prompt: 'Move {c:G}, {c:Em}, {c:C} and {c:D} up a whole step. First: what does {c:Em} become?',
      answer: { kind: 'chord', value: 'F#m', spelling: 'exact' },
      input: 'keyboard',
      explain: 'A whole step is two frets: {n:E}, {n:F}, {n:F#}. The chord stays minor, so {c:Em} becomes {c:F#m}.',
      fact: 'be-transpose',
    },
    {
      type: 'fill-blanks',
      prompt: 'And all four, up a whole step.',
      text: '{c:G}  {c:Em}  {c:C}  {c:D}  becomes  ___  ___  ___  ___',
      blanks: ['{c:A}', '{c:F#m}', '{c:D}', '{c:E}'],
      bank: ['{c:B}', '{c:Gm}'],
      explain: 'Every chord two frets up, and each keeps its quality: {c:A} {c:F#m} {c:D} {c:E}. It is the same song, now in {k:A major}.',
      fact: 'be-transpose',
    },
    {
      type: 'card',
      title: 'A capo does the moving',
      body: 'A {t:capo} raises every string by as many half steps as its fret, so the same shapes sound higher. A song in {k:Bb major} uses {c:Bb}, {c:Eb} and {c:F}: barre chords. Capo at fret 3 and you play the open shapes {c:G}, {c:C} and {c:D} instead: each sounds three half steps higher.',
      figure: { kind: 'chord', symbol: 'Bb', frets: '320003', capo: 3, caption: 'A {c:G} shape behind a capo at fret 3 sounds {c:Bb}.' },
    },
    {
      type: 'choice',
      prompt: 'Capo at fret 3, you play the {c:G}, {c:C} and {c:D} shapes. Which chords sound?',
      options: [
        { text: '{c:Bb} {c:Eb} {c:F}', correct: true },
        { text: '{c:A} {c:D} {c:E}', why: 'That is capo 2: two half steps up.' },
        { text: '{c:G} {c:C} {c:D}', why: 'The shapes keep their names, but the sound moves up with the capo.' },
        { text: '{c:B} {c:E} {c:F#}', why: 'That is capo 4.' },
      ],
      explain: 'Three frets is three half steps: {n:G} to {n:Bb}, {n:C} to {n:Eb}, {n:D} to {n:F}.',
      fact: 'be-capo-three',
    },
    {
      type: 'card',
      title: 'One song, four capo frets',
      body: 'Capo 1: play {c:A} {c:D} {c:E}. Capo 3: {c:G} {c:C} {c:D}. Capo 8: {c:D} {c:G} {c:A}. Capo 10: {c:C} {c:F} {c:G}. All four sound {c:Bb} {c:Eb} {c:F}. Pick the shapes you like, or the fret whose sound suits the song: the higher, the brighter and smaller.',
    },
    {
      type: 'choice',
      prompt: 'The song is in {k:Bb major} and you want the {c:A}, {c:D} and {c:E} shapes. Where goes the capo?',
      options: [{ text: 'Fret 1', correct: true }, { text: 'Fret 2' }, { text: 'Fret 3', why: 'Fret 3 is for the {c:G} {c:C} {c:D} shapes.' }],
      shuffle: false,
      explain: '{n:A} to {n:Bb} is one half step, so one fret: capo 1, and {c:A} {c:D} {c:E} sound {c:Bb} {c:Eb} {c:F}.',
      fact: 'be-capo-three',
    },
    {
      type: 'card',
      title: 'Nashville numbers',
      body: '{t:nashville-numbers|Nashville numbers} write a chart as numbers, one a bar: 1 | 4 | 1 | 5, with an m for a minor chord (6m). The singer calls a key and the whole band plays it on the spot. In G that chart is {c:G} {c:C} {c:G} {c:D}; in A, {c:A} {c:D} {c:A} {c:E}; in D, {c:D} {c:G} {c:D} {c:A}.',
    },
    {
      type: 'fill-blanks',
      prompt: 'The singer calls {k:D major}. Play the chart 1 | 4 | 1 | 5.',
      text: '{c:D}  ___  {c:D}  ___',
      blanks: ['{c:G}', '{c:A}'],
      bank: ['{c:E}', '{c:Bm}'],
      explain: 'Count up the {k:D major} scale: {n:D} 1, {n:G} 4, {n:A} 5. So 1 | 4 | 1 | 5 is {c:D} {c:G} {c:D} {c:A}.',
      fact: 'be-nashville',
    },
    toolTask({
      id: 'jam-in-b-flat',
      title: 'Jam in {k:Bb major}: capo, then barres',
      tool: 'progressions',
      params: ['folk-i-iv-i-v', 'bb', 'jam'],
      minutes: 6,
      body: 'Set the band to 100 BPM: {c:Bb} {c:Eb} {c:F}. Capo at fret 3 and play the {c:G}-shape version, {c:G} {c:C} {c:D}. Then take the capo off and play it again with barre chords: {c:Bb} (x13331), {c:Eb} (x68886), {c:F} (133211).',
      tip: 'Same song, two sets of hands. Keep the version that sounds better, not the one that is easier.',
    }),
    playerTask({
      id: 'o-come-capo',
      title: 'O Come, All Ye Faithful, in your key',
      song: 'o-come-all-ye-faithful',
      minutes: 5,
      body: 'Play it once with the app at 88 BPM, no capo, in {k:G major}. Then stop the app, clip the capo at fret 3 and strum it alone, singing: the same shapes now sound in {k:Bb major}. Try frets 1 to 5 and keep the one that suits your voice.',
    }),
    {
      type: 'true-false',
      statement: 'With the capo at fret 2, a {c:D} shape sounds as {c:E}.',
      answer: true,
      explain: 'Two frets, two half steps: {n:D}, {n:D#}, {n:E}. A capo adds its fret number in half steps to every shape.',
      fact: 'be-capo-three',
    },
  ],
  facts: [
    { id: 'be-transpose', front: 'How do you move a song to another key?', back: 'Move every chord the same distance and keep each one\'s quality: {c:G} {c:Em} {c:C} {c:D} up a whole step is {c:A} {c:F#m} {c:D} {c:E}.' },
    { id: 'be-capo-three', front: 'Capo at fret 3: what do the {c:G}, {c:C} and {c:D} shapes sound?', back: '{c:Bb}, {c:Eb} and {c:F}: each shape sounds three half steps higher.' },
    { id: 'be-nashville', front: 'What is a Nashville number chart?', back: 'A chart in numbers, one a bar (1 | 4 | 1 | 5, 6m for minor), so a band can play it in any key on the spot.' },
  ],
};

// ── 5. Locking in with the band ────────────────────────────────────────────────────────────────

const lockingWithTheBand: TeacherLesson = {
  id: 'locking-with-the-band',
  title: 'Locking in with the band',
  teaches: 'Lock your strum to the kick and snare, play less under the voice, and play bigger in the chorus.',
  minutes: 5,
  skill: 'teacher:dev:locking-with-the-band',
  steps: [
    {
      type: 'card',
      title: 'Your job: make it feel good',
      body: 'In a band your job is to make the song feel good, not to fill every gap. Lock your strum to the kick drum and the snare, play less when someone sings or solos, and play bigger in the chorus than in the verse.',
      figure: { kind: 'audio', sound: { kind: 'strum', chord: 'G', pattern: 'D-DU-UDU', tempo: 80, repeat: 2 }, label: 'The folk strum on G' },
    },
    {
      type: 'card',
      title: 'Kick and snare',
      body: 'The kick drum usually lands on beats 1 and 3, the snare on 2 and 4: that is the {t:backbeat}. Put your strongest strokes with them and the band locks. Practise with a click on 2 and 4 only: the click is the snare, and you carry 1 and 3.',
      figure: { kind: 'rhythm', pattern: 'qr q qr q', tempo: 80, caption: 'The snare: beats 2 and 4.' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Be the snare: tap beats 2 and 4 only, for two bars.',
      rhythm: { pattern: 'qr q qr q | qr q qr q' },
      tempo: 80,
      show: 'both',
      explain: 'Silence on 1, tap on 2, silence on 3, tap on 4. Counting "one, TWO, three, FOUR" keeps the silent beats in place.',
      fact: 'be-backbeat',
    },
    techniqueTask({
      id: 'click-on-2-and-4',
      title: 'The click on 2 and 4',
      exercise: 'tech-metronome-2-4',
      minutes: 4,
      body: 'Set the ladder to 80 BPM: the click is your snare. Strum the folk pattern on {c:G} (the screen shows it on {c:Em}; either works) and count "one, TWO, three, FOUR" aloud. When the clicks feel like the snare, not beat 1, you have it.',
    }),
    {
      type: 'card',
      title: 'Count, look up, follow the chart',
      body: 'Count-ins, endings and section changes are where bands fall apart, so count, look up, and follow the chart. Mine is over {r:I} {r:V} {r:vi} {r:IV} in G, {c:G} {c:D} {c:Em} {c:C}: intro, a soft verse, a loud chorus, a solo, an outro on one ringing {c:G}.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each section of my chart with how you play it.',
      pairs: [
        { left: 'Intro', right: 'Count in, start together' },
        { left: 'Verse', right: 'Soft palm-muted eighths' },
        { left: 'Chorus', right: 'Full, loud strums' },
        { left: 'Solo', right: 'Less: leave room' },
        { left: 'Outro', right: 'One last ringing chord' },
      ],
      explain: 'Small for the voice, big for the chorus, out of the way for the solo, and together at both ends. Dynamics are the arrangement.',
      fact: 'be-band-job',
    },
    toolTask({
      id: 'first-guitar-jam',
      title: 'Jam: follow the chart',
      tool: 'progressions',
      params: ['pop-axis', 'g', 'jam'],
      minutes: 6,
      body: 'Set the band to 96 BPM in G: {c:G} {c:D} {c:Em} {c:C}. Count in, then follow my chart: 8 bars of verse in palm-muted eighths, 8 of chorus in full strums, 8 of space for a solo, the chorus again, and end on one {c:G}.',
    }),
    {
      type: 'card',
      title: 'Second guitar: stay out of the way',
      body: 'Two guitars strumming the same open chords sound like one big blur. The second guitar plays small {t:triad|triads} high up, on strings 3 to 1: {c:G} at frets 7, 8, 7, {c:D} at 7, 7, 5, {c:Em} at 9, 8, 7 and {c:C} at 9, 8, 8. All four sit between frets 5 and 9, so no change jumps far.',
      figure: { kind: 'fretboard', frets: [5, 9], strings: [3, 2, 1], dots: G_TRIAD, caption: '{c:G} on strings 3 to 1: {n:D} {n:G} {n:B}.' },
    },
    {
      type: 'choice',
      prompt: 'This triad sits on strings 3 to 1, at frets 9, 8 and 7. Which chord is it?',
      figure: { kind: 'fretboard', frets: [5, 9], dots: EM_TRIAD },
      options: [
        { text: '{c:Em}', correct: true },
        { text: '{c:C}', why: '{c:C} would need {n:C} on top: fret 8 on string 1.' },
        { text: '{c:G}', why: '{c:G} has {n:D} on string 3, at fret 7.' },
        { text: '{c:Am}' },
      ],
      explain: '{n:E} at string 3, fret 9, {n:G} at string 2, fret 8 and {n:B} at string 1, fret 7: {n:E} {n:G} {n:B}, the {c:Em} triad.',
      fact: 'be-second-guitar',
    },
    {
      type: 'play-chord',
      prompt: 'Play the {c:C} triad on strings 3 to 1: frets 9, 8 and 8.',
      chord: 'C',
      frets: 'xxx988',
      explain: '{n:E}, {n:G} and {n:C}: from {c:Em} at 9, 8, 7, only the top note moves, one fret up.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'C',
        frets: 'xxx988',
        accept: 'any-voicing',
        prompt: 'Build {c:C} as a high triad on strings 3 to 1.',
        explain: 'String 3, fret 9 ({n:E}), string 2, fret 8 ({n:G}), string 1, fret 8 ({n:C}): every note of {c:C}, nothing low.',
      },
    },
    toolTask({
      id: 'second-guitar-jam',
      title: 'Jam: be the second guitar',
      tool: 'progressions',
      params: ['pop-axis', 'g', 'jam'],
      minutes: 5,
      body: 'Same jam, 96 BPM, now as the second guitar: only the triads on strings 3 to 1, {c:G} {c:D} {c:Em} {c:C}. Short strums on 2 and 4 in the verse, ringing ones in the chorus. Record a minute on your phone: can you hear the high part over the band?',
    }),
    {
      type: 'true-false',
      statement: 'In most bands the snare drum lands on beats 2 and 4.',
      answer: true,
      explain: 'Kick on 1 and 3, snare on 2 and 4: the backbeat. Lock your strokes to it and the whole band feels tighter.',
      fact: 'be-backbeat',
    },
  ],
  facts: [
    { id: 'be-backbeat', front: 'Where do the kick drum and the snare usually land?', back: 'The kick on beats 1 and 3, the snare on 2 and 4: the backbeat. Lock your strum to them.' },
    { id: 'be-band-job', front: 'Your job as the band\'s rhythm guitar?', back: 'Make the song feel good: lock with the drums, play less under the voice or a solo, and bigger in the chorus than the verse.' },
    { id: 'be-second-guitar', front: 'How does a second guitar stay out of the way?', back: 'Small triads high up on strings 3 to 1, instead of the same open chords as the first guitar.' },
  ],
};

// ── 6. Tone and dynamics ───────────────────────────────────────────────────────────────────────

const toneAndDynamics: TeacherLesson = {
  id: 'tone-and-dynamics',
  title: 'Tone and dynamics',
  teaches: 'Pick near the bridge for bright, near the neck for warm, and play soft and loud on purpose.',
  minutes: 5,
  skill: 'teacher:dev:tone-and-dynamics',
  steps: [
    {
      type: 'card',
      id: 'zones',
      title: 'Your tone is in your hands',
      art: 'guitar-parts',
      body: 'Most of your tone is in your hands. Pick near the bridge for a bright, tight sound; over the middle of the strings for the everyday one; near the neck for a warm, round one. Dig in hard for an edge, or brush lightly for a whisper. Same guitar, three guitars.',
      tip: 'Near the bridge means a finger or two from it; a hand\'s width away is already the everyday spot.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each way of picking with the sound it makes.',
      pairs: [
        { left: 'Near the bridge', right: 'Bright and tight' },
        { left: 'Near the neck', right: 'Warm and round' },
        { left: 'Digging in hard', right: 'An edge' },
        { left: 'A light brush', right: 'A whisper' },
      ],
      explain: 'Where you pick sets the colour, how hard you pick sets the weight. Both are in your picking hand, and both are free.',
      fact: 'be-pick-zones',
    },
    {
      type: 'card',
      title: 'Hear the zones yourself',
      body: 'Record yourself on your phone: the same {c:G} strum, four bars near the bridge, four over the middle, four near the neck. Play it back with your eyes shut and name each one. Thin and snappy is the bridge; warm and soft-edged is the neck.',
    },
    {
      type: 'choice',
      prompt: 'On your recording, one take sounds thin, bright and snappy. Where was it picked?',
      options: [
        { text: 'Near the bridge', correct: true },
        { text: 'In the middle', why: 'The middle is the everyday sound: neither thin nor dark.' },
        { text: 'Near the neck', why: 'Near the neck the sound gets warm and round, not thin.' },
      ],
      explain: 'Close to the bridge the string\'s high overtones ring out, so it sounds bright and tight. Move towards the neck and they fade: warmer.',
      fact: 'be-pick-zones',
    },
    {
      type: 'card',
      title: 'Soft and loud, on purpose',
      body: '{t:dynamics|Dynamics}, playing soft and loud on purpose, are the cheapest way to make anything sound more musical. The marks, softest to loudest: pp, p, mp, mf, f, ff. A {t:crescendo} grows from soft to loud. The tempo never changes with the volume.',
    },
    {
      type: 'order',
      prompt: 'Put the dynamic marks in order, softest first.',
      tiles: ['pp: very soft', 'p: soft', 'mp: medium soft', 'mf: medium loud', 'f: loud', 'ff: very loud'],
      explain: 'p is piano (soft), f is forte (loud); double them for very. mp and mf, mezzo piano and mezzo forte, are the two middle steps.',
      fact: 'be-dynamic-marks',
    },
    techniqueTask({
      id: 'dynamic-control',
      title: 'Dynamic Control',
      exercise: 'tech-dynamics',
      minutes: 5,
      body: 'One {c:Am} arpeggio, a bar each at pp, p, mf, f and ff, then the swell. Start at 60 BPM. With the microphone on, the level meter shows each bar: five clear steps, tempo never moving. No microphone? Record it on your phone and listen back.',
      tip: 'Exaggerate: pp barely there, ff as loud as you can play cleanly. Then fill the middle.',
    }),
    {
      type: 'play-phrase',
      prompt: 'The {c:Am} arpeggio twice: first pp, barely there, then ff. The microphone checks the notes; your ears check the difference.',
      notes: [...DYNAMICS_ARPEGGIO, ...DYNAMICS_ARPEGGIO],
      octave: 'exact',
      tempo: 60,
      explain: 'The open {n:A}, string 3, fret 2 ({n:A}), string 2, fret 1 ({n:C}) and the open {n:E}, twice a bar. Only the force of the pick changed, never the time.',
      alternative: {
        type: 'choice',
        prompt: 'From the pp bar to the ff bar, what changes?',
        options: [
          { text: 'Only how hard you pick', correct: true },
          { text: 'How hard and how fast', why: 'Loud is not fast: the tempo stays exactly where it was.' },
          { text: 'The notes', why: 'Same arpeggio, same notes. Only the volume moves.' },
        ],
        explain: 'Dynamics change the force of the stroke and nothing else. Keep the click in your ear as you grow.',
      },
    },
    toolTask({
      id: 'dynamics-jam',
      title: 'Jam: soft, loud, then grow',
      tool: 'progressions',
      params: ['fifties-i-vi-iv-v', 'g', 'jam'],
      minutes: 5,
      body: 'Set the band to 72 BPM in G: {c:G} {c:Em} {c:C} {c:D}. Four bars soft (p, near the neck), four loud (f, near the bridge). Then start pp and grow slowly over eight bars to ff. Keep the tempo dead still while you grow.',
    }),
    {
      type: 'true-false',
      statement: 'When you play louder, it is natural to speed up a little.',
      answer: false,
      explain: 'Natural, yes, and wrong. Loud is not fast: the click stays put through every crescendo. Listen for it most when you grow.',
      fact: 'be-dynamic-marks',
    },
  ],
  facts: [
    { id: 'be-pick-zones', front: 'Where do you pick for a bright sound, and for a warm one?', back: 'Near the bridge for bright and tight; near the neck for warm and round. Dig in for an edge, brush lightly for a whisper.' },
    { id: 'be-dynamic-marks', front: 'The dynamic marks from softest to loudest?', back: 'pp, p, mp, mf, f, ff. Playing louder never means playing faster.' },
  ],
};

// ── 7. The gig (milestone) ─────────────────────────────────────────────────────────────────────

const devGraduation: TeacherLesson = {
  id: 'dev-graduation',
  title: 'The gig',
  teaches: 'A gig is a planned arrangement: intro, rhythm, solo, comping and an ending, played through without stopping.',
  minutes: 5,
  skill: 'teacher:dev:dev-graduation',
  steps: [
    {
      type: 'card',
      title: 'Your last gig with me',
      body: 'A 12-bar blues in A, the way a band plays it: an intro with the turnaround, two choruses of shuffle with your seventh-chord shapes, two of solo, one of {t:comping} behind the band, and an ending on {c:A7}. Then Elena takes over.',
      figure: { kind: 'chord', symbol: 'A7', frets: '575655', caption: 'The last chord of the gig: {c:A7} at fret 5.' },
    },
    {
      type: 'order',
      prompt: 'Put the gig chart in order.',
      tiles: ['Turnaround', '2 x shuffle', '2 x solo', '1 x comping', 'End on {c:A7}'],
      explain: 'Turnaround in, two choruses of rhythm, two of solo, one of comping, the last {c:A7}. Tape it to the floor.',
      fact: 'be-gig-chart',
    },
    toolTask({
      id: 'gig-tune',
      title: 'Tune up',
      tool: 'tuner',
      minutes: 2,
      body: 'Every gig starts in tune: all six strings, each one tightened up to the note.',
    }),
    techniqueTask({
      id: 'gig-warm-up',
      title: 'Warm up',
      exercise: 'tech-warm-up',
      minutes: 5,
      body: 'Five easy minutes: nothing fast, no stretch that hurts.',
    }),
    {
      type: 'play-chord',
      prompt: 'Your shuffle shapes: play {c:D7} at fret 5, x57575.',
      chord: 'D7',
      frets: 'x57575',
      explain: 'The A-shape seventh with its root on string 5, fret 5. {c:E7} is the same shape at fret 7 (x79797), and {c:A7} the E shape at fret 5.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'D7',
        frets: 'x57575',
        accept: 'any-voicing',
        prompt: 'Build {c:D7} with its root on string 5, fret 5.',
        explain: 'The A-shape seventh: {n:D}, {n:A}, {n:C}, {n:F#} and {n:A} from string 5 up. The {n:C} is the seventh that makes it bluesy.',
      },
    },
    playerTask({
      id: 'gig-intro',
      title: 'The intro: a turnaround in A',
      song: 'st-blues-turnarounds',
      bars: [3, 4],
      minutes: 3,
      body: 'Blues Turnarounds, bars 3 and 4, at 80 BPM: the line falling {n:G} {n:F#} {n:F} {n:E} on string 4 over the open string 5, then {c:E7}. Your intro.',
    }),
    playerTask({
      id: 'gig-solo-route',
      title: 'The solo route',
      song: 'st-pent-connect',
      bars: [1, 8],
      minutes: 4,
      body: 'Pentatonic Across the Neck, bars 1 to 8, at 88 BPM: box 5 up to box 4, a slide into each. That is your solo\'s climb.',
    }),
    {
      type: 'choice',
      prompt: 'Your solo climbs the five boxes of A minor pentatonic. Which starts at fret 12?',
      options: [{ text: 'Box 4', correct: true }, { text: 'Box 1', why: 'Box 1 starts at fret 5, on the root.' }, { text: 'Box 2' }, { text: 'Box 5', why: 'Box 5 starts at fret 2, under box 1.' }],
      explain: 'Box 1 at fret 5, box 2 at 7, box 3 at 9, box 4 at 12, box 5 at 2 (and again at 14): one map of the whole neck.',
      fact: 'be-hand-over',
    },
    toolTask({
      id: 'gig-jam',
      title: 'The gig: three takes',
      tool: 'progressions',
      params: ['blues-turnaround', 'a', 'jam'],
      minutes: 15,
      body: 'Set the band to 96 BPM: {c:A7} {c:D7} {c:E7}. Come in at bar 11 with the turnaround line, and hit {c:E7} with the band on beat 3 of bar 12. Then 2 choruses shuffle, 2 solo, 1 comping, end on {c:A7}. Three takes, on your phone.',
      tip: 'Comping: short chords on 2 and 4, with space.',
    }),
    {
      type: 'choice',
      prompt: 'Check your best take against my list. Which is NOT on it?',
      options: [
        { text: 'How fast you played', correct: true },
        { text: 'Time: steady with the band', why: 'On the list, first.' },
        { text: 'Tone and dynamics', why: 'On the list: the solo bigger, the comping smaller.' },
        { text: 'Target notes and a clear ending', why: 'On the list: thirds at the changes, and a last {c:A7} that lands.' },
      ],
      explain: 'Time, tone, dynamics, target notes and a clear ending. Nobody in the audience counts notes per second.',
      fact: 'be-gig-checklist',
    },
    {
      type: 'card',
      title: 'The hand-over for Elena',
      body: 'My hand-over check for Professor Varga: any major, minor or seventh chord in two places, all five pentatonic boxes, C major in five positions, and eight bars read at sight. For the reading, scan a page you have never played with Scan & Import.',
    },
    {
      type: 'fretboard-find',
      prompt: 'A chord in two places: tap the roots of {c:D7} on strings 6 and 5.',
      find: { note: 'D' },
      mode: 'all',
      octave: 'any',
      frets: [1, 12],
      strings: [6, 5],
      explain: 'String 6, fret 10 for the E-shape {c:D7}, string 5, fret 5 for the A shape, x57575. Find the root and the shape follows.',
      fact: 'be-hand-over',
    },
    { generate: 'staff-note', params: { ask: 'read', low: 'E3', high: 'G4', accidentals: true } },
    {
      type: 'play-phrase',
      id: 'show',
      prompt: 'Your show: the turnaround, {n:G} {n:F#} {n:F} {n:E} on string 4, the open {n:E} for {c:E7}, then home to {n:A}.',
      notes: GIG_ENDING,
      octave: 'exact',
      tempo: 80,
      pass: 0.8,
      explain: 'String 4, frets 5, 4, 3, 2, the open string 6, then fret 5: the root of your last {c:A7}. Five of the six notes is a pass.',
      alternative: {
        type: 'order',
        prompt: 'Put the turnaround and its ending in order.',
        tiles: ['{n:G}', '{n:F#}', '{n:F}', '{n:E}', '{n:E}', '{n:A}'],
        explain: 'The line falls by half steps, {n:G} {n:F#} {n:F} {n:E}, the bass drops to {n:E} for {c:E7}, and the gig ends on {n:A}.',
      },
    },
  ],
  facts: [
    { id: 'be-gig-chart', front: 'Dev\'s gig chart for a blues in A?', back: 'An intro with the turnaround, two choruses of shuffle rhythm, two of solo, one of comping, and an ending on {c:A7} (575655).' },
    { id: 'be-gig-checklist', front: 'What do you check a recorded take for?', back: 'Time, tone, dynamics, target notes and a clear ending.' },
    { id: 'be-hand-over', front: 'Dev\'s hand-over check before Prof. Varga?', back: 'Any major, minor or seventh chord in two places, all five pentatonic boxes, C major in five positions, and eight bars read at sight.' },
  ],
};

/** Unit 12 of Dev's course. */
const unit: TeacherUnit = {
  id: 'dev-band-and-ear',
  title: 'By ear, in time, in a band',
  theme: 'ear',
  description: 'Find keys, chords and melodies by ear, move songs to any key, lock in with a band, shape your tone, then play the gig.',
  lessons: [keyByEar, chordsByEar, melodyByEar, capoAndKeys, lockingWithTheBand, toneAndDynamics, devGraduation],
  checkpoint: { sample: 8, maxMistakes: 2 },
  milestone: {
    lesson: 'dev-graduation',
    step: 'show',
    piece: 'the blues in A',
    song: 'st-blues-turnarounds',
    celebrate: 'That was a gig: in tune, warmed up, a turnaround in, shuffle, solo, comping, and a last {c:A7} that landed. You play the whole neck now, by ear and in a band. Professor Varga will ask more of you, and you are ready.',
  },
  glossary: [
    { id: 'home-note', term: 'home note', definition: 'The note a tune wants to come to rest on. It is the root of the key.' },
    { id: 'transpose', term: 'transpose', definition: 'To move a song to another key by moving every chord and note the same distance.' },
    { id: 'nashville-numbers', term: 'Nashville numbers', definition: 'A chart written as numbers of the key (1, 4, 5, 6m) instead of chord names, so a band can play it in any key.' },
    { id: 'backbeat', term: 'backbeat', definition: 'Beats 2 and 4 of a bar in 4/4, where the snare drum usually hits.' },
    { id: 'dynamics', term: 'dynamics', definition: 'How soft or loud music is played, marked from pp (very soft) to ff (very loud).' },
    { id: 'crescendo', term: 'crescendo', definition: 'Getting gradually louder. The opposite, getting softer, is a diminuendo.' },
    { id: 'comping', term: 'comping', definition: 'Backing a singer or soloist with short, spaced chords that leave them room.' },
  ],
};

export default unit;
