// @vitest-environment jsdom
import { act, memo } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scaleMarkers } from './markers';
import type { FretMarker } from './markers';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Count how often a marker actually renders: the board must pass props a memo can compare.
const renders = vi.hoisted(() => ({ count: 0 }));
vi.mock('./Marker', async (importOriginal) => {
  const real = await importOriginal<typeof import('./Marker')>();
  const Inner = (real.Marker as unknown as { type: (p: import('./Marker').MarkerProps) => JSX.Element }).type;
  return {
    ...real,
    Marker: memo(function CountedMarker(p: import('./Marker').MarkerProps) {
      renders.count++;
      return Inner(p);
    }),
  };
});

const { Fretboard, markerDescription } = await import('./Fretboard');

let root: Root | null = null;
let host: HTMLDivElement | null = null;
function mount(node: JSX.Element) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('Fretboard markers', () => {
  it('re-renders only the marker that changed when a game passes a fresh array', () => {
    const base = (): FretMarker[] => scaleMarkers('C', 'major', { maxFret: 12 }).map((m) => ({ ...m }));
    const first = base();
    mount(<Fretboard frets={[0, 12]} markers={first} />);
    expect(first.length).toBeGreaterThan(40);
    renders.count = 0;
    // A new array of new objects, equal except one marker becomes the target.
    const next = base();
    next[5] = { ...next[5], state: 'target' };
    act(() => root!.render(<Fretboard frets={[0, 12]} markers={next} />));
    expect(renders.count).toBe(1);
  });

  it('pulses a target with an HTML ring over the board, not by animating the SVG', () => {
    mount(<Fretboard frets={[0, 5]} markers={[{ string: 3, fret: 2, label: '?', color: 'accent', state: 'target' }]} />);
    const svg = host!.querySelector('svg')!;
    expect(svg.querySelectorAll('[class*="pulse"]').length).toBe(0);
    const rings = host!.querySelectorAll('span[class*="pulse"]');
    expect(rings.length).toBe(1);
    expect(rings[0].parentElement!.getAttribute('aria-hidden')).toBe('true');
  });

  it('describes every marker for a screen reader, however many there are', () => {
    const markers = scaleMarkers('C', 'major', { maxFret: 24 });
    expect(markers.length).toBeGreaterThan(48);
    const text = markerDescription(markers, 'letters');
    expect(text).not.toMatch(/more/);
    // Every marker is in it, in the order given, in the phrase screens rely on.
    expect(text.split('; ')).toHaveLength(markers.length);
    expect(text).toMatch(/^E on string 6 open \(degree 3\); F on string 6 fret 1 \(degree 4\)/);
    expect(text).toContain('C on string 5 fret 3 (root)');
    const last = markers[markers.length - 1];
    expect(text.endsWith(`on string ${last.string} fret ${last.fret} (${last.description})`)).toBe(true);
    mount(<Fretboard frets={[0, 24]} markers={markers} />);
    expect(host!.querySelector('svg desc')!.textContent).toBe(text);
  });
});
