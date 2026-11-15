/**
 * What the learner knows, position by position: how often each place on the neck was asked, how
 * often it was right, and how long a right answer took. Kept small enough for a skill's data in
 * the progress store (4000 characters): one compact string per guitar string.
 *
 * Old answers fade: past `CAP` answers both counts shrink, so a place that used to be hard and is
 * now known shows it after a few right answers.
 */
import { isNatural } from './notes';
import { parsePosKey, pcAt, posKey, scopePositions } from './neck';
import type { NeckContext, Pos, Scope } from './types';

/** One position's record. */
export interface PosStat {
  /** Answers (faded). */
  n: number;
  /** Right answers (faded). */
  ok: number;
  /** Average time of a right answer, ms (0 = none yet). */
  ms: number;
}

/** Every position's record, by `string:fret`. */
export type NeckStats = Record<string, PosStat>;

/** Answers after which old evidence starts to fade. */
export const CAP = 10;
const FADE = 0.7;
/** A right answer faster than this counts as fluent. */
export const FAST_MS = 1500;
/** A right answer slower than this counts as worked out, not known. */
export const SLOW_MS = 5000;
/** Times above this (a learner who looked away) are not averaged in. */
const MAX_MS = 15000;

/** A fresh, empty record. */
export function emptyStats(): NeckStats {
  return {};
}

/** Fold one answer into the stats (returns a new object). Time only counts for right answers. */
export function recordAnswer(stats: NeckStats, p: Pos, right: boolean, ms: number | null = null): NeckStats {
  const key = posKey(p);
  const prev = stats[key] ?? { n: 0, ok: 0, ms: 0 };
  let n = prev.n;
  let ok = prev.ok;
  if (n >= CAP) {
    n = Math.round(n * FADE);
    ok = Math.min(n, Math.round(ok * FADE));
  }
  n += 1;
  if (right) ok += 1;
  let avg = prev.ms;
  if (right && ms !== null && Number.isFinite(ms) && ms > 0) {
    const t = Math.min(MAX_MS, ms);
    // A running average that leans on recent answers once a few are in.
    avg = avg > 0 ? Math.round(avg * 0.65 + t * 0.35) : Math.round(t);
  }
  return { ...stats, [key]: { n, ok, ms: avg } };
}

/** Estimated chance of a right answer (Laplace: an untried place is 50 %). */
export function accuracyOf(s: PosStat | undefined): number {
  return s ? (s.ok + 1) / (s.n + 2) : 0.5;
}

/** 0 when fluent, 1 when slow; 0 when there is no time yet. */
export function slownessOf(s: PosStat | undefined): number {
  if (!s || s.ms <= 0) return 0;
  return Math.max(0, Math.min(1, (s.ms - FAST_MS) / (SLOW_MS - FAST_MS)));
}

/** How the heat map shows a position. */
export type HeatLevel = 'new' | 'weak' | 'shaky' | 'good' | 'fluent';

/** Words for each level, for legends and spoken descriptions. */
export const HEAT_WORDS: Readonly<Record<HeatLevel, string>> = {
  new: 'Not tried yet',
  weak: 'Often missed',
  shaky: 'Getting there',
  good: 'Known',
  fluent: 'Known and quick',
};

/** The heat level of a position from its record. */
export function heatLevel(s: PosStat | undefined): HeatLevel {
  if (!s || s.n === 0) return 'new';
  const acc = s.ok / s.n;
  if (s.n >= 2 && acc < 0.6) return 'weak';
  if (s.n === 1 && s.ok === 0) return 'weak';
  if (acc < 0.85 || s.n < 2 || slownessOf(s) > 0.6) return 'shaky';
  return s.ms > 0 && s.ms <= FAST_MS * 1.4 ? 'fluent' : 'good';
}

/** True when a position counts as learned: three right in a row's worth of evidence, and not slow. */
export function isLearned(s: PosStat | undefined): boolean {
  return !!s && s.n >= 3 && accuracyOf(s) >= 0.8 && s.ms > 0 && s.ms <= SLOW_MS;
}

/**
 * True when every note on a string is learned: each of the twelve notes (frets 0–11, or the same
 * note twelve frets higher) has been answered right reliably and without counting frets.
 */
export function stringLearned(stats: NeckStats, string: number): boolean {
  for (let f = 0; f < 12; f++) {
    if (!isLearned(stats[`${string}:${f}`]) && !isLearned(stats[`${string}:${f + 12}`])) return false;
  }
  return true;
}

/** How many of a string's twelve notes are learned (same rule as {@link stringLearned}). */
export function notesLearnedOn(stats: NeckStats, string: number): number {
  let n = 0;
  for (let f = 0; f < 12; f++) if (isLearned(stats[`${string}:${f}`]) || isLearned(stats[`${string}:${f + 12}`])) n++;
  return n;
}

/** One cell of the heat map. */
export interface HeatCell extends Pos {
  pc: number;
  level: HeatLevel;
  n: number;
  /** Share right, 0..1 (null when never asked). */
  accuracy: number | null;
  /** Average right-answer time in ms (null when none). */
  ms: number | null;
}

/** The heat map of a range: every position with its level. */
export function heatMap(stats: NeckStats, ctx: Pick<NeckContext, 'tuning'>, frets: [number, number], strings?: number[]): HeatCell[] {
  const all = strings ?? Array.from({ length: ctx.tuning.length }, (_, i) => i + 1);
  const scope: Scope = { strings: all, frets, notes: 'all' };
  return scopePositions(scope, ctx).map((p) => {
    const s = stats[posKey(p)];
    return {
      ...p,
      pc: pcAt(ctx, p),
      level: heatLevel(s),
      n: s ? s.n : 0,
      accuracy: s && s.n > 0 ? s.ok / s.n : null,
      ms: s && s.ms > 0 ? s.ms : null,
    };
  });
}

/** A place the learner struggles with, for the "blind spots" list. */
export interface BlindSpot extends HeatCell {
  /** Higher = weaker. */
  weakness: number;
}

/** The weakest positions that have been tried, weakest first. */
export function blindSpots(stats: NeckStats, ctx: Pick<NeckContext, 'tuning'>, frets: [number, number], limit = 6): BlindSpot[] {
  // A place answered right every time and quickly is not a blind spot, however few answers it has.
  return heatMap(stats, ctx, frets)
    .filter((c) => {
      const s = stats[posKey(c)];
      return !!s && (s.ok < s.n || slownessOf(s) > 0.6);
    })
    .map((c) => {
      const s = stats[posKey(c)];
      return { ...c, weakness: 1 - accuracyOf(s) + 0.35 * slownessOf(s) + (isNatural(c.pc) ? 0.01 : 0) };
    })
    .sort((a, b) => b.weakness - a.weakness || a.string - b.string || a.fret - b.fret)
    .slice(0, limit);
}

/** Totals over every position tried. */
export function totals(stats: NeckStats): { answers: number; right: number; accuracy: number | null; avgMs: number | null } {
  let answers = 0;
  let right = 0;
  let msSum = 0;
  let msW = 0;
  for (const s of Object.values(stats)) {
    answers += s.n;
    right += s.ok;
    if (s.ms > 0) {
      msSum += s.ms * s.ok;
      msW += s.ok;
    }
  }
  return { answers, right, accuracy: answers ? right / answers : null, avgMs: msW ? Math.round(msSum / msW) : null };
}

// ── storage ──────────────────────────────────────────────────────────────────────────────────────

/** The JSON kept on the progress store: `{ v: 1, s: { "6": "0:3.3.14,5:2.1.31" } }`. */
export type StoredStats = {
  v: 1;
  s: Record<string, string>;
};

/** Encode for the progress store (compact: about 9 characters per position tried). */
export function encodeStats(stats: NeckStats): StoredStats {
  const byString: Record<string, string[]> = {};
  const keys = Object.keys(stats).sort((a, b) => {
    const pa = parsePosKey(a)!;
    const pb = parsePosKey(b)!;
    return pa.string - pb.string || pa.fret - pb.fret;
  });
  for (const key of keys) {
    const p = parsePosKey(key);
    const s = stats[key];
    if (!p || !s || s.n <= 0) continue;
    (byString[p.string] ??= []).push(`${p.fret}:${Math.round(s.n)}.${Math.round(s.ok)}.${Math.round(s.ms / 100)}`);
  }
  const out: Record<string, string> = {};
  for (const [string, parts] of Object.entries(byString)) out[string] = parts.join(',');
  return { v: 1, s: out };
}

/** Decode stored stats; anything malformed is skipped, never thrown. */
export function decodeStats(data: unknown): NeckStats {
  const out: NeckStats = {};
  if (!data || typeof data !== 'object') return out;
  const s = (data as Partial<StoredStats>).s;
  if (!s || typeof s !== 'object') return out;
  for (const [string, text] of Object.entries(s)) {
    const sn = Number(string);
    if (!Number.isInteger(sn) || sn < 1 || sn > 12 || typeof text !== 'string') continue;
    for (const part of text.split(',')) {
      const m = /^(\d{1,2}):(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(part);
      if (!m) continue;
      const fret = Number(m[1]);
      const n = Number(m[2]);
      const ok = Math.min(n, Number(m[3]));
      if (fret > 24 || n <= 0) continue;
      out[`${sn}:${fret}`] = { n, ok, ms: Number(m[4]) * 100 };
    }
  }
  return out;
}

/** The progress-store skill that keeps the map for a tuning (one map per tuning: the notes differ). */
export function mapSkillId(tuningId: string): string {
  const id = tuningId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return !id || id === 'standard' ? 'fretboard:map' : `fretboard:map-${id}`.slice(0, 100);
}
