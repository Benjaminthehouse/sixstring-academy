/**
 * Spelling a line of sounding pitches for the staff. A pitch in the key takes the key's name; a
 * chord tone of the chord in force takes the chord's name (D7 in C gives F♯, B♭7 gives A♭); the
 * rest are spelled by what the line does with them:
 *
 *   - an explicit hint wins (`spellings: ['Bb']`: every pitch class 10 is B♭);
 *   - the blues: in a line that uses the key's minor third and minor seventh but not its leading
 *     tone, the minor third, the flat five and the minor seventh are written flat (E blues has B♭,
 *     not A♯, even when it slides up to B);
 *   - otherwise, for a black key, the direction the line takes from the note: rising a semitone it
 *     is the raised lower letter (G G♯ A), falling a semitone the lowered upper letter (A A♭ G);
 *   - otherwise the key's chromatic scale (1 ♭2 2 ♭3 3 4 ♯4 5 ♭6 6 ♭7 7).
 *
 * Only single sharps and flats come out of the line rules; double accidentals only where the key or
 * the chord itself has them. Pure and unit-tested.
 */
import { chordNotes, getKey, note as parseNote, spellInKey, transpose, withOctaveFor, type Key } from '@/core/theory';

/** One event of the line: the pitches struck together, the key and the chord symbol in force. */
export interface SpellEvent {
  /** Sounding MIDI pitches; empty for a rest. */
  midi: readonly number[];
  /** Key in force (`E`, `A minor`). */
  key: string;
  /** Chord symbol in force, if the music has one. */
  chord?: string | null;
  /** Per pitch: held on from the same pitch in the event before (it keeps that spelling). */
  tied?: readonly boolean[];
}

/** Options of `spellLine`. */
export interface SpellLineOptions {
  /** Names that win whenever their pitch class sounds: `['Bb']`, `['F#', 'Bb']`. */
  spellings?: readonly string[];
}

const LETTERS = 'CDEFGAB';
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const mod12 = (n: number) => ((Math.round(n) % 12) + 12) % 12;

/** The pitch class spelled on a letter with one accidental at most, or null when it needs more. */
function onLetter(pc: number, step: number): string | null {
  const step7 = ((step % 7) + 7) % 7;
  let alt = pc - LETTER_PC[step7];
  if (alt > 6) alt -= 12;
  if (alt < -6) alt += 12;
  if (Math.abs(alt) > 1) return null;
  return `${LETTERS[step7]}${alt === 1 ? '#' : alt === -1 ? 'b' : ''}`;
}

interface KeyFacts {
  key: Key | null;
  tonicPc: number;
  own: Map<number, string>;
}

const keyCache = new Map<string, KeyFacts>();

function keyFacts(name: string): KeyFacts {
  let facts = keyCache.get(name);
  if (!facts) {
    const key = getKey(name) ?? getKey('C');
    const own = new Map<number, string>();
    if (key) for (const n of [...key.scale, ...(key.harmonicMinor ?? []), ...(key.melodicMinor ?? [])]) if (!own.has(parseNote(n).chroma)) own.set(parseNote(n).chroma, n);
    facts = { key, tonicPc: key ? parseNote(key.tonic).chroma : 0, own };
    keyCache.set(name, facts);
  }
  return facts;
}

function chordTones(symbol: string | null | undefined): Map<number, string> | null {
  if (!symbol) return null;
  try {
    const out = new Map<number, string>();
    for (const n of chordNotes(symbol, { withBass: true })) out.set(parseNote(n).chroma, n);
    return out;
  } catch {
    return null;
  }
}

function keyDefault(midi: number, keyName: string): string {
  try {
    return spellInKey(midi, keyName, { octave: true });
  } catch {
    return spellInKey(midi, 'C', { octave: true });
  }
}

/**
 * True when a line in this key sounds like the blues: it uses the key's minor third and minor
 * seventh (E G … D in E) and never its leading tone (D♯). Classical minor keeps its leading tone,
 * so its raised fourth (A♯ on the way to B over F♯7) is not mistaken for a blue note.
 */
export function isBluesLine(pcs: ReadonlySet<number>, tonicPc: number): boolean {
  return pcs.has(mod12(tonicPc + 3)) && pcs.has(mod12(tonicPc + 10)) && !pcs.has(mod12(tonicPc + 11));
}

/**
 * Spell every pitch of a line (see the module comment). Returns names with octaves (`Bb3`),
 * parallel to each event's `midi`.
 */
export function spellLine(events: readonly SpellEvent[], opts: SpellLineOptions = {}): string[][] {
  const hints = new Map<number, string>();
  for (const h of opts.spellings ?? []) {
    try {
      const n = parseNote(h);
      hints.set(n.chroma, n.pcName);
    } catch {
      // An unreadable hint is ignored.
    }
  }
  // The pitch classes each key's stretch of the line uses (for the blues test).
  const used = new Map<string, Set<number>>();
  for (const e of events) {
    let set = used.get(e.key);
    if (!set) used.set(e.key, (set = new Set()));
    for (const m of e.midi) set.add(mod12(m));
  }

  const out: string[][] = [];
  events.forEach((e, i) => {
    const facts = keyFacts(e.key);
    const chord = chordTones(e.chord);
    const blues = isBluesLine(used.get(e.key) ?? new Set(), facts.tonicPc);
    out.push(e.midi.map((midi, k) => {
      const pc = mod12(midi);
      // A held note keeps the name it started with.
      if (e.tied?.[k] && i > 0) {
        const at = events[i - 1].midi.indexOf(midi);
        if (at >= 0 && out[i - 1][at]) return out[i - 1][at];
      }
      const hint = hints.get(pc);
      if (hint) return withOctaveFor(hint, midi);
      const own = facts.own.get(pc);
      if (own) return withOctaveFor(own, midi);
      const tone = chord?.get(pc);
      if (tone) return withOctaveFor(tone, midi);
      const degree = mod12(pc - facts.tonicPc);
      if (blues && facts.key && (degree === 3 || degree === 6 || degree === 10)) {
        const flat = transpose(facts.key.tonic, degree === 3 ? 'm3' : degree === 6 ? 'd5' : 'm7');
        if (Math.abs(parseNote(flat).alt) <= 1) return withOctaveFor(flat, midi);
      }
      // Where the line goes from here: the first later event that does not just hold or repeat this pitch.
      let j = i + 1;
      while (j < events.length && j <= i + 4 && events[j].midi.includes(midi)) j++;
      const next = events[j]?.midi ?? [];
      const up = next.includes(midi + 1);
      const down = next.includes(midi - 1);
      // Only a black key takes its name from the line: a white key keeps its natural name (F in G
      // major, not E♯), which is what a learner reads most easily.
      const black = !LETTER_PC.includes(pc);
      if (black && up !== down) {
        // The note the line moves to, as it will be spelled (the key's name is a good guess for it).
        const target = parseNote(keyDefault(midi + (up ? 1 : -1), e.key));
        const name = onLetter(pc, target.step + (up ? -1 : 1));
        if (name) return withOctaveFor(name, midi);
      }
      return keyDefault(midi, e.key);
    }));
  });
  return out;
}
