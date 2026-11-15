# Fretboard detector B: model alignment (`core/vision/align`)

Top-down detector and tracker: the board is a known pattern (wires at the 12-tone spacing on a tapered
board under six strings) and we look for the pose that explains the image. Pure TypeScript, typed
arrays, no dependencies. `createAlignDetector()` implements `Detector` from `../types.ts`.

```ts
import { createAlignDetector } from '@/core/vision/align';
const detector = createAlignDetector();                       // one per camera stream
let pose = detector.detect(frame, { model: 'steel', mirrored }).pose;        // null when no guitar
if (pose) pose = detector.track(next, pose, { timeMs }).pose ?? detector.detect(next, { previousPose: pose }).pose;
```

## How it works

| Stage | File | What it does |
|---|---|---|
| 0 | `image.ts`, `features.ts` | Grey working frame (always about 640 wide), a fine (sigma 1.2) and a half-resolution coarse level. Every later measurement is a *point* feature: a thin-line response at any position, orientation and width from three bilinear lookups (`ridgeAt` = min of the two one-sided steps, so edges score 0). |
| 1 | `axis.ts` | Ridge field (Hessian strength, polarity, orientation; flanks of strong lines removed), then a Radon-like vote: each ridge pixel votes for the lines crossing it within 30 degrees of its normal, per polarity and orientation class. A neck axis collects all its frets. Peaks are taken one at a time and their pixels "explained away". |
| 2 | `comb.ts` | 1-D profile along a candidate axis; peaks; a fret comb `s(j) = (A + B x_j)/(1 + C x_j)`, `x_j = 1 - 2^(-j/12)` grown from every neighbouring pair (four seed perspectives), then combs either side of a hidden run (hand) are merged with the index gap that fits. j is a *relative* index. |
| 3 | `strip.ts`, `hypothesis.ts` | Each comb fret is extended sideways as a straight line; the two board edges are the lines where the fret pattern *as a whole* stops (exhaustive 2-parameter search on per-fret presence sums). The midline gives a better axis for a second pass. Frets + edges give a homography (DLT) for any numbering. |
| 4 | `refine.ts` | Continuous alignment. Wires are searched along their normals, wire ends along the wire, strings across the neck; one robust Gauss-Newton step explains all displacements; search range shrinks 4 -> 1 px, and frets too dense for the current range sit out (no one-fret aliasing). `refineHomography`: 8 parameters (detection). `refineRigid`: 6 (tracking). |
| 5 | `score.ts`, `rigidity.ts` | Acceptance. Wires present on the predicted lines, cells clean between them, one hidden run forgiven; wires must stop at the edges (`overrun`), be thin for their spacing (`thickness`), grow along the neck as the pose says (`lengthTrend`), and the homography must be a rigid view for some focal length of 50-81 degrees FOV (`rigidity`). Short runs (< 12 wires) also need strings or a clear nut. |
| 6 | `numbering.ts` | Absolute fret numbers: stickers (marker mode) > nut bar (brightness step against board and headstock at a fret line, nothing line-like behind) > inlay pattern (single / double dots, blocks) > board end > geometry guess (`'assumed'`, confidence 0.15). An inlay counts relative to the wires and to the strongest inlays in view. Evidence must agree with the geometric prior within 6 frets. |
| T | `motion.ts`, `detector.ts` | `track`: constant-velocity shift, rigid 2-D search on the widest-spaced frets (edge-aware), 6-dof rigid alignment (8-dof only if that fits badly), one-string hop test (`PoseScore.lateral`), still-frame blending. Null when quality < 0.4. A doubtful track is checked against a full detection with back-off; guessed numbers are upgraded when the nut or inlays come into view. |

Hints: `bassSideUp` / `mirrored` / `leftHanded` fix which way the nut is (hard constraint), `model` the
preset, `previousPose` re-acquisition and numbering carry-over (only if the board moved < 1/3 fret),
`fretHint` one-tap numbering, `markers` sticker frets, `region` the search area. Four-tap calibration
is `poseFromCalibrationTaps` (geometry) followed by `track`.

## Parameters (`AlignDetectorOptions`, defaults)

`maxCandidates 6`, `minQuality 0.6`, `minFrets 7`, `maxRigidity 0.22`, `maxLengthTrend 0.35`,
`confidentFrets 12` + `minStringsWhenFew 0.08` (+ `excellentQuality 0.85` waives that), `trackMinQuality 0.4`,
`doubtfulQuality 0.72`, `verifyInterval 8`, `stillSmoothing 0.5`, `debugFeatures true` (overlay features in
diagnostics; switch off in production). Thresholds were set on the standard scenes and offset 1000;
offset 2000 was only ever measured, never tuned on.

## Results (`ALIGN_BENCH=1 [VISION_SEED_OFFSET=n] npx vitest run src/core/vision/align/benchmark.test.ts`)

| Scenes (correct / cells) | easy | medium | hard | extreme | false pos. | detection | tracking |
|---|---|---|---|---|---|---|---|
| standard | 100% / 100% | 96% / 95% | 58% / 58% | 38% / 39% | 0 / 24 | **73.0** | **98.5** |
| offset 1000 | 100% / 100% | 83% / 83% | 71% / 77% | 46% / 55% | 0 / 24 | **78.7** | **93.7** |
| offset 2000 (untouched) | 100% / 100% | 96% / 96% | 38% / 45% | 29% / 40% | 0 / 24 | **70.0** | **91.6** |

Hard and extreme vary a lot between seed sets; treat 38-71% (hard) as the honest range. When locked:
fret error median 0.005-0.014 of a cell, string error median 0.03-0.11 of a spacing (p90 0.18-0.51), right
numbering 89-100% (80% on one extreme set), confidently wrong numbering 0%, nut direction 100% (91% on one
extreme set). Markers tier: correct 75%, numbering 95%.
Tracking from the true pose (three sets): still, sway, hand-slide 100%; jerk 97 / 92 / 100%; occlusion
97 / 97 / 87% (nothing is reported while occluded; recovery 1-3 frames); nut-exit 100 / 67 / 100% (13
frames *lost* in motion blur); clutter 95 / 100 / 54% (17 lost in a dark noisy stretch); jitter 0.01-0.02 px,
wobble <= 0.3 px. Cold start (`VISION_TRACK_INIT=detect`, the app's real path): 96.0 / 88.1 / 86.1; the
extra losses are frames reported but wrong (jerk 78-80% on two sets, clutter 73% and 3%); the one traced
(clutter, offset 2000) is a poor first lock that tracking keeps.
Time per 640x360 frame, best of 5 on a shared 4-core sandbox (calibration 2.8 ms): detect median
28 / 30 / 35 / 57 ms on easy / medium / hard / extreme (p95 36 / 86 / 86 / 99), 69 ms when nothing is found
(all candidates tried; p95 109); track median 8-9 ms, about 50 ms on a verification frame. Single runs
under load read 20-40% higher. Stage means: measure (comb + strip) 22, ridges 9, prepare 8, align 7, vote 3 ms.

## Known weaknesses

- **Block inlays at small scale** (most of the medium/hard misses that are not blur): a block in a
  narrow cell is a fat bright line and its neighbours' wires vanish next to it. `thickness` stops
  such fits being accepted, but the right fit is then often not found.
- **Across the neck without strings**: with blurred or noisy strings the pose rests on wire ends,
  which are biased inward by 1-2 px; string error then reaches 0.3-0.5 spacing (several extreme scenes).
- **Weak wires** (heavy blur, backlight, 480x270 at steep pitch): the ridge field keeps only the top
  14% of pixels and the neck may not make the six candidates. Most extreme-tier misses are this.
- **Fret-like clutter**: a run of 12+ evenly spaced thin lines whose length happens to taper, or a
  piano keyboard matched with gaps, can pass (0 of 72 negatives now; the gates that got there cost
  1-4 real boards per 96, those with fewer than 12 visible wires and no visible strings).
- **A poor first lock is sticky**: a pose accepted just above `minQuality` with the far end one string
  off (dark, noisy, steep views) is tracked as it is; the periodic check only replaces it when a full
  detection succeeds, which in such footage it often does not.
- **Numbering**: a dark nut on a dark board with no inlays in view, or a hand over frets 1-3 with the
  nut out of reach of the comb, ends as `'assumed'` (honest, low confidence). Nut and inlay tests
  assume dots / blocks at 3, 5, 7, 9, 12; other inlay schemes are not decoded.
- **Tracking** does not coast through blur (it reports lost), assumes the lock pose's shape and a
  focal length chosen from it, and its steadiness blend adds up to half a pixel of lag below 1.5 px
  of motion per frame. Detect p95 is above an 80 ms budget on hard scenes and on empty rooms.
- Roll beyond about 70 degrees from horizontal leaves the nut direction to the fit (both tried).

## Debugging

`ALIGN_DEBUG=axis|strip|eval|seq|time ALIGN_TIER=hard ALIGN_SEEDS=1,6 [ALIGN_OFFSET=1000] [ALIGN_PNG=1]
[ALIGN_NUM=1] [ALIGN_SEQ=jerk] [ALIGN_INIT=detect] npx vitest run src/core/vision/align/debug.test.ts`
prints one line per scene / frame (quality, seen, rigidity, thickness, strings, errors, numbering trace)
and writes overlays to `e2e/out/vision/align/`. `time` is the best-of-5 timing above. `synthetic.ts`
paints exact boards for the unit tests.
