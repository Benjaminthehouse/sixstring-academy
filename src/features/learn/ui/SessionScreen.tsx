/**
 * `#learn--<unit>--<lesson>`, `--checkpoint`, `--practice` and `#learn--review`: the lesson
 * engine's player, full-screen, on the Theory Path as it is adapted to where the learner is
 * (guitar at hand, sound on). Waits for the unit's chunk behind a skeleton, never a blank. When a
 * lesson or checkpoint finishes a unit, the way out passes through a short celebration.
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { ActionBar, Button, EmptyState, Icon, IconButton, Page, Skeleton, Stack, Text } from '@/ui';
import { navigate } from '@/app/router';
import { useImmersive, useRewardHandoff, useRewardHold } from '@/app/shell';
import { getProgress, useProgress } from '@/core/progress';
import { courseMap } from '@/lessons';
import { LessonPlayer, type NextStep } from '@/lessons/ui';
import { completedUnits } from '../model/path';
import { learnParams } from '../model/route';
import { resolveSession, sessionUnit, type Ahead, type ResolvedSession, type SessionView } from '../model/session';
import { useConditions, useTheory } from '../useTheory';
import { UnitComplete } from './UnitComplete';
import styles from './SessionScreen.module.css';

/** A lesson-shaped placeholder while the unit's chunk arrives. */
function Loading() {
  return (
    <Page title="Loading the lesson" hideHeader>
      <div className={styles.loading} aria-busy="true" data-session-loading="">
        <Skeleton variant="block" height="0.75rem" />
        <Stack gap={4}>
          <Skeleton variant="text" width="40%" />
          <Skeleton variant="text" lines={3} />
          <Skeleton variant="block" height="12rem" />
        </Stack>
      </div>
    </Page>
  );
}

/**
 * True once the lesson player inside `ref` shows its summary (`data-phase="done"`). The player is
 * the lesson engine's, so its phase is read from the attribute it publishes.
 */
function usePlayerDone(ref: RefObject<HTMLElement | null>, active: boolean): boolean {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const root = ref.current;
    if (!active || !root) return undefined;
    const read = () => setDone(root.querySelector('[data-lesson-player]')?.getAttribute('data-phase') === 'done');
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-phase'] });
    return () => observer.disconnect();
  }, [ref, active]);
  return active && done;
}

/** Run one session of the Theory Path. */
export function SessionScreen({ view }: { view: SessionView }) {
  const { theory, failed, retry } = useTheory(sessionUnit(view));
  const [conditions] = useConditions();
  const progress = useProgress((s) => s);
  useImmersive(true, 'focus');

  // What runs is fixed once its unit is there: units arriving later must not restart the player.
  const [frozen, setFrozen] = useState<ResolvedSession | null>(null);
  const live = useMemo(() => (frozen ? null : resolveSession(view, theory, conditions, getProgress(), Date.now())), [frozen, view, theory, conditions]);
  useEffect(() => {
    if (!frozen && live && live.status !== 'loading') setFrozen(live);
  }, [frozen, live]);
  const resolved = frozen ?? live ?? { status: 'loading' as const };

  // Units finished before the session started, to notice the one it finishes.
  const before = useRef<Set<string> | null>(null);
  if (resolved.status === 'ready' && before.current === null) before.current = completedUnits(courseMap(theory.course, getProgress(), Date.now()));
  const finishedNow = useMemo(() => {
    if (resolved.status !== 'ready' || !before.current || (resolved.source.mode !== 'lesson' && resolved.source.mode !== 'checkpoint')) return null;
    const now = completedUnits(courseMap(theory.course, progress, Date.now()));
    for (const id of now) if (!before.current.has(id)) return id;
    return null;
  }, [resolved, theory, progress]);

  const [celebrating, setCelebrating] = useState<{ unitId: string; then: () => void; label: string | null } | null>(null);

  // While the lesson is loading or its steps are on screen, the shell's rewards (the previous
  // lesson's card, a new level) wait: they belong on a summary, never over a question.
  const runRef = useRef<HTMLDivElement | null>(null);
  const playerDone = usePlayerDone(runRef, resolved.status === 'ready' && !celebrating);
  useRewardHold(!celebrating && ((resolved.status === 'loading' && failed.size === 0) || (resolved.status === 'ready' && !playerDone)));
  const [aheadClosed, setAheadClosed] = useState(false);
  // Straight on to the next lesson: held from the tap, so the summary's card leaves before it shows.
  const handOff = useRewardHandoff();

  if (celebrating) {
    return (
      <UnitComplete
        theory={theory}
        unitId={celebrating.unitId}
        nextLabel={celebrating.label}
        onNext={celebrating.then}
        onPath={() => navigate('learn', celebrating.unitId)}
      />
    );
  }

  if (resolved.status === 'loading') {
    if (failed.size > 0) {
      return (
        <Page title="Theory Path" hideHeader>
          <EmptyState icon="WifiOff" title="The lesson could not be loaded" actions={<Button variant="primary" onClick={retry}>Try again</Button>}>
            Check your connection, then try again.
          </EmptyState>
        </Page>
      );
    }
    return <Loading />;
  }
  if (resolved.status === 'missing' || resolved.status === 'nothing-due') {
    const title = resolved.status === 'missing' ? resolved.title : 'Nothing to review right now';
    const text = resolved.status === 'missing' ? resolved.text : 'Every card is up to date. New ones arrive as you finish lessons.';
    return (
      <Page title="Theory Path" hideHeader>
        <div className={styles.screen}>
          <div className={styles.message} data-session-message={resolved.status}>
            <EmptyState icon={resolved.status === 'missing' ? 'Signpost' : 'CircleCheck'} title={title}>
              {text}
            </EmptyState>
          </div>
          <ActionBar>
            <Button variant="primary" iconLeft="Route" onClick={() => navigate('learn')}>
              Back to the path
            </Button>
          </ActionBar>
        </div>
      </Page>
    );
  }

  const { source, unitId, params } = resolved;
  const backToPath = () => (unitId ? navigate('learn', unitId) : navigate('learn'));
  /** Leave for `go`, through the celebration when this session finished a unit. */
  const leave = (go: () => void, label: string | null) => {
    if (finishedNow) setCelebrating({ unitId: finishedNow, then: go, label });
    else go();
  };
  const onNext = (step: NextStep) => {
    if (step.kind === 'lesson') {
      leave(() => {
        handOff();
        navigate('learn', ...learnParams({ kind: 'lesson', unitId: step.unitId, lessonId: step.lessonId }));
      }, `Next lesson: ${step.title}`);
    } else if (step.kind === 'practice') leave(() => navigate('learn', step.unitId, 'practice'), 'Practise to refill hearts');
    else leave(backToPath, null);
  };
  const key = `${source.mode}:${params.join('--')}`;
  const ahead = resolved.ahead && !aheadClosed && !playerDone ? resolved.ahead : null;
  return (
    <div ref={runRef} className={styles.run} data-session-run="">
      {ahead && <AheadNote ahead={ahead} onClose={() => setAheadClosed(true)} />}
      <LessonPlayer key={key} source={source} route="learn" params={params} onExit={() => leave(backToPath, null)} onNext={onNext} />
    </div>
  );
}

/**
 * A lesson further along the path than the learner (opened from a teacher's lesson or an old link)
 * runs, with this short note above it: what it builds on, and the way to where they are.
 */
function AheadNote({ ahead, onClose }: { ahead: Ahead; onClose: () => void }) {
  const [first, ...rest] = ahead.missing;
  const builds = first ? ` It builds on “${first.title}”${rest.length > 0 ? ` and ${rest.length} more` : ''}.` : '';
  const where = ahead.next;
  return (
    <aside className={styles.ahead} role="note" aria-label="This lesson is ahead of you" data-ahead={ahead.missing.map((m) => m.lessonId).join(' ')}>
      <span className={styles.aheadIcon} aria-hidden="true">
        <Icon name="Signpost" size="md" />
      </span>
      <Text variant="caption" className={styles.aheadText}>
        {`This lesson is ahead of where you are on the path.${builds} You can take it now.`}
      </Text>
      <div className={styles.aheadActions}>
        <Button size="sm" variant="secondary" iconLeft="Route" onClick={() => (where ? navigate('learn', where.unitId) : navigate('learn'))} data-ahead-back="">
          Back to where you are
        </Button>
        <IconButton icon="X" label="Hide this note" size="sm" onClick={onClose} data-ahead-close="" />
      </div>
    </aside>
  );
}
