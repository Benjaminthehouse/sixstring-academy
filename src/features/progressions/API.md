# Progressions (`#progressions`) — what other code can use

The screen is `src/features/progressions/index.tsx`; its model (`model/`) is pure and unit-tested.

## Addresses

| address | opens |
|---|---|
| `#progressions` | the browser: shelves by style, level filter, search |
| `#progressions--<id>[--<key>]` | one progression (catalog id from `@/content/progressions`) in a key (`--f-sharp`, `--bb`), else the remembered or first friendly key |
| `#progressions--<id>[--<key>]--jam[--<options>]` | jamming over it with the band |
| `#progressions--builder[--jam]`, `#progressions--builder--my-<id>` | the builder, jamming over its draft, a saved progression |

### The jam, set up

Options follow `jam`, in any order, before or after the key (`model/address.ts`); one the screen
does not know is ignored, and the key is the first param that names one. Tempo and style are set
as if chosen by hand, so they are remembered for that progression. Times through and the hidden
chart are for this visit only: a lesson's `x2` never stops the band after two passes in a jam
the learner opens later (setting Loop or Times through by hand in the band sheet is remembered,
as always).

| param | means |
|---|---|
| `t<bpm>` | tempo, kept inside what the style can play (`t96`) |
| `<style id>` | band style: any of `BACKING_STYLE_IDS` (`pop-rock` `ballad` `ballad-68` `blues-shuffle` `slow-blues` `funk` `reggae` `bossa` `jazz-swing` `country` `folk` `metal` `latin` `waltz` `rumba` `gospel` `ska` `classical` `tango`) |
| `x<n>` | play n times through (1–16), then an ending, instead of looping (`x2`); this visit |
| `hide-chart` | chord names hidden (big chord, next chord, chart, title; the neck shows the key's notes only) until the learner taps "Show the chords": for working the chords out by ear. The band sheet has the same switch. |

```text
#progressions--blues-12-bar--a--jam--t84--x2            "Set 84 BPM; turn off Loop for 2 times through"
#progressions--minor-i-bvi-biii-bvii--e--jam--waltz--t96   "set Style to Waltz 3/4 and the tempo to about 96"
#progressions--pop-axis--a--jam--hide-chart             work the chords out by ear, then reveal
```

In code: `progressionParams(id, tonic, jam, options)` builds the params, `parseAddress(params)`
reads them (`options` on the page and jam views). The jam root carries `data-tempo`,
`data-style`, `data-hidden` (`true` while the names are hidden) and `data-plain`.

## Plain words for beginners

`needsPlainWords(state)` (`model/plain.ts`) is true for a learner who said they are a beginner,
or who is taking Mia's course, until they start Dev's or Prof. Varga's. The jam then shows no
roman numerals: the title loses them (`plainTitle`: "I–V–vi–IV (the axis progression)" is "The
axis progression"; a name made only of numerals becomes its chords), the line under the chord
says "Home chord" for the chord on the home note and nothing for the others, and the chart drops
its numerals. Scales and modes are named by their notes (`plainScaleName`: A harmonic minor is
"A minor with G♯", E Dorian "E minor with C♯"; `plainKeyName`: "E minor with C♯ (Dorian)").

## The tempo hint

`tempoHint(feel, bpm)` (`model/jam.ts`) names the range the progression is usually played in and
never calls a slower tempo wrong ("Usually 90 to 140 BPM. Slower is how you learn it: ...").

## Practice it reports

`kind: 'progression'` on `progression:<id>` (or `progression:builder`) for time played with the
band, once it passes 20 s (`jamActivity`).

Browser check: `node e2e/progressions.cjs [--only address]`.
