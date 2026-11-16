/**
 * Mia, unit 8: Riffs and melodies on all six strings (plan: `mia/mia-riffs-and-melodies` in
 * src/content/plan/teachers.json).
 *
 * The first notes on strings 4, 5 and 6, hammer-ons and pull-offs in two licks, Deck the Halls
 * and the first sharp (F# on string 4, fret 4), Joy to the World as the D major scale walking
 * down, a first fiddle tune flatpicked down on the beat and up on the &, and Für Elise as the
 * first showpiece. Every lesson follows its plan entry: the plan's `explain` in Mia's voice on the
 * cards, its `show` as figures, its `practice` as exercises (`Mic` with a tapping alternative) or
 * tasks that send the learner to the Player, the Fretboard trainer or Technique and back. Play
 * steps show octave note names (E2), so every prompt also says the string and fret.
 *
 * Music from the song library: First Notes on Strings 4, 5 and 6 (72 BPM), Sakura (66), Lick:
 * Hammer-Ons and Lick: Pull-Offs (80), Deck the Halls (108), Joy to the World (72), Eine kleine
 * Nachtmusik (96) and Für Elise (60 quarters, 120 eighth-note counts). The Rakes of Mallow is not
 * in the library yet: its tasks name it and fall back to the G major picking exercise (the notes
 * the tune is made of, picked down-up in eighths) and to the tune of Drunken Sailor (a 2/4 tune
 * of quarters and straight eighths, every note on a beat or an &, which the learner strummed in
 * unit 4), at the repertoire plan's tempo (80). The library's Für Elise has no left-hand part, so
 * the learner plays it with the click; its Joy to the World is the whole carol, verses 1 and 2.
 * `mia-riffs-and-melodies.test.ts` checks every phrase against the library and every
 * "string N, fret M" against the neck.
 */
import type { TabNote } from '@/lessons';
import type { TeacherLesson, TeacherUnit } from '../types';
import { playerTask, techniqueTask, toolTask } from '../tasks';

/** The first notes on strings 6, 5 and 4: open and frets 1 to 3. */
export const LOW_NOTES = [
  { string: 6, fret: 0, note: 'E2' },
  { string: 6, fret: 1, note: 'F2' },
  { string: 6, fret: 3, note: 'G2' },
  { string: 5, fret: 0, note: 'A2' },
  { string: 5, fret: 2, note: 'B2' },
  { string: 5, fret: 3, note: 'C3' },
  { string: 4, fret: 0, note: 'D3' },
  { string: 4, fret: 2, note: 'E3' },
  { string: 4, fret: 3, note: 'F3' },
] as const;

/** Lick: Hammer-Ons, bar 7: the four hammer-ons in a row (open string, then the hammered fret). */
export const HAMMER_ALL: TabNote[] = [
  { string: 4, fret: 0, duration: 'e' },
  { string: 4, fret: 2, duration: 'e' },
  { string: 3, fret: 0, duration: 'e' },
  { string: 3, fret: 2, duration: 'e' },
  { string: 2, fret: 0, duration: 'e' },
  { string: 2, fret: 3, duration: 'e' },
  { string: 1, fret: 0, duration: 'e' },
  { string: 1, fret: 3, duration: 'e' },
];

/** The three pull-offs of Lick: Pull-Offs, each from the fretted note to the open string. */
export const PULL_OFFS: TabNote[] = [
  { string: 1, fret: 3, duration: 'e' },
  { string: 1, fret: 0, duration: 'e' },
  { string: 2, fret: 3, duration: 'e' },
  { string: 2, fret: 0, duration: 'e' },
  { string: 3, fret: 2, duration: 'e' },
  { string: 3, fret: 0, duration: 'q' },
];

/** One hammer-on, the open string 3 to fret 2, five times. */
const HAMMER_FIVE: TabNote[] = Array.from({ length: 5 }, () => [
  { string: 3, fret: 0, duration: 'e' },
  { string: 3, fret: 2, duration: 'e' },
]).flat();

/** Deck the Halls, bars 1 and 2: from string 2, fret 3 down the scale. */
export const DECK_OPENING: TabNote[] = [
  { string: 2, fret: 3, duration: 'q.' },
  { string: 2, fret: 1, duration: 'e' },
  { string: 2, fret: 0, duration: 'q' },
  { string: 3, fret: 2, duration: 'q' },
  { string: 3, fret: 0, duration: 'q' },
  { string: 3, fret: 2, duration: 'q' },
  { string: 2, fret: 0, duration: 'q' },
  { string: 3, fret: 0, duration: 'q' },
];

/** F# on string 4, fret 4, rising to the open G, five times. */
const F_SHARP_TO_G: TabNote[] = Array.from({ length: 5 }, () => [
  { string: 4, fret: 4, duration: 'q' },
  { string: 3, fret: 0, duration: 'q' },
]).flat();

/** Joy to the World, bars 1 to 4 as the library has them: the D major scale stepping down, then "Let". */
export const JOY_PHRASE: TabNote[] = [
  { string: 2, fret: 3, duration: 'q' },
  { string: 2, fret: 2, duration: 'e.' },
  { string: 2, fret: 0, duration: 's' },
  { string: 3, fret: 2, duration: 'q.' },
  { string: 3, fret: 0, duration: 'e' },
  { string: 4, fret: 4, duration: 'q' },
  { string: 4, fret: 2, duration: 'q' },
  { string: 4, fret: 0, duration: 'q.' },
  { string: 3, fret: 2, duration: 'e' },
];

/** The eight notes of the scale, top to bottom, as even quarter notes. */
export const JOY_SCALE: TabNote[] = JOY_PHRASE.slice(0, 8).map((n) => ({ ...n, duration: 'q' }));

/** Eine kleine Nachtmusik, bars 1 and 2: the G chord's notes, rests included. */
export const NACHTMUSIK_OPENING: TabNote[] = [
  { string: 3, fret: 0, duration: 'q' },
  { rest: true, duration: 'e' },
  { string: 4, fret: 0, duration: 'e' },
  { string: 3, fret: 0, duration: 'q' },
  { rest: true, duration: 'e' },
  { string: 4, fret: 0, duration: 'e' },
  { string: 3, fret: 0, duration: 'e' },
  { string: 4, fret: 0, duration: 'e' },
  { string: 3, fret: 0, duration: 'e' },
  { string: 2, fret: 0, duration: 'e' },
  { string: 2, fret: 3, duration: 'q' },
  { rest: true, duration: 'q' },
];

/** Für Elise, the rocking opening: the pickup, bar 1 and the A that ends the figure. */
export const ELISE_OPENING: TabNote[] = [
  { string: 1, fret: 0, duration: 's' },
  { string: 2, fret: 4, duration: 's' },
  { string: 1, fret: 0, duration: 's' },
  { string: 2, fret: 4, duration: 's' },
  { string: 1, fret: 0, duration: 's' },
  { string: 2, fret: 0, duration: 's' },
  { string: 2, fret: 3, duration: 's' },
  { string: 2, fret: 1, duration: 's' },
  { string: 3, fret: 2, duration: 'e' },
];

/** Für Elise, the two answers: the Am chord climbed from string 5, then the E chord with its G#. */
export const ELISE_ANSWERS: TabNote[] = [
  { string: 3, fret: 2, duration: 'e' },
  { rest: true, duration: 's' },
  { string: 5, fret: 3, duration: 's' },
  { string: 4, fret: 2, duration: 's' },
  { string: 3, fret: 2, duration: 's' },
  { string: 2, fret: 0, duration: 'e' },
  { rest: true, duration: 's' },
  { string: 4, fret: 2, duration: 's' },
  { string: 3, fret: 1, duration: 's' },
  { string: 2, fret: 0, duration: 's' },
];

/** The show: the pickup and bars 1 to 3 as the library has them (16 notes). */
export const ELISE_SHOW: TabNote[] = [...ELISE_OPENING.slice(0, 8), ...ELISE_ANSWERS];

// ── 1. Notes on the low strings ─────────────────────────────────────────────────────────────────

const lowStringNotes: TeacherLesson = {
  id: 'low-string-notes',
  title: 'Notes on the low strings',
  teaches: 'String 4: D, E, F at 0, 2, 3. String 5: A, B, C at 0, 2, 3. String 6: E, F, G at 0, 1, 3.',
  minutes: 5,
  skill: 'teacher:mia:low-string-notes',
  steps: [
    {
      type: 'card',
      title: 'Bass lines and riffs',
      body: 'The thick strings carry bass lines and {t:riff|riffs}: short patterns repeated through a song. String 4: the open {n:D}, fret 2 {n:E}, fret 3 {n:F}. String 5: the open {n:A}, fret 2 {n:B}, fret 3 {n:C}. String 6: the open {n:E}, fret 1 {n:F}, fret 3 {n:G}.',
      figure: { kind: 'fretboard', frets: [0, 3], dots: [...LOW_NOTES], caption: 'Strings 6, 5 and 4: the open string, then frets 1 to 3.' },
    },
    {
      type: 'fretboard-name',
      prompt: 'Which note is string 5, fret 3?',
      position: { string: 5, fret: 3 },
      ask: 'note',
      spelling: 'any',
      options: ['C', 'B', 'D', 'A'],
      explain: 'String 5, fret 3 is {n:C}: the open {n:A}, then {n:B} at fret 2, then {n:C} just one fret higher.',
      fact: 'low-string-notes',
    },
    {
      type: 'card',
      title: 'One fret apart, again',
      body: 'Look at the frets: again, {n:E} to {n:F} and {n:B} to {n:C} are only one fret apart. A one-fret step is a {t:half-step|half step}, and these two are the only half steps between neighbouring letters. Every other pair is two frets apart: {n:D} to {n:E} on string 4, {n:A} to {n:B} on string 5, {n:F} to {n:G} on string 6.',
      tip: 'That is why string 6 has {n:F} at fret 1 but string 4 has {n:E} at fret 2.',
    },
    {
      type: 'true-false',
      statement: 'On string 6, {n:F} is at fret 1 because {n:E} to {n:F} is a half step: one fret.',
      answer: true,
      explain: '{n:E} and {n:F} are neighbours with no note between them, so they sit one fret apart. {n:F} to {n:G} is two frets: {n:G} is at fret 3.',
      fact: 'low-half-steps',
    },
    { generate: 'play-note', params: { strings: [6, 5, 4], frets: [0, 3], naturals: true } },
    { generate: 'play-note', params: { strings: [6, 5, 4], frets: [0, 3], naturals: true } },
    playerTask({
      id: 'string-4-study',
      title: 'First Notes on String 4',
      song: 'st-first-notes-string-4',
      mode: 'wait',
      minutes: 3,
      body: 'The open {n:D}, fret 2 {n:E} with finger 2, fret 3 {n:F} with finger 3. Wait mode first; then switch to Flow and play it at 72 BPM with the teacher\'s chords.',
    }),
    { generate: 'play-note', params: { strings: [6, 5, 4], frets: [0, 3], naturals: true } },
    playerTask({
      id: 'string-5-study',
      title: 'First Notes on String 5',
      song: 'st-first-notes-string-5',
      mode: 'wait',
      minutes: 3,
      body: 'The open {n:A}, fret 2 {n:B}, fret 3 {n:C}, low and march-like. Wait mode first; then switch to Flow and play it at 72 BPM with the teacher\'s chords.',
    }),
    {
      type: 'fretboard-find',
      prompt: 'Tap {n:G} on string 6.',
      find: { note: 'G2' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 3],
      strings: [6],
      explain: 'String 6, fret 3 is {n:G}: the open {n:E}, {n:F} at fret 1, then two frets up to {n:G}.',
      fact: 'low-string-notes',
    },
    playerTask({
      id: 'string-6-study',
      title: 'First Notes on String 6',
      song: 'st-first-notes-string-6',
      mode: 'wait',
      minutes: 3,
      body: 'The open {n:E}, fret 1 {n:F} with finger 1, fret 3 {n:G} with finger 3. Wait mode first; then switch to Flow and play it at 72 BPM with the teacher\'s chords.',
    }),
    toolTask({
      id: 'string-6-sprint',
      title: 'The string 6 game',
      tool: 'fretboard',
      params: ['drill', 'sprint'],
      minutes: 2,
      body: 'Tap Change beside the practice settings: keep only string 6, frets 0 to 3, natural notes. Then start the minute and name as many notes as you can.',
    }),
    { generate: 'play-note', params: { strings: [6, 5, 4], frets: [0, 3], naturals: true } },
    playerTask({
      id: 'sakura',
      title: 'Sakura, Sakura',
      song: 'sakura',
      mode: 'wait',
      minutes: 4,
      body: 'A Japanese melody that uses string 4, fret 2 ({n:E}), string 4, fret 3 ({n:F}) and string 5, fret 2 ({n:B}) among its notes. Play it slowly in wait mode, letting each long note ring for its full length.',
      tip: 'Where the Player shows a wavy line over a long note, just hold the note still for now.',
    }),
    {
      type: 'choice',
      prompt: 'What is a riff?',
      options: [
        { text: 'A short pattern repeated through a song', correct: true },
        { text: 'One long note held to the end', why: 'A riff is a pattern of several notes, and it comes back again and again.' },
        { text: 'A chord played on the thick strings', why: 'A riff is single notes in a pattern, often on the low strings.' },
      ],
      explain: 'A riff is a short pattern that keeps coming back through a song, often on the low strings, where bass lines live.',
      fact: 'riff-defined',
    },
  ],
  facts: [
    { id: 'low-string-notes', front: 'The first notes on strings 4, 5 and 6?', back: 'String 4: {n:D} {n:E} {n:F} (open, 2, 3). String 5: {n:A} {n:B} {n:C} (open, 2, 3). String 6: {n:E} {n:F} {n:G} (open, 1, 3).' },
    { id: 'low-half-steps', front: 'On the low strings, which neighbouring notes are one fret apart?', back: '{n:E} to {n:F} and {n:B} to {n:C}: the only half steps between neighbouring letters. Every other pair is two frets apart.' },
    { id: 'riff-defined', front: 'What is a riff?', back: 'A short pattern repeated through a song, often on the low strings.' },
  ],
};

// ── 2. Hammer-ons and pull-offs ─────────────────────────────────────────────────────────────────

const hammerOnsAndPullOffs: TeacherLesson = {
  id: 'hammer-ons-and-pull-offs',
  title: 'Hammer-ons and pull-offs',
  teaches: 'Pick once, play two notes: hammer a finger down for the higher one, or pluck as it leaves for the lower one.',
  minutes: 5,
  skill: 'teacher:mia:hammer-ons-and-pull-offs',
  steps: [
    {
      type: 'card',
      id: 'hammer-on',
      title: 'The hammer-on',
      art: 'fretting',
      body: 'A {t:hammer-on} sounds a note without picking it. Pick the open string, then bring a finger down hard and fast onto the string, just behind the fret wire. The string is still ringing, so the new note sounds.',
      tip: 'Speed makes it loud, not force. Hammer from just above the string.',
    },
    {
      type: 'choice',
      prompt: 'What makes a hammered note loud and clear?',
      options: [
        { text: 'A fast finger, landing just behind the fret', correct: true },
        { text: 'Squeezing the string as hard as you can', why: 'Force only tires the hand. Speed, and landing right behind the fret, make the note ring.' },
        { text: 'Picking the string again', why: 'Then it is not a hammer-on. The finger alone makes the second note.' },
      ],
      explain: 'Bring the finger down quickly, from just above the string, right behind the fret wire. Speed makes the note, not pressure.',
      fact: 'hammer-on',
    },
    {
      type: 'card',
      title: 'Your first lick',
      body: 'Hammer-ons make lines smooth, and they are your first step into lead guitar. Today you use them in two {t:lick|licks}: short phrases you learn once and reuse. In this one, pick each open string and hammer on: string 4 to fret 2, string 3 to fret 2, string 2 to fret 3, string 1 to fret 3.',
      figure: { kind: 'tab', tempo: 60, notes: [...HAMMER_ALL], caption: 'Pick the open string, hammer the fretted note: one pick for each pair.' },
    },
    {
      type: 'play-phrase',
      prompt: 'Pick the open string 3, then hammer finger 2 onto fret 2 ({n:A}). Five times. The microphone listens for both notes.',
      notes: [...HAMMER_FIVE],
      octave: 'exact',
      tempo: 60,
      explain: 'The open {n:G}, then {n:A} at string 3, fret 2, from one pick stroke. If the {n:A} was faint, hammer faster and closer to the fret.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap the note your hammer-on lands on: string 3, fret 2.',
        find: { note: 'A3' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 3],
        explain: 'String 3, fret 2 is {n:A}, two frets above the open {n:G}.',
      },
    },
    playerTask({
      id: 'hammer-lick',
      title: 'Lick: Hammer-Ons',
      song: 'st-lick-hammer-on',
      tempo: 75,
      minutes: 3,
      body: 'Play it at 60 BPM. Pick only the first note of each pair; the hammered notes come from your fingers. Frets 2 and 3 are fingers 2 and 3.',
    }),
    {
      type: 'card',
      title: 'The pull-off',
      body: 'A {t:pull-off} is the reverse. With your finger on the fret, pick that note, then let the finger pluck the string slightly sideways as it leaves, toward the floor, so the lower note sounds. Lifting straight up only stops the note.',
      figure: { kind: 'tab', tempo: 60, notes: [...PULL_OFFS], caption: 'Pick the fretted note, pull off to the open string: one pick for each pair.' },
    },
    {
      type: 'true-false',
      statement: 'For a pull-off, you lift the finger straight up off the string.',
      answer: false,
      explain: 'Straight up only stops the note. Pull slightly sideways, toward the floor, so the finger plucks the string as it leaves.',
      fact: 'pull-off',
    },
    {
      type: 'fretboard-name',
      prompt: 'You pick string 2, fret 3 and pull off to the open string. Which note sounds after the pull-off?',
      position: { string: 2, fret: 0 },
      ask: 'note',
      spelling: 'any',
      options: ['B', 'D', 'C', 'A'],
      explain: 'The pull-off lands on the open string 2, {n:B}. The picked note was {n:D}, at fret 3.',
    },
    playerTask({
      id: 'pull-lick',
      title: 'Lick: Pull-Offs',
      song: 'st-lick-pull-off',
      tempo: 75,
      minutes: 3,
      body: 'Play it at 60 BPM. Pick only the fretted note; the finger plucks the open note as it leaves. Bars 5 to 7 chain hammer-ons and pull-offs on one string: pick once, and let the fingers do the rest.',
    }),
    {
      type: 'match-pairs',
      prompt: 'Match each sign in tab with what it means.',
      pairs: [
        { left: 'h', right: 'Hammer-on: no pick' },
        { left: 'p', right: 'Pull-off: no pick' },
        { left: '0', right: 'The open string' },
      ],
      explain: 'In tab, h between two notes means hammer on, p means pull off, and 0 is the open string. Only the first note of an h or p pair is picked.',
    },
    techniqueTask({
      id: 'legato-chains',
      title: 'Hammer and Pull Chains',
      exercise: 'tech-legato-chains',
      minutes: 4,
      body: 'Slowly, one string at a time, at 60 BPM. It sits higher up the neck, at frets 5, 7 and 8 with fingers 1, 3 and 4: pick fret 5, hammer 7 and 8, then pick 8 and pull off to 7 and 5.',
      tip: 'If your hand aches, stop and shake it out. Sore fingertips are normal; aching joints are not.',
    }),
    {
      type: 'choice',
      prompt: 'In the hammer-on lick, how many times do you pick for each pair of notes?',
      options: [
        { text: 'Once, for the first note', correct: true },
        { text: 'Twice, once for each note', why: 'The second note is hammered: your finger plays it, not the pick.' },
        { text: 'Not at all', why: 'The first note of each pair is picked; the finger makes only the second.' },
      ],
      explain: 'One pick, two notes: the pick plays the open string and the hammering finger plays the second note.',
      fact: 'hammer-on',
    },
  ],
  facts: [
    { id: 'hammer-on', front: 'How do you play a hammer-on?', back: 'Pick the first note, then bring a finger down hard and fast just behind the fret: the second note sounds without a pick.' },
    { id: 'pull-off', front: 'How do you play a pull-off?', back: 'Pick the fretted note, then pull the finger slightly sideways as it leaves, plucking the string: the lower note sounds.' },
    { id: 'lick-defined', front: 'What is a lick?', back: 'A short phrase you learn once and reuse.' },
  ],
};

// ── 3. Deck the Halls and your first F# ─────────────────────────────────────────────────────────

const deckTheHalls: TeacherLesson = {
  id: 'deck-the-halls',
  title: 'Deck the Halls and your first F sharp',
  teaches: 'A sharp raises a note by one fret: F sharp is at string 4, fret 4, one fret above F, played with finger 4.',
  minutes: 5,
  skill: 'teacher:mia:deck-the-halls',
  steps: [
    {
      type: 'card',
      title: 'Stepping down',
      body: 'Lines 1, 2 and 4 of Deck the Halls start high, on string 2, fret 3 ({n:D}), and step down the {t:scale}, one note to the next: {n:D} {n:C} {n:B} {n:A}, then {n:G}. Your hand stays in first position: finger 1 for fret 1, 2 for fret 2, 3 for fret 3.',
      figure: { kind: 'tab', tempo: 108, notes: [...DECK_OPENING], caption: '"Deck the halls with boughs of holly": two bars, stepping down from {n:D}.' },
    },
    {
      type: 'true-false',
      statement: 'The first line of Deck the Halls starts low, on the open string 3, and climbs.',
      answer: false,
      explain: 'It starts high, on string 2, fret 3 ({n:D}), and steps down: {n:D} {n:C} {n:B} {n:A}, then {n:G}. Lines 2 and 4 start the same way.',
    },
    {
      type: 'card',
      title: 'Your first sharp',
      body: 'At the end of the fa-la-la line comes a new note: {n:F#}, at string 4, fret 4, played with finger 4, rising to the open {n:G}. A {t:sharp} raises a note by one fret: {n:F} is at fret 3, so {n:F#} is at fret 4. It is written with the sign #.',
      figure: {
        kind: 'fretboard',
        frets: [0, 4],
        labels: 'note',
        dots: [
          { string: 4, fret: 3, note: 'F3', role: 'ghost' },
          { string: 4, fret: 4, note: 'F#3', finger: 4, role: 'target' },
          { string: 3, fret: 0, note: 'G3' },
        ],
        caption: '{n:F} at fret 3, {n:F#} one fret higher, then up to the open {n:G}.',
      },
      tip: 'You met the word on the Tuner: sharp meant too high. Same idea here: one fret higher.',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap {n:F#} on string 4.',
      find: { note: 'F#3' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 5],
      strings: [4],
      explain: 'String 4, fret 4 is {n:F#}: one fret above {n:F} at fret 3.',
      fact: 'f-sharp-string-4',
    },
    {
      type: 'play-note',
      prompt: 'Play {n:F#}: string 4, fret 4, with finger 4. Let it ring.',
      note: 'F#3',
      octave: 'exact',
      where: { string: 4, fret: 4 },
      explain: 'String 4, fret 4 is {n:F#}. Finger 4 stands on its tip, just behind the fret wire.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap {n:F#}: string 4, fret 4.',
        find: { note: 'F#3' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 5],
        explain: 'String 4, fret 4 is {n:F#}, one fret above {n:F}.',
      },
    },
    {
      type: 'play-phrase',
      prompt: '{n:F#} on string 4, fret 4, then the open string 3 ({n:G}): five times, as at the end of the fa-la-la line.',
      notes: [...F_SHARP_TO_G],
      octave: 'exact',
      tempo: 72,
      explain: '{n:F#} leans up into {n:G}, one fret apart. Lift finger 4 as you pick the open string 3.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap the note {n:F#} rises to: the open string 3.',
        find: { note: 'G3' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 5],
        explain: 'The open string 3 is {n:G}: the home note that {n:F#} leads to.',
      },
    },
    {
      type: 'true-false',
      statement: 'A sharp raises a note by two frets.',
      answer: false,
      explain: 'One fret: {n:F} at string 4, fret 3 becomes {n:F#} at fret 4. Two frets up from {n:F} would be {n:G}.',
      fact: 'sharp-one-fret',
    },
    playerTask({
      id: 'deck-wait',
      title: 'Deck the Halls in wait mode',
      song: 'deck-the-halls',
      mode: 'wait',
      minutes: 4,
      body: 'Play the whole tune in wait mode: the music waits for each right note. Watch for {n:F#} near the end of lines 1 and 2: string 4, fret 4, finger 4.',
      tip: 'Line 3 has two more sharps: {n:C#} at string 2, fret 2, and {n:F#} at string 1, fret 2. Same rule: one fret up.',
    }),
    {
      // Two pairs, so the ear has something to compare: F# to G first, then F to G.
      id: 'hear-f-sharp',
      type: 'listen-choice',
      prompt: 'Mia plays two pairs of notes, each rising to {n:G}. Which pair starts on {n:F#}?',
      sound: { kind: 'notes', notes: ['F#3', 'G3', 'F3', 'G3'], tempo: 60 },
      options: [
        { text: 'The first pair', correct: true },
        { text: 'The second pair', why: 'The second pair was the wider step: {n:F} to {n:G}, two frets. The first was the small one.' },
      ],
      shuffle: false,
      explain: 'The first pair was {n:F#} to {n:G}, one fret: a small step that leans in and settles. The second was {n:F} to {n:G}, two frets, and its step up sounds wider.',
    },
    playerTask({
      id: 'fa-la-la-loop',
      title: 'Loop the fa-la-la line',
      song: 'deck-the-halls',
      bars: [3, 4],
      tempo: 78,
      minutes: 3,
      body: 'Bars 3 and 4 on a loop at about 84 BPM: the quick fa-la-las, then {n:G}, {n:F#}, {n:G}. Keep going round until finger 4 lands on the {n:F#} without looking.',
    }),
    playerTask({
      id: 'deck-band',
      title: 'Deck the Halls with the chords',
      song: 'deck-the-halls',
      tempo: 78,
      minutes: 4,
      body: 'The whole tune at about 84 BPM with the teacher\'s chords, {c:G}, {c:C} and {c:D7}. Then 100 % (108 BPM).',
    }),
    {
      type: 'order',
      prompt: 'Put the end of the fa-la-la line in order.',
      tiles: ['{n:G}', '{n:F#}', '{n:G}'],
      distractors: ['{n:F}'],
      explain: 'The open {n:G}, {n:F#} at string 4, fret 4, then the open {n:G} again: "la la la".',
      fact: 'f-sharp-string-4',
    },
  ],
  facts: [
    { id: 'sharp-one-fret', front: 'What does a sharp do to a note?', back: 'It raises it by one fret: {n:F} at string 4, fret 3 becomes {n:F#} at fret 4.' },
    { id: 'f-sharp-string-4', front: 'Where is {n:F#} on string 4?', back: 'Fret 4, played with finger 4. It leads up to the open {n:G}.' },
  ],
};

// ── 4. Joy to the World: a scale in a song ──────────────────────────────────────────────────────

const joyToTheWorld: TeacherLesson = {
  id: 'joy-to-the-world',
  title: 'Joy to the World: a scale in a song',
  teaches: 'Joy to the World opens with the D major scale walking down from D to D: eight notes, home to home.',
  minutes: 5,
  skill: 'teacher:mia:joy-to-the-world',
  steps: [
    {
      type: 'card',
      title: 'A scale in a song',
      body: 'Joy to the World begins with a whole {t:major-scale|major scale} walking down from {n:D} to {n:D}. That is the sound of the major scale: eight notes, home to home. Two of them are sharps, {n:C#} and {n:F#}.',
      figure: {
        kind: 'fretboard',
        frets: [0, 4],
        dots: [
          { string: 2, fret: 3, note: 'D4' },
          { string: 2, fret: 2, note: 'C#4' },
          { string: 2, fret: 0, note: 'B3' },
          { string: 3, fret: 2, note: 'A3' },
          { string: 3, fret: 0, note: 'G3' },
          { string: 4, fret: 4, note: 'F#3' },
          { string: 4, fret: 2, note: 'E3' },
          { string: 4, fret: 0, note: 'D3' },
        ],
        caption: 'The {n:D} major scale, from string 2, fret 3 down to the open string 4.',
      },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the scale, walking down from {n:D}.',
      text: '{n:D}  {n:C#}  {n:B}  ___  {n:G}  ___  {n:E}  {n:D}',
      blanks: ['{n:A}', '{n:F#}'],
      bank: ['{n:F}', '{n:C}'],
      explain: 'Down from {n:D}: {n:D} {n:C#} {n:B} {n:A} {n:G} {n:F#} {n:E} {n:D}. The key of {n:D} has {n:F#}, not {n:F}.',
      fact: 'joy-scale',
    },
    {
      type: 'card',
      title: 'Where the notes are',
      body: '{n:D} at string 2, fret 3; {n:C#} at fret 2; the open {n:B}. Then {n:A} at string 3, fret 2, and the open {n:G}. Then {n:F#} at string 4, fret 4, {n:E} at fret 2, and the open {n:D}.',
      tip: 'Finger 3 for fret 3, finger 2 for fret 2, finger 4 for the {n:F#}.',
    },
    {
      type: 'play-phrase',
      prompt: 'Play the eight notes as even quarter notes, from string 2, fret 3 down to the open string 4.',
      notes: [...JOY_SCALE],
      octave: 'exact',
      tempo: 60,
      explain: '{n:D} {n:C#} {n:B} {n:A} {n:G} {n:F#} {n:E} {n:D}: the {n:D} major scale stepping down, home to home.',
      alternative: {
        type: 'order',
        prompt: 'Put the eight notes in order, from the top.',
        tiles: ['{n:D}', '{n:C#}', '{n:B}', '{n:A}', '{n:G}', '{n:F#}', '{n:E}', '{n:D}'],
        distractors: ['{n:C}'],
        explain: 'From {n:D} at string 2, fret 3 down to the open string 4: {n:D} {n:C#} {n:B} {n:A} {n:G} {n:F#} {n:E} {n:D}.',
      },
    },
    {
      type: 'card',
      title: 'Long, then quick',
      body: 'The rhythm starts long, then quick: {n:D} for a beat, then {n:C#} with a dot, then a short {n:B} that squeezes in before the next beat. Then {n:A} long and {n:G} short, {n:F#} and {n:E} a beat each, and {n:D}, with the {n:A} that starts the next line.',
      figure: { kind: 'tab', tempo: 72, time: '2/4', notes: [...JOY_PHRASE], caption: 'Bars 1 to 4: "Joy to the world! the Lord is come; Let".' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap the first two bars: {n:D} long, {n:C#} dotted, {n:B} short, then {n:A} long, {n:G} short.',
      rhythm: { pattern: 'q e. s | q. e', time: '2/4' },
      tempo: 60,
      show: 'both',
      explain: 'Long, long-short; long-short. The dotted note lasts most of the beat, and the short note slips in just before the next one.',
      fact: 'joy-rhythm',
    },
    playerTask({
      id: 'joy-phrase',
      title: 'The first phrase, in rhythm',
      song: 'joy-to-the-world',
      bars: [1, 4],
      tempo: 83,
      minutes: 3,
      body: 'Bars 1 to 4 on a loop at about 60 BPM, in rhythm: long, then quick. When it flows, raise it to 100 % (72 BPM).',
    }),
    playerTask({
      id: 'joy-whole',
      title: 'Joy to the World with the chords',
      song: 'joy-to-the-world',
      tempo: 83,
      minutes: 4,
      body: 'Now the whole carol at about 60 BPM with the teacher\'s chords, {c:D}, {c:G} and {c:A7}: the scale walking down, line 2 climbing back up in pairs, then the quick notes of "heaven and nature sing". Then 100 % (72 BPM), and on into verse 2.',
      tip: 'The refrain repeats {n:F#} at string 4, fret 4, then {n:E} at fret 2: keep finger 4 hovering over fret 4.',
    }),
    {
      type: 'true-false',
      statement: 'A major scale from home to home has eight notes, with the home note at both ends.',
      answer: true,
      explain: '{n:D} down to {n:D}: seven different notes and the home note again at the end, eight in all.',
      fact: 'joy-scale',
    },
    {
      type: 'card',
      title: 'For contrast: Mozart',
      body: 'Mozart\'s Eine kleine Nachtmusik opens by leaping through the notes of the {c:G} chord instead of stepping: the open string 3 ({n:G}), the open string 4 ({n:D}), the open string 2 ({n:B}) and string 2, fret 3 ({n:D}). Every rest is part of the music.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: [...NACHTMUSIK_OPENING], tempo: 72 }, label: 'Hear the opening' },
    },
    playerTask({
      id: 'nachtmusik',
      title: 'Eine kleine Nachtmusik',
      song: 'eine-kleine-nachtmusik',
      mode: 'wait',
      minutes: 3,
      body: 'Wait mode first, then 75 % (72 BPM). Observe every rest: stop the string with a finger so the silence is really silent.',
    }),
    {
      type: 'fretboard-find',
      prompt: 'Tap {n:C#}, the second note of Joy to the World.',
      find: { note: 'C#4' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 4],
      explain: 'String 2, fret 2 is {n:C#}: one fret above {n:C}, one fret below {n:D}.',
      fact: 'joy-scale',
    },
  ],
  facts: [
    { id: 'joy-scale', front: 'How does Joy to the World begin?', back: 'With the {n:D} major scale walking down: {n:D} {n:C#} {n:B} {n:A} {n:G} {n:F#} {n:E} {n:D}, eight notes, home to home.' },
    { id: 'joy-rhythm', front: 'The rhythm of the first notes of Joy to the World?', back: 'Long, then quick: {n:D} for a beat, {n:C#} dotted, a short {n:B}; then {n:A} long, {n:G} short.' },
  ],
};

// ── 5. A first fiddle tune: The Rakes of Mallow ─────────────────────────────────────────────────

const rakesOfMallow: TeacherLesson = {
  id: 'rakes-of-mallow',
  title: 'A first fiddle tune: The Rakes of Mallow',
  teaches: 'Flatpick a fiddle tune with a downstroke on every beat and an upstroke on every &, like your strumming hand.',
  minutes: 5,
  skill: 'teacher:mia:rakes-of-mallow',
  steps: [
    {
      type: 'card',
      title: 'Fiddle tunes',
      body: '{t:fiddle-tune|Fiddle tunes} are melodies for dancing, and guitarists {t:flatpick} them, one note at a time with the pick. The Rakes of Mallow is an Irish polka, a lively dance in 2/4, with two 8-bar parts, A and B, each played twice: A A B B. It moves mostly by step and repeats its notes: the perfect first one.',
    },
    {
      type: 'order',
      prompt: 'Put the form of The Rakes of Mallow in order.',
      tiles: ['A part', 'A again', 'B part', 'B again'],
      distractors: ['C part'],
      explain: 'AABB: the A part twice, then the B part twice. Each part is 8 bars long.',
      fact: 'aabb',
    },
    {
      type: 'card',
      title: 'The picking rule',
      body: 'The rule that makes it flow: a downstroke on every beat and an upstroke on every &, so your pick moves just like your strumming hand. Count "1 & 2 &": down, up, down, up. A note on a beat is always a down; a note on an & is always an up.',
      figure: { kind: 'rhythm', pattern: 'e e e e | e e q', time: '2/4', tempo: 60, caption: 'Down on 1 and 2, up on each &. On the long note the hand still swings up.' },
      tip: 'On a long note the hand keeps swinging and just misses the string, like the miss in the folk pattern.',
    },
    {
      type: 'choice',
      prompt: 'A note falls on the & of beat 1. Which stroke plays it?',
      options: [
        { text: 'An upstroke', correct: true },
        { text: 'A downstroke', why: 'Downstrokes are for the beats. Every & is an up.' },
        { text: 'Whichever feels easier', why: 'The rule keeps the pick in time: beats down, &s up, every time.' },
      ],
      explain: 'Beats are downstrokes and every & is an upstroke, just like strumming down-up eighths.',
      fact: 'picking-rule',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap down-up eighths for two bars of 2/4, a long note to finish, saying "down, up" as you go.',
      rhythm: { pattern: 'e e e e | e e q', time: '2/4' },
      tempo: 60,
      show: 'both',
      explain: 'Down on 1, up on &, down on 2, up on &: the same motion as your strumming hand, one string at a time.',
    },
    playerTask({
      id: 'rakes-wait',
      title: 'The Rakes of Mallow in wait mode',
      song: 'rakes-of-mallow',
      mode: 'wait',
      minutes: 4,
      body: 'The A part in wait mode, then the B part. Say "down, up" with the counts, and check each stroke: downs on the beats, ups on the &s.',
      fallback: {
        tool: 'technique',
        params: ['tech-alternate-scale-g'],
        title: 'The picking rule on the G major scale',
        body: 'The Rakes of Mallow is not in the Songs library yet, so practise its picking on the notes it is made of: the {n:G} major scale in first position, in eighth notes at 60 BPM. Down on every beat, up on every &, even where a string has only two notes.',
      },
    }),
    {
      type: 'true-false',
      statement: 'In AABB form, you play the A part twice, then the B part twice.',
      answer: true,
      explain: 'A A B B: each 8-bar part comes twice. Fiddle tunes for dancing are very often built this way.',
      fact: 'aabb',
    },
    playerTask({
      id: 'rakes-loop',
      title: 'Loop each part',
      song: 'rakes-of-mallow',
      tempo: 75,
      minutes: 4,
      body: 'Set a loop over the A part and play it at 60 BPM, picking down on the beat and up on the &. Then 90 % (72 BPM). Then the same for the B part.',
      fallback: {
        tool: 'technique',
        params: ['tech-alternate-scale-g'],
        title: 'Down on the beat, up on the &',
        body: 'The Rakes of Mallow is not in the Songs library yet, so climb the tempo ladder on the {n:G} major scale instead: 60 BPM, then 72, strictly down on every beat and up on every &.',
      },
    }),
    {
      type: 'choice',
      prompt: 'A note lasts a whole beat. What does your picking hand do on its &?',
      options: [
        { text: 'Swings up, just missing the string', correct: true },
        { text: 'Stops and waits', why: 'If the hand stops, the next down comes late. It keeps swinging, like your strumming hand.' },
        { text: 'Picks the note again', why: 'The note is still ringing for the whole beat. The hand swings up past the string without touching it.' },
      ],
      explain: 'The hand keeps moving down-up all the time; on a long note the upstroke simply misses the string, like the miss in the folk pattern.',
      fact: 'picking-rule',
    },
    playerTask({
      id: 'rakes-whole',
      title: 'The whole tune, with backup',
      song: 'rakes-of-mallow',
      minutes: 4,
      body: 'The whole tune, A A B B, at 80 BPM, while the app plays backup chords, {c:G}, {c:D} and {c:C}. Keep going through any slip: dancers do not stop.',
      fallback: {
        tool: 'player',
        params: ['drunken-sailor', 't83'],
        title: 'A tune you know, flatpicked',
        body: 'The Rakes of Mallow is not in the Songs library yet, so flatpick a lively 2/4 tune you know: Drunken Sailor. In Options, under Parts, tap Tune so it is your part, and play it at 83 % (80 BPM): down on every beat, up on every &, while the app strums {c:Em} and {c:D}.',
      },
    }),
    {
      type: 'match-pairs',
      prompt: 'Match each word with what it means.',
      pairs: [
        { left: 'Fiddle tune', right: 'A melody for dancing' },
        { left: 'Polka', right: 'A lively dance in 2/4' },
        { left: 'AABB', right: 'Each part played twice' },
      ],
      explain: 'A fiddle tune is a dance melody; a polka is a lively dance in 2/4; AABB means each of the two parts comes twice.',
    },
  ],
  facts: [
    { id: 'picking-rule', front: 'The picking rule for a fiddle tune in eighth notes?', back: 'A downstroke on every beat and an upstroke on every &, like your strumming hand.' },
    { id: 'aabb', front: 'What does AABB form mean?', back: 'Two parts, A and B, each played twice: A A B B.' },
  ],
};

// ── 6. Your first showpiece: Für Elise (milestone) ──────────────────────────────────────────────

const furElise: TeacherLesson = {
  id: 'fur-elise',
  title: 'Your first showpiece: Für Elise',
  teaches: 'Für Elise rocks E, D sharp, E, D sharp, E, then B, D, C, A, in 3/8: three quick counts in each bar.',
  minutes: 5,
  skill: 'teacher:mia:fur-elise',
  steps: [
    {
      type: 'card',
      title: 'Your first showpiece',
      body: 'Beethoven\'s Für Elise starts with a rocking figure: {n:E} {n:D#} {n:E} {n:D#} {n:E}, then {n:B} {n:D} {n:C} and a long {n:A}. Six notes: the open string 1 ({n:E}), string 2 at frets 4, 3 and 1 ({n:D#}, {n:D}, {n:C}), the open string 2 ({n:B}) and string 3, fret 2 ({n:A}).',
      figure: {
        kind: 'fretboard',
        frets: [0, 4],
        dots: [
          { string: 1, fret: 0, note: 'E4' },
          { string: 2, fret: 4, note: 'D#4', finger: 4 },
          { string: 2, fret: 3, note: 'D4', finger: 3 },
          { string: 2, fret: 1, note: 'C4', finger: 1 },
          { string: 2, fret: 0, note: 'B3' },
          { string: 3, fret: 2, note: 'A3', finger: 2 },
        ],
        caption: 'The six melody notes of the opening.',
      },
    },
    {
      type: 'fretboard-name',
      prompt: 'Which note is string 2, fret 4, the note that rocks against the open {n:E}?',
      position: { string: 2, fret: 4 },
      ask: 'note',
      spelling: 'any',
      options: ['D#', 'D', 'E', 'C#'],
      explain: 'String 2, fret 4 is {n:D#}: one fret above {n:D}, one fret below the {n:E} of the open string 1. That is why it rocks so closely.',
      fact: 'elise-opening',
    },
    {
      type: 'card',
      title: 'Three quick counts',
      body: 'Für Elise is in 3/8: three quick counts in each bar, "1 2 3", each an eighth note. The rocking notes go twice as fast again, two to each count. Begin slowly: the rocking must be even before it can be quick.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: [...ELISE_OPENING], tempo: 40 }, label: 'Hear the opening, slowly' },
    },
    {
      type: 'play-phrase',
      prompt: 'Slowly: {n:E} {n:D#} {n:E} {n:D#} {n:E} (the open string 1 and string 2, fret 4), {n:B} {n:D} {n:C}, then {n:A} on string 3, fret 2.',
      notes: [...ELISE_OPENING],
      octave: 'exact',
      tempo: 40,
      explain: 'Open string 1, string 2 fret 4, three times rocking, then the open string 2, string 2 fret 3, string 2 fret 1, and string 3 fret 2 to land.',
      alternative: {
        type: 'order',
        prompt: 'Put the opening of Für Elise in order.',
        tiles: ['{n:E} {n:D#}', '{n:E} {n:D#}', '{n:E} {n:B}', '{n:D} {n:C}', '{n:A}'],
        explain: '{n:E} {n:D#} {n:E} {n:D#} {n:E}, then {n:B} {n:D} {n:C}, and the long {n:A}.',
      },
    },
    {
      type: 'card',
      title: 'The answer, and its G sharp',
      body: 'Each answer climbs a chord from the lower strings: {n:C} {n:E} {n:A}, the notes of {c:Am}, then {n:E} {n:G#} {n:B}, the notes of {c:E}. Keep {n:G#}, not {n:G}, in the {c:E} chord, or the magic goes: it is string 3, fret 1, with finger 1.',
      figure: { kind: 'tab', tempo: 60, time: '3/8', notes: [...ELISE_ANSWERS], caption: 'The answers: {c:Am}, then {c:E} with its {n:G#} on string 3, fret 1.' },
    },
    {
      type: 'choice',
      prompt: 'In the {c:E} chord of the answer, which note must you keep?',
      options: [
        { text: '{n:G#}, on string 3, fret 1', correct: true },
        { text: '{n:G}, the open string 3', why: 'The open {n:G} turns the chord into {c:Em}, and the music loses its pull back to {n:A}.' },
        { text: '{n:A}, on string 3, fret 2', why: '{n:A} belongs to {c:Am}. In the {c:E} answer, string 3 is fret 1: {n:G#}.' },
      ],
      explain: '{c:E} is {n:E} {n:G#} {n:B}. The {n:G#} on string 3, fret 1 pulls back up to {n:A}, which is what makes the theme return so well.',
      fact: 'elise-g-sharp',
    },
    {
      type: 'listen-choice',
      prompt: 'Mia climbs a chord. Is it {c:E}, with {n:G#}, or {c:Em}, with {n:G}?',
      sound: { kind: 'notes', notes: ['E3', 'G#3', 'B3'], tempo: 72 },
      options: [{ text: '{c:E}: with {n:G#}, bright', correct: true }, { text: '{c:Em}: with {n:G}, darker' }],
      shuffle: false,
      explain: 'That was {n:E} {n:G#} {n:B}: the bright {c:E} that Für Elise needs.',
    },
    playerTask({
      id: 'elise-loop',
      title: 'Loop the opening',
      song: 'fur-elise-theme',
      bars: [1, 5],
      mode: 'wait',
      minutes: 4,
      body: 'Bars 1 to 5, the pickup and the first four bars, on a loop in wait mode, until the rocking is even. Then clear the loop and play the whole section in wait mode.',
      tip: 'Keep finger 4 hovering over fret 4 of string 2. It comes back again and again.',
    }),
    playerTask({
      id: 'elise-click',
      title: 'Für Elise with the click',
      song: 'fur-elise-theme',
      tempo: 67,
      minutes: 4,
      body: 'Turn on the Click in Options and play the whole section at 67 % (80 eighth-note counts a minute). Then 100 % (120 eighth-note counts a minute). When it holds together, play it for someone.',
      tip: 'The Player counts quarter notes, so it says 40, then 60 bpm: one of its beats for every two of your counts.',
    }),
    {
      type: 'true-false',
      statement: 'Für Elise is in 3/8: three quick counts, each an eighth note, in every bar.',
      answer: true,
      explain: 'Three eighth notes a bar, counted "1 2 3". The rocking notes are twice as quick, two to a count.',
      fact: 'three-eight',
    },
    {
      type: 'card',
      title: 'Your show',
      body: 'Für Elise, from the pickup to the {c:E} answer, at a tempo you can keep steady. Rock evenly, let the {n:A} land, climb both chords, and keep {n:G#} in the second. Keep going through any slip.',
    },
    {
      type: 'play-phrase',
      id: 'show',
      prompt: 'Your show: the opening of Für Elise, from the rocking {n:E} on the open string 1 to the {c:E} answer.',
      notes: [...ELISE_SHOW],
      octave: 'exact',
      tempo: 60,
      pass: 0.8,
      explain: '{n:E} {n:D#} {n:E} {n:D#} {n:E} {n:B} {n:D} {n:C} {n:A}, the {c:Am} answer {n:C} {n:E} {n:A}, then {n:B} and the {c:E} answer {n:E} {n:G#} {n:B}. About 8 notes in 10 is a pass.',
      alternative: {
        type: 'order',
        prompt: 'Put the opening of Für Elise in order.',
        tiles: ['{n:E} {n:D#} {n:E} {n:D#}', '{n:E} {n:B} {n:D} {n:C}', '{n:A} {n:C} {n:E} {n:A}', '{n:B} {n:E} {n:G#} {n:B}'],
        explain: 'The rocking {n:E} {n:D#}, the fall {n:B} {n:D} {n:C}, then {n:A} with the {c:Am} answer and {n:B} with the {c:E} answer.',
      },
    },
  ],
  facts: [
    { id: 'elise-opening', front: 'The opening notes of Für Elise?', back: '{n:E} {n:D#} {n:E} {n:D#} {n:E} {n:B} {n:D} {n:C} {n:A}: the open string 1, string 2 at frets 4, 0, 3 and 1, then string 3 fret 2.' },
    { id: 'elise-g-sharp', front: 'In the {c:E} answer of Für Elise, which note do you keep?', back: '{n:G#}, string 3, fret 1, not the open {n:G}.' },
    { id: 'three-eight', front: 'What is 3/8?', back: 'Three quick counts in each bar, each an eighth note, counted "1 2 3".' },
  ],
};

/** Unit 8 of Mia's course. */
const unit: TeacherUnit = {
  id: 'mia-riffs-and-melodies',
  title: 'Riffs and melodies',
  theme: 'notes',
  description: 'Notes on all six strings, hammer-ons and pull-offs, your first sharp, a fiddle tune and a first showpiece: Für Elise.',
  lessons: [lowStringNotes, hammerOnsAndPullOffs, deckTheHalls, joyToTheWorld, rakesOfMallow, furElise],
  checkpoint: { sample: 8, maxMistakes: 2 },
  milestone: {
    lesson: 'fur-elise',
    step: 'show',
    piece: 'the opening of Für Elise',
    song: 'fur-elise-theme',
    celebrate: 'You played the opening of Für Elise, from the rocking {n:E} to the {c:E} answer with its {n:G#}. That is Beethoven, on your guitar: a real showpiece. Next: power chords, the blues, and a riff of your own.',
  },
  glossary: [
    { id: 'riff', term: 'riff', definition: 'A short pattern of notes repeated through a song, often on the low strings.' },
    { id: 'lick', term: 'lick', definition: 'A short phrase of notes you learn once and reuse in many songs and solos.' },
    { id: 'hammer-on', term: 'hammer-on', definition: 'A second note sounded without picking: a finger comes down hard and fast just behind a fret. Written h in tab.' },
    { id: 'pull-off', term: 'pull-off', definition: 'A lower note sounded without picking: the fretting finger plucks the string slightly sideways as it leaves. Written p in tab.' },
    { id: 'fiddle-tune', term: 'fiddle tune', definition: 'A melody for dancing, first played on the fiddle, which guitarists flatpick.' },
    { id: 'flatpick', term: 'flatpick', definition: 'To play a melody one note at a time with a pick, down on the beats and up on the &s.' },
  ],
};

export default unit;
