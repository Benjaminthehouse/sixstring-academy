import { useMemo } from 'react';
import { isArtifact } from '@/core/platform';
import { useProgress } from '@/core/progress';
import { Banner, Card, Heading, Icon, LinkButton, List, ListItem, Page, ProgressBar, Section, StarRating, Text, cx } from '@/ui';
import { READ_LEVELS } from '../core/generate';
import { ACTIVITY_ICONS, ACTIVITY_NAMES, BEAT_LEVELS, CLOCK_LEVELS, DRILLS, LADDER, STAGES, nextRung, type ActivityId, type Rung } from '../core/ladder';
import { STRUM_PATTERNS } from '../core/strum';
import { loadCalibration } from '../core/calibration';
import styles from '../ui/Rhythm.module.css';

const FREE: ReadonlyArray<{ activity: ActivityId | 'builder' | 'calibrate'; title: string; text: string; icon: string; params: string[]; count?: number }> = [
  { activity: 'beat', title: 'Feel the beat', text: 'Tap with a click and see how close you are.', icon: ACTIVITY_ICONS.beat, params: ['beat'], count: BEAT_LEVELS.length },
  { activity: 'read', title: 'Read and tap', text: 'Rhythms in notation, from whole notes to swing.', icon: ACTIVITY_ICONS.read, params: ['read'], count: READ_LEVELS.length },
  { activity: 'strum', title: 'Strumming patterns', text: 'Listen, tap along or play along.', icon: ACTIVITY_ICONS.strum, params: ['strum'], count: STRUM_PATTERNS.length },
  { activity: 'builder', title: 'Pattern builder', text: 'Make your own strumming pattern.', icon: 'Pencil', params: ['strum', 'builder'] },
  { activity: 'drill', title: 'Drills', text: 'Subdivisions, off-beats and odd meters.', icon: ACTIVITY_ICONS.drill, params: ['drill'], count: DRILLS.length },
  { activity: 'clock', title: 'Inner clock', text: 'The click drops out. Do you hold the tempo?', icon: ACTIVITY_ICONS.clock, params: ['clock'], count: CLOCK_LEVELS.length },
  { activity: 'calibrate', title: 'Latency calibration', text: 'Ten seconds that make scoring fair on this device.', icon: 'Gauge', params: ['calibrate'] },
];

/** The rhythm hub: one next step, the whole class as a ladder, and every activity to practise freely. */
export function Hub() {
  const skills = useProgress((s) => s.skills);
  const starsOf = (skill: string) => skills[skill]?.stars ?? 0;
  const next = nextRung(starsOf);
  const done = LADDER.filter((r) => starsOf(r.skill) >= 1).length;
  const stars = LADDER.reduce((sum, r) => sum + starsOf(r.skill), 0);
  const calibration = useMemo(() => loadCalibration(), []);
  const stages = STAGES.map((stage, index) => {
    const rungs = LADDER.filter((r) => r.stage === index);
    return { ...stage, index, rungs, done: rungs.filter((r) => starsOf(r.skill) >= 1).length };
  });
  const finished = done === LADDER.length;

  const row = (r: Rung) => {
    const s = starsOf(r.skill);
    const isNext = r.skill === next.skill && !finished;
    return (
      <ListItem
        key={r.skill}
        icon={ACTIVITY_ICONS[r.activity]}
        title={r.title}
        subtitle={`${ACTIVITY_NAMES[r.activity]} · ${r.blurb}`}
        to="rhythm"
        params={r.params}
        wrap
        selected={isNext}
        trailing={s > 0 ? <StarRating value={s} size={14} /> : isNext ? <span className={styles.nextTag}>Next</span> : undefined}
        data-rung={r.skill}
      />
    );
  };

  return (
    <Page title="Rhythm" subtitle="Timing is a skill, and it trains fast. Short rounds, one step at a time.">
      <div className={styles.hub}>
        <div className={styles.hubMain}>
          <Card variant="raised" padding="lg" className={styles.nextCard} data-rhythm-next={next.skill}>
            <div className={styles.nextTop}>
              <span className={styles.nextIcon} aria-hidden="true">
                <Icon name={ACTIVITY_ICONS[next.activity]} size={26} />
              </span>
              <div className={styles.nextText}>
                <Text variant="eyebrow">
                  {finished ? 'All steps done' : done === 0 ? 'Start here' : 'Your next step'} · {ACTIVITY_NAMES[next.activity]}
                </Text>
                <Heading level={2} size="xl" display>
                  {next.title}
                </Heading>
                <Text tone="muted">{next.blurb}</Text>
              </div>
            </div>
            <ProgressBar label="The rhythm class" value={done} max={LADDER.length} valueText={`${done} of ${LADDER.length} steps · ${stars} stars`} tone="accent" />
            <LinkButton variant="primary" size="lg" fullWidth wrap to="rhythm" params={next.params} iconRight="ArrowRight">
              {finished ? 'Play it again' : done === 0 ? 'Start' : 'Continue'}: {next.title}
            </LinkButton>
          </Card>

          {calibration.tapMs === null && (
            <Banner tone="tip" title="Make the scoring fair on this device" icon="Gauge" actions={<LinkButton to="rhythm" params={['calibrate']} size="sm">Calibrate (10 seconds)</LinkButton>}>
              Every phone and laptop delays taps by a different amount. A ten-second check measures it once.
            </Banner>
          )}

          <Section title="The class" description="Six stages, in the order a teacher would give them. Nothing is locked: jump in wherever you like.">
            <div className={styles.stages}>
              {stages.map((stage) => (
                <details key={stage.index} className={styles.stage} open={stage.index === next.stage}>
                  <summary className={styles.stageSummary}>
                    <span className={cx(styles.stageNumber, stage.done === stage.rungs.length && styles.stageNumberDone)}>{stage.done === stage.rungs.length ? <Icon name="Check" size={16} strokeWidth={3} /> : stage.index + 1}</span>
                    <span className={styles.stageText}>
                      <span className={styles.stageTitle}>{stage.title}</span>
                      <span className={styles.stageBlurb}>{stage.blurb}</span>
                    </span>
                    <span className={styles.stageCount}>
                      {stage.done}/{stage.rungs.length}
                    </span>
                    <Icon name="ChevronDown" size={18} className={styles.stageChevron} />
                  </summary>
                  <div className={styles.stageBody}>
                    <List>{stage.rungs.map(row)}</List>
                  </div>
                </details>
              ))}
            </div>
          </Section>
        </div>

        <aside className={styles.hubSide}>
          <Section title="Practise freely" description={isArtifact() ? 'Tap-along works everywhere. Playing along through the microphone needs the app on its own address.' : undefined}>
            <List variant="card">
              {FREE.map((f) => (
                <ListItem key={f.title} icon={f.icon} title={f.title} subtitle={f.text} to="rhythm" params={f.params} wrap trailing={f.count ? <span className={styles.freeCount}>{f.count}</span> : undefined} />
              ))}
            </List>
          </Section>
        </aside>
      </div>
    </Page>
  );
}
