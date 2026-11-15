/**
 * Carrying out session effects. The session reducer only SAYS what should happen (lose a heart,
 * record the activity, grade a review card ...); `applyEffects` does it through the real progress
 * actions and hands back what the store answered, so the summary screen can show the XP that was
 * really awarded, the level-up, the crown, the quests and the achievements.
 */
import {
  createActions, getProgressStore, type ActivityResult, type HeartLossResult, type JsonValue, type ProgressState, type ProgressStore,
  type ReviewGrade, type ReviewItem, type ReviewItemInput, type SkillMark, type ActivityInput,
} from '@/core/progress';
import type { SessionEffect, SessionSummary } from './session';

/** The slice of the progress store the lesson engine writes to. */
export interface ProgressPort {
  recordActivity(input: ActivityInput): ActivityResult;
  loseHeart(): HeartLossResult;
  addReviewItems(items: readonly ReviewItemInput[]): number;
  gradeReview(id: string, grade: ReviewGrade): ReviewItem | null;
  markSkill(id: string, mark: SkillMark): void;
  setSkillData(id: string, data: JsonValue | undefined): void;
  getState(): ProgressState;
}

/** A port onto a store: the app's own store by default, any store in tests. */
export function progressPort(store?: ProgressStore): ProgressPort {
  const get = (): ProgressStore => store ?? getProgressStore();
  const actions = createActions(get);
  return {
    recordActivity: actions.recordActivity,
    loseHeart: actions.loseHeart,
    addReviewItems: actions.addReviewItems,
    gradeReview: actions.gradeReview,
    markSkill: actions.markSkill,
    setSkillData: actions.setSkillData,
    getState: () => get().getState(),
  };
}

/** What the store answered. */
export interface EffectResults {
  /** The result of `recordActivity`, when the effects held one. */
  activity: ActivityResult | null;
  /** The last `loseHeart` result (hearts remaining, whether one was really lost), or null. */
  heart: HeartLossResult | null;
  /** Review cards actually added (cards that already existed are not counted). */
  cardsAdded: number;
  /** Cards graded, with their new schedule (null for a card the store does not know). */
  reviews: Array<{ id: string; grade: ReviewGrade; item: ReviewItem | null }>;
  /** Skill ids marked as done by a passed checkpoint. */
  skillsMarked: string[];
}

/**
 * Apply effects in order. Call it with the effects of every reducer step, as they come:
 *
 *   const step = reduceSession(state, action);
 *   const results = applyEffects(step.effects);
 */
export function applyEffects(effects: readonly SessionEffect[], port: ProgressPort = progressPort()): EffectResults {
  const results: EffectResults = { activity: null, heart: null, cardsAdded: 0, reviews: [], skillsMarked: [] };
  for (const effect of effects) {
    switch (effect.type) {
      case 'lose-heart':
        results.heart = port.loseHeart();
        break;
      case 'record-activity':
        results.activity = port.recordActivity(effect.input);
        break;
      case 'add-cards':
        results.cardsAdded += port.addReviewItems(effect.items);
        break;
      case 'grade-review':
        results.reviews.push({ id: effect.id, grade: effect.grade, item: port.gradeReview(effect.id, effect.grade) });
        break;
      case 'mark-skill':
        port.markSkill(effect.id, { completed: effect.completed, masteryAtLeast: effect.masteryAtLeast });
        results.skillsMarked.push(effect.id);
        break;
      case 'skill-data': {
        // Only skills the learner has already met: a drill must not create records for lessons never taken.
        const record = port.getState().skills[effect.id];
        if (record) {
          const previous = typeof record.data === 'object' && record.data !== null && !Array.isArray(record.data) ? record.data : {};
          port.setSkillData(effect.id, { ...previous, d: effect.difficulty });
        }
        break;
      }
    }
  }
  return results;
}

/** The summary with what the progress store really did. */
export interface SessionReport extends SessionSummary {
  /** XP actually awarded (boosts and caps applied). Equals `xp` when nothing was recorded. */
  xpAwarded: number;
  /** XP multiplier in force (1 = none). */
  multiplier: number;
  leveledUp: boolean;
  level: number | null;
  /** The daily goal was reached by this session. */
  goalMetNow: boolean;
  /** The streak grew by this session, and its length now. */
  streakExtended: boolean;
  streak: number | null;
  /** Gems earned by this session. */
  gems: number;
  /** Ids of quests completed and achievements unlocked by this session. */
  quests: string[];
  achievements: string[];
  /** Hearts after the session, as the store has them. */
  hearts: number | null;
}

/**
 * Merge the pure summary with the store's answer. Crowns come from the store when it recorded the
 * skill; the pure prediction is the fallback.
 */
export function sessionReport(summary: SessionSummary, results: EffectResults): SessionReport {
  const a = results.activity;
  const crown = a?.skill ? { before: a.skill.masteryBefore, after: a.skill.mastery, gained: a.skill.mastery > a.skill.masteryBefore } : summary.crown;
  return {
    ...summary,
    crown,
    factsAdded: a ? results.cardsAdded : summary.factsAdded,
    xpAwarded: a ? a.xp : summary.xp,
    multiplier: a?.multiplier ?? 1,
    leveledUp: a?.leveledUp ?? false,
    level: a?.level ?? null,
    goalMetNow: a?.goal.metNow ?? false,
    streakExtended: a?.streak.extended ?? false,
    streak: a?.streak.current ?? null,
    gems: a?.gems ?? 0,
    quests: a?.quests ?? [],
    achievements: a?.achievements ?? [],
    hearts: a ? a.hearts : (results.heart?.remaining ?? summary.heartsLeft),
  };
}
