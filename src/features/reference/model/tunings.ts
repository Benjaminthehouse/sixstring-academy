/**
 * The tuning catalog of the guitar engine, grouped the way players think of it, with the strings to
 * change from standard tuning worked out by `retuneSteps`.
 */
import { TUNINGS, retuneSteps, type Tuning } from '@/core/guitar';

/** One string to retune from standard. */
export interface RetuneStep {
  string: number;
  from: string;
  to: string;
  semitones: number;
  /** "down a whole step". */
  words: string;
}

/** One tuning of the catalog. */
export interface TuningRow {
  id: string;
  name: string;
  /** Open-string notes low to high, with octaves (`D2 A2 D3 G3 B3 E4`). */
  notes: string[];
  midi: number[];
  description: string;
  instrument: string;
  stringCount: number;
  /** Strings to change from standard (six-string guitar tunings only; empty for standard itself). */
  changes: RetuneStep[];
}

/** A group of tunings with a heading. */
export interface TuningGroup {
  id: string;
  title: string;
  rows: TuningRow[];
}

/** "down a whole step", "up a half step", "down 3 half steps", "up an octave". */
export function retuneWords(semitones: number): string {
  const dir = semitones < 0 ? 'down' : 'up';
  const n = Math.abs(semitones);
  if (n === 1) return `${dir} a half step`;
  if (n === 2) return `${dir} a whole step`;
  if (n === 12) return `${dir} an octave`;
  return `${dir} ${n} half steps`;
}

/** The groups, in the order of the page. */
const GROUPS: Array<{ id: string; title: string; test: (t: Tuning) => boolean }> = [
  { id: 'standard', title: 'Standard and lowered', test: (t) => t.instrument === 'guitar' && t.stringCount === 6 && (t.category === 'standard' || t.category === 'lowered') },
  { id: 'drop', title: 'Drop tunings', test: (t) => t.instrument === 'guitar' && t.stringCount === 6 && t.category === 'drop' },
  { id: 'open', title: 'Open tunings', test: (t) => t.instrument === 'guitar' && t.stringCount === 6 && t.category === 'open' },
  { id: 'other', title: 'Modal and other guitar tunings', test: (t) => t.instrument === 'guitar' && t.stringCount === 6 && (t.category === 'modal' || t.category === 'other') },
  { id: 'extended', title: 'Seven-string and baritone', test: (t) => t.instrument === 'guitar' && (t.stringCount !== 6 || t.category === 'extended') },
  { id: 'bass', title: 'Bass', test: (t) => t.instrument === 'bass' },
  { id: 'ukulele', title: 'Ukulele', test: (t) => t.instrument === 'ukulele' },
];

/** One row for a tuning. */
export function tuningRow(t: Tuning): TuningRow {
  const sixString = t.instrument === 'guitar' && t.stringCount === 6;
  const changes: RetuneStep[] = sixString
    ? retuneSteps(t.id, 'standard')
        .filter((s) => s.semitones !== 0)
        .map((s) => ({ string: s.string, from: s.from, to: s.to, semitones: s.semitones, words: retuneWords(s.semitones) }))
    : [];
  return { id: t.id, name: t.name, notes: [...t.notes], midi: [...t.midi], description: t.description, instrument: t.instrument, stringCount: t.stringCount, changes };
}

/** Every catalog tuning, grouped; each tuning appears in exactly one group. */
export function tuningGroups(): TuningGroup[] {
  const placed = new Set<string>();
  const out: TuningGroup[] = [];
  for (const g of GROUPS) {
    const rows = TUNINGS.filter((t) => !t.custom && !placed.has(t.id) && g.test(t)).map((t) => {
      placed.add(t.id);
      return tuningRow(t);
    });
    if (rows.length) out.push({ id: g.id, title: g.title, rows });
  }
  return out;
}

/** "Strings 6 and 1 down a whole step", grouping strings that move the same way. */
export function changeSummary(changes: readonly RetuneStep[]): string {
  if (!changes.length) return 'No changes from standard.';
  const byMove = new Map<number, number[]>();
  for (const c of changes) byMove.set(c.semitones, [...(byMove.get(c.semitones) ?? []), c.string]);
  const parts = [...byMove.entries()].map(([semis, strings]) => {
    const list = strings.length === 1 ? `String ${strings[0]}` : `Strings ${strings.slice(0, -1).join(', ')} and ${strings[strings.length - 1]}`;
    return `${list} ${retuneWords(semis)}`;
  });
  return `${parts.join('; ')}.`;
}
