/**
 * Static catalogs and tuning constants of the game layer: daily goals, avatars, activity kinds,
 * the shared XP guideline, gem rewards and prices, and the cosmetic catalog.
 *
 * Numbers that shape the economy live here, in one place, so they can be balanced together.
 */
import type { ActivityKind, AchievementTier, DailyGoalXp, SkillTag } from './types';

// ---------------------------------------------------------------------------------------------
// Daily goals, avatars
// ---------------------------------------------------------------------------------------------

/**
 * The four daily goals and the minutes each stands for. A planned practice session earns 2 XP a
 * minute (`XP_RULES.practice`), so that many minutes of it meet the goal on their own.
 */
export const DAILY_GOALS: ReadonlyArray<{ xp: DailyGoalXp; id: string; label: string; blurb: string; minutes: number }> = [
  { xp: 10, id: 'casual', label: 'Casual', blurb: 'About 5 minutes a day.', minutes: 5 },
  { xp: 20, id: 'regular', label: 'Regular', blurb: 'About 10 minutes a day.', minutes: 10 },
  { xp: 30, id: 'serious', label: 'Serious', blurb: 'About 15 minutes a day.', minutes: 15 },
  { xp: 50, id: 'intense', label: 'Intense', blurb: 'About 25 minutes a day.', minutes: 25 },
];

/** Profile pictures: an id, a label and the lucide icon that draws it. */
export const AVATARS: ReadonlyArray<{ id: string; label: string; icon: string }> = [
  { id: 'guitar', label: 'Guitar', icon: 'Guitar' },
  { id: 'note', label: 'Note', icon: 'Music' },
  { id: 'headphones', label: 'Headphones', icon: 'Headphones' },
  { id: 'vinyl', label: 'Record', icon: 'Disc3' },
  { id: 'mic', label: 'Microphone', icon: 'MicVocal' },
  { id: 'drum', label: 'Drum', icon: 'Drum' },
  { id: 'keys', label: 'Keys', icon: 'Piano' },
  { id: 'radio', label: 'Radio', icon: 'Radio' },
  { id: 'flame', label: 'Flame', icon: 'Flame' },
  { id: 'bolt', label: 'Bolt', icon: 'Zap' },
  { id: 'star', label: 'Star', icon: 'Star' },
  { id: 'moon', label: 'Moon', icon: 'Moon' },
  { id: 'bird', label: 'Bird', icon: 'Bird' },
  { id: 'cat', label: 'Cat', icon: 'Cat' },
  { id: 'leaf', label: 'Leaf', icon: 'Leaf' },
  { id: 'rocket', label: 'Rocket', icon: 'Rocket' },
];

// ---------------------------------------------------------------------------------------------
// Activity kinds and the XP guideline
// ---------------------------------------------------------------------------------------------

/** How hearts respond to finishing an activity of a kind. */
export type HeartEffect = 'refill' | 'one' | 'none';

/** Static facts about an activity kind. */
export interface ActivityKindInfo {
  label: string;
  tag: SkillTag;
  /** lucide icon name. */
  icon: string;
  /** `refill`: restores every heart; `one`: gives one back; `none`: no effect. */
  hearts: HeartEffect;
}

/** Every activity kind with its label, XP tag and effect on hearts. */
export const ACTIVITY_KINDS: Readonly<Record<ActivityKind, ActivityKindInfo>> = {
  'theory-lesson': { label: 'Theory lesson', tag: 'theory', icon: 'Route', hearts: 'none' },
  'teacher-lesson': { label: 'Teacher lesson', tag: 'theory', icon: 'GraduationCap', hearts: 'none' },
  review: { label: 'Review', tag: 'memory', icon: 'Brain', hearts: 'refill' },
  'scale-practice': { label: 'Scale practice', tag: 'scales', icon: 'Waypoints', hearts: 'one' },
  'scale-game': { label: 'Scale game', tag: 'scales', icon: 'Gamepad2', hearts: 'one' },
  'chord-practice': { label: 'Chord practice', tag: 'chords', icon: 'Grid3x3', hearts: 'one' },
  'chord-change': { label: 'Chord changes', tag: 'chords', icon: 'Repeat', hearts: 'one' },
  progression: { label: 'Progression', tag: 'chords', icon: 'ListMusic', hearts: 'one' },
  song: { label: 'Song', tag: 'songs', icon: 'Music', hearts: 'one' },
  fretboard: { label: 'Fretboard', tag: 'fretboard', icon: 'Rows4', hearts: 'one' },
  ear: { label: 'Ear training', tag: 'ear', icon: 'Ear', hearts: 'one' },
  rhythm: { label: 'Rhythm', tag: 'rhythm', icon: 'Drum', hearts: 'one' },
  technique: { label: 'Technique', tag: 'technique', icon: 'Hand', hearts: 'one' },
  tuner: { label: 'Tuner', tag: 'tools', icon: 'Gauge', hearts: 'none' },
  metronome: { label: 'Metronome', tag: 'tools', icon: 'Timer', hearts: 'none' },
  camera: { label: 'Live fretboard', tag: 'tools', icon: 'ScanEye', hearts: 'none' },
  scan: { label: 'Scan and import', tag: 'tools', icon: 'ScanLine', hearts: 'none' },
  practice: { label: 'Practice session', tag: 'practice', icon: 'CalendarCheck', hearts: 'refill' },
  other: { label: 'Other', tag: 'practice', icon: 'Activity', hearts: 'none' },
};

/** The list of activity kinds, for validation. */
export const ACTIVITY_KIND_IDS = Object.keys(ACTIVITY_KINDS) as ActivityKind[];

/** The list of XP tags, for validation and charts. */
export const SKILL_TAGS: readonly SkillTag[] = ['theory', 'scales', 'chords', 'songs', 'fretboard', 'ear', 'rhythm', 'technique', 'memory', 'tools', 'practice'];

/**
 * One row of the XP guideline:
 * `xp = clamp(base + perMinute * minutes + accuracy * accuracyBonus + perCount * count + perfect, min, max)`,
 * halved when the attempt was not completed.
 */
export interface XpRule {
  base: number;
  perMinute: number;
  accuracyBonus: number;
  perfectBonus: number;
  perCount: number;
  min: number;
  max: number;
  /** Most XP this kind can give per local day (tool kinds only). */
  dailyCap?: number;
}

const rule = (r: Partial<XpRule> & { max: number }): XpRule => ({ base: 0, perMinute: 0, accuracyBonus: 0, perfectBonus: 0, perCount: 0, min: 0, ...r });

/** The shared XP guideline, so every screen awards comparable amounts. See the table in `API.md`. */
export const XP_RULES: Readonly<Record<ActivityKind, XpRule>> = {
  'theory-lesson': rule({ base: 10, perfectBonus: 5, min: 10, max: 15 }),
  'teacher-lesson': rule({ base: 15, perfectBonus: 5, min: 15, max: 20 }),
  review: rule({ base: 2, perCount: 1, min: 5, max: 20 }),
  'scale-practice': rule({ base: 2, perMinute: 1.5, min: 2, max: 20 }),
  'scale-game': rule({ base: 4, accuracyBonus: 6, perfectBonus: 2, min: 4, max: 12 }),
  'chord-practice': rule({ base: 2, perMinute: 1.5, min: 2, max: 20 }),
  'chord-change': rule({ base: 3, perMinute: 1, accuracyBonus: 5, min: 3, max: 12 }),
  progression: rule({ base: 2, perMinute: 1.5, min: 2, max: 20 }),
  song: rule({ base: 8, perMinute: 1, accuracyBonus: 8, perfectBonus: 4, min: 8, max: 30 }),
  fretboard: rule({ base: 3, accuracyBonus: 5, perfectBonus: 2, min: 3, max: 10 }),
  ear: rule({ base: 3, accuracyBonus: 5, perfectBonus: 2, min: 3, max: 10 }),
  rhythm: rule({ base: 3, accuracyBonus: 5, perfectBonus: 2, min: 3, max: 10 }),
  technique: rule({ base: 2, perMinute: 1.5, min: 2, max: 20 }),
  tuner: rule({ base: 5, min: 5, max: 5, dailyCap: 5 }),
  metronome: rule({ perMinute: 1, min: 1, max: 10, dailyCap: 20 }),
  camera: rule({ base: 3, perMinute: 1, min: 3, max: 10, dailyCap: 20 }),
  scan: rule({ base: 10, min: 10, max: 10, dailyCap: 20 }),
  // 2 XP a minute: the daily goals promise "about 10 minutes" for 20 XP (DAILY_GOALS), and one
  // session of up to an hour counts in full, so even the 50 XP goal can be met in one sitting.
  practice: rule({ perMinute: 2, min: 2, max: 120 }),
  other: rule({ max: 0 }),
};

/** No single activity may award more than this, whatever a screen passes. */
export const MAX_XP_PER_ACTIVITY = 250;

/** What `xpFor` looks at. */
export interface XpFactors {
  accuracy?: number;
  durationSec?: number;
  perfect?: boolean;
  count?: number;
  completed?: boolean;
}

/** The guideline XP for an activity. Screens call this (or omit `xp`) instead of inventing numbers. */
export function xpFor(kind: ActivityKind, factors: XpFactors = {}): number {
  const r = XP_RULES[kind] ?? XP_RULES.other;
  if (r.max <= 0) return 0;
  const minutes = Math.max(0, factors.durationSec ?? 0) / 60;
  const accuracy = Math.min(1, Math.max(0, factors.accuracy ?? 0));
  const count = Math.max(0, factors.count ?? 0);
  const raw = r.base + r.perMinute * minutes + r.accuracyBonus * accuracy + r.perCount * count + (factors.perfect ? r.perfectBonus : 0);
  const xp = Math.min(r.max, Math.max(r.min, Math.round(raw)));
  return factors.completed === false ? Math.floor(xp / 2) : xp;
}

// ---------------------------------------------------------------------------------------------
// Hearts, streak, gems
// ---------------------------------------------------------------------------------------------

/** Most hearts a learner can hold. */
export const MAX_HEARTS = 5;
/** One heart comes back every 20 minutes. */
export const HEART_REGEN_MINUTES = 20;

/** Streak lengths that are celebrated. */
export const STREAK_MILESTONES: readonly number[] = [3, 7, 14, 30, 50, 100, 200, 365];
/** Most streak freezes a learner can hold. */
export const MAX_STREAK_FREEZES = 2;

/** Gems paid the first time each streak milestone is reached. */
export const STREAK_MILESTONE_GEMS: Readonly<Record<number, number>> = { 3: 10, 7: 20, 14: 30, 30: 50, 50: 75, 100: 150, 200: 250, 365: 500 };

/** Gems for reaching a level: 10, and 25 on every fifth level. */
export function levelUpGems(level: number): number {
  return level % 5 === 0 ? 25 : 10;
}

/** Gems for a perfect lesson, game round or song. */
export const PERFECT_GEMS = 2;
/** Bonus gems for finishing all three daily quests. */
export const QUEST_SWEEP_GEMS = 10;

/** Gems paid when an achievement of a tier unlocks. */
export const ACHIEVEMENT_GEMS: Readonly<Record<AchievementTier, number>> = { bronze: 5, silver: 10, gold: 20, platinum: 40 };

/** Minutes and multiplier of the XP boost sold in the shop. */
export const SHOP_BOOST = { multiplier: 2, minutes: 15 } as const;

// ---------------------------------------------------------------------------------------------
// Cosmetics and the shop
// ---------------------------------------------------------------------------------------------

/** The three cosmetic slots. */
export type CosmeticCategory = 'wood' | 'inlay' | 'accent';

/** A cosmetic unlock. Price 0 means everyone owns it from the start. */
export interface CosmeticDef {
  id: string;
  category: CosmeticCategory;
  name: string;
  description: string;
  price: number;
}

/** The cosmetic catalog: fretboard woods, inlay styles and accent themes. */
export const COSMETICS: readonly CosmeticDef[] = [
  { id: 'wood-rosewood', category: 'wood', name: 'Rosewood', description: 'Dark, warm, the classic board.', price: 0 },
  { id: 'wood-maple', category: 'wood', name: 'Maple', description: 'Pale and bright, with dark markers.', price: 0 },
  { id: 'wood-ebony', category: 'wood', name: 'Ebony', description: 'Near black and very smooth.', price: 150 },
  { id: 'wood-pau-ferro', category: 'wood', name: 'Pau ferro', description: 'Chocolate brown with a fine grain.', price: 150 },
  { id: 'wood-roasted-maple', category: 'wood', name: 'Roasted maple', description: 'Maple baked to a caramel colour.', price: 200 },
  { id: 'wood-koa', category: 'wood', name: 'Koa', description: 'Golden, figured island wood.', price: 300 },

  { id: 'inlay-dots', category: 'inlay', name: 'Dots', description: 'Plain pearl dots.', price: 0 },
  { id: 'inlay-offset-dots', category: 'inlay', name: 'Offset dots', description: 'Small dots along the bass edge.', price: 100 },
  { id: 'inlay-blocks', category: 'inlay', name: 'Blocks', description: 'Wide pearl blocks.', price: 150 },
  { id: 'inlay-diamonds', category: 'inlay', name: 'Diamonds', description: 'Slim split diamonds.', price: 150 },
  { id: 'inlay-sharkfin', category: 'inlay', name: 'Sharkfins', description: 'Angled fins for a faster look.', price: 200 },
  { id: 'inlay-vine', category: 'inlay', name: 'Vine', description: 'A vine that climbs the whole neck.', price: 400 },

  { id: 'accent-sunburst', category: 'accent', name: 'Sunburst', description: 'The house amber.', price: 0 },
  { id: 'accent-cherry', category: 'accent', name: 'Cherry', description: 'Deep cherry red.', price: 200 },
  { id: 'accent-ocean', category: 'accent', name: 'Ocean', description: 'Cool turquoise.', price: 200 },
  { id: 'accent-forest', category: 'accent', name: 'Forest', description: 'Mossy green.', price: 200 },
  { id: 'accent-violet', category: 'accent', name: 'Violet', description: 'Dusky purple.', price: 200 },
  { id: 'accent-silverburst', category: 'accent', name: 'Silverburst', description: 'Graphite fading to silver.', price: 300 },
];

/** Cosmetics by id. */
export const COSMETIC_BY_ID: Readonly<Record<string, CosmeticDef>> = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));

/** Ids everyone owns from the start. */
export const FREE_COSMETICS: readonly string[] = COSMETICS.filter((c) => c.price === 0).map((c) => c.id);

/** The cosmetics equipped on a fresh profile, per slot. */
export const DEFAULT_COSMETICS: Readonly<Record<CosmeticCategory, string>> = { wood: 'wood-rosewood', inlay: 'inlay-dots', accent: 'accent-sunburst' };

/** The consumables sold next to the cosmetics. */
export type ConsumableId = 'streak-freeze' | 'heart-refill' | 'xp-boost';

/** A consumable shop item. */
export interface ConsumableDef {
  id: ConsumableId;
  name: string;
  description: string;
  price: number;
  /** lucide icon name. */
  icon: string;
}

/** Streak freezes, heart refills and the XP boost. */
export const CONSUMABLES: readonly ConsumableDef[] = [
  { id: 'streak-freeze', name: 'Streak freeze', description: 'Covers one missed day automatically. You can hold two.', price: 60, icon: 'Snowflake' },
  { id: 'heart-refill', name: 'Heart refill', description: 'Refills all five hearts right now.', price: 20, icon: 'Heart' },
  { id: 'xp-boost', name: 'Double XP', description: 'Doubles the XP you earn for the next 15 minutes.', price: 40, icon: 'Zap' },
];

/** Consumables by id. */
export const CONSUMABLE_BY_ID: Readonly<Record<string, ConsumableDef>> = Object.fromEntries(CONSUMABLES.map((c) => [c.id, c]));

/** Price of any shop item, or null when the id is unknown. */
export function priceOf(itemId: string): number | null {
  return CONSUMABLE_BY_ID[itemId]?.price ?? COSMETIC_BY_ID[itemId]?.price ?? null;
}
