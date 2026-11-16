/**
 * The phone's Back gesture (and the browser's Back button) closes the open dialog instead of
 * leaving the screen behind it.
 *
 * While a kit Modal or Sheet is open it owns one history entry: the same address, marked in
 * `history.state`. Back pops that entry, and the dialog is asked to close. When the dialog closes
 * any other way (its button, Escape, the screen itself), its entry is taken off again, so the next
 * Back still leaves the screen as before.
 *
 * Screens do not need to know. The cases that would otherwise leave a stray entry behind:
 *  - the screen navigates from inside the dialog (a link in a sheet): the dialog's entry is left
 *    under the new screen; Back skips over it instead of stopping on a copy of the old address;
 *  - the screen *replaces* the address while closing (`redirect('songs')` after `#songs--add`
 *    opened a sheet): the replacement is moved down onto the entry the dialog was opened from, so
 *    Back never brings the sheet's address (and the sheet) back.
 * In a frame that refuses `pushState` (some sandboxed hosts) all of this quietly switches off.
 */

const KEY = 'ssaDialog';
/** If a history step we asked for has not arrived by then, stop waiting for it. */
const EXPECT_TIMEOUT_MS = 1500;

interface Live {
  id: number;
  /** Close the dialog because the learner went Back. Returns false when it cannot close now. */
  onBack: () => boolean;
}

/**
 * Dialog ids grow with time across page loads (they start from the clock), so an entry left marked
 * by an earlier load is always older, and never mistaken for a dialog that is open now.
 */
let seq = Date.now();
let enabled = true;
let listening = false;
/** Open dialogs that asked for Back handling, oldest first. */
const live: Live[] = [];
/** Dialogs that have a history entry, in the order the entries were pushed (top of history last). */
const entries: number[] = [];
/** History steps we started ourselves; their popstate is not the learner going Back. */
let expected = 0;
let expectTimer: ReturnType<typeof setTimeout> | null = null;
/** After a redirect replaced a dialog's entry: the address to write onto the entry below it. */
let pendingReplace: { url: string; state: unknown } | null = null;
let scheduled = false;
/** Where we were after the last history change we saw, and whether it was our top entry. */
let lastHref = '';
let onTop = false;
let lengthAtTop = -1;
/** history.length as last seen: a popstate that comes with a longer history is a new entry, not Back. */
let knownLength = 0;

function stateObject(): Record<string, unknown> {
  try {
    const state = window.history.state as unknown;
    return state && typeof state === 'object' ? { ...(state as Record<string, unknown>) } : {};
  } catch {
    return {};
  }
}

/** The dialog id marked on the current history entry (0 for an ordinary entry). */
function currentId(): number {
  const value = stateObject()[KEY];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function expectStep(): void {
  expected += 1;
  if (expectTimer) clearTimeout(expectTimer);
  expectTimer = setTimeout(() => {
    expected = 0;
    expectTimer = null;
    schedule();
  }, EXPECT_TIMEOUT_MS);
}

function goBack(steps: number): void {
  expectStep();
  try {
    window.history.go(-steps);
  } catch {
    expected = 0;
  }
}

function push(id: number): void {
  try {
    window.history.pushState({ ...stateObject(), [KEY]: id }, '');
    entries.push(id);
    lastHref = window.location.href;
    onTop = true;
    lengthAtTop = window.history.length;
    knownLength = lengthAtTop;
  } catch {
    // A sandboxed frame may refuse: Back then simply leaves the screen, as it always did.
    enabled = false;
  }
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  // After React has finished the commit (StrictMode mounts, unmounts and remounts effects at once).
  queueMicrotask(() => {
    scheduled = false;
    reconcile();
  });
}

/** Bring history in line with the dialogs that are open. */
function reconcile(): void {
  if (!enabled || typeof window === 'undefined' || expected > 0) return;
  const open = new Set(live.map((l) => l.id));
  // Dialogs that closed by themselves: if their entries are on top, step back over them.
  if (entries.length > 0 && currentId() === entries[entries.length - 1]) {
    let k = 0;
    while (k < entries.length && !open.has(entries[entries.length - 1 - k])) k++;
    if (k > 0) {
      entries.splice(entries.length - k, k);
      onTop = false;
      goBack(k);
      return;
    }
  }
  // Closed while something else was on top (the screen navigated away): the entry stays behind,
  // and Back skips it when it gets there (see onPopState).
  for (let i = entries.length - 1; i >= 0; i--) {
    if (!open.has(entries[i])) entries.splice(i, 1);
  }
  for (const l of live) if (!entries.includes(l.id)) push(l.id);
}

function onPopState(): void {
  const from = lastHref;
  lastHref = window.location.href;
  onTop = false;
  const grew = window.history.length > knownLength;
  knownLength = window.history.length;
  // Browsers also fire popstate for a link to a new address: that is a step forward, not Back.
  if (grew && expected === 0 && !pendingReplace) {
    schedule();
    return;
  }
  const id = currentId();
  const ours = expected > 0;
  if (ours) {
    expected -= 1;
    if (expected === 0 && expectTimer) {
      clearTimeout(expectTimer);
      expectTimer = null;
    }
  }
  if (pendingReplace) {
    // Back on the entry the dialog was opened from: give it the address the screen redirected to.
    // This runs before the browser's hashchange, so the router never sees the old address again.
    const { url, state } = pendingReplace;
    pendingReplace = null;
    try {
      window.history.replaceState(state, '', url);
    } catch {
      /* keep the entry as it is */
    }
    lastHref = window.location.href;
    schedule();
    return;
  }
  // A dialog entry whose dialog is gone: skip it going back; going forward, make it an ordinary entry.
  if (id > 0 && !live.some((l) => l.id === id)) {
    if (ours || from !== window.location.href) {
      goBack(1);
      return;
    }
    try {
      const plain = stateObject();
      delete plain[KEY];
      window.history.replaceState(plain, '');
    } catch {
      /* harmless: one extra entry */
    }
  }
  if (!ours) {
    // The learner went Back: every dialog whose entry was above this one closes, newest first.
    const left = entries.filter((e) => id === 0 || e > id);
    for (const e of left.reverse()) {
      const dialog = live.find((l) => l.id === e);
      const closed = dialog ? dialog.onBack() : true;
      if (closed) entries.splice(entries.indexOf(e), 1);
      else {
        // It cannot close right now (a step in flight): stay on the screen and keep the entry.
        entries.splice(entries.indexOf(e), 1);
        push(e);
      }
    }
  }
  if (id > 0 && id === entries[entries.length - 1]) {
    onTop = true;
    lengthAtTop = window.history.length;
  }
  schedule();
}

function onHashChange(): void {
  const wasTop = onTop;
  const length = window.history.length;
  const href = window.location.href;
  knownLength = length;
  if (href === lastHref) return;
  onTop = false;
  lastHref = href;
  // Our entry was on top and the address changed without a new entry: the screen replaced it
  // (`redirect()`), most often while closing a sheet it had opened from the address.
  if (wasTop && enabled && currentId() === 0 && entries.length > 0 && length === lengthAtTop) {
    entries.pop();
    let state: unknown = null;
    try {
      state = window.history.state as unknown;
    } catch {
      state = null;
    }
    pendingReplace = { url: href, state };
    goBack(1);
  }
}

function listen(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  // A reload while a dialog was open leaves this entry marked: no dialog of this page owns it.
  if (currentId() > 0) {
    try {
      const plain = stateObject();
      delete plain[KEY];
      window.history.replaceState(plain, '');
    } catch {
      /* harmless */
    }
  }
  lastHref = window.location.href;
  knownLength = window.history.length;
  window.addEventListener('popstate', onPopState);
  window.addEventListener('hashchange', onHashChange);
}

/**
 * Let Back close a dialog while it is open. `onBack` closes it and returns true, or returns false
 * when it cannot close right now. Call the returned function once the dialog has closed.
 */
export function registerBackClose(onBack: () => boolean): () => void {
  if (typeof window === 'undefined') return () => undefined;
  listen();
  const entry: Live = { id: ++seq, onBack };
  live.push(entry);
  schedule();
  return () => {
    const at = live.indexOf(entry);
    if (at >= 0) live.splice(at, 1);
    schedule();
  };
}

/** For tests: forget everything, as a fresh page load would (history itself is left alone). */
export function resetBackClose(): void {
  if (listening && typeof window !== 'undefined') {
    window.removeEventListener('popstate', onPopState);
    window.removeEventListener('hashchange', onHashChange);
  }
  listening = false;
  live.length = 0;
  entries.length = 0;
  expected = 0;
  if (expectTimer) clearTimeout(expectTimer);
  expectTimer = null;
  pendingReplace = null;
  enabled = true;
  onTop = false;
  lengthAtTop = -1;
  if (typeof window !== 'undefined') {
    lastHref = window.location.href;
    knownLength = window.history.length;
  }
}
