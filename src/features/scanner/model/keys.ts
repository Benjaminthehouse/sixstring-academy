/**
 * The proofreader's keyboard: what a key press means, and two-digit frets typed as two key presses
 * ("1" then "2" within a moment = fret 12).
 *
 *   Arrows   move between notes (left / right: beats; up / down: strings)
 *   0-9      set the fret (type two digits quickly for 10-24)
 *   + / -    fret up / down
 *   Delete   remove the note (Backspace too); Shift+Delete removes the whole beat
 *   w h q e s  note length (whole, half, quarter, eighth, sixteenth); . toggles a dot
 *   Enter    "this is right" (confirm a doubtful note)
 *   n        next thing to check
 *   Space    play / pause
 *   Ctrl+Z   undo (Ctrl+Shift+Z or Ctrl+Y redo)
 *   Escape   select nothing
 */

/** What a key does in the proofreader. */
export type EditorCommand =
  | { type: 'move'; dir: 'left' | 'right' | 'up' | 'down' }
  | { type: 'digit'; digit: number }
  | { type: 'step'; by: 1 | -1 }
  | { type: 'delete'; beat: boolean }
  | { type: 'value'; base: number }
  | { type: 'dot' }
  | { type: 'confirm' }
  | { type: 'next' }
  | { type: 'play' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'clear' };

/** The parts of a keyboard event the editor looks at. */
export interface KeyInput {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

const VALUES: Record<string, number> = { w: 1, h: 2, q: 4, e: 8, s: 16 };

/** The command for a key press, or null when the editor leaves the key alone. */
export function keyCommand(e: KeyInput): EditorCommand | null {
  const mod = !!(e.ctrlKey || e.metaKey);
  const key = e.key;
  if (mod && !e.altKey) {
    const k = key.toLowerCase();
    if (k === 'z') return e.shiftKey ? { type: 'redo' } : { type: 'undo' };
    if (k === 'y') return { type: 'redo' };
    return null;
  }
  if (e.altKey) return null;
  switch (key) {
    case 'ArrowLeft':
      return { type: 'move', dir: 'left' };
    case 'ArrowRight':
      return { type: 'move', dir: 'right' };
    case 'ArrowUp':
      return { type: 'move', dir: 'up' };
    case 'ArrowDown':
      return { type: 'move', dir: 'down' };
    case 'Delete':
    case 'Backspace':
      return { type: 'delete', beat: !!e.shiftKey };
    case '+':
    case '=':
      return { type: 'step', by: 1 };
    case '-':
    case '_':
      return { type: 'step', by: -1 };
    case '.':
      return { type: 'dot' };
    case 'Enter':
      return { type: 'confirm' };
    case ' ':
    case 'Spacebar':
      return { type: 'play' };
    case 'Escape':
      return { type: 'clear' };
    default:
  }
  if (/^[0-9]$/.test(key)) return { type: 'digit', digit: Number(key) };
  const lower = key.length === 1 ? key.toLowerCase() : '';
  if (lower === 'n') return { type: 'next' };
  if (lower in VALUES && !e.shiftKey) return { type: 'value', base: VALUES[lower] };
  return null;
}

/** Digits typed so far for one note. */
export interface FretTyping {
  /** Which note they are for ("bar:beat:note"). */
  target: string;
  text: string;
  at: number;
}

/** How long after a digit a second one still belongs to the same fret (ms). */
export const DIGIT_WINDOW_MS = 900;

/**
 * Fold a typed digit into the fret being typed: within the window and still a fret (<= max) the
 * digits join ("1" "2" = 12), otherwise the digit starts a new fret.
 */
export function typeDigit(prev: FretTyping | null, target: string, digit: number, now: number, max = 24): { fret: number; typing: FretTyping } {
  if (prev && prev.target === target && now - prev.at <= DIGIT_WINDOW_MS && prev.text.length === 1 && prev.text !== '0') {
    const joined = Number(prev.text + String(digit));
    if (joined <= max) return { fret: joined, typing: { target, text: prev.text + String(digit), at: now } };
  }
  return { fret: digit, typing: { target, text: String(digit), at: now } };
}
