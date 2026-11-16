import { useEffect } from 'react';
import { ActionBar, AnimatedNumber, Badge, Button, Callout, Celebration, Heading, Icon, LinkButton, StarRating, Text, cx, useEventListener } from '@/ui';
import { navigate } from '@/app/router';
import type { Focus } from '../core/focus';
import type { GameDef, LevelInfo } from '../core/games';
import { crownLabel, levelParams, gameParams } from '../core/skill';
import { HEADLINES } from './kit';
import type { RoundOutcome } from './RoundScreen';
import styles from './Arcade.module.css';

/** Props of {@link Summary}. */
export interface SummaryProps {
  game: GameDef;
  focus: Focus;
  level: number;
  levels: LevelInfo[];
  outcome: RoundOutcome;
  onAgain: () => void;
}

/** The end of a round: stars, score against the best, what moved, one tip, and one obvious next step. */
export function Summary({ game, focus, level, levels, outcome, onAgain }: SummaryProps) {
  const { result, activity, change } = outcome;
  const nextInfo = levels.find((l) => l.n === level + 1) ?? null;
  const passed = result.stars >= 1;
  const goNext = passed && nextInfo;
  const crownUp = activity?.skill && activity.skill.mastery > activity.skill.masteryBefore ? activity.skill.mastery : null;

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  useEventListener(typeof window === 'undefined' ? null : window, 'keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Enter' || e.metaKey || e.ctrlKey || e.altKey) return;
    if ((e.target as HTMLElement | null)?.closest?.('a, button, input, select, [role="dialog"]')) return;
    e.preventDefault();
    if (goNext) navigate('arcade', ...levelParams(game.id, focus, level + 1));
    else onAgain();
  });

  return (
    <div className={styles.summary} data-arcade-summary data-stars={result.stars} data-accuracy={Math.round(result.accuracy * 100)} data-score={result.score} data-verdicts={result.detail}>
      <Celebration fire={result.stars >= 3 ? outcome : null} intensity="medium" />
      <div className={styles.summaryHead} role="status">
        <StarRating value={result.stars} size={44} animate label={`${result.stars} of 3 stars`} />
        <Heading level={2} size="3xl" display>
          {HEADLINES[result.stars]}
        </Heading>
        <div className={styles.summaryScore}>
          <span className={styles.summaryScoreValue}>
            <AnimatedNumber value={result.score} from={0} duration={900} />
          </span>
          <span className={styles.summaryScoreLabel}>points · {Math.round(result.accuracy * 100)}% · {result.durationSec} s</span>
        </div>
        <div className={styles.badgeRow}>
          {activity && activity.xp > 0 && (
            <Badge tone="xp" icon="Zap" size="md">
              +{activity.xp} XP
            </Badge>
          )}
          {change.gameBest && result.score > 0 && (
            <Badge tone="streak" icon="Trophy" size="md">
              New best in {game.title}
            </Badge>
          )}
          {!change.gameBest && change.levelBest && result.score > 0 && (
            <Badge tone="ok" icon="TrendingUp" size="md">
              Best on this level
            </Badge>
          )}
          {change.unlocked !== null && (
            <Badge tone="accent" variant="solid" icon="LockOpen" size="md">
              Level {change.unlocked} is open
            </Badge>
          )}
          {crownUp !== null && (
            <Badge tone="accent" icon="Crown" size="md">
              {crownLabel(game.id, crownUp)}
            </Badge>
          )}
          {result.bestCombo >= 5 && (
            <Badge tone="streak" icon="Flame" size="md">
              Combo {result.bestCombo}
            </Badge>
          )}
        </div>
        {!passed && (
          <Text tone="muted" align="center">
            A star (and the next level) needs 60% right. This round: {Math.round(result.accuracy * 100)}%. The tip below is the quickest way there.
          </Text>
        )}
      </div>

      <div className={styles.summaryGrid}>
        <section className={styles.panel} aria-label="Your round">
          <div className={styles.kicker}>
            <Icon name="ListChecks" size={16} />
            <span>Your round</span>
          </div>
          <dl className={styles.statGrid}>
            {result.stats.map((s) => (
              <div key={s.label} className={styles.statCell}>
                <dt>{s.label}</dt>
                <dd>{s.value}</dd>
              </div>
            ))}
          </dl>
          {result.marks.length > 0 && (
            <div className={styles.dots} aria-label={`${result.marks.filter((m) => m === 'ok').length} clean of ${result.marks.length}`}>
              {result.marks.slice(0, 48).map((m, i) => (
                <span key={i} className={cx(styles.dot, m === 'ok' ? styles.dotOk : m === 'meh' ? styles.dotMeh : styles.dotBad)} aria-hidden="true">
                  <Icon name={m === 'ok' ? 'Check' : m === 'meh' ? 'Minus' : 'X'} size={12} strokeWidth={3} />
                </span>
              ))}
            </div>
          )}
        </section>
        <section className={styles.panel} aria-label="Tip">
          <Callout tone="tip" label="Next time" icon="Lightbulb">
            {result.tip}
          </Callout>
        </section>
      </div>

      <ActionBar start={<LinkButton to="arcade" params={gameParams(game.id, focus)} variant="ghost" iconLeft="ChevronLeft">All levels</LinkButton>}>
        {goNext ? (
          <>
            <Button iconLeft="RotateCcw" onClick={onAgain} wrap data-arcade-again>
              Again
            </Button>
            <LinkButton to="arcade" params={levelParams(game.id, focus, level + 1)} variant="primary" iconRight="ArrowRight" wrap aria-keyshortcuts="Enter" data-arcade-next-level>
              Next: {nextInfo!.title}
            </LinkButton>
          </>
        ) : (
          <Button variant="primary" iconLeft="RotateCcw" onClick={onAgain} aria-keyshortcuts="Enter" data-arcade-again>
            {passed ? 'Play it again' : 'Try again'}
          </Button>
        )}
      </ActionBar>
    </div>
  );
}
