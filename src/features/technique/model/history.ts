/**
 * The learner's record per exercise, kept as the progress skill's `data` (small JSON, replaced on
 * every `recordActivity`): best clean tempo, the last tempo and a short log of sessions.
 */
import type { TempoLadder } from '@/content/technique';
import { climbs, ladderFraction } from './ladder';

/** One session in the log: day, best clean tempo that day (0 = none), last tempo played, best take score. */
export interface SessionEntry {
  /** Local day, YYYY-MM-DD. */
  d: string;
  /** Best clean tempo that session, or 0 when nothing was clean. */
  t: number;
  /** The tempo the session ended on. */
  l: number;
  /** Best microphone score (0..100) of the session, when there was a take. */
  s?: number;
}

/** What is kept for one exercise. */
export interface TechniqueRecord {
  v: 1;
  /** Best clean tempo ever, or null. */
  best: number | null;
  /** Day of that best. */
  bestDay?: string;
  /** The tempo the last session ended on. */
  last?: number;
  /** Newest last; at most `MAX_LOG` entries, one per day. */
  log: SessionEntry[];
  /** Cool-down notes ("what felt tense"), newest last, at most 10. */
  notes?: Array<{ d: string; text: string }>;
}

/** One-minute changes: per pair, best count and a short log. */
export interface PairRecord {
  v: 1;
  best: number;
  log: Array<{ d: string; n: number; t: number }>;
}

export const MAX_LOG = 40;
const MAX_NOTES = 10;

const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/** Read a stored record, repairing anything odd; never throws. */
export function readRecord(data: unknown): TechniqueRecord {
  const out: TechniqueRecord = { v: 1, best: null, log: [] };
  if (!data || typeof data !== 'object') return out;
  const d = data as Record<string, unknown>;
  const best = num(d.best);
  if (best !== null && best > 0) out.best = Math.round(best);
  if (isDay(d.bestDay)) out.bestDay = d.bestDay;
  const last = num(d.last);
  if (last !== null && last > 0) out.last = Math.round(last);
  if (Array.isArray(d.log)) {
    for (const e of d.log) {
      if (!e || typeof e !== 'object') continue;
      const x = e as Record<string, unknown>;
      const t = num(x.t);
      const l = num(x.l);
      if (!isDay(x.d) || t === null || l === null) continue;
      const entry: SessionEntry = { d: x.d, t: Math.max(0, Math.round(t)), l: Math.max(0, Math.round(l)) };
      const s = num(x.s);
      if (s !== null) entry.s = Math.max(0, Math.min(100, Math.round(s)));
      out.log.push(entry);
    }
    out.log = out.log.slice(-MAX_LOG);
  }
  if (Array.isArray(d.notes)) {
    out.notes = d.notes
      .filter((n): n is { d: string; text: string } => !!n && typeof n === 'object' && isDay((n as { d?: unknown }).d) && typeof (n as { text?: unknown }).text === 'string')
      .map((n) => ({ d: n.d, text: n.text.slice(0, 200) }))
      .slice(-MAX_NOTES);
  }
  return out;
}

/** Add a session (merged into today's entry if there is one). */
export function addSession(rec: TechniqueRecord, s: { day: string; bestClean: number | null; lastTempo: number; score?: number | null; note?: string }): TechniqueRecord {
  const next: TechniqueRecord = { ...rec, log: [...rec.log], notes: rec.notes ? [...rec.notes] : undefined };
  const t = s.bestClean ?? 0;
  const prev = next.log[next.log.length - 1];
  if (prev && prev.d === s.day) {
    const merged: SessionEntry = { d: s.day, t: Math.max(prev.t, t), l: s.lastTempo };
    const score = Math.max(prev.s ?? -1, s.score ?? -1);
    if (score >= 0) merged.s = score;
    next.log[next.log.length - 1] = merged;
  } else {
    const entry: SessionEntry = { d: s.day, t, l: s.lastTempo };
    if (s.score !== undefined && s.score !== null) entry.s = Math.round(s.score);
    next.log.push(entry);
  }
  next.log = next.log.slice(-MAX_LOG);
  if (s.bestClean !== null && (next.best === null || s.bestClean > next.best)) {
    next.best = s.bestClean;
    next.bestDay = s.day;
  }
  next.last = s.lastTempo;
  if (s.note && s.note.trim()) next.notes = [...(next.notes ?? []), { d: s.day, text: s.note.trim().slice(0, 200) }].slice(-MAX_NOTES);
  if (!next.notes) delete next.notes;
  return next;
}

/** Days with at least one clean pass. */
export function cleanDays(rec: TechniqueRecord): number {
  return rec.log.filter((e) => e.t > 0).length;
}

/**
 * Stars for a best tempo: one for any clean pass, two halfway up the ladder, three at the goal.
 * A fixed-tempo exercise (a bend, posture) has no ladder to climb, so its stars come from coming
 * back: one for the first clean day, two after three days, three after five. (One tap on "Clean"
 * used to give all three.)
 */
export function starsFor(ladder: TempoLadder, best: number | null, days = best === null ? 0 : 1): 0 | 1 | 2 | 3 {
  if (best === null) return 0;
  if (!climbs(ladder)) return days >= 5 ? 3 : days >= 3 ? 2 : 1;
  const f = ladderFraction(ladder, best);
  if (f >= 1) return 3;
  if (f >= 0.5) return 2;
  return 1;
}

/** Read a one-minute-changes pair record. */
export function readPair(data: unknown): PairRecord {
  const out: PairRecord = { v: 1, best: 0, log: [] };
  if (!data || typeof data !== 'object') return out;
  const d = data as Record<string, unknown>;
  const best = num(d.best);
  if (best !== null && best > 0) out.best = Math.round(best);
  if (Array.isArray(d.log)) {
    for (const e of d.log) {
      const x = (e ?? {}) as Record<string, unknown>;
      const n = num(x.n);
      const t = num(x.t);
      if (isDay(x.d) && n !== null && t !== null) out.log.push({ d: x.d, n: Math.max(0, Math.round(n)), t: Math.round(t) });
    }
    out.log = out.log.slice(-MAX_LOG);
  }
  return out;
}

/** Add one minute's count to a pair record. */
export function addPairMinute(rec: PairRecord, m: { day: string; count: number; tempo: number }): PairRecord {
  const log = [...rec.log, { d: m.day, n: Math.max(0, Math.round(m.count)), t: Math.round(m.tempo) }].slice(-MAX_LOG);
  return { v: 1, best: Math.max(rec.best, Math.round(m.count)), log };
}

/** The local day of a timestamp, YYYY-MM-DD. */
export function localDay(ms: number): string {
  const d = new Date(ms);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
