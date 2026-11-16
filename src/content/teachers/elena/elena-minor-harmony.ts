/**
 * Prof. Elena Varga, unit 8: Harmonic and melodic minor in practice (plan:
 * `elena/elena-minor-harmony` in src/content/plan/teachers.json).
 *
 * Elena's voice: conservatory rigour, dry humour, high standards, deep respect for the student.
 * Every lesson follows its plan entry: the `explain` on the cards, the `show` as fretboards, chord
 * boxes, staff and tab, the `practice` as in-lesson exercises (every chord or phrase the microphone
 * hears has a tapping alternative) or tasks that send the learner to the Player, Technique, the
 * Metronome, Scales and the jam tracks of Progressions, and back.
 *
 * Where the lessons differ from the plan (see the report): the Rhythm screen has no 12-beat
 * drill, so the cycle is clapped in the lesson (its five accents, as two bars of 6/4) and then
 * counted aloud with the Metronome. The minor-key showpieces and Bach's Prelude need a printed
 * edition, which this project cannot consult: Hungarian Dance No. 5, the Habanera, the Funeral
 * March of a Marionette and the Prelude BWV 999 are not in the library, so their tasks carry
 * fallbacks (the Baroque duo in D minor, the minor line cliche jam in D, whose moving voice is the
 * Habanera's D C# C B, Greensleeves, and the p i m a m i study, an arpeggio over a bass in a
 * minor key), and the Bach lesson teaches how to bring a printed edition in with Scan & Import and
 * learn it in the Player. Its chord-naming drill names chords from their notes in the Prelude's
 * key and in the study's bars, since the Prelude's own bars cannot be shown without an edition.
 * The Habanera's descent is given as its pitches only, as the plan states them.
 *
 * Music from the library: Rondo alla Turca (theme) (`rondo-alla-turca`, 108 BPM), Flamenco
 * Rhythm: the 12-Beat Cycle (`st-solea-compas`, 108 BPM), In the Hall of the Mountain King
 * (`hall-of-the-mountain-king`, 60 to 160 BPM), the technique exercise Rasgueado Basics
 * (`tech-rasgueado`), and as fallbacks `st-duet-baroque`, `greensleeves-melody` and
 * `st-pimami-3-4`. `elena-minor-harmony.test.ts` cross-checks every chord, scale, shape, accent,
 * note, tempo and chart against the engines and the library.
 */
import type { TabNote } from '@/lessons';
import type { TeacherLesson, TeacherUnit } from '../types';
import { playerTask, techniqueTask, toolTask } from '../tasks';

const e = (string: number, fret: number): TabNote => ({ string, fret, duration: 'e' });
const q = (string: number, fret: number): TabNote => ({ string, fret, duration: 'q' });

/** The shapes the unit teaches, low string first. */
export const SHAPES = {
  solea: { E: '022100', F: 'xx3211' },
  melodic: { AmMaj7: 'x02110', D7: 'x57575' },
  cadence: { Am: 'x02210', 'Bb/D': 'xx0331', E7: '020100', F7: '131211' },
} as const;

/** The solea's five accents, clapped: two bars of 6/4, counts 3 and 6, then 8, 10 and 12. */
export const SOLEA_ACCENTS = 'hr q hr q | qr q qr q qr q';

/** The Habanera's opening descent, as the plan gives its pitches, in first position. */
export const HABANERA_DESCENT: TabNote[] = [q(2, 3), q(2, 2), q(2, 1), q(2, 0), q(3, 3), q(3, 2)];

/** The Mountain King theme's second bar as the library has it: the chromatic A# and F. */
export const MOUNTAIN_KING_BAR_2: TabNote[] = [e(5, 1), e(6, 2), q(5, 1), e(5, 0), e(6, 1), q(5, 0)];

/** An original dominant pedal in D minor: the bass holds A under A, Dm/A and A7, then Dm. */
export const PEDAL: TabNote[] = [
  q(5, 0), q(3, 2), q(2, 2), q(1, 0),
  q(5, 0), q(3, 2), q(2, 3), q(1, 1),
  q(5, 0), q(3, 0), q(2, 2), q(1, 0),
  q(4, 0), q(3, 2), q(2, 3), q(1, 1),
];

/** A bar of the p i m a m i study: Dm as one even arpeggio over its bass. */
export const PIMAMI_DM_BAR: TabNote[] = [e(4, 0), e(3, 2), e(2, 3), e(1, 1), e(2, 3), e(3, 2)];

// ── 1. The harmony of harmonic minor ────────────────────────────────────────────────────────────

const harmonicMinorHarmony: TeacherLesson = {
  id: 'harmonic-minor-harmony',
  title: 'The harmony of harmonic minor',
  teaches: 'Raise the seventh of {k:A minor} to {n:G#}: {r:V} becomes {c:E7}, the seventh chord {c:G#dim7}, and {r:bIII} augmented.',
  minutes: 5,
  skill: 'teacher:elena:harmonic-minor-harmony',
  steps: [
    {
      type: 'card',
      title: 'One note, three new chords',
      body: 'Raise the seventh of {k:A minor} to {n:G#} and three things change: the chord on the fifth degree becomes {c:E7}, the chord on the seventh becomes {c:G#dim7}, and the chord on the third, {c:C}, becomes augmented. One note, and the key acquires a dominant with teeth.',
      figure: { kind: 'fretboard', frets: [4, 8], root: 'A', labels: 'degree', derive: { scale: 'harmonic-minor', tonic: 'A' }, caption: '{n:A} harmonic minor in fifth position: {n:G#} is the 7.' },
    },
    {
      type: 'choice',
      prompt: 'In {k:A minor} with the raised seventh, which chord is {r:V7}?',
      options: [
        { text: '{c:E7}', correct: true },
        { text: '{c:Em7}', why: 'That is natural minor\'s {r:v7}, with {n:G}. Raise it to {n:G#} and the chord turns major.' },
        { text: '{c:Emaj7}', why: '{c:Emaj7} needs {n:D#}, which the key does not have.' },
      ],
      explain: '{n:E} {n:G#} {n:B} {n:D}: the {n:G#} makes the triad major, the {n:D} gives it a minor seventh. A dominant seventh, pulling home to {c:Am}.',
      fact: 'hm-changes',
    },
    {
      type: 'card',
      title: 'The seven sevenths',
      body: 'In sevenths: {c:AmMaj7}, {c:Bm7b5}, {c:Cmaj7#5}, {c:Dm7}, {c:E7}, {c:Fmaj7}, {c:G#dim7}. Much minor-key music mixes the two forms: natural minor in the melody, harmonic minor at the cadences.',
      figure: { kind: 'chord', symbol: 'G#dim7', caption: '{c:G#dim7}: {n:G#} {n:B} {n:D} {n:F}, four minor thirds.' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the seventh chords of {n:A} harmonic minor.',
      text: '{c:AmMaj7}  {c:Bm7b5}  ___  {c:Dm7}  ___  {c:Fmaj7}  ___',
      blanks: ['{c:Cmaj7#5}', '{c:E7}', '{c:G#dim7}'],
      bank: ['{c:Cmaj7}', '{c:Em7}', '{c:G7}'],
      explain: 'Every chord holding {n:G} in natural minor now holds {n:G#}: {c:Cmaj7} becomes {c:Cmaj7#5}, {c:Em7} becomes {c:E7}, {c:G7} becomes {c:G#dim7}.',
      fact: 'hm-sevenths',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap every {n:G#} in fifth position, frets 4 to 8.',
      find: { note: 'G#' },
      mode: 'all',
      octave: 'any',
      frets: [4, 8],
      explain: 'Three: string 6 fret 4, string 4 fret 6 and string 1 fret 4. Know where they are before the {c:E7} arrives.',
    },
    {
      type: 'listen-choice',
      prompt: 'Natural minor or harmonic minor?',
      sound: { kind: 'scale', tonic: 'A3', scale: 'harmonic-minor', direction: 'up', tempo: 100 },
      options: [{ text: 'Natural minor' }, { text: 'Harmonic minor', correct: true }],
      shuffle: false,
      explain: 'Listen near the top: {n:F} to {n:G#} is three half steps, the gap that gives harmonic minor its eastern colour, then a half step up to {n:A}.',
    },
    toolTask({
      id: 'jam-minor-cadence',
      title: 'Jam: the minor cadence',
      tool: 'progressions',
      params: ['classical-minor-cadence', 'a', 'jam'],
      minutes: 5,
      body: '{c:Am}, {c:Dm}, {c:E7}, {c:Am} at 66 {t:bpm|BPM}. Natural minor over {c:Am} and {c:Dm}; over {c:E7}, harmonic minor, landing on {n:G#} and letting it rise to {n:A} as {c:Am} returns.',
    }),
    playerTask({
      id: 'rondo',
      title: 'Rondo alla Turca (theme)',
      song: 'rondo-alla-turca',
      tempo: 74,
      minutes: 6,
      body: 'Mozart\'s theme at 74 % (80 {t:bpm|BPM}), then 100 % (108 BPM). Its opening turn, {n:B} {n:A} {n:G#} {n:A}, is the raised seventh at work. Down-up on every sixteenth.',
    }),
    {
      type: 'true-false',
      statement: 'The turn that opens the Rondo alla Turca theme, {n:B} {n:A} {n:G#} {n:A}, uses the raised seventh of {k:A minor}.',
      answer: true,
      explain: '{n:G#} is the leading tone, a half step below {n:A}: the turn circles the tonic from above and below.',
      fact: 'hm-changes',
    },
    playerTask({
      id: 'hungarian-dance',
      title: 'Hungarian Dance No. 5 (theme)',
      song: 'hungarian-dance-5',
      minutes: 6,
      body: 'Brahms\'s theme, a second harmonic-minor showpiece, as a duet with the app on the chords. Mark its sudden slow-downs and speed-ups in your part, then make them yours: exaggerate, then refine.',
      fallback: {
        tool: 'player',
        params: ['st-duet-baroque'],
        title: 'A minor-key duet: the Baroque duo',
        body: 'Hungarian Dance No. 5 needs a printed edition and is not in the library; if you own one, bring it in with Scan & Import (Tools). Meanwhile play the Baroque duo in {k:D minor} with the app on the bass. Find every {n:C#}: its raised seventh.',
      },
    }),
    {
      type: 'match-pairs',
      prompt: 'Match each numeral of {n:A} harmonic minor with its seventh chord.',
      pairs: [
        { left: '{r:V7}', right: '{c:E7}' },
        { left: '{r:vii°7}', right: '{c:G#dim7}' },
        { left: '{r:iiø7}', right: '{c:Bm7b5}' },
        { left: '{r:iv7}', right: '{c:Dm7}' },
      ],
      explain: 'The chords on the fifth and seventh degrees hold {n:G#}; {c:Bm7b5} and {c:Dm7} do not, so they are the same as in natural minor.',
      fact: 'hm-sevenths',
    },
  ],
  facts: [
    { id: 'hm-changes', front: 'What does raising the seventh of {k:A minor} change?', back: 'The fifth-degree chord becomes {c:E7}, the seventh-degree chord {c:G#dim7}, and {c:C} becomes {c:Caug}.' },
    { id: 'hm-sevenths', front: 'The seventh chords of {n:A} harmonic minor?', back: '{c:AmMaj7} {c:Bm7b5} {c:Cmaj7#5} {c:Dm7} {c:E7} {c:Fmaj7} {c:G#dim7}' },
    { id: 'hm-mix', front: 'How does minor-key music often mix the two forms?', back: 'Natural minor in the melody, harmonic minor at the cadences.' },
  ],
};

// ── 2. Phrygian dominant and the solea cycle ────────────────────────────────────────────────────

const phrygianDominantAndSolea: TeacherLesson = {
  id: 'phrygian-dominant-and-solea',
  title: 'Phrygian dominant and the solea cycle',
  teaches: '{n:E} Phrygian dominant is the fifth mode of {n:A} harmonic minor; the solea counts 12, accented 3, 6, 8, 10, 12.',
  minutes: 5,
  skill: 'teacher:elena:phrygian-dominant-and-solea',
  steps: [
    {
      type: 'card',
      title: 'The fifth mode',
      body: 'Start {n:A} harmonic minor on its fifth note: {n:E} {n:F} {n:G#} {n:A} {n:B} {n:C} {n:D}, {t:phrygian-dominant|Phrygian dominant}. Over {c:E} major it sounds instantly Spanish: {n:F} a half step above the root, {n:G#} a major third.',
      figure: { kind: 'fretboard', frets: [0, 4], root: 'E', labels: 'degree', derive: { scale: 'phrygian-dominant', tonic: 'E' }, caption: '{n:E} Phrygian dominant in open position.' },
    },
    {
      type: 'choice',
      prompt: '{n:E} Phrygian dominant is a mode of which scale?',
      options: [
        { text: '{n:A} harmonic minor', correct: true },
        { text: '{n:A} natural minor', why: 'Its fifth mode is plain {n:E} Phrygian, with {n:G}. Phrygian dominant has {n:G#}.' },
        { text: '{n:E} harmonic minor', why: 'That starts on {n:E} but has {n:F#} and {n:G}, not {n:F} and {n:G#}.' },
      ],
      explain: '{n:A} {n:B} {n:C} {n:D} {n:E} {n:F} {n:G#}, started on {n:E}. Its chord is the {c:E} of the minor cadence: Phrygian dominant is the dominant\'s own mode.',
      fact: 'pd-e',
    },
    {
      type: 'card',
      title: 'Twelve beats',
      body: 'The {t:solea|solea} {t:compas|compas} counts 12 beats with accents on 3, 6, 8, 10 and 12: groups of 3, 3, 2, 2 and 2. Clap it before you play it, counting aloud. Here are the accents alone, as two bars of six.',
      figure: { kind: 'rhythm', pattern: SOLEA_ACCENTS, time: '6/4', tempo: 100, caption: 'Counts 3 and 6, then 8, 10 and 12.' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Count the 12 beats aloud and tap only the accents: 3, 6, 8, 10, 12.',
      rhythm: { pattern: SOLEA_ACCENTS, time: '6/4' },
      tempo: 100,
      show: 'both',
      explain: 'Two groups of three, then three of two: the accent comes round faster in the second half. That acceleration is the solea\'s tension.',
      fact: 'solea-accents',
    },
    {
      type: 'choice',
      prompt: 'How do the 12 counts of the solea group?',
      options: [
        { text: '3, 3, 2, 2, 2', correct: true },
        { text: '3, 3, 3, 3', why: 'That is 12/8, four even groups: the accents would fall on 3, 6, 9 and 12.' },
        { text: '2, 2, 2, 3, 3', why: 'The long groups come first: the accents on 3 and 6, then every second count.' },
      ],
      explain: 'Accents on 3, 6, 8, 10 and 12: each closes a group, three counts, three, then two, two, two.',
      fact: 'solea-accents',
    },
    {
      type: 'card',
      title: 'Rasgueado on the accents',
      body: 'In the study {c:E} (022100) is home and {c:F} (xx3211) pulls back to it on count 10. {t:rasgueado|Rasgueado} on the accents, soft thumb strokes in between.',
      figure: { kind: 'chord', symbol: 'F', frets: SHAPES.solea.F, caption: '{c:F}: the half step above home.' },
    },
    {
      type: 'play-chord',
      prompt: '{c:E}: 022100. Home.',
      chord: 'E',
      frets: SHAPES.solea.E,
      explain: '{n:E} {n:B} {n:E} {n:G#} {n:B} {n:E}: the {n:G#} is the major third that makes the mode Phrygian dominant.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'E', frets: SHAPES.solea.E, accept: 'this-shape', prompt: 'Build open {c:E}.', explain: '022100: fret 2 on strings 5 and 4, fret 1 on string 3.' },
    },
    {
      type: 'play-chord',
      prompt: '{c:F}: xx3211. The tension, a half step up.',
      chord: 'F',
      frets: SHAPES.solea.F,
      explain: '{n:F} {n:A} {n:C} {n:F}: built on the second note of the mode, {n:F}, it falls back to {c:E}.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'F', frets: SHAPES.solea.F, accept: 'this-shape', prompt: 'Build the small {c:F}.', explain: 'xx3211: string 4 fret 3, string 3 fret 2, strings 2 and 1 at fret 1.' },
    },
    techniqueTask({
      id: 'rasgueado',
      title: 'Rasgueado Basics',
      exercise: 'tech-rasgueado',
      minutes: 5,
      body: 'The four-finger fan, on {c:E}, then {c:Am}: each finger flicks out after the one before, then an upstroke with i. Short sessions; the wrist stays loose.',
      tip: 'An aching wrist or the back of the hand: stop for today. Flick from the finger joints only.',
    }),
    {
      type: 'true-false',
      statement: 'In {n:E} Phrygian dominant, {n:F} sits a half step above the root.',
      answer: true,
      explain: 'The flat second, {n:F}, string 6 fret 1, leans down onto {n:E}. With {n:G#} above it, that half step is the Spanish sound.',
      fact: 'pd-e',
    },
    toolTask({
      id: 'count-the-cycle',
      title: 'Metronome: count the cycle aloud',
      tool: 'metronome',
      minutes: 3,
      body: 'Set 3/4 at 72 {t:bpm|BPM}: four bars make one cycle of 12. Clap every count, counting aloud, louder on 3, 6, 8, 10 and 12. Five cycles without a slip, then 96.',
    }),
    playerTask({
      id: 'solea-study',
      title: 'Flamenco Rhythm: the 12-Beat Cycle',
      song: 'st-solea-compas',
      tempo: 75,
      minutes: 6,
      body: 'At 75 % (81 {t:bpm|BPM}): rasgueado on the accents, thumb strokes in between. When the cycle feels like a wheel, 100 % (108 BPM). Then the falseta at the end, in {n:E} Phrygian.',
    }),
    {
      type: 'fretboard-find',
      prompt: 'Tap every {n:F} from the open strings to fret 4: the note that makes it Spanish.',
      find: { note: 'F' },
      mode: 'all',
      octave: 'any',
      frets: [0, 4],
      explain: 'Three: string 6 fret 1, string 4 fret 3 and string 1 fret 1. Each one wants to fall a half step to {n:E}.',
    },
    toolTask({
      id: 'jam-falseta',
      title: 'Jam: a falseta of your own',
      tool: 'progressions',
      params: ['flamenco-phrygian-vamp', 'e', 'jam'],
      minutes: 6,
      body: '{c:E} and {c:F} at 96 {t:bpm|BPM}. Compose a short {t:falseta|falseta} in {n:E} Phrygian dominant: two bars, {n:F} falling to {n:E}, {n:G#} over the {c:E}. Play it the same way three times running.',
    }),
    {
      type: 'choice',
      prompt: 'Over the {c:F} chord of the vamp, which note of the mode is its root?',
      options: [
        { text: '{n:F}, the flat second', correct: true },
        { text: '{n:G#}, the third', why: '{n:G#} is the third of {c:E}. Over {c:F} it clashes with the chord\'s {n:A}: save it for the {c:E} bars.' },
        { text: '{n:B}, the fifth', why: '{n:B} is the fifth of {c:E}, not part of {c:F}.' },
      ],
      explain: '{c:F} is built on the mode\'s second note: the half step above home. Its pull back down to {c:E} is the cadence of flamenco.',
      fact: 'pd-e',
    },
  ],
  facts: [
    { id: 'pd-e', front: '{n:E} Phrygian dominant, and where it comes from?', back: '{n:E} {n:F} {n:G#} {n:A} {n:B} {n:C} {n:D}: the fifth mode of {n:A} harmonic minor.' },
    { id: 'solea-accents', front: 'The accents of the 12-beat solea cycle?', back: '3, 6, 8, 10 and 12: groups of 3, 3, 2, 2 and 2.' },
  ],
};

// ── 3. The harmony of melodic minor ─────────────────────────────────────────────────────────────

const melodicMinorHarmony: TeacherLesson = {
  id: 'melodic-minor-harmony',
  title: 'The harmony of melodic minor',
  teaches: 'Jazz melodic minor, the same both ways, gives {c:AmMaj7} as its dark tonic and {c:D7} as a bright {r:IV7}.',
  minutes: 5,
  skill: 'teacher:elena:melodic-minor-harmony',
  steps: [
    {
      type: 'card',
      title: 'The same both ways',
      body: 'Melodic minor as jazz uses it, with the same notes going up and down, is {n:A} {n:B} {n:C} {n:D} {n:E} {n:F#} {n:G#}: natural minor with its sixth and seventh raised. Classical theory lowers them again on the way down; jazz does not bother.',
      figure: { kind: 'fretboard', frets: [4, 8], root: 'A', labels: 'degree', derive: { scale: 'melodic-minor', tonic: 'A' }, caption: '{n:A} melodic minor in fifth position: {n:F#} and {n:G#}.' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete {n:A} melodic minor, as jazz plays it.',
      text: '{n:A}  {n:B}  {n:C}  {n:D}  {n:E}  ___  ___',
      blanks: ['{n:F#}', '{n:G#}'],
      bank: ['{n:F}', '{n:G}'],
      explain: 'The sixth and seventh raised: {n:F#} and {n:G#}. Only the third, {n:C}, still says minor.',
      fact: 'mm-a',
    },
    {
      type: 'card',
      title: 'Its chords',
      body: 'Its sevenths: {c:AmMaj7}, {c:Bm7}, {c:Cmaj7#5}, {c:D7}, {c:E7}, {c:F#m7b5}, {c:G#m7b5}. The tonic chord, {c:AmMaj7}, is dark and cinematic; {r:IV7}, {c:D7}, adds a bright, bluesy lift in a minor key.',
      figure: { kind: 'chord', symbol: 'AmMaj7', frets: SHAPES.melodic.AmMaj7, caption: '{c:AmMaj7}: {n:A} {n:E} {n:G#} {n:C} {n:E}.' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each numeral of {n:A} melodic minor with its chord.',
      pairs: [
        { left: '{r:imaj7}', right: '{c:AmMaj7}' },
        { left: '{r:ii7}', right: '{c:Bm7}' },
        { left: '{r:IV7}', right: '{c:D7}' },
        { left: '{r:V7}', right: '{c:E7}' },
      ],
      explain: '{n:F#} turns {c:Bm7b5} into {c:Bm7} and {c:Dm7} into {c:D7}; {n:G#} gives {c:AmMaj7} and {c:E7}.',
      fact: 'mm-sevenths',
    },
    {
      type: 'play-chord',
      prompt: '{c:AmMaj7}: x02110.',
      chord: 'AmMaj7',
      frets: SHAPES.melodic.AmMaj7,
      explain: '{n:G#} on string 3 fret 1 against the minor third, {n:C}: the dark, cinematic tonic.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'AmMaj7', frets: SHAPES.melodic.AmMaj7, accept: 'this-shape', prompt: 'Build {c:AmMaj7} in open position.', explain: 'x02110: {n:A} {n:E} {n:G#} {n:C} {n:E}.' },
    },
    {
      type: 'play-chord',
      prompt: '{c:D7}: x57575.',
      chord: 'D7',
      frets: SHAPES.melodic.D7,
      explain: '{n:D} {n:A} {n:C} {n:F#} {n:A}: the {n:F#} on string 2 fret 7 is melodic minor\'s raised sixth, and the source of the lift.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'D7', frets: SHAPES.melodic.D7, accept: 'this-shape', prompt: 'Build {c:D7} with its root on string 5, fifth fret.', explain: 'x57575: frets 5 and 7 alternating, from string 5 to string 1.' },
    },
    {
      type: 'listen-choice',
      prompt: 'Which tonic chord: {c:Am7} or {c:AmMaj7}?',
      sound: { kind: 'chord', chord: 'AmMaj7', voicing: 'close', octave: 3 },
      options: [{ text: '{c:Am7}' }, { text: '{c:AmMaj7}', correct: true }],
      shuffle: false,
      explain: 'The top note, {n:G#}, sits a half step under the octave and never settles: {c:AmMaj7}. {c:Am7}\'s {n:G} is softer and rests.',
    },
    {
      type: 'true-false',
      statement: 'In jazz, melodic minor comes down with {n:G} and {n:F}, as in classical theory.',
      answer: false,
      explain: 'Jazz keeps {n:F#} and {n:G#} both ways. The descending form with {n:G} and {n:F} is simply natural minor.',
      fact: 'mm-a',
    },
    toolTask({
      id: 'scales-melodic',
      title: 'Scales: A melodic minor, two places',
      tool: 'scales',
      params: ['a', 'melodic-minor', 'caged-e'],
      minutes: 5,
      body: '{n:A} melodic minor in fourth position, then change the shape to the D shape, seventh position. Set Underneath to Band: it vamps {c:AmMaj7} to {c:Am6}. Dwell on {n:F#} and {n:G#}.',
    }),
    toolTask({
      id: 'jam-line-melodic',
      title: 'Jam: melodic minor and Dorian',
      tool: 'progressions',
      params: ['line-minor-down', 'a', 'jam'],
      minutes: 5,
      body: 'The minor line cliche in {n:A} at 66 {t:bpm|BPM}: melodic minor over the {c:AmMaj7} bar, {n:A} Dorian over the {c:Am7} and {c:Am6} bars. One note decides: {n:G#}, then {n:G}.',
    }),
    {
      type: 'choice',
      prompt: 'Over the {c:Am7} bar of the minor line cliche, why play Dorian rather than melodic minor?',
      options: [
        { text: 'Melodic minor\'s {n:G#} clashes with the chord\'s {n:G}', correct: true },
        { text: 'Dorian has no {n:F#}', why: 'It has: {n:A} Dorian is {n:A} {n:B} {n:C} {n:D} {n:E} {n:F#} {n:G}. It has {n:G} where melodic minor has {n:G#}.' },
        { text: 'Melodic minor is only for ascending lines', why: 'Not in jazz: it is the same both ways.' },
      ],
      explain: '{n:A} Dorian and {n:A} melodic minor differ in one note: {n:G} or {n:G#}. Follow the chord: {n:G#} over {c:AmMaj7}, {n:G} over {c:Am7}.',
      fact: 'mm-over-line',
    },
  ],
  facts: [
    { id: 'mm-a', front: '{n:A} melodic minor, as jazz uses it?', back: '{n:A} {n:B} {n:C} {n:D} {n:E} {n:F#} {n:G#}, the same going up and down.' },
    { id: 'mm-sevenths', front: 'The seventh chords of {n:A} melodic minor?', back: '{c:AmMaj7} {c:Bm7} {c:Cmaj7#5} {c:D7} {c:E7} {c:F#m7b5} {c:G#m7b5}' },
    { id: 'mm-over-line', front: 'Melodic minor or Dorian over the minor line cliche?', back: 'Melodic minor over {c:AmMaj7} (its {n:G#}), Dorian over {c:Am7} and {c:Am6} (their {n:G} and {n:F#}).' },
  ],
};

// ── 4. Minor-key showpieces ─────────────────────────────────────────────────────────────────────

const minorKeyRepertoire: TeacherLesson = {
  id: 'minor-key-repertoire',
  title: 'Minor-key showpieces',
  teaches: 'Minor-key showpieces: the Habanera\'s chromatic descent and turn to major, the Mountain King\'s chromatic tune.',
  minutes: 5,
  skill: 'teacher:elena:minor-key-repertoire',
  steps: [
    {
      type: 'card',
      title: 'The Habanera',
      body: 'Bizet\'s Habanera, from Carmen, opens with a chromatic descent from {n:D}: {n:D} {n:C#} {n:C} {n:B} {n:Bb} {n:A}, over a {k:D minor} habanera bass. Its refrain turns to {k:D major}. Check every accidental: four of the six notes carry one or lose one.',
      figure: { kind: 'tab', tempo: 72, notes: [...HABANERA_DESCENT], caption: 'The pitches of the descent, in first position. The rhythm is in your edition.' },
    },
    {
      type: 'choice',
      prompt: 'How far apart is each note of the descent from the next?',
      figure: { kind: 'staff', notes: ['D4', 'C#4', 'C4', 'B3', 'Bb3', 'A3'], caption: 'The descent on the staff.' },
      options: [
        { text: 'A half step', correct: true },
        { text: 'A whole step', why: '{n:D} to {n:C#} is one fret: a half step. A whole step would skip a fret.' },
        { text: 'A minor third', why: 'A minor third is three half steps. These move by one.' },
      ],
      explain: 'Six notes, five half steps, from {n:D} down to {n:A}: the whole space between the tonic and the fifth, filled in chromatically.',
      fact: 'habanera',
    },
    {
      type: 'play-phrase',
      prompt: 'Play the descent: string 2 frets 3, 2, 1 and open, then string 3 frets 3 and 2.',
      notes: [...HABANERA_DESCENT],
      octave: 'exact',
      tempo: 72,
      explain: '{n:D} {n:C#} {n:C} {n:B}, then {n:Bb} {n:A} on string 3: one fret at a time.',
      alternative: {
        type: 'order',
        prompt: 'Put the Habanera\'s descent in order, from {n:D}.',
        tiles: ['{n:D}', '{n:C#}', '{n:C}', '{n:B}', '{n:Bb}', '{n:A}'],
        distractors: ['{n:Eb}'],
        explain: 'Half step by half step: {n:D} {n:C#} {n:C} {n:B} {n:Bb} {n:A}.',
      },
    },
    {
      type: 'listen-choice',
      prompt: 'The verse is in {k:D minor}. This cadence is in the key the refrain turns to. Minor or major?',
      sound: { kind: 'progression', chords: ['D', 'A7', 'D'], beats: 4, tempo: 72, voicing: 'close' },
      options: [{ text: '{k:D minor}' }, { text: '{k:D major}', correct: true }],
      shuffle: false,
      explain: '{n:F#} instead of {n:F}: {k:D major}, the parallel major. The same tonic, a different third, a different mood.',
      fact: 'habanera',
    },
    {
      type: 'card',
      title: 'The Mountain King',
      body: 'Grieg\'s Mountain King, here in {k:E minor}, repeats its theme faster and louder each time; in the library it climbs from 60 to 160 {t:bpm|BPM}. Its chromatic notes, {n:A#} and {n:F}, are part of the tune, not mistakes.',
      figure: { kind: 'tab', tempo: 60, notes: [...MOUNTAIN_KING_BAR_2], caption: 'Bar 2: {n:A#} {n:F#} {n:A#}, then {n:A} {n:F} {n:A}.' },
    },
    {
      type: 'choice',
      prompt: 'Which two notes of the theme fall outside {k:E minor}?',
      options: [
        { text: '{n:A#} and {n:F}', correct: true },
        { text: '{n:F#} and {n:A}', why: 'Both are in {k:E minor}: its second and fourth notes.' },
        { text: '{n:D#} and {n:C#}', why: 'Neither appears in this theme.' },
      ],
      explain: 'The thirds {n:A#}–{n:F#} and then {n:A}–{n:F} creep down by half steps. Grieg wrote them; play them proudly.',
      fact: 'mountain-king',
    },
    playerTask({
      id: 'mountain-king',
      title: 'In the Hall of the Mountain King',
      song: 'hall-of-the-mountain-king',
      minutes: 6,
      body: 'The whole ramp: six statements, 60 to 160 {t:bpm|BPM}, staccato. Stop where it stops being clean and note that tempo: it is your number for this week, and the place to start next time.',
      tip: 'Short notes come from the fretting hand: ease off the finger, do not lift it.',
    }),
    {
      type: 'true-false',
      statement: 'The {n:A#} in the Mountain King theme is a misprint, to be played as {n:A}.',
      answer: false,
      explain: 'It is the composer\'s note: {n:A#} then {n:A}, a chromatic step that makes the theme creep. Correct it and you have a different, duller tune.',
      fact: 'mountain-king',
    },
    playerTask({
      id: 'habanera',
      title: 'Habanera (Carmen)',
      song: 'carmen-habanera',
      mode: 'wait',
      minutes: 6,
      body: 'The student part in wait mode, then at about 60 and 72 BPM with the app\'s habanera bass. Every accidental of the descent, and the turn to {k:D major} in the refrain.',
      fallback: {
        tool: 'progressions',
        params: ['line-minor-down', 'd', 'jam'],
        title: 'Jam: the descent over D minor',
        body: 'The Habanera needs a printed edition and is not in the library; bring yours in with Scan & Import (Tools). Meanwhile: this jam at 72 BPM. Its moving voice is {n:D} {n:C#} {n:C} {n:B}, the descent\'s first four notes. Play it, one note per bar.',
      },
    }),
    playerTask({
      id: 'marionette',
      title: 'Funeral March of a Marionette',
      song: 'funeral-march-of-a-marionette',
      minutes: 5,
      body: 'A third minor-key character piece: Gounod, {k:D minor}, 6/8, sneaky and short, with sudden accents. Exaggerate the short notes first; the character is in the contrast.',
      fallback: {
        tool: 'player',
        params: ['greensleeves-melody'],
        title: 'A minor-key tune in 6/8',
        body: 'The Funeral March needs a printed edition and is not in the library; bring yours in with Scan & Import (Tools). Meanwhile, Greensleeves in 6/8: two beats of three in a minor key, with {n:G#} at the cadences and {n:G} in the melody.',
      },
    }),
    {
      type: 'match-pairs',
      prompt: 'Match each piece with what makes it a showpiece.',
      pairs: [
        { left: 'Habanera', right: 'A chromatic descent' },
        { left: 'Mountain King', right: 'Faster each time' },
        { left: 'Rondo alla Turca', right: 'A turn round {n:G#}' },
      ],
      explain: 'Bizet\'s descent from {n:D}, Grieg\'s accelerating theme, Mozart\'s turn on the raised seventh: three ways a minor key shows off.',
    },
  ],
  facts: [
    { id: 'habanera', front: 'How does Bizet\'s Habanera open, and where does its refrain go?', back: 'A chromatic descent from {n:D}: {n:D} {n:C#} {n:C} {n:B} {n:Bb} {n:A}, over a {k:D minor} bass. The refrain turns to {k:D major}.' },
    { id: 'mountain-king', front: 'What does the Mountain King theme do as it repeats?', back: 'It gets faster and louder each time; its chromatic notes ({n:A#} and {n:F} in {k:E minor}) belong to the tune.' },
  ],
};

// ── 5. The Neapolitan and the augmented sixth ───────────────────────────────────────────────────

const neapolitanAndAugmentedSixth: TeacherLesson = {
  id: 'neapolitan-and-augmented-sixth',
  title: 'The Neapolitan and the augmented sixth',
  teaches: 'The Neapolitan ({c:Bb/D}) and the German sixth ({n:F} {n:A} {n:C} {n:D#}) both lead dramatically to {c:E7} in {k:A minor}.',
  minutes: 5,
  skill: 'teacher:elena:neapolitan-and-augmented-sixth',
  steps: [
    {
      type: 'card',
      title: 'The Neapolitan',
      body: 'Two chromatic chords make minor-key cadences dramatic. The {t:neapolitan|Neapolitan} in {k:A minor} is {c:Bb/D}: {r:bII} in first inversion. It moves to {c:E7}, its {n:Bb} falling toward the {n:G#} and the {n:A} of the cadence.',
      figure: { kind: 'chord', symbol: 'Bb/D', frets: SHAPES.cadence['Bb/D'], caption: '{c:Bb/D}: the open {n:D} under {n:Bb}, {n:D}, {n:F}.' },
    },
    {
      type: 'choice',
      prompt: 'In {k:A minor}, which chord is the Neapolitan sixth?',
      options: [
        { text: '{c:Bb/D}', correct: true },
        { text: '{c:Bdim/D}', why: 'That is the diatonic chord on the second degree. The Neapolitan lowers its root a half step: {n:B} to {n:Bb}.' },
        { text: '{c:Dm}', why: '{c:Dm} is the plain {r:iv}. The Neapolitan keeps its bass, {n:D}, but puts {n:Bb} above it.' },
        { text: '{c:F/A}', why: 'That is {r:bVI} in first inversion, a diatonic chord.' },
      ],
      explain: '{n:Bb} {n:D} {n:F} with {n:D} in the bass: {r:bII} in first inversion, hence "sixth" ({n:D} up to {n:Bb} is a sixth).',
      fact: 'neapolitan-a',
    },
    {
      type: 'play-chord',
      prompt: '{c:Am}: x02210. Home, before the drama.',
      chord: 'Am',
      frets: SHAPES.cadence.Am,
      explain: 'The tonic. The next two chords leave it and return.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'Am', frets: SHAPES.cadence.Am, accept: 'this-shape', prompt: 'Build open {c:Am}.', explain: 'x02210.' },
    },
    {
      type: 'play-chord',
      prompt: '{c:Bb/D}: xx0331. The Neapolitan.',
      chord: 'Bb/D',
      frets: SHAPES.cadence['Bb/D'],
      explain: 'The open {n:D}, then {n:Bb} and {n:D} at fret 3 and {n:F} at fret 1. The {n:Bb} on string 3 is the note to listen to.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'Bb/D', frets: SHAPES.cadence['Bb/D'], accept: 'this-shape', prompt: 'Build {c:Bb/D} over the open {n:D} string.', explain: 'xx0331: string 3 fret 3, string 2 fret 3, string 1 fret 1.' },
    },
    {
      type: 'play-chord',
      prompt: '{c:E7}: 020100. The dominant.',
      chord: 'E7',
      frets: SHAPES.cadence.E7,
      explain: '{n:Bb} has fallen to {n:G#} on string 3 fret 1: a diminished third, the Neapolitan\'s signature move. Then {c:Am}.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'E7', frets: SHAPES.cadence.E7, accept: 'this-shape', prompt: 'Build open {c:E7}.', explain: '020100: fret 2 on string 5, fret 1 on string 3.' },
    },
    {
      type: 'card',
      title: 'The augmented sixth',
      body: 'The German {t:augmented-sixth|augmented sixth} stacks {n:F} {n:A} {n:C} {n:D#}. Its {n:F} and {n:D#} close in on {n:E} from a half step each side. On guitar it sounds exactly like {c:F7} (131211): the same pitches, {n:D#} spelled {n:Eb}.',
      figure: { kind: 'staff', notes: ['F3', 'A3', 'C4', 'D#4'], caption: 'The German sixth of {k:A minor}, low to high.' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the German sixth of {k:A minor}, spelled as it resolves.',
      text: '{n:F}  {n:A}  {n:C}  ___',
      blanks: ['{n:D#}'],
      bank: ['{n:Eb}', '{n:D}'],
      spelling: 'exact',
      explain: '{n:D#}, not {n:Eb}: it rises to {n:E}, so it is spelled as a raised {n:D}. Played alone, the same pitch is the {n:Eb} of {c:F7}.',
      fact: 'german-sixth-a',
    },
    {
      type: 'choice',
      prompt: 'Where do the {n:F} and the {n:D#} of the German sixth go?',
      options: [
        { text: 'Both to {n:E}, a half step each way', correct: true },
        { text: 'Both to {n:F#}', why: '{n:F#} is not in the cadence. The target is {n:E}, the dominant.' },
        { text: '{n:F} up to {n:G}, {n:D#} down to {n:D}', why: 'They move toward each other, not apart from the target.' },
      ],
      explain: 'The augmented sixth, {n:F} up to {n:D#}, opens out to an octave {n:E}: {n:F} falls a half step, {n:D#} rises one.',
      fact: 'german-sixth-a',
    },
    toolTask({
      id: 'jam-neapolitan',
      title: 'Jam: the Neapolitan cadence',
      tool: 'progressions',
      params: ['classical-neapolitan', 'a', 'jam'],
      minutes: 5,
      body: '{c:Am}, {c:Bb/D}, {c:E7}, {c:Am} at 60 {t:bpm|BPM}, fingerpicked: thumb on the bass, fingers above. Over {c:Bb/D}, play {n:Bb}; let it fall to {n:G#} as {c:E7} arrives.',
    }),
    {
      type: 'listen-choice',
      prompt: 'Neapolitan, or the plain {r:iv}?',
      sound: { kind: 'progression', chords: ['Am', 'Bb/D', 'E7', 'Am'], beats: 4, tempo: 66 },
      options: [{ text: 'The Neapolitan, {c:Bb/D}', correct: true }, { text: 'The plain {r:iv}, {c:Dm}' }],
      shuffle: false,
      explain: 'The second chord was major, with {n:Bb}: a half step above the tonic\'s second note. That darkened, lifted sound is the Neapolitan.',
    },
    toolTask({
      id: 'jam-augmented-sixth',
      title: 'Jam: the augmented sixth',
      tool: 'progressions',
      params: ['classical-augmented-sixth', 'a', 'jam'],
      minutes: 5,
      body: '{c:Am}, then the German sixth (the band plays it as {c:F7}), then {c:Am/E} and {c:E7}, at 60 {t:bpm|BPM}. Put {n:F} in the bass and {n:D#} on top, and hear them open out to {n:E}.',
    }),
    {
      type: 'play-chord',
      prompt: 'The German sixth\'s grip: {c:F7}, 131211.',
      chord: 'F7',
      frets: SHAPES.cadence.F7,
      explain: '{n:F} {n:C} {n:Eb} {n:A} {n:C} {n:F}: the {n:Eb} on string 4 fret 1 is, on a guitar, the {n:D#} of the German sixth.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'F7', frets: SHAPES.cadence.F7, accept: 'this-shape', prompt: 'Build {c:F7} as an E-shape barre at fret 1.', explain: '131211: the {c:F} barre with string 4 at fret 1 instead of 3, which turns {n:F} into {n:Eb}.' },
    },
  ],
  facts: [
    { id: 'neapolitan-a', front: 'The Neapolitan sixth in {k:A minor}?', back: '{c:Bb/D} (xx0331): {r:bII} in first inversion. Its {n:Bb} falls toward the {n:G#} and {n:A} of the cadence.' },
    { id: 'german-sixth-a', front: 'The German sixth in {k:A minor}, and its guitar grip?', back: '{n:F} {n:A} {n:C} {n:D#}: {n:F} and {n:D#} close in on {n:E}. It sounds like {c:F7} (131211).' },
  ],
};

// ── 6. Bach in minor: the Prelude BWV 999 ───────────────────────────────────────────────────────

const bachInMinor: TeacherLesson = {
  id: 'bach-in-minor',
  title: 'Bach in minor: the Prelude BWV 999',
  teaches: 'BWV 999 is one even arpeggio over a bass each downbeat: name each bar\'s chord, keep the dominant pedal steady.',
  minutes: 5,
  skill: 'teacher:elena:bach-in-minor',
  steps: [
    {
      type: 'card',
      title: 'One arpeggio, one chord a bar',
      body: 'This prelude, written for lute and moved here from {k:C minor} to {k:D minor}, is one continuous arpeggio over a bass on each downbeat. Every bar is a chord: name each one before you play it, and you will memorise the piece within a week.',
      figure: { kind: 'tab', tempo: 66, time: '3/4', notes: [...PIMAMI_DM_BAR], caption: 'The texture: {c:Dm} over its bass, one bar of the p i m a m i study.' },
    },
    {
      type: 'choice',
      prompt: 'Before you play a bar of an arpeggio prelude, what do you do?',
      options: [
        { text: 'Name its chord', correct: true },
        { text: 'Count its notes', why: 'The count never changes. The chord does, and the chord is what you remember.' },
        { text: 'Find the highest note', why: 'Useful later. First the chord: it tells the fingers where everything is.' },
      ],
      explain: 'A bar is a chord spread out in time. Name it and the hand forms it; the arpeggio then plays itself.',
      fact: 'name-the-bar',
    },
    { generate: 'chord-tones', params: { types: ['minor', 'major', '7', 'dim7'], roots: ['D', 'A', 'G', 'Bb', 'C#', 'E'], ask: 'name' } },
    {
      type: 'card',
      title: 'The pedal near the end',
      body: 'Near the end the bass holds {n:A}, the dominant of {k:D minor}, while the harmony moves above it: a {t:pedal-point|pedal point}. It must stay rock steady, the same weight and length every time. Here is a short one of my own.',
      figure: { kind: 'tab', tempo: 66, notes: [...PEDAL], caption: '{c:A}, {c:Dm/A}, {c:A7} over the {n:A} pedal, then {c:Dm}.' },
    },
    {
      type: 'true-false',
      statement: 'In a dominant pedal in {k:D minor}, the bass holds {n:A} while the chords above it change.',
      answer: true,
      explain: '{n:A} is the fifth of {k:D minor}, its dominant. The chords move over it; the held bass builds the tension that {c:Dm} releases.',
      fact: 'dominant-pedal',
    },
    {
      type: 'type-answer',
      prompt: 'Which note does the bass hold in a dominant pedal in {k:D minor}?',
      answer: { kind: 'note', value: 'A', spelling: 'any' },
      input: 'keypad',
      explain: 'The dominant is the fifth note of the key: {n:D} {n:E} {n:F} {n:G} {n:A}. On the open string 5, conveniently.',
      fact: 'dominant-pedal',
    },
    playerTask({
      id: 'bach-two-bars',
      title: 'Prelude BWV 999, two bars at a time',
      song: 'bach-prelude-bwv999',
      mode: 'wait',
      bars: [1, 2],
      minutes: 10,
      body: 'Two bars at a time in wait mode, naming each bar\'s chord aloud first. Then the first half at about 50 BPM, slowly enough that every note of the arpeggio is the same size.',
      fallback: {
        tool: 'player',
        params: ['st-pimami-3-4', 'm1-2', 'wait'],
        title: 'The same texture: p i m a m i in 3/4',
        body: 'The Prelude needs a printed edition and is not in the library (the next card shows how to bring yours in). Meanwhile the p i m a m i study: an even arpeggio over a bass in a minor key. Two bars at a time in wait mode, naming each chord first.',
      },
    }),
    {
      type: 'choice',
      prompt: 'A bar of the study plays {n:E}, {n:G#} and {n:B} over an {n:E} bass. Which chord?',
      options: [
        { text: '{c:E}', correct: true },
        { text: '{c:Em}', why: '{c:Em} has {n:G}. This has {n:G#}: the major third.' },
        { text: '{c:G#m}', why: 'The bass is {n:E}, and {n:E} {n:G#} {n:B} is an {c:E} triad from its root.' },
      ],
      explain: '{c:E} major: the dominant of {k:A minor}, with the raised seventh, {n:G#}. Harmonic minor at the cadence, as always.',
      fact: 'name-the-bar',
    },
    {
      type: 'card',
      title: 'Bring your own edition',
      body: 'To learn the Prelude itself you need a printed edition. Bring it in: Tools, then Scan & Import. Photograph or open the pages, proofread what the app reads against the print (every accidental, every bass note), save it, and it opens in the Player like any song.',
      tip: 'Choose an edition in {k:D minor}, the usual guitar key; one in {k:C minor} is the lute original.',
    },
    {
      type: 'play-phrase',
      prompt: 'Play my pedal: the open {n:A} under three chords, then {n:D} for the last bar.',
      notes: [...PEDAL],
      octave: 'exact',
      tempo: 66,
      explain: 'The open string 5 opens three bars with the same weight: {c:A}, {c:Dm/A}, {c:A7}. Then the bass moves to {n:D}, string 4, and the tension lets go.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap the pedal note: the open {n:A} string.',
        find: { note: 'A2' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 4],
        explain: 'String 5, open: {n:A}, the dominant of {k:D minor}.',
      },
    },
    playerTask({
      id: 'bach-whole',
      title: 'Prelude BWV 999, the whole piece',
      song: 'bach-prelude-bwv999',
      minutes: 10,
      body: 'The whole prelude at about 60 BPM, then 72. Through the pedal section keep the bass {n:A} identical every time, and let the harmony above it do the moving.',
      fallback: {
        tool: 'player',
        params: ['st-pimami-3-4', 't91'],
        title: 'The study, the whole way through',
        body: 'Until your edition is in: the whole p i m a m i study at 91 % (60 BPM), then 100 % (66 BPM). Every arpeggio note the same size, the bass on each downbeat a little fuller.',
      },
    }),
    {
      type: 'choice',
      prompt: 'Where is the bass note in each bar of an arpeggio prelude like this?',
      options: [
        { text: 'On the downbeat, beat 1', correct: true },
        { text: 'On the last note of the bar', why: 'The bass begins the bar: the arpeggio grows from it.' },
        { text: 'Anywhere, as long as it sounds', why: 'Its place is fixed: on each downbeat. That regularity is the piece\'s pulse.' },
      ],
      explain: 'A bass on each downbeat, the arpeggio above it: name the chord, place the bass, let the fingers follow.',
      fact: 'bwv999',
    },
  ],
  facts: [
    { id: 'bwv999', front: 'Bach\'s Prelude BWV 999: what is it, and in which key here?', back: 'A lute prelude, moved from {k:C minor} to {k:D minor}: one continuous arpeggio over a bass on each downbeat.' },
    { id: 'name-the-bar', front: 'How do you memorise an arpeggio prelude quickly?', back: 'Name each bar\'s chord before you play it.' },
    { id: 'dominant-pedal', front: 'What is a dominant pedal?', back: 'The bass holding the dominant ({n:A} in {k:D minor}) while the harmony moves above it.' },
  ],
};

/** Unit 8 of Prof. Varga's course. */
const unit: TeacherUnit = {
  id: 'elena-minor-harmony',
  title: 'Harmonic and melodic minor',
  theme: 'harmony',
  description: 'Hear and play harmonic and melodic minor, Phrygian dominant and the solea, the Neapolitan, the augmented sixth, and minor-key pieces.',
  lessons: [harmonicMinorHarmony, phrygianDominantAndSolea, melodicMinorHarmony, minorKeyRepertoire, neapolitanAndAugmentedSixth, bachInMinor],
  checkpoint: { sample: 8, maxMistakes: 2 },
  glossary: [
    { id: 'solea', term: 'solea', definition: 'A slow, serious flamenco form whose rhythm cycle counts 12 beats.' },
    { id: 'compas', term: 'compas', definition: 'The rhythm cycle of a flamenco form: for the solea, 12 beats accented on 3, 6, 8, 10 and 12.' },
    { id: 'falseta', term: 'falseta', definition: 'A short melodic passage a flamenco guitarist plays between sections of strumming.' },
    { id: 'neapolitan', term: 'Neapolitan', definition: 'A major chord on the flattened second degree, usually in first inversion: {c:Bb/D} in {k:A minor}.' },
    { id: 'augmented-sixth', term: 'augmented sixth chord', definition: 'A chromatic chord whose outer notes, an augmented sixth apart, move out by half steps to the dominant.' },
    { id: 'pedal-point', term: 'pedal point', definition: 'A bass note held or repeated while the harmony changes above it.' },
  ],
};

export default unit;
