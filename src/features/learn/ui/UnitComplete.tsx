/**
 * A unit is finished: a short, tasteful celebration between the last lesson (or a passed
 * checkpoint) and whatever comes next. Confetti and a sound once (both reduced-motion and
 * sound-setting aware through the kit and the audio engine), what was achieved, and the way on.
 */
import { useEffect, useMemo } from 'react';
import { ActionBar, Button, Celebration, Heading, Icon, Page, Stat, Text } from '@/ui';
import { playUi } from '@/core/audio';
import { useProgress } from '@/core/progress';
import { courseMap, factCardId } from '@/lessons';
import type { TheoryCourse } from '@/content/theory';
import styles from './UnitComplete.module.css';

/** Props of {@link UnitComplete}. */
export interface UnitCompleteProps {
  theory: TheoryCourse;
  unitId: string;
  /** Words of the way on ("Next lesson: …"), or null for "Back to the path" only. */
  nextLabel: string | null;
  onNext: () => void;
  onPath: () => void;
}

/** The celebration of a finished unit. */
export function UnitComplete({ theory, unitId, nextLabel, onNext, onPath }: UnitCompleteProps) {
  const progress = useProgress((s) => s);
  const map = useMemo(() => courseMap(theory.course, progress, Date.now()), [theory, progress]);
  const node = map.units.find((u) => u.id === unitId);
  const path = theory.units.find((u) => u.outline.id === unitId);
  const after = theory.units.find((u) => path && u.number === path.number + 1) ?? null;
  // Cards really in the learner's deck from this unit (a test-out adds none).
  const cards = useMemo(() => {
    const ids = new Set((path?.unit?.lessons ?? []).flatMap((l) => (l.facts ?? []).map((f) => factCardId(theory.course.id, f.id))));
    return Object.keys(progress.srs.items).filter((id) => ids.has(id)).length;
  }, [path, theory, progress]);

  useEffect(() => {
    playUi('achievement');
  }, []);

  return (
    <Page title="Unit complete" hideHeader>
      <Celebration fire={unitId} intensity="high" />
      <div className={styles.screen}>
        <div className={styles.hero} data-unit-complete={unitId} role="status" aria-live="polite">
          <span className={styles.trophy} aria-hidden="true">
            <Icon name="Trophy" size={44} />
          </span>
          <p className={styles.eyebrow}>Unit {path?.number ?? ''} complete</p>
          <Heading level={1} size="3xl" display>
            {node?.title ?? path?.outline.title ?? 'Unit complete'}
          </Heading>
          <Text variant="lead" tone="muted" className={styles.lead}>
            {cards > 0
              ? 'Every lesson of this unit is done. Its review cards come back now and then, so it stays with you.'
              : 'Every lesson of this unit is done. Practise it now and then, so it stays with you.'}
          </Text>
          <div className={styles.stats}>
            <Stat label="Lessons" value={node ? `${node.done}/${node.total}` : '—'} icon="CircleCheck" />
            <Stat label="Crowns" value={node?.crowns ?? 0} icon="Crown" />
            <Stat label="Review cards" value={cards} icon="Layers" />
          </div>
          {after && (
            <Text tone="muted" className={styles.next}>
              {after.status === 'coming-soon'
                ? `Unit ${after.number}, “${after.outline.title}”, is still being written. Practise this unit or keep going where the path is open.`
                : `Next on the path: Unit ${after.number}, “${after.outline.title}”.`}
            </Text>
          )}
        </div>
        <ActionBar>
          {nextLabel ? (
            <>
              <Button onClick={onPath} data-action="path">
                Back to the path
              </Button>
              <Button variant="primary" size="lg" iconRight="ArrowRight" onClick={onNext} data-action="next" wrap>
                {nextLabel}
              </Button>
            </>
          ) : (
            <Button variant="primary" size="lg" iconRight="ArrowRight" onClick={onPath} data-action="path">
              Back to the path
            </Button>
          )}
        </ActionBar>
      </div>
    </Page>
  );
}
