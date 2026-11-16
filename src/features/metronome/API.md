# Metronome (`#metronome`) — what other code can use

The screen is `src/features/metronome/index.tsx`; its model (`model/`) is pure and unit-tested.

## Open it set up: the address

Route params open the metronome ready to play, the same as setting those controls by hand (the
setup is stored, so it is still there next time). Params are slug-safe and go in any order; one
the metronome does not know is ignored.

| param | means | example |
|---|---|---|
| `t<bpm>` (or a bare number) | tempo, 20–400, of the meter's beat (a dotted quarter in 6/8) | `t80` |
| `<n>-<d>[-<groups>]` | time signature the picker offers; groups for odd meters | `3-4`, `6-8`, `7-8-3-2-2` |
| `beats` `eighth` `triplet` `sixteenth` `swing` `quintuplet` `sextuplet` | subdivision | `eighth` |
| `swing-<percent>` | swung eighths, the long one 50–75 % of the beat (implies `swing`) | `swing-60` |
| `accents-<levels>` | each beat: 0 silent, 1 normal, 2 medium, 3 strong (must match the beats of the bar) | `accents-0-3-0-3` |
| `gap-<play>-<mute>` | silent bars: bars played, then bars silent (1–16 each) | `gap-1-1` |

An address is a whole setup, like a preset: what it does not name goes back to plain (4/4, beats
only, the meter's usual accents, speed trainer and silent bars off; the tempo stays when none is
named). The learner's volume, count-in, session timer, flash-only and vibration are kept. A toast
says what was set ("Set to 50 BPM · 3/4"). The root carries `data-address` (the params applied).

```text
#metronome--t60                         "Set the Metronome to 60 BPM"
#metronome--t90--accents-0-3-0-3        the click only on 2 and 4
#metronome--t50--3-4--accents-2-3-1     a sarabande: beat 2 strong, beat 1 medium
#metronome--t80--7-8--eighth            7/8 grouped 2+2+3 (the usual grouping needs no groups)
#metronome--t80--triplet                triplet subdivisions
#metronome--t80--accents-3-0-0-0--gap-1-1   one click every two bars
```

In code: `parseMetronomeParams(params)` (null when nothing is named), `metronomeParams(address)`
(canonical params) and `applyAddress(settings, address)` from `model/address.ts`.

## Practice it reports

`recordActivity({ kind: 'metronome', durationSec, route: 'metronome', ... })` when a session
timer finishes, when the page is hidden and when the learner leaves, each time with the running
time not yet reported (a minute at least).

Browser checks: `node e2e/metronome.cjs`, `node e2e/metronome-output.cjs`,
`node e2e/metronome-layout.cjs`, `node e2e/metronome-address.cjs`.
