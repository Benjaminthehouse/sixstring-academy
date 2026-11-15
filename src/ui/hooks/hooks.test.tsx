// @vitest-environment jsdom
import { act, useRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readJSON } from '@/core/platform/storage';
import { getTabbables, initialFocusTarget, trapTabTarget } from './focus';
import { useControllableState } from './useControllableState';
import { useDebounced, useDebouncedCallback } from './useDebounced';
import { useDismiss } from './useDismiss';
import { useElementSize } from './useElementSize';
import { useEventListener } from './useEventListener';
import { useFocusTrap } from './useFocusTrap';
import { useInterval, useTimeout } from './useInterval';
import { useLatest } from './useLatest';
import { useLocalState } from './useLocalState';
import { useIsMobile, useMediaQuery } from './useMediaQuery';
import { usePressHold } from './usePressHold';
import { MAX_FRAME_MS, useRafLoop } from './useRafLoop';
import { lockScroll, useScrollLock } from './useScrollLock';
import { useWakeLock } from './useWakeLock';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<{ root: Root; el: HTMLElement }> = [];

function mount(node: ReactNode) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => root.render(node));
  const entry = { root, el };
  mounted.push(entry);
  return {
    el,
    rerender: (next: ReactNode) => act(() => root.render(next)),
    unmount: () => {
      act(() => root.unmount());
      el.remove();
      mounted.splice(mounted.indexOf(entry), 1);
    },
  };
}

function renderHook<T, P>(hook: (props: P) => T, initialProps: NoInfer<P>) {
  const result = { current: undefined as T };
  function Probe({ p }: { p: P }) {
    result.current = hook(p);
    return null;
  }
  const view = mount(<Probe p={initialProps} />);
  return { result, rerender: (p: P) => view.rerender(<Probe p={p} />), unmount: view.unmount };
}

afterEach(() => {
  while (mounted.length) {
    const { root, el } = mounted.pop()!;
    act(() => root.unmount());
    el.remove();
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('useLatest', () => {
  it('keeps one ref that always holds the newest value', () => {
    const { result, rerender } = renderHook((v: number) => useLatest(v), 1);
    const ref = result.current;
    expect(ref.current).toBe(1);
    rerender(2);
    expect(result.current).toBe(ref);
    expect(ref.current).toBe(2);
  });
});

describe('useInterval / useTimeout', () => {
  beforeEach(() => vi.useFakeTimers());

  it('ticks at the delay, pauses on null, and always calls the latest callback', () => {
    const calls: string[] = [];
    const { rerender, unmount } = renderHook(({ tag, delay }: { tag: string; delay: number | null }) => useInterval(() => calls.push(tag), delay), { tag: 'a', delay: 100 });
    act(() => void vi.advanceTimersByTime(250));
    expect(calls).toEqual(['a', 'a']);
    rerender({ tag: 'b', delay: 100 });
    act(() => void vi.advanceTimersByTime(100));
    // The timer was not restarted by the new callback: it fires on the original schedule.
    expect(calls).toEqual(['a', 'a', 'b']);
    rerender({ tag: 'b', delay: null });
    act(() => void vi.advanceTimersByTime(1000));
    expect(calls).toHaveLength(3);
    rerender({ tag: 'c', delay: 50 });
    act(() => void vi.advanceTimersByTime(50));
    expect(calls).toEqual(['a', 'a', 'b', 'c']);
    unmount();
    act(() => void vi.advanceTimersByTime(1000));
    expect(calls).toHaveLength(4);
  });

  it('useTimeout fires once and can be cancelled', () => {
    const fn = vi.fn();
    const { rerender } = renderHook((delay: number | null) => useTimeout(fn, delay), 200);
    act(() => void vi.advanceTimersByTime(199));
    expect(fn).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(fn).toHaveBeenCalledTimes(1);
    act(() => void vi.advanceTimersByTime(1000));
    expect(fn).toHaveBeenCalledTimes(1);
    rerender(300);
    rerender(null);
    act(() => void vi.advanceTimersByTime(1000));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('useDebounced', () => {
  beforeEach(() => vi.useFakeTimers());

  it('follows the value only after it settles', () => {
    const { result, rerender } = renderHook((v: string) => useDebounced(v, 200), 'a');
    expect(result.current).toBe('a');
    rerender('ab');
    act(() => void vi.advanceTimersByTime(150));
    rerender('abc');
    act(() => void vi.advanceTimersByTime(150));
    expect(result.current).toBe('a');
    act(() => void vi.advanceTimersByTime(50));
    expect(result.current).toBe('abc');
  });

  it('passes the value straight through with no delay', () => {
    const { result, rerender } = renderHook((v: number) => useDebounced(v, 0), 1);
    rerender(2);
    expect(result.current).toBe(2);
  });

  it('useDebouncedCallback calls once with the last arguments, and supports cancel and flush', () => {
    const calls: number[] = [];
    const { result, unmount } = renderHook(() => useDebouncedCallback((n: number) => calls.push(n), 100), undefined);
    const fn = result.current;
    fn(1);
    fn(2);
    fn(3);
    vi.advanceTimersByTime(99);
    expect(calls).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(calls).toEqual([3]);
    fn(4);
    fn.cancel();
    vi.advanceTimersByTime(500);
    expect(calls).toEqual([3]);
    fn(5);
    fn.flush();
    expect(calls).toEqual([3, 5]);
    vi.advanceTimersByTime(500);
    expect(calls).toEqual([3, 5]);
    fn(6);
    unmount();
    vi.advanceTimersByTime(500);
    expect(calls).toEqual([3, 5]);
  });
});

describe('useLocalState', () => {
  it('reads the initial value, persists updates through platform storage, and resets', () => {
    const key = `test.local.${Math.random()}`;
    const { result } = renderHook(() => useLocalState(key, 'A minor'), undefined);
    expect(result.current[0]).toBe('A minor');
    act(() => result.current[1]('E minor'));
    expect(result.current[0]).toBe('E minor');
    expect(readJSON(key, 'missing')).toBe('E minor');
    act(() => result.current[2]());
    expect(result.current[0]).toBe('A minor');
    expect(readJSON(key, 'missing')).toBe('missing');
  });

  it('starts from a stored value and supports functional updates and lazy initial values', () => {
    const key = `test.local.${Math.random()}`;
    const first = renderHook(() => useLocalState(key, () => 5), undefined);
    act(() => first.result.current[1]((n) => n + 1));
    act(() => first.result.current[1]((n) => n + 1));
    expect(first.result.current[0]).toBe(7);
    first.unmount();
    const second = renderHook(() => useLocalState(key, 0), undefined);
    expect(second.result.current[0]).toBe(7);
  });

  it('keeps every instance of the same key in sync', () => {
    const key = `test.local.${Math.random()}`;
    const a = renderHook(() => useLocalState<string[]>(key, []), undefined);
    const b = renderHook(() => useLocalState<string[]>(key, []), undefined);
    act(() => a.result.current[1](['blues']));
    expect(b.result.current[0]).toEqual(['blues']);
    act(() => b.result.current[2]());
    expect(a.result.current[0]).toEqual([]);
  });

  it('re-reads when the key changes', () => {
    const k1 = `test.local.${Math.random()}`;
    const k2 = `test.local.${Math.random()}`;
    const { result, rerender } = renderHook((key: string) => useLocalState(key, 'none'), k1);
    act(() => result.current[1]('one'));
    rerender(k2);
    expect(result.current[0]).toBe('none');
    rerender(k1);
    expect(result.current[0]).toBe('one');
  });
});

describe('useControllableState', () => {
  it('owns the state when uncontrolled', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useControllableState<string>(undefined, 'a', onChange), undefined);
    act(() => result.current[1]('b'));
    expect(result.current[0]).toBe('b');
    expect(onChange).toHaveBeenCalledWith('b');
    act(() => result.current[1]('b'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('follows the prop when controlled', () => {
    const onChange = vi.fn();
    const { result, rerender } = renderHook((value: string) => useControllableState<string>(value, 'x', onChange), 'a');
    act(() => result.current[1]('b'));
    expect(onChange).toHaveBeenCalledWith('b');
    expect(result.current[0]).toBe('a');
    rerender('b');
    expect(result.current[0]).toBe('b');
  });
});

describe('useMediaQuery', () => {
  function stubMatchMedia(initial: Record<string, boolean>) {
    const state = { ...initial };
    const listeners = new Map<string, Set<() => void>>();
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        get matches() {
          return !!state[query];
        },
        media: query,
        addEventListener: (_: string, cb: () => void) => {
          if (!listeners.has(query)) listeners.set(query, new Set());
          listeners.get(query)!.add(cb);
        },
        removeEventListener: (_: string, cb: () => void) => listeners.get(query)?.delete(cb),
      })),
    );
    return {
      set(query: string, value: boolean) {
        state[query] = value;
        listeners.get(query)?.forEach((cb) => cb());
      },
      count: (query: string) => listeners.get(query)?.size ?? 0,
    };
  }

  it('reports the current match and follows changes', () => {
    const media = stubMatchMedia({ '(min-width: 1080px)': false });
    const { result, unmount } = renderHook(() => useMediaQuery('(min-width: 1080px)'), undefined);
    expect(result.current).toBe(false);
    act(() => media.set('(min-width: 1080px)', true));
    expect(result.current).toBe(true);
    unmount();
    expect(media.count('(min-width: 1080px)')).toBe(0);
  });

  it('useIsMobile uses the phone breakpoint', () => {
    stubMatchMedia({ '(max-width: 719.98px)': true });
    const { result } = renderHook(() => useIsMobile(), undefined);
    expect(result.current).toBe(true);
  });
});

describe('useElementSize', () => {
  it('measures on mount and follows ResizeObserver', () => {
    let notify: ((entries: Array<{ contentRect: { width: number; height: number } }>) => void) | null = null;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: typeof notify) {
          notify = cb;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 320.4, height: 44.2, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) });
    let size = { width: -1, height: -1 };
    function Probe() {
      const [ref, s] = useElementSize<HTMLDivElement>();
      size = s;
      return <div ref={ref} />;
    }
    const view = mount(<Probe />);
    expect(size).toEqual({ width: 320, height: 44 });
    act(() => notify?.([{ contentRect: { width: 500, height: 60 } }]));
    expect(size).toEqual({ width: 500, height: 60 });
    view.unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});

describe('useEventListener', () => {
  it('listens on window with the latest handler and cleans up', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const seen: string[] = [];
    const { rerender, unmount } = renderHook((tag: string) => useEventListener(window, 'keydown', (e) => seen.push(`${tag}:${e.key}`)), 'a');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
    rerender('b');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y' }));
    expect(seen).toEqual(['a:x', 'b:y']);
    expect(add.mock.calls.filter((c) => c[0] === 'keydown')).toHaveLength(1);
    unmount();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z' }));
    expect(seen).toHaveLength(2);
  });

  it('accepts a ref to an element and tolerates null', () => {
    const clicks = vi.fn();
    function Probe() {
      const ref = useRef<HTMLButtonElement | null>(null);
      useEventListener(ref, 'click', clicks);
      useEventListener(null as Window | null, 'resize', clicks);
      return <button ref={ref}>go</button>;
    }
    const view = mount(<Probe />);
    view.el.querySelector('button')!.click();
    expect(clicks).toHaveBeenCalledTimes(1);
  });
});

describe('useRafLoop', () => {
  it('runs each frame with a capped delta and stops when asked', () => {
    let queued: Array<{ id: number; cb: FrameRequestCallback }> = [];
    let nextId = 1;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      queued.push({ id: nextId, cb });
      return nextId++;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      queued = queued.filter((q) => q.id !== id);
    });
    const tick = (time: number) => {
      const frames = queued;
      queued = [];
      frames.forEach((f) => f.cb(time));
    };
    const deltas: number[] = [];
    const { rerender } = renderHook((running: boolean) => useRafLoop((dt) => deltas.push(dt), running), true);
    tick(1000);
    tick(1016);
    tick(6000);
    expect(deltas).toEqual([0, 16, MAX_FRAME_MS]);
    rerender(false);
    expect(queued).toHaveLength(0);
    tick(7000);
    expect(deltas).toHaveLength(3);
    rerender(true);
    tick(8000);
    // A restarted loop begins with a zero delta rather than the time spent stopped.
    expect(deltas[3]).toBe(0);
  });
});

describe('useWakeLock', () => {
  it('reports unsupported browsers without throwing', () => {
    const { result } = renderHook((on: boolean) => useWakeLock(on), true);
    expect(result.current).toEqual({ supported: false, held: false });
  });

  it('holds the lock while active and releases it afterwards', async () => {
    const release = vi.fn(async function (this: { released: boolean }) {
      this.released = true;
    });
    const request = vi.fn(async () => ({ released: false, release, addEventListener: () => {} }));
    vi.stubGlobal('navigator', { ...navigator, wakeLock: { request } });
    const { result, rerender } = renderHook((on: boolean) => useWakeLock(on), false);
    expect(result.current).toEqual({ supported: true, held: false });
    rerender(true);
    await act(async () => {
      await Promise.resolve();
    });
    expect(request).toHaveBeenCalledWith('screen');
    expect(result.current.held).toBe(true);
    rerender(false);
    expect(release).toHaveBeenCalledTimes(1);
    expect(result.current.held).toBe(false);
  });

  it('carries on when the request is refused', async () => {
    const request = vi.fn(async () => {
      throw new DOMException('denied', 'NotAllowedError');
    });
    vi.stubGlobal('navigator', { ...navigator, wakeLock: { request } });
    const { result } = renderHook((on: boolean) => useWakeLock(on), true);
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toEqual({ supported: true, held: false });
  });
});

describe('scroll lock', () => {
  it('counts nested locks and restores the original overflow', () => {
    const root = document.documentElement;
    root.style.overflow = 'auto';
    const a = lockScroll();
    const b = lockScroll();
    expect(root.style.overflow).toBe('hidden');
    a();
    a();
    expect(root.style.overflow).toBe('hidden');
    b();
    expect(root.style.overflow).toBe('auto');
    root.style.overflow = '';
  });

  it('useScrollLock follows its flag', () => {
    const { rerender, unmount } = renderHook((on: boolean) => useScrollLock(on), false);
    expect(document.documentElement.style.overflow).toBe('');
    rerender(true);
    expect(document.documentElement.style.overflow).toBe('hidden');
    unmount();
    expect(document.documentElement.style.overflow).toBe('');
  });
});

describe('focus helpers', () => {
  function fixture() {
    const root = document.createElement('div');
    root.tabIndex = -1;
    root.innerHTML = `
      <button id="a">A</button>
      <button id="off" disabled>off</button>
      <a id="plain">no href</a>
      <a id="link" href="#x">link</a>
      <input id="hidden" type="hidden" />
      <input id="text" />
      <div id="neg" tabindex="-1">neg</div>
      <div hidden><button id="in-hidden">x</button></div>
      <span id="custom" tabindex="0">custom</span>
      <input type="radio" name="g" id="r1" /><input type="radio" name="g" id="r2" checked /><input type="radio" name="g" id="r3" />
      <button id="z">Z</button>`;
    document.body.appendChild(root);
    return root;
  }

  it('lists tabbable elements in order, treating a radio group as one stop', () => {
    const ids = getTabbables(fixture()).map((el) => el.id);
    expect(ids).toEqual(['a', 'link', 'text', 'custom', 'r2', 'z']);
  });

  it('wraps Tab at both ends and catches escaped focus', () => {
    const root = fixture();
    const a = root.querySelector('#a')!;
    const z = root.querySelector('#z')!;
    const text = root.querySelector('#text')!;
    expect(trapTabTarget(root, z, false)).toBe(a);
    expect(trapTabTarget(root, a, true)).toBe(z);
    expect(trapTabTarget(root, text, false)).toBeNull();
    expect(trapTabTarget(root, text, true)).toBeNull();
    expect(trapTabTarget(root, document.body, false)).toBe(a);
    expect(trapTabTarget(root, document.body, true)).toBe(z);
    expect(trapTabTarget(root, root, true)).toBe(z);
  });

  it('falls back to the container when nothing is tabbable', () => {
    const empty = document.createElement('div');
    empty.innerHTML = '<p>text only</p>';
    document.body.appendChild(empty);
    expect(trapTabTarget(empty, null, false)).toBe(empty);
    expect(initialFocusTarget(empty)).toBe(empty);
  });

  it('prefers [data-autofocus] for the initial focus', () => {
    const root = fixture();
    expect(initialFocusTarget(root).id).toBe('a');
    root.querySelector('#text')!.setAttribute('data-autofocus', '');
    expect(initialFocusTarget(root).id).toBe('text');
  });
});

describe('useFocusTrap', () => {
  function Dialog({ open }: { open: boolean }) {
    const ref = useRef<HTMLDivElement | null>(null);
    useFocusTrap(ref, open);
    return open ? (
      <div ref={ref} tabIndex={-1}>
        <button id="first">first</button>
        <button id="last">last</button>
      </div>
    ) : null;
  }

  it('moves focus in, wraps Tab, and restores focus on close', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const view = mount(<Dialog open />);
    expect(document.activeElement?.id).toBe('first');
    (view.el.querySelector('#last') as HTMLElement).focus();
    const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.activeElement!.dispatchEvent(forward);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe('first');
    const back = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    document.activeElement!.dispatchEvent(back);
    expect(document.activeElement?.id).toBe('last');
    view.rerender(<Dialog open={false} />);
    expect(document.activeElement).toBe(opener);
  });
});

describe('useFocusTrap with a layer above', () => {
  function Dialog() {
    const ref = useRef<HTMLDivElement | null>(null);
    useFocusTrap(ref, true);
    return (
      <div ref={ref} tabIndex={-1}>
        <button id="inside">inside</button>
      </div>
    );
  }

  it('leaves Tab alone while focus is in a popover or menu portalled outside the dialog', () => {
    mount(<Dialog />);
    const layer = document.createElement('div');
    layer.setAttribute('data-ui-layer', 'popover');
    layer.innerHTML = '<button id="in-layer">a</button><button id="in-layer-2">b</button>';
    document.body.appendChild(layer);
    (layer.querySelector('#in-layer') as HTMLElement).focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.activeElement!.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    expect(document.activeElement?.id).toBe('in-layer');
    // Focus that escapes anywhere else is still pulled back in.
    const stray = document.createElement('button');
    document.body.appendChild(stray);
    stray.focus();
    const tab2 = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    stray.dispatchEvent(tab2);
    expect(tab2.defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe('inside');
  });
});

describe('usePressHold', () => {
  beforeEach(() => vi.useFakeTimers());

  function Hold({ onStep, disabled }: { onStep: () => void; disabled?: boolean }) {
    const handlers = usePressHold(onStep, { disabled, timing: { initialDelayMs: 400, intervalMs: 100, minIntervalMs: 100, acceleration: 1 } });
    return (
      <button id="hold" {...handlers}>
        +
      </button>
    );
  }
  const pointer = (type: string) => {
    const Ctor = typeof PointerEvent === 'undefined' ? MouseEvent : PointerEvent;
    return new Ctor(type, { bubbles: true, cancelable: true, button: 0 });
  };

  it('acts at once, repeats while held, and stops on release', () => {
    const step = vi.fn();
    const view = mount(<Hold onStep={step} />);
    const button = view.el.querySelector('#hold')!;
    act(() => void button.dispatchEvent(pointer('pointerdown')));
    expect(step).toHaveBeenCalledTimes(1);
    act(() => void vi.advanceTimersByTime(399));
    expect(step).toHaveBeenCalledTimes(1);
    act(() => void vi.advanceTimersByTime(1));
    expect(step).toHaveBeenCalledTimes(2);
    act(() => void vi.advanceTimersByTime(300));
    expect(step).toHaveBeenCalledTimes(5);
    act(() => void button.dispatchEvent(pointer('pointerup')));
    act(() => void vi.advanceTimersByTime(1000));
    expect(step).toHaveBeenCalledTimes(5);
  });

  it('does not double-count the click that follows a pointer press, but honours keyboard clicks', () => {
    const step = vi.fn();
    const view = mount(<Hold onStep={step} />);
    const button = view.el.querySelector('#hold')!;
    act(() => void button.dispatchEvent(pointer('pointerdown')));
    act(() => void button.dispatchEvent(pointer('pointerup')));
    act(() => void button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })));
    expect(step).toHaveBeenCalledTimes(1);
    // Enter / Space arrive as a click with detail 0.
    act(() => void button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })));
    expect(step).toHaveBeenCalledTimes(2);
  });

  it('stops repeating when it becomes disabled, and ignores presses while disabled', () => {
    const step = vi.fn();
    const view = mount(<Hold onStep={step} />);
    const button = view.el.querySelector('#hold')!;
    act(() => void button.dispatchEvent(pointer('pointerdown')));
    act(() => void vi.advanceTimersByTime(500));
    const before = step.mock.calls.length;
    view.rerender(<Hold onStep={step} disabled />);
    act(() => void vi.advanceTimersByTime(1000));
    expect(step).toHaveBeenCalledTimes(before);
    act(() => void button.dispatchEvent(pointer('pointerdown')));
    expect(step).toHaveBeenCalledTimes(before);
  });
});

describe('useDismiss', () => {
  function Pop({ onDismiss, active = true }: { onDismiss: (reason: string) => void; active?: boolean }) {
    const ref = useRef<HTMLDivElement | null>(null);
    useDismiss([ref], active, onDismiss);
    return (
      <div>
        <div ref={ref} id="inside">
          inside
        </div>
        <div id="outside">outside</div>
      </div>
    );
  }
  const pointerDown = () => {
    const Ctor = typeof PointerEvent === 'undefined' ? MouseEvent : PointerEvent;
    return new Ctor('pointerdown', { bubbles: true });
  };

  it('dismisses on Escape and on a press outside, not inside', () => {
    const reasons: string[] = [];
    const view = mount(<Pop onDismiss={(r) => reasons.push(r)} />);
    view.el.querySelector('#inside')!.dispatchEvent(pointerDown());
    expect(reasons).toEqual([]);
    view.el.querySelector('#outside')!.dispatchEvent(pointerDown());
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(reasons).toEqual(['outside', 'escape']);
  });

  it('does nothing while inactive', () => {
    const onDismiss = vi.fn();
    const view = mount(<Pop onDismiss={onDismiss} active={false} />);
    view.el.querySelector('#outside')!.dispatchEvent(pointerDown());
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
