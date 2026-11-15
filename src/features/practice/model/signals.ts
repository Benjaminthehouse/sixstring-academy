/**
 * Read what the planner needs out of the progress store and the journal: rusty and weak skills
 * with plain names, minutes per area this week, the pinned goals, due reviews, a song left
 * part-way and the areas of the last session.
 *
 * `suggestPracticePlan(state, now, minutes)` is the one-call version for other screens (Today
 * could use it to offer "a 10-minute plan" without knowing anything about the planner).
 */
import { ROUTE_BY_NAME } from '@/app/routes';
import {
  addDays,
  isRusty,
  reviewCountsOf,
  skillStrength,
  weekStartOf,
  type ActivityKind,
  type DayKey,
  type ProgressState,
} from '@/core/progress';
import { KIND_AREA, areaOfSkill, skillName, target, type Area } from './areas';
import { goalSignals, type FocusGoal } from './goals';
import { areaSeconds, type JournalEntry } from './journal';
import { buildPlan, type PlanBlock, type PlannerInput, type SkillSignal } from './planner';

/** Skills the planner looks at, at most. */
const MAX_SKILLS = 16;

/** Prefixes whose ids are opaque slugs: their screens' titles read better than a guess. */
const TITLED_PREFIXES = new Set(['song', 'theory', 'teacher']);

/** Rusty and weak skills, most urgent first, with names and (where known) a link back to them. */
export function skillSignals(state: ProgressState, now: number): SkillSignal[] {
  const titles = new Map<string, string>();
  const links = new Map<string, { route: string; params: string[] }>();
  for (const r of state.recents) {
    if (!r.skillId) continue;
    if (!titles.has(r.skillId)) titles.set(r.skillId, r.title);
    if (!links.has(r.skillId) && ROUTE_BY_NAME[r.route]) links.set(r.skillId, { route: r.route, params: r.params });
  }
  for (const e of state.log) if (e.skillId && !titles.has(e.skillId)) titles.set(e.skillId, e.title);

  const out: SkillSignal[] = [];
  for (const id in state.skills) {
    const area = areaOfSkill(id);
    if (!area) continue;
    const record = state.skills[id];
    const strength = skillStrength(record, now);
    const rusty = isRusty(record, now);
    // Weak: tried a few times recently, accuracy still low.
    const weak = !rusty && record.attempts >= 2 && record.lastAccuracy > 0 && record.lastAccuracy < 0.7 && strength >= 0.5;
    if (!rusty && !weak) continue;
    const prefix = id.split(':')[0];
    const name = TITLED_PREFIXES.has(prefix) ? (titles.get(id) ?? skillName(id)) : skillName(id);
    const link = links.get(id);
    out.push({
      id,
      area,
      name,
      strength,
      rusty,
      weak,
      accuracy: record.lastAccuracy > 0 ? record.lastAccuracy : undefined,
      target: link ? target(link.route, `Open ${ROUTE_BY_NAME[link.route].title}`, link.params) : undefined,
    });
  }
  out.sort((a, b) => Number(b.rusty) - Number(a.rusty) || a.strength - b.strength || (a.accuracy ?? 1) - (b.accuracy ?? 1));
  return out.slice(0, MAX_SKILLS);
}

/** First day of this week in the learner's week setting. */
export function weekStart(state: ProgressState): DayKey {
  return weekStartOf(state.meta.today, state.prefs.weekStart === 'sunday' ? 0 : 1);
}

/**
 * Minutes per area practised this week: activities recorded by other screens (by their kind) plus
 * the blocks of planned sessions in the journal. Planned sessions are logged under the `practice`
 * kind, which maps to no area, so nothing is counted twice.
 */
export function weekAreaMinutes(state: ProgressState, journal: readonly JournalEntry[]): Partial<Record<Area, number>> {
  const sec: Partial<Record<Area, number>> = {};
  const start = weekStart(state);
  const today = state.meta.today;
  for (let day = start; day <= today; day = addDays(day, 1)) {
    const kinds = state.days[day]?.kinds;
    if (!kinds) continue;
    for (const kind of Object.keys(kinds) as ActivityKind[]) {
      const area = KIND_AREA[kind];
      if (area) sec[area] = (sec[area] ?? 0) + (kinds[kind] ?? 0);
    }
  }
  const planned = areaSeconds(journal, start, today);
  for (const a of Object.keys(planned) as Area[]) sec[a] = (sec[a] ?? 0) + (planned[a] ?? 0);
  const out: Partial<Record<Area, number>> = {};
  for (const a of Object.keys(sec) as Area[]) out[a] = Math.round((sec[a] ?? 0) / 60);
  return out;
}

/** What the planner is given, read from the stores. */
export function plannerInputFrom(
  state: ProgressState,
  now: number,
  practice: { journal: readonly JournalEntry[]; goals: readonly FocusGoal[] },
  minutes: number,
  seed = 0,
): PlannerInput {
  const song = state.recents.find((r) => (r.route === 'play' || r.route === 'songs') && r.params.length > 0 && r.fraction > 0 && r.fraction < 1 && ROUTE_BY_NAME[r.route]);
  const last = practice.journal[0];
  const recent = last && last.day >= addDays(state.meta.today, -1) ? last.blocks.map((b) => b.area) : [];
  return {
    level: state.profile.experience,
    teacher: state.profile.teacher,
    minutes,
    day: state.meta.today,
    seed,
    skills: skillSignals(state, now),
    weekMinutes: weekAreaMinutes(state, practice.journal),
    goals: goalSignals(practice.goals, state.meta.today),
    dueReviews: reviewCountsOf(state, now).due,
    openSong: song ? { title: song.title, target: target(song.route, `Continue ${song.title}`, song.params) } : null,
    lastAreas: [...new Set(recent)],
    practiceDays: practiceDayCount(state),
  };
}

/** Days with any practice recorded (the store keeps about three years of days). */
export function practiceDayCount(state: ProgressState): number {
  let n = 0;
  for (const day in state.days) {
    const d = state.days[day];
    if (d && (d.sec > 0 || d.n > 0)) n++;
  }
  return n;
}

/**
 * A ready plan for `minutes` minutes from the learner's progress (and, when given, their journal
 * and focus goals). For other screens that want to offer a planned session.
 *   const plan = suggestPracticePlan(getProgress(), Date.now(), 10);
 */
export function suggestPracticePlan(
  state: ProgressState,
  now: number,
  minutes: number,
  practice: { journal: readonly JournalEntry[]; goals: readonly FocusGoal[] } = { journal: [], goals: [] },
): PlanBlock[] {
  return buildPlan(plannerInputFrom(state, now, practice, minutes));
}
