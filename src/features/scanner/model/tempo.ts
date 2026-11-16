/**
 * Tempo from the words printed above music: "♩ = 96", "q=120", "J = 72" (how OCR often reads the
 * note sign), "Tempo 100", "100 bpm", "♩. = 60" (a dotted quarter beat), or an Italian marking
 * ("Andante", "Allegro moderato") or plain English ("Slowly", "Moderately").
 */

/** Italian and English tempo words with a typical speed in quarter notes per minute (middle of the usual range). */
const WORDS: Array<[RegExp, number]> = [
  [/\ballegro moderato\b/i, 120],
  [/\bmoderately slow(ly)?\b/i, 80],
  [/\bmoderately fast\b/i, 120],
  [/\bgrave\b/i, 40],
  [/\blargo\b/i, 50],
  [/\blento\b/i, 55],
  [/\badagio\b/i, 70],
  [/\bandantino\b/i, 92],
  [/\bandante\b/i, 84],
  [/\bmoderato\b/i, 108],
  [/\ballegretto\b/i, 112],
  [/\ballegro\b/i, 132],
  [/\bvivace\b/i, 160],
  [/\bpresto\b/i, 176],
  [/\bvery slow(ly)?\b/i, 50],
  [/\bslow(ly)?\b/i, 66],
  [/\b(gently|tenderly)\b/i, 72],
  [/\bmoderate(ly)?\b/i, 100],
  [/\b(brightly|lively)\b/i, 132],
  [/\bfast\b/i, 150],
];

/** Quarter notes per minute read from a tempo marking, or null when it holds none. */
export function parseTempoText(text: string): number | null {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  // A note sign (or what OCR makes of it), maybe dotted, then "=" and a number.
  const eq = /(♩|♪|𝅘𝅥|[qQJjd]|crotchet|quarter)\s*(\.)?\s*[=:]\s*(?:c\.|ca\.?|~)?\s*(\d{2,3})/.exec(t);
  if (eq) {
    const n = Number(eq[3]);
    const bpm = eq[2] ? Math.round(n * 1.5) : n;
    return bpm >= 20 && bpm <= 400 ? bpm : null;
  }
  const bare = /(?:^|=|tempo\s*)\s*(\d{2,3})\s*(?:bpm)?\b/i.exec(t) ?? /\b(\d{2,3})\s*bpm\b/i.exec(t);
  if (bare) {
    const n = Number(bare[1]);
    if (n >= 30 && n <= 300) return n;
  }
  for (const [re, bpm] of WORDS) if (re.test(t)) return bpm;
  return null;
}
