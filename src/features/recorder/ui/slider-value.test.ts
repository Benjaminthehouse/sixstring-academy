import { describe, expect, it } from 'vitest';
import { showSliderSeconds, type SliderElement } from './slider-value';

/** An element with attributes, as React and the waveform both write them. */
function element(initial: Record<string, string> = {}): SliderElement & { attrs: Map<string, string> } {
  const attrs = new Map(Object.entries(initial));
  return {
    attrs,
    getAttribute: (name) => attrs.get(name) ?? null,
    setAttribute: (name, value) => {
      attrs.set(name, value);
    },
  };
}

describe('waveform slider value', () => {
  it('shows whole seconds with a spoken text', () => {
    const el = element();
    expect(showSliderSeconds(el, 65.7, 120)).toBe(true);
    expect(el.attrs.get('aria-valuenow')).toBe('65');
    expect(el.attrs.get('aria-valuetext')).toBe('1 minute 5 seconds of 2 minutes');
  });

  it('writes only when the second changes (it runs every frame while playing)', () => {
    const el = element();
    showSliderSeconds(el, 2.1, 10);
    expect(showSliderSeconds(el, 2.9, 10)).toBe(false);
    expect(showSliderSeconds(el, 3.0, 10)).toBe(true);
  });

  it('still writes a second it wrote before once something else changed the element (playback ended, React put 0 back)', () => {
    const el = element();
    showSliderSeconds(el, 2.4, 2.6);
    // Playback ends: the screen re-renders the slider at the start.
    el.setAttribute('aria-valuenow', '0');
    el.setAttribute('aria-valuetext', '0 seconds of 2 seconds');
    // The learner taps near the end again, while paused.
    expect(showSliderSeconds(el, 2.3, 2.6)).toBe(true);
    expect(el.attrs.get('aria-valuenow')).toBe('2');
  });

  it('treats a bad position as the start', () => {
    const el = element({ 'aria-valuenow': '4' });
    showSliderSeconds(el, Number.NaN, 10);
    expect(el.attrs.get('aria-valuenow')).toBe('0');
  });
});
