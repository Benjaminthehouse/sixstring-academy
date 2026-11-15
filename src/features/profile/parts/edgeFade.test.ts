import { describe, expect, it } from 'vitest';
import { edgeFade } from './edgeFade';

// Review: on a phone the strip of links showed Overview, Achievements and Shop with nothing to say
// that Settings, Your data and About were further along; the edge with more beyond it now fades.
describe('edge fade of a scrolling row', () => {
  it('fades only the end at the start of a row that overflows', () => {
    expect(edgeFade({ scrollLeft: 0, scrollWidth: 620, clientWidth: 390 })).toEqual({ start: false, end: true });
  });

  it('fades both edges in the middle and only the start at the end', () => {
    expect(edgeFade({ scrollLeft: 100, scrollWidth: 620, clientWidth: 390 })).toEqual({ start: true, end: true });
    expect(edgeFade({ scrollLeft: 230, scrollWidth: 620, clientWidth: 390 })).toEqual({ start: true, end: false });
    // Sub-pixel rounding at the far end does not leave a fade behind.
    expect(edgeFade({ scrollLeft: 228.5, scrollWidth: 620, clientWidth: 390 })).toEqual({ start: true, end: false });
  });

  it('does not fade a row that fits', () => {
    expect(edgeFade({ scrollLeft: 0, scrollWidth: 390, clientWidth: 390 })).toEqual({ start: false, end: false });
    expect(edgeFade({ scrollLeft: 0, scrollWidth: 392, clientWidth: 390 })).toEqual({ start: false, end: false });
  });
});
