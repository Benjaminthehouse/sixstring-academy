/**
 * Dev, unit 4: The pentatonic, all five boxes (plan: `dev/dev-pentatonic` in
 * src/content/plan/teachers.json).
 *
 * Boxes 2 to 5 of A minor pentatonic, each learned through its lick from the song library and a
 * jam, then one map of the neck (Pentatonic Across the Neck), the same shapes as major pentatonic,
 * and a jam where the same notes take two moods. Dev's voice: a bandmate who ties every shape to
 * something to play tonight.
 *
 * Every box is derived from the guitar engine (`scalePatterns`), never typed, and
 * `dev-pentatonic.test.ts` checks the boxes against the plan's lists, every fret the text names,
 * the tab against the library's studies, and each Player tempo against the song's own.
 *
 * Mo Li Hua is in the library (the first half of the verse, played plain and then with slides from
 * two frets below); Morning Mood is not yet. Each task keeps a fallback to the nearest piece that is
 * (Amazing Grace's tune, G major pentatonic; Pentatonic Across the Neck over C), used only while
 * its song is missing.
 */
import { scalePatterns, type ScalePattern } from '@/core/guitar';
import type { FretDot, TabNote } from '@/lessons';
import type { TeacherLesson, TeacherUnit } from '../types';
import { playerTask, techniqueTask, toolTask } from '../tasks';

// ── The boxes, from the engine ─────────────────────────────────────────────────────────────────

/** A minor pentatonic boxes 1 to 5 laid out as one climb: frets 5, 7, 9, 12 and 14. */
const UP_THE_NECK = scalePatterns('A', 'minor-pentatonic', { upTheNeck: true });
/** The same five boxes each at its lowest place: box 4 in open position, box 5 at frets 2 to 5. */
const LOWEST = scalePatterns('A', 'minor-pentatonic');

/** Box `n` of A minor pentatonic: `low` takes it at its lowest place on the neck. */
export function box(n: 1 | 2 | 3 | 4 | 5, low = false): ScalePattern {
  const p = (low ? LOWEST : UP_THE_NECK).find((x) => x.id === `box-${n}`);
  if (!p) throw new Error(`A minor pentatonic box ${n} is missing`);
  return p;
}

/** A major pentatonic: the box 1 shape moved down to fret 2 (F# minor pentatonic box 1). */
const A_MAJOR_AT_2 = scalePatterns('F#', 'minor-pentatonic').find((p) => p.id === 'box-1')!;

/** Dots for a box, every one with its note claimed (and its finger, for finger labels). */
function dots(p: ScalePattern, opts: { fingers?: boolean; role?: FretDot['role'] } = {}): FretDot[] {
  return p.notes.map((n) => {
    const d: FretDot = { string: n.string, fret: n.fret, note: n.note };
    if (opts.fingers && n.finger >= 1 && n.finger <= 4) d.finger = n.finger as 1 | 2 | 3 | 4;
    if (opts.role) d.role = opts.role;
    return d;
  });
}

/** Two boxes on one neck: the first faded, the second plain, the notes they share highlighted. */
function twoBoxes(first: ScalePattern, second: ScalePattern): FretDot[] {
  const key = (d: { string: number; fret: number }) => `${d.string}:${d.fret}`;
  const inSecond = new Set(second.notes.map(key));
  const inFirst = new Set(first.notes.map(key));
  return [
    ...dots(first).map((d) => ({ ...d, role: inSecond.has(key(d)) ? ('target' as const) : ('ghost' as const) })),
    ...dots(second).filter((d) => !inFirst.has(key(d))).map((d) => ({ ...d, role: 'tone' as const })),
  ];
}

/** A box played up (low string to high) or down, one note per beat. */
function run(p: ScalePattern, direction: 'up' | 'down', duration = 'q'): TabNote[] {
  const up = p.notes.map((n) => ({ string: n.string, fret: n.fret, duration }));
  return direction === 'up' ? up : [...up].reverse();
}

/** One tab note. */
function t(string: number, fret: number, duration: string): TabNote {
  return { string, fret, duration };
}

/** Pentatonic Box 2 Lick, bar 1: the slide on string 3 that carries the hand from box 1 into box 2. */
export const BOX_2_LICK_BAR_1: TabNote[] = [t(3, 7, 'e'), t(3, 9, 'e'), t(2, 8, 'q'), t(2, 10, 'e'), t(2, 8, 'e'), t(3, 9, 'q')];

/** Pentatonic Across the Neck, bars 1 and 2: box 5, then the slide on string 3 into box 1. */
export const CONNECT_BARS_1_2: TabNote[] = [
  t(2, 5, 'q'), t(2, 3, 'e'), t(3, 5, 'e'), t(3, 2, 'q'), t(4, 5, 'q'),
  t(4, 2, 'e'), t(4, 5, 'e'), t(3, 2, 'q'), t(3, 5, 'q'), t(3, 7, 'q'),
];

/** The box 1 shape at fret 2 from A to A: string 6 fret 5 up to string 3 fret 2. */
export const A_MAJOR_A_TO_A: TabNote[] = [t(6, 5, 'q'), t(5, 2, 'q'), t(5, 4, 'q'), t(4, 2, 'q'), t(4, 4, 'q'), t(3, 2, 'h.')];

/** G major pentatonic in open position: E minor pentatonic box 1, at the nut. */
const G_MAJOR_OPEN = scalePatterns('E', 'minor-pentatonic').find((p) => p.id === 'box-1')!;

// ── 1. Box 2 ───────────────────────────────────────────────────────────────────────────────────

const box2: TeacherLesson = {
  id: 'box-2',
  title: 'Box 2',
  teaches: 'Box 2 sits at frets 7 to 10 and shares six notes with box 1, so you cross between them on those notes.',
  minutes: 5,
  skill: 'teacher:dev:box-2',
  steps: [
    {
      type: 'card',
      title: 'Five boxes, one scale',
      body: 'Box 1 is home. But the same five notes, {n:A} {n:C} {n:D} {n:E} {n:G}, fill the whole neck in five {t:pent-box|boxes} that overlap like tiles. Box 2 sits at frets 7 to 10 and starts on box 1\'s top notes: fret 8 on strings 6, 2 and 1 and fret 7 on strings 5, 4 and 3 belong to both.',
      figure: { kind: 'fretboard', frets: [5, 10], dots: twoBoxes(box(1), box(2)), caption: 'Faded: box 1. Plain: box 2. Highlighted: notes in both.' },
    },
    {
      type: 'choice',
      prompt: 'On strings 5, 4 and 3, which notes do box 1 and box 2 share?',
      options: [
        { text: 'The notes at fret 7', correct: true },
        { text: 'The notes at fret 8', why: 'Fret 8 is shared on strings 6, 2 and 1. On strings 5, 4 and 3, box 1 tops out at fret 7.' },
        { text: 'The notes at fret 5', why: 'Fret 5 is box 1 only: box 2 starts higher.' },
      ],
      explain: 'Box 1 tops out at fret 7 on strings 5, 4 and 3 ({n:E} {n:A} {n:D}) and at fret 8 on strings 6, 2 and 1 ({n:C} {n:G} {n:C}). Box 2 starts on exactly those six notes.',
      fact: 'pent-box-2-shared',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap every note of box 2: A minor pentatonic from fret 7 to fret 10.',
      find: { scale: 'minor-pentatonic', tonic: 'A' },
      mode: 'all',
      octave: 'any',
      frets: [7, 10],
      explain: 'Two notes on every string, twelve in all. Its two {n:A} roots are string 4, fret 7 and string 2, fret 10.',
      fact: 'pent-box-2-place',
    },
    {
      type: 'card',
      title: 'Fingers for box 2',
      body: 'One finger per fret, index at fret 7: finger 1 on fret 7, 2 on 8, 3 on 9, 4 on 10. The hand never moves. Its roots are under finger 1 on string 4 and finger 4 on string 2.',
      figure: { kind: 'fretboard', frets: [7, 10], labels: 'finger', dots: dots(box(2), { fingers: true }), caption: 'Box 2, one finger per fret from fret 7.' },
      tip: 'Learn a box through music, not just up and down. The scale run is the warm-up; the lick is the point.',
    },
    {
      type: 'play-phrase',
      prompt: 'Play box 2 up, one note per click: string 6, fret 8 to string 1, fret 10.',
      notes: run(box(2), 'up'),
      octave: 'exact',
      tempo: 60,
      explain: 'Two notes a string, low to high: {n:C} {n:D}, {n:E} {n:G}, {n:A} {n:C}, {n:D} {n:E}, {n:G} {n:A}, {n:C} {n:D}.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap the six notes of box 2 on strings 6, 5 and 4.',
        find: { scale: 'minor-pentatonic', tonic: 'A' },
        mode: 'all',
        octave: 'any',
        frets: [7, 10],
        strings: [6, 5, 4],
        explain: 'String 6: frets 8 and 10. String 5: frets 7 and 10. String 4: frets 7 and 10.',
      },
    },
    {
      type: 'play-phrase',
      prompt: 'And back down, from string 1, fret 10 to string 6, fret 8.',
      notes: run(box(2), 'down'),
      octave: 'exact',
      tempo: 60,
      explain: 'The same twelve notes high to low. Keep each finger over its own fret, so nothing has to search.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap the six notes of box 2 on strings 3, 2 and 1.',
        find: { scale: 'minor-pentatonic', tonic: 'A' },
        mode: 'all',
        octave: 'any',
        frets: [7, 10],
        strings: [3, 2, 1],
        explain: 'String 3: frets 7 and 9. String 2: frets 8 and 10. String 1: frets 8 and 10.',
      },
    },
    playerTask({
      id: 'box-2-lick',
      title: 'The Pentatonic Box 2 Lick',
      song: 'st-pent-box-2',
      tempo: 80,
      minutes: 5,
      body: 'Play it at 80 % (70 BPM). It opens with a {t:slide}: finger 3 plays {n:D} at string 3, fret 7, where it sits in box 1, and slides up to {n:E} at fret 9. That one move carries your hand into box 2. When it is clean, go to 102 % (90 BPM).',
      tip: 'Keep pressing all the way through the slide. If the note dies on the way, press, do not rush.',
    }),
    {
      type: 'fretboard-name',
      prompt: 'Which note is string 2, fret 10, under your little finger in box 2?',
      position: { string: 2, fret: 10 },
      ask: 'note',
      spelling: 'any',
      options: ['A', 'G', 'C', 'D'],
      explain: 'String 2, fret 10 is {n:A}, the high root of box 2. The lick comes home to it in its last bar.',
      fact: 'pent-box-2-place',
    },
    toolTask({
      id: 'box-2-hunt',
      title: 'Note Hunt in boxes 2 and 1',
      tool: 'arcade',
      params: ['note-hunt', 'a-minor-pentatonic', 'box-2'],
      minutes: 3,
      body: 'Play a round of Note Hunt in box 2: notes light up, you play them or tap them. Then tap Change, pick box 1, and play a round there. Watch for the six notes the two boxes share.',
    }),
    {
      type: 'choice',
      prompt: 'Which notes of A minor pentatonic are chord tones of {c:Am7}? Pick all of them.',
      multiple: true,
      options: [
        { text: '{n:A}', correct: true },
        { text: '{n:C}', correct: true },
        { text: '{n:D}', why: '{n:D} is in the scale but not in the chord: a phrase that stops on it sounds unfinished.' },
        { text: '{n:E}', correct: true },
        { text: '{n:G}', correct: true },
      ],
      explain: '{c:Am7} is {n:A} {n:C} {n:E} {n:G}: four of the five scale notes. End a phrase on one of those and it sounds settled.',
      fact: 'pent-chord-tones-am7',
    },
    toolTask({
      id: 'box-2-jam',
      title: 'Jam in boxes 1 and 2',
      tool: 'progressions',
      params: ['funk-one-chord-minor', 'a', 'jam'],
      minutes: 4,
      body: 'Set the band to 90 BPM on {c:Am7}. Improvise in boxes 1 and 2 only, crossing between them at the shared notes, and end each phrase on a {t:chord-tone}: {n:A}, {n:C}, {n:E} or {n:G}. Short phrases, with space between them.',
      tip: 'Steal from the lick. Its slide on string 3 is the bridge between the boxes.',
    }),
    {
      type: 'true-false',
      statement: 'Sliding on string 3 from fret 7 to fret 9 takes you from box 1 into box 2.',
      answer: true,
      explain: 'Fret 7 on string 3 ({n:D}) is the top of box 1 and the bottom of box 2; fret 9 ({n:E}) is box 2 only. The lick opens with exactly that slide.',
    },
  ],
  facts: [
    { id: 'pent-box-2-shared', front: 'Which notes do A minor pentatonic boxes 1 and 2 share?', back: 'Fret 8 on strings 6, 2 and 1, and fret 7 on strings 5, 4 and 3.' },
    { id: 'pent-box-2-place', front: 'Where is A minor pentatonic box 2, and where are its roots?', back: 'Frets 7 to 10, index on fret 7. Its {n:A} roots: string 4, fret 7 and string 2, fret 10.' },
    { id: 'pent-chord-tones-am7', front: 'Which notes of A minor pentatonic are chord tones of {c:Am7}?', back: '{n:A} {n:C} {n:E} {n:G}. Only {n:D} is not in the chord.' },
  ],
};

// ── 2. Box 3 ───────────────────────────────────────────────────────────────────────────────────

const box3: TeacherLesson = {
  id: 'box-3',
  title: 'Box 3',
  teaches: 'Box 3 runs from fret 9 to fret 13, the widest box, with roots at string 5, fret 12 and string 2, fret 10.',
  minutes: 5,
  skill: 'teacher:dev:box-3',
  steps: [
    {
      type: 'card',
      title: 'The wide one',
      body: 'Box 3 reaches from fret 9 to fret 13, the widest of the five. Its two {n:A} roots, string 5, fret 12 and string 2, fret 10, are a handy pair to aim phrases at.',
      figure: { kind: 'fretboard', frets: [9, 13], root: 'A', labels: 'degree', dots: dots(box(3)), caption: 'Box 3 by degree: the 1s are the A roots.' },
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap both {n:A} roots of box 3, between fret 9 and fret 13.',
      find: { note: 'A' },
      mode: 'all',
      octave: 'any',
      frets: [9, 13],
      explain: 'String 5, fret 12 and string 2, fret 10: two {n:A}s an octave apart. Aim a phrase at one of them and it lands home.',
      fact: 'pent-box-3-roots',
    },
    {
      type: 'card',
      title: 'Stretch, or shift a fret',
      body: 'Park your index at fret 10, ring finger at 12. On string 3 the index reaches back to fret 9 and the little finger takes 12; on string 2 it is back at fret 10 and the little finger takes 13. Stretch if it is comfortable, or shift the hand a fret for that string and come back.',
      figure: { kind: 'fretboard', frets: [9, 13], labels: 'finger', dots: dots(box(3), { fingers: true }), caption: 'Box 3 fingering: index at fret 10, back to 9 on string 3.' },
      tip: 'Effort is fine; strain is not. The moment it feels like strain, stop and shake the hand out.',
    },
    {
      type: 'choice',
      prompt: 'On string 3 of box 3, what does your index finger do?',
      options: [
        { text: 'Reaches back to fret 9', correct: true },
        { text: 'Stays on fret 10', why: 'String 3, fret 10 is {n:F}, which is not in the scale. The box note there is {n:E} at fret 9.' },
        { text: 'Moves up to fret 11', why: 'String 3, fret 11 is {n:F#}, not in the scale either.' },
      ],
      explain: 'On string 3 the box notes are fret 9 ({n:E}) and fret 12 ({n:G}), so the index reaches back a fret and the little finger takes 12.',
      fact: 'pent-box-3-place',
    },
    {
      type: 'play-phrase',
      prompt: 'Play box 3 up, slowly: string 6, fret 10 to string 1, fret 12.',
      notes: run(box(3), 'up'),
      octave: 'exact',
      tempo: 50,
      explain: '{n:D} {n:E}, {n:G} {n:A}, {n:C} {n:D}, {n:E} {n:G}, {n:A} {n:C}, {n:D} {n:E}. The reach is on strings 3 and 2.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap every note of box 3: A minor pentatonic from fret 9 to fret 13.',
        find: { scale: 'minor-pentatonic', tonic: 'A' },
        mode: 'all',
        octave: 'any',
        frets: [9, 13],
        explain: 'Frets 10 and 12 on strings 6, 5, 4 and 1; frets 9 and 12 on string 3; frets 10 and 13 on string 2.',
      },
    },
    {
      type: 'play-phrase',
      prompt: 'And back down, from string 1, fret 12 to string 6, fret 10.',
      notes: run(box(3), 'down'),
      octave: 'exact',
      tempo: 50,
      explain: 'The same twelve notes high to low. If the reach on string 2 slows you down, shift for it and come back.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap the box 3 notes on strings 3 and 2, the ones that need the reach.',
        find: { scale: 'minor-pentatonic', tonic: 'A' },
        mode: 'all',
        octave: 'any',
        frets: [9, 13],
        strings: [3, 2],
        explain: 'String 3: frets 9 and 12. String 2: frets 10 and 13.',
      },
    },
    playerTask({
      id: 'box-3-lick',
      title: 'The Pentatonic Box 3 Lick',
      song: 'st-pent-box-3',
      tempo: 80,
      minutes: 4,
      body: 'Play it at 80 % (70 BPM), then 102 % (90 BPM). It ends with a {t:pull-off}: finger 4 on string 2, fret 13 ({n:C}) pulls off to finger 1 on fret 10 ({n:A}), so the last note is the root.',
      tip: 'Pull off slightly downward, toward the floor, so the lower note rings as loud as the upper one.',
    }),
    techniqueTask({
      id: 'box-3-stretch',
      title: 'Gentle Stretch, Walking Down',
      exercise: 'tech-stretch',
      minutes: 3,
      body: 'For the reach box 3 needs: one finger per fret on string 3, starting at frets 9 to 12, walking toward the nut a fret at a time, at 50 BPM. Stop as soon as it feels like strain rather than effort, and try again another day.',
      tip: 'Keep the thumb low behind the neck, about opposite finger 2. It lets the fingers open wider.',
    }),
    {
      type: 'fretboard-name',
      prompt: 'Which note is string 2, fret 13, where the lick\'s pull-off starts?',
      position: { string: 2, fret: 13 },
      ask: 'note',
      spelling: 'any',
      options: ['C', 'B', 'D', 'A'],
      explain: 'String 2, fret 13 is {n:C}. Pulling off to fret 10 lands on {n:A}, the root: a strong way to end a phrase.',
    },
    toolTask({
      id: 'box-3-jam',
      title: 'Jam: aim for the two roots',
      tool: 'progressions',
      params: ['minor-i-bvi-bvii', 'a', 'jam'],
      minutes: 4,
      body: 'Set the band to 92 BPM: {c:Am} {c:F} {c:G} {c:Am}. Play phrases in box 3 that land on one of its {n:A} roots, string 5, fret 12 or string 2, fret 10. Then slide down into box 2 for a phrase, and back up.',
    }),
    {
      type: 'true-false',
      statement: 'Box 3\'s two {n:A} roots are string 5, fret 12 and string 2, fret 10.',
      answer: true,
      explain: 'Both are {n:A}, an octave apart, and both sit under a strong finger: the ring finger on string 5 and the index on string 2.',
      fact: 'pent-box-3-roots',
    },
  ],
  facts: [
    { id: 'pent-box-3-place', front: 'Where is A minor pentatonic box 3, and what makes it awkward?', back: 'Frets 9 to 13, the widest box: on strings 3 and 2 the hand stretches or shifts by a fret.' },
    { id: 'pent-box-3-roots', front: 'Where are the {n:A} roots in box 3?', back: 'String 5, fret 12 and string 2, fret 10.' },
    { id: 'stretch-not-strain', front: 'How far should a stretch go?', back: 'Until it is effort, never strain. Stop at the first sign of strain and come back another day.' },
  ],
};

// ── 3. Boxes 4 and 5 ───────────────────────────────────────────────────────────────────────────

const boxes4And5: TeacherLesson = {
  id: 'boxes-4-and-5',
  title: 'Boxes 4 and 5',
  teaches: 'Box 4 sits at frets 12 to 15 or in open position; box 5 at frets 2 to 5 leads straight back into box 1.',
  minutes: 5,
  skill: 'teacher:dev:boxes-4-and-5',
  steps: [
    {
      type: 'card',
      title: 'Box 4, in two places',
      body: 'Box 4 lies at frets 12 to 15. Twelve frets lower it is the same shape in open position: open strings where fret 12 was, and frets 1 to 3 for 13 to 15. Same notes, an octave apart.',
      figure: { kind: 'fretboard', frets: [12, 15], root: 'A', labels: 'degree', dots: dots(box(4)), caption: 'Box 4 at fret 12. Take 12 off every fret for open position.' },
    },
    {
      type: 'choice',
      prompt: 'In box 4 at fret 12, string 2, fret 13 is {n:C}. Where is that {n:C} in open-position box 4?',
      options: [
        { text: 'String 2, fret 1', correct: true },
        { text: 'String 2, fret 3', why: 'String 2, fret 3 is {n:D}: that is fret 15 moved down.' },
        { text: 'String 3, fret 1', why: 'The strings stay the same; only the fret numbers drop by 12.' },
      ],
      explain: 'Take 12 off the fret and keep the string: fret 13 becomes fret 1. String 2, fret 1 is {n:C}, an octave lower.',
      fact: 'pent-box-4-place',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap every note of box 4 in open position: A minor pentatonic from the open strings to fret 3.',
      find: { scale: 'minor-pentatonic', tonic: 'A' },
      mode: 'all',
      octave: 'any',
      frets: [0, 3],
      explain: 'Open strings mixed with frets 1 to 3: open and 3 on strings 6, 5 and 1, open and 2 on strings 4 and 3, 1 and 3 on string 2.',
      fact: 'pent-box-4-place',
    },
    {
      type: 'card',
      title: 'Box 5 closes the circle',
      body: 'Box 5 lies at frets 2 to 5 (or 14 to 17). Its top notes, fret 5 on every string, are box 1\'s bottom notes, so after box 5 comes box 1 again. Five boxes, and the circle is closed.',
      figure: { kind: 'fretboard', frets: [2, 8], dots: twoBoxes(box(5, true), box(1)), caption: 'Faded: box 5. Plain: box 1. Highlighted: the notes they share.' },
    },
    {
      type: 'choice',
      prompt: 'Which notes do box 5 (frets 2 to 5) and box 1 share?',
      options: [
        { text: 'Every note at fret 5', correct: true },
        { text: 'Every note at fret 2', why: 'Fret 2 is box 5 only, far below box 1.' },
        { text: 'Only the {n:A} roots', why: 'More than that: all six notes at fret 5 belong to both boxes.' },
      ],
      explain: 'Box 5 tops out at fret 5 on every string, exactly where box 1 begins. Go up from box 5 and you are in box 1.',
      fact: 'pent-box-5-place',
    },
    playerTask({
      id: 'box-4-lick',
      title: 'The Pentatonic Box 4 Lick',
      song: 'st-pent-box-4',
      tempo: 80,
      minutes: 4,
      body: 'Play it at 80 % (70 BPM): bars 1 to 8 at fret 12, then the same music in open position. Bar 7 bends {n:D} on string 2 a whole step up to {n:E}, ring finger with the middle finger behind it. The next note is the real {n:E} on string 1, so you hear at once if the bend got there.',
      tip: 'Bend with the wrist turning, not the finger pushing alone, and stop at the pitch, not past it.',
    }),
    playerTask({
      id: 'box-5-lick',
      title: 'The Pentatonic Box 5 Lick',
      song: 'st-pent-box-5',
      tempo: 80,
      minutes: 3,
      body: 'Play it at 80 % (70 BPM). The last note, {n:A} at string 3, fret 2, lasts two beats: give it {t:vibrato} with finger 1, rocking from the wrist, about two even waves per beat.',
    }),
    {
      type: 'true-false',
      statement: 'The bend in the box 4 lick raises {n:D} by a whole step, to {n:E}.',
      answer: true,
      explain: 'A whole step is two frets\' worth: string 2, fret 15 bent until it sounds like fret 17. The {n:E} at string 1, fret 12 right after it tells you whether you got there.',
    },
    toolTask({
      id: 'boxes-hunt',
      title: 'Note Hunt in boxes 4, 5 and 1',
      tool: 'arcade',
      params: ['note-hunt', 'a-minor-pentatonic', 'box-4'],
      minutes: 4,
      body: 'Play a round of Note Hunt in box 4 (the arcade shows it in open position), then tap Change for box 5, then box 1. Three rounds, climbing the neck in order.',
    }),
    {
      type: 'fretboard-name',
      prompt: 'Which note is string 3, fret 2, where the box 5 lick ends with vibrato?',
      position: { string: 3, fret: 2 },
      ask: 'note',
      spelling: 'any',
      options: ['A', 'G', 'C', 'E'],
      explain: 'String 3, fret 2 is {n:A}, the root, under finger 1. A long root with vibrato is a strong ending.',
    },
    toolTask({
      id: 'boxes-4-5-jam',
      title: 'Jam: a chorus in each box',
      tool: 'progressions',
      params: ['blues-minor', 'a', 'jam'],
      minutes: 4,
      body: 'Set the band to 80 BPM for a minor blues in A. One chorus in box 4 at fret 12, one in box 5 at fret 2, and end every phrase on an {n:A}.',
      tip: 'In box 5 the roots are string 6, fret 5, string 3, fret 2 and string 1, fret 5.',
    }),
    {
      type: 'choice',
      prompt: 'You are in box 5 at frets 2 to 5 and climb up the neck. Which box comes next?',
      options: [
        { text: 'Box 1, at frets 5 to 8', correct: true },
        { text: 'Box 4, at frets 12 to 15', why: 'Box 4 comes before box 5, not after it.' },
        { text: 'Box 2, at frets 7 to 10', why: 'Box 2 comes after box 1.' },
      ],
      explain: 'The circle: 1, 2, 3, 4, 5, and then 1 again. Box 5\'s top notes at fret 5 are where box 1 starts.',
      fact: 'pent-box-5-place',
    },
  ],
  facts: [
    { id: 'pent-box-4-place', front: 'Where does A minor pentatonic box 4 sit?', back: 'Frets 12 to 15, and an octave lower in open position: open strings up to fret 3.' },
    { id: 'pent-box-5-place', front: 'Where does box 5 sit, and what comes after it?', back: 'Frets 2 to 5 (or 14 to 17). Its notes at fret 5 are box 1\'s lowest, so box 1 follows.' },
    { id: 'shape-twelve-frets', front: 'A shape moved twelve frets up or down: what changes?', back: 'Only the octave. Every fret number changes by 12 and the notes stay the same.' },
  ],
};

// ── 4. One map of the neck ─────────────────────────────────────────────────────────────────────

const connectingTheBoxes: TeacherLesson = {
  id: 'connecting-the-boxes',
  title: 'One map of the neck',
  teaches: 'Move between the boxes on purpose: slide up one string into the next box, play a phrase there, slide again.',
  minutes: 5,
  skill: 'teacher:dev:connecting-the-boxes',
  steps: [
    {
      type: 'card',
      title: 'Training wheels off',
      body: 'Boxes are training wheels. The goal is one map of the neck, where you go wherever the music wants. The trick is to move between boxes on purpose: slide up one string into the next box, play a phrase there, then slide again.',
      figure: { kind: 'fretboard', frets: [5, 17], root: 'A', labels: 'degree', derive: { scale: 'minor-pentatonic', tonic: 'A' }, caption: 'Boxes 1 to 5 from fret 5 to 17: one scale, one map.' },
    },
    {
      type: 'card',
      title: 'The climb',
      body: 'Pentatonic Across the Neck climbs from box 5 through boxes 1, 2, 3 and 4 in bars 1 to 8, then comes back down. Every move is a slide: going up, the ring finger slides into the next box; coming down, the index finger slides back.',
      figure: { kind: 'tab', tempo: 60, notes: CONNECT_BARS_1_2, caption: 'Bars 1 and 2: box 5, then a slide on string 3 from fret 5 to 7 into box 1.' },
    },
    {
      type: 'order',
      prompt: 'Put the boxes in the order the study climbs them.',
      tiles: ['Box 5', 'Box 1', 'Box 2', 'Box 3', 'Box 4'],
      explain: 'It starts low in box 5 (frets 2 to 5), then 1, 2, 3, and reaches box 4 (frets 12 to 15) at the top in bar 8.',
      fact: 'pent-box-order',
    },
    {
      type: 'choice',
      prompt: 'In the study, how does the melody get from box 1 into box 2?',
      options: [
        { text: 'A slide on string 3, fret 7 to fret 9', correct: true },
        { text: 'A jump down to string 6', why: 'A jump breaks the line. The study slides, so you hear the move.' },
        { text: 'An open string while the hand moves', why: 'No open strings up here: the slide itself carries the hand.' },
      ],
      explain: 'The ring finger slides from {n:D} (fret 7) to {n:E} (fret 9) on string 3 and lands where box 2 puts it.',
      fact: 'pent-map-slides',
    },
    {
      type: 'fretboard-name',
      prompt: 'Into box 3 the climb slides up string 1 from fret 10 to fret 12. Which note does it land on?',
      position: { string: 1, fret: 12 },
      ask: 'note',
      spelling: 'any',
      options: ['E', 'D', 'G', 'A'],
      explain: 'String 1, fret 12 is {n:E}, an octave above the open string 1. Fret 10 was {n:D}: the slide moves from box 2\'s top note into box 3.',
    },
    playerTask({
      id: 'climb-wait',
      title: 'The climb in wait mode',
      song: 'st-pent-connect',
      bars: [1, 8],
      mode: 'wait',
      minutes: 4,
      body: 'Bars 1 to 8, the climb, in wait mode: the music waits for each right note. Say the box number out loud as you slide into it: 5, 1, 2, 3, 4.',
    }),
    playerTask({
      id: 'climb-in-time',
      title: 'The climb in time',
      song: 'st-pent-connect',
      bars: [1, 8],
      tempo: 68,
      minutes: 3,
      body: 'Now bars 1 to 8 in time, at 68 % (60 BPM). Let the slides take their time: they are notes, not gaps.',
    }),
    {
      type: 'true-false',
      statement: 'Coming back down, the study slides with the index finger.',
      answer: true,
      explain: 'Going up, the ring finger slides and lands in the next box; coming down, the index finger slides back, so the hand always lands ready to play.',
      fact: 'pent-map-slides',
    },
    playerTask({
      id: 'whole-study',
      title: 'Pentatonic Across the Neck',
      song: 'st-pent-connect',
      tempo: 91,
      minutes: 5,
      body: 'All of it at 91 % (80 BPM): the 16 bars over {c:Am7}, then bars 17 to 32, the same notes over a {c:C} groove. Listen to the mood change: over {c:C} the very same notes sound like C major pentatonic.',
    }),
    {
      type: 'choice',
      prompt: 'Over the {c:C} groove, the very same notes sound like which scale?',
      options: [
        { text: '{n:C} major pentatonic', correct: true },
        { text: '{n:A} minor pentatonic', why: 'That is their name over {c:Am7}, where {n:A} is home. Over {c:C}, {n:C} is home.' },
        { text: '{n:C} major (all seven notes)', why: 'The study never plays {n:F} or {n:B}, so it is still pentatonic.' },
      ],
      explain: '{n:A} {n:C} {n:D} {n:E} {n:G} are also {n:C} {n:D} {n:E} {n:G} {n:A}: C major pentatonic. The home note decides the name.',
      fact: 'pent-relative-major',
    },
    toolTask({
      id: 'whole-neck-sprint',
      title: 'Fretboard Sprint: the whole neck',
      tool: 'arcade',
      params: ['fretboard-sprint', 'a-minor-pentatonic'],
      minutes: 3,
      body: 'Fretboard Sprint in A minor pentatonic: a note of the scale is named, and you tap every place it sits from the nut to fret 12. Start with the roots, then work through the levels.',
    }),
    { generate: 'neck-tones', params: { what: 'scale', scales: ['minor-pentatonic'], tonics: ['A'] } },
  ],
  facts: [
    { id: 'pent-map-slides', front: 'How do you move between pentatonic boxes on purpose?', back: 'Slide along one string into the next box, play a phrase there, then slide again.' },
    { id: 'pent-relative-major', front: 'A minor pentatonic over a {c:C} chord: what does it become?', back: 'C major pentatonic: the same five notes with {n:C} as home.' },
    { id: 'pent-box-order', front: 'Up the neck, in which order do the A minor pentatonic boxes come?', back: 'Box 4 (open), 5 (frets 2 to 5), 1 (5 to 8), 2 (7 to 10), 3 (9 to 13), 4 (12 to 15), then 5 again (14 to 17).' },
  ],
};

// ── 5. Major pentatonic in the same shapes ─────────────────────────────────────────────────────

const majorPentatonic: TeacherLesson = {
  id: 'major-pentatonic',
  title: 'Major pentatonic in the same shapes',
  teaches: 'Every box is also a major-pentatonic box; for A major pentatonic, slide the box 1 shape down to fret 2.',
  minutes: 5,
  skill: 'teacher:dev:major-pentatonic',
  steps: [
    {
      type: 'card',
      title: 'Same notes, new home',
      body: 'A minor pentatonic and C major pentatonic are exactly the same five notes. So every box you know is also a major-pentatonic box: only the home note changes, from {n:A} to {n:C}.',
      figure: { kind: 'audio', sound: { kind: 'scale', tonic: 'C3', scale: 'major-pentatonic', direction: 'up-down', tempo: 100 }, label: 'Hear C major pentatonic' },
    },
    {
      type: 'choice',
      prompt: 'Which major pentatonic has exactly the notes of A minor pentatonic?',
      options: [
        { text: '{n:C} major pentatonic', correct: true },
        { text: '{n:A} major pentatonic', why: 'A major pentatonic has {n:C#} and {n:F#}, not {n:C} and {n:G}.' },
        { text: '{n:G} major pentatonic', why: 'G major pentatonic has {n:B}, not {n:C}.' },
      ],
      explain: '{n:C} {n:D} {n:E} {n:G} {n:A} is C major pentatonic: the same notes as {n:A} {n:C} {n:D} {n:E} {n:G}, starting on {n:C}.',
      fact: 'pent-same-notes',
    },
    {
      type: 'card',
      title: 'The three-fret trick',
      body: 'For A major pentatonic ({n:A} {n:B} {n:C#} {n:E} {n:F#}), take the box 1 shape and slide it down three frets, to fret 2. Those are the notes of {n:F#} minor pentatonic, the {t:relative-minor} of {n:A} major.',
      figure: { kind: 'fretboard', frets: [2, 5], root: 'A', labels: 'degree', dots: dots(A_MAJOR_AT_2), caption: 'The box 1 shape at fret 2, numbered from A: A major pentatonic.' },
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap the three {n:A} roots in this shape, between fret 2 and fret 5.',
      find: { note: 'A' },
      mode: 'all',
      octave: 'any',
      frets: [2, 5],
      explain: 'String 6, fret 5; string 3, fret 2; string 1, fret 5. In {n:F#} minor they are the {d:b3}; in A major pentatonic they are home.',
      fact: 'major-pent-three-frets',
    },
    {
      type: 'play-phrase',
      prompt: 'Play the shape from {n:A} to {n:A}: string 6, fret 5 up to string 3, fret 2.',
      notes: A_MAJOR_A_TO_A,
      octave: 'exact',
      tempo: 70,
      explain: '{n:A} {n:B} {n:C#} {n:E} {n:F#} {n:A}: A major pentatonic, one octave, root to root.',
      alternative: {
        type: 'order',
        prompt: 'Put A major pentatonic in order, from {n:A} up to {n:A}.',
        tiles: ['{n:A}', '{n:B}', '{n:C#}', '{n:E}', '{n:F#}', '{n:A}'],
        distractors: ['{n:C}', '{n:G}'],
        explain: 'A major pentatonic is {n:A} {n:B} {n:C#} {n:E} {n:F#}. {n:C} and {n:G} belong to A minor pentatonic.',
      },
    },
    {
      type: 'play-phrase',
      prompt: 'Now the whole shape up: string 6, fret 2 to string 1, fret 5.',
      notes: run(A_MAJOR_AT_2, 'up'),
      octave: 'exact',
      tempo: 70,
      explain: 'Twelve notes, the box 1 fingering you know at fret 2. Only the name changed: it starts on {n:F#}, but {n:A} is home.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap every note of A major pentatonic from fret 2 to fret 5.',
        find: { scale: 'major-pentatonic', tonic: 'A' },
        mode: 'all',
        octave: 'any',
        frets: [2, 5],
        explain: 'Exactly the box 1 shape at fret 2: two notes on every string.',
      },
    },
    toolTask({
      id: 'major-pent-jam',
      title: 'Jam: A major pentatonic',
      tool: 'progressions',
      params: ['pop-i-v', 'a', 'jam'],
      minutes: 3,
      body: 'Set the band to 96 BPM: {c:A} and {c:E}. Improvise with the shape at fret 2 and end every phrase on an {n:A}. Let it sound sweet and open: fewer notes, let them ring.',
    }),
    {
      generate: 'scale-ear',
      params: { scales: ['major-pentatonic', 'minor-pentatonic'] },
    },
    {
      type: 'card',
      title: 'Mo Li Hua',
      body: 'Major pentatonic sounds sweet and open: country, folk and many melodies. Mo Li Hua (Jasmine Flower), an 18th-century Chinese folk song, uses only G major pentatonic: {n:G} {n:A} {n:B} {n:D} {n:E}.',
      figure: { kind: 'fretboard', frets: [0, 3], root: 'G', labels: 'degree', dots: dots(G_MAJOR_OPEN), caption: 'G major pentatonic in open position: the box 1 shape at the nut.' },
    },
    playerTask({
      id: 'mo-li-hua',
      title: 'Mo Li Hua (Jasmine Flower)',
      song: 'mo-li-hua',
      tempo: 85,
      minutes: 5,
      body: 'Play it at 85 % (about 56 BPM), then 100 % (66 BPM): the first half of the verse, twice. The first time plain; the second time slide lightly into each long note from two frets below, as the tab shows. Every note is {n:G}, {n:A}, {n:B}, {n:D} or {n:E}.',
      tip: 'A slide into a note is an ornament: quick and light, so the long note itself still lands on the beat.',
      fallback: {
        tool: 'player',
        params: ['amazing-grace', 't83'],
        title: 'Amazing Grace: a G major pentatonic tune',
        body: 'Mo Li Hua is not in the Songs library yet. The tune of Amazing Grace uses the same five notes, {n:G} {n:A} {n:B} {n:D} {n:E}: in the Player\'s options, under Parts, pick Tune, and play it at 83 % (about 70 BPM), sliding lightly into the long notes.',
      },
    }),
    {
      type: 'fill-blanks',
      prompt: 'Complete G major pentatonic, the five notes of Mo Li Hua.',
      text: '{n:G}  {n:A}  {n:B}  ___  {n:E}',
      blanks: ['{n:D}'],
      bank: ['{n:C}', '{n:F#}'],
      explain: 'G major pentatonic is {n:G} {n:A} {n:B} {n:D} {n:E}: the G major scale without {n:C} and {n:F#}, the two notes that make half steps.',
    },
    playerTask({
      id: 'morning-mood',
      title: 'Morning Mood (Peer Gynt)',
      song: 'morning-mood',
      minutes: 4,
      body: 'The opening flute melody of Grieg\'s Morning Mood uses only E major pentatonic, {n:E} {n:F#} {n:G#} {n:B} {n:C#}. Play it soft and smooth at 56 BPM, a little louder each time the phrase comes back.',
      fallback: {
        tool: 'player',
        params: ['st-pent-connect', 'm17-32', 't91'],
        title: 'Major pentatonic across the neck',
        body: 'Morning Mood is not in the Songs library yet; if you have a printed copy, bring it in with Scan and Import and practise it in the Player. Meanwhile, play bars 17 to 32 of Pentatonic Across the Neck at 91 % (80 BPM): the same notes over {c:C}, sweet and open.',
      },
    }),
    {
      type: 'true-false',
      statement: 'For A major pentatonic, you can play the box 1 shape three frets lower, at fret 2.',
      answer: true,
      explain: 'The shape at fret 2 is {n:F#} minor pentatonic, and {n:F#} minor is the relative minor of {n:A} major: the same five notes, {n:A} {n:B} {n:C#} {n:E} {n:F#}.',
      fact: 'major-pent-three-frets',
    },
  ],
  facts: [
    { id: 'pent-same-notes', front: 'Which major pentatonic has the same notes as A minor pentatonic?', back: 'C major pentatonic: {n:A} {n:C} {n:D} {n:E} {n:G}, with {n:C} as home.' },
    { id: 'major-pent-three-frets', front: 'How do you find A major pentatonic with the box 1 shape?', back: 'Move the shape down three frets, to fret 2: that is {n:F#} minor pentatonic, the relative minor, with the same notes as A major pentatonic.' },
    { id: 'major-pent-sound', front: 'How does major pentatonic sound, and where do you hear it?', back: 'Sweet and open: country, folk and many melodies.' },
  ],
};

// ── 6. Same notes, two moods ───────────────────────────────────────────────────────────────────

/** All five boxes, frets 5 to 17, with the A roots and the C roots marked in two colours. */
const ROOTS_MAP: FretDot[] = UP_THE_NECK.flatMap((p) => p.notes)
  .filter((n, i, all) => all.findIndex((m) => m.string === n.string && m.fret === n.fret) === i)
  .map((n) => ({ string: n.string, fret: n.fret, note: n.note, role: n.note === 'A' ? ('root' as const) : n.note === 'C' ? ('target' as const) : ('tone' as const) }));

const pentatonicJam: TeacherLesson = {
  id: 'pentatonic-jam',
  title: 'Same notes, two moods',
  teaches: 'Over {c:Am} {c:G} {c:F} {c:G} the boxes sound minor, A is home; over {c:C} {c:G} {c:Am} {c:F} they sound major, C is home.',
  minutes: 4,
  skill: 'teacher:dev:pentatonic-jam',
  steps: [
    {
      type: 'card',
      title: 'Same notes, two moods',
      body: 'Over {c:Am} {c:G} {c:F} {c:G} the boxes sound minor and {n:A} is home. Over {c:C} {c:G} {c:Am} {c:F} the very same notes sound major and {n:C} is home. Tonight you solo over both.',
      figure: { kind: 'fretboard', frets: [5, 17], dots: ROOTS_MAP, caption: 'All five boxes: the A roots and the C roots in two colours.' },
    },
    {
      type: 'choice',
      prompt: 'You solo with these boxes over {c:C} {c:G} {c:Am} {c:F}. Which note is home?',
      options: [
        { text: '{n:C}', correct: true },
        { text: '{n:A}', why: '{n:A} is home over {c:Am} {c:G} {c:F} {c:G}. This progression starts and settles on {c:C}.' },
        { text: '{n:G}', why: '{c:G} is a chord on the way, not home.' },
      ],
      explain: 'The progression decides home. Over a {c:C} progression the notes are C major pentatonic, so a solo ends best on {n:C}.',
      fact: 'two-moods-home',
    },
    {
      type: 'listen-choice',
      prompt: 'Listen to this progression. Does it sound minor or major?',
      sound: { kind: 'progression', chords: ['Am', 'G', 'F', 'G', 'Am'], beats: 2, tempo: 96 },
      options: [{ text: 'Minor', correct: true }, { text: 'Major' }],
      shuffle: false,
      explain: 'That was {c:Am} {c:G} {c:F} {c:G}: it starts and ends on {c:Am}, so it sounds minor and {n:A} is home.',
    },
    {
      type: 'card',
      title: 'Move, then land',
      body: 'Do not park in one box. Start low, slide up through at least three boxes during the solo, and end on the home note: {n:A} over the minor progression, {n:C} over the major one.',
      tip: 'Record a take and listen back. You will hear at once where the solo got stuck in one box.',
    },
    {
      type: 'fretboard-find',
      prompt: 'Find home for the major progression: tap every {n:C} from fret 5 to fret 17.',
      find: { note: 'C' },
      mode: 'all',
      octave: 'any',
      frets: [5, 17],
      explain: 'Seven of them: string 6, fret 8; string 5, fret 15; string 4, fret 10; string 3, frets 5 and 17; string 2, fret 13; string 1, fret 8. One in every box.',
    },
    toolTask({
      id: 'minor-jam',
      title: 'Jam: the minor mood',
      tool: 'progressions',
      params: ['minor-i-bvii-bvi-bvii', 'a', 'jam'],
      minutes: 5,
      body: 'Set the band to 96 BPM: {c:Am} {c:G} {c:F} {c:G}. Solo for two minutes in at least three boxes and end on an {n:A}. If you can, record the take on your phone.',
    }),
    {
      type: 'true-false',
      statement: 'Over {c:Am} {c:G} {c:F} {c:G}, ending a solo on {n:C} sounds as final as ending on {n:A}.',
      answer: false,
      explain: '{n:C} is in {c:Am}, so it sounds fine in the middle of a solo, but home is {n:A}. End there and the solo sounds finished.',
      fact: 'two-moods-home',
    },
    toolTask({
      id: 'major-jam',
      title: 'Jam: the major mood',
      tool: 'progressions',
      params: ['pop-axis', 'c', 'jam'],
      minutes: 5,
      body: 'Now {c:C} {c:G} {c:Am} {c:F} at 92 BPM. Same notes, same boxes, but end on a {n:C}. Record this take too, then listen to both: where did each solo get stuck in one box?',
    }),
    {
      type: 'choice',
      prompt: 'You listen back and the whole solo stayed in box 1. What do you try on the next take?',
      options: [
        { text: 'Slide up into box 2 and keep climbing', correct: true },
        { text: 'Play box 1 faster', why: 'Faster in one box is still one box. Move up the neck.' },
        { text: 'Stop on the shared notes', why: 'The shared notes are doors. Go through them.' },
      ],
      explain: 'Use a slide as the door: a phrase in box 1, a slide on string 3 into box 2, a phrase there, and on up. Then land on home.',
      fact: 'solo-move-boxes',
    },
  ],
  facts: [
    { id: 'two-moods-home', front: 'With A minor pentatonic, where is home over {c:Am} {c:G} {c:F} {c:G}, and over {c:C} {c:G} {c:Am} {c:F}?', back: '{n:A} over the first, {n:C} over the second: the same notes, two moods.' },
    { id: 'solo-move-boxes', front: 'How do you keep a solo from getting stuck in one box?', back: 'Slide into the next box, play a phrase there, keep moving, and end on the home note.' },
  ],
};

/** Unit 4 of Dev's course. */
const unit: TeacherUnit = {
  id: 'dev-pentatonic',
  title: 'The pentatonic, all five boxes',
  theme: 'scales',
  description: 'Learn the other four A minor pentatonic boxes through music, join them into one map, and play the same shapes as major pentatonic.',
  lessons: [box2, box3, boxes4And5, connectingTheBoxes, majorPentatonic, pentatonicJam],
  checkpoint: { sample: 8, maxMistakes: 2 },
  glossary: [
    { id: 'pent-box', term: 'box', definition: 'One of the five shapes the pentatonic scale makes on the neck, two notes on each string, overlapping its neighbours like tiles.' },
    { id: 'slide', term: 'slide', definition: 'Moving a fretted finger along the string to another fret without lifting it, so you hear the pitch glide.' },
    { id: 'pull-off', term: 'pull-off', definition: 'Sounding a lower note on the same string without picking: the fretting finger flicks off the string, plucking it, so a lower fret or the open string sounds.' },
    { id: 'vibrato', term: 'vibrato', definition: 'A steady, even wobble in the pitch of a held note, made by small repeated bends and releases: it makes the note sing.' },
    { id: 'chord-tone', term: 'chord tone', definition: 'A note that belongs to the chord being played. A phrase that ends on one sounds settled.' },
  ],
};

export default unit;
