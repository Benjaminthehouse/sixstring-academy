/**
 * Validation of untrusted state: whatever comes out of storage, an import file or another tab is
 * rebuilt field by field onto a fresh default state. The result is always a complete, in-range
 * `ProgressState`; anything malformed is replaced by its default while the valid parts are kept.
 */
import { ACTIVITY_KIND_IDS, AVATARS, COSMETIC_BY_ID, FREE_COSMETICS, MAX_HEARTS, MAX_STREAK_FREEZES, SKILL_TAGS, STREAK_MILESTONES, type CosmeticCategory } from './catalog';
import { createInitialState, defaultPrefs, type InitialStateEnv } from './defaults';
import { levelForXp } from './levels';
import {
  MAX_DAYS,
  MAX_FAVOURITES,
  MAX_ID_LENGTH,
  MAX_LOG,
  MAX_NAME_LENGTH,
  MAX_RECENTS,
  MAX_SESSION_METRICS,
  MAX_SKILLS,
  MAX_STATS,
  MAX_TITLE_LENGTH,
} from './limits';
import { pickDailyQuests, pickWeeklyQuest } from './quests';
import { ACCURACY_HISTORY, MAX_SKILL_DATA_CHARS } from './skills';
import { MAX_EASE, MAX_INTERVAL_DAYS, MAX_REVIEW_ITEMS, MIN_EASE, START_EASE } from './srs';
import { dayKey, isDayKey, weekStartOf } from './time';
import type {
  ActivityKind,
  DayKey,
  DayRecord,
  Favourite,
  JsonValue,
  MasteryLevel,
  PracticeSession,
  Preferences,
  ProgressState,
  QuestInstance,
  QuestMetric,
  RecentItem,
  ReviewItem,
  ReviewState,
  SkillRecord,
  Stars,
} from './types';

type Obj = Record<string, unknown>;

/** True for a plain object (not null, not an array). */
export const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

const obj = (v: unknown): Obj => (isObj(v) ? v : {});

function num(v: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

function int(v: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  return Math.round(num(v, fallback, min, max));
}

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

function oneOf<T extends string | number>(v: unknown, options: readonly T[], fallback: T): T {
  return (options as readonly unknown[]).includes(v) ? (v as T) : fallback;
}

/** A trimmed, length-limited string with control characters removed. */
export function cleanText(v: unknown, fallback: string, max: number): string {
  if (typeof v !== 'string') return fallback;
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

/** A usable id: a non-empty string without control characters, up to `MAX_ID_LENGTH`. */
export function cleanId(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const id = v.trim();
  // eslint-disable-next-line no-control-regex
  if (!id || id.length > MAX_ID_LENGTH || /[\u0000-\u001f\u007f]/.test(id)) return null;
  // Keys that would land on Object.prototype are never valid ids.
  if (id === '__proto__' || id === 'constructor' || id === 'prototype') return null;
  return id;
}

const day = (v: unknown): DayKey | null => (isDayKey(v) ? v : null);

/** A JSON-safe deep copy of `v`, or undefined when it is not serialisable or too large. */
export function cleanJson(v: unknown, maxChars = MAX_SKILL_DATA_CHARS): JsonValue | undefined {
  if (v === undefined) return undefined;
  try {
    const text = JSON.stringify(v);
    if (text === undefined || text.length > maxChars) return undefined;
    return JSON.parse(text) as JsonValue;
  } catch {
    return undefined;
  }
}

const PARAM = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Route params as the router accepts them: slug-safe strings, at most eight. */
export function cleanParams(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((p): p is string => typeof p === 'string' && p.length <= MAX_ID_LENGTH && PARAM.test(p)).slice(0, 8);
}

const ROUTE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A route name, or null when it is not slug-safe. */
export function cleanRoute(v: unknown): string | null {
  return typeof v === 'string' && v.length <= 40 && ROUTE.test(v) ? v : null;
}

const kind = (v: unknown): ActivityKind => oneOf(v, ACTIVITY_KIND_IDS, 'other');

// ---------------------------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------------------------

function ownedCosmetic(v: unknown, category: CosmeticCategory, owned: readonly string[], fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const def = COSMETIC_BY_ID[v];
  return def && def.category === category && (def.price === 0 || owned.includes(v)) ? v : fallback;
}

const TUNING_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const smallId = (v: unknown, fallback: string): string => (typeof v === 'string' && v.length <= 40 && TUNING_ID.test(v) ? v : fallback);
const deviceId = (v: unknown, fallback: string | null): string | null => (v === null ? null : typeof v === 'string' && v.length > 0 && v.length <= 200 ? v : fallback);

/**
 * Validate preferences. Every field that is missing or out of range falls back to `base`.
 * Cosmetic choices must be owned.
 */
export function sanitizePrefs(raw: unknown, base: Preferences, owned: readonly string[]): Preferences {
  const r = obj(raw);
  const fb = obj(r.fretboard);
  const sound = obj(r.sound);
  const mic = obj(r.mic);
  const camera = obj(r.camera);
  const review = obj(r.review);
  return {
    dailyGoalXp: oneOf(r.dailyGoalXp, [10, 20, 30, 50] as const, base.dailyGoalXp),
    handedness: oneOf(r.handedness, ['right', 'left'] as const, base.handedness),
    tuningId: smallId(r.tuningId, base.tuningId),
    a4: Math.round(num(r.a4, base.a4, 415, 466) * 10) / 10,
    theme: oneOf(r.theme, ['system', 'light', 'dark'] as const, base.theme),
    noteNaming: oneOf(r.noteNaming, ['letters', 'solfege', 'german'] as const, base.noteNaming),
    accidentals: oneOf(r.accidentals, ['auto', 'sharps', 'flats'] as const, base.accidentals),
    fretboard: {
      frets: int(fb.frets, base.fretboard.frets, 12, 24),
      wood: ownedCosmetic(fb.wood, 'wood', owned, base.fretboard.wood),
      inlay: ownedCosmetic(fb.inlay, 'inlay', owned, base.fretboard.inlay),
      labels: oneOf(fb.labels, ['notes', 'degrees'] as const, base.fretboard.labels),
    },
    accent: ownedCosmetic(r.accent, 'accent', owned, base.accent),
    sound: {
      volume: Math.round(num(sound.volume, base.sound.volume, 0, 1) * 100) / 100,
      guitarTone: smallId(sound.guitarTone, base.sound.guitarTone),
      clickSound: smallId(sound.clickSound, base.sound.clickSound),
      uiSounds: bool(sound.uiSounds, base.sound.uiSounds),
    },
    mic: {
      deviceId: deviceId(mic.deviceId, base.mic.deviceId),
      sensitivity: Math.round(num(mic.sensitivity, base.mic.sensitivity, 0, 1) * 100) / 100,
    },
    camera: {
      deviceId: deviceId(camera.deviceId, base.camera.deviceId),
      mirrored: bool(camera.mirrored, base.camera.mirrored),
    },
    motion: oneOf(r.motion, ['system', 'reduce', 'full'] as const, base.motion),
    notation: oneOf(r.notation, ['tab', 'tab+notation'] as const, base.notation),
    ai: { enabled: bool(obj(r.ai).enabled, base.ai.enabled) },
    unlimitedHearts: bool(r.unlimitedHearts, base.unlimitedHearts),
    review: {
      newPerDay: int(review.newPerDay, base.review.newPerDay, 0, 50),
      reviewsPerDay: int(review.reviewsPerDay, base.review.reviewsPerDay, 10, 500),
    },
    weekStart: oneOf(r.weekStart, ['monday', 'sunday'] as const, base.weekStart),
  };
}

/** Merge a patch into `base` one level at a time (plain objects are merged, everything else replaced). */
export function deepMerge(base: unknown, patch: unknown): unknown {
  if (!isObj(base) || !isObj(patch)) return patch === undefined ? base : patch;
  const out: Obj = { ...base };
  for (const key of Object.keys(patch)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    out[key] = deepMerge(base[key], patch[key]);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------------------------

/** Validate one day of history. */
export function sanitizeDay(raw: unknown, goalFallback: number): DayRecord | null {
  if (!isObj(raw)) return null;
  const kinds: DayRecord['kinds'] = {};
  const rawKinds = obj(raw.kinds);
  for (const k of ACTIVITY_KIND_IDS) {
    const v = rawKinds[k];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) kinds[k] = Math.round(v);
  }
  const out: DayRecord = {
    xp: int(raw.xp, 0, 0, 1_000_000),
    goal: int(raw.goal, goalFallback, 1, 1000),
    met: bool(raw.met, false),
    sec: int(raw.sec, 0, 0, 86_400),
    n: int(raw.n, 0, 0, 100_000),
    kinds,
  };
  if (raw.frozen === true) out.frozen = true;
  return out;
}

/** Validate one skill record. */
export function sanitizeSkill(raw: unknown, now: number): SkillRecord | null {
  if (!isObj(raw)) return null;
  const attempts = int(raw.attempts, 0, 0, 1_000_000);
  const completed = bool(raw.completed, false);
  const lastAt = num(raw.lastAt, now, 0);
  const out: SkillRecord = {
    attempts,
    completions: int(raw.completions, completed ? 1 : 0, 0, 1_000_000),
    perfects: int(raw.perfects, 0, 0, 1_000_000),
    bestScore: num(raw.bestScore, 0, 0, 1e12),
    lastScore: num(raw.lastScore, 0, 0, 1e12),
    bestAccuracy: num(raw.bestAccuracy, 0, 0, 1),
    lastAccuracy: num(raw.lastAccuracy, 0, 0, 1),
    history: Array.isArray(raw.history)
      ? raw.history.filter((v): v is number => typeof v === 'number' && Number.isFinite(v)).map((v) => Math.min(100, Math.max(0, Math.round(v)))).slice(-ACCURACY_HISTORY)
      : [],
    timeSec: int(raw.timeSec, 0, 0, 1e9),
    mastery: oneOf(raw.mastery, [0, 1, 2, 3, 4, 5] as const, 0) as MasteryLevel,
    reps: int(raw.reps, 0, 0, 10),
    stars: oneOf(raw.stars, [0, 1, 2, 3] as const, 0) as Stars,
    completed,
    firstAt: num(raw.firstAt, lastAt, 0),
    lastAt,
    completedAt: completed ? num(raw.completedAt, lastAt, 0) : null,
  };
  const data = cleanJson(raw.data);
  if (data !== undefined) out.data = data;
  return out;
}

/** Validate one review card. */
export function sanitizeReviewItem(raw: unknown, id: string, now: number, today: DayKey, timeZone?: string): ReviewItem | null {
  if (!isObj(raw)) return null;
  const state = oneOf<ReviewState>(raw.state, ['new', 'learning', 'review'], 'new');
  const dueAt = state === 'learning' ? num(raw.dueAt, now, 0) : 0;
  const out: ReviewItem = {
    id,
    kind: cleanText(raw.kind, 'card', 40) || 'card',
    state,
    step: int(raw.step, 0, 0, 5),
    ease: num(raw.ease, START_EASE, MIN_EASE, MAX_EASE),
    interval: int(raw.interval, state === 'review' ? 1 : 0, state === 'review' ? 1 : 0, MAX_INTERVAL_DAYS),
    reps: int(raw.reps, 0, 0, 100_000),
    lapses: int(raw.lapses, 0, 0, 100_000),
    dueAt,
    dueDay: day(raw.dueDay) ?? (state === 'learning' ? dayKey(dueAt, timeZone) : today),
    addedAt: num(raw.addedAt, now, 0),
    lastAt: num(raw.lastAt, 0, 0),
  };
  const ref = typeof raw.ref === 'string' ? raw.ref.slice(0, 200) : undefined;
  if (ref !== undefined) out.ref = ref;
  return out;
}

function sanitizeSession(raw: unknown, now: number): PracticeSession | null {
  if (!isObj(raw)) return null;
  const id = cleanId(raw.id);
  if (!id) return null;
  const out: PracticeSession = {
    id,
    kind: kind(raw.kind),
    title: cleanText(raw.title, '', MAX_TITLE_LENGTH),
    startedAt: num(raw.startedAt, now, 0),
    durationSec: int(raw.durationSec, 0, 0, 86_400),
    xp: int(raw.xp, 0, 0, 100_000),
  };
  const skillId = cleanId(raw.skillId);
  if (skillId) out.skillId = skillId;
  const metrics = cleanMetrics(raw.metrics);
  if (metrics) out.metrics = metrics;
  return out;
}

/** Keep up to `MAX_SESSION_METRICS` finite numbers with short keys. */
export function cleanMetrics(raw: unknown): Record<string, number> | undefined {
  if (!isObj(raw)) return undefined;
  const out: Record<string, number> = {};
  let n = 0;
  for (const key of Object.keys(raw)) {
    const v = raw[key];
    if (n >= MAX_SESSION_METRICS) break;
    if (typeof v !== 'number' || !Number.isFinite(v) || !cleanId(key) || key.length > 24) continue;
    out[key] = Math.round(v * 1000) / 1000;
    n++;
  }
  return n > 0 ? out : undefined;
}

function sanitizeRecent(raw: unknown, now: number): RecentItem | null {
  if (!isObj(raw)) return null;
  const route = cleanRoute(raw.route);
  if (!route) return null;
  const params = cleanParams(raw.params);
  const out: RecentItem = {
    key: recentKey(route, params),
    route,
    params,
    title: cleanText(raw.title, route, MAX_TITLE_LENGTH) || route,
    kind: kind(raw.kind),
    fraction: num(raw.fraction, 0, 0, 1),
    at: num(raw.at, now, 0),
  };
  const skillId = cleanId(raw.skillId);
  if (skillId) out.skillId = skillId;
  return out;
}

/** The identity of a recents entry: the route and its params. */
export function recentKey(route: string, params: readonly string[]): string {
  return [route, ...params].join('--');
}

/** The identity of a favourite. */
export function favouriteKey(kindName: string, id: string): string {
  return `${kindName}:${id}`;
}

function sanitizeFavourite(raw: unknown, now: number): Favourite | null {
  if (!isObj(raw)) return null;
  const id = cleanId(raw.id);
  const kindName = cleanText(raw.kind, '', 24);
  if (!id || !kindName) return null;
  const out: Favourite = { kind: kindName, id, title: cleanText(raw.title, id, MAX_TITLE_LENGTH) || id, at: num(raw.at, now, 0) };
  const route = cleanRoute(raw.route);
  if (route) {
    out.route = route;
    out.params = cleanParams(raw.params);
  }
  return out;
}

const QUEST_METRICS: readonly QuestMetric[] = [
  'xp',
  'goal',
  'minutes',
  'theory-lesson',
  'teacher-lesson',
  'lessons',
  'reviews',
  'tune',
  'scale-game',
  'scale-practice',
  'new-chord',
  'chord-changes',
  'song',
  'combo',
  'perfect',
  'ear',
  'rhythm',
  'technique',
  'progression',
  'fretboard-notes',
  'variety',
  'stars',
  'accuracy-90',
];

function sanitizeQuest(raw: unknown): QuestInstance | null {
  if (!isObj(raw)) return null;
  const id = cleanId(raw.id);
  if (!id || !(QUEST_METRICS as readonly unknown[]).includes(raw.metric)) return null;
  const target = num(raw.target, 0, 0, 100_000);
  if (target <= 0) return null;
  const progress = num(raw.progress, 0, 0, target);
  const done = bool(raw.done, false) || progress >= target;
  return { id, metric: raw.metric as QuestMetric, target, progress: done ? target : progress, done, gems: int(raw.gems, 5, 0, 1000), doneAt: done ? num(raw.doneAt, 0, 0) : null };
}

// ---------------------------------------------------------------------------------------------
// The whole state
// ---------------------------------------------------------------------------------------------

/** What a sanitising pass found. */
export interface SanitizeReport {
  /** Top-level slices that were missing or had the wrong type and were reset to defaults. */
  reset: string[];
}

const SLICES_REQUIRED: ReadonlyArray<keyof ProgressState> = ['profile', 'prefs', 'xp', 'days', 'streak', 'hearts', 'gems', 'skills', 'srs', 'quests', 'achievements', 'stats', 'meta'];

/**
 * Rebuild a complete, valid state from anything. Never throws; valid parts of `raw` are kept and
 * the rest falls back to the defaults of a fresh learner.
 */
export function sanitizeState(raw: unknown, env: InitialStateEnv, report?: SanitizeReport): ProgressState {
  const fresh = createInitialState(env);
  if (!isObj(raw)) {
    report?.reset.push('*');
    return fresh;
  }
  if (report) {
    for (const key of SLICES_REQUIRED) if (!isObj(raw[key])) report.reset.push(key);
    for (const key of ['cosmetics', 'log', 'recents'] as const) if (!Array.isArray(raw[key])) report.reset.push(key);
    if (!isObj(raw.favourites)) report.reset.push('favourites');
  }
  const now = env.now;
  const today = fresh.meta.today;

  // Meta first: other slices use `today`.
  const m = obj(raw.meta);
  const meta: ProgressState['meta'] = {
    rev: int(m.rev, 0, 0),
    updatedAt: num(m.updatedAt, now, 0),
    createdAt: num(m.createdAt, now, 0),
    deviceId: cleanText(m.deviceId, fresh.meta.deviceId, 40) || fresh.meta.deviceId,
    today: day(m.today) ?? today,
    lastActiveDay: day(m.lastActiveDay),
    prefsAt: num(m.prefsAt, 0, 0),
  };

  const cosmetics = [...FREE_COSMETICS];
  if (Array.isArray(raw.cosmetics)) {
    for (const id of raw.cosmetics) if (typeof id === 'string' && COSMETIC_BY_ID[id] && !cosmetics.includes(id)) cosmetics.push(id);
  }

  const p = obj(raw.profile);
  const profile: ProgressState['profile'] = {
    name: cleanText(p.name, '', MAX_NAME_LENGTH),
    avatar: oneOf(p.avatar, AVATARS.map((a) => a.id), fresh.profile.avatar),
    experience: oneOf(p.experience, ['beginner', 'intermediate', 'expert'] as const, 'beginner'),
    teacher: oneOf(p.teacher, ['mia', 'dev', 'elena'] as const, 'mia'),
    onboarded: bool(p.onboarded, false),
    createdAt: num(p.createdAt, meta.createdAt, 0),
  };

  const prefs = sanitizePrefs(raw.prefs, defaultPrefs(), cosmetics);

  const x = obj(raw.xp);
  const byTag: ProgressState['xp']['byTag'] = {};
  for (const tag of SKILL_TAGS) {
    const v = obj(x.byTag)[tag];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) byTag[tag] = Math.round(v);
  }
  const capped: ProgressState['xp']['capped'] = {};
  for (const k of ACTIVITY_KIND_IDS) {
    const v = obj(x.capped)[k];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) capped[k] = Math.round(v);
  }
  const b = x.boost;
  const boost = isObj(b) && typeof b.until === 'number' && Number.isFinite(b.until) ? { multiplier: num(b.multiplier, 2, 1, 5), until: b.until, source: cleanText(b.source, 'boost', 40) } : null;
  const xp: ProgressState['xp'] = { total: int(x.total, 0, 0, 1e9), byTag, boost, capped };

  const days: ProgressState['days'] = {};
  const dayKeys = Object.keys(obj(raw.days)).filter(isDayKey).sort();
  for (const key of dayKeys.slice(-MAX_DAYS)) {
    const record = sanitizeDay(obj(raw.days)[key], prefs.dailyGoalXp);
    if (record) days[key] = record;
  }

  const s = obj(raw.streak);
  const lastGoalDay = day(s.lastGoalDay);
  const current = lastGoalDay ? int(s.current, 0, 0, 100_000) : 0;
  const covered = day(s.coveredThrough);
  const streak: ProgressState['streak'] = {
    current,
    longest: Math.max(current, int(s.longest, 0, 0, 100_000)),
    lastGoalDay,
    coveredThrough: lastGoalDay ? (covered && covered > lastGoalDay ? covered : lastGoalDay) : null,
    startedOn: current > 0 ? day(s.startedOn) : null,
    freezes: int(s.freezes, 0, 0, MAX_STREAK_FREEZES),
    milestones: Array.isArray(s.milestones) ? STREAK_MILESTONES.filter((n) => (s.milestones as unknown[]).includes(n)) : [],
  };

  const h = obj(raw.hearts);
  const count = int(h.count, MAX_HEARTS, 0, MAX_HEARTS);
  const hearts: ProgressState['hearts'] = { count, regenFrom: count >= MAX_HEARTS ? null : num(h.regenFrom, now, 0) };

  const g = obj(raw.gems);
  const balance = int(g.balance, 0, 0, 1e9);
  const gems: ProgressState['gems'] = { balance, earned: Math.max(int(g.earned, balance, 0, 1e9), 0), spent: int(g.spent, 0, 0, 1e9) };

  const skills: ProgressState['skills'] = {};
  let skillCount = 0;
  for (const key of Object.keys(obj(raw.skills))) {
    if (skillCount >= MAX_SKILLS) break;
    const id = cleanId(key);
    const record = id ? sanitizeSkill(obj(raw.skills)[key], now) : null;
    if (id && record) {
      skills[id] = record;
      skillCount++;
    }
  }

  const r = obj(raw.srs);
  const items: ProgressState['srs']['items'] = {};
  let itemCount = 0;
  for (const key of Object.keys(obj(r.items))) {
    if (itemCount >= MAX_REVIEW_ITEMS) break;
    const id = cleanId(key);
    const item = id ? sanitizeReviewItem(obj(r.items)[key], id, now, today, env.timeZone) : null;
    if (id && item) {
      items[id] = item;
      itemCount++;
    }
  }
  const srs: ProgressState['srs'] = { items, day: day(r.day) ?? today, newToday: int(r.newToday, 0, 0, 10_000), reviewsToday: int(r.reviewsToday, 0, 0, 100_000) };

  const log: PracticeSession[] = [];
  if (Array.isArray(raw.log)) {
    for (const entry of raw.log) {
      if (log.length >= MAX_LOG) break;
      const session = sanitizeSession(entry, now);
      if (session) log.push(session);
    }
  }

  const recents: RecentItem[] = [];
  if (Array.isArray(raw.recents)) {
    const seen = new Set<string>();
    for (const entry of raw.recents) {
      if (recents.length >= MAX_RECENTS) break;
      const recent = sanitizeRecent(entry, now);
      if (recent && !seen.has(recent.key)) {
        seen.add(recent.key);
        recents.push(recent);
      }
    }
  }

  const favourites: ProgressState['favourites'] = {};
  let favouriteCount = 0;
  for (const key of Object.keys(obj(raw.favourites))) {
    if (favouriteCount >= MAX_FAVOURITES) break;
    const favourite = sanitizeFavourite(obj(raw.favourites)[key], now);
    if (favourite) {
      favourites[favouriteKey(favourite.kind, favourite.id)] = favourite;
      favouriteCount++;
    }
  }

  const level = levelForXp(xp.total);
  const q = obj(raw.quests);
  const questDay = day(q.day);
  const daily = Array.isArray(q.daily) ? q.daily.map(sanitizeQuest).filter((v): v is QuestInstance => v !== null).slice(0, 3) : [];
  const week = day(q.week);
  const weekly = sanitizeQuest(q.weekly);
  const dailyOk = questDay !== null && daily.length === 3;
  const weeklyOk = week !== null && weekly !== null;
  const questWeek = weeklyOk && week ? week : weekStartOf(meta.today, 1);
  const quests: ProgressState['quests'] = {
    day: dailyOk && questDay ? questDay : meta.today,
    daily: dailyOk ? daily : pickDailyQuests(meta.today, level),
    sweep: dailyOk ? bool(q.sweep, false) : false,
    week: questWeek,
    weekly: weeklyOk ? weekly : pickWeeklyQuest(questWeek, level),
  };

  const achievements: ProgressState['achievements'] = {};
  const rawAchievements = obj(raw.achievements);
  for (const key of Object.keys(rawAchievements).slice(0, 1000)) {
    const id = cleanId(key);
    const entry = rawAchievements[key];
    if (id && isObj(entry)) achievements[id] = { at: num(entry.at, now, 0) };
  }

  const stats: ProgressState['stats'] = {};
  let statCount = 0;
  const rawStats = obj(raw.stats);
  for (const key of Object.keys(rawStats)) {
    if (statCount >= MAX_STATS) break;
    const v = rawStats[key];
    if (cleanId(key) && typeof v === 'number' && Number.isFinite(v) && v >= 0) {
      stats[key] = v;
      statCount++;
    }
  }

  return { profile, prefs, xp, days, streak, hearts, gems, cosmetics, skills, srs, log, recents, favourites, quests, achievements, stats, meta };
}
