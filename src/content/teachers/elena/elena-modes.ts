/**
 * Prof. Varga, unit 2: The modes in practice (plan: `elena/elena-modes` in
 * src/content/plan/teachers.json).
 *
 * Elena's voice: rigorous, dry, respectful. Every mode is taught on A, against its own tonic, as a
 * colour: the one note that sets it apart (Dorian F#, Phrygian Bb, Lydian D#, Mixolydian G, Aeolian
 * F, Locrian Eb), the vamp whose chord carries that note, and a study from the library that lands
 * on it. Figures of the positions come from the guitar engine (`scalePatterns`, the E-shape
 * position of each mode on A: fifth position for the minor modes, fourth for the major ones).
 *
 * Music from the song library: the seven Mode Studies (`st-mode-*`), Andalusian Cadence with
 * Rasgueado (`st-andalusian-cadence`, 80 BPM). Red Haired Boy carries a fallback (a jam over the
 * Mixolydian vamp) until it is in the library. The plan's "Ear: over a drone" has no drone in the
 * Ear Training screen: its Scales and modes drill plays each scale from its tonic instead, and the
 * cards ask the learner to let the open A string ring as a drone in Scales.
 * `elena-modes.test.ts` cross-checks every spelling, position, chord and tempo against the engines.
 */
import { scalePatterns, type ScalePattern } from '@/core/guitar';
import type { FretDot, TabNote } from '@/lessons';
import type { TeacherLesson, TeacherUnit } from '../types';
import { playerTask, techniqueTask, toolTask } from '../tasks';

/** The E-shape position of a mode on A, from the guitar engine. */
export function modePosition(scale: string): ScalePattern {
  const p = scalePatterns('A', scale).find((x) => x.id === 'caged-e');
  if (!p) throw new Error(`A ${scale}: no E-shape position`);
  return p;
}

/** A position as figure dots: every note claimed, the colour notes as targets, the roots marked. */
function colourDots(p: ScalePattern, colour: readonly string[]): FretDot[] {
  return p.notes.map((n) => {
    const d: FretDot = { string: n.string, fret: n.fret, note: n.note };
    if (colour.includes(n.note)) d.role = 'target';
    else if (n.isRoot) d.role = 'root';
    return d;
  });
}

const DORIAN = modePosition('dorian');
const AEOLIAN = modePosition('minor');
const MIXOLYDIAN = modePosition('mixolydian');
const PHRYGIAN = modePosition('phrygian');
const LOCRIAN = modePosition('locrian');

/** One tab note. */
function t(string: number, fret: number, duration: string): TabNote {
  return { string, fret, duration };
}

// ── 1. Modes as colours ─────────────────────────────────────────────────────────────────────────

const modesAsColours: TeacherLesson = {
  id: 'modes-as-colours',
  title: 'Modes as colours',
  teaches: 'The modes share notes but not their home; against that home, one defining note gives each its colour.',
  minutes: 4,
  skill: 'teacher:elena:modes-as-colours',
  steps: [
    {
      type: 'card',
      title: 'Same notes, a different home',
      body: 'The {t:mode|modes} of the major scale share their notes but not their home, and the home is everything. Think of A Dorian as A minor with an {n:F#}, not as {k:G major} started on A. Heard against its own tonic, each mode is a colour, not a rotation.',
      figure: { kind: 'audio', sound: { kind: 'scale', tonic: 'A3', scale: 'dorian', direction: 'up-down', tempo: 100 }, label: 'Hear A Dorian' },
    },
    {
      type: 'true-false',
      statement: 'The useful way to think of A Dorian is as {k:G major} played from A.',
      answer: false,
      explain: 'Same notes, different home. A Dorian is A minor with {n:F#}: the home is A, and the {n:F#} is its colour. Think from the tonic you hear.',
      fact: 'dorian-is-minor-with-six',
    },
    {
      type: 'card',
      title: 'One note each',
      body: 'Over a {t:drone} on A, each mode has the note that defines it, its {t:colour-note|colour note}. Dorian: the major sixth, {n:F#}. Phrygian: the flat second, {n:Bb}. Lydian: the sharp fourth, {n:D#}. Mixolydian: the flat seventh, {n:G}. Aeolian: the flat sixth, {n:F}. Locrian: the flat fifth, {n:Eb}.',
      tip: 'Ionian, the major scale itself, is the yardstick the others are measured against.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each mode on A with the note that defines it.',
      pairs: [
        { left: 'Dorian', right: '{d:6}: {n:F#}' },
        { left: 'Phrygian', right: '{d:b2}: {n:Bb}' },
        { left: 'Lydian', right: '{d:#4}: {n:D#}' },
        { left: 'Mixolydian', right: '{d:b7}: {n:G}' },
        { left: 'Aeolian', right: '{d:b6}: {n:F}' },
        { left: 'Locrian', right: '{d:b5}: {n:Eb}' },
      ],
      explain: 'Dorian and Phrygian differ from natural minor by one note, Lydian and Mixolydian from major by one: that note is the colour. Aeolian\'s flat sixth is what sets it apart from Dorian; Locrian\'s flat fifth sets it apart from Phrygian.',
      fact: 'mode-colour-notes',
    },
    playerTask({
      id: 'study-ionian',
      title: 'The yardstick: A Ionian',
      song: 'st-mode-ionian',
      tempo: 82,
      minutes: 4,
      body: 'Mode Study: A Ionian at about 72 BPM, in fourth position: {n:G#} under finger 1 on string 1, over {c:Amaj7} and {c:D}. Plain major, the sound the other modes are measured against. Keep it in your ear: the Lydian study uses the same place on the neck with only {n:D} raised to {n:D#}.',
    }),
    {
      type: 'listen-choice',
      prompt: 'A scale from A. Dorian or Aeolian? Listen to the sixth note.',
      sound: { kind: 'scale', tonic: 'A3', scale: 'dorian', direction: 'up', tempo: 100 },
      options: [{ text: 'Dorian', correct: true }, { text: 'Aeolian' }],
      shuffle: false,
      explain: 'The sixth was {n:F#}, a major sixth above A: Dorian. Aeolian would have {n:F}, a half step lower and a good deal sadder.',
    },
    {
      type: 'listen-choice',
      prompt: 'Another scale from A. Lydian or Ionian (major)? Listen to the fourth.',
      sound: { kind: 'scale', tonic: 'A3', scale: 'lydian', direction: 'up', tempo: 100 },
      options: [{ text: 'Lydian', correct: true }, { text: 'Ionian (major)' }],
      shuffle: false,
      explain: 'The fourth was {n:D#}, raised: Lydian, bright and floating. Ionian has {n:D}, which wants to fall to {n:C#}.',
    },
    toolTask({
      id: 'ear-modes',
      title: 'Hear the modes in Ear Training',
      tool: 'ear',
      params: ['scales', '5'],
      minutes: 5,
      body: 'Scales and modes, level 5 (major, Lydian, Mixolydian), then level 6 (natural minor, Dorian, Phrygian). Each scale starts on its tonic: listen for the one note that differs.',
      tip: 'Hum the tonic under each scale. A drone in your own throat is still a drone.',
    }),
    toolTask({
      id: 'scales-modes-on-a',
      title: 'Each mode on A, in position',
      tool: 'scales',
      params: ['a', 'dorian', 'caged-e'],
      minutes: 5,
      body: 'A Dorian in fifth position, slowly, with the open A string ringing under it as your drone. Then change the scale: Phrygian, Aeolian and Locrian sit in fifth position too; Ionian, Lydian and Mixolydian a fret lower, in fourth. Dwell on each colour note.',
    }),
    { generate: 'scale-notes', params: { scales: ['dorian', 'mixolydian', 'lydian', 'phrygian'], tonics: ['A', 'D', 'E', 'G'], form: 'odd-one-out' } },
    { generate: 'scale-ear', params: { scales: ['major', 'dorian', 'mixolydian', 'minor'] } },
  ],
  facts: [
    {
      id: 'mode-colour-notes',
      front: 'The colour note of each mode on A?',
      back: 'Dorian {n:F#} ({d:6}), Phrygian {n:Bb} ({d:b2}), Lydian {n:D#} ({d:#4}), Mixolydian {n:G} ({d:b7}), Aeolian {n:F} ({d:b6}), Locrian {n:Eb} ({d:b5}).',
    },
    { id: 'dorian-is-minor-with-six', front: 'How should you think of A Dorian?', back: 'As A minor with {n:F#}, its major sixth: not as {k:G major} started on A.' },
  ],
};

// ── 2. Dorian and Aeolian ───────────────────────────────────────────────────────────────────────

const dorianAndAeolian: TeacherLesson = {
  id: 'dorian-and-aeolian',
  title: 'Dorian and Aeolian',
  teaches: 'Dorian and Aeolian are both minor: the sixth decides, and you make it heard on strong beats.',
  minutes: 5,
  skill: 'teacher:elena:dorian-and-aeolian',
  steps: [
    {
      type: 'card',
      title: 'The sixth decides',
      body: 'Both are minor; the sixth decides. Over {c:Am} to {c:D}, the {n:F#} in the {c:D} chord makes it Dorian. Land the sixth on strong beats and the listener hears the mode. Do not play the scale like a staircase: phrase toward the colour note.',
      figure: { kind: 'fretboard', frets: [DORIAN.minFret, DORIAN.maxFret], dots: colourDots(DORIAN, ['F#']), caption: 'A Dorian in fifth position, {n:F#} marked.' },
    },
    {
      type: 'choice',
      prompt: 'The vamp is {c:Am} to {c:D}. Which sixth belongs over it?',
      options: [
        { text: '{n:F#}: Dorian', correct: true },
        { text: '{n:F}: Aeolian', why: '{n:F} grinds against the {n:F#} of the {c:D} chord.' },
        { text: '{n:G}: the seventh', why: '{n:G} is the flat seventh, common to both modes. It decides nothing.' },
      ],
      explain: 'The {c:D} chord is {n:D}, {n:F#}, {n:A}. Its {n:F#} is the major sixth of A: the vamp itself spells Dorian.',
      fact: 'sixth-decides',
    },
    {
      type: 'card',
      title: 'Aeolian: one note darker',
      body: 'Lower one note, {n:F#} to {n:F}, and the same place on the neck is A Aeolian, the natural minor. Over {c:Am}, {c:F} and {c:G}, the {n:F} in the {c:F} chord makes it Aeolian: land on it, and the music turns sad and serious.',
      figure: { kind: 'fretboard', frets: [AEOLIAN.minFret, AEOLIAN.maxFret], dots: colourDots(AEOLIAN, ['F']), caption: 'A Aeolian in fifth position, {n:F} marked.' },
    },
    {
      type: 'fretboard-name',
      prompt: 'The root (R) is {n:A}. Which degree is the marked note?',
      position: { string: 2, fret: 7 },
      root: { string: 4, fret: 7 },
      ask: 'degree',
      spelling: 'any',
      options: ['6', 'b6', '5', 'b7'],
      explain: 'String 2 fret 7 is {n:F#}, nine half steps above the {n:A} at string 4 fret 7: the major sixth, Dorian\'s colour.',
    },
    {
      type: 'play-note',
      prompt: 'I say Dorian. Play its sixth in fifth position: string 2, fret 7.',
      note: 'F#4',
      octave: 'exact',
      where: { string: 2, fret: 7 },
      explain: 'String 2 fret 7 is {n:F#}, under the ring finger: the note that makes A minor Dorian.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Dorian: tap its sixth, {n:F#}, in fifth position.',
        find: { note: 'F#4' },
        mode: 'one',
        octave: 'exact',
        frets: [4, 8],
        explain: 'In fifth position the {n:F#} above the middle A is string 2, fret 7.',
      },
    },
    {
      type: 'play-note',
      prompt: 'Now Aeolian. Its sixth, one fret lower: string 2, fret 6.',
      note: 'F4',
      octave: 'exact',
      where: { string: 2, fret: 6 },
      explain: 'String 2 fret 6 is {n:F}, the flat sixth, under the middle finger: Aeolian\'s colour.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Aeolian: tap its sixth, {n:F}, in fifth position.',
        find: { note: 'F4' },
        mode: 'one',
        octave: 'exact',
        frets: [4, 8],
        explain: 'One fret below the Dorian sixth: string 2, fret 6 is {n:F}.',
      },
    },
    playerTask({
      id: 'study-dorian',
      title: 'Mode Study: A Dorian',
      song: 'st-mode-dorian',
      tempo: 75,
      minutes: 4,
      body: 'About 72 BPM, then 100 % (96 BPM) once it is clean. Watch the {n:F#}: on a strong beat over {c:D}, passing through over {c:Am}. Fifth position, {n:F#} under the ring finger.',
    }),
    playerTask({
      id: 'study-aeolian',
      title: 'Mode Study: A Aeolian',
      song: 'st-mode-aeolian',
      tempo: 90,
      minutes: 4,
      body: 'The same place on the neck, at about 72 BPM. The {n:F} lands on strong beats over the {c:F} chord; bars 15 and 16 are {c:F} and {c:G}, then {c:Am}, the cadence that brings Aeolian home.',
    }),
    {
      type: 'true-false',
      statement: 'Over {c:Am} to {c:D}, an {n:F} on a strong beat confirms the Dorian sound.',
      answer: false,
      explain: '{n:F} is Aeolian\'s sixth, and it clashes with the {n:F#} inside the {c:D} chord. Over this vamp, the strong-beat sixth is {n:F#}.',
      fact: 'sixth-decides',
    },
    toolTask({
      id: 'jam-dorian',
      title: 'Jam: A Dorian with the band',
      tool: 'progressions',
      params: ['dorian-i-iv', 'a', 'jam'],
      minutes: 4,
      body: 'Two choruses over {c:Am7} to {c:D7}, the band at 100 BPM, with {n:F#} on a strong beat in every phrase. Begin and end phrases on A: the vamp can also be heard as {r:ii7} to {r:V7} in {k:G major}, and your A decides.',
    }),
    toolTask({
      id: 'jam-aeolian',
      title: 'Jam: A Aeolian with the band',
      tool: 'progressions',
      params: ['minor-i-bvi-bvii', 'a', 'jam'],
      minutes: 4,
      body: 'The same over {c:Am}, {c:F}, {c:G}, {c:Am} at 96 BPM, with {n:F} on the strong beats, above all over the {c:F} chord.',
    }),
    { generate: 'scale-ear', params: { scales: ['dorian', 'minor'] } },
  ],
  facts: [
    { id: 'sixth-decides', front: 'Dorian or Aeolian: which note decides?', back: 'The sixth. Over {c:Am} to {c:D} the {n:F#} makes it Dorian; over {c:Am} {c:F} {c:G} the {n:F} makes it Aeolian.' },
    { id: 'phrase-toward-colour', front: 'Improvising in a mode: how do you make it heard?', back: 'Land its colour note on strong beats and phrase toward it. A scale played like a staircase says nothing.' },
  ],
};

// ── 3. Mixolydian and Lydian ────────────────────────────────────────────────────────────────────

const mixolydianAndLydian: TeacherLesson = {
  id: 'mixolydian-and-lydian',
  title: 'Mixolydian and Lydian',
  teaches: 'Mixolydian is major with a flat seventh, Lydian major with a raised fourth: each one note away from major.',
  minutes: 5,
  skill: 'teacher:elena:mixolydian-and-lydian',
  steps: [
    {
      type: 'card',
      title: 'One note away from major',
      body: 'Mixolydian is major with a flat seventh: the {c:A} to {c:G} vamp, the sound of a lot of rock and fiddle music. Lydian is major with a raised fourth: the {c:A} to {c:B} vamp, where the {c:B} chord carries {n:D#}, the bright, floating note film composers love. Each is one note away from major, and that note is the whole story.',
      figure: { kind: 'fretboard', frets: [MIXOLYDIAN.minFret, MIXOLYDIAN.maxFret], dots: colourDots(MIXOLYDIAN, ['G']), caption: 'A Mixolydian in fourth position, {n:G} marked.' },
    },
    {
      type: 'choice',
      prompt: 'Which vamp is Lydian?',
      options: [
        { text: '{c:A} to {c:B}', correct: true },
        { text: '{c:A} to {c:G}', why: 'That is Mixolydian: {c:G} carries the flat seventh.' },
        { text: '{c:Am} to {c:D}', why: 'That is Dorian: minor, with {n:F#} in the {c:D} chord.' },
        { text: '{c:Am} to {c:Bb}', why: 'That is Phrygian: {c:Bb} carries the flat second.' },
      ],
      explain: 'The {c:B} chord is {n:B}, {n:D#}, {n:F#}. Its {n:D#} is the raised fourth of A: the second chord of the vamp spells Lydian.',
      fact: 'major-modes-one-note',
    },
    {
      type: 'card',
      title: 'The two colour notes on the neck',
      body: 'In fifth position Lydian\'s {n:D#} is string 3 fret 8, under the little finger; the Lydian study plays the same pitch at string 2 fret 4, in fourth position. Mixolydian\'s {n:G} is string 4 fret 5, the same pitch as the open G string.',
      figure: { kind: 'chord', symbol: 'B', frets: 'x24442', caption: 'The {c:B} chord: its {n:D#} is on string 2, fret 4.' },
    },
    {
      type: 'fretboard-name',
      prompt: 'The root (R) is {n:A}. Which degree is the marked note?',
      position: { string: 3, fret: 8 },
      root: { string: 4, fret: 7 },
      ask: 'degree',
      spelling: 'any',
      options: ['#4', '4', '5', 'b7'],
      explain: 'String 3 fret 8 is {n:D#}, six half steps above the {n:A} at string 4 fret 7: the raised fourth, Lydian\'s colour.',
    },
    {
      type: 'play-note',
      prompt: 'I say Mixolydian. Play its colour note in fifth position: string 4, fret 5.',
      note: 'G3',
      octave: 'exact',
      where: { string: 4, fret: 5 },
      explain: 'String 4 fret 5 is {n:G}, the flat seventh of A: the same pitch as the open G string.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Mixolydian: tap its flat seventh, {n:G}, on string 4.',
        find: { note: 'G3' },
        mode: 'one',
        octave: 'exact',
        strings: [4],
        frets: [4, 8],
        explain: 'String 4 fret 5 is {n:G}, under the index finger in fifth position.',
      },
    },
    {
      type: 'play-note',
      prompt: 'Now Lydian: its colour note, string 3, fret 8.',
      note: 'D#4',
      octave: 'exact',
      where: { string: 3, fret: 8 },
      explain: 'String 3 fret 8 is {n:D#}, the raised fourth. Let it ring: it wants to rise to {n:E}, and that wanting is Lydian.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Lydian: tap its raised fourth, {n:D#}, between frets 4 and 8.',
        find: { note: 'D#4' },
        mode: 'one',
        octave: 'exact',
        frets: [4, 8],
        explain: 'String 3 fret 8 or string 2 fret 4: the same {n:D#}, in fifth and fourth position.',
      },
    },
    playerTask({
      id: 'study-mixolydian',
      title: 'Mode Study: A Mixolydian',
      song: 'st-mode-mixolydian',
      tempo: 69,
      minutes: 4,
      body: 'About 72 BPM, then 100 % (104 BPM). Second position with open strings: {n:G} on string 1 fret 3 is the colour, and the tune ends {n:G} to A, the flat seventh rising home.',
    }),
    playerTask({
      id: 'study-lydian',
      title: 'Mode Study: A Lydian',
      song: 'st-mode-lydian',
      tempo: 86,
      minutes: 4,
      body: 'About 72 BPM, then 100 % (84 BPM). Fourth position, one finger per fret: {n:D#} is string 2 fret 4, under finger 1. Over {c:A} it floats; over {c:B} it is the chord\'s third.',
    }),
    {
      type: 'true-false',
      statement: 'In A Mixolydian, {n:G#} is the colour note.',
      answer: false,
      explain: '{n:G#} is the major seventh of plain A major. Mixolydian lowers it to {n:G}, and that {n:G} is the colour.',
      fact: 'major-modes-one-note',
    },
    toolTask({
      id: 'jam-lydian',
      title: 'Jam: A Lydian with the band',
      tool: 'progressions',
      params: ['lydian-i-ii', 'a', 'jam'],
      minutes: 4,
      body: 'Over {c:A} to {c:B} at 72 BPM, {n:D#} on the strong beats. Begin and end phrases on A, or the vamp turns into {r:IV} to {r:V} in {k:E major}.',
    }),
    playerTask({
      id: 'red-haired-boy',
      title: 'Red Haired Boy in A Mixolydian',
      song: 'red-haired-boy',
      minutes: 5,
      body: 'The fiddle tune at about 80 BPM, then 96: set the Player\'s speed. It is in A Mixolydian, every {n:G} natural; over the {c:G} chord, lean on it.',
      fallback: {
        tool: 'progressions',
        params: ['mixolydian-i-bvii', 'a', 'jam'],
        title: 'Jam in A Mixolydian',
        body: 'Red Haired Boy is not in the Songs library yet. Jam over {c:A} to {c:G} instead, at 80 BPM, then 96: fiddle-style eighth notes in A Mixolydian, every {n:G} natural, leaning on it over the {c:G} chord.',
      },
    }),
    { generate: 'scale-ear', params: { scales: ['major', 'mixolydian', 'lydian'] } },
  ],
  facts: [
    { id: 'major-modes-one-note', front: 'Mixolydian and Lydian: how does each differ from major?', back: 'Mixolydian has a flat seventh ({n:G} in A, the {c:A} to {c:G} vamp); Lydian a raised fourth ({n:D#} in A, the {c:A} to {c:B} vamp).' },
    { id: 'colour-notes-fifth-position', front: 'In fifth position, where are A Mixolydian\'s {n:G} and A Lydian\'s {n:D#}?', back: '{n:G}: string 4 fret 5, the pitch of the open G string. {n:D#}: string 3 fret 8, the same pitch as string 2 fret 4.' },
  ],
};

// ── 4. Phrygian and the flamenco cadence ────────────────────────────────────────────────────────

const phrygianAndFlamenco: TeacherLesson = {
  id: 'phrygian-and-flamenco',
  title: 'Phrygian and the flamenco cadence',
  teaches: 'Phrygian\'s flat second falls to the root; a major home chord makes it flamenco\'s Phrygian dominant.',
  minutes: 5,
  skill: 'teacher:elena:phrygian-and-flamenco',
  steps: [
    {
      type: 'card',
      title: 'The flat second',
      body: 'Phrygian\'s flat second, {n:Bb} over A, falls to the root with a dark, heavy pull. Locrian shares it, but its flat fifth makes it another world. A Phrygian: {n:A} {n:Bb} {n:C} {n:D} {n:E} {n:F} {n:G}.',
      figure: { kind: 'fretboard', frets: [PHRYGIAN.minFret, PHRYGIAN.maxFret], dots: colourDots(PHRYGIAN, ['Bb']), caption: 'A Phrygian in fifth position, {n:Bb} marked.' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete A Phrygian.',
      text: '{n:A}  ___  {n:C}  {n:D}  {n:E}  ___  {n:G}',
      blanks: ['{n:Bb}', '{n:F}'],
      bank: ['{n:B}', '{n:F#}'],
      explain: 'Phrygian is natural minor with a flat second: {n:A} {n:Bb} {n:C} {n:D} {n:E} {n:F} {n:G}. {n:B} and {n:F#} belong to Dorian.',
      fact: 'phrygian-flat-two',
    },
    {
      type: 'card',
      title: 'Flamenco\'s home is major',
      body: 'In flamenco the home chord is usually major: {c:E}, with {n:G#}. That turns E Phrygian into {t:phrygian-dominant|Phrygian dominant}, {n:E} {n:F} {n:G#} {n:A} {n:B} {n:C} {n:D}. The Andalusian cadence, {c:Am} {c:G} {c:F} {c:E}, walks down to that {c:E}; play it with the four-finger {t:rasgueado}.',
      figure: { kind: 'fretboard', frets: [0, 4], derive: { scale: 'phrygian-dominant', tonic: 'E' }, root: 'E', labels: 'degree', caption: 'E Phrygian dominant in open position: {d:b2} and {d:3} side by side.' },
    },
    {
      type: 'choice',
      prompt: 'What turns E Phrygian into Phrygian dominant?',
      options: [
        { text: 'A major home chord: {n:G#}, not {n:G}', correct: true },
        { text: 'A raised second: {n:F#}', why: 'The flat second, {n:F}, stays. It is the half step that falls home.' },
        { text: 'A flat fifth: {n:Bb}', why: 'A flat fifth would be Locrian\'s colour, not flamenco\'s.' },
      ],
      explain: 'Flamenco\'s home chord {c:E} has {n:G#}, a major third. With it, E Phrygian becomes {n:E} {n:F} {n:G#} {n:A} {n:B} {n:C} {n:D}: Phrygian dominant.',
      fact: 'phrygian-dominant-flamenco',
    },
    {
      type: 'chord-build',
      task: 'missing-note',
      chord: 'E',
      given: ['E', 'B'],
      options: ['G#', 'G', 'A', 'F#'],
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['Am', 'G', 'F', 'E'], tempo: 80 }, label: 'Hear the Andalusian cadence' },
      prompt: 'The cadence ends on {c:E}: {n:E}, {n:B} and which third?',
      explain: '{c:E} is major, so its third is {n:G#}: the note that makes the scale Phrygian dominant.',
    },
    techniqueTask({
      id: 'rasgueado',
      title: 'Rasgueado on E, then A minor',
      exercise: 'tech-rasgueado',
      minutes: 5,
      body: 'Rasgueado Basics: little, ring, middle and index fingers flicked out one after another, then an upstroke with i. On {c:E}, then {c:Am}, from 52 BPM up the ladder. A few minutes at a time; stop if the wrist or the back of the hand aches.',
      tip: 'Flick from the finger joints with the wrist loose. Four separate strokes, like a short drum roll.',
    }),
    {
      type: 'tap-rhythm',
      prompt: 'The fan: four even sixteenths, then a quarter-note upstroke. Twice.',
      rhythm: { pattern: 's s s s q s s s s q' },
      tempo: 60,
      show: 'both',
      explain: 'Little, ring, middle, index as four sixteenths on the beat, then the upstroke on the next beat. Even, not a blur.',
    },
    playerTask({
      id: 'study-phrygian',
      title: 'Mode Study: A Phrygian',
      song: 'st-mode-phrygian',
      tempo: 75,
      minutes: 4,
      body: 'About 72 BPM, then 100 % (96 BPM). The backing strums 3+3+2. The ending, {n:Bb} falling to A over {c:Bb} to {c:Am}, is the Phrygian cadence.',
    }),
    playerTask({
      id: 'andalusian',
      title: 'Andalusian Cadence with Rasgueado',
      song: 'st-andalusian-cadence',
      minutes: 5,
      body: 'At 80 BPM, in 3/4: the fan on beat 1, the thumb on 2 and 3, over {c:Am} {c:G} {c:F} {c:E}. Then choose the Melody under Parts and play bars 9 to 16, the E Phrygian melody, which closes with {n:F} falling a half step to {n:E}.',
    }),
    {
      type: 'true-false',
      statement: 'Locrian also has a flat second, but its flat fifth makes it a different world.',
      answer: true,
      explain: 'Phrygian and Locrian share the flat second. Locrian\'s flat fifth makes its home chord diminished, which Phrygian\'s is not.',
    },
    { generate: 'scale-ear', params: { scales: ['phrygian', 'minor'] } },
  ],
  facts: [
    { id: 'phrygian-flat-two', front: 'A Phrygian: its notes and its colour?', back: '{n:A} {n:Bb} {n:C} {n:D} {n:E} {n:F} {n:G}. The colour is the flat second, {n:Bb}, falling to the root.' },
    { id: 'phrygian-dominant-flamenco', front: 'Why is flamenco\'s scale Phrygian dominant?', back: 'Its home chord is major ({c:E} with {n:G#}), so E Phrygian gets a major third: {n:E} {n:F} {n:G#} {n:A} {n:B} {n:C} {n:D}.' },
  ],
};

// ── 5. Locrian, the unstable mode ───────────────────────────────────────────────────────────────

const locrian: TeacherLesson = {
  id: 'locrian',
  title: 'Locrian, the unstable mode',
  teaches: 'Locrian\'s home chord is diminished, so it never settles: use it sparingly, over a half-diminished vamp.',
  minutes: 4,
  skill: 'teacher:elena:locrian',
  steps: [
    {
      type: 'card',
      title: 'The mode that never settles',
      body: 'Locrian has a flat second and a flat fifth, so its home chord is diminished: it never quite settles, which is why so little music stays there. A Locrian: {n:A} {n:Bb} {n:C} {n:D} {n:Eb} {n:F} {n:G}.',
      figure: { kind: 'fretboard', frets: [LOCRIAN.minFret, LOCRIAN.maxFret], dots: colourDots(LOCRIAN, ['Bb', 'Eb']), caption: 'A Locrian in fifth position, {n:Bb} and {n:Eb} marked.' },
    },
    {
      type: 'chord-build',
      task: 'missing-note',
      chord: 'Am7b5',
      given: ['A', 'C', 'G'],
      options: ['Eb', 'E', 'D', 'F'],
      prompt: 'The home chord, {c:Am7b5}: {n:A}, {n:C}, {n:G} and which fifth?',
      explain: 'A flat fifth, {n:Eb}: {c:Am7b5} is {n:A} {n:C} {n:Eb} {n:G}, a {t:half-diminished} chord. With {n:E} it would be a stable {c:Am7}.',
      fact: 'locrian-home-diminished',
    },
    {
      type: 'card',
      title: 'Black, used on purpose',
      body: 'Over {c:Am7b5} (x0101x) to {c:Bbmaj7} (x1323x) you can hear it as a colour: dark, suspended and uneasy. Use it the way a painter uses black: sparingly and on purpose.',
      figure: { kind: 'chord', symbol: 'Am7b5', frets: 'x0101x', caption: '{c:Am7b5}: open A, then {n:Eb}, {n:G} and {n:C}.' },
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'Bbmaj7',
      frets: 'x1323x',
      accept: 'this-shape',
      prompt: 'Build the vamp\'s second chord, {c:Bbmaj7} (x1323x).',
      explain: 'String 5 fret 1 {n:Bb}, string 4 fret 3 {n:F}, string 3 fret 2 {n:A}, string 2 fret 3 {n:D}. Its root is Locrian\'s flat second.',
    },
    {
      type: 'listen-choice',
      prompt: 'A scale from A. Phrygian or Locrian? Listen to the fifth.',
      sound: { kind: 'scale', tonic: 'A3', scale: 'locrian', direction: 'up', tempo: 100 },
      options: [{ text: 'Phrygian' }, { text: 'Locrian', correct: true }],
      shuffle: false,
      explain: 'The fifth was {n:Eb}, flattened: Locrian. Phrygian keeps a perfect fifth, {n:E}, and with it a home you can rest on.',
    },
    playerTask({
      id: 'study-locrian',
      title: 'Mode Study: A Locrian',
      song: 'st-mode-locrian',
      tempo: 79,
      minutes: 4,
      body: 'About 66 BPM. Fifth position: {n:Eb} is string 3 fret 8, {n:Bb} is string 1 fret 6. The melody leans on one or the other on ten strong beats, and ends with {n:Bb} falling to A.',
    }),
    {
      type: 'fretboard-name',
      prompt: 'The root (R) is {n:A}. Which degree is the marked note?',
      position: { string: 3, fret: 8 },
      root: { string: 4, fret: 7 },
      ask: 'degree',
      spelling: 'any',
      options: ['b5', '5', '4', 'b6'],
      explain: 'String 3 fret 8, six half steps above {n:A}: in Locrian it is the flat fifth, {n:Eb}. The same fret was Lydian\'s {n:D#}: the mode names the note.',
    },
    {
      type: 'true-false',
      statement: 'Locrian makes a comfortable home key for a whole song.',
      answer: false,
      explain: 'Its home chord is diminished, so it never settles. Used briefly, as a colour, it is very effective; as a home, it is homeless.',
      fact: 'locrian-home-diminished',
    },
    toolTask({
      id: 'jam-locrian',
      title: 'Jam: A Locrian with the band',
      tool: 'progressions',
      params: ['locrian-i-bii', 'a', 'jam'],
      minutes: 4,
      body: 'Over {c:Am7b5} to {c:Bbmaj7} at 66 BPM. Short phrases, {n:Eb} over the first chord and {n:Bb} over the second, and plenty of silence between them.',
    }),
    { generate: 'scale-ear', params: { scales: ['phrygian', 'locrian'] } },
  ],
  facts: [
    { id: 'locrian-home-diminished', front: 'Why does so little music stay in Locrian?', back: 'Its flat second and flat fifth make the home chord diminished ({c:Am7b5} in A): it never settles.' },
    { id: 'locrian-vamp', front: 'Which vamp lets you hear A Locrian as a colour?', back: '{c:Am7b5} (x0101x) to {c:Bbmaj7} (x1323x): {n:Eb} over the first, {n:Bb} over the second, used sparingly.' },
  ],
};

// ── 6. Compose in a mode ────────────────────────────────────────────────────────────────────────

const LYDIAN_PHRASE: TabNote[] = [t(2, 4, 'h'), t(2, 5, 'q'), t(2, 7, 'q'), t(2, 4, 'h'), t(2, 5, 'h'), t(1, 5, 'w')];

const modalComposition: TeacherLesson = {
  id: 'modal-composition',
  title: 'Compose in a mode',
  teaches: 'A mode needs the chord holding its colour note and no strong pull home; the melody lands on that note.',
  minutes: 5,
  skill: 'teacher:elena:modal-composition',
  steps: [
    {
      type: 'card',
      title: 'Harmony makes the mode',
      body: 'A mode lives or dies by its harmony: the chord that contains the defining note must be there, and the strong {r:V}-to-{r:I} pull of major and minor must not be. {r:I} to {r:II} for Lydian, {r:i} to {r:IV} for Dorian, {r:I} to {r:bVII} for Mixolydian, {r:i} to {r:bII} for Phrygian.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each mode with the vamp that defines it.',
      pairs: [
        { left: 'Lydian', right: '{r:I} to {r:II}' },
        { left: 'Dorian', right: '{r:i} to {r:IV}' },
        { left: 'Mixolydian', right: '{r:I} to {r:bVII}' },
        { left: 'Phrygian', right: '{r:i} to {r:bII}' },
      ],
      explain: 'In each vamp the second chord holds the colour note: {r:II} the raised fourth, {r:IV} the major sixth, {r:bVII} the flat seventh, {r:bII} the flat second.',
      fact: 'modal-vamps',
    },
    {
      type: 'card',
      title: 'The four vamps on A',
      body: 'Lydian: {c:A} to {c:B}. Dorian: {c:Am} to {c:D}. Mixolydian: {c:A} to {c:G}. Phrygian: {c:Am} to {c:Bb}. Each second chord holds the colour note: {n:D#}, {n:F#}, {n:G}, {n:Bb}.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['A', 'B', 'A', 'B'], tempo: 72 }, label: 'Hear the Lydian vamp' },
    },
    {
      type: 'choice',
      prompt: 'Which chord would wreck an A Mixolydian vamp?',
      options: [
        { text: '{c:E7}', correct: true },
        { text: '{c:G}', why: '{c:G} is the vamp\'s own {r:bVII}: it carries the colour note.' },
        { text: '{c:D}', why: '{n:D}, {n:F#} and {n:A} are all in A Mixolydian. Harmless.' },
        { text: '{c:Em}', why: '{n:E}, {n:G}, {n:B}: all Mixolydian, and minor, so no pull home.' },
      ],
      explain: '{c:E7} brings {n:G#}, the leading note, and the {r:V7}-to-{r:I} pull of plain major. The {n:G} that made the mode is gone.',
      fact: 'modal-vamps',
    },
    {
      type: 'card',
      title: 'Write it',
      body: 'Write a two-chord vamp, then a 16-bar melody over it that lands on the colour note at least four times on strong beats and ends on the tonic. Four phrases of four bars. Silence is allowed; it is even encouraged.',
    },
    toolTask({
      id: 'build-vamp',
      title: 'Build your vamp',
      tool: 'progressions',
      params: ['builder'],
      minutes: 6,
      body: 'Choose a mode. In the builder, make its vamp on A: two chords, two bars each. Then write the 16-bar melody on paper, four phrases of four bars, marking every strong beat that carries the colour note. There must be at least four.',
    }),
    {
      type: 'true-false',
      statement: 'A melody that puts the colour note only on weak beats will still make the mode obvious.',
      answer: false,
      explain: 'On weak beats it passes unnoticed. Land it on strong beats, at least four times, and the listener hears the mode rather than plain major or minor.',
      fact: 'colour-on-strong-beats',
    },
    toolTask({
      id: 'play-your-piece',
      title: 'Play your piece with the band',
      tool: 'progressions',
      params: ['lydian-i-ii', 'a', 'jam'],
      minutes: 6,
      body: 'This opens the Lydian vamp on A; for another mode, open its vamp from the Modal family in Progressions, in A. Play your 16 bars, and record a performance on your phone: I listen for the colour note on strong beats and a clear tonic.',
    }),
    {
      type: 'play-phrase',
      prompt: 'A model opening in A Lydian: {n:D#} on beat 1 of two bars, then home to A.',
      notes: LYDIAN_PHRASE,
      octave: 'exact',
      tempo: 72,
      explain: '{n:D#} {n:E} {n:F#}, {n:D#} {n:E}, then {n:A}: the colour note on the two strong first beats, and an unmistakable tonic at the end.',
      alternative: {
        type: 'order',
        prompt: 'Put the model Lydian phrase in order: colour note first, tonic last.',
        tiles: ['{n:D#}', '{n:E}', '{n:F#}', '{n:D#}', '{n:E}', '{n:A}'],
        distractors: ['{n:D}'],
        explain: '{n:D#} {n:E} {n:F#}, {n:D#} {n:E}, {n:A}. {n:D} natural would undo the Lydian colour.',
      },
    },
    {
      type: 'choice',
      prompt: 'Your Dorian piece ends on the {c:D} chord. What does the listener hear?',
      options: [
        { text: 'No clear home: end on {c:Am} instead', correct: true },
        { text: 'A strong Dorian ending', why: 'Ending on {c:D} leaves A in doubt; the vamp could be heading to {k:G major}.' },
        { text: 'A perfect cadence', why: 'There is no {r:V}-to-{r:I} here, by design.' },
      ],
      explain: 'A modal piece ends on its tonic, or the home is in doubt. Finish on {c:Am} and the {n:F#} you leaned on is heard as Dorian\'s sixth.',
    },
  ],
  facts: [
    { id: 'modal-vamps', front: 'The vamps that define Lydian, Dorian, Mixolydian and Phrygian?', back: '{r:I} to {r:II}, {r:i} to {r:IV}, {r:I} to {r:bVII}, {r:i} to {r:bII}: the second chord holds the colour note, and there is no {r:V}-to-{r:I} pull.' },
    { id: 'colour-on-strong-beats', front: 'How does a melody make a mode heard?', back: 'It lands on the colour note on strong beats, at least four times in 16 bars, and ends on the tonic.' },
  ],
};

/** Unit 2 of Prof. Varga's course. */
const unit: TeacherUnit = {
  id: 'elena-modes',
  title: 'The modes in practice',
  theme: 'scales',
  description: 'Hear each mode as a colour, improvise in all seven over vamps that define them, and compose in one.',
  lessons: [modesAsColours, dorianAndAeolian, mixolydianAndLydian, phrygianAndFlamenco, locrian, modalComposition],
  checkpoint: { sample: 8, maxMistakes: 2 },
  glossary: [
    { id: 'colour-note', term: 'colour note', definition: 'The note that sets a mode apart from plain major or minor: Dorian\'s major sixth, Lydian\'s raised fourth, Mixolydian\'s flat seventh.' },
    { id: 'drone', term: 'drone', definition: 'A note held or repeated under the music, so that every other note is heard against it.' },
    { id: 'vamp', term: 'vamp', definition: 'A short chord pattern, often two chords, repeated for as long as the soloist needs.' },
    { id: 'phrygian-dominant', term: 'Phrygian dominant', definition: 'Phrygian with a major third: the scale over flamenco\'s major home chord. On E: {n:E} {n:F} {n:G#} {n:A} {n:B} {n:C} {n:D}.' },
    { id: 'rasgueado', term: 'rasgueado', definition: 'The flamenco strum: the fingers flick out across the strings one after another, a quick roll of separate strokes.' },
    { id: 'half-diminished', term: 'half-diminished', definition: 'A seventh chord of root, minor third, flat fifth and minor seventh: {c:Am7b5} is {n:A} {n:C} {n:Eb} {n:G}.' },
  ],
};

export default unit;
