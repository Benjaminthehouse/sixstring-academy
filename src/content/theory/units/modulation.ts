/**
 * Theory Path, unit 39: Modulation and chromatic chords. Written from the syllabus entries in
 * `src/content/plan/theory-path.json` (unit `modulation`), one lesson per entry, in order: each
 * lesson opens with the "on the guitar" picture, asks the planned exercises, ends with the planned
 * drills, and turns every planned fact into a review card.
 *
 * Every key, signature, pivot chord, shared note, transposed chorus, augmented sixth and shape is
 * cross-checked against `@/core/theory` and `@/core/guitar` in `modulation.test.ts`.
 *
 * Notes for readers of the code:
 * - A lesson sound strums one chord at a time from the chord library (`progression`), so the
 *   listening questions about key changes play whole original chord charts and the text gives each
 *   chart, so the lesson still teaches with the sound off.
 * - Augmented sixth chords have no chord symbol. The German sixth sounds exactly like Ab7, so its
 *   sounds and its play step use `Ab7` (shape xx6542, whose top note the engine spells Gb), while
 *   every text spells it Ab C Eb F#, as theory does. The fretboard figures claim the pitches.
 * - The common-tone lesson holds the open E string from C (x32010) to A (x02220), so that the
 *   chromatic-mediant lesson after it can bring its own examples (C to E, C to Ab).
 */
import type { Lesson, Sound, Unit } from '@/lessons';

const U = 'modulation';

/** Chart 1: a short visit to G (D7 G), then F brings C major back. */
const VISIT_1 = ['C', 'Am', 'D7', 'G', 'F', 'C', 'G', 'C'];
/** Chart 2: through Am into G, with the D7 G cadence twice and no F natural after bar 2. */
const MOVE_1 = ['C', 'F', 'Am', 'D7', 'G', 'D7', 'G', 'G'];
/** A second move to G, for the listening question. */
const MOVE_2 = ['C', 'Am', 'D7', 'G', 'Am', 'D7', 'G', 'G'];
/** A second visit, for the listening question: D7 G once, then home with a cadence in C. */
const VISIT_2 = ['C', 'F', 'D7', 'G', 'C', 'Am', 'G', 'C'];
/** A cadence in C, then the same cadence in D major at once: no chord links the keys. */
const ABRUPT = ['C', 'F', 'G', 'C', 'D', 'G', 'A', 'D'];
/** An original chorus in G. */
const CHORUS_G = ['G', 'D', 'Em', 'C'];
/** The same chorus a half step up, and a whole step up. */
const CHORUS_AB = ['Ab', 'Eb', 'Fm', 'Db'];
const CHORUS_A = ['A', 'E', 'F#m', 'D'];

const chart = (chords: string[], tempo = 92): Sound => ({ kind: 'progression', chords, beats: 2, tempo });

const tonicizationOrModulation: Lesson = {
  id: 'tonicization-or-modulation',
  title: 'Visiting or moving',
  teaches: 'Modulation is a lasting change of key confirmed by a cadence; tonicization is only a brief visit.',
  minutes: 3,
  skill: `theory:${U}:tonicization-or-modulation`,
  steps: [
    {
      type: 'card',
      title: 'A visit to G',
      body: 'In {k:C major}, {c:D7} (xx0212) pulls to {c:G} (320003) and makes it sound like home for a moment: a brief {t:tonicization}. Then {c:F} brings back {n:F} natural, and the music goes home to {c:C}.\n\nChart 1: {c:C} {c:Am} {c:D7} {c:G} | {c:F} {c:C} {c:G} {c:C}',
      figure: { kind: 'audio', sound: chart(VISIT_1), label: 'Hear chart 1: a visit' },
    },
    {
      type: 'card',
      title: 'A move to G',
      body: 'A {t:modulation} is a change of key that lasts. In chart 2 the cadence {c:D7} {c:G} comes twice, {n:F} natural never returns, and the music ends on {c:G}: {k:G major} is the new home.\n\nChart 2: {c:C} {c:F} {c:Am} {c:D7} | {c:G} {c:D7} {c:G} {c:G}',
      figure: { kind: 'audio', sound: chart(MOVE_1), label: 'Hear chart 2: a move' },
      tip: 'Watch the note that changes. Moving from C to G, {n:F#} comes in; when {n:F} natural comes back, so does {k:C major}.',
    },
    {
      type: 'listen-choice',
      prompt: 'A new passage in {k:C major}. Does it visit {c:G} briefly, or move to {k:G major} for good?',
      sound: chart(MOVE_2),
      options: [{ text: 'A brief visit to {c:G}' }, { text: 'A move to {k:G major} for good', correct: true }],
      shuffle: false,
      explain: 'It played {c:C} {c:Am} {c:D7} {c:G}, then {c:Am} {c:D7} {c:G} {c:G}: the cadence into {c:G} came twice and {c:C} never returned. {k:G major} became home.',
    },
    {
      type: 'choice',
      prompt: 'What confirms that a passage has modulated?',
      options: [
        { text: 'A cadence in the new key', correct: true },
        { text: 'One chord from outside the key', why: 'One outside chord, such as {c:D7}, can be a short visit. The new key needs its own cadence, and the music must stay.' },
        { text: 'A change of tempo', why: 'Tempo is how fast the music goes; it says nothing about the key.' },
        { text: 'Ending on a minor chord', why: 'The new key can be major or minor. What counts is a cadence there.' },
      ],
      explain: 'A modulation is confirmed by a {t:cadence} in the new key, usually its {r:V} going to its {r:I}, after which the music stays there.',
      fact: 'modulation-confirmed-by-cadence',
    },
    {
      type: 'true-false',
      statement: 'Every secondary dominant is a modulation.',
      answer: false,
      explain: 'A {t:secondary-dominant} such as {c:D7} into {c:G} usually only tonicizes {c:G}: a brief visit, then home again. A modulation lasts, and a cadence in the new key confirms it.',
      fact: 'modulation-tonicization-visit',
    },
    {
      type: 'card',
      title: 'How to tell',
      body: 'Ask two questions. Does the new home chord get its own cadence? And does the music stay there, or go back to the old tonic? A cadence and a stay: modulation. A quick return: tonicization.',
      figure: { kind: 'chord', symbol: 'F', frets: 'xx3211', caption: '{c:F} (xx3211): its {n:F} natural belongs to C, not to G.' },
    },
    {
      type: 'choice',
      prompt: 'In chart 1, {c:C} {c:Am} {c:D7} {c:G} | {c:F} {c:C} {c:G} {c:C}, which chord shows the visit to {c:G} is over?',
      options: [
        { text: '{c:F}', correct: true },
        { text: '{c:D7}', why: '{c:D7} starts the visit: its {n:F#} points to {c:G}.' },
        { text: '{c:Am}', why: '{c:Am} is in both {k:C major} and {k:G major}, so it cannot decide.' },
        { text: '{c:G}', why: '{c:G} is where the visit lands, not where it ends.' },
      ],
      explain: '{c:F} holds {n:F} natural, which {k:G major} does not have. After it, {c:C} {c:G} {c:C} closes the passage with a cadence at home.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each idea with what it means.',
      pairs: [
        { left: 'Modulation', right: 'A lasting change of key' },
        { left: 'Tonicization', right: 'A brief visit, then home' },
        { left: 'Cadence in the new key', right: 'Confirms a modulation' },
        { left: '{c:D7} in {k:C major}', right: '{r:V7/V}, pointing to {c:G}' },
      ],
      explain: 'A modulation moves home for good and a cadence in the new key confirms it. A tonicization, such as {c:D7} to {c:G} in C, only visits.',
    },
    {
      type: 'listen-choice',
      prompt: 'And this passage: a brief visit to {c:G}, or a move?',
      sound: chart(VISIT_2),
      options: [{ text: 'A brief visit to {c:G}', correct: true }, { text: 'A move to {k:G major} for good' }],
      shuffle: false,
      explain: '{c:D7} {c:G} came once, then {c:C} {c:Am} {c:G} {c:C}: straight back home, with a cadence in {k:C major}. A visit, not a move.',
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the sentence.',
      text: 'A ___ is a brief visit; a ___ is a change of key that lasts, confirmed by a ___ in the new key.',
      blanks: ['tonicization', 'modulation', 'cadence'],
      bank: ['scale', 'tempo'],
      explain: 'Tonicization visits a chord for a moment. Modulation moves home for good, and a cadence in the new key confirms it.',
      fact: 'modulation-lasting-change',
    },
  ],
  facts: [
    {
      id: 'modulation-lasting-change',
      front: 'What is a modulation?',
      back: 'A change of key that lasts: a new tonic is established.',
      ask: {
        type: 'choice',
        prompt: 'Which of these is a modulation?',
        options: [
          { text: 'A song settles in a new key for good', correct: true },
          { text: 'One {c:D7} {c:G} inside a song in C', why: 'A single secondary dominant and its target is a brief visit: tonicization.' },
          { text: 'The last chorus is played louder', why: 'Louder is a change of volume, not of key.' },
        ],
        explain: 'A modulation is a lasting change of key: the music settles on a new tonic, confirmed by a cadence there.',
      },
    },
    {
      id: 'modulation-tonicization-visit',
      front: 'What is tonicization?',
      back: 'A brief visit, such as a secondary dominant and its target, after which the music returns to the home key.',
    },
    {
      id: 'modulation-confirmed-by-cadence',
      front: 'What confirms a modulation?',
      back: 'A cadence in the new key.',
    },
  ],
};

const closelyRelatedKeys: Lesson = {
  id: 'closely-related-keys',
  title: 'Closely related keys',
  teaches: 'Closely related keys differ by at most one sharp or flat, and they are where modulations usually go.',
  minutes: 3,
  skill: `theory:${U}:closely-related-keys`,
  steps: [
    {
      type: 'card',
      title: 'Next-door keys',
      body: 'Keys whose signatures differ by at most one sharp or flat are {t:closely-related-key|closely related}. For {k:C major} they are {k:G major} (one sharp) and {k:F major} (one flat), its neighbours on the {t:circle-of-fifths}, plus three minor keys: {k:A minor}, {k:E minor} and {k:D minor}.',
      figure: { kind: 'circle', key: 'C major', highlight: ['G major', 'F major', 'A minor', 'E minor', 'D minor'], show: 'both', caption: '{k:C major} and its five closely related keys.' },
    },
    {
      type: 'choice',
      prompt: 'Which key is closely related to {k:G major}?',
      options: [
        { text: '{k:D major}', correct: true },
        { text: '{k:Eb major}', why: '{k:Eb major} has three flats: four steps round the circle from one sharp.' },
        { text: '{k:A major}', why: '{k:A major} has three sharps, two more than {k:G major}.' },
        { text: '{k:F major}', why: '{k:F major} has {n:Bb} and {k:G major} has {n:F#}: they differ in two notes.' },
      ],
      explain: '{k:D major} has two sharps, one more than {k:G major}: its neighbour on the circle. The keys closely related to G are {k:D major}, {k:C major}, {k:E minor}, {k:B minor} and {k:A minor}.',
      fact: 'modulation-closely-related',
    },
    {
      type: 'card',
      title: 'Six tonics in one place',
      body: 'On the neck, these six tonics sit close together on strings 6 and 5: {n:C} at string 5, fret 3; {n:G} at string 6, fret 3; {n:F} at string 6, fret 1; the open {n:A} and {n:E} strings; and {n:D} at string 5, fret 5.',
      figure: {
        kind: 'fretboard',
        frets: [0, 5],
        dots: [
          { string: 5, fret: 3, note: 'C3', role: 'root' },
          { string: 6, fret: 3, note: 'G2', role: 'tone' },
          { string: 6, fret: 1, note: 'F2', role: 'tone' },
          { string: 5, fret: 0, note: 'A2', role: 'tone' },
          { string: 6, fret: 0, note: 'E2', role: 'tone' },
          { string: 5, fret: 5, note: 'D3', role: 'tone' },
        ],
        caption: 'The tonics of {k:C major} and its five closely related keys.',
      },
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap the tonic of {k:G major} on string 6.',
      find: { note: 'G2' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 5],
      strings: [6],
      explain: 'String 6, fret 3 is {n:G}: three half steps above the open {n:E}.',
    },
    {
      type: 'card',
      title: 'Where the music goes',
      body: 'From a major key, the most common modulation is to its {t:dominant} key, a fifth up: {k:C major} to {k:G major}. From a minor key, the most common is to its relative major, which has the same signature: {k:A minor} to {k:C major}.',
    },
    {
      type: 'type-answer',
      prompt: '{k:F major} modulates to its dominant key. Type the tonic of that key.',
      answer: { kind: 'note', value: 'C', spelling: 'exact' },
      input: 'keypad',
      explain: 'The 5th note of {k:F major} is {n:C}, so its dominant key is {k:C major}: a fifth up, with one flat fewer.',
      fact: 'modulation-to-dominant',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each key with the key it most often modulates to.',
      pairs: [
        { left: '{k:C major}', right: '{k:G major}' },
        { left: '{k:A minor}', right: '{k:C major}' },
        { left: '{k:D major}', right: '{k:A major}' },
        { left: '{k:B minor}', right: '{k:D major}' },
      ],
      explain: 'Major keys most often move to their dominant key, a fifth up. Minor keys most often move to their relative major: the same signature, a minor third up.',
      fact: 'modulation-minor-to-relative',
    },
    {
      type: 'true-false',
      statement: '{k:E minor} is closely related to {k:C major}.',
      answer: true,
      explain: '{k:E minor} has one sharp, {n:F#}, the signature of {k:G major}: one sharp away from {k:C major}. It is the relative minor of C\'s dominant key.',
    },
    {
      type: 'choice',
      prompt: 'Which key is not closely related to {k:C major}?',
      options: [
        { text: '{k:D major}', correct: true },
        { text: '{k:D minor}', why: '{k:D minor} has one flat: the relative minor of {k:F major}.' },
        { text: '{k:E minor}', why: '{k:E minor} has one sharp: the relative minor of {k:G major}.' },
        { text: '{k:F major}', why: '{k:F major} has one flat: C\'s neighbour on the circle.' },
      ],
      explain: '{k:D major} has two sharps, two steps round the circle from {k:C major}. It shares a letter with {k:D minor}, but not a signature.',
    },
    { generate: 'relative-key', params: { direction: 'both', maxAccidentals: 4 } },
  ],
  facts: [
    {
      id: 'modulation-closely-related',
      front: 'Which keys are closely related to {k:C major}?',
      back: 'Keys whose signatures differ by at most one sharp or flat: {k:G major}, {k:F major}, {k:A minor}, {k:E minor} and {k:D minor}.',
      ask: {
        type: 'choice',
        prompt: 'Which key is closely related to {k:F major}?',
        options: [
          { text: '{k:Bb major}', correct: true },
          { text: '{k:Eb major}', why: '{k:Eb major} has three flats, two more than {k:F major}.' },
          { text: '{k:D major}', why: '{k:D major} has two sharps: three steps round the circle from one flat.' },
          { text: '{k:E minor}', why: '{k:E minor} has one sharp and {k:F major} one flat: they differ in two notes.' },
        ],
        explain: '{k:Bb major} has two flats, one more than {k:F major}. F\'s closely related keys are {k:C major}, {k:Bb major}, {k:D minor}, {k:A minor} and {k:G minor}.',
      },
    },
    {
      id: 'modulation-to-dominant',
      front: 'What is the most common modulation from a major key?',
      back: 'To its dominant key, a fifth up: {k:C major} to {k:G major}.',
      ask: {
        type: 'type-answer',
        prompt: '{k:D major} modulates to its dominant key. Type the tonic of that key.',
        answer: { kind: 'note', value: 'A', spelling: 'exact' },
        input: 'keypad',
        explain: 'The 5th note of {k:D major} is {n:A}: the dominant key is {k:A major}, one sharp more.',
      },
    },
    {
      id: 'modulation-minor-to-relative',
      front: 'Where do minor keys most often modulate?',
      back: 'To their relative major: {k:A minor} to {k:C major}.',
      ask: { generate: 'relative-key', params: { direction: 'major', maxAccidentals: 4 } },
    },
  ],
};

const pivotChords: Lesson = {
  id: 'pivot-chords',
  title: 'Pivot chords',
  teaches: 'A pivot chord belongs to both the old key and the new one, and it links them smoothly.',
  minutes: 4,
  skill: `theory:${U}:pivot-chords`,
  steps: [
    {
      type: 'card',
      title: 'One chord, two keys',
      body: 'A {t:pivot-chord} belongs to both the old key and the new one. {c:Am} (x02210) is {r:vi} in {k:C major} and {r:ii} in {k:G major}. Play {c:C} (x32010), {c:Am}, {c:D7} (xx0212), {c:G} (320003):\nIn C: {r:I} {r:vi}\nIn G: {r:ii} {r:V7} {r:I}',
      figure: { kind: 'chord', symbol: 'Am', frets: 'x02210', caption: '{c:Am}: {r:vi} in {k:C major}, {r:ii} in {k:G major}.' },
    },
    {
      type: 'card',
      title: 'Hear the pivot',
      body: 'Listen to {c:C} {c:Am} {c:D7} {c:G}, and let the last {c:G} ring. {c:Am} sounds at home in C, then {c:D7} reveals that it was {r:ii} in G all along.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['C', 'Am', 'D7', 'G'], beats: 4, tempo: 90 }, label: 'Hear {c:C} {c:Am} {c:D7} {c:G}' },
    },
    {
      type: 'choice',
      prompt: 'From {k:C major} to {k:G major}, which chord can pivot?',
      options: [
        { text: '{c:Am}', correct: true },
        { text: '{c:Ab}', why: '{c:Ab} is in neither key.' },
        { text: '{c:F}', why: '{c:F} is {r:IV} in C, but {k:G major} has {n:F#}, so it has no {c:F} chord.' },
        { text: '{c:Bm}', why: '{c:Bm} is {r:iii} in G, but its {n:F#} is not in {k:C major}.' },
      ],
      explain: 'A pivot must be in both keys. {c:Am}, {n:A} {n:C} {n:E}, is {r:vi} in C and {r:ii} in G. {c:C}, {c:Em} and {c:G} are in both keys too.',
      fact: 'modulation-pivot-chord',
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the pivot.',
      text: '{c:Em} is {r:iii} in {k:C major} and ___ in {k:G major}.',
      blanks: ['{r:vi}'],
      bank: ['{r:ii}', '{r:iii}', '{r:IV}'],
      explain: '{n:E} is the 6th note of the {n:G} major scale, so {c:Em} is {r:vi} in G. It can pivot from C to G as well.',
    },
    {
      type: 'listen-choice',
      prompt: 'Does this passage glide into its new key through a pivot, or jump straight there?',
      sound: chart(ABRUPT, 96),
      options: [{ text: 'Through a pivot chord' }, { text: 'Straight there, with no pivot', correct: true }],
      shuffle: false,
      explain: '{c:C} {c:F} {c:G} {c:C} ends at home in C, then {c:D} {c:G} {c:A} {c:D} starts in {k:D major} at once. No chord links the keys: an abrupt change.',
    },
    {
      type: 'card',
      title: 'Then confirm it',
      body: 'After the pivot, the new key\'s {r:V} and a cadence confirm the move: {c:D7} to {c:G}. Without them, {c:Am} would just be {r:vi} in C again, and the music would stay home.',
      figure: { kind: 'chord', symbol: 'D7', frets: 'xx0212', caption: '{c:D7} (xx0212): {r:V7} of {k:G major}, with the new {n:F#}.' },
    },
    {
      type: 'order',
      prompt: 'Put this pivot modulation from {k:C major} to {k:G major} in order.',
      tiles: ['{c:C}', '{c:Am}', '{c:D7}', '{c:G}'],
      distractors: ['{c:Bb}'],
      explain: 'Start at home on {c:C}, pivot on {c:Am} ({r:vi} in C, {r:ii} in G), then confirm with {c:D7} to {c:G}: {r:V7} to {r:I} in the new key.',
      fact: 'modulation-pivot-am',
    },
    {
      type: 'choice',
      prompt: 'From {k:G major} to {k:D major}, which chord can pivot?',
      options: [
        { text: '{c:Em}', correct: true },
        { text: '{c:C}', why: '{c:C} is {r:IV} in G, but {k:D major} has {n:C#}, not {n:C}.' },
        { text: '{c:Am}', why: '{c:Am} has {n:C} natural, which is not in {k:D major}.' },
        { text: '{c:F#m}', why: '{c:F#m} is {r:iii} in D, but its {n:C#} is not in {k:G major}.' },
      ],
      explain: '{c:Em} is {r:vi} in {k:G major} and {r:ii} in {k:D major}: the same move as {c:Am} from C to G, a fifth higher.',
    },
    {
      type: 'play-chord',
      prompt: 'Strum {c:D7} (xx0212), the chord that confirms the move to {k:G major}.',
      chord: 'D7',
      frets: 'xx0212',
      explain: '{c:D7} is {n:D} {n:F#} {n:A} {n:C}. Its {n:F#}, the leading tone of G, is the note {k:C major} lacks. Then let it fall to {c:G}.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'D7',
        frets: 'xx0212',
        accept: 'any-voicing',
        prompt: 'Build {c:D7}, the {r:V7} of the new key, {k:G major}.',
        explain: 'xx0212: the open {n:D} string, then {n:A}, {n:C} and {n:F#} at frets 2, 1 and 2 of strings 3, 2 and 1.',
      },
    },
    {
      type: 'true-false',
      statement: 'After a pivot chord, the new key\'s {r:V} and a cadence confirm the change.',
      answer: true,
      explain: 'The pivot only opens the door. The new {r:V} going to the new {r:I}, here {c:D7} to {c:G}, makes the new key sound like home.',
      fact: 'modulation-pivot-confirm',
    },
    { generate: 'roman-chord', params: { direction: 'to-roman', maxAccidentals: 2 } },
  ],
  facts: [
    { id: 'modulation-pivot-chord', front: 'What is a pivot chord?', back: 'A chord that belongs to both the old key and the new key and links them.' },
    {
      id: 'modulation-pivot-am',
      front: 'From {k:C major} to {k:G major}, which chord pivots smoothly, and why?',
      back: '{c:Am}: it is {r:vi} in C and {r:ii} in G, so {c:C} {c:Am} {c:D7} {c:G} moves smoothly into G.',
      ask: {
        type: 'fill-blanks',
        prompt: 'Complete the pivot from {k:C major} to {k:G major}.',
        text: '{c:C} {c:Am} {c:D7} {c:G}: {c:Am} is {r:vi} in C and ___ in G.',
        blanks: ['{r:ii}'],
        bank: ['{r:iii}', '{r:IV}', '{r:vi}'],
        explain: '{n:A} is the 2nd note of the {n:G} major scale, so {c:Am} is {r:ii} in G, and {c:D7} {c:G} completes {r:ii} {r:V7} {r:I}.',
      },
    },
    {
      id: 'modulation-pivot-confirm',
      front: 'After the pivot, what confirms the new key?',
      back: 'The new key\'s {r:V} and a cadence: {c:D7} to {c:G} for {k:G major}.',
    },
  ],
};

const directModulation: Lesson = {
  id: 'direct-modulation',
  title: 'Direct and common-tone modulation',
  teaches: 'A direct modulation jumps to the new key with no pivot; a common-tone one holds a shared note through it.',
  minutes: 3,
  skill: `theory:${U}:direct-modulation`,
  steps: [
    {
      type: 'card',
      title: 'Straight in, no pivot',
      body: 'A {t:direct-modulation} jumps to the new key with no pivot chord, often where a new section starts. A favourite pop move: the last chorus goes up a half step or a whole step. Here an original chorus in G comes back a whole step up, in A.',
      figure: {
        kind: 'audio',
        sound: { kind: 'progression', chords: [...CHORUS_G, ...CHORUS_A], beats: 2, tempo: 100 },
        label: 'Chorus in G, then in A',
        caption: '{c:G} {c:D} {c:Em} {c:C}, then {c:A} {c:E} {c:F#m} {c:D}.',
      },
    },
    {
      type: 'listen-choice',
      prompt: 'The same chorus twice. Did the second time move up a half step or a whole step?',
      sound: { kind: 'progression', chords: [...CHORUS_G, ...CHORUS_AB], beats: 2, tempo: 100 },
      options: [{ text: 'A half step', correct: true }, { text: 'A whole step' }],
      shuffle: false,
      explain: 'It went from {c:G} {c:D} {c:Em} {c:C} to {c:Ab} {c:Eb} {c:Fm} {c:Db}: every chord one fret higher, a half step. The whole-step version starts on {c:A}.',
    },
    {
      type: 'type-answer',
      prompt: 'A chorus in {k:E major} moves up a half step for the last time round. Type the tonic of the new key.',
      answer: { kind: 'note', value: 'F', spelling: 'exact' },
      input: 'keypad',
      explain: 'A half step above {n:E} is {n:F}: the last chorus is in {k:F major}, with one flat. Nobody writes it as {n:E#}, whose key would need far more sharps.',
      fact: 'modulation-final-chorus',
    },
    {
      type: 'true-false',
      statement: 'A direct modulation needs a pivot chord.',
      answer: false,
      explain: 'A direct modulation needs no pivot: the music simply starts again in the new key, often at a new section such as the last chorus.',
      fact: 'modulation-direct',
    },
    {
      type: 'card',
      title: 'The shapes, a whole step up',
      body: 'Chorus in G: {c:G} (320003), {c:D} (xx0232), {c:Em} (022000), {c:C} (x32010). A whole step up, in A: {c:A} (x02220), {c:E} (022100), {c:F#m} (244222), {c:D} (xx0232). Each chord moves up a whole step and keeps its quality.',
      figure: { kind: 'chord', symbol: 'F#m', frets: '244222', caption: '{c:F#m} (244222) takes the place of {c:Em}.' },
    },
    {
      type: 'choice',
      prompt: 'A chorus in {k:G major} goes up a whole step. Which chord takes the place of {c:Em}?',
      options: [
        { text: '{c:F#m}', correct: true },
        { text: '{c:Fm}', why: '{c:Fm} is only a half step above {c:Em}.' },
        { text: '{c:Gm}', why: '{c:Gm} is a minor third above {c:Em}.' },
        { text: '{c:F#}', why: 'The quality stays the same: {c:Em} is minor, so the chord that replaces it is minor too.' },
      ],
      explain: 'Every chord moves up a whole step and keeps its quality: {c:Em} becomes {c:F#m}, the {r:vi} of {k:A major}.',
    },
    {
      type: 'play-chord',
      prompt: 'Strum {c:F#m} (244222), the new {r:vi} chord in {k:A major}.',
      chord: 'F#m',
      frets: '244222',
      explain: '244222 is an E-shape barre at fret 2: {n:F#} {n:C#} {n:F#} {n:A} {n:C#} {n:F#}. Lay the first finger flat across fret 2 and press from the arm, not the thumb.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'F#m',
        frets: '244222',
        accept: 'any-voicing',
        prompt: 'Build {c:F#m}, the chord that replaces {c:Em} a whole step up.',
        explain: '244222: a barre at fret 2 with the third and fourth fingers on strings 5 and 4 at fret 4. It spells {n:F#} {n:A} {n:C#}.',
      },
    },
    {
      type: 'card',
      title: 'Holding one note',
      body: 'A {t:common-tone-modulation} keeps one note sounding while the harmony changes under it. Play {c:C} (x32010), then {c:A} (x02220): the open {n:E} on string 1 rings through both, and carries you from {k:C major} into {k:A major}.',
      figure: { kind: 'chord', symbol: 'A', frets: 'x02220', caption: '{c:A} (x02220): its open {n:E} on string 1 was also in {c:C}.' },
    },
    {
      type: 'choice',
      prompt: 'From {c:C} to {c:A}, which note can be held across the change?',
      options: [
        { text: '{n:E}', correct: true },
        { text: '{n:C}', why: '{c:A} has {n:C#}, not {n:C}.' },
        { text: '{n:G}', why: '{n:G} is not in {c:A}, which is {n:A} {n:C#} {n:E}.' },
        { text: '{n:A}', why: '{n:A} is not in {c:C}, which is {n:C} {n:E} {n:G}.' },
      ],
      explain: '{c:C} is {n:C} {n:E} {n:G} and {c:A} is {n:A} {n:C#} {n:E}. Only {n:E} is in both, so it can ring on while the harmony moves.',
      fact: 'modulation-common-tone',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each kind of modulation with how it works.',
      pairs: [
        { left: 'Pivot', right: 'Shares a chord' },
        { left: 'Direct', right: 'Jumps, with no link' },
        { left: 'Common-tone', right: 'Holds one shared note' },
      ],
      explain: 'A pivot modulation passes through a chord of both keys, a common-tone modulation holds one shared note, and a direct modulation simply jumps.',
    },
    {
      type: 'true-false',
      statement: 'Moving the last chorus up a half step or a whole step is a common pop key change.',
      answer: true,
      explain: 'It is one of the most common key changes in pop: a direct modulation that lifts the energy just when the song needs it.',
    },
  ],
  facts: [
    { id: 'modulation-direct', front: 'What is a direct modulation?', back: 'A jump to the new key without a pivot chord, often at the start of a new section.' },
    {
      id: 'modulation-final-chorus',
      front: 'What is a common pop key change for a final chorus?',
      back: 'Moving up a half step or a whole step.',
      ask: {
        type: 'type-answer',
        prompt: 'A chorus in {k:A major} moves up a whole step for the last time round. Type the tonic of the new key.',
        answer: { kind: 'note', value: 'B', spelling: 'exact' },
        input: 'keypad',
        explain: 'A whole step above {n:A} is {n:B}: the last chorus is in {k:B major}.',
      },
    },
    {
      id: 'modulation-common-tone',
      front: 'What is a common-tone modulation?',
      back: 'A key change that holds one note shared by both keys while the harmony changes beneath it.',
    },
  ],
};

const chromaticMediants: Lesson = {
  id: 'chromatic-mediants',
  title: 'Chromatic mediants',
  teaches: 'Chromatic mediants are chords with roots a third apart sharing just one note: a striking, cinematic change.',
  minutes: 3,
  skill: `theory:${U}:chromatic-mediants`,
  steps: [
    {
      type: 'card',
      title: 'A third away, one note shared',
      body: '{t:chromatic-mediant|Chromatic mediants} are chords of the same quality, roots a major or minor third apart, that share only one note. Play {c:C} (x32010), then {c:E} (022100): only {n:E} is in both. Then {c:C} to {c:Ab} (466544): only {n:C} is shared.',
      figure: {
        kind: 'fretboard',
        frets: [0, 4],
        dots: [
          { string: 6, fret: 0, note: 'E2', role: 'target' },
          { string: 5, fret: 2, note: 'B2', role: 'tone' },
          { string: 4, fret: 2, note: 'E3', role: 'target' },
          { string: 3, fret: 1, note: 'G#3', role: 'tone' },
          { string: 2, fret: 0, note: 'B3', role: 'tone' },
          { string: 1, fret: 0, note: 'E4', role: 'target' },
        ],
        caption: '{c:E} (022100): its {n:E} notes are the only ones {c:C} has too.',
      },
    },
    {
      type: 'card',
      title: 'Hear them',
      body: 'Each change keeps one note and moves the rest, so it sounds bright, sudden and a little magical. Film composers love it for heroic or eerie moments, and Romantic composers such as Schubert and Liszt used it often.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['C', 'E', 'C', 'Ab'], beats: 4, tempo: 80 }, label: '{c:C} to {c:E}, then to {c:Ab}' },
    },
    {
      type: 'choice',
      prompt: 'Which pair is a chromatic mediant?',
      options: [
        { text: '{c:C} to {c:E}', correct: true },
        { text: '{c:C} to {c:F}', why: 'Roots a fourth apart, sharing {n:C}: an ordinary change inside {k:C major}.' },
        { text: '{c:C} to {c:Em}', why: 'The roots are a third apart, but {c:Em} shares two notes with {c:C}, {n:E} and {n:G}: a plain diatonic change.' },
        { text: '{c:C} to {c:G}', why: 'Roots a fifth apart, sharing {n:G}: both chords are in {k:C major}.' },
      ],
      explain: '{c:C} and {c:E} are both major, with roots a major third apart, and share only {n:E}. The {n:G#} and {n:B} of {c:E} come from outside {k:C major}.',
      fact: 'modulation-chromatic-mediant',
    },
    {
      type: 'type-answer',
      prompt: 'Type the one note shared by {c:C} and {c:Ab}.',
      answer: { kind: 'note', value: 'C', spelling: 'exact' },
      input: 'keypad',
      explain: '{c:C} is {n:C} {n:E} {n:G}; {c:Ab} is {n:Ab} {n:C} {n:Eb}. Only {n:C} is in both.',
      fact: 'modulation-mediant-examples',
    },
    {
      type: 'listen-choice',
      prompt: 'Two chords. A chromatic mediant, or an ordinary diatonic change?',
      sound: { kind: 'progression', chords: ['C', 'E'], beats: 4, tempo: 80 },
      options: [{ text: 'A chromatic mediant', correct: true }, { text: 'An ordinary diatonic change' }],
      shuffle: false,
      explain: 'That was {c:C} to {c:E}: roots a major third apart, sharing only {n:E}, with {n:G#} from outside the key. The sudden bright lift is the sign.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each chromatic mediant with the one note its chords share.',
      pairs: [
        { left: '{c:C} to {c:E}', right: '{n:E}' },
        { left: '{c:C} to {c:Ab}', right: '{n:C}' },
        { left: '{c:C} to {c:Eb}', right: '{n:G}' },
        { left: '{c:G} to {c:B}', right: '{n:B}' },
      ],
      explain: 'Each pair is two major chords a third apart. {c:Eb} is {n:Eb} {n:G} {n:Bb}, sharing {n:G} with {c:C}; {c:B} is {n:B} {n:D#} {n:F#}, sharing {n:B} with {c:G}.',
    },
    {
      type: 'listen-choice',
      prompt: 'And these two chords?',
      sound: { kind: 'progression', chords: ['C', 'Am'], beats: 4, tempo: 80 },
      options: [{ text: 'A chromatic mediant' }, { text: 'An ordinary diatonic change', correct: true }],
      shuffle: false,
      explain: '{c:C} to {c:Am}: the roots are a third apart, but the chords share two notes, {n:C} and {n:E}, and both are in {k:C major}. A smooth diatonic change.',
    },
    {
      type: 'true-false',
      statement: 'Chromatic mediants are common in film music and in Romantic-era harmony.',
      answer: true,
      explain: 'Film scores use them for wonder or menace, and Romantic composers such as Schubert and Liszt used them to move between distant keys.',
      fact: 'modulation-mediant-film',
    },
    {
      type: 'play-chord',
      prompt: 'Strum {c:C} (x32010), then {c:Ab} (466544). Listen for the {n:C} that stays.',
      chord: 'Ab',
      frets: '466544',
      explain: '466544 is an E-shape barre at fret 4. Its {n:C} at string 3, fret 5 is the same pitch as the {n:C} at string 2, fret 1 in {c:C}: the one note that stays.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'Ab',
        frets: '466544',
        accept: 'any-voicing',
        prompt: 'Build {c:Ab}, the chromatic mediant a major third below {c:C}.',
        explain: '466544: a barre at fret 4, with {n:Ab} {n:Eb} {n:Ab} {n:C} {n:Eb} {n:Ab} from string 6 to string 1.',
      },
    },
    {
      type: 'choice',
      prompt: 'Which chord is a chromatic mediant of {c:G}?',
      options: [
        { text: '{c:B}', correct: true },
        { text: '{c:Em}', why: '{c:Em} shares two notes with {c:G}, {n:G} and {n:B}: a diatonic change.' },
        { text: '{c:C}', why: 'Roots a fourth apart, both in {k:G major}.' },
        { text: '{c:D}', why: 'Roots a fifth apart, both in {k:G major}.' },
      ],
      explain: '{c:B} is {n:B} {n:D#} {n:F#}: major like {c:G}, a major third up, and sharing only {n:B}.',
    },
  ],
  facts: [
    {
      id: 'modulation-chromatic-mediant',
      front: 'What are chromatic mediants?',
      back: 'Chords of the same quality with roots a major or minor third apart that share only one note.',
    },
    {
      id: 'modulation-mediant-examples',
      front: 'Which one note do {c:C} and {c:E} share? And {c:C} and {c:Ab}?',
      back: '{c:C} and {c:E} share only {n:E}; {c:C} and {c:Ab} share only {n:C}.',
      ask: {
        type: 'type-answer',
        prompt: 'Type the one note shared by {c:C} and {c:E}.',
        answer: { kind: 'note', value: 'E', spelling: 'exact' },
        input: 'keypad',
        explain: '{c:C} is {n:C} {n:E} {n:G}; {c:E} is {n:E} {n:G#} {n:B}. Only {n:E} is in both.',
      },
    },
    { id: 'modulation-mediant-film', front: 'Where are chromatic mediants common?', back: 'In film music and Romantic-era harmony.' },
  ],
};

/** The German sixth in C on strings 4 to 1 (xx6542): Ab C Eb F#. */
const GERMAN_DOTS = [
  { string: 4, fret: 6, note: 'Ab3', role: 'target' as const },
  { string: 3, fret: 5, note: 'C4', role: 'tone' as const },
  { string: 2, fret: 4, note: 'Eb4', role: 'tone' as const },
  { string: 1, fret: 2, note: 'F#4', role: 'target' as const },
];

const augmentedSixthChords: Lesson = {
  id: 'augmented-sixth-chords',
  title: 'Augmented sixth chords',
  teaches: 'Augmented sixth chords put the flat 6th and sharp 4th a sixth apart, and both spread outward to the 5th.',
  minutes: 4,
  skill: `theory:${U}:augmented-sixth-chords`,
  steps: [
    {
      type: 'card',
      title: 'Two notes that open out',
      body: 'In {k:C major}, put {n:Ab}, the {d:b6}, below {n:F#}, the {d:#4}. They are an augmented sixth apart, {i:A6}: the heart of an {t:augmented-sixth-chord}. Each is a half step from {n:G}, the 5th, so {n:Ab} falls and {n:F#} rises, opening out to an octave of {n:G}.',
      figure: {
        kind: 'staff',
        key: 'C major',
        notes: [{ note: 'Ab3', duration: 'h' }, { note: 'G3', duration: 'h' }, { note: 'F#4', duration: 'h' }, { note: 'G4', duration: 'h' }],
        time: '4/4',
        caption: 'The low voice: {n:Ab} falls to {n:G}. The high voice: {n:F#} rises to {n:G}.',
      },
    },
    {
      type: 'card',
      title: 'Three flavours',
      body: 'Add {n:C}, the tonic, and you have the three augmented sixth chords of {k:C major}:\nItalian: {n:Ab} {n:C} {n:F#}\nFrench: {n:Ab} {n:C} {n:D} {n:F#}\nGerman: {n:Ab} {n:C} {n:Eb} {n:F#}\nOn the top four strings: xx657x (string 1 silent), xx6532 and xx6542, with {n:Ab} always lowest.',
      figure: { kind: 'fretboard', frets: [1, 7], dots: GERMAN_DOTS, caption: 'The German sixth on strings 4 to 1: {n:Ab} {n:C} {n:Eb} {n:F#}.' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the German sixth in {k:C major}.',
      text: '{n:Ab}  {n:C}  {n:Eb}  ___',
      blanks: ['{n:F#}'],
      bank: ['{n:Gb}', '{n:G}', '{n:F}'],
      spelling: 'exact',
      explain: 'The German sixth is {n:Ab} {n:C} {n:Eb} {n:F#}. It must be {n:F#}, the {d:#4}: only {n:Ab} up to {n:F#} is an augmented sixth, and {n:F#} rises to {n:G}.',
      fact: 'modulation-aug6-types',
    },
    {
      type: 'choice',
      prompt: 'Where does an augmented sixth chord usually resolve?',
      options: [
        { text: 'To {r:V}, or to {r:I} in second inversion, then {r:V}', correct: true },
        { text: 'Straight to {r:I} in root position', why: '{n:Ab} and {n:F#} both lead to {n:G}, the 5th of the key, not to the root, {n:C}.' },
        { text: 'Down a fifth, like a dominant 7th', why: 'Spelled as {c:Ab7} it would go to {c:Db}. Spelled with {n:F#}, it opens out to {r:V}.' },
      ],
      explain: 'The {d:b6} and {d:#4} both move a half step to the 5th, so the chord resolves to {r:V}, {c:G} in C, often through {c:C/G} first: {r:I} with its 5th in the bass.',
      fact: 'modulation-aug6-resolution',
    },
    {
      type: 'card',
      title: 'Resolving on the guitar',
      body: 'From the German sixth, xx6542, every voice moves a half step to {c:G} at xx5433: {n:Ab} to {n:G}, {n:C} to {n:B}, {n:Eb} to {n:D}, {n:F#} to {n:G}. Or go through {c:C/G} at xx5553 first: {n:Eb} rises to {n:E}, then on to {c:G}.',
      figure: {
        kind: 'audio',
        sound: {
          kind: 'tab',
          tempo: 76,
          notes: [
            { string: 4, fret: 6, duration: 'e' }, { string: 3, fret: 5, duration: 'e' }, { string: 2, fret: 4, duration: 'e' }, { string: 1, fret: 2, duration: 'e' },
            { rest: true, duration: 'h' },
            { string: 4, fret: 5, duration: 'e' }, { string: 3, fret: 4, duration: 'e' }, { string: 2, fret: 3, duration: 'e' }, { string: 1, fret: 3, duration: 'e' },
            { rest: true, duration: 'h' },
          ],
        },
        label: 'German sixth, then G',
      },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each augmented sixth chord of {k:C major} with its notes.',
      pairs: [
        { left: 'Italian sixth', right: '{n:Ab} {n:C} {n:F#}' },
        { left: 'French sixth', right: '{n:Ab} {n:C} {n:D} {n:F#}' },
        { left: 'German sixth', right: '{n:Ab} {n:C} {n:Eb} {n:F#}' },
      ],
      explain: 'All three hold {n:Ab}, {n:C} and {n:F#}. The French adds {n:D}, the 2nd of the key; the German adds {n:Eb}, the {d:b3}.',
    },
    {
      type: 'listen-choice',
      prompt: 'In {k:C major}: {c:C}, then a German sixth, then one more chord. Did it open out to the dominant, {c:G}?',
      sound: { kind: 'progression', chords: ['C', 'Ab7', 'G'], beats: 4, tempo: 76 },
      options: [{ text: 'Yes: out to {c:G}', correct: true }, { text: 'No: down a fifth to {c:Db}' }],
      shuffle: false,
      explain: 'The bass fell from {n:Ab} to {n:G} and the {n:F#} rose to {n:G}: outward to {c:G}, the dominant. That is an augmented sixth at work.',
    },
    {
      type: 'listen-choice',
      prompt: 'The same start, {c:C} then the same chord. Where did it go this time?',
      sound: { kind: 'progression', chords: ['C', 'Ab7', 'Db'], beats: 4, tempo: 76 },
      options: [{ text: 'Out to {c:G}' }, { text: 'Down a fifth to {c:Db}', correct: true }],
      shuffle: false,
      explain: 'This time the chord acted as a real dominant 7th, {c:Ab7}, and fell a fifth to {c:Db}. Heard alone, the German sixth and {c:Ab7} are the same sound; where it goes tells them apart.',
    },
    {
      type: 'true-false',
      statement: 'The German sixth in {k:C major} sounds just like an {c:Ab7} chord.',
      answer: true,
      explain: '{n:Ab} {n:C} {n:Eb} {n:F#} has the same pitches as {c:Ab7}, {n:Ab} {n:C} {n:Eb} {n:Gb}. The spelling shows where it goes: {n:F#} rises to {n:G}.',
      fact: 'modulation-german-ab7',
    },
    {
      type: 'choice',
      prompt: '{c:Ab7} is also the tritone substitute of which chord?',
      options: [
        { text: '{c:D7}', correct: true },
        { text: '{c:G7}', why: 'The tritone substitute of {c:G7} is {c:Db7}.' },
        { text: '{c:Eb7}', why: '{c:Eb7} is a fifth above {c:Ab7}, not a tritone away.' },
        { text: '{c:C7}', why: '{c:C7} is a major third from {c:Ab7}, not a tritone.' },
      ],
      explain: '{c:D7} and {c:Ab7} are a tritone apart and share their 3rd and 7th ({n:F#} and {n:C}). {c:D7} is {r:V7/V} in C, and both lead to {c:G}: that is why the German sixth goes to {r:V}.',
    },
    {
      type: 'play-chord',
      prompt: 'Play the German sixth on strings 4 to 1, xx6542; the box names it by its sound, {c:Ab7}. Then move every finger a half step to {c:G}, xx5433.',
      chord: 'Ab7',
      frets: 'xx6542',
      explain: 'xx6542 sounds {n:Ab} {n:C} {n:Eb} {n:F#}, the pitches of {c:Ab7}. Each note then moves a half step: down to {n:G}, {n:B} and {n:D}, and up to {n:G}.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'Ab7',
        frets: 'xx6542',
        accept: 'this-shape',
        prompt: 'Build the German sixth of {k:C major} on strings 4 to 1. It sounds like {c:Ab7}.',
        explain: 'xx6542: {n:Ab} at string 4, fret 6; {n:C} at string 3, fret 5; {n:Eb} at string 2, fret 4; {n:F#} at string 1, fret 2.',
      },
    },
  ],
  facts: [
    {
      id: 'modulation-aug6-resolution',
      front: 'How does an augmented sixth chord resolve in {k:C major}?',
      back: 'Its {d:b6} and {d:#4}, {n:Ab} and {n:F#}, an augmented sixth apart, spread outward by half step to an octave on the 5th: {n:G} and {n:G}.',
      ask: {
        type: 'type-answer',
        prompt: 'Type the interval from {n:Ab} up to {n:F#}.',
        answer: { kind: 'interval', value: 'A6', spelling: 'exact' },
        explain: '{n:Ab} up to {n:F} is a major sixth; {n:F#} is a half step wider: an augmented sixth, {i:A6}. Spelled {n:Gb}, the same pitch would be a minor seventh.',
      },
    },
    {
      id: 'modulation-aug6-types',
      front: 'Spell the Italian, French and German sixths in {k:C major}.',
      back: 'Italian {n:Ab} {n:C} {n:F#}; French {n:Ab} {n:C} {n:D} {n:F#}; German {n:Ab} {n:C} {n:Eb} {n:F#}.',
    },
    {
      id: 'modulation-german-ab7',
      front: 'What does the German sixth sound like?',
      back: 'An {c:Ab7} chord with {n:F#} written instead of {n:Gb}. {c:Ab7} is also the tritone substitute of {c:D7}, the {r:V} of {r:V}.',
    },
  ],
};

const unit: Unit = {
  id: U,
  title: 'Modulation and chromatic chords',
  theme: 'harmony',
  description: 'Changing key: tonicization or modulation, related keys, pivot chords, direct key changes, chromatic mediants and augmented sixths.',
  lessons: [tonicizationOrModulation, closelyRelatedKeys, pivotChords, directModulation, chromaticMediants, augmentedSixthChords],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      {
        type: 'choice',
        prompt: 'In {k:C major}, one {c:D7} {c:G}, then {c:F} {c:G} {c:C}. What happened?',
        options: [
          { text: 'A brief tonicization of {c:G}', correct: true },
          { text: 'A modulation to {k:G major}', why: 'The music went straight back home, with a cadence in C. A modulation would stay in G.' },
          { text: 'A modulation to {k:D major}', why: '{c:D7} was only the dominant of {c:G}; {k:D major} never became home.' },
        ],
        explain: '{c:D7} to {c:G} visited {c:G} for a moment; {c:F} {c:G} {c:C} brought the music home. A visit like that is tonicization.',
      },
      {
        type: 'true-false',
        statement: 'A modulation is confirmed by a cadence in the new key.',
        answer: true,
        explain: 'A new home needs its own cadence, usually its {r:V} to its {r:I}, and the music has to stay there.',
      },
      {
        type: 'choice',
        prompt: 'Which key is closely related to {k:D major}?',
        options: [
          { text: '{k:B minor}', correct: true },
          { text: '{k:F major}', why: '{k:F major} has one flat, three steps round the circle from two sharps.' },
          { text: '{k:E major}', why: '{k:E major} has four sharps, two more than {k:D major}.' },
          { text: '{k:C minor}', why: '{k:C minor} has three flats.' },
        ],
        explain: '{k:B minor} is the relative minor of {k:D major}: the same two sharps. D\'s closely related keys are {k:A major}, {k:G major}, {k:B minor}, {k:F# minor} and {k:E minor}.',
      },
      {
        type: 'type-answer',
        prompt: 'A piece in {k:E minor} modulates to its relative major. Type the tonic of that key.',
        answer: { kind: 'note', value: 'G', spelling: 'exact' },
        input: 'keypad',
        explain: 'The relative major of {k:E minor} is {k:G major}: the same one sharp, a minor third up.',
      },
      {
        type: 'choice',
        prompt: 'Which chord can pivot from {k:C major} to {k:G major}?',
        options: [
          { text: '{c:Em}', correct: true },
          { text: '{c:F}', why: '{c:F} is in C, but {k:G major} has {n:F#}.' },
          { text: '{c:D}', why: '{c:D} is in G, but its {n:F#} is not in {k:C major}.' },
          { text: '{c:Dm}', why: '{c:Dm} is in C, but its {n:F} natural is not in {k:G major}.' },
        ],
        explain: '{c:Em} is {r:iii} in C and {r:vi} in G, so it belongs to both keys and can link them.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Name the pivot in {c:C} {c:Am} {c:D7} {c:G}.',
        text: '{c:Am} is ___ in {k:C major} and ___ in {k:G major}.',
        blanks: ['{r:vi}', '{r:ii}'],
        bank: ['{r:iii}', '{r:IV}'],
        explain: '{n:A} is the 6th note of C major and the 2nd of G major: {r:vi} in C, {r:ii} in G.',
      },
      {
        type: 'match-pairs',
        prompt: 'Match each kind of modulation with how it works.',
        pairs: [
          { left: 'Pivot', right: 'Shares a chord' },
          { left: 'Direct', right: 'Jumps, with no link' },
          { left: 'Common-tone', right: 'Holds one shared note' },
        ],
        explain: 'Pivot modulations pass through a chord of both keys, common-tone modulations hold a shared note, and direct modulations simply jump.',
      },
      {
        type: 'type-answer',
        prompt: 'A song in {k:G major} moves up a whole step for its last chorus. Type the tonic of the new key.',
        answer: { kind: 'note', value: 'A', spelling: 'exact' },
        input: 'keypad',
        explain: 'A whole step above {n:G} is {n:A}: the last chorus is in {k:A major}, a direct modulation.',
      },
      {
        type: 'choice',
        prompt: 'Which change is a chromatic mediant?',
        options: [
          { text: '{c:C} to {c:Ab}', correct: true },
          { text: '{c:C} to {c:Am}', why: '{c:Am} shares two notes with {c:C}, {n:C} and {n:E}, and is in the key.' },
          { text: '{c:C} to {c:F}', why: 'Roots a fourth apart: an everyday change in {k:C major}.' },
          { text: '{c:C} to {c:Dm}', why: 'Roots a step apart, both in {k:C major}.' },
        ],
        explain: '{c:C} and {c:Ab} are both major, with roots a major third apart, and share only {n:C}.',
      },
      {
        type: 'type-answer',
        prompt: 'Type the one note shared by {c:C} and {c:E}.',
        answer: { kind: 'note', value: 'E', spelling: 'exact' },
        input: 'keypad',
        explain: '{c:C} is {n:C} {n:E} {n:G} and {c:E} is {n:E} {n:G#} {n:B}: only {n:E} is shared.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Complete the French sixth in {k:C major}.',
        text: '{n:Ab}  {n:C}  ___  {n:F#}',
        blanks: ['{n:D}'],
        bank: ['{n:Eb}', '{n:E}', '{n:Bb}'],
        explain: 'The French sixth is {n:Ab} {n:C} {n:D} {n:F#}. With {n:Eb} instead of {n:D} it would be the German sixth.',
      },
      {
        type: 'choice',
        prompt: 'In {k:C major}, where do {n:Ab} and {n:F#} of an augmented sixth chord go?',
        options: [
          { text: 'Both to {n:G}, an octave apart', correct: true },
          { text: '{n:Ab} up to {n:A}, {n:F#} down to {n:F}', why: 'That squeezes them inward. An augmented sixth opens outward, to the 5th.' },
          { text: 'Both to {n:C}', why: '{n:C} is a third away from each; the half-step moves lead to {n:G}.' },
        ],
        explain: '{n:Ab} falls a half step and {n:F#} rises a half step, landing on {n:G} and {n:G}: the 5th of the key, the root of {r:V}.',
      },
      {
        type: 'true-false',
        statement: 'The German sixth in {k:C major} has the same pitches as an {c:Ab7} chord.',
        answer: true,
        explain: '{n:Ab} {n:C} {n:Eb} {n:F#} sounds like {c:Ab7}, with {n:F#} written for {n:Gb}. As a German sixth it opens out to {c:G}.',
      },
      {
        type: 'listen-choice',
        prompt: 'A passage in {k:C major}. Does it visit {c:G} briefly, or move to {k:G major} for good?',
        sound: chart(MOVE_1),
        options: [{ text: 'A brief visit to {c:G}' }, { text: 'A move to {k:G major} for good', correct: true }],
        shuffle: false,
        explain: '{c:C} {c:F} {c:Am} {c:D7}, then {c:G} {c:D7} {c:G} {c:G}: the cadence into {c:G} came twice and the music stayed there.',
      },
      { generate: 'roman-chord', params: { direction: 'to-roman', maxAccidentals: 2 } },
    ],
  },
};

export default unit;
