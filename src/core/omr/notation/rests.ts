/**
 * Rests: stand-alone glyphs inside the staff that belong to no note. Every unexplained component
 * in the staff is compared with the rest glyphs placed where an engraver puts them (whole rest
 * hanging from the fourth line, half rest sitting on the middle line, the others centred).
 */
import type { DurationValue } from '../types';
import { inkBox } from './header';
import { type Match, matchAt, searchMatch } from './match';
import { ownBox } from './marks';
import { type SBox, dotsAt } from './notes';
import { CLAIM, type Strip, posY } from './strip';
import { templatesOf } from './templates';

/** A rest read from the strip. */
export interface RestMark {
  value: DurationValue;
  x: number;
  box: SBox;
  score: number;
  dots: number;
  dotBoxes: SBox[];
  alternatives: { value: DurationValue; score: number }[];
  /** Voice: 1 unless the staff has two voices. */
  voice: number;
  /** Printed away from its usual height (to make room for another voice). */
  displaced: boolean;
}

const RESTS: { value: DurationValue; glyph: string; pos: number }[] = [
  { value: 'whole', glyph: 'restWhole', pos: 6 },
  { value: 'half', glyph: 'restHalf', pos: 4 },
  { value: 'quarter', glyph: 'restQuarter', pos: 4 },
  { value: 'eighth', glyph: 'rest8th', pos: 4 },
  { value: '16th', glyph: 'rest16th', pos: 4 },
  { value: '32nd', glyph: 'rest32nd', pos: 4 },
];

const boxOf = (m: Match): SBox => {
  const t = m.template;
  const x0 = m.x - t.ox + t.pad;
  const y0 = m.y - t.oy + t.pad;
  return { x0, y0, x1: x0 + t.glyphWidth, y1: y0 + t.glyphHeight };
};

/** Options for {@link readRests}. */
export interface RestOptions {
  /** Also try rests moved up / down by whole spaces (two-voice writing). Default false. */
  displaced?: boolean;
  /** Lowest correlation accepted. Default 0.52. */
  minScore?: number;
}

/** Find the rests between `xFrom` and `xTo` among the components nothing else explains. */
export function readRests(strip: Strip, xFrom: number, xTo: number, opts: RestOptions = {}): RestMark[] {
  const { s, cc, owner } = strip;
  const minScore = opts.minScore ?? 0.52;
  const out: RestMark[] = [];
  const ids: number[] = [];
  for (let id = 1; id <= cc.count; id++) {
    if (owner[id]) continue;
    const cw = cc.x1[id] - cc.x0[id] + 1;
    const ch = cc.y1[id] - cc.y0[id] + 1;
    if (cc.x0[id] < xFrom || cc.x1[id] > xTo) continue;
    if (cw < 0.45 * s || ch < 0.3 * s || cw > 2.2 * s || ch > 4.2 * s) continue;
    if (cc.area[id] < 0.2 * s * s) continue;
    const cy = (cc.y0[id] + cc.y1[id]) / 2;
    if (cy < strip.top - 0.8 * s || cy > strip.bottom + 0.8 * s) continue;
    ids.push(id);
  }
  ids.sort((a, b) => cc.area[b] - cc.area[a]);
  const shifts = opts.displaced ? [0, -2, 2, -4, 4] : [0];
  for (const id of ids) {
    if (owner[id]) continue;
    const cw = cc.x1[id] - cc.x0[id] + 1;
    const ch = cc.y1[id] - cc.y0[id] + 1;
    const found: { value: DurationValue; m: Match; shift: number }[] = [];
    for (const r of RESTS) {
      let best: { m: Match; shift: number } | null = null;
      for (const t of templatesOf(r.glyph)) {
        // The component is the glyph or a large part of it.
        if (cw > t.glyphWidth + 0.5 * s || ch > t.glyphHeight + 0.6 * s) continue;
        if (ch < 0.45 * t.glyphHeight && cw < 0.6 * t.glyphWidth) continue;
        for (const shift of shifts) {
          const oy = posY(strip, r.pos + shift);
          const gy0 = oy - (t.oy - t.pad);
          // Skip placements that do not cover the component vertically.
          if (cc.y0[id] < gy0 - 0.4 * s || cc.y1[id] > gy0 + t.glyphHeight + 0.4 * s) continue;
          const lo = cc.x1[id] + 1 - t.glyphWidth - 3;
          const hi = cc.x0[id] + 3;
          let coarse: Match | null = null;
          for (let x = lo; x <= hi; x += 2) {
            for (let dy = -2; dy <= 2; dy += 2) {
              const sc = matchAt(strip, t, x + (t.ox - t.pad), oy + dy);
              if (!coarse || sc > coarse.score) coarse = { score: sc, x: x + (t.ox - t.pad), y: oy + dy, template: t };
            }
          }
          if (!coarse) continue;
          const fine = searchMatch(strip, t, coarse.x, coarse.y, 1, 1);
          const m = fine.score > coarse.score ? fine : coarse;
          if (!best || m.score > best.m.score) best = { m, shift };
        }
      }
      if (best) found.push({ value: r.value, m: best.m, shift: best.shift });
    }
    found.sort((a, b) => b.m.score - a.m.score);
    const top = found[0];
    if (!top || top.m.score < minScore) continue;
    const b = boxOf(top.m);
    // The ink under the glyph must be about as tall as the glyph: a fat dot is not an eighth rest.
    const ib = inkBox(strip, b.x0, b.y0, b.x1, b.y1);
    if (!ib || ib.y1 - ib.y0 < 0.7 * top.m.template.glyphHeight) continue;
    ownBox(strip, b, CLAIM.rest, 0.4);
    owner[id] = CLAIM.rest;
    // Augmentation dots sit in the third space, right of the glyph.
    const dotY = posY(strip, 5 + top.shift);
    const dots = top.value === 'whole' ? [] : dotsAt(strip, b.x1 + 0.05 * s, dotY, 1.0 * s);
    for (const d of dots) ownBox(strip, d, CLAIM.dot);
    out.push({
      value: top.value,
      x: (b.x0 + b.x1) / 2,
      box: b,
      score: top.m.score,
      dots: dots.length,
      dotBoxes: dots,
      alternatives: found.slice(1, 3).filter((f) => f.m.score > 0.35).map((f) => ({ value: f.value, score: f.m.score })),
      voice: 1,
      displaced: top.shift !== 0,
    });
  }
  out.sort((a, b) => a.x - b.x);
  return out;
}
