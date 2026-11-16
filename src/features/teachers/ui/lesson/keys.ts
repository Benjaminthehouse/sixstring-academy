/**
 * Small keyboard and draft helpers the lesson player needs. They mirror the lesson engine's
 * player (`src/lessons/ui`), which does not export them from its barrel, so the two players
 * answer keys the same way.
 */
import type { Answer } from '@/lessons';

/** True when the event target is a text field or inside a dialog (keys belong to it). */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  if (el.isContentEditable) return true;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return true;
  return !!el.closest('[role="dialog"], [role="alertdialog"]');
}

/** The 0-based option a number key picks (1 to 9), or null. */
export function positionOfKey(key: string): number | null {
  if (!/^[1-9]$/.test(key)) return null;
  return Number(key) - 1;
}

/** True for a click or key target that keeps its own Enter / Space (buttons, links, read-aloud). */
export function ownsEnter(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && typeof el.closest === 'function' && !!el.closest('[data-own-enter], [data-player-bar] button, a[href], [data-task] button');
}

/** True inside a control that uses the arrow keys itself. */
export function inNativeKeys(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && typeof el.closest === 'function' && !!el.closest('[data-native-keys]');
}

/** True when a draft answer is complete enough to check. */
export function isCheckable(answer: Answer | null): answer is Answer {
  if (!answer) return false;
  switch (answer.type) {
    case 'choice':
    case 'listen-choice':
      return answer.selected.length > 0;
    case 'order':
      return answer.order.length > 0;
    case 'fill-blanks':
      return answer.blanks.every((b) => b !== null);
    case 'type-answer':
    case 'fretboard-name':
    case 'staff-read':
      return answer.text.trim().length > 0;
    case 'fretboard-find':
      return answer.positions.length > 0;
    case 'chord-build':
      return answer.text !== undefined ? answer.text.trim().length > 0 : (answer.frets ?? []).some((f) => f !== null);
    case 'staff-place':
      return Number.isFinite(answer.position);
    case 'match-pairs':
      return answer.pairs.length > 0;
    default:
      return true;
  }
}
