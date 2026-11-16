// @vitest-environment jsdom
/**
 * A teacher card's title is rich text, like its body: Dev's "The A shape for {c:D7} and {c:E7}"
 * showed its markup on screen before, braces and all.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CardStep } from '@/lessons';
import { TeacherCard } from './Steps';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('a teacher card', () => {
  it('renders markup in its title as chord names, not as raw braces', () => {
    const card = { id: 'shapes', kind: 'card', title: 'The A shape for {c:D7} and {c:E7}', body: 'Slide the shape up.' } as unknown as CardStep;
    act(() => root.render(<TeacherCard teacher="dev" card={card} />));
    const heading = host.querySelector('h2');
    expect(heading).not.toBeNull();
    expect(heading!.textContent).not.toMatch(/[{}]/);
    expect(heading!.textContent).toMatch(/D7/);
    expect(heading!.textContent).toMatch(/E7/);
  });
});
