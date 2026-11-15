/**
 * Development inspection tools (Node only): list what the recognizer found in part of a staff,
 * dump the line-free binary, list head seeds.
 */
import { join } from 'node:path';
import { dumpDir } from '../../eval/debug';
import type { DegradeTier } from '../../eval/degrade';
import { writePng } from '../../eval/png';
import { debugSeeds } from '../heads';
import { analyzeNotationStaff } from '../index';
import { baseValue } from '../notes';
import { buildStrip } from '../strip';
import { loadDevPage } from './strips';

/** Print what the recognizer found in an x range of one staff (development only). */
export function inspect(id: string, tier: DegradeTier, staff: number, x0: number, x1: number, seed = 1): string[] {
  const page = loadDevPage(id, tier, seed);
  const st = page.strips.find((s) => s.staffIndex === staff) ?? page.strips[staff];
  const a = analyzeNotationStaff(st.input);
  const out: string[] = [];
  const h = a.header;
  out.push(`header clef ${h.clef ? `${h.clef.value} ${h.clef.confidence.toFixed(2)} x ${h.clef.x0.toFixed(0)}-${h.clef.x1.toFixed(0)}` : 'none'} key ${h.key ? `${h.key.value} conf ${h.key.confidence.toFixed(2)} x ${h.key.x0.toFixed(0)}-${h.key.x1.toFixed(0)}` : 'none'} time ${h.time ? `${h.time.value.beats}/${h.time.value.beatValue} conf ${h.time.confidence.toFixed(2)}` : 'none'} endX ${h.endX.toFixed(0)} thick ${a.strip.thick.toFixed(1)} measureTicks ${a.measureTicks}`);
  for (const s of a.strokes) if (s.x >= x0 && s.x <= x1) out.push(`stroke x ${s.x.toFixed(1)} thin ${s.ya}-${s.yb} full ${s.top}-${s.bottom} width ${s.width.toFixed(1)}${s.barline ? ' BAR' : ''}`);
  for (const hd of a.heads) if (hd.x >= x0 && hd.x <= x1) out.push(`head ${hd.kind} x ${hd.x.toFixed(1)} y ${hd.y.toFixed(1)} pos ${hd.pos} score ${hd.score.toFixed(2)} kindScore ${hd.kindScore.toFixed(2)} w ${hd.w} stem ${hd.stem ?? '-'} side ${hd.side ?? '-'} zF ${hd.feat.zFilled.toFixed(2)} zO ${hd.feat.zOpen.toFixed(2)} zW ${hd.feat.zWhole.toFixed(2)} hole ${hd.feat.holeOpen.toFixed(2)}/${hd.feat.holeWhole.toFixed(2)} core ${hd.feat.core.toFixed(2)}`);
  for (const c of a.chords) if (c.x >= x0 && c.x <= x1) out.push(`chord x ${c.x.toFixed(1)} heads ${c.heads.map((q) => `${q.kind[0]}${q.pos}`).join(',')} dir ${c.dir} tip ${c.tipY.toFixed(0)} base ${baseValue(c)} beams ${c.beams}${c.beamLeft ? 'L' : ''}${c.beamRight ? 'R' : ''} flags ${c.flags} tail ${c.tailScore.toFixed(2)} dots ${c.dots} score ${c.score.toFixed(2)}`);
  for (const e of a.events) if (e.x >= x0 && e.x <= x1) out.push(`event ${e.kind} x ${e.x.toFixed(1)} m${e.measure} ${e.rhythm.options.map((o, k) => `${k === e.rhythm.chosen ? '*' : ''}${o.value}${'.'.repeat(o.dots)}${o.tuplet ? 't' : ''}(${o.cost.toFixed(1)})`).join(' ')} acc ${e.accidentals.map((q) => (q ? `${q.type}:${q.score.toFixed(2)}` : '-')).join(',')} tie ${e.tieStart.map((q) => (q ? 'T' : '-')).join('')}${e.rest ? ` rest ${e.rest.value} ${e.rest.score.toFixed(2)}` : ''}`);
  out.push(`measures ${a.measureOk.map((ok, i) => `m${i}:${ok === null ? '?' : ok ? 'ok' : 'BAD'}`).join(' ')}`);
  for (const w of a.warnings) out.push(`warning ${w.message}`);
  return out;
}

/** Write an enlarged crop of the cleaned line-free binary, components in alternating greys; lists the components. */
export function dumpNl(id: string, tier: DegradeTier, staff: number, x0: number, y0: number, w: number, h: number, scale = 4): string[] {
  const page = loadDevPage(id, tier, 1);
  const st = page.strips.find((s) => s.staffIndex === staff) ?? page.strips[staff];
  const strip = buildStrip(st.input);
  const out: string[] = [];
  const img = { width: w * scale, height: h * scale, data: new Uint8Array(w * scale * h * scale).fill(255) };
  const ids = new Set<number>();
  for (let y = 0; y < h * scale; y++) {
    for (let x = 0; x < w * scale; x++) {
      const sx = x0 + Math.floor(x / scale);
      const sy = y0 + Math.floor(y / scale);
      if (sx < 0 || sy < 0 || sx >= strip.w || sy >= strip.h) continue;
      const lab = strip.cc.labels[sy * strip.w + sx];
      if (lab) {
        ids.add(lab);
        img.data[y * img.width + x] = (lab * 37) % 140;
      } else if (strip.input.binary.data[sy * strip.w + sx]) img.data[y * img.width + x] = 215;
    }
  }
  for (const id2 of ids) out.push(`comp ${id2} x ${strip.cc.x0[id2]}-${strip.cc.x1[id2]} y ${strip.cc.y0[id2]}-${strip.cc.y1[id2]} area ${strip.cc.area[id2]}`);
  const path = join(dumpDir(), 'nl-crop.png');
  writePng(path, img);
  out.push(path);
  return out;
}

/** List the head seeds in an x range of a staff. */
export function seeds(id: string, tier: DegradeTier, staff: number, x0: number, x1: number): string[] {
  const page = loadDevPage(id, tier, 1);
  const st = page.strips.find((s) => s.staffIndex === staff) ?? page.strips[staff];
  return debugSeeds(buildStrip(st.input), x0, x1);
}
