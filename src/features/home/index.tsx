import { useEffect, useMemo, useState } from 'react';
import { ROUTE_BY_NAME, type RouteProps } from '@/app/routes';
import { WeekStrip, openOnboarding, openStats } from '@/app/shell';
import { teacherById } from '@/app/teachers';
import {
  ACTIVITY_KINDS,
  completeOnboarding,
  dayNumber,
  localHour,
  useDailyGoal,
  useProfile,
  usePrefs,
  useProgress,
  useProgressStore,
  useQuests,
  useRecents,
  useReviewCounts,
  useStreak,
  useWeek,
  type ActivityKind,
  type QuestView,
  type RecentItem,
} from '@/core/progress';
import { AnimatedNumber, Badge, Banner, Button, Card, GemChip, Icon, LinkButton, List, ListItem, Page, ProgressBar, ProgressRing, Section, Skeleton, cx } from '@/ui';
import type { ContentItem } from '@/features/practice/model/content';
import { usePracticeLibrary } from '@/features/practice/model/library-loader';
import type { PlanBlock } from '@/features/practice/model/planner';
import { suggestPracticePlan } from '@/features/practice/model/signals';
import { getPracticeData } from '@/features/practice/model/store';
import { greetingLine, setupLine, standingLine, timeAgo } from './greeting';
import { buildPlan, continueItems, goalMinutes as minutesForGoal, minutesLeft, nextStep, type PlanStep } from './plan';
import { tipForDay } from './tips';
import styles from './Home.module.css';

const QUICK_TOOLS = ['tuner', 'metronome', 'camera', 'scan'] as const;

/**
 * The practice planner's blocks for today, worked out once per day, level, teacher and goal for the
 * life of the page: the drill a step shows must not change under the learner while they work
 * through the plan (finishing it changes what the planner would pick next). The content library
 * (technique exercises, songs, unit drills) arrives as a lazy chunk a moment after the first paint,
 * so the plan waits for it (`LIBRARY_WAIT_MS` at most, the drill and music steps shown as
 * skeletons meanwhile) and is worked out once, with whatever it has by then.
 */
let plannedToday: { key: string; blocks: PlanBlock[] } | null = null;
function practiceBlocks(store: ReturnType<typeof useProgressStore>, key: string, minutes: number, library: readonly ContentItem[] | null): PlanBlock[] {
  if (plannedToday?.key === key) return plannedToday.blocks;
  let blocks: PlanBlock[] = [];
  try {
    // The learner's focus goals and practice journal steer it too (pinned goals first).
    const { journal, goals } = getPracticeData();
    blocks = suggestPracticePlan(store.getState(), store.now(), minutes, { journal, goals }, library ?? undefined);
  } catch {
    blocks = [];
  }
  plannedToday = { key, blocks };
  return blocks;
}

/** Longest Today waits for the practice library before planning the drill and the music without it. */
const LIBRARY_WAIT_MS = 1500;

/**
 * Whether today's drill and music can be planned: the library has loaded, today's plan was already
 * made on this page, or the wait ran out (a slow or failed chunk never leaves a skeleton up).
 */
function usePlanReady(library: readonly ContentItem[] | null, key: string): boolean {
  const [waited, setWaited] = useState(false);
  const ready = !!library || waited || plannedToday?.key === key;
  useEffect(() => {
    if (ready) return undefined;
    const timer = window.setTimeout(() => setWaited(true), LIBRARY_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [ready]);
  return ready;
}

/** Signature features to point a brand-new learner at, beyond what the plan already covers. */
const FIRST_LOOKS: ReadonlyArray<{ route: string; title: string; text: string }> = [
  { route: 'arcade', title: 'Play a scale game', text: 'Short rounds that turn scale shapes into reflexes.' },
  { route: 'camera', title: 'See notes on your own guitar', text: 'Point the camera at the neck and the notes appear on your frets.' },
  { route: 'scan', title: 'Scan a sheet you own', text: 'A printed page, a photo or a PDF becomes a play-along track.' },
];

function Hero({ plan, ready }: { plan: readonly PlanStep[]; ready: boolean }) {
  const goal = useDailyGoal();
  const streak = useStreak();
  const week = useWeek();
  const next = nextStep(plan);
  const started = plan.some((s) => s.done);
  // The next step is today's drill or music, still being picked: hold its place, do not guess.
  const pending = !ready && !!next?.flexible;
  return (
    <Card variant="raised" padding="lg" className={styles.hero} data-home-hero="" aria-busy={pending ? true : undefined}>
      <div className={styles.heroTop}>
        <button type="button" className={styles.ringButton} aria-label={`Daily goal: ${goal.xp} of ${goal.goal} XP. Show details`} onClick={() => openStats('goal')}>
          <ProgressRing value={goal.xp} max={goal.goal} size={116} thickness={11} tone={goal.met ? 'ok' : 'xp'} label="Daily goal">
            <span className={styles.ringNumber}>
              <AnimatedNumber value={goal.xp} />
            </span>
            <span className={styles.ringUnit}>of {goal.goal} XP</span>
          </ProgressRing>
        </button>
        <div className={styles.heroText}>
          <p className={styles.heroKicker}>Today</p>
          <p className={styles.heroTitle}>{goal.met ? 'Daily goal met' : goal.xp > 0 ? `${goal.remaining} XP to go` : `${goal.goal} XP to earn`}</p>
          <button type="button" className={styles.streakButton} aria-label={`${streak.current} day streak. Show details`} onClick={() => openStats('streak')}>
            <span className={cx(styles.flame, (streak.current === 0 || !streak.todayMet) && styles.flameIdle)} aria-hidden="true">
              <Icon name="Flame" size={18} strokeWidth={2} />
            </span>
            <span>
              {streak.current === 0 ? 'No streak yet' : `${streak.current} day streak`}
              {streak.current > 0 && !streak.todayMet && <span className={styles.streakNote}> · today still open</span>}
            </span>
          </button>
        </div>
      </div>
      <WeekStrip days={week} />
      {pending ? (
        <Skeleton variant="block" height={52} />
      ) : next ? (
        <LinkButton variant="primary" size="lg" fullWidth wrap to={next.route} params={next.params} iconRight="ArrowRight" data-home-next="">
          {started ? 'Next' : 'Start'}: {next.title}
        </LinkButton>
      ) : (
        <LinkButton variant="primary" size="lg" fullWidth to="studio" iconRight="ArrowRight" data-home-next="">
          Plan finished. Keep playing
        </LinkButton>
      )}
    </Card>
  );
}

function PlanList({ plan, ready }: { plan: readonly PlanStep[]; ready: boolean }) {
  const next = nextStep(plan);
  const left = minutesLeft(plan);
  const done = plan.filter((s) => s.done).length;
  return (
    <Section title="Today's plan" description={next ? `${done} of ${plan.length} done · about ${left} ${left === 1 ? 'minute' : 'minutes'} left` : `All ${plan.length} steps done. Nicely played.`}>
      <List variant="card" data-home-plan="" data-minutes={left} data-ready={ready ? 'true' : 'false'} aria-busy={ready ? undefined : true}>
        {plan.map((step, i) =>
          !ready && step.flexible ? (
            // Today's drill or music, still being picked from the practice library: its place is kept.
            <ListItem
              key={step.id}
              wrap
              leading={
                <span className={styles.stepMark}>
                  <span aria-hidden="true">{i + 1}</span>
                </span>
              }
              title={<Skeleton width="55%" />}
              subtitle={<Skeleton width="80%" />}
              trailing={
                <span className={styles.stepMeta}>
                  <span>{step.minutes} min</span>
                </span>
              }
            />
          ) : (
            <ListItem
              key={step.id}
              to={step.route}
              params={step.params}
              wrap
              leading={
                <span className={cx(styles.stepMark, step.done && styles.stepDone, step === next && styles.stepNext)}>
                  {step.done ? <Icon name="Check" size={16} strokeWidth={3} label="Done" /> : <span aria-hidden="true">{i + 1}</span>}
                </span>
              }
              title={
                <span className={styles.stepTitle}>
                  <span className="sr-only">Step {i + 1}: </span>
                  {step.title}
                  {step === next && (
                    <Badge tone="accent" variant="solid">
                      Next
                    </Badge>
                  )}
                </span>
              }
              subtitle={step.detail}
              trailing={
                <span className={styles.stepMeta}>
                  <span>{step.minutes} min</span>
                  <span className={styles.stepXp}>{step.xp} XP</span>
                </span>
              }
            />
          ),
        )}
      </List>
    </Section>
  );
}

function ContinueRow({ recents, now }: { recents: readonly RecentItem[]; now: number }) {
  const items = continueItems(recents, (route) => !!ROUTE_BY_NAME[route]);
  if (items.length === 0) {
    return (
      <Section title="Worth a first look" description="Three things this app does that a book cannot.">
        <div className={styles.cards}>
          {FIRST_LOOKS.map((item) => (
            <Card key={item.route} to={item.route} padding="sm" className={styles.recent}>
              <span className={styles.recentIcon} aria-hidden="true">
                <Icon name={ROUTE_BY_NAME[item.route]?.icon ?? 'Sparkles'} size={22} />
              </span>
              <span className={styles.recentText}>
                <span className={styles.recentTitle}>{item.title}</span>
                <span className={styles.recentMeta}>{item.text}</span>
              </span>
            </Card>
          ))}
        </div>
      </Section>
    );
  }
  return (
    <Section title="Continue" description="Where you left off.">
      <div className={styles.cards}>
        {items.map((item) => {
          const kind = ACTIVITY_KINDS[item.kind];
          const half = item.fraction > 0 && item.fraction < 1;
          return (
            <Card key={item.key} to={item.route} params={item.params} padding="sm" className={styles.recent}>
              <span className={styles.recentIcon} aria-hidden="true">
                <Icon name={kind?.icon ?? ROUTE_BY_NAME[item.route]?.icon ?? 'History'} size={22} />
              </span>
              <span className={styles.recentText}>
                <span className={styles.recentTitle}>{item.title}</span>
                <span className={styles.recentMeta}>
                  {kind?.label ?? ROUTE_BY_NAME[item.route]?.title} · {timeAgo(item.at, now)}
                </span>
                {half && <ProgressBar className={styles.recentBar} aria-label={`${Math.round(item.fraction * 100)} percent done`} value={Math.round(item.fraction * 100)} size="sm" valueText={false} />}
              </span>
            </Card>
          );
        })}
      </div>
    </Section>
  );
}

function QuestRow({ quest }: { quest: QuestView }) {
  // "Earn XP" style quests point at this very screen: no link then.
  const link = quest.route !== 'home' && ROUTE_BY_NAME[quest.route] ? quest.route : undefined;
  return (
    <ListItem
      icon={quest.icon}
      to={link}
      wrap
      title={quest.title}
      subtitle={
        <span className={styles.questProgress}>
          <ProgressBar aria-label={`${quest.progress} of ${quest.target}`} value={quest.fraction * 100} size="sm" tone={quest.done ? 'ok' : 'accent'} valueText={false} />
          <span className={styles.questCount}>
            {quest.progress} / {quest.target}
          </span>
        </span>
      }
      trailing={
        quest.done ? (
          <Badge tone="ok" icon="Check">
            Done
          </Badge>
        ) : (
          <GemChip value={quest.gems} />
        )
      }
    />
  );
}

function Quests() {
  const quests = useQuests();
  return (
    <Section title="Daily quests" description={quests.allDone ? 'All three done. Fresh ones arrive tomorrow.' : `${quests.done} of ${quests.daily.length} done · finish all three for ${quests.sweepGems} bonus gems`}>
      <List variant="card">
        {quests.daily.map((q) => (
          <QuestRow key={q.id} quest={q} />
        ))}
      </List>
      {quests.weekly && (
        <div className={styles.weekly}>
          <p className={styles.weeklyLabel}>This week</p>
          <List variant="card">
            <QuestRow quest={quests.weekly} />
          </List>
        </div>
      )}
    </Section>
  );
}

function Reviews() {
  const counts = useReviewCounts();
  const due = counts.due;
  const total = counts.totals.all;
  return (
    <Card to="learn" padding="sm" className={styles.recent}>
      <span className={cx(styles.recentIcon, due > 0 && styles.dueIcon)} aria-hidden="true">
        <Icon name="Brain" size={22} />
      </span>
      <span className={styles.recentText}>
        <span className={styles.recentTitle}>{due > 0 ? `${due} ${due === 1 ? 'card' : 'cards'} to review` : total > 0 ? 'Reviews are up to date' : 'No review cards yet'}</span>
        <span className={styles.recentMeta}>
          {due > 0
            ? 'Two minutes now keeps them in your memory.'
            : total > 0
              ? `${total} ${total === 1 ? 'card' : 'cards'} in your deck. The next ones come due later.`
              : 'Finish a theory lesson and its key facts come back here, spaced out so they stick.'}
        </span>
      </span>
    </Card>
  );
}

function TipCard({ today }: { today: string }) {
  const [offset, setOffset] = useState(0);
  const tip = tipForDay(dayNumber(today), offset);
  return (
    <Card variant="sunken" className={styles.tip}>
      <p className={styles.tipLabel}>
        <Icon name="Lightbulb" size={16} strokeWidth={2} />
        {offset === 0 ? 'Tip of the day' : 'Another tip'}
      </p>
      <p className={styles.tipText} aria-live="polite">
        {tip.text}
      </p>
      <div className={styles.tipActions}>
        {tip.route && tip.action && (
          <LinkButton size="sm" to={tip.route} iconRight="ArrowRight">
            {tip.action}
          </LinkButton>
        )}
        <Button size="sm" variant="ghost" iconLeft="RefreshCw" className={styles.tipMore} onClick={() => setOffset((n) => n + 1)}>
          Another tip
        </Button>
      </div>
    </Card>
  );
}

/**
 * Today (`#home`): the greeting, the daily goal and streak, a plan of three to five steps for the
 * learner's level with one obvious place to start, what they left unfinished, the day's quests,
 * reviews that are due, the everyday tools and a practice tip. Useful from the very first visit.
 */
export default function Home(_props: RouteProps) {
  const store = useProgressStore();
  const profile = useProfile();
  const prefs = usePrefs();
  const goal = useDailyGoal();
  const streak = useStreak();
  const recents = useRecents();
  const reviews = useReviewCounts();
  const today = useProgress((s) => s.meta.today);
  const todayKinds = useProgress((s) => s.days[s.meta.today]?.kinds);
  const now = store.now();
  const goalMinutes = minutesForGoal(prefs.dailyGoalXp);
  const library = usePracticeLibrary();
  const planKey = `${today}|${profile.experience}|${profile.teacher}|${goalMinutes}|${store.getState().profile.createdAt}`;
  const ready = usePlanReady(library, planKey);
  const practice = useMemo(() => (ready ? practiceBlocks(store, planKey, goalMinutes, library) : undefined), [ready, store, planKey, goalMinutes, library]);

  const plan = useMemo(
    () =>
      buildPlan({
        experience: profile.experience,
        teacher: profile.teacher,
        dailyGoalXp: prefs.dailyGoalXp,
        today,
        doneKinds: new Set(Object.keys(todayKinds ?? {}) as ActivityKind[]),
        dueReviews: reviews.due,
        recents,
        practice,
      }),
    [profile.experience, profile.teacher, prefs.dailyGoalXp, today, todayKinds, reviews.due, recents, practice],
  );

  const teacher = teacherById(profile.teacher);
  const subtitle = standingLine({ xp: goal.xp, goal: goal.goal, met: goal.met, remaining: goal.remaining, streak: streak.current, planLeft: plan.filter((s) => !s.done).length, goalMinutes });

  return (
    <Page title={greetingLine(localHour(now, store.timeZone()), profile.name)} subtitle={subtitle}>
      <div className={styles.layout}>
        <div className={styles.primary}>
          <Hero plan={plan} ready={ready} />
          {!profile.onboarded && (
            <Banner
              tone="neutral"
              icon="Sparkles"
              title="Make it yours"
              onDismiss={() => completeOnboarding()}
              actions={
                <Button size="sm" onClick={openOnboarding}>
                  Set it up (1 minute)
                </Button>
              }
            >
              <span data-home-setup="">{setupLine({ handedness: prefs.handedness, experience: profile.experience, teacherName: teacher.name })}</span>
            </Banner>
          )}
          <PlanList plan={plan} ready={ready} />
          <ContinueRow recents={recents} now={now} />
        </div>

        <div className={styles.secondary}>
          <Quests />

          <Section title="Reviews">
            <Reviews />
          </Section>

          <Section title="Quick tools">
            <div className={styles.tools}>
              {QUICK_TOOLS.map((name) => {
                const def = ROUTE_BY_NAME[name];
                if (!def) return null;
                return (
                  <Card key={name} to={name} padding="none" className={styles.tool}>
                    <Icon name={def.icon} size={24} />
                    <span className={styles.toolLabel}>{def.title}</span>
                  </Card>
                );
              })}
            </div>
          </Section>

          <TipCard today={today} />
        </div>
      </div>
    </Page>
  );
}
