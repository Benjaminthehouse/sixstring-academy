import { useMemo, useState } from 'react';
import { redirect } from '@/app/router';
import { ROUTE_BY_NAME } from '@/app/routes';
import { useAchievements, type AchievementView } from '@/core/progress';
import { Badge, Button, ChipGroup, EmptyState, GemChip, LinkButton, ProgressBar, Section, Sheet, cx } from '@/ui';
import { dateText } from '../format';
import { Medal } from '../parts/Medal';
import { FILTERS, TIERS, TIER_NAMES, filterCounts, gemsFromTrophies, groupAchievements, nextStepFor, progressFraction, progressText, spokenLabel, tierCounts, type AchievementFilter } from './model';
import styles from './Achievements.module.css';

function Tile({ a, onOpen }: { a: AchievementView; onOpen: (id: string) => void }) {
  return (
    <li>
      <button type="button" className={cx(styles.tile, a.unlocked && styles.tileEarned)} data-achievement={a.id} data-earned={a.unlocked || undefined} aria-label={spokenLabel(a)} onClick={() => onOpen(a.id)}>
        <Medal icon={a.icon} tier={a.tier} earned={a.unlocked} hidden={a.hidden} size={56} />
        <span className={styles.tileName}>{a.hidden ? 'Secret' : a.name}</span>
        {a.unlocked ? (
          <span className={styles.tileMeta}>{a.at ? dateText(a.at) : 'Earned'}</span>
        ) : a.hidden ? (
          <span className={styles.tileMeta}>Not found yet</span>
        ) : (
          <span className={styles.tileProgress}>
            <span className={styles.tileTrack} aria-hidden="true">
              <span className={styles.tileFill} style={{ width: `${Math.round(progressFraction(a) * 100)}%` }} />
            </span>
            <span className={styles.tileMeta}>{progressText(a)}</span>
          </span>
        )}
      </button>
    </li>
  );
}

function Detail({ a, onClose }: { a: AchievementView | null; onClose: () => void }) {
  const step = a ? nextStepFor(a) : null;
  const link = step && ROUTE_BY_NAME[step.route] ? step : null;
  return (
    <Sheet
      open={a !== null}
      onClose={onClose}
      size="sm"
      title={a ? (a.hidden ? 'Secret achievement' : a.name) : ''}
      footer={
        a && (
          <>
            <Button onClick={onClose}>Close</Button>
            {link && (
              <LinkButton variant="primary" to={link.route} params={link.params} iconRight="ArrowRight">
                {link.label}
              </LinkButton>
            )}
          </>
        )
      }
    >
      {a && (
        <div className={styles.detail} data-achievement-detail={a.id}>
          <Medal icon={a.icon} tier={a.tier} earned={a.unlocked} hidden={a.hidden} size={104} shine />
          <div className={styles.detailBadges}>
            <Badge tone={a.unlocked ? 'ok' : 'neutral'} icon={a.unlocked ? 'Check' : a.hidden ? 'EyeOff' : 'Lock'} size="md">
              {a.unlocked ? 'Earned' : a.hidden ? 'Hidden' : 'Locked'}
            </Badge>
            <Badge size="md">{TIER_NAMES[a.tier]}</Badge>
            <GemChip value={a.gems} />
          </div>
          {a.hidden ? (
            <p className={styles.detailText}>This one is a secret. It unlocks by itself when you do the right thing at the right moment, so there is no hint. Keep playing.</p>
          ) : (
            <p className={styles.detailText}>{a.description}</p>
          )}
          {a.unlocked ? (
            <p className={styles.detailNote}>
              {a.at ? `Earned on ${dateText(a.at)}.` : 'Earned.'} It paid {a.gems} gems.
            </p>
          ) : a.hidden ? null : (
            <div className={styles.detailProgress}>
              <ProgressBar label="Progress" value={progressFraction(a) * 100} valueText={progressText(a)} tone="accent" />
              <p className={styles.detailNote}>Earning it pays {a.gems} gems.</p>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

/**
 * Every achievement, grouped: earned ones as medals in the metal of their tier, locked ones with
 * how far along they are, secrets hidden until found. A tap opens the detail with the way to
 * earn it. `#profile--achievements--<id>` opens one directly.
 */
export default function Achievements({ openId }: { openId: string | null }) {
  const { list, unlocked, total } = useAchievements();
  const [filter, setFilter] = useState<AchievementFilter>('all');
  const [picked, setPicked] = useState<string | null>(null);

  const sections = useMemo(() => groupAchievements(list, filter), [list, filter]);
  const counts = useMemo(() => filterCounts(list), [list]);
  const tiers = useMemo(() => tierCounts(list), [list]);
  const gems = useMemo(() => gemsFromTrophies(list), [list]);

  const fromAddress = openId ? list.find((a) => a.id === openId) ?? null : null;
  const open = (picked ? list.find((a) => a.id === picked) : null) ?? fromAddress;
  const close = (): void => {
    setPicked(null);
    // Opened by its address: put the address back on the list, without adding a history step.
    if (openId) redirect('profile', 'achievements');
  };

  return (
    <div className={styles.screen}>
      <div className={styles.summary}>
        <ProgressBar label="Earned" value={unlocked} max={total} valueText={`${unlocked} of ${total}`} tone="accent" size="lg" />
        <ul className={styles.tiers} aria-label="Earned by tier">
          {TIERS.map((tier) => (
            <li key={tier} className={styles.tier}>
              <Medal icon="Award" tier={tier} earned={tiers[tier].earned > 0} size={32} />
              <span className={styles.tierText}>
                <span className={styles.tierName}>{TIER_NAMES[tier]}</span>
                <span className={styles.tierCount}>
                  {tiers[tier].earned} of {tiers[tier].total}
                </span>
              </span>
            </li>
          ))}
        </ul>
        {gems > 0 && <p className={styles.summaryNote}>Your achievements have paid {gems} gems so far.</p>}
      </div>

      <ChipGroup aria-label="Show" options={FILTERS.map((f) => ({ value: f.value, label: f.label, count: counts[f.value] }))} value={filter} onChange={(value) => setFilter(value ?? 'all')} />

      {sections.length === 0 ? (
        <EmptyState
          icon={filter === 'earned' ? 'Trophy' : 'Target'}
          title={filter === 'earned' ? 'No achievements yet' : 'Nothing in progress right now'}
          framed
          actions={<Button onClick={() => setFilter('all')}>Show all {total}</Button>}
        >
          {filter === 'earned' ? 'The first ones come quickly: tune your guitar, finish a lesson, play a song through.' : 'Everything you have started is earned. Pick a new one from the full list.'}
        </EmptyState>
      ) : (
        sections.map((section) => (
          <Section key={section.id} title={section.title} description={section.blurb} actions={<span className={styles.groupCount}>{section.id === 'secret' ? `${section.earned} of ${section.total} found` : `${section.earned} of ${section.total}`}</span>}>
            <ul className={styles.grid}>
              {section.items.map((a) => (
                <Tile key={a.id} a={a} onOpen={setPicked} />
              ))}
            </ul>
          </Section>
        ))
      )}

      <Detail a={open} onClose={close} />
    </div>
  );
}
