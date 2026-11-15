/**
 * The technique hub (`#technique`): one next step (warm up first, then the suggested exercise),
 * every exercise grouped by skill and filtered by hand, and the healthy-playing basics.
 */
import { useMemo } from 'react';
import { HANDS, SKILL_GROUPS, TECHNIQUE_EXERCISES, getExercise, type Hand, type TechniqueExercise } from '@/content/technique';
import { useProgress } from '@/core/progress';
import { Card, ChipGroup, Heading, Icon, LinkButton, List, ListItem, Page, ProgressBar, Section, StarRating, Text, useLocalState } from '@/ui';
import { useHealthClock } from '../engine/health-clock';
import { readRecord, starsFor } from '../model/history';
import { climbs, ladderFraction } from '../model/ladder';
import { recommend, warmedUpToday } from '../model/recommend';
import styles from '../Technique.module.css';
import { exerciseEyebrow } from './Panels';

type HandFilter = Hand | 'all';

/** Level badge colour band: 1-3, 4-6, 7-10. */
const band = (level: number): number => (level <= 3 ? 1 : level <= 6 ? 2 : 3);

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** One exercise row. */
function Row({ e, best }: { e: TechniqueExercise; best: number | null }) {
  const stars = starsFor(e.tempo, best);
  const tempo = e.mode === 'routine' ? 'Routine' : e.mode === 'guide' ? 'Guide' : e.mode === 'changes' ? 'One-minute changes' : climbs(e.tempo) ? `${e.tempo.start} to ${e.tempo.goal} BPM` : `${e.tempo.start} BPM`;
  const progress = best !== null && climbs(e.tempo) ? ` · best ${best}` : '';
  return (
    <ListItem
      title={e.title}
      subtitle={`${HANDS.find((h) => h.id === e.hand)?.name} · ${tempo}${progress}`}
      leading={
        <span className={styles.level} data-band={band(e.level)} aria-label={`Level ${e.level}`}>
          L{e.level}
        </span>
      }
      trailing={
        <span className={styles.rowEnd}>
          {e.strain && (
            <span className={styles.strainMark} title="">
              <Icon name="TriangleAlert" size="sm" label="Can strain the hand: comes with a warning" />
            </span>
          )}
          {stars > 0 && <StarRating value={stars} size={14} label={`${stars} of 3 stars`} />}
        </span>
      }
      to="technique"
      params={[e.id]}
      wrap
      data-technique-row={e.id}
    />
  );
}

/** The technique hub. */
export function Hub() {
  const skills = useProgress((s) => s.skills);
  const profile = useProgress((s) => s.profile);
  const [hand, setHand] = useLocalState<HandFilter>('technique.hand', 'all');
  const health = useHealthClock();
  const bestOf = (id: string): number | null => readRecord(skills[`technique:${id}`]?.data).best;

  const warmUp = getExercise('tech-warm-up')!;
  const coolDown = getExercise('tech-cool-down')!;
  const warmed = warmedUpToday({ skills }, startOfToday());
  const next = useMemo(() => recommend({ skills, profile }), [skills, profile]);
  const nextBest = bestOf(next.id);

  const shown = TECHNIQUE_EXERCISES.filter((e) => hand === 'all' || e.hand === hand);
  const groups = SKILL_GROUPS.map((g) => ({ ...g, items: shown.filter((e) => e.skill === g.id) })).filter((g) => g.items.length);
  const count = (h: HandFilter): number => TECHNIQUE_EXERCISES.filter((e) => h === 'all' || e.hand === h).length;
  const done = TECHNIQUE_EXERCISES.filter((e) => bestOf(e.id) !== null).length;

  const today = !warmed ? (
    <Card variant="raised" padding="lg" className={styles.today} data-technique-today="warm-up">
      <div className={styles.todayTop}>
        <span className={styles.todayIcon} aria-hidden="true">
          <Icon name="Sunrise" size={26} />
        </span>
        <div className={styles.todayText}>
          <Text variant="eyebrow">Start here · 5 minutes</Text>
          <Heading level={2} size="xl" display>
            {warmUp.title}
          </Heading>
          <Text tone="muted">{warmUp.summary}</Text>
        </div>
      </div>
      <LinkButton variant="primary" size="lg" fullWidth to="technique" params={[warmUp.id]} iconRight="ArrowRight">
        Start the warm-up
      </LinkButton>
      <div className={styles.todayLinks}>
        <Text size="sm" tone="muted">
          Already warm?
        </Text>
        <LinkButton variant="ghost" size="sm" to="technique" params={[next.id]}>
          Go straight to {next.title}
        </LinkButton>
      </div>
    </Card>
  ) : (
    <Card variant="raised" padding="lg" className={styles.today} data-technique-today={next.id}>
      <div className={styles.todayTop}>
        <span className={styles.todayIcon} aria-hidden="true">
          <Icon name="Hand" size={26} />
        </span>
        <div className={styles.todayText}>
          <Text variant="eyebrow">Your next exercise · {exerciseEyebrow(next)}</Text>
          <Heading level={2} size="xl" display>
            {next.title}
          </Heading>
          <Text tone="muted">{next.summary}</Text>
        </div>
      </div>
      {climbs(next.tempo) && (
        <ProgressBar
          label="Up the ladder"
          value={Math.round(ladderFraction(next.tempo, nextBest) * 100)}
          max={100}
          valueText={nextBest !== null ? `best ${nextBest} of ${next.tempo.goal} BPM` : `${next.tempo.start} to ${next.tempo.goal} BPM`}
          tone="accent"
        />
      )}
      <LinkButton variant="primary" size="lg" fullWidth wrap to="technique" params={[next.id]} iconRight="ArrowRight">
        Practise: {next.title}
      </LinkButton>
    </Card>
  );

  return (
    <Page title="Technique" subtitle="Exercises for both hands, each with a tempo ladder: start slow, and go up a step after every clean pass.">
      <div className={styles.hub} data-technique-screen="hub">
        <div className={styles.hubMain}>
          {today}
          <ChipGroup
            aria-label="Which hand"
            options={[
              { value: 'all', label: 'All', count: count('all') },
              ...HANDS.map((h) => ({ value: h.id, label: h.name, count: count(h.id) })),
            ]}
            value={hand}
            onChange={(v) => setHand((v ?? 'all') as HandFilter)}
          />
          {groups.map((g) => (
            <Section
              key={g.id}
              title={
                <span className={styles.groupHead}>
                  <span className={styles.groupIcon} aria-hidden="true">
                    <Icon name={g.icon} size="sm" />
                  </span>
                  {g.name}
                </span>
              }
              description={g.description}
              level={2}
            >
              <List variant="card">
                {g.items.map((e) => (
                  <Row key={e.id} e={e} best={bestOf(e.id)} />
                ))}
              </List>
            </Section>
          ))}
        </div>
        <aside className={styles.hubSide} aria-label="Healthy playing">
          <Card padding="lg">
            <Section title="Play without pain" level={3} gap={3}>
              <ul className={styles.tipList}>
                <li>Warm up first, and end with two easy minutes.</li>
                <li>Blocks of 20 to 30 minutes, then a short break.</li>
                <li>The lightest pressure that gives a clean note.</li>
                <li>Every few minutes: jaw, shoulders, thumb, picking wrist. Let go.</li>
                <li>Sore fingertips are normal at first. Aching joints, numbness or tingling mean stop.</li>
              </ul>
              <div className={styles.todayLinks}>
                <LinkButton size="sm" to="technique" params={['tech-posture']} iconLeft="Armchair">
                  Posture
                </LinkButton>
                <LinkButton size="sm" to="technique" params={['tech-play-without-pain']} iconLeft="Heart">
                  The full guide
                </LinkButton>
                <LinkButton size="sm" to="technique" params={[coolDown.id]} iconLeft="Sunset">
                  Cool down
                </LinkButton>
              </div>
            </Section>
          </Card>
          <Card padding="lg">
            <Section title="So far" level={3} gap={3}>
              <ProgressBar label="Exercises with a clean pass" value={done} max={TECHNIQUE_EXERCISES.length} valueText={`${done} of ${TECHNIQUE_EXERCISES.length}`} tone="ok" />
              {health.playedSec >= 60 && (
                <Text size="sm" tone="muted">
                  {Math.floor(health.playedSec / 60)} minutes of playing in this stretch.
                </Text>
              )}
            </Section>
          </Card>
        </aside>
      </div>
    </Page>
  );
}
