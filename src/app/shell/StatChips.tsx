import type { ReactNode } from 'react';
import { useDailyGoal, useGems, useHearts, useStreak } from '@/core/progress';
import { GemChip, HeartsChip, Icon, ProgressRing, StreakChip, cx } from '@/ui';
import { openStats, type StatTab } from './stats';
import styles from './Stats.module.css';

/** Props for `<StatChips>`. */
export interface StatChipsProps {
  /** bar: the tight row in the phone top bar. side: the roomier row at the foot of the sidebar. */
  variant?: 'bar' | 'side';
  /**
   * In the phone top bar when room runs out (large text, a narrow phone): `compact` trims the chips'
   * padding, `core` also sets the gems chip aside (it stays measurable, but invisible and inert).
   */
  density?: 'normal' | 'compact' | 'core';
  className?: string;
}

/**
 * Streak, daily-goal ring, hearts and gems as four small buttons. Each opens the stats sheet on
 * its own panel.
 */
export function StatChips({ variant = 'bar', density = 'normal', className }: StatChipsProps) {
  const streak = useStreak();
  const goal = useDailyGoal();
  const hearts = useHearts();
  const gems = useGems();
  const side = variant === 'side';

  const chip = (tab: StatTab, label: string, content: ReactNode) => {
    const setAside = density === 'core' && tab === 'gems';
    return (
      <button key={tab} type="button" className={cx(styles.chip, setAside && styles.chipAside)} aria-label={label} aria-haspopup="dialog" aria-hidden={setAside || undefined} tabIndex={setAside ? -1 : undefined} data-chip={tab} onClick={() => openStats(tab)}>
        {content}
      </button>
    );
  };

  return (
    <div className={cx(styles.chips, side && styles.chipsSide, density !== 'normal' && styles.chipsCompact, className)} role="group" aria-label="Your progress today">
      {chip(
        'streak',
        `${streak.current} day streak${streak.todayMet ? '' : ', today still open'}. Show streak`,
        <StreakChip days={streak.current} active={streak.todayMet} pill={false} />,
      )}
      {chip(
        'goal',
        `Daily goal: ${goal.xp} of ${goal.goal} XP${goal.met ? ', met' : ''}. Show daily goal`,
        <span className={styles.goalChip}>
          <ProgressRing value={goal.xp} max={goal.goal} size={24} thickness={3} tone={goal.met ? 'ok' : 'xp'} label="Daily goal">
            {goal.met ? <Icon name="Check" size={12} strokeWidth={3.5} /> : <Icon name="Zap" size={10} strokeWidth={2.5} className={styles.goalZap} />}
          </ProgressRing>
          {side && (
            <span className={styles.goalText}>
              {goal.xp}
              <span className={styles.goalOf}>/{goal.goal}</span>
            </span>
          )}
        </span>,
      )}
      {chip(
        'hearts',
        hearts.unlimited ? 'Hearts are switched off. Show hearts' : `${hearts.count} of ${hearts.max} hearts. Show hearts`,
        hearts.unlimited ? (
          <span className={styles.unlimited}>
            <Icon name="Heart" size={16} strokeWidth={2} />
            <Icon name="Infinity" size={16} strokeWidth={2} />
          </span>
        ) : (
          <HeartsChip value={hearts.count} max={hearts.max} pill={false} />
        ),
      )}
      {chip('gems', `${gems} gems. Show gems`, <GemChip value={gems} pill={false} compact={gems > 999} />)}
    </div>
  );
}
