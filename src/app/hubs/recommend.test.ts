import { describe, expect, it } from 'vitest';
import { QUEST_BY_ID, describeQuest, type QuestView, type RecentItem } from '@/core/progress';
import { ROUTE_BY_NAME } from '../routes';
import { hubRoutes } from '../shell/nav';
import { availabilityFrom } from '../shell/media';
import { STUDIO_GROUPS, arrangeGroups, unavailableDevices } from './groups';
import { LEVEL_PICKS, recommend, type RecommendContext } from './recommend';

const base: RecommendContext = { experience: 'beginner', teacher: 'mia', recents: [], quests: [], dueReviews: 0, tunedToday: false };
const recent = (route: string, params: string[], fraction: number, title = 'Thing'): RecentItem => ({ key: `${route}/${params.join('/')}`, route, params, title, kind: route === 'play' ? 'song' : 'theory-lesson', fraction, at: 1 });
const questView = (id: string, progress = 0): QuestView => {
  const template = QUEST_BY_ID[id];
  return describeQuest({ id, metric: template.metric, target: template.targets[0], progress, done: false, gems: template.gems, doneAt: null });
};

describe('LEVEL_PICKS', () => {
  it('only point at real screens of their own section', () => {
    for (const section of ['learn', 'play', 'tools'] as const) {
      for (const level of ['beginner', 'intermediate', 'expert'] as const) {
        const picks = LEVEL_PICKS[section][level];
        expect(picks.length).toBeGreaterThanOrEqual(2);
        for (const pick of picks) {
          expect(ROUTE_BY_NAME[pick.route], pick.route).toBeDefined();
          expect(ROUTE_BY_NAME[pick.route].section).toBe(section);
        }
      }
    }
  });
});

describe('recommend', () => {
  it('always has something for a brand-new learner, on every hub and level', () => {
    for (const section of ['learn', 'play', 'tools'] as const) {
      for (const experience of ['beginner', 'intermediate', 'expert'] as const) {
        const out = recommend(section, { ...base, experience });
        expect(out.length, `${section}/${experience}`).toBeGreaterThanOrEqual(2);
        expect(out.length).toBeLessThanOrEqual(3);
        expect(new Set(out.map((r) => r.key)).size).toBe(out.length);
        for (const r of out) expect(ROUTE_BY_NAME[r.route].section).toBe(section);
      }
    }
  });

  it('puts tuning first on Tools until the guitar was tuned today', () => {
    expect(recommend('tools', base)[0]).toMatchObject({ route: 'tuner', reason: 'Before you play' });
    expect(recommend('tools', { ...base, tunedToday: true }).some((r) => r.route === 'tuner')).toBe(false);
  });

  it('leads with something left half done in that section only', () => {
    const recents = [recent('play', ['greensleeves'], 0.6, 'Greensleeves'), recent('teachers', ['mia', 'lesson-2'], 0.3, 'Holding the pick')];
    const play = recommend('play', { ...base, recents });
    expect(play[0]).toMatchObject({ route: 'play', params: ['greensleeves'], title: 'Greensleeves', reason: 'Pick up where you left off', progress: 0.6 });
    expect(play[0].detail).toContain('60%');
    const learn = recommend('learn', { ...base, recents });
    expect(learn[0]).toMatchObject({ route: 'teachers', params: ['mia', 'lesson-2'] });
    expect(recommend('tools', { ...base, recents })[0].route).toBe('tuner');
  });

  it('offers a finished item again, after the more useful suggestions', () => {
    const out = recommend('play', { ...base, recents: [recent('play', ['greensleeves'], 1, 'Greensleeves')] });
    const again = out.find((r) => r.reason === 'Go again');
    expect(again).toMatchObject({ route: 'play', params: ['greensleeves'] });
    expect(again?.progress).toBeUndefined();
  });

  it('does not suggest going again for a bare tool screen', () => {
    const out = recommend('tools', { ...base, tunedToday: true, recents: [{ ...recent('tuner', [], 1, 'Tuner'), kind: 'tuner' }] });
    expect(out.some((r) => r.reason === 'Go again')).toBe(false);
  });

  it('names the learner\'s teacher and due reviews on Learn', () => {
    const out = recommend('learn', { ...base, experience: 'expert', teacher: 'elena', dueReviews: 7 });
    expect(out[0]).toMatchObject({ route: 'learn', title: 'Review 7 cards' });
    expect(out[1]).toMatchObject({ route: 'teachers', params: ['elena'], title: 'Learn with Prof. Elena Varga' });
    expect(recommend('learn', { ...base, dueReviews: 1 })[0].title).toBe('Review 1 card');
  });

  it('features a quest that lives in the section, with its progress', () => {
    const out = recommend('play', { ...base, quests: [questView('tune'), questView('new-chord')] });
    const quest = out.find((r) => r.reason === "Today's quest");
    expect(quest).toMatchObject({ route: 'chords' });
    expect(recommend('tools', { ...base, tunedToday: true, quests: [questView('tune')] })[0]).toMatchObject({ route: 'tuner', reason: "Today's quest" });
  });

  it('skips a quest that is already done', () => {
    const done = { ...questView('new-chord'), done: true };
    expect(recommend('play', { ...base, quests: [done] }).some((r) => r.reason === "Today's quest")).toBe(false);
  });

  it('never shows the same screen twice', () => {
    const out = recommend('play', { ...base, quests: [questView('new-chord')] });
    expect(out.filter((r) => r.route === 'chords')).toHaveLength(1);
  });

  it('ignores recents that point at screens which no longer exist', () => {
    const out = recommend('play', { ...base, recents: [recent('gone', ['x'], 0.5)] });
    expect(out.every((r) => ROUTE_BY_NAME[r.route])).toBe(true);
  });
});

describe('arrangeGroups', () => {
  it('shows every Play screen exactly once', () => {
    const routes = hubRoutes('play');
    const arranged = arrangeGroups(routes, STUDIO_GROUPS, 'All');
    const names = arranged.flatMap((g) => g.routes.map((r) => r.name));
    expect([...names].sort()).toEqual(routes.map((r) => r.name).sort());
    expect(new Set(names).size).toBe(names.length);
    expect(arranged.map((g) => g.title)).not.toContain('More');
  });

  it('only names routes that exist in STUDIO_GROUPS', () => {
    for (const group of STUDIO_GROUPS) for (const name of group.routes) expect(ROUTE_BY_NAME[name]?.section, name).toBe('play');
  });

  it('puts routes nobody grouped under "More", and uses one group when none are given', () => {
    const routes = hubRoutes('play');
    const arranged = arrangeGroups(routes, [{ title: 'Some', routes: ['songs', 'not-a-route'] }], 'All');
    expect(arranged[0]).toMatchObject({ title: 'Some' });
    expect(arranged[0].routes.map((r) => r.name)).toEqual(['songs']);
    expect(arranged[1].title).toBe('More');
    expect(arranged[1].routes).toHaveLength(routes.length - 1);
    expect(arrangeGroups(routes, undefined, 'Everything')).toEqual([{ title: 'Everything', routes }]);
    expect(arrangeGroups([], undefined, 'Everything')).toEqual([]);
  });
});

describe('media availability', () => {
  it('is off inside an artifact, on plain http and without the API', () => {
    expect(availabilityFrom(true, true, true)).toEqual({ mic: false, camera: false, reason: 'blocked-by-host' });
    expect(availabilityFrom(false, false, true)).toEqual({ mic: false, camera: false, reason: 'insecure-context' });
    expect(availabilityFrom(false, false, false)).toEqual({ mic: false, camera: false, reason: 'unsupported' });
    expect(availabilityFrom(false, true, true)).toEqual({ mic: true, camera: true, reason: null });
  });

  it('marks exactly the screens that need a blocked device', () => {
    const blocked = availabilityFrom(true, true, true);
    const open = availabilityFrom(false, true, true);
    expect(unavailableDevices(ROUTE_BY_NAME.tuner, blocked)).toEqual(['microphone']);
    expect(unavailableDevices(ROUTE_BY_NAME.camera, blocked)).toEqual(['camera']);
    expect(unavailableDevices(ROUTE_BY_NAME.metronome, blocked)).toEqual([]);
    expect(unavailableDevices(ROUTE_BY_NAME.tuner, open)).toEqual([]);
  });
});
