/**
 * Theory Path, unit 33: Modal harmony and borrowed chords. Written from the syllabus entries in
 * `src/content/plan/theory-path.json` (unit `modal-harmony-and-borrowing`), one lesson per entry,
 * in order: each lesson opens with the "on the guitar" picture, asks the planned exercises, ends
 * with a drill or a play step, and turns every planned fact into a review card.
 *
 * Every numeral, borrowed chord, characteristic chord, shape and falling voice is cross-checked
 * against `@/core/theory` (`romanToChord`, `chordToRoman`, `modalInterchange`, `scaleNotes`) and
 * `@/core/guitar` in `modal-harmony-and-borrowing.test.ts`.
 *
 * Notes for readers of the code:
 * - The syllabus asks for the fourths shape x555xx "over a ringing open string 4". That shape
 *   frets string 4, so the open D cannot ring under it. The drone lesson keeps the shape and puts
 *   the drone on open string 6 instead (E Phrygian: the notes of C major, the same notes as D
 *   Dorian), where it rings under the shape at frets 5 and 7.
 * - The `roman-chord` drill explains a numeral as "the chord on the Nth note of the scale", which
 *   is wrong for a borrowed numeral in a major key (bVI is not built on the 6th note of C major).
 *   So borrowed numerals are asked only in authored questions here.
 * - A play-chord step listens for one chord, so a progression is shown on a card and the play
 *   step asks for its borrowed chord.
 */
import type { Lesson, Unit } from '@/lessons';

const U = 'modal-harmony-and-borrowing';

const modalProgressions: Lesson = {
  id: 'modal-progressions',
  title: 'Progressions in a mode',
  teaches: 'Modal progressions circle the mode\'s tonic chord and its colour chord, and avoid a strong dominant pull.',
  minutes: 4,
  skill: `theory:${U}:modal-progressions`,
  steps: [
    {
      type: 'card',
      title: 'Home, then colour',
      body: 'In a mode, home is the mode\'s own tonic chord: {c:Dm} in {n:D} Dorian. Beside it goes a {t:characteristic-chord}, the chord that holds the mode\'s {t:characteristic-note}. In {n:D} Dorian that is {c:G}, the major {r:IV}: its {n:B} is the raised 6th.',
      figure: {
        kind: 'fretboard',
        frets: [0, 4],
        root: 'D',
        labels: 'degree',
        dots: [
          { string: 6, fret: 3, note: 'G', degree: '4' },
          { string: 5, fret: 2, note: 'B', degree: '6', role: 'target' },
          { string: 4, fret: 0, note: 'D', degree: '1', role: 'root' },
          { string: 3, fret: 0, note: 'G', degree: '4' },
          { string: 2, fret: 0, note: 'B', degree: '6', role: 'target' },
          { string: 1, fret: 3, note: 'G', degree: '4' },
        ],
        caption: '{c:G} (320003) counted from {n:D}: both {n:B}s are the 6th, Dorian\'s colour.',
      },
    },
    {
      type: 'card',
      title: 'Hear the vamp',
      body: 'Vamp {c:Dm} (xx0231) to {c:G} (320003) and the {n:B} tells your ear: Dorian, not plain minor. Every mode has a chord like this: {r:bVII} in Mixolydian, {r:II} in Lydian, {r:bII} in Phrygian, {r:bVI} in Aeolian.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['Dm', 'G', 'Dm', 'G'], beats: 4, tempo: 90 }, label: 'Hear {c:Dm} to {c:G}' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each mode with its characteristic chord.',
      pairs: [
        { left: 'Dorian', right: '{r:IV}' },
        { left: 'Mixolydian', right: '{r:bVII}' },
        { left: 'Lydian', right: '{r:II}' },
        { left: 'Phrygian', right: '{r:bII}' },
      ],
      explain: 'Each chord holds the mode\'s colour note: the raised 6th in {r:IV}, the {d:b7} in {r:bVII}, the {d:#4} in {r:II}, the {d:b2} in {r:bII}.',
      fact: 'modal-characteristic-chords',
    },
    {
      type: 'choice',
      prompt: 'Which chord gives {n:A} Mixolydian its colour?',
      options: [
        { text: '{c:G}', correct: true },
        { text: '{c:E7}', why: '{c:E7} has {n:G#}, the major 7th. It pulls to {k:A major}, away from Mixolydian.' },
        { text: '{c:D}', why: '{c:D} is {r:IV}, a chord of {k:A major} too: it holds no Mixolydian colour note.' },
        { text: '{c:Bm}', why: '{c:Bm} is {r:ii}, shared with {k:A major}.' },
      ],
      explain: '{c:G} is the {r:bVII} of {n:A}. Its root, {n:G}, is the {d:b7} that turns {n:A} major into {n:A} Mixolydian.',
    },
    {
      type: 'card',
      title: 'Skip the strong pull',
      body: '{n:D} Dorian uses the notes of {k:C major}, so {c:G7} and {c:C} are in it too. But {c:G7} to {c:C} is {r:V7}–{r:I} of {k:C major}: play it and {c:C} sounds like home. So modal music skips that pull and keeps leaning back to its own tonic, {c:Dm}.',
    },
    {
      type: 'true-false',
      statement: 'In {n:D} Dorian, playing {c:G7} to {c:C} helps {n:D} sound like home.',
      answer: false,
      explain: '{c:G7} to {c:C} is the {r:V7}–{r:I} of {k:C major}, the parent key. It pulls the ear to {c:C}, and {n:D} stops sounding like home.',
      fact: 'modal-avoid-v7-i',
    },
    {
      type: 'listen-choice',
      prompt: 'Home is {c:Em}. Which mode does this two-chord vamp suggest?',
      sound: { kind: 'progression', chords: ['Em', 'F', 'Em', 'F'], beats: 4, tempo: 90 },
      options: [{ text: '{n:E} Phrygian', correct: true }, { text: '{n:E} Dorian' }, { text: '{n:E} Aeolian' }],
      shuffle: false,
      explain: 'The second chord was {c:F}: its root sits a half step above {n:E}, the {d:b2}. That dark half step is Phrygian. Dorian would lean on {c:A}, Aeolian on {c:C}.',
    },
    {
      type: 'choice',
      prompt: 'Which two-chord vamp sets up {n:F} Lydian?',
      options: [
        { text: '{c:F} to {c:G}', correct: true },
        { text: '{c:F} to {c:C}', why: '{c:C} is the {r:V} of {k:F major}: plain major, with no raised 4th.' },
        { text: '{c:F} to {c:Bb}', why: '{c:Bb} holds {n:Bb}, the plain 4th of {n:F}: that is Ionian.' },
        { text: '{c:F} to {c:Eb}', why: '{c:Eb} holds {n:Eb}, the {d:b7} of {n:F}: that is Mixolydian.' },
      ],
      explain: '{c:G} is the major {r:II} of {n:F}. Its {n:B} is the {d:#4}, Lydian\'s colour note, and the vamp keeps {c:F} as home.',
      fact: 'modal-two-chord-vamp',
    },
    {
      type: 'type-answer',
      prompt: 'Type the characteristic chord of {n:G} Lydian.',
      answer: { kind: 'chord', value: 'A', spelling: 'exact' },
      input: 'keyboard',
      explain: 'Lydian\'s colour chord is the major {r:II}. In {n:G} Lydian that is {c:A}: its {n:C#} is the {d:#4}.',
    },
    {
      type: 'play-chord',
      prompt: 'Vamp {c:Dm} (xx0231) to {c:G} (320003) for {n:D} Dorian. Strum the {c:G}.',
      chord: 'G',
      frets: '320003',
      explain: '{c:G} is the major {r:IV} of {n:D}. Its two {n:B}s, on strings 5 and 2, are the raised 6th that makes the vamp Dorian.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'G',
        frets: '320003',
        accept: 'any-voicing',
        prompt: 'Build {c:G}, the chord that turns {c:Dm} into {n:D} Dorian.',
        explain: '320003: {n:G}, {n:B}, open {n:D}, {n:G} and {n:B}, then {n:G} on string 1. The {n:B}s are the Dorian colour.',
      },
    },
    { generate: 'scale-ear', params: { scales: ['dorian', 'mixolydian', 'phrygian', 'lydian'] } },
  ],
  facts: [
    {
      id: 'modal-avoid-v7-i',
      front: 'Why do modal progressions avoid a strong {r:V7}–{r:I}?',
      back: 'It pulls the ear to the parent major key. In {n:D} Dorian, {c:G7} to {c:C} makes {c:C} sound like home instead of {c:Dm}.',
    },
    {
      id: 'modal-characteristic-chords',
      front: 'Name the characteristic chord of Dorian, Mixolydian, Lydian, Phrygian and Aeolian.',
      back: 'Dorian {r:IV}, Mixolydian {r:bVII}, Lydian {r:II}, Phrygian {r:bII}, Aeolian {r:bVI}: each holds the mode\'s characteristic note.',
      ask: {
        type: 'match-pairs',
        prompt: 'Match each mode with its characteristic chord.',
        pairs: [
          { left: 'Dorian', right: '{r:IV}' },
          { left: 'Mixolydian', right: '{r:bVII}' },
          { left: 'Phrygian', right: '{r:bII}' },
          { left: 'Aeolian', right: '{r:bVI}' },
        ],
        explain: 'Raised 6th in Dorian\'s {r:IV}, {d:b7} in Mixolydian\'s {r:bVII}, {d:b2} in Phrygian\'s {r:bII}, {d:b6} in Aeolian\'s {r:bVI}.',
      },
    },
    {
      id: 'modal-two-chord-vamp',
      front: 'How can two chords set up a mode clearly?',
      back: 'Vamp the tonic chord and the characteristic chord: {c:Dm} to {c:G} for {n:D} Dorian.',
      ask: {
        type: 'choice',
        prompt: 'Which vamp sets up {n:E} Phrygian?',
        options: [
          { text: '{c:Em} to {c:F}', correct: true },
          { text: '{c:Em} to {c:A}', why: '{c:A} holds {n:C#}, the raised 6th of {n:E}: that is Dorian.' },
          { text: '{c:Em} to {c:C}', why: '{c:C} is the {r:bVI} of {n:E}, Aeolian\'s colour chord. It has no {n:F}, so nothing in it says Phrygian.' },
        ],
        explain: '{c:F} is the {r:bII} of {n:E}. Its {n:F}, a half step above the tonic, is Phrygian\'s colour.',
      },
    },
  ],
};

const dronesAndQuartalChords: Lesson = {
  id: 'drones-and-quartal-chords',
  title: 'Drones and chords in fourths',
  teaches: 'A tonic drone holds a mode in place, and chords stacked in fourths add colour without sounding major or minor.',
  minutes: 3,
  skill: `theory:${U}:drones-and-quartal-chords`,
  steps: [
    {
      type: 'card',
      title: 'A note that stays',
      body: 'A {t:drone} is one note held under the music, usually the tonic. Let open string 6, {n:E}, ring. Above it play the fourths shape x555xx, {n:D} {n:G} {n:C}, then slide it to fret 7, {n:E} {n:A} {n:D}, and back. The chords move, the drone stays, and {n:E} stays home.',
      figure: {
        kind: 'fretboard',
        frets: [0, 8],
        dots: [
          { string: 6, fret: 0, note: 'E2', role: 'root' },
          { string: 5, fret: 5, note: 'D' },
          { string: 4, fret: 5, note: 'G' },
          { string: 3, fret: 5, note: 'C' },
          { string: 5, fret: 7, note: 'E', role: 'ghost' },
          { string: 4, fret: 7, note: 'A', role: 'ghost' },
          { string: 3, fret: 7, note: 'D', role: 'ghost' },
        ],
        caption: 'Open {n:E} under the fourths shape at fret 5, then at fret 7.',
      },
    },
    {
      type: 'card',
      title: 'Hear the drone',
      body: 'Here are the open {n:E} and the fret 5 shape together. Every note fits {n:E} Phrygian, the notes of {k:C major} played from {n:E}; an {n:F} in the tune would make it certain. Other open strings drone too: open string 4 is {n:D}, a home for {n:D} Mixolydian or {n:D} Dorian.',
      figure: { kind: 'audio', sound: { kind: 'notes', notes: ['E2', 'D3', 'G3', 'C4'], together: true }, label: 'Hear the drone and shape' },
    },
    {
      type: 'true-false',
      statement: 'A drone on the tonic keeps that note sounding like home while the chords above it change.',
      answer: true,
      explain: 'The drone never moves, so the ear keeps hearing it as home. That is what holds a mode in place.',
      fact: 'modal-drone-holds-mode',
    },
    {
      type: 'choice',
      prompt: 'Over a drone on open string 6, which modes are easiest to explore?',
      options: [
        { text: '{n:E} modes, such as {n:E} Phrygian', correct: true },
        { text: '{n:A} modes', why: 'Open string 5 is {n:A}: drone that one for {n:A} modes.' },
        { text: '{n:D} modes', why: 'Open string 4 is {n:D}: drone that one for {n:D} modes.' },
        { text: '{n:G} modes', why: 'Open string 3 is {n:G}.' },
      ],
      explain: 'Open string 6 is {n:E}, so it holds any {n:E} mode in place: {n:E} Phrygian, {n:E} Dorian, {n:E} Aeolian.',
      fact: 'modal-open-string-drones',
    },
    {
      type: 'card',
      title: 'Chords in fourths',
      body: 'Most chords stack thirds. A {t:quartal-voicing} stacks fourths: x555xx is {n:D} {n:G} {n:C}, each a perfect fourth above the last. On strings 5, 4 and 3 a fourth is the same fret on the next string, so one finger can hold it.',
      figure: { kind: 'chord', symbol: 'Gsus4/D', frets: 'x555xx', caption: 'x555xx: {n:D} {n:G} {n:C}, stacked in fourths, with no 3rd.' },
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'Gsus4/D',
      frets: 'x555xx',
      accept: 'this-shape',
      prompt: 'Place the fourths shape on strings 5, 4 and 3 at fret 5.',
      explain: 'x555xx: {n:D}, {n:G} and {n:C}. A chart might call it {c:Gsus4/D}, but it has no 3rd above its bass, so it sounds neither major nor minor.',
      fact: 'modal-quartal-voicings',
    },
    {
      type: 'listen-choice',
      prompt: 'These three notes are stacked in fourths. Does the chord sound major, minor, or neither?',
      sound: { kind: 'notes', notes: ['D3', 'G3', 'C4'], together: true },
      options: [{ text: 'Major' }, { text: 'Minor' }, { text: 'Neither: open, with no 3rd', correct: true }],
      shuffle: false,
      explain: 'That was x555xx, {n:D} {n:G} {n:C}. With no major or minor 3rd above the bass it sounds open, so it suits any mode.',
    },
    {
      type: 'fretboard-find',
      prompt: 'Stack a fourth: the dot (R) is {n:E}. Tap the note a perfect fourth above it.',
      find: { interval: 'P4', from: { string: 5, fret: 7 } },
      mode: 'one',
      octave: 'exact',
      frets: [5, 12],
      strings: [5, 4],
      shown: [{ string: 5, fret: 7, label: 'R', role: 'root' }],
      explain: '{n:A}: string 4 at fret 7, the same fret on the next string up (or string 5 at fret 12). That is the second note of the shape at fret 7.',
    },
    {
      type: 'play-phrase',
      prompt: 'Pluck open {n:E} and let it ring. Then play the fret 5 shape note by note, then the fret 7 shape.',
      notes: [
        { string: 6, fret: 0, duration: 'q' },
        { string: 5, fret: 5, duration: 'q' },
        { string: 4, fret: 5, duration: 'q' },
        { string: 3, fret: 5, duration: 'q' },
        { string: 5, fret: 7, duration: 'q' },
        { string: 4, fret: 7, duration: 'q' },
        { string: 3, fret: 7, duration: 'h' },
      ],
      octave: 'exact',
      tempo: 80,
      explain: 'Open {n:E}, then {n:D} {n:G} {n:C} and {n:E} {n:A} {n:D}. Keep the low {n:E} ringing under both shapes: that is the drone.',
      alternative: {
        type: 'order',
        prompt: 'Put the notes of the fourths shape at fret 7 in order, low to high.',
        tiles: ['{n:E}', '{n:A}', '{n:D}'],
        distractors: ['{n:C#}'],
        explain: 'x777xx: {n:E} on string 5, {n:A} on string 4, {n:D} on string 3, each a perfect fourth above the last.',
      },
    },
  ],
  facts: [
    {
      id: 'modal-drone-holds-mode',
      front: 'What does a drone do in modal music?',
      back: 'It holds the tonic under the music, so the mode keeps its home while chords or melody move above it.',
    },
    {
      id: 'modal-open-string-drones',
      front: 'Which open strings make easy drones for {n:E} and {n:D} modes?',
      back: 'Open string 6 for {n:E} modes, such as {n:E} Phrygian or {n:E} Dorian; open string 4 for {n:D} modes, such as {n:D} Mixolydian.',
      ask: {
        type: 'choice',
        prompt: 'Which open string makes a drone for {n:D} Mixolydian?',
        options: [
          { text: 'String 4', correct: true },
          { text: 'String 6', why: 'Open string 6 is {n:E}: a drone for {n:E} modes.' },
          { text: 'String 5', why: 'Open string 5 is {n:A}.' },
        ],
        shuffle: false,
        explain: 'Open string 4 is {n:D}, the tonic of {n:D} Mixolydian.',
      },
    },
    {
      id: 'modal-quartal-voicings',
      front: 'What is a quartal voicing, and how does it sound?',
      back: 'A chord stacked in fourths, such as {n:D} {n:G} {n:C} (x555xx). It sounds open and points to neither a major nor a minor chord.',
      ask: {
        type: 'choice',
        prompt: 'Which shape on strings 5, 4 and 3 stacks perfect fourths?',
        options: [
          { text: 'x555xx', correct: true },
          { text: 'x554xx', why: 'That is {n:D} {n:G} {n:B}: a {c:G} chord over {n:D}, clearly major.' },
          { text: 'x553xx', why: 'That is {n:D} {n:G} {n:Bb}: a {c:Gm} chord over {n:D}, clearly minor.' },
        ],
        explain: 'x555xx is {n:D} {n:G} {n:C}: fourths all the way up, with no 3rd to make it major or minor.',
      },
    },
  ],
};

const modalInterchange: Lesson = {
  id: 'modal-interchange',
  title: 'Borrowing from the parallel minor',
  teaches: 'Modal interchange borrows a chord from a key or mode on the same tonic: a new colour, but still the same key.',
  minutes: 3,
  skill: `theory:${U}:modal-interchange`,
  steps: [
    {
      type: 'card',
      title: 'Same tonic, other colours',
      body: '{k:C major} and {k:C minor} share their tonic, {n:C}: they are {t:parallel-key|parallel keys}. {t:modal-interchange|Modal interchange} borrows a chord from the parallel key and uses it at home. Play {c:C} (x32010), {c:Fm} (133111), {c:C}: the {n:Ab} in {c:Fm} comes from {k:C minor}.',
      figure: { kind: 'chord', symbol: 'Fm', frets: '133111', caption: '{c:Fm} (133111): the {n:Ab} on string 3 comes from {k:C minor}.' },
    },
    {
      type: 'card',
      title: 'Hear the borrowing',
      body: 'Then {c:C} {c:Ab} (466544) {c:Bb} (x13331) {c:C}. Neither {c:Ab} nor {c:Bb} is in {k:C major}: they bring {n:Ab}, {n:Eb} and {n:Bb} from {k:C minor}. Yet {c:C} is still home.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['C', 'Fm', 'C', 'Ab', 'Bb', 'C'], beats: 2, tempo: 80 }, label: 'Hear the borrowed chords' },
    },
    {
      type: 'choice',
      prompt: 'Which chord is borrowed from {k:C minor}?',
      options: [
        { text: '{c:F}', why: '{c:F} is the key\'s own {r:IV}.' },
        { text: '{c:Fm}', correct: true },
        { text: '{c:Dm}', why: '{c:Dm} is the key\'s own {r:ii}.' },
      ],
      explain: '{c:Fm} holds {n:Ab}, the {d:b6} of {k:C minor}. {c:F} and {c:Dm} are chords of {k:C major} itself.',
      fact: 'modal-borrowed-from-c-minor',
    },
    {
      type: 'card',
      title: 'The usual four',
      body: 'From {k:C minor}, {k:C major} most often borrows {c:Fm} ({r:iv}), {c:Ab} ({r:bVI}), {c:Bb} ({r:bVII}) and {c:Eb} ({r:bIII}). Each brings a flat note of the minor scale: {n:Ab}, {n:Bb} or {n:Eb}.',
      figure: { kind: 'chord', symbol: 'Ab', frets: '466544', caption: '{c:Ab} (466544): {r:bVI} in {k:C major}, borrowed from {k:C minor}.' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each borrowed chord with its numeral in {k:C major}.',
      pairs: [
        { left: '{c:Fm}', right: '{r:iv}' },
        { left: '{c:Ab}', right: '{r:bVI}' },
        { left: '{c:Bb}', right: '{r:bVII}' },
        { left: '{c:Eb}', right: '{r:bIII}' },
      ],
      explain: 'Numerals are measured against {k:C major}: {n:Ab}, {n:Bb} and {n:Eb} are its 6th, 7th and 3rd lowered, and {c:Fm} is its {r:IV} made minor.',
    },
    {
      type: 'type-answer',
      prompt: 'In {k:G major}, type the borrowed {r:bVII}.',
      answer: { kind: 'chord', value: 'F', spelling: 'exact' },
      input: 'keyboard',
      explain: 'A whole step below {n:G} is {n:F}, and {r:bVII} is a major chord: {c:F}. It borrows {n:F} from {k:G minor}, in place of the key\'s {n:F#}.',
    },
    {
      type: 'true-false',
      statement: 'A borrowed chord moves the song into a new key.',
      answer: false,
      explain: 'The tonic stays. {c:Fm} or {c:Bb} in {k:C major} adds a new colour, and {c:C} is still home.',
      fact: 'modal-borrowed-same-tonic',
    },
    {
      type: 'listen-choice',
      prompt: 'In {k:C major}: was the chord on {n:F} major or minor?',
      sound: { kind: 'progression', chords: ['C', 'Fm', 'C'], beats: 4, tempo: 72 },
      options: [{ text: 'Major: {c:F}' }, { text: 'Minor: {c:Fm}', correct: true }],
      shuffle: false,
      explain: 'It was {c:Fm}, the minor {r:iv} borrowed from {k:C minor}: its {n:Ab} gives the darker, softer colour.',
    },
    {
      type: 'choice',
      prompt: 'Where does modal interchange borrow its chords from?',
      options: [
        { text: 'A key or mode with the same tonic', correct: true },
        { text: 'The relative minor', why: '{k:A minor} has the very notes of {k:C major}: there is nothing new to borrow.' },
        { text: 'The key a fifth above', why: '{k:G major} has another tonic. Borrowing keeps the same tonic.' },
      ],
      explain: 'Parallel keys and modes share the tonic, {n:C}, but not all their notes. Those other notes are what a borrowed chord brings in.',
      fact: 'modal-interchange-meaning',
    },
    {
      type: 'play-chord',
      prompt: 'Strum {c:Bb} (x13331), the {r:bVII} that {k:C major} borrows.',
      chord: 'Bb',
      frets: 'x13331',
      explain: '{c:Bb} is {n:Bb} {n:D} {n:F}. Its root, {n:Bb}, comes from {k:C minor}: {k:C major} has {n:B}.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'Bb',
        frets: 'x13331',
        accept: 'any-voicing',
        prompt: 'Build {c:Bb}, the {r:bVII} that {k:C major} borrows.',
        explain: 'x13331: {n:Bb} at fret 1 of string 5, then {n:F}, {n:Bb} and {n:D} at fret 3, and {n:F} at fret 1 of string 1.',
      },
    },
  ],
  facts: [
    {
      id: 'modal-interchange-meaning',
      front: 'What is modal interchange?',
      back: 'Borrowing a chord from a key or mode with the same tonic and using it in the home key: {c:Fm} from {k:C minor} in {k:C major}.',
    },
    {
      id: 'modal-borrowed-from-c-minor',
      front: 'Which chords does {k:C major} often borrow from {k:C minor}?',
      back: '{c:Fm} ({r:iv}), {c:Ab} ({r:bVI}), {c:Bb} ({r:bVII}) and {c:Eb} ({r:bIII}).',
      ask: {
        type: 'match-pairs',
        prompt: 'Match each borrowed chord with its numeral in {k:C major}.',
        pairs: [
          { left: '{c:Fm}', right: '{r:iv}' },
          { left: '{c:Ab}', right: '{r:bVI}' },
          { left: '{c:Bb}', right: '{r:bVII}' },
          { left: '{c:Eb}', right: '{r:bIII}' },
        ],
        explain: 'All four come from {k:C minor}: {c:Fm}, {c:Ab}, {c:Bb} and {c:Eb}.',
      },
    },
    {
      id: 'modal-borrowed-same-tonic',
      front: 'Does a borrowed chord change the key?',
      back: 'No. It keeps the same tonic: it changes the colour, not the key.',
      ask: {
        type: 'true-false',
        statement: 'After a borrowed {c:Ab} in {k:C major}, {c:C} is still the home chord.',
        answer: true,
        explain: 'Borrowing keeps the tonic: {c:Ab} adds colour from {k:C minor}, and {c:C} stays home.',
      },
    },
  ],
};

const theMinorFour: Lesson = {
  id: 'the-minor-four',
  title: 'The minor four',
  teaches: 'A minor four chord in a major key sounds bittersweet: its flat 6th falls a half step to the home chord\'s 5th.',
  minutes: 3,
  skill: `theory:${U}:the-minor-four`,
  steps: [
    {
      type: 'card',
      title: 'One note falls',
      body: 'In {k:C major} play {c:F} (133211), {c:Fm} (133111), {c:C} (x32010). From {c:F} to {c:Fm} only string 3 moves, fret 2 to fret 1, and in {c:C} it rings open. That is {n:A}, {n:Ab}, {n:G}: one voice falling a half step at a time into the home chord.',
      figure: {
        kind: 'fretboard',
        frets: [0, 3],
        dots: [
          { string: 3, fret: 2, note: 'A3', role: 'ghost' },
          { string: 3, fret: 1, note: 'Ab3', role: 'target' },
          { string: 3, fret: 0, note: 'G3', role: 'tone' },
        ],
        caption: 'String 3 through {c:F}, {c:Fm} and {c:C}: {n:A}, {n:Ab}, {n:G}.',
      },
    },
    {
      type: 'card',
      title: 'Bittersweet',
      body: 'That falling line is the minor {r:iv}\'s colour: a little sad, then home. {c:Fm} borrows {n:Ab}, the {d:b6}, from {k:C minor}. It often comes just before {r:I}, and {r:IV}–{r:iv}–{r:I} is one of the gentlest endings there is.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['F', 'Fm', 'C'], beats: 4, tempo: 66 }, label: 'Hear {c:F} {c:Fm} {c:C}' },
    },
    {
      type: 'choice',
      prompt: 'The {n:Ab} of {c:Fm} falls a half step. Which note of {c:C} does it reach?',
      options: [
        { text: '{n:G}, the 5th', correct: true },
        { text: '{n:E}, the 3rd', why: 'From {n:Ab} down to {n:E} is four half steps, not one.' },
        { text: '{n:C}, the root', why: 'From {n:Ab} up to {n:C} is a major 3rd.' },
      ],
      explain: '{n:Ab} to {n:G} is a half step down, and {n:G} is the 5th of {c:C}.',
      fact: 'modal-minor-iv-b6',
    },
    {
      type: 'fretboard-find',
      prompt: 'Change {c:F} (133211) into {c:Fm}: tap the one new note.',
      find: { note: 'Ab3' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 4],
      shown: [
        { string: 6, fret: 1 },
        { string: 5, fret: 3 },
        { string: 4, fret: 3 },
        { string: 3, fret: 2 },
        { string: 2, fret: 1 },
        { string: 1, fret: 1 },
      ],
      explain: 'String 3 drops from fret 2 to fret 1: {n:A}, the major 3rd of {c:F}, becomes {n:Ab}, the minor 3rd of {c:Fm}.',
    },
    {
      type: 'listen-choice',
      prompt: 'In {k:C major}: {r:IV}–{r:I}, or {r:IV}–{r:iv}–{r:I}?',
      sound: { kind: 'progression', chords: ['F', 'Fm', 'C'], beats: 4, tempo: 72 },
      options: [{ text: '{r:IV}–{r:I}' }, { text: '{r:IV}–{r:iv}–{r:I}', correct: true }],
      shuffle: false,
      explain: 'Three chords: {c:F}, then {c:Fm} with its falling {n:Ab}, then {c:C}.',
    },
    {
      type: 'card',
      title: 'In any major key',
      body: 'The minor {r:iv} is just the {r:IV} chord made minor. In {k:G major}: {c:C}, {c:Cm} (x35543), {c:G}. In {k:D major}: {c:G}, {c:Gm}, {c:D}. The lowered note is always the key\'s 6th, falling to the 5th.',
      figure: { kind: 'chord', symbol: 'Cm', frets: 'x35543', caption: '{c:Cm} (x35543): the minor {r:iv} of {k:G major}.' },
    },
    {
      type: 'type-answer',
      prompt: 'Type the minor {r:iv} chord of {k:G major}.',
      answer: { kind: 'chord', value: 'Cm', spelling: 'exact' },
      input: 'keyboard',
      explain: 'The {r:IV} of {k:G major} is {c:C}. Made minor it is {c:Cm}, whose {n:Eb} falls a half step to {n:D}, the 5th of {c:G}.',
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the gentle ending {r:IV}–{r:iv}–{r:I} in {k:D major}.',
      text: '{c:G}  ___  {c:D}',
      blanks: ['{c:Gm}'],
      bank: ['{c:G7}', '{c:Em}', '{c:Bm}'],
      explain: '{r:IV} is {c:G}, so {r:iv} is {c:Gm}: its {n:Bb} falls a half step to {n:A}, the 5th of {c:D}.',
      fact: 'modal-iv-iv-i',
    },
    {
      type: 'choice',
      prompt: 'In a major key, where does the minor {r:iv} usually go?',
      options: [
        { text: 'Home, to {r:I}', correct: true },
        { text: 'To {r:vi}', why: 'Its {d:b6} falls into the 5th of the tonic chord, so it heads for {r:I}.' },
        { text: 'To {r:ii}', why: '{r:ii} would move away from home. The minor {r:iv} is a gentle way back.' },
      ],
      shuffle: false,
      explain: 'The minor {r:iv} often comes just before {r:I}: {c:Fm} to {c:C}, its {n:Ab} falling to {n:G}. Bittersweet, then home.',
      fact: 'modal-minor-iv-colour',
    },
    {
      type: 'play-chord',
      prompt: 'Play {c:F}, then {c:Fm} (133111), then {c:C}. Strum the {c:Fm}.',
      chord: 'Fm',
      frets: '133111',
      explain: '{c:Fm} is {n:F} {n:Ab} {n:C}. Keep the barre from {c:F} and lift the finger on string 3: the {n:Ab} at fret 1 is all that changes.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'Fm',
        frets: '133111',
        accept: 'any-voicing',
        prompt: 'Build {c:Fm}, the minor {r:iv} of {k:C major}.',
        explain: '133111: the barre at fret 1 with {n:C} and {n:F} at fret 3. String 3 at fret 1 is the borrowed {n:Ab}.',
      },
    },
  ],
  facts: [
    {
      id: 'modal-minor-iv-colour',
      front: 'What colour does the minor {r:iv} add in a major key?',
      back: 'A bittersweet one, often just before {r:I}: {c:Fm} to {c:C} in {k:C major}.',
    },
    {
      id: 'modal-minor-iv-b6',
      front: 'Which note gives the minor {r:iv} its pull, and where does it go?',
      back: 'Its {d:b6}, {n:Ab} in {k:C major}, falls a half step to {n:G}, the 5th of the tonic chord.',
      ask: {
        type: 'choice',
        prompt: 'In {k:G major}, the minor {r:iv} is {c:Cm}. Where does its {n:Eb} usually go?',
        options: [
          { text: 'Down a half step to {n:D}', correct: true },
          { text: 'Up a half step to {n:E}', why: '{n:E} is not in {c:G}: {n:Eb} falls to {n:D}, the 5th of {c:G}.' },
          { text: 'Down to {n:B}', why: 'From {n:Eb} down to {n:B} is four half steps, not one.' },
        ],
        explain: '{n:Eb} is the {d:b6} of {k:G major}. It falls a half step to {n:D}, the 5th of {c:G}.',
      },
    },
    {
      id: 'modal-iv-iv-i',
      front: 'What is {r:IV}–{r:iv}–{r:I} in {k:C major}?',
      back: '{c:F} {c:Fm} {c:C}: a common, gentle ending.',
      ask: {
        type: 'fill-blanks',
        prompt: 'Complete {r:IV}–{r:iv}–{r:I} in {k:C major}.',
        text: '{c:F}  ___  {c:C}',
        blanks: ['{c:Fm}'],
        bank: ['{c:F7}', '{c:Dm}', '{c:Am}'],
        explain: '{c:F} {c:Fm} {c:C}: the {n:A} of {c:F} falls to {n:Ab}, then to {n:G}.',
      },
    },
  ],
};

const flatSevenAndFlatSix: Lesson = {
  id: 'flat-seven-and-flat-six',
  title: 'Flat seven and flat six',
  teaches: 'Flat-seven and flat-six chords, borrowed from minor, drive many well-known rock and film progressions.',
  minutes: 3,
  skill: `theory:${U}:flat-seven-and-flat-six`,
  steps: [
    {
      type: 'card',
      title: 'Rock\'s favourite borrowing',
      body: 'Play {c:A} (x02220), {c:G} (320003), {c:D} (xx0232): {r:I}–{r:bVII}–{r:IV} in {k:A major}. {c:G} is not in {k:A major}, which has {n:G#}. It is borrowed from {k:A minor} or {n:A} Mixolydian, and rock uses it everywhere.',
      figure: { kind: 'chord', symbol: 'G', frets: '320003', caption: '{c:G} (320003): {r:bVII} in {k:A major}, with {n:G} in place of {n:G#}.' },
    },
    {
      type: 'card',
      title: 'The film-music ending',
      body: 'Now {r:bVI}–{r:bVII}–{r:I}: {c:F} (133211), {c:G}, {c:A}. Two borrowed chords climb a whole step each into a bright major tonic. Hear the rock progression first, then this ending.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['A', 'G', 'D', 'A', 'F', 'G', 'A'], beats: 2, tempo: 90 }, label: 'Hear both progressions' },
    },
    {
      type: 'type-answer',
      prompt: 'In {k:D major}, type the {r:bVI} chord.',
      answer: { kind: 'chord', value: 'Bb', spelling: 'exact' },
      input: 'keyboard',
      explain: 'The 6th note of {k:D major} is {n:B}. Lower it and build a major chord: {c:Bb}, borrowed from {k:D minor}.',
    },
    {
      type: 'listen-choice',
      prompt: 'In {k:C major}: did it end {r:V}–{r:I}, or {r:bVI}–{r:bVII}–{r:I}?',
      sound: { kind: 'progression', chords: ['C', 'Ab', 'Bb', 'C'], beats: 4, tempo: 80 },
      options: [{ text: '{r:V}–{r:I}' }, { text: '{r:bVI}–{r:bVII}–{r:I}', correct: true }],
      shuffle: false,
      explain: '{c:Ab} and {c:Bb} climbed a whole step each into {c:C}: no {c:G} at all, and no leading tone pulling up.',
    },
    {
      type: 'match-pairs',
      prompt: 'In {k:A major}, match each numeral with its chord.',
      pairs: [
        { left: '{r:bVI}', right: '{c:F}' },
        { left: '{r:bVII}', right: '{c:G}' },
        { left: '{r:bIII}', right: '{c:C}' },
        { left: '{r:IV}', right: '{c:D}' },
      ],
      explain: '{r:IV} is the key\'s own {c:D}. The flat numerals lower a note of {k:A major}: {n:F#} to {n:F}, {n:G#} to {n:G}, {n:C#} to {n:C}.',
    },
    {
      type: 'choice',
      prompt: 'Which progression is {r:I}–{r:bVII}–{r:IV} in {k:C major}?',
      options: [
        { text: '{c:C} {c:Bb} {c:F}', correct: true },
        { text: '{c:C} {c:G} {c:F}', why: '{c:G} is {r:V}, not {r:bVII}.' },
        { text: '{c:C} {c:Bdim} {c:F}', why: '{c:Bdim} is the key\'s own {r:vii°}. {r:bVII} is a major chord on {n:Bb}.' },
        { text: '{c:C} {c:Bb} {c:Fm}', why: '{c:Fm} is the minor {r:iv}; the rock progression uses the major {r:IV}, {c:F}.' },
      ],
      explain: '{r:bVII} is the major chord a whole step below the tonic: {c:Bb} in {k:C major}. Then {r:IV}, {c:F}.',
      fact: 'modal-flat-seven-rock',
    },
    {
      type: 'choice',
      prompt: 'Which chord is the {r:bIII} of {k:C major}, borrowed from {k:C minor}?',
      options: [
        { text: '{c:Eb}', correct: true },
        { text: '{c:Em}', why: '{c:Em} is the key\'s own {r:iii}, with no borrowed note.' },
        { text: '{c:E}', why: '{c:E} has {n:G#}, which is in neither key: it is a secondary dominant.' },
        { text: '{c:Ebm}', why: '{r:bIII} is a major chord: {n:Eb} {n:G} {n:Bb}.' },
      ],
      explain: 'The 3rd of {k:C major} is {n:E}. Lowered to {n:Eb}, with a major chord on it: {c:Eb}, from {k:C minor}.',
      fact: 'modal-flat-three',
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete {r:bVI}–{r:bVII}–{r:I} in {k:C major}.',
      text: '___  ___  {c:C}',
      blanks: ['{c:Ab}', '{c:Bb}'],
      bank: ['{c:A}', '{c:B}', '{c:G}'],
      explain: '{r:bVI} is {c:Ab} and {r:bVII} is {c:Bb}: both borrowed from {k:C minor}, both climbing a whole step.',
      fact: 'modal-flat-six-cadence',
    },
    {
      type: 'play-chord',
      prompt: 'Now the ending in {k:A major}: {c:F}, {c:G}, {c:A}. Strum the {c:F} (133211).',
      chord: 'F',
      frets: '133211',
      explain: '{c:F} is the {r:bVI} of {k:A major}: {n:F} {n:A} {n:C}. Its {n:F} and {n:C} come from {k:A minor}.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'F',
        frets: '133211',
        accept: 'any-voicing',
        prompt: 'Build {c:F}, the {r:bVI} of {k:A major}.',
        explain: '133211: the E-shape barre at fret 1. {n:F} and {n:C} are the borrowed notes.',
      },
    },
  ],
  facts: [
    {
      id: 'modal-flat-seven-rock',
      front: 'Where does {r:bVII} come from, and which rock progression uses it?',
      back: 'From the minor key or Mixolydian. {r:I}–{r:bVII}–{r:IV} in {k:C major} is {c:C} {c:Bb} {c:F}.',
      ask: {
        type: 'choice',
        prompt: 'Which progression is {r:I}–{r:bVII}–{r:IV} in {k:G major}?',
        options: [
          { text: '{c:G} {c:F} {c:C}', correct: true },
          { text: '{c:G} {c:D} {c:C}', why: '{c:D} is {r:V}, not {r:bVII}.' },
          { text: '{c:G} {c:F#dim} {c:C}', why: '{c:F#dim} is the key\'s own {r:vii°}.' },
        ],
        explain: '{r:bVII} in {k:G major} is {c:F}, a whole step below the tonic; {r:IV} is {c:C}.',
      },
    },
    {
      id: 'modal-flat-six-cadence',
      front: 'What is the {r:bVI}–{r:bVII}–{r:I} cadence in {k:C major}?',
      back: '{c:Ab} {c:Bb} {c:C}: a common rock and film-music ending.',
    },
    {
      id: 'modal-flat-three',
      front: 'What is {r:bIII} in {k:C major}?',
      back: '{c:Eb}: another chord borrowed from {k:C minor}.',
    },
  ],
};

const neapolitanAndDarkIi: Lesson = {
  id: 'neapolitan-and-dark-ii',
  title: 'The Neapolitan and a half-diminished two',
  teaches: 'Two borrowed chords lead to the dominant: the Neapolitan, major on the flat 2nd, and a half-diminished two.',
  minutes: 3,
  skill: `theory:${U}:neapolitan-and-dark-ii`,
  steps: [
    {
      type: 'card',
      title: 'A major chord on the flat 2nd',
      body: 'In {k:A minor} play {c:Am} (x02210), {c:Bb/D} (xx0331), {c:E7} (020100), {c:Am}. {c:Bb} is the {t:neapolitan-chord|Neapolitan}: a major chord on the {d:b2}, Phrygian\'s colour. It is usually played with its 3rd in the bass, {c:Bb/D}: first inversion.',
      figure: { kind: 'chord', symbol: 'Bb/D', frets: 'xx0331', caption: '{c:Bb/D} (xx0331): the Neapolitan of {k:A minor}, {n:D} in the bass.' },
    },
    {
      type: 'card',
      title: 'Hear where it goes',
      body: 'The bass walks {n:A}, {n:D}, {n:E}, {n:A}. Listen to string 3 in the shapes: the {n:Bb} of the Neapolitan drops to {n:G#} in {c:E7}, then rises to {n:A}. The Neapolitan leads to the dominant, and the dominant leads home.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['Am', 'Bb/D', 'E7', 'Am'], beats: 4, tempo: 72 }, label: 'Hear the Neapolitan' },
    },
    {
      type: 'type-answer',
      prompt: 'Type the Neapolitan chord of {k:E minor}.',
      answer: { kind: 'chord', value: 'F', spelling: 'exact' },
      input: 'keyboard',
      explain: 'A half step above {n:E} is {n:F}, the {d:b2}. The Neapolitan is the major chord there: {c:F}, usually played as {c:F/A}.',
    },
    {
      type: 'choice',
      prompt: 'Which inversion is the Neapolitan usually in?',
      options: [
        { text: 'First inversion: its 3rd in the bass', correct: true },
        { text: 'Root position', why: 'It can be, but the usual form puts the 3rd in the bass: {c:Bb/D} in {k:A minor}.' },
        { text: 'Second inversion: its 5th in the bass', why: 'The usual form has the 3rd in the bass, the note that steps up to the dominant\'s root.' },
      ],
      shuffle: false,
      explain: 'The Neapolitan is usually in first inversion: {c:Db/F} in {k:C minor}, {c:Bb/D} in {k:A minor}. The bass then steps up to the root of {r:V}.',
      fact: 'modal-neapolitan',
    },
    {
      type: 'choice',
      prompt: 'In {k:C minor}, where does the Neapolitan {c:Db/F} usually go next?',
      options: [
        { text: 'To {c:G7}, then {c:Cm}', correct: true },
        { text: 'Straight to {c:Cm}', why: 'It usually goes through the dominant first: {c:G} or {c:G7}.' },
        { text: 'To {c:Eb}', why: '{c:Eb} is the relative major. The Neapolitan leads to the dominant.' },
      ],
      explain: 'The Neapolitan is a predominant: {c:Db/F} moves to {c:G} or {c:G7}, which then resolves to {c:Cm}.',
      fact: 'modal-neapolitan-in-c-minor',
    },
    {
      type: 'card',
      title: 'A darker two-five-one',
      body: '{k:C major}\'s own {r:ii7} is {c:Dm7}: {n:D} {n:F} {n:A} {n:C}. Borrow {r:iiø7} from {k:C minor} instead: {c:Dm7b5} (xx0111), with {n:Ab} in place of {n:A}. {c:Dm7b5} {c:G7} {c:C} is a darker way home.',
      figure: { kind: 'chord', symbol: 'Dm7b5', frets: 'xx0111', caption: '{c:Dm7b5} (xx0111): the {n:Ab} on string 3 comes from {k:C minor}.' },
    },
    {
      type: 'listen-choice',
      prompt: 'In {k:C major}: did this two-five-one start on {c:Dm7} or {c:Dm7b5}?',
      sound: { kind: 'progression', chords: ['Dm7b5', 'G7', 'C'], beats: 4, tempo: 72 },
      options: [{ text: '{c:Dm7}' }, { text: '{c:Dm7b5}', correct: true }],
      shuffle: false,
      explain: 'It was {c:Dm7b5}: the {n:Ab} gives the first chord a darker, more unsettled sound than {c:Dm7}\'s {n:A}.',
    },
    {
      type: 'true-false',
      statement: '{c:Dm7b5} borrows {n:Ab} from {k:C minor}.',
      answer: true,
      explain: '{c:Dm7b5} is {n:D} {n:F} {n:Ab} {n:C}. {n:Ab} is the {d:b6} of {k:C minor}; {k:C major} has {n:A}.',
      fact: 'modal-half-diminished-ii',
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the darker two-five-one in {k:C major}, with the half-diminished {r:ii} from {k:C minor}.',
      text: '___  {c:G7}  {c:C}',
      blanks: ['{c:Dm7b5}'],
      bank: ['{c:Dm7}', '{c:Bdim}', '{c:Fm}'],
      explain: '{r:iiø7} in {k:C major} is {c:Dm7b5}. {c:Dm7} is the plain {r:ii7}, with no borrowed note.',
    },
    {
      type: 'play-chord',
      prompt: 'Strum the Neapolitan of {k:A minor}, {c:Bb/D} (xx0331).',
      chord: 'Bb/D',
      frets: 'xx0331',
      explain: 'Open {n:D} in the bass, then {n:Bb}, {n:D} and {n:F}: a {c:Bb} chord with its 3rd at the bottom.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'Bb/D',
        frets: 'xx0331',
        accept: 'this-shape',
        prompt: 'Build {c:Bb/D}, the Neapolitan of {k:A minor}, with the open {n:D} in the bass.',
        explain: 'xx0331: open {n:D}, {n:Bb} at fret 3 of string 3, {n:D} at fret 3 of string 2, {n:F} at fret 1 of string 1.',
      },
    },
  ],
  facts: [
    {
      id: 'modal-neapolitan',
      front: 'What is the Neapolitan chord?',
      back: 'A major chord on the flat 2nd degree ({c:Db} in {k:C major} or {k:C minor}), usually in first inversion ({c:Db/F}), leading to {r:V}.',
      ask: {
        type: 'type-answer',
        prompt: 'Type the Neapolitan chord of {k:D minor}.',
        answer: { kind: 'chord', value: 'Eb', spelling: 'exact' },
        input: 'keyboard',
        explain: 'A half step above {n:D} is {n:Eb}: the Neapolitan is {c:Eb}, usually as {c:Eb/G}.',
      },
    },
    {
      id: 'modal-neapolitan-in-c-minor',
      front: 'In {k:C minor}, where does the Neapolitan {c:Db/F} usually go?',
      back: 'To {c:G} or {c:G7}, then home to {c:Cm}.',
    },
    {
      id: 'modal-half-diminished-ii',
      front: 'Which borrowed chord makes a darker two-five-one in {k:C major}?',
      back: '{r:iiø7}, {c:Dm7b5}, from {k:C minor}: {c:Dm7b5} {c:G7} {c:C}.',
    },
  ],
};

/** Unit 33 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'Modal harmony, borrowed chords',
  theme: 'harmony',
  description: 'Building chord progressions in a mode, and borrowing chords from the parallel minor and other modes.',
  lessons: [modalProgressions, dronesAndQuartalChords, modalInterchange, theMinorFour, flatSevenAndFlatSix, neapolitanAndDarkIi],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      {
        type: 'match-pairs',
        prompt: 'Match each mode with its characteristic chord.',
        pairs: [
          { left: 'Dorian', right: '{r:IV}' },
          { left: 'Mixolydian', right: '{r:bVII}' },
          { left: 'Lydian', right: '{r:II}' },
          { left: 'Aeolian', right: '{r:bVI}' },
        ],
        explain: 'Each chord holds the mode\'s colour note: raised 6th, {d:b7}, {d:#4} and {d:b6}.',
      },
      {
        type: 'choice',
        prompt: 'Which vamp suggests {n:D} Dorian?',
        options: [
          { text: '{c:Dm} to {c:G}', correct: true },
          { text: '{c:Dm} to {c:Gm}', why: '{c:Gm} holds {n:Bb}, the {d:b6}: that is Aeolian.' },
          { text: '{c:D} to {c:G}', why: 'A major tonic chord points to a major mode.' },
        ],
        explain: '{c:G} is the major {r:IV} of {n:D}; its {n:B} is Dorian\'s raised 6th.',
      },
      {
        type: 'true-false',
        statement: 'A strong {r:V7}–{r:I} would pull a mode toward its parent major key.',
        answer: true,
        explain: 'In {n:D} Dorian, {c:G7} to {c:C} makes {c:C} sound like home. Modal progressions avoid it.',
      },
      {
        type: 'choice',
        prompt: 'Over a drone on open string 4, which modes are easiest to explore?',
        options: [
          { text: '{n:D} modes, such as {n:D} Mixolydian', correct: true },
          { text: '{n:E} modes', why: '{n:E} modes drone on open string 6.' },
          { text: '{n:G} modes', why: 'Open string 3 is {n:G}.' },
        ],
        explain: 'Open string 4 is {n:D}, so it holds any {n:D} mode in place.',
      },
      {
        type: 'choice',
        prompt: 'Which shape on strings 5, 4 and 3 is a quartal voicing?',
        options: [
          { text: 'x555xx', correct: true },
          { text: 'x554xx', why: '{n:D} {n:G} {n:B}: a {c:G} chord over {n:D}, major.' },
          { text: 'x553xx', why: '{n:D} {n:G} {n:Bb}: a {c:Gm} chord over {n:D}, minor.' },
        ],
        explain: 'x555xx is {n:D} {n:G} {n:C}: perfect fourths stacked, neither major nor minor.',
      },
      {
        type: 'choice',
        prompt: 'Which chord is borrowed from {k:C minor}?',
        options: [
          { text: '{c:Ab}', correct: true },
          { text: '{c:Am}', why: '{c:Am} is the key\'s own {r:vi}.' },
          { text: '{c:A}', why: '{c:A} has {n:C#}, which is not in {k:C minor}: it is a secondary dominant.' },
        ],
        explain: '{c:Ab} is {r:bVI}: {n:Ab} {n:C} {n:Eb}, all from {k:C minor}.',
      },
      {
        type: 'type-answer',
        prompt: 'In {k:G major}, type the borrowed {r:bVI}.',
        answer: { kind: 'chord', value: 'Eb', spelling: 'exact' },
        input: 'keyboard',
        explain: 'The 6th of {k:G major} is {n:E}. Lowered, with a major chord on it: {c:Eb}, from {k:G minor}.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Complete {r:IV}–{r:iv}–{r:I} in {k:C major}.',
        text: '{c:F}  ___  {c:C}',
        blanks: ['{c:Fm}'],
        bank: ['{c:F7}', '{c:Dm}', '{c:Am}'],
        explain: '{c:F} {c:Fm} {c:C}: the {n:A} of {c:F} falls to {n:Ab}, then to {n:G}.',
      },
      {
        type: 'choice',
        prompt: 'Where does the {n:Ab} of {c:Fm} go when {c:Fm} moves to {c:C}?',
        options: [
          { text: 'Down a half step to {n:G}', correct: true },
          { text: 'Up a half step to {n:A}', why: '{n:A} is not in {c:C}.' },
          { text: 'Down to {n:E}', why: 'From {n:Ab} down to {n:E} is four half steps, not one.' },
        ],
        explain: '{n:Ab}, the {d:b6}, falls a half step to {n:G}, the 5th of {c:C}.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Complete {r:I}–{r:bVII}–{r:IV} in {k:D major}.',
        text: '{c:D}  ___  {c:G}',
        blanks: ['{c:C}'],
        bank: ['{c:C#m}', '{c:A}', '{c:Cm}'],
        explain: '{r:bVII} is the major chord a whole step below {n:D}: {c:C}. Then {r:IV}, {c:G}.',
      },
      {
        type: 'choice',
        prompt: 'Which chord is the {r:bIII} of {k:G major}, borrowed from {k:G minor}?',
        options: [
          { text: '{c:Bb}', correct: true },
          { text: '{c:Bm}', why: '{c:Bm} is the key\'s own {r:iii}, with no borrowed note.' },
          { text: '{c:B}', why: '{c:B} has {n:D#}, which is in neither key: it is a secondary dominant.' },
          { text: '{c:Bbm}', why: '{r:bIII} is a major chord: {n:Bb} {n:D} {n:F}.' },
        ],
        explain: 'The 3rd of {k:G major} is {n:B}. Lowered to {n:Bb}, with a major chord on it: {c:Bb}, from {k:G minor}.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Complete {r:bVI}–{r:bVII}–{r:I} in {k:A major}.',
        text: '___  ___  {c:A}',
        blanks: ['{c:F}', '{c:G}'],
        bank: ['{c:F#m}', '{c:E}', '{c:D}'],
        explain: '{c:F} and {c:G}, borrowed from {k:A minor}, climb a whole step each into {c:A}.',
      },
      {
        type: 'type-answer',
        prompt: 'Type the Neapolitan chord of {k:D minor}.',
        answer: { kind: 'chord', value: 'Eb', spelling: 'exact' },
        input: 'keyboard',
        explain: 'A half step above {n:D} is {n:Eb}: the Neapolitan is {c:Eb}, usually as {c:Eb/G}.',
      },
      {
        type: 'choice',
        prompt: 'The Neapolitan of {k:C minor} is {c:Db}. How is it usually played?',
        options: [
          { text: 'As {c:Db/F}, leading to {c:G7}', correct: true },
          { text: 'As {c:Db}, leading straight to {c:Cm}', why: 'It usually has its 3rd in the bass and goes to the dominant first.' },
          { text: 'As {c:Db/Ab}, leading to {c:Eb}', why: 'The usual form is first inversion, heading for {r:V}.' },
        ],
        explain: 'First inversion, {c:Db/F}, then the dominant {c:G7}, then {c:Cm}.',
      },
      {
        type: 'true-false',
        statement: '{c:Dm7b5} {c:G7} {c:C} uses a {r:ii} chord borrowed from {k:C minor}.',
        answer: true,
        explain: '{c:Dm7b5} is {r:iiø7}: its {n:Ab} comes from {k:C minor}, which darkens the two-five-one.',
      },
      {
        type: 'listen-choice',
        prompt: 'In {k:C major}: {r:IV}–{r:I}, or {r:IV}–{r:iv}–{r:I}?',
        sound: { kind: 'progression', chords: ['F', 'C'], beats: 4, tempo: 72 },
        options: [{ text: '{r:IV}–{r:I}', correct: true }, { text: '{r:IV}–{r:iv}–{r:I}' }],
        shuffle: false,
        explain: 'Only two chords: {c:F}, then {c:C}. No {c:Fm} between them.',
      },
    ],
  },
};

export default unit;
