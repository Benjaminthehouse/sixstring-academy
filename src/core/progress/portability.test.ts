import { describe, expect, it } from 'vitest';
import { createActions } from './actions';
import { ACHIEVEMENT_BY_ID } from './achievements';
import { ACHIEVEMENT_GEMS, FREE_COSMETICS } from './catalog';
import { createInitialState } from './defaults';
import { mergeStates } from './merge';
import { APP_ID, SCHEMA_VERSION, changeStamp } from './persist';
import { selectLevel } from './selectors';
import { makeRig, type TestRig } from './testkit';
import type { ProgressState } from './types';

function practise(rig: TestRig, days: number, tag: string): void {
  for (let d = 0; d < days; d++) {
    rig.actions.recordActivity({ kind: 'theory-lesson', id: `theory:${tag}:lesson-${d}`, accuracy: 0.9, durationSec: 200 });
    rig.actions.recordActivity({ kind: 'song', id: `song:${tag}-${d % 2}`, accuracy: 0.85, durationSec: 150, route: 'play', params: [`${tag}-${d % 2}`], title: `Song ${tag} ${d % 2}` });
    rig.actions.recordActivity({ kind: 'scale-game', id: 'scale:a-minor-pentatonic:box-1', accuracy: 0.96, combo: 9 });
    rig.clock.days(1);
  }
}

/** Compare two states ignoring the bookkeeping that an import legitimately changes. */
function comparable(state: ProgressState): Omit<ProgressState, 'meta'> & { meta: Partial<ProgressState['meta']> } {
  const { rev: _rev, updatedAt: _updatedAt, deviceId: _deviceId, ...meta } = state.meta;
  return { ...state, meta };
}

describe('export', () => {
  it('is one JSON object with everything in it', () => {
    const rig = makeRig();
    practise(rig, 3, 'a');
    const file = rig.actions.exportProgress();
    expect(file).toMatchObject({ app: APP_ID, kind: 'progress-export', v: SCHEMA_VERSION, exportedAt: rig.clock.t, stamp: rig.actions.changeStamp() });
    expect(file.state).toBe(rig.store.getState());
    expect(JSON.parse(JSON.stringify(file))).toEqual(file);
  });
});

describe('import with replace', () => {
  it('round-trips through JSON text into another install', () => {
    const source = makeRig({ deviceId: 'device-a' });
    source.actions.completeOnboarding({ name: 'Ana', experience: 'expert', dailyGoalXp: 50 });
    source.actions.setPrefs({ theme: 'dark', handedness: 'left', a4: 438 });
    practise(source, 4, 'a');
    source.actions.addReviewItems([{ id: 'fact:1', kind: 'theory-fact' }]);
    source.actions.gradeReview('fact:1', 'good');
    source.actions.toggleFavourite({ kind: 'scale', id: 'a-minor-pentatonic', title: 'A minor pentatonic' });
    const text = JSON.stringify(source.actions.exportProgress());

    const target = makeRig({ deviceId: 'device-b', start: source.clock.t });
    practise(target, 1, 'b'); // something that must disappear
    target.clock.set(source.clock.t);
    expect(target.actions.importProgress(text, 'replace')).toEqual({ ok: true, strategy: 'replace', schema: SCHEMA_VERSION });

    expect(comparable(target.store.getState())).toEqual(comparable(source.store.getState()));
    expect(target.store.getState().meta.deviceId).toBe('device-b'); // still this install
    expect(target.store.getState().skills['theory:b:lesson-0']).toBeUndefined();
    expect(target.eventsOf('data-imported').at(-1)).toMatchObject({ strategy: 'replace' });

    // And the import is what gets saved.
    target.store.flush();
    const reloaded = makeRig({ storage: target.storage, start: source.clock.t });
    expect(reloaded.store.getState()).toEqual(target.store.getState());
  });

  it('accepts the parsed object as well as the text, and a raw save envelope', () => {
    const source = makeRig();
    practise(source, 2, 'a');
    const file = source.actions.exportProgress();
    const a = makeRig({ start: source.clock.t });
    expect(a.actions.importProgress(file).ok).toBe(true);
    expect(a.store.getState().xp.total).toBe(source.store.getState().xp.total);

    source.store.flush();
    const b = makeRig({ start: source.clock.t });
    expect(b.actions.importProgress(source.storage.read('progress')).ok).toBe(true);
    expect(b.store.getState().xp.total).toBe(source.store.getState().xp.total);
  });

  it('does not flood the shell with events for what the imported data already earned', () => {
    const source = makeRig();
    practise(source, 5, 'a');
    const target = makeRig({ start: source.clock.t });
    target.actions.importProgress(source.actions.exportProgress());
    expect(target.events.map((e) => e.type)).toEqual(['data-imported']);
    expect(Object.keys(target.store.getState().achievements).sort()).toEqual(Object.keys(source.store.getState().achievements).sort());
  });

  it('rolls an old export forward to today', () => {
    const source = makeRig({ start: '2026-01-10T10:00:00Z' });
    practise(source, 3, 'a'); // streak 3, last goal day 2026-01-12
    const file = JSON.stringify(source.actions.exportProgress());
    const target = makeRig({ start: '2026-02-20T10:00:00Z' });
    target.actions.importProgress(file);
    const state = target.store.getState();
    expect(state.meta.today).toBe('2026-02-20');
    expect(state.streak).toMatchObject({ current: 0, longest: 3 });
    expect(state.quests.day).toBe('2026-02-20');
  });

  it('validates and rejects bad input without touching the state', () => {
    const rig = makeRig();
    practise(rig, 1, 'a');
    const before = rig.store.getState();
    expect(rig.actions.importProgress('not json at all')).toMatchObject({ ok: false, reason: 'not-json' });
    expect(rig.actions.importProgress('{"hello":"world"}')).toMatchObject({ ok: false, reason: 'not-an-export' });
    expect(rig.actions.importProgress({ app: 'other-app', v: 2, state: {} })).toMatchObject({ ok: false, reason: 'not-an-export' });
    expect(rig.actions.importProgress({ app: APP_ID, v: SCHEMA_VERSION + 1, state: before })).toMatchObject({ ok: false, reason: 'newer-version' });
    expect(rig.actions.importProgress(null)).toMatchObject({ ok: false, reason: 'not-an-export' });
    expect(rig.actions.importProgress(42)).toMatchObject({ ok: false, reason: 'not-an-export' });
    expect(rig.store.getState()).toBe(before);
    expect(rig.eventsOf('data-imported')).toHaveLength(0);
  });

  it('sanitises a tampered export instead of trusting it', () => {
    const source = makeRig();
    practise(source, 1, 'a');
    const file = JSON.parse(JSON.stringify(source.actions.exportProgress()));
    file.state.gems.balance = -500;
    file.state.hearts.count = 99;
    file.state.prefs.a4 = 1000;
    file.state.streak.freezes = 50;
    file.state.cosmetics.push('wood-of-legends');
    const target = makeRig({ start: source.clock.t });
    expect(target.actions.importProgress(file).ok).toBe(true);
    const s = target.store.getState();
    expect(s.gems.balance).toBe(0);
    expect(s.hearts.count).toBe(5);
    expect(s.prefs.a4).toBe(466);
    expect(s.streak.freezes).toBe(2);
    expect(s.cosmetics).toEqual(FREE_COSMETICS);
  });
});

describe('import with newest-wins', () => {
  /** Two installs that share a history and then diverge. */
  function diverged() {
    const a = makeRig({ deviceId: 'device-a', start: '2026-03-02T09:00:00Z' });
    practise(a, 3, 'shared'); // 03-02..03-04
    const shared = JSON.stringify(a.actions.exportProgress());
    const b = makeRig({ deviceId: 'device-b', start: a.clock.t });
    b.actions.importProgress(shared);
    b.events.length = 0;

    // A keeps practising on the phone; B on the laptop, a day later, with other things.
    practise(a, 1, 'phone'); // 03-05
    a.actions.setPrefs({ theme: 'dark' });
    a.actions.toggleFavourite({ kind: 'song', id: 'phone-song', title: 'Phone song' });

    b.clock.set(a.clock.t); // 03-06
    practise(b, 2, 'laptop'); // 03-06, 03-07
    b.actions.setPrefs({ theme: 'light', a4: 443 });
    b.actions.toggleFavourite({ kind: 'song', id: 'laptop-song', title: 'Laptop song' });
    b.actions.grantGems(100, 'test');
    b.actions.buy('inlay-offset-dots');
    return { a, b };
  }

  it('keeps the work of both sides', () => {
    const { a, b } = diverged();
    const fileB = JSON.stringify(b.actions.exportProgress());
    a.clock.set(b.clock.t);
    expect(a.actions.importProgress(fileB, 'newest-wins')).toMatchObject({ ok: true, strategy: 'newest-wins' });
    const merged = a.store.getState();
    const sa = diverged().a.store.getState();
    const sb = b.store.getState();

    // Skills, days, log, favourites and achievements from both sides.
    for (const id of ['theory:shared:lesson-0', 'theory:phone:lesson-0', 'theory:laptop:lesson-1']) expect(merged.skills[id], id).toBeDefined();
    expect(Object.keys(merged.days)).toEqual(['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07']);
    expect(merged.days['2026-03-05']).toEqual(sa.days['2026-03-05']);
    expect(merged.days['2026-03-07']).toEqual(sb.days['2026-03-07']);
    expect(Object.keys(merged.favourites).sort()).toEqual(['song:laptop-song', 'song:phone-song']);
    expect(merged.log.length).toBe(new Set([...sa.log, ...sb.log].map((s) => s.id)).size);
    for (let i = 1; i < merged.log.length; i++) expect(merged.log[i - 1].startedAt).toBeGreaterThanOrEqual(merged.log[i].startedAt);
    for (const id of [...Object.keys(sa.achievements), ...Object.keys(sb.achievements)]) expect(merged.achievements[id], id).toBeDefined();

    // Bests and counters take the larger value.
    const box = 'scale:a-minor-pentatonic:box-1';
    expect(merged.skills[box].attempts).toBe(Math.max(sa.skills[box].attempts, sb.skills[box].attempts));
    expect(merged.skills[box].mastery).toBe(Math.max(sa.skills[box].mastery, sb.skills[box].mastery));
    // XP: the shared history once, plus what each side earned on its own days.
    const sharedXp = ['2026-03-02', '2026-03-03', '2026-03-04'].reduce((sum, day) => sum + merged.days[day].xp, 0);
    expect(merged.xp.total).toBe(sa.xp.total + sb.xp.total - sharedXp);
    expect(merged.xp.total).toBeGreaterThan(Math.max(sa.xp.total, sb.xp.total));
    expect(merged.stats['count.song']).toBe(Math.max(sa.stats['count.song'], sb.stats['count.song']));

    // Preferences, streak and quests come from the side that changed them last (B).
    expect(merged.prefs).toMatchObject({ theme: 'light', a4: 443 });
    expect(merged.streak.lastGoalDay).toBe('2026-03-07');
    expect(merged.streak.current).toBe(sb.streak.current);
    // Gems: the larger earned and spent totals (both B's here), plus whatever the combined progress newly unlocked.
    const newlyUnlocked = Object.keys(merged.achievements).filter((id) => !sa.achievements[id] && !sb.achievements[id]);
    const bonus = newlyUnlocked.reduce((sum, id) => sum + ACHIEVEMENT_GEMS[ACHIEVEMENT_BY_ID[id].tier], 0);
    expect(merged.gems.balance).toBe(sb.gems.balance + bonus);
    expect(merged.cosmetics).toContain('inlay-offset-dots');
    expect(merged.meta.deviceId).toBe('device-a');
    expect(merged.meta.rev).toBeGreaterThan(Math.max(sa.meta.rev, sb.meta.rev));
  });

  it('adds up earning on one side and spending on the other', () => {
    const a = makeRig({ deviceId: 'device-a' });
    a.actions.grantGems(200, 'test');
    const b = makeRig({ deviceId: 'device-b', start: a.clock.t });
    b.actions.importProgress(a.actions.exportProgress());
    a.clock.minutes(5);
    a.actions.grantGems(10, 'test'); // A earns
    b.clock.minutes(10);
    expect(b.actions.buy('streak-freeze').ok).toBe(true); // B spends, later
    a.clock.set(b.clock.t);
    a.actions.importProgress(b.actions.exportProgress(), 'newest-wins');
    expect(a.store.getState().gems).toEqual({ balance: 150, earned: 210, spent: 60 });
    expect(a.store.getState().streak.freezes).toBe(1);
    // The other direction agrees.
    const again = makeRig({ deviceId: 'device-b', start: b.clock.t });
    again.actions.importProgress(b.actions.exportProgress());
    const fileA = { ...a.actions.exportProgress() };
    again.actions.importProgress(fileA, 'newest-wins');
    expect(again.store.getState().gems).toEqual({ balance: 150, earned: 210, spent: 60 });
  });

  it('gives the same learner-facing result in both directions', () => {
    const one = diverged();
    const two = diverged();
    const fileB = JSON.stringify(one.b.actions.exportProgress());
    const fileA = JSON.stringify(two.a.actions.exportProgress());
    one.a.clock.set(one.b.clock.t);
    two.b.clock.set(one.b.clock.t);
    one.a.actions.importProgress(fileB, 'newest-wins');
    two.b.actions.importProgress(fileA, 'newest-wins');
    const ab = one.a.store.getState();
    const ba = two.b.store.getState();
    expect(ab.skills).toEqual(ba.skills);
    expect(ab.days).toEqual(ba.days);
    expect(ab.xp.total).toBe(ba.xp.total);
    expect(ab.streak).toEqual(ba.streak);
    expect(ab.prefs).toEqual(ba.prefs);
    expect(ab.favourites).toEqual(ba.favourites);
    expect(Object.keys(ab.achievements).sort()).toEqual(Object.keys(ba.achievements).sort());
    expect(ab.log.map((s) => s.id).sort()).toEqual(ba.log.map((s) => s.id).sort());
    expect(selectLevel(ab).level).toBe(selectLevel(ba).level);
  });

  it('is idempotent: merging the same file twice changes nothing more', () => {
    const { a, b } = diverged();
    const fileB = JSON.stringify(b.actions.exportProgress());
    a.clock.set(b.clock.t);
    a.actions.importProgress(fileB, 'newest-wins');
    const once = comparable(a.store.getState());
    a.actions.importProgress(fileB, 'newest-wins');
    expect(comparable(a.store.getState())).toEqual(once);
  });

  it('merging a state with itself keeps it', () => {
    const rig = makeRig();
    practise(rig, 3, 'a');
    const state = rig.store.getState();
    expect(comparable(mergeStates(state, state, rig.clock.t))).toEqual(comparable(state));
  });

  it('never mutates its inputs', () => {
    const { a, b } = diverged();
    const sa = a.store.getState();
    const sb = b.store.getState();
    const snapshotA = JSON.stringify(sa);
    const snapshotB = JSON.stringify(sb);
    mergeStates(sa, sb, b.clock.t);
    expect(JSON.stringify(sa)).toBe(snapshotA);
    expect(JSON.stringify(sb)).toBe(snapshotB);
  });
});

describe('reset', () => {
  it('erases everything', () => {
    const rig = makeRig({ deviceId: 'device-a' });
    rig.actions.completeOnboarding({ name: 'Ana', dailyGoalXp: 30 });
    rig.actions.setPrefs({ theme: 'dark' });
    practise(rig, 3, 'a');
    const revBefore = rig.store.getState().meta.rev;
    rig.actions.resetProgress();
    const state = rig.store.getState();
    const fresh = createInitialState({ now: rig.clock.t, timeZone: 'UTC', deviceId: 'device-a' });
    expect(comparable(state)).toEqual(comparable(fresh));
    expect(state.meta.deviceId).toBe('device-a');
    expect(state.meta.rev).toBeGreaterThan(revBefore); // the change-stamp keeps moving forward
    expect(rig.eventsOf('data-reset')).toHaveLength(1);
    rig.store.flush();
    expect(makeRig({ storage: rig.storage, start: rig.clock.t }).store.getState().xp.total).toBe(0);
  });

  it('can keep the profile and preferences', () => {
    const rig = makeRig();
    rig.actions.completeOnboarding({ name: 'Ana', experience: 'intermediate', dailyGoalXp: 30, handedness: 'left' });
    rig.actions.grantGems(200, 'test');
    rig.actions.buy('wood-ebony');
    rig.actions.equipCosmetic('wood-ebony');
    rig.actions.setPrefs({ theme: 'dark', a4: 432 });
    practise(rig, 2, 'a');
    rig.actions.resetProgress({ keepPrefs: true });
    const state = rig.store.getState();
    expect(state.profile).toMatchObject({ name: 'Ana', experience: 'intermediate', teacher: 'dev', onboarded: true });
    expect(state.prefs).toMatchObject({ theme: 'dark', a4: 432, dailyGoalXp: 30, handedness: 'left' });
    // The paid wood is gone with the gems, so the board falls back to a free one.
    expect(state.cosmetics).toEqual(FREE_COSMETICS);
    expect(state.prefs.fretboard.wood).toBe('wood-rosewood');
    expect(state.xp.total).toBe(0);
    expect(state.skills).toEqual({});
    expect(state.achievements).toEqual({});
    expect(state.gems.balance).toBe(0);
  });
});

describe('change-stamp', () => {
  it('changes with every change and only then', () => {
    const rig = makeRig({ deviceId: 'device-a' });
    const stamps = new Set<string>([rig.actions.changeStamp()]);
    const expectNew = () => {
      const stamp = rig.actions.changeStamp();
      expect(stamps.has(stamp)).toBe(false);
      stamps.add(stamp);
      expect(stamp).toBe(changeStamp(rig.store.getState()));
    };
    rig.actions.recordActivity({ kind: 'tuner' });
    expectNew();
    rig.actions.setPrefs({ theme: 'dark' });
    expectNew();
    rig.actions.toggleFavourite({ kind: 'song', id: 'x' });
    expectNew();
    rig.clock.days(1);
    rig.store.tick();
    expectNew();
    rig.actions.resetProgress();
    expectNew();

    // No change, no new stamp.
    const before = rig.actions.changeStamp();
    rig.store.tick();
    rig.actions.setPrefs({});
    rig.actions.setFavourite({ kind: 'song', id: 'nope' }, false);
    rig.actions.gradeReview('missing', 'good');
    expect(rig.actions.changeStamp()).toBe(before);
  });

  it('is compact and names the install', () => {
    const rig = makeRig({ deviceId: 'device-a' });
    rig.actions.recordActivity({ kind: 'tuner' });
    const stamp = rig.actions.changeStamp();
    expect(stamp).toMatch(/^device-a\.[0-9a-z]+\.[0-9a-z]+$/);
    expect(stamp.length).toBeLessThan(40);
  });

  it('can be used by a sync layer through subscribe', () => {
    const rig = makeRig();
    const uploads: string[] = [];
    let last = rig.store.changeStamp();
    rig.store.subscribe(() => {
      const stamp = rig.store.changeStamp();
      if (stamp !== last) {
        last = stamp;
        uploads.push(stamp);
      }
    });
    const actions = createActions(() => rig.store);
    actions.recordActivity({ kind: 'tuner' });
    actions.tick();
    actions.recordActivity({ kind: 'song' });
    expect(uploads).toHaveLength(2);
  });
});
