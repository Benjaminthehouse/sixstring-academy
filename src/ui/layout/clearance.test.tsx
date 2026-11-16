// @vitest-environment jsdom
import { act, useRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bottomClearance, currentBottomClearance, toastColumn, useBottomClearance } from './clearance';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('bottomClearance', () => {
  // A 390 x 844 phone with a 60 px tab bar: the floor is at 784. Toasts use a 96 px zone.
  const floor = 784;
  const vh = 844;
  const zone = 96;

  it('claims the height of a bar stuck to the floor', () => {
    expect(bottomClearance({ top: 712, bottom: 784 }, floor, vh, zone)).toBe(72);
  });
  it('claims the room up to the top of controls that end just above the floor', () => {
    expect(bottomClearance({ top: 600, bottom: 760 }, floor, vh, zone)).toBe(184);
  });
  it('claims nothing for a bar that ends mid-screen or is scrolled below the floor', () => {
    expect(bottomClearance({ top: 300, bottom: 372 }, floor, vh, zone)).toBe(0);
    expect(bottomClearance({ top: 800, bottom: 872 }, floor, vh, zone)).toBe(0);
  });
  it('claims nothing for buttons beside the column toasts use (a tuner made static on the left of a wide screen)', () => {
    const column = toastColumn(1280, 16);
    expect(column).toEqual({ left: 840, right: 1256 });
    expect(bottomClearance({ top: 680, bottom: 732, left: 272, right: 880 }, 800, 800, zone, toastColumn(1280, 16))).toBe(120);
    expect(bottomClearance({ top: 680, bottom: 732, left: 272, right: 830 }, 800, 800, zone, column)).toBe(0);
    expect(toastColumn(390, 16)).toEqual({ left: 0, right: 390 });
  });
  it('claims nothing for an empty or hidden element, and never more than 60 % of the screen', () => {
    expect(bottomClearance({ top: 784, bottom: 784 }, floor, vh, zone)).toBe(0);
    expect(bottomClearance({ top: 0, bottom: 780 }, floor, vh, zone)).toBe(Math.round(vh * 0.6));
    expect(bottomClearance({ top: Number.NaN, bottom: 780 }, floor, vh, zone)).toBe(0);
  });
});

describe('useBottomClearance', () => {
  let root: Root | null = null;
  let el: HTMLElement | null = null;
  const mount = (node: ReactNode) => {
    el = document.createElement('div');
    document.body.appendChild(el);
    root = createRoot(el);
    act(() => root!.render(node));
  };
  afterEach(() => {
    act(() => root?.unmount());
    el?.remove();
    vi.restoreAllMocks();
  });

  function Controls({ active = true }: { active?: boolean }) {
    const ref = useRef<HTMLDivElement | null>(null);
    useBottomClearance(ref, active);
    return <div ref={ref}>Slower Tap Faster Start</div>;
  }

  it('publishes the room taken by bottom controls that are not an ActionBar, and takes it back', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 1024, height: 180, top: 568, bottom: 748, left: 0, right: 1024, x: 0, y: 568, toJSON: () => ({}) });
    mount(<Controls />);
    expect(currentBottomClearance()).toBe(200);
    expect(document.documentElement.style.getPropertyValue('--action-bar-h')).toBe('200px');
    act(() => root!.render(<Controls active={false} />));
    expect(document.documentElement.style.getPropertyValue('--action-bar-h')).toBe('');
  });

  it('marks <html> while the screen has bottom controls the kit knows about, stuck at the bottom or not', () => {
    // Mid-screen: no clearance claimed, but the screen still manages its bottom controls itself.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 390, height: 60, top: 200, bottom: 260, left: 0, right: 390, x: 0, y: 200, toJSON: () => ({}) });
    mount(<Controls />);
    expect(currentBottomClearance()).toBe(0);
    expect(document.documentElement.hasAttribute('data-ui-bottom-controls')).toBe(true);
    act(() => root!.render(<Controls active={false} />));
    expect(document.documentElement.hasAttribute('data-ui-bottom-controls')).toBe(false);
  });
});
