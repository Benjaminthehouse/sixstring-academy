/**
 * Turns a burst of progress events into a small, ordered plan of feedback.
 *
 * Finishing one lesson can emit a dozen events in the same instant (XP, goal, streak, two quests,
 * a crown, an achievement, a level). Shown one by one that is a wall of pop-ups, so the shell
 * collects the events of a moment and this module decides what the learner actually sees: one XP
 * toast, at most three more toasts in order of importance, one modal at a time for the big
 * moments, one burst of confetti and one sound.
 */
import { ACHIEVEMENT_BY_ID, type AchievementTier, type ProgressEvent } from '@/core/progress';

/** Names of the interface sounds this module asks for (a subset of the audio engine's). */
export type FeedbackSound = 'levelUp' | 'achievement' | 'streak' | 'gem' | 'heartLost';

/** A toast the shell should show. */
export interface PlannedToast {
  /** Stable id, so a repeat replaces the toast instead of stacking. */
  id: string;
  title: string;
  description?: string;
  icon: string;
  tone: 'neutral' | 'ok' | 'info' | 'warn';
  /** Milliseconds; 0 = stays until dismissed. Omitted = the toast default. */
  duration?: number;
  /** A follow-up the shell knows how to offer. */
  action?: 'hearts' | 'streak';
}

/** A moment that deserves a dialog of its own. */
export type PlannedModal =
  | { kind: 'level'; level: number; title: string; gems: number }
  | { kind: 'streak'; days: number; gems: number }
  | { kind: 'achievement'; id: string; name: string; description: string; icon: string; tier: AchievementTier; gems: number };

/** Everything the shell does for one burst of events. */
export interface FeedbackPlan {
  /** XP gained in the burst (0 = none). The shell adds it to its running XP toast. */
  xp: number;
  /** The XP is already named in one of `toasts` (the goal toast), so no separate XP toast is needed. */
  xpInToast: boolean;
  toasts: PlannedToast[];
  modals: PlannedModal[];
  confetti: 'low' | 'medium' | 'high' | null;
  sound: FeedbackSound | null;
  /** Set when a heart was lost: the count left. */
  heartsLeft: number | null;
}

/** Toasts shown per burst, not counting the XP toast. The rest is visible on the Me screen. */
export const MAX_TOASTS_PER_BURST = 3;

const BIG_TIERS: ReadonlySet<AchievementTier> = new Set<AchievementTier>(['gold', 'platinum']);

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);
const gemsText = (n: number): string => `+${n} ${plural(n, 'gem', 'gems')}`;

function eventsOf<T extends ProgressEvent['type']>(events: readonly ProgressEvent[], type: T): Array<Extract<ProgressEvent, { type: T }>> {
  return events.filter((e): e is Extract<ProgressEvent, { type: T }> => e.type === type);
}

/** Decide the feedback for the events of one moment. Pure. */
export function digest(events: readonly ProgressEvent[]): FeedbackPlan {
  const plan: FeedbackPlan = { xp: 0, xpInToast: false, toasts: [], modals: [], confetti: null, sound: null, heartsLeft: null };
  if (events.length === 0) return plan;

  // A reset or an import replaces everything: celebrating what it "unlocked" would be nonsense.
  if (events.some((e) => e.type === 'data-reset' || e.type === 'data-imported')) return plan;

  for (const e of eventsOf(events, 'xp-gained')) plan.xp += e.amount;

  // Toast candidates, most important first; cut to MAX_TOASTS_PER_BURST at the end.
  const toasts: PlannedToast[] = [];

  const saveFailed = eventsOf(events, 'save-failed')[0];
  if (saveFailed) {
    toasts.push({
      id: 'shell-save',
      title: 'Your progress cannot be saved here',
      description: 'This browser is blocking storage, so progress lasts until you close the tab. Export it from Me to keep it.',
      icon: 'CloudOff',
      tone: 'warn',
      duration: 0,
    });
  }

  // --- Level ---
  const levels = eventsOf(events, 'level-up');
  if (levels.length > 0) {
    const last = levels[levels.length - 1];
    plan.modals.push({ kind: 'level', level: last.to, title: last.title, gems: levels.reduce((sum, e) => sum + e.gems, 0) });
  }

  // --- Goal and streak ---
  const goal = eventsOf(events, 'goal-met')[0];
  const extended = eventsOf(events, 'streak-extended').pop();
  const milestone = eventsOf(events, 'streak-milestone').pop();
  if (milestone) {
    plan.modals.push({ kind: 'streak', days: milestone.days, gems: milestone.gems });
  } else if (goal || extended) {
    const days = extended?.current ?? 0;
    // The XP that got the learner over the line belongs in the same breath as the goal.
    const gained = plan.xp > 0 ? `+${plan.xp} XP. ` : '';
    plan.xpInToast = plan.xp > 0;
    toasts.push({
      id: 'shell-goal',
      title: goal ? 'Daily goal met' : `${days} day streak`,
      description: goal && days > 0 ? `${gained}${days} day streak. ${days === 1 ? 'That is day one.' : 'See you tomorrow.'}` : goal ? `${gained}${goal.xp} XP today.` : gained.trim() || undefined,
      icon: days > 0 ? 'Flame' : 'Target',
      tone: 'ok',
      action: days > 0 ? 'streak' : undefined,
    });
  }

  const broken = eventsOf(events, 'streak-broken')[0];
  if (broken && broken.previous >= 2) {
    toasts.push({
      id: 'shell-streak-end',
      title: `Your ${broken.previous} day streak has ended`,
      description: 'It happens to everyone. Today starts a new one.',
      icon: 'Flame',
      tone: 'neutral',
      duration: 7000,
    });
  }
  const frozen = eventsOf(events, 'streak-freeze-used').pop();
  if (frozen) {
    toasts.push({
      id: 'shell-freeze',
      title: 'A streak freeze covered a missed day',
      description: frozen.remaining > 0 ? `Your streak is safe. ${frozen.remaining} ${plural(frozen.remaining, 'freeze', 'freezes')} left.` : 'Your streak is safe. That was your last freeze.',
      icon: 'Snowflake',
      tone: 'info',
      duration: 7000,
    });
  }

  // --- Achievements ---
  const achievements = eventsOf(events, 'achievement-unlocked');
  const small = achievements.filter((a) => !BIG_TIERS.has(a.tier));
  for (const a of achievements) {
    if (!BIG_TIERS.has(a.tier)) continue;
    plan.modals.push({ kind: 'achievement', id: a.id, name: a.name, description: ACHIEVEMENT_BY_ID[a.id]?.description ?? '', icon: a.icon, tier: a.tier, gems: a.gems });
  }
  if (small.length === 1) {
    const a = small[0];
    toasts.push({ id: `shell-ach-${a.id}`, title: `Achievement: ${a.name}`, description: [ACHIEVEMENT_BY_ID[a.id]?.description, gemsText(a.gems)].filter(Boolean).join(' '), icon: a.icon, tone: 'ok', duration: 6000 });
  } else if (small.length > 1) {
    const gems = small.reduce((sum, a) => sum + a.gems, 0);
    toasts.push({ id: 'shell-ach-many', title: `${small.length} achievements unlocked`, description: `${small.map((a) => a.name).join(', ')}. ${gemsText(gems)}`, icon: 'Award', tone: 'ok', duration: 7000 });
  }

  // --- Quests ---
  const quests = eventsOf(events, 'quest-completed');
  const sweep = eventsOf(events, 'quests-all-completed')[0];
  if (quests.length > 0 || sweep) {
    const gems = quests.reduce((sum, q) => sum + q.gems, 0) + (sweep?.gems ?? 0);
    const title = sweep ? 'All three daily quests done' : quests.length === 1 ? `Quest done: ${quests[0].title}` : `${quests.length} quests done`;
    const detail = sweep ? `${gemsText(gems)}, bonus included.` : gemsText(gems);
    toasts.push({ id: 'shell-quest', title, description: detail, icon: sweep ? 'ListChecks' : 'CircleCheck', tone: 'ok', duration: 5000 });
  }

  // --- Hearts ---
  const lost = eventsOf(events, 'heart-lost').pop();
  if (lost) {
    plan.heartsLeft = lost.remaining;
    if (lost.empty) {
      toasts.unshift({
        id: 'shell-hearts',
        title: 'Out of hearts',
        description: 'They come back on their own, and any practice earns one. Nothing is lost.',
        icon: 'HeartCrack',
        tone: 'warn',
        duration: 9000,
        action: 'hearts',
      });
    }
  }
  const refilled = eventsOf(events, 'hearts-refilled').pop();
  if (refilled && !lost) {
    toasts.push({ id: 'shell-hearts', title: 'Hearts are full again', description: refilled.via === 'practice' ? 'Practice refilled them.' : undefined, icon: 'Heart', tone: 'ok', duration: 3000 });
  }

  // --- Boost and crowns (least urgent) ---
  const boost = eventsOf(events, 'xp-boost-started').pop();
  if (boost) {
    const minutes = Math.max(1, Math.round((boost.until - boost.at) / 60_000));
    toasts.push({ id: 'shell-boost', title: `${boost.multiplier}× XP for ${minutes} ${plural(minutes, 'minute', 'minutes')}`, description: 'Everything you finish now counts extra.', icon: 'Zap', tone: 'info' });
  }
  const crowns = eventsOf(events, 'skill-levelled-up').filter((e) => e.title);
  if (crowns.length === 1) {
    const c = crowns[0];
    toasts.push({ id: 'shell-crown', title: `Crown ${c.to} of 5`, description: c.title, icon: 'Crown', tone: 'ok' });
  } else if (crowns.length > 1) {
    toasts.push({ id: 'shell-crown', title: `${crowns.length} skills earned a crown`, description: crowns.map((c) => c.title).join(', '), icon: 'Crown', tone: 'ok' });
  }

  plan.toasts = toasts.slice(0, MAX_TOASTS_PER_BURST);
  // If the goal toast did not make the cut, the XP still needs its own toast.
  if (!plan.toasts.some((t) => t.id === 'shell-goal')) plan.xpInToast = false;

  // One burst of confetti and one sound: the biggest moment wins.
  const bigAchievement = plan.modals.some((m) => m.kind === 'achievement');
  if (levels.length > 0 || milestone || bigAchievement) plan.confetti = 'high';
  else if (goal) plan.confetti = 'medium';
  else if (extended || sweep) plan.confetti = 'low';

  if (levels.length > 0) plan.sound = 'levelUp';
  else if (achievements.length > 0) plan.sound = 'achievement';
  else if (goal || extended || milestone) plan.sound = 'streak';
  else if (quests.length > 0 || sweep) plan.sound = 'gem';
  else if (lost) plan.sound = 'heartLost';

  return plan;
}

// --- The reward card ---------------------------------------------------------------------------

/** One line of the reward card, under its headline. */
export interface RewardLine {
  id: string;
  icon: string;
  title: string;
  description?: string;
}

/** The toast that tells the learner what a moment earned: one headline and, below it, the rest. */
export interface RewardCard extends PlannedToast {
  lines: RewardLine[];
}

/** Id of the card when it carries more than one piece of news. */
export const REWARD_CARD_ID = 'shell-reward';
/** The longest the card stays up, however much it carries. */
export const REWARD_CARD_MAX_MS = 8000;

/** Alerts stay toasts of their own (a warning, a streak that ended); everything else is a reward. */
export function isAlertToast(t: PlannedToast): boolean {
  return t.tone === 'warn' || t.id === 'shell-streak-end';
}

/** The XP gained so far, as an item of the card ("+15 XP", "5 XP to go for today's goal."). */
export function xpItem(total: number, detail: string): PlannedToast {
  return { id: 'shell-xp', title: `+${total} XP`, description: detail, icon: 'Zap', tone: 'neutral', duration: 3200 };
}

/**
 * Join what is still on the card with the news of a new moment: the newest version of each item
 * wins, the XP item is replaced by the newest total, and the order stays goal, XP, then the rest as
 * they arrived. At most `MAX_TOASTS_PER_BURST + 1` items, so the card stays small.
 */
export function mergeRewardItems(onCard: readonly PlannedToast[], xp: PlannedToast | null, news: readonly PlannedToast[]): PlannedToast[] {
  const byId = new Map<string, PlannedToast>();
  for (const t of [...onCard, ...news]) byId.set(t.id, t);
  if (xp) byId.set(xp.id, xp);
  // The goal toast names the XP already ("+20 XP. 1 day streak"): no separate XP line then.
  if (byId.has('shell-goal') && xp === null) byId.delete('shell-xp');
  const all = [...byId.values()];
  const rank = (t: PlannedToast) => (t.id === 'shell-goal' ? 0 : t.id === 'shell-xp' ? 1 : 2);
  return all
    .map((t, i) => ({ t, i }))
    .sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i)
    .map((x) => x.t)
    .slice(0, MAX_TOASTS_PER_BURST + 1);
}

/**
 * One card for a moment's rewards instead of a stack of toasts that would bury a screen's own
 * summary: a single item is shown as itself; several get one headline (the goal, else the XP, else
 * the first) and a line each for the rest.
 */
export function rewardCard(items: readonly PlannedToast[]): RewardCard | null {
  if (items.length === 0) return null;
  const [head, ...rest] = items;
  if (rest.length === 0) return { ...head, lines: [] };
  const durations = items.map((t) => (t.duration === undefined ? 4000 : t.duration)).filter((d) => d > 0);
  const longest = durations.length ? Math.max(...durations) : 4000;
  return {
    id: REWARD_CARD_ID,
    title: head.title,
    description: head.description,
    icon: head.icon,
    tone: 'ok',
    duration: Math.min(REWARD_CARD_MAX_MS, longest + 1500 * (rest.length - 1)),
    action: items.find((t) => t.action)?.action,
    lines: rest.map((t) => ({ id: t.id, icon: t.icon, title: t.title, description: t.description })),
  };
}

/**
 * Adds up XP gains that arrive close together, so the learner sees one counter grow ("+5", then
 * "+15") instead of a stack of toasts.
 */
export class XpTally {
  private total = 0;
  private lastAt = Number.NEGATIVE_INFINITY;

  /** `windowMs`: a gain later than this after the previous one starts a new count. */
  constructor(private readonly windowMs = 4500) {}

  /** Add a gain at time `at` (ms). Returns the running total to show. */
  add(amount: number, at: number): number {
    if (!(amount > 0)) return this.total;
    if (at - this.lastAt > this.windowMs) this.total = 0;
    this.total += amount;
    this.lastAt = at;
    return this.total;
  }

  /** Forget the running total. */
  reset(): void {
    this.total = 0;
    this.lastAt = Number.NEGATIVE_INFINITY;
  }
}

/** The second line of the XP toast: what the gain means for today. */
export function xpToastDetail(goal: { xp: number; goal: number; met: boolean; remaining: number }, boostActive: boolean): string {
  const boost = boostActive ? ' Your XP boost is on.' : '';
  if (goal.met) return `${goal.xp} XP today. Goal met.${boost}`;
  return `${goal.remaining} XP to go for today's goal.${boost}`;
}
