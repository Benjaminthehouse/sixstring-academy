/**
 * Prof. Varga, unit 9: Classical technique (plan: `elena/elena-classical-technique` in
 * src/content/plan/teachers.json).
 *
 * Elena's voice: rigorous, dry, respectful. Classical position and the two strokes, right-hand
 * arpeggios, two voices on one guitar, slurs, guided shifts and partial barres, classical vibrato
 * and tone colour, and tremolo. Each tab a card shows is the Technique exercise's own material
 * (`@/content/technique`) or a passage of a library piece, cross-checked note for note in
 * `elena-classical-technique.test.ts`.
 *
 * The plan's classical solos (Giuliani's Op. 1, Aguado, Carulli, Sor, the two-voice Minuet in G,
 * Lagrima, Adelita, Recuerdos) are not in the song library: they need a printed edition. Each task
 * that named one goes to the nearest library study instead, says so, and tells the learner how to
 * bring their own edition in (Scan & Import, in Tools):
 *   Giuliani's arpeggio studies   -> Fingerstyle: p i m a (`st-pima-arpeggios`, 66 BPM)
 *   Aguado's Estudio in A minor   -> Fingerstyle: p i m a m i in 3/4 (`st-pimami-3-4`, 66 BPM)
 *   Carulli, Sor (two voices)     -> Duet: Baroque-Style Duo in D minor (`st-duet-baroque`, 108 BPM)
 *   Minuet in G, both voices      -> Greensleeves, fingerstyle solo (`greensleeves-fingerstyle`, 81 BPM)
 *   Lagrima (partial barres)      -> Chord Melody: First Ballad (`st-chord-melody-1`, 66 BPM)
 *   Adelita (vibrato, colour)     -> Greensleeves, fingerstyle solo
 *   Recuerdos (tremolo)           -> the Concert Tremolo Etude (`st-concert-tremolo-etude`), with
 *                                    the Technique exercise as its fallback until it is in the library
 * The two-voice card shows bars 1 and 2 of the duo, both lines, from the library file.
 */
import type { TabNote } from '@/lessons';
import type { TeacherLesson, TeacherUnit } from '../types';
import { playerTask, techniqueTask, toolTask } from '../tasks';

/** One tab note. */
function t(string: number, fret: number, duration: string): TabNote {
  return { string, fret, duration };
}

/** The Rest Stroke Scale, eighths: the notes of C major on strings 3 to 1, G up to G and back. */
export const REST_STROKE_EIGHTHS: TabNote[] = [
  t(3, 0, 'e'), t(3, 2, 'e'), t(2, 0, 'e'), t(2, 1, 'e'), t(2, 3, 'e'), t(1, 0, 'e'), t(1, 1, 'e'), t(1, 3, 'e'),
  t(1, 1, 'e'), t(1, 0, 'e'), t(2, 3, 'e'), t(2, 1, 'e'), t(2, 0, 'e'), t(3, 2, 'e'), t(3, 0, 'q'),
];

/** p-i-m-i on C (x32010), twice. */
export const PIMI_C: TabNote[] = [t(5, 3, 'e'), t(3, 0, 'e'), t(2, 1, 'e'), t(3, 0, 'e'), t(5, 3, 'e'), t(3, 0, 'e'), t(2, 1, 'e'), t(3, 0, 'e')];

/** p-i-m-a-m-i on C: one bar of 3/4. */
export const PIMAMI_C: TabNote[] = [t(5, 3, 'e'), t(3, 0, 'e'), t(2, 1, 'e'), t(1, 0, 'e'), t(2, 1, 'e'), t(3, 0, 'e')];

/** A recording of p-i-m-a on C in which a is a sixteenth late: what the learner listens for. */
export const LATE_A: TabNote[] = [t(5, 3, 'e'), t(3, 0, 'e'), t(2, 1, 'e.'), t(1, 0, 's'), t(5, 3, 'e'), t(3, 0, 'e'), t(2, 1, 'e.'), t(1, 0, 's')];

/** The Baroque-style duo, bars 1 and 2: the upper voice (the learner's part). */
export const DUO_UPPER: TabNote[] = [t(2, 3, 'e'), t(1, 0, 'e'), t(1, 1, 'q'), t(1, 0, 'e'), t(2, 3, 'e'), t(2, 2, 'e'), t(2, 3, 'e'), t(1, 0, 'e'), t(1, 1, 'e'), t(1, 3, 'q')];

/** The Baroque-style duo, bars 1 and 2: the bass line. */
export const DUO_BASS: TabNote[] = [t(4, 0, 'h'), t(5, 0, 'q'), t(5, 4, 'h'), t(5, 0, 'q')];

/** Hammer and Pull Chains on string 1: pick A, hammer B and C; pick C, pull off to B and A. */
export const SLURS_S1: TabNote[] = [t(1, 5, 'e'), t(1, 7, 'e'), t(1, 8, 'e'), t(1, 8, 'e'), t(1, 7, 'e'), t(1, 5, 'e'), { rest: true, duration: 'q' }];

/** Clean Position Shifts, quarters: finger 1 at frets 2, 5 and 9 of string 3, finger 3 at 4 and 7. */
export const SHIFTS: TabNote[] = [
  t(3, 2, 'q'), t(3, 4, 'q'), t(3, 5, 'q'), t(3, 7, 'q'),
  t(3, 9, 'q'), t(3, 7, 'q'), t(3, 5, 'q'), t(3, 4, 'q'),
  t(3, 2, 'h.'), { rest: true, duration: 'q' },
];

/** Up string 3 on the guide finger: A B C D E. */
export const SHIFTS_UP: TabNote[] = [t(3, 2, 'q'), t(3, 4, 'q'), t(3, 5, 'q'), t(3, 7, 'q'), t(3, 9, 'h')];

/** Classical Tremolo, open strings, one bar: p on strings 6, 5, 4, 5; a-m-i on the open string 1. */
export const TREMOLO_OPEN: TabNote[] = [6, 5, 4, 5].flatMap((bass) => [t(bass, 0, 's'), t(1, 0, 's'), t(1, 0, 's'), t(1, 0, 's')]);

/** A tremolo that gallops: the thumb takes half the beat, a-m-i crowd into the other half. */
export const GALLOP: TabNote[] = [6, 5].flatMap((bass) => [t(bass, 0, 'e'), t(1, 0, 'st'), t(1, 0, 'st'), t(1, 0, 'st')]);

// ── 1. Classical position and the two strokes ───────────────────────────────────────────────────

const classicalPosition: TeacherLesson = {
  id: 'the-classical-position',
  title: 'Classical position and the two strokes',
  teaches: 'Sit with the headstock at eye level; a free stroke clears the next string, a rest stroke lands on it.',
  minutes: 5,
  skill: 'teacher:elena:the-classical-position',
  steps: [
    {
      type: 'card',
      title: 'The classical position',
      body: 'The classical position raises the guitar: left foot on a footstool, or a support under the guitar; the guitar on the left thigh; the headstock at about eye level. The reason is the fretting hand: from there it reaches the whole neck with a straight wrist. Left-handed players mirror all of it.',
      tip: 'If your lower back objects to the footstool, use a support on the thigh instead. The guitar should rise, not your hip.',
    },
    {
      type: 'choice',
      prompt: 'Why does the classical position bring the headstock up to eye level?',
      options: [
        { text: 'So the fretting wrist stays straight', correct: true },
        { text: 'So you can see the fret markers', why: 'Your eyes find the markers in any position. The height is for the hand.' },
        { text: 'Tradition, and nothing more', why: 'Traditions rarely survive two centuries without a reason. Here the reason is the wrist.' },
        { text: 'So the guitar sounds louder', why: 'The angle changes your reach, not the volume.' },
      ],
      explain: 'Raised on the left thigh, the neck comes to the fretting hand: it reaches the high frets as easily as the low ones, with a straight wrist.',
      fact: 'classical-position',
    },
    techniqueTask({
      id: 'posture',
      title: 'Posture: the classical version',
      exercise: 'tech-posture',
      minutes: 3,
      body: 'Open Posture: Sitting and Standing and set up its classical version: footstool or support, guitar on the left thigh, headstock at eye level. Then strum the slow minute of {c:Em} it asks for and go down its checklist: both wrists nearly straight, shoulders low.',
      tip: 'Nothing should ache after twenty minutes. If something does, the position is wrong, not your body.',
    }),
    {
      type: 'card',
      title: 'Two strokes',
      body: 'The {t:free-stroke|free stroke} (tirando) plucks the string and clears the next one, finishing in the air. The {t:rest-stroke|rest stroke} (apoyando) plucks through the string and comes to rest on the next one toward string 6: a fuller, louder tone. Arpeggios need free strokes, so the next string keeps ringing; a singing line can take rest strokes.',
    },
    {
      type: 'choice',
      prompt: 'A rest stroke on string 2. Where does the finger finish?',
      options: [
        { text: 'Resting on string 3', correct: true },
        { text: 'In the air above string 3', why: 'That is the free stroke: it clears the next string.' },
        { text: 'Resting on string 1', why: 'A rest stroke travels toward string 6, so from string 2 it lands on string 3.' },
      ],
      explain: 'The rest stroke comes to rest on the next string toward string 6: from string 2, string 3. Which is also why it cannot be used where string 3 must keep ringing.',
      fact: 'free-and-rest-strokes',
    },
    {
      type: 'play-note',
      id: 'free-stroke',
      prompt: 'Play {n:C}, string 2 fret 1, with i and a free stroke: the finger clears string 3. Note the level on the meter.',
      note: 'C4',
      octave: 'exact',
      where: { string: 2, fret: 1 },
      explain: 'String 2 fret 1 is {n:C}. The free stroke finishes in the air above string 3. Remember how far the meter rose.',
      alternative: {
        type: 'choice',
        prompt: 'No microphone: a free stroke on string 2. Where does i finish?',
        options: [
          { text: 'In the air, clear of string 3', correct: true },
          { text: 'Resting on string 3', why: 'That is the rest stroke.' },
          { text: 'Resting on string 1', why: 'The stroke travels toward string 6, not away from it.' },
        ],
        explain: 'In the air, clear of string 3, which keeps ringing if it was. Record both strokes on your phone later and compare them.',
      },
    },
    {
      type: 'play-note',
      id: 'rest-stroke',
      prompt: 'The same {n:C} with a rest stroke: i plucks through and lands on string 3. The meter should rise higher.',
      note: 'C4',
      octave: 'exact',
      where: { string: 2, fret: 1 },
      explain: 'Same note, fuller tone: the rest stroke pushes the string toward the top of the guitar, which then moves more. If the meter barely changed, push into the string, not across it.',
      alternative: {
        type: 'true-false',
        statement: 'On the same note, a rest stroke gives a fuller, louder tone than a free stroke.',
        answer: true,
        explain: 'It drives the string toward the top of the guitar. Record a free and a rest stroke on your phone and listen: the second should be rounder and louder.',
      },
    },
    {
      type: 'card',
      title: 'The Rest Stroke Scale',
      body: 'Now a scale in rest strokes: the notes of {k:C major} on strings 3 to 1 in first position, {n:G} up to {n:G} and back, strictly alternating i and m. If you use nails, keep them smooth and shaped to follow the fingertip: a rough edge rasps.',
      figure: { kind: 'tab', tempo: 60, notes: REST_STROKE_EIGHTHS, caption: 'Eighths, i and m alternating: {n:G} {n:A} {n:B} {n:C} {n:D} {n:E} {n:F} {n:G} and back.' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each word with its meaning.',
      pairs: [
        { left: 'Tirando', right: 'The free stroke' },
        { left: 'Apoyando', right: 'The rest stroke' },
        { left: 'Footstool', right: 'Under the left foot' },
        { left: 'Nails', right: 'Smooth, shaped to the tip' },
      ],
      explain: 'Tirando and apoyando are the Spanish names of the two strokes. The footstool raises the left leg; nails, if you use them, are smooth and follow the fingertip.',
    },
    techniqueTask({
      id: 'rest-stroke-scale',
      title: 'Rest Stroke Scale at 60 BPM',
      exercise: 'tech-rest-stroke',
      minutes: 6,
      body: 'At 60 {t:bpm|BPM}: quarters, then eighths, every note a rest stroke, i and m strictly alternating. Say "i, m" aloud if the order slips. A microphone take reports any note that did not sound. Over the coming weeks, 4 BPM a rung toward 120.',
      tip: 'The hand stays still; each finger moves from its big knuckle and falls onto the next string.',
    }),
    {
      type: 'fretboard-find',
      prompt: 'Tap the notes of the scale on string 2, from the open string to fret 3.',
      find: { scale: 'major', tonic: 'C' },
      mode: 'all',
      octave: 'any',
      strings: [2],
      frets: [0, 3],
      explain: 'The open {n:B}, {n:C} at fret 1 and {n:D} at fret 3: i, m, i on the way up.',
    },
    {
      type: 'choice',
      prompt: 'Which finger order does the Rest Stroke Scale demand?',
      options: [
        { text: 'i m i m: never one finger twice', correct: true },
        { text: 'i i m m, in pairs', why: 'A finger used twice has no time to recover: the second note is late or weak.' },
        { text: 'p i m a, all four in turn', why: 'The thumb and a sit this one out. The scale trains the i-m alternation.' },
      ],
      explain: 'Strict alternation: each finger recovers while the other plays. That is what makes a fast scale possible later.',
      fact: 'im-alternation',
    },
  ],
  facts: [
    { id: 'classical-position', front: 'The classical position: where is the guitar, and why?', back: 'On the left thigh, raised by a footstool or a support, the headstock at about eye level, so the fretting hand reaches the whole neck with a straight wrist.' },
    { id: 'free-and-rest-strokes', front: 'Free stroke and rest stroke: the difference?', back: 'The free stroke (tirando) clears the next string. The rest stroke (apoyando) lands on the next string toward string 6: a fuller, louder tone.' },
    { id: 'im-alternation', front: 'How does the right hand play a scale?', back: 'Strictly alternating i and m, never one finger twice in a row.' },
  ],
};

// ── 2. Right-hand arpeggios ─────────────────────────────────────────────────────────────────────

const rightHandArpeggios: TeacherLesson = {
  id: 'right-hand-arpeggios',
  title: 'Right-hand arpeggios',
  teaches: 'Plant the fingers, keep the hand still, move each finger from its knuckle: arpeggios are judged by evenness.',
  minutes: 5,
  skill: 'teacher:elena:right-hand-arpeggios',
  steps: [
    {
      type: 'card',
      title: 'A hundred and twenty studies',
      body: 'Giuliani\'s 120 right-hand studies, his Op. 1, use just two chords, {c:C} and {c:G7}, and each isolates one pattern for {t:pima|p, i, m and a}. With the left hand idle, every unevenness you hear belongs to the right. Two centuries on, they remain the classic workout.',
      figure: { kind: 'chord', symbol: 'C', frets: 'x32010', fingers: 'x32010' },
    },
    {
      type: 'choice',
      prompt: 'Why do Giuliani\'s studies keep to {c:C} and {c:G7}?',
      options: [
        { text: 'So every fault you hear is the right hand\'s', correct: true },
        { text: 'Because those chords were all he knew', why: 'He wrote in every key. The restriction is deliberate.' },
        { text: 'So the studies can be sight-read', why: 'They can, but that is a side effect. The purpose is the right hand.' },
      ],
      explain: 'Two chords leave the left hand nothing to do, so each study isolates one right-hand pattern, and the ear hears only the right hand.',
      fact: 'giuliani-op1',
    },
    {
      type: 'card',
      title: 'Plant, then play',
      body: 'Plant the fingers before you play: p on the bass string, i, m and a resting on strings 3, 2 and 1. Keep the hand still and let each finger move from its knuckle. Evenness is the measure: no note louder, no note late. The first pattern, p-i-m-i, on {c:C}:',
      figure: { kind: 'tab', tempo: 60, notes: PIMI_C, caption: 'p-i-m-i on {c:C}: p on string 5, i on 3, m on 2, i on 3.' },
    },
    {
      type: 'play-phrase',
      prompt: 'Play p-i-m-i twice on {c:C}, eighths at 60 BPM, every note the same loudness.',
      notes: PIMI_C,
      octave: 'exact',
      tempo: 60,
      explain: '{n:C} {n:G} {n:C} {n:G}, twice: the bass from p, then i, m and i. If one note stood out, play the bar very quietly: the loud finger gives itself away.',
      alternative: {
        type: 'order',
        prompt: 'No guitar to hand? Put p-i-m-i on {c:C} in order, from the bass.',
        tiles: ['p: string 5', 'i: string 3', 'm: string 2', 'i: string 3'],
        distractors: ['a: string 1'],
        explain: 'p takes the bass on string 5, then i, m and i again on strings 3, 2 and 3. The a finger rests in this pattern.',
      },
    },
    techniqueTask({
      id: 'pima-ladder',
      title: 'Free-Stroke Arpeggios, up the ladder',
      exercise: 'tech-pima-free-stroke',
      minutes: 6,
      body: 'Four patterns on {c:C}: p-i-m-a, p-a-m-i, p-i-m-a-m-i in 3/4, then p alone against i, m and a plucked together. Free strokes throughout. Start at 60 {t:bpm|BPM} and climb 4 BPM a rung only after two even passes in a row. A microphone take reports how even the timing was.',
      tip: 'Play one bar very quietly. The loud finger, usually p or a, gives itself away.',
    }),
    {
      type: 'card',
      title: 'Six notes, and the pinch',
      body: 'Two more for the daily list. p-i-m-a-m-i fills a bar of 3/4 with six notes. The {t:pinch} is the thumb and a finger together, usually p and a: a bass and a melody note at once. On {c:G7} (320001) p moves to string 6.',
      figure: { kind: 'tab', tempo: 60, time: '3/4', notes: PIMAMI_C, caption: 'p-i-m-a-m-i on {c:C}: one bar of 3/4.' },
    },
    {
      type: 'choice',
      prompt: 'In a pinch, which fingers pluck together?',
      options: [
        { text: 'The thumb and a finger, usually a', correct: true },
        { text: 'i and m, side by side', why: 'Two fingers together make a small chord. A pinch always involves the thumb.' },
        { text: 'The thumb, twice in a row', why: 'That is a repeated bass. A pinch sounds two notes at once.' },
      ],
      explain: 'A pinch is the thumb and a finger together, most often p and a: the bass and the top note at once, which is how a melody rides above an arpeggio.',
      fact: 'pinch',
    },
    playerTask({
      id: 'pima-study',
      title: 'The arpeggio study at 60 BPM',
      song: 'st-pima-arpeggios',
      tempo: 91,
      minutes: 5,
      body: 'Giuliani\'s Op. 1 is not in the library; this study is its nearest relation: {c:C}, {c:Am}, {c:Dm} and {c:G7}, one pattern per chord, with pinches in bars 15 and 16. At about 60 BPM today, one chord\'s pattern a day if you like; then 100 % (66 BPM).',
      tip: 'Watch the thumb: its string follows the chord, 5 for {c:C} and {c:Am}, 4 for {c:Dm}, 6 for {c:G7}.',
    }),
    {
      type: 'listen-choice',
      prompt: 'A recording of p-i-m-a, twice. Even, or is a finger late?',
      sound: { kind: 'tab', notes: LATE_A, tempo: 60 },
      options: [{ text: 'Even' }, { text: 'The a finger is late', correct: true }, { text: 'The thumb is late' }],
      shuffle: false,
      explain: 'p, i and m fell on the eighths; a came a sixteenth late each time. Record your study on your phone and listen for exactly this: one finger, late, in every group.',
    },
    playerTask({
      id: 'estudio',
      title: 'An A minor arpeggio study',
      song: 'st-pimami-3-4',
      mode: 'wait',
      minutes: 8,
      body: 'Aguado\'s Estudio in {k:A minor} is not in the library; take this short study in the same key, also free of barres: p-i-m-a-m-i in 3/4. Wait mode first, then at 100 % (66 BPM). In bars 9 to 16 the a finger carries the tune: let it sing above the arpeggio.',
    }),
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'G7',
      frets: '320001',
      accept: 'this-shape',
      prompt: 'Build {c:G7} as the study holds it, with p\'s bass on string 6.',
      explain: '{c:G7} (320001): {n:G} at string 6 fret 3 for p, {n:B} at string 5 fret 2, the open {n:D}, {n:G} and {n:B}, and {n:F} at string 1 fret 1 under a.',
    },
    {
      type: 'choice',
      prompt: 'Evenness is the measure. What are you listening for?',
      multiple: true,
      options: [
        { text: 'A note louder than the others', correct: true },
        { text: 'A note that comes late', correct: true },
        { text: 'Notes ringing into each other', why: 'In an arpeggio they should: hold the chord and let it ring.' },
        { text: 'A tempo below 72 BPM', why: 'Slow is where evenness is built.' },
      ],
      explain: 'No note louder, no note late. The ringing is wanted, and the tempo is yours to choose.',
      fact: 'arpeggio-evenness',
    },
  ],
  facts: [
    { id: 'giuliani-op1', front: 'Giuliani\'s 120 right-hand studies, Op. 1: what is their method?', back: 'Only two chords, {c:C} and {c:G7}, so each study isolates one right-hand pattern.' },
    { id: 'arpeggio-evenness', front: 'How is a right-hand arpeggio judged?', back: 'By evenness: no note louder, no note late. Fingers planted, hand still, each finger moving from its knuckle.' },
    { id: 'pinch', front: 'What is a pinch?', back: 'The thumb and a finger plucking together, usually p and a: a bass and a melody note at once.' },
  ],
};

// ── 3. Two voices: Carulli and Sor ──────────────────────────────────────────────────────────────

const firstClassicalPieces: TeacherLesson = {
  id: 'first-classical-pieces',
  title: 'Two voices: Carulli and Sor',
  teaches: 'Two voices on one guitar: p plays the bass, i and m the melody, and each voice keeps its own note lengths.',
  minutes: 5,
  skill: 'teacher:elena:first-classical-pieces',
  steps: [
    {
      type: 'card',
      title: 'Two voices, one guitar',
      body: 'Two voices on one guitar: the thumb plays the bass, i and m the melody, and each voice keeps its own note lengths. Carulli\'s Andantino, Op. 241 No. 5, keeps the two clearly apart; Sor\'s Op. 60 No. 1 asks them to move independently, in first position. A melody from the library\'s Baroque-style duo:',
      figure: {
        kind: 'staff',
        key: 'D minor',
        time: '3/4',
        notes: [
          { note: 'D4', duration: 'e' }, { note: 'E4', duration: 'e' }, { note: 'F4', duration: 'q' }, { note: 'E4', duration: 'e' }, { note: 'D4', duration: 'e' },
          { note: 'C#4', duration: 'e' }, { note: 'D4', duration: 'e' }, { note: 'E4', duration: 'e' }, { note: 'F4', duration: 'e' }, { note: 'G4', duration: 'q' },
        ],
        caption: 'The upper voice, bars 1 and 2: quick notes, mostly eighths.',
      },
    },
    {
      type: 'card',
      title: 'And its bass',
      body: 'Beneath it, the bass moves in half notes. Sustain each for its full value: lifting a finger early is the commonest fault in this music, and the bass simply stops. In bar 2, finger 4 holds {n:C#} at string 5 fret 4 for two whole beats while the melody runs above it.',
      figure: {
        kind: 'staff',
        key: 'D minor',
        time: '3/4',
        notes: [{ note: 'D3', duration: 'h' }, { note: 'A2', duration: 'q' }, { note: 'C#3', duration: 'h' }, { note: 'A2', duration: 'q' }],
        caption: 'The bass, bars 1 and 2: a half note and a quarter, twice.',
      },
      tip: 'On one staff the two voices are told apart by their stems: up for the melody, down for the bass. The Theory Path\'s "Stems, beams and reading rhythm" shows how.',
    },
    {
      type: 'choice',
      prompt: 'The commonest fault when two voices share one guitar?',
      options: [
        { text: 'Lifting a bass finger early', correct: true },
        { text: 'Playing the melody with i and m', why: 'That is the method, not the fault.' },
        { text: 'Holding the bass too long', why: 'Its written value is the limit, and most players fall short of it, not past it.' },
        { text: 'Plucking the bass with p', why: 'The thumb is exactly the right finger for it.' },
      ],
      explain: 'The bass is let go so the hand can get on with the melody, and the bass line simply stops. Hold it for its full value, then move.',
      fact: 'two-voices',
    },
    {
      type: 'play-phrase',
      prompt: 'The bass alone, bars 1 and 2, thumb only. Hold each half note for two full beats.',
      notes: DUO_BASS,
      octave: 'exact',
      tempo: 60,
      explain: '{n:D}, {n:A}, {n:C#}, {n:A}: the open string 4, the open string 5, string 5 fret 4 with finger 4, and the open string 5 again. Each half note rings until beat 3.',
      alternative: {
        type: 'tap-rhythm',
        prompt: 'Tap the bass rhythm: a half note and a quarter, twice.',
        rhythm: { pattern: 'h q | h q', time: '3/4' },
        tempo: 60,
        show: 'both',
        explain: 'Half note, quarter, twice. On the guitar the half note must also last: keep the finger down until beat 3.',
      },
    },
    {
      type: 'play-phrase',
      prompt: 'Now the upper voice alone, i and m alternating, the same two bars.',
      notes: DUO_UPPER,
      octave: 'exact',
      tempo: 60,
      explain: '{n:D} {n:E} {n:F} {n:E} {n:D}, then {n:C#} {n:D} {n:E} {n:F} {n:G}: first position, finger = fret.',
      alternative: {
        type: 'order',
        prompt: 'Put bar 1 of the upper voice in order.',
        tiles: ['{n:D}', '{n:E}', '{n:F}', '{n:E}', '{n:D}'],
        distractors: ['{n:C#}'],
        explain: 'Bar 1 rises {n:D} {n:E} {n:F} and falls back {n:E} {n:D}. The {n:C#} begins bar 2.',
      },
    },
    {
      type: 'card',
      title: 'Then both',
      body: 'Now both at once, very slowly. Beat 1: p on the open {n:D} with m on the {n:D} an octave higher. The bass rings through beat 2 while the melody moves; beat 3 brings the open {n:A} under {n:E}. When each line keeps its own lengths, you hear two players, not one.',
    },
    {
      type: 'staff-read',
      prompt: 'The bass note of bar 2, as the guitar reads it. Which note?',
      note: 'C#3',
      key: 'D minor',
      options: ['C#', 'C', 'D', 'B'],
      explain: 'It is {n:C#}: the sharp is written in, since the signature of {k:D minor} has only {n:Bb}. On the guitar: string 5 fret 4, finger 4, held for two beats.',
    },
    playerTask({
      id: 'duo-wait',
      title: 'The duo, first half, wait mode',
      song: 'st-duet-baroque',
      mode: 'wait',
      bars: [1, 8],
      minutes: 5,
      body: 'Carulli\'s Andantino and Sor\'s Op. 60 No. 1 are not in the library; their nearest relation is this duo in two independent voices. Bars 1 to 8 in wait mode: you play the upper voice while the Player plays the bass. Notice how rarely the two share a rhythm.',
      tip: 'Own the editions? Bring them in with Scan & Import, in Tools, and play their first halves in wait mode the same way.',
    }),
    playerTask({
      id: 'duo-tempo',
      title: 'The whole duo at 60 BPM',
      song: 'st-duet-baroque',
      tempo: 56,
      minutes: 4,
      body: 'Then the whole duo, both halves with their repeats, at about 60 BPM, then 67 % (72 BPM). Count "1 2 3" quietly and keep your own rhythm against the long notes of the bass.',
    }),
    {
      type: 'true-false',
      statement: 'When the melody gets busy, you may let a bass note go early.',
      answer: false,
      explain: 'Never: each voice keeps its own note lengths. If the melody is too busy to let you hold the bass, the tempo is too fast.',
      fact: 'two-voices',
    },
    playerTask({
      id: 'two-voices-solo',
      title: 'Greensleeves: two voices, one guitar',
      song: 'greensleeves-fingerstyle',
      mode: 'wait',
      minutes: 5,
      body: 'The Minuet in G in two voices is not in the library; Greensleeves, solo, does the same work. The thumb takes a bass on every dotted-quarter beat, i and m the tune on top. Wait mode first. Keep the bass soft and let the tune sing.',
    }),
    {
      type: 'fill-blanks',
      prompt: 'Complete the rule.',
      text: 'The ___ plays the bass, i and m the melody, and each voice keeps its own ___.',
      blanks: ['thumb', 'note lengths'],
      bank: ['index', 'dynamics'],
      explain: 'Thumb for the bass, i and m for the melody; and each voice lasts as long as it is written, whatever the other is doing.',
      fact: 'two-voices',
    },
  ],
  facts: [
    { id: 'two-voices', front: 'Two voices on one guitar: who plays what, and the rule?', back: 'The thumb plays the bass, i and m the melody, and each voice keeps its own note lengths. Never lift a bass finger early.' },
    { id: 'carulli-and-sor', front: 'What do Carulli\'s Andantino, Op. 241 No. 5, and Sor\'s Op. 60 No. 1 teach?', back: 'Two voices: in Carulli bass and melody are clearly apart; Sor asks them to move independently, in first position.' },
  ],
};

// ── 4. Slurs, shifts and partial barres ─────────────────────────────────────────────────────────

const slursShiftsBarres: TeacherLesson = {
  id: 'slurs-shifts-and-barres',
  title: 'Slurs, shifts and partial barres',
  teaches: 'A pull-off plucks as it leaves, a shift glides on a guide finger, a partial barre covers only what it needs.',
  minutes: 5,
  skill: 'teacher:elena:slurs-shifts-and-barres',
  steps: [
    {
      type: 'card',
      title: 'Slurs',
      body: '{t:slur|Slurs} are the classical hammer-on and pull-off, played with the fingertips. The pull-off is the subtle one: as the finger leaves, it plucks the string slightly toward the floor, toward the next thinner string, so the lower note rings as loudly as the first. A finger that merely lifts leaves a ghost.',
      figure: { kind: 'tab', tempo: 60, notes: SLURS_S1, caption: 'String 1: pluck {n:A}, hammer {n:B} and {n:C}; pluck {n:C}, pull off to {n:B}, {n:A}.' },
    },
    {
      type: 'choice',
      prompt: 'Your pull-offs sound much quieter than the plucked notes. The remedy?',
      options: [
        { text: 'Pluck as you leave, toward the floor', correct: true },
        { text: 'Lift the finger more quickly', why: 'Speed alone does not pluck. The finger must draw the string sideways as it leaves.' },
        { text: 'Press harder before pulling off', why: 'Pressure is not the issue; the sideways pluck is.' },
      ],
      explain: 'A pull-off is a left-hand pluck: draw the string slightly toward the floor, toward the next thinner string, as the finger leaves, and the lower note rings as loudly as the first.',
      fact: 'pull-off-plucks',
    },
    techniqueTask({
      id: 'slur-chains',
      title: 'Hammer and Pull Chains, classical style',
      exercise: 'tech-legato-chains',
      minutes: 5,
      body: 'At 60 {t:bpm|BPM}, triplets: pluck only the first note on each string, with i or m; the rest are hammered on the way up and pulled off on the way down. Classical style: fingertips, a curved hand, and every slurred note as loud as the plucked one.',
      tip: 'Hammer with speed from just above the string, right behind the fret. Speed makes it loud, not pressure.',
    }),
    {
      type: 'card',
      title: 'Shifts on a guide finger',
      body: 'A shift is safest with a {t:guide-finger|guide finger}: it stays on its string and glides, touching but not pressing, to the new fret. Here finger 1 glides on string 3 from fret 2 ({n:A}) to fret 5 ({n:C}) and on to fret 9 ({n:E}), finger 3 taking frets 4 and 7 between.',
      figure: { kind: 'tab', tempo: 60, notes: SHIFTS, caption: 'Finger 1 at frets 2, 5 and 9; finger 3 at frets 4 and 7.' },
      tip: 'A position is named by the fret under finger 1. The Theory Path\'s "Positions and how they are marked" has the conventions.',
    },
    {
      type: 'fretboard-name',
      prompt: 'Finger 1 has glided up from fret 5. Which note is it on now, string 3 fret 9?',
      position: { string: 3, fret: 9 },
      ask: 'note',
      spelling: 'any',
      options: ['E', 'D', 'F', 'C#'],
      explain: 'String 3 fret 9 is {n:E}: the open {n:G} plus nine half steps.',
    },
    {
      type: 'play-phrase',
      prompt: 'Up string 3 on the guide finger: {n:A} {n:B} {n:C} {n:D} {n:E}, finger 1 gliding between.',
      notes: SHIFTS_UP,
      octave: 'exact',
      tempo: 60,
      explain: 'Fret 2 with finger 1, fret 4 with finger 3, glide to fret 5, finger 3 on fret 7, glide to fret 9. No gap, no squeak: touch, do not press, while you move.',
      alternative: {
        type: 'order',
        prompt: 'Put the notes of the climb up string 3 in order.',
        tiles: ['Fret 2: {n:A}', 'Fret 4: {n:B}', 'Fret 5: {n:C}', 'Fret 7: {n:D}', 'Fret 9: {n:E}'],
        explain: 'Frets 2, 4, 5, 7 and 9: finger 1 on frets 2, 5 and 9, finger 3 on 4 and 7.',
      },
    },
    techniqueTask({
      id: 'shifts-60',
      title: 'Clean Position Shifts at 60 BPM',
      exercise: 'tech-position-shifts',
      minutes: 4,
      body: 'At 60 {t:bpm|BPM}, quarters, then eighths, up and back down string 3. Release almost all pressure while gliding, press again on arrival, and start the shift a little early so you land on the beat. A microphone take reports any note that did not sound.',
    }),
    {
      type: 'choice',
      prompt: 'During a shift, the guide finger should:',
      options: [
        { text: 'Touch the string, barely pressing', correct: true },
        { text: 'Lift off and land on the new fret', why: 'That leaves a gap: the hand loses its way and the line breaks.' },
        { text: 'Press firmly all the way', why: 'That squeaks, and the friction slows the hand.' },
      ],
      explain: 'Touching, not pressing: the finger stays in contact with its string, so the hand knows where it is, and the line has neither a gap nor a squeak.',
      fact: 'guide-finger',
    },
    {
      type: 'card',
      title: 'Partial barres',
      body: 'A {t:partial-barre|partial barre} lays finger 1 across only the strings you need, which spares the hand. The library\'s chord-melody ballad uses one in fifth position: finger 1 across strings 1 to 3 at fret 5, finger 3 on string 4 fret 7, under a melody {n:A}.',
      figure: { kind: 'chord', symbol: 'Am', frets: 'x07555', fingers: 'x03111', caption: 'Finger 1 across strings 1 to 3 at fret 5.' },
    },
    {
      type: 'choice',
      prompt: 'Why a partial barre rather than a full one?',
      options: [
        { text: 'It covers only what is needed', correct: true },
        { text: 'It sounds louder', why: 'The strings you do not barre sound just the same.' },
        { text: 'It is easier to read', why: 'The notation is the same. The point is the hand.' },
      ],
      explain: 'A barre over strings that are not played is wasted pressure. The partial barre covers what is needed and spares the hand for everything else.',
      fact: 'partial-barre',
    },
    playerTask({
      id: 'ballad-wait',
      title: 'Partial barre and shift in a ballad',
      song: 'st-chord-melody-1',
      mode: 'wait',
      bars: [1, 4],
      minutes: 5,
      body: 'Tarrega\'s Lagrima is not in the library. If you own it, bring it in with Scan & Import, in Tools, and take its {k:E major} section in wait mode. Here instead: the ballad, bars 1 to 4, wait mode. Shift up to the barre in bar 2, back down after the long note, and the hammer-on in bar 3.',
    }),
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'Am',
      frets: 'x07555',
      accept: 'this-shape',
      prompt: 'Build the fifth-position {c:Am} of bar 2: finger 1 across strings 1 to 3 at fret 5.',
      explain: 'The open {n:A} on string 5, {n:A} at string 4 fret 7 under finger 3, and finger 1 across fret 5: {n:C}, {n:E}, {n:A}. Three strings barred, no more.',
    },
  ],
  facts: [
    { id: 'pull-off-plucks', front: 'How does a classical pull-off make the lower note ring?', back: 'The finger plucks as it leaves, slightly toward the floor, toward the next thinner string.' },
    { id: 'guide-finger', front: 'What is a guide finger?', back: 'A finger that stays on its string during a shift and glides, touching but not pressing, to the new fret.' },
    { id: 'partial-barre', front: 'Why use a partial barre?', back: 'It covers only the strings you need, which spares the hand.' },
  ],
};

// ── 5. Vibrato and tone colour ──────────────────────────────────────────────────────────────────

const vibratoAndToneColour: TeacherLesson = {
  id: 'vibrato-and-tone-colour',
  title: 'Vibrato and tone colour',
  teaches: 'Classical vibrato rocks the fingertip along the string; where you pluck, bridge to neck, sets the tone colour.',
  minutes: 4,
  skill: 'teacher:elena:vibrato-and-tone-colour',
  steps: [
    {
      type: 'card',
      title: 'Vibrato along the string',
      body: 'Classical {t:classical-vibrato|vibrato} rocks the fingertip along the string, toward the nut and away, so the pitch moves slightly above and below the note: the violinist\'s vibrato, not the electric guitarist\'s bend. The arm moves the finger, and the note never sounds out of tune.',
      figure: { kind: 'fretboard', frets: [5, 9], dots: [{ string: 1, fret: 7, note: 'B4' }], caption: 'String 1 fret 7: {n:B}, the note of the exercise.' },
    },
    {
      type: 'choice',
      prompt: 'In classical vibrato, which way does the fingertip move?',
      options: [
        { text: 'Along the string, toward the nut and back', correct: true },
        { text: 'Across the string, in a small bend', why: 'That is bending vibrato: it only raises the pitch, never lowers it.' },
        { text: 'It does not move; the wrist shakes', why: 'A shaking wrist with a still finger changes nothing. The arm moves the fingertip.' },
      ],
      explain: 'Along the string: the pitch moves slightly above the note and slightly below it, which is why it sounds warm rather than wailing.',
      fact: 'classical-vibrato',
    },
    techniqueTask({
      id: 'vibrato-60',
      title: 'Classical Vibrato, four waves a beat',
      exercise: 'tech-vibrato-classical',
      minutes: 4,
      body: 'String 1 fret 7 ({n:B}), whole notes at 60 {t:bpm|BPM}, four waves to each beat, the hand moving parallel to the string as if polishing it. With the microphone on, Technique listens to the waves. Climb to 72 BPM only when they are even.',
    }),
    {
      type: 'card',
      title: 'Where you pluck',
      body: 'Tone colour comes from where you pluck. Near the bridge, {t:sul-ponticello}, the sound is bright and glassy; over the soundhole it is round; near the neck, {t:sul-tasto}, it is soft and warm. Use vibrato and colour to make a melody speak, never as decoration.',
      tip: 'Why the colours differ, in overtones: the Theory Path\'s Tone colour lesson.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each term with what it does.',
      pairs: [
        { left: 'Sul ponticello', right: 'Bright and glassy' },
        { left: 'Over the soundhole', right: 'Round' },
        { left: 'Sul tasto', right: 'Soft and warm' },
        { left: 'Classical vibrato', right: 'Pitch above and below' },
      ],
      explain: 'Ponticello is the little bridge, tasto the fingerboard: near the bridge bright and glassy, over the soundhole round, over the neck soft and warm. Vibrato moves the pitch either side of the note.',
      fact: 'tone-colour',
    },
    {
      type: 'true-false',
      statement: 'Plucking near the bridge gives the softest, warmest tone.',
      answer: false,
      explain: 'Near the bridge, sul ponticello, is bright and glassy. Soft and warm is near the neck, sul tasto.',
      fact: 'tone-colour',
    },
    {
      type: 'play-note',
      prompt: 'Play {n:B} at string 1 fret 7 and hold it for four beats with classical vibrato. It must stay in tune.',
      note: 'B4',
      octave: 'exact',
      where: { string: 1, fret: 7 },
      explain: 'String 1 fret 7 is {n:B}. Vibrato along the string keeps the centre of the pitch on {n:B}; if the microphone heard another note, the finger slid rather than rocked.',
      alternative: {
        type: 'choice',
        prompt: 'No microphone: your vibrato on {n:B} sounds sharp throughout. Why?',
        options: [
          { text: 'You pushed across the string', correct: true },
          { text: 'You rocked along the string', why: 'Rocking along the string moves the pitch both ways around the note.' },
          { text: 'Fret 7 is out of tune', why: 'Possible, but then the plain note would be sharp too.' },
        ],
        explain: 'A sideways push is a bend, and a bend only rises. Move parallel to the string instead, as if polishing it.',
      },
    },
    playerTask({
      id: 'colours-phrase',
      title: 'One phrase, three colours',
      song: 'greensleeves-fingerstyle',
      bars: [1, 5],
      minutes: 4,
      body: 'Tarrega\'s Adelita is not in the library; bring your edition in with Scan & Import if you have one. Meanwhile, Greensleeves: the pickup and the first four bars, three times, over the soundhole, then near the bridge, then near the neck. Then decide which colour each phrase wants.',
    }),
    {
      type: 'choice',
      prompt: 'The tune returns, and you want it to sound like a memory. Where do you pluck?',
      options: [
        { text: 'Near the neck, sul tasto', correct: true },
        { text: 'Near the bridge, sul ponticello', why: 'Bright and glassy is the opposite of a memory.' },
        { text: 'Over the soundhole, but harder', why: 'Louder is not further away.' },
      ],
      explain: 'Soft and warm is near the neck. A change of colour tells the listener that something has changed; that is how colour makes a melody speak.',
    },
    playerTask({
      id: 'colours-complete',
      title: 'Greensleeves complete, with vibrato',
      song: 'greensleeves-fingerstyle',
      tempo: 74,
      minutes: 5,
      body: 'Then the whole piece, at about 60 BPM, then 100 % (81 BPM): vibrato on the long tune notes, never on the quick ones, and a colour chosen for each half. Adelita\'s slides must wait for your edition; plain notes are what make the vibrato mean something.',
    }),
    {
      type: 'choice',
      prompt: 'Where does classical vibrato belong?',
      multiple: true,
      options: [
        { text: 'On long notes', correct: true },
        { text: 'On the notes that matter most', correct: true },
        { text: 'On every note, for warmth', why: 'Then it means nothing: plain notes give vibrato its meaning.' },
        { text: 'On the open strings', why: 'An open string cannot be vibrated: no finger is on it.' },
      ],
      explain: 'Long notes and the notes that matter most in a phrase. Vibrato everywhere is decoration, and decoration everywhere is wallpaper.',
      fact: 'classical-vibrato',
    },
  ],
  facts: [
    { id: 'classical-vibrato', front: 'How does classical vibrato move, and where is it used?', back: 'The fingertip rocks along the string, so the pitch moves slightly above and below the note. On long notes and the notes that matter most.' },
    { id: 'tone-colour', front: 'Sul ponticello, over the soundhole, sul tasto: the three colours?', back: 'Near the bridge bright and glassy; over the soundhole round; near the neck soft and warm.' },
  ],
};

// ── 6. Tremolo ──────────────────────────────────────────────────────────────────────────────────

const tremolo: TeacherLesson = {
  id: 'tremolo',
  title: 'Tremolo',
  teaches: 'Tremolo is p-a-m-i, four even sixteenths a beat: practise it slowly, moving the accent to each finger in turn.',
  minutes: 4,
  skill: 'teacher:elena:tremolo',
  steps: [
    {
      type: 'card',
      title: 'Four notes, one melody',
      body: 'In {t:classical-tremolo|tremolo} the thumb plays a bass note and a, m and i repeat one melody note three times: p-a-m-i, four even sixteenths to the beat. Played evenly, the repeated note stops sounding repeated and becomes one long, trembling melody.',
      figure: { kind: 'tab', tempo: 40, notes: TREMOLO_OPEN, caption: 'p on the open strings 6, 5, 4, 5; a-m-i on the open string 1.' },
    },
    {
      type: 'order',
      prompt: 'Put the fingers of one tremolo group in order.',
      tiles: ['p', 'a', 'm', 'i'],
      explain: 'p on the bass, then a, m and i on the melody note: from the little-finger side back toward the thumb.',
      fact: 'tremolo-pami',
    },
    {
      type: 'card',
      title: 'Unevenness is the enemy',
      body: 'The enemy is unevenness: a gallop, where a-m-i bunch together, or a thumb that booms. So practise slowly and move the accent: a minute accenting p, then a minute each accenting a, m and i. Each finger learns to be heard, and the group evens out.',
      figure: { kind: 'rhythm', pattern: 's s s s s s s s s s s s s s s s', time: '4/4', tempo: 40, caption: 'Four groups of four: accent the 1st note of each, then the 2nd, 3rd, 4th.' },
    },
    {
      type: 'choice',
      prompt: 'Your tremolo gallops: a-m-i come out bunched. The remedy?',
      options: [
        { text: 'Slower, moving the accent finger by finger', correct: true },
        { text: 'Faster, until it smooths out', why: 'Speed hides a gallop for a moment and engraves it for good.' },
        { text: 'A louder thumb, to steady it', why: 'A booming thumb is the second fault, not the cure for the first.' },
      ],
      explain: 'Slowly, accenting p, then a, then m, then i, a minute each: every finger learns to be heard on its own, and the timing evens out.',
      fact: 'tremolo-accents',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap two tremolo groups: four even sixteenths to each click, at 40 BPM.',
      rhythm: { pattern: 's s s s s s s s hr' },
      tempo: 40,
      show: 'both',
      explain: 'Four taps a click, every gap the same. Tap on the table with p, a, m and i if you like: the fingers learn the timing too.',
    },
    techniqueTask({
      id: 'tremolo-40',
      title: 'Classical Tremolo at 40 BPM',
      exercise: 'tech-tremolo-pami',
      minutes: 6,
      body: 'Open strings first, at 40 {t:bpm|BPM}: a minute accenting p, then a, then m, then i. Then the moving melody. A microphone take reports how even each group is. Tremolo builds tension: keep sessions short and stop if the hand or forearm aches.',
      tip: 'Let the thumb fall through its string lightly. The melody is in the treble.',
    }),
    {
      type: 'listen-choice',
      prompt: 'A recording of two tremolo groups. Even, or a gallop?',
      sound: { kind: 'tab', notes: GALLOP, tempo: 60 },
      options: [{ text: 'Even: four equal notes' }, { text: 'A gallop: a-m-i bunched', correct: true }],
      shuffle: false,
      explain: 'The thumb took half the beat and a-m-i crowded into the rest. Record a minute of your own tremolo and ask the same question of every group: are all four notes the same length?',
    },
    playerTask({
      id: 'tremolo-etude',
      title: 'Toward Recuerdos',
      song: 'st-concert-tremolo-etude',
      mode: 'wait',
      minutes: 5,
      body: 'Tarrega\'s Recuerdos de la Alhambra is not in the library; if you own it, scan it in and loop its first 4 bars at 40 BPM. The library\'s preparation for it is the Concert Tremolo Etude: wait mode first, every group even before the next.',
      fallback: {
        tool: 'technique',
        params: ['tech-tremolo-pami'],
        title: 'Toward Recuerdos: the moving melody',
        body: 'Recuerdos de la Alhambra and the Concert Tremolo Etude are not in the library yet. Scan your edition of Recuerdos in if you own it. Meanwhile, the moving-melody part of Classical Tremolo, at 40 BPM: a melody on string 1 over {c:Am} and {c:E}, every group even.',
      },
    }),
    {
      type: 'true-false',
      statement: 'Once your tremolo is even at 40 BPM, you can take Recuerdos at concert tempo.',
      answer: false,
      explain: 'When it is even, Recuerdos opens to you, and not before; but only at a tempo where it stays even. Climb the ladder 4 BPM a rung, never more.',
    },
    {
      type: 'play-phrase',
      prompt: 'Two tremolo groups at 40 BPM: p on string 6, then a-m-i on string 1; p on string 5, a-m-i again.',
      notes: TREMOLO_OPEN.slice(0, 8),
      octave: 'exact',
      tempo: 40,
      explain: 'The low {n:E}, then the high {n:E} three times; the open {n:A}, then the high {n:E} three times. Even, like rain on a roof.',
      alternative: {
        type: 'order',
        prompt: 'No guitar to hand? Put one tremolo group in order, string by string.',
        tiles: ['p: string 6', 'a: string 1', 'm: string 1', 'i: string 1'],
        explain: 'p on the bass string, then a, m and i on the melody string, here the open string 1.',
      },
    },
  ],
  facts: [
    { id: 'tremolo-pami', front: 'Classical tremolo: which fingers, in what order?', back: 'p-a-m-i: the thumb plays a bass note, then a, m and i repeat one melody note. Four even sixteenths to the beat.' },
    { id: 'tremolo-accents', front: 'How do you even out an uneven tremolo?', back: 'Slowly, moving the accent: a minute each accenting p, a, m and i.' },
  ],
};

/** Unit 9 of Prof. Varga's course. */
const unit: TeacherUnit = {
  id: 'elena-classical-technique',
  title: 'Classical technique',
  theme: 'technique',
  description: 'Sit and pluck like a classical guitarist: two strokes, arpeggios, two voices, slurs and shifts, vibrato, colour and tremolo.',
  lessons: [classicalPosition, rightHandArpeggios, firstClassicalPieces, slursShiftsBarres, vibratoAndToneColour, tremolo],
  checkpoint: { sample: 8, maxMistakes: 2 },
  glossary: [
    { id: 'free-stroke', term: 'free stroke', definition: 'Tirando: the finger plucks the string and clears the next one, finishing in the air.' },
    { id: 'rest-stroke', term: 'rest stroke', definition: 'Apoyando: the finger plucks through the string and comes to rest on the next one toward string 6, for a fuller tone.' },
    { id: 'pima', term: 'p i m a', definition: 'The right-hand fingers in classical notation: p the thumb, i the index, m the middle, a the ring finger.' },
    { id: 'pinch', term: 'pinch', definition: 'The thumb and a finger plucking together, usually p and a: a bass and a melody note at once.' },
    { id: 'slur', term: 'slur', definition: 'The classical name for a hammer-on or a pull-off: a note sounded by the fretting hand alone.' },
    { id: 'guide-finger', term: 'guide finger', definition: 'A finger that stays on its string during a shift and glides, touching but not pressing, to the new fret.' },
    { id: 'partial-barre', term: 'partial barre', definition: 'A barre across only some of the strings, usually two to four, with the first finger.' },
    { id: 'classical-vibrato', term: 'classical vibrato', definition: 'Vibrato made by rocking the fingertip along the string, so the pitch moves slightly above and below the note.' },
    { id: 'sul-ponticello', term: 'sul ponticello', definition: 'Plucked near the bridge: a bright, glassy tone.' },
    { id: 'sul-tasto', term: 'sul tasto', definition: 'Plucked near or over the end of the fingerboard: a soft, warm tone.' },
    { id: 'classical-tremolo', term: 'tremolo', definition: 'In classical guitar, p-a-m-i: a bass note and one melody note repeated three times, so evenly that the melody seems to sustain.' },
  ],
};

export default unit;
