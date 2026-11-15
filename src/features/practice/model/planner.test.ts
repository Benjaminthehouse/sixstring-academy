import { describe, expect, it } from 'vitest';
import { ROUTE_BY_NAME } from '@/app/routes';
import { addDays, weekStartOf, type ExperienceLevel } from '@/core/progress';
import { FOCUS_AREAS, type Area } from './areas';
import {
  DURATIONS,
  addBlock,
  allocateMinutes,
  alternativesFor,
  buildPlan,
  moveBlock,
  planShape,
  removeBlock,
  setBlockMinutes,
  totalMinutes,
  type PlanBlock,
  type PlannerInput,
  type SkillSignal,
} from './planner';

const LEVELS: readonly ExperienceLevel[] = ['beginner', 'intermediate', 'expert'];
const START = '2026-11-02'; // a Monday
const days = (n: number) => Array.from({ length: n }, (_, i) => addDays(START, i));

function input(level: ExperienceLevel, minutes: number, day: string, extra: Partial<PlannerInput> = {}): PlannerInput {
  return { level, teacher: level === 'beginner' ? 'mia' : level === 'intermediate' ? 'dev' : 'elena', minutes, day, ...extra };
}

const signature = (plan: readonly PlanBlock[]) => plan.map((b) => `${b.area}:${b.itemId ?? b.skillId ?? b.goalId}:${b.minutes}`).join('|');

const RUSTY_BOX_2: SkillSignal = { id: 'scale:a-minor-pentatonic:box-2', area: 'scales', name: 'A minor pentatonic, box 2', strength: 0.3, rusty: true, weak: false };

function expectSensible(plan: readonly PlanBlock[], minutes: number, label: string): void {
  const shape = planShape(minutes);
  expect(totalMinutes(plan), `${label}: minutes add up`).toBe(minutes);
  expect(plan[0].area, `${label}: warm-up first`).toBe('warmup');
  expect(plan.length, `${label}: block count`).toBe(1 + shape.focus + (shape.free > 0 ? 1 : 0));
  if (shape.free > 0) expect(plan[plan.length - 1].area, `${label}: free play last`).toBe('free');
  else expect(plan.some((b) => b.area === 'free'), `${label}: no free play under 30 minutes`).toBe(false);
  if (shape.focus >= 3) expect(plan.some((b) => b.area === 'repertoire'), `${label}: a song from 15 minutes`).toBe(true);
  const focus = plan.filter((b) => b.area !== 'warmup' && b.area !== 'free');
  for (const b of focus) expect(b.minutes, `${label}: focus block length`).toBeGreaterThanOrEqual(shape.minFocus);
  expect(new Set(focus.map((b) => b.area)).size, `${label}: no area twice`).toBe(focus.length);
  const keys = plan.map((b) => b.itemId ?? b.skillId ?? b.goalId ?? b.title);
  expect(new Set(keys).size, `${label}: nothing twice`).toBe(keys.length);
  expect(new Set(plan.map((b) => b.id)).size, `${label}: unique ids`).toBe(plan.length);
  for (const b of plan) {
    expect(b.minutes, `${label}: whole minutes`).toBe(Math.round(b.minutes));
    expect(b.title.length).toBeGreaterThan(2);
    expect(b.goal.length).toBeGreaterThan(10);
    expect(b.reason, `${label}: ${b.title} has a reason`).toBeTruthy();
    if (b.target) expect(ROUTE_BY_NAME[b.target.route], `${label}: ${b.target.route} exists`).toBeDefined();
    if (b.extra) expect(ROUTE_BY_NAME[b.extra.route], `${label}: ${b.extra.route} exists`).toBeDefined();
  }
}

describe('planShape and allocateMinutes', () => {
  it('lays out every offered duration', () => {
    expect(DURATIONS.map((m) => planShape(m).focus)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(DURATIONS.map((m) => planShape(m).free)).toEqual([0, 0, 0, 3, 5, 7]);
  });

  it('always adds up exactly and respects the minimum', () => {
    for (let total = 0; total <= 120; total++) {
      for (const weights of [[1], [1, 1], [1.5, 1, 1.2], [0, 0, 0], [3, 1, 1, 1, 1, 1], [1, Number.NaN]]) {
        const parts = allocateMinutes(total, weights, 3);
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
        if (total >= 3 * weights.length) for (const p of parts) expect(p).toBeGreaterThanOrEqual(3);
      }
    }
    expect(allocateMinutes(10, [], 2)).toEqual([]);
  });
});

describe('buildPlan', () => {
  it('adds up exactly and is sensible for every level and duration over 30 days', () => {
    for (const level of LEVELS) {
      for (const minutes of DURATIONS) {
        for (const day of days(30)) expectSensible(buildPlan(input(level, minutes, day)), minutes, `${level} ${minutes} ${day}`);
      }
    }
  });

  it('adds up for odd lengths too (routines and quick sessions)', () => {
    for (let minutes = 2; minutes <= 90; minutes++) {
      expect(totalMinutes(buildPlan(input('intermediate', minutes, START)))).toBe(minutes);
    }
    // Out-of-range input is clamped, never broken.
    expect(totalMinutes(buildPlan(input('beginner', 0, START)))).toBe(2);
    expect(totalMinutes(buildPlan(input('beginner', Number.NaN, START)))).toBe(10);
  });

  it('is the same plan on reload and a different mix on another day or seed', () => {
    const a = buildPlan(input('beginner', 15, START));
    const b = buildPlan(input('beginner', 15, START));
    expect(signature(a)).toBe(signature(b));
    const other = days(30).map((d) => signature(buildPlan(input('beginner', 15, d))));
    expect(new Set(other).size).toBeGreaterThan(10);
    const seeds = [1, 2, 3, 4, 5, 6].map((seed) => signature(buildPlan(input('beginner', 15, START, { seed }))));
    expect(new Set([signature(a), ...seeds]).size).toBeGreaterThan(3);
  });

  it('varies over 30 days: every focus area comes round, and the exercises rotate', () => {
    for (const level of LEVELS) {
      for (const minutes of DURATIONS) {
        const plans = days(30).map((d) => buildPlan(input(level, minutes, d)));
        const distinct = new Set(plans.map(signature)).size;
        expect(distinct, `${level} ${minutes}: distinct plans`).toBeGreaterThanOrEqual(minutes <= 5 ? 5 : 10);
        if (minutes >= 30) {
          const areas = new Set(plans.flat().map((b) => b.area));
          for (const a of FOCUS_AREAS) expect(areas.has(a), `${level} ${minutes}: ${a} appears`).toBe(true);
        }
        const items = new Set(plans.flat().map((b) => b.itemId));
        expect(items.size, `${level} ${minutes}: exercise variety`).toBeGreaterThanOrEqual(minutes <= 5 ? 4 : 8);
      }
    }
  });

  it('keeps the balance over a simulated month when the learner follows the plans', () => {
    for (const level of LEVELS) {
      const total: Partial<Record<Area, number>> = {};
      let week: Partial<Record<Area, number>> = {};
      let last: Area[] = [];
      for (const day of days(30)) {
        if (day === weekStartOf(day, 1)) week = {};
        const plan = buildPlan(input(level, 30, day, { weekMinutes: week, lastAreas: last }));
        for (const b of plan) {
          week[b.area] = (week[b.area] ?? 0) + b.minutes;
          total[b.area] = (total[b.area] ?? 0) + b.minutes;
        }
        last = plan.map((b) => b.area);
      }
      const focusTotal = FOCUS_AREAS.reduce((s, a) => s + (total[a] ?? 0), 0);
      for (const a of FOCUS_AREAS) expect((total[a] ?? 0) / focusTotal, `${level}: share of ${a}`).toBeGreaterThan(0.06);
    }
  });

  it('favours rusty skills and says why', () => {
    for (const level of LEVELS) {
      for (const minutes of [10, 15]) {
        const withRust = days(30).filter((d) => buildPlan(input(level, minutes, d, { skills: [RUSTY_BOX_2] })).some((b) => b.skillId === RUSTY_BOX_2.id)).length;
        const without = days(30).filter((d) => buildPlan(input(level, minutes, d)).some((b) => b.area === 'scales')).length;
        expect(withRust, `${level} ${minutes}: rusty skill picked`).toBeGreaterThanOrEqual(18);
        expect(withRust, `${level} ${minutes}: more than without rust`).toBeGreaterThan(without);
      }
    }
    const plan = buildPlan(input('intermediate', 15, START, { skills: [RUSTY_BOX_2] }));
    const block = plan.find((b) => b.skillId === RUSTY_BOX_2.id);
    if (block) {
      expect(block.reason).toBe('Your A minor pentatonic, box 2 is getting rusty.');
      expect(block.reasonKind).toBe('rusty');
      expect(block.target?.route).toBe('scales');
    }
  });

  it('turns a weak skill into a block with its accuracy', () => {
    const weak: SkillSignal = { id: 'chord-change:g-c', area: 'chords', name: 'G to C change', strength: 0.9, rusty: false, weak: true, accuracy: 0.55 };
    const plans = days(10).map((d) => buildPlan(input('beginner', 15, d, { skills: [weak] })));
    const block = plans.flat().find((b) => b.skillId === weak.id);
    expect(block?.reason).toBe('Your G to C change is at 55% accuracy: slow reps fix that.');
  });

  it('gives neglected areas more time and names the gap', () => {
    const week = { technique: 30, scales: 40, chords: 30, rhythm: 20, theory: 20, repertoire: 40 };
    const count = (w: Partial<Record<Area, number>>) => days(30).filter((d) => buildPlan(input('intermediate', 15, d, { weekMinutes: w })).some((b) => b.area === 'ear')).length;
    expect(count(week)).toBeGreaterThan(count({}));
    const plan = days(30)
      .map((d) => buildPlan(input('intermediate', 15, d, { weekMinutes: week })))
      .flat()
      .find((b) => b.area === 'ear');
    expect(plan?.reason).toBe('No ear training yet this week.');
    expect(plan?.reasonKind).toBe('neglect');
  });

  it('gives pinned goals time first', () => {
    const goals = [
      { id: 'g1', title: 'Clean F barre chord', area: 'chords' as const, daysLeft: 12 },
      { id: 'g2', title: 'A minor pentatonic at 100 BPM', area: 'scales' as const, daysLeft: null },
      { id: 'g3', title: 'Hear major and minor every time', area: 'ear' as const, daysLeft: -2 },
    ];
    const five = buildPlan(input('intermediate', 5, START, { goals }));
    expect(five.map((b) => b.goalId ?? b.area)).toEqual(['warmup', 'g1']);
    expect(five[1].reason).toBe('Your focus goal, due in 12 days.');
    const fifteen = buildPlan(input('intermediate', 15, START, { goals }));
    expect(fifteen.map((b) => b.goalId ?? b.area)).toEqual(['warmup', 'g1', 'g2', 'repertoire']);
    // Goal blocks get at least an equal share of the focus time.
    const focus = fifteen.slice(1);
    expect(focus[0].minutes).toBeGreaterThanOrEqual(focus[2].minutes);
    const hour = buildPlan(input('intermediate', 60, START, { goals }));
    expect(hour.slice(1, 4).map((b) => b.goalId)).toEqual(['g1', 'g2', 'g3']);
    expect(hour[3].reason).toBe('Your focus goal, past its target date.');
  });

  it('offers due reviews and an unfinished song', () => {
    const plans = days(30).map((d) =>
      buildPlan(input('beginner', 30, d, { dueReviews: 7, openSong: { title: 'Greensleeves', target: { route: 'play', params: ['greensleeves'], label: 'Continue Greensleeves' } } })),
    );
    const review = plans.flat().find((b) => b.itemId === 'review-cards');
    expect(review?.title).toBe('Review 7 cards');
    expect(review?.reason).toBe('7 review cards are due.');
    const song = plans[0].find((b) => b.area === 'repertoire');
    expect(song?.title).toBe('Continue “Greensleeves”');
    expect(song?.target).toEqual({ route: 'play', params: ['greensleeves'], label: 'Continue Greensleeves' });
  });

  it('never points at a screen that does not exist, whatever the signals', () => {
    const skills: SkillSignal[] = FOCUS_AREAS.map((area, i) => ({ id: `x:${area}:${i}`, area, name: `Skill ${i}`, strength: 0.2, rusty: i % 2 === 0, weak: i % 2 === 1, accuracy: 0.4 }));
    for (const level of LEVELS) for (const minutes of DURATIONS) for (const day of days(5)) {
      for (const b of buildPlan(input(level, minutes, day, { skills, dueReviews: 3 }))) {
        if (b.target) expect(ROUTE_BY_NAME[b.target.route]).toBeDefined();
      }
    }
  });
});

describe('editing a plan', () => {
  const plan = buildPlan(input('intermediate', 30, START));

  it('changes minutes within limits, moves and removes blocks', () => {
    const id = plan[1].id;
    expect(setBlockMinutes(plan, id, 0).find((b) => b.id === id)?.minutes).toBe(1);
    expect(setBlockMinutes(plan, id, 500).find((b) => b.id === id)?.minutes).toBe(60);
    expect(moveBlock(plan, id, -1)[0].id).toBe(id);
    expect(moveBlock(plan, plan[0].id, -1).map((b) => b.id)).toEqual(plan.map((b) => b.id));
    expect(removeBlock(plan, id).length).toBe(plan.length - 1);
    expect(removeBlock([plan[0]], plan[0].id).length).toBe(1);
  });

  it('adds a block before free play', () => {
    const extra = alternativesFor(plan, -1, input('intermediate', 30, START), 4).otherAreas.find((b) => b.area === 'ear');
    expect(extra).toBeDefined();
    const next = addBlock(plan, extra as PlanBlock);
    expect(next[next.length - 1].area).toBe('free');
    expect(next[next.length - 2].area).toBe('ear');
    expect(totalMinutes(next)).toBe(34);
  });

  it('offers alternatives that are not in the plan already, sized like the block they replace', () => {
    const index = plan.findIndex((b) => b.area !== 'warmup' && b.area !== 'free');
    const alt = alternativesFor(plan, index, input('intermediate', 30, START));
    const inPlan = new Set(plan.map((b) => b.itemId).filter(Boolean));
    expect(alt.sameArea.length).toBeGreaterThan(0);
    for (const b of [...alt.sameArea, ...alt.otherAreas]) {
      expect(b.minutes).toBe(plan[index].minutes);
      if (b.itemId) expect(inPlan.has(b.itemId)).toBe(false);
    }
    expect(alt.sameArea.every((b) => b.area === plan[index].area)).toBe(true);
    expect(alt.otherAreas.some((b) => b.area === plan[index].area)).toBe(false);
  });
});

describe('a beginner’s first weeks', () => {
  // The beginner level runs from the first day to the first songs. A teacher does not hand an
  // absolute beginner the F barre chord in week one; before this, day 2 of a 10-minute plan did.
  const HELD_BACK = ['f-barre', 'am-pentatonic-box-1', 'g-major-two-octaves', 'hammer-pull'];
  const itemsOver = (practiceDays: number, level: ExperienceLevel = 'beginner') => {
    const seen = new Set<string>();
    for (const day of days(60)) for (const m of DURATIONS) for (const b of buildPlan(input(level, m, day, { practiceDays }))) if (b.itemId) seen.add(b.itemId);
    return seen;
  };

  it('keeps the harder exercises out of the first week, plans and swaps alike', () => {
    const seen = itemsOver(2);
    for (const id of HELD_BACK) expect(seen.has(id), id).toBe(false);
    const plan = buildPlan(input('beginner', 30, START, { practiceDays: 2 }));
    for (let i = 0; i < plan.length; i++) {
      const alt = alternativesFor(plan, i, input('beginner', 30, START, { practiceDays: 2 }));
      for (const b of [...alt.sameArea, ...alt.otherAreas]) expect(HELD_BACK.includes(b.itemId ?? ''), b.title).toBe(false);
    }
  });

  it('brings them in as the days of practice add up', () => {
    expect(itemsOver(8).has('g-major-two-octaves')).toBe(true);
    expect(itemsOver(8).has('f-barre')).toBe(false);
    const later = itemsOver(40);
    for (const id of HELD_BACK) expect(later.has(id), id).toBe(true);
  });

  it('holds nothing back from an intermediate player, or when the history is unknown', () => {
    expect(itemsOver(0, 'intermediate').has('f-barre')).toBe(true);
    const unknown = new Set<string>();
    for (const day of days(60)) for (const b of buildPlan(input('beginner', 30, day))) if (b.itemId) unknown.add(b.itemId);
    expect(unknown.has('f-barre')).toBe(true);
  });
});
