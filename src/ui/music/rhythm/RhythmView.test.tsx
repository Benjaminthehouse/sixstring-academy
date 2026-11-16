// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { RhythmView } from './RhythmView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

/** The count row of the first bar, as printed. */
const counts = () => [...host!.querySelectorAll('[class*="bar"]')][0].querySelectorAll('[class*="count"]');
const printed = () => [...counts()].map((c) => c.textContent);

describe('RhythmView counting', () => {
  it('keeps every eighth name in a 6/8 bar with sixteenths ("1 & a" under a dotted quarter)', () => {
    mount(<RhythmView rhythm="q. e s s e" time="6/8" />);
    expect(printed()).toEqual(['1', 'ta', '&', 'ta', 'a', 'ta', '2', 'ta', '&', 'ta', 'a', 'ta']);
  });

  it('says only the beats and what is played when eighths sit beside triplets (24 steps)', () => {
    mount(<RhythmView rhythm="e e et et et h" />);
    expect(printed().filter(Boolean)).toEqual(['1', '&', '2', 'trip', 'let', '3', '4']);
  });
});
