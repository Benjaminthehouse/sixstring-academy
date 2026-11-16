/** Fretting hand: finger independence, legato, shifts and slides. */
import {
  LOW_TO_HIGH,
  alternate,
  chromaticUpDown,
  fingerOrder,
  legatoString,
  line,
  mark,
  music,
  permutationsStartingWith,
  toks,
  type TabNote,
} from '../generate';
import type { ExercisePart, TechniqueExercise } from '../types';
import { G_MAJOR_3NPS } from './picking';

const FIFTH = 5;

/** The orders as text: "1-2-3-4, 1-2-4-3, ...". */
const orderText = (orders: number[][]): string => orders.map((o) => o.join('-')).join(', ');

/** Each order four times on string 3, frets 5-8. */
function oneString(orders: number[][]): string {
  const notes = orders.flatMap((o) => Array.from({ length: 4 }, () => fingerOrder(3, FIFTH, o)).flat());
  return line(alternate(notes), 8, 'e');
}

/** Each order once on every string, 6 to 1. */
function acrossStrings(orders: number[][]): string {
  const notes = orders.flatMap((o) => LOW_TO_HIGH.flatMap((s) => fingerOrder(s, FIFTH, o)));
  return line(alternate(notes), 8, 'e');
}

function permutationParts(first: readonly number[]): ExercisePart[] {
  const many = first.length > 1;
  const parts: ExercisePart[] = [];
  for (const where of ['one-string', 'across'] as const) {
    for (const f of first) {
      const orders = permutationsStartingWith(f);
      const place = where === 'one-string' ? 'One string' : 'Across the strings';
      parts.push({
        id: `from-${f}-${where}`,
        name: many ? `From ${f}: ${place.toLowerCase()}` : place,
        note: where === 'one-string' ? `${orderText(orders)}: each four times on string 3, frets 5 to 8.` : `${orderText(orders)}: each once on every string from 6 to 1.`,
        tab: where === 'one-string' ? oneString(orders) : acrossStrings(orders),
        check: { kind: 'notes' },
      });
    }
  }
  return parts;
}

/** Fingers 1-2 held on the lower string while 3-4 move on the higher, then the other way round, on every pair of strings. */
function anchored(): string {
  const pairs: Array<[number, number]> = [[6, 5], [5, 4], [4, 3], [3, 2], [2, 1]];
  const bars: string[] = [];
  for (const [low, high] of pairs) {
    const a: TabNote[] = [{ s: low, f: 6, marks: ['2'] }, ...Array.from({ length: 7 }, (_, i) => ({ s: high, f: i % 2 === 0 ? 7 : 8, marks: [i % 2 === 0 ? '3' : '4'] }))];
    const b: TabNote[] = [{ s: high, f: 8, marks: ['4'] }, ...Array.from({ length: 7 }, (_, i) => ({ s: low, f: i % 2 === 0 ? 5 : 6, marks: [i % 2 === 0 ? '1' : '2'] }))];
    bars.push(`e ${toks(a).join(' ')}`, `e ${toks(b).join(' ')}`);
  }
  return music(bars, 2);
}

/** One finger per fret on string 3, from frets 9-12 down to 1-4. */
function stretch(): string {
  const notes: TabNote[] = [];
  for (let pos = 9; pos >= 1; pos--) notes.push(...fingerOrder(3, pos, [1, 2, 3, 4]));
  const t = toks(notes);
  const bars: string[] = [];
  for (let i = 0; i + 8 <= t.length; i += 8) bars.push(`e ${t.slice(i, i + 8).join(' ')}`);
  bars.push(`e ${t.slice(32).join(' ')} h r`);
  return music(bars);
}

function legatoChains(): string {
  const up = LOW_TO_HIGH.flatMap((s) => legatoString(s, [5, 7, 8]));
  const down = [...LOW_TO_HIGH].reverse().flatMap((s) => legatoString(s, [8, 7, 5]));
  return line([...up, ...down], 12, 'e3');
}

function legato3nps(): string {
  const strings = LOW_TO_HIGH.map((s) => G_MAJOR_3NPS.filter((x) => x.s === s).map((x) => x.f as number));
  const up = LOW_TO_HIGH.flatMap((s, i) => legatoString(s, strings[i]));
  const down = [...LOW_TO_HIGH].reverse().flatMap((s) => legatoString(s, [...strings[LOW_TO_HIGH.indexOf(s)]].reverse()));
  return line([...up, ...down], 12, 'e3');
}

/** A trill between two fingers on string 3 in fifth position: two bars of sixteenths, picked once per bar. */
function trill(a: number, b: number): string[] {
  const lo = FIFTH + a - 1;
  const hi = FIFTH + b - 1;
  const bar = legatoString(3, Array.from({ length: 16 }, (_, i) => (i % 2 === 0 ? lo : hi)));
  const first = mark({ ...bar[0], marks: [] }, String(a));
  const text = `s ${toks([first, ...bar.slice(1)]).join(' ')}`;
  return [text, text];
}

export const FRETTING: TechniqueExercise[] = [
  {
    id: 'tech-spider',
    title: 'Chromatic Spider (1-2-3-4)',
    hand: 'fretting',
    level: 1,
    skill: 'independence',
    mode: 'ladder',
    tempo: { start: 50, step: 5, goal: 120 },
    teaches: ['one finger per fret', 'finger independence', 'economy of motion'],
    summary: 'One finger per fret across all six strings: the classic exercise for strong, independent, economical fingers.',
    steps: [
      'Fifth position: finger 1 at fret 5, 2 at fret 6, 3 at fret 7, 4 at fret 8.',
      'On string 6, play frets 5-6-7-8 with fingers 1-2-3-4, then the same on strings 5 to 1.',
      'Come back with 8-7-6-5 (fingers 4-3-2-1) on each string from 1 to 6.',
      'Then move the whole pattern down one fret at a time toward first position, only as far as it stays comfortable: the frets get wider near the nut. Eighth notes.',
    ],
    feel: 'Fingers hover just above the strings and drop straight onto their frets, pressing only as much as a clean note needs. The pattern sounds like an even, ticking clock.',
    mistakes: [
      { watch: 'fingers flying far from the strings when lifted', fix: 'Watch your little finger. Keep every lifted finger within about a centimetre of the strings, even at the cost of speed.' },
      { watch: 'pressing harder than needed (use just enough pressure to stop the buzz)', fix: 'Press until the note is clean, then ease off until it just buzzes, and add back a little.' },
      { watch: 'the thumb squeezing the neck', fix: 'Let the thumb float behind the neck; the pull of your arm does the pressing.' },
      { watch: 'fingertips collapsing at the first joint', fix: 'Arch each finger and play on the very tip. Slow down so the little finger can stay curved too.' },
      { watch: 'stretching for frets 1-4 before the hand is ready (stay higher up the neck for now)', fix: 'Stop walking down at the first position that feels like a stretch. Fifth position is plenty for now.' },
    ],
    strain: { text: 'Walking down toward the nut widens the stretch. Go only as far as it stays comfortable.', maxMinutes: 10 },
    parts: [
      { id: 'fifth-position', name: 'Fifth position', tab: line(chromaticUpDown(FIFTH), 8, 'e'), check: { kind: 'notes' } },
      {
        id: 'walking-down',
        name: 'Walking down',
        note: 'The same pattern at frets 4-7, 3-6, 2-5 and 1-4. Stop where it stops being comfortable.',
        tab: line([4, 3, 2, 1].flatMap((p) => chromaticUpDown(p)), 8, 'e'),
        check: { kind: 'notes' },
      },
    ],
  },
  {
    id: 'tech-permutations-1',
    title: 'Finger Permutations: Starting with 1',
    hand: 'fretting',
    level: 2,
    skill: 'independence',
    mode: 'ladder',
    tempo: { start: 50, step: 5, goal: 110 },
    teaches: ['finger independence', 'permutations', 'control'],
    summary: 'The six finger orders that start with finger 1: the spider shuffled, so every finger learns to move on its own.',
    steps: [
      'The six orders that start with finger 1: 1-2-3-4, 1-2-4-3, 1-3-2-4, 1-3-4-2, 1-4-2-3, 1-4-3-2.',
      'Frets 5 to 8, one finger per fret. Play each order four times on one string.',
      'Then each order once on every string from 6 to 1. Eighth notes.',
    ],
    feel: 'Each finger moves alone while the others wait, relaxed, just above their frets. The hard orders sound as even as the easy ones.',
    mistakes: [
      { watch: 'other fingers lifting high while one finger plays', fix: 'Leave the fingers you are not using resting lightly on the string. They come up only when it is their turn.' },
      { watch: 'slowing down on the hard orders', fix: 'Set the tempo by your hardest order, not your easiest. Slow and even beats fast and lumpy.' },
    ],
    parts: permutationParts([1]),
  },
  {
    id: 'tech-permutations-2',
    title: 'Finger Permutations: Starting with 2',
    hand: 'fretting',
    level: 3,
    skill: 'independence',
    mode: 'ladder',
    tempo: { start: 50, step: 5, goal: 110 },
    teaches: ['finger independence', 'permutations', 'control'],
    summary: 'The six finger orders that start with finger 2, where the hand has to reach back as well as forward.',
    steps: [
      'The six orders that start with finger 2: 2-1-3-4, 2-1-4-3, 2-3-1-4, 2-3-4-1, 2-4-1-3, 2-4-3-1.',
      'Frets 5 to 8, one finger per fret. Each order four times on one string, then once on every string.',
    ],
    feel: 'The jumps backward (2 to 1, 4 to 1) feel as calm as the steps forward. The waiting fingers stay soft.',
    mistakes: [
      { watch: 'other fingers lifting high', fix: 'Keep the waiting fingers resting lightly on the string until their turn.' },
      { watch: 'tension in the fingers that are waiting', fix: 'Stop and shake out. Then play so softly that a buzz just appears, and build back up.' },
    ],
    parts: permutationParts([2]),
  },
  {
    id: 'tech-permutations-3-4',
    title: 'Finger Permutations: Starting with 3 and 4',
    hand: 'fretting',
    level: 4,
    skill: 'independence',
    mode: 'ladder',
    tempo: { start: 50, step: 5, goal: 110 },
    teaches: ['finger independence', 'permutations', 'the weak fingers'],
    summary: 'The last twelve orders, led by the two weakest fingers. With the other two exercises, all 24 orders.',
    steps: [
      'The six orders starting with 3: 3-1-2-4, 3-1-4-2, 3-2-1-4, 3-2-4-1, 3-4-1-2, 3-4-2-1.',
      'The six starting with 4: 4-1-2-3, 4-1-3-2, 4-2-1-3, 4-2-3-1, 4-3-1-2, 4-3-2-1.',
      'Frets 5 to 8. Each order four times on one string, then once across the strings.',
    ],
    feel: 'Fingers 3 and 4 work as two separate fingers, each landing on its own fret with a curved tip.',
    mistakes: [
      { watch: 'finger 4 collapsing', fix: 'Play the little finger on its tip, curved. If it collapses, slow down until it can stay curved.' },
      { watch: 'fingers 3 and 4 moving together', fix: 'Practise 3-4-3-4 slowly on one string, keeping the other finger still each time.' },
    ],
    parts: permutationParts([3, 4]),
  },
  {
    id: 'tech-anchored-fingers',
    title: 'Anchored Fingers',
    hand: 'fretting',
    level: 4,
    skill: 'independence',
    mode: 'ladder',
    tempo: { start: 50, step: 5, goal: 100 },
    teaches: ['finger independence', 'holding notes', 'chord-melody preparation'],
    summary: 'Hold two fingers down while the other two move: the independence that chord melody and fingerstyle need.',
    steps: [
      'Fingers 1 and 2 press frets 5 and 6 on the lower string of a pair (string 6 to begin with) and stay there.',
      'Fingers 3 and 4 alternate frets 7 and 8 on the next string up (string 5).',
      'Then hold 3 and 4 down on the higher string and move 1 and 2 on the lower one.',
      'Repeat on every pair of neighbouring strings, from 6-5 to 2-1.',
    ],
    feel: 'The anchored fingers stay quietly in place, without squeezing, while the moving pair taps out an even pattern.',
    mistakes: [
      { watch: 'the anchored fingers lifting', fix: 'Play the anchored note at the start of each bar (it is in the tab): if it does not ring, the anchor lifted.' },
      { watch: 'squeezing with the thumb to compensate', fix: 'Let the thumb hang loose. If the anchored notes buzz, move them closer to their frets instead.' },
      { watch: 'an ache at the base of fingers 3 and 4: work for 30 seconds at a time and stop at any ache, since this exercise strains hands that push it', fix: 'Play one string pair (two bars), rest, then the next. Stop for the day at any ache.' },
    ],
    strain: { text: 'Holding fingers down while others move can build tension. Stop and shake out if the hand tires.', maxMinutes: 8 },
    parts: [{ id: 'every-pair', name: 'Every pair of strings', tab: anchored(), check: { kind: 'notes' } }],
  },
  {
    id: 'tech-legato-chains',
    title: 'Hammer and Pull Chains',
    hand: 'fretting',
    level: 3,
    skill: 'legato',
    mode: 'ladder',
    tempo: { start: 60, step: 4, goal: 120 },
    teaches: ['legato', 'hammer-ons and pull-offs', 'finger strength'],
    summary: 'Pick once per string and let the fretting hand do the rest: smooth, flowing legato.',
    steps: [
      'Pick only the first note on each string.',
      'Going up: frets 5, 7 and 8 with fingers 1, 3 and 4, hammering 7 and 8.',
      'Coming down: pick fret 8, then pull off to 7 and to 5.',
      'Across all six strings and back, in triplets. Every note equally loud.',
    ],
    feel: 'A smooth, singing line where you cannot hear which notes were picked. Hammers land fast and close to the fret; pulls flick the string slightly sideways.',
    mistakes: [
      { watch: 'hammered notes much quieter than picked ones', fix: 'Hammer with speed, from just above the string, right behind the fret. Speed makes it loud, not pressure.' },
      { watch: 'pull-offs that just lift the finger instead of plucking', fix: 'Pull the finger slightly down toward the floor as it leaves the string, as if plucking it.' },
    ],
    parts: [{ id: 'up-and-down', name: 'Up and down', tab: legatoChains(), check: { kind: 'notes' } }],
  },
  {
    id: 'tech-trills',
    title: 'Trills',
    hand: 'fretting',
    level: 4,
    skill: 'legato',
    mode: 'ladder',
    tempo: { start: 60, step: 4, goal: 120 },
    teaches: ['trills', 'endurance', 'finger strength'],
    summary: 'Fast hammer-on and pull-off between two fingers, for strength and stamina in every finger pair.',
    steps: [
      'On string 3 in fifth position, trill each finger pair: 1-2, 1-3, 1-4, 2-3, 2-4, 3-4.',
      'Pick the first note, then hammer and pull alternately. Four notes per beat.',
      'About ten seconds per pair (two bars here), then rest 20 seconds before the next pair.',
    ],
    feel: 'An even, fast flutter between two notes that keeps its volume to the end of the bar.',
    mistakes: [
      { watch: 'the lower finger lifting', fix: 'Keep the lower finger pressed the whole time; only the upper finger moves.' },
      { watch: 'notes dying away after a few repetitions', fix: 'Make each pull-off pluck the string slightly. Re-pick at the start of each bar if it fades.' },
      { watch: 'a tired or aching hand: stop, because trills tire the small hand muscles quickly', fix: 'Stop and rest the hand. Take the 20-second rests seriously; they are part of the exercise.' },
    ],
    strain: { text: 'Trills tire the fingers fast. Rest between pairs and stop if a finger aches.', maxMinutes: 8 },
    parts: ([[1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]] as const).map(([a, b]) => ({
      id: `fingers-${a}-${b}`,
      name: `Fingers ${a} and ${b}`,
      note: `Frets ${FIFTH + a - 1} and ${FIFTH + b - 1}. Then rest 20 seconds before the next pair.`,
      tab: music(trill(a, b), 2),
      check: { kind: 'notes' } as const,
    })),
  },
  {
    id: 'tech-legato-3nps',
    title: 'Three-Notes-per-String Legato',
    hand: 'fretting',
    level: 7,
    skill: 'legato',
    mode: 'ladder',
    tempo: { start: 60, step: 4, goal: 132 },
    teaches: ['legato', 'three notes per string', 'position shifts'],
    summary: 'G major across the neck, three notes per string, picked once per string: fluid, fast scales.',
    steps: [
      'G major, three notes per string, from string 6 fret 3 (G).',
      'Frets 3-5-7 on strings 6 and 5; 4-5-7 on strings 4 and 3; 5-7-8 on strings 2 and 1.',
      'Pick only the first note on each string and hammer the rest; descend with pull-offs.',
      'Triplets: one string per beat.',
    ],
    feel: 'An even, liquid run where every note has the same weight. The hand moves up a fret on strings 4 and 3 and back on strings 2 and 1 without a bump.',
    mistakes: [
      { watch: 'the first note of each string much louder than the rest', fix: 'Pick softer and hammer harder until you cannot tell which note was picked.' },
      { watch: 'letting the hand drift where the pattern moves up a fret on strings 4 and 3', fix: 'Shift the whole hand a fret toward the body at string 4, and back at string 2. Know where the shifts are before you start.' },
    ],
    parts: [{ id: 'g-major', name: 'G major, up and down', tab: legato3nps(), check: { kind: 'notes' } }],
  },
  {
    id: 'tech-hammer-from-nowhere',
    title: 'Hammer-On from Nowhere',
    hand: 'fretting',
    level: 7,
    skill: 'legato',
    mode: 'ladder',
    tempo: { start: 60, step: 4, goal: 112 },
    teaches: ['legato', 'finger strength', 'two-handed playing'],
    summary: 'Sound a note by hammering alone, onto a silent string, with no picked note before it.',
    steps: [
      'Hammer each note onto a silent string, without picking: string 3 fret 7 (D), string 2 fret 8 (G), string 1 fret 5 (A).',
      'Then legato runs that start this way: hammer the high note of each string from nowhere, pull off to the low one.',
      'Mute the strings you are not playing with spare fingers and the picking palm.',
    ],
    feel: 'A firm, ringing note from the hammer alone, as loud as a picked one, with no other strings sounding.',
    mistakes: [
      { watch: 'weak, quiet notes', fix: 'Hammer from a little higher, with a fast, curved finger, landing right behind the fret.' },
      { watch: 'other strings ringing', fix: 'Lay the unused fingers of the fretting hand lightly across the other strings, and rest the picking palm on the low strings.' },
    ],
    parts: [
      {
        id: 'single-notes',
        name: 'Single notes',
        note: 'Every note is hammered, not picked.',
        tab: music(['^"hammer, no pick" q 3:7{3} r 2:8{4} r', 'q 1:5{1} r 3:7{3} r']),
        check: { kind: 'notes' },
      },
      {
        id: 'runs',
        name: 'Runs',
        note: 'The first note on each string is hammered from nowhere; the second is a pull-off.',
        tab: music(['^"hammer, no pick" e 1:8{4} 1:5p 2:8{4} 2:5p 3:7{3} 3:5p 4:7{3} 4:5p', 'e 5:7{3} 5:5p 6:8{4} 6:5p h r']),
        check: { kind: 'notes' },
      },
    ],
  },
  {
    id: 'tech-stretch',
    title: 'Gentle Stretch, Walking Down',
    hand: 'fretting',
    level: 5,
    skill: 'independence',
    mode: 'ladder',
    tempo: { start: 50, step: 5, goal: 90 },
    teaches: ['stretching', 'reach', 'injury prevention'],
    summary: 'Widen your reach gradually: one finger per fret, starting high where frets are close, walking toward the nut.',
    steps: [
      'One finger per fret, 1-2-3-4, starting at frets 9-12 on string 3.',
      'Move down one fret per repetition, all the way to frets 1-4.',
      'The gaps get wider toward the nut: never force. Stop at the first fret that hurts and try again another day.',
    ],
    feel: 'A gentle opening of the hand, never a strain. The thumb moves down the back of the neck with the fingers.',
    mistakes: [
      { watch: 'forcing the stretch', fix: 'Stop at the last position that feels comfortable. Reach grows over weeks, not minutes.' },
      { watch: 'the thumb sliding over the top of the neck', fix: 'Keep the thumb low behind the neck, about opposite finger 2; it lets the fingers open wider.' },
      { watch: 'pain (stop at once)', fix: 'Stop the exercise now. Rest the hand and come back another day, starting higher up the neck.' },
    ],
    strain: { text: 'A stretch must never hurt. Stop at the first fret that does, and keep this to a few minutes.', maxMinutes: 5 },
    parts: [{ id: 'walking-down', name: 'Frets 9-12 to 1-4', tab: stretch(), check: { kind: 'notes' } }],
  },
  {
    id: 'tech-position-shifts',
    title: 'Clean Position Shifts',
    hand: 'fretting',
    level: 4,
    skill: 'shifts',
    mode: 'ladder',
    tempo: { start: 60, step: 4, goal: 112 },
    teaches: ['shifting', 'guide fingers', 'playing up the neck'],
    summary: 'Move the hand up and down the neck without a gap or a squeak, guided by a finger that stays on the string.',
    steps: [
      'Up string 3: fret 2 (A) with finger 1, fret 4 (B) with finger 3.',
      'Glide finger 1 lightly along the string to fret 5 (C), then finger 3 on fret 7 (D), then glide finger 1 to fret 9 (E).',
      'Then back down the same way. Quarters first, then eighths.',
    ],
    feel: 'The hand floats along the string on finger 1, touching but not pressing, and arrives just in time. The notes join without a gap.',
    mistakes: [
      { watch: 'lifting off the string during the shift (a gap)', fix: 'Keep finger 1 touching the string the whole way; lighten the pressure, do not let go.' },
      { watch: 'squeezing during the shift (a squeak)', fix: 'Release almost all pressure while gliding, then press again on arrival.' },
      { watch: 'arriving late', fix: 'Start the shift a little early, at the end of the previous note, so you land on the beat.' },
    ],
    parts: [
      { id: 'quarters', name: 'Quarters', tab: music(['q 3:2{1} 3:4{3} 3:5{1} 3:7{3}', 'q 3:9{1} 3:7{3} 3:5{1} 3:4{3}', 'h. 3:2{1} q r']), check: { kind: 'notes' } },
      { id: 'eighths', name: 'Eighths', tab: music(['e 3:2{1} 3:4{3} 3:5{1} 3:7{3} 3:9{1} 3:7{3} 3:5{1} 3:4{3}', 'h 3:2{1} h r']), check: { kind: 'notes' } },
    ],
  },
  {
    id: 'tech-slide-targets',
    title: 'Slides to a Target',
    hand: 'fretting',
    level: 4,
    skill: 'shifts',
    mode: 'ladder',
    tempo: { start: 60, step: 4, goal: 112 },
    teaches: ['slides', 'accuracy', 'expression'],
    summary: 'Slide to an exact fret, exactly on the beat, with the note ringing all the way.',
    steps: [
      'Slide finger 3 from string 3 fret 7 (D) to fret 9 (E) and back.',
      'Then from string 2 fret 5 (E) to fret 8 (G) and back.',
      'Arrive exactly on the beat, with steady pressure all the way.',
    ],
    feel: 'The note glides and keeps ringing, then sits exactly on the target fret as the click sounds.',
    mistakes: [
      { watch: 'losing pressure mid-slide', fix: 'Keep the same firm pressure as for the starting note during the whole slide.' },
      { watch: 'overshooting the target fret', fix: 'Look at the target fret before you start, and slow the slide down just before you arrive.' },
    ],
    parts: [{ id: 'two-slides', name: 'Two slides', tab: music(['q 3:7{3} 3:9s 3:7s r', 'q 2:5{3} 2:8s 2:5s r']), check: { kind: 'notes' } }],
  },
  {
    id: 'tech-slide-bottleneck',
    title: 'Slide (Bottleneck) Intonation',
    hand: 'fretting',
    level: 7,
    skill: 'shifts',
    mode: 'ladder',
    tempo: { start: 60, step: 5, goal: 90 },
    teaches: ['slide guitar', 'intonation', 'muting'],
    summary: 'With a bottleneck there are no frets: you place every note in tune yourself, right over the wire.',
    steps: [
      'Wear the slide on finger 3 or 4.',
      'Touch the strings lightly, directly over the fret wire, not between frets.',
      'Mute behind the slide with the fingers trailing it.',
      'On string 1, play each target fretted first, then with the slide: fret 12 (E), fret 10 (D), fret 7 (B) and fret 5 (A).',
    ],
    feel: 'The slide note sounds exactly like the fretted one before it: in tune, sweet, with no buzz and no noise behind the slide.',
    mistakes: [
      { watch: 'pressing the strings down to the frets', fix: 'Let the slide rest on the strings with only its own weight. If it clicks on the frets, you are pressing.' },
      { watch: 'slide placed between frets (flat)', fix: 'Line the slide up with the fret wire itself. The microphone check shows how many cents you were off.' },
      { watch: 'noise behind the slide', fix: 'Let one or two fingers behind the slide lightly touch the strings.' },
    ],
    parts: [
      {
        id: 'four-targets',
        name: 'Four targets',
        note: 'Each target fretted first, then with the slide.',
        tab: music(['^"fretted, then slide" h 1:12 1:12', 'h 1:10 1:10', 'h 1:7 1:7', 'h 1:5 1:5']),
        check: { kind: 'notes', intonation: true },
      },
    ],
  },
];
