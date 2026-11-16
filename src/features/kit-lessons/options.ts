/**
 * Samples of the lesson options added in the second integration pass, for the gallery
 * (`#kit-lessons--options`) and its browser check (`e2e/lessons-fixes.cjs`): play steps labelled by
 * place, read from a staff or with the box hidden; chord boxes as options without their names;
 * rhythms as options; strings in fretboard-find; long words in match pairs; spelled phrases; and
 * the figures that had trouble on phones (a nine-key keyboard, a 0–12 neck, a neck with a capo).
 */
import type { CardStep, Exercise, Figure, TabNote } from '@/lessons';

const explain = 'This sample shows how the lesson player draws the option.';
const tapIt = { type: 'true-false' as const, statement: 'You can answer this one by tapping.', answer: true, explain: 'The tapping version of the step.' };
const q = (string: number, fret: number): TabNote => ({ string, fret, duration: 'q' });

/** Exercises that use the new options, by id (slug-safe: `#kit-lessons--try--opt-<id>`). */
export const OPTION_EXERCISES: Record<string, Exercise> = {
  'play-note-place': {
    type: 'play-note', prompt: 'Play the open low string.', note: 'E2', octave: 'exact', where: { string: 6, fret: 0 }, labels: 'place',
    explain: 'String 6 played open is {n:E}, the lowest note of the guitar.', alternative: { type: 'fretboard-find', prompt: 'Tap the open low string.', find: { note: 'E2' }, mode: 'one', octave: 'exact', frets: [0, 3], explain: 'String 6, open.' },
  },
  'play-note-staff': {
    type: 'play-note', prompt: 'Read this note on the staff and play it.', note: 'G3', octave: 'exact', staffOnly: true,
    explain: 'The note on the second line is {n:G}: the open 3rd string.', alternative: tapIt,
  },
  'play-phrase-a-major': {
    type: 'play-phrase', prompt: 'Play the first notes of {k:A major}.', notes: [q(5, 0), q(5, 2), q(5, 4), q(4, 0), q(4, 2), q(4, 4), q(3, 1), q(3, 2)], octave: 'exact', tempo: 80,
    explain: '{k:A major} has three sharps: {n:F#}, {n:C#} and {n:G#}.', alternative: tapIt,
  },
  'play-phrase-place': {
    type: 'play-phrase', prompt: 'Play these places in order.', notes: [q(6, 0), q(6, 3), q(5, 0), q(5, 2)], octave: 'exact', labels: 'place', tempo: 70,
    explain: 'Open low string, fret 3, then string 5 open and fret 2.', alternative: tapIt,
  },
  'play-phrase-staff': {
    type: 'play-phrase', prompt: 'Read this line on the staff and play it.', notes: [q(3, 0), q(3, 2), q(2, 0), q(2, 1)], octave: 'exact', staffOnly: true, tempo: 70,
    explain: 'G, A, B and C: up the 3rd and 2nd strings.', alternative: tapIt,
  },
  'play-chord-fingers': {
    type: 'play-chord', prompt: 'Strum {c:C} with these fingers.', chord: 'C', frets: 'x32010', fingers: 'x32010', explain: 'Fingers 3, 2 and 1 walk down from string 5.', alternative: tapIt,
  },
  'play-chord-hidden': {
    type: 'play-chord', prompt: 'Find {c:G} on the neck yourself, then strum it.', chord: 'G', hideDiagram: true, explain: 'The box shows the shape you just played.', alternative: tapIt,
  },
  'play-chord-capo': {
    type: 'play-chord', prompt: 'Capo on fret 2: play the {c:G} shape. It sounds as {c:A}.', chord: 'A', frets: '320003', capo: 2, explain: 'Two frets up from {c:G} is {c:A}.', alternative: tapIt,
  },
  'choice-chords': {
    type: 'choice', prompt: 'Which box is {c:G}?', explain: '{c:G} is the shape with fret 3 on both E strings.',
    options: [{ figure: { kind: 'chord', symbol: 'G' }, correct: true }, { figure: { kind: 'chord', symbol: 'C' } }, { figure: { kind: 'chord', symbol: 'D' } }],
  },
  'choice-rhythms': {
    type: 'choice', prompt: 'Which rhythm has eighth notes on beat 2?', explain: 'Two eighth notes share beat 2: "2 &".',
    options: [{ figure: { kind: 'rhythm', pattern: 'q e e q q' }, correct: true }, { figure: { kind: 'rhythm', pattern: 'q q e e q' } }, { figure: { kind: 'rhythm', pattern: 'e e q q q' } }],
  },
  'listen-slow': {
    type: 'listen-choice', prompt: 'Does the melody go up or down?', sound: { kind: 'notes', notes: ['C3', 'D3', 'E3', 'G3'], tempo: 90 }, shuffle: false,
    options: [{ text: 'Up', correct: true }, { text: 'Down' }], explain: 'Each note is higher than the one before.',
  },
  'tap-no-count': {
    type: 'tap-rhythm', prompt: 'Tap this rhythm with the click.', rhythm: { pattern: 'q q h' }, tempo: 80, show: 'notation', counting: false, explain: 'Two short notes and a long one.',
  },
  'tap-triplets': {
    type: 'tap-rhythm', prompt: 'Tap the triplet, then the beats.', rhythm: { pattern: 'et et et q h' }, tempo: 70, show: 'both', explain: 'Three even notes fill beat 1, then beats 2 and 3.',
  },
  'find-strings': {
    type: 'fretboard-find', prompt: 'Tap {n:A} on string 6.', find: { note: 'A' }, mode: 'one', octave: 'any', frets: [0, 7], strings: [6], explain: 'String 6, fret 5 is {n:A}.',
  },
  'find-chord': {
    type: 'fretboard-find', prompt: 'Tap one note of {c:A} on the top three strings.', find: { chord: 'A' }, mode: 'one', octave: 'any', frets: [5, 9], strings: [1, 2, 3], explain: '{c:A} is {n:A}, {n:C#} and {n:E}.',
  },
  'match-long': {
    type: 'match-pairs', prompt: 'Match each chord quality with its sound.', explain: 'Each quality has its own colour.',
    pairs: [
      { left: 'Augmented', right: 'Stretched, unresolved' },
      { left: 'Diminished', right: 'Tense, crowded' },
      { left: 'Suspended', right: 'Open, waiting' },
      { left: 'Dominant', right: 'Wants to go home' },
      { left: 'Half-diminished', right: 'Dark and restless' },
      { left: 'Major seventh', right: 'Dreamy, soft' },
    ],
  },
  'chord-build-am': { type: 'chord-build', task: 'fingers', chord: 'Am', prompt: 'Build {c:Am} on the fretboard.', explain: '{c:Am} is {n:A}, {n:C} and {n:E}.' },
  'chord-build-slash': { type: 'chord-build', task: 'fingers', chord: 'C/G', prompt: 'Build {c:C/G}: {c:C} with {n:G} in the bass.', explain: 'The lowest note must be {n:G}.' },
};

/** Figures that had trouble on phones, by id. */
export const OPTION_FIGURES: Record<string, Figure> = {
  'keyboard-nine': {
    kind: 'keyboard', from: 'C4', to: 'D5',
    keys: [{ note: 'C4', role: 'root', label: 'R' }, { note: 'E4', role: 'third', label: '3' }, { note: 'G4', role: 'fifth', label: '5' }, { note: 'A4', role: 'ghost', label: '6' }, 'D5'],
    caption: 'Nine white keys: the root, third and fifth in their colours, a ghost sixth.',
  },
  'neck-twelve': {
    kind: 'fretboard', frets: [0, 12], derive: { note: 'E' }, caption: 'Every {n:E} from the nut to fret 12.',
  },
  'neck-capo': {
    kind: 'fretboard', capo: 3, dots: [{ string: 6, fret: 3, note: 'Bb' }, { string: 5, fret: 2, note: 'D' }, { string: 1, fret: 3, note: 'Bb' }], caption: 'Shape {c:G} behind a capo at fret 3: it sounds as {c:Bb}.',
  },
  'chord-capo': { kind: 'chord', symbol: 'A', frets: '320003', capo: 2, caption: 'The {c:G} shape at capo 2 sounds as {c:A}.' },
  'tab-a-major': { kind: 'tab', notes: [q(5, 0), q(5, 2), q(5, 4), q(4, 0), q(4, 2), q(4, 4), q(3, 1), q(3, 2)], tempo: 90, caption: 'An {k:A major} line: its notes are named with sharps.' },
  'tab-techniques': {
    kind: 'tab',
    tempo: 80,
    notes: [
      q(3, 5),
      { string: 3, fret: 7, duration: 'e', legato: 'hammer' },
      { string: 3, fret: 5, duration: 'e', legato: 'pull' },
      { string: 2, fret: 5, duration: 'q', slideIn: 'below' },
      { string: 2, fret: 8, duration: 'q', legato: 'slide' },
      { string: 3, fret: 7, duration: 'h', bend: 2, release: true },
      { string: 1, fret: 5, duration: 'h', vibrato: true, slideOut: 'down' },
    ],
    caption: 'A hammer-on, a pull-off, two slides, a full bend and release, and vibrato: each is heard as written.',
  },
  'audio-drone': {
    kind: 'audio',
    sound: { kind: 'scale', tonic: 'D3', scale: 'dorian', drone: { root: 'D2', fifth: true } },
    label: 'Hear the scale over a drone',
    caption: 'Every degree of {n:D} dorian against a held {n:D}: listen for the bright sixth.',
  },
  'audio-over': {
    kind: 'audio',
    sound: { kind: 'notes', notes: ['A3', 'C4', 'D4', 'E4', 'G4', 'A4'], tempo: 100, over: { chord: 'Am' } },
    label: 'Hear the line over {c:Am}',
    caption: 'The {c:Am} chord is held while the minor pentatonic line plays over it.',
  },
};

/** A teaching card whose title uses markup and whose body has punctuation after terms and a hyphenated run. */
export const OPTION_CARD: CardStep = {
  type: 'card',
  title: '{c:Am7} in one grip',
  body: 'Hold a {t:barre}, then lift one finger: that is {c:Am7}. On strings 3-2-1 the frets are 5-5-5, and the shape x-0-2-0-1-0 is its open cousin.',
  tip: 'Keep the thumb behind the neck, not over it.',
};
