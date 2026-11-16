/**
 * Theory Path, unit 17: Rhythm: triplets, swing and syncopation. Written from the syllabus entries
 * in `src/content/plan/theory-path.json` (unit `triplets-swing-syncopation`), one lesson per entry,
 * in order: each lesson opens with its "on the guitar" picture, asks the planned exercises, ends
 * with the planned drills, and turns every planned fact into a review card.
 *
 * `triplets-swing-syncopation.test.ts` cross-checks every rhythm against the theory engine's note
 * values (bar lengths, the 2:1 swing ratio, where each tap and count falls), the shuffle frets, the
 * strumming pattern, the tempo words and what each listening question plays.
 *
 * Notes for readers of the code:
 * - A lesson `Sound` plays straight time and has no swing setting, so swung eighths are written
 *   exactly as they sound: a triplet quarter and a triplet eighth (`qt et`), the 2:1 the lesson
 *   teaches. Ritardando and accelerando are played by notes whose spacing grows or shrinks step by
 *   step, since a sound has one tempo.
 * - A tab phrase plays one note at a time, so the shuffle's two-string pattern cannot sound as
 *   pairs: the audio and the play step use its moving line on string 4 (the 5 and 6), and the text
 *   says to add the open string under every note. The shape itself is drawn on a fretboard.
 * - Rhythm pictures cannot draw a swing sign or tempo words: the words are given in the text.
 * - Rhythms offered as answer options are written in 2/4: a phone shows about two beats of an
 *   option, and the beat that tells them apart must be in view.
 * - Every idea is also asked as a quiet question, so the unit still teaches with Sound off.
 * - `teaches` is shown as plain text on the map, so it carries no music symbols.
 */
import type { Lesson, TabNote, Unit } from '@/lessons';

const U = 'triplets-swing-syncopation';

/** Beat 1 in eighths, beat 2 in triplets, twice: the triplet lesson's picture. */
const EIGHTS_THEN_TRIPLETS = 'e e et et et e e et et et';
/** Two beats of triplets, then two quarters (the planned tap). */
const TRIPLET_TAP = 'et et et et et et q q';
/** One bar of swung eighths, written as it sounds: triplet quarter + triplet eighth on each beat. */
const SWUNG = 'qt et qt et qt et qt et';
/** The common syncopated strum: 1, 2 &, (3 tied), & of 3, 4 &. */
const SYNCOPATED = 'q e e ~e e e e';
/** One beat each of "1 & a", "2 e &", "3 e a", then a quarter on 4. */
const SIXTEENTH_FIGURES = 'e s s s s e s e s q';

/** Notes on one string in a rhythm, for audio: every duration code of `pattern` on string/fret. */
const onString = (string: number, frets: number[], durations: string[]): TabNote[] => durations.map((duration, i) => ({ string, fret: frets[i % frets.length], duration }));

/** C and D on string 2 (frets 1 and 3), straight, then the same swung. */
const STRAIGHT_THEN_SWUNG: TabNote[] = [
  ...onString(2, [1, 3], ['e', 'e', 'e', 'e', 'e', 'e', 'e', 'e']),
  { rest: true, duration: 'h' },
  ...onString(2, [1, 3], ['qt', 'et', 'qt', 'et', 'qt', 'et', 'qt', 'et']),
];
/** The same two notes, swung, twice through: the swing lesson's listening question. */
const SWUNG_PHRASE: TabNote[] = onString(2, [1, 3], ['qt', 'et', 'qt', 'et', 'qt', 'et', 'qt', 'et', 'qt', 'et', 'qt', 'et', 'qt', 'et', 'qt', 'et']);

/** The moving line of the A shuffle on string 4 (the 5 twice, the 6 twice), swung, two bars. */
const A_SHUFFLE_LINE: TabNote[] = onString(4, [2, 2, 4, 4], ['qt', 'et', 'qt', 'et', 'qt', 'et', 'qt', 'et', 'qt', 'et', 'qt', 'et', 'qt', 'et', 'qt', 'et']);
/** The D shuffle's moving line on string 3, played straight: the listening question's answer is "straight". */
const D_LINE_STRAIGHT: TabNote[] = onString(3, [2, 2, 4, 4], ['e', 'e', 'e', 'e', 'e', 'e', 'e', 'e', 'e', 'e', 'e', 'e', 'e', 'e', 'e', 'e']);
/** What the learner plays: the A shuffle's moving line once (frets 2 2 4 4), long-short. */
const A_SHUFFLE_PLAY: TabNote[] = onString(4, [2, 2, 4, 4], ['qt', 'et', 'qt', 'et']);

/** The tempo-words line on strings 1 and 2 (an original phrase): B C D E | F E D C | B D C. */
const ANDANTE_LINE = ['B3', 'C4', 'D4', 'E4', 'F4', 'E4', 'D4', 'C4', 'B3', 'D4', 'C4'];
/** Where each note of the line is played: string 2 frets 0 1 3, string 1 frets 0 1. */
const LINE_FRETS: Record<string, [number, number]> = { B3: [2, 0], C4: [2, 1], D4: [2, 3], E4: [1, 0], F4: [1, 1] };
const linePhrase = (durations: string[]): TabNote[] =>
  ANDANTE_LINE.map((n, i) => ({ string: LINE_FRETS[n][0], fret: LINE_FRETS[n][1], duration: durations[i] }));
/** The line slowing down: even eighths, then each gap longer than the one before. */
const RIT_LINE: TabNote[] = linePhrase(['e', 'e', 'e', 'e', 'e', 'e', 'e.', 'q', 'ht', 'q.', 'h']);
/** The line speeding up: each gap shorter than the one before, then even eighths. */
const ACCEL_LINE: TabNote[] = linePhrase(['h', 'q.', 'ht', 'q', 'e.', 'e', 'e', 'e', 'e', 'e', 'h']);

const triplets: Lesson = {
  id: 'triplets',
  title: 'Triplets',
  teaches: 'A triplet fits three notes into the time normally taken by two of the same kind.',
  minutes: 3,
  skill: `theory:${U}:triplets`,
  steps: [
    {
      type: 'card',
      title: 'Three in the time of two',
      body: 'A {t:triplet} squeezes **three** notes into the time normally taken by **two** of the same kind. Two eighth notes fill one beat; so do three triplet eighths. A triplet is written with a small 3 over the group.',
      figure: { kind: 'rhythm', pattern: EIGHTS_THEN_TRIPLETS, tempo: 70, caption: 'Two eighths on beat 1, a triplet on beat 2: three notes in the same time.' },
    },
    {
      type: 'choice',
      prompt: 'How many eighth-note triplets fill one quarter-note beat?',
      options: [
        { text: '2', why: 'Two ordinary eighth notes fill a beat. A triplet squeezes in one more.' },
        { text: '3', correct: true },
        { text: '4', why: 'Four to a beat are sixteenth notes.' },
        { text: '6' },
      ],
      shuffle: false,
      explain: 'Three triplet eighths last one beat: the time of two ordinary eighth notes.',
      fact: 'triplets-beat-of-three',
    },
    {
      type: 'card',
      title: 'Count 1-trip-let',
      body: 'Count triplets **1-trip-let, 2-trip-let**, with the number on the beat. Pick the open high {n:E} string at 70 {t:bpm|BPM}: two eighths on beat 1, a triplet on beat 2, and so on. Keep each group of three perfectly even.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: onString(1, [0], EIGHTS_THEN_TRIPLETS.split(' ')), tempo: 70 }, label: 'Hear eighths, then triplets' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Count two beats of triplets.',
      text: '1  trip  let  2  ___  let',
      blanks: ['trip'],
      bank: ['&', 'e'],
      explain: 'Each beat counts 1-trip-let: the number falls on the beat, and trip and let share the rest of it evenly.',
      fact: 'triplets-marking-counting',
    },
    {
      type: 'true-false',
      statement: 'Three eighth-note triplets last as long as two ordinary eighth notes.',
      answer: true,
      explain: 'That is what a triplet is: three notes in the time normally taken by two of the same kind. Both fill one beat.',
      fact: 'triplets-three-in-two',
    },
    {
      type: 'listen-choice',
      prompt: 'A quarter note marks each beat, then the beat is split. Eighth notes or triplets?',
      sound: { kind: 'rhythm', pattern: 'q et et et q et et et', tempo: 70 },
      options: [{ text: 'Eighth notes: two per beat' }, { text: 'Triplets: three per beat', correct: true }],
      shuffle: false,
      explain: 'After each quarter note, three even clicks filled the next beat: 1-trip-let. That is a triplet.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each kind of note with how many fill one beat.',
      pairs: [
        { left: 'Quarter notes', right: '1 per beat' },
        { left: 'Eighth notes', right: '2 per beat' },
        { left: 'Triplet eighths', right: '3 per beat' },
        { left: 'Sixteenth notes', right: '4 per beat' },
      ],
      explain: 'One quarter, two eighths, three triplet eighths or four sixteenths: each fills one beat of 4/4.',
      fact: 'triplets-beat-of-three',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap one bar: two beats of triplets, then two quarter notes.',
      rhythm: { pattern: TRIPLET_TAP },
      tempo: 70,
      show: 'both',
      explain: 'Three even taps on beat 1 and three on beat 2 (1-trip-let, 2-trip-let), then one on 3 and one on 4.',
    },
  ],
  facts: [
    { id: 'triplets-three-in-two', front: 'What is a triplet?', back: 'Three notes played evenly in the time normally taken by two of the same kind.' },
    {
      id: 'triplets-beat-of-three',
      front: 'How many eighth-note triplets last one quarter-note beat?',
      back: 'Three: the time of two ordinary eighth notes.',
      ask: {
        type: 'choice',
        prompt: 'How many eighth-note triplets fill one quarter-note beat?',
        options: [{ text: '2' }, { text: '3', correct: true }, { text: '4' }],
        shuffle: false,
        explain: 'Three triplet eighths fill one beat, in the time of two ordinary eighth notes.',
      },
    },
    {
      id: 'triplets-marking-counting',
      front: 'How are triplets written, and how can you count them?',
      back: 'With a 3 over the group. Count them "1-trip-let, 2-trip-let", with the number on the beat.',
    },
  ],
};

const swing: Lesson = {
  id: 'swing',
  title: 'Swing feel',
  teaches: 'In swing, pairs of eighth notes are played long-short, close to the first and last notes of a triplet.',
  minutes: 3,
  skill: `theory:${U}:swing`,
  steps: [
    {
      type: 'card',
      title: 'Long, short, long, short',
      body: 'In {t:swing}, each pair of eighth notes is played **long-short** instead of evenly. The first note takes about two thirds of the beat and the second one third: like the first and last notes of a triplet.',
      figure: { kind: 'rhythm', pattern: SWUNG, tempo: 90, caption: 'What swung eighths sound like: a triplet quarter, then a triplet eighth.' },
    },
    {
      type: 'true-false',
      statement: 'In swing, pairs of eighth notes are played evenly.',
      answer: false,
      explain: 'Swing plays them long-short: the first of each pair lasts about twice as long as the second.',
      fact: 'triplets-swing-long-short',
    },
    {
      type: 'card',
      title: 'Hear both',
      body: 'Play string 2 at frets 1 and 3, {n:C} and {n:D}, back and forth at 90 BPM. First straight: even eighths. Then swung: long-short, long-short. Listen for the lilt.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: STRAIGHT_THEN_SWUNG, tempo: 90 }, label: 'Hear straight, then swung' },
    },
    {
      type: 'listen-choice',
      prompt: 'Straight or swung eighth notes?',
      sound: { kind: 'tab', notes: SWUNG_PHRASE, tempo: 90 },
      options: [{ text: 'Straight: even' }, { text: 'Swung: long-short', correct: true }],
      shuffle: false,
      explain: 'Each pair went long-short, with the second note late in the beat: swung eighths.',
    },
    {
      type: 'choice',
      prompt: 'In a swung pair of eighth notes, how do the two lengths compare?',
      options: [
        { text: 'The first is about twice as long', correct: true },
        { text: 'They are exactly equal', why: 'Equal eighths are straight, not swung.' },
        { text: 'The second is about twice as long', why: 'Swing is long-short, not short-long.' },
      ],
      shuffle: false,
      explain: 'About 2:1. The first note lasts like a triplet quarter note, two thirds of the beat; the second like a triplet eighth, one third.',
      fact: 'triplets-swing-ratio',
    },
    {
      type: 'choice',
      prompt: 'Which rhythm shows how swung eighths sound?',
      options: [
        { figure: { kind: 'rhythm', pattern: 'qt et qt et', time: '2/4' }, correct: true },
        { figure: { kind: 'rhythm', pattern: 'et qt et qt', time: '2/4' }, why: 'That is short-long. Swing is long-short.' },
        { figure: { kind: 'rhythm', pattern: 'e e e e', time: '2/4' }, why: 'Those are straight eighths: how swing is written, not how it sounds.' },
      ],
      explain: 'Each beat holds a triplet quarter and a triplet eighth: two thirds of the beat, then one third.',
      fact: 'triplets-swing-ratio',
    },
    {
      type: 'card',
      title: 'How swing is written',
      body: 'Swing is usually written as ordinary eighth notes, with the word **Swing** at the top of the music, or a small sign showing that two eighths mean a triplet quarter and eighth. You read even eighths and play them long-short.',
      figure: { kind: 'rhythm', pattern: 'e e e e e e e e', tempo: 90, caption: 'Written like this and marked Swing: play each pair long-short.' },
    },
    {
      type: 'choice',
      prompt: 'A chart marked "Swing" shows plain eighth notes. How do you play them?',
      options: [
        { text: 'Long-short, in pairs', correct: true },
        { text: 'Evenly, as written', why: 'The word Swing tells you to play each pair long-short.' },
        { text: 'Twice as fast', why: 'Swing changes the feel of each pair, not the speed.' },
      ],
      shuffle: false,
      explain: 'Swing is written as plain eighths; the marking at the top tells you to play each pair long-short.',
      fact: 'triplets-swing-written',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap one bar of swung eighth notes: long-short, long-short.',
      rhythm: { pattern: SWUNG },
      tempo: 90,
      show: 'both',
      explain: 'Tap on each beat and again on the "let" of 1-trip-let: the short note falls in the last third of the beat.',
    },
  ],
  facts: [
    { id: 'triplets-swing-long-short', front: 'How are eighth notes played in swing?', back: 'In pairs, long-short instead of evenly.' },
    { id: 'triplets-swing-ratio', front: 'What is a swung pair of eighth notes close to?', back: 'A triplet quarter note then a triplet eighth note: a ratio of about 2:1.' },
    {
      id: 'triplets-swing-written',
      front: 'How is swing usually written?',
      back: 'As ordinary eighth notes, with "Swing" (or a swing sign) at the top of the music.',
    },
  ],
};

const theShuffle: Lesson = {
  id: 'the-shuffle',
  title: 'The shuffle',
  teaches: 'A shuffle is a swung groove for a whole song, often played on two strings as root-fifth, root-sixth.',
  minutes: 3,
  skill: `theory:${U}:the-shuffle`,
  steps: [
    {
      type: 'card',
      title: 'A swung groove',
      body: 'A {t:shuffle} is swing kept up as the groove of a whole song, as in blues and boogie. The classic guitar shuffle in {n:A}: strike the open {n:A} string together with string 4, at fret 2 twice, then fret 4 twice. Fret 2 is the 5th, {n:E}; fret 4 is the 6th, {n:F#}.',
      figure: {
        kind: 'fretboard',
        frets: [0, 5],
        root: 'A',
        labels: 'degree',
        dots: [
          { string: 5, fret: 0, note: 'A', degree: '1', role: 'root' },
          { string: 4, fret: 2, note: 'E', degree: '5', role: 'fifth' },
          { string: 4, fret: 4, note: 'F#', degree: '6', role: 'target' },
        ],
        caption: 'String 5 open, with string 4 at fret 2 (the 5) or fret 4 (the 6).',
      },
    },
    {
      type: 'card',
      title: 'Hear the moving line',
      body: 'Each pair is struck long-short, like swung eighths: {c:A5}, {c:A5}, then the 6, twice. You hear the moving notes on string 4 here; on the guitar, let the open {n:A} sound with every one.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: A_SHUFFLE_LINE, tempo: 100 }, label: 'Hear the shuffle line' },
    },
    {
      type: 'play-phrase',
      prompt: 'Play the shuffle\'s moving line on string 4: frets 2, 2, 4, 4, long-short.',
      notes: A_SHUFFLE_PLAY,
      octave: 'exact',
      tempo: 90,
      explain: 'Fret 2 is {n:E}, the 5th of {n:A}; fret 4 is {n:F#}, the 6th. Now add the open {n:A} string to every note: that is the shuffle.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'The open {n:A} string is the root. Tap the 6th of the shuffle on string 4.',
        find: { interval: 'M6', from: { string: 5, fret: 0 } },
        mode: 'one',
        octave: 'exact',
        frets: [0, 5],
        strings: [4],
        shown: [{ string: 5, fret: 0, note: 'A', role: 'root' }],
        explain: 'String 4, fret 4 is {n:F#}, a major 6th above the open {n:A}. Fret 2, {n:E}, is the 5th.',
      },
    },
    {
      type: 'true-false',
      statement: 'A shuffle is a swung rhythm kept up through a whole song.',
      answer: true,
      explain: 'A shuffle is swing used as the groove of a song, long-short all the way through, as in blues and boogie.',
      fact: 'triplets-shuffle-meaning',
    },
    {
      type: 'listen-choice',
      prompt: 'The same kind of line, on string 3. Is this groove a shuffle, or straight eighths?',
      sound: { kind: 'tab', notes: D_LINE_STRAIGHT, tempo: 100 },
      options: [{ text: 'A shuffle: long-short' }, { text: 'Straight eighths: even', correct: true }],
      shuffle: false,
      explain: 'Every note was the same length, so it was straight. A shuffle plays each pair long-short.',
    },
    {
      type: 'card',
      title: 'Move it to D and E',
      body: 'The same shape moves across the strings. For {n:D}: the open string 4 with string 3 at frets 2 and 4. For {n:E}: the open string 6 with string 5 at frets 2 and 4. With the {n:A} shuffle, that is all three chords of a blues.',
      figure: {
        kind: 'fretboard',
        frets: [0, 5],
        root: 'E',
        labels: 'degree',
        dots: [
          { string: 6, fret: 0, note: 'E', degree: '1', role: 'root' },
          { string: 5, fret: 2, note: 'B', degree: '5', role: 'fifth' },
          { string: 5, fret: 4, note: 'C#', degree: '6', role: 'target' },
        ],
        caption: 'The {n:E} shuffle: string 6 open, string 5 at fret 2 (the 5) or 4 (the 6).',
      },
    },
    {
      type: 'fretboard-find',
      prompt: 'For {n:E}, string 6 rings open. Tap the other note of the "6" shape, on string 5.',
      find: { interval: 'M6', from: { string: 6, fret: 0 } },
      mode: 'one',
      octave: 'exact',
      frets: [0, 5],
      strings: [5],
      shown: [{ string: 6, fret: 0, note: 'E', role: 'root' }],
      explain: 'String 5, fret 4 is {n:C#}, the 6th above {n:E}. The "5" shape uses fret 2, {n:B}.',
      fact: 'triplets-shuffle-a-pattern',
    },
    {
      type: 'card',
      title: 'Written in 12/8',
      body: 'A shuffle is triplets underneath, so it is sometimes written in 12/8: four beats, each split into three eighth notes. A quarter then an eighth in each beat shows the long-short exactly.',
      figure: { kind: 'rhythm', pattern: 'q e q e q e q e', time: '12/8', tempo: 60, caption: 'One bar of shuffle in 12/8: long-short on each of the four beats.' },
    },
    {
      type: 'choice',
      prompt: 'Why is a shuffle sometimes written in 12/8?',
      options: [
        { text: 'It shows the triplet feel exactly', correct: true },
        { text: 'It makes the song faster', why: 'A time signature does not set the speed.' },
        { text: 'The song has twelve beats in a bar', why: 'In 12/8 the twelve eighth notes are felt as four beats of three.' },
      ],
      shuffle: false,
      explain: 'In 12/8 each beat is three eighth notes, so a quarter plus an eighth shows the long-short of the shuffle exactly, with no "Swing" marking needed.',
      fact: 'triplets-shuffle-twelve-eight',
    },
  ],
  facts: [
    { id: 'triplets-shuffle-meaning', front: 'What is a shuffle?', back: 'A swung rhythm used as the groove of a whole song, as in blues and boogie.' },
    {
      id: 'triplets-shuffle-a-pattern',
      front: 'How does the classic guitar shuffle in A go?',
      back: 'Open string 5 with string 4 at fret 2 ({c:A5}, the 5th {n:E}) twice, then at fret 4 (the 6th, {n:F#}) twice, swung.',
      ask: {
        type: 'fretboard-find',
        prompt: 'In the {n:A} shuffle, the open string 5 is the root. Tap the 6th on string 4.',
        find: { interval: 'M6', from: { string: 5, fret: 0 } },
        mode: 'one',
        octave: 'exact',
        frets: [0, 5],
        strings: [4],
        shown: [{ string: 5, fret: 0, note: 'A', role: 'root' }],
        explain: 'String 4, fret 4: {n:F#}, the 6th of {n:A}. Fret 2, {n:E}, is the 5th.',
      },
    },
    {
      id: 'triplets-shuffle-twelve-eight',
      front: 'Why are shuffles sometimes written in 12/8?',
      back: 'So the triplet feel is shown exactly: each beat is three eighth notes, played long-short as a quarter and an eighth.',
    },
  ],
};

const syncopation: Lesson = {
  id: 'syncopation',
  title: 'Syncopation',
  teaches: 'Syncopation stresses or starts notes where the beat does not lead you to expect them, usually off the beat.',
  minutes: 3,
  skill: `theory:${U}:syncopation`,
  steps: [
    {
      type: 'card',
      title: 'Off the beat',
      body: '{t:syncopation|Syncopation} means stressing or starting notes where the beat does not lead you to expect them, usually on an off-beat, an "&". A common strum: down on 1, down-up on 2 &, **nothing on 3**, up on the & of 3, then down-up on 4 &.',
      figure: { kind: 'rhythm', pattern: SYNCOPATED, tempo: 80, caption: 'The & of 2 is tied over beat 3: nothing new is struck on 3.' },
    },
    {
      type: 'card',
      title: 'Strum it on G',
      body: 'Hold {c:G} (320003) and keep your hand moving down-up in eighths. Strike down on 1, down-up on 2 &, miss the strings on 3, then up, down, up. Count out loud: "1, 2 &, (3) & 4 &".',
      figure: { kind: 'audio', sound: { kind: 'strum', chord: 'G', pattern: 'D-DU-UDU', tempo: 80, repeat: 2 }, label: 'Hear the strum on G' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap the syncopated strum: 1, 2 &, (hold through 3), & of 3, 4 &.',
      rhythm: { pattern: SYNCOPATED },
      tempo: 80,
      show: 'both',
      explain: 'Six taps: 1, 2, &, then the & of 3, 4, &. The note on the & of 2 lasts through beat 3, so there is no tap on 3.',
    },
    {
      type: 'true-false',
      statement: 'In this strum, beat 3 is not struck.',
      answer: true,
      explain: 'The up-strum on the & of 2 is tied over beat 3, so your hand moves down past the strings on 3 without touching them.',
      fact: 'triplets-syncopation-strum',
    },
    {
      type: 'play-chord',
      prompt: 'Strum {c:G} once, slowly, to check the shape before you try the pattern.',
      chord: 'G',
      frets: '320003',
      explain: 'All six strings ring in {c:G}: {n:G} {n:B} {n:D} {n:G} {n:B} {n:G}. With the shape steady, the right hand can do the syncopation.',
      alternative: { generate: 'chord-shape', params: { chords: ['G'] } },
    },
    {
      type: 'card',
      title: 'Anticipations',
      body: 'An {t:anticipation} is a note or chord that arrives early, before the beat it belongs to, and is held over it. In strummed pop and rock it most often comes an eighth note early, on the "&" before the beat.',
      figure: { kind: 'rhythm', pattern: 'q q q e e | ~h h', tempo: 80, caption: 'The next chord arrives on the & of 4 and is held over beat 1.' },
    },
    {
      type: 'choice',
      prompt: 'In strummed pop and rock, how early does an anticipation most often arrive?',
      options: [
        { text: 'An eighth note early, on the "&"', correct: true },
        { text: 'A whole beat early', why: 'That can happen, but the usual anticipation is just an eighth note early.' },
        { text: 'A whole bar early', why: 'A chord a bar early simply belongs to that bar: it is no longer an anticipation.' },
      ],
      shuffle: false,
      explain: 'Most often an eighth note early: on the "&" just before the beat, then tied over it.',
      fact: 'triplets-anticipation',
    },
    {
      type: 'choice',
      prompt: 'Which rhythm anticipates beat 2?',
      options: [
        { figure: { kind: 'rhythm', pattern: 'e e ~q', time: '2/4' }, correct: true },
        { figure: { kind: 'rhythm', pattern: 'e e q', time: '2/4' }, why: 'Here beat 2 is struck on time: nothing arrives early.' },
        { figure: { kind: 'rhythm', pattern: 'q q', time: '2/4' }, why: 'Both notes fall on the beat.' },
      ],
      explain: 'In the right rhythm the note on the & of 1 is tied over beat 2: it arrives an eighth note early and holds.',
      fact: 'triplets-anticipation',
    },
    {
      type: 'listen-choice',
      prompt: 'Two bars. Which one is syncopated?',
      sound: { kind: 'rhythm', pattern: `q q q q | ${SYNCOPATED}`, tempo: 80 },
      options: [{ text: 'Bar 1' }, { text: 'Bar 2', correct: true }],
      shuffle: false,
      explain: 'Bar 1 struck only on the beats. Bar 2 skipped beat 3 and struck the & of 3 instead: syncopation.',
    },
    {
      type: 'choice',
      prompt: 'What is syncopation?',
      options: [
        { text: 'Stressing or starting notes off the beat', correct: true },
        { text: 'Playing every note on the beat', why: 'That is the opposite: notes exactly where you expect them.' },
        { text: 'Playing faster and faster', why: 'That is an accelerando, a change of tempo.' },
      ],
      shuffle: false,
      explain: 'Syncopation puts stresses and new notes where the listener does not expect them, usually on the off-beats.',
      fact: 'triplets-syncopation-meaning',
    },
    { generate: 'rhythm-ear', params: { values: ['quarter', 'eighth', 'half'], tempo: 80 } },
  ],
  facts: [
    {
      id: 'triplets-syncopation-meaning',
      front: 'What is syncopation?',
      back: 'Stressing or starting notes off the beat, where the listener does not expect them.',
    },
    {
      id: 'triplets-anticipation',
      front: 'What is an anticipation?',
      back: 'A chord or note that arrives early, often an eighth note early on the "&" before a beat, and is usually tied over it.',
    },
    {
      id: 'triplets-syncopation-strum',
      front: 'In the common strum "1, 2 &, (3), & 4 &", what happens on beat 3?',
      back: 'Nothing is struck: the up-strum on the & of 2 is tied over beat 3.',
    },
  ],
};

const sixteenthGrooves: Lesson = {
  id: 'sixteenth-grooves',
  title: 'Sixteenth-note grooves',
  teaches: 'Sixteenth figures are named by where they fall in "1 e & a"; the "e" and "a" are the most off-beat spots.',
  minutes: 4,
  skill: `theory:${U}:sixteenth-grooves`,
  steps: [
    {
      type: 'card',
      title: 'Where the notes fall',
      body: 'Count sixteenths **1 e & a**. A figure is named by the spots it strikes: an eighth then two sixteenths is "1 & a"; two sixteenths then an eighth is "1 e &"; sixteenth, eighth, sixteenth is "1 e a". The **e** and **a** are the most off-beat spots of all.',
      figure: { kind: 'rhythm', pattern: SIXTEENTH_FIGURES, tempo: 70, caption: 'Beat 1 is "1 & a", beat 2 "2 e &", beat 3 "3 e a", then a quarter.' },
    },
    {
      type: 'choice',
      prompt: 'Which spots of "1 e & a" are the most off-beat?',
      options: [
        { text: 'The e and the a', correct: true },
        { text: 'The 1 and the &', why: 'The 1 is the beat itself and the & is halfway: the two strongest spots.' },
        { text: 'Only the &', why: 'The & is off the beat, but the e and a sit further from any strong spot.' },
      ],
      shuffle: false,
      explain: 'The number is the beat and the & is the halfway point. The e and the a fall between them: the most off-beat places a note can start.',
      fact: 'triplets-sixteenth-offbeat',
    },
    {
      type: 'fill-blanks',
      prompt: 'Sixteenth, eighth, sixteenth in one beat. Complete the count.',
      text: '1  e  ___',
      blanks: ['a'],
      bank: ['&'],
      explain: 'The sixteenth falls on 1, the eighth starts on the e and lasts through the &, and the last sixteenth falls on the a: "1 e a".',
      fact: 'triplets-sixteenth-e-a',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each one-beat figure with its count.',
      pairs: [
        { left: 'Eighth, two sixteenths', right: '1 & a' },
        { left: 'Two sixteenths, eighth', right: '1 e &' },
        { left: 'Sixteenth, eighth, sixteenth', right: '1 e a' },
        { left: 'Four sixteenths', right: '1 e & a' },
      ],
      explain: 'Name each figure by the spots it strikes: an eighth covers two sixteenths, so it skips the syllable after it.',
      fact: 'triplets-sixteenth-figures',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap "1 & a", "2 e &", "3 e a", then a quarter note on 4.',
      rhythm: { pattern: SIXTEENTH_FIGURES },
      tempo: 70,
      show: 'both',
      explain: 'Count 1 e & a out loud and tap only where a note starts: 1 & a, 2 e &, 3 e a, 4.',
    },
    {
      type: 'card',
      title: 'The dotted eighth',
      body: 'A {t:dotted-note|dotted} eighth then a sixteenth also fills one beat. The dotted eighth lasts through "1 e &", and the sixteenth falls on the **a**. Count it "1 (e &) a".',
      figure: { kind: 'rhythm', pattern: 'e. s e. s e. s e. s', tempo: 70, caption: 'A dotted eighth and a sixteenth on every beat: 1 (e &) a.' },
    },
    {
      type: 'choice',
      prompt: 'A dotted eighth, then a sixteenth, fill one beat. Where does the sixteenth fall?',
      options: [
        { text: 'On the a', correct: true },
        { text: 'On the &', why: 'That would be two eighth notes. The dot stretches the first note through the &.' },
        { text: 'On the e', why: 'That would be a sixteenth, then a dotted eighth.' },
      ],
      shuffle: false,
      explain: 'A dotted eighth lasts three sixteenths: 1, e and &. The sixteenth comes last, on the a.',
      fact: 'triplets-dotted-eighth',
    },
    {
      type: 'card',
      title: 'Funk: keep the hand moving',
      body: 'Funk rhythm guitar keeps the strumming hand moving down-up in sixteenths all the time and strikes only some of them; the rest are misses in the air. Try the figures on muted strings at 70 BPM, then on {c:Em7} (022030).',
      figure: { kind: 'audio', sound: { kind: 'strum', chord: 'Em7', pattern: 'D-DUDUD-DU-UD---', grid: 'sixteenth', tempo: 70, repeat: 2 }, label: 'Hear the figures on {c:Em7}' },
    },
    {
      type: 'true-false',
      statement: 'In funk, the strumming hand stops moving between the notes it strikes.',
      answer: false,
      explain: 'It keeps moving down-up in sixteenths and just misses the strings where it does not strike. That keeps every note in time.',
      fact: 'triplets-funk-hand',
    },
    {
      type: 'listen-choice',
      prompt: 'Every beat of this bar has the same figure. Which one?',
      sound: { kind: 'rhythm', pattern: 's e s s e s s e s s e s', tempo: 70 },
      options: [
        { figure: { kind: 'rhythm', pattern: 'e s s e s s', time: '2/4' } },
        { figure: { kind: 'rhythm', pattern: 's s e s s e', time: '2/4' } },
        { figure: { kind: 'rhythm', pattern: 's e s s e s', time: '2/4' }, correct: true },
      ],
      explain: 'It was "1 e a" on every beat: a short note on the beat, a longer one from the e, and a short one on the a.',
    },
    { generate: 'rhythm-tap', params: { values: ['quarter', 'eighth', 'sixteenth'], tempo: 70 } },
    { generate: 'rhythm-ear', params: { values: ['quarter', 'eighth', 'sixteenth'], tempo: 70 } },
  ],
  facts: [
    { id: 'triplets-sixteenth-offbeat', front: 'In sixteenth-note rhythms, which spots are the most off-beat?', back: 'The "e" and the "a" of "1 e & a".' },
    {
      id: 'triplets-sixteenth-figures',
      front: 'How are "eighth, two sixteenths" and "two sixteenths, eighth" counted in one beat?',
      back: 'An eighth then two sixteenths: "1 & a". Two sixteenths then an eighth: "1 e &".',
      ask: {
        type: 'match-pairs',
        prompt: 'Match each one-beat figure with its count.',
        pairs: [
          { left: 'Eighth, two sixteenths', right: '1 & a' },
          { left: 'Two sixteenths, eighth', right: '1 e &' },
          { left: 'Two eighths', right: '1 &' },
        ],
        explain: 'An eighth note covers two sixteenths, so it skips the syllable after it.',
      },
    },
    { id: 'triplets-sixteenth-e-a', front: 'How is "sixteenth, eighth, sixteenth" counted in one beat?', back: '"1 e a": the middle note starts on the e and lasts through the &.' },
    { id: 'triplets-funk-hand', front: 'How does funk rhythm guitar keep time?', back: 'The hand keeps moving down-up in sixteenths and strikes only some of them.' },
    {
      id: 'triplets-dotted-eighth',
      front: 'A dotted eighth, then a sixteenth: where does the sixteenth fall?',
      back: 'On the "a". The dotted eighth lasts through "1 e &": count it "1 (e &) a".',
    },
  ],
};

const tempoWords: Lesson = {
  id: 'tempo-words',
  title: 'Tempo words',
  teaches: 'Italian words in music set the tempo and tell you when to speed up or slow down.',
  minutes: 2,
  skill: `theory:${U}:tempo-words`,
  steps: [
    {
      type: 'card',
      title: 'Speed in Italian',
      body: 'Music often names its {t:tempo} with an Italian word: **Adagio** slow, **Andante** at a walking pace, **Moderato** moderate, **Allegro** fast and bright, **Presto** very fast. This line on strings 1 and 2 is marked Andante: about 76 to 108 {t:bpm|BPM}.',
      figure: {
        kind: 'staff',
        time: '4/4',
        notes: ANDANTE_LINE.map((note, i) => ({ note, duration: i === ANDANTE_LINE.length - 1 ? 'h' : 'q' })),
        caption: 'Andante: a walking pace. Strings 2 and 1, frets 0 to 3.',
      },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each tempo word with its meaning.',
      pairs: [
        { left: 'Adagio', right: 'Slow' },
        { left: 'Andante', right: 'At a walking pace' },
        { left: 'Allegro', right: 'Fast and bright' },
        { left: 'Presto', right: 'Very fast' },
      ],
      explain: 'From slow to very fast: Adagio, Andante, Moderato, Allegro, Presto.',
      fact: 'triplets-tempo-words',
    },
    {
      type: 'card',
      title: 'Slowing down, speeding up',
      body: '**Ritardando** ({t:ritardando|rit.}) means gradually slow down; **accelerando** ({t:accelerando|accel.}) means gradually speed up. After either one, **{t:a-tempo|a tempo}** means go back to the original speed. Here is an accel.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: ACCEL_LINE, tempo: 92 }, label: 'Hear an accelerando' },
    },
    {
      type: 'choice',
      prompt: 'What does "a tempo" mean?',
      options: [
        { text: 'Go back to the original speed', correct: true },
        { text: 'Gradually speed up', why: 'That is accelerando, accel.' },
        { text: 'Gradually slow down', why: 'That is ritardando, rit.' },
        { text: 'Play at any speed you like', why: 'A tempo asks for one speed: the one you started with.' },
      ],
      explain: '"A tempo" is Italian for "in time": after a rit. or an accel., return to the original speed.',
      fact: 'triplets-a-tempo',
    },
    {
      type: 'listen-choice',
      prompt: 'Listen to the end of the line. Did the music slow down or speed up?',
      sound: { kind: 'tab', notes: RIT_LINE, tempo: 92 },
      options: [{ text: 'It slowed down: rit.', correct: true }, { text: 'It sped up: accel.' }],
      shuffle: false,
      explain: 'The notes came further and further apart toward the end: a ritardando.',
    },
    {
      type: 'true-false',
      statement: 'Accel. means gradually slow down.',
      answer: false,
      explain: 'Accel. (accelerando) means gradually speed up. Rit. (ritardando) is the one that slows down.',
      fact: 'triplets-rit-accel',
    },
    {
      type: 'choice',
      prompt: 'A piece is marked Allegro. About how fast is it?',
      options: [
        { text: 'About 60 BPM', why: 'That is slow: closer to Largo or Adagio.' },
        { text: 'About 90 BPM', why: 'That is a walking pace: Andante.' },
        { text: 'About 135 BPM', correct: true },
        { text: 'About 190 BPM', why: 'That is very fast: Presto.' },
      ],
      shuffle: false,
      explain: 'Allegro is fast and bright, usually about 120 to 156 BPM. Andante is about 76 to 108.',
      fact: 'triplets-tempo-words',
    },
  ],
  facts: [
    {
      id: 'triplets-tempo-words',
      front: 'What do Adagio, Andante, Moderato, Allegro and Presto mean?',
      back: 'Adagio slow, Andante at a walking pace, Moderato moderate, Allegro fast and bright, Presto very fast.',
      ask: {
        type: 'match-pairs',
        prompt: 'Match each tempo word with its meaning.',
        pairs: [
          { left: 'Adagio', right: 'Slow' },
          { left: 'Moderato', right: 'Moderate' },
          { left: 'Allegro', right: 'Fast and bright' },
          { left: 'Presto', right: 'Very fast' },
        ],
        explain: 'From slow to very fast: Adagio, Andante, Moderato, Allegro, Presto.',
      },
    },
    { id: 'triplets-rit-accel', front: 'What do rit. and accel. mean?', back: 'Ritardando (rit.): gradually slow down. Accelerando (accel.): gradually speed up.' },
    { id: 'triplets-a-tempo', front: 'What does "a tempo" mean?', back: 'Go back to the original speed.' },
  ],
};

/** Unit 17 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'Triplets, swing and syncopation',
  theme: 'rhythm',
  description: 'Triplets, swing and shuffle feel, syncopation and anticipations, sixteenth-note grooves, and tempo words.',
  lessons: [triplets, swing, theShuffle, syncopation, sixteenthGrooves, tempoWords],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      {
        type: 'choice',
        prompt: 'How many eighth-note triplets fill one quarter-note beat?',
        options: [{ text: '2' }, { text: '3', correct: true }, { text: '4' }],
        shuffle: false,
        explain: 'Three triplet eighths fill one beat, in the time of two ordinary eighths.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Count two beats of triplets.',
        text: '1  trip  let  2  ___  ___',
        blanks: ['trip', 'let'],
        bank: ['&', 'e'],
        explain: 'Triplets are counted 1-trip-let, 2-trip-let.',
      },
      {
        type: 'true-false',
        statement: 'In swing, pairs of eighth notes are played evenly.',
        answer: false,
        explain: 'Swing plays each pair long-short, close to a triplet quarter and a triplet eighth.',
      },
      {
        type: 'choice',
        prompt: 'A swung pair of eighth notes is closest to which ratio?',
        options: [{ text: '1:1' }, { text: '2:1', correct: true }, { text: '3:1' }],
        shuffle: false,
        explain: 'About 2:1: a triplet quarter note, then a triplet eighth note.',
      },
      {
        type: 'choice',
        prompt: 'What is a shuffle?',
        options: [
          { text: 'A swung groove kept up through a song', correct: true },
          { text: 'A sudden change of tempo', why: 'That would be a tempo marking such as rit. or accel.' },
          { text: 'A rhythm in straight sixteenth notes', why: 'A shuffle is swung: long-short.' },
        ],
        explain: 'A shuffle is swing used as the groove of a whole song, as in blues and boogie.',
      },
      {
        type: 'fretboard-find',
        prompt: 'In the {n:A} shuffle, the open string 5 is the root. Tap the 6th on string 4.',
        find: { interval: 'M6', from: { string: 5, fret: 0 } },
        mode: 'one',
        octave: 'exact',
        frets: [0, 5],
        strings: [4],
        shown: [{ string: 5, fret: 0, note: 'A', role: 'root' }],
        explain: 'String 4, fret 4: {n:F#}, the 6th of {n:A}.',
      },
      {
        type: 'choice',
        prompt: 'What is syncopation?',
        options: [
          { text: 'Stressing or starting notes off the beat', correct: true },
          { text: 'Playing every note on the beat', why: 'That is the opposite.' },
          { text: 'Playing faster and faster', why: 'That is an accelerando.' },
        ],
        shuffle: false,
        explain: 'Syncopation puts stresses and new notes where the listener does not expect them.',
      },
      {
        type: 'choice',
        prompt: 'In strummed pop and rock, how early does an anticipation most often arrive?',
        options: [
          { text: 'An eighth note early, on the "&"', correct: true },
          { text: 'A whole beat early' },
          { text: 'A whole bar early' },
        ],
        shuffle: false,
        explain: 'Most often an eighth note early, on the "&" before the beat, tied over it.',
      },
      {
        type: 'match-pairs',
        prompt: 'Match each one-beat figure with its count.',
        pairs: [
          { left: 'Eighth, two sixteenths', right: '1 & a' },
          { left: 'Two sixteenths, eighth', right: '1 e &' },
          { left: 'Sixteenth, eighth, sixteenth', right: '1 e a' },
        ],
        explain: 'An eighth note covers two sixteenths, so it skips the syllable after it.',
      },
      {
        type: 'choice',
        prompt: 'A dotted eighth, then a sixteenth, fill one beat. Where does the sixteenth fall?',
        options: [{ text: 'On the a', correct: true }, { text: 'On the &' }, { text: 'On the e' }],
        shuffle: false,
        explain: 'The dotted eighth lasts through 1 e &; the sixteenth falls on the a.',
      },
      {
        type: 'match-pairs',
        prompt: 'Match each tempo word with its meaning.',
        pairs: [
          { left: 'Adagio', right: 'Slow' },
          { left: 'Andante', right: 'At a walking pace' },
          { left: 'Allegro', right: 'Fast and bright' },
          { left: 'Presto', right: 'Very fast' },
        ],
        explain: 'Adagio slow, Andante walking, Allegro fast and bright, Presto very fast.',
      },
      {
        type: 'choice',
        prompt: 'What does "a tempo" mean?',
        options: [
          { text: 'Go back to the original speed', correct: true },
          { text: 'Gradually speed up', why: 'That is accel.' },
          { text: 'Gradually slow down', why: 'That is rit.' },
        ],
        explain: 'After a rit. or an accel., "a tempo" returns to the original speed.',
      },
      {
        type: 'true-false',
        statement: 'Rit. means gradually slow down.',
        answer: true,
        explain: 'Rit. is ritardando: gradually slow down. Accel. speeds up.',
      },
      {
        type: 'tap-rhythm',
        prompt: 'Tap one bar: two beats of triplets, then two quarter notes.',
        rhythm: { pattern: TRIPLET_TAP },
        tempo: 70,
        show: 'both',
        explain: 'Three even taps on beats 1 and 2, then one tap each on 3 and 4.',
      },
    ],
  },
};

export default unit;
