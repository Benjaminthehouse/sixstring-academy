import { useRef } from 'react';
import type { ActivityResult } from '@/core/progress';
import { Button, Icon, LinkButton, Modal, Text, XpChip, cx } from '@/ui';
import { noteParts, type NoteNaming, type StringTarget } from '../model/targets';
import styles from './Summary.module.css';

/** What a finished run through the strings looked like. */
export interface SummaryInfo {
  /** `guide`: with the microphone. `ear`: the learner judged each string. */
  kind: 'guide' | 'ear';
  confirmed: boolean[];
  skipped: boolean[];
  /** Seconds the run took (0 when not timed). */
  seconds: number;
  /** What the progress store made of it, when it was recorded. */
  result: ActivityResult | null;
}

/** Props for `<Summary>`. */
export interface SummaryProps {
  /** Null keeps the dialog closed. */
  info: SummaryInfo | null;
  targets: readonly StringTarget[];
  naming: NoteNaming;
  tuningName: string;
  onClose: () => void;
  /** Go through the strings again. */
  onAgain: () => void;
}

function duration(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes} min${rest ? ` ${rest} s` : ''}`;
}

/** The end of "tune all strings": what is in tune, what was left, and somewhere to go next. */
export function Summary({ info, targets, naming, tuningName, onClose, onAgain }: SummaryProps) {
  // Keep the last summary while the dialog animates out.
  const last = useRef<SummaryInfo | null>(info);
  if (info) last.current = info;
  const shown = info ?? last.current;
  if (!shown) return null;

  const total = targets.length;
  const done = targets.filter((t) => shown.confirmed[t.index]).length;
  const all = done === total;
  const title = all ? (shown.kind === 'ear' ? `All ${total} strings matched by ear` : `All ${total} strings are in tune`) : `${done} of ${total} strings are in tune`;

  return (
    <Modal
      open={info !== null}
      onClose={onClose}
      title={title}
      description={`${tuningName} tuning${shown.seconds > 0 ? `, in ${duration(shown.seconds)}` : ''}.`}
      size="sm"
      footer={
        <>
          <Button onClick={onAgain}>Check again</Button>
          <Button variant="primary" onClick={onClose} data-autofocus>
            Done
          </Button>
        </>
      }
    >
      <div className={styles.summary} data-tuner-summary={all ? 'all' : 'partial'}>
        <ul className={styles.strings} role="list">
          {targets.map((t) => {
            const ok = !!shown.confirmed[t.index];
            const parts = noteParts(t.note, naming);
            return (
              <li key={t.index} className={cx(styles.string, ok && styles.stringOk)}>
                <span className={styles.stringNote} aria-hidden="true">
                  {parts.short}
                </span>
                <span className={styles.stringMark}>
                  <Icon name={ok ? 'Check' : 'Minus'} size="xs" strokeWidth={3} />
                </span>
                <span className="sr-only">
                  String {t.string}, {parts.text}: {ok ? 'in tune' : 'not tuned'}
                </span>
              </li>
            );
          })}
        </ul>
        {!all && <Text tone="muted">The strings marked with a dash were skipped. Tap one on the tuner to come back to it.</Text>}
        {shown.result && (
          <p className={styles.reward}>
            {shown.result.xp > 0 ? (
              <>
                <XpChip value={shown.result.xp} gain />
                <span>for tuning up today.</span>
              </>
            ) : (
              <span>Today's tuner XP is already yours. Tuning again still counts for your quests.</span>
            )}
          </p>
        )}
        <div className={styles.next}>
          <Text variant="label">What next?</Text>
          <div className={styles.links}>
            <LinkButton to="songs" iconLeft="Music">
              Play a song
            </LinkButton>
            <LinkButton to="chords" iconLeft="Grid3x3">
              Practise chords
            </LinkButton>
            <LinkButton to="metronome" iconLeft="Timer">
              Metronome
            </LinkButton>
          </div>
        </div>
      </div>
    </Modal>
  );
}
