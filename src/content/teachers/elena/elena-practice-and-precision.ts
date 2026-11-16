/**
 * Prof. Varga, unit 1: Practice and precision (plan: `elena/elena-practice-and-precision` in
 * src/content/plan/teachers.json).
 *
 * Elena's voice: conservatory rigour, dry humour, high standards, deep respect for the student. The
 * learner arrives from Dev's course (or plays at that level): barre chords anywhere, the five
 * pentatonic boxes, C major in five CAGED positions, a little reading.
 *
 * Every lesson follows its plan entry: the `explain` on Elena's cards, the `show` as figures, the
 * `practice` as in-lesson exercises (microphone steps always with a tapping alternative) or as tasks
 * that send the learner to the Metronome, Chords, the Player, Progressions, Technique, Rhythm,
 * Scales and the Practice Plan, and back. The plan's "Record" steps have no screen in the app: the
 * cards ask for a phone recording, and the Technique screen's microphone take where it has one.
 *
 * Music from the song library: CAGED: The Major Scale in Five Positions (`st-caged-scale`), Travis
 * Picking (`st-travis-picking`, 80 BPM), Reading: Second Position (`st-read-second-position`, 76 BPM,
 * bars 9 to 16 at 79 %: 60 BPM). `elena-practice-and-precision.test.ts` cross-checks every shape,
 * position, note and tempo against the engines and the library.
 */
import { scalePatterns, type ScalePattern } from '@/core/guitar';
import type { FretDot, TabNote } from '@/lessons';
import type { TeacherLesson, TeacherUnit } from '../types';
import { playerTask, techniqueTask, toolTask } from '../tasks';

/** G major, three notes per string, pattern 1 (frets 3 to 8), from the guitar engine. */
export const G_3NPS_1: ScalePattern = (() => {
  const p = scalePatterns('G', 'major', { system: '3nps' }).find((x) => x.id === '3nps-1');
  if (!p) throw new Error('G major 3nps pattern 1 is missing');
  return p;
})();

/** The pattern as figure dots, every note claimed, the roots marked. */
function patternDots(p: ScalePattern): FretDot[] {
  return p.notes.map((n) => (n.isRoot ? { string: n.string, fret: n.fret, note: n.note, role: 'root' as const } : { string: n.string, fret: n.fret, note: n.note }));
}

/** One tab note. */
function t(string: number, fret: number, duration: string): TabNote {
  return { string, fret, duration };
}

// ── 1. The audition ─────────────────────────────────────────────────────────────────────────────

const audition: TeacherLesson = {
  id: 'elena-audition',
  title: 'The audition',
  teaches: 'Five items measured in numbers (tempos, clean out of ten, changes a minute) become goals with dates.',
  minutes: 5,
  skill: 'teacher:elena:elena-audition',
  steps: [
    {
      type: 'card',
      title: 'I listen before I teach',
      body: 'Play me five things: C major through its five positions; any major, minor or seventh chord in two places; a Travis pattern; eight bars read at sight; one chorus of improvisation across the pentatonic boxes. Then we write down numbers, not adjectives: tempos, clean notes out of ten, clean changes per minute.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each thing I measure with the number I write down for it.',
      pairs: [
        { left: 'Five C major positions', right: 'Top clean tempo' },
        { left: 'Six chords, two places', right: 'Clean shapes out of 12' },
        { left: '{c:F} to {c:Bb} changes', right: 'Clean changes a minute' },
        { left: 'Travis pattern', right: 'Tempo with a steady thumb' },
        { left: 'Eight bars at sight', right: 'Clean bars out of 8' },
        { left: 'A chorus of improvising', right: 'Boxes reached, out of 5' },
      ],
      explain: 'Every measure ends in a number: a tempo, clean shapes, clean changes, clean bars, boxes reached. "Quite good" cannot be improved on; 96 BPM can.',
      fact: 'audition-numbers',
    },
    toolTask({
      id: 'audition-scale',
      title: 'Item 1: C major, five positions',
      tool: 'metronome',
      minutes: 5,
      body: 'C major through all five positions in eighth notes. Then the E-shape position (frets 7 to 10) and the A-shape position (frets 2 to 6) alone: find the fastest tempo you play cleanly three times running, and write it down.',
    }),
    {
      type: 'card',
      title: 'Item 2: six chords, two places',
      body: '{c:G}: 320003 and 355433. {c:C}: x32010 and x35553. {c:Am}: x02210 and 577555. {c:Bm}: x24432 and 799777. {c:D7}: xx0212 and x57575. {c:E7}: 020100 and x79797. Strum each, then pick it string by string. A shape counts when every string rings: the score is out of 12.',
    },
    {
      type: 'play-chord',
      prompt: 'I name {c:C}. Play it in its second place: the A-shape barre at fret 3.',
      chord: 'C',
      frets: 'x35553',
      explain: '{c:C} is {n:C}, {n:E} and {n:G}. Barre fret 3 from string 5; strings 4, 3 and 2 at fret 5. String 6 stays silent.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'C',
        frets: 'x35553',
        accept: 'this-shape',
        prompt: 'Build {c:C} as the A-shape barre at fret 3.',
        explain: 'Barre fret 3 from string 5 ({n:C}), then fret 5 on strings 4, 3 and 2: {n:G}, {n:C}, {n:E}.',
      },
    },
    toolTask({
      id: 'audition-changes',
      title: 'One minute: F to B flat',
      tool: 'chords',
      params: ['trainer', 'f-major', 'b-flat-major'],
      minutes: 2,
      body: 'One minute of {c:F} (133211) to {c:Bb} (x13331), one strum per beat. Count only clean changes: every string of the new chord sounding on its beat. Write the number down.',
    }),
    {
      type: 'play-chord',
      prompt: 'And {c:E7}, away from the open strings: x79797.',
      chord: 'E7',
      frets: 'x79797',
      explain: '{c:E7} is {n:E}, {n:G#}, {n:B} and {n:D}: the A-shape seventh at fret 7. The seventh, {n:D}, is string 3 under the barre.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'E7',
        frets: 'x79797',
        accept: 'this-shape',
        prompt: 'Build {c:E7} as the A-shape seventh at fret 7.',
        explain: 'Barre fret 7 from string 5 ({n:E}); fret 9 on strings 4 ({n:B}) and 2 ({n:G#}); strings 3 and 1 under the barre give {n:D} and {n:B}.',
      },
    },
    playerTask({
      id: 'audition-travis',
      title: 'Item 3: a Travis pattern',
      song: 'st-travis-picking',
      bars: [1, 8],
      minutes: 4,
      body: 'Eight bars of Travis Picking over {c:C}, {c:Am} and {c:G7}, from 80 BPM. Find the fastest tempo at which the thumb stays steady for all eight bars: lower the speed if it wavers, raise it if it holds. Write it down, and record it on your phone if you can.',
      tip: 'The thumb is the clock. If it hesitates for a melody note, the tempo is too high.',
    }),
    playerTask({
      id: 'audition-reading',
      title: 'Item 4: eight bars at sight',
      song: 'st-read-second-position',
      bars: [9, 16],
      tempo: 79,
      minutes: 4,
      body: 'Bars 9 to 16 of Reading: Second Position, which Dev left unplayed. About 60 BPM, once, without stopping. Set the score to Tab and notes and cover the tab: read the staff. Count the clean bars out of eight.',
      tip: 'Study the key signature and the first bar before you press play. That is allowed; a second attempt is not.',
    }),
    {
      type: 'staff-read',
      prompt: 'Bar 12 ends on this note, a half note. Name it, key signature included.',
      note: 'F#3',
      key: 'F# minor',
      options: ['F#', 'F', 'G', 'E'],
      explain: 'The first space is {n:F}, and the key signature of {k:F# minor} sharpens every {n:F}: {n:F#}, string 4 fret 4 in second position.',
    },
    toolTask({
      id: 'audition-jam',
      title: 'Item 5: one chorus across the boxes',
      tool: 'progressions',
      params: ['blues-12-bar', 'a', 'jam'],
      minutes: 4,
      body: 'The 12-bar blues in A, the band set to 92 BPM. One chorus through at least three of the five pentatonic boxes, sliding between them; write down how many you reached. Record it: I want to hear where you go, and where you hesitate.',
    }),
    toolTask({
      id: 'audition-goals',
      title: 'Three goals, with numbers and dates',
      tool: 'practice',
      params: ['goals'],
      minutes: 3,
      body: 'Write three goals from tonight\'s numbers, each with a number and a date: "the E-shape position of C major at 104 BPM by 1 March", not "faster scales". About ten per cent above tonight, a month away.',
    }),
    {
      type: 'choice',
      prompt: 'Which of these is a goal I would accept?',
      options: [
        { text: '{c:F} to {c:Bb}: 40 clean a minute by 1 May', correct: true },
        { text: 'Get better at barre chords', why: 'No number and no date: you will never know when you have arrived.' },
        { text: 'Practise every day', why: 'A habit, not a goal. It names no result.' },
        { text: 'Play the reading study perfectly', why: '"Perfectly" is an adjective, and there is no date.' },
      ],
      explain: 'A goal has a number and a date. Forty clean changes a minute by the first of May can be checked; "better" cannot.',
      fact: 'goal-number-date',
    },
  ],
  facts: [
    { id: 'audition-numbers', front: 'What does Elena write down after an audition?', back: 'Numbers, not adjectives: tempos, clean notes out of ten, clean changes per minute.' },
    { id: 'goal-number-date', front: 'What must a practice goal contain?', back: 'A number and a date, for example {c:F} to {c:Bb}, 40 clean changes a minute by 1 May.' },
  ],
};

// ── 2. Deliberate practice ──────────────────────────────────────────────────────────────────────

const deliberatePractice: TeacherLesson = {
  id: 'deliberate-practice',
  title: 'Deliberate practice',
  teaches: 'One target, at the tempo it is right nine times in ten, raised in small steps only while it stays right.',
  minutes: 4,
  skill: 'teacher:elena:deliberate-practice',
  steps: [
    {
      type: 'card',
      title: 'Repetition is not practice',
      body: 'Repetition is not practice; repetition of the right thing, attended to, is. Choose one target per block. Find the tempo at which it is correct nine times out of ten. Raise it in small steps only when it stays correct.',
      tip: 'If you cannot say what you are practising in one sentence, you are not practising it.',
    },
    {
      type: 'choice',
      prompt: 'A passage is correct 6 times in 10 at 96 BPM. What now?',
      options: [
        { text: 'Lower the tempo until it is 9 in 10', correct: true },
        { text: 'Keep going at 96 until it improves', why: 'Four wrong passes in ten is rehearsing the mistake almost half the time.' },
        { text: 'Go faster to push through it', why: 'Speed magnifies an error; it never cures one.' },
        { text: 'Switch to a different passage', why: 'Changing topic is fine later, but this one is not yet right at any tempo.' },
      ],
      explain: 'Find the tempo at which it is correct nine times out of ten, and climb from there. Six in ten means the hands are still choosing between two versions.',
      fact: 'nine-in-ten',
    },
    {
      type: 'card',
      title: 'The ladder',
      body: 'On the Technique screen a passage climbs from 60 toward 120 BPM in 4 BPM steps. A clean pass earns the next rung; two passes in a row that are not clean send you back one. The screen is generous: I would stay on a rung until it is clean nine times in ten. It looks slow on paper. It is the fastest route I know.',
    },
    {
      type: 'type-answer',
      prompt: 'On a 4 BPM ladder, two passes in a row at 96 BPM are not clean. At what tempo does the ladder put you?',
      answer: { kind: 'number', value: 92 },
      input: 'keypad',
      explain: 'One rung back: 96 minus 4 is 92 BPM. A single untidy pass keeps you where you are; the second sends you down. From 92 you climb again, one clean pass per rung.',
      fact: 'ladder-step-back',
    },
    techniqueTask({
      id: 'climb-ladder',
      title: 'Ten minutes on one ladder',
      exercise: 'tech-string-crossing',
      minutes: 10,
      body: 'String Crossing Both Ways, and nothing else, for ten minutes. Start at the tempo where it is clean nine times in ten and let the ladder move you: up a rung after a clean pass, back one after two that are not. Log your top clean tempo.',
      tip: 'Ten minutes on one thing feels long. That feeling is called attention.',
    }),
    {
      type: 'card',
      title: 'Space it, mix it',
      body: 'Spacing practice across days and mixing topics within a session generally beats long blocks of one thing, even though the blocks feel more productive at the time. The feeling of progress and progress are not the same thing.',
    },
    {
      type: 'true-false',
      statement: 'An hour on one exercise usually builds more lasting skill than the same hour spread over days and mixed with other topics.',
      answer: false,
      explain: 'Spaced, mixed practice generally wins, even though a long block feels more productive while you are in it.',
      fact: 'spaced-mixed-practice',
    },
    toolTask({
      id: 'interleaved-plan',
      title: 'Rebuild your routine in blocks',
      tool: 'practice',
      minutes: 4,
      body: 'Rebuild your routine as interleaved blocks of 8 to 12 minutes: technique, repertoire, reading, improvising, each its own block, in a different order on different days. Save it.',
    }),
    {
      type: 'choice',
      prompt: 'Which 40-minute session is interleaved?',
      options: [
        { text: 'Four 10-minute blocks on four topics', correct: true },
        { text: 'Forty minutes on one passage', why: 'One long block: it feels productive and fades fastest.' },
        { text: 'Twenty minutes of scales, twice', why: 'Two blocks of the same thing are still one topic.' },
      ],
      explain: 'Interleaving mixes topics within a session: blocks of 8 to 12 minutes on different things, in varying order.',
      fact: 'spaced-mixed-practice',
    },
    {
      type: 'card',
      title: 'Record the start and the end',
      body: 'A recording made at the start and at the end of a session tells you more than how it felt. Record the passage both times, on your phone. Listen once for time, once for tone and once for phrasing, and write one sentence for each.',
    },
    {
      type: 'match-pairs',
      prompt: 'Three listens to one recording. Match each with what it listens for.',
      pairs: [
        { left: 'First listen', right: 'Time: early or late?' },
        { left: 'Second listen', right: 'Tone: clean, even, full?' },
        { left: 'Third listen', right: 'Phrasing: where it breathes' },
      ],
      explain: 'One question per listen. Ask all three at once and you will hear none of them properly.',
    },
    {
      type: 'choice',
      prompt: 'Which of these is deliberate practice?',
      options: [
        { text: 'One passage, a clean tempo, small steps up', correct: true },
        { text: 'Playing your favourite pieces through', why: 'Enjoyable and worthwhile, but there is no single target and no feedback.' },
        { text: 'Running a scale as fast as possible', why: 'Fast and unattended: you rehearse whatever goes wrong.' },
      ],
      explain: 'One precise target, slow enough to be right, immediate feedback, small steps up. Everything else is playing, which is also good, but different.',
    },
  ],
  facts: [
    { id: 'nine-in-ten', front: 'At what tempo do you practise a new passage?', back: 'The tempo at which it is correct nine times out of ten. Raise it in small steps only while it stays correct.' },
    { id: 'ladder-step-back', front: 'On the Technique screen\'s 4 BPM tempo ladder, what moves you up a rung, and what moves you down?', back: 'A clean pass moves you up a rung; two passes in a row that are not clean step you back one (4 BPM). Then climb again.' },
    { id: 'spaced-mixed-practice', front: 'Long blocks of one thing, or spaced and mixed practice?', back: 'Spaced across days and mixed within a session generally wins, even though blocks feel more productive at the time.' },
  ],
};

// ── 3. Time that does not need the click ────────────────────────────────────────────────────────

const time: TeacherLesson = {
  id: 'time',
  title: 'Time that does not need the click',
  teaches: 'Put the click on 2 and 4, then the offbeats, then one per two bars, and still land with it.',
  minutes: 4,
  skill: 'teacher:elena:time',
  steps: [
    {
      type: 'card',
      title: 'A click on every beat flatters you',
      body: 'A metronome on every beat flatters you: it puts you right four times a bar. Put it on 2 and 4, then only on the and of each beat, then on beat 1 of every second bar. If you still land with it, your time is your own.',
      figure: { kind: 'rhythm', pattern: 'qr q qr q', time: '4/4', tempo: 80, caption: 'The click on 2 and 4: beats 1 and 3 are yours to feel.' },
    },
    {
      type: 'choice',
      prompt: 'The click sounds only on 2 and 4. Where is beat 1?',
      options: [
        { text: 'In the silent beat before the click on 2', correct: true },
        { text: 'On the first click you hear', why: 'Then every beat you play is one late: the first click is beat 2.' },
        { text: 'Wherever you start playing', why: 'The bar does not wait for you; that is rather the point.' },
      ],
      explain: 'The clicks are 2 and 4, the backbeat a drummer plays on the snare. Beat 1 is the silent beat before the click on 2, beat 3 the one before the click on 4, and you must feel both there.',
      fact: 'click-on-two-and-four',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap only beats 2 and 4, as the click will play them. Feel 1 and 3 without tapping.',
      rhythm: { pattern: 'qr q qr q' },
      tempo: 80,
      show: 'both',
      explain: 'Rests on 1 and 3, taps on 2 and 4. Count all four aloud the first time: "one, TWO, three, FOUR".',
    },
    techniqueTask({
      id: 'click-two-four',
      title: 'The click on 2 and 4',
      exercise: 'tech-metronome-2-4',
      minutes: 4,
      body: 'Metronome on 2 and 4 (the exercise sets the click for you) at 80 BPM: its strumming groove for a minute, then a two-octave major scale in eighth notes against the same click. Then its second part, the click only on the and of each beat, the same way.',
      tip: 'Tap your foot on all four beats. The silent beats must be as present as the loud ones.',
    }),
    {
      type: 'card',
      title: 'Then the offbeats, then silence',
      body: 'Next, the click only on the and of each beat: now the click is the gap and you are the beat. Then one click every two bars. Record yourself and check: rushing in fills and dragging in hard passages are the usual sins.',
      figure: { kind: 'rhythm', pattern: 'er e er e er e er e', time: '4/4', tempo: 80, caption: 'The click on the offbeats: you supply every number.' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap only on the and of each beat, between the beats you count.',
      rhythm: { pattern: 'er e er e er e er e' },
      tempo: 80,
      show: 'both',
      explain: 'Each tap lands exactly halfway between two beats. Say "1 and 2 and" and tap only on "and".',
    },
    toolTask({
      id: 'offbeat-drill',
      title: 'The off-beat drill',
      tool: 'rhythm',
      params: ['drill', 'offbeat-2'],
      minutes: 3,
      body: 'Off-beats, faster: the click keeps the beat and you tap only the and, the same skill seen from the other side. Stay until you earn three stars.',
    }),
    {
      type: 'true-false',
      statement: 'Rushing in fills and dragging in hard passages are the usual timing faults.',
      answer: true,
      explain: 'Excitement rushes, difficulty drags. A recording finds both; the feeling of the moment finds neither.',
      fact: 'timing-sins',
    },
    toolTask({
      id: 'one-click-two-bars',
      title: 'One click every two bars',
      tool: 'metronome',
      minutes: 3,
      body: 'Set 80 BPM. Tap beats 2, 3 and 4 until they are silent, then turn on silent bars: one bar played, one silent. One click every two bars. Strum a pattern for two minutes and land with the click every time it returns.',
      tip: 'Arriving early is as wrong as arriving late. Most people rush the silent bar.',
    }),
    {
      type: 'tap-rhythm',
      prompt: 'A syncopation: eighth, quarter, eighth, then two quarters. The quarter starts on the and of 1.',
      rhythm: { pattern: 'e q e q q' },
      tempo: 80,
      show: 'both',
      explain: 'The second note starts on the and of 1 and is held through beat 2; the third is the and of 2. Feel the beats you do not tap.',
    },
    {
      type: 'choice',
      prompt: 'Which metronome setting asks the most of your own time?',
      options: [
        { text: 'One click every two bars', correct: true },
        { text: 'A click on every beat', why: 'It corrects you four times a bar. Pleasant, and flattering.' },
        { text: 'A click on 2 and 4', why: 'A good step, but the click still speaks every other beat.' },
      ],
      explain: 'With one click every eight beats you carry seven of them alone. Land with it when it returns and the time is genuinely yours.',
      fact: 'click-on-two-and-four',
    },
  ],
  facts: [
    { id: 'click-on-two-and-four', front: 'How do you make the metronome test your time?', back: 'Move it to 2 and 4, then to the offbeats only, then to beat 1 of every second bar. Land with it each time.' },
    { id: 'timing-sins', front: 'The two usual timing faults?', back: 'Rushing in fills and dragging in hard passages. Record yourself to catch both.' },
  ],
};

// ── 4. Clean picking ────────────────────────────────────────────────────────────────────────────

const CROSSING_A: TabNote[] = [t(3, 5, 'e'), t(2, 5, 'e'), t(3, 5, 'e'), t(2, 5, 'e'), t(3, 5, 'e'), t(2, 5, 'e'), t(3, 5, 'e'), t(2, 5, 'e')];

const pickingHygiene: TeacherLesson = {
  id: 'picking-hygiene',
  title: 'Clean picking',
  teaches: 'Small motions, clean escapes both ways, and the fretting finger landing just before the pick strikes.',
  minutes: 4,
  skill: 'teacher:elena:picking-hygiene',
  steps: [
    {
      type: 'card',
      title: 'Every wasted millimetre costs you',
      body: 'At speed, every wasted millimetre costs you. Keep the pick close to the strings and move from the wrist or the forearm, consistently. Then master both escapes: crossing to the next string after a downstroke feels different from crossing after an upstroke, and both must be clean.',
      figure: { kind: 'tab', tempo: 60, notes: CROSSING_A, caption: 'Pattern A: {n:C} down, {n:E} up. Pattern B swaps the strokes.' },
    },
    {
      type: 'choice',
      prompt: 'Why practise String Crossing Both Ways in both patterns?',
      options: [
        { text: 'Each crosses after a different stroke', correct: true },
        { text: 'Pattern B is simply faster', why: 'Neither is faster. They train different motions.' },
        { text: 'For variety, to avoid boredom', why: 'A pleasant side effect, not the reason.' },
      ],
      explain: 'In one pattern the pick leaves the string after a downstroke, in the other after an upstroke. Each needs its own clean escape, and most players find one of them awkward.',
      fact: 'two-escapes',
    },
    {
      type: 'card',
      title: 'Finger first, then pick',
      body: 'The fretting finger lands just before the pick strikes. Late by a hair, and the note buzzes; lift the previous finger too early, and there is a gap. At 40 BPM there is time to hear both faults, which is precisely why we go there.',
    },
    {
      type: 'choice',
      prompt: 'A note buzzes for an instant, then clears. The most likely cause?',
      options: [
        { text: 'The finger landed after the pick struck', correct: true },
        { text: 'Too much pick past the fingers', why: 'That drags and sounds clumsy, but it does not make a fretted note buzz.' },
        { text: 'The previous finger lifted too late', why: 'That makes two notes overlap; it does not make the new one buzz.' },
        { text: 'The string is out of tune', why: 'Out of tune is out of tune from start to finish; it does not clear.' },
      ],
      explain: 'The pick struck while the finger was still arriving, so the string buzzed against the fret until the finger was down. Finger first, then pick.',
      fact: 'finger-before-pick',
    },
    techniqueTask({
      id: 'hands-in-sync',
      title: 'Hands in Sync at 40 BPM',
      exercise: 'tech-hands-in-sync',
      minutes: 5,
      body: 'The chromatic 1-2-3-4 at frets 5 to 8 across all six strings, in eighths, at 40 BPM. Take the microphone check, and record yourself on your phone: listen for a buzz (finger late) or a gap (finger lifted early).',
      tip: 'It feels almost too slow. That is what lets you hear everything.',
    }),
    {
      type: 'play-phrase',
      prompt: 'Frets 5 to 8 on string 3, then on string 2, alternate picked. Finger first, then pick, every time.',
      notes: [t(3, 5, 'e'), t(3, 6, 'e'), t(3, 7, 'e'), t(3, 8, 'e'), t(2, 5, 'e'), t(2, 6, 'e'), t(2, 7, 'e'), t(2, 8, 'e')],
      octave: 'exact',
      tempo: 60,
      explain: 'String 3: {n:C} {n:C#} {n:D} {n:D#}; string 2: {n:E} {n:F} {n:F#} {n:G}. Eight clean notes, each joined to the next with no gap and no buzz.',
      alternative: {
        type: 'order',
        prompt: 'Put the notes of frets 5 to 8 on string 3 in order, from fret 5.',
        tiles: ['{n:C}', '{n:C#}', '{n:D}', '{n:D#}'],
        distractors: ['{n:B}'],
        explain: 'String 3 fret 5 is {n:C}; each fret adds a half step: {n:C#}, {n:D}, {n:D#}.',
      },
    },
    techniqueTask({
      id: 'string-crossing',
      title: 'String Crossing Both Ways',
      exercise: 'tech-string-crossing',
      minutes: 5,
      body: 'Both patterns, on strings 3 and 2, 2 and 1, 4 and 3, up the ladder. Spend twice as long on whichever pattern is weaker; there is always one.',
    }),
    {
      type: 'true-false',
      statement: 'Pattern B is pattern A backwards, so practising A covers it.',
      answer: false,
      explain: 'B crosses after the other stroke, so the pick escapes in the other direction. It is a different motion, and it needs its own practice.',
      fact: 'two-escapes',
    },
    techniqueTask({
      id: 'chromatic-sixteenths',
      title: 'Chromatic picking in sixteenths',
      exercise: 'tech-alternate-chromatic',
      minutes: 5,
      body: 'Alternate Picking: Chromatic, the sixteenths, up the ladder: frets 5 to 8 with fingers 1 to 4, string 6 to 1 and back, strictly down-up. Keep the pick close: a smaller stroke is a faster stroke.',
    }),
    {
      type: 'match-pairs',
      prompt: 'Match each fault with its cause.',
      pairs: [
        { left: 'Buzz on the attack', right: 'Finger landed late' },
        { left: 'Gap between notes', right: 'Finger lifted early' },
        { left: 'Next string catches', right: 'Pick not clearing it' },
        { left: 'Tired, heavy picking', right: 'Strokes too large' },
      ],
      explain: 'Late finger, buzz; early lift, gap; a pick arc too shallow catches the next string; big strokes waste time and tire the arm.',
    },
  ],
  facts: [
    { id: 'finger-before-pick', front: 'Fretting finger or pick: which arrives first?', back: 'The finger, just before the pick strikes. Late by a hair and the note buzzes.' },
    { id: 'two-escapes', front: 'Why practise string crossings in two patterns?', back: 'Crossing after a downstroke and after an upstroke are different motions; both must be clean.' },
  ],
};

// ── 5. Three notes per string ───────────────────────────────────────────────────────────────────

const threeNotesPerString: TeacherLesson = {
  id: 'three-notes-per-string',
  title: 'Three notes per string',
  teaches: 'Three notes per string gives every string the same picking; G major pattern 1 runs from fret 3 to fret 8.',
  minutes: 5,
  skill: 'teacher:elena:three-notes-per-string',
  steps: [
    {
      type: 'card',
      title: 'Built for speed',
      body: '{t:three-notes-per-string|Three notes per string} gives every string the same picking pattern and makes long runs even. {k:G major} pattern 1 starts at string 6 fret 3 ({n:G}), stays within frets 3 to 8 and ends at string 1 fret 8 ({n:C}).',
      figure: { kind: 'fretboard', frets: [3, 8], dots: patternDots(G_3NPS_1), caption: '{k:G major}, three notes per string, pattern 1. Roots marked.' },
      tip: 'The Three-Notes-per-String Legato exercise uses exactly this fingering. Same map, different stroke.',
    },
    {
      type: 'fretboard-name',
      prompt: 'Pattern 1 ends on string 1, fret 8. Which note is it?',
      position: { string: 1, fret: 8 },
      ask: 'note',
      spelling: 'any',
      options: ['C', 'B', 'D', 'A'],
      explain: 'String 1 fret 8 is {n:C}, the fourth of {k:G major}: the pattern runs from {n:G} to the {n:C} two octaves and a fourth above it.',
      fact: 'g-3nps-pattern-1',
    },
    {
      type: 'card',
      title: 'Where the chord sits',
      body: 'The E-shape {c:G} (355433) sits at the bottom of the pattern: its notes on strings 6 to 3 are pattern notes. On strings 2 and 1 the pattern has climbed to frets 5 to 8, above the chord. The roots: string 6 fret 3, string 4 fret 5, string 2 fret 8.',
      figure: { kind: 'chord', symbol: 'G', frets: '355433', caption: 'The E-shape {c:G} at fret 3.' },
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap every {n:G} between frets 3 and 8.',
      find: { note: 'G' },
      mode: 'all',
      octave: 'any',
      frets: [3, 8],
      explain: 'Four: string 6 fret 3, string 4 fret 5 and string 2 fret 8 are the pattern\'s roots; string 1 fret 3 belongs to the {c:G} chord, below the pattern on that string.',
    },
    {
      type: 'play-phrase',
      prompt: 'The first six notes, alternate picked: frets 3, 5, 7 on string 6, then on string 5.',
      notes: [t(6, 3, 'e'), t(6, 5, 'e'), t(6, 7, 'e'), t(5, 3, 'e'), t(5, 5, 'e'), t(5, 7, 'e')],
      octave: 'exact',
      tempo: 60,
      explain: '{n:G} {n:A} {n:B} on string 6, {n:C} {n:D} {n:E} on string 5: the same three frets, the same stretch, on both strings.',
      alternative: {
        type: 'order',
        prompt: 'Put the first six notes of pattern 1 in order.',
        tiles: ['{n:G}', '{n:A}', '{n:B}', '{n:C}', '{n:D}', '{n:E}'],
        distractors: ['{n:F}'],
        explain: 'String 6 frets 3, 5, 7: {n:G} {n:A} {n:B}. String 5 frets 3, 5, 7: {n:C} {n:D} {n:E}. {n:F} is not in {k:G major}; its seventh is {n:F#}.',
      },
    },
    toolTask({
      id: 'g-pattern-1',
      title: 'G major, pattern 1 at 60 BPM',
      tool: 'scales',
      params: ['g', 'major', '3nps-1'],
      minutes: 4,
      body: '{k:G major}, three notes per string, pattern 1, alternate picked in eighth notes at 60 BPM, up and down. Three clean passes in a row, then you may leave. Frets 3 to 7 on the low strings is a wide stretch: if the hand aches, stop and shake it out.',
    }),
    {
      type: 'choice',
      prompt: 'What makes three notes per string the fingering built for speed?',
      options: [
        { text: 'Every string takes the same picking', correct: true },
        { text: 'It avoids position shifts entirely', why: 'It does not: pattern 1 spans frets 3 to 8, so the hand shifts or stretches as it climbs.' },
        { text: 'It uses only three fingers', why: 'It uses all four, and stretches between them.' },
      ],
      explain: 'Three notes on every string means the same stroke pattern on every string, so long runs stay even. CAGED tells you where the chords are; this tells your hands how to run.',
      fact: 'caged-and-3nps',
    },
    toolTask({
      id: 'g-patterns-2-3',
      title: 'Patterns 2 and 3, against CAGED',
      tool: 'scales',
      params: ['g', 'major', '3nps-2'],
      minutes: 5,
      body: 'Patterns 2 (frets 5 to 10) and 3 (frets 7 to 12). For each, switch the screen to CAGED and find the overlap: pattern 2 crosses the D-shape (frets 4 to 8) and C-shape (7 to 10) positions, pattern 3 the C-shape and the A-shape (9 to 13).',
    }),
    {
      type: 'true-false',
      statement: 'CAGED and three notes per string are rival systems: a serious player chooses one.',
      answer: false,
      explain: 'CAGED tells you where the chords are; three notes per string tells your hands how to run. You need both, and they describe the same notes.',
      fact: 'caged-and-3nps',
    },
    techniqueTask({
      id: 'all-keys-start',
      title: 'Scales in every key: C, G, D',
      exercise: 'tech-all-keys-scales',
      minutes: 5,
      body: 'Scales in Every Key, Full Neck: only the first three keys of its circle, {k:C major}, {k:G major} and {k:D major}, two octaves, three notes per string, in sixteenths, from the bottom of its ladder (80 BPM). A daily routine for years, not a week.',
      tip: 'Set the tempo by your hardest key and play every key at it.',
    }),
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'G',
      frets: '355433',
      accept: 'this-shape',
      prompt: 'Build the E-shape {c:G} that sits at the bottom of pattern 1.',
      explain: 'Barre fret 3; fret 5 on strings 5 and 4, fret 4 on string 3. Its roots on strings 6 and 4 are the pattern\'s first two roots.',
    },
  ],
  facts: [
    { id: 'g-3nps-pattern-1', front: 'Where is {k:G major} three-notes-per-string pattern 1?', back: 'From string 6 fret 3 ({n:G}) to string 1 fret 8 ({n:C}), within frets 3 to 8.' },
    { id: 'caged-and-3nps', front: 'CAGED or three notes per string?', back: 'Both: CAGED tells you where the chords are; three notes per string tells your hands how to run.' },
  ],
};

/** Unit 1 of Prof. Varga's course. */
const unit: TeacherUnit = {
  id: 'elena-practice-and-precision',
  title: 'Practice and precision',
  theme: 'technique',
  description: 'Measure where you stand, practise deliberately, and make your time and picking precise.',
  lessons: [audition, deliberatePractice, time, pickingHygiene, threeNotesPerString],
  checkpoint: { sample: 8, maxMistakes: 2 },
  glossary: [
    { id: 'three-notes-per-string', term: 'three notes per string', definition: 'A scale fingering with three notes on every string, so every string takes the same picking: built for fast, even runs.' },
    { id: 'deliberate-practice', term: 'deliberate practice', definition: 'Practice with one precise target, slow enough to be right, with immediate feedback and small steps up.' },
    { id: 'interleaving', term: 'interleaving', definition: 'Mixing topics within a session in short blocks, instead of one long block of a single thing.' },
  ],
};

export default unit;
