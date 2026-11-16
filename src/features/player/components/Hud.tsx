/**
 * What appears over the score while practising: the count-in, the flow judgement with its combo,
 * the wait-mode prompt (what to play, where, a hint after a few tries, skip), and the microphone
 * level. The fast ones (count-in, judgements, level) are written straight to the DOM from the
 * engine's channel; the prompt changes only once per note and is ordinary React.
 */
import { useEffect, useRef } from 'react';
import { Button, Icon, cx } from '@/ui';
import type { PlayerEngine, WaitView } from '../engine/engine';
import styles from './Hud.module.css';

const GRADE_WORDS: Record<string, string> = { perfect: 'Perfect', good: 'Good', early: 'Early', late: 'Late', missed: 'Missed', wrong: 'Wrong note' };
const GRADE_TONE: Record<string, string> = { perfect: 'ok', good: 'ok', early: 'warn', late: 'warn', missed: 'bad', wrong: 'bad' };

/** The count-in: one big number per beat over the score. */
export function CountIn({ engine }: { engine: PlayerEngine }) {
  const el = useRef<HTMLDivElement>(null);
  const num = useRef<HTMLSpanElement>(null);
  const dots = useRef<HTMLSpanElement>(null);
  useEffect(
    () =>
      engine.onHud((e) => {
        const box = el.current;
        if (!box) return;
        if (e.type === 'countin') {
          box.dataset.show = '';
          if (num.current) num.current.textContent = String(e.beat + 1);
          if (dots.current) dots.current.textContent = '•'.repeat(e.beats - e.beat - 1);
          box.dataset.beat = String(e.beat % 2);
        } else if (e.type === 'go' || e.type === 'clear') {
          delete box.dataset.show;
        }
      }),
    [engine],
  );
  return (
    <div ref={el} className={styles.countIn} aria-hidden="true" data-player-countin="">
      <span ref={num} className={styles.countNum} />
      <span ref={dots} className={styles.countDots} />
    </div>
  );
}

/** Flow and tap-along: the latest judgement and the combo. */
export function Judgement({ engine }: { engine: PlayerEngine }) {
  const el = useRef<HTMLDivElement>(null);
  const word = useRef<HTMLSpanElement>(null);
  const combo = useRef<HTMLSpanElement>(null);
  useEffect(
    () =>
      engine.onHud((e) => {
        const box = el.current;
        if (!box) return;
        if (e.type === 'judge') {
          if (word.current) word.current.textContent = GRADE_WORDS[e.grade] ?? e.grade;
          if (combo.current) combo.current.textContent = e.combo >= 3 ? `${e.combo} in a row` : '';
          box.dataset.tone = GRADE_TONE[e.grade] ?? 'info';
          box.dataset.show = '';
          // Restart the pop animation on every judgement.
          box.classList.remove(styles.pop);
          void box.offsetWidth;
          box.classList.add(styles.pop);
        } else if (e.type === 'clear') {
          delete box.dataset.show;
        }
      }),
    [engine],
  );
  return (
    <div ref={el} className={styles.judge} role="status" aria-live="polite" data-player-judge="">
      <span ref={word} className={styles.judgeWord} />
      <span ref={combo} className={styles.judgeCombo} />
    </div>
  );
}

/** The microphone's input level, as a thin bar (written per event, no render). */
export function MicLevel({ engine, label, compact }: { engine: PlayerEngine; label: string; compact?: boolean }) {
  const bar = useRef<HTMLSpanElement>(null);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(
    () =>
      engine.onHud((e) => {
        if (e.type !== 'level') return;
        if (bar.current) bar.current.style.transform = `scaleX(${e.x.toFixed(3)})`;
        if (box.current) box.current.dataset.clip = e.clipping ? 'yes' : 'no';
      }),
    [engine],
  );
  return (
    <span ref={box} className={cx(styles.level, compact && styles.levelCompact)} role="status" aria-label={label}>
      <Icon name="Mic" size="xs" />
      {!compact && <span className={styles.levelText}>{label}</span>}
      <span className={styles.levelTrack} aria-hidden="true">
        <span ref={bar} className={styles.levelBar} />
      </span>
    </span>
  );
}

/**
 * Wait mode: what to play now, what went wrong, a hint and a way past it. With the chord chart
 * hidden (playing from memory) a chord is not named until the learner asks ("Show me").
 */
export function WaitPrompt({ wait, onHint, onSkip, compact, hideChart }: { wait: WaitView; onHint: () => void; onSkip: () => void; compact?: boolean; hideChart?: boolean }) {
  const t = wait.target;
  const what = t.symbol ? 'Strum' : t.chord ? 'Play together' : 'Play';
  const secret = !!t.symbol && !!hideChart && !wait.hint;
  return (
    <div className={cx(styles.wait, compact && styles.waitCompact)} data-player-wait="" data-index={wait.index}>
      <div className={styles.waitMain}>
        <p className={styles.waitStep}>
          Note {wait.index + 1} of {wait.total}
        </p>
        <p className={styles.waitWhat} aria-live="polite">
          {what} <strong className={styles.waitName}>{secret ? 'the next chord' : t.symbol ? wait.name : wait.hint ? wait.where : wait.name}</strong>
        </p>
        {wait.feedback && (
          <p className={styles.waitFeedback} data-tone={wait.feedback.tone} role="status">
            <Icon name={wait.feedback.tone === 'ok' ? 'Check' : wait.feedback.tone === 'bad' ? 'X' : 'Info'} size="sm" />
            {wait.feedback.text}
          </p>
        )}
      </div>
      <div className={styles.waitActions}>
        {!wait.hint && (
          <Button size="sm" variant="ghost" iconLeft="Lightbulb" onClick={onHint}>
            Show me
          </Button>
        )}
        <Button size="sm" variant="ghost" iconLeft="SkipForward" onClick={onSkip}>
          Skip
        </Button>
      </div>
    </div>
  );
}
