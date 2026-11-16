# `@/core/omr/tab` — printed-tablature reader (API digest)

Reads one tab staff strip (`StaffInput` from `extractStaff`) into `OmrTabEvent`s: fret numbers per
string with page boxes, confidences and alternatives, grouped into columns (chords) in time order,
plus rhythm from stems, technique marks, rests, the TAB clef and a time signature. Pure typed-array
code (Web Worker and Node); no DOM, no network. How it works and what it measures:
[../README.md](../README.md), section 9. Not re-exported by `@/core/omr`: import from here.

## Main entry

```ts
recognizeTabStaff: RecognizeTabStaff
  // (input: StaffInput, options?: { tuning?, context?, ai?, signal? })
  //   => StaffReading<OmrTabEvent>            synchronous without `ai`, or when the picture is clear
  //    | Promise<StaffReading<OmrTabEvent>>   when `ai` is given and the staff holds guesses
readTabStaff(input, options?): { reading, debug }      // always synchronous; debug = TabDebug internals
tuningFor(lines, given, warnings): readonly number[]   // the tuning a staff is read with (4 lines = bass ...)
```

`reading.events`: `kind 'tab'` (notes top string first) or `'tab-rest'`; `x` in page px for aligning
with a linked notation staff; `duration` when stems are printed. A note:
`{ string, fret, midi, bbox, confidence, alternatives?, parenthesized?, tieStop?, technique? }`;
`technique` is `x` (dead note, fret 0 is a placeholder), `<>` (harmonic), then `h p / \ b r`.
Confidence below 0.5 = a guess; `alternatives` hold the other readings, best first.
`reading.warnings`: `low-quality`, `ai-unavailable`, `other` (suspect bar line, assumed tuning,
staff of lone 1s ...).

## Building blocks (tests and tools)

```ts
findLineBlobs, findWeldedBlobs, groupAdjacent, groupColumns, profileValleys   // segment.ts
findStackCuts, applyStackCuts                    // segment.ts: split touching chord numbers (README 9.1)
refineBox, extractPatch, classifyPatch, correlate, lineProfileAt               // glyph.ts
readCluster, assembleLine, buildNumber, glyphConfidence, MAX_FRET               // numbers.ts
templatesAtBlur(level), struckTemplates(level, centre, thickness), loadTemplates // templates.ts
findStems, solveMeasure, assignDurations                                        // rhythm.ts
findArcs, findSlides, findBends                                                 // marks.ts
findRests, readTimeSignature                                                    // header.ts
TAB_VISION_PROMPT, parseVisionColumns, mergeVision, needsSecondOpinion          // second-opinion.ts
```

## Examples

```ts
import { analyzePage, extractStaff, recognizePage } from '@/core/omr';
import { recognizeTabStaff } from '@/core/omr/tab';

// The whole page (notation recognizer optional):
const page = await recognizePage(gray, { tab: recognizeTabStaff });

// One staff, with a vision model as second opinion for doubtful staves:
const analysis = analyzePage(gray);
const reading = await recognizeTabStaff(extractStaff(analysis, 1), { ai: visionModel, signal });
for (const e of reading.events) for (const n of e.notes) if (n.confidence < 0.5) console.log('check', n.string, n.fret, n.alternatives);
```

```ts
// A four-line staff without a tuning is read as bass (E A D G) and says so in a warning.
const bass = readTabStaff(input).reading;          // notes' midi from [28, 33, 38, 43]
const drop = readTabStaff(input, { tuning: [38, 45, 50, 55, 59, 64] }).reading;   // drop D
```
