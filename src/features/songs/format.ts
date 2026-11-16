/**
 * Words and numbers the Songs screen shows: lengths, levels, where a song came from, importer
 * warnings. Pure, so the wording is tested once.
 */
import { FORMAT_NAMES, detectTextFormat, difficultyBand, type ImportWarning } from '@/core/song';
import { formatKey, parseKey } from '@/core/theory';
import { tempoMark } from '@/features/player/model/meter';
import { LEVEL_BAND_NAMES, type SongListing, type SongSummary } from '@/core/library';

/** `75` -> `{ short: '1:15', spoken: '1 minute 15 seconds' }`. */
export function lengthLabel(seconds: number): { short: string; spoken: string } {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  const parts: string[] = [];
  if (m) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  if (r || !m) parts.push(`${r} second${r === 1 ? '' : 's'}`);
  return { short: `${m}:${String(r).padStart(2, '0')}`, spoken: parts.join(' ') };
}

/**
 * The tempo the way a player counts it, in the meter's own beat, as the Player, its count-in and
 * its click count it: quarter notes per minute, dotted quarters in 6/8, 9/8 and 12/8 (two, three
 * or four beats in a bar), eighths in 3/8. `bpm` is quarter notes per minute.
 */
export function tempoLabel(bpm: number, time: string): { short: string; spoken: string } {
  const m = /^(\d+)\/(\d+)$/.exec(time);
  const mark = tempoMark(bpm, m ? { numerator: Number(m[1]), denominator: Number(m[2]) } : null);
  return mark.beat.glyph
    ? { short: mark.short, spoken: `${mark.value} ${mark.beat.name} beats per minute` }
    : { short: `${mark.value} BPM`, spoken: `${mark.value} beats per minute` };
}

/** A key as the learner reads it, the mode included: `A dorian` -> `A Dorian`, `F#m` -> `F♯ minor`. Null when it is not a key. */
export function keyText(key: string | null | undefined): string | null {
  if (!key || !key.trim()) return null;
  try {
    const k = parseKey(key.trim());
    return k ? formatKey(k) : null;
  } catch {
    return null;
  }
}

/**
 * The key a song's details show. A built-in song's key is written by hand ("E Dorian"). For the
 * learner's own songs the library keeps only major or minor ("A minor" for A Dorian), so once the
 * song itself is loaded its own key, mode and all, is shown instead.
 */
export function songKeyLabel(listing: Pick<SongListing, 'source' | 'key'>, songKey?: string | null): string | null {
  if (listing.source === 'mine' && songKey) return keyText(songKey) ?? listing.key ?? null;
  return listing.key ?? null;
}

/**
 * Where a song's music comes from, for the line under its title: the built-in song's own origin
 * ("... The melody is given as it is commonly sung or played today ..."), and for the learner's
 * copy of a built-in song, the origin of the song it was copied from, which the copy does not keep.
 */
export function historyLine(listing: SongListing, listingOf: (id: string) => SongListing | undefined = () => undefined): string | null {
  if (listing.source !== 'mine') return listing.origin ?? null;
  if (listing.origin) return listing.origin;
  const o = listing.imported?.origin;
  if (o?.kind === 'duplicate' && o.from) return listingOf(o.from)?.origin ?? null;
  return null;
}

/** Importer notes without the ones that only say the rhythm was estimated (shown on their own). */
export function withoutRhythmNote<T extends { message: string }>(warnings: readonly T[], estimatedRhythm: boolean | undefined): T[] {
  return estimatedRhythm ? warnings.filter((w) => !/rhythm (was|is) estimated|estimated (the )?rhythm/i.test(w.message)) : [...warnings];
}

/** `Beginner`, `Intermediate` or `Expert` for a level 1–10. */
export function bandLabel(level: number): string {
  return LEVEL_BAND_NAMES[difficultyBand(level)];
}

/** Badge tone of a level band. */
export function bandTone(level: number): 'ok' | 'info' | 'streak' {
  const band = difficultyBand(level);
  return band === 'beginner' ? 'ok' : band === 'intermediate' ? 'info' : 'streak';
}

/** What a song holds, as short labelled items for the list. */
export function featureItems(summary: SongSummary | null | undefined): Array<{ key: 'tab' | 'chords' | 'lyrics' | 'strum'; label: string; icon: string }> {
  if (!summary) return [];
  const out: Array<{ key: 'tab' | 'chords' | 'lyrics' | 'strum'; label: string; icon: string }> = [];
  if (summary.hasTab) out.push({ key: 'tab', label: 'Tab', icon: 'Rows3' });
  if (summary.hasChords) out.push({ key: 'chords', label: 'Chords', icon: 'Grid3x3' });
  if (summary.hasStrumming) out.push({ key: 'strum', label: 'Strum', icon: 'Waves' });
  if (summary.hasLyrics) out.push({ key: 'lyrics', label: 'Lyrics', icon: 'MicVocal' });
  return out;
}

/** One line on where one of the learner's songs came from. */
export function originLine(listing: SongListing, titleOf: (id: string) => string | undefined = () => undefined): string | null {
  const o = listing.imported?.origin;
  if (listing.source !== 'mine') return null;
  if (!o) return 'One of your songs';
  const format = o.format ? FORMAT_NAMES[o.format] : null;
  switch (o.kind) {
    case 'import':
      return o.fileName ? `Imported from ${o.fileName}${format ? ` (${format})` : ''}` : `Imported${format ? ` ${format}` : ''} file`;
    case 'paste':
      return `Pasted ${format ? format.toLowerCase().replace('chordpro', 'ChordPro') : 'text'}`;
    case 'typed':
      return 'Typed in SixTab';
    case 'scan':
      return 'Scanned from a sheet';
    case 'duplicate': {
      const from = o.from ? titleOf(o.from) : undefined;
      return from ? `Your copy of ${from}` : 'Your copy';
    }
    default:
      return 'One of your songs';
  }
}

/** An importer warning as one readable line: `Bar 3: ...` / `Line 12: ...`. */
export function warningLine(w: ImportWarning): string {
  const where = w.bar !== undefined ? `Bar ${w.bar + 1}: ` : w.line !== undefined ? `Line ${w.line}: ` : '';
  return where + w.message;
}

/** Importer warnings, the least certain first, then in song order; duplicates merged with a count. */
export function sortedWarnings(warnings: readonly ImportWarning[]): Array<{ text: string; count: number; unsure: boolean }> {
  const merged = new Map<string, { text: string; count: number; unsure: boolean; confidence: number; order: number }>();
  warnings.forEach((w, i) => {
    const key = w.message;
    const prev = merged.get(key);
    if (prev) {
      prev.count++;
      prev.confidence = Math.min(prev.confidence, w.confidence ?? 1);
      prev.unsure = prev.confidence < 0.6;
    } else {
      merged.set(key, { text: warningLine(w), count: 1, confidence: w.confidence ?? 1, unsure: (w.confidence ?? 1) < 0.6, order: i });
    }
  });
  return [...merged.values()].sort((a, b) => a.confidence - b.confidence || a.order - b.order).map(({ text, count, unsure }) => ({ text, count, unsure }));
}

/** What pasted text looks like, for a live hint under the paste box. */
export function pasteHint(text: string): { ok: boolean; text: string } {
  if (!text.trim()) return { ok: false, text: 'Paste text tab, a chord sheet or ChordPro, or type SixTab.' };
  const format = detectTextFormat(text);
  if (format === 'unknown') return { ok: false, text: 'This does not look like tab or chords yet.' };
  return { ok: true, text: PASTE_LOOKS[format] ?? `Looks like ${FORMAT_NAMES[format]}.` };
}

const PASTE_LOOKS: Partial<Record<string, string>> = {
  sixtab: 'Looks like SixTab.',
  'ascii-tab': 'Looks like text tab.',
  chordpro: 'Looks like ChordPro.',
  'chord-sheet': 'Looks like a chord sheet.',
  musicxml: 'Looks like MusicXML.',
  json: 'Looks like a song saved from Sixstring Academy.',
};

/** A starting point for typing a song in SixTab. */
export const SIXTAB_TEMPLATE = `title: My new song
composer: Me
difficulty: 1
tempo: 80
time: 4/4
key: G

[Verse]
| "G" q 3:0 3:2 2:0 3:0 | "C" 2:1 2:0 h 3:2 |
| "D" q 2:3 2:1 2:0 3:2 | "G" w 3:0 ||
`;
