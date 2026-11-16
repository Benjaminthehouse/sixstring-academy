import { describe, expect, it } from 'vitest';
import { WIDE_MIN_REM, cameraLayout } from './layout';

describe('cameraLayout', () => {
  it('puts the controls beside the picture on a desktop with normal text', () => {
    // 1280 px window, sidebar and gutters taken: about 980 px of layout at 16 px text.
    expect(cameraLayout({ wideViewport: true, sideways: false, widthPx: 980, remPx: 16 })).toBe('wide');
  });

  it('stacks them on the same desktop with text at 200 percent (the Root select had no room)', () => {
    // The same window at a 32 px root: the shell's sidebar doubles, about 670 px are left (21 rem).
    expect(cameraLayout({ wideViewport: true, sideways: false, widthPx: 670, remPx: 32 })).toBe('stacked');
    expect(670 / 32).toBeLessThan(WIDE_MIN_REM);
  });

  it('follows the viewport queries otherwise', () => {
    expect(cameraLayout({ wideViewport: false, sideways: false, widthPx: 2000, remPx: 16 })).toBe('stacked');
    expect(cameraLayout({ wideViewport: true, sideways: true, widthPx: 800, remPx: 16 })).toBe('sideways');
    // Before the first measurement, the viewport query decides (no flash of the stacked layout).
    expect(cameraLayout({ wideViewport: true, sideways: false, widthPx: 0, remPx: 16 })).toBe('wide');
  });
});
