/**
 * Theory Path, unit 9: Rhythm for strumming. Written from the syllabus entries in
 * `src/content/plan/theory-path.json` (unit `strumming-rhythm`), one lesson per entry, in order:
 * each lesson opens with the "on the guitar" picture, asks the planned exercises, ends with the
 * planned drills, and turns every planned fact into a review card.
 *
 * `strumming-rhythm.test.ts` cross-checks every rhythm against the theory engine's note values
 * (bar lengths, dotted lengths, where each tap falls, the counting), the strumming patterns, the
 * notes of the traditional tune and what each listening question plays.
 *
 * Notes for readers of the code:
 * - Rhythm is heard, but every idea is also asked as a quiet question (choice, true-false,
 *   match-pairs, fill-blanks), so the unit still teaches on a silent bus with Sound off.
 * - A lesson `Sound` cannot accent one strum (README, "Known limits"), so the planned "which beat
 *   is accented?" question asks instead where the muted strums fall, which the synth plays
 *   truthfully. A rhythm's clicks are accented only on beat 1 of each bar, and the pickup and
 *   3/4 questions are built on exactly that.
 * - Rhythm pictures cannot draw accent marks, x note heads or a short pickup bar: those are
 *   described in words, and a pickup is drawn as a rest on beat 1.
 * - `teaches` is shown as plain text on the map, so it carries no chord symbols.
 */
import type { Lesson, TabNote, Unit } from '@/lessons';

const U = 'strumming-rhythm';

/** "When the Saints" (traditional), in C: the pickup C E F on beats 2, 3, 4, then G on beat 1. */
const SAINTS: TabNote[] = [
  { rest: true, duration: 'q' },
  { string: 2, fret: 1, duration: 'q' },
  { string: 1, fret: 0, duration: 'q' },
  { string: 1, fret: 1, duration: 'q' },
  { string: 1, fret: 3, duration: 'w' },
];
/** The same notes without the silent beat 1, to play. */
const SAINTS_NOTES = SAINTS.filter((n): n is Extract<TabNote, { string: number }> => 'string' in n);

/** Down on 1, down-up on 2, up on the & of 3, down-up on 4 (pulse-and-beat's pattern). */
const PATTERN = 'q e e er e e e';

const dottedNotes: Lesson = {
  id: 'dotted-notes',
  title: 'Dotted notes',
  teaches: 'A dot after a note makes it half as long again.',
  minutes: 3,
  skill: `theory:${U}:dotted-notes`,
  steps: [
    {
      type: 'card',
      title: 'Half as long again',
      body: 'A {t:dotted-note|dot} after a note adds **half of its own length**. A half note lasts 2 beats; the dot adds 1, so a **dotted half note** lasts 3. A quarter note lasts 1 beat; the dot adds half a beat, so a **dotted quarter** lasts 1½.',
      figure: { kind: 'rhythm', pattern: 'h. q | q. e h', tempo: 70, caption: 'A dotted half and a quarter; then a dotted quarter, an eighth and a half.' },
    },
    {
      type: 'choice',
      prompt: 'How many beats does a dotted quarter note last in 4/4?',
      options: [
        { text: '1', why: 'One beat is a plain quarter note. The dot adds half of that.' },
        { text: '1½', correct: true },
        { text: '2', why: 'Two beats is a half note.' },
        { text: '3', why: 'Three beats is a dotted half note.' },
      ],
      shuffle: false,
      explain: 'A quarter note is 1 beat, and the dot adds half of it, ½ a beat: 1 + ½ = 1½ beats.',
      fact: 'strumming-dotted-lengths',
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the sum.',
      text: 'A dotted half note lasts as long as a half note plus a ___ note.',
      blanks: ['quarter'],
      bank: ['eighth', 'whole'],
      explain: 'The dot adds half of the note\'s own length. Half of a half note is a quarter note: 2 + 1 = 3 beats.',
      fact: 'strumming-dot-adds-half',
    },
    {
      type: 'card',
      title: 'Strum it',
      body: 'Count "1 2 3 4" out loud. Strum {c:Em} on 1 and let it ring through 2 and 3; strum again on 4. Keep your hand swinging down and up the whole time, just missing the strings in between.',
      figure: { kind: 'audio', sound: { kind: 'rhythm', pattern: 'h. q | h. q', tempo: 70 }, label: 'Hear dotted half, quarter' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap one bar: a dotted half note, then a quarter note.',
      rhythm: { pattern: 'h. q' },
      tempo: 70,
      show: 'both',
      explain: 'Tap on 1 and on 4. The dotted half note lasts three beats, 1, 2 and 3, so there is no tap on 2 or 3.',
    },
    {
      type: 'card',
      title: 'A dotted quarter and an eighth',
      body: 'A dotted quarter is often followed by an eighth note: 1½ beats plus ½ a beat makes **2 beats**. Count "1 & 2 &": the dotted quarter starts on 1 and holds through 2, and the eighth note falls on the & of 2.',
      figure: { kind: 'rhythm', pattern: 'q. e h | q. e h', tempo: 70, caption: 'Dotted quarter, eighth, half: taps on 1, the & of 2, and 3.' },
    },
    {
      type: 'choice',
      prompt: 'A dotted quarter note and an eighth note, one after the other. How many beats do they fill?',
      options: [{ text: '1' }, { text: '1½', why: 'That is the dotted quarter alone. Add the eighth note\'s ½ beat.' }, { text: '2', correct: true }, { text: '3' }],
      shuffle: false,
      explain: '1½ beats plus ½ a beat is 2 beats: as long as a half note.',
      fact: 'strumming-dotted-quarter-eighth',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap this bar: a dotted quarter, an eighth, then a half note.',
      rhythm: { pattern: 'q. e h' },
      tempo: 70,
      show: 'both',
      explain: 'Tap on 1, on the & of 2, and on 3. The dotted quarter holds through beat 2.',
    },
    // Only quarters and halves: with eighths in the pool the drill also asks for a dotted eighth (¾ of a beat), which this lesson never teaches.
    { generate: 'note-value-math', params: { ask: 'beats', values: ['quarter', 'half'], dotted: true } },
    { generate: 'note-value-math', params: { ask: 'fit', values: ['quarter', 'half', 'eighth'], dotted: true } },
  ],
  facts: [
    {
      id: 'strumming-dot-adds-half',
      front: 'What does a dot after a note do?',
      back: 'It adds half of the note\'s own length: the note lasts half as long again.',
      ask: {
        type: 'choice',
        prompt: 'A dot after a note makes it…',
        options: [
          { text: 'Half as long again', correct: true },
          { text: 'Twice as long', why: 'The dot adds half the length, not the whole length again.' },
          { text: 'Half as long', why: 'A dot makes a note longer, never shorter.' },
        ],
        shuffle: false,
        explain: 'The dot adds half of the note\'s own length: a dotted half note lasts 2 + 1 = 3 beats.',
      },
    },
    {
      id: 'strumming-dotted-lengths',
      front: 'In 4/4, how long are a dotted half note and a dotted quarter note?',
      back: 'A dotted half note lasts 3 beats; a dotted quarter note lasts 1½ beats.',
      ask: {
        type: 'match-pairs',
        prompt: 'Match each note with how long it lasts in 4/4.',
        pairs: [
          { left: 'Dotted half note', right: '3 beats' },
          { left: 'Half note', right: '2 beats' },
          { left: 'Dotted quarter note', right: '1½ beats' },
          { left: 'Quarter note', right: '1 beat' },
        ],
        explain: 'A dot adds half the note\'s length: 2 + 1 = 3, and 1 + ½ = 1½.',
      },
    },
    {
      id: 'strumming-dotted-quarter-eighth',
      front: 'How long do a dotted quarter note and an eighth note last together?',
      back: 'Two beats: 1½ + ½.',
    },
  ],
};

const ties: Lesson = {
  id: 'ties',
  title: 'Ties',
  teaches: 'A tie joins two notes of the same pitch into one longer sound, even across a bar line.',
  minutes: 2,
  skill: `theory:${U}:ties`,
  steps: [
    {
      type: 'card',
      title: 'One sound, two notes',
      body: 'A {t:tie} is a curved line joining two notes of the **same pitch**. Play the first one and hold it through the second: one sound, as long as both together. Here the last note of bar 1 is tied to beat 1 of bar 2.',
      figure: { kind: 'rhythm', pattern: 'h q q | ~q q h', tempo: 70, caption: 'Beat 4 of bar 1 is tied into beat 1 of bar 2: no new strum there.' },
    },
    {
      type: 'true-false',
      statement: 'You strike a tied note twice.',
      answer: false,
      explain: 'You strike it once and hold it for the length of both notes. The second note of a tie is never played again.',
      fact: 'strumming-tie-meaning',
    },
    {
      type: 'card',
      title: 'Across the bar line',
      body: 'A dot can only lengthen a note inside its own bar. A tie can carry a sound **across the bar line**. Try it: strum {c:Am} (or {c:Em}) on beat 4, let it ring through beat 1 of the next bar, and strum again on beat 2.',
      figure: { kind: 'audio', sound: { kind: 'rhythm', pattern: 'h q q | ~q q h', tempo: 70 }, label: 'Hear the tied rhythm' },
      tip: 'Count beat 1 out loud even though you do not strum it. Your hand still swings down there, just missing the strings.',
    },
    {
      type: 'choice',
      prompt: 'Which one can carry a note across a bar line?',
      options: [
        { text: 'A tie', correct: true },
        { text: 'A dot', why: 'A dot lengthens a note only inside its own bar.' },
        { text: 'A rest', why: 'A rest is a silence, not a longer note.' },
      ],
      explain: 'A tie joins a note to one in the next bar, so the sound carries over the bar line. A dot cannot do that.',
      fact: 'strumming-tie-bar-line',
    },
    {
      type: 'card',
      title: 'Tie or slur?',
      body: 'A curve between two **different** notes is not a tie but a {t:slur}: play them smoothly, one into the next. In guitar music a slur usually means a {t:hammer-on} or a {t:pull-off}: you pick only the first note.',
    },
    {
      type: 'choice',
      prompt: 'A curved line joins a {n:C} and a {n:D}. Is it a tie or a slur?',
      options: [
        { text: 'A slur', correct: true },
        { text: 'A tie', why: 'A tie only ever joins two notes of the same pitch.' },
      ],
      shuffle: false,
      explain: '{n:C} and {n:D} are different notes, so the curve is a slur. A tie joins two notes of the same pitch.',
      fact: 'strumming-slur-not-tie',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap two bars. Beat 4 of bar 1 is tied to beat 1 of bar 2: no tap on that beat 1.',
      rhythm: { pattern: 'h q q | ~q q h' },
      tempo: 70,
      show: 'both',
      explain: 'Tap on 1, 3 and 4, then on 2 and 3 of bar 2. The tied note keeps sounding through beat 1, so you do not tap there.',
    },
    { generate: 'rhythm-tap', params: { values: ['quarter', 'half', 'eighth'], tempo: 70 } },
  ],
  facts: [
    {
      id: 'strumming-tie-meaning',
      front: 'What does a tie between two notes of the same pitch mean?',
      back: 'Play the first note and hold it for both lengths: one sound, not two.',
      ask: {
        type: 'true-false',
        statement: 'Two tied notes are played as one sound, as long as both together.',
        answer: true,
        explain: 'Strike the first note and hold it through the second.',
      },
    },
    {
      id: 'strumming-tie-bar-line',
      front: 'What can a tie do that a dot cannot?',
      back: 'Carry a note across a bar line.',
    },
    {
      id: 'strumming-slur-not-tie',
      front: 'A curve joins two different notes. Is it a tie?',
      back: 'No. A curve between notes of different pitches is a slur; a tie joins two notes of the same pitch.',
      ask: {
        type: 'choice',
        prompt: 'A curved line joins an {n:E} and a {n:G}. What is it?',
        options: [{ text: 'A slur', correct: true }, { text: 'A tie', why: 'A tie only joins two notes of the same pitch.' }],
        shuffle: false,
        explain: 'Different notes, so it is a slur.',
      },
    },
  ],
};

const threeFourTime: Lesson = {
  id: 'three-four-time',
  title: 'Three beats in a bar',
  teaches: 'In 3/4 time there are three beats in each bar, with the strongest on beat 1.',
  minutes: 3,
  skill: `theory:${U}:three-four-time`,
  steps: [
    {
      type: 'card',
      title: 'Count to three',
      body: 'In **3/4** time every bar has **three** beats: **1** 2 3, **1** 2 3. Beat 1 is the strongest. It is the swaying feel of the {t:waltz}, a dance in three.',
      figure: { kind: 'rhythm', pattern: 'q q q | q q q', time: '3/4', tempo: 90, caption: 'Two bars of 3/4: 1 2 3, 1 2 3.' },
    },
    {
      type: 'card',
      title: 'Bass, strum, strum',
      body: 'Play it on {c:Am}: pick the open {n:A} string, string 5, on beat 1, then strum strings 4 to 1 on beats 2 and 3. **Bass**, strum, strum. Listen for the louder click on each beat 1.',
      figure: { kind: 'audio', sound: { kind: 'rhythm', pattern: 'q q q | q q q | q q q | q q q', time: '3/4', tempo: 100 }, label: 'Hear 1 2 3, 1 2 3' },
    },
    {
      type: 'choice',
      prompt: 'How many beats are in each bar of 3/4?',
      options: [{ text: '2' }, { text: '3', correct: true }, { text: '4', why: 'Four beats a bar is 4/4.' }],
      shuffle: false,
      explain: 'The top number says it: 3/4 has three beats in every bar, counted 1 2 3.',
      fact: 'strumming-three-four',
    },
    {
      type: 'card',
      title: 'What the two numbers mean',
      body: 'A {t:time-signature} has two numbers. The **top** one counts the beats in each bar. A **bottom** 4 says each beat is a {t:quarter-note|quarter note}. So 3/4 is three quarter-note beats a bar, and 4/4 is four.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each part with its meaning.',
      pairs: [
        { left: '3/4', right: 'Three beats a bar' },
        { left: '4/4', right: 'Four beats a bar' },
        { left: 'The top number', right: 'Beats in each bar' },
        { left: 'A bottom 4', right: 'Each beat is a quarter note' },
      ],
      explain: 'The top number counts the beats in a bar; a bottom 4 makes each beat a quarter note.',
      fact: 'strumming-time-signature',
    },
    {
      type: 'choice',
      prompt: 'Which single note fills a whole bar of 3/4?',
      options: [
        { text: 'A dotted half note', correct: true },
        { text: 'A half note', why: 'A half note is two beats: one beat short.' },
        { text: 'A whole note', why: 'A whole note is four beats: too long for a bar of three.' },
      ],
      explain: 'A bar of 3/4 holds three beats, and a dotted half note lasts 2 + 1 = 3 beats.',
      fact: 'strumming-dotted-half-bar',
    },
    {
      type: 'true-false',
      statement: 'The waltz is a dance in 3/4.',
      answer: true,
      explain: 'A waltz sways in threes: **1** 2 3, **1** 2 3.',
      fact: 'strumming-waltz',
    },
    {
      type: 'listen-choice',
      prompt: 'Listen for the louder clicks. Is this music counted in 3 or in 4?',
      sound: { kind: 'rhythm', pattern: 'h q | q q q | h q | q q q', time: '3/4', tempo: 100 },
      options: [{ text: 'In 3', correct: true }, { text: 'In 4' }],
      shuffle: false,
      explain: 'A louder click came every three beats: 1 2 3, 1 2 3. That is 3/4.',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap two bars of 3/4, every beat. Lean a little on each beat 1.',
      rhythm: { pattern: 'q q q | q q q', time: '3/4' },
      tempo: 90,
      show: 'both',
      explain: 'Three even taps a bar: **1** 2 3, **1** 2 3. The count-in clicks louder on beat 1 too.',
    },
    { generate: 'meter', params: { ask: 'beats', signatures: ['3/4', '4/4'] } },
  ],
  facts: [
    {
      id: 'strumming-three-four',
      front: 'How many beats are in a bar of 3/4, and which is the strongest?',
      back: 'Three, with the strongest on beat 1.',
      ask: { generate: 'meter', params: { ask: 'beats', signatures: ['3/4', '4/4'] } },
    },
    { id: 'strumming-waltz', front: 'Which dance is in 3/4?', back: 'The waltz.' },
    {
      id: 'strumming-dotted-half-bar',
      front: 'Which single note fills a whole bar of 3/4?',
      back: 'A dotted half note: 2 + 1 = 3 beats.',
    },
    {
      id: 'strumming-time-signature',
      front: 'In a time signature such as 3/4 or 4/4, what do the two numbers mean?',
      back: 'The top number is the number of beats in a bar; a bottom 4 means each beat is a quarter note.',
      ask: { generate: 'meter', params: { ask: 'unit', signatures: ['3/4', '4/4'] } },
    },
  ],
};

const pickupNotes: Lesson = {
  id: 'pickup-notes',
  title: 'Pickup notes: starting before beat 1',
  teaches: 'Some tunes start with pickup notes before the first full bar: count the missing beats, then land on beat 1.',
  minutes: 3,
  skill: `theory:${U}:pickup-notes`,
  steps: [
    {
      type: 'card',
      title: 'Before beat 1',
      body: 'Some tunes start **before** beat 1. Those early notes are a {t:pickup}. "When the Saints Go Marching In" starts on beat 2: "Oh when the" on beats 2, 3 and 4, then "**Saints**" lands on beat 1. Count **1** silently, play on 2, 3, 4, and land on the next 1.',
      figure: { kind: 'tab', tempo: 80, notes: SAINTS, caption: 'When the Saints (traditional), in {k:C major}: {n:C} {n:E} {n:F}, then {n:G}.' },
    },
    {
      type: 'choice',
      prompt: 'In "When the Saints", on which beat does "Saints" land?',
      options: [
        { text: 'Beat 1', correct: true },
        { text: 'Beat 2', why: 'Beat 2 is where the tune starts, on "Oh".' },
        { text: 'Beat 3' },
        { text: 'Beat 4', why: 'Beat 4 is "the", the last pickup note.' },
      ],
      shuffle: false,
      explain: '"Oh when the" fills beats 2, 3 and 4 as a pickup, so "Saints" lands on beat 1 of the first full bar.',
      fact: 'strumming-saints-pickup',
    },
    {
      type: 'tap-rhythm',
      prompt: 'After the count-in, tap the opening of When the Saints: beats 2, 3 and 4, then a long note on 1.',
      rhythm: { pattern: 'qr q q q | w' },
      tempo: 80,
      show: 'both',
      explain: 'Beat 1 is silent: count it. Tap on 2, 3 and 4 ("Oh when the"), then on the next 1 ("Saints"), and hold.',
    },
    {
      type: 'play-phrase',
      prompt: 'Play the pickup and "Saints": string 2 fret 1, open string 1, string 1 fret 1, then string 1 fret 3, held.',
      notes: SAINTS_NOTES,
      octave: 'exact',
      tempo: 80,
      explain: '{n:C}, {n:E}, {n:F} on beats 2, 3 and 4, then {n:G} on beat 1. Count "1" to yourself before you start.',
      alternative: {
        type: 'order',
        prompt: 'Put the pickup and "Saints" in the order you play them.',
        figure: { kind: 'tab', tempo: 80, notes: SAINTS },
        tiles: ['{n:C}', '{n:E}', '{n:F}', '{n:G}'],
        explain: 'String 2 fret 1 ({n:C}), open string 1 ({n:E}), string 1 fret 1 ({n:F}), then string 1 fret 3 ({n:G}) on beat 1.',
      },
    },
    {
      type: 'card',
      title: 'My Bonnie: one pickup in 3/4',
      body: '"My Bonnie Lies over the Ocean" is in 3/4. It starts with **one** pickup note, "My", on beat 3. "Bon-" lands on the next beat 1. Count "1 2" silently, then sing.',
      figure: { kind: 'rhythm', pattern: 'qr qr q', time: '3/4', tempo: 90, caption: 'Count 1 2, then "My" on beat 3.' },
    },
    {
      type: 'choice',
      prompt: '"My Bonnie Lies over the Ocean" is in 3/4. On which beat does its first word, "My", fall?',
      options: [{ text: 'Beat 1', why: 'Beat 1 is "Bon-": "My" comes just before it.' }, { text: 'Beat 2' }, { text: 'Beat 3', correct: true }],
      shuffle: false,
      explain: '"My" is a one-note pickup on beat 3, the last beat of a 3/4 bar. "Bon-" lands on beat 1.',
      fact: 'strumming-bonnie-pickup',
    },
    {
      type: 'card',
      title: 'The short last bar',
      body: 'Written music often takes the pickup\'s length off the **last bar**. A tune in 4/4 with three beats of pickup may end with a bar of just one beat. Together the two make one full bar.',
    },
    {
      type: 'choice',
      prompt: 'A tune in 4/4 starts with a pickup of three beats. How long is its last bar often written?',
      options: [
        { text: '1 beat', correct: true },
        { text: '3 beats', why: 'The pickup and the last bar together make one full bar: 3 + 1 = 4.' },
        { text: '4 beats', why: 'It can be, but often the last bar is shortened to make up for the pickup.' },
      ],
      shuffle: false,
      explain: 'The pickup (3 beats) and the short last bar (1 beat) add up to one full bar of 4/4.',
      fact: 'strumming-pickup-last-bar',
    },
    {
      type: 'listen-choice',
      prompt: 'The louder click is beat 1. Does this rhythm start on beat 1, or with a pickup?',
      sound: { kind: 'rhythm', pattern: 'qr q q q | h h', tempo: 80 },
      options: [{ text: 'On beat 1' }, { text: 'With a pickup', correct: true }],
      shuffle: false,
      explain: 'Three softer clicks came first, then the louder beat 1: a three-note pickup, like "Oh when the Saints".',
    },
  ],
  facts: [
    {
      id: 'strumming-pickup-meaning',
      front: 'What are notes before the first full bar called?',
      back: 'A pickup, also called an anacrusis.',
      ask: {
        type: 'choice',
        prompt: 'A tune starts with three notes before its first full bar. What are they called?',
        options: [
          { text: 'A pickup', correct: true },
          { text: 'A tie', why: 'A tie joins two notes of the same pitch.' },
          { text: 'A backbeat', why: 'The backbeat is a stress on beats 2 and 4.' },
        ],
        explain: 'Notes before the first full bar are a pickup, or anacrusis.',
      },
    },
    {
      id: 'strumming-saints-pickup',
      front: 'How does "When the Saints Go Marching In" start?',
      back: 'With three pickup notes on beats 2, 3 and 4 ("Oh when the"); "Saints" lands on beat 1.',
    },
    {
      id: 'strumming-bonnie-pickup',
      front: 'How does "My Bonnie Lies over the Ocean" start?',
      back: 'In 3/4, with one pickup note on beat 3: "My". "Bon-" lands on beat 1.',
    },
    {
      id: 'strumming-pickup-last-bar',
      front: 'A tune starts with a pickup. How is its last bar often written?',
      back: 'Shortened by the length of the pickup, so the two together make one full bar.',
    },
  ],
};

const sixteenthNotes: Lesson = {
  id: 'sixteenth-notes',
  title: 'Sixteenth notes',
  teaches: 'Four sixteenth notes fit in one quarter-note beat, counted "1 e & a".',
  minutes: 3,
  skill: `theory:${U}:sixteenth-notes`,
  steps: [
    {
      type: 'card',
      title: 'Four to a beat',
      body: 'Split each beat into four and you get {t:sixteenth-note|sixteenth notes}. Count them **1 e & a**, said "one-ee-and-uh". The number is the beat, the & falls halfway, and e and a fill the gaps.',
      figure: { kind: 'rhythm', pattern: 's s s s q q q', tempo: 60, caption: 'Four sixteenth notes fill beat 1: 1 e & a. Then 2, 3, 4.' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Count two beats of sixteenth notes.',
      text: '1  e  ___  a  2  ___  &  a',
      blanks: ['&', 'e'],
      bank: ['3', 'a'],
      explain: 'Every beat counts 1 e & a: the number, e, &, a. Then the next number: 2 e & a.',
      fact: 'strumming-sixteenth-counting',
    },
    {
      type: 'choice',
      prompt: 'How many sixteenth notes fill a bar of 4/4?',
      options: [{ text: '4', why: 'Four sixteenth notes fill one beat. A bar has four beats.' }, { text: '8', why: 'Eight is how many eighth notes fill a bar.' }, { text: '12' }, { text: '16', correct: true }],
      shuffle: false,
      explain: 'Four sixteenth notes in each beat, four beats in a bar: 4 × 4 = 16.',
    },
    {
      type: 'card',
      title: 'Two flags, two beams',
      body: 'An eighth note has one {t:flag}; a sixteenth note has **two**. In a group, sixteenth notes are joined by **two** {t:beam|beams} instead.',
      figure: {
        kind: 'staff',
        time: '4/4',
        notes: [
          { note: 'B3', duration: 's' },
          { note: 'B3', duration: 's' },
          { note: 'B3', duration: 's' },
          { note: 'B3', duration: 's' },
          { note: 'B3', duration: 'q' },
          { note: 'B3', duration: 'q' },
          { note: 'B3', duration: 'q' },
        ],
        caption: 'Four sixteenth notes joined by two beams, then three quarter notes.',
      },
    },
    {
      type: 'choice',
      prompt: 'How are four sixteenth notes in a row usually written?',
      options: [
        { text: 'Joined by two beams', correct: true },
        { text: 'Joined by one beam', why: 'One beam joins eighth notes.' },
        { text: 'With hollow heads', why: 'Hollow heads are for half and whole notes.' },
      ],
      explain: 'Sixteenth notes have two flags, or two beams when they are grouped.',
      fact: 'strumming-sixteenth-beams',
    },
    {
      type: 'card',
      title: 'Strum them',
      body: 'Lay your fretting hand flat across the strings to {t:mute} them. At 60 BPM, strum every sixteenth: **down** on each number and &, **up** on each e and a. Then try it on {c:Em}.',
      figure: { kind: 'audio', sound: { kind: 'strum', chord: 'Em', pattern: 'XXXXXXXXXXXXXXXX', grid: 'sixteenth', tempo: 60, repeat: 1 }, label: 'Hear muted sixteenths' },
    },
    {
      type: 'true-false',
      statement: 'In sixteenth-note strumming, the hand goes up on every e and every a.',
      answer: true,
      explain: 'Down on the numbers and the &s, up on the e\'s and a\'s: down-up-down-up for every beat.',
      fact: 'strumming-sixteenth-strokes',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap four sixteenth notes on beat 1, then three quarter notes.',
      rhythm: { pattern: 's s s s q q q' },
      tempo: 60,
      show: 'both',
      explain: 'Four quick, even taps fill beat 1 (1 e & a), then one tap each on 2, 3 and 4.',
    },
    { generate: 'note-value-math', params: { ask: 'fit', values: ['quarter', 'eighth', 'sixteenth', 'half'] }, fact: 'strumming-four-sixteenths' },
    { generate: 'rhythm-tap', params: { values: ['quarter', 'eighth', 'sixteenth'], tempo: 60 } },
  ],
  facts: [
    {
      id: 'strumming-four-sixteenths',
      front: 'How many sixteenth notes last as long as one quarter note?',
      back: 'Four.',
      ask: {
        type: 'type-answer',
        prompt: 'How many sixteenth notes last as long as one quarter note?',
        answer: { kind: 'number', value: 4 },
        input: 'keypad',
        explain: 'A sixteenth note is a quarter of a beat, so four fill one quarter-note beat.',
      },
    },
    {
      id: 'strumming-sixteenth-counting',
      front: 'How are sixteenth notes counted in 4/4?',
      back: '1 e & a 2 e & a 3 e & a 4 e & a.',
      ask: {
        type: 'fill-blanks',
        prompt: 'Count one beat of sixteenth notes.',
        text: '1  ___  &  ___',
        blanks: ['e', 'a'],
        bank: ['2'],
        explain: 'Each beat is counted 1 e & a.',
      },
    },
    {
      id: 'strumming-sixteenth-beams',
      front: 'How do sixteenth notes look?',
      back: 'Two flags, or two beams when they are grouped.',
    },
    {
      id: 'strumming-sixteenth-strokes',
      front: 'In sixteenth-note strumming, when does the hand go down and when up?',
      back: 'Down on the numbers and the &s, up on the e\'s and a\'s.',
    },
  ],
};

const changingChordsInTime: Lesson = {
  id: 'changing-chords-in-time',
  title: 'Changing chords in time',
  teaches: 'Chord changes land on beat 1 of the bar, and a chart tells you how many beats each chord lasts.',
  minutes: 3,
  skill: `theory:${U}:changing-chords-in-time`,
  steps: [
    {
      type: 'card',
      title: 'Change on beat 1',
      body: 'A {t:slash-chart|slash chart} gives each beat a mark: the chord where it starts, then a slash (/) for each beat it carries on. **| {c:Em} / / / | {c:Am} / / / |** is four beats of {c:Em}, then four of {c:Am}. Change on **beat 1** of the new bar.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['Em', 'Am', 'Em', 'Am'], beats: 4, tempo: 70 }, label: 'Hear {c:Em} and {c:Am}, a bar each' },
    },
    {
      type: 'choice',
      prompt: 'In the chart | {c:Em} / {c:Am} / |, on which beat does {c:Am} start?',
      options: [
        { text: 'Beat 1', why: 'Beat 1 is {c:Em}, the first mark.' },
        { text: 'Beat 2', why: 'Beat 2 is the slash after {c:Em}: {c:Em} carries on.' },
        { text: 'Beat 3', correct: true },
        { text: 'Beat 4', why: 'Beat 4 is the slash after {c:Am}.' },
      ],
      shuffle: false,
      explain: 'One mark per beat: {c:Em} (1), / (2), {c:Am} (3), / (4). So {c:Am} starts on beat 3 and lasts two beats.',
      fact: 'strumming-slash-chart',
    },
    {
      type: 'card',
      title: 'From E minor to A minor',
      body: 'Fingers 2 and 3 move over one string, from strings 5 and 4 to strings 4 and 3, and finger 1 joins on string 2 at fret 1. Practise the move slowly until your fingers land together.',
      figure: { kind: 'chord', symbol: 'Am', frets: 'x02210', fingers: 'x02310', caption: '{c:Am}: fingers 2 and 3 one string over from {c:Em}, plus finger 1.' },
    },
    {
      type: 'card',
      title: 'Buy some time',
      body: 'Play down, down-up, up, down-up, and keep the hand swinging through the change. The last upstroke of the bar, on the & of 4, may hit the **open strings** while your fingers move. It barely shows; a late beat 1 does.',
      figure: { kind: 'audio', sound: { kind: 'strum', chord: 'Em', pattern: 'D-DU-UDU', tempo: 70 }, label: 'Hear the strumming pattern' },
    },
    {
      type: 'true-false',
      statement: 'The last upstroke before a chord change may hit the open strings, to give your fretting hand time to move.',
      answer: true,
      explain: 'Lift the fingers on the & of 4 and let that upstroke ring open. Your fingers then land on the new chord in time for beat 1.',
      fact: 'strumming-open-upstroke',
    },
    {
      type: 'choice',
      prompt: 'Unless the chart says otherwise, when do you change to the next chord?',
      options: [
        { text: 'On beat 1 of the next bar', correct: true },
        { text: 'On beat 4, a beat early', why: 'Beat 4 still belongs to the old chord. The new one starts on 1.' },
        { text: 'Whenever your fingers are ready', why: 'The beat does not wait: practise the move until it lands on beat 1.' },
      ],
      shuffle: false,
      explain: 'Chord changes land on beat 1, the start of the bar, unless the chart marks another beat.',
      fact: 'strumming-change-on-one',
    },
    {
      type: 'play-chord',
      prompt: 'Strum a bar of {c:Em}, then change to {c:Am} on beat 1 and strum it. Hold the {c:Am}.',
      chord: 'Am',
      frets: 'x02210',
      explain: '{c:Am} is x02210. If it comes late, slow the strumming down until the change lands on beat 1.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'Am',
        frets: 'x02210',
        accept: 'this-shape',
        prompt: 'This is {c:Em}. Move fingers 2 and 3 over one string and add finger 1: place {c:Am}.',
        figure: { kind: 'chord', symbol: 'Em', frets: '022000', fingers: '023000' },
        explain: 'Strings 4 and 3 at fret 2, string 2 at fret 1, string 5 open, string 6 not played: x02210.',
      },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap the pattern for two bars without stopping at the bar line: 1, 2 &, & of 3, 4 &.',
      rhythm: { pattern: `${PATTERN} | ${PATTERN}` },
      tempo: 70,
      show: 'both',
      explain: 'Six taps a bar: 1, 2 &, the & of 3, 4 &. The & of 4 leads straight into the next beat 1, where the chord changes.',
    },
    { generate: 'rhythm-tap', params: { values: ['quarter', 'eighth'], bars: 2, tempo: 70 } },
  ],
  facts: [
    {
      id: 'strumming-change-on-one',
      front: 'Unless the chart says otherwise, on which beat do you change to the next chord?',
      back: 'On beat 1 of the bar.',
    },
    {
      id: 'strumming-open-upstroke',
      front: 'How can you buy time for a chord change while strumming?',
      back: 'Let the last upstroke before the change hit the open strings while the fretting hand moves.',
    },
    {
      id: 'strumming-slash-chart',
      front: 'How does a slash chart such as | {c:Em} / / / | show how long a chord lasts?',
      back: 'One mark per beat: the chord symbol on the beat where it starts, then a slash (/) for each beat after it.',
      ask: {
        type: 'type-answer',
        prompt: 'In the chart | {c:Am} / / / | {c:Dm} / {c:E} / |, how many beats does {c:Dm} last?',
        answer: { kind: 'number', value: 2 },
        input: 'keypad',
        explain: '{c:Dm} gets its own beat and one slash: two beats. Then {c:E} takes beats 3 and 4.',
      },
    },
  ],
};

const accentsAndMutedStrums: Lesson = {
  id: 'accents-and-muted-strums',
  title: 'Accents and muted strums',
  teaches: 'Accents and muted strums shape a strumming pattern, and stressing beats 2 and 4 gives the backbeat.',
  minutes: 3,
  skill: `theory:${U}:accents-and-muted-strums`,
  steps: [
    {
      type: 'card',
      title: 'Strum, chick, strum-strum, chick',
      body: 'Strum {c:E} down on 1. On 2, lay your fretting fingers flat across all six strings and strum: a dry "chick". Down-up on 3, another chick on 4. That chick is a **muted strum**.',
      figure: { kind: 'audio', sound: { kind: 'strum', chord: 'E', pattern: 'D-X-DUX-', tempo: 60 }, label: 'Hear the pattern on {c:E}' },
      tip: 'Start at 60 BPM: your hand lets go of the chord and forms it again on every beat.',
    },
    {
      type: 'card',
      title: 'Written with an x',
      body: 'In written rhythm, a muted strum gets an **x** for a note head instead of a round one. The fretting hand rests **lightly** on the strings, not pressing them, so they cannot ring: you hear only the hit.',
      figure: { kind: 'chord', symbol: 'E', frets: '022100', fingers: '023100', caption: '{c:E}: for each chick, lay your fingers flat across all six strings.' },
    },
    {
      type: 'true-false',
      statement: 'A muted strum is played with the fretting hand pressing a chord firmly.',
      answer: false,
      explain: 'Pressing firmly lets the chord ring. For a muted strum the hand rests lightly across the strings, so you hear a percussive chick.',
      fact: 'strumming-muted-strum',
    },
    {
      type: 'choice',
      prompt: 'How is a muted strum usually written in a rhythm?',
      options: [
        { text: 'With an x for the note head', correct: true },
        { text: 'With a dot after the note', why: 'A dot makes a note half as long again.' },
        { text: 'With a curve to the next note', why: 'A curve is a tie or a slur.' },
      ],
      explain: 'An x note head marks a muted, percussive strum: a chick instead of a chord.',
      fact: 'strumming-muted-strum',
    },
    {
      type: 'card',
      title: 'Accents and the backbeat',
      body: 'An {t:accent} mark, **>** over a note, says: play it **louder** than the notes around it. Stress beats **2 and 4** and you have the {t:backbeat}, where a drummer usually hits the snare. It is the feel behind much pop and rock.',
      figure: { kind: 'rhythm', pattern: 'qr q qr q | qr q qr q', tempo: 80, caption: 'Clap only on 2 and 4: the backbeat.' },
    },
    {
      type: 'choice',
      prompt: 'What does an accent mark (>) over a note tell you?',
      options: [
        { text: 'Play it louder', correct: true },
        { text: 'Play it shorter', why: 'Shortness has its own marks. The accent is about loudness.' },
        { text: 'Mute it', why: 'A muted strum is written with an x note head.' },
      ],
      shuffle: false,
      explain: 'An accent means louder than the notes around it.',
      fact: 'strumming-accent-mark',
    },
    {
      type: 'choice',
      prompt: 'The backbeat stresses which beats of a 4/4 bar?',
      options: [
        { text: 'Beats 1 and 3', why: 'Those are the strong beats of a 4/4 bar. The backbeat leans on the other two.' },
        { text: 'Beats 2 and 4', correct: true },
        { text: 'Only beat 1', why: 'Beat 1 is the downbeat, not the backbeat.' },
      ],
      shuffle: false,
      explain: 'The backbeat is the stress on beats 2 and 4, as in the chicks of your pattern.',
      fact: 'strumming-backbeat',
    },
    {
      type: 'listen-choice',
      prompt: 'Listen to this strumming on {c:E}. Where do the muted chicks fall?',
      sound: { kind: 'strum', chord: 'E', pattern: 'D-X-DUX-', tempo: 70 },
      options: [{ text: 'On beats 2 and 4', correct: true }, { text: 'On beats 1 and 3' }],
      shuffle: false,
      explain: 'A full strum on 1, a chick on 2, down-up on 3, a chick on 4. The chicks land on 2 and 4, so they give the pattern its backbeat.',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap the backbeat for two bars: beats 2 and 4 only.',
      rhythm: { pattern: 'qr q qr q | qr q qr q' },
      tempo: 80,
      show: 'both',
      explain: 'Count 1 2 3 4 and tap only on 2 and 4. That is where the snare drum usually lands, and so do your chicks.',
    },
    { generate: 'rhythm-ear', params: { values: ['quarter', 'eighth'], tempo: 70 } },
  ],
  facts: [
    {
      id: 'strumming-accent-mark',
      front: 'What does an accent mark (>) over a note mean?',
      back: 'Play that note louder than the notes around it.',
    },
    {
      id: 'strumming-muted-strum',
      front: 'What is a muted strum, and how is it written?',
      back: 'A percussive "chick": strum while the fretting hand rests lightly on the strings. It is written with an x note head.',
      ask: {
        type: 'true-false',
        statement: 'For a muted strum, the fretting hand rests lightly on the strings without pressing them down.',
        answer: true,
        explain: 'Resting lightly stops the strings ringing, so the strum is a percussive chick.',
      },
    },
    {
      id: 'strumming-backbeat',
      front: 'What is the backbeat?',
      back: 'A stress on beats 2 and 4: the feel behind much pop and rock.',
      ask: {
        type: 'choice',
        prompt: 'Which beats of a 4/4 bar does the backbeat stress?',
        options: [{ text: 'Beats 2 and 4', correct: true }, { text: 'Beats 1 and 3', why: 'Those are the strong beats of a 4/4 bar, not the backbeat.' }],
        shuffle: false,
        explain: 'The backbeat is on 2 and 4.',
      },
    },
  ],
};

/** Unit 9 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'Rhythm for strumming',
  theme: 'rhythm',
  description: 'Dotted notes, ties, 3/4 time and time signatures, pickup notes, sixteenth notes, chord changes in time, accents and muted strums.',
  lessons: [dottedNotes, ties, threeFourTime, pickupNotes, sixteenthNotes, changingChordsInTime, accentsAndMutedStrums],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      {
        type: 'choice',
        prompt: 'A dot after a note makes it…',
        options: [
          { text: 'Half as long again', correct: true },
          { text: 'Twice as long', why: 'The dot adds half the length, not all of it.' },
          { text: 'Half as long', why: 'A dot makes a note longer.' },
        ],
        shuffle: false,
        explain: 'The dot adds half of the note\'s own length.',
      },
      {
        type: 'match-pairs',
        prompt: 'Match each note with how long it lasts in 4/4.',
        pairs: [
          { left: 'Dotted half note', right: '3 beats' },
          { left: 'Half note', right: '2 beats' },
          { left: 'Dotted quarter note', right: '1½ beats' },
          { left: 'Quarter note', right: '1 beat' },
        ],
        explain: 'A dot adds half: a dotted half is 2 + 1 = 3 beats, a dotted quarter 1 + ½ = 1½.',
      },
      {
        type: 'true-false',
        statement: 'A tie joins two notes of different pitches.',
        answer: false,
        explain: 'A tie joins two notes of the same pitch into one sound. A curve between different notes is a slur.',
      },
      {
        type: 'choice',
        prompt: 'Which one can carry a note across a bar line?',
        options: [{ text: 'A tie', correct: true }, { text: 'A dot', why: 'A dot works only inside one bar.' }],
        shuffle: false,
        explain: 'A tie joins a note to one in the next bar.',
      },
      {
        type: 'choice',
        prompt: 'In 3/4 time, what does the top number tell you?',
        options: [
          { text: 'There are three beats in each bar', correct: true },
          { text: 'Each beat is a dotted half note', why: 'The bottom number gives the beat: 4 means a quarter note.' },
          { text: 'The tempo is 3 beats a second', why: 'A time signature says nothing about speed.' },
        ],
        explain: 'The top number counts the beats in a bar; the bottom 4 says each beat is a quarter note.',
      },
      { generate: 'meter', params: { ask: 'unit', signatures: ['3/4', '4/4'] } },
      {
        type: 'choice',
        prompt: 'Which single note fills a whole bar of 3/4?',
        options: [{ text: 'A dotted half note', correct: true }, { text: 'A half note', why: 'Two beats: one short.' }, { text: 'A whole note', why: 'Four beats: one too many.' }],
        explain: 'A dotted half note lasts three beats: a whole bar of 3/4.',
      },
      {
        type: 'choice',
        prompt: '"When the Saints" starts with "Oh when the" on beats 2, 3 and 4. What are those three notes?',
        options: [
          { text: 'A pickup', correct: true },
          { text: 'A tie', why: 'A tie joins two notes of the same pitch.' },
          { text: 'A backbeat', why: 'The backbeat is a stress on 2 and 4 in every bar.' },
        ],
        explain: 'Notes before the first full bar are a pickup. "Saints" lands on beat 1.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Count two beats of sixteenth notes.',
        text: '1  e  &  ___  2  e  ___  a',
        blanks: ['a', '&'],
        bank: ['3', 'e'],
        explain: 'Sixteenth notes are counted 1 e & a, 2 e & a.',
      },
      {
        type: 'type-answer',
        prompt: 'How many sixteenth notes fill a bar of 4/4?',
        answer: { kind: 'number', value: 16 },
        input: 'keypad',
        explain: 'Four in each beat, four beats: 16.',
      },
      {
        type: 'choice',
        prompt: 'The chart is | {c:Em} / / / | {c:Am} / / / |. When do you change to {c:Am}?',
        options: [
          { text: 'On beat 1 of bar 2', correct: true },
          { text: 'On beat 4 of bar 1', why: 'Beat 4 is still a slash: {c:Em} carries on.' },
          { text: 'On beat 2 of bar 2', why: '{c:Am} is written on the first beat of bar 2.' },
        ],
        shuffle: false,
        explain: 'Four beats of {c:Em}, then {c:Am} on beat 1 of the next bar.',
      },
      {
        type: 'tap-rhythm',
        prompt: 'Tap this strumming pattern: 1, 2 &, & of 3, 4 &.',
        rhythm: { pattern: PATTERN },
        tempo: 70,
        show: 'both',
        explain: 'Six taps: 1, 2 &, the & of 3, 4 &. Beat 3 itself is silent.',
      },
      {
        type: 'tap-rhythm',
        prompt: 'Tap this bar: a dotted quarter, an eighth, then a half note.',
        rhythm: { pattern: 'q. e h' },
        tempo: 70,
        show: 'both',
        explain: 'Tap on 1, the & of 2, and 3.',
      },
      {
        type: 'true-false',
        statement: 'A muted strum is a percussive chick, played with the fretting hand resting lightly on the strings.',
        answer: true,
        explain: 'Resting lightly stops the strings ringing, so you hear only the hit.',
      },
      {
        type: 'choice',
        prompt: 'An accent mark (>) sits over a strum. How do you play it?',
        options: [
          { text: 'Louder than the strums around it', correct: true },
          { text: 'As a muted chick', why: 'A muted strum is written with an x note head, not an accent.' },
          { text: 'Held for twice as long', why: 'An accent changes how loud a note is, not how long.' },
        ],
        explain: 'An accent mark means: play that note louder than the notes around it.',
      },
      {
        type: 'choice',
        prompt: 'The backbeat stresses which beats of a 4/4 bar?',
        options: [{ text: 'Beats 1 and 3' }, { text: 'Beats 2 and 4', correct: true }, { text: 'Only beat 1' }],
        shuffle: false,
        explain: 'The backbeat is on beats 2 and 4.',
      },
    ],
  },
};

export default unit;
