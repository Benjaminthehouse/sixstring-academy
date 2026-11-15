/**
 * Health while practising: a tension check every few minutes of playing, a gentle stop prompt
 * after a long stretch without a break, and a per-exercise limit for exercises that can strain.
 * Pure state; the screen ticks it once a second while the learner is playing.
 */

/** Minutes of playing before the break prompt (the plan's 20 to 30 minute blocks). */
export const BREAK_AFTER_SEC = 25 * 60;
/** After "keep going", ask again after this long. */
export const SNOOZE_SEC = 10 * 60;
/** A tension check every this many seconds of playing. */
export const TENSION_EVERY_SEC = 4 * 60;
/** A pause this long counts as a break: the playing clock starts again. */
export const BREAK_RESET_MS = 5 * 60 * 1000;

/** The health clock of one practice stretch. */
export interface HealthState {
  /** Seconds played since the last break. */
  playedSec: number;
  /** Seconds played since the last tension check. */
  sinceTensionSec: number;
  /** The break prompt is quiet until `playedSec` reaches this. */
  quietUntilSec: number;
  /** Wall-clock ms of the last tick while playing (0 = never). */
  lastPlayedAt: number;
}

/** A fresh clock. */
export function newHealth(): HealthState {
  return { playedSec: 0, sinceTensionSec: 0, quietUntilSec: BREAK_AFTER_SEC, lastPlayedAt: 0 };
}

/** Advance the clock: `dtSec` of playing (or not) at wall-clock `nowMs`. A long pause is a break. */
export function tickHealth(s: HealthState, nowMs: number, dtSec: number, playing: boolean): HealthState {
  let next = s;
  if (s.lastPlayedAt && nowMs - s.lastPlayedAt > BREAK_RESET_MS) next = { ...newHealth() };
  if (!playing) return next;
  return { ...next, playedSec: next.playedSec + dtSec, sinceTensionSec: next.sinceTensionSec + dtSec, lastPlayedAt: nowMs };
}

/** What, if anything, to show now. The break prompt wins over a tension check. */
export function reminderDue(s: HealthState): 'break' | 'tension' | null {
  if (s.playedSec >= s.quietUntilSec) return 'break';
  if (s.sinceTensionSec >= TENSION_EVERY_SEC) return 'tension';
  return null;
}

/** The learner chose to keep going: ask again later. */
export function snoozeBreak(s: HealthState): HealthState {
  return { ...s, quietUntilSec: s.playedSec + SNOOZE_SEC };
}

/** The learner took a break. */
export function tookBreak(_s: HealthState): HealthState {
  return newHealth();
}

/** A tension check was shown. */
export function tensionSeen(s: HealthState): HealthState {
  return { ...s, sinceTensionSec: 0 };
}

/** Whether a strain warning's time is up for this exercise. */
export function strainDue(exerciseSec: number, maxMinutes: number | undefined): boolean {
  return maxMinutes !== undefined && exerciseSec >= maxMinutes * 60;
}

/** The tension checks, in turn: one short line each. */
export const TENSION_CHECKS = [
  'Quick check: jaw loose, shoulders down, fretting thumb soft, picking wrist easy.',
  'Breathe out. Is anything gripping that does not need to: the thumb, the pick, your jaw?',
  'Let your shoulders drop and your elbows hang. Then carry on.',
  'Freeze for a second and feel your hands. Ease off anything that is squeezing.',
] as const;

/** Which tension line to show for the n-th check. */
export function tensionLine(n: number): string {
  return TENSION_CHECKS[((n % TENSION_CHECKS.length) + TENSION_CHECKS.length) % TENSION_CHECKS.length];
}
