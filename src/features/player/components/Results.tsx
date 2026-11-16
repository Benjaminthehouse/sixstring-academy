/**
 * The short summary after a run: how it went in one line, accuracy and stars, what was counted,
 * the bars that went wrong (also marked on the score), personal best, XP, and one suggestion as
 * the main button ("Loop bars 9 to 12 at 70 %"), with "Play again" beside it.
 */
import { Button, Celebration, Icon, LinkButton, ProgressRing, Sheet, StarRating, Text, XpChip, cx } from '@/ui';
import type { ResultsView } from '../engine/engine';
import { loopLabel } from '../model/loop';
import type { BarHeatCell, Suggestion } from '../model/results';
import { MODE_NAMES } from '../model/types';
import styles from './Results.module.css';

/** Props of the results sheet. */
export interface ResultsProps {
  results: ResultsView | null;
  barCount: number;
  onClose: () => void;
  onAgain: () => void;
  onSuggestion: (s: Suggestion) => void;
}

const LEVEL_WORDS = ['Clean', 'A slip', 'Some trouble', 'Mostly wrong'];

/** The results sheet. */
export function Results({ results, barCount, onClose, onAgain, onSuggestion }: ResultsProps) {
  const s = results?.summary;
  const open = !!results;
  const pct = s && s.accuracy !== null ? Math.round(s.accuracy * 100) : null;
  const scored = !!s && s.mode !== 'listen';
  const weak = s?.weak ?? [];
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={s?.headline ?? 'Results'}
      description={s ? describe(s.mode, s.fullSong, s.tempo, s.durationSec) : undefined}
      footer={
        s ? (
          <div className={styles.footer}>
            <Button onClick={onAgain} iconLeft="RotateCcw" data-player-again="">
              Play again
            </Button>
            {s.suggestion ? (
              <Button variant="primary" iconLeft={s.suggestion.loop ? 'Repeat' : s.suggestion.mode === 'wait' ? 'Hourglass' : 'ArrowRight'} onClick={() => onSuggestion(s.suggestion!)} data-autofocus="" data-player-suggestion="" wrap>
                {s.suggestion.text}
              </Button>
            ) : (
              <LinkButton to="songs" variant="primary" iconRight="ArrowRight">
                Choose the next song
              </LinkButton>
            )}
          </div>
        ) : undefined
      }
    >
      {s && results && (
        <div className={styles.body} data-player-results="">
          {scored && pct !== null && (
            <div className={styles.top}>
              <ProgressRing value={pct} max={100} size={96} tone={pct >= 80 ? 'ok' : pct >= 60 ? 'accent' : 'warn'} label={`Accuracy ${pct} %`}>
                <span className={styles.pct}>
                  {pct}
                  <span className={styles.pctUnit}>%</span>
                </span>
              </ProgressRing>
              <div className={styles.topSide}>
                {s.fullSong ? <StarRating value={s.stars} max={3} size={28} animate label={`${s.stars} of 3 stars`} /> : <Text variant="caption" tone="muted">Stars are for whole-song runs.</Text>}
                {results.best && (
                  <p className={cx(styles.best, results.newBest && styles.bestNew)}>
                    <Icon name={results.newBest ? 'Trophy' : 'TrendingUp'} size="sm" />
                    {results.best}
                  </p>
                )}
                {results.activity && results.activity.xp > 0 && <XpChip value={results.activity.xp} gain size="sm" />}
              </div>
            </div>
          )}
          {!scored && results.activity && results.activity.xp > 0 && <XpChip value={results.activity.xp} gain size="sm" />}

          {s.counts && (
            <dl className={styles.counts}>
              <Count label="Perfect" value={s.counts.perfect} tone="ok" />
              <Count label="Good" value={s.counts.good} tone="ok" />
              <Count label="Early" value={s.counts.early} tone="warn" />
              <Count label="Late" value={s.counts.late} tone="warn" />
              <Count label="Missed" value={s.counts.missed} tone="bad" />
              {s.counts.wrong > 0 && <Count label="Wrong notes" value={s.counts.wrong} tone="bad" />}
              {s.maxCombo > 1 && <Count label="Best run" value={s.maxCombo} tone="streak" />}
            </dl>
          )}
          {s.mode === 'wait' && (
            <dl className={styles.counts}>
              <Count label="First try" value={s.firstTry} tone="ok" />
              <Count label="Notes played" value={s.played} tone="neutral" />
              <Count label="Hints" value={s.hints} tone="warn" />
              <Count label="Skipped" value={s.skipped} tone="bad" />
            </dl>
          )}

          {scored && s.heat.length > 0 && (
            <section className={styles.heatSection} aria-label="Bars that went wrong">
              <div className={styles.heatHead}>
                <Text variant="label">Bar by bar</Text>
                <span className={styles.legend} aria-hidden="true">
                  <i data-level="0" /> clean <i data-level="2" /> trouble
                </span>
              </div>
              <HeatRow heat={s.heat} barCount={barCount} />
              {weak.length > 0 ? (
                <ul className={styles.weak}>
                  {weak.map((w) => (
                    <li key={`${w.from}-${w.to}`}>
                      <Icon name="Target" size="sm" />
                      {loopLabel(w)}: {mistakesIn(s.heat, w.from, w.to)} to tidy up
                    </li>
                  ))}
                </ul>
              ) : (
                <Text variant="caption" tone="muted">
                  Every bar was clean.
                </Text>
              )}
            </section>
          )}
          {s.mode === 'listen' && <Text tone="muted">{`Next, let the song wait for you: ${MODE_NAMES.wait} mode listens through the microphone and moves on when you play each note.`}</Text>}
          <Celebration fire={s.stars >= 2 || results.newBest ? results.serial : 0} intensity={s.stars === 3 ? 'high' : 'medium'} contained />
        </div>
      )}
    </Sheet>
  );
}

function describe(mode: string, full: boolean, tempo: number, sec: number): string {
  const m = Math.floor(sec / 60);
  const ss = Math.round(sec % 60);
  const time = m ? `${m} min ${ss} s` : `${ss} s`;
  const what = mode === 'listen' ? 'Listened' : mode === 'wait' ? 'Wait mode' : mode === 'tap' ? 'Tap along' : 'Flow';
  return `${what} · ${full ? 'whole song' : 'part of the song'} · ${tempo} % speed · ${time}`;
}

function mistakesIn(heat: readonly BarHeatCell[], from: number, to: number): string {
  const n = heat.filter((h) => h.bar >= from && h.bar <= to).reduce((s, h) => s + h.mistakes, 0);
  return `${n} ${n === 1 ? 'note' : 'notes'}`;
}

function Count({ label, value, tone }: { label: string; value: number; tone: 'ok' | 'warn' | 'bad' | 'streak' | 'neutral' }) {
  return (
    <div className={styles.count} data-tone={tone} data-zero={value === 0 || undefined}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** One small cell per bar, coloured and labelled by how it went. */
function HeatRow({ heat, barCount }: { heat: readonly BarHeatCell[]; barCount: number }) {
  const byBar = new Map(heat.map((h) => [h.bar, h]));
  const first = heat[0]?.bar ?? 0;
  const last = heat[heat.length - 1]?.bar ?? Math.max(0, barCount - 1);
  const cells = [];
  for (let b = first; b <= last; b++) {
    const h = byBar.get(b);
    cells.push(
      <li key={b} className={styles.cell} data-level={h ? h.level : 'none'} aria-label={h ? `Bar ${b + 1}: ${LEVEL_WORDS[h.level]}` : `Bar ${b + 1}: nothing to play`}>
        <span aria-hidden="true">{b + 1}</span>
      </li>,
    );
  }
  return <ol className={styles.heatRow}>{cells}</ol>;
}
