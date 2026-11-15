# `@/core/vision` — live fretboard camera

Finds the fretboard in webcam frames, locks on, follows it, and says where every (string, fret) is
in the picture. Pure TypeScript on typed arrays: no server, no OpenCV, no network. Import from the
barrel only. Design and detector measurements: `README.md`.

**A camera screen needs three things:** `VisionPipeline` (camera → worker → poses),
`drawVisionOverlay` (poses → canvas), and the calibration helpers for when detection struggles.

## Types (`types.ts`)
```ts
Frame { data: Uint8ClampedArray /* RGBA, like ImageData */; width; height }
FretboardPose { H: Mat3 /* neck-plane mm -> frame px */; model: NeckModel; confidence /* 0..1 */;
  visibleFrets: { min, max }; mirrored; leftHanded; numbering: 'nut'|'inlays'|'markers'|'user'|'tracked'|'assumed';
  numberingConfidence /* < 0.5 = a guess: ask */; frameWidth; frameHeight }
FretPosition { string /* 1 = high E */; fret /* 0 = open */ }      Point { x, y }
MarkerHint { frets: number[]; placement?: 'bass-edge'|'treble-edge'|'board'; hue?; colors?: MarkerColor[] }
```
Neck plane: x mm from the nut toward the bridge, y mm from the bass edge. Wire n at
`x = L(1 - 2^(-n/12))`. A marker for (s, f) sits on string s just behind wire f (`projectMarker`).

## `VisionPipeline` — the camera runtime (`pipeline.ts`)
```ts
const pipeline = new VisionPipeline({
  tracker: { model: 'steel', bassSideUp: true, leftHanded: false },   // FretboardTracker options
  onRender: ({ pose, latest, timeMs }) => draw(pose, latest),          // every displayed video frame
  onUpdate: (u) => { /* every processed frame: u.update (TrackerUpdate), u.frameTime, u.latencyMs, u.timing */ },
  onStatus: ({ mode, message }) => {},                                 // 'worker' | 'main' | 'idle'
});
await pipeline.start(videoOrStream);   // HTMLVideoElement (playing) or MediaStream from requestCamera()
pipeline.pause(); pipeline.resume(); pipeline.stop();   // stop() releases worker, frame loop, own <video>
```
- Frames: `requestVideoFrameCallback` (else `requestAnimationFrame`), shrunk on the GPU with
  `createImageBitmap(video, { resizeWidth, resizeHeight })`, transferred to a module worker
  (`vision.worker.ts`), read back there. One frame in flight; frames that arrive meanwhile are
  dropped, and the newest dropped one is sent the moment the worker is free (nothing queues).
- Every answer carries the timestamp of its frame. `onRender`'s `pose` is the newest answer carried
  forward to the displayed frame (`PosePredictor`), the held pose while `lost`, null while `searching`.
- Adaptive quality (`QualityController`): working width 640 → 544 → 480 when tracked frames take
  over 45 ms (median), back up after 3 s of headroom; detections spaced to at most 75% duty when
  they take over 80 ms. Without module workers (or if the worker fails to load in 20 s) the same
  host runs on the main thread with tighter budgets (`mode === 'main'`).
- Points given to the pipeline are **video pixels** (`pipeline.videoSize`); poses may be for any
  frame size. Poses handed out are for the working frame (`pose.frameWidth`): draw them through
  `poseForDisplay` / `drawVisionOverlay`, which rescale.
- Commands (all `Promise<boolean>`): `calibrate(pose)`, `confirmFret(point, fret)`,
  `confirmNumbering()`, `shiftNumbering(delta)`, `setOptions(changes)`, `reset()`;
  `sampleMarkerColor(point): Promise<MarkerColor | null>`. `poseAt(timeMs?)`, `latest`, `stats`
  (`processedFps`, `offeredFps`, `workerMs`, `trackMs`, `detectMs`, `latencyMs`, working size,
  dropped/skipped frames, `quality`), `mode`, `video`, `videoSize`, `isRunning`, `isPaused`.
- Options: `worker: 'off'` (main thread), `quality: QualityOptions`, `predictor: PredictorOptions | false`,
  `stopTracksOnStop` (default false: the screen owns the stream), `createWorker`, `workerTimeoutMs`.

### A React camera screen
```tsx
import { requestCamera, stopStream, explainMediaFailure } from '@/core/platform';
import { VisionPipeline, drawVisionOverlay, fitOverlayCanvas, readOverlayPalette, displayToFrame, type OverlayNote, type TrackerUpdate } from '@/core/vision';

function CameraOverlay({ notes }: { notes: OverlayNote[] }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pipelineRef = useRef<VisionPipeline | null>(null);
  const notesRef = useRef(notes);
  notesRef.current = notes;                                   // read per frame: no re-render per frame
  const [status, setStatus] = useState<Pick<TrackerUpdate, 'state' | 'hint' | 'suggestCalibration'>>({ state: 'searching', hint: 'point-camera', suggestCalibration: false });
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    void (async () => {
      const cam = await requestCamera({ facing: 'user' });
      if (!cam.ok || cancelled) { if (cam.ok) stopStream(cam.stream); return; } // else render <MediaBlocked>
      stream = cam.stream;
      const video = videoRef.current!, canvas = canvasRef.current!, ctx = canvas.getContext('2d')!;
      video.srcObject = stream;
      await video.play();
      const palette = readOverlayPalette(canvas);              // read again when the theme changes
      const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const pipeline = new VisionPipeline({
        tracker: { model: 'steel' },
        onRender: ({ pose, latest, timeMs }) => {
          const box = canvas.getBoundingClientRect();
          const dpr = fitOverlayCanvas(canvas, box.width, box.height);
          const u = latest?.update;
          drawVisionOverlay(ctx, { view: { width: box.width, height: box.height, mirrored: true, fit: 'cover' },
            pose, notes: notesRef.current, state: u?.state, confidence: u?.confidence,
            numberingGuess: u ? !u.numberingConfirmed : false, timeMs, palette, dpr, reducedMotion });
        },
        // State only when what is shown changes (an aria-live line, the calibration button).
        onUpdate: ({ update: u }) => setStatus((s) => (s.state === u.state && s.hint === u.hint && s.suggestCalibration === u.suggestCalibration ? s : { state: u.state, hint: u.hint, suggestCalibration: u.suggestCalibration })),
      });
      pipelineRef.current = pipeline;
      if (!cancelled) await pipeline.start(video);
    })();
    return () => { cancelled = true; pipelineRef.current?.stop(); pipelineRef.current = null; stopStream(stream); };
  }, []);
  // <video style="transform: scaleX(-1); object-fit: cover"> under <canvas>, both filling one box.
  // A tap on the canvas -> video pixels:
  //   const view = { width: box.width, height: box.height, mirrored: true, fit: 'cover' as const };
  //   const p = displayToFrame(tap, view, pipeline.videoSize.width, pipeline.videoSize.height);
  //   await pipeline.confirmFret(p, 5);        // "this cell is fret 5"
}
```
`TrackerUpdate.hint`: `'point-camera'` (nothing found) · `'hold-steady'` (lost, or coasting through
blur) · `'confirm-fret'` (numbers are a guess: show `update.question` as "Is this fret N?") ·
`'low-confidence'` · null (locked). `suggestCalibration` turns true after 6 s without a board,
after 3 losses within 20 s, or after 6 s of a board that never locks: offer the four-tap calibration.
`searchingMs` says how long nothing has been shown.

## Drawing the overlay (`draw.ts`, `overlay.ts`)
```ts
const dpr = fitOverlayCanvas(canvas, cssW, cssH);            // backing store at the pixel ratio (cheap if unchanged)
const res = drawVisionOverlay(ctx, { view, pose, notes, state, confidence, numberingGuess, timeMs, palette, dpr,
  stringNames /* low to high, default E A D G B E */, reducedMotion, outline, wires, fretNumbers, allFretNumbers,
  stringLabels, indicator /* all default true but allFretNumbers */ });
res.markers  // [{ string, fret, x, y, radius, visible, note }] in CSS px: hit-test taps on notes
OverlayNote { string, fret, label?: 'R' | 'b3' | 'C#' | '2'..., degree?: 1..7 /* --deg-N fill, --deg-N-fg text */, target?: boolean /* pulse */, ghost?: boolean }
readOverlayPalette(element)   // tokens: --deg-1..7(-fg), --deg-x, --accent, --surface, --fg, --bg, --ok, --warn, --bad, fonts
```
Draws: board outline (dashed while `candidate`), fret wires, fret numbers at the inlay frets (with
`?` when `numberingGuess`), string names behind the nut (or the first visible wire), note dots with
labels (open strings as rings behind the nut), a pulse ring on `target` notes (static ring with
`reducedMotion`), a fade with confidence while `lost`, and a confidence pill (five bars + a word,
`STATE_WORDS`). `view: { width, height, mirrored?, fit?: 'fill'|'contain'|'cover' }` matches the
`<video>`'s CSS; text is never mirrored. Also: `poseForDisplay`, `placeMarkers`, `displayToFrame`,
`frameToDisplay`, `displayTransform`, `projectMarker`, `projectFretWire`, `projectString`,
`boardOutline`, `fretSpacingPx`, `locatePixel(pose, point)` (a tap → string and fret).

## Assisted calibration (`calibration.ts`) — then `pipeline.calibrate(pose)`
```ts
poseFromTaps({ nut: [a, b], fret: [c, d], fretNumber: 12 }, videoW, videoH, { bassSideUp, mirrored, leftHanded, model })
poseFromWireTaps({ fret: 3, ends: [a, b] }, { fret: 15, ends: [c, d] }, videoW, videoH, opts)
const { taps, corners } = defaultCalibrationQuad(videoW, videoH, opts);   // starting handles for a drag UI
poseFromQuad(corners, videoW, videoH, { fromFret: 0, toFret: 12, ...opts })
shiftNumbering(pose, +2)     nudgePose(pose, { alongFrets, acrossStrings, rotateDeg, scale, dx, dy })
```
Taps in video pixels (convert display taps with `displayToFrame`). Taps may be in any order; taps
showing the neck the other way round flip `leftHanded`. Null for degenerate input. A user-numbered
pose locks at once and the tracker snaps it onto the wires on the next frame.

## Marker mode: two pieces of coloured tape
The learner sticks two bits of bright tape (or stickers) on the board edge at two frets and taps
each once on the picture:
```ts
const c5 = await pipeline.sampleMarkerColor(displayToFrame(tap1, view, vw, vh));    // null: "Not colourful enough: tap the tape itself"
const c12 = await pipeline.sampleMarkerColor(displayToFrame(tap2, view, vw, vh));
await pipeline.setOptions({ markers: { frets: [5, 12], placement: 'bass-edge', colors: [c5, c12] } });
```
Per frame the tracker finds the blobs of those colours near where the pose expects them; when
both sit mid-cell on their edge they confirm the numbering (`numbering: 'markers'`) or shift it
(at once for a guess, after two frames in a row for numbers read off the nut or inlays). One
marker alone only backs up numbers that already rest on something. When the detector finds no
board, the two blobs propose boards that the detector fits to the wires and strings
(`FretboardDetector.fit`), accepted at the evidence a detection needs. `update.markers` gives the
blob centres (frame px) for feedback. Two different colours are best; one colour for both works.
Grey, white, skin, maple and dark wood are refused (`MIN_MARKER_SATURATION` 0.55,
`MIN_MARKER_CHROMA` 0.3). Without colours, `markers: { frets, placement, hue }` is the older
sticker reader (numbering only). Lower level: `sampleMarkerColor(frame, point)`, `findColorBlobs`,
`readMarkerNumbering`.

## `FretboardTracker` — the per-frame state machine (`tracker.ts`), what the worker runs
```ts
const tracker = new FretboardTracker({ model: 'steel', mirrored: false, leftHanded: false, bassSideUp: true });
const u = tracker.update(frame, timeMs);   // TrackerUpdate, plain data
```
| `u.state` | meaning | the overlay should |
|---|---|---|
| `searching` | no board; full detection every frame | show "point the camera at the neck" + the calibration button |
| `candidate` | board tracked, but new (< 3 frames) or its fret numbers are a guess | draw the outline; after 1.2 s `u.question` is set: ask "Is this fret 5?" |
| `locked` | geometry and numbering trusted; numbers survive the nut leaving the frame | draw the notes |
| `lost` | board vanished < 1 s ago; `u.pose` is the last pose, `u.confidence` falls | fade the overlay |

`TrackerUpdate { state, changed, pose /* smoothed */, measured /* raw */, confidence, numberingConfirmed,
question: { point, fret } | null, ran, reason?, ms, timeMs, searchingMs, suggestCalibration, hint, markers }`.
Methods: `calibrate(pose, timeMs?)`, `confirmFret(point, fret)`, `shiftNumbering(delta)`,
`confirmNumbering()`, `setOptions(changes)` (orientation/neck changes reset), `rescale(w, h)`
(automatic when the frame size changes), `reset()`. Options (defaults): `model` 'steel' |
'electric' | 'classical' | NeckModel (unknown ids fall back to 'steel') · `bassSideUp` true ·
`mirrored` false (the FRAMES are mirror images; usually false: mirror only the display) ·
`leftHanded` false · `markers` · `region` · `smoothing` { minCutoff 1, beta 2, speedCutoff 4,
jumpCells 0.6 } | false · `lockConfidence` 0.6 · `unlockConfidence` 0.3 · `lockFrames` 3 ·
`lostGraceMs` 1000 · `numberingMemoryMs` 8000 · `askAfterMs` 1200 · `suggestCalibrationAfterMs`
6000 · `unstableLosses` 3 / `unstableWindowMs` 20000 · `detector`.
Worker protocol (`protocol.ts`): `createVisionHost(options, env)` answers `VisionRequest`s with
`VisionResponse`s (frame / bitmap / commands with `id`, `sample-color`, `probe`); the pipeline speaks it for you.

## Measured
**Live, in Chromium** (`node e2e/vision-live.cjs --repeat 3`, all three runs passed; fake camera
1280x720 at 30 fps, 11 s of a classical guitar swaying with the hand sliding, frames scored against
ground truth; shared 4-core sandbox under load): locked 0.42-0.83 s after frames started; on
locked frames 100% of the checked markers in the right cell (244-336 frames per run, numbering
included); 19-24 frames processed per second (camera 21-30 fps shown), worker time per tracked
frame 24-31 ms median (p95 53-90), bitmap read-back about 1 ms, first detection 190-380 ms (JIT
warm-up); the drawn pose against the frame actually on screen 1.5-2.0 px median (1280 px wide)
with extrapolation against 2.9-3.6 px without (each answer on its own frame: 1.2 px); worker and
page heaps flat over 8 s after GC (< 0.3 MB); the main-thread fallback locks and tracks right at
9-21 frames/s; a forced quality drop (640 → 544 → 480) keeps tracking right; stop() leaves no
worker, no callbacks; 6 rapid start/stop cycles leave nothing running.

**Bench (`hardening.test.ts`, `marker-mode.test.ts`; synthetic, 640x360):** still guitar under
heavy webcam noise (read 0.025, shot 0.04, JPEG 55; seven seed sets): drawn markers move 0.002-0.005 px
per frame (detector 0.016-0.034). 600 frames (20 s) of 40 scenes without a guitar, panned and
re-noised: 0 candidate, 0 locked frames; calibration offered after 6 s. Full occlusion (seven
sets): right again 0-5 frames after it clears, numbers kept, no confident frame while hidden.
Marker mode on the `markers` tier (hard scenes, nut usually out of view; colours sampled 2 px off
the true sticker, only stickers not under the hand): sampled colours 11/12 (seeds 0-12) and 16/16
(held-out 1000-1015) scenes locked right, 0 locked wrong; hue-only stickers 10/12 and 16/16; no
markers 4/12 and 12/16. The markers alone (detector blind) find a board rarely: 3 right, 1 wrong of
19 (seeds 0-19), 1 right, 0 wrong of 19 (1000-1019).

Detector, single frames (README.md has the full tables): easy 100%, medium 94%, hard 80%, extreme
58% over 8 seed sets; never measured before this pass, sets 13000 / 14000: hard 75% / 75%,
extreme 54% / 38%, most misses honest ("weak evidence": nothing drawn, calibration offered).

## Limits
- Measured on synthetic scenes and a synthetic video only; no real webcam footage was available.
- Classical guitars: the slotted headstock's rollers can continue the fret comb, so the "nut" may be
  found 2-3 frets too far: confident-but-wrong numbering on 4 of 35 confidently numbered classical
  frames in the stored benchmark runs (some scenes counted in several runs; steel 2/370, electric
  2/299). A tap (`confirmFret`) or marker mode fixes it.
- A maple board with faint strings on a light background can be placed half a string off across
  the neck (seen on 4 of 96 fresh hard/extreme frames); frets stay right.
- Detection takes about 100 ms (p95 ~170-250 on the loaded sandbox) on extreme frames and frames
  without a guitar; it only runs while searching or lost, and the pipeline spaces it out.
- Portrait video: the working frame keeps the pixel count of 640x360, but the alignment search
  widens narrow frames to 640, so portrait costs more.
- Marker pose acquisition (markers seen, detector blind) is a weak fallback; marker numbering is
  the strong part.
- `vision.worker.ts` must be created by `VisionPipeline` (or `new Worker(new URL('./vision.worker.ts',
  import.meta.url), { type: 'module' })` in this directory) so Vite bundles it.
