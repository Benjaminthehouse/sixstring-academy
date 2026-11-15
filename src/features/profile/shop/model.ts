/**
 * The shop as data: what a tap on an item can do, and what to say afterwards. Buying itself is the
 * progress store's job (`buy`, `equipCosmetic`); this module only decides and words things, so the
 * rules can be tested without a browser.
 */
import type { ConsumableView, CosmeticCategory, CosmeticView, HeartsView, PurchaseResult, XpBoostView } from '@/core/progress';
import { plural } from '../format';

/** Headings of the three cosmetic slots. */
export const CATEGORIES: ReadonlyArray<{ id: CosmeticCategory; title: string; blurb: string }> = [
  { id: 'wood', title: 'Fretboard wood', blurb: 'The board under every scale and chord you look at.' },
  { id: 'inlay', title: 'Inlays', blurb: 'The position markers on the neck.' },
  { id: 'accent', title: 'Accent colour', blurb: 'The colour of buttons and of whatever is selected.' },
];

/** `accent-cherry` -> `cherry`: the value of `data-accent` and of a preview scope. */
export function accentName(id: string): string {
  return id.replace(/^accent-/, '');
}

/** `wood-roasted-maple` -> `roasted-maple`. */
export function woodName(id: string): string {
  return id.replace(/^wood-/, '');
}

/** `inlay-offset-dots` -> `offset-dots`. */
export function inlayName(id: string): string {
  return id.replace(/^inlay-/, '');
}

/** What can be done with a cosmetic right now. */
export type CosmeticAction =
  | { kind: 'equipped' }
  | { kind: 'equip' }
  | { kind: 'buy'; price: number }
  /** Not enough gems: `missing` more are needed. */
  | { kind: 'short'; price: number; missing: number };

/** The one thing to offer for a cosmetic: nothing (it is on), Equip, Buy, or how many gems are missing. */
export function cosmeticAction(item: Pick<CosmeticView, 'owned' | 'equipped' | 'price'>, gems: number): CosmeticAction {
  if (item.equipped) return { kind: 'equipped' };
  if (item.owned) return { kind: 'equip' };
  if (gems >= item.price) return { kind: 'buy', price: item.price };
  return { kind: 'short', price: item.price, missing: item.price - gems };
}

/** The short status under a cosmetic's name. */
export function cosmeticStatus(item: Pick<CosmeticView, 'owned' | 'equipped' | 'price'>): string {
  if (item.equipped) return 'Equipped';
  if (item.owned) return 'Owned';
  return `${item.price} gems`;
}

/** How to earn gems, in one sentence. Shown whenever the learner is short. */
export const HOW_TO_EARN = 'Daily quests pay 5 to 10 gems each, finishing all three adds 10, and every new level and achievement pays too.';

/** A kind sentence for "not enough gems". */
export function shortfallText(missing: number): string {
  return `You need ${plural(missing, 'more gem')}. ${HOW_TO_EARN}`;
}

/** A message for the learner after a tap in the shop. */
export interface ShopMessage {
  tone: 'ok' | 'info';
  title: string;
  description?: string;
}

/** What to say after `buy()` returned, for an item called `name` that costs `price` with `gems` in hand before the tap. */
export function purchaseMessage(result: PurchaseResult, context: { name: string; price: number; gems: number; equipped?: boolean }): ShopMessage {
  if (result.ok) {
    const left = `${plural(result.balance, 'gem')} left.`;
    return { tone: 'ok', title: context.equipped ? `${context.name} is yours, and it is on` : `${context.name} is yours`, description: left };
  }
  switch (result.reason) {
    case 'insufficient-gems':
      return { tone: 'info', title: `Not quite enough gems for ${context.name}`, description: shortfallText(Math.max(1, context.price - context.gems)) };
    case 'already-owned':
      return { tone: 'info', title: `You already own ${context.name}`, description: 'It is ready to equip.' };
    case 'max-held':
      return { tone: 'info', title: 'You already hold two streak freezes', description: 'That is the most you can keep. They are used automatically when a day is missed.' };
    case 'not-needed':
      return { tone: 'info', title: 'Your hearts are already full', description: 'Keep your gems for when you need them.' };
    default:
      return { tone: 'info', title: 'That item is not in the shop any more' };
  }
}

/** A consumable as its card shows it. */
export interface ConsumableState {
  /** What the learner has now: "1 of 2 held", "3 of 5 hearts", "Active for 12 more min". */
  status: string;
  /** True when a tap on the button buys it. */
  canBuy: boolean;
  /** Why it cannot be bought, in words, or null. A missing-gems reason is still tappable (it explains itself). */
  reason: string | null;
  /** Gems still missing, or 0. */
  missing: number;
}

/** Work out what a consumable's card says and whether its button buys. */
export function consumableState(item: ConsumableView, context: { gems: number; hearts: HeartsView; boost: XpBoostView }): ConsumableState {
  const missing = Math.max(0, item.price - context.gems);
  let status = '';
  let blocked: string | null = null;
  if (item.id === 'streak-freeze') {
    status = `${item.held} of 2 held`;
    if (!item.available) blocked = 'You already hold two, the most you can keep.';
  } else if (item.id === 'heart-refill') {
    if (context.hearts.unlimited) {
      status = 'Relaxed mode is on';
      blocked = 'Hearts are switched off in relaxed mode, so there is nothing to refill.';
    } else {
      status = `${context.hearts.count} of ${context.hearts.max} hearts`;
      if (!item.available) blocked = 'Your hearts are full.';
    }
  } else if (item.id === 'xp-boost') {
    status = context.boost.active ? `Active for ${plural(Math.max(1, Math.ceil(context.boost.msLeft / 60_000)), 'more minute')}` : 'Not running';
  }
  if (blocked) return { status, canBuy: false, reason: blocked, missing: 0 };
  if (missing > 0) return { status, canBuy: false, reason: `You need ${plural(missing, 'more gem')}.`, missing };
  return { status, canBuy: true, reason: null, missing: 0 };
}

/** The cosmetics of one slot, in catalog order. */
export function cosmeticsOf<T extends { category: CosmeticCategory }>(items: readonly T[], category: CosmeticCategory): T[] {
  return items.filter((item) => item.category === category);
}

/** What the preview stage shows: the equipped look with the item being tried on swapped in. */
export interface Look {
  wood: string;
  inlay: string;
  accent: string;
}

/** The look with `item` (if any) tried on over the equipped cosmetics. */
export function lookWith(equipped: Look, item: { id: string; category: CosmeticCategory } | null): Look {
  if (!item) return equipped;
  return { ...equipped, [item.category]: item.id };
}
