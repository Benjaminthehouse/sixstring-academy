/**
 * Theory Path, unit 32: Secondary dominants. Written from the syllabus entries in
 * `src/content/plan/theory-path.json` (unit `secondary-dominants`), one lesson per entry, in order:
 * each lesson opens with the "on the guitar" picture, asks the planned exercises, ends with the
 * planned drill, and turns every planned fact into a review card.
 *
 * Every numeral, chord, outside note and resolution is cross-checked against `@/core/theory`
 * (`secondaryDominants`, `romanToChord`, `chordToRoman`) and every shape against `@/core/guitar`
 * in `secondary-dominants.test.ts`.
 *
 * Notes for readers of the code:
 * - The `roman-chord` drill explains a numeral as "the chord on degree N of the scale", which is
 *   wrong for a secondary numeral (V7/V is not built on degree 5). So the drills here ask for the
 *   diatonic TARGET chords (ii, iii, IV, V, vi), the first step of finding any V7/x, and the
 *   secondary numerals themselves are asked in authored questions.
 * - A play-chord step listens for one chord, so "play the progression" is shown on a card and the
 *   play step asks for its secondary dominant.
 * - Progressions with a leading-tone chord use close voicings, so the bass really climbs a half
 *   step (F#3 to G3); the library guitar shapes would put the diminished chord's root elsewhere.
 * - Diminished seventh chords come in only three different pitch sets, so a question about them
 *   offers exactly one chord from each set.
 */
import type { Lesson, Unit } from '@/lessons';

const U = 'secondary-dominants';

/** The diatonic targets of a major key's secondary dominants, most used first. */
const TARGETS = ['V', 'ii', 'vi', 'IV', 'iii'];

const whatASecondaryDominantIs: Lesson = {
  id: 'what-a-secondary-dominant-is',
  title: 'The dominant of another chord',
  teaches: 'A secondary dominant is the dominant of a chord other than the tonic, which it briefly makes sound like home.',
  minutes: 3,
  skill: `theory:${U}:what-a-secondary-dominant-is`,
  steps: [
    {
      type: 'card',
      title: 'A dominant for G',
      body: 'Play {c:C}, {c:D7} (xx0212), {c:G}, {c:C}. In {k:C major}, {c:G} is {r:V}. The {c:D7} before it is the {r:V7} *of* {c:G}, written {r:V7/V}, so for a moment {c:G} sounds like home. A {t:secondary-dominant} is the dominant of a chord other than the tonic.',
      figure: { kind: 'chord', symbol: 'D7', frets: 'xx0212', caption: '{c:D7} (xx0212): the {n:F#} on string 1 is not in {k:C major}.' },
    },
    {
      type: 'card',
      title: 'Hear the pull',
      body: 'Listen for the {n:F#} in {c:D7}. It is the {t:leading-tone} of {c:G}: it wants to rise a half step to {n:G}, and {c:D7} lands on {c:G} the way {c:G7} lands on {c:C}.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['C', 'D7', 'G', 'C'], beats: 4, tempo: 72 }, label: 'Hear {c:C} {c:D7} {c:G} {c:C}' },
    },
    {
      type: 'choice',
      prompt: 'In {k:C major}, {c:D7} leads to {c:G}. What do we call {c:D7} here?',
      options: [
        { text: '{r:V7/V}', correct: true },
        { text: '{r:ii7}', why: '{r:ii7} in {k:C major} is {c:Dm7}, with {n:F}. {c:D7} has {n:F#}.' },
        { text: '{r:V7}', why: 'The {r:V7} of {k:C major} itself is {c:G7}.' },
        { text: '{r:I7}', why: '{r:I7} would be {c:C7}.' },
      ],
      explain: '{c:D7} is the dominant seventh of {c:G}, and {c:G} is {r:V}: so {c:D7} is {r:V7/V}, five-seven of five.',
      fact: 'secondary-d7-in-c',
    },
    {
      type: 'card',
      title: 'The slash means "of"',
      body: 'Read {r:V7/V} as five-seven of five. After the slash comes the target chord; before it, the target\'s own dominant. {r:V7/ii} is the dominant seventh of {r:ii}, and {r:V7/IV} the dominant seventh of {r:IV}.',
      tip: 'To find one, name the target chord first, then build a dominant 7th a fifth above its root.',
    },
    {
      type: 'choice',
      prompt: 'In {k:G major}, what is {r:V7/V}?',
      options: [
        { text: '{c:A7}', correct: true },
        { text: '{c:D7}', why: '{c:D7} is the plain {r:V7} of {k:G major}: the dominant of the tonic.' },
        { text: '{c:Am7}', why: '{c:Am7} is {r:ii7}. The dominant of {c:D} is a dominant 7th with {n:C#}.' },
        { text: '{c:E7}', why: '{c:E7} is {r:V7/ii}: it leads to {c:Am}.' },
      ],
      explain: '{r:V} in {k:G major} is {c:D}. A fifth above {n:D} is {n:A}, so the dominant seventh of {c:D} is {c:A7}.',
    },
    {
      type: 'listen-choice',
      prompt: 'In {k:C major}: was the chord before {c:G} a plain {r:ii} ({c:Dm}) or {r:V7/V} ({c:D7})?',
      sound: { kind: 'progression', chords: ['C', 'Dm', 'G', 'C'], beats: 4, tempo: 72 },
      options: [{ text: 'Plain {r:ii}: {c:Dm}', correct: true }, { text: '{r:V7/V}: {c:D7}' }],
      shuffle: false,
      explain: 'That was {c:Dm}, with a plain {n:F}: the key\'s own {r:ii}. {c:D7} has {n:F#} instead, which leans much harder into {c:G}.',
    },
    {
      type: 'card',
      title: 'Home for a moment',
      body: 'A secondary dominant does not change the key. It lends its target a moment of home: {c:G} sounds like a tonic for a beat, then {k:C major} carries on. That brief borrowing of home is called {t:tonicization}.',
    },
    {
      type: 'true-false',
      statement: 'A secondary dominant changes the key of the song for good.',
      answer: false,
      explain: 'It only tonicizes its target for a moment: the target sounds like home, then the song carries on in its key.',
      fact: 'secondary-tonicization',
    },
    {
      type: 'type-answer',
      prompt: 'Type the chord that is {r:V7/IV} in {k:G major}.',
      answer: { kind: 'chord', value: 'G7', spelling: 'exact' },
      input: 'keyboard',
      explain: '{r:IV} in {k:G major} is {c:C}. The dominant seventh of {c:C} is {c:G7}: the tonic chord with a {d:b7}, {n:F}, from outside the key.',
      fact: 'secondary-definition',
    },
    { generate: 'roman-chord', params: { direction: 'to-chord', numerals: TARGETS, modes: ['major'], maxAccidentals: 2 } },
  ],
  facts: [
    {
      id: 'secondary-definition',
      front: 'What is a secondary dominant, and how is it written?',
      back: 'The {r:V} or {r:V7} of a chord other than the tonic. It is written with a slash: {r:V7/V}, {r:V7/ii} (five-seven of two).',
    },
    {
      id: 'secondary-d7-in-c',
      front: 'In {k:C major}, what is {r:V7/V}?',
      back: '{c:D7}: the dominant seventh of {c:G}. Its {n:F#} is outside the key.',
      ask: {
        type: 'choice',
        prompt: 'In {k:C major}, which chord is {r:V7/V}?',
        options: [
          { text: '{c:D7}', correct: true },
          { text: '{c:G7}', why: '{c:G7} is the plain {r:V7} of {k:C major}.' },
          { text: '{c:Dm7}', why: '{c:Dm7} is {r:ii7}, with {n:F}, not {n:F#}.' },
        ],
        explain: '{r:V} is {c:G}, and the dominant seventh of {c:G} is {c:D7}.',
      },
    },
    {
      id: 'secondary-tonicization',
      front: 'What does a secondary dominant do to its target chord?',
      back: 'It briefly treats it as a temporary tonic, a short-lived home. This is called {t:tonicization}.',
    },
  ],
};

const theFiveInC: Lesson = {
  id: 'the-five-in-c',
  title: 'The secondary dominants of C',
  teaches: 'A major key has five secondary dominants: one for each major or minor chord of the key except the tonic.',
  minutes: 3,
  skill: `theory:${U}:the-five-in-c`,
  steps: [
    {
      type: 'card',
      title: 'One for each chord',
      body: 'Every major or minor chord of {k:C major} can have its own dominant: take the note a fifth above its root and build a dominant 7th there. {c:A7} leads to {c:Dm}, {c:B7} to {c:Em}, {c:C7} to {c:F}, {c:D7} to {c:G} and {c:E7} to {c:Am}.',
      figure: { kind: 'chord', symbol: 'A7', frets: 'x02020', caption: '{c:A7} (x02020): {r:V7/ii}, leading to {c:Dm}.' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each chord with its job in {k:C major}.',
      pairs: [
        { left: '{c:A7}', right: '{r:V7/ii}' },
        { left: '{c:B7}', right: '{r:V7/iii}' },
        { left: '{c:D7}', right: '{r:V7/V}' },
        { left: '{c:E7}', right: '{r:V7/vi}' },
      ],
      explain: 'Each one sits a fifth above its target: {c:A7} over {c:Dm} ({r:ii}), {c:B7} over {c:Em} ({r:iii}), {c:D7} over {c:G} ({r:V}), {c:E7} over {c:Am} ({r:vi}).',
      fact: 'secondary-five-in-c',
    },
    {
      type: 'card',
      title: 'The note from outside',
      body: 'Each one brings at least one note from outside the key, usually the {t:leading-tone} of its target: {n:C#} in {c:A7} rises to {n:D}, {n:F#} in {c:D7} rises to {n:G}, {n:G#} in {c:E7} rises to {n:A}. {c:C7} is the odd one: its outside note is the {d:b7}, {n:Bb}.',
      figure: { kind: 'chord', symbol: 'E7', frets: '020100', caption: '{c:E7} (020100): the {n:G#} on string 3 leads up to {n:A}.' },
    },
    {
      type: 'choice',
      prompt: 'Which note from outside the key does {c:E7} add in {k:C major}?',
      options: [
        { text: '{n:G#}', correct: true },
        { text: '{n:E}', why: '{n:E} is in {k:C major}.' },
        { text: '{n:D}', why: '{n:D} is in {k:C major}: it is the 7th of {c:E7}.' },
        { text: '{n:B}', why: '{n:B} is in {k:C major}: it is the 5th of {c:E7}.' },
      ],
      explain: '{c:E7} is {n:E} {n:G#} {n:B} {n:D}. Only {n:G#} is outside the key, and it is the leading tone of {c:Am}.',
      fact: 'secondary-outside-notes',
    },
    {
      type: 'card',
      title: 'None for the diminished chord',
      body: 'The chord on degree 7, {c:Bdim} ({r:vii°}), gets no secondary dominant. A diminished chord is too unstable to sound like home, even for a moment. That leaves five: {r:V7/ii}, {r:V7/iii}, {r:V7/IV}, {r:V7/V} and {r:V7/vi}.',
    },
    {
      type: 'true-false',
      statement: '{k:C major} has a secondary dominant for {r:vii°}.',
      answer: false,
      explain: '{r:vii°} is a diminished chord, which cannot act as a temporary tonic. So a major key has five secondary dominants, not six.',
      fact: 'secondary-no-vii',
    },
    {
      type: 'choice',
      prompt: 'Which secondary dominant of {k:C major} leads to {c:F}?',
      options: [
        { text: '{c:C7}', correct: true },
        { text: '{c:F7}', why: '{c:F7} would lead a fifth down, to {c:Bb}.' },
        { text: '{c:G7}', why: '{c:G7} leads to {c:C}.' },
        { text: '{c:Bb7}', why: '{c:Bb7} would lead to {c:Eb}.' },
      ],
      explain: '{c:F} is {r:IV}. A fifth above {n:F} is {n:C}, so its dominant is {c:C7}: {r:V7/IV}.',
    },
    {
      type: 'play-chord',
      prompt: 'Strum {c:B7} (x21202), the {r:V7/iii} of {k:C major}.',
      chord: 'B7',
      frets: 'x21202',
      explain: '{c:B7} is {n:B} {n:D#} {n:F#} {n:A}. Its {n:D#} leads up to {n:E}, the root of {c:Em}.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'B7',
        frets: 'x21202',
        accept: 'any-voicing',
        prompt: 'Build {c:B7}, the {r:V7/iii} of {k:C major}.',
        explain: 'x21202: {n:B}, {n:D#}, {n:A}, {n:B} and {n:F#}.',
      },
    },
    { generate: 'roman-chord', params: { direction: 'to-roman', numerals: TARGETS, modes: ['major'], maxAccidentals: 2 } },
  ],
  facts: [
    {
      id: 'secondary-five-in-c',
      front: 'Name the five secondary dominants of {k:C major}.',
      back: '{c:A7} ({r:V7/ii}), {c:B7} ({r:V7/iii}), {c:C7} ({r:V7/IV}), {c:D7} ({r:V7/V}) and {c:E7} ({r:V7/vi}).',
      ask: {
        type: 'match-pairs',
        prompt: 'Match each chord with its job in {k:C major}.',
        pairs: [
          { left: '{c:A7}', right: '{r:V7/ii}' },
          { left: '{c:C7}', right: '{r:V7/IV}' },
          { left: '{c:D7}', right: '{r:V7/V}' },
          { left: '{c:E7}', right: '{r:V7/vi}' },
        ],
        explain: 'Each sits a fifth above its target: {c:Dm}, {c:F}, {c:G} and {c:Am}.',
      },
    },
    {
      id: 'secondary-no-vii',
      front: 'Why does a major key have no secondary dominant for {r:vii°}?',
      back: 'A diminished chord cannot act as a temporary tonic, so nothing leads to it.',
    },
    {
      id: 'secondary-outside-notes',
      front: 'What does each secondary dominant bring from outside the key?',
      back: 'At least one outside note, usually the leading tone of its target: {n:C#} in {c:A7}, {n:F#} in {c:D7}, {n:G#} in {c:E7}.',
    },
  ],
};

const spottingAndResolving: Lesson = {
  id: 'spotting-and-resolving',
  title: 'Spotting and resolving them',
  teaches: 'A major or dominant chord where the key has a minor one is usually a secondary dominant, and falls a fifth.',
  minutes: 3,
  skill: `theory:${U}:spotting-and-resolving`,
  steps: [
    {
      type: 'card',
      title: 'Spot the strangers',
      body: 'An original chart in {k:G major}: {c:G} {c:E7} {c:Am} {c:D7} {c:G} {c:B7} {c:Em} {c:D7}, one chord a bar. The key\'s own chords on {n:E} and {n:B} are minor: {c:Em} and {c:Bm}. So {c:E7} and {c:B7} are strangers, major where the key has minor: secondary dominants.',
      figure: { kind: 'chord', symbol: 'B7', frets: 'x21202', caption: '{c:B7} (x21202): {r:V7/vi} in {k:G major}, heading for {c:Em}.' },
    },
    {
      type: 'card',
      title: 'Down a fifth',
      body: 'Each one falls **down a fifth** to the chord it serves: {c:E7} to {c:Am}, {c:B7} to {c:Em}. Listen for the outside note, {n:G#} or {n:D#}, rising a half step into the next chord. The {c:D7} in bars 4 and 8 is the key\'s own {r:V7}.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['G', 'E7', 'Am', 'D7', 'G', 'B7', 'Em', 'D7'], beats: 2, tempo: 90 }, label: 'Hear the eight-bar chart' },
    },
    {
      type: 'choice',
      prompt: 'In {k:G major}, {c:B7} resolves to which chord?',
      options: [
        { text: '{c:Em}', correct: true },
        { text: '{c:Bm}', why: '{c:Bm} is the key\'s own chord on {n:B}; {c:B7} takes its place and moves on.' },
        { text: '{c:C}', why: '{c:B7} falls a fifth: from {n:B} that is {n:E}, not {n:C}.' },
        { text: '{c:G}', why: 'The dominant of {c:G} is {c:D7}.' },
      ],
      explain: 'A fifth below {n:B} is {n:E}, and the key\'s chord on {n:E} is {c:Em}: {c:B7} is {r:V7/vi}.',
      fact: 'secondary-resolve-down-fifth',
    },
    {
      type: 'listen-choice',
      prompt: 'In {k:C major}: did the secondary dominant, {c:E7}, go to its target or somewhere else?',
      sound: { kind: 'progression', chords: ['C', 'E7', 'Am', 'F', 'G7', 'C'], beats: 2, tempo: 90 },
      options: [{ text: 'To its target, {c:Am}', correct: true }, { text: 'Somewhere else' }],
      shuffle: false,
      explain: '{c:E7} went straight to {c:Am}, down a fifth: its {n:G#} rose to {n:A}. Then {c:F}, {c:G7} and home.',
    },
    {
      type: 'type-answer',
      prompt: 'In {k:D major}, type the target chord of {c:F#7}.',
      // The key's chord on B as a seventh chord is just as right a target.
      answer: { kind: 'chord', value: 'Bm', spelling: 'exact', accept: ['Bm7'] },
      input: 'keyboard',
      explain: '{c:F#7} falls a fifth to {n:B}. The chord of {k:D major} on {n:B} is {c:Bm}, so {c:F#7} is {r:V7/vi}.',
      fact: 'secondary-resolve-down-fifth',
    },
    {
      type: 'card',
      title: 'When home is a dominant 7th',
      body: 'One stranger looks like home: {c:C7} in {k:C major}. In a blues it is the home chord. Anywhere else its {d:b7}, {n:Bb}, pulls toward {c:F}, so {c:C7} is heard as {r:V7/IV}, not as the tonic.',
      figure: { kind: 'chord', symbol: 'C7', frets: 'x32310', caption: '{c:C7} (x32310): the {n:Bb} on string 3 pulls toward {c:F}.' },
    },
    {
      type: 'true-false',
      statement: 'Outside a blues, {c:C7} in {k:C major} usually heads to {c:F}.',
      answer: true,
      explain: 'Its {n:Bb} is the {d:b7} that makes it a dominant of {c:F}: {c:C7} is heard as {r:V7/IV}.',
      fact: 'secondary-i7-as-v7-of-iv',
    },
    {
      type: 'choice',
      prompt: 'In {k:C major}, which of these chords is most likely a secondary dominant?',
      options: [
        { text: '{c:A7}', correct: true },
        { text: '{c:Am}', why: '{c:Am} is the key\'s own chord on degree 6.' },
        { text: '{c:G7}', why: '{c:G7} is the key\'s own {r:V7}.' },
        { text: '{c:Fmaj7}', why: '{c:Fmaj7} is the key\'s own {r:IVmaj7}.' },
      ],
      explain: 'The key has {c:Am} on degree 6. {c:A7} is major there, with {n:C#}: it is {r:V7/ii}, on its way to {c:Dm}.',
      fact: 'secondary-spotting',
    },
    { generate: 'roman-chord', params: { direction: 'to-chord', numerals: TARGETS, modes: ['major'], maxAccidentals: 3 } },
  ],
  facts: [
    {
      id: 'secondary-spotting',
      front: 'How can you spot a secondary dominant in a chord chart?',
      back: 'Look for a major or dominant 7th chord on a degree where the key has a minor chord. It is usually a secondary dominant: {c:A7} in {k:C major}, where the key\'s own chord is {c:Am}.',
    },
    {
      id: 'secondary-resolve-down-fifth',
      front: 'Where does a secondary dominant usually go?',
      back: 'Down a fifth, to its target: {c:E7} to {c:Am}.',
      ask: {
        type: 'choice',
        prompt: 'In {k:C major}, where does {c:E7} usually resolve?',
        options: [
          { text: '{c:Am}', correct: true },
          { text: '{c:Em}', why: '{c:Em} is the key\'s own chord on {n:E}; {c:E7} replaces it and moves on.' },
          { text: '{c:F}', why: 'A fifth below {n:E} is {n:A}, not {n:F}.' },
        ],
        explain: 'Down a fifth from {n:E} is {n:A}: {c:E7} is {r:V7/vi} and resolves to {c:Am}.',
      },
    },
    {
      id: 'secondary-i7-as-v7-of-iv',
      front: 'Outside a blues, what is {c:C7} in {k:C major}?',
      back: 'Usually {r:V7/IV}: it heads to {c:F}, so it is heard as the dominant of {r:IV}, not as the tonic.',
    },
  ],
};

const chainsOfDominants: Lesson = {
  id: 'chains-of-dominants',
  title: 'Chains of dominants',
  teaches: 'Dominants can chain, each resolving down a fifth to the next, round the circle of fifths toward the tonic.',
  minutes: 3,
  skill: `theory:${U}:chains-of-dominants`,
  steps: [
    {
      type: 'card',
      title: 'Dominant after dominant',
      body: 'A secondary dominant can resolve to another dominant. Play {c:E7} (020100), {c:A7} (x02020), {c:D7} (xx0212), {c:G7} (320001), {c:C} (x32010): each chord is the {r:V7} of the next, a fifth down every time, until {c:C} ends the chain.',
      figure: { kind: 'circle', key: 'C major', highlight: ['E major', 'A major', 'D major', 'G major'], show: 'major', caption: 'The chain walks anticlockwise: {n:E}, {n:A}, {n:D}, {n:G}, then home to {n:C}.' },
    },
    {
      type: 'card',
      title: 'Hear the chain',
      body: 'Each chord lasts a bar and leans into the next. The ear always knows where it is going, so a chain can start far from home and still sound sure of itself.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['E7', 'A7', 'D7', 'G7', 'C'], beats: 4, tempo: 96 }, label: 'Hear the chain' },
    },
    {
      type: 'order',
      prompt: 'Put these dominants in order so that the chain ends on {c:C}.',
      tiles: ['{c:E7}', '{c:A7}', '{c:D7}', '{c:G7}'],
      explain: 'Each falls a fifth to the next: {n:E} to {n:A} to {n:D} to {n:G}, and {c:G7} resolves to {c:C}.',
      fact: 'secondary-chain',
    },
    {
      type: 'choice',
      prompt: 'Which dominant comes just before {c:E7} in a chain of fifths?',
      options: [
        { text: '{c:B7}', correct: true },
        { text: '{c:A7}', why: '{c:A7} comes after {c:E7}: {n:E} falls a fifth to {n:A}.' },
        { text: '{c:D7}', why: '{c:D7} comes two steps after {c:E7}.' },
        { text: '{c:F#7}', why: '{c:F#7} leads to {c:B7}, two steps before {c:E7}.' },
      ],
      explain: 'The chord before {c:E7} must fall a fifth onto {n:E}: a fifth above {n:E} is {n:B}, so {c:B7}.',
      fact: 'secondary-chain',
    },
    {
      type: 'true-false',
      statement: 'A chain of dominants travels anticlockwise round the circle of fifths, toward the tonic.',
      answer: true,
      explain: 'Clockwise goes up a fifth each step ({n:C} {n:G} {n:D} {n:A} {n:E}). A chain falls a fifth each step, so it walks back the other way: {n:E} {n:A} {n:D} {n:G} {n:C}.',
      fact: 'secondary-chain-circle',
    },
    {
      type: 'card',
      title: 'The ragtime progression',
      body: 'Ragtime and early jazz loved this chain: {r:III7}–{r:VI7}–{r:II7}–{r:V7}–{r:I}. In {k:C major} that is {c:E7} {c:A7} {c:D7} {c:G7} {c:C}: three secondary dominants, then the real one, falling into home.',
      figure: { kind: 'chord', symbol: 'G7', frets: '320001', caption: '{c:G7} (320001): the last link, the key\'s own {r:V7}.' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the ragtime progression in {k:C major}.',
      text: '{c:E7}  ___  {c:D7}  ___  {c:C}',
      blanks: ['{c:A7}', '{c:G7}'],
      bank: ['{c:Am}', '{c:B7}', '{c:F7}'],
      explain: '{r:III7}–{r:VI7}–{r:II7}–{r:V7}–{r:I}: {c:E7} {c:A7} {c:D7} {c:G7} {c:C}, a fifth down every step.',
      fact: 'secondary-ragtime',
    },
    {
      type: 'play-chord',
      prompt: 'Strum {c:A7} (x02020), the second link of the chain.',
      chord: 'A7',
      frets: 'x02020',
      explain: '{c:A7} is {n:A} {n:C#} {n:E} {n:G}. Its {n:C#} leads up to {n:D}, the root of the next link, {c:D7}.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'A7',
        frets: 'x02020',
        accept: 'any-voicing',
        prompt: 'Build {c:A7}, the second link of the chain.',
        explain: 'x02020: open {n:A}, {n:E} at fret 2 of string 4, open {n:G}, {n:C#} at fret 2 of string 2, open {n:E}.',
      },
    },
    {
      type: 'play-chord',
      prompt: 'Now strum {c:D7} (xx0212), the third link.',
      chord: 'D7',
      frets: 'xx0212',
      explain: '{c:D7} is {n:D} {n:F#} {n:A} {n:C}. Its {n:F#} leads up to {n:G}, the root of {c:G7}.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'D7',
        frets: 'xx0212',
        accept: 'any-voicing',
        prompt: 'Build {c:D7}, the third link of the chain.',
        explain: 'xx0212: open {n:D}, {n:A} at fret 2 of string 3, {n:C} at fret 1 of string 2, {n:F#} at fret 2 of string 1.',
      },
    },
    {
      type: 'choice',
      prompt: 'A chain ends on {c:G}: {c:B7} {c:E7} {c:A7}, then which chord, then {c:G}?',
      options: [
        { text: '{c:D7}', correct: true },
        { text: '{c:C7}', why: '{c:C7} would fall to {c:F}.' },
        { text: '{c:Am7}', why: 'The chain is all dominants, and {c:A7} must fall to a chord on {n:D}.' },
        { text: '{c:F#7}', why: '{c:F#7} falls to {c:B7}: it would start the chain, not end it.' },
      ],
      explain: '{c:A7} falls a fifth to {n:D}, and {c:D7} falls a fifth to {c:G}: {c:B7} {c:E7} {c:A7} {c:D7} {c:G}.',
    },
  ],
  facts: [
    {
      id: 'secondary-chain',
      front: 'What is a chain of dominants?',
      back: 'Dominant chords that each resolve down a fifth to the next dominant: {c:E7} {c:A7} {c:D7} {c:G7} {c:C}.',
      ask: {
        type: 'order',
        prompt: 'Put these dominants in order so that the chain ends on {c:G}.',
        tiles: ['{c:B7}', '{c:E7}', '{c:A7}', '{c:D7}'],
        explain: 'A fifth down each time: {n:B} {n:E} {n:A} {n:D}, and {c:D7} resolves to {c:G}.',
      },
    },
    {
      id: 'secondary-chain-circle',
      front: 'Which way round the circle of fifths does a chain of dominants travel?',
      back: 'Anticlockwise: a fifth down each step, toward the tonic.',
    },
    {
      id: 'secondary-ragtime',
      front: 'What is the ragtime progression?',
      back: '{r:III7}–{r:VI7}–{r:II7}–{r:V7}–{r:I}: in {k:C major}, {c:E7} {c:A7} {c:D7} {c:G7} {c:C}.',
    },
  ],
};

const secondaryLeadingToneChords: Lesson = {
  id: 'secondary-leading-tone-chords',
  title: 'Secondary leading-tone chords',
  teaches: 'A diminished chord a half step below a diatonic chord can lead to it, acting as a dominant without its root.',
  minutes: 3,
  skill: `theory:${U}:secondary-leading-tone-chords`,
  steps: [
    {
      type: 'card',
      title: 'A half step below',
      body: 'Play {c:C} (x32010), {c:F#dim7} (2x121x), {c:G} (320003). The bass climbs {n:F#} to {n:G}, a half step. A diminished chord a half step below a chord of the key leads straight into it: a {t:leading-tone-chord}. This one is {r:vii°7/V}.',
      figure: { kind: 'chord', symbol: 'F#dim7', frets: '2x121x', caption: '{c:F#dim7} (2x121x): {n:F#} in the bass, a half step under {n:G}.' },
    },
    {
      type: 'card',
      title: 'Hear the climb',
      body: 'Listen to the lowest note: {n:C}, then {n:F#}, then {n:G}. The diminished chord is tense all over, and it melts into {c:G}.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['C', 'F#dim7', 'G'], voicing: 'close', beats: 4, tempo: 72 }, label: 'Hear {c:C}, {c:F#dim7}, {c:G}' },
    },
    {
      type: 'choice',
      prompt: 'Which diminished 7th chord leads to {c:Am} in {k:C major}?',
      options: [
        { text: '{c:G#dim7}', correct: true },
        { text: '{c:Gdim7}', why: 'Its root, {n:G}, is a whole step below {n:A}. A leading-tone chord sits a half step below.' },
        { text: '{c:Adim7}', why: 'That is built on {n:A} itself, not a half step below it.' },
      ],
      explain: 'A half step below {n:A} is {n:G#}: {c:G#dim7} ({n:G#} {n:B} {n:D} {n:F}) is {r:vii°7/vi}.',
      fact: 'secondary-half-step-below',
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete {c:F#dim7}.',
      text: '{n:F#}  {n:A}  {n:C}  ___',
      blanks: ['{n:Eb}'],
      bank: ['{n:D#}', '{n:E}', '{n:D}'],
      spelling: 'exact',
      explain: 'A diminished 7th chord stacks minor thirds: {n:F#} {n:A} {n:C}, then a minor third above {n:C}, {n:Eb}. A 7th above {n:F#} is always some kind of E, so it is spelled {n:Eb}, not {n:D#}.',
    },
    {
      type: 'card',
      title: 'A dominant without its root',
      body: 'Compare {c:D7b9}: {n:D} {n:F#} {n:A} {n:C} {n:Eb}, the dominant of {c:G} with a {d:b9}. Take away the {n:D} and what is left is {c:F#dim7}. So a leading-tone chord works like a secondary dominant with its root missing.',
      figure: {
        kind: 'keyboard',
        keys: [
          { note: 'D4', role: 'ghost' },
          { note: 'F#4', role: 'third' },
          { note: 'A4', role: 'fifth' },
          { note: 'C5', role: 'seventh' },
          { note: 'Eb5', role: 'tone' },
        ],
        // Nine white keys, D4 to E5: a tenth is cropped at phone width.
        from: 'D4',
        to: 'E5',
        caption: '{c:D7b9}: take away the {n:D} and {c:F#dim7} is left.',
      },
    },
    {
      type: 'true-false',
      statement: '{c:F#dim7} is {c:D7b9} without its root.',
      answer: true,
      explain: '{c:D7b9} is {n:D} {n:F#} {n:A} {n:C} {n:Eb}. Without the {n:D}: {n:F#} {n:A} {n:C} {n:Eb}, which is {c:F#dim7}.',
      fact: 'secondary-rootless-dominant',
    },
    {
      type: 'listen-choice',
      prompt: 'Listen to the bass. Did the diminished chord lead to the next chord a half step up?',
      sound: { kind: 'progression', chords: ['C', 'C#dim7', 'Dm', 'G7', 'C'], voicing: 'close', beats: 2, tempo: 80 },
      options: [{ text: 'Yes: a half step up', correct: true }, { text: 'No: it fell a fifth' }],
      shuffle: false,
      explain: '{c:C#dim7} climbed to {c:Dm}: the bass went {n:C#} to {n:D}. {c:C#dim7} is {r:vii°7/ii}.',
    },
    {
      type: 'choice',
      prompt: 'In {k:C major}, which chord is {r:vii°7/V}?',
      options: [
        { text: '{c:F#dim7}', correct: true },
        { text: '{c:Bdim7}', why: '{c:Bdim7} sits a half step below {n:C}: it leads to the tonic, not to {r:V}.' },
        { text: '{c:Gdim7}', why: 'Its root is {n:G} itself, not a half step below {n:G}.' },
      ],
      explain: '{r:V} is {c:G}. A half step below {n:G} is {n:F#}, so its leading-tone chord is {c:F#dim7}.',
      fact: 'secondary-leading-tone-chord',
    },
    { generate: 'chord-tones', params: { types: ['dim7', '7'], roots: ['F#', 'G#', 'C#', 'B', 'D', 'E'], ask: 'notes' } },
  ],
  facts: [
    {
      id: 'secondary-leading-tone-chord',
      front: 'What is a secondary leading-tone chord?',
      back: 'The {r:vii°} or {r:vii°7} of a chord other than the tonic: {c:F#dim7} leading to {c:G} in {k:C major} is {r:vii°7/V}.',
    },
    {
      id: 'secondary-rootless-dominant',
      front: 'How is {c:F#dim7} related to {c:D7b9}?',
      back: 'It is {c:D7b9} without its root: {c:F#dim7} is {n:F#} {n:A} {n:C} {n:Eb}; {c:D7b9} is {n:D} {n:F#} {n:A} {n:C} {n:Eb}.',
    },
    {
      id: 'secondary-half-step-below',
      front: 'Where is the root of a secondary leading-tone chord?',
      back: 'A half step below the root of its target: {n:F#} under {n:G}, {n:G#} under {n:A}.',
      ask: {
        type: 'choice',
        prompt: 'Which diminished 7th chord leads to {c:Dm} in {k:C major}?',
        options: [
          { text: '{c:C#dim7}', correct: true },
          { text: '{c:Cdim7}', why: 'Its root, {n:C}, is a whole step below {n:D}.' },
          { text: '{c:Ddim7}', why: 'That is built on {n:D} itself.' },
        ],
        explain: 'A half step below {n:D} is {n:C#}: {c:C#dim7} is {r:vii°7/ii}.',
      },
    },
  ],
};

const hearingSecondaryDominants: Lesson = {
  id: 'hearing-secondary-dominants',
  title: 'Hearing secondary dominants',
  teaches: 'The clue to a secondary dominant is a major chord where you expect a minor one, pulling hard to the next.',
  minutes: 3,
  skill: `theory:${U}:hearing-secondary-dominants`,
  steps: [
    {
      type: 'card',
      title: 'Minor, then major',
      body: 'First {c:C} {c:Am} {c:Dm} {c:G}, then {c:C} {c:A7} {c:Dm} {c:G7}. In the second, {c:Am} (x02210) becomes {c:A7} (x02020): its {n:C} rises to {n:C#}, and the open {n:G} adds the 7th. Where you expect minor you hear major, pulling hard into {c:Dm}.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['C', 'Am', 'Dm', 'G', 'C', 'A7', 'Dm', 'G7'], beats: 2, tempo: 90 }, label: 'Hear both, one by one' },
    },
    {
      type: 'listen-choice',
      prompt: 'In {k:C major}: was that {r:I}–{r:vi}–{r:ii}–{r:V}, or {r:I}–{r:VI7}–{r:ii}–{r:V7}?',
      sound: { kind: 'progression', chords: ['C', 'A7', 'Dm', 'G7'], beats: 2, tempo: 90 },
      options: [{ text: '{r:I}–{r:vi}–{r:ii}–{r:V}' }, { text: '{r:I}–{r:VI7}–{r:ii}–{r:V7}', correct: true }],
      shuffle: false,
      explain: 'The second chord was {c:A7}, major with {n:C#}, not {c:Am}: {r:VI7}, the {r:V7/ii}. It pulled hard into {c:Dm}.',
    },
    {
      type: 'choice',
      prompt: 'In {c:C} {c:A7} {c:Dm} {c:G7}, which chord does {c:A7} make sound like a destination?',
      options: [
        { text: '{c:Dm}', correct: true },
        { text: '{c:C}', why: '{c:A7} is not the dominant of {c:C}; {c:G7} is.' },
        { text: '{c:G7}', why: '{c:A7} falls a fifth to {n:D}, not to {n:G}.' },
      ],
      explain: '{c:A7} is the dominant of {c:Dm}: {r:VI7} is {r:V7/ii}, so {c:Dm} sounds like a brief home before {c:G7}.',
      fact: 'secondary-vi7-ii',
    },
    {
      type: 'card',
      title: 'The same move in G',
      body: 'In {k:G major}, {c:G} {c:Em} {c:Am} {c:D7} becomes {c:G} {c:E7} {c:Am} {c:D7}. {c:Em} (022000) turns into {c:E7} (020100): the {n:G} on string 3 rises to {n:G#}, and string 4 opens to {n:D}, the 7th.',
      figure: { kind: 'chord', symbol: 'E7', frets: '020100', caption: '{c:E7} (020100): {r:V7/ii} in {k:G major}, leading to {c:Am}.' },
    },
    {
      type: 'play-chord',
      prompt: 'Strum {c:A7} (x02020), the chord that turns {c:Dm} into a destination.',
      chord: 'A7',
      frets: 'x02020',
      explain: '{c:A7} is the {r:VI7} of {k:C major}. Play {c:C} {c:A7} {c:Dm} {c:G7} and listen to the {n:C#} rise into {c:Dm}.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'A7',
        frets: 'x02020',
        accept: 'any-voicing',
        prompt: 'Build {c:A7}, the {r:VI7} of {k:C major}.',
        explain: 'x02020: open {n:A}, {n:E}, open {n:G}, {n:C#} and open {n:E}. The {n:C#} is the outside note.',
      },
    },
    {
      type: 'listen-choice',
      prompt: 'In {k:G major}: which chord was the secondary dominant, the 2nd, the 3rd or the 4th?',
      sound: { kind: 'progression', chords: ['G', 'E7', 'Am', 'D7'], beats: 2, tempo: 90 },
      options: [{ text: 'The 2nd', correct: true }, { text: 'The 3rd' }, { text: 'The 4th' }],
      shuffle: false,
      explain: 'The 2nd was {c:E7}, major where the key has {c:Em}: it pulled into {c:Am}. The 4th, {c:D7}, is the key\'s own {r:V7}.',
    },
    {
      type: 'true-false',
      statement: 'A major chord where the key would have a minor one is a clue to a secondary dominant.',
      answer: true,
      explain: 'The key\'s chords on degrees 2, 3 and 6 are minor. Hearing one of them turn major, with a strong pull onward, usually means a secondary dominant.',
      fact: 'secondary-hearing-clue',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each open shape with its chord.',
      pairs: [
        { left: 'x02020', right: '{c:A7}' },
        { left: 'x21202', right: '{c:B7}' },
        { left: 'xx0212', right: '{c:D7}' },
        { left: '020100', right: '{c:E7}' },
      ],
      explain: 'Four open shapes that turn up as secondary dominants all the time: {c:A7}, {c:B7}, {c:D7} and {c:E7}.',
      fact: 'secondary-open-shapes',
    },
    {
      type: 'choice',
      prompt: 'In {k:F major}: which chord in {c:F} {c:D7} {c:Gm} {c:C7} {c:F} is a secondary dominant?',
      options: [
        { text: '{c:D7}', correct: true },
        { text: '{c:C7}', why: '{c:C7} is the key\'s own {r:V7} in {k:F major}.' },
        { text: '{c:Gm}', why: '{c:Gm} is {r:ii} of {k:F major}, a chord of the key.' },
      ],
      explain: '{k:F major} has {c:Dm} on degree 6. {c:D7} is major there, with {n:F#}: {r:V7/ii}, leading to {c:Gm}.',
    },
  ],
  facts: [
    {
      id: 'secondary-vi7-ii',
      front: 'What does {r:VI7} do in {r:I}–{r:VI7}–{r:ii}–{r:V7}?',
      back: '{r:VI7} is {r:V7/ii}: in {k:C major}, {c:C} {c:A7} {c:Dm} {c:G7}, the {c:A7} makes {c:Dm} sound like a destination.',
    },
    {
      id: 'secondary-hearing-clue',
      front: 'What is the clue, by ear, to a secondary dominant?',
      back: 'A major chord where the key would have a minor one, pulling hard into the next chord.',
    },
    {
      id: 'secondary-open-shapes',
      front: 'Which secondary dominants are easy open shapes on guitar?',
      back: '{c:A7} (x02020), {c:B7} (x21202), {c:D7} (xx0212) and {c:E7} (020100).',
      ask: {
        type: 'match-pairs',
        prompt: 'Match each open shape with its chord.',
        pairs: [
          { left: 'x02020', right: '{c:A7}' },
          { left: 'x21202', right: '{c:B7}' },
          { left: 'xx0212', right: '{c:D7}' },
          { left: '020100', right: '{c:E7}' },
        ],
        explain: '{c:A7}, {c:B7}, {c:D7} and {c:E7}: the open secondary dominants of {k:C major} and {k:G major}.',
      },
    },
  ],
};

/** Unit 32 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'Secondary dominants',
  theme: 'harmony',
  description: 'Dominants of chords other than the tonic, how to spot them, chains of dominants and secondary leading-tone chords.',
  lessons: [whatASecondaryDominantIs, theFiveInC, spottingAndResolving, chainsOfDominants, secondaryLeadingToneChords, hearingSecondaryDominants],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      {
        type: 'choice',
        prompt: 'In {k:C major}, which chord is {r:V7/V}?',
        options: [
          { text: '{c:D7}', correct: true },
          { text: '{c:G7}', why: '{c:G7} is the plain {r:V7}.' },
          { text: '{c:Dm7}', why: '{c:Dm7} is {r:ii7}.' },
        ],
        explain: '{r:V} is {c:G}; its dominant seventh is {c:D7}.',
      },
      {
        type: 'true-false',
        statement: 'A secondary dominant briefly treats its target chord as a temporary tonic.',
        answer: true,
        explain: 'That brief borrowing of home is called tonicization. The key itself does not change.',
      },
      {
        type: 'match-pairs',
        prompt: 'Match each chord with its job in {k:C major}.',
        pairs: [
          { left: '{c:A7}', right: '{r:V7/ii}' },
          { left: '{c:B7}', right: '{r:V7/iii}' },
          { left: '{c:C7}', right: '{r:V7/IV}' },
          { left: '{c:E7}', right: '{r:V7/vi}' },
        ],
        explain: 'Each sits a fifth above its target: {c:Dm}, {c:Em}, {c:F} and {c:Am}.',
      },
      {
        type: 'true-false',
        statement: 'A major key has a secondary dominant for its diminished chord on degree 7.',
        answer: false,
        explain: 'A diminished chord cannot act as a temporary tonic, so a major key has five secondary dominants.',
      },
      {
        type: 'choice',
        prompt: 'Which note from outside {k:C major} does {c:A7} add?',
        options: [
          { text: '{n:C#}', correct: true },
          { text: '{n:G}', why: '{n:G} is in the key: the 7th of {c:A7}.' },
          { text: '{n:E}', why: '{n:E} is in the key: the 5th of {c:A7}.' },
        ],
        explain: '{c:A7} is {n:A} {n:C#} {n:E} {n:G}. Its {n:C#} is the leading tone of {c:Dm}.',
      },
      {
        type: 'choice',
        prompt: 'In {k:G major}, {c:B7} resolves to which chord?',
        options: [
          { text: '{c:Em}', correct: true },
          { text: '{c:Bm}', why: '{c:Bm} is the key\'s own chord on {n:B}.' },
          { text: '{c:C}', why: 'A fifth below {n:B} is {n:E}.' },
        ],
        explain: '{c:B7} is {r:V7/vi}: it falls a fifth to {c:Em}.',
      },
      {
        type: 'type-answer',
        prompt: 'Type the chord that is {r:V7/IV} in {k:D major}.',
        answer: { kind: 'chord', value: 'D7', spelling: 'exact' },
        input: 'keyboard',
        explain: '{r:IV} in {k:D major} is {c:G}; its dominant seventh is {c:D7}.',
      },
      {
        type: 'choice',
        prompt: 'In {k:F major}, which chord is most likely a secondary dominant?',
        options: [
          { text: '{c:D7}', correct: true },
          { text: '{c:Dm}', why: '{c:Dm} is the key\'s own chord on degree 6.' },
          { text: '{c:C7}', why: '{c:C7} is the key\'s own {r:V7}.' },
        ],
        explain: '{k:F major} has {c:Dm} on degree 6, so a {c:D7} there is a stranger: {r:V7/ii}, leading to {c:Gm}.',
      },
      {
        type: 'order',
        prompt: 'Put these dominants in order so that the chain ends on {c:C}.',
        tiles: ['{c:E7}', '{c:A7}', '{c:D7}', '{c:G7}'],
        explain: 'A fifth down each step: {n:E} {n:A} {n:D} {n:G}, then home to {c:C}.',
      },
      {
        type: 'choice',
        prompt: 'In {k:G major}, which chord starts the ragtime progression, {r:III7}?',
        options: [
          { text: '{c:B7}', correct: true },
          { text: '{c:Bm7}', why: '{c:Bm7} is the key\'s own {r:iii7}; ragtime makes it a dominant.' },
          { text: '{c:E7}', why: '{c:E7} is {r:VI7}, the second chord.' },
        ],
        explain: 'Degree 3 of {k:G major} is {n:B}, so {r:III7} is {c:B7}: {c:B7} {c:E7} {c:A7} {c:D7} {c:G}.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Complete {c:G#dim7}.',
        text: '{n:G#}  {n:B}  {n:D}  ___',
        blanks: ['{n:F}'],
        bank: ['{n:E#}', '{n:F#}', '{n:E}'],
        spelling: 'exact',
        explain: 'Minor thirds stacked on {n:G#}: {n:G#} {n:B} {n:D} {n:F}. A 7th above {n:G#} is a kind of F.',
      },
      {
        type: 'choice',
        prompt: 'Which diminished 7th chord leads to {c:Dm} in {k:C major}?',
        options: [
          { text: '{c:C#dim7}', correct: true },
          { text: '{c:Cdim7}', why: 'Its root, {n:C}, is a whole step below {n:D}.' },
          { text: '{c:Ddim7}', why: 'That is built on {n:D} itself.' },
        ],
        explain: 'A half step below {n:D} is {n:C#}: {c:C#dim7} is {r:vii°7/ii}.',
      },
      {
        type: 'true-false',
        statement: '{c:F#dim7} works like {c:D7b9} without its root.',
        answer: true,
        explain: '{c:D7b9} is {n:D} {n:F#} {n:A} {n:C} {n:Eb}; without the {n:D} it is {c:F#dim7}, and both lead to {c:G}.',
      },
      {
        type: 'listen-choice',
        prompt: 'In {k:C major}: was that {r:I}–{r:vi}–{r:ii}–{r:V}, or {r:I}–{r:VI7}–{r:ii}–{r:V7}?',
        sound: { kind: 'progression', chords: ['C', 'Am', 'Dm', 'G'], beats: 2, tempo: 90 },
        options: [{ text: '{r:I}–{r:vi}–{r:ii}–{r:V}', correct: true }, { text: '{r:I}–{r:VI7}–{r:ii}–{r:V7}' }],
        shuffle: false,
        explain: 'The second chord was {c:Am}, the key\'s own minor {r:vi}: no outside note, no extra pull.',
      },
      { generate: 'roman-chord', params: { direction: 'to-chord', numerals: TARGETS, modes: ['major'], maxAccidentals: 3 } },
    ],
  },
};

export default unit;
