/**
 * Plain words for the jam, for a learner who has not met roman numerals or modes yet: a beginner
 * (or anyone still in Mia's course, before Dev's). Numerals are left out (the home chord is called
 * the home chord), and a scale or key with a mode name is described by its notes: "A minor with
 * G♯" for A harmonic minor, "E minor with C♯" for E Dorian. Pure.
 */
import { TONALITY_NAME, type HomeKey } from '@/content/progressions';
import type { ProgressState } from '@/core/progress';
import { chroma, formatNote, formatScaleName, scaleNotes, type NoteNaming } from '@/core/theory';

/**
 * True when the jam should speak in plain words: the learner said they are a beginner, or they are
 * taking Mia's course, and they have not started Dev's or Prof. Varga's (where numerals and modes
 * are everyday words).
 */
export function needsPlainWords(state: Pick<ProgressState, 'profile' | 'skills'>): boolean {
  let mia = false;
  for (const [id, skill] of Object.entries(state.skills)) {
    if (!skill || !(skill.attempts > 0 || skill.completed)) continue;
    if (id.startsWith('teacher:dev:') || id.startsWith('teacher:elena:')) return false;
    if (id.startsWith('teacher:mia:')) mia = true;
  }
  return state.profile.experience === 'beginner' || mia;
}

function name(note: string, naming: NoteNaming): string {
  try {
    return formatNote(note, { system: naming, octave: false });
  } catch {
    return note;
  }
}

/** "A, B and C" */
function list(items: string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * A seven-note scale as a major or minor scale with one or two notes changed ("A minor with G♯",
 * "G major with F"), or null when it is not that close to either.
 */
function nearMajorOrMinor(tonic: string, scale: string, naming: NoteNaming): string | null {
  let notes: string[];
  try {
    notes = scaleNotes(tonic, scale);
  } catch {
    return null;
  }
  if (notes.length !== 7) return null;
  // The third decides which to try first: a minor third reads as minor, a major one as major.
  const minorThird = (chroma(notes[2]) - chroma(tonic) + 12) % 12 === 3;
  const bases: Array<'minor' | 'major'> = minorThird ? ['minor', 'major'] : ['major', 'minor'];
  for (const base of bases) {
    const pcs = new Set(scaleNotes(tonic, base).map(chroma));
    const changed = notes.filter((n) => !pcs.has(chroma(n)));
    if (changed.length >= 1 && changed.length <= 2) return `${name(tonic, naming)} ${base} with ${list(changed.map((n) => name(n, naming)))}`;
  }
  return null;
}

/** Scales a beginner meets by name (Mia teaches them), shown as the theory module names them. */
const PLAIN_SCALES = new Set(['major', 'minor', 'major-pentatonic', 'minor-pentatonic', 'minor-blues', 'major-blues']);

/**
 * A scale's name in plain words: the everyday scales as they are ("A minor pentatonic"), the rest
 * as a major or minor scale with a note or two changed ("A minor with G♯" for A harmonic minor).
 */
export function plainScaleName(tonic: string, scale: string, naming: NoteNaming = 'letters'): string {
  if (!PLAIN_SCALES.has(scale)) {
    const near = nearMajorOrMinor(tonic, scale, naming);
    if (near) return near;
  }
  try {
    return formatScaleName(tonic, scale, { system: naming });
  } catch {
    return `${tonic} ${scale}`;
  }
}

/** A key in plain words: "A minor"; a mode keeps its name after a plain description ("E minor with C♯ (Dorian)"). */
export function plainKeyName(home: Pick<HomeKey, 'tonic' | 'tonality' | 'scale'>, naming: NoteNaming = 'letters'): string {
  if (home.tonality === 'major' || home.tonality === 'minor') return `${name(home.tonic, naming)} ${home.tonality}`;
  const near = nearMajorOrMinor(home.tonic, home.scale, naming);
  return near ? `${near} (${TONALITY_NAME[home.tonality]})` : `${name(home.tonic, naming)} ${TONALITY_NAME[home.tonality]}`;
}

/** A roman numeral as a word of a progression's name: `I`, `bVII`, `V7`, `iiø7`, `IV/5`, `Imaj7`. */
const NUMERAL = /^[b#♭♯]?(?:iii|ii|iv|vii|vi|v|i|III|II|IV|VII|VI|V|I)(?:°|ø|\+|maj|m|sus|add|dim|\d)*(?:\/\S*)?$/;

/** True when a piece of a name is or holds a roman numeral. */
function hasNumeral(text: string): boolean {
  return text.split(/[\s–\-,:()]+/).some((w) => w && NUMERAL.test(w));
}

/**
 * A progression's name without roman numerals: "I–V–vi–IV (the axis progression)" is "The axis
 * progression", "Minor cadence (i–iv–V7–i)" is "Minor cadence". A name that is only numerals
 * becomes its chords in this key ("Em – C – G – D").
 */
export function plainTitle(progressionName: string, chordNames: readonly string[]): string {
  if (!hasNumeral(progressionName)) return progressionName;
  const parts = progressionName
    .split(/[():]/)
    .map((p) => p.trim().replace(/^[,–-]\s*|\s*[,–-]$/g, ''))
    .filter((p) => p && !hasNumeral(p));
  if (parts.length) {
    const text = parts.join(': ');
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  const unique = chordNames.filter((c, i) => chordNames.indexOf(c) === i);
  return unique.join(' – ');
}

/** "Home chord" when a chord is built on the key's home note, else null (no numeral needed). */
export function plainRole(root: string, home: Pick<HomeKey, 'tonic'>): string | null {
  try {
    return chroma(root) === chroma(home.tonic) ? 'Home chord' : null;
  } catch {
    return null;
  }
}
