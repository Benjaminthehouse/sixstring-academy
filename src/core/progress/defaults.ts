/**
 * The state of a brand-new learner, and the default preferences.
 */
import { DEFAULT_COSMETICS, FREE_COSMETICS, MAX_HEARTS } from './catalog';
import { pickDailyQuests, pickWeeklyQuest } from './quests';
import { DEFAULT_REVIEW_CAPS } from './srs';
import { dayKey, weekStartOf } from './time';
import type { ExperienceLevel, Preferences, Profile, ProgressState, TeacherId } from './types';

/** Preferences before the learner changes anything. */
export function defaultPrefs(): Preferences {
  return {
    dailyGoalXp: 20,
    handedness: 'right',
    tuningId: 'standard',
    a4: 440,
    theme: 'system',
    noteNaming: 'letters',
    accidentals: 'auto',
    fretboard: { frets: 15, wood: DEFAULT_COSMETICS.wood, inlay: DEFAULT_COSMETICS.inlay, labels: 'notes' },
    accent: DEFAULT_COSMETICS.accent,
    sound: { volume: 0.8, guitarTone: 'acoustic', clickSound: 'wood', uiSounds: true },
    mic: { deviceId: null, sensitivity: 0.5 },
    camera: { deviceId: null, mirrored: true },
    motion: 'system',
    notation: 'tab',
    ai: { enabled: false },
    unlimitedHearts: false,
    review: { ...DEFAULT_REVIEW_CAPS },
    weekStart: 'monday',
  };
}

/** The teacher who fits an experience level. */
export function teacherFor(experience: ExperienceLevel): TeacherId {
  if (experience === 'expert') return 'elena';
  return experience === 'intermediate' ? 'dev' : 'mia';
}

/** A profile before onboarding. */
export function defaultProfile(now: number): Profile {
  return { name: '', avatar: 'guitar', experience: 'beginner', teacher: 'mia', onboarded: false, createdAt: now };
}

/** A random install id. Not a secret; it only tells installs apart when data is merged. */
export function randomDeviceId(): string {
  const bytes = new Uint8Array(8);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

/** What `createInitialState` needs from its surroundings. */
export interface InitialStateEnv {
  now: number;
  timeZone?: string;
  deviceId?: string;
}

/** The state of a learner who has not done anything yet. */
export function createInitialState(env: InitialStateEnv): ProgressState {
  const today = dayKey(env.now, env.timeZone);
  const week = weekStartOf(today, 1);
  return {
    profile: defaultProfile(env.now),
    prefs: defaultPrefs(),
    xp: { total: 0, byTag: {}, boost: null, capped: {} },
    days: {},
    streak: { current: 0, longest: 0, lastGoalDay: null, lastGoalAt: null, coveredThrough: null, startedOn: null, freezes: 0, milestones: [] },
    hearts: { count: MAX_HEARTS, regenFrom: null },
    gems: { balance: 0, earned: 0, spent: 0 },
    cosmetics: [...FREE_COSMETICS],
    skills: {},
    srs: { items: {}, day: today, newToday: 0, reviewsToday: 0 },
    log: [],
    recents: [],
    favourites: {},
    quests: { day: today, daily: pickDailyQuests(today, 1), sweep: false, week, weekly: pickWeeklyQuest(week, 1) },
    achievements: {},
    stats: {},
    meta: { rev: 0, updatedAt: env.now, createdAt: env.now, deviceId: env.deviceId ?? 'local', today, lastActiveDay: null, prefsAt: 0 },
  };
}
