/**
 * Learner states for tests and browser checks, built with the real progress store so they are
 * exactly what the app would have saved: a brand-new learner, and "Robin", four months in, with a
 * streak, crowns, rusty skills, trophies and gems to spend.
 *
 * Not imported by the app. Unit tests import it directly; `e2e/profile.cjs` loads it through the
 * harness (`loadTs`) and seeds the browser's storage with `saved()`.
 */
import { createActions, createProgressStore, memoryStorage, type Clock, type ProgressActions, type ProgressStore } from '@/core/progress';

const DAY = 86_400_000;
const MINUTE = 60_000;

/** A store on a clock the caller moves, with in-memory storage. */
export interface Fixture {
  store: ProgressStore;
  actions: ProgressActions;
  clock: Clock & { t: number };
  /** The save file as the app would write it under the storage key `progress`. */
  saved(): string;
}

function fixture(start: number, timeZone?: string): Fixture {
  const clock = { t: start, timeZone, now: () => clock.t };
  const storage = memoryStorage();
  // Timers never fire by themselves here: `saved()` flushes when the caller wants the file.
  const store = createProgressStore({ clock, storage, deviceId: 'fixture', timers: { set: () => 0, clear: () => undefined } });
  return {
    store,
    actions: createActions(() => store),
    clock,
    saved: () => {
      store.flush();
      return storage.data.get('progress') ?? '';
    },
  };
}

/** A learner who has opened the app for the first time at `now`. */
export function emptyFixture(now: number, timeZone?: string): Fixture {
  return fixture(now, timeZone);
}

/** Small deterministic random source (mulberry32), so the fixture is the same on every run. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SONGS: ReadonlyArray<[string, string]> = [
  ['song:greensleeves', 'Greensleeves'],
  ['song:scarborough-fair', 'Scarborough Fair'],
  ['song:house-of-the-rising-sun', 'House of the Rising Sun'],
  ['song:amazing-grace', 'Amazing Grace'],
  ['song:romanza', 'Romanza'],
];
const CHORDS = ['g', 'c', 'd', 'em', 'am', 'e', 'a', 'dm', 'f', 'a7'] as const;

/**
 * "Robin": about four months of practice ending at `now`. The last twelve days are an unbroken
 * streak; before that there are gaps, a few skills that were learned early and left alone (now
 * rusty), songs with stars, and enough gems to buy something but not everything.
 */
export function richFixture(now: number, timeZone?: string): Fixture {
  const days = 118;
  const f = fixture(now - days * DAY, timeZone);
  const { actions, clock } = f;
  const random = seeded(20261115);
  actions.completeOnboarding({ name: 'Robin', avatar: 'vinyl', experience: 'intermediate', teacher: 'dev', dailyGoalXp: 20, handedness: 'right' });

  let lesson = 0;
  for (let back = days; back >= 0; back--) {
    // The evening of that day, never later than `now` on the last one.
    const stamp = Math.min(now, now - back * DAY - (back === 0 ? 0 : 45 * MINUTE));
    clock.t = stamp - 40 * MINUTE;
    actions.tick();

    // Three days before the end Robin goes shopping: the Ocean accent (owned, so the accent picker
    // has a choice), a streak freeze, then double-XP boosts until little is left. The boosts run out long before
    // `now`, and the last days earn a known, modest balance back.
    if (back === 3) {
      const short = 260 - f.store.getState().gems.balance;
      if (short > 0) actions.grantGems(short, 'fixture');
      actions.buy('accent-ocean');
      actions.buy('streak-freeze');
      while (f.store.getState().gems.balance >= 100) actions.buy('xp-boost');
    }

    // Gaps: one day in five before the final streak, plus a full week away around day 60.
    const inStreak = back < 12;
    const away = back >= 56 && back <= 63;
    if (!inStreak && (away || random() < 0.2)) continue;

    const spend = (minutes: number): number => {
      clock.t += minutes * MINUTE;
      return Math.round(minutes * 60);
    };
    const accuracy = (floor: number): number => Math.min(1, floor + random() * (1 - floor));

    if (random() < 0.7) actions.recordActivity({ kind: 'tuner', durationSec: spend(1), route: 'tuner', title: 'Tuned up' });

    lesson++;
    const unit = Math.ceil(lesson / 6);
    const acc = accuracy(0.75);
    actions.recordActivity({
      kind: 'theory-lesson',
      id: `theory:unit-${unit}:lesson-${((lesson - 1) % 6) + 1}`,
      title: `Theory unit ${unit}, lesson ${((lesson - 1) % 6) + 1}`,
      accuracy: acc,
      mistakes: acc > 0.97 ? 0 : 2,
      durationSec: spend(4),
      route: 'learn',
      params: [`unit-${unit}`, `lesson-${((lesson - 1) % 6) + 1}`],
    });

    // Early weeks: major-scale positions that are then left alone, so they are rusty today.
    if (back > 80) {
      const position = (back % 3) + 1;
      actions.recordActivity({
        kind: 'scale-practice',
        id: `scale:g-major:position-${position}`,
        title: `G major, position ${position}`,
        accuracy: accuracy(0.8),
        durationSec: spend(5),
        route: 'scales',
        params: ['g-major'],
      });
    }

    // The pentatonic boxes, played as game rounds through the whole period.
    if (random() < 0.75) {
      const box = (back % 5) + 1;
      const hit = accuracy(0.7);
      actions.recordActivity({
        kind: 'scale-game',
        id: `scale:a-minor-pentatonic:box-${box}`,
        title: `Fret Rush: A minor pentatonic, box ${box}`,
        accuracy: hit,
        score: Math.round(hit * 1200),
        combo: Math.round(8 + random() * 30),
        durationSec: spend(2),
        route: 'arcade',
        params: ['fret-rush'],
      });
    }

    if (random() < 0.6) {
      const chord = CHORDS[Math.min(CHORDS.length - 1, Math.floor((days - back) / 11))];
      actions.recordActivity({ kind: 'chord-practice', id: `chord:${chord}`, title: `${chord[0].toUpperCase()}${chord.slice(1)} chord`, accuracy: accuracy(0.8), durationSec: spend(3), route: 'chords', params: [chord] });
      if (random() < 0.5) {
        actions.recordActivity({ kind: 'chord-change', id: 'chord-change:g-c', title: 'G to C', accuracy: accuracy(0.7), count: 24, durationSec: spend(2), route: 'chords', params: ['changes'] });
      }
    }

    if (random() < 0.45) {
      const [id, title] = SONGS[Math.floor(random() * SONGS.length)];
      const played = accuracy(0.72);
      actions.recordActivity({ kind: 'song', id, title, accuracy: played, stars: played > 0.95 ? 3 : played > 0.85 ? 2 : 1, durationSec: spend(4), route: 'play', params: [id.slice('song:'.length)] });
    }

    if (random() < 0.3) actions.recordActivity({ kind: 'ear', id: 'ear:intervals', title: 'Intervals by ear', accuracy: accuracy(0.6), durationSec: spend(3), route: 'ear' });
    if (random() < 0.25) actions.recordActivity({ kind: 'rhythm', id: 'rhythm:eighths', title: 'Eighth-note strumming', accuracy: accuracy(0.7), durationSec: spend(3), route: 'rhythm' });
    if (random() < 0.2) actions.recordActivity({ kind: 'metronome', durationSec: spend(5), route: 'metronome', title: 'Metronome practice' });
    if (back % 9 === 0) actions.recordActivity({ kind: 'teacher-lesson', id: `teacher:dev:lesson-${Math.floor((days - back) / 9) + 1}`, title: `Dev: lesson ${Math.floor((days - back) / 9) + 1}`, accuracy: accuracy(0.8), durationSec: spend(8), route: 'teachers', params: ['dev'] });
  }

  clock.t = now;
  actions.tick();
  // Two hearts down (so a refill is on offer), and a gem balance that buys a 150 or 200 gem
  // cosmetic but not the 400 gem vine inlay.
  actions.loseHeart();
  actions.loseHeart();
  const short = RICH_GEMS - f.store.getState().gems.balance;
  if (short > 0) actions.grantGems(short, 'fixture');
  return f;
}

/**
 * The least gems `richFixture` ends with. The simulation leaves under this, the top-up brings it
 * here, and an achievement unlocked by the top-up may add a few more: always under 400.
 */
export const RICH_GEMS = 360;
