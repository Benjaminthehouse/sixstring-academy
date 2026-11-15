/**
 * The ids of the toasts the shell itself has put up, so they can be cleared together: when the
 * learner opens the stats sheet, the toast that pointed there has done its job and must not sit
 * on top of it.
 */
import { toast } from '@/ui';

const shown = new Set<string>();

/** Remember a shell toast by id. */
export function noteShellToast(id: string): void {
  shown.add(id);
}

/** Dismiss every toast the shell has shown. Toasts of other screens are left alone. */
export function dismissShellToasts(): void {
  for (const id of shown) toast.dismiss(id);
  shown.clear();
}
