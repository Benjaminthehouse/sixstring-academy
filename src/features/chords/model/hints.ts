/**
 * Turning the chord matcher's verdict ("missing E, extra F#") into one kind, specific hint about
 * the learner's hand: which string, which fret, what to try. The microphone hears notes, not
 * fingers, so hints say what was heard and offer the likely cause, never an accusation.
 */
import { tuning as resolveTuning, type Voicing } from '@/core/guitar';
import { chordToneMap, formatChord, formatNote, parseChord } from '@/core/theory';

/** What the matcher reported about one strum (a subset of `ChordMatch` from `@/core/pitch`). */
export interface HeardChord {
  /** Chord tones (pitch classes) that were not heard. */
  missing: readonly number[];
  /** Pitch classes heard strongly that are not in the chord. */
  extra: readonly number[];
}

/** A hint for the learner. */
export interface StrumHint {
  kind: 'missing' | 'extra' | 'both' | 'unclear';
  text: string;
  /** Strings the hint is about (to highlight on the diagram). */
  strings: number[];
}

function stringWords(strings: readonly number[]): string {
  const sorted = [...strings].sort((a, b) => b - a);
  if (sorted.length === 1) return `string ${sorted[0]}`;
  return `strings ${sorted.slice(0, -1).join(', ')} and ${sorted[sorted.length - 1]}`;
}

function article(name: string): string {
  return /^[AEF]/.test(name) ? 'an' : 'a';
}

/** Spell a pitch class the way the chord spells it (outside notes against its root). */
export function spellIn(symbol: string, pc: number): string {
  try {
    return chordToneMap(symbol).byPc[((pc % 12) + 12) % 12].note;
  } catch {
    return ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][((pc % 12) + 12) % 12];
  }
}

function chordText(symbol: string): string {
  try {
    return formatChord(symbol);
  } catch {
    return symbol;
  }
}

/** A hint for one strum that did not ring true. `format` turns ASCII note names into display text. */
export function strumHint(voicing: Voicing, heard: HeardChord, formatter: (note: string) => string = (n) => formatNote(n)): StrumHint {
  const format = (note: string): string => {
    try {
      return formatter(note);
    } catch {
      return note;
    }
  };
  const symbol = voicing.chord;
  const chordName = (() => {
    const c = parseChord(symbol);
    return c ? c.symbol : symbol;
  })();
  const sounding = voicing.notes;
  const missingParts: Array<{ name: string; strings: number[]; places: string[]; open: boolean; fretted: boolean }> = [];
  for (const pc of heard.missing) {
    const on = sounding.filter((n) => ((n.midi % 12) + 12) % 12 === pc);
    if (!on.length) continue;
    missingParts.push({
      name: format(spellIn(symbol, pc)),
      strings: on.map((n) => n.string),
      places: on.map((n) => (n.fret === 0 ? `the open string ${n.string}` : `string ${n.string} at fret ${n.fret}`)),
      open: on.some((n) => n.fret === 0),
      fretted: on.some((n) => n.fret > 0),
    });
  }
  const extraParts: Array<{ name: string; cause: string; strings: number[] }> = [];
  const count = voicing.frets.length;
  let openPcs: number[] = [];
  try {
    openPcs = resolveTuning(voicing.tuning).midi.map((m) => m % 12);
  } catch {
    openPcs = [];
  }
  for (const pc of heard.extra) {
    const name = format(spellIn(symbol, pc));
    // A string that should be silent whose open note is the extra one.
    const mutedStrings = voicing.frets
      .map((f, i) => ({ f, string: count - i, open: openPcs.length === count ? openPcs[i] : -1 }))
      .filter((s) => s.f === null && s.open === pc)
      .map((s) => s.string);
    if (mutedStrings.length) {
      extraParts.push({
        name,
        strings: mutedStrings,
        cause: `${stringWords(mutedStrings)} should stay silent in this shape (open, it sounds ${name}): leave it out of your strum, or let a fingertip rest on it`,
      });
      continue;
    }
    // A fretted note a semitone away: a finger on the wrong fret.
    const near = sounding.filter((n) => n.fret > 0 && (Math.abs(((n.midi % 12) + 12) % 12 - pc) === 1 || Math.abs(((n.midi % 12) + 12) % 12 - pc) === 11));
    if (near.length) {
      extraParts.push({ name, strings: near.map((n) => n.string), cause: `check that the finger on ${stringWords(near.map((n) => n.string))} is on fret ${near[0].fret}` });
      continue;
    }
    extraParts.push({ name, strings: [], cause: 'if it keeps happening, check your tuning with the tuner' });
  }

  const missingText = (() => {
    if (!missingParts.length) return '';
    if (missingParts.length === 1) {
      const m = missingParts[0];
      const where = m.places.join(' and ');
      const advice =
        m.open && !m.fretted
          ? 'make sure no finger leans against it'
          : m.fretted && !m.open
            ? 'press firmly, just behind the fret, with the very tip of your finger'
            : 'press the fretted note firmly with your fingertip, and keep the other fingers off the open string';
      return `We could not hear the ${m.name}. It comes from ${where}: ${advice}.`;
    }
    const names = missingParts.map((m) => m.name);
    const strings = missingParts.flatMap((m) => m.strings);
    return `We could not hear the ${names.slice(0, -1).join(', ')} and the ${names[names.length - 1]} (${stringWords(strings)}). Arch your fingers so each one touches only its own string.`;
  })();
  const extraText = extraParts.length ? `We ${missingText ? 'also heard' : 'heard'} ${article(extraParts[0].name)} ${extraParts[0].name}, which is not in ${chordText(chordName)}: ${extraParts[0].cause}.` : '';

  if (missingText && extraText) return { kind: 'both', text: `${missingText} ${extraText}`, strings: [...missingParts.flatMap((m) => m.strings), ...extraParts.flatMap((e) => e.strings)] };
  if (missingText) return { kind: 'missing', text: missingText, strings: missingParts.flatMap((m) => m.strings) };
  if (extraText) return { kind: 'extra', text: extraText, strings: extraParts.flatMap((e) => e.strings) };
  return { kind: 'unclear', text: 'That did not quite sound like the chord. Strum all the strings of the shape once, firmly, and let them ring.', strings: [] };
}

/** The one-paragraph explanation shown before the microphone is used to check chords. */
export const MIC_EXPLAINER =
  'The microphone hears notes, not fingers. It listens for the notes of the chord after each strum and tells you which ones are missing or extra, so it can point to a muted or buzzing string. It is deliberately lenient: a slightly dull string still passes, and a noisy room can confuse it. If it disagrees with your ears, trust your ears and carry on.';
