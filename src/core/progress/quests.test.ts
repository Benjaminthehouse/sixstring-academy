import { describe, expect, it } from 'vitest';
import { QUEST_SWEEP_GEMS } from './catalog';
import { xpForLevel } from './levels';
import { DAILY_QUESTS, QUEST_BY_ID, QUEST_SLOTS, WEEKLY_QUESTS, advanceQuest, describeQuest, pickDailyQuests, pickWeeklyQuest, questBand } from './quests';
import { selectQuests } from './selectors';
import { addDays, weekStartOf } from './time';
import { makeRig, type TestRig } from './testkit';
import type { ActivityInput, QuestInstance, QuestMetric } from './types';

const DAY0 = '2026-01-01';
const days = (n: number): string[] => Array.from({ length: n }, (_, i) => addDays(DAY0, i));

describe('quest catalog', () => {
  it('is varied and well formed', () => {
    expect(DAILY_QUESTS.length).toBeGreaterThanOrEqual(18);
    expect(WEEKLY_QUESTS.length).toBeGreaterThanOrEqual(5);
    const ids = [...DAILY_QUESTS, ...WEEKLY_QUESTS].map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const q of [...DAILY_QUESTS, ...WEEKLY_QUESTS]) {
      expect(q.targets[0]).toBeGreaterThan(0);
      expect(q.targets[1]).toBeGreaterThanOrEqual(q.targets[0]);
      expect(q.targets[2]).toBeGreaterThanOrEqual(q.targets[1]);
      expect(q.gems).toBeGreaterThan(0);
      for (const target of q.targets) expect(q.title(target).length).toBeGreaterThan(5);
      expect(q.title(q.targets[0])).not.toMatch(/!|#/);
      expect(q.hint.length).toBeGreaterThan(5);
      expect(q.route).toMatch(/^[a-z]+$/);
    }
    for (const q of DAILY_QUESTS) expect(QUEST_SLOTS).toContain(q.slot);
  });

  it('offers at least two quests per slot to a brand-new learner', () => {
    for (const slot of QUEST_SLOTS) expect(DAILY_QUESTS.filter((q) => q.slot === slot && q.minLevel <= 1).length).toBeGreaterThanOrEqual(2);
    expect(WEEKLY_QUESTS.filter((q) => q.minLevel <= 1).length).toBeGreaterThanOrEqual(3);
  });

  it('uses singular and plural titles correctly', () => {
    expect(QUEST_BY_ID['theory-lesson'].title(1)).toBe('Finish a theory lesson');
    expect(QUEST_BY_ID['theory-lesson'].title(2)).toBe('Finish 2 theory lessons');
    expect(QUEST_BY_ID['earn-xp'].title(30)).toBe('Earn 30 XP');
  });
});

describe('daily quest selection', () => {
  it('is a pure function of the date and the level', () => {
    for (const level of [1, 3, 7, 20]) {
      for (const day of days(30)) expect(pickDailyQuests(day, level)).toEqual(pickDailyQuests(day, level));
    }
    expect(pickDailyQuests('2026-05-17', 8)).toEqual(pickDailyQuests('2026-05-17', 8));
  });

  it('gives three quests, one per slot, all fresh', () => {
    for (const day of days(60)) {
      const quests = pickDailyQuests(day, 12);
      expect(quests).toHaveLength(3);
      expect(quests.map((q) => QUEST_BY_ID[q.id].slot)).toEqual(['core', 'study', 'play']);
      expect(new Set(quests.map((q) => q.metric)).size).toBe(3);
      for (const q of quests) expect(q).toMatchObject({ progress: 0, done: false, doneAt: null });
    }
  });

  it('changes from day to day and never repeats a quest on consecutive days', () => {
    for (const level of [1, 6, 30]) {
      const sequence = days(365).map((day) => pickDailyQuests(day, level).map((q) => q.id));
      for (let i = 1; i < sequence.length; i++) {
        for (let slot = 0; slot < 3; slot++) expect(sequence[i][slot]).not.toBe(sequence[i - 1][slot]);
      }
      expect(new Set(sequence.map((s) => s.join('|'))).size).toBeGreaterThan(level === 1 ? 5 : 40);
    }
  });

  it('eventually offers every quest the level allows, and none it does not', () => {
    for (const level of [1, 2, 3, 4, 10]) {
      const seen = new Set(days(120).flatMap((day) => pickDailyQuests(day, level).map((q) => q.id)));
      const allowed = DAILY_QUESTS.filter((q) => q.minLevel <= level).map((q) => q.id);
      expect([...seen].sort()).toEqual([...allowed].sort());
    }
  });

  it('scales targets with the level band', () => {
    expect([1, 4, 5, 14, 15, 60].map(questBand)).toEqual([0, 0, 1, 1, 2, 2]);
    for (const day of days(40)) {
      for (const [level, band] of [[2, 0], [9, 1], [25, 2]] as const) {
        for (const q of pickDailyQuests(day, level)) expect(q.target).toBe(QUEST_BY_ID[q.id].targets[band]);
      }
    }
  });

  it('picks a weekly challenge per week, deterministically', () => {
    const mondays = Array.from({ length: 30 }, (_, i) => addDays('2026-01-05', i * 7));
    const picks = mondays.map((monday) => pickWeeklyQuest(monday, 10).id);
    expect(picks).toEqual(mondays.map((monday) => pickWeeklyQuest(monday, 10).id));
    for (let i = 1; i < picks.length; i++) expect(picks[i]).not.toBe(picks[i - 1]);
    expect(new Set(picks).size).toBe(WEEKLY_QUESTS.length);
    expect(new Set(mondays.map((monday) => pickWeeklyQuest(monday, 1).id))).toEqual(new Set(WEEKLY_QUESTS.filter((q) => q.minLevel <= 1).map((q) => q.id)));
  });
});

describe('advanceQuest', () => {
  const quest = (metric: QuestMetric, target: number): QuestInstance => ({ id: 'x', metric, target, progress: 0, done: false, gems: 5, doneAt: null });

  it('adds up, clamps at the target and completes', () => {
    let q = advanceQuest(quest('xp', 30), 'xp', 12, 1);
    expect(q).toMatchObject({ progress: 12, done: false });
    q = advanceQuest(q, 'xp', 50, 2);
    expect(q).toEqual({ id: 'x', metric: 'xp', target: 30, progress: 30, done: true, gems: 5, doneAt: 2 });
  });

  it('ignores other metrics, non-positive amounts and finished quests', () => {
    const q = quest('xp', 30);
    expect(advanceQuest(q, 'minutes', 10, 1)).toBe(q);
    expect(advanceQuest(q, 'xp', 0, 1)).toBe(q);
    expect(advanceQuest(q, 'xp', Number.NaN, 1)).toBe(q);
    const done = advanceQuest(q, 'xp', 30, 1);
    expect(advanceQuest(done, 'xp', 5, 2)).toBe(done);
  });

  it('keeps the best value for combo and variety', () => {
    let q = advanceQuest(quest('combo', 10), 'combo', 6, 1);
    q = advanceQuest(q, 'combo', 4, 2);
    expect(q.progress).toBe(6);
    q = advanceQuest(q, 'combo', 12, 3);
    expect(q).toMatchObject({ progress: 10, done: true });
  });

  it('describes a quest with its texts and whole-unit progress', () => {
    const q: QuestInstance = { id: 'practice-minutes', metric: 'minutes', target: 10, progress: 3.75, done: false, gems: 5, doneAt: null };
    expect(describeQuest(q)).toEqual({
      id: 'practice-minutes',
      scope: 'daily',
      title: 'Practise for 10 minutes',
      hint: 'Time spent in lessons, games, songs and drills adds up.',
      icon: 'Clock',
      route: 'practice',
      progress: 3,
      target: 10,
      fraction: 0.375,
      done: false,
      gems: 5,
    });
    expect(describeQuest({ ...q, id: 'from-the-future' })).toMatchObject({ title: 'Quest', icon: 'Flag', route: 'home' });
  });
});

/** An activity (or a few) that fully satisfies a quest of the given metric and target. */
function satisfy(rig: TestRig, metric: QuestMetric, target: number): void {
  const act = (input: ActivityInput) => rig.actions.recordActivity({ xp: 0, ...input });
  switch (metric) {
    case 'xp':
      // A single award is capped at 250 XP.
      for (let left = target; left > 0; left -= 200) rig.actions.awardXp(Math.min(200, left), 'test');
      return;
    case 'goal':
      // One goal day per local day; weekly targets need several days.
      for (let i = 0; i < target; i++) {
        if (i > 0) rig.clock.days(1);
        rig.actions.awardXp(rig.store.getState().prefs.dailyGoalXp, 'test');
      }
      return;
    case 'minutes':
      act({ kind: 'practice', durationSec: target * 60 });
      return;
    case 'theory-lesson':
      for (let i = 0; i < target; i++) act({ kind: 'theory-lesson', id: `theory:unit-1:lesson-${i}`, accuracy: 0.8 });
      return;
    case 'teacher-lesson':
      for (let i = 0; i < target; i++) act({ kind: 'teacher-lesson', id: `teacher:mia:lesson-${i}` });
      return;
    case 'lessons':
      for (let i = 0; i < target; i++) act({ kind: i % 2 ? 'teacher-lesson' : 'theory-lesson' });
      return;
    case 'reviews': {
      rig.actions.addReviewItems(Array.from({ length: target }, (_, i) => ({ id: `q-card-${rig.clock.t}-${i}`, kind: 'theory-fact' })));
      const ids = Object.keys(rig.store.getState().srs.items).slice(-target);
      for (const id of ids) rig.actions.gradeReview(id, 'good');
      return;
    }
    case 'tune':
      for (let i = 0; i < target; i++) act({ kind: 'tuner' });
      return;
    case 'scale-game':
      for (let i = 0; i < target; i++) act({ kind: 'scale-game', accuracy: 0.5 });
      return;
    case 'scale-practice':
      for (let i = 0; i < target; i++) act({ kind: 'scale-practice' });
      return;
    case 'new-chord':
      for (let i = 0; i < target; i++) act({ kind: 'chord-practice', id: `chord:new-${rig.clock.t}-${i}` });
      return;
    case 'chord-changes':
      act({ kind: 'chord-change', id: 'chord-change:g-c', count: target });
      return;
    case 'song':
      for (let i = 0; i < target; i++) act({ kind: 'song', id: 'song:greensleeves' });
      return;
    case 'combo':
      act({ kind: 'scale-game', combo: target });
      return;
    case 'perfect':
      for (let i = 0; i < target; i++) act({ kind: 'theory-lesson', mistakes: 0 });
      return;
    case 'ear':
    case 'rhythm':
    case 'technique':
    case 'progression':
      for (let i = 0; i < target; i++) act({ kind: metric });
      return;
    case 'fretboard-notes':
      act({ kind: 'fretboard', count: target });
      return;
    case 'variety': {
      const kinds = ['tuner', 'song', 'ear', 'rhythm', 'technique', 'metronome'] as const;
      for (let i = 0; i < target; i++) act({ kind: kinds[i] });
      return;
    }
    case 'stars':
      for (let i = 0; i < Math.ceil(target / 3); i++) act({ kind: 'scale-game', accuracy: 1 });
      return;
    case 'accuracy-90':
      for (let i = 0; i < target; i++) act({ kind: 'ear', accuracy: 0.93 });
      return;
    default:
      throw new Error(`no way to satisfy ${String(metric)}`);
  }
}

/** A rig whose learner is at `level` and whose daily quests were replaced by the given template. */
function rigWithQuest(templateId: string, level: number): { rig: TestRig; quest: QuestInstance } {
  // Build a state at the right level, then find a day on which the template is picked.
  const template = QUEST_BY_ID[templateId];
  let day = '2026-06-01';
  for (let i = 0; i < 400; i++) {
    const picked = template.scope === 'daily' ? pickDailyQuests(day, level).some((q) => q.id === templateId) : pickWeeklyQuest(weekStartOf(day, 1), level).id === templateId;
    if (picked) break;
    day = addDays(day, 1);
  }
  const start = `${template.scope === 'weekly' ? weekStartOf(day, 1) : day}T08:00:00Z`;
  const seed = makeRig({ start });
  // Reach the level the day before, so today's quests are picked for it.
  seed.clock.days(-1);
  const rig = makeRig({ start: seed.clock.t });
  if (level > 1) {
    let left = xpForLevel(level);
    while (left > 0) {
      rig.actions.awardXp(Math.min(250, left), 'test');
      left -= 250;
    }
  }
  rig.clock.days(1);
  rig.store.tick();
  const quests = rig.store.getState().quests;
  const quest = template.scope === 'daily' ? quests.daily.find((q) => q.id === templateId) : quests.weekly;
  if (!quest || quest.id !== templateId) throw new Error(`template ${templateId} was not picked on ${day}`);
  rig.events.length = 0;
  return { rig, quest };
}

describe('quest progress in the store', () => {
  it('every daily quest can be completed by the activity it describes, at every band', () => {
    for (const template of DAILY_QUESTS) {
      for (const level of [Math.max(template.minLevel, 1), Math.max(template.minLevel, 6), 16]) {
        const { rig, quest } = rigWithQuest(template.id, level);
        expect(quest.target).toBe(template.targets[questBand(level)]);
        const gemsBefore = rig.store.getState().gems.earned;
        satisfy(rig, quest.metric, quest.target);
        const after = rig.store.getState().quests.daily.find((q) => q.id === template.id);
        expect(after, `${template.id} at level ${level}`).toMatchObject({ done: true, progress: quest.target });
        const completed = rig.eventsOf('quest-completed').filter((e) => e.id === template.id);
        expect(completed, `${template.id} at level ${level}`).toHaveLength(1);
        expect(completed[0]).toMatchObject({ scope: 'daily', gems: template.gems, title: template.title(quest.target) });
        expect(rig.store.getState().gems.earned).toBeGreaterThanOrEqual(gemsBefore + template.gems);
      }
    }
  });

  it('every weekly challenge can be completed, at every band', () => {
    for (const template of WEEKLY_QUESTS) {
      for (const level of [Math.max(template.minLevel, 1), Math.max(template.minLevel, 6), 16]) {
        const { rig, quest } = rigWithQuest(template.id, level);
        const wonBefore = rig.store.getState().stats['quests.weekly'] ?? 0;
        satisfy(rig, quest.metric, quest.target);
        expect(rig.store.getState().quests.weekly, `${template.id} at level ${level}`).toMatchObject({ id: template.id, done: true });
        const completed = rig.eventsOf('quest-completed').filter((e) => e.scope === 'weekly');
        expect(completed).toHaveLength(1);
        expect(completed[0].gems).toBe(template.gems);
        expect(rig.store.getState().stats['quests.weekly']).toBe(wonBefore + 1);
      }
    }
  });

  it('tracks partial progress and pays the gems exactly once', () => {
    const { rig, quest } = rigWithQuest('earn-xp', 1);
    expect(quest.target).toBe(15);
    const before = rig.store.getState().gems.balance;
    rig.actions.awardXp(6, 'test');
    expect(selectQuests(rig.store.getState()).daily.find((q) => q.id === 'earn-xp')).toMatchObject({ progress: 6, target: 15, done: false, fraction: 0.4 });
    rig.actions.awardXp(6, 'test');
    rig.actions.awardXp(6, 'test');
    rig.actions.awardXp(60, 'test');
    expect(rig.eventsOf('quest-completed').filter((e) => e.id === 'earn-xp')).toHaveLength(1);
    expect(selectQuests(rig.store.getState()).daily.find((q) => q.id === 'earn-xp')).toMatchObject({ progress: 15, done: true, fraction: 1 });
    expect(rig.store.getState().gems.balance).toBeGreaterThanOrEqual(before + 5);
  });

  it('pays a bonus once when all three daily quests are done', () => {
    const rig = makeRig({ start: '2026-04-10T08:00:00Z' });
    const before = rig.store.getState().quests.daily;
    expect(before).toHaveLength(3);
    for (const quest of before) satisfy(rig, quest.metric, quest.target);
    const view = selectQuests(rig.store.getState());
    expect(view).toMatchObject({ done: 3, allDone: true, sweepGems: QUEST_SWEEP_GEMS });
    expect(rig.eventsOf('quests-all-completed')).toEqual([{ type: 'quests-all-completed', at: expect.any(Number), day: '2026-04-10', gems: QUEST_SWEEP_GEMS }]);
    expect(rig.store.getState().stats).toMatchObject({ 'quests.daily': 3, 'quests.sweeps': 1 });
    expect(rig.store.getState().achievements['sweep-1']).toBeDefined();
    // More activity does not pay again.
    rig.actions.awardXp(100, 'test');
    expect(rig.eventsOf('quests-all-completed')).toHaveLength(1);
    expect(rig.eventsOf('quest-completed').filter((e) => e.scope === 'daily')).toHaveLength(3);
  });

  it('reports completed quests in the activity result', () => {
    const { rig } = rigWithQuest('tune', 1);
    const result = rig.actions.recordActivity({ kind: 'tuner', durationSec: 40 });
    expect(result.quests).toContain('tune');
    expect(result.gems).toBeGreaterThanOrEqual(5);
  });

  it('replaces the daily quests on a new day and keeps the weekly challenge for the week', () => {
    const rig = makeRig({ start: '2026-03-02T08:00:00Z' }); // a Monday
    const monday = rig.store.getState().quests;
    expect(monday).toMatchObject({ day: '2026-03-02', week: '2026-03-02' });
    expect(monday.daily).toEqual(pickDailyQuests('2026-03-02', 1));
    expect(monday.weekly).toEqual(pickWeeklyQuest('2026-03-02', 1));
    rig.actions.awardXp(5, 'test');
    const weeklyProgress = rig.store.getState().quests.weekly;

    rig.clock.days(1);
    rig.store.tick();
    const tuesday = rig.store.getState().quests;
    expect(tuesday.day).toBe('2026-03-03');
    expect(tuesday.daily).toEqual(pickDailyQuests('2026-03-03', 1));
    expect(tuesday.sweep).toBe(false);
    expect(tuesday.weekly).toEqual(weeklyProgress); // untouched within the week
    expect(selectQuests(rig.store.getState()).weekEnds).toBe('2026-03-08');

    rig.clock.days(6); // the next Monday
    rig.store.tick();
    const nextWeek = rig.store.getState().quests;
    expect(nextWeek.week).toBe('2026-03-09');
    expect(nextWeek.weekly).toEqual(pickWeeklyQuest('2026-03-09', 1));
  });

  it('does not swap today’s quests when the learner levels up during the day', () => {
    const rig = makeRig({ start: '2026-03-02T08:00:00Z' });
    const ids = rig.store.getState().quests.daily.map((q) => q.id);
    for (let i = 0; i < 4; i++) rig.actions.awardXp(250, 'test'); // level 1 -> 10
    expect(rig.store.getState().quests.daily.map((q) => q.id)).toEqual(ids);
    rig.clock.days(1);
    rig.store.tick();
    expect(rig.store.getState().quests.daily).toEqual(pickDailyQuests('2026-03-03', 10));
  });

  it('counts a weekly goal-days challenge once per day', () => {
    const { rig, quest } = rigWithQuest('week-goal-days', 1);
    rig.actions.awardXp(20, 'test');
    rig.actions.awardXp(20, 'test');
    expect(rig.store.getState().quests.weekly?.progress).toBe(1);
    rig.clock.days(1);
    rig.actions.awardXp(20, 'test');
    expect(rig.store.getState().quests.weekly?.progress).toBe(2);
    expect(quest.target).toBe(4);
  });
});
