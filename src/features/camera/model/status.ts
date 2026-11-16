/**
 * What the screen says and draws for a tracker answer: the status pill (state in words, five
 * confidence bars, a tone), one line of coaching, which help to offer (the "Is this fret N?"
 * question, four-tap marking, the guitar type), and how far the notes may be drawn.
 *
 * Honest by design: notes are drawn solidly only on a locked board the tracker is sure of (a locked
 * board whose confidence sags, or that moves faster than the tracker can keep up with on this
 * device, gets outlines); a board just lost keeps its
 * notes as faint outlines for a moment (the learner sees it is holding on, not guessing), then they
 * go; a board whose numbers are a guess shows its outline and asks, never notes.
 */
import type { GuidanceCode, TrackerState, TrackerUpdate } from '@/core/vision';

/** How notes are drawn now. */
export type NoteMode = 'solid' | 'ghost' | 'none';

/** Help the screen can offer, most useful first. */
export type Offer = 'confirm-fret' | 'calibrate' | 'guitar-type' | 'fix-numbers';

/** Everything visible that comes from the tracker (React state: changes a few times a second at most). */
export interface LiveStatus {
  state: TrackerState;
  /** The state in words ("Locked"). */
  word: string;
  tone: 'ok' | 'warn' | 'info';
  /** Confidence as 0-5 bars. */
  bars: number;
  /** One line of coaching ('' when all is well and nothing needs saying). */
  message: string;
  code: GuidanceCode;
  offers: Offer[];
  notes: NoteMode;
  /** The fret the tracker asks about ("Is this fret 5?"), with its point in working-frame pixels. */
  question: { fret: number; x: number; y: number } | null;
  /** The numbers rest on something (nut, inlays, stickers, the learner). */
  numbered: boolean;
}

/** How long notes of a lost board stay as outlines before they go (ms). */
export const GHOST_MS = 600;

/** Below this smoothed confidence a board that is still locked draws its notes as outlines only. */
export const SOLID_CONFIDENCE = 0.5;

/**
 * How far behind the picture the drawn notes may be, in string spacings, before they turn into
 * outlines. The tracker answers each frame some time after it was taken (more on a slow or busy
 * device); while the neck moves, the dots trail it by about speed x delay.
 */
export const TRAIL_GHOST = 0.45;

/** The expected trail of the dots behind a moving neck, in string spacings (0 when it cannot be measured). */
export function trailingSpacings(speedPxPerSec: number, latencyMs: number, stringSpacingPx: number): number {
  if (!(speedPxPerSec > 0) || !(latencyMs > 0) || !(stringSpacingPx > 0)) return 0;
  return (speedPxPerSec * latencyMs) / 1000 / stringSpacingPx;
}

/** The status before the first answer. */
export const STARTING_STATUS: LiveStatus = {
  state: 'searching',
  word: 'Looking for the neck',
  tone: 'info',
  bars: 0,
  message: 'Point the camera at the neck of your guitar.',
  code: 'point-camera',
  offers: [],
  notes: 'none',
  question: null,
  numbered: false,
};

const WORDS: Record<TrackerState, string> = { searching: 'Looking for the neck', candidate: 'Checking the frets', locked: 'Locked', lost: 'Lost the neck' };

/** The status for one tracker answer. `lostForMs` = how long the board has been lost (0 otherwise). */
export function describeStatus(u: Pick<TrackerUpdate, 'state' | 'confidence' | 'guidance' | 'suggestCalibration' | 'question' | 'numberingConfirmed' | 'stringsSeen'>, lostForMs = 0, trailing = 0): LiveStatus {
  const g = u.guidance;
  const offers: Offer[] = [];
  if (u.question) offers.push('confirm-fret');
  if (g.code === 'check-guitar-type' || u.stringsSeen !== null) offers.push('guitar-type');
  if (u.suggestCalibration || g.trust === 'calibrate') offers.push('calibrate');
  if (u.state === 'candidate' && !u.numberingConfirmed && !u.question) offers.push('fix-numbers');
  const bars = Math.max(0, Math.min(5, Math.round(Math.min(1, Math.max(0, u.confidence)) * 5)));
  let notes: NoteMode = 'none';
  const fast = trailing > TRAIL_GHOST;
  if (u.state === 'locked') notes = u.confidence >= SOLID_CONFIDENCE && !fast ? 'solid' : 'ghost';
  else if (u.state === 'lost' && lostForMs < GHOST_MS) notes = 'ghost';
  let message = g.message;
  if (u.state === 'locked' && g.code === 'ok') message = '';
  if (u.state === 'lost') message = 'Lost the neck for a moment. Hold the guitar still in the picture.';
  else if (u.state === 'locked' && fast && !message) message = 'Moving: the dots catch up when the neck holds still.';
  const tone: LiveStatus['tone'] = u.state === 'locked' ? 'ok' : u.state === 'searching' ? 'info' : 'warn';
  return {
    state: u.state,
    word: WORDS[u.state],
    tone,
    bars: u.state === 'searching' ? 0 : bars,
    message,
    code: g.code,
    offers,
    notes,
    question: u.question ? { fret: u.question.fret, x: u.question.point.x, y: u.question.point.y } : null,
    numbered: u.numberingConfirmed,
  };
}

/** Whether two statuses look the same on screen (skip the React update when they do). */
export function sameStatus(a: LiveStatus, b: LiveStatus): boolean {
  return (
    a.state === b.state &&
    a.bars === b.bars &&
    a.message === b.message &&
    a.code === b.code &&
    a.notes === b.notes &&
    a.numbered === b.numbered &&
    a.offers.join() === b.offers.join() &&
    (a.question?.fret ?? -1) === (b.question?.fret ?? -1)
  );
}

/** The words an assistive-technology user hears when the status changes (state first, then the coaching). */
export function announcement(s: LiveStatus): string {
  if (s.state === 'locked') return s.message ? `Locked. ${s.message}` : 'Locked: the notes are on your frets.';
  return s.message ? `${s.word}. ${s.message}` : s.word;
}
