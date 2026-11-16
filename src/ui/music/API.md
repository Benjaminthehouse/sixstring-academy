# `@/ui/music` — the music UI kit

```tsx
import { Fretboard, scaleMarkers, patternMarkers, voicingOnBoard, ChordDiagram, CircleOfFifths,
         NotationView, PianoKeys, RhythmView, StrumPattern, NoteBadge, DegreeLegend } from '@/ui/music';
```

Live gallery of every component in realistic configurations: route `#kit-music` (naming, handedness
and theme switches at the top). Browser check: `node e2e/kit-music.cjs`. Tablature is a separate
module, `@/ui/music/tab`.

Conventions that hold for the whole kit:

- **Data in, drawing out.** Notes are ASCII spelled names (`F#`, `Bb3`), pitch is sounding MIDI,
  strings are numbered 1 (high E) … 6, per-string arrays run low to high: the same as `core/theory`
  and `core/guitar`. Left-handed and vertical views only flip the drawing, never the data.
- **Colours are names, not values.** A note gets a `MusicColor`: `deg-1`…`deg-7`, `deg-x`,
  `finger-1`…`finger-4`, `finger-t`, `neutral`, `accent`, `ok`, `bad`, `info`. Each maps to its token
  and its paired label colour (`--deg-3` / `--deg-3-fg`). Every colour comes with a text label or a
  shape; `hit` / `miss` add a check / cross.
- **Settings follow the learner.** Note naming (letters / solfege / German), handedness, fretboard
  wood and inlays come from `core/progress` preferences automatically. `<MusicSettingsProvider
  naming="solfege">` overrides them for a subtree; a component prop overrides both.
- **Accessible.** Drawings are `role="img"` with a spoken summary; anything tappable is a real
  `<button>` (fretboard cells, piano keys) or radio (circle wedges) with arrow-key roving focus.
- **Fast.** Static layers are memoised; markers, highlights and the current step re-render alone.
  `NotationView` moves its highlight without re-engraving. Heavy VexFlow loads only with notation.

---

## Fretboard

```tsx
<Fretboard frets={[5, 8]} markers={patternMarkers(scalePatterns('A', 'minor-pentatonic')[0])} />
<Fretboard frets={[0, 12]} markers={scaleMarkers('C', 'major', { maxFret: 12 })} />
<Fretboard frets={[0, 4]} {...voicingOnBoard(chordVoicings('G')[0])} />          // markers, barres, muted
<Fretboard frets={[0, 5]} cellLabels="position" markers={taps}
           onCellClick={({ string, fret, midi, note }) => check(note)} />           // tap-the-note game
```

| Prop | Type [default] | |
|---|---|---|
| `tuning` | `TuningInput` [standard] | String count, labels and string gauges follow it (7-string, bass, ukulele…). |
| `frets` | `[from, to]` [`[0, 12]`] | Frets on the wood. `0` adds the open-string column and the nut; `[5, 9]` starts mid-neck (first fret numbered). Up to 24. |
| `spacing` | `'proportional' \| 'even'` [proportional] | Real fret spacing blends toward even only as much as the width needs. |
| `orientation` | `'horizontal' \| 'vertical' \| 'auto'` [horizontal] | Vertical: nut on top, low string on the left (a chord-box view). `auto`: horizontal, but on an upright phone where the range would scroll sideways, a compact vertical board (games and drills over frets 0–12). |
| `compact` | `boolean` | Vertical boards: each fret as short as reading allows (44 px when tappable), evenly spaced, so 0–12 stand on a phone (about 620 px tall tappable, 330 px static) with no sideways scroll. |
| `leftHanded` | `boolean` [setting] | Mirror: nut on the right (bottom-to-top stays string 6 → 1). |
| `size` | `'sm' \| 'md' \| 'lg' \| 'xl'` [md; xl when tappable] | String spacing 20 / 28 / 36 / 44 px. |
| `fretNumbers` | `'inlays' \| 'all' \| 'none'` [inlays] | Under the board (beyond the low string). |
| `stringLabels` | `boolean` [true] | Open-string names in the reader's naming. |
| `capo` | `number` | Draws a capo; **marker and cell frets then count from the capo** (as tab and the guitar engine do). |
| `markers` | `FretMarker[]` | See below. Fret-0 markers sit in the open column (on the capo with one). |
| `barres` | `FretBarre[]` | `{ fret, fromString, toString, label?, color? }` — a bar under the dots. |
| `open` / `muted` | `number[]` | `o` / `×` marks at the nut. |
| `box` | `{ from, to, strings?, label? }` | Highlighted fret span (a position, a CAGED shape) with an optional caption. |
| `path` | `FretPosition[] \| 'markers'` | Line through positions in order; `pathArrows` [true]. |
| `onCellClick` | `(cell: FretCell) => void` | Every string × fret cell becomes a `<button>` (≥ 44 px); `FretCell = { string, fret, midi, note }`. |
| `cellLabels` | `'note' \| 'position'` [note] | Accessible names: "string 3, fret 5, C" or just "string 3, fret 5" (games). |
| `noteContext` | `SpellContext` | Spelling for cell names and taps: `{ key: 'Eb major' }`. |
| `naming`, `wood`, `inlay` | [settings] | Woods `rosewood maple ebony pau-ferro roasted-maple koa`; inlays `dots offset-dots blocks diamonds sharkfin vine`. |
| `minFretWidth`, `maxFretWidth` | px | Narrowest fret before scrolling (default fits a dot; 44 when tappable), widest fret (3.9 string gaps; 3 when tappable). |

**Fitting.** The board measures its container. Frets 0–12 fit a 390 px phone without scrolling;
longer ranges (or a 360 px screen, or tappable 44 px cells) scroll sideways inside the board's own
box, never the page, unless `orientation="auto"` stands them up on an upright phone.
Keyboard: one Tab stop for the cell grid; arrows move the way the board looks (mirrored/vertical
aware), Home/End jump to the first/last fret.

**Look and speed.** Behind the nut is the page, not wood: the open-string column is a stub tinted
toward the page surface (light in the light theme, dark in the dark one), and rings, `o`/`×` marks and
labels there use page ink. Markers re-render one by one (primitive props: a game that passes a fresh
array with one changed state re-renders that one marker). A `target` pulses with an HTML ring over the
board animating transform and opacity only, so it never repaints the SVG (54–63 paints in 3 s with
six target boards before, 0 after). The screen-reader description lists every marker in the order
given, however many there are (`markerDescription(markers, naming)`: `C on string 5 fret 3 (root); …`;
screens' checks parse that phrase).

**`FretMarker`** `{ string, fret, label?, color?, shape?: 'circle'|'square'|'diamond'|'ring',
state?: 'normal'|'target'|'hit'|'miss'|'ghost', root?, note?, noteLabel?, description?, id? }`.
`target` pulses (static under reduced motion), `hit`/`miss` get a ✓/✗ badge, `ghost` is dimmed,
`root` is larger with a pearl halo. With `noteLabel: true` (set by the builders for note labels)
the board writes `note` in the reader's naming system, so markers built once follow the setting.
Give `id` when one position appears twice (a sequence).

**Builders** (pure; options `{ label?: 'note'|'degree'|'interval'|'finger'|'none', color?:
'degree'|'finger'|'root'|'neutral', naming?, rootLabel?: 'R'|'1', shape?, rootShape?, state? }`):

```ts
scaleMarkers('A', 'minor-pentatonic', { maxFret: 12, label: 'degree' })   // every scale note in a range
patternMarkers(pattern, { label: 'finger', color: 'finger' })             // one ScalePattern, playing order
arpeggioMarkers('Am7', { minFret: 5, maxFret: 8 })                         // chord tones with roles
noteMarkers('C', { maxFret: 5 })   noteMarkers('E4')   noteMarkers(64)     // every place a note/pitch is
voicingOnBoard(voicing, { label?, openAs?: 'marker'|'mark' })              // -> { markers, barres, open, muted }
dotsToMarkers(fretDots, opts)       markerLabel(src, mode)   markerColor(src, mode)
cellLabel({ string, fret }, note?, naming?)   spelledAt(pos, { tuning, capo, context })
```

Geometry for your own overlays (all pure, unit-tested): `boardLayout(input)` → points, cells,
wires, inlays, spans, capo bar; `fitFrets`, `fretFractions`, `stringLook`, `fretNumbersFor`,
`inlaysInRange`, `moveOnBoard`, `coveredInlays`.

## ChordDiagram

```tsx
<ChordDiagram voicing={chordVoicings('G')[0]} />
<ChordDiagram chord="F" frets="133211" size="lg" footer="notes" />
<ChordDiagram voicing={v} size="xs" />                 // a chip in a list (no title, no dot text)
```

| Prop | Type [default] | |
|---|---|---|
| `voicing` | `Voicing` | From `core/guitar`: frets, fingers, barres, notes, capo. |
| `frets`, `fingers`, `chord`, `tuning` | | Or a shape: `'x32010'`, `'8-10-10-9-8-8'`, `[null,3,2,0,1,0]`; fingers `'x32010'`-style. Named by `chord` (or identified). |
| `title` | `string \| false` | Default: the chord's name in the reader's naming. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg'` [md] | 3.5 / 5.75 / 8.5 / 12.5 rem wide. |
| `dots` | `'fingers' \| 'notes' \| 'degrees' \| 'none'` [fingers] | Text in the dots. |
| `color` | `'finger' \| 'degree' \| 'ink'` [finger] | |
| `footer` | `'notes' \| 'degrees' \| 'none'` [none] | Under the strings; the root in bold. |
| `rows` | `number` [4] | Minimum fret rows. A shape within 4 frets starts at the nut; higher ones show "5fr". |
| `leftHanded`, `naming` | [settings] | |

A capo voicing adds a "capo 3" line. Pure layout: `chordBoxLayout`, `chordBoxGrid`.

## CircleOfFifths

```tsx
<CircleOfFifths value={key} onChange={setKey} />     // 'G major' | 'E minor'; onChange gives the key name
<CircleOfFifths value="A minor" highlight={['E minor', 'D minor']} />   // static picture
```

Props: `value`, `onChange?` (without it the circle is a picture), `show?: 'both'|'major'|'minor'`,
`highlight?: string[]` (dashed outline), `diatonic?` [true], `naming?`. Majors outside with their
signature count, relative minors inside, both spellings at B/C♭, F♯/G♭, D♭/C♯. The selected key is
filled with the accent; the wedges of its seven diatonic chords show their numerals (minor keys
use `i ii° bIII iv v bVI bVII`, from `core/theory`). Keyboard: radios; ←/→ go round, ↑/↓ switch
ring, Home goes to the top (C or Am). A wedge is announced as `G major, 1 sharp, V chord of the
selected key` (enharmonic slots name both keys, each with its own signature). Pure: `circleWedges(key)`,
`slotOfKey`, `circleSlots`, `wedgePath`, `polar`, `signatureWords(signature)` (`1 sharp`, `3 flats`), `wedgeLabel(wedge, naming)`.

## NotationView (VexFlow 4, loaded on first use)

```tsx
<NotationView notes="B3/q B3 C4 D4 | D4 C4 B3 A3" keySignature="G major" time="4/4" labels="names" highlight={i} />
<NotationView notes={[{ keys: ['C4', 'E4'], duration: 'w', label: 'M3' }]} clef="treble" />
<NotationView notes="F#4/q G#4 A#4 B4 C#5 D#5 E#5 F#5" clef="treble" keySignature="F# major" colorBy="degree" labels="degrees" />
```

| Prop | Type [default] | |
|---|---|---|
| `notes` | text or `(NotationNote \| '|' \| string)[]` | Text: `E4/q`, `(C4 E4 G4)/h`, `r/8`, `B3/q.` (dot), `C4/8~` (tie), `|` bar; a missing duration repeats the last. Durations `w h q 8 16 32` (`e s` too). Plain strings in a list are quarter notes. |
| `clef` | `'treble-8vb' \| 'treble' \| 'bass'` [treble-8vb] | `treble-8vb` = guitar: notes are **sounding** pitch, written an octave up, with the small 8. `treble`/`bass` draw pitches as given. |
| `keySignature` | key name | `'G major'`, `'E minor'`, `'Bb'`. Accidentals are worked out (signature, bar-long alterations, naturals, ties). |
| `time` | `'4/4' \| '6/8' \| 'C' …` | Printed and used to bar: notes crossing a barline are split and tied. Without it notes are grouped without barlines. |
| `labels` | `'none' \| 'names' \| 'degrees'` [none] | On one line under each staff; degrees against the key's tonic (or `tonic`). A note's own `label` wins. |
| `colorBy` | `'none' \| 'degree'` | Degree-coloured noteheads; or per note `color` / per key `colors`. |
| `highlight` | `number \| null` | Index of the source note to mark (accent ink + glow); changes without re-engraving. |
| `scale`, `naming`, `tonic`, `aria-label` | | Scale defaults to 0.85 under 480 px. |

`NotationNote = { keys?, rest?, duration?, dots?, tie?, triplet?, accent?, label?, color?, colors? }`.
Lines break to the container width (re-engraved on resize). The ink is `currentColor` (`--fg`, staff
lines `--fg-muted`). VexFlow's Bravura glyphs are bundled as paths: nothing is fetched (checked by
the e2e script). A placeholder of the right height shows while it loads; if it cannot load, the
notes are listed in words. Pure helpers: `parseNotation`, `normaliseItems`, `splitMeasures`,
`measureAccidentals`, `keySpec`, `vexKey`, `breakLines`, `stretchLine`; `loadVexFlow()` preloads.

**Spelling a line from MIDI** (`spellLine(events, { spellings? })`, used by the tab's staff): each event
is `{ midi[], key, chord?, tied? }`; a pitch in the key takes the key's name, a chord tone the chord's
(D7 in C: F♯; B♭7: A♭); otherwise an explicit hint wins (`spellings: ['Bb']`), then the blues (a line
using the key's ♭3 and ♭7 and not its leading tone writes ♭3, ♭5 and ♭7 flat: E blues has B♭ even
where it slides up to B), then, for a black key, the direction the line takes (G G♯ A rises, A A♭ G
falls), then the key's chromatic scale. A held note keeps its name; white keys keep their natural name.
`isBluesLine(pitchClasses, tonicPc)`.

## PianoKeys

```tsx
<PianoKeys from="C4" to="C5" highlight={[{ note: 'C4', label: '1', color: 'deg-1' }, 'E4', 'G4']} />
<PianoKeys from="C3" to="B5" onKeyPress={({ midi, note }) => play(midi)} />
```

Props: `from`, `to` (names or MIDI; default the octaves around the highlights, else C4–B4),
`highlight` (names, MIDI or `{ note, label?, color? [accent], state? }`; the name keeps its spelling,
E♭ not D♯), `labels?: 'c'|'white'|'none'` [c], `onKeyPress?` (keys become buttons, ←/→ walk them),
`naming?`. Ivory and ebony in both themes. Pure: `pianoLayout`, `rangeAround`, `isBlackKey`.

## RhythmView and StrumPattern

```tsx
<RhythmView rhythm="h q qr | e e e e h" current={step} />           // 'q. e', 'et et et', '>q' accent, '~e' tie
<RhythmView rhythm="q. e e e" time="6/8" />
<StrumPattern pattern="D-DU-UDU" current={slot} />                 // D down, U up, X muted, - missed, > accent
<StrumPattern pattern="sxsx" time="2/4" />                         // the strumming library's s a x - format
```

`RhythmView`: `rhythm` (compact codes `w h q e s` + `.` dot, `t` triplet, `r` rest, `~` tie, `>`
accent, `|` bar — the lesson notation — or parsed `RhythmNote[]`), `time` [4/4], `current` (step
index across bars), `counting` [true]. Each step is a column; notes show a glyph where they start
and a bar as long as they last (rests hollow, ties joined). Eighths and shorter are beamed by the
beat (the tab's rules: a half bar of plain eighths under one beam in 4/4, sixteenth beams and stubs),
a tied note is a second head joined by an arc, accents and tuplet numbers sit in a row above, and
tuplets are grouped bar by bar by duration (a bracket unless one beam holds exactly their notes).
The count runs underneath ("1 e & a", "1 & a" in compound time, "1 trip let" for triplets, numbers
in odd eighths meters, and with eighths beside triplets "1 ta trip & let ta": an eighth's "&" stays
"&") with played syllables bold; a beat cut in six shows only beats and played syllables. Bars wrap on phones.
`StrumPattern`: `pattern`, `time`, `grid?: 'eighth'|'sixteenth'|'triplet'` (default from the slot
count), `current`, `counting`. Missed strokes are faint dashed arrows: the hand keeps moving.
Pure: `parseRhythm`, `rhythmGrid`, `gridStep`, `countSyllables(time, step, { triplets? })`, `stepAt(grid, tick)`,
`barMarks(grid, bar)` (per note: beamed, beam pieces, tuplet, tie in/out), `parseStrum`,
`strumSlotsPerBeat`, `strumSyllables`; glyphs `NoteGlyph` (`beamed` drops the flag), `StrokeGlyph`.

## Small pieces

```tsx
<NoteBadge note="C" degree="b3" />   <NoteBadge note="F#4" octave />     // size sm | md | lg
<IntervalBadge interval="m3" long /> // "m3 minor third", coloured by the degree it reaches; ↓ for descending
<DegreeLegend degrees={['1', 'b3', '4', '5', 'b7']} />   <DegreeLegend compact />
<TuningLabel tuning="drop-d" capo={2} />   <TuningLabel tuning="open-g" highFirst />
```

## Formatting and settings

```ts
noteText('F#4', 'solfege') // 'Fa♯'      noteText('Bb', 'german') // 'B'      noteText('B', 'german') // 'H'
degreeText('b3') // '♭3'   degreeText('1') // 'R'   degreeColor('#11') // 'deg-4'   fingerColor(2) // 'finger-2'
intervalText('-P5') // '↓P5'   intervalLongName('m3') // 'minor third'   degreeName('b7') // 'minor seventh'
useMusicSettings() // { naming, leftHanded, wood, inlay, labels }  (provider, else core/progress prefs)
<MusicSettingsProvider naming="german" leftHanded>…</MusicSettingsProvider>
woodFromCosmetic('wood-maple') // 'maple'    inlayFromCosmetic('inlay-blocks') // 'blocks'
```

## Gotchas

- Marker builders bake label text at build time; note-name labels follow the naming setting anyway
  (`noteLabel`), but degree/finger labels are what you asked for. Rebuild markers in `useMemo` keyed
  on what they depend on.
- With `capo`, every marker, barre and tapped cell fret counts from the capo; `frets` (the shown
  range) is frets on the wood.
- `NotationView` notes are sounding pitch in the default guitar clef. For a non-guitar example at
  written pitch use `clef="treble"`.
- Pass a stable `onCellClick` (`useCallback`) on boards that re-render often: the cell layer is
  memoised on it.

---

## Tab — `@/ui/music/tab` (also re-exported here: `TabView`, `ScoreView`, `TabSnippet`, `noteKey`)

```tsx
<TabView song={song} />                                         // a track of a Song as engraved tab, wrapped to the width
<TabView song={song} track="bass" size="lg" chords="diagrams" />
<TabView song={song} notation />                                // standard staff above, note for note (VexFlow, lazy)
<ScoreView song={song} />                                       // the same: TabView with `notation` always on
<TabView song={song} layout="line" ref={tab} loop={loop} onLoopChange={setLoop} onSeek={(p) => player.seekBar(p.bar)} />
useRafLoop(() => tab.current?.setPlayerPosition(player.position()), playing);   // cursor every frame, no React render
<TabSnippet tab="| e 3:5 3:7h 3:5p 3:7 q 3:7b2r |" onPlay={(song) => play(song)} playing={playing} caption="…" />
```

Draws: string lines broken around every fret number (no strike-through, highlights show behind), bars, final/double
barlines, repeats with dots, `×3`, first/second-time brackets, time signatures (first bar and changes), tuning letters and
TAB on every system, section boxes, tempo (`♩ = 90`, `♩. =` in compound time), capo; rhythm under the staff (stems,
half-length half-note stems, beams with stubs for dotted rhythms, flags, dots, tuplet numbers/brackets) and rests on the
staff; ties `(5)` with an arc (a note held through several columns shows its fret once per bar: the struck note, then
the last held piece of each bar, tied from it; `thinHeldNotes`), hammer-on/pull-off slurs with H/P, legato slides, slides
in/out, bends with arrow and `full`/`½`/`1½` (release, pre-bend), vibrato, P.M. and let ring spans written once per
stretch (`holdSpans`: a let-ring note rings until its string is struck again, a rest or the bar's end; a P.M. stretch runs
from one muted note to the next, across barlines, while no muted string is struck open), natural harmonics `<12>`, A.H., dead `x`, ghost
`(5)`, accents, staccato, tapping `T`, left-hand fingers (subscript), p i m a, pick/strum strokes ⊓ V, rhythm slashes
(muted `x`); chord symbols (capo shapes by default) and optional `xs` chord boxes; lyrics with hyphens; annotations.

| Prop | Type [default] | |
|---|---|---|
| `song`, `track` | `Song`, id / name / index [first] | |
| `layout` | `'wrap' \| 'line'` [wrap] | `line`: one system that scrolls sideways inside the view (play-along). |
| `size` | `'sm' \| 'md' \| 'lg' \| 'xl' \| number` [md] | String gap 11 / 13 / 15.6 / 19 px; a number is a zoom factor. |
| `bars` | `[from, to)` | Show only these bars (lessons, loops). Tempo in force is shown. |
| `rhythm` | `boolean` [true; false with `notation`] | Stems and beams under the staff. |
| `notation` | `boolean` [false] | Treble-8vb staff above, spelled in the key, aligned to the tab. See "Notation support". |
| `spellings` | `string[]` | Names the staff uses whenever their pitch class sounds (`['Bb']`), over the key's and the line's choice: match the lesson text. Also on `TabSnippet`. |
| `chords` | `boolean \| 'diagrams'` [true] | Symbols; `diagrams` adds a chord box over each change. `chordNames: 'shapes' \| 'sounding'` with a capo. |
| `lyrics`, `barNumbers` | `boolean` [true] | |
| `maxBarsPerSystem` | `number` | Cap for the line breaker. |
| `cursor` | `{ bar, tick } \| null` | Declarative cursor (ticks from the bar start). Per frame use the handle instead. |
| `noteStates` | `Map \| Record<key, 'upcoming' \| 'target' \| 'hit' \| 'miss'>` | Keys `noteKey(bar, beat, string?)` (`'3:1:2'` or the whole beat `'3:1'`). Pill + colour + weight; miss is dashed (not colour alone). Only tiles whose notes changed re-render. |
| `loop`, `onLoopChange` | `{ from, to }` bars, inclusive | Shading; with the callback, draggable start/end handles (44 px, arrow keys). |
| `selection`, `onSelectionChange` | `{ from, to }` | Mouse/pen drag across bars, Shift+click, Shift+arrows; Esc clears. |
| `onSeek` | `({ bar, beat, tick }) => void` | Tap/click a beat (also ←/→ Home End from the keyboard). |
| `pick` | `'seek' \| 'loop' \| 'select' \| 'none'` | What a tap does; `loop`/`select`: first tap = first bar, second tap = last bar. |
| `autoScroll` | `boolean` [true] | Wrap: scrolls the page (or the `height` box) when the cursor changes system; line: keeps the cursor at 30 %. Pauses 2.5 s after the learner scrolls. |
| `height` | px / CSS length | Make the view its own vertical scroll box. |

**Handle** (`ref`): `setCursor({ bar, tick } | null)`, `setPlayerPosition(player.position())` (uses `bar` and
`barProgress`), `scrollToBar(bar)`, `getLayout()`. The cursor and the current-beat band are moved with transforms; the
notes of the current beat get `data-now` (accent ink). Nothing else re-renders.

**Layout engine** (pure, unit-tested, `layout.ts`): `buildTabModel(song, { track, bars, chordNames, naming })` →
`layoutTab(model, { width, mode, zoom, measureText, rhythm, chords, diagrams, lyrics, barNumbers, notation })` →
`drawSystem(layout, i)` (display list). Measures are sized by content (`idealWidth` = 40 px · (ticks/960)^0.55 per column,
plus whatever stops fret numbers, chord symbols, lyrics, bend labels and noteheads from touching), squeezed toward their
minimum on phones and stretched to justify; `breakSystems` is an optimal line breaker (one or two bars a line at 360 px).
Effects above the staff are stacked skyline-style (`placeEffects`): nothing overlaps, nothing floats higher than it must.
Helpers: `xAtTick`, `locate`, `hitTest`, `columnSpan`, `barRangeRects`, `barBoundaryAt`; rhythm: `beamGroups`,
`beamSegments`, `tupletGroups`. Only systems near the viewport are drawn (line mode: 1400 px tiles); 200 bars lay out in
about 20 ms and draw lazily.

**Notation support** (`notation`): single voice per track; notes and chords spelled along the line by `spellLine` (key in
force, chord in force, the blues' flat notes, the line's direction, `spellings`; key changes reprint the signature),
bar-long accidentals and naturals (a bar's first accidental kept clear of the barline), ties (split at system edges), dots, tuplets,
beams from the tab's own groups, rests (whole-bar rests centred), accents, staccato, dead notes as x heads, natural
harmonics at their sounding pitch, rhythm slashes, time signatures, repeats and final barlines. Not on the staff
(they are on the tab): bends, slides, slurs, vibrato, palm mute, fingering; a note held past its beat (`length`, merged
voices) is written with its beat's length. The staff's room is reserved before VexFlow arrives (faint staff lines);
if VexFlow cannot load, the view falls back to tab only.

**`TabSnippet`**: `tab` (SixTab: a whole file or just `| … |` lines; `time`, `tempo`, `tuning`, `keyName` fill a missing
header), `bars`, `size`, `rhythm`, `notation`, `onPlay(song)` + `playing` (a round play button), `caption`; forwards the
`TabViewHandle` ref so the lesson can move a cursor. Unparseable text shows as plain text (the error in dev).

Gotchas: chord symbols in the song name what sounds; the tab prints the capo shape unless `chordNames="sounding"`.
The view needs a width: it measures its container (a 9 rem placeholder until then). Fonts are measured with canvas once
the web fonts load, then the layout settles once.
