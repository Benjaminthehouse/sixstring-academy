# Player (`#play`) — addresses and what other code can use

The screen is `src/features/player/index.tsx` (route `play`). The engine (`engine/engine.ts`) owns the
song core's `SongPlayer`, the microphone and the practice modes; the view models in `model/` are pure
and unit-tested (`npx vitest run src/features/player`). Browser check: `node e2e/player.cjs [--only …]`.

## Addresses

`#play--<song-id>` opens a song from the library (`@/core/library`: a built-in folder name or one of
the learner's `my-…` ids). Params follow the id, in any order; one the player does not know is read as
a section name (and said so when the song has no such section), never thrown on. Build links with
`playerParams(id, options)` (`model/params.ts`), read them with `parsePlayerParams(params)`.

| param | means |
|---|---|
| `m9` | start at bar 9 (bars count from 1, as printed on the score; a pickup is bar 1) |
| `m9-12` | loop bars 9 to 12 |
| `t70` | practice tempo 70 % (25–150; the pitch stays the same) |
| `listen` `wait` `flow` `tap` | practice mode (Wait and Flow listen through the microphone; where there is none they open as `tap`) |
| `<section>` | loop that section, by its name as a slug: `chorus`, `verse-1`, `a-again` |
| `part-<part>` | the learner plays this part: a track id (`part-your-strum`), a track name as a slug (`part-teacher`), or a role: `part-rhythm` (also `part-strum`, `part-chords`), `part-lead` (also `part-melody`, `part-tune`), `part-bass`. The others keep sounding. A part the song does not have opens on the first part and says so. A section called "Part A" still loops with `part-a` when no part has that name. |
| `mute-<part>` | mute a part (same names as `part-`; may be given more than once). With mutes in the address, any solo is cleared. |
| `tab-only` `tab-and-notes` `notes` | what the score shows: tab, tab with the notes on a staff above it, or **notes only** (sight reading: the staff, with the tab rows covered on every line; the cursor, taps, loops and the heat strip work as with both). `notes` also turns the fretboard off (it would show the answers). |
| `hide-chart` | chord names and chord boxes hidden: play it from memory. The fretboard is turned off too. Wait mode does not name the chord until "Show me". For this visit only (a reload keeps it; the next plain visit shows the chords). |
| `capo<n>` | the learner's capo is on fret n (0–9): the shapes stay as written and the app plays along in the key the capo gives (capo 2 on a song in G sounds A; a bass part moves with it). |
| `up<n>` `down<n>` | move the song n semitones (1–7) up or down, for singing: every part moves and the tab and chords change to match. |

Without a place in the address (`m…` or a section) the player offers back where the learner was,
when that was in the last 12 hours. Reloading the same address restores everything (`model/session.ts`);
a new address keeps the learner's preferences for the song (tempo, mode, view, mutes, count-in, click,
speed trainer, capo, key) and applies what it asks for. Tempo, part, mutes, view, capo and key asked
for by an address are kept as the learner's from then on; a hidden chart is not.

```text
#play--greensleeves-fingerstyle--m9-12--t70--flow    loop bars 9 to 12 at 70 %, Flow
#play--korobeiniki--part-strum--t70                   strum the chords while the app plays the tune
#play--frere-jacques--part-teacher--mute-your-strum   play the teacher's line, without the strum
#play--st-read-first-g--notes--wait                   sight reading: the staff only, the song waits for each note
#play--amazing-grace--hide-chart--wait                from memory: the song waits for each chord, unnamed
#play--amazing-grace--capo2                           your capo on fret 2: same G shapes, the app plays in A
#play--amazing-grace--down2                           two semitones lower, for your voice
```

```ts
import { playerParams } from '@/features/player/model/params';
href('play', ...playerParams('korobeiniki', { part: 'strum', tempo: 70 }));          // #play--korobeiniki--t70--part-strum
href('play', ...playerParams('st-read-first-g', { layer: 'notation', mode: 'wait' })); // …--wait--notes
```

## What the screen does with a song

- **Reading studies.** A built-in song with `prefersNotation: true` in its `meta.ts` opens with the
  notes shown above the tab ("Tab and notes") until the learner picks a view in the player (More >
  Score), which is then kept for that song. Settings > "Tab and notation" decides for every other song.
- **The meter's own beat.** Every tempo shown counts the beat the count-in and the click count
  (`model/meter.ts`, from the audio module's `resolveMeter`): `90 bpm` in 4/4, `♩. = 60` in 6/8 (the
  mark printed on the score), `♪ = 120` in 3/8. The tempo button, the side panel's tempo, the header,
  the speed trainer's summary and its notes after each loop ("Clean. Now 80 % (♩. = 48).") and the
  count-in switch ("One bar of clicks before the music starts: 2 dotted-quarter beats.") all use it.
- **Key and capo** (More > Key and capo, and the side panel on desktop): "Your capo" and "Move the
  song", with a line saying what sounds ("Sounds in A major. You play G major shapes with a capo on
  fret 2."), "Same key, easier shapes: capo n" when a song was moved up, and "As written". A change
  builds a fresh engine on the moved song (`model/arrange.ts` `arrangeForPlayer`), carrying over tempo,
  loop, place and mode. The header shows the sounding key and the shift ("A major (+2)").
- **Wait mode with chords.** A strum that does not match the chord waited on is named from its
  sound (`model/heard-chord.ts`: its chroma averaged over the moment after the strum, ranked against
  the song's chords and every major and minor triad): "That sounded like Am. The chart says C: give it
  another go."; "Nearly G. The D did not ring out. Strum it again."; after two such strums the hint
  comes by itself, with the chord sounded.
- **No microphone.** After the microphone was refused or none was found (and wherever the host
  refuses it), the results never suggest Wait or Flow: their suggestion becomes tap-along and the
  listen summary points to Tap along (`micUsable`, `withoutMic` in `model/results.ts`).

## Pure models (`model/`)

```ts
parsePlayerParams(params) → PlayerRequest      playerParams(id, PlayerLinkOptions) → string[]
resolveRequest(request, song) → ResolvedRequest  // bars clamped, section and part found, problems in words
findPart(tracks, 'strum') → track | null           // by id, name slug, then role
openingState(saved, resolved, key, { now, layer, micBlocked, prefersNotation? }) → { session, resumed }
arrangeForPlayer(song, { transpose, capo }) → { song, sounding, capo, warnings }
arrangementWords(song, arrangement) → { sounds, shapes, line, shift }    keyName('A dorian') → 'A Dorian'
meterBeat(time) / tempoMark(quarterBpm, time) → { value, short: '♩. = 60', spoken } / countInWords(time)
judgeStrum(chroma, want, candidates) → { kind: 'other', heard } | { kind: 'close' | 'unclear', missing }
new StrumListener(): onset(t), frame(t, chroma, want, candidates) → verdict once, cancel()
micUsable(failure, hostBlocked)   withoutMic(summary)   trainerSummary(settings, judged, mark?)   trainerNote(next, target, mark?)
```

## For browser checks

The root carries `data-player`, `data-layout` (`bar` | `rail` | `wide`), `data-mode`, `data-phase`.
The score box: `data-player-score`, `data-layer` (`tab` | `both` | `notation`), `data-chords`
(`shown` | `hidden`); the tab cover `data-player-tab-cover` (number of lines covered). The tempo
button `data-player-tempo` (percent) and `data-player-bpm` (beats of the meter a minute). The key and
capo section `data-player-arrangement="<transpose>:<capo>"` and its line `data-player-sounds`.
`e2e/player.cjs` imports `debug.ts` (`playerDebug`: mode, notes heard and what they did, the wait
index, cursor, bars heard, results) through the dev server.
