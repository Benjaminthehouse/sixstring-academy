# `@/core/guitar` — the guitar engine

Tunings, fretboard mapping and geometry, scales on the neck, chord voicings, capo, chord-change and
hand-movement helpers. Pure functions on top of `@/core/theory`; works in the browser and in Node.
Import from the barrel only: `import { chordVoicings, scalePatterns, midiAt } from '@/core/guitar'`.

**Conventions.** String 1 = thinnest; per-string arrays (`tuning.midi`, `voicing.frets`) run **low to
high** (index 0 = string 6 on a six-string). Fret 0 = open. With a capo, frets count **from the capo**
(as tab does); `physicalFret(fret, capo)` gives the fret on the wood. Pitch = sounding MIDI. Fingers
1–4, 0 = open string, `null` = muted. Notes are ASCII (`F#`, `Bb`) and spelled by their scale or chord.
Wherever a tuning is expected (`tuning?:`) pass an id, a name, note names, MIDI numbers or a `Tuning`.
**Errors.** Unknown tunings, scales and chords and invalid shapes throw `RangeError`; `getTuning`,
`identifyTuning`, `tryBuildVoicing`, `voicingFromFrets`, `scalePattern`, `positionPatternAt`, `bestVoicing`,
`beginnerVoicing`, `chordChange` and `placeChord` return `null` instead. Results of `chordVoicings` are cached: read-only.
**Speed.** Everything here is cheap enough to call while rendering: a scale over the whole neck
about 0.02 ms, the patterns of a scale 0.2 ms, a chord change 0.02 ms. A chord's voicings take 2–20 ms
the first time (the biggest altered chords more) and are then remembered per chord, tuning and
options: 0.02 ms. Pass the same options object shape each time and never mutate what comes back.

## Tunings — `tunings.ts`
```ts
TUNINGS: Tuning[]   STANDARD_TUNING   // { id, name, description, instrument, category, midi[], notes[] ('E2'…), stringCount, label 'E A D G B E', reentrant, custom }
// ids: standard half-step-down whole-step-down drop-d double-drop-d drop-c-sharp drop-c dadgad open-g open-d open-e open-a
//      open-c open-dm open-em all-fourths nashville standard-7 drop-a-7 baritone bass bass-5 bass-drop-d ukulele ukulele-low-g ukulele-baritone
getTuning('Drop D' | 'DADGAD' | 'Eb standard'): Tuning | null        tuning(input = 'standard'): Tuning        tuningsFor('guitar', 6?)
customTuning('D A D G A D' | 'CGCGCE' | ['C2','G2',…], { id?, name?, instrument? }): Tuning   // catalog tuning when it matches
tuningFromMidi([38,45,50,55,57,62])    identifyTuning(midi[] | tuning): Tuning | null
tuningFrequencies('standard', a4 = 440): number[]                       // Hz, low to high
stringTargets('drop-d', { a4? }): { string, index, midi, note, frequency }[]
nearestString(hz, tuning?, { a4?, tolerance? = 5 }): StringTarget & { cents, inTune } | null   // negative cents = flat
retuneSteps('dadgad', from = 'standard'): { string, from, to, semitones }[]
tuningIntervals(t): number[]   // standard: 5 5 5 4 5      hasStandardIntervals(t): boolean   // CAGED applies
```

## Fretboard — `fretboard.ts`
```ts
// NeckOptions = { tuning?, capo? }      FretRangeOptions = NeckOptions & { minFret? = 0, maxFret? = 22 - capo }
stringIndex(string, stringCount = 6): number     stringNumber(index, stringCount = 6): number     DEFAULT_FRETS = 22
midiAt({ string: 5, fret: 3 }, opts?): 48        pitchClassAt(pos, opts?)       frequencyAt(pos, { a4?, …opts })
openStringMidi(string, opts?)                    physicalFret(fret, capo)       isValidPosition(pos, opts?)
noteAt(pos, { context?, octave? = true, …opts }): 'E#4'      spellMidi(midi, context?, { octave? }): string
//   context: { key } | { tonic, scale? } | { chord } | ToneMap | { prefer: 'sharps'|'flats'|'auto' }; none = commonest name
positionsForMidi(64, range?): FretPosition[]     positionsForPitchClass('C' | 0, range?)     positionsForNote('E4' | 'E' | 64, range?)
fretboardNotes({ context?, …range }): { string, fret, midi, note }[][]   // one row per string, low to high
neckRange({ frets?, …opts }): { low, high }      positionKey(pos): '5:3'        samePosition(a, b)
degreeNumber('b3' | '#11' | 'bb7'): 3 | 4 | 7    // the scale step 1–7 behind a degree label: which --deg-N colour a dot takes
```
**Drawing dots.** `FretDot = { string, fret, midi, note, degree, isRoot, finger?, role? }` is what every
note source has in common: `scalePositions(…)`, `pattern.notes`, `arpeggioPositions(…)` and
`voicing.notes` are all `FretDot[]` as they are. Patterns and voicings carry `finger`; arpeggios and
voicings carry `role` (`root`, `third`, `seventh` …).

## Geometry — `geometry.ts` (frets on the wood; unit = the scale length you pass, default 1)
```ts
fretDistance(n, scaleLength = 1)     // nut to fret wire n: L * (1 - 2^(-n/12)); fret 12 = L/2
fretAtDistance(d, L)                 // inverse, fractional          fretSpaceAt(d, L): fret space a point lies in
fretMidpoint(n, L)                   // centre of fret space n: where a note marker goes (0 for open)
fingertipDistance(n, L, bias = 0.7)  // where the finger presses, close behind the wire        fretWidth(n, L)
INLAY_FRETS  DOUBLE_INLAY_FRETS  inlayFrets(maxFret): { fret, double }[]
NECK_PRESETS.{electric, acoustic, classical, 'short-scale', bass, ukulele}: NeckGeometry (mm)     neckGeometry(preset | partial)
neckPoint(pos, geometry?, at: 'marker'|'fingertip'|'wire' = 'marker'): { x, y }   // x from the nut, y from the centre line (+ toward string 1)
positionAtPoint({ x, y }, geometry?): { string, fret, stringOffset, onNeck }      // the inverse: which string and fret a fingertip is on
stringOffset(string, x, geometry?)   fretboardHalfWidth(x, geometry?)   fretWireSegment(fret, geometry?): [NeckPoint, NeckPoint]
fretboardLayout({ firstFret?, lastFret?, stringCount?, proportional? = true }): { wires[], centres[], strings[] }   // 0–1, string 1 first
```
The camera overlay: detect the neck, map the neck plane to the image, draw at `neckPoint(pos)`, and
read a fingertip back with `positionAtPoint` (`stringOffset` 0 = on the string, ±0.5 = halfway to the next).

## Scales on the neck — `scale-patterns.ts`
```ts
scalePositions('A', 'minor-pentatonic', range?): NeckTone[]   // { string, fret, midi, note, degree, degreeIndex, isRoot, role? }
scalePatterns(tonic, scale = 'major', { system?, allOctaves?, upTheNeck?, …range }): ScalePattern[]
patternSystemsFor(scale, tuning?): PatternSystem[]            // the systems that suit a scale, the usual one first
allScalePatterns(tonic, scale, { systems? }): Partial<Record<PatternSystem, ScalePattern[]>>
scalePattern(tonic, scale, system, index): ScalePattern | null      positionPatternAt(tonic, scale, fret): ScalePattern | null
patternContaining(patterns, pos)     cagedShapeOfRoots(roots): CagedShape | null     tonePositions(map) / tonePatterns(map, label, system)
```
| system | what | count | ids |
|---|---|---|---|
| `caged` | the five CAGED positions (default for 7-note scales) | 5, lowest on the neck first | `caged-e` |
| `box` | two notes per string: pentatonic boxes (default for 5-note scales); box 1 starts on the root | scale size | `box-1` |
| `3nps` | three notes per string, pattern n starts on degree n | scale size (fewer if one runs off the neck) | `3nps-1` |
| `position` | hand positions of five frets (default for other sizes; replaces `caged` in tunings without CAGED) | 3–6 | `position-1` |
| `single-string` | the scale along one string, one octave | strings | `string-6` |
| `two-string` | one octave root to root on two neighbouring strings | strings − 1 | `strings-6-5` |
| `diagonal` | one octave shape repeated across string pairs, climbing the neck | scale size | `diagonal-1` |

```ts
// ScalePattern = { id, system, index, name ('E shape', 'Box 1'), positionName ('5th position', 'frets 3–12'), tonic, scale, tuning, capo,
//   shape: 'C'|'A'|'G'|'E'|'D'|null, position (fret under the index finger), minFret, maxFret, span, strings[], notes: PatternNote[], roots[], hasStretch, hasShift }
// PatternNote = NeckTone & { finger: 0–4, stretch, shift }   — notes are in playing order, ascending: always the next note of the scale
```
Fingering contract (`checkFingering(notes): string[]`, empty = fine): finger = fret − position + 1; any
other finger is flagged `stretch` (hand stays) or `shift` (hand moves to a new position). `fingerLine(positions, { home?, wide?, reach? })`
fingers any ascending line. `allOctaves` adds the repeats twelve frets up (`box-1-8va`).
`upTheNeck: true` lays the set out as one climb: A minor pentatonic boxes at frets 5, 7, 9, 12, 14.

## Practice sequences — `sequences.ts`
```ts
practiceSequence(pattern | notes, kind = 'ascending', { direction?: 'up'|'down'|'up-down' }): PatternNote[]
// kinds: ascending descending up-down down-up thirds fourths fifths sixths groups-3 groups-4 triads string-skip
SEQUENCES: { id, name, description, example, tier }[]     sequencesFor(pattern)     sequenceMidi(sequence): number[]
rootToRoot(pattern | notes, { octaves? }): PatternNote[]     // lowest root to highest root: 'A C D E G A' for box 1 and one octave
```
A sequence is the pattern's own note objects in playing order: position, pitch, degree and finger to light up one by one.

## Voicings — `voicing.ts`
```ts
// Voicing = { id ('c-major-x32010'), chord ('C', 'C/E'), root, type (theory id), bass, inversion, tuning, capo,
//   frets: (number|null)[], fingers: (0–4|null)[], barres: { fret, finger, fromString, toString }[], baseFret, span,
//   notes: { string, fret, midi, note, degree, isRoot, interval, role, finger }[], midi[], omitted ['5'], rootless, difficulty 1–10,
//   label ('Open', 'E-shape barre at fret 3', 'Drop 2, strings 4–1, root position'), category, shape, movable, source: 'library'|'generated' }
// category: open | barre | caged | power | shell | triad | jazz | drop2 | drop3 | generated
buildVoicing('C', 'x32010' | [null,3,2,0,1,0], { tuning?, capo?, fingers?, label?, category?, allowIncomplete? }): Voicing   // throws with the reason
tryBuildVoicing(…): Voicing | null       voicingProblem(…): string | null       essentialTones(chord): ChordTone[]
//   every note must be a chord tone and the essential tones present: all but the fifth and lesser tensions of big chords
//   (a triad or add chord keeps its third: C F G is Csus4, not Cadd11). The root may be missing (`rootless`).
//   The lowest note names the inversion: buildVoicing('C', '032010').chord === 'C/E' (not on ukuleles: `hasBassRegister(tuning)`).
parseFrets('x32010' | '8-10-10-9-8-8')    formatFrets(frets)    voicingPositions(v)    moveVoicing(v, +2): Voicing | null   // slide a movable shape
assignFingers(frets): { fingers, barres } | null      findBarres(frets, fingers)      checkVoicingFingering(frets, fingers): string[]
voicingDifficulty(frets, fingers, { strummed? }): number    difficultyLevel(d): 'easy' (≤3.5) | 'medium' (≤5.5) | 'hard' (≤7.5) | 'expert'
```
The hand: a lower finger never sits on a higher fret; two fingers reach one fret further apart than
one-finger-per-fret puts them (index and little finger four frets); the index finger may barre, the
others flatten across neighbouring strings only. `assignFingers` returns the most comfortable
fingering under these rules or null; `checkVoicingFingering` applies them to a fingering you give.

## Chord library and generator — `chord-library.ts`, `chord-generator.ts`, `chord-shapes.ts`
```ts
chordVoicings('F#m7b5', opts?): Voicing[]       // THE entry point: curated shapes first where they exist, computed ones after; any chord, any tuning
bestVoicing(chord, opts?)    easiestVoicing(chord, opts?)    beginnerVoicing(chord, { tuning?, capo? })    chordDifficulty(chord, opts?): number
generateVoicings(chord, opts?)   // the raw generator, no library
// opts: { tuning?, capo?, minFret? = 1, maxFret? = 15, maxSpan? = 4, allowOpen? = true | false | 'always', rootInBass? = true,
//   strings?: number[], allStrings?, minNotes?, maxNotes?, rootless?, top?: 'B', innerMutes? = 1, maxDifficulty? = 9, maxResults? = 12, library? = true }
libraryVoicings(chord, { categories?, inversions?, maxFret? = 15, tuning?, capo? }): Voicing[]   // curated only, in teaching order
openChordVoicings(): Voicing[]     voicingLibrary(opts?): Voicing[]   // everything on 12 roots (~3500)     libraryChordTypes(): string[]
libraryCoverage(tuning): 'full' | 'partial' | 'none'     OPEN_SHAPES   MOVABLE_SHAPES   VOICING_CATEGORIES   VOICING_CATEGORY_INFO[category]   LIBRARY_ROOTS
```
The library: 99 open-position chords (the first chords, sevenths, sus and add9 shapes, 28 slash
chords, the small F); E- and A-shape barres; C, G and D shapes; power chords; shells; jazz grips
(6, m6, 9, 13, 7♯9, 7♭9, 13♭9, 7alt, m7♭5, dim7, 6/9, m11 …); close triads on every string set and
drop-2/drop-3 sevenths in every inversion (computed). Movable shapes sit at their lowest place on
the neck (B9 = `x2122x`). Coverage: `full` for tunings with standard intervals (transposed, seven-string,
Nashville) and any capo; `partial` for drop tunings, which keep every shape that stays off the dropped
string and let open chords grow downward (drop D: D = `000232`); `none` elsewhere: generated voicings only.
A plain symbol gives root-position shapes, `C/E` that bass, `rootInBass: false` / `inversions: true` every inversion.

**Ranking.** The chord everybody means comes first: the open chord for C G D A E Am Em Dm and the
other open-position chords; the full barre for F, Bm, B♭ … with the easier version right behind
it (`chordVoicings('F')` → `133211`, then `xx3211` "Small barre"; `easiestVoicing('Bm')` → `xxx432`).
For a first-chords lesson ask `beginnerVoicing(chord)`: the standard shape, or the easy one when the
standard is a barre (F → `xx3211`, Fm → `xx3111`; Bm stays the barre).
Every result is playable and named for what sounds. No chord comes back empty: where a tuning has no
room for the whole chord (13th chords on a bass or ukulele) the least important tones go, the root
first, and the voicing says so in `omitted` / `rootless`.

## Identify and arpeggios — `chord-identify.ts`, `arpeggio.ts`
```ts
identifyFretted('x32010' | frets | FretPosition[], { tuning?, capo?, key?, limit? }): { frets, notes: { string, fret, midi, note, degree, role }[], matches: ChordMatch[], symbol: 'C' | null }
voicingFromFrets(shape, { as?: 'Am7', … }): Voicing | null      toFrets(shape, stringCount = 6)
arpeggioPositions('Am7', range?): NeckTone[]                    // every chord tone with its role
arpeggioPatterns('Cmaj7', { system?, …range }): ScalePattern[]  // five CAGED arpeggio shapes; notes carry `role` and fingers; `scale` holds the symbol
```

## Capo, chord changes, the hand — `capo.ts`, `chord-changes.ts`, `hand.ts`
```ts
suggestCapo(['Bb','Eb','F','Gm'], { maxCapo? = 7, tuning? }): CapoSuggestion[]    bestCapo(chords)   // -> capo 3: G C D Em
//   { capo, shapes: { chord, shape, voicing, difficulty, easy, count }[], easyCount, easyShare, difficulty, score }; pass repeats to weigh chords
capoShapes(chords, capo)     progressionDifficulty(chords): { difficulty, hardest, easyShare, shapes }
transpositionDifficulty(chords, semitones): number        rankTranspositions(chords): { semitones, chords, difficulty, easyShare }[]   // easiest key first

chordChange('C', 'Am', { voicings?: 'standard' | 'closest', tuning?, capo? }): ChordChange | null     // = VoicingChange & { from, to: Voicing }
progressionChanges(['G','D','Em','C'], { loop?, voicings? }): { changes: ChordChange[], difficulty, hardest, practice: ChordChange[] }   // practice: hardest first
voicingTransition(from, to): { difficulty 1–10, anchors, guides, moving, shift, sameShape, block, tips: string[] }
changeDifficulty(from, to): number      closestVoicing(from, candidates): Voicing | null

planFingering(midi[], { preferPosition?, gaps?, weights?, start?, …range }): { notes: { string, fret, midi, finger, position, shift, stretch, cost }[], cost, unplayable }
handMove(state, pos, weights?, ease = 1): { cost, state, finger, shift, stretch }    RESTING_HAND    DEFAULT_HAND_WEIGHTS    positionChangeCost(a, b)
simultaneousCost(positions, { tuning? }): number | Infinity     // can these be held together (plucked)?
placeChord(midi[], { near?, …range }): { positions, frets, fingers, difficulty } | null   // the easiest strings for pitches sounded together
```
`planFingering` is what the arranger uses to put a melody on the neck: dynamic programming over every
place each pitch can be played and every hand position that reaches it (shift, stretch and string-skip
costs in `HandWeights`; open strings are free by default: raise `openString` to keep a line fretted).
`placeChord` does the same for notes sounded at once (double stops, a bass note under a melody note).
The capo helpers count a chord as easy when a learner's version exists (the small F), the change
helpers use the standard shape of each chord unless `voicings: 'closest'`.

## Gotchas
- `scalePatterns` returns CAGED positions sorted by neck position; `index` is the shape's place in C-A-G-E-D. Boxes, positions and
  3NPS/diagonal patterns come in `index` order (box 1 first), each at its lowest place on the neck (A minor: boxes 4 and 5 in open and
  2nd position) unless `upTheNeck` is set. Open position is `position` 1, `minFret` 0.
- Where two strings are more than a fourth apart (drop D, DADGAD, open tunings) a position spans more than five frets: the lower
  string carries on up the neck (flagged `shift`) so the pattern stays an unbroken scale.
- A seven-string keeps the six-string numbering: box 1 and 3NPS pattern 1 have the root on string 6, the low B string extends them.
- On ukuleles and re-entrant tunings there is no bass register: voicings keep the plain symbol, `rootInBass` defaults to false, and
  position patterns run in pitch order (the re-entrant string cuts in).
- `voicing.chord` says what sounds, so a shape asked for as `C` may come back as `C/G`; `voicing.id` is route-safe and unique per tuning and capo.
- `rootless: true` returns only voicings without the root. Voicings that leave essential tones out appear only as a last resort (see Ranking).
- A #11 chord without its fifth is note for note the b5 chord: `xx3200` is listed under `Fmaj7#11`, and `identifyFretted` reads it as `Fmaj7b5`.
- Difficulty: Em 2.2, C 3.4, small F 4.4, barre F 6.9, B♭ 7.2. `chordDifficulty('F')` is the barre (6.9). Nothing above 9 is returned
  unless `maxDifficulty` says so. "Easy" for capo purposes = a library open shape of at most 4.5 without a full barre.

## Examples
```ts
import { chordVoicings, scalePatterns, practiceSequence, rootToRoot, identifyFretted, suggestCapo, stringTargets, nearestString, noteAt,
         neckPoint, positionAtPoint, planFingering, placeChord, chordChange, progressionChanges, arpeggioPatterns, degreeNumber } from '@/core/guitar';

chordVoicings('C')[0];                       // { frets: [null,3,2,0,1,0], fingers: [null,3,2,0,1,0], label: 'Open', difficulty: 3.4, notes: [C root, E third, …] }
chordVoicings('F').slice(0, 2).map((v) => v.label);   // ['E-shape barre at fret 1', 'Small barre (strings 4–1)']
chordVoicings('G', { capo: 3 })[0].frets;    // [0,2,2,1,0,0]: an E shape behind the capo
chordVoicings('Cmaj7', { strings: [4, 3, 2, 1], allowOpen: false, top: 'B' });   // chord-melody voicings with B on top
chordVoicings('Am7', { tuning: 'ukulele' })[0].frets;                             // [0,0,0,0]
chordVoicings('D', { tuning: 'drop-d' })[0].frets;                                // [0,0,0,2,3,2]

const box1 = scalePatterns('A', 'minor-pentatonic')[0];        // frets 5–8, shape 'E', fingers 1 4 1 3 1 3 …
box1.notes.map((n) => `${n.string}:${n.fret} ${n.note} ${n.degree} f${n.finger}`);   // dots for a fretboard; colour by degreeNumber(n.degree)
scalePatterns('A', 'minor-pentatonic', { upTheNeck: true }).map((p) => p.minFret);   // [5, 7, 9, 12, 14]
practiceSequence(box1, 'groups-3');                            // 1 2 3, 2 3 4 … as PatternNote[]
rootToRoot(box1, { octaves: 1 }).map((n) => n.note);           // ['A','C','D','E','G','A']
scalePatterns('C', 'major').map((p) => `${p.name} ${p.positionName}`);   // 'C shape Open position', 'A shape 2nd position', …
scalePatterns('G', 'major', { system: '3nps' })[0].notes.length;          // 18

identifyFretted('x32010').symbol;                                // 'C'
suggestCapo(['Bb', 'Eb', 'F', 'Gm'])[0];                          // capo 3, shapes G C D Em
chordChange('C', 'Am')!.tips[0];                                  // 'Keep your middle finger down on string 4, fret 2: it does not move.'
progressionChanges(['G', 'D', 'Em', 'C'], { loop: true }).hardest;   // the C–G change (5.4): the one to practise
stringTargets('drop-d', { a4: 442 });                             // tuner targets;  nearestString(108)  -> string 5, -32 cents
noteAt({ string: 1, fret: 1 }, { context: { tonic: 'F#', scale: 'major' } });   // 'E#4'
positionAtPoint(neckPoint({ string: 3, fret: 7 }));               // { string: 3, fret: 7, stringOffset: 0, onNeck: true } (mm on a 648 mm neck)
planFingering([48, 50, 52, 53, 55, 57, 59, 60]).notes;           // C major in open position, fingers 3 0 2 3 0 2 0 1
placeChord([60, 64])!.positions;                                  // [{ string: 2, fret: 1 }, { string: 1, fret: 0 }]
```
