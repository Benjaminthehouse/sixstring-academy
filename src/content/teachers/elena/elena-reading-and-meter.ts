/**
 * Prof. Varga, unit 11: Sight-reading and rhythm (plan: `elena/elena-reading-and-meter` in
 * src/content/plan/teachers.json).
 *
 * Elena's voice: rigorous, dry, respectful. Reading in fifth and seventh position, choosing a
 * position, a daily sight-reading routine, reading through the whole neck, odd meters, hemiola and
 * three against two. Every fact of the plan's `explain` is on the cards; the `show` becomes
 * fretboards, staves and tab; the `practice` becomes in-lesson exercises or tasks that send the
 * learner to the Player, Fretboard, Metronome, Technique and Practice Plan, and back.
 *
 * Music from the library: Reading: Fifth Position and Flats (`st-read-fifth-position`, 76 BPM),
 * Reading: Seventh Position (`st-read-seventh-position`, 76 BPM), Reading: Shifting Through the Neck
 * (`st-read-shifting`, 80 BPM), Duet: Baroque-Style Duo in D minor (`st-duet-baroque`, 108 BPM), the
 * Odd Meters ladder (`tech-odd-meters`) and Flamenco Rhythm: the 12-Beat Cycle (`st-solea-compas`,
 * 108 BPM). Sanz's Canarios is not in the library (it must be read from a printed edition): its
 * hemiola is taught on the solea's 3+3+2+2+2, and the learner is shown how to bring an edition in
 * with Scan & Import. The Player has no notation-only view, so the reading tasks ask for "Tab and
 * notes" and a strip of paper over the tab. `elena-reading-and-meter.test.ts` cross-checks every
 * position the text names, every figure and every Player tempo against the engines and the library.
 */
import type { StaffNote, TabNote } from '@/lessons';
import type { TeacherLesson, TeacherUnit } from '../types';
import { playerTask, techniqueTask, toolTask } from '../tasks';

/** One tab note. */
function t(string: number, fret: number, duration: string): TabNote {
  return { string, fret, duration };
}

/** {k:F major} in fifth position, string 5 fret 8 up to string 2 fret 6: [string, fret, finger]. */
export const FIFTH_POSITION_F: ReadonlyArray<readonly [number, number, number]> = [
  [5, 8, 4], [4, 5, 1], [4, 7, 3], [4, 8, 4], [3, 5, 1], [3, 7, 3], [2, 5, 1], [2, 6, 2],
];

/** The staff of that scale, sounding pitch, with the fingers under the notes. */
export const FIFTH_POSITION_F_STAFF: StaffNote[] = ['F3', 'G3', 'A3', 'Bb3', 'C4', 'D4', 'E4', 'F4'].map((note, i) => ({ note, duration: 'q', label: String(FIFTH_POSITION_F[i][2]) }));

/** Steps up from C in fifth position: [string, fret, finger]. */
export const STEPS_UP_C: ReadonlyArray<readonly [number, number, number]> = [[3, 5, 1], [3, 7, 3], [2, 5, 1], [2, 6, 2], [2, 8, 4]];

/** A phrase in {k:G major} played in first position: two shifts (up at A, back at G). */
export const PHRASE_FIRST: TabNote[] = [
  t(2, 3, 'q'), t(1, 0, 'q'), t(1, 2, 'q'), t(1, 3, 'q'),
  t(1, 5, 'q'), t(1, 7, 'q'), t(1, 5, 'q'), t(1, 3, 'q'),
  t(1, 2, 'q'), t(1, 0, 'q'), t(2, 3, 'h'),
];

/** The same phrase in seventh position: no shift. */
export const PHRASE_SEVENTH: TabNote[] = [
  t(3, 7, 'q'), t(3, 9, 'q'), t(2, 7, 'q'), t(2, 8, 'q'),
  t(2, 10, 'q'), t(1, 7, 'q'), t(2, 10, 'q'), t(2, 8, 'q'),
  t(2, 7, 'q'), t(3, 9, 'q'), t(3, 7, 'h'),
];

/** A 4-bar phrase from B2 to D5 that only seventh position plays without a shift (sounding pitch). */
export const SEVENTH_ONLY: StaffNote[] = [
  ...['B2', 'D3', 'G3', 'B3', 'D4', 'G4', 'B4', 'D5', 'C5', 'A4', 'F#4', 'D4'].map((note) => ({ note, duration: 'q' })),
  { note: 'B3', duration: 'q' }, { note: 'A3', duration: 'q' }, { note: 'G3', duration: 'h' },
];

/** 7/8 grouped 2+2+3 on open strings: the low E starts each group. */
export const SEVEN_2_2_3: TabNote[] = [6, 3, 6, 3, 6, 3, 3].map((s) => t(s, 0, 'e'));

/** 7/8 grouped 3+2+2 on Am (x02210): the open A starts each group. */
export const SEVEN_3_2_2: TabNote[] = [t(5, 0, 'e'), t(3, 2, 'e'), t(2, 1, 'e'), t(5, 0, 'e'), t(2, 1, 'e'), t(5, 0, 'e'), t(2, 1, 'e')];

/** Elena's 2-bar riff in 7/8 (2+2+3) on A minor pentatonic, box 1: the low notes start the groups. */
export const RIFF_SEVEN: TabNote[] = [
  t(6, 5, 'e'), t(4, 7, 'e'), t(6, 8, 'e'), t(4, 7, 'e'), t(5, 5, 'e'), t(4, 5, 'e'), t(4, 7, 'e'),
  t(6, 5, 'e'), t(4, 7, 'e'), t(6, 8, 'e'), t(4, 5, 'e'), t(5, 7, 'e'), t(4, 7, 'e'), t(4, 5, 'e'),
];

/** Six eighths in two bars of 6/8: the low E every three eighths, then every two (3+3, then 2+2+2). */
export const HEMIOLA_BARS: TabNote[] = [6, 3, 3, 6, 3, 3, 6, 3, 6, 3, 6, 3].map((s) => t(s, 0, 'e'));

/** The same six eighths as 2+2+2, twice: what the listening question plays. */
export const THREE_TWOS: TabNote[] = [6, 3, 6, 3, 6, 3, 6, 3, 6, 3, 6, 3].map((s) => t(s, 0, 'e'));

/** Three against two in a bar of 2/4: the thumb's low E on the beats, the fingers' high E on the triplets. */
export const THREE_AGAINST_TWO: TabNote[] = [t(6, 0, 'qt'), t(1, 0, 'et'), t(6, 0, 'et'), t(1, 0, 'qt')];

// ── 1. Reading in fifth position ────────────────────────────────────────────────────────────────

const readingInFifthPosition: TeacherLesson = {
  id: 'reading-in-fifth-position',
  title: 'Reading in fifth position',
  teaches: 'In fifth position finger 1 sits at fret 5 and every note lies under a finger; read by interval as well.',
  minutes: 5,
  skill: 'teacher:elena:reading-in-fifth-position',
  steps: [
    {
      type: 'card',
      title: 'Positions keep a reader fluent',
      body: 'Positions are how a reader stays fluent: the hand stays still and the notes fall under its four fingers. In fifth {t:position}, finger 1 is at fret 5, then one finger per fret up to fret 8; finger 1 reaches back to fret 4 for {n:B} on string 3. The natural notes, and one {n:Bb}:',
      figure: {
        kind: 'fretboard',
        frets: [4, 8],
        derive: { scale: 'major', tonic: 'C' },
        dots: [{ string: 4, fret: 8, note: 'Bb3', role: 'target' }],
        caption: 'Fifth position: the natural notes, and {n:Bb} on string 4.',
      },
    },
    {
      type: 'choice',
      prompt: 'In fifth position, which finger plays fret 7?',
      options: [
        { text: 'Finger 3', correct: true },
        { text: 'Finger 2', why: 'Finger 2 is at fret 6, one fret above finger 1.' },
        { text: 'Finger 4', why: 'Finger 4 is at fret 8, the top of the position.' },
        { text: 'Finger 1', why: 'Finger 1 is at fret 5: that is what names the position.' },
      ],
      shuffle: false,
      explain: 'One finger per fret from fret 5: finger 1 at 5, finger 2 at 6, finger 3 at 7, finger 4 at 8.',
      fact: 'rd-fifth-position',
    },
    {
      type: 'card',
      title: 'The same B flat, a new address',
      body: 'In first position you play {n:Bb} at string 3, fret 3 ({n:Bb3}). In fifth position the same pitch is string 4, fret 8 ({n:Bb3}), finger 4: one string lower, five frets higher. The high one is string 1, fret 6 ({n:Bb4}), finger 2. {k:F major} in fifth position, fingers under the notes:',
      figure: { kind: 'staff', key: 'F major', notes: FIFTH_POSITION_F_STAFF, caption: '{k:F major} from string 5, fret 8, to string 2, fret 6.' },
    },
    {
      type: 'play-note',
      prompt: 'Play {n:Bb} in fifth position: string 4, fret 8, finger 4.',
      note: 'Bb3',
      octave: 'exact',
      where: { string: 4, fret: 8 },
      explain: 'String 4, fret 8 ({n:Bb3}): the pitch you know at string 3, fret 3, taken without leaving the position.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap {n:Bb3} in fifth position, frets 4 to 8.',
        find: { note: 'Bb3' },
        mode: 'one',
        octave: 'exact',
        frets: [4, 8],
        explain: 'String 4, fret 8, under finger 4. In first position the same pitch is string 3, fret 3.',
      },
      fact: 'rd-bb-fifth',
    },
    {
      type: 'staff-read',
      prompt: 'The key is {k:F major}. Which note is this?',
      note: 'Bb3',
      key: 'F major',
      options: ['Bb', 'B', 'A', 'C'],
      explain: 'The flat in the signature of {k:F major} applies to every B, so this is {n:Bb}: in fifth position, string 4, fret 8 ({n:Bb3}).',
    },
    {
      type: 'choice',
      prompt: 'Where do you play this note in fifth position?',
      figure: { kind: 'staff', notes: ['C4'] },
      options: [
        { text: 'String 3, fret 5, finger 1', correct: true },
        { text: 'String 2, fret 1', why: 'That is the same pitch in first position. In fifth position the hand does not go there.' },
        { text: 'String 4, fret 10', why: 'Also the same pitch, but out of reach: finger 4 stops at fret 8.' },
        { text: 'String 3, fret 4', why: 'Fret 4 on string 3 is {n:B}, a half step lower.' },
      ],
      explain: 'Guitar music is written an octave above the sound, so this third-space note is {n:C4}: string 3, fret 5 ({n:C4}), under finger 1.',
    },
    {
      type: 'card',
      title: 'Read by interval',
      body: 'Read by interval as well as by name: a step up on the staff is usually the next finger or the next string. From {n:C} at string 3, fret 5 ({n:C4}), a step up is string 3, fret 7 ({n:D4}), finger 3; the next step is string 2, fret 5 ({n:E4}), finger 1 again.',
      figure: { kind: 'staff', notes: STEPS_UP_C.map(([, , finger], i) => ({ note: ['C4', 'D4', 'E4', 'F4', 'G4'][i], duration: 'q', label: String(finger) })), caption: 'Steps up from {n:C} in fifth position: the fingers.' },
    },
    {
      type: 'choice',
      prompt: 'You are on {n:F} at string 2, fret 6 ({n:F4}), and the staff steps up to {n:G}. Where?',
      options: [
        { text: 'Finger 4, fret 8', correct: true },
        { text: 'Finger 3, fret 7', why: 'String 2, fret 7 is {n:F#}: a half step, not the step to {n:G}.' },
        { text: 'Finger 1, string 1', why: 'String 1, fret 5 is {n:A}: a third up, not a step.' },
        { text: 'Finger 2, fret 6', why: 'That is the {n:F} you are already on.' },
      ],
      explain: '{n:F} to {n:G} is a whole step, two frets: string 2, fret 8 ({n:G4}), finger 4. The next step, {n:A}, moves to the next string.',
      fact: 'rd-by-interval',
    },
    { generate: 'staff-note', params: { ask: 'read', low: 'A2', high: 'C5' } },
    { generate: 'staff-note', params: { ask: 'read', low: 'A2', high: 'C5' } },
    playerTask({
      id: 'fifth-at-sight',
      title: 'The fifth-position study, at sight',
      song: 'st-read-fifth-position',
      tempo: 79,
      minutes: 6,
      body: 'Set Score to Tab and notes and lay a strip of paper over the tab: you read the notes. Hand in fifth position, then once through at about 60 BPM without stopping, wrong notes included. Bar 9 turns to {k:F major}: find both {n:Bb} before you start. Then once more.',
      tip: 'The second time through is not at sight. It tells you what the first one missed.',
    }),
    {
      type: 'true-false',
      statement: 'String 4, fret 8 and string 3, fret 3 are the same pitch.',
      answer: true,
      explain: 'Both are {n:Bb3}. String 4 is tuned a fourth below string 3, five frets: so fret 8 there equals fret 3 here.',
      fact: 'rd-bb-fifth',
    },
    toolTask({
      id: 'fifth-note-game',
      title: 'The fifth-position note game',
      tool: 'fretboard',
      params: ['drill', 'name-the-note'],
      minutes: 4,
      body: 'Name the note: in the drill\'s settings set From fret 4 and To fret 8, all strings, all 12 notes. Two rounds. Name each note before you look at the strings around it; the hand will learn the map faster than the eye.',
    }),
    {
      type: 'fretboard-find',
      prompt: 'Tap every {n:C} in fifth position, frets 5 to 8.',
      find: { note: 'C' },
      mode: 'all',
      octave: 'any',
      frets: [5, 8],
      explain: 'Three: string 6, fret 8 ({n:C3}), string 3, fret 5 ({n:C4}) and string 1, fret 8 ({n:C5}), each under finger 1 or 4.',
    },
  ],
  facts: [
    { id: 'rd-fifth-position', front: 'Where is the hand in fifth position?', back: 'Finger 1 at fret 5, then one finger per fret up to fret 8; finger 1 reaches back to fret 4 for {n:B} on string 3.' },
    { id: 'rd-bb-fifth', front: 'In fifth position, where is the {n:Bb} of string 3, fret 3?', back: 'String 4, fret 8, finger 4: the same pitch. The high {n:Bb} is string 1, fret 6, finger 2.' },
    { id: 'rd-by-interval', front: 'Reading in a position: what is a step up on the staff, usually?', back: 'The next finger, or the next string.' },
  ],
};

// ── 2. Seventh position, and choosing positions ─────────────────────────────────────────────────

const seventhPositionAndChoices: TeacherLesson = {
  id: 'seventh-position-and-choices',
  title: 'Seventh position, and choosing positions',
  teaches: 'Seventh position spans frets 7 to 10; choose a position by fewest shifts and best sound, then write it in.',
  minutes: 5,
  skill: 'teacher:elena:seventh-position-and-choices',
  steps: [
    {
      type: 'card',
      title: 'Seventh position',
      body: 'Seventh position covers frets 7 to 10: finger 1 at fret 7, finger 4 at fret 10. It suits {k:G major} and {k:E minor}: every note of that scale lies under a finger, from string 6, fret 7 ({n:B2}) to string 1, fret 10 ({n:D5}), more than two octaves without a stretch.',
      figure: { kind: 'fretboard', frets: [7, 10], derive: { scale: 'major', tonic: 'G' }, caption: 'Seventh position: {k:G major} and {k:E minor}.' },
    },
    {
      type: 'fretboard-name',
      prompt: 'In {k:G major}, seventh position: which note does finger 1 play on string 2?',
      position: { string: 2, fret: 7 },
      ask: 'note',
      spelling: 'exact',
      key: 'G major',
      options: ['F#', 'G', 'E', 'A'],
      explain: 'String 2, fret 7 is {n:F#4}, the seventh degree of {k:G major}. {n:G} is a fret higher, under finger 2.',
      fact: 'rd-seventh-position',
    },
    {
      type: 'card',
      title: 'Choosing is a decision',
      body: 'Choosing a position is a decision: where does the passage lie with the fewest shifts, and where does it sound best? This phrase in first position needs two shifts: up to fifth position for {n:A}, and back down for {n:G}.',
      figure: { kind: 'tab', notes: PHRASE_FIRST, tempo: 72, caption: 'First position: two shifts, at {n:A} and at {n:G}.' },
    },
    {
      type: 'choice',
      prompt: 'The same phrase in seventh position. How many shifts?',
      figure: { kind: 'tab', notes: PHRASE_SEVENTH, tempo: 72 },
      options: [{ text: 'None', correct: true }, { text: 'One' }, { text: 'Two', why: 'That was the first-position version. Here every note is at frets 7 to 10.' }],
      shuffle: false,
      explain: 'None: from {n:D4} up to {n:B4} and back, every note lies at frets 7 to 10. Fewer shifts, fewer chances to arrive late. It also sounds rounder on the lower strings.',
      fact: 'rd-choose-position',
    },
    {
      type: 'choice',
      prompt: 'This 4-bar phrase runs from {n:B2} to {n:D5}. Which position plays it without a shift?',
      figure: { kind: 'staff', key: 'G major', time: '4/4', notes: SEVENTH_ONLY },
      options: [
        { text: 'Seventh position', correct: true },
        { text: 'First position', why: '{n:D5} is string 1, fret 10: far beyond finger 4 at fret 4.' },
        { text: 'Fifth position', why: '{n:D5} at fret 10 is two frets past finger 4 at fret 8.' },
        { text: 'Twelfth position', why: 'Its lowest note is string 6, fret 12 ({n:E3}): {n:B2} is below it.' },
      ],
      explain: 'Only seventh position holds both ends: {n:B2} at string 6, fret 7 and {n:D5} at string 1, fret 10, with every {k:G major} note between under a finger.',
      fact: 'rd-choose-position',
    },
    {
      type: 'card',
      title: 'Write it in',
      body: 'Then write your choice into the music: the position above the first note, a finger number at every shift. A fingering decided once saves a hundred hesitations. Decide before you practise, not while you play.',
      tip: 'Pencil, not pen. You will change your mind once; a good reader changes it only once.',
    },
    playerTask({
      id: 'seventh-at-sight',
      title: 'The seventh-position study, at sight',
      song: 'st-read-seventh-position',
      tempo: 79,
      minutes: 6,
      body: 'Tab and notes, paper over the tab, hand in seventh position. At about 60 BPM, without stopping: bars 1 to 8 in 4/4 and {k:G major}, then bars 9 to 16 in 6/8 and {k:E minor}. If you met the first half in my Coste lesson, read the 6/8 half first: that one is still at sight.',
    }),
    {
      type: 'true-false',
      statement: 'Where the study turns from 4/4 to 6/8, the eighth note keeps its speed.',
      answer: true,
      explain: 'One tempo throughout: the eighths run on unchanged, and only the grouping moves from twos (4/4) to threes (6/8).',
    },
    {
      type: 'play-note',
      prompt: 'Play {n:D#}, the leading note of {k:E minor} in seventh position: string 3, fret 8.',
      note: 'D#4',
      octave: 'exact',
      where: { string: 3, fret: 8 },
      explain: 'String 3, fret 8 ({n:D#4}), finger 2: the raised seventh that leads to {n:E}, one fret up at fret 9.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap {n:D#4} in seventh position, frets 7 to 10.',
        find: { note: 'D#4' },
        mode: 'one',
        octave: 'exact',
        frets: [7, 10],
        explain: 'String 3, fret 8, under finger 2: the leading note of {k:E minor}.',
      },
    },
    playerTask({
      id: 'seventh-sixteenths',
      title: 'The sixteenth-note passages, at 50 BPM',
      song: 'st-read-seventh-position',
      bars: [3, 6],
      tempo: 66,
      minutes: 4,
      body: 'Now the sixteenths, at about 50 BPM: bars 3 to 6 on loop, then set the loop to bars 11 to 15. Count "1 e & a" quietly; the sixteenths stay in position, so the hand need not move, only the fingers.',
    }),
    {
      type: 'fretboard-find',
      prompt: 'Tap every {n:F#} in seventh position, frets 7 to 10.',
      find: { note: 'F#' },
      mode: 'all',
      octave: 'any',
      frets: [7, 10],
      explain: 'Two: string 5, fret 9 ({n:F#3}) and string 2, fret 7 ({n:F#4}). Every {n:F} in this key is sharp.',
    },
  ],
  facts: [
    { id: 'rd-seventh-position', front: 'Seventh position: which frets, and which keys suit it?', back: 'Frets 7 to 10, finger 1 at fret 7. It suits {k:G major} and {k:E minor}.' },
    { id: 'rd-choose-position', front: 'How do you choose a position for a passage?', back: 'Where it lies with the fewest shifts, and where it sounds best. Then write the choice into the music.' },
  ],
};

// ── 3. A sight-reading routine ──────────────────────────────────────────────────────────────────

const sightReadingRoutine: TeacherLesson = {
  id: 'sight-reading-routine',
  title: 'A sight-reading routine',
  teaches: 'Sight-reading means keeping going: preview for thirty seconds, play slow enough never to stop, every day.',
  minutes: 5,
  skill: 'teacher:elena:sight-reading-routine',
  steps: [
    {
      type: 'card',
      title: 'A different skill',
      body: 'Sight-reading is a different skill from reading slowly: you must keep going. A wrong note at sight is a pebble; stopping is a landslide. So, before you play, a thirty-second preview; then a tempo slow enough that you never stop, with your eyes a little ahead of your hands.',
    },
    {
      type: 'true-false',
      statement: 'At sight, a wrong note should be corrected before you go on.',
      answer: false,
      explain: 'Never at sight. Correcting stops the music and loses the beat; play the next note in time and leave the wrong one behind.',
      fact: 'rd-sight-tempo',
    },
    {
      type: 'card',
      title: 'The thirty-second preview',
      body: 'Thirty seconds, every time. The key: the signature, and the last note. The meter. The highest and lowest notes, which tell you the positions you need. Any rhythm that looks hard: tap it once before you begin.',
      tip: 'A piece read without a preview is read twice: once badly, then again.',
    },
    {
      type: 'choice',
      prompt: 'Which belong in the thirty-second preview?',
      multiple: true,
      options: [
        { text: 'The key', correct: true },
        { text: 'The meter', correct: true },
        { text: 'The highest and lowest notes', correct: true },
        { text: 'Any rhythm that looks hard', correct: true },
        { text: 'A fingering for every note', why: 'Thirty seconds will not allow it, and the position decides most of it.' },
        { text: 'The composer\'s dates', why: 'Interesting, but they will not save bar 5.' },
      ],
      explain: 'Key, meter, range and the hard rhythms: four checks, thirty seconds. Everything else you learn by playing on.',
      fact: 'rd-sight-preview',
    },
    { generate: 'key-signature', params: { ask: 'key', modes: ['major', 'minor'], maxAccidentals: 4 } },
    {
      type: 'card',
      title: 'A score card',
      body: 'Score every passage: the bars you played without stopping, out of eight, with the date and the tempo. Eight out of eight three days running: 4 BPM faster. Below six: 4 BPM slower. Ten minutes of new material every day beats an hour once a week.',
    },
    {
      type: 'choice',
      prompt: 'Bar 5 stops you every time at 60 BPM. What do you change?',
      options: [
        { text: 'The tempo, until you never stop', correct: true },
        { text: 'Practise bar 5 until it is perfect', why: 'Then it is no longer at sight. Do that with your pieces, not your reading.' },
        { text: 'Skip the preview to save time', why: 'The preview is what would have shown you bar 5 in advance.' },
      ],
      explain: 'At sight the tempo serves continuity. Slower until you never stop; the score card raises it again when you are ready.',
      fact: 'rd-sight-tempo',
    },
    playerTask({
      id: 'daily-eight-bars',
      title: 'Day one: eight bars at sight',
      song: 'st-read-shifting',
      bars: [1, 8],
      tempo: 75,
      minutes: 4,
      body: 'Every day, one 8-bar passage you have never played, at about 60 BPM, Tab and notes with paper over the tab. Today: bars 1 to 8 of the Shifting study, which we take apart next lesson. Preview, play once without stopping, score it out of eight. Tomorrow, a new section, or a songbook melody you do not know.',
    }),
    {
      type: 'true-false',
      statement: 'Ten minutes of new material every day beats an hour once a week.',
      answer: true,
      explain: 'Reading is a habit of the eyes; it grows with frequency, not with heroic sessions. And the material must be new, or it is memory.',
      fact: 'rd-sight-daily',
    },
    playerTask({
      id: 'duo-at-sight',
      title: 'The Baroque duo, at sight',
      song: 'st-duet-baroque',
      tempo: 56,
      minutes: 5,
      body: 'Now with a partner: the upper voice at about 60 BPM, while the app plays the bass. Preview first: {k:D minor}, 3/4, first position. If you played this duo in my classical lessons, it is no longer at sight: in Parts, choose the bass line and read that instead.',
      tip: 'The partner will not wait. That is the point of a partner.',
    }),
    {
      type: 'choice',
      prompt: 'You are playing bar 3. Where are your eyes?',
      options: [
        { text: 'On bar 4, a little ahead', correct: true },
        { text: 'On your left hand', why: 'The position keeps the hand in place. Your eyes belong on the page.' },
        { text: 'On bar 3, note by note', why: 'Then every note is a surprise. Read a little ahead and the hands follow.' },
      ],
      explain: 'A little ahead: the hands play what the eyes saw a moment ago, so the next bar is never a surprise.',
      fact: 'rd-sight-tempo',
    },
    toolTask({
      id: 'reading-block',
      title: 'A daily reading block',
      tool: 'practice',
      minutes: 2,
      body: 'In the Practice Plan, add a Songs block for reading, about ten minutes, and keep it with Save as routine. Every day, new material in it. Keep the score card in the journal.',
    }),
    {
      type: 'fill-blanks',
      prompt: 'The routine, in one line.',
      text: 'Preview for ___ seconds, play at a tempo where you never ___, and keep your eyes a little ___.',
      blanks: ['30', 'stop', 'ahead'],
      bank: ['5', 'breathe', 'behind'],
      explain: 'Thirty seconds of preview, a tempo that never stops, eyes a little ahead. Then do it again tomorrow, with new music.',
    },
  ],
  facts: [
    { id: 'rd-sight-preview', front: 'What goes in the thirty-second preview?', back: 'The key, the meter, the highest and lowest notes, and any rhythm that looks hard.' },
    { id: 'rd-sight-tempo', front: 'How fast do you sight-read?', back: 'Slow enough that you never stop, with your eyes a little ahead of your hands.' },
    { id: 'rd-sight-daily', front: 'Sight-reading practice: how much, how often?', back: 'Ten minutes of new material every day. It beats an hour once a week.' },
  ],
};

// ── 4. Reading through the whole neck ───────────────────────────────────────────────────────────

const shiftingThroughTheNeck: TeacherLesson = {
  id: 'shifting-through-the-neck',
  title: 'Reading through the whole neck',
  teaches: 'Find and mark the shifts in advance; practise each alone: the last note before it, the first after it.',
  minutes: 5,
  skill: 'teacher:elena:shifting-through-the-neck',
  steps: [
    {
      type: 'card',
      title: 'Music moves',
      body: 'Real music does not stay in one position. Find the shifts in advance, mark them, and practise each shift as a tiny exercise of its own: the last note before it and the first note after it. The first in the Shifting study: the open {n:B} rings, and the hand lands on {n:Ab} at string 4, fret 6, finger 2.',
      figure: {
        kind: 'fretboard',
        frets: [0, 8],
        dots: [
          { string: 2, fret: 0, note: 'B3', label: 'last', role: 'ghost' },
          { string: 4, fret: 6, note: 'Ab3', finger: 2, role: 'target' },
        ],
        caption: 'Bars 8 to 9: the open {n:B}, then {n:Ab} with finger 2.',
      },
    },
    {
      type: 'choice',
      prompt: 'How do you practise a shift?',
      options: [
        { text: 'The note before it and the note after it', correct: true },
        { text: 'The whole piece, until the shift improves', why: 'Then you practise the shift once per run-through: thirty seconds of work in ten minutes.' },
        { text: 'Watch the hand while it moves', why: 'Glance if you must, but a reader\'s eyes stay on the page. Loop the pair until the hand knows the way.' },
      ],
      explain: 'Two notes, on loop: the last before the shift and the first after it, until the hand moves without thought. Then put it back in the bar.',
      fact: 'rd-shift-practice',
    },
    {
      type: 'card',
      title: 'Four shifts, each with a way in',
      body: 'The study shifts four times, and each shift has a way in: an open string ringing while the hand moves (bars 8 and 26), the same note on a new string (bars 14 to 15), and a note taken by another finger (bar 20: {n:G#} with finger 1, not 3). The hand moves while something sounds, never into a gap.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each shift with its way in.',
      pairs: [
        { left: 'Bars 8 to 9', right: 'Open B: to fifth position' },
        { left: 'Bars 14 to 15', right: 'The same E, a new string' },
        { left: 'Bar 20', right: 'Finger 1 on {n:G#}: ninth' },
        { left: 'Bars 26 to 27', right: 'Open B: to twelfth' },
      ],
      explain: 'Open strings carry two shifts, a shared note the third, and a change of finger the fourth. Mark all four in the music before you play.',
      fact: 'rd-shift-way-in',
    },
    {
      type: 'true-false',
      statement: 'At bars 14 to 15, string 2, fret 5 and string 3, fret 9 are the same {n:E}.',
      answer: true,
      explain: 'Both are {n:E4}: the last note in fifth position and the first in seventh. The pitch does not change; only the address does.',
      fact: 'rd-shift-way-in',
    },
    {
      type: 'card',
      title: 'Check every signature',
      body: 'The study changes meter between 4/4, 3/4 and 6/8, and its keys have up to four sharps or flats: {k:E major}, {k:F minor}, {k:C major}, {k:A major}, then {k:E major} an octave higher. Before you begin, say each key signature aloud and count each new meter once.',
      figure: { kind: 'circle', key: 'E major', highlight: ['F minor', 'C major', 'A major'], caption: 'The study\'s keys: {k:E major}, {k:F minor}, {k:C major}, {k:A major}.' },
    },
    { generate: 'key-signature', params: { ask: 'count', modes: ['major', 'minor'], maxAccidentals: 4 } },
    {
      type: 'choice',
      prompt: 'Bars 15 to 20 are in 6/8, after 3/4. What stays the same?',
      options: [
        { text: 'The speed of the eighth note', correct: true },
        { text: 'The number of beats', why: '3/4 has three beats; 6/8 has two, each of three eighths.' },
        { text: 'Where the accents fall', why: '3/4 leans on every second eighth; 6/8 on eighths 1 and 4.' },
      ],
      explain: 'Six eighths each bar, at one speed throughout: only the grouping changes, three twos becoming two threes.',
      fact: 'rd-check-signatures',
    },
    playerTask({
      id: 'shift-points',
      title: 'The shift points alone, on loop',
      song: 'st-read-shifting',
      bars: [8, 9],
      tempo: 63,
      minutes: 6,
      body: 'Bars 8 to 9 on loop at about 50 BPM: the open {n:B}, the move, {n:Ab} with finger 2. Then set the loop to bars 14 to 15, 20 to 21 and 26 to 27 in turn. Each one until it is boring; boring is the sound of a shift that works.',
    }),
    { generate: 'key-signature', params: { ask: 'accidentals', modes: ['major', 'minor'], maxAccidentals: 4 } },
    playerTask({
      id: 'shifting-whole',
      title: 'The whole study, at 50 then 66 BPM',
      song: 'st-read-shifting',
      tempo: 63,
      minutes: 8,
      body: 'Now all 32 bars at about 50 BPM, saying each new key signature aloud as you reach it. Then 83 % (66 BPM). If a shift breaks, it goes back on loop tomorrow; do not repair it in the run-through.',
    }),
    { generate: 'key-signature', params: { ask: 'key', modes: ['major', 'minor'], maxAccidentals: 4 } },
  ],
  facts: [
    { id: 'rd-shift-practice', front: 'How do you practise a shift?', back: 'Mark it in the music, then loop the last note before it and the first note after it until the hand moves without thought.' },
    { id: 'rd-shift-way-in', front: 'What makes a shift reliable?', back: 'A way in: an open string ringing, the same note on a new string, or a new finger on the next note. The hand moves while something sounds.' },
    { id: 'rd-check-signatures', front: 'A piece changes key and meter. Before you play?', back: 'Say every key signature aloud and count every new meter once. In a change of meter the eighth note usually keeps its speed.' },
  ],
};

// ── 5. Fives and sevens ─────────────────────────────────────────────────────────────────────────

const oddMeters: TeacherLesson = {
  id: 'odd-meters',
  title: 'Fives and sevens',
  teaches: 'Feel 5/4 and 7/8 as unequal groups of twos and threes: count the groups and accent each first note.',
  minutes: 5,
  skill: 'teacher:elena:odd-meters',
  steps: [
    {
      type: 'card',
      title: 'Unequal groups',
      body: 'An {t:odd-meter|odd meter} is felt as unequal groups: 5/4 as 3+2 or 2+3; 7/8 as 2+2+3, 3+2+2 or 2+3+2. Count the groups, not the total: 7/8 as 2+2+3 is one-two, one-two, one-two-three. Accent the first note of each group and the meter suddenly feels natural.',
      figure: { kind: 'tab', notes: [...SEVEN_2_2_3, ...SEVEN_2_2_3], time: '2+2+3/8', tempo: 80, caption: '7/8 as 2+2+3: the low {n:E} starts each group.' },
    },
    {
      type: 'choice',
      prompt: 'How do you count 7/8 grouped 2+2+3?',
      options: [
        { text: 'One-two, one-two, one-two-three', correct: true },
        { text: 'One to seven, evenly', why: 'That counts the total, and every eighth weighs the same: the bar has no shape.' },
        { text: 'One-two-three, one-two, one-two', why: 'That is 3+2+2: the long group first.' },
      ],
      explain: 'Count the groups: two short ones and a long one. Each "one" is an accent.',
      fact: 'rd-odd-count',
    },
    {
      type: 'tap-rhythm',
      prompt: '5/4 grouped 3+2: tap beats 1 and 4 only, counting all five aloud. Two bars.',
      rhythm: { pattern: 'h. h | h. h', time: '3+2/4' },
      tempo: 100,
      show: 'both',
      explain: 'One-two-three, one-two: a long group, then a short one. The taps fall on the two "ones".',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Now 2+3: tap beats 1 and 3 only. Two bars.',
      rhythm: { pattern: 'h h. | h h.', time: '2+3/4' },
      tempo: 100,
      show: 'both',
      explain: 'One-two, one-two-three: the same five beats, the short group first. The bar leans differently, and that is the whole difference.',
      fact: 'rd-odd-groups',
    },
    {
      type: 'listen-choice',
      prompt: 'Two bars of 7/8 on {c:Am}; the open {n:A} starts each group. Which grouping?',
      sound: { kind: 'tab', notes: [...SEVEN_3_2_2, ...SEVEN_3_2_2], tempo: 80 },
      options: [{ text: '2+2+3' }, { text: '3+2+2', correct: true }, { text: '2+3+2' }],
      shuffle: false,
      explain: 'The open {n:A} came on eighths 1, 4 and 6: three, then two, then two. That is 3+2+2.',
      fact: 'rd-odd-groups',
    },
    {
      type: 'card',
      title: 'The Metronome in seven',
      body: 'On the Metronome, 7/8 counts its tempo in quarter notes, so 160 eighth notes a minute is 80 BPM. Choose 7/8 grouped 2+2+3 and the Eighths subdivision: every eighth clicks, and the beat clicks on eighths 1, 3 and 5 mark the groups.',
    },
    toolTask({
      id: 'seven-metronome',
      title: '7/8 on the Metronome',
      tool: 'metronome',
      minutes: 4,
      body: '7/8, grouped 2+2+3, Eighths, 80 BPM. Strum {c:Em} on every eighth note, down strokes only, a little harder on eighths 1, 3 and 5. Count the groups aloud: one-two, one-two, one-two-three. Two minutes, then 3+2+2 for two more.',
      tip: 'If the long group keeps shrinking to two, say its "three" louder than the rest.',
    }),
    {
      type: 'tap-rhythm',
      prompt: '7/8 grouped 3+2+2, eighths at 160 a minute: tap the start of each group. Two bars.',
      rhythm: { pattern: 'q. q q | q. q q', time: '3+2+2/8' },
      tempo: 80,
      show: 'both',
      explain: 'Eighths 1, 4 and 6: the long group first, so the first gap is the longest.',
      fact: 'rd-odd-groups',
    },
    techniqueTask({
      id: 'odd-meter-ladder',
      title: 'Odd Meters: 5/4 and 7/8, up the ladder',
      exercise: 'tech-odd-meters',
      minutes: 6,
      body: 'Up its ladder: {c:Em} in 5/4 grouped 3+2, then 2+3; {c:Am} in 7/8 grouped 2+2+3, then 3+2+2. Count aloud throughout. Climb a rung only when the accents land where you count them.',
    }),
    {
      type: 'card',
      title: 'A riff in seven',
      body: 'Now write one: a 2-bar riff in 7/8 on {n:A} minor pentatonic ({n:A} {n:C} {n:D} {n:E} {n:G}), the low notes on the group starts. Mine is below. Play yours over the Metronome in 7/8 until it grooves; to keep it, type it as tab in Scan & Import (Tools, Paste tab or chords) and save it.',
      figure: { kind: 'tab', notes: RIFF_SEVEN, time: '2+2+3/8', tempo: 80, caption: 'Box 1, frets 5 to 8: low notes on eighths 1, 3 and 5.' },
    },
    {
      type: 'choice',
      prompt: 'Your 5/4 keeps sounding like a bar of 4/4 and a pause. The fix?',
      options: [
        { text: 'Play beat 5 as firmly as the others', correct: true },
        { text: 'Hurry through beat 5', why: 'Then the bar shrinks towards four, which is the problem.' },
        { text: 'Leave beat 5 out', why: 'Then it is 4/4, and honest about it.' },
      ],
      explain: 'Beat 5 is a real beat, not a breath. Strum it as firmly as beat 1 and the bar stops sounding one too long.',
    },
    { generate: 'meter', params: { ask: 'beats', signatures: ['5/4', '7/8', '6/8', '3/4'] } },
  ],
  facts: [
    { id: 'rd-odd-groups', front: 'How is an odd meter felt?', back: 'As unequal groups of twos and threes: 5/4 as 3+2 or 2+3; 7/8 as 2+2+3, 3+2+2 or 2+3+2.' },
    { id: 'rd-odd-count', front: 'How do you count 7/8 grouped 2+2+3?', back: 'One-two, one-two, one-two-three: count the groups, not the total, and accent each group\'s first note.' },
  ],
};

// ── 6. Hemiola and three against two ────────────────────────────────────────────────────────────

const hemiolaAndPolyrhythm: TeacherLesson = {
  id: 'hemiola-and-polyrhythm',
  title: 'Hemiola and three against two',
  teaches: 'A hemiola regroups six beats as two threes or three twos; three against two plays both at once.',
  minutes: 5,
  skill: 'teacher:elena:hemiola-and-polyrhythm',
  steps: [
    {
      type: 'card',
      title: 'Six beats, two ways',
      body: 'A {t:hemiola} regroups six beats as two threes or as three twos. Over the same six eighth notes, 6/8 is felt 3+3 and 3/4 is felt 2+2+2. Alternate them and you have the heartbeat of Sanz\'s Canarios, and of much Latin American music.',
      figure: { kind: 'tab', notes: HEMIOLA_BARS, time: '6/8', tempo: 90, caption: 'The low {n:E} every three eighths, then every two.' },
    },
    {
      type: 'choice',
      prompt: 'Six eighth notes, an accent on every second one. Which meter do you feel?',
      options: [
        { text: '3/4', correct: true },
        { text: '6/8', why: '6/8 groups its six eighths in threes: accents on 1 and 4.' },
        { text: '2/4', why: '2/4 holds only four eighths.' },
      ],
      shuffle: false,
      explain: 'Accents on eighths 1, 3 and 5 make three groups of two: three quarter-note beats, the feel of 3/4.',
      fact: 'rd-hemiola',
    },
    {
      type: 'listen-choice',
      prompt: 'Two bars on open strings; the low {n:E} marks each group. Threes or twos?',
      sound: { kind: 'tab', notes: THREE_TWOS, tempo: 90 },
      options: [{ text: 'Two groups of three, as in 6/8' }, { text: 'Three groups of two, as in 3/4', correct: true }],
      shuffle: false,
      explain: 'The low {n:E} came every second eighth: three twos in each bar, the 3/4 side of the hemiola.',
    },
    {
      type: 'card',
      title: 'Three against two',
      body: 'Three against two plays both at once: one part plays three even notes while the other plays two, and they meet on the beat. Say *nice cup of tea* and the rhythm falls into place: on *nice* both parts play, *cup* and *tea* are the threes, *of* is the twos.',
      figure: { kind: 'rhythm', pattern: 'qt et et qt', time: '2/4', tempo: 60, caption: 'Both parts together: nice, cup, of, tea.' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Who plays which syllable?',
      text: 'On *nice* both parts play. *Cup* belongs to the ___, *of* to the ___.',
      blanks: ['threes', 'twos'],
      bank: ['bass', 'rests'],
      explain: 'The threes fall at the start and a third and two thirds of the way through; the twos at the start and halfway. Halfway is *of*.',
      fact: 'rd-three-two',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap the combined rhythm at 60 BPM, saying nice cup of tea. Two bars of 2/4.',
      rhythm: { pattern: 'qt et et qt | qt et et qt', time: '2/4' },
      tempo: 60,
      show: 'both',
      explain: 'Long, short, short, long: nice, cup, of, tea. Both parts of three against two in one hand.',
      fact: 'rd-three-two',
    },
    {
      type: 'card',
      title: 'Now split it between the hands',
      body: 'The thumb takes the twos on the open low {n:E}, on each beat; the fingers take the threes on the open high {n:E}. On *nice* both pluck together. Listen first, slowly.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: [...THREE_AGAINST_TWO, ...THREE_AGAINST_TWO, ...THREE_AGAINST_TWO], tempo: 50 }, label: 'Hear three against two' },
    },
    {
      type: 'play-phrase',
      prompt: 'Thumb in two, fingers in three, on the open {n:E} strings at 60 BPM. Two bars.',
      notes: [...THREE_AGAINST_TWO, ...THREE_AGAINST_TWO],
      octave: 'any',
      tempo: 60,
      explain: 'The microphone checks the notes; your ear checks the rhythm. Thumb on each beat, fingers three times across the bar, together only on *nice*.',
      alternative: {
        type: 'tap-rhythm',
        prompt: 'Tap it on a table with two hands, thumb hand on the beats; here, tap what both make together.',
        rhythm: { pattern: 'qt et et qt | qt et et qt', time: '2/4' },
        tempo: 60,
        show: 'both',
        explain: 'Nice, cup, of, tea: the two hands meet on the beat and alternate between.',
      },
    },
    playerTask({
      id: 'solea-twelve',
      title: 'The hemiola in the solea, at 66 BPM',
      song: 'st-solea-compas',
      tempo: 61,
      minutes: 6,
      body: 'Canarios is not in the library; its nearest relation here is the solea. Its 12 counts accent 3, 6, 8, 10 and 12: two threes, then three twos, a hemiola in every cycle. At about 66 BPM, then 100 % (108 BPM). Make the change from threes to twos audible.',
      tip: 'Count the twelve aloud for one cycle before you play a stroke.',
    }),
    {
      type: 'choice',
      prompt: 'The solea accents counts 3, 6, 8, 10 and 12. How do its twelve counts group?',
      options: [
        { text: '3+3+2+2+2', correct: true },
        { text: '3+3+3+3', why: 'Then the accents would fall on 3, 6, 9 and 12.' },
        { text: '2+2+2+3+3', why: 'The threes come first: the accents on 3 and 6 are three apart, the rest two apart.' },
        { text: '4+4+4', why: 'Then the accents would fall on 4, 8 and 12.' },
      ],
      explain: 'Accents three apart (3, 6), then two apart (8, 10, 12): two threes, then three twos. The 6/8 and 3/4 of the hemiola, inside one cycle.',
      fact: 'rd-solea-hemiola',
    },
    {
      type: 'card',
      title: 'Your own Canarios',
      body: 'If you own an edition of Sanz\'s Canarios, bring it in: in Tools, open Scan & Import, photograph each page or drop in a PDF, proofread every bar against the page, then save and play. Learn it at 66 BPM, and make the 3/4 bars audible against the 6/8: lean on each quarter-note beat where the music regroups.',
    },
    {
      type: 'true-false',
      statement: 'Three against two speeds up the beat.',
      answer: false,
      explain: 'The beat keeps its speed. One part divides it in two, the other in three, and they meet on the beat.',
    },
  ],
  facts: [
    { id: 'rd-hemiola', front: 'What does a hemiola do with six beats?', back: 'It regroups them: two threes (as in 6/8) become three twos (as in 3/4), or back again.' },
    { id: 'rd-three-two', front: 'How do you feel three against two?', back: 'Say nice cup of tea: both parts on nice, the threes on cup and tea, the twos on of.' },
    { id: 'rd-solea-hemiola', front: 'Where is the hemiola in the solea?', back: 'In every cycle: twelve counts accented on 3, 6, 8, 10 and 12, grouped 3+3, then 2+2+2.' },
  ],
};

// ── The unit ────────────────────────────────────────────────────────────────────────────────────

const unit: TeacherUnit = {
  id: 'elena-reading-and-meter',
  title: 'Sight-reading and rhythm',
  theme: 'reading',
  description: 'Read fluently in any position, sight-read daily, and play odd meters, hemiola and three against two.',
  lessons: [readingInFifthPosition, seventhPositionAndChoices, sightReadingRoutine, shiftingThroughTheNeck, oddMeters, hemiolaAndPolyrhythm],
  glossary: [
    { id: 'odd-meter', term: 'odd meter', definition: 'A meter felt as unequal groups of twos and threes, such as 5/4 (3+2) or 7/8 (2+2+3).' },
    { id: 'hemiola', term: 'hemiola', definition: 'Six beats regrouped: two groups of three heard as three groups of two, as when 6/8 alternates with 3/4.' },
  ],
};

export default unit;
