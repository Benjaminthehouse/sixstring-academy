import { describe, expect, it } from 'vitest';
import { ACTIVITY_KINDS, addDays, createInitialState, dayNumber, type ActivityKind, type RecentItem } from '@/core/progress';
import type { PlanBlock } from '@/features/practice/model/planner';
import { suggestPracticePlan } from '@/features/practice/model/signals';
import { ROUTE_BY_NAME } from '@/app/routes';
import { DAILY_GOALS } from '@/core/progress';
import { PRACTICE_LIBRARY } from '@/features/practice/model/library';
import { PLAN_SLOTS, buildPlan, continueItems, goalMinutes, minutesLeft, nextStep, planLength, slotsFor, type PlanContext } from './plan';

const base: PlanContext = { experience: 'beginner', teacher: 'mia', dailyGoalXp: 20, today: '2026-03-02', doneKinds: new Set(), dueReviews: 0, recents: [] };
const LEVELS = ['beginner', 'intermediate', 'expert'] as const;
const GOALS = [10, 20, 30, 50] as const;
const days = Array.from({ length: 28 }, (_, i) => addDays('2026-03-02', i));

describe('planLength', () => {
  it('gives three steps up to a regular goal, four for a serious one, five for an intense one', () => {
    expect(GOALS.map(planLength)).toEqual([3, 3, 4, 5]);
    for (const g of GOALS) for (const d of [0, 1]) expect(slotsFor(g, d)).toHaveLength(planLength(g));
  });
  it('always starts with tuning, and alternates so short plans come round to everything', () => {
    expect(slotsFor(10, 0)).toEqual([0, 1, 3]);
    expect(slotsFor(10, 1)).toEqual([0, 1, 4]);
    // Regular: the short theory step with music one day, the teacher's longer lesson with a drill the next.
    expect(slotsFor(20, 0)).toEqual([0, 1, 4]);
    expect(slotsFor(20, 1)).toEqual([0, 2, 3]);
    expect(slotsFor(30, 0)).toEqual([0, 1, 2, 3]);
    expect(slotsFor(30, 1)).toEqual([0, 1, 2, 4]);
    expect(slotsFor(50, 9)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('the plan matches the daily goal', () => {
  it('marks the drill and music steps the planner picks (Today holds their place until the practice library is in)', () => {
    for (const dailyGoalXp of GOALS) {
      for (const today of days.slice(0, 4)) {
        const day = slotsFor(dailyGoalXp, dayNumber(today));
        const plan = buildPlan({ ...base, dailyGoalXp, today });
        // Every drill (slot 3) or music (slot 4) step is flexible, and nothing else is.
        expect(plan.filter((s) => s.flexible).length, `${dailyGoalXp} ${today}`).toBe(day.filter((slot) => slot >= 3).length);
        expect(plan.filter((s) => s.flexible).every((s) => s.id !== 'tune' && s.id !== 'theory' && s.id !== 'teacher' && s.id !== 'review')).toBe(true);
      }
    }
    // With the planner's blocks too, and with due cards in front.
    const withBlocks = buildPlan({ ...base, dailyGoalXp: 50, dueReviews: 3, practice: suggestPracticePlan(createInitialState({ now: Date.parse('2026-03-02T10:00:00Z'), timeZone: 'UTC', deviceId: 't' }), Date.parse('2026-03-02T10:00:00Z'), 25) });
    expect(withBlocks.map((s) => !!s.flexible)).toEqual([false, false, false, false, true]);
  });

  it('adds up to about the minutes the goal says and earns at least its XP, every level and day', () => {
    expect(GOALS.map(goalMinutes)).toEqual(DAILY_GOALS.map((g) => g.minutes));
    for (const experience of LEVELS) {
      for (const dailyGoalXp of GOALS) {
        for (const today of days) {
          const state = createInitialState({ now: Date.parse(`${today}T10:00:00Z`), timeZone: 'UTC', deviceId: 't' });
          state.profile.experience = experience;
          const practice = suggestPracticePlan(state, Date.parse(`${today}T10:00:00Z`), goalMinutes(dailyGoalXp), { journal: [], goals: [] }, PRACTICE_LIBRARY);
          for (const blocks of [undefined, practice]) {
            const plan = buildPlan({ ...base, experience, dailyGoalXp, today, practice: blocks });
            const minutes = minutesLeft(plan);
            const label = `${experience} ${dailyGoalXp} XP ${today}: ${plan.map((s) => `${s.id}:${s.minutes}`).join(' ')}`;
            // "About 10 minutes": never more than a couple of minutes either way.
            expect(Math.abs(minutes - goalMinutes(dailyGoalXp)), label).toBeLessThanOrEqual(2);
            expect(plan.reduce((sum, s) => sum + s.xp, 0), label).toBeGreaterThanOrEqual(dailyGoalXp);
          }
        }
      }
    }
  });

  it('keeps the teacher in a regular plan every other day, and every day while a lesson is open', () => {
    const week = days.slice(0, 6).map((today) => buildPlan({ ...base, today }).map((s) => s.id));
    expect(week.filter((ids) => ids.includes('teacher')).length).toBe(3);
    expect(week.filter((ids) => ids.includes('theory')).length).toBe(3);
    const open: RecentItem[] = [{ key: 'teachers/mia/lesson-2', route: 'teachers', params: ['mia', 'lesson-2'], title: 'Your first chord', kind: 'teacher-lesson', fraction: 0.4, at: 2 }];
    for (const today of days.slice(0, 6)) expect(buildPlan({ ...base, today, recents: open }).some((s) => s.id === 'teacher'), today).toBe(true);
  });
});

describe('buildPlan', () => {
  it('is three to five real screens for every level, goal and day', () => {
    for (const experience of LEVELS) {
      for (const dailyGoalXp of GOALS) {
        for (const today of days) {
          const plan = buildPlan({ ...base, experience, dailyGoalXp, today });
          expect(plan.length).toBe(planLength(dailyGoalXp));
          expect(new Set(plan.map((s) => s.id)).size).toBe(plan.length);
          for (const step of plan) {
            expect(ROUTE_BY_NAME[step.route], step.route).toBeDefined();
            expect(step.title.length).toBeGreaterThan(3);
            expect(step.minutes).toBeGreaterThan(0);
            expect(step.xp).toBeGreaterThan(0);
            expect(step.done).toBe(false);
            for (const kind of step.kinds) expect(ACTIVITY_KINDS[kind], kind).toBeDefined();
          }
          expect(plan[0].route).toBe('tuner');
        }
      }
    }
  });

  it('depends on the level', () => {
    const routes = (experience: (typeof LEVELS)[number]) => new Set(days.flatMap((today) => buildPlan({ ...base, experience, dailyGoalXp: 30, today }).map((s) => s.route)));
    const beginner = routes('beginner');
    const intermediate = routes('intermediate');
    const expert = routes('expert');
    expect(beginner.has('chords')).toBe(true);
    expect(beginner.has('technique')).toBe(false);
    expect(intermediate.has('arcade')).toBe(true);
    expect(intermediate.has('progressions')).toBe(true);
    expect(expert.has('technique')).toBe(true);
    expect(expert.has('ear')).toBe(true);
    expect(expert.has('chords')).toBe(false);
  });

  it('sends each level to its own teacher', () => {
    const teacherStep = (teacher: 'mia' | 'dev' | 'elena') => buildPlan({ ...base, teacher, dailyGoalXp: 30 }).find((s) => s.id === 'teacher');
    expect(teacherStep('mia')).toMatchObject({ route: 'teachers', params: ['mia'], title: "Take Mia's next lesson" });
    expect(teacherStep('dev')).toMatchObject({ params: ['dev'], title: "Take Dev's next lesson" });
    expect(teacherStep('elena')).toMatchObject({ params: ['elena'], title: "Take Elena's next lesson" });
  });

  it('varies from day to day but is the same all day', () => {
    const monday = buildPlan({ ...base, experience: 'intermediate', dailyGoalXp: 30 });
    expect(buildPlan({ ...base, experience: 'intermediate', dailyGoalXp: 30 })).toEqual(monday);
    const week = new Set(days.slice(0, 7).map((today) => buildPlan({ ...base, experience: 'intermediate', dailyGoalXp: 30, today }).map((s) => s.id).join(',')));
    expect(week.size).toBeGreaterThan(2);
  });

  it('uses every option of every slot over four weeks', () => {
    for (const experience of LEVELS) {
      const seen = new Set(days.flatMap((today) => buildPlan({ ...base, experience, dailyGoalXp: 50, today }).map((s) => s.id)));
      for (const slot of PLAN_SLOTS[experience]) for (const id of slot) expect(seen.has(id), `${experience}:${id}`).toBe(true);
    }
  });

  it('marks a step done once its kind of activity was recorded today', () => {
    const plan = buildPlan({ ...base, dailyGoalXp: 30, doneKinds: new Set<ActivityKind>(['tuner', 'theory-lesson']) });
    expect(plan.find((s) => s.id === 'tune')?.done).toBe(true);
    expect(plan.find((s) => s.id === 'theory')?.done).toBe(true);
    expect(plan.find((s) => s.id === 'teacher')?.done).toBe(false);
    expect(nextStep(plan)?.id).toBe('teacher');
  });

  it('counts either chord activity for the chord step', () => {
    const today = days.find((d) => buildPlan({ ...base, dailyGoalXp: 30, today: d }).some((s) => s.id === 'chords'));
    expect(today).toBeDefined();
    const plan = buildPlan({ ...base, dailyGoalXp: 30, today: today as string, doneKinds: new Set<ActivityKind>(['chord-change']) });
    expect(plan.find((s) => s.id === 'chords')?.done).toBe(true);
  });

  it('puts due reviews right after tuning and stays within five steps', () => {
    const four = buildPlan({ ...base, dueReviews: 12 });
    expect(four.map((s) => s.id).slice(0, 2)).toEqual(['tune', 'review']);
    expect(four).toHaveLength(4);
    expect(four[1]).toMatchObject({ title: 'Review 12 cards', route: 'learn', minutes: 2 });
    const five = buildPlan({ ...base, dailyGoalXp: 50, dueReviews: 1 });
    expect(five).toHaveLength(5);
    expect(five[1].title).toBe('Review 1 card');
    expect(five.map((s) => s.id)).toContain('song');
  });

  it('keeps the review step, ticked, after the cards are done', () => {
    const plan = buildPlan({ ...base, dueReviews: 0, doneKinds: new Set<ActivityKind>(['review']) });
    expect(plan[1]).toMatchObject({ id: 'review', done: true, title: 'Review your cards' });
  });

  it('links straight to a lesson that was left unfinished, and does not call it done', () => {
    const recents: RecentItem[] = [
      { key: 'teachers/mia/lesson-2', route: 'teachers', params: ['mia', 'lesson-2'], title: 'Your first chord', kind: 'teacher-lesson', fraction: 0.4, at: 2 },
      { key: 'learn/unit-1/lesson-3', route: 'learn', params: ['unit-1', 'lesson-3'], title: 'Sharps and flats', kind: 'theory-lesson', fraction: 0.5, at: 1 },
    ];
    const plan = buildPlan({ ...base, dailyGoalXp: 30, recents, doneKinds: new Set<ActivityKind>(['teacher-lesson', 'theory-lesson']) });
    expect(plan.find((s) => s.id === 'teacher')).toMatchObject({ params: ['mia', 'lesson-2'], title: 'Continue “Your first chord”', done: false });
    expect(plan.find((s) => s.id === 'theory')).toMatchObject({ params: ['unit-1', 'lesson-3'], title: 'Finish “Sharps and flats”', done: false });
  });

  it('ignores finished lessons when looking for something to continue', () => {
    const recents: RecentItem[] = [{ key: 'teachers/mia/lesson-1', route: 'teachers', params: ['mia', 'lesson-1'], title: 'Holding the guitar', kind: 'teacher-lesson', fraction: 1, at: 2 }];
    const plan = buildPlan({ ...base, dailyGoalXp: 30, recents, doneKinds: new Set<ActivityKind>(['teacher-lesson']) });
    expect(plan.find((s) => s.id === 'teacher')).toMatchObject({ params: ['mia'], done: true });
  });
});

describe('continueItems', () => {
  it('offers songs and lessons to continue, unfinished first, and leaves out bare tool visits', () => {
    const r = (route: string, params: string[], fraction: number, title = route): RecentItem => ({ key: `${route}/${params.join('/')}`, route, params, title, kind: 'other', fraction, at: 0 });
    const recents = [r('tuner', [], 1, 'Tuner'), r('play', ['lightly-row'], 0.5, 'Lightly Row'), r('practice', [], 1, '10-minute plan'), r('play', ['hot-cross-buns'], 1, 'Hot Cross Buns'), r('gone', ['x'], 0.3)];
    expect(continueItems(recents, (route) => route !== 'gone').map((x) => x.title)).toEqual(['Lightly Row', 'Hot Cross Buns']);
    // A tool left part-way (a tuning session cut short) can still be picked up.
    expect(continueItems([r('tuner', [], 0.4, 'Tuner')], () => true).map((x) => x.title)).toEqual(['Tuner']);
    expect(continueItems(Array.from({ length: 9 }, (_, i) => r('play', [`s${i}`], 1)), () => true)).toHaveLength(4);
  });
});

describe('nextStep and minutesLeft', () => {
  it('point at the first open step and add up what is left', () => {
    const plan = buildPlan({ ...base, dailyGoalXp: 30 });
    expect(nextStep(plan)?.id).toBe('tune');
    expect(minutesLeft(plan)).toBe(plan.reduce((sum, s) => sum + s.minutes, 0));
    const done = plan.map((s) => ({ ...s, done: true }));
    expect(nextStep(done)).toBeNull();
    expect(minutesLeft(done)).toBe(0);
  });
});

describe("Today's drill and music come from the practice planner", () => {
  const block = (over: Partial<PlanBlock> & Pick<PlanBlock, 'id' | 'area'>): PlanBlock => ({
    minutes: 4,
    title: 'Block',
    goal: 'Do it slowly. Then a little faster.',
    target: null,
    ...over,
  });
  const drill = block({ id: 'b2', area: 'chords', title: 'One-minute changes: G to C', reason: 'Your G to C change is getting rusty', target: { route: 'chords', params: ['trainer', 'g-c'], label: 'Open the trainer' } });
  const song = block({ id: 'b3', area: 'repertoire', minutes: 5, title: 'Strum a two-chord song', target: { route: 'songs', params: [], label: 'Open Songs' } });
  const practice = [block({ id: 'b1', area: 'warmup', target: { route: 'technique', params: [], label: 'Warm up' } }), drill, song];

  it('a full plan keeps tune, theory and the teacher, and takes the drill and the song the planner chose', () => {
    const plan = buildPlan({ ...base, dailyGoalXp: 50, practice });
    expect(plan.map((s) => s.route)).toEqual(['tuner', 'learn', 'teachers', 'chords', 'songs']);
    // The drill and the song share what the 25-minute goal leaves after tuning, theory and the teacher.
    expect(plan[3]).toMatchObject({ title: 'One-minute changes: G to C', params: ['trainer', 'g-c'], detail: 'Your G to C change is getting rusty', minutes: 6, done: false });
    expect(plan[3].xp).toBeGreaterThan(0);
    expect(plan[4]).toMatchObject({ title: 'Strum a two-chord song', detail: 'Do it slowly.', minutes: 7 });
    expect(minutesLeft(plan)).toBe(25);
    // Without the planner's blocks the same day still has a plan of its own.
    expect(buildPlan({ ...base, dailyGoalXp: 50 }).map((s) => s.route)).toEqual(buildPlan({ ...base, dailyGoalXp: 50, practice: [] }).map((s) => s.route));
  });

  it('ticks a planned step off with the activity its screen records', () => {
    const plan = buildPlan({ ...base, dailyGoalXp: 50, practice, doneKinds: new Set<ActivityKind>(['chord-change']) });
    expect(plan.find((s) => s.route === 'chords')?.done).toBe(true);
    expect(plan.find((s) => s.route === 'songs')?.done).toBe(false);
  });

  it('falls back to its own step when the planner has nothing it can count for a slot', () => {
    const odd = [
      block({ id: 'x', area: 'theory', target: { route: 'reference', params: ['circle'], label: 'Open' } }),
      block({ id: 'y', area: 'free', target: null }),
      // The theory lesson and the tuner are steps of their own already: never a second time as the drill.
      block({ id: 'z', area: 'theory', target: { route: 'learn', params: [], label: 'Open the path' } }),
      block({ id: 'w', area: 'ear', target: { route: 'tuner', params: [], label: 'Open the tuner' } }),
    ];
    const plan = buildPlan({ ...base, dailyGoalXp: 50, practice: odd });
    const own = buildPlan({ ...base, dailyGoalXp: 50 });
    expect(plan.map((s) => s.id)).toEqual(own.map((s) => s.id));
  });

  it('every step the real planner gives a fresh learner is a real screen', () => {
    for (const experience of LEVELS) {
      for (const minutes of [5, 10, 15, 20]) {
        const state = createInitialState({ now: Date.parse('2026-03-02T10:00:00Z'), timeZone: 'UTC', deviceId: 't' });
        state.profile.experience = experience;
        const blocks = suggestPracticePlan(state, Date.parse('2026-03-02T10:00:00Z'), minutes);
        const plan = buildPlan({ ...base, experience, dailyGoalXp: 50, practice: blocks });
        for (const step of plan) expect(ROUTE_BY_NAME[step.route], step.route).toBeTruthy();
        expect(plan.filter((s) => s.id.startsWith('practice-')).length).toBeGreaterThan(0);
      }
    }
  });
});
