/**
 * Strip cache for developing the tab reader (Node only). Degrading a fixture, analysing the page
 * and cutting the staff strips takes far longer than reading the strips, so the strips of every
 * tab staff of the corpus are written to disk once, with the ground truth already moved into
 * strip coordinates; the evaluation loop in `evaluate.ts` then only runs the recognizer.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { dumpDir } from '../../eval/debug';
import { type DegradeTier, degrade } from '../../eval/degrade';
import { loadFixture, loadManifest } from '../../eval/fixtures';
import { matchStaves } from '../../eval/metrics';
import { tierSeed } from '../../eval/runner';
import type { FixtureMeta, GroundTruth, GtTabStaff } from '../../eval/truth';
import { analyzePage, extractStaff } from '../../page';
import type { BarlineType, DurationValue, StaffInput } from '../../types';

/** A ground-truth fret number in strip coordinates. */
export interface CachedNote {
  string: number;
  fret: number;
  /** x0, y0, x1, y1 in strip px. */
  box: [number, number, number, number];
  event: number;
}

/** A ground-truth event in strip coordinates. */
export interface CachedEvent {
  type: 'note' | 'rest';
  x: number;
  measure: number;
  value: DurationValue;
  dots: number;
  tuplet?: { actual: number; normal: number };
  hidden: boolean;
  /** Box of a drawn rest. */
  box?: [number, number, number, number];
}

/** Everything about one cached staff strip except its pixels. */
export interface CachedStripMeta {
  fixture: string;
  subset: string;
  tier: DegradeTier;
  staffIndex: number;
  staffId: string;
  width: number;
  height: number;
  lineCount: number;
  kindConfidence: number;
  space: number;
  lineThickness: number;
  lineYs: number[];
  x0: number;
  x1: number;
  barlines: { x: number; x0: number; x1: number; type: BarlineType; confidence: number }[];
  measures: { index: number; x0: number; x1: number }[];
  scale: number;
  sourceSpace: number;
  partnerIndex?: number;
  tabFont: string | null;
  dpi: number;
  stems: boolean;
  lineThrough: boolean;
  notes: CachedNote[];
  events: CachedEvent[];
  /** Truth measures in strip px. */
  truthMeasures: { x0: number; x1: number }[];
  time: { num: number; den: number } | null;
}

/** The cache of one fixture at one tier. */
export interface CachedPage {
  fixture: string;
  tier: DegradeTier;
  strips: CachedStripMeta[];
  /** Tab staves of the truth that the layout did not find (or did not call tab), with their note counts. */
  missed: { notes: number; measures: number }[];
}

/** Where the cache lives (git-ignored). */
export function cacheDir(): string {
  return process.env.OMR_TAB_CACHE || join(dumpDir(), 'tab-cache');
}

const pageFile = (id: string, tier: string, seed: number): string => join(cacheDir(), `${id}.${tier}.s${seed}.json`);
const stripFile = (id: string, tier: string, seed: number, k: number): string => join(cacheDir(), `${id}.${tier}.s${seed}.${k}.bin.gz`);

/** Fixtures that contain a tab staff. */
export function tabFixtures(match?: string): FixtureMeta[] {
  return loadManifest().filter((m) => m.subset !== 'notation' && (!match || m.id.includes(match)));
}

function boxToStrip(input: StaffInput, b: [number, number, number, number]): [number, number, number, number] {
  const pts = [input.fromPage(b[0], b[1]), input.fromPage(b[0] + b[2], b[1]), input.fromPage(b[0], b[1] + b[3]), input.fromPage(b[0] + b[2], b[1] + b[3])];
  return [Math.min(...pts.map((p) => p.x)), Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.y))];
}

/** Build (or load) the cache of one fixture at one tier. */
export function cachePage(meta: FixtureMeta, tier: DegradeTier, seed = 1, force = false): CachedPage {
  const file = pageFile(meta.id, tier, seed);
  if (!force && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as CachedPage;
  mkdirSync(cacheDir(), { recursive: true });
  const fx = loadFixture(meta);
  const d = degrade(fx.gray, fx.truth, tier, tierSeed(meta.id, tier, seed));
  const truth = d.truth as GroundTruth;
  const analysis = analyzePage(d.gray);
  const matches = matchStaves(analysis.page, truth);
  const ids = analysis.layout.staves.map((st) => `s${st.systemIndex}.st${st.indexInSystem}`);
  const out: CachedPage = { fixture: meta.id, tier, strips: [], missed: [] };
  for (const m of matches) {
    if (m.truth.kind !== 'tab') continue;
    const g = m.truth as GtTabStaff;
    const index = m.detected ? ids.indexOf(m.detected.id) : -1;
    const noteCount = g.measures.reduce((a, mm) => a + mm.events.reduce((b, e) => b + e.notes.length, 0), 0);
    if (index < 0 || analysis.layout.staves[index].kind !== 'tab') {
      out.missed.push({ notes: noteCount, measures: g.measures.length });
      continue;
    }
    const input = extractStaff(analysis, index);
    const yMid = (g.lines[0][0].y + g.lines[g.lineCount - 1][0].y) / 2;
    const notes: CachedNote[] = [];
    const events: CachedEvent[] = [];
    g.measures.forEach((mm, mi) => {
      for (const e of mm.events) {
        const k = events.length;
        const ey = e.notes.length ? e.notes[0].bbox[1] + e.notes[0].bbox[3] / 2 : yMid;
        events.push({
          type: e.type,
          x: input.fromPage(e.x, ey).x,
          measure: mi,
          value: e.duration.value,
          dots: e.duration.dots,
          tuplet: e.duration.tuplet,
          hidden: !!e.hidden,
          box: e.type === 'rest' && e.bbox ? boxToStrip(input, e.bbox) : undefined,
        });
        for (const n of e.notes) notes.push({ string: n.string, fret: n.fret, box: boxToStrip(input, n.bbox), event: k });
      }
    });
    const k = out.strips.length;
    out.strips.push({
      fixture: meta.id,
      subset: meta.subset,
      tier,
      staffIndex: index,
      staffId: input.staffId,
      width: input.gray.width,
      height: input.gray.height,
      lineCount: input.lineCount,
      kindConfidence: input.kindConfidence,
      space: input.space,
      lineThickness: input.lineThickness,
      lineYs: input.lineYs,
      x0: input.x0,
      x1: input.x1,
      barlines: input.barlines,
      measures: input.measures,
      scale: input.scale,
      sourceSpace: input.sourceSpace,
      partnerIndex: input.partnerIndex,
      tabFont: meta.tabFont,
      dpi: meta.dpi,
      stems: g.stems,
      lineThrough: g.lineThrough,
      notes,
      events,
      truthMeasures: g.measures.map((mm) => ({ x0: input.fromPage(mm.x0, yMid).x, x1: input.fromPage(mm.x1, yMid).x })),
      time: g.time ? { num: g.time.num, den: g.time.den } : truth.time ?? null,
    });
    const n = input.gray.width * input.gray.height;
    const buf = Buffer.alloc(2 * n);
    buf.set(input.gray.data, 0);
    for (let i = 0; i < n; i++) buf[n + i] = input.binary.data[i] | (input.noLines.data[i] << 1) | (input.lineMask.data[i] << 2);
    writeFileSync(stripFile(meta.id, tier, seed, k), gzipSync(buf, { level: 4 }));
  }
  writeFileSync(file, JSON.stringify(out));
  return out;
}

/** Rebuild a `StaffInput` from the cache. Strip px double as "page" px (identity transforms). */
export function loadStrip(meta: CachedStripMeta, k: number, seed = 1): StaffInput {
  const buf = gunzipSync(readFileSync(stripFile(meta.fixture, meta.tier, seed, k)));
  const n = meta.width * meta.height;
  const gray = { width: meta.width, height: meta.height, data: new Uint8Array(buf.subarray(0, n)) };
  const binary = { width: meta.width, height: meta.height, data: new Uint8Array(n) };
  const noLines = { width: meta.width, height: meta.height, data: new Uint8Array(n) };
  const lineMask = { width: meta.width, height: meta.height, data: new Uint8Array(n) };
  for (let i = 0; i < n; i++) {
    const v = buf[n + i];
    binary.data[i] = v & 1;
    noLines.data[i] = (v >> 1) & 1;
    lineMask.data[i] = (v >> 2) & 1;
  }
  return {
    index: meta.staffIndex,
    staffId: meta.staffId,
    kind: 'tab',
    kindConfidence: meta.kindConfidence,
    lineCount: meta.lineCount,
    gray,
    binary,
    noLines,
    lineMask,
    space: meta.space,
    lineThickness: meta.lineThickness,
    lineYs: meta.lineYs,
    x0: meta.x0,
    x1: meta.x1,
    barlines: meta.barlines,
    measures: meta.measures,
    scale: meta.scale,
    sourceSpace: meta.sourceSpace,
    toPage: (x, y) => ({ x, y }),
    toPageBox: (x, y, w, h) => ({ x, y, w, h }),
    fromPage: (x, y) => ({ x, y }),
    partnerIndex: meta.partnerIndex,
    page: { gray, width: meta.width, height: meta.height },
  };
}
