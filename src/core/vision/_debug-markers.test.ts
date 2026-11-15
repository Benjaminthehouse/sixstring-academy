import { it } from 'vitest';
import { sampleMarkerColor } from './color-markers';
import { createFretboardDetector } from './detector';
import { applyHomography, locatePixel, markerHintPlanePoints, projectMarker } from './geometry';
import { renderScene } from './testing/render';
import { sampleScene } from './testing/scene';
import { FretboardTracker } from './tracker';
import type { MarkerHint, FretboardPose, Detector, DetectOptions } from './types';

function acc(pose: FretboardPose | null, truth: FretboardPose): number {
  if (!pose) return 0;
  let ok = 0, n = 0;
  const v = truth.visibleFrets;
  for (let s = 1; s <= 6; s++) for (let f = Math.max(1, v.min + 1); f <= v.max; f++) { const l = locatePixel(truth, projectMarker(pose, s, f)); n++; if (l && l.onBoard && l.string === s && l.fret === f) ok++; }
  return n ? ok / n : 0;
}
it('blind acquire', () => {
  const real = createFretboardDetector();
  const blind: Detector & { fit: typeof real.fit } = {
    name: 'blind',
    detect: () => ({ pose: null, diagnostics: { timings: { total: 0 } } }),
    track: () => ({ pose: null, diagnostics: { timings: { total: 0 } } }),
    fit: (frame, hs, o?: DetectOptions) => real.fit(frame, hs, o),
  };
  let ok = 0, wrong = 0, n = 0;
  for (let seed = Number(process.env.S0 ?? 0); seed < Number(process.env.S0 ?? 0) + 20; seed++) {
    const scene = renderScene(sampleScene('markers', seed));
    const truth = scene.truth.pose as FretboardPose;
    const st = scene.spec.guitar!.stickers!;
    const hint: MarkerHint = { frets: st.frets, placement: st.placement };
    const hand = scene.truth.handFrets;
    const colors = markerHintPlanePoints(truth.model, hint).map((p, k) => { const f = hint.frets[k]; if (hand && f >= hand.min && f - 1 <= hand.max) return null; const at = applyHomography(truth.H, p.x, p.y); return sampleMarkerColor(scene.frame, { x: at.x + 2, y: at.y - 1 }); }).filter(Boolean) as any[];
    if (!colors.length) continue;
    n++;
    const tr = new FretboardTracker({ ...scene.truth.hints, markers: { ...hint, colors }, detector: blind });
    let u = tr.update(scene.frame, 0);
    for (let i = 1; i < 5; i++) u = tr.update(scene.frame, i * 33);
    const a = acc(u.pose, truth);
    if (u.state === 'locked' && a >= 0.9) ok++;
    if (u.state === 'locked' && a < 0.9) wrong++;
    console.log(seed, u.state, u.pose?.numbering, (a * 100).toFixed(0) + '%', colors.length, 'blobs', JSON.stringify(u.markers?.map((m) => m && [Math.round(m.x), Math.round(m.y)])));
  }
  console.log({ n, ok, wrong });
}, 120000);
