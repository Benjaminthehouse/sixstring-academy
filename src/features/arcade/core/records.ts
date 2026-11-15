/**
 * The arcade's own records: which levels are open, stars and best score per level, the best score
 * per game, the daily challenge, and what the learner was practising. XP, crowns, streaks and the
 * stars that count for achievements live in `core/progress` (every round reports there); the store
 * has no place for per-game levels, so they are kept here, under one storage key.
 */
import type { Stars } from './scoring';
import { DEFAULT_FOCUS, type Focus } from './focus';
import type { GameId } from './games';

/** One level's record. */
export interface LevelRecord {
  stars: Stars;
  best: number;
  plays: number;
  at: number;
}

/** A game's personal best. */
export interface GameBest {
  score: number;
  at: number;
  /** Scale slug and level it was set on. */
  scale: string;
  level: number;
}

/** The daily challenge as last played. */
export interface DailyRecord {
  date: string;
  score: number;
  stars: Stars;
  done: boolean;
}

/** Everything the arcade keeps. */
export interface ArcadeRecords {
  v: 1;
  focus: Focus;
  /** How the learner last chose to play: taps on the screen or the guitar through the microphone. */
  input: 'tap' | 'mic';
  /** Accept the right note in another octave when playing on the guitar. */
  anyOctave: boolean;
  /** `levels[game][scope][n]`; scope is a scale id, or `modes`. */
  levels: Partial<Record<GameId, Record<string, Record<string, LevelRecord>>>>;
  bests: Partial<Record<GameId, GameBest>>;
  daily: DailyRecord | null;
  dailyBest: number;
}

/** A blank record set. */
export function emptyRecords(): ArcadeRecords {
  return { v: 1, focus: { ...DEFAULT_FOCUS }, input: 'tap', anyOctave: true, levels: {}, bests: {}, daily: null, dailyBest: 0 };
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const num = (x: unknown, d = 0): number => (typeof x === 'number' && Number.isFinite(x) ? x : d);
const stars = (x: unknown): Stars => Math.max(0, Math.min(3, Math.round(num(x)))) as Stars;

/** Read stored data defensively: anything damaged falls back to a blank value, never throws. */
export function sanitizeRecords(raw: unknown): ArcadeRecords {
  const out = emptyRecords();
  if (!isObj(raw)) return out;
  if (isObj(raw.focus) && typeof raw.focus.tonic === 'string' && typeof raw.focus.scale === 'string' && typeof raw.focus.shape === 'string') {
    out.focus = { tonic: raw.focus.tonic, scale: raw.focus.scale, shape: raw.focus.shape };
  }
  if (raw.input === 'mic' || raw.input === 'tap') out.input = raw.input;
  if (typeof raw.anyOctave === 'boolean') out.anyOctave = raw.anyOctave;
  if (isObj(raw.levels)) {
    for (const [game, scopes] of Object.entries(raw.levels)) {
      if (!isObj(scopes)) continue;
      const g: Record<string, Record<string, LevelRecord>> = {};
      for (const [scope, levels] of Object.entries(scopes)) {
        if (!isObj(levels)) continue;
        const s: Record<string, LevelRecord> = {};
        for (const [n, rec] of Object.entries(levels)) {
          if (!isObj(rec) || !/^\d+$/.test(n)) continue;
          s[n] = { stars: stars(rec.stars), best: Math.max(0, num(rec.best)), plays: Math.max(0, Math.round(num(rec.plays))), at: num(rec.at) };
        }
        g[scope] = s;
      }
      out.levels[game as GameId] = g;
    }
  }
  if (isObj(raw.bests)) {
    for (const [game, b] of Object.entries(raw.bests)) {
      if (!isObj(b)) continue;
      out.bests[game as GameId] = { score: Math.max(0, num(b.score)), at: num(b.at), scale: typeof b.scale === 'string' ? b.scale : '', level: Math.max(1, Math.round(num(b.level, 1))) };
    }
  }
  if (isObj(raw.daily) && typeof raw.daily.date === 'string') {
    out.daily = { date: raw.daily.date, score: Math.max(0, num(raw.daily.score)), stars: stars(raw.daily.stars), done: raw.daily.done === true };
  }
  out.dailyBest = Math.max(0, num(raw.dailyBest));
  return out;
}

/** A level's record, or null when it was never played. */
export function levelRecord(rec: ArcadeRecords, game: GameId, scope: string, n: number): LevelRecord | null {
  return rec.levels[game]?.[scope]?.[String(n)] ?? null;
}

/** Level 1 is always open; every other level opens once the one before it has a star. */
export function isUnlocked(rec: ArcadeRecords, game: GameId, scope: string, n: number): boolean {
  if (n <= 1) return true;
  return (levelRecord(rec, game, scope, n - 1)?.stars ?? 0) >= 1;
}

/**
 * The level to play next: the first open level without a star (the frontier). When every level
 * has a star, the first one short of three stars, else the last level.
 */
export function nextLevel(rec: ArcadeRecords, game: GameId, scope: string, count: number): number {
  for (let n = 1; n <= count; n++) {
    if ((levelRecord(rec, game, scope, n)?.stars ?? 0) < 1) return n;
  }
  for (let n = 1; n <= count; n++) {
    if ((levelRecord(rec, game, scope, n)?.stars ?? 0) < 3) return n;
  }
  return Math.max(1, count);
}

/** The highest open level. */
export function highestOpen(rec: ArcadeRecords, game: GameId, scope: string, count: number): number {
  let n = 1;
  while (n < count && isUnlocked(rec, game, scope, n + 1)) n++;
  return n;
}

/** Stars collected in a game for one scope, and the most there are. */
export function starsIn(rec: ArcadeRecords, game: GameId, scope: string, count: number): { stars: number; max: number } {
  let total = 0;
  for (let n = 1; n <= count; n++) total += levelRecord(rec, game, scope, n)?.stars ?? 0;
  return { stars: total, max: count * 3 };
}

/** What a finished round changed. */
export interface RoundChange {
  records: ArcadeRecords;
  /** A level that this round opened, or null. */
  unlocked: number | null;
  /** The level's own best score went up. */
  levelBest: boolean;
  /** The game's personal best went up. */
  gameBest: boolean;
  /** Stars on the level before this round. */
  starsBefore: Stars;
}

/** Fold a finished round into the records (pure). */
export function applyRound(
  rec: ArcadeRecords,
  r: { game: GameId; scope: string; level: number; levelCount: number; stars: Stars; score: number; scaleSlug: string; at: number },
): RoundChange {
  const before = levelRecord(rec, r.game, r.scope, r.level);
  const wasOpen = r.level < r.levelCount ? isUnlocked(rec, r.game, r.scope, r.level + 1) : true;
  const next: LevelRecord = {
    stars: Math.max(before?.stars ?? 0, r.stars) as Stars,
    best: Math.max(before?.best ?? 0, r.score),
    plays: (before?.plays ?? 0) + 1,
    at: r.at,
  };
  const game = { ...(rec.levels[r.game] ?? {}) };
  game[r.scope] = { ...(game[r.scope] ?? {}), [String(r.level)]: next };
  const records: ArcadeRecords = { ...rec, levels: { ...rec.levels, [r.game]: game } };
  const prevBest = rec.bests[r.game]?.score ?? 0;
  const gameBest = r.score > prevBest;
  if (gameBest) records.bests = { ...rec.bests, [r.game]: { score: r.score, at: r.at, scale: r.scaleSlug, level: r.level } };
  const nowOpen = r.level < r.levelCount && next.stars >= 1;
  return {
    records,
    unlocked: !wasOpen && nowOpen ? r.level + 1 : null,
    levelBest: r.score > (before?.best ?? 0),
    gameBest,
    starsBefore: before?.stars ?? 0,
  };
}

/** Fold a daily challenge result in (one per day; replays keep the better score). */
export function applyDaily(rec: ArcadeRecords, d: { date: string; score: number; stars: Stars; done: boolean }): ArcadeRecords {
  const same = rec.daily?.date === d.date ? rec.daily : null;
  const daily: DailyRecord = same
    ? { date: d.date, score: Math.max(same.score, d.score), stars: Math.max(same.stars, d.stars) as Stars, done: same.done || d.done }
    : { ...d };
  return { ...rec, daily, dailyBest: Math.max(rec.dailyBest, d.done ? d.score : 0) };
}
