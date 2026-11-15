/**
 * Every mistake of a recognised page against its ground truth, listed and drawn: missed and
 * invented note heads / tab numbers, wrong pitches, frets, durations, time signatures. Used by
 * `cli.cjs --mistakes` to look at failures on unseen material (the picture is the fastest way to
 * see why something was misread).
 */
import { Canvas, COLORS } from './draw';
import { writePng } from './png';
import type { GrayImage } from '../image/gray';
import { type OmrNotationEvent, type OmrNote, type OmrPage, type OmrTabEvent, type OmrTabNote, isNotationEvent, isTabEvent } from '../types';
import { matchPoints, matchStaves } from './metrics';
import type { GroundTruth, GtNotationEvent, GtNote, GtTabEvent, GtTabNote } from './truth';

/** One mistake. */
export interface Mistake {
  kind: 'missed-note' | 'extra-note' | 'pitch' | 'duration' | 'missed-tab' | 'extra-tab' | 'fret' | 'string' | 'tab-duration' | 'time' | 'key' | 'staff';
  x: number;
  y: number;
  /** "want 7 got 1" etc. */
  detail: string;
  /** Confidence the reader gave its (wrong) reading, when there was one. */
  confidence?: number;
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nm = (m: number): string => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
const centre = (b: { x: number; y: number; w: number; h: number }): { x: number; y: number } => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const centreOf = (b: [number, number, number, number]): { x: number; y: number } => ({ x: b[0] + b[2] / 2, y: b[1] + b[3] / 2 });
const durName = (d: { value: string; dots: number; tuplet?: unknown }): string => `${d.value}${'.'.repeat(d.dots)}${d.tuplet ? '(3)' : ''}`;

/** List the mistakes of a page (same matching rules as `scorePage`). */
export function listMistakes(page: OmrPage, truth: GroundTruth): Mistake[] {
  const out: Mistake[] = [];
  for (const m of matchStaves(page, truth)) {
    const g = m.truth;
    const d = m.detected;
    if (!d) {
      out.push({ kind: 'staff', x: g.x0, y: g.lines[0][0].y, detail: `${g.kind} staff not found` });
      continue;
    }
    if (g.kind === 'notation') {
      const gHeads: { n: GtNote; e: GtNotationEvent }[] = [];
      for (const mm of g.measures) for (const e of mm.events) for (const n of e.notes) gHeads.push({ n, e });
      const dHeads: { n: OmrNote; e: OmrNotationEvent }[] = [];
      for (const mm of d.measures) for (const e of mm.events) if (isNotationEvent(e)) for (const n of e.notes) dHeads.push({ n, e });
      const pairs = matchPoints(gHeads.map((h) => centreOf(h.n.head)), dHeads.map((h) => centre(h.n.bbox)), 0.6 * g.space);
      const gi = new Set(pairs.map((p) => p[0]));
      const di = new Set(pairs.map((p) => p[1]));
      gHeads.forEach((h, i) => { if (!gi.has(i)) out.push({ kind: 'missed-note', ...centreOf(h.n.head), detail: `missed ${nm(h.n.midi)} ${durName(h.e.duration)}` }); });
      dHeads.forEach((h, i) => { if (!di.has(i)) out.push({ kind: 'extra-note', ...centre(h.n.bbox), detail: `extra ${nm(h.n.pitch.midi)}`, confidence: h.n.confidence }); });
      const seen = new Set<GtNotationEvent>();
      for (const [a, b] of pairs) {
        const gh = gHeads[a];
        const dh = dHeads[b];
        if (gh.n.midi !== dh.n.pitch.midi) out.push({ kind: 'pitch', ...centre(dh.n.bbox), detail: `want ${nm(gh.n.midi)} got ${nm(dh.n.pitch.midi)}`, confidence: dh.n.confidence });
        if (seen.has(gh.e)) continue;
        seen.add(gh.e);
        const gd = gh.e.duration;
        const dd = dh.e.duration;
        const same = gd.value === dd.value && gd.dots === dd.dots && !!gd.tuplet === !!dd.tuplet;
        if (!same) out.push({ kind: 'duration', ...centre(dh.e.bbox), detail: `want ${durName(gd)} got ${durName(dd)}`, confidence: dd.confidence });
      }
      if (g.time && !(d.timeSignature && d.timeSignature.beats === g.time.num && d.timeSignature.beatValue === g.time.den)) {
        out.push({ kind: 'time', x: g.x0 + 3 * g.space, y: g.lines[0][0].y, detail: `want ${g.time.num}/${g.time.den} got ${d.timeSignature ? `${d.timeSignature.beats}/${d.timeSignature.beatValue}` : 'none'}` });
      }
      if (g.key && (d.keySignature?.fifths ?? 0) !== g.key.fifths) out.push({ kind: 'key', x: g.x0 + 2 * g.space, y: g.lines[0][0].y, detail: `want ${g.key.fifths} got ${d.keySignature?.fifths ?? 'none'}` });
    } else {
      const gN: { n: GtTabNote; e: GtTabEvent }[] = [];
      for (const mm of g.measures) for (const e of mm.events) for (const n of e.notes) gN.push({ n, e });
      const dN: { n: OmrTabNote; e: OmrTabEvent }[] = [];
      for (const mm of d.measures) for (const e of mm.events) if (isTabEvent(e)) for (const n of e.notes) dN.push({ n, e });
      const pairs = matchPoints(gN.map((h) => centreOf(h.n.bbox)), dN.map((h) => centre(h.n.bbox)), 0.6 * g.space);
      const gi = new Set(pairs.map((p) => p[0]));
      const di = new Set(pairs.map((p) => p[1]));
      gN.forEach((h, i) => { if (!gi.has(i)) out.push({ kind: 'missed-tab', ...centreOf(h.n.bbox), detail: `missed ${h.n.fret} on ${h.n.string}` }); });
      dN.forEach((h, i) => { if (!di.has(i)) out.push({ kind: 'extra-tab', ...centre(h.n.bbox), detail: `extra ${h.n.fret} on ${h.n.string}`, confidence: h.n.confidence }); });
      const seen = new Set<GtTabEvent>();
      for (const [a, b] of pairs) {
        const gn = gN[a];
        const dn = dN[b];
        if (gn.n.fret !== dn.n.fret) out.push({ kind: 'fret', ...centre(dn.n.bbox), detail: `want ${gn.n.fret} got ${dn.n.fret}`, confidence: dn.n.confidence });
        if (gn.n.string !== dn.n.string) out.push({ kind: 'string', ...centre(dn.n.bbox), detail: `want s${gn.n.string} got s${dn.n.string}`, confidence: dn.n.confidence });
        if (!g.stems || seen.has(gn.e)) continue;
        seen.add(gn.e);
        const dd = dn.e.duration;
        if (!dd || dd.value !== gn.e.duration.value || dd.dots !== gn.e.duration.dots) out.push({ kind: 'tab-duration', ...centre(dn.e.bbox), detail: `want ${durName(gn.e.duration)} got ${dd ? durName(dd) : 'none'}`, confidence: dd?.confidence });
      }
    }
  }
  return out;
}

/** Draw the page dimmed with every mistake circled and labelled. */
export function dumpMistakes(path: string, gray: GrayImage, mistakes: Mistake[], space: number): void {
  const c = Canvas.fromGray(gray, 0.55);
  const r = Math.max(4, 0.8 * space);
  for (const m of mistakes) {
    const col = m.kind.startsWith('missed') || m.kind === 'staff' ? COLORS.red : m.kind.startsWith('extra') ? COLORS.orange : COLORS.magenta;
    c.rect(m.x - r, m.y - r, 2 * r, 2 * r, col, 2);
    c.text(m.x + r + 1, m.y - r, m.detail, col, space >= 14 ? 2 : 1);
  }
  writePng(path, c.image());
}
