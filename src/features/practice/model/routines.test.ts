import { describe, expect, it } from 'vitest';
import { ROUTE_BY_NAME } from '@/app/routes';
import { CONTENT_BY_ID } from './content';
import { PRACTICE_LIBRARY } from './library';
import { buildPlan, totalMinutes, type PlannerInput } from './planner';
import { BUILT_IN_ROUTINES, builtInsFor, copyName, createRoutine, duplicateRoutine, parseRoutine, planFromRoutine, renameRoutine, routineBlocksFromPlan, routineMinutes } from './routines';
import { startSession } from './session';

const INPUT: PlannerInput = { level: 'intermediate', teacher: 'dev', minutes: 15, day: '2026-11-15' };

describe('routines', () => {
  it('ships the named built-ins, each valid', () => {
    const names = BUILT_IN_ROUTINES.map((r) => r.name);
    for (const name of ['10-minute daily maintenance', 'Chord change bootcamp', 'Lead guitar warm-up']) expect(names).toContain(name);
    expect(new Set(names).size).toBe(names.length);
    expect(routineMinutes(BUILT_IN_ROUTINES.find((r) => r.name === '10-minute daily maintenance')!)).toBe(10);
    for (const r of BUILT_IN_ROUTINES) {
      expect(r.builtIn).toBe(true);
      for (const b of r.blocks) {
        if (b.itemId) {
          expect(CONTENT_BY_ID[b.itemId], `${r.name}: ${b.itemId}`).toBeDefined();
          expect(CONTENT_BY_ID[b.itemId].area).toBe(b.area);
        }
      }
      const plan = planFromRoutine(r, INPUT);
      expect(totalMinutes(plan), r.name).toBe(routineMinutes(r));
      for (const b of plan) if (b.target) expect(ROUTE_BY_NAME[b.target.route]).toBeDefined();
      expect(new Set(plan.map((b) => b.id)).size).toBe(plan.length);
    }
  });

  it('puts the level’s own built-ins first', () => {
    expect(builtInsFor('beginner')[0].level).toBe('beginner');
    expect(builtInsFor('expert')[0].name).toBe('Deep work hour');
  });

  it('fills "planner\'s choice" blocks from today\'s signals', () => {
    const maintenance = BUILT_IN_ROUTINES.find((r) => r.id === 'builtin-daily-maintenance')!;
    const rusty = planFromRoutine(maintenance, { ...INPUT, skills: [{ id: 'chord:f', area: 'chords', name: 'F chord', strength: 0.2, rusty: true, weak: false }] });
    expect(rusty.find((b) => b.area === 'chords')?.reason).toBe('Your F chord is getting rusty.');
  });

  it('saves a plan as a routine, turning rusty and goal blocks into planner\'s choice', () => {
    const plan = buildPlan({ ...INPUT, minutes: 30, skills: [{ id: 'chord:f', area: 'chords', name: 'F chord', strength: 0.2, rusty: true, weak: false }], goals: [{ id: 'g', title: 'Bend in tune', area: 'technique', daysLeft: null }] });
    const r = createRoutine('  My evening  ', plan, 1, 'r1');
    expect(r.name).toBe('My evening');
    expect(routineMinutes(r)).toBe(30);
    const chords = r.blocks.find((b) => b.area === 'chords');
    expect(chords?.itemId).toBeUndefined();
    expect(chords?.title).toBeUndefined();
    expect(r.blocks.find((b) => b.area === 'technique')?.title).toBeUndefined();
    expect(parseRoutine(JSON.parse(JSON.stringify(r)))).toEqual(r);
  });

  it('duplicates and renames', () => {
    const lead = BUILT_IN_ROUTINES.find((r) => r.id === 'builtin-lead-warmup')!;
    const copy = duplicateRoutine(lead, [], 5, 'c1');
    expect(copy).toMatchObject({ id: 'c1', name: 'Lead guitar warm-up (copy)', builtIn: false });
    expect(copyName('Lead guitar warm-up (copy)', ['Lead guitar warm-up (copy)'])).toBe('Lead guitar warm-up (copy 2)');
    expect(renameRoutine(copy, '   ', 9).name).toBe(copy.name);
    expect(renameRoutine(copy, 'Solo prep', 9)).toMatchObject({ name: 'Solo prep', updatedAt: 9 });
    expect(parseRoutine({ id: 'x', name: 'n', blocks: [{ area: 'bad', minutes: 3 }] })).toBeNull();
  });
});

describe('routines with exercises from the app\'s content', () => {
  it('keeps a library exercise, and runs one that no longer exists as planner\'s choice for its area', () => {
    const saved = parseRoutine({ id: 'r', name: 'Mine', blocks: [
      { area: 'technique', minutes: 4, itemId: 'technique:tech-spider' },
      { area: 'repertoire', minutes: 5, itemId: 'song:gone-from-the-library' },
      { area: 'chords', minutes: 3, itemId: 'Not An Id!' },
    ] })!;
    expect(saved.blocks.map((b) => b.itemId)).toEqual(['technique:tech-spider', 'song:gone-from-the-library', undefined]);
    const plan = planFromRoutine(saved, { ...INPUT, library: PRACTICE_LIBRARY });
    expect(plan[0]).toMatchObject({ itemId: 'technique:tech-spider', target: { route: 'technique', params: ['tech-spider'] } });
    expect(plan[1].area).toBe('repertoire');
    expect(plan[1].itemId).not.toBe('song:gone-from-the-library');
    expect(plan[1].title.length).toBeGreaterThan(3);
    expect(totalMinutes(plan)).toBe(12);
    // Saving a plan keeps the library exercise as the exercise.
    expect(routineBlocksFromPlan([{ ...plan[0], minutes: 4 }])).toEqual([{ area: plan[0].area, minutes: 4, itemId: 'technique:tech-spider' }]);
  });
});

describe('saving a finished session as a routine', () => {
  it('keeps generated blocks as planner’s choice, not as yesterday’s fixed text', () => {
    // The summary saves session blocks, which no longer carry the plan's reason kinds.
    const plan = buildPlan({ ...INPUT, minutes: 30, dueReviews: 7, openSong: { title: 'Greensleeves', target: { route: 'play', params: ['greensleeves'], label: 'Continue' } } });
    const s = startSession(plan, 0, { id: 's', title: 'Plan' });
    const fromSession = routineBlocksFromPlan(s.blocks.map((b) => ({ ...b, minutes: Math.round(b.plannedSec / 60) })));
    const generated = s.blocks.map((b, i) => [b, fromSession[i]] as const).filter(([b]) => b.itemId === 'review-cards' || b.itemId === 'continue-song');
    expect(generated.length).toBeGreaterThan(0);
    for (const [b, r] of generated) expect(r, b.title).toEqual({ area: b.area, minutes: r.minutes });
    // A block the learner wrote keeps its words.
    expect(routineBlocksFromPlan([{ area: 'chords', minutes: 5, title: 'My own drill', goal: 'Slowly' }])).toEqual([{ area: 'chords', minutes: 5, title: 'My own drill', goal: 'Slowly' }]);
  });
});
