# `@/core/audio` — the audio engine

Everything is synthesised (no sample files). Pure DSP (rendering, timeline maths, arranging) runs in
Node; Web Audio is only touched when something is played. Unit tests: `npx vitest run src/core/audio`.
Browser checks (real Chromium, real Web Audio; all take `--quick`):

| script | what it proves |
|---|---|
| `node e2e/audio-smoke.cjs` | every voice and style makes sound and never clips; pitch; unlock from a locked context; idle suspend |
| `node e2e/audio-timing.cjs` | every event within 2 ms (in fact a sample) of its audio-clock time, no drift over 3 min; ramps, loop, seek, pause, count-in (`--long`: 3 min live) |
| `node e2e/audio-stress.cjs` | note-on storms, start/stop storms, garbage arguments, suspend/resume, 44.1 k and 48 k, cache budget, no node leak (`--soak`: 5 min of band) |
| `node e2e/audio-mix.cjs` | no clicks, no DC, the limiter, live graph = pure renderer, the band's mix level by level |
| `node e2e/audio-expression.cjs` | measured offline: bend / slide / vibrato pitch curves, hammer-on and pull-off onsets and levels, accents, a phrase ("5b7", "5h7") and a song with techniques, the scheduled drone; live: the metronome's first click after Start, the band changing style without stopping |

**Conventions.** Pitch = MIDI numbers (A4 = 69; fractions bend). Time = seconds on the audio clock
(`audioNow()`); every `when` argument is the moment the sound is *heard*, default "now". Musical time
= ticks, `PPQ` = 960 per quarter; bars and beats are **0-based** indices (`formatPosition` prints 1-based).
Velocity 0..1. Strings 1 = thinnest. Chords for strums are MIDI lists **low to high**.

**Starting audio.** Call `unlockAudio()` (or any play function) inside a click/tap/key handler. The app
shell should call `installAudioUnlock()` once: it resumes audio on the first gesture and after iOS
interruptions. The context suspends itself after ~6 s of silence and wakes on the next sound; keep it
awake with `getEngine().hold()` (returns a release function) if you analyse the microphone through it.

**Nothing here throws at a caller.** Play functions accept nonsense (NaN times, unknown tone names,
negative lengths) and substitute the default or stay silent. Where there is no Web Audio at all (jsdom,
a prerender) they do nothing and return handles that do nothing; a `Metronome` / `Transport` /
`BackingBand` still runs, silently, on the wall clock. Only `getEngine()` / `getAudioContext()` throw there.

**Before the first gesture** (`audioState() === 'locked'`) a requested sound is *queued*: its handle has
`queued: true`, `playUi()` returns false. If a tap follows within 0.4 s it plays; otherwise it is removed
while the context is still silent, so nothing ever bursts out late. (On a context that has run before,
or inside a gesture, the wait is 1.5 s: the output device may just be slow to start.)
`audioState()`: `unsupported | locked | suspended | running`; it never creates the context. Neither do
`setMasterVolume` / `setMuted` / `setBusVolume` / `setBusMuted`: called early, they are remembered.

**First notes.** The first render of a note costs 5–15 ms (several times that for the very first, before
the browser has compiled the string model). After unlock the engine warms up by rendering the six open
strings in idle time. For anything scheduled (a song, a band) call `getGuitar().preload(notes)` /
`band.prepare()` first; a strum always renders its notes before it looks at the clock, so its shape is
never smeared.

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
// Techniques: the guitar sounds like a guitar.
const t = audioNow() + 0.1;
pluck(60, t, { string: 3, duration: 0.8, bend: 2 });                     // "5b7": bend up a whole tone
pluck(60, t + 1, { string: 3, duration: 0.3 });                          // "5h7": fret 5 ...
pluck(62, t + 1.3, { string: 3, duration: 0.6, legato: 'hammer' });      // ... hammered to 7: no new pick
pluck(64, t + 2, { string: 2, bend: { amount: 2, release: true }, vibrato: true, duration: 1 });
strum([40, 47, 52, 56, 59, 64], t + 3, { accent: true });               // a harder, brighter stroke
playPhrase(tabPhrase('5b7r5', 3)!, t + 4);                               // tab tokens straight from a lesson
playLineOverChord([48, 52, 55, 60], tabPhrase('5h7p5', 2)!, t + 6);     // a line over a held C chord
startDrone({ root: 45, fifth: true, when: t, duration: 8 });            // a drone on the audio clock
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
| `unlockAudio(): Promise<boolean>` | resume inside a gesture; handles iOS (silent switch, interruptions); safe to call on every gesture |
| `installAudioUnlock(target?): () => void` | global gesture listeners; call once in the app shell |
| `audioState(): AudioState`, `audioSupported()`, `audioRunning()`, `hasEngine()` | no side effects, never create the context |
| `onAudioUnlocked(fn): () => void`, `onAudioClosed(fn): () => void` | hooks: first time the context runs / the shared engine is closed; each returns its unsubscribe (call it when a screen that registered goes away) |
| `audioNow()`, `audioSoundingNow()` | scheduling clock; what is leaving the speakers now (latency compensated) |
| `scheduleVisual(time, fn): () => void` | run `fn` when the sound scheduled at `time` is heard; the returned function cancels it (a no-op once it ran) |
| `setMasterVolume(0..1)`, `getMasterVolume()`, `setMuted(b)`, `isMuted()` | master; remembered if set before the engine exists |
| `setBusVolume(bus, 0..1.5)`, `setBusMuted(bus, b)` | `BusName` = guitar, bass, drums, keys, click, tone, drone, ui |
| `getAnalyser(fftSize?)`, `getOutputLevel(): { rms, peak }` | tap after the limiter, for meters and visualisers |
| `getEngine(): AudioEngine`, `getAudioContext()` | `engine.hold()`, `.bus(name)`, `.output`, `.clock`, `.buffers.stats`, `.outputLatency`, `.state`, `.audible`, `.pendingSounds`, `.startTime(when)`, `.ready` |
| `renderOffline({ seconds, sampleRate?, reverb? }, (engine) => …)` | real graph in an OfflineAudioContext → `{ samples, channels }` |
| `closeAudio()` | tests / teardown |

Master chain: buses → room reverb send → compressor → soft clipper (never above 0.98). The
compressor's 6 ms look-ahead is compensated, so a sound scheduled for `t` leaves the context at `t`
(measured: within one sample, live and offline, 44.1 and 48 kHz). Its start-up dip (a
DynamicsCompressorNode fades in over its first 0.2 s) is measured and undone, so the first note of a
session keeps its attack. Instrument chains are BiquadFilterNodes (an IIRFilterNode costs 25–60 ms to
create in Chromium); they match the pure renderer to −60 dB. A full strum + bass + drums at full
velocity peaks at 0.92 with 0.3 % of samples in the clipper's knee.

## The learner's default tone and click (`defaults.ts`)

`soundDefaults(): { guitarTone: ToneName, clickSound: ClickSet }` is what the shared guitar (`pluck`,
`strum`, `getGuitar()`, and so the song player) plays and what a new `Metronome` clicks with when a
screen does not choose. In the app it follows Settings > Sound (`soundPrefs()` from `@/core/settings`,
connected by itself when this module loads in a browser), live: a change in Settings is heard on the
next note or click. A screen's own choice still wins: a `tone` on the note, `getGuitar().tone = …`
(the shared guitar then keeps it), `metronome.sound = …`. `setSoundDefaultsSource(fn | null)` replaces
the source (tests, galleries); `connectSoundDefaults()` connects to Settings where that does not
happen by itself (unit tests: `await connectSoundDefaults()`). Unknown names fall back to
`BUILT_IN_SOUND_DEFAULTS` (steel, woodblock). Own `GuitarSynth`s and the backing band keep their own tones.

```ts
pluck(64);                                  // the learner's guitar tone
new Metronome({ tempo: 90 }).start();       // the learner's click
const m = new Metronome(); m.sound = 'rim'; // this screen's own click
```

## Guitar and bass (`guitar.ts`, `pluck.ts`, `tones.ts`)

- `pluck(midi, when?, opts?): VoiceHandle` · `strum(midis, when?, opts?): VoiceHandle[]` · `stopAll(when?, release?)`
  · `playBass(midi, when?, opts?)` · `getGuitar()`, `getBass()` (shared `GuitarSynth`s).
  `VoiceHandle`: `startTime`, `queued`, `stop(when?, release?)`.
- `PlayOptions`: `velocity`, `tone`, `articulation` (`normal | palm-mute | dead | harmonic | legato`), `string`,
  `duration` (seconds), `letRing`, `direction` (`down | up`), `brightness` (-1..1), `cents`, `a4`, `gain`, and the
  techniques (see "Expression" below): `bend` (semitones or `{ amount, release?, pre?, rise? }`), `vibrato`
  (`true` or `{ depth?, rate?, delay?, shape? }`), `slideIn` (`below | above`), `slideOut` (`down | up`),
  `legato` (`hammer | pull | slide`: reached from the note ringing on the same string), `accent`.
- `PlayStrumOptions` adds `spread` (s, default 0.028), `strings`, `align` (`start | center | end`),
  `choke` (damp other strings, default true), `accent` (every string harder). A strum's strength is its `velocity`.
- `ToneName` (`TONE_NAMES`): `steel | nylon | clean | driven | muted | harmonic` + `bass-finger | bass-pick | bass-upright`.
  `muted`/`harmonic` are articulations of the synth's `baseTone`. `normalizeTone(id, fallback?)` maps
  stored settings and aliases (`acoustic` → steel, `classical` → nylon, `electric` → clean,
  `distortion` → driven ...); unknown names fall back instead of failing, here and in `pluck`.
- Voices are per string: a new note on a string replaces the one ringing there (4 ms fade, no click);
  without `string`, a repeated pitch replaces itself. `stop`/`stopAll` fade what is sounding and
  *remove* what has not started yet, so nothing new is heard after a stop.
- `new GuitarSynth({ engine?, bus?, tone?, mono?, maxVoices?, pan? })` — `.tone`, `.a4`, `.baseTone`,
  `.pluck`, `.strum`, `.stopString(n)`, `.stopAll`, `.activeVoices`, `.preload(notes, opts?)` (async,
  avoids first-note hitches), `.renderNow(notes)` (the same, synchronously: render, then read the clock),
  `.strumNotes(midis, strumOpts)` (the notes a strum renders, for those two). A note is rendered per velocity
  layer, articulation and brightness, so give `preload` each `PreloadNote` (`{ midi, string?, velocity?, tone?,
  articulation?, brightness?, accent?, legato? }`) as it will be played: an up-stroke or accented strum of a chord
  preloaded only plainly renders its six strings (50–70 ms) while the music plays. The song player does this.
  `.dispose()` (takes its chains off the mixer; usable again afterwards).

## Expression: bends, slides, vibrato, hammer-ons, accents (`expression.ts`, `guitar.ts`, `phrase.ts`)

Each note is a rendered buffer; its pitch moves by automating the buffer's playback rate on the audio
clock (the body and amp filters come after, so the timbre stays put while the pitch moves).
- **Bend** `bend: 2` (or `{ amount, release?, pre?, rise? }`): struck at the fretted pitch, it eases up to
  the target over about a third of the note (0.06–0.22 s), holds; `release` eases back down before the note
  ends; `pre` is struck bent. Measured offline: within 3 cents of the target, back within 3 cents.
- **Vibrato** `vibrato: true`: 30 cents wide at 5.5 Hz, sharp-only like a pushed steel string
  (`shape: 'both'` for classical), starting once the note (or its bend) has arrived.
- **Slides** `slideIn: 'below' | 'above'` (from 3 semitones away, arriving within 0.12 s), `slideOut: 'down' |
  'up'` (falls 7 semitones over the end of the note while it fades). `legato: 'slide'` glides the string
  ringing on that `string` to the new fret, arriving on the beat (glide 0.03–0.12 s).
- **Hammer-on / pull-off** `legato: 'hammer' | 'pull'`: no new pick stroke. The voice ringing on the same
  `string` (or, without a string, the last note played) carries on: its pitch steps on the render quantum
  nearest the beat (within 1.5 ms), it blends out over ~0.15 s under a soft, pick-less finger note (gain ×0.55,
  ×0.62 for a pull-off). Measured: 4–5 dB under picking the same note at the same velocity, the pick click's highs
  12 dB down. So pass a hammer-on the velocity a picked note would have: the voice softens it (the song player does).
  Nothing ringing (first note, after a rest, a dead or muted note) → a soft `legato` note of its own (gain ×0.62);
  a slide with nothing to slide from slides into a fresh note (from below, or from `slideIn: 'above'`).
  The returned handle stops the string.
- **Accent** `accent: true` on `pluck` or `strum`: velocity ×1.3 and half a step brighter (≈ 3 dB).
- **Let ring** `letRing: true`: ignore `duration`, ring until the string is played again.
- Pure helpers: `pitchCurve(expr, seconds): PitchCurve | null` (`.at(t)` cents, `.initial`, `.start`, `.end`,
  `.fadeFrom`), `bendOf`, `vibratoOf`, `slideGlide(from, to, x)`, `slideGlideSeconds(gap)`, `smoothstep`,
  `SLIDE_IN_SEMITONES`, `SLIDE_OUT_SEMITONES`, `VIBRATO_DEFAULTS`.
- **Tab tokens** `parseTabTechnique('5h7p5')` → `[{ fret: 5 }, { fret: 7, legato: 'hammer' }, { fret: 5, legato: 'pull' }]`;
  understands `h p s / \ b b7 b7r5 pb9 ~` and `/5` `\5` `5\` `5/`; null for anything else.
- **Phrases** `tabPhrase(token, string, { tuning?, capo?, noteSeconds? = 0.45 }): PhraseNote[] | null` turns one
  string's token into notes (`tabPhrase('5b7', 3)` = fret 5 on the G string bent a whole tone; a slide down such as
  `7\5` carries `slideIn: 'above'`, used only if the string cannot be carried on);
  `playPhrase(notes, when?, { synth?, tone?, velocity? }): PhraseHandle` plays `{ midi, at, ...PlayOptions }[]`
  (renders first, then schedules) — `.startTime`, `.endTime`, `.queued`, `.stop(when?)`.
  `playLineOverChord(chordMidis, line, when?, { chordVoice? = 'guitar' | 'epiano' | 'organ', hold?, chordLevel? = 0.6,
  tone?, lineDelay?, engine? })`: the chord is held (on its own guitar, a little left, or on the keys) while the
  line plays over it; one handle stops both. Both are rendered before the clock is read, so asked for "now" the
  chord and the line still start together. For a line over a drone, use `startDrone({ when, duration })`.
- Pure: `renderPluck(spec)`, `renderRawPluck(spec)` (dry, pre-bus), `renderStrum(midis, opts)`,
  `renderSequence(notes, opts)`, `strumPlan(midis, opts)`, `encodeWav(samples, sampleRate, { bitDepth?, channels? })`, `decodeWav(bytes)`.
- Tuning (measured by estimators written independently of the synth, MIDI 28..88, three velocities,
  44.1 and 48 kHz, `quality.test.ts`): fundamental within 0.14 cent and drift under 0.14 cent over the
  note for steel, nylon, clean, harmonic and the basses; the driven tone's period within 0.13 cent
  (its fundamental *bin* wanders a few cents while the note settles, as any distorted signal's does);
  palm mutes within 1.5 cents. Attack: within 3 dB of the peak at once, within 1 dB in under 20 ms.
  Notes are cached per pitch, string, dynamic layer and tone (LRU, 56 MB, 28 MB on low-memory devices).

## Drums, clicks, tones, drone, UI sounds (`voices.ts`)

- `playDrum(name, when?, velocity?): boolean` (false = not a drum); `DrumName`: kick, snare, rimshot,
  sidestick, hihatClosed, hihatOpen, hihatPedal, ride, rideBell, crash, tomHigh, tomMid, tomLow, clap,
  shaker, cowbell, tambourine (`DRUM_NAMES`, `isDrumName`). `getDrums().preload()`, `.stopAll()`,
  `.activeHits`, `.dispose()`. Closed/pedal hat chokes the open hat.
- `playClick(set, level, when?, gain?): () => void` — the returned function takes the click back
  (silently if it has not sounded yet). `ClickSet`: woodblock, beep, tick, hihat, rim, cowbell, clave
  (`CLICK_SETS`; `normalizeClickSet('wood')` → woodblock); `ClickLevel`: accent, medium, beat, sub.
- `playTone(midi | { freq }, when?, { voice?, duration?, velocity?, cents?, a4?, gain?, bus? }): ToneHandle`
  — `ToneVoice`: `sine | reference | epiano | organ`. No duration = sounds until `.stop(when?)`.
  `ToneHandle`: `startTime`, `freq`, `queued`, `stop`. `playChord(midis, when?, opts & { roll? })`.
- `startDrone({ root?, fifth?, octave?, a4?, volume?, fadeIn?, when?, duration?, fadeOut? }): DroneHandle` —
  `.setRoot(midi, when?)`, `.setFifth`, `.setVolume`, `.stop(fade?, when?)`, `.running`, `.startTime`.
  `when` / `duration` place it on the audio clock (under a lesson sound or an ear drill); `setRoot(midi, when)`
  changes root exactly then (a drone following the chords; it still ends at its `duration`). Without `when`,
  `setRoot` may be called from a slider: changes are spaced out and the last one wins.
- `playUi(name, { volume?, step?, when? }): boolean` (true = audio is running, it will be heard);
  `UiSound`: correct, wrong, levelUp, gem, streak, heartLost, lessonComplete, achievement, tap, perfect,
  good, miss, countdown, go, combo (`step` raises its pitch).
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
  `position(time?)`, `tickAt(time)`, `timeAt(tick)`, `now()`, `scheduleVisual(time, fn): cancel`, `dispose()`;
  `nextBarLine()` (first bar line not yet scheduled) and `jumpAt(at, to, then?)` / `cancelJump()`: at tick `at`
  carry on from `to` at that very moment, like a loop wrap (`then(time)` runs there: swap parts, meter, tempo).
  Started again right after a stop (a reload), visual listeners never hear the old `stop` after the new `start`.
  Changes while running apply at the scheduling frontier (≤ look-ahead, 0.16 s); a change made inside
  a callback applies exactly at that tick. `timer: 'manual'` + `process()` / `advanceTo(t)` for tests and offline.
  - `setTempo(bpm, { rampBeats })` glides, arrives and *stays*: going back before the glide (loop,
    seek, stop/start) does not bring the old tempo back. A song's own ramps go in `setTempoMap`.
  - `setLoop(a, b)` while the playhead is already past `b` goes to `a` at once, on the grid.
  - The transport cannot take back what it has already handed out (up to the look-ahead). On
    `pause` / `seek` / `stop` whoever made the sound cancels it: `BackingBand` and `Metronome` do
    (`guitar.stopAll()`, the function `playClick` returns). Do the same in your own parts.
  - Main-thread stalls up to ~130 ms are inaudible; beyond 250 ms musical time slips instead of
    firing a burst. NaN / Infinity arguments are ignored.
- `Metronome`: tempo 20..400 counted in the meter's tempo beat (dotted quarter in 6/8); `setTimeSignature`,
  `accents` / `setAccent(beat, 0..3)` / `cycleAccent`, `subdivision` (`none | eighth | triplet | sixteenth |
  swing | quintuplet | sextuplet`), `swingRatio`, `sound` (the learner's default click until set), `volume`, `countInBars`, `speedTrainer`,
  `silentBars`, `tap()`, `start/stop/toggle`, `running`, `onBeat`, `onSchedule`, `pattern()`, `position()`.
  Start is immediate: the first click (or count-in click) comes `METRONOME_START_DELAY` = 20 ms after `start()`
  (a song or band waits 80 ms to render its first notes; clicks are rendered before Start).
  Pass `{ transport }` to click along with someone else's transport. Stopping takes back clicks not yet
  heard; a new subdivision starts on the next beat; a new time signature restarts on a downbeat with
  no doubled click. A custom `output.click(...)` may return a take-back function. Pure helpers:
  `clickPattern`, `subdivisionOffsets`, `speedTrainerBpm`, `isSilentBar`, `TapTempo`.

## Backing band (`backing.ts`, `backing-styles.ts`, `backing-band.ts`)

- Styles (`BACKING_STYLE_IDS`, details in `BACKING_STYLES[id]`: name, description, timeSignature, tempo range, feel):
  `pop-rock, ballad, ballad-68, blues-shuffle, slow-blues (12/8), funk, reggae, bossa, jazz-swing, country, folk, metal, latin, waltz,
  rumba` (flamenco rumba: palmas and cajón, chop on 2 and 4, no keys), `gospel` (shuffle, organ, claps on 2 and 4), `ska`
  (off-beat skank on guitar and organ), `classical` (fingerpicked arpeggios, no drums), `tango` (marcato, then the
  3-3-2 síncopa, no drums). `percussion: false` marks a band without a drummer (no grooves, fills, cymbals or ending
  hit; the count-in still clicks); guitar pattern digits `1`–`6` fingerpick one string of the shape.
- `BackingBar` = chord | `null` (hold) | chord[] (bar split evenly by beats) | `{ beat, chord }[]`.
  Beats are the style's felt beats (2 in 6/8, 4 in 12/8, 3 in the waltz). Tempo is in those beats.
- What the styles guarantee (tested on the generated events): swing and shuffle are a 2:1 triplet
  grid; reggae never has a kick on beat one; bossa plays the 3-2 rim clave and anticipates the next
  root; the walking bass puts a root on every chord arrival, a chord tone on beats 1 and 3, and
  approaches the next root by a half or whole step, without repeated notes or leaps over a sixth;
  fills come at section ends and are answered by a crash; comping voicings keep third and seventh,
  never contain a semitone cluster and leave the root to the bass when it would rub (maj7, b9, 5+ notes).
- Levels per style (`drumLevel`, `bassLevel`, `keysLevel`, `guitarLevel`) are set from measurement:
  drums, bass, keys and rhythm guitar sit within a few dB of each other in every style and the styles
  differ by under 4 dB in loudness (`e2e/audio-mix.cjs` prints the table).
- `arrangeBacking(bars, { style, choruses?, ending?, endingChord?, seed?, fills? }): BackingArrangement`
  — pure: `.events` (drum/bass/keys/guitar with ticks), `.chords: ChordSegment[]`, `.lengthTicks`, `.bars`.
- `BackingBand`: `load(bars, { style, tempo?, choruses?, loop?, countInBars?, seed?, ending? })` (stops and resets),
  `change(bars, opts)` (live: the band finishes its bar and the new progression / style / tempo takes over on the
  next bar line, at the same bar of the form, no stop, no count-in; during the count-in at once; stopped or paused =
  `load`; a `pause()` before that bar line keeps the change for `resume()`, `start()` plays it from the top,
  `setTempo` meanwhile carries over, `load` drops it), `prepare()`,
  `start/stop/pause/resume`, `playing`, `tempo`, `setTempo`, `setVolume(inst, v)`, `setMuted(inst, b)`,
  `onChord(fn)`, `currentChord()`, `arrangement`, `style`, `transport`, `dispose()` (always call it when
  the screen unmounts: it frees the band's own guitar chain).
  `BackingInstrument`: drums, bass, keys, guitar. Its `transport` can carry your own parts as well.

## Measurement (`analysis.ts`)

`estimatePitch(x, sampleRate, { start?, length?, minHz?, maxHz? })` (autocorrelation, ≈0.1 cent),
`measureFundamental(x, sampleRate, approxHz, { start? })` (phase method, ≈0.001 cent), `centsFromMidi`,
`envelope`, `attackTime`, `decayTime`, `decaySlopeDb`, `spectralCentroid`, `harmonicAmplitudes`,
`findOnsets`, `hasBadSamples`; plus `fft`, `biquadCoeffs`, `biquadFilter`, `Rng`, `finiteOr` from `dsp.ts`.
`web-audio-mock.ts` (not in the barrel) is a strict Web Audio stand-in for unit tests of code that plays sound.
