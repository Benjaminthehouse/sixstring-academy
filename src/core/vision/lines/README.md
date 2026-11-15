# Fretboard detector A: "line structure"

Bottom-up features and geometric model fitting, pure TypeScript on typed arrays. Implements
`Detector` from `../types.ts`; `createDetector()` / `createLineDetector(options)` in `index.ts`.

```bash
VISION_DETECTOR=src/core/vision/lines/detector.ts npx vitest run src/core/vision/testing/detector-benchmark.test.ts
# VISION_EXPORT=createDebugDetector adds lines / band / fret candidates to the failure PNGs
npx vitest run src/core/vision/lines   # 36 unit tests, 5 s; dev.test.ts holds developer dumps (LINES_DEV=...)
```

## How detection works (`detector.ts`)

1. **Image** (`image.ts`): luminance shrunk to about 640 wide (1280 by 2, 960 by 1.5), 3x3 binomial blur, Sobel.
2. **Lines** (`hough.ts`): thinned edges vote in a (360 x rho) Hough accumulator only near their own
   gradient direction; peaks are refitted by total least squares on their own edge pixels.
3. **Axes and band** (`band.ts`): near-parallel neighbouring lines are clustered into candidate neck axes.
   A strip is laid along each axis; fret wires are thin ridges crossing its rows (a min-difference
   filter that ignores step edges such as fingers). Each ridge is followed across the rows until it
   stops; two robust lines through the ridge ends are the board edges. No string or painted edge needed.
4. **Fret candidates** (`comb.ts`): the band is resampled with rows following the pencil of strings. The
   upper third's profile is registered against the lower third's with a shift and a stretch (wires
   converge to a vanishing point), evidence is accumulated along those directions, and peaks present
   over at least 45% of the board width become candidates (so inlay dots and glints drop out).
5. **1-D fret model** (`fretfit.ts`): `u(m) = (A x + B) / (C x + 1)`, `x = 1 - 2^(-m/12)`. An outer scan
   over the depth ratio between the comb's ends undoes the perspective; inside, a pair of neighbouring
   candidates seeds a two-parameter geometric comb that is grown by matching and refitting. Indices are
   relative: the whole-fret offset is exactly unobservable here. Scored by matched weight minus
   penalties for missing wires, spurious candidates and residual. Two readings are tried when wires are
   hidden: any believable camera, and one consistent with how the band tapers.
6. **Homography**: wire ends are known board-outline points -> least-squares DLT. Which edge is the bass
   side and which end the nut come from the hints (`bassSideUp`, `mirrored`, `leftHanded`: the camera
   sees the face of the board, which fixes the handedness); an upright neck is assumed headstock-up.
7. **Refinement** (`refine.ts`, `rectify.ts`): the board is resampled through the pose (wires = columns,
   strings = rows). Each wire is located in four bands across the board, wire ends give the edges, the
   six strings are locked as one comb (wire ends misjudge bound necks by up to 13%) and then one by
   one. All are "image point on plane line" constraints for a reweighted DLT with a weak pull to the
   start pose. Ridge scale and polarity (bright wires / dark wires on maple) are chosen from the data.
8. **Acceptance**: support (found wire bands / expected), six strings visible in the cells (what
   ladders, keyboards, blinds, rulers and bookshelves lack), no wires half-way between the predicted
   wires (catches half-fret and double-density misfits), at least six wires. Otherwise `pose: null`
   with `diagnostics.reason`.
9. **Numbering** (`numbering.ts`, `markers.ts`): nut = a bar behind the lowest wire that stands out from
   what wires leave there, the board ending, no wires beyond; inlays = dots / double dot / blocks
   classified against local board brightness and matched to 3 5 7 9 12 15 17 19 21. A nut with its bar
   wins; a nut only inferred yields to a double dot. Stickers (`options.markers`) beat both. Otherwise
   `numbering: 'assumed'`, confidence 0.1: ask for a tap (`options.fretHint`, or `confirmFretAt`).

## Tracking (`track`)

Refinement from the previous pose (or a constant-velocity prediction), plus: a slide of the whole
predicted comb along the neck (fret spacing is not periodic, so the best slide is unique even beyond
one fret per frame), re-centring across the neck, repair of a one-string slip, a wide-window retry for
partial locks, and a whole-fret slip check (a slip changes the length of a stretch of frets seen
through the previous pose by 5.6% per fret). Lost when support collapses. `detect(frame, { previousPose })`
keeps the earlier model and carries the numbering over by the same shape argument, so it survives the
neck sliding any distance while lost.

## Parameters (`LineDetectorOptions`, defaults)

`workingWidth` 640 (960-wide frames are resampled by 1.5) | `maxAxes` 8 | `maxBands` 6 | `minFrets` 5
| `minSupport` 0.5 | `minTrackSupport` 0.42 | `minStringsLooked` 18 | `minStringSupport` 0.4 |
`minJointSupport` 0.33 | `minConfidence` 0.39 | `debug` false. Hints used: `bassSideUp`, `mirrored`,
`leftHanded`, `model`, `region`, `previousPose`, `fretHint`, `markers`, `timeMs`.

## Results (full benchmark on the sandbox)

| Scenes ("correct") | easy | medium | hard | extreme | markers | false pos. | detection | tracking |
|---|---|---|---|---|---|---|---|---|
| standard (seeds 0-23) | 100% | 88% | 63% | 29% | 83% | 0 / 24 | 72.3 | 97.9 |
| held-out (`VISION_SEED_OFFSET=1000`) | 100% | 96% | 71% | 58% | 79% | 0 / 24 | 83.0 | 95.8 |

Found / locked, standard: 100/100, 92/92, 75/63, 46/38; held-out: 100/100, 96/96, 79/71, 67/58. Fret
error (median, cells) 0.005-0.012, string error 0.004-0.028. Numbering among locked frames 95-100%
(standard extreme 75%); confidently wrong 0-6%. Tracking, standard: still / sway / hand-slide / jerk /
nut-exit 100%, occlusion 91% (recovery 2 frames), clutter 95%; jitter 0.01 px. Held-out: all 100%
except occlusion 94% and nut-exit 77% (seven frames of 14 px motion blur are reported lost). With
`VISION_TRACK_INIT=detect`: 97.6. Runtime per 640x360 frame (least disturbed of five runs; the sandbox
is shared, calibration 3-4 ms): detect median 24 ms easy, 32 ms medium / hard (p95 61-73, max 78),
61 ms on frames without a guitar (all bands examined; max 91); track median 9-12 ms (p95 20, max 29).
Benchmark tables written under load show detect medians of 35-55 ms.

## Known weaknesses

- **Strings must be visible.** A frame is only accepted with string ridges in at least three cells. Very
  small or heavily blurred necks fail with `no-strings`; tracking from a calibrated pose does not need them.
- **Block inlays with blur**: a wire beside a block is as bright as the block, the ridge filter sees
  nothing, support stays under the threshold (several medium / hard misses). A one-sided "step" wire
  model was tried and rejected: it also accepts finger edges and raised drift.
- **Numbering when the nut is cut by the frame border or hidden** stays `'assumed'` (honest, but
  counted wrong where the benchmark can see the nut); a hand next to the lowest wire can pass for the
  end of the board (capped at confidence 0.45).
- **Heavy motion blur along the neck** erases the wires: reported lost, no coasting on strings alone.
- **Extreme tier**: necks with invisible wires (maple, backlight, noise) and tiny necks are not found.
- **Half-string locks** (the gaps between strings read as strings) are limited by a polarity prior and a
  0.3-spacing limit from the wire-end centre line, not eliminated: a few hard / extreme frames show them.
- An upright neck (more than 60 degrees) is assumed headstock-up; `bassSideUp` is ignored there.
- The Hough stage needs a few long lines of the neck (strings or edges) within 7 degrees of its axis.
- Module-level scratch buffers: one frame at a time per JS realm (fine in a worker, not re-entrant).
