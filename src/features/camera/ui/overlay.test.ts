import { describe, expect, it } from 'vitest';
import { fretSpacingPx, poseFromWireTaps } from '@/core/vision';
import { MIN_NUMBERED_CELL, roomForEveryNumber } from './overlay';

describe('fret numbers on the live picture', () => {
  // A neck across a 640 x 360 working frame: nut on the right, 12th fret at x = 130.
  const pose = poseFromWireTaps({ fret: 0, ends: [{ x: 600, y: 160 }, { x: 600, y: 196 }] }, { fret: 12, ends: [{ x: 250, y: 155 }, { x: 250, y: 201 }] }, 640, 360, { model: 'steel' })!;

  it('numbers every fret on a big picture, only the inlay frets on a small phone picture', () => {
    expect(pose).not.toBeNull();
    const last = Math.min(pose.model.fretCount, pose.visibleFrets.max);
    const cell = fretSpacingPx(pose, last);
    // The same picture at full-screen desktop size, and in a 358 px wide phone stage.
    expect(cell * (1280 / 640)).toBeGreaterThanOrEqual(MIN_NUMBERED_CELL);
    expect(roomForEveryNumber(pose, { width: 1280, height: 720 })).toBe(true);
    expect(cell * (358 / 640)).toBeLessThan(MIN_NUMBERED_CELL);
    expect(roomForEveryNumber(pose, { width: 358, height: 201 })).toBe(false);
    // A tall box: the picture is fitted by its width.
    expect(roomForEveryNumber(pose, { width: 358, height: 2000 })).toBe(false);
  });

  it('nothing to measure: no numbers for every fret', () => {
    expect(roomForEveryNumber({ ...pose, frameWidth: 0 }, { width: 1280, height: 720 })).toBe(false);
  });
});
