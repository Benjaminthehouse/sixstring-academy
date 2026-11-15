import { useEffect, useMemo, useState } from 'react';
import { buy, equipCosmetic, shopOf, useGems, useHearts, usePrefs, useProgress, useProgressStore, useXpBoost, type ConsumableView, type CosmeticView } from '@/core/progress';
import { ActionBar, Badge, Button, Card, GemChip, Icon, LinkButton, Section, toast, useInterval } from '@/ui';
import { Fretboard, inlayFromCosmetic, woodFromCosmetic, type FretMarker } from '@/ui/music';
import { plural } from '../format';
import { FretPreview } from './FretPreview';
import { CATEGORIES, HOW_TO_EARN, accentName, consumableState, cosmeticAction, cosmeticStatus, cosmeticsOf, lookWith, purchaseMessage, type Look } from './model';
import styles from './Shop.module.css';

function say(message: { tone: 'ok' | 'info'; title: string; description?: string }): void {
  if (message.tone === 'ok') toast.ok(message.title, { description: message.description });
  else toast.info(message.title, { description: message.description });
}

/** The accent tokens at work: what a button, a selection and a link look like in an accent. */
function AccentSample({ accent }: { accent: string }) {
  return (
    <div className={styles.sample} data-accent-scope={accentName(accent)} aria-hidden="true">
      <span className={styles.sampleButton}>Play</span>
      <span className={styles.sampleChip}>
        <Icon name="Check" size={14} strokeWidth={3} />
        Selected
      </span>
      <span className={styles.sampleLink}>A link</span>
    </div>
  );
}

/** An open C chord, so the board on the stage looks the way it does in a lesson. */
const STAGE_MARKERS: FretMarker[] = [
  { string: 5, fret: 3, note: 'C', noteLabel: true, color: 'deg-1', root: true },
  { string: 4, fret: 2, note: 'E', noteLabel: true, color: 'deg-3' },
  { string: 2, fret: 1, note: 'C', noteLabel: true, color: 'deg-1', root: true },
];

/**
 * The look being tried on: the app's own fretboard in that wood and those inlays (so what is
 * tried on is exactly what every lesson will show), and the accent at work.
 */
function Stage({ look, trying, leftHanded }: { look: Look; trying: CosmeticView | null; leftHanded: boolean }) {
  return (
    <div className={styles.stage} data-stage="" data-look-wood={look.wood} data-look-inlay={look.inlay} data-look-accent={look.accent} data-left-handed={leftHanded || undefined}>
      <div className={styles.stageBoard} aria-hidden="true">
        <Fretboard frets={[0, 12]} size="sm" wood={woodFromCosmetic(look.wood)} inlay={inlayFromCosmetic(look.inlay)} leftHanded={leftHanded} stringLabels={false} fretNumbers="none" minFretWidth={12} markers={STAGE_MARKERS} />
      </div>
      <div className={styles.stageInfo}>
        <p className={styles.stageCaption} aria-live="polite">
          <span className={styles.stageKicker}>{trying ? 'Trying on' : 'Your look'}</span>
          <span>{trying ? trying.name : 'As it is now'}</span>
        </p>
        <AccentSample accent={look.accent} />
      </div>
    </div>
  );
}

function Helper({ item }: { item: ConsumableView }) {
  const gems = useGems();
  const hearts = useHearts();
  const boost = useXpBoost();
  // The countdown of a running boost is the only thing here that changes with the clock alone.
  const [, setBeat] = useState(0);
  useInterval(() => setBeat((n) => n + 1), item.id === 'xp-boost' && boost.active ? 20_000 : null);
  const state = consumableState(item, { gems, hearts, boost });
  const blocked = !state.canBuy && state.missing === 0;
  return (
    <li className={styles.helper} data-item={item.id}>
      <span className={styles.helperIcon} data-kind={item.id} aria-hidden="true">
        <Icon name={item.icon} size={24} />
      </span>
      <div className={styles.helperText}>
        <p className={styles.itemName}>{item.name}</p>
        <p className={styles.itemBlurb}>{item.description}</p>
        <p className={styles.helperStatus}>
          <span className={styles.helperHave}>{state.status}</span>
          {state.reason && <span className={styles.helperReason}> · {state.reason}</span>}
        </p>
      </div>
      {/* A button says what it does: "Buy for 60", not a bare price that reads like a label. */}
      <Button className={styles.helperBuy} disabled={blocked} iconLeft="Gem" aria-label={`Buy ${item.name} for ${item.price} gems`} onClick={() => say(purchaseMessage(buy(item.id), { name: item.name, price: item.price, gems }))}>
        Buy for {item.price}
      </Button>
    </li>
  );
}

function AccentSwatch({ id }: { id: string }) {
  return (
    <span className={styles.accentSwatch} data-accent-scope={accentName(id)} aria-hidden="true">
      <span>Aa</span>
    </span>
  );
}

function CosmeticTile({ item, look, trying, leftHanded, onTry }: { item: CosmeticView; look: Look; trying: boolean; leftHanded: boolean; onTry: (item: CosmeticView) => void }) {
  return (
    <li>
      <Card padding="sm" selected={trying} onClick={() => onTry(item)} className={styles.tile} data-item={item.id} data-owned={item.owned || undefined} data-equipped={item.equipped || undefined}>
        <span className={styles.tileRow}>
          {item.category === 'accent' ? (
            <AccentSwatch id={item.id} />
          ) : (
            <FretPreview variant="swatch" wood={item.category === 'wood' ? item.id : look.wood} inlay={item.category === 'inlay' ? item.id : look.inlay} leftHanded={leftHanded} />
          )}
          <span className={styles.tileText}>
            <span className={styles.itemName}>{item.name}</span>
            <span className={styles.itemBlurb}>{item.description}</span>
            <span className={styles.tileStatus}>
              {item.equipped ? (
                <Badge tone="ok" icon="Check">
                  Equipped
                </Badge>
              ) : item.owned ? (
                <Badge>{cosmeticStatus(item)}</Badge>
              ) : (
                <GemChip value={item.price} />
              )}
            </span>
          </span>
        </span>
      </Card>
    </li>
  );
}

/**
 * The shop: helpers (streak freeze, heart refill, double XP) and cosmetics for the fretboard and
 * the interface. Tapping a cosmetic tries it on in the stage, which stays in view; the bar at the
 * bottom then offers the one thing that can be done with it: buy it, equip it, or see what is missing.
 */
export default function Shop() {
  const store = useProgressStore();
  const prefs = usePrefs();
  const gems = useGems();
  // The shop view depends on gems, ownership, equipped ids, hearts and freezes: rebuild on any of them.
  const cosmeticsOwned = useProgress((s) => s.cosmetics);
  const freezes = useProgress((s) => s.streak.freezes);
  const hearts = useHearts();
  const shop = useMemo(
    () => shopOf(store.getState(), store.now()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, gems, cosmeticsOwned, freezes, hearts.count, hearts.unlimited, prefs.fretboard.wood, prefs.fretboard.inlay, prefs.accent],
  );

  const equipped: Look = { wood: prefs.fretboard.wood, inlay: prefs.fretboard.inlay, accent: prefs.accent };
  const [tryingId, setTryingId] = useState<string | null>(null);
  const trying = shop.cosmetics.find((c) => c.id === tryingId && !c.equipped) ?? null;
  const look = lookWith(equipped, trying);
  const leftHanded = prefs.handedness === 'left';

  // Once the tried-on item is equipped there is nothing left to try.
  useEffect(() => {
    if (tryingId && shop.cosmetics.some((c) => c.id === tryingId && c.equipped)) setTryingId(null);
  }, [tryingId, shop.cosmetics]);

  const action = trying ? cosmeticAction(trying, gems) : null;

  const equip = (item: CosmeticView): void => {
    if (equipCosmetic(item.id)) toast.ok(`${item.name} is on`, { description: item.category === 'accent' ? 'The whole app wears it now.' : 'Every fretboard in the app wears it now.' });
  };
  const purchase = (item: CosmeticView): void => {
    const result = buy(item.id);
    const on = result.ok && equipCosmetic(item.id);
    say(purchaseMessage(result, { name: item.name, price: item.price, gems, equipped: on }));
  };

  return (
    <div className={styles.screen}>
      <Section title="Helpers" description="Small boosts for busy days.">
        <ul className={styles.helpers}>
          {shop.consumables.map((item) => (
            <Helper key={item.id} item={item} />
          ))}
        </ul>
      </Section>

      {/* One section around the stage and the three shelves, so the stage can stay in view while the shelves scroll. */}
      <Section title="Your look" description="Tap anything to try it on. Nothing is bought until you say so." gap={6}>
        <Stage look={look} trying={trying} leftHanded={leftHanded} />
        {CATEGORIES.map((category) => (
          <Section key={category.id} title={category.title} description={category.blurb} level={3}>
            <ul className={styles.tiles}>
              {cosmeticsOf(shop.cosmetics, category.id).map((item) => (
                <CosmeticTile key={item.id} item={item} look={equipped} trying={trying?.id === item.id} leftHanded={leftHanded} onTry={(picked) => setTryingId(picked.equipped ? null : picked.id)} />
              ))}
            </ul>
          </Section>
        ))}
      </Section>

      <p className={styles.earn}>
        <Icon name="Gem" size={18} />
        <span>
          Gems are earned by playing, never sold. {HOW_TO_EARN} <a href="#home">See today’s quests</a>
        </span>
      </p>

      {trying && action && (
        <ActionBar
          className={styles.bar}
          data-shop-action={action.kind}
          start={
            <p className={styles.barText} aria-live="polite">
              {action.kind === 'buy' && (
                <>
                  <strong>{trying.name}</strong> costs {action.price} gems. You have {gems}.
                </>
              )}
              {action.kind === 'equip' && (
                <>
                  <strong>{trying.name}</strong> is yours. Put it on?
                </>
              )}
              {action.kind === 'short' && (
                <>
                  <strong>{trying.name}</strong> costs {action.price} gems. You have {gems}, so {plural(action.missing, 'more gem')} will do it. They come quickly: daily quests pay 5 to 10 each.
                </>
              )}
            </p>
          }
        >
          <Button variant="ghost" className={styles.barQuiet} onClick={() => setTryingId(null)}>
            Take it off
          </Button>
          {action.kind === 'buy' && (
            <Button variant="primary" iconLeft="Gem" wrap onClick={() => purchase(trying)}>
              Buy for {action.price}
            </Button>
          )}
          {action.kind === 'equip' && (
            <Button variant="primary" iconLeft="Check" onClick={() => equip(trying)}>
              Equip
            </Button>
          )}
          {action.kind === 'short' && (
            <LinkButton to="home" iconRight="ArrowRight">
              Earn gems
            </LinkButton>
          )}
        </ActionBar>
      )}
    </div>
  );
}
