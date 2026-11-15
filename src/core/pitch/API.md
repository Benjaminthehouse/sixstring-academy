# `@/core/pitch` — hearing the guitar

Pitch detection, the live microphone pipeline, tuner logic, onsets, chord checking, game helpers
and synthetic test audio. All DSP is pure and runs in Node; only `PitchTracker` touches the browser.
Import from `@/core/pitch`. Times are **seconds on the audio clock** (`AudioContext.currentTime`
live, time since the start of the buffer offline). Pitch follows the app conventions: MIDI numbers,
A4 = 69, sounding pitch. Verify with `npx vitest run src/core/pitch` and, in a real browser with a
fake microphone, `node src/core/pitch/e2e/live.cjs`.

## Live: `PitchTracker`

```ts
const tracker = new PitchTracker({ a4: 440 });          // options below; all optional
const res = await tracker.start();                       // call from a click/tap handler
if (!res.ok) show(explainMediaFailure(res.reason === 'audio-failed' ? 'unknown' : res.reason, 'microphone'));
const off = tracker.on('pitch', (r) => drawNeedle(r.cents));   // returns the unsubscribe function
tracker.stop();                                          // releases mic, nodes, worker; closes a sounding note
```

`new PitchTracker(options?: PitchTrackerOptions)`

| option | default | meaning |
|---|---|---|
| `a4` | 440 | reference pitch |
| `minFreq` / `maxFreq` | 60 / 1760 Hz | pitch range. `minFreq: 30` for 4-string bass (E1), 23 for a low B; low notes then get longer windows, high notes stay fast |
| `hopMs` | 10 | time between pitch frames |
| `chroma`, `chromaHopMs`, `chromaWindowMs` | false, 50, 180 | emit `chroma` events (needed by `waitForChord`) |
| `stream` / `stopStream` | – / false | use an existing `MediaStream` instead of `requestMic()` |
| `deviceId` | system default | input device, from `PitchTracker.inputs()` |
| `audioContext` | own context | pass the app's playback context to get events on the **same clock** as the metronome |
| `capture` / `worker` | `'auto'` / true | force the `'analyser'` fallback / the main thread |
| `detector`, `tracker`, `onset` | – | fine-tuning: `PitchDetectorOptions`, `NoteTrackerOptions`, `OnsetOptions` |

Methods: `start(overrides?) → Promise<{ok:true} | {ok:false, reason: MediaFailure | 'audio-failed', detail?}>`,
`stop()`, `on(type, handler) → off`, `onStatus((status, fault?) => …) → off` (`'idle' | 'starting' |
'running' | 'stopped'`; fault `'device-lost' | 'audio-failed'`), `setDevice(id)`, `configure({a4?,
minFreq?, maxFreq?, chroma?})`, `toPerformanceTime(t)`, static `inputs()`. Getters: `status`, `info`
(`{sampleRate, capture: 'worklet'|'analyser', thread: 'worker'|'main', deviceLabel, deviceId,
inputLatency}`), `audioContext`. The microphone is opened through `requestMic()`, so echo cancellation,
noise suppression and auto gain are off (a stream you pass in is used as it is).
Capture is an inlined AudioWorklet (blob URL, no extra file) posting straight to a worker; without
AudioWorklet an AnalyserNode is polled, without Worker the engine runs on the main thread.

### Events (`PitchEventMap`)

| event | payload | when |
|---|---|---|
| `pitch` | `PitchReading {time, freq, rawFreq, midi, cents, clarity, level, levelDb, noteAge}` | every frame while a note sounds; `freq` is median-smoothed, `cents` is relative to `midi` |
| `noteon` | `{time, detectedAt, midi, freq, level, levelDb, retrigger}` | a new stable note; `time` is the pluck, `detectedAt` when it was confirmed |
| `noteoff` | `{time, midi, duration}` | faded, damped or replaced |
| `silence` | `{time}` | once per quiet stretch |
| `onset` | `{time, strength, levelDb}` | a pluck or strum (one per strum) |
| `level` | `{time, rms, db, peak, clipping, noiseFloorDb, gateDb, hum}` | ~30/s always; `clipping` = back off; `hum` = mains hum is being ignored |
| `chroma` | `{time, span, chroma[12], bass, levelDb}` | with `chroma: true`, ~20/s |

Anything with `on()` is a `PitchSource`. `EventHub` (`on`, `emit`, `emitAll`, `has`, `clear`) is a
source you feed yourself — tests replay `analyze()` output through it.

## Offline and building blocks

- `analyze(samples, sampleRate, opts?: AnalyzeOptions) → PitchEvent[]` — everything the live pipeline would emit.
- `class PitchEngine({sampleRate, …same analysis options})`: `process(chunk, startTime?) → PitchEvent[]`,
  `configure(patch)`, `reset(origin?)`, `time`. The chain behind both the worker and `analyze`.
- `detectPitch(samples, sampleRate, {minFreq?, maxFreq?, hintFreq?, …}) → PitchEstimate {freq, clarity, rms, window}` /
  `new PitchDetector(opts).detect(buf, hintFreq?, end?, staleFreq?)`. Stateless. Give it DC-free audio and,
  for full accuracy on low notes, `detector.historyNeeded` samples. `clarity` below ~0.7 is not a note.
- `detectOnsets(samples, sampleRate, opts?) → OnsetEvent[]` / `class OnsetDetector`.
- `computeChroma(samples, sampleRate, {a4?, windowMs?, minMidi?, maxMidi?}) → ChromaFrame {chroma, notes, minMidi, bass, bassMidi, levelDb}` / `class ChromaExtractor`.
- `class NoteTracker`, `class NoiseGate`, `toDb`, `fromDb`, `isMainsPitch`, `FFT`, `fftPlan`, `hannWindow`, `magnitudeSpectrum`, `nextPow2`.

Fine-tuning keys (defaults in brackets). `tracker`: `clarityOn` (0.7), `clarityOff` (0.5), `stableFrames` (3),
`stableCents` (35), `changeFrames` (3), `harmonicChangeFrames` (7), `switchCents` (60), `holdMs` (110),
`releaseMs` (45), `medianSize` (5), `attackHoldMs` (18), `silenceMs` (250), `retrigger` (true), `rejectHum`
(true), `minGateDb` (−62), `maxGateDb` (−38), `marginDb` (8). `onset`: `thresholdDb` (3.5),
`trebleThresholdDb` (5), `minIntervalMs` (60), `minLevelDb` (−55). `detector`: `peakThreshold` (0.8),
`acceptClarity` (0.9), `gateRms`, `fineHarmonics` (4.2), `finePeriods` (24), `stiffness` (true).

## Tuner logic (no UI)

```ts
const tuner = new Tuner({ targets: tuningFrequencies([40, 45, 50, 55, 59, 64], a4) });  // low → high, Hz
const stop = attachTuner(tracker, tuner, (s) => {
  needle.set(s.active ? s.cents : null);                  // smoothed: fast when far, calm when close
  label.textContent = s.targetName;                       // "E2", or your own `labels`
  hint.textContent = s.hint.text;                         // s.hint.code for styling / your own copy
  lights.set(s.tuned);                                    // per-string checklist
});
tuner.onTuned((string) => celebrate(string));             // fires once per confirmation
tuner.lock(5); tuner.lock(null); tuner.setMode('chromatic'); tuner.setTargets(freqs, labels); tuner.setA4(442);
```

`TunerOptions`: `targets`, `labels`, `a4` (440), `mode` (`'auto' | 'locked' | 'chromatic'`),
`lockedString`, `toleranceCents` (3), `holdMs` (450), `farCents` (200), `harmonics` (true).
`TunerState`: `mode, active, string, targetName, targetFreq, targetMidi, freq, cents, rawCents,
withinTolerance, inTune, holdProgress, direction ('up' = tighten | 'down' | 'ok' | null), harmonic
(1 | 2), hint {code, text, severity}, tuned[], justTuned`. Hint codes: `listen, tune-up, tune-down,
almost-up, almost-down, hold, in-tune, far-below, far-above, other-string`. `far-*` is the warning
that the string is more than a whole step off (do not snap it); `other-string` appears in locked mode.
Auto mode has hysteresis between strings and reads a 12th-fret harmonic as its string.
Without `attachTuner`: `tuner.update(reading)` per `pitch` event, `tuner.release()` on `noteoff`/`silence`.

## Game helpers

```ts
// Wait for a note (or any of several). Resolves, never rejects.
const wait = waitForNote(tracker, 64, { toleranceCents: 40, octaves: 'exact', minHoldMs: 60, timeoutMs: 8000,
  onWrongNote: (n) => say(`That was ${midiToName(n.midi)}`) });
const r = await wait;       // {ok:true, midi, playedMidi, cents, time, heldMs, wrongNotes}
                            // | {ok:false, reason:'timeout'|'cancelled', time, wrongNotes}
wait.cancel();              // or pass { signal: abortController.signal }

// Check a chord (tracker started with chroma: true). `rivals` must score lower.
const c = await waitForChord(tracker, { name: 'G', pcs: [7, 11, 2], bass: 7 }, { threshold: 0.6, timeoutMs: 10000,
  rivals: [{ pcs: [4, 7, 11] }], onAttempt: (m) => say(`missing ${m.missing}, extra ${m.extra}`) });
// {ok:true, match: ChordMatch, time, failedAttempts} | {ok:false, reason, time, lastAttempt, failedAttempts}
const m = matchChord(chromaFrameOrArray, chord);          // {score, purity, coverage, present, missing, extra, bassOk}
rankChords(frame, candidates); averageChroma(frames); pitchClassesOf(midis);

// Record a phrase and mark it.
const rec = new NoteRecorder(tracker, { minDurationMs: 50, onNote });
rec.start(); /* … */ const take = rec.stop();             // RecordedNote {midi, start, end, duration, cents, levelDb}[]
const result = compareNotes(take, [57, 59, 60, 62], { octaves: 'exact' });
// {correct, missed[], extra[], accuracy, perfect, alignment[{expected, played, kind}]}
```

Timeouts run on the audio clock, so the helpers behave identically on replayed events in tests.

## Test signals

`pluckedString({freq, sampleRate, duration, startTime?, amplitude?, partials?, rolloff?, pluckPosition?,
inharmonicity?, decay?, decayTilt?, fundamentalGain?, highpassHz?, highpassOrder?, attackMs?, attackNoise?,
attackNoiseMs?, driftCents?, driftMs?, seed?})`, `strum({freqs, strumMs?, levels?, …})`,
`harmonicTone`, `addNoise(x, snrDb, seed?)`, `addHum(x, sr, {freq, rms})`, `whiteNoise`, `mix`, `concat`,
`silence`, `rmsOf`, `partialFrequency`, `seededRandom`, `gaussian`, `encodeWav(samples, sr, {bitDepth: 16|24|32})`,
`decodeWav`. A 16-bit WAV from `encodeWav` is what `withApp({ fakeAudio })` plays as the microphone.

## Measured accuracy (from the test suite; cents, no smoothing, one frame at a time)

Every MIDI note 28–88 (E1–E6, bass range, 44.1 kHz) and 36–88 (C2–E6, default range, 48 kHz) × 7
detunings from −45 to +45 cents × 4 frames. Gross = more than 50 cents off (octave errors included).

| condition | median | p95 | max | gross |
|---|---|---|---|---|
| steady harmonic tone | 0.000 | 0.002 | 0.05 | 0 % |
| clean plucked string | 0.000 | 0.006 | 0.28 | 0 % |
| weak fundamental (small mic) / no fundamental at all | 0.001 | 0.02 | 0.49 | 0 % |
| noise at 20 dB SNR | 0.05 | 0.19 | 0.59 | 0 % |
| stiff string, B = 1e-4 | 0.001 | 0.007 | 0.86 | 0 % |
| mains hum 20 dB below the note | 0.01 | 0.34 | 2.3 | 0 % |
| pick noise + pitch settling (12 cents sharp at the pluck) | 0.04 | 0.97 | 1.4 | 0 % |
| another string ringing 12 dB below | 0.08 | 0.84 | 8.3 | 0 % |
| laptop mic: all of the above together | 0.51 | 1.9 | 3.1 | 0 % |

- **Speed**: 0.15–0.55 ms per frame (1.3 ms worst case: bass range on pure noise); the whole engine at
  100 frames/s uses about 3 % of one core, 4–5 % with chroma.
- **Response** (analysis only; add the device's input latency): note-on 40 ms after the pluck (50–60 ms
  for the low E); tuner needle within 1 cent by 60 ms on a steady string, and within 2 cents by
  140–170 ms (1 cent by 170–230 ms) when the string itself starts 12 cents sharp from a hard pluck.
- **Onsets**: median error 0.5–1.7 ms, worst 7 ms; none missed from silence or with a pick over a
  ringing string; a soft thumb stroke over an equally loud ringing string is missed about 1 time in 8.
- **Chords**: 20 open and barre chords, each scored against all 20, clean / small mic + noise / soft
  up-strum: 480 of 480 named correctly; C–Am, G–Em, D–Dsus4, E–Em and four similar pairs separated by
  more than 0.15 in score both ways.

## Limits (be honest with learners)

- **One note at a time.** Pitch tracking follows the loudest note. Other strings may ring up to about
  8–10 dB below it; closer than that, readings can jump to the other note or drop out. A new note
  exactly an octave or two above a string still ringing is only found because the tracker remembers
  the old note; offer `octaves: 'any'` in games where that is acceptable.
- **For the last cent, damp the other strings.** With the neighbouring open string still ringing
  20 dB below the one being tuned the reading is within 0.2 cent; at 12 dB below, typically 0.1 and up
  to about 0.8; at 6 dB below, up to about 3.5 (worst when that string is itself out of tune).
- **Stiff strings.** On a steady, clean note the stretch of the partials is measured and removed,
  so the reading is the first partial. When hum, noise or another string disturbs that measurement
  it is skipped, and a very stiff string (B = 1e-4) then reads 0.5 cent sharp (typical strings
  0.1–0.3): that is the 0.5 in the last row of the table.
- **Just after the pluck the string really is sharp**; the needle shows it settling. In-tune
  confirmation waits 100 ms and then needs 450 ms inside the tolerance.
- **Hum**: steady mains hum present from the start is learned as the noise floor. Hum that appears
  later may show as a note for up to about 3 s before it is recognised (`level.hum`). Hum louder than
  −38 dBFS is not gated. Two strings beating slowly can register as an onset.
- **Re-plucks** of the same note need an audible attack; a very soft re-pluck merges into one note.
- **Chords**: this verifies an expected chord and ranks a handful of candidates; it does not
  transcribe. It works on pitch classes, so inversions and voicings are not told apart except through
  the `bass` hint (right about 95 % of the time). A triad against its own seventh chord (C vs Cmaj7,
  A vs A7) is the weak spot: right in all 40 synthetic takes, but by a score margin of only 0.03–0.08,
  so expect misses on real guitars. Allow ~110 ms after the strum (`waitForChord` does). Notes below
  about 150 Hz a tone or less apart are not resolved. A string more than a third of a semitone out
  starts to count toward the neighbouring pitch class. While a chord rings, `pitch`/`noteon` events
  (which assume one note) are not meaningful.
- **Analyser fallback** (no AudioWorklet): fine for pitch, slightly less precise onsets, and it stalls
  while the tab is in the background because timers are throttled.
- **Accuracy figures are from synthetic strings.** The model includes weak fundamentals, inharmonicity,
  per-partial decay, pick noise, pitch drift, noise, hum and ringing strings, but no recorded guitar
  was available in the build environment; expect real instruments to sit between the clean and the
  "laptop mic" rows.
