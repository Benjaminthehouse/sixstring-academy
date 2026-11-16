# `@/core/song` — songs: model, SixTab, import/export, arranger, player, practice

Pure TypeScript (Node and browser) except `SongPlayer`/`liveOutput`, which play through `@/core/audio`. Import from the
barrel only. alphaTab, @tonejs/midi and jszip load on demand inside the importers. Tests: `npx vitest run src/core/song`.

**Conventions.** 960 ticks per quarter (`PPQ`); a beat's `start` is relative to its bar. Pitch = sounding MIDI.
Strings 1 = thinnest; tunings low to high; frets count from the capo (`midi = tuning[i] + capo + fret`). Bars are 0-based
in data. Tempo is always quarter notes per minute (6/8 at ♩. = 60 is `tempo: 90`). **Chord symbols name what sounds**:
with capo 2 a G shape is stored as `A` (`capoShape('A', 2)` → `'G'` for display); chord-sheet and GP importers convert.

## Model — `types.ts`
```ts
Song { meta: { id, title, composer?, artist?, arranger?, source?, licence?, difficulty? 1–10, tags? }, tuning: number[], capo,
       key?, tempo: TempoChange[] {bar, tick?, bpm, ramp?}, bars: BarInfo[], sections: Section[] {name, start, end, strum?},
       tracks: Track[], chords: ChordEvent[] {bar, tick, symbol, voicing?}, annotations: {bar, tick, text}[] }
BarInfo { time: {numerator, denominator}, length? (pickup), repeatStart?, repeatEnd? (times played), ending?: number[], key? }
Track { id, name, role: 'lead'|'rhythm'|'bass', tuning?, capo?, measures: { beats: Beat[] }[] }    // one measure per bar
Beat { start, duration, value?: {base 1..64, dots?, tuplet?: {actual, normal}}, notes: Note[], slash?, mutedStrum?,
       stroke?: 'down'|'up', lyric? ('A-' continues the word), text? }                              // no notes = rest
Note { string, fret, midi, tie?, legato?: 'hammer'|'pull', slide?: 'up'|'down', slideIn?: 'below'|'above', slideOut?,
       bend?: {amount (semitones, 2 = full), release?, pre?}, vibrato?, palmMute?, dead?, ghost?, harmonic?: 'natural'|'artificial',
       letRing?, staccato?, accent?, tap?, finger?: 0–4|'T', pluck?: 'p'|'i'|'m'|'a'|'c', length? (held longer than its beat) }
```
Connecting techniques (tie, hammer-on, pull-off, slide) sit on the note that is **reached**. `ImportResult { song, warnings:
{message, confidence?, bar?, line?}[], confidence 0–1, estimatedRhythm? }`; `SongIssue { level, code, message, track?, bar?, beat? }`.

## SixTab — the authoring format (`sixTab`, `parseSixTab`, `toSixTab`)
```ts
sixTab(text) / sixTab`...`: Song                  // throws SixTabSyntaxError (.errors: {line, column, message, expected?, found?}[])
parseSixTab(text): { song | null, errors, warnings } // never throws; collects every error
toSixTab(song, { barsPerLine? = 4 }): string        // parse(toSixTab(s)) == s for SixTab songs; sixTabLosses(s) lists what is approximated
```
A file is lines: **header fields** (before the music), **`[Section]`** headers, **directives** (`name: value`), **music lines**
(start and end with a bar line, hold whole bars), `lyrics:` lines, comments (`#` line, `// …` anywhere).

| Header | Meaning |
|---|---|
| `title:` (required) `id:` `composer:` `artist:` `arranger:` `source:` `licence:` `difficulty: 1–10` `tags: a, b` | metadata (id defaults to the title's slug) |
| `tempo: 90` `time: 3/4` `key: G` / `Em` / `F# minor` | tempo (quarters/min), meter, key |
| `tuning: standard` / `drop-d` / `dadgad` / `bass` / `D A D G B E` / `C2 G2 C3 G3 C4 E4` / `40 45 50 55 59 64` · `capo: 0–12` · `pickup: q` | tuning low→high, capo, first bar shortened |

| In the body | Meaning |
|---|---|
| `[Verse 1]` | a section starts at the next bar (later tracks may repeat it; it must match) |
| `tempo: 104` · `time: 6/8` · `key: D` | change from the next bar (later tracks follow the first track's changes) |
| `strum: D-DU-UDU` | strum pattern of the current section (one character per equal step of the bar: D U X, `-` or `.` skip; a pattern that does not divide the bar falls back to one down-strum per beat) |
| `track: Bass` · `role: bass` · `tuning: bass` · `capo: 0` | start another track (all tracks cover every bar); role/tuning/capo before its music |
| `lyrics: A- maz- ing grace` | one syllable per struck note or slash of the music line **just above**; `_` skips a note; `A-maz-ing` = `A- maz- ing` |

**Music tokens** (separated by spaces):

| Token | Meaning |
|---|---|
| `w h q e s` · `/32 /64` (also `/1 … /16`) · dots `q. e..` · tuplet digit 2–13 `e3 s6 q5` (n in the time of the next lower power of two) | duration for the following beats until changed (required before the first note of each track) |
| `3:5` | string 3, fret 5 · `3:x` dead · `3:(5)` ghost · `3:<12>` natural harmonic · `3:-` tie (same fret as the note ringing on string 3) |
| `(5:3 4:2 2:1)` | notes struck together |
| `r` · `/` `D` `U` `X` | rest · rhythm slash (strum the chord in force; `D`/`U` with direction, `X` muted) |
| suffixes `3:7h` `p` `s` `t` `~` `>` `b` `b1` `b0.5` `r` `/` `\` | hammer-on / pull-off / slide **into this note** from the previous one on the string, tap, vibrato, accent, bend (semitones, `b` = 2), release, slide out up/down |
| prefixes `/3:7` `\3:7` | slide in from below / above |
| `{pm lr st ac vib x gh nh ah tap pre dn up 0–4 T P I M A C}` right after a note or `(…)` | palm mute, let ring, staccato, accent, vibrato, dead, ghost, harmonics, tap, pre-bend, pick/strum direction, left-hand finger, right-hand finger (capitals) |
| `"Am"` · `"G=320003"` · `"Bb=x-1-3-3-3-1"` | chord symbol at the next beat (optional shape, low string first) |
| `^"let ring"` | annotation at the next beat |
| `\|` `\|\|` `\|:` `:\|` `:\|x3` `:\|:` · `[1]` `[2]` `[1,2]` · `%` | bar lines and repeats (`\|:` at a line's end opens the next line's first bar) · ending right after the bar line (carries until `:\|` or `\|\|`) · repeat the previous bar (alone in its bar) |

Every bar must add up exactly ("Bar 3 adds up to 2880 ticks but 4/4 needs 3840: a quarter is missing."), pitches come from
string + fret + tuning + capo, a tie/hammer/slide needs a note on that string before it (a rest ends it), `h` must go up and
`p` down (`s` slides either way). Comments: a `#` line, or `// …` to the end of any line (not inside quotes). Errors carry a
1-based line and column inside the text; the parser never throws (fuzzed: random songs round-trip exactly, mutated text
gives positioned errors or a valid song). Content tests: `expect(parseSixTab(text).errors).toEqual([])` then `assertValidSong(song)`.

```text
title: Amazing Grace
composer: Traditional (melody "New Britain"); words by John Newton
source: Words 1779, melody first printed 1829; simplified melody
licence: Public domain
difficulty: 2
tags: melody, lyrics, waltz time, beginner
tempo: 80
time: 3/4
key: G
pickup: q

[Verse]
| q 4:0 | "G" h 3:0 q 2:0 | h 2:0 q 3:2 | "C" h 3:0 q 4:2 | "G" h 4:0 q 4:0 |
lyrics: A- maz- ing grace how sweet the sound that
| "G" h 3:0 q 2:0 | h 2:0 q 3:2 | "D" h. 2:3 ||
lyrics: saved a wretch like me
```
```text
title: Campfire Groove
composer: Sixstring Academy
licence: Original exercise for Sixstring Academy
tempo: 96
time: 4/4
key: G

track: Rhythm
role: rhythm
[Verse]
strum: D-DU-UDU
|: "G=320003" e D r D U r U D U | "Em" % | [1] "C" D r D U r U D U | "D" D r D U r U D U :|
| [2] "C" D r D U r U D U | "D" h D D ||
[Chorus]
tempo: 104
| "C" q D D D D | "G" D D D D | "D" D D D D | "G" w D ||

track: Bass
role: bass
tuning: bass
[Verse]
|: q 4:3 r 4:3 r | 4:0 r 4:0 r | [1] 3:3 r 3:3 r | 2:0 r 2:0 r :|
| [2] 3:3 r 3:3 r | h 2:0 2:0 ||
[Chorus]
| q 3:3 3:3 3:3 3:3 | 4:3 4:3 4:3 4:3 | 2:0 2:0 2:0 2:0 | w 4:3 ||
```
Techniques in one line: `| e 3:5 3:7h 3:5p 3:7 s 3:9s 3:7s 3:5{1} 3:7{3} q 3:7b2r | e 2:8b1 2:5 q 2:5~ (3:7 2:5){pm dn} e3 4:7 4:5p 4:7h |`.
`SONG_EXAMPLES` holds these plus `ODE_TO_JOY` and `TECHNIQUE_SAMPLER` (every technique), all public domain or original.

## Model utilities
```ts
createSong({ meta?, tuning?, capo?, key?, bpm?, time?, bars?, tracks? }) cloneSong  findTrack(song, id|name|index)  midiOf(string, fret, tuning, capo)
soundingPitch(note) (as struck: harmonics up, pre-bends bent, dead → null)  barLength(info)  valueTicks(v)  valueFromTicks(t)  splitTicks(t)  restBeats(a, b)
validateSong(song): SongIssue[]  isValidSong  assertValidSong (throws, lists errors)  describeTicks(480): 'an eighth'
flattenSong(song, { unroll? = true, tracks? }): SongTimeline   playbackOrder(bars)   songDuration(song)   // ramps restart on each repeat pass
//  .bars {index, bar, pass, start, length, time, startSec, endSec}  .beats / .trackBeats(id) {track, index, bar, beat, tick, duration, sec, durSec, notes, source}
//  .chords {tick, endTick, sec, symbol, voicing?}  .sections  .tempo: TempoMap  .totalTicks  .totalSeconds
//  .secondsAt(tick) .tickAt(sec) .barAt(tick) .barAtTime(sec) .beatAt(track, tick) .beatAtTime(track, sec) .chordAt .sectionAt .firstIndexOf(bar) .locate(tick)
transposeSong(song, semis, { mode?: 'shift'|'arrange' }) → { song, warnings }       transposeKey('E minor', 1): 'Fm'
retuneSong(song, { tuning?, capo?, keep?: 'pitch' (re-finger) | 'shapes' (music moves) }) → { song, warnings }
extractBars(song, from, to, { title?, repeat? }) / extractSection(song, 'Chorus')     // a looping exercise: chord/tempo/key carried in, outside ties struck
withTempoPercent(song, 70)  practiceVariants(song, [50, 70, 85, 100])
strumBeats(time, 'D-DU-UDU'): Beat[]   withStrumTrack(song, { pattern?, name? })   // a rhythm track from each section's strum pattern
songStats(song): { bars, playedBars, seconds, chords, chordChangesPerBar, tracks: TrackStats[] }   // range, frets, strings, positions, shifts, maxSpan, techniques, notesPerSecond, fastestGap, syncopation
estimateDifficulty(song, { track?, tempoPercent? }): { level 1–10, band: 'beginner'|'intermediate'|'expert', score, factors {speed, fastest, stretch, position, techniques, rhythm, chords}, reasons }
```

## Import, export, arranger
```ts
importSong(file | Blob | bytes | text, { name?, format?, asciiTab?, chordSheet?, musicXml?, midi?, guitarPro? }) → Promise<ImportResult & { format }>
detectFormat(input, name?) / detectTextFormat(text): 'sixtab'|'ascii-tab'|'chordpro'|'chord-sheet'|'musicxml'|'mxl'|'midi'|'guitar-pro'|'json'|'unknown'
importAsciiTab(text, { title?, time?, tempo?, tuning?, capo? })
importChordPro(text, opts) / importChordSheet(text, opts)        // rhythm track of slashes, chords, lyrics, sections, capo, key (detected if absent), | bars |, x2; bars estimated
nashvilleChord('5/7', 'G'): 'D/F#'                               // Nashville numbers ("Key: G" + "1 4 5 6m" lines) are read by importChordSheet
importMusicXml(text, { part?, arrange? }) / await importMxl(bytes) // voices merged, TAB string/fret, techniques, harmony, lyrics, repeats; parts without tab arranged
await importMidi(bytes, { track?, tracks?: number[] | 'all', grid?, melodyOnly?, arrange? })  listMidiTracks(bytes)   await importGuitarPro(bytes, { tracks? })
toSixTab(song)  toAsciiTab(song, { track?, width?, header?, rhythm? = true })  toMusicXml(song)  songToJson(song) / songFromJson(text) (validates)
arrangeTrack(song, track, { tuning?, capo?, maxFret? = 17, preferPosition?, weights?, keepStrings?, octaves? = true, fingers? }) → { track, octaveShift, cost, warnings }
arrangeSong(song, opts)  arrangeLine([48, 50, 52]) → [{string, fret, midi}]  spellTrack(song, track?) → per beat { name: 'F#3', written: 'F#4' }
buildMeasures(onsets, bars, { tuning, capo })  chooseGrid(ticks)  quantize(tick, grid)   // for sheet recognition building songs from notes
```
**ASCII tab** in the usual web styles: `e|`, `E-|` (high E in capitals), `e |`, `1|` or no labels; `|` or `:` bar lines (a `:` beside
`|`, or `*` on two strings, is a repeat sign); typographic dashes and box lines; tabs, CRLF, non-breaking spaces; systems with or without
blank lines between them (repeating string names split them); separator lines of dashes and comments after a line ("`|  <- let ring`",
kept as an annotation) are ignored; 1–2 digit frets (`12` over `9` is a chord when left- or right-aligned), `h p / \ s b b(9) ^ r ~ x
(n) <n> [n] t`, PM / let ring lines, chord names above, lyrics right below, `x3` / `Repeat 2x` / `play twice`, `[Verse]` / `Chorus:`
headers as sections. Tuning: a tuning line (`Tuning: Drop D (D A D G B E)`, `DADGAD`, `Tuned down 1/2 step`, `Eb standard`) wins over
the string names, which win over the standard tuning for 4–8 strings (4 = bass). Capo `Capo 3`, `capo on the 3rd fret`, `Capo: II`.
A **rhythm row** of letters above the staff (`q  e e h`, dots, `e3`; a letter over an empty column is a rest) gives exact rhythm;
otherwise rhythm is estimated per bar: the bar read to scale, or by the gaps between notes (equal gaps → equal lengths, the last
note takes the padding), plain values preferred; `estimatedRhythm` says which. `toAsciiTab` writes the rhythm row and spaces notes to
scale, so `importAsciiTab(toAsciiTab(s))` gives back pitches, strings and rhythm.

**Chord sheets**: chord lines may hold bar lines and beat marks (`| G . . . | C . D . |`, `|G / / /|`), `(x2)`, `N.C.`; tabs keep
chords over their words; `(Repeat Chorus)`, `Repeat the chorus x2` or a bare `Chorus` after it was written out play it again;
`Chorus x2` with lines under it plays them twice. With a capo, chords are stored as they sound and a `Key:` line is moved too when
the sounding chords fit it better.
**MusicXML**: implicit (short) measures anywhere, an overfull measure is read in a meter that holds it (warning), every part is
laid on the first part's measures (a pickup written as a full-measure rest in another part stays aligned), drum parts are left out.
**MIDI**: each beat takes the grid that fits it (straight sixteenths and triplets can share a bar); tempo and meter changes kept;
`tracks` imports several parts (bass programs get bass tuning; drums are never imported).

The arranger is dynamic programming over (shape, hand position) with the guitar engine's hand weights; chords must pass
`simultaneousCost`; hammer-ons, slides and ties keep their string; a note still ringing (`length`, or tied) keeps its string and fret
and must be holdable with what is played over it, else it is let go early (shortened, with a warning); shifts are cheaper after a rest
or a long note; out-of-range parts move by octaves (with a warning); a pitch the neck cannot reach is left out (with a warning;
`arrangeLine` returns `{ string: 0, fret: -1, midi }` for it). Notes of a beat come out low string first.

## Playback — `SongPlayer`
```ts
const player = new SongPlayer(song, { metronome?, countInBars? = 1, output? = liveOutput({ tone?, bassTone?, clickSet?, engine? }) });
await player.prepare();                 // after the first gesture: renders the notes ahead
player.play(); player.pause(); player.toggle(); player.stop(); player.seek(tick); player.seekBar(4);
player.tempoPercent = 70;               // 25–150, pitch unchanged
player.setLoop(4, 7, { ramp: { start: 60, step: 10, target: 100, every: 1 } }); player.clearLoop();   // the shortest stretch as played
player.setTrackMuted('bass', true); player.setTrackSolo('lead', true); player.metronome = true;
const off = player.subscribe((e) => {   // 'beat' {beat, time} | 'bar' | 'countin' | 'state' | 'loop' {count, tempoPercent} | 'tempo' | 'range-end' | 'end'
  if (e.type === 'beat') highlight(e.beat);          // delivered when the sound is heard
});
requestAnimationFrame(() => cursorAt(player.position()));   // { state, tick, sec, index, bar, pass, beat, barProgress, countIn }
player.beatNow('lead'); player.playRange(fromTick, toTick); player.songTimeAt(noteOn.time); player.dispose();
player.firstBeatTime;                   // audio time the first beat of this run is heard (after the count-in; a seek moves it); null before play
player.audioTimeAt(tick);               // audio time a song tick still ahead will be heard; null when not playing
```
Notes use the guitar synth (bass tracks the bass synth), slashes strum the chord's voicing (`chord.voicing` or the engine's
first), ties sound once. Techniques are played by the guitar voice for real (`@/core/audio` "Expression"): a bend glides to its
target (`3:5b2`, and back with `r`; `{pre}` is struck bent), `h`/`p` carry the ringing string on without a new pick stroke,
`s` glides between frets, `~` vibrato, `/3:7` `\3:7` slide in, `3:7\` `3:7/` slide out, `{lr}` let ring. Strokes have
per-stroke strength: a down-strum on the beat 0.8, between beats 0.72, an up-strum 0.62; `beat.accent` (the whole beat) and
`note.accent` play it ×1.25–1.3 harder and brighter. `buildPlayEvents(timeline)` is the pure schedule (`PlayNote` carries
`legato`, `bend`, `vibrato`, `slideIn`, `slideOut`, `accent`; `PlayStrum` `accent`, `letRing`). `liveOutput({ engine })`
plays into a given (offline) engine with the player's own synths.

## Practice — `WaitMode`, `FlowMode` (pure; feed pitch events)
```ts
const targets = practiceTargets(player.timeline, 'lead');            // struck, pitched beats: {tick, sec, bar, midis, pcs, chord, positions, symbol?}
// a rhythm track's slashes are chord targets: the chord in force (pcs), its voicing as midis/positions, `symbol`
const wait = new WaitMode(targets, { toleranceCents? = 50, octaveLenient?, chordWindow? = 1.5, retrigger? = 0.15, holdWindow? = 2 });
tracker.on('noteon', (e) => { const r = wait.hear(e); if (r.kind === 'match' && r.next) player.playRange(r.target!.tick, r.next.tick); });
tracker.on('chroma', (e) => wait.hearChroma(e));   // chords; also matched from note-ons by pitch-class set
wait.current  wait.skip()  wait.hint() → { positions, midis }  wait.goTo(i)  wait.summary() → { matched, skipped, wrong, hints, firstTry, records }
// r.kind: 'match' | 'partial' (chord tones so far) | 'wrong' (r.octave: right note, wrong octave) | 'ignored' | 'done'
const flow = new FlowMode(flowTargets(targets, { tempoPercent: player.tempoPercent }), { windows?: { perfect: .045, good: .09, ok: .17 }, retrigger? = 0.07 });
tracker.on('noteon', (e) => flow.hear({ ...e, time: player.songTimeAt(e.time) }));    // → perfect | good | early | late | wrong, or null
// every animation frame: flow.advance(player.songTimeAt(audioNow())); at the end: flow.finish()
// on the player's 'loop' event: flow.nextPass({ tempoPercent: e.tempoPercent }); on its 'tempo' event: flow.setTempoPercent(e.percent)
// FlowResult { score, maxScore, combo, maxCombo, accuracy %, counts, bars: BarHeat[] {bar, …, accuracy, mistakes}, weakBars }
weakBarRanges(result, { max? = 3 }) → [{ from, to, mistakes, targets }]   // worst first: player.setLoop(from, to) or extractBars(song, from, to + 1)
```
Detector noise is not the learner's fault: a second note-on of the pitch just matched within `retrigger` (the detector firing twice),
or that note still ringing and re-detected (wait: within `holdWindow`; flow: within its length), is ignored, not wrong; in flow
mode an octave slip on an open target neither scores nor breaks the combo, and a strum is judged on its first notes (2 of 3 chord
tones), the rest of it ignored. A note more than `ok` early is not a hit: the target is missed when its window passes.
`HeardNote { time, midi, freq?, cents? }` and `HeardChroma { time, chroma[12] }` are what `@/core/pitch` emits as `noteon`/`chroma`
(pass its tracker the player's AudioContext so times share the audio clock). Also pure: `matchNote`, `chromaScore`, `pitchClassScore`.

## Gotchas
- Durations are sticky across bars but reset per `track:`; write one at the start of every track.
- `lyrics:` belongs to the music line directly above; ties are not sung on.
- Chord symbols are sounding pitch; give shapes as `"A=x02220"` frets **behind the capo** (`validateSong` warns when a shape does not sound its symbol).
- ASCII tab (unless it has a rhythm row) and chord sheets carry no rhythm: results say `estimatedRhythm`; tell the learner to check.
- `FlowTarget` times follow the practice tempo: after a tempo change call `flow.setTempoPercent`, or the targets drift from `songTimeAt`.
- In the Vite dev server the first dynamic import of alphaTab/@tonejs/midi can fail once while Vite optimises it (the page reloads); builds are unaffected.
