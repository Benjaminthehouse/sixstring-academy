/**
 * Building and transforming sound plans. Pure data; `engine/player.ts` turns a plan into sound.
 */
import type { SoundEvent, SoundPlan, Strike } from './types';

/** Lowest note any drill sounds: the open low E string (E2). */
export const GUITAR_LOW = 40;
/** Highest note any drill sounds: the 20th fret of the high E string (C6). */
export const GUITAR_HIGH = 84;

/** True when every note is a note a guitar in standard tuning can play. */
export function inGuitarRange(midis: readonly number[]): boolean {
  return midis.every((m) => Number.isInteger(m) && m >= GUITAR_LOW && m <= GUITAR_HIGH);
}

/** Options for {@link melodic}. */
export interface MelodicOptions {
  /** Seconds between note starts (default 0.8). */
  gap?: number;
  /** Seconds each note rings (default gap × 1.4). */
  dur?: number;
  /** Start time of the first note (default 0). */
  start?: number;
  role?: SoundEvent['role'];
  /** Detune per note, cents (same length as the notes). */
  cents?: readonly number[];
  velocity?: number;
  /** Extra ring after the last note before the plan counts as over (default 0.5 s). */
  tail?: number;
}

/** Notes one after another. */
export function melodic(midis: readonly number[], opts: MelodicOptions = {}): SoundPlan {
  const gap = opts.gap ?? 0.8;
  const dur = opts.dur ?? gap * 1.4;
  const start = opts.start ?? 0;
  const events: SoundEvent[] = midis.map((m, i) => ({
    at: start + i * gap,
    midis: [m],
    dur,
    strike: 'pluck',
    role: opts.role ?? 'subject',
    ...(opts.cents && opts.cents[i] ? { cents: opts.cents[i] } : {}),
    ...(opts.velocity !== undefined ? { velocity: opts.velocity } : {}),
  }));
  const last = midis.length ? start + (midis.length - 1) * gap : start;
  return { events, length: last + Math.min(dur, gap) + (opts.tail ?? 0.5) };
}

/** Notes sounding together (a harmonic interval), or a strummed chord. */
export function together(midis: readonly number[], opts: { dur?: number; at?: number; strike?: Strike; strings?: Array<number | null>; role?: SoundEvent['role']; velocity?: number; direction?: 'down' | 'up' } = {}): SoundPlan {
  const dur = opts.dur ?? 2;
  const at = opts.at ?? 0;
  const event: SoundEvent = {
    at,
    midis: [...midis],
    dur,
    strike: opts.strike ?? 'together',
    role: opts.role ?? 'subject',
    ...(opts.strings ? { strings: [...opts.strings] } : {}),
    ...(opts.velocity !== undefined ? { velocity: opts.velocity } : {}),
    ...(opts.direction ? { direction: opts.direction } : {}),
  };
  return { events: [event], length: at + dur + 0.3 };
}

/** Play `b` after `a`, with `gap` seconds of air between them. */
export function joinPlans(a: SoundPlan, b: SoundPlan, gap = 0.4): SoundPlan {
  const offset = a.length + gap;
  const out: SoundPlan = {
    events: [...a.events, ...b.events.map((e) => ({ ...e, at: e.at + offset }))],
    length: offset + b.length,
  };
  const drone = a.drone ?? (b.drone ? { ...b.drone, from: b.drone.from + offset, to: b.drone.to + offset } : undefined);
  if (drone) out.drone = drone;
  if (a.band || b.band) out.band = a.band ?? b.band;
  return out;
}

/** The same plan, stretched in time (`factor` 1.6 = 60 % slower). The pitches do not change. */
export function slower(plan: SoundPlan, factor = 1.6): SoundPlan {
  const f = Math.max(1, factor);
  const out: SoundPlan = {
    events: plan.events.map((e) => ({ ...e, at: e.at * f, dur: e.strike === 'pluck' ? e.dur * f : e.dur })),
    length: plan.length * f,
  };
  if (plan.drone) out.drone = { ...plan.drone, from: plan.drone.from * f, to: plan.drone.to * f };
  if (plan.band) out.band = { ...plan.band, tempo: Math.round(plan.band.tempo / f) };
  return out;
}

/**
 * "Notes one at a time": every subject event that sounds several notes at once is replaced by its
 * notes one after another, low to high, and then once more together. Context events stay as they are.
 */
export function spread(plan: SoundPlan, gap = 0.5): SoundPlan {
  const events: SoundEvent[] = [];
  let shift = 0;
  const sorted = [...plan.events].sort((a, b) => a.at - b.at);
  for (const e of sorted) {
    const at = e.at + shift;
    if (e.role !== 'subject' || e.midis.length < 2) {
      events.push({ ...e, at });
      continue;
    }
    const order = e.midis.map((m, i) => ({ m, s: e.strings?.[i] ?? null })).sort((a, b) => a.m - b.m);
    order.forEach((n, i) => {
      events.push({ at: at + i * gap, midis: [n.m], strings: [n.s], dur: gap * (order.length - i) + 0.6, strike: 'pluck', role: 'subject', ...(e.cents ? { cents: e.cents } : {}) });
    });
    const again = at + order.length * gap + 0.3;
    events.push({ ...e, at: again });
    shift += order.length * gap + 0.3;
  }
  const out: SoundPlan = { events, length: plan.length + shift };
  if (plan.drone) out.drone = { ...plan.drone, to: plan.drone.to + shift };
  return out;
}

/** Sounding notes of a plan in time order (optionally only one role). */
export function planNotes(plan: SoundPlan, role?: SoundEvent['role']): number[] {
  return [...plan.events]
    .filter((e) => !role || e.role === role)
    .sort((a, b) => a.at - b.at)
    .flatMap((e) => e.midis);
}

/** The subject events of a plan, in time order. */
export function subjectEvents(plan: SoundPlan): SoundEvent[] {
  return plan.events.filter((e) => e.role === 'subject').sort((a, b) => a.at - b.at);
}

/** Mark every event of a plan with one role. */
export function withRole(plan: SoundPlan, role: SoundEvent['role']): SoundPlan {
  return { ...plan, events: plan.events.map((e) => ({ ...e, role })) };
}
