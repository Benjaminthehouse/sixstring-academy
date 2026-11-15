/**
 * The circle of fifths as data and geometry: twelve slots clockwise from C, each with its major key
 * (outer ring) and relative minor (inner ring), and for a selected key the roman numeral of every
 * slot that holds one of its diatonic chords. Pure, derived from `core/theory`.
 */
import { circleOfFifths, diatonicChords, getKey, note as parseNote, type CircleSlot, type Key } from '@/core/theory';

/** A ring of the circle. */
export type CircleRing = 'major' | 'minor';

/** What one wedge shows for the selected key. */
export interface WedgeInfo {
  ring: CircleRing;
  index: number;
  /** The key at this wedge, usual spelling first (two at the three enharmonic slots). */
  keys: Key[];
  /** Roman numeral of the selected key's diatonic chord here (`IV`, `ii`, `vii°`), or null. */
  roman: string | null;
  /** The diatonic chord's symbol (`F`, `Dm`, `Bdim`), or null. */
  chord: string | null;
  /** The selected key itself. */
  selected: boolean;
}

/** The twelve slots (cached: the theory call allocates keys). */
let slotsCache: CircleSlot[] | null = null;
export function circleSlots(): CircleSlot[] {
  slotsCache ??= circleOfFifths();
  return slotsCache;
}

/** The slot index (0 = C at the top) and ring of a key, or null when it is not a key. */
export function slotOfKey(input: string | Key | null | undefined): { index: number; ring: CircleRing; key: Key } | null {
  if (!input) return null;
  const k = typeof input === 'string' ? getKey(input) : input;
  if (!k) return null;
  const ring: CircleRing = k.mode;
  const pc = parseNote(k.tonic).chroma;
  const index = circleSlots().findIndex((s) => parseNote((ring === 'major' ? s.major : s.minor)[0].tonic).chroma === pc);
  return index < 0 ? null : { index, ring, key: k };
}

/**
 * Every wedge of both rings for a selected key: the diatonic chords of a major key fill the key's
 * slot and its two neighbours (I IV V outside, vi ii iii inside) plus vii° one step further; a minor
 * key's chords fill the same six wedges around its relative major.
 */
export function circleWedges(selected: string | Key | null | undefined): WedgeInfo[] {
  const slots = circleSlots();
  const sel = slotOfKey(selected);
  const romans = new Map<string, { roman: string; chord: string }>();
  if (sel) {
    for (const c of diatonicChords(sel.key)) {
      const pc = parseNote(c.root).chroma;
      const quality = c.type.id === 'major' ? 'major' : c.type.id === 'minor' || c.type.id === 'dim' ? 'minor' : null;
      if (!quality) continue;
      // A diminished chord sits on the inner wedge of the minor key with the same root (Bdim on Bm).
      const index = slots.findIndex((s) => parseNote((quality === 'major' ? s.major : s.minor)[0].tonic).chroma === pc);
      if (index >= 0) romans.set(`${quality}:${index}`, { roman: c.roman, chord: c.symbol });
    }
  }
  const out: WedgeInfo[] = [];
  for (const ring of ['major', 'minor'] as const) {
    slots.forEach((s, index) => {
      const r = romans.get(`${ring}:${index}`);
      out.push({
        ring,
        index,
        keys: ring === 'major' ? s.major : s.minor,
        roman: r?.roman ?? null,
        chord: r?.chord ?? null,
        selected: !!sel && sel.index === index && sel.ring === ring,
      });
    });
  }
  return out;
}

/** The signature of a slot as short text: `2♯`, `3♭`, `0`, or `6♯ 6♭` at an enharmonic slot. */
export function signatureText(slot: Pick<CircleSlot, 'major'>): string {
  return slot.major
    .map((k) => {
      const f = k.signature.fifths;
      return f === 0 ? '0' : `${Math.abs(f)}${f > 0 ? '♯' : '♭'}`;
    })
    .join(' ');
}

/** A point on a circle: angle in degrees clockwise from the top. */
export function polar(cx: number, cy: number, r: number, angle: number): { x: number; y: number } {
  const a = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/** An annular wedge between radii `r0` < `r1` and angles `a0` < `a1` (degrees clockwise from the top), as an SVG path. */
export function wedgePath(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const large = a1 - a0 > 180 ? 1 : 0;
  const p0 = polar(cx, cy, r1, a0);
  const p1 = polar(cx, cy, r1, a1);
  const p2 = polar(cx, cy, r0, a1);
  const p3 = polar(cx, cy, r0, a0);
  const f = (n: number) => n.toFixed(2);
  return `M${f(p0.x)} ${f(p0.y)} A${r1} ${r1} 0 ${large} 1 ${f(p1.x)} ${f(p1.y)} L${f(p2.x)} ${f(p2.y)} A${r0} ${r0} 0 ${large} 0 ${f(p3.x)} ${f(p3.y)} Z`;
}

/** Keyboard movement around the circle: left/right step around a ring, up/down switch rings. */
export function moveOnCircle(pos: { index: number; ring: CircleRing }, key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home'): { index: number; ring: CircleRing } {
  switch (key) {
    case 'ArrowRight':
      return { index: (pos.index + 1) % 12, ring: pos.ring };
    case 'ArrowLeft':
      return { index: (pos.index + 11) % 12, ring: pos.ring };
    case 'ArrowUp':
      return { index: pos.index, ring: 'major' };
    case 'ArrowDown':
      return { index: pos.index, ring: 'minor' };
    default:
      return { index: 0, ring: pos.ring };
  }
}
