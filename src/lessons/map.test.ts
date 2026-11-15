import { describe, expect, it } from 'vitest';
import { makeRig, type TestRig } from '@/core/progress/testkit';
import { DEMO_COURSE } from './demo';
import { checkpointUnlocks, courseMap, lessonNode, lessonsInOrder, nextLesson, prerequisites } from './map';
import { FACT_CARD_KIND } from './session';
import { FIXTURE } from './test-fixtures';
import type { Course } from './types';

const states = (course: Course, rig: TestRig): string[] => courseMap(course, rig.store.getState(), rig.clock.now()).units.flatMap((u) => u.lessons.map((l) => `${l.id}:${l.state}`));

function complete(rig: TestRig, skill: string, accuracy = 1): void {
  rig.actions.recordActivity({ kind: 'theory-lesson', id: skill, accuracy, mistakes: accuracy === 1 ? 0 : 2, durationSec: 180 });
}

describe('prerequisites', () => {
  it('default to the lesson before, and can be authored', () => {
    expect([...prerequisites(FIXTURE)]).toEqual([['a', []], ['b', ['a']], ['c', ['b']], ['d', ['c']], ['e', ['a']]]);
    expect(lessonsInOrder(FIXTURE).map((x) => `${x.unit.id}/${x.lesson.id}`)).toEqual(['u1/a', 'u1/b', 'u1/c', 'u2/d', 'u2/e']);
  });
});

describe('courseMap', () => {
  it('a new learner: the first lesson is current, the rest locked', () => {
    const rig = makeRig();
    const map = courseMap(FIXTURE, rig.store.getState(), rig.clock.now());
    expect(states(FIXTURE, rig)).toEqual(['a:current', 'b:locked', 'c:locked', 'd:locked', 'e:locked']);
    expect(map.next).toEqual({ unitId: 'u1', lessonId: 'a' });
    expect(nextLesson(FIXTURE, rig.store.getState(), rig.clock.now())).toEqual(map.next);
    expect(map).toMatchObject({ courseId: 'fixture', done: 0, total: 5, fraction: 0, crowns: 0, maxCrowns: 25, finished: false, dueCards: 0 });
    expect(map.units.map((u) => [u.id, u.state, u.done, u.total])).toEqual([['u1', 'current', 0, 3], ['u2', 'locked', 0, 2]]);
    expect(map.units[0]).toMatchObject({ title: 'Unit one', theme: 'basics', description: 'First things.', fraction: 0, maxCrowns: 15, dueForReview: false });
    expect(lessonNode(map, 'b')).toMatchObject({ requires: ['a'], missing: ['a'], crown: 0, strength: 0, rusty: false, skill: 'theory:u1:b', unitId: 'u1', minutes: 3 });
    expect(lessonNode(map, 'zzz')).toBeNull();
  });

  it('finishing lessons opens what depends on them', () => {
    const rig = makeRig();
    complete(rig, 'theory:u1:a');
    // "e" requires only "a", so it opens together with "b".
    expect(states(FIXTURE, rig)).toEqual(['a:done', 'b:current', 'c:locked', 'd:locked', 'e:available']);
    let map = courseMap(FIXTURE, rig.store.getState(), rig.clock.now());
    expect(map.units.map((u) => u.state)).toEqual(['current', 'available']);
    expect(map.next).toEqual({ unitId: 'u1', lessonId: 'b' });
    expect(lessonNode(map, 'a')).toMatchObject({ state: 'done', crown: 1, completions: 1, bestAccuracy: 1, missing: [] });
    expect(map).toMatchObject({ done: 1, crowns: 1 });

    complete(rig, 'theory:u1:b');
    complete(rig, 'theory:u1:c');
    map = courseMap(FIXTURE, rig.store.getState(), rig.clock.now());
    expect(states(FIXTURE, rig)).toEqual(['a:done', 'b:done', 'c:done', 'd:current', 'e:available']);
    expect(map.units[0]).toMatchObject({ state: 'done', done: 3, fraction: 1, crowns: 3 });
    expect(map.units[0].checkpoint).toEqual({ state: 'passed', ahead: false, completes: [] });

    complete(rig, 'theory:u2:d');
    complete(rig, 'theory:u2:e');
    map = courseMap(FIXTURE, rig.store.getState(), rig.clock.now());
    expect(map).toMatchObject({ finished: true, next: null, done: 5, fraction: 1 });
    expect(map.units.map((u) => u.state)).toEqual(['done', 'done']);
  });

  it('an attempt that was not completed does not open anything', () => {
    const rig = makeRig();
    rig.actions.recordActivity({ kind: 'theory-lesson', id: 'theory:u1:a', accuracy: 0.4, completed: false, durationSec: 60 });
    expect(states(FIXTURE, rig)[0]).toBe('a:current');
    // Remembering a drill difficulty on a skill is not progress either.
    rig.actions.setSkillData('theory:u1:b', { d: 0.5 });
    expect(states(FIXTURE, rig)[1]).toBe('b:locked');
  });

  it('shows crowns as the store has them', () => {
    const rig = makeRig();
    for (let i = 0; i < 3; i++) complete(rig, 'theory:u1:a');
    const map = courseMap(FIXTURE, rig.store.getState(), rig.clock.now());
    expect(lessonNode(map, 'a')).toMatchObject({ crown: rig.store.getState().skills['theory:u1:a'].mastery, completions: 3 });
    expect(lessonNode(map, 'a')!.crown).toBe(2);
    expect(map.crowns).toBe(2);
  });

  it('marks a lesson due for review when its skill has gone rusty', () => {
    const rig = makeRig();
    complete(rig, 'theory:u1:a');
    let node = lessonNode(courseMap(FIXTURE, rig.store.getState(), rig.clock.now()), 'a')!;
    expect(node).toMatchObject({ rusty: false, dueForReview: false });
    expect(node.strength).toBeCloseTo(1);
    rig.clock.days(30);
    rig.store.tick();
    node = lessonNode(courseMap(FIXTURE, rig.store.getState(), rig.clock.now()), 'a')!;
    expect(node.strength).toBeLessThan(0.5);
    expect(node).toMatchObject({ rusty: true, dueForReview: true, state: 'done' });
    expect(courseMap(FIXTURE, rig.store.getState(), rig.clock.now()).units[0].dueForReview).toBe(true);
  });

  it('marks a lesson due for review when its fact cards are due', () => {
    const rig = makeRig();
    complete(rig, 'theory:u1:a');
    rig.actions.addReviewItems([{ id: 'fixture:a-fact-a', kind: FACT_CARD_KIND, ref: 'a' }, { id: 'fixture:a-fact-b', kind: FACT_CARD_KIND, ref: 'a' }]);
    // Brand-new cards are not "due" on the map: the lesson was only just finished.
    expect(lessonNode(courseMap(FIXTURE, rig.store.getState(), rig.clock.now()), 'a')).toMatchObject({ dueCards: 0, dueForReview: false });
    rig.actions.gradeReview('fixture:a-fact-a', 'again');
    expect(lessonNode(courseMap(FIXTURE, rig.store.getState(), rig.clock.now()), 'a')!.dueCards).toBe(0);
    rig.clock.minutes(2);
    const map = courseMap(FIXTURE, rig.store.getState(), rig.clock.now());
    expect(lessonNode(map, 'a')).toMatchObject({ dueCards: 1, dueForReview: true });
    expect(map.dueCards).toBe(1);
    // A graduated card is due again on its day.
    rig.actions.gradeReview('fixture:a-fact-b', 'easy');
    rig.clock.days(4);
    rig.store.tick();
    expect(lessonNode(courseMap(FIXTURE, rig.store.getState(), rig.clock.now()), 'a')!.dueCards).toBe(2);
  });
});

describe('checkpoints on the map', () => {
  it('a checkpoint is open on every unit not passed yet (testing out may jump ahead), and says what it would complete', () => {
    const rig = makeRig();
    const map = courseMap(FIXTURE, rig.store.getState(), rig.clock.now());
    expect(map.units[0].checkpoint).toEqual({ state: 'available', ahead: false, completes: ['a', 'b', 'c'] });
    // Unit 2 is not reached yet, but its checkpoint lets a learner who knows it jump there.
    expect(map.units[1].state).toBe('locked');
    expect(map.units[1].checkpoint).toEqual({ state: 'available', ahead: true, completes: ['d', 'e'] });
    complete(rig, 'theory:u1:a');
    const later = courseMap(FIXTURE, rig.store.getState(), rig.clock.now());
    expect(later.units[0].checkpoint).toEqual({ state: 'available', ahead: false, completes: ['b', 'c'] });
    expect(later.units[1].checkpoint).toMatchObject({ state: 'available', ahead: false });
  });

  it('jumping ahead: passing a later unit marks it done and leaves the earlier unit to do', () => {
    const rig = makeRig();
    const predicted = checkpointUnlocks(FIXTURE, 'u2', rig.store.getState(), rig.clock.now());
    expect(predicted.completes).toEqual(['d', 'e']);
    for (const id of predicted.completes) rig.actions.markSkill(`theory:u2:${id}`, { completed: true, masteryAtLeast: 1 });
    const map = courseMap(FIXTURE, rig.store.getState(), rig.clock.now());
    expect(map.units[1]).toMatchObject({ state: 'done', checkpoint: { state: 'passed', ahead: false, completes: [] } });
    expect(map.next).toEqual({ unitId: 'u1', lessonId: 'a' });
  });

  it('checkpointUnlocks: what passing would complete and open', () => {
    const rig = makeRig();
    expect(checkpointUnlocks(FIXTURE, 'u1', rig.store.getState(), rig.clock.now())).toEqual({ completes: ['a', 'b', 'c'], unlocks: ['d', 'e'], next: { unitId: 'u2', lessonId: 'd' } });
    complete(rig, 'theory:u1:a');
    // "e" is already open, so only "d" is newly unlocked.
    expect(checkpointUnlocks(FIXTURE, 'u1', rig.store.getState(), rig.clock.now())).toEqual({ completes: ['b', 'c'], unlocks: ['d'], next: { unitId: 'u2', lessonId: 'd' } });
    expect(checkpointUnlocks(FIXTURE, 'u2', rig.store.getState(), rig.clock.now())).toEqual({ completes: ['d', 'e'], unlocks: [], next: { unitId: 'u1', lessonId: 'b' } });
    expect(checkpointUnlocks(FIXTURE, 'nope', rig.store.getState(), rig.clock.now())).toEqual({ completes: [], unlocks: [], next: { unitId: 'u1', lessonId: 'b' } });
  });

  it('marking the skills (what a passed checkpoint does) makes the map agree with the prediction', () => {
    const rig = makeRig();
    const predicted = checkpointUnlocks(FIXTURE, 'u1', rig.store.getState(), rig.clock.now());
    for (const id of predicted.completes) rig.actions.markSkill(`theory:u1:${id}`, { completed: true, masteryAtLeast: 1 });
    const map = courseMap(FIXTURE, rig.store.getState(), rig.clock.now());
    expect(map.next).toEqual(predicted.next);
    expect(map.units[0].state).toBe('done');
    expect(predicted.unlocks.every((id) => lessonNode(map, id)!.state !== 'locked')).toBe(true);
    expect(lessonNode(map, 'a')).toMatchObject({ crown: 1, completions: 0 });
  });
});

describe('the demo course on the map', () => {
  it('is a straight path of eight lessons in two units, each with a checkpoint', () => {
    const rig = makeRig();
    const map = courseMap(DEMO_COURSE, rig.store.getState(), rig.clock.now());
    expect(map.total).toBe(8);
    expect(map.units.map((u) => [u.id, u.total, u.state, u.checkpoint?.state, u.checkpoint?.ahead])).toEqual([
      ['first-notes', 4, 'current', 'available', false],
      ['building-blocks', 4, 'locked', 'available', true],
    ]);
    expect(map.next).toEqual({ unitId: 'first-notes', lessonId: 'musical-alphabet' });
    for (const { lesson } of lessonsInOrder(DEMO_COURSE)) {
      complete(rig, lesson.skill);
    }
    expect(courseMap(DEMO_COURSE, rig.store.getState(), rig.clock.now())).toMatchObject({ finished: true, done: 8, crowns: 8 });
  });
});
