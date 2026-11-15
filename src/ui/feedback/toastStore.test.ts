import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOAST_EXIT_MS, createToastStore, toastDuration } from './toastStore';

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
});
