# `@/core/pitch` — hearing the guitar

Pitch detection, the live microphone pipeline, tuner logic, onsets, chord checking, game helpers
and synthetic test audio. All DSP is pure and runs in Node; only `PitchTracker` touches the browser.
Import from `@/core/pitch`. Times are **seconds on the audio clock** (`AudioContext.currentTime`
live, time since the start of the buffer offline). Pitch follows the app conventions: MIDI numbers,
A4 = 69, sounding pitch.

Verify with `npx vitest run src/core/pitch` (includes the adversarial corpus, one to two minutes;
`PITCH_CORPUS=full` runs every note under every degradation, about seven minutes) and, in a real
browser with a fake microphone, `node e2e/pitch-live.cjs` (a whole practice session and resource
hygiene, `--formats` to survey WAV formats) and `node src/core/pitch/e2e/live.cjs` (the three
capture pipelines).

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

Methods: `start(overrides?) → Promise<{ok:true} | {ok:false, reason: MediaFailure | 'audio-failed', detail?}>`
(`detail: 'superseded'` when `stop()` or another `start()` overtook it),
`stop()`, `on(type, handler) → off`, `onStatus((status, fault?) => …) → off` (`'idle' | 'starting' |
'running' | 'stopped'`; fault `'device-lost' | 'audio-failed'`), `setDevice(id)`, `configure({a4?,
minFreq?, maxFreq?, chroma?})`, `toPerformanceTime(t)`, static `inputs()`. Getters: `status`, `info`
(`{sampleRate, capture: 'worklet'|'analyser', thread: 'worker'|'main', deviceLabel, deviceId,
inputLatency}`), `audioContext`. The microphone is opened through `requestMic()`, so echo cancellation,
noise suppression and auto gain are off (a stream you pass in is used as it is).
Capture is an inlined AudioWorklet (blob URL, no extra file) posting straight to a worker; without
AudioWorklet an AnalyserNode is polled, without Worker the engine runs on the main thread.

Lifecycle, as checked in `e2e/pitch-live.cjs`: 20 start/stop cycles, `stop()` during `start()` and two
`start()` calls at once leave no AudioContext, worker or live track behind. When the microphone
disappears the tracker stops itself (`onStatus('stopped', 'device-lost')`), closes the sounding note
with a `noteoff` and releases everything: offer the learner a restart. `setDevice()` with an id that
no longer exists resolves `{ok:false, reason:'no-device'}` and leaves the tracker stopped. A supplied
`stream` / `audioContext` is never stopped or closed. Plugging in another microphone changes nothing
by itself: the tracker keeps the one it opened until that one goes away (re-list with
`PitchTracker.inputs()` on the browser's `devicechange` event if the screen has a picker, then
`setDevice()`). If the system suspends the tracker's own
context (page in the background on a phone, an incoming call), it is resumed when the page is visible
again; a shared context is its owner's to keep awake (`getEngine().hold()`).

### Events (`PitchEventMap`)

| event | payload | when |
|---|---|---|
| `pitch` | `PitchReading {time, freq, rawFreq, midi, cents, clarity, level, levelDb, noteAge}` | every frame while a note sounds; `freq` is median-smoothed, `cents` is relative to `midi` |
| `noteon` | `{time, detectedAt, midi, freq, level, levelDb, retrigger}` | a new stable note; `time` is the pluck, `detectedAt` when it was confirmed (40 ms later; up to 80 ms when the string is more than 20 cents from a note centre, see Limits) |
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
- `detectOnsets(samples, sampleRate, opts?) → OnsetEvent[]` / `class OnsetDetector`. Two energy envelopes (whole
  signal, treble) plus spectral flux between 1 and 8 kHz, which hears a light upstroke while the
  downstroke still rings (the envelopes barely move); such an onset carries `fluxOnly: true`.
- `computeChroma(samples, sampleRate, {a4?, windowMs?, minMidi?, maxMidi?}) → ChromaFrame {chroma, notes, minMidi, bass, bassMidi, levelDb}` / `class ChromaExtractor`.
- `class NoteTracker`, `class NoiseGate`, `toDb`, `fromDb`, `isMainsPitch`, `FFT`, `fftPlan`, `hannWindow`, `magnitudeSpectrum`, `nextPow2`.

Fine-tuning keys (defaults in brackets). `tracker`: `clarityOn` (0.7), `clarityOff` (0.5), `stableFrames` (3),
`stableCents` (35), `centreCents` (20), `labelSettleMs` (70), `changeFrames` (3), `harmonicChangeFrames` (7),
`switchCents` (60), `holdMs` (110), `releaseMs` (45), `medianSize` (5), `attackHoldMs` (18), `silenceMs` (250),
`retrigger` (true), `rejectHum` (true), `minGateDb` (−68), `maxGateDb` (−38), `marginDb` (8), `unsureCents` (6:
a reading less clear than `clarityOn` only moves the pitch when it lies this close to it, or inside the
scatter of the clear readings when they scatter more). `onset`: `thresholdDb` (3.5), `trebleThresholdDb` (5),
`minIntervalMs` (60), `minLevelDb` (−55), `minFreq` (60), `fluxThreshold` (0.15; 0 switches the flux detector
off; it only runs at 16 kHz and above). `detector`:
`peakThreshold` (0.8), `freshThreshold` (0.9 in the engine; in a bare `PitchDetector` it defaults to
`peakThreshold`), `acceptClarity` (0.9), `gateRms`, `fineHarmonics` (4.2), `finePeriods` (24), `stiffness` (true).
`isMainsPitch(freq, toleranceCents = 25)`.

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
Pass the whole `PitchReading`: with `clarity` the needle ignores unclear readings (below 0.55 not at
all, full weight from 0.8), with `noteAge` it knows a new pluck. Once "in tune" is on it survives
readings up to 3 cents past the tolerance for 150 ms. A tick in `tuned[]` is only taken away by a note
that has sounded for 0.45 s, so a knock on the guitar cannot un-tick a string.

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
// Every tone of a chord is required, except the fifth above `bass` when a bass is given (often left
// out or faint): a required tone under 12 % of the strongest cuts the score, down to a quarter at 3 %.
requiredTones({ pcs: [7, 11, 2, 5], bass: 7 });           // [5, 7, 11]: G7 without its D still passes
matchChord(frame, { pcs: [7, 11, 2, 5], required: [] });  // lenient: any three of four may do
matchChord(frame, g7, { requiredThreshold: 0.2 });        // stricter

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

## Measured accuracy

All figures are from synthetic guitars (no recorded guitar was available in the build environment)
and are reprinted by the tests on every run. Cents throughout.

### The detector alone (`detector.accuracy.test.ts`; one frame at a time, no memory, no smoothing)

Every MIDI note 28–88 (E1–E6, bass range, 44.1 kHz) and 36–88 (C2–E6, default range, 48 kHz) × 7
detunings from −45 to +45 cents × 4 frames, additive test strings. Gross = more than 50 cents off.

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

### The whole engine on an independent corpus (`adversarial.test.ts`, `PITCH_CORPUS=full`)

Notes from the audio engine's waveguide guitar (`@/core/audio`, not the strings the detector was
developed on): all six strings × frets 0–20 = 126 positions, tones steel / nylon / clean / driven,
velocities 0.35 / 0.65 / 0.95, detuned up to ±20 cents, 44.1 and 48 kHz, 0.7 s per note, then
degraded. Run through `PitchEngine` exactly as the live pipeline does. "Wrong" = note-ons naming
another note, reported while the note was being scored; errors are of the `pitch` readings from
150 ms after the pluck; SNR and "dB below"
are relative to the first 300 ms of the note. With a hum or a ringing string the note is scored
while it is at least 6 dB louder than that sound (a single-note tracker follows the loudest).

| condition (126 notes unless stated) | found | wrong | median | p95 | max | gross |
|---|---|---|---|---|---|---|
| clean, 44.1 or 48 kHz | 100 % | 0 | 0.00 | 0.08 | 0.55 | 0 % |
| small mic: 4th-order high-pass at 120 / 200 / 300 Hz | 100 % | 0 | 0.00 | 0.08 | 0.63 | 0 % |
| white noise at 30 / 20 / 10 dB SNR | 100 % | 0 | 0.03 / 0.06 / 0.13 | 0.14 / 0.27 / 0.70 | 0.8 / 2.9 / 3.0 | 0 % |
| pink noise at 30 / 20 / 10 dB SNR | 100 % | 0 | 0.05 / 0.09 / 0.23 | 0.23 / 0.59 / 1.6 | 2.0 / 4.7 / 6.3 | 0 % |
| hum 50 Hz + harmonics, 20 / 10 dB below (126 / 82 notes) | 100 % | 0 | 0.03 / 0.09 | 0.34 / 0.89 | 3.3 / 8.4 | 0 % |
| hum 60 Hz + harmonics, 20 / 10 dB below (126 / 80 notes) | 100 % | 0 | 0.05 / 0.09 | 0.61 / 1.4 | 4.2 / 6.6 | 0 % |
| one other string ringing 12 dB below | 100 % | 0 | 0.08 | 0.95 | 10.2 | 0 % |
| two other strings ringing, 18 / 12 dB below | 100 % | 0 | 0.11 / 0.24 | 0.67 / 1.4 | 4.4 / 10.0 | 0 % |
| the octave below ringing, 18 / 12 dB below (100 notes) | 100 % | 0 | 0.18 / 0.32 | 0.76 / 1.6 | 1.4 / 3.7 | 0 % |
| the twelfth below ringing 12 dB below (78 notes) | 100 % | 0 | 0.22 | 1.0 | 3.5 | 0 % |
| early reflections (desk and wall, 3–31 ms) | 100 % | 0 | 0.01 | 0.14 | 2.6 | 0 % |
| the same reflections 1.6× as strong | 99.2 % | 1 (octave) | 0.01 | 0.16 | 3.1 | 0.8 % |
| clipping, peaks 6 / 12 dB over full scale | 100 % | 0 | 0.00 / 0.04 | 0.21 / 0.57 | 1.2 / 1.8 | 0 % |
| DC offset 0.1 | 100 % | 0 | 0.00 | 0.08 | 0.55 | 0 % |
| quiet input, 30 dB down (plucks at −45 to −62 dBFS), 16 bit | 100 % | 0 | 0.01 | 0.08 | 0.55 | 0 % |
| very quiet input, 40 dB down (plucks at −55 to −72 dBFS) | 73.8 % | 0 | 0.02 | 0.11 | 0.55 | 0 % |
| dropped buffers: three 10 ms / two 25 ms gaps per note | 100 % | 0 | 0.01 | 0.13 / 0.26 | 3.0 / 3.1 | 0 % |
| laptop: HP 200 + reflections + pink 20 dB + a string ringing | 99.2 % | 1 (octave) | 0.14 | 0.77 | 14 | 0.8 % |
| phone: HP 300 + white 20 dB + clipping | 100 % | 0 | 0.06 | 0.34 | 3.3 | 0 % |

Dropped buffers also caused 1 and 4 false re-plucks (of 378 and 252 gaps). The largest errors at
10 dB noise come from the end of a note fading into it: a reading less clear than 0.7 may confirm
the pitch but not move it (`unsureCents`), which took the worst pink-noise reading from 29 to 6
cents and the worst white-noise one from 9 to 3 with no change to the median. Readings cover 99–100 %
of a clean note, 89 % at 10 dB pink noise, 92 % of a quiet one (it falls below the gate sooner).

| technique | result |
|---|---|
| natural harmonics, 12th / 7th / 5th fret (54) | all named right; median 0.00, max 0.07 |
| palm-muted notes, strings 6–3 (40) | all named right within 50 ms; median 0.15, p95 2.0, max 9.4 (a damped string is short-lived and a little sharp) |
| staccato, stopped after 50 / 80 / 120 ms (126 each) | all named right, note-on after 40 ms; p95 6.8 / 5.0 / 2.2 in the few frames there are |
| vibrato ±20 cents at 5.5 Hz, ±35 at 6.5 Hz (36 each) | one note throughout, no neighbour; readings trail the string by 55–60 ms and are then within 1.8 / 4.3 cents (median) |
| bends of 1 and 2 semitones, hold, release (48) | passing notes reported up and down in order in 47 of 48; never a note outside the bend |
| hammer-ons and pull-offs, ±1 to ±3 and +12 semitones, with a soft attack or none at all (162) | all found, 0 wrong, 40–60 ms after the change |
| stiff strings (B up to 4e-4) plucked hard, C2 and D2 (drop tunings) to E4, also through 200 / 300 Hz high-pass (189) | all right; max 1.2 cents from 0.4 s after the pluck |
| the same strings with a fundamental that dies in 0.3 s (126) | all right, no octave jump; max 1.1 |
| strings 6–4 tuned 42 cents off (156) | first note-on names the right note every time, 70–80 ms after the pluck |

| nothing is being played (40 s at each sample rate) | note-ons |
|---|---|
| digital silence; white or pink noise at −70 / −50 / −30 / −15 dBFS; noise wandering by 20 dB | 0 |
| mains hum with harmonics, 50 or 60 Hz, at −60 / −45 / −30 / −20 dBFS, there from the start | 0 |
| hum switched on in mid-session (−45 dBFS, with its click) | 50 Hz: 0; 60 Hz: one "note" lasting 1.6 s |
| finger squeaks, palm thumps, pick scrapes (600 of each) | 0 |
| knocks on the body (400) | every knock: 1.2–1.3 note-ons between F♯2 and A2, up to 0.4 s long (see Limits) |

Note-on latency (analysis only; add the device's input latency): median 40 ms on every string, p95
50 ms on strings 6 and 5 and 40 ms above, 80 ms at most.

### The tuner on that corpus

Open strings plucked twice 1.1 s apart, at 0, ±2, ±6 and +25 cents (36 plucks each); needle =
`TunerState.cents` from 0.3 s to 1 s after each pluck. The right string was shown every time.

| room | needle error median / p95 / max | in tune confirmed at 0, ±2 | at ±6 | verdict flickers |
|---|---|---|---|---|
| clean | 0.00 / 0.05 / 0.11 | 108 of 108, after 560 ms | never | 0 |
| laptop (HP 200, reflections, pink 25 dB) | 0.03 / 0.19 / 2.0 | 108 of 108, after 560 ms | never | 0 |
| phone (HP 300, white 20 dB, clipping) | 0.03 / 0.17 / 0.8 | 108 of 108, after 560 ms | never | 0 |
| noisy room (pink noise 12 dB below the pluck) | 0.11 / 0.5–0.8 / 4.5 | 102 of 108 | never | 0 |
| hum 50 Hz, 15 dB below the pluck | 0.13 / 0.76 / 1.8 | 93 of 108 | never | 0 |
| hum 60 Hz, 15 dB below the pluck | 0.07 / 0.3–0.45 / 4.9 | 77 of 108 | never | 0 |

(Under a hum the trebles fade into it before the half second of holding is over: pluck again.)
Re-plucking a ringing string: needle within 2 cents after 40 ms (median), 110 ms (p95). Turning the peg
at 20 cents a second: needle 3.8 cents behind (median; 5.3 p95), no overshoot on arrival. Ringing out
to silence: followed for 3.9 s (median) with no octave jump, no other string, error at most 1.3 cents.
Knocks, squeaks, thumps and scrapes after tuning: no false "in tune", no tick lost.

### In a browser (`e2e/pitch-live.cjs`, Chromium, fake microphone at 44.1 kHz from a 48 kHz file)

A 22 s session through a laptop-microphone model: six open strings left ringing while the next is
tuned (readings median within 0.12 cents of the truth, 98–100 % within 3 cents, and the readings
the detector was unsure of, clarity under 0.7, barely worse: median −0.6, worst 4.2; needle within 2.3;
E2 +1.5, D3 0 and B3 −2 confirmed in tune after 560 ms, A2 −6, G3 +8, E4 +12 never), a scale at four
notes a second (eight note-ons in order, on time to 1 ms, reported after 47 ms) and two strummed
chords (`waitForChord` on the first strum, each ranked first of ten candidates), then the lifecycle
checks listed under `PitchTracker`. 49 checks. The 48 older ones passed five times in a row on a
heavily loaded machine; on a badly overloaded one the chord checks can fail when the capture falls
behind (seen once while this was written, the session clock 0.9 s off). The last string of the tuning section is followed for 1.2 to 1.9 s depending on where the
frames fall (the five strings ringing under it raise the noise floor by 3 dB when there is a gap).

- **Speed**: 0.15–0.55 ms per frame (1.3 ms worst case: bass range on pure noise); the whole engine at
  100 frames/s uses about 3.5 % of one core (the onset flux adds about 0.3 points), 4.5–5 % with chroma.
- **Response** (analysis only): note-on 40 ms after the pluck (50–60 ms for the low E); tuner needle
  within 1 cent by 60 ms on a steady string, and within 2 cents by 140–170 ms (1 cent by 170–230 ms)
  when the string itself starts 12 cents sharp from a hard pluck.
- **Onsets**: median error 0–1.5 ms, worst 5 ms; none missed from silence, nor with a pick or a soft
  thumb over a ringing string (the thumb used to be missed 1 time in 8). A light upstroke a sixteenth
  after a downstroke that is still ringing (audio-engine guitar, 70–110 BPM) is heard every time:
  192 of 192 within 4.5 ms, where the energy envelopes alone hear none of them; so are all 592
  strokes of the rhythm library's strum patterns, with nothing extra (`features/rhythm`). Such a
  stroke, heard only by the high-band flux, is reported about 12 ms later than an envelope onset.
  Flux-only onsets are not passed on by `PitchEngine` while the input clips or around a dropped
  buffer. Nothing is reported in the first 40 ms of a stream.
- **Chords**: 20 open and barre chords, each scored against all 20, clean / small mic + noise / soft
  up-strum: 480 of 480 named correctly; C–Am, G–Em, D–Dsus4, E–Em and four similar pairs separated by
  more than 0.15 in score both ways. The six four-note shapes of that set (3 strum styles × 4 takes)
  with one tone silent (neither the bass nor the fifth): 4 of 144 still pass 0.6 (100 of 144 with
  `required: []`, the old behaviour); all 72 whole ones pass.

## Limits (be honest with learners)

- **One note at a time.** Pitch tracking follows the loudest note. Other strings may ring up to about
  8–10 dB below it; closer than that, readings can jump to the other note or drop out. When a note
  an octave or a twelfth lower is still ringing, the played note hides inside its overtones: the
  tracker gets it right because it remembers what was sounding before the pluck (no miss in 178
  notes with the lower note 12 dB down, for as long as the played note stayed 6 dB louder); a lower
  note it never tracked gets no such help, so offer `octaves: 'any'` in games where that is acceptable.
- **A note with neither a fundamental nor odd overtones reads an octave high.** A small microphone
  removes the fundamental, and one strong reflection (a laptop on a desk) or an overdriven amp can
  remove the odd overtones of a particular note as well; what is left *is* the octave. 1 note in 126
  in the laptop row above, and it stays wrong for that note in that spot. The tuner still shows the
  right string (it reads the octave as that string's harmonic), games see a wrong octave.
- **A knock on the body is a short low note.** The body rings at its own resonance, about 100 Hz,
  for a few tenths of a second, exactly like a damped low string. It is reported as F♯2–A2. The
  tuner cannot be fooled into "in tune" or lose a tick by it, and `waitForNote` only accepts it if the
  wanted note happens to be that one; do not count bare `noteon` events below B2 as mistakes.
- **The first 50 ms belong to the guitar, not the string.** On the two low strings of an acoustic the
  body's thump pulls the first readings 10–60 cents off. A note whose first readings are more than 20
  cents from a note centre is therefore named only 70–80 ms after the pluck (40 ms otherwise);
  `noteon.time` is the pluck either way. Just after that the string really is sharp and the needle
  shows it settling: in-tune confirmation waits 100 ms and then needs 450 ms inside the tolerance.
- **For the last cent, damp the other strings.** With the neighbouring open string still ringing
  20 dB below the one being tuned the reading is within 0.2 cent; at 12 dB below, typically 0.1 and up
  to about 0.8; at 6 dB below, up to about 3.5 (worst when that string is itself out of tune).
- **Moving pitch is followed with a lag**: about 60 ms for vibrato and bends in `pitch` readings, and
  200–250 ms in the tuner needle while a peg is being turned (5 cents behind at 20 cents a second).
- **Stiff strings.** On a steady, clean note the stretch of the partials is measured and removed,
  so the reading is the first partial. When hum, noise or another string disturbs that measurement
  it is skipped, and a very stiff string (B = 1e-4) then reads 0.5 cent sharp (typical strings
  0.1–0.3).
- **Hum.** A tone on a multiple of 50 or 60 Hz (within 10 cents) that nobody plucked is watched, not
  named, and after a second of steady level it is adopted as background however loud it is
  (`level.hum`). From then on, and for 15 s after it was last heard, a note needs a pluck, has to be
  6 dB above the hum to start and is let go once it has decayed to within 4 dB of it. A hum that is
  switched on with a click passes for a pluck and shows as one note for about 1.6 s. 50 Hz mains
  lies below the default pitch range: it never becomes a note and is gated like noise, but
  `level.hum` stays false for it. Two strings beating slowly can register as an onset.
- **Noise.** White noise down to 10 dB SNR costs under a cent. Low rumble (pink noise) at 10 dB SNR
  leaves the note names right; as the note fades into it the raw readings (`rawFreq`, with
  `clarity` below about 0.7) are one in ten more than 10 cents off, but they only move `freq` when
  they agree with it, so single readings stay within about 6 cents.
- **Onsets from handling noise.** A pick scraped along a wound string is a train of clicks that
  swells for a few hundred ms: it is reported as an onset, and the long loud ones as two (about one
  scrape in five at a loud level; before the high-band flux it was about one per scrape).
- **Quiet inputs.** The gate never goes below −68 dBFS. With the loudest pluck at −45 dBFS everything
  works; at −55 dBFS the soft notes are no longer heard. `level.db` and `gateDb` say so.
- **Dropped audio.** A buffer of exact zeros cutting into a note (an overloaded device) is recognised
  and the note carries on; about one such gap in a hundred still looks like a re-pluck. Other
  glitches (repeated or skipped samples) are not recognised.
- **Re-plucks** of the same note need an audible attack; a very soft re-pluck merges into one note.
- **Chords**: this verifies an expected chord and ranks a handful of candidates; it does not
  transcribe. It works on pitch classes, so inversions and voicings are not told apart except through
  the `bass` hint (right about 95 % of the time). A triad against its own seventh chord (C vs Cmaj7,
  A vs A7) is the weak spot: right in all 40 synthetic takes, but by a score margin of only 0.03–0.08,
  so expect misses on real guitars. A chord needs every tone but the fifth above its bass: a G7
  strummed without its F fails, and so does one whose F is just 3 % as strong as its loudest
  note. Between 3 and 12 % the score falls off gradually, so a tone that is there but badly muted can
  still pass. Allow ~110 ms after the strum (`waitForChord` does). Notes below
  about 150 Hz a tone or less apart are not resolved. A string more than a third of a semitone out
  starts to count toward the neighbouring pitch class. While a chord rings, `pitch`/`noteon` events
  (which assume one note) are not meaningful.
- **Background and fallbacks.** With AudioWorklet capture nothing depends on main-thread timers. The
  analyser fallback (no AudioWorklet) is fine for pitch, slightly less precise for onsets, and stalls
  while the tab is in the background because timers are throttled. A really hidden tab could not be
  produced in the headless test browser; what is tested is a context suspended by the system and
  the tracker waking it when the page is visible again.
- **Accuracy figures are from synthetic strings**: two independent string models (additive with
  stretched partials; a waveguide with body resonances, pick noise and two-stage decay), small
  microphones, rooms, noise, hum and ringing strings, but no recorded guitar. Expect real instruments
  to sit between the clean and the laptop rows. The speed test (`bench.test.ts`) measures wall-clock
  time and can fail on a machine that is busy with other work.

## Notes for tuner screens

- Wire it with `attachTuner(tracker, tuner, onState)`; drive the needle with `state.cents` (already
  smoothed and clarity-weighted) and never with raw `pitch` events. Hide the needle when
  `state.active` is false and keep the last string name on screen.
- Use `state.hint.code` for the wording and `state.direction` for the arrow; `far-below` / `far-above`
  (more than a whole step) mean "check you are turning the right peg", not "keep turning".
- Tick strings from `state.tuned` / `onTuned`, not from `state.inTune` (that is the live verdict and
  goes away when the string stops).
- Show the input from `level` events: `clipping` → "too loud, move back"; `db < gateDb` while the
  learner is clearly playing → "too quiet, move closer"; `hum` → "there is a hum on the input; pluck
  firmly and damp the other strings".
- Tell the learner to let one string ring and damp the rest for the last cent, and to pluck again
  if nothing is confirmed: under noise or hum a treble string fades before the half second is over.
- Start the tracker from the "Start tuning" tap, stop it in the effect cleanup, and listen to
  `onStatus` for `'device-lost'`.

## Notes for games and lessons

- Ask "did they play X" with `waitForNote` (it judges the held pitch, 40 cents either side, for
  60 ms) rather than by comparing `noteon.midi` yourself. A bare `noteon` can be a passing note of a
  bend, a knock on the body or the octave of a note in an awkward room.
- Time rhythm from `noteon.time` or `onset.time` (the pluck, accurate to a few ms), never from when
  the event arrived (`detectedAt`, 40–80 ms later, plus the device's input latency).
- Ask for a chord just before it is due: every strum heard while `waitForChord` is waiting counts as
  a failed attempt. Give it `rivals` that differ by one note.
- Use `octaves: 'any'` where the octave does not matter, and `toleranceCents` of 40–50 for beginners
  whose guitars are not perfectly in tune (retune first if `cents` in the result is beyond ±25).
- For legato material expect 50–60 ms from the hammer-on to the event, and no `onset`.
- One tracker per screen; share the playback context (`audioContext: getAudioContext()` with
  `getEngine().hold()`) when events must line up with the metronome.

## Test support (not exported from the barrel)

`adversarial-kit.ts`: `renderNote` (audio-engine guitar, cached), `stiffString`, degradations
(`micHighpass`, `background('white' | 'pink' | 'hum50' | 'hum60')`, `earlyReflections`, `hardClip`,
`addDc`, `quietInput`, `dropouts`, `pitchWarp`, `legatoJoin`, `handlingNoise`), scenes with ground
truth (`singleNoteScene`, `withInterference`) and scoring (`scoreScene`, `newTally`, `addScore`,
`summarize`, `reportRow`). Use it for fixtures in feature tests and end-to-end scripts
(`loadTs('/src/core/pitch/adversarial-kit.ts')`). Chromium's fake microphone takes 16-bit PCM
(mono or stereo; 22.05, 44.1 or 48 kHz) or 32-bit float WAV files and resamples them to the context's
rate; 24-bit PCM plays as silence. Append `%noloop` to the path to play the file once; after its end
Chromium repeats the last 10 ms of the file (a 100 Hz buzz, which the tracker flags as hum after a
second), so stop listening when the file is over. `src/core/pitch/e2e/live.cjs` polls an
AnalyserNode in one of its variants; on a badly overloaded machine that variant can miss audio and
fail with "5 onsets for 6 notes".
