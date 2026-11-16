/**
 * Picking a round up again after a reload. A round is pure (seeded questions, answers folded into a
 * record), so it is saved as what it was made from: seed, the record it began with, the sound
 * choices of each question and the answers given. Rebuilding replays exactly that and arrives at
 * the same questions, the same record and the same score.
 */
import { readRecord, type EarRecord } from './adapt';
import { cleanSettings } from './settings';
import { answerQuestion, createRound, nextQuestion, type Round } from './round';
import type { DrillDef, EarSettings, LevelDef } from './types';

/** Storage key of the round in progress (one at a time, like a lesson in progress). */
export const RESUME_KEY = 'ear.round';
/** A round left longer ago than this starts afresh instead (hours). */
export const RESUME_HOURS = 6;

/** What is saved of a round in progress. */
export interface RoundSnapshot {
  v: 1;
  /** Which round: `<drill>:<level>`, or the deep link's own key. */
  key: string;
  seed: number;
  total: number;
  startRecord: EarRecord;
  /** Sound choices per question asked. */
  settings: EarSettings[];
  /** The answers given, in order (an option id, or the row keys of a melody). */
  chosen: Array<string | string[]>;
  /** When the round began and when it was saved (ms since 1970). */
  startedAt: number;
  savedAt: number;
}

/** The key that names a round of `level` (`intervals-up:3`). */
export function roundKey(drill: DrillDef, level: LevelDef): string {
  return level.special?.key ?? `${drill.id}:${level.n}`;
}

/** The snapshot of a round, to save. */
export function snapshotOf(round: Round, startedAt: number, now: number): RoundSnapshot {
  return {
    v: 1,
    key: roundKey(round.drill, round.level),
    seed: round.seed,
    total: round.total,
    startRecord: round.startRecord,
    settings: round.askedWith,
    chosen: round.answers.map((a) => a.chosen),
    startedAt,
    savedAt: now,
  };
}

/** A stored snapshot made safe, or null when it is not one. */
export function readSnapshot(raw: unknown): RoundSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<RoundSnapshot>;
  if (r.v !== 1 || typeof r.key !== 'string' || !Number.isFinite(r.seed) || !Number.isInteger(r.total) || !Array.isArray(r.settings) || !Array.isArray(r.chosen)) return null;
  if (!Number.isFinite(r.startedAt) || !Number.isFinite(r.savedAt)) return null;
  const chosen = r.chosen.filter((c): c is string | string[] => typeof c === 'string' || (Array.isArray(c) && c.every((x) => typeof x === 'string')));
  if (chosen.length !== r.chosen.length || r.settings.length < chosen.length || r.settings.length > chosen.length + 1 || r.settings.length > (r.total as number)) return null;
  return {
    v: 1,
    key: r.key,
    seed: (r.seed as number) >>> 0,
    total: r.total as number,
    startRecord: readRecord(r.startRecord),
    settings: r.settings.map((s) => cleanSettings(s)),
    chosen,
    startedAt: r.startedAt as number,
    savedAt: r.savedAt as number,
  };
}

/**
 * Rebuild the round a snapshot describes, if it belongs to this level and is recent; null
 * otherwise. The last question asked is the one on screen (answered or not). A round whose every
 * question is answered comes back too, on its last answer: it ends (and is recorded) when the
 * learner moves on, and a round that ended removed its snapshot.
 */
export function restoreRound(drill: DrillDef, level: LevelDef, snap: RoundSnapshot | null, now: number): Round | null {
  if (!snap || snap.key !== roundKey(drill, level)) return null;
  if (now - snap.savedAt > RESUME_HOURS * 3600_000 || now < snap.startedAt) return null;
  if (snap.settings.length === 0 || snap.chosen.length > snap.total) return null;
  let round = createRound(drill, level, { seed: snap.seed, settings: snap.settings[0], record: snap.startRecord, total: snap.total });
  try {
    for (let i = 0; i < snap.settings.length; i++) {
      round = nextQuestion(round, snap.settings[i]).round;
      if (i < snap.chosen.length) round = answerQuestion(round, snap.chosen[i]).round;
    }
  } catch {
    // A question that can no longer be made (the level changed in an update): start afresh.
    return null;
  }
  return round;
}
