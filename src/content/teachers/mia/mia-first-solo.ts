/**
 * Mia, unit 11: Your first scale and your first solo (plan: `mia/mia-first-solo` in
 * src/content/plan/teachers.json).
 *
 * A minor pentatonic box 1 at fret 5, phrases that ask and answer and land on the notes of Am7, a
 * first improvisation over a one-chord groove, box 1 over the 12-bar blues in A, E minor pentatonic
 * in open position (and again at fret 12), and the unit's performance: rhythm, then a solo, ending on
 * A in bar 11. Every lesson follows its plan entry: the plan's `explain` in Mia's voice on the cards,
 * its `show` as figures, its `practice` as exercises (`Mic` always with a tapping alternative) or
 * tasks that send the learner to the Player, Scales, the Scale Arcade, Technique or a jam track and
 * back.
 *
 * Music from the song library: Pentatonic Box 1 Lick (`st-pent-box-1`, 84 BPM: four 2-bar phrases,
 * ask, answer, ask, answer; the hammer-on in bar 6). Jam tracks: `funk-one-chord-minor` in A (Am7),
 * `blues-12-bar` in A and `minor-i-bvi-bvii` in E. Mia's example phrases and the performance are
 * original. `mia-first-solo.test.ts` derives every box from the guitar engine and checks the
 * fingers, roots and chord tones, the library's lick, and the BPM of every Player task.
 */
import type { TeacherLesson, TeacherUnit } from '../types';
import { playerTask, techniqueTask, toolTask } from '../tasks';

/** A minor pentatonic box 1 at fret 5, upward, with the fingers the plan gives (1 on fret 5, 3 on 7, 4 on 8). */
const BOX_1 = [
  { string: 6, fret: 5, note: 'A2', finger: 1 },
  { string: 6, fret: 8, note: 'C3', finger: 4 },
  { string: 5, fret: 5, note: 'D3', finger: 1 },
  { string: 5, fret: 7, note: 'E3', finger: 3 },
  { string: 4, fret: 5, note: 'G3', finger: 1 },
  { string: 4, fret: 7, note: 'A3', finger: 3 },
  { string: 3, fret: 5, note: 'C4', finger: 1 },
  { string: 3, fret: 7, note: 'D4', finger: 3 },
  { string: 2, fret: 5, note: 'E4', finger: 1 },
  { string: 2, fret: 8, note: 'G4', finger: 4 },
  { string: 1, fret: 5, note: 'A4', finger: 1 },
  { string: 1, fret: 8, note: 'C5', finger: 4 },
] as const;

/** E minor pentatonic in open position, upward: each open string and one fretted note. */
const OPEN_E_BOX = [
  { string: 6, fret: 0, note: 'E2' },
  { string: 6, fret: 3, note: 'G2' },
  { string: 5, fret: 0, note: 'A2' },
  { string: 5, fret: 2, note: 'B2' },
  { string: 4, fret: 0, note: 'D3' },
  { string: 4, fret: 2, note: 'E3' },
  { string: 3, fret: 0, note: 'G3' },
  { string: 3, fret: 2, note: 'A3' },
  { string: 2, fret: 0, note: 'B3' },
  { string: 2, fret: 3, note: 'D4' },
  { string: 1, fret: 0, note: 'E4' },
  { string: 1, fret: 3, note: 'G4' },
] as const;

const asTab = (dots: ReadonlyArray<{ string: number; fret: number }>, duration: 'q' | 'e' = 'q') => dots.map((d) => ({ string: d.string, fret: d.fret, duration }));

// ── 1. A minor pentatonic, box 1 ────────────────────────────────────────────────────────────────

const aMinorPentatonic: TeacherLesson = {
  id: 'a-minor-pentatonic',
  title: 'A minor pentatonic, box 1',
  teaches: 'A minor pentatonic is A C D E G; box 1 at fret 5 has two notes on every string and its root on string 6.',
  minutes: 5,
  skill: 'teacher:mia:a-minor-pentatonic',
  steps: [
    {
      type: 'card',
      title: 'Five notes that sound good together',
      body: 'A {t:scale} is a set of notes that sound good together, and {n:A} minor {t:pentatonic|pentatonic} has five: {n:A} {n:C} {n:D} {n:E} {n:G}. ("Penta" means five.) On the neck they make a box at fret 5, with two notes on every string.',
      figure: { kind: 'audio', sound: { kind: 'scale', tonic: 'A2', scale: 'minor-pentatonic', direction: 'up-down', tempo: 100 }, label: 'Hear {n:A} minor pentatonic' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the five notes of {n:A} minor pentatonic.',
      text: '{n:A}  ___  {n:D}  {n:E}  ___',
      blanks: ['{n:C}', '{n:G}'],
      bank: ['{n:B}', '{n:F}'],
      explain: '{n:A} {n:C} {n:D} {n:E} {n:G}: five notes. {n:B} and {n:F} belong to the full {n:A} minor scale, but the pentatonic leaves them out.',
      fact: 'a-minor-pentatonic-notes',
    },
    {
      type: 'card',
      title: 'Box 1 at fret 5',
      body: 'Here is the box: frets 5 to 8, two notes on every string. The lowest note, string 6, fret 5 ({n:A}), is the {t:root}, the home note. There are two more {n:A}s inside the box. Can you find them?',
      figure: {
        kind: 'fretboard',
        frets: [5, 8],
        dots: BOX_1.map((d) => ({ string: d.string, fret: d.fret, note: d.note, ...(d.note.startsWith('A') ? { role: 'root' as const } : {}) })),
        caption: 'Box 1 of {n:A} minor pentatonic. The three roots, {n:A}, are marked.',
      },
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap the three roots: every {n:A} in the box, frets 5 to 8.',
      find: { note: 'A' },
      mode: 'all',
      octave: 'any',
      frets: [5, 8],
      explain: 'String 6 fret 5, string 4 fret 7 and string 1 fret 5: three {n:A}s, each an octave apart.',
      fact: 'box-1-roots',
    },
    {
      type: 'card',
      title: 'One finger per fret',
      body: 'Finger 1 always plays fret 5. Finger 3 plays fret 7 on strings 5, 4 and 3; finger 4 plays fret 8 on strings 6, 2 and 1. Your hand never moves. Pick down-up, one stroke per note.',
      figure: { kind: 'fretboard', frets: [5, 8], labels: 'finger', dots: BOX_1.map((d) => ({ ...d })), caption: 'The fingers of box 1: 1 on fret 5, 3 on fret 7, 4 on fret 8.' },
    },
    {
      type: 'play-phrase',
      prompt: 'Up the box, one note per click: string 6 frets 5 and 8, string 5 frets 5 and 7, and so on to string 1, fret 8.',
      notes: asTab(BOX_1),
      octave: 'exact',
      tempo: 60,
      explain: '{n:A} {n:C}, {n:D} {n:E}, {n:G} {n:A}, {n:C} {n:D}, {n:E} {n:G}, {n:A} {n:C}: the five notes over and over, two per string.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap all 12 notes of box 1, frets 5 to 8.',
        find: { scale: 'minor-pentatonic', tonic: 'A' },
        mode: 'all',
        octave: 'any',
        frets: [5, 8],
        explain: 'Two notes on every string: frets 5 and 8 on strings 6, 2 and 1, frets 5 and 7 on strings 5, 4 and 3.',
      },
    },
    {
      type: 'play-phrase',
      prompt: 'And back down: string 1 frets 8 and 5, string 2 frets 8 and 5, and so on to string 6, fret 5.',
      notes: asTab([...BOX_1].reverse()),
      octave: 'exact',
      tempo: 60,
      explain: 'Coming down, each string starts on its higher fret: 8 or 7, then 5. You finish on the root, string 6, fret 5.',
      alternative: {
        type: 'order',
        prompt: 'Coming down the box: put each string\'s two notes in order, string 1 first.',
        tiles: ['{n:C} {n:A}', '{n:G} {n:E}', '{n:D} {n:C}', '{n:A} {n:G}', '{n:E} {n:D}', '{n:C} {n:A}'],
        explain: 'String 1: {n:C} {n:A}. String 2: {n:G} {n:E}. String 3: {n:D} {n:C}. String 4: {n:A} {n:G}. String 5: {n:E} {n:D}. String 6: {n:C} {n:A}.',
      },
    },
    toolTask({
      id: 'scales-box-1',
      title: 'Box 1 in Scales',
      tool: 'scales',
      params: ['a', 'minor-pentatonic', 'box-1'],
      minutes: 3,
      body: 'Here is box 1 with the note names shown. Find the three {n:A} roots, then play the box up and down along with the app at a speed that feels easy. Say the note names as you go.',
    }),
    toolTask({
      id: 'note-hunt',
      title: 'Note Hunt in box 1',
      tool: 'arcade',
      params: ['note-hunt', 'a-minor-pentatonic', 'box-1'],
      minutes: 2,
      body: 'Two minutes of Note Hunt: notes of box 1 light up and you play them on your guitar, or tap them. Quick, clean finds build your score.',
    }),
    {
      type: 'true-false',
      statement: 'The lowest note of box 1, string 6 fret 5, is the root: {n:A}.',
      answer: true,
      explain: 'String 6, fret 5 is {n:A}, the home note of {n:A} minor pentatonic. The other two roots are string 4 fret 7 and string 1 fret 5.',
      fact: 'box-1-roots',
    },
  ],
  facts: [
    { id: 'a-minor-pentatonic-notes', front: 'The five notes of {n:A} minor pentatonic?', back: '{n:A} {n:C} {n:D} {n:E} {n:G}.' },
    { id: 'box-1-fingers', front: 'Box 1 at fret 5: which finger plays which fret?', back: 'Finger 1 on fret 5; finger 3 on fret 7 (strings 5, 4, 3); finger 4 on fret 8 (strings 6, 2, 1).' },
    { id: 'box-1-roots', front: 'Where are the three roots in box 1?', back: 'String 6 fret 5, string 4 fret 7 and string 1 fret 5: each an {n:A}.' },
  ],
};

// ── 2. Phrases that ask and answer ──────────────────────────────────────────────────────────────

/** Bars 1 to 4 of Pentatonic Box 1 Lick: phrase 1 asks, phrase 2 answers (the library's notes). */
const LICK_ASK_ANSWER = [
  { string: 4, fret: 7, duration: 'q' },
  { string: 3, fret: 5, duration: 'e' },
  { string: 3, fret: 7, duration: 'e' },
  { string: 2, fret: 5, duration: 'q' },
  { string: 3, fret: 7, duration: 'e' },
  { string: 2, fret: 5, duration: 'e' },
  { string: 2, fret: 8, duration: 'e' },
  { string: 2, fret: 5, duration: 'e' },
  { string: 2, fret: 8, duration: 'e' },
  { string: 1, fret: 5, duration: 'e' },
  { string: 2, fret: 8, duration: 'q' },
  { rest: true, duration: 'q' },
  { string: 1, fret: 5, duration: 'e' },
  { string: 2, fret: 8, duration: 'e' },
  { string: 2, fret: 5, duration: 'q' },
  { string: 2, fret: 8, duration: 'e' },
  { string: 2, fret: 5, duration: 'e' },
  { string: 3, fret: 7, duration: 'q' },
  { string: 3, fret: 5, duration: 'q' },
  { string: 4, fret: 7, duration: 'e' },
  { string: 4, fret: 5, duration: 'e' },
  { string: 4, fret: 7, duration: 'q' },
  { rest: true, duration: 'q' },
] as const;
/** The answer alone: bars 3 and 4 of the lick. */
const LICK_ANSWER = LICK_ASK_ANSWER.slice(12);

const box1Licks: TeacherLesson = {
  id: 'box-1-licks',
  title: 'Phrases that ask and answer',
  teaches: 'A phrase sounds finished on a note of the chord underneath, A, C, E or G, and most finished on A, home.',
  minutes: 5,
  skill: 'teacher:mia:box-1-licks',
  steps: [
    {
      type: 'card',
      title: 'Sentences made of notes',
      body: 'A scale becomes music when you play {t:phrase|phrases}: short ideas with a beginning and an end, like sentences. In {t:call-and-response|call and response}, one phrase asks and the next answers. An answer sounds finished on {n:A}, {n:C}, {n:E} or {n:G}, the notes of the {c:Am7} chord underneath, and most finished of all on {n:A}, home.',
      figure: {
        kind: 'fretboard',
        frets: [5, 8],
        dots: BOX_1.map((d) => ({ string: d.string, fret: d.fret, note: d.note, ...(d.note.startsWith('D') ? { role: 'ghost' as const } : { role: 'tone' as const }) })),
        caption: 'The notes of {c:Am7} in box 1: {n:A}, {n:C}, {n:E}, {n:G}. Faint: {n:D}.',
      },
    },
    {
      type: 'choice',
      prompt: 'Which note of the box is not a note of {c:Am7}?',
      options: [{ text: '{n:D}', correct: true }, { text: '{n:G}', why: '{n:G} is the 7 of {c:Am7}.' }, { text: '{n:C}', why: '{n:C} is in {c:Am7}: {n:A} {n:C} {n:E} {n:G}.' }, { text: '{n:E}' }],
      explain: '{c:Am7} is {n:A}, {n:C}, {n:E} and {n:G}. The fifth note of the box, {n:D}, is not in the chord, so a phrase that stops on it sounds open.',
      fact: 'am7-chord-tones',
    },
    {
      type: 'card',
      title: 'An ask and an answer',
      body: 'The first four bars of the Pentatonic Box 1 Lick. Phrase 1 asks: it stops on {n:G}, string 2, fret 8. {n:G} is a chord note, so it sounds good, but it is not home: the door stays open. Phrase 2 answers and comes home to {n:A}, string 4, fret 7.',
      figure: { kind: 'tab', tempo: 84, notes: [...LICK_ASK_ANSWER], caption: 'Bars 1 to 4: the ask stops on {n:G}, the answer lands on {n:A}.' },
    },
    {
      type: 'listen-choice',
      prompt: 'Does this phrase sound finished, or open?',
      sound: { kind: 'tab', tempo: 84, notes: [{ string: 3, fret: 5, duration: 'e' }, { string: 3, fret: 7, duration: 'e' }, { string: 2, fret: 5, duration: 'q' }, { string: 3, fret: 7, duration: 'q' }, { string: 3, fret: 5, duration: 'q' }, { string: 4, fret: 7, duration: 'h' }] },
      options: [{ text: 'Finished: it comes home', correct: true }, { text: 'Open: it is still asking' }],
      shuffle: false,
      explain: 'It ends on {n:A}, string 4 fret 7: the home note, and a note of {c:Am7}. That sounds finished.',
    },
    {
      type: 'listen-choice',
      prompt: 'And this one: finished, or open?',
      sound: { kind: 'tab', tempo: 84, notes: [{ string: 2, fret: 5, duration: 'e' }, { string: 2, fret: 8, duration: 'e' }, { string: 2, fret: 5, duration: 'q' }, { string: 3, fret: 5, duration: 'q' }, { string: 2, fret: 5, duration: 'q' }, { string: 3, fret: 7, duration: 'h' }] },
      options: [{ text: 'Finished: it comes home' }, { text: 'Open: it is still asking', correct: true }],
      shuffle: false,
      explain: 'It ends on {n:D}, string 3 fret 7, which is not in {c:Am7}. It hangs in the air, waiting for an answer.',
    },
    {
      type: 'play-phrase',
      prompt: 'Play the answer, bars 3 and 4: string 1 fret 5, string 2 frets 8, 5, 8, 5, string 3 frets 7 and 5, then string 4 frets 7, 5, 7.',
      notes: [...LICK_ANSWER],
      octave: 'exact',
      tempo: 70,
      explain: 'It walks down the box and lands on {n:A}, string 4, fret 7: home, and a note of {c:Am7}.',
      alternative: {
        type: 'choice',
        prompt: 'The answer ends on string 4, fret 7. Which note is that?',
        options: [{ text: '{n:A}, the home note', correct: true }, { text: '{n:G}', why: '{n:G} is at string 4, fret 5.' }, { text: '{n:D}', why: '{n:D} is at string 3, fret 7.' }],
        explain: 'String 4, fret 7 is {n:A}: an answer that comes home.',
      },
    },
    {
      type: 'card',
      title: 'A hammer-on inside the box',
      body: 'The lick has a {t:hammer-on} in bar 6, the kind you know: pick string 3, fret 5 ({n:C}), then bring finger 3 down hard on fret 7 ({n:D}) without picking again. The second note sounds from the hammer alone.',
      figure: { kind: 'tab', tempo: 70, notes: [{ string: 3, fret: 5, duration: 'q' }, { string: 3, fret: 7, duration: 'q' }, { string: 3, fret: 5, duration: 'q' }, { string: 3, fret: 7, duration: 'q' }], caption: 'Pick fret 5, hammer fret 7.' },
    },
    {
      type: 'true-false',
      statement: 'In a hammer-on, you pick only the first note.',
      answer: true,
      explain: 'Pick string 3, fret 5, then finger 3 hammers fret 7 down hard enough to make {n:D} sound without a second pick.',
    },
    playerTask({
      id: 'lick-wait',
      title: 'The lick in wait mode',
      song: 'st-pent-box-1',
      mode: 'wait',
      bars: [1, 4],
      minutes: 5,
      body: 'Phrases 1 and 2 in wait mode: the music waits for each right note. Hear the ask stop on {n:G} and the answer come home to {n:A}. Then loop bars 5 to 8, phrases 3 and 4, with the hammer-on in bar 6.',
    }),
    playerTask({
      id: 'lick-groove',
      title: 'The whole lick with the groove',
      song: 'st-pent-box-1',
      tempo: 83,
      minutes: 5,
      body: 'All eight bars at about 70 BPM with the teacher\'s {c:Am7} groove, looped. When it flows, go to 100 % (84 BPM). Ask, answer, ask, answer: let the gaps between phrases breathe.',
    }),
    {
      type: 'fretboard-find',
      prompt: 'Good landing notes: tap every note of {c:Am7} on strings 2 and 1 of the box.',
      find: { chord: 'Am7' },
      mode: 'all',
      octave: 'any',
      frets: [5, 8],
      strings: [2, 1],
      explain: 'String 2 fret 5 {n:E}, string 2 fret 8 {n:G}, string 1 fret 5 {n:A}, string 1 fret 8 {n:C}: all four are notes of {c:Am7}.',
      fact: 'am7-chord-tones',
    },
  ],
  facts: [
    { id: 'am7-chord-tones', front: 'Over {c:Am7}, which notes of the box sound most finished to end on?', back: '{n:A}, {n:C}, {n:E} and {n:G}: the notes of the chord, and {n:A}, home, most of all. {n:D} sounds open.' },
    { id: 'call-response', front: 'What is call and response?', back: 'One phrase asks a question and the next one answers it.' },
  ],
};

// ── 3. Your first improvisation ─────────────────────────────────────────────────────────────────

/** Mia's example: two bars on C, D and E (string 3 frets 5 and 7, string 2 fret 5). */
const MIA_PHRASE = [
  { string: 3, fret: 5, duration: 'e' },
  { string: 3, fret: 7, duration: 'e' },
  { string: 2, fret: 5, duration: 'q' },
  { string: 3, fret: 7, duration: 'e' },
  { string: 3, fret: 5, duration: 'e' },
  { string: 3, fret: 7, duration: 'q' },
  { string: 2, fret: 5, duration: 'h' },
  { rest: true, duration: 'h' },
] as const;

const firstImprovisation: TeacherLesson = {
  id: 'first-improvisation',
  title: 'Your first improvisation',
  teaches: 'Over this A minor groove no note of the box is wrong: start with three notes, leave rests, and end on A.',
  minutes: 5,
  skill: 'teacher:mia:first-improvisation',
  steps: [
    {
      type: 'card',
      title: 'Making it up, on the spot',
      body: 'To {t:improvise} is to make up phrases on the spot, and one fact makes it easy: over this groove, the band\'s repeating {n:A} minor backing, there are no wrong notes in this box. Start with three: string 3, fret 5 ({n:C}), string 3, fret 7 ({n:D}) and string 2, fret 5 ({n:E}).',
      figure: {
        kind: 'fretboard',
        frets: [5, 8],
        dots: BOX_1.map((d) => {
          const start = (d.string === 3 && (d.fret === 5 || d.fret === 7)) || (d.string === 2 && d.fret === 5);
          return { string: d.string, fret: d.fret, note: d.note, role: start ? ('target' as const) : ('ghost' as const) };
        }),
        caption: 'Your three starting notes: {n:C}, {n:D} and {n:E}.',
      },
    },
    {
      type: 'true-false',
      statement: 'Over the A minor groove, every note of box 1 fits.',
      answer: true,
      explain: 'All five notes of {n:A} minor pentatonic sit well over the groove. Some sound more finished than others, but none is wrong.',
      fact: 'no-wrong-notes',
    },
    {
      type: 'fretboard-name',
      prompt: 'One of your three notes is string 3, fret 7. Which note is it?',
      position: { string: 3, fret: 7 },
      ask: 'note',
      spelling: 'any',
      options: ['D', 'C', 'E', 'B'],
      explain: 'String 3, fret 7 is {n:D}, under finger 3. With {n:C} at fret 5 and {n:E} on string 2, fret 5, those are your first three notes.',
    },
    {
      type: 'card',
      title: 'Play, then rest',
      body: 'Play a short phrase, then leave a rest as long as the phrase. Rests are not empty: they let your phrase sink in and give you time to think of the next one. Here is one of mine with the three notes, two bars long. After it, I would leave two bars of silence.',
      figure: { kind: 'audio', sound: { kind: 'tab', tempo: 90, notes: [...MIA_PHRASE] }, label: 'Hear Mia\'s phrase' },
    },
    {
      type: 'play-phrase',
      prompt: 'Play Mia\'s phrase: string 3 frets 5 and 7, string 2 fret 5, string 3 frets 7, 5, 7, then string 2 fret 5, held.',
      notes: [...MIA_PHRASE],
      octave: 'exact',
      tempo: 80,
      explain: '{n:C} {n:D} {n:E}, {n:D} {n:C} {n:D}, and a long {n:E}: three notes are plenty to make a phrase.',
      alternative: {
        type: 'order',
        prompt: 'Put the notes of Mia\'s phrase in order.',
        tiles: ['{n:C}', '{n:D}', '{n:E}', '{n:D}', '{n:C}', '{n:D}', '{n:E}'],
        distractors: ['{n:G}'],
        explain: 'Up {n:C} {n:D} {n:E}, back {n:D} {n:C}, then {n:D} and a long {n:E}.',
      },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap the rhythm of the phrase, and stay silent through the rest at the end.',
      rhythm: { pattern: 'e e q e e q | h hr' },
      tempo: 80,
      show: 'both',
      explain: 'Short, short, long, short, short, long, then a held note and silence. A rhythm like this makes even three notes sound like music.',
    },
    toolTask({
      id: 'jam-three-notes',
      title: 'Jam: three notes and rests',
      tool: 'progressions',
      params: ['funk-one-chord-minor', 'a', 'jam'],
      minutes: 3,
      body: 'The band plays one A minor chord at 90 BPM. For 2 minutes: 4 bars of phrases with your three notes, then 4 bars of rest, and again. In the rests, just listen to the groove.',
      tip: 'Short phrases are better than long ones. Two or three notes is a phrase.',
    }),
    {
      type: 'card',
      title: 'Now all five notes',
      body: 'Now use the whole box. A trick for sounding musical: play a phrase, play it again, then change one note of it. Copying is how a phrase becomes something people remember. End your last phrase on an {n:A}.',
    },
    {
      type: 'choice',
      prompt: 'You have just played a phrase you like. What next?',
      options: [
        { text: 'Play it again, then change one note', correct: true },
        { text: 'Never play it again', why: 'Repeating a phrase is how listeners latch onto it. Copy it, then change a little.' },
        { text: 'Play every note of the box at once', why: 'More notes is not more music. Copy your phrase, then change one note.' },
      ],
      explain: 'Copy it, then change one note: the ear hears the link, and your solo starts to tell a story.',
      fact: 'copy-and-change',
    },
    toolTask({
      id: 'jam-five-notes',
      title: 'Jam: all five notes',
      tool: 'progressions',
      params: ['funk-one-chord-minor', 'a', 'jam'],
      minutes: 4,
      body: 'Same groove, now with the whole box: play a phrase, copy it, then change one note. Rests between phrases. If you can, record a minute on your phone, listen back, and keep your favourite phrase.',
    }),
    {
      type: 'fretboard-find',
      prompt: 'Tap an {n:A} to end your last phrase on.',
      find: { note: 'A' },
      mode: 'one',
      octave: 'any',
      frets: [5, 8],
      explain: 'Any {n:A} will do: string 6 fret 5, string 4 fret 7 or string 1 fret 5. Ending on the home note tells everyone you have finished.',
      fact: 'end-on-a',
    },
  ],
  facts: [
    { id: 'no-wrong-notes', front: 'Improvising over an A minor groove in box 1: which notes are wrong?', back: 'None. Every note of the box fits; some just sound more finished than others.' },
    { id: 'copy-and-change', front: 'A trick for musical improvising?', back: 'Play a phrase, play it again, then change one note. Leave rests between phrases.' },
    { id: 'end-on-a', front: 'Which note ends an A minor improvisation best?', back: '{n:A}, the home note.' },
  ],
};

// ── 4. Box 1 over the blues ─────────────────────────────────────────────────────────────────────

const pentatonicOverTheBlues: TeacherLesson = {
  id: 'pentatonic-over-the-blues',
  title: 'Box 1 over the blues',
  teaches: 'Over a 12-bar blues in A, play a box 1 phrase every two bars and land on A in bar 11.',
  minutes: 5,
  skill: 'teacher:mia:pentatonic-over-the-blues',
  steps: [
    {
      type: 'card',
      title: 'One of the great sounds',
      body: '{n:A} minor pentatonic over a blues in A is one of the great sounds in music: the minor notes of the box rub against the major chords in a way the ear loves. Follow the form you know from the shuffle: {c:A} for 4 bars, {c:D} for 2, {c:A} for 2, then {c:E}, {c:D}, {c:A}, {c:E}.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['A7', 'A7', 'A7', 'A7', 'D7', 'D7', 'A7', 'A7', 'E7', 'D7', 'A7', 'E7'], beats: 2, tempo: 120 }, label: 'Hear the 12 bars, quickly' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Fill in the 12-bar form in A.',
      text: 'Bars 1 to 4 {c:A}, bars 5 and 6 ___, bars 7 and 8 {c:A}, then ___ {c:D} {c:A} {c:E}.',
      blanks: ['{c:D}', '{c:E}'],
      bank: ['{c:G}', '{c:Bm}'],
      explain: 'Four bars of {c:A}, two of {c:D}, two of {c:A}, then {c:E}, {c:D}, {c:A}, and {c:E} to turn around.',
      fact: 'blues-form-solo',
    },
    {
      type: 'listen-choice',
      prompt: 'Two bars of {c:A}, then the band changes. Where did it go: {c:D}, as in bar 5, or {c:E}, as in bar 9?',
      sound: { kind: 'progression', chords: ['A', 'A', 'D', 'D'], beats: 4, tempo: 100 },
      options: [{ text: 'To {c:D}, as in bar 5', correct: true }, { text: 'To {c:E}, as in bar 9' }],
      shuffle: false,
      explain: 'That was {c:A} to {c:D}: the change in bar 5. In bar 9 the band goes to {c:E} first, and {c:D} comes one bar later.',
    },
    {
      type: 'listen-choice',
      prompt: 'And now: after {c:A}, which comes first, {c:E} (bar 9) or {c:D} (bar 5)?',
      sound: { kind: 'progression', chords: ['A', 'A', 'E', 'D'], beats: 4, tempo: 100 },
      options: [{ text: '{c:D}, as in bar 5' }, { text: '{c:E}, as in bar 9', correct: true }],
      shuffle: false,
      explain: '{c:E} first, then {c:D}: bars 9 and 10, the top of the last line, where the form heads home.',
    },
    {
      type: 'card',
      title: 'Aim for A in bar 11',
      body: 'Play a phrase every two bars and rest between them. Near the end, aim for {n:A} in bar 11, back on the {c:A} chord: string 4, fret 7, under finger 3. Landing there tells the band you know where you are.',
      figure: {
        kind: 'fretboard',
        frets: [5, 8],
        dots: BOX_1.map((d) => ({ string: d.string, fret: d.fret, note: d.note, ...(d.string === 4 && d.fret === 7 ? { role: 'target' as const } : {}) })),
        caption: 'Box 1, with the {n:A} to aim for in bar 11: string 4, fret 7.',
      },
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap the {n:A} you aim for in bar 11: string 4, fret 7.',
      find: { note: 'A3' },
      mode: 'one',
      octave: 'exact',
      frets: [5, 8],
      explain: 'String 4, fret 7 is {n:A}, in the middle of the box, under finger 3.',
      fact: 'blues-land-on-a',
    },
    {
      type: 'play-phrase',
      prompt: 'Play a landing phrase: string 2 fret 5, string 3 frets 7 and 5, string 4 fret 5, then string 4 fret 7, held.',
      notes: [
        { string: 2, fret: 5, duration: 'q' },
        { string: 3, fret: 7, duration: 'q' },
        { string: 3, fret: 5, duration: 'q' },
        { string: 4, fret: 5, duration: 'q' },
        { string: 4, fret: 7, duration: 'w' },
      ],
      octave: 'exact',
      tempo: 80,
      explain: '{n:E}, {n:D}, {n:C}, {n:G}, then the long {n:A}: down the box and home, right on bar 11.',
      alternative: {
        type: 'choice',
        prompt: 'Your phrase should land on {n:A} in bar 11. Which place in the box is that {n:A}?',
        options: [{ text: 'String 4, fret 7', correct: true }, { text: 'String 4, fret 5', why: 'String 4, fret 5 is {n:G}.' }, { text: 'String 3, fret 7', why: 'String 3, fret 7 is {n:D}.' }],
        explain: 'String 4, fret 7 is the {n:A} in the middle of the box, under finger 3.',
      },
    },
    toolTask({
      id: 'blues-two-choruses',
      title: 'Jam: shuffle, then phrases',
      tool: 'progressions',
      params: ['blues-12-bar', 'a', 'jam'],
      minutes: 4,
      body: 'A 12-bar blues in A at 80 BPM. The first time through, play the shuffle from your lessons. The second time, play box 1 phrases, one every two bars, with rests between.',
      tip: 'Lost in the form? Listen for the change to {c:D}: that is bar 5.',
    }),
    {
      type: 'true-false',
      statement: 'The minor notes of the box clash with a blues in A, so they must be avoided.',
      answer: false,
      explain: 'They rub against the major chords, and that rub is the blues sound. The ear loves it.',
    },
    toolTask({
      id: 'blues-three-choruses',
      title: 'Jam: three choruses of solo',
      tool: 'progressions',
      params: ['blues-12-bar', 'a', 'jam'],
      minutes: 5,
      body: 'Now solo for three times through the 12 bars. A phrase every two bars, rests between, and land on {n:A} in bar 11 every time: string 4, fret 7.',
    }),
    {
      type: 'choice',
      prompt: 'In which bar of the 12 do you aim for {n:A}?',
      options: [{ text: 'Bar 11', correct: true }, { text: 'Bar 12', why: 'Bar 12 is the {c:E} that turns back to the top. Land on {n:A} one bar before, in bar 11.' }, { text: 'Bar 9', why: 'Bar 9 is the {c:E} chord.' }, { text: 'Bar 5' }],
      shuffle: false,
      explain: 'Bar 11 is back on {c:A}, the home chord. Land on {n:A} there, and bar 12 leads the band to the top.',
      fact: 'blues-land-on-a',
    },
  ],
  facts: [
    { id: 'blues-form-solo', front: 'The chords of a 12-bar blues in A, in order?', back: '{c:A} for 4 bars, {c:D} for 2, {c:A} for 2, then {c:E}, {c:D}, {c:A}, {c:E}.' },
    { id: 'blues-land-on-a', front: 'Soloing over a blues in A: where do you land?', back: 'On {n:A} in bar 11, for example string 4, fret 7.' },
  ],
};

// ── 5. E minor pentatonic in open position ──────────────────────────────────────────────────────

const eMinorPentatonic: TeacherLesson = {
  id: 'e-minor-pentatonic',
  title: 'E minor pentatonic in open position',
  teaches: 'E minor pentatonic in open position is every open string plus one fretted note on each string.',
  minutes: 5,
  skill: 'teacher:mia:e-minor-pentatonic',
  steps: [
    {
      type: 'card',
      title: 'The same box, with open strings',
      body: 'The same five-note box exists in open position, down by the nut, for {n:E} minor ({n:E} {n:G} {n:A} {n:B} {n:D}), with the open strings doing finger 1\'s job. On every string, the open note and one fretted note: string 6 fret 3, string 5 fret 2, string 4 fret 2, string 3 fret 2, string 2 fret 3, string 1 fret 3.',
      figure: {
        kind: 'fretboard',
        frets: [0, 3],
        dots: OPEN_E_BOX.map((d) => ({ ...d, ...(d.note.startsWith('E') ? { role: 'root' as const } : {}) })),
        caption: '{n:E} minor pentatonic in open position. The roots, {n:E}, are marked.',
      },
    },
    { generate: 'scale-notes', params: { scales: ['minor-pentatonic'], tonics: ['E', 'A'], form: 'order' } },
    {
      type: 'fretboard-find',
      prompt: 'Tap the three {n:E} roots in open position.',
      find: { note: 'E' },
      mode: 'all',
      octave: 'any',
      frets: [0, 3],
      explain: 'The open string 6, string 4 fret 2 and the open string 1: three {n:E}s, each an octave apart.',
      fact: 'open-e-roots',
    },
    {
      type: 'card',
      title: 'Notes you already know',
      body: 'You know these notes from your hammer-ons and pull-offs: the open string, then fret 2 or 3 on the same string. And here is a surprise: move the whole shape up to fret 12, and it is {n:E} minor pentatonic again, one octave higher. Fret 12 does the job of the open strings.',
      figure: {
        kind: 'fretboard',
        frets: [12, 15],
        dots: OPEN_E_BOX.map((d) => ({ string: d.string, fret: d.fret + 12, note: d.note.replace(/\d/, (o) => String(Number(o) + 1)) })),
        caption: 'The same shape at frets 12 to 15: one octave higher.',
      },
    },
    {
      type: 'true-false',
      statement: 'At fret 12 the open-position shape is {n:E} minor pentatonic again, one octave higher.',
      answer: true,
      explain: 'Fret 12 is the octave of every open string, so the whole shape repeats there, an octave up.',
      fact: 'octave-at-12',
    },
    {
      type: 'play-phrase',
      prompt: 'Up the open box, one note per click: open 6 and fret 3, open 5 and fret 2, open 4 and fret 2, and on to string 1, fret 3.',
      notes: asTab(OPEN_E_BOX),
      octave: 'exact',
      tempo: 60,
      explain: '{n:E} {n:G}, {n:A} {n:B}, {n:D} {n:E}, {n:G} {n:A}, {n:B} {n:D}, {n:E} {n:G}: open, fretted, on every string.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap all 12 notes of {n:E} minor pentatonic, open strings to fret 3.',
        find: { scale: 'minor-pentatonic', tonic: 'E' },
        mode: 'all',
        octave: 'any',
        frets: [0, 3],
        explain: 'Every open string, plus fret 3 on strings 6, 2 and 1 and fret 2 on strings 5, 4 and 3.',
      },
    },
    {
      type: 'play-phrase',
      prompt: 'And back down: string 1 fret 3 and open, string 2 fret 3 and open, and so on to the open string 6.',
      notes: asTab([...OPEN_E_BOX].reverse()),
      octave: 'exact',
      tempo: 60,
      explain: 'Coming down, the fretted note first, then the open string: you finish on the low {n:E}, the root.',
      alternative: {
        type: 'order',
        prompt: 'Coming down, put the fretted notes in order, from string 1 to string 6.',
        tiles: ['{n:G}', '{n:D}', '{n:A}', '{n:E}', '{n:B}', '{n:G}'],
        distractors: ['{n:C}'],
        explain: 'String 1 fret 3 {n:G}, string 2 fret 3 {n:D}, string 3 fret 2 {n:A}, string 4 fret 2 {n:E}, string 5 fret 2 {n:B}, string 6 fret 3 {n:G}.',
      },
    },
    toolTask({
      id: 'jam-e-minor',
      title: 'Jam in E minor, open position',
      tool: 'progressions',
      params: ['minor-i-bvi-bvii', 'e', 'jam'],
      minutes: 4,
      body: 'The band plays {c:Em}, {c:C}, {c:D}, {c:Em}. Set it to 92 BPM and improvise with the open box: short phrases, rests between, and hammer-ons and pull-offs between each open string and its fretted note. End on an {n:E}.',
    }),
    {
      type: 'fretboard-name',
      prompt: 'In the open box, string 2 is played open and at fret 3. Which note is fret 3?',
      position: { string: 2, fret: 3 },
      ask: 'note',
      spelling: 'any',
      options: ['D', 'C', 'E', 'B'],
      explain: 'String 2, fret 3 is {n:D}: the open {n:B}, then {n:C} at fret 1 and {n:D} at fret 3.',
    },
    toolTask({
      id: 'note-hunt-e',
      title: 'Note Hunt in E minor',
      tool: 'arcade',
      params: ['note-hunt', 'e-minor-pentatonic', 'box-1'],
      minutes: 2,
      body: 'A round of Note Hunt in the open-position box: notes light up, you play them or tap them. Open strings count too.',
    }),
    {
      type: 'choice',
      prompt: 'In the open box, what does the job finger 1 did at fret 5?',
      options: [
        { text: 'The open strings', correct: true },
        { text: 'Finger 4', why: 'Finger 4 is not needed here: the fretted notes are at frets 2 and 3.' },
        { text: 'Finger 2 at fret 1', why: 'Nothing is played at fret 1 in this box. The open strings do finger 1\'s job.' },
      ],
      explain: 'In box 1 at fret 5, finger 1 played the lower note on every string. In open position the open strings play it, and the nut acts as fret zero.',
      fact: 'open-e-box',
    },
  ],
  facts: [
    { id: 'open-e-box', front: '{n:E} minor pentatonic in open position: which notes?', back: '{n:E} {n:G} {n:A} {n:B} {n:D}: every open string, plus fret 3 on strings 6, 2, 1 and fret 2 on strings 5, 4, 3.' },
    { id: 'open-e-roots', front: 'Where are the {n:E} roots in open position?', back: 'The open string 6, string 4 fret 2 and the open string 1.' },
    { id: 'octave-at-12', front: 'Where does the open-position box repeat, an octave higher?', back: 'At fret 12: fret 12 does the job of the open strings.' },
  ],
};

// ── 6. Rhythm, then a solo (milestone) ──────────────────────────────────────────────────────────

/** The end of the solo chorus: climb in bars 9 and 10, land on A (string 4, fret 7) in bar 11. */
const SOLO_ENDING = [
  { string: 5, fret: 7, duration: 'q' },
  { string: 4, fret: 5, duration: 'q' },
  { string: 4, fret: 7, duration: 'q' },
  { string: 3, fret: 5, duration: 'q' },
  { string: 3, fret: 7, duration: 'q' },
  { string: 2, fret: 5, duration: 'q' },
  { string: 2, fret: 8, duration: 'q' },
  { string: 2, fret: 5, duration: 'q' },
  { string: 3, fret: 7, duration: 'q' },
  { string: 3, fret: 5, duration: 'q' },
  { string: 4, fret: 7, duration: 'h' },
] as const;

const bluesSoloMilestone: TeacherLesson = {
  id: 'blues-solo-milestone',
  title: 'Rhythm, then a solo',
  teaches: 'In a band you play rhythm, take a solo and hand back: start low, climb, and end on A in bar 11.',
  minutes: 4,
  skill: 'teacher:mia:blues-solo-milestone',
  steps: [
    {
      type: 'card',
      title: 'Rhythm, solo, hand back',
      body: 'This is what guitarists do in a band: play rhythm, take a solo, then hand back. Plan a little: start your solo low and simple, climb in the middle, and end on {n:A} in bar 11 so the band knows you are done. And keep the beat, no matter what.',
    },
    {
      type: 'order',
      prompt: 'Put Mia\'s three-part solo plan in order.',
      tiles: ['Low and simple', 'Climb', 'Land on A'],
      distractors: ['Stop to fix it'],
      explain: 'Start low and simple, climb in the middle, and land on {n:A} in bar 11. Stopping is never part of the plan: the band keeps going.',
      fact: 'solo-plan',
    },
    techniqueTask({
      id: 'warm-up',
      title: 'The Five-Minute Warm-Up',
      exercise: 'tech-warm-up',
      minutes: 5,
      body: 'Warm up before the show: open-string picking, the slow spider, an easy change, gentle hammer-ons and pull-offs, and a slow scale. Never stretch to discomfort.',
    }),
    {
      type: 'true-false',
      statement: 'If you slip in the middle of your solo, you stop and start the chorus again.',
      answer: false,
      explain: 'Keep the beat no matter what. Let the slip go, rest a bar if you need to, and come back in with the band.',
      fact: 'solo-plan',
    },
    {
      type: 'card',
      title: 'Two choruses',
      body: 'One time through the 12 bars is a {t:blues-chorus|chorus}. Your map: chorus 1, the shuffle as rhythm; chorus 2, your solo in box 1. Then swap: solo first, shuffle second. Moving from rhythm to solo is a jump of the hand, so plan it in bar 12.',
    },
    toolTask({
      id: 'two-choruses',
      title: 'Jam: rhythm, then a solo',
      tool: 'progressions',
      params: ['blues-12-bar', 'a', 'jam'],
      minutes: 6,
      body: 'A 12-bar blues in A at 84 BPM: chorus 1 shuffle, chorus 2 solo; then the other way round. If you can, record the two choruses on your phone and listen back with my checklist: did the shuffle stay swung, did the solo leave space, did you end on {n:A}?',
    }),
    {
      type: 'choice',
      prompt: 'Listening back to your take, which three things does Mia\'s checklist ask?',
      multiple: true,
      options: [
        { text: 'Did the shuffle stay swung?', correct: true },
        { text: 'Did the solo leave space?', correct: true },
        { text: 'Did you end on {n:A}?', correct: true },
        { text: 'Did you play every note in the box?', why: 'Using every note is not the goal. Space and a clear ending matter more.' },
      ],
      explain: 'Swing in the rhythm, space in the solo, and the landing on {n:A}: if all three are there, you played like a band guitarist.',
    },
    {
      type: 'card',
      title: 'Your show',
      body: 'The last bars of your solo chorus, at 84 BPM. Bars 9 and 10: climb from string 5 up to string 2. Bar 11: come down and land on {n:A}, string 4, fret 7, and let it ring while the band turns around. Keep going through any mistake.',
      figure: { kind: 'tab', tempo: 84, notes: [...SOLO_ENDING], caption: 'Bars 9 to 11 of the solo: climb, then land on {n:A}.' },
    },
    {
      type: 'play-phrase',
      id: 'show',
      prompt: 'Your show: string 5 fret 7, string 4 frets 5 7, string 3 frets 5 7, string 2 frets 5 8 5, string 3 frets 7 5, and land on string 4 fret 7.',
      notes: [...SOLO_ENDING],
      octave: 'exact',
      tempo: 84,
      pass: 0.8,
      explain: 'Up through {n:E} {n:G} {n:A} {n:C} {n:D} {n:E} {n:G} {n:E}, then {n:D} {n:C} and home to {n:A} in bar 11. About 8 notes in 10 is a pass.',
      alternative: {
        type: 'order',
        prompt: 'Put the three bars of the solo ending in order: two that climb, one that lands.',
        tiles: ['{n:E} {n:G} {n:A} {n:C}', '{n:D} {n:E} {n:G} {n:E}', '{n:D} {n:C} {n:A}'],
        explain: 'Bar 9 climbs {n:E} {n:G} {n:A} {n:C}, bar 10 goes on up, {n:D} {n:E} {n:G} {n:E}, and bar 11 lands: {n:D} {n:C} {n:A}.',
      },
    },
  ],
  facts: [
    { id: 'solo-plan', front: 'Mia\'s plan for a blues solo?', back: 'Start low and simple, climb in the middle, end on {n:A} in bar 11. Keep the beat no matter what.' },
    { id: 'blues-chorus-fact', front: 'In a blues, what is one chorus?', back: 'One time through the 12 bars.' },
  ],
};

/** Unit 11 of Mia's course. */
const unit: TeacherUnit = {
  id: 'mia-first-solo',
  title: 'Your first scale and solo',
  theme: 'improvisation',
  description: 'Learn A minor pentatonic box 1, play phrases in it, and improvise over a groove and a 12-bar blues.',
  lessons: [aMinorPentatonic, box1Licks, firstImprovisation, pentatonicOverTheBlues, eMinorPentatonic, bluesSoloMilestone],
  checkpoint: { sample: 8, maxMistakes: 2 },
  milestone: {
    lesson: 'blues-solo-milestone',
    step: 'show',
    piece: 'Blues in A',
    celebrate: 'You climbed through box 1 and landed on {n:A} in bar 11, right where a solo hands back to the band. Rhythm, a solo, then hand back: that is what guitarists do. Next: playing with others, and a practice habit for life.',
  },
  glossary: [
    { id: 'phrase', term: 'phrase', definition: 'A short musical idea with a beginning and an end, like a sentence.' },
    { id: 'call-and-response', term: 'call and response', definition: 'One phrase asks a question and the next one answers it.' },
    { id: 'improvise', term: 'improvise', definition: 'To make up music on the spot, as you play.' },
    { id: 'hammer-on', term: 'hammer-on', definition: 'Sounding a second note by bringing a fretting finger down hard on the string, without picking again.' },
    { id: 'blues-chorus', term: 'chorus', definition: 'In a blues: one time through the 12 bars of the form.' },
  ],
};

export default unit;
