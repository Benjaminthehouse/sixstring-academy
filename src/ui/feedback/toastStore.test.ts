import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_TOASTS, RESHOW_MIN_MS, TOAST_EXIT_MS, createToastStore, toastDuration } from './toastStore';

describe('toastDuration', () => {
  it('uses longer defaults for problems and actions', () => {
    expect(toastDuration({ title: 'x' })).toBe(4000);
    expect(toastDuration({ title: 'x', tone: 'ok' })).toBe(4000);
    expect(toastDuration({ title: 'x', tone: 'warn' })).toBe(6000);
    expect(toastDuration({ title: 'x', tone: 'bad' })).toBe(6000);
    expect(toastDuration({ title: 'x', action: { label: 'Undo', onClick: () => {} } })).toBe(8000);
    expect(toastDuration({ title: 'x', duration: 0 })).toBe(0);
    expect(toastDuration({ title: 'x', duration: 1500, tone: 'bad' })).toBe(1500);
  });
});

describe('toast store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const titles = (store: ReturnType<typeof createToastStore>) => store.getSnapshot().map((t) => `${t.title}${t.leaving ? '(leaving)' : ''}`);

  it('adds toasts in order and notifies subscribers', () => {
    const store = createToastStore();
    const listener = vi.fn();
    const off = store.subscribe(listener);
    const id = store.show({ title: 'one' });
    store.show({ title: 'two', tone: 'ok' });
    expect(titles(store)).toEqual(['one', 'two']);
    expect(store.getSnapshot()[0]).toMatchObject({ id, tone: 'neutral', leaving: false });
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    store.show({ title: 'three' });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('auto-dismisses after the duration, with an exit phase', () => {
    const store = createToastStore();
    store.show({ title: 'saved' });
    vi.advanceTimersByTime(3999);
    expect(titles(store)).toEqual(['saved']);
    vi.advanceTimersByTime(1);
    expect(titles(store)).toEqual(['saved(leaving)']);
    vi.advanceTimersByTime(TOAST_EXIT_MS);
    expect(titles(store)).toEqual([]);
  });

  it('keeps sticky toasts until dismissed', () => {
    const store = createToastStore();
    const id = store.show({ title: 'recording', duration: 0 });
    vi.advanceTimersByTime(60_000);
    expect(titles(store)).toEqual(['recording']);
    store.dismiss(id);
    vi.advanceTimersByTime(TOAST_EXIT_MS);
    expect(titles(store)).toEqual([]);
  });

  it('replaces a toast that reuses an id and restarts its timer', () => {
    const store = createToastStore();
    store.show({ id: 'save', title: 'Saving' });
    vi.advanceTimersByTime(3000);
    store.show({ id: 'save', title: 'Saved', tone: 'ok' });
    expect(titles(store)).toEqual(['Saved']);
    vi.advanceTimersByTime(3000);
    expect(titles(store)).toEqual(['Saved']);
    vi.advanceTimersByTime(1000 + TOAST_EXIT_MS);
    expect(titles(store)).toEqual([]);
  });

  it('revives a toast replaced while it is leaving', () => {
    const store = createToastStore();
    store.show({ id: 'a', title: 'first', duration: 1000 });
    vi.advanceTimersByTime(1000);
    expect(titles(store)).toEqual(['first(leaving)']);
    store.show({ id: 'a', title: 'second', duration: 1000 });
    vi.advanceTimersByTime(TOAST_EXIT_MS);
    expect(titles(store)).toEqual(['second']);
  });

  it('retires the oldest toasts beyond the limit', () => {
    const store = createToastStore({ max: 2 });
    store.show({ title: '1', duration: 0 });
    store.show({ title: '2', duration: 0 });
    store.show({ title: '3', duration: 0 });
    expect(titles(store)).toEqual(['1(leaving)', '2', '3']);
    vi.advanceTimersByTime(TOAST_EXIT_MS);
    expect(titles(store)).toEqual(['2', '3']);
  });

  it('pauses and resumes countdowns, leaving at least a second', () => {
    let clock = 0;
    const store = createToastStore({ now: () => clock });
    store.show({ title: 'hover me', duration: 4000 });
    clock = 3500;
    vi.advanceTimersByTime(3500);
    store.pause();
    clock = 60_000;
    vi.advanceTimersByTime(56_500);
    expect(titles(store)).toEqual(['hover me']);
    store.resume();
    vi.advanceTimersByTime(999);
    expect(titles(store)).toEqual(['hover me']);
    vi.advanceTimersByTime(1);
    expect(titles(store)).toEqual(['hover me(leaving)']);
  });

  it('does not start timers for toasts shown while paused until resumed', () => {
    const store = createToastStore();
    store.pause();
    store.show({ title: 'later', duration: 2000 });
    vi.advanceTimersByTime(10_000);
    expect(titles(store)).toEqual(['later']);
    store.resume();
    vi.advanceTimersByTime(2000);
    expect(titles(store)).toEqual(['later(leaving)']);
  });

  it('clear removes everything and cancels timers', () => {
    const store = createToastStore();
    store.show({ title: 'a' });
    store.show({ title: 'b', duration: 0 });
    store.clear();
    expect(titles(store)).toEqual([]);
    vi.advanceTimersByTime(20_000);
    expect(titles(store)).toEqual([]);
  });

  it('ignores a second dismiss and unknown ids', () => {
    const store = createToastStore();
    const id = store.show({ title: 'x', duration: 0 });
    const listener = vi.fn();
    store.subscribe(listener);
    store.dismiss(id);
    store.dismiss(id);
    store.dismiss('nope');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('shows at most three at once by default', () => {
    const store = createToastStore();
    expect(MAX_TOASTS).toBe(3);
    for (const t of ['1', '2', '3', '4']) store.show({ title: t, duration: 0 });
    expect(store.getSnapshot().filter((t) => !t.leaving)).toHaveLength(3);
    vi.advanceTimersByTime(TOAST_EXIT_MS);
    expect(titles(store)).toEqual(['2', '3', '4']);
  });

  it('lets news wait its turn when three are up, instead of pushing one off', () => {
    const store = createToastStore();
    store.show({ title: '+15 XP', news: true, duration: 1000 });
    store.show({ title: 'Quest done', news: true, duration: 2000 });
    store.show({ title: 'Crown 1 of 5', news: true, duration: 3000 });
    store.show({ title: 'Achievement', news: true, duration: 3000 });
    expect(titles(store)).toEqual(['+15 XP', 'Quest done', 'Crown 1 of 5']);
    expect(store.getWaiting().map((t) => t.title)).toEqual(['Achievement']);
    vi.advanceTimersByTime(1000 + TOAST_EXIT_MS);
    expect(titles(store)).toEqual(['Quest done', 'Crown 1 of 5', 'Achievement']);
    expect(store.getWaiting()).toEqual([]);
  });

  it('holds news back while a dialog is open, and shows it once the dialog closes', () => {
    const store = createToastStore();
    store.setHeld(true);
    store.show({ id: 'xp', title: '+15 XP', news: true, duration: 3200 });
    store.show({ title: 'Copied' });
    expect(titles(store)).toEqual(['Copied']);
    // An update of news that is waiting changes it where it stands.
    store.show({ id: 'xp', title: '+25 XP', news: true, duration: 3200 });
    vi.advanceTimersByTime(60_000);
    expect(store.getWaiting().map((t) => t.title)).toEqual(['+25 XP']);
    store.setHeld(false);
    expect(titles(store)).toEqual(['+25 XP']);
    vi.advanceTimersByTime(3199);
    expect(titles(store)).toEqual(['+25 XP']);
    vi.advanceTimersByTime(1);
    expect(titles(store)).toEqual(['+25 XP(leaving)']);
  });

  it('moves news that is showing out of the way when a dialog opens, and brings it back with time to read it', () => {
    let clock = 0;
    const store = createToastStore({ now: () => clock });
    store.show({ id: 'a', title: 'Quest done', news: true, duration: 5000 });
    store.show({ id: 'b', title: 'Crown', news: true, duration: 5000 });
    store.show({ id: 'r', title: 'Saved', duration: 0 });
    clock = 4500;
    vi.advanceTimersByTime(4500);
    store.setHeld(true);
    expect(titles(store)).toEqual(['Quest done(leaving)', 'Crown(leaving)', 'Saved']);
    vi.advanceTimersByTime(TOAST_EXIT_MS);
    expect(titles(store)).toEqual(['Saved']);
    expect(store.getWaiting().map((t) => t.id)).toEqual(['a', 'b']);
    clock = 30_000;
    vi.advanceTimersByTime(30_000);
    store.setHeld(false);
    expect(titles(store)).toEqual(['Saved', 'Quest done', 'Crown']);
    vi.advanceTimersByTime(RESHOW_MIN_MS - 1);
    expect(titles(store)).toEqual(['Saved', 'Quest done', 'Crown']);
    vi.advanceTimersByTime(1);
    expect(titles(store)).toEqual(['Saved', 'Quest done(leaving)', 'Crown(leaving)']);
  });

  it('lets a reply push news aside, and the news comes back when there is room', () => {
    const store = createToastStore();
    store.show({ id: 'n1', title: 'news 1', news: true, duration: 0 });
    store.show({ id: 'n2', title: 'news 2', news: true, duration: 0 });
    store.show({ id: 'n3', title: 'news 3', news: true, duration: 0 });
    store.show({ id: 'r', title: 'Deleted', duration: 1000 });
    vi.advanceTimersByTime(TOAST_EXIT_MS);
    expect(titles(store)).toEqual(['news 2', 'news 3', 'Deleted']);
    expect(store.getWaiting().map((t) => t.id)).toEqual(['n1']);
    vi.advanceTimersByTime(1000 + TOAST_EXIT_MS);
    expect(titles(store)).toEqual(['news 2', 'news 3', 'news 1']);
  });

  it('dismisses waiting news and clears the line', () => {
    const store = createToastStore();
    store.setHeld(true);
    store.show({ id: 'a', title: 'a', news: true });
    store.show({ id: 'b', title: 'b', news: true });
    store.dismiss('a');
    expect(store.getWaiting().map((t) => t.id)).toEqual(['b']);
    store.clear();
    store.setHeld(false);
    expect(titles(store)).toEqual([]);
  });
});
