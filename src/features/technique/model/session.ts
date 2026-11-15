/**
 * One visit to an exercise: the passes the learner marked (or the microphone judged), the time
 * spent, and the single `recordActivity` input it turns into when the learner finishes or leaves.
 */
import { techniqueSkillId, type TechniqueExercise, type TempoLadder } from '@/content/technique';
import type { ActivityInput, MasteryLevel } from '@/core/progress';
import { addSession, starsFor, type TechniqueRecord } from './history';
import { climbs, ladderFraction } from './ladder';
import type { Verdict } from './takes';

/** One pass through the exercise at a tempo. */
export interface Pass {
  tempo: number;
  verdict: Verdict;
  /** The learner's own call, or a microphone take. */
  source: 'self' | 'mic';
  /** Microphone score 0..100. */
  score?: number;
  partId: string;
}

/** What happened in this visit. */
export interface VisitSession {
  exerciseId: string;
  startedAt: number;
  /** Seconds spent actually practising (click running, a take, a routine step). */
  activeSec: number;
  passes: Pass[];
  /** The tempo the visit is at now. */
  tempo: number;
  /** A cool-down note, if one was written. */
  note?: string;
}

/** A fresh visit. */
export function newVisit(exerciseId: string, tempo: number, now: number): VisitSession {
  return { exerciseId, startedAt: now, activeSec: 0, passes: [], tempo };
}

/** The best clean tempo of the visit, or null. */
export function bestClean(s: VisitSession): number | null {
  let best: number | null = null;
  for (const p of s.passes) if (p.verdict === 'clean' && (best === null || p.tempo > best)) best = p.tempo;
  return best;
}

/** The best microphone score of the visit, or null. */
export function bestScore(s: VisitSession): number | null {
  let best: number | null = null;
  for (const p of s.passes) if (p.score !== undefined && (best === null || p.score > best)) best = p.score;
  return best;
}

/** Whether there is anything worth recording: a pass, or 20 seconds of practice. */
export function worthRecording(s: VisitSession): boolean {
  return s.passes.length > 0 || s.activeSec >= 20;
}

/** Crowns for technique follow the ladder: one for a clean pass, then a crown per quarter of the way to the goal. */
export function masteryFor(ladder: TempoLadder, best: number | null): MasteryLevel {
  if (best === null) return 0;
  if (!climbs(ladder)) return 5;
  const f = ladderFraction(ladder, best);
  if (f >= 1) return 5;
  if (f >= 0.75) return 4;
  if (f >= 0.5) return 3;
  if (f >= 0.25) return 2;
  return 1;
}

/**
 * The `recordActivity` input for a finished visit, and the updated record it stores.
 * Returns null when there is nothing to record.
 */
export function visitActivity(e: TechniqueExercise, s: VisitSession, record: TechniqueRecord, day: string): { input: ActivityInput; record: TechniqueRecord } | null {
  if (!worthRecording(s)) return null;
  const clean = bestClean(s);
  const score = bestScore(s);
  const next = addSession(record, { day, bestClean: clean, lastTempo: s.tempo, score, note: s.note });
  const cleanPasses = s.passes.filter((p) => p.verdict === 'clean').length;
  const input: ActivityInput = {
    kind: 'technique',
    id: techniqueSkillId(e.id),
    title: e.title,
    durationSec: Math.round(s.activeSec),
    completed: s.passes.length > 0 || s.activeSec >= 60,
    route: 'technique',
    params: [e.id],
    progress: ladderFraction(e.tempo, next.best),
    stars: starsFor(e.tempo, next.best),
    data: next as unknown as ActivityInput['data'],
    meta: { tempo: s.tempo, ...(clean !== null ? { bestTempo: clean } : {}) },
  };
  if (s.passes.length) {
    input.accuracy = cleanPasses / s.passes.length;
    input.count = s.passes.length;
  }
  if (clean !== null) input.score = clean;
  const mastery = masteryFor(e.tempo, next.best);
  if (mastery > 0) input.masteryAtLeast = mastery;
  return { input, record: next };
}
