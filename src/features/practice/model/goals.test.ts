import { describe, expect, it } from 'vitest';
import { GOAL_SUGGESTIONS, MAX_OPEN_GOALS, achievedGoals, addGoal, editGoal, goalSignals, markGoal, openGoals, parseGoal, removeGoal, setGoalProgress, type FocusGoal } from './goals';

const NOW = Date.UTC(2026, 10, 15);

function three(): FocusGoal[] {
  let goals: FocusGoal[] = [];
  goals = addGoal(goals, { title: 'Clean F barre chord', area: 'chords', targetDay: '2026-11-30' }, NOW, 'a').goals;
  goals = addGoal(goals, { title: '  A minor   pentatonic at 100 BPM ', area: 'scales' }, NOW + 1, 'b').goals;
  goals = addGoal(goals, { title: 'Hear major and minor', area: 'ear', targetDay: '2026-11-20' }, NOW + 2, 'c').goals;
  return goals;
}

describe('focus goals', () => {
  it('keeps at most three open, refuses empty titles, tidies text', () => {
    const goals = three();
    expect(openGoals(goals)).toHaveLength(MAX_OPEN_GOALS);
    expect(goals[1].title).toBe('A minor pentatonic at 100 BPM');
    expect(addGoal(goals, { title: 'One more', area: 'rhythm' }, NOW, 'd').error).toBe('full');
    expect(addGoal([], { title: '   ', area: 'rhythm' }, NOW, 'd').error).toBe('empty');
  });

  it('gives the planner the nearest target date first, undated last', () => {
    expect(goalSignals(three(), '2026-11-15')).toEqual([
      { id: 'c', title: 'Hear major and minor', area: 'ear', daysLeft: 5 },
      { id: 'a', title: 'Clean F barre chord', area: 'chords', daysLeft: 15 },
      { id: 'b', title: 'A minor pentatonic at 100 BPM', area: 'scales', daysLeft: null },
    ]);
  });

  it('marks progress, achieves, reopens only with room, edits and removes', () => {
    let goals = setGoalProgress(three(), 'a', 140);
    expect(goals[0].progress).toBe(100);
    goals = setGoalProgress(goals, 'a', -3);
    expect(goals[0].progress).toBe(0);
    goals = markGoal(goals, 'a', true, NOW + 10);
    expect(achievedGoals(goals).map((g) => g.id)).toEqual(['a']);
    expect(goals.find((g) => g.id === 'a')?.progress).toBe(100);
    goals = addGoal(goals, { title: 'Strum D, DU, UDU at 80 BPM', area: 'rhythm' }, NOW, 'd').goals;
    expect(markGoal(goals, 'a', false, NOW).find((g) => g.id === 'a')?.doneAt).not.toBeNull(); // no room
    goals = removeGoal(goals, 'd');
    expect(markGoal(goals, 'a', false, NOW).find((g) => g.id === 'a')?.doneAt).toBeNull();
    goals = editGoal(goals, 'b', { title: '', targetDay: '2026-12-01', area: 'technique' });
    expect(goals.find((g) => g.id === 'b')).toMatchObject({ title: 'A minor pentatonic at 100 BPM', targetDay: '2026-12-01', area: 'technique' });
  });

  it('reads saved goals safely and has suggestions for every level', () => {
    expect(parseGoal({ id: 'x', title: 'T', area: 'nope' })).toBeNull();
    expect(parseGoal({ id: 'x', title: 'T', area: 'ear', progress: 250, targetDay: 'soon' })).toMatchObject({ progress: 100, targetDay: null, doneAt: null });
    for (const list of Object.values(GOAL_SUGGESTIONS)) expect(list.length).toBeGreaterThanOrEqual(3);
  });
});
