/**
 * Dev, unit 3: Lead guitar, the expressive techniques (plan: `dev/dev-lead-techniques` in
 * src/content/plan/teachers.json).
 *
 * Dev's voice: a bandmate who ties every move to something you can play tonight. Legato, slides,
 * bends, vibrato, unison bends and pre-bends, all inside A minor pentatonic box 1, then combined
 * into short phrases that sound like a voice. These come before the pentatonic boxes of unit 4,
 * whose licks use them.
 *
 * The microphone checks of bends and vibrato live in the Technique screen (its bend, pre-bend and
 * vibrato checks); the lessons send the learner there and back, and add in-lesson play steps the
 * pitch tracker can grade (a target note, a pre-bent start, the notes of a phrase), each with a
 * no-microphone alternative. Tab figures carry no bend or slide marks, so the words say where they go.
 *
 * Music from the song library: Lick: Slides (`st-lick-slide`, 92 BPM), Lick: Bends in Tune
 * (`st-lick-bend`, 72 BPM), Lick: Vibrato (`st-lick-vibrato`, 60 BPM) and Pentatonic Box 1 Lick
 * (`st-pent-box-1`, 84 BPM). Dev's three phrases are original and written here.
 * `dev-lead-techniques.test.ts` checks every note, target and tempo against the engines and the library.
 */
import type { TabNote } from '@/lessons';
import type { TeacherLesson, TeacherUnit } from '../types';
import { playerTask, techniqueTask, toolTask } from '../tasks';

// ── 1. Legato: hammer, pull, trill ──────────────────────────────────────────────────────────────

/** C (string 3 fret 5) hammered to D (fret 7) and pulled back: the trill of the lesson. */
const TRILL: TabNote[] = [
  { string: 3, fret: 5, duration: 'e' },
  { string: 3, fret: 7, duration: 'e' },
  { string: 3, fret: 5, duration: 'e' },
  { string: 3, fret: 7, duration: 'e' },
  { string: 3, fret: 5, duration: 'e' },
  { string: 3, fret: 7, duration: 'e' },
  { string: 3, fret: 5, duration: 'q' },
];

/** Eight hammer-ons and eight pull-offs between C and D on string 3. */
const EIGHT_TIMES: TabNote[] = Array.from({ length: 8 }, () => [
  { string: 3, fret: 5, duration: 'e' },
  { string: 3, fret: 7, duration: 'e' },
]).flat();

/** Hammer and Pull Chains on strings 6 and 5: frets 5-7-8 up, 8-7-5 down, in triplets. */
const CHAIN: TabNote[] = [
  ...[6, 5].flatMap((string) => [5, 7, 8].map((fret) => ({ string, fret, duration: 'et' }))),
  ...[5, 6].flatMap((string) => [8, 7, 5].map((fret) => ({ string, fret, duration: 'et' }))),
];

const legato: TeacherLesson = {
  id: 'legato',
  title: 'Legato: hammer, pull, trill',
  teaches: 'Legato joins notes without a new pick stroke; every hammered and pulled note is as loud as the picked one.',
  minutes: 5,
  skill: 'teacher:dev:legato',
  steps: [
    {
      type: 'card',
      title: 'One pick, many notes',
      body: '{t:legato} means smooth: notes joined without a new pick stroke. Pick {n:C} on string 3 fret 5 once; a {t:hammer-on} brings in {n:D} at fret 7, a {t:pull-off} brings back {n:C}. Back and forth fast, that is a {t:trill}. All of it sits in {t:pentatonic-box|box 1}.',
      figure: { kind: 'tab', tempo: 60, notes: [...TRILL], caption: 'Pick the first {n:C}; every other note is hammered or pulled.' },
    },
    {
      type: 'choice',
      prompt: 'What is the test of good legato?',
      options: [
        { text: 'Every note is as loud as the picked one', correct: true },
        { text: 'It is faster than picking', why: 'Speed comes later. Even volume comes first.' },
        { text: 'You cannot hear the notes change', why: 'Every note should be clear. It is the pick attack you should not hear.' },
      ],
      explain: 'If the hammered and pulled notes fade, the line sounds lumpy. Every note as loud as the picked one: that is legato.',
      fact: 'lead-legato-test',
    },
    {
      type: 'card',
      title: 'Hammer, then pull',
      body: 'Hammer from just above the string and land right behind the fret: speed makes it loud, not pressure. Pull off with a small sideways flick, toward the floor, so the finger plucks the string instead of just letting go. The finger on fret 5 stays down the whole time.',
      tip: 'Hammers sounding weak? Lift the finger less and come down faster.',
    },
    {
      type: 'play-phrase',
      prompt: 'Pick {n:C} once, then hammer to {n:D} and pull back to {n:C}, eight times. Every note as loud as the first.',
      notes: [...EIGHT_TIMES],
      octave: 'exact',
      tempo: 60,
      explain: '{n:C} at string 3 fret 5, {n:D} at fret 7: one pick for sixteen notes. The microphone heard each one, so none of them faded away.',
      alternative: {
        type: 'choice',
        prompt: 'No microphone? Record yourself on your phone and play it back. What should you hear?',
        options: [
          { text: 'Sixteen notes, all equally loud and even', correct: true },
          { text: 'Loud picked notes, quieter hammered ones', why: 'That is the sound to fix: hammer faster, from closer.' },
          { text: 'A little gap before each pull-off', why: 'A gap means the finger lifted. Flick sideways as it leaves.' },
        ],
        explain: 'Even volume and even spacing. Listen back to a recording and you will hear what your hands cannot feel yet.',
      },
    },
    {
      type: 'card',
      title: 'Chains and trills',
      body: 'Hammer and Pull Chains: frets 5, 7 and 8 with fingers 1, 3 and 4, one pick per string, up across the strings and back. Trills: each finger pair on string 3, four notes per beat. Every finger gets strong and independent.',
      figure: { kind: 'tab', tempo: 60, notes: [...CHAIN], caption: 'Strings 6 and 5: 5-7-8 up, 8-7-5 down, one pick per string.' },
    },
    techniqueTask({
      id: 'legato-chains',
      title: 'Hammer and Pull Chains',
      exercise: 'tech-legato-chains',
      minutes: 3,
      body: 'Start at 60 BPM and pick only the first note on each string. Go up 4 BPM after each clean pass, where clean means every note equally loud.',
    }),
    {
      type: 'fretboard-name',
      prompt: 'In the chain, finger 3 hammers onto string 5, fret 7. Which note?',
      position: { string: 5, fret: 7 },
      ask: 'note',
      spelling: 'any',
      options: ['E', 'D', 'F', 'C'],
      explain: 'String 5 is {n:A} open, so fret 5 is {n:D}, fret 7 {n:E} and fret 8 {n:F}.',
    },
    techniqueTask({
      id: 'trills',
      title: 'Trills, every finger pair',
      exercise: 'tech-trills',
      minutes: 2,
      body: 'Each finger pair for about 10 seconds, four notes per beat at 60 BPM, then rest 20 seconds. The lower finger stays pressed; only the upper one moves.',
      tip: 'Trills tire small muscles fast. An aching finger means stop and rest.',
    }),
    techniqueTask({
      id: 'permutations',
      title: 'Finger Permutations, starting with 1',
      exercise: 'tech-permutations-1',
      minutes: 3,
      body: 'This week the six orders that start with finger 1, frets 5 to 8. Next week the ones starting with 2, then 3 and 4. Set the tempo by your hardest order.',
    }),
    {
      type: 'true-false',
      statement: 'A hammer-on gets its volume from pressing hard.',
      answer: false,
      explain: 'Speed does it: a fast finger from just above the string, landing right behind the fret. Pressing harder only tires the hand.',
      fact: 'lead-hammer-on',
    },
    techniqueTask({
      id: 'anchored',
      title: 'Anchored Fingers',
      exercise: 'tech-anchored-fingers',
      minutes: 2,
      body: 'Two fingers hold while the other two move. Thirty seconds per string pair, then rest; stop for the day at any ache at the base of fingers 3 and 4.',
    }),
    {
      type: 'choice',
      prompt: 'Your pull-offs are nearly silent. What is going on?',
      options: [
        { text: 'You lift the finger instead of flicking it', correct: true },
        { text: 'You are not pressing hard enough on fret 7', why: 'Pressure matters less than the release: the finger has to pluck as it leaves.' },
        { text: 'Pull-offs are always quieter', why: 'A good pull-off is as loud as a picked note. The flick does it.' },
      ],
      explain: 'A pull-off is a tiny pluck by the fretting finger. Lifting straight up just stops the note; flicking sideways, toward the floor, sounds the next one.',
      fact: 'lead-pull-off',
    },
  ],
  facts: [
    { id: 'lead-legato-test', front: 'The test of good legato?', back: 'Every note is as loud as the picked one.' },
    { id: 'lead-pull-off', front: 'How do you pull off?', back: 'A small sideways flick toward the floor, so the finger plucks the string instead of just lifting.' },
    { id: 'lead-hammer-on', front: 'How do you hammer on?', back: 'From just above the string, landing right behind the fret: speed makes it loud, not pressure.' },
  ],
};

// ── 2. Slides ───────────────────────────────────────────────────────────────────────────────────

const slides: TeacherLesson = {
  id: 'slides',
  title: 'Slides',
  teaches: 'A slide keeps the finger pressed while it glides to a new fret, arriving exactly on the beat.',
  minutes: 4,
  skill: 'teacher:dev:slides',
  steps: [
    {
      type: 'card',
      title: 'Keep it pressed, let it glide',
      body: 'A {t:slide} moves the fretting finger along the string while it stays pressed, so the pitch glides to the new fret. Lick: Slides has three: string 3 fret 7 ({n:D}) to fret 9 ({n:E}), string 2 fret 8 ({n:G}) to fret 10 ({n:A}), and a long one on string 4, fret 5 ({n:G}) to fret 10 ({n:C}).',
      figure: {
        kind: 'tab',
        tempo: 72,
        notes: [
          { string: 3, fret: 7, duration: 'q' },
          { string: 3, fret: 9, duration: 'q' },
          { string: 2, fret: 8, duration: 'q' },
          { string: 2, fret: 10, duration: 'q' },
          { string: 4, fret: 5, duration: 'h' },
          { string: 4, fret: 10, duration: 'h' },
        ],
        caption: 'Each pair is one slide: pick the first note only.',
      },
    },
    {
      type: 'choice',
      prompt: 'Your slide dies halfway there. What fixes it?',
      options: [
        { text: 'The same pressure all the way', correct: true },
        { text: 'Press much harder', why: 'Too hard and the slide drags and lands late.' },
        { text: 'Pick again when you arrive', why: 'Then it is two notes, not a slide.' },
      ],
      explain: 'Too light and the note dies, too hard and it drags. Keep the pressure you had on the first note for the whole trip.',
      fact: 'lead-slide-pressure',
    },
    {
      type: 'fretboard-name',
      prompt: 'You slide from string 3 fret 7 up two frets. Which note do you land on?',
      position: { string: 3, fret: 9 },
      ask: 'note',
      spelling: 'any',
      options: ['E', 'D', 'F', 'C'],
      explain: 'String 3 fret 7 is {n:D}; two frets up, fret 9, is {n:E}.',
    },
    {
      type: 'card',
      title: 'Short slides, long slides',
      body: 'Arrive exactly on the beat: the slide leaves early so the new note lands on the click. Short slides connect notes inside a box. Long slides, like fret 5 to fret 10 on string 4, carry your hand to a new box higher up.',
      tip: 'Look at the target fret before you go, and ease off the speed just before you arrive.',
    },
    {
      type: 'true-false',
      statement: 'The note you slide to should land exactly on the beat.',
      answer: true,
      explain: 'The slide itself happens before the beat; the arrival is the note, so it goes on the click.',
    },
    techniqueTask({
      id: 'slide-targets',
      title: 'Slides to a Target',
      exercise: 'tech-slide-targets',
      minutes: 4,
      body: 'At 60 BPM: finger 3 from string 3 fret 7 to fret 9 and back, then string 2 fret 5 to fret 8 and back. Land each slide on the click with the note still ringing.',
    }),
    {
      type: 'play-phrase',
      prompt: 'Pick string 3 fret 7, then slide up to fret 9 without picking again. Land on {n:E}.',
      notes: [
        { string: 3, fret: 7, duration: 'h' },
        { string: 3, fret: 9, duration: 'h' },
      ],
      octave: 'exact',
      tempo: 60,
      explain: '{n:D} to {n:E}, one pick. The microphone heard you arrive on {n:E}, not a fret short or past it.',
      alternative: {
        type: 'listen-choice',
        prompt: 'No microphone: the target {n:E} first, then where a slide landed. Did it land on {n:E}?',
        sound: { kind: 'notes', notes: ['E4', 'D#4'], tempo: 60 },
        options: [{ text: 'Yes, right on {n:E}' }, { text: 'No, a fret short', correct: true }],
        shuffle: false,
        explain: 'The second note was lower than the target: the slide stopped at fret 8. On your guitar, play fret 9 first, then slide and compare by ear.',
      },
    },
    {
      type: 'fretboard-find',
      prompt: 'The long slide starts at string 4 fret 5 ({n:G}) and ends on {n:C}. Tap where you land.',
      find: { note: 'C4' },
      mode: 'one',
      octave: 'exact',
      strings: [4],
      frets: [5, 12],
      explain: 'String 4 fret 10 is {n:C}: five frets up from {n:G}, and the hand arrives in a new position.',
    },
    playerTask({
      id: 'lick-slides',
      title: 'Lick: Slides',
      song: 'st-lick-slide',
      tempo: 78,
      minutes: 4,
      body: 'Play it at about 72 BPM, then at 100 % (92 BPM). All three slides with finger 3; the hand comes home to box 1 in the rests at the ends of bars 2 and 4.',
    }),
    {
      type: 'choice',
      prompt: 'Which slide carries your hand to a new box?',
      options: [
        { text: 'String 4, fret 5 to fret 10', correct: true },
        { text: 'String 3, fret 7 to fret 9', why: 'Two frets: a short slide that connects notes nearby.' },
        { text: 'String 2, fret 8 to fret 10', why: 'Also two frets: the hand barely moves.' },
      ],
      explain: 'Five frets is a long slide: the hand ends up in a new position. Short slides join notes; long ones move you around the neck.',
      fact: 'lead-slide-short-long',
    },
  ],
  facts: [
    { id: 'lead-slide-pressure', front: 'A slide dies or drags. Why?', back: 'The pressure changed. Too light and the note dies, too hard and it drags: keep the first note\'s pressure all the way.' },
    { id: 'lead-slide-short-long', front: 'Short slides and long slides: what is each for?', back: 'Short slides connect notes inside a box; long slides carry you to a new box. Both land on the beat.' },
  ],
};

// ── 3. Bends in tune ────────────────────────────────────────────────────────────────────────────

const bendsInTune: TeacherLesson = {
  id: 'bends-in-tune',
  title: 'Bends in tune',
  teaches: 'Bend with three fingers and a turning wrist, and always aim at a target you have just played.',
  minutes: 4,
  skill: 'teacher:dev:bends-in-tune',
  steps: [
    {
      type: 'card',
      title: 'Push the pitch up',
      body: 'A {t:bend} pushes the string across the fretboard to raise its pitch. Bend with three fingers together: the ring finger, with the middle and index behind it on the same string, helping. Turn the wrist as if turning a door handle, rather than pushing with one finger.',
      figure: {
        kind: 'fretboard',
        frets: [3, 9],
        labels: 'finger',
        dots: [
          { string: 3, fret: 5, note: 'C', finger: 1 },
          { string: 3, fret: 6, note: 'C#', finger: 2 },
          { string: 3, fret: 7, note: 'D', finger: 3 },
        ],
        caption: 'Bending string 3 fret 7: fingers 1 and 2 push behind finger 3.',
      },
    },
    {
      type: 'choice',
      prompt: 'You bend string 3 fret 7. Which fingers do the work?',
      options: [
        { text: 'Finger 3, with 1 and 2 behind it', correct: true },
        { text: 'Finger 3 alone', why: 'One finger runs out of strength and goes flat. Three share the work.' },
        { text: 'Finger 1 at fret 7', why: 'Finger 3 plays it, with 1 and 2 behind on the same string.' },
      ],
      explain: 'Three fingers push together, and the wrist turns. The fingers mostly hold; the wrist does the bending.',
      fact: 'lead-bend-how',
    },
    {
      type: 'card',
      title: 'Know your target',
      body: 'Always know your target: play the note two frets up first, then bend until you match it. For string 3 fret 7 ({n:D}) the target is fret 9 ({n:E}): a whole step. A half step is one fret: string 2 fret 8 ({n:G}) bends to the pitch of fret 9 ({n:G#}).',
      figure: {
        kind: 'tab',
        tempo: 60,
        notes: [
          { string: 3, fret: 9, duration: 'h' },
          { string: 3, fret: 7, duration: 'h' },
        ],
        caption: 'Target first, fret 9; then fret 7, bent up until it sounds the same.',
      },
    },
    {
      type: 'play-note',
      prompt: 'Target first: play {n:E}, string 3 fret 9, and hold it in your ear.',
      note: 'E4',
      octave: 'exact',
      where: { string: 3, fret: 9 },
      explain: 'That {n:E} is where the bend from fret 7 has to arrive. Sing it in your head as you push.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap the target of a whole-step bend from string 3 fret 7.',
        find: { note: 'E4' },
        mode: 'one',
        octave: 'exact',
        strings: [3],
        frets: [5, 12],
        explain: 'A whole step is two frets: string 3 fret 9, {n:E}.',
      },
    },
    {
      type: 'choice',
      prompt: 'You will bend string 2 fret 8 ({n:G}) a whole step. Which fret do you play first, as the target?',
      options: [
        { text: 'Fret 10', correct: true },
        { text: 'Fret 9', why: 'Fret 9 is a half step: the target of a half-step bend.' },
        { text: 'Fret 12', why: 'Four frets would be a two-step bend.' },
      ],
      explain: 'A whole step is two frets: string 2 fret 10, {n:A}.',
      fact: 'lead-bend-target',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap the target of a half-step bend from string 2 fret 8.',
      find: { note: 'G#4' },
      mode: 'one',
      octave: 'exact',
      strings: [2],
      frets: [5, 12],
      explain: 'A half step is one fret: string 2 fret 9, {n:G#}.',
    },
    techniqueTask({
      id: 'whole-step-bend',
      title: 'Whole-Step Bend in Tune',
      exercise: 'tech-bend-whole-step',
      minutes: 3,
      body: 'Target first, string 3 fret 9 ({n:E}), then bend fret 7 up to it; the microphone checks the held pitch is within 10 cents. No microphone: alternate target and bend until they sound the same.',
      tip: 'Acoustic with a wound string 3? Bend half steps there instead. Short sets: bends load the fingertips.',
    }),
    techniqueTask({
      id: 'half-step-bend',
      title: 'Half-Step Bend in Tune',
      exercise: 'tech-bend-half-step',
      minutes: 2,
      body: 'Target string 2 fret 9 ({n:G#}), then bend fret 8 ({n:G}) up to it and hold two beats. A half step is a small push: stop the moment it matches.',
    }),
    {
      type: 'listen-choice',
      prompt: 'The target, then a bend. In tune, or flat?',
      sound: { kind: 'notes', notes: ['E4', 'D#4'], tempo: 60 },
      options: [{ text: 'In tune' }, { text: 'Flat: bend further', correct: true }],
      shuffle: false,
      explain: 'The bend stopped below the target. Most bends fall short: push a little further than feels natural.',
      fact: 'lead-bend-flat',
    },
    techniqueTask({
      id: 'picking-hand-mute',
      title: 'Picking-Hand Muting',
      exercise: 'tech-picking-hand-mute',
      minutes: 2,
      body: 'Rest the side of your picking palm on the strings below the one you play, so they stay silent while you bend. Stop picking and listen: silence, not a hum.',
    }),
    {
      type: 'choice',
      prompt: 'The low strings ring while you bend on string 3. What helps?',
      options: [
        { text: 'Rest the picking palm on the low strings', correct: true },
        { text: 'Bend more slowly', why: 'Speed is not the problem: the strings you are not playing are left free.' },
        { text: 'Pick harder', why: 'That makes the other strings ring more.' },
      ],
      explain: 'The side of the picking palm keeps the strings below silent, and the underside of finger 1 can touch the strings above.',
    },
    playerTask({
      id: 'lick-bends',
      title: 'Lick: Bends in Tune',
      song: 'st-lick-bend',
      tempo: 83,
      minutes: 4,
      body: 'Play it at about 60 BPM, then at 100 % (72 BPM). Every bend is set up by its target: play the target, bend to it, hear it again.',
    }),
    {
      type: 'true-false',
      statement: 'Most bends fall short of the target, so push a little further than feels natural.',
      answer: true,
      explain: 'A bend that stops short sounds sour and flat. Play the target, bend, and check again: the microphone in Technique shows how close you got.',
      fact: 'lead-bend-flat',
    },
  ],
  facts: [
    { id: 'lead-bend-how', front: 'How do you bend a string?', back: 'Ring finger with the middle and index behind it, pushing together, and the wrist turning as if turning a door handle.' },
    { id: 'lead-bend-target', front: 'Before you bend, what do you play?', back: 'The target: the note two frets up for a whole step, one fret up for a half step. Then bend until you match it.' },
    { id: 'lead-bend-flat', front: 'The most common bending mistake?', back: 'Falling short, so the bend is flat. Push a little further than feels natural.' },
  ],
};

// ── 4. Vibrato ──────────────────────────────────────────────────────────────────────────────────

const vibrato: TeacherLesson = {
  id: 'vibrato',
  title: 'Vibrato',
  teaches: 'Bending vibrato goes up from the note and back, never below, evenly and in time with the beat.',
  minutes: 4,
  skill: 'teacher:dev:vibrato',
  steps: [
    {
      type: 'card',
      title: 'Make it sing',
      body: '{t:vibrato} is a small bend and release, repeated, and it makes a held note sing. This bending vibrato, the usual kind on electric and steel-string guitar, goes up from the note and back, never below it. Tonight: the long notes of Lick: Vibrato.',
      figure: {
        kind: 'tab',
        tempo: 60,
        notes: [
          { string: 1, fret: 5, duration: 'h' },
          { string: 2, fret: 8, duration: 'h' },
          { string: 3, fret: 7, duration: 'w' },
        ],
        caption: '{n:A}, {n:G} and {n:D}: the notes that get the vibrato.',
      },
    },
    {
      type: 'true-false',
      statement: 'Bending vibrato dips below the note as well as rising above it.',
      answer: false,
      explain: 'It only bends up from the note and comes back to it. Below the note would mean pulling the string the wrong way.',
      fact: 'lead-vibrato-up',
    },
    {
      type: 'card',
      title: 'Even, and in time',
      body: 'A good vibrato is even and in time: two waves per beat, then three, then four. Start it a moment after the note, and keep it going until the note ends.',
      figure: { kind: 'rhythm', pattern: 'e e e e e e e e', tempo: 60, caption: 'Two waves per beat: one push on every eighth note.' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap two waves per beat with the click.',
      rhythm: { pattern: 'e e e e e e e e' },
      tempo: 60,
      show: 'both',
      explain: 'Two even pushes per click: "one-and, two-and". Your vibrato should sit on exactly this grid.',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Now three waves per beat.',
      rhythm: { pattern: 'et et et et et et et et et et et et' },
      tempo: 60,
      show: 'both',
      explain: 'Three even pushes per click, triplets. Faster vibrato, same evenness.',
    },
    {
      type: 'choice',
      prompt: 'When does the vibrato start?',
      options: [
        { text: 'A moment after the note', correct: true },
        { text: 'Before you pick', why: 'Then the note starts out of tune. Let it sound plain first.' },
        { text: 'Only in the last beat', why: 'Start it a moment after the note and keep it going to the end.' },
      ],
      explain: 'Let the note speak, then add the vibrato and keep it going until the note ends.',
      fact: 'lead-vibrato-start',
    },
    techniqueTask({
      id: 'vibrato-in-time',
      title: 'Bending Vibrato in Time',
      exercise: 'tech-vibrato-bend',
      minutes: 5,
      body: 'String 2 fret 8 ({n:G}), finger 3: two waves per beat at 60 BPM, then three, then four. The microphone checks the speed against the click, the evenness, and that the waves rise from {n:G}, never below.',
      tip: 'Narrow and slow first: a quarter tone wide. Widen it only when it stays even.',
    }),
    {
      type: 'play-note',
      prompt: 'Pick {n:A} on string 1 fret 5 and hold it four beats. Add the vibrato a moment after it starts.',
      note: 'A4',
      octave: 'exact',
      where: { string: 1, fret: 5 },
      explain: 'The microphone heard {n:A} start in tune. On string 1, pull the string toward the floor for each wave: it still goes up, never below.',
      alternative: {
        type: 'choice',
        prompt: 'No microphone? Record it on your phone and compare it with the Technique example. What should match?',
        options: [
          { text: 'Even waves, in time, never below the note', correct: true },
          { text: 'As wide and fast as possible', why: 'Wide and fast is hard to keep even. Even and in time comes first.' },
          { text: 'Vibrato from the very first moment', why: 'Let the note start plain, then add the vibrato.' },
        ],
        explain: 'Listen for even waves locked to the beat, rising from the note and coming back to it.',
      },
    },
    playerTask({
      id: 'lick-vibrato',
      title: 'Lick: Vibrato',
      song: 'st-lick-vibrato',
      minutes: 4,
      body: 'The slow {n:A} minor blues at 60 BPM: short runs lead to long notes held two beats with vibrato, two waves per beat in bars 1 and 2, three in bars 3 and 4, four from bar 5.',
    }),
    {
      type: 'choice',
      prompt: 'Your vibrato sounds seasick. What is the likely cause?',
      options: [
        { text: 'Uneven waves, out of time', correct: true },
        { text: 'Too much in tune', why: 'Vibrato rises from an in-tune note: that part is right.' },
        { text: 'It starts after the note', why: 'Starting a moment after the note is exactly right.' },
      ],
      explain: 'A wobble that speeds up and slows down sounds seasick. Lock the waves to the beat and keep them the same width.',
    },
  ],
  facts: [
    { id: 'lead-vibrato-up', front: 'Bending vibrato: which way does the pitch go?', back: 'Up from the note and back to it, never below.' },
    { id: 'lead-vibrato-start', front: 'When does vibrato start, and how fast is it?', back: 'A moment after the note, then until it ends: even and in time, two, three or four waves per beat.' },
  ],
};

// ── 5. Unison bends and pre-bends ───────────────────────────────────────────────────────────────

const bendTricks: TeacherLesson = {
  id: 'bend-tricks',
  title: 'Unison bends and pre-bends',
  teaches: 'In a unison bend the beating stops when the bent note matches; a pre-bend is bent silently, then released.',
  minutes: 4,
  skill: 'teacher:dev:bend-tricks',
  steps: [
    {
      type: 'card',
      title: 'Two strings, one note',
      body: 'A {t:unison-bend} plays two strings at once: string 2 fret 5 ({n:E}) held still, and string 3 fret 7 ({n:D}) bent up until it matches. As they get close you hear a wobble, the beating; when they meet it stops and the sound blooms. It needs the bending accuracy you built two lessons ago.',
      figure: {
        kind: 'fretboard',
        frets: [3, 9],
        labels: 'finger',
        dots: [
          { string: 2, fret: 5, note: 'E', finger: 1 },
          { string: 3, fret: 7, note: 'D', finger: 3 },
        ],
        caption: 'Finger 1 holds {n:E}; finger 3 bends {n:D} up to meet it.',
      },
    },
    {
      type: 'choice',
      prompt: 'In this unison bend, which string bends?',
      options: [
        { text: 'String 3, up to the {n:E} on string 2', correct: true },
        { text: 'String 2, down to the {n:D}', why: 'Bends only raise the pitch. The {n:E} stays still.' },
        { text: 'Both strings together', why: 'Only string 3 moves; finger 1 keeps string 2 still and firm.' },
      ],
      explain: '{n:D} on string 3 is a whole step below the {n:E} on string 2. Bend string 3 up a whole step and the two become one note.',
      fact: 'lead-unison-bend',
    },
    {
      type: 'listen-choice',
      prompt: 'Two notes together. Matched, or still beating?',
      sound: { kind: 'notes', notes: ['D#4', 'E4'], together: true },
      options: [{ text: 'Matched: one clear note' }, { text: 'Not yet: they still beat', correct: true }],
      shuffle: false,
      explain: 'The bent note is still a half step short, so the two rub against each other. Keep pushing until the rubbing stops.',
    },
    {
      type: 'card',
      title: 'The pre-bend: a sigh',
      body: 'A {t:pre-bend} is bent silently before you pick it: string 3 fret 7 pushed up to {n:E} with no sound. Then pick, and release it slowly back down to {n:D} over one beat, like a sigh. Check the start against fret 9 now and then.',
      figure: {
        kind: 'tab',
        tempo: 60,
        notes: [
          { string: 3, fret: 9, duration: 'q' },
          { string: 3, fret: 7, duration: 'h.' },
        ],
        caption: 'The check note at fret 9, then fret 7: pre-bent to {n:E}, picked, released to {n:D}.',
      },
    },
    {
      type: 'order',
      prompt: 'Put the pre-bend in order.',
      tiles: ['Bend it silently', 'Pick the string', 'Release slowly', 'Land on {n:D}'],
      explain: 'Bend first, without a sound; then pick, so the note starts on {n:E}; then let it fall to {n:D} over one beat.',
      fact: 'lead-pre-bend',
    },
    {
      type: 'fretboard-find',
      prompt: 'A pre-bend from string 3 fret 7 starts on {n:E}. Tap the fret that checks it.',
      find: { note: 'E4' },
      mode: 'one',
      octave: 'exact',
      strings: [3],
      frets: [5, 12],
      explain: 'String 3 fret 9 is {n:E}: the pitch a whole-step bend from fret 7 reaches.',
    },
    techniqueTask({
      id: 'unison-bend',
      title: 'Unison Bend',
      exercise: 'tech-unison-bend',
      minutes: 3,
      body: 'Bend until the beating stops. For the microphone check play the bend alone, string 2 muted: it follows one note at a time. No microphone: listen for the wobble to slow down and disappear.',
    }),
    techniqueTask({
      id: 'pre-bend',
      title: 'Pre-Bend and Release',
      exercise: 'tech-prebend-release',
      minutes: 3,
      body: 'The microphone checks the start ({n:E}) and the end ({n:D}). No microphone: compare the start with string 3 fret 9 by ear. Short sets: a pre-bend holds the full bend before the note even starts.',
    }),
    {
      type: 'play-note',
      prompt: 'Pre-bend string 3 fret 7 up to {n:E} without a sound, then pick it.',
      note: 'E4',
      octave: 'exact',
      explain: 'The note started on {n:E}: your pre-bend was in tune. Now release it slowly to {n:D}.',
      alternative: {
        type: 'listen-choice',
        prompt: 'The check note {n:E}, then the start of a pre-bend. Did it start in tune?',
        sound: { kind: 'notes', notes: ['E4', 'D#4'], tempo: 60 },
        options: [{ text: 'Yes, on {n:E}' }, { text: 'No, too low: bend further first', correct: true }],
        shuffle: false,
        explain: 'The pre-bend started below {n:E}. Silently push a little further before you pick.',
      },
    },
    toolTask({
      id: 'jam-minor-blues',
      title: 'Jam: the minor blues in A',
      tool: 'progressions',
      params: ['blues-minor', 'a', 'jam'],
      minutes: 3,
      body: 'Set the band to 80 BPM and play box 1 over the {n:A} minor blues. One unison bend and one pre-bend in every chorus, no more: make each one count.',
    }),
    {
      type: 'true-false',
      statement: 'In a pre-bend you pick the note first, then bend it.',
      answer: false,
      explain: 'Bend first, silently, then pick: the note starts already on {n:E} and falls to {n:D}.',
      fact: 'lead-pre-bend',
    },
  ],
  facts: [
    { id: 'lead-unison-bend', front: 'How do you know a unison bend is in tune?', back: 'The beating (the wobble between the two strings) stops, and the two notes bloom into one.' },
    { id: 'lead-pre-bend', front: 'What is a pre-bend?', back: 'A bend made silently before picking; the note is then released slowly back down, like a sigh.' },
  ],
};

// ── 6. Phrase like a singer ─────────────────────────────────────────────────────────────────────

/** Dev's phrase 1, slide in: D slides into E on string 2, then A, G, E and a long C. */
const PHRASE_SLIDE: TabNote[] = [
  { string: 2, fret: 3, duration: 'e' },
  { string: 2, fret: 5, duration: 'q.' },
  { string: 1, fret: 5, duration: 'e' },
  { string: 2, fret: 8, duration: 'e' },
  { string: 2, fret: 5, duration: 'q' },
  { string: 3, fret: 5, duration: 'h' },
  { rest: true, duration: 'h' },
];

/** Dev's phrase 2, hammer and pull: C-D-C on string 3, then down to A. */
const PHRASE_LEGATO: TabNote[] = [
  { string: 3, fret: 5, duration: 'e' },
  { string: 3, fret: 7, duration: 'e' },
  { string: 3, fret: 5, duration: 'e' },
  { string: 4, fret: 7, duration: 'q' },
  { string: 4, fret: 5, duration: 'e' },
  { string: 4, fret: 7, duration: 'q' },
  { string: 3, fret: 7, duration: 'q' },
  { string: 3, fret: 5, duration: 'q' },
  { string: 4, fret: 7, duration: 'h' },
];

/** Dev's phrase 3, bend and vibrato: G, E, then D bent up to E; down to a long A with vibrato. */
const PHRASE_BEND: TabNote[] = [
  { string: 2, fret: 8, duration: 'q' },
  { string: 2, fret: 5, duration: 'q' },
  { string: 3, fret: 7, duration: 'h' },
  { string: 2, fret: 5, duration: 'e' },
  { string: 3, fret: 7, duration: 'e' },
  { string: 3, fret: 5, duration: 'q' },
  { string: 4, fret: 7, duration: 'h' },
];

const phraseLikeASinger: TeacherLesson = {
  id: 'phrase-like-a-singer',
  title: 'Phrase like a singer',
  teaches: 'A phrase sounds like a voice when it slides, bends, holds and breathes: one technique per phrase at first.',
  minutes: 5,
  skill: 'teacher:dev:phrase-like-a-singer',
  steps: [
    {
      type: 'card',
      title: 'Sing it first',
      body: 'Listen to a good singer: they rarely go note, note, note. They slide into notes, bend them, hold them with vibrato and leave space to breathe. So play a {t:phrase} you could sing, one technique per phrase at first. A few notes with meaning beat many notes played fast.',
      tip: 'Away from the guitar, sing a short phrase over a backing track. Then find it in box 1.',
    },
    {
      type: 'choice',
      prompt: 'What makes a guitar phrase sound like a voice?',
      options: [
        { text: 'Slides, bends, held notes and space', correct: true },
        { text: 'As many notes as possible', why: 'A singer breathes. A few notes with meaning beat a flood of them.' },
        { text: 'Every note the same length', why: 'Voices hold some notes and rush others. Vary it.' },
      ],
      explain: 'Singers slide into notes, bend them, hold them with vibrato and leave space. Your phrases do the same.',
      fact: 'lead-phrase-voice',
    },
    {
      type: 'card',
      title: 'Phrase 1: slide in',
      body: 'Box 1 at 70 BPM. Pick string 2 fret 3 and slide straight up into {n:E} at fret 5, then {n:A}, {n:G}, {n:E} and a long {n:C}. The slide is the first two notes.',
      figure: { kind: 'tab', tempo: 70, notes: [...PHRASE_SLIDE], caption: 'Slide fret 3 to 5 on string 2, then let the phrase fall.' },
    },
    {
      type: 'play-phrase',
      prompt: 'Phrase 1: slide into {n:E}, then {n:A} {n:G} {n:E} and a long {n:C}.',
      notes: [...PHRASE_SLIDE],
      octave: 'exact',
      tempo: 70,
      explain: '{n:D} sliding into {n:E}, then {n:A}, {n:G}, {n:E}, {n:C}. It stops on {n:C}, like a question: it asks for an answer.',
      alternative: {
        type: 'order',
        prompt: 'Put the notes of phrase 1 in order.',
        tiles: ['{n:D}', '{n:E}', '{n:A}', '{n:G}', '{n:E}', '{n:C}'],
        explain: 'The slide from {n:D} into {n:E}, up to {n:A}, then down {n:G}, {n:E} to a long {n:C}.',
      },
    },
    {
      type: 'card',
      title: 'Phrase 2: hammer and pull',
      body: 'Pick {n:C} on string 3, hammer {n:D}, pull back to {n:C}, then {n:A}, {n:G}, {n:A} on string 4, and a slower {n:D}, {n:C}, {n:A} to finish. This one comes home.',
      figure: { kind: 'tab', tempo: 70, notes: [...PHRASE_LEGATO], caption: 'The first three notes take one pick.' },
    },
    {
      type: 'play-phrase',
      prompt: 'Phrase 2: {n:C}, hammer {n:D}, pull to {n:C}, then down to {n:A}.',
      notes: [...PHRASE_LEGATO],
      octave: 'exact',
      tempo: 70,
      explain: 'Ending on {n:A}, the root, sounds like an answer. Phrase 1 asks, phrase 2 answers: that is call and response.',
      alternative: {
        type: 'order',
        prompt: 'Put the first six notes of phrase 2 in order.',
        tiles: ['{n:C}', '{n:D}', '{n:C}', '{n:A}', '{n:G}', '{n:A}'],
        explain: '{n:C}, the hammered {n:D}, the pulled {n:C}, then {n:A}, {n:G}, {n:A} on string 4.',
      },
    },
    {
      type: 'card',
      title: 'Phrase 3: bend and sing',
      body: '{n:G}, {n:E}, then string 3 fret 7 bent up a whole step to {n:E} and held. Then {n:E}, {n:D}, {n:C} and a long {n:A} on string 4 with vibrato. The tab shows fret 7: the bend is yours.',
      figure: { kind: 'tab', tempo: 70, notes: [...PHRASE_BEND], caption: 'Bend the half note at fret 7; vibrato on the last {n:A}.' },
    },
    {
      type: 'play-phrase',
      prompt: 'Phrase 3: {n:G}, {n:E}, bend fret 7 up to {n:E}, then down to a long {n:A} with vibrato.',
      notes: [...PHRASE_BEND],
      octave: 'exact',
      tempo: 70,
      explain: 'The microphone heard the {n:D} you bent from and the line down to {n:A}. The bend and the vibrato are what make it sing.',
      alternative: {
        type: 'order',
        prompt: 'Put phrase 3 in order, as fretted.',
        tiles: ['{n:G}', '{n:E}', '{n:D}', '{n:E}', '{n:D}', '{n:C}', '{n:A}'],
        explain: '{n:G}, {n:E}, the {n:D} you bend, then {n:E}, {n:D}, {n:C} and the long {n:A}.',
      },
    },
    playerTask({
      id: 'box-1-lick',
      title: 'Ask and answer: the box 1 lick',
      song: 'st-pent-box-1',
      tempo: 83,
      minutes: 4,
      body: 'At about 70 BPM: four phrases in call and response, all in box 1. Phrases 1 and 3 ask, 2 and 4 answer. Add a slide into one note, then a bend, then vibrato on the long notes.',
    }),
    toolTask({
      id: 'jam-call-and-response',
      title: 'Jam: call and response with yourself',
      tool: 'progressions',
      params: ['minor-i-bvi-bvii', 'a', 'jam'],
      minutes: 6,
      body: 'Set 92 BPM: {c:Am}, {c:F}, {c:G}, {c:Am}. Ask a phrase, then answer it, one technique per phrase. Record two minutes on your phone, pick your best phrase and learn it properly.',
      tip: 'Leave space. Two bars of playing, two bars of listening.',
    }),
    {
      type: 'true-false',
      statement: 'A few notes played with meaning beat many notes played fast.',
      answer: true,
      explain: 'Listeners hum phrases, not speed. A slide in, a bend held in tune, a little space: that is what they remember.',
      fact: 'lead-phrase-voice',
    },
  ],
  facts: [
    { id: 'lead-phrase-voice', front: 'How do you make a guitar phrase sound like a voice?', back: 'Slide into notes, bend them, hold them with vibrato and leave space to breathe: one technique per phrase at first.' },
    { id: 'lead-ask-answer', front: 'A phrase that asks and one that answers: how do they end?', back: 'An asking phrase stops away from home (on {n:C} or {n:E} in {n:A} minor); an answer comes home to the root, {n:A}.' },
  ],
};

/** Unit 3 of Dev's course. */
const unit: TeacherUnit = {
  id: 'dev-lead-techniques',
  title: 'Lead guitar: the techniques',
  theme: 'technique',
  description: 'Hammer-ons, pull-offs, slides, bends and vibrato, in tune and in time, combined into phrases that sing.',
  lessons: [legato, slides, bendsInTune, vibrato, bendTricks, phraseLikeASinger],
  checkpoint: { sample: 8, maxMistakes: 2 },
  glossary: [
    { id: 'legato', term: 'legato', definition: 'Smooth: notes joined without a new pick stroke, by hammer-ons, pull-offs and slides.' },
    { id: 'hammer-on', term: 'hammer-on', definition: 'Sounding a higher note on the same string by bringing a fretting finger down hard, without picking.' },
    { id: 'pull-off', term: 'pull-off', definition: 'Sounding a lower note on the same string by flicking a fretting finger off it, so it plucks the string.' },
    { id: 'trill', term: 'trill', definition: 'Fast hammer-ons and pull-offs between two notes, over and over.' },
    { id: 'slide', term: 'slide', definition: 'Moving a pressed fretting finger along the string, so the pitch glides to a new fret.' },
    { id: 'bend', term: 'bend', definition: 'Pushing a string across the fretboard to raise its pitch, usually by a half step or a whole step.' },
    { id: 'vibrato', term: 'vibrato', definition: 'A small, repeated bend and release on a held note that makes it sing.' },
    { id: 'pre-bend', term: 'pre-bend', definition: 'A bend made silently before picking; the note is then released back down.' },
    { id: 'unison-bend', term: 'unison bend', definition: 'Two strings played together, one bent up until it matches the other.' },
    { id: 'pentatonic-box', term: 'pentatonic box', definition: 'A shape of the pentatonic scale with two notes per string in one hand position. Box 1 of A minor sits at frets 5 to 8.' },
    { id: 'phrase', term: 'phrase', definition: 'A short musical sentence: a few notes that belong together, then a breath.' },
  ],
};

export default unit;
