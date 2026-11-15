/**
 * Chord sheet importers: ChordPro (`[C]Amazing [G]grace`, `{title: …}`, `{soc}` …) and the
 * chords-over-lyrics sheets found everywhere (a line of chord names above each lyric line).
 * Both produce a rhythm track of strummed slashes with a chord timeline and the lyrics. Bars are
 * estimated from the line structure (one chord per bar, chords written close together share a
 * bar, `| G | D |` bars respected, `x2` repeats), and the result says so.
 */
import { chordInKey, detectBestKey, getKey, isNoChord, noteAtDegree, normalizeChordSymbol, transposeChordBySemitones } from '@/core/theory';
import { isChordLine, isChordWord, normalizeTabText } from './import-ascii';
import { expandTabs } from './import-util';
import { barCapacity, parseTimeSig, slugify } from './model';
import { strumBeats, transposeKey } from './transform';
import type { Beat, ChordEvent, ImportResult, ImportWarning, Section, Song, StrumPattern, TimeSig } from './types';

/** Options for the chord sheet importers. */
export interface ChordSheetOptions {
  title?: string;
  time?: TimeSig;
  tempo?: number;
  /** Strumming pattern for every bar (default: one downstroke per beat). */
  strum?: string;
}

/** One line of the sheet as the layout sees it. */
interface SheetLine {
  section?: string;
  chords: Array<{ symbol: string; col: number }>;
  /** Bar boundaries written with "|": chord indexes that start a new bar. */
  barStarts?: number[];
  lyric: string;
  repeat?: number;
  line: number;
}

interface Hints {
  title?: string;
  artist?: string;
  composer?: string;
  key?: string;
  capo?: number;
  tempo?: number;
  time?: TimeSig;
}

const SECTION_WORDS = /^(intro|verse|pre-?chorus|chorus|bridge|outro|interlude|solo|refrain|instrumental|coda|ending|tag|break|hook|riff)\b/i;

function cleanSymbol(word: string): string {
  const w = word.replace(/^[(\[]|[)\]]$/g, '').replace(/\*+$/, '');
  return normalizeChordSymbol(w) ?? w;
}

/** True when a text looks like ChordPro (directives in braces or chords in square brackets inside lyrics). */
export function isChordPro(text: string): boolean {
  if (/^\s*\{\s*(title|t|subtitle|st|artist|key|capo|start_of_chorus|soc|start_of_verse|sov|comment|c)\s*[:}]/im.test(text)) return true;
  const inline = text.match(/\[[A-G][^\]\s]{0,10}\][A-Za-z']/g);
  return !!inline && inline.length >= 2;
}

/** Import a ChordPro text. */
export function importChordPro(text: string, opts: ChordSheetOptions = {}): ImportResult {
  const hints: Hints = {};
  const lines: SheetLine[] = [];
  const warnings: ImportWarning[] = [];
  let section: string | undefined;
  let nextSection: string | undefined;
  let chorus: SheetLine[] = [];
  let inChorus = false;
  let inTab = false;
  let verseCount = 0;
  let ended = false;
  normalizeTabText(text).split(/\r\n|\r|\n/).forEach((raw, i) => {
    if (ended) return;
    const line = expandTabs(raw).replace(/\s+$/, '');
    if (/^\s*\{\s*(new_song|ns)\s*\}\s*$/i.test(line) && (lines.length || hints.title)) {
      // A songbook file: the first song only.
      ended = true;
      warnings.push({ message: 'This file holds more than one song; the first one was imported.', line: i + 1, confidence: 0.8 });
      return;
    }
    const d = /^\s*\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}\s*$/i.exec(line);
    if (d) {
      const name = d[1].toLowerCase();
      const value = (d[2] ?? '').trim();
      switch (name) {
        case 'title': case 't': hints.title = value; break;
        case 'subtitle': case 'st': if (!hints.artist) hints.artist = value; break;
        case 'artist': hints.artist = value; break;
        case 'composer': hints.composer = value; break;
        case 'key': hints.key = value; break;
        case 'capo': hints.capo = Number(value) || 0; break;
        case 'tempo': hints.tempo = Number(value) || undefined; break;
        case 'time': hints.time = parseTimeSig(value) ?? undefined; break;
        case 'start_of_chorus': case 'soc': inChorus = true; chorus = []; nextSection = value || 'Chorus'; break;
        case 'end_of_chorus': case 'eoc': inChorus = false; break;
        case 'start_of_verse': case 'sov': verseCount++; nextSection = value || `Verse ${verseCount}`; break;
        case 'start_of_bridge': case 'sob': nextSection = value || 'Bridge'; break;
        case 'start_of_tab': case 'sot': inTab = true; warnings.push({ message: 'A tab block inside the ChordPro file was skipped (import it as tab on its own).', line: i + 1, confidence: 0.5 }); break;
        case 'end_of_tab': case 'eot': inTab = false; break;
        case 'chorus':
          if (chorus.length) lines.push(...chorus.map((l, k) => ({ ...l, section: k === 0 ? 'Chorus' : undefined, line: i + 1 })));
          break;
        case 'comment': case 'c': case 'ci': case 'comment_italic':
          if (SECTION_WORDS.test(value)) nextSection = value.replace(/:$/, '');
          break;
        default:
          break;
      }
      return;
    }
    if (inTab || /^\s*#/.test(line)) return;
    if (!line.trim()) return;
    const label = /^\s*\[?([A-Za-z][A-Za-z -]*\d*)\]?\s*:?\s*$/.exec(line);
    if (label && SECTION_WORDS.test(label[1]) && !isChordWord(label[1])) {
      nextSection = label[1].trim();
      return;
    }
    const chords: Array<{ symbol: string; col: number }> = [];
    let lyric = '';
    const re = /\[([^\]]*)\]/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      lyric += line.slice(last, m.index);
      const sym = m[1].trim();
      if (sym && (isChordWord(sym) || isNoChord(sym))) chords.push({ symbol: isNoChord(sym) ? 'N.C.' : cleanSymbol(sym), col: lyric.length });
      last = m.index + m[0].length;
    }
    lyric += line.slice(last);
    const repeat = /\s(?:x|×)(\d)\s*$/i.exec(lyric);
    const entry: SheetLine = { chords, lyric: (repeat ? lyric.slice(0, repeat.index) : lyric).replace(/\s+$/, ''), line: i + 1, ...(repeat ? { repeat: Number(repeat[1]) } : {}) };
    if (nextSection) {
      section = nextSection;
      entry.section = section;
      nextSection = undefined;
    }
    lines.push(entry);
    if (inChorus) chorus.push({ ...entry });
  });
  return layout(lines, hints, opts, warnings, 'ChordPro');
}

/** A Nashville number chord ("1", "4", "6m", "5/7", "b7", "2-7") turned into a symbol in a key, or null. */
export function nashvilleChord(token: string, key: string): string | null {
  const m = /^[([]?([b#]?)([1-7])((?:m|-|°|o|ø|\+|maj7|M7|Δ7?|7|9|11|13|6|sus2|sus4|sus|add9|5)*)(?:\/([b#]?)([1-7]))?[)\]]?$/.exec(token);
  if (!m) return null;
  try {
    const root = noteAtDegree(key, `${m[1]}${m[2]}`);
    const quality = m[3].replace(/^-/, 'm').replace(/-/g, 'm').replace(/[°o]/g, 'dim').replace(/ø/g, 'm7b5').replace(/Δ7?|M7/g, 'maj7').replace(/\+/g, 'aug');
    const bass = m[5] ? `/${noteAtDegree(key, `${m[4]}${m[5]}`)}` : '';
    return normalizeChordSymbol(root + quality + bass);
  } catch {
    return null;
  }
}

/** True when a text is a Nashville number chart: a key line and lines of numbers. */
export function isNashvilleChart(text: string): boolean {
  const lines = text.split(/\r\n|\r|\n/);
  return lines.some((l) => /^\s*key\s*(?:of)?\s*[:=\-]?\s*[A-G]/i.test(l)) && lines.filter((l) => l.trim() && isNashvilleLine(l)).length >= 1;
}

/** True when every word of a line is a Nashville number, a bar line or a beat mark. */
function isNashvilleLine(line: string): boolean {
  const words = line.replace(/\|/g, ' | ').trim().split(/\s+/).filter((w) => w && !/^[|/%.:\-]+$/.test(w) && !/^\(?(?:[x×]\d+|\d+[x×])\)?$/i.test(w));
  return words.length > 0 && words.every((w) => nashvilleChord(w, 'C') !== null);
}

/** A repeat instruction for an earlier section: "(Repeat Chorus)", "Repeat the chorus x2", "Chorus x2" with nothing under it. */
function repeatInstruction(line: string): { name: string; times: number } | null {
  const m = /^\s*[[(]?\s*(?:repeat|play|back\s+to)\s+(?:the\s+)?([A-Za-z][A-Za-z -]*?\s*\d*)\s*(?:[x×]\s?(\d)|(\d)\s?[x×]|twice)?\s*[\])]?\s*$/i.exec(line);
  if (!m || !SECTION_WORDS.test(m[1].trim())) return null;
  const times = m[2] ?? m[3] ? Number(m[2] ?? m[3]) : /twice/i.test(line) ? 2 : 1;
  return { name: m[1].trim().replace(/\s+/g, ' '), times };
}

/** A section header with an optional count: "Chorus x2", "[Verse 1]", "(Bridge)". */
function headerCount(name: string): { name: string; times: number } {
  const m = /^(.*?)\s*\(?\s*(?:[x×]\s?(\d)|(\d)\s?[x×])\s*\)?$/i.exec(name);
  if (!m || !m[1]) return { name, times: 1 };
  return { name: m[1].trim(), times: Number(m[2] ?? m[3]) };
}

/** Import a chords-over-lyrics sheet (chord names on their own line above the words). */
export function importChordSheet(text: string, opts: ChordSheetOptions = {}): ImportResult {
  const raw = normalizeTabText(text).split(/\r\n|\r|\n/).map((l) => expandTabs(l).replace(/\s+$/, ''));
  const hints: Hints = {};
  const warnings: ImportWarning[] = [];
  const lines: SheetLine[] = [];
  let nextSection: string | undefined;
  let titleTaken = false;
  // Nashville number charts need the key before the numbers can be read.
  const keyLine = raw.map((l) => /^\s*key\s*(?:of)?\s*[:=\-]?\s*([A-G][#b]?\s*(?:m|min|minor|maj|major)?)\b/i.exec(l)).find(Boolean);
  const nashvilleKey = keyLine && getKey(keyLine[1].trim()) ? keyLine[1].trim() : null;
  let nashvilleLines = 0;
  /** Lines of each section so far, for "Repeat Chorus". */
  const bySection = new Map<string, SheetLine[]>();
  let currentSection: { key: string; times: number; first: number } | null = null;
  const closeSection = () => {
    if (currentSection && currentSection.times > 1) {
      // "Chorus x2": the section's lines once more for each extra time.
      const body = lines.slice(currentSection.first);
      for (let t = 1; t < currentSection.times; t++) lines.push(...body.map((l) => ({ ...l, section: undefined })));
    }
    currentSection = null;
  };
  const startSection = (name: string, times: number) => {
    closeSection();
    nextSection = name;
    currentSection = { key: name.toLowerCase(), times, first: lines.length };
  };
  const push = (entry: SheetLine) => {
    if (nextSection) {
      entry.section = nextSection;
      nextSection = undefined;
    }
    lines.push(entry);
    if (currentSection) {
      const list = bySection.get(currentSection.key) ?? [];
      if (lines.length - 1 === currentSection.first) list.length = 0;
      list.push({ ...entry });
      bySection.set(currentSection.key, list);
    }
  };
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i];
    if (!line.trim()) continue;
    const field = /^\s*(title|artist|composer|key|capo|tempo|bpm|time)\s*[:=\-]\s*(.+)$/i.exec(line);
    if (field) {
      const v = field[2].trim();
      const k = field[1].toLowerCase();
      if (k === 'title') hints.title = v;
      else if (k === 'artist') hints.artist = v;
      else if (k === 'composer') hints.composer = v;
      else if (k === 'key') hints.key = v;
      else if (k === 'capo') hints.capo = parseCapo(v) ?? 0;
      else if (k === 'tempo' || k === 'bpm') hints.tempo = parseInt(v, 10) || undefined;
      else if (k === 'time') hints.time = parseTimeSig(v) ?? undefined;
      continue;
    }
    const capo = /^\s*capo\s*(?:on\s*)?(?:the\s*)?(?:fret\s*)?([0-9]{1,2}|[ivx]{1,4})\b/i.exec(line);
    if (capo) {
      hints.capo = parseCapo(capo[1]) ?? 0;
      continue;
    }
    const again = repeatInstruction(line);
    if (again) {
      const body = bySection.get(again.name.toLowerCase());
      if (body?.length) {
        closeSection();
        for (let t = 0; t < again.times; t++) lines.push(...body.map((l, k) => ({ ...l, section: t === 0 && k === 0 ? sectionTitle(again.name) : undefined, line: i + 1 })));
      } else warnings.push({ message: `"${line.trim()}" refers to a section the sheet has not shown yet; it was skipped.`, line: i + 1, confidence: 0.4 });
      continue;
    }
    // "[Verse 1]", "(Bridge)", "Chorus:", "Chorus", "Chorus x2" or "Intro: G D Em C".
    const header = /^\s*[[(]\s*([^\])]+?)\s*[\])]\s*:?\s*(.*)$/.exec(line)
      ?? /^\s*([A-Za-z][A-Za-z -]*?\s*\d*(?:\s*\(?[x×]\d\)?)?)\s*:\s*(.*)$/.exec(line)
      ?? /^\s*([A-Za-z][A-Za-z -]*?\s*\d*(?:\s*\(?[x×]\d\)?)?)\s*()$/.exec(line);
    if (header && SECTION_WORDS.test(header[1].trim()) && !isChordWord(header[1].trim().split(/\s/)[0])) {
      const { name, times } = headerCount(header[1].trim().replace(/\s+/g, ' '));
      const rest = header[2];
      const following = raw.slice(i + 1).find((l) => l.trim());
      const nothingUnder = !rest && (following === undefined || /^\s*[[(]/.test(following) || SECTION_WORDS.test(following.trim()) || !!repeatInstruction(following));
      const earlier = bySection.get(name.toLowerCase());
      if (nothingUnder && earlier?.length) {
        // A bare "Chorus" (or "Chorus x2") after the chorus was written out: play it again.
        closeSection();
        for (let t = 0; t < times; t++) lines.push(...earlier.map((l, k) => ({ ...l, section: t === 0 && k === 0 ? sectionTitle(name) : undefined, line: i + 1 })));
        continue;
      }
      startSection(sectionTitle(name), times);
      if (rest && (isChordLine(rest) || (nashvilleKey && isNashvilleLine(rest)))) {
        const start = line.length - rest.length;
        push({ ...chordLineData(' '.repeat(start) + rest, nashvilleKey), lyric: '', line: i + 1 });
      }
      continue;
    }
    const nashville = !!nashvilleKey && isNashvilleLine(line) && !isChordLine(line);
    if (isChordLine(line) || nashville) {
      if (nashville) nashvilleLines++;
      const next = raw[i + 1];
      const data = chordLineData(line, nashvilleKey);
      const pairs = next !== undefined && !!next.trim() && !isChordLine(next) && !(nashvilleKey && isNashvilleLine(next)) && !SECTION_WORDS.test(next.trim().replace(/^[[(]/, '')) && !/^\s*capo/i.test(next) && !repeatInstruction(next);
      push({ ...data, lyric: pairs ? next : '', line: i + 1 });
      if (pairs) i++;
      continue;
    }
    // Plain lines before the first chords or section are the heading: title, then artist or composer.
    if (!lines.length && !nextSection) {
      if (!hints.title && !titleTaken) {
        hints.title = line.trim();
        titleTaken = true;
        continue;
      }
      if (!hints.artist && !hints.composer && line.trim().length < 60) {
        hints.artist = line.trim();
        continue;
      }
    }
    // Words with no chords above them: the chord in force goes on.
    push({ chords: [], lyric: line, line: i + 1 });
  }
  closeSection();
  if (nashvilleLines) warnings.push({ message: `Nashville numbers were read in the key of ${nashvilleKey}.`, confidence: 0.8 });
  return layout(lines, hints, opts, warnings, 'chord sheet');
}

function sectionTitle(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function parseCapo(v: string): number | null {
  const t = v.trim().toLowerCase();
  const roman: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };
  const n = /^\d{1,2}/.test(t) ? parseInt(t, 10) : roman[/^[ivx]+/.exec(t)?.[0] ?? ''];
  if (/^(none|no)\b/.test(t)) return 0;
  return n !== undefined && Number.isFinite(n) && n >= 0 && n <= 12 ? n : null;
}

function chordLineData(line: string, nashvilleKey: string | null = null): Pick<SheetLine, 'chords' | 'barStarts' | 'repeat'> {
  const chords: Array<{ symbol: string; col: number }> = [];
  const barStarts: number[] = [];
  let repeat: number | undefined;
  let sawBar = false;
  // Bar lines may touch the chords: "|G . . .|".
  const re = /:?\|+:?|[^\s|]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const w = m[0];
    if (w.includes('|')) {
      sawBar = true;
      barStarts.push(chords.length);
      continue;
    }
    const r = /^\(?[x×](\d+)\)?$/i.exec(w) ?? /^\(?(\d+)[x×]\)?$/i.exec(w);
    if (r) {
      repeat = Number(r[1]);
      continue;
    }
    if (/^[/%.\-]+$/.test(w)) {
      // Beat marks: the chord before goes on for one more beat per mark.
      for (let k = 0; k < w.length; k++) if (chords.length) chords.push({ symbol: chords[chords.length - 1].symbol, col: m.index + k });
      continue;
    }
    if (isChordWord(w)) chords.push({ symbol: isNoChord(w.replace(/[()]/g, '')) ? 'N.C.' : cleanSymbol(w), col: m.index });
    else if (nashvilleKey) {
      const symbol = nashvilleChord(w, nashvilleKey);
      if (symbol) chords.push({ symbol, col: m.index });
    }
  }
  return { chords, ...(sawBar ? { barStarts: [...new Set(barStarts.filter((b) => b < chords.length))] } : {}), ...(repeat ? { repeat } : {}) };
}

/** Count sung syllables roughly (vowel groups), for lines without chords. */
function syllables(text: string): number {
  return (text.toLowerCase().match(/[aeiouy]+/g) ?? []).length;
}

/** Lay sheet lines out into bars of strummed slashes with chords and lyrics. */
function layout(lines: SheetLine[], hints: Hints, opts: ChordSheetOptions, warnings: ImportWarning[], kind: string): ImportResult {
  const time = opts.time ?? hints.time ?? { numerator: 4, denominator: 4 };
  const cap = barCapacity(time);
  const title = opts.title ?? hints.title ?? 'Imported chords';
  const bars: Array<{ chords: Array<{ symbol: string; frac: number }>; lyric: Array<{ frac: number; text: string }>; section?: string; repeatStart?: boolean; repeatEnd?: number }> = [];
  let anyChord = false;
  for (const l of lines) {
    const startBar = bars.length;
    const lyric = l.lyric;
    if (!l.chords.length) {
      if (!lyric.trim()) continue;
      // Words alone: the last chord rings on, about six syllables a bar.
      const n = Math.max(1, Math.round(syllables(lyric) / 6));
      for (let k = 0; k < n; k++) bars.push({ chords: [], lyric: k === 0 ? [{ frac: 0, text: lyric.trim() }] : [] });
    } else {
      anyChord = true;
      // Group chords into bars: "|" where written; otherwise one chord per bar, close neighbours share.
      const groups: number[][] = [];
      if (l.barStarts && l.barStarts.length) {
        const starts = [...l.barStarts];
        if (starts[0] !== 0) starts.unshift(0);
        starts.forEach((s, k) => {
          const e = k + 1 < starts.length ? starts[k + 1] : l.chords.length;
          if (e > s) groups.push(Array.from({ length: e - s }, (_, j) => s + j));
        });
      } else {
        const width = Math.max(lyric.length, ...l.chords.map((c) => c.col + c.symbol.length));
        l.chords.forEach((c, k) => {
          const prev = l.chords[k - 1];
          const g = groups[groups.length - 1];
          const close = prev && lyric.trim() && c.col - prev.col < Math.max(5, width / 10) && g && g.length < 2;
          if (close) g.push(k);
          else groups.push([k]);
        });
      }
      groups.forEach((g) => {
        bars.push({ chords: g.map((k, j) => ({ symbol: l.chords[k].symbol, frac: j / g.length })), lyric: [] });
      });
      if (lyric.trim()) {
        // Words from each chord to the next go to the beat where that chord starts. A chord written
        // over the middle of a word belongs to that word.
        const wordStart = (col: number) => {
          let c = Math.min(col, lyric.length);
          while (c > 0 && /\S/.test(lyric[c - 1] ?? '') && /\S/.test(lyric[c] ?? '')) c--;
          return c;
        };
        const cuts = l.chords.map((c) => wordStart(c.col));
        cuts.forEach((col, k) => {
          const from = k === 0 ? 0 : col;
          const to = k + 1 < cuts.length ? cuts[k + 1] : lyric.length;
          const text = lyric.slice(from, to).trim();
          if (!text) return;
          const gi = groups.findIndex((g) => g.includes(k));
          const pos = groups[gi].indexOf(k) / groups[gi].length;
          bars[startBar + gi].lyric.push({ frac: pos, text });
        });
      }
    }
    if (bars.length > startBar) {
      if (l.section) bars[startBar].section = l.section;
      if (l.repeat && l.repeat >= 2) {
        bars[startBar].repeatStart = true;
        bars[bars.length - 1].repeatEnd = l.repeat;
      }
    }
  }
  if (!bars.length) bars.push({ chords: [], lyric: [] });

  const strum: StrumPattern | undefined = opts.strum ? { pattern: opts.strum.toUpperCase() } : undefined;
  const chords: ChordEvent[] = [];
  const sections: Section[] = [];
  const measures = bars.map((b, bar) => {
    const beats: Beat[] = strumBeats(time, opts.strum);
    for (const c of b.chords) {
      const tick = snap(c.frac * cap, beats);
      if (!chords.some((x) => x.bar === bar && x.tick === tick)) chords.push({ bar, tick, symbol: c.symbol });
    }
    for (const ly of b.lyric) {
      const tick = snap(ly.frac * cap, beats);
      const beat = beats.find((x) => x.start === tick && x.slash) ?? beats.find((x) => x.slash)!;
      beat.lyric = beat.lyric ? `${beat.lyric} ${ly.text}` : ly.text;
    }
    if (b.section) {
      const last = sections[sections.length - 1];
      if (last) last.end = bar;
      sections.push({ name: b.section, start: bar, end: bars.length, ...(strum ? { strum } : {}) });
    }
    return { beats };
  });
  // Merge repeated chord symbols into one event.
  let merged = chords.filter((c, i) => i === 0 || chords[i - 1].symbol !== c.symbol);
  const capo = hints.capo ?? 0;
  if (capo) {
    // A capo sheet names the shapes; songs store what sounds (a G shape behind capo 2 is an A).
    merged = merged.map((c) => (isNoChord(c.symbol) ? c : { ...c, symbol: safeTranspose(c.symbol, capo) }));
  }
  const symbols = merged.map((c) => c.symbol).filter((s) => !isNoChord(s));
  let key = hints.key;
  if (key && capo && symbols.length) {
    // "Key: D" beside "Capo 2" may name the shapes' key or the sounding one: keep whichever the (sounding) chords fit.
    const moved = transposeKey(key, capo);
    const fit = (k: string) => symbols.filter((c) => {
      try {
        return chordInKey(c, k);
      } catch {
        return false;
      }
    }).length;
    if (getKey(moved) && fit(moved) > fit(key)) key = moved;
  }
  if (!key && symbols.length) {
    const k = detectBestKey(symbols);
    if (k) {
      key = k.short;
      warnings.push({ message: `Key ${k.name} was worked out from the chords.`, confidence: 0.6 });
    }
  }
  const song: Song = {
    meta: { id: slugify(title), title, ...(hints.artist ? { artist: hints.artist } : {}), ...(hints.composer ? { composer: hints.composer } : {}), source: `Imported from a ${kind}` },
    tuning: [40, 45, 50, 55, 59, 64],
    capo,
    ...(key ? { key } : {}),
    tempo: [{ bar: 0, bpm: opts.tempo ?? hints.tempo ?? 90 }],
    bars: bars.map((b) => ({ time: { ...time }, ...(b.repeatStart ? { repeatStart: true } : {}), ...(b.repeatEnd ? { repeatEnd: b.repeatEnd } : {}) })),
    sections,
    tracks: [{ id: 'chords', name: 'Chords', role: 'rhythm', measures }],
    chords: merged,
    annotations: [],
  };
  if (!anyChord) warnings.push({ message: 'No chord names were found.', confidence: 0.2 });
  warnings.unshift({ message: 'Bars were estimated from the line structure: one chord per bar unless the sheet shows otherwise. Check against a recording.', confidence: 0.5 });
  if (capo) warnings.push({ message: `Capo on fret ${capo}: the sheet's chord names are shapes, stored as the chords that sound (shape ${lines.find((l) => l.chords.length)?.chords[0]?.symbol ?? 'G'} = ${merged[0]?.symbol ?? ''}).`, confidence: 0.85 });
  return { song, warnings, confidence: anyChord ? 0.6 : 0.2, estimatedRhythm: true };
}

function safeTranspose(symbol: string, semitones: number): string {
  try {
    return transposeChordBySemitones(symbol, semitones);
  } catch {
    return symbol;
  }
}

/** The start of the beat at or before a tick (so chords and words land on a strum). */
function snap(tick: number, beats: Beat[]): number {
  let best = 0;
  for (const b of beats) if (b.start <= tick + 1e-6) best = b.start;
  return best;
}
