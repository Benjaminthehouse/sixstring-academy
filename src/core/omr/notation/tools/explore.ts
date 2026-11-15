import { loadManifest } from '../../eval/fixtures';
import type { DegradeTier } from '../../eval/degrade';
import { boxToStrip, loadDevPage } from './strips';

/** Print geometry statistics of the ground truth in strip px. */
export function explore(match: string, tier: DegradeTier): string[] {
  const out: string[] = [];
  for (const meta of loadManifest()) {
    if (meta.subset === 'tab' || !meta.id.includes(match)) continue;
    const page = loadDevPage(meta.id, tier);
    const hw: Record<string, number[]> = {};
    const add = (k: string, v: number): void => { (hw[k] ??= []).push(v); };
    for (const s of page.strips) {
      if (!s.truth) continue;
      for (const m of s.truth.measures) for (const e of m.events) {
        for (const n of e.notes) {
          const b = boxToStrip(s.input, n.head);
          add(`${n.headType}.w`, b[2]); add(`${n.headType}.h`, b[3]);
          if (n.accBox) { const a = boxToStrip(s.input, n.accBox); add(`acc${n.accidental}.w`, a[2]); add(`acc${n.accidental}.h`, a[3]); add(`acc${n.accidental}.gap`, b[0] - (a[0] + a[2])); add(`acc${n.accidental}.dy`, (a[1] + a[3] / 2) - (b[1] + b[3] / 2)); }
        }
        if (e.stemBox) { const b = boxToStrip(s.input, e.stemBox); add('stem.w', b[2]); add('stem.h', b[3]); if (e.notes.length === 1) { const hb = boxToStrip(s.input, e.notes[0].head); add(`stem${e.stem}.dx`, (b[0] + b[2] / 2) - (hb[0] + hb[2] / 2)); } }
        if (e.flagBox) { const b = boxToStrip(s.input, e.flagBox); add('flag.w', b[2]); add('flag.h', b[3]); }
        for (const d of e.dotBoxes ?? []) { const b = boxToStrip(s.input, d); add('dot.w', b[2]); add('dot.h', b[3]); if (e.notes.length) { const hb = boxToStrip(s.input, e.notes[0].head); add('dot.gap', b[0] - (hb[0] + hb[2])); } }
        if (e.type === 'rest' && e.head) { const b = boxToStrip(s.input, e.head); add(`rest${e.duration.value}.w`, b[2]); add(`rest${e.duration.value}.h`, b[3]); add(`rest${e.duration.value}.cy`, (b[1] + b[3] / 2 - s.input.lineYs[2])); }
      }
      if (s.truth.clef?.bbox) { const b = boxToStrip(s.input, s.truth.clef.bbox); add('clef.w', b[2]); add('clef.h', b[3]); add('clef.x', b[0] - s.input.x0); }
      if (s.truth.time?.bbox) { const b = boxToStrip(s.input, s.truth.time.bbox); add('time.w', b[2]); add('time.h', b[3]); add('time.x', b[0] - s.input.x0); }
      if (s.truth.key?.bbox) { const b = boxToStrip(s.input, s.truth.key.bbox); add('key.w', b[2]); add('key.x', b[0] - s.input.x0); }
      add('thick', s.input.lineThickness);
    }
    const fmt = (a: number[]): string => { const b = a.slice().sort((p, q) => p - q); return `${b[0].toFixed(1)}/${b[b.length >> 1].toFixed(1)}/${b[b.length - 1].toFixed(1)}`; };
    out.push(`${meta.id} [${meta.musicFont}] ` + Object.keys(hw).sort().map((k) => `${k} ${fmt(hw[k])}`).join('  '));
  }
  return out;
}

import { measureHead } from '../heads';
import { buildStrip } from '../strip';

/** Distribution of the head features at the true head positions. */
export function headStats(match: string, tier: DegradeTier): string[] {
  const out: string[] = [];
  const acc: Record<string, number[][]> = {};
  for (const meta of loadManifest()) {
    if (meta.subset === 'tab' || !meta.id.includes(match)) continue;
    const page = loadDevPage(meta.id, tier);
    for (const st of page.strips) {
      if (!st.truth) continue;
      const strip = buildStrip(st.input);
      for (const m of st.truth.measures) for (const e of m.events) for (const n of e.notes) {
        const b = boxToStrip(st.input, n.head);
        const { feat } = measureHead(strip, b[0] + b[2] / 2, b[1] + b[3] / 2, 2, 2);
        const key = `${n.headType}${n.pos % 2 === 0 ? '-line' : '-space'}`;
        (acc[key] ??= []).push([feat.zFilled, feat.zOpen, feat.zWhole, feat.holeOpen, feat.holeWhole, feat.core]);
        if (n.headType !== 'filled' && feat.holeOpen > 0.7 || n.headType === 'filled' && feat.holeOpen < 0.7) out.push(`  odd ${meta.id} staff ${st.staffIndex} ${n.headType} pos ${n.pos} x ${(b[0] + b[2] / 2).toFixed(0)} zF ${feat.zFilled.toFixed(2)} zO ${feat.zOpen.toFixed(2)} zW ${feat.zWhole.toFixed(2)} hO ${feat.holeOpen.toFixed(2)} hW ${feat.holeWhole.toFixed(2)} core ${feat.core.toFixed(2)}`);
      }
    }
  }
  const names = ['zFilled', 'zOpen', 'zWhole', 'holeOpen', 'holeWhole', 'core'];
  for (const k of Object.keys(acc).sort()) {
    const rows = acc[k];
    const parts = names.map((nm, i) => {
      const v = rows.map((r) => r[i]).sort((a, b) => a - b);
      const q = (p: number): string => v[Math.min(v.length - 1, Math.floor(p * v.length))].toFixed(2);
      return `${nm} ${q(0)}/${q(0.05)}/${q(0.5)}/${q(0.95)}/${v[v.length - 1].toFixed(2)}`;
    });
    out.push(`${k.padEnd(13)} n=${String(rows.length).padEnd(5)} ${parts.join('  ')}`);
  }
  return out;
}
