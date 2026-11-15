# `@/core/omr/notation` — API digest

Reads one five-line staff strip (from `extractStaff`) into notes, chords and rests with pitch,
duration, ties, accidentals, voices, clef, key and time signature, every element with its box
on the page, a confidence and alternatives. DOM-free typed-array code (browser, Web Worker,
Node). Method, supported symbols, measured accuracy and limits: `../README.md`, section 10.

## Recognizer

```ts
recognizeNotationStaff(input: StaffInput, options?: RecognizeOptions)
  : StaffReading<OmrNotationEvent> | Promise<StaffReading<OmrNotationEvent>>   // RecognizeNotationStaff
createNotationRecognizer(): RecognizeNotationStaff     // same, with an explicit memory; one per page
```

- Synchronous unless `options.ai` is given and a measure does not add up: then that measure is
  shown to the vision model and its answer is taken only if it fills the measure exactly
  (`refineWithModel`). Works without any model.
- Clef / key / time not printed on a staff come from `options.context` (`fifths`, `beats`,
  `beatValue`, `clef`), else from the nearest staff ABOVE it read from the same page picture
  (`input.page.gray`), so `recognizePage(gray, { notation: recognizeNotationStaff })` carries the
  time signature from the first system down the page.
- Output: events in time order with `bbox` in page px, `confidence`, `duration` (`value`, `dots`,
  `tuplet`, `ticks`, `confidence`, `alternatives`), `stem`, `beams` / `flags`, `voice` (2 = lower
  voice of two), `source` (`'image' | 'inferred' | 'merged'`); notes with `staffPosition`, `head`,
  `pitch` (`step`, `alter`, `octave`, `written`, `midi` = sounding, an octave below), `accidental`,
  `tieStart` / `tieStop`, `alternatives` (other accidental readings; neighbouring positions on a
  poor picture); `clef` (`source: 'inferred'`, confidence <= 0.45 when none was seen),
  `keySignature`, `timeSignature` (with `alternatives`); `texts` = boxes of text above the staff
  with `text: ''` for the caller's OCR; `warnings`: `measure-mismatch` (a measure that does not
  add up), `low-quality` (blurred / noisy staff: every confidence is scaled down, rhythm most),
  `other` (clef and key not readable: pitches assume no key).
- Confidence below 0.5 = a guess. A duration changed by the measure check has 0.55 x quality
  factor and keeps the first reading among its `alternatives`.

## Stages (tests, tools, the proofreading screen)

```ts
analyzeNotationStaff(input, options?): StaffAnalysis      // strip px: header, strokes, heads, chords, rests, events, measureTicks, measureOk, mismatches, twoVoices, quality, timings
toReading(analysis, options?): StaffReading<OmrNotationEvent>
contextAfter(reading, before: NotationContext): NotationContext   // clef / key / time in force after a staff
refineWithModel(analysis, ai: OmrVisionModel, signal?): Promise<number>   // measures repaired
measurePrompt(beats, beatValue, count): string            // what the model is asked
buildStrip(input): Strip                                  // nl (lines removed twice), ink, dt, cc, rowWeight ...
stripQuality(strip): StripQuality                         // { noise, lineWidth (spaces), score 0..1 }
readHeader(strip): Header                                 // clef, key (fifths), time, endX
findStrokes(strip, x0, x1): Stroke[]                      // stems, bar lines, uprights of accidentals
findHeads(strip, x0, x1, { strokes? }): Head[]            // kind 'filled' | 'open' | 'whole', pos, score, feat
ledgerSupport(strip, head): number                        // share of the needed ledger lines that exist (binary or faint grey)
solveMeasure(events: RhythmEvent[], targetTicks, maxCost?): MeasureSolution
measureTicks(beats, beatValue): number
pitchOf(pos, alter, clef): OmrPitch;  keyAlterations(fifths);  new AccidentalState(fifths, clef).read(pos, accidental, tieStop, tieStart)
templatesOf(glyph: string): Template[]                    // SMuFL name; four music fonts (+ text faces for 'tuplet3'), 20 px per staff space
```

## Examples

```ts
import { analyzePage, extractStaff, recognizePage } from '@/core/omr';
import { recognizeNotationStaff } from '@/core/omr/notation';

// Whole page: key and time carried from system to system.
const page = await recognizePage(gray, { notation: recognizeNotationStaff, tab: recognizeTabStaff });

// One staff, with the vision model as a second opinion for measures that do not add up.
const analysis = analyzePage(gray);
const reading = await recognizeNotationStaff(extractStaff(analysis, 0), { ai: visionModel });
for (const e of reading.events) {
  if (e.kind === 'chord') console.log(e.notes.map((n) => n.pitch.midi), e.duration.value, e.duration.dots, e.confidence);
}
```

```ts
// Proofreading: why was this measure flagged, how good is the picture, what else could that value be?
import { analyzeNotationStaff } from '@/core/omr/notation';
const a = analyzeNotationStaff(input);
a.measureOk;                                   // per measure: true / false / null (not checked: pickup, unknown metre)
a.quality.score;                               // 0..1; < 0.5 comes with a 'low-quality' warning
a.events[3].rhythm.options;                    // readings with costs, primary first
```

## Tools (Node only, `tools/`)

```bash
node src/core/omr/notation/tools/dev.cjs run --tier clean,scan --match ode --mistakes --dump   # corpus metrics, every mistake, calibration, CPU per staff; strips in e2e/out/omr/nt-*.png
node src/core/omr/notation/tools/dev.cjs run --alphatab --tier photo-good [--seed 2]            # the pages engraved by alphaTab (fixtures/alphatab/)
node src/core/omr/notation/tools/dev.cjs extra [match] [--tier scan]                           # the recognizer's own pages (fixtures/)
node src/core/omr/notation/tools/dev.cjs inspect <fixture> <tier> <staff> <x0> <x1>            # strokes, heads, chords, events of a stretch
node src/core/omr/notation/tools/crop.cjs <in.png> <out.png> x y w h [scale]                    # enlarge part of a dump
node src/core/omr/notation/tools/alphatab-pages.cjs [--only id]                                # regenerate fixtures/alphatab/
node scripts/omr-symbol-templates.cjs [--png dir]                                              # regenerate templates.data.ts
node scripts/omr-symbol-templates.cjs --extra                                                  # regenerate fixtures/ (own pages)
```
