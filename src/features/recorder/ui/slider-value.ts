import { spokenDuration } from '../model/takes';

/** The two attributes the waveform slider needs (an element, or a fake in tests). */
export interface SliderElement {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
}

/**
 * Show `seconds` (whole seconds) as the slider's value, with its spoken text, unless the element
 * already shows that second. It compares with what the element says now, never with the last value
 * written here: a React render writes the same attribute (playback ending puts it back to 0), and a
 * remembered value would then skip the next seek to that second. Returns whether it wrote.
 */
export function showSliderSeconds(el: SliderElement, seconds: number, duration: number): boolean {
  const second = String(Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0)));
  if (el.getAttribute('aria-valuenow') === second) return false;
  el.setAttribute('aria-valuenow', second);
  el.setAttribute('aria-valuetext', `${spokenDuration(Number(second) * 1000)} of ${spokenDuration(duration * 1000)}`);
  return true;
}
