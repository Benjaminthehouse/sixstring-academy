import { describe, expect, it } from 'vitest';
import { ACTIVITY_KINDS, addDays, type ActivityKind, type RecentItem } from '@/core/progress';
import { ROUTE_BY_NAME } from '@/app/routes';
import { PLAN_SLOTS, buildPlan, minutesLeft, nextStep, planLength, slotsForLength, type PlanContext } from './plan';

const base: PlanContext = { experience: 'beginner', teacher: 'mia', dailyGoalXp: 20, today: '2026-03-02', doneKinds: new Set(), dueReviews: 0, recents: [] };
const LEVELS = ['beginner', 'intermediate', 'expert'] as const;
const GOALS = [10, 20, 30, 50] as const;
const days = Array.from({ length: 28 }, (_, i) => addDays('2026-03-02', i));

describe('planLength', () => {
  it('gives three steps for a casual goal, four for a regular one, five above', () => {
    expect(GOALS.map(planLength)).toEqual([3, 4, 5, 5]);
  });
  it('always starts with tuning and a study step, and alternates drill and music in short plans', () => {
    expect(slotsForLength(3, 0)).toEqual([0, 1, 3]);
    expect(slotsForLength(3, 1)).toEqual([0, 1, 4]);
    expect(slotsForLength(4, 0)).toEqual([0, 1, 2, 3]);
    expect(slotsForLength(4, 1)).toEqual([0, 1, 2, 4]);
    expect(slotsForLength(5, 9)).toEqual([0, 1, 2, 3, 4]);
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
    expect(four).toHaveLength(5);
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
