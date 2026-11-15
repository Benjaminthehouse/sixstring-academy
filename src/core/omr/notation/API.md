# `@/core/omr/notation` — API digest

Reads one five-line staff strip (from `extractStaff`) into notes, chords and rests with pitch,
duration, ties, accidentals, clef, key and time signature. DOM-free typed-array code (browser,
Web Worker, Node). Method, supported symbols and measured accuracy: `../README.md`, section 9.

## Recognizer

```ts
recognizeNotationStaff(input: StaffInput, options?: RecognizeOptions)
  : StaffReading<OmrNotationEvent> | Promise<StaffReading<OmrNotationEvent>>   // RecognizeNotationStaff
createNotationRecognizer(): RecognizeNotationStaff     // remembers clef / key / time from staff to staff; one per page
```

- Without `options.ai` the call is synchronous. With it, measures that do not add up are shown to
  the vision model and its answer is taken only if it fills the measure exactly (`refineWithModel`).
- `options.context` (`fifths`, `beats`, `beatValue`, `clef`) supplies what the staff does not print.
- Output: events in time order with `bbox` in page px, `confidence`, `duration` (`value`, `dots`,
  `tuplet`, `ticks`, `confidence`, `alternatives`), `stem`, `beams` / `flags`, `voice` (2 = lower
  voice of two), `source` (`'image' | 'inferred' | 'merged'`); notes with `staffPosition`, `head`,
  `pitch` (`step`, `alter`, `octave`, `written`, `midi` = sounding), `accidental`, `tieStart` /
  `tieStop`; `clef`, `keySignature`, `timeSignature` (with `alternatives`); `texts` = boxes of text
  above the staff with `text: ''` for the caller's OCR; `warnings` (`measure-mismatch`).
- A confidence below 0.5 is a guess; a duration changed by the measure check has confidence 0.55
  and keeps the first reading among its `alternatives`.

## Stages (for tests, tools and the proofreading screen)

```ts
analyzeNotationStaff(input, options?): StaffAnalysis      // everything in strip px: header, strokes, heads, chords, rests, events, measureOk
toReading(analysis, options?): StaffReading<OmrNotationEvent>
refineWithModel(analysis, ai: OmrVisionModel, signal?): Promise<number>   // measures repaired
buildStrip(input): Strip                                  // nl (lines removed twice), ink, dt, cc, rowWeight ...
readHeader(strip): Header                                 // clef, key (fifths), time, endX
findStrokes(strip, x0, x1): Stroke[]                      // stems, bar lines, uprights of accidentals
findHeads(strip, x0, x1, { strokes? }): Head[]            // kind 'filled' | 'open' | 'whole', pos, score, feat
ledgerSupport(strip, head): number                        // share of the ledger lines a head needs that exist
solveMeasure(events: RhythmEvent[], targetTicks, maxCost?): MeasureSolution
measureTicks(beats, beatValue): number
pitchOf(pos, alter, clef): OmrPitch;  keyAlterations(fifths);  new AccidentalState(fifths, clef).read(pos, accidental, tieStop, tieStart)
templatesOf(glyph: string): Template[]                    // SMuFL name, four fonts, 20 px per staff space
```

## Examples

```ts
import { analyzePage, extractStaff, recognizePage } from '@/core/omr';
import { createNotationRecognizer, recognizeNotationStaff } from '@/core/omr/notation';

// Whole page: time signature carried from system to system.
const page = await recognizePage(gray, { notation: createNotationRecognizer(), tab: recognizeTabStaff });

// One staff, with the vision model as a second opinion for measures that do not add up.
const analysis = analyzePage(gray);
const reading = await recognizeNotationStaff(extractStaff(analysis, 0), { ai: visionModel });
for (const e of reading.events) {
  if (e.kind === 'chord') console.log(e.notes.map((n) => n.pitch.midi), e.duration.value, e.duration.dots, e.confidence);
}
```

```ts
// Proofreading: why was this measure flagged, and what else could that note value be?
import { analyzeNotationStaff } from '@/core/omr/notation';
const a = analyzeNotationStaff(input);
a.measureOk;                                   // per measure: true / false / null (not checked: pickup, unknown metre)
a.events[3].rhythm.options;                    // readings with costs, primary first
```

## Tools (Node only, `tools/`)

```bash
node src/core/omr/notation/tools/dev.cjs run --tier clean,scan --match ode --mistakes --dump   # corpus metrics, every mistake, annotated strips in e2e/out/omr/nt-*.png
node src/core/omr/notation/tools/dev.cjs extra                # the recognizer's own pages (two voices, C / cut time, tuplets, grace notes, bass clef)
node src/core/omr/notation/tools/dev.cjs inspect <fixture> <tier> <staff> <x0> <x1>            # strokes, heads, chords, events of a stretch
node scripts/omr-symbol-templates.cjs [--png dir]             # regenerate templates.data.ts
node scripts/omr-symbol-templates.cjs --extra                 # regenerate notation/fixtures/
```
