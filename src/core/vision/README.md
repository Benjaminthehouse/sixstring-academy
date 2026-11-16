# Fretboard vision: the production pipeline

`API.md` is the digest for users of the module. This file records how the production detector and
tracker were chosen and built, and what they measure. Test bench: `testing/README.md`. The two
approaches the pipeline is built from: `lines/README.md` (A, bottom-up line structure) and
`align/README.md` (B, top-down model alignment).

## Files

| File | What |
|---|---|
| `types.ts`, `geometry.ts` | Shared types; neck model, homographies, projection, pose metrics |
| `detector.ts` | `createFretboardDetector()`: both approaches behind one `Detector` (detection, tracking, numbering) |
| `flow.ts` | Coarse board motion between frames (profile correlation): coasting through blur, slip referee |
| `tracker.ts` | `FretboardTracker`: state machine, One-Euro smoothing, confidence hysteresis, numbering lock; `createSessionDetector()` |
| `calibration.ts` | Four taps, two known wires, dragged quadrilateral, numbering shift, nudges |
| `overlay.ts` | Marker placement, frame <-> display (scaled, fitted like `object-fit`, mirrored) |
| `draw.ts` | The overlay on a 2D canvas (outline, wires, fret numbers, string names, note dots, pulse, indicator) |
| `pipeline.ts` | `VisionPipeline`: video -> GPU-resized bitmap -> worker -> poses; frame dropping, fallback, start/stop |
| `predict.ts` | `PosePredictor`: carries the newest pose forward to the displayed frame |
| `quality.ts` | `QualityController`: working size and detection spacing from measured frame costs |
| `color-markers.ts` | Marker mode with tapped colours: sampling, blobs, numbering check, board hypotheses |
| `protocol.ts`, `vision.worker.ts` | Web Worker host (frames, bitmaps, commands, colour sampling) and entry |
| `pipeline.test.ts`, `hardening.test.ts`, `marker-mode.test.ts` | Runtime logic with stand-ins; jitter, long negatives, occlusion, held hard scenes; marker mode |
| `testing/compare.test.ts` | Side-by-side benchmark of detectors over seed sets, false-lock count, best-of-N timing |
| `guidance.ts` | Coaching (`TrackerUpdate.guidance`): frame and view statistics, `OPERATING_LIMITS`, `guide()` |
| `string-count.ts` | Reads how many strings the board in view has (wrong guitar type: no lock) |
| `inlay-polarity.ts` | Which way the inlays stand out, from the cells themselves (both numbering readers) |
| `testing/alt-scenes.ts`, `testing/alt-bench.ts`, `testing/alt-scenes.test.ts` | The independent second generator, its scoring and the alt suite (conditions, sweeps) |

## Evaluation of the two approaches

Both were run on the full benchmark (four tiers x 24 scenes, 24 negatives, 7 tracking sequences)
for eight seed sets: the standard scenes (0), the sets their authors and the first pass of this
work tuned on (1000-4000), and three sets nobody had looked at (6000, 7000, 8000), plus 200 fresh
negatives (9000), the markers tier and cold-start tracking. Detection, pooled over all 192 scenes
of each tier ("correct" = at least 90% of the note markers in the right cell):

| | easy | medium | hard | extreme | locked | numbering | conf. wrong | false pos. |
|---|---|---|---|---|---|---|---|---|
| A lines | 100% | 90% | 68% | 45% | 80% | 91% | 1.7% | 0 / 192 |
| B align | 99% | 88% | 61% | 35% | 74% | 91% | 0.8% | 3 / 192 |

Neither dominates. A finds more boards; B is right on 59 of the 187 scenes A gets wrong (32%), its
numbering is more often honest about doubt, and its rigid tracker keeps the board's shape under
occluders that A's tracker bends around; A's tracker loses the board less often (41 lost frames
over the 56 sequence runs, B 108) but is wrong more often (153 wrong frames, B 71). Over all 768
scenes, A is correct on 581, B on 544, and "either of them" (an oracle picking the right one) on
640: the fused detector reaches 638 of those 640.

## Why each approach fails (from the failure PNGs)

Miss and error reasons pooled over the eight sets (detection tiers):

- **A, lines** misses: `weak-support` 62 (block inlays next to blurred wires, backlight), `no-strings`
  31 (small or blurred necks: A demands visible strings), implausible aspect / skew 19 (steep views),
  band / comb 11. Wrong poses: 36 mis-numbered (nut hidden by the hand or cut by the frame border,
  a hand edge read as the end of the board), 12 half-string locks, 10 geometry. Its tracker slips
  by whole frets in motion blur: the constant-velocity prediction carries one slip into the next
  frame (`clutter`, seed 8000: offset 1, then 2, at full evidence, because a slipped comb still sits
  on wires), and bends the perspective when a hand or an occluder hides the low frets.
- **B, align** misses: `low-score` 109 (thin dark wires on maple, small necks, heavy noise: the ridge
  field keeps too few pixels), `not-rigid` 20, `no-hypothesis` 19. Wrong poses: 24 mis-numbered (an
  inlay pattern read one fret off), 22 a string off at the far end (no string evidence), 24 geometry.
  False positives: evenly spaced bright stripes (a blind or radiator behind the player, a striped
  shirt) pass its comb and rigidity tests (3 of 72 held-out negatives, log-odds up to 1.07 under the
  fused evidence). Its tracker reports lost in blur (108 lost frames over the sequences) but keeps the
  pre-loss shape under occluders.

## The production pipeline

**Detection** (`detector.ts`): the line search proposes first (cheaper, more precise across the
neck); a candidate with log-odds >= 3 is reported at once. Otherwise the alignment search proposes
too, its hypothesis is polished by the line refinement, and both candidates are scored on the same
twelve measurements from both approaches (`boardEvidence`, a logistic model fitted on the
candidates of seeds 0-4000 with heavy regularisation; every sign is the physical one). Two
candidates that put the markers in the same cells are accepted together (log-odds >= -1); a lone
candidate needs >= 1, or >= 1.5 when only the alignment search found anything (its striped-clutter
false positives); disagreeing candidates need a lead of 1. Numbering: both readers (nut, inlays,
board end) vote (`fuseNumbering`); stickers override; after a loss the earlier pose lends its
numbers by shape (strings locked) or by nearness (only trusted within 150 ms of the last pose).

**Tracking**: both trackers follow the previous pose. The board's coarse motion (`flow.ts`:
brightness profiles along and across the board correlated between frames, independent of the
wires) referees: a tracker whole frets away from where the flow puts the board has slipped
(renumbered back), and of two disagreeing trackers the one far from the flow's pose is overruled.
In blur, when neither tracker holds, the flow carries the pose for up to 20 frames at low
confidence. Uncertain numbering is re-read every frame during an 8-frame probation and every 5th
frame after, as votes; the trusted pose from before a loss votes too.

**FretboardTracker** (`tracker.ts`): the state machine (searching -> candidate -> locked, lost),
a One-Euro filter on the four board corners at the nut and the 12th fret (speed measured in string
spacings per second at the visible middle: at 0.5 px of corner noise the markers are 2.4x steadier,
and the lag stays under a quarter of a string spacing for a fast sway, a 15 px/frame jerk or a drift),
confidence smoothing with lock at 0.6 / unlock at 0.3, a lock only on confirmed numbering, a 1 s
hold of the last pose when lost, 8 s of numbering memory for re-detection, and the one-tap
question after 1.2 s of guessing.

**Kept and dropped.** Both approaches earn their place: A's search, refinement and numbering are
the backbone; B's search finds a third of A's misses, its measurements are half of the evidence
model, its rigid tracker and numbering reader are the second opinion. Switched off in production
(still used by B's stand-alone benchmark): B's periodic re-detection and still-frame blending;
cross-checks and smoothing now live in `detector.ts` / `tracker.ts`. Deleted: the geometry
module's `createPoseSmoother` (superseded by `PoseFilter`) and unused `applyHomographyInto`, and
the scratch probes of the first pass.

## Results

All numbers from `testing/compare.test.ts` on the sandbox (shared 4-core machine). `fretboard` is
the detector alone in the benchmark loop; `session` is `FretboardTracker` around it (smoothing,
states), exactly as the app runs it. Seed sets: 0 standard, 1000-4000 seen while tuning the fused
rules. 6000-8000 were fresh when first measured; that blind first measurement (fused detector of
the first pass) read detection 83.0 / 83.1 / 79.5 and tracking 95.1 / 95.5 / 94.1 (A: 75.7 / 76.8 /
75.6 and 92.1 / 88.6 / 93.2; B: 73.2 / 68.5 / 73.4 and 94.1 / 83.7 / 99.6), false positives 1 / 72
(B 3, A 0). Their failures then led to three changes (the flow referee for slips, the stale
nearness carry, the align-only threshold of 1.5), so the final numbers on 6000-8000 below are not
blind. Blind after every change: the 200 negatives of 9000 and the sets 11000 and 12000 (below).

**Detection** ("correct" rate per tier; locked = geometry right up to whole-fret numbering):

| seeds | detector | easy | medium | hard | extreme | locked | numbering | conf. wrong | false pos. | det. score |
|---|---|---|---|---|---|---|---|---|---|---|
| all 8 sets (192 / tier) | A lines | 100% | 90% | 68% | 45% | 80% | 91% | 1.7% | 0/192 | 77.0 |
| | B align | 99% | 88% | 61% | 35% | 74% | 91% | 0.8% | 3/192 | 72.7 |
| | **production** | **100%** | **94%** | **80%** | **58%** | **85%** | **96%** | **0.8%** | **0/192** | **83.8** |
| held-out 6000-8000 | A lines | 100% | 86% | 65% | 49% | 82% | 88% | 1.7% | 0/72 | 76.0 |
| | B align | 99% | 88% | 65% | 35% | 77% | 85% | 1.3% | 3/72 | 71.7 |
| | **production** | **100%** | **92%** | **82%** | **54%** | **85%** | **94%** | **0.4%** | **0/72** | **82.7** |

Fresh negatives (9000, 200 frames): A 2, B 2, production **0** false positives.
`FretboardTracker` run for 10 frames on each of those 200 scenes and on the 192 negatives of the
eight sets: **0** frames shown as a board, **0** locked. Markers tier (stickers; seeds 0 / 3000 /
7000): A 83 / 71 / 92%, B 75 / 67 / 92%, production **92 / 83 / 100%**. Median errors over detected frames,
per tier and set: fret wires 0.005-0.013 of a fret cell (A 0.005-0.019, B 0.005-0.015), strings
0.003-0.032 of a string spacing (A 0.003-0.033, B 0.030-0.120: B has no string evidence).

**Tracking** (sequences start from the true pose, as after calibration; success = markers right):

| seeds | detector | still | sway | hand-slide | jerk | occlusion | nut-exit | clutter | lost / wrong frames | score |
|---|---|---|---|---|---|---|---|---|---|---|
| all 8 sets | A lines | 100% | 100% | 100% | 96% | 82% | 86% | 71% | 41 / 153 | 90.6 |
| | B align | 100% | 100% | 99% | 86% | 89% | 81% | 85% | 108 / 71 | 91.5 |
| | production (session) | 100% | 100% | 100% | **99%** | **94%** | **99%** | **96%** | **14 / 20** | **98.3** |
| held-out | A lines | 100% | 100% | 100% | 91% | 79% | 95% | 74% | 9 / 58 | 91.3 |
| | B align | 100% | 100% | 98% | 81% | **96%** | 88% | 84% | 39 / 22 | 92.4 |
| | production (session) | 100% | 100% | 100% | **97%** | 93% | **97%** | **97%** | **4 / 13** | **97.7** |

Jitter of the markers on a still guitar: 0.01 px raw, 0.00 px through the tracker (the synthetic
frames have little sensor noise; with 0.5 px of corner noise `PoseFilter` is 2.4x steadier, see
`tracker.test.ts`). Recovery after a full occlusion: 1.5 frames mean, 5 at most (A: one sequence
never recovers). The one place B stays ahead is the held-out occlusion of seed 6000 (84% against
97%): a brown occluder still covers frets 3-12 when the board reappears, and the line refinement
extrapolates the perspective over the hidden frets from the eight wires it sees; B's rigid tracker
keeps the shape it had before.

**Blind sets 11000 and 12000** (measured once, after every change; 48 scenes a tier):

| detector | easy | medium | hard | extreme | numbering | conf. wrong | false pos. | det. score | tracking |
|---|---|---|---|---|---|---|---|---|---|
| A lines | 100% | 92% | 69% | 27% | 85% | 1.3% | 1/48 | 71.8 | 93.2 |
| B align | 100% | 85% | 58% | 29% | 89% | 0.7% | 0/48 | 72.5 | 83.3 |
| production (session) | 100% | **96%** | **77%** | **46%** | **95%** | 1.2% | **0/48** | **81.0** | **96.0** |

Per sequence the production tracker is at least as good as the better approach everywhere except
`clutter` of seed 11000 (56% against 85% for A and 92% for B): a noisy maple neck without dots,
nut out of view; a motion-blur jerk slips the strings, the board is lost for one frame, and the
re-detection's numbers, carried over by nearness, come back one fret off and stay (nothing in view
can correct them). Extrapolating the board's motion before the nearness carry was tried: it did not
fix this sequence and made no net difference elsewhere (one frame worse on seed 0, one better on
3000), so it was reverted. One tap on the `question` fixes such a numbering in the app.

**Cold start** (`trackingInit: 'detect'`, the app's real path; seeds 0, 1000, 3000, 6000, 7000, 8000):

| detector | still | sway | hand-slide | jerk | occlusion | nut-exit | clutter | lost / wrong frames | score |
|---|---|---|---|---|---|---|---|---|---|
| A lines | 100% | 83% | 89% | 98% | 95% | 84% | 79% | 20 / 153 | 89.6 |
| B align | 100% | 83% | 98% | 79% | 95% | 88% | 83% | 61 / 112 | 89.6 |
| production (session) | 100% | 83% | **100%** | **98%** | 95% | **98%** | **99%** | **5 / 57** | **96.2** |

The 83% on `sway` is one sequence (seed 6000) that all three get wrong from the first frame: a
classical guitar with a slotted headstock, whose string rollers continue the fret comb past the nut,
so the "nut" is found three frets too far up, with high confidence. Calibration (or one tap) fixes
it; detection does not.

**Speed** (`CMP_TIMING=5`: best of 5 per frame, one warmed instance, 8 scenes per tier at 640x360,
calibration 2.95 ms while measured, which is the sandbox's quiet value):

| median (p95) ms | easy | medium | hard | extreme | no guitar | track (sway / clutter) |
|---|---|---|---|---|---|---|
| A lines | 31 (42) | 48 (60) | 28 (64) | 34 (59) | 28 (67) | 9.3 / 11.2 |
| B align | 27 (44) | 33 (66) | 33 (37) | 58 (96) | 65 (113) | 8.1 / 8.5 |
| production | 32 (37) | 63 (114) | 68 (79) | 97 (136) | 100 (156) | 19.5 / 18.8 (p95 24) |

Tracking runs both trackers plus the flow: about 20 ms, 50 fps, well inside the 20 fps budget.
Detection runs both searches whenever the line search is not sure on its own, so it is within
the 80 ms budget on easy, medium and hard frames (median) but not on extreme frames or frames
without a guitar (about 100 ms, p95 156). The tracker only detects while searching or lost; in
a worker that is about 10 detections per second while nothing is in view. In a real Chromium Web
Worker (`vision.worker.ts` bundled by Vite, a scratch check, single runs on the loaded sandbox)
the tracker locked on an easy scene in 3 frames, tracked a sway sequence 39/39 correct at a median
28-41 ms per frame, and stayed `searching` on 6 negatives at 27-185 ms per frame once warm (the
first detection after start-up costs 200-300 ms of JIT warm-up).

## Runtime (pipeline, overlay, marker mode)

`VisionPipeline` runs the tracker in a module worker at the display rate. The design choices, each
measured in `e2e/vision-live.cjs` (fake camera, 1280x720 MJPEG with a per-frame index code, scored
against ground truth; numbers in `API.md`):

- **Hand the camera frame to the worker, shrink it there.** Where WebCodecs exists the frame on
  screen is wrapped as a `VideoFrame` (0.1 ms on the main thread) and transferred; the worker copies
  its planes out (`copyTo`, about 1 ms for 1280x720 I420) and averages them down to the working size
  in plain code (`frame-copy.ts`, about 3.5 ms in all). Drawing the frame on an `OffscreenCanvas`
  and reading that back cost 6-8 ms on an idle machine and 17 ms more per frame than bitmaps on a
  loaded one, so it is only the fallback for formats the copy does not read and for frames whose planes are
  not the picture as shown (turned or mirrored by `rotation` / `flip` metadata, as a phone camera may
  deliver them, or stretched: `copyMatchesPicture`; `copyTo` hands out planes unturned). The first version shrank it with `createImageBitmap(video, { resizeWidth, resizeHeight,
  resizeQuality: 'medium' })` instead: that call copies and resizes synchronously on the main thread
  (8-9 ms a frame in headless Chromium, 21% of the main thread in a CPU profile), which the pipeline's
  own statistic did not show (it timed only the grabs made inside the frame callback, a median over
  mostly dropped frames, < 0.1 ms; most frames are sent when the worker answers). Bitmaps remain the
  fallback without WebCodecs, and a canvas read-back on the main thread without bitmaps.
- **One frame in flight, the newest one next.** Frames arriving while the worker is busy are
  dropped; when the answer comes back, the newest dropped frame (the one on screen) is sent at once
  instead of waiting for the next video frame. With 45 ms per frame and a 30 fps camera that is 45
  of 60 frames processed instead of 30 (`pipeline.test.ts`). In the browser runs before
  and after the change: 11-12 and 20-26 frames per second, but under different machine load, so
  that gain is not isolated.
- **Extrapolation to the displayed frame.** The answer is for a frame 1-2 frames old. Carrying the
  four board corners forward at their filtered velocity (dead band below 0.4 string spacings per
  second, jumps restart it, lead capped at 100 ms) halves the drawn error on a moving guitar
  (1.6 px against 3.0-3.3 px at 1280 px in the final runs; the tracker's own error is 1.2 px). A first version
  compared neck models by identity and never extrapolated: poses that cross a worker boundary are
  copies (fixed, with a test).
- **Adaptive quality.** Tracked frames over 45 ms (median of 12, after a 2 s warm-up that ignores
  JIT compilation) step the working width down 640 -> 544 -> 480; 3 s of headroom steps it up.
  `FretboardTracker` rescales its poses when the frame size changes. Detections over 80 ms are
  spaced to 75% duty.
- **Bundling.** A production build of `pipeline.ts` with the app's Vite config emits the worker as
  its own chunk (164 kB, 61 kB gzipped) referenced by `new URL(..., import.meta.url)`; the
  main-thread side is 19 kB plus geometry, and the tracker for the main-thread fallback is a
  separate lazily imported chunk.
- **Graceful failure.** `TrackerUpdate.hint` and `suggestCalibration` (6 s without a board, 3 losses
  in 20 s, or 6 s without a lock) tell the screen when to offer assisted calibration.
- **Marker mode** (`color-markers.ts`): colours sampled by one tap each; blobs gated by colour,
  chroma (wood of the tape's hue is out), distance from the marker's edge line (1.3 string
  spacings) and position in the cell (middle 60%). Two markers fix or confirm the numbering; one
  marker never turns a guess into a certainty (an orange book behind the neck did exactly that in
  an early version). Board hypotheses from blob pairs (similarity plus two along-neck perspectives)
  go through `FretboardDetector.fit` (line refinement + the common evidence) and need log-odds >= 1.

## Hardening pass (runtime agent)

Measured with `hardening.test.ts` (FretboardTracker as the app runs it) and `compare.test.ts`:

- **Fresh sets** never looked at before (13000, 14000), single frames, `session`: hard 75% / 75%,
  extreme 54% / 38% correct; most misses are honest ("weak evidence": nothing drawn).
- **Held scenes** (a hard or extreme view held 1.5 s with fresh noise every frame; locked right /
  locked wrong at some point / still asking / nothing): 13000 hard 15/4/4/1 before the change
  below and 16/3/4/1 after, extreme 11/2/5/6; fresh 15000 (after): hard 14/2/5/3, extreme 10/2/6/6.
  Locks come at frame 2 (median). The remaining wrong locks: a board placed half a string off
  across the neck (maple boards with faint strings; frets right, 70-89% of the cells right), and a
  classical neck with a black nut read 2 frets into the slotted headstock.
- **Numbering change** (`lines/numbering.ts`): a slotted headstock's rollers read as a weak wire or
  two beyond a gap, the board seemed to start there, and a classical neck was numbered 2-3 frets
  off with full confidence (hard#13010 in the held run). A strong bar right after a gap of two
  missing wires is now a nut candidate too (fret wires have no bar; wires hidden by a hand leave a
  gap but no bar after it). Single frames, 12 seed sets x 4 tiers (1152 scenes) before/after: one
  scene goes from wrong to right (hard#3016), three more are numbered confidently and rightly, no
  scene changes for the worse, confidently-wrong counts unchanged. Unit tests for both sides.
- **Jitter**: a still guitar under heavy webcam noise (read 0.025, shot 0.04, JPEG 55), seven seed
  sets: the drawn markers move 0.002-0.005 px per frame, the detector's raw pose 0.016-0.034 px.
  The synthetic noise is white; a real sensor's (auto exposure, compression) may need a lower
  `smoothing.minCutoff`. Nothing to tune on this bench.
- **No guitar**: 600 frames (20 s) of 40 scenes without a guitar, panned and re-noised, one
  continuous stream: 0 candidate, 0 locked frames, calibration offered after 6 s.
- **Occlusion**: right again 0-5 frames after a full occlusion clears (seven sets), numbers kept,
  never confident while hidden.
- **Graceful failure**: `TrackerUpdate.hint` / `suggestCalibration` / `searchingMs` (see API.md).

## Verification pass: an independent second generator (alt bench)

Everything above was measured on one renderer, the one the detector was built on. `testing/alt-scenes.ts`
draws the same kind of picture by a different route so that what the module learned about that
renderer stops counting as knowledge about guitars: a full 3-D camera (axis-angle tilt, inverse radial
distortion with k1 and k2), strings 1.5-7 mm and a capo 6-10 mm ABOVE the board (parallax), plane-space
shading at 2x adaptive supersampling with Gaussian-prefiltered wires and strings, Blinn-Phong crowns
and strings, cast shadows of frets and strings, its own fBm / white-noise textures, a filmic shoulder,
Poisson-Gaussian noise with chroma blotches, 4:2:0 chroma, 4x4 luma quantisation, interlaced fields and
rolling flicker. Its truth is computed there too, and `alt-bench.ts` scores what the overlay draws by
tracing each dot back through the TRUE camera: right only if it is between the right two wire crowns
and on the right string as seen. 41 conditions, one factor changed at a time from a typical scene (a
steel-string in a room, hand on frets 2-9, a decent webcam): textures, strings, necks (7-string, bass),
occluders (sleeve, capo at 2 / 4 / 3 with the nut out of view, strap, music-stand edge), light
(raking, stage colours, dim, window), distractors with and without a guitar, camera (portrait,
wide-angle, 320x240, interlaced, flicker), orientation.

**What it found, and what changed** (all four are genuine and none is a tuning to seeds):

1. **Inlay polarity was taken from the wires.** Both numbering readers assumed the dots stand out the
   same way as the fret wires. The first renderer always darkens wires on maple, so it holds there; a
   real maple neck has bright nickel wires and black dots. With the sign reversed every dot reads as
   "less inlay than a plain cell" and the pattern match prefers a shift that puts the dots on plain
   frets: a maple board was locked one fret off at confidence 0.64 (a second guitar on the wall
   behind, seed 2; the top-down reader scored the wrong shift +2.6 and the right one -19.5), and a
   capo scene with the nut out of view likewise (capo-far 3 and 7, seed 2). Fix
   (`inlay-polarity.ts`): inlays are sparse, so the median cell is plain board and the sign of the
   cells that stand out is the inlays' polarity; the wire polarity is the fallback when nothing
   stands out. Original bench (fretboard detector, sets 0 / 3000 / 6000 / 8000, 96 scenes and 24
   negatives each): identical before and after (detection score 79.7 / 85.4 / 83.0 / 81.9, 0 false
   positives); unit tests fail without the fix.
2. **Strings are not in the board plane.** The first renderer draws strings flat on the wood. Real
   strings sit 1.5-7 mm above it, so a steep view sees them shifted by height x tan(angle), up to a
   string spacing at the 12th fret. The detector fits the board itself very well (cells judged
   against the strings' footprint on the wood: 98-100% up to 62 degrees), but the dots, drawn on the
   wood, appeared next to the wrong string: 89% / 66% / 49% of cells right at 48 / 55 / 62 degrees.
   Fix (overlay only; the pose maths and every benchmark of poses are unchanged): `cameraCentre(pose)`
   recovers the camera from the homography and `projectMarkerSeen` puts each dot where the learner
   reads it, on the string as seen and between the wire crowns as seen (a dot on the raised string
   itself can show past its wire). With it, cells were 100 / 100 / 99 / 97 / 99 / 94% right at
   0 / 25 / 40 / 48 / 55 / 62 degrees (tilt sweep, 5 scenes per angle, lens distortion and motion on;
   locked frames fully right 100 / 98 / 96 / 93 / 96 / 81%). The true pose scores 100% through the
   same scoring at every angle, which is the consistency check of the scoring.
3. **The wire spacing cannot tell a bass or a 7-string from a guitar.** A bass is a guitar scaled up
   (a homography absorbs it) and a 7-string has the same wires; under the guitar preset both locked
   at full confidence with every fret right and every dot between two strings (bass 3 of 4 scenes,
   7-string 4 of 4, 0% of those frames right). Fix (`string-count.ts`, in `FretboardTracker`): the
   board's brightness profile across the strings, averaged over several cells and normalised to the
   board width, is correlated with combs of model-2 .. model+2 strings; another count leading by
   0.36 (normalised correlation), smoothed over at least three reads, holds the board back from
   locking and sets `guidance: check-guitar-type` / `stringsSeen`; the doubt fades only on reads in
   which the model's own count wins, not on unclear ones (motion blur let a 7-string lock for one
   frame before that). Where that threshold comes from:
   single reads of six-string necks under the six-string model led by at most 0.33 (1 of 356 reads on
   the original bench, sets 0 and 3000, detector and true poses; the rest 0.29 or less), wrong-model
   reads by 0.39-0.58. The margin is thin on both sides. In the tracker (8 frames on each of the 192
   scenes of those sets) the gate held back 1 six-string scene at the first threshold tried (0.3) and
   none at 0.36; on the alt bench every six-string condition locked exactly as often as before the
   gate (same lock rates in the two full runs). After: bass 0 locks (coached), 7-string
   2 of 4 scenes still lock wrongly when the six-string model is fitted onto six of the seven strings
   (the reader then sees a clean six-comb).
4. **Coaching and honest limits** (`guidance.ts`): see API.md. The limits come from one-knob sweeps:
   neck size (nothing found below about 3 px between strings; right from 3.4 px), view angle (limit
   55 degrees, above), light (right down to mean brightness 34 with the camera gain capped at 8x; half
   the scenes lost at 26, all at 21), capo at frets 1-7 with and without the nut in view (70 scenes
   after fix 1: 0 wrong locks, 0 mis-numbered; before it, 2 maple scenes with the nut out of view
   were numbered a fret off).

**Alt bench after the fixes** (`ALT_SEEDS=1,2,3,4 ALT_FRAMES=24`, cold start, 14 still frames then a
sway; "right" = locked frames with >= 90% of the cells right; 645 s on the loaded sandbox):

| condition | locked (scenes) | right | numbered | wrong-lock scenes (frames) |
|---|---|---|---|---|
| plain, typical, gold-hw, black-hw, sleeve, capo-2, capo-4, stage-light, dim, flicker, mirrored, lefty, portrait, bass-model | 4/4 each | 100% | 100% | 0 |
| no-nut, grain-wear, worn-frets, photo-noise, dull-strings, coated-strings, nylon, stand-edge, blinds-behind, keyboard-behind | 3/4 or 4/4 | 100% | 100% | 0 (the missing scene: never found) |
| capo-nonut, strap, window, wall-guitar, interlaced | 3/4 or 4/4 | 98-99% | 100% | 1 frame each |
| low-res (320x240), seven-model | 4/4, 3/4 | 97% | 100% | 3 frames, 2 frames |
| side-light (raking) | 4/4 | 75% | 100% | 1 scene (22 frames, high frets) |
| wide-angle (strong barrel) | 3/4 | 0% | 100% | 3 scenes (65 frames; cells ~80%) |
| seven-preset (7-string, guitar preset) | 2/4 | 0% | - | 2 scenes (40 frames) |
| bass-preset (bass, guitar preset) | 0/4 | - | - | 0 (coached: check-guitar-type) |
| mirror-untold (mirrored frames, tracker not told) | 0/4 | - | - | 0 (never locks) |
| 5 negatives (keyboard, bookshelf, blinds, radiator, striped shirt) | 0 | - | - | 0 frames shown |

Before the fixes the same run had bass-preset 3/4 scenes locked wrong (66 frames), seven-preset 4/4
(74 frames), wall-guitar 2/4 (13 frames, one mis-numbered by a fret). Jitter of the drawn markers on a
still guitar: 0.002-0.07 px per frame (median per condition). The scene never found in a condition is
nearly always a maple board whose nickel frets are about as bright as the wood (the first renderer
darkens them): a real limit worth checking on a real maple neck, but a safe one.

Not fixed (documented in API.md, "What to expect on a real guitar"): strong wide-angle distortion (a
homography cannot bend; nothing tells the tracker), hard light raking along the neck (the wires' long
shadows bias the fitted wires toward the body, half a fret beyond the 12th; fixing it means changing
the detector's ridge measurement), the 7-string fitted onto six strings, faint frets on maple.

Cost of the new per-frame work (sandbox, loaded): frame statistics 0.35 ms (every third frame),
string-count read 1.3 ms (each frame while a candidate, every tenth while locked), raised dots 0.06 ms
per overlay draw.

## Reproduce

```bash
# side-by-side table (writes e2e/out/vision/compare/<detector>-<offset>-<tag>/ with failure PNGs)
CMP_DETECTORS=lines,align,fretboard,session CMP_OFFSETS=0,1000,2000,3000,4000,6000,7000,8000 CMP_TAG=final \
  npx vitest run src/core/vision/testing/compare.test.ts
CMP_INIT=detect CMP_TIERS=0 CMP_NEG=0 ...          # sequences from a cold start (the app's real path)
CMP_TIERS=markers CMP_SEQ=0 CMP_NEG=0 ...           # sticker mode
CMP_OFFSETS=9000 CMP_TIERS=0 CMP_SEQ=0 CMP_NEG=200  # 200 fresh negatives
CMP_LOCKS=10 CMP_NEG=200 CMP_OFFSETS=9000           # FretboardTracker false locks (10 frames per scene)
CMP_TIMING=5 CMP_DETECTORS=lines,align,fretboard    # best of 5 per frame
HARDEN_SEEDS=0,1000,2000,3000,6000,7000,13000 HARDEN_NEG=40 HARDEN_NEG_FRAMES=15 \
  npx vitest run src/core/vision/hardening.test.ts --silent=false        # jitter, negatives, occlusion
HARDEN_TIERS=hard,extreme HARDEN_SCENES=24 HARDEN_FRAMES=45 HARDEN_OFFSET=15000 \
  npx vitest run src/core/vision/hardening.test.ts -t "held for a moment" --silent=false
MARKER_SCENES=16 MARKER_OFFSET=1000 npx vitest run src/core/vision/marker-mode.test.ts --silent=false
npx vitest run src/core/vision/testing/alt-scenes.test.ts --silent=false     # alt suite (22 conditions, asserted)
ALT_SEEDS=1,2,3,4 ALT_FRAMES=24 npx vitest run src/core/vision/testing/alt-scenes.test.ts -t reports --silent=false   # full table
ALT_SWEEP=span,tilt,light,capo,capo-far ALT_SEEDS=0,1,2 npx vitest run src/core/vision/testing/alt-scenes.test.ts -t sweep --silent=false
node e2e/vision-live.cjs --repeat 3                                         # live, in Chromium
```
