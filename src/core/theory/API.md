# `@/core/theory` — music theory engine

Pure functions, no side effects, works in the browser and in Node. Import from the barrel only:
`import { scaleNotes, parseChord, key } from '@/core/theory'`.

**Conventions.** Notes are ASCII strings (`C`, `F#`, `Bb3`, `F##`); display text comes only from
the `format…` functions. MIDI C4 = 60. Intervals `P1 m2 … P8 M9 A11 m13`, descending with a
leading `-`. Degrees `1 b2 2 b3 3 4 #4 b5 5 #5 b6 6 bb7 b7 7 b9 9 #9 11 #11 b13 13`.
Roman numerals take their accidental from the **major** scale in every key, minor keys included:
A minor is `i ii° bIII iv v bVI bVII` (so a bare `VI` there is F#; see `classical` below).
`I6` is a sixth chord, not an inversion.
**Errors.** `parse…` / `get…` / `identify…` return `null` (or `[]`) for bad input. The short
accessors `note() interval() chord() key() roman()` and every computing function throw `RangeError`.
Wherever a chord, scale or key is expected you may pass its string or the parsed object.

## Notes — `note.ts`
```ts
parseNote(s): Note | null      note(s): Note      isNote(s): boolean      // 'C#b' (mixed accidentals) is not a note
// Note = { name, pcName, letter, step, alt, accidental, octave|null, chroma, midi|null, fifths }
noteToMidi(name, defaultOctave = 4): number        chroma(nameOrMidi): number        pcName('F#4'): 'F#'
midiToNote(midi, { prefer?: 'sharps'|'flats'|'auto', octave? }): string      // 61 -> 'Db4' (no key context)
pcToNote(pc, prefer = 'auto'): string              withOctaveFor('B#', 60): 'B#3'
pitchClassMask(['C','E',67]): number               // 12-bit mask, bit 0 = C; test with mask & (1 << midi % 12)
enharmonics('C#'): ['Db', 'B##']   simplifyNote('E#'): 'F'   enharmonicEqual(a, b): boolean
formatNote(name, { system?: 'letters'|'solfege'|'german', ascii?, octave?, natural?, doubles?: 'glyph'|'repeat' })
//   'F#4' -> 'F♯4' | 'Fa♯4' ; german: 'B' -> 'H', 'Bb' -> 'B'.   germanNoteName('F#'): 'Fis'
formatNotes(names[], opts): string[]               formatDegree('b3'): '♭3'
formatAccidental(alt): '♯' | '♭' | '𝄪' | '𝄫' | ''        prettyAccidentals('Dorian b2'): 'Dorian ♭2'
noteSlug('F#'): 'f-sharp'   noteFromSlug('bb'): 'Bb'      // same result as the router's slug()
spellPc(pc, centerFifths)   noteFromFifths(n)   fifthsOf(name)   noteName(step, alt, octave?)   LETTERS   NATURAL_SEMITONES
```

## Intervals — `interval.ts`
```ts
parseInterval(s): Interval | null    interval(s): Interval    // { name, quality, number, steps, semitones, direction, simple, compound }
semitones('P5'): 7                   transpose('C#', 'M3'): 'E#'          transpose('C4', '-m3'): 'A3'
intervalBetween('C', 'Eb'): 'm3'     intervalBetween('E4', 'C4'): '-M3'   // exact and signed when both have octaves
invertInterval('M3'): 'm6'   addIntervals(a, b)   subtractIntervals(a, b)   simplifyInterval('M9'): 'M2'   isCompound(s)
intervalName('m3'): 'minor third'    consonance('M3'): 'perfect' | 'imperfect' | 'dissonant'
degreeToInterval('b3'): 'm3'         intervalToDegree('A4'): '#4'         isDegree(s)
semitonesToInterval(6, { tritone?: 'A4'|'d5' })   semitonesToDegree(3): 'b3'   intervalFromSteps(steps, semis)
transposeBySemitones('B3', 1, prefer?): 'C4'      enharmonicIntervals('A4', 'd5'): true
SIMPLE_INTERVALS   CHROMATIC_DEGREES   // ['1','b2','2','b3','3','4','#4','5','b6','6','b7','7'] by semitone
```

## Chords — `chord.ts` (69 types)
```ts
CHORD_TYPES: ChordType[]   // { id, symbol, name, aliases, intervals, degrees, semitones, category, quality, description, tier 1–4, custom }
//   ids are route-safe: major minor dim aug 5 sus2 sus4 6 m6 69 7 maj7 m7 mmaj7 dim7 m7b5 7sharp5 9 maj9 m9 11 13 7b9 7sharp9 7alt add9 …
//   category: triad | sixth | seventh | extended | altered | added;  quality: major | minor | dominant | diminished | half-diminished | augmented | suspended | power
getChordType('maj7' | 'M7' | 'Δ' | '7#9' | '7sharp9'): ChordType | null
filterChordTypes({ category?, quality?, tier?, maxTier?, size? })     searchChordTypes(text)
parseChord(symbol, { german? }): Chord | null     chord(symbol): Chord     isChord(s)     isNoChord('N.C.')     NO_CHORD
// Chord = { symbol, root, type, bass|null, notes, inversion|null }
// Reads what charts and tab sites write: F#m7b5/A  C-7  CΔ9  CMI(MA7)  Bø7  E°7  G+  A7(#9)  Gsus  C6/9  Calt  D/f#
//   C7M (= Cmaj7)  Bm7(5-)  E7(9-/13-)  G7/4 (= G7sus4)  Cm+7 (= CmMaj7)  Csusb9 (= C7sus4b9)  Fmaj7#4  C⁷  B♭m7
// An accidental right after the root letter belongs to the root: 'Cb5' is a Cb power chord; write 'C(b5)'.
// Roots are upper case ('c', 'am' -> null). Symbols the catalog lacks still parse (type.custom = true):
//   'C7no5', 'C13sus4b9'. Symbols that name one pitch twice are refused: 'Cm7#9', 'C7b5#11', 'C77'.
normalizeChordSymbol('C-7'): 'Cm7'                buildChord('F#', 'm7b5', bass?): Chord
formatChord('Bbm7b5/Ab', { jazz?, system?, ascii? }): 'B♭m7♭5/A♭'    // jazz: 'C△7', 'Bø7'
chordNotes('F#m7b5'): ['F#','A','C','E']           chordNotes('C/E', { withBass: true })    chordPcs(c)
chordMidi('C9', { octave: 3 }): [48,52,55,58,62]   chordNotesFrom('C9', 3): ['C3','E3','G3','Bb3','D4']
chordTones(c): ChordTone[]   // { note, interval, degree, role, altered, priority (1 keep … 5 drop first), omittable }
omittableTones('C13'): 5 then 9          voicingTones('C13', 4): root, 3, b7, 13
identifyChords(namesOrMidi, { prefer?, spell?: (pc) => name, limit?, allowPartial? }): ChordMatch[]   identifyChord(...): string | null
//   ChordMatch = { symbol, chord, score, kind: 'exact'|'partial'|'slash', omitted }.  ['E','G','C'] -> 'C/E';  [40,47,52,56,59,64] -> 'E'
//   Names: first is the bass. MIDI or octave names: lowest is the bass, and the bass settles ambiguity
//   (C E G A -> C6, A C E G -> Am7; any note of an augmented or dim7 chord can be its root).
//   'partial' = the 5th or a lesser tension is missing; a bare third is a triad without its 5th (C+E -> 'C').
//   For MIDI input in a song, pass spell: (pc) => spellInKey(pc, key) so roots follow the key (Gb, not F#).
chordInversions('Cmaj7'): ['Cmaj7','Cmaj7/E','Cmaj7/G','Cmaj7/B']       invertChord('C', 1): 'C/E'
transposeChord('Am7/G', 'M2'): 'Bm7/A'             transposeChordBySemitones('Am', 4): 'C#m'
relativeChord('C'): 'Am'   parallelChord('C'): 'Cm'   tritoneSubstitute('G7'): 'Db7'   isDominant(c)   // null when not applicable
chordTypeFromIntervals(intervals)   chordTypeFromSemitones(semis)   // names any pitch set (not both sevenths at once)
chordSlug('F#m7b5'): 'f-sharp-m7b5'   chordFromSlug('bb-maj7'): Chord | null        // route params; catalog types only
```

## Scales — `scale.ts` (89 scales)
```ts
SCALES: ScaleType[]    SCALE_FAMILIES    // family: diatonic | melodic-minor | harmonic-minor | harmonic-major | double-harmonic | pentatonic | blues | bebop | symmetric | exotic
// ScaleType = { id, name, aliases, family, intervals, degrees, semitones, steps, stepPattern ('W','H','WH','2W'), size, mask,
//               parent|null, mode|null, description, uses, genres, chords (chord-type ids), quality, tier 1–4, tags }
// ids: major dorian phrygian lydian mixolydian minor locrian melodic-minor harmonic-minor phrygian-dominant altered lydian-dominant
//      major-pentatonic minor-pentatonic minor-blues major-blues whole-tone diminished-half-whole hirajoshi double-harmonic …
getScale('dorian' | 'Natural Minor' | 'super locrian' | 'Ukrainian Dorian' | 'Kafi'): ScaleType | null
filterScales({ family?, quality?, tier?, maxTier?, size?, tags?, chord?, isMode? })     searchScales('pentatonic')
scaleNotes('F#', 'major'): ['F#','G#','A#','B','C#','D#','E#']       scaleNotes('E2', 'minor-pentatonic', { closed: true })
simplestTonic('A#' | pc, scale): 'Bb'    // the tonic spelling with the fewest accidentals; scaleNotes never respells a tonic itself
scalePcs(tonic, scale)   scaleMidi(40, 'minor', octaves = 1)   scaleContains(tonic, scale, noteOrMidi)
degreeInScale('A', 'minor', 'C'): 'b3'  ({ chromatic: true } names outside notes too)    spellInScale('F#', 'major', 5): 'E#'
scaleModes('major'): { mode, intervals, degrees, scale|null }[]
relativeScales('C', 'major')   // D dorian … A minor (same notes)      parallelScales('C', 'major')   // C dorian … (same tonic)
scalesContaining(['A','C','D','E','G'], { tonic?, exact?, maxTier?, family?, size?, limit? }): { tonic, scale, notes, extra }[]
scalesForChord('G7', { maxTier?, limit?, strict? }): { tonic, scale, notes, score, fit: 'primary'|'compatible'|'colour', avoid, tensions, missing }[]
compareScales('minor', 'dorian'): { shared, onlyA, onlyB, changes: [{ number: 6, a: 'b6', b: '6' }], summary }
similarScales('dorian', { limit?, maxTier?, sameSize? }): ScaleType[]     // nearest first, for quiz distractors
harmonizeScale('C', 'major', { sevenths? }): { degree, degreeLabel, roman, root, symbol, type, notes }[]   // seven-note scales only
chordFitsScale('E7', scaleNotes('A', 'harmonic-minor')): true    // built in the scale, not just sounding like it ('Fm' -> false)
scaleSlug('F#', 'dorian'): 'f-sharp-dorian'   parseScaleSlug('a-minor'): { tonic: 'A', scale } | null    // route params
```

## Keys — `key.ts`
```ts
getKey('A minor' | 'F#m' | 'Bb' | 'key of G' | 'fis-Moll' | 'f-sharp-minor' | { tonic, mode }): Key | null      key(x): Key      parseKey(s)
// Key = { id, name, short, tonic, mode, fifths, signature: { fifths, type, count, accidentals }, scale,
//         harmonicMinor|null, melodicMinor|null, relative, parallel, theoretical }
MAJOR_KEYS  MINOR_KEYS  ALL_KEYS (15 + 15)    majorKey(t)   minorKey(t)   keySignature(fifths)
keyFromSignature(3): A major    keyFromSignature(-3, 'minor'): C minor    keysWithSignature(fifths): { major, minor }
relativeKey(k)   parallelKey(k)   enharmonicKey('F#'): Gb major | null   practicalKey('G# major'): Ab major
neighborKeys(k): { dominant, subdominant, relative, parallel, dominantRelative, subdominantRelative }   closelyRelatedKeys(k)
circleOfFifths(): { index, angle, major: Key[], minor: Key[], pc }[]     // 12 slots clockwise from C; B/Cb, F#/Gb, Db/C# doubled
keyScale(k, 'natural'|'harmonic'|'melodic')
diatonicChords(k, { sevenths?, minor?: 'natural'|'harmonic'|'melodic' }): (ScaleChord & { function, variant })[]
//   function: 'tonic' | 'subdominant' | 'dominant' (table: DEGREE_FUNCTIONS).  `k` is a KeyInput: string | { tonic, mode } | Key
keyChords(k, { sevenths? })   // minor keys: natural-minor chords plus the major V and the diminished vii
spellInKey(66, 'Gb major'): 'Gb4'    spellInKey(6, 'G'): 'F#'    accidentalPreference(k): 'sharps' | 'flats'
//   outside notes lose double accidentals (b6 of Gb -> 'D') unless { strict: true }; the key's own (F## in G# minor) stay
degreeInKey('Eb', 'C'): 'b3'   noteAtDegree('Eb major', 'b7'): 'Db'   inKey(note, k, variant?)   chordInKey('Dm7', 'C')
detectKey(chordsOrNotes, { as?: 'chords'|'notes'|'auto', limit?, weights? }): { key, score, confidence }[]
detectKeyFromChords(['Dm7','G7','Cmaj7'], { weights? })   detectKeyFromNotes(['C4','E4',…] | midi[])   detectBestKey(x): Key | null
//   'auto' reads strings as chord symbols unless they carry octaves; relative keys often rank first and second.
//   weights = durations, one per item. A blues (I7 IV7 V7) is heard in the key of its I chord.
```

## Harmony — `roman.ts`, `harmony.ts`
```ts
parseRoman('V7/ii'): RomanNumeral | null    roman(s)    isRoman(s)    formatRoman('bVII'): '♭VII'
// { text, degree, alt, interval, type, target|null, substitute }.  Reads I ii vii° V7 bVII iiø7 vii°7 III+ Imaj7 V/V V7/ii bII (N) subV7 IIm7
romanFor('b7', chordType): 'bVII'           splitProgression('I–V–vi–IV' | 'C - G - Am - F'): string[]
romanToChord('V7/ii', 'C'): 'A7'            progressionToChords('ii V I', 'Bb'): ['Cm','F','Bb']
progressionToChords('i–VI–III–VII', 'A minor', { classical: true }): ['Am','F','C','G']   // classical minor-key numerals
romanFromClassicalMinor('VI'): 'bVI'        romanToClassicalMinor('bVI'): 'VI'            // for input / display in that style
chordToRoman('A7', 'C', { next? }): RomanAnalysis
// { chord, roman: 'V7/ii', literal: 'VI7', relation, function|null, variant, borrowedFrom, target, targetChord, explanation }
// relation: diatonic | altered-dominant | secondary-dominant | secondary-leading-tone | borrowed | neapolitan | tritone-substitute | chromatic
// next (the following chord, or null at the end) only matters for I7: 'V7/IV' before IV, else the blues home chord 'I7'.
analyzeProgression('C G Am F' | string[], key?): { key, keyConfidence, chords, romans } | null   // detects the key if omitted
transposeProgression(['C','Am','F','G7'], 'C', 'Eb'): ['Eb','Cm','Ab','Bb7']
modalInterchange('C', { sevenths? }): { roman, symbol, root, type, notes, sources }[]     // Cm Ddim Eb Fm Gm Ab Bb Db …
secondaryDominants('C'): { roman: 'V7/ii', symbol: 'A7', target: 'ii', targetChord: 'Dm' }[]
tritoneSubstitutes('C'): { roman: 'subV7', symbol: 'Db7', target, targetChord, replaces: 'V7', replacesChord: 'G7' }[]
classifyCadence(['G7','C'], key?): { type: 'authentic'|'plagal'|'half'|'deceptive', name, romans, inverted, description } | null
nextChords('G7' | 'V7', 'C', { sevenths?, limit? }): { roman, chord, probability, reason }[]
```

## Lookup — `lookup.ts` (fretboards, keyboards: one array read per note)
```ts
scaleToneMap('A', 'minor-pentatonic'): ToneMap      chordToneMap('E7#9'): ToneMap      // cached and frozen
// ToneMap = { kind, root, rootPc, mask (absolute, bit 0 = C), tones (members in order), byPc[12], bassPc|null }
// ToneInfo = { pc, note, degree, interval, semitones, member, index }   // outside notes: member false, index -1, spelled against the root
toneAt(map, midiOrPc): ToneInfo     hasTone(map, midiOrPc): boolean     spellWith(map, 65, { octave? }): 'E#4'
```

## Display — `display.ts` (the naming setting applied to whole scales, chords and keys)
```ts
formatScaleName('Bb', 'lydian-sharp-2', opts): 'B♭ Lydian ♯2'     formatScaleNotes('F', 'major', { system: 'german' }): ['F','G','A','B','C','D','E']
formatScaleDegrees('dorian'): ['1','2','♭3','4','5','6','♭7']      formatChordNotes('Bbm7b5', opts)     formatChordDegrees('C7#9')
formatKey('Bb minor', { short?, system? }): 'B♭ minor' | 'B♭m'     formatKeySignature('A major'): ['F♯','C♯','G♯']
formatChords(['C','N.C.','F#m7b5','??'], opts): ['C','N.C.','F♯m7♭5','??']    // never throws; opts = FormatNoteOptions (+ jazz)
```

## Exercises — `exercise.ts` (deterministic: shuffle in the generator, not here)
```ts
intervalsFrom('F#', { intervals?, descending? }): { interval, name, note, semitones, degree }[]   // P1 F# … A4 B#, d5 C … P8 F#
checkSpelling('F', 'E#'): 'correct' | 'enharmonic' | 'wrong' | 'invalid'
checkSpellings(answers[], expected[], { ordered? = true }): { verdicts, correct, pitchesCorrect, missing, extra }
distractorNotes('F#', { count? = 3, exclude?, enharmonic?, pool? }): ['F','G','G#']    // enharmonic: true offers F for E#
distractorIntervals('M3', { count?, exclude?, enharmonic? }): ['m3','P4','m6']
similarChordTypes('maj7', { limit?, maxTier?, sameSize? }): ChordType[]                // and similarScales, above
```

## Rhythm — `rhythm.ts`
```ts
PPQ = 960       NOTE_VALUES    noteValue('quarter' | 4): { id, name, british, restName, denominator, ticks, beats, flags } | null
durationTicks('eighth', { dots?: 1, tuplet?: 3 | [3, 2] }): number    dottedTicks(ticks, dots)    tupletTicks(ticks, tuplet)
ticksToDuration(1440): { value: 'quarter', dots: 1 } | null           splitDuration(2400): [{ value: 'half' }, { value: 'eighth' }]
parseTimeSignature('4/4' | '6/8' | '7/8' | 'C' | 'cut' | '3+2+2/8' | [n, d], { grouping? }): TimeSignature | null
// { numerator, denominator, text, kind: 'simple'|'compound'|'odd', unitTicks, barTicks, grouping, beats, beatTicks, accents }
barCapacity('6/8'): 2880    beatPositions('6/8'): [0, 1440]    barFill(ticks[], ts)    tickToBar(tick, ts)
SWING = { straight, light, triplet, hard }    swingPair(): [640, 320]    swingTick(480): 640    swingRatioFromPercent(66.7)
TEMPO_MARKINGS    tempoMarking(120): { name: 'Allegro', meaning, min, max }    tempoRange('andante')
ticksToSeconds(ticks, bpm)    secondsToTicks(seconds, bpm)
```

## Staff — `staff.ts`
```ts
staffPosition('E2', { clef?: 'treble'|'bass', guitar?: boolean = true }): StaffPosition
// { position (0 = bottom line, 8 = top line), onLine, ledgerLines (+above / -below), ledgerPositions, written, accidental, stem }
// guitar: true (default) treats the note as sounding pitch and writes it an octave up: E2 -> position -7, three ledger lines below.
noteAtStaffPosition(0, { clef?, guitar?, fifths? }): 'E3'    staffPositionOfMidi(40, 'E')
keySignaturePositions(2): [8, 5]    guitarStaffRange(frets = 22): { low, high, lowNote, highNote }
```

## Gotchas
- Scale id `minor` is natural minor; the blues scale is `minor-blues`. The major triad's type id is `major`, its symbol is `''`.
- `chord.notes` never includes a slash bass; use `chordNotes(c, { withBass: true })` or `chordPcs(c)`.
- `spellInKey(n, key)`: 0–11 is read as a pitch class (no octave in the result), anything higher as a MIDI number.
- Double sharps are `##` in data (`F##`); `x` and the Unicode signs are accepted on input only.
- Spelling is exact: `scaleNotes('B#', 'lydian-augmented')` contains `F###`. When the app picks the tonic, ask `simplestTonic` first.
- For a chord's own notes use the chord (`chordToneMap`, `chordNotes`), not `spellInKey`: the third of D#7 is F##, whatever the key shows.
- `7alt` has a fixed catalog spelling (1 3 b7 b9 #9 #11 b13) but means "choose"; all its tensions are `omittable`.
- `identifyChords` may name a rare chord as the everyday chord it inverts (`E G B C` -> `Cmaj7/E`, with `Emb6` further down).
- Key detection cannot decide a loop of bare power chords or a two-chord vamp with certainty; read `confidence`.

## Examples
```ts
import { scaleNotes, getScale, chordTones, identifyChord, key, diatonicChords, chordToRoman, scalesForChord, scaleToneMap, toneAt,
         formatNote, formatChord, formatScaleNotes, spellInKey, analyzeProgression } from '@/core/theory';

scaleNotes('G#', 'harmonic-minor');             // ['G#','A#','B','C#','D#','E','F##']
getScale('phrygian-dominant')!.degrees;         // ['1','b2','3','4','5','b6','b7']
chordTones('E7#9').map((t) => `${t.note} ${t.role}`);   // 'E root', 'G# third', 'B fifth', 'D seventh', 'F## ninth'
identifyChord([45, 52, 55, 60, 64]);            // 'Am7'  (the open Am7 shape, MIDI numbers)
diatonicChords('A minor', { minor: 'harmonic' }).map((c) => `${c.roman} ${c.symbol}`);   // 'i Am', 'ii° Bdim', 'bIII+ Caug', … 'V E', 'vii° G#dim'
chordToRoman('Bb', 'C').explanation;            // 'Borrowed from the parallel minor (C natural minor).'
scalesForChord('G7')[0].scale.name;             // 'Mixolydian'
analyzeProgression('Am F C G')!.romans;         // ['i','bVI','bIII','bVII']  (key detected: A minor)

// A fretboard: one cached table per scale, one array read per fret.
const map = scaleToneMap('A', 'minor-pentatonic');
const t = toneAt(map, stringMidi + fret);       // { note: 'C', degree: 'b3', member: true, index: 1, … }
formatNote(t.note, { system: settings.naming }); // 'C' | 'Do'

// Labels in the reader's naming system (german: B natural is 'H', B flat is 'B').
formatNote(spellInKey(midi, key('Eb major')), { system: settings.naming, octave: false });   // 'A♭' | 'La♭', never G♯
formatScaleNotes('Bb', 'major', { system: 'solfege' });      // ['Si♭','Do','Re','Mi♭','Fa','Sol','La']
formatChord('F#m7b5/A');                                     // 'F♯m7♭5/A'
```
