/**
 * The player's panels: the feedback that slides up after an answer, the end-of-session summary,
 * and the "leave the lesson?" dialog.
 */
import { useEffect, useState } from 'react';
import { Button, Celebration, Heading, Icon, Modal, Stat, Text, cx, usePrefersReducedMotion } from '@/ui';
import type { SessionReport } from '../../effects';
import type { Exercise } from '../../types';
import type { SessionFeedback } from '../../session';
import { RichText } from '../RichText';
import { feedbackCopy } from '../logic/feedback';
import { summaryHeadline, summaryStats, teacherLine, type SummaryStat } from '../logic/summary';
import { TeacherBadge } from './StepViews';
import styles from './Player.module.css';

// ── Feedback ───────────────────────────────────────────────────────────────────────────────────

/** Props of {@link FeedbackPanel}. */
export interface FeedbackPanelProps {
  exercise: Exercise;
  feedback: SessionFeedback;
  /** Varies the "right" word. */
  seed: number;
  /** Right answers in a row, to celebrate a run. */
  combo: number;
}

/** What the learner sees after Check: green with the reason, or kind and specific with the right answer. */
export function FeedbackPanel({ exercise, feedback, seed, combo }: FeedbackPanelProps) {
  const copy = feedbackCopy(exercise, feedback, seed);
  const icon = copy.tone === 'ok' ? 'CircleCheck' : copy.tone === 'bad' ? 'CircleX' : 'Info';
  return (
    <div className={cx(styles.feedback, styles[`feedback-${copy.tone}`])} role="status" aria-live="polite" data-feedback={copy.tone}>
      <div className={styles.feedbackHead}>
        <Icon name={icon} size="lg" className={styles.feedbackIcon} />
        <p className={styles.feedbackTitle}>
          <strong>{copy.title}</strong>
          {copy.note && (
            <>
              {' '}
              <RichText text={copy.note} />
            </>
          )}
        </p>
        {copy.tone === 'ok' && combo >= 3 && (
          <span className={styles.comboBadge}>
            <Icon name="Flame" size="xs" /> {combo} in a row
          </span>
        )}
      </div>
      {copy.answer && (
        <p className={styles.feedbackAnswer}>
          <span className={styles.feedbackLabel}>Answer</span> <RichText text={copy.answer.replace(/\n/g, ' · ')} />
        </p>
      )}
      {copy.explain && (
        <p className={styles.feedbackExplain}>
          <RichText text={copy.explain} />
        </p>
      )}
      {(copy.heartLost || copy.willRetry) && (
        <p className={styles.feedbackNotes}>
          {copy.heartLost && (
            <span>
              <Icon name="HeartCrack" size="xs" /> One heart used
            </span>
          )}
          {copy.willRetry && (
            <span>
              <Icon name="RotateCcw" size="xs" /> You will see this one again shortly
            </span>
          )}
        </p>
      )}
    </div>
  );
}

// ── Summary ────────────────────────────────────────────────────────────────────────────────────

const STAT_ICONS: Record<SummaryStat['id'], string> = {
  accuracy: 'Target',
  time: 'Timer',
  xp: 'Zap',
  streak: 'Flame',
  crowns: 'Crown',
  cards: 'Layers',
  reviewed: 'Layers',
  combo: 'Sparkles',
};

/** Props of {@link SummaryView}. */
export interface SummaryViewProps {
  report: SessionReport;
  teacher: string;
}

/** The end of a session: what was achieved, in numbers, with a short celebration when it is earned. */
export function SummaryView({ report, teacher }: SummaryViewProps) {
  const headline = summaryHeadline(report);
  const stats = summaryStats(report);
  const line = teacherLine(teacher, report.outcome, report.perfect);
  const reduced = usePrefersReducedMotion();
  const [fire, setFire] = useState(false);
  useEffect(() => {
    if (!headline.celebrate) return;
    const t = window.setTimeout(() => setFire(true), 250);
    return () => window.clearTimeout(t);
  }, [headline.celebrate]);
  return (
    <section className={styles.summary} aria-labelledby="lesson-summary-title" data-summary={report.outcome}>
      {headline.celebrate && <Celebration fire={fire} intensity={report.perfect ? 'high' : 'medium'} />}
      <div className={cx(styles.summaryBadge, styles[`summary-${headline.tone}`], !reduced && styles.pop)} aria-hidden="true">
        <Icon name={headline.tone === 'ok' ? (report.mode === 'checkpoint' ? 'Trophy' : report.perfect ? 'Sparkles' : 'Check') : headline.tone === 'warn' ? (report.outcome === 'out-of-hearts' ? 'HeartCrack' : 'Flag') : 'Save'} size={40} />
      </div>
      <Heading level={2} size="3xl" display id="lesson-summary-title" className={styles.summaryTitle}>
        {headline.title}
      </Heading>
      <Text variant="lead" tone="muted" className={styles.summarySub}>
        {headline.subtitle}
      </Text>
      {line && (
        <div className={styles.teacherSays}>
          <TeacherBadge teacher={teacher as 'mia'} size="md" />
          <p className={styles.teacherQuote}>{line}</p>
        </div>
      )}
      {stats.length > 0 && (
        <div className={styles.stats}>
          {stats.map((s) => (
            <div key={s.id} className={cx(styles.stat, styles[`stat-${s.id}`])} data-stat={s.id}>
              <Stat label={s.label} value={s.value} hint={s.hint} icon={STAT_ICONS[s.id]} />
            </div>
          ))}
        </div>
      )}
      {report.goalMetNow && (
        <p className={styles.goalMet}>
          <Icon name="CircleCheck" size="sm" /> Daily goal reached.
        </p>
      )}
      {report.missed.length > 0 && report.outcome === 'completed' && (
        <div className={styles.missed}>
          <Heading level={3} size="md">
            Worth another look
          </Heading>
          <ul>
            {report.missed.slice(0, 4).map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ── Leave ──────────────────────────────────────────────────────────────────────────────────────

/** Props of {@link LeaveDialog}. */
export interface LeaveDialogProps {
  open: boolean;
  /** "lesson", "checkpoint", "review" ... */
  noun: string;
  done: number;
  total: number;
  onStay: () => void;
  onSave: () => void;
  onEnd: () => void;
}

/** Asked before leaving: save and come back later, end now (what was done still counts), or stay. */
export function LeaveDialog({ open, noun, done, total, onStay, onSave, onEnd }: LeaveDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onStay}
      title={`Leave this ${noun}?`}
      description={`You have done ${done} of ${total} steps. Your place is kept, so you can pick up right here later.`}
      size="sm"
      footer={
        <div className={styles.leaveActions}>
          <Button variant="ghost" onClick={onEnd} data-leave="end">
            End {noun} now
          </Button>
          <Button onClick={onStay} data-leave="stay">
            Keep going
          </Button>
          <Button variant="primary" iconLeft="Save" onClick={onSave} data-autofocus="" data-leave="save">
            Save and leave
          </Button>
        </div>
      }
    >
      <Text tone="muted" variant="caption">
        Ending now keeps the XP for what you finished; the rest of the {noun} starts fresh next time.
      </Text>
    </Modal>
  );
}
