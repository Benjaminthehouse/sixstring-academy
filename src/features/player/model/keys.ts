/**
 * The player's keyboard: Space play/pause, ← → previous/next bar, L loop (A–B), − + tempo,
 * M metronome, W wait mode, F flow mode, Esc stop. Keys typed into a field, or pressed with Ctrl,
 * Alt or Meta, are left alone. Pure: unit-tested.
 */

/** What a key does. */
export type PlayerCommand = 'toggle' | 'prev-bar' | 'next-bar' | 'loop' | 'slower' | 'faster' | 'metronome' | 'wait' | 'flow' | 'stop';

/** The shortcut shown in each control's tooltip. */
export const SHORTCUTS: Record<PlayerCommand, string> = {
  toggle: 'Space',
  'prev-bar': '←',
  'next-bar': '→',
  loop: 'L',
  slower: '−',
  faster: '+',
  metronome: 'M',
  wait: 'W',
  flow: 'F',
  stop: 'Esc',
};

/** The parts of a KeyboardEvent the mapping needs. */
export interface KeyLike {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
  /** The focused element's tag and role, and whether it is editable. */
  target?: { tagName?: string; isContentEditable?: boolean; role?: string | null; type?: string; focusVisible?: boolean } | null;
}

const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
/** Controls that use Space or arrows themselves: their own key handling wins. */
const OWN_SPACE = new Set(['BUTTON', 'A', 'SUMMARY']);
const OWN_ARROWS = new Set(['slider', 'radio', 'tab', 'menuitem', 'option', 'spinbutton', 'listbox', 'radiogroup']);

/** The command for a key press, or null when the key is not the player's (or belongs to the focused control). */
export function commandFor(e: KeyLike): PlayerCommand | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  const t = e.target;
  if (t && (t.isContentEditable || (t.tagName && TYPING.has(t.tagName.toUpperCase()) && t.type !== 'checkbox' && t.type !== 'radio' && t.type !== 'range'))) return null;
  const k = e.key;
  if (k === ' ' || k === 'Spacebar' || e.code === 'Space') {
    // A button reached with the keyboard presses itself with Space; one that only holds focus
    // because it was clicked does not keep Space from playing and pausing.
    if (t?.tagName && OWN_SPACE.has(t.tagName.toUpperCase()) && t.focusVisible) return null;
    return 'toggle';
  }
  if (k === 'ArrowLeft' || k === 'ArrowRight') {
    if (t?.role && OWN_ARROWS.has(t.role)) return null;
    if (t?.type === 'range') return null;
    return k === 'ArrowLeft' ? 'prev-bar' : 'next-bar';
  }
  if (k === 'Escape' || k === 'Esc') return 'stop';
  if (e.repeat && k !== '-' && k !== '+' && k !== '=' && k !== '_') return null;
  switch (k.length === 1 ? k.toLowerCase() : k) {
    case 'l':
      return 'loop';
    case '-':
    case '_':
    case 'Subtract':
      return 'slower';
    case '+':
    case '=':
    case 'Add':
      return 'faster';
    case 'm':
      return 'metronome';
    case 'w':
      return 'wait';
    case 'f':
      return 'flow';
    default:
      return null;
  }
}

/** Tempo steps for − and +: 5 % at a time, on the grid of 5. */
export function tempoStep(percent: number, dir: -1 | 1, step = 5): number {
  const snapped = dir > 0 ? Math.floor(percent / step) * step + step : Math.ceil(percent / step) * step - step;
  return Math.max(25, Math.min(150, snapped));
}
