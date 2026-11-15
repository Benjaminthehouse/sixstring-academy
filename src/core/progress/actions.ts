/**
 * The app's one progress store and the typed functions screens call to change it.
 *
 * Screens import these functions (or the hooks in `react.ts`) and never build actions by hand.
 * `createActions(store)` gives the same functions bound to any store, which is what tests use.
 */
import type { ProgressEventOf, ProgressEventType } from './events';
import type { ProgressExport } from './persist';
import type { ProfilePatch, SkillMark } from './reducer';
import { createProgressStore, type ProgressStore } from './store';
import type {
  ActivityInput,
  ActivityResult,
  DailyGoalXp,
  DeepPartial,
  FavouriteInput,
  HeartLossResult,
  ImportResult,
  JsonValue,
  MergeStrategy,
  OnboardingInput,
  Preferences,
  ProgressState,
  PurchaseResult,
  RecentInput,
  ReviewGrade,
  ReviewItem,
  ReviewItemInput,
  SkillTag,
  XpBoost,
} from './types';

/** Every action function, bound to one store. */
export interface ProgressActions {
  /**
   * The single entry point for "the learner did something". Updates XP, level, daily goal, streak,
   * hearts, the skill, quests, achievements, the practice log and the recents list in one
   * transaction, and returns what changed. See `API.md` for the contract.
   */
  recordActivity(input: ActivityInput): ActivityResult;
  /** Grant XP outside an activity (a bonus). Returns the XP awarded after boosts. */
  awardXp(amount: number, source: string, tag?: SkillTag): number;
  /** A mistake in a theory lesson: take one heart (nothing happens in unlimited mode). */
  loseHeart(): HeartLossResult;
  /** Refill every heart for free (`recordActivity` already does this after a review or practice session). */
  refillHearts(via?: 'practice' | 'gift'): number;
  /** Buy a consumable (`streak-freeze`, `heart-refill`, `xp-boost`) or a cosmetic with gems. */
  buy(itemId: string): PurchaseResult;
  /** Equip an owned cosmetic. Returns false when it is not owned. */
  equipCosmetic(id: string): boolean;
  /** Give gems for something outside the built-in rewards. Returns the new balance. */
  grantGems(amount: number, reason: string): number;
  /** Start (or extend) a timed XP multiplier. */
  startXpBoost(multiplier: number, minutes: number, source?: string): XpBoost;
  /** Change preferences. The patch is merged deeply and every value is validated. */
  setPrefs(patch: DeepPartial<Preferences>): void;
  /** Change the profile (name, avatar, experience, teacher). */
  setProfile(patch: ProfilePatch): void;
  /** Change the daily XP goal. */
  setDailyGoal(xp: DailyGoalXp): void;
  /** Finish the first-run flow. */
  completeOnboarding(input?: OnboardingInput): void;
  /** Store (or clear, with undefined) the small JSON a screen keeps on a skill. */
  setSkillData(id: string, data: JsonValue | undefined): void;
  /** Mark a skill completed / raise its crowns or stars without recording an attempt. */
  markSkill(id: string, mark: SkillMark): void;
  /** Add cards to the review scheduler (ids that already exist are skipped). Returns how many were added. */
  addReviewItems(items: readonly ReviewItemInput[]): number;
  /** Grade a review card. Returns its new schedule, or null for an unknown id. */
  gradeReview(id: string, grade: ReviewGrade): ReviewItem | null;
  /** Remove cards from the scheduler. Returns how many were removed. */
  removeReviewItems(ids: readonly string[]): number;
  /** Bookmark or un-bookmark an item. Returns whether it is a favourite now. */
  toggleFavourite(item: FavouriteInput): boolean;
  /** Set an item's bookmark explicitly. */
  setFavourite(item: FavouriteInput, on: boolean): boolean;
  /** Note that something was opened, with how far through it the learner is. */
  touchRecent(item: RecentInput): void;
  /** Drop an entry from the recents list. */
  removeRecent(key: string): void;
  /** Roll over to the current day now (the connected store does this by itself). */
  tick(): void;
  /** Everything as one JSON-serialisable object. */
  exportProgress(): ProgressExport;
  /** Import an export (object or JSON text). */
  importProgress(data: unknown, strategy?: MergeStrategy): ImportResult;
  /** Erase all progress. `keepPrefs` keeps the profile and preferences. */
  resetProgress(options?: { keepPrefs?: boolean }): void;
  /** A compact stamp that changes whenever anything changes. */
  changeStamp(): string;
  /** Listen for a progress event. Returns the unsubscribe function. */
  onProgressEvent<T extends ProgressEventType>(type: T, handler: (event: ProgressEventOf<T>) => void): () => void;
}

/** Bind the action functions to a store. */
export function createActions(getStore: () => ProgressStore): ProgressActions {
  return {
    recordActivity: (input) => getStore().dispatch({ type: 'activity', input }),
    awardXp: (amount, source, tag) => getStore().dispatch({ type: 'xp/award', amount, source, tag }),
    loseHeart: () => getStore().dispatch({ type: 'hearts/lose' }),
    refillHearts: (via = 'practice') => getStore().dispatch({ type: 'hearts/refill', via }),
    buy: (item) => getStore().dispatch({ type: 'shop/buy', item }),
    equipCosmetic: (id) => getStore().dispatch({ type: 'cosmetic/equip', id }),
    grantGems: (amount, reason) => getStore().dispatch({ type: 'gems/grant', amount, reason }),
    startXpBoost: (multiplier, minutes, source = 'boost') => getStore().dispatch({ type: 'boost/start', multiplier, minutes, source }),
    setPrefs: (patch) => getStore().dispatch({ type: 'prefs/set', patch }),
    setProfile: (patch) => getStore().dispatch({ type: 'profile/set', patch }),
    setDailyGoal: (xp) => getStore().dispatch({ type: 'prefs/set', patch: { dailyGoalXp: xp } }),
    completeOnboarding: (input = {}) => getStore().dispatch({ type: 'onboarding/complete', input }),
    setSkillData: (id, data) => getStore().dispatch({ type: 'skill/data', id, data }),
    markSkill: (id, mark) => getStore().dispatch({ type: 'skill/mark', id, mark }),
    addReviewItems: (items) => getStore().dispatch({ type: 'srs/add', items }),
    gradeReview: (id, grade) => getStore().dispatch({ type: 'srs/grade', id, grade }),
    removeReviewItems: (ids) => getStore().dispatch({ type: 'srs/remove', ids }),
    toggleFavourite: (item) => getStore().dispatch({ type: 'favourite/set', item }),
    setFavourite: (item, on) => getStore().dispatch({ type: 'favourite/set', item, on }),
    touchRecent: (item) => getStore().dispatch({ type: 'recent/touch', item }),
    removeRecent: (key) => getStore().dispatch({ type: 'recent/remove', key }),
    tick: () => getStore().tick(),
    exportProgress: () => getStore().exportData(),
    importProgress: (data, strategy = 'replace') => getStore().importData(data, strategy),
    resetProgress: (options = {}) => getStore().dispatch({ type: 'reset', keepPrefs: options.keepPrefs === true }),
    changeStamp: () => getStore().changeStamp(),
    onProgressEvent: (type, handler) => getStore().on(type, handler),
  };
}

let defaultStore: ProgressStore | null = null;
let disconnect: (() => void) | null = null;

/**
 * The app's store, created on first use: loaded from platform storage and, in a browser, connected
 * to the page (cross-tab sync, save on hide, day rollover, theme).
 */
export function getProgressStore(): ProgressStore {
  if (!defaultStore) {
    defaultStore = createProgressStore();
    disconnect = defaultStore.connect();
  }
  return defaultStore;
}

/**
 * Replace the app's store (tests, storybook-style galleries). Pass null to go back to creating the
 * default one lazily. The previous default store is flushed and disconnected.
 */
export function setProgressStore(store: ProgressStore | null): void {
  if (defaultStore && defaultStore !== store) {
    disconnect?.();
    disconnect = null;
    defaultStore.flush();
  }
  defaultStore = store;
}

const bound = createActions(getProgressStore);

/** See `ProgressActions.recordActivity`. */
export const recordActivity = bound.recordActivity;
/** See `ProgressActions.awardXp`. */
export const awardXp = bound.awardXp;
/** See `ProgressActions.loseHeart`. */
export const loseHeart = bound.loseHeart;
/** See `ProgressActions.refillHearts`. */
export const refillHearts = bound.refillHearts;
/** See `ProgressActions.buy`. */
export const buy = bound.buy;
/** See `ProgressActions.equipCosmetic`. */
export const equipCosmetic = bound.equipCosmetic;
/** See `ProgressActions.grantGems`. */
export const grantGems = bound.grantGems;
/** See `ProgressActions.startXpBoost`. */
export const startXpBoost = bound.startXpBoost;
/** See `ProgressActions.setPrefs`. */
export const setPrefs = bound.setPrefs;
/** See `ProgressActions.setProfile`. */
export const setProfile = bound.setProfile;
/** See `ProgressActions.setDailyGoal`. */
export const setDailyGoal = bound.setDailyGoal;
/** See `ProgressActions.completeOnboarding`. */
export const completeOnboarding = bound.completeOnboarding;
/** See `ProgressActions.setSkillData`. */
export const setSkillData = bound.setSkillData;
/** See `ProgressActions.markSkill`. */
export const markSkill = bound.markSkill;
/** See `ProgressActions.addReviewItems`. */
export const addReviewItems = bound.addReviewItems;
/** See `ProgressActions.gradeReview`. */
export const gradeReview = bound.gradeReview;
/** See `ProgressActions.removeReviewItems`. */
export const removeReviewItems = bound.removeReviewItems;
/** See `ProgressActions.toggleFavourite`. */
export const toggleFavourite = bound.toggleFavourite;
/** See `ProgressActions.setFavourite`. */
export const setFavourite = bound.setFavourite;
/** See `ProgressActions.touchRecent`. */
export const touchRecent = bound.touchRecent;
/** See `ProgressActions.removeRecent`. */
export const removeRecent = bound.removeRecent;
/** See `ProgressActions.tick`. */
export const tickProgress = bound.tick;
/** See `ProgressActions.exportProgress`. */
export const exportProgress = bound.exportProgress;
/** See `ProgressActions.importProgress`. */
export const importProgress = bound.importProgress;
/** See `ProgressActions.resetProgress`. */
export const resetProgress = bound.resetProgress;
/** See `ProgressActions.changeStamp`. */
export const progressChangeStamp = bound.changeStamp;
/** See `ProgressActions.onProgressEvent`. */
export const onProgressEvent = bound.onProgressEvent;

/** The current state of the app's store (for code outside React). */
export function getProgress(): ProgressState {
  return getProgressStore().getState();
}
