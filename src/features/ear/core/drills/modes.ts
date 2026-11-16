/**
 * Modes over a drone: a drone holds the tonic (with its fifth) and a phrase in one of the modes
 * plays over it. Against a fixed tonic every mode has its own colour, and the one note that sets a
 * mode apart from its neighbour (Dorian's raised sixth, Lydian's raised fourth) rubs against the
 * drone in its own way. Every option plays the same contour in its own mode, and every phrase
 * sounds all seven degrees, so the notes alone decide the answer.
 */
import { formatDegree, getScale } from '@/core/theory';
import { buildChoice, noteLabel, placeNote } from '../question';
import type { DrillDef, GenContext, LevelDef, OptionInfo, SoundEvent, SoundPlan } from '../types';

const NAMES: Record<string, [label: string, name: string, also?: string]> = {
  major: ['Ionian', 'Ionian', 'major'],
  dorian: ['Dorian', 'Dorian'],
  phrygian: ['Phrygian', 'Phrygian'],
  lydian: ['Lydian', 'Lydian'],
  mixolydian: ['Mixolydian', 'Mixolydian'],
  minor: ['Aeolian', 'Aeolian', 'natural minor'],
  locrian: ['Locrian', 'Locrian'],
};

/** The modes, brightest first. */
export const MODE_IDS = ['lydian', 'major', 'mixolydian', 'dorian', 'minor', 'phrygian', 'locrian'] as const;

/** Degrees of a mode (`1 2 b3 4 5 6 b7`). */
export function modeDegrees(id: string): string[] {
  const scale = getScale(id);
  if (!scale) throw new RangeError(`unknown mode ${id}`);
  return [...scale.degrees];
}

/** Semitones of a mode above its tonic (seven of them). */
export function modeSteps(id: string): number[] {
  const scale = getScale(id);
  if (!scale) throw new RangeError(`unknown mode ${id}`);
  return [...scale.semitones];
}

/** The degrees by which two modes differ, as `[in a, in b]` pairs (Dorian vs Aeolian: `[['6', 'b6']]`). */
export function differingDegrees(a: string, b: string): Array<[string, string]> {
  const da = modeDegrees(a);
  const db = modeDegrees(b);
  return da.flatMap((d, i) => (d === db[i] ? [] : [[d, db[i]] as [string, string]]));
}

/** Label and name of a mode answer. */
export function modeInfo(id: string): OptionInfo {
  const [label, name, also] = NAMES[id] ?? [id, id];
  const formula = modeDegrees(id).map((d) => formatDegree(d)).join(' ');
  return { id, label, name, detail: also ? `${also} · ${formula}` : formula };
}

/**
 * The contour of a phrase as positions 0..7 on the mode (7 = the octave), starting and ending on
 * the tonic. Easy: up the mode and back down. Harder: a tune that still visits every degree.
 */
export function modeContour(ctx: GenContext): number[] {
  const scale = [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1, 0];
  if (ctx.difficulty < 0.45) return scale;
  for (let attempt = 0; attempt < 40; attempt++) {
    const out = [0];
    const length = 11 + ctx.rng.int(0, 3);
    while (out.length < length - 1) {
      const here = out[out.length - 1];
      const moves = [-2, -1, 1, 2].map((d) => here + d).filter((p) => p >= 0 && p <= 7);
      out.push(ctx.rng.pick(moves));
    }
    // Home to the tonic (or its octave) by step, so the phrase resolves over the drone.
    const last = out[out.length - 1];
    out.push(last >= 4 ? 7 : 0);
    const covered = new Set(out.map((p) => p % 7));
    if (covered.size === 7 && Math.abs(out[out.length - 1] - last) <= 2) return out;
  }
  return scale;
}

/** Seconds the drone sounds alone before the phrase: long enough to hear the tonic as home. */
export const DRONE_LEAD = 1.2;

/** The phrase `contour` in mode `id` over a drone on `tonic` (the drone an octave below). */
export function modePlan(id: string, tonic: number, contour: readonly number[], gap: number): SoundPlan {
  const steps = [...modeSteps(id), 12];
  const events: SoundEvent[] = contour.map((pos, i) => ({
    at: DRONE_LEAD + i * gap,
    midis: [tonic + steps[pos]],
    dur: gap * 1.6,
    strike: 'pluck',
    role: 'subject',
    velocity: 0.75,
  }));
  const length = DRONE_LEAD + (contour.length - 1) * gap + 1.4;
  return { events, length, drone: { midi: tonic - 12, from: 0, to: length } };
}

function level(n: number, title: string, pool: string[], blurb?: string): LevelDef {
  return {
    n,
    title,
    blurb: blurb ?? pool.map((id) => modeInfo(id).label).join(' · '),
    pool,
    questions: pool.length > 4 ? 8 : 10,
    make(ctx) {
      const tonic = placeNote(ctx.rng, ctx.settings, 45, 56);
      const contour = modeContour(ctx);
      const gap = ctx.difficulty < 0.45 ? 0.36 : 0.3;
      const options = pool.map((id) => ({ ...modeInfo(id), plan: modePlan(id, tonic, contour, gap) }));
      return buildChoice({
        drill: 'modes',
        level: n,
        ctx,
        prompt: 'Which mode is played over the drone?',
        options,
        canSlow: true,
        canSpread: false,
        keyName: `Drone on ${noteLabel(tonic, 'flats').replace(/\d+$/, '')}`,
        truth: { tonic, drone: tonic - 12, mode: ctx.answer, contour: [...contour] },
      });
    },
  };
}

/** The modes-over-a-drone drill. */
export const modesDrill: DrillDef = {
  id: 'modes',
  title: 'Modes over a drone',
  trains: 'The colour of each mode against a fixed tonic: how modal music is heard.',
  icon: 'Sunrise',
  prompt: 'Which mode is played over the drone?',
  path: { start: 20, pace: 6 },
  levels: [
    level(1, 'Major or minor', ['major', 'minor'], 'Ionian (major) · Aeolian (minor)'),
    level(2, 'Dorian’s bright sixth', ['minor', 'dorian']),
    level(3, 'Mixolydian’s flat seventh', ['major', 'mixolydian']),
    level(4, 'Lydian’s raised fourth', ['major', 'lydian']),
    level(5, 'Phrygian’s flat second', ['minor', 'phrygian']),
    level(6, 'The bright modes', ['lydian', 'major', 'mixolydian']),
    level(7, 'The dark modes', ['dorian', 'minor', 'phrygian']),
    level(8, 'All seven', [...MODE_IDS], 'Lydian to Locrian'),
  ],
  info: modeInfo,
  mixSentence: (answer, chosen) => {
    const diff = differingDegrees(answer.id, chosen.id);
    const listen = diff.length === 1 ? ` Listen for the ${formatDegree(diff[0][0])} against the drone (${chosen.name} has ${formatDegree(diff[0][1])}).` : '';
    return `Over a drone, you often hear ${answer.name} as ${chosen.name}.${listen}`;
  },
};
