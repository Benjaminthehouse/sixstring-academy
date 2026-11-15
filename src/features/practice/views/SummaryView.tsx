/**
 * The end of a session: what was practised, what it earned, how it felt (with a note), progress
 * on any focus goal it worked on, and a way forward.
 */
import { useEffect, useRef, useState } from 'react';
import { navigate } from '@/app/router';
import { useScreenTitle } from '@/app/shell';
import { useDailyGoal } from '@/core/progress';
import { ActionBar, Banner, Button, Celebration, Icon, LinkButton, Page, TextArea, toast, usePrefersReducedMotion } from '@/ui';
import { formatMinutes, MAX_NOTE, type Feel } from '../model/journal';
import { openGoals, setGoalProgress } from '../model/goals';
import { blocksDone, type SessionState } from '../model/session';
import { createRoutine } from '../model/routines';
import { getPracticeData, updateJournalEntry, updatePracticeData } from '../model/store';
import { dismissPractice, type SessionView } from '../session/controller';
import { usePracticeData } from '../usePracticeData';
import { AreaTag, FeelPicker, OutcomeMark } from './parts';
import styles from './Summary.module.css';

function GoalProgress({ state }: { state: SessionState }) {
  const goals = usePracticeData((d) => d.goals);
  const worked = openGoals(goals).filter((g) => state.blocks.some((b) => b.goalId === g.id));
  if (worked.length === 0) return null;
  return (
    <section className={styles.goals} aria-label="Focus goals you worked on">
      {worked.map((g) => (
        <div key={g.id} className={styles.goalRow}>
          <span className={styles.goalText}>
            <span className={styles.goalName}>{g.title}</span>
            <span className={styles.goalPct}>{g.progress}% there</span>
          </span>
          <Button
            size="sm"
            iconLeft="TrendingUp"
            disabled={g.progress >= 100}
            onClick={() => {
              updatePracticeData((d) => ({ ...d, goals: setGoalProgress(d.goals, g.id, g.progress + 10) }));
              toast.ok(`${g.title}: ${Math.min(100, g.progress + 10)}%`);
            }}
          >
            +10% progress
          </Button>
        </div>
      ))}
    </section>
  );
}

/** The summary of a finished session. */
export function SummaryView({ view }: { view: SessionView }) {
  const s = view.state;
  const result = s.result;
  const entryId = result?.entryId;
  const entry = usePracticeData((d) => (entryId ? d.journal.find((e) => e.id === entryId) : undefined));
  const [note, setNote] = useState(entry?.note ?? '');
  const reduced = usePrefersReducedMotion();
  const goal = useDailyGoal();
  useScreenTitle('Session summary');

  // Save the note a moment after typing stops, and when leaving.
  const noteRef = useRef(note);
  noteRef.current = note;
  useEffect(() => {
    if (!entryId) return undefined;
    const t = setTimeout(() => updateJournalEntry(entryId, { note: noteRef.current }), 500);
    return () => clearTimeout(t);
  }, [note, entryId]);
  useEffect(
    () => () => {
      if (entryId) updateJournalEntry(entryId, { note: noteRef.current });
    },
    [entryId],
  );

  const done = blocksDone(s);
  const minutes = formatMinutes(view.practisedSec);
  // The shell celebrates goals, streaks and levels itself; a plain finish gets our own small burst.
  const shellCelebrates = !!result && (result.goalMetNow || result.streakExtended || result.leveledUp);
  const fire = !!result?.saved && !shellCelebrates && !reduced ? s.id : null;

  const finish = () => {
    if (entryId) updateJournalEntry(entryId, { note: noteRef.current });
    dismissPractice();
    navigate('practice');
  };
  const saveRoutine = () => {
    const blocks = s.blocks.map((b) => ({ ...b, minutes: Math.max(1, Math.round(b.plannedSec / 60)) }));
    const routine = createRoutine(s.title, blocks, Date.now());
    updatePracticeData((d) => ({ ...d, routines: [routine, ...d.routines] }));
    toast({ title: `Saved “${routine.name}” as a routine`, tone: 'ok' });
  };
  const isRoutine = !!s.routineId && getPracticeData().routines.some((r) => r.id === s.routineId);

  return (
    <Page
      eyebrow={s.title}
      title={s.endedEarly ? 'Session ended' : 'Session complete'}
      subtitle={result?.saved ? `${minutes} of practice, ${done} of ${s.blocks.length} ${s.blocks.length === 1 ? 'block' : 'blocks'} done.` : 'Short and sweet.'}
      width="prose"
    >
      <Celebration fire={fire} intensity="low" />
      {result && !result.saved && (
        <Banner tone="info" title="Too short to save">
          Sessions under half a minute are not logged. Start another whenever you are ready.
        </Banner>
      )}
      {result?.saved && (
        <dl className={styles.stats}>
          <div className={styles.stat}>
            <dt className={styles.statLabel}>Practised</dt>
            <dd className={styles.statValue}>
              <Icon name="Clock" size={18} className={styles.statIcon} />
              {Math.max(1, Math.round(view.practisedSec / 60))}
              <span className={styles.statUnit}>min</span>
            </dd>
          </div>
          <div className={styles.stat}>
            <dt className={styles.statLabel}>Earned</dt>
            <dd className={styles.statValue} data-tone="xp">
              <Icon name="Zap" size={18} className={styles.statIcon} />+{result.xp}
              <span className={styles.statUnit}>XP</span>
            </dd>
          </div>
          {result.goalMet ? (
            <div className={styles.stat}>
              <dt className={styles.statLabel}>Streak</dt>
              <dd className={styles.statValue} data-tone="streak">
                <Icon name="Flame" size={18} className={styles.statIcon} />
                {result.streak}
                <span className={styles.statUnit}>{result.streak === 1 ? 'day' : 'days'}</span>
              </dd>
            </div>
          ) : (
            <div className={styles.stat}>
              <dt className={styles.statLabel}>Daily goal</dt>
              <dd className={styles.statValue}>
                <Icon name="Target" size={18} className={styles.statIcon} />
                {goal.xp}
                <span className={styles.statUnit}>/ {goal.goal} XP</span>
              </dd>
            </div>
          )}
        </dl>
      )}

      <section aria-label="Blocks" className={styles.blocks}>
        <ol className={styles.blockList}>
          {s.blocks.map((b, i) => (
            <li key={b.id} className={styles.blockRow}>
              <OutcomeMark outcome={s.outcome[i] === 'pending' ? 'skipped' : s.outcome[i]} />
              <AreaTag area={b.area} iconOnly />
              <span className={styles.blockTitle}>{b.title}</span>
              <span className={styles.blockTime}>
                {Math.round(s.spentMs[i] / 60000)} / {Math.round(b.plannedSec / 60)} min
              </span>
            </li>
          ))}
        </ol>
      </section>

      <GoalProgress state={s} />

      {entryId && (
        <section aria-label="Your journal" className={styles.journal}>
          <FeelPicker value={entry?.feel ?? null} onChange={(feel: Feel) => updateJournalEntry(entryId, { feel })} />
          <TextArea label="A note for next time" optional value={note} onChange={setNote} autoGrow rows={2} maxLength={MAX_NOTE} placeholder="What went well, what to try tomorrow" />
          <p className={styles.saved}>Saved to your journal as you type.</p>
        </section>
      )}

      <ActionBar
        start={
          <LinkButton to="practice" params={['journal']} variant="ghost" size="sm" iconLeft="NotebookPen" onClick={() => dismissPractice()}>
            Journal
          </LinkButton>
        }
      >
        {!isRoutine && result?.saved && <Button onClick={saveRoutine}>Save as routine</Button>}
        <Button variant="primary" iconRight="ArrowRight" onClick={finish} data-practice-done="">
          Done
        </Button>
      </ActionBar>
    </Page>
  );
}
