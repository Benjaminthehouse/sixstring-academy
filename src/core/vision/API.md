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
- Frames: `requestVideoFrameCallback` (else `requestAnimationFrame`). Where the browser has
  WebCodecs the camera frame is wrapped as a `VideoFrame` (about 0.1 ms here) and transferred to the
  module worker (`vision.worker.ts`), which shrinks it to the working size and reads it
  (`stats.transfer === 'video-frame'`); otherwise `createImageBitmap(video, { resizeWidth, resizeHeight })`
  makes a shrunk bitmap, which is a synchronous copy and resize on the main thread (8-9 ms a frame,
  a fifth to a third of the main thread in headless Chromium), and the bitmap is transferred
  (`'bitmap'`); a worker that cannot read `VideoFrame`s answers once and bitmaps take over. One frame
  in flight; frames that arrive meanwhile are dropped, and the newest dropped one is sent the moment
  the worker is free (nothing queues).
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
  dropped/skipped frames, `quality`; main thread: `transfer`, `grabMs` = median cost of handing one
  frame over, `mainThreadMs` = all the pipeline's main-thread work over the last 2 s (every grab,
  also those sent when the worker answers, and the bitmap hand-off) per video frame seen,
  `mainThreadMaxMs`, `mainThreadShare` = its share of wall-clock time), `mode`, `video`,
  `videoSize`, `isRunning`, `isPaused`. `pause()` stops the frame loop (an answer still in flight is dropped); options set
  before `start` are kept for it.
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

### Coaching the learner: `TrackerUpdate.guidance` (`guidance.ts`)
One line of coaching per frame, most urgent first, and how far the drawn notes can be trusted:
```ts
const g = u.guidance;   // { code, trust, message, measures: { brightness, clipped, noise, stringSpacingPx, offNormalDeg, visibleFrets, nutInView } }
if (g.trust === 'auto') drawNotes(); else showLine(g.message);   // set React state only when g.code changes
```
| `code` | when | `trust` |
|---|---|---|
| `ok` | locked, inside the operating limits | `auto`: draw the notes |
| `point-camera` | nothing found yet | `wait` |
| `too-dark` | mean brightness < 30 or sensor noise > 16 grey levels (`OPERATING_LIMITS`) | `wait` |
| `too-bright` | > 30% of the picture clipped (a window or lamp behind the player) | `wait` |
| `move-closer` | strings < 3.5 px apart at the working size | `wait` |
| `tilt-toward-camera` | board seen more than 55 degrees off its normal | `wait` |
| `hold-still` | lost, coasting through blur, or a new board not yet held 3 frames | `wait` |
| `show-nut` | numbers are a guess and the nut is out of view | `confirm` |
| `confirm-fret` | the "Is this fret N?" question is up (`message` names the fret) | `confirm`: one tap |
| `check-guitar-type` | the strings in view do not match the neck model (`u.stringsSeen` = how many there seem to be); the board is never locked meanwhile | `confirm`: pick the guitar type or calibrate |
| `calibrate` | `suggestCalibration` and nothing more specific to say | `calibrate`: offer the four taps |

The `calibrate` line names no button ("Mark the neck by hand: show where the nut and the 12th fret
are") unless the tracker is told the screen's label: `new FretboardTracker({ calibrateLabel: 'Mark the neck' })`
(or `pipeline.setOptions({ calibrateLabel })`) gives "Tap Mark the neck and mark the nut and the 12th
fret." (`calibrateMessage(label?)`).

`trust` is `auto` only for a locked board inside the limits; a locked board outside them still
draws (state `locked`) but is coached back inside. Calibration (`calibrate(pose)`) overrides the
string-count check: the learner's word wins. `frameStats(frame)`, `viewStats(pose)` and
`guide(input)` are exported for screens that want the measurements themselves.

## Drawing the overlay (`draw.ts`, `overlay.ts`)
```ts
const dpr = fitOverlayCanvas(canvas, cssW, cssH);            // backing store at the pixel ratio (cheap if unchanged)
const res = drawVisionOverlay(ctx, { view, pose, notes, state, confidence, numberingGuess, timeMs, palette, dpr,
  stringNames /* low to high, default E A D G B E */, reducedMotion, outline, wires, fretNumbers, allFretNumbers,
  stringLabels, indicator /* all default true but allFretNumbers */ });
res.markers  // [{ string, fret, x, y, radius, visible, note }] in CSS px: hit-test taps on notes
// Notes are drawn where the learner reads them: on the string as the camera sees it (strings sit
// 1.3-7 mm above the wood) and between the wire crowns as seen. The camera is recovered from the
// tracked frame's pose (`cameraCentre(pose)`); `placeMarkers(pose, notes, camera)` / `projectMarkerSeen`
// do the same for your own drawing. Front-on this is `projectMarker`; 55 degrees off it moves a dot by
// up to a string spacing (alt bench, 48-62 degrees: cells 49-89% right without it, 94-99% with it).
OverlayNote { string, fret, label?: 'R' | 'b3' | 'C#' | '2'..., degree?: 1..7 /* --deg-N fill, --deg-N-fg text */, target?: boolean /* pulse */, ghost?: boolean }
readOverlayPalette(element)   // tokens: --deg-1..7(-fg), --deg-x, --accent, --surface, --fg, --bg, --ok, --warn, --bad, fonts
```
Draws: board outline (dashed while `candidate`), fret wires, fret numbers at the inlay frets (with
`?` when `numberingGuess`), string names behind the nut (or the first visible wire), note dots with
labels (open strings as rings behind the nut), a pulse ring on `target` notes (static ring with
`reducedMotion`), a fade with confidence while `lost`, and a confidence pill (five bars + a word,
`STATE_WORDS`). `view: { width, height, mirrored?, fit?: 'fill'|'contain'|'cover', crop? }` matches the
`<video>`'s CSS; text is never mirrored. Also: `poseForDisplay`, `placeMarkers`, `displayToFrame`,
`frameToDisplay`, `displayTransform`, `projectMarker`, `projectFretWire`, `projectString`,
`boardOutline`, `fretSpacingPx`, `locatePixel(pose, point)` (a tap → string and fret).

### Zoom to the notes (`zoom.ts`)
On a phone held upright the strings are 6-7 px apart on screen and a dot is about 12 px across: its
label cannot be read. `view.crop` (`CropRect`, fractions 0..1 of the frame, before mirroring) shows
only part of the picture; every conversion above honours it.
```ts
const follower = new CropFollower();                        // eases the window, ignores sway (deadband 12%)
// in onRender:
const whole = { width, height, mirrored: true, fit: 'contain' as const };
const target = u?.state === 'locked' ? neckCrop(pose, notes, whole) : FULL_CROP;   // FULL_CROP when the dots are already >= 11 px
const crop = follower.update(target, timeMs, reducedMotion);
const view = isFullCrop(crop) ? whole : { ...whole, crop };
video.style.transformOrigin = '0 0';
video.style.transform = videoCropTransform(view, video.videoWidth, video.videoHeight) ?? '';   // same part of the picture, mirroring included
drawVisionOverlay(ctx, { view, pose, notes, ... });          // taps: displayToFrame(tap, view, ...)
```
`neckCrop(pose, notes, view, { readableRadius 11, maxZoom 3, marginFrets 1, minZoom 1.25 })`
magnifies just enough for dots of `readableRadius` CSS px, never past the notes' frets (plus a fret
either side, board edge to edge) nor `maxZoom`, keeping the view's shape. `cropZoom(view, w, h)`
says how much a view magnifies. The camera screen zooms by default (Z toggles it) and shows the
whole picture again for the marking tools.

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
| `locked` | geometry and numbering trusted; numbers survive the nut leaving the frame (and are read again after a jump, below) | draw the notes |
| `lost` | board vanished < 1 s ago; `u.pose` is the last pose, `u.confidence` falls | fade the overlay |

**Jumps.** A tracked board that moves more than half a fret cell in one frame and more than four
times its usual motion (a cut, the camera knocked, the trackers latching onto the wires of another
board) is searched for afresh on that frame, numbers read off the nut, inlays or markers of that
frame alone; when the fresh detection is weaker the tracked pose stays but its numbers become a
guess (`numberingConfidence` 0.45: the board drops to `candidate` and is re-read every frame, the
trusted pose from before the jump voting too). Before this, a cut kept the old numbers at
confidence 1.0 and locked a fret off until the learner fixed it (`jump.test.ts`; alt bench 'typical',
30 seeds x 2 cut points: locked frames with wrong cells after the cut 70 of 1077 -> 10, cuts locked a
fret off to the end 3 -> 0; the 10 left are one second guitar placed half a string off, as without a cut).
A swaying neck moves 0.05-0.2 cells a frame; the cut measured 0.9. `diagnostics.stats.jump` marks the frame.

`TrackerUpdate { state, changed, pose /* smoothed */, measured /* raw */, confidence, numberingConfirmed,
question: { point, fret } | null, ran, reason?, ms, timeMs, searchingMs, suggestCalibration, hint, markers,
guidance, stringsSeen }`.
Pass the learner's guitar as `model`: 'steel' / 'electric' / 'classical', or a `NeckModel` for
anything else (a 7-string: `stringCount: 7, nutWidth 48, width12 58, stringSpanNut 41, stringSpanBridge 62`;
a 4-string bass: `scaleLength 864, stringCount 4, nutWidth 40, width12 56, stringSpanNut 31, stringSpanBridge 57`).
The wire spacing cannot tell a bass or a 7-string from a guitar; the string-count check
(`readStringCount`) holds such a board back from locking under the wrong model and says so in
`guidance` (`check-guitar-type`).
Methods: `calibrate(pose, timeMs?)`, `confirmFret(point, fret)`, `shiftNumbering(delta)`,
`confirmNumbering()`, `setOptions(changes)` (orientation/neck changes reset), `rescale(w, h)`
(automatic when the frame size changes), `reset()`. Options (defaults): `model` 'steel' |
'electric' | 'classical' | NeckModel (unknown ids fall back to 'steel') · `bassSideUp` true ·
`mirrored` false (the FRAMES are mirror images; usually false: mirror only the display) ·
`leftHanded` false · `markers` · `region` · `smoothing` { minCutoff 1, beta 2, speedCutoff 4,
jumpCells 0.6 } | false · `lockConfidence` 0.6 · `unlockConfidence` 0.3 · `lockFrames` 3 ·
`lostGraceMs` 1000 · `numberingMemoryMs` 8000 · `askAfterMs` 1200 · `suggestCalibrationAfterMs`
6000 · `unstableLosses` 3 / `unstableWindowMs` 20000 · `calibrateLabel` (none) · `detector`.
Worker protocol (`protocol.ts`): `createVisionHost(options, env)` answers `VisionRequest`s with
`VisionResponse`s (frame / bitmap / commands with `id`, `sample-color`, `probe`); the pipeline speaks it for you.

## Measured
**Live, in Chromium** (`node e2e/vision-live.cjs --repeat 3`, final code, all three runs passed;
fake camera 1280x720 at 30 fps, 11 s of a classical guitar swaying with the hand sliding, every
answer scored against the ground truth of its frame; shared 4-core sandbox): locked 0.37-0.66 s
after frames started; 285-338 locked frames per run, 100% of the checked markers in the right cell
(numbering included); 20-26 frames processed per second (camera 27-30 fps), worker time per
tracked frame 25-28 ms median (p95 49-76), bitmap read-back about 1 ms, first detection 160-320 ms
(JIT warm-up), latency frame -> answer 27-52 ms; the pipeline's own main-thread time per video
frame < 0.1 ms median (max 11-14 ms); the drawn pose against the frame actually on screen 1.6 px
median (1280 px wide) with extrapolation, 3.0-3.3 px without (each answer on its own frame:
1.2 px); worker and page heaps flat over 8 s after GC (<= 0.22 MB); the main-thread fallback
locks and tracks right at 22-28 frames/s with a 6.7-8 ms frame grab on the main thread; a forced
quality drop (640 -> 544 -> 480) keeps every locked frame right; stop() leaves no worker and no
callbacks, the page's video and track untouched; 6 rapid start/stop cycles leave nothing running.
(That run sent bitmaps, and its main-thread figure counted only the grabs made inside the frame
callback: most frames are sent when the worker answers, and `createImageBitmap(video, resize)` is a
synchronous 8-9 ms copy there, 21% of the main thread in a CPU profile of headless Chromium.)
Second integration pass, all main-thread work counted: with `VideoFrame` transfer 0.1 ms per frame
sent, 0.1% of the main thread (bitmaps, same browser, CPU profile: 21%); the worker now shrinks the
frame itself, 4.5 ms on an idle machine (11.6 ms median on the loaded one, where tracking took 54 ms);
the main-thread fallback grabs a frame in about 15 ms, 27% of the main thread before tracking.

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
extreme 54% / 38%, most misses honest ("weak evidence": nothing drawn, calibration offered). A hard
view held 1.5 s (fresh set 15000, 24 scenes): 14 lock right (at frame 2, median), 5 keep asking,
3 find nothing, 2 lock wrong at some point; extreme 10 / 6 / 6 / 2.

## What to expect on a real guitar
**All validation so far is synthetic.** Two independent renderers (the bench in `testing/` that the
detector was built on, and `testing/alt-scenes.ts`, written later by a different route to catch
overfitting: its own camera with k1/k2 lens distortion, strings and capo raised above the board,
plane-space shading with shadows, its own textures, noise and compression) and one synthetic video
in Chromium. No real webcam footage has been run. Treat every number here as "works on two
different drawings of a guitar", not "works on yours".

On the alt bench (`ALT_SEEDS=1,2,3,4 ALT_FRAMES=24`, cold start, 4 scenes x 24 frames per condition):
- **Works** (locked frames >= 97% with >= 90% of the note cells right, numbering 100%): clean and
  typical rooms with a hand on the neck, nut out of view (inlays), heavy grain, worn first positions,
  oxidised low-contrast frets, gold or black hardware, dull / coated / nylon strings, a classical
  neck without dots, 7-string and bass necks given the right `NeckModel`, a long sleeve, a capo at
  any fret 1-7 with the nut in view or not (70 scenes: numbering always that of the board, the capo
  never taken for the nut), a strap
  over the nut, a music-stand edge across the neck, saturated stage light, a very dim gain-cranked
  room, a window behind, blinds / keyboard / a second guitar behind, portrait phone (360x640),
  320x240, interlaced fields, rolling flicker, mirrored frames, left-handed. Without a guitar
  (keyboard, bookshelf, blinds, radiator, striped shirt): nothing shown, ever.
- **Misses, safely** (nothing drawn, coaching shown): in most conditions one scene in four, nearly
  always a maple board whose nickel frets are about as bright as the wood; frames that are mirrored
  while the tracker is told they are not; a bass or 7-string under a guitar preset (no lock;
  `check-guitar-type`).
- **Fails unsafely** (locks with wrong cells; coaching says ok):
  - strong wide-angle distortion (phone ultra-wide lens, fisheye webcam; 3 of 4 scenes, cells
    about 80%): a homography cannot bend. Use the main lens and keep the neck away from the
    picture's edges.
  - hard light raking along the neck from a low angle: the wires' long shadows pull the fitted wires
    toward the body, up to half a fret beyond the 12th (1 scene of 4; frets 1-12 right). Soften or
    raise the light.
  - a 7-string under the 6-string preset when the six-string model is fitted onto six of the seven
    strings (2 of 4 scenes): the string-count check cannot see the seventh. Pick the right guitar type.

**Operating limits** (`OPERATING_LIMITS`, from one-knob sweeps on the alt bench): strings at least
3.5 px apart at the 640-wide working frame (nothing is found below about 3 px); up to 55 degrees off
the board normal (cells 99-100% right to 55, 94% at 62; one scene in five was numbered a fret off at
48); mean brightness 30 or more (tracking failed in half the scenes at 26, in all at 21); noise
verified up to about 15 grey levels.

**When to ask, when to calibrate.** Automatic lock is trusted (`trust: 'auto'`) only when locked
with numbers that rest on the nut, the inlays, markers or the learner, inside the limits above.
Numbers read from nothing are a guess: the tracker never locks them; it asks to show the nut, then
"Is this fret N?" after 1.2 s. Calibration is offered after 6 s without a board, 3 losses in 20 s,
or 6 s without a lock, and coaching names the reason first when it knows one (dark, small, oblique,
wrong guitar type).

**Check these first with a real webcam** (in this order; each takes a minute with the camera screen
and a guitar): (1) a steel-string and a maple-board electric, front-on at arm's length: does it lock
in under a second and do the dots sit on the strings? (2) the same 45 degrees from the side: do the
dots stay on the strings at the 12th fret (raised-string correction, `cameraCentre`)? (3) the nut
out of view: is the numbering right, or does it ask? (4) a capo at 2 and at 5: are the dots still
numbered from the nut? (5) a dim evening room and a window behind: what does `guidance` say? (6) a
phone on a stand in portrait, and a laptop webcam's real lens distortion at the picture's edge
(4-taps calibration as the fallback). (7) walk the camera over a keyboard, shelves and blinds without
a guitar: nothing may be drawn. Record what fails as frames; they are the first real test set.

## Limits
- Measured on synthetic scenes and a synthetic video only; no real webcam footage was available.
- Classical guitars: the slotted headstock's rollers can continue the fret comb, so the "nut" may be
  found 2-3 frets too far: confident-but-wrong numbering on 4 of 35 confidently numbered classical
  frames in the stored benchmark runs (some scenes counted in several runs; steel 2/370, electric
  2/299). This pass fixed the case where a bone nut follows the rollers; a black nut on a dark
  board stays ambiguous. A tap (`confirmFret`) or marker mode fixes it.
- A maple board with faint strings on a light background can be placed half a string off across
  the neck (seen on 4 of 96 fresh hard/extreme frames); frets stay right.
- Detection takes about 100 ms (p95 ~170-250 on the loaded sandbox) on extreme frames and frames
  without a guitar; it only runs while searching or lost, and the pipeline spaces it out.
- Portrait video: the working frame keeps the pixel count of 640x360, but the alignment search
  widens narrow frames to 640, so portrait costs more.
- Marker pose acquisition (markers seen, detector blind) is a weak fallback; marker numbering is
  the strong part.
- The raised-string correction of the overlay uses typical string heights per preset
  (`STRING_HEIGHT_MM`) and a camera recovered with the principal point at the frame centre; a guitar
  with very high action, or a cropped / digitally zoomed picture, shifts dots slightly at steep views.
- Lens distortion is not modelled (see above): a mild webcam barrel moves dots by up to a millimetre
  or two near the frame corners; a strong one breaks the fit.
- `vision.worker.ts` must be created by `VisionPipeline` (or `new Worker(new URL('./vision.worker.ts',
  import.meta.url), { type: 'module' })` in this directory) so Vite bundles it.
