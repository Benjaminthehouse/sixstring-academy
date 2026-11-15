# Fretboard vision: test bench

Synthetic webcam scenes with exact ground truth, and the benchmark every fretboard detector is measured
against. Pure TypeScript, seeded, no canvas. Read the header of `../types.ts` first; maths: `../geometry.ts`.

## The interface a detector implements (`../types.ts`)

```ts
interface Detector {
  readonly name: string;
  detect(frame: Frame, options?: DetectOptions): DetectionResult;          // from scratch; null when no guitar
  track(frame: Frame, previousPose: FretboardPose, options?: DetectOptions): DetectionResult; // keeps numbering
  reset?(): void;
}
interface Frame { data: Uint8ClampedArray /* RGBA */; width: number; height: number }
interface DetectionResult { pose: FretboardPose | null; diagnostics: DetectionDiagnostics }
interface DetectionDiagnostics { timings: Record<string, number> /* ms, incl. total */; reason?: string;
  features?: { kind: string; points: Point[]; closed?: boolean; score?: number; label?: string }[]; stats?: Record<string, number> }
interface DetectOptions { bassSideUp?: boolean /* default true */; mirrored?: boolean; leftHanded?: boolean;
  model?: 'steel' | 'electric' | 'classical' | NeckModel; region?: Rect | Point[]; previousPose?: FretboardPose;
  fretHint?: { point: Point; fret: number }; markers?: { frets: number[]; placement?; hue? }; timeMs?: number }
interface FretboardPose { H: Mat3 /* neck mm -> image px */; model: NeckModel; confidence: number;
  visibleFrets: { min: number; max: number }; mirrored: boolean; leftHanded: boolean;
  numbering: 'nut' | 'inlays' | 'markers' | 'user' | 'tracked' | 'assumed'; numberingConfidence: number;
  frameWidth: number; frameHeight: number }
```

Both calls are synchronous and must not throw. Build poses with `makePose(H, model, w, h, extras)`;
a pose for a downscaled working frame is fine (the harness rescales by `frameWidth`). The benchmark
passes the hints an app would really know (`bassSideUp`, `mirrored`, `leftHanded`, the preset id in
`model`, `markers` in the markers tier, `timeMs` in sequences) and nothing else. The true neck differs
from the preset (scale 628-660 mm, widths and taper +-1.5 mm): trust fret wires over board corners.

## Run the benchmark

From `guitar/`. No test file needed: export `createDetector()` (or default-export a `Detector`):

```bash
VISION_DETECTOR=src/core/vision/my-detector.ts npx vitest run src/core/vision/testing/detector-benchmark.test.ts
# VISION_EXPORT=createFoo VISION_QUICK=1 VISION_TIERS=easy,medium VISION_SEQUENCES=0|still,sway VISION_NEGATIVES=0
# VISION_TRACK_INIT=detect VISION_NO_CACHE=1 VISION_SEED_OFFSET=1000 (held-out scenes: check you did not overfit)
# references: VISION_DETECTOR=oracle (degrade: VISION_ORACLE='{"noisePx":2}') | null | .../testing/example-detector.ts
```

```ts
// Or in your own test file, with thresholds that fail the test:
import { defineDetectorBenchmark } from '@/core/vision/testing/detector-benchmark';
defineDetectorBenchmark('lines', () => createLineDetector(), {
  minimums: { tiers: { easy: { correctRate: 0.95 }, medium: { correctRate: 0.8 } }, maxFalsePositiveRate: 0.05, trackingSuccess: 0.9 },
});
```

Or in code: `formatBenchmark(runBenchmark(detector, { quick: true, frames: diskFrameStore() }))`.
The table is printed, and `e2e/out/vision/<detector>/` receives `benchmark.txt`, `benchmark.json` and
`fail-<group>-<index>.png` for the first failures of each group (truth cyan, your pose yellow, your
`diagnostics.features` coloured by `kind`). Vitest hides `console.log` of passing tests: add `--silent=false`.

Speed: rendering costs about 0.1 s per frame on the sandbox, so frames are cached in `e2e/out/vision/cache`
(about 290 MB, keyed by scene and by a hash of the renderer sources). A cold full run renders 396 frames
in 30-50 s; a warm run loads them in about 1 s plus your detector. Runtimes depend on the machine: the report
prints `calibration` (a 3x3 Sobel on 640x360, about 3 ms on the sandbox) for comparison. Budget on a
mid-range laptop: detect <= 80 ms, track <= 50 ms per 640x360 frame.

Side by side, over several seed sets (the production detector is `fretboard`, the app's full
pipeline with `FretboardTracker` is `session`; also false-lock counting and best-of-N timing):

```bash
CMP_DETECTORS=lines,align,fretboard,session CMP_OFFSETS=0,6000 npx vitest run src/core/vision/testing/compare.test.ts
```

See the header of `compare.test.ts` for its switches and `../README.md` for the latest numbers.

## Tiers (24 fixed scenes each, seeds 0..23), negatives (24), sequences (7)

| Tier | What it is |
|---|---|
| `easy` | Clean and front-on (<= 12 degrees off the normal), plain wall, no hand, no player, nut in view, dots, dark board, 640x360. |
| `medium` | Typical webcam: room, player, hand over 3-4 frets, roll to 25, tilt to 32 degrees, mild blur / noise / JPEG, all guitar types, maple and inlay-less boards, some left-handed and mirrored. |
| `hard` | Clutter with fret-like decoys, striped shirts, barre hands and thumbs, tilt to 48 degrees, motion blur, backlight, glints, nut out of view in about half, 480x270 to 1280x720. |
| `extreme` | Everything at once: tilt to 55 degrees, heavy blur and noise, strong backlight, JPEG quality 25-50, lens distortion, a few upside-down views (`bassSideUp: false`). Expect to fail some. |
| `markers` | Optional (`tiers: ['markers']`): hard scenes with two bright stickers; `options.markers` says where (`markerHintPlanePoints`). |
| negatives | No guitar: empty rooms, clutter, people, striped shirts, bare hands, ladders, keyboards, blinds, radiators, book spines, rulers. Any pose is a false positive. |

Sequences (30 fps, 640x360, 30-40 frames): `still` (jitter), `sway`, `hand-slide` (hand moves, then leaves),
`jerk` (motion blur), `occlusion` (full occlusion, then recovery), `nut-exit` (numbering must survive the nut
leaving), `clutter`. Each starts from the true pose of frame 0 (as after four-point calibration) unless
`trackingInit: 'detect'`. The loop is the app's: `track(frame, pose)`, on null `detect(frame, { previousPose })`.

## Metrics (`BenchmarkResult`)

- `found`: a pose came back. `locked`: right cells up to a whole-fret offset, wires within 0.3 of a
  cell, right way round. `correct`: >= 90% of note markers land in the right string/fret cell
  (absolute fret numbers wherever the frame shows the nut, the 12th-fret inlays or stickers;
  numbering-agnostic but locked elsewhere). `cells`: mean marker accuracy, a missed frame counts 0.
- `fret med / p90`: fret-wire error as a fraction of the local fret spacing, whole-fret offset
  removed, pooled over detected frames (`fretErrorAbsolute` keeps the offset). `str`: string error
  as a fraction of the string spacing. Both are measured in the true neck plane.
- `numbering`: fret 5 is called fret 5, among locked frames where that is observable. `conf.wrong`:
  mis-numbered yet `numberingConfidence >= 0.5`. When you cannot know, say so (`'assumed'`, low
  confidence) and let the UI ask for one tap (`confirmFretAt`).
- `nut dir` / `bassSideRate`: orientation. NEGATIVES: false-positive rate (target 0).
- TRACKING: `success` (correct / evaluable frames), `lost` (no pose), `drift` (wrong pose: worse),
  `jitter` (median frame-to-frame marker motion in px while the guitar is still), `wobble` (the same
  relative to true motion), `recovery` (frames after an occlusion until correct; inf = never),
  `held` (pose reported while fully occluded), `redetect`, `numbering` kept, ms per `track`.
- `detectionScore` = 100 x mean `cells` over the standard tiers x (1 - false-positive rate);
  `trackingScore` = 100 x mean `success`. Oracle: 100 / 100. Null detector: 0 / 0.

## Look at scenes and at your output (PNGs land in `e2e/out/vision/`; open them with the Read tool)

```bash
VISION_DUMP=sheets npx vitest run src/core/vision/testing/dump.test.ts      # sheet-<tier>.png, sheet-negative.png
VISION_DUMP=frames VISION_TIER=hard VISION_SEEDS=1,6 npx vitest run src/core/vision/testing/dump.test.ts
VISION_DUMP=sequence VISION_SEQUENCE=occlusion npx vitest run src/core/vision/testing/dump.test.ts
```

```ts
import { writeFramePng } from '@/core/vision/testing/debug';       // also writeContactSheet, drawOverlay
import { renderScene, sampleScene } from '@/core/vision/testing';
const scene = renderScene(sampleScene('hard', 6));   // { frame, truth, spec }; truth.pose is the answer
const out = detector.detect(scene.frame, scene.truth.hints);
writeFramePng('e2e/out/vision/mine.png', scene.frame, { pose: out.pose, truth: scene.truth.pose, features: out.diagnostics.features, scale: 2 });
```

`truth` also has `nutVisible`, `numberingObservable`, `handFrets`, `occluded`. `comparePoses(pose, truth.pose)`
gives per-frame errors; `createOracleDetector({ noisePx, fretShift, numberingOffset, dropRate })` is a
controllable stand-in for a detector; `buildSequence(name)` returns the `SceneSpec` of every frame. Node-only
files: `debug.ts`, `store.ts`, `detector-benchmark.ts`. Editing a renderer file or `geometry.ts` resets the cache.
