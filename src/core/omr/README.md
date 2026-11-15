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

## 9. Tab recognizer (`tab/`)

`recognizeTabStaff` reads printed tablature from one staff strip: fret numbers per string, grouped
into columns (chords) in time order, with rhythm when stems are printed, technique marks in the
simple cases, the TAB clef and a time signature when the staff shows one. Six-line and four-line
staves. Import it from `@/core/omr/tab` (the `@/core/omr` barrel does not re-export it) and pass
it to `recognizePage(gray, { tab: recognizeTabStaff, notation })`.

```ts
import { recognizeTabStaff, readTabStaff } from '@/core/omr/tab';

const reading = await recognizeTabStaff(extractStaff(analysis, i), { tuning, context, ai });
// reading.events: OmrTabEvent[] ('tab' | 'tab-rest'), x in page px, notes top string first
// note: { string, fret, midi, confidence, alternatives?, parenthesized?, tieStop?, technique? }
// reading.clef ('tab'), reading.timeSignature, reading.warnings ('low-quality', 'other', 'ai-unavailable')
const { reading: r, debug } = readTabStaff(input);   // + internals: glyphs, numbers, stems, marks, timings
```

`technique` is a string of marks: `x` dead note (its `fret` is a placeholder 0), `<>` harmonic,
then the mark that follows the number towards the next one on its string: `h` `p` `/` `\` `b` `r`.
`parenthesized` = printed in brackets; `tieStop` = an arc ties it to the same fret before it.
The call is synchronous unless `options.ai` is given and the picture left doubts (section 9.4).

### 9.1 How it reads

| Step | File | What happens |
|---|---|---|
| ink on lines | `segment.ts` | Components of the strip WITH its lines that stand free are whole numbers (line blanked behind them); what hangs on a line comes from the line-free strip and is `fused`. Stacked pieces of a cut glyph are rejoined; numbers welded to their chord neighbours, to an arc or to a stem are cut out again (`findWeldedBlobs`). Bar lines are re-checked (`barlineSolidity`): a column of stacked numbers the layout took for a bar line does not swallow its numbers. |
| digit size, style | `segment.ts`, `numbers.ts` | Median digit height and centre offset of the staff; `detectLineThrough` decides whether lines strike through the numbers. |
| box | `glyph.ts` | `refineBox`: every box goes to the half-maximum outline of its own ink (sub-pixel). Templates are cut by the same rule, so a soft glyph and a sharp one match in scale (a Liberation Sans 2 against its own template: 0.87 with the thresholded box, 0.98 with this one). |
| classify | `glyph.ts`, `templates.ts` | Normalised correlation of a 16-row grey patch with 430 templates (10 digits + `x ( ) < > h p b s r / \ ~`, rests, time-signature numerals) drawn from 14 text families (33 faces) and 4 music fonts, at the blur level that fits the staff (`BLUR_LEVELS`). One-pixel shift search; relative glyph height as soft evidence. |
| struck-through | `templates.ts` | The bare line (median profile around the glyph) is subtracted from the patch, and the patch is compared with `struckTemplates`: glyphs whose rows under the line were erased BEFORE blurring. A stroke hidden in the line is hidden in both. |
| touching digits, broken digits | `numbers.ts` | Neighbouring pieces of a line form a cluster; the split into glyphs is the one the classifier likes best (`readCluster`), a wide blob is cut where the pair of templates laid side by side explains the whole blob better than one template (`correlateComposite`). |
| one face per staff | `numbers.ts` | Faces are rated on the clearly read digits; doubtful glyphs are re-read with other faces penalised and close calls settled head to head inside the likely faces on the pixels where the two digits differ (`discriminate`). |
| numbers, columns | `numbers.ts`, `segment.ts` | Digits closer than 0.36 digit heights form a fret; numbers above one another form an event; brackets count only in pairs. |
| sanity | `numbers.ts`, `recognize.ts` | Fret > 24, leading zero, wide gap inside a number ("10" or "1 0"), chord span > 5 frets: used to choose among near-equal alternatives and to lower confidence, never to rewrite silently; the raw reading stays in `alternatives`. |
| rhythm | `rhythm.ts`, `header.ts` | Stems under or over the staff, beams / flags counted at the tip; rests and the time signature from music-font templates. What stems cannot show (half vs quarter, dots) is solved per measure against the time signature (printed, from `options.context`, remembered from an earlier staff of the page, or inferred from measures that add up) using the spacing; inferred values get confidence below 0.5-0.6 and alternatives. |
| marks | `marks.ts` | Arcs between two numbers of a string (tie if equal frets, else `h` / `p`), slanted strokes (slides), strokes climbing above the staff into an arrow head (bends). |
| reliability | `recognize.ts` | Mean correlation of the digits read: 0.95+ on good pictures. Towards 0.8 every confidence is scaled down, weak matches are dropped and a `low-quality` warning is raised. A number also loses confidence when it matches clearly worse than the rest of its staff, when its digits had to be cut apart, and when a line runs through it on a soft picture. |

### 9.2 Measured

Corpus: the 31 fixtures with a tab staff (57 staves, 1111 fret numbers; five digit faces; 100 /
150 / 220 dpi). `node src/core/omr/eval/cli.cjs --subset tab|linked --no-strips`, seed 1:

| Tier | Subset | tabP % | tabR % | fret % | string % | tabDur % | tabMeasEx % |
|---|---|---|---|---|---|---|---|
| clean | tab / linked | 100 / 100 | 100 / 100 | 100 / 100 | 100 / 100 | 100 / 100 | 100 / 100 |
| scan | tab / linked | 100 / 100 | 100 / 100 | 99.9 / 100 | 100 / 100 | 100 / 100 | 97.0 / 100 |
| photo-good | tab / linked | 99.9 / 100 | 100 / 99.8 | 98.2 / 99.8 | 100 / 100 | 100 / 100 | 92.1 / 96.6 |
| photo-bad | tab / linked | 89.4 / 75.5 | 68.8 / 72.9 | 65.7 / 58.7 | 100 / 100 | 73.2 / 100 | 9.9 / 17.1 |

Both subsets together (strip-level tool of section 9.5, same matching rule): fret accuracy 100 /
99.9 / 98.8 / 62.7 % (seed 1) and - / 99.9 / 97.0 / 65.2 % (seed 2) for clean / scan / photo-good
/ photo-bad; precision and recall 100 / 100, 100 / 100, 99.9 / 99.9, 84.7 / 70.3 (seed 1). Wrong
frets reported with confidence >= 0.5 (seed 1): 0 of 0, 0 of 1, 0 of 13, 3 of 291; with seed 2:
0 of 1, 0 of 33, 7 of 302. The price: 0.8 / 3.3 / 5.0 % of the RIGHT frets at clean / scan /
photo-good are reported below 0.5 as well (mean confidence of right frets 0.96 / 0.91 / 0.89).
photo-bad is not usable
without proofreading: 100-dpi pages there are illegible to a person too (27 % of matched numbers
right), 220-dpi pages reach 79 %; such staves carry the `low-quality` warning and confidences
below 0.5. tabMeasEx falls behind the fret numbers because it also needs every bar line of the
layout stage to be right.

The reader's own pages (`tab/fixtures/`, written by `scripts/omr-digit-templates.cjs --fixtures`;
12 pages, 30 staves, 751 numbers) test what the corpus cannot: two faces with NO templates
(Carlito, Caladea), a four-line bass staff, technique marks, typewriter-style tab.

| Tier | P % / R % | fret % | held-out, line blanked | held-out, line struck through | marks read / right (of 86) |
|---|---|---|---|---|---|
| clean | 100 / 100 | 99.7 | 100 (5 pages, incl. bass) | 100 and 97.6 | 85 / 85 |
| scan | 99.6 / 99.7 | 95.1 | 97.8 - 100 | 76.5 and 90.4 | 75 / 75 |
| photo-good | 98.8 / 97.6 | 90.0 | 71.3 (bold at 100 dpi), 92.3, 100, 100, 100 | 69.4 and 89.2 | 60 / 56 (of 78 found) |
| photo-bad | 80.7 / 73.9 | 31.5 | 18 - 48 | 9 - 22 | not usable |

Leave-one-family-out on the templates themselves (`glyph.test.ts`): 247 of 247 digits right when
sharp, 246 at blur levels 1 and 2, 243 at level 3.

Speed: process CPU time per staff strip, warm, 57 strips per tier averaging 19.5 numbers, on a
4-core machine under load 14-18 from other jobs: median 27-32 ms, p95 66-87 ms, max about 100 ms
in every tier (wall time under that load: median 40-85 ms). Once per session: 12 ms to decode the
templates and 15-40 ms for each of the five blur levels when it is first tried; each new line
position of a struck-through staff 8-18 ms (cached, at most 20 per blur level).

### 9.3 Known limits

- A line struck through the numbers hides the middle of 0 / 6 / 8 / 9 and the bar of 4. Clean
  pages read (corpus 100 %, held-out 97.6-100 %); blurred ones confuse 0, 6, 8, 9 (held-out faces
  69-90 % at scan and photo-good), almost always with confidence below 0.5 and the right digit
  among the alternatives.
- Rhythm: augmentation dots and half notes are inferred, not seen (many engravers print neither
  in tab); without any time signature and with ambiguous measures the guess is 4/4. Tuplet
  numbers, whole and half rests (the hanging / sitting blocks) and stems above the staff with
  flags are not read or not tested. The memory of a page's time signature assumes staves are read
  top to bottom.
- Marks: arcs must end on two neighbouring numbers of one string; "H" / "P" printed over an arc
  are not read (the direction of the fret change decides); a bend's "full" / "1/2" is not read;
  vibrato, trills, palm-mute lines, let-ring, tapping marks are not looked for. At scan and worse
  thin strokes near a line (slides) fuse with it and are missed (never invented: 0 false marks on
  the corpus at clean, scan and photo-good).
- The corpus engraver draws no visible arc for ties in tab, so its 7 tab ties cannot be seen.
- Chord symbols, lyrics, tempo and section text are not read here (`texts` stays empty).
- Unusual tab: numbers set BETWEEN the lines (French lute style), letters for frets, stems drawn
  through the staff from the numbers are untested; fret numbers in a slanted or handwritten face
  have no templates.
- The second opinion (9.4) is tested against fakes only; no real model was available.

### 9.4 Second opinion from a vision model

With `options.ai` (an `OmrVisionModel`), a staff that reads poorly (reliability < 0.75) or holds
guesses (a note below 0.5) is shown to the model once: the staff band as a grey image and
`TAB_VISION_PROMPT`, which asks for `{"columns":[{"x":0..1,"notes":[{"string","fret"}]}]}`.
`mergeVision` never lets the answer override what the picture shows clearly: agreement raises a
doubtful reading (`source: 'merged'`); a different fret is taken only for a guess and only if it
was among the reader's own alternatives, otherwise it becomes the first alternative; numbers only
the model saw are added as guesses (`source: 'ai'`, 0.3) on poorly read staves and ignored on
good ones. No answer, a malformed answer or an abort leaves the reading as it was, with an
`ai-unavailable` warning.

### 9.5 Tools and data

```bash
node src/core/omr/tab/dev/tab-eval.cjs                       # corpus, all tiers: per tier / font / dpi, confusions, calibration, time
node src/core/omr/tab/dev/tab-eval.cjs --tier scan --dump    # + e2e/out/omr/tab-mistakes.<tier>.png (look at it with Read)
node src/core/omr/tab/dev/tab-eval.cjs --match ode --show    # + every strip with its reading drawn in
node src/core/omr/tab/dev/tab-eval.cjs --own --fixtures      # the reader's own pages (held-out faces, marks, bass)
node src/core/omr/tab/dev/tab-eval.cjs --explain             # classifier ranking of every misread number
node scripts/omr-digit-templates.cjs [--sheet]               # rebuild tab/digit-templates.data.ts (61 KB; contact sheet in e2e/out/omr)
node scripts/omr-digit-templates.cjs --fixtures              # rebuild tab/fixtures/ (0.4 MB)
npx vitest run src/core/omr/tab                              # 67 tests, about 25 s
```

`tab-eval` caches the staff strips of every fixture and tier under `e2e/out/omr/tab-cache/`
(`--rebuild` after the foundation changes). `dev/synth.ts` draws synthetic strips from the
templates for unit tests. Templates: every glyph drawn once in the bundled Chromium, cropped to
its ink, 16 rows, 4 bits per pixel, near-duplicates within a class merged (each template keeps
the list of faces it stands for). Carlito and Caladea are installed but deliberately left out.
