# `@/core/omr` — API digest

Sheet recognition, image side: page image → staves, systems, bar lines, measures, and one cleaned
strip per staff for the symbol recognizers. Full guide: [README.md](./README.md). Browser-safe
code is exported from `@/core/omr`; the Node-only test harness lives in `@/core/omr/eval/*`.

## Pipeline

```ts
analyzePage(gray: GrayImage, opts?: { targetSpace?: number }): PageAnalysis      // { pre, layout, page }
extractStaff(analysis, staffIndex, opts?: { space?, above?, below?, side? }): StaffInput
assemblePage(analysis, readings: (StaffReading | null)[]): OmrPage
recognizePage(gray, { tab?, notation? }, opts?): Promise<OmrPage>
rgbaToGray(rgba, width, height): GrayImage                                       // from canvas ImageData
```

## Output model (`types.ts`)

`OmrPage { width, height, staffSpace, systems, texts, quality, warnings }` →
`OmrSystem { staves, texts }` → `OmrStaff { kind, lineCount, geometry, clef?, keySignature?,
timeSignature?, barlines, measures, linkedStaffId?, tuning? }` → `OmrMeasure { index, x0, x1,
events }` → `OmrNotationEvent | OmrTabEvent`. Every element has `id`, `bbox` (px of the original
image), `confidence` (0..1), optional `alternatives`. Pitch is sounding MIDI (`pitch.midi`), the
written pitch is `pitch.written`; strings count from 1 = high E = top tab line.

Recognizer contract: `RecognizeTabStaff`, `RecognizeNotationStaff` =
`(input: StaffInput, options?: RecognizeOptions) => StaffReading | Promise<StaffReading>`.

## Building blocks

```ts
preprocess(gray, opts?): PreprocessResult        // normalised page: gray, binary, lineBinary, strokeBinary, mesh, noise ...
detectLayout(binary, opts?): LayoutResult        // staves (StaffLayout), systems, noLines, lineMask
detectStaves(binary, opts?): StaffDetection      // StaffGeom[]: xs, ys[line][k], x0, x1, space, thickness
detectBarlines(binary, staff, opts?): BarlineGeom[]
removeStaffLines(binary, staves): { image, mask }
flatten(gray): FlattenResult                     // paper -> white; noise, contrast
binarize(gray, { method?: 'sauvola' | 'wolf' | 'otsu', window?, k? }): BinaryImage
labelComponents(binary): Components
meshMap(mesh, x, y) / meshUnmap(mesh, x, y)      // normalised <-> original coordinates
lineYAt(staff, line, x), staffPositionAt(staff, x, y), yAtStaffPosition(staff, x, pos)
pitchAtStaffPosition(pos, alter?), midiAtFret(string, fret), durationTicks(value, dots?, tuplet?)
```

## Examples

```ts
import { analyzePage, extractStaff, rgbaToGray } from '@/core/omr';

const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
const analysis = analyzePage(rgbaToGray(img.data, img.width, img.height));
for (const system of analysis.page.systems) {
  for (const staff of system.staves) console.log(staff.kind, staff.measures.length, staff.geometry.bbox);
}
const strip = extractStaff(analysis, 0);                  // StaffInput for staff 0
const pos = (strip.lineYs[strip.lineCount - 1] - y) / (strip.space / 2);   // staff position of a strip y
const box = strip.toPageBox(x, y, w, h);                  // back to the original picture
```

```ts
// Tests and tools (Node): corpus, degradation, scoring.
import { loadFixture } from '@/core/omr/eval/fixtures';
import { degrade } from '@/core/omr/eval/degrade';
import { scorePage } from '@/core/omr/eval/metrics';
import { oracleRecognizers } from '@/core/omr/eval/oracle';

const fx = loadFixture('linked-ode-bravura-150');
const shot = degrade(fx.gray, fx.truth, 'photo-good', 7);                 // image + moved ground truth
const page = await recognizePage(shot.gray, oracleRecognizers(shot.truth!));
const score = scorePage(page, shot.truth!);                               // tallies: staves, bar lines, notes, frets ...
```
