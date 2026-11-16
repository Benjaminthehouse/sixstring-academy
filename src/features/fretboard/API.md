# Fretboard trainer (`#fretboard`) — what other code can use

The screen is `src/features/fretboard/index.tsx`; its model (`core/`) is pure and unit-tested.

## Addresses

| address | opens |
|---|---|
| `#fretboard` | the home: the next step of the method, the drills, the neck map |
| `#fretboard--stage--<id>` | a step of the method (`open-strings`, `string-6-naturals`, `string-5-naturals`, `roots-6-and-5` ...; `STAGES` in `core/path.ts`); its scope is fixed |
| `#fretboard--drill--<id>[--<options>]` | a free drill: `name-the-note`, `find-the-note`, `find-every-note`, `play-the-note`, `sprint`, `blind-spots` |

### A drill, set up

Options follow the drill's id, in any order (`core/address.ts`); one the trainer does not know is
ignored.

| param | means |
|---|---|
| `strings-6-5` (`string-6`) | the strings to drill (1 = thinnest) |
| `frets-4-8` (`fret-5`) | the frets to drill, inclusive, kept inside the learner's neck |
| `naturals` / `all-notes` | natural notes only, or all twelve |
| `note-c`, `note-f-sharp`, `note-bb` | one note to find: find-the-note, find-every-note and play-the-note ask only that note, natural or not (the name drills ignore it); "find every" asks once, the others about twice per place |

Strings, frets and the note set are stored as the drill settings, as if set with "Change" (they
stay until changed); the single note is for that round only and shows in the title ("Find the
note: C").

```text
#fretboard--drill--sprint--string-6--frets-0-3--naturals        "keep only string 6, frets 0 to 3, natural notes"
#fretboard--drill--sprint--strings-6-5--all-notes               "keep only strings 6 and 5 and pick All 12 notes"
#fretboard--drill--name-the-note--frets-4-8--all-notes          "From fret 4 and To fret 8, all 12 notes"
#fretboard--drill--find-the-note--strings-6-5--note-c           find C on strings 6 and 5
#fretboard--drill--find-every-note--note-f-sharp                find every F♯
```

In code: `parseDrillParams(params)`, `drillParams(id, address)`, `applyDrillAddress(settings,
address, stringCount, maxFret)`, and `drillPlan(drill, settings, { pc, ctx })` for one note.

## Practice it reports

`kind: 'fretboard'` once per round on `fretboard:<stage or drill id>` (a finished round, or one
left after three questions or more), plus the neck map skill per tuning (`mapSkillId`).

Browser check: `node e2e/fretboard.cjs [--only address]`.
