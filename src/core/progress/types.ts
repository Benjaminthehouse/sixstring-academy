/**
 * Every type of the progress store: the persisted state, the inputs screens send and the views
 * selectors return. The state is plain JSON (no Dates, Maps or classes) so it can be saved,
 * exported and merged as is.
 */

/** A local calendar day, `YYYY-MM-DD`. Day maths always runs on these, never on milliseconds. */
export type DayKey = string;

/** Anything that survives `JSON.stringify` unchanged. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Recursive partial used for preference patches. */
export type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

// ---------------------------------------------------------------------------------------------
// Profile and preferences
// ---------------------------------------------------------------------------------------------

/** How much guitar the learner already plays. */
export type ExperienceLevel = 'beginner' | 'intermediate' | 'expert';
/** The three teachers. */
export type TeacherId = 'mia' | 'dev' | 'elena';
/** Daily XP goal: casual, regular, serious, intense. */
export type DailyGoalXp = 10 | 20 | 30 | 50;
/** Which hand frets. Left-handed mode is a display flip only. */
export type Handedness = 'right' | 'left';
/** Colour theme; `system` follows the device. */
export type ThemePref = 'system' | 'light' | 'dark';
/** How note names are written: C D E, do re mi, or German (H for B, B for B flat). */
export type NoteNaming = 'letters' | 'solfege' | 'german';
/** Accidental spelling when the key does not decide it. */
export type AccidentalPref = 'auto' | 'sharps' | 'flats';
/** What fretboard dots are labelled with. */
export type FretLabelMode = 'notes' | 'degrees';
/** Tab alone, or tab with standard notation above it. */
export type NotationPref = 'tab' | 'tab+notation';
/** Reduced-motion override; `system` follows the device setting. */
export type MotionPref = 'system' | 'reduce' | 'full';
/** First day of the week in calendars. */
export type WeekStart = 'monday' | 'sunday';

/** Who the learner is. */
export interface Profile {
  /** Display name, empty until the learner sets one. */
  name: string;
  /** An id from `AVATARS`. */
  avatar: string;
  experience: ExperienceLevel;
  teacher: TeacherId;
  /** True once the first-run flow is finished. */
  onboarded: boolean;
  createdAt: number;
}

/** Everything the learner can configure. */
export interface Preferences {
  dailyGoalXp: DailyGoalXp;
  handedness: Handedness;
  /** Tuning id understood by `core/guitar` (default `standard`). */
  tuningId: string;
  /** Concert pitch in Hz, 415 to 466. */
  a4: number;
  theme: ThemePref;
  noteNaming: NoteNaming;
  accidentals: AccidentalPref;
  fretboard: {
    /** Frets drawn on full-neck diagrams, 12 to 24. */
    frets: number;
    /** Cosmetic id of the equipped fretboard wood. */
    wood: string;
    /** Cosmetic id of the equipped inlay style. */
    inlay: string;
    labels: FretLabelMode;
  };
  /** Cosmetic id of the equipped accent theme. */
  accent: string;
  sound: {
    /** Master volume, 0 to 1. */
    volume: number;
    /** Guitar tone id understood by `core/audio` (default `acoustic`). */
    guitarTone: string;
    /** Metronome click id understood by `core/audio` (default `wood`). */
    clickSound: string;
    uiSounds: boolean;
  };
  mic: {
    /** Chosen input device, or null for the system default. */
    deviceId: string | null;
    /** Input sensitivity, 0 (only loud notes) to 1 (very quiet notes). */
    sensitivity: number;
  };
  camera: {
    deviceId: string | null;
    /** Mirror the preview like a selfie camera. */
    mirrored: boolean;
  };
  motion: MotionPref;
  notation: NotationPref;
  /** Opt-in only. The API key itself lives in the platform AI service, never here. */
  ai: { enabled: boolean };
  /** Relaxed mode: mistakes never cost hearts. */
  unlimitedHearts: boolean;
  /** Daily caps of the spaced-repetition queue. */
  review: { newPerDay: number; reviewsPerDay: number };
  weekStart: WeekStart;
}

// ---------------------------------------------------------------------------------------------
// Activities, XP
// ---------------------------------------------------------------------------------------------

/** What kind of thing the learner just did. Drives default XP, quests, achievements and the log. */
export type ActivityKind =
  | 'theory-lesson'
  | 'teacher-lesson'
  | 'review'
  | 'scale-practice'
  | 'scale-game'
  | 'chord-practice'
  | 'chord-change'
  | 'progression'
  | 'song'
  | 'fretboard'
  | 'ear'
  | 'rhythm'
  | 'technique'
  | 'tuner'
  | 'metronome'
  | 'camera'
  | 'scan'
  | 'practice'
  | 'other';

/** The area of musicianship an XP award belongs to (the profile screen charts XP per tag). */
export type SkillTag =
  | 'theory'
  | 'scales'
  | 'chords'
  | 'songs'
  | 'fretboard'
  | 'ear'
  | 'rhythm'
  | 'technique'
  | 'memory'
  | 'tools'
  | 'practice';

/** A timed XP multiplier. */
export interface XpBoost {
  multiplier: number;
  /** Epoch ms at which the boost ends. */
  until: number;
  source: string;
}

/** One local calendar day of history. */
export interface DayRecord {
  /** XP earned that day. */
  xp: number;
  /** The daily goal in effect that day. */
  goal: number;
  /** The goal was met (latched: it never becomes unmet again). */
  met: boolean;
  /** A streak freeze covered this day. */
  frozen?: boolean;
  /** Seconds practised. */
  sec: number;
  /** Activities recorded. Any value above zero makes this an "active day". */
  n: number;
  /** Seconds per activity kind (a kind done without a duration is present with 0). */
  kinds: Partial<Record<ActivityKind, number>>;
}

/** XP totals. */
export interface XpState {
  total: number;
  byTag: Partial<Record<SkillTag, number>>;
  boost: XpBoost | null;
  /** XP already granted today for kinds that have a daily cap (tuner, metronome, camera, scan). */
  capped: Partial<Record<ActivityKind, number>>;
}

/** Streak bookkeeping. See `API.md` for the exact rule. */
export interface StreakState {
  /** Consecutive goal days, not counting frozen days. */
  current: number;
  longest: number;
  /** Last day the goal was met. */
  lastGoalDay: DayKey | null;
  /** The instant the goal was last met (lets a traveller's streak be judged in the zone they are in now). */
  lastGoalAt: number | null;
  /** Last day that is safe: met or frozen. A gap after this day threatens the streak. */
  coveredThrough: DayKey | null;
  /** Day the current streak started. */
  startedOn: DayKey | null;
  /** Streak freezes held (0 to 2). */
  freezes: number;
  /** Milestones (3, 7, 14 ...) whose gem reward was already paid. */
  milestones: number[];
}

/** Hearts: the mistake budget of theory lessons. */
export interface HeartsState {
  count: number;
  /** When the current regeneration period started; null while full. */
  regenFrom: number | null;
}

/** Gems: the earned currency. */
export interface GemsState {
  balance: number;
  earned: number;
  spent: number;
}

// ---------------------------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------------------------

/** Crowns: 0 new, 1 learning, 2 familiar, 3 solid, 4 strong, 5 mastered. */
export type MasteryLevel = 0 | 1 | 2 | 3 | 4 | 5;
/** Stars of a game level or song. */
export type Stars = 0 | 1 | 2 | 3;

/** Everything known about one skill id (`scale:a-minor-pentatonic:box-1`, `song:greensleeves` ...). */
export interface SkillRecord {
  attempts: number;
  /** Attempts that were finished (not abandoned or failed). */
  completions: number;
  /** Finished attempts without a single mistake. */
  perfects: number;
  /** Raw score of the owning screen, higher is better. */
  bestScore: number;
  lastScore: number;
  /** 0 to 1. */
  bestAccuracy: number;
  lastAccuracy: number;
  /** The most recent accuracies in percent (0 to 100), oldest first, bounded. */
  history: number[];
  timeSec: number;
  mastery: MasteryLevel;
  /** Qualifying attempts counted toward the next crown. */
  reps: number;
  stars: Stars;
  completed: boolean;
  firstAt: number;
  lastAt: number;
  completedAt: number | null;
  /** Small JSON owned by the screen that owns this skill (last tempo, chosen key ...). */
  data?: JsonValue;
}

// ---------------------------------------------------------------------------------------------
// Spaced repetition
// ---------------------------------------------------------------------------------------------

/** How well the learner recalled a card. */
export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy';
/** Scheduler state of a card. */
export type ReviewState = 'new' | 'learning' | 'review';

/** One spaced-repetition card. The content lives with the owning screen; `ref` points at it. */
export interface ReviewItem {
  id: string;
  /** `theory-fact`, `fret-note`, `interval`, `chord-shape` or any other owner-defined kind. */
  kind: string;
  /** Payload reference for the owner (a content id, a route ...). */
  ref?: string;
  state: ReviewState;
  /** Index of the current learning step (learning only). */
  step: number;
  /** SM-2 ease factor, 1.3 to 3.0. */
  ease: number;
  /** Current interval in days (review), or the interval it gets when it graduates. */
  interval: number;
  /** Successful reviews in a row. */
  reps: number;
  lapses: number;
  /** Exact due time while learning (epoch ms); 0 otherwise. */
  dueAt: number;
  /** Local day on which the card is due. */
  dueDay: DayKey;
  addedAt: number;
  /** Last time it was graded; 0 = never. */
  lastAt: number;
}

/** A card to add to the scheduler. */
export interface ReviewItemInput {
  id: string;
  kind: string;
  ref?: string;
}

/** The scheduler slice. */
export interface SrsState {
  items: Record<string, ReviewItem>;
  /** Day the two counters below belong to. */
  day: DayKey;
  /** New cards introduced today. */
  newToday: number;
  /** Review-state cards graded today. */
  reviewsToday: number;
}

// ---------------------------------------------------------------------------------------------
// Log, recents, favourites
// ---------------------------------------------------------------------------------------------

/** One logged practice session. */
export interface PracticeSession {
  id: string;
  kind: ActivityKind;
  title: string;
  startedAt: number;
  durationSec: number;
  xp: number;
  skillId?: string;
  /** A few numbers worth showing in the log (accuracy, tempo, score ...). */
  metrics?: Record<string, number>;
}

/** Something recently opened, for "continue where you left off". */
export interface RecentItem {
  /** `route` plus params; one entry per key. */
  key: string;
  route: string;
  params: string[];
  title: string;
  kind: ActivityKind;
  /** How far through it the learner is, 0 to 1. */
  fraction: number;
  at: number;
  skillId?: string;
}

/** A bookmarked item of any kind (song, scale, chord, progression, lesson ...). */
export interface Favourite {
  kind: string;
  id: string;
  title: string;
  route?: string;
  params?: string[];
  at: number;
}

// ---------------------------------------------------------------------------------------------
// Quests and achievements
// ---------------------------------------------------------------------------------------------

/** What a quest counts. */
export type QuestMetric =
  | 'xp'
  | 'goal'
  | 'minutes'
  | 'theory-lesson'
  | 'teacher-lesson'
  | 'lessons'
  | 'reviews'
  | 'tune'
  | 'scale-game'
  | 'scale-practice'
  | 'new-chord'
  | 'chord-changes'
  | 'song'
  | 'combo'
  | 'perfect'
  | 'ear'
  | 'rhythm'
  | 'technique'
  | 'progression'
  | 'fretboard-notes'
  | 'variety'
  | 'stars'
  | 'accuracy-90';

/** A quest the learner currently has. Texts come from the catalog via `describeQuest`. */
export interface QuestInstance {
  /** Catalog template id. */
  id: string;
  metric: QuestMetric;
  target: number;
  progress: number;
  done: boolean;
  /** Gems paid on completion. */
  gems: number;
  doneAt: number | null;
}

/** Today's quests and this week's challenge. */
export interface QuestState {
  day: DayKey;
  daily: QuestInstance[];
  /** The bonus for finishing all three daily quests was paid. */
  sweep: boolean;
  /** Monday of the week the weekly challenge belongs to. */
  week: DayKey;
  weekly: QuestInstance | null;
}

/** Achievement tiers, cheapest to rarest. */
export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum';

/** An unlocked achievement. */
export interface AchievementUnlock {
  at: number;
}

// ---------------------------------------------------------------------------------------------
// The whole state
// ---------------------------------------------------------------------------------------------

/** Bookkeeping that is not learner-facing. */
export interface MetaState {
  /** Increases by one on every committed change. */
  rev: number;
  updatedAt: number;
  createdAt: number;
  /** Random id of the install that created this state. */
  deviceId: string;
  /** The local day the state was last rolled over to. Selectors treat this as "today". */
  today: DayKey;
  /** Last day with any recorded activity. */
  lastActiveDay: DayKey | null;
  /** When profile or preferences last changed (used by newest-wins merges). */
  prefsAt: number;
}

/** Everything the learner has done and prefers. The single source of truth. */
export interface ProgressState {
  profile: Profile;
  prefs: Preferences;
  xp: XpState;
  days: Record<DayKey, DayRecord>;
  streak: StreakState;
  hearts: HeartsState;
  gems: GemsState;
  /** Owned cosmetic ids (free ones included). */
  cosmetics: string[];
  skills: Record<string, SkillRecord>;
  srs: SrsState;
  /** Newest first, bounded. */
  log: PracticeSession[];
  /** Newest first, bounded. */
  recents: RecentItem[];
  /** Keyed by `kind:id`. */
  favourites: Record<string, Favourite>;
  quests: QuestState;
  achievements: Record<string, AchievementUnlock>;
  /** Lifetime counters (`count.tuner`, `time.total`, `srs.reviews`, `max.combo` ...). */
  stats: Record<string, number>;
  meta: MetaState;
}

// ---------------------------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------------------------

/**
 * What a screen reports when the learner finishes (or leaves) something. Only `kind` is required;
 * everything else refines what gets updated. See `API.md` for the contract and examples.
 */
export interface ActivityInput {
  kind: ActivityKind;
  /** Skill id. When given, the skill registry (attempts, best score, crowns, stars) is updated. */
  id?: string;
  /** Human title for the log and the recents list. */
  title?: string;
  /** Base XP before boosts. Omit to use the shared guideline (`xpFor`). */
  xp?: number;
  /** Raw score of the screen, higher is better. */
  score?: number;
  /** 0 to 1. Drives crowns; omit when nothing was measured. */
  accuracy?: number;
  /** Stars to record for this attempt (derived from accuracy for `scale-game` when omitted). */
  stars?: Stars;
  /** Seconds actually spent. */
  durationSec?: number;
  /** False for an abandoned or failed attempt. Default true. */
  completed?: boolean;
  /** Mistakes made; 0 marks the attempt perfect. */
  mistakes?: number;
  /** Explicit perfect flag (otherwise: mistakes === 0, or accuracy === 1). */
  perfect?: boolean;
  /** Longest run of correct answers or notes in this attempt. */
  combo?: number;
  /** Items handled: cards, fretboard notes named, chord changes made. */
  count?: number;
  /** Route name and params to reopen this, for the recents list. */
  route?: string;
  params?: string[];
  /** How far through the item the learner is, 0 to 1 (default: 1 when completed). */
  progress?: number;
  /** XP source label (default: the kind). */
  source?: string;
  /** XP tag (default: derived from the kind). */
  tag?: SkillTag;
  /** Raise the skill to at least this crown level (for screens with their own mastery rule). */
  masteryAtLeast?: MasteryLevel;
  /** Small JSON stored on the skill for the owning screen. */
  data?: JsonValue;
  /** Numbers to keep with the log entry (tempo, bpm, notes ...). */
  meta?: Record<string, number>;
  /** When the activity started (default: now minus the duration). */
  startedAt?: number;
}

/** What `recordActivity` hands back, enough for an end-of-activity summary. */
export interface ActivityResult {
  /** XP awarded after caps and boosts. */
  xp: number;
  /** XP before the boost multiplier. */
  baseXp: number;
  multiplier: number;
  totalXp: number;
  level: number;
  leveledUp: boolean;
  goal: { xp: number; goal: number; met: boolean; metNow: boolean };
  streak: { current: number; extended: boolean };
  /** Hearts after the activity. */
  hearts: number;
  /** Gems earned by this activity (quests, level-ups, milestones, achievements, perfect bonus). */
  gems: number;
  skill: null | {
    id: string;
    mastery: MasteryLevel;
    masteryBefore: MasteryLevel;
    stars: Stars;
    starsBefore: Stars;
    bestScore: number;
    newBest: boolean;
    firstCompletion: boolean;
    attempts: number;
  };
  /** Ids of quests completed by this activity. */
  quests: string[];
  /** Ids of achievements unlocked by this activity. */
  achievements: string[];
}

/** Result of losing a heart. */
export interface HeartLossResult {
  /** Hearts left. */
  remaining: number;
  /** False in unlimited mode, where nothing is lost. */
  lost: boolean;
  /** True when the learner is out of hearts. */
  empty: boolean;
}

/** Why a purchase did not go through. */
export type PurchaseFailure = 'unknown-item' | 'insufficient-gems' | 'already-owned' | 'max-held' | 'not-needed';

/** Result of buying from the shop. */
export type PurchaseResult = { ok: true; item: string; price: number; balance: number } | { ok: false; item: string; reason: PurchaseFailure };

/** How imported data is combined with what is already there. */
export type MergeStrategy = 'replace' | 'newest-wins';

/** Why an import was rejected. */
export type ImportFailure = 'not-json' | 'not-an-export' | 'newer-version' | 'invalid';

/** Result of importing data. */
export type ImportResult = { ok: true; strategy: MergeStrategy; schema: number } | { ok: false; reason: ImportFailure; detail?: string };

/** Input of the first-run flow. */
export interface OnboardingInput {
  name?: string;
  avatar?: string;
  experience?: ExperienceLevel;
  teacher?: TeacherId;
  dailyGoalXp?: DailyGoalXp;
  handedness?: Handedness;
}

/** What `touchRecent` accepts. */
export interface RecentInput {
  route: string;
  params?: string[];
  title: string;
  kind?: ActivityKind;
  fraction?: number;
  skillId?: string;
}

/** What `toggleFavourite` accepts. */
export interface FavouriteInput {
  kind: string;
  id: string;
  title?: string;
  route?: string;
  params?: string[];
}
