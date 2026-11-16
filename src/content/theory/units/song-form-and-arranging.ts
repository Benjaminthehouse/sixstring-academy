/**
 * Theory Path, unit 41: Song form, arranging and writing. Written from the syllabus entries in
 * `src/content/plan/theory-path.json` (unit `song-form-and-arranging`), one lesson per entry, in
 * order: each lesson opens with the "on the guitar" picture, asks the planned exercises, ends with
 * the planned drills, and turns every planned fact into a review card.
 *
 * Every chord shape, melody note, bass note, cadence and numeral is cross-checked against
 * `@/core/theory` and `@/core/guitar` in `song-form-and-arranging.test.ts`. The song map, the
 * period, the bass lines and the progressions are original; the chord melody uses the first phrase
 * of Beethoven's "Ode to Joy" (public domain).
 *
 * Notes for readers of the code:
 * - A lesson sound plays one part at a time. "Verse or chorus?" is asked from the chords of the
 *   song map (the verse has Em second, the chorus D), "two guitars" plays guitar 1's chord and then
 *   guitar 2's, and "melody on top" plays a chord rolled from low to high after the melody note,
 *   so every listening question is answerable from what really sounds.
 * - A play step listens for single notes, so the chord-melody play step plays the tune on strings
 *   1 and 2 (the line that must ring on top), and the next steps put the chord shapes under it.
 */
import type { Lesson, TabNote, Unit } from '@/lessons';

const U = 'song-form-and-arranging';

type Dur = 'w' | 'h' | 'q.' | 'q' | 'e';
const n = (string: number, fret: number, duration: Dur): TabNote => ({ string, fret, duration });
const rest = (duration: Dur): TabNote => ({ rest: true, duration });

/** The song map's sections, in G. */
const VERSE = ['G', 'Em', 'C', 'D'];
const PRE_CHORUS = ['C', 'D', 'C', 'D'];
const CHORUS = ['G', 'D', 'Em', 'C'];
const BRIDGE = ['Em', 'D', 'C', 'D'];
/** The letters of the forms lesson: A is G to C, B is Em to D. */
const A = ['G', 'C'];
const B = ['Em', 'D'];

/** An original eight-bar period in G, melody on strings 1 to 3 in first position. Bars 1 to 4 end on A over D. */
const ANTECEDENT = [
  n(2, 0, 'q'), n(2, 3, 'q'), n(1, 3, 'h'),
  n(1, 0, 'q'), n(2, 1, 'q'), n(1, 0, 'h'),
  n(2, 3, 'q'), n(2, 0, 'q'), n(3, 0, 'q'), n(2, 0, 'q'),
  n(3, 2, 'w'),
];
/** Bars 3 and 4 alone, the last note shortened: what the play step asks for. */
const ANTECEDENT_END = [n(2, 3, 'q'), n(2, 0, 'q'), n(3, 0, 'q'), n(2, 0, 'q'), n(3, 2, 'h')];
/** Bars 5 to 8: the same start, then D7 to G. */
const CONSEQUENT = [
  n(2, 0, 'q'), n(2, 3, 'q'), n(1, 3, 'h'),
  n(1, 0, 'q'), n(2, 1, 'q'), n(1, 0, 'h'),
  n(1, 2, 'q'), n(2, 3, 'q'), n(2, 1, 'q'), n(3, 2, 'q'),
  n(3, 0, 'w'),
];
/** The chords under the period, one a bar. */
const PERIOD_CHORDS = ['G', 'C', 'G', 'D', 'G', 'C', 'D7', 'G'];

/** Guitar 1's open G (320003), picked low to high. */
const OPEN_G = [n(6, 3, 'e'), n(5, 2, 'e'), n(4, 0, 'e'), n(3, 0, 'e'), n(2, 0, 'e'), n(1, 3, 'e'), rest('q')];
/** Guitar 2's G high on strings 3-2-1 (frets 12-12-10), and a G inside guitar 1's range (frets 4-3-3). */
const HIGH_G = [n(3, 12, 'q'), n(2, 12, 'q'), n(1, 10, 'h')];
const MIDDLE_G = [n(3, 4, 'q'), n(2, 3, 'q'), n(1, 3, 'h')];

/** "Ode to Joy" (Beethoven), first phrase in C, on strings 1 and 2. */
const ODE = [
  n(1, 0, 'q'), n(1, 0, 'q'), n(1, 1, 'q'), n(1, 3, 'q'),
  n(1, 3, 'q'), n(1, 1, 'q'), n(1, 0, 'q'), n(2, 3, 'q'),
  n(2, 1, 'q'), n(2, 1, 'q'), n(2, 3, 'q'), n(1, 0, 'q'),
  n(1, 0, 'q.'), n(2, 3, 'e'), n(2, 3, 'h'),
];

/** The opening of the tune, landing on the G that carries the G chord in bar 2. */
const ODE_OPENING = [n(1, 0, 'q'), n(1, 0, 'q'), n(1, 1, 'q'), n(1, 3, 'q'), n(1, 3, 'h')];

/** Root and 5th under G C D G, strings 6 to 4. */
const ROOT_FIFTH = [n(6, 3, 'h'), n(5, 5, 'h'), n(5, 3, 'h'), n(6, 3, 'h'), n(4, 0, 'h'), n(5, 0, 'h'), n(6, 3, 'w')];
/** A walking line under G C D G: a note a beat, a half-step approach on each beat 4. */
const WALKING = [
  n(6, 3, 'q'), n(5, 0, 'q'), n(5, 2, 'q'), n(5, 4, 'q'),
  n(5, 3, 'q'), n(5, 2, 'q'), n(5, 0, 'q'), n(5, 4, 'q'),
  n(4, 0, 'q'), n(5, 3, 'q'), n(5, 0, 'q'), n(6, 2, 'q'),
  n(6, 3, 'w'),
];

const songSections: Lesson = {
  id: 'song-sections',
  title: 'Verse, chorus, bridge',
  teaches: 'Song sections have jobs: the verse tells the story, the chorus repeats the main idea, the bridge contrasts.',
  minutes: 3,
  skill: `theory:${U}:song-sections`,
  steps: [
    {
      type: 'card',
      title: 'A map of a song',
      body: 'Songs are built from sections with different jobs. The map of an original song in G:\nIntro, Verse, Pre-chorus, Chorus,\nVerse, Pre-chorus, Chorus,\nBridge, Chorus, Outro.\nIt uses four open chords: {c:G} (320003), {c:C} (x32010), {c:D} (xx0232) and {c:Em} (022000).',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: CHORUS, beats: 4, tempo: 96 }, label: 'Hear the chorus' },
    },
    {
      type: 'card',
      title: 'Who does what',
      body: 'The {t:verse} tells the story: new words each time over mostly the same music, here {c:G} {c:Em} {c:C} {c:D}. The {t:chorus} repeats the main idea, usually with the same words: {c:G} {c:D} {c:Em} {c:C}. The {t:song-bridge|bridge}, {c:Em} {c:D} {c:C} {c:D}, brings contrast before the last chorus.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: VERSE, beats: 4, tempo: 96 }, label: 'Hear the verse' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each section with its job.',
      pairs: [
        { left: 'Verse', right: 'Tells the story' },
        { left: 'Chorus', right: 'The main idea, repeated' },
        { left: 'Bridge', right: 'Brings contrast' },
        { left: 'Intro', right: 'Opens the song' },
      ],
      explain: 'The verse moves the story on, the chorus comes back with the main idea, the bridge gives something new before the last chorus, and the intro sets the scene.',
      fact: 'form-verse-chorus',
    },
    {
      type: 'listen-choice',
      prompt: 'Listen. Is this the verse ({c:G} {c:Em} {c:C} {c:D}) or the chorus ({c:G} {c:D} {c:Em} {c:C})?',
      sound: { kind: 'progression', chords: CHORUS, beats: 4, tempo: 96 },
      options: [{ text: 'The verse' }, { text: 'The chorus', correct: true }],
      shuffle: false,
      explain: 'The second chord was major, {c:D}, and the third minor, {c:Em}: {c:G} {c:D} {c:Em} {c:C}, the chorus. The verse has the minor chord second.',
    },
    {
      type: 'order',
      prompt: 'Put this short verse-chorus song in order. It starts with the story and ends on the main idea, after a contrast.',
      tiles: ['Verse', 'Chorus', 'Bridge', 'Chorus'],
      explain: 'Verse, chorus, then the bridge for contrast, then the chorus again: the main idea gets the last word.',
    },
    {
      type: 'choice',
      prompt: 'Which section usually has the same words every time it comes back?',
      options: [
        { text: 'The chorus', correct: true },
        { text: 'The verse', why: 'The verse keeps the music but changes the words: it moves the story on.' },
        { text: 'The bridge', why: 'The bridge usually comes only once, for contrast.' },
        { text: 'The intro', why: 'The intro is often played with no words at all.' },
      ],
      explain: 'The chorus repeats the main idea, usually with the same words, which is why it is the part people sing along to.',
    },
    {
      type: 'card',
      title: 'Before and around',
      body: 'A {t:pre-chorus} builds from the verse into the chorus. Here it is {c:C} {c:D} {c:C} {c:D}: it keeps away from {c:G}, so the chorus arrives like a release. An {t:intro} opens the song and an {t:outro} closes it.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: [...PRE_CHORUS, ...CHORUS], beats: 2, tempo: 96 }, label: 'Pre-chorus into chorus' },
    },
    {
      type: 'true-false',
      statement: 'A bridge usually comes before the first verse.',
      answer: false,
      explain: 'The intro comes first. A bridge usually comes late, after a couple of choruses, to bring contrast before the last chorus.',
      fact: 'form-bridge',
    },
    {
      type: 'choice',
      prompt: 'In the map, the bridge is {c:Em} {c:D} {c:C} {c:D}. What makes it a contrast?',
      options: [
        { text: 'It stays away from the home chord, {c:G}', correct: true },
        { text: 'It changes key', why: 'Every chord is still in {k:G major}. The contrast comes from staying away from {c:G}.' },
        { text: 'It uses no chords', why: 'It has four chords; they just avoid the home chord.' },
      ],
      explain: 'Verse and chorus both start on {c:G}. The bridge starts on {c:Em} and never touches {c:G}, so the last chorus feels like coming home.',
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the sentence.',
      text: 'A ___ builds from the verse into the chorus; an ___ opens the song and an ___ closes it.',
      blanks: ['pre-chorus', 'intro', 'outro'],
      bank: ['bridge', 'verse'],
      explain: 'The pre-chorus builds the tension, the intro opens the song and the outro closes it.',
      fact: 'form-pre-chorus-intro-outro',
    },
  ],
  facts: [
    {
      id: 'form-verse-chorus',
      front: 'What do a verse and a chorus do?',
      back: 'A verse tells the story, with changing words over mostly the same music; a chorus repeats the main idea, usually with the same words each time.',
    },
    { id: 'form-bridge', front: 'What does a bridge do, and when does it come?', back: 'It brings contrast, often with new chords, before a return to the chorus.' },
    {
      id: 'form-pre-chorus-intro-outro',
      front: 'What are a pre-chorus, an intro and an outro?',
      back: 'A pre-chorus builds from the verse into the chorus; an intro opens the song and an outro closes it.',
    },
  ],
};

const commonForms: Lesson = {
  id: 'common-forms',
  title: 'Forms by letter',
  teaches: 'Forms are written as letters for sections, from the 32-bar AABA song to binary, ternary and rondo.',
  minutes: 3,
  skill: `theory:${U}:common-forms`,
  steps: [
    {
      type: 'card',
      title: 'Letters for sections',
      body: 'Musicians name sections with letters: the same letter means the same music. Here A is {c:G} (320003) to {c:C} (x32010), and B is {c:Em} (022000) to {c:D} (xx0232). The classic 32-bar song is {t:aaba-form|AABA}: three 8-bar A sections and a contrasting 8-bar bridge, B.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: [...A, ...B], beats: 4, tempo: 96 }, label: 'Hear A, then B' },
    },
    {
      type: 'choice',
      prompt: 'How many bars long is the AABA song form?',
      options: [{ text: '12' }, { text: '16' }, { text: '24' }, { text: '32', correct: true }],
      shuffle: false,
      explain: 'Four sections of 8 bars, A A B A: 4 × 8 = 32 bars. Twelve is the length of a blues.',
      fact: 'form-aaba',
    },
    {
      type: 'listen-choice',
      prompt: 'A is {c:G} {c:C}; B is {c:Em} {c:D}. Hear four sections: AABA or ABAB?',
      sound: { kind: 'progression', chords: [...A, ...A, ...B, ...A], beats: 2, tempo: 96 },
      options: [{ text: { text: 'AABA', say: 'A A B A' }, correct: true }, { text: { text: 'ABAB', say: 'A B A B' } }],
      shuffle: false,
      explain: '{c:G} {c:C} twice, then {c:Em} {c:D}, then {c:G} {c:C} again: A, A, B, A.',
    },
    {
      type: 'card',
      title: 'Song forms and classical forms',
      body: '{t:verse-chorus-form|Verse-chorus form} alternates verses and choruses, often with a bridge near the end. Classical pieces use {t:binary-form|binary} form, AB; {t:ternary-form|ternary} form, ABA; and {t:rondo} form, ABACA, where A keeps coming back. A 12-bar blues played again and again is one A, repeated.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each form with its letters.',
      pairs: [
        { left: { text: 'AB', say: 'A B' }, right: 'Binary' },
        { left: { text: 'ABA', say: 'A B A' }, right: 'Ternary' },
        { left: { text: 'ABACA', say: 'A B A C A' }, right: 'Rondo' },
        { left: { text: 'AABA', say: 'A A B A' }, right: '32-bar song form' },
      ],
      explain: 'Binary has two sections, ternary three with a return, rondo a refrain between contrasts, and the 32-bar song three A sections round a bridge.',
      fact: 'form-classical',
    },
    {
      type: 'order',
      prompt: 'Build a rondo: put its sections in order.',
      tiles: ['A', 'B', 'A', 'C', 'A'],
      explain: 'A rondo is A B A C A: the main section, A, comes back between each contrast.',
    },
    {
      type: 'true-false',
      statement: 'In AABA form, the B section is the bridge.',
      answer: true,
      explain: 'B is the contrasting 8 bars between the second and third A sections: the bridge.',
    },
    {
      type: 'choice',
      prompt: 'In verse-chorus form, where does a bridge usually come?',
      options: [
        { text: 'Near the end, before the last chorus', correct: true },
        { text: 'At the very start', why: 'The intro opens the song; a bridge needs choruses before it to contrast with.' },
        { text: 'Between every verse and chorus', why: 'That is where a pre-chorus goes, building into the chorus.' },
      ],
      explain: 'Verse-chorus form alternates verses and choruses, then often brings a bridge near the end, before the final chorus.',
      fact: 'form-verse-chorus-form',
    },
    {
      type: 'choice',
      prompt: 'A 12-bar blues is played four times through. How is that written in letters?',
      options: [
        { text: { text: 'AAAA: one A, repeated', say: 'A A A A: one A, repeated' }, correct: true },
        { text: { text: 'ABAB', say: 'A B A B' }, why: 'There is no B: every chorus of the blues uses the same 12 bars.' },
        { text: { text: 'AABA', say: 'A A B A' }, why: 'That needs a contrasting bridge, which a plain blues does not have.' },
      ],
      explain: 'Each time round uses the same 12 bars, so the whole piece is one A section, repeated.',
    },
  ],
  facts: [
    {
      id: 'form-aaba',
      front: 'What is AABA form?',
      back: 'The 32-bar song form: three 8-bar A sections and an 8-bar contrasting bridge (B).',
    },
    { id: 'form-verse-chorus-form', front: 'What is verse-chorus form?', back: 'Verses and choruses in turn, often with a bridge near the end.' },
    {
      id: 'form-classical',
      front: 'Give the letters of binary, ternary and rondo form.',
      back: 'Binary AB, ternary ABA, rondo ABACA.',
      ask: {
        type: 'match-pairs',
        prompt: 'Match each classical form with its letters.',
        pairs: [
          { left: 'Binary', right: { text: 'AB', say: 'A B' } },
          { left: 'Ternary', right: { text: 'ABA', say: 'A B A' } },
          { left: 'Rondo', right: { text: 'ABACA', say: 'A B A C A' } },
        ],
        explain: 'Binary is two sections, ternary three with a return, and rondo brings A back between each contrast.',
      },
    },
  ],
};

const phrasesAndPeriods: Lesson = {
  id: 'phrases-and-periods',
  title: 'Phrases and periods',
  teaches: 'Phrases are often 2, 4 or 8 bars; two phrases ending on a half, then an authentic cadence, make a period.',
  minutes: 3,
  skill: `theory:${U}:phrases-and-periods`,
  steps: [
    {
      type: 'card',
      title: 'Musical sentences',
      body: 'Music is built from {t:phrase|phrases}, musical sentences, often 2, 4 or 8 bars long; many song sections are 8 or 16 bars. Here is a 4-bar phrase in G over {c:G} {c:C} {c:G} {c:D}. It stops on {c:D}, the {r:V}: a half {t:cadence}, like a question.',
      figure: {
        kind: 'staff',
        key: 'G major',
        time: '4/4',
        notes: [
          { note: 'B3', duration: 'q' }, { note: 'D4', duration: 'q' }, { note: 'G4', duration: 'h' },
          { note: 'E4', duration: 'q' }, { note: 'C4', duration: 'q' }, { note: 'E4', duration: 'h' },
          { note: 'D4', duration: 'q' }, { note: 'B3', duration: 'q' }, { note: 'G3', duration: 'q' }, { note: 'B3', duration: 'q' },
          { note: 'A3', duration: 'w' },
        ],
        caption: 'Over {c:G} {c:C} {c:G} {c:D}: the phrase ends on {n:A}, over {c:D}.',
      },
    },
    {
      type: 'true-false',
      statement: 'All phrases are exactly four bars long.',
      answer: false,
      explain: 'Four bars is common, but phrases of 2 and 8 bars are common too, and 3 or 5 bars happen. What makes a phrase is a musical thought ending in a cadence.',
      fact: 'form-phrase-lengths',
    },
    {
      type: 'card',
      title: 'Question and answer',
      body: 'Answer it with a second phrase that ends with an authentic cadence, {c:D7} (xx0212) to {c:G}. Together they make a {t:period}: the {t:antecedent} ends on {r:V}, the {t:consequent} goes {r:V} to {r:I}. The tune sits on strings 1 to 3 over {c:G} (320003), {c:C} (x32010) and {c:D} (xx0232).',
      figure: { kind: 'audio', sound: { kind: 'tab', tempo: 96, notes: [...ANTECEDENT, ...CONSEQUENT] }, label: 'Hear the whole period' },
    },
    {
      type: 'choice',
      prompt: 'In a period, which phrase ends on {r:V}?',
      options: [
        { text: 'The first, the antecedent', correct: true },
        { text: 'The second, the consequent', why: 'The second phrase answers with an authentic cadence, {r:V} to {r:I}.' },
        { text: 'Both of them', why: 'If both stopped on {r:V}, nothing would answer the question.' },
      ],
      shuffle: false,
      explain: 'The antecedent stops on {r:V}, a half cadence, like a question; the consequent answers with {r:V} to {r:I}.',
      fact: 'form-period',
    },
    {
      type: 'listen-choice',
      prompt: 'Does this phrase end with a half cadence or an authentic cadence?',
      sound: { kind: 'progression', chords: PERIOD_CHORDS.slice(4), beats: 4, tempo: 90 },
      options: [{ text: 'A half cadence, on {r:V}' }, { text: 'An authentic cadence, {r:V} to {r:I}', correct: true }],
      shuffle: false,
      explain: 'It went {c:G} {c:C} {c:D7} {c:G}: {r:V7} to {r:I} at the end, an authentic cadence. That is the consequent of the period.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each word with what it means.',
      pairs: [
        { left: 'Antecedent', right: 'Ends with a half cadence' },
        { left: 'Consequent', right: 'Ends {r:V} to {r:I}' },
        { left: 'Period', right: 'Question plus answer' },
      ],
      explain: 'A period is two phrases: the antecedent asks with a half cadence, the consequent answers with an authentic cadence.',
    },
    {
      type: 'card',
      title: 'Bars in fours',
      body: 'Listeners feel groups of four bars like big beats, a {t:hypermeter}: bar 1 of each group feels strong. That is why a 3-bar or 5-bar phrase sounds surprising. Used on purpose, the surprise can be a good thing.',
    },
    {
      type: 'choice',
      prompt: 'Why does a 5-bar phrase sound surprising?',
      options: [
        { text: 'We hear bars in groups of four, like big beats', correct: true },
        { text: 'Five bars cannot hold a cadence', why: 'Any phrase length can end with a cadence.' },
        { text: 'It is out of time', why: 'Every bar is still in time; only the grouping of bars changes.' },
      ],
      explain: 'The ear expects bars to come in fours. A fifth bar arrives where it expects a new phrase, so it sounds like a stretch or a surprise.',
      fact: 'form-hypermeter',
    },
    {
      type: 'type-answer',
      prompt: 'A song section is made of two 8-bar phrases. How many bars long is it?',
      answer: { kind: 'number', value: 16 },
      input: 'keypad',
      explain: '8 + 8 = 16 bars: one of the most common section lengths.',
    },
    {
      type: 'play-phrase',
      prompt: 'Play the end of the antecedent, bars 3 and 4, on strings 3 and 2. It stops on {n:A}, over {c:D}.',
      notes: ANTECEDENT_END,
      octave: 'exact',
      tempo: 90,
      explain: '{n:D} {n:B} {n:G} {n:B} spell {c:G} in bar 3; then {n:A}, the 5th of {c:D}, at string 3, fret 2: a half cadence. Let it ring, like a question.',
      alternative: {
        type: 'staff-read',
        prompt: 'The antecedent ends on this note, over {c:D}. Which note is it?',
        note: 'A3',
        key: 'G major',
        options: ['A', 'G', 'B', 'D'],
        explain: '{n:A}, in the second space as guitar music writes it: the 5th of {c:D}, so the phrase stops on {r:V}.',
      },
    },
    { generate: 'cadence-ear', params: { types: ['authentic', 'half'] } },
  ],
  facts: [
    {
      id: 'form-phrase-lengths',
      front: 'How long are phrases and song sections, usually?',
      back: 'Phrases are commonly 2, 4 or 8 bars long, and many song sections are 8 or 16 bars.',
    },
    {
      id: 'form-period',
      front: 'What is a period?',
      back: 'Two phrases: the first ends with a half cadence (the antecedent), the second with an authentic cadence (the consequent).',
    },
    {
      id: 'form-hypermeter',
      front: 'Why does a 3-bar or 5-bar phrase sound surprising?',
      back: 'Listeners feel groups of four bars like large beats, so a 3-bar or 5-bar phrase breaks the pattern.',
    },
  ],
};

const theGuitarInABand: Lesson = {
  id: 'the-guitar-in-a-band',
  title: "The guitar's jobs in a band",
  teaches: 'In a band the guitar plays rhythm, lead, riffs or fills; two guitars sound fullest in different registers.',
  minutes: 3,
  skill: `theory:${U}:the-guitar-in-a-band`,
  steps: [
    {
      type: 'card',
      title: 'Four jobs',
      body: 'In a band the guitar has four main jobs: {t:rhythm-guitar|rhythm}, the chords and the groove; {t:lead-guitar|lead}, melodies and solos; {t:riff|riffs}, short repeated figures; and {t:fill|fills}, little phrases between vocal lines. One player often switches between them in a song.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: CHORUS, beats: 4, tempo: 96 }, label: 'Guitar 1: open chords' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each job with what the guitar plays.',
      pairs: [
        { left: 'Rhythm', right: 'Chords and groove' },
        { left: 'Lead', right: 'Melody and solos' },
        { left: 'Riff', right: 'A short repeated figure' },
        { left: 'Fill', right: 'Between vocal lines' },
      ],
      explain: 'Rhythm holds the harmony and the groove, lead carries the tune or the solo, a riff is a hook you repeat, and a fill answers the singer.',
      fact: 'form-guitar-roles',
    },
    {
      type: 'card',
      title: 'Two guitars, two registers',
      body: 'Two guitars strumming the same open chords blur together. Give guitar 2 a different {t:register}: {c:G} {c:D} {c:Em} {c:C} as triads on strings 3-2-1, at frets 12-12-10, 11-10-10, 12-12-12 and 12-13-12. Or put a {t:capo} at fret 5 and play the {c:D}, {c:A}, {c:Bm} and {c:G} shapes.',
      figure: {
        kind: 'fretboard',
        frets: [9, 13],
        root: 'G',
        labels: 'degree',
        dots: [
          { string: 3, fret: 12, note: 'G4', degree: '1', role: 'root' },
          { string: 2, fret: 12, note: 'B4', degree: '3', role: 'third' },
          { string: 1, fret: 10, note: 'D5', degree: '5', role: 'fifth' },
        ],
        caption: 'Guitar 2\'s {c:G}: strings 3-2-1, frets 12-12-10.',
      },
    },
    {
      type: 'choice',
      prompt: 'Guitar 1 strums open chords. What should guitar 2 try?',
      options: [
        { text: 'High triads, or a capo position', correct: true },
        { text: 'The same open chords, louder', why: 'Two identical parts blur together, and louder only makes the blur bigger.' },
        { text: 'Low power chords on strings 6 and 5', why: 'That piles more sound into the low register, where guitar 1 and the bass already are.' },
      ],
      explain: 'A second part in another register, high triads or capo shapes, fills the space above guitar 1 instead of doubling it.',
      fact: 'form-two-guitars',
    },
    {
      type: 'listen-choice',
      prompt: 'Guitar 1 picks its {c:G}, then guitar 2 picks its {c:G}. Same register, or different registers?',
      sound: { kind: 'tab', tempo: 96, notes: [...OPEN_G, ...HIGH_G] },
      options: [{ text: 'Different: guitar 2 sits higher', correct: true }, { text: 'The same register' }],
      shuffle: false,
      explain: 'Guitar 2 played {n:G} {n:B} {n:D} from frets 12-12-10: every note at or above the top of guitar 1\'s open {c:G}. Two registers, no blur.',
    },
    {
      type: 'play-chord',
      prompt: 'Play guitar 2\'s {c:G}: strings 3-2-1 at frets 12-12-10.',
      chord: 'G',
      frets: [null, null, null, 12, 12, 10],
      explain: '{n:G} at string 3, fret 12; {n:B} at string 2, fret 12; {n:D} at string 1, fret 10. Pick only strings 3 to 1.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'G',
        frets: [null, null, null, 12, 12, 10],
        accept: 'this-shape',
        prompt: 'Build guitar 2\'s {c:G} on strings 3-2-1, frets 12-12-10.',
        explain: 'String 3 fret 12 ({n:G}), string 2 fret 12 ({n:B}), string 1 fret 10 ({n:D}): root position, high above the open chords.',
      },
    },
    {
      type: 'true-false',
      statement: 'With a bass player in the band, low root-heavy guitar voicings leave the most room for the bass.',
      answer: false,
      explain: 'The bass already covers the low roots. Low, root-heavy guitar chords crowd it and can muddy the sound; higher voicings leave it room.',
      fact: 'form-leave-room-bass',
    },
    {
      type: 'choice',
      prompt: 'Guitar 2 puts a capo at fret 5. Which open shape now sounds as {c:G}?',
      options: [
        { text: 'The {c:D} shape', correct: true },
        { text: 'The {c:C} shape', why: 'Five frets above {c:C} is {c:F}.' },
        { text: 'The {c:E} shape', why: 'Five frets above {c:E} is {c:A}.' },
        { text: 'The {c:G} shape', why: 'Five frets above {c:G} is {c:C}.' },
      ],
      explain: 'A capo at fret 5 raises every shape five half steps, a fourth: the {c:D} shape sounds as {c:G}, high and bright above guitar 1.',
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'Em',
      frets: [null, null, null, 12, 12, 12],
      accept: 'this-shape',
      prompt: 'Build guitar 2\'s {c:Em}: strings 3-2-1, all at fret 12.',
      explain: '{n:G} {n:B} {n:E} from string 3 to string 1: {c:Em} with its 3rd lowest, under one finger across fret 12.',
    },
    {
      type: 'listen-choice',
      prompt: 'Now guitar 2 plays a different {c:G}. Same register as guitar 1, or different?',
      sound: { kind: 'tab', tempo: 96, notes: [...OPEN_G, ...MIDDLE_G] },
      options: [{ text: 'Different: guitar 2 sits higher' }, { text: 'The same register', correct: true }],
      shuffle: false,
      explain: 'This {c:G}, frets 4-3-3, plays {n:B} {n:D} {n:G}, all inside the range of guitar 1\'s open {c:G}, up to the same top {n:G}. The two parts overlap.',
    },
  ],
  facts: [
    {
      id: 'form-guitar-roles',
      front: 'What jobs can the guitar play in a band?',
      back: 'Rhythm (chords), lead (melody and solos), riffs, or fills between vocal lines.',
    },
    {
      id: 'form-two-guitars',
      front: 'How do two guitars sound fullest together?',
      back: 'In different registers or voicings: one plays open chords, the other high triads or a capo position.',
    },
    {
      id: 'form-leave-room-bass',
      front: 'With a bass player, which guitar voicings leave room?',
      back: 'Higher voicings. Low, root-heavy voicings can muddy the sound with the bass.',
    },
  ],
};

const chordMelody: Lesson = {
  id: 'chord-melody',
  title: 'Chord melody',
  teaches: 'A chord-melody arrangement puts the melody on top of the chords, so one guitar plays both.',
  minutes: 4,
  skill: `theory:${U}:chord-melody`,
  steps: [
    {
      type: 'card',
      title: 'The tune on top',
      body: 'A {t:chord-melody} arrangement puts the melody on top of the chords, so one guitar plays tune and harmony together. Here is the first phrase of Beethoven\'s "Ode to Joy" in C, on strings 1 and 2. On each beat 1, a chord goes under the melody note.',
      figure: { kind: 'tab', tempo: 90, notes: ODE, caption: 'Beat 1 of bars 1 to 4: {c:C} (x32010), {c:G} (320003), {c:C} (x3201x), {c:C}.' },
    },
    {
      type: 'choice',
      prompt: 'The melody note is {n:E} over a {c:C} chord. Which {c:C} shape keeps {n:E} on top?',
      options: [
        { text: '{c:C} (x32010): open {n:E} on string 1', correct: true },
        { text: '{c:C} (x3201x): {n:C} on top', why: 'String 1 is muted, so the top note is {n:C} at string 2, fret 1.' },
        { text: '{c:C} (x35553): {n:G} on top', why: 'Its top note is {n:G} at string 1, fret 3; the {n:E} is hidden inside.' },
      ],
      explain: 'In x32010 the open high {n:E} string is the highest note, so the melody rings on top of the chord.',
      fact: 'form-melody-on-top',
    },
    {
      type: 'card',
      title: 'Building under the tune',
      body: 'Put the melody on string 1 or 2, and on each strong beat build a chord shape under it. {c:C} (x32010) keeps {n:E} on top, {c:G} (320003) keeps {n:G}, and {c:C} (x3201x), with string 1 muted, keeps {n:C}. Between chords, play single notes or small {t:double-stop|double stops}.',
      figure: { kind: 'chord', symbol: 'C', frets: 'x3201x', caption: '{c:C} (x3201x): {n:C} on top, at string 2, fret 1.' },
    },
    {
      type: 'listen-choice',
      prompt: 'The melody note is {n:E}. This {c:C} shape is rolled from low to high: is {n:E} on top, or hidden inside?',
      figure: { kind: 'audio', sound: { kind: 'notes', notes: ['E4', 'E4'], tempo: 60 }, label: 'Hear the melody note' },
      sound: { kind: 'chord', chord: 'C', frets: 'x32010', style: 'arpeggio' },
      options: [{ text: 'On top: it is the highest note', correct: true }, { text: 'Hidden inside the chord' }],
      shuffle: false,
      explain: 'x32010 rolls up {n:C} {n:E} {n:G} {n:C} and ends on the open high {n:E}: the melody note is on top.',
    },
    {
      type: 'play-phrase',
      prompt: 'Play the opening of the tune on string 1: {n:E} {n:E} {n:F} {n:G}, then {n:G} on beat 1 of bar 2, where {c:G} goes under it.',
      notes: ODE_OPENING,
      octave: 'exact',
      tempo: 90,
      explain: 'String 1: open for {n:E}, fret 1 for {n:F}, fret 3 for {n:G}. Then try the whole phrase with the beat-1 chords under it, keeping the tune the loudest note.',
      alternative: {
        type: 'choice',
        prompt: 'Which string-1 frets play the first bar of the tune, {n:E} {n:E} {n:F} {n:G}?',
        options: [{ text: '0 0 1 3', correct: true }, { text: '0 0 2 3' }, { text: '0 0 1 2' }, { text: '2 2 3 5' }],
        shuffle: false,
        explain: 'The open string is {n:E}; {n:F} is a half step up at fret 1, and {n:G} a whole step further, at fret 3.',
      },
    },
    {
      type: 'choice',
      prompt: 'Between the chords, what keeps a chord-melody moving?',
      options: [
        { text: 'Single melody notes or small double stops', correct: true },
        { text: 'A full strum on every melody note', why: 'Strumming every note buries the tune and slows you down.' },
        { text: 'Silence until the next chord', why: 'The tune has to keep going; only the harmony can rest.' },
      ],
      explain: 'Chords go under the strong beats; between them, single notes or two-note double stops carry the tune lightly.',
      fact: 'form-between-chords',
    },
    {
      type: 'true-false',
      statement: 'In a chord-melody arrangement, the melody is the lowest note of each chord.',
      answer: false,
      explain: 'The melody is the top note, where the ear follows it. The chord shape is built underneath it.',
      fact: 'form-chord-melody',
    },
    {
      type: 'fretboard-find',
      prompt: 'Bar 3 starts on {n:C}. Tap that {n:C} on string 2, where a {c:C} shape fits under it.',
      find: { note: 'C4' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 3],
      strings: [2],
      explain: 'String 2, fret 1 is {n:C}. With string 1 muted, x3201x builds {c:C} under it.',
    },
    {
      type: 'play-chord',
      prompt: 'Play {c:G} (320003) for bar 2, and let its top note, {n:G}, ring out as the melody.',
      chord: 'G',
      frets: '320003',
      explain: 'The {n:G} at string 1, fret 3 is the melody note of bar 2, beat 1, and the rest of the shape is the harmony beneath it.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'G',
        frets: '320003',
        accept: 'this-shape',
        prompt: 'Build {c:G} (320003), the shape with the melody note {n:G} on top for bar 2.',
        explain: '320003: frets 3 and 2 on strings 6 and 5, the open middle strings, and {n:G} at fret 3 of string 1 on top.',
      },
    },
    {
      type: 'listen-choice',
      prompt: 'The melody note is {n:E} again. Is it on top of this {c:C} shape, or hidden inside?',
      figure: { kind: 'audio', sound: { kind: 'notes', notes: ['E4', 'E4'], tempo: 60 }, label: 'Hear the melody note' },
      sound: { kind: 'chord', chord: 'C', frets: 'x35553', style: 'arpeggio' },
      options: [{ text: 'On top: it is the highest note' }, { text: 'Hidden inside the chord', correct: true }],
      shuffle: false,
      explain: 'x35553 rolls up {n:C} {n:G} {n:C} {n:E} {n:G}: a {n:G} sounds above the {n:E}, so the tune would be lost inside the chord.',
    },
  ],
  facts: [
    {
      id: 'form-chord-melody',
      front: 'What is a chord-melody arrangement?',
      back: 'One guitar plays the melody as the top note of the chords, so tune and harmony sound together.',
    },
    {
      id: 'form-melody-on-top',
      front: 'How do you build a chord melody?',
      back: 'Put the melody on string 1 or 2 and build a chord shape under each strong-beat melody note.',
    },
    { id: 'form-between-chords', front: 'What fills the gaps between chords in a chord melody?', back: 'Single melody notes or small double stops keep the tune moving.' },
  ],
};

const bassLines: Lesson = {
  id: 'bass-lines',
  title: 'Writing a bass line',
  teaches: 'A bass line plays chord roots on strong beats and connects them with 5ths, octaves and approach notes.',
  minutes: 3,
  skill: `theory:${U}:bass-lines`,
  steps: [
    {
      type: 'card',
      title: 'Roots on the strong beats',
      body: 'A {t:bass-line} plays each chord\'s root on beat 1, then fills with the 5th, the octave or an approach note. Under {c:G} {c:C} {c:D} {c:G}: root, then 5th, two half notes a bar, on strings 6 to 4.',
      figure: { kind: 'tab', tempo: 90, notes: ROOT_FIFTH, caption: 'Root, then 5th: {n:G} {n:D}, {n:C} {n:G}, {n:D} {n:A}, then {n:G}.' },
    },
    {
      type: 'choice',
      prompt: 'Where does a basic bass line put the chord root?',
      options: [
        { text: 'On beat 1', correct: true },
        { text: 'On the "&" of 2', why: 'An off-beat is too weak for the root: the change would sound late.' },
        { text: 'Only on the last beat', why: 'The last beat often carries an approach note into the next root.' },
      ],
      shuffle: false,
      explain: 'The root on beat 1 tells everyone which chord has arrived; the other beats are free for 5ths, octaves and approach notes.',
      fact: 'form-root-fifth-bass',
    },
    {
      type: 'play-phrase',
      prompt: 'Play a root-fifth bass line under {c:G} and {c:C} on strings 6 and 5.',
      notes: ROOT_FIFTH.slice(0, 4),
      octave: 'exact',
      tempo: 90,
      explain: '{n:G} at string 6, fret 3, then its 5th, {n:D}, at string 5, fret 5; {n:C} at string 5, fret 3, then its 5th, {n:G}, back at string 6, fret 3.',
      alternative: {
        type: 'choice',
        prompt: 'Under {c:C}, which two notes make a root-fifth bass line?',
        options: [
          { text: '{n:C} and {n:G}', correct: true },
          { text: '{n:C} and {n:E}', why: '{n:E} is the 3rd of {c:C}, not the 5th.' },
          { text: '{n:C} and {n:F}', why: '{n:F} is a 4th above {n:C}, and not in the chord.' },
        ],
        explain: 'The root of {c:C} is {n:C} and its 5th is {n:G}, at string 5, fret 3 and string 6, fret 3.',
      },
    },
    {
      type: 'card',
      title: 'Walking',
      body: 'A {t:walking-bass} line plays a note on every beat, moving mostly by step and landing on a chord tone at each change. On beat 4 it often slips in by a half step from the next root: {n:C#} into {n:D}, {n:F#} into {n:G}.',
      figure: { kind: 'audio', sound: { kind: 'tab', tempo: 96, notes: WALKING }, label: 'Hear it walk' },
    },
    {
      type: 'type-answer',
      prompt: 'Type the half-step approach note from below into {n:C}.',
      answer: { kind: 'note', value: 'B', spelling: 'exact' },
      input: 'keypad',
      explain: 'A half step below {n:C} is {n:B}: at string 5, fret 2, just under the {n:C} at fret 3.',
      fact: 'form-half-step-into-root',
    },
    {
      type: 'listen-choice',
      prompt: 'Is this a root-fifth bass line or a walking bass line?',
      sound: { kind: 'tab', tempo: 96, notes: ROOT_FIFTH },
      options: [{ text: 'Root-fifth', correct: true }, { text: 'Walking' }],
      shuffle: false,
      explain: 'Two notes a bar, root then 5th: {n:G} {n:D}, {n:C} {n:G}, {n:D} {n:A}, {n:G}. A walking line would move on every beat.',
    },
    {
      type: 'true-false',
      statement: 'A walking bass line plays a note on every beat and lands on a chord tone at each change.',
      answer: true,
      explain: 'Four notes a bar in 4/4, mostly by step, and a chord tone, usually the root, on each beat 1.',
      fact: 'form-walking-bass',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap the half-step approach into {n:G} on string 6.',
      find: { note: 'F#2' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 4],
      strings: [6],
      explain: 'String 6, fret 2 is {n:F#}: one fret below the root {n:G} at fret 3.',
    },
    {
      type: 'listen-choice',
      prompt: 'And this one: root-fifth, or walking?',
      sound: { kind: 'tab', tempo: 96, notes: WALKING },
      options: [{ text: 'Root-fifth' }, { text: 'Walking', correct: true }],
      shuffle: false,
      explain: 'A note on every beat, moving mostly by step, with {n:C#} and {n:F#} slipping into the next roots: a walking line.',
    },
    {
      type: 'choice',
      prompt: 'In the walking line, which beat carries the half-step approach into the next root?',
      options: [
        { text: 'Beat 1', why: 'Beat 1 is where the new root lands.' },
        { text: 'Beat 2' },
        { text: 'Beat 3' },
        { text: 'Beat 4', correct: true },
      ],
      shuffle: false,
      explain: 'Beat 4, the last beat of the bar: the approach note leans in, and the root lands on the next beat 1.',
    },
  ],
  facts: [
    {
      id: 'form-root-fifth-bass',
      front: 'What does a basic bass line play?',
      back: 'The chord root on beat 1, filled out with 5ths, octaves and approach notes.',
    },
    {
      id: 'form-walking-bass',
      front: 'What is a walking bass line?',
      back: 'A note on every beat, moving mostly by step and landing on a chord tone at each change.',
    },
    {
      id: 'form-half-step-into-root',
      front: 'What makes a chord change in the bass feel inevitable?',
      back: 'Approaching the next root by a half step on the last beat of the bar.',
      ask: {
        type: 'type-answer',
        prompt: 'Type the half-step approach note from below into {n:D}.',
        answer: { kind: 'note', value: 'C#', spelling: 'exact' },
        input: 'keypad',
        explain: 'A half step below {n:D} is {n:C#}, spelled with the letter below because it rises into {n:D}.',
      },
    },
  ],
};

const writingAProgression: Lesson = {
  id: 'writing-a-progression',
  title: 'Writing your own progression',
  teaches: 'Plan a progression by function (home, away, tension, home), then colour it with borrowed or secondary chords.',
  minutes: 4,
  skill: `theory:${U}:writing-a-progression`,
  steps: [
    {
      type: 'card',
      title: 'Plan by function',
      body: 'Plan a progression by job: start at home on the {t:tonic}, move away with a {t:subdominant} chord, build tension with the {t:dominant}, then come home. In G: {c:G} (320003), {c:C} (x32010), {c:D} (xx0232), {c:G}.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['G', 'C', 'D', 'G'], beats: 4, tempo: 84 }, label: 'Home, away, tension, home' },
    },
    {
      type: 'order',
      prompt: 'Put the functions of a basic progression in order.',
      tiles: ['Tonic', 'Subdominant', 'Dominant', 'Tonic'],
      explain: 'Home (tonic), away (subdominant), tension (dominant), and home again (tonic): {c:G} {c:C} {c:D} {c:G} in G.',
      fact: 'form-plan-by-function',
    },
    {
      type: 'card',
      title: 'Swap one chord',
      body: 'Then swap one chord for colour. Borrow {r:iv} from {k:G minor}: {c:G} {c:Cm} (x35543) {c:D7} (xx0212) {c:G}. Or add a {t:secondary-dominant}: {c:G} {c:E7} (020100) {c:Am} (x02210) {c:D7} {c:G}.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['G', 'Cm', 'D7', 'G'], beats: 4, tempo: 84 }, label: 'With a borrowed {c:Cm}' },
    },
    {
      type: 'choice',
      prompt: 'Which chord would add a borrowed colour to {c:G} {c:C} {c:D} {c:G}?',
      options: [
        { text: '{c:Cm}', correct: true },
        { text: '{c:Em}', why: '{c:Em} is {r:vi} of {k:G major}: a fine swap, but it is inside the key, not borrowed.' },
        { text: '{c:Am}', why: '{c:Am} is {r:ii} of {k:G major}, also inside the key.' },
      ],
      explain: '{c:Cm} is {r:iv}, borrowed from {k:G minor}. Its {n:Eb} is foreign to {k:G major}, which gives the bittersweet colour.',
      fact: 'form-swap-one-chord',
    },
    {
      type: 'listen-choice',
      prompt: 'Was the second chord plain {c:C}, or the borrowed {c:Cm}?',
      sound: { kind: 'progression', chords: ['G', 'C', 'D7', 'G'], beats: 4, tempo: 84 },
      options: [{ text: 'Plain {c:C}', correct: true }, { text: 'Borrowed {c:Cm}' }],
      shuffle: false,
      explain: 'That was {c:G} {c:C} {c:D7} {c:G}: the second chord was major, bright and plain. {c:Cm} would sound darker.',
    },
    {
      type: 'play-chord',
      prompt: 'Play {c:E7} (020100): the secondary dominant in {c:G} {c:E7} {c:Am} {c:D7} {c:G}.',
      chord: 'E7',
      frets: '020100',
      explain: '{c:E7} is {r:V7/ii} in G: its {n:G#} leans up to the {n:A} of {c:Am}, the chord it leads to.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'E7',
        frets: '020100',
        accept: 'any-voicing',
        prompt: 'Build {c:E7}, the secondary dominant that leads to {c:Am} in G.',
        explain: '020100: an open {c:E} with the open {n:D} string as its 7th. {n:E} {n:G#} {n:B} {n:D}.',
      },
    },
    {
      type: 'type-answer',
      prompt: 'Type the borrowed {r:iv} chord of {k:G major}.',
      answer: { kind: 'chord', value: 'Cm', spelling: 'exact' },
      explain: 'The 4th note of G is {n:C}. In {k:G minor} its chord is minor, {c:Cm}: {n:C} {n:Eb} {n:G}.',
    },
    {
      type: 'card',
      title: 'Then a melody',
      body: 'When you add a melody, put its long notes on chord tones and let passing notes fill between them. Over {c:G}, hold {n:B} or {n:D}; over {c:Cm}, a held {n:Eb} brings out the borrowed colour.',
    },
    {
      type: 'choice',
      prompt: 'Over {c:C}, which note is a chord tone, safe to hold as a long melody note?',
      options: [
        { text: '{n:G}', correct: true },
        { text: '{n:F#}', why: '{n:F#} is not in {c:C}: a half step under {n:G}, fine passing through, harsh when held.' },
        { text: '{n:D}', why: '{n:D} is not in {c:C}: let it pass between chord tones.' },
        { text: '{n:A}', why: '{n:A} is not in {c:C} either: a passing note here.' },
      ],
      explain: '{c:C} is {n:C} {n:E} {n:G}. A long note on {n:G}, its 5th, sits right inside the chord.',
      fact: 'form-melody-long-notes',
    },
    { generate: 'roman-chord', params: { direction: 'to-chord', maxAccidentals: 2 } },
  ],
  facts: [
    {
      id: 'form-plan-by-function',
      front: 'How can you plan a progression by function?',
      back: 'Start at home (tonic), move away (subdominant), build tension (dominant), and return home.',
    },
    {
      id: 'form-swap-one-chord',
      front: 'How do you give a familiar progression a fresh sound?',
      back: 'Swap one chord for a borrowed or secondary chord, such as {c:Cm} or {c:E7} in G.',
    },
    { id: 'form-melody-long-notes', front: 'Where should the long notes of a melody go?', back: 'On chord tones, with passing notes filling between them.' },
  ],
};

const unit: Unit = {
  id: U,
  title: 'Song form, arranging and writing',
  theme: 'composition',
  description: "Song sections and forms, phrases and periods, the guitar's roles in a band, chord melody, bass lines and writing your own progressions.",
  lessons: [songSections, commonForms, phrasesAndPeriods, theGuitarInABand, chordMelody, bassLines, writingAProgression],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      {
        type: 'match-pairs',
        prompt: 'Match each section with its job.',
        pairs: [
          { left: 'Verse', right: 'Tells the story' },
          { left: 'Chorus', right: 'The main idea, repeated' },
          { left: 'Bridge', right: 'Brings contrast' },
          { left: 'Pre-chorus', right: 'Builds into the chorus' },
        ],
        explain: 'Verse for the story, chorus for the main idea, bridge for contrast, pre-chorus to build into the chorus.',
      },
      {
        type: 'true-false',
        statement: 'An outro opens a song.',
        answer: false,
        explain: 'The intro opens a song; the outro closes it.',
      },
      {
        type: 'choice',
        prompt: 'How many bars long is the AABA song form?',
        options: [{ text: '12' }, { text: '16' }, { text: '24' }, { text: '32', correct: true }],
        shuffle: false,
        explain: 'Four 8-bar sections, A A B A: 32 bars.',
      },
      {
        type: 'match-pairs',
        prompt: 'Match each form with its letters.',
        pairs: [
          { left: 'Binary', right: { text: 'AB', say: 'A B' } },
          { left: 'Ternary', right: { text: 'ABA', say: 'A B A' } },
          { left: 'Rondo', right: { text: 'ABACA', say: 'A B A C A' } },
        ],
        explain: 'Binary AB, ternary ABA, rondo ABACA: in a rondo, A keeps coming back.',
      },
      {
        type: 'choice',
        prompt: 'In verse-chorus form, where does a bridge usually come?',
        options: [
          { text: 'Near the end, before the last chorus', correct: true },
          { text: 'Before the first verse', why: 'That is where the intro goes.' },
          { text: 'Between every verse and chorus', why: 'That is the pre-chorus.' },
        ],
        explain: 'A bridge usually comes late, after a couple of choruses, to bring contrast before the last one.',
      },
      {
        type: 'choice',
        prompt: 'Which phrase of a period ends with a half cadence?',
        options: [
          { text: 'The antecedent, the first', correct: true },
          { text: 'The consequent, the second', why: 'The consequent answers with an authentic cadence.' },
        ],
        shuffle: false,
        explain: 'The antecedent stops on {r:V} like a question; the consequent answers {r:V} to {r:I}.',
      },
      {
        type: 'type-answer',
        prompt: 'A period is two 4-bar phrases. How many bars long is it?',
        answer: { kind: 'number', value: 8 },
        input: 'keypad',
        explain: '4 + 4 = 8 bars: a question phrase and an answer phrase.',
      },
      {
        type: 'choice',
        prompt: 'Why does a 3-bar phrase sound surprising?',
        options: [
          { text: 'We feel bars in groups of four', correct: true },
          { text: 'It cannot end with a cadence', why: 'A phrase of any length can end with a cadence.' },
          { text: 'It is out of time', why: 'The bars are in time; only their grouping is unusual.' },
        ],
        explain: 'Listeners feel four-bar groups like large beats, so a 3-bar phrase ends earlier than the ear expects.',
      },
      {
        type: 'choice',
        prompt: 'Two guitars play the same song. Which plan sounds fullest?',
        options: [
          { text: 'One plays open chords, the other high triads', correct: true },
          { text: 'Both play the same open chords', why: 'Identical parts blur together.' },
          { text: 'Both play low power chords', why: 'That crowds the low register and the bass.' },
        ],
        explain: 'Different registers or voicings let each guitar be heard: open chords below, triads or capo shapes above.',
      },
      {
        type: 'true-false',
        statement: 'With a bass player in the band, higher guitar voicings leave room for the bass.',
        answer: true,
        explain: 'The bass covers the low roots; higher guitar voicings keep out of its way and keep the sound clear.',
      },
      {
        type: 'choice',
        prompt: 'In a chord-melody arrangement, where is the melody?',
        options: [
          { text: 'On top: the highest note of each chord', correct: true },
          { text: 'In the bass: the lowest note', why: 'Low notes are heard as the bass line, not the tune.' },
          { text: 'In a second guitar part', why: 'Chord melody is one guitar playing both tune and chords.' },
        ],
        explain: 'The melody is the top note, usually on string 1 or 2, with a chord shape built under each strong beat.',
      },
      {
        type: 'type-answer',
        prompt: 'Type the half-step approach note from below into {n:G}.',
        answer: { kind: 'note', value: 'F#', spelling: 'exact' },
        input: 'keypad',
        explain: 'A half step below {n:G} is {n:F#}: on string 6, fret 2, just under the {n:G} at fret 3.',
      },
      {
        type: 'choice',
        prompt: 'Which kind of bass line plays a note on every beat?',
        options: [
          { text: 'A walking bass line', correct: true },
          { text: 'A root-fifth bass line', why: 'A root-fifth line often plays only two notes a bar: root, then 5th.' },
          { text: 'A pedal point', why: 'A pedal point holds one note while the chords change.' },
        ],
        explain: 'A walking line moves on every beat, mostly by step, landing on a chord tone at each change.',
      },
      {
        type: 'order',
        prompt: 'Put the functions of a basic progression in order.',
        tiles: ['Tonic', 'Subdominant', 'Dominant', 'Tonic'],
        explain: 'Home, away, tension, home: tonic, subdominant, dominant, tonic.',
      },
      {
        type: 'choice',
        prompt: 'Which chord adds a borrowed colour to {c:C} {c:F} {c:G} {c:C}?',
        options: [
          { text: '{c:Fm}', correct: true },
          { text: '{c:Dm}', why: '{c:Dm} is {r:ii} of {k:C major}: inside the key.' },
          { text: '{c:Am}', why: '{c:Am} is {r:vi} of {k:C major}: inside the key.' },
        ],
        explain: '{c:Fm} is {r:iv} borrowed from {k:C minor}; its {n:Ab} is foreign to {k:C major}.',
      },
      {
        type: 'listen-choice',
        prompt: 'Does this phrase end with a half cadence or an authentic cadence?',
        sound: { kind: 'progression', chords: PERIOD_CHORDS.slice(0, 4), beats: 4, tempo: 90 },
        options: [{ text: 'A half cadence, on {r:V}', correct: true }, { text: 'An authentic cadence, {r:V} to {r:I}' }],
        shuffle: false,
        explain: '{c:G} {c:C} {c:G} {c:D}: it stops on {r:V}, a half cadence, like the antecedent of a period.',
      },
    ],
  },
};

export default unit;
