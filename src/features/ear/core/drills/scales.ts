/**
 * Scales and modes, always from the same tonic and up to its octave, so the tonic is never in
 * doubt. Modes that share notes with another scale (D Dorian and C major) are therefore told apart
 * by their sound from the tonic, and no level offers two names for one sound (never "Ionian or major").
 */
import { formatDegree, getScale } from '@/core/theory';
import { buildChoice, noteLabel, placeNote } from '../question';
import { melodic } from '../sound';
import type { DrillDef, LevelDef, OptionInfo } from '../types';

const LABELS: Record<string, [label: string, name: string, alias?: string]> = {
  major: ['Major', 'major', 'Ionian'],
  minor: ['Natural minor', 'natural minor', 'Aeolian'],
  'major-pentatonic': ['Major pentatonic', 'major pentatonic'],
  'minor-pentatonic': ['Minor pentatonic', 'minor pentatonic'],
  'minor-blues': ['Blues', 'the blues scale'],
  dorian: ['Dorian', 'Dorian'],
  phrygian: ['Phrygian', 'Phrygian'],
  lydian: ['Lydian', 'Lydian'],
  mixolydian: ['Mixolydian', 'Mixolydian'],
  locrian: ['Locrian', 'Locrian'],
  'harmonic-minor': ['Harmonic minor', 'harmonic minor'],
  'melodic-minor': ['Melodic minor', 'melodic minor'],
};

/** Label, name and formula of a scale answer. */
export function scaleInfo(id: string): OptionInfo {
  const scale = getScale(id);
  const [label, name, alias] = LABELS[id] ?? [scale?.name ?? id, scale?.name ?? id];
  const formula = scale ? scale.degrees.map((d) => formatDegree(d)).join(' ') : '';
  return { id, label, name, detail: alias ? `${alias} · ${formula}` : formula };
}

/** Semitones above the tonic of a scale, closed with the octave. */
export function scaleSteps(id: string): number[] {
  const scale = getScale(id);
  if (!scale) throw new RangeError(`unknown scale ${id}`);
  return [...scale.semitones, 12];
}

function level(n: number, title: string, pool: string[], blurb?: string): LevelDef {
  return {
    n,
    title,
    blurb: blurb ?? pool.map((id) => scaleInfo(id).label).join(' · '),
    pool,
    questions: pool.length > 6 ? 8 : 10,
    make(ctx) {
      const { rng } = ctx;
      const tonic = placeNote(rng, ctx.settings, 45, 57);
      const plan = (id: string) => melodic(scaleSteps(id).map((s) => tonic + s), { gap: 0.32, dur: 0.6, tail: 0.8 });
      const options = pool.map((id) => ({ ...scaleInfo(id), plan: plan(id) }));
      return buildChoice({
        drill: 'scales',
        level: n,
        ctx,
        prompt: 'Which scale was that?',
        options,
        canSlow: true,
        canSpread: false,
        keyName: `Tonic ${noteLabel(tonic, 'flats')}`,
        truth: { tonic, steps: scaleSteps(ctx.answer), scale: ctx.answer },
      });
    },
  };
}

const MODES = ['major', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'minor', 'locrian'];

/** The scales-and-modes drill. */
export const scalesDrill: DrillDef = {
  id: 'scales',
  title: 'Scales and modes',
  trains: 'The colour of a whole scale: what makes Dorian sound like Dorian.',
  icon: 'Waypoints',
  prompt: 'Which scale was that?',
  path: { start: 14, pace: 5.5 },
  levels: [
    level(1, 'Major or minor', ['major', 'minor']),
    level(2, 'The two pentatonics', ['major-pentatonic', 'minor-pentatonic']),
    level(3, 'Five notes or seven', ['major', 'minor', 'major-pentatonic', 'minor-pentatonic']),
    level(4, 'The blues scale', ['major-pentatonic', 'minor-pentatonic', 'minor-blues']),
    level(5, 'Bright modes', ['major', 'lydian', 'mixolydian']),
    level(6, 'Dark modes', ['minor', 'dorian', 'phrygian']),
    level(7, 'All seven modes', MODES, 'Ionian to Locrian'),
    level(8, 'The minors', ['minor', 'dorian', 'harmonic-minor', 'melodic-minor']),
    level(9, 'Everything', [...MODES, 'harmonic-minor', 'melodic-minor', 'major-pentatonic', 'minor-pentatonic', 'minor-blues'], 'Twelve scales and modes'),
  ],
  info: scaleInfo,
  mixSentence: (answer, chosen) => `You often hear ${answer.name} as ${chosen.name}.`,
};
