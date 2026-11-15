/**
 * Newest-wins merge of two states (import with `newest-wins`, and concurrent tabs).
 *
 * "Newest wins" is applied per item, not per file, so practising on two devices loses as little
 * as possible:
 *
 *   profile, preferences       the side whose preferences changed last
 *   days                       per day: the higher XP, time and counts; met / frozen if either says so
 *   XP total, per-tag XP       the larger value (XP is never taken away by a merge)
 *   streak                     the side with the later goal day (ties: the longer streak); longest = max
 *   hearts, gems, quests, boost  the side that was updated last (spending cannot be merged)
 *   cosmetics, achievements    union (achievements keep the earlier unlock time)
 *   skills, review cards       per id: the record practised last; bests, crowns and stars = max
 *   log, recents, favourites   union by id, newest first, cut to the usual bounds
 *   lifetime counters          per counter: the larger value
 *
 * Deletions do not travel: something removed on one side comes back if the other side still has it.
 */
import { MAX_DAYS, MAX_FAVOURITES, MAX_LOG, MAX_RECENTS } from './limits';
import { sanitizePrefs } from './sanitize';
import type { DayRecord, MasteryLevel, PracticeSession, ProgressState, RecentItem, SkillRecord, Stars } from './types';

function mergeDay(a: DayRecord, b: DayRecord): DayRecord {
  const kinds: DayRecord['kinds'] = { ...a.kinds };
  for (const key of Object.keys(b.kinds) as Array<keyof DayRecord['kinds']>) {
    kinds[key] = Math.max(kinds[key] ?? 0, b.kinds[key] ?? 0);
  }
  const out: DayRecord = {
    xp: Math.max(a.xp, b.xp),
    goal: a.met === b.met ? Math.min(a.goal, b.goal) : a.met ? a.goal : b.goal,
    met: a.met || b.met,
    sec: Math.max(a.sec, b.sec),
    n: Math.max(a.n, b.n),
    kinds,
  };
  if (a.frozen || b.frozen) out.frozen = true;
  return out;
}

function mergeSkill(a: SkillRecord, b: SkillRecord): SkillRecord {
  const [newer, older] = a.lastAt >= b.lastAt ? [a, b] : [b, a];
  const mastery = Math.max(a.mastery, b.mastery) as MasteryLevel;
  const completed = a.completed || b.completed;
  const out: SkillRecord = {
    ...newer,
    attempts: Math.max(a.attempts, b.attempts),
    completions: Math.max(a.completions, b.completions),
    perfects: Math.max(a.perfects, b.perfects),
    bestScore: Math.max(a.bestScore, b.bestScore),
    bestAccuracy: Math.max(a.bestAccuracy, b.bestAccuracy),
    timeSec: Math.max(a.timeSec, b.timeSec),
    mastery,
    // Reps toward the next crown only mean something on the side that holds the higher crown.
    reps: newer.mastery === mastery ? newer.reps : older.mastery === mastery ? older.reps : 0,
    stars: Math.max(a.stars, b.stars) as Stars,
    completed,
    firstAt: Math.min(a.firstAt, b.firstAt),
    completedAt: completed ? Math.min(a.completedAt ?? Infinity, b.completedAt ?? Infinity) : null,
  };
  if (out.completedAt !== null && !Number.isFinite(out.completedAt)) out.completedAt = newer.lastAt;
  return out;
}

/** Merge `incoming` into `local`, newest wins per item. Pure; `now` stamps the result. */
export function mergeStates(local: ProgressState, incoming: ProgressState, now: number): ProgressState {
  const localNewer = local.meta.updatedAt >= incoming.meta.updatedAt;
  const recent = localNewer ? local : incoming;
  const prefsSide = local.meta.prefsAt >= incoming.meta.prefsAt ? local : incoming;

  const cosmetics = [...local.cosmetics];
  for (const id of incoming.cosmetics) if (!cosmetics.includes(id)) cosmetics.push(id);

  const days: ProgressState['days'] = { ...local.days };
  for (const key of Object.keys(incoming.days)) {
    days[key] = days[key] ? mergeDay(days[key], incoming.days[key]) : incoming.days[key];
  }
  const dayKeys = Object.keys(days).sort();
  for (const key of dayKeys.slice(0, Math.max(0, dayKeys.length - MAX_DAYS))) delete days[key];

  const byTag: ProgressState['xp']['byTag'] = { ...local.xp.byTag };
  for (const tag of Object.keys(incoming.xp.byTag) as Array<keyof typeof byTag>) {
    byTag[tag] = Math.max(byTag[tag] ?? 0, incoming.xp.byTag[tag] ?? 0);
  }

  const a = local.streak;
  const b = incoming.streak;
  const aDay = a.lastGoalDay ?? '';
  const bDay = b.lastGoalDay ?? '';
  const streakSide = aDay === bDay ? (a.current >= b.current ? a : b) : aDay > bDay ? a : b;
  const streak: ProgressState['streak'] = {
    ...streakSide,
    longest: Math.max(a.longest, b.longest, streakSide.current),
    freezes: recent.streak.freezes,
    milestones: [...new Set([...a.milestones, ...b.milestones])].sort((x, y) => x - y),
  };

  const skills: ProgressState['skills'] = { ...local.skills };
  for (const id of Object.keys(incoming.skills)) {
    skills[id] = skills[id] ? mergeSkill(skills[id], incoming.skills[id]) : incoming.skills[id];
  }

  const items: ProgressState['srs']['items'] = { ...local.srs.items };
  for (const id of Object.keys(incoming.srs.items)) {
    const mine = items[id];
    const theirs = incoming.srs.items[id];
    if (!mine || theirs.lastAt > mine.lastAt) items[id] = theirs;
  }

  const sessions = new Map<string, PracticeSession>();
  for (const s of [...local.log, ...incoming.log]) if (!sessions.has(s.id)) sessions.set(s.id, s);
  const log = [...sessions.values()].sort((x, y) => y.startedAt - x.startedAt).slice(0, MAX_LOG);

  const recentMap = new Map<string, RecentItem>();
  for (const r of [...local.recents, ...incoming.recents]) {
    const have = recentMap.get(r.key);
    if (!have || r.at > have.at) recentMap.set(r.key, r);
  }
  const recents = [...recentMap.values()].sort((x, y) => y.at - x.at).slice(0, MAX_RECENTS);

  const favourites: ProgressState['favourites'] = { ...local.favourites };
  for (const key of Object.keys(incoming.favourites)) {
    const mine = favourites[key];
    const theirs = incoming.favourites[key];
    if (!mine || theirs.at > mine.at) favourites[key] = theirs;
  }
  const favouriteKeys = Object.keys(favourites);
  if (favouriteKeys.length > MAX_FAVOURITES) {
    favouriteKeys.sort((x, y) => favourites[y].at - favourites[x].at);
    for (const key of favouriteKeys.slice(MAX_FAVOURITES)) delete favourites[key];
  }

  const achievements: ProgressState['achievements'] = { ...local.achievements };
  for (const id of Object.keys(incoming.achievements)) {
    const mine = achievements[id];
    const theirs = incoming.achievements[id];
    achievements[id] = mine ? { at: Math.min(mine.at, theirs.at) } : theirs;
  }

  const stats: ProgressState['stats'] = { ...local.stats };
  for (const key of Object.keys(incoming.stats)) stats[key] = Math.max(stats[key] ?? 0, incoming.stats[key]);

  const total = Math.max(local.xp.total, incoming.xp.total);
  const lastActive = [local.meta.lastActiveDay, incoming.meta.lastActiveDay].filter((d): d is string => !!d).sort();

  return {
    profile: {
      ...prefsSide.profile,
      onboarded: local.profile.onboarded || incoming.profile.onboarded,
      createdAt: Math.min(local.profile.createdAt, incoming.profile.createdAt),
    },
    // The chosen cosmetics must be owned on the merged side too.
    prefs: sanitizePrefs(prefsSide.prefs, prefsSide.prefs, cosmetics),
    xp: { total, byTag, boost: recent.xp.boost, capped: recent.xp.capped },
    days,
    streak,
    hearts: recent.hearts,
    gems: {
      balance: recent.gems.balance,
      earned: Math.max(local.gems.earned, incoming.gems.earned),
      spent: Math.max(local.gems.spent, incoming.gems.spent),
    },
    cosmetics,
    skills,
    srs: { items, day: recent.srs.day, newToday: recent.srs.newToday, reviewsToday: recent.srs.reviewsToday },
    log,
    recents,
    favourites,
    // Quests were picked for a level; keep the set of the side that is ahead in time.
    quests: recent.quests.day >= (localNewer ? incoming : local).quests.day ? recent.quests : (localNewer ? incoming : local).quests,
    achievements,
    stats,
    meta: {
      rev: Math.max(local.meta.rev, incoming.meta.rev) + 1,
      updatedAt: now,
      createdAt: Math.min(local.meta.createdAt, incoming.meta.createdAt),
      deviceId: local.meta.deviceId,
      today: local.meta.today >= incoming.meta.today ? local.meta.today : incoming.meta.today,
      lastActiveDay: lastActive.length ? lastActive[lastActive.length - 1] : null,
      prefsAt: Math.max(local.meta.prefsAt, incoming.meta.prefsAt),
    },
  };
}
