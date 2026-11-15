# `core/omr` — sheet recognition (image side)

Turns a page image (PDF render, scan, phone photo) into a positioned transcription of printed
tablature and standard notation, in the browser, with no server. This directory currently holds
the **foundation**: output model, image toolbox, staff / layout analysis, staff-strip extraction,
ground-truth corpus, degradation model and evaluation harness. The symbol recognizers
(`tab/`, `notation/`) plug into it through the contract in section 4.

Everything outside `eval/` is DOM-free typed-array code that runs in a Web Worker and in Node.
Import from `@/core/omr`; `eval/` (Node only: `fs`, `pngjs`) is imported by path from tests/tools.

## 1. Pipeline

```text
luma ─ preprocess() ─────────────▶ normalised page (lines level, 16 px apart, paper white) + mesh
     ─ detectLayout() ───────────▶ staves (5/6/4 lines, kind), systems, bar lines, measures
     ─ extractStaff() per staff ─▶ StaffInput: straight strip, binary, line-free binary, geometry
     ─ recognizeTabStaff / recognizeNotationStaff (to be written) ─▶ StaffReading (events)
     ─ assemblePage() ───────────▶ OmrPage (boxes in ORIGINAL page px, confidences, linked staves)
```

`analyzePage(gray)` runs the first two stages; `recognizePage(gray, { tab, notation })` runs all.

| Stage | Functions | Notes |
|---|---|---|
| grey / filters | `rgbaToGray`, `downscaleInt`, `resizeGray`, `blur3`, `gaussianBlur`, `boxBlurHorizontal/Vertical/Sheared` | `image/gray.ts` |
| illumination | `flatten` (→ image, noise, contrast, offPage), `estimateBackground`, `estimateNoise` | paper level per block (80th percentile, grey closing), divided out; desk masked |
| binarise | `binarize` (Sauvola / Wolf / Otsu on integral images), `binarizeSymbols`, `binarizeLines`, `binarizeStrokes` | the last two average along / across the staff first: faint lines and bar lines on noisy pages |
| runs, components | `verticalRuns`, `horizontalRuns`, `verticalRunHistograms`, `labelComponents`, `removeSmallComponents`, `dilate/erode/open/close` | |
| geometry | `WarpMesh`, `meshMap`, `meshUnmap`, `warpGray`, `rotateGray`, `homographyFromPoints`, `estimateSkew` | one mesh = scale + deskew + perspective + curl; resampled once |
| dewarp | `buildDewarp(staves, w, h)` → `'none' \| 'scale' \| 'similarity' \| 'mesh'` | driven by the traced staff lines (`image/dewarp.ts`) |
| preprocess | `preprocess(gray, { targetSpace = 16 })` → `PreprocessResult` | rough trace on ≤ 2200 px, then the real thing |
| staff lines | `estimateStaffScale`, `detectStaves` → `StaffGeom` (`xs`, `ys[line][k]`) | dots → chains → combs → tracking (`staff/lines.ts`) |
| layout | `detectLayout` → `LayoutResult`; `classifyStaff`, `groupSystems`, `detectBarlines`, `measuresFromBarlines`, `contentBox`, `removeStaffLines` | |
| helpers | `lineYAt`, `staffPositionAt`, `yAtStaffPosition`, `staffSpaceAt`, `staffUnitsX` | staff-space units |

Coordinates are continuous (pixel `(i, j)` covers `[i, i+1) × [j, j+1)`), like canvas and SVG.

## 2. Output model (`types.ts`)

`OmrPage → systems[] → staves[] → measures[] → events[]`, plus `texts`, `quality`, `warnings`.

- `OmrStaff`: `kind` (`'notation' | 'tab'`) + `kindAlternatives`, `lineCount`, `geometry` (line
  polylines, `space`, `lineThickness`, `x0/x1`, `bbox`, `contentBox`), `clef`, `keySignature`
  (`fifths`), `timeSignature`, `barlines[]` (`x`, `type`, `systemWide`), `measures[]`,
  `linkedStaffId` (notation ↔ tab of one system), `tuning`.
- `OmrNotationEvent` (`kind: 'chord' | 'rest'`): `x`, `notes[]` (`staffPosition`, `head`, `pitch`
  {step, alter, octave, written, midi = sounding}, `accidental`, `tieStart/Stop`, then `string`/
  `fret` after linking), `duration` {value, dots, tuplet, ticks}, `stem`, `beams`, `flags`.
- `OmrTabEvent` (`kind: 'tab' | 'tab-rest'`): `x`, `notes[]` (`string` 1 = top line, `fret`,
  `midi`), optional `duration` (from stems, or copied from the linked notation event).
- Every element: `id`, `bbox` (original page px), `confidence` 0..1, optional `alternatives`.
- Helpers: `pitchAtStaffPosition(pos, alter)`, `midiAtFret(string, fret)`, `durationTicks(...)`.

## 3. Staff strips

`extractStaff(analysis, index, { space, above, below })` resamples one staff **from the original
image** (one interpolation) into a strip where the lines are exactly level and `space` px apart
(default 20 notation, 24 tab). `StaffInput` carries `gray`, `binary`, `noLines`, `lineMask`,
`lineYs[]`, `x0/x1`, `barlines[]`, `measures[]`, `scale`, `sourceSpace`, `partnerIndex`, the
whole `page`, and `toPage / toPageBox / fromPage`. Staff position of a strip point:
`(lineYs[lineCount - 1] - y) / (space / 2)`; tab string `s` is at `lineYs[s - 1]`.

## 4. What the recognizer agents implement

```ts
// src/core/omr/tab/index.ts
export const recognizeTabStaff: RecognizeTabStaff;          // (input: StaffInput, options?: RecognizeOptions)
// src/core/omr/notation/index.ts                            //   => StaffReading<...> | Promise<StaffReading<...>>
export const recognizeNotationStaff: RecognizeNotationStaff;
```

Return `StaffReading`: `events` in time order with boxes in **page px** (`input.toPageBox`),
`clef` / `keySignature` / `timeSignature` when read, `texts`, `confidence`, `warnings`. Ids may be
empty and `measureIndex` omitted: `assemblePage` assigns events to measures by position, fills
ids, links notation and tab events of a system and copies strings / frets / rhythm across.
`options.ai` (`OmrVisionModel`) is an optional second opinion; never required. A guess gets a
confidence below 0.5 and its `alternatives`. `eval/oracle.ts` is a complete worked example
(readings built from ground truth). The evaluation CLI picks both functions up as soon as the
files exist; the app passes them to `recognizePage(gray, { tab, notation })`.

## 5. Fixtures (`fixtures/`, written by `scripts/omr-fixtures.cjs`)

66 pages (0.9 MB of 8-bit grey PNG) engraved with VexFlow 4 in the bundled Chromium: 35 notation,
16 tab, 15 linked notation + tab; 100 / 150 / 220 dpi; staff sizes 0.85–1.2; music fonts Bravura,
Gonville, Petaluma, Leland; five digit fonts; traditional tunes, scales to low E3 and up to G6,
chromatic, sixteenth arpeggios, chords with seconds, triplets, all rests, ties, repeat signs, tab
with / without stems and TAB clef, lines through or blanked behind digits, brackets, full pages. Each `<id>.json`
(`GroundTruth` in `eval/truth.ts`) has staff lines, bar lines, clef / key / time, every head
(pitch, position, accidental, tie, string / fret) and tab number with tight boxes read back from
the SVG. `node scripts/omr-fixtures.cjs [--only x] [--list]` rebuilds it byte-identically.
`loadFixture(id)`, `selectFixtures({ subset, tag })`, `defaultSample()` load it in Node.

`degrade(gray, truth, tier, seed)` (`eval/degrade.ts`) simulates a capture and moves the truth
with it: `clean`, `scan` (≤ 1.6° rotation, blur, noise, grey paper, speckle, show-through, JPEG),
`photo-good` (+ perspective ≤ 3 %, mild curl, lighting gradient, shadow), `photo-bad` (≤ 5°,
perspective ≤ 7 %, curl ≤ 1.2 % of the height, blur ≤ 0.16 space, noise σ ≤ 9, contrast ≥ 0.55,
JPEG q 40–65, 0.75–0.95 scale, dark desk half of the time).

## 6. Evaluation and debugging

```bash
node src/core/omr/eval/cli.cjs                      # all fixtures x all tiers; symbol table once recognizers exist
node src/core/omr/eval/cli.cjs --tier scan --subset tab --match ode --pages
node src/core/omr/eval/cli.cjs --dump failures      # annotated PNGs in e2e/out/omr/ (look at them with Read)
node src/core/omr/eval/cli.cjs --strips <id> --tier photo-good    # the strips a recognizer gets
node src/core/omr/eval/cli.cjs --norm <id> --view binary|gray|lines|strokes|noLines
node src/core/omr/eval/cli.cjs --bench [--tier photo-good]        # timing on 2480 x 3508
npx vitest run src/core/omr                         # 43 tests, ~40 s; OMR_FULL=1 for the whole corpus
```

`scorePage(page, truth)` (`eval/metrics.ts`) matches by position and reports: staff detection,
line error, kind, systems, bar-line P / R / F1 and type, measure count; note-head P / R, pitch,
duration, rests, accidentals, ties, key, time, exact measures; tab-number P / R, fret, string,
tab rhythm, exact tab measures. `runEvaluation` aggregates per subset and tier; `dumpPage`,
`dumpAnalysis`, `dumpTruth`, `drawStrip` write pictures; `detectBarlines(..., { trace })` explains
every stroke decision.

## 7. Measured (66 fixtures per tier, seed 1, this build)

| Tier | Staves found / precision | Line error (staff spaces) mean / p95 | Kind | Systems | Bar lines P / R / F1 | Pages fully right |
|---|---|---|---|---|---|---|
| clean | 161/161 · 100 % | 0.011 / 0.017 | 100 % | 100 % | 100 / 100 / 1.000 | 66/66 |
| scan | 161/161 · 100 % | 0.010 / 0.015 | 100 % | 100 % | 100 / 99.9 / 0.999 | 65/66 |
| photo-good | 161/161 · 100 % | 0.010 / 0.014 | 100 % | 100 % | 99.5 / 99.0 / 0.993 | 61/66 |
| photo-bad | 149/161 · 99.3 % | 0.015 / 0.026 | 100 % | 100 % | 98.4 / 74.4 / 0.847 | 22/66 |

Bar-line type (single / double / end / repeat) is right for 99.9 / 98.8 / 97.5 / 97.4 % of the
matched bar lines. Strip geometry: 100 % of the true note heads land within half a step of their
staff position in clean, scan and photo-good (1786 heads, mean error 0.03 half spaces), 99.8 % in
photo-bad; 100 % of tab numbers sit on their string line in every tier. Time for a 2480 × 3508
page, preprocess + layout on one core of a busy 4-core machine (load 5-7): median 0.65 s clean,
1.1 s scan / photo; staff strips about 45 ms each.

## 8. Known limits

- photo-bad: a quarter of the bar lines and 8 % of the staves are missed (blur ≥ 0.13 space with
  JPEG q < 55 is the usual cause); what is found is right (precision ≥ 98 %). `OmrPage.quality`
  and `warnings` say when a page is in that territory.
- Bar types: double vs final vs repeat get confused when the strokes fuse (below ~110 dpi or
  blurred). A repeat sign right after the clef leaves an empty "header" measure in the layout;
  `assemblePage` drops it once the staff has a reading.
- Columns of stacked fret digits can pass for bar lines on blurred tab pages (photo tiers).
- Four-line staves are reported as tab with confidence ≈ 0.6; no fixtures. No multi-voice piano
  systems, no page-boundary detection (the dewarp uses staves only), no text / chord-symbol
  reading here (`OmrText` is in the model for the recognizers or OCR to fill).
- Curl is modelled as a smooth bow; real book gutters are untested.
