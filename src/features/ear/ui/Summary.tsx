import { ActionBar, Badge, Button, Celebration, Heading, Icon, LinkButton, StarRating, Text } from '@/ui';
import type { Round } from '../core/round';
import type { DrillDef, LevelDef } from '../core/types';
import type { PathStep } from '../core/drills';
import { DRILLS } from '../core/drills';
import type { RoundOutcome } from './useEarRound';
import styles from './Ear.module.css';

const HEADLINES = ['Keep listening', 'Getting there', 'Good ears', 'Sharp ears'] as const;

/** Props of {@link Summary}. */
export interface SummaryProps {
  drill: DrillDef;
  level: LevelDef;
  round: Round;
  outcome: RoundOutcome;
  /** Where to go after a pass. */
  next: PathStep | null;
  onAgain: () => void;
}

/** The end of a round: stars, score, XP, what was missed, the weak spots, and one obvious next step. */
export function Summary({ drill, round, outcome, next, onAgain }: SummaryProps) {
  const { score } = outcome;
  const percent = Math.round(score.accuracy * 100);
  const passed = score.passed;
  const nextDrill = next ? DRILLS[next.drill] : null;
  const nextLevel = nextDrill?.levels.find((l) => l.n === next?.level) ?? null;
  const nextLabel = next && nextDrill && nextLevel ? (next.drill === drill.id ? `Level ${next.level}: ${nextLevel.title}` : `${nextDrill.title}: ${nextLevel.title}`) : null;
  const misses = round.answers.filter((a) => !a.correct);
  const info = (id: string) => drill.info(id);

  return (
    <div className={styles.summary} data-ear-summary data-stars={score.stars} data-accuracy={percent}>
      <Celebration fire={score.stars >= 3 ? outcome : null} intensity="low" />
      <div className={styles.summaryHead} role="status">
        <StarRating value={score.stars} size={40} animate label={`${score.stars} of 3 stars`} />
        <Heading level={2} size="2xl" display>
          {HEADLINES[score.stars]}
        </Heading>
        <div className={styles.summaryLine}>
          <Text tone="muted" tabular>
            {score.correct} of {score.total} right · {percent}% · {outcome.durationSec} s
          </Text>
          {outcome.activity && outcome.activity.xp > 0 && (
            <Badge tone="xp" icon="Zap">
              +{outcome.activity.xp} XP
            </Badge>
          )}
          {outcome.activity?.skill?.newBest && score.correct > 0 && <Badge tone="ok">New best</Badge>}
        </div>
        {outcome.unlocked !== null && (
          <Badge tone="accent" variant="solid" icon="LockOpen" size="md">
            Level {outcome.unlocked} is open
          </Badge>
        )}
        {!passed && (
          <Text tone="muted" align="center">
            {round.level.special
              ? `Get ${Math.ceil(score.total * 0.8)} of ${score.total} right and you know it by ear. What you missed comes back, between ones you know.`
              : score.correct >= Math.ceil(score.total * 0.8) - 1
                ? 'One more right and the next level opens.'
                : `Get ${Math.ceil(score.total * 0.8)} of ${score.total} right to open the next level. What you missed comes back, between ones you know.`}
          </Text>
        )}
      </div>

      <div className={styles.summaryGrid}>
        <section className={styles.panel} aria-label="Your answers">
          <div className={styles.kicker}>
            <Icon name="ListChecks" size={16} />
            <span>Your answers</span>
          </div>
          <div className={styles.dots}>
            {round.answers.map((a, i) => (
              <span key={i} className={`${styles.dot} ${a.correct ? styles.dotRight : styles.dotWrong}`} aria-label={`Question ${i + 1}: ${a.correct ? 'right' : 'wrong'}`}>
                {a.correct ? <Icon name="Check" size={14} strokeWidth={3} /> : <Icon name="X" size={14} strokeWidth={3} />}
              </span>
            ))}
          </div>
          {misses.length > 0 ? (
            <ul className={styles.missList}>
              {misses.slice(0, 5).map((a, i) => {
                const q = a.question;
                if (q.kind !== 'choice') {
                  return (
                    <li key={i} className={styles.missItem}>
                      <span>Melody {q.index + 1}</span>
                      <span className={styles.muted}>{q.target.map((id) => q.keys.find((k) => k.id === id)?.label).join(' ')}</span>
                    </li>
                  );
                }
                return (
                  <li key={i} className={styles.missItem}>
                    <span>
                      It was <strong>{info(q.answer).label}</strong>
                    </span>
                    <span className={styles.muted}>you chose {info(String(a.chosen)).label}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Text tone="muted">Every answer right.</Text>
          )}
        </section>

        <section className={styles.panel} aria-label="Weak spots">
          <div className={styles.kicker}>
            <Icon name="Lightbulb" size={16} />
            <span>{outcome.weak.length ? 'Listen out for' : 'Your ears'}</span>
          </div>
          {outcome.weak.length ? (
            <ul className={styles.weak}>
              {outcome.weak.map((w) => (
                <li key={`${w.answer}>${w.chosen}`} className={styles.weakItem}>
                  <Icon name="Ear" size={18} className={styles.weakIcon} />
                  <Text>{w.sentence}</Text>
                </li>
              ))}
            </ul>
          ) : misses.length ? (
            <Text tone="muted">Nothing you mix up again and again yet. The next rounds bring back what you missed, so you hear it once more.</Text>
          ) : (
            <Text tone="muted">No confusions in this round. The next rounds will keep mixing in what you find hardest.</Text>
          )}
        </section>
      </div>

      {/* The way back to the drill is the page's own back link: on a phone this bar keeps to one row. */}
      <ActionBar>
        {passed && next && nextLabel ? (
          <>
            <Button iconLeft="RotateCcw" onClick={onAgain}>
              Again
            </Button>
            <LinkButton to="ear" params={[next.drill, String(next.level)]} variant="primary" iconRight="ArrowRight" wrap aria-keyshortcuts="Enter" data-ear-next-step>
              Next: {nextLabel}
            </LinkButton>
          </>
        ) : (
          <Button variant="primary" iconLeft="RotateCcw" onClick={onAgain} aria-keyshortcuts="Enter" data-ear-again>
            {passed ? 'Play it again' : 'Try again'}
          </Button>
        )}
      </ActionBar>
    </div>
  );
}
