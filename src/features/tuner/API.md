# Tuner (`#tuner`) — what other code can use

The screen is `src/features/tuner/index.tsx`; its model (`model/`) is pure and unit-tested.

## Open it on a tuning: the address

Params are slug-safe, in any order (`model/address.ts`); one the tuner does not know is ignored.

| param | means |
|---|---|
| a catalog tuning id | `standard` `half-step-down` `whole-step-down` `drop-d` `double-drop-d` `drop-c-sharp` `drop-c` `dadgad` `open-g` `open-d` `open-e` `open-a` `open-c` `open-dm` `open-em` `all-fourths` `nashville` `standard-7` `drop-a-7` `baritone` `bass` `bass-5` `bass-drop-d` `ukulele` `ukulele-low-g` `ukulele-baritone` (`TUNINGS` in `@/core/guitar`) |
| a common name, slugged | `eb-standard`, `d-standard`, `dropped-d`, `vestapol`, `spanish` (whatever `getTuning` accepts) |
| `capo-<fret>` | tune with a capo on that fret, 0–12 (for this visit, as the settings control) |

Choosing the tuning is the same as choosing it in the tuning picker: it becomes the learner's
tuning everywhere in the app (chord shapes, the fretboard, the jam's neck), as the guitar now is,
and a toast says so. A lesson that retunes should link back to `#tuner--standard` at its end.

```text
#tuner--dadgad              "In the Tuner, change the tuning to DADGAD"
#tuner--open-g              slide in open G
#tuner--standard--capo-2    "set Capo on fret to 2"
```

In code: `parseTunerParams(params)` and `tunerParams({ tuning, capo })`.

## Practice it reports

`kind: 'tuner'`, through `tuneActivity(confirmed, { seconds, tuningName })` (`model/credit.ts`):

- every string in tune: a finished tuning, once per visit ("Tuned to Standard");
- a guided run that ends with strings skipped, or is stopped or left part of the way: partial
  credit for the strings tuned (`completed: false`, `accuracy` = share tuned, `count` = strings,
  "Tuned 4 of 6 strings (Standard)"), once per visit. A later full tuning in the same visit still
  records its own finished tuning.

Browser checks: `node e2e/tuner.cjs [--only address]`, `node e2e/tuner-shots.cjs`.
