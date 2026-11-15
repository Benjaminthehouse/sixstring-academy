/** Fingers of the picking hand: p i m a, rest strokes, the thumb, Travis, tremolo and hybrid picking. */
import { music, times } from '../generate';
import type { TechniqueExercise } from '../types';

/** p i m a over C (x32010): p on string 5, i on 3, m on 2, a on 1. */
const P = '5:3{P}';
const I = '3:0{I}';
const M = '2:1{M}';
const A = '1:0{A}';

/** Strictly alternating i and m over a line of notes, starting with i. */
function im(notes: readonly string[], startWith: 'I' | 'M' = 'I'): string[] {
  return notes.map((n, i) => `${n}{${(i % 2 === 0) === (startWith === 'I') ? 'I' : 'M'}}`);
}

const C_STRINGS_3_TO_1 = ['3:0', '3:2', '2:0', '2:1', '2:3', '1:0', '1:1', '1:3'];

function restStrokeQuarters(): string {
  const down = [...C_STRINGS_3_TO_1].reverse().slice(1); // 1:1 ... 3:0
  const all = im([...C_STRINGS_3_TO_1, ...down]);
  return music([`q ${all.slice(0, 4).join(' ')}`, `q ${all.slice(4, 8).join(' ')}`, `q ${all.slice(8, 12).join(' ')}`, `q ${all.slice(12, 14).join(' ')} h ${all[14]}`]);
}

function restStrokeEighths(): string {
  const down = [...C_STRINGS_3_TO_1].reverse().slice(1);
  const all = im([...C_STRINGS_3_TO_1, ...down]);
  return music([`e ${all.slice(0, 8).join(' ')}`, `e ${all.slice(8, 14).join(' ')} q ${all[14]}`]);
}

/** One beat of p-a-m-i tremolo: a bass note, then the treble note three times. */
const trem = (bass: string, treble: string): string => `${bass}{P} ${treble}{A} ${treble}{M} ${treble}{I}`;

export const FINGERSTYLE: TechniqueExercise[] = [
  {
    id: 'tech-hybrid-picking',
    title: 'Hybrid Picking',
    hand: 'picking',
    level: 6,
    skill: 'fingerstyle',
    mode: 'ladder',
    tempo: { start: 60, step: 4, goal: 120 },
    teaches: ['hybrid picking', 'country style', 'independence'],
    summary: 'Pick and fingers together: the pick takes the bass, the middle and ring fingers pluck the treble.',
    steps: [
      'Hold the pick between thumb and index as usual; your middle (m) and ring (a) fingers stay free.',
      'Over C (x32010): pick on string 5, m on string 2, pick on string 4, a on string 1, in eighths.',
      'Then pinch: the pick on string 5 together with m on string 2.',
    ],
    feel: 'The plucked notes snap out a little brighter than the picked ones, and the pattern rolls along like fingerpicking with a pick in your hand.',
    mistakes: [
      { watch: 'the pick grip loosening when the fingers pluck', fix: 'Practise the pinch alone, slowly: pick and finger close toward each other like a small pinch, and the grip stays put.' },
      { watch: 'fingers plucking too hard (snapping strings)', fix: 'Pluck with the pad and a little nail, moving up and slightly out, not yanking the string away from the guitar.' },
    ],
    parts: [
      {
        id: 'pattern',
        name: 'Pick and fingers',
        tab: music(times(`"C=x32010" e ${times('5:3{dn} 2:1{M} 4:2{dn} 1:0{A}', 2).join(' ')}`, 2)),
        check: { kind: 'onsets' },
      },
      {
        id: 'pinch',
        name: 'Pinch',
        note: 'Pick and m together on the first note of each half bar.',
        tab: music(times(`"C=x32010" e ${times('(5:3 2:1{M}){dn} 4:2{dn} 1:0{A} 4:2{dn}', 2).join(' ')}`, 2)),
        check: { kind: 'onsets' },
      },
    ],
  },
  {
    id: 'tech-pima-free-stroke',
    title: 'Free-Stroke Arpeggios (p i m a)',
    hand: 'picking',
    level: 3,
    skill: 'fingerstyle',
    mode: 'ladder',
    tempo: { start: 60, step: 4, goal: 120 },
    teaches: ['p i m a', 'arpeggios', 'free stroke'],
    summary: 'Each finger owns a string: the thumb the bass, i, m and a the top three. The basis of all fingerpicking.',
    steps: [
      'Hold C (x32010). p (thumb) plays string 5, i string 3, m string 2, a string 1.',
      'Free stroke: each finger plucks and moves on past the string, into the air, without touching the next string.',
      'One bar each: p-i-m-a, p-a-m-i, p-i-m-a-m-i (a bar of 3/4), then p alone and i-m-a plucked together.',
      'Eighth notes. Let the chord ring.',
    ],
    feel: 'A soft, flowing ripple of notes, each the same volume. The hand hovers in one place and only the fingertips move.',
    mistakes: [
      { watch: 'the thumb plucking toward the palm instead of forward', fix: 'Push the thumb forward and slightly down, toward the floor, so it stays in front of the fingers.' },
      { watch: 'fingers lifting far from the strings', fix: 'After each pluck, let the finger relax back to its string. Rest the fingers on their strings before each bar.' },
      { watch: 'uneven volume between fingers', fix: 'Play one bar very quietly and listen for the loud finger, usually the thumb or a. Ease that one off.' },
    ],
    parts: [
      {
        id: 'patterns',
        name: 'Four patterns',
        time: '4/4',
        tab: [
          music([`"C=x32010" e ${times(`${P} ${I} ${M} ${A}`, 2).join(' ')}`, `e ${times(`${P} ${A} ${M} ${I}`, 2).join(' ')}`]),
          'time: 3/4',
          music([`e ${P} ${I} ${M} ${A} ${M} ${I}`]),
          'time: 4/4',
          music([`e ${times(`${P} (3:0{I} 2:1{M} 1:0{A})`, 4).join(' ')}`]),
        ].join('\n'),
        check: { kind: 'onsets' },
      },
    ],
  },
  {
    id: 'tech-rest-stroke',
    title: 'Rest Stroke Scale (i-m)',
    hand: 'picking',
    level: 4,
    skill: 'fingerstyle',
    mode: 'ladder',
    tempo: { start: 60, step: 4, goal: 120 },
    teaches: ['rest stroke', 'alternation', 'classical tone'],
    summary: 'The classical rest stroke: a full, round tone from a finger that comes to rest on the next string.',
    steps: [
      'Rest stroke (apoyando): after plucking, the finger comes to rest on the next string toward string 6.',
      'Play the notes of C major on strings 3 to 1 in first position, from G up to G and back.',
      'Strictly alternate i and m, never the same finger twice in a row.',
      'Quarters first, then eighths.',
    ],
    feel: 'A warm, strong tone. Each finger lands on the string below with a light, sure touch, like walking.',
    mistakes: [
      { watch: 'using the same finger twice in a row', fix: 'Say "i, m" out loud as you play; restart slowly if the order slips.' },
      { watch: 'the hand bouncing', fix: 'The hand stays still; only the fingers move from the big knuckle.' },
      { watch: 'thin tone from plucking upward', fix: 'Push the string down toward the guitar’s top and through it, so the finger falls onto the next string.' },
    ],
    parts: [
      { id: 'quarters', name: 'Quarters', tab: restStrokeQuarters(), check: { kind: 'notes' } },
      { id: 'eighths', name: 'Eighths', tab: restStrokeEighths(), check: { kind: 'notes' } },
    ],
  },
  {
    id: 'tech-thumb-independence',
    title: 'Thumb Independence',
    hand: 'picking',
    level: 5,
    skill: 'fingerstyle',
    mode: 'ladder',
    tempo: { start: 50, step: 5, goal: 100 },
    teaches: ['independence', 'fingerstyle', 'syncopation'],
    summary: 'A thumb that keeps steady quarter notes whatever the fingers do: the engine of fingerstyle blues and folk.',
    steps: [
      'Hold E (022100). The thumb plays steady quarter notes, alternating the open string 6 (E) and string 4 fret 2 (E).',
      'First, i plays on every off-beat ("and") on string 3.',
      'Then i and m play a simple syncopated melody on strings 1 and 2 over the same thumb.',
    ],
    feel: 'The thumb is a metronome you never think about. The melody floats on top, sometimes between the thumb notes.',
    mistakes: [
      { watch: 'the thumb following the fingers into syncopation', fix: 'Play the thumb alone for a minute until it is automatic, then add one melody note per bar.' },
      { watch: 'bass notes too loud', fix: 'Rest the side of the picking palm lightly on the bass strings to soften them, and let the melody sing.' },
    ],
    parts: [
      {
        id: 'off-beats',
        name: 'Thumb and off-beats',
        tab: music(times(`"E=022100" e ${times('6:0{P} 3:1{I} 4:2{P} 3:1{I}', 2).join(' ')}`, 2)),
        check: { kind: 'onsets' },
      },
      {
        id: 'melody',
        name: 'With a melody',
        tab: music(['"E=022100" q (6:0{P} 1:0{M}) e 4:2{P} 2:0{I} 6:0{P} 1:0{M} q (4:2{P} 2:0{I})', 'q (6:0{P} 2:0{I}) e 4:2{P} 1:0{M} 6:0{P} 2:2{I} q (4:2{P} 1:0{M})']),
        check: { kind: 'onsets' },
      },
    ],
  },
  {
    id: 'tech-travis-thumb',
    title: 'Travis Thumb, Muted',
    hand: 'picking',
    level: 4,
    skill: 'fingerstyle',
    mode: 'ladder',
    tempo: { start: 60, step: 4, goal: 112 },
    teaches: ['Travis picking', 'alternating bass', 'muted bass'],
    summary: 'The alternating bass of Travis picking, muted and steady as a clock, before any melody goes on top.',
    steps: [
      'Palm-mute strings 4 to 6 lightly with the side of your picking hand.',
      'On C (x32010), the thumb alternates string 5, string 4, string 6, string 4, one note per beat, for two minutes.',
      'For string 6, move finger 3 from string 5 fret 3 to string 6 fret 3 (G) and back.',
      'Then add a pinch: thumb plus m on string 2 together on beat 1.',
    ],
    feel: 'A soft, steady "boom-chick" that you could keep going while talking. The pinch on beat 1 pops out a little.',
    mistakes: [
      { watch: 'the thumb rushing', fix: 'Count "one, two, three, four" aloud with the click. The thumb lands on the number, never before.' },
      { watch: 'missing the move to string 6', fix: 'Practise the move of finger 3 between strings 5 and 6 slowly, without picking, until it is one quick hop.' },
      { watch: 'the mute killing the bass completely', fix: 'Slide the palm toward the bridge until each bass note has a pitch again.' },
    ],
    parts: [
      { id: 'thumb', name: 'Thumb alone', tab: music(times('"C=x32010" q 5:3{pm P} 4:2{pm P} 6:3{pm P} 4:2{pm P}', 2)), check: { kind: 'onsets' } },
      { id: 'pinch', name: 'With a pinch', tab: music(times('"C=x32010" q (5:3{pm P} 2:1{M}) 4:2{pm P} 6:3{pm P} 4:2{pm P}', 2)), check: { kind: 'onsets' } },
    ],
  },
  {
    id: 'tech-tremolo-pami',
    title: 'Classical Tremolo (p a m i)',
    hand: 'picking',
    level: 7,
    skill: 'fingerstyle',
    mode: 'ladder',
    tempo: { start: 40, step: 4, goal: 92 },
    teaches: ['tremolo', 'evenness', 'Recuerdos preparation'],
    summary: 'A bass note and the same treble note three times, so evenly that the treble seems to sustain like a bowed string.',
    steps: [
      'The thumb plays a bass note on strings 4 to 6, then a, m and i repeat one treble note on string 1.',
      'Four even notes per beat, p-a-m-i, counted as sixteenths.',
      'First on the open string 1 over open bass strings, then with a moving melody on string 1.',
    ],
    feel: 'Four identical, evenly spaced notes per beat, like rain on a roof. At speed the treble turns into one long, trembling note.',
    mistakes: [
      { watch: 'a gallop (uneven a-m-i)', fix: 'Play a-m-i very slowly and accent each finger in turn (a, then m, then i) for a minute each. It evens out the timing.' },
      { watch: 'the thumb too loud', fix: 'Let the thumb fall through the string lightly; the melody is in the treble.' },
      { watch: 'tension in the hand', fix: 'Stop, shake out, and restart slower. Tremolo only becomes fast when it is relaxed.' },
    ],
    strain: { text: 'Tremolo builds tension in the picking hand. Keep sessions short and stop if the hand or forearm aches.', maxMinutes: 8 },
    parts: [
      { id: 'open', name: 'Open strings', tab: music(times(`s ${trem('6:0', '1:0')} ${trem('5:0', '1:0')} ${trem('4:0', '1:0')} ${trem('5:0', '1:0')}`, 2)), check: { kind: 'onsets' } },
      {
        id: 'melody',
        name: 'Moving melody',
        tab: music([
          `"Am=x02210" s ${trem('5:0', '1:5')} ${trem('4:2', '1:3')} ${trem('5:0', '1:1')} ${trem('4:2', '1:0')}`,
          `"E=022100" s ${trem('6:0', '1:0')} ${trem('4:2', '1:4')} ${trem('6:0', '1:4')} ${trem('4:2', '1:0')}`,
        ]),
        check: { kind: 'onsets' },
      },
    ],
  },
];
