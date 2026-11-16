# Chords (`#chords`) — what other code can use

The screen is `src/features/chords/index.tsx`; its model (`model/`) is pure and unit-tested.

## Addresses

| address | opens |
|---|---|
| `#chords` | the library: first-chords path, by type, by root, search, mine |
| `#chords--g-major`, `#chords--g`, `#chords--f-sharp-m7` | a chord page (theory `chordSlug`, or the progress module's skill slugs) |
| `#chords--f-major--2` | a chord page on its second shape (1-based, in the page's own order) |
| `#chords--c-major-over-e` | a slash chord |
| `#chords--trainer[--<chord>...]` | the chord-change trainer on two to four chords (also `--changes`) |
| `#chords--identify[--x32010]` | name that shape |
| `#chords--mine`, `#chords--type--m7`, `#chords--root--f-sharp` | my chords; the library on a family or a root |

### The trainer, set up

After `trainer` come the chords and, in any order, how to practise. What the address names is
set as if chosen by hand (and stays chosen); the learner still presses Start.

| param | means |
|---|---|
| `minute` (`one-minute`) | one-minute changes |
| `timed` (`in-time`) | changes in time, with a click |
| `check` (`ring-true`) | the ring-true check with the microphone (one-minute changes where the host refuses a microphone) |
| `t<bpm>` | tempo of changes in time, 40–160 (implies `timed`) |
| `beats-<n>` | beats each chord lasts in changes in time: 8, 4, 2 or 1 (implies `timed`) |

```text
#chords--trainer--e-minor--a-minor--minute              one-minute changes, Em to Am
#chords--trainer--g-major--d-7--timed--t70--beats-2     G and D7 in time, 70 BPM, a change every 2 beats
#chords--trainer--g-major--c-major--check               ring-true check
```

In code: `trainerParams(['G', 'D7'], { mode: 'timed', bpm: 70, beats: 2 })` builds the params and
`trainerSetup(options)` reads them (`model/trainer.ts`); `viewFromParams` keeps setting words
apart from chords (`TRAINER_OPTION` in `model/symbols.ts`). The setup root carries `data-mode`,
`data-bpm`, `data-beats` and `data-skill`.

## See it on your guitar

A chord page links to the Live Fretboard on that chord and the shape on screen:
`cameraChordParams(symbol, frets, tuning)` (`model/camera.ts`) gives `['chord', 'f-major', '8']`
(the camera's own shape number, found by the shape's frets; none when the camera does not list
it). The link is left out for slash chords and in the Claude viewer, where there is no camera.

## Practice it reports

`chord-change` activities on `chord-change:<a>-<b>` skills (one per finished trainer round),
`chord-practice` on `chord:<slug>` from the microphone check on a chord page.

Browser check: `node e2e/chords.cjs [--only address]`.
