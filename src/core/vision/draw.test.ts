import { describe, expect, it } from 'vitest';
import { poseFromTaps } from './calibration';
import { PLAIN_PALETTE, drawVisionOverlay, type OverlayNote } from './draw';
import { placeMarkers, poseForDisplay } from './overlay';
import type { FretboardPose } from './types';

const W = 640;
const H = 360;

/** A neck seen front-on, nut on the right, frets 0-14 or so in view. */
function pose(): FretboardPose {
  return poseFromTaps({ nut: [{ x: 600, y: 140 }, { x: 602, y: 180 }], fret: [{ x: 250, y: 146 }, { x: 253, y: 196 }] }, W, H) as FretboardPose;
}

interface Call {
  name: string;
  args: unknown[];
}

/** A CanvasRenderingContext2D stand-in that records what is drawn. */
function recorder(): { ctx: CanvasRenderingContext2D; calls: Call[]; texts: () => string[] } {
  const calls: Call[] = [];
  const state = { font: '10px sans-serif', globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, textAlign: 'start', textBaseline: 'alphabetic', lineJoin: 'miter' };
  const stack: (typeof state)[] = [];
  const record =
    (name: string) =>
    (...args: unknown[]): void => {
      calls.push({ name, args: [...args, { fillStyle: state.fillStyle, strokeStyle: state.strokeStyle, alpha: state.globalAlpha }] });
    };
  const ctx = {
    ...Object.fromEntries(['setTransform', 'clearRect', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'stroke', 'fill', 'arc', 'arcTo', 'fillRect', 'setLineDash', 'fillText'].map((n) => [n, record(n)])),
    save: () => stack.push({ ...state }),
    restore: () => Object.assign(state, stack.pop()),
    measureText: (text: string) => ({ width: text.length * 7 }),
  } as Record<string, unknown>;
  for (const key of Object.keys(state) as (keyof typeof state)[]) {
    Object.defineProperty(ctx, key, { get: () => state[key], set: (v) => ((state as Record<string, unknown>)[key] = v) });
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, texts: () => calls.filter((c) => c.name === 'fillText').map((c) => String(c.args[0])) };
}

const NOTES: OverlayNote[] = [
  { string: 6, fret: 5, label: 'R', degree: 1 },
  { string: 5, fret: 7, label: '4', degree: 4 },
  { string: 4, fret: 7, label: 'b7', degree: 7, target: true },
  { string: 3, fret: 0, label: 'G' },
];

describe('drawVisionOverlay', () => {
  it('draws only the indicator while searching', () => {
    const r = recorder();
    const out = drawVisionOverlay(r.ctx, { view: { width: W, height: H }, pose: null, state: 'searching', confidence: 0 });
    expect(out.markers).toEqual([]);
    expect(out.pose).toBeNull();
    expect(r.texts()).toEqual(['Looking for the neck']);
    expect(r.calls.filter((c) => c.name === 'arc')).toHaveLength(0);
  });

  it('puts every note where placeMarkers says, with its label and degree colour', () => {
    const r = recorder();
    const view = { width: 800, height: 450 };
    const out = drawVisionOverlay(r.ctx, { view, pose: pose(), notes: NOTES, state: 'locked', confidence: 0.9, timeMs: 250 });
    const expected = placeMarkers(poseForDisplay(pose(), view), NOTES);
    expect(out.markers).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      expect(out.markers[i].x).toBeCloseTo(expected[i].x, 6);
      expect(out.markers[i].y).toBeCloseTo(expected[i].y, 6);
      expect(out.markers[i].radius).toBeGreaterThanOrEqual(6);
    }
    const texts = r.texts();
    for (const label of ['R', '4', 'b7', 'G', 'Locked']) expect(texts).toContain(label);
    // Fret numbers at the inlay frets in view, string names behind the nut.
    for (const label of ['3', '5', '7', '9', '12', 'E', 'A', 'D', 'B']) expect(texts).toContain(label);
    // The root dot is filled with the degree-1 colour, the b7 with degree 7.
    const fills = r.calls.filter((c) => c.name === 'fill').map((c) => (c.args.at(-1) as { fillStyle: string }).fillStyle);
    expect(fills).toContain(PLAIN_PALETTE.degree[1]);
    expect(fills).toContain(PLAIN_PALETTE.degree[7]);
    // The target gets a pulse ring larger than its dot.
    const target = out.markers[2];
    const rings = r.calls.filter((c) => c.name === 'arc' && Math.abs((c.args[0] as number) - target.x) < 1e-6 && (c.args[2] as number) > target.radius * 1.1);
    expect(rings.length).toBeGreaterThanOrEqual(1);
  });

  it('mirrors positions for a selfie display but never the text, and applies the pixel ratio', () => {
    const plain = recorder();
    const flipped = recorder();
    const a = drawVisionOverlay(plain.ctx, { view: { width: W, height: H }, pose: pose(), notes: NOTES, state: 'locked', dpr: 2 });
    const b = drawVisionOverlay(flipped.ctx, { view: { width: W, height: H, mirrored: true }, pose: pose(), notes: NOTES, state: 'locked', dpr: 2 });
    for (let i = 0; i < a.markers.length; i++) {
      expect(b.markers[i].x).toBeCloseTo(W - a.markers[i].x, 6);
      expect(b.markers[i].y).toBeCloseTo(a.markers[i].y, 6);
    }
    expect(flipped.texts().sort()).toEqual(plain.texts().sort());
    expect(flipped.calls[0]).toMatchObject({ name: 'setTransform', args: [2, 0, 0, 2, 0, 0, expect.anything()] });
  });

  it('handles object-fit cover, guesses, faded lost boards and notes out of view', () => {
    const r = recorder();
    const view = { width: 400, height: 400, fit: 'cover' as const };
    const notes: OverlayNote[] = [{ string: 1, fret: 1, label: 'x' }, { string: 6, fret: 20, label: 'far' }];
    const out = drawVisionOverlay(r.ctx, { view, pose: pose(), notes, state: 'lost', confidence: 0.2, numberingGuess: true, reducedMotion: true });
    // Cover crops the sides: the nut end (x near 600 of 640) falls outside a square box.
    expect(out.markers.map((m) => m.note.label)).not.toContain('x');
    expect(r.texts()).toContain('Lost it');
    expect(r.texts().some((t) => t.endsWith('?'))).toBe(true);
    const alphas = r.calls.filter((c) => c.name === 'stroke').map((c) => (c.args.at(-1) as { alpha: number }).alpha);
    expect(Math.max(...alphas)).toBeLessThan(0.5);
  });
});
