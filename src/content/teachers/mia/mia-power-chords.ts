/**
 * Mia, unit 9: Power chords and the blues (plan: `mia/mia-power-chords` in src/content/plan/teachers.json).
 *
 * Two-finger power chords (E5, A5, D5), the movable shape (G5, C5) and the natural notes of strings
 * 6 and 5 that name it, palm muting, the 12-bar blues shuffle in A, John Henry on E7, A7 and B7, and
 * a riff of the learner's own over the band. Every lesson follows its plan entry: the plan's
 * `explain` in Mia's voice on the cards, its `show` as figures, its `practice` as exercises (`Mic`
 * always with a tapping alternative) or tasks that send the learner to the Player, Technique,
 * Fretboard, Rhythm, the chord trainer, the Metronome or a jam track and back.
 *
 * Music from the song library: Power Chords: Open Riff (`st-power-chords-open`, 92 BPM) and the
 * 12-Bar Blues Shuffle in A (`st-blues-shuffle-a`, 84 BPM). John Henry is not in the library yet:
 * its task names the song and falls back to a jam on E7, A7 and B7 (`blues-12-bar` in E) until it
 * lands. Player tempos are percentages of the song's own tempo; `mia-power-chords.test.ts` checks
 * the BPM each task names, every shape and note against the engines, and the riff and shuffle
 * against the library's files.
 *
 * What the engine cannot draw is said in words instead: the tab figure holds single notes, so the
 * riff's power chords are shown as a rhythm line and as their roots on string 6, and there is no
 * palm-muted sound, so muted and open are described and tapped rather than heard.
 */
import type { TeacherLesson, TeacherUnit } from '../types';
import { playerTask, techniqueTask, toolTask } from '../tasks';

// ── 1. Power chords ─────────────────────────────────────────────────────────────────────────────

const powerChords: TeacherLesson = {
  id: 'power-chords',
  title: 'Power chords',
  teaches: 'A power chord is a root and its fifth; E5, A5 and D5 need two fingers, and the other strings stay quiet.',
  minutes: 5,
  skill: 'teacher:mia:power-chords',
  steps: [
    {
      type: 'card',
      title: 'Two notes, one big sound',
      body: 'A {t:power-chord|power chord} has just two notes: the {t:root}, the note it is named after, and the {t:fifth} above it. Often the root comes again on top, the same note one {t:octave} higher. With no third, it is neither major nor minor. Through a gritty, distorted amp it sounds huge: rock is built on it.',
      figure: { kind: 'audio', sound: { kind: 'chord', chord: 'E5', frets: '022xxx', style: 'strum' }, label: 'Hear {c:E5}' },
    },
    {
      type: 'choice',
      prompt: 'Which notes make a power chord?',
      options: [
        { text: 'The root and its fifth', correct: true },
        { text: 'The root, the third and the fifth', why: 'That is a full major or minor chord. A power chord leaves the third out.' },
        { text: 'Any two open strings', why: 'Not any two: the root, and the note a fifth above it.' },
      ],
      explain: 'Root and fifth, often with the root again an octave higher. Without the third it is neither major nor minor.',
      fact: 'power-chord-notes',
    },
    {
      type: 'card',
      title: 'E5: the open string 6 and two fingers',
      body: '{c:E5} is the open string 6 ({n:E}), finger 1 on string 5, fret 2 ({n:B}) and finger 2 on string 4, fret 2 ({n:E}): root, fifth, and the root an octave higher. Strum only strings 6, 5 and 4, with short downstrokes.',
      figure: { kind: 'chord', symbol: 'E5', frets: '022xxx', fingers: '012xxx', caption: '{c:E5}: strings 6, 5 and 4 only.' },
    },
    {
      type: 'play-chord',
      prompt: 'Strum {c:E5}: the open string 6, string 5 fret 2 and string 4 fret 2. Only those three strings.',
      chord: 'E5',
      frets: '022xxx',
      explain: '{c:E5} is {n:E}, {n:B} and {n:E} again. If thinner strings rang too, aim the pick at strings 6 to 4 only.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'E5',
        frets: '022xxx',
        accept: 'this-shape',
        prompt: 'Build {c:E5}: two fingers and the open string 6.',
        explain: 'String 5 fret 2 and string 4 fret 2 over the open string 6. Strings 3 to 1 are not played.',
      },
    },
    {
      type: 'card',
      title: 'A5 and D5: the same idea, moved over',
      body: '{c:A5} is the same shape one string over: the open string 5 ({n:A}), string 4, fret 2 ({n:E}) and string 3, fret 2 ({n:A}). {c:D5} is two strings over, with one change: its top note moves up one fret, to string 2, fret 3 ({n:D}), because string 2 is tuned differently from the others.',
      figure: { kind: 'chord', symbol: 'D5', frets: 'xx023x', fingers: 'xx012x', caption: '{c:D5}: the top note is at fret 3, not fret 2.' },
    },
    {
      type: 'play-chord',
      prompt: 'Strum {c:A5}: the open string 5, string 4 fret 2 and string 3 fret 2.',
      chord: 'A5',
      frets: 'x022xx',
      explain: '{c:A5} is {n:A}, {n:E} and {n:A}: the {c:E5} shape moved one string toward string 1. Miss string 6 and strings 2 and 1.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'A5',
        frets: 'x022xx',
        accept: 'this-shape',
        prompt: 'Build {c:A5}: the {c:E5} shape, one string over.',
        explain: 'String 4 fret 2 and string 3 fret 2 over the open string 5.',
      },
    },
    {
      type: 'play-chord',
      prompt: 'And {c:D5}: the open string 4, string 3 fret 2 and string 2 fret 3.',
      chord: 'D5',
      frets: 'xx023x',
      explain: '{c:D5} is {n:D}, {n:A} and {n:D}. The top finger sits one fret higher than in {c:E5} and {c:A5}.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'D5',
        frets: 'xx023x',
        accept: 'this-shape',
        prompt: 'Build {c:D5}: careful with the top note.',
        explain: 'String 3 fret 2 and string 2 fret 3 over the open string 4. String 2 needs fret 3 for the {n:D}.',
      },
    },
    {
      type: 'card',
      title: 'Keep the other strings quiet',
      body: 'Let the underside of your fretting fingers lightly touch the thinner strings, so they stay silent even when the pick brushes them. That is called {t:mute|muting}. Then even a big strum sounds only the power chord.',
    },
    techniqueTask({
      id: 'fretting-mute',
      title: 'Strum all six, hear only three',
      exercise: 'tech-fretting-mute',
      minutes: 3,
      body: 'Part 1, Strum all six: hold {c:E5} and strum all six strings. Only strings 6, 5 and 4 should sound, because your fingers resting on strings 3 to 1 keep them quiet. Start at 60 BPM.',
      tip: 'Hear an open string ringing? Flatten finger 1 a little so its underside rests on the thinner strings.',
    }),
    {
      type: 'true-false',
      statement: 'A power chord sounds neither major nor minor.',
      answer: true,
      explain: 'Major or minor comes from the third, and a power chord has none: only the root and its fifth.',
      fact: 'power-chord-notes',
    },
    playerTask({
      id: 'open-riff-1-4',
      title: 'Power Chords: Open Riff, bars 1 to 4',
      song: 'st-power-chords-open',
      bars: [1, 4],
      tempo: 87,
      minutes: 5,
      body: 'Loop bars 1 to 4 at about 80 BPM, in downstrokes. You know three of its shapes: {c:E5} in bars 1 and 3, {c:D5} late in bar 2, {c:A5} early in bar 4. {c:C5} and {c:G5} come next lesson: rest your hand there and let the Player play them, then come back in on time.',
      tip: 'Use each gap to move to the next shape. Chords ringing through the gaps? Ease the pressure off on each rest.',
    }),
    {
      type: 'choice',
      prompt: 'Where is the top note of {c:D5}?',
      options: [
        { text: 'String 2, fret 3', correct: true },
        { text: 'String 2, fret 2', why: 'Fret 2 of string 2 is {n:C#}, not {n:D}. String 2 is tuned one fret lower than the pattern, so the note moves up a fret.' },
        { text: 'String 3, fret 3', why: 'String 3, fret 2 is the fifth, {n:A}. The top note is on string 2.' },
      ],
      explain: 'String 2, fret 3 is {n:D}, the root again an octave higher. Every other pair of neighbouring strings is five frets apart; strings 3 and 2 are four.',
      fact: 'd5-shape',
    },
  ],
  facts: [
    { id: 'power-chord-notes', front: 'Which notes make a power chord?', back: 'The root and the fifth above it, often with the root again an octave higher. No third, so it is neither major nor minor.' },
    { id: 'd5-shape', front: 'Why is the top note of {c:D5} at string 2, fret 3?', back: 'String 2 is tuned one fret lower than the pattern of the other strings, so the note moves up one fret to stay {n:D}.' },
    { id: 'quiet-strings', front: 'How do you keep the other strings quiet in a power chord?', back: 'Let the underside of your fretting fingers lightly touch the thinner strings, so they stay silent.' },
  ],
};

// ── 2. One shape, any chord ─────────────────────────────────────────────────────────────────────

/** The natural notes on string 6 from the plan's show, open string included. */
const STRING_6_NATURALS = [
  { string: 6, fret: 0, note: 'E2' },
  { string: 6, fret: 1, note: 'F2' },
  { string: 6, fret: 3, note: 'G2' },
  { string: 6, fret: 5, note: 'A2' },
  { string: 6, fret: 7, note: 'B2' },
  { string: 6, fret: 8, note: 'C3' },
  { string: 6, fret: 10, note: 'D3' },
  { string: 6, fret: 12, note: 'E3' },
] as const;

const movablePowerChords: TeacherLesson = {
  id: 'movable-power-chords',
  title: 'One shape, any chord',
  teaches: 'The power-chord shape moves anywhere unchanged, so the root under finger 1 names the chord.',
  minutes: 5,
  skill: 'teacher:mia:movable-power-chords',
  steps: [
    {
      type: 'card',
      title: 'Your first movable shape',
      body: 'Put finger 1 on the root, and fingers 3 and 4 two frets higher on the next two strings. {c:G5}: finger 1 on string 6, fret 3 ({n:G}), finger 3 on string 5, fret 5 ({n:D}), finger 4 on string 4, fret 5 ({n:G}). No open strings, so the shape can slide anywhere.',
      figure: { kind: 'chord', symbol: 'G5', frets: '355xxx', fingers: '134xxx', caption: '{c:G5}: the root at string 6, fret 3, under finger 1.' },
    },
    {
      type: 'choice',
      prompt: 'In {c:G5}, which finger plays the root?',
      options: [
        { text: 'Finger 1, on string 6, fret 3', correct: true },
        { text: 'Finger 3, on string 5, fret 5', why: 'Finger 3 plays the fifth, {n:D}. The root is the lowest note, under finger 1.' },
        { text: 'Finger 4, on string 4, fret 5', why: 'Finger 4 plays {n:G} again, an octave above the root. The root itself is under finger 1.' },
      ],
      explain: 'The root is the lowest note, under finger 1: string 6, fret 3 is {n:G}, so the chord is {c:G5}.',
      fact: 'movable-root',
    },
    {
      type: 'card',
      title: 'C5: the same shape on string 5',
      body: 'Move the whole shape one string toward string 1. Now finger 1 is on string 5, fret 3 ({n:C}), and the chord is {c:C5}. The shape never changes, so the root note names the chord. This is your first movable shape, and your first step toward knowing the whole neck.',
      figure: { kind: 'chord', symbol: 'C5', frets: 'x355xx', fingers: 'x134xx', caption: '{c:C5}: the root at string 5, fret 3.' },
    },
    {
      type: 'fretboard-name',
      prompt: 'Finger 1 is on string 5, fret 3: the root of this power chord. Which note is it?',
      position: { string: 5, fret: 3 },
      ask: 'note',
      spelling: 'any',
      options: ['C', 'D', 'B', 'A'],
      explain: 'String 5, fret 3 is {n:C}: the open string is {n:A}, fret 2 is {n:B} and fret 3 is {n:C}. So the chord is {c:C5}.',
      fact: 'movable-root',
    },
    {
      type: 'card',
      title: 'The notes on string 6',
      body: 'To slide the shape with confidence, learn the natural notes on string 6: fret 1 is {n:F}, fret 3 {n:G}, fret 5 {n:A}, fret 7 {n:B}, fret 8 {n:C}, fret 10 {n:D}, and fret 12 is {n:E} again. On string 5: fret 3 is {n:C}, fret 5 {n:D}, fret 7 {n:E}.',
      figure: { kind: 'fretboard', frets: [0, 12], dots: [...STRING_6_NATURALS], caption: 'The natural notes on string 6, from the open {n:E} to fret 12.' },
    },
    {
      type: 'match-pairs',
      prompt: 'Finger 1 on string 6. Match each fret with its power chord.',
      pairs: [
        { left: 'Fret 3', right: '{c:G5}' },
        { left: 'Fret 5', right: '{c:A5}' },
        { left: 'Fret 7', right: '{c:B5}' },
        { left: 'Fret 8', right: '{c:C5}' },
      ],
      explain: 'On string 6, fret 3 is {n:G}, fret 5 {n:A}, fret 7 {n:B} and fret 8 {n:C}. The root names the chord.',
      fact: 'string-6-naturals',
    },
    toolTask({
      id: 'string-6-notes',
      title: 'The natural notes on string 6',
      tool: 'fretboard',
      params: ['stage', 'string-6-naturals'],
      minutes: 2,
      body: 'Two minutes on the natural notes of string 6, from the open {n:E} to fret 12. Say each note out loud as you find it. These are the roots of every power chord you slide along string 6.',
    }),
    {
      type: 'play-chord',
      prompt: 'Play {c:G5} with the root on string 6: finger 1 at fret 3, fingers 3 and 4 at fret 5.',
      chord: 'G5',
      frets: '355xxx',
      explain: '{c:G5}: {n:G} at string 6 fret 3, {n:D} at string 5 fret 5 and {n:G} at string 4 fret 5.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap the root of {c:G5} on string 6.',
        find: { note: 'G2' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 12],
        strings: [6],
        explain: 'String 6, fret 3 is {n:G}: the root of {c:G5}, under finger 1.',
      },
    },
    {
      type: 'play-chord',
      prompt: 'Now {c:C5} with the root on string 5: finger 1 at string 5, fret 3.',
      chord: 'C5',
      frets: 'x355xx',
      explain: '{c:C5}: {n:C} at string 5 fret 3, {n:G} at string 4 fret 5 and {n:C} at string 3 fret 5.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap the root of {c:C5} on string 5.',
        find: { note: 'C3' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 12],
        strings: [5],
        explain: 'String 5, fret 3 is {n:C}: the root of {c:C5}.',
      },
    },
    playerTask({
      id: 'open-riff-all',
      title: 'Power Chords: Open Riff, all 8 bars',
      song: 'st-power-chords-open',
      tempo: 87,
      minutes: 6,
      body: 'All 8 bars at about 80 BPM: {c:E5}, {c:A5} and {c:D5} in the open, and {c:G5} and {c:C5} with the movable shape. Every jump between them has a gap in front of it. When it is clean, go to 104 % (about 96 BPM).',
      tip: 'Look at the next root before the gap, and let finger 1 lead the move.',
    }),
    { generate: 'note-on-string', params: { strings: [6], frets: [0, 12], naturals: true, ask: 'find' } },
  ],
  facts: [
    { id: 'movable-root', front: 'In the movable power-chord shape, what names the chord?', back: 'The root under finger 1: string 6, fret 3 is {n:G}, so that shape is {c:G5}.' },
    { id: 'string-6-naturals', front: 'The natural notes on string 6 at frets 3, 5, 7 and 8?', back: '{n:G}, {n:A}, {n:B} and {n:C}. Fret 1 is {n:F}, fret 10 {n:D}, fret 12 {n:E}.' },
  ],
};

// ── 3. Palm muting ──────────────────────────────────────────────────────────────────────────────

const palmMuting: TeacherLesson = {
  id: 'palm-muting',
  title: 'Palm muting',
  teaches: 'Rest the edge of your picking hand on the strings by the bridge, and each chord turns short and thick.',
  minutes: 5,
  skill: 'teacher:mia:palm-muting',
  steps: [
    {
      type: 'card',
      title: 'The chug',
      body: 'Rest the edge of your picking hand, the side of the palm, lightly on the strings right where they leave the {t:bridge}. Now every note comes out short and thick: the classic rock chug. That is a {t:palm-mute}. The hand rests; it does not press.',
      tip: 'On an electric guitar, rest it on the strings just in front of the bridge saddles, the little blocks the strings cross.',
    },
    {
      type: 'choice',
      prompt: 'Where does the edge of your hand rest for a palm mute?',
      options: [
        { text: 'On the strings, right by the bridge', correct: true },
        { text: 'Over the soundhole', why: 'That far toward the neck the note dies to a thud. Stay right by the bridge.' },
        { text: 'Behind the bridge, off the strings', why: 'Off the strings the hand touches nothing, so the chord rings as usual.' },
      ],
      explain: 'Lightly on the strings, right where they leave the bridge. The notes still have pitch, they just stop short.',
      fact: 'palm-mute-where',
    },
    {
      type: 'card',
      title: 'A centimetre at a time',
      body: 'Too far toward the neck and the note dies; too far back and it rings almost like an open chord. Move your hand a centimetre at a time until you hear a tight chug that still has its note inside it.',
      figure: { kind: 'rhythm', pattern: 'e e e e e e e e | e e e e e e e e', time: '4/4', tempo: 80, caption: 'Eight chugs muted, then eight open, all downstrokes on {c:E5}.' },
    },
    {
      type: 'choice',
      prompt: 'Your muted chord rings almost like an open one. What do you do?',
      options: [
        { text: 'Move the hand a little toward the neck', correct: true },
        { text: 'Press the palm down hard', why: 'Pressing hard chokes the note and pushes it out of tune. Rest the hand lightly, and move it instead.' },
        { text: 'Lift the hand off', why: 'Then nothing mutes the strings at all.' },
      ],
      explain: 'Ringing means the hand is too far back, on or behind the bridge. Slide it a centimetre toward the neck and try again.',
      fact: 'palm-mute-where',
    },
    {
      type: 'play-phrase',
      prompt: 'Palm-mute the open string 6: eight even chugs, two on every click.',
      notes: [
        { string: 6, fret: 0, duration: 'e' },
        { string: 6, fret: 0, duration: 'e' },
        { string: 6, fret: 0, duration: 'e' },
        { string: 6, fret: 0, duration: 'e' },
        { string: 6, fret: 0, duration: 'e' },
        { string: 6, fret: 0, duration: 'e' },
        { string: 6, fret: 0, duration: 'e' },
        { string: 6, fret: 0, duration: 'e' },
      ],
      octave: 'exact',
      tempo: 80,
      explain: 'Eight short {n:E} notes on the open string 6. Muted, each still has its note, so the microphone hears it.',
      alternative: {
        type: 'tap-rhythm',
        prompt: 'Tap eight even chugs, two on every click.',
        rhythm: { pattern: 'e e e e e e e e' },
        tempo: 80,
        show: 'both',
        explain: 'Two chugs per click, all the same size: steady eighth notes, the engine of rock rhythm.',
      },
    },
    techniqueTask({
      id: 'palm-mute-80',
      title: 'Palm Muting at 80 BPM',
      exercise: 'tech-palm-mute',
      minutes: 4,
      body: 'Downstrokes on {c:E5} at 80 BPM: two bars muted, two bars open, over and over. Listen for the change: tight and thick, then big and ringing. Keep the hand resting on the strings in the muted bars.',
      tip: 'Forearm burning? Stop and shake it out. Speed comes from a loose wrist, not more force.',
    }),
    {
      type: 'card',
      title: 'Muted and open',
      body: 'Rock rhythm lives on the contrast between muted chugs and open, ringing chords. Chug, chug, chug, then let one chord ring out: after the chugs, that open chord sounds twice as big.',
    },
    {
      type: 'choice',
      prompt: 'What makes rock rhythm sound big?',
      options: [
        { text: 'Muted chugs against open, ringing chords', correct: true },
        { text: 'Every chord as loud as possible', why: 'If everything is loud, nothing stands out. The contrast does the work.' },
        { text: 'Muting every chord', why: 'All muted, it stays small. The open chords after the chugs make it big.' },
      ],
      explain: 'The contrast: tight chugs, then an open chord that rings. Each makes the other sound stronger.',
      fact: 'mute-contrast',
    },
    playerTask({
      id: 'open-riff-muted',
      title: 'The Open Riff, with muted E5',
      song: 'st-power-chords-open',
      tempo: 104,
      minutes: 4,
      body: 'Play the Open Riff at about 96 BPM and palm-mute every {c:E5} bar: bars 1, 3 and 5. Lift the hand off for the other shapes, so they ring open. Notice how the open chords jump out.',
    }),
    {
      type: 'tap-rhythm',
      prompt: 'Tap four muted chugs, then one open chord that rings for two beats.',
      rhythm: { pattern: 'e e e e h' },
      tempo: 80,
      show: 'both',
      explain: 'Four quick chugs on beats 1 and 2, then one long open chord on beat 3: muted, muted, then big.',
    },
    techniqueTask({
      id: 'palm-mute-ladder',
      title: 'Climb the Palm Muting ladder',
      exercise: 'tech-palm-mute',
      minutes: 4,
      body: 'Back to Palm Muting: after each clean pass, go up 8 BPM, from 80 toward 120. Clean means every chug even and the open bars ringing. If it gets messy, go back one step.',
      tip: 'Stop at the first burn in the forearm. Ten good minutes beat thirty tense ones.',
    }),
    {
      type: 'true-false',
      statement: 'If your hand sits far toward the neck, the chord dies to a dull thud.',
      answer: true,
      explain: 'Far from the bridge, the hand stops the strings completely. Come back toward the bridge until the note returns under the chug.',
      fact: 'palm-mute-where',
    },
  ],
  facts: [
    { id: 'palm-mute-where', front: 'Where does the picking hand rest for a palm mute?', back: 'The edge of the hand rests lightly on the strings, right where they leave the bridge. Too far toward the neck the note dies; too far back it rings.' },
    { id: 'mute-contrast', front: 'What does rock rhythm live on?', back: 'The contrast between muted chugs and open, ringing chords.' },
  ],
};

// ── 4. The 12-bar blues shuffle ─────────────────────────────────────────────────────────────────

/** The 12-bar blues in A, one chord a bar. */
const TWELVE_BAR_A = ['A', 'A', 'A', 'A', 'D', 'D', 'A', 'A', 'E', 'D', 'A', 'E'];
/** One bar of swung eighths: on every beat a long note and a short one (two thirds and one third of the beat). */
const SWING_BAR = 'et ~et et et ~et et et ~et et et ~et et';

const bluesShuffleInA: TeacherLesson = {
  id: 'blues-shuffle-in-a',
  title: 'The 12-bar blues shuffle',
  teaches: 'The 12-bar blues runs A A A A, D D A A, E D A E, and a shuffle plays each beat long-short.',
  minutes: 5,
  skill: 'teacher:mia:blues-shuffle-in-a',
  steps: [
    {
      type: 'card',
      title: 'Twelve bars that thousands share',
      body: 'The {t:twelve-bar-blues|12-bar blues} is a chord pattern of 12 bars that thousands of songs share. In A: four bars of {c:A}, two of {c:D}, two of {c:A}, then {c:E}, {c:D}, {c:A}, {c:E}. Its chords are built on the 1st, 4th and 5th notes of the key: {n:A}, {n:D} and {n:E}.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: [...TWELVE_BAR_A], beats: 2, tempo: 120 }, label: 'Hear the 12 bars, quickly' },
    },
    {
      type: 'choice',
      prompt: 'The chords of a blues in A are built on which notes of the key?',
      options: [
        { text: 'The 1st, 4th and 5th: {n:A}, {n:D}, {n:E}', correct: true },
        { text: 'The 1st, 2nd and 3rd: {n:A}, {n:B}, {n:C#}', why: 'Those are the first three notes of the scale. The blues uses the 1st, 4th and 5th.' },
        { text: 'The 1st, 5th and 6th: {n:A}, {n:E}, {n:F#}', why: '{n:F#} is the 6th. The blues chords are on the 1st, 4th and 5th.' },
      ],
      explain: 'Count up the {k:A major} scale, {n:A} {n:B} {n:C#} {n:D} {n:E}: {n:A} is the 1st, {n:D} the 4th, {n:E} the 5th. In roman numerals, {r:I}, {r:IV} and {r:V}.',
      fact: 'blues-chords',
    },
    {
      type: 'order',
      prompt: 'Put the three lines of the 12-bar blues in order, four bars each.',
      tiles: ['{c:A} {c:A} {c:A} {c:A}', '{c:D} {c:D} {c:A} {c:A}', '{c:E} {c:D} {c:A} {c:E}'],
      distractors: ['{c:E} {c:E} {c:A} {c:A}'],
      explain: 'Four bars of {c:A}; two of {c:D} and two of {c:A}; then {c:E}, {c:D}, {c:A}, and an {c:E} that turns back to the top.',
      fact: 'twelve-bar-form',
    },
    {
      type: 'card',
      title: 'Swing: long-short',
      body: 'A {t:shuffle} swings its eighth notes: every beat is split long-short, like a heartbeat, "daa-da, daa-da". The first note of each pair takes two thirds of the beat, the second only one third. Even eighths sound stiff in a blues.',
      figure: { kind: 'rhythm', pattern: SWING_BAR, time: '4/4', tempo: 80, caption: 'One bar of swung eighths: long-short on every beat.' },
    },
    {
      type: 'listen-choice',
      prompt: 'Straight or swung? Listen to the eighth notes.',
      sound: { kind: 'rhythm', pattern: SWING_BAR, tempo: 80 },
      options: [{ text: 'Swung: long-short', correct: true }, { text: 'Straight: even' }],
      shuffle: false,
      explain: 'Long-short, long-short: swung. Straight eighths split each beat exactly in half.',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap swung eighths: long-short on every click, "daa-da, daa-da".',
      rhythm: { pattern: SWING_BAR },
      tempo: 80,
      show: 'both',
      explain: 'The long note on the click, the short one just before the next click: the shuffle feel.',
      fact: 'shuffle-feel',
    },
    toolTask({
      id: 'swing-strum',
      title: 'Straight, then swung',
      tool: 'rhythm',
      params: ['strum', 'swung-eighths'],
      minutes: 3,
      body: 'Play the Swung down-up pattern for a minute: long down, short up. Then pick Down-up eighths in the library and play it straight for a minute. Hear the difference, then finish on swung.',
    }),
    {
      type: 'card',
      title: 'The shuffle on A',
      body: 'Two strings at a time. On {c:A}: the open string 5 ({n:A}) with string 4, fret 2 ({n:E}) under finger 1, then with string 4, fret 4 ({n:F#}) under finger 3, back and forth. On {c:D}, the same on strings 4 and 3. On {c:E}, on strings 6 and 5, with fret 4 ({n:C#}).',
      figure: {
        kind: 'fretboard',
        frets: [0, 5],
        labels: 'finger',
        dots: [
          { string: 5, fret: 0, note: 'A2', role: 'root', label: 'A' },
          { string: 4, fret: 2, note: 'E3', finger: 1 },
          { string: 4, fret: 4, note: 'F#3', finger: 3 },
        ],
        caption: 'On {c:A}: the open string 5 with fret 2, then fret 4, of string 4.',
      },
    },
    {
      type: 'fretboard-find',
      prompt: 'In the {c:D} bars, finger 3 moves to string 3, fret 4. Tap that note.',
      find: { note: 'B3' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 5],
      strings: [3],
      explain: 'String 3, fret 4 is {n:B}. On {c:D} the shuffle is the open string 4 ({n:D}) with string 3, fret 2 ({n:A}), then fret 4 ({n:B}).',
      fact: 'shuffle-figure',
    },
    playerTask({
      id: 'shuffle-loop',
      title: 'One bar of each chord, swung',
      song: 'st-blues-shuffle-a',
      bars: [8, 10],
      tempo: 71,
      minutes: 4,
      body: 'Loop bars 8 to 10 at about 60 BPM: one bar each of {c:A}, {c:E} and {c:D}, long-short on every beat. Lift fingers 1 and 3 together after the last short note and land them on the next two strings on the beat.',
    }),
    playerTask({
      id: 'shuffle-whole',
      title: '12-Bar Blues Shuffle in A',
      song: 'st-blues-shuffle-a',
      tempo: 86,
      minutes: 6,
      body: 'The whole study, twice through the 12 bars, at about 72 BPM. Say "daa-da, daa-da" in your head and match it. When it swings without stopping, go to 105 % (about 88 BPM).',
      tip: 'Lost your place? Listen for the change to {c:D}: that is always bar 5.',
    }),
    {
      type: 'choice',
      prompt: 'In which bar does a 12-bar blues in A first change to {c:D}?',
      options: [{ text: 'Bar 5', correct: true }, { text: 'Bar 3' }, { text: 'Bar 9', why: 'Bar 9 is the first {c:E}.' }, { text: 'Bar 2' }],
      shuffle: false,
      explain: 'Four bars of {c:A}, then {c:D} in bars 5 and 6, back to {c:A} in bar 7, and {c:E} in bar 9.',
      fact: 'twelve-bar-form',
    },
  ],
  facts: [
    { id: 'twelve-bar-form', front: 'The 12-bar blues in A, bar by bar?', back: '{c:A} {c:A} {c:A} {c:A}, {c:D} {c:D} {c:A} {c:A}, {c:E} {c:D} {c:A} {c:E}.' },
    { id: 'blues-chords', front: 'A 12-bar blues uses chords on which notes of the key?', back: 'The 1st, 4th and 5th: in A, {c:A}, {c:D} and {c:E}.' },
    { id: 'shuffle-feel', front: 'What is a shuffle?', back: 'Eighth notes swung long-short on every beat, like a heartbeat: "daa-da, daa-da".' },
    { id: 'shuffle-figure', front: 'The shuffle figure on {c:A}?', back: 'The open string 5 ({n:A}) with string 4 fret 2 ({n:E}), then with string 4 fret 4 ({n:F#}), swung long-short.' },
  ],
};

// ── 5. John Henry ───────────────────────────────────────────────────────────────────────────────

const johnHenry: TeacherLesson = {
  id: 'john-henry',
  title: 'John Henry: a blues ballad',
  teaches: 'Seventh chords give John Henry its blues colour: the 7 adds one slightly sour note the blues loves.',
  minutes: 5,
  skill: 'teacher:mia:john-henry',
  steps: [
    {
      type: 'card',
      title: 'A steel-driving man',
      body: 'John Henry is an early African American ballad about a steel-driving man who raced a steam drill. Its three {t:seventh-chord|seventh chords}, {c:E7}, {c:A7} and {c:B7}, give it the blues colour: the 7 adds one slightly sour note that the blues loves.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['E7', 'A7', 'E7', 'B7', 'E7'], beats: 4, tempo: 92 }, label: 'Hear the three chords' },
    },
    {
      type: 'card',
      title: 'E seven: one finger lifts',
      body: 'Hold {c:E}, then lift finger 3 off string 4. The open string 4 now rings {n:D}: that is the 7, the sour note. So {c:E7} is {n:E}, {n:G#}, {n:B} and {n:D}. You met {c:E7} with your first chords; now listen for its colour.',
      figure: { kind: 'chord', symbol: 'E7', frets: '020100', fingers: '020100', caption: '{c:E7}: the open string 4 adds the 7, {n:D}.' },
    },
    {
      type: 'fretboard-name',
      prompt: 'In {c:E7}, string 4 is played open. Which note does it add?',
      position: { string: 4, fret: 0 },
      ask: 'note',
      spelling: 'any',
      options: ['D', 'E', 'C', 'B'],
      explain: 'The open string 4 is {n:D}, the 7 of {c:E7}. In plain {c:E} that string is pressed at fret 2: {n:E}.',
      fact: 'e7-seventh',
    },
    {
      type: 'listen-choice',
      prompt: 'Plain {c:E}, or {c:E7}? Listen for the sour note.',
      sound: { kind: 'chord', chord: 'E7', style: 'strum' },
      options: [{ text: 'Plain {c:E}' }, { text: '{c:E7}, with the sour note', correct: true }],
      shuffle: false,
      explain: 'That was {c:E7}: the {n:D} on string 4 adds a slightly sour edge that wants to move on.',
    },
    {
      type: 'listen-choice',
      prompt: 'And this one: plain {c:E}, or {c:E7}?',
      sound: { kind: 'chord', chord: 'E', style: 'strum' },
      options: [{ text: 'Plain {c:E}', correct: true }, { text: '{c:E7}, with the sour note' }],
      shuffle: false,
      explain: 'That was plain {c:E}: bright and settled, with nothing sour in it.',
    },
    {
      type: 'play-chord',
      prompt: 'Strum {c:E7} on all six strings: finger 2 on string 5 fret 2, finger 1 on string 3 fret 1.',
      chord: 'E7',
      frets: '020100',
      explain: '{c:E7}: the open strings 6, 4, 2 and 1 ring with string 5 fret 2 and string 3 fret 1.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'E7',
        frets: '020100',
        accept: 'this-shape',
        prompt: 'Build {c:E7}: two fingers, six strings.',
        explain: 'String 5 fret 2 and string 3 fret 1, with strings 6, 4, 2 and 1 open.',
      },
    },
    {
      type: 'card',
      title: 'Drive it, and lean on 2 and 4',
      body: 'Drive the song with down-up eighths, and lean a little harder on beats 2 and 4: down-up, DOWN-up, down-up, DOWN-up. Those are the beats a drummer hits the snare on. Keep the hand moving like a pendulum the whole time.',
      figure: { kind: 'audio', sound: { kind: 'strum', chord: 'E7', pattern: 'DUDUDUDU', tempo: 92, repeat: 2 }, label: 'Hear down-up on {c:E7}' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap only the beats you lean on: 2 and 4.',
      rhythm: { pattern: 'qr q qr q | qr q qr q' },
      tempo: 92,
      show: 'both',
      explain: 'Silent on 1 and 3, a tap on 2 and 4: the backbeat. In the song your hand strums every eighth, and these two get the {t:accent|accents}.',
      fact: 'backbeat-lean',
    },
    toolTask({
      id: 'seventh-changes',
      title: 'One-minute changes: E seven, A seven',
      tool: 'chords',
      params: ['trainer', 'e-7', 'a-7'],
      minutes: 3,
      body: 'One minute of {c:E7} to {c:A7} and back, counting the changes where every string rang. Then pick {c:E7} and {c:B7} for another minute. Note both scores.',
      tip: 'From {c:E7} to {c:B7}, finger 2 stays on string 5, fret 2. Let it lead.',
    }),
    {
      type: 'choice',
      prompt: 'In {c:A7}, which open string adds the 7?',
      options: [
        { text: 'String 3: {n:G}', correct: true },
        { text: 'String 1: {n:E}', why: '{n:E} is the fifth of {c:A7}. The 7 is {n:G}, on the open string 3.' },
        { text: 'String 5: {n:A}', why: 'The open string 5 is the root, {n:A}.' },
      ],
      explain: '{c:A7} is {n:A}, {n:C#}, {n:E} and {n:G}. In its shape the open string 3 plays the {n:G}, where plain {c:A} has fret 2.',
      fact: 'e7-seventh',
    },
    playerTask({
      id: 'john-henry-play',
      title: 'John Henry',
      song: 'john-henry',
      tempo: 87,
      minutes: 5,
      body: 'Play John Henry at about 80 BPM: down-up eighths on {c:E7}, {c:A7} and {c:B7}, leaning on 2 and 4. When the changes land on time, go to 100 % (92 BPM).',
      fallback: {
        tool: 'progressions',
        params: ['blues-12-bar', 'e', 'jam'],
        title: 'Jam on E seven, A seven and B seven',
        body: 'John Henry is not in the Songs library yet, so jam on its three chords, {c:E7}, {c:A7} and {c:B7}, in a 12-bar blues in E. In the band options pick the Pop / Rock style for straight eighths, set 80 BPM, and strum down-up, leaning on 2 and 4. Then try 92.',
      },
    }),
    { generate: 'chord-shape', params: { chords: ['E7', 'A7', 'B7'] } },
  ],
  facts: [
    { id: 'e7-seventh', front: 'In {c:E7} and {c:A7}, where is the 7?', back: '{c:E7}: the open string 4, {n:D}. {c:A7}: the open string 3, {n:G}. In plain {c:E} and {c:A} those strings are pressed at fret 2.' },
    { id: 'backbeat-lean', front: 'In a driving down-up strum, which beats do you lean on?', back: 'Beats 2 and 4, where the drummer hits the snare.' },
  ],
};

// ── 6. Write your own riff ──────────────────────────────────────────────────────────────────────

/** Mia's example riff as the roots of its power chords on string 6 (E5 open, G5 fret 3, A5 fret 5). */
const MIA_RIFF_ROOTS = [
  { string: 6, fret: 0, duration: 'e' },
  { string: 6, fret: 0, duration: 'e' },
  { string: 6, fret: 3, duration: 'e' },
  { rest: true, duration: 'e' },
  { string: 6, fret: 0, duration: 'e' },
  { string: 6, fret: 0, duration: 'e' },
  { string: 6, fret: 5, duration: 'e' },
  { rest: true, duration: 'e' },
  { string: 6, fret: 0, duration: 'e' },
  { string: 6, fret: 0, duration: 'e' },
  { string: 6, fret: 3, duration: 'e' },
  { rest: true, duration: 'e' },
  { string: 6, fret: 5, duration: 'q' },
  { rest: true, duration: 'q' },
] as const;
/** Its rhythm: the same hits and gaps. */
const MIA_RIFF_RHYTHM = 'e e e er e e e er | e e e er q qr';

const yourOwnRiff: TeacherLesson = {
  id: 'your-own-riff',
  title: 'Write your own riff',
  teaches: 'A riff is a short repeated pattern: keep it two bars, leave a gap, and play it the same way every time.',
  minutes: 5,
  skill: 'teacher:mia:your-own-riff',
  steps: [
    {
      type: 'card',
      title: 'A riff of your own',
      body: 'A {t:riff} is a short, catchy pattern repeated through a song, and you have all you need to write one: power chords, palm muting, rests and accents. Three rules. One: keep it short, two bars. Two: leave a gap; the silence is part of the riff. Three: play it the same way every time, so the band can lock onto it.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each rule with what it asks.',
      pairs: [
        { left: 'Rule one', right: 'Keep it to two bars' },
        { left: 'Rule two', right: 'Leave a gap' },
        { left: 'Rule three', right: 'Same way every time' },
      ],
      explain: 'Short, with a gap, and the same every time: then it is catchy, it breathes, and the band can lock onto it.',
      fact: 'riff-rules',
    },
    {
      type: 'card',
      title: 'Mia\'s riff',
      body: 'Here is one I wrote from four kinds of slot: a palm-muted {c:E5} chug, {c:G5}, {c:A5}, or a rest. Bar 1: chug, chug, {c:G5}, gap, chug, chug, {c:A5}, gap. Bar 2: chug, chug, {c:G5}, gap, then {c:A5} for a beat and a beat of silence before it starts again.',
      figure: { kind: 'rhythm', pattern: MIA_RIFF_RHYTHM, time: '4/4', tempo: 80, caption: 'The hits and gaps of Mia\'s riff, at 80 BPM.' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap the hits of Mia\'s riff, and stay silent in the gaps.',
      rhythm: { pattern: MIA_RIFF_RHYTHM },
      tempo: 80,
      show: 'both',
      explain: 'Three hits and a gap, three hits and a gap, three hits and a gap, then one long hit and a beat of silence. The gaps make it groove.',
    },
    {
      type: 'card',
      title: 'Start with the roots',
      body: 'Learn a riff from its roots first. Every power chord here has its root on string 6: the open string is {c:E5}, fret 3 {c:G5}, fret 5 {c:A5}. Play the roots alone, palm-muted, until the pattern is in your hands. Then make each one a power chord.',
      figure: { kind: 'tab', tempo: 80, notes: [...MIA_RIFF_ROOTS], caption: 'The roots on string 6: 0 is {c:E5}, 3 is {c:G5}, 5 is {c:A5}.' },
    },
    {
      type: 'play-phrase',
      prompt: 'Play the roots on string 6: open, open, fret 3, gap; open, open, fret 5, gap; then open, open, fret 3, gap, and fret 5.',
      notes: [...MIA_RIFF_ROOTS],
      octave: 'exact',
      tempo: 80,
      explain: 'The open string 6 is {n:E} for {c:E5}, fret 3 is {n:G} for {c:G5}, fret 5 is {n:A} for {c:A5}. The rests are where your hand moves.',
      alternative: {
        type: 'order',
        prompt: 'Put the chords of Mia\'s first bar in order, gaps left out.',
        tiles: ['{c:E5}', '{c:E5}', '{c:G5}', '{c:E5}', '{c:E5}', '{c:A5}'],
        distractors: ['{c:D5}'],
        explain: 'Chug, chug, {c:G5}, then chug, chug, {c:A5}: the {c:E5} chugs between two moves up string 6.',
      },
    },
    {
      type: 'card',
      title: 'Now build yours',
      body: 'Two bars, eight slots each. Fill every slot with {c:E5} (muted), {c:G5}, {c:A5} or a rest. Tap it on your knee first, then play it slowly. Change one slot at a time until you like it, and write it down: E E G - E E A - is enough.',
      tip: 'Stuck? Start from my riff and change just the last two slots.',
    },
    toolTask({
      id: 'riff-loop',
      title: 'Loop your riff at 80 BPM',
      tool: 'metronome',
      minutes: 4,
      body: 'Set the Metronome to 80 BPM and play your riff over and over. The goal: 8 times in a row without a slip. If you slip, start counting again from one. Same way every time: that is rule three.',
    }),
    {
      type: 'choice',
      prompt: 'Your riff feels busy, and the band cannot find the beat in it. Which rule helps most?',
      options: [
        { text: 'Leave a gap', correct: true },
        { text: 'Play it faster', why: 'Faster only makes a busy riff busier. Take some notes out instead.' },
        { text: 'Change it every time', why: 'Changing it makes it harder still for the band to lock on. Keep it the same.' },
      ],
      explain: 'Take a slot or two out and leave silence. A gap gives the riff its shape, and the band can hear where it starts.',
      fact: 'riff-rules',
    },
    toolTask({
      id: 'riff-jam',
      title: 'Your riff with the band',
      tool: 'progressions',
      params: ['rock-i-biii-iv', 'e', 'jam'],
      minutes: 5,
      body: 'The band plays {c:E5}, {c:G5}, {c:A5}, {c:E5}. Set it to 100 BPM. Play your riff for 4 bars, then strum the chords with the band for 4 bars, and repeat. If you can, record a take on your phone and listen back.',
      tip: 'Coming back in after the chords? Count "1 & 2 &" and start the riff exactly on beat 1.',
    }),
    {
      type: 'true-false',
      statement: 'Playing your riff the same way every time helps the band lock onto it.',
      answer: true,
      explain: 'A riff is something the band can count on. Same notes, same gaps, every time: then drums and bass can build around it.',
      fact: 'riff-rules',
    },
  ],
  facts: [
    { id: 'riff', front: 'What is a riff?', back: 'A short, catchy pattern repeated through a song.' },
    { id: 'riff-rules', front: 'Mia\'s three rules for a riff?', back: 'Keep it short (two bars), leave a gap, and play it the same way every time.' },
  ],
};

/** Unit 9 of Mia's course. */
const unit: TeacherUnit = {
  id: 'mia-power-chords',
  title: 'Power chords and the blues',
  theme: 'chords',
  description: 'Play power chords open and up the neck, palm-mute, shuffle through a 12-bar blues and write a riff of your own.',
  lessons: [powerChords, movablePowerChords, palmMuting, bluesShuffleInA, johnHenry, yourOwnRiff],
  checkpoint: { sample: 8, maxMistakes: 2 },
  glossary: [
    { id: 'fifth', term: 'fifth', definition: 'The distance from a note to the note five letter names higher, counting both: G up to D is a fifth.' },
    { id: 'palm-mute', term: 'palm mute', definition: 'Resting the edge of the picking hand lightly on the strings by the bridge, so notes come out short and thick.' },
    { id: 'twelve-bar-blues', term: '12-bar blues', definition: 'A 12-bar chord pattern on the 1st, 4th and 5th notes of a key. In A: A A A A, D D A A, E D A E.' },
    { id: 'shuffle', term: 'shuffle', definition: 'A rhythm that swings its eighth notes long-short, like a heartbeat: the first of each pair two thirds of the beat.' },
    { id: 'accent', term: 'accent', definition: 'A note or strum played a little louder than the ones around it, such as beat 1 of every bar.' },
    { id: 'riff', term: 'riff', definition: 'A short, catchy pattern of notes or chords repeated through a song, often on the low strings.' },
  ],
};

export default unit;
