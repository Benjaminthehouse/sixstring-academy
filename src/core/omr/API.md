# `@/core/omr` — API digest

Page picture (PDF render, scan, phone photo) in, positioned transcription of printed **tab** and
**standard notation** out, entirely in the browser: staves, systems, bar lines, measures, notes /
chords / rests with pitch and duration, fret numbers per string, clef / key / time, every element
with its box on the picture, a confidence (below 0.5 = a guess) and alternatives. Text-like pages
(chord sheets, lyrics, ASCII tab) are recognised and handed back for OCR + the song importers.
Full guide: [README.md](./README.md) (sections 9-13). Node-only tools live in `@/core/omr/eval/*`.

## In a screen: read in the worker

```ts
import { createOmrWorker, summarizePage, omrToSong, isCancelled, type OmrPage } from '@/core/omr';

const omr = useMemo(() => createOmrWorker(), []);          // module worker, bundled by Vite
useEffect(() => () => omr.terminate(), [omr]);
const ctl = new AbortController();                          // abort on unmount / "Cancel"
const kind = await omr.classifyPage(imageData);              // 'tab' | 'notation' | 'both' | 'text' | 'not-music'
if (kind.kind === 'text') return runOcrAndImport();          // chord sheet / ASCII tab: OCR + importSong
try {
  const page: OmrPage = await omr.recognizePage(imageData, { signal: ctl.signal,
    onProgress: (p) => setProgress(p.fraction, p.message) });          // "Reading tab staff 3 of 8"
  const summary = summarizePage(page);                        // headline, lines, proofread list
  const { song, warnings } = omrToSong(page);                 // after proofreading: a valid Song
} catch (e) { if (!isCancelled(e)) showError(e); }
```

`imageData` is a canvas `ImageData` (RGBA) or a `GrayImage`; add `transfer: true` to move its buffer.
Several pages (a PDF): `omr.recognizeDocument([p1, p2], opts)` -> `OmrDocument { pages, measures
(joined across systems and pages), context }`; key and time carry over. Same calls without a worker
(tests, Node): `recognizePage(image, opts)`, `recognizeDocument`, `classifyPage`. Options:
`tuning`, `context` (key/time known in advance), `ai` (recognizers' own second opinion, see below),
`tab` / `notation` (replace or `null` to skip a recognizer), `estimateRhythm` (default true).

## The Page model (`types.ts`)

```text
OmrPage { width, height, staffSpace, systems, texts, quality {source, score, noise, ...}, warnings, timings }
 └ OmrSystem { index, bbox, staves, texts (chord symbols, tempo; text '' = box only, for OCR) }
    └ OmrStaff { kind 'notation'|'tab', lineCount, geometry {lines (polylines), space, bbox}, clef,
                 keySignature, timeSignature, timeInForce {beats, beatValue, source printed|carried|given|assumed},
                 keyInForce, barlines, measures, linkedStaffId (notation <-> tab of the system), tuning }
       └ OmrMeasure { index, x0, x1, events, ticks, expectedTicks, addsUp?, pickup? }
          └ OmrNotationEvent { kind 'chord'|'rest', x, notes: OmrNote[], duration, stem, beams, voice, linkedEventId }
             OmrNote { staffPosition, head, pitch {step, alter, octave, written, midi = sounding}, accidental,
                       tieStart/Stop, string?, fret? (from the linked tab) }
          └ OmrTabEvent { kind 'tab'|'tab-rest', x, notes: OmrTabNote[], duration?, linkedEventId }
             OmrTabNote { string (1 = top line = high E), fret, midi, technique?, parenthesized?, tieStop? }
```

Every element: `id` (stable within a run), `bbox` in px of the ORIGINAL picture (draw it straight over
the photo), `confidence`, `source` (`image` | `merged` | `inferred` | `ai`), `alternatives` (best
first, for one-tap fixes), `issues?: { code, message }[]` with codes `staves-disagree`,
`rhythm-disagree`, `unlinked`, `rhythm-estimated`, `resolved`, `ai-disagree`, `ai-only`.
Pitch is sounding MIDI (guitar sounds an octave below the treble staff), ticks 960 per quarter.

## Notation + tab, reconciled

The two staves of a system are read independently, then aligned (bar lines as anchors, dynamic
programming on x). The tab gives string / fret, the notation gives rhythm and spelling. Agreement
raises both confidences; a disagreement one reader had as its runner-up is settled and marked
`resolved`; any other leaves both below 0.5 with the other reading as alternative. Tab without
rhythm takes the notation's (`source: 'merged'`); tab with no rhythm anywhere gets durations
estimated from spacing (`inferred`, 0.25). Measures are checked against the metre in force.

## Honest summary and proofreading

```ts
const s = summarizePage(page);   // or summarizeDocument(doc)
s.verdict;     // 'good' | 'check' | 'poor'
s.headline;    // "Read well: 3 things to check"
s.lines;       // ["Tab numbers: 147 read, 3 uncertain.", "Rhythm: no rhythm is printed, so note lengths
               //   were estimated from the spacing. Check them by ear.", "1 measure does not add up ..."]
s.proofread;   // ProofreadItem { id, page, staffId, measureIndex, what, bbox, reading, reason,
               //   confidence, alternatives (words), impact } — most important first
```

## AI-assisted reading (optional; the app works without it)

```ts
import { createPlatformAiClient, readPageWithAi, fuseAiReading, measuresToCheck, secondOpinionOnMeasure } from '@/core/omr';
const client = createPlatformAiClient();                 // platform askJson, tier 'complex'; checks aiAllowed()
const ai = await readPageWithAi(gray, page, client, { signal });    // systems cropped + enlarged, batched
const report = fuseAiReading(page, ai.reading, ai.systemMap);       // mutates page; report.notes for the screen
for (const m of measuresToCheck(page, 3)) await secondOpinionOnMeasure(gray, page, m.staffId, m.measureIndex, client);
// Recognizers' own second opinion inside the worker: omr.recognizePage(img, { ai: createPlatformVisionModel() })
```

Vision models misread dense notation (ledger lines, accidentals carried through a bar, beamed
sixteenths), miscount repeated notes and sometimes "complete" a bar. Their answer is validated and
repaired by code (`parseAiReading`: bad frets, pitches, strings dropped and listed), then fused
under constraints: agreement raises confidence; the picture keeps what it reads clearly; the AI's
value is taken only for a guess that the picture reader also had as an alternative (or the tab
confirms), or for rhythm that makes a measure that did not add up add up; notes only the AI saw
become guesses (0.35, `ai-only`) and only where the measure is short of time. Everything it changes
is marked. Never treat it as ground truth. Unavailable / declined / turned off in Settings:
`OmrAiUnavailableError` with a sentence to show.

## Measured (seed 1; `node src/core/omr/eval/cli.cjs [--corpus unseen] --no-strips`)

ACCURACY_TABLES

## Supported

Treble clef read the guitar way (8vb), bass clef; keys to 7 sharps / flats; time signatures 2-16 over
2/4/8/16, C, cut C; heads filled / half / whole with ledger lines; stems, beams, flags to 32nd; one or
two dots; rests whole to 32nd; sharps, flats, naturals with bar-scoped persistence; ties; chords
incl. seconds; two voices with opposite stems; triplets. Tab: 4-7 lines, numbers knocked out of the
line or struck through, two-digit frets, chords (also when the numbers touch), stems / beams under
the staff or hanging from it, rests, TAB clef, time signature, h p / \ b r x <> marks.

## Not supported / limits

Grace and cue-size notes are ignored (a page printed entirely in small notes reads as empty);
tuplets other than 3, double sharps / flats, clef / key / time changes inside a staff, C clefs, 8va,
voltas, dynamics, articulations, fingerings, slurs, lyrics are not read; chord symbols, titles and
tempo are located but not read (`text: ''`) unless the AI path or the caller's OCR fills them.
Unseen digit faces with unusual 0s (slashed, dotted) and pixel fonts read below 0.5 more often.
Photo-bad captures (blur ~0.16 space + JPEG) lose a quarter to half of the notes: the summary says
"poor"; ask for a sharper picture. Rhythm estimated from spacing is a guess. The AI path was tested
with fake answers only (no model available here).
