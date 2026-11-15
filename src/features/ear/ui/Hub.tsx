import { useMemo } from 'react';
import { href } from '@/app/router';
import { useProgress } from '@/core/progress';
import { Card, Heading, Icon, LinkButton, Page, ProgressBar, Section, StarRating, Text, cx } from '@/ui';
import { readRecord, weakSpots, type WeakSpot } from '../core/adapt';
import { DRILLS, LADDER } from '../core/drills';
import { continueStep, currentLevel, drillSkillId, levelStatuses } from '../core/progress';
import type { DrillId } from '../core/types';
import styles from './Ear.module.css';

/** The ear-training hub: one obvious next step, the drills as a ladder, and the learner's weak spots. */
export function Hub() {
  const skills = useProgress((s) => s.skills);
  const step = continueStep(skills);
  const drill = DRILLS[step.drill];
  const level = drill.levels[step.level - 1];
  const totalLevels = LADDER.reduce((n, d) => n + d.levels.length, 0);
  const rungs = LADDER.map((d) => {
    const statuses = levelStatuses(d, skills);
    const current = currentLevel(d, skills);
    const passed = statuses.filter((s) => s.passed).length;
    // The best shown is that of the highest level with a finished round (a left round has no score).
    const finished = statuses.filter((s) => s.completions > 0);
    const best = finished.length ? finished[finished.length - 1] : null;
    return { drill: d, current, passed, best, done: passed === d.levels.length, started: statuses.some((s) => s.attempts > 0) };
  });
  const passedTotal = rungs.reduce((n, r) => n + r.passed, 0);
  const fresh = passedTotal === 0 && !rungs.some((r) => r.started);
  const weak = useMemo(() => {
    const all: Array<WeakSpot & { drill: DrillId }> = [];
    for (const d of LADDER) for (const w of weakSpots(d, readRecord(skills[drillSkillId(d.id)]?.data), { limit: 2 })) all.push({ ...w, drill: d.id });
    return all.sort((a, b) => b.count - a.count).slice(0, 3);
  }, [skills]);

  return (
    <Page title="Ear Training" subtitle="Hear it, name it. Short rounds that train your ears the way a music school does, one rung at a time.">
      <div className={styles.hub}>
        <div className={styles.hubMain}>
          <Card variant="raised" padding="lg" className={styles.next} data-ear-continue={`${step.drill}:${step.level}`}>
            <div className={styles.nextTop}>
              <span className={styles.nextIcon} aria-hidden="true">
                <Icon name={drill.icon} size={26} />
              </span>
              <div className={styles.nextText}>
                <Text variant="eyebrow">{step.done ? 'Every level passed' : fresh ? 'Start here' : 'Your next step'}</Text>
                <Heading level={2} size="xl" display>
                  {drill.title}
                </Heading>
                <Text tone="muted">
                  Level {level.n}: {level.title}. {level.blurb}.
                </Text>
              </div>
            </div>
            <ProgressBar label="The ear class" value={passedTotal} max={totalLevels} valueText={`${passedTotal} of ${totalLevels} levels`} tone="accent" />
            <LinkButton variant="primary" size="lg" fullWidth wrap to="ear" params={[step.drill, String(step.level)]} iconRight="ArrowRight" data-ear-continue-button>
              {step.done ? 'Play it again' : fresh ? 'Start' : 'Continue'}: {level.title}
            </LinkButton>
          </Card>

          {weak.length > 0 ? (
            <Section title="Your weak spots" description="What your ears mix up most. Rounds already ask more of these.">
              <ul className={styles.weak}>
                {weak.map((w) => (
                  <li key={`${w.drill}:${w.answer}>${w.chosen}`} className={styles.weakItem}>
                    <Icon name="Ear" size={18} className={styles.weakIcon} />
                    <span className={styles.weakText}>
                      <Text>{w.sentence}</Text>
                      <Text size="sm" tone="muted">
                        {DRILLS[w.drill].title} · {w.count} {w.count === 1 ? 'time' : 'times'}
                      </Text>
                    </span>
                    <LinkButton size="sm" to="ear" params={[w.drill, String(currentLevel(DRILLS[w.drill], skills))]}>
                      Practise
                    </LinkButton>
                  </li>
                ))}
              </ul>
            </Section>
          ) : (
            <Section title="How a round works" level={2}>
              <ul className={styles.weak}>
                <li className={styles.weakItem}>
                  <Icon name="Volume2" size={18} className={styles.tipIcon} />
                  <Text>Each question plays by itself. Replay it as often as you like, or slower.</Text>
                </li>
                <li className={styles.weakItem}>
                  <Icon name="Ear" size={18} className={styles.tipIcon} />
                  <Text>Miss one and you hear your answer and the right one, back to back.</Text>
                </li>
                <li className={styles.weakItem}>
                  <Icon name="LockOpen" size={18} className={styles.tipIcon} />
                  <Text>Score 80% in a round and the next level opens. The questions lean toward what you find hardest.</Text>
                </li>
              </ul>
            </Section>
          )}
        </div>

        <div className={styles.hubSide}>
          <Section title="The ladder" description="Start at the bottom and climb. Every drill is open, so jump in wherever you like.">
            <div className={styles.ladderTop} aria-hidden="true">
              <Icon name="Mountain" size={16} /> Expert ears
            </div>
            <ol className={styles.ladder} aria-label="Drills, from the first rung up">
              {rungs.map((r, i) => {
                const isNext = r.drill.id === step.drill && !step.done;
                return (
                  <li key={r.drill.id}>
                    <a className={cx(styles.rung, isNext && styles.rungNext)} href={href('ear', r.drill.id)} data-ear-rung={r.drill.id} aria-current={isNext ? 'step' : undefined}>
                      <span className={cx(styles.marker, r.started && styles.markerStarted, r.done && styles.markerDone)} aria-hidden="true">
                        {r.done ? <Icon name="Check" size={16} strokeWidth={3} /> : i + 1}
                      </span>
                      <span className={styles.rungText}>
                        <span className={styles.rungTitle}>
                          {r.drill.title}
                          {isNext && <span className={styles.tag}> · Next</span>}
                        </span>
                        <span className={styles.rungSub}>{r.drill.trains}</span>
                      </span>
                      <span className={styles.rungMeta}>
                        <span>
                          Level {r.current}/{r.drill.levels.length}
                        </span>
                        {r.best ? (
                          <>
                            <StarRating value={r.best.stars} size={12} label={`${r.best.stars} of 3 stars on level ${r.best.n}`} />
                            <span>Best {Math.round(r.best.best * 100)}%</span>
                          </>
                        ) : (
                          <span>{r.started ? 'Started' : 'Not tried'}</span>
                        )}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ol>
            <div className={styles.ladderFoot} aria-hidden="true">
              <Icon name="Footprints" size={16} /> Start here
            </div>
          </Section>
        </div>
      </div>
    </Page>
  );
}
