/**
 * Practice Plan (`#practice`): "what should I practise today, and for how long?"
 *
 *   #practice            the plan: pick a duration, get a balanced routine, adjust it, Start
 *   #practice--routines  saved and ready-made routines
 *   #practice--journal   the journal (phones; on wide screens it is always beside the plan)
 *   #practice--goals     focus goals
 *   #practice--session   the session runner, then its summary
 *
 * Phones: one column of cards with the tab strip on top and Start in the bottom action bar.
 * From 1080 px: two panes, the plan (or routines, goals) on the left and the journal on the right.
 */
import { GOAL_CHOICES } from '@/app/onboarding/model';
import { redirect } from '@/app/router';
import type { RouteProps } from '@/app/routes';
import { usePrefs } from '@/core/progress';
import { ActionBar, Button, EmptyState, Icon, LinkButton, Page, Tabs, WIDE_QUERY, useMediaQuery } from '@/ui';
import { AREA_INFO } from './model/areas';
import { durationCovering, formatDuration, minutesForXp } from './model/journal';
import { DURATIONS } from './model/planner';
import { useSession, useSessionStatus, type SessionView } from './session/controller';
import { usePlanDraft } from './usePracticeData';
import { GoalsView } from './views/GoalsView';
import { JournalView } from './views/JournalView';
import { PlanView, draftSummary, draftTitle } from './views/PlanView';
import { RoutinesView } from './views/RoutinesView';
import { RunnerView } from './views/RunnerView';
import { SummaryView } from './views/SummaryView';
import { beginSession } from './views/start';
import styles from './Practice.module.css';

type Tab = 'plan' | 'routines' | 'journal' | 'goals';
const TABS: readonly Tab[] = ['plan', 'routines', 'journal', 'goals'];

/** The running (or finished) session, at the top of the practice screen. Re-renders each second on its own. */
function SessionSlot() {
  const view = useSession();
  if (!view) return null;
  if (view.state.status === 'finished') {
    return (
      <section className={styles.resume} aria-label="Session summary">
        <span className={styles.resumeIcon} aria-hidden="true">
          <Icon name="CircleCheck" size={22} strokeWidth={2} />
        </span>
        <div className={styles.resumeText}>
          <p className={styles.resumeKicker}>Session finished</p>
          <p className={styles.resumeTitle}>{view.state.title}</p>
        </div>
        <LinkButton to="practice" params={['session']} iconRight="ArrowRight" className={styles.resumeButton}>
          See summary
        </LinkButton>
      </section>
    );
  }
  return <ResumeCard view={view} />;
}

function ResumeCard({ view }: { view: SessionView }) {
  const block = view.block;
  if (!block) return null;
  const paused = view.state.status === 'paused';
  return (
    <section className={styles.resume} aria-label="Session in progress">
      <span className={styles.resumeIcon} aria-hidden="true">
        <Icon name={paused ? 'Pause' : AREA_INFO[block.area].icon} size={22} strokeWidth={2} />
      </span>
      <div className={styles.resumeText}>
        <p className={styles.resumeKicker}>{paused ? 'Session paused' : 'Session in progress'}</p>
        <p className={styles.resumeTitle}>{block.title}</p>
        <p className={styles.resumeMeta}>
          {formatDuration(view.remainingSec)} left in block {view.state.index + 1} of {view.state.blocks.length}
        </p>
      </div>
      <LinkButton to="practice" params={['session']} variant="primary" iconRight="ArrowRight" className={styles.resumeButton} data-practice-resume="">
        Back to session
      </LinkButton>
    </section>
  );
}

function SessionScreen() {
  const view = useSession();
  if (!view) {
    return (
      <Page title="Practice session" back={{ to: 'practice', label: 'Practice Plan' }}>
        <EmptyState
          icon="CalendarCheck"
          title="No session is running"
          align="start"
          framed
          actions={
            <LinkButton to="practice" variant="primary" iconLeft="Play">
              Plan a session
            </LinkButton>
          }
        >
          Pick how long you have and you get a plan for exactly that much time.
        </EmptyState>
      </Page>
    );
  }
  return view.state.status === 'finished' ? <SummaryView view={view} /> : <RunnerView view={view} />;
}

function PracticeHome({ tab }: { tab: Tab }) {
  const wide = useMediaQuery(WIDE_QUERY);
  const prefs = usePrefs();
  // The shortest offered duration that both matches the daily goal's minutes and earns its XP.
  const goalMinutes = GOAL_CHOICES.find((c) => c.xp === prefs.dailyGoalXp)?.minutes ?? 10;
  const defaultMinutes = durationCovering(Math.max(goalMinutes, minutesForXp(prefs.dailyGoalXp)), DURATIONS);
  const draft = usePlanDraft(defaultMinutes);
  const live = useSessionStatus() === 'live';
  const current: Tab = wide && tab === 'journal' ? 'plan' : tab;

  const start = () => {
    void beginSession(draft.blocks, { title: draftTitle(draft), routineId: draft.source.kind === 'routine' ? draft.source.routineId : undefined });
  };

  // Phones show four tabs sharing the width (words only); wide screens three with icons.
  const items = wide
    ? [
        { id: 'plan' as const, label: 'Plan', icon: 'CalendarCheck' },
        { id: 'routines' as const, label: 'Routines', icon: 'ListChecks' },
        { id: 'goals' as const, label: 'Goals', icon: 'Target' },
      ]
    : [
        { id: 'plan' as const, label: 'Plan' },
        { id: 'routines' as const, label: 'Routines' },
        { id: 'journal' as const, label: 'Journal' },
        { id: 'goals' as const, label: 'Goals' },
      ];

  const content =
    current === 'plan' ? (
      <PlanView draft={draft} onStart={start} wide={wide} defaultMinutes={defaultMinutes} live={live} />
    ) : current === 'routines' ? (
      <RoutinesView />
    ) : current === 'journal' ? (
      <JournalView />
    ) : (
      <GoalsView />
    );

  return (
    <Page title="Practice Plan" subtitle="Tell it how long you have. The plan leans toward what is getting rusty and what you have skipped this week." gap={6}>
      <SessionSlot />
      <Tabs aria-label="Practice" items={items} value={current} onChange={(id) => redirect('practice', id === 'plan' ? undefined : id)} className={styles.tabs} fitted={!wide} />
      {wide ? (
        <div className={styles.panes}>
          <div className={styles.left}>{content}</div>
          <aside className={styles.right} aria-label="Practice journal">
            <JournalView compact />
          </aside>
        </div>
      ) : (
        content
      )}
      {!wide && current === 'plan' && (
        <ActionBar start={<span className={styles.barSummary}>{draftSummary(draft)}</span>}>
          <Button variant={live ? 'secondary' : 'primary'} size="lg" iconLeft="Play" onClick={start} data-practice-start="">
            Start session
          </Button>
        </ActionBar>
      )}
    </Page>
  );
}

/** The Practice Plan screen. */
export default function Practice({ params }: RouteProps) {
  const first = params[0];
  if (first === 'session') return <SessionScreen />;
  const tab: Tab = TABS.includes(first as Tab) ? (first as Tab) : 'plan';
  return <PracticeHome tab={tab} />;
}
