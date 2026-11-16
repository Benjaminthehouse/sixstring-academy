import { useMemo } from 'react';
import { ActionBar, Banner, Button, Celebration, useIsMobile, Heading, LinkButton, ProgressRing, Section, StarRating, Stat, Text, XpChip, cx } from '@/ui';
import { Fretboard, type FretMarker } from '@/ui/music';
import { fretWords } from '../core/explain';
import { pcAt, posKey } from '../core/neck';
import { spell } from '../core/notes';
import { stringName, type Stage } from '../core/path';
import type { Scope } from '../core/types';
import { boardFrets } from './QuestionBoard';
import type { RoundOutcome } from './useRound';
import type { Trainer } from './useTrainer';
import styles from './Trainer.module.css';

/** Props of {@link Summary}. */
export interface SummaryProps {
  outcome: RoundOutcome;
  trainer: Trainer;
  scope: Scope;
  /** The step this round belonged to, and the step after it. */
  stage?: Stage | null;
  nextStage?: Stage | null;
  nextTitle?: string;
  sprint?: boolean;
  /** The drill was "Play it" by tap: offer the microphone version. */
  offerPlay?: boolean;
  onAgain: () => void;
}

/** "1.8 s" */
function seconds(ms: number | null): string {
  return ms === null ? '–' : `${(ms / 1000).toFixed(1)} s`;
}

/** The end of a round: the score, what moved, the neck as the round left it, and the next step. */
export function Summary({ outcome, trainer, scope, stage, nextStage, nextTitle, sprint, offerPlay, onAgain }: SummaryProps) {
  const { summary: s, activity, learned } = outcome;
  const mobile = useIsMobile();
  const pct = Math.round(s.accuracy * 100);
  const { ctx, fmt } = trainer;
  const name = (p: { string: number; fret: number }) => spell(pcAt(ctx, p), ctx.spelling === 'flats' ? 'flats' : 'sharps');
  const newBest = sprint && outcome.bestBefore !== null && s.right > outcome.bestBefore;

  const markers = useMemo<FretMarker[]>(() => {
    const out = new Map<string, FretMarker>();
    for (const p of s.hits) out.set(posKey(p), { ...p, note: name(p), noteLabel: true, color: 'ok', shape: 'circle', description: 'right' });
    for (const p of s.missed) out.set(posKey(p), { ...p, note: name(p), noteLabel: true, color: 'bad', shape: 'square', state: 'miss', description: 'missed' });
    return [...out.values()];
  }, [s]); // eslint-disable-line react-hooks/exhaustive-deps

  let headline: string;
  let line: string;
  if (sprint) {
    headline = `${s.right} ${s.right === 1 ? 'note' : 'notes'} in a minute`;
    line = newBest ? `A new best: ${outcome.bestBefore} before.` : outcome.bestBefore !== null ? `Your best is ${outcome.bestBefore}.` : `${pct}% of your answers were right.`;
  } else if (stage) {
    headline = s.passed ? `Step ${stage.n} passed` : `${pct}% this time`;
    line = s.passed
      ? `${s.right} of ${s.asked} right${nextStage ? `. Next up: ${nextTitle ?? nextStage.title}.` : '. That was the last step of the method: the whole neck is yours.'}`
      : `A step passes at 80%. The places you missed come up more next round, so it gets easier each time.`;
  } else {
    headline = pct >= 80 ? 'Nicely done' : 'Round complete';
    line = `${s.right} of ${s.asked} right${s.avgMs ? `, ${seconds(s.avgMs)} per answer on average` : ''}.`;
  }

  const primary = stage && s.passed && nextStage ? (
    <LinkButton variant="primary" size="lg" to="fretboard" params={['stage', nextStage.id]} iconRight="ArrowRight" data-fb-next wrap>
      Next: {nextTitle ?? nextStage.title}
    </LinkButton>
  ) : stage && s.passed ? (
    <LinkButton variant="primary" size="lg" to="fretboard" iconRight="ArrowRight" data-fb-next>
      Back to the fretboard
    </LinkButton>
  ) : (
    <Button variant="primary" size="lg" iconLeft="RotateCcw" onClick={onAgain} data-fb-again aria-keyshortcuts="Enter">
      {stage ? 'Try this step again' : sprint ? 'Go again' : 'One more round'}
    </Button>
  );

  return (
    <>
    <div className={styles.summary} data-fb-summary data-passed={s.passed || undefined}>
      <Celebration fire={s.passed || newBest ? `${outcome.durationSec}:${s.right}` : null} intensity={stage && s.passed ? 'medium' : 'low'} />
      <div className={styles.summaryTop}>
        <ProgressRing value={pct} max={100} size={mobile ? 84 : 112} thickness={mobile ? 8 : 10} tone={s.passed ? 'ok' : pct >= 60 ? 'accent' : 'neutral'} label="Accuracy">
          <span className={styles.ringValue}>{pct}%</span>
        </ProgressRing>
        <div className={styles.summaryText}>
          <Heading level={2} size={mobile ? 'xl' : '2xl'} display>
            {headline}
          </Heading>
          <Text tone="muted">{line}</Text>
          <div className={styles.summaryChips}>
            <StarRating value={s.stars} label={`${s.stars} of 3 stars`} animate />
            {activity && activity.xp > 0 && <XpChip value={activity.xp} gain size="lg" />}
          </div>
        </div>
      </div>

      {learned.length > 0 && (
        <Banner tone="ok" icon="Trophy" title={learned.length === 1 ? `You know every note on ${stringName(ctx, learned[0], fmt)}` : `You know every note on strings ${learned.join(', ')}`} live>
          All twelve notes, right and without counting frets. That string is yours.
        </Banner>
      )}

      <div className={styles.summaryStats}>
        <Stat label="Right" value={`${s.right}/${s.asked}`} hint={`${pct}%`} />
        <Stat label="Average answer" value={seconds(s.avgMs)} hint={s.fastestMs ? `Fastest ${seconds(s.fastestMs)}` : undefined} />
        <Stat label="Best run" value={String(s.bestRun)} hint="in a row" />
      </div>

      <div className={styles.summaryLinks}>
        {stage && s.passed && (
          <Button size="sm" onClick={onAgain} iconLeft="RotateCcw">
            Practise this step again
          </Button>
        )}
        {offerPlay && (
          <LinkButton to="fretboard" params={['drill', 'play-the-note']} iconLeft="Mic" size="sm">
            Play it on your guitar
          </LinkButton>
        )}
        <LinkButton variant="ghost" size="sm" to="fretboard" iconLeft="Rows4">
          All of the fretboard
        </LinkButton>
      </div>

      <Section title="This round on the neck" description={s.missed.length ? 'Green: right. Red squares: missed. They come back in your next rounds.' : 'Every place you were asked, all of them right.'} level={3}>
        <div className={cx(styles.mapBoard)}>
          <Fretboard tuning={trainer.tuning} frets={boardFrets(scope)} markers={markers} size="md" aria-label="This round on the neck" />
        </div>
        {s.missed.length > 0 && (
          <ul className={styles.tricky}>
            {s.missed.slice(0, 4).map((p) => (
              <li key={posKey(p)}>
                <Text>
                  <strong>{fmt(name(p))}</strong> on {stringName(ctx, p.string, fmt)}, {fretWords(p.fret)}
                </Text>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
    <ActionBar>{primary}</ActionBar>
    </>
  );
}
