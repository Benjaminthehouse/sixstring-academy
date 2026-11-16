import { useEffect, useState, type ReactNode } from 'react';
import {
  CONSUMABLE_BY_ID,
  HEART_REGEN_MINUTES,
  buy,
  setDailyGoal,
  setPrefs,
  useDailyGoal,
  useGems,
  useHearts,
  useLevel,
  usePrefs,
  useStreak,
  useWeek,
  type DailyGoalXp,
} from '@/core/progress';
import { AnimatedNumber, Button, Icon, LevelBadge, LinkButton, ProgressBar, ProgressRing, SegmentedControl, Sheet, Switch, toast, useInterval } from '@/ui';
import { GOAL_CHOICES } from '../onboarding/model';
import { useSignal } from './signal';
import { closeStats, openStats, statsSheet, type StatTab } from './stats';
import { minutesText } from './week';
import { WeekStrip } from './WeekStrip';
import styles from './Stats.module.css';

const TABS: ReadonlyArray<{ value: StatTab; label: string; icon: string }> = [
  { value: 'goal', label: 'Goal', icon: 'Target' },
  { value: 'streak', label: 'Streak', icon: 'Flame' },
  { value: 'hearts', label: 'Hearts', icon: 'Heart' },
  { value: 'gems', label: 'Gems', icon: 'Gem' },
];

const TITLES: Record<StatTab, string> = { goal: 'Daily goal', streak: 'Streak', hearts: 'Hearts', gems: 'Gems' };

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.fact}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={styles.factValue}>{children}</dd>
    </div>
  );
}

function GoalPanel() {
  const goal = useDailyGoal();
  const level = useLevel();
  const choice = GOAL_CHOICES.find((c) => c.xp === goal.goal);
  return (
    <div className={styles.panel}>
      <div className={styles.hero}>
        <ProgressRing value={goal.xp} max={goal.goal} size={104} thickness={10} tone={goal.met ? 'ok' : 'xp'} label="Daily goal">
          <span className={styles.ringNumber}>
            <AnimatedNumber value={goal.xp} />
          </span>
          <span className={styles.ringUnit}>of {goal.goal} XP</span>
        </ProgressRing>
        <div className={styles.heroText}>
          <p className={styles.heroTitle}>{goal.met ? 'Goal met for today' : `${goal.remaining} XP to go`}</p>
          <p className={styles.heroNote}>{goal.met ? 'Everything from here is a bonus. Your streak is safe.' : 'A short lesson or a few minutes of playing gets you there.'}</p>
        </div>
      </div>

      <div className={styles.levelRow}>
        <LevelBadge level={level.level} size={44} />
        <div className={styles.levelText}>
          <ProgressBar label={`Level ${level.level} · ${level.title}`} value={level.xpIntoLevel} max={level.xpForNext} valueText={`${level.xpIntoLevel} / ${level.xpForNext} XP`} tone="xp" size="sm" />
        </div>
      </div>

      <div className={styles.setting}>
        <p className={styles.settingLabel}>Goal size</p>
        <SegmentedControl
          aria-label="Daily goal in XP"
          fullWidth
          options={GOAL_CHOICES.map((c) => ({ value: c.xp, label: `${c.xp} XP` }))}
          value={goal.goal as DailyGoalXp}
          onChange={(xp) => setDailyGoal(xp)}
        />
        {choice && (
          <p className={styles.settingNote}>
            {choice.label}: about {choice.minutes} minutes a day. {choice.note}
          </p>
        )}
      </div>
    </div>
  );
}

function StreakPanel() {
  const streak = useStreak();
  const week = useWeek();
  const gems = useGems();
  const freeze = CONSUMABLE_BY_ID['streak-freeze'];
  const canBuy = !!freeze && streak.freezes < streak.maxFreezes && gems >= freeze.price;
  return (
    <div className={styles.panel}>
      <div className={styles.hero}>
        <span className={styles.bigIcon} data-kind="streak" data-idle={streak.current === 0 || undefined} aria-hidden="true">
          <Icon name="Flame" size={44} strokeWidth={1.75} />
        </span>
        <div className={styles.heroText}>
          <p className={styles.heroTitle}>
            {streak.current} day{streak.current === 1 ? '' : 's'} in a row
          </p>
          <p className={styles.heroNote}>
            {streak.todayMet
              ? 'Today is counted. See you tomorrow.'
              : streak.current > 0
                ? 'Reach your daily goal today to keep it going.'
                : 'Reach your daily goal today and your streak starts.'}
          </p>
        </div>
      </div>
      <WeekStrip days={week} />
      <dl className={styles.facts}>
        <Fact label="Longest">
          {streak.longest} {streak.longest === 1 ? 'day' : 'days'}
        </Fact>
        <Fact label="Freezes">
          {streak.freezes} of {streak.maxFreezes}
        </Fact>
        <Fact label="Milestone">{streak.nextMilestone ? `${streak.nextMilestone} days` : 'All reached'}</Fact>
      </dl>
      <p className={styles.note}>A day counts once you reach your daily goal. A streak freeze covers one missed day automatically, so one busy day never costs you the streak.</p>
      {canBuy && freeze && (
        <Button
          iconLeft="Snowflake"
          onClick={() => {
            const result = buy('streak-freeze');
            if (result.ok) toast.ok('Streak freeze added', { description: `${result.balance} gems left.` });
          }}
        >
          Get a streak freeze for {freeze.price} gems
        </Button>
      )}
    </div>
  );
}

function HeartsPanel() {
  const hearts = useHearts();
  const gems = useGems();
  const prefs = usePrefs();
  // The countdown is the only thing here that changes with the clock alone.
  const [, setBeat] = useState(0);
  useInterval(() => setBeat((n) => n + 1), hearts.full ? null : 20_000);
  const refill = CONSUMABLE_BY_ID['heart-refill'];
  const canRefill = !!refill && !hearts.unlimited && !hearts.full && gems >= refill.price;
  return (
    <div className={styles.panel}>
      <div className={styles.hero}>
        <span className={styles.bigIcon} data-kind="heart" data-idle={hearts.empty || undefined} aria-hidden="true">
          <Icon name={hearts.empty ? 'HeartCrack' : 'Heart'} size={44} strokeWidth={1.75} />
        </span>
        <div className={styles.heroText}>
          <p className={styles.heroTitle}>{hearts.unlimited ? 'Hearts are switched off' : `${hearts.count} of ${hearts.max} hearts`}</p>
          <p className={styles.heroNote}>
            {hearts.unlimited
              ? 'Mistakes never stop a lesson in relaxed mode.'
              : hearts.full
                ? 'A full set. Go and make some mistakes.'
                : `Next heart in ${minutesText(hearts.msToNext)}. All back in ${minutesText(hearts.msToFull)}.`}
          </p>
        </div>
      </div>
      <p className={styles.note}>
        A mistake in a theory lesson costs one heart. One returns every {HEART_REGEN_MINUTES} minutes, any playing earns one back, and a finished review or practice session refills them all.
      </p>
      {canRefill && refill && (
        <Button
          iconLeft="Heart"
          onClick={() => {
            const result = buy('heart-refill');
            if (result.ok) toast.ok('Hearts refilled', { description: `${result.balance} gems left.` });
          }}
        >
          Refill now for {refill.price} gems
        </Button>
      )}
      <Switch label="Relaxed mode" description="Mistakes never cost hearts. Learning comes first." checked={prefs.unlimitedHearts} onChange={(on) => setPrefs({ unlimitedHearts: on })} />
    </div>
  );
}

function GemsPanel() {
  const gems = useGems();
  return (
    <div className={styles.panel}>
      <div className={styles.hero}>
        <span className={styles.bigIcon} data-kind="gem" aria-hidden="true">
          <Icon name="Gem" size={44} strokeWidth={1.75} />
        </span>
        <div className={styles.heroText}>
          <p className={styles.heroTitle}>
            <AnimatedNumber value={gems} /> gem{gems === 1 ? '' : 's'}
          </p>
          <p className={styles.heroNote}>Earned by playing. They are never sold.</p>
        </div>
      </div>
      <dl className={styles.facts} data-columns="2">
        <Fact label="Daily quest">5 to 10</Fact>
        <Fact label="All three quests">10 more</Fact>
        <Fact label="New level">10 or 25</Fact>
        <Fact label="Achievement">5 to 40</Fact>
      </dl>
      <p className={styles.note}>Spend them on a streak freeze, a heart refill, a burst of double XP, or new looks for your fretboard.</p>
    </div>
  );
}

/**
 * The detail sheet behind the streak, goal, hearts and gems chips: a bottom sheet on phones, a
 * small dialog on wide screens. Mounted once by the shell; open it with `openStats(tab)`.
 */
export function StatsSheet() {
  const tab = useSignal(statsSheet);
  // Keep showing the last panel while the sheet animates out.
  const [shown, setShown] = useState<StatTab>(tab ?? 'goal');
  useEffect(() => {
    if (!tab) return;
    // The shell's toasts are news: they wait while this sheet is open instead of covering it, and
    // show again when it closes (the one whose "View" led here has already gone with that tap).
    setShown(tab);
  }, [tab]);

  return (
    <Sheet
      open={tab !== null}
      onClose={closeStats}
      title={TITLES[shown]}
      size="sm"
      footer={
        <LinkButton to="profile" variant="ghost" iconRight="ArrowRight" onClick={closeStats}>
          All your progress
        </LinkButton>
      }
    >
      {/* Takes the opening focus, so the dialog does not open with a ring around its close button. */}
      <div className={styles.sheet} tabIndex={-1} data-autofocus>
        <SegmentedControl aria-label="Progress" fullWidth size="sm" options={TABS.map((t) => ({ value: t.value, label: t.label, icon: t.icon }))} value={shown} onChange={(next) => openStats(next)} />
        {shown === 'goal' && <GoalPanel />}
        {shown === 'streak' && <StreakPanel />}
        {shown === 'hearts' && <HeartsPanel />}
        {shown === 'gems' && <GemsPanel />}
      </div>
    </Sheet>
  );
}
