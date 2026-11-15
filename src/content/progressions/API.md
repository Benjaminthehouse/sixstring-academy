# `@/content/progressions` — the chord-progression catalog

170 progressions in 15 families (pop and rock, fifties, blues, folk and country, minor-key pop,
borrowed chords, secondary dominants and line clichés, modal, funk/soul/R&B/gospel, reggae and
ska, Latin and bossa, flamenco, metal, jazz, classical). Each one is written once as roman
numerals and made concrete in any key by the theory engine, so a chart is never typed per key.
Import from the barrel: `import { getProgression, backingFor } from '@/content/progressions'`.
Tests: `npx vitest run src/content/progressions`.

## The data (`types.ts`)

```ts
Progression = {
  id, name, aka?, family,            // id is slug-safe and stable: lessons link to it
  chart: 'I | V/7 | vi | IV',        // bars split by |, two chords in a bar split it evenly
  bars: [['I'], ['V/7'], ['vi'], ['IV']],
  tonality: 'major' | 'minor' | 'dorian' | 'phrygian' | 'phrygian-dominant' | 'lydian' | 'mixolydian' | 'locrian',
  styles: ProgressionStyle[],        // pop rock blues folk country jazz classical flamenco latin funk soul rnb gospel reggae ska metal modal doo-wop
  level: 1..10,
  feel: { backing: BackingStyleId, tempo: [slow, fast], meter: '4/4' | '3/4' | '6/8' | '12/8' },
  altFeels?: ProgressionFeel[],      // other backing styles that suit it
  why: string,                       // two sentences: why it works, functionally
  tryThis: { scales: { degree, scale }[], strum, tip? },   // scale = theory scale id, degree = where it starts in the key
  related: string[],                 // ids
  keys: string[],                    // guitar-friendly tonics; keys[0] is the default
  keyNotes?: Record<tonic, string>,  // e.g. flamenco "por arriba" for E
  sections?: { label, bars }[],      // AABA etc. for long forms
  heardIn?: { title, by, note? }[],  // famous uses, only where certain (never transcribed)
}
```

**Chart tokens** use the engine's numeral syntax (`I ii7 V7/V bVII iiø7 vii°7 subV7 Imaj7 I5 V7b9`),
accidentals measured against the major scale in every key (A minor is `i ii° bIII iv v bVI bVII`).
One addition: a slash followed by a **degree of the key** puts that note in the bass, so `V/7` is
G/B in C, `iv/b6` is Dm/F in A minor, `IV/5` is F/G. A slash followed by a numeral stays an applied
chord (`V7/ii` = A7 in C); both combine as `V7/IV/3` (C7/E). Show tokens with `formatSlot(token)`
(`'iv/b6'` -> `'iv/♭6'`) and names with `formatProgressionName(name)` (`'I–bVII–IV'` -> `'I–♭VII–IV'`).

## Lookups (`index.ts`)

```ts
PROGRESSIONS                       // all, in catalog order (family by family)
getProgression(id): Progression | null      progression(id): Progression   // throws RangeError
progressionsByStyle('blues')       // easiest first
progressionsByLevel(3) / progressionsByLevel(5, 7)
progressionsByFamily('jazz')       // authored order
relatedProgressions(p | id)        searchProgressions('andalusian')   // names, aka, ids, styles, song titles
PROGRESSION_STYLES, PROGRESSION_FAMILIES    // { id, name, description }[] in browsing order
progressionSkillId(id)             // 'progression:<id>' for recordActivity / the progress store
```

## Making it sound (`resolve.ts`)

```ts
progressionInKey(p | id, tonic?, { backing? }): ResolvedProgression
//   { progression, key: { tonic, tonality, keyMode, scale, name: 'A minor' }, backing, beatsPerBar,
//     bars: ResolvedChord[][], chords: string[] (unique symbols, for chord diagrams) }
//   ResolvedChord = { token, numeral, bassDegree, symbol: 'G/B', root, bass, notes, beat, beats, backing: BackingChord }
backingFor(p | id, tonic?, { feel?, tempo?, choruses?, loop?, seed? }): { bars, options, resolved }
//   band.load(setup.bars, setup.options)   — style and tempo from the feel (tempo = middle of its range)
keyChoices(p): string[]            // the 12 tonics from C up, each spelled for this progression (Db major, C# minor)
bestTonic(p, pcOrNote): string     // one of them: bestTonic(andalusian, 8) -> 'G#'
soloScales(p | id, tonic?): { tonic, scale }[]   // tryThis.scales made concrete, for links to the scale screens
homeKey(p, tonic)   resolveSlot(token, home)   parseSlot(token)   parseChart(chart)   toBackingBars(resolved)
TONALITY_NAME, TONALITY_SCALE      // 'Phrygian dominant', 'phrygian-dominant'
```

The tempo in a feel is in the backing style's **felt** beats per minute (dotted quarters in 6/8 and
12/8), exactly what `BackingBand.load({ tempo })` takes. `meter` always equals the style's meter.
A modal or flamenco tonality is spelled through the major or minor key with the same third
(`keyModeFor`): D Dorian through D minor, E Phrygian dominant through E major.

## Examples

```ts
import { getProgression, progressionInKey, backingFor, keyChoices, formatSlot } from '@/content/progressions';
import { BackingBand } from '@/core/audio';
import { formatChord } from '@/core/theory';

const p = getProgression('flamenco-andalusian')!;          // i | bVII | bVI | V
progressionInKey(p, 'E').bars.map((b) => b.map((c) => formatChord(c.symbol)));   // [['Em'], ['D'], ['C'], ['B']]
p.bars.flat().map((t) => formatSlot(t));                   // ['i', '♭VII', '♭VI', 'V']
keyChoices(p);                                             // ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B']

// Playback: in a click handler
const band = new BackingBand();
const setup = backingFor('blues-quick-change', 'A', { loop: true });
band.load(setup.bars, setup.options);
band.onChord(({ segment }) => highlight(segment.bar, segment.beat));   // segment.bar indexes setup.resolved.bars (mod its length)
await band.prepare(); band.start();                         // ... band.dispose() on unmount
```

## For lesson and teacher authors

Reference a progression by its **id** (`'blues-quick-change'`, `'jazz-backdoor'`,
`'classical-folia'`) and link with `href('progressions', id)`; ids never change once published.
Let the reader's key choice flow through `progressionInKey(id, tonic)` instead of writing chord
names into lesson text. Good entry points by level: 1–2 `pop-i-iv`, `folk-i-v7`, `pop-axis`,
`rock-i-iv-v`, `blues-12-bar-triads`; 3–4 `blues-quick-change`, `flamenco-andalusian`,
`rock-i-bvii-iv`, `rock-rising-fifths`, `dorian-i-iv`; 5–6 `jazz-ii-v-i`, `borrowed-iv-minor`,
`secondary-v-of-v`, `classical-canon-bass`, `blues-jazz`, `blues-16-bar-stop-time`; 7–10 `jazz-rhythm-changes`, `jazz-backdoor`, `classical-folia`,
`blues-bird`, `jazz-coltrane-cycle`.

## Gotchas

- A chord held over several bars is repeated in the chart (`'I | I | IV'`); the band treats each bar
  as a fresh arrival.
- Two chords in a 3/4 bar split 2 + 1 beats; 6/8 and 12/8 bars count their felt beats (2 and 4).
- `heardIn` names famous recordings only; never transcribe them. Modern songs stay names. A key in
  its `note` ("in A minor") always agrees with the entry's tonality.
- `tryThis.scales` are checked chord by chord: each chord is covered by a listed scale (a pentatonic
  gap is fine; the minor pentatonic's blue-note rub over I, IV and V of a major-key blues is
  allowed), or the tip names that chord, its bar, or says to follow each chord's own root
  (`review.test.ts`). Keep that true when you edit a chart or a tip.
- A two-chord vamp can often be heard in another key (`dorian-i-iv` in A is also ii7–V7 of G
  major). Those entries say so in their tip; lessons should establish the home chord first.
- Power chords are upper case (`I5`, `bVI5`) in every tonality: the engine writes no third for them.
