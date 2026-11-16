/**
 * `#learn--<unit>--<lesson>`, `--checkpoint`, `--practice` and `#learn--review`: the lesson
 * engine's player, full-screen, on the Theory Path as it is adapted to where the learner is
 * (guitar at hand, sound on). Waits for the unit's chunk behind a skeleton, never a blank. When a
 * lesson or checkpoint finishes a unit, the way out passes through a short celebration.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionBar, Button, EmptyState, Page, Skeleton, Stack } from '@/ui';
import { navigate } from '@/app/router';
import { useImmersive } from '@/app/shell';
import { getProgress, useProgress } from '@/core/progress';
import { courseMap } from '@/lessons';
import { LessonPlayer, type NextStep } from '@/lessons/ui';
import { completedUnits } from '../model/path';
import { learnParams } from '../model/route';
import { resolveSession, sessionUnit, type ResolvedSession, type SessionView } from '../model/session';
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
    if (step.kind === 'lesson') leave(() => navigate('learn', ...learnParams({ kind: 'lesson', unitId: step.unitId, lessonId: step.lessonId })), `Next lesson: ${step.title}`);
    else if (step.kind === 'practice') leave(() => navigate('learn', step.unitId, 'practice'), 'Practise to refill hearts');
    else leave(backToPath, null);
  };
  const key = `${source.mode}:${params.join('--')}`;
  return <LessonPlayer key={key} source={source} route="learn" params={params} onExit={() => leave(backToPath, null)} onNext={onNext} />;
}
