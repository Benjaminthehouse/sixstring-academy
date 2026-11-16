/**
 * Key signatures: the 15 signatures from seven flats to seven sharps, each shared by one major
 * and one minor key, with the order of the accidentals and the rules for naming a key.
 * Every fact here comes from the theory engine; the mnemonics are the only authored words.
 */
import { keySignature, keysWithSignature, scaleNotes, transpose, type Key } from '@/core/theory';

/** One signature and the two keys that share it. */
export interface SignatureRow {
  /** -7 (seven flats) … 0 … 7 (seven sharps). */
  fifths: number;
  type: 'sharps' | 'flats' | 'none';
  count: number;
  /** The accidentals in the order they are written, ASCII (`F#`, `Bb`). */
  accidentals: string[];
  major: Key;
  minor: Key;
}

/** The 15 signatures, from no accidentals outward: C, then sharps 1–7, then flats 1–7. */
export function signatureRows(): SignatureRow[] {
  const order = [0, 1, 2, 3, 4, 5, 6, 7, -1, -2, -3, -4, -5, -6, -7];
  return order.map((fifths) => {
    const sig = keySignature(fifths);
    const { major, minor } = keysWithSignature(fifths);
    return {
      fifths,
      type: fifths === 0 ? 'none' : fifths > 0 ? 'sharps' : 'flats',
      count: Math.abs(fifths),
      accidentals: [...sig.accidentals],
      major,
      minor,
    };
  });
}

/** The row of a key (`g-major` and `e-minor` share one), or null. */
export function rowOfKey(rows: readonly SignatureRow[], keyId: string): SignatureRow | null {
  return rows.find((r) => r.major.id === keyId || r.minor.id === keyId) ?? null;
}

/** The order sharps are added in a signature: F C G D A E B (ASCII, with the sharp). */
export function sharpOrder(): string[] {
  return [...keySignature(7).accidentals];
}

/** The order flats are added in a signature: B E A D G C F (ASCII, with the flat). */
export function flatOrder(): string[] {
  return [...keySignature(-7).accidentals];
}

/** Sentences that help remember the two orders (the first letters spell them). */
export const MNEMONICS = {
  sharps: 'Father Charles Goes Down And Ends Battle',
  flats: 'Battle Ends And Down Goes Charles’ Father',
} as const;

/** The major key a sharp signature belongs to: a half step above its last sharp. */
export function majorFromSharps(accidentals: readonly string[]): string {
  const last = accidentals[accidentals.length - 1];
  return transpose(last, 'm2');
}

/** The major key a flat signature belongs to: its second-to-last flat (one flat is F major). */
export function majorFromFlats(accidentals: readonly string[]): string {
  if (accidentals.length === 1) return 'F';
  return accidentals[accidentals.length - 2];
}

/** One rule for naming the key of a signature. */
export interface NamingRule {
  id: 'sharps' | 'flats' | 'minor';
  title: string;
  text: string;
}

/**
 * How to read a signature, in plain words, with worked examples computed by the engine.
 * `note` formats an ASCII note for display (the learner's naming).
 */
export function namingRules(note: (ascii: string) => string = (n) => n): NamingRule[] {
  const three = keySignature(3).accidentals;
  const threeFlats = keySignature(-3).accidentals;
  const sharpKey = majorFromSharps(three);
  const flatKey = majorFromFlats(threeFlats);
  const rel = keysWithSignature(3).minor;
  return [
    {
      id: 'sharps',
      title: 'Sharps',
      text: `The last sharp is the 7th note of the major key: go up a half step to name it. Three sharps end on ${note(three[2])}, so the key is ${note(sharpKey)} major.`,
    },
    {
      id: 'flats',
      title: 'Flats',
      text: `The second-to-last flat names the major key. Three flats are ${threeFlats.map(note).join(' ')}, so the key is ${note(flatKey)} major. One flat is ${note('F')} major.`,
    },
    {
      id: 'minor',
      title: 'Minor',
      text: `Each signature also belongs to the relative minor, three half steps below the major key. Three sharps: ${note(sharpKey)} major or ${note(rel.tonic)} minor.`,
    },
  ];
}

/** The sounding notes of a key's scale for the staff: tonic in octave 3 (written in octave 4 on guitar). */
export function scaleLine(k: Key, variant: 'natural' | 'harmonic' = 'natural'): string[] {
  const id = k.mode === 'major' ? 'major' : variant === 'harmonic' ? 'harmonic-minor' : 'minor';
  return scaleNotes(`${k.tonic}3`, id, { closed: true });
}

/** The note harmonic minor raises (its 7th), ASCII; null for a major key. */
export function raisedSeventh(k: Key): string | null {
  if (k.mode !== 'minor') return null;
  return scaleNotes(k.tonic, 'harmonic-minor')[6];
}
