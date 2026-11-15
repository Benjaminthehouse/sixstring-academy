import type { ReactNode } from 'react';
import { ActionBar, Badge, Button, Celebration, Heading, Icon, LinkButton, StarRating, Text } from '@/ui';
import type { TipAction } from '../core/tips';
import { SpreadPlot } from './SpreadPlot';
import type { Round } from './useRound';
import styles from './Rhythm.module.css';

/** Props of {@link Summary}. */
export interface SummaryProps {
  round: Round;
  /** Tempo of the round, for the "slower" / "faster" buttons. */
  bpm: number;
  /** Tempo the tip's action would move to, or null when it cannot move. */
  slowerBpm: number | null;
  fasterBpm: number | null;
  /** Play the same thing again. */
  onAgain: () => void;
  /** Do what the tip suggests. */
  onAction: (action: Exclude<TipAction, null>) => void;
  /** The next step of the ladder, if there is one. */
  next: { title: string; params: string[] } | null;
  /** Activity-specific review (the phrases with their marks, a drift picture). */
  children?: ReactNode;
}

const HEADLINES = ['Not there yet', 'You got through it', 'Good timing', 'Locked in'] as const;

/** The end of a round: stars, XP, the numbers, one tip, the timing picture and the way forward. */
export function Summary({ round, bpm, slowerBpm, fasterBpm, onAgain, onAction, next, children }: SummaryProps) {
  const { result, outcome, tip } = round;
  if (!result) return null;
  const { stats } = result;
  const stars = result.completed ? stats.stars : 0;
  const percent = Math.round(stats.accuracy * 100);
  const headline = result.completed ? HEADLINES[stars] : 'Stopped early';
  const close = stats.good + stats.ok;
  const passed = stars >= 1;

  let actionLabel: string | null = null;
  let actionIcon = 'RotateCcw';
  if (tip?.action === 'slower' && slowerBpm !== null) {
    actionLabel = `Try it at ${slowerBpm} BPM`;
    actionIcon = 'Turtle';
  } else if (tip?.action === 'faster' && fasterBpm !== null) {
    actionLabel = `Try it at ${fasterBpm} BPM`;
    actionIcon = 'Rabbit';
  } else if (tip?.action === 'calibrate') {
    actionLabel = 'Calibrate (10 seconds)';
    actionIcon = 'Gauge';
  } else if (tip?.action === 'headphones') {
    actionLabel = 'Recalibrate the microphone';
    actionIcon = 'Mic';
  } else if (tip?.action === 'counts') {
    actionLabel = 'Show the counts and retry';
    actionIcon = 'Eye';
  }

  return (
    <div className={styles.summary} data-rhythm-summary data-stars={stars} data-accuracy={percent}>
      <Celebration fire={stars >= 3 ? result : null} intensity="low" />
      <div className={styles.summaryHead} role="status">
        <StarRating value={stars} size={40} animate label={`${stars} of 3 stars`} />
        <Heading level={2} size="2xl" display>
          {headline}
        </Heading>
        <div className={styles.summaryLine}>
          <Text tone="muted">
            {stats.hits} of {stats.total} notes · {percent}% · {bpm} BPM
          </Text>
          {outcome && outcome.xp > 0 && (
            <Badge tone="xp" icon="Zap">
              +{outcome.xp} XP
            </Badge>
          )}
          {outcome?.skill?.newBest && passed && <Badge tone="ok">New best</Badge>}
        </div>
      </div>

      <div className={styles.summaryGrid}>
        {tip && (
          <section className={styles.tipCard} aria-label="Your tip">
            <div className={styles.tipKicker}>
              <Icon name="Lightbulb" size={16} />
              <span>Your tip</span>
            </div>
            <Heading level={3} size="lg">
              {tip.title}
            </Heading>
            <Text tone="muted">{tip.detail}</Text>
            {actionLabel && tip.action && (
              <div>
                <Button size="sm" iconLeft={actionIcon} onClick={() => onAction(tip.action!)}>
                  {actionLabel}
                </Button>
              </div>
            )}
          </section>
        )}
        <section className={styles.spreadCard} aria-label="Your timing">
          <div className={styles.tipKicker}>
            <Icon name="Activity" size={16} />
            <span>Your timing</span>
          </div>
          <SpreadPlot errors={stats.errors} />
          <dl className={styles.tally}>
            <div>
              <dt>On it</dt>
              <dd className={styles.toneHit}>{stats.perfect}</dd>
            </div>
            <div>
              <dt>Close</dt>
              <dd className={styles.toneNear}>{close}</dd>
            </div>
            <div>
              <dt>Missed</dt>
              <dd className={stats.miss ? styles.toneMiss : undefined}>{stats.miss}</dd>
            </div>
            <div>
              <dt>Extra</dt>
              <dd className={stats.extra ? styles.toneMiss : undefined}>{stats.extra}</dd>
            </div>
          </dl>
        </section>
      </div>

      {children}

      <ActionBar start={<LinkButton to="rhythm" variant="ghost" iconLeft="ChevronLeft">All rhythm</LinkButton>}>
        {passed && next ? (
          <>
            <Button iconLeft="RotateCcw" onClick={onAgain}>
              Again
            </Button>
            <LinkButton to="rhythm" params={next.params} variant="primary" iconRight="ArrowRight" wrap data-autofocus>
              Next: {next.title}
            </LinkButton>
          </>
        ) : (
          <>
            {next && (
              <LinkButton to="rhythm" params={next.params} iconRight="ArrowRight" wrap>
                Skip to {next.title}
              </LinkButton>
            )}
            <Button variant="primary" iconLeft="RotateCcw" onClick={onAgain} data-autofocus>
              {passed ? 'Play it again' : 'Try again'}
            </Button>
          </>
        )}
      </ActionBar>
    </div>
  );
}
