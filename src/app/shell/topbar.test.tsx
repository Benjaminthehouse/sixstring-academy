// @vitest-environment jsdom
/**
 * The phone top bar repeats the screen's title once its heading is out of view. Review bug: the live
 * camera view hides its Page header when the camera starts (a screen-reader-only heading takes its
 * place, deep inside the screen), and the bar showed no title at scroll 0 because nothing re-checked.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHeadingOutOfView } from './TopBar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe() {
  const out = useHeadingOutOfView('camera/', 52);
  return <span data-out={out ? 'yes' : 'no'} />;
}

let root: Root;
let host: HTMLElement;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number);
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  // A visible heading is 40 px tall and on screen; a screen-reader-only one is 1 px.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const hidden = this.classList.contains('sr-only');
    return { top: hidden ? 0 : 140, bottom: hidden ? 1 : 180, height: hidden ? 1 : 40, left: 0, right: 100, width: 100, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  });
  document.body.innerHTML = '<main id="main"><div data-ui-page=""><div id="head"><header><h1 class="title">Live Fretboard</h1></header></div></div></main><div id="bar"></div>';
  host = document.getElementById('bar')!;
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const out = () => host.querySelector('[data-out]')?.getAttribute('data-out');

describe('the title in the phone top bar', () => {
  it('stays out while the screen shows its own heading', async () => {
    act(() => root.render(<Probe />));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(out()).toBe('no');
  });

  it('comes in at scroll 0 when the screen hides its header part-way, deep inside the page', async () => {
    act(() => root.render(<Probe />));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(out()).toBe('no');
    // The camera starts: the Page swaps its header for a screen-reader-only h1 (not a child of <main>).
    await act(async () => {
      document.getElementById('head')!.innerHTML = '<h1 class="sr-only">Live Fretboard</h1>';
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(out()).toBe('yes');
    // And back to the guide: the heading shows again, so the bar lets it be.
    await act(async () => {
      document.getElementById('head')!.innerHTML = '<header><h1 class="title">Live Fretboard</h1></header>';
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(out()).toBe('no');
  });
});
