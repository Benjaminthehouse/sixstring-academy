/**
 * The speed trainer: start a loop slower and add a few percent after every clean pass until the
 * target tempo. A pass is clean when every note was played (nothing missed, nothing wrong) and
 * the timing was mostly on; without a microphone nothing is judged, so every pass counts.
 * Pure: unit-tested.
 */
import { clampTempo } from './types';

/** The learner's speed-trainer settings. */
export interface TrainerSettings {
  on: boolean;
  /** Tempo percent of the first pass. */
  start: number;
  /** Percent added after each clean pass. */
  step: number;
  /** Where it stops. */
  target: number;
}

/** A sensible default: 70 % up to 100 % in steps of 5. */
export const DEFAULT_TRAINER: Readonly<TrainerSettings> = { on: false, start: 70, step: 5, target: 100 };

/** Steps the learner can pick. */
export const TRAINER_STEPS = [2, 5, 10] as const;

/** Read stored settings, falling back field by field. */
export function sanitizeTrainer(raw: unknown): TrainerSettings {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const start = clampTempo(num(r.start, DEFAULT_TRAINER.start));
  const target = Math.max(start, clampTempo(num(r.target, DEFAULT_TRAINER.target)));
  const step = Math.max(1, Math.min(25, Math.round(num(r.step, DEFAULT_TRAINER.step))));
  return { on: r.on === true, start, step, target };
}

/** What one pass of a loop scored (the flow judgement counts), or null when nothing was judged. */
export interface PassCounts {
  perfect: number;
  good: number;
  early: number;
  late: number;
  missed: number;
  wrong: number;
}

/** Share of a pass that must be perfect or good (the rest early or late) for it to count as clean. */
export const CLEAN_ON_TIME = 0.75;

/** Was this pass clean? Every target hit, no wrong notes, and most of them on time. Null (not judged) counts as clean. */
export function isCleanPass(counts: PassCounts | null): boolean {
  if (!counts) return true;
  const hits = counts.perfect + counts.good + counts.early + counts.late;
  if (counts.missed > 0 || counts.wrong > 0 || hits === 0) return false;
  return (counts.perfect + counts.good) / hits >= CLEAN_ON_TIME - 1e-9;
}

/** The tempo for the next pass. */
export function trainerNext(percent: number, settings: TrainerSettings, clean: boolean): { percent: number; changed: boolean; reached: boolean } {
  const now = clampTempo(percent);
  if (!settings.on || !clean || now >= settings.target) return { percent: now, changed: false, reached: now >= settings.target };
  const next = Math.min(settings.target, now + settings.step);
  return { percent: next, changed: next !== now, reached: next >= settings.target };
}

/** How many clean passes it takes from the start to the target. */
export function passesToTarget(settings: TrainerSettings): number {
  if (settings.target <= settings.start) return 0;
  return Math.ceil((settings.target - settings.start) / Math.max(1, settings.step));
}

/**
 * One line for the trainer's switch: "From 70 % to 100 %, 5 % faster after each clean loop". With
 * `mark` (a percent as the meter's tempo, see `tempoMark`) the ends say what the learner counts:
 * "From 70 % (♩. = 42) to 100 % (♩. = 60), ...".
 */
export function trainerSummary(settings: TrainerSettings, judged: boolean, mark?: (percent: number) => string): string {
  const how = judged ? 'after each clean loop' : 'each time round';
  const at = (p: number) => (mark ? `${p} % (${mark(p)})` : `${p} %`);
  return `From ${at(settings.start)} to ${at(settings.target)}, ${settings.step} % faster ${how}`;
}

/** What the trainer says at the end of a pass: "Clean. Now 80 % (♩. = 48)." */
export function trainerNote(next: { percent: number; changed: boolean; reached: boolean }, target: number, mark?: (percent: number) => string): string {
  const at = (p: number) => (mark ? `${p} % (${mark(p)})` : `${p} %`);
  if (next.reached) return `You reached ${at(target)}. Keep it going, or stop for your results.`;
  return next.changed ? `Clean. Now ${at(next.percent)}.` : `Not quite clean: staying at ${at(next.percent)}.`;
}
