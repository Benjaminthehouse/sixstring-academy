/**
 * Playing a lesson sound at normal or slow speed, as pure data: the same events, stretched in
 * time. Slowing a sound must keep chords together and strums strummed, so only the times between
 * events and the ring lengths grow; a strum's own sweep is left to the synth.
 */
import type { SoundEvent, SoundPlan } from '../../sound';

/** How much slower "Slow" plays: two thirds of the tempo. */
export const SLOW_FACTOR = 1.5;

/** A plan at a speed: `1` as written, `SLOW_FACTOR` for the slow button. */
export function stretchPlan(plan: SoundPlan, factor = 1): SoundPlan {
  const f = Number.isFinite(factor) && factor > 0 ? factor : 1;
  if (f === 1) return plan;
  const events: SoundEvent[] = plan.events.map((e) => ({ ...e, at: e.at * f, duration: e.duration * f }));
  // A drone or a held chord stays under the slowed line (it lasts as long as the plan).
  return { ...plan, events, duration: plan.duration * f, tempo: plan.tempo / f };
}

/** True when a slow button makes sense: more than one moment in time (a melody, a rhythm, a strum pattern). */
export function canPlaySlow(plan: SoundPlan): boolean {
  const times = new Set(plan.events.map((e) => Math.round(e.at * 100)));
  return times.size > 1;
}
