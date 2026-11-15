/**
 * Marker mode end to end on the benchmark's `markers` tier (hard scenes with two stickers, the nut
 * usually out of view): the learner taps each sticker once (simulated: the colour is sampled where
 * the true pose puts it), and `FretboardTracker` runs with the sampled colours.
 *
 *   MARKER_SCENES=24 MARKER_OFFSET=0 npx vitest run src/core/vision/marker-mode.test.ts --silent=false
 *
 * prints the comparison with no markers and with the hue-only sticker reader over more scenes.
 */
import { describe, expect, it } from 'vitest';
import { sampleMarkerColor } from './color-markers';
import { createFretboardDetector } from './detector';
import { applyHomography, locatePixel, markerHintPlanePoints, projectMarker } from './geometry';
import { renderScene, type RenderedScene } from './testing/render';
import { sampleScene } from './testing/scene';
import { FretboardTracker, type FretboardTrackerOptions } from './tracker';
import type { DetectOptions, Detector, FretboardPose, MarkerColor, MarkerHint } from './types';

const SCENES = Number(process.env.MARKER_SCENES ?? 4);
const OFFSET = Number(process.env.MARKER_OFFSET ?? 0);
const FRAMES = 6;

/** Share of the visible cells (all strings) whose marker lands in the right cell of the true board. */
function cellAccuracy(pose: FretboardPose | null, truth: FretboardPose): number {
  if (!pose) return 0;
  let ok = 0;
  let n = 0;
  const v = truth.visibleFrets;
  for (let s = 1; s <= 6; s++) {
    for (let f = Math.max(1, v.min + 1); f <= v.max; f++) {
      const loc = locatePixel(truth, projectMarker(pose, s, f));
      n++;
      if (loc && loc.onBoard && loc.string === s && loc.fret === f) ok++;
    }
  }
  return n ? ok / n : 0;
}

/**
 * The hint the learner would give, with the colours their taps would sample: only stickers they
 * can see (not under the fretting hand or outside the picture). Both stickers are one tape colour
 * in these scenes, so one sample serves for both when the other is hidden.
 */
function tappedHint(scene: RenderedScene): MarkerHint | null {
  const st = scene.spec.guitar?.stickers;
  const truth = scene.truth.pose;
  if (!st || !truth) return null;
  const hint: MarkerHint = { frets: st.frets, placement: st.placement };
  const hand = scene.truth.handFrets;
  const colors: MarkerColor[] = [];
  markerHintPlanePoints(truth.model, hint).forEach((p, k) => {
    const fret = hint.frets[k];
    if (hand && fret >= hand.min && fret - 1 <= hand.max) return;
    const at = applyHomography(truth.H, p.x, p.y);
    if (!(at.x > 4 && at.y > 4 && at.x < scene.frame.width - 4 && at.y < scene.frame.height - 4)) return;
    // A tap is never exact: 2 px off.
    const c = sampleMarkerColor(scene.frame, { x: at.x + 2, y: at.y - 1 });
    if (c) colors.push(c);
  });
  return colors.length > 0 ? { ...hint, colors } : null;
}

function run(scene: RenderedScene, options: FretboardTrackerOptions): { state: string; accuracy: number; numbering: string } {
  const tracker = new FretboardTracker({ ...options, bassSideUp: scene.truth.hints.bassSideUp, mirrored: scene.truth.hints.mirrored, leftHanded: scene.truth.hints.leftHanded, model: scene.truth.hints.model });
  let last = tracker.update(scene.frame, 0);
  for (let i = 1; i < FRAMES; i++) last = tracker.update(scene.frame, i * 33.3);
  const truth = scene.truth.pose as FretboardPose;
  return { state: last.state, accuracy: cellAccuracy(last.state === 'locked' ? last.pose : null, truth), numbering: last.pose?.numbering ?? '-' };
}

const scenes: RenderedScene[] = [];
for (let seed = OFFSET; scenes.length < SCENES && seed < OFFSET + 200; seed++) {
  const s = renderScene(sampleScene('markers', seed));
  if (s.truth.pose && tappedHint(s)) scenes.push(s);
}

describe('marker mode with sampled colours', () => {
  it('samples a usable colour for the stickers and locks with the right numbers', () => {
    const rows: string[] = [];
    let colour = 0;
    let hueOnly = 0;
    let none = 0;
    const wrong = { colour: 0, hueOnly: 0, none: 0 };
    for (const scene of scenes) {
      const hint = tappedHint(scene) as MarkerHint;
      const c = run(scene, { markers: hint });
      const h = run(scene, { markers: { frets: hint.frets, placement: hint.placement, hue: scene.spec.guitar?.stickers?.hue } });
      const n = SCENES > 6 ? run(scene, {}) : { state: '-', accuracy: 0, numbering: '-' };
      if (c.accuracy >= 0.9) colour++;
      if (h.accuracy >= 0.9) hueOnly++;
      if (n.accuracy >= 0.9) none++;
      if (c.state === 'locked' && c.accuracy < 0.9) wrong.colour++;
      if (h.state === 'locked' && h.accuracy < 0.9) wrong.hueOnly++;
      if (n.state === 'locked' && n.accuracy < 0.9) wrong.none++;
      rows.push(`${scene.spec.seed}: colours ${c.state}/${c.numbering} ${(c.accuracy * 100).toFixed(0)}%  hue-only ${h.state}/${h.numbering} ${(h.accuracy * 100).toFixed(0)}%  none ${n.state} ${(n.accuracy * 100).toFixed(0)}%`);
    }
    console.log(`marker mode, ${scenes.length} scenes from seed ${OFFSET} (locked and >= 90% of cells right / locked but wrong): sampled colours ${colour}/${wrong.colour}, hue-only stickers ${hueOnly}/${wrong.hueOnly}${SCENES > 6 ? `, no markers ${none}/${wrong.none}` : ''}\n${rows.join('\n')}`);
    expect(scenes.length).toBe(SCENES);
    expect(colour).toBeGreaterThanOrEqual(hueOnly);
    expect(colour).toBeGreaterThanOrEqual(Math.ceil(0.66 * scenes.length));
    expect(wrong.colour).toBeLessThanOrEqual(wrong.hueOnly);
  }, 120_000);

  it('can find the board from the two markers alone, and is not wrong more often than right', () => {
    // A detector that never detects or tracks, but can fit hypotheses (the real one's `fit`): what
    // the markers achieve on their own when detection fails. A weak fallback by design: it must
    // stand on the same evidence as a detection (log-odds >= 1) and keep both markers in their cells.
    const real = createFretboardDetector();
    const blind: Detector & { fit: typeof real.fit } = {
      name: 'blind',
      detect: () => ({ pose: null, diagnostics: { timings: { total: 0 }, reason: 'blind' } }),
      track: () => ({ pose: null, diagnostics: { timings: { total: 0 }, reason: 'blind' } }),
      fit: (frame, hs, o?: DetectOptions) => real.fit(frame, hs, o),
    };
    let right = 0;
    let wrong = 0;
    for (const scene of scenes) {
      const r = run(scene, { markers: tappedHint(scene) as MarkerHint, detector: blind });
      if (r.state === 'locked' && r.accuracy >= 0.9) right++;
      else if (r.state === 'locked') wrong++;
    }
    console.log(`markers alone: ${right} right, ${wrong} wrong of ${scenes.length}`);
    expect(wrong).toBeLessThanOrEqual(right);
  }, 60_000);
});
