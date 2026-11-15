/**
 * Development runner of the notation recognizer (Node only): evaluates fixtures at degradation
 * tiers with the corpus metrics, lists every mistake per staff and writes annotated strips.
 *
 *   node src/core/omr/notation/tools/dev.cjs run --tier clean,scan --match ode --verbose --dump
 */
import { join } from 'node:path';
import { dumpDir } from '../../eval/debug';
import type { DegradeTier } from '../../eval/degrade';
import { COLORS, Canvas } from '../../eval/draw';
import { loadManifest } from '../../eval/fixtures';
import { type PageScore, addScore, emptyScore, f1, matchPoints, precision, rate, recall, scorePage } from '../../eval/metrics';
import { writePng } from '../../eval/png';
import type { GtNotationEvent, GtNotationStaff } from '../../eval/truth';
import { assemblePage } from '../../page';
import type { StaffReading } from '../../types';
import { type NotationContext, type StaffAnalysis, type StripEvent, analyzeNotationStaff, contextAfter, toReading } from '../index';
import { measureHead } from '../heads';
import { baseValue } from '../notes';
import { alphaTabIds, boxToStrip, loadDevPage } from './strips';

interface Args {
  cmd: string;
  tiers: string[];
  match: string;
  subset: string;
  dump: boolean;
  verbose: boolean;
  seed: number;
  staff: number;
  args: string[];
}

const pct = (v: number): string => `${(v * 100).toFixed(1)}`.padStart(5);
const SHORT: Record<string, string> = { whole: 'w', half: 'h', quarter: 'q', eighth: '8', '16th': '16', '32nd': '32' };

function durName(d: { value: string; dots: number; tuplet?: { actual: number; normal: number } }): string {
  return `${SHORT[d.value] ?? d.value}${'.'.repeat(d.dots)}${d.tuplet ? `t${d.tuplet.actual}` : ''}`;
}

/** Compare one analysed strip with its truth; returns human-readable mistakes. */
function diagnose(a: StaffAnalysis, truth: GtNotationStaff): string[] {
  const out: string[] = [];
  const input = a.strip.input;
  const s = a.strip.s;
  const gEvents: { e: GtNotationEvent; m: number }[] = [];
  truth.measures.forEach((m, mi) => m.events.forEach((e) => gEvents.push({ e, m: mi })));
  const gHeads = gEvents.flatMap(({ e, m }) => e.notes.map((n) => ({ n, e, m, b: boxToStrip(input, n.head) })));
  const dHeads = a.events.filter((e) => e.kind === 'chord').flatMap((e) => (e.chord?.heads ?? []).map((hd, i) => ({ hd, e, i })));
  const pairs = matchPoints(gHeads.map((g) => ({ x: g.b[0] + g.b[2] / 2, y: g.b[1] + g.b[3] / 2 })), dHeads.map((d) => ({ x: d.hd.x, y: d.hd.y })), 0.6 * s);
  const gUsed = new Set(pairs.map((p) => p[0]));
  const dUsed = new Set(pairs.map((p) => p[1]));
  gHeads.forEach((g, i) => {
    if (gUsed.has(i)) return;
    const gx = g.b[0] + g.b[2] / 2;
    const gy = g.b[1] + g.b[3] / 2;
    const cand = a.heads.find((hd) => Math.abs(hd.x - gx) < 0.6 * s && Math.abs(hd.y - gy) < 0.6 * s);
    const { feat } = measureHead(a.strip, gx, gy, 2, 2);
    out.push(`MISS  head ${g.n.headType} pos ${g.n.pos} x ${gx.toFixed(0)} y ${gy.toFixed(0)} (m${g.m} ${durName(g.e.duration)}) ${cand ? `candidate ${cand.kind} ${cand.score.toFixed(2)} stem ${cand.stem ?? '-'}` : 'no candidate'} zF ${feat.zFilled.toFixed(2)} zO ${feat.zOpen.toFixed(2)} zW ${feat.zWhole.toFixed(2)} hole ${feat.holeOpen.toFixed(2)}/${feat.holeWhole.toFixed(2)} core ${feat.core.toFixed(2)}`);
  });
  dHeads.forEach((d, i) => {
    if (!dUsed.has(i)) out.push(`EXTRA head ${d.hd.kind} pos ${d.hd.pos} x ${d.hd.x.toFixed(0)} y ${d.hd.y.toFixed(0)} score ${d.hd.score.toFixed(2)} zF ${d.hd.feat.zFilled.toFixed(2)} zO ${d.hd.feat.zOpen.toFixed(2)} zW ${d.hd.feat.zWhole.toFixed(2)} hole ${d.hd.feat.holeOpen.toFixed(2)}/${d.hd.feat.holeWhole.toFixed(2)}`);
  });
  const seen = new Set<StripEvent>();
  for (const [gi, di] of pairs) {
    const g = gHeads[gi];
    const d = dHeads[di];
    if (d.hd.pos !== g.n.pos) out.push(`POS   x ${d.hd.x.toFixed(0)} truth ${g.n.pos} read ${d.hd.pos}`);
    const acc = d.e.accidentals[d.i];
    const ga = g.n.accidental ? ({ '#': 'sharp', b: 'flat', n: 'natural' } as Record<string, string>)[g.n.accidental] ?? g.n.accidental : null;
    if ((acc?.type ?? null) !== ga) out.push(`ACC   x ${d.hd.x.toFixed(0)} pos ${g.n.pos} truth ${ga} read ${acc ? `${acc.type} ${acc.score.toFixed(2)}` : 'none'}`);
    if (g.n.tieStart !== !!d.e.tieStart[d.i]) out.push(`TIE   x ${d.hd.x.toFixed(0)} pos ${g.n.pos} truth ${g.n.tieStart} read ${!!d.e.tieStart[d.i]}`);
    if (!seen.has(d.e)) {
      seen.add(d.e);
      const opt = d.e.rhythm.options[d.e.rhythm.chosen];
      const gd = durName(g.e.duration);
      const dd = durName(opt);
      if (gd !== dd) {
        const c = d.e.chord;
        out.push(`DUR   x ${d.hd.x.toFixed(0)} m${g.m} truth ${gd} read ${dd}${d.e.rhythm.chosen ? ` (first ${durName(d.e.rhythm.options[0])})` : ''} [${c ? `${c.heads[0].kind} base ${baseValue(c)} dir ${c.dir} beams ${c.beams}${c.beamLeft ? 'L' : ''}${c.beamRight ? 'R' : ''} flags ${c.flags} tail ${c.tailScore.toFixed(2)} dots ${c.dots} kindScore ${c.heads[0].kindScore.toFixed(2)} hole ${c.heads[0].feat.holeOpen.toFixed(2)}` : ''}]`);
      }
    }
  }
  const gRests = gEvents.filter(({ e }) => e.type === 'rest' && e.head).map(({ e, m }) => ({ e, m, b: boxToStrip(input, e.head as [number, number, number, number]) }));
  const dRests = a.events.filter((e) => e.kind === 'rest');
  const rp = matchPoints(gRests.map((g) => ({ x: g.b[0] + g.b[2] / 2, y: g.b[1] + g.b[3] / 2 })), dRests.map((d) => ({ x: d.x, y: (d.box.y0 + d.box.y1) / 2 })), 1.0 * s);
  const grU = new Set(rp.map((p) => p[0]));
  const drU = new Set(rp.map((p) => p[1]));
  gRests.forEach((g, i) => { if (!grU.has(i)) out.push(`MISS  rest ${durName(g.e.duration)} x ${(g.b[0] + g.b[2] / 2).toFixed(0)} m${g.m}`); });
  dRests.forEach((d, i) => { if (!drU.has(i)) out.push(`EXTRA rest ${d.rest?.value} x ${d.x.toFixed(0)} score ${d.rest?.score.toFixed(2)}`); });
  for (const [gi, di] of rp) {
    const gd = durName(gRests[gi].e.duration);
    const opt = dRests[di].rhythm.options[dRests[di].rhythm.chosen];
    if (gd !== durName(opt)) out.push(`DUR   rest x ${dRests[di].x.toFixed(0)} truth ${gd} read ${durName(opt)} score ${dRests[di].rest?.score.toFixed(2)}`);
  }
  const key = a.header.key?.value ?? 0;
  if (truth.key && truth.key.fifths !== key) out.push(`KEY   truth ${truth.key.fifths} read ${key}`);
  if (truth.time) {
    const t = a.header.time?.value;
    if (!t || t.beats !== truth.time.num || t.beatValue !== truth.time.den) out.push(`TIME  truth ${truth.time.num}/${truth.time.den} read ${t ? `${t.beats}/${t.beatValue}` : 'none'}`);
  } else if (a.header.time) {
    out.push(`TIME  truth none read ${a.header.time.value.beats}/${a.header.time.value.beatValue}`);
  }
  if (!a.header.clef) out.push('CLEF  not found');
  return out;
}

/** Counts of right and wrong readings by reported confidence. */
interface Calibration {
  pitchWrong: number;
  pitchWrongSure: number;
  pitchRight: number;
  pitchRightUnsure: number;
  durWrong: number;
  durWrongSure: number;
  durRight: number;
  durRightUnsure: number;
  extra: number;
  extraSure: number;
}

function emptyCalibration(): Calibration {
  return { pitchWrong: 0, pitchWrongSure: 0, pitchRight: 0, pitchRightUnsure: 0, durWrong: 0, durWrongSure: 0, durRight: 0, durRightUnsure: 0, extra: 0, extraSure: 0 };
}

/** Does the reading say "sure" (confidence >= 0.5) about what it got wrong? Page coordinates. */
function calibrate(reading: StaffReading, truth: GtNotationStaff, cal: Calibration): void {
  const gHeads = truth.measures.flatMap((m) => m.events.flatMap((e) => e.notes.map((n) => ({ n, e }))));
  const dHeads = reading.events.flatMap((e) => (e.kind === 'chord' ? e.notes.map((n) => ({ n, e })) : []));
  const centre = (b: { x: number; y: number; w: number; h: number }): { x: number; y: number } => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
  const pairs = matchPoints(gHeads.map((g) => ({ x: g.n.head[0] + g.n.head[2] / 2, y: g.n.head[1] + g.n.head[3] / 2 })), dHeads.map((d) => centre(d.n.bbox)), 0.6 * truth.space);
  const seen = new Set<object>();
  for (const [gi, di] of pairs) {
    const g = gHeads[gi];
    const d = dHeads[di];
    const sure = d.n.confidence >= 0.5;
    if (d.n.pitch.midi === g.n.midi) {
      cal.pitchRight++;
      if (!sure) cal.pitchRightUnsure++;
    } else {
      cal.pitchWrong++;
      if (sure) cal.pitchWrongSure++;
    }
    if (seen.has(d.e)) continue;
    seen.add(d.e);
    const dur = d.e.duration;
    const ok = dur && dur.value === g.e.duration.value && dur.dots === g.e.duration.dots && !!dur.tuplet === !!g.e.duration.tuplet;
    const durSure = !!dur && dur.confidence >= 0.5;
    if (ok) {
      cal.durRight++;
      if (!durSure) cal.durRightUnsure++;
    } else {
      cal.durWrong++;
      if (durSure) cal.durWrongSure++;
    }
  }
  const used = new Set(pairs.map((p) => p[1]));
  dHeads.forEach((d, i) => {
    if (used.has(i)) return;
    cal.extra++;
    if (d.n.confidence >= 0.5) cal.extraSure++;
  });
}

/** Draw the analysis over the strip. */
function drawAnalysis(a: StaffAnalysis, truth: GtNotationStaff | null): Canvas {
  const { strip } = a;
  const c = Canvas.fromGray(strip.input.gray, 0.45);
  if (truth) {
    for (const m of truth.measures) {
      for (const e of m.events) {
        for (const n of e.notes) {
          const b = boxToStrip(strip.input, n.head);
          c.rect(b[0] - 2, b[1] - 2, b[2] + 4, b[3] + 4, COLORS.green, 1, 0.9);
        }
        if (e.type === 'rest' && e.head) {
          const b = boxToStrip(strip.input, e.head);
          c.rect(b[0] - 2, b[1] - 2, b[2] + 4, b[3] + 4, COLORS.green, 1, 0.9);
        }
      }
    }
  }
  for (const st of a.strokes) c.line(st.x, st.top, st.x, st.bottom, st.barline ? COLORS.grey : COLORS.cyan, 1, 0.9);
  const h = a.header;
  for (const item of [h.clef, h.key, h.time]) if (item) c.rect(item.x0, item.y0, item.x1 - item.x0, item.y1 - item.y0, COLORS.cyan, 1);
  if (h.key) c.text(h.key.x0, h.key.y0 - 10, `K${h.key.value}`, COLORS.cyan, 1);
  if (h.time) c.text(h.time.x0, h.time.y0 - 10, `${h.time.value.beats}/${h.time.value.beatValue}`, COLORS.cyan, 1);
  c.line(h.endX, 0, h.endX, strip.h, COLORS.cyan, 1, 0.5);
  for (const e of a.events) {
    const opt = e.rhythm.options[e.rhythm.chosen];
    if (e.kind === 'rest') {
      c.rect(e.box.x0, e.box.y0, e.box.x1 - e.box.x0, e.box.y1 - e.box.y0, COLORS.orange, 1);
      c.text(e.box.x0, e.box.y0 - 10, `R${durName(opt)}`, COLORS.orange, 1);
      for (const d of e.rest?.dotBoxes ?? []) c.rect(d.x0 - 1, d.y0 - 1, d.x1 - d.x0 + 2, d.y1 - d.y0 + 2, COLORS.magenta, 1);
      continue;
    }
    const ch = e.chord;
    if (!ch) continue;
    ch.heads.forEach((hd, i) => {
      const col = hd.kind === 'filled' ? COLORS.red : hd.kind === 'open' ? COLORS.blue : COLORS.purple;
      c.rect(hd.x - hd.w / 2, hd.y - hd.h / 2, hd.w, hd.h, col, 1);
      const acc = e.accidentals[i];
      if (acc) {
        c.rect(acc.box.x0, acc.box.y0, acc.box.x1 - acc.box.x0, acc.box.y1 - acc.box.y0, COLORS.magenta, 1);
        c.text(acc.box.x0, acc.box.y0 - 9, acc.type[0].toUpperCase(), COLORS.magenta, 1);
      }
      if (e.tieStart[i]) c.text(hd.x + hd.w / 2 + 2, hd.y + 8, 'T', COLORS.green, 1);
    });
    for (const d of ch.dotBoxes) c.rect(d.x0 - 1, d.y0 - 1, d.x1 - d.x0 + 2, d.y1 - d.y0 + 2, COLORS.magenta, 1);
    const top = Math.min(...ch.heads.map((hd) => hd.y));
    const labelY = ch.dir === 'up' ? Math.max(...ch.heads.map((hd) => hd.y)) + 14 : top - 22;
    c.text(ch.x - 8, labelY, `${durName(opt)}${e.rhythm.chosen ? '!' : ''}`, COLORS.purple, 1);
    if (ch.stem) c.rect(ch.stem.x - 3, ch.tipY - 3, 6, 6, ch.beamLeft || ch.beamRight ? COLORS.blue : ch.flags ? COLORS.orange : COLORS.grey, 1);
  }
  a.measureOk.forEach((ok, i) => {
    const m = strip.input.measures[i];
    if (m) c.text(m.x0 + 4, strip.bottom + 60, `M${i} ${ok === null ? '?' : ok ? 'ok' : 'BAD'}`, ok === false ? COLORS.red : COLORS.green, 1);
  });
  for (const t of a.texts) c.rect(t.x0, t.y0, t.x1 - t.x0, t.y1 - t.y0, COLORS.yellow, 1);
  return c;
}

/** Entry point called by dev.cjs. */
export async function main(args: Args): Promise<void> {
  const tiers = args.tiers as DegradeTier[];
  // --alphatab: the held-out pages engraved by alphaTab instead of the VexFlow corpus.
  let list: { id: string; subset: string }[] = args.args.includes('--alphatab') ? alphaTabIds().map((id) => ({ id, subset: 'notation' })) : loadManifest().filter((m) => m.subset !== 'tab');
  if (args.subset) list = list.filter((m) => m.subset === args.subset);
  if (args.match) list = list.filter((m) => args.match.split(',').some((q) => m.id.includes(q)));
  const totals = new Map<string, PageScore>();
  const cal = emptyCalibration();
  const stage: Record<string, number> = {};
  let staves = 0;
  let msTotal = 0;
  const msList: number[] = [];
  // Process CPU time per staff: comparable across runs on a shared machine, unlike wall time.
  const cpuList: number[] = [];
  for (const tier of tiers) {
    const sum = emptyScore();
    totals.set(tier, sum);
    for (const meta of list) {
      const page = loadDevPage(meta.id, tier, args.seed);
      const readings: (StaffReading | null)[] = page.analysis.layout.staves.map(() => null);
      const lines: string[] = [];
      // Clef, key and time carry from staff to staff down the page, as in recognizeNotationStaff.
      let context: NotationContext = {};
      for (const st of page.strips) {
        if (args.staff >= 0 && st.staffIndex !== args.staff) continue;
        const t0 = performance.now();
        const c0 = process.cpuUsage();
        const a = analyzeNotationStaff(st.input, { context });
        const ms = performance.now() - t0;
        const cpu = process.cpuUsage(c0);
        cpuList.push((cpu.user + cpu.system) / 1000);
        msTotal += ms;
        msList.push(ms);
        staves++;
        for (const [k, v] of Object.entries(a.timings)) stage[k] = (stage[k] ?? 0) + v;
        const reading = toReading(a, { context });
        context = contextAfter(reading, context);
        readings[st.staffIndex] = reading;
        if (st.truth) {
          const before = { ...cal };
          calibrate(reading, st.truth, cal);
          if (args.args.includes('--staffstats')) {
            const hs = a.events.flatMap((e) => e.chord?.heads ?? []).map((hd) => hd.score).sort((p, q) => p - q);
            const checked = a.measureOk.filter((v) => v !== null).length;
            const bad = a.measureOk.filter((v) => v === false).length;
            console.log(`STAFF ${meta.id} ${st.staffIndex} noise ${a.quality.noise.toFixed(1)} lineWidth ${a.quality.lineWidth.toFixed(2)} quality ${a.quality.score.toFixed(2)} heads ${hs.length} medScore ${(hs[hs.length >> 1] ?? 0).toFixed(2)} p20 ${(hs[Math.floor(hs.length * 0.2)] ?? 0).toFixed(2)} thick/s ${(a.strip.thick / a.strip.s).toFixed(3)} bad ${bad}/${checked} src ${st.input.sourceSpace.toFixed(1)} | pitchWrong ${cal.pitchWrong - before.pitchWrong} durWrong ${cal.durWrong - before.durWrong} extra ${cal.extra - before.extra} right ${cal.pitchRight - before.pitchRight}`);
          }
        }
        if (st.truth) for (const l of diagnose(a, st.truth)) lines.push(`    staff ${st.staffIndex}: ${l}`);
        else lines.push(`    staff ${st.staffIndex}: no truth staff matched`);
        if (args.dump) {
          const path = join(dumpDir(), `nt-${meta.id}.${tier}.s${st.staffIndex}.png`);
          writePng(path, drawAnalysis(a, st.truth).image());
        }
      }
      const result = assemblePage(page.analysis, readings);
      const score = scorePage(result, page.truth);
      addScore(sum, score);
      const bad = lines.length > 0;
      if (args.verbose || bad) {
        console.log(`${tier.padEnd(10)} ${meta.id.padEnd(36)} notes P ${pct(precision(score.notes))} R ${pct(recall(score.notes))} pitch ${pct(rate(score.pitch))} dur ${pct(rate(score.duration))} rests ${f1(score.rests).toFixed(2)} acc ${pct(rate(score.accidentals))} tie ${pct(rate(score.ties))} meas ${score.measureExact.correct}/${score.measureExact.total} key ${score.key.correct}/${score.key.total} time ${score.time.correct}/${score.time.total}`);
        if (args.verbose || args.args.includes('--mistakes')) for (const l of lines) console.log(l);
      }
    }
  }
  console.log('');
  console.log('tier        noteP% noteR% pitch%  dur%  restF1  acc%  tie%  measEx%  key%  time%   (heads tp/fp/fn, rests tp/fp/fn)');
  for (const [tier, s] of totals) {
    console.log(`${tier.padEnd(11)} ${pct(precision(s.notes))}  ${pct(recall(s.notes))}  ${pct(rate(s.pitch))} ${pct(rate(s.duration))}  ${f1(s.rests).toFixed(3)}  ${pct(rate(s.accidentals))} ${pct(rate(s.ties))}   ${pct(rate(s.measureExact))}  ${pct(rate(s.key))}  ${pct(rate(s.time))}   (${s.notes.tp}/${s.notes.fp}/${s.notes.fn}, ${s.rests.tp}/${s.rests.fp}/${s.rests.fn}; acc ${s.accidentals.correct}/${s.accidentals.total} tie ${s.ties.correct}/${s.ties.total} meas ${s.measureExact.correct}/${s.measureExact.total} key ${s.key.correct}/${s.key.total} time ${s.time.correct}/${s.time.total})`);
  }
  console.log(`\ncalibration (confidence >= 0.5 counts as "sure"): pitch wrong ${cal.pitchWrong} (sure ${cal.pitchWrongSure}), right ${cal.pitchRight} (unsure ${cal.pitchRightUnsure}); duration wrong ${cal.durWrong} (sure ${cal.durWrongSure}), right ${cal.durRight} (unsure ${cal.durRightUnsure}); extra heads ${cal.extra} (sure ${cal.extraSure})`);
  msList.sort((a, b) => a - b);
  cpuList.sort((a, b) => a - b);
  const q = (l: number[], f: number): string => (l.length ? l[Math.min(l.length - 1, Math.floor(f * l.length))].toFixed(0) : '-');
  console.log(`CPU per staff: median ${q(cpuList, 0.5)} ms, p90 ${q(cpuList, 0.9)} ms, max ${q(cpuList, 1)} ms`);
  console.log(`\n${staves} staves, recognizer ${(msTotal / Math.max(1, staves)).toFixed(0)} ms/staff mean, median ${msList[msList.length >> 1]?.toFixed(0)} ms, max ${msList[msList.length - 1]?.toFixed(0)} ms; stages: ${Object.entries(stage).map(([k, v]) => `${k} ${(v / Math.max(1, staves)).toFixed(0)}`).join(', ')}`);
}
