/**
 * Development evaluation of the tab reader on cached strips (Node only): accuracy per tier, font
 * and resolution, confusions, calibration of the confidences, timing, and contact sheets of the
 * mistakes to look at. The official numbers come from `eval/cli.cjs`; this loop is the fast one.
 */
import { join } from 'node:path';
import { dumpDir } from '../../eval/debug';
import type { DegradeTier } from '../../eval/degrade';
import { COLORS, Canvas } from '../../eval/draw';
import { matchPoints } from '../../eval/metrics';
import { writePng } from '../../eval/png';
import type { GrayImage } from '../../image/gray';
import type { OmrTabEvent, OmrTabNote, StaffInput } from '../../types';
import { readTabStaff } from '../recognize';
import { type CachedStripMeta, cachePage, loadStrip, tabFixtures } from './cache';

/** Tallies of one group of strips. */
export interface TabTally {
  strips: number;
  truth: number;
  detected: number;
  matched: number;
  fretOk: number;
  stringOk: number;
  bothOk: number;
  /** Notes of truth staves the layout lost. */
  lost: number;
  measures: number;
  measuresExact: number;
  durTotal: number;
  durOk: number;
  ms: number;
  /** Technique marks (dead notes, brackets, ties, slurs, slides, bends): in the truth, reported, and right. */
  marksTruth: number;
  marksRead: number;
  marksOk: number;
  /** Wrong frets reported with confidence >= 0.5, and right ones below 0.5. */
  confidentWrong: number;
  timidRight: number;
  confRight: number;
  confWrong: number;
  wrong: number;
}

const zero = (): TabTally => ({ strips: 0, truth: 0, detected: 0, matched: 0, fretOk: 0, stringOk: 0, bothOk: 0, lost: 0, measures: 0, measuresExact: 0, durTotal: 0, durOk: 0, marksTruth: 0, marksRead: 0, marksOk: 0, ms: 0, confidentWrong: 0, timidRight: 0, confRight: 0, confWrong: 0, wrong: 0 });

/** One mistake, with what is needed to draw it. */
export interface Mistake {
  kind: 'miss' | 'extra' | 'fret' | 'string' | 'duration' | 'mark';
  fixture: string;
  tier: DegradeTier;
  strip: number;
  box: [number, number, number, number];
  truth: string;
  read: string;
  confidence: number;
  gray: GrayImage;
  lineYs: number[];
}

/** Options of {@link evaluateTab}. */
export interface TabEvalOptions {
  tiers: DegradeTier[];
  match?: string;
  seed?: number;
  rebuild?: boolean;
  /** Write contact sheets of the mistakes. */
  dump?: boolean;
  /** Evaluate the reader's own fixtures (marks, held-out faces) instead of the shared corpus. */
  own?: boolean;
  /** Leave rhythm mistakes out of the contact sheets. */
  noDuration?: boolean;
  /** Print the classifier's ranking for every misread number. */
  explain?: boolean;
  /** Write every strip with the reading drawn on it. */
  show?: boolean;
  log?: (line: string) => void;
}

function drawReading(meta: CachedStripMeta, input: StaffInput, events: OmrTabEvent[], path: string): void {
  const c = Canvas.fromGray(input.gray, 0.25);
  for (const ly of input.lineYs) c.line(input.x0, ly, input.x1, ly, COLORS.green, 1, 0.25);
  for (const b of input.barlines) c.rect(b.x0, input.lineYs[0], b.x1 - b.x0, input.lineYs[input.lineCount - 1] - input.lineYs[0], COLORS.blue, 1, 0.6);
  for (const n of meta.notes) c.rect(n.box[0] - 1, n.box[1] - 1, n.box[2] - n.box[0] + 2, n.box[3] - n.box[1] + 2, COLORS.green, 1, 0.7);
  for (const e of events) {
    c.rect(e.bbox.x - 3, e.bbox.y - 3, e.bbox.w + 6, e.bbox.h + 6, COLORS.purple, 1, 0.5);
    for (const n of e.notes) {
      c.rect(n.bbox.x, n.bbox.y, n.bbox.w, n.bbox.h, n.confidence >= 0.5 ? COLORS.magenta : COLORS.orange);
      c.text(n.bbox.x + n.bbox.w + 2, n.bbox.y - 4, `${n.technique === 'x' ? 'X' : n.fret}${n.parenthesized ? ')' : ''}${n.technique && n.technique !== 'x' ? n.technique : ''}`, COLORS.magenta, 1);
    }
    if (e.duration) c.text(e.bbox.x, input.lineYs[input.lineCount - 1] + 8, `${e.duration.value.slice(0, 2)}${'.'.repeat(e.duration.dots)}${e.duration.tuplet ? 'T' : ''}`, e.duration.confidence >= 0.5 ? COLORS.blue : COLORS.orange, 1);
  }
  writePng(path, c.image());
}

function sheet(mistakes: Mistake[], path: string): void {
  const cw = 150;
  const ch = 104;
  const cols = 8;
  const rows = Math.ceil(mistakes.length / cols);
  const c = new Canvas(cols * cw, Math.max(1, rows) * ch);
  mistakes.forEach((m, i) => {
    const ox = (i % cols) * cw;
    const oy = Math.floor(i / cols) * ch;
    const cx = (m.box[0] + m.box[2]) / 2;
    const cy = (m.box[1] + m.box[3]) / 2;
    const sw = 70;
    const sh = 36;
    const z = 2;
    for (let y = 0; y < sh * z; y++) {
      for (let x = 0; x < sw * z; x++) {
        const sx = Math.floor(cx - sw / 2 + x / z);
        const sy = Math.floor(cy - sh / 2 + y / z);
        const v = sx >= 0 && sy >= 0 && sx < m.gray.width && sy < m.gray.height ? m.gray.data[sy * m.gray.width + sx] : 200;
        const o = ((oy + 2 + y) * c.width + ox + 2 + x) * 4;
        c.data[o] = c.data[o + 1] = c.data[o + 2] = v;
      }
    }
    const col = m.kind === 'miss' ? COLORS.blue : m.kind === 'extra' ? COLORS.orange : COLORS.red;
    c.rect(ox + 2 + (m.box[0] - (cx - sw / 2)) * z, oy + 2 + (m.box[1] - (cy - sh / 2)) * z, (m.box[2] - m.box[0]) * z, (m.box[3] - m.box[1]) * z, col, 1, 0.8);
    c.text(ox + 3, oy + sh * z + 5, `${m.kind} T${m.truth} R${m.read} C${m.confidence.toFixed(2)}`, col, 1);
    c.text(ox + 3, oy + sh * z + 15, m.fixture.slice(0, 24), COLORS.grey, 1);
    c.rect(ox, oy, cw - 1, ch - 1, COLORS.grey, 1, 0.3);
  });
  writePng(path, c.image());
}

const pct = (a: number, b: number): string => (b ? ((100 * a) / b).toFixed(1) : '-').padStart(5);

/** Run the reader over the cached corpus and report. Returns the text report and the tallies per tier. */
export function evaluateTab(opts: TabEvalOptions): { text: string; tiers: Record<string, TabTally>; mistakes: Mistake[] } {
  const seed = opts.seed ?? 1;
  const log = opts.log ?? (() => undefined);
  const groups = new Map<string, TabTally>();
  const tally = (key: string): TabTally => {
    let t = groups.get(key);
    if (!t) groups.set(key, (t = zero()));
    return t;
  };
  const confusions = new Map<string, number>();
  const mistakes: Mistake[] = [];
  const stripMs: number[] = [];
  for (const tier of opts.tiers) {
    for (const meta of tabFixtures(opts.match, opts.own)) {
      const page = cachePage(meta, tier, seed, opts.rebuild);
      const keys = [`tier ${tier}`, `${tier} font ${meta.tabFont}`, `${tier} dpi ${meta.dpi}`, `${tier} ${meta.subset}`, `${tier} fixture ${meta.id}`];
      for (const lost of page.missed) for (const k of keys) {
        tally(k).truth += lost.notes;
        tally(k).lost += lost.notes;
        tally(k).measures += lost.measures;
      }
      page.strips.forEach((sm, k) => {
        const input = loadStrip(sm, k, seed);
        const { reading, debug } = readTabStaff(input);
        stripMs.push(debug.ms);
        const events = reading.events.filter((e) => e.kind === 'tab');
        const dNotes: { n: OmrTabNote; e: OmrTabEvent }[] = [];
        for (const e of events) for (const n of e.notes) dNotes.push({ n, e });
        const pairs = matchPoints(
          sm.notes.map((n) => ({ x: (n.box[0] + n.box[2]) / 2, y: (n.box[1] + n.box[3]) / 2 })),
          dNotes.map((d) => ({ x: d.n.bbox.x + d.n.bbox.w / 2, y: d.n.bbox.y + d.n.bbox.h / 2 })),
          0.6 * sm.space,
        );
        const local = zero();
        local.strips = 1;
        local.truth = sm.notes.length;
        local.detected = dNotes.length;
        local.matched = pairs.length;
        local.ms = debug.ms;
        const usedG = new Set<number>();
        const usedD = new Set<number>();
        const eventPair = new Map<number, OmrTabEvent>();
        const push = (m: Omit<Mistake, 'fixture' | 'tier' | 'strip' | 'gray' | 'lineYs'>): void => {
          mistakes.push({ ...m, fixture: meta.id, tier, strip: k, gray: input.gray, lineYs: input.lineYs });
        };
        for (const [gi, di] of pairs) {
          usedG.add(gi);
          usedD.add(di);
          const g = sm.notes[gi];
          const d = dNotes[di];
          const fretOk = d.n.fret === g.fret;
          const stringOk = d.n.string === g.string;
          if (fretOk) local.fretOk++;
          if (stringOk) local.stringOk++;
          if (fretOk && stringOk) local.bothOk++;
          if (fretOk) {
            local.confRight += d.n.confidence;
            if (d.n.confidence < 0.5) local.timidRight++;
          } else {
            local.wrong++;
            local.confWrong += d.n.confidence;
            if (d.n.confidence >= 0.5) local.confidentWrong++;
            const key = `${g.fret}>${d.n.fret}`;
            confusions.set(key, (confusions.get(key) ?? 0) + 1);
            push({ kind: 'fret', box: g.box, truth: String(g.fret), read: String(d.n.fret), confidence: d.n.confidence });
            if (opts.explain) {
              const num = debug.numbers.find((q) => Math.abs(q.box.x0 - d.n.bbox.x) < 1 && Math.abs(q.box.y0 - d.n.bbox.y) < 1);
              log(`${meta.id} ${tier} strip ${k}: truth ${g.fret} read ${d.n.fret} conf ${d.n.confidence.toFixed(2)} hd ${debug.digitHeight.toFixed(1)} blur ${debug.blurLevel} truthBox ${g.box.map((v) => v.toFixed(1)).join(',')}`);
              for (const dg of num?.digits ?? []) {
                log(`   glyph box ${dg.box.x0.toFixed(1)},${dg.box.y0.toFixed(1)},${dg.box.x1.toFixed(1)},${dg.box.y1.toFixed(1)}${dg.split ? ' split' : ''}: ${dg.ranked.slice(0, 5).map((r) => `${r.label} ${r.score.toFixed(3)}`).join('  ')}`);
              }
            }
          }
          if (!stringOk) push({ kind: 'string', box: g.box, truth: `S${g.string}`, read: `S${d.n.string}`, confidence: d.n.confidence });
          // Marks, as one string per note: x = dead, () = ghost, <> = harmonic, t = tied to the note before, then the mark after it.
          const want = `${g.dead ? 'x' : ''}${g.paren ? '()' : ''}${g.harmonic ? '<>' : ''}${g.tieStop ? 't' : ''}${g.mark && g.mark !== 't' ? g.mark : ''}`;
          const got = `${d.n.technique?.includes('x') ? 'x' : ''}${d.n.parenthesized ? '()' : ''}${d.n.technique?.includes('<>') ? '<>' : ''}${d.n.tieStop ? 't' : ''}${(d.n.technique ?? '').replace('x', '').replace('<>', '')}`;
          if (want) local.marksTruth++;
          if (got) local.marksRead++;
          if (want && want === got) local.marksOk++;
          if (want !== got) push({ kind: 'mark', box: g.box, truth: want || 'none', read: got || 'none', confidence: d.n.confidence });
          if (!eventPair.has(g.event)) eventPair.set(g.event, d.e);
        }
        sm.notes.forEach((g, gi) => {
          if (!usedG.has(gi)) push({ kind: 'miss', box: g.box, truth: String(g.fret), read: '-', confidence: 0 });
        });
        dNotes.forEach((d, di) => {
          if (!usedD.has(di)) push({ kind: 'extra', box: [d.n.bbox.x, d.n.bbox.y, d.n.bbox.x + d.n.bbox.w, d.n.bbox.y + d.n.bbox.h], truth: '-', read: String(d.n.fret), confidence: d.n.confidence });
        });
        if (sm.stems) {
          for (const [gi, de] of eventPair) {
            const ge = sm.events[gi];
            local.durTotal++;
            const dd = de.duration;
            const gt = ge.tuplet ? `${ge.tuplet.actual}:${ge.tuplet.normal}` : '';
            const dt = dd?.tuplet ? `${dd.tuplet.actual}:${dd.tuplet.normal}` : '';
            if (dd && dd.value === ge.value && dd.dots === ge.dots && gt === dt) local.durOk++;
            else {
              const first = sm.notes.find((n) => n.event === gi);
              if (first) push({ kind: 'duration', box: first.box, truth: `${ge.value}${'.'.repeat(ge.dots)}${gt}`, read: dd ? `${dd.value}${'.'.repeat(dd.dots)}${dt}` : 'none', confidence: dd?.confidence ?? 0 });
            }
          }
        }
        // Exact measures: same columns, same strings and frets, in order.
        sm.truthMeasures.forEach((tm, mi) => {
          local.measures++;
          const ge = sm.events.map((e, i) => ({ e, i })).filter((o) => o.e.measure === mi && o.e.type === 'note');
          const de = events.filter((e) => e.x >= tm.x0 && e.x < tm.x1);
          if (ge.length !== de.length) return;
          for (let q = 0; q < ge.length; q++) {
            const a = sm.notes.filter((n) => n.event === ge[q].i).map((n) => `${n.string}:${n.fret}`).sort().join(',');
            const b = de[q].notes.map((n) => `${n.string}:${n.fret}`).sort().join(',');
            if (a !== b) return;
          }
          local.measuresExact++;
        });
        for (const key of keys) {
          const t = tally(key);
          for (const f of Object.keys(local) as (keyof TabTally)[]) t[f] += local[f];
        }
        if (opts.show) {
          const path = join(dumpDir(), `tab-read.${meta.id}.${tier}.${k}.png`);
          drawReading(sm, input, events, path);
          log(`${path}  digit height ${debug.digitHeight.toFixed(1)} blur ${debug.blurLevel} ${debug.ms.toFixed(0)} ms`);
        }
      });
    }
  }
  const lines: string[] = [];
  const head = 'group                                     strips truth  det   P%    R%   fret%  str%  e2e%  measEx%  dur%  confOK confBad  confidentWrong timidRight  ms/strip  marks(truth/read/ok)';
  lines.push(head);
  const order = [...groups.keys()].sort((a, b) => {
    const ta = opts.tiers.findIndex((t) => a.includes(t));
    const tb = opts.tiers.findIndex((t) => b.includes(t));
    const ra = a.startsWith('tier') ? 0 : a.includes(' fixture ') ? 2 : 1;
    const rb = b.startsWith('tier') ? 0 : b.includes(' fixture ') ? 2 : 1;
    return ra - rb || ta - tb || a.localeCompare(b);
  });
  for (const key of order) {
    const t = groups.get(key) as TabTally;
    const right = t.fretOk;
    lines.push([
      key.padEnd(42), String(t.strips).padStart(5), String(t.truth).padStart(5), String(t.detected).padStart(5), pct(t.matched, t.detected), pct(t.matched, t.truth),
      pct(t.fretOk, t.matched), pct(t.stringOk, t.matched), pct(t.bothOk, t.truth), pct(t.measuresExact, t.measures).padStart(7), pct(t.durOk, t.durTotal),
      (right ? t.confRight / right : 0).toFixed(2).padStart(6), (t.wrong ? t.confWrong / t.wrong : 0).toFixed(2).padStart(7),
      `${t.confidentWrong}/${t.wrong}`.padStart(14), `${t.timidRight}/${right}`.padStart(10), (t.strips ? t.ms / t.strips : 0).toFixed(1).padStart(8), `  ${t.marksTruth}/${t.marksRead}/${t.marksOk}`,
    ].join(' '));
  }
  const conf = [...confusions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => `${k} x${v}`).join('  ');
  lines.push('', `confusions (truth>read): ${conf || 'none'}`);
  stripMs.sort((a, b) => a - b);
  if (stripMs.length) lines.push(`time per strip: median ${stripMs[stripMs.length >> 1].toFixed(1)} ms, p95 ${stripMs[Math.floor(stripMs.length * 0.95)].toFixed(1)} ms, max ${stripMs[stripMs.length - 1].toFixed(1)} ms over ${stripMs.length} strips`);
  if (opts.dump) {
    for (const tier of opts.tiers) {
      const list = mistakes.filter((m) => m.tier === tier && !(opts.noDuration && m.kind === 'duration'));
      if (!list.length) continue;
      const path = join(dumpDir(), `tab-mistakes.${tier}.png`);
      sheet(list.slice(0, 96), path);
      lines.push(`${list.length} mistakes at ${tier}${list.length > 96 ? ' (first 96 drawn)' : ''} -> ${path}`);
    }
  }
  const tiers: Record<string, TabTally> = {};
  for (const tier of opts.tiers) tiers[tier] = groups.get(`tier ${tier}`) ?? zero();
  return { text: lines.join('\n'), tiers, mistakes };
}
