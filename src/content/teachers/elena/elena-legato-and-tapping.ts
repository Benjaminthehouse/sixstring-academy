/**
 * Prof. Elena Varga, unit 4: Legato, tapping and harmonics (plan: `elena/elena-legato-and-tapping`
 * in src/content/plan/teachers.json).
 *
 * Elena's voice: conservatory rigour, dry humour, high standards, deep respect for the student. The
 * learner already plays well (Dev's course, or the equivalent), so the cards explain the mechanics
 * precisely and the tasks send the hands to the Technique ladders, the Player, the Tuner and a jam.
 *
 * Every lesson follows its plan entry: the `explain` on the cards, the `show` as figures (tab, the
 * harmonic points, the pitch line of a bend, the open-G neck), the `practice` as in-lesson
 * exercises (every microphone step with a no-microphone alternative) or tasks. The plan's "Record"
 * steps become the Technique screen's microphone take (it reports missing and uneven notes), with
 * a phone recording as the no-microphone way. The slide lesson does the standard-tuning intonation
 * drill before retuning, not after (see the report).
 *
 * Music from the library: Three-Notes-per-String Legato, Hammer-On from Nowhere, Tapping Triplets,
 * the three harmonics exercises, the two bend exercises and Slide Intonation (`@/content/technique`);
 * Lick: Tapping Arpeggios (`st-lick-tapping`, 80 BPM), Harmonics Melody (`st-lick-harmonics`,
 * 60 BPM) and Open G Slide Blues (`st-open-g-slide`, 72 BPM, open G). The jam is the slow 12/8
 * blues in A. `elena-legato-and-tapping.test.ts` cross-checks every note, fret, tuning, harmonic
 * and tempo against the engines and the library.
 */
import type { TabNote } from '@/lessons';
import type { TeacherLesson, TeacherUnit } from '../types';
import { playerTask, techniqueTask, toolTask } from '../tasks';

/** G major, three notes per string from string 6 fret 3: the first bar of the technique exercise. */
export const LEGATO_BAR: readonly TabNote[] = [
  { string: 6, fret: 3, duration: 'et' },
  { string: 6, fret: 5, duration: 'et' },
  { string: 6, fret: 7, duration: 'et' },
  { string: 5, fret: 3, duration: 'et' },
  { string: 5, fret: 5, duration: 'et' },
  { string: 5, fret: 7, duration: 'et' },
  { string: 4, fret: 4, duration: 'et' },
  { string: 4, fret: 5, duration: 'et' },
  { string: 4, fret: 7, duration: 'et' },
  { string: 3, fret: 4, duration: 'et' },
  { string: 3, fret: 5, duration: 'et' },
  { string: 3, fret: 7, duration: 'et' },
];

/** One octave of the run, G2 to G3, for the microphone. */
export const LEGATO_OCTAVE: readonly TabNote[] = [
  { string: 6, fret: 3, duration: 'e' },
  { string: 6, fret: 5, duration: 'e' },
  { string: 6, fret: 7, duration: 'e' },
  { string: 5, fret: 3, duration: 'e' },
  { string: 5, fret: 5, duration: 'e' },
  { string: 5, fret: 7, duration: 'e' },
  { string: 4, fret: 4, duration: 'e' },
  { string: 4, fret: 5, duration: 'e' },
];

/** The Am tapping cycle on string 1: tap 12, pull off to 5, hammer 8, four times (one bar of triplets). */
export const TAP_AM_BAR: readonly TabNote[] = Array.from({ length: 4 }, () => [
  { string: 1, fret: 12, duration: 'et' },
  { string: 1, fret: 5, duration: 'et' },
  { string: 1, fret: 8, duration: 'et' },
]).flat();

/** The three chord positions of open G on the top strings, one string at a time: G at 12, C at 5, D at 7. */
export const OPEN_G_CHORDS: readonly TabNote[] = [12, 5, 7].flatMap((fret) => [3, 2, 1].map((string) => ({ string, fret, duration: 'q' })));

// ── 1. Three-notes-per-string legato ────────────────────────────────────────────────────────────

const threeNpsLegato: TeacherLesson = {
  id: 'three-nps-legato',
  title: 'Three-notes-per-string legato',
  teaches: 'Pick only the first note on each string; the fretting hand hammers and pulls off the rest, evenly.',
  minutes: 5,
  skill: 'teacher:elena:three-nps-legato',
  steps: [
    {
      type: 'card',
      title: 'One stroke per string',
      body: '{k:G major}, {t:three-notes-per-string|three notes per string}, pattern 1 from our first unit: string 6 fret 3 ({n:G}) upward. Going up, pick the first note on each string and {t:hammer-on|hammer} the other two. Going down, pick the first and {t:pull-off|pull off} the rest. The fretting hand does the pick\'s work.',
      figure: { kind: 'tab', tempo: 60, notes: LEGATO_BAR.slice(0, 6), caption: 'Strings 6 and 5: pick each first note, hammer the next two.' },
    },
    {
      type: 'choice',
      prompt: 'Ascending on string 5, frets 3, 5 and 7. Which notes are picked?',
      options: [
        { text: 'Only fret 3, the first', correct: true },
        { text: 'All three', why: 'That is alternate picking. In legato the pick strikes once per string.' },
        { text: 'Frets 3 and 7', why: 'Fret 7 is hammered from fret 5. One stroke per string, no more.' },
      ],
      explain: 'Fret 3 ({n:C}) is picked; fret 5 ({n:D}) and fret 7 ({n:E}) are hammered. One stroke per string, and the hand supplies the rest.',
      fact: 'legato-one-stroke',
    },
    {
      type: 'card',
      title: 'Even, or it is not legato',
      body: 'Weak hammers and lazy pull-offs show up at once as uneven volume: a loud picked note, then two faint ones. Hammer from just above the string, on the fingertip, right behind the fret. Pull off slightly sideways, so the finger plucks as it leaves. Practise slowly, and listen.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: [...LEGATO_BAR], tempo: 60 }, label: 'Hear four strings, even' },
    },
    {
      type: 'true-false',
      statement: 'Descending, you pick the first note on each string and pull off to the other two.',
      answer: true,
      explain: 'On string 1 coming down: pick fret 8 ({n:C}), pull off to 7 ({n:B}) and 5 ({n:A}). The pull-off must pluck, not merely lift.',
      fact: 'legato-one-stroke',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap the three notes this pattern plays on string 4.',
      find: { scale: 'major', tonic: 'G' },
      mode: 'all',
      octave: 'any',
      frets: [4, 7],
      strings: [4],
      explain: 'String 4 takes frets 4, 5 and 7: {n:F#}, {n:G} and {n:A}. The hand shifts up one fret from strings 6 and 5.',
      fact: 'g-major-3nps-frets',
    },
    techniqueTask({
      id: 'ladder-60',
      title: 'The run at 60 BPM',
      exercise: 'tech-legato-3nps',
      minutes: 6,
      body: 'Set the ladder to 60 {t:bpm|BPM}: triplets, one string per beat, up the six strings and back down as written. Three times through. Turn the microphone on for a take: it reports any note that did not sound and how even the timing was.',
      tip: 'If the forearm tightens, stop and shake it out. Tension is not effort; it is waste.',
    }),
    {
      type: 'play-phrase',
      prompt: 'One octave, legato: {n:G} on string 6 fret 3 up to {n:G} on string 4 fret 5. Three picked notes only.',
      notes: [...LEGATO_OCTAVE],
      octave: 'exact',
      tempo: 60,
      explain: 'Frets 3 5 7 on string 6, 3 5 7 on string 5, then 4 5 on string 4: {n:G} {n:A} {n:B} {n:C} {n:D} {n:E} {n:F#} {n:G}. Every note must speak, not only the picked ones.',
      alternative: {
        type: 'order',
        prompt: 'No guitar to hand? Put the octave of the run in order, from {n:G} up. Then record it later and listen for gaps.',
        tiles: ['{n:G}', '{n:A}', '{n:B}', '{n:C}', '{n:D}', '{n:E}', '{n:F#}', '{n:G}'],
        distractors: ['{n:F}'],
        explain: '{k:G major}: {n:G} {n:A} {n:B} {n:C} {n:D} {n:E} {n:F#} {n:G}. Its one sharp, {n:F#}, is the first note on string 4.',
      },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each pair of strings with its frets in this pattern.',
      pairs: [
        { left: 'Strings 6 and 5', right: 'Frets 3, 5, 7' },
        { left: 'Strings 4 and 3', right: 'Frets 4, 5, 7' },
        { left: 'Strings 2 and 1', right: 'Frets 5, 7, 8' },
      ],
      explain: 'Three fingerings for six strings: 3-5-7, then 4-5-7, then 5-7-8. The hand creeps up a fret at a time as the run climbs.',
      fact: 'g-major-3nps-frets',
    },
    techniqueTask({
      id: 'ladder-weeks',
      title: 'Up the ladder, over weeks',
      exercise: 'tech-legato-3nps',
      minutes: 5,
      body: 'Each day, start one rung below yesterday\'s clean tempo and climb 4 BPM a rung. A rung counts only when every note sounds and all are equally loud. The goal, 132 BPM, is weeks away. It is not tonight\'s business.',
    }),
    {
      type: 'choice',
      prompt: 'Your picked notes are loud and the hammered ones faint. The remedy?',
      options: [
        { text: 'Firmer, closer hammers; a lighter pick', correct: true },
        { text: 'Pick every note instead', why: 'That removes the problem by removing the technique. The fretting hand must learn to do the work.' },
        { text: 'Play faster so it blurs', why: 'Speed hides nothing from a listener. Slow down until it is even.' },
      ],
      explain: 'Match the levels from both sides: hammer harder and right behind the fret, and pick a little softer. Then the three notes on each string sound as one even line.',
      fact: 'legato-even',
    },
    { generate: 'scale-notes', params: { scales: ['major'], tonics: ['G'], form: 'fill' } },
  ],
  facts: [
    { id: 'legato-one-stroke', front: 'In three-notes-per-string legato, which notes are picked?', back: 'Only the first note on each string. Ascending, hammer the other two; descending, pull off to them.' },
    { id: 'legato-even', front: 'What gives weak legato away at once?', back: 'Uneven volume: weak hammers and lazy pull-offs sound fainter than the picked note.' },
    { id: 'g-major-3nps-frets', front: '{k:G major} three notes per string from string 6 fret 3: which frets?', back: '3-5-7 on strings 6 and 5, 4-5-7 on strings 4 and 3, 5-7-8 on strings 2 and 1.' },
  ],
};

// ── 2. Hammer-ons from nowhere ──────────────────────────────────────────────────────────────────

const hammerFromNowhere: TeacherLesson = {
  id: 'hammer-from-nowhere',
  title: 'Hammer-ons from nowhere',
  teaches: 'A hammer-on onto a silent string must be fast and precise enough to make the note by itself.',
  minutes: 4,
  skill: 'teacher:elena:hammer-from-nowhere',
  steps: [
    {
      type: 'card',
      title: 'A note with no pick',
      body: 'A hammer-on from nowhere lands on a string that is not already ringing, so it must be fast and precise enough to make the note by itself. Its reward: the picking hand is free to rest, mute or tap. Begin on three notes: string 3 fret 7 ({n:D}), string 2 fret 8 ({n:G}) and string 1 fret 5 ({n:A}).',
      figure: {
        kind: 'fretboard',
        frets: [4, 9],
        dots: [
          { string: 3, fret: 7, note: 'D4', finger: 3 },
          { string: 2, fret: 8, note: 'G4', finger: 4 },
          { string: 1, fret: 5, note: 'A4', finger: 1 },
        ],
        caption: 'Three starting notes, each hammered onto a silent string.',
      },
    },
    {
      type: 'choice',
      prompt: 'What makes a hammer-on one "from nowhere"?',
      options: [
        { text: 'The string was silent before it landed', correct: true },
        { text: 'It follows a picked note on that string', why: 'That is an ordinary hammer-on: the picked note does half the work.' },
        { text: 'The picking hand frets it', why: 'That is a tap, which comes in the next lesson.' },
      ],
      explain: 'Nothing is ringing when the finger arrives, so the finger\'s speed alone sets the string vibrating. No pick, no earlier note.',
      fact: 'hammer-from-nowhere',
    },
    {
      type: 'card',
      title: 'Speed, not squeeze',
      body: 'Strike from a centimetre or two above the string, on the fingertip, just behind the fret wire, and stay down. Volume comes from the speed of arrival, not from pressing harder afterwards. Spare fingers and the picking palm keep the other strings quiet.',
      tip: 'Fingertip sore after a long session: normal. An aching joint or a sharp pain: stop for the day.',
    },
    {
      type: 'play-note',
      prompt: 'Hammer string 3 fret 7 with finger 3. No pick at all.',
      note: 'D4',
      octave: 'exact',
      where: { string: 3, fret: 7 },
      explain: 'String 3 fret 7 is {n:D}. If it barely sounded, the finger arrived too slowly or too far from the fret wire.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap the first hammer from nowhere: {n:D} on string 3.',
        find: { note: 'D4' },
        mode: 'one',
        octave: 'exact',
        frets: [5, 9],
        explain: 'String 3 fret 7 is {n:D}, a fifth above the open {n:G} string.',
      },
    },
    {
      type: 'play-note',
      prompt: 'Now string 2 fret 8 with finger 4, from nowhere.',
      note: 'G4',
      octave: 'exact',
      where: { string: 2, fret: 8 },
      explain: 'String 2 fret 8 is {n:G}. The little finger is the weakest hammer: give it a higher, quicker strike, not more pressure.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap the second hammer from nowhere: {n:G} on string 2.',
        find: { note: 'G4' },
        mode: 'one',
        octave: 'exact',
        frets: [5, 9],
        explain: 'String 2 fret 8 is {n:G}, a minor sixth above the open {n:B} string.',
      },
    },
    {
      type: 'play-note',
      prompt: 'And string 1 fret 5 with finger 1.',
      note: 'A4',
      octave: 'exact',
      where: { string: 1, fret: 5 },
      explain: 'String 1 fret 5 is {n:A}. The thin string speaks easily; the danger here is the other strings ringing along. Mute them.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap the third hammer from nowhere: {n:A} on string 1.',
        find: { note: 'A4' },
        mode: 'one',
        octave: 'exact',
        frets: [3, 7],
        explain: 'String 1 fret 5 is {n:A}, a fourth above the open {n:E} string.',
      },
    },
    techniqueTask({
      id: 'from-nowhere-60',
      title: 'Hammer-On from Nowhere at 60',
      exercise: 'tech-hammer-from-nowhere',
      minutes: 4,
      body: 'At 60 {t:bpm|BPM}: first the single notes, every one hammered, none picked; then the runs, each string started with a hammer from nowhere and pulled off. A microphone take shows any note that did not speak. Without one, record a take on your phone.',
    }),
    {
      type: 'true-false',
      statement: 'A hammer-on from nowhere needs more finger speed than one after a picked note.',
      answer: true,
      explain: 'After a picked note the string is already vibrating and the finger only changes its length. From nowhere, the finger must start the vibration by itself.',
      fact: 'hammer-from-nowhere',
    },
    techniqueTask({
      id: 'combine-3nps',
      title: 'The legato run, no pick at all',
      exercise: 'tech-legato-3nps',
      minutes: 3,
      body: 'Now last lesson\'s {k:G major} run at 60 BPM, but start every string with a hammer from nowhere instead of a pick stroke. Up and down. If the first note of a string is weaker than its neighbours, go slower.',
      tip: 'The picking hand now has nothing to do but mute. Let it.',
    }),
    {
      type: 'choice',
      prompt: 'What does the hammer-on from nowhere free the picking hand to do?',
      options: [
        { text: 'Rest, mute or tap', correct: true },
        { text: 'Strum the next chord early', why: 'A strum would sound every string. The point is control, not more noise.' },
        { text: 'Nothing: it is only for show', why: 'Hardly. It is what makes long legato lines and tapping possible.' },
      ],
      explain: 'With no pick stroke needed, the picking hand can rest, mute the strings you are not playing, or tap, which is the next lesson.',
      fact: 'hammer-from-nowhere-why',
    },
    { generate: 'note-on-string', params: { strings: [3, 2, 1], frets: [5, 8], naturals: true, ask: 'name' } },
  ],
  facts: [
    { id: 'hammer-from-nowhere', front: 'What is a hammer-on from nowhere?', back: 'A note sounded by hammering onto a silent string, with no pick stroke: fast and precise enough to make the note by itself.' },
    { id: 'hammer-from-nowhere-why', front: 'Why use hammer-ons from nowhere?', back: 'They free the picking hand to rest, mute or tap, and let legato lines start without a pick.' },
  ],
};

// ── 3. Tapping ──────────────────────────────────────────────────────────────────────────────────

const tapping: TeacherLesson = {
  id: 'tapping',
  title: 'Tapping',
  teaches: 'Tap, pull off, hammer on: one wide arpeggio per beat on one string, with the picking hand as a third finger.',
  minutes: 5,
  skill: 'teacher:elena:tapping',
  steps: [
    {
      type: 'card',
      title: 'A third finger on the neck',
      body: '{t:tapping|Tapping} uses the picking hand as a third finger on the fretboard. Tap string 1 fret 12 ({n:E}) with the middle finger, pull off to string 1 fret 5 ({n:A}), hammer string 1 fret 8 ({n:C}), and repeat. Three notes a beat, in triplets: an {c:Am} {t:arpeggio} on one string.',
      figure: { kind: 'tab', tempo: 50, notes: TAP_AM_BAR.slice(0, 6), caption: '{c:Am} on string 1: tap 12, pull off to 5, hammer 8.' },
    },
    {
      type: 'choice',
      prompt: 'In the {c:Am} shape, what plays fret 12?',
      options: [
        { text: 'The picking hand\'s middle finger', correct: true },
        { text: 'Fretting finger 4', why: 'Finger 4 hammers fret 8, the third note of each group.' },
        { text: 'Fretting finger 1', why: 'Finger 1 holds fret 5 throughout, waiting for the pull-off.' },
      ],
      explain: 'The middle finger taps, so the pick can stay in its usual grip between thumb and index. Finger 1 holds fret 5 and finger 4 hammers fret 8.',
      fact: 'tapping-am',
    },
    {
      type: 'card',
      title: 'The flick is the note',
      body: 'The pull-off from the tap is the motion that matters: flick slightly sideways off the string, so the tapping finger plucks it as it leaves. Lift straight up and fret 5 hardly sounds. Mute the other strings with both hands: fretting fingers lying lightly across them, the picking palm on the low strings.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: [...TAP_AM_BAR], tempo: 50 }, label: 'Hear the {c:Am} cycle' },
    },
    {
      type: 'true-false',
      statement: 'Lifting the tapping finger straight up makes the fret 5 note sound well.',
      answer: false,
      explain: 'Straight up leaves the string almost still. The sideways flick plucks it, and that pluck is the {n:A} at fret 5.',
      fact: 'tapping-flick',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each chord with its frets on string 1: tap, pull-off, hammer.',
      pairs: [
        { left: '{c:Am}', right: 'Frets 12, 5, 8' },
        { left: '{c:F}', right: 'Frets 13, 5, 8' },
        { left: '{c:G}', right: 'Frets 15, 7, 10' },
        { left: '{c:E}', right: 'Frets 12, 4, 7' },
      ],
      explain: '{c:F} moves only the tap, from 12 to 13. {c:G} moves everything up two frets from {c:F}\'s hand. {c:E} keeps the tap at 12 and drops the hand to frets 4 and 7 for {n:G#} and {n:B}.',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap the three notes of the {c:G} shape on string 1.',
      find: { chord: 'G' },
      mode: 'all',
      octave: 'any',
      frets: [7, 15],
      strings: [1],
      explain: 'Fret 15 is {n:G} (tapped), fret 7 {n:B} and fret 10 {n:D}: the root, third and fifth of {c:G}.',
    },
    techniqueTask({
      id: 'tapping-50',
      title: 'Tapping Triplets at 50 BPM',
      exercise: 'tech-tapping',
      minutes: 5,
      body: 'Stay on the {c:Am} shape at 50 {t:bpm|BPM} until every triplet is even, then add {c:F}, {c:G} and {c:E}. A microphone take shows any note that did not sound; whether the tap is as loud as the others, your ears must judge.',
      tip: 'Tap with the fingertip pad, not the nail, and land right behind fret 12.',
    }),
    {
      type: 'play-phrase',
      prompt: 'The {c:Am} cycle twice on string 1: tap 12, pull off to 5, hammer 8.',
      notes: [...TAP_AM_BAR.slice(0, 6)],
      octave: 'exact',
      tempo: 50,
      explain: '{n:E} {n:A} {n:C}, twice: the tap, the pull-off and the hammer each make one note of the {c:Am} arpeggio.',
      alternative: {
        type: 'order',
        prompt: 'Put one {c:Am} cycle in order, starting with the tap.',
        tiles: ['{n:E}', '{n:A}', '{n:C}'],
        distractors: ['{n:G}'],
        explain: 'Tap fret 12 ({n:E}), pull off to fret 5 ({n:A}), hammer fret 8 ({n:C}).',
      },
    },
    playerTask({
      id: 'lick-tapping',
      title: 'Lick: Tapping Arpeggios',
      song: 'st-lick-tapping',
      tempo: 75,
      minutes: 5,
      body: 'Play the lick at 60 {t:bpm|BPM}: two bars each of {c:Am}, {c:F}, {c:G} and {c:E}, triplet eighths. When it is clean, raise the speed to 100 % (80 BPM).',
      tip: 'Record a take and listen: the tapped note should be no louder or softer than the other two.',
    }),
    {
      type: 'choice',
      prompt: 'The {c:F} shape taps fret 13, pulls off to 5, hammers 8. Which notes?',
      options: [
        { text: '{n:F} {n:A} {n:C}', correct: true },
        { text: '{n:E} {n:A} {n:C}', why: 'That is the {c:Am} shape, with the tap at fret 12.' },
        { text: '{n:F} {n:Bb} {n:D}', why: 'The hand does not move: frets 5 and 8 are still {n:A} and {n:C}.' },
      ],
      explain: 'Fret 13 is {n:F}; frets 5 and 8 stay {n:A} and {n:C}. One fret on the tap turns {c:Am} into {c:F}.',
    },
    { generate: 'chord-tones', params: { types: ['minor', 'major'], roots: ['A', 'F', 'G', 'E'], ask: 'notes' } },
  ],
  facts: [
    { id: 'tapping-am', front: 'The {c:Am} tapping cycle on string 1?', back: 'Tap fret 12 ({n:E}) with the picking hand, pull off to fret 5 ({n:A}), hammer fret 8 ({n:C}).' },
    { id: 'tapping-flick', front: 'In tapping, which motion matters most?', back: 'The pull-off from the tap: flick slightly sideways off the string so the tapping finger plucks it.' },
  ],
};

// ── 4. Harmonics ────────────────────────────────────────────────────────────────────────────────

const HARMONIC_POINTS = [12, 7, 5].flatMap((fret) => [6, 5, 4, 3, 2, 1].map((string) => ({ string, fret, role: 'target' as const })));

const harmonics: TeacherLesson = {
  id: 'harmonics',
  title: 'Harmonics: natural, artificial and pinch',
  teaches: 'Touch over fret 12, 7 or 5 for natural harmonics; twelve frets above a fretted note for artificial ones.',
  minutes: 5,
  skill: 'teacher:elena:harmonics',
  steps: [
    {
      type: 'card',
      title: 'Touch, do not press',
      body: 'A natural {t:harmonic} sounds when you touch a string lightly right over fret 12, 7 or 5 and pick: an {t:octave}, an octave and a fifth, and two octaves above the open string. Touch over the wire itself, pick, then lift the finger.',
      figure: { kind: 'fretboard', frets: [5, 12], labels: 'none', dots: HARMONIC_POINTS, caption: 'The harmonic points: right over the wire at frets 12, 7 and 5.' },
    },
    {
      type: 'choice',
      prompt: 'Touched over fret 7, what does the low {n:E} string sound?',
      options: [
        { text: '{n:B}, an octave and a fifth up', correct: true },
        { text: '{n:B}, a fifth up', why: 'That is the fretted note at fret 7. The harmonic sounds an octave higher.' },
        { text: '{n:E}, two octaves up', why: 'That is the harmonic over fret 5.' },
        { text: '{n:E}, one octave up', why: 'That is the harmonic over fret 12.' },
      ],
      explain: 'Over fret 7 the string divides into three: the harmonic is an octave and a fifth above the open {n:E}, a {n:B}.',
      fact: 'harmonic-points',
    },
    {
      type: 'listen-choice',
      prompt: 'The open low {n:E}, then one of its harmonics. Which point was touched?',
      sound: { kind: 'notes', notes: ['E2', 'B3'], tempo: 60 },
      options: [{ text: 'Over fret 12' }, { text: 'Over fret 7', correct: true }, { text: 'Over fret 5' }],
      shuffle: false,
      explain: '{n:E} up to {n:B}, an octave and a fifth: the harmonic over fret 7. Over fret 12 it would be the {n:E} an octave up, over fret 5 two octaves up.',
    },
    techniqueTask({
      id: 'natural-harmonics',
      title: 'Natural harmonics, six strings',
      exercise: 'tech-natural-harmonics',
      minutes: 4,
      body: 'All six strings over fret 12, then 7, then 5, at 60 {t:bpm|BPM}. Touch, pick, lift. A dull thud means you pressed or missed the wire; slide the finger a hair and try again.',
    }),
    {
      type: 'play-note',
      prompt: 'Touch string 3 over fret 12, pick, and let the harmonic ring.',
      note: 'G4',
      octave: 'exact',
      where: { string: 3, fret: 12 },
      explain: 'The open {n:G} string\'s octave harmonic: {n:G}, the same pitch as fret 12 pressed, with a purer tone.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap the place for the octave harmonic of string 3.',
        find: { note: 'G4' },
        mode: 'one',
        octave: 'exact',
        frets: [10, 14],
        explain: 'Over fret 12 of string 3: the octave harmonic, {n:G}, an octave above the open string.',
      },
    },
    {
      type: 'play-note',
      prompt: 'Now string 2 over fret 7: an octave and a fifth above the open {n:B}.',
      note: 'F#5',
      octave: 'exact',
      explain: 'The open {n:B} string touched over fret 7 sounds {n:F#}, an octave and a fifth up: higher than any note you can fret on that string in first position.',
      alternative: {
        type: 'choice',
        prompt: 'String 2 touched over fret 7: which note?',
        options: [
          { text: '{n:F#}', correct: true },
          { text: '{n:B}', why: 'That is the harmonic over fret 12 or fret 5.' },
          { text: '{n:E}', why: 'That is the fretted note at fret 5 of string 2.' },
        ],
        explain: 'Over fret 7 the harmonic is an octave and a fifth above the open string: {n:B} to {n:F#}.',
      },
    },
    playerTask({
      id: 'harmonics-melody',
      title: 'Harmonics Melody at 60 BPM',
      song: 'st-lick-harmonics',
      minutes: 3,
      body: 'A bell tune on strings 4, 3 and 2 at 60 {t:bpm|BPM}, only natural harmonics over frets 12, 7 and 5. Let every note ring into the next.',
    }),
    {
      type: 'card',
      title: 'Artificial and pinch harmonics',
      body: 'An {t:artificial-harmonic|artificial harmonic} sounds twelve frets above any fretted note: fret string 5 fret 3 ({n:C}), touch over fret 15 with the picking index, pluck behind it with the ring finger. A {t:pinch-harmonic|pinch harmonic} is the squeal when the edge of the thumb brushes the string just after the pick.',
      figure: {
        kind: 'fretboard',
        frets: [3, 15],
        dots: [
          { string: 5, fret: 3, note: 'C3', role: 'root' },
          { string: 5, fret: 15, label: 'T', role: 'target' },
        ],
        caption: 'Fret 3 held; the picking hand touches over fret 15 (T).',
      },
    },
    {
      type: 'choice',
      prompt: 'You fret string 4 fret 2 ({n:E}). Where does the picking hand touch?',
      options: [
        { text: 'Over fret 14', correct: true },
        { text: 'Over fret 12', why: 'Twelve frets above the open string. The fretted note is the new open string.' },
        { text: 'Over fret 7', why: 'Only five frets above the fretted note: a different, fainter harmonic.' },
      ],
      explain: 'Twelve frets above the fretted note: 2 + 12 = 14. The harmonic is the octave of {n:E}.',
      fact: 'artificial-harmonic',
    },
    techniqueTask({
      id: 'artificial-then-pinch',
      title: 'Artificial, then pinch harmonics',
      exercise: 'tech-artificial-harmonics',
      minutes: 5,
      body: 'Artificial (Harp) Harmonics: the plain note, then its harmonic, on {n:C} and {n:E}; then the harp pattern. After that, open Pinch Harmonics: string 3 fret 7 ({n:D}), a little overdrive, and hunt for the squeal.',
      tip: 'Each picking spot gives a pinch harmonic a different overtone. There is no single right pitch; there is a right sound.',
    }),
    {
      type: 'true-false',
      statement: 'A pinch harmonic gives the same pitch wherever you pick the string.',
      answer: false,
      explain: 'Each picking point brings out a different overtone. Move the pick toward or away from the neck and the squeal changes pitch.',
      fact: 'pinch-harmonic',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each harmonic with what it sounds.',
      pairs: [
        { left: 'Over fret 12', right: 'An octave up' },
        { left: 'Over fret 7', right: 'An octave and a fifth up' },
        { left: 'Over fret 5', right: 'Two octaves up' },
        { left: 'Artificial', right: 'Octave of the fretted note' },
      ],
      explain: 'Natural harmonics are measured from the open string: an octave, an octave and a fifth, two octaves. An artificial harmonic is the octave of whatever note you fret.',
      fact: 'harmonic-points',
    },
  ],
  facts: [
    { id: 'harmonic-points', front: 'Natural harmonics over frets 12, 7 and 5 sound what?', back: 'An octave, an octave and a fifth, and two octaves above the open string.' },
    { id: 'artificial-harmonic', front: 'Where is an artificial harmonic made?', back: 'Twelve frets above the fretted note, touched by the picking index and plucked behind it.' },
    { id: 'pinch-harmonic', front: 'What makes a pinch harmonic?', back: 'The edge of the picking thumb brushing the string just after the pick. Each picking spot gives a different overtone.' },
  ],
};

// ── 5. Wide bends, in tune ──────────────────────────────────────────────────────────────────────

const wideBends: TeacherLesson = {
  id: 'wide-bends',
  title: 'Wide bends, in tune',
  teaches: 'Hear the target first, then bend a step and a half to it with three fingers and the wrist, hold, and release.',
  minutes: 5,
  skill: 'teacher:elena:wide-bends',
  steps: [
    {
      type: 'card',
      title: 'Three frets\' worth',
      body: 'A step-and-a-half bend, three frets\' worth, needs all three fingers, a turning wrist and a confident push. Hear the target, string 2 fret 8 ({n:G}), before you bend up to it from string 2 fret 5 ({n:E}). Hold it, add a narrow vibrato at the top, and release in time.',
      figure: {
        kind: 'staff',
        notes: [
          { note: 'E4', duration: 'q', label: 'pick' },
          { note: 'G4', duration: 'q', label: 'bend' },
          { note: 'G4', duration: 'q', label: 'vib.' },
          { note: 'E4', duration: 'q', label: 'release' },
        ],
        caption: 'The pitch line: pick, bend up, vibrato at the top, release in time.',
      },
    },
    {
      type: 'choice',
      prompt: 'From string 2 fret 5 ({n:E}), a step-and-a-half bend reaches which note?',
      options: [
        { text: '{n:G}, the pitch of fret 8', correct: true },
        { text: '{n:F#}, the pitch of fret 7', why: 'That is a whole-step bend: two frets.' },
        { text: '{n:G#}, the pitch of fret 9', why: 'That is two whole steps: four frets\' worth.' },
      ],
      explain: 'A step and a half is three half steps: {n:E} to {n:F} to {n:F#} to {n:G}. Fret 8 is your target, and you play it first.',
      fact: 'bend-step-and-a-half',
    },
    {
      type: 'listen-choice',
      prompt: 'The target {n:G}, then a bend aimed at it. Did the bend arrive?',
      sound: { kind: 'notes', notes: ['G4', 'F#4'], tempo: 60 },
      options: [{ text: 'In tune' }, { text: 'Short: flat of the target', correct: true }, { text: 'Past it: sharp' }],
      shuffle: false,
      explain: 'The second note was a half step low: {n:F#}, not {n:G}. Wide bends fall short far more often than they overshoot. Push on, with the wrist.',
    },
    {
      type: 'card',
      title: 'Hold, then let go in time',
      body: 'At the top, hold the pitch, then add a narrow, even vibrato that always comes back to the target. Release in time, back to {n:E}, as part of the phrase. Nobody is impressed by a wide bend that misses.',
      tip: 'Turn the wrist as if turning a door handle; the fingers alone tire and fall flat. Sharp pain in a finger or wrist: stop.',
    },
    {
      type: 'play-note',
      prompt: 'First the target: string 2 fret 8, fretted. Fix it in your ear.',
      note: 'G4',
      octave: 'exact',
      where: { string: 2, fret: 8 },
      explain: 'String 2 fret 8 is {n:G}. Sing it, then bend to that pitch, not to where you hope it is.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap the target of the bend: {n:G} on string 2.',
        find: { note: 'G4' },
        mode: 'one',
        octave: 'exact',
        frets: [5, 9],
        explain: 'String 2 fret 8 is {n:G}: three frets above the {n:E} you bend from.',
      },
    },
    {
      type: 'play-note',
      prompt: 'Now bend string 2 fret 5 ({n:E}) up to that {n:G} and hold it.',
      note: 'G4',
      octave: 'exact',
      toleranceCents: 25,
      explain: 'The microphone hears only the pitch you arrive at: {n:G}, or not. Short? Push from the wrist with fingers 1 and 2 behind finger 3.',
      alternative: {
        type: 'listen-choice',
        prompt: 'The target, then a bend. In tune, or short?',
        sound: { kind: 'notes', notes: ['G4', 'G4'], tempo: 60 },
        options: [{ text: 'In tune', correct: true }, { text: 'Short: flat of the target' }],
        shuffle: false,
        explain: 'Both notes were {n:G}: the bend arrived. On the guitar, alternate the target and the bend and compare them the same way.',
      },
    },
    techniqueTask({
      id: 'bend-minor-third',
      title: 'Step-and-a-Half Bend',
      exercise: 'tech-bend-minor-third',
      minutes: 3,
      body: 'The target first, then the bend, hold, release. With the microphone on, Technique measures where the bend lands; within 10 cents of the target passes. Without it, alternate target and bend and compare by ear until they match.',
    }),
    {
      type: 'true-false',
      statement: 'If a wide bend falls short, a fast vibrato will hide it.',
      answer: false,
      explain: 'Vibrato on a flat note is a flat note that wobbles. Arrive first, then add vibrato around the target.',
    },
    techniqueTask({
      id: 'vibrato-bend',
      title: 'Vibrato on top of a bend',
      exercise: 'tech-vibrato-bend',
      minutes: 3,
      body: 'Bending Vibrato in Time as written: 2, then 3, then 4 waves per beat on string 2 fret 8. Then bend that {n:G} a whole step to {n:A} and add the same narrow vibrato at the top, still in time.',
    }),
    {
      type: 'choice',
      prompt: 'Bend string 3 fret 7 ({n:D}) a whole step. Which note do you aim for?',
      options: [
        { text: '{n:E}', correct: true },
        { text: '{n:D#}', why: 'A half step: one fret\'s worth.' },
        { text: '{n:F}', why: 'A step and a half: three frets\' worth.' },
      ],
      explain: 'A whole step is two frets: string 3 fret 9, {n:E}. Play fret 9 first to hear it.',
    },
    toolTask({
      id: 'slow-blues-bends',
      title: 'Slow blues: every phrase on a bend',
      tool: 'progressions',
      params: ['blues-slow-12-8', 'a', 'jam'],
      minutes: 4,
      body: 'Jam on the slow 12/8 blues in {n:A} at 56 {t:bpm|BPM}. One chorus in which every phrase ends on an in-tune bend: string 3 fret 7 up a whole step to {n:E}, or string 2 fret 5 up a step and a half to {n:G}.',
      tip: 'Leave space after each bend. In a slow blues, the silence is part of the line.',
    }),
    {
      type: 'fretboard-find',
      prompt: 'Before you bend string 2 fret 5 a step and a half, find the target on the same string.',
      find: { interval: 'm3', from: { string: 2, fret: 5 } },
      mode: 'one',
      octave: 'exact',
      frets: [4, 9],
      strings: [2],
      shown: [{ string: 2, fret: 5, label: 'R' }],
      explain: 'A minor third above {n:E} is {n:G}, at fret 8: three frets, a step and a half.',
      fact: 'bend-step-and-a-half',
    },
  ],
  facts: [
    { id: 'bend-step-and-a-half', front: 'A step-and-a-half bend from string 2 fret 5 ({n:E}) must reach what?', back: '{n:G}, the pitch of string 2 fret 8: three frets\' worth.' },
    { id: 'bend-target-first', front: 'How do you make a wide bend land in tune?', back: 'Play and hear the target first, bend with three fingers and the wrist, hold, add vibrato at the top, release in time.' },
  ],
};

// ── 6. Slide guitar in open G ───────────────────────────────────────────────────────────────────

const OPEN_G_STRINGS = [
  { string: 6, fret: 0, note: 'D2' },
  { string: 5, fret: 0, note: 'G2' },
  { string: 4, fret: 0, note: 'D3' },
  { string: 3, fret: 0, note: 'G3' },
  { string: 2, fret: 0, note: 'B3' },
  { string: 1, fret: 0, note: 'D4' },
];

/** Notes on every string at frets 5, 7 and 12 in open G: the C, D and G chords. */
const OPEN_G_CHORD_DOTS = [
  ...(['G', 'C', 'G', 'C', 'E', 'G'] as const).map((note, i) => ({ string: 6 - i, fret: 5, note, role: note === 'C' ? ('root' as const) : ('tone' as const) })),
  ...(['A', 'D', 'A', 'D', 'F#', 'A'] as const).map((note, i) => ({ string: 6 - i, fret: 7, note, role: note === 'D' ? ('root' as const) : ('tone' as const) })),
  ...(['D', 'G', 'D', 'G', 'B', 'D'] as const).map((note, i) => ({ string: 6 - i, fret: 12, note, role: note === 'G' ? ('root' as const) : ('tone' as const) })),
];

const slideInOpenG: TeacherLesson = {
  id: 'slide-in-open-g',
  title: 'Slide guitar in open G',
  teaches: 'In open G (D G D G B D) a slide laid over one fret wire plays a chord: G at 12, C at 5, D at 7.',
  minutes: 5,
  skill: 'teacher:elena:slide-in-open-g',
  steps: [
    {
      type: 'card',
      title: 'Over the wire, lightly',
      body: 'With a {t:bottleneck} on finger 3 or 4 there are no frets: you place every note yourself. Touch the strings lightly, directly over the fret wire, not between frets, and mute behind the slide with the fingers trailing it. We start in standard tuning.',
      tip: 'Press down and the strings buzz against the frets. The slide only rests on them.',
    },
    {
      type: 'play-note',
      prompt: 'Standard tuning. With the slide, play string 1 at fret 12, right over the wire.',
      note: 'E5',
      octave: 'exact',
      where: { string: 1, fret: 12 },
      explain: 'String 1 at fret 12 is {n:E}, an octave above the open string. Over the wire it is in tune; between frets 11 and 12 it is flat.',
      alternative: {
        type: 'choice',
        prompt: 'Where does the slide sit for fret 12?',
        options: [
          { text: 'Directly over the fret wire', correct: true },
          { text: 'Between frets 11 and 12', why: 'That is where a finger presses. A slide there sounds flat.' },
          { text: 'Between frets 12 and 13', why: 'Past the wire, the note is sharp.' },
        ],
        explain: 'The slide itself is the fret, so it goes exactly where the wire is.',
      },
    },
    techniqueTask({
      id: 'slide-intonation',
      title: 'Slide intonation, standard tuning',
      exercise: 'tech-slide-bottleneck',
      minutes: 4,
      body: 'Still in standard tuning: on string 1, each target fretted first, then with the slide over frets 12, 10, 7 and 5. A microphone take reports how many cents off the slide notes were, and the worst one.',
    }),
    {
      type: 'card',
      title: 'Open G',
      body: '{t:open-g|Open G} is {n:D} {n:G} {n:D} {n:G} {n:B} {n:D} from string 6 to string 1. Strum the open strings and you hear a {c:G} chord. From standard tuning, strings 6, 5 and 1 go down a whole step: {n:E} to {n:D}, {n:A} to {n:G}, {n:E} to {n:D}.',
      figure: { kind: 'fretboard', tuning: 'open-g', frets: [0, 3], dots: OPEN_G_STRINGS, caption: 'Open G: D G D G B D, string 6 to string 1.' },
    },
    { generate: 'open-strings', params: { ask: 'order', tuning: 'open-g' } },
    toolTask({
      id: 'retune-open-g',
      title: 'Retune to open G',
      tool: 'tuner',
      minutes: 3,
      body: 'In the Tuner, choose Open G from the tunings. Bring strings 6, 5 and 1 down a whole step, finishing each by tuning up to the note. Then strum the open strings: a {c:G} chord.',
      tip: 'After a retune the neck settles and the strings drift. Check all six again after five minutes.',
    }),
    {
      type: 'card',
      title: 'Chords at one fret',
      body: 'Because the open strings make a chord, the slide plays whole chords lying across all six strings at one fret: {c:G} at fret 12, {c:C} at fret 5 and {c:D} at fret 7. The three chords of a blues in {n:G}, at three fret wires.',
      figure: { kind: 'fretboard', tuning: 'open-g', frets: [5, 12], dots: OPEN_G_CHORD_DOTS, caption: 'Open G: fret 5 is C, fret 7 is D, fret 12 is G.' },
    },
    {
      type: 'choice',
      prompt: 'In open G, at which fret do all six strings make a {c:D} chord?',
      options: [{ text: 'Fret 7', correct: true }, { text: 'Fret 5', why: 'Fret 5 is {c:C}.' }, { text: 'Fret 12', why: 'Fret 12 is {c:G}, the open chord an octave up.' }, { text: 'Fret 2', why: 'Fret 2 gives {c:A}: {n:E} {n:A} {n:E} {n:A} {n:C#} {n:E}.' }],
      explain: 'Seven frets above {c:G} is {c:D}: {n:A} {n:D} {n:A} {n:D} {n:F#} {n:A} at fret 7.',
      fact: 'open-g-chords',
    },
    {
      type: 'play-phrase',
      prompt: 'Open G, with the slide: strings 3, 2, 1 at fret 12, then at 5, then at 7.',
      notes: [...OPEN_G_CHORDS],
      octave: 'exact',
      tempo: 60,
      tuning: 'open-g',
      explain: 'Fret 12: {n:G} {n:B} {n:D}. Fret 5: {n:C} {n:E} {n:G}. Fret 7: {n:D} {n:F#} {n:A}. Each note in tune only when the slide sits right over the wire.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'In open G, tap the {c:C} chord on strings 3, 2 and 1.',
        find: { chord: 'C' },
        mode: 'all',
        octave: 'any',
        frets: [4, 6],
        strings: [3, 2, 1],
        tuning: 'open-g',
        explain: 'All at fret 5: {n:C} on string 3, {n:E} on string 2, {n:G} on string 1.',
      },
    },
    playerTask({
      id: 'slide-blues',
      title: 'Open G Slide Blues',
      song: 'st-open-g-slide',
      mode: 'wait',
      minutes: 6,
      body: 'Still in open G. First in wait mode, phrase by phrase; then in listen mode at 83 % (60 {t:bpm|BPM}). Every fret number is a fret in open G.',
    }),
    toolTask({
      id: 'back-to-standard',
      title: 'Back to standard tuning',
      tool: 'tuner',
      minutes: 2,
      body: 'When you finish, choose Standard in the Tuner and bring strings 6, 5 and 1 back up a whole step: {n:D} to {n:E}, {n:G} to {n:A}, {n:D} to {n:E}.',
    }),
    {
      type: 'match-pairs',
      prompt: 'In open G, match each fret with the chord the slide plays there.',
      pairs: [
        { left: 'Fret 12', right: '{c:G}' },
        { left: 'Fret 5', right: '{c:C}' },
        { left: 'Fret 7', right: '{c:D}' },
      ],
      explain: '{c:G}, {c:C} and {c:D}: the {r:I}, {r:IV} and {r:V} of a blues in {n:G}, each at one fret wire.',
      fact: 'open-g-chords',
    },
  ],
  facts: [
    { id: 'open-g-tuning', front: 'Open G tuning, string 6 to string 1?', back: '{n:D} {n:G} {n:D} {n:G} {n:B} {n:D}: strings 6, 5 and 1 down a whole step from standard.' },
    { id: 'open-g-chords', front: 'In open G, which chords lie across all six strings at frets 5, 7 and 12?', back: '{c:C} at fret 5, {c:D} at fret 7, {c:G} at fret 12.' },
    { id: 'slide-over-wire', front: 'Where does a slide touch the strings?', back: 'Lightly, directly over the fret wire, never between frets; trailing fingers mute behind it.' },
  ],
};

/** Unit 4 of Prof. Varga's course. */
const unit: TeacherUnit = {
  id: 'elena-legato-and-tapping',
  title: 'Legato, tapping and harmonics',
  theme: 'technique',
  description: 'Fluid legato, tapping with the picking hand, every kind of harmonic, wide bends in tune, and slide in open G.',
  lessons: [threeNpsLegato, hammerFromNowhere, tapping, harmonics, wideBends, slideInOpenG],
  checkpoint: { sample: 8, maxMistakes: 2 },
  glossary: [
    { id: 'legato', term: 'legato', definition: 'Notes joined smoothly, sounded by the fretting hand (hammer-ons, pull-offs) rather than by a new pick stroke for each.' },
    { id: 'three-notes-per-string', term: 'three notes per string', definition: 'A scale fingering with three notes on every string, so every string takes the same picking: built for fast, even runs.' },
    { id: 'hammer-on', term: 'hammer-on', definition: 'Sounding a note by bringing a fretting finger down fast on the string, without picking it.' },
    { id: 'pull-off', term: 'pull-off', definition: 'Sounding a lower note by pulling a fretting finger slightly sideways off the string, so it plucks as it leaves.' },
    { id: 'tapping', term: 'tapping', definition: 'Fretting a note with a finger of the picking hand, usually followed by a pull-off to a fretting finger.' },
    { id: 'harmonic', term: 'harmonic', definition: 'A bell-like note made by touching a string lightly at a point (over fret 12, 7 or 5) instead of pressing it down.' },
    { id: 'artificial-harmonic', term: 'artificial harmonic', definition: 'A harmonic twelve frets above a fretted note, touched and plucked by the picking hand.' },
    { id: 'pinch-harmonic', term: 'pinch harmonic', definition: 'A squealing overtone made when the edge of the picking thumb brushes the string just after the pick.' },
    { id: 'bottleneck', term: 'bottleneck', definition: 'A glass or metal slide worn on a finger and laid across the strings over a fret wire instead of fretting.' },
    { id: 'open-g', term: 'open G', definition: 'A tuning, D G D G B D from string 6 to string 1, in which the open strings sound a G chord.' },
  ],
};

export default unit;
