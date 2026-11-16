/**
 * Mia, unit 12: Playing with others, and a habit for life (plan: `mia/mia-playing-with-others` in
 * src/content/plan/teachers.json). The last unit of Mia's course.
 *
 * Tuning by ear with the fifth-fret rule, holding your part in two rounds, the capo, following a
 * chart with the band (and getting back in after a mistake), a practice routine of your own, and
 * the graduation concert that hands the learner over to Dev. Every lesson follows its plan entry:
 * the plan's `explain` in Mia's voice on the cards, its `show` as figures, its `practice` as
 * exercises (play steps always with a tapping alternative) or tasks that send the learner to the
 * Tuner, Ear Training, the Player, a jam track, the Practice Plan, Technique, Chords or the
 * Metronome and back. Play steps show octave note names (E2), so every prompt also says the string
 * and fret.
 *
 * Music from the song library: Amazing Grace (84 BPM), Frère Jacques (round) (96), Duet: An
 * Original Round (84), O Come, All Ye Faithful (88), Für Elise (theme) (60 quarters), Auld Lang
 * Syne (80) and the 12-Bar Blues Shuffle in A (84, the shuffle of the concert's blues). The
 * library's Auld Lang Syne uses the open Bm7 (x20202); in the concert the learner plays the Bm
 * barre (x24432) there, the same chord without its seventh. The engine cannot detune a note, so
 * the plan's audio of two strings beating is described on the card and heard on the learner's own
 * guitar. `mia-playing-with-others.test.ts` checks every fretted pair, tab, capo sum, chart, shape
 * and tempo against the engines and the library.
 */
import type { TabNote } from '@/lessons';
import type { TeacherLesson, TeacherUnit } from '../types';
import { playerTask, techniqueTask, toolTask } from '../tasks';

// ── 1. Tuning by ear ────────────────────────────────────────────────────────────────────────────

/** The five pairs of the fifth-fret rule: a fretted note and the open string above it that it matches. */
export const TUNING_PAIRS = [
  { fretted: { string: 6, fret: 5 }, open: { string: 5, fret: 0 }, note: 'A2' },
  { fretted: { string: 5, fret: 5 }, open: { string: 4, fret: 0 }, note: 'D3' },
  { fretted: { string: 4, fret: 5 }, open: { string: 3, fret: 0 }, note: 'G3' },
  { fretted: { string: 3, fret: 4 }, open: { string: 2, fret: 0 }, note: 'B3' },
  { fretted: { string: 2, fret: 5 }, open: { string: 1, fret: 0 }, note: 'E4' },
] as const;

const tuneWithoutATuner: TeacherLesson = {
  id: 'tune-without-a-tuner',
  title: 'Tuning by ear',
  teaches: 'Fret 5 of each string matches the next open string, except string 3, where fret 4 matches string 2.',
  minutes: 5,
  skill: 'teacher:mia:tune-without-a-tuner',
  steps: [
    {
      type: 'card',
      title: 'Strings that tune each other',
      body: 'Press a string at fret 5 and it sounds the same note as the next open string. String 6, fret 5 is {n:A}, the note of the open string 5. String 5, fret 5 is {n:D}, the open string 4. String 4, fret 5 is {n:G}, the open string 3. That is the fifth-fret rule.',
      figure: {
        kind: 'fretboard',
        frets: [0, 5],
        dots: TUNING_PAIRS.flatMap((p) => [
          { ...p.fretted, note: p.note },
          { ...p.open, note: p.note, role: 'target' as const },
        ]),
        caption: 'Each fretted note and the open string it matches, with the same name.',
      },
    },
    {
      type: 'choice',
      prompt: 'Which note is string 6, fret 5?',
      options: [
        { text: '{n:A}, the note of the open string 5', correct: true },
        { text: '{n:G}', why: '{n:G} is string 6, fret 3. Count on two more frets: {n:G#}, then {n:A}.' },
        { text: '{n:E}', why: '{n:E} is the open string 6. Five frets up it is {n:A}.' },
      ],
      explain: 'String 6, fret 5 is {n:A}: the same note as the open string 5. So once string 6 is in tune, it can tune string 5.',
      fact: 'fifth-fret-rule',
    },
    {
      type: 'card',
      title: 'The one exception',
      body: 'Strings 3 and 2 are only four frets apart, so there you use fret 4: string 3, fret 4 is {n:B}, the note of the open string 2. Then the rule comes back: string 2, fret 5 is {n:E}, the open string 1.',
      tip: 'Say it once out loud: "five, five, five, four, five". That is the whole tuning, string 6 to string 1.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each fretted note with the open string it matches.',
      pairs: [
        { left: 'String 6, fret 5', right: 'Open string 5' },
        { left: 'String 5, fret 5', right: 'Open string 4' },
        { left: 'String 4, fret 5', right: 'Open string 3' },
        { left: 'String 3, fret 4', right: 'Open string 2' },
        { left: 'String 2, fret 5', right: 'Open string 1' },
      ],
      explain: 'Fret 5 on strings 6, 5, 4 and 2 matches the next open string up; on string 3 it is fret 4, because strings 3 and 2 are only four frets apart.',
      fact: 'fifth-fret-rule',
    },
    {
      type: 'card',
      title: 'Listen for the wobble',
      body: 'Play the fretted note and the next open string together and let them ring. When the two are nearly the same, you hear a slow wobble, wah-wah-wah, called {t:beating}. Turn the open string\'s peg slowly: the wobble slows, and when it stops, the notes match.',
      tip: 'If the wobble gets faster as you turn, you are turning the wrong way. Come back below the note and tighten up to it.',
    },
    {
      type: 'true-false',
      statement: 'As two strings come closer in tune, the wobble gets faster.',
      answer: false,
      explain: 'It is the other way round: the closer the two notes, the slower the wobble. When it stops completely, they match.',
      fact: 'beating-wobble',
    },
    {
      type: 'play-phrase',
      prompt: 'Play the first pair: string 6, fret 5, then the open string 5. Both are the same {n:A}.',
      notes: [
        { string: 6, fret: 5, duration: 'h' },
        { string: 5, fret: 0, duration: 'h' },
      ],
      octave: 'exact',
      tempo: 60,
      explain: 'String 6, fret 5 and the open string 5 are both {n:A}. If they sound different, string 5 needs tuning to string 6.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap both places, between the open strings and fret 5, that sound the {n:A} of the open string 5.',
        find: { note: 'A2' },
        mode: 'all',
        octave: 'exact',
        frets: [0, 5],
        explain: 'The open string 5 is {n:A}, and so is string 6, fret 5: the first pair of the fifth-fret rule.',
      },
    },
    toolTask({
      id: 'tune-by-ear',
      title: 'Tune five strings by ear',
      tool: 'tuner',
      minutes: 5,
      body: 'Tune string 6 with the Tuner, then stop looking at it. Tune strings 5 to 1 by ear, each from the thicker string next to it: five, five, five, four, five. Then pluck each string for the Tuner and see how close you came.',
      tip: 'No microphone? Tune string 6 to the reference tone, then the rest by ear, and check the last one against its reference tone too.',
    }),
    { generate: 'higher-lower', params: { maxSemitones: 4, minSemitones: 1 } },
    toolTask({
      id: 'higher-lower',
      title: 'Higher or lower, closer and closer',
      tool: 'ear',
      params: ['pitch', '3'],
      minutes: 3,
      body: 'Ten pairs of notes: is the second higher or lower? Then go on to level 4, where the notes are only one or two frets apart. This is exactly what you listen for when you tune.',
    }),
    playerTask({
      id: 'grace-in-tune',
      title: 'Hear your tuning in a song',
      song: 'amazing-grace',
      minutes: 3,
      body: 'Play Amazing Grace with the app at 84 BPM on the strings you tuned by ear. If a chord sounds sour against the band, check its strings with the fifth-fret rule.',
    }),
    {
      type: 'fretboard-find',
      prompt: 'String 4 is in tune. Tap the note on string 4 that tunes the open string 3.',
      find: { note: 'G3' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 7],
      strings: [4],
      explain: 'String 4, fret 5 is {n:G}, the note of the open string 3: the fifth-fret rule.',
    },
  ],
  facts: [
    {
      id: 'fifth-fret-rule',
      front: 'Tuning by ear: which fret of each string matches the next open string?',
      back: 'Fret 5 on strings 6, 5, 4 and 2. On string 3 it is fret 4, which matches the open string 2 ({n:B}).',
    },
    { id: 'beating-wobble', front: 'Two strings nearly in tune wobble against each other. What do you do?', back: 'Turn the peg slowly: the wobble, called beating, slows down, and when it stops the two notes match.' },
  ],
};

// ── 2. Rounds and duets ─────────────────────────────────────────────────────────────────────────

/** Frère Jacques (round), your voice: bars 1 and 2 (G A B G, twice). */
export const JACQUES_BARS_1_2: TabNote[] = [
  { string: 3, fret: 0, duration: 'q' },
  { string: 3, fret: 2, duration: 'q' },
  { string: 2, fret: 0, duration: 'q' },
  { string: 3, fret: 0, duration: 'q' },
  { string: 3, fret: 0, duration: 'q' },
  { string: 3, fret: 2, duration: 'q' },
  { string: 2, fret: 0, duration: 'q' },
  { string: 3, fret: 0, duration: 'q' },
];

/** Frère Jacques (round), your voice: bars 3 and 4 (B C D, twice), where the second voice comes in. */
export const JACQUES_BARS_3_4: TabNote[] = [
  { string: 2, fret: 0, duration: 'q' },
  { string: 2, fret: 1, duration: 'q' },
  { string: 2, fret: 3, duration: 'h' },
  { string: 2, fret: 0, duration: 'q' },
  { string: 2, fret: 1, duration: 'q' },
  { string: 2, fret: 3, duration: 'h' },
];

/** Frère Jacques (round), your voice: bar 5 (D E D C as eighths, then B G). */
export const JACQUES_BAR_5: TabNote[] = [
  { string: 2, fret: 3, duration: 'e' },
  { string: 1, fret: 0, duration: 'e' },
  { string: 2, fret: 3, duration: 'e' },
  { string: 2, fret: 1, duration: 'e' },
  { string: 2, fret: 0, duration: 'q' },
  { string: 3, fret: 0, duration: 'q' },
];

/** Duet: An Original Round, your voice: bars 1 and 2 (B C B G over G, A B A F# over D). */
export const DUET_BARS_1_2: TabNote[] = [
  { string: 2, fret: 0, duration: 'q' },
  { string: 2, fret: 1, duration: 'q' },
  { string: 2, fret: 0, duration: 'q' },
  { string: 3, fret: 0, duration: 'q' },
  { string: 3, fret: 2, duration: 'q' },
  { string: 2, fret: 0, duration: 'q' },
  { string: 3, fret: 2, duration: 'q' },
  { string: 4, fret: 4, duration: 'q' },
];

const roundsAndDuets: TeacherLesson = {
  id: 'rounds-and-duets',
  title: 'Rounds and duets',
  teaches: 'When another part comes in, count, keep your eyes on your own part and let the other voice wash over you.',
  minutes: 5,
  skill: 'teacher:mia:rounds-and-duets',
  steps: [
    {
      type: 'card',
      title: 'Two things at once',
      body: 'Playing with others means hearing two things at once: your part and theirs. In a {t:round}, everyone plays the same tune but starts at a different time. In Frère Jacques you play bars 1 and 2 alone; in bar 3 the second voice starts the tune from the top.',
      figure: { kind: 'tab', tempo: 80, notes: [...JACQUES_BARS_1_2], caption: 'Bars 1 and 2: you alone. The second voice starts in bar 3.' },
    },
    {
      type: 'choice',
      prompt: 'In a round, what does the second voice play?',
      options: [
        { text: 'The same tune, starting later', correct: true },
        { text: 'A different tune at the same time', why: 'That is a duet with two different parts. In a round both voices play one tune.' },
        { text: 'Your tune, but backwards', why: 'Nothing so tricky: the same tune, from the beginning, a little later.' },
      ],
      explain: 'Everyone plays the same tune, each starting at a different time. In Frère Jacques the second voice comes in two bars after you.',
      fact: 'round-voices',
    },
    {
      type: 'play-phrase',
      prompt: 'Bar 1: {n:G} {n:A} {n:B} {n:G}. Open string 3, string 3 fret 2, open string 2, open string 3.',
      notes: JACQUES_BARS_1_2.slice(0, 4),
      octave: 'exact',
      tempo: 80,
      explain: 'The open string 3 is {n:G}, fret 2 of string 3 is {n:A}, the open string 2 is {n:B}, then back to the open {n:G}.',
      alternative: {
        type: 'order',
        prompt: 'Put the four notes of bar 1 in order.',
        tiles: ['{n:G}', '{n:A}', '{n:B}', '{n:G}'],
        distractors: ['{n:C}'],
        explain: 'Frère Jacques climbs {n:G} {n:A} {n:B} and steps back down to {n:G}.',
      },
    },
    {
      type: 'card',
      title: 'Where the second voice comes in',
      body: 'Bar 3 is where the second voice enters, and for a moment your ears want to follow it. Count out loud, keep your eyes on your own part, and let the other voice wash over you.',
      figure: { kind: 'tab', tempo: 80, notes: [...JACQUES_BARS_3_4], caption: 'Bars 3 and 4, yours. Under you, the second voice starts {n:G} {n:A} {n:B} {n:G}.' },
    },
    {
      type: 'true-false',
      statement: 'When the second voice comes in, you follow it with your eyes and ears so you stay together.',
      answer: false,
      explain: 'Follow your own part. Count, keep your eyes on your line, and let the other voice wash over you: it fits because the tune was written to fit itself.',
      fact: 'hold-your-part',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Bar 5: four quick notes, {n:D} {n:E} {n:D} {n:C}, then {n:B} and {n:G}. Tap it with the click.',
      rhythm: { pattern: 'e e e e q q' },
      tempo: 80,
      show: 'both',
      explain: 'Two eighth notes to a beat for beats 1 and 2, then two quarter notes. Count "1 & 2 & 3, 4".',
    },
    playerTask({
      id: 'jacques-round',
      title: 'Frère Jacques as a round',
      song: 'frere-jacques-round',
      tempo: 83,
      minutes: 6,
      body: 'Mute the Teacher part (under Parts, in the options) and play your voice alone at 80 BPM. Then unmute it: the second voice comes in at bar 3, and you keep going. When that holds, play it at 100 % (96 BPM).',
    }),
    {
      type: 'choice',
      prompt: 'The second voice comes in and you lose your place. What do you do?',
      options: [
        { text: 'Keep counting, and come in at the next bar', correct: true },
        { text: 'Stop both voices and start again', why: 'In a band nobody stops for you. Find the next bar and step back in.' },
        { text: 'Play the second voice instead', why: 'Then two people play one part and yours is missing. Find your own line again.' },
      ],
      explain: 'Keep counting. The beat carries on, so you step back into your own part at the start of the next bar.',
    },
    {
      type: 'card',
      title: 'A round of your own',
      body: 'Duet: An Original Round is a {t:duet}, a piece for two players, written as a round. Every two bars are a bar over {c:G} and a bar over {c:D}, so the voices fit wherever they meet. It uses strings 4 to 1.',
      figure: { kind: 'tab', tempo: 84, notes: [...DUET_BARS_1_2], caption: 'Bars 1 and 2 of your voice. The second voice starts in bar 3.' },
    },
    {
      type: 'fretboard-find',
      prompt: 'The last note of bar 2 is {n:F#}. Tap it on string 4.',
      find: { note: 'F#3' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 5],
      strings: [4],
      explain: 'String 4, fret 4 is {n:F#}: one fret below {n:G}, which is string 4, fret 5. Use finger 4.',
    },
    playerTask({
      id: 'duet-round',
      title: 'Duet: An Original Round',
      song: 'st-duet-round',
      tempo: 83,
      minutes: 6,
      body: 'The same way: your voice alone at 70 BPM with the Teacher part muted, then with it, then at 100 % (84 BPM). Then swap: tap the Teacher part under Parts to play the second voice yourself, while the app plays yours.',
    }),
    {
      type: 'card',
      title: 'Play it with someone',
      body: 'Now play either round with a friend or someone at home. Count in out loud, "1, 2, 3, 4"; one of you starts, the other comes in two bars later. They can sing Frère Jacques instead: a round works with voices too.',
    },
    {
      type: 'choice',
      prompt: 'Your friend starts Frère Jacques. When do you come in?',
      options: [
        { text: 'At bar 3, two bars later', correct: true },
        { text: 'At bar 1, with them', why: 'Then you play the tune together, not as a round.' },
        { text: 'When they finish', why: 'Then you take turns. In a round, the voices overlap.' },
      ],
      explain: 'The second voice starts two bars after the first: at bar 3, from the beginning of the tune.',
      fact: 'round-voices',
    },
  ],
  facts: [
    { id: 'round-voices', front: 'In a round, what does the second voice play?', back: 'The same tune, starting later: in Frère Jacques, two bars after the first voice.' },
    { id: 'hold-your-part', front: 'Another part comes in and pulls your ear. What helps?', back: 'Count, keep your eyes on your own part, and let the other voice wash over you.' },
  ],
};

// ── 3. The capo ─────────────────────────────────────────────────────────────────────────────────

/** The G shape (320003), picked string 6 to string 1. With the capo at fret 2 it sounds A major. */
export const G_SHAPE_PICKED: TabNote[] = [
  { string: 6, fret: 3, duration: 'q' },
  { string: 5, fret: 2, duration: 'q' },
  { string: 4, fret: 0, duration: 'q' },
  { string: 3, fret: 0, duration: 'q' },
  { string: 2, fret: 0, duration: 'q' },
  { string: 1, fret: 3, duration: 'q' },
];

/** The capo table of the plan: capo fret, and what the G, C and D shapes sound as. */
export const CAPO_TABLE = [
  { capo: 2, sounds: ['A', 'D', 'E'] },
  { capo: 3, sounds: ['Bb', 'Eb', 'F'] },
  { capo: 5, sounds: ['C', 'F', 'G'] },
] as const;

const theCapo: TeacherLesson = {
  id: 'the-capo',
  title: 'The capo',
  teaches: 'A capo is a new nut: at fret 2 the G, C and D shapes sound as A, D and E, two half steps higher.',
  minutes: 5,
  skill: 'teacher:mia:the-capo',
  steps: [
    {
      type: 'card',
      title: 'A clamp that moves the nut',
      body: 'A {t:capo} is a clamp that presses all the strings at one fret, so it acts like a new {t:nut}. Clip it on just behind fret 2 and play your {c:G} shape behind it: the fingers are the same, but every note is two frets higher, so it sounds as {c:A}.',
      figure: {
        kind: 'fretboard',
        capo: 2,
        // The shown window counts frets on the wood, the dots count from the capo: wood fret 5 is the capo's 3.
        frets: [0, 6],
        dots: [
          { string: 6, fret: 3, note: 'A2' },
          { string: 5, fret: 2, note: 'C#3' },
          { string: 4, fret: 0, note: 'E3' },
          { string: 3, fret: 0, note: 'A3' },
          { string: 2, fret: 0, note: 'C#4' },
          { string: 1, fret: 3, note: 'A4' },
        ],
        caption: 'Capo at fret 2, the {c:G} shape behind it: it sounds {c:A}.',
      },
    },
    {
      type: 'choice',
      prompt: 'The capo is at fret 2 and you play the {c:G} shape. Which chord sounds?',
      options: [
        { text: '{c:A}', correct: true },
        { text: '{c:G}', why: 'The shape is {c:G}, but every note is two frets higher behind the capo.' },
        { text: '{c:B}', why: 'That would be four frets higher. A capo at fret 2 raises it two frets.' },
      ],
      explain: 'Each fret is a half step. A capo at fret 2 raises every note two half steps, so the {c:G} shape sounds as {c:A}.',
      fact: 'capo-new-nut',
    },
    {
      type: 'card',
      title: 'Same shapes, new key',
      body: 'Every chord moves up one half step for each fret of capo.\nCapo 2: {c:G} {c:C} {c:D} sound as {c:A} {c:D} {c:E}.\nCapo 3: they sound as {c:Bb} {c:Eb} {c:F}.\nCapo 5: they sound as {c:C} {c:F} {c:G}.\nA singer gets a higher key; your hands play what they know.',
    },
    {
      type: 'choice',
      prompt: 'The capo is at fret 2 and you play a {c:C} shape. Which chord sounds?',
      options: [
        { text: '{c:D}', correct: true },
        { text: '{c:C}', why: 'That is the shape. Behind a capo at fret 2 it sounds two half steps higher.' },
        { text: '{c:E}', why: 'Two half steps above {c:C} is {c:D}. {c:E} would be capo 4.' },
        { text: '{c:Db}', why: '{c:Db} is one half step up: capo 1.' },
      ],
      explain: 'From {n:C}, two half steps up is {n:D}: {n:C#}, then {n:D}. The {c:C} shape at capo 2 sounds as {c:D}.',
      fact: 'capo-2-g-c-d',
    },
    {
      type: 'match-pairs',
      prompt: 'Count up from the shape: one half step for each fret of capo.',
      pairs: [
        { left: 'Capo 1, {c:E} shape', right: '{c:F}' },
        { left: 'Capo 3, {c:G} shape', right: '{c:Bb}' },
        { left: 'Capo 4, {c:C} shape', right: '{c:E}' },
        { left: 'Capo 5, {c:D} shape', right: '{c:G}' },
      ],
      explain: '{c:E} up one is {c:F}; {c:G} up three is {c:Bb}; {c:C} up four is {c:E}; {c:D} up five is {c:G}.',
    },
    toolTask({
      id: 'capo-retune',
      title: 'Capo on, then tune',
      tool: 'tuner',
      minutes: 2,
      body: 'Clip the capo straight across, just behind fret 2. Then check all six strings with the Tuner: a capo can pull them slightly sharp.',
      tip: 'In the Tuner\'s settings, set "Capo on fret" to 2: it then expects the notes that sound now, {n:F#} on string 6 instead of {n:E}.',
    }),
    {
      type: 'card',
      title: 'A shape stays a shape',
      body: 'Tab and chord charts for capo songs count frets from the capo: a 0 is the string open behind the capo, and the chart names the shape your hand makes. A shape stays a shape; only the sound moves.',
      figure: { kind: 'tab', capo: 2, tempo: 72, notes: [...G_SHAPE_PICKED], caption: 'Capo 2: the {c:G} shape picked, 3 2 0 0 0 3. It sounds {c:A}.' },
    },
    {
      type: 'true-false',
      statement: 'In tab for a song with the capo at fret 2, a 0 means the string open behind the capo.',
      answer: true,
      explain: 'Frets count from the capo, so 0 is the string open behind it, and 3 is the third fret above the capo.',
      fact: 'capo-tab',
    },
    {
      type: 'play-phrase',
      prompt: 'Capo at fret 2: pick your {c:G} shape, string 6 to 1, frets 3, 2, 0, 0, 0, 3 above the capo.',
      notes: [...G_SHAPE_PICKED],
      capo: 2,
      octave: 'exact',
      tempo: 72,
      explain: 'Behind the capo, string 6 at fret 3 sounds {n:A}, and the whole shape sounds {n:A}, {n:C#} and {n:E}: the {c:A} chord.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'The capo is at fret 2. Tap where your {c:G} shape puts its lowest note, on string 6.',
        find: { note: 'A2' },
        capo: 2,
        mode: 'one',
        octave: 'exact',
        frets: [0, 6],
        strings: [6],
        explain: 'The {c:G} shape has string 6 at fret 3. Above a capo at fret 2 that is the neck\'s fret 5: {n:A}, the root of {c:A}.',
      },
    },
    toolTask({
      id: 'capo-jam',
      title: 'Capo 2 with the band',
      tool: 'progressions',
      params: ['folk-i-iv-i-v', 'a', 'jam'],
      minutes: 4,
      body: 'Set 100 BPM. The band plays {c:A} {c:D} {c:A} {c:E}, then {c:A} {c:D} {c:E} {c:A}. Capo at fret 2, you play the shapes {c:G} {c:C} {c:G} {c:D}, then {c:G} {c:C} {c:D} {c:G}, and match the band exactly.',
    }),
    {
      type: 'choice',
      prompt: 'The band plays {c:A}, {c:D} and {c:E}. Your capo is at fret 2. Which shapes do you play?',
      options: [
        { text: '{c:G}, {c:C} and {c:D}', correct: true },
        { text: '{c:A}, {c:D} and {c:E}', why: 'Those shapes behind the capo would sound two half steps higher: {c:B}, {c:E} and {c:F#}.' },
        { text: '{c:F}, {c:Bb} and {c:C}', why: 'Those shapes would need the capo at fret 4. With capo 2, count two half steps down from each chord.' },
      ],
      explain: 'Count down two half steps from each sounding chord: {c:A} to {c:G}, {c:D} to {c:C}, {c:E} to {c:D}. Those are the shapes.',
      fact: 'capo-2-g-c-d',
    },
    playerTask({
      id: 'faithful-capo',
      title: 'O Come, All Ye Faithful, two ways',
      song: 'o-come-all-ye-faithful',
      minutes: 5,
      body: 'Play it once in {k:G major} with the app at 88 BPM. Then capo on fret 2, retune, mute both parts under Parts (the app stays in {k:G major} and would clash) and play the same shapes on your own: now it is in {k:A major}. Sing, and keep the key that fits your voice.',
    }),
    {
      type: 'choice',
      prompt: 'A song is too low for you in {k:G major}. Capo on fret 2, same shapes: which key is it in now?',
      options: [
        { text: '{k:A major}', correct: true },
        { text: '{k:G major}', why: 'The shapes are the same, but the capo raises everything two half steps.' },
        { text: '{k:B major}', why: 'That would need the capo at fret 4.' },
      ],
      explain: 'Two half steps above {n:G} is {n:A}. Same shapes, same fingers, and the whole song sounds in {k:A major}.',
    },
  ],
  facts: [
    { id: 'capo-new-nut', front: 'What does a capo do?', back: 'It presses all the strings at one fret, like a new nut. Each fret of capo raises every chord one half step.' },
    { id: 'capo-2-g-c-d', front: 'Capo at fret 2: what do the {c:G}, {c:C} and {c:D} shapes sound as?', back: '{c:A}, {c:D} and {c:E}: two half steps higher.' },
    { id: 'capo-tab', front: 'In tab for a capo song, what does 0 mean?', back: 'The string open behind the capo. Frets count from the capo, so a shape stays a shape.' },
  ],
};

// ── 4. Following a chart with the band ──────────────────────────────────────────────────────────

/** The two progressions of the plan, in G. */
export const FIFTIES_IN_G = ['G', 'Em', 'C', 'D'] as const;
export const AXIS_IN_G = ['G', 'D', 'Em', 'C'] as const;

const jammingWithTheBand: TeacherLesson = {
  id: 'jamming-with-the-band',
  title: 'Following a chart with the band',
  teaches: 'Lost your place? Stop strumming, listen for the next chord change and come back in on the next beat 1.',
  minutes: 5,
  skill: 'teacher:mia:jamming-with-the-band',
  steps: [
    {
      type: 'card',
      title: 'The beat never waits',
      body: 'In a band the beat never waits for you, so the most important skill is getting back in. If you lose your place, stop strumming, listen for the next chord change, and come back in on the next beat 1. Nobody minds a missing bar; everybody hears a strum in the wrong place.',
    },
    {
      type: 'order',
      prompt: 'You have lost your place. Put the steps of getting back in in order.',
      tiles: ['Stop strumming', 'Hear the change', 'In on beat 1'],
      distractors: ['Strum faster'],
      explain: 'Stop strumming, listen for the next chord change, and come back in on the next beat 1. Strumming faster only adds noise.',
      fact: 'getting-back-in',
    },
    {
      type: 'card',
      title: 'Chart 1: one, six, four, five',
      body: 'Two {t:progression|progressions} carry a huge number of songs. The first, in {k:G major}: {c:G} | {c:Em} | {c:C} | {c:D}, one chord a bar. In {t:roman-numerals} that is {r:I} {r:vi} {r:IV} {r:V}: the chords on the 1st, 6th, 4th and 5th notes of the scale. The small {r:vi} is the minor one.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: [...FIFTIES_IN_G], beats: 4, tempo: 72 }, label: 'Hear chart 1' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each numeral of chart 1 with its chord in {k:G major}.',
      pairs: [
        { left: '{r:I}', right: '{c:G}' },
        { left: '{r:vi}', right: '{c:Em}' },
        { left: '{r:IV}', right: '{c:C}' },
        { left: '{r:V}', right: '{c:D}' },
      ],
      explain: 'Count up the {k:G major} scale: {n:G} is 1, {n:C} is 4, {n:D} is 5 and {n:E} is 6, so {r:vi} is {c:Em}.',
    },
    toolTask({
      id: 'fifties-jam',
      title: 'Chart 1 with the band',
      tool: 'progressions',
      params: ['fifties-i-vi-iv-v', 'g', 'jam'],
      minutes: 4,
      body: 'The band plays {c:G} {c:Em} {c:C} {c:D}. Set 72 BPM and play the folk pattern for 3 minutes without stopping. Watch the beat dots and the Next chord; if you get lost, stop, listen for the next change and come in on beat 1.',
    }),
    {
      type: 'card',
      title: 'Chart 2: one, five, six, four',
      body: 'The second, also in {k:G major}: {c:G} | {c:D} | {c:Em} | {c:C}. In numerals, {r:I} {r:V} {r:vi} {r:IV}. The same four chords as chart 1, in another order: chart 1 turns to the minor chord second, chart 2 waits until bar 3.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: [...AXIS_IN_G], beats: 4, tempo: 88 }, label: 'Hear chart 2' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete chart 2 in {k:G major}.',
      text: '{c:G} | ___ | {c:Em} | ___',
      blanks: ['{c:D}', '{c:C}'],
      bank: ['{c:Am}', '{c:Bm}'],
      explain: 'Chart 2 is {r:I} {r:V} {r:vi} {r:IV}: {c:G}, {c:D}, {c:Em}, {c:C}.',
      fact: 'two-progressions',
    },
    toolTask({
      id: 'axis-jam',
      title: 'Chart 2, and getting back in',
      tool: 'progressions',
      params: ['pop-axis', 'g', 'jam'],
      minutes: 4,
      body: 'Set 88 BPM and strum down-up eighths with the band. Then, on purpose, stop for 2 bars in the middle: listen, count, and come back in on beat 1 of the next bar. Do it three times, at different places.',
      tip: 'Your strumming hand can keep moving in the air while you wait. Then you are already in time when you come back.',
    }),
    {
      type: 'listen-choice',
      prompt: 'Which chart is the band playing?',
      sound: { kind: 'progression', chords: [...FIFTIES_IN_G], beats: 4, tempo: 80 },
      options: [
        { text: 'Chart 1: {r:I} {r:vi} {r:IV} {r:V}', correct: true },
        { text: 'Chart 2: {r:I} {r:V} {r:vi} {r:IV}' },
      ],
      shuffle: false,
      explain: 'The minor chord came second: {c:G}, {c:Em}, {c:C}, {c:D}. That is chart 1.',
      fact: 'two-progressions',
    },
    toolTask({
      id: 'progressions-ear',
      title: 'Which progression is it?',
      tool: 'ear',
      params: ['progressions', '2'],
      minutes: 3,
      body: 'Eight progressions, each one of three: the basic cadence, the pop loop (chart 2) or the fifties progression (chart 1). Listen for where the minor chord comes. Aim for 6 out of 8, then play another round.',
    }),
    {
      type: 'tap-rhythm',
      prompt: 'You stopped for a bar. Count it silently, then tap back in on beat 1: four beats.',
      rhythm: { pattern: 'qr qr qr qr | q q q q' },
      tempo: 80,
      show: 'both',
      explain: 'A whole bar of counting, then back in exactly on beat 1 of the next bar. That is getting back in.',
    },
  ],
  facts: [
    { id: 'getting-back-in', front: 'You lose your place while the band plays. How do you get back in?', back: 'Stop strumming, listen for the next chord change, and come back in on the next beat 1.' },
    {
      id: 'two-progressions',
      front: 'Name two progressions in {k:G major} that carry a huge number of songs.',
      back: '{r:I} {r:vi} {r:IV} {r:V}: {c:G} {c:Em} {c:C} {c:D}. And {r:I} {r:V} {r:vi} {r:IV}: {c:G} {c:D} {c:Em} {c:C}.',
    },
  ],
};

// ── 5. Your own practice routine ────────────────────────────────────────────────────────────────

/** The plan's sample 20-minute routine: block and minutes. */
export const SAMPLE_ROUTINE = [
  { block: 'Tuning and warm-up', minutes: 2 },
  { block: 'One-minute changes', minutes: 4 },
  { block: 'The hard passage, slowly', minutes: 5 },
  { block: 'Songs', minutes: 6 },
  { block: 'Something new', minutes: 2 },
  { block: 'Cool-down', minutes: 1 },
] as const;

const yourPracticeRoutine: TeacherLesson = {
  id: 'your-practice-routine',
  title: 'Your own practice routine',
  teaches: 'Short and regular beats long and rare: a daily session with a shape, ending on something that went well.',
  minutes: 5,
  skill: 'teacher:mia:your-practice-routine',
  steps: [
    {
      type: 'card',
      title: 'Short and regular',
      body: 'You will not have a teacher beside you forever, so you need a habit. Short and regular beats long and rare: 15 focused minutes a day usually does more than two hours on a Sunday. Hands learn from repeating and resting, a little every day.',
    },
    {
      type: 'true-false',
      statement: 'Two hours on a Sunday usually does more than 15 focused minutes every day.',
      answer: false,
      explain: 'Fifteen focused minutes a day usually does more. Your hands learn between sessions, so many short ones beat one long one.',
      fact: 'short-and-regular',
    },
    {
      type: 'card',
      title: 'A session has a shape',
      body: {
        text: 'Here is a 20-minute routine:\n2 min tuning and warm-up\n4 min one-minute changes\n5 min the hard passage, slowly\n6 min songs you love\n2 min something new\n1 min cool-down\nThe hard thing comes early, while you are fresh; songs come after it, as the reward.',
        say: 'Here is a 20-minute routine. 2 minutes tuning and warm-up. 4 minutes one-minute changes. 5 minutes the hard passage, slowly. 6 minutes songs you love. 2 minutes something new. 1 minute cool-down. The hard thing comes early, while you are fresh; songs come after it, as the reward.',
      },
    },
    {
      type: 'order',
      prompt: 'Put the blocks of a good session in order.',
      tiles: ['Tune, warm up', 'Technique', 'Hard thing, slow', 'A song you love', 'Something new', 'Cool-down'],
      explain: 'Tune and warm up, a technique exercise, one hard thing played slowly, a song you love, something new, and a cool-down to finish.',
      fact: 'session-shape',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each block of the 20-minute routine with its time.',
      pairs: [
        { left: 'Tuning and warm-up', right: '2 minutes' },
        { left: 'One-minute changes', right: '4 minutes' },
        { left: 'The hard passage', right: '5 minutes' },
        { left: 'Songs', right: '6 minutes' },
      ],
      explain: '2 minutes to tune and warm up, 4 of changes, 5 on the hard passage and 6 of songs; then 2 minutes of something new and 1 to cool down: 20 in all.',
    },
    toolTask({
      id: 'build-routine',
      title: 'Build your own routine',
      tool: 'practice',
      minutes: 4,
      body: 'Pick a length that fits your day, then add, swap and resize blocks until your plan has the shape: warm-up, technique, the hard thing, songs, something new, cool-down. Save it as a routine. Then set your daily goal in Me, under Settings.',
      tip: 'Be honest about your time. Ten minutes you really do beats thirty you skip.',
    }),
    {
      type: 'choice',
      prompt: 'How do you play the hard passage in your routine?',
      options: [
        { text: 'Slowly, at a tempo where it is clean', correct: true },
        { text: 'At full speed, until it works', why: 'At full speed you practise the mistakes. Slow and clean, then a little faster.' },
        { text: 'Only when you feel like it', why: 'The hard thing is the block that moves you forward most. Give it its 5 minutes every day.' },
      ],
      explain: 'Slow and clean first. When it is clean twice in a row, go a little faster.',
    },
    toolTask({
      id: 'run-routine',
      title: 'Run your routine once',
      tool: 'practice',
      params: ['routines'],
      minutes: 15,
      body: 'Start the routine you saved and let the timer run each block. When a block ends, move on, even if you want more: there is always tomorrow.',
    }),
    {
      type: 'card',
      title: 'End well',
      body: 'End on something that went well, so you want to come back tomorrow. Then write down one thing to work on next time. And always: sore fingertips are normal, but aching joints, numbness, tingling or sharp pain mean stop and rest.',
      tip: 'Play Without Pain, in Technique, has the habits that keep you playing for years.',
    },
    {
      type: 'choice',
      prompt: 'Your session is nearly over. What do you play last?',
      options: [
        { text: 'Something that went well, then the cool-down', correct: true },
        { text: 'The hardest thing, once more', why: 'End on a success, so you want to come back. The hard thing belongs earlier.' },
        { text: 'Something brand new', why: 'Something new comes before the end. Finish on something that went well.' },
      ],
      explain: 'End on something that went well, cool down, and write down one thing for tomorrow.',
      fact: 'end-well',
    },
    techniqueTask({
      id: 'cool-down',
      title: 'The Cool-Down',
      exercise: 'tech-cool-down',
      minutes: 3,
      body: 'Two minutes of slow arpeggios, a shake-out, and then the question: what felt tense today? Your jaw, shoulders, thumb or wrist? Note it, so you can watch for it next time.',
    }),
    {
      type: 'choice',
      prompt: 'Halfway through your routine, your wrist starts to ache. What do you do?',
      options: [
        { text: 'Stop and rest', correct: true },
        { text: 'Finish the routine first', why: 'An aching joint means stop now. The routine can wait until tomorrow.' },
        { text: 'Squeeze harder to get through it', why: 'More pressure means more strain. Stop and rest.' },
      ],
      explain: 'Aching joints, numbness, tingling or sharp pain mean stop and rest. If it lasts, see a doctor or physiotherapist.',
    },
  ],
  facts: [
    { id: 'short-and-regular', front: 'Fifteen minutes every day, or two hours on Sunday?', back: 'Fifteen focused minutes a day usually does more. Short and regular beats long and rare.' },
    { id: 'session-shape', front: 'What shape does a good practice session have?', back: 'Tune and warm up, technique, one hard thing slowly, a song you love, something new, and a cool-down.' },
    { id: 'end-well', front: 'How do you end a practice session?', back: 'On something that went well. Then write down one thing to work on tomorrow.' },
  ],
};

// ── 6. Graduation concert (milestone) ───────────────────────────────────────────────────────────

/** Für Elise, the encore: the pickup and bars 1 to 3 as the library has them (16 notes). */
export const ELISE_ENCORE: TabNote[] = [
  { string: 1, fret: 0, duration: 's' },
  { string: 2, fret: 4, duration: 's' },
  { string: 1, fret: 0, duration: 's' },
  { string: 2, fret: 4, duration: 's' },
  { string: 1, fret: 0, duration: 's' },
  { string: 2, fret: 0, duration: 's' },
  { string: 2, fret: 3, duration: 's' },
  { string: 2, fret: 1, duration: 's' },
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

/** The folk pattern as a rhythm: down, down-up, (miss), up, down-up. */
export const FOLK_RHYTHM = 'q e q e e e';

const graduationConcert: TeacherLesson = {
  id: 'graduation-concert',
  title: 'Graduation concert',
  teaches: 'A concert keeps going: tune, warm up, then play the set straight through, song after song.',
  minutes: 5,
  skill: 'teacher:mia:graduation-concert',
  steps: [
    {
      type: 'card',
      title: 'Look how far you have come',
      body: 'You started with one open string. Now you have 14 open chords, {c:F} and {c:Bm}, power chords, strums in 4/4, 3/4 and 6/8, box 1 and a 12-bar solo. Your concert has four songs: Für Elise, Auld Lang Syne, the blues in A with a solo, and one you choose.',
      tip: 'Record the whole concert on your phone if you can, and share it with someone if you like.',
    },
    {
      type: 'choice',
      prompt: 'A note goes wrong in the middle of your concert. What do you do?',
      options: [
        { text: 'Keep going, in on the next beat', correct: true },
        { text: 'Stop and play that bar again', why: 'A stop is the one thing every listener notices. Let the note go.' },
        { text: 'Skip to the next song', why: 'Finish the song: the next beat is right there.' },
      ],
      explain: 'Keep going. Nobody remembers a wrong note, but everybody notices a stop.',
      fact: 'concert-keep-going',
    },
    techniqueTask({
      id: 'concert-warm-up',
      title: 'Tune up and warm up',
      exercise: 'tech-warm-up',
      minutes: 6,
      body: 'As before a real concert: tune all six strings first, then the Five-Minute Warm-Up. Nothing fast, nothing hard.',
    }),
    playerTask({
      id: 'concert-elise',
      title: 'Song 1: Für Elise',
      song: 'fur-elise-theme',
      minutes: 2,
      body: 'Your opener, at 60 BPM, its full tempo: 120 eighth-note counts a minute. Then straight on to the next song.',
    }),
    {
      type: 'choice',
      prompt: 'In the {c:E} answer of Für Elise, which note do you keep?',
      options: [
        { text: '{n:G#}, on string 3, fret 1', correct: true },
        { text: '{n:G}, the open string 3', why: 'The open {n:G} turns the chord into {c:Em}. Keep {n:G#}.' },
      ],
      explain: '{c:E} is {n:E} {n:G#} {n:B}. The {n:G#} on string 3, fret 1 pulls back up to {n:A}.',
    },
    playerTask({
      id: 'concert-auld-lang-syne',
      title: 'Song 2: Auld Lang Syne',
      song: 'auld-lang-syne',
      minutes: 3,
      body: 'Strummed, at 80 BPM. Let each pickup go by and strum on beat 1. Where the chart shows the open {c:Bm7}, play your {c:Bm} barre instead: your concert\'s barre chord.',
    }),
    toolTask({
      id: 'concert-blues',
      title: 'Song 3: the blues in A',
      tool: 'progressions',
      params: ['blues-12-bar', 'a', 'jam'],
      minutes: 3,
      body: 'Set 84 BPM and 2 times through. The first time, play the 12-Bar Blues Shuffle in A; the second time, your box 1 solo, a phrase every two bars, landing on {n:A}.',
    }),
    {
      type: 'choice',
      prompt: 'Your barre chord is not clean yet. What matters most?',
      options: [
        { text: 'That it lands on time', correct: true },
        { text: 'That every string rings, even if late', why: 'A late chord pulls the whole song off the beat. On time first; clean comes with practice.' },
        { text: 'Leaving it out', why: 'A gap is louder than an imperfect chord. Land it on the beat.' },
      ],
      explain: 'On time first. The beat holds the concert together; the shape gets cleaner every week.',
    },
    playerTask({
      id: 'concert-choice',
      title: 'Song 4: your choice',
      song: 'amazing-grace',
      minutes: 3,
      body: 'Amazing Grace is ready at 84 BPM, or open any song you love in the Songs library. Play it to the end, then bow.',
    }),
    {
      type: 'card',
      title: 'Ready for Dev',
      body: 'Next, Dev takes over and shows you the whole neck, built on what you can do now. His four checks: {c:G} to {c:C} and {c:Am} to {c:F}, 30 clean changes a minute; the {c:F} barre on six strings; the folk pattern at 90 BPM; box 1 in eighths at 80 BPM.',
    },
    {
      type: 'play-chord',
      prompt: 'Check: strum the full {c:F} barre, then pick it string by string. All six should ring.',
      chord: 'F',
      frets: '133211',
      explain: '{c:F} is {n:F}, {n:A} and {n:C}. A dead string usually means finger 1 needs rolling onto its bony edge, closer to the fret.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'F',
        frets: '133211',
        accept: 'this-shape',
        prompt: 'Build the full {c:F} barre.',
        explain: 'Finger 1 across fret 1, finger 2 on string 3 fret 2, fingers 3 and 4 on strings 5 and 4 at fret 3.',
      },
      fact: 'dev-checks',
    },
    toolTask({
      id: 'check-changes',
      title: 'Check: one-minute changes',
      tool: 'chords',
      params: ['trainer', 'g-major', 'c-major'],
      minutes: 3,
      body: 'One minute of {c:G} to {c:C}, then pick {c:Am} and {c:F} for another minute. Count only clean changes; 30 or more is ready for Dev.',
    }),
    toolTask({
      id: 'check-metronome',
      title: 'Check: the folk pattern and box 1',
      tool: 'metronome',
      minutes: 4,
      body: 'At 90 BPM: the folk pattern, two bars each of {c:G}, {c:C} and {c:D}, round and round. At 80 BPM: box 1 up and down in eighth notes, two per click.',
    }),
    {
      type: 'tap-rhythm',
      prompt: 'The folk pattern at 90 BPM: down, down-up, (miss), up, down-up.',
      rhythm: { pattern: FOLK_RHYTHM },
      tempo: 90,
      show: 'both',
      explain: 'A down on 1, down-up on 2, nothing new on 3, then up on its "and" and down-up on 4: six strums a bar.',
    },
    {
      type: 'play-phrase',
      id: 'show',
      prompt: 'Your encore: the opening of Für Elise. Rock the open string 1 against string 2, fret 4, then the two answers.',
      notes: [...ELISE_ENCORE],
      octave: 'exact',
      tempo: 60,
      pass: 0.8,
      explain: '{n:E} {n:D#} {n:E} {n:D#} {n:E} {n:B} {n:D} {n:C}, then {n:A} {n:C} {n:E} {n:A} and {n:B} {n:E} {n:G#} {n:B}. About 8 notes in 10 is a pass.',
      alternative: {
        type: 'order',
        prompt: 'Put the opening of Für Elise in order.',
        tiles: ['{n:E} {n:D#}', '{n:E} {n:D#}', '{n:E} {n:B}', '{n:D} {n:C}', '{n:A} {n:C} {n:E} {n:A}', '{n:B} {n:E} {n:G#} {n:B}'],
        explain: 'The rocking {n:E} {n:D#} {n:E} {n:D#} {n:E}, then {n:B} {n:D} {n:C}, the {c:Am} answer {n:A} {n:C} {n:E} {n:A}, and the {c:E} answer {n:B} {n:E} {n:G#} {n:B}.',
      },
    },
  ],
  facts: [
    { id: 'concert-keep-going', front: 'Something goes wrong in a concert. What do you do?', back: 'Keep going, in on the next beat. Nobody remembers a wrong note; everybody notices a stop.' },
    {
      id: 'dev-checks',
      front: 'What are the four checks that show you are ready for Dev?',
      back: 'Changes {c:G} to {c:C} and {c:Am} to {c:F} (30 clean in a minute), the {c:F} barre on all six strings, the folk pattern at 90 BPM, box 1 in eighths at 80 BPM.',
    },
  ],
};

/** Unit 12 of Mia's course: the last one. */
const unit: TeacherUnit = {
  id: 'mia-playing-with-others',
  title: 'Playing with others',
  theme: 'songs',
  description: 'Tune by ear, hold your part in a round, use a capo, follow a chart with the band, build a routine and give a concert.',
  lessons: [tuneWithoutATuner, roundsAndDuets, theCapo, jammingWithTheBand, yourPracticeRoutine, graduationConcert],
  checkpoint: { sample: 8, maxMistakes: 2 },
  milestone: {
    lesson: 'graduation-concert',
    step: 'show',
    piece: 'Für Elise',
    song: 'fur-elise-theme',
    celebrate: 'You gave a whole concert and played Für Elise as your encore. From one open string to barre chords, the blues and a solo of your own: you are a guitarist. Dev takes it from here, and everything he shows you stands on this.',
  },
  glossary: [
    { id: 'beating', term: 'beating', definition: 'The slow wobble you hear when two notes are nearly, but not quite, the same. It slows down as they get closer and stops when they match.' },
    { id: 'duet', term: 'duet', definition: 'A piece for two players, each with their own part.' },
  ],
};

export default unit;
