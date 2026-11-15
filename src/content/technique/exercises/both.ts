/** Both hands together: synchronisation, time feel, speed, tapping and scales in every key. */
import { scalePatterns } from '@/core/guitar';
import { LOW_TO_HIGH, alternate, fingerOrder, line, music, times, toks, type TabNote } from '../generate';
import type { ExercisePart, TechniqueExercise } from '../types';

/** Major keys round the circle of fifths, as the plan orders them. */
export const MAJOR_KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'] as const;
/** Melodic minor keys in the same order, spelled as minor keys usually are (C♯ and G♯ for D♭ and A♭). */
export const MELODIC_MINOR_KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'Eb', 'Bb', 'F'] as const;

/** Two octaves, root to root, three notes per string from the root on string 6 (the engine's 3nps pattern 1). */
export function twoOctaves3nps(tonic: string, scale: 'major' | 'melodic-minor'): TabNote[] {
  const pattern = scalePatterns(tonic, scale, { system: '3nps' }).find((p) => p.id === '3nps-1');
  if (!pattern) throw new RangeError(`No 3nps pattern for ${tonic} ${scale}`);
  return pattern.notes.slice(0, 15).map((x) => ({ s: x.string, f: x.fret }));
}

/** Tokens in sixteenths, the last bar filled with rests. */
function sixteenths(tokens: string[]): string {
  const bars: string[] = [];
  for (let i = 0; i < tokens.length; i += 16) {
    const chunk = tokens.slice(i, i + 16);
    let text = `s ${chunk.join(' ')}`;
    const left = 16 - chunk.length;
    if (left > 0) {
      const rest = left % 4 === 0 ? { 4: 'q r', 8: 'h r', 12: 'h. r' }[left] : undefined;
      text += ` ${rest ?? times('r', left).join(' ')}`;
    }
    bars.push(text);
  }
  return music(bars, 2);
}

/** Up two octaves and back, ending on a held root (two bars of sixteenths). */
function scaleRun(notes: TabNote[]): string {
  const down = [...notes].reverse().slice(1, -1);
  const t = toks(alternate([...notes, ...down]));
  const last = toks([notes[0]])[0];
  return music([`s ${t.slice(0, 16).join(' ')}`, `s ${t.slice(16, 28).join(' ')} q ${last}`], 2);
}

/** The scale in thirds, up and back. */
function thirds(notes: TabNote[]): string {
  const up: TabNote[] = [];
  for (let i = 0; i + 2 < notes.length; i++) up.push(notes[i], notes[i + 2]);
  const rev = [...notes].reverse();
  const down: TabNote[] = [];
  for (let i = 0; i + 2 < rev.length; i++) down.push(rev[i], rev[i + 2]);
  return sixteenths(toks(alternate([...up, ...down])));
}

const keyLabel = (tonic: string): string => tonic.replace('#', '♯').replace(/^([A-G])b/, '$1♭');

function allKeysParts(): ExercisePart[] {
  const out: ExercisePart[] = [];
  const add = (tonic: string, scale: 'major' | 'melodic-minor'): void => {
    const notes = twoOctaves3nps(tonic, scale);
    const name = `${keyLabel(tonic)} ${scale === 'major' ? 'major' : 'melodic minor'}`;
    const slug = `${tonic.toLowerCase().replace('#', '-sharp').replace(/^([a-g])b$/, '$1-flat')}-${scale}`;
    const key = scale === 'major' ? `${tonic} major` : `${tonic} minor`;
    out.push({ id: slug, name, key, tab: scaleRun(notes), check: { kind: 'notes' } });
    out.push({ id: `${slug}-thirds`, name: `${name} in thirds`, key, tab: thirds(notes), check: { kind: 'notes' } });
  };
  for (const k of MAJOR_KEYS) add(k, 'major');
  for (const k of MELODIC_MINOR_KEYS) add(k, 'melodic-minor');
  return out;
}

let allKeysCache: ExercisePart[] | null = null;

/** Strum pattern bars used against the off-beat clicks. */
const GROOVE = `${music(['"Em=022000" e D r D U r U D U', ...times('%', 3)])}`;

const BURST = '1:8 1:7 1:5 2:8';

export const BOTH: TechniqueExercise[] = [
  {
    id: 'tech-hands-in-sync',
    title: 'Hands in Sync',
    hand: 'both',
    level: 3,
    skill: 'time',
    mode: 'ladder',
    tempo: { start: 40, step: 4, goal: 80 },
    teaches: ['synchronisation', 'clean notes', 'listening'],
    summary: 'Very slowly, the fretting finger lands a moment before the pick strikes: the secret of clean notes at any speed.',
    steps: [
      'The chromatic 1-2-3-4 at frets 5 to 8, across the strings, at a very slow tempo, in eighths.',
      'Each note is fretted just before it is picked.',
      'Listen for a buzz (fretted too late) or a gap (the previous finger lifted too early).',
      'Take a microphone check, then listen back to your take.',
    ],
    feel: 'Every note starts clean and joins the next without a gap. It feels almost too slow; that is what lets you hear everything.',
    mistakes: [
      { watch: 'picking before the finger is down', fix: 'Think "finger, then pick" on every note. At this tempo there is time for both.' },
      { watch: 'lifting the previous finger too early', fix: 'Leave each finger down until the next note sounds, then lift it.' },
    ],
    parts: [{ id: 'across', name: 'Across the strings', tab: line(alternate(LOW_TO_HIGH.flatMap((s) => fingerOrder(s, 5, [1, 2, 3, 4]))), 8, 'e'), check: { kind: 'notes' } }],
  },
  {
    id: 'tech-metronome-2-4',
    title: 'Metronome on 2 and 4',
    hand: 'both',
    level: 5,
    skill: 'time',
    mode: 'ladder',
    tempo: { start: 60, step: 4, goal: 112 },
    teaches: ['time feel', 'swing and groove', 'internal pulse'],
    summary: 'Let the click play only the backbeat, or only the off-beats, and feel the rest yourself.',
    steps: [
      'Set the click to sound only on beats 2 and 4 (this exercise does it for you).',
      'Play a strumming pattern against it, feeling beats 1 and 3 yourself.',
      'Then the click sounds only on the "and" of each beat.',
    ],
    feel: 'The click feels like a drummer’s snare on 2 and 4. You are carrying the beat, and the groove swings more than with a click on every beat.',
    mistakes: [
      { watch: 'hearing the click as beat 1', fix: 'Count "one, TWO, three, FOUR" out loud during the count-in and keep counting; the clicks are the loud numbers.' },
      { watch: 'rushing between clicks', fix: 'The gaps are long. Tap your foot on every beat so the silent beats are as present as the clicks.' },
    ],
    parts: [
      { id: 'two-and-four', name: 'Click on 2 and 4', tab: GROOVE, check: { kind: 'onsets' }, click: 'backbeat' },
      { id: 'off-beats', name: 'Click on the "and"', tab: GROOVE, check: { kind: 'onsets' }, click: 'offbeat' },
    ],
  },
  {
    id: 'tech-speed-bursts',
    title: 'Speed Bursts',
    hand: 'both',
    level: 6,
    skill: 'time',
    mode: 'ladder',
    tempo: { start: 80, step: 8, goal: 160 },
    teaches: ['speed building', 'relaxed fast playing', 'short bursts'],
    summary: 'Play a short figure faster than you can, just once, then rest: speed comes from short, relaxed bursts.',
    steps: [
      'A four-note figure: string 1 fret 8 (C), string 1 fret 7 (B), string 1 fret 5 (A), string 2 fret 8 (G).',
      'Set a tempo just above your comfortable top speed.',
      'Play the figure once in sixteenths, rest a beat; then twice in a row, rest; then four times.',
      'Afterwards, return to your comfortable tempo and notice how easy it feels.',
    ],
    feel: 'The bursts are short and loose, almost thrown. Back at your normal tempo, everything feels slower and easier than before.',
    mistakes: [
      { watch: 'bursting with tension instead of loose hands', fix: 'Shake out before each burst. If a burst is tense, it is too fast: drop the tempo one step.' },
      { watch: 'playing long bursts before short ones are clean', fix: 'Stay on the single figure until it is clean at this tempo, then try two.' },
    ],
    strain: { text: 'Playing above your top speed builds tension quickly. Keep this to a few minutes, loose and short.', maxMinutes: 6 },
    parts: [
      {
        id: 'one-two-four',
        name: 'One, two, four figures',
        tab: music([`s ${BURST} q r s ${BURST} ${BURST}`, `q r s ${BURST} ${BURST} ${BURST}`, `s ${BURST} h. r`]),
        check: { kind: 'notes' },
      },
    ],
  },
  {
    id: 'tech-tapping',
    title: 'Tapping Triplets',
    hand: 'both',
    level: 7,
    skill: 'legato',
    mode: 'ladder',
    tempo: { start: 50, step: 5, goal: 120 },
    teaches: ['tapping', 'two-handed technique', 'muting'],
    summary: 'Three notes per pick-free cycle: tap with the picking hand, pull off, hammer on, and round again.',
    steps: [
      'On string 1: tap string 1 fret 12 (E) with the picking-hand middle finger.',
      'Pull off to string 1 fret 5 (A), held by fretting finger 1, then hammer string 1 fret 8 (C) with finger 4.',
      'Triplets, steady. Then the same shape for F (frets 13, 5, 8), G (frets 15, 7, 10) and E (frets 12, 4, 7).',
      'Mute the other strings with both hands.',
    ],
    feel: 'An even, rolling stream of three notes per beat, all equally loud, with total silence from the other strings.',
    mistakes: [
      { watch: 'the tap too weak to sound', fix: 'Tap with a quick, firm finger, right behind the fret, like a hammer-on from the other hand.' },
      { watch: 'the pull-off not plucking the string', fix: 'Pull the tapping finger slightly sideways off the string, toward the floor, so it plucks.' },
      { watch: 'open strings ringing', fix: 'Rest the side of the picking palm on the low strings and let fretting finger 1 lie lightly across the others.' },
    ],
    parts: [
      {
        id: 'four-chords',
        name: 'Am, F, G, E',
        note: 'T = tap with the picking hand.',
        tab: music([
          `"Am" e3 ${times('1:12t 1:5p 1:8h', 4).join(' ')}`,
          `"F" e3 ${times('1:13t 1:5p 1:8h', 4).join(' ')}`,
          `"G" e3 ${times('1:15t 1:7p 1:10h', 4).join(' ')}`,
          `"E" e3 ${times('1:12t 1:4p 1:7h', 4).join(' ')}`,
        ]),
        check: { kind: 'notes' },
      },
    ],
  },
  {
    id: 'tech-odd-meters',
    title: 'Odd Meters: 5/4 and 7/8',
    hand: 'both',
    level: 7,
    skill: 'time',
    mode: 'ladder',
    tempo: { start: 60, step: 6, goal: 120 },
    teaches: ['odd meters', 'beat grouping', 'counting'],
    summary: 'Five beats and seven eighths that feel natural: grouped into threes and twos, counted aloud.',
    steps: [
      '5/4 counted 1 2 3 4 5 and grouped 3+2: accents on beats 1 and 4. Strum E minor (022000) on every beat for 8 bars.',
      'Then group it 2+3: accents on beats 1 and 3.',
      '7/8 counted in eighths and grouped 2+2+3: accents on 1, 3 and 5, on A minor (x02210). Then 3+2+2.',
      'Count aloud. The click sounds every quarter note in 5/4 and every eighth note in 7/8, so the ladder counts that pulse.',
    ],
    feel: 'The bar stops feeling "one too long" or "one too short" and starts to lilt: long, short, long. The accents fall where you count them.',
    mistakes: [
      { watch: 'adding or dropping a beat at the bar line', fix: 'Count every number aloud, including the last one before the bar line, and accent the 1 a little more.' },
      { watch: 'letting 5/4 turn into a bar of 4/4 and a pause', fix: 'Strum on beat 5 as firmly as on the others; it is a real beat, not a breath.' },
      { watch: 'accents drifting away from the start of each group', fix: 'Say the groups instead of numbers: "one-two-three one-two" for 3+2. The accent is always on "one".' },
    ],
    parts: [
      { id: 'five-three-two', name: '5/4 as 3+2', time: '5/4', tab: music(['"Em=022000" q D D D D D', '%', '%', '%', '%', '%', '%', '%']), check: { kind: 'onsets' }, click: { unit: 'quarter', groups: [3, 2] } },
      { id: 'five-two-three', name: '5/4 as 2+3', time: '5/4', tab: music(['"Em=022000" q D D D D D', '%', '%', '%', '%', '%', '%', '%']), check: { kind: 'onsets' }, click: { unit: 'quarter', groups: [2, 3] } },
      { id: 'seven-two-two-three', name: '7/8 as 2+2+3', time: '7/8', pulse: 'eighth', tab: music(['"Am=x02210" e D D D D D D D', '%', '%', '%', '%', '%', '%', '%']), check: { kind: 'onsets' }, click: { unit: 'eighth', groups: [2, 2, 3] } },
      { id: 'seven-three-two-two', name: '7/8 as 3+2+2', time: '7/8', pulse: 'eighth', tab: music(['"Am=x02210" e D D D D D D D', '%', '%', '%', '%', '%', '%', '%']), check: { kind: 'onsets' }, click: { unit: 'eighth', groups: [3, 2, 2] } },
    ],
  },
  {
    id: 'tech-all-keys-scales',
    title: 'Scales in Every Key, Full Neck',
    hand: 'both',
    level: 10,
    skill: 'time',
    mode: 'ladder',
    tempo: { start: 80, step: 4, goal: 160 },
    teaches: ['scales in all keys', 'full-neck fluency', 'concert-level maintenance'],
    summary: 'All 12 major and all 12 melodic minor scales, three notes per string, round the circle of fifths, then in thirds.',
    steps: [
      'Major keys in this order: C G D A E B F♯ D♭ A♭ E♭ B♭ F. Melodic minor in the same order, with C♯ and G♯ for D♭ and A♭.',
      'Three notes per string from the root on string 6, two octaves up and back, in sixteenth notes.',
      'The melodic minor is played the same way up and down (the jazz form); the classical form comes down as the natural minor.',
      'Picking players alternate-pick; classical players alternate i-m, and a-m on a second pass.',
      'Then the same scales in thirds. Say or think every note name, spelled for its key: F♯ major has E♯, not F.',
    ],
    feel: 'Every key feels like home. Hard keys go at the same tempo as easy ones, and your hand never tightens.',
    mistakes: [
      { watch: 'speeding up on easy keys and slowing on hard ones', fix: 'Set the tempo by your hardest key and play every key at that tempo.' },
      { watch: 'losing the spelling in sharp and flat keys', fix: 'Turn on note names on the fretboard and say each one as you play it, slowly, once per key.' },
      { watch: 'tension creeping in above 120', fix: 'Above 120, stop after each key and shake out. Tension is a sign to stay at the lower tempo for now.' },
    ],
    strain: { text: 'Long scale sessions at high tempos tire both hands. Take a break between majors and minors.', maxMinutes: 20 },
    get parts(): ExercisePart[] {
      allKeysCache ??= allKeysParts();
      return allKeysCache;
    },
  },
];
