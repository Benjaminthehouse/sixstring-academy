/**
 * Prof. Varga, unit 12: Composition and arranging (plan: `elena/elena-composition-and-arranging` in
 * src/content/plan/teachers.json).
 *
 * Elena's voice: rigorous, dry, respectful. Writing a progression and a melody, arranging a melody
 * for solo guitar in layers, piano music on the guitar (ragtime), two-voice counterpoint, a fugue
 * exposition, and composing in DADGAD. Every fact of the plan's `explain` is on the cards; the
 * `show` becomes staves, tab, chord boxes and fretboards; the `practice` becomes in-lesson exercises
 * or tasks that send the learner to the Progressions builder and jam tracks, the Player and the
 * Tuner, and back. The app has no composing screen and no recorder: writing happens on paper and
 * comes into the app through Scan & Import (a photograph, or typed tab pasted in), and recordings
 * are made on the learner's phone.
 *
 * Music from the library: Chord Melody: First Ballad (`st-chord-melody-1`), Ragtime Blues in C
 * (`st-ragtime-blues-c`, 100 BPM), Duet: Baroque-Style Duo in D minor (`st-duet-baroque`, 108 BPM),
 * Two-Voice Invention for Solo Guitar (`st-two-voice-invention`, 56 BPM), Fugue Exposition for Solo
 * Guitar (`st-fugue-exposition`, 60 BPM, drop D) and DADGAD Air (`st-dadgad-air`, 76 BPM), with the
 * jam track `borrowed-iv-minor` in C. Danny Boy (chord melody) and Shenandoah carry fallbacks until
 * they are in the library. The Entertainer, Maple Leaf Rag and Bach's Bourree in E minor must be
 * read from printed editions, which this project cannot consult: their tasks go to the nearest
 * library studies (the Ragtime Blues, the Baroque duo), and the cards teach the learner to bring an
 * edition of their own in with Scan & Import. The three layers of an arrangement are shown on
 * Elena's own period from lesson 2 rather than on The Ash Grove, which is not in the library to be
 * checked against. `elena-composition-and-arranging.test.ts` cross-checks every figure, function,
 * cadence, voice, entry, tuning and tempo against the engines and the library.
 */
import { noteAt } from '@/core/guitar';
import type { StaffNote, TabNote } from '@/lessons';
import type { TeacherLesson, TeacherUnit } from '../types';
import { playerTask, toolTask } from '../tasks';

/** One tab note. */
function t(string: number, fret: number, duration: string): TabNote {
  return { string, fret, duration };
}

/** A tab line as staff notes, spelled in a key, with optional labels by index. */
function staffOf(notes: TabNote[], key: string, labels: Record<number, string> = {}, tuning?: string): StaffNote[] {
  return notes
    .filter((n): n is Extract<TabNote, { string: number }> => 'string' in n)
    .map((n, i) => {
      const note: StaffNote = { note: noteAt({ string: n.string, fret: n.fret }, { context: { key }, tuning }), duration: n.duration };
      if (labels[i]) note.label = labels[i];
      return note;
    });
}

/** Elena's original 8-bar period in {k:G major}, bars 1 to 4 (the question), first position. */
export const PERIOD_QUESTION: TabNote[] = [
  t(2, 3, 'q'), t(2, 0, 'e'), t(2, 1, 'e'), t(2, 3, 'q'), t(3, 0, 'q'),
  t(1, 0, 'q'), t(2, 3, 'e'), t(2, 1, 'e'), t(2, 0, 'h'),
  t(2, 3, 'q'), t(2, 0, 'e'), t(2, 1, 'e'), t(2, 3, 'q'), t(2, 0, 'q'),
  t(2, 1, 'q'), t(1, 0, 'q'), t(2, 3, 'h'),
];

/** Bars 5 to 8 (the answer). */
export const PERIOD_ANSWER: TabNote[] = [
  t(2, 3, 'q'), t(2, 0, 'e'), t(2, 1, 'e'), t(2, 3, 'q'), t(3, 0, 'q'),
  t(1, 0, 'q'), t(1, 2, 'q'), t(1, 3, 'h'),
  t(1, 0, 'q'), t(2, 1, 'q'), t(3, 2, 'q'), t(4, 4, 'q'),
  t(3, 0, 'w'),
];

/** The chords under the period, two to a bar where it changes: what the cadences are made of. */
export const PERIOD_CHORDS: readonly (readonly string[])[] = [['G'], ['C', 'G'], ['G'], ['Am', 'D'], ['G'], ['Em'], ['Am', 'D7'], ['G']];

/** The arrangement's layer 1: bars 1 and 2 of the period, the melody alone. */
export const LAYER_MELODY: TabNote[] = PERIOD_QUESTION.slice(0, 9);

/** Layer 2: a bass on beats 1 and 3 (G, the open D; C, G). */
export const LAYER_BASS: TabNote[] = [t(6, 3, 'h'), t(4, 0, 'h'), t(5, 3, 'h'), t(6, 3, 'h')];

/** Layer 3 at bar 1, beat 1: G under the melody's D, string 1 silent. */
export const LAYER_FULL = { symbol: 'G', frets: '32003x', fingers: '32004x' } as const;

/** The thumb of the Ragtime Blues, bar 1: root, string 4, alternate bass, string 4. */
export const RAG_THUMB: TabNote[] = [t(5, 3, 'q'), t(4, 2, 'q'), t(6, 3, 'q'), t(4, 2, 'q')];

/** The tune over it in bar 1: G lands on the "and" of 1 and is held over beat 2. */
export const RAG_TUNE: TabNote[] = [t(1, 0, 'e'), t(1, 3, 'q'), t(1, 0, 'e'), t(2, 1, 'q'), t(2, 3, 'e'), t(1, 0, 'e')];

/** The rhythm of that tune. */
export const RAG_TUNE_RHYTHM = 'e q e q e e';

/** The invention's subject, bar 1, treble alone. */
export const INVENTION_SUBJECT: TabNote[] = [t(3, 9, 'e'), t(1, 7, 'e'), t(2, 10, 's'), t(2, 8, 's'), t(2, 7, 's'), t(3, 9, 's'), t(3, 8, 'e'), t(4, 9, 'e'), t(3, 9, 'q')];

/** Bar 2: the bass imitates it an octave lower. */
export const INVENTION_BASS: TabNote[] = [t(5, 7, 'e'), t(4, 9, 'e'), t(4, 7, 's'), t(5, 10, 's'), t(5, 9, 's'), t(5, 7, 's'), t(6, 11, 'e'), t(6, 7, 'e'), t(5, 7, 'q')];

/** The fugue's subject, bars 1 and 2, top voice alone (strings 1 to 3 are not retuned in drop D). */
export const FUGUE_SUBJECT: TabNote[] = [
  t(3, 7, 'q'), t(3, 7, 'e.'), t(2, 5, 's'), t(2, 6, 'q'), t(2, 6, 'e.'), t(2, 8, 's'),
  t(1, 5, 'q'), t(1, 6, 'e'), t(1, 5, 'e'), t(2, 8, 'e'), t(2, 6, 'e'), t(2, 5, 'e'), t(3, 6, 'e'),
];

/** The answer, bars 3 and 4, middle voice: the subject a fifth higher in the key, an octave down. */
export const FUGUE_ANSWER: TabNote[] = [
  t(4, 7, 'q'), t(4, 7, 'e.'), t(4, 9, 's'), t(3, 5, 'q'), t(3, 5, 'e.'), t(3, 7, 's'),
  t(2, 5, 'q'), t(2, 6, 'e'), t(2, 5, 'e'), t(3, 7, 'e'), t(3, 5, 'e'), t(2, 0, 'e'), t(4, 6, 'e'),
];

/** The countersubject above the answer, bars 3 and 4: steady quarter notes. */
export const FUGUE_COUNTERSUBJECT: TabNote[] = [t(3, 5, 'q'), t(2, 6, 'q'), t(2, 5, 'q'), t(1, 5, 'q'), t(1, 8, 'q'), t(1, 5, 'q'), t(2, 6, 'q'), t(3, 7, 'q')];

/** The third entry, bars 7 and 8: the subject in the bass, from the open low D (drop D). */
export const FUGUE_THIRD_ENTRY: TabNote[] = [
  t(6, 0, 'q'), t(6, 0, 'e.'), t(6, 2, 's'), t(6, 3, 'q'), t(6, 3, 'e.'), t(6, 5, 's'),
  t(5, 0, 'q'), t(5, 1, 'e'), t(5, 0, 'e'), t(6, 5, 'e'), t(6, 3, 'e'), t(6, 2, 'e'), t(5, 4, 'e'),
];

/** The open strings of DADGAD, string 6 to string 1. */
export const DADGAD_OPEN = ['D2', 'A2', 'D3', 'G3', 'A3', 'D4'] as const;

/** The top line of the DADGAD Air, bars 1 and 2, frets in DADGAD. */
export const DADGAD_TUNE: TabNote[] = [t(2, 0, 'q'), t(1, 0, 'q'), t(1, 2, 'q'), t(1, 4, 'q'), t(1, 5, 'et'), t(1, 4, 'et'), t(1, 2, 'et'), t(1, 0, 'q')];

/** D major up from the open string 4 in DADGAD. */
export const DADGAD_SCALE: TabNote[] = [t(4, 0, 'q'), t(4, 2, 'q'), t(4, 4, 'q'), t(3, 0, 'q'), t(3, 2, 'q'), t(3, 4, 'q'), t(2, 4, 'q'), t(2, 5, 'h')];

// ── 1. Writing a progression ────────────────────────────────────────────────────────────────────

const writingProgressions: TeacherLesson = {
  id: 'writing-progressions',
  title: 'Writing a progression',
  teaches: 'A progression travels from home and back, tonic, away, tension, home; borrowing and cadences colour it.',
  minutes: 5,
  skill: 'teacher:elena:writing-progressions',
  steps: [
    {
      type: 'card',
      title: 'A journey from home',
      body: 'A progression is a journey from home and back. The {t:tonic} is home; the {t:subdominant} leads away; the {t:dominant} builds tension; the tonic resolves it. In {k:C major}: {c:C}, {c:F}, {c:G7}, {c:C}. Listen to it travel.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['C', 'F', 'G7', 'C'], tempo: 72, beats: 4 }, label: 'Hear the journey' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each chord of the journey with its function.',
      pairs: [
        { left: '{r:I}', right: 'Tonic: home' },
        { left: '{r:IV}', right: 'Subdominant: away' },
        { left: '{r:V7}', right: 'Dominant: tension' },
      ],
      explain: 'Home, away, tension, home: {r:I}, {r:IV}, {r:V7}, {r:I}. Almost every progression you know is that journey, decorated.',
      fact: 'comp-functions',
    },
    {
      type: 'card',
      title: 'The function map',
      body: 'Every chord of the key has a function. Tonic: {c:C}, {c:Am}, {c:Em}. Subdominant: {c:F}, {c:Dm}. Dominant: {c:G7}, {c:Bdim}. And for colour, borrow from the parallel minor, {k:C minor}: {c:Fm} and {c:Ab} lead away like subdominants, {c:Bb} leads home like a softer dominant.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['C', 'Fm', 'Ab', 'Bb', 'C'], tempo: 72, beats: 4 }, label: 'Hear the borrowed chords' },
    },
    {
      type: 'choice',
      prompt: 'In {k:C major}, which chord shares the tonic function with {c:C}?',
      options: [
        { text: '{c:Am}', correct: true },
        { text: '{c:F}', why: '{c:F} is {r:IV}: it leads away from home.' },
        { text: '{c:G7}', why: '{c:G7} is the dominant: tension, not home.' },
        { text: '{c:Dm}', why: '{c:Dm} is {r:ii}, a subdominant: it leads away.' },
      ],
      explain: '{c:Am}, the {r:vi} chord, shares two notes with {c:C} ({n:C} and {n:E}), and can stand in for home.',
      fact: 'comp-functions',
    },
    {
      type: 'choice',
      prompt: 'Which of these is borrowed from {k:C minor}?',
      options: [
        { text: '{c:Fm}', correct: true },
        { text: '{c:F}', why: '{c:F} is the key\'s own {r:IV}.' },
        { text: '{c:Dm}', why: '{c:Dm} is the key\'s own {r:ii}.' },
        { text: '{c:Em}', why: '{c:Em} is the key\'s own {r:iii}.' },
      ],
      explain: '{c:Fm} is {r:iv} of {k:C minor}: its {n:Ab} is not in {k:C major}. That one foreign note is the whole colour.',
      fact: 'comp-borrowed',
    },
    {
      type: 'card',
      title: 'Colour inside the frame',
      body: 'Within that frame, colour is free: borrow {r:iv} or {r:bVII} from the parallel minor, add a secondary dominant, or delay the cadence with a deceptive {r:vi}. My example: {c:C} | {c:Am} | {c:Fm} | {c:G7} | {c:C}. The {c:Fm} darkens the road to the dominant; the {c:C} still comes home.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['C', 'Am', 'Fm', 'G7', 'C'], tempo: 72, beats: 4 }, label: 'Hear my example' },
    },
    {
      type: 'choice',
      prompt: '{c:G7} goes to {c:Am} instead of {c:C}. Which cadence is that?',
      options: [
        { text: 'Deceptive', correct: true },
        { text: 'Authentic', why: 'An authentic cadence goes {r:V} to {r:I}: {c:G7} to {c:C}.' },
        { text: 'Plagal', why: 'A plagal cadence goes {r:IV} to {r:I}: {c:F} to {c:C}.' },
        { text: 'Half', why: 'A half cadence stops on {r:V} itself.' },
      ],
      explain: '{r:V} to {r:vi}: the ear expects home and gets its relative. The journey is delayed, not ended, so the next phrase must finish it.',
      fact: 'comp-deceptive',
    },
    { generate: 'cadence-ear', params: { types: ['authentic', 'half', 'deceptive', 'plagal'] } },
    {
      type: 'card',
      title: 'Four bars away, four home',
      body: 'Write four bars that leave home and four that return, and play them to someone who knows no theory: if they feel the ending, it works. Build it in the Progressions builder, whose More colours switch adds borrowed and secondary chords.',
    },
    toolTask({
      id: 'eight-bars-in-c',
      title: 'Eight bars in C, in the builder',
      tool: 'progressions',
      params: ['builder'],
      minutes: 6,
      body: 'Key {k:C major}; switch on Sevenths and More colours, where {c:Fm}, {c:Ab} and {c:Bb} live. Build eight bars: four away, four home, at least one borrowed chord, a clear cadence at the end. Play it, change what does not travel, and save it: the next lesson writes a melody over it.',
      tip: 'If it sounds like a list of chords, it has no destination. Decide the last two chords first.',
    }),
    {
      type: 'true-false',
      statement: 'In {k:C major}, the borrowed {c:Fm} contains {n:Ab}, which falls a half step to {n:G}, the fifth of {c:C}.',
      answer: true,
      explain: '{c:Fm} is {n:F}, {n:Ab}, {n:C}. Its {n:Ab} sinks to {n:G} as the music comes home: the sigh the major {r:IV}, with its {n:A}, cannot make.',
      fact: 'comp-borrowed',
    },
    toolTask({
      id: 'minor-iv-jam',
      title: 'Jam: the borrowed minor chord in C',
      tool: 'progressions',
      params: ['borrowed-iv-minor', 'c', 'jam'],
      minutes: 4,
      body: 'The band plays {r:I}, {r:IV}, {r:iv}, {r:I} in {k:C major}; set the tempo to 72 BPM. Over {c:Fm}, aim for {n:Ab} and let it fall to {n:G} as {c:C} returns: the minor {r:iv} in context.',
    }),
    toolTask({
      id: 'record-progression',
      title: 'Record yours, then sing over it',
      tool: 'progressions',
      params: ['builder', 'jam'],
      minutes: 5,
      body: 'Jam over your eight bars and record them on your phone, strummed; then again, improvising a melody over them. Play the second take to someone who knows no theory: where did the music end?',
    }),
    {
      type: 'choice',
      prompt: 'Your eight bars end on {c:G7}. What have you written?',
      options: [
        { text: 'A half cadence: it stops away from home', correct: true },
        { text: 'An authentic cadence', why: 'That needs the {c:G7} to go on to {c:C}.' },
        { text: 'A plagal cadence', why: 'That is {c:F} to {c:C}.' },
      ],
      explain: 'Ending on {r:V} leaves the journey open: a half cadence. Fine for bar 4; for bar 8, add the {c:C}.',
    },
  ],
  facts: [
    { id: 'comp-functions', front: 'Tonic, subdominant, dominant: what does each do?', back: 'The tonic is home, the subdominant leads away, the dominant builds tension, and the tonic resolves it.' },
    { id: 'comp-borrowed', front: 'Which chords does {k:C major} borrow from {k:C minor} most often?', back: '{c:Fm} ({r:iv}), {c:Ab} ({r:bVI}) and {c:Bb} ({r:bVII}).' },
    { id: 'comp-deceptive', front: 'What is a deceptive cadence?', back: '{r:V} to {r:vi} instead of {r:V} to {r:I}: {c:G7} to {c:Am} in {k:C major}. It delays the ending.' },
  ],
};

// ── 2. Writing a melody ─────────────────────────────────────────────────────────────────────────

const writingAMelody: TeacherLesson = {
  id: 'writing-a-melody',
  title: 'Writing a melody',
  teaches: 'A period is a question ending open and an answer ending on the tonic, with one high point reached by step.',
  minutes: 5,
  skill: 'teacher:elena:writing-a-melody',
  steps: [
    {
      type: 'card',
      title: 'A question and an answer',
      body: 'A {t:period} is two phrases, a question and an answer. The first ends open, on a {t:half-cadence|half cadence} or on a note other than the tonic; the second ends closed, on the tonic. My question, in {k:G major}, bars 1 to 4: it stops on {n:D}, over {c:D}.',
      figure: { kind: 'staff', key: 'G major', time: '4/4', notes: staffOf(PERIOD_QUESTION, 'G major', { 0: 'motif', 9: 'motif', 16: 'open' }), caption: 'The question: the motif in bars 1 and 3, open in bar 4.' },
    },
    {
      type: 'choice',
      prompt: 'Why does bar 4 sound open?',
      options: [
        { text: 'It stops on {n:D}, over the dominant {c:D}', correct: true },
        { text: 'It ends on the tonic', why: 'It does not: the tonic is {n:G}, and the question avoids it on purpose.' },
        { text: 'Its last note is short', why: 'It is a half note, as long as any in the phrase. Open is about where it stops, not how long.' },
      ],
      explain: 'A phrase that stops on the dominant asks to go on: a half cadence. The answer must finish the sentence.',
      fact: 'comp-period',
    },
    {
      type: 'card',
      title: 'The answer, and its high point',
      body: 'The answer begins as the question did, then climbs to the one high point of the melody, {n:G} in bar 6, about two thirds of the way through, approached by step: {n:E}, {n:F#}, {n:G}. It closes in bar 8 on {n:G} over {c:G}, after {c:D7}: an authentic cadence.',
      figure: { kind: 'staff', key: 'G major', time: '4/4', notes: staffOf(PERIOD_ANSWER, 'G major', { 0: 'motif', 7: 'peak', 12: 'home' }), caption: 'The answer: the high point in bar 6, home in bar 8.' },
    },
    {
      type: 'choice',
      prompt: 'Where is the high point of my period, and how is it reached?',
      options: [
        { text: 'Bar 6, by step', correct: true },
        { text: 'Bar 8, by leap', why: 'Bar 8 is the low {n:G}: the end, not the peak.' },
        { text: 'Bar 2, by step', why: 'Bar 2 reaches {n:E}; the {n:G} of bar 6 is higher, and it is the only one.' },
      ],
      explain: 'One high point, {n:G} in bar 6, about two thirds of the way through, reached by step from {n:E} and {n:F#}. A leap would announce it; a step earns it.',
      fact: 'comp-high-point',
    },
    {
      type: 'listen-choice',
      prompt: 'Bars 1 to 4. Does the phrase end open or closed?',
      sound: { kind: 'tab', notes: PERIOD_QUESTION, tempo: 84 },
      options: [{ text: 'Open: it asks to go on', correct: true }, { text: 'Closed: it is finished' }],
      shuffle: false,
      explain: 'It stops on {n:D}, the dominant: open. Your ear hears the question before your eye finds the cadence.',
    },
    {
      type: 'listen-choice',
      prompt: 'Bars 5 to 8. Open or closed?',
      sound: { kind: 'tab', notes: PERIOD_ANSWER, tempo: 84 },
      options: [{ text: 'Open: it asks to go on' }, { text: 'Closed: it is finished', correct: true }],
      shuffle: false,
      explain: 'It comes down from the high point by step and lands on {n:G}, the tonic: closed. Question, answer.',
    },
    {
      type: 'card',
      title: 'Repetition is your friend',
      body: 'State a {t:motif}, repeat it, then vary it. My motif is bar 1: {n:D}, {n:B}, {n:C}, {n:D}, down to {n:G}. Bar 3 repeats it with a new last note; bar 5 states it again, so the answer begins as the question did and the listener knows where they are.',
      figure: { kind: 'tab', notes: PERIOD_QUESTION.slice(0, 5), tempo: 84, caption: 'The motif: bar 1, first position.' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the plan of a period.',
      text: 'A ___ that ends open, then an ___ that ends on the tonic, with one ___ point.',
      blanks: ['question', 'answer', 'high'],
      bank: ['chorus', 'coda', 'low'],
      explain: 'Two phrases, a question and an answer, and one high point, about two thirds of the way through.',
      fact: 'comp-period',
    },
    toolTask({
      id: 'write-a-period',
      title: 'Write your period over your progression',
      tool: 'progressions',
      params: ['builder', 'jam'],
      minutes: 8,
      body: 'Loop your eight bars from the last lesson (or {r:I}, {r:IV}, {r:V}, {r:I} in {k:G major}) and write an 8-bar period over them: a motif, its repeat, bar 4 open, one high point in bar 6, home in bar 8. Sing a phrase first, then find it on the guitar, and write it down.',
      tip: 'Sing before you play. The fingers propose what they know; the voice proposes what it wants.',
    }),
    {
      type: 'choice',
      prompt: 'Your bar 4 ends on {n:G}, over {c:G}. What is wrong?',
      options: [
        { text: 'The question closes too early', correct: true },
        { text: 'Nothing: every phrase should end on the tonic', why: 'Then you have two answers and no question.' },
        { text: 'Bar 4 is too short', why: 'Length is not the problem; the destination is.' },
      ],
      explain: 'A question that ends on the tonic is already an answer. Move bar 4 to {n:A} or {n:D} over {c:D}, and the answer has something to do.',
      fact: 'comp-period',
    },
    {
      type: 'card',
      title: 'Bring it into the app',
      body: 'Write it out by hand and photograph it, or type it as tab. In Tools, open Scan & Import: take the photo, or choose Paste tab or chords; proofread the reading, then save. The Player plays your melody back to you, more honestly than your memory does.',
    },
    toolTask({
      id: 'record-period',
      title: 'Perform it over the band, and judge',
      tool: 'progressions',
      params: ['builder', 'jam'],
      minutes: 5,
      body: 'Perform your period over the band and record it on your phone. Listen back once, as a stranger would: does bar 4 ask, and does bar 8 answer? If bar 4 answers too, change its last note and record it again.',
    }),
    {
      type: 'choice',
      prompt: 'Where does a period\'s single high point usually sit in eight bars?',
      options: [
        { text: 'Around bar 6', correct: true },
        { text: 'In bar 1', why: 'Then the melody has nowhere to go but down for seven bars.' },
        { text: 'In bar 8', why: 'Bar 8 is for coming home, usually low.' },
      ],
      explain: 'About two thirds of the way through: late enough to be earned, early enough to come home from.',
      fact: 'comp-high-point',
    },
  ],
  facts: [
    { id: 'comp-period', front: 'What is a period?', back: 'Two phrases: a question that ends open (a half cadence, or a note other than the tonic) and an answer that ends closed, on the tonic.' },
    { id: 'comp-high-point', front: 'Where does a melody\'s high point go, and how is it reached?', back: 'One high point, about two thirds of the way through, approached by step.' },
    { id: 'comp-motif', front: 'What do you do with a motif?', back: 'State it, repeat it, then vary it. Repetition is your friend.' },
  ],
};

// ── 3. Arranging a melody for solo guitar ───────────────────────────────────────────────────────

const arrangingForSoloGuitar: TeacherLesson = {
  id: 'arranging-for-solo-guitar',
  title: 'Arranging a melody for solo guitar',
  teaches: 'Choose a key with the melody on top and open bass strings, then arrange in layers: melody, bass, filling.',
  minutes: 5,
  skill: 'teacher:elena:arranging-for-solo-guitar',
  steps: [
    {
      type: 'card',
      title: 'Choose the key first',
      body: 'Choose the key that puts the melody on the top strings and the bass on open strings where possible. For many tunes that means {k:D major}, {k:G major}, {k:A major}, {k:E major} or {k:C major}: keys whose chords lie in open position, many over an open bass string.',
      figure: { kind: 'circle', key: 'G major', highlight: ['C major', 'D major', 'A major', 'E major'], caption: 'The arranger\'s keys: C, G, D, A and E major, side by side.' },
    },
    {
      type: 'choice',
      prompt: 'Why is {k:D major} kind to an arranger?',
      options: [
        { text: 'Its {c:D} and {c:A} have open bass strings', correct: true },
        { text: 'It has no sharps', why: 'It has two, {n:F#} and {n:C#}. The open strings are the point.' },
        { text: 'Its melodies sit on string 6', why: 'Melodies belong on the top strings; string 6 is for the bass.' },
      ],
      explain: 'The open {n:D} (string 4) and open {n:A} (string 5) give {r:I} and {r:V} a bass that rings by itself, leaving the hand free for the melody.',
      fact: 'comp-arranging-keys',
    },
    {
      type: 'card',
      title: 'Layer 1: the melody alone',
      body: 'Then work in layers. Layer 1 is the melody alone, on the top strings, played until it sings without help. Here are bars 1 and 2 of my period from the last lesson, in {k:G major}.',
      figure: { kind: 'tab', notes: LAYER_MELODY, tempo: 84, caption: 'Layer 1: the melody of bars 1 and 2.' },
    },
    {
      type: 'card',
      title: 'Layer 2: a bass on each strong beat',
      body: 'Layer 2 adds a bass note on each strong beat, beats 1 and 3, mostly the chord\'s root: string 6, fret 3 ({n:G2}) under bar 1, then the open string 4 ({n:D3}), the fifth; in bar 2, string 5, fret 3 ({n:C3}) and {n:G} again. Each bass note rings while the melody moves above it.',
      figure: { kind: 'tab', notes: LAYER_BASS, tempo: 84, caption: 'Layer 2: the bass under bars 1 and 2.' },
    },
    {
      type: 'choice',
      prompt: 'In layer 2, why the open {n:D} on beat 3 of bar 1, not another {n:G}?',
      options: [
        { text: 'It is the chord\'s fifth, and it rings by itself', correct: true },
        { text: 'A bass must change on every beat', why: 'It need not: repeating the root is fine. The open string is the gain.' },
        { text: '{n:D} is the melody note', why: 'The melody\'s {n:D} is an octave higher, on string 2. This is the bass.' },
      ],
      explain: 'The fifth of {c:G} on an open string: the bass moves, the hand stays where the melody needs it.',
      fact: 'comp-layers',
    },
    {
      type: 'card',
      title: 'Layer 3: filling, where the hand allows',
      body: 'Layer 3 adds inner notes, only where the hand allows: here, the rest of the {c:G} chord under the melody\'s {n:D} on beat 1. Simpler is usually better: two good voices beat four crowded ones.',
      figure: { kind: 'chord', symbol: LAYER_FULL.symbol, frets: LAYER_FULL.frets, fingers: LAYER_FULL.fingers, caption: 'Bar 1, beat 1: {c:G}, the melody\'s {n:D} on top.' },
    },
    {
      type: 'choice',
      prompt: 'Your layer 3 needs a six-fret stretch to keep every note. What do you do?',
      options: [
        { text: 'Drop the inner notes; keep melody and bass', correct: true },
        { text: 'Practise the stretch until it works', why: 'Never into pain, and never for a note nobody misses. Arrange for the hand you have.' },
        { text: 'Drop the bass', why: 'The bass and the melody are the arrangement. Inner notes go first.' },
      ],
      explain: 'Inner notes are the first to go. Melody and bass, played well, are already music.',
      fact: 'comp-simpler',
    },
    playerTask({
      id: 'danny-boy-layers',
      title: 'Danny Boy (chord melody) as a model',
      song: 'danny-boy-chord-melody',
      bars: [1, 8],
      minutes: 5,
      body: 'Play the first 8 bars and name the three layers as you hear them: the melody on top, the bass under it, the filling between. Where does the arranger leave a layer out?',
      fallback: {
        tool: 'player',
        params: ['st-chord-melody-1', 'm1-8'],
        title: 'The First Ballad as a model',
        body: 'Danny Boy (chord melody) is not in the library yet; take the First Ballad from my chord-melody lessons. Play bars 1 to 8 and name the layers as you hear them: the melody on top, always the highest note; the bass under it; the filling between. Notice where the melody moves alone.',
      },
    }),
    {
      type: 'true-false',
      statement: 'In a chord-melody arrangement, the melody is always the highest note.',
      answer: true,
      explain: 'The ear follows the top. Put the melody anywhere else and it drowns in its own accompaniment.',
      fact: 'comp-layers',
    },
    playerTask({
      id: 'shenandoah-arrange',
      title: 'Arrange Shenandoah in D',
      song: 'shenandoah',
      minutes: 8,
      body: 'Learn the tune with the Player first. Then arrange it in {k:D major}: layer 1, the melody alone on the top strings; layer 2, a bass on each strong beat, the open {n:D} and {n:A} wherever you can; layer 3, inner notes only where the hand allows. Write each layer down before the next.',
      fallback: {
        tool: 'player',
        params: ['auld-lang-syne'],
        title: 'Arrange Auld Lang Syne in D',
        body: 'Shenandoah is not in the library yet; take another traditional tune in {k:D major}, Auld Lang Syne. In Parts, choose the Tune and learn it. Then arrange it in layers: the melody on top; a bass on each strong beat, the open {n:D} and {n:A} wherever you can; inner notes only where the hand allows.',
      },
    }),
    {
      type: 'card',
      title: 'Hear it, then compare',
      body: 'Write the arrangement out, or type it as tab, and bring it in: Tools, Scan & Import, then save it so the Player can play it back. Record yourself playing it on your phone, and compare both with your plan: where did the hand refuse what the page asked?',
    },
    {
      type: 'order',
      prompt: 'Put the arranger\'s steps in order.',
      tiles: ['Choose the key', 'Melody alone', 'Add the bass', 'Fill in'],
      explain: 'Key first, so that everything after it fits the instrument. Then melody, bass, and filling last, only where the hand allows.',
      fact: 'comp-layers',
    },
  ],
  facts: [
    { id: 'comp-arranging-keys', front: 'Which keys suit an arrangement for solo guitar?', back: '{k:D major}, {k:G major}, {k:A major}, {k:E major} or {k:C major}: the melody on the top strings, the bass on open strings where possible.' },
    { id: 'comp-layers', front: 'The layers of an arrangement, in order?', back: 'The melody alone; then a bass note on each strong beat; then inner notes, only where the hand allows.' },
    { id: 'comp-simpler', front: 'Two voices or four?', back: 'Two good voices beat four crowded ones. Inner notes are the first to go.' },
  ],
};

// ── 4. Piano music on the guitar: ragtime ───────────────────────────────────────────────────────

const ragtimeOnGuitar: TeacherLesson = {
  id: 'ragtime-on-guitar',
  title: 'Piano music on the guitar: ragtime',
  teaches: 'On guitar, ragtime puts the bass in an alternating thumb and the syncopated melody on top; inner notes go.',
  minutes: 5,
  skill: 'teacher:elena:ragtime-on-guitar',
  steps: [
    {
      type: 'card',
      title: 'Two hands into one',
      body: 'Joplin wrote for piano, and a guitar can carry both hands only if the arrangement chooses well: the thumb alternates the bass on the beats, the syncopated melody sits on top, and inner notes go when the hand cannot reach them. The Ragtime Blues in {k:C major} works on that plan. Its thumb, bar 1:',
      figure: { kind: 'tab', notes: RAG_THUMB, tempo: 72, caption: 'The thumb: root, string 4, the alternate bass, string 4.' },
    },
    {
      type: 'choice',
      prompt: 'The hand cannot reach every note of the piano score. What goes first?',
      options: [
        { text: 'The inner notes', correct: true },
        { text: 'The bass', why: 'The bass is the left hand\'s whole job, and the thumb can carry it.' },
        { text: 'The melody', why: 'Without the melody there is no piece left to arrange.' },
      ],
      explain: 'Bass and melody are the two hands of the piano; the inner notes are the luxury. Keep what the ear follows.',
      fact: 'comp-rag-plan',
    },
    {
      type: 'play-phrase',
      prompt: 'The thumb alone, bar 1 twice: string 5 fret 3, string 4 fret 2, string 6 fret 3, string 4 fret 2.',
      notes: [...RAG_THUMB, ...RAG_THUMB],
      octave: 'exact',
      tempo: 72,
      explain: '{n:C}, {n:E}, {n:G}, {n:E}: root, the next string up, the alternate bass, the next string up again. Even and unhurried: it is the floor.',
      alternative: {
        type: 'order',
        prompt: 'Put the thumb\'s four notes of bar 1 in order.',
        tiles: ['{n:C}', '{n:E}', '{n:G}', '{n:E}'],
        distractors: ['{n:A}'],
        explain: 'Root {n:C} on string 5, {n:E} on string 4, the alternate bass {n:G} on string 6, and {n:E} again.',
      },
    },
    {
      type: 'card',
      title: 'The melody on top, off the beat',
      body: 'Over the thumb the tune is syncopated: in bar 1 the {n:G} arrives on the *and* of beat 1 and is held over beat 2, while the thumb plays on. The thumb never waits for the tune; the tune falls between the thumb\'s notes.',
      figure: { kind: 'rhythm', pattern: RAG_TUNE_RHYTHM, time: '4/4', tempo: 72, caption: 'The tune of bar 1: the {n:G} lands on the and of 1.' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap the tune of bar 1 against the click, the long note on the and of 1.',
      rhythm: { pattern: RAG_TUNE_RHYTHM },
      tempo: 72,
      show: 'both',
      explain: 'Short, long, short, then on the beat: the long note starts between the clicks and holds over beat 2. That push is ragtime.',
      fact: 'comp-rag-plan',
    },
    {
      type: 'card',
      title: 'Not fast',
      body: 'Joplin marked The Entertainer *Not fast*; take him at his word. Ragtime that rushes loses the play between the hands. The Entertainer is not in the library; if you own an edition for guitar, bring it in with Scan & Import and learn its A strain the way you will learn the Ragtime Blues here.',
    },
    playerTask({
      id: 'rag-first-half',
      title: 'The Ragtime Blues, bars 1 to 8',
      song: 'st-ragtime-blues-c',
      mode: 'wait',
      bars: [1, 8],
      minutes: 7,
      body: 'The Entertainer\'s nearest study here is the Ragtime Blues: the thumb on every beat, a syncopated tune above. Bars 1 to 8 in wait mode; then the same loop at 56 % (56 BPM) and 72 % (72 BPM). Learn the thumb alone on each chord first, then add the tune a bar at a time.',
      tip: 'If the bass turns lumpy, the thumb is waiting for the tune. Let it walk.',
    }),
    {
      type: 'true-false',
      statement: 'While a syncopated tune note is held, the thumb keeps playing on the beat.',
      answer: true,
      explain: 'Always: the thumb is the clock. The held note rings over it, which is exactly what makes it sound syncopated.',
    },
    playerTask({
      id: 'rag-second-half',
      title: 'Bars 9 to 16, then the whole study',
      song: 'st-ragtime-blues-c',
      mode: 'wait',
      bars: [9, 16],
      minutes: 7,
      body: 'Bars 9 to 16, the cycle again with a new tune, the same way: wait mode, then 56 % (56 BPM) and 72 % (72 BPM). Then the whole study with its ending, at 72 % (72 BPM). Not fast: that is plenty.',
    }),
    {
      type: 'choice',
      prompt: 'The study\'s cycle is {c:C} | {c:A7} | {c:D7} | {c:G7}. What is it?',
      options: [
        { text: 'Dominant sevenths round the circle of fifths', correct: true },
        { text: 'The twelve-bar blues', why: 'The blues uses {r:I}, {r:IV} and {r:V}; this is {r:I}, then {c:A7}, {c:D7} and {c:G7}, each a fifth above the next.' },
        { text: 'Chords borrowed from {k:C minor}', why: '{c:A7} and {c:D7} are secondary dominants, not borrowed chords.' },
      ],
      explain: '{c:A7} points to {c:D7}, {c:D7} to {c:G7}, {c:G7} to {c:C}: each a fifth above the next, the ragtime cycle.',
    },
    {
      type: 'card',
      title: 'The next summit',
      body: 'Maple Leaf Rag, moved from Joplin\'s {k:Ab major} down to {k:G major} for guitar, is the next summit: a long-term project. Bring in a guitar edition you own with Scan & Import and learn its A strain in wait mode, a few bars a week, the thumb first.',
    },
    {
      type: 'choice',
      prompt: 'Maple Leaf Rag moves from {k:Ab major} to {k:G major}. By how much?',
      options: [
        { text: 'A half step down', correct: true },
        { text: 'A whole step down', why: 'A whole step down from {n:Ab} is {n:Gb}.' },
        { text: 'A half step up', why: '{n:G} is below {n:Ab}, not above it.' },
      ],
      explain: '{n:Ab} to {n:G} is one fret: a half step down. Every note moves with it, and the open strings come into reach.',
      fact: 'comp-maple-leaf',
    },
  ],
  facts: [
    { id: 'comp-rag-plan', front: 'How does a guitar carry a piano rag?', back: 'The thumb alternates the bass on the beats, the syncopated melody sits on top, and inner notes go when the hand cannot reach them.' },
    { id: 'comp-not-fast', front: 'How fast is The Entertainer?', back: 'Joplin marked it Not fast. Take him at his word.' },
    { id: 'comp-maple-leaf', front: 'Maple Leaf Rag on the guitar: which key?', back: '{k:G major}, a half step below Joplin\'s {k:Ab major}.' },
  ],
};

// ── 5. Counterpoint: the invention ──────────────────────────────────────────────────────────────

const counterpoint: TeacherLesson = {
  id: 'counterpoint',
  title: 'Counterpoint: the invention',
  teaches: 'Counterpoint is two complete melodies that fit: contrary motion, independent rhythms, consonant strong beats.',
  minutes: 5,
  skill: 'teacher:elena:counterpoint',
  steps: [
    {
      type: 'card',
      title: 'Two melodies, one music',
      body: 'Counterpoint is two melodies that are each complete and that fit together. Three habits make them fit: {t:contrary-motion|contrary motion}, one voice rising as the other falls; independent rhythms, one moving while the other holds; and consonances on the strong beats: thirds, sixths, fifths and octaves.',
    },
    {
      type: 'choice',
      prompt: 'One voice climbs while the other falls. What is that called?',
      options: [
        { text: 'Contrary motion', correct: true },
        { text: 'Parallel motion', why: 'In parallel motion both voices move the same way by the same interval.' },
        { text: 'Oblique motion', why: 'In oblique motion one voice holds while the other moves.' },
      ],
      explain: 'Contrary motion: the strongest way to keep two voices independent, because the ear can follow each line apart.',
      fact: 'comp-counterpoint',
    },
    {
      type: 'choice',
      prompt: 'Which interval belongs on a strong beat between the two voices?',
      options: [
        { text: '{i:M6}', correct: true },
        { text: '{i:M2}', why: 'A second is a dissonance: fine between the beats, as a passing note.' },
        { text: '{i:m7}', why: 'A seventh is a dissonance, and wants to resolve.' },
        { text: '{i:A4}', why: 'The tritone is the most restless dissonance of all.' },
      ],
      explain: 'A sixth is a consonance, like thirds, fifths and octaves: the strong beats rest on them, and the dissonances pass between.',
      fact: 'comp-strong-consonance',
    },
    {
      type: 'card',
      title: 'The subject',
      body: 'It opened your recital in my repertoire unit; now see how it is made. The Two-Voice Invention states a short {t:subject} in one voice and imitates it in the other. Bar 1, the treble alone: {n:E} up to {n:B}, running down to {n:E}, then {n:D#} and {n:B}, and home to {n:E}.',
      figure: { kind: 'staff', key: 'E minor', time: '4/4', notes: staffOf(INVENTION_SUBJECT, 'E minor', { 0: 'subject' }), caption: 'Bar 1: the subject in the treble.' },
    },
    {
      type: 'card',
      title: 'The imitation',
      body: 'Bar 2: the bass takes the subject an octave lower, while the treble goes on with a new line above it, the countersubject. Each voice is a complete melody; together they make the harmony.',
      figure: { kind: 'staff', key: 'E minor', time: '4/4', notes: staffOf(INVENTION_BASS, 'E minor', { 0: 'subject' }), caption: 'Bar 2: the subject in the bass, an octave lower.' },
    },
    {
      type: 'choice',
      prompt: 'In bar 2, how far below the treble\'s statement does the bass take the subject?',
      options: [
        { text: 'An octave', correct: true },
        { text: 'A fifth', why: 'A fifth lower would start on {n:A}. The bass starts on {n:E}.' },
        { text: 'Two octaves', why: 'Two octaves down would start on the low open {n:E}; the bass starts an octave above it, at string 5, fret 7.' },
      ],
      explain: 'Note for note, an octave lower: {n:E} at string 5, fret 7 ({n:E3}), against the treble\'s {n:E} at string 3, fret 9 ({n:E4}).',
      fact: 'comp-invention-plan',
    },
    {
      type: 'order',
      prompt: 'Put the subject\'s first six notes in order.',
      tiles: ['{n:E}', '{n:B}', '{n:A}', '{n:G}', '{n:F#}', '{n:E}'],
      distractors: ['{n:F}'],
      explain: 'Up a fifth to {n:B}, then down by step: {n:A}, {n:G}, {n:F#}, {n:E}. The {n:F} is sharp in {k:E minor}.',
    },
    playerTask({
      id: 'duo-each-line',
      title: 'Each line alone, then both',
      song: 'st-duet-baroque',
      bars: [1, 8],
      tempo: 56,
      minutes: 6,
      body: 'Bach\'s Bourree is not in the library (scan your edition in); its nearest model is the Baroque duo. Bars 1 to 8 at about 60 BPM. In Parts, solo the bass line and play along; then the upper voice; then neither, following each line in turn. Each should sound finished alone.',
    }),
    {
      type: 'true-false',
      statement: 'In the first eight bars of the duo, the two voices share a rhythm only in bar 3 and at the cadence.',
      answer: true,
      explain: 'Bar 3, where the bass walks down with you in quarter notes, and bar 8, where both hold {n:F}. Everywhere else one voice moves while the other holds: independent rhythms.',
      fact: 'comp-counterpoint',
    },
    playerTask({
      id: 'invention-sections',
      title: 'The invention, section by section',
      song: 'st-two-voice-invention',
      mode: 'wait',
      bars: [1, 4],
      minutes: 8,
      body: 'Now the whole invention, section by section, in wait mode. Bars 1 to 4, the subject and its imitation, you know. Then set the loop to bars 5 to 6, 7 to 10 (in {k:G major}), 11 to 16, 17 to 21 and 22 to 24. Keep each held note down its full length while the other voice moves.',
    }),
    {
      type: 'choice',
      prompt: 'Bars 7 to 10 of the invention are in which key?',
      options: [
        { text: '{k:G major}', correct: true },
        { text: '{k:B minor}', why: 'A close neighbour of {k:E minor}, but not this one: the subject returns in bar 9 on {n:G}.' },
        { text: '{k:E major}', why: 'That is only the last chord.' },
      ],
      explain: '{k:G major}, the relative major: the same key signature, a new tonic. Then back to {k:E minor} for the return.',
      fact: 'comp-invention-plan',
    },
    playerTask({
      id: 'invention-whole',
      title: 'The whole invention',
      song: 'st-two-voice-invention',
      tempo: 89,
      minutes: 6,
      body: 'All 24 bars at about 50 BPM, then 100 % (56 BPM), the tempo it is written at. Listen for the subject each time it enters, in either voice.',
    }),
    {
      type: 'card',
      title: 'Now write eight bars',
      body: 'Now yours, on the same plan: a 2-bar subject in the treble, imitated in the bass, eight bars in all. Contrary motion where you can, the voices taking turns to move, a third, sixth, fifth or octave on each strong beat. Write it as tab and bring it in with Scan & Import, so the Player plays it back.',
    },
    {
      type: 'fill-blanks',
      prompt: 'The plan of an invention.',
      text: 'A ___ is stated in one voice and imitated in the ___.',
      blanks: ['subject', 'other'],
      bank: ['chorus', 'same'],
      explain: 'A subject in one voice, imitated in the other; then the music modulates and comes home.',
      fact: 'comp-invention-plan',
    },
  ],
  facts: [
    { id: 'comp-counterpoint', front: 'What makes two melodies counterpoint?', back: 'Each is complete, and they fit: contrary motion, independent rhythms, consonances on the strong beats.' },
    { id: 'comp-strong-consonance', front: 'Which intervals go on a strong beat in two voices?', back: 'Consonances: thirds, sixths, fifths and octaves. Dissonances pass between the beats.' },
    { id: 'comp-invention-plan', front: 'The plan of the Two-Voice Invention?', back: 'A subject in one voice, imitated in the other; a modulation to {k:G major}; back to {k:E minor}.' },
  ],
};

// ── 6. The fugue exposition ─────────────────────────────────────────────────────────────────────

const fugue: TeacherLesson = {
  id: 'fugue',
  title: 'The fugue exposition',
  teaches: 'A fugue exposition brings the subject into each voice in turn: subject, answer at the fifth, a third entry.',
  minutes: 5,
  skill: 'teacher:elena:fugue',
  steps: [
    {
      type: 'card',
      title: 'An exposition',
      body: 'A fugue exposition introduces its subject in each voice in turn: the subject in the tonic, the {t:fugal-answer|answer} at the fifth, then a third entry, while the earlier voices carry on with a {t:countersubject}. The subject of my Fugue Exposition, top voice alone, in {k:D minor}:',
      figure: { kind: 'staff', key: 'D minor', time: '4/4', notes: staffOf(FUGUE_SUBJECT, 'D minor', { 0: 'subject' }), caption: 'Bars 1 and 2: the subject.' },
    },
    {
      type: 'choice',
      prompt: 'On which note does the answer enter?',
      options: [
        { text: '{n:A}, the fifth', correct: true },
        { text: '{n:G}, the fourth', why: 'The subdominant is not where an answer goes. The answer is in the dominant.' },
        { text: '{n:F}, the third', why: 'That is the relative major\'s tonic, not the answer\'s.' },
        { text: '{n:D}, the octave', why: 'Then it would be the subject again, not an answer.' },
      ],
      explain: '{n:A}, the fifth of {k:D minor}: the answer is the subject moved into the dominant, {k:A minor}. On the guitar it enters below, a fourth lower in pitch: the same relation an octave down.',
      fact: 'comp-answer-fifth',
    },
    {
      type: 'card',
      title: 'The answer',
      body: 'Bars 3 to 4: the answer, in the middle voice, in {k:A minor}: every note of the subject a fifth higher in the key, so the leading note {n:C#} becomes {n:G#}. It enters an octave lower, under the subject\'s voice.',
      figure: { kind: 'staff', key: 'A minor', time: '4/4', notes: staffOf(FUGUE_ANSWER, 'A minor', { 0: 'answer' }), caption: 'Bars 3 and 4: the answer, in the middle voice.' },
    },
    {
      type: 'true-false',
      statement: 'The answer is the subject moved a fifth higher in the key, into {k:A minor}.',
      answer: true,
      explain: 'Every note follows: {n:D} becomes {n:A}, {n:F} becomes {n:C}, {n:Bb} becomes {n:F}, the leading note {n:C#} becomes {n:G#}.',
      fact: 'comp-answer-fifth',
    },
    {
      type: 'card',
      title: 'The countersubject',
      body: 'Above the answer the first voice carries on with the countersubject, in steady quarter notes against the answer\'s dotted rhythm and running eighths: independent by design. It returns over the third entry, a fifth lower, so learn it as a melody of its own.',
      figure: { kind: 'staff', key: 'D minor', time: '4/4', notes: staffOf(FUGUE_COUNTERSUBJECT, 'D minor', { 0: 'counter' }), caption: 'Bars 3 and 4: the countersubject, above the answer.' },
    },
    {
      type: 'listen-choice',
      prompt: 'Subject, or countersubject?',
      sound: { kind: 'tab', notes: FUGUE_COUNTERSUBJECT, tempo: 60 },
      options: [{ text: 'The subject' }, { text: 'The countersubject', correct: true }],
      shuffle: false,
      explain: 'Even quarter notes, no dotted rhythm: the countersubject. The subject opens with a quarter note, then a dotted eighth and a sixteenth.',
    },
    {
      type: 'card',
      title: 'The third entry, in the bass',
      body: 'Bars 7 to 8: the third entry, the subject two octaves down in the bass from the open low {n:D}. Only its last note, the leading note {n:C#}, comes back up an octave: the guitar has none lower. Drop D, string 6 down a whole step, puts the tonic itself in the bass.',
      figure: { kind: 'tab', notes: FUGUE_THIRD_ENTRY, tuning: 'drop-d', tempo: 60, caption: 'Drop D: the third entry, bars 7 and 8.' },
    },
    {
      type: 'choice',
      prompt: 'Why is the fugue in drop D?',
      options: [
        { text: 'The third entry starts on the low {n:D}', correct: true },
        { text: 'To make the subject easier', why: 'The subject is on strings 1 to 3, which drop D leaves alone.' },
        { text: 'Every fugue needs it', why: 'Not at all. This one needs its tonic two octaves down.' },
      ],
      explain: 'Standard tuning stops at {n:E2}; the third entry begins on {n:D2}, a whole step lower. Drop D gives it the open string.',
    },
    {
      type: 'choice',
      prompt: 'Three voices on six strings. How do you keep each entry clear?',
      options: [
        { text: 'By its register and its tone colour', correct: true },
        { text: 'By playing the entry much louder', why: 'Loudness alone flattens the other voices. Colour separates them.' },
        { text: 'By leaving the other voices out', why: 'Then it is a melody, not a fugue.' },
      ],
      explain: 'Each voice lives in its own register; give the entering one its own colour too, a rounder thumb in the bass, a brighter stroke on top.',
      fact: 'comp-clear-entries',
    },
    playerTask({
      id: 'fugue-entries',
      title: 'Each entry alone, then two voices',
      song: 'st-fugue-exposition',
      mode: 'wait',
      bars: [1, 2],
      minutes: 10,
      body: 'Tune string 6 down to {n:D} first: the Tuner has drop D. The subject alone: bars 1 to 2, wait mode. The answer and the third entry alone: from my cards, slowly, until each walks by itself. Then two voices: loop bars 3 to 4, the answer with the countersubject above it.',
    }),
    {
      type: 'true-false',
      statement: 'In bars 3 to 4 you play two voices at once: the answer and the countersubject.',
      answer: true,
      explain: 'The answer in the middle voice, the countersubject above it. Hold each note its full length so neither voice breaks.',
    },
    playerTask({
      id: 'fugue-exposition-whole',
      title: 'The whole exposition, slowly',
      song: 'st-fugue-exposition',
      bars: [1, 8],
      tempo: 75,
      minutes: 8,
      body: 'Bars 1 to 8 at about 45 BPM: subject, answer, codetta, third entry, every held note its full length. Hold with the least pressure that sounds; if the hand aches, stop and rest it. The exposition is the fugue\'s argument; the rest can wait.',
    }),
    {
      type: 'card',
      title: 'Away from the guitar',
      body: 'Away from the guitar, sing the subject until it needs no thought. Then hum it while you play the countersubject as bars 7 and 8 have it, a fifth lower: the version made to sound with the subject. Two voices, one musician.',
    },
    {
      type: 'order',
      prompt: 'Put the first four sections of the exposition in order.',
      tiles: ['Subject', 'Answer', 'Codetta', 'Third entry'],
      distractors: ['Coda'],
      explain: 'Subject, answer, a short codetta back to {k:D minor}, then the third entry in the bass. The coda is for the end of a piece.',
      fact: 'comp-exposition',
    },
  ],
  facts: [
    { id: 'comp-exposition', front: 'What happens in a fugue exposition?', back: 'The subject enters in each voice in turn: subject in the tonic, answer at the fifth, a third entry, while earlier voices carry on with the countersubject.' },
    { id: 'comp-answer-fifth', front: 'A fugue in {k:D minor}: on which note does the answer enter?', back: 'On {n:A}, the fifth: the subject moved into {k:A minor}.' },
    { id: 'comp-clear-entries', front: 'Three voices on one guitar: how is each entry kept clear?', back: 'By its register and its tone colour.' },
  ],
};

// ── 7. Composing in DADGAD ──────────────────────────────────────────────────────────────────────

const alternateTunings: TeacherLesson = {
  id: 'alternate-tunings',
  title: 'Composing in DADGAD',
  teaches: 'DADGAD drops strings 6, 2 and 1 a whole step; its open strings drone, and the open chord has no third.',
  minutes: 5,
  skill: 'teacher:elena:alternate-tunings',
  steps: [
    {
      type: 'card',
      title: 'D A D G A D',
      body: '{t:dadgad|DADGAD}, D A D G A D from string 6 to string 1, is the Celtic guitarist\'s tuning: open strings ring as {t:drone|drones} under melodies. From standard, retune strings 6, 2 and 1 down a whole step: {n:E} to {n:D}, {n:B} to {n:A}, {n:E} to {n:D}.',
      figure: { kind: 'fretboard', tuning: 'dadgad', frets: [0, 3], dots: DADGAD_OPEN.map((note, i) => ({ string: 6 - i, fret: 0, note })), caption: 'DADGAD: the open strings, string 6 to string 1.' },
    },
    {
      type: 'choice',
      prompt: 'From standard tuning, which strings go down a whole step?',
      options: [
        { text: 'Strings 6, 2 and 1', correct: true },
        { text: 'String 6 only', why: 'That is drop D. DADGAD goes further.' },
        { text: 'Strings 6, 5 and 4', why: 'Strings 5 and 4 stay at {n:A} and {n:D}: they are already DADGAD\'s.' },
        { text: 'Strings 3, 2 and 1', why: 'String 3 stays at {n:G}.' },
      ],
      explain: 'Strings 6 and 1, {n:E} to {n:D}; string 2, {n:B} to {n:A}. Strings 5, 4 and 3 already are {n:A}, {n:D} and {n:G}.',
      fact: 'comp-dadgad',
    },
    {
      type: 'card',
      title: 'Neither major nor minor',
      body: 'Strum the open strings: {n:D}, {n:A} and {n:G}, and no third. The open chord is neither major nor minor until a finger adds the third: {n:F#} makes it major, {n:F} minor. So forget your shapes, and listen.',
      figure: { kind: 'audio', sound: { kind: 'notes', notes: [...DADGAD_OPEN], together: true }, label: 'Hear open DADGAD' },
    },
    {
      type: 'choice',
      prompt: 'Which note turns the open DADGAD chord into {c:D}?',
      options: [
        { text: '{n:F#}', correct: true },
        { text: '{n:F}', why: '{n:F} is the minor third: it makes {c:Dm}.' },
        { text: '{n:E}', why: '{n:E} is the second: still no third.' },
        { text: '{n:C}', why: '{n:C} is a seventh: still no third.' },
      ],
      explain: '{n:F#}, the major third above {n:D}. Add it and the open strings become {c:D} with a {n:G} in it; leave it out and they drone in no mood at all.',
      fact: 'comp-dadgad-chord',
    },
    {
      type: 'fretboard-find',
      prompt: 'In DADGAD, tap every {n:F#} from the open strings to fret 5.',
      find: { note: 'F#' },
      mode: 'all',
      octave: 'any',
      frets: [0, 5],
      tuning: 'dadgad',
      explain: 'Three, all at fret 4: on strings 6, 4 and 1, the three {n:D} strings. Each {n:D} string has its major third four frets up.',
      fact: 'comp-dadgad-chord',
    },
    toolTask({
      id: 'tune-dadgad',
      title: 'Retune to DADGAD',
      tool: 'tuner',
      minutes: 3,
      body: 'Now retune, before you play a note in it. In the Tuner, change the tuning to DADGAD and bring strings 6, 2 and 1 down a whole step: {n:D}, {n:A}, {n:D}. Go a little below each note and come back up to it, so the string holds its pitch.',
    }),
    {
      type: 'card',
      title: 'The scale in DADGAD',
      body: 'The {k:D major} scale in DADGAD at frets 0 to 5: several of its notes are open strings. The fingerings of standard tuning are gone; the frets are new. Let the open strings ring under every fretted note.',
      figure: { kind: 'fretboard', tuning: 'dadgad', frets: [0, 5], derive: { scale: 'major', tonic: 'D' }, caption: '{k:D major} in DADGAD, frets 0 to 5.' },
    },
    {
      type: 'play-phrase',
      prompt: 'Retuned? Play {k:D major} up from the open string 4: frets 0 2 4, string 3 frets 0 2 4, string 2 frets 4 and 5.',
      notes: DADGAD_SCALE,
      octave: 'exact',
      tempo: 72,
      tuning: 'dadgad',
      explain: '{n:D}, {n:E}, {n:F#} on string 4; {n:G}, {n:A}, {n:B} on string 3; {n:C#}, {n:D} on string 2. Two open strings among eight notes, and the others ring on.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'In DADGAD, tap every note of {k:D major} on strings 4 to 2, frets 0 to 5.',
        find: { scale: 'major', tonic: 'D' },
        mode: 'all',
        octave: 'any',
        frets: [0, 5],
        strings: [4, 3, 2],
        tuning: 'dadgad',
        explain: 'String 4: 0 2 4 5; string 3: 0 2 4; string 2: 0 2 4 5. Open strings carry three of the scale\'s notes.',
      },
    },
    {
      type: 'true-false',
      statement: 'In DADGAD, strings 5 and 2 are both open {n:A}, an octave apart.',
      answer: true,
      explain: 'String 5 is {n:A2}, string 2 {n:A3}: an octave. DADGAD doubles its {n:D} and its {n:A}, which is why it rings so.',
    },
    playerTask({
      id: 'dadgad-air',
      title: 'The DADGAD Air, for its drones',
      song: 'st-dadgad-air',
      tempo: 79,
      minutes: 6,
      body: 'The DADGAD Air at about 60 BPM, then 100 % (76 BPM). You met it in my lesson on longer forms; tonight, listen to its drones. In bar 1 the open low {n:D} and the open {n:A} of string 2 ring under the tune.',
    }),
    {
      type: 'choice',
      prompt: 'In bar 1 of the Air, which open strings ring under the tune?',
      options: [
        { text: 'String 6 and string 2', correct: true },
        { text: 'String 5 and string 4', why: 'Those come later; bar 1 rings on strings 6 and 2.' },
        { text: 'String 1 alone', why: 'String 1 carries the tune itself in bar 1.' },
      ],
      explain: 'The open low {n:D} (string 6) and the open {n:A} (string 2), struck together on beat 1 and left ringing while the tune moves on string 1.',
      fact: 'comp-drones',
    },
    {
      type: 'card',
      title: 'Your own air',
      body: 'Now compose: an 8-bar air in DADGAD with at least two open strings ringing as drones. Write the tab with the tuning above it, as below, and bring it in with Scan & Import (Paste tab or chords) to hear it back. Then tune back to standard: the rest of the course is in it.',
      figure: { kind: 'tab', notes: DADGAD_TUNE, tuning: 'dadgad', time: '3/4', tempo: 60, caption: 'The Air\'s tune, bars 1 and 2: every fret a DADGAD fret.' },
    },
    toolTask({
      id: 'tune-standard',
      title: 'Back to standard tuning',
      tool: 'tuner',
      minutes: 2,
      body: 'Change the Tuner back to standard and bring strings 6, 2 and 1 up a whole step: {n:E}, {n:B}, {n:E}. Check all six again a minute later: strings that were just raised tend to sink a little.',
    }),
    {
      type: 'true-false',
      statement: 'The open DADGAD chord is {c:Dm}.',
      answer: false,
      explain: 'It has no third at all: {n:D}, {n:A} and {n:G}. A finger on {n:F} would make it minor, on {n:F#} major.',
      fact: 'comp-dadgad-chord',
    },
  ],
  facts: [
    { id: 'comp-dadgad', front: 'DADGAD from standard tuning: what changes?', back: 'Strings 6, 2 and 1 go down a whole step: D A D G A D from string 6 to string 1.' },
    { id: 'comp-dadgad-chord', front: 'The open DADGAD chord: major or minor?', back: 'Neither: {n:D}, {n:A} and {n:G}, no third. {n:F#} makes it major, {n:F} minor.' },
    { id: 'comp-drones', front: 'What is a drone in DADGAD?', back: 'An open string left ringing under the melody, such as the low {n:D} or the open {n:A}.' },
  ],
};

// ── The unit ────────────────────────────────────────────────────────────────────────────────────

const unit: TeacherUnit = {
  id: 'elena-composition-and-arranging',
  title: 'Composition and arranging',
  theme: 'composition',
  description: 'Write progressions and melodies, arrange for solo guitar, play ragtime and counterpoint, and compose in DADGAD.',
  lessons: [writingProgressions, writingAMelody, arrangingForSoloGuitar, ragtimeOnGuitar, counterpoint, fugue, alternateTunings],
  glossary: [
    { id: 'period', term: 'period', definition: 'Two phrases, a question that ends open and an answer that ends closed, on the tonic.' },
    { id: 'half-cadence', term: 'half cadence', definition: 'A phrase ending on the dominant chord: it sounds open, asking to go on.' },
    { id: 'motif', term: 'motif', definition: 'A short musical idea, a few notes long, that a melody states, repeats and varies.' },
    { id: 'contrary-motion', term: 'contrary motion', definition: 'Two voices moving in opposite directions: one rises while the other falls.' },
    { id: 'subject', term: 'subject', definition: 'The main theme of an invention or a fugue, imitated by the other voices.' },
    { id: 'fugal-answer', term: 'answer', definition: 'In a fugue, the second entry of the subject, moved to the dominant (a fifth higher in the key).' },
    { id: 'countersubject', term: 'countersubject', definition: 'The line a voice plays against the subject or answer after its own entry, written to fit it.' },
    { id: 'dadgad', term: 'DADGAD', definition: 'A tuning, D A D G A D from string 6 to string 1: standard with strings 6, 2 and 1 a whole step down.' },
    { id: 'drone', term: 'drone', definition: 'A note that keeps sounding under a melody, often an open string left ringing.' },
  ],
};

export default unit;
