/**
 * One search over the whole Reference: keys, signatures, intervals, chord types, scales, the
 * harmony table, notation signs, tab techniques, tunings and glossary terms. Every entry points at
 * a section and (usually) an item in it, so a result opens exactly what was asked for.
 *
 * Titles are built with display formatters passed in (the learner's note naming); the ASCII
 * spellings are kept as keywords, so `F#`, `f sharp` and `F♯` all find F♯ minor in any naming.
 */
import { ALL_KEYS, formatDegree } from '@/core/theory';
import { chordGroups } from './chords';
import { neckScaleOf, signatureWords } from './circle';
import { glossaryEntries } from './glossary';
import { harmonyTable } from './harmony';
import { compoundRows, intervalRows, intervalSlug } from './intervals';
import { signatureRows } from './keys';
import { ARTICULATIONS, DYNAMICS, REPEAT_SIGNS, TAB_TECHNIQUES, lengthExamples, noteValueRows, timeSignatureRows } from './notation';
import { scaleGroups } from './scales';
import { SECTIONS, type SectionId } from './sections';
import { tuningGroups } from './tunings';

/** One thing the search can find. */
export interface SearchEntry {
  /** Unique: `section:item`. */
  id: string;
  section: SectionId;
  item: string | null;
  title: string;
  subtitle: string;
  /** Extra words that should find it (ASCII names, aliases, symbols). */
  keywords: string[];
  /** Case-sensitive symbol for an exact-case bonus (`M3` vs `m3`, `maj7`). */
  symbol?: string;
}

/** Display formatters for notes, chords and keys (the learner's naming). */
export interface SearchFormat {
  note: (ascii: string) => string;
  chord: (ascii: string) => string;
  key: (asciiName: string) => string;
}

const PLAIN: SearchFormat = { note: (n) => n, chord: (c) => c, key: (k) => k };

/** Build the index. Cheap enough to do once per naming system (about 400 entries). */
export function buildSearchIndex(fmt: SearchFormat = PLAIN): SearchEntry[] {
  const out: SearchEntry[] = [];
  const add = (e: Omit<SearchEntry, 'id'>) => out.push({ ...e, id: `${e.section}:${e.item ?? ''}` });

  for (const s of SECTIONS) add({ section: s.id, item: null, title: s.title, subtitle: s.blurb, keywords: [] });

  // Keys on the circle of fifths.
  for (const k of ALL_KEYS) {
    const { count, accidentals } = k.signature;
    add({
      section: 'circle',
      item: k.id,
      title: fmt.key(k.name),
      subtitle: `${capital(signatureWords(k))}${count ? `: ${accidentals.map(fmt.note).join(' ')}` : ''}. Relative ${fmt.key(k.relative)}.`,
      keywords: [k.name, `${k.tonic}${k.mode === 'minor' ? 'm' : ''}`, `key of ${k.tonic}`, neckScaleOf(k).scale],
    });
  }
  // Signatures.
  for (const r of signatureRows()) {
    const words = r.count === 0 ? 'No sharps or flats' : `${r.count} ${r.type === 'sharps' ? 'sharp' : 'flat'}${r.count === 1 ? '' : 's'}`;
    add({
      section: 'keys',
      item: r.major.id,
      title: `${words}: ${fmt.key(r.major.name)} or ${fmt.key(r.minor.name)}`,
      subtitle: r.accidentals.length ? r.accidentals.map(fmt.note).join(' ') : 'Key signature',
      keywords: [r.major.name, r.minor.name, 'key signature', 'signature', ...r.accidentals],
    });
  }
  add({ section: 'keys', item: 'order', title: 'Order of sharps and flats', subtitle: 'F C G D A E B, and backwards for flats', keywords: ['order of sharps', 'order of flats', 'father charles', 'battle ends', 'mnemonic'] });

  // Intervals.
  for (const r of intervalRows()) {
    add({
      section: 'intervals',
      item: intervalSlug(r.id),
      title: `${r.id} · ${r.name}`,
      subtitle: `${r.semitones} half step${r.semitones === 1 ? '' : 's'} · from ${fmt.note('C')} to ${fmt.note(r.fromC)}`,
      keywords: [r.name, `${r.semitones} semitones`, `${r.semitones} frets`, r.degree, ...(r.semitones === 6 ? ['tritone'] : []), ...(r.semitones === 12 ? ['octave'] : []), ...(r.semitones === 0 ? ['unison'] : [])],
      symbol: r.id,
    });
  }
  for (const r of compoundRows()) {
    add({ section: 'intervals', item: intervalSlug(r.id), title: `${r.id} · ${r.name}`, subtitle: `${r.semitones} half steps · an octave above ${r.simple}`, keywords: [r.name, 'compound'], symbol: r.id });
  }

  // Chord types.
  for (const g of chordGroups('C')) {
    for (const r of g.rows) {
      add({
        section: 'chords',
        item: r.id,
        title: `${capital(r.name)} (${fmt.chord(r.symbol)})`,
        subtitle: `${r.degrees.map((d) => formatDegree(d)).join(' ')} · ${g.title}`,
        keywords: [r.symbol, r.suffix, ...r.aliases, `${r.name} chord`],
        symbol: r.suffix,
      });
    }
  }

  // Scales.
  for (const g of scaleGroups(0)) {
    for (const r of g.rows) {
      add({
        section: 'scales',
        item: r.id,
        title: r.name,
        subtitle: `${r.degrees.map((d) => formatDegree(d)).join(' ')} · ${g.title}`,
        keywords: [...r.aliases, `${r.name} scale`, r.id.replace(/-/g, ' ')],
      });
    }
  }

  // Chords of each key.
  for (const mode of ['major', 'minor'] as const) {
    const t = harmonyTable(mode);
    for (const row of t.rows) {
      add({
        section: 'harmony',
        item: row.key.id,
        title: `Chords in ${fmt.key(row.key.name)}`,
        subtitle: row.chords.slice(0, 7).map(fmt.chord).join(' '),
        keywords: [`chords in ${row.key.name}`, `chords of ${row.key.name}`, `diatonic ${row.key.name}`, 'roman numerals'],
      });
    }
  }

  // Notation and tab.
  add({ section: 'notation', item: 'note-values', title: 'Note values', subtitle: noteValueRows().map((v) => v.name).join(', '), keywords: noteValueRows().flatMap((v) => [v.name, v.british]) });
  add({ section: 'notation', item: 'rests', title: 'Rests', subtitle: 'A silence for every note value', keywords: noteValueRows().map((v) => v.restName) });
  for (const e of lengthExamples()) add({ section: 'notation', item: e.id, title: e.name, subtitle: `${e.sum} = ${e.beats} beats`, keywords: ['dot', 'dotted', 'tie', 'triplet'].filter((w) => e.id.includes(w.slice(0, 3))) });
  for (const t of timeSignatureRows()) add({ section: 'notation', item: t.id, title: `Time signature ${t.text}`, subtitle: t.meaning, keywords: ['time signature', 'meter', t.text, `${t.top}/${t.bottom}`] });
  for (const s of [...REPEAT_SIGNS, ...DYNAMICS, ...ARTICULATIONS]) add({ section: 'notation', item: s.id, title: s.name, subtitle: s.meaning, keywords: [s.id.replace(/-/g, ' ')] });
  for (const t of TAB_TECHNIQUES) add({ section: 'notation', item: t.id, title: `${t.name} (tab)`, subtitle: `Written ${t.symbol}. ${t.meaning}`, keywords: [t.name, t.symbol, 'tab'] });

  // Tunings.
  for (const g of tuningGroups()) {
    for (const r of g.rows) {
      const letters = r.notes.map((n) => n.replace(/\d+$/, ''));
      add({ section: 'tunings', item: r.id, title: r.name, subtitle: `${letters.map(fmt.note).join(' ')} · ${g.title}`, keywords: [letters.join(' '), letters.join(''), r.id.replace(/-/g, ' '), 'tuning'] });
    }
  }

  // Glossary.
  for (const e of glossaryEntries()) add({ section: 'glossary', item: e.id, title: capital(e.term), subtitle: e.definition, keywords: [e.id.replace(/-/g, ' ')] });

  return out;
}

function capital(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Fold display glyphs and spoken accidentals into what a learner types: `F♯` and `f sharp` -> `f#`. */
export function normalizeQuery(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/♯/g, '#')
    .replace(/♭/g, 'b')
    .replace(/𝄪/g, '##')
    .replace(/𝄫/g, 'bb')
    .replace(/°/g, 'dim')
    .replace(/ø/g, 'm7b5')
    .replace(/\b([a-g]) ?sharp\b/g, '$1#')
    .replace(/\b([a-g]) ?flat\b/g, '$1b')
    .replace(/[’']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A search hit and why it ranked where it did. */
export interface SearchHit {
  entry: SearchEntry;
  score: number;
}

const SECTION_RANK = new Map<SectionId, number>(SECTIONS.map((s, i) => [s.id, i]));

/** Rank the index against a query; best first. Empty query gives nothing. */
export function searchReference(index: readonly SearchEntry[], query: string, limit = 40): SearchHit[] {
  const q = normalizeQuery(query);
  if (!q) return [];
  const words = q.split(' ');
  const hits: SearchHit[] = [];
  for (const entry of index) {
    const title = normalizeQuery(entry.title);
    const keys = entry.keywords.map(normalizeQuery);
    const hay = `${title} ${normalizeQuery(entry.subtitle)} ${keys.join(' ')}`;
    if (!words.every((w) => hay.includes(w))) continue;
    let score = 10;
    if (title === q || keys.includes(q)) score = 100;
    else if (title.startsWith(q)) score = 80;
    else if (keys.some((k) => k.startsWith(q))) score = 65;
    else if (title.split(/[\s·(),:/]+/).some((w) => w.startsWith(words[0]))) score = 50;
    else if (words.every((w) => title.includes(w))) score = 40;
    if (entry.symbol && entry.symbol === query.trim()) score += 25;
    // Section pages themselves rank just under an exact item.
    if (entry.item === null) score -= 5;
    hits.push({ entry, score });
  }
  hits.sort((a, b) => b.score - a.score || (SECTION_RANK.get(a.entry.section)! - SECTION_RANK.get(b.entry.section)!) || a.entry.title.length - b.entry.title.length);
  return hits.slice(0, limit);
}
