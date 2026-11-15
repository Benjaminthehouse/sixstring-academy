/**
 * Small builders that write SixTab from a pattern, so systematic exercises (a finger order on
 * every string, a scale shape, alternate strokes) are generated rather than typed note by note.
 * Everything here returns SixTab text; `technique.test.ts` parses every result.
 */

/** A note to write: string, fret (or 'x' for a dead note), an optional technique suffix and marks. */
export interface TabNote {
  s: number;
  f: number | 'x';
  /** Suffix written right after the fret: `h` `p` `s` `t` `~` `b` `b1` `b2r` ... */
  tech?: string;
  /** Marks written in braces: `pm`, `dn`, `up`, `1`-`4`, `P I M A` ... */
  marks?: string[];
}

/** One SixTab token for a note. */
export function tok(n: TabNote): string {
  const marks = n.marks?.length ? `{${n.marks.join(' ')}}` : '';
  return `${n.s}:${n.f}${n.tech ?? ''}${marks}`;
}

/** A note with the given marks added. */
export function mark(n: TabNote, ...marks: string[]): TabNote {
  return { ...n, marks: [...(n.marks ?? []), ...marks] };
}

/** Add strict alternate pick strokes (down, up, down ...) to a line, starting with `first`. */
export function alternate(notes: TabNote[], first: 'dn' | 'up' = 'dn'): TabNote[] {
  return notes.map((n, i) => mark(n, (i % 2 === 0) === (first === 'dn') ? 'dn' : 'up'));
}

/** Fret for a finger with the index finger at `position` (one finger per fret). */
export function fretFor(position: number, finger: number): number {
  return position + finger - 1;
}

/** One finger order on one string: notes with left-hand finger marks. */
export function fingerOrder(string: number, position: number, order: readonly number[], withFingers = true): TabNote[] {
  return order.map((finger) => ({ s: string, f: fretFor(position, finger), marks: withFingers ? [String(finger)] : [] }));
}

/** Cut a list of tokens into bars of `perBar` tokens, each bar starting with the duration `dur`. */
export function measures(tokens: readonly string[], perBar: number, dur: string): string[] {
  if (tokens.length % perBar !== 0) throw new RangeError(`${tokens.length} notes do not fill bars of ${perBar}`);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i += perBar) out.push(`${dur} ${tokens.slice(i, i + perBar).join(' ')}`);
  return out;
}

/** Bars written as music lines of up to `perLine` bars ("| a | b |"). */
export function music(bars: readonly string[], perLine = 4): string {
  const lines: string[] = [];
  for (let i = 0; i < bars.length; i += perLine) lines.push(`| ${bars.slice(i, i + perLine).join(' | ')} |`);
  return lines.join('\n');
}

/** Notes as tokens. */
export function toks(notes: readonly TabNote[]): string[] {
  return notes.map(tok);
}

/** A line of notes as bars of `perBar` notes of value `dur`, as music lines. */
export function line(notes: readonly TabNote[], perBar: number, dur: string, perLine = 4): string {
  return music(measures(toks(notes), perBar, dur), perLine);
}

/** The same token `count` times. */
export function times(token: string, count: number): string[] {
  return Array.from({ length: count }, () => token);
}

/** Strings from low to high (6 → 1). */
export const LOW_TO_HIGH = [6, 5, 4, 3, 2, 1] as const;
/** Strings from high to low (1 → 6). */
export const HIGH_TO_LOW = [1, 2, 3, 4, 5, 6] as const;

/**
 * The chromatic four-fret pattern: up every string from 6 to 1 with fingers 1-2-3-4, then down
 * from 1 to 6 with 4-3-2-1 (frets `position` to `position + 3`).
 */
export function chromaticUpDown(position: number, fingers = true): TabNote[] {
  const up = LOW_TO_HIGH.flatMap((s) => fingerOrder(s, position, [1, 2, 3, 4], fingers));
  const down = HIGH_TO_LOW.flatMap((s) => fingerOrder(s, position, [4, 3, 2, 1], fingers));
  return [...up, ...down];
}

/** Every ordering of the fingers 1-4 that starts with `first`, in lexical order. */
export function permutationsStartingWith(first: number): number[][] {
  const rest = [1, 2, 3, 4].filter((f) => f !== first);
  const out: number[][] = [];
  const walk = (prefix: number[], left: number[]): void => {
    if (!left.length) {
      out.push(prefix);
      return;
    }
    for (const f of left) walk([...prefix, f], left.filter((x) => x !== f));
  };
  walk([first], rest);
  return out;
}

/** A legato line on one string: the first note picked, the rest hammered (going up) or pulled (going down). */
export function legatoString(string: number, frets: readonly number[]): TabNote[] {
  return frets.map((f, i) => {
    if (i === 0) return { s: string, f, marks: ['dn'] };
    return { s: string, f, tech: f > frets[i - 1] ? 'h' : 'p' };
  });
}

/** The header lines of an exercise part's SixTab. */
export function header(title: string, bpm: number, time = '4/4'): string {
  return `title: ${title}\ncomposer: Sixstring Academy\nlicence: Original exercise for Sixstring Academy\ntempo: ${Number(bpm.toFixed(2))}\ntime: ${time}\n`;
}
