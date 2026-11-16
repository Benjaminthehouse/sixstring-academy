import { describe, expect, it } from 'vitest';
import { nudgePose, poseFromWireTaps, scalePose, shiftNumbering, type FretboardPose } from '@/core/vision';
import { DrawnPoses, OFF_GHOST, OFF_SOLID, SOLID_AFTER, TRAIL_GHOST, TRAIL_SOLID, TRUSTED, drawnOffset, expectedTrail, nextDrawnTrust, nextMotion, trailTooLong, type DrawnTrust } from './honesty';

function pose(): FretboardPose {
  const p = poseFromWireTaps({ fret: 0, ends: [{ x: 560, y: 150 }, { x: 560, y: 186 }] }, { fret: 12, ends: [{ x: 130, y: 145 }, { x: 130, y: 191 }] }, 640, 360, { model: 'steel' });
  if (!p) throw new Error('no pose');
  return p;
}

describe('honesty: were the drawn dots where the neck was?', () => {
  it('measures the offset of a drawn pose in string spacings', () => {
    const p = pose();
    expect(drawnOffset(p, p)).toBeCloseTo(0, 6);
    // A pose drawn 0.6 of a string spacing across the neck from where the tracker found it.
    expect(drawnOffset(nudgePose(p, { acrossStrings: 0.6 }), p)).toBeGreaterThan(0.5);
    expect(drawnOffset(nudgePose(p, { acrossStrings: 0.6 }), p)).toBeLessThan(0.75);
    expect(drawnOffset(nudgePose(p, { acrossStrings: 0.1 }), p)).toBeLessThan(OFF_GHOST);
  });

  it('measures where the notes are: a turn about their frets does not count against them', () => {
    const p = pose();
    // nudgePose turns about the middle of the frets in view.
    const mid = Math.round((p.visibleFrets.min + p.visibleFrets.max) / 2);
    const turned = nudgePose(p, { rotateDeg: 1.5 });
    const there = [{ string: 6, fret: mid }, { string: 1, fret: mid + 1 }];
    const away = [{ string: 6, fret: 1 }, { string: 1, fret: 2 }];
    expect(drawnOffset(turned, p, away)).toBeGreaterThan(2 * drawnOffset(turned, p, there));
    // No notes: the board in view, so at least as far off as anywhere the notes could be.
    expect(drawnOffset(turned, p, [])).toBeGreaterThanOrEqual(drawnOffset(turned, p, there));
  });

  it('a pose numbered a fret off is far off; a different working size is not', () => {
    const p = pose();
    expect(drawnOffset(shiftNumbering(p, 1), p)).toBeGreaterThan(1);
    // The tracker went from 640 to 544 pixels wide between drawing and answering: same neck.
    expect(drawnOffset(scalePose(p, 544 / 640), p)).toBeCloseTo(0, 4);
    expect(drawnOffset(p, scalePose(p, 544 / 640))).toBeCloseTo(0, 4);
  });

  it('turns to outlines at once, and back to solid only once the dots are well on target', () => {
    let t: DrawnTrust = TRUSTED;
    t = nextDrawnTrust(t, 0.1);
    expect(t.behind).toBe(false);
    t = nextDrawnTrust(t, OFF_GHOST + 0.05);
    expect(t.behind).toBe(true);
    // Nothing measured: no change.
    expect(nextDrawnTrust(t, NaN)).toBe(t);
    // In between the two thresholds: still outlines, and the count starts again.
    t = nextDrawnTrust(t, (OFF_SOLID + OFF_GHOST) / 2);
    expect(t).toEqual({ behind: true, good: 0 });
    for (let i = 0; i < SOLID_AFTER - 1; i++) {
      t = nextDrawnTrust(t, OFF_SOLID - 0.05);
      expect(t.behind).toBe(true);
    }
    t = nextDrawnTrust(t, OFF_SOLID - 0.05);
    expect(t).toEqual(TRUSTED);
    expect(OFF_SOLID).toBeLessThan(OFF_GHOST);
    // Half a string spacing off is on the neighbouring string: never solid.
    expect(OFF_GHOST).toBeLessThanOrEqual(0.5);
  });

  it('expects a trail from the speed and the delay of the answers', () => {
    // 200 px/s, answers 40 ms late, strings 10 px apart: 0.8 of a string behind.
    expect(expectedTrail(200, 40, 10)).toBeCloseTo(0.8);
    expect(expectedTrail(200, 40, 10)).toBeGreaterThan(TRAIL_GHOST);
    // The same speed on a fast device (10 ms) stays solid.
    expect(expectedTrail(200, 10, 10)).toBeLessThan(TRAIL_GHOST);
    expect(expectedTrail(NaN, 40, 10)).toBe(0);
    expect(expectedTrail(200, 40, NaN)).toBe(0);
    // Hysteresis: outlines from TRAIL_GHOST, solid again only below TRAIL_SOLID.
    expect(trailTooLong(false, TRAIL_GHOST + 0.01)).toBe(true);
    expect(trailTooLong(true, TRAIL_GHOST - 0.01)).toBe(true);
    expect(trailTooLong(true, TRAIL_SOLID - 0.01)).toBe(false);
    expect(trailTooLong(false, TRAIL_GHOST - 0.01)).toBe(false);
  });

  it('follows the neck between answers: speed in pixels per second', () => {
    const p = pose();
    let m = nextMotion(null, p, 1000);
    expect(m).toMatchObject({ speed: 0 });
    // The neck moves 0.5 of a string spacing (about 3.6 px here) in 100 ms.
    const moved = nudgePose(p, { acrossStrings: 0.5 });
    m = nextMotion(m, moved, 1100);
    expect(m!.speed).toBeGreaterThan(5);
    const first = m!.speed;
    // Holding still, the speed decays.
    m = nextMotion(m, moved, 1200);
    expect(m!.speed).toBeLessThan(first);
    // No board: no motion.
    expect(nextMotion(m, null, 1300)).toBeNull();
  });

  it('finds the pose drawn on a frame by its time', () => {
    const drawn = new DrawnPoses(3);
    const a = pose();
    const b = nudgePose(a, { acrossStrings: 1 });
    drawn.push(1000, a);
    drawn.push(1033.3, b);
    expect(drawn.at(1033.3)).toBe(b);
    expect(drawn.at(1000)).toBe(a);
    expect(drawn.at(1016)).toBeNull();
    drawn.push(1066.6, a);
    drawn.push(1100, a);
    // Only the newest three are kept.
    expect(drawn.at(1000)).toBeNull();
    drawn.clear();
    expect(drawn.at(1100)).toBeNull();
  });
});
