// @vitest-environment jsdom
/**
 * The end of a unit says what the learner did once: the teacher's words. Review bug: after a show
 * answered by tapping, "You know Hot Cross Buns from start to finish." sat right above Mia's
 * "You know how Hot Cross Buns goes, start to finish ...".
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PROFILES, assembleCourse, type TeacherUnit } from '@/content/teachers';
import { UnitComplete } from './UnitComplete';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const unit: TeacherUnit = {
  id: 'mia-hello-guitar',
  title: 'Hello, guitar',
  theme: 'basics',
  description: 'Hold the guitar, tune it and play a first tune.',
  lessons: [],
  milestone: { lesson: 'first-week-show', step: 'show', piece: 'Hot Cross Buns', song: 'hot-cross-buns', celebrate: 'You played a whole tune, start to finish, and kept going.' },
};
const tc = assembleCourse('mia', new Map([[unit.id, unit]]));

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

const count = (text: string, needle: RegExp) => (text.match(needle) ?? []).length;

describe('the end of a unit', () => {
  it('after a tapped show, says "you know it" once, in the teacher\'s words', () => {
    act(() => root.render(<UnitComplete teacher="mia" unit={unit} milestone={unit.milestone!} tc={tc} played={false} />));
    const text = host.textContent ?? '';
    expect(text).toContain(PROFILES.mia.tappedShow.replace('{piece}', 'Hot Cross Buns'));
    expect(count(text, /you know/gi)).toBe(1);
    expect(count(text, /start to finish/gi)).toBe(1);
    expect(text).not.toMatch(/you played|you performed/i);
    expect(host.querySelector('[data-played="tapped"]')?.textContent).toBe('Your show: Hot Cross Buns');
  });

  it('after a show the microphone heard, gives the celebration once', () => {
    act(() => root.render(<UnitComplete teacher="mia" unit={unit} milestone={unit.milestone!} tc={tc} played />));
    const text = host.textContent ?? '';
    expect(text).toContain('You played a whole tune, start to finish');
    expect(count(text, /start to finish/gi)).toBe(1);
    expect(host.querySelector('[data-played="mic"]')).not.toBeNull();
  });
});
