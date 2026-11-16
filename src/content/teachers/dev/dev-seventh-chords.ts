/**
 * Dev, unit 8: Seventh chords (plan: `dev/dev-seventh-chords` in src/content/plan/teachers.json).
 *
 * Four seventh-chord colours and seven open shapes, movable sevenths with the root on string 6 and
 * on string 5, the seven sevenths of a major key, dominants that point somewhere other than home,
 * the ragtime cycle of dominants, and a songbook. Dev's voice: a bandmate who ties every idea to
 * something to play tonight.
 *
 * Music from the song library: Ragtime Blues in C (100 BPM). Home on the Range, Danny Boy, Nobody
 * Knows the Trouble I've Seen, La Paloma and John Henry carry fallbacks (Amazing Grace, Jingle
 * Bells, She'll Be Coming 'Round the Mountain, Oh! Susanna, a 12-bar jam in E) until they are in
 * the library; Gymnopedie No. 1 needs a printed edition, so its fallback is the Metronome and Scan
 * and Import. `dev-seventh-chords.test.ts` checks every shape, spelling, numeral and signpost the
 * text names against the engines, the jam tracks' chords and tempos, and every Player tempo.
 */
import type { TeacherLesson, TeacherUnit } from '../types';
import { playerTask, toolTask } from '../tasks';

/** The seven sevenths of C major, I to vii. */
export const SEVENTHS_OF_C = ['Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'Am7', 'Bm7b5'] as const;

/** The movable shape the key lesson gives each of them, frets 3 to 10 (low string first). */
export const SEVENTHS_OF_C_SHAPES: Record<(typeof SEVENTHS_OF_C)[number], string> = {
  Cmaj7: 'x3545x',
  Dm7: 'x57565',
  Em7: 'x79787',
  Fmaj7: 'x-8-10-9-10-x',
  G7: '353433',
  Am7: '575555',
  Bm7b5: '7x776x',
};

/** The ragtime cycle, one chord per bar. */
export const RAGTIME_CYCLE = ['C', 'A7', 'D7', 'G7'] as const;

// ── 1. Four seventh-chord colours ───────────────────────────────────────────────────────────────

const fourSevenths: TeacherLesson = {
  id: 'four-sevenths',
  title: 'Four seventh-chord colours',
  teaches: 'Sevenths come in four colours: major 7 dreamy, dominant 7 restless, minor 7 smooth, half-diminished dark.',
  minutes: 5,
  skill: 'teacher:dev:four-sevenths',
  steps: [
    {
      type: 'card',
      title: 'One more note, a new colour',
      body: 'Add a fourth note, the seventh, to a triad and the chord gets a whole new colour. Major seventh, 1 3 5 7: dreamy. Dominant seventh, 1 3 5 {d:b7}: it wants to move. Minor seventh, 1 {d:b3} 5 {d:b7}: smooth. And the {t:half-diminished} chord, 1 {d:b3} {d:b5} {d:b7}: dark and restless.',
      figure: { kind: 'keyboard', keys: ['C4', 'E4', 'G4', 'B4'], caption: '{c:Cmaj7}: {n:C} {n:E} {n:G} {n:B}. Lower the {n:B} to {n:Bb} for {c:C7}.' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each seventh chord on {n:C} with its notes.',
      pairs: [
        { left: '{c:Cmaj7}', right: '{n:C} {n:E} {n:G} {n:B}' },
        { left: '{c:C7}', right: '{n:C} {n:E} {n:G} {n:Bb}' },
        { left: '{c:Cm7}', right: '{n:C} {n:Eb} {n:G} {n:Bb}' },
        { left: '{c:Cm7b5}', right: '{n:C} {n:Eb} {n:Gb} {n:Bb}' },
      ],
      explain: 'Each one lowers one more note: {n:B} to {n:Bb} for the dominant seventh, then {n:E} to {n:Eb} for the minor seventh, then {n:G} to {n:Gb} for the half-diminished.',
      fact: 'sev-four-on-c',
    },
    {
      type: 'card',
      title: 'Seven open shapes',
      body: 'Open shapes to start, each a chord you know with one finger moved, lifted or added. Major sevenths: {c:Cmaj7} (x32000), {c:Fmaj7} (xx3210), {c:Amaj7} (x02120), {c:Dmaj7} (xx0222). Minor sevenths: {c:Am7} (x02010), {c:Em7} (022030), {c:Dm7} (xx0211).',
      figure: { kind: 'chord', symbol: 'Cmaj7', frets: 'x32000', caption: '{c:Cmaj7}: {c:C} with finger 1 lifted.' },
    },
    {
      type: 'play-chord',
      prompt: 'Strum {c:Cmaj7} (x32000) once and let it ring.',
      chord: 'Cmaj7',
      frets: 'x32000',
      explain: 'It is {c:C} with finger 1 lifted: the open string 2 rings {n:B}, the major seventh, a half step under the root. That is the dreamy sound.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'Cmaj7', frets: 'x32000', accept: 'this-shape', prompt: 'Build the open {c:Cmaj7} (x32000).', explain: '{c:Cmaj7}: fret 3 on string 5, fret 2 on string 4, and strings 3, 2 and 1 open.' },
    },
    {
      type: 'play-chord',
      prompt: 'Now {c:Am7} (x02010): {c:Am} with one finger lifted.',
      chord: 'Am7',
      frets: 'x02010',
      explain: 'Lift the finger from string 3 and its open {n:G} rings: the flat seventh of {n:A}. Smooth, a little wistful.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'Am7', frets: 'x02010', accept: 'this-shape', prompt: 'Build the open {c:Am7} (x02010).', explain: '{c:Am7}: fret 2 on string 4, fret 1 on string 2, strings 5, 3 and 1 open.' },
    },
    toolTask({
      id: 'open-sevenths',
      title: 'The other five open sevenths',
      tool: 'chords',
      params: ['f-maj7'],
      minutes: 5,
      body: 'On the {c:Fmaj7} page, pick the open shape (xx3210) and use the mic check until every string rings. Then find {c:Amaj7}, {c:Dmaj7}, {c:Em7} and {c:Dm7} in Chords and check each one the same way. No microphone? Play each, string by string, and listen for dead notes.',
    }),
    { generate: 'chord-quality-ear', params: { types: ['maj7', '7', 'm7', 'm7b5'] } },
    toolTask({
      id: 'sevenths-ear',
      title: 'Ear: the seventh-chord colours',
      tool: 'ear',
      params: ['chords', '7'],
      minutes: 4,
      body: 'In Ear Training, Chord quality, level 7: ten rounds of major seventh, dominant seventh, minor seventh and half-diminished. It adds a fifth, the diminished seventh, for later. Name the colour first, then the chord: dreamy, restless, smooth, dark.',
    }),
    {
      type: 'choice',
      prompt: 'Which seventh chord sounds restless, as if it wants to move somewhere?',
      options: [
        { text: 'The dominant seventh, 1 3 5 {d:b7}', correct: true },
        { text: 'The major seventh, 1 3 5 7', why: 'The major seventh is dreamy and happy to stay put.' },
        { text: 'The minor seventh, 1 {d:b3} 5 {d:b7}', why: 'The minor seventh is smooth. It can sit for bars on end.' },
      ],
      explain: 'The dominant seventh mixes a major third with a flat seventh, a tense pair that wants to resolve. That pull is its whole job.',
      fact: 'sev-colours',
    },
    toolTask({
      id: 'soul-jam',
      title: 'Jam: C major 7 and F major 7',
      tool: 'progressions',
      params: ['soul-imaj7-ivmaj7', 'c', 'jam'],
      minutes: 4,
      body: 'Set the band to 70 BPM and strum {c:Cmaj7} and {c:Fmaj7}, a bar each, slow and open. Let the chords ring right to the next change: that dreamy shimmer is the major seventh.',
    }),
    {
      type: 'choice',
      prompt: '{c:Gmaj7} (3x443x) has an x on string 5. What do you do with that string?',
      options: [
        { text: 'Mute it with the finger on string 6', correct: true },
        { text: 'Let it ring open', why: 'The open {n:A} is not in {c:Gmaj7}. It would muddy the chord.' },
        { text: 'Press it at fret 2', why: 'String 5, fret 2 is {n:B}, but the shape skips it: the finger is needed elsewhere.' },
      ],
      explain: 'The finger on string 6, fret 3 leans over and touches string 5 so it cannot ring. The shape then sounds {n:G} {n:F#} {n:B} {n:D}.',
    },
    playerTask({
      id: 'gymnopedie',
      title: 'Gymnopedie No. 1, the accompaniment',
      song: 'gymnopedie-1',
      tempo: 75,
      minutes: 5,
      body: 'The opening accompaniment only: {c:Gmaj7} (3x443x) and {c:Dmaj7} (xx0222), a bar each. Bass on beat 1, the chord on beats 2 and 3. Very slow and even, 75 % (about 50 BPM).',
      fallback: {
        tool: 'metronome',
        title: 'The Gymnopedie sway, with the click',
        body: 'Gymnopedie No. 1 needs a printed edition and is not in the library: if you own one, bring it in with Scan and Import and play it in the Player. Tonight, set the Metronome to 3/4 at 50 BPM: {c:Gmaj7} (3x443x), then {c:Dmaj7} (xx0222), a bar each, bass on 1, chord on 2 and 3.',
      },
    }),
    {
      type: 'true-false',
      statement: '{c:Dmaj7} (xx0222) is {c:D} with string 2 lowered a fret, from {n:D} to {n:C#}.',
      answer: true,
      explain: '{c:D} is xx0232; drop string 2 from fret 3 to fret 2 and its {n:D} becomes {n:C#}, the major seventh, a half step under the root.',
      fact: 'sev-open-shapes',
    },
  ],
  facts: [
    { id: 'sev-colours', front: 'The four seventh chords and their colours?', back: 'Major 7 (1 3 5 7) dreamy; dominant 7 (1 3 5 {d:b7}) restless; minor 7 (1 {d:b3} 5 {d:b7}) smooth; half-diminished (1 {d:b3} {d:b5} {d:b7}) dark.' },
    { id: 'sev-four-on-c', front: 'Spell {c:Cmaj7}, {c:C7}, {c:Cm7} and {c:Cm7b5}.', back: '{n:C} {n:E} {n:G} {n:B}; {n:C} {n:E} {n:G} {n:Bb}; {n:C} {n:Eb} {n:G} {n:Bb}; {n:C} {n:Eb} {n:Gb} {n:Bb}.' },
    { id: 'sev-open-shapes', front: 'The open major and minor seventh shapes?', back: '{c:Cmaj7} x32000, {c:Fmaj7} xx3210, {c:Amaj7} x02120, {c:Dmaj7} xx0222; {c:Am7} x02010, {c:Em7} 022030, {c:Dm7} xx0211.' },
  ],
};

// ── 2. Movable seventh chords ───────────────────────────────────────────────────────────────────

const movableSevenths: TeacherLesson = {
  id: 'movable-sevenths',
  title: 'Movable seventh chords',
  teaches: 'Movable seventh shapes, root on string 6 or on string 5, give you any seventh chord in any key.',
  minutes: 5,
  skill: 'teacher:dev:movable-sevenths',
  steps: [
    {
      type: 'card',
      title: 'Root on string 6',
      body: 'Same rule as barre chords: the root on string 6 or 5 names the chord. Root on string 6, here at fret 5: {c:A7} (575655), {c:Am7} (575555) and {c:Amaj7} (5x665x). Slide a shape up or down and its name follows the root.',
      figure: { kind: 'chord', symbol: 'Am7', frets: '575555', caption: '{c:Am7}, root on string 6 at fret 5.' },
    },
    {
      type: 'fretboard-find',
      prompt: 'Here is {c:Am7} at fret 5. Tap the note that makes it minor: its flat third.',
      find: { note: 'C' },
      mode: 'one',
      octave: 'any',
      frets: [5, 7],
      shown: [
        { string: 6, fret: 5 }, { string: 5, fret: 7 }, { string: 4, fret: 5 },
        { string: 3, fret: 5 }, { string: 2, fret: 5 }, { string: 1, fret: 5 },
      ],
      explain: 'String 3, fret 5 is {n:C}, the flat third of {n:A}. Push it up a fret to {n:C#} and the chord is {c:A7}.',
      fact: 'sev-root-6',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each root-on-6 shape at fret 5 with its chord.',
      pairs: [
        { left: '575655', right: '{c:A7}' },
        { left: '575555', right: '{c:Am7}' },
        { left: '5x665x', right: '{c:Amaj7}' },
      ],
      explain: 'One fret on string 3 is the third: fret 6 major, fret 5 minor. The flat seventh, {n:G}, sits on string 4 at fret 5; {c:Amaj7} moves the seventh to {n:G#}, string 4, fret 6.',
      fact: 'sev-root-6',
    },
    {
      type: 'card',
      title: 'Root on string 5',
      body: 'Root on string 5, at fret 5: {c:D7} (x57575), {c:Dm7} (x57565), {c:Dmaj7} (x5767x). And the half-diminished, {c:Bm7b5} (x2323x), its root at fret 2. Mute every x string with the edges of your fingers.',
      figure: { kind: 'chord', symbol: 'Bm7b5', frets: 'x2323x', caption: '{c:Bm7b5}: root on string 5 at fret 2.' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each chord type with its formula.',
      pairs: [
        { left: 'Major seventh', right: '1 3 5 7' },
        { left: 'Dominant seventh', right: '1 3 5 {d:b7}' },
        { left: 'Minor seventh', right: '1 {d:b3} 5 {d:b7}' },
        { left: 'Half-diminished', right: '1 {d:b3} {d:b5} {d:b7}' },
      ],
      explain: 'Start from the major seventh and lower one note at a time: the seventh for the dominant, the third as well for the minor seventh, the fifth too for the half-diminished.',
      fact: 'sev-formulas',
    },
    {
      type: 'card',
      title: 'Any seventh, anywhere',
      body: 'Tonight\'s trick: find the root, pick the string, drop the shape. {c:Gm7}: {n:G} is at fret 3 of string 6, so {c:Gm7} (353333) is the {c:Am7} shape at fret 3. {c:Em7b5}: {n:E} is at fret 7 of string 5, so {c:Em7b5} (x7878x) is the {c:Bm7b5} shape there.',
    },
    {
      type: 'play-chord',
      prompt: '{c:Gm7}: the minor-seventh shape with the root at string 6, fret 3 (353333).',
      chord: 'Gm7',
      frets: '353333',
      explain: 'Index across fret 3, ring finger on string 5, fret 5. That is the {c:Am7} shape two frets lower: root {n:G}, flat third {n:Bb}, flat seventh {n:F}.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'Gm7', frets: '353333', accept: 'this-shape', prompt: 'Build {c:Gm7} with its root on string 6 at fret 3.', explain: '{c:Gm7}: 353333, the {c:Am7} shape moved down to fret 3.' },
    },
    {
      type: 'fretboard-find',
      prompt: 'Next up: {c:Em7b5}. Tap its root on string 5.',
      find: { note: 'E3' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 12],
      strings: [5],
      explain: 'String 5, fret 7 is {n:E}. Build the half-diminished shape on it: x7878x.',
      fact: 'sev-find-any',
    },
    {
      type: 'play-chord',
      prompt: 'Now play {c:Em7b5} (x7878x), the half-diminished shape at fret 7.',
      chord: 'Em7b5',
      frets: 'x7878x',
      explain: 'Root {n:E} on string 5, then {n:Bb}, {n:D} and {n:G}: 1, {d:b5}, {d:b7}, {d:b3}. Dark, and it leans hard toward the next chord.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'Em7b5', frets: 'x7878x', accept: 'this-shape', prompt: 'Build {c:Em7b5} with its root on string 5 at fret 7.', explain: '{c:Em7b5}: x7878x, the {c:Bm7b5} shape moved up five frets.' },
    },
    toolTask({
      id: 'funk-vamp',
      title: 'Jam: a two-chord funk vamp',
      tool: 'progressions',
      params: ['funk-ii-v-vamp', 'c', 'jam'],
      minutes: 5,
      body: 'Set the band to 96 BPM: {c:Dm7} (x57565), a bar, then {c:G7} (353433), a bar. Short, choppy strums: hit, then let the fretting hand go light so the chord stops. Root on 5, root on 6, and the hand hardly moves.',
    }),
    {
      type: 'choice',
      prompt: 'You need {c:Bbmaj7} with its root on string 5. Which fret is the root?',
      options: [
        { text: 'Fret 1', correct: true },
        { text: 'Fret 2', why: 'String 5, fret 2 is {n:B}. {n:Bb} is a fret lower.' },
        { text: 'Fret 3', why: 'String 5, fret 3 is {n:C}, a whole step too high.' },
      ],
      shuffle: false,
      explain: 'String 5, fret 1 is {n:Bb}: the major-seventh shape there is x1323x. Find the root first and the shape does the rest.',
      fact: 'sev-find-any',
    },
  ],
  facts: [
    { id: 'sev-root-6', front: 'Root-on-6 seventh shapes at fret 5?', back: '{c:A7} 575655, {c:Am7} 575555, {c:Amaj7} 5x665x. Slide them and the root names the chord.' },
    { id: 'sev-root-5', front: 'Root-on-5 seventh shapes?', back: '{c:D7} x57575, {c:Dm7} x57565, {c:Dmaj7} x5767x; half-diminished {c:Bm7b5} x2323x.' },
    { id: 'sev-formulas', front: 'The formulas of the four seventh chords?', back: 'Major 7: 1 3 5 7. Dominant 7: 1 3 5 {d:b7}. Minor 7: 1 {d:b3} 5 {d:b7}. Half-diminished: 1 {d:b3} {d:b5} {d:b7}.' },
    { id: 'sev-find-any', front: 'How do you find any seventh chord on the neck?', back: 'Find its root on string 6 or 5, then put the shape of its type on that root.' },
  ],
};

// ── 3. The seventh chords of a key ──────────────────────────────────────────────────────────────

const seventhsInKey: TeacherLesson = {
  id: 'sevenths-in-a-key',
  title: 'The seventh chords of a key',
  teaches: 'In every major key: {r:Imaj7} and {r:IVmaj7}, minor sevenths on {r:ii}, {r:iii} and {r:vi}, {r:V7}, and half-diminished {r:viiø7}.',
  minutes: 5,
  skill: 'teacher:dev:sevenths-in-a-key',
  steps: [
    {
      type: 'card',
      title: 'Stack the scale in thirds',
      body: 'Stack every note of {k:C major} in thirds, four notes high, and you get the key\'s seven sevenths: {c:Cmaj7} {c:Dm7} {c:Em7} {c:Fmaj7} {c:G7} {c:Am7} {c:Bm7b5}. Every note of every one of them is in the scale.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: [...SEVENTHS_OF_C], beats: 2, tempo: 80 }, label: 'Hear the seven sevenths' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the seventh chords of {k:C major}.',
      text: '{c:Cmaj7}  {c:Dm7}  ___  {c:Fmaj7}  ___  {c:Am7}  ___',
      blanks: ['{c:Em7}', '{c:G7}', '{c:Bm7b5}'],
      bank: ['{c:Emaj7}', '{c:Gmaj7}', '{c:Bm7}'],
      explain: 'All the notes come from the {n:C} major scale: {n:E} {n:G} {n:B} {n:D} is {c:Em7}, {n:G} {n:B} {n:D} {n:F} is {c:G7}, {n:B} {n:D} {n:F} {n:A} is {c:Bm7b5}.',
      fact: 'sev-c-major',
    },
    {
      type: 'card',
      title: 'The same in every key',
      body: 'The pattern never changes: major seventh on {r:I} and {r:IV}, minor seventh on {r:ii}, {r:iii} and {r:vi}, a dominant seventh only on {r:V}, and half-diminished on {r:vii}. Only one chord in the key is a dominant seventh, which is why it is so good at leading home.',
    },
    {
      type: 'true-false',
      statement: '{c:G7} is the only dominant seventh chord in {k:C major}.',
      answer: true,
      explain: 'Only {r:V7} has a major third and a flat seventh in the key. {c:G7} ({n:G} {n:B} {n:D} {n:F}) pulls home to {c:Cmaj7}.',
      fact: 'sev-one-dominant',
    },
    { generate: 'diatonic-chord', params: { ask: 'chord', sevenths: true, maxAccidentals: 2 } },
    {
      type: 'card',
      title: 'Up the neck, frets 3 to 10',
      body: 'One movable shape each. Roots on string 5 climb: {c:Cmaj7} (x3545x), {c:Dm7} (x57565), {c:Em7} (x79787), {c:Fmaj7} (x-8-10-9-10-x). Then roots on string 6: {c:G7} (353433), {c:Am7} (575555), and one new grip, {c:Bm7b5} (7x776x).',
      figure: { kind: 'chord', symbol: 'Bm7b5', frets: [7, null, 7, 7, 6, null], caption: 'The new grip: {c:Bm7b5}, root on string 6 at fret 7.' },
    },
    {
      type: 'play-chord',
      prompt: 'Play {c:Em7} (x79787): the {c:Dm7} shape, two frets up.',
      chord: 'Em7',
      frets: 'x79787',
      explain: 'Root {n:E} on string 5 at fret 7. It is the {r:iii} chord: minor seventh, like {r:ii} and {r:vi}.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'Em7', frets: 'x79787', accept: 'this-shape', prompt: 'Build {c:Em7} with its root on string 5 at fret 7.', explain: '{c:Em7}: x79787, the root-on-5 minor-seventh shape at fret 7.' },
    },
    {
      type: 'play-chord',
      prompt: 'Now {c:Fmaj7}, root on string 5 at fret 8 (x-8-10-9-10-x).',
      chord: 'Fmaj7',
      frets: [null, 8, 10, 9, 10, null],
      explain: 'The {c:Dmaj7} shape at fret 8: {n:F} {n:C} {n:E} {n:A}. The {r:IV} chord is a major seventh, like {r:I}.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'Fmaj7', frets: [null, 8, 10, 9, 10, null], accept: 'this-shape', prompt: 'Build {c:Fmaj7} with its root on string 5 at fret 8.', explain: '{c:Fmaj7}: x-8-10-9-10-x, the root-on-5 major-seventh shape at fret 8.' },
    },
    {
      type: 'play-chord',
      prompt: 'And the new grip, {c:Bm7b5} (7x776x), root on string 6 at fret 7.',
      chord: 'Bm7b5',
      frets: [7, null, 7, 7, 6, null],
      explain: '{n:B}, then {n:A}, {n:D} and {n:F}: root, flat seventh, flat third, flat fifth. String 5 is muted by the finger on string 6.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'Bm7b5', frets: [7, null, 7, 7, 6, null], accept: 'this-shape', prompt: 'Build {c:Bm7b5} with its root on string 6 at fret 7.', explain: '{c:Bm7b5}: 7x776x. Fret 7 on strings 6, 4 and 3, fret 6 on string 2.' },
    },
    toolTask({
      id: 'rnb-jam',
      title: 'Jam: four sevenths walking down',
      tool: 'progressions',
      params: ['rnb-descending', 'c', 'jam'],
      minutes: 5,
      body: 'Set the band to 70 BPM: {c:Fmaj7}, {c:Em7}, {c:Dm7}, {c:Cmaj7}, a bar each, all with the root on string 5. The hand walks down from fret 8 to fret 3, the chords {r:IV}, {r:iii}, {r:ii}, {r:I}. Soft, even strums.',
    }),
    {
      type: 'choice',
      prompt: 'In {k:G major}, which chord is the dominant seventh?',
      options: [
        { text: '{c:D7}', correct: true },
        { text: '{c:G7}', why: '{c:G7} needs {n:F}, which is not in {k:G major}. There the {r:I} chord is {c:Gmaj7}.' },
        { text: '{c:Cmaj7}', why: '{c:Cmaj7} is the {r:IV} chord of {k:G major}: a major seventh.' },
      ],
      explain: 'The dominant seventh is always {r:V7}. In {k:G major} the fifth note is {n:D}, and {n:D} {n:F#} {n:A} {n:C} is {c:D7}.',
      fact: 'sev-one-dominant',
    },
  ],
  facts: [
    { id: 'sev-c-major', front: 'The seven seventh chords of {k:C major}?', back: '{c:Cmaj7} {c:Dm7} {c:Em7} {c:Fmaj7} {c:G7} {c:Am7} {c:Bm7b5}.' },
    { id: 'sev-key-pattern', front: 'The seventh-chord pattern of every major key?', back: 'Major 7 on {r:I} and {r:IV}; minor 7 on {r:ii}, {r:iii}, {r:vi}; dominant 7 on {r:V}; half-diminished on {r:vii}.' },
    { id: 'sev-one-dominant', front: 'How many dominant sevenths does a major key have?', back: 'One: {r:V7}. That is why it leads home so strongly.' },
  ],
};

// ── 4. Dominants that point elsewhere ───────────────────────────────────────────────────────────

const secondaryDominants: TeacherLesson = {
  id: 'secondary-dominant-songs',
  title: 'Dominants that point elsewhere',
  teaches: 'A dominant seventh that is not the {r:V} of the key is a signpost: it points at the chord a fifth below it.',
  minutes: 5,
  skill: 'teacher:dev:secondary-dominant-songs',
  steps: [
    {
      type: 'card',
      title: 'Signposts',
      body: 'Sometimes a dominant seventh points at a chord other than home. In Home on the Range, in {k:G major}, {c:A7} leads to {c:D7}, which leads home to {c:G}. {c:A7} is the dominant of {n:D}: a {t:secondary-dominant}. Hear it pull.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['G', 'A7', 'D7', 'G'], beats: 3, tempo: 96 }, label: 'Hear the signposts' },
    },
    {
      type: 'choice',
      prompt: 'In {k:G major}, {c:A7} is the dominant of which chord?',
      options: [
        { text: '{c:D}', correct: true },
        { text: '{c:G}', why: 'The dominant of {c:G} is {c:D7}. {c:A7} points one step further back.' },
        { text: '{c:E}', why: '{n:E} is a fifth above {n:A}. A dominant points a fifth below.' },
        { text: '{c:C}', why: '{c:C} is a minor third above {n:A}. The dominant of {c:C} is {c:G7}.' },
      ],
      explain: 'A dominant seventh resolves to the chord a fifth below its root: {c:A7} to {c:D}. In Home on the Range that {n:D} is {c:D7}, which then leads home to {c:G}.',
      fact: 'sev-signpost',
    },
    {
      type: 'listen-choice',
      prompt: 'Signpost one: after {c:A7}, which chord did you hear?',
      sound: { kind: 'progression', chords: ['A7', 'D7'], beats: 4, tempo: 80 },
      options: [{ text: '{c:D7}', correct: true }, { text: '{c:C}' }],
      explain: 'That was {c:A7} to {c:D7}: down a fifth, the move the signpost promised. {c:A7} to {c:C} would sound like a turn down a side street.',
    },
    playerTask({
      id: 'home-on-the-range',
      title: 'Home on the Range',
      song: 'home-on-the-range',
      tempo: 88,
      minutes: 5,
      body: 'Waltz strum, bass on 1 and down-up on 2 and 3, at 88 % (about 84 BPM), then 100 % (96 BPM). Say "signpost" out loud every time {c:A7} comes, and feel it pull to {c:D7}.',
      fallback: {
        tool: 'player',
        params: ['amazing-grace'],
        title: 'A signpost in Amazing Grace',
        body: 'Home on the Range is not in the Songs library yet. Strum Amazing Grace instead, a waltz in {k:G major}, at 100 % (84 BPM). Its signpost is the {c:G7} in line 3: it is the dominant of {c:C}, and {c:C} comes right after it.',
      },
    }),
    {
      type: 'listen-choice',
      prompt: 'Signpost two: after {c:E7}, which chord did you hear?',
      sound: { kind: 'progression', chords: ['E7', 'Am'], beats: 4, tempo: 80 },
      options: [{ text: '{c:Am}', correct: true }, { text: '{c:F}' }],
      explain: '{c:E7} to {c:Am}: down a fifth again. Its {n:G#} rises a half step to {n:A}, which is what makes the arrival so strong.',
    },
    {
      type: 'card',
      title: 'Danny Boy\'s two signposts',
      body: 'Danny Boy, in {k:C major}, has two of them: {c:D7} leads to {c:G}, and {c:E7} leads to {c:Am}. When you meet a dominant seventh that is not the {r:V} of the key, look where it goes next: it is a signpost, and it nearly always points a fifth down.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['C', 'E7', 'Am', 'D7', 'G7', 'C'], beats: 4, tempo: 72 }, label: 'Hear both signposts' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each signpost with the chord it points to.',
      pairs: [
        { left: '{c:A7}', right: '{c:D7}' },
        { left: '{c:D7}', right: '{c:G}' },
        { left: '{c:E7}', right: '{c:Am}' },
        { left: '{c:G7}', right: '{c:C}' },
      ],
      explain: 'Every dominant seventh points at the chord a fifth below its root: {n:A} to {n:D}, {n:D} to {n:G}, {n:E} to {n:A}, {n:G} to {n:C}.',
      fact: 'sev-signpost',
    },
    playerTask({
      id: 'danny-boy',
      title: 'Danny Boy',
      song: 'danny-boy',
      tempo: 85,
      minutes: 5,
      body: 'Melody with chords: let the app play the melody first while you strum, then take the melody yourself. At 85 % (about 56 BPM), then 100 % (66 BPM). Watch for the two signposts, {c:D7} to {c:G} and {c:E7} to {c:Am}.',
      fallback: {
        tool: 'player',
        params: ['jingle-bells', 't66'],
        title: 'Signposts in Jingle Bells',
        body: 'Danny Boy is not in the Songs library yet. Play the Jingle Bells chorus at 66 % (66 BPM): strum while the app plays the tune, then play the tune. In bars 7 and 8, {c:A7} is a signpost to {c:D7}, the dominant of home.',
      },
    }),
    {
      type: 'listen-choice',
      prompt: 'Signpost three: after {c:D7}, which chord did you hear?',
      sound: { kind: 'progression', chords: ['D7', 'G'], beats: 4, tempo: 80 },
      options: [{ text: '{c:G}', correct: true }, { text: '{c:Em}' }],
      explain: '{c:D7} to {c:G}: the fifth-down move once more. In {k:C major} that {c:D7} is the dominant of {c:G}, a signpost on the way home.',
    },
    {
      type: 'choice',
      prompt: 'A song in {k:G major} suddenly has a {c:B7}. Where will it most likely go next?',
      options: [
        { text: '{c:Em}', correct: true },
        { text: '{c:G}', why: 'The dominant of {c:G} is {c:D7}. {c:B7} points somewhere else.' },
        { text: '{c:C}', why: '{c:C} is a half step above {n:B}. A dominant points a fifth down.' },
      ],
      explain: 'A fifth below {n:B} is {n:E}, and in {k:G major} the chord on {n:E} is {c:Em}. {c:B7} is the dominant of the {r:vi} chord.',
      fact: 'sev-signpost-rule',
    },
  ],
  facts: [
    { id: 'sev-signpost', front: 'What is a secondary dominant?', back: 'A dominant seventh that is not the {r:V} of the key: it points at another chord, the one a fifth below its root.' },
    { id: 'sev-signpost-rule', front: 'You meet a dominant seventh that is not {r:V7}. What do you expect?', back: 'The chord a fifth below its root: {c:A7} to {c:D}, {c:E7} to {c:Am}, {c:B7} to {c:Em}.' },
    { id: 'sev-danny-boy', front: 'The signposts in Danny Boy, in {k:C major}?', back: '{c:D7} leads to {c:G}, and {c:E7} leads to {c:Am}.' },
  ],
};

// ── 5. The ragtime cycle ────────────────────────────────────────────────────────────────────────

const ragtime: TeacherLesson = {
  id: 'ragtime-changes',
  title: 'The ragtime cycle',
  teaches: 'The ragtime cycle chains signposts: in {c:C} {c:A7} {c:D7} {c:G7}, each seventh is the dominant of the next.',
  minutes: 5,
  skill: 'teacher:dev:ragtime-changes',
  steps: [
    {
      type: 'card',
      title: 'Chain the signposts',
      body: 'Chain the signposts and you get the ragtime progression: {c:C}, {c:A7}, {c:D7}, {c:G7}. {c:A7} is the dominant of {n:D}, {c:D7} the dominant of {n:G}, and {c:G7} leads home to {c:C}. It is the sound of ragtime, early jazz and a lot of country swing.',
      figure: { kind: 'circle', key: 'C major', highlight: ['A major', 'D major', 'G major'], show: 'major', caption: '{n:A}, {n:D}, {n:G}, {n:C}: each a fifth below the last.' },
    },
    {
      type: 'order',
      prompt: 'Put the cycle in order so that each chord is the dominant of the next.',
      tiles: ['{c:A7}', '{c:D7}', '{c:G7}', '{c:C}'],
      distractors: ['{c:F7}'],
      explain: '{c:A7} points to {n:D}, {c:D7} to {n:G}, {c:G7} to {n:C}: each root a fifth above the next. {c:F7} would point to {n:Bb}, out of the chain.',
      fact: 'sev-ragtime-cycle',
    },
    {
      type: 'card',
      title: 'Four shapes you know',
      body: 'The open shapes do the job: {c:C} (x32010), {c:A7} (x02020), {c:D7} (xx0212) and {c:G7} (320001). Strum it with {t:swing}, long-short in every beat, a bar per chord.',
      figure: { kind: 'chord', symbol: 'A7', frets: 'x02020', caption: '{c:A7}: two fingers at fret 2, the open {n:G} in the middle.' },
    },
    {
      type: 'play-chord',
      prompt: 'Strum {c:A7} (x02020), the first signpost of the cycle.',
      chord: 'A7',
      frets: 'x02020',
      explain: 'Fret 2 on strings 4 and 2, with strings 5, 3 and 1 open. The open string 3 is {n:G}, the flat seventh that makes it restless.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'A7', frets: 'x02020', accept: 'this-shape', prompt: 'Build the open {c:A7} (x02020).', explain: '{c:A7}: fret 2 on strings 4 and 2; strings 5, 3 and 1 open.' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap one bar of swing: long-short on every beat, like the strum.',
      rhythm: { pattern: 'et ~et et et ~et et et ~et et et ~et et' },
      tempo: 80,
      show: 'both',
      explain: 'Each beat splits long-short: the long part on the beat, the short one just before the next. That lilt turns the cycle into ragtime.',
    },
    toolTask({
      id: 'ragtime-jam',
      title: 'Jam: the ragtime cycle',
      tool: 'progressions',
      params: ['secondary-ragtime', 'c', 'jam'],
      minutes: 5,
      body: 'Set the band to 110 BPM: {c:C}, {c:A7}, {c:D7}, {c:G7}, a bar each, round and round. Swing it: down on the beat, up on the short end. Say each chord as it comes until your hand gets there first.',
    }),
    {
      type: 'true-false',
      statement: 'In the ragtime cycle, {c:A7} is the dominant of {c:D7}.',
      answer: true,
      explain: '{n:D} is a fifth below {n:A}, so {c:A7} points straight at {c:D7}, which points at {c:G7}, which points home.',
      fact: 'sev-ragtime-cycle',
    },
    {
      type: 'card',
      title: 'Now fingerpick it',
      body: 'The Ragtime Blues study plays the cycle two bars a chord, twice: {c:C} {c:C} {c:A7} {c:A7} {c:D7} {c:D7} {c:G7} {c:G7}. The thumb alternates bass strings on every beat, as in Travis picking, and a syncopated tune sits on top.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each chord with the thumb\'s first note in the study.',
      pairs: [
        { left: '{c:C}', right: 'String 5, fret 3' },
        { left: '{c:A7}', right: 'Open string 5' },
        { left: '{c:D7}', right: 'Open string 4' },
        { left: '{c:G7}', right: 'String 6, fret 3' },
      ],
      explain: 'The thumb starts each bar on the chord\'s root: {n:C}, {n:A}, {n:D}, {n:G}. Then it alternates to the next string and the other bass note.',
      fact: 'sev-ragtime-roots',
    },
    playerTask({
      id: 'ragtime-wait',
      title: 'Ragtime Blues, wait mode',
      song: 'st-ragtime-blues-c',
      mode: 'wait',
      bars: [1, 8],
      minutes: 5,
      body: 'The first 8 bars in wait mode: the music waits for each right note. Get the thumb right first; the tune notes fall between the thumb notes and are often held over the beat.',
    }),
    {
      type: 'choice',
      prompt: 'Over {c:A7} the thumb goes string 5, string 4, then the open string 6. Which note is that?',
      options: [
        { text: '{n:E}, the fifth of {c:A7}', correct: true },
        { text: '{n:A}, the root', why: 'The root is the open string 5, where the bar starts.' },
        { text: '{n:G}, the seventh', why: '{n:G} is the open string 3, in the chord but not in the bass.' },
      ],
      explain: 'The open string 6 is {n:E}, the fifth of {c:A7}. Root, then fifth: the alternating bass again.',
    },
    playerTask({
      id: 'ragtime-tempo',
      title: 'Ragtime Blues in time',
      song: 'st-ragtime-blues-c',
      bars: [1, 8],
      tempo: 60,
      minutes: 5,
      body: 'Now the same 8 bars in time, at 60 % (60 BPM). Keep the thumb as steady as a clock; if the tune trips, let it go and pick it up on the next bar.',
    }),
    {
      type: 'choice',
      prompt: 'The cycle reaches {c:G7}. Where does it lead?',
      options: [
        { text: 'Home, to {c:C}', correct: true },
        { text: 'To {c:A7}', why: 'From {c:C} the cycle starts again with {c:A7}, but {c:G7} itself points to {c:C}.' },
        { text: 'To {c:D7}', why: '{c:D7} comes before {c:G7}. It points to {n:G}, not the other way.' },
      ],
      explain: '{c:G7} is the dominant of {n:C}: the last signpost of the chain brings you home, ready to go round again.',
    },
  ],
  facts: [
    { id: 'sev-ragtime-cycle', front: 'The ragtime cycle in {k:C major}?', back: '{c:C} {c:A7} {c:D7} {c:G7}: each seventh is the dominant of the next, and {c:G7} leads home.' },
    { id: 'sev-ragtime-roots', front: 'The roots of the ragtime cycle in C, and how they move?', back: '{n:C} {n:A} {n:D} {n:G}: from {n:A} on, each falls a fifth to the next, round the circle back to {n:C}.' },
  ],
};

// ── 6. Seventh-chord songbook ───────────────────────────────────────────────────────────────────

const songbook: TeacherLesson = {
  id: 'seventh-songbook',
  title: 'Seventh-chord songbook',
  teaches: 'Use sevenths where they belong: a bluesy {r:IV7}, a habanera over {c:D7}, a blues ballad on three sevenths.',
  minutes: 5,
  skill: 'teacher:dev:seventh-songbook',
  steps: [
    {
      type: 'card',
      title: 'A bluesy {r:IV}',
      body: 'Seventh chords are part of your vocabulary now, so use them where they belong. Nobody Knows the Trouble I\'ve Seen, in {k:G major}, puts {c:C7} (x32310) under the {r:IV}: the {n:Bb} on string 3 is not in the key, and that is exactly the blues in it.',
      figure: { kind: 'chord', symbol: 'C7', frets: 'x32310', caption: '{c:C7}: {c:C} plus finger 4 on string 3, fret 3 ({n:Bb}).' },
    },
    {
      type: 'choice',
      prompt: 'Why does {c:C7} sound bluesy as the {r:IV} chord in {k:G major}?',
      options: [
        { text: 'Its {n:Bb} is a blue note, outside the key', correct: true },
        { text: 'It is the dominant of the key', why: 'The dominant of {k:G major} is {c:D7}. {c:C7} is the {r:IV} chord with a flat seventh added.' },
        { text: 'It has no third', why: 'It has its third, {n:E}. The blues comes from the {n:Bb}.' },
      ],
      explain: '{n:Bb} is the flat third of {n:G}, a blue note. Under the {r:IV} it turns a hymn-like change into a bluesy one.',
      fact: 'sev-iv7',
    },
    playerTask({
      id: 'nobody-knows',
      title: 'Nobody Knows the Trouble I\'ve Seen',
      song: 'nobody-knows',
      minutes: 5,
      body: 'At 100 % (66 BPM), slow and heartfelt, with {c:C7} (x32310) every time the {r:IV} chord comes instead of a plain {c:C}. Listen to what that one note does.',
      fallback: {
        tool: 'player',
        params: ['coming-round-the-mountain', 't61'],
        title: 'A bluesy {r:IV7} in a folk song',
        body: 'Nobody Knows is not in the Songs library yet. Strum She\'ll Be Coming \'Round the Mountain in {k:G major} at 61 % (about 66 BPM), and play {c:C7} (x32310) every time {c:C} comes: the same bluesy {r:IV7}.',
      },
    }),
    {
      type: 'card',
      title: 'The habanera',
      body: 'La Paloma rides on the {t:habanera}, a Cuban rhythm: dotted eighth, sixteenth, eighth, eighth, in every bar of 2/4. Long, short, then two even notes. Under it: {c:G}, {c:D7} (xx0212) and {c:C}.',
      figure: { kind: 'rhythm', pattern: 'e. s e e', time: '2/4', tempo: 66, caption: 'The habanera: one bar of 2/4.' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap two bars of the habanera with the click.',
      rhythm: { pattern: 'e. s e e | e. s e e', time: '2/4' },
      tempo: 66,
      show: 'both',
      explain: 'Long-short on beat 1, then two even eighths on beat 2. The sixteenth arrives just before beat 2: that little push into the beat is the whole dance.',
      fact: 'sev-habanera',
    },
    playerTask({
      id: 'la-paloma',
      title: 'La Paloma',
      song: 'la-paloma',
      minutes: 5,
      body: 'At 100 % (66 BPM), strum the habanera under the melody: {c:G}, {c:D7} and {c:C}. Keep the long-short of beat 1 light and lazy, never rushed.',
      fallback: {
        tool: 'player',
        params: ['oh-susanna', 't72'],
        title: 'The habanera on {c:G}, {c:C} and {c:D7}',
        body: 'La Paloma is not in the Songs library yet. Put the habanera under Oh! Susanna for now: the same three chords, {c:G}, {c:C} and {c:D7}, in 2/4, at 72 % (66 BPM). Long-short, then two even strums, every bar.',
      },
    }),
    {
      type: 'match-pairs',
      prompt: 'Match each song with its seventh chord at work.',
      pairs: [
        { left: 'Nobody Knows', right: '{c:C7}, a bluesy {r:IV7}' },
        { left: 'La Paloma', right: '{c:D7} under a habanera' },
        { left: 'John Henry', right: '{c:E7} {c:A7} {c:B7}' },
      ],
      explain: 'Three jobs: colour the {r:IV} with a blue note, lead home as {r:V7} in a dance, and drive a blues ballad where every chord is a dominant seventh.',
    },
    playerTask({
      id: 'john-henry',
      title: 'John Henry',
      song: 'john-henry',
      minutes: 5,
      body: 'A blues ballad in {k:E major} on three dominant sevenths: {c:E7} (020100), {c:A7} (x02020) and {c:B7} (x21202). At 100 % (92 BPM), a driving strum that leans on 2 and 4.',
      fallback: {
        tool: 'progressions',
        params: ['blues-12-bar', 'e', 'jam'],
        title: 'Jam: {c:E7}, {c:A7} and {c:B7}',
        body: 'John Henry is not in the Songs library yet. Jam a 12-bar in E on its three chords instead: {c:E7} (020100), {c:A7} (x02020), {c:B7} (x21202). Set the band to 92 BPM and drive the strum, leaning on 2 and 4.',
      },
    }),
    { generate: 'chord-quality-ear', params: { types: ['maj7', '7', 'm7', 'm7b5'] } },
    toolTask({
      id: 'quiz-ear',
      title: 'The quiz by ear: 8 out of 10',
      tool: 'ear',
      params: ['chords', '7'],
      minutes: 4,
      body: 'Chord quality, level 7, ten rounds: the four seventh colours plus the diminished seventh. Aim for 8. Below that, play each colour on the guitar and say its word out loud: dreamy, restless, smooth, dark.',
    }),
    {
      type: 'play-chord',
      prompt: 'The shape quiz: play {c:Bm7}, anywhere on the neck.',
      chord: 'Bm7',
      explain: 'The root-on-5 minor seventh at fret 2 is x24232; the root-on-6 one at fret 7 is 7-9-7-7-7-7. Either is {n:B} {n:D} {n:F#} {n:A}.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'Bm7', frets: 'x24232', accept: 'any-voicing', prompt: 'Build {c:Bm7}: any shape that really is the chord.', explain: '{c:Bm7} is {n:B} {n:D} {n:F#} {n:A}: x24232 is the root-on-5 shape at fret 2.' },
    },
    {
      type: 'play-chord',
      prompt: 'Next: {c:Ebmaj7}, anywhere on the neck.',
      chord: 'Ebmaj7',
      explain: '{n:Eb} sits at string 5, fret 6, so the root-on-5 major-seventh shape there: x6878x. {n:Eb} {n:G} {n:Bb} {n:D}.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'Ebmaj7', frets: 'x6878x', accept: 'any-voicing', prompt: 'Build {c:Ebmaj7}: any shape that really is the chord.', explain: '{c:Ebmaj7} is {n:Eb} {n:G} {n:Bb} {n:D}: x6878x is the root-on-5 shape at fret 6.' },
    },
    {
      type: 'play-chord',
      prompt: 'And {c:F#m7b5}, anywhere on the neck.',
      chord: 'F#m7b5',
      explain: '{n:F#} is at string 6, fret 2, so the root-on-6 half-diminished grip there: 2x221x. {n:F#} {n:A} {n:C} {n:E}.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'F#m7b5', frets: '2x221x', accept: 'any-voicing', prompt: 'Build {c:F#m7b5}: any shape that really is the chord.', explain: '{c:F#m7b5} is {n:F#} {n:A} {n:C} {n:E}: 2x221x is the root-on-6 grip at fret 2.' },
    },
  ],
  facts: [
    { id: 'sev-iv7', front: 'Why does a {r:IV7} chord sound bluesy in a major key?', back: 'Its flat seventh is the flat third of the key, a blue note: {c:C7} in {k:G major} adds {n:Bb}.' },
    { id: 'sev-habanera', front: 'The habanera rhythm, in one bar of 2/4?', back: 'Dotted eighth, sixteenth, eighth, eighth: long, short, then two even notes.' },
    { id: 'sev-john-henry', front: 'Which chords drive John Henry, in {k:E major}?', back: 'Three dominant sevenths: {c:E7}, {c:A7} and {c:B7}.' },
  ],
};

/** Unit 8 of Dev's course. */
const unit: TeacherUnit = {
  id: 'dev-seventh-chords',
  title: 'Seventh chords',
  theme: 'chords',
  description: 'Four seventh colours in open and movable shapes, the sevenths of a key, signpost dominants and the ragtime cycle.',
  lessons: [fourSevenths, movableSevenths, seventhsInKey, secondaryDominants, ragtime, songbook],
  checkpoint: { sample: 8, maxMistakes: 2 },
  glossary: [
    { id: 'half-diminished', term: 'half-diminished', definition: 'A minor seventh chord with a flat fifth, the chord on the seventh note of a major key: dark and restless.' },
    { id: 'secondary-dominant', term: 'secondary dominant', definition: 'A dominant seventh that points at a chord other than home: the chord a fifth below its root.' },
    { id: 'habanera', term: 'habanera', definition: 'A Cuban dance rhythm in 2/4: dotted eighth, sixteenth, eighth, eighth, in every bar.' },
    { id: 'swing', term: 'swing', definition: 'A feel that turns pairs of eighth notes into long-short, like a triplet with the middle note left out.' },
  ],
};

export default unit;
