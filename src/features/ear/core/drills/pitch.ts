/**
 * Higher or lower, same or different: the very first step. Two notes (three for the contour
 * level); the answer is read straight off their MIDI numbers.
 */
import { buildChoice, byDifficulty, placeNote } from '../question';
import { melodic } from '../sound';
import type { DrillDef, GenContext, LevelDef, OptionInfo, SoundPlan } from '../types';

const INFO: Record<string, OptionInfo> = {
  same: { id: 'same', label: 'Same', name: 'the same note', detail: 'one note, twice', icon: 'Equal' },
  different: { id: 'different', label: 'Different', name: 'two different notes', detail: 'two notes', icon: 'Split' },
  higher: { id: 'higher', label: 'Higher', name: 'higher', detail: 'the second goes up', icon: 'ArrowUp' },
  lower: { id: 'lower', label: 'Lower', name: 'lower', detail: 'the second goes down', icon: 'ArrowDown' },
  'up-up': { id: 'up-up', label: 'Up, up', name: 'up, then up', detail: 'climbs all the way', icon: 'TrendingUp' },
  'up-down': { id: 'up-down', label: 'Up, down', name: 'up, then down', detail: 'a hill', icon: 'ChevronUp' },
  'down-up': { id: 'down-up', label: 'Down, up', name: 'down, then up', detail: 'a valley', icon: 'ChevronDown' },
  'down-down': { id: 'down-down', label: 'Down, down', name: 'down, then down', detail: 'falls all the way', icon: 'TrendingDown' },
};

const GAP = 0.85;
const pair = (a: number, b: number): SoundPlan => melodic([a, b], { gap: GAP, dur: 1.1 });

/** A two-note level. `kinds` are the answers, `min`–`max` the size of a "different" gap in semitones. */
function twoNotes(n: number, title: string, blurb: string, pool: string[], min: number, max: number, prompt: string): LevelDef {
  return {
    n,
    title,
    blurb,
    pool,
    questions: 10,
    make(ctx: GenContext) {
      const { rng } = ctx;
      // The closer the notes, the harder: difficulty walks the gap from the level's widest to its narrowest.
      const gap = Math.max(1, byDifficulty(rng, max, min, ctx.difficulty));
      // Both notes stay between B♭2 and E5, the guitar's middle, whichever way the second goes.
      const first = placeNote(rng, ctx.settings, 46 + gap, 76 - gap);
      const up = rng.chance();
      const second = (id: string): number => {
        if (id === 'same') return first;
        if (id === 'higher') return first + gap;
        if (id === 'lower') return first - gap;
        return first + (up ? gap : -gap); // 'different'
      };
      const options = pool.map((id) => ({ ...INFO[id], plan: pair(first, second(id)) }));
      return buildChoice({ drill: 'pitch', level: n, ctx, prompt, options, canSlow: true, canSpread: false, truth: { first, second: second(ctx.answer), gap } });
    },
  };
}

const CONTOURS = ['up-up', 'up-down', 'down-up', 'down-down'];

const contourLevel: LevelDef = {
  n: 6,
  title: 'Which way did it go?',
  blurb: 'Three notes: follow the shape',
  pool: CONTOURS,
  questions: 10,
  make(ctx) {
    const { rng } = ctx;
    const a = Math.max(1, byDifficulty(rng, 5, 2, ctx.difficulty));
    const b = Math.max(1, byDifficulty(rng, 5, 2, ctx.difficulty));
    const first = placeNote(rng, ctx.settings, 55, 64);
    const notes = (id: string): number[] => {
      const [s1, s2] = id.split('-').map((d) => (d === 'up' ? 1 : -1));
      return [first, first + s1 * a, first + s1 * a + s2 * b];
    };
    const options = CONTOURS.map((id) => ({ ...INFO[id], plan: melodic(notes(id), { gap: 0.7, dur: 0.95 }) }));
    return buildChoice({ drill: 'pitch', level: 6, ctx, prompt: 'Three notes. Which way did the tune go?', options, canSlow: true, canSpread: false, truth: { notes: notes(ctx.answer) } });
  },
};

/** The pitch drill. */
export const pitchDrill: DrillDef = {
  id: 'pitch',
  title: 'Higher or lower',
  trains: 'Telling two notes apart: the first skill of every ear.',
  icon: 'ArrowUpDown',
  prompt: 'Is the second note higher or lower?',
  path: { start: 0, pace: 3 },
  levels: [
    twoNotes(1, 'Same or different', 'Two notes, or one note twice', ['same', 'different'], 5, 12, 'Did you hear the same note twice, or two different notes?'),
    twoNotes(2, 'Big jumps', 'Higher or lower, far apart', ['higher', 'lower'], 7, 12, 'Is the second note higher or lower?'),
    twoNotes(3, 'Smaller steps', 'Higher or lower, a few frets apart', ['higher', 'lower'], 3, 6, 'Is the second note higher or lower?'),
    twoNotes(4, 'Next-door notes', 'Higher or lower, one or two frets apart', ['higher', 'lower'], 1, 2, 'Is the second note higher or lower?'),
    twoNotes(5, 'Higher, lower or the same', 'Three choices, very close notes', ['higher', 'same', 'lower'], 1, 3, 'Higher, lower, or the same note?'),
    contourLevel,
  ],
  info: (id) => INFO[id] ?? { id, label: id, name: id },
  mixSentence: (answer, chosen) => {
    if (answer.id === 'same') return 'When one note is played twice, you sometimes think it changed.';
    if (chosen.id === 'same') return answer.id === 'different' ? 'When the two notes are close, you sometimes hear them as one note.' : `When the second note is a little ${answer.name}, you sometimes hear it as the same note.`;
    if (answer.id.includes('-')) return `You often hear “${answer.name}” as “${chosen.name}”.`;
    return `When the second note goes ${answer.id === 'higher' ? 'up' : 'down'}, you often hear it go ${chosen.id === 'higher' ? 'up' : 'down'}.`;
  },
};
