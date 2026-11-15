/**
 * The chord-type catalog. Only the facts that cannot be computed are typed here: the canonical
 * symbol, the aliases found on real charts, the degree formula, and the prose. Intervals,
 * semitones and quality are derived in `chord.ts`, and the tests check every alias against the
 * symbol parser, so an alias that the parser would read differently cannot survive.
 */

/** Broad family used to group the chord library. */
export type ChordCategory = 'triad' | 'sixth' | 'seventh' | 'extended' | 'altered' | 'added';

/** Hand-authored part of a chord type. */
export interface RawChordType {
  id: string;
  symbol: string;
  name: string;
  /** Degree formula against the major scale, e.g. `1 b3 5 b7`. */
  formula: string;
  aliases: string[];
  category: ChordCategory;
  /** 1 beginner … 4 expert. */
  tier: 1 | 2 | 3 | 4;
  description: string;
}

function def(
  id: string, symbol: string, name: string, formula: string, aliases: string[],
  category: ChordCategory, tier: 1 | 2 | 3 | 4, description: string,
): RawChordType {
  return { id, symbol, name, formula, aliases, category, tier, description };
}

/** Every chord type, grouped by category in teaching order. */
export const RAW_CHORD_TYPES: RawChordType[] = [
  // ── Triads, suspensions, power chord ─────────────────────────────────────────────────────
  def('major', '', 'major', '1 3 5', ['M', 'maj', 'major', 'ma'], 'triad', 1,
    'Bright, stable and complete. The basic sound of settled, happy music and the home chord of every major key.'),
  def('minor', 'm', 'minor', '1 b3 5', ['min', 'mi', 'minor', '-'], 'triad', 1,
    'Darker and more inward than major: sad, serious or tender depending on the tempo. The home chord of every minor key.'),
  def('dim', 'dim', 'diminished', '1 b3 b5', ['°', 'o', 'mb5', 'm(b5)', 'min(b5)'], 'triad', 2,
    'Tense and unstable, two stacked minor thirds. It wants to move, usually up a half step, and sits on the seventh degree of a major key.'),
  def('aug', 'aug', 'augmented', '1 3 #5', ['+', '(#5)', '+5', '5+', 'M#5', 'maj#5'], 'triad', 2,
    'Dreamlike and unresolved, two stacked major thirds. Usually a passing chord whose raised fifth pushes upward into the next chord.'),
  def('5', '5', 'power chord', '1 5', ['(no3)', 'no3', 'omit3'], 'triad', 1,
    'Root and fifth only, neither major nor minor. Thick and clear under distortion; the backbone of rock and punk riffs.'),
  def('sus2', 'sus2', 'suspended second', '1 2 5', ['2'], 'triad', 1,
    'Open and airy: the second replaces the third, so the chord is neither major nor minor. A favourite way to decorate a plain chord.'),
  def('sus4', 'sus4', 'suspended fourth', '1 4 5', ['sus', '4'], 'triad', 1,
    'The fourth replaces the third, creating a gentle tension that likes to fall back to the major or minor chord.'),
  def('sus2sus4', 'sus2sus4', 'suspended second and fourth', '1 2 4 5', ['sus24', 'sus42', 'sus4sus2'], 'triad', 3,
    'Both suspensions at once and no third: a stack of fourths in disguise. Open, modern and deliberately ambiguous.'),
  def('majb5', '(b5)', 'major flat five', '1 3 b5', ['Mb5', 'majb5', '(-5)', '5-'], 'triad', 4,
    'A major third under a lowered fifth. Bright and unsettled at once; usually heard as part of a larger Lydian or dominant chord.'),

  // ── Sixth chords ─────────────────────────────────────────────────────────────────────────
  def('6', '6', 'major sixth', '1 3 5 6', ['M6', 'maj6', 'add6', 'add13'], 'sixth', 2,
    'A major chord with a sweet, slightly nostalgic sixth. A relaxed alternative to maj7 for a home chord in swing, country and early rock and roll.'),
  def('m6', 'm6', 'minor sixth', '1 b3 5 6', ['min6', 'mi6', '-6'], 'sixth', 2,
    'Minor with a bittersweet major sixth on top. The classic home chord of swing and gypsy jazz minor tunes.'),
  def('69', '6/9', 'six-nine', '1 3 5 6 9', ['69', '6add9', 'maj6/9', 'M69', 'M6/9', '6(9)'], 'sixth', 3,
    'Major with both sixth and ninth and no seventh. Rich but completely stable; a favourite final chord in jazz and bossa nova.'),
  def('m69', 'm6/9', 'minor six-nine', '1 b3 5 6 9', ['m69', 'min6/9', '-6/9', '-69', 'm6add9'], 'sixth', 3,
    'A minor sixth chord with an added ninth: dark but lush, a sophisticated resting chord for minor tunes.'),

  // ── Seventh chords ───────────────────────────────────────────────────────────────────────
  def('7', '7', 'dominant seventh', '1 3 5 b7', ['dom7', 'dom'], 'seventh', 1,
    'A major chord with a lowered seventh. The tritone inside it pulls strongly toward the chord a fifth below; it is also the everyday chord of the blues.'),
  def('maj7', 'maj7', 'major seventh', '1 3 5 7', ['M7', 'Maj7', 'ma7', 'MA7', 'major7', 'Δ', 'Δ7', '△', '△7', '^7', 'j7', '7M'], 'seventh', 2,
    'Smooth, warm and a little wistful. The resting chord of jazz, bossa nova and soul ballads.'),
  def('m7', 'm7', 'minor seventh', '1 b3 5 b7', ['min7', 'mi7', '-7', 'minor7', 'MI7'], 'seventh', 2,
    'Mellow and soft-edged, less sad than a plain minor chord. The everyday minor chord of jazz, funk and R&B.'),
  def('mmaj7', 'mMaj7', 'minor major seventh', '1 b3 5 7',
    ['m(maj7)', 'mM7', 'm(M7)', 'minMaj7', 'min(maj7)', 'mi(ma7)', 'm/maj7', 'mΔ7', 'mΔ', '-Δ7', '-Δ', '-maj7', 'm#7', 'm+7', 'm7M'], 'seventh', 3,
    'A minor triad under a major seventh: mysterious and suspenseful, the spy-film chord. The home chord of harmonic and melodic minor.'),
  def('dim7', 'dim7', 'diminished seventh', '1 b3 b5 bb7', ['°7', 'o7'], 'seventh', 3,
    'Minor thirds stacked until the octave is split into four equal parts. Dramatic and restless; any of its notes can act as the root, which makes it a favourite passing and pivot chord.'),
  def('m7b5', 'm7b5', 'half-diminished seventh', '1 b3 b5 b7',
    ['ø', 'ø7', 'min7b5', 'mi7b5', '-7b5', 'm7(b5)', '-7(b5)', 'm7-5', 'm7(5-)'], 'seventh', 3,
    'A diminished triad with a minor seventh. Dark and yearning; the ii chord of a minor key, on its way to the dominant.'),
  def('7sharp5', '7#5', 'augmented seventh', '1 3 #5 b7', ['+7', 'aug7', '7+', '7+5', '7aug', '7(#5)'], 'seventh', 3,
    'A dominant seventh with a raised fifth, which leans upward into the third of the chord it resolves to.'),
  def('maj7sharp5', 'maj7#5', 'augmented major seventh', '1 3 #5 7',
    ['+maj7', 'augmaj7', 'maj7+', 'maj7+5', 'M7#5', 'M7+5', '+M7', 'Δ#5', 'maj7(#5)'], 'seventh', 4,
    'A major seventh over an augmented triad: bright, floating and strange. The III chord of harmonic and melodic minor, at home in modern jazz.'),
  def('7sus4', '7sus4', 'seventh suspended fourth', '1 4 5 b7', ['7sus', 'sus7', '7(4)', '7/4'], 'seventh', 2,
    'A dominant seventh with the fourth in place of the third. Softer than a plain seventh: it floats rather than pushes, and often resolves to the ordinary seventh chord.'),
  def('7sus2', '7sus2', 'seventh suspended second', '1 2 5 b7', [], 'seventh', 3,
    'A seventh chord with the second in place of the third. Open and unresolved; common in funk, fusion and modern pop guitar parts.'),
  def('maj7b5', 'maj7b5', 'major seventh flat five', '1 3 b5 7', ['M7b5', 'ma7b5', 'Δb5', 'maj7(b5)'], 'seventh', 4,
    'A major seventh with a lowered fifth: a glassy Lydian colour, the close cousin of maj7#11.'),
  def('m7sharp5', 'm7#5', 'minor seventh sharp five', '1 b3 #5 b7', ['m7+5', 'min7#5', '-7#5', 'm7(#5)'], 'seventh', 4,
    'A minor seventh with a raised fifth. The ear usually hears it as a major add9 chord a major third lower, with its third in the bass.'),
  def('dimmaj7', 'dimMaj7', 'diminished major seventh', '1 b3 b5 7', ['°Maj7', '°maj7', 'dim(maj7)', 'dimM7', '°M7', '°Δ7'], 'seventh', 4,
    'A diminished triad with a major seventh on top. Very tense; in jazz it often delays a home chord built on the same root.'),

  // ── Extended chords ──────────────────────────────────────────────────────────────────────
  def('9', '9', 'dominant ninth', '1 3 5 b7 9', ['dom9', '7(9)', '7add9'], 'extended', 2,
    'A dominant seventh with a ninth on top. Fuller and funkier than a plain seventh; the signature chord of funk rhythm guitar and jump blues.'),
  def('maj9', 'maj9', 'major ninth', '1 3 5 7 9', ['M9', 'Maj9', 'ma9', 'Δ9', 'maj7(9)', 'maj7add9'], 'extended', 3,
    'Major seventh plus ninth: lush, open and modern. A favourite home chord in neo-soul, jazz and film music.'),
  def('m9', 'm9', 'minor ninth', '1 b3 5 b7 9', ['min9', 'mi9', '-9', 'm7(9)'], 'extended', 3,
    'Minor seventh plus ninth: smooth, deep and a little melancholy. Everywhere in soul, R&B and jazz.'),
  def('mmaj9', 'mMaj9', 'minor major ninth', '1 b3 5 7 9', ['m(maj9)', 'mM9', 'minMaj9', 'mΔ9', '-Δ9'], 'extended', 4,
    'The mysterious minor major seventh with a ninth added: the full home-chord sound of melodic minor.'),
  def('11', '11', 'dominant eleventh', '1 3 5 b7 9 11', ['dom11'], 'extended', 3,
    'On paper a ninth chord with an eleventh. In practice the third is left out because it clashes with the eleventh, which leaves the open, gospel-tinged sound of a major triad placed over a bass note a whole step above its root (B♭ over C for C11).'),
  def('m11', 'm11', 'minor eleventh', '1 b3 5 b7 9 11', ['min11', 'mi11', '-11'], 'extended', 3,
    'Minor ninth plus eleventh. Spacious and floating, with no clash, because the eleventh sits a whole step above the minor third. A modal jazz and neo-soul staple.'),
  def('m7add11', 'm7add11', 'minor seventh add eleven', '1 b3 5 b7 11', ['m7(11)', 'm7add4', 'm7(add11)', 'min7add11', '-7add11'], 'extended', 3,
    'A minor seventh with the eleventh but no ninth. Open strings make it easy on guitar, and it is common in rock and folk.'),
  def('maj7sharp11', 'maj7#11', 'major seventh sharp eleven', '1 3 5 7 #11',
    ['M7#11', 'ma7#11', 'Δ#11', 'Δ7#11', 'maj7(#11)', 'maj7+11', 'maj7#4'], 'extended', 3,
    'A major seventh with a raised eleventh: the bright, shimmering Lydian chord. A common colour for a IV chord or a final chord.'),
  def('maj9sharp11', 'maj9#11', 'major ninth sharp eleven', '1 3 5 7 9 #11', ['M9#11', 'Δ9#11', 'maj9(#11)'], 'extended', 4,
    'The full Lydian sound: a major ninth chord with the raised eleventh. Wide, luminous and cinematic.'),
  def('13', '13', 'dominant thirteenth', '1 3 5 b7 9 13', ['dom13'], 'extended', 3,
    'A dominant ninth with the thirteenth (the sixth, an octave up) on top; the eleventh is left out. Big, bluesy and sophisticated. Guitar voicings usually keep just root, seventh, third and thirteenth.'),
  def('maj13', 'maj13', 'major thirteenth', '1 3 5 7 9 13', ['M13', 'Maj13', 'ma13', 'Δ13'], 'extended', 4,
    'A major ninth chord plus the thirteenth. A very full, sweet home chord; the eleventh is left out, or raised for a Lydian colour.'),
  def('m13', 'm13', 'minor thirteenth', '1 b3 5 b7 9 13', ['min13', 'mi13', '-13'], 'extended', 4,
    'A minor ninth chord with a major thirteenth: the Dorian colour in one chord. The eleventh may be added freely.'),
  def('9sus4', '9sus4', 'ninth suspended fourth', '1 4 5 b7 9', ['9sus', 'sus9'], 'extended', 3,
    'A suspended dominant with a ninth. Warm, open and unresolved; often written as a slash chord such as B♭/C or Gm7/C.'),
  def('13sus4', '13sus4', 'thirteenth suspended fourth', '1 4 5 b7 9 13', ['13sus'], 'extended', 4,
    'A suspended dominant with ninth and thirteenth: the big, glowing sus sound of gospel, fusion and modern jazz.'),
  def('m9b5', 'm9b5', 'half-diminished ninth', '1 b3 b5 b7 9', ['ø9', 'm9(b5)', 'min9b5', '-9b5', 'm7b5(9)'], 'extended', 4,
    'A half-diminished chord with a natural ninth, the sound of the Locrian ♮2 scale. Softer and more modern than a plain m7b5.'),

  // ── Altered dominants ────────────────────────────────────────────────────────────────────
  def('7b5', '7b5', 'seventh flat five', '1 3 b5 b7', ['7-5', '7(b5)'], 'altered', 3,
    'A dominant seventh with a lowered fifth. Edgy and symmetrical: it has the same notes as the 7b5 chord a tritone away, which is why it makes such a smooth tritone substitute.'),
  def('7b9', '7b9', 'seventh flat nine', '1 3 5 b7 b9', ['7-9', '7(b9)', '7(9-)'], 'altered', 3,
    'A dominant seventh with a lowered ninth. Dark and urgent; the classic V chord of a minor key, straight from harmonic minor.'),
  def('7sharp9', '7#9', 'seventh sharp nine', '1 3 5 b7 #9', ['7+9', '7(#9)', '7(9+)'], 'altered', 3,
    'A major third below and what sounds like a minor third on top: gritty, bluesy and aggressive. A staple of blues-rock and funk.'),
  def('7sharp11', '7#11', 'seventh sharp eleven', '1 3 5 b7 #11', ['7+11', '7(#11)'], 'altered', 3,
    'A dominant seventh with a raised eleventh, the Lydian dominant colour. Bright and slightly mischievous; typical of tritone substitutes and dominants that do not resolve.'),
  def('7b13', '7b13', 'seventh flat thirteen', '1 3 5 b7 b13', ['7-13', '7(b13)'], 'altered', 3,
    'A dominant seventh with a lowered thirteenth. A dark, minor-leaning V chord; the natural dominant sound of a minor key.'),
  def('9sharp11', '9#11', 'ninth sharp eleven', '1 3 5 b7 9 #11', ['9(#11)', '9+11'], 'altered', 4,
    'A ninth chord with a raised eleventh. Lydian dominant colour, common on tritone substitutes and on bVII7 chords.'),
  def('13sharp11', '13#11', 'thirteenth sharp eleven', '1 3 5 b7 9 #11 13', ['13(#11)', '13+11'], 'altered', 4,
    'The complete Lydian dominant chord: ninth, raised eleventh and thirteenth. Bright, wide and unresolved.'),
  def('9sharp5', '9#5', 'ninth sharp five', '1 3 #5 b7 9', ['+9', 'aug9', '9+', '9+5', '9(#5)'], 'altered', 4,
    'A ninth chord with a raised fifth, the whole-tone sound. Hazy and floating, yet still a dominant.'),
  def('9b5', '9b5', 'ninth flat five', '1 3 b5 b7 9', ['9-5', '9(b5)'], 'altered', 4,
    'A ninth chord with a lowered fifth. Like 9#5 it lives in the whole-tone scale: weightless and unstable.'),
  def('9b13', '9b13', 'ninth flat thirteen', '1 3 5 b7 9 b13', ['9(b13)', '9-13', '7(9,b13)'], 'altered', 4,
    'A natural ninth with a lowered thirteenth: the Mixolydian ♭6 dominant, bittersweet rather than harsh.'),
  def('13b9', '13b9', 'thirteenth flat nine', '1 3 5 b7 b9 13', ['13(b9)', '13-9'], 'altered', 4,
    'A thirteenth chord with a lowered ninth: sweet on top, dark in the middle. The half-whole diminished scale fits it exactly.'),
  def('13sharp9', '13#9', 'thirteenth sharp nine', '1 3 5 b7 #9 13', ['13(#9)', '13+9'], 'altered', 4,
    'A thirteenth chord with a raised ninth: a funky, bluesy tension stacked on a rich dominant.'),
  def('7b9b13', '7b9b13', 'seventh flat nine flat thirteen', '1 3 5 b7 b9 b13', ['7(b9,b13)', '7b13b9', '7-9-13'], 'altered', 4,
    'Lowered ninth and lowered thirteenth together: the full Phrygian dominant sound for a V chord resolving to minor.'),
  def('7sharp9sharp5', '7#9#5', 'seventh sharp nine sharp five', '1 3 #5 b7 #9',
    ['7#5#9', '+7#9', 'aug7#9', '7+9+5', '7(#9,#5)', '7(#5,#9)'], 'altered', 4,
    'Raised ninth and raised fifth: a tense, biting altered dominant that resolves with great force.'),
  def('7b9sharp5', '7b9#5', 'seventh flat nine sharp five', '1 3 #5 b7 b9', ['7#5b9', '+7b9', 'aug7b9', '7(b9,#5)', '7(#5,b9)'], 'altered', 4,
    'A lowered ninth with a raised fifth. A dark altered dominant that usually resolves to a minor chord.'),
  def('7b9b5', '7b9b5', 'seventh flat nine flat five', '1 3 b5 b7 b9', ['7b5b9', '7(b9,b5)', '7(b5,b9)', '7-9-5'], 'altered', 4,
    'Lowered ninth and lowered fifth. A diminished-scale flavour: tense, symmetrical and ready to resolve.'),
  def('7sharp9b5', '7#9b5', 'seventh sharp nine flat five', '1 3 b5 b7 #9', ['7b5#9', '7(#9,b5)', '7(b5,#9)'], 'altered', 4,
    'A raised ninth over a lowered fifth: bluesy on top, unstable underneath.'),
  def('7b9sharp11', '7b9#11', 'seventh flat nine sharp eleven', '1 3 5 b7 b9 #11', ['7(b9,#11)', '7#11b9'], 'altered', 4,
    'A dominant with a lowered ninth and a raised eleventh, drawn from the half-whole diminished scale.'),
  def('7sharp9sharp11', '7#9#11', 'seventh sharp nine sharp eleven', '1 3 5 b7 #9 #11', ['7(#9,#11)', '7#11#9'], 'altered', 4,
    'Raised ninth and raised eleventh over a complete dominant seventh: another diminished-scale colour.'),
  def('7alt', '7alt', 'altered dominant', '1 3 b7 b9 #9 #11 b13', ['alt', 'alt7'], 'altered', 4,
    'Shorthand for a dominant seventh whose fifth and ninth are both altered. The player chooses which (one altered ninth plus one altered fifth is typical), and every choice comes from the altered scale.'),
  def('7sus4b9', '7sus4b9', 'suspended flat nine', '1 4 5 b7 b9', ['7susb9', '7sus(b9)', '7b9sus', '7b9sus4', 'susb9', 'sus(b9)'], 'altered', 4,
    'A suspended dominant with a lowered ninth: the Phrygian chord. Dark, Spanish-tinged and static.'),

  // ── Added-note chords ────────────────────────────────────────────────────────────────────
  def('add9', 'add9', 'added ninth', '1 3 5 9', ['add2', '(add9)', '(add2)', 'Madd9'], 'added', 2,
    'A major triad with the ninth added and no seventh. Sparkling and open; a pop, rock and folk favourite.'),
  def('madd9', 'madd9', 'minor added ninth', '1 b3 5 9', ['m(add9)', 'madd2', 'm(add2)', 'min(add9)', 'minadd9', '-add9'], 'added', 2,
    'A minor triad with an added ninth. The ninth sits a half step below the minor third, which gives a haunting, aching sound.'),
  def('add11', 'add11', 'added eleventh', '1 3 5 11', ['(add11)'], 'added', 3,
    'A major triad with the eleventh added above it. The eleventh rubs against the third, so it sounds best with the two notes spread apart.'),
  def('add4', 'add4', 'added fourth', '1 3 4 5', ['(add4)'], 'added', 3,
    'A major triad with the fourth added right next to the third. A deliberate, ringing clash that open-string guitar voicings make beautiful.'),
  def('madd11', 'madd11', 'minor added eleventh', '1 b3 5 11', ['m(add11)', 'min(add11)', '-add11'], 'added', 3,
    'A minor triad with an added eleventh: open and folk-like, with no clash at all.'),
  def('addsharp11', 'add#11', 'added sharp eleventh', '1 3 5 #11', ['(add#11)', 'add+11'], 'added', 4,
    'A major triad with a raised eleventh: Lydian brightness without a seventh.'),
  def('mb6', 'mb6', 'minor flat six', '1 b3 5 b6', ['m(b6)', 'min(b6)', '-b6'], 'added', 4,
    'A minor triad with a lowered sixth a half step above the fifth: tense, cinematic and unmistakably Aeolian.'),
];
