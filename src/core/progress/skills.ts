/**
 * Skills and mastery. A skill is anything a screen wants tracked under a string id
 * (`scale:a-minor-pentatonic:box-1`, `theory:unit-3:lesson-2`, `song:greensleeves`,
 * `chord-change:g-c`). Pure functions over `SkillRecord`.
 *
 * Crowns (mastery 0 to 5) are earned with measured accuracy:
 *
 *   crown   needs                      at accuracy
 *   1       1 finished attempt         60 % (or any finished attempt with no accuracy measured)
 *   2       2 qualifying attempts      70 %
 *   3       2 qualifying attempts      80 %
 *   4       3 qualifying attempts      85 %
 *   5       3 qualifying attempts      90 %
 *
 * An attempt counts toward the NEXT crown only, and at most one crown is earned per attempt, so
 * five crowns take at least eleven good attempts. Crowns are never taken away. What fades is
 * strength: it halves every `HALF_LIFE_DAYS[mastery]` days without practice, and a skill below
 * 50 % strength is "rusty". Practising it again restores full strength.
 */
import type { JsonValue, MasteryLevel, SkillRecord, Stars } from './types';

/** Highest crown level. */
export const MAX_MASTERY: MasteryLevel = 5;

/** What each crown takes: qualifying attempts and the accuracy an attempt needs to qualify. */
export const MASTERY_RULES: ReadonlyArray<{ level: MasteryLevel; reps: number; minAccuracy: number }> = [
  { level: 1, reps: 1, minAccuracy: 0.6 },
  { level: 2, reps: 2, minAccuracy: 0.7 },
  { level: 3, reps: 2, minAccuracy: 0.8 },
  { level: 4, reps: 3, minAccuracy: 0.85 },
  { level: 5, reps: 3, minAccuracy: 0.9 },
];

/** Names of the crown levels, index = mastery. */
export const MASTERY_NAMES: readonly string[] = ['New', 'Learning', 'Familiar', 'Solid', 'Strong', 'Mastered'];

/** Days after which strength has halved, index = mastery. Stronger skills fade more slowly. */
export const HALF_LIFE_DAYS: readonly number[] = [2, 4, 7, 14, 30, 60];

/** Below this strength a skill is called rusty. */
export const RUSTY_BELOW = 0.5;

/** How many accuracies a skill remembers. */
export const ACCURACY_HISTORY = 20;

/** Most characters of JSON a screen may store on a skill. */
export const MAX_SKILL_DATA_CHARS = 4000;

/** Stars for an accuracy: 60 % one star, 80 % two, 95 % three. */
export function starsForAccuracy(accuracy: number): Stars {
  if (accuracy >= 0.95) return 3;
  if (accuracy >= 0.8) return 2;
  if (accuracy >= 0.6) return 1;
  return 0;
}

/** A skill nobody has tried yet. */
export function emptySkill(now: number): SkillRecord {
  return {
    attempts: 0,
    completions: 0,
    perfects: 0,
    bestScore: 0,
    lastScore: 0,
    bestAccuracy: 0,
    lastAccuracy: 0,
    history: [],
    timeSec: 0,
    mastery: 0,
    reps: 0,
    stars: 0,
    completed: false,
    firstAt: now,
    lastAt: now,
    completedAt: null,
  };
}

/** One attempt at a skill, already validated. */
export interface SkillAttempt {
  score?: number;
  accuracy?: number;
  stars?: Stars;
  durationSec?: number;
  /** False for an abandoned or failed attempt. */
  completed: boolean;
  /** Finished without a mistake. */
  perfect?: boolean;
  masteryAtLeast?: MasteryLevel;
  data?: JsonValue;
}

/** What an attempt changed. */
export interface SkillAttemptOutcome {
  record: SkillRecord;
  masteryBefore: MasteryLevel;
  starsBefore: Stars;
  newBest: boolean;
  firstCompletion: boolean;
  /** Stars this attempt itself earned (not the best). */
  attemptStars: Stars;
}

/** Fold one attempt into a skill record. Never mutates `previous`. */
export function applyAttempt(previous: SkillRecord | undefined, attempt: SkillAttempt, now: number): SkillAttemptOutcome {
  const prev = previous ?? emptySkill(now);
  const next: SkillRecord = { ...prev, history: prev.history };
  const masteryBefore = prev.mastery;
  const starsBefore = prev.stars;

  next.attempts = prev.attempts + 1;
  next.lastAt = now;
  next.timeSec = prev.timeSec + Math.max(0, attempt.durationSec ?? 0);

  let newBest = false;
  if (attempt.score !== undefined) {
    next.lastScore = attempt.score;
    if (attempt.completed && attempt.score > prev.bestScore) {
      next.bestScore = attempt.score;
      newBest = true;
    }
  }
  if (attempt.accuracy !== undefined) {
    next.lastAccuracy = attempt.accuracy;
    next.history = [...prev.history, Math.round(attempt.accuracy * 100)].slice(-ACCURACY_HISTORY);
    if (attempt.completed && attempt.accuracy > prev.bestAccuracy) {
      next.bestAccuracy = attempt.accuracy;
      if (attempt.score === undefined) newBest = true;
    }
  }

  let firstCompletion = false;
  if (attempt.completed) {
    next.completions = prev.completions + 1;
    if (attempt.perfect) next.perfects = prev.perfects + 1;
    if (!prev.completed) {
      next.completed = true;
      next.completedAt = now;
      firstCompletion = true;
    }
  }

  const attemptStars: Stars = attempt.completed ? (attempt.stars ?? 0) : 0;
  if (attemptStars > prev.stars) next.stars = attemptStars;

  // Crowns: this attempt may count toward the next one.
  if (attempt.completed && prev.mastery < MAX_MASTERY) {
    const target = MASTERY_RULES[prev.mastery];
    const qualifies = attempt.accuracy === undefined ? target.level === 1 : attempt.accuracy >= target.minAccuracy;
    if (qualifies) {
      const reps = prev.reps + 1;
      if (reps >= target.reps) {
        next.mastery = target.level;
        next.reps = 0;
      } else {
        next.reps = reps;
      }
    }
  }
  if (attempt.masteryAtLeast !== undefined && attempt.masteryAtLeast > next.mastery) {
    next.mastery = attempt.masteryAtLeast;
    next.reps = 0;
  }

  if (attempt.data !== undefined) next.data = attempt.data;
  return { record: next, masteryBefore, starsBefore, newBest, firstCompletion, attemptStars };
}

/** A skill that was attempted, or marked as learned by its screen. */
function hasStarted(record: SkillRecord): boolean {
  return record.attempts > 0 || record.completed || record.mastery > 0;
}

/** How fresh a skill is at `now`: 1 right after practice, halving every half-life. 0 if never tried. */
export function skillStrength(record: SkillRecord | undefined, now: number): number {
  if (!record || !hasStarted(record)) return 0;
  const days = Math.max(0, now - record.lastAt) / 86_400_000;
  const halfLife = HALF_LIFE_DAYS[record.mastery] ?? HALF_LIFE_DAYS[0];
  return Math.pow(0.5, days / halfLife);
}

/** True for a learned skill (one crown or more) whose strength has dropped below half. */
export function isRusty(record: SkillRecord | undefined, now: number): boolean {
  return !!record && record.mastery >= 1 && skillStrength(record, now) < RUSTY_BELOW;
}

/** Plain-word freshness of a skill. */
export type StrengthLabel = 'new' | 'fresh' | 'fading' | 'rusty';

/** `fresh` at 80 % strength or more, `fading` down to 50 %, `rusty` below; `new` if never tried. */
export function strengthLabel(record: SkillRecord | undefined, now: number): StrengthLabel {
  if (!record || !hasStarted(record)) return 'new';
  const strength = skillStrength(record, now);
  if (strength >= 0.8) return 'fresh';
  return strength >= RUSTY_BELOW ? 'fading' : 'rusty';
}

/** Qualifying attempts still needed for the next crown, and the accuracy they need. Null at five crowns. */
export function nextCrown(record: SkillRecord | undefined): { level: MasteryLevel; repsLeft: number; minAccuracy: number } | null {
  const mastery = record?.mastery ?? 0;
  if (mastery >= MAX_MASTERY) return null;
  const target = MASTERY_RULES[mastery];
  return { level: target.level, repsLeft: Math.max(1, target.reps - (record?.reps ?? 0)), minAccuracy: target.minAccuracy };
}
