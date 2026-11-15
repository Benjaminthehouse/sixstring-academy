/**
 * Behaviour of `FretboardTracker` (the app's full pipeline) in the situations a live camera keeps
 * producing, measured on the synthetic bench:
 *
 *  - a still guitar under webcam noise: how much the drawn markers jitter;
 *  - a long stream of scenes without a guitar (a camera panning over a room, people, shelves,
 *    blinds, striped shirts): it must never lock, and never show a confident board;
 *  - a full occlusion: how many frames until the markers are right again, numbers included;
 *  - graceful failure: no board for a while, or a board that keeps getting lost, asks for
 *    assisted calibration.
 *
 * Defaults are small enough for the regular suite. Longer runs (printed with --silent=false):
 *   HARDEN_SEEDS=0,1000,2000,3000,6000,7000 HARDEN_NEG=40 npx vitest run src/core/vision/hardening.test.ts --silent=false
 */
import { describe, expect, it } from 'vitest';
import { locatePixel, percentile, projectMarker } from './geometry';
import { createRenderCache, renderScene, truthForScene, type RenderCache } from './testing/render';
import { sampleNegativeScene, sampleScene } from './testing/scene';
import { buildSequence } from './testing/sequence';
import { diskFrameStore } from './testing/store';
import { FretboardTracker, type TrackerUpdate } from './tracker';
import type { Frame, FretboardPose } from './types';

const SEEDS = (process.env.HARDEN_SEEDS ?? '0').split(',').map(Number);
const NEG_SCENES = Number(process.env.HARDEN_NEG ?? 6);
const NEG_FRAMES = Number(process.env.HARDEN_NEG_FRAMES ?? 10);
const cache: RenderCache = createRenderCache(diskFrameStore());

/** Mean distance in pixels between the markers of two poses (visible cells, outer and middle strings). */
function markerShift(a: FretboardPose, b: FretboardPose): number {
  let sum = 0;
  let n = 0;
  const v = b.visibleFrets;
  for (const s of [1, 3, 6]) {
    for (let f = Math.max(1, v.min + 1); f <= v.max; f++) {
      const p = projectMarker(a, s, f);
      const q = projectMarker(b, s, f);
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (Number.isFinite(d)) {
        sum += d;
        n++;
      }
    }
  }
  return n ? sum / n : NaN;
}

/** Share of visible cells (strings 6, 4, 3, 1) whose marker lands in the right cell of the true board. */
function cells(pose: FretboardPose | null, truth: FretboardPose): number {
  if (!pose) return 0;
  let ok = 0;
  let n = 0;
  const v = truth.visibleFrets;
  for (const s of [6, 4, 3, 1]) {
    for (let f = Math.max(1, v.min + 1); f <= v.max; f++) {
      const loc = locatePixel(truth, projectMarker(pose, s, f));
      n++;
      if (loc && loc.onBoard && loc.string === s && loc.fret === f) ok++;
    }
  }
  return n ? ok / n : 0;
}

describe('a still guitar under webcam noise', () => {
  it('keeps the drawn markers steady', () => {
    const rows: string[] = [];
    const smooth: number[] = [];
    const raw: number[] = [];
    for (const offset of SEEDS) {
      const seq = buildSequence('still', { seedOffset: offset });
      // A noisy indoor webcam: read and shot noise of the hard tier and strong compression.
      for (const spec of seq.frames) spec.camera = { ...spec.camera, noise: 0.025, shot: 0.04, quality: 55 };
      const truth0 = truthForScene(seq.frames[0]).pose as FretboardPose;
      const tracker = new FretboardTracker({ ...truthForScene(seq.frames[0]).hints });
      tracker.calibrate(truth0, -33);
      let prev: TrackerUpdate | null = null;
      const s: number[] = [];
      const r: number[] = [];
      let right = 0;
      seq.frames.forEach((spec, i) => {
        const { frame, truth } = renderScene(spec, cache);
        const u = tracker.update(frame, i * 33.3);
        if (u.state === 'locked' && cells(u.pose, truth.pose as FretboardPose) >= 0.9) right++;
        if (prev?.pose && u.pose && i > 5) s.push(markerShift(prev.pose, u.pose));
        if (prev?.measured && u.measured && i > 5) r.push(markerShift(prev.measured, u.measured));
        prev = u;
      });
      smooth.push(percentile(s, 0.5));
      raw.push(percentile(r, 0.5));
      rows.push(`  seed offset ${offset}: drawn ${percentile(s, 0.5).toFixed(3)} px (p90 ${percentile(s, 0.9).toFixed(3)}), detector ${percentile(r, 0.5).toFixed(3)} px (p90 ${percentile(r, 0.9).toFixed(3)}); ${right}/${seq.frames.length} frames right`);
      expect(right).toBeGreaterThanOrEqual(seq.frames.length - 2);
    }
    console.log(`still-guitar jitter (median frame-to-frame marker motion, 640x360):\n${rows.join('\n')}`);
    for (let k = 0; k < SEEDS.length; k++) {
      expect(smooth[k]).toBeLessThan(0.3);
      expect(smooth[k]).toBeLessThanOrEqual(raw[k] + 1e-9);
    }
  }, 120_000);
});

/** Cheap per-frame variation of a rendered still: fresh sensor noise and a slow pan of a few pixels. */
function jiggle(base: Frame, out: Frame, dx: number, dy: number, seed: number): void {
  const w = base.width;
  const h = base.height;
  let r = seed >>> 0;
  for (let y = 0; y < h; y++) {
    const sy = Math.min(h - 1, Math.max(0, y + dy));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(w - 1, Math.max(0, x + dx));
      const i = (y * w + x) * 4;
      const j = (sy * w + sx) * 4;
      r = (Math.imul(r, 1664525) + 1013904223) >>> 0;
      const n = ((r >>> 24) - 128) / 32;
      out.data[i] = base.data[j] + n;
      out.data[i + 1] = base.data[j + 1] + n;
      out.data[i + 2] = base.data[j + 2] + n;
      out.data[i + 3] = 255;
    }
  }
}

describe('a long stream without a guitar', () => {
  it('never locks and never shows a confident board', () => {
    const tracker = new FretboardTracker({ model: 'steel' });
    const counts: Record<string, number> = { searching: 0, candidate: 0, locked: 0, lost: 0 };
    let confident = 0;
    let suggested = 0;
    let maxConfidence = 0;
    let t = 0;
    const work: Frame = { data: new Uint8ClampedArray(640 * 360 * 4), width: 640, height: 360 };
    const shown: string[] = [];
    for (let k = 0; k < NEG_SCENES; k++) {
      const spec = sampleNegativeScene(20000 + k * 7);
      const base = renderScene(spec, cache).frame;
      for (let i = 0; i < NEG_FRAMES; i++) {
        jiggle(base, work, Math.round(3 * Math.sin(i / 4)), Math.round(2 * Math.cos(i / 5)), k * 1000 + i);
        const u = tracker.update(work, (t += 33.3));
        counts[u.state]++;
        if (u.pose && u.confidence >= 0.5) confident++;
        if (u.pose) maxConfidence = Math.max(maxConfidence, u.confidence);
        if (u.suggestCalibration) suggested++;
        if (u.state !== 'searching' && !shown.includes(spec.label)) shown.push(spec.label);
      }
    }
    const frames = NEG_SCENES * NEG_FRAMES;
    console.log(`no guitar, ${NEG_SCENES} scenes x ${NEG_FRAMES} frames (${(frames / 30).toFixed(0)} s at 30 fps): ${JSON.stringify(counts)}, frames with a board at confidence >= 0.5: ${confident}, highest confidence shown ${maxConfidence.toFixed(2)}${shown.length ? ` (${shown.join(', ')})` : ''}; calibration offered on ${suggested} frames`);
    expect(counts.locked).toBe(0);
    expect(confident).toBe(0);
    // After 6 s of nothing the learner is offered assisted calibration.
    if (frames / 30 > 7) expect(suggested).toBeGreaterThan(0);
  }, 600_000);
});

describe('a full occlusion', () => {
  it('comes back right, with the same fret numbers, within a few frames', () => {
    const rows: string[] = [];
    const recoveries: number[] = [];
    for (const offset of SEEDS) {
      const seq = buildSequence('occlusion', { seedOffset: offset });
      const t0 = truthForScene(seq.frames[0]);
      const tracker = new FretboardTracker({ ...t0.hints });
      tracker.calibrate(t0.pose as FretboardPose, -33);
      let occludedAt = -1;
      let clearedAt = -1;
      let recoveredAt = -1;
      let wrongAfter = 0;
      let confidentWhileHidden = 0;
      seq.frames.forEach((spec, i) => {
        const { frame, truth } = renderScene(spec, cache);
        const u = tracker.update(frame, i * 33.3);
        if (truth.occluded && occludedAt < 0) occludedAt = i;
        if (truth.occluded && u.state === 'locked' && u.confidence >= 0.6 && i - occludedAt > 3) confidentWhileHidden++;
        if (!truth.occluded && occludedAt >= 0 && clearedAt < 0) clearedAt = i;
        if (clearedAt >= 0 && recoveredAt < 0 && u.state === 'locked' && cells(u.pose, truth.pose as FretboardPose) >= 0.9) recoveredAt = i;
        if (recoveredAt >= 0 && u.state === 'locked' && cells(u.pose, truth.pose as FretboardPose) < 0.9) wrongAfter++;
      });
      const recovery = clearedAt < 0 ? 0 : recoveredAt < 0 ? Infinity : recoveredAt - clearedAt;
      recoveries.push(recovery);
      rows.push(`  seed offset ${offset}: hidden from frame ${occludedAt} to ${clearedAt}, right again after ${recovery} frames, ${wrongAfter} wrong frames after, ${confidentWhileHidden} confident frames while hidden`);
      expect(wrongAfter).toBeLessThanOrEqual(1);
      expect(confidentWhileHidden).toBe(0);
    }
    console.log(`recovery after a full occlusion:\n${rows.join('\n')}`);
    expect(Math.max(...recoveries)).toBeLessThanOrEqual(10);
  }, 120_000);
});

describe('a hard scene held for a moment', () => {
  it('locks within a couple of seconds or keeps asking, rarely locks wrong', () => {
    // The single-frame benchmark asks for an answer from one frame; live, the tracker sees the same
    // view again and again with fresh noise. How many hard scenes lock right within 2 s, and how many
    // lock wrong (the dangerous case)?
    const tiers = (process.env.HARDEN_TIERS ?? 'hard').split(',') as ('hard' | 'extreme')[];
    const count = Number(process.env.HARDEN_SCENES ?? 2);
    const frames = Number(process.env.HARDEN_FRAMES ?? 12);
    const offset = Number(process.env.HARDEN_OFFSET ?? 13000);
    const rows: string[] = [];
    for (const tier of tiers) {
      let right = 0;
      let wrong = 0;
      let candidate = 0;
      const lockFrames: number[] = [];
      for (let k = 0; k < count; k++) {
        const scene = renderScene(sampleScene(tier, offset + k), cache);
        const truth = scene.truth.pose as FretboardPose;
        const work: Frame = { data: new Uint8ClampedArray(scene.frame.data.length), width: scene.frame.width, height: scene.frame.height };
        const tracker = new FretboardTracker({ ...scene.truth.hints });
        let firstRight = -1;
        let everWrong = false;
        let last: TrackerUpdate | null = null;
        for (let i = 0; i < frames; i++) {
          jiggle(scene.frame, work, 0, 0, k * 7919 + i);
          last = tracker.update(work, i * 33.3);
          if (last.state === 'locked') {
            if (cells(last.pose, truth) >= 0.9) {
              if (firstRight < 0) firstRight = i;
            } else everWrong = true;
          }
        }
        if (everWrong) wrong++;
        else if (firstRight >= 0) {
          right++;
          lockFrames.push(firstRight);
        } else if (last && last.state === 'candidate') candidate++;
      }
      rows.push(`  ${tier} (${count} scenes from seed ${offset}, ${frames} frames each): locked right ${right} (median at frame ${lockFrames.length ? percentile(lockFrames, 0.5) : '-'}), locked wrong at some point ${wrong}, still a candidate (asking) ${candidate}, nothing ${count - right - wrong - candidate}`);
    }
    console.log(`held scenes:\n${rows.join('\n')}`);
  }, 1_800_000);
});

describe('graceful failure', () => {
  it('offers calibration after six seconds without a board, and says why nothing is drawn', () => {
    const blank: Frame = { data: new Uint8ClampedArray(320 * 180 * 4).fill(90), width: 320, height: 180 };
    const tracker = new FretboardTracker();
    let u = tracker.update(blank, 0);
    expect(u.hint).toBe('point-camera');
    expect(u.suggestCalibration).toBe(false);
    for (let i = 1; i <= 200 && !u.suggestCalibration; i++) u = tracker.update(blank, i * 33.3);
    expect(u.suggestCalibration).toBe(true);
    expect(u.searchingMs).toBeGreaterThanOrEqual(6000);
    expect(u.searchingMs).toBeLessThan(6100);
    tracker.reset();
    expect(tracker.update(blank, 10_000).suggestCalibration).toBe(false);
  });
});
