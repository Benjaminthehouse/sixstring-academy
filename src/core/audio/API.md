# `@/core/audio` — the audio engine

Everything is synthesised (no sample files). Pure DSP (rendering, timeline maths, arranging) runs in
Node; Web Audio is only touched when something is played. Unit tests: `npx vitest run src/core/audio`.
Browser check: `node e2e/audio-smoke.cjs` (`--quick` skips the idle wait).

**Conventions.** Pitch = MIDI numbers (A4 = 69; fractions bend). Time = seconds on the audio clock
(`audioNow()`); every `when` argument is the moment the sound is *heard*, default "now". Musical time
= ticks, `PPQ` = 960 per quarter; bars and beats are **0-based** indices (`formatPosition` prints 1-based).
Velocity 0..1. Strings 1 = thinnest. Chords for strums are MIDI lists **low to high**.

**Starting audio.** Call `unlockAudio()` (or any play function) inside a click/tap/key handler. The app
shell should call `installAudioUnlock()` once: it resumes audio on the first gesture and after iOS
interruptions. Sounds requested before the first gesture are dropped, never played late. The context
suspends itself after ~6 s of silence and wakes on the next sound; keep it awake with
`getEngine().hold()` (returns a release function) if you analyse the microphone through it.

## Recipes

```ts
import { unlockAudio, pluck, strum, stopAll, audioNow, playTone, playUi, startDrone } from '@/core/audio';

await unlockAudio();                                   // in the Play button's handler
pluck(52);                                             // E3 now, steel-string acoustic
pluck(64, audioNow() + 0.5, { tone: 'nylon', velocity: 0.6, string: 2, duration: 0.4 });
strum([40, 47, 52, 56, 59, 64], undefined, { direction: 'down', velocity: 0.8 });   // E major
strum([45, 52, 57, 60, 64], audioNow() + 0.5, { direction: 'up', tone: 'clean', spread: 0.02 });
stopAll();                                             // damp everything, scheduled notes included

const ref = playTone(45, undefined, { voice: 'reference' });   // tuner reference A2, until ref.stop()
playUi('correct');                                     // never throws; safe anywhere
const drone = startDrone({ root: 45, fifth: true });   // drone.setRoot(47); drone.stop();
```

```ts
import { Metronome } from '@/core/audio';
const m = new Metronome({ tempo: 90, timeSignature: '7/8' });  // grouping 2+2+3; or '7/8(3+2+2)'
m.subdivision = 'eighth'; m.sound = 'woodblock'; m.setAccent(2, 0);
m.speedTrainer = { startBpm: 60, targetBpm: 120, stepBpm: 5, everyBars: 4 };
m.silentBars = { playBars: 2, muteBars: 2 };
const off = m.onBeat((b) => flash(b.beat, b.level));   // fires when the beat is HEARD
m.start();  m.setTempo(100);  m.tap();  m.position().beatProgress;  m.stop();  off();  m.dispose();
```

```ts
import { BackingBand, chordFromIntervals } from '@/core/audio';
const C = { root: 0, tones: [0, 4, 7], symbol: 'C' };              // pitch classes, C = 0
const G7 = chordFromIntervals(7, [4, 7, 10], 'G7');
const band = new BackingBand();
const arrangement = band.load([C, [C, G7], G7, C], { style: 'blues-shuffle', tempo: 104, choruses: 3 });
band.onChord(({ segment, next }) => show(segment.chord.symbol, next?.chord.symbol));
await band.prepare();  band.start();                    // 1 bar count-in, fills, ending, then stops
band.setMuted('guitar', false);                         // rhythm guitar is muted by default
band.setVolume('drums', 0.6);  band.setTempo(90);  band.pause();  band.resume();  band.stop();
```

```ts
import { Transport, engineClock, pluck, PPQ } from '@/core/audio';
const tr = new Transport({ clock: engineClock, bpm: 96, timeSignature: '4/4' });
tr.addPart(notes /* [{ tick, midi, string, dur }] */, (time, n) =>
  pluck(n.midi, time, { string: n.string, duration: (n.dur * 60) / (tr.bpm * PPQ) }));
tr.schedule({ bar: 4 }, (time) => pluck(40, time));     // also scheduleRepeat(fn, everyTicks, from?, until?)
tr.setLoop({ bar: 0 }, { bar: 4 });  tr.countInBars = 1;  tr.setSwing(0.62);
tr.on('beat', (e) => {/* early, e.time = audio time: trigger sound here */});
tr.onVisual('beat', (e) => {/* when heard: move things on screen here */});
tr.start();   const p = tr.position();   // { bar, beat, tick, beatProgress, barProgress, countIn, bpm, ... }
```

```ts
// Node (fixtures, tests): no browser needed
import { renderPluck, renderStrum, renderSequence, encodeWav } from '@/core/audio';
const samples = renderPluck({ midi: 45, sampleRate: 44100, tone: 'steel', velocity: 0.8 });
fs.writeFileSync('a2.wav', encodeWav(samples, 44100));
renderSequence([{ time: 0, midi: 64, string: 1 }, { time: 0.5, midi: 67, string: 1 }], { sampleRate: 48000 });
```

## Context and mixer (`engine.ts`)

| export | notes |
|---|---|
| `unlockAudio(): Promise<boolean>` | resume inside a gesture; handles iOS (silent switch, interruptions) |
| `installAudioUnlock(target?): () => void` | global gesture listeners; call once in the app shell |
| `audioSupported()`, `audioRunning()`, `hasEngine()` | no side effects |
| `audioNow()`, `audioSoundingNow()` | scheduling clock; what is leaving the speakers now (latency compensated) |
| `scheduleVisual(time, fn)` | run `fn` when the sound scheduled at `time` is heard |
| `setMasterVolume(0..1)`, `getMasterVolume()`, `setMuted(b)`, `isMuted()` | master |
| `setBusVolume(bus, 0..1.5)`, `setBusMuted(bus, b)` | `BusName` = guitar, bass, drums, keys, click, tone, drone, ui |
| `getAnalyser(fftSize?)`, `getOutputLevel(): { rms, peak }` | tap after the limiter, for meters and visualisers |
| `getEngine(): AudioEngine`, `getAudioContext()` | `engine.hold()`, `.bus(name)`, `.output`, `.clock`, `.buffers.stats`, `.outputLatency` |
| `renderOffline({ seconds, sampleRate?, reverb? }, (engine) => …)` | real graph in an OfflineAudioContext → `{ samples, channels }` |
| `closeAudio()` | tests / teardown |

Master chain: buses → room reverb send → compressor → soft clipper (never above 0.98). The
compressor's 6 ms look-ahead is compensated, so a sound scheduled for `t` leaves the context at `t`.

## Guitar and bass (`guitar.ts`, `pluck.ts`, `tones.ts`)

- `pluck(midi, when?, opts?): VoiceHandle` · `strum(midis, when?, opts?): VoiceHandle[]` · `stopAll(when?, release?)`
  · `playBass(midi, when?, opts?)` · `getGuitar()`, `getBass()` (shared `GuitarSynth`s).
- `PlayOptions`: `velocity`, `tone`, `articulation` (`normal | palm-mute | dead | harmonic`), `string`,
  `duration` (seconds), `letRing`, `direction` (`down | up`), `brightness` (-1..1), `cents`, `a4`, `gain`.
- `PlayStrumOptions` adds `spread` (s, default 0.028), `strings`, `align` (`start | center | end`),
  `choke` (damp other strings, default true).
- `ToneName`: `steel | nylon | clean | driven | muted | harmonic` + `bass-finger | bass-pick | bass-upright`.
  `muted`/`harmonic` are articulations of the synth's `baseTone`.
- Voices are per string: a new note on a string replaces the one ringing there (4 ms fade); without
  `string`, a repeated pitch replaces itself. `VoiceHandle.stop(when?, release?)`.
- `new GuitarSynth({ engine?, bus?, tone?, mono?, maxVoices?, pan? })` — `.tone`, `.a4`, `.baseTone`,
  `.pluck`, `.strum`, `.stopString(n)`, `.stopAll`, `.preload(notes, opts?)` (async, avoids first-note hitches), `.dispose()`.
- Pure: `renderPluck(spec)`, `renderRawPluck(spec)` (dry, pre-bus), `renderStrum(midis, opts)`,
  `renderSequence(notes, opts)`, `strumPlan(midis, opts)`, `encodeWav(samples, sampleRate, { bitDepth?, channels? })`, `decodeWav(bytes)`.
- Tuning (measured in the unit tests, MIDI 28..88, 44.1 and 48 kHz): fundamental within 0.14 cent,
  autocorrelation pitch within 0.31 cent for all sustained tones. Notes are cached per pitch, string,
  dynamic layer and tone (LRU, 56 MB).

## Drums, clicks, tones, drone, UI sounds (`voices.ts`)

- `playDrum(name, when?, velocity?)`; `DrumName`: kick, snare, rimshot, sidestick, hihatClosed, hihatOpen,
  hihatPedal, ride, rideBell, crash, tomHigh, tomMid, tomLow, clap, shaker, cowbell, tambourine
  (`DRUM_NAMES`). `getDrums().preload()`, `.stopAll()`. Closed/pedal hat chokes the open hat.
- `playClick(set, level, when?, gain?)`; `ClickSet`: woodblock, beep, tick, hihat, rim, cowbell, clave
  (`CLICK_SETS`); `ClickLevel`: accent, medium, beat, sub.
- `playTone(midi | { freq }, when?, { voice?, duration?, velocity?, cents?, a4?, gain?, bus? }): ToneHandle`
  — `ToneVoice`: `sine | reference | epiano | organ`. No duration = sounds until `.stop(when?)`.
  `playChord(midis, when?, opts & { roll? })`.
- `startDrone({ root?, fifth?, octave?, a4?, volume?, fadeIn? }): DroneHandle` — `.setRoot`, `.setFifth`, `.setVolume`, `.stop(fade?)`.
- `playUi(name, { volume?, step?, when? })`; `UiSound`: correct, wrong, levelUp, gem, streak, heartLost,
  lessonComplete, achievement, tap, perfect, good, miss, countdown, go, combo (`step` raises its pitch).
- Pure: `renderDrum`, `renderClick`, `renderTone`, `renderDrone`, `renderUiSound`.

## Musical time (`timeline.ts`, `transport.ts`, `metronome.ts`)

- `resolveMeter('6/8' | { numerator, denominator, grouping? }): Meter` — `beats[]` (`tick`, `length`,
  `units`, `accent`), `barTicks`, `grouped`, `tempoBeatTicks`. Compound and odd /8 meters are felt in
  groups (6/8 = 2 beats, 7/8 = 2+2+3); odd /4 meters keep quarter beats with medium accents on groups.
- `new Timeline({ bpm | tempo: TempoPoint[], timeSignature | meters, swing })` (immutable; `.with(changes)`):
  `ticksToSeconds`, `secondsToTicks`, `bpmAt`, `positionOf(tick)`, `tickOf({ bar, beat?, tick? })`, `barStart(bar)`, `meterAt`.
  Tempo points may `ramp` linearly to the next one. Tempo is always quarter notes per minute.
- `new Transport({ clock, bpm?, timeSignature?, lookahead?, timer? })`:
  `start({ at?, from?, countIn? })`, `pause()`, `stop()`, `seek(to)`, `state`, `bpm`, `meter`;
  `setTempo(bpm, { rampBeats? })`, `setTempoMap(points)`, `setTempoScale(x)` (practice speed),
  `setTimeSignature`, `setMeters`, `setSwing(ratio, 'eighth' | 'sixteenth')`, `setLoop(a, b)`, `clearLoop()`,
  `setEnd(at | null)`, `countInBars`; `schedule`, `scheduleRepeat`, `addPart`, `addSource`, `clear(id)`, `clearAll()`;
  `on(type, fn)` / `onVisual(type, fn)` for `beat | bar | loop | start | stop | pause | seek | end | tempo`;
  `position(time?)`, `tickAt(time)`, `timeAt(tick)`, `scheduleVisual(time, fn)`, `dispose()`.
  Changes while running apply at the scheduling frontier (≤ look-ahead, 0.16 s); a change made inside
  a callback applies exactly at that tick. `timer: 'manual'` + `process()` / `advanceTo(t)` for tests and offline.
- `Metronome`: tempo 20..400 counted in the meter's tempo beat (dotted quarter in 6/8); `setTimeSignature`,
  `accents` / `setAccent(beat, 0..3)` / `cycleAccent`, `subdivision` (`none | eighth | triplet | sixteenth |
  swing | quintuplet | sextuplet`), `swingRatio`, `sound`, `volume`, `countInBars`, `speedTrainer`,
  `silentBars`, `tap()`, `start/stop/toggle`, `running`, `onBeat`, `onSchedule`, `pattern()`, `position()`.
  Pass `{ transport }` to click along with someone else's transport. Pure helpers: `clickPattern`,
  `subdivisionOffsets`, `speedTrainerBpm`, `isSilentBar`, `TapTempo`.

## Backing band (`backing.ts`, `backing-styles.ts`, `backing-band.ts`)

- Styles (`BACKING_STYLE_IDS`, details in `BACKING_STYLES[id]`: name, description, timeSignature, tempo range, feel):
  `pop-rock, ballad, ballad-68, blues-shuffle, slow-blues (12/8), funk, reggae, bossa, jazz-swing, country, folk, metal, latin, waltz`.
- `BackingBar` = chord | `null` (hold) | chord[] (bar split evenly by beats) | `{ beat, chord }[]`.
  Beats are the style's felt beats (2 in 6/8, 4 in 12/8, 3 in the waltz). Tempo is in those beats.
- `arrangeBacking(bars, { style, choruses?, ending?, endingChord?, seed?, fills? }): BackingArrangement`
  — pure: `.events` (drum/bass/keys/guitar with ticks), `.chords: ChordSegment[]`, `.lengthTicks`, `.bars`.
- `BackingBand`: `load(bars, { style, tempo?, choruses?, loop?, countInBars?, seed?, ending? })`, `prepare()`,
  `start/stop/pause/resume`, `playing`, `tempo`, `setTempo`, `setVolume(inst, v)`, `setMuted(inst, b)`,
  `onChord(fn)`, `currentChord()`, `arrangement`, `style`, `transport`, `dispose()`.
  `BackingInstrument`: drums, bass, keys, guitar. Its `transport` can carry your own parts as well.

## Measurement (`analysis.ts`)

`estimatePitch(x, sampleRate, { start?, length?, minHz?, maxHz? })` (autocorrelation, ≈0.1 cent),
`measureFundamental(x, sampleRate, approxHz, { start? })` (phase method, ≈0.001 cent), `centsFromMidi`,
`envelope`, `attackTime`, `decayTime`, `decaySlopeDb`, `spectralCentroid`, `harmonicAmplitudes`,
`findOnsets`, `hasBadSamples`; plus `fft`, `biquadCoeffs`, `biquadFilter`, `Rng` from `dsp.ts`.
