/**
 * The end-of-session screen in words: the headline for each outcome, the numbers worth showing
 * (accuracy, time, XP, streak, crowns, cards added) and the one obvious next step.
 */
import type { SessionReport } from '../../effects';
import type { SessionMode, SessionSummary } from '../../session';

/** The headline and the line under it. */
export interface SummaryHeadline {
  title: string;
  subtitle: string;
  tone: 'ok' | 'warn' | 'info';
  /** True when the moment deserves confetti and the completion sound. */
  celebrate: boolean;
}

/** "2:41" for a duration in seconds (hours are not expected in a lesson). */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** "86%" for a share 0 to 1. */
export function formatPercent(share: number): string {
  return `${Math.round(Math.max(0, Math.min(1, share)) * 100)}%`;
}

function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function noun(mode: SessionMode): string {
  return mode === 'checkpoint' ? 'checkpoint' : mode === 'practice' ? 'practice' : mode === 'review' ? 'review' : 'lesson';
}

/** What the summary leads with, per outcome and mode. */
export function summaryHeadline(summary: Pick<SessionSummary, 'mode' | 'outcome' | 'perfect' | 'exercises' | 'mistakes' | 'heartsLeft'>): SummaryHeadline {
  const { mode, outcome } = summary;
  if (outcome === 'out-of-hearts') {
    return { title: 'Out of hearts for now', subtitle: 'A short practice round brings them all back, and what you did here still counts.', tone: 'warn', celebrate: false };
  }
  if (outcome === 'failed') {
    return { title: 'Not this time', subtitle: 'The checkpoint allows only a few mistakes. The lessons of this unit will get you there.', tone: 'warn', celebrate: false };
  }
  if (outcome === 'quit') {
    // Ending now clears the saved place (only "Save and leave" keeps it), so promise nothing more.
    return { title: `${cap(noun(mode))} ended`, subtitle: `What you finished counts. Next time the ${noun(mode)} starts from the beginning.`, tone: 'info', celebrate: false };
  }
  if (summary.exercises === 0) {
    return mode === 'review'
      ? { title: 'Nothing to review', subtitle: 'Every card is up to date. Come back tomorrow, or take a new lesson.', tone: 'info', celebrate: false }
      : { title: 'All done', subtitle: 'There was nothing left to do here.', tone: 'info', celebrate: false };
  }
  if (mode === 'checkpoint') return { title: 'Checkpoint passed', subtitle: 'Every lesson of this unit is now marked done.', tone: 'ok', celebrate: true };
  if (summary.perfect) return { title: `A perfect ${noun(mode)}`, subtitle: 'Every answer right the first time.', tone: 'ok', celebrate: true };
  if (mode === 'review') return { title: 'Review done', subtitle: 'Each card comes back just before you would forget it.', tone: 'ok', celebrate: true };
  if (mode === 'practice') return { title: 'Practice done', subtitle: 'Your hearts are full again.', tone: 'ok', celebrate: true };
  return { title: 'Lesson complete', subtitle: summary.mistakes > 0 ? 'The ones you missed came back until you had them.' : 'Nicely done.', tone: 'ok', celebrate: true };
}

/** One number on the summary. */
export interface SummaryStat {
  id: 'accuracy' | 'time' | 'xp' | 'streak' | 'crowns' | 'cards' | 'reviewed' | 'combo';
  label: string;
  value: string;
  /** A short line under the number ("+1 crown", "extended today"). */
  hint?: string;
}

/** The numbers to show, in order. Zeroes that mean nothing are left out. */
export function summaryStats(report: SessionReport): SummaryStat[] {
  const out: SummaryStat[] = [];
  if (report.exercises > 0) out.push({ id: 'accuracy', label: 'Accuracy', value: formatPercent(report.accuracy), hint: `${report.firstTry} of ${report.exercises} first time` });
  out.push({ id: 'time', label: 'Time', value: formatDuration(report.durationSec) });
  const xp = report.xpAwarded;
  // "+0 XP" for a session with nothing in it says nothing.
  if (xp > 0 || (report.outcome === 'completed' && report.exercises > 0)) out.push({ id: 'xp', label: 'XP earned', value: `+${xp}`, hint: report.multiplier > 1 ? `${report.multiplier}× boost` : report.leveledUp && report.level !== null ? `Level ${report.level}` : undefined });
  if (report.streak !== null && report.streak > 0) out.push({ id: 'streak', label: 'Streak', value: `${report.streak} ${report.streak === 1 ? 'day' : 'days'}`, hint: report.streakExtended ? 'Extended today' : undefined });
  if (report.crown) out.push({ id: 'crowns', label: 'Crowns', value: `${report.crown.after} of 5`, hint: report.crown.gained ? `+${report.crown.after - report.crown.before} for this lesson` : undefined });
  if (report.cardsReviewed > 0) out.push({ id: 'reviewed', label: 'Cards reviewed', value: String(report.cardsReviewed) });
  if (report.factsAdded > 0) out.push({ id: 'cards', label: 'Added to review', value: `${report.factsAdded} ${report.factsAdded === 1 ? 'card' : 'cards'}`, hint: 'They come back to keep them fresh' });
  if (report.bestCombo >= 3) out.push({ id: 'combo', label: 'Best run', value: `${report.bestCombo} in a row` });
  return out;
}

/** A line from the course's teacher at the end, in their voice (null for the Theory Path). */
export function teacherLine(teacher: string, outcome: SessionSummary['outcome'], perfect: boolean): string | null {
  const lines: Record<string, Partial<Record<SessionSummary['outcome'] | 'perfect', string>>> = {
    mia: {
      perfect: 'Every single one. You are getting the hang of this.',
      completed: 'That is one more thing your hands and ears know now. Well done.',
      'out-of-hearts': 'That is all right. A little practice and we pick it up again.',
      failed: 'No rush. The lessons will get you there, one at a time.',
      quit: 'Good stopping point. Come back to it whenever you are ready.',
    },
    dev: {
      perfect: 'Clean run. Take that straight to the guitar tonight.',
      completed: 'Nice. Now go use it in a song.',
      'out-of-hearts': 'Happens to everyone. Run a quick practice set and come back swinging.',
      failed: 'Not yet. Hit the lessons and we will try this again.',
      quit: 'Cool. Run it again whenever you have a minute.',
    },
    elena: {
      perfect: 'Flawless. I have no remarks, which is rare.',
      completed: 'Good. Precision comes from repetition; come back tomorrow.',
      'out-of-hearts': 'Mistakes are information. Practise, then return.',
      failed: 'The standard is high on purpose. Study the unit and try again.',
      quit: 'Stopping is allowed. Returning is expected.',
    },
  };
  const set = lines[teacher];
  if (!set) return null;
  return (perfect && outcome === 'completed' ? set.perfect : set[outcome]) ?? null;
}

/** The line under "Picked up where you left off": how far the saved session had got. */
export function resumeNote(done: number, total: number): string {
  const d = Math.max(0, Math.min(done, total));
  return total > 0 ? `${d} of ${total} steps done.` : 'Your place was kept.';
}

/** The next step the summary offers. */
export type NextStep =
  | { kind: 'lesson'; unitId: string; lessonId: string; title: string }
  | { kind: 'practice'; unitId: string }
  | { kind: 'retry' }
  | { kind: 'resume' }
  | { kind: 'path' };

/** The primary button's words for a next step. */
export function nextLabel(step: NextStep, mode: SessionMode): string {
  switch (step.kind) {
    case 'lesson':
      return 'Next lesson';
    case 'practice':
      return 'Practise to refill hearts';
    case 'retry':
      return mode === 'checkpoint' ? 'Try the checkpoint again' : 'Try again';
    case 'resume':
      return 'Keep going';
    default:
      return 'Back to the path';
  }
}
