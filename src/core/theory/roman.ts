/**
 * Roman numerals: parsing and formatting only. Turning a numeral into a chord in a key (and back)
 * lives in `harmony.ts`.
 *
 * One convention everywhere, in major and minor keys alike: the numeral's accidental is measured
 * against the **major** scale of the tonic, exactly like degree labels. So the chords of A minor
 * are `i ii° bIII iv v bVI bVII`, and a borrowed chord looks the same in C major as it does at
 * home in C minor (`bVI` is A flat major in both). Upper case means a major third, lower case a
 * minor third. The suffix is a chord quality, not a figured-bass inversion: `I6` is a sixth chord.
 *
 * Canonical text: `I ii iii IV V vi vii° V7 bVII iiø7 vii°7 III+ Imaj7 V/V V7/ii subV7`.
 */
import { CHORD_TYPES, parseChord, type ChordType } from './chord';
import { degreeToInterval } from './interval';
import { formatAccidental, type FormatNoteOptions } from './note';

/** A parsed roman numeral. */
export interface RomanNumeral {
  /** Canonical text: `bVII`, `iiø7`, `V7/V`, `vii°7`, `subV7/ii`. */
  text: string;
  /** Scale degree 1–7 of the chord root. */
  degree: number;
  /** Alteration of that degree against the major scale: -1 for `b`, +1 for `#`. */
  alt: number;
  /** Interval from the tonic to the root (`m7` for `bVII`). For an applied chord it is measured from the target's root. */
  interval: string;
  type: ChordType;
  /** For applied chords (`V7/ii`, `vii°7/V`), the numeral after the slash. */
  target: RomanNumeral | null;
  /** True for `subV…`: the tritone substitute of a dominant, a half step above its target. */
  substitute: boolean;
}

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

function accidentals(alt: number): string {
  return alt >= 0 ? '#'.repeat(alt) : 'b'.repeat(-alt);
}

/** Case and suffix that write a chord type after a numeral (`m7b5` -> lower case + `ø7`). */
function romanSuffix(type: ChordType): { upper: boolean; suffix: string } {
  const s = type.symbol;
  if (s.startsWith('dimMaj')) return { upper: false, suffix: `°maj${s.slice(6)}` };
  if (s.startsWith('dim')) return { upper: false, suffix: `°${s.slice(3)}` };
  if (s.startsWith('m7b5')) return { upper: false, suffix: `ø7${s.slice(4)}` };
  if (s.startsWith('mMaj')) return { upper: false, suffix: `maj${s.slice(4)}` };
  if (s.startsWith('m') && !s.startsWith('maj')) return { upper: false, suffix: s.slice(1) };
  if (s.startsWith('aug')) return { upper: true, suffix: `+${s.slice(3)}` };
  return { upper: true, suffix: s };
}

/**
 * Write a roman numeral for a degree label and a chord type: (`b7`, major) -> `bVII`,
 * (`2`, m7b5) -> `iiø7`, (`5`, 7) -> `V7`.
 */
export function romanFor(degreeLabel: string, type: ChordType): string {
  const m = /^([b#]*)([1-7])$/.exec(degreeLabel);
  if (!m) throw new RangeError(`Not a scale degree for a roman numeral: "${degreeLabel}"`);
  const { upper, suffix } = romanSuffix(type);
  const numeral = NUMERALS[parseInt(m[2], 10) - 1];
  return `${m[1]}${upper ? numeral : numeral.toLowerCase()}${suffix}`;
}

const ROMAN_RE = /^(sub)?([b#]*)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/;
const DOMINANT_SEVENTH = CHORD_TYPES.find((t) => t.id === '7')!;
const MAJOR_TRIAD = CHORD_TYPES.find((t) => t.id === 'major')!;

function typeFromSuffix(upper: boolean, suffix: string): ChordType | null {
  // A numeral letter left over ("viii", "IIII"), or a slash with no numeral after it ("IV/5"),
  // means the text was never a numeral.
  if (/^[ivIV/]/.test(suffix)) return null;
  let chordSuffix = suffix;
  if (!upper) {
    const alreadyMinor = /^(°|ø|o(?=\d|$|maj)|dim|hdim|m(?!aj)|-)/.test(suffix);
    if (!alreadyMinor) chordSuffix = `m${suffix}`;
  }
  return parseChord(`C${chordSuffix}`)?.type ?? null;
}

function parseSingle(text: string): Omit<RomanNumeral, 'target' | 'text'> & { text: string } | null {
  if (/^N6?$/.test(text)) {
    // The Neapolitan chord: a major triad on the lowered second degree.
    return { text: 'bII', degree: 2, alt: -1, interval: 'm2', type: MAJOR_TRIAD, substitute: false };
  }
  const m = ROMAN_RE.exec(text);
  if (!m) return null;
  const substitute = m[1] === 'sub';
  const numeral = m[3];
  const upper = numeral === numeral.toUpperCase();
  const degree = NUMERALS.indexOf(numeral.toUpperCase()) + 1;
  const alt = (m[2].match(/#/g) ?? []).length - (m[2].match(/b/g) ?? []).length;
  if (Math.abs(alt) > 2) return null;
  if (substitute) {
    if (degree !== 5 || !upper || alt !== 0) return null;
    const type = m[4] === '' ? DOMINANT_SEVENTH : typeFromSuffix(true, m[4]);
    if (!type) return null;
    return { text: `subV${type.symbol}`, degree: 2, alt: -1, interval: 'm2', type, substitute: true };
  }
  const type = typeFromSuffix(upper, m[4]);
  if (!type) return null;
  const label = `${accidentals(alt)}${degree}`;
  return { text: romanFor(label, type), degree, alt, interval: degreeToInterval(label), type, substitute: false };
}

/**
 * Parse a roman numeral: `I`, `ii`, `vii°`, `V7`, `bVII`, `iiø7`, `vii°7`, `V/V`, `V7/ii`,
 * `bII` (also `N`), `subV7`, `IVmaj7`, `III+`. Jazz-style capitals with a quality (`IIm7`,
 * `VIIø7`) are accepted and normalised. Null when the text is not a numeral.
 */
export function parseRoman(input: string): RomanNumeral | null {
  if (typeof input !== 'string') return null;
  const text = input.trim().replace(/♭/g, 'b').replace(/♯/g, '#').replace(/º/g, '°');
  if (!text) return null;
  const slash = text.lastIndexOf('/');
  if (slash > 0) {
    const target = parseSingle(text.slice(slash + 1));
    const own = target && !target.substitute ? parseSingle(text.slice(0, slash)) : null;
    if (target && own) {
      const targetNumeral: RomanNumeral = { ...target, target: null };
      return { ...own, text: `${own.text}/${target.text}`, target: targetNumeral };
    }
  }
  const single = parseSingle(text);
  return single ? { ...single, target: null } : null;
}

const LOWERED_IN_MINOR = new Set([3, 6, 7]);

function isDiminishedType(type: ChordType): boolean {
  return type.quality === 'diminished' || type.quality === 'half-diminished';
}

function respellMinorKeyNumeral(part: string, toClassical: boolean): string | null {
  const rn = parseSingle(part);
  if (!rn) return null;
  if (rn.substitute || !LOWERED_IN_MINOR.has(rn.degree)) return rn.text;
  // The leading-tone and raised-submediant diminished chords are written vii° and vi° in both styles.
  const raisedDiminished = isDiminishedType(rn.type) && rn.degree !== 3;
  let alt = rn.alt;
  if (toClassical) {
    if (alt === -1 && !raisedDiminished) alt = 0;
    else if (alt >= 0 && !(alt === 0 && raisedDiminished)) alt += 1;
  } else if (alt === 0 && !raisedDiminished) {
    alt = -1;
  } else if (alt > 0) {
    alt -= 1;
  }
  return romanFor(`${accidentals(alt)}${rn.degree}`, rn.type);
}

function respellMinorKey(input: string, toClassical: boolean): string | null {
  const text = input.trim().replace(/♭/g, 'b').replace(/♯/g, '#').replace(/º/g, '°');
  const slash = text.lastIndexOf('/');
  if (slash > 0) {
    // Only the target of an applied chord is a degree of the key: V7/III -> V7/bIII.
    const target = respellMinorKeyNumeral(text.slice(slash + 1), toClassical);
    const own = target ? parseSingle(text.slice(0, slash)) : null;
    if (target && own) return `${own.text}/${target}`;
  }
  return respellMinorKeyNumeral(text, toClassical);
}

/**
 * Translate a numeral written the classical way for a **minor** key into this module's
 * convention. Classical harmony counts III, VI and VII from the minor scale, so in A minor
 * `VI` is F major; here that chord is `bVI`. `III VI VII` -> `bIII bVI bVII`, `III+` -> `bIII+`,
 * `V7/III` -> `V7/bIII`, `#vi°` and `#vii°` -> `vi°` and `vii°`; `i iv V vii° bII` are the same
 * in both. Null when the text is not a numeral. Only use it for minor keys.
 */
export function romanFromClassicalMinor(numeral: string): string | null {
  return respellMinorKey(numeral, false);
}

/**
 * The reverse of `romanFromClassicalMinor`, for showing a minor-key analysis the way classical
 * textbooks print it: `bVI` -> `VI`, `bIII+` -> `III+`, `vii°` stays, and a chord on the raised
 * degree (`vi` = F#m in A minor) gains a sharp (`#vi`). Null when the text is not a numeral.
 */
export function romanToClassicalMinor(numeral: string): string | null {
  return respellMinorKey(numeral, true);
}

/** Parse a roman numeral, throwing a RangeError when it is invalid. */
export function roman(input: string | RomanNumeral): RomanNumeral {
  if (typeof input !== 'string') return input;
  const rn = parseRoman(input);
  if (!rn) throw new RangeError(`Not a roman numeral: "${input}"`);
  return rn;
}

/** True when the text parses as a roman numeral. */
export function isRoman(input: string): boolean {
  return parseRoman(input) !== null;
}

/** Display text with music symbols: `bVII` -> `♭VII`, `iiø7b9`-style suffixes get ♭ and ♯ too. */
export function formatRoman(input: string | RomanNumeral, opts: Pick<FormatNoteOptions, 'ascii' | 'doubles'> = {}): string {
  const text = roman(input).text;
  if (opts.ascii) return text;
  return text
    .split('/')
    .map((part) => {
      const m = /^(sub)?([b#]*)([IViv]+)(.*)$/.exec(part);
      if (!m) return part;
      const alt = (m[2].match(/#/g) ?? []).length - (m[2].match(/b/g) ?? []).length;
      const suffix = m[4].replace(/#/g, formatAccidental(1, opts)).replace(/b/g, formatAccidental(-1, opts));
      return `${m[1] ?? ''}${alt === 0 ? '' : formatAccidental(alt, opts)}${m[3]}${suffix}`;
    })
    .join('/');
}

/**
 * Split a progression written as text into its symbols. Works for numerals and for chord names:
 * `I–V–vi–IV`, `ii V I`, `I | IV | V7`, `C - G - Am - F`, `Dm7->G7->Cmaj7`. A hyphen only
 * separates when a numeral or a chord root follows it, so `C-7` and `G7-9` stay whole.
 */
export function splitProgression(text: string): string[] {
  return text
    .split(/\s*->\s*|[\s|,;–—→>]+|-(?=\s*(?:(?:sub)?[b#♭♯]*[IViv]|[A-G]|N\.?C|N6?(?:\s|$|-)))/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
