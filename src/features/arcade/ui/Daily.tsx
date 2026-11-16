import { useMemo, useState } from 'react';
import { navigate } from '@/app/router';
import { useImmersive, useScreenTitle } from '@/app/shell';
import { ActionBar, AnimatedNumber, Badge, Button, Celebration, Heading, Icon, LinkButton, Page, StarRating, Text } from '@/ui';
import { useMusicSettings } from '@/ui/music';
import { fretCount, learnerTuning } from '@/core/settings';
import { scaleTitle, type Focus } from '../core/focus';
import { gameById, levelsOf, scopeOf } from '../core/games';
import { applyDaily, highestOpen } from '../core/records';
import { dailyChallenge, dailyStars, localDateKey, type DailyStage } from '../core/daily';
import { gameParams } from '../core/skill';
import { getRecords, updateRecords } from './store';
import { RoundScreen, type RoundOutcome } from './RoundScreen';
import { HEADLINES } from './kit';
import styles from './Arcade.module.css';

/** Today's challenge: three short rounds back to back, then one summary. Route `#arcade--daily`. */
export function Daily({ focus }: { focus: Focus }) {
  const { naming } = useMusicSettings();
  const tuning = useMemo(() => learnerTuning(), []);
  // Fixed when the challenge opens, so levels opened along the way do not change it under you.
  const [stages] = useState<DailyStage[]>(() => {
    const rec = getRecords();
    return dailyChallenge(localDateKey(), focus, (g) => highestOpen(rec, g, scopeOf(g, focus), levelsOf(g, focus, tuning, fretCount()).length));
  });
  const [step, setStep] = useState(0);
  const [between, setBetween] = useState(false);
  const [outcomes, setOutcomes] = useState<RoundOutcome[]>([]);
  const done = outcomes.length >= stages.length;
  useImmersive(true, done || between ? 'none' : 'focus');
  useScreenTitle('Today’s challenge');

  const onStage = (o: RoundOutcome) => {
    const all = [...outcomes, o];
    setOutcomes(all);
    if (all.length >= stages.length) {
      const score = all.reduce((s, x) => s + x.result.score, 0);
      updateRecords((r) => applyDaily(r, { date: localDateKey(), score, stars: dailyStars(all.map((x) => x.result.stars)), done: true }));
    } else setBetween(true);
    window.scrollTo({ top: 0 });
  };

  if (done) {
    const score = outcomes.reduce((s, x) => s + x.result.score, 0);
    const stars = dailyStars(outcomes.map((x) => x.result.stars));
    const weakest = outcomes.map((o, i) => ({ o, i })).sort((a, b) => a.o.result.accuracy - b.o.result.accuracy)[0];
    const weakGame = gameById(stages[weakest.i].game)!;
    const xp = outcomes.reduce((s, x) => s + (x.activity?.xp ?? 0), 0);
    const best = getRecords().dailyBest;
    return (
      <Page title="Today’s challenge" eyebrow={scaleTitle(focus, naming)} back={{ to: 'arcade', label: 'Scale Arcade' }}>
        <div className={styles.summary} data-arcade-daily-summary data-stars={stars} data-score={score}>
          <Celebration fire={stars >= 2 ? outcomes : null} intensity="medium" />
          <div className={styles.summaryHead} role="status">
            <StarRating value={stars} size={44} animate label={`${stars} of 3 stars`} />
            <Heading level={2} size="3xl" display>
              {stars >= 3 ? 'Challenge crushed' : HEADLINES[stars]}
            </Heading>
            <div className={styles.summaryScore}>
              <span className={styles.summaryScoreValue}>
                <AnimatedNumber value={score} from={0} duration={900} />
              </span>
              <span className={styles.summaryScoreLabel}>points across three games{best > 0 ? ` · your best day ${best.toLocaleString()}` : ''}</span>
            </div>
            <div className={styles.badgeRow}>
              {xp > 0 && (
                <Badge tone="xp" icon="Zap" size="md">
                  +{xp} XP
                </Badge>
              )}
              {score >= best && score > 0 && (
                <Badge tone="streak" icon="Trophy" size="md">
                  Best challenge yet
                </Badge>
              )}
            </div>
            <Text tone="muted" align="center">
              The challenge earns the stars of its weakest game. A new one is ready tomorrow.
            </Text>
          </div>
          <ol className={styles.stageList}>
            {outcomes.map((o, i) => {
              const g = gameById(stages[i].game)!;
              return (
                <li key={i} className={styles.stageRow}>
                  <span className={styles.dailyIcon} aria-hidden="true">
                    <Icon name={g.icon} size={18} />
                  </span>
                  <span className={styles.stageName}>
                    {g.title}
                    <Text as="span" size="sm" tone="muted">
                      {' '}
                      · level {stages[i].level}
                    </Text>
                  </span>
                  <StarRating value={o.result.stars} size={16} label={`${o.result.stars} of 3 stars`} />
                  <span className={styles.stageScore}>{o.result.score.toLocaleString()}</span>
                </li>
              );
            })}
          </ol>
          <ActionBar start={<LinkButton to="arcade" variant="ghost" iconLeft="ChevronLeft">Scale Arcade</LinkButton>}>
            <LinkButton to="arcade" params={gameParams(weakGame.id, focus)} variant="primary" iconRight="ArrowRight" wrap data-arcade-daily-next>
              Keep going: {weakGame.title}
            </LinkButton>
          </ActionBar>
        </div>
      </Page>
    );
  }

  const stage = stages[step];
  const game = gameById(stage.game)!;

  if (between) {
    const last = outcomes[outcomes.length - 1];
    const lastGame = gameById(stages[outcomes.length - 1].game)!;
    // The game after the one just played (`step` still points at the finished one until Continue).
    const upNext = gameById(stages[outcomes.length].game)!;
    return (
      <Page title="Today’s challenge" eyebrow={`${outcomes.length} of ${stages.length} done`} back={{ to: 'arcade', label: 'Scale Arcade' }}>
        <div className={styles.between} data-arcade-between>
          <StarRating value={last.result.stars} size={36} animate label={`${last.result.stars} of 3 stars`} />
          <Heading level={2} size="2xl" display>
            {lastGame.title}: {last.result.score.toLocaleString()} points
          </Heading>
          <Text tone="muted">{last.result.tip}</Text>
          <div className={styles.nextUp} data-arcade-up-next={upNext.id}>
            <span className={styles.dailyIcon} aria-hidden="true">
              <Icon name={upNext.icon} size={20} />
            </span>
            <span>
              <Text as="span" weight="semibold">
                Next: {upNext.title}
              </Text>
              <Text as="span" size="sm" tone="muted">
                {' '}
                · {upNext.blurb}
              </Text>
            </span>
          </div>
        </div>
        <ActionBar start={<LinkButton to="arcade" variant="ghost">Stop here</LinkButton>}>
          <Button
            variant="primary"
            size="lg"
            iconRight="ArrowRight"
            onClick={() => {
              setStep(outcomes.length);
              setBetween(false);
            }}
            data-arcade-daily-continue
          >
            Next game
          </Button>
        </ActionBar>
      </Page>
    );
  }

  return (
    <RoundScreen
      key={step}
      game={game}
      focus={focus}
      level={Math.min(stage.level, levelsOf(game.id, focus, tuning, fretCount()).length)}
      seed={stage.seed}
      size={stage.size}
      eyebrow={`Today’s challenge · ${step + 1} of ${stages.length}`}
      onDone={onStage}
      onExit={() => navigate('arcade')}
    />
  );
}
