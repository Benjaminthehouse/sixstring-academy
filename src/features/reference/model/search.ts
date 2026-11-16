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
import { prettyName } from './names';
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
  /** Added to the score so common entries win ties (everyday chords and scales). */
  boost?: number;
  /** Normalised text, filled in once by `buildSearchIndex` so a query does not redo it per entry. */
  norm?: { title: string; keys: string[]; hay: string };
}

/** Display formatters for notes, chords and keys (the learner's naming). */
export interface SearchFormat {
  note: (ascii: string) => string;
  chord: (ascii: string) => string;
  key: (asciiName: string) => string;
}

const PLAIN: SearchFormat = { note: (n) => n, chord: (c) => c, key: (k) => k };

/**
 * Ideas a learner types that live inside a section rather than as one row of it, with the words
 * they are likely to use. Each opens the place that shows it.
 */
export const TOPICS: ReadonlyArray<Omit<SearchEntry, 'id' | 'norm'>> = [
  {
    section: 'circle',
    item: null,
    title: 'Parallel keys',
    subtitle: 'Same tonic, other mode: C major and C minor. The circle shows the parallel of every key.',
    keywords: ['parallel major', 'parallel minor', 'parallel key', 'tonic major', 'tonic minor'],
  },
  {
    section: 'circle',
    item: 'a-minor',
    title: 'Leading tone',
    subtitle: 'The 7th note, a half step below the tonic. Minor keys raise their 7th to get one.',
    keywords: ['leading note', 'raised 7th', 'raised seventh', 'subtonic'],
  },
  {
    section: 'harmony',
    item: null,
    title: 'Diatonic chords and Roman numerals',
    subtitle: 'The chords built on each note of a key, numbered from I to vii°.',
    keywords: ['diatonic chords', 'roman numerals', 'numerals', 'chords in a key', 'harmonised scale', 'harmonized scale'],
  },
  {
    section: 'harmony',
    item: null,
    title: 'Tonic, subdominant and dominant',
    subtitle: 'The three jobs a chord does in a key: home, moving away, pulling home.',
    keywords: ['harmonic function', 'chord function', 'function', 'tonic', 'subdominant', 'dominant'],
  },
  {
    section: 'harmony',
    item: 'harmonic-minor',
    title: 'Chords of harmonic minor',
    subtitle: 'The raised 7th gives minor keys a major V and a diminished vii°.',
    keywords: ['harmonic minor chords', 'harmonic minor harmony', 'diatonic harmonic minor'],
  },
  {
    section: 'harmony',
    item: 'melodic-minor',
    title: 'Chords of melodic minor',
    subtitle: 'Raised 6th and 7th: the jazz minor and its chords.',
    keywords: ['melodic minor chords', 'jazz minor chords', 'melodic minor harmony', 'diatonic melodic minor'],
  },
  {
    section: 'intervals',
    item: 'g-b',
    title: 'The G–B exception',
    subtitle: 'Why shapes move one fret when they cross from the G string to the B string.',
    keywords: ['g string', 'b string', 'g to b', 'g-b', 'second string', 'third string'],
  },
  {
    section: 'intervals',
    item: null,
    title: 'Inverting an interval',
    subtitle: 'Turn an interval upside down: the two add up to an octave, as m3 and M6 do.',
    keywords: ['inversion', 'invert', 'inverted interval', 'interval inversion'],
  },
];

/** Build the index. Cheap enough to do once per naming system (about 400 entries). */
export function buildSearchIndex(fmt: SearchFormat = PLAIN): SearchEntry[] {
  const out: SearchEntry[] = [];
  const add = (e: Omit<SearchEntry, 'id'>, id = `${e.section}:${e.item ?? ''}`) => out.push({ ...e, id });

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
        boost: tierBoost(r.tier),
      });
    }
  }

  // Scales.
  for (const g of scaleGroups(0)) {
    for (const r of g.rows) {
      add({
        section: 'scales',
        item: r.id,
        title: prettyName(r.name),
        subtitle: `${r.degrees.map((d) => formatDegree(d)).join(' ')} · ${g.title}`,
        keywords: [...r.aliases, `${r.name} scale`, r.id.replace(/-/g, ' ')],
        boost: tierBoost(r.tier),
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
        // "Roman numerals" as a whole is a topic below; every key listing it buried that topic.
        keywords: [`chords in ${row.key.name}`, `chords of ${row.key.name}`, `diatonic ${row.key.name}`],
      });
    }
  }

  // Notation and tab.
  add({ section: 'notation', item: 'note-values', title: 'Note values', subtitle: noteValueRows().map((v) => v.name).join(', '), keywords: noteValueRows().flatMap((v) => [v.name, v.british]) });
  add({ section: 'notation', item: 'rests', title: 'Rests', subtitle: 'A silence for every note value', keywords: noteValueRows().map((v) => v.restName) });
  for (const e of lengthExamples()) add({ section: 'notation', item: e.id, title: e.name, subtitle: `${e.sum} = ${e.beats} beats`, keywords: ['dot', 'dotted', 'tie', 'triplet'].filter((w) => e.id.includes(w.slice(0, 3))) });
  for (const t of timeSignatureRows()) add({ section: 'notation', item: t.id, title: `Time signature ${t.text}`, subtitle: t.meaning, keywords: ['time signature', 'meter', t.text, `${t.top}/${t.bottom}`] });
  for (const s of [...REPEAT_SIGNS, ...DYNAMICS, ...ARTICULATIONS]) add({ section: 'notation', item: s.id, title: s.name, subtitle: s.meaning, keywords: [s.id.replace(/-/g, ' ')] });
  for (const t of TAB_TECHNIQUES) add({ section: 'notation', item: t.id, title: `${t.name} (tab)`, subtitle: `Written ${sentence(t.symbol)} ${t.meaning}`, keywords: [t.name, t.symbol, 'tab'] });

  // Tunings.
  for (const g of tuningGroups()) {
    for (const r of g.rows) {
      const letters = r.notes.map((n) => n.replace(/\d+$/, ''));
      add({ section: 'tunings', item: r.id, title: prettyName(r.name), subtitle: `${letters.map(fmt.note).join(' ')} · ${g.title}`, keywords: [letters.join(' '), letters.join(''), r.id.replace(/-/g, ' '), 'tuning'] });
    }
  }

  // Glossary.
  for (const e of glossaryEntries()) add({ section: 'glossary', item: e.id, title: capital(e.term), subtitle: e.definition, keywords: [e.id.replace(/-/g, ' ')] });

  // Topics can open the same place as a row (A minor shows the leading tone), so they get ids of their own.
  TOPICS.forEach((t, i) => add({ ...t, keywords: [...t.keywords] }, `topic:${i}`));

  for (const e of out) {
    const title = normalizeQuery(e.title);
    const keys = e.keywords.map(normalizeQuery);
    e.norm = { title, keys, hay: `${title} ${normalizeQuery(e.subtitle)} ${keys.join(' ')}` };
  }
  return out;
}

function capital(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** A symbol closed as a sentence, without doubling a full stop it already ends with (`P.M.`). */
function sentence(s: string): string {
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

/** Ordinals as the words the catalog uses: "7th" finds the seventh chords, "8th note" the eighth note. */
const ORDINALS: Record<string, string> = {
  '1st': 'first',
  '2nd': 'second',
  '3rd': 'third',
  '4th': 'fourth',
  '5th': 'fifth',
  '6th': 'sixth',
  '7th': 'seventh',
  '8th': 'eighth',
  '9th': 'ninth',
  '10th': 'tenth',
  '11th': 'eleventh',
  '12th': 'twelfth',
  '13th': 'thirteenth',
  '15th': 'fifteenth',
  '16th': 'sixteenth',
};

/** Fold display glyphs, spoken accidentals and ordinals into one form: `F♯` and `f sharp` -> `f#`, `7th` -> `seventh`. */
export function normalizeQuery(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\b(\d{1,2})(st|nd|rd|th)\b/g, (m) => ORDINALS[m] ?? m)
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

/** True when `phrase` appears in `text` as whole words. */
function hasPhrase(text: string, phrase: string): boolean {
  const at = text.indexOf(phrase);
  if (at < 0) return false;
  const edge = (c: string | undefined) => c === undefined || !/[a-z0-9#]/.test(c);
  for (let i = at; i >= 0; i = text.indexOf(phrase, i + 1)) {
    if (edge(text[i - 1]) && edge(text[i + phrase.length])) return true;
  }
  return false;
}

/** A small lift for the catalog's everyday entries (tier 1) over specialist ones (tier 4). */
function tierBoost(tier: number): number {
  return Math.max(0, Math.min(3, 4 - tier));
}

/** Rank the index against a query; best first. Empty query gives nothing. */
export function searchReference(index: readonly SearchEntry[], query: string, limit = 40): SearchHit[] {
  const q = normalizeQuery(query);
  if (!q) return [];
  const words = q.split(' ');
  const hits: SearchHit[] = [];
  for (const entry of index) {
    const { title, keys, hay } = entry.norm ?? {
      title: normalizeQuery(entry.title),
      keys: entry.keywords.map(normalizeQuery),
      hay: `${normalizeQuery(entry.title)} ${normalizeQuery(entry.subtitle)} ${entry.keywords.map(normalizeQuery).join(' ')}`,
    };
    if (!words.every((w) => hay.includes(w))) continue;
    const titleWords = title.split(/[\s·(),:/–]+/).filter(Boolean);
    let score = 10;
    if (title === q || keys.includes(q)) score = 100;
    // "seventh" is as good a match for "Dominant seventh" as for "Seventh flat five".
    else if (title.startsWith(q) || hasPhrase(title, q)) score = 80;
    // Every word, in any order: "minor relative" is the relative minor.
    else if (words.length > 1 && words.every((w) => titleWords.includes(w))) score = 70;
    else if (keys.some((k) => k.startsWith(q))) score = 65;
    else if (titleWords.some((w) => w.startsWith(words[0]))) score = 50;
    else if (words.every((w) => title.includes(w))) score = 40;
    if (entry.symbol && entry.symbol === query.trim()) score += 25;
    // Among equals, the everyday chord or scale first.
    score += entry.boost ?? 0;
    // Section pages themselves rank just under an exact item.
    if (entry.item === null && !entry.id.startsWith('topic:')) score -= 5;
    hits.push({ entry, score });
  }
  hits.sort((a, b) => b.score - a.score || (SECTION_RANK.get(a.entry.section)! - SECTION_RANK.get(b.entry.section)!) || a.entry.title.length - b.entry.title.length);
  return hits.slice(0, limit);
}
