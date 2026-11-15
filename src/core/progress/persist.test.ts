import { describe, expect, it } from 'vitest';
import { FREE_COSMETICS } from './catalog';
import { createInitialState, defaultPrefs } from './defaults';
import { MAX_DAYS, MAX_LOG, MAX_RECENTS } from './limits';
import { APP_ID, SCHEMA_VERSION, STORAGE_KEY, decodeState, encodeState, loadState, memoryStorage } from './persist';
import { pickDailyQuests } from './quests';
import { sanitizePrefs, sanitizeState } from './sanitize';
import { selectLevel, selectStreak } from './selectors';
import { addDays } from './time';
import { at, makeRig, manualTimers, testClock } from './testkit';
import { createProgressStore } from './store';
import type { ProgressState } from './types';

const NOW = at('2026-03-10T10:00:00Z');
const ENV = { now: NOW, timeZone: 'UTC', deviceId: 'dev-a' };

/** A store with some real history in it. */
function seasoned() {
  const rig = makeRig({ start: '2026-03-02T09:00:00Z' });
  rig.actions.completeOnboarding({ name: 'Robin', experience: 'intermediate', dailyGoalXp: 30, handedness: 'left' });
  rig.actions.setPrefs({ theme: 'dark', a4: 442, noteNaming: 'german', sound: { volume: 0.4 }, mic: { deviceId: 'mic-1' } });
  for (let d = 0; d < 5; d++) {
    rig.actions.recordActivity({ kind: 'theory-lesson', id: `theory:unit-1:lesson-${d}`, accuracy: 0.9, durationSec: 200, route: 'learn', params: ['unit-1', `lesson-${d}`], title: `Lesson ${d}` });
    rig.actions.recordActivity({ kind: 'scale-game', id: 'scale:a-minor-pentatonic:box-1', accuracy: 0.97, combo: 14, durationSec: 100 });
    rig.actions.recordActivity({ kind: 'song', id: 'song:greensleeves', accuracy: 0.8, durationSec: 180, data: { tempo: 80 } });
    rig.clock.days(1);
  }
  rig.actions.addReviewItems([{ id: 'fact:1', kind: 'theory-fact', ref: 'u1' }, { id: 'fact:2', kind: 'theory-fact' }]);
  rig.actions.gradeReview('fact:1', 'easy');
  rig.actions.toggleFavourite({ kind: 'song', id: 'greensleeves', title: 'Greensleeves', route: 'play', params: ['greensleeves'] });
  rig.actions.loseHeart();
  return rig;
}

describe('encode / decode', () => {
  it('round-trips a state exactly', () => {
    const rig = seasoned();
    const state = rig.store.getState();
    const text = encodeState(state, rig.clock.t);
    const envelope = JSON.parse(text);
    expect(envelope).toMatchObject({ app: APP_ID, v: SCHEMA_VERSION, savedAt: rig.clock.t });
    const decoded = decodeState(text, { now: rig.clock.t, timeZone: 'UTC' });
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.state).toEqual(state);
    expect(decoded.version).toBe(SCHEMA_VERSION);
    expect(decoded.report.reset).toEqual([]);
  });

  it('is stable: sanitising a valid state changes nothing', () => {
    const state = seasoned().store.getState();
    expect(sanitizeState(state, ENV)).toEqual(state);
    expect(sanitizeState(JSON.parse(JSON.stringify(state)), ENV)).toEqual(state);
  });

  it('rejects things that are not our data', () => {
    expect(decodeState('{ not json', ENV)).toMatchObject({ ok: false, reason: 'not-json' });
    expect(decodeState('[1,2,3]', ENV)).toMatchObject({ ok: false, reason: 'not-an-export' });
    expect(decodeState('"hello"', ENV)).toMatchObject({ ok: false, reason: 'not-an-export' });
    expect(decodeState({ some: 'object' }, ENV)).toMatchObject({ ok: false, reason: 'not-an-export' });
    expect(decodeState({ app: 'another-app', v: 2, state: {} }, ENV)).toMatchObject({ ok: false, reason: 'not-an-export' });
    expect(decodeState({ app: APP_ID, v: 2, state: { unrelated: true } }, ENV)).toMatchObject({ ok: false, reason: 'not-an-export' });
    expect(decodeState({ app: APP_ID, v: 2 }, ENV)).toMatchObject({ ok: false, reason: 'not-an-export' });
    expect(decodeState({ app: APP_ID, v: 99, state: { profile: {} } }, ENV)).toMatchObject({ ok: false, reason: 'newer-version' });
  });

  it('reads a newer version on a best-effort basis only when asked to', () => {
    const state = seasoned().store.getState();
    const future = { app: APP_ID, v: SCHEMA_VERSION + 3, savedAt: NOW, state: { ...state, somethingNew: { a: 1 } } };
    const decoded = decodeState(future, ENV, { allowNewer: true });
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.state.xp).toEqual(state.xp);
      expect('somethingNew' in decoded.state).toBe(false);
    }
  });
});

describe('migration from version 1', () => {
  const v1 = {
    v: 1,
    name: '  Sam  ',
    avatar: 'flame',
    level: 'intermediate',
    teacher: 'dev',
    onboarded: true,
    xp: 340,
    xpByDay: { '2026-03-07': 30, '2026-03-08': 25, '2026-03-09': 10, 'not-a-day': 99, '2026-03-06': -4 },
    dailyGoal: 20,
    streak: 2,
    bestStreak: 9,
    streakDay: '2026-03-08',
    freezes: 1,
    hearts: 3,
    heartsAt: NOW - 5 * 60_000,
    gems: 120,
    settings: { theme: 'dark', leftHanded: true, a4: 442, tuning: 'drop-d', volume: 0.6, uiSounds: false, solfege: true, showDegrees: true, notation: 'tab+notation', micDevice: 'mic-7', cameraDevice: null, mirror: false },
    skills: {
      'scale:a-minor-pentatonic:box-1': { plays: 7, best: 92, last: 80, crowns: 2, stars: 3, done: true, time: 600, at: NOW - 86_400_000 },
      'song:greensleeves': { plays: 1, best: 0, last: 0, crowns: 0, stars: 0, done: false, time: 45, at: NOW - 2 * 86_400_000 },
    },
    cards: [
      { id: 'fact:1', kind: 'theory-fact', ref: 'u1', due: at('2026-03-12T08:00:00Z'), interval: 6, ease: 2.6, reps: 3, lapses: 1 },
      { id: 'fact:2', kind: 'interval', due: NOW, interval: 0, ease: 2.5, reps: 0, lapses: 0 },
      { kind: 'broken card without id' },
    ],
    achievements: ['first-tune', 'streak-3'],
    favourites: ['song:greensleeves', 'scale:a-minor-pentatonic', 'broken'],
    updatedAt: NOW - 3_600_000,
  };

  it('converts the flat shape into the current one', () => {
    const decoded = decodeState(JSON.stringify(v1), ENV);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    const s = decoded.state;
    expect(decoded.version).toBe(1);
    expect(s.profile).toMatchObject({ name: 'Sam', avatar: 'flame', experience: 'intermediate', teacher: 'dev', onboarded: true });
    expect(s.prefs).toMatchObject({
      dailyGoalXp: 20,
      handedness: 'left',
      a4: 442,
      tuningId: 'drop-d',
      theme: 'dark',
      noteNaming: 'solfege',
      notation: 'tab+notation',
      sound: { volume: 0.6, uiSounds: false, guitarTone: 'acoustic', clickSound: 'wood' },
      mic: { deviceId: 'mic-7', sensitivity: 0.5 },
      camera: { deviceId: null, mirrored: false },
    });
    expect(s.prefs.fretboard).toMatchObject({ labels: 'degrees', frets: 15, wood: 'wood-rosewood' });
    expect(s.xp.total).toBe(340);
    expect(selectLevel(s).level).toBe(6);
    expect(s.days).toEqual({
      '2026-03-07': { xp: 30, goal: 20, met: true, sec: 0, n: 1, kinds: {} },
      '2026-03-08': { xp: 25, goal: 20, met: true, sec: 0, n: 1, kinds: {} },
      '2026-03-09': { xp: 10, goal: 20, met: false, sec: 0, n: 1, kinds: {} },
    });
    expect(s.streak).toMatchObject({ current: 2, longest: 9, lastGoalDay: '2026-03-08', coveredThrough: '2026-03-08', freezes: 1 });
    expect(s.hearts).toEqual({ count: 3, regenFrom: NOW - 5 * 60_000 });
    expect(s.gems).toEqual({ balance: 120, earned: 120, spent: 0 });
    expect(s.skills['scale:a-minor-pentatonic:box-1']).toMatchObject({ attempts: 7, completions: 7, bestAccuracy: 0.92, lastAccuracy: 0.8, mastery: 2, stars: 3, completed: true, timeSec: 600, history: [80] });
    expect(s.skills['song:greensleeves']).toMatchObject({ attempts: 1, completions: 0, completed: false, completedAt: null });
    expect(Object.keys(s.srs.items)).toEqual(['fact:1', 'fact:2']);
    expect(s.srs.items['fact:1']).toMatchObject({ kind: 'theory-fact', ref: 'u1', state: 'review', interval: 6, ease: 2.6, reps: 3, lapses: 1, dueDay: '2026-03-12' });
    expect(s.srs.items['fact:2']).toMatchObject({ kind: 'interval', state: 'new', interval: 0 });
    expect(s.achievements).toEqual({ 'first-tune': { at: NOW - 3_600_000 }, 'streak-3': { at: NOW - 3_600_000 } });
    expect(Object.keys(s.favourites).sort()).toEqual(['scale:a-minor-pentatonic', 'song:greensleeves']);
    expect(s.favourites['song:greensleeves']).toMatchObject({ kind: 'song', id: 'greensleeves', title: 'greensleeves' });
    expect(s.stats).toMatchObject({ 'goal.days': 2, 'active.days': 3 });
    expect(s.cosmetics).toEqual(FREE_COSMETICS);
    expect(s.quests.daily).toHaveLength(3);
  });

  it('loads a version 1 save from storage, reports the migration, and saves it back in the current shape', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify(v1) });
    const clock = testClock(NOW);
    const timers = manualTimers();
    const store = createProgressStore({ clock, storage, timers });
    expect(store.loadReport).toMatchObject({ source: 'saved', migratedFrom: 1, corrupt: false });
    expect(store.getState().xp.total).toBe(340);

    // The migrated learner keeps going: yesterday's streak day was 03-08, so 03-09 was missed
    // and the freeze they held covers it.
    store.tick();
    expect(store.getState().streak).toMatchObject({ current: 2, freezes: 0, coveredThrough: '2026-03-09' });
    store.dispatch({ type: 'activity', input: { kind: 'other', xp: 20 } });
    expect(selectStreak(store.getState()).current).toBe(3);

    store.flush();
    const saved = JSON.parse(storage.read(STORAGE_KEY) as string);
    expect(saved.v).toBe(SCHEMA_VERSION);
    expect(saved.state.xp.total).toBe(360);
    // Reloading the migrated save needs no further migration.
    const again = createProgressStore({ clock, storage, timers });
    expect(again.loadReport).toMatchObject({ source: 'saved', migratedFrom: null });
    expect(again.getState()).toEqual(store.getState());
  });

  it('survives a version 1 save that is mostly garbage', () => {
    const decoded = decodeState({ v: 1, xp: 'lots', xpByDay: 7, skills: [1, 2], cards: 'none', settings: null, streak: -3, name: 12 }, ENV);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.state.xp.total).toBe(0);
      expect(decoded.state.streak.current).toBe(0);
      expect(decoded.state.profile.name).toBe('');
      expect(decoded.state.prefs).toEqual(defaultPrefs());
    }
  });
});

describe('corruption-tolerant loading', () => {
  it('starts fresh when nothing is saved', () => {
    const { state, report } = loadState(memoryStorage(), STORAGE_KEY, ENV);
    expect(report).toEqual({ source: 'fresh', migratedFrom: null, corrupt: false, newer: false, reset: [] });
    expect(state).toEqual(createInitialState(ENV));
  });

  it('keeps unreadable data aside and starts fresh', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: '{"app":"sixstring-academy","v":2,"state":{"profile":{"na' });
    const { state, report } = loadState(storage, STORAGE_KEY, ENV);
    expect(report).toMatchObject({ source: 'fresh', corrupt: true });
    expect(state.xp.total).toBe(0);
    expect(storage.read(`${STORAGE_KEY}.corrupt`)).toBe('{"app":"sixstring-academy","v":2,"state":{"profile":{"na');
  });

  it('falls back to the backup when the main save is unreadable', () => {
    const rig = seasoned();
    const good = encodeState(rig.store.getState(), rig.clock.t);
    const storage = memoryStorage({ [STORAGE_KEY]: 'garbage \u0000\u0001', [`${STORAGE_KEY}.bak`]: good });
    const { state, report } = loadState(storage, STORAGE_KEY, { now: rig.clock.t, timeZone: 'UTC' });
    expect(report).toMatchObject({ source: 'backup', corrupt: true });
    expect(state).toEqual(rig.store.getState());
  });

  it('starts fresh when the backup is unreadable too', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: 'x', [`${STORAGE_KEY}.bak`]: 'y' });
    expect(loadState(storage, STORAGE_KEY, ENV).report).toMatchObject({ source: 'fresh', corrupt: true });
  });

  it('survives storage that throws', () => {
    const broken = {
      read: () => {
        throw new Error('SecurityError');
      },
      write: () => {
        throw new Error('QuotaExceededError');
      },
      remove: () => undefined,
    };
    const store = createProgressStore({ clock: testClock(NOW), storage: broken, timers: manualTimers() });
    expect(store.loadReport.source).toBe('fresh');
    const failures: number[] = [];
    store.on('save-failed', (e) => failures.push(e.at));
    store.dispatch({ type: 'activity', input: { kind: 'tuner' } });
    expect(() => store.flush()).not.toThrow();
    store.dispatch({ type: 'activity', input: { kind: 'tuner' } });
    store.flush();
    expect(store.getState().stats['count.tuner']).toBe(2);
    expect(failures).toHaveLength(1); // announced once, not on every write
  });

  it('works without any storage', () => {
    const store = createProgressStore({ clock: testClock(NOW), storage: null, timers: manualTimers() });
    store.dispatch({ type: 'activity', input: { kind: 'tuner' } });
    store.flush();
    expect(store.getState().xp.total).toBe(5);
  });

  it('keeps the valid slices of a partly damaged save and resets the rest', () => {
    const rig = seasoned();
    const good = JSON.parse(encodeState(rig.store.getState(), rig.clock.t));
    good.state.streak = 'oops';
    good.state.hearts = null;
    good.state.skills['song:greensleeves'] = 17;
    good.state.days['2026-03-03'] = { xp: 'many' };
    good.state.days['bogus'] = { xp: 5 };
    good.state.log.push({ nonsense: true }, null, 5);
    good.state.prefs.a4 = 9000;
    good.state.prefs.theme = 'neon';
    good.state.prefs.fretboard.wood = 'wood-koa'; // not owned
    good.state.quests.daily = [{ id: 'earn-xp' }];
    delete good.state.gems;
    const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify(good) });
    const { state, report } = loadState(storage, STORAGE_KEY, { now: rig.clock.t, timeZone: 'UTC' });
    const before = rig.store.getState();

    expect(report.source).toBe('saved');
    expect(report.reset.sort()).toEqual(['gems', 'hearts', 'streak']);
    expect(state.xp).toEqual(before.xp);
    expect(state.profile).toEqual(before.profile);
    expect(state.srs).toEqual(before.srs);
    expect(state.achievements).toEqual(before.achievements);
    expect(state.streak).toMatchObject({ current: 0, longest: 0, lastGoalDay: null });
    expect(state.hearts).toEqual({ count: 5, regenFrom: null });
    expect(state.gems).toEqual({ balance: 0, earned: 0, spent: 0 });
    expect(state.skills['song:greensleeves']).toBeUndefined();
    expect(state.skills['scale:a-minor-pentatonic:box-1']).toEqual(before.skills['scale:a-minor-pentatonic:box-1']);
    expect(state.days['2026-03-03']).toMatchObject({ xp: 0, met: false });
    expect(state.days.bogus).toBeUndefined();
    expect(state.log).toEqual(before.log);
    expect(state.prefs.a4).toBe(466);
    expect(state.prefs.theme).toBe('system');
    expect(state.prefs.fretboard.wood).toBe('wood-rosewood');
    expect(state.prefs.noteNaming).toBe('german');
    expect(state.quests.daily).toEqual(pickDailyQuests(state.meta.today, selectLevel(state).level));
  });

  it('keeps a copy of a save written by a newer version before overwriting it', () => {
    const rig = seasoned();
    const future = JSON.stringify({ app: APP_ID, v: SCHEMA_VERSION + 1, savedAt: rig.clock.t, state: rig.store.getState() });
    const storage = memoryStorage({ [STORAGE_KEY]: future });
    const { state, report } = loadState(storage, STORAGE_KEY, { now: rig.clock.t, timeZone: 'UTC' });
    expect(report).toMatchObject({ source: 'saved', newer: true });
    expect(state.xp.total).toBe(rig.store.getState().xp.total);
    expect(storage.read(`${STORAGE_KEY}.newer`)).toBe(future);
  });
});

describe('sanitizeState', () => {
  it('returns a complete fresh state for anything that is not an object', () => {
    for (const junk of [null, undefined, 5, 'text', [], true]) {
      expect(sanitizeState(junk, ENV)).toEqual(createInitialState(ENV));
    }
  });

  it('clamps numbers, drops unknown ids and repairs inconsistent slices', () => {
    const s = sanitizeState(
      {
        profile: { name: 'A'.repeat(200) + '\u0007', avatar: 'unicorn', experience: 'wizard', teacher: 'bob', onboarded: 'yes' },
        xp: { total: -50, byTag: { theory: 12.6, nonsense: 5, scales: Number.NaN }, boost: { multiplier: 99, until: NOW + 1000, source: 5 } },
        streak: { current: 12, longest: 3, lastGoalDay: 'tomorrow', freezes: 40, milestones: [3, 4, 7, 'x'] },
        hearts: { count: 99 },
        gems: { balance: -4, earned: Number.POSITIVE_INFINITY },
        cosmetics: ['wood-ebony', 'made-up', 7, 'wood-ebony'],
        skills: { 'ok:skill': { mastery: 9, stars: -1, attempts: 2.6, history: [50, 'x', 400, -3] }, '__proto__': { mastery: 5 }, ['x'.repeat(300)]: {} },
        srs: { items: { a: { state: 'weird', ease: 99, interval: -5 }, b: 'nope' }, newToday: -3 },
        achievements: { 'first-tune': { at: 5 }, 'bad one': 3 },
        stats: { 'count.tuner': 3, bad: -1, worse: 'x' },
        meta: { rev: -2, deviceId: '', today: 'never' },
      },
      ENV,
    );
    expect(s.profile).toMatchObject({ avatar: 'guitar', experience: 'beginner', teacher: 'mia', onboarded: false });
    expect(s.profile.name).toHaveLength(40);
    expect(s.xp.total).toBe(0);
    expect(s.xp.byTag).toEqual({ theory: 13 });
    expect(s.xp.boost).toEqual({ multiplier: 3, until: NOW + 1000, source: 'boost' });
    expect(s.streak).toMatchObject({ current: 0, longest: 3, lastGoalDay: null, coveredThrough: null, freezes: 2, milestones: [3, 7] });
    expect(s.hearts).toEqual({ count: 5, regenFrom: null });
    expect(s.gems.balance).toBe(0);
    expect(s.cosmetics).toEqual([...FREE_COSMETICS, 'wood-ebony']);
    expect(Object.keys(s.skills)).toEqual(['ok:skill']);
    expect(s.skills['ok:skill']).toMatchObject({ mastery: 0, stars: 0, attempts: 3, history: [50, 100, 0] });
    expect(Object.keys(s.srs.items)).toEqual(['a']);
    expect(s.srs.items.a).toMatchObject({ state: 'new', ease: 3, interval: 0 });
    expect(s.srs.newToday).toBe(0);
    expect(s.achievements).toEqual({ 'first-tune': { at: 5 } });
    expect(s.stats).toEqual({ 'count.tuner': 3 });
    expect(s.meta).toMatchObject({ rev: 0, deviceId: 'dev-a', today: '2026-03-10' });
    // Nothing leaked onto Object.prototype.
    expect(({} as Record<string, unknown>).mastery).toBeUndefined();
  });

  it('enforces the size bounds', () => {
    const days: Record<string, unknown> = {};
    for (let i = 0; i < MAX_DAYS + 50; i++) days[addDays('2020-01-01', i)] = { xp: 1, goal: 20, met: false, sec: 0, n: 1, kinds: {} };
    const log = Array.from({ length: MAX_LOG + 20 }, (_, i) => ({ id: `s${i}`, kind: 'song', title: 't', startedAt: i, durationSec: 1, xp: 1 }));
    const recents = Array.from({ length: MAX_RECENTS + 5 }, (_, i) => ({ route: 'play', params: [`song-${i}`], title: 't', kind: 'song', fraction: 0.5, at: i }));
    const s = sanitizeState({ profile: {}, days, log, recents }, ENV);
    expect(Object.keys(s.days)).toHaveLength(MAX_DAYS);
    expect(Object.keys(s.days)[0]).toBe(addDays('2020-01-01', 50)); // the oldest are dropped
    expect(s.log).toHaveLength(MAX_LOG);
    expect(s.recents).toHaveLength(MAX_RECENTS);
  });
});

describe('sanitizePrefs', () => {
  const base = defaultPrefs();

  it('accepts every valid value and rejects every invalid one, field by field', () => {
    const owned = [...FREE_COSMETICS, 'wood-ebony'];
    const good = sanitizePrefs(
      {
        dailyGoalXp: 50,
        handedness: 'left',
        tuningId: 'open-g',
        a4: 415,
        theme: 'light',
        noteNaming: 'solfege',
        accidentals: 'flats',
        fretboard: { frets: 24, wood: 'wood-ebony', inlay: 'inlay-dots', labels: 'degrees' },
        accent: 'accent-sunburst',
        sound: { volume: 0, guitarTone: 'nylon', clickSound: 'beep', uiSounds: false },
        mic: { deviceId: 'abc', sensitivity: 1 },
        camera: { deviceId: 'cam', mirrored: false },
        motion: 'reduce',
        notation: 'tab+notation',
        ai: { enabled: true },
        unlimitedHearts: true,
        review: { newPerDay: 0, reviewsPerDay: 500 },
        weekStart: 'sunday',
      },
      base,
      owned,
    );
    expect(good).toEqual({
      dailyGoalXp: 50,
      handedness: 'left',
      tuningId: 'open-g',
      a4: 415,
      theme: 'light',
      noteNaming: 'solfege',
      accidentals: 'flats',
      fretboard: { frets: 24, wood: 'wood-ebony', inlay: 'inlay-dots', labels: 'degrees' },
      accent: 'accent-sunburst',
      sound: { volume: 0, guitarTone: 'nylon', clickSound: 'beep', uiSounds: false },
      mic: { deviceId: 'abc', sensitivity: 1 },
      camera: { deviceId: 'cam', mirrored: false },
      motion: 'reduce',
      notation: 'tab+notation',
      ai: { enabled: true },
      unlimitedHearts: true,
      review: { newPerDay: 0, reviewsPerDay: 500 },
      weekStart: 'sunday',
    });

    const bad = sanitizePrefs(
      {
        dailyGoalXp: 25,
        handedness: 'both',
        tuningId: 'Drop D!',
        a4: 'high',
        theme: 'sepia',
        noteNaming: 'numbers',
        accidentals: 'naturals',
        fretboard: { frets: 'many', wood: 'wood-koa', inlay: 'accent-cherry', labels: 'colours' },
        accent: 'wood-maple',
        sound: { volume: 'loud', guitarTone: '', clickSound: 12, uiSounds: 'on' },
        mic: { deviceId: 5, sensitivity: null },
        camera: { deviceId: '', mirrored: 1 },
        motion: 'bouncy',
        notation: 'notation',
        ai: 'yes',
        unlimitedHearts: 'please',
        review: 'none',
        weekStart: 'friday',
      },
      base,
      FREE_COSMETICS,
    );
    expect(bad).toEqual(base);
  });

  it('clamps numeric ranges', () => {
    expect(sanitizePrefs({ a4: 300 }, base, FREE_COSMETICS).a4).toBe(415);
    expect(sanitizePrefs({ a4: 500 }, base, FREE_COSMETICS).a4).toBe(466);
    expect(sanitizePrefs({ a4: 441.26 }, base, FREE_COSMETICS).a4).toBe(441.3);
    expect(sanitizePrefs({ fretboard: { frets: 3 } }, base, FREE_COSMETICS).fretboard.frets).toBe(12);
    expect(sanitizePrefs({ fretboard: { frets: 30 } }, base, FREE_COSMETICS).fretboard.frets).toBe(24);
    expect(sanitizePrefs({ sound: { volume: 7 } }, base, FREE_COSMETICS).sound.volume).toBe(1);
    expect(sanitizePrefs({ mic: { sensitivity: -1 } }, base, FREE_COSMETICS).mic.sensitivity).toBe(0);
  });
});

describe('type shape', () => {
  it('a fresh state has every slice', () => {
    const s: ProgressState = createInitialState(ENV);
    expect(Object.keys(s).sort()).toEqual(
      ['achievements', 'cosmetics', 'days', 'favourites', 'gems', 'hearts', 'log', 'meta', 'prefs', 'profile', 'quests', 'recents', 'skills', 'srs', 'stats', 'streak', 'xp'].sort(),
    );
    expect(JSON.parse(JSON.stringify(s))).toEqual(s); // plain JSON all the way down
  });
});
