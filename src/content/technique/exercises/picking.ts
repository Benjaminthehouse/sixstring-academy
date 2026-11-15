/** Picking hand: the pick, alternate picking, sweeps, strumming and muting. */
import { alternate, chromaticUpDown, line, mark, measures, music, times, tok, toks, type TabNote } from '../generate';
import type { TechniqueExercise } from '../types';

const n = (s: number, f: number | 'x', tech?: string): TabNote => ({ s, f, tech });

/** The open strings, `perString` strokes each, in the given string order, alternately picked. */
function openLine(strings: readonly number[], perString: number): TabNote[] {
  return alternate(strings.flatMap((s) => Array.from({ length: perString }, () => n(s, 0))));
}

/** G major, first position, two octaves (the plan's fifteen notes). */
const G_MAJOR_FIRST: TabNote[] = [
  n(6, 3), n(5, 0), n(5, 2), n(5, 3), n(4, 0), n(4, 2), n(4, 4), n(3, 0), n(3, 2), n(2, 0), n(2, 1), n(2, 3), n(1, 0), n(1, 2), n(1, 3),
];

/** G major three notes per string from string 6 fret 3, as in the legato exercise. */
export const G_MAJOR_3NPS: TabNote[] = [
  n(6, 3), n(6, 5), n(6, 7), n(5, 3), n(5, 5), n(5, 7), n(4, 4), n(4, 5), n(4, 7),
  n(3, 4), n(3, 5), n(3, 7), n(2, 5), n(2, 7), n(2, 8), n(1, 5), n(1, 7), n(1, 8),
];

/** A minor pentatonic box 1 (frets 5-8), low to high. */
export const A_MINOR_BOX_1: TabNote[] = [n(6, 5), n(6, 8), n(5, 5), n(5, 7), n(4, 5), n(4, 7), n(3, 5), n(3, 7), n(2, 5), n(2, 8), n(1, 5), n(1, 8)];

function scaleG(): string {
  const down = [...G_MAJOR_FIRST].reverse().slice(1, -1); // 1:2 ... 5:0
  const notes = alternate([...G_MAJOR_FIRST, ...down, n(6, 3)]);
  const t = toks(notes);
  const bars = measures(t.slice(0, 24), 8, 'e');
  bars.push(`e ${t.slice(24, 28).join(' ')} h ${t[28]}`);
  return music(bars);
}

function economy(): string {
  const strokesUp = ['dn', 'up', 'dn'];
  const strokesDown = ['up', 'dn', 'up'];
  const up = G_MAJOR_3NPS.map((x, i) => mark(x, strokesUp[i % 3]));
  const down = [...G_MAJOR_3NPS].reverse().map((x, i) => mark(x, strokesDown[i % 3]));
  return line([...up, ...down], 12, 'e3');
}

function crossing(low: TabNote, high: TabNote): string[] {
  const a = Array.from({ length: 4 }, () => [tok(mark(low, 'dn')), tok(mark(high, 'up'))]).flat();
  const b = Array.from({ length: 4 }, () => [tok(mark(high, 'dn')), tok(mark(low, 'up'))]).flat();
  return [`e ${a.join(' ')}`, `e ${b.join(' ')}`];
}

function skips(): string {
  const pairs: Array<[number, number]> = [[6, 4], [5, 3], [4, 2], [3, 1]];
  const frets = (s: number): number[] => A_MINOR_BOX_1.filter((x) => x.s === s).map((x) => x.f as number);
  const up = pairs.flatMap(([a, b]) => [...frets(a).map((f) => n(a, f)), ...frets(b).map((f) => n(b, f))]);
  const down = [...pairs].reverse().flatMap(([a, b]) => [...[...frets(b)].reverse().map((f) => n(b, f)), ...[...frets(a)].reverse().map((f) => n(a, f))]);
  return line(alternate([...up, ...down]), 8, 'e');
}

export const PICKING: TechniqueExercise[] = [
  {
    id: 'tech-pick-grip',
    title: 'Holding the Pick',
    hand: 'picking',
    level: 1,
    skill: 'alternate-picking',
    mode: 'ladder',
    tempo: { start: 60, step: 4, goal: 80 },
    teaches: ['pick grip', 'downstrokes', 'wrist motion'],
    summary: 'A relaxed grip and a small wrist motion: the start of every picked note you will play.',
    steps: [
      'Hold the pick between the pad of your thumb and the side of your index finger, near its last joint (the one closest to the tip).',
      'Let only 2 to 3 mm of the pick show past your fingers.',
      'Play downstrokes on the open low E string (string 6), one per beat, for four bars.',
      'Then one bar each on strings 5, 4, 3, 2 and 1.',
      'Move from the wrist, as if shaking a drop of water off your fingertips, not from the elbow.',
    ],
    feel: 'Each note sounds full and the same as the last. The pick stays where you put it and your hand barely moves.',
    mistakes: [
      { watch: 'gripping too tightly', fix: 'Hold it just firmly enough that a friend could pull it out with a little effort. Squeeze only at the moment of the stroke if you must.' },
      { watch: 'too much pick showing', fix: 'Choke up until only the tip shows. Less pick means less to drag through the string.' },
      { watch: 'moving from the elbow', fix: 'Rest your forearm on the guitar’s edge and let the motion start at the wrist.' },
      { watch: 'the pick turning in the fingers', fix: 'Angle the pick very slightly so it slices through the string rather than hitting it flat.' },
    ],
    parts: [
      {
        id: 'downstrokes',
        name: 'Downstrokes',
        note: 'Four bars on string 6, then one bar on each of strings 5 to 1.',
        tab: music([...times(`q ${times('6:0{dn}', 4).join(' ')}`, 4), ...[5, 4, 3, 2, 1].map((s) => `q ${times(`${s}:0{dn}`, 4).join(' ')}`)]),
        check: { kind: 'notes' },
      },
    ],
  },
  {
    id: 'tech-alternate-open',
    title: 'Alternate Picking on Open Strings',
    hand: 'picking',
    level: 1,
    skill: 'alternate-picking',
    mode: 'ladder',
    tempo: { start: 60, step: 4, goal: 120 },
    teaches: ['alternate picking', 'subdivisions', 'steady time'],
    summary: 'Down, up, down, up on the open strings: the motion behind fast, even picking.',
    steps: [
      'Down-up eighth notes on the open high E string (string 1) for two bars.',
      'Then one bar on each string down to string 6, and back up to string 1.',
      'Strictly alternate: a downstroke on every beat, an upstroke on every "and".',
      'When the eighths are easy, try the triplets (down-up-down, up-down-up) and then the sixteenths.',
    ],
    feel: 'A small, even, pendulum-like motion. Downstrokes and upstrokes sound equally loud and the notes sit exactly between the clicks.',
    mistakes: [
      { watch: 'two downstrokes in a row', fix: 'Say "down, up" out loud for a bar. The hand never skips a direction, even when you change strings.' },
      { watch: 'big pick movements', fix: 'Aim to move the pick tip no more than a few millimetres past the string in each direction.' },
      { watch: 'the hand speeding up between clicks', fix: 'Count the eighths out loud, "one and two and", and drop the tempo until the clicks and the "ones" land together.' },
    ],
    parts: [
      {
        id: 'eighths',
        name: 'Eighths',
        note: 'Two bars on string 1, then one bar per string down to 6 and back.',
        tab: line(openLine([1, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1], 8), 8, 'e'),
        check: { kind: 'notes' },
      },
      {
        id: 'triplets',
        name: 'Triplets',
        note: 'Three strokes per beat: down-up-down, up-down-up.',
        tab: line(openLine([1, 2, 3, 4, 5, 6], 12), 12, 'e3'),
        check: { kind: 'notes' },
      },
      {
        id: 'sixteenths',
        name: 'Sixteenths',
        note: 'Four strokes per beat. Keep the motion as small as for the eighths.',
        tab: line(openLine([1, 2, 3, 4, 5, 6], 16), 16, 's', 2),
        check: { kind: 'onsets' },
      },
    ],
  },
  {
    id: 'tech-strum-constant',
    title: 'Constant Strumming Motion',
    hand: 'picking',
    level: 2,
    skill: 'strumming',
    mode: 'ladder',
    tempo: { start: 60, step: 4, goal: 100 },
    teaches: ['strumming', 'constant motion', 'groove'],
    summary: 'The hand never stops: down on every beat, up on every "and", touching the strings only where the pattern says.',
    steps: [
      'Hold E minor (022000).',
      'Move the hand down on every beat and up on every "and", whether or not it touches the strings.',
      'The pattern: down (1), down (2), up (and), miss (3), up (and), down (4), up (and).',
      'Eight bars on E minor, then eight on G (320003).',
    ],
    feel: 'Like a clock pendulum: the arm swings evenly all the time, and the missed strokes are just swings that skip the strings. The groove comes from that steady swing.',
    mistakes: [
      { watch: 'stopping the hand on the missed strokes', fix: 'Keep swinging and simply pull the hand a little away from the strings for the miss on beat 3.' },
      { watch: 'strumming from the elbow', fix: 'Let the motion come from the wrist and forearm turning, like turning a doorknob.' },
      { watch: 'upstrokes hitting all six strings hard', fix: 'Upstrokes only need the top three or four strings. Brush them lightly.' },
    ],
    parts: [
      {
        id: 'em-then-g',
        name: 'E minor, then G',
        tab: `${music(['"Em=022000" e D r D U r U D U', ...times('%', 7), '"G=320003" e D r D U r U D U', ...times('%', 7)])}`,
        check: { kind: 'onsets' },
      },
    ],
  },
  {
    id: 'tech-strum-accuracy',
    title: 'Strum Only the Right Strings',
    hand: 'picking',
    level: 2,
    skill: 'strumming',
    mode: 'ladder',
    tempo: { start: 60, step: 4, goal: 96 },
    teaches: ['strumming accuracy', 'bass strings', 'clean chords'],
    summary: 'Start each strum on the right string, so D sounds like D and not like a muddy D over a low E.',
    steps: [
      'D (xx0232): strum strings 4 to 1 only.',
      'A (x02220): strum strings 5 to 1.',
      'E (022100): strum all six.',
      'Two bars of each, cycling D, A, E. Aim the first downstroke at the chord’s lowest string.',
    ],
    feel: 'Each chord sounds clear and different: D light and bright, A fuller, E deep. No low rumble under D.',
    mistakes: [
      { watch: 'hitting the open string 6 under a D chord', fix: 'Start the stroke with the pick resting on string 4. Slow down until you can feel where it starts.' },
      { watch: 'looking at the picking hand instead of listening', fix: 'Close your eyes for a bar and listen for the low E. Your ears will steer your hand.' },
    ],
    parts: [
      {
        id: 'd-a-e',
        name: 'D, A, E',
        tab: music(['"D=xx0232" q D D D D', '%', '"A=x02220" q D D D D', '%', '"E=022100" q D D D D', '%']),
        check: { kind: 'onsets' },
      },
    ],
  },
  {
    id: 'tech-subdivisions',
    title: 'Subdivision Switch',
    hand: 'picking',
    level: 3,
    skill: 'strumming',
    mode: 'ladder',
    tempo: { start: 60, step: 4, goal: 100 },
    teaches: ['subdivision', 'rhythm control', 'counting'],
    summary: 'Two, three and four strums per beat against the same click, switching without stopping.',
    steps: [
      'On E minor (022000), with the click on every quarter note.',
      'Two bars each: quarters (1 per beat), eighths (2), triplets (3), sixteenths (4).',
      'Then come back down: triplets, eighths, quarters. Never stop the hand.',
      'Count out loud: "one", "one and", "one and a", "one e and a".',
    ],
    feel: 'The beat stays exactly where it is while the hand speeds up or slows down around it. The first strum of every beat lands on the click.',
    mistakes: [
      { watch: 'triplets drifting into eighths', fix: 'Say "tri-po-let" on every beat. Triplets feel rounder and rolling; eighths feel square.' },
      { watch: 'speeding up on the sixteenths', fix: 'Make the strokes smaller, not faster-feeling. Check that each "one" still lands on the click.' },
    ],
    parts: [
      {
        id: 'up-and-down',
        name: 'Quarters to sixteenths',
        tab: music([
          '"Em=022000" q D D D D', '%',
          `e ${times('D U', 4).join(' ')}`, '%',
          `e3 ${times('D U', 6).join(' ')}`, '%',
          `s ${times('D U', 8).join(' ')}`, '%',
          `e3 ${times('D U', 6).join(' ')}`, '%',
          `e ${times('D U', 4).join(' ')}`, '%',
          'q D D D D', '%',
        ]),
        check: { kind: 'onsets' },
      },
    ],
  },
  {
    id: 'tech-palm-mute',
    title: 'Palm Muting',
    hand: 'picking',
    level: 3,
    skill: 'muting',
    mode: 'ladder',
    tempo: { start: 80, step: 8, goal: 128 },
    teaches: ['palm muting', 'rock rhythm', 'tone control'],
    summary: 'The chunky, controlled sound of rock rhythm: the edge of the hand lightly on the strings by the bridge.',
    steps: [
      'Rest the edge of your picking hand (the side of the palm) on the strings right where they leave the bridge saddle.',
      'Downstroke eighths on E5 (022xxx): two bars muted, two bars open.',
      'Move the hand 1 cm toward the neck for a heavier mute, then back.',
    ],
    feel: 'Muted, the chord turns into a tight, percussive "chug" that still has pitch. Open, it rings out. Your hand rests, it does not press.',
    mistakes: [
      { watch: 'muting so far toward the neck that the pitch disappears', fix: 'Slide the hand back toward the bridge until you hear the notes again under the chug.' },
      { watch: 'lifting the hand on accents', fix: 'Keep the palm in contact and make accents with a slightly stronger stroke instead.' },
      { watch: 'a burning forearm: all-downstroke speed comes from a loose wrist, not more force; stop and shake the arm out', fix: 'Stop as soon as the forearm burns. Shake it out, then play the next pass softer and from the wrist.' },
    ],
    strain: { text: 'Fast downstrokes can make the forearm burn. Stop and shake it out the moment it does.', maxMinutes: 8 },
    parts: [
      {
        id: 'muted-open',
        name: 'Muted, then open',
        note: 'P.M. marks the muted bars.',
        tab: music([
          `"E5=022xxx" e ${times('(6:0 5:2 4:2){pm dn}', 8).join(' ')}`, '%',
          `e ${times('(6:0 5:2 4:2){dn}', 8).join(' ')}`, '%',
        ]),
        check: { kind: 'onsets' },
      },
    ],
  },
  {
    id: 'tech-alternate-chromatic',
    title: 'Alternate Picking: Chromatic',
    hand: 'picking',
    level: 2,
    skill: 'alternate-picking',
    mode: 'ladder',
    tempo: { start: 60, step: 4, goal: 120 },
    teaches: ['alternate picking', 'synchronising both hands', 'string changes'],
    summary: 'Four frets, four fingers, strict down-up picking across all six strings: both hands together.',
    steps: [
      'Frets 5-6-7-8 with fingers 1-2-3-4 on string 6, then on each string up to string 1.',
      'Come back with 8-7-6-5 on each string from 1 to 6.',
      'One note per pick stroke, strictly down-up, starting with a down.',
      'Eighths first; the sixteenths when the eighths feel easy at the same tempo.',
    ],
    feel: 'The pick and the fingers move like one machine: each finger lands just as the pick strikes. Every note is the same length.',
    mistakes: [
      { watch: 'restarting with a downstroke on every string', fix: 'Keep the alternation running through the string change. Here every string has four notes, so each new string happens to start with a down; in a scale it will not, so never restart on purpose.' },
      { watch: 'pick strokes much larger than needed', fix: 'Keep the pick close to the strings. A smaller stroke is a faster stroke.' },
    ],
    parts: [
      { id: 'eighths', name: 'Eighths', tab: line(alternate(chromaticUpDown(5)), 8, 'e'), check: { kind: 'notes' } },
      { id: 'sixteenths', name: 'Sixteenths', tab: line(alternate(chromaticUpDown(5, false)), 16, 's', 2), check: { kind: 'notes' } },
    ],
  },
  {
    id: 'tech-alternate-scale-g',
    title: 'Alternate Picking: G Major, Two Octaves',
    hand: 'picking',
    level: 4,
    skill: 'alternate-picking',
    mode: 'ladder',
    tempo: { start: 60, step: 4, goal: 132 },
    teaches: ['scales', 'alternate picking', 'string crossing'],
    summary: 'A real scale with strict alternate picking, across strings with two and three notes each.',
    steps: [
      'G major in first position, two octaves: from string 6 fret 3 (G) up to string 1 fret 3 (G), and back down.',
      'Eighth notes, strictly alternate: down, up, down, up, even where a string has only two notes.',
      'Lift each finger as the next note sounds, so open strings do not ring over it.',
    ],
    feel: 'An unbroken string of even notes. The string changes are invisible in the sound.',
    mistakes: [
      { watch: 'losing alternation at string changes', fix: 'Play just the two notes around one string change, down-up, over and over, then put it back into the scale.' },
      { watch: 'open strings ringing over the next note', fix: 'When you leave an open string, touch it lightly with the next fretting finger or the picking palm.' },
    ],
    parts: [{ id: 'two-octaves', name: 'Two octaves', tab: scaleG(), check: { kind: 'notes' } }],
  },
  {
    id: 'tech-string-crossing',
    title: 'String Crossing Both Ways',
    hand: 'picking',
    level: 4,
    skill: 'alternate-picking',
    mode: 'ladder',
    tempo: { start: 60, step: 4, goal: 120 },
    teaches: ['string crossing', 'pick escape', 'alternate picking'],
    summary: 'Two notes on two strings, picked both ways round: the hardest moment in alternate picking, isolated.',
    steps: [
      'Pattern A: string 3 fret 5 (C) with a downstroke, then string 2 fret 5 (E) with an upstroke. One bar.',
      'Pattern B: C with an upstroke and E with a downstroke. One bar.',
      'Then the same on strings 2 and 1, and on strings 4 and 3, all at fret 5.',
      'Practise both: each makes the pick get out of the way of the next string in a different direction.',
    ],
    feel: 'The pick hops cleanly from one string to the other without touching anything in between. Both patterns sound alike.',
    mistakes: [
      { watch: 'catching the wrong string', fix: 'Slow right down and watch the pick tip once: it should arc just clear of the string it is leaving.' },
      { watch: 'one pattern much weaker than the other', fix: 'Spend twice as long on the weak one. Most players find one of them awkward at first.' },
      { watch: 'a tense, locked wrist', fix: 'Shake out the hand, then play the pattern very quietly: quiet playing forces a loose wrist.' },
    ],
    parts: [
      {
        id: 'three-pairs',
        name: 'Three string pairs',
        note: 'A then B on strings 3-2, 2-1 and 4-3.',
        tab: music([...crossing(n(3, 5), n(2, 5)), ...crossing(n(2, 5), n(1, 5)), ...crossing(n(4, 5), n(3, 5))], 2),
        check: { kind: 'notes' },
      },
    ],
  },
  {
    id: 'tech-economy-picking',
    title: 'Economy Picking',
    hand: 'picking',
    level: 7,
    skill: 'sweep',
    mode: 'ladder',
    tempo: { start: 60, step: 4, goal: 132 },
    teaches: ['economy picking', 'efficient motion', 'three notes per string'],
    summary: 'Alternate picking on each string, but one sweeping stroke wherever you cross to the next string in the same direction.',
    steps: [
      'G major, three notes per string, from string 6 fret 3, with the fingering of the three-notes-per-string legato exercise.',
      'Going up: down-up-down on each string. Cross to the next string by continuing that last downstroke: one motion plays both notes.',
      'Going down: up-down-up on each string, continuing the upstroke across the change.',
      'Triplets: one string per beat.',
    ],
    feel: 'Each string change feels like the pick falls through to the next string by itself. The rhythm stays perfectly even across it.',
    mistakes: [
      { watch: 'two separate strokes where one sweep is meant', fix: 'Play only the last note of one string and the first of the next, with one push of the pick, until it feels like one gesture.' },
      { watch: 'uneven note lengths at the sweep', fix: 'The sweep tends to rush. Stay with the triplet count and let the second note wait for its turn.' },
    ],
    parts: [{ id: 'g-major', name: 'G major, up and down', tab: economy(), check: { kind: 'notes' } }],
  },
  {
    id: 'tech-sweep-three-string',
    title: 'Sweep Picking: Three Strings',
    hand: 'picking',
    level: 7,
    skill: 'sweep',
    mode: 'ladder',
    tempo: { start: 50, step: 5, goal: 120 },
    teaches: ['sweep picking', 'muting', 'arpeggios'],
    summary: 'One stroke down, one stroke up, one note per string, every note separate: arpeggios at speed.',
    steps: [
      'A minor: string 3 fret 14 (A), string 2 fret 13 (C), string 1 fret 12 (E) in one downstroke, then back in one upstroke.',
      'Then C: string 3 fret 12 (G), string 2 fret 13 (C), string 1 fret 12 (E).',
      'Triplets. The last note of each group is held for the rest of the beat.',
      'Each note must stop as the next sounds: lift each finger just after its note.',
    ],
    feel: 'Like a single note moving across the strings, not a strum. You hear separate, even notes and never two at once.',
    mistakes: [
      { watch: 'notes ringing together like a strummed chord', fix: 'Roll each fingertip off its string as soon as the next note sounds. Practise the down sweep alone very slowly.' },
      { watch: 'separate strokes instead of one sweep', fix: 'Rest the pick on the next string after each note, then push through it. The pick never leaves the strings during the sweep.' },
      { watch: 'rushing the first note', fix: 'Start the sweep on the click and let each note take its full triplet.' },
    ],
    parts: [
      {
        id: 'am-c',
        name: 'A minor, then C',
        tab: music([
          `e3 ${times('3:14{dn} 2:13{dn} 1:12{dn} 2:13{up} 3:14{up} 3:-', 2).join(' ')}`,
          `e3 ${times('3:12{dn} 2:13{dn} 1:12{dn} 2:13{up} 3:12{up} 3:-', 2).join(' ')}`,
        ]),
        check: { kind: 'notes' },
      },
    ],
  },
  {
    id: 'tech-sweep-five-string',
    title: 'Sweep Picking: Five Strings',
    hand: 'picking',
    level: 9,
    skill: 'sweep',
    mode: 'ladder',
    tempo: { start: 50, step: 5, goal: 120 },
    teaches: ['sweep picking', 'arpeggios', 'muting with both hands'],
    summary: 'A two-octave A minor arpeggio in one stroke each way, with a hammer-on at the top.',
    steps: [
      'A minor across five strings: string 5 fret 12 (A), string 4 fret 14 (E), string 3 fret 14 (A), string 2 fret 13 (C), string 1 fret 12 (E), in one downstroke.',
      'Hammer to string 1 fret 17 (A), pull back off to fret 12, then sweep back down in one upstroke.',
      'Sextuplets: six notes per beat.',
      'Mute behind you with both hands: the picking palm on the strings you have left, the fretting fingers lifting off.',
    ],
    feel: 'A smooth, even cascade of notes up and back, two octaves in two beats, with no note ringing into the next.',
    mistakes: [
      { watch: 'the two notes at fret 14 ringing together', fix: 'Play strings 4 and 3 at fret 14 with one finger rolling from its pad to its tip, so only one note sounds at a time.' },
      { watch: 'unequal timing between strings', fix: 'Practise at a tempo where you can count the six notes. Even beats slow is worth more than uneven fast.' },
      { watch: 'string noise from the unused strings', fix: 'Let the picking palm trail behind the pick and rest on string 6 throughout.' },
    ],
    strain: { text: 'The barre rolling across strings 4 and 3 is a big reach at fret 14. Keep the thumb loose and stop if your wrist aches.', maxMinutes: 10 },
    parts: [
      {
        id: 'am-arpeggio',
        name: 'A minor, two octaves',
        tab: music([`s6 ${times('5:12{dn} 4:14{dn} 3:14{dn} 2:13{dn} 1:12{dn} 1:17h 1:12p 2:13{up} 3:14{up} 4:14{up} 5:12{up} 5:-', 2).join(' ')}`]),
        check: { kind: 'notes' },
      },
    ],
  },
  {
    id: 'tech-string-skipping',
    title: 'String Skipping',
    hand: 'picking',
    level: 6,
    skill: 'alternate-picking',
    mode: 'ladder',
    tempo: { start: 60, step: 4, goal: 120 },
    teaches: ['string skipping', 'wide intervals', 'muting'],
    summary: 'Jump over a string with strict alternate picking, and keep the skipped string silent.',
    steps: [
      'Octaves first: string 6 fret 5 (A) to string 4 fret 7 (A), then string 5 fret 5 (D) to string 3 fret 7 (D), alternate picking.',
      'Then A minor pentatonic box 1 on the string pairs 6-4, 5-3, 4-2 and 3-1, skipping the string between, and back down.',
    ],
    feel: 'Wide, singing intervals with nothing in between. The pick moves in a small arc over the skipped string.',
    mistakes: [
      { watch: 'the skipped string ringing', fix: 'The fretting finger playing the lower note lies lightly across the skipped string and silences it.' },
      { watch: 'the pick arcing too high over the skipped string', fix: 'Keep the arc just high enough to clear one string. Watch it once in a mirror.' },
    ],
    parts: [
      {
        id: 'octaves',
        name: 'Octaves',
        tab: music([`e ${times('6:5{dn} 4:7{up}', 4).join(' ')}`, `e ${times('5:5{dn} 3:7{up}', 4).join(' ')}`]),
        check: { kind: 'notes' },
      },
      { id: 'pentatonic', name: 'Pentatonic skips', tab: skips(), check: { kind: 'notes' } },
    ],
  },
  {
    id: 'tech-tremolo-picking',
    title: 'Tremolo Picking',
    hand: 'picking',
    level: 6,
    skill: 'alternate-picking',
    mode: 'ladder',
    tempo: { start: 60, step: 6, goal: 144 },
    teaches: ['tremolo picking', 'endurance', 'relaxed speed'],
    summary: 'Fast, constant alternate picking on one note: endurance with a loose arm.',
    steps: [
      'Constant alternate picking on one note: the open string 1, then string 2 fret 5 (E, the same pitch on another string).',
      'Sixteenths up the ladder. Thirty-seconds only at half the ladder tempo or less.',
      'Change notes on the beat without breaking the motion.',
    ],
    feel: 'A shimmering, even buzz of notes. The forearm stays soft; only the wrist flutters.',
    mistakes: [
      { watch: 'tension in the forearm', fix: 'Stop every 20 seconds, shake out, and start again more quietly. Speed comes from small motion, not effort.' },
      { watch: 'the motion stopping at note changes', fix: 'Change string with the hand still moving. Practise the change bar alone.' },
      { watch: 'uneven volume', fix: 'Hold the pick a little more loosely and use less pick past your fingers.' },
      { watch: 'a burning or cramping forearm: stop at once; work in 30-second bursts with rests between', fix: 'Stop at once and rest. From then on, 30 seconds of tremolo, 30 seconds of rest.' },
    ],
    strain: { text: 'Fast picking can tighten the forearm. Keep bursts short and stop if it aches.', maxMinutes: 8 },
    parts: [
      {
        id: 'sixteenths',
        name: 'Sixteenths',
        note: 'Whole bars on one note, then a change every two beats, then every beat.',
        tab: music([
          `s ${times('1:0', 16).join(' ')}`,
          `s ${times('2:5', 16).join(' ')}`,
          `s ${[...times('1:0', 8), ...times('2:5', 8)].join(' ')}`,
          `s ${[...times('1:0', 4), ...times('2:5', 4), ...times('1:0', 4), ...times('2:5', 4)].join(' ')}`,
        ], 2),
        check: { kind: 'onsets' },
      },
      {
        id: 'thirty-seconds',
        name: 'Thirty-seconds',
        note: 'At half the ladder tempo: the click is half as fast, the strokes as fast as the sixteenths.',
        tempoScale: 0.5,
        tab: music([`/32 ${times('1:0', 32).join(' ')}`, `/32 ${times('2:5', 32).join(' ')}`], 1),
        check: { kind: 'none', why: 'At thirty-seconds the strokes come faster than the microphone can count them. Use your ears: even and relaxed.' },
      },
    ],
  },
  {
    id: 'tech-picking-hand-mute',
    title: 'Picking-Hand Muting of the Low Strings',
    hand: 'picking',
    level: 5,
    skill: 'muting',
    mode: 'ladder',
    tempo: { start: 60, step: 4, goal: 120 },
    teaches: ['muting', 'clean single notes', 'noise control'],
    summary: 'Keep the low strings silent while you play up high, so single notes sound clean, especially with distortion.',
    steps: [
      'Play single notes on strings 1 to 3 while the side of your picking palm rests on strings 4 to 6, keeping them silent.',
      'Then play the whole pentatonic box and move the palm with the notes: it always covers the strings below the one you play.',
    ],
    feel: 'Only the note you pick sounds. Stop picking and touch nothing: there should be silence, not a low hum.',
    mistakes: [
      { watch: 'the low strings ringing in sympathy', fix: 'Let the palm rest a little more heavily on the low strings, close to the bridge.' },
      { watch: 'the palm muting the string being played', fix: 'Roll the hand slightly so the palm touches only the strings below the one you pick.' },
    ],
    parts: [
      {
        id: 'treble',
        name: 'Strings 1 to 3',
        tab: line(alternate([...A_MINOR_BOX_1.slice(6), ...[...A_MINOR_BOX_1.slice(6)].reverse(), ...A_MINOR_BOX_1.slice(6), ...[...A_MINOR_BOX_1.slice(6)].reverse()]), 12, 'e3'),
        check: { kind: 'notes' },
      },
      {
        id: 'whole-box',
        name: 'The whole box',
        note: 'Move the palm as the notes move to the lower strings.',
        tab: line(alternate([...A_MINOR_BOX_1, ...[...A_MINOR_BOX_1].reverse()]), 12, 'e3'),
        check: { kind: 'notes' },
      },
    ],
  },
  {
    id: 'tech-rasgueado',
    title: 'Rasgueado Basics',
    hand: 'picking',
    level: 6,
    skill: 'strumming',
    mode: 'ladder',
    tempo: { start: 52, step: 4, goal: 112 },
    teaches: ['rasgueado', 'flamenco strumming', 'finger independence'],
    summary: 'The flamenco fan: four fingers flicked out one after another, then an upstroke.',
    steps: [
      'Close your hand loosely, the fingertips resting against the thumb.',
      'Flick out the little finger (written c or e), then a, m and i, downward across the strings one after another.',
      'Then an upstroke with i.',
      'Count c, a, m and i as four sixteenths (one beat) and put the upstroke on the next beat. On E (022100), then Am (x02210).',
    ],
    feel: 'A quick, rolling burst of four separate strums, like a short drum roll, then a light upstroke. The wrist stays still; only the fingers move.',
    mistakes: [
      { watch: 'all fingers flicking at once (one stroke instead of four)', fix: 'Do it slowly on a table first: each finger flicks out only after the one before has gone.' },
      { watch: 'the wrist moving instead of the fingers', fix: 'Rest the thumb on string 6 as an anchor while you practise. It keeps the wrist still.' },
      { watch: 'scraping strokes', fix: 'Strike with the nail side of the finger, moving through the strings, not along them.' },
      { watch: 'an aching wrist or back of the hand: flick from the finger joints with the wrist loose, and keep the first sessions short', fix: 'Stop for today. Next time keep the wrist floppy, flick only from the finger joints, and play for a few minutes at most.' },
    ],
    strain: { text: 'Rasgueado can make the wrist or the back of the hand ache. Keep the first sessions short.', maxMinutes: 5 },
    parts: [
      {
        id: 'e-then-am',
        name: 'E, then Am',
        note: 'c a m i down, then i up.',
        tab: music(['"E=022100" s D D D D q U s D D D D q U', '"Am=x02210" s D D D D q U s D D D D q U']),
        check: { kind: 'onsets' },
      },
    ],
  },
];

