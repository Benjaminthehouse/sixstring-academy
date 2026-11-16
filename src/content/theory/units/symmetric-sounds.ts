/**
 * Theory Path, unit 36: Diminished, augmented and whole-tone sounds. Written from the syllabus
 * entries in `src/content/plan/theory-path.json` (unit `symmetric-sounds`), one lesson per entry, in
 * order: each lesson opens with the "on the guitar" picture, asks the planned exercises, ends with
 * the planned drills, and turns every planned fact into a review card.
 *
 * Every chord spelling, shape, scale and fret quoted here is cross-checked against `@/core/theory`
 * and `@/core/guitar` in `symmetric-sounds.test.ts`.
 *
 * A lesson `Sound` plays one chord shape at a time, so a sequence of chosen shapes (the dim7 moved
 * up the neck, the rising line from C to F, V+ to I) is played the way a guitarist would pick it
 * slowly: each shape as an arpeggio, low string to high. The `scale-notes` drill takes scales of
 * five to seven notes, so the eight-note diminished scales are drilled by authored questions and
 * the drill reviews the seven-note dominant scales the lesson compares them with.
 */
import { scaleMidi } from '@/core/theory';
import { openStringMidi } from '@/core/guitar';
import type { Lesson, TabNote, Unit } from '@/lessons';

const U = 'symmetric-sounds';

type Spot = { string: number; fret: number };

/** The fretted strings of a shape (`x2313x`, or `x-11-12-10-12-x` above fret 9), low string first. */
function spots(shape: string): Spot[] {
  const parts = shape.includes('-') ? shape.split('-') : shape.split('');
  return parts.flatMap((p, i) => (p === 'x' ? [] : [{ string: 6 - i, fret: Number(p) }]));
}

/** A chord shape picked as an arpeggio, low string to high. */
function arpeggio(shape: string, duration: TabNote['duration'] = 'e'): TabNote[] {
  return spots(shape).map((s) => ({ ...s, duration }));
}

/** Where a melody note goes: the thinnest string that reaches it, so the frets stay low. */
function place(midi: number): Spot {
  for (let string = 1; string <= 6; string++) {
    const open = openStringMidi(string);
    if (midi >= open) return { string, fret: midi - open };
  }
  throw new RangeError(`MIDI ${midi} is below the low E string`);
}

/** One octave of a scale, up from `tonic` (MIDI), as eighth notes. */
function line(tonic: number, scale: string): TabNote[] {
  return scaleMidi(tonic, scale).map((m) => ({ ...place(m), duration: 'e' as const }));
}

/** The four places of the Bdim7 shape: B on string 5 at frets 2, 5, 8 and 11. */
const BDIM7_SHAPES = ['x2313x', 'x5646x', 'x8979x', 'x-11-12-10-12-x'];
/** The rising line from C to F: only string 3 moves, G G# A Bb. */
const RISING_LINE = ['x32010', 'x32110', 'x32210', 'x32310', 'xx3211'];
const C3 = 48;

const dim7Symmetry: Lesson = {
  id: 'dim7-symmetry',
  title: 'The symmetry of the diminished seventh',
  teaches: 'A diminished 7th is all minor thirds, so it repeats every three frets, and only three different ones exist.',
  minutes: 3,
  skill: `theory:${U}:dim7-symmetry`,
  steps: [
    {
      type: 'card',
      title: 'Four minor thirds',
      body: 'A {t:diminished-seventh|diminished seventh} chord stacks {t:minor-third|minor thirds}: {c:Bdim7} is {n:B} {n:D} {n:F} {n:Ab}. Three more half steps above {n:Ab} bring you back to {n:B}. Four equal steps of three half steps fill the octave, so the chord looks the same from every note.',
      figure: {
        kind: 'fretboard',
        frets: [1, 12],
        dots: [
          { string: 5, fret: 2, note: 'B', role: 'root' },
          { string: 4, fret: 3, note: 'F' },
          { string: 3, fret: 1, note: 'Ab' },
          { string: 2, fret: 3, note: 'D' },
          { string: 5, fret: 5, note: 'D' },
          { string: 4, fret: 6, note: 'Ab' },
          { string: 3, fret: 4, note: 'B', role: 'root' },
          { string: 2, fret: 6, note: 'F' },
          { string: 5, fret: 8, note: 'F' },
          { string: 4, fret: 9, note: 'B', role: 'root' },
          { string: 3, fret: 7, note: 'D' },
          { string: 2, fret: 9, note: 'Ab' },
          { string: 5, fret: 11, note: 'Ab' },
          { string: 4, fret: 12, note: 'D' },
          { string: 3, fret: 10, note: 'F' },
          { string: 2, fret: 12, note: 'B', role: 'root' },
        ],
        caption: 'The {c:Bdim7} shape x2313x at frets 2, 5, 8 and 11: the same four notes.',
      },
    },
    {
      type: 'card',
      title: 'Slide it up three frets',
      body: 'Move the shape up three frets and every note rises a minor third, onto the next note of the chord. {n:B} becomes {n:D}, {n:D} becomes {n:F}, and so on: the same four notes in a new order, a new {t:inversion}.',
      figure: {
        kind: 'audio',
        sound: { kind: 'tab', notes: BDIM7_SHAPES.flatMap((s) => arpeggio(s)), tempo: 100 },
        label: 'Hear the four places',
      },
      tip: 'Use the same four fingers each time and just slide: one shape gives you this chord all over the neck.',
    },
    {
      type: 'choice',
      prompt: 'How far is each note of {c:Bdim7} from the next one up?',
      options: [
        { text: 'A minor third: three half steps', correct: true },
        { text: 'A major third: four half steps', why: 'Major thirds stacked up make an augmented triad, not a diminished seventh.' },
        { text: 'A whole step: two half steps', why: 'Whole steps would make a whole-tone scale. {n:B} to {n:D} is three half steps.' },
      ],
      explain: '{n:B} to {n:D}, {n:D} to {n:F}, {n:F} to {n:Ab}: minor thirds, three frets each on one string. Three more half steps take {n:Ab} back to {n:B}.',
      fact: 'symmetric-dim7-minor-thirds',
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'Ddim7',
      frets: 'x5646x',
      accept: 'this-shape',
      prompt: 'Slide the {c:Bdim7} shape x2313x up three frets, to fret 5 on string 5. Build it.',
      explain: 'x5646x: {n:D} {n:Ab} {n:B} {n:F}. The same four notes as {c:Bdim7}, now with {n:D} lowest, so you can call it {c:Ddim7}.',
      fact: 'symmetric-dim7-three-frets',
    },
    {
      type: 'choice',
      prompt: 'You slide any dim7 shape up three frets. What do you get?',
      options: [
        { text: 'The same four notes, in a new order', correct: true },
        { text: 'Four new notes: a different dim7', why: 'Every note moves up a minor third, onto another note of the same chord.' },
        { text: 'A dominant seventh chord', why: 'The shape keeps its minor thirds, so it stays a diminished seventh.' },
      ],
      explain: 'Each note rises a minor third and lands on the next note of the chord: the notes stay, only the lowest one changes.',
      fact: 'symmetric-dim7-three-frets',
    },
    {
      type: 'card',
      title: 'Only three of them',
      body: 'Twelve roots, but only three sets of notes: {c:Cdim7}, {c:C#dim7} and {c:Ddim7}. {c:Ebdim7} has the notes of {c:Cdim7} again, {c:Edim7} those of {c:C#dim7}, {c:Fdim7} those of {c:Ddim7}, and so on round the octave.',
    },
    {
      type: 'choice',
      prompt: 'Which dim7 has the same notes as {c:Bdim7}?',
      options: [
        { text: '{c:Ddim7}', correct: true },
        { text: '{c:Edim7}', why: '{c:Edim7} is {n:E} {n:G} {n:Bb} {n:Db}: the notes of {c:C#dim7}, not of {c:Bdim7}.' },
        { text: '{c:Cdim7}', why: '{c:Cdim7} is {n:C} {n:Eb} {n:Gb} {n:Bbb}: none of these is in {c:Bdim7}.' },
      ],
      explain: '{c:Ddim7} is {n:D} {n:F} {n:Ab} {n:Cb}, and {n:Cb} sounds as {n:B}: the same four pitches as {c:Bdim7}, a minor third higher.',
      fact: 'symmetric-three-dim7',
    },
    {
      type: 'true-false',
      statement: 'There are twelve different diminished seventh chords.',
      answer: false,
      explain: 'There are only three sets of notes. A dim7 on any of its four notes has the same pitches, so the twelve roots fall into three groups of four.',
      fact: 'symmetric-three-dim7',
    },
    { generate: 'chord-tones', params: { types: ['dim7'], roots: ['B', 'C', 'C#', 'D', 'F#', 'G#'], ask: 'notes' } },
    { generate: 'chord-tones', params: { types: ['dim7'], roots: ['B', 'C', 'C#', 'D', 'F#', 'G#'], ask: 'missing' } },
  ],
  facts: [
    {
      id: 'symmetric-dim7-minor-thirds',
      front: 'What is a diminished seventh chord built from?',
      back: 'Minor thirds only: four of them fill the octave, so it divides the octave into four equal parts. {c:Bdim7} is {n:B} {n:D} {n:F} {n:Ab}.',
    },
    {
      id: 'symmetric-dim7-three-frets',
      front: 'What happens when you move a dim7 shape up three frets?',
      back: 'You get the same four notes in a new inversion: {c:Bdim7} x2313x and x5646x use the same four notes.',
      ask: {
        type: 'true-false',
        statement: 'Moving a dim7 shape up three frets gives the same four notes in a new order.',
        answer: true,
        explain: 'Every note rises a minor third, onto the next note of the chord.',
      },
    },
    {
      id: 'symmetric-three-dim7',
      front: 'How many different diminished seventh chords are there?',
      back: 'Only three: {c:Cdim7}, {c:C#dim7} and {c:Ddim7}. Every other dim7 has the same notes as one of these.',
      ask: {
        type: 'choice',
        prompt: 'How many different sets of notes do the twelve dim7 chords use?',
        options: [{ text: '3', correct: true }, { text: '4', why: 'Four is the number of notes in each one.' }, { text: '6' }, { text: '12', why: 'Four roots share each set of notes.' }],
        shuffle: false,
        explain: 'Only three: {c:Cdim7}, {c:C#dim7} and {c:Ddim7}. Every other dim7 repeats one of them.',
      },
    },
  ],
};

const oneDim7FourDominants: Lesson = {
  id: 'one-dim7-four-dominants',
  title: 'One diminished chord, four dominants',
  teaches: 'Any note of a diminished 7th can act as its root, so one shape serves four dominants and links chords too.',
  minutes: 4,
  skill: `theory:${U}:one-dim7-four-dominants`,
  steps: [
    {
      type: 'card',
      title: 'A chord that passes',
      body: 'Play {c:C} (x32010), {c:C#dim7} (x4535x), then {c:Dm7} (xx0211). The bass climbs {n:C}, {n:C#}, {n:D}. The {c:C#dim7} is a {t:passing-chord|passing chord}: it links two chords a whole step apart, one half step at a time.',
      figure: {
        kind: 'fretboard',
        frets: [0, 5],
        dots: [
          { string: 5, fret: 3, note: 'C', label: 'C' },
          { string: 5, fret: 4, note: 'C#', role: 'target' },
          { string: 4, fret: 0, note: 'D' },
        ],
        caption: 'The bass of {c:C}, {c:C#dim7} and {c:Dm7}: {n:C}, {n:C#}, {n:D}.',
      },
    },
    {
      type: 'card',
      title: 'Hear it pass',
      body: 'Listen for the bass stepping up while the chord in the middle adds a moment of tension. The dim7 is a quick step on the way, usually one or two beats long.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['C', 'C#dim7', 'Dm7'], tempo: 70 }, label: 'Hear {c:C} {c:C#dim7} {c:Dm7}' },
    },
    {
      type: 'listen-choice',
      prompt: 'Three chords. Is the middle one a passing diminished chord?',
      sound: { kind: 'progression', chords: ['C', 'C#dim7', 'Dm7'], tempo: 70 },
      options: [{ text: 'Yes: it passes between the two', correct: true }, { text: 'No: it is a plain minor chord' }],
      shuffle: false,
      explain: 'That was {c:C}, {c:C#dim7}, {c:Dm7}: the tense middle chord lifts the bass from {n:C} through {n:C#} to {n:D}.',
    },
    {
      type: 'type-answer',
      prompt: 'Which dim7 passes between {c:G} and {c:Am}? Type its name.',
      answer: { kind: 'chord', value: 'G#dim7', spelling: 'exact' },
      input: 'keyboard',
      hint: 'Its root sits a half step below {n:A} and rises into it.',
      explain: '{c:G#dim7}: the bass climbs {n:G}, {n:G#}, {n:A}. Spell it from {n:G#}, the note that rises into {n:A}, not from {n:Ab}.',
      fact: 'symmetric-passing-dim7',
    },
    {
      type: 'card',
      title: 'One chord, four dominants',
      body: 'You know {c:Bdim7} is {c:G7b9} without its {n:G}. Any of its four notes can act as the root, so the same shape is also {c:Bb7b9}, {c:Db7b9} and {c:E7b9} without their roots. Each of those roots sits a half step below one of its notes.',
      figure: { kind: 'chord', symbol: 'Bdim7', frets: 'x2313x', caption: '{c:Bdim7}: a rootless {c:G7b9}, {c:Bb7b9}, {c:Db7b9} or {c:E7b9}.' },
    },
    {
      type: 'choice',
      prompt: 'Which dominants can {c:Bdim7} stand in for? Pick every one.',
      multiple: true,
      options: [
        { text: '{c:G7b9}', correct: true },
        { text: '{c:Bb7b9}', correct: true },
        { text: '{c:Db7b9}', correct: true },
        { text: '{c:E7b9}', correct: true },
        { text: '{c:C7b9}', why: '{c:C7b9} without its root is {n:E} {n:G} {n:Bb} {n:Db}: {c:Edim7}, not {c:Bdim7}.' },
        { text: '{c:A7b9}', why: '{c:A7b9} without its root is {n:C#} {n:E} {n:G} {n:Bb}: {c:C#dim7}, not {c:Bdim7}.' },
      ],
      explain: 'The roots {n:G}, {n:Bb}, {n:Db} and {n:E} are each a half step below a note of {c:Bdim7} ({n:Ab}, {n:B}, {n:D}, {n:F}), and they are a minor third apart too.',
      fact: 'symmetric-four-dominants',
    },
    {
      type: 'true-false',
      statement: '{c:E7b9} without its root has the same notes as {c:Bdim7}.',
      answer: true,
      explain: '{c:E7b9} is {n:E} {n:G#} {n:B} {n:D} {n:F}. Without {n:E}, the notes {n:G#} {n:B} {n:D} {n:F} make a dim7 with the pitches of {c:Bdim7}.',
      fact: 'symmetric-four-dominants',
    },
    {
      type: 'card',
      title: 'Same root, new colour',
      body: 'A dim7 can also decorate a chord on its own root: {c:C}, {c:Cdim7}, {c:C}. The bass {n:C} stays while the other notes move away and come back. This is the {t:common-tone-diminished|common-tone diminished} chord.',
      figure: { kind: 'chord', symbol: 'Cdim7', frets: 'x3424x', caption: '{c:Cdim7} keeps {n:C} on string 5, fret 3, like the {c:C} chord.' },
    },
    {
      type: 'choice',
      prompt: 'In {c:C}, {c:Cdim7}, {c:C}, what does the {c:Cdim7} do?',
      options: [
        { text: 'It decorates {c:C}, keeping the same root', correct: true },
        { text: 'It passes between chords a step apart', why: 'Both chords around it are {c:C}: nothing is passed between.' },
        { text: 'It replaces the {r:V7} chord', why: 'A rootless dominant would lead to another chord. Here the music comes straight back to {c:C}.' },
      ],
      explain: 'It is a common-tone diminished chord: it shares {n:C} with the chord it decorates and returns to it.',
      fact: 'symmetric-common-tone-dim7',
    },
    {
      type: 'choice',
      prompt: 'Which chord passes between {c:F} and {c:Gm7}?',
      options: [
        { text: '{c:F#dim7}', correct: true },
        { text: '{c:Fdim7}', why: '{c:Fdim7} keeps the root {n:F}: it would decorate {c:F}, not pass on to {n:G}.' },
        { text: '{c:Gdim7}', why: '{c:Gdim7} has the root of {c:Gm7}. A passing chord sits a half step below.' },
      ],
      explain: 'The bass climbs {n:F}, {n:F#}, {n:G}: {c:F#dim7} is the half step between, just like {c:C#dim7} between {c:C} and {c:Dm7}.',
      fact: 'symmetric-passing-dim7',
    },
    {
      type: 'listen-choice',
      prompt: 'And these three: is the middle one a passing diminished chord?',
      sound: { kind: 'progression', chords: ['C', 'Am', 'Dm7'], tempo: 70 },
      options: [{ text: 'Yes: it passes between the two' }, { text: 'No: it is a plain minor chord', correct: true }],
      shuffle: false,
      explain: 'That was {c:C}, {c:Am}, {c:Dm7}. The middle chord is a calm minor chord, and the bass falls to {n:A} instead of climbing by half steps.',
    },
  ],
  facts: [
    {
      id: 'symmetric-four-dominants',
      front: 'As a rootless dominant with a flat 9, which four dominants does {c:Bdim7} serve?',
      back: '{c:G7b9}, {c:Bb7b9}, {c:Db7b9} and {c:E7b9}: the notes of {c:Bdim7} are each of them without its root.',
    },
    {
      id: 'symmetric-passing-dim7',
      front: 'What does a passing diminished chord do?',
      back: 'It links two chords a whole step apart, with the bass rising by half steps: {c:C}, {c:C#dim7}, {c:Dm7}.',
      ask: {
        type: 'choice',
        prompt: 'Which chord passes between {c:C} and {c:Dm7}?',
        options: [
          { text: '{c:C#dim7}', correct: true },
          { text: '{c:Cdim7}', why: '{c:Cdim7} keeps the root {n:C}: it decorates {c:C} instead of passing on.' },
          { text: '{c:Ddim7}', why: '{c:Ddim7} has the root of {c:Dm7}. A passing chord sits a half step below it.' },
        ],
        explain: 'The bass climbs {n:C}, {n:C#}, {n:D}.',
      },
    },
    {
      id: 'symmetric-common-tone-dim7',
      front: 'What is a common-tone diminished chord?',
      back: 'A dim7 on the same root as the chord it decorates: {c:C}, {c:Cdim7}, {c:C}.',
    },
  ],
};

const diminishedScales: Lesson = {
  id: 'diminished-scales',
  title: 'The diminished scales',
  teaches: 'The diminished scales alternate half and whole steps: half-whole fits flat-9 dominants, whole-half fits dim7s.',
  minutes: 4,
  skill: `theory:${U}:diminished-scales`,
  steps: [
    {
      type: 'card',
      title: 'Half, whole, half, whole',
      body: 'The {t:diminished-scale|half-whole diminished scale} alternates half and whole steps from the root: {n:C} {n:Db} {n:Eb} {n:E} {n:F#} {n:G} {n:A} {n:Bb}. Eight notes, holding all of {c:C7} plus the {d:b9}, {d:#9}, {d:#11} and {d:13}: every colour of {c:C7b9}.',
      figure: {
        kind: 'fretboard',
        frets: [1, 5],
        strings: [5, 4, 3, 2],
        derive: { scale: 'diminished-half-whole', tonic: 'C' },
        dots: [
          { string: 5, fret: 4, note: 'Db', role: 'ghost' },
          { string: 2, fret: 2, note: 'Db', role: 'ghost' },
          { string: 4, fret: 1, note: 'Eb', role: 'ghost' },
          { string: 2, fret: 4, note: 'Eb', role: 'ghost' },
          { string: 4, fret: 4, note: 'F#', role: 'ghost' },
          { string: 3, fret: 2, note: 'A', role: 'ghost' },
        ],
        caption: '{n:C} half-whole on strings 5 to 2. Bright dots: {c:C7}. Pale dots: its tensions.',
      },
    },
    {
      type: 'card',
      title: 'Hear it after the chord',
      body: 'First the {c:C7b9} chord (x3232x), then the scale up from {n:C}. Every note fits: the chord tones, and tensions that pull a half step toward the next chord.',
      figure: {
        kind: 'audio',
        sound: { kind: 'tab', notes: [...arpeggio('x3232x', 'q'), ...line(C3, 'diminished-half-whole')], tempo: 100 },
        label: 'Hear {c:C7b9}, then the scale',
      },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete {n:C} half-whole diminished.',
      text: '{n:C} {n:Db} {n:Eb} {n:E} {n:F#} ___ {n:A} {n:Bb}',
      blanks: ['{n:G}'],
      bank: ['{n:Ab}', '{n:F}'],
      explain: 'After {n:F#} comes a half step, to {n:G}; then a whole step to {n:A}. Half, whole, all the way up.',
      fact: 'symmetric-half-whole-notes',
    },
    {
      type: 'choice',
      prompt: 'Which scale fits {c:C7b9}?',
      options: [
        { text: '{n:C} half-whole diminished', correct: true },
        { text: '{n:C} whole-half diminished', why: 'Whole-half from {n:C} has {n:D}, not {n:Db}, and no {n:E} or {n:Bb}: it misses the 3rd and 7th of {c:C7}.' },
        { text: '{n:C} Mixolydian', why: 'Mixolydian has {n:D}, the natural 9th. It fits {c:C7}, not the flat 9 of {c:C7b9}.' },
      ],
      explain: '{n:C} half-whole has {n:C} {n:E} {n:G} {n:Bb} and the flat 9, {n:Db}: all of {c:C7b9}.',
      fact: 'symmetric-half-whole-7b9',
    },
    {
      type: 'listen-choice',
      prompt: 'This scale starts on {n:G}. Is it Mixolydian or half-whole diminished?',
      sound: { kind: 'scale', tonic: 'G2', scale: 'diminished-half-whole', direction: 'up' },
      options: [{ text: 'Half-whole diminished', correct: true }, { text: 'Mixolydian' }],
      shuffle: false,
      explain: 'It began with a half step, {n:G} to {n:Ab}, and had eight notes: half-whole diminished, the sound of {c:G7b9}. Mixolydian starts with a whole step.',
    },
    {
      type: 'card',
      title: 'The other way round',
      body: 'Start with a whole step and you get the **whole-half** diminished scale: {n:C} {n:D} {n:Eb} {n:F} {n:Gb} {n:Ab} {n:A} {n:B}. It holds all of {c:Cdim7} ({n:C} {n:Eb} {n:Gb} and {n:Bbb}, written {n:A} here), plus a note a whole step above each one. It fits diminished seventh chords.',
      figure: {
        kind: 'keyboard',
        keys: [
          { note: 'C4', role: 'root' },
          'D4',
          { note: 'Eb4', role: 'third' },
          'F4',
          { note: 'Gb4', role: 'fifth' },
          'Ab4',
          { note: 'A4', role: 'seventh' },
          'B4',
        ],
        from: 'C4',
        to: 'C5',
        caption: '{n:C} whole-half: {c:Cdim7} ({n:C} {n:Eb} {n:Gb} {n:A}), and a note a step above each.',
      },
    },
    {
      type: 'choice',
      prompt: 'Which diminished scale fits {c:Cdim7}?',
      options: [
        { text: 'Whole-half, starting {n:C} {n:D} {n:Eb}', correct: true },
        { text: 'Half-whole, starting {n:C} {n:Db} {n:Eb}', why: 'It holds {c:Cdim7} too, but puts a note a half step above each chord tone, such as {n:Db} over {n:C}. Those clash: it is the scale for {c:C7b9}.' },
      ],
      shuffle: false,
      explain: 'Whole-half from {n:C} holds all four notes of {c:Cdim7}, with a note a whole step above each.',
      fact: 'symmetric-whole-half-dim7',
    },
    {
      type: 'order',
      prompt: 'Put {n:C} whole-half diminished in order, from {n:C}.',
      tiles: ['{n:C}', '{n:D}', '{n:Eb}', '{n:F}', '{n:Gb}', '{n:Ab}', '{n:A}', '{n:B}'],
      explain: 'Whole, half, whole, half from {n:C}: {n:C} {n:D} {n:Eb} {n:F} {n:Gb} {n:Ab} {n:A} {n:B}, then {n:C} again.',
      fact: 'symmetric-whole-half-dim7',
    },
    {
      type: 'true-false',
      statement: 'The diminished scales have eight notes.',
      answer: true,
      explain: 'Four half steps and four whole steps make twelve half steps: eight notes, then the octave.',
    },
    { generate: 'scale-notes', params: { scales: ['mixolydian', 'altered'], tonics: ['G', 'C', 'F', 'D'], form: 'odd-one-out' } },
    { generate: 'scale-ear', params: { scales: ['mixolydian', 'diminished-half-whole', 'diminished-whole-half'] } },
  ],
  facts: [
    {
      id: 'symmetric-half-whole-notes',
      front: 'Spell {n:C} half-whole diminished.',
      back: '{n:C} {n:Db} {n:Eb} {n:E} {n:F#} {n:G} {n:A} {n:Bb}: half and whole steps in turn, from the root.',
      ask: {
        type: 'order',
        prompt: 'Put {n:C} half-whole diminished in order, from {n:C}.',
        tiles: ['{n:C}', '{n:Db}', '{n:Eb}', '{n:E}', '{n:F#}', '{n:G}', '{n:A}', '{n:Bb}'],
        explain: 'Half, whole, half, whole from {n:C}: {n:C} {n:Db} {n:Eb} {n:E} {n:F#} {n:G} {n:A} {n:Bb}.',
      },
    },
    {
      id: 'symmetric-half-whole-7b9',
      front: 'Which chords does the half-whole diminished scale fit?',
      back: 'Dominant chords with a flat 9: {n:C} half-whole over {c:C7b9}.',
    },
    {
      id: 'symmetric-whole-half-dim7',
      front: 'Which chords does the whole-half diminished scale fit?',
      back: 'Diminished seventh chords: {n:C} whole-half ({n:C} {n:D} {n:Eb} {n:F} {n:Gb} {n:Ab} {n:A} {n:B}) over {c:Cdim7}.',
    },
  ],
};

const augmentedSymmetry: Lesson = {
  id: 'augmented-symmetry',
  title: 'The augmented triad',
  teaches: 'An augmented triad is two major thirds, dividing the octave into three, so it repeats every four frets.',
  minutes: 3,
  skill: `theory:${U}:augmented-symmetry`,
  steps: [
    {
      type: 'card',
      title: 'Two major thirds',
      body: 'An {t:augmented-triad|augmented triad} stacks two {t:major-third|major thirds}: {c:Caug} is {n:C} {n:E} {n:G#}. Four more half steps above {n:G#} bring you back to {n:C}, so three equal steps of four half steps fill the octave.',
      figure: {
        kind: 'fretboard',
        frets: [1, 10],
        dots: [
          { string: 4, fret: 10, note: 'C', role: 'root' },
          { string: 3, fret: 9, note: 'E' },
          { string: 2, fret: 9, note: 'G#' },
          { string: 4, fret: 6, note: 'G#' },
          { string: 3, fret: 5, note: 'C', role: 'root' },
          { string: 2, fret: 5, note: 'E' },
          { string: 4, fret: 2, note: 'E' },
          { string: 3, fret: 1, note: 'G#' },
          { string: 2, fret: 1, note: 'C', role: 'root' },
        ],
        caption: 'Strings 4, 3, 2 at frets 10-9-9, 6-5-5 and 2-1-1: the same three notes.',
      },
    },
    {
      type: 'card',
      title: 'Down four frets, same chord',
      body: 'Move the shape down four frets and every note falls a major third, onto another note of the chord. That is why {c:Caug}, {c:Eaug} and {c:G#aug} are one sound with three names.',
      figure: {
        kind: 'audio',
        sound: { kind: 'tab', notes: ['x-x-10-9-9-x', 'xx655x', 'xx211x'].flatMap((s) => arpeggio(s)), tempo: 90 },
        label: 'Hear 10-9-9, 6-5-5, 2-1-1',
      },
    },
    {
      type: 'true-false',
      statement: '{c:Eaug} and {c:Caug} contain the same pitches.',
      answer: true,
      explain: '{c:Eaug} is {n:E} {n:G#} {n:B#}, and {n:B#} sounds as {n:C}: the same three pitches as {c:Caug}, spelled from {n:E}.',
      fact: 'symmetric-aug-four-frets',
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'G#aug',
      frets: 'xx655x',
      accept: 'this-shape',
      prompt: 'Slide {c:Caug} on strings 4, 3, 2 (frets 10-9-9) down four frets. Build it.',
      explain: 'Frets 6-5-5: {n:G#} {n:C} {n:E}, the same three pitches as {c:Caug}. Named from its lowest note it is {c:G#aug}.',
      fact: 'symmetric-aug-four-frets',
    },
    {
      type: 'choice',
      prompt: 'Which augmented triad has the same notes as {c:Caug}?',
      options: [
        { text: '{c:Eaug}', correct: true },
        { text: '{c:Daug}', why: '{c:Daug} is {n:D} {n:F#} {n:A#}: a whole step above {c:Caug}, so every note is new.' },
        { text: '{c:Ebaug}', why: '{c:Ebaug} is {n:Eb} {n:G} {n:B}: none of these is in {c:Caug}.' },
      ],
      explain: '{c:Eaug} starts on {n:E}, a major third above {n:C}: its notes {n:E} {n:G#} {n:B#} are {c:Caug} again.',
      fact: 'symmetric-aug-four-frets',
    },
    {
      type: 'choice',
      prompt: 'How many different augmented triads are there?',
      options: [
        { text: '4', correct: true },
        { text: '3', why: 'Three is the count for diminished sevenths, which repeat every three frets.' },
        { text: '6' },
        { text: '12', why: 'Each augmented triad has three names, so twelve roots give only four sets of notes.' },
      ],
      shuffle: false,
      explain: 'Twelve roots, three names each: four augmented triads, on {n:C}, {n:C#}, {n:D} and {n:Eb}.',
      fact: 'symmetric-four-aug',
    },
    {
      type: 'listen-choice',
      prompt: 'Augmented or major triad?',
      sound: { kind: 'chord', chord: 'Caug', voicing: 'close', octave: 3 },
      options: [{ text: 'Augmented', correct: true }, { text: 'Major' }],
      shuffle: false,
      explain: 'That was {c:Caug}: its raised 5th, {n:G#}, makes it sound stretched and unsettled, as if it must move on.',
    },
    {
      type: 'chord-build',
      task: 'missing-note',
      chord: 'Caug',
      given: ['C', 'E'],
      options: ['G#', 'G', 'A', 'F#'],
      prompt: '{c:Caug} has {n:C} and {n:E}. Which note completes it?',
      explain: 'A major third above {n:E} is {n:G#}: two major thirds, {n:C} to {n:E} and {n:E} to {n:G#}.',
      fact: 'symmetric-aug-two-thirds',
    },
    {
      type: 'true-false',
      statement: 'An augmented triad divides the octave into three equal parts.',
      answer: true,
      explain: 'Three steps of four half steps make twelve: {n:C} to {n:E}, {n:E} to {n:G#}, and {n:G#} up to {n:C} again.',
      fact: 'symmetric-aug-two-thirds',
    },
    { generate: 'chord-quality-ear', params: { types: ['major', 'aug'] } },
    { generate: 'chord-quality-ear', params: { types: ['major', 'aug', 'minor', 'dim'] } },
  ],
  facts: [
    {
      id: 'symmetric-aug-two-thirds',
      front: 'What is an augmented triad made of?',
      back: 'Two major thirds, such as {n:C} {n:E} {n:G#}. Four more half steps return to {n:C}, so it divides the octave into three equal parts.',
      ask: {
        type: 'choice',
        prompt: 'What is {c:Caug} made of?',
        options: [
          { text: 'Two major thirds', correct: true },
          { text: 'Two minor thirds', why: 'Two minor thirds make a diminished triad.' },
          { text: 'A major and a minor third', why: 'That makes a major or a minor triad.' },
        ],
        explain: '{n:C} to {n:E} and {n:E} to {n:G#} are both major thirds.',
      },
    },
    {
      id: 'symmetric-aug-four-frets',
      front: 'What do you get when you move an augmented shape four frets?',
      back: 'The same three pitches: {c:Caug}, {c:Eaug} and {c:G#aug} share {n:C}, {n:E} and {n:G#}.',
    },
    {
      id: 'symmetric-four-aug',
      front: 'How many different augmented triads are there?',
      back: 'Only four: on {n:C}, {n:C#}, {n:D} and {n:Eb}. Every other one has the notes of one of these.',
    },
  ],
};

const wholeToneScale: Lesson = {
  id: 'whole-tone-scale',
  title: 'The whole-tone scale',
  teaches: 'The whole-tone scale has six notes a whole step apart; only two exist, and it fits dominants with a sharp 5th.',
  minutes: 3,
  skill: `theory:${U}:whole-tone-scale`,
  steps: [
    {
      type: 'card',
      title: 'Whole steps only',
      body: 'The {t:whole-tone-scale|whole-tone scale} moves only by {t:whole-step|whole steps}: {n:C} {n:D} {n:E} {n:F#} {n:G#} {n:Bb}, then {n:C} again. On one string that is every second fret: 3, 5, 7, 9, 11, 13 and 15 on string 5.',
      figure: {
        kind: 'fretboard',
        frets: [3, 15],
        dots: [
          { string: 5, fret: 3, note: 'C', role: 'root' },
          { string: 5, fret: 5, note: 'D' },
          { string: 5, fret: 7, note: 'E' },
          { string: 5, fret: 9, note: 'F#' },
          { string: 5, fret: 11, note: 'G#' },
          { string: 5, fret: 13, note: 'Bb' },
          { string: 5, fret: 15, note: 'C', role: 'root' },
        ],
        caption: '{n:C} whole tone along string 5: two frets at every step.',
      },
    },
    {
      type: 'card',
      title: 'In one position',
      body: 'Across the strings it makes a tidy pattern: two notes on every string, frets 2 to 5. With no half steps anywhere, no note pulls toward another, which is why it sounds dreamy and unresolved.',
      figure: { kind: 'fretboard', frets: [2, 5], derive: { scale: 'whole-tone', tonic: 'C' }, caption: '{n:C} whole tone, frets 2 to 5: two notes per string.' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete {n:C} whole tone.',
      text: '{n:C} {n:D} {n:E} ___ {n:G#} {n:Bb}',
      blanks: ['{n:F#}'],
      bank: ['{n:F}', '{n:G}'],
      explain: 'A whole step above {n:E} is {n:F#}, and a whole step above that is {n:G#}.',
      fact: 'symmetric-whole-tone-notes',
    },
    {
      type: 'listen-choice',
      prompt: 'Whole-tone scale or major scale?',
      sound: { kind: 'scale', tonic: 'C3', scale: 'whole-tone', direction: 'up' },
      options: [{ text: 'Whole-tone scale', correct: true }, { text: 'Major scale' }],
      shuffle: false,
      explain: 'Six even steps and back to {n:C}, with no half step to lean on: the whole-tone scale. A major scale has seven notes and two half steps.',
    },
    {
      type: 'choice',
      prompt: 'How many different whole-tone scales are there?',
      options: [
        { text: '2', correct: true },
        { text: '6', why: 'Each scale has six notes, but starting on any of them gives the same six notes.' },
        { text: '12', why: 'Six roots share each set of notes, so twelve roots give only two scales.' },
      ],
      shuffle: false,
      explain: 'One on {n:C} ({n:C} {n:D} {n:E} {n:F#} {n:G#} {n:Bb}) and one on {n:C#}, which holds the other six notes.',
      fact: 'symmetric-two-whole-tone',
    },
    {
      type: 'true-false',
      statement: '{n:C} whole tone and {n:D} whole tone contain the same six notes.',
      answer: true,
      explain: '{n:D} is in {n:C} whole tone, and starting there gives {n:D} {n:E} {n:F#} {n:G#} {n:A#} {n:C}: the same six pitches.',
      fact: 'symmetric-two-whole-tone',
    },
    {
      type: 'card',
      title: 'Over an augmented dominant',
      body: 'The scale holds all of {c:C7#5} ({n:C} {n:E} {n:G#} {n:Bb}), plus the 9th, {n:D}, and the {d:#11}, {n:F#}. So it fits dominant chords with a raised 5th, written {c:C7#5} or with a plus sign.',
      figure: {
        kind: 'audio',
        sound: { kind: 'tab', notes: [...arpeggio('x3x354', 'q'), ...line(C3, 'whole-tone')], tempo: 100 },
        label: 'Hear {c:C7#5}, then the scale',
      },
    },
    {
      type: 'choice',
      prompt: 'Which chord does {n:C} whole tone fit?',
      options: [
        { text: '{c:C7#5}', correct: true },
        { text: '{c:Cmaj7}', why: '{c:Cmaj7} needs {n:G} and {n:B}, and the scale has neither.' },
        { text: '{c:Cm7}', why: '{c:Cm7} needs {n:Eb} and {n:G}; the scale has {n:E} and {n:G#}.' },
        { text: '{c:C7b9}', why: 'The flat 9, {n:Db}, is not in the scale. {c:C7b9} goes with half-whole diminished.' },
      ],
      explain: '{c:C7#5} is {n:C} {n:E} {n:G#} {n:Bb}: every note is in {n:C} whole tone.',
      fact: 'symmetric-whole-tone-7sharp5',
    },
    { generate: 'scale-notes', params: { scales: ['whole-tone'], tonics: ['C', 'D', 'Db', 'E'], form: 'fill' } },
    { generate: 'scale-ear', params: { scales: ['major', 'whole-tone', 'diminished-half-whole'] } },
  ],
  facts: [
    {
      id: 'symmetric-whole-tone-notes',
      front: 'Spell the {n:C} whole-tone scale.',
      back: '{n:C} {n:D} {n:E} {n:F#} {n:G#} {n:Bb}: six notes, each a whole step from the next.',
      ask: {
        type: 'order',
        prompt: 'Put {n:C} whole tone in order, from {n:C}.',
        tiles: ['{n:C}', '{n:D}', '{n:E}', '{n:F#}', '{n:G#}', '{n:Bb}'],
        distractors: ['{n:F}'],
        explain: 'Whole steps only: {n:C} {n:D} {n:E} {n:F#} {n:G#} {n:Bb}, then {n:C}.',
      },
    },
    {
      id: 'symmetric-two-whole-tone',
      front: 'How many different whole-tone scales are there?',
      back: 'Two: one on {n:C} and one on {n:C#} (or {n:Db}). Every other starting note repeats one of them.',
    },
    {
      id: 'symmetric-whole-tone-7sharp5',
      front: 'Which chords does the whole-tone scale fit, and how does it sound?',
      back: 'Dominant chords with a raised 5th, such as {c:C7#5}. With no half steps, nothing pulls home, so it sounds dreamlike and unresolved.',
    },
  ],
};

const augmentedInProgressions: Lesson = {
  id: 'augmented-in-progressions',
  title: 'Augmented chords in progressions',
  teaches: 'Augmented chords move: a rising 5th carries the home chord to the chord on 4, and an augmented V pushes home.',
  minutes: 3,
  skill: `theory:${U}:augmented-in-progressions`,
  steps: [
    {
      type: 'card',
      title: 'A line that climbs',
      body: 'Play {c:C} (x32010), {c:Caug} (x32110), {c:C6} without its 5th (x32210), {c:C7} (x32310), then {c:F} (xx3211). Only string 3 moves: {n:G}, {n:G#}, {n:A}, {n:Bb}. The 5th of {c:C} climbs, and the line carries you to {c:F}, the {r:IV} chord.',
      figure: {
        kind: 'fretboard',
        frets: [0, 4],
        dots: [
          { string: 3, fret: 0, note: 'G' },
          { string: 3, fret: 1, note: 'G#', role: 'target' },
          { string: 3, fret: 2, note: 'A' },
          { string: 3, fret: 3, note: 'Bb' },
        ],
        caption: 'String 3 climbs {n:G} {n:G#} {n:A} {n:Bb} while the rest of {c:C} stays.',
      },
    },
    {
      type: 'card',
      title: 'Hear the line',
      body: 'Each chord is picked slowly, low string to high, so you can follow the note on string 3 climbing. The x32210 shape has no {n:G}: it is {c:C6} without its 5th, the same notes as {c:Am/C}.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: RISING_LINE.flatMap((s) => arpeggio(s)), tempo: 120 }, label: 'Hear {c:C} to {c:F}' },
    },
    {
      type: 'play-chord',
      prompt: 'Play {c:Caug}: the {c:C} shape with string 3 at fret 1 (x32110).',
      chord: 'Caug',
      frets: 'x32110',
      explain: 'x32110 is {n:C} {n:E} {n:G#} {n:C} {n:E}: the open {n:G} of {c:C} has moved up a fret to {n:G#}.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'Caug',
        frets: 'x32110',
        accept: 'this-shape',
        prompt: 'Build {c:Caug} from the {c:C} shape: move only string 3, up one fret.',
        explain: 'x32110: the open {n:G} on string 3 becomes {n:G#} at fret 1.',
      },
    },
    {
      type: 'order',
      prompt: 'Put the notes of the climbing voice on string 3 in order, from {c:C} to {c:C7}.',
      tiles: ['{n:G}', '{n:G#}', '{n:A}', '{n:Bb}'],
      distractors: ['{n:B}'],
      explain: 'One fret at a time on string 3: {n:G} (in {c:C}), {n:G#} ({c:Caug}), {n:A} ({c:C6}), {n:Bb} ({c:C7}).',
      fact: 'symmetric-rising-fifth',
    },
    {
      type: 'choice',
      prompt: 'In the climbing line, which shape has {n:A} on string 3?',
      options: [
        { text: 'x32210, the {c:C6} sound', correct: true },
        { text: 'x32110, {c:Caug}', why: 'In {c:Caug} string 3 is at fret 1: {n:G#}.' },
        { text: 'x32310, {c:C7}', why: 'In {c:C7} string 3 is at fret 3: {n:Bb}.' },
      ],
      explain: 'String 3 at fret 2 is {n:A}, the 6th of {c:C}: the line has climbed {n:G}, {n:G#}, {n:A}.',
      fact: 'symmetric-rising-fifth',
    },
    {
      type: 'card',
      title: 'A dominant with a push',
      body: 'Raise the 5th of the {r:V} chord and you get {r:V+}: {c:G+} is {n:G} {n:B} {n:D#}. In {k:C major} the {n:D#} wants to rise a half step to {n:E}, the 3rd of {c:C}, so {r:V+} leans toward home even harder than {r:V}.',
      figure: { kind: 'chord', symbol: 'Gaug', frets: '321003', caption: '{c:G+}: the raised 5th, {n:D#}, is string 4, fret 1.' },
    },
    {
      type: 'type-answer',
      prompt: '{c:G+} is {c:G} with its 5th raised. Type the raised 5th.',
      answer: { kind: 'note', value: 'D#', spelling: 'exact' },
      input: 'keypad',
      explain: '{c:G} is {n:G} {n:B} {n:D}; raise {n:D} a half step to {n:D#}. It is spelled {n:D#}, an augmented 5th above {n:G}, and it rises to {n:E}.',
      fact: 'symmetric-v-plus',
    },
    {
      type: 'listen-choice',
      prompt: 'Two chords. Is the first one plain {r:V} or {r:V+}?',
      sound: { kind: 'tab', notes: [...arpeggio('321003'), ...arpeggio('x32010')], tempo: 100 },
      options: [{ text: '{r:V+} to {r:I}', correct: true }, { text: '{r:V} to {r:I}' }],
      shuffle: false,
      explain: 'That was {c:G+} to {c:C}: on string 4 the {n:D#} rose a half step to {n:E}. Plain {c:G} has the open {n:D} there.',
    },
    {
      type: 'listen-choice',
      prompt: 'And this one: plain {r:V} or {r:V+}?',
      sound: { kind: 'tab', notes: [...arpeggio('320003'), ...arpeggio('x32010')], tempo: 100 },
      options: [{ text: '{r:V+} to {r:I}' }, { text: '{r:V} to {r:I}', correct: true }],
      shuffle: false,
      explain: 'That was plain {c:G} to {c:C}: the open {n:D} on string 4 has no half step to climb, so the pull is gentler.',
    },
    {
      type: 'true-false',
      statement: 'From {c:G+} to {c:C}, the raised 5th {n:D#} falls back to {n:D}.',
      answer: false,
      explain: 'It rises a half step to {n:E}, the 3rd of {c:C}. That extra upward pull is what {r:V+} adds.',
      fact: 'symmetric-v-plus',
    },
    {
      type: 'choice',
      prompt: 'Harmonic minor raises the 7th: in {k:A minor}, {n:G} becomes {n:G#}. Which chord is then built on {n:C}?',
      options: [
        { text: '{c:Caug}', correct: true },
        { text: '{c:C}', why: 'With the plain {n:G} of natural minor it is {c:C}. Harmonic minor has {n:G#} instead.' },
        { text: '{c:Cm}', why: 'The 3rd above {n:C} in {k:A minor} is {n:E}, a major third: the chord is not minor.' },
      ],
      explain: 'Stack thirds on {n:C} with the notes of {n:A} harmonic minor: {n:C} {n:E} {n:G#}, {c:Caug}, the {r:bIII+} chord.',
      fact: 'symmetric-harmonic-minor-aug',
    },
  ],
  facts: [
    {
      id: 'symmetric-rising-fifth',
      front: 'How does the line {c:C}, {c:Caug}, {c:C6}, {c:C7} move, and where does it lead?',
      back: 'The 5th climbs a half step at a time, {n:G} {n:G#} {n:A} {n:Bb}, and leads from {r:I} to {r:IV}: here to {c:F}.',
    },
    {
      id: 'symmetric-v-plus',
      front: 'Why does {r:V+} pull harder to {r:I} than {r:V} does?',
      back: 'Its raised 5th rises a half step into {r:I}: {c:G+} is {n:G} {n:B} {n:D#}, and the {n:D#} moves up to {n:E}.',
      ask: {
        type: 'type-answer',
        prompt: 'Type the note of {c:G+} that rises a half step to {n:E} in {c:C}.',
        answer: { kind: 'note', value: 'D#', spelling: 'exact' },
        input: 'keypad',
        explain: '{c:G+} is {n:G} {n:B} {n:D#}: the raised 5th, {n:D#}, rises to {n:E}.',
      },
    },
    {
      id: 'symmetric-harmonic-minor-aug',
      front: 'Which augmented chord does the {n:A} harmonic minor scale contain?',
      back: '{c:Caug} on {r:bIII}: {n:C} {n:E} {n:G#}, using the raised 7th, {n:G#}.',
    },
  ],
};

/** Unit 36 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'Symmetric sounds',
  theme: 'scales',
  description: 'Chords and scales that divide the octave equally: diminished sevenths, diminished scales, augmented triads and the whole-tone scale.',
  lessons: [dim7Symmetry, oneDim7FourDominants, diminishedScales, augmentedSymmetry, wholeToneScale, augmentedInProgressions],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      {
        type: 'choice',
        prompt: 'What is a diminished seventh chord built from?',
        options: [
          { text: 'Four minor thirds stacked up', correct: true },
          { text: 'Two major thirds', why: 'Two major thirds make an augmented triad.' },
          { text: 'A major triad and a minor 7th', why: 'That is a dominant seventh chord.' },
        ],
        explain: '{c:Bdim7} is {n:B} {n:D} {n:F} {n:Ab}: minor thirds all the way, and three more half steps bring you back to {n:B}.',
      },
      {
        type: 'choice',
        prompt: 'How many different diminished seventh chords are there?',
        options: [{ text: '3', correct: true }, { text: '4' }, { text: '6' }, { text: '12' }],
        shuffle: false,
        explain: 'Only three sets of notes: {c:Cdim7}, {c:C#dim7} and {c:Ddim7}. A dim7 on any of its four notes has the same pitches.',
      },
      {
        type: 'true-false',
        statement: 'Moving a dim7 shape up three frets gives a different diminished seventh chord.',
        answer: false,
        explain: 'Every note rises a minor third onto the next note of the chord: the same four notes, in a new inversion.',
      },
      {
        type: 'choice',
        prompt: 'Which dim7 has the same notes as {c:Bdim7}?',
        options: [
          { text: '{c:Fdim7}', correct: true },
          { text: '{c:Cdim7}', why: '{c:Cdim7} is {n:C} {n:Eb} {n:Gb} {n:Bbb}: a different set.' },
          { text: '{c:C#dim7}', why: '{c:C#dim7} is {n:C#} {n:E} {n:G} {n:Bb}: a different set.' },
        ],
        explain: '{c:Fdim7} is {n:F} {n:Ab} {n:Cb} {n:Ebb}: {n:Cb} sounds as {n:B} and {n:Ebb} as {n:D}, so it is {c:Bdim7} again.',
      },
      {
        type: 'choice',
        prompt: '{c:Bdim7} works as {c:G7b9} without its root. Which other dominant does it also serve?',
        options: [
          { text: '{c:E7b9}', correct: true },
          { text: '{c:C7b9}', why: '{c:C7b9} without its root is {c:Edim7}.' },
          { text: '{c:A7b9}', why: '{c:A7b9} without its root is {c:C#dim7}.' },
          { text: '{c:D7b9}', why: '{c:D7b9} without its root is {c:F#dim7}, which shares its notes with {c:Cdim7}.' },
        ],
        explain: '{c:E7b9} is {n:E} {n:G#} {n:B} {n:D} {n:F}: without {n:E} it is the four notes of {c:Bdim7}. {c:Bb7b9} and {c:Db7b9} work too.',
      },
      {
        type: 'type-answer',
        prompt: 'Which dim7 passes between {c:C} and {c:Dm7}? Type its name.',
        answer: { kind: 'chord', value: 'C#dim7', spelling: 'exact' },
        input: 'keyboard',
        explain: '{c:C#dim7}: the bass climbs {n:C}, {n:C#}, {n:D}.',
      },
      {
        type: 'choice',
        prompt: '{c:C}, {c:Cdim7}, {c:C}: what is the {c:Cdim7} here?',
        options: [
          { text: 'A common-tone diminished chord', correct: true },
          { text: 'A passing diminished chord', why: 'A passing chord links two different chords a whole step apart.' },
          { text: 'A rootless {c:C7b9}', why: 'A rootless {c:C7b9} would be {c:Edim7}, and it would lead on to {c:F}.' },
        ],
        explain: 'It keeps the root {n:C} and decorates the chord it returns to.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Complete {n:C} half-whole diminished.',
        text: '{n:C} {n:Db} {n:Eb} {n:E} ___ {n:G} {n:A} {n:Bb}',
        blanks: ['{n:F#}'],
        bank: ['{n:F}', '{n:G#}'],
        explain: 'After {n:E} comes a whole step, to {n:F#}, then a half step to {n:G}.',
      },
      {
        type: 'choice',
        prompt: 'Which scale fits {c:G7b9}?',
        options: [
          { text: '{n:G} half-whole diminished', correct: true },
          { text: '{n:G} whole-half diminished', why: 'Whole-half from {n:G} lacks {n:B}, the 3rd of {c:G7}. It fits {c:Gdim7}.' },
          { text: '{n:G} whole tone', why: 'The whole-tone scale has no flat 9 and no perfect 5th; it fits {c:G7#5}.' },
        ],
        explain: '{n:G} half-whole is {n:G} {n:Ab} {n:Bb} {n:B} {n:C#} {n:D} {n:E} {n:F}: all of {c:G7b9}.',
      },
      {
        type: 'choice',
        prompt: 'Which scale fits {c:Cdim7}?',
        options: [
          { text: '{n:C} whole-half diminished', correct: true },
          { text: '{n:C} half-whole diminished', why: 'It puts a note a half step above each tone of {c:Cdim7}, such as {n:Db} over {n:C}, which clash. It fits {c:C7b9}.' },
          { text: '{n:C} whole tone', why: 'Whole tone has no {n:Eb} and no {n:Gb}.' },
        ],
        explain: 'Whole-half from {n:C}, {n:C} {n:D} {n:Eb} {n:F} {n:Gb} {n:Ab} {n:A} {n:B}, holds every note of {c:Cdim7}.',
      },
      {
        type: 'true-false',
        statement: 'Moving an augmented triad shape four frets gives the same three pitches.',
        answer: true,
        explain: 'Every note moves a major third onto another note of the chord: {c:Caug}, {c:Eaug} and {c:G#aug} share their pitches.',
      },
      {
        type: 'choice',
        prompt: 'How many different augmented triads are there?',
        options: [{ text: '3' }, { text: '4', correct: true }, { text: '6' }, { text: '12' }],
        shuffle: false,
        explain: 'Each one has three names, so twelve roots give four: on {n:C}, {n:C#}, {n:D} and {n:Eb}.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Complete {n:C} whole tone.',
        text: '{n:C} {n:D} ___ {n:F#} {n:G#} {n:Bb}',
        blanks: ['{n:E}'],
        bank: ['{n:Eb}', '{n:F}'],
        explain: 'Whole steps only: {n:D} to {n:E}, {n:E} to {n:F#}.',
      },
      {
        type: 'choice',
        prompt: 'How many different whole-tone scales are there?',
        options: [{ text: '2', correct: true }, { text: '3' }, { text: '6' }, { text: '12' }],
        shuffle: false,
        explain: 'Two: one on {n:C} and one on {n:C#}. Starting on any other note repeats one of them.',
      },
      {
        type: 'choice',
        prompt: 'Which chord does the whole-tone scale on {n:C} fit?',
        options: [
          { text: '{c:C7#5}', correct: true },
          { text: '{c:C7b9}', why: 'The flat 9 belongs to half-whole diminished.' },
          { text: '{c:Cmaj7}', why: 'The scale has no {n:G} and no {n:B}.' },
        ],
        explain: '{c:C7#5} is {n:C} {n:E} {n:G#} {n:Bb}, all in {n:C} whole tone.',
      },
      {
        type: 'type-answer',
        prompt: 'Type the raised 5th of {c:G+}.',
        answer: { kind: 'note', value: 'D#', spelling: 'exact' },
        input: 'keypad',
        explain: '{c:G+} is {n:G} {n:B} {n:D#}; the {n:D#} rises to {n:E} in {c:C}.',
      },
      {
        type: 'choice',
        prompt: 'The 5th of {c:C} climbs: {c:C}, {c:Caug}, {c:C6}, {c:C7}. Which chord does the line lead to?',
        options: [
          { text: '{c:F}', correct: true },
          { text: '{c:G}', why: '{c:C7} is the dominant of {c:F}: its {n:Bb} falls to {n:A}, the 3rd of {c:F}.' },
          { text: '{c:Am}', why: 'The {n:Bb} of {c:C7} leads to {c:F}, the {r:IV} chord.' },
        ],
        explain: 'The line {n:G} {n:G#} {n:A} {n:Bb} turns {c:C} into {c:C7}, which leads to {c:F}: {r:I} to {r:IV}.',
      },
      { generate: 'chord-quality-ear', params: { types: ['major', 'aug', 'dim'] } },
      { generate: 'scale-ear', params: { scales: ['major', 'whole-tone', 'diminished-half-whole'] } },
    ],
  },
};

export default unit;
