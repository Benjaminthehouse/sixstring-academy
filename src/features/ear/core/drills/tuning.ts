/**
 * In tune or out: the same note twice, the second possibly detuned. This is tuning by ear: the
 * skill that lets a guitarist hear a string that has slipped before any tuner says so.
 */
import { buildChoice, byDifficulty, placeNote } from '../question';
import { melodic } from '../sound';
import type { DrillDef, LevelDef, OptionInfo } from '../types';

const INFO: Record<string, OptionInfo> = {
  'in-tune': { id: 'in-tune', label: 'In tune', name: 'in tune', detail: 'exactly the same', icon: 'Check' },
  out: { id: 'out', label: 'Out of tune', name: 'out of tune', detail: 'not quite the same', icon: 'X' },
  flat: { id: 'flat', label: 'Flat', name: 'flat', detail: 'a little low', icon: 'ArrowDown' },
  sharp: { id: 'sharp', label: 'Sharp', name: 'sharp', detail: 'a little high', icon: 'ArrowUp' },
};

/** Cents of detune for an answer (`sign` decides the direction of "out of tune"). */
export function centsFor(id: string, cents: number, sign: 1 | -1): number {
  if (id === 'in-tune') return 0;
  if (id === 'flat') return -cents;
  if (id === 'sharp') return cents;
  return sign * cents;
}

function level(n: number, title: string, pool: string[], easy: number, hard: number, prompt: string): LevelDef {
  const blurb = easy === hard ? `Out by ${easy} cents` : `Out by ${hard}–${easy} cents`;
  return {
    n,
    title,
    blurb,
    pool,
    questions: 10,
    make(ctx) {
      const { rng } = ctx;
      const cents = byDifficulty(rng, easy, hard, ctx.difficulty);
      const midi = placeNote(rng, ctx.settings, 50, 69);
      const sign: 1 | -1 = rng.chance() ? 1 : -1;
      // The same pitch twice; the synth's own `cents` detunes the second, so the data is the sound.
      const plan = (id: string) => melodic([midi, midi], { gap: 1.1, dur: 1.4, cents: [0, centsFor(id, cents, sign)] });
      const options = pool.map((id) => ({ ...INFO[id], plan: plan(id) }));
      return buildChoice({ drill: 'tuning', level: n, ctx, prompt, options, canSlow: true, canSpread: false, truth: { midi, cents: centsFor(ctx.answer, cents, sign), size: cents } });
    },
  };
}

/** The tuning drill. */
export const tuningDrill: DrillDef = {
  id: 'tuning',
  title: 'In tune or out',
  trains: 'Hearing a string that is slightly off, before a tuner tells you.',
  icon: 'Gauge',
  prompt: 'Is the second note in tune with the first?',
  path: { start: 5, pace: 6.5 },
  levels: [
    level(1, 'In tune or out?', ['in-tune', 'out'], 50, 50, 'Is the second note in tune with the first?'),
    level(2, 'Flat or sharp?', ['flat', 'sharp'], 50, 35, 'The second note is out of tune. Is it flat or sharp?'),
    level(3, 'Flat, in tune or sharp', ['flat', 'in-tune', 'sharp'], 35, 25, 'Is the second note flat, in tune, or sharp?'),
    level(4, 'Closer', ['flat', 'in-tune', 'sharp'], 20, 15, 'Is the second note flat, in tune, or sharp?'),
    level(5, 'Closer still', ['flat', 'in-tune', 'sharp'], 12, 9, 'Is the second note flat, in tune, or sharp?'),
    level(6, 'The last few cents', ['flat', 'in-tune', 'sharp'], 7, 5, 'Is the second note flat, in tune, or sharp?'),
  ],
  info: (id) => INFO[id] ?? { id, label: id, name: id },
  mixSentence: (answer, chosen) => {
    if (answer.id === 'in-tune') return `When the two notes match, you sometimes hear the second as ${chosen.name}.`;
    if (chosen.id === 'in-tune') return `When the second note is a little ${answer.name}, you often hear it as in tune.`;
    return `You often hear a ${answer.name} note as ${chosen.name}.`;
  },
};
