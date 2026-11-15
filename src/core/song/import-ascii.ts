/**
 * ASCII tab importer: the plain-text tab found on the web and in text PDFs.
 *
 *   e|-----0---------|---------------|
 *   B|---1---1-------|-3--1--0-------|        x2
 *   G|-2-------2-----|-------2--0----|
 *
 * It finds systems (runs of 4–8 tab lines), string names (tuning hints), bar lines, one- and
 * two-digit frets and the usual technique signs (h p / \ s b r ~ x (n) <n> t PM), chord names
 * above the staff and lyrics below it. Tab has no rhythm, so rhythm is estimated from the
 * horizontal spacing inside each bar and quantised so every bar is full; the result says so.
 */
import { customTuning, getTuning } from '@/core/guitar';
import { isNoChord, parseChord } from '@/core/theory';
import { buildMeasures, expandTabs, type Onset } from './import-util';
import { barCapacity, createSong, midiOf, parseTimeSig, restBeats, slugify, valueFromTicks } from './model';
import type { Beat, ImportResult, ImportWarning, Note, Song, TimeSig } from './types';
import { PPQ } from './types';

/** Options for `importAsciiTab`. */
export interface AsciiTabOptions {
  title?: string;
  /** Time signature to assume when the text gives none (default 4/4). */
  time?: TimeSig;
  /** Tempo to assume when the text gives none (default 90). */
  tempo?: number;
  /** Tuning (low to high) to use instead of what the text suggests. */
  tuning?: number[];
  capo?: number;
}

const TAB_BODY = /^[-|0-9hpbrsxX/\\~()<>*.^=tTv:\[\]{}+% ]+$/;
const STRING_NAME = /^\s*(?:([A-Ga-g][#b]?\d?)|([1-8])(?=\s*[|:]))?\s*([|:)\]])?/;
const REPEAT_MARK = /(?:^|\s)[([]?(?:[x×](\d{1,2})|(\d{1,2})\s*[x×]|repeat\s*[x×]?\s*(\d{1,2})|play\s+(\d{1,2})\s*times)[)\]]?\s*$/i;

/**
 * Text as it comes from web pages, PDFs and word processors: typographic dashes and box-drawing
 * lines become "-" and "|", non-breaking and odd spaces become spaces, a byte-order mark goes.
 */
export function normalizeTabText(text: string): string {
  return text
    .replace(/^﻿/, '')
    .replace(/[‐-―−─━┄┅┈┉╌╍﹘﹣－]/g, '-')
    .replace(/[│┃┆┇┊┋╎╏║｜ǀ∣]/g, '|')
    .replace(/[  -   　]/g, ' ')
    .replace(/[​-‍⁠]/g, '');
}

interface TabLine {
  index: number;
  name: string | null;
  /** Column (in the original line) where the body starts. */
  offset: number;
  body: string;
  repeat: number | null;
  /** Free text written after the tab on the same line ("<- let ring"). */
  note?: string;
}

/** Recognise one line of tab: name prefix, body, a trailing "x2" and a trailing comment. */
function readTabLine(raw: string, index: number): TabLine | null {
  let line = expandTabs(raw).replace(/\s+$/, '');
  let repeat: number | null = null;
  let note: string | undefined;
  const rep = REPEAT_MARK.exec(line);
  if (rep && /[-|]/.test(line.slice(0, rep.index))) {
    repeat = Number(rep[1] ?? rep[2] ?? rep[3] ?? rep[4]);
    line = line.slice(0, rep.index).replace(/\s+$/, '');
  }
  // A comment after the last bar line ("|  <- let this ring"): words, not tab signs.
  const lastBar = line.lastIndexOf('|');
  if (lastBar > 0) {
    const tail = line.slice(lastBar + 1);
    if (/^\s+\S/.test(tail) && /[A-Za-z]{2}|[<>=]{2}|["'!?,;]/.test(tail) && !TAB_BODY.test(tail.trim())) {
      note = tail.trim();
      line = line.slice(0, lastBar + 1);
    }
  }
  const m = STRING_NAME.exec(line)!;
  const name = m[1] ?? m[2] ?? null;
  // A name needs a separator or the dashes right after it; otherwise it is part of the body.
  if (name && !m[3] && line[m[0].length] !== '-') return null;
  const offset = m[3] === '|' || m[3] === ':' ? m[0].length - 1 : m[0].length;
  const body = line.slice(offset);
  if (body.length < 6) return null;
  if (!TAB_BODY.test(body)) return null;
  const dashes = (body.match(/-/g) ?? []).length;
  // Dense lines full of technique signs ("-12b14r12p10h12-|") still count when bar lines frame them.
  const framed = body.startsWith('|') || body.endsWith('|') || name !== null;
  if (dashes < Math.max(3, body.length * (framed ? 0.15 : 0.3))) return null;
  return { index, name, offset, body, repeat, ...(note ? { note } : {}) };
}

/**
 * Cut a run of consecutive tab lines into systems. String names that repeat with a period (e B G D A E e B …)
 * mark where each system starts; without names a run of 4–8 lines is one system and longer runs
 * are cut into sixes (or fours, sevens …) when they divide evenly.
 */
function splitRun(run: TabLine[]): TabLine[][] {
  const n = run.length;
  const names = run.map((l) => l.name?.toLowerCase() ?? null);
  const named = names.filter(Boolean).length >= n * 0.75;
  const periodic = (p: number) => names.every((x, i) => !x || !names[i % p] || x === names[i % p]);
  if (named) {
    for (let p = 4; p <= Math.min(8, n); p++) if (n % p === 0 && periodic(p)) return chunk(run, p);
  }
  if (n >= 4 && n <= 8) return [run];
  for (const p of [6, 4, 7, 5, 8]) if (n % p === 0 && (!named || periodic(p))) return chunk(run, p);
  // Uneven: a repeated top name starts a new system once the current one has four strings.
  const out: TabLine[][] = [];
  let cur: TabLine[] = [];
  for (const l of run) {
    if (cur.length >= 4 && names[0] && l.name?.toLowerCase() === names[0] && (cur.length >= 6 || l.name === run[0].name)) {
      out.push(cur);
      cur = [];
    }
    cur.push(l);
  }
  out.push(cur);
  return out;
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Note names written together or apart: `DADGAD`, `D A D G B E`, `Eb-Ab-Db-Gb-Bb-Eb`, `C2 G2 C3`. */
function noteList(text: string): string[] | null {
  const t = text.trim();
  if (!t) return null;
  const spaced = t.split(/[\s,\-–/]+/).filter(Boolean);
  if (spaced.length >= 4 && spaced.length <= 8 && spaced.every((n) => /^[A-Ga-g](#|b|♯|♭)?\d?$/.test(n))) return spaced;
  const compact = /^(?:[A-G](?:#|b)?){4,8}$/.exec(t.replace(/\s+/g, ''));
  if (compact) return compact[0].match(/[A-G](?:#|b)?/g);
  return null;
}

/** A tuning named or spelled out in a line of free text ("Tuning: Drop D (D A D G B E)", "Tuned down 1/2 step"), or null. */
function tuningFromText(line: string): number[] | null {
  const m = /\btun(?:ing|ed)\b\s*[:=\-]?\s*(.*)$/i.exec(line);
  const before = /^\s*(.+?)\s+tuning\b/i.exec(line);
  if (!m && !before) return null;
  const v = (m?.[1] ?? '').trim();
  const candidates: string[] = [];
  for (const p of v.matchAll(/[([]([^)\]]*)[)\]]/g)) candidates.push(p[1]);
  const outside = v.replace(/[([][^)\]]*[)\]]/g, ' ').trim();
  candidates.push(outside, outside.split(/[,;]|\bcapo\b/i)[0], v.replace(/[()[\]]/g, ' '));
  if (before) candidates.push(before[1]);
  for (const raw of candidates) {
    const c = raw.trim().replace(/\s*tuning$/i, '').replace(/^(?:is|in|to)\s+/i, '');
    if (!c) continue;
    const known = getTuning(c);
    if (known) return [...known.midi];
    if (/(?:half|1\/2|½)[-\s]*(?:a\s+)?step\s+down|down\s+(?:a\s+)?(?:half|1\/2|½)[-\s]*step|e\s?b\s+standard/i.test(c)) return DEFAULT_TUNINGS[6].map((x) => x - 1);
    if (/(?:whole|full|1)[-\s]*step\s+down|down\s+(?:a\s+)?(?:whole|full|1)[-\s]*step/i.test(c)) return DEFAULT_TUNINGS[6].map((x) => x - 2);
    const names = noteList(c);
    if (names) {
      try {
        return [...customTuning(names.map((x) => x.replace('♯', '#').replace('♭', 'b'))).midi];
      } catch {
        // not note names after all
      }
    }
    if (/^standard\b/i.test(c)) return [...DEFAULT_TUNINGS[6]];
  }
  return null;
}

/** A time signature hint: "Time: 3/4", "(6/8)", "3/4 at 96 bpm" — never "1/2 step down". */
function timeFromText(line: string): TimeSig | null {
  const t = line.trim();
  const keyed = /\b(?:time(?:\s*signature)?|meter|metre)\s*[:=]?\s*(\d{1,2}\s*\/\s*\d{1,2})\b/i.exec(t);
  const alone = /^[([]?(\d{1,2}\/\d{1,2})[)\]]?(?:\s+(?:time|at\b.*|[-–,]?\s*\d{2,3}\s*bpm.*|.*\bbpm\b.*))?$/i.exec(t);
  const hit = keyed?.[1] ?? alone?.[1];
  if (!hit) return null;
  const sig = parseTimeSig(hit.replace(/\s+/g, ''));
  if (!sig || sig.numerator < 2 || sig.denominator < 2 || sig.denominator > 16) return null;
  return sig;
}

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };

/** A capo hint: "Capo 2", "capo on the 3rd fret", "Capo: II"; 0 for "no capo"; null when the line says nothing. */
function capoFromText(line: string): number | null {
  if (/\bno\s+capo\b|\bcapo\s*[:=]?\s*(?:none|no|0|-)\b/i.test(line)) return 0;
  const m = /\bcapo\b\s*[:=]?\s*(?:on\s+|at\s+)?(?:the\s+)?(?:fret\s*)?(\d{1,2}|[ivx]{1,4})\b(?:st|nd|rd|th)?/i.exec(line)
    ?? /\bcapo\b\s*[:=]?\s*(?:on\s+|at\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\s+fret/i.exec(line);
  if (!m) return null;
  const v = /^\d+$/.test(m[1]) ? Number(m[1]) : ROMAN[m[1].toLowerCase()];
  return v !== undefined && v >= 0 && v <= 12 ? v : null;
}

/** Standard tunings by string count (low to high). */
const DEFAULT_TUNINGS: Record<number, number[]> = {
  4: [28, 33, 38, 43],
  5: [23, 28, 33, 38, 43],
  6: [40, 45, 50, 55, 59, 64],
  7: [35, 40, 45, 50, 55, 59, 64],
  8: [30, 35, 40, 45, 50, 55, 59, 64],
};

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** A tuning from string-name prefixes (top line first), each string the octave nearest to standard. */
function tuningFromNames(names: string[]): number[] | null {
  const base = DEFAULT_TUNINGS[names.length];
  if (!base) return null;
  const low = [...names].reverse();
  const out: number[] = [];
  for (let i = 0; i < low.length; i++) {
    const m = /^([A-Ga-g])([#b]?)/.exec(low[i]);
    if (!m) return null;
    const pc = (PC[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
    const ref = base[i];
    let best = ref;
    let bestDist = Infinity;
    for (let midi = ref - 7; midi <= ref + 6; midi++) {
      if ((midi % 12 + 12) % 12 !== pc) continue;
      // Prefer the lower octave on a tie: retuning is down far more often than up.
      const d = Math.abs(midi - ref) + (midi > ref ? 0.5 : 0);
      if (d < bestDist) {
        best = midi;
        bestDist = d;
      }
    }
    out.push(best);
  }
  return out;
}

interface RawNote {
  col: number;
  /** Last column of the fret number (two-digit frets take two). */
  end: number;
  string: number;
  fret: number;
  tech: Partial<Note>;
}

/** Read the notes of one string line between two columns. Techniques are attached to their notes. */
function readStringSegment(body: string, from: number, to: number, string: number, warn: (m: string) => void): RawNote[] {
  const notes: RawNote[] = [];
  let pending: Partial<Note> = {};
  let i = from;
  const last = () => notes[notes.length - 1];
  const readNumber = (at: number): { value: number; len: number } | null => {
    const m = /^\d{1,2}/.exec(body.slice(at, to));
    if (!m) return null;
    // Two digits make one fret up to 24; "35" is a 3 and a 5 written without a dash.
    if (m[0].length === 2 && Number(m[0]) > 24) return { value: Number(m[0][0]), len: 1 };
    return { value: Number(m[0]), len: m[0].length };
  };
  while (i < to) {
    const c = body[i];
    if (/\d/.test(c)) {
      const n = readNumber(i)!;
      notes.push({ col: i, end: i + n.len - 1, string, fret: n.value, tech: pending });
      pending = {};
      i += n.len;
      continue;
    }
    switch (c) {
      case 'h': case 'H':
        pending.legato = 'hammer';
        break;
      case 'p': case 'P':
        if (body[i + 1] === 'M' || body[i + 1] === 'm') {
          i++;
          break;
        }
        pending.legato = 'pull';
        break;
      case '/': case '\\': case 's': case 'S': {
        const prev = last();
        const nextDigit = /[\d(<]/.test(body[i + 1] ?? '');
        // Ghost and harmonic notes end one column after their number, at the ")" or ">".
        const touching = prev && (prev.end + 1 === i || (prev.end + 2 === i && /[)>\]]/.test(body[i - 1])));
        if (touching && nextDigit) pending.slide = c === '\\' ? 'down' : 'up';
        else if (nextDigit) pending.slideIn = c === '\\' ? 'above' : 'below';
        else if (touching) prev!.tech.slideOut = c === '\\' ? 'down' : 'up';
        break;
      }
      case 'b': case '^': {
        const prev = last();
        const paren = body[i + 1] === '(';
        const target = paren ? readNumber(i + 2) : readNumber(i + 1);
        if (prev) {
          const amount = target ? Math.max(0.5, Math.min(4, target.value - prev.fret)) : 2;
          prev.tech.bend = { ...(prev.tech.bend ?? {}), amount };
        }
        if (target) i += target.len + (paren ? 2 : 0);
        break;
      }
      case 'r': case 'R': {
        const prev = last();
        const paren = body[i + 1] === '(';
        const target = paren ? readNumber(i + 2) : readNumber(i + 1);
        if (prev?.tech.bend) prev.tech.bend.release = true;
        if (target) i += target.len + (paren ? 2 : 0);
        break;
      }
      case '~': case 'v': {
        const prev = last();
        if (prev) prev.tech.vibrato = true;
        break;
      }
      case 'x': case 'X':
        notes.push({ col: i, end: i, string, fret: 0, tech: { ...pending, dead: true } });
        pending = {};
        break;
      case '(': {
        const n = readNumber(i + 1);
        if (n && body[i + 1 + n.len] === ')') {
          notes.push({ col: i + 1, end: i + n.len, string, fret: n.value, tech: { ...pending, ghost: true } });
          pending = {};
          i += n.len + 2;
          continue;
        }
        break;
      }
      case '<': case '[': {
        const n = readNumber(i + 1);
        const close = c === '<' ? '>' : ']';
        if (n && body[i + 1 + n.len] === close) {
          notes.push({ col: i + 1, end: i + n.len, string, fret: n.value, tech: { ...pending, harmonic: 'natural' } });
          pending = {};
          i += n.len + 2;
          continue;
        }
        break;
      }
      case 't': case 'T':
        pending.tap = true;
        break;
      case '-': case '|': case ' ': case '.': case '=': case ':': case '*': case '>': case ']': case ')': case '+': case '{': case '}': case '%':
        break;
      default:
        warn(`Unknown tab sign "${c}" ignored.`);
    }
    i++;
  }
  return notes;
}

/**
 * Bar-line columns of a system: where (almost) every string has a "|", or every string a ":" that
 * stands alone (tabs that draw bar lines with colons). A ":" beside a "|" is a repeat sign instead.
 */
function barColumns(bodies: string[]): Array<{ start: number; end: number }> {
  const width = Math.max(...bodies.map((b) => b.length));
  const pipes = (c: number) => bodies.filter((b) => b[c] === '|').length;
  const need = Math.max(2, bodies.length - 1);
  const runs: Array<{ start: number; end: number }> = [];
  for (let c = 0; c < width; c++) {
    const colonBar = bodies.every((b) => b[c] === ':') && pipes(c - 1) < need && pipes(c + 1) < need;
    if (pipes(c) >= need || colonBar) {
      // "||" is one bar line.
      const last = runs[runs.length - 1];
      if (last && last.end === c - 1) last.end = c;
      else runs.push({ start: c, end: c });
    }
  }
  return runs;
}

/**
 * Steps per bar to try, coarse first: in simple time quarters, eighths, sixteenths, then triplets;
 * in compound time (6/8, 9/8, 12/8, `beats` = dotted quarters) the beat, eighths, sixteenths, then duplets.
 */
function grids(beats: number, compound: boolean): Array<{ steps: number; odd: boolean }> {
  return compound
    ? [{ steps: beats, odd: false }, { steps: beats * 3, odd: false }, { steps: beats * 6, odd: false }, { steps: beats * 2, odd: true }, { steps: beats * 4, odd: true }, { steps: beats * 12, odd: false }]
    : [{ steps: beats, odd: false }, { steps: beats * 2, odd: false }, { steps: beats * 4, odd: false }, { steps: beats * 3, odd: true }, { steps: beats * 6, odd: true }, { steps: beats * 8, odd: false }];
}

/**
 * Onset columns of one bar laid on the grid that fits best. Columns are read through a scale
 * ("columns per step") that is either the bar's own width over the steps (the tab is drawn to
 * scale) or one derived from the gaps between notes (hand-typed tab: the same gap means the same
 * length, and the last note takes up whatever padding ends the bar). Coarse grids, plain values
 * and scales close to the bar's own are preferred. Returns slot indexes (strictly increasing).
 */
function quantizeBar(cols: number[], from: number, to: number, beats: number, compound: boolean, barTicks: number): { slots: number[]; steps: number; error: number } {
  const lead = cols[0] - from;
  // The dash right after a bar line is decoration ("|-0---"), not time.
  const width = Math.max(1, to - from - (lead >= 1 ? 1 : 0));
  const late = lead > Math.max(3, width * 0.18);
  const gaps = [...new Set(cols.slice(1).map((c, i) => c - cols[i]))];
  let best = { slots: cols.map((_, i) => i), steps: Math.max(beats, cols.length), error: Infinity, score: Infinity };
  grids(beats, compound).forEach(({ steps, odd }, rank) => {
    if (steps < cols.length) return;
    const ticks = barTicks / steps;
    const uProp = width / steps;
    const scales = new Set([uProp]);
    for (const g of gaps) for (let m = 1; m <= 8; m++) if (g / m >= uProp / 2.5 && g / m <= uProp * 2.5) scales.add(g / m);
    for (const u of scales) {
      const x0 = late ? (lead - 1) / u : 0;
      const s0 = late ? Math.max(1, Math.round(x0)) : 0;
      const slots: number[] = [];
      let error = Math.abs(x0 - s0);
      for (const c of cols) {
        const x = s0 + (c - cols[0]) / u;
        let q = Math.round(x);
        if (slots.length && q <= slots[slots.length - 1]) {
          q = slots[slots.length - 1] + 1;
          error += 0.5;
        }
        error += Math.abs(x - q);
        slots.push(q);
      }
      const lastSlot = slots[slots.length - 1];
      if (lastSlot >= steps) continue;
      const lengths = slots.map((s, i) => (i + 1 < slots.length ? slots[i + 1] : steps) - s);
      const awkward = lengths.reduce((sum, d) => sum + plainness(d * ticks), 0) + (s0 ? plainness(s0 * ticks) : 0);
      // A last note held far longer than the room it is written in: some padding is normal, a lot is not.
      const room = (to - cols[cols.length - 1]) / u;
      const overhang = Math.max(0, steps - lastSlot - room - 1) / steps;
      const score = error / (cols.length + (late ? 1 : 0)) + 0.25 * Math.abs(Math.log(u / uProp)) + 0.4 * overhang + awkward + rank * 0.035 + (odd ? 0.04 : 0);
      if (score < best.score) best = { slots, steps, error: error / steps, score };
    }
  });
  return { slots: best.slots, steps: best.steps, error: best.error };
}

/** How unusual a length is to write: 0 for a plain value, more for dots and tuplets, most when it needs a tie. */
function plainness(ticks: number): number {
  const v = valueFromTicks(ticks);
  if (!v) return 0.08;
  if (v.tuplet) return 0.04;
  return v.dots === 2 ? 0.06 : v.dots ? 0.02 : 0;
}

/** Durations from a rhythm row ("q  q  e e h", "Q. E H") written above the staff, by column. */
interface TimingMark { col: number; ticks: number }

const TIMING_VALUE: Record<string, number> = { w: 3840, h: 1920, q: 960, e: 480, s: 240, t: 120, x: 60 };

/** A line that is only rhythm letters (w h q e s t, optional dots, "3" for a triplet), or null. */
function timingRow(line: string): TimingMark[] | null {
  const marks: TimingMark[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const w = m[0];
    if (/^[|:+-]+$/.test(w)) continue;
    const t = /^([whqestWHQEST])(\.{0,2})(3)?$/.exec(w);
    if (!t) return null;
    let ticks = TIMING_VALUE[t[1].toLowerCase()];
    let add = ticks / 2;
    for (let d = 0; d < t[2].length; d++) {
      ticks += add;
      add /= 2;
    }
    if (t[3]) ticks = (ticks * 2) / 3;
    marks.push({ col: m.index, ticks });
  }
  return marks.length ? marks : null;
}

interface SystemData {
  lines: TabLine[];
  above: string[];
  below: string[];
  repeat: number | null;
  /** A section header ("[Verse]", "Chorus:") written before the system. */
  section?: string;
}

const SECTION_HEADER = /^\s*(?:\[\s*([^\]]{1,30}?)\s*\]|((?:intro|verse|pre-?chorus|chorus|bridge|outro|interlude|solo|refrain|instrumental|coda|ending|riff|theme|variation|part)\b(?:\s*\d{1,2}|\s+[a-z])?))\s*:?\s*(?:\(([^)]{0,30})\))?\s*$/i;

/** A section name from a header line ("[Verse 1]", "Chorus:", "Intro (x2)"), or null. */
function sectionHeader(line: string): string | null {
  const m = SECTION_HEADER.exec(line);
  if (!m) return null;
  const name = (m[1] ?? m[2]).trim().replace(/\s+/g, ' ');
  if (/^\d+(,\d+)*$/.test(name) || isChordLine(name)) return null;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** "x2", "(x4)", "Repeat 3x", "play twice" on a line of its own: how many times the system is played. */
function repeatLine(line: string): number | null {
  const m = /^\s*[([]?\s*(?:[x×]\s?(\d{1,2})|(\d{1,2})\s?[x×]|repeat(?:\s*[x×]?\s*(\d{1,2})\s*[x×]?)?(?:\s+times)?|play\s+(?:(?:it|this)\s+)?(twice|\d{1,2}\s*times))\s*[)\]]?\s*$/i.exec(line);
  if (!m) return null;
  const v = m[1] ?? m[2] ?? m[3] ?? m[4];
  if (v === undefined) return 2;
  if (/twice/i.test(v)) return 2;
  const n = parseInt(v, 10);
  return n >= 2 && n <= 16 ? n : null;
}

/** Import ASCII tab text. Never throws; a text without any tab gives an empty song and a warning. */
export function importAsciiTab(text: string, opts: AsciiTabOptions = {}): ImportResult {
  const warnings: ImportWarning[] = [];
  const rawLines = normalizeTabText(text).split(/\r\n|\r|\n/);
  const parsed = rawLines.map((l, i) => readTabLine(l, i));

  // Systems: runs of consecutive tab lines, cut where string names start over.
  const systems: SystemData[] = [];
  let run: TabLine[] = [];
  const flush = () => {
    // A separator line of dashes at the edge of a run of framed tab lines is not a string.
    const framed = (l: TabLine) => l.body.includes('|') || l.name !== null;
    while (run.length > 4 && !framed(run[0]) && framed(run[1]) && !/\d/.test(run[0].body)) run.shift();
    while (run.length > 4 && !framed(run[run.length - 1]) && framed(run[run.length - 2]) && !/\d/.test(run[run.length - 1].body)) run.pop();
    if (run.length >= 3) {
      for (const c of splitRun(run)) {
        if (c.length < 4 || c.length > 8) {
          warnings.push({ message: `A group of ${c.length} tab lines was skipped: a system has 4 to 8 strings.`, line: c[0].index + 1, confidence: 0.3 });
          continue;
        }
        systems.push({ lines: c, above: [], below: [], repeat: c.map((x) => x.repeat).find((r) => r !== null) ?? null });
      }
    }
    run = [];
  };
  parsed.forEach((p) => {
    if (p) run.push(p);
    else flush();
  });
  flush();

  if (!systems.length) {
    const song = createSong({ meta: { title: opts.title ?? 'Imported tab' }, bpm: opts.tempo ?? 90 });
    return { song, warnings: [{ message: 'No tab lines were found in the text.', confidence: 0 }], confidence: 0, estimatedRhythm: true };
  }
  const counts = [...new Set(systems.map((s) => s.lines.length))];
  if (counts.length > 1) {
    // Mixed string counts: keep the systems of the first one (a stray short group is noise, not a second instrument).
    const keep = systems[0].lines.length;
    const dropped = systems.filter((s) => s.lines.length !== keep);
    for (const d of dropped) warnings.push({ message: `A system of ${d.lines.length} lines was skipped: the tab's other systems have ${keep} strings.`, line: d.lines[0].index + 1, confidence: 0.3 });
    systems.splice(0, systems.length, ...systems.filter((s) => s.lines.length === keep));
  }

  // Text around each system: up to three lines above (chords, PM marks, rhythm) and lyrics below.
  const used = new Set(systems.flatMap((s) => s.lines.map((l) => l.index)));
  for (const s of systems) {
    const first = s.lines[0].index;
    const last = s.lines[s.lines.length - 1].index;
    for (let i = first - 1; i >= Math.max(0, first - 3) && !used.has(i) && rawLines[i].trim(); i--) s.above.unshift(expandTabs(rawLines[i]));
    for (let i = last + 1; i <= Math.min(rawLines.length - 1, last + 2) && !used.has(i) && rawLines[i].trim(); i++) s.below.push(expandTabs(rawLines[i]));
  }
  systems.forEach((s, k) => {
    // A section header anywhere between the previous system and this one; a repeat note under the system.
    const from = k === 0 ? 0 : systems[k - 1].lines[systems[k - 1].lines.length - 1].index + 1;
    for (let i = s.lines[0].index - 1; i >= from; i--) {
      const h = sectionHeader(rawLines[i]);
      if (h) {
        s.section = h;
        break;
      }
    }
    if (s.repeat === null) {
      const r = [...s.below.slice(0, 1), ...s.above.slice(-1)].map(repeatLine).find((x) => x !== null);
      if (r) s.repeat = r;
    }
  });

  // Hints in the free text.
  const free = rawLines.filter((_, i) => !used.has(i));
  const strings = systems[0].lines.length;
  let tuning = opts.tuning ?? null;
  let tuningSource = 'given';
  if (!tuning) {
    for (const l of free) {
      const t = tuningFromText(l);
      if (t && t.length === strings) {
        tuning = t;
        tuningSource = `the "${l.trim().slice(0, 60)}" line`;
        break;
      }
    }
  }
  if (!tuning) {
    const names = systems[0].lines.map((l) => l.name);
    const fromNames = names.every((n) => n && !/^\d$/.test(n)) ? tuningFromNames(names as string[]) : null;
    if (fromNames) {
      tuning = fromNames;
      tuningSource = 'the string names';
    } else {
      tuning = DEFAULT_TUNINGS[strings] ?? DEFAULT_TUNINGS[6];
      tuningSource = 'none';
      warnings.push({ message: `No tuning was given; assuming ${strings === 4 ? 'standard bass tuning' : strings === 5 ? 'standard five-string bass tuning' : 'standard tuning'}.`, confidence: 0.6 });
    }
  }
  if (tuning.length !== strings) {
    warnings.push({ message: `The tuning has ${tuning.length} strings but the tab has ${strings}; using a standard ${strings}-string tuning.`, confidence: 0.4 });
    tuning = DEFAULT_TUNINGS[strings] ?? DEFAULT_TUNINGS[6];
  } else if (tuningSource !== 'none' && tuningSource !== 'given') {
    warnings.push({ message: `Tuning read from ${tuningSource}.`, confidence: 0.85 });
  }
  const capoHint = free.map(capoFromText).find((c) => c !== null);
  const capo = opts.capo ?? capoHint ?? 0;
  const timeHint = free.map(timeFromText).find(Boolean);
  const time = opts.time ?? timeHint ?? { numerator: 4, denominator: 4 };
  const tempoHint = free.map((l) => /\b(?:tempo|bpm)\b\s*[:=]?\s*(?:♩\s*=?\s*)?(\d{2,3})|(?:♩|\bq)\s*=\s*(\d{2,3})|\b(\d{2,3})\s*bpm\b/i.exec(l)).find(Boolean);
  const tempoValue = tempoHint ? Number(tempoHint[1] ?? tempoHint[2] ?? tempoHint[3]) : NaN;
  const tempo = opts.tempo ?? (tempoValue >= 20 && tempoValue <= 400 ? tempoValue : 90);
  const titleLine = free.map((l) => /^\s*(?:title|song)\s*[:\-]\s*(.+)$/i.exec(l)).find(Boolean);
  const artistLine = free.map((l) => /^\s*(?:artist|by|composer)\s*[:\-]\s*(.+)$/i.exec(l)).find(Boolean);
  let title = opts.title ?? titleLine?.[1].trim();
  if (!title) {
    const firstSystem = systems[0].lines[0].index;
    const candidate = rawLines.slice(0, firstSystem).map((l) => l.trim()).find((l) => l && /[a-z]/i.test(l) && l.length < 60 && !/tun|capo|tempo|bpm|\d\/\d/i.test(l) && !isChordLine(l) && !timingRow(l) && !sectionHeader(l) && repeatLine(l) === null);
    title = candidate ?? 'Imported tab';
  }

  const barTicks = barCapacity(time);
  const compound = time.denominator === 8 && time.numerator % 3 === 0 && time.numerator > 3;
  const gridBeats = compound ? time.numerator / 3 : time.numerator;

  const song: Song = createSong({ meta: { title, ...(artistLine ? { artist: artistLine[1].trim() } : {}), source: 'Imported from ASCII tab' }, tuning, capo, bpm: tempo, time, bars: 1 });
  song.bars = [];
  song.tracks[0].measures = [];
  song.tracks[0].name = 'Tab';
  song.tracks[0].id = 'tab';
  let confidence = 0.75;
  let unknownSigns = 0;
  const warnSign = () => unknownSigns++;
  let noBarSystems = 0;
  let timedBars = 0;
  let spacedBars = 0;

  for (const sys of systems) {
    const bodies = sys.lines.map((l) => l.body);
    const offsets = sys.lines.map((l) => l.offset);
    const align = offsets[0];
    const runs = barColumns(bodies);
    const cols = runs.flatMap((r) => (r.start === r.end ? [r.start] : [r.start, r.end]));
    const width = Math.max(...bodies.map((b) => b.length));
    // Bar segments [from, to) in body columns, between bar lines.
    const segments: Array<{ from: number; to: number }> = [];
    let start = runs.length && runs[0].start <= 1 ? runs[0].end + 1 : 0;
    for (const r of runs) {
      if (r.end < start) continue;
      if (r.start - start >= 2) segments.push({ from: start, to: r.start });
      start = r.end + 1;
    }
    if (width - start >= 4 && bodies.some((b) => /[0-9x]/i.test(b.slice(start)))) segments.push({ from: start, to: width });
    // Repeat signs drawn as "*", "o" or ":" beside bar lines on some (not all) strings.
    const repeatAt = (col: number) => {
      const marks = bodies.filter((b) => b[col] === '*' || b[col] === ':' || b[col] === 'o').length;
      return marks >= 2 && (marks < bodies.length || cols.some((c) => Math.abs(c - col) === 1));
    };
    const firstBarOfSystem = song.bars.length;
    if (sys.section) {
      const last = song.sections[song.sections.length - 1];
      if (last) last.end = firstBarOfSystem;
      if (!last || last.end > last.start) song.sections.push({ name: sys.section, start: firstBarOfSystem, end: firstBarOfSystem });
      else Object.assign(last, { name: sys.section });
    }

    const allNotes: RawNote[] = [];
    sys.lines.forEach((l, k) => allNotes.push(...readStringSegment(l.body, 0, l.body.length, k + 1, warnSign)));
    const pm = markRuns(sys.above, /p\.?\s?m\.?/i, align);
    const ring = markRuns(sys.above, /let\s?ring|l\.r\./i, align);
    const chordLine = [...sys.above].reverse().find((l) => isChordLine(l));
    const chordMarks = chordLine ? chordTokens(chordLine).map((t) => ({ ...t, col: t.col - align })) : [];
    const timingLine = sys.above.map(timingRow).find(Boolean);
    const timing = timingLine ? timingLine.map((t) => ({ ...t, col: t.col - align })) : null;
    // Lyrics sit right under the staff and stay within its width; a sentence running past it is prose.
    const lyricLine = sys.below.slice(0, 1).find((l) => /[a-z]{2}/i.test(l) && !isChordLine(l) && !readTabLine(l, 0) && repeatLine(l) === null && !sectionHeader(l) && !timingRow(l) && l.trimEnd().length <= align + width + 8);
    const syllables = lyricLine ? lyricTokens(lyricLine).map((t) => ({ ...t, col: t.col - align })) : [];
    for (const l of sys.lines) if (l.note) song.annotations.push({ bar: song.bars.length, tick: 0, text: l.note });

    // A long system with no bar line inside it or at its end: the tabber left bars out.
    const closed = runs.some((r) => r.end >= width - 2 && r.start > 1);
    const inner = runs.some((r) => r.start > 1 && r.end < width - 2);
    if (segments.length <= 1 && width > 48 && !closed && !inner) {
      // No bar lines inside a long system: lay the onsets out by their spacing and cut bars by time.
      noBarSystems++;
      const groups = groupOnsets(allNotes);
      if (!groups.length) continue;
      const gaps = groups.slice(1).map((g, i) => g.col - groups[i].col).sort((a, b) => a - b);
      const unit = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 4;
      const eighth = PPQ / 2;
      let tick = 0;
      const onsets: Onset[] = groups.map((g, i) => {
        const o: Onset = { tick, notes: g.notes.map((n) => ({ ...rawToOnsetNote(n, tuning!, capo) })) };
        const next = groups[i + 1];
        const ratio = next ? (next.col - g.col) / unit : 2;
        tick += Math.max(1, Math.round(ratio * 2)) * (eighth / 2);
        return o;
      });
      const total = Math.ceil(tick / barTicks) * barTicks;
      const bars = Array.from({ length: Math.max(1, total / barTicks) }, (_, b) => ({ start: b * barTicks, length: barTicks }));
      const measures = buildMeasures(onsets, bars, { tuning, capo });
      for (const m of measures) {
        song.bars.push({ time: { ...time } });
        song.tracks[0].measures.push(m);
      }
      continue;
    }

    for (const seg of segments) {
      const bar = song.bars.length;
      const notes = allNotes.filter((n) => n.col >= seg.from && n.col < seg.to);
      const groups = groupOnsets(notes);
      const beats: Beat[] = [];
      const simile = bodies.some((b) => b.slice(seg.from, seg.to).includes('%'));
      const previous = song.tracks[0].measures[song.tracks[0].measures.length - 1];
      /** Start tick of each onset group, for chords and lyrics. */
      let startOf: number[] = [];
      if (!groups.length && simile && previous) {
        // "%": play the previous bar again. Its first notes are struck, not tied or slurred from what came before.
        const copy = JSON.parse(JSON.stringify(previous.beats)) as Beat[];
        const first = copy.find((b) => b.notes.length);
        for (const n of first?.notes ?? []) {
          delete n.tie;
          delete n.legato;
          delete n.slide;
        }
        for (const b of copy) delete b.lyric;
        beats.push(...copy);
      } else if (!groups.length) {
        // A silent bar: as the rhythm row splits it, if there is one.
        const rests = timing ? timedBar([], timing, seg, barTicks) : null;
        let at = 0;
        for (const ev of rests?.events ?? []) {
          const v = valueFromTicks(ev.ticks);
          beats.push({ start: at, duration: ev.ticks, notes: [], ...(v ? { value: v } : {}) });
          at += ev.ticks;
        }
        if (at < barTicks) beats.push(...restBeats(at, barTicks));
      } else {
        const toNote = (n: RawNote): Note => {
          const note: Note = { string: n.string, fret: n.fret, midi: midiOf(n.string, n.fret, tuning!, capo), ...n.tech };
          if (pm.some((r) => n.col >= r.from && n.col <= r.to)) note.palmMute = true;
          if (ring.some((r) => n.col >= r.from && n.col <= r.to)) note.letRing = true;
          return note;
        };
        const timed = timing ? timedBar(groups, timing, seg, barTicks) : null;
        if (timed) {
          timedBars++;
          startOf = timed.starts;
          let at = 0;
          for (const ev of timed.events) {
            const g = ev.group === null ? null : groups[ev.group];
            const beat: Beat = { start: at, duration: ev.ticks, notes: g ? g.notes.map(toNote).sort((a, b) => b.string - a.string) : [] };
            const v = valueFromTicks(ev.ticks);
            if (v) beat.value = v;
            beats.push(beat);
            at += ev.ticks;
          }
          if (at < barTicks) beats.push(...restBeats(at, barTicks));
        } else {
          spacedBars++;
          const q = quantizeBar(groups.map((g) => g.col), seg.from, seg.to, gridBeats, compound, barTicks);
          const slot = barTicks / q.steps;
          if (q.error > 0.12) confidence -= 0.02;
          startOf = q.slots.map((s) => s * slot);
          if (q.slots[0] > 0) beats.push(...restBeats(0, q.slots[0] * slot));
          groups.forEach((g, i) => {
            const s = q.slots[i] * slot;
            const e = (i + 1 < groups.length ? q.slots[i + 1] : q.steps) * slot;
            const beat: Beat = { start: s, duration: e - s, notes: g.notes.map(toNote).sort((a, b) => b.string - a.string) };
            const v = valueFromTicks(e - s);
            if (v) beat.value = v;
            beats.push(beat);
          });
        }
        for (const c of chordMarks.filter((c) => c.col >= seg.from - 1 && c.col < seg.to)) {
          const target = [...groups.keys()].reverse().find((i) => groups[i].col <= c.col + 1);
          const tick = target === undefined ? 0 : startOf[target];
          if (!song.chords.some((x) => x.bar === bar && x.tick === tick)) song.chords.push({ bar, tick, symbol: c.text });
        }
        for (const syl of syllables.filter((t) => t.col >= seg.from - 1 && t.col < seg.to)) {
          let best = -1;
          let dist = Infinity;
          groups.forEach((g, i) => {
            const d = Math.abs(g.col - syl.col);
            if (d < dist) {
              best = i;
              dist = d;
            }
          });
          const beat = beats.find((b) => b.notes.length && b.start === startOf[best]);
          if (beat) beat.lyric = beat.lyric ? `${beat.lyric} ${syl.text}` : syl.text;
        }
      }
      song.bars.push({ time: { ...time } });
      song.tracks[0].measures.push({ beats });
      if (repeatAt(seg.from)) song.bars[bar].repeatStart = true;
      if (repeatAt(seg.to - 1)) song.bars[bar].repeatEnd = 2;
    }
    if (sys.repeat && song.bars.length > firstBarOfSystem) {
      song.bars[firstBarOfSystem].repeatStart = true;
      song.bars[song.bars.length - 1].repeatEnd = sys.repeat;
      warnings.push({ message: `Bars ${firstBarOfSystem + 1}–${song.bars.length} are repeated ×${sys.repeat}.`, confidence: 0.8, bar: firstBarOfSystem });
    }
  }

  if (!song.bars.length) {
    song.bars.push({ time: { ...time } });
    song.tracks[0].measures.push({ beats: restBeats(0, barTicks) });
  }
  // A repeat end without a start repeats from the beginning; a start without an end is dropped.
  let open = false;
  for (const b of song.bars) {
    if (b.repeatStart) {
      if (open) delete b.repeatStart;
      else open = true;
    }
    if (b.repeatEnd) open = false;
  }
  if (open) for (const b of song.bars) if (b.repeatStart && !song.bars.slice(song.bars.indexOf(b)).some((x) => x.repeatEnd)) delete b.repeatStart;
  song.annotations = song.annotations.filter((a) => a.bar < song.bars.length);
  const lastSection = song.sections[song.sections.length - 1];
  if (lastSection) lastSection.end = song.bars.length;
  song.sections = song.sections.filter((x) => x.end > x.start);
  connectTechniques(song);
  song.chords.sort((a, b) => a.bar - b.bar || a.tick - b.tick);
  song.meta.id = slugify(title);

  const estimated = spacedBars > 0 || noBarSystems > 0;
  if (estimated) warnings.unshift({ message: 'Rhythm was estimated from the spacing of the tab and may be wrong; listen and check.', confidence: 0.5 });
  if (timedBars) warnings.push({ message: `Rhythm read from the rhythm letters above ${timedBars} bar${timedBars > 1 ? 's' : ''}.`, confidence: 0.8 });
  if (noBarSystems) {
    confidence -= 0.2;
    warnings.push({ message: `${noBarSystems} system${noBarSystems > 1 ? 's have' : ' has'} no bar lines; the bars were guessed.`, confidence: 0.3 });
  }
  if (unknownSigns) {
    confidence -= 0.05;
    warnings.push({ message: `${unknownSigns} unknown sign${unknownSigns > 1 ? 's were' : ' was'} ignored.`, confidence: 0.6 });
  }
  if (!estimated) confidence += 0.1;
  return { song, warnings, confidence: Math.max(0.1, Math.min(0.9, confidence)), estimatedRhythm: estimated };
}

/**
 * A bar timed by a rhythm row: each onset group takes the letter above it, letters over empty
 * columns are rests. Null when a group has no letter or the letters do not fit the bar.
 */
function timedBar(groups: Array<{ col: number }>, marks: TimingMark[], seg: { from: number; to: number }, barTicks: number): { events: Array<{ group: number | null; ticks: number }>; starts: number[] } | null {
  const inBar = marks.filter((m) => m.col >= seg.from - 1 && m.col < seg.to);
  if (!inBar.length) return null;
  const owner = new Map<number, number>();
  for (let gi = 0; gi < groups.length; gi++) {
    let best = -1;
    let dist = Infinity;
    inBar.forEach((m, mi) => {
      const d = Math.abs(m.col - groups[gi].col);
      if (d < dist && !owner.has(mi)) {
        best = mi;
        dist = d;
      }
    });
    if (best < 0 || dist > 1) return null;
    owner.set(best, gi);
  }
  const events = inBar.map((m, mi) => ({ group: owner.get(mi) ?? null, ticks: m.ticks }));
  // Groups must come in the same order as their letters.
  const order = events.map((e) => e.group).filter((g): g is number => g !== null);
  if (order.some((g, i) => i > 0 && g < order[i - 1])) return null;
  const total = events.reduce((s, e) => s + e.ticks, 0);
  if (total > barTicks + 1e-6) return null;
  const starts: number[] = [];
  let at = 0;
  for (const e of events) {
    if (e.group !== null) starts[e.group] = at;
    at += e.ticks;
  }
  return { events, starts };
}

function rawToOnsetNote(n: RawNote, tuning: number[], capo: number) {
  return { string: n.string, fret: n.fret, midi: midiOf(n.string, n.fret, tuning, capo), ...n.tech };
}

/**
 * Notes in the same column form one onset. With two-digit frets a chord is written left-aligned
 * (same first column) or right-aligned (same last column), so "12" over "9" is one chord; numbers
 * that only overlap ("10" then "13" one column later) follow each other.
 */
function groupOnsets(notes: RawNote[]): Array<{ col: number; notes: RawNote[] }> {
  const sorted = [...notes].sort((a, b) => a.col - b.col || a.string - b.string);
  const groups: Array<{ col: number; notes: RawNote[] }> = [];
  for (const n of sorted) {
    const g = groups[groups.length - 1];
    const aligned = g && g.notes.some((x) => x.col === n.col || x.end === n.end || (n.col >= x.col && n.end <= x.end));
    if (g && aligned && !g.notes.some((x) => x.string === n.string) && !n.tech.legato && !n.tech.slide) g.notes.push(n);
    else groups.push({ col: n.col, notes: [n] });
  }
  return groups;
}

/** Ties, legato and slides only make sense from a previous note on the same string; drop them otherwise. */
function connectTechniques(song: Song): void {
  const last = new Map<number, Note>();
  for (const m of song.tracks[0].measures) {
    for (const b of m.beats) {
      if (!b.notes.length) last.clear();
      for (const n of b.notes) {
        const prev = last.get(n.string);
        if (n.legato || n.slide) {
          if (!prev || prev.fret === n.fret) {
            if (n.slide && !prev) n.slideIn = n.slide === 'up' ? 'below' : 'above';
            delete n.legato;
            delete n.slide;
          } else {
            if (n.legato) n.legato = n.fret > prev.fret ? 'hammer' : 'pull';
            if (n.slide) n.slide = n.fret > prev.fret ? 'up' : 'down';
          }
        }
      }
      for (const n of b.notes) last.set(n.string, n);
    }
  }
}

/** Column runs of a marking such as "PM----|" in the lines above a system. */
function markRuns(lines: string[], re: RegExp, align: number): Array<{ from: number; to: number }> {
  const runs: Array<{ from: number; to: number }> = [];
  for (const l of lines) {
    const g = new RegExp(re.source, 'gi');
    let m: RegExpExecArray | null;
    while ((m = g.exec(l))) {
      let end = m.index + m[0].length;
      while (end < l.length && /[-.|_ ]/.test(l[end]) && !(l[end] === ' ' && l[end + 1] === ' ')) end++;
      runs.push({ from: m.index - align, to: end - align });
    }
  }
  return runs;
}

/** True when every word on the line is a chord symbol (or a bar line, beat mark "/ . %", or repeat mark). */
export function isChordLine(line: string): boolean {
  const words = line.replace(/\|/g, ' | ').trim().split(/\s+/).filter((w) => w && !/^[|/%.:\-]+$/.test(w) && !/^\(?[x×]\d+\)?$/i.test(w) && !/^\(?\d+[x×]\)?$/i.test(w));
  if (!words.length) return false;
  return words.every((w) => isChordWord(w));
}

/** A word that reads as a chord symbol (`Am7`, `G/B`, `N.C.`, `(C)`). */
export function isChordWord(w: string): boolean {
  const word = w.replace(/^[(\[]|[)\]]$/g, '').replace(/\*+$/, '');
  if (!word) return false;
  return isNoChord(word) || (/^[A-G]/.test(word) && !!parseChord(word));
}

function chordTokens(line: string): Array<{ col: number; text: string }> {
  const out: Array<{ col: number; text: string }> = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const word = m[0].replace(/^[(\[]|[)\]]$/g, '').replace(/\*+$/, '');
    if (isChordWord(m[0]) && !isNoChord(word)) out.push({ col: m.index, text: word });
  }
  return out;
}

function lyricTokens(line: string): Array<{ col: number; text: string }> {
  const out: Array<{ col: number; text: string }> = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    // "A-maz-ing" sung over three notes: three syllables at their own columns.
    let offset = 0;
    for (const part of m[0].split(/(?<=-)(?=[^-])/)) {
      out.push({ col: m.index + offset, text: part });
      offset += part.length;
    }
  }
  return out;
}
