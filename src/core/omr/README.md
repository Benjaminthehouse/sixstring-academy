# `core/omr` — sheet recognition (image side)

Turns a page image (PDF render, scan, phone photo) into a positioned transcription of printed
tablature and standard notation, in the browser, with no server: foundation (output model, image
toolbox, staff / layout analysis, strips, corpus, degradation, evaluation; sections 1-8), the tab
and notation recognizers (sections 9-10), and the page pipeline with its worker, page classifier,
summary, Song converter (section 11), the unseen corpus (section 12) and AI-assisted reading
(section 13). Digest for users of the module: [API.md](./API.md).

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

`analyzePage(gray)` runs the first two stages; `recognizePage(image, opts)` (pipeline.ts, section 11) runs all.

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
staves (and seven-line). Import it from `@/core/omr/tab` (the `@/core/omr` barrel does not
re-export it; digest in `tab/API.md`) and pass it to `recognizePage(gray, { tab: recognizeTabStaff, notation })`.

```ts
import { recognizeTabStaff, readTabStaff } from '@/core/omr/tab';

const reading = await recognizeTabStaff(extractStaff(analysis, i), { tuning, context, ai, signal });
// reading.events: OmrTabEvent[] ('tab' | 'tab-rest'), x in page px, notes top string first
// note: { string, fret, midi, confidence, alternatives?, parenthesized?, tieStop?, technique? }
// reading.clef ('tab'), reading.timeSignature, reading.warnings ('low-quality', 'other', 'ai-unavailable')
const { reading: r, debug } = readTabStaff(input);   // + internals: glyphs, numbers, stems, marks, blur level, timings
```

`technique` is a string of marks: `x` dead note (its `fret` is a placeholder 0), `<>` harmonic,
then the mark that follows the number towards the next one on its string: `h` `p` `/` `\` `b` `r`.
`parenthesized` = printed in brackets; `tieStop` = an arc ties it to the same fret before it.
The call is synchronous unless `options.ai` is given and the picture left doubts (section 9.4).
`midi` uses `options.tuning` when it has one string per line, otherwise the usual tuning for the
line count (`tuningFor`: 4 lines = bass E A D G, 5 = five-string bass, 6 = guitar standard,
7 = seven-string), with an `other` warning when it had to assume one for a staff that is not
six-line. (`assemblePage` still labels every tab staff `tuning: STANDARD_TUNING`; the notes' `midi`
is what the reader worked out.)

### 9.1 How it reads

| Step | File | What happens |
|---|---|---|
| ink on lines | `segment.ts` | Components of the strip WITH its lines that stand free are whole numbers (line blanked behind them); what hangs on a line comes from the line-free strip and is `fused`. Stacked pieces of a cut glyph are rejoined; numbers welded to their chord neighbours, to an arc or to a stem are cut out again (`findWeldedBlobs`). Bar lines are re-checked (`barlineSolidity`): a column of stacked numbers the layout took for a bar line does not swallow its numbers. |
| touching chords | `segment.ts` (`findStackCuts`) | (Added after the unseen corpus, section 12.) Numbers of a chord that touch (digits about as tall as the line spacing, knock-outs that meet) are cut apart first, near the midpoint between two lines on the lightest grey row, when both parts are number-sized and centred on their lines; never in the staff's first space (the clef), never through a straight-sided column (bar line) or a long narrow stroke (a stem through the staff). |
| stems on the line | `recognize.ts` | (Added after section 12.) A piece on the outer line that reaches out of the staff further than a number could, hardly reaches in, is thin where it meets the line and has no digit beside it is a stem hanging from the line (alphaTab style), not a 1. TAB letters smaller than a space are accepted at the very start of the staff. |
| digit size, style | `segment.ts`, `numbers.ts` | Median digit height and centre offset of the staff; `lineThroughEvidence` measures how dark the line is inside the glyphs against the bare line (struck through: about 1 or more; blanked: well below). |
| box | `glyph.ts` | `refineBox`: every box goes to the half-maximum outline of its own ink (sub-pixel). Templates are cut by the same rule, so a soft glyph and a sharp one match in scale. |
| blur level | `recognize.ts` | Templates exist at five blur levels (`BLUR_LEVELS`); the staff uses the level at which a dozen sample digits correlate best. Samples are cut from two-digit numbers too when lone digits are scarce (a riff at the 12th fret). On a struck staff the samples are compared line-subtracted against struck templates, and the level is held at 2 when the staff is clearly struck (evidence >= 1.05) and level 2 explains the digits within 0.08 of the preferred level: there the extra softness only washes out 0 / 6 / 8 / 9. |
| classify | `glyph.ts`, `templates.ts` | Normalised correlation of a 16-row grey patch with 430 templates (10 digits + `x ( ) < > h p b s r / \ ~`, rests, time-signature numerals) drawn from 14 text families (33 faces) and 4 music fonts. One-pixel shift search; relative glyph height as soft evidence. |
| struck-through | `templates.ts`, `numbers.ts` | The bare line (median profile around the glyph) is subtracted from the patch, and the patch is compared with `struckTemplates`: glyphs whose rows under the line were erased BEFORE blurring. Built as plain template minus the blurred erased band (blur and resampling are linear; tested equal to the direct drawing to 1e-4), each template drawn on first use. Geometries in half rows, at most 12 per staff, so a reading depends on the staff alone. |
| touching digits, broken digits | `numbers.ts` | Neighbouring pieces of a line form a cluster; the split into glyphs is the one the classifier likes best (`readCluster`), a wide blob is cut where the pair of templates laid side by side explains the whole blob better than one template (`correlateComposite`). |
| one face per staff | `numbers.ts` | Faces are rated on the clearly read digits; doubtful glyphs are re-read with other faces penalised and close calls settled head to head inside the likely faces on the pixels where the two digits differ (`discriminate`). |
| numbers, columns | `numbers.ts`, `segment.ts` | Digits closer than 0.36 digit heights form a fret; numbers above one another form an event; brackets count only in pairs (also when both read as 1s: a tight "1 5 1" is no fret, "(5)" is). |
| sanity | `numbers.ts`, `recognize.ts` | Fret > 24, leading zero, wide gap inside a number ("10" or "1 0"), chord span > 5 frets: used to choose among near-equal alternatives and to lower confidence, never to rewrite silently; the raw reading stays in `alternatives`. A staff where 80 % or more of the numbers are lone 1s (stems of a notation staff sent here, bar-line pieces) gets them all below 0.5 and a warning. |
| rhythm | `rhythm.ts`, `header.ts` | Stems under or over the staff, beams / flags counted at the tip; rests and the time signature from music-font templates. What stems cannot show (half vs quarter, dots) is solved per measure against the time signature (printed, from `options.context`, remembered from an earlier staff of the page, or inferred from measures that add up) using the spacing; inferred values get confidence below 0.5-0.6 and alternatives. |
| marks | `marks.ts` | Arcs between two numbers of a string (tie if equal frets, else `h` / `p`), slanted strokes (slides), strokes climbing above the staff into an arrow head (bends). |
| reliability | `recognize.ts` | Mean correlation of the digits read: 0.95+ on good pictures. Towards 0.8 every confidence is scaled down, weak matches are dropped and a `low-quality` warning is raised. A number also loses confidence when it matches clearly worse than the rest of its staff, when its digits had to be cut apart, and when a line runs through it on a soft picture. |

### 9.2 Measured

Corpus: the 31 fixtures with a tab staff (57 staves, 1111 fret numbers; five digit faces; 100 /
150 / 220 dpi). `node src/core/omr/eval/cli.cjs --subset tab|linked --no-strips`, final build:

| Tier | Subset | tabP % | tabR % | fret % | string % | tabDur % | tabMeasEx % |
|---|---|---|---|---|---|---|---|
| clean | tab / linked | 100 / 100 | 100 / 100 | 100 / 100 | 100 / 100 | 100 / 100 | 100 / 100 |
| scan | tab / linked | 100 / 100 | 100 / 100 | 99.9 / 100 | 100 / 100 | 100 / 100 | 97.0 / 100 |
| photo-good | tab / linked | 99.9 / 100 | 100 / 99.8 | 99.3 / 99.8 | 100 / 100 | 100 / 100 | 94.1 / 96.6 |
| photo-bad | tab / linked | 87.7 / 76.3 | 68.8 / 72.9 | 64.7 / 59.0 | 100 / 100 | 72.9 / 100 | 11.9 / 17.9 |
| seed 2: scan | tab / linked | 100 / 100 | 100 / 99.5 | 99.9 / 100 | 100 / 100 | 100 / 100 | 97.0 / 99.1 |
| seed 2: photo-good | tab / linked | 100 / 100 | 100 / 99.5 | 98.1 / 98.4 | 100 / 100 | 100 / 100 | 89.1 / 93.2 |
| seed 2: photo-bad | tab / linked | 84.3 / 64.5 | 83.3 / 65.9 | 67.1 / 63.1 | 100 / 100 | 82.4 / 73.1 | 9.9 / 16.2 |

Both subsets together, strip-level tool (section 9.5, same matching rule), seed 1: fret accuracy
100 / 99.9 / 99.5 / 62.4 % for clean / scan / photo-good / photo-bad, precision and recall 100 /
100, 100 / 100, 99.9 / 99.9, 82.8 / 70.4. Wrong frets reported with confidence >= 0.5: 0 of 0,
0 of 1, 0 of 6, 2 of 294. The price: 0.8 / 2.7 / 5.5 % of the RIGHT frets at clean / scan /
photo-good are reported below 0.5 as well (mean confidence of right frets 0.96 / 0.92 / 0.89).
photo-bad is not usable without proofreading: 100-dpi pages there are illegible to a person too,
and such staves carry the `low-quality` warning and confidences below 0.5 (mean 0.19 for the
wrong frets). tabMeasEx falls behind the fret numbers because it also needs every bar line of the
layout stage to be right.

The reader's own pages (`tab/fixtures/`, written by `scripts/omr-digit-templates.cjs --fixtures`;
12 pages, 30 staves, 751 numbers) test what the corpus cannot: two faces with NO templates
(Carlito, Caladea), lines struck through held-out faces, a four-line bass staff, technique marks,
typewriter-style tab. Seed 1 (seed 2 in brackets):

| Tier | P % / R % | fret % | held-out, line blanked | held-out, line struck through | marks read / right |
|---|---|---|---|---|---|
| clean | 100 / 100 | 100 (100) | 100 (5 pages, incl. bass) | 100 and 100 | 85 / 85 of 86 |
| scan | 99.9 / 99.9 | 98.9 (98.5) | 98.8 - 100 | 94.9 and 100 | 77 / 77 of 85 |
| photo-good | 98.5 / 97.7 | 92.9 (96.0) | 79.0 (bold at 100 dpi), 92.3, 100, 100, 100 | 82.8 and 94.0 | 60 / 56 of 77 found |
| photo-bad | 77.4 / 74.4 | 29.2 (28.9) | 15 - 43 | 3 - 18 | not usable |

Before the line-aware blur choice the struck held-out pages read 76.5 / 90.4 % at scan and 69.4 /
89.2 % at photo-good; the corpus' struck page `tab-random-ls-150` 72.5 % at photo-good (now 90 %).

Leave-one-family-out on the templates themselves (`glyph.test.ts`): 247 of 247 digits right when
sharp, 246 at blur levels 1 and 2, 243 at level 3.

Speed: process CPU time per staff strip (`readTabStaff`), corpus strips averaging 19.5 numbers,
on a 4-core machine under load 8-11 from other jobs. Warm (second pass): median 31 / 29 / 39 /
76 ms, p95 87 / 73 / 109 / 214 ms for clean / scan / photo-good / photo-bad; first pass in a
fresh process: median 31-42 ms (81 at photo-bad), p95 113-119 ms (180). The reader's own pages
(25 numbers a strip, many of them struck through or marked): warm median 71 / 84 / 96 / 152 ms.
Once per session: about 15 ms to decode the templates and 15-40 ms for each blur level when it
is first tried; a struck geometry costs up to 20-30 ms when every one of its templates gets drawn
(only those a glyph is compared with are).

### 9.3 Known limits

- A line struck through the numbers hides the middle of 0 / 6 / 8 / 9 and the bar of 4. Clean
  pages read (corpus and held-out faces 100 %); blurred ones still confuse 0, 6, 8, 9 on faces the
  reader has no templates of (82.8-94 % at photo-good), almost always with confidence below 0.5
  and the right digit among the alternatives. The level-2 hold is tuned on these pages; a strongly
  blurred struck staff (score gap above 0.08) keeps the softer templates.
- The digit height is the median height of the ink on the lines before anything is read: a staff
  made mostly of dead-note x's and angle-bracket harmonics, with its numbers welded to ties, can
  get it wrong (`tech-marks-through-inter-220` at photo-good: 59 % recall on one staff).
- Rhythm: augmentation dots and half notes are inferred, not seen (many engravers print neither
  in tab); without any time signature and with ambiguous measures the guess is 4/4. Tuplet
  numbers, whole and half rests (the hanging / sitting blocks) and stems above the staff with
  flags are not read or not tested. The memory of a page's time signature assumes staves are read
  top to bottom.
- Marks: arcs must end on two neighbouring numbers of one string; "H" / "P" printed over an arc
  are not read (the direction of the fret change decides); a bend's "full" / "1/2" is not read;
  vibrato, trills, palm-mute lines, let-ring, tapping marks are not looked for. At scan and worse
  thin strokes near a line (slides) fuse with it and are missed (never invented: 0 false marks on
  the corpus at clean, scan and photo-good); a slide stroke touching a number can be read as an
  extra digit (one case at scan, confidence 0.02).
- The corpus engraver draws no visible arc for ties in tab, so its 7 tab ties cannot be seen.
- Chord symbols, lyrics, tempo and section text are not read here (`texts` stays empty).
- A notation staff sent to the tab reader (kind misjudged) yields stems read as lone 1s and rests;
  they come out below 0.5 with a warning, not as frets.
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
good ones. No answer, a malformed answer, an error or an abort (also when the model itself
ignores the signal) leaves the reading as it was, with an `ai-unavailable` warning.

### 9.5 Tools and data

```bash
node src/core/omr/tab/dev/tab-eval.cjs                       # corpus, all tiers: per tier / font / dpi, confusions, calibration, time
node src/core/omr/tab/dev/tab-eval.cjs --tier scan --dump    # + e2e/out/omr/tab-mistakes.<tier>.png (look at it with Read)
node src/core/omr/tab/dev/tab-eval.cjs --match ode --show    # + every strip with its reading drawn in
node src/core/omr/tab/dev/tab-eval.cjs --own --fixtures      # the reader's own pages (held-out faces, marks, bass)
node src/core/omr/tab/dev/tab-eval.cjs --explain             # classifier ranking of every misread number
node scripts/omr-digit-templates.cjs [--sheet]               # rebuild tab/digit-templates.data.ts (61 KB; contact sheet in e2e/out/omr)
node scripts/omr-digit-templates.cjs --fixtures              # rebuild tab/fixtures/ (0.4 MB)
npx vitest run src/core/omr/tab                              # 74 tests, about 20-30 s
```

Both generator commands reproduce the committed files byte for byte (checked on this build).
`tab-eval` caches the staff strips of every fixture and tier under `e2e/out/omr/tab-cache/`
(`--rebuild` after the foundation changes). `dev/synth.ts` draws synthetic strips from the
templates for unit tests. Templates: every glyph drawn once in the bundled Chromium, cropped to
its ink, 16 rows, 4 bits per pixel, near-duplicates within a class merged (each template keeps
the list of faces it stands for). Carlito and Caladea are installed but deliberately left out.

## 10. Notation recognizer (`notation/`)

`recognizeNotationStaff` reads one five-line staff strip: clef, key signature, time signature,
then notes, chords and rests in time order with pitch (clef, key signature, accidentals with
bar-scoped persistence, ties, the guitar octave rule: `pitch.midi` sounds an octave below
`pitch.written`), duration (value, dots, triplets, beams / flags), stem direction, voice (two
voices in simple cases), ties, and the boxes of text above the staff for the caller's OCR. Every
element carries its box in page px, a confidence and, where a doubt exists, alternatives. Import
it from `@/core/omr/notation`. Digest: `notation/API.md`.

```ts
import { createNotationRecognizer, recognizeNotationStaff, analyzeNotationStaff, toReading } from '@/core/omr/notation';

const page = await recognizePage(gray, { notation: recognizeNotationStaff, tab: recognizeTabStaff });
const reading = recognizeNotationStaff(extractStaff(analysis, i));          // sync without options.ai
const r2 = await recognizeNotationStaff(input, { ai: visionModel, context: { beats: 3, beatValue: 4 } });
const a = analyzeNotationStaff(input);   // every stage in strip px: header, strokes, heads, chords, rests, events, measureOk, quality
```

Clef, key and time carry down the page: a staff takes what it does not print from the nearest
staff above it read from the same page picture (`input.page.gray`), then from `options.context`
(which wins). `createNotationRecognizer()` does the same with an explicit per-page memory.

### 10.1 How it reads

| Step | File | What happens |
|---|---|---|
| strip | `strip.ts` | Second, more tolerant line-removal pass; symbol ink (grey, lines whitened); rows near staff / ledger lines weighted down for matching; distance transform, components, row prefix sums. `stripQuality`: paper noise between the lines and the half-darkness width of the lines (blur), measured on the strip itself. |
| header | `header.ts` | G / F clef by template (any treble clef is read the guitar way); key signature as a chain of sharps / flats at the conventional positions (a lone sign that is really a rest, the accidental of the first note or the stem of the first note is rejected); time signature as the first block filling the staff, split into its two numbers, each matched against digits scaled to its size, or C / cut C. |
| stems | `stems.ts` | Thin vertical strokes of the line-free ink; pieces of one stem left side by side by a perspective correction are joined. |
| heads | `heads.ts` | Seeds from two font-independent detectors (distance-transform peaks for filled heads, two-walls-and-a-hole for open ones), snapped to staff positions, scored by ZNCC against the head glyphs of four music fonts, hole measured on the grey strip (filled / half / whole). Heads off the staff need their ledger lines (in the binary, or as a faint even row in the grey picture); beyond the guitar range (below drop-D's D3, above G6 written) three quarters of them. |
| chords | `notes.ts` | Heads hang on the stem they sit beside (direction from the side), displaced seconds join their neighbour, a "stroke" made of the outlines of stacked open heads is not a stem, stemless whole heads a head-width apart form one chord. Beams / flags counted at the free end; augmentation dots in the space, ON the line (some engravers leave them there), or as grey evidence. |
| marks | `marks.ts` | Accidentals in front of heads (sharp, flat, natural); ties between neighbouring heads at the same position (an arc followed column by column, through staff lines, including high arcs that leave the heads from their tops, and ties leaving / entering the staff); tuplet "3" in music-font digits or an italic text face, alone (not a letter of a word) and, with a bracket, between two arms. |
| rests | `rests.ts` | Whole / half / quarter / 8th / 16th / 32nd rests, their dots (in the third space or on the middle line), moved rests of a second voice. |
| rhythm | `rhythm.ts`, `index.ts` | Per measure the durations must fill the metre (printed, carried, from context, or the length most measures agree on). Each event has alternative readings with costs (missed / extra dot, one beam more / fewer, open head filled in by blur, triplet); the cheapest consistent set wins and what changed is marked uncertain. Groups of three equal notes become triplets when the measure needs it (a piece in triplets throughout no longer reads as 9/8); a "3" that breaks a measure that is right without it is dropped; a missed bar line (two whole measures in one) and pickups are left alone; what still does not add up is reported (`measure-mismatch`). Two voices are split by stem direction. |
| output | `index.ts` | Boxes in page px, confidences 0..1 (head / glyph match, measure check), scaled down by the picture quality (rhythm most), `low-quality` warning below 0.5; on poor pictures the neighbouring pitches are offered as alternatives; with no clef, no key and nothing carried the pitches are capped below 0.5 and a warning says the key is unknown. |
| second opinion | `index.ts` | With `options.ai`, each measure that does not add up is cropped and shown to the vision model (`measurePrompt`); its answer is taken only if it lists the same events and fills the measure exactly (`source: 'merged'`). |

### 10.2 Supported symbols

Treble clef (with or without the 8: guitar convention), bass clef (read at pitch); key signatures
up to 7 sharps / flats; time signatures from digits (2 to 16 beats over 2, 4, 8 or 16) and C /
cut C; filled, half and whole heads on and off the staff (ledger lines both ways); stems both ways,
beams and flags up to 32nd, one or two augmentation dots; rests whole to 32nd (a lone whole rest
fills its measure whatever the metre); sharps, flats, naturals in front of heads, kept to the end
of the bar at their position and across ties; ties; chords including seconds; two voices with
opposite stems; triplets (marked with a 3, bracketed or not, or inferred from the measure); grace
notes are ignored (not reported). Not read: double sharps / flats, tuplets other than 3, clef / key
/ time changes inside a staff, C clefs, 8va lines, repeats and voltas beyond what the layout stage
reports as bar-line types, articulations, dynamics, fingerings, slurs (an arc between two
different pitches is never taken for a tie, and is not reported).

### 10.3 Measured

Corpus: the 50 fixtures with a notation staff (notation + linked: 104 staves, 1786 heads, 57
rests, 429 measures), `node src/core/omr/eval/cli.cjs --no-strips`, seed 1 (the CLI's own
matching rules: heads within 0.6 space, measures exact only when every event is right).

| Tier | noteP % | noteR % | pitch % | dur % | rest F1 | acc % | tie % | measEx % | key % | time % |
|---|---|---|---|---|---|---|---|---|---|---|
| clean | 100 | 100 | 100 | 100 | 1.000 | 100 | 100 (13) | 100 | 100 | 100 |
| scan | 100 | 100 | 100 | 100 | 1.000 | 100 | 92.3 | 100 | 100 | 100 |
| photo-good | 100 | 100 | 100 | 100 | 1.000 | 100 | 84.6 | 99.1 | 100 | 100 |
| photo-bad | 99.3 | 84.0 | 99.1 | 83.4 | 0.879 | 92.1 | 10.0 | 51.7 | 100 | 83.0 |

Seed 2 (`node src/core/omr/notation/tools/dev.cjs run --tier ... --seed 2`, same matching): scan
100 / 100 / 100 / 99.9, measEx 99.3; photo-good 99.9 / 99.9 / 99.9 / 100, measEx 98.1, rest F1
0.991, accidentals 98.8; photo-bad 98.6 / 74.2 / 99.5 / 78.6, measEx 36.1 (P / R / pitch / dur).
The ties are few (13) and the misses are the ties that leave the staff at its end, drawn along a
staff line by the corpus engraver.

**Another engraver.** Every corpus page (and every template) comes from VexFlow, so
`notation/tools/alphatab-pages.cjs` renders 15 guitar pages with alphaTab instead (its own
spacing, beaming, tie shapes, dots placed ON the line, italic "3" brackets, the time signature
only on the first system, grey staff lines on three pages, dynamics, "Guitar Standard Tuning"
and a watermark as clutter; 31 staves, 627 heads, 141 measures, 156-313 dpi). Ground truth comes
from alphaTab's own model and bounds. First contact (clean): note recall 99.8 %, pitch 100 %,
but durations 84.6 %, ties 2 of 5, measures exact 78.0 %, one key misread. Those pages then
served to find what VexFlow had hidden (about a dozen fixes: on-line dots, high ties, italic and
bracketed 3, triplets throughout, page memory of the metre, split stems, stacked-head walls,
whole-note seconds, faint ledger lines, the first note's stem taken for a flat), so they are a
development set now, not a blind test. After (`dev.cjs run --alphatab`):

| Tier | noteP % | noteR % | pitch % | dur % | measEx % | key % | time % | seed 2: R / pitch / dur / measEx |
|---|---|---|---|---|---|---|---|---|
| clean | 100 | 100 | 100 | 100 | 97.2 | 100 | 100 | - |
| scan | 100 | 100 | 100 | 99.6 | 98.6 | 100 | 100 | 99.7 / 98.4 / 100 / 94.3 |
| photo-good | 100 | 99.8 | 100 | 99.8 | 96.5 | 100 | 100 | 97.8 / 99.8 / 98.9 / 90.1 |
| photo-bad | 98.8 | 67.5 | 99.8 | 70.7 | 35.5 | 100 | 100 | 68.1 / 100 / 78.9 / 39.7 |

The clean measures that are not exact are the two-voice page, where two voices struck together
are listed in an order the exact-measure check does not expect, and its last bar, where two whole
notes of the two voices are printed as one chord and read as one. The seed-2 scan pitch errors are
one page whose staff start (clef, three-flat key) the layout stage cut off; those notes are
reported below 0.5 with a warning.

The recognizer's own pages (`notation/fixtures/`: two voices, C and cut time, bracketed and
unbracketed triplets, grace notes, bass clef; `dev.cjs extra`): 36 of 36 measures exact at clean,
scan and photo-good; 5 of 36 at photo-bad (mostly bar lines the layout stage missed, which shifts
every measure after them).

**Confidence.** Wrong readings reported with confidence >= 0.5 (seed 1, `dev.cjs run` prints this
`calibration` line). Clean, scan, photo-good corpus: there are no wrong pitches or durations to
report, and no right one is reported below 0.5. Photo-bad corpus: pitches 13 wrong of 1500 (11
at >= 0.5; 80 right ones below 0.5); durations 240 wrong of 1409 (2 at >= 0.5; the price: 1015
of the right ones are below 0.5 too, and the staff carries `low-quality`); extra heads 11 (8 at
>= 0.5). Seed 2: scan 1 wrong duration (sure), photo-good 2 wrong pitches and 1 extra head (sure).
The picture-quality score separates the tiers: paper noise p90 6.9 (scan) and 8.6 (photo-good)
against p10 10.4 (photo-bad); line width 0.2-0.3 space against 0.3-0.5.

**Speed.** Process CPU time per staff (`dev.cjs run`, 4-core machine shared with other jobs, load
6-10): corpus clean median 178 ms, p90 250 ms, max 576 ms; photo-good median 174 ms; alphaTab
pages (wider strips) median 215 ms, p90 387 ms. Stages (mean wall ms): strip 40-55, header
40-60, heads 65-80, chords / tails / dots 20-25, the rest under 10 each. A typical 8-staff page:
1.5-2 s in a worker.

### 10.4 Known limits

- photo-bad: a sixth of the heads are not found (blur near 0.16 space with JPEG noise erases
  stems and fills open heads) and a sixth of the durations are wrong; such staves carry
  `low-quality` and their rhythm is reported as guesses. Pitch of what is found stays near 99 %.
- Ties: the 13 corpus ties (and 4 alphaTab ones) are a thin sample. A tie that leaves the staff
  at its end and is drawn along a staff line is missed on soft pictures. Slurs are not read.
- Rhythm needs the metre: on a page whose first staff has no readable time signature the bar
  length is inferred from the measures that agree, so a piece in unmarked triplets with no time
  signature anywhere reads as 9/8 (or 12/8).
- Two voices: simple cases only (opposite stems, rests moved up / down). Notes of both voices on
  one stem, or whole notes of both voices at one place, read as one chord.
- A staff whose start the layout stage cuts off (seen on light grey staff lines) loses its clef
  and key signature: pitches then assume no key (flagged, below 0.5) unless a staff above
  provided it.
- Texts above the staff are boxes with `text: ''` (kind guessed from height: title or chord
  symbol); the caller's OCR fills them. Fingering digits inside the staff are ignored.
- Templates come from four music fonts (VexFlow's Bravura, Gonville, Petaluma, Leland) plus five
  text faces for the italic 3; music fonts unlike these (jazz / handwritten fonts other than
  Petaluma) are untested.
- The second opinion (`refineWithModel`) is tested against fakes only; no real model was
  available.

### 10.5 Tools and data

```bash
node src/core/omr/notation/tools/dev.cjs run --tier clean,scan --match ode --mistakes --dump   # corpus: metrics, every mistake, calibration, CPU; annotated strips e2e/out/omr/nt-*.png
node src/core/omr/notation/tools/dev.cjs run --alphatab --tier photo-good --seed 2             # the alphaTab pages instead
node src/core/omr/notation/tools/dev.cjs run --tier photo-bad --staffstats                     # per staff: quality, head scores, errors
node src/core/omr/notation/tools/dev.cjs extra --tier scan                                     # the recognizer's own pages
node src/core/omr/notation/tools/dev.cjs inspect <fixture> <tier> <staff> <x0> <x1>            # strokes, heads, chords, events of a stretch
node src/core/omr/notation/tools/crop.cjs <in.png> <out.png> x y w h [scale]                    # enlarge part of a dump to look at it
node src/core/omr/notation/tools/alphatab-pages.cjs                                            # rebuild notation/fixtures/alphatab/ (15 pages, 0.7 MB)
node scripts/omr-symbol-templates.cjs [--png dir]                                              # rebuild templates.data.ts (150 templates, 39 kB)
node scripts/omr-symbol-templates.cjs --extra                                                  # rebuild notation/fixtures/ (own pages)
npx vitest run src/core/omr/notation                                                           # 54 tests, about 45 s
```

## 11. The page pipeline (`pipeline.ts`, `reconcile.ts`, `classify-page.ts`, `summary.ts`, `worker/`, `to-song.ts`)

One entry point: `recognizePage(image, options)` (grey or RGBA `ImageData`) runs analysis, every
staff with the built-in recognizers (`options.tab` / `options.notation` replace them, `null` skips
them), assembly, linking and the checks below, with `onProgress` (stage, fraction, a sentence) and
`signal` (stops between staves, rejects with an `AbortError`). `recognizeDocument(images)` reads pages
in order as one piece: key, time and clef carry over (a running context is passed to every staff;
printed signatures win), the systems are joined into one list of measures (`OmrDocument.measures`).

| Step | File | What happens |
|---|---|---|
| context | `pipeline.ts` | Clef / key / time read on a staff (confidence >= 0.5) carry to the next staff and page; each staff gets `timeInForce` / `keyInForce` with their source (`printed`, `carried`, `given`, `assumed` = 4/4 nothing printed). |
| linking | `reconcile.ts` `linkSystem` | Notation chords and tab columns of a system are aligned by dynamic programming on x, with the bar lines both staves share as anchors (so skew and a different header width do not matter). Note pairs: equal pitch -> both confidences combined; a disagreement one reader listed as its runner-up -> taken, `resolved` (0.5-0.7); else both below 0.5, each with the other's reading as first alternative, `staves-disagree`. Tied-to notes may be missing from the tab; anything else seen on one staff only is `unlinked`. |
| rhythm | `reconcileRhythm`, `checkMeasures`, `estimateRhythmFromSpacing` | Tab without stems takes the notation's durations (`merged`). Where notation and tab stems disagree, the staff whose measure adds up wins. Every measure is checked against the metre (`ticks`, `expectedTicks`, `addsUp`; first measure of the piece may be a `pickup`, last may complete it; linked tab takes its partner's verdict since it prints no rests). Tab with no rhythm anywhere: durations from spacing (DP over sixteenths to fill the bar exactly; `inferred`, 0.25, `rhythm-estimated` on the measure). |
| worker | `worker/client.ts`, `protocol.ts`, `omr.worker.ts` | `createOmrWorker()` starts a module worker (Vite bundles it as its own chunk; the client is ~8 kB). Cancel: a `cancel` message, then `terminate()` after `cancelGraceMs` if a staff is still running; a new worker on the next call. A vision model cannot live in the worker: the worker asks the page (`ai-ask` / `ai-answer`). `{ worker: 'inline' }` runs the same protocol in this thread (tests). |
| classifier | `classify-page.ts` | `classifyPage(image)`: staff finder on a copy reduced to <= 1800 px; staves whose lines are mostly gaps on the line binarisation (text rows that line up) are dropped; six-line "staves" broken into equal dashes are ASCII tab -> `text`; no staves but >= 3 lines of text -> `text`; else `not-music`. |
| summary | `summary.ts` | `summarizePage` / `summarizeDocument`: verdict, headline, plain sentences (counts read / uncertain, notation-tab agreement, where the rhythm comes from, measures that do not add up, key and time with their source), and the proofreading list ranked by impact (staff kind doubts and key / time guesses first, then measures that do not add up, disagreements, guesses), every item with its box. |
| Song | `to-song.ts` | `omrToSong(pageOrDoc)`: one guitar track, one bar per measure, tab strings / frets (notation alone: frets low on the neck), durations as read, measures padded / cut to the metre with warnings, chord symbols that were read, ties, dead notes, harmonics; `estimatedRhythm` when spacing was used. Always a valid Song. |

Measured with `node e2e/omr-page.cjs` (three full 1240 x 1754 corpus pages, Chromium, dev server,
machine under load 8-11): BROWSER_NUMBERS

`classifyPage` over the corpora (`cli.cjs --classify [--corpus unseen]`, expected kind from the
subset): original corpus 66 / 66 right at clean, scan and photo-good, 60 / 66 at photo-bad (the
misses are staves the layout stage does not find there, and one notation + tab page whose
notation staff is lost); unseen corpus 27 / 27, 27 / 27, 27 / 27, 20 / 27. Median 0.15-0.45 s
per page (reduced copy), max 2.3 s, on the loaded machine. Typed-dash ASCII tab and a page of text
are recognised as `text` (unit tests); a page whose "staff lines" are rows of words is not taken
for music.

## 12. The unseen corpus (`fixtures-unseen/`, `scripts/omr-unseen.cjs`)

Everything above was developed on pages from one generator (VexFlow 4). To measure overfitting,
`scripts/omr-unseen.cjs` engraves 27 pages (8 notation, 11 tab, 8 notation + tab; 82 staves, 877
heads, 1126 tab numbers, 349 measures; 0.55 MB) independently:

- **Own layout engine** (23 pages): VexFlow's Bravura, Gonville, Petaluma (and Leland once) used as
  glyph outlines only; staff space 7-24 px; staff lines 0.05-0.22 space thick; spacing 0.7-1.35x;
  stems 2.7-4.1 spaces; flat / normal / steep beams; cue-size notes (2 pages); triplets with an
  italic 3; no bar line at the start of single staves; ragged last systems; titles, tempo, chord
  symbols. Tab numbers in faces no template was drawn from: IPAGothic (slashed 0), WenQuanYi Zen
  Hei, Unifont (pixel font), Caladea Italic, a synthetic condensed Carlito Bold, a synthetic heavy
  Liberation Sans, small Liberation Serif digits, stroke-drawn "handwritten" digits with seeded
  jitter; knocked out of the line or struck through; tab with stems / beams / rests below and a
  big time signature; small TAB letters.
- **alphaTab** (4 pages, `ua-`): another engraving program (tab with rhythm stems drawn THROUGH the
  staff from the numbers, plain tab, score + tab), rendered offline in Chromium with its own Bravura
  served from node_modules (works; no network).

Truth in the corpus format from the drawing itself (SVG glyph boxes, canvas text metrics, alphaTab's
bounds lookup), checked against the ink. `node scripts/omr-unseen.cjs [--only id] [--overlay]`
rebuilds it; `node src/core/omr/eval/cli.cjs --corpus unseen [--mistakes --dump-mistakes]` scores it.

First contact showed, on CLEAN pages: tab recall 86.6 % (tab-only) and 88.9 % (linked) against
100 % on the original corpus, whole chord columns dropped when their numbers touch; cue-size notes
never found; alphaTab's stems read as 1s; TAB letters read as 1s; notation recall 91.8 %. Fixes, each
checked to leave the original corpus unchanged (same mistakes, page for page, at scan and
photo-good; `tab` unit tests): `findStackCuts` (touching chords), the hanging-stem filter, small
TAB letters (section 9.1). Fixes to the generator itself (not the reader) where it was unrealistic:
SVG strokes leaking onto knock-out boxes, header widths that let the first chord overprint the key
and time signature on Petaluma pages, triplet numbers placed four spaces away from their beam.

UNSEEN_TABLE

Not fixed (documented limits): cue-size notes are treated like grace notes by design (both cue pages
read nearly empty: notation recall stays near 92 % overall at clean); Petaluma's hand-drawn time
signature digits printed at two spaces touch and are read as a note head + nothing; a sixteenth
rest's knob placed tight after a note is read as an augmentation dot (confident, wrong); slashed /
dotted zeros and Unifont digits are confused more often (mostly below 0.5); at photo-good the
alphaTab stems still produce extra 1s (28 on one page, all near 0.5 confidence).

## 13. AI-assisted reading (`ai-assist.ts`, `ai-platform.ts`)

Optional: the app works without it. `createPlatformAiClient()` wraps `@/core/platform` `askJson` (tier
`complex`, pictures as canvases; checks `aiAllowed()` before every request and throws
`OmrAiUnavailableError` with a sentence to show when it is off, unavailable or cannot see pictures).

- **(a) Page reading**: `readPageWithAi(gray, page, client)` crops each system found by the
  classical reader (with room for chord symbols), scales it so a staff space is ~14 px (a whole
  page shrunk to the model's resolution leaves digits a few pixels tall), and sends them in batches
  of `client.maxImages` (<= 4) with `OMR_SYSTEM_PROMPT` (guitar conventions: top tab line = string
  1, written treble pitch an octave above sounding, accidentals last to the bar line; never invent
  notes or "complete" a bar; mark `uncertain`) and `pageReadingPrompt` (exact JSON shape: title,
  tempo, per system key / time, per measure chords, lyrics, events with rest, duration, dots,
  triplet, notes {pitch, string, fret, tie}, uncertain, doubts). No staves found: the whole page,
  reduced to <= 1800 px. `parseAiReading` validates and repairs (unknown pitches, strings, frets > 24,
  two notes on a string, bad durations dropped and listed in `repairs`; pitch and string / fret that
  contradict each other mark the event `inconsistent`); an answer unusable as a whole throws so the
  platform asks once more with the reason.
- **(b) Fusion**: `fuseAiReading(page, reading, systemMap)` aligns measures (by count, else by
  content), then events (DP on pitches and durations). Agreement raises confidence (the AI counts
  as 0.7, 0.35 when it said `uncertain` or contradicted itself). A different pitch or fret is taken
  only for a guess (< 0.6) that the picture reader also had as an alternative, or that the linked
  tab confirms, or (frets) for a very weak reading inside a playable span: `resolved`. Otherwise the
  picture reading stays, gets the AI's as first alternative and `ai-disagree` (and drops below 0.5
  unless it was >= 0.85). AI durations are taken only where they make a measure that did not add up
  add up with the same events. Notes only the AI saw are inserted as guesses (0.35, `ai-only`) only
  where the measure is short of time; else an `ai-only` note on the measure. Chord symbols fill the
  located text boxes; title / composer / tempo fill page texts. Measures are re-checked.
- **(c) Measure question**: `measuresToCheck(page)` ranks measures (do not add up, then low
  confidence); `secondOpinionOnMeasure` crops the measure (both staves of a linked pair), enlarges it
  (~22 px per space), tells the model what was found and asks for the events (`measureQuestionPrompt`),
  then fuses that measure only.

Vision models misread dense notation and miscount repeated notes; nothing they say is taken as
ground truth. All of this is unit-tested with fake answers (good, partial, malformed, contradictory,
failing); no real model was available in this environment, so its accuracy on real pages is unmeasured.
