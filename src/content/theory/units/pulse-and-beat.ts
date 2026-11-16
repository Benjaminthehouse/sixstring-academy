/**
 * Theory Path, unit 4: Pulse and beat. Written from the syllabus entries in
 * `src/content/plan/theory-path.json` (unit `pulse-and-beat`), one lesson per entry, in order:
 * each lesson opens with the "on the guitar" picture, asks the planned exercises, ends with the
 * planned drills, and turns every planned fact into a review card.
 *
 * `pulse-and-beat.test.ts` cross-checks every rhythm against the theory engine's note values: bar
 * lengths, where each tap falls, how many notes fill a bar, and what each listening question plays.
 *
 * Rhythm is heard, but this unit must also work on a silent bus: tapping and listening questions
 * are left out with Sound off, so every idea is also asked as a quiet question (choice, true-false,
 * match, fill-blanks, a typed number).
 *
 * A tap-rhythm holds one or two bars (the engine's limit), so "tap beat 1 for four bars" became two
 * bars of whole notes. A match-pairs side is text only, so rest symbols are matched by name and
 * length, and recognised as pictures in a choice whose options are figures.
 */
import type { Lesson, Unit } from '@/lessons';

const U = 'pulse-and-beat';

const theBeat: Lesson = {
  id: 'the-beat',
  title: 'The beat',
  teaches: 'The beat (pulse) is the steady, evenly spaced count you tap your foot to.',
  minutes: 2,
  skill: `theory:${U}:the-beat`,
  requires: ['a-sound-is-a-vibration'],
  steps: [
    {
      type: 'card',
      title: 'The steady count',
      body: 'Under most music runs a steady count: the {t:beat}, also called the **pulse**. It is what you tap your foot or nod your head to. Beats are evenly spaced in time, like the ticks of a clock. A {t:metronome} is a device or app that clicks a steady beat for you.',
      figure: { kind: 'rhythm', pattern: 'q q q q | q q q q', tempo: 60, caption: 'Steady beats, one every second. Count them: 1 2 3 4.' },
    },
    {
      type: 'true-false',
      statement: 'Beats are evenly spaced in time.',
      answer: true,
      explain: 'Every beat is the same distance from the next, like the ticks of a clock. That is what makes it steady.',
      fact: 'pulse-beats-even',
    },
    {
      type: 'listen-choice',
      prompt: 'Listen to this click. Is the beat steady?',
      sound: { kind: 'rhythm', pattern: 'q q. q. | q q q. e', tempo: 80 },
      options: [{ text: 'Steady: the clicks are evenly spaced' }, { text: 'Not steady: the gaps keep changing', correct: true }],
      shuffle: false,
      explain: 'The gaps between the clicks kept changing, some long and some short. A beat never wobbles like that: every gap is the same.',
    },
    {
      type: 'choice',
      prompt: 'Which of these could keep a beat?',
      options: [
        { text: 'A clock ticking once a second', correct: true },
        { text: 'A tap that drips now and then', why: 'Its drips come at uneven times. A beat is evenly spaced.' },
        { text: 'Rain on a window', why: 'Raindrops fall at random times. A beat is steady.' },
      ],
      explain: 'A beat is steady and evenly spaced, like a clock. Random or uneven sounds cannot keep one.',
      fact: 'pulse-beats-even',
    },
    {
      type: 'card',
      title: 'Play the beat',
      body: 'Lay your fretting hand flat across all six strings, around frets 1 to 3, without pressing. Now strum: you hear a dry "chk" instead of notes. That is a {t:mute|muted} strum. Strum once on every click of the metronome.',
      figure: { kind: 'audio', sound: { kind: 'rhythm', pattern: 'q q q q | q q q q', tempo: 60 }, label: 'Strum with this click' },
      tip: 'Keep the hand clear of frets 5, 7 and 12: a light touch right over those frets rings a chime (a harmonic) instead of a mute.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each word with its meaning.',
      pairs: [
        { left: 'Beat', right: 'The steady count' },
        { left: 'Pulse', right: 'Another word for the beat' },
        { left: 'Metronome', right: 'Clicks a steady beat' },
      ],
      explain: 'The beat, or pulse, is the steady count under the music. A metronome clicks one for you to follow.',
      fact: 'pulse-beat-meaning',
    },
    {
      type: 'choice',
      prompt: 'What does a metronome do?',
      options: [
        { text: 'Clicks a steady beat', correct: true },
        { text: 'Tunes your strings', why: 'That is a tuner. A metronome keeps time.' },
        { text: 'Plays the chords of a song', why: 'A metronome only clicks the beat, so you can keep time with it.' },
      ],
      explain: 'A metronome, a device or an app, clicks a steady beat at the speed you choose.',
      fact: 'pulse-metronome',
    },
    { generate: 'rhythm-tap', params: { values: ['quarter'], bars: 2, tempo: 70 } },
  ],
  facts: [
    {
      id: 'pulse-beat-meaning',
      front: 'What is the beat, or pulse, of music?',
      back: 'The steady count underneath the music: the one you tap your foot to.',
    },
    {
      id: 'pulse-beats-even',
      front: 'How are beats spaced in time?',
      back: 'Evenly, like the tick of a clock.',
      ask: {
        type: 'true-false',
        statement: 'The beats of a song are evenly spaced, like the ticks of a clock.',
        answer: true,
        explain: 'A beat is steady: every beat is the same distance from the next.',
      },
    },
    {
      id: 'pulse-metronome',
      front: 'What is a metronome?',
      back: 'A device or app that clicks a steady beat.',
    },
  ],
};

const tempoAndBpm: Lesson = {
  id: 'tempo-and-bpm',
  title: 'Tempo and BPM',
  teaches: 'Tempo is the speed of the beat, measured in beats per minute (BPM).',
  minutes: 2,
  skill: `theory:${U}:tempo-and-bpm`,
  requires: ['the-beat'],
  steps: [
    {
      type: 'card',
      title: 'How fast is the beat?',
      body: 'The speed of the beat is the {t:tempo}. It is counted in beats per minute: {t:bpm}. At **60 BPM** there is one beat every second, like a clock. At **120 BPM** the beats come twice as fast: two every second.',
      figure: { kind: 'audio', sound: { kind: 'rhythm', pattern: 'q q q q | q q q q', tempo: 60 }, label: 'Hear 60 BPM' },
    },
    {
      type: 'choice',
      prompt: 'At 60 BPM, how many beats happen each second?',
      options: [
        { text: '1', correct: true },
        { text: '2', why: 'Two beats a second is 120 BPM.' },
        { text: '6', why: 'Sixty beats in a minute of sixty seconds is one beat each second.' },
        { text: '60', why: 'There are 60 beats in a whole minute: one each second.' },
      ],
      shuffle: false,
      explain: 'A minute has 60 seconds, so 60 beats per minute is one beat every second.',
      fact: 'pulse-bpm-60',
    },
    {
      type: 'listen-choice',
      prompt: 'Compare this click with the 60 BPM one below. Is it faster or slower?',
      figure: { kind: 'audio', sound: { kind: 'rhythm', pattern: 'q q q q', tempo: 60 }, label: 'Compare: 60 BPM' },
      sound: { kind: 'rhythm', pattern: 'q q q q | q q q q', tempo: 120 },
      options: [{ text: 'Faster', correct: true }, { text: 'Slower' }],
      shuffle: false,
      explain: 'That was 120 BPM: two clicks every second, twice as fast as 60 BPM.',
    },
    {
      type: 'true-false',
      statement: 'At 120 BPM the beats come twice as fast as at 60 BPM.',
      answer: true,
      explain: '120 is twice 60: two beats every second instead of one.',
      fact: 'pulse-120-twice-60',
    },
    {
      type: 'card',
      title: 'Play at three speeds',
      body: 'Rest your fretting hand flat across the strings and strum on every click: first at 60, then 90, then 120 BPM. Then pick open string 6, the low {n:E}, on every click.',
      figure: { kind: 'audio', sound: { kind: 'rhythm', pattern: 'q q q q | q q q q', tempo: 90 }, label: 'Strum along at 90 BPM' },
      tip: 'Faster is easier when your hand stays loose. Lost the click? Stop, listen for two beats, and come back in.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each word with its meaning.',
      pairs: [
        { left: 'Tempo', right: 'The speed of the beat' },
        { left: 'BPM', right: 'Beats per minute' },
        { left: '60 BPM', right: 'One beat each second' },
      ],
      explain: 'Tempo is how fast the beat goes, measured in beats per minute. At 60 BPM, one beat falls every second.',
      fact: 'pulse-tempo-meaning',
    },
    {
      type: 'choice',
      prompt: 'A song feels slow and calm. Which tempo is it more likely to have?',
      options: [
        { text: '70 BPM', correct: true },
        { text: '160 BPM', why: '160 BPM is fast: nearly three beats every second.' },
      ],
      shuffle: false,
      explain: 'Fewer beats per minute means a slower tempo. 70 BPM is a little over one beat a second: slow and calm.',
      fact: 'pulse-tempo-meaning',
    },
    { generate: 'rhythm-tap', params: { values: ['quarter'], tempo: 90 } },
  ],
  facts: [
    { id: 'pulse-tempo-meaning', front: 'What is tempo?', back: 'The speed of the beat.' },
    {
      id: 'pulse-bpm-60',
      front: 'What is tempo measured in, and how fast is 60 of them?',
      back: 'Beats per minute (BPM). At 60 BPM there is one beat every second.',
      ask: {
        type: 'choice',
        prompt: 'At 60 BPM, how often does a beat come?',
        options: [
          { text: 'Once every second', correct: true },
          { text: 'Twice every second', why: 'That is 120 BPM.' },
          { text: 'Once every minute', why: 'Sixty beats come in one minute: one every second.' },
        ],
        shuffle: false,
        explain: 'Sixty beats in sixty seconds: one beat every second.',
      },
    },
    {
      id: 'pulse-120-twice-60',
      front: 'How does 120 BPM compare with 60 BPM?',
      back: 'The beats come twice as fast: two every second instead of one.',
      ask: {
        type: 'type-answer',
        prompt: 'At 120 BPM, how many beats happen in one second?',
        answer: { kind: 'number', value: 2 },
        input: 'keypad',
        explain: '120 beats in 60 seconds is 2 beats every second.',
      },
    },
  ],
};

const barsAndFourFour: Lesson = {
  id: 'bars-and-four-four',
  title: 'Bars and counting to four',
  teaches: 'Beats are grouped into bars; in 4/4 time each bar has four beats and beat 1 is the strongest.',
  minutes: 3,
  skill: `theory:${U}:bars-and-four-four`,
  requires: ['tempo-and-bpm'],
  steps: [
    {
      type: 'card',
      title: 'Groups of four',
      body: 'Music groups beats into {t:bar|bars}, also called measures. In written music a **bar line** separates one bar from the next. In **4/4** time every bar has four beats, counted 1 2 3 4, then 1 again.',
      figure: { kind: 'rhythm', pattern: 'q q q q | q q q q', caption: 'Two bars of 4/4, with the bar line between them.' },
      tip: 'The top 4 says four beats in a bar. The bottom 4 says each beat is a quarter note: more about that next lesson.',
    },
    {
      type: 'choice',
      prompt: 'How many beats are in a bar of 4/4?',
      options: [{ text: '2' }, { text: '3', why: 'Three beats a bar is 3/4 time.' }, { text: '4', correct: true }, { text: '8', why: 'Eight is two bars of 4/4.' }],
      shuffle: false,
      explain: 'In 4/4 time each bar has four beats: 1 2 3 4.',
      fact: 'pulse-four-four',
    },
    {
      type: 'fill-blanks',
      prompt: 'Count two bars of 4/4.',
      text: '1  2  ___  4  |  1  ___  3  4',
      blanks: ['3', '2'],
      bank: ['5', '6'],
      explain: 'Each bar counts 1 2 3 4. After the bar line the count starts again at 1, so there is no 5.',
      fact: 'pulse-four-four',
    },
    {
      type: 'card',
      title: 'Beat 1',
      body: 'Beat 1 of each bar is the {t:downbeat}. It usually feels the strongest: it is where a band lands together, and chords often change there. Listen: the first click of every four is a little louder.',
      figure: { kind: 'audio', sound: { kind: 'rhythm', pattern: 'q q q q | q q q q', tempo: 80 }, label: 'Hear two bars of 4/4' },
    },
    {
      type: 'choice',
      prompt: 'Which beat of a bar is the downbeat?',
      options: [
        { text: 'Beat 1', correct: true },
        { text: 'Beat 2' },
        { text: 'Beat 3' },
        { text: 'Beat 4', why: 'Beat 4 is the last beat of the bar, leading into the next downbeat.' },
      ],
      shuffle: false,
      explain: 'The downbeat is beat 1, the start of every bar. It usually feels the strongest.',
      fact: 'pulse-downbeat',
    },
    {
      type: 'listen-choice',
      prompt: 'Listen for the louder clicks. How long is each bar?',
      sound: { kind: 'rhythm', pattern: 'q q q | q q q | q q q', time: '3/4', tempo: 100 },
      options: [{ text: 'Three beats', correct: true }, { text: 'Four beats' }],
      shuffle: false,
      explain: 'A louder click came every three beats: 1 2 3, 1 2 3. Bars of three beats are written 3/4. In 4/4 the louder click comes every four.',
    },
    {
      type: 'listen-choice',
      prompt: 'And this one?',
      sound: { kind: 'rhythm', pattern: 'q q q q | q q q q | q q q q', tempo: 100 },
      options: [{ text: 'Three beats' }, { text: 'Four beats', correct: true }],
      shuffle: false,
      explain: 'A louder click came every four beats: 1 2 3 4, 1 2 3 4. That is 4/4 time.',
    },
    {
      type: 'true-false',
      statement: 'Bar lines separate one bar from the next.',
      answer: true,
      explain: 'A bar line is the upright line between two bars. The count starts again at 1 after it.',
      fact: 'pulse-bars',
    },
    {
      type: 'card',
      title: 'Play it',
      body: 'Pick open string 6, the low {n:E}, on beat 1. Strum the muted strings on beats 2, 3 and 4. Count out loud: "**ONE** two three four".',
      figure: { kind: 'rhythm', pattern: 'q q q q | q q q q', tempo: 80, caption: 'Low {n:E} on 1, muted strums on 2, 3 and 4.' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap only beat 1 of each bar, the louder click. Count 2 3 4 in your head.',
      rhythm: { pattern: 'w | w' },
      tempo: 80,
      show: 'both',
      explain: 'One tap on each downbeat: tap on 1, count 2 3 4, tap on the next 1. The long note in the picture is a whole note: it fills the bar.',
    },
    { generate: 'meter', params: { ask: 'beats', signatures: ['4/4', '3/4'] } },
  ],
  facts: [
    {
      id: 'pulse-bars',
      front: 'What is a bar in music?',
      back: 'A group of beats. Bars, also called measures, are separated by bar lines.',
    },
    {
      id: 'pulse-four-four',
      front: 'How many beats are in a bar of 4/4, and how are they counted?',
      back: 'Four, counted 1 2 3 4.',
      ask: {
        type: 'fill-blanks',
        prompt: 'Count a bar of 4/4.',
        text: '1  ___  3  ___',
        blanks: ['2', '4'],
        bank: ['5'],
        explain: 'A bar of 4/4 counts 1 2 3 4.',
      },
    },
    {
      id: 'pulse-downbeat',
      front: 'What is the downbeat?',
      back: 'Beat 1 of a bar. It usually feels the strongest.',
    },
  ],
};

const quarterHalfWhole: Lesson = {
  id: 'quarter-half-whole',
  title: 'Quarter, half and whole notes',
  teaches: 'In 4/4 a quarter note lasts one beat, a half note two beats and a whole note four beats.',
  minutes: 3,
  skill: `theory:${U}:quarter-half-whole`,
  requires: ['bars-and-four-four'],
  steps: [
    {
      type: 'card',
      title: 'How long a note lasts',
      body: 'A {t:note-value} says how long a note lasts. In 4/4 a {t:quarter-note} lasts **one beat**. A {t:half-note} lasts **two** beats, and a {t:whole-note} **four**: a whole bar.',
      figure: { kind: 'rhythm', pattern: 'q q q q | h h', tempo: 80, caption: 'Four quarter notes, then two half notes.' },
    },
    {
      type: 'choice',
      prompt: 'How many beats does a half note last in 4/4?',
      options: [{ text: '1', why: 'One beat is a quarter note.' }, { text: '2', correct: true }, { text: '3' }, { text: '4', why: 'Four beats is a whole note.' }],
      shuffle: false,
      explain: 'A half note lasts as long as two quarter notes: two beats in 4/4.',
      fact: 'pulse-half-note',
    },
    {
      type: 'card',
      title: 'Telling them apart',
      body: 'Look at the note heads. A quarter note has a **filled-in** head and a stem. A half note has a **hollow** head and a stem. A whole note is a hollow head with **no stem** at all.',
      figure: { kind: 'rhythm', pattern: 'h q q | w', caption: 'A half note, two quarter notes, then a whole note.' },
    },
    {
      type: 'choice',
      prompt: 'Which note has a hollow head and no stem?',
      options: [
        { text: 'A whole note', correct: true },
        { text: 'A half note', why: 'A half note is hollow too, but it has a stem.' },
        { text: 'A quarter note', why: 'A quarter note has a filled-in head and a stem.' },
      ],
      explain: 'Only the whole note has no stem. The half note is hollow with a stem; the quarter note is filled in with a stem.',
      fact: 'pulse-note-shapes',
    },
    {
      type: 'choice',
      prompt: 'Which bar starts with a half note?',
      options: [
        { figure: { kind: 'rhythm', pattern: 'h h', counting: false }, correct: true },
        { figure: { kind: 'rhythm', pattern: 'q q q q', counting: false }, why: 'A filled-in head with a stem: that bar starts with a quarter note.' },
        { figure: { kind: 'rhythm', pattern: 'w', counting: false }, why: 'A hollow head with no stem: that is a whole note.' },
      ],
      explain: 'A half note has a hollow head and a stem. This bar holds two of them: two beats each, a full bar of 4/4.',
      fact: 'pulse-note-shapes',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each note with how long it lasts in 4/4.',
      pairs: [
        { left: 'Whole note', right: '4 beats' },
        { left: 'Half note', right: '2 beats' },
        { left: 'Quarter note', right: '1 beat' },
      ],
      explain: 'Each value is half the one before: a whole note is 4 beats, a half note 2, a quarter note 1.',
      fact: 'pulse-quarter-note',
    },
    {
      type: 'true-false',
      statement: 'A whole note fills a whole bar of 4/4.',
      answer: true,
      explain: 'A whole note lasts four beats, as long as four quarter notes: exactly one bar of 4/4.',
      fact: 'pulse-whole-note',
    },
    {
      type: 'card',
      title: 'Play it',
      body: 'Strum the open strings: four quarter notes, then two half notes (let them ring), then one whole note. Count 1 2 3 4 out loud the whole time, and strum only where a note starts.',
      figure: { kind: 'audio', sound: { kind: 'rhythm', pattern: 'q q q q | h h | w', tempo: 80 }, label: 'Hear where each note starts' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap this bar: a half note, then two quarter notes.',
      rhythm: { pattern: 'h q q' },
      tempo: 80,
      show: 'both',
      explain: 'Tap on 1, 3 and 4. The half note lasts through beat 2, so there is no tap there.',
    },
    { generate: 'note-value-math', params: { ask: 'fit', values: ['quarter', 'half', 'whole'] } },
    { generate: 'rhythm-tap', params: { values: ['quarter', 'half'], tempo: 80 } },
  ],
  facts: [
    { id: 'pulse-quarter-note', front: 'How long does a quarter note last in 4/4?', back: 'One beat.' },
    {
      id: 'pulse-half-note',
      front: 'How long does a half note last?',
      back: 'As long as two quarter notes: two beats in 4/4.',
      ask: { generate: 'note-value-math', params: { ask: 'beats', values: ['quarter', 'half', 'whole'] } },
    },
    { id: 'pulse-whole-note', front: 'How long does a whole note last?', back: 'As long as four quarter notes: a whole bar of 4/4.' },
    {
      id: 'pulse-note-shapes',
      front: 'How do a quarter note, a half note and a whole note look?',
      back: 'Quarter: a filled-in head and a stem. Half: a hollow head and a stem. Whole: a hollow head and no stem.',
    },
  ],
};

const eighthNotes: Lesson = {
  id: 'eighth-notes',
  title: 'Eighth notes and the "&"',
  teaches: 'Two eighth notes fit in one beat, counted "1 & 2 & 3 & 4 &".',
  minutes: 3,
  skill: `theory:${U}:eighth-notes`,
  requires: ['quarter-half-whole'],
  steps: [
    {
      type: 'card',
      title: 'Half a beat',
      body: 'Split each beat in two and you get {t:eighth-note|eighth notes}: two in every beat. Count them **1 & 2 & 3 & 4 &**, saying "and" for each &. Each & falls exactly halfway between two beats.',
      figure: { kind: 'rhythm', pattern: 'e e e e e e e e', tempo: 70, caption: 'Eight eighth notes: 1 & 2 & 3 & 4 &.' },
    },
    {
      type: 'choice',
      prompt: 'How many eighth notes fill a bar of 4/4?',
      options: [{ text: '4', why: 'Four would fill the bar with quarter notes. Eighth notes are half as long.' }, { text: '6' }, { text: '8', correct: true }, { text: '16', why: 'Sixteen would be sixteenth notes, half as long again.' }],
      shuffle: false,
      explain: 'Four beats, two eighth notes in each: 4 × 2 = 8.',
    },
    {
      type: 'fill-blanks',
      prompt: 'Count a bar of eighth notes.',
      text: '1  &  2  ___  3  &  ___  &',
      blanks: ['&', '4'],
      bank: ['5', '3'],
      explain: 'The numbers are the beats and the & falls between them: 1 & 2 & 3 & 4 &.',
      fact: 'pulse-and-counting',
    },
    {
      type: 'true-false',
      statement: 'A bar of eighth notes is counted "1 2 3 4 5 6 7 8".',
      answer: false,
      explain: 'The numbers stay the four beats; the & goes between them: 1 & 2 & 3 & 4 &.',
      fact: 'pulse-and-counting',
    },
    {
      type: 'type-answer',
      prompt: 'How many eighth notes last as long as one quarter note?',
      answer: { kind: 'number', value: 2 },
      input: 'keypad',
      explain: 'A quarter note is one beat and an eighth note half a beat, so two eighth notes make one quarter note.',
      fact: 'pulse-two-eighths',
    },
    {
      type: 'card',
      title: 'Flags and beams',
      body: 'On its own, an eighth note has one {t:flag} on its stem, and that is how the rhythm pictures in these lessons draw every eighth note. In printed music, two or more in a row are usually joined by one {t:beam} instead, as on this staff. Either way, each lasts half a beat.',
      figure: {
        kind: 'staff',
        time: '4/4',
        notes: [
          { note: 'B3', duration: 'q' },
          { note: 'B3', duration: 'q' },
          { note: 'B3', duration: 'e' },
          { note: 'B3', duration: 'e' },
          { note: 'B3', duration: 'e' },
          { note: 'B3', duration: 'e' },
        ],
        caption: 'Two quarter notes, then four eighth notes joined in pairs by beams.',
      },
    },
    {
      type: 'choice',
      prompt: 'How are two eighth notes in a row usually written?',
      options: [
        { text: 'Joined by one beam', correct: true },
        { text: 'Joined by two beams', why: 'Two beams mean sixteenth notes, which are shorter still.' },
        { text: 'With hollow heads', why: 'Hollow heads are for half and whole notes. Eighth notes are filled in.' },
      ],
      explain: 'Eighth notes in a group share one beam. On its own, an eighth note has one flag instead.',
      fact: 'pulse-flags-and-beams',
    },
    {
      type: 'card',
      title: 'Play it',
      body: 'Strum open strings 3, 2 and 1: **down** on every number, **up** on every &. Keep your hand swinging evenly, like a pendulum, at 70 BPM.',
      figure: { kind: 'audio', sound: { kind: 'strum', chord: 'Em', pattern: 'DUDUDUDU', tempo: 70 }, label: 'Hear down-up strums', caption: 'Down on the numbers, up on the &s, here on a full {c:Em} chord.' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap one bar of eighth notes at 70 BPM.',
      rhythm: { pattern: 'e e e e e e e e' },
      tempo: 70,
      show: 'both',
      explain: 'Two even taps on every click: 1 & 2 & 3 & 4 &. The & taps fall exactly halfway between the clicks.',
    },
    { generate: 'note-value-math', params: { ask: 'fit', values: ['quarter', 'eighth', 'half', 'whole'] } },
    { generate: 'rhythm-tap', params: { values: ['quarter', 'eighth'], tempo: 70 } },
  ],
  facts: [
    {
      id: 'pulse-two-eighths',
      front: 'How many eighth notes last as long as one quarter note?',
      back: 'Two.',
      ask: {
        type: 'type-answer',
        prompt: 'How many eighth notes last as long as one quarter note?',
        answer: { kind: 'number', value: 2 },
        input: 'keypad',
        explain: 'An eighth note is half a beat, so two make one quarter note.',
      },
    },
    {
      id: 'pulse-and-counting',
      front: 'How do you count a bar of eighth notes in 4/4?',
      back: '1 & 2 & 3 & 4 &. Each & falls exactly halfway between two beats.',
    },
    {
      id: 'pulse-flags-and-beams',
      front: 'How is an eighth note written?',
      back: 'On its own, with one flag on its stem. In a group, eighth notes are joined by one beam.',
    },
  ],
};

const rests: Lesson = {
  id: 'rests',
  title: 'Rests: counted silence',
  teaches: 'A rest is a silence of an exact length, and each note value has a matching rest.',
  minutes: 3,
  skill: `theory:${U}:rests`,
  requires: ['eighth-notes'],
  steps: [
    {
      type: 'card',
      title: 'Counted silence',
      body: 'A {t:rest} is a silence of an exact length. You keep counting through it, but you do not play. Every note value has a matching rest: a quarter rest lasts one beat, just like a quarter note.',
      figure: { kind: 'rhythm', pattern: 'q qr q qr', tempo: 80, caption: 'Quarter note, quarter rest, quarter note, quarter rest.' },
    },
    {
      type: 'choice',
      prompt: 'How long does a quarter rest last in 4/4?',
      options: [{ text: 'Half a beat', why: 'Half a beat is an eighth rest.' }, { text: '1 beat', correct: true }, { text: '2 beats', why: 'Two beats is a half rest.' }, { text: '4 beats', why: 'Four beats is a whole rest.' }],
      shuffle: false,
      explain: 'A rest lasts as long as the note it matches: a quarter rest is one beat, like a quarter note.',
      fact: 'pulse-matching-rests',
    },
    {
      type: 'card',
      title: 'The four rests',
      body: 'Here are the half, quarter and eighth rests, then a whole rest filling a bar. The whole and half rests are both small blocks: the whole rest **hangs** down from a line, the half rest **sits** on top of one, like a hat.',
      figure: { kind: 'rhythm', pattern: 'hr qr er er | wr', counting: false, caption: 'Half, quarter and two eighth rests; then a whole rest.' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each rest with how long it lasts in 4/4.',
      pairs: [
        { left: 'Whole rest', right: '4 beats' },
        { left: 'Half rest', right: '2 beats' },
        { left: 'Quarter rest', right: '1 beat' },
        { left: 'Eighth rest', right: 'Half a beat' },
      ],
      explain: 'Each rest lasts as long as its note: whole 4 beats, half 2, quarter 1, eighth half a beat.',
      fact: 'pulse-matching-rests',
    },
    {
      type: 'choice',
      prompt: 'Which bar starts with a half rest?',
      options: [
        { figure: { kind: 'rhythm', pattern: 'hr h', counting: false }, correct: true },
        { figure: { kind: 'rhythm', pattern: 'qr q h', counting: false }, why: 'That bar starts with a quarter rest, the squiggly one: one beat of silence.' },
        { figure: { kind: 'rhythm', pattern: 'er e q h', counting: false }, why: 'That bar starts with an eighth rest, the small one with a flag: half a beat.' },
      ],
      explain: 'A half rest is a small block sitting on top of a line: two beats of silence, here before a half note.',
      fact: 'pulse-whole-and-half-rest',
    },
    {
      type: 'true-false',
      statement: 'A half rest sits on top of a line; a whole rest hangs down from one.',
      answer: true,
      explain: 'Think of the half rest as a hat sitting on the line, and the whole rest as heavier, hanging below it.',
      fact: 'pulse-whole-and-half-rest',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap this bar: quarter note, quarter rest, quarter note, quarter note.',
      rhythm: { pattern: 'q qr q q' },
      tempo: 80,
      show: 'both',
      explain: 'Tap on 1, 3 and 4. Beat 2 is a rest: count it, but do not tap.',
    },
    {
      type: 'card',
      title: 'Play it',
      body: 'Strum open strings 3, 2 and 1 on beats 1 and 3. On beats 2 and 4, lay the side of your picking hand on the strings to stop them. The silence is part of the rhythm.',
      figure: { kind: 'audio', sound: { kind: 'rhythm', pattern: 'q qr q qr | q qr q qr', tempo: 80 }, label: 'Hear strum, rest, strum' },
    },
    {
      type: 'true-false',
      statement: 'A whole rest can stand for a whole bar of silence, however many beats the bar has.',
      answer: true,
      explain: 'A whole rest lasts four beats in 4/4, and it is also the sign for a full bar of silence in any time signature.',
      fact: 'pulse-whole-bar-rest',
    },
    { generate: 'rhythm-tap', params: { values: ['quarter'], rests: true, tempo: 80 } },
    { generate: 'note-value-math', params: { ask: 'beats', values: ['quarter', 'half', 'whole', 'eighth'] } },
  ],
  facts: [
    { id: 'pulse-rest-meaning', front: 'What is a rest?', back: 'A silence that lasts an exact number of beats.' },
    {
      id: 'pulse-matching-rests',
      front: 'Which note values have a matching rest?',
      back: 'All of them: there are whole, half, quarter and eighth rests, each as long as its note.',
    },
    {
      id: 'pulse-whole-and-half-rest',
      front: 'How do you tell a whole rest from a half rest?',
      back: 'Both are small blocks. A whole rest hangs down from a line; a half rest sits on top of a line.',
    },
    {
      id: 'pulse-whole-bar-rest',
      front: 'What else is a whole rest used for?',
      back: 'A whole bar of silence, however many beats the bar has.',
    },
  ],
};

const downUpStrumming: Lesson = {
  id: 'down-up-strumming',
  title: 'Down on the beat, up on the "&"',
  teaches: 'In eighth-note strumming the hand goes down on each beat and up on each "&", even when it misses the strings.',
  minutes: 3,
  skill: `theory:${U}:down-up-strumming`,
  requires: ['rests'],
  steps: [
    {
      type: 'card',
      title: 'Down on the numbers',
      body: 'Strum eighth notes with a steady swing: **down** on every number, **up** on every &. A {t:downstroke} moves toward the floor, an {t:upstroke} toward the ceiling. Down-up, down-up, like a pendulum: eight strokes a bar.',
      figure: { kind: 'audio', sound: { kind: 'strum', chord: 'Em', pattern: 'DUDUDUDU', tempo: 70 }, label: 'Hear down-up strums' },
    },
    {
      type: 'true-false',
      statement: 'In eighth-note strumming, upstrokes fall on the numbers.',
      answer: false,
      explain: 'It is the other way round: downstrokes on the numbers (the beats), upstrokes on the &s between them.',
      fact: 'pulse-down-on-the-beat',
    },
    {
      type: 'choice',
      prompt: 'Which stroke lands on the & after beat 2?',
      options: [
        { text: 'An upstroke', correct: true },
        { text: 'A downstroke', why: 'Downstrokes land on the numbers. Every & gets an upstroke.' },
      ],
      shuffle: false,
      explain: 'Every & falls between two beats, while the hand is on its way back up: an upstroke.',
      fact: 'pulse-down-on-the-beat',
    },
    {
      type: 'card',
      title: 'Missing on purpose',
      body: 'Real strumming patterns leave some strums out. The trick: your hand **never stops**. It swings down or up as always, but misses the strings. That keeps every strum you do play in the right place.',
      figure: { kind: 'audio', sound: { kind: 'strum', chord: 'Em', pattern: 'D-DU-UDU', tempo: 70 }, label: 'Hear the pattern', caption: 'The hand misses the strings on the & of 1 and on beat 3.' },
    },
    {
      type: 'choice',
      prompt: 'You want to leave out the strum on beat 3. What does your hand do?',
      options: [
        { text: 'Swings down anyway, just missing the strings', correct: true },
        { text: 'Stops and waits for the & of 3', why: 'Stopping breaks the swing, and the next strums come in late.' },
        { text: 'Strums up instead', why: 'Beat 3 is a number: the hand is moving down there, not up.' },
      ],
      explain: 'Keep the hand moving and swing past the strings. The swing keeps the time; the strings decide what you hear.',
      fact: 'pulse-miss-a-strum',
    },
    {
      type: 'order',
      prompt: 'This pattern strums on 1, 2, &, & of 3, 4, &. Put its strokes in order.',
      tiles: ['Down', 'Down', 'Up', 'Up', 'Down', 'Up'],
      explain: 'Numbers get downstrokes and &s get upstrokes: down (1), down-up (2 &), up (& of 3), down-up (4 &).',
      fact: 'pulse-down-on-the-beat',
    },
    {
      type: 'true-false',
      statement: 'Your strumming hand stops moving whenever a strum is left out.',
      answer: false,
      explain: 'A hand that keeps moving down and up is what keeps the strumming steady, even through the strums you miss.',
      fact: 'pulse-keep-moving',
    },
    {
      type: 'card',
      title: 'Play it',
      body: 'Strum the open strings, or an {c:Em} chord: strings 5 and 4 at fret 2, the rest open. Play down, down-up, up, down-up, with your hand swinging all the time. Start slowly, at 60 BPM.',
      figure: {
        kind: 'fretboard',
        frets: [0, 3],
        dots: [
          { string: 5, fret: 2, note: 'B2', finger: 2 },
          { string: 4, fret: 2, note: 'E3', finger: 3 },
        ],
        caption: '{c:Em}: strings 5 and 4 at fret 2, the other strings open.',
      },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap the pattern: 1, 2 &, & of 3, 4 &.',
      rhythm: { pattern: 'q e e er e e e' },
      tempo: 70,
      show: 'both',
      explain: 'Six taps: 1, 2 &, then the & of 3 after a silent beat 3, then 4 &. A strummer\'s hand still swings down on 3.',
    },
    { generate: 'rhythm-tap', params: { values: ['quarter', 'eighth'], tempo: 70 } },
  ],
  facts: [
    {
      id: 'pulse-down-on-the-beat',
      front: 'In eighth-note strumming, where do the downstrokes and upstrokes fall?',
      back: 'Downstrokes on the beats (the numbers), upstrokes on the &s.',
      ask: {
        type: 'true-false',
        statement: 'In eighth-note strumming, downstrokes fall on the beats and upstrokes on the &s.',
        answer: true,
        explain: 'Down on 1 2 3 4, up on every & between them.',
      },
    },
    {
      id: 'pulse-miss-a-strum',
      front: 'How do you leave out a strum without losing time?',
      back: 'Keep the hand moving and swing past the strings without touching them.',
    },
    {
      id: 'pulse-keep-moving',
      front: 'What keeps strumming steady?',
      back: 'A hand that never stops moving down and up.',
    },
  ],
};

/** Unit 4 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'Pulse and beat',
  theme: 'rhythm',
  description: 'The steady beat, tempo, bars of 4/4, the first note values and rests, and down-up strumming.',
  lessons: [theBeat, tempoAndBpm, barsAndFourFour, quarterHalfWhole, eighthNotes, rests, downUpStrumming],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      {
        type: 'match-pairs',
        prompt: 'Match each word with its meaning.',
        pairs: [
          { left: 'Beat', right: 'The steady count' },
          { left: 'Tempo', right: 'The speed of the beat' },
          { left: 'BPM', right: 'Beats per minute' },
          { left: 'Bar', right: 'A group of beats' },
        ],
        explain: 'The beat is the steady count, the tempo its speed in beats per minute, and a bar a group of beats.',
      },
      {
        type: 'choice',
        prompt: 'At 120 BPM, how many beats happen each second?',
        options: [{ text: '1', why: 'One beat a second is 60 BPM.' }, { text: '2', correct: true }, { text: '12' }, { text: '120', why: '120 beats come in a whole minute.' }],
        shuffle: false,
        explain: '120 beats in 60 seconds: two beats every second.',
      },
      {
        type: 'choice',
        prompt: 'In 4/4 time, which beat is the downbeat?',
        options: [{ text: 'Beat 1', correct: true }, { text: 'Beat 2' }, { text: 'Beat 3' }, { text: 'Beat 4', why: 'Beat 4 is the last beat, leading into the next bar.' }],
        shuffle: false,
        explain: 'The downbeat is beat 1, the start of each bar.',
      },
      {
        type: 'true-false',
        statement: 'In 4/4 time every bar has four beats.',
        answer: true,
        explain: 'Four beats a bar, counted 1 2 3 4.',
      },
      {
        type: 'match-pairs',
        prompt: 'Match each note with how long it lasts in 4/4.',
        pairs: [
          { left: 'Whole note', right: '4 beats' },
          { left: 'Half note', right: '2 beats' },
          { left: 'Quarter note', right: '1 beat' },
          { left: 'Eighth note', right: 'Half a beat' },
        ],
        explain: 'Each note lasts half as long as the one before: 4 beats, 2, 1, then half a beat.',
      },
      {
        type: 'choice',
        prompt: 'How long does a half rest last in 4/4?',
        options: [{ text: '1 beat', why: 'One beat is a quarter rest.' }, { text: '2 beats', correct: true }, { text: '4 beats', why: 'Four beats is a whole rest.' }],
        shuffle: false,
        explain: 'A rest lasts as long as its note: a half rest is two beats, like a half note.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Count a bar of eighth notes.',
        text: '1  &  ___  &  3  ___  4  &',
        blanks: ['2', '&'],
        bank: ['5', '3'],
        explain: 'Eighth notes are counted 1 & 2 & 3 & 4 &.',
      },
      { generate: 'note-value-math', params: { ask: 'fit', values: ['quarter', 'eighth', 'half', 'whole'] } },
      {
        type: 'tap-rhythm',
        prompt: 'Tap this bar: a quarter, two eighths, a quarter rest, two eighths.',
        rhythm: { pattern: 'q e e qr e e' },
        tempo: 80,
        show: 'both',
        explain: 'Tap on 1, 2 &, then rest on 3, then 4 &.',
      },
      { generate: 'rhythm-tap', params: { values: ['quarter', 'eighth'], rests: true, tempo: 80 } },
      {
        type: 'true-false',
        statement: 'In eighth-note strumming, downstrokes fall on the beats.',
        answer: true,
        explain: 'Down on the numbers, up on the &s.',
      },
      {
        type: 'choice',
        prompt: 'You leave a strum out. What does your strumming hand do?',
        options: [
          { text: 'Keeps swinging and misses the strings', correct: true },
          { text: 'Stops until the next strum', why: 'Stopping breaks the swing, and the next strum comes in late.' },
        ],
        shuffle: false,
        explain: 'The hand never stops moving down and up; it just misses the strings.',
      },
    ],
  },
};

export default unit;
