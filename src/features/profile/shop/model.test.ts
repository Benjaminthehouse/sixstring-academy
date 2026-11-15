import { describe, expect, it } from 'vitest';
import { COSMETICS, DEFAULT_COSMETICS, heartsOf, shopOf, xpBoostOf } from '@/core/progress';
import { emptyFixture, richFixture } from '../testing/fixtures';
import { CATEGORIES, accentName, consumableState, cosmeticAction, cosmeticStatus, cosmeticsOf, inlayName, lookWith, purchaseMessage, shortfallText, woodName } from './model';

const NOW = Date.parse('2026-11-15T19:10:00Z');

describe('cosmetics', () => {
  it('has a shelf for every category in the catalog, and every item sits on one', () => {
    expect(new Set(CATEGORIES.map((c) => c.id))).toEqual(new Set(COSMETICS.map((c) => c.category)));
    expect(CATEGORIES.flatMap((c) => cosmeticsOf(COSMETICS, c.id))).toHaveLength(COSMETICS.length);
  });

  it('turns ids into the names CSS and the preview use', () => {
    expect(accentName('accent-cherry')).toBe('cherry');
    expect(woodName('wood-roasted-maple')).toBe('roasted-maple');
    expect(inlayName('inlay-offset-dots')).toBe('offset-dots');
    expect(accentName(DEFAULT_COSMETICS.accent)).toBe('sunburst');
  });

  it('offers exactly one thing per item: nothing, equip, buy, or what is missing', () => {
    expect(cosmeticAction({ owned: true, equipped: true, price: 0 }, 0)).toEqual({ kind: 'equipped' });
    expect(cosmeticAction({ owned: true, equipped: false, price: 200 }, 0)).toEqual({ kind: 'equip' });
    expect(cosmeticAction({ owned: false, equipped: false, price: 150 }, 150)).toEqual({ kind: 'buy', price: 150 });
    expect(cosmeticAction({ owned: false, equipped: false, price: 400 }, 360)).toEqual({ kind: 'short', price: 400, missing: 40 });
  });

  it('labels an item by its state', () => {
    expect(cosmeticStatus({ owned: true, equipped: true, price: 0 })).toBe('Equipped');
    expect(cosmeticStatus({ owned: true, equipped: false, price: 0 })).toBe('Owned');
    expect(cosmeticStatus({ owned: false, equipped: false, price: 300 })).toBe('300 gems');
  });

  it('tries an item on over the equipped look without changing the rest', () => {
    const equipped = { wood: 'wood-rosewood', inlay: 'inlay-dots', accent: 'accent-sunburst' };
    expect(lookWith(equipped, null)).toBe(equipped);
    expect(lookWith(equipped, { id: 'wood-ebony', category: 'wood' })).toEqual({ ...equipped, wood: 'wood-ebony' });
    expect(lookWith(equipped, { id: 'accent-ocean', category: 'accent' })).toEqual({ ...equipped, accent: 'accent-ocean' });
    expect(equipped.wood).toBe('wood-rosewood');
  });
});

describe('what the shop says', () => {
  it('is kind about missing gems and says how to earn them', () => {
    expect(shortfallText(1)).toMatch(/^You need 1 more gem\. /);
    expect(shortfallText(40)).toMatch(/^You need 40 more gems\. Daily quests/);
  });

  it('confirms a purchase with the balance that is left', () => {
    expect(purchaseMessage({ ok: true, item: 'wood-ebony', price: 150, balance: 210 }, { name: 'Ebony', price: 150, gems: 360, equipped: true })).toEqual({ tone: 'ok', title: 'Ebony is yours, and it is on', description: '210 gems left.' });
    expect(purchaseMessage({ ok: true, item: 'streak-freeze', price: 60, balance: 1 }, { name: 'Streak freeze', price: 60, gems: 61 })).toEqual({ tone: 'ok', title: 'Streak freeze is yours', description: '1 gem left.' });
  });

  it('explains every way a purchase can fail, never as an error', () => {
    const context = { name: 'Vine', price: 400, gems: 360 };
    const short = purchaseMessage({ ok: false, item: 'inlay-vine', reason: 'insufficient-gems' }, context);
    expect(short.tone).toBe('info');
    expect(short.title).toBe('Not quite enough gems for Vine');
    expect(short.description).toMatch(/^You need 40 more gems\./);
    for (const reason of ['already-owned', 'max-held', 'not-needed', 'unknown-item'] as const) {
      const message = purchaseMessage({ ok: false, item: 'x', reason }, context);
      expect(message.tone).toBe('info');
      expect(message.title.length).toBeGreaterThan(10);
    }
  });
});

describe('with the real store', () => {
  it('a new learner can afford nothing and is told how many gems each helper needs', () => {
    const f = emptyFixture(NOW, 'UTC');
    const s = f.store.getState();
    const shop = shopOf(s, NOW);
    const context = { gems: shop.gems, hearts: heartsOf(s, NOW), boost: xpBoostOf(s, NOW) };
    const freeze = consumableState(shop.consumables[0], context);
    expect(freeze).toEqual({ status: '0 of 2 held', canBuy: false, reason: 'You need 60 more gems.', missing: 60 });
    // Hearts are full: the refill is not needed, which wins over "not enough gems".
    const refill = consumableState(shop.consumables[1], context);
    expect(refill).toMatchObject({ status: '5 of 5 hearts', canBuy: false, reason: 'Your hearts are full.', missing: 0 });
    expect(consumableState(shop.consumables[2], context)).toMatchObject({ status: 'Not running', canBuy: false, missing: 40 });
    // And the store agrees.
    expect(f.actions.buy('streak-freeze')).toEqual({ ok: false, item: 'streak-freeze', reason: 'insufficient-gems' });
    for (const item of shop.cosmetics.filter((c) => !c.owned)) expect(cosmeticAction(item, shop.gems).kind).toBe('short');
    for (const item of shop.cosmetics.filter((c) => c.owned && !c.equipped)) expect(cosmeticAction(item, shop.gems).kind).toBe('equip');
  });

  it('buying and equipping moves an item through its states', () => {
    const f = richFixture(NOW, 'UTC');
    const before = f.store.getState().gems.balance;
    const ebony = (): ReturnType<typeof shopOf>['cosmetics'][number] => shopOf(f.store.getState(), NOW).cosmetics.find((c) => c.id === 'wood-ebony')!;
    expect(cosmeticAction(ebony(), before)).toEqual({ kind: 'buy', price: 150 });
    const result = f.actions.buy('wood-ebony');
    expect(result.ok).toBe(true);
    expect(cosmeticAction(ebony(), f.store.getState().gems.balance)).toEqual({ kind: 'equip' });
    expect(f.actions.equipCosmetic('wood-ebony')).toBe(true);
    expect(cosmeticAction(ebony(), f.store.getState().gems.balance)).toEqual({ kind: 'equipped' });
    expect(f.store.getState().prefs.fretboard.wood).toBe('wood-ebony');
    // The vine is still out of reach, by exactly the difference.
    const vine = shopOf(f.store.getState(), NOW).cosmetics.find((c) => c.id === 'inlay-vine')!;
    const gems = f.store.getState().gems.balance;
    expect(cosmeticAction(vine, gems)).toEqual({ kind: 'short', price: 400, missing: 400 - gems });
    expect(f.actions.buy('inlay-vine')).toMatchObject({ ok: false, reason: 'insufficient-gems' });
    expect(f.store.getState().gems.balance).toBe(gems);
  });

  it('describes the helpers as the learner holds them', () => {
    const f = richFixture(NOW, 'UTC');
    const view = () => {
      const s = f.store.getState();
      const shop = shopOf(s, NOW);
      return { shop, context: { gems: shop.gems, hearts: heartsOf(s, NOW), boost: xpBoostOf(s, NOW) } };
    };
    let { shop, context } = view();
    expect(consumableState(shop.consumables[0], context)).toEqual({ status: '1 of 2 held', canBuy: true, reason: null, missing: 0 });
    expect(consumableState(shop.consumables[1], context)).toEqual({ status: '3 of 5 hearts', canBuy: true, reason: null, missing: 0 });
    f.actions.buy('streak-freeze');
    f.actions.buy('heart-refill');
    f.actions.buy('xp-boost');
    ({ shop, context } = view());
    expect(consumableState(shop.consumables[0], context)).toMatchObject({ status: '2 of 2 held', canBuy: false, reason: 'You already hold two, the most you can keep.' });
    expect(consumableState(shop.consumables[1], context)).toMatchObject({ status: '5 of 5 hearts', canBuy: false, reason: 'Your hearts are full.' });
    expect(consumableState(shop.consumables[2], context).status).toBe('Active for 15 more minutes');
    // Relaxed mode switches hearts off: say so instead of offering a refill.
    f.actions.setPrefs({ unlimitedHearts: true });
    ({ shop, context } = view());
    expect(consumableState(shop.consumables[1], context)).toMatchObject({ status: 'Relaxed mode is on', canBuy: false });
  });
});
