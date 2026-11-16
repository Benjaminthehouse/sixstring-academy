/** Chords: barre strength, fretting-hand muting, one-minute changes and barre changes. */
import { music, pairLabel, times } from '../generate';
import type { ChordPair, ExercisePart, TechniqueExercise } from '../types';

/** Shapes used here, low string first. */
const SHAPES: Record<string, string> = {
  Em: '022000',
  G: '320003',
  A: 'x02220',
  D: 'xx0232',
  A7: 'x02020',
  E7: '020100',
  C: 'x32010',
  G7: '320001',
  D7: 'xx0212',
  Am: 'x02210',
  E: '022100',
  Dm: 'xx0231',
  B7: 'x21202',
  Fmaj7: 'xx3210',
  F: 'xx3211',
  'F-barre': '133211',
  Bm7: 'x20202',
  'F#m': 'xx4222',
};

/** A pair of chords; `variant` tells two pairs with the same chords apart ("small", "barre"). */
function pair(a: string, b: string, tip: string, opts: { id?: string; variant?: string } = {}): ChordPair {
  const sym = (k: string): string => (k === 'F-barre' ? 'F' : k);
  const out: ChordPair = { id: opts.id ?? `${a}-${b}`.toLowerCase().replace(/#/g, '-sharp'), a: { symbol: sym(a), shape: SHAPES[a] }, b: { symbol: sym(b), shape: SHAPES[b] }, tip };
  if (opts.variant) out.variant = opts.variant;
  return out;
}

/** One bar alternating the two chords, a strum on every beat. */
function pairPart(p: ChordPair): ExercisePart {
  const A = `"${p.a.symbol}=${p.a.shape}"`;
  const B = `"${p.b.symbol}=${p.b.shape}"`;
  return {
    id: p.id,
    name: pairLabel(p, ' and '),
    note: p.tip,
    tab: music(times(`q ${A} D ${B} D ${A} D ${B} D`, 2)),
    check: { kind: 'none', why: 'Count your clean changes yourself: your hands are busy, so the screen asks for the number at the end of the minute.' },
  };
}

const PAIRS_1: ChordPair[] = [
  pair('Em', 'G', 'Play Em with fingers 1 and 2: then finger 1 can stay on string 5 fret 2 as an anchor for G.'),
  pair('A', 'D', 'Finger 3 slides along string 2 from fret 2 to fret 3: keep it touching the string.'),
  pair('D', 'A7', 'Lift all three fingers together and place the A7 as one shape.'),
  pair('A', 'E7', 'Finger 2 goes to string 5 fret 2 and finger 1 to string 3 fret 1: move them at the same moment.'),
  pair('Em', 'D', 'Look at where finger 3 lands on string 2 before you start.'),
];
const PAIRS_2: ChordPair[] = [
  pair('G', 'C', 'Start the move with the finger that goes to string 5 fret 3, and let the others follow.'),
  pair('C', 'G7', 'Fingers 2 and 3 keep their shape and move over one string toward string 6; finger 1 hops from string 2 to string 1.'),
  pair('G', 'D7', 'D7 (xx0212) is a small triangle on the top three strings: aim for it as one shape, not finger by finger.'),
  pair('D', 'G', 'Finger 3 on string 2 fret 3 is the hinge: it moves to string 1 fret 3.'),
  pair('C', 'Am', 'Fingers 1 and 2 stay where they are (anchors); only finger 3 moves, from string 5 to string 3.'),
  pair('Am', 'E', 'The same shape moved one string toward string 6: keep the fingers together and move them across.'),
  pair('Am', 'Dm', 'Watch finger 1: it moves from string 2 to string 1, staying at fret 1.'),
  pair('E', 'B7', 'Finger 2 stays on string 5 fret 2 as an anchor.'),
  pair('D', 'Bm7', 'Bm7 (x20202) stands in for Bm until barre chords: three fingers at fret 2, on strings 5, 3 and 1, with strings 4 and 2 ringing open.'),
];
const PAIRS_3: ChordPair[] = [
  pair('Am', 'Fmaj7', 'Finger 1 stays on string 2 fret 1; finger 2 goes to string 3 fret 2 and finger 3 to string 4 fret 3.'),
  pair('C', 'F', 'The small F (xx3211): finger 1 stays at fret 1 and flattens over strings 2 and 1; fingers 2 and 3 each move over one string.', { variant: 'small' }),
  pair('Em', 'Am', 'The same pair of fingers moves over one string toward string 1, and finger 1 adds string 2 fret 1.'),
  pair('Em', 'B7', 'Finger 2 stays on string 5 fret 2 as an anchor.'),
  pair('D', 'F#m', 'The small F♯m (xx4222): finger 1 stays at fret 2 and lies flat across strings 3 to 1; finger 3 moves from string 2 fret 3 to string 4 fret 4.', { id: 'd-f-sharp-m', variant: 'small' }),
  pair('C', 'F-barre', 'The full barre F: lay finger 1 across fret 1 just as the other fingers land.', { id: 'c-f-barre', variant: 'barre' }),
];

const CHANGES_STEPS = [
  'Pick a pair. Strum once per beat and change chord on every beat for 60 seconds.',
  'Count the clean changes: a change is clean when every note of the new chord rings on its beat.',
  'At the end of the minute, enter your count. The screen keeps your best count for every pair.',
];

const CHANGES_MISTAKES = {
  landing: { watch: 'fingers landing one at a time', fix: 'Lift all the fingers together and put them down together, as one shape. Practise the shape in the air above the strings.' },
};

function changes(id: string, title: string, level: number, pairs: ChordPair[], tempo: { start: number; step: number; goal: number }, teaches: string[], mistakes: TechniqueExercise['mistakes'], summary: string, extra?: Partial<TechniqueExercise>): TechniqueExercise {
  return {
    id,
    title,
    hand: 'fretting',
    level,
    skill: 'chords',
    mode: 'changes',
    tempo,
    teaches,
    summary,
    steps: CHANGES_STEPS,
    feel: 'At first the minute feels long and the count is low; that is normal. Within days the hand starts to "know" the shape and the number climbs.',
    mistakes,
    pairs,
    parts: pairs.map(pairPart),
    ...extra,
  };
}

export const CHORDS: TechniqueExercise[] = [
  {
    id: 'tech-barre-strength',
    title: 'Barre Strength Without Strain',
    hand: 'fretting',
    level: 5,
    skill: 'chords',
    mode: 'ladder',
    tempo: { start: 60, step: 5, goal: 90 },
    teaches: ['barre chords', 'efficient pressure', 'injury prevention'],
    summary: 'A clean barre from arm weight and good placement, not from squeezing.',
    steps: [
      'Lay finger 1 flat across all six strings at fret 5.',
      'Pick each string from 6 to 1. For any dead string, roll the finger slightly onto its bony side and move it closer to the fret wire.',
      'Then press for two beats and release (without lifting) for two beats, eight times.',
      'Move to fret 3, then fret 1, where it is hardest.',
    ],
    feel: 'Every string rings with surprisingly little effort. The pull comes from the arm hanging back, and the thumb is relaxed.',
    mistakes: [
      { watch: 'squeezing with the thumb instead of using arm weight', fix: 'Let your elbow hang and pull back gently; the thumb only rests behind the neck.' },
      { watch: 'the barre finger flat on its soft pad', fix: 'Roll the finger a little toward the headstock, onto its harder, bony edge.' },
      { watch: 'holding the barre for minutes', fix: 'Release between attempts. The press-and-release part is designed so you never hold for long.' },
      { watch: 'a sore thumb, hand or forearm: stop and rest, because a clean barre comes from placement and arm weight, not from squeezing harder', fix: 'Stop and rest. Next time move the finger closer to the fret and let the arm hang, rather than pressing harder.' },
    ],
    strain: { text: 'Long barre work strains the hand and thumb. Release often, and stop at five minutes or at the first ache.', maxMinutes: 5 },
    parts: [
      {
        id: 'each-string',
        name: 'Every string rings',
        note: 'Fret 5, then fret 3, then fret 1.',
        tab: music([5, 3, 1].flatMap((f) => [`q 6:${f} 5:${f} 4:${f} 3:${f}`, `q 2:${f} 1:${f} h r`])),
        check: { kind: 'notes' },
      },
      {
        id: 'press-release',
        name: 'Press and release',
        note: 'Two beats pressed, two beats released but still touching. Eight times.',
        tab: music(['^"press, then release" h (6:5 5:5 4:5 3:5 2:5 1:5) h r', ...times('h (6:5 5:5 4:5 3:5 2:5 1:5) h r', 7)]),
        check: { kind: 'none', why: 'This part is about pressure, not notes: feel how little you need, and release fully on the rests.' },
      },
    ],
  },
  {
    id: 'tech-fretting-mute',
    title: 'Fretting-Hand Muting',
    hand: 'fretting',
    level: 5,
    skill: 'muting',
    mode: 'ladder',
    tempo: { start: 60, step: 4, goal: 120 },
    teaches: ['muting', 'clean power chords', 'noise control'],
    summary: 'Silence the strings you do not want with the fretting fingers, so you can strum hard and only the right notes sound.',
    steps: [
      'Play E5 (022xxx): strings 6, 5 and 4.',
      'Let the underside of the fretting fingers lightly touch strings 3 to 1, so a full six-string strum sounds only the power chord.',
      'Then stop the chord by releasing pressure while keeping the fingers in contact: short, clipped chords.',
    ],
    feel: 'You strum all six strings with abandon and hear only a tight power chord. The stops are clean and silent, with no ringing open strings.',
    mistakes: [
      { watch: 'open strings ringing under power chords', fix: 'Flatten finger 1 a little so its underside rests on the higher strings.' },
      { watch: 'lifting fingers off completely to stop a note', fix: 'Release just enough pressure for the string to leave the fret; the fingers stay touching to silence it.' },
    ],
    parts: [
      {
        id: 'full-strum',
        name: 'Strum all six',
        note: 'Strings 3 to 1 are muted (x) by the fretting fingers.',
        tab: music(times(`"E5=022xxx" e ${times('(6:0 5:2 4:2 3:x 2:x 1:x){dn}', 8).join(' ')}`, 2)),
        check: { kind: 'onsets' },
      },
      {
        id: 'stops',
        name: 'Stop by releasing',
        note: 'Short chords: release pressure on every rest, fingers still touching.',
        tab: music(times(`"E5=022xxx" e ${times('(6:0 5:2 4:2){st dn} r', 4).join(' ')}`, 2)),
        check: { kind: 'onsets' },
      },
    ],
  },
  changes(
    'tech-changes-pairs-1',
    'One-Minute Changes: First Chords',
    2,
    PAIRS_1,
    { start: 40, step: 4, goal: 60 },
    ['chord-change speed', 'moving fingers as a group', 'open chords'],
    [
      CHANGES_MISTAKES.landing,
      { watch: 'stopping the beat to fix a chord', fix: 'Keep strumming on the beat even if the chord is not ready. Your hand learns to arrive on time.' },
      { watch: 'looking for the next shape too late', fix: 'Start moving to the next chord on the last moment of the current beat, not after the strum.' },
    ],
    'Sixty seconds, one change per beat, and a number to beat: the fastest way to make first chords automatic.',
  ),
  changes(
    'tech-changes-pairs-2',
    'One-Minute Changes: Three-Chord Keys',
    3,
    PAIRS_2,
    { start: 40, step: 4, goal: 72 },
    ['chord-change speed', 'anchor fingers', 'open chords'],
    [
      { watch: 'ignoring the anchor fingers', fix: 'Find the finger that stays (or slides along its string) in each pair, and keep it down through the change.' },
      { watch: 'tension building over the minute', fix: 'Breathe out on every change and check your shoulders halfway through.' },
    ],
    'The changes of three-chord songs in G, C, A minor and E, with the anchor fingers that make them easy.',
  ),
  changes(
    'tech-changes-pairs-3',
    'One-Minute Changes: F and Friends',
    4,
    PAIRS_3,
    { start: 40, step: 4, goal: 64 },
    ['chord-change speed', 'first barre changes', 'minor-key changes'],
    [
      { watch: 'the barre collapsing on the change', fix: 'Place the barre finger slightly before the others and roll it onto its bony edge.' },
      { watch: 'arriving late on the F', fix: 'Start leaving the C a moment early. A slightly early F is better than a late one.' },
    ],
    'The first F chords and the minor-key changes, ending with the full barre F.',
    { strain: { text: 'The full barre F is hard on the hand at first. Rest between minutes and stop at the first ache.', maxMinutes: 6 } },
  ),
  {
    id: 'tech-changes-barre',
    title: 'Barre Change Speed',
    hand: 'fretting',
    level: 6,
    skill: 'chords',
    mode: 'ladder',
    tempo: { start: 50, step: 5, goal: 90 },
    teaches: ['barre chords', 'shifting shapes', 'chord-change speed'],
    summary: 'Move barre shapes along the neck in time: F, B♭, C and D minor.',
    steps: [
      'F (133211) to B♭ (x13331) to C (x35553) to Dm (x-5-7-7-6-5).',
      'First change every two beats, then every beat.',
      'Keep finger 1 lightly in contact with the strings as it slides between frets.',
    ],
    feel: 'The hand relaxes between chords and grips only as each strum lands. The barre glides rather than jumps.',
    mistakes: [
      { watch: 'releasing the whole hand between chords', fix: 'Release the pressure, not the contact: the fingers keep touching the strings as the hand moves.' },
      { watch: 'the barre arriving after the strum', fix: 'Move on the "and" before the beat, so the shape is ready when the strum comes.' },
    ],
    strain: { text: 'Barre chords in a row tire the hand. Rest every few minutes and stop if your thumb or wrist aches.', maxMinutes: 6 },
    parts: [
      { id: 'every-two-beats', name: 'Every two beats', tab: music(['"F=133211" q D D "Bb=x13331" D D', '"C=x35553" q D D "Dm=x-5-7-7-6-5" D D']), check: { kind: 'onsets' } },
      { id: 'every-beat', name: 'Every beat', tab: music(times('"F=133211" q D "Bb=x13331" D "C=x35553" D "Dm=x-5-7-7-6-5" D', 2)), check: { kind: 'onsets' } },
    ],
  },
];
