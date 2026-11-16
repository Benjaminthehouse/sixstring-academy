/**
 * Theory Path, unit 30: Rhythm: compound and odd meters. Written from the syllabus entries in
 * `src/content/plan/theory-path.json` (unit `compound-and-odd-meters`), one lesson per entry, in
 * order: each lesson opens with the "on the guitar" picture, asks the planned exercises, ends with
 * the planned drill, and turns every planned fact into a review card.
 *
 * `compound-and-odd-meters.test.ts` cross-checks every count, grouping and onset against the
 * rhythm engines (`@/core/theory` time signatures, `@/lessons` rhythm parsing and sound plans).
 *
 * Notes for readers of the code:
 * - A lesson sound cannot accent a note (a `rhythm` sound only accents the first beat of a bar),
 *   so every listening question marks its beats with pitch instead: the low string on the strong
 *   notes, higher strings in between. The text says so ("listen to the low notes").
 * - A tap-rhythm grades timing, not loudness, so "accent 1 and 4" or "accent each group" becomes
 *   either all the notes with the accents spoken in the prompt, or a tap on the accented notes only.
 * - Two parts cannot sound at once in a tab sound, so the 3-against-2 audio plays the combined
 *   rhythm: the thumb's low E on the steps both parts share, the fingers' high E on the others.
 * - Every idea that is heard is also asked without sound (on the go, "Sound" off).
 */
import type { DurationCode, Lesson, TabNote, Unit } from '@/lessons';

const U = 'compound-and-odd-meters';

/** [string, fret] pairs as tab notes of one length, repeated `times` times. */
function run(positions: ReadonlyArray<readonly [number, number]>, duration: DurationCode, times = 1): TabNote[] {
  const once = positions.map(([string, fret]) => ({ string, fret, duration }));
  return Array.from({ length: times }, () => once).flat();
}

/** [string, fret, duration] triples as tab notes, repeated `times` times. */
function phrase(notes: ReadonlyArray<readonly [number, number, DurationCode]>, times = 1): TabNote[] {
  const once = notes.map(([string, fret, duration]) => ({ string, fret, duration }));
  return Array.from({ length: times }, () => once).flat();
}

/** Am (x02210) picked in 6/8: bass on 1 and 4 (A2 A3 C4 | E3 A3 C4). */
export const AM_SIX_EIGHT = [[5, 0], [3, 2], [2, 1], [4, 2], [3, 2], [2, 1]] as const;
/** The same six eighths grouped as 3/4: a low note on 1, 3 and 5 (A2 C4 | E3 C4 | A2 C4). */
export const AM_THREE_FOUR = [[5, 0], [2, 1], [4, 2], [2, 1], [5, 0], [2, 1]] as const;
/** The 7/8 riff on string 6 grouped 2+2+3: frets 0 3 | 0 3 | 0 3 5. */
export const RIFF_2_2_3 = [[6, 0], [6, 3], [6, 0], [6, 3], [6, 0], [6, 3], [6, 5]] as const;
/** The same riff grouped 3+2+2: frets 0 3 5 | 0 3 | 0 3. */
export const RIFF_3_2_2 = [[6, 0], [6, 3], [6, 5], [6, 0], [6, 3], [6, 0], [6, 3]] as const;
/** E7 (020100) as a 12/8 slow blues: a quarter and an eighth in each beat. */
export const E7_TWELVE_EIGHT = [[6, 0, 'q'], [3, 1, 'e'], [5, 2, 'q'], [4, 0, 'e'], [6, 0, 'q'], [3, 1, 'e'], [5, 2, 'q'], [4, 0, 'e']] as const;
/** 3 against 2 in a bar of 2/4: the thumb's open low E on beats 1 and 2, the fingers' open high E on the triplet quarters. */
export const THREE_AGAINST_TWO = [[6, 0, 'qt'], [1, 0, 'et'], [6, 0, 'et'], [1, 0, 'qt']] as const;

const simpleAndCompound: Lesson = {
  id: 'simple-and-compound',
  title: 'Simple and compound time',
  teaches: 'In simple time each beat divides into two; in compound time each beat divides into three and is a dotted note.',
  minutes: 3,
  skill: `theory:${U}:simple-and-compound`,
  steps: [
    {
      type: 'card',
      title: 'Beats that split in two',
      body: 'Every {t:beat} can be split into smaller, even notes. In {t:simple-meter|simple time} each beat splits into **two**. Pick open string 5 in 2/4 with eighth notes: two beats, each made of two eighths. Count it 1 & 2 &.',
      figure: { kind: 'rhythm', pattern: 'e e e e', time: '2/4', tempo: 100, caption: '2/4: two beats, each split into two eighth notes.' },
    },
    {
      type: 'card',
      title: 'Or in three',
      body: 'In {t:compound-meter|compound time} each beat splits into **three**. Pick string 5 in 6/8: six eighth notes, but still only two beats, each made of three eighths. Count it 1 & a 2 & a.',
      figure: { kind: 'rhythm', pattern: 'e e e e e e', time: '6/8', tempo: 100, caption: '6/8: two beats, each split into three eighth notes.' },
      tip: 'Count out loud as you pick. The 1 and the 2 are where your foot taps.',
    },
    {
      type: 'choice',
      prompt: 'How many beats are in a bar of 6/8?',
      options: [
        { text: '2', correct: true },
        { text: '3', why: 'Three is how many eighth notes make one beat of 6/8.' },
        { text: '6', why: 'Six counts the eighth notes, the divisions. In threes they make two beats.' },
        { text: '8', why: 'The 8 names the note value, the eighth note. It is not a count of beats.' },
      ],
      shuffle: false,
      explain: 'Six eighth notes, grouped in two threes: 6/8 has **two** beats. The top number of a compound meter counts the divisions, not the beats.',
      fact: 'meters-top-number',
    },
    {
      type: 'true-false',
      statement: 'In simple time, each beat divides into two equal parts.',
      answer: true,
      explain: 'Simple time splits every beat in two: in 2/4, 3/4 and 4/4 a quarter-note beat holds two eighth notes.',
      fact: 'meters-simple-compound',
    },
    {
      type: 'card',
      title: 'The beat is a dotted note',
      body: 'One beat of 6/8 lasts three eighth notes. No plain note lasts three eighths, so the beat is a {t:dotted-note|dotted} quarter note: a quarter plus half again. In every compound meter, the beat is a dotted note.',
      figure: { kind: 'rhythm', pattern: 'q. q.', time: '6/8', tempo: 100, caption: 'The two beats of 6/8: two dotted quarter notes.' },
    },
    {
      type: 'choice',
      prompt: 'What kind of note gets one beat in a compound meter?',
      options: [
        { text: 'A dotted note', correct: true },
        { text: 'Always an eighth note', why: 'The eighth note is the division in 6/8: three of them make one beat.' },
        { text: 'A triplet', why: 'Triplets squeeze three notes into a beat of simple time. Compound beats split in three by themselves.' },
        { text: 'A whole note', why: 'A whole note lasts eight eighths: longer than a whole bar of 6/8.' },
      ],
      explain: 'A compound beat lasts three divisions, which only a dotted note can show: in 6/8, 9/8 and 12/8 the beat is a dotted quarter note.',
      fact: 'meters-dotted-beat',
    },
    {
      type: 'card',
      title: 'Two, three or four beats',
      body: 'Meters are also named by their number of beats: **duple** for two, **triple** for three, **quadruple** for four. 2/4 is simple duple, 3/4 simple triple, 4/4 simple quadruple. 6/8 is compound duple, 9/8 compound triple.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each time signature with its kind.',
      pairs: [
        { left: '2/4', right: 'Simple duple' },
        { left: '3/4', right: 'Simple triple' },
        { left: '6/8', right: 'Compound duple' },
        { left: '9/8', right: 'Compound triple' },
      ],
      explain: 'Duple means two beats, triple three. Simple beats split in two, compound beats in three: 6/8 is two beats of three eighths, 9/8 is three.',
      fact: 'meters-simple-compound',
    },
    {
      type: 'listen-choice',
      prompt: 'The low note marks each beat. Listen: does each beat divide into two or into three?',
      sound: { kind: 'tab', notes: run([[5, 0], [4, 2], [4, 2]], 'e', 4), tempo: 100 },
      options: [{ text: 'Into two' }, { text: 'Into three', correct: true }],
      shuffle: false,
      explain: 'Low, high, high: each beat held three notes. That is compound time, like 6/8.',
    },
    {
      type: 'card',
      title: 'Two shorthand signs',
      body: 'Some music shows a big C in place of the numbers. That is {t:common-time|common time}, and it means 4/4. A C with a vertical line through it is {t:cut-time|cut time}: 2/2, two half-note beats in each bar.',
    },
    {
      type: 'choice',
      prompt: 'What does cut time, a C with a line through it, mean?',
      options: [
        { text: '2/2: two half-note beats per bar', correct: true },
        { text: '4/4: four quarter-note beats', why: 'That is common time, the plain C.' },
        { text: '6/8: two dotted-quarter beats', why: 'Cut time is simple time: each half-note beat splits into two quarters.' },
        { text: 'Play at half the tempo', why: 'Cut time is a time signature, 2/2. It changes how you count, not how fast the music goes.' },
      ],
      explain: 'Cut time is 2/2: two half-note beats in each bar. Common time, the plain C, is 4/4.',
      fact: 'meters-common-cut',
    },
    { generate: 'meter', params: { ask: 'beats', signatures: ['6/8', '2/4', '3/4', '9/8', '12/8'] } },
  ],
  facts: [
    {
      id: 'meters-simple-compound',
      front: 'How does a beat divide in simple time? And in compound time?',
      back: 'In simple time each beat divides into two; in compound time each beat divides into three.',
      ask: {
        type: 'match-pairs',
        prompt: 'Match each time signature with its kind.',
        pairs: [
          { left: '3/4', right: 'Simple triple' },
          { left: '4/4', right: 'Simple quadruple' },
          { left: '6/8', right: 'Compound duple' },
          { left: '9/8', right: 'Compound triple' },
        ],
        explain: 'Simple beats split in two, compound beats in three. Duple is two beats, triple three, quadruple four: 4/4 is four beats of two eighths.',
      },
    },
    {
      id: 'meters-dotted-beat',
      front: 'In a compound meter, what kind of note is the beat? What is it in 6/8?',
      back: 'A dotted note. In 6/8 the beat is a dotted quarter note, three eighth notes long.',
    },
    {
      id: 'meters-top-number',
      front: 'What does the top number of 6/8 count?',
      back: 'The divisions, not the beats: six eighth notes, grouped as two beats of three.',
    },
    {
      id: 'meters-common-cut',
      front: 'What do common time (a C) and cut time (a C with a line through it) mean?',
      back: 'Common time is 4/4. Cut time is 2/2: two half-note beats in each bar.',
    },
  ],
};

const sixEight: Lesson = {
  id: 'six-eight',
  title: '6/8 time',
  teaches: '6/8 has two beats of three eighths each, so it feels unlike 3/4, although both bars hold six eighths.',
  minutes: 3,
  skill: `theory:${U}:six-eight`,
  steps: [
    {
      type: 'card',
      title: 'Two big beats',
      body: 'Hold {c:Am} (x02210) and pick six eighth notes: string 5, 3, 2, then string 4, 3, 2. The bass notes land on counts 1 and 4, so each bar has two beats of three eighths. That rocking, swaying feel is 6/8.',
      figure: { kind: 'tab', notes: run(AM_SIX_EIGHT, 'e'), time: '6/8', tempo: 100, caption: '{c:Am} in 6/8: the bass on counts 1 and 4.' },
    },
    {
      type: 'card',
      title: 'Count it two ways',
      body: 'Count six: **1**-2-3, **4**-5-6, a little louder on 1 and 4. Or count the two beats and their parts: **1** & a, **2** & a. Both say the same thing: two beats, each split into three.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: run(AM_SIX_EIGHT, 'e', 2), tempo: 100 }, label: 'Hear {c:Am} in 6/8' },
    },
    {
      type: 'choice',
      prompt: 'In 6/8, which note value gets one beat?',
      options: [
        { text: 'The dotted quarter note', correct: true },
        { text: 'The eighth note', why: 'The 8 names the eighth note, but eighths are the division: three of them make a beat.' },
        { text: 'The quarter note', why: 'A quarter note is two eighths long; a beat of 6/8 is three.' },
        { text: 'The half note', why: 'A half note is four eighths long: more than one beat of 6/8.' },
      ],
      explain: 'A beat of 6/8 lasts three eighth notes: a dotted quarter. The bar holds two of them.',
      fact: 'meters-six-eight',
    },
    {
      type: 'fill-blanks',
      prompt: 'Counting a bar of 6/8 in six, where do the two strong counts fall?',
      text: 'On count 1 and count ___.',
      blanks: ['4'],
      bank: ['2', '3', '5'],
      explain: 'Each beat is three eighths long, so the second beat starts on count 4: **1**-2-3, **4**-5-6.',
      fact: 'meters-count-six-eight',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap all six eighth notes of each bar, two bars. Count 1 2 3 4 5 6 and say 1 and 4 louder.',
      rhythm: { pattern: 'e e e e e e | e e e e e e', time: '6/8' },
      tempo: 90,
      show: 'both',
      explain: 'Six even taps per bar, one on every click. Leaning on 1 and 4 turns the six taps into two beats of three.',
    },
    {
      type: 'card',
      title: '6/8 is not 3/4',
      body: 'A bar of 3/4 also holds six eighth notes, but groups them in **pairs**: 1 & 2 & 3 &, three beats (2+2+2). 6/8 groups them in **threes**: 1 & a 2 & a, two beats (3+3). Same notes, a different pulse: 3/4 is a waltz, 6/8 a sway.',
      figure: { kind: 'tab', notes: run(AM_THREE_FOUR, 'e'), time: '3/4', tempo: 100, caption: '{c:Am} in 3/4: a low note on every quarter-note beat.' },
    },
    {
      type: 'choice',
      prompt: 'How does a bar of 6/8 group its six eighth notes?',
      options: [
        { text: '3+3', correct: true },
        { text: '2+2+2', why: 'Three pairs is 3/4: three beats of two eighths.' },
        { text: '2+2+2+2', why: 'Four pairs add up to eight eighths: a bar of 4/4.' },
        { text: '3+3+3', why: 'Three threes add up to nine eighths: a bar of 9/8.' },
      ],
      shuffle: false,
      explain: '6/8 is two groups of three eighth notes: two beats. 3/4 holds the same six eighths as three pairs.',
      fact: 'meters-three-four-vs-six-eight',
    },
    {
      type: 'listen-choice',
      prompt: 'Listen to the low notes. Is this 3/4 or 6/8?',
      sound: { kind: 'tab', notes: run(AM_THREE_FOUR, 'e', 2), tempo: 100 },
      options: [{ text: '3/4: three beats of two', correct: true }, { text: '6/8: two beats of three' }],
      shuffle: false,
      explain: 'A low note came on every second eighth: three beats of two in each bar. That is 3/4.',
    },
    {
      type: 'true-false',
      statement: '3/4 and 6/8 both hold six eighth notes, so they feel the same.',
      answer: false,
      explain: 'Same six eighths, different groups: 3/4 is three beats of two, 6/8 is two beats of three. You hear the difference in where the strong notes fall.',
      fact: 'meters-three-four-vs-six-eight',
    },
    {
      type: 'listen-choice',
      prompt: 'One more. Is this 3/4 or 6/8?',
      sound: { kind: 'tab', notes: run(AM_SIX_EIGHT, 'e', 2), tempo: 110 },
      options: [{ text: '3/4: three beats of two' }, { text: '6/8: two beats of three', correct: true }],
      shuffle: false,
      explain: 'The low notes came on counts 1 and 4, with two higher notes after each: two beats of three. That is 6/8.',
    },
    { generate: 'meter', params: { ask: 'fill', signatures: ['6/8', '3/4', '9/8', '12/8'] } },
  ],
  facts: [
    {
      id: 'meters-six-eight',
      front: 'How many beats does a bar of 6/8 have, and how is each beat divided?',
      back: 'Two beats. Each is a dotted quarter note, divided into three eighth notes.',
    },
    {
      id: 'meters-count-six-eight',
      front: 'How do you count a bar of 6/8?',
      back: '1 2 3 4 5 6, with accents on 1 and 4. Or by beats: 1 & a 2 & a.',
      ask: {
        type: 'fill-blanks',
        prompt: 'Counting a bar of 6/8 in six, where do the two strong counts fall?',
        text: 'On count 1 and count ___.',
        blanks: ['4'],
        bank: ['2', '3', '6'],
        explain: 'Each beat of 6/8 is three eighths long, so the second beat starts on count 4.',
      },
    },
    {
      id: 'meters-three-four-vs-six-eight',
      front: '3/4 and 6/8 both hold six eighth notes. How does each group them?',
      back: '3/4 in three pairs (2+2+2): three beats. 6/8 in two threes (3+3): two beats.',
    },
  ],
};

const nineAndTwelveEight: Lesson = {
  id: 'nine-and-twelve-eight',
  title: '9/8 and 12/8',
  teaches: '9/8 has three dotted-quarter beats and 12/8 has four, each divided into three.',
  minutes: 3,
  skill: `theory:${U}:nine-and-twelve-eight`,
  steps: [
    {
      type: 'card',
      title: 'Three and four big beats',
      body: 'Keep the dotted-quarter beat and add more of them. **9/8** has three beats: 1 & a 2 & a 3 & a. **12/8** has four: 1 & a 2 & a 3 & a 4 & a. Every beat still splits into three eighth notes.',
      figure: { kind: 'rhythm', pattern: 'e e e e e e e e e e e e', time: '12/8', tempo: 90, caption: '12/8: four beats of three eighth notes.' },
    },
    {
      type: 'choice',
      prompt: 'How many beats are in a bar of 12/8?',
      options: [
        { text: '3', why: 'That is 9/8: nine eighths in three groups.' },
        { text: '4', correct: true },
        { text: '6', why: 'Six would be pairs of eighths. Compound beats are groups of three.' },
        { text: '12', why: 'Twelve counts the eighth notes. In threes they make four beats.' },
      ],
      shuffle: false,
      explain: 'Twelve eighth notes in groups of three: four dotted-quarter beats.',
      fact: 'meters-nine-twelve',
    },
    {
      type: 'true-false',
      statement: '12/8 has twelve beats per bar.',
      answer: false,
      explain: 'The 12 counts eighth notes, the divisions. They are grouped in threes, so a bar of 12/8 has four beats.',
      fact: 'meters-nine-twelve',
    },
    {
      type: 'choice',
      prompt: 'Which time signature has three beats, each split into three?',
      options: [
        { text: '9/8', correct: true },
        { text: '3/4', why: '3/4 has three beats, but each splits into two eighths.' },
        { text: '6/8', why: '6/8 has two beats of three.' },
        { text: '12/8', why: '12/8 has four beats of three.' },
      ],
      explain: '9/8 is three dotted-quarter beats, each holding three eighth notes: nine in all.',
    },
    {
      type: 'card',
      title: 'The slow blues',
      body: 'Play {c:E7} (020100) in 12/8: strum down on each beat and again on the third eighth of the beat. Long-short, long-short, four times in a bar. That lazy triplet swing is the sound of a slow blues or a ballad.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: phrase(E7_TWELVE_EIGHT, 2), tempo: 90 }, label: 'Hear a 12/8 slow blues' },
      tip: 'Count 1 & a 2 & a and strum on the 1 and the a of every beat.',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap the four beats of each 12/8 bar while the eighth notes click. Two bars.',
      rhythm: { pattern: 'q. q. q. q. | q. q. q. q.', time: '12/8' },
      tempo: 90,
      show: 'both',
      explain: 'One tap every three clicks, on eighths 1, 4, 7 and 10: those four taps are the beats of 12/8.',
    },
    {
      type: 'card',
      title: 'Two ways to write a shuffle',
      body: 'A shuffle in 4/4 is often written as plain eighths marked **swing**: each beat played long-short, like a {t:triplet} with its middle note left out. Written in 12/8 it is a quarter and an eighth in every beat. At the same speed the two sound exactly alike.',
      figure: { kind: 'rhythm', pattern: 'qt et qt et qt et qt et', time: '4/4', tempo: 60, caption: 'A shuffle in 4/4, written out as triplets: long-short on every beat.' },
    },
    {
      type: 'true-false',
      statement: 'A shuffle written in 4/4 with swung eighths can sound the same as one written in 12/8.',
      answer: true,
      explain: 'Swung eighths fall on the first and third notes of a triplet, and 12/8 puts a quarter and an eighth in each three-eighth beat: the same long-short at the same moments.',
      fact: 'meters-shuffle-twelve-eight',
    },
    {
      type: 'choice',
      prompt: 'Here are two beats of each rhythm. Which one matches the long-short strum of the 12/8 slow blues?',
      options: [
        { figure: { kind: 'rhythm', pattern: 'q e q e', time: '6/8' }, correct: true },
        { figure: { kind: 'rhythm', pattern: 'e e e e e e', time: '6/8' }, why: 'Even eighths: no long-short, every division is played.' },
        { figure: { kind: 'rhythm', pattern: 'q. q.', time: '6/8' }, why: 'Only the beats: there is no strum on the third eighth.' },
      ],
      explain: 'A quarter (two eighths long) and an eighth in each beat: strum on the 1 and the a of every beat.',
      fact: 'meters-twelve-eight-blues',
    },
    {
      type: 'listen-choice',
      prompt: 'Is this {c:A7} groove in 12/8, long-short in every beat, or in straight eighth notes?',
      sound: { kind: 'tab', notes: phrase([[5, 0, 'q'], [2, 2, 'e'], [4, 2, 'q'], [3, 0, 'e']], 4), tempo: 90 },
      options: [{ text: '12/8: long-short in every beat', correct: true }, { text: 'Straight, even eighth notes' }],
      shuffle: false,
      explain: 'Each low note was held twice as long as the high note after it: long-short, long-short. That is the 12/8 triplet feel.',
    },
    { generate: 'meter', params: { ask: 'beats', signatures: ['9/8', '12/8', '6/8'] } },
  ],
  facts: [
    {
      id: 'meters-nine-twelve',
      front: 'How many beats are in a bar of 9/8? Of 12/8?',
      back: '9/8 has three dotted-quarter beats; 12/8 has four. Each beat divides into three eighth notes.',
      ask: {
        type: 'choice',
        prompt: 'How many beats are in a bar of 9/8?',
        options: [{ text: '2' }, { text: '3', correct: true }, { text: '4' }, { text: '9' }],
        shuffle: false,
        explain: 'Nine eighth notes in groups of three: three dotted-quarter beats.',
      },
    },
    {
      id: 'meters-twelve-eight-blues',
      front: 'Where is 12/8 often heard?',
      back: 'In slow blues and ballads: four beats in a bar, each with a triplet feel.',
    },
    {
      id: 'meters-shuffle-twelve-eight',
      front: 'Can a shuffle written in 4/4 sound the same as one written in 12/8?',
      back: 'Yes. Swung eighths in 4/4 and a quarter plus an eighth in each beat of 12/8 put the same long-short on every beat.',
    },
  ],
};

const oddMeters: Lesson = {
  id: 'odd-meters',
  title: 'Fives and sevens',
  teaches: 'Odd meters such as 5/4 and 7/8 are felt as groups of twos and threes.',
  minutes: 4,
  skill: `theory:${U}:odd-meters`,
  steps: [
    {
      type: 'card',
      title: 'Not twos, not threes',
      body: 'Five and seven cannot be split into equal twos or equal threes. So players feel these {t:odd-meter|odd meters} as a mix of short groups. A bar of 7/8 is often felt 2+2+3: **1**-2, **1**-2, **1**-2-3. The last group is a little longer.',
      figure: { kind: 'rhythm', pattern: 'q q q.', time: '2+2+3/8', tempo: 100, caption: '7/8 grouped 2+2+3: two short groups and a long one.' },
    },
    {
      type: 'choice',
      prompt: 'How many eighth notes are in a bar of 7/8?',
      options: [
        { text: '3', why: 'Three is how many groups it has when felt 2+2+3.' },
        { text: '6', why: 'Six eighths make a bar of 6/8 or 3/4.' },
        { text: '7', correct: true },
        { text: '8', why: 'Eight eighths make a bar of 4/4.' },
      ],
      shuffle: false,
      explain: 'The top number says how many, the bottom which note: 7/8 is seven eighth notes in every bar.',
    },
    {
      type: 'true-false',
      statement: 'Seven eighth notes can be split into equal groups of two or of three.',
      answer: false,
      explain: 'Seven is neither 2+2+2 (six) nor 3+3 (six): one note is always left over. So 7/8 mixes twos and threes, as in 2+2+3.',
      fact: 'meters-odd-groups',
    },
    {
      type: 'card',
      title: 'A riff in seven',
      body: 'Here is a riff on string 6 in 7/8, grouped 2+2+3. Each group starts on the open low {n:E}: frets 0 3, 0 3, 0 3 5. Play the first note of each group a little harder, and the bar falls into place.',
      figure: { kind: 'tab', notes: run(RIFF_2_2_3, 'e'), time: '2+2+3/8', tempo: 100, caption: 'String 6 only: 0 3 | 0 3 | 0 3 5.' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap only the first note of each group: eighths 1, 3 and 5 of the seven. Two bars.',
      rhythm: { pattern: 'q q q. | q q q.', time: '2+2+3/8' },
      tempo: 100,
      show: 'both',
      explain: 'Tap, skip, tap, skip, tap, skip, skip. The last group is three eighths long, so the gap before the next bar is a little longer.',
    },
    {
      type: 'listen-choice',
      prompt: 'Listen for the open low {n:E} at the start of each group. Is this 7/8 grouped 2+2+3 or 3+2+2?',
      sound: { kind: 'tab', notes: run(RIFF_3_2_2, 'e', 2), tempo: 100 },
      options: [{ text: '2+2+3' }, { text: '3+2+2', correct: true }],
      shuffle: false,
      explain: 'The long group came first: 0 3 5, then 0 3, then 0 3. That is 3+2+2.',
    },
    {
      type: 'card',
      title: 'Writing the groups in',
      body: 'Composers often write the groups into the time signature: **3+2+2/8** is a bar of 7/8 felt three, two, two. 5/4 works the same way: count 1-2-3, 1-2 (3+2) or 1-2, 1-2-3 (2+3).',
      figure: { kind: 'rhythm', pattern: 'q. q q', time: '3+2+2/8', tempo: 100, caption: '3+2+2/8: the long group first.' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each grouping of eighth notes with its time signature.',
      pairs: [
        { left: '2+2+3', right: '7/8' },
        { left: '3+3', right: '6/8' },
        { left: '2+2+2', right: '3/4' },
        { left: '3+3+3', right: '9/8' },
      ],
      explain: 'Add up the groups to find the eighth notes in the bar: 7, 6, 6 and 9. Pairs of eighths are quarter-note beats, so 2+2+2 is 3/4.',
      fact: 'meters-grouping-signature',
    },
    {
      type: 'choice',
      prompt: 'How is a bar of 5/4 usually felt?',
      options: [
        { text: 'As 3+2 or as 2+3', correct: true },
        { text: 'As five equal beats, never grouped', why: 'Five beats in a row are hard to follow; players group them into a three and a two.' },
        { text: 'As 2+2+2', why: 'That adds up to six, not five.' },
        { text: 'As 4+4', why: 'That adds up to eight, not five.' },
      ],
      explain: '5/4 is felt as a group of three and a group of two, in either order: 1-2-3, 1-2 or 1-2, 1-2-3.',
      fact: 'meters-odd-groupings',
    },
    {
      type: 'choice',
      prompt: 'A time signature reads 2+3+2/8. How many eighth notes are in each bar?',
      options: [
        { text: '3', why: 'Three is the number of groups, not of eighth notes.' },
        { text: '6' },
        { text: '7', correct: true },
        { text: '8' },
      ],
      shuffle: false,
      explain: '2 + 3 + 2 = 7: a bar of 7/8, felt two, three, two.',
      fact: 'meters-grouping-signature',
    },
    { generate: 'meter', params: { ask: 'beats', signatures: ['7/8', '5/4', '6/8', '5/8'] } },
    { generate: 'meter', params: { ask: 'fill', signatures: ['7/8', '5/4'] } },
  ],
  facts: [
    {
      id: 'meters-odd-groups',
      front: 'Why are 5/4 and 7/8 felt as mixed groups?',
      back: 'They cannot be split into equal groups of two or three, so they are felt as twos and threes mixed: 3+2, or 2+2+3.',
    },
    {
      id: 'meters-odd-groupings',
      front: 'How are 5/4 and 7/8 usually grouped?',
      back: '5/4 as 3+2 or 2+3. 7/8 as 2+2+3, 3+2+2 or 2+3+2.',
      ask: {
        type: 'choice',
        prompt: 'Which of these is a usual way to group a bar of 7/8?',
        options: [
          { text: '2+2+3', correct: true },
          { text: '3+3', why: 'That adds up to six: 6/8.' },
          { text: '2+2+2+2', why: 'That adds up to eight: 4/4.' },
          { text: '3+3+3', why: 'That adds up to nine: 9/8.' },
        ],
        explain: '7/8 mixes twos and threes that add up to seven: 2+2+3, 3+2+2 or 2+3+2.',
      },
    },
    {
      id: 'meters-grouping-signature',
      front: 'How can a time signature show how its bar is grouped?',
      back: 'By writing the groups on top: 3+2+2/8 is a bar of 7/8 felt three, two, two.',
    },
  ],
};

const mixedMeterAndHemiola: Lesson = {
  id: 'mixed-meter-and-hemiola',
  title: 'Mixed meter and hemiola',
  teaches: 'Mixed meter changes time signature from bar to bar; a hemiola makes two bars of three feel like three of two.',
  minutes: 3,
  skill: `theory:${U}:mixed-meter-and-hemiola`,
  steps: [
    {
      type: 'card',
      title: 'Bars that change size',
      body: 'Music does not have to keep one time signature. In {t:mixed-meter|mixed meter} it changes from bar to bar: a bar of 3/4, a bar of 2/4, then 3/4 again. The beat keeps its speed; only the number of beats in each bar changes.',
      figure: {
        kind: 'audio',
        sound: { kind: 'tab', notes: run([[5, 0], [2, 1], [2, 1], [5, 0], [2, 1]], 'q', 2), tempo: 110 },
        label: 'Hear 3/4, 2/4, 3/4, 2/4',
      },
      tip: 'Listen for the low {n:A}: it starts each bar. The gaps between them go long, short, long, short.',
    },
    {
      type: 'true-false',
      statement: 'In mixed meter the beat gets faster or slower from bar to bar.',
      answer: false,
      explain: 'The beat keeps its speed. What changes is how many beats each bar holds: 3, then 2, then 3.',
      fact: 'meters-mixed-meter',
    },
    {
      type: 'choice',
      prompt: 'A song goes 3/4, 2/4, 3/4, 2/4. How many quarter-note beats do those four bars hold?',
      options: [{ text: '8' }, { text: '9' }, { text: '10', correct: true }, { text: '12', why: 'That would be four bars of 3/4.' }],
      shuffle: false,
      explain: '3 + 2 + 3 + 2 = 10 beats. Mixed meter changes how the beats are grouped into bars, not how fast they go.',
      fact: 'meters-mixed-meter',
    },
    {
      type: 'card',
      title: 'Three groups of two',
      body: 'Strum {c:Am} (x02210) in 3/4 and accent beats 1 and 3 of one bar, then beat 2 of the next: **1**, 2, **3** | 1, **2**, 3. The accents come every second beat, so two bars of three sound like three groups of two. That regrouping is a {t:hemiola}.',
      figure: { kind: 'rhythm', pattern: 'h q | ~q h', time: '3/4', tempo: 100, caption: 'Two bars of 3/4 felt as three groups of two.' },
    },
    {
      type: 'listen-choice',
      prompt: 'Four bars of 3/4 on {c:Am}: two plain ones, then two more. How do the last two bars feel?',
      sound: { kind: 'tab', notes: [...run([[5, 0], [2, 1], [2, 1]], 'q', 2), ...run([[5, 0], [2, 1]], 'q', 3)], tempo: 110 },
      options: [{ text: 'Two groups of three' }, { text: 'Three groups of two', correct: true }],
      shuffle: false,
      explain: 'In the last two bars the low {n:A} came every second beat: three groups of two across two bars of three. That is a hemiola.',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap the hemiola accents across two bars of 3/4: beats 1 and 3, then beat 2.',
      rhythm: { pattern: 'h q | ~q h', time: '3/4' },
      tempo: 100,
      show: 'both',
      explain: 'Three taps, each two beats apart: beat 1, beat 3, then beat 2 of the next bar. The tie carries the second note over the bar line.',
    },
    {
      type: 'true-false',
      statement: 'A hemiola changes the tempo.',
      answer: false,
      explain: 'The beats keep their speed. Only the accents move: every second beat instead of every third.',
      fact: 'meters-hemiola',
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the hemiola over two bars of 3/4.',
      text: 'Accent beats 1 and ___ of the first bar, then beat ___ of the second.',
      blanks: ['3', '2'],
      bank: ['1'],
      explain: 'Every second beat: 1 and 3 of the first bar, then 2 of the second. Three accents, three groups of two.',
      fact: 'meters-hemiola',
    },
    {
      type: 'choice',
      prompt: 'Where are hemiolas common?',
      options: [
        { text: 'Baroque cadences and Latin American music', correct: true },
        { text: 'Only in drum solos', why: 'Hemiolas turn up in many styles that move in threes, played by the whole band.' },
        { text: 'In every bar of a waltz', why: 'A waltz keeps its ONE two three. A hemiola is a moment where the threes regroup.' },
        { text: 'Only in 4/4', why: 'In 4/4 the groups of two never cross groups of three; a hemiola needs threes.' },
      ],
      explain: 'Baroque composers loved a hemiola just before a cadence, and many Latin American styles move back and forth between 6/8 and 3/4.',
      fact: 'meters-hemiola-where',
    },
    {
      type: 'choice',
      prompt: 'A bar of 6/8 is followed by a bar of 3/4, eighth notes at the same speed. What changes?',
      options: [
        { text: 'The groups: 3+3, then 2+2+2', correct: true },
        { text: 'The number of eighth notes', why: 'Both bars hold six eighth notes.' },
        { text: 'The speed of the eighth notes', why: 'The eighths keep their speed; only the accents move.' },
      ],
      explain: 'Six eighths each time: first two beats of three, then three beats of two. Moving between the two is the hemiola feel of much Latin American music.',
    },
  ],
  facts: [
    {
      id: 'meters-mixed-meter',
      front: 'What is mixed meter?',
      back: 'Changing the time signature from bar to bar: a bar of 3/4, then 2/4, then 3/4 again. The beat keeps its speed.',
    },
    {
      id: 'meters-hemiola',
      front: 'What does a hemiola do?',
      back: 'It makes two bars of three beats feel like three bars of two, by accenting every second beat.',
      ask: {
        type: 'choice',
        prompt: 'Two bars of 3/4 are accented on beats 1 and 3, then on beat 2. What is this?',
        options: [
          { text: 'A hemiola', correct: true },
          { text: 'Mixed meter', why: 'The time signature stays 3/4; only the accents move.' },
          { text: 'A polyrhythm', why: 'A polyrhythm plays two divisions at once. Here one part regroups the beats.' },
        ],
        explain: 'Accents every second beat make two bars of three feel like three groups of two: a hemiola.',
      },
    },
    {
      id: 'meters-hemiola-where',
      front: 'Where are hemiolas common?',
      back: 'At cadences in Baroque music, and in Latin American styles that move between 6/8 and 3/4.',
    },
  ],
};

const threeAgainstTwo: Lesson = {
  id: 'three-against-two',
  title: 'Three against two',
  teaches: 'A polyrhythm plays two even divisions of the same span at once, and 3 against 2 is the most common one.',
  minutes: 4,
  skill: `theory:${U}:three-against-two`,
  steps: [
    {
      type: 'card',
      title: 'Two parts at once',
      body: 'A {t:polyrhythm} plays two different even divisions of the same span at once. In **3 against 2**, your thumb plays open string 6 on beats 1 and 2 of a bar of 2/4, while your fingers play three even notes on string 1 in the same time.',
      figure: { kind: 'rhythm', pattern: 'qt qt qt', time: '2/4', tempo: 60, caption: 'The fingers: three even notes in the time of the thumb\'s two.' },
    },
    {
      type: 'choice',
      prompt: 'In 3 against 2, what do the two parts share?',
      options: [
        { text: 'The same span of time', correct: true },
        { text: 'The same number of notes', why: 'One part plays two notes, the other three.' },
        { text: 'The same note values', why: 'The thumb plays quarter notes, the fingers triplet quarters.' },
      ],
      explain: 'Both parts fill the same span, one bar of 2/4 here: one with two even notes, the other with three.',
      fact: 'meters-polyrhythm',
    },
    {
      type: 'card',
      title: 'Count in six',
      body: 'Split the bar into six tiny steps. The twos land every three steps: on **1** and **4**. The threes land every two steps: on **1**, **3** and **5**. Together they make one rhythm on **1, 3, 4 and 5**: long, short, short, long.',
      figure: { kind: 'rhythm', pattern: 'q e e q', time: '6/8', tempo: 100, counting: false, caption: 'Both parts together on a six-step grid: steps 1, 3, 4 and 5.' },
      tip: 'Say "1 2 3 4 5 6" evenly and clap on 1, 3, 4 and 5. Then feel the thumb on 1 and 4.',
    },
    {
      type: 'fill-blanks',
      prompt: 'Counted in six, where do the two parts of 3 against 2 fall?',
      text: 'The twos fall on 1 and ___. The threes fall on 1, ___ and 5.',
      blanks: ['4', '3'],
      bank: ['2', '6'],
      explain: 'Six steps split in two gives 1 and 4; split in three gives 1, 3 and 5.',
      fact: 'meters-three-two-grid',
    },
    {
      type: 'choice',
      prompt: 'Counted in six, which steps does the combined 3-against-2 rhythm leave silent?',
      options: [
        { text: '2 and 6', correct: true },
        { text: '3 and 5', why: '3 and 5 belong to the threes.' },
        { text: '1 and 4', why: '1 and 4 are the twos; 1 is shared by both parts.' },
        { text: '4 and 6', why: '4 is the second of the twos.' },
      ],
      shuffle: false,
      explain: 'The twos take 1 and 4, the threes 1, 3 and 5. Only 2 and 6 are left empty.',
      fact: 'meters-three-two-grid',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap steps 1, 3, 4 and 5 of the six: under the notes they read 1, a, 2 and &. The click marks all six steps. Two bars.',
      rhythm: { pattern: 'q e e q | q e e q', time: '6/8' },
      tempo: 100,
      show: 'both',
      explain: 'Tap 1, skip 2, tap 3 and 4, tap 5, skip 6: long, short, short, long. That is both parts of 3 against 2 in one hand.',
    },
    {
      type: 'card',
      title: 'Hear both hands',
      body: 'Slowly: the thumb\'s low {n:E} on the beats, the fingers\' high {n:E} on the triplets. On beat 1 thumb and fingers pluck together, as one sound. Then the high note, the low note, the high note: short, short, long.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: phrase(THREE_AGAINST_TWO, 4), tempo: 50 }, label: 'Hear 3 against 2, slowly' },
    },
    {
      type: 'listen-choice',
      prompt: 'Is this 3 against 2, or straight eighth notes?',
      sound: { kind: 'tab', notes: phrase(THREE_AGAINST_TWO, 4), tempo: 80 },
      options: [{ text: '3 against 2', correct: true }, { text: 'Straight eighth notes' }],
      shuffle: false,
      explain: 'Long, short, short, long in every bar: the twos and the threes together. Straight eighths would be four even notes.',
    },
    {
      type: 'listen-choice',
      prompt: 'And this one: 3 against 2, or straight eighth notes?',
      sound: { kind: 'tab', notes: run([[6, 0], [1, 0]], 'e', 6), tempo: 80 },
      options: [{ text: '3 against 2' }, { text: 'Straight eighth notes', correct: true }],
      shuffle: false,
      explain: 'Every note was the same length: low, high, low, high. Straight eighths, with no threes against the twos.',
    },
    {
      type: 'tap-rhythm',
      prompt: 'The click plays the twos. Tap the threes: three even taps in each bar of 2/4. Two bars.',
      rhythm: { pattern: 'qt qt qt | qt qt qt', time: '2/4' },
      tempo: 70,
      show: 'both',
      explain: 'Your first tap lands with the click; the next two fall between the clicks, one a little before beat 2 and one a little after it.',
    },
    {
      type: 'choice',
      prompt: 'Your thumb plays steady quarter notes while your fingers play a melody in quarter-note triplets. What is this?',
      options: [
        { text: 'A 3-against-2 polyrhythm', correct: true },
        { text: 'A hemiola', why: 'A hemiola regroups the beats of one part. Here two parts run at once.' },
        { text: 'Mixed meter', why: 'The time signature never changes here.' },
        { text: 'A shuffle', why: 'A shuffle plays long-short in every beat; here three even notes cross two beats.' },
      ],
      explain: 'Two even quarter notes in the thumb against three even triplet quarters in the fingers, over the same span: 3 against 2.',
      fact: 'meters-thumb-fingers',
    },
    {
      type: 'true-false',
      statement: 'In 3 against 2, both parts start together on step 1.',
      answer: true,
      explain: 'Both parts begin the span together. After that the twos land on step 4 and the threes on steps 3 and 5.',
    },
  ],
  facts: [
    {
      id: 'meters-polyrhythm',
      front: 'What is a polyrhythm?',
      back: 'Two different even divisions of the same span played at once, such as three notes against two.',
    },
    {
      id: 'meters-three-two-grid',
      front: 'Counted in six, where do the notes of 3 against 2 fall?',
      back: 'The twos on 1 and 4, the threes on 1, 3 and 5. Together they fall on 1, 3, 4 and 5.',
      ask: {
        type: 'fill-blanks',
        prompt: 'Counted in six, complete the combined rhythm of 3 against 2.',
        text: '1, 3, ___ and 5',
        blanks: ['4'],
        bank: ['2', '6'],
        explain: 'The twos fall on 1 and 4, the threes on 1, 3 and 5: together 1, 3, 4 and 5.',
      },
    },
    {
      id: 'meters-thumb-fingers',
      front: 'Where does 3 against 2 turn up in fingerstyle guitar?',
      back: 'When the thumb plays steady quarter notes and the fingers play a melody in quarter-note triplets.',
    },
  ],
};

/** Unit 30 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'Rhythm: compound and odd meters',
  theme: 'rhythm',
  description: 'Simple versus compound time, 6/8, 9/8 and 12/8, odd meters, mixed meter, hemiola and polyrhythm.',
  lessons: [simpleAndCompound, sixEight, nineAndTwelveEight, oddMeters, mixedMeterAndHemiola, threeAgainstTwo],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      {
        type: 'match-pairs',
        prompt: 'Match each time signature with its kind.',
        pairs: [
          { left: '2/4', right: 'Simple duple' },
          { left: '3/4', right: 'Simple triple' },
          { left: '6/8', right: 'Compound duple' },
          { left: '9/8', right: 'Compound triple' },
        ],
        explain: 'Simple beats split in two, compound beats in three. Duple means two beats, triple three.',
      },
      {
        type: 'choice',
        prompt: 'In 9/8, which note lasts exactly one beat?',
        options: [
          { text: 'The dotted quarter note', correct: true },
          { text: 'The eighth note', why: 'The eighth is the division: three make a beat.' },
          { text: 'The quarter note', why: 'A quarter note is two eighths; a compound beat is three.' },
        ],
        explain: 'Compound beats are dotted notes: in 9/8 each of the three beats is a dotted quarter, three eighths long.',
      },
      {
        type: 'true-false',
        statement: 'Common time, written as a big C, means 4/4.',
        answer: true,
        explain: 'The plain C is common time, 4/4. With a vertical line through it, it is cut time, 2/2.',
      },
      {
        type: 'choice',
        prompt: 'What does cut time mean?',
        options: [
          { text: '2/2: two half-note beats per bar', correct: true },
          { text: '4/4: four quarter-note beats', why: 'That is common time.' },
          { text: '6/8: two dotted-quarter beats', why: 'Cut time is simple time: its beats split in two.' },
        ],
        explain: 'Cut time, a C with a line through it, is 2/2.',
      },
      {
        type: 'choice',
        prompt: 'How many beats are in a bar of 12/8?',
        options: [{ text: '3' }, { text: '4', correct: true }, { text: '6' }, { text: '12', why: 'Twelve counts the eighth notes, not the beats.' }],
        shuffle: false,
        explain: 'Twelve eighths in groups of three: four dotted-quarter beats.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Counting a bar of 6/8 in six, where do the two strong counts fall?',
        text: 'On count 1 and count ___.',
        blanks: ['4'],
        bank: ['2', '3', '5'],
        explain: 'Two beats of three eighths: the second beat starts on count 4.',
      },
      {
        type: 'choice',
        prompt: 'Which time signature groups its six eighth notes as 2+2+2?',
        options: [
          { text: '3/4', correct: true },
          { text: '6/8', why: '6/8 groups them 3+3: two beats.' },
          { text: '12/8', why: '12/8 holds twelve eighths, in four threes.' },
        ],
        explain: '3/4 is three quarter-note beats: three pairs of eighths. 6/8 holds the same six eighths as two threes.',
      },
      {
        type: 'choice',
        prompt: 'How is a bar of 5/4 usually felt?',
        options: [
          { text: 'As 3+2 or 2+3', correct: true },
          { text: 'As 2+2+2', why: 'That adds up to six.' },
          { text: 'As 3+3', why: 'That adds up to six.' },
        ],
        explain: 'Five beats cannot be split evenly, so they are felt as a three and a two.',
      },
      {
        type: 'choice',
        prompt: 'In a bar of 2+2+3/8, on which eighth notes do the groups start?',
        options: [
          { text: '1, 3 and 5', correct: true },
          { text: '1, 4 and 6', why: 'That is 3+2+2: the long group first.' },
          { text: '1, 3 and 6', why: 'That is 2+3+2.' },
        ],
        explain: 'Groups of 2, 2 and 3 start on eighths 1, 3 and 5.',
      },
      {
        type: 'true-false',
        statement: 'Mixed meter changes the time signature from bar to bar.',
        answer: true,
        explain: 'For example 3/4, then 2/4, then 3/4: the beat keeps its speed, the bars change size.',
      },
      {
        type: 'choice',
        prompt: 'Two bars of 3/4 are accented on beats 1 and 3, then on beat 2. What is this?',
        options: [
          { text: 'A hemiola', correct: true },
          { text: 'Mixed meter', why: 'The time signature stays 3/4.' },
          { text: 'A change of tempo', why: 'The beats keep their speed; only the accents move.' },
        ],
        explain: 'Accents every second beat make two bars of three feel like three groups of two: a hemiola.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Counted in six, complete the combined rhythm of 3 against 2.',
        text: '1, 3, ___ and 5',
        blanks: ['4'],
        bank: ['2', '6'],
        explain: 'The twos fall on 1 and 4, the threes on 1, 3 and 5.',
      },
      {
        type: 'listen-choice',
        prompt: 'Listen to the low notes. Is this 3/4 or 6/8?',
        sound: { kind: 'tab', notes: run(AM_SIX_EIGHT, 'e', 2), tempo: 100 },
        options: [{ text: '3/4: three beats of two' }, { text: '6/8: two beats of three', correct: true }],
        shuffle: false,
        explain: 'The low notes came on counts 1 and 4: two beats of three. That is 6/8.',
      },
      {
        type: 'tap-rhythm',
        prompt: 'Tap the four beats of a bar of 12/8 while the eighth notes click.',
        rhythm: { pattern: 'q. q. q. q.', time: '12/8' },
        tempo: 90,
        show: 'both',
        explain: 'One tap every three clicks: the four dotted-quarter beats of 12/8.',
      },
      { generate: 'meter', params: { ask: 'beats', signatures: ['6/8', '9/8', '12/8', '7/8', '5/4'] } },
    ],
  },
};

export default unit;
