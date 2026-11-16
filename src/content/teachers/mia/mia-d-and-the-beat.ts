/**
 * Mia, unit 4: D, A7 and the steady beat (plan: `mia/mia-d-and-the-beat` in src/content/plan/teachers.json).
 *
 * Counting and keeping a steady beat, the D chord, down-up eighth notes, a first two-chord song
 * (Drunken Sailor), A7 and waltz time, and two waltzes. Every lesson follows its plan entry: the
 * plan's `explain` in Mia's voice on the cards, its `show` as figures, its `practice` as exercises
 * (`Mic` with a tapping alternative) or tasks that send the learner to the Player, Metronome,
 * Rhythm, Technique or the chord trainer and back.
 *
 * Music from the song library: Strumming: Steady Quarters (60 BPM), Change: Em-D and Em-G (60),
 * Strumming: Down-Up Eighths (70), What Shall We Do with the Drunken Sailor (2/4, 96), Strumming:
 * Waltz (3/4, 96), Change: D-A7 and A-D (60), Down in the Valley (3/4, 108) and Oh My Darling,
 * Clementine (3/4, 108, a pickup on beat 3). Player tempos are percentages of those, so the BPM
 * each task names is the song's tempo times its percentage; `mia-d-and-the-beat.test.ts` checks
 * that, the chord charts and the bass notes the lessons describe against the library's files.
 */
import type { TeacherLesson, TeacherUnit } from '../types';
import { playerTask, techniqueTask, toolTask } from '../tasks';

// ── 1. Counting the beat ────────────────────────────────────────────────────────────────────────

const countingTheBeat: TeacherLesson = {
  id: 'counting-the-beat',
  title: 'Counting the beat',
  teaches: 'Count 1 2 3 4 out loud with a little more weight on 1, and keep counting when you slip.',
  minutes: 5,
  skill: 'teacher:mia:counting-the-beat',
  steps: [
    {
      type: 'card',
      title: 'The beat and the tempo',
      body: 'Every song has a {t:beat}: the steady pulse you tap your foot to. How fast it goes is the {t:tempo}, counted in {t:bpm|BPM}, beats per minute. At 60 BPM there is one beat every second. Press play and tap your foot with it.',
      figure: { kind: 'rhythm', pattern: 'q q q q | q q q q', time: '4/4', tempo: 70, caption: 'Eight steady beats at 70 BPM.' },
    },
    {
      type: 'choice',
      prompt: 'What does the tempo tell you?',
      options: [
        { text: 'How fast the beat goes', correct: true },
        { text: 'How loud to play', why: 'Loud and soft is something else. The tempo is only the speed of the beat.' },
        { text: 'Which chord comes next', why: 'The chord chart tells you that. The tempo is the speed of the beat.' },
      ],
      explain: 'The tempo is the speed of the beat, counted in beats per minute (BPM). 60 BPM is one beat every second; 120 BPM is two.',
      fact: 'beat-and-tempo',
    },
    {
      type: 'card',
      title: 'Four beats in a bar',
      body: 'Most songs group the beats in fours. That is 4/4, said "four four": four beats in every {t:bar}. Count 1 2 3 4, 1 2 3 4, and give 1 a little more weight, an {t:accent}, so you always know where a bar begins. Each one-beat note is a {t:quarter-note|quarter note}.',
      figure: { kind: 'rhythm', pattern: 'q q q q', time: '4/4', tempo: 70, caption: 'One bar of 4/4: four quarter notes, counted 1 2 3 4.' },
    },
    {
      type: 'true-false',
      statement: 'In 4/4 you count 1 2 3 4, with a little more weight on 1.',
      answer: true,
      explain: 'Four beats in every bar, and beat 1 a little stronger, so you and anyone playing with you know where each bar begins.',
      fact: 'count-four-four',
    },
    {
      type: 'card',
      title: 'Longer notes',
      body: 'Some notes last longer than one beat. A {t:half-note|half note} lasts two beats: you count "1 2" while it rings. A {t:whole-note|whole note} lasts all four. Keep counting every beat, even while a note rings.',
      figure: { kind: 'rhythm', pattern: 'h h | w', time: '4/4', tempo: 70, caption: 'Two half notes (1 2, 3 4), then a whole note (1 2 3 4).' },
    },
    { generate: 'note-value-math', params: { ask: 'beats', values: ['quarter', 'half', 'whole'] }, fact: 'quarter-half-whole' },
    {
      type: 'tap-rhythm',
      prompt: 'A bar of half notes: tap on beats 1 and 3, and count all four out loud.',
      rhythm: { pattern: 'h h' },
      tempo: 70,
      show: 'both',
      explain: 'Each half note lasts two beats, so you tap on 1 and on 3 and say "2" and "4" while the notes ring.',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Now mix them: two quarter notes, then a half note.',
      rhythm: { pattern: 'q q h' },
      tempo: 70,
      show: 'both',
      explain: 'Taps on 1, 2 and 3. The half note on 3 rings through beat 4, and you keep counting "4" while it rings.',
    },
    toolTask({
      id: 'inner-clock',
      title: 'Keep the beat when the click stops',
      tool: 'rhythm',
      params: ['clock', '1'],
      minutes: 3,
      body: 'Tap along with the click. After two bars it goes quiet for one bar of four beats, then comes back. Keep tapping and counting through the quiet bar: are you still with it when the click returns?',
      tip: 'Count out loud, even in the quiet bar. It feels silly for a week, and then it is the thing that holds every song together.',
    }),
    {
      type: 'choice',
      prompt: 'You lose the beat while you are playing. What do you do?',
      options: [
        { text: 'Keep counting, and come in on the next 1', correct: true },
        { text: 'Stop and start again', why: 'The beat does not wait for anyone. Keep counting and join it again at the start of a bar.' },
        { text: 'Play faster to catch up', why: 'Rushing pulls you further away. Keep counting at the same speed.' },
      ],
      explain: 'The beat carries on without you. Keep counting out loud and come back in on the next 1.',
      fact: 'keep-counting',
    },
    toolTask({
      id: 'steady-quarters',
      title: 'Steady Quarters with the Metronome',
      tool: 'metronome',
      minutes: 4,
      body: 'Set the Metronome to 70 BPM, beat 1 the high click. Play Strumming: Steady Quarters: {c:Em} for four bars, {c:A} for four, one downstrum on every click, counting 1 2 3 4 out loud. When it feels steady, go up to 80.',
      tip: 'Start the {c:A} strums on string 5. Missed a chord? Keep the arm moving and catch the next beat.',
    }),
    { generate: 'rhythm-tap', params: { values: ['quarter', 'half'], tempo: 70 } },
  ],
  facts: [
    { id: 'beat-and-tempo', front: 'What is the beat, and what is the tempo?', back: 'The beat is the steady pulse you tap your foot to. The tempo is how fast it goes, in beats per minute (BPM).' },
    { id: 'count-four-four', front: 'How do you count a bar of 4/4?', back: '1 2 3 4, with a little more weight on 1.' },
    { id: 'quarter-half-whole', front: 'In 4/4, how long do a quarter, a half and a whole note last?', back: 'One beat, two beats and four beats.' },
    { id: 'keep-counting', front: 'You lose the beat while playing. What do you do?', back: 'Keep counting out loud and come back in on the next 1.' },
  ],
};

// ── 2. The D chord ──────────────────────────────────────────────────────────────────────────────

const theDChord: TeacherLesson = {
  id: 'the-d-chord',
  title: 'The D chord',
  teaches: 'D is a triangle at frets 2, 3 and 2 of strings 3, 2 and 1, strummed from the open string 4.',
  minutes: 5,
  skill: 'teacher:mia:the-d-chord',
  steps: [
    {
      type: 'card',
      title: 'D: a little triangle',
      body: '{c:D} lives on the thin strings: finger 1 on string 3, fret 2 ({n:A}), finger 3 on string 2, fret 3 ({n:D}) and finger 2 on string 1, fret 2 ({n:F#}). Your three fingertips make a little triangle, with finger 3 at the top.',
      figure: { kind: 'chord', symbol: 'D', frets: 'xx0232', fingers: 'xx0132', caption: 'D: the x over strings 6 and 5 means leave them out.' },
    },
    {
      type: 'choice',
      prompt: 'In {c:D}, which finger presses string 2, fret 3?',
      options: [
        { text: 'Finger 3', correct: true },
        { text: 'Finger 1', why: 'Finger 1 is on string 3, fret 2.' },
        { text: 'Finger 2', why: 'Finger 2 is on string 1, fret 2.' },
      ],
      explain: 'Finger 3 takes the highest fret: string 2, fret 3 ({n:D}). Fingers 1 and 2 sit at fret 2, on strings 3 and 1.',
      fact: 'd-chord',
    },
    {
      type: 'card',
      title: 'Strum from string 4',
      body: 'The x over strings 6 and 5 means: do not play them. Start the strum on the open string 4 and let it stop after string 1. Listen to {c:D} on strings 4 to 1: clear and bright.',
      figure: { kind: 'audio', sound: { kind: 'chord', chord: 'D', frets: 'xx0232', style: 'strum' }, label: 'Hear D on strings 4 to 1' },
    },
    {
      type: 'listen-choice',
      prompt: 'Mia strums {c:D} again. Did she start on string 4, or catch strings 6 and 5 too?',
      sound: { kind: 'notes', notes: ['E2', 'A2', 'D3', 'A3', 'D4', 'F#4'], together: true },
      options: [{ text: 'Clean: strings 4 to 1' }, { text: 'Muddy: all six strings', correct: true }],
      shuffle: false,
      explain: 'That one rumbled: the open strings 6 ({n:E}) and 5 ({n:A}) rang under the chord. Aim the pick at string 4 and the rumble goes away.',
      fact: 'd-strings',
    },
    {
      type: 'play-phrase',
      prompt: 'Hold {c:D} and play it string by string: the open string 4, then strings 3, 2 and 1.',
      notes: [
        { string: 4, fret: 0, duration: 'q' },
        { string: 3, fret: 2, duration: 'q' },
        { string: 2, fret: 3, duration: 'q' },
        { string: 1, fret: 2, duration: 'q' },
      ],
      octave: 'exact',
      tempo: 60,
      explain: 'Open string 4 ({n:D}), string 3 fret 2 ({n:A}), string 2 fret 3 ({n:D}), string 1 fret 2 ({n:F#}). A dull note means a finger is touching the next string: curve it more.',
      alternative: {
        type: 'order',
        prompt: 'Put the notes of {c:D} in order, from the open string 4 to string 1.',
        tiles: ['{n:D}', '{n:A}', '{n:D}', '{n:F#}'],
        distractors: ['{n:E}'],
        explain: 'Open string 4 is {n:D}, string 3 fret 2 is {n:A}, string 2 fret 3 is {n:D} and string 1 fret 2 is {n:F#}.',
      },
    },
    {
      type: 'play-chord',
      prompt: 'Now strum {c:D} once, slowly, from string 4 down to string 1.',
      chord: 'D',
      frets: 'xx0232',
      explain: 'Four strings ring in {c:D}: {n:D}, {n:A}, {n:D} and {n:F#}. If you hear a low rumble, the strum started on string 6 or 5.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'D',
        frets: 'xx0232',
        accept: 'this-shape',
        prompt: 'Build {c:D}: three fingers, with strings 6 and 5 left out.',
        explain: 'String 3 fret 2, string 2 fret 3 and string 1 fret 2, over the open string 4. Strings 6 and 5 stay silent.',
      },
    },
    techniqueTask({
      id: 'right-strings',
      title: 'Strum only the right strings',
      exercise: 'tech-strum-accuracy',
      minutes: 4,
      body: 'Two bars each of {c:D}, {c:A} and {c:E}, four strums a bar, from 60 BPM. Aim the first strum of each bar at the chord\'s lowest string: string 4 for {c:D}, 5 for {c:A}, 6 for {c:E}. Close your eyes in the {c:D} bars and listen for a low rumble.',
    }),
    {
      type: 'choice',
      prompt: 'Which chord box is {c:D}?',
      options: [
        { figure: { kind: 'chord', symbol: 'D', frets: 'xx0232', fingers: 'xx0132' }, correct: true },
        { figure: { kind: 'chord', symbol: 'Em', frets: '022000', fingers: '023000' }, why: 'This is {c:Em}: two fingers at fret 2 and all six strings.' },
        { figure: { kind: 'chord', symbol: 'A', frets: 'x02220', fingers: 'x01230' }, why: 'This is {c:A}: three fingers in a row at fret 2, strummed from string 5.' },
      ],
      explain: '{c:D} is the triangle on strings 3, 2 and 1, with an x over strings 6 and 5.',
    },
    {
      type: 'card',
      title: 'From {c:Em} to {c:D}',
      body: '{c:Em} to {c:D} is a big move: every finger goes somewhere new. Look at the {c:D} triangle before you change. Put finger 3 down first, on string 2, fret 3, and let fingers 1 and 2 fall in around it.',
      figure: { kind: 'chord', symbol: 'Em', frets: '022000', fingers: '023000', caption: '{c:Em}: fingers 2 and 3 at fret 2. Every finger moves for {c:D}.' },
    },
    {
      type: 'choice',
      prompt: 'Changing from {c:Em} to {c:D}, which finger goes down first?',
      options: [
        { text: 'Finger 3, on string 2, fret 3', correct: true },
        { text: 'Finger 1, on string 3, fret 2', why: 'Finger 1 falls in once finger 3 is down. Finger 3 leads.' },
        { text: 'Whichever finger is nearest', why: 'A fixed order makes the change automatic. Finger 3 first, every time.' },
      ],
      explain: 'Finger 3 has the highest fret and the farthest to go. Put it down first and fingers 1 and 2 fall in around it.',
      fact: 'em-to-d',
    },
    playerTask({
      id: 'em-d-ladder',
      title: '{c:Em} to {c:D}: the change ladder',
      song: 'st-change-em-d-em-g',
      bars: [1, 8],
      minutes: 4,
      body: 'Bars 1 to 8 of the {c:Em} and {c:D} study, at 60 BPM: one strum a bar, then two, then four, then a change every two beats. The new chord lands on the beat, even if the strum before it catches open strings. It is fine: the beat matters more.',
    }),
    toolTask({
      id: 'em-d-minute',
      title: 'One-minute changes: {c:Em} to {c:D}',
      tool: 'chords',
      params: ['trainer', 'e-minor', 'd-major'],
      minutes: 2,
      body: 'One minute of {c:Em} to {c:D} and back, one strum per chord. Count the changes where every string of the new chord rang. Note your score: it is the number to beat next time.',
    }),
    { generate: 'chord-shape', params: { chords: ['D', 'Em'] } },
  ],
  facts: [
    { id: 'd-chord', front: 'Where do the fingers go for D?', back: 'Finger 1 on string 3 fret 2, finger 3 on string 2 fret 3, finger 2 on string 1 fret 2.' },
    { id: 'd-strings', front: 'Which strings do you strum for D?', back: 'Strings 4 to 1: start on the open string 4 and miss strings 6 and 5.' },
    { id: 'em-to-d', front: '{c:Em} to {c:D}: which finger goes down first?', back: 'Finger 3, on string 2 fret 3. Look at the D triangle before the change.' },
  ],
};

// ── 3. Down-up eighth notes ─────────────────────────────────────────────────────────────────────

const downUpEighths: TeacherLesson = {
  id: 'down-up-eighths',
  title: 'Down-up eighth notes',
  teaches: 'Eighth notes split each beat in two: down on every number, up on every and, and the hand never stops.',
  minutes: 5,
  skill: 'teacher:mia:down-up-eighths',
  steps: [
    {
      type: 'card',
      title: 'Two strums in every beat',
      body: '{t:eighth-note|Eighth notes} split each beat in two. Count them "1 & 2 & 3 & 4 &", saying "and" for each &. The numbers are the beats you already know; each & falls halfway between two of them.',
      figure: { kind: 'rhythm', pattern: 'e e e e e e e e', time: '4/4', tempo: 70, caption: 'One bar of eighth notes: 1 & 2 & 3 & 4 &.' },
    },
    {
      type: 'choice',
      prompt: 'How do you count a bar of eighth notes in 4/4?',
      options: [
        { text: '1 & 2 & 3 & 4 &', correct: true },
        { text: '1 2 3 4', why: 'That is quarter notes, one per beat. Eighth notes add an & between the beats.' },
        { text: '1 2 3 4 5 6 7 8', why: 'There are still four beats in the bar. Each one is split in two: 1 &, 2 &.' },
      ],
      explain: 'Eight eighth notes fill a bar of 4/4, two per beat: the number on the beat and the & halfway to the next.',
      fact: 'eighths-count',
    },
    {
      type: 'card',
      title: 'A pendulum',
      body: 'Your strumming hand swings like a pendulum: down on every number, up on every &. It never stops, not even while you change chord. The upstrum catches just the top three or four strings, so it sounds lighter. That lighter sound is right.',
      figure: { kind: 'audio', sound: { kind: 'strum', chord: 'Em', pattern: 'DUDUDUDU', tempo: 70 }, label: 'Hear down-up on {c:Em}' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each part of the strum with what it does.',
      pairs: [
        { left: 'Downstrum', right: 'On every number' },
        { left: 'Upstrum', right: 'On every &' },
        { left: 'An upstrum hits', right: 'The top 3 or 4 strings' },
        { left: 'While you change chord', right: 'The hand keeps swinging' },
      ],
      explain: 'Down on the numbers, up on the &, the upstrum lighter on the thin strings, and the hand swinging all the time, even through a chord change.',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap down-up eighth notes with the click: two even taps for every click, saying "1 & 2 &" out loud.',
      rhythm: { pattern: 'e e e e e e e e' },
      tempo: 60,
      show: 'both',
      explain: 'Two taps for every click: one on the beat and one exactly halfway. Saying "1 & 2 &" keeps them even.',
    },
    {
      type: 'true-false',
      statement: 'An upstrum should hit all six strings as hard as the downstrum.',
      answer: false,
      explain: 'The upstrum only needs the top three or four strings, and it sounds lighter than the downstrum. That is how down-up strumming should sound.',
      fact: 'upstrum-strings',
    },
    techniqueTask({
      id: 'constant-motion',
      title: 'Keep the hand moving',
      exercise: 'tech-strum-constant',
      minutes: 4,
      body: 'Hold {c:Em} and start at 60 BPM. The exercise misses some strums; for now, touch the strings on every down and every up anyway. All you are learning today is the swing: down on the numbers, up on the &, never stopping.',
      tip: 'Strum from the wrist and forearm, like turning a doorknob, not from the elbow.',
    }),
    toolTask({
      id: 'down-up-trainer',
      title: 'Down-up eighths in Rhythm',
      tool: 'rhythm',
      params: ['strum', 'down-up'],
      minutes: 3,
      body: 'Strum or tap the down-up pattern along with the trainer, saying "1 & 2 & 3 & 4 &" out loud. The trainer scores how close each strum lands to the beat. Two rounds, then come back.',
    }),
    {
      type: 'listen-choice',
      prompt: 'Listen to this strum on {c:Em}. Is it one downstrum per beat, or down-up eighth notes?',
      sound: { kind: 'strum', chord: 'Em', pattern: 'D-D-D-D-', tempo: 70 },
      options: [{ text: 'One downstrum per beat', correct: true }, { text: 'Down-up eighth notes' }],
      shuffle: false,
      explain: 'One strum on every beat and nothing in between: quarter notes. Down-up eighths put a lighter upstrum on every &, halfway between the beats.',
    },
    {
      type: 'card',
      title: '{c:Em} and {c:D} in eighth notes',
      body: 'Strumming: Down-Up Eighths changes chord every two bars: {c:Em}, then {c:D} on strings 4 to 1. Keep the hand swinging through each change. In the last 8 bars, lean a little on beats 2 and 4: a slightly harder downstrum on "2" and "4".',
      figure: { kind: 'audio', sound: { kind: 'strum', chord: 'D', pattern: 'DUDUDUDU', tempo: 70 }, label: 'Hear down-up on {c:D}' },
    },
    playerTask({
      id: 'eighths-study',
      title: 'Strumming: Down-Up Eighths',
      song: 'st-strum-eighths',
      tempo: 86,
      minutes: 4,
      body: 'Play the study at about 60 BPM first, then raise the tempo to 100 % (70 BPM). Down on every number, up on every &. In the last 8 bars, lean on beats 2 and 4.',
      tip: 'If a change to {c:D} is late, strum open strings on the last & and land the new chord on the beat.',
    }),
    { generate: 'rhythm-tap', params: { values: ['quarter', 'eighth'], tempo: 70 } },
  ],
  facts: [
    { id: 'eighths-count', front: 'How do you count eighth notes in 4/4?', back: '"1 & 2 & 3 & 4 &": down on the numbers, up on each &.' },
    { id: 'upstrum-strings', front: 'How many strings does an upstrum catch?', back: 'Just the top three or four, so it sounds lighter than the downstrum. The hand never stops swinging.' },
  ],
};

// ── 4. Drunken Sailor ───────────────────────────────────────────────────────────────────────────

const drunkenSailor: TeacherLesson = {
  id: 'drunken-sailor',
  title: 'Drunken Sailor',
  teaches: 'Drunken Sailor lives on {c:Em} and {c:D}: two beats a bar with beat 1 leaned on, then down-up eighths.',
  minutes: 4,
  skill: 'teacher:mia:drunken-sailor',
  steps: [
    {
      type: 'card',
      title: 'An old sea shanty',
      body: 'What Shall We Do with the Drunken Sailor is a sea shanty, a song sailors sang while they worked. It has two beats in a bar (2/4), a dark, minor sound, and only two chords: {c:Em} for line 1, {c:D} for line 2, {c:Em} for line 3, then {c:D} and {c:Em} for the last line. The chorus is the same.',
      figure: {
        kind: 'audio',
        sound: { kind: 'progression', chords: ['Em', 'Em', 'D', 'D', 'Em', 'Em', 'D', 'Em'], beats: 4, tempo: 80 },
        label: 'Hear the four lines',
      },
    },
    {
      type: 'order',
      prompt: 'Put the chords of the four lines in order.',
      tiles: ['{c:Em}', '{c:D}', '{c:Em}', '{c:D} then {c:Em}'],
      explain: 'Line 1 {c:Em}, line 2 {c:D}, line 3 {c:Em}, and the last line {c:D} then {c:Em}. The chorus and the verse use the same chords.',
      fact: 'sailor-chords',
    },
    {
      type: 'card',
      title: 'Haul on beat 1',
      body: 'Start with two downstrums in each bar, one per beat, and a strong {t:accent} on beat 1, like sailors hauling on a rope together: "ONE two, ONE two". Count it out loud before you play.',
      figure: { kind: 'rhythm', pattern: 'q q | q q', time: '2/4', tempo: 80, caption: 'Two bars of 2/4: ONE two, ONE two.' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap two bars of 2/4 with the click: "ONE two, ONE two", beat 1 a little stronger.',
      rhythm: { pattern: 'q q | q q', time: '2/4' },
      tempo: 80,
      show: 'both',
      explain: 'Two beats in every bar: a tap on each click. The accent on 1 is a little extra weight, never a little earlier.',
    },
    {
      type: 'listen-choice',
      prompt: 'Is this chord {c:Em} or {c:D}?',
      sound: { kind: 'chord', chord: 'Em' },
      options: [{ text: '{c:Em}', correct: true }, { text: '{c:D}' }],
      shuffle: false,
      explain: 'That was {c:Em}: all six strings, deep and dark. {c:D} uses only four strings and sounds higher and brighter.',
    },
    playerTask({
      id: 'sailor-downstrums',
      title: 'Drunken Sailor: the first chorus',
      song: 'drunken-sailor',
      bars: [1, 16],
      tempo: 83,
      minutes: 4,
      body: 'Bars 1 to 16, the first chorus, at about 80 BPM: two downstrums per bar, beat 1 a little stronger. {c:D} on strings 4 to 1. Sing or hum "Way hay and up she rises" if you like.',
      tip: 'Say "ONE two" out loud for the first few bars. The accent tells you where each bar starts.',
    }),
    {
      type: 'listen-choice',
      prompt: 'And this one: {c:Em} or {c:D}?',
      sound: { kind: 'chord', chord: 'D' },
      options: [{ text: '{c:Em}' }, { text: '{c:D}', correct: true }],
      shuffle: false,
      explain: 'That was {c:D}: four strings, higher and brighter. {c:Em} rings on all six and sounds deeper.',
    },
    playerTask({
      id: 'sailor-eighths',
      title: 'Drunken Sailor, all the way',
      song: 'drunken-sailor',
      tempo: 83,
      minutes: 5,
      body: 'Now the whole song, at about 80 BPM: two downstrums a bar in the first chorus, then down-up eighths in the verse and the last chorus, as the Player shows. When it flows, play it at 100 % (96 BPM).',
      tip: 'Keep the hand swinging down-up even across the changes. Late on a chord? Strum open strings and land on the beat.',
    }),
    {
      type: 'true-false',
      statement: 'The chorus of Drunken Sailor uses the same chords as the verse.',
      answer: true,
      explain: 'Both go {c:Em}, {c:D}, {c:Em}, then {c:D} and {c:Em}. Learn one and you know the whole song.',
    },
    {
      type: 'choice',
      prompt: 'Which chord plays under line 2?',
      options: [
        { text: '{c:D}', correct: true },
        { text: '{c:Em}', why: '{c:Em} plays under lines 1 and 3. Line 2 is {c:D}.' },
      ],
      explain: 'Line 1 {c:Em}, line 2 {c:D}, line 3 {c:Em}, then {c:D} and {c:Em} to finish.',
      fact: 'sailor-chords',
    },
  ],
  facts: [
    { id: 'sailor-chords', front: 'The chords of Drunken Sailor, line by line?', back: 'Line 1 {c:Em}, line 2 {c:D}, line 3 {c:Em}, the last line {c:D} then {c:Em}. The chorus is the same.' },
  ],
};

// ── 5. A7 and waltz time ────────────────────────────────────────────────────────────────────────

const a7AndWaltzTime: TeacherLesson = {
  id: 'a7-and-waltz-time',
  title: '{c:A7} and waltz time',
  teaches: '{c:A7} is two fingers at fret 2 with string 3 open; waltz time is 1 2 3: a bass note on 1, strums on 2 and 3.',
  minutes: 5,
  skill: 'teacher:mia:a7-and-waltz-time',
  steps: [
    {
      type: 'card',
      title: '{c:A7}: {c:A} with a gap',
      body: '{c:A7} is your {c:A} with a gap in the middle: finger 2 on string 4, fret 2 ({n:E}) and finger 3 on string 2, fret 2 ({n:C#}), with string 3 left open between them. Strum it from string 5, as you strum {c:A}.',
      figure: { kind: 'chord', symbol: 'A7', frets: 'x02020', fingers: 'x02030', caption: '{c:A7}: two fingers at fret 2, string 3 open, string 6 left out.' },
    },
    {
      type: 'choice',
      prompt: 'In {c:A7}, which string rings open between your two fingers?',
      options: [
        { text: 'String 3', correct: true },
        { text: 'String 4', why: 'String 4 has finger 2 on it, at fret 2.' },
        { text: 'String 2', why: 'String 2 has finger 3 on it, at fret 2.' },
      ],
      explain: 'Fingers 2 and 3 sit on strings 4 and 2 at fret 2, and the open string 3 ({n:G}) rings between them. Arch finger 2 so it does not touch it.',
      fact: 'a7-chord',
    },
    {
      type: 'play-chord',
      prompt: 'Strum {c:A7} once, from string 5, and check that the open string 3 rings.',
      chord: 'A7',
      frets: 'x02020',
      explain: '{c:A7} rings on strings 5 to 1: {n:A}, {n:E}, {n:G}, {n:C#} and {n:E}. If string 3 sounds dead, finger 2 is leaning on it.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'A7',
        frets: 'x02020',
        accept: 'this-shape',
        prompt: 'Build {c:A7}: two fingers at fret 2, string 3 open.',
        explain: 'Fret 2 on strings 4 and 2, with the open strings 5, 3 and 1 ringing around them.',
      },
    },
    {
      type: 'play-chord',
      prompt: 'Change from {c:D} to {c:A7} four times, one strum each. End on {c:A7} and let it ring.',
      chord: 'A7',
      frets: 'x02020',
      explain: 'From {c:D}, finger 3 slides one fret back along string 2, from fret 3 to fret 2, and finger 2 moves to string 4. Keep finger 3 touching the string as it slides.',
      alternative: { generate: 'chord-shape', params: { chords: ['A7', 'D'] } },
    },
    {
      type: 'card',
      title: 'Waltz time: 1 2 3',
      body: '{t:waltz-time|Waltz time}, written 3/4, has three beats in a bar. Count "1 2 3, 1 2 3". On 1 play a single {t:bass-note|bass note}; on 2 and 3, strum the higher strings lightly. Under {c:D} the bass note is the open string 4 ({n:D}); under {c:A7} it is the open string 5 ({n:A}).',
      figure: { kind: 'rhythm', pattern: 'q q q | q q q', time: '3/4', tempo: 80, caption: 'Two bars of 3/4: bass on 1, strums on 2 and 3.' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap two bars of waltz time with the click, counting "1 2 3" out loud.',
      rhythm: { pattern: 'q q q | q q q', time: '3/4' },
      tempo: 80,
      show: 'both',
      explain: 'Three beats in every bar. Beat 1 is the bass note, 2 and 3 the light strums: "ONE two three".',
      fact: 'count-three-four',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each part of the waltz with what you play.',
      pairs: [
        { left: 'Beat 1 under {c:D}', right: 'The open string 4' },
        { left: 'Beat 1 under {c:A7}', right: 'The open string 5' },
        { left: 'Beats 2 and 3', right: 'Strums on strings 3 to 1' },
      ],
      explain: 'Under {c:D} the bass is the open string 4 ({n:D}), under {c:A7} the open string 5 ({n:A}), and beats 2 and 3 are light strums on strings 3 to 1.',
      fact: 'waltz-bass',
    },
    playerTask({
      id: 'waltz-study',
      title: 'Strumming: Waltz (Bass-Strum-Strum)',
      song: 'st-strum-waltz',
      tempo: 75,
      minutes: 4,
      body: 'Play the waltz study at about 72 BPM, counting "1 2 3" out loud: bass note on 1, light strums on strings 3 to 1 on 2 and 3. {c:D} for two bars, {c:A7} for two. When it is steady, raise the tempo to about 84 BPM.',
      tip: 'Hold the whole chord shape all the time, even though the bass note is an open string.',
    }),
    {
      type: 'fretboard-find',
      prompt: 'Tap the bass note you play on beat 1 under {c:A7}.',
      find: { note: 'A2' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 3],
      explain: 'Under {c:A7} the bass note is the open string 5, {n:A}: the note the chord is named after.',
    },
    playerTask({
      id: 'd-a7-ladder',
      title: '{c:D} to {c:A7}, and {c:D} to {c:A}',
      song: 'st-change-d-a7-a-d',
      minutes: 4,
      body: 'Both halves at 60 BPM. First {c:D} and {c:A7}: finger 3 slides one fret along string 2. Then {c:D} and {c:A}: finger 1 stays on string 3, fret 2 for both. One strum a bar, then two, then four, then a change every two beats.',
    }),
    toolTask({
      id: 'd-a7-minute',
      title: 'One-minute changes: {c:D} to {c:A7}',
      tool: 'chords',
      params: ['trainer', 'd-major', 'a-7'],
      minutes: 2,
      body: 'One minute of {c:D} to {c:A7} and back. Count the clean changes, where every string of the new chord rang, and note your score.',
    }),
    { generate: 'meter', params: { ask: 'beats', signatures: ['3/4', '4/4', '2/4'] } },
  ],
  facts: [
    { id: 'a7-chord', front: 'Where do the fingers go for {c:A7}?', back: 'Finger 2 on string 4 fret 2, finger 3 on string 2 fret 2, with string 3 open. Strum from string 5.' },
    { id: 'count-three-four', front: 'How do you count waltz time (3/4)?', back: '"1 2 3, 1 2 3": three beats in a bar, beat 1 the strongest.' },
    { id: 'waltz-bass', front: 'The waltz pattern: what goes on beats 1, 2 and 3?', back: 'A bass note on 1 (the open string 4 under {c:D}, the open string 5 under {c:A7}), light strums on 2 and 3.' },
  ],
};

// ── 6. Two waltzes ──────────────────────────────────────────────────────────────────────────────

const waltzSongs: TeacherLesson = {
  id: 'waltz-songs',
  title: 'Two waltzes',
  teaches: 'Clementine starts with a pickup on beat 3: wait, and come in with your bass note on the next 1.',
  minutes: 5,
  skill: 'teacher:mia:waltz-songs',
  steps: [
    {
      type: 'card',
      title: 'Two songs in 3/4',
      body: 'Down in the Valley and Clementine are both in 3/4, so your bass-strum-strum carries them all the way. Down in the Valley uses {c:A} and {c:E7}. Under {c:A} the bass note is the open string 5 ({n:A}); under {c:E7} it is the open string 6 ({n:E}).',
      figure: { kind: 'chord', symbol: 'E7', frets: '020100', fingers: '020100', caption: '{c:E7}: the bass note on beat 1 is the open string 6.' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each chord with its bass note on beat 1.',
      pairs: [
        { left: '{c:E7}', right: 'The open string 6' },
        { left: '{c:D}', right: 'The open string 4' },
        { left: '{c:A7}', right: 'The open string 5' },
      ],
      explain: 'Each bass note is the note the chord is named after: {n:E} on string 6 for {c:E7}, {n:D} on string 4 for {c:D}, {n:A} on string 5 for {c:A7} (and for {c:A}).',
      fact: 'e7-bass',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap the bass note you play under {c:E7}.',
      find: { note: 'E2' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 3],
      explain: 'Under {c:E7} the bass note is the open string 6, the low {n:E}.',
    },
    playerTask({
      id: 'valley',
      title: 'Down in the Valley',
      song: 'down-in-the-valley',
      tempo: 89,
      minutes: 4,
      body: 'Play it at about 96 BPM: bass on 1, strums on 2 and 3, {c:A} and {c:E7}. Each chord lasts at least two bars, so there is time to get ready. When it flows, go up to 100 % (108 BPM).',
      tip: 'Count "1 2 3" out loud for the first verse. Singing can come once your hands know the way.',
    }),
    {
      type: 'card',
      title: 'A pickup: wait for it',
      body: 'Clementine uses {c:D} and {c:A7}, and it starts with a {t:pickup}: the singer begins on beat 3, before the first full bar. So you wait. Count "1 2", let the singer start on 3, and come in with your first bass note on the next 1.',
      figure: { kind: 'rhythm', pattern: 'hr q | q q q', time: '3/4', tempo: 96, caption: 'The singer starts on beat 3; you come in on the next 1.' },
    },
    {
      type: 'choice',
      prompt: 'In Clementine, on which beat does the singing start?',
      options: [
        { text: 'Beat 3, before the first full bar', correct: true },
        { text: 'Beat 1 of the first bar', why: 'That is where you come in. The singer is already one beat ahead of you.' },
        { text: 'Beat 2 of the first bar', why: 'The singing starts earlier, on beat 3 of the bar before.' },
      ],
      explain: 'The song starts with a pickup on beat 3. You count "1 2", the singer starts on 3, and your bass note comes on the next 1.',
      fact: 'clementine-pickup',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Count "1 2" with the click. Tap on 3, where the singing starts, then on the next 1, where your bass note goes.',
      rhythm: { pattern: 'hr q | q hr', time: '3/4' },
      tempo: 96,
      show: 'both',
      explain: 'The first tap is the singer on beat 3; the second is your bass note on beat 1 of the first full bar.',
    },
    {
      type: 'true-false',
      statement: 'In Clementine, you play your first bass note together with the first sung word.',
      answer: false,
      explain: 'The first words come on beat 3, in the pickup. You wait, and your first bass note comes on the 1 after them.',
    },
    playerTask({
      id: 'clementine',
      title: 'Oh My Darling, Clementine',
      song: 'clementine',
      tempo: 89,
      minutes: 5,
      body: 'Play at least the first verse and the chorus at about 96 BPM: wait through the pickup, then bass on 1, strums on 2 and 3. {c:D} and {c:A7}, with the bass on the open string 4 under {c:D} and string 5 under {c:A7}. Then try it at 100 % (108 BPM).',
      tip: 'Every line has the same chords. Learn one line and you have the whole song.',
    }),
    {
      type: 'choice',
      prompt: 'Which two chords does Down in the Valley use?',
      options: [
        { text: '{c:A} and {c:E7}', correct: true },
        { text: '{c:D} and {c:A7}', why: 'Those are the chords of Clementine.' },
        { text: '{c:Em} and {c:D}', why: 'Those are the chords of Drunken Sailor.' },
      ],
      explain: 'Down in the Valley uses {c:A} and {c:E7}; Clementine uses {c:D} and {c:A7}. Both are waltzes: bass on 1, strums on 2 and 3.',
    },
  ],
  facts: [
    { id: 'clementine-pickup', front: 'What is a pickup, and when do you come in?', back: 'A note or two sung before the first full bar. Wait through it and come in with your bass note on the next 1.' },
    { id: 'e7-bass', front: 'Which bass note do you play under {c:E7} in a waltz?', back: 'The open string 6, the low {n:E}.' },
  ],
};

/** Unit 4 of Mia's course. */
const unit: TeacherUnit = {
  id: 'mia-d-and-the-beat',
  title: '{c:D}, {c:A7} and the steady beat',
  theme: 'rhythm',
  description: 'Count and keep a steady beat, add {c:D} and {c:A7}, strum down-up eighth notes and feel waltz time.',
  lessons: [countingTheBeat, theDChord, downUpEighths, drunkenSailor, a7AndWaltzTime, waltzSongs],
  checkpoint: { sample: 8, maxMistakes: 2 },
  glossary: [
    { id: 'accent', term: 'accent', definition: 'A note or strum played a little louder than the ones around it, such as beat 1 of every bar.' },
    { id: 'waltz-time', term: 'waltz time', definition: 'Music with three beats in a bar, written 3/4 and counted "1 2 3", beat 1 the strongest.' },
    { id: 'bass-note', term: 'bass note', definition: 'One low string played on its own, usually on beat 1, with the rest of the chord strummed after it.' },
    { id: 'pickup', term: 'pickup', definition: 'A note or two before the first full bar of a song. You wait through it and come in on the next beat 1.' },
  ],
};

export default unit;
