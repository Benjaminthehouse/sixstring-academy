/**
 * The last stage of the tab engraving: one system of a layout turned into a flat list of drawing
 * primitives (string lines with gaps behind every number, barlines and repeats, fret numbers,
 * rests, slashes, stems and beams, slurs, slides, bends, spans, chord symbols, lyrics …), all in
 * system coordinates with their horizontal extent, so a tile of a long line can pick what it
 * shows. Pure: the React layer only maps primitives to SVG elements.
 */
import { beamSegments, bendText, tupletMatchesBeam } from './rhythm';
import { FONT_PX } from './metrics';
import { isBarRest, isCompound, type TabColumn, type TabMeasure, type TabNote } from './model';
import { restHalfWidth, xAtTick, type LaidMeasure, type LaidSystem, type TabLayout } from './layout';

/** CSS classes a primitive can take (defined in TabView.module.css). */
export type GlyphClass =
  | 'string'
  | 'bar'
  | 'barThick'
  | 'repeatDot'
  | 'tuning'
  | 'clef'
  | 'timesig'
  | 'barnum'
  | 'repeatCount'
  | 'rest'
  | 'restLine'
  | 'slash'
  | 'slashOpen'
  | 'stem'
  | 'beam'
  | 'flag'
  | 'dot'
  | 'tuplet'
  | 'tupletBracket'
  | 'slur'
  | 'slurLetter'
  | 'tie'
  | 'slide'
  | 'bend'
  | 'bendHead'
  | 'bendLabel'
  | 'vibrato'
  | 'spanLabel'
  | 'spanLine'
  | 'artic'
  | 'articText'
  | 'stroke'
  | 'strokeFill'
  | 'pluck'
  | 'finger'
  | 'chord'
  | 'lyric'
  | 'hyphen'
  | 'annotation'
  | 'sectionBox'
  | 'sectionText'
  | 'tempo'
  | 'tempoNote'
  | 'tempoStem'
  | 'volta'
  | 'voltaText';

/** One drawing primitive. Every primitive carries its horizontal extent `x0..x1` (system coordinates). */
export type TabGlyph =
  | { k: 'path'; c: GlyphClass; d: string; x0: number; x1: number }
  | { k: 'text'; c: GlyphClass; x: number; y: number; text: string; anchor: 'start' | 'middle' | 'end'; x0: number; x1: number; /** Font size in px when it differs from the class's (a time signature on a short staff). */ fs?: number }
  | { k: 'rect'; c: GlyphClass; x: number; y: number; w: number; h: number; r?: number; x0: number; x1: number }
  | { k: 'circle'; c: GlyphClass; cx: number; cy: number; r: number; x0: number; x1: number }
  | TabNoteGlyph;

/** A fret number: drawn with its brackets/parentheses and, in practice modes, its state. */
export interface TabNoteGlyph {
  k: 'note';
  /** Centre of the number. */
  x: number;
  y: number;
  text: string;
  paren: boolean;
  harmonic: boolean;
  tied: boolean;
  dead: boolean;
  /** Half the width including brackets. */
  half: number;
  /** `bar:beat:string` and `bar:beat`, for note states. */
  key: string;
  beatKey: string;
  x0: number;
  x1: number;
}

/** Where a small chord diagram goes (rendered as HTML over the system). */
export interface DiagramPlacement {
  x: number;
  y: number;
  symbol: string;
  text: string;
  voicing?: Array<number | null>;
  x0: number;
  x1: number;
}

/** Everything drawn for one system. */
export interface SystemDrawing {
  glyphs: TabGlyph[];
  diagrams: DiagramPlacement[];
}

const cache = new WeakMap<TabLayout, Map<number, SystemDrawing>>();

/** The drawing of a system, built once per layout and remembered. */
export function drawSystem(layout: TabLayout, systemIndex: number): SystemDrawing {
  let perLayout = cache.get(layout);
  if (!perLayout) cache.set(layout, (perLayout = new Map()));
  let d = perLayout.get(systemIndex);
  if (!d) perLayout.set(systemIndex, (d = new SystemBuilder(layout, systemIndex).build()));
  return d;
}

/** The primitives of a drawing that touch `[x0, x1]` (a tile of a long line). */
export function glyphsIn(drawing: SystemDrawing, x0: number, x1: number): TabGlyph[] {
  return drawing.glyphs.filter((g) => g.x1 >= x0 && g.x0 <= x1);
}

/** Half the drawn width of a fret number, brackets included. */
export function noteHalf(n: TabNote, layout: TabLayout): number {
  return (n.text.length * layout.metrics.digitW) / 2 + (n.paren || n.harmonic ? 3.2 * layout.metrics.zoom : 0);
}

const f1 = (v: number) => Math.round(v * 10) / 10;

function circlePath(cx: number, cy: number, r: number): string {
  return `M${f1(cx - r)} ${f1(cy)}a${f1(r)} ${f1(r)} 0 1 0 ${f1(2 * r)} 0a${f1(r)} ${f1(r)} 0 1 0 ${f1(-2 * r)} 0`;
}

/** A filled crescent between two points, bulging by `h` (negative = upward): an engraved slur or tie. */
export function slurPath(xa: number, ya: number, xb: number, yb: number, h: number): string {
  const dx = xb - xa;
  const c1 = xa + dx * 0.22;
  const c2 = xb - dx * 0.22;
  const inner = h * 0.72;
  return `M${f1(xa)} ${f1(ya)}C${f1(c1)} ${f1(ya + h)} ${f1(c2)} ${f1(yb + h)} ${f1(xb)} ${f1(yb)}C${f1(c2)} ${f1(yb + inner)} ${f1(c1)} ${f1(ya + inner)} ${f1(xa)} ${f1(ya)}Z`;
}

class SystemBuilder {
  private readonly g: TabGlyph[] = [];
  private readonly diagrams: DiagramPlacement[] = [];
  /** Gaps cut into each string line, by string number. */
  private readonly gaps = new Map<number, Array<[number, number]>>();
  private readonly sys: LaidSystem;
  private readonly z: number;

  constructor(
    private readonly layout: TabLayout,
    systemIndex: number,
  ) {
    this.sys = layout.systems[systemIndex];
    this.z = layout.metrics.zoom;
  }

  build(): SystemDrawing {
    const { sys } = this;
    this.header();
    for (const i of sys.measures) this.measure(i);
    this.effects();
    this.connections();
    this.lyricHyphens();
    this.stringLines();
    return { glyphs: this.g, diagrams: this.diagrams };
  }

  // ── helpers ────────────────────────────────────────────────────────────────────────────────

  private stringY(s: number): number {
    return this.sys.staffTop + (s - 1) * this.layout.metrics.lineGap;
  }

  private gap(string: number, x0: number, x1: number): void {
    let list = this.gaps.get(string);
    if (!list) this.gaps.set(string, (list = []));
    list.push([x0, x1]);
  }

  /** Cut every string line whose y lies within [y0, y1] between x0 and x1. */
  private gapRange(x0: number, x1: number, y0: number, y1: number): void {
    for (let s = 1; s <= this.layout.model.strings; s++) {
      const y = this.stringY(s);
      if (y >= y0 - 0.5 && y <= y1 + 0.5) this.gap(s, x0, x1);
    }
  }

  private text(c: GlyphClass, x: number, y: number, text: string, anchor: 'start' | 'middle' | 'end', width: number, fs?: number): void {
    const x0 = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2;
    this.g.push({ k: 'text', c, x: f1(x), y: f1(y), text, anchor, x0, x1: x0 + width, ...(fs ? { fs: f1(fs) } : {}) });
  }

  private path(c: GlyphClass, d: string, x0: number, x1: number): void {
    this.g.push({ k: 'path', c, d, x0, x1 });
  }

  private line(c: GlyphClass, xa: number, ya: number, xb: number, yb: number): void {
    this.path(c, `M${f1(xa)} ${f1(ya)}L${f1(xb)} ${f1(yb)}`, Math.min(xa, xb), Math.max(xa, xb));
  }

  private measureW(text: string, font: Parameters<TabLayout['measureText']>[1]): number {
    return this.layout.measureText(text, font) * this.z;
  }

  /** Baseline for text vertically centred on y. */
  private centred(y: number, fontPx: number): number {
    return y + fontPx * this.z * 0.36;
  }

  private rowMid(kind: keyof LaidSystem['rows']): number | null {
    const r = this.sys.rows[kind];
    return r ? r.y + r.h / 2 : null;
  }

  // ── system start ───────────────────────────────────────────────────────────────────────────

  private header(): void {
    const { sys, layout, z } = this;
    const model = layout.model;
    for (let s = 1; s <= model.strings; s++) {
      const label = model.stringLabels[s];
      this.text('tuning', sys.staffX - 3.5 * z, this.centred(this.stringY(s), FONT_PX.tuning), label, 'end', this.measureW(label, 'tuning'));
    }
    // The system's opening line and the TAB clef.
    this.line('bar', sys.staffX, sys.staffTop, sys.staffX, sys.staffBottom);
    const clefX = sys.staffX + layout.metrics.clefW / 2 + 1 * z;
    const h = sys.staffBottom - sys.staffTop;
    const letters = ['T', 'A', 'B'];
    const step = Math.min(h / 3, FONT_PX.clef * z * 1.05);
    const mid = (sys.staffTop + sys.staffBottom) / 2;
    letters.forEach((ch, i) => {
      const cy = mid + (i - 1) * step;
      this.text('clef', clefX, this.centred(cy, FONT_PX.clef), ch, 'middle', FONT_PX.clef * z * 0.7);
    });
    const cw = FONT_PX.clef * z * 0.42;
    this.gapRange(clefX - cw - 1 * z, clefX + cw + 1 * z, mid - step - FONT_PX.clef * z * 0.42, mid + step + FONT_PX.clef * z * 0.42);
  }

  // ── one measure ────────────────────────────────────────────────────────────────────────────

  private measure(mi: number): void {
    const { layout, sys, z } = this;
    const lm = layout.measures[mi];
    const m = layout.model.measures[mi];
    const mx = layout.metrics;
    const left = lm.x;
    const right = lm.x + lm.width;
    let headerX = left;

    if (m.repeatStart) {
      this.repeatSign(left + (lm === layout.measures[sys.measures[0]] ? 1.5 * z : 0), 'start');
      headerX += mx.repeatW;
    }
    if (m.showTime) {
      const cx = headerX + mx.timeSigW / 2 + 1 * z;
      const mid = (sys.staffTop + sys.staffBottom) / 2;
      // The two numbers fill the staff: smaller on a four-string bass staff.
      const staffH = sys.staffBottom - sys.staffTop;
      const fs = Math.min(FONT_PX.timesig * z, staffH * 0.42);
      const capH = fs * 0.72;
      const offset = Math.min(capH / 2 + 1.5 * z, staffH / 4 + 0.5 * z);
      const w = Math.max(String(m.time.numerator).length, String(m.time.denominator).length) * fs * 0.62;
      const scaled = fs < FONT_PX.timesig * z - 0.01 ? fs : undefined;
      this.text('timesig', cx, mid - offset + capH / 2, String(m.time.numerator), 'middle', w, scaled);
      this.text('timesig', cx, mid + offset + capH / 2, String(m.time.denominator), 'middle', w, scaled);
      this.gapRange(cx - w / 2 - 1.5 * z, cx + w / 2 + 1.5 * z, sys.staffTop - 1, sys.staffBottom + 1);
    }
    // The barline that closes the measure.
    this.endBarline(right, m.endBar);

    this.markers(m, lm);
    this.volta(m, lm, mi === sys.measures[0]);
    this.chords(m, mi);

    m.columns.forEach((c, ci) => this.column(m, lm, c, ci));
    if (layout.options.rhythm && sys.rows.rhythm) {
      this.beams(m, lm);
      this.tuplets(m, lm);
    }
  }

  private repeatSign(x: number, kind: 'start' | 'end'): void {
    const { sys, z, layout } = this;
    const thick = 3 * z;
    const thinOffset = 4.5 * z;
    const dotOffset = 8 * z;
    const dir = kind === 'start' ? 1 : -1;
    const thickX = kind === 'start' ? x : x - thick;
    this.g.push({ k: 'rect', c: 'barThick', x: thickX, y: sys.staffTop, w: thick, h: sys.staffBottom - sys.staffTop, x0: thickX, x1: thickX + thick });
    const thinX = x + dir * (thinOffset + (kind === 'start' ? 0 : 0));
    this.line('bar', thinX, sys.staffTop, thinX, sys.staffBottom);
    const n = layout.model.strings;
    const spaces = n - 1;
    const centre = (spaces - 1) / 2;
    const dotSpaces = spaces % 2 === 1 ? [centre - 1, centre + 1] : [Math.floor(centre), Math.ceil(centre)];
    for (const sp of dotSpaces) {
      if (sp < 0 || sp >= spaces) continue;
      const cy = sys.staffTop + (sp + 0.5) * layout.metrics.lineGap;
      const cx = x + dir * dotOffset;
      this.g.push({ k: 'circle', c: 'repeatDot', cx, cy, r: 1.9 * z, x0: cx - 2 * z, x1: cx + 2 * z });
    }
  }

  private endBarline(x: number, kind: TabMeasure['endBar']): void {
    const { sys, z } = this;
    if (kind === 'repeat') {
      this.repeatSign(x, 'end');
      return;
    }
    if (kind === 'final') {
      const thick = 3 * z;
      this.g.push({ k: 'rect', c: 'barThick', x: x - thick, y: sys.staffTop, w: thick, h: sys.staffBottom - sys.staffTop, x0: x - thick, x1: x });
      this.line('bar', x - thick - 3 * z, sys.staffTop, x - thick - 3 * z, sys.staffBottom);
      return;
    }
    this.line('bar', x, sys.staffTop, x, sys.staffBottom);
    if (kind === 'double') this.line('bar', x - 3 * z, sys.staffTop, x - 3 * z, sys.staffBottom);
  }

  private markers(m: TabMeasure, lm: LaidMeasure): void {
    const { sys, z, layout } = this;
    const row = sys.rows.marker;
    if (!row) return;
    const mid = row.y + row.h / 2;
    let x = lm.x + 1 * z;
    if (m.section) {
      const tw = this.measureW(m.section, 'marker');
      const bw = tw + 12 * z;
      const bh = 17 * z;
      this.g.push({ k: 'rect', c: 'sectionBox', x, y: mid - bh / 2, w: bw, h: bh, r: 4 * z, x0: x, x1: x + bw });
      this.text('sectionText', x + 6 * z, this.centred(mid, FONT_PX.marker), m.section, 'start', tw);
      x += bw + 8 * z;
    }
    for (const t of m.tempo) {
      const tx = t.tick > 0 ? Math.max(x, xAtTick(layout, m.index, t.tick) - 4 * z) : x;
      this.tempoMark(tx, mid, t.text, isCompound(m.time));
      x = tx + 14 * z + this.measureW(t.text, 'tempo') + 8 * z;
    }
    if (m.index === 0 && layout.model.capo > 0) {
      const label = `Capo ${layout.model.capo}`;
      this.text('tempo', x, this.centred(mid, FONT_PX.tempo), label, 'start', this.measureW(label, 'tempo'));
    }
  }

  private tempoMark(x: number, mid: number, text: string, dotted: boolean): void {
    const { z } = this;
    const hx = x + 4 * z;
    const hy = mid + 3.2 * z;
    // A quarter (or dotted quarter) note: a slanted head and a stem.
    this.path('tempoNote', `M${f1(hx - 3.6 * z)} ${f1(hy)}a${f1(3.6 * z)} ${f1(2.6 * z)} -20 1 0 ${f1(7.2 * z)} 0a${f1(3.6 * z)} ${f1(2.6 * z)} -20 1 0 ${f1(-7.2 * z)} 0`, hx - 4 * z, hx + 4 * z);
    this.line('tempoStem', hx + 3.2 * z, hy - 1 * z, hx + 3.2 * z, hy - 12.5 * z);
    let tx = hx + 7 * z;
    if (dotted) {
      this.g.push({ k: 'circle', c: 'dot', cx: hx + 7 * z, cy: hy, r: 1.2 * z, x0: hx + 6 * z, x1: hx + 8.5 * z });
      tx += 3 * z;
    }
    this.text('tempo', tx, this.centred(mid, FONT_PX.tempo), text, 'start', this.measureW(text, 'tempo'));
  }

  private volta(m: TabMeasure, lm: LaidMeasure, firstOnSystem: boolean): void {
    const { sys, z } = this;
    const row = sys.rows.volta;
    if (!row || !m.ending) return;
    const top = row.y + 3 * z;
    const hook = row.h - 4 * z;
    // A bracket that goes on into the next bar runs through the barline.
    const x0 = m.ending.start ? lm.x + 1.5 * z : lm.x;
    const x1 = m.ending.end ? lm.x + lm.width - 2.5 * z : lm.x + lm.width;
    let d = `M${f1(x0)} ${f1(top)}H${f1(x1)}`;
    if (m.ending.start) d = `M${f1(x0)} ${f1(top + hook)}V${f1(top)}H${f1(x1)}`;
    if (m.ending.end && m.ending.closed) d += `V${f1(top + hook)}`;
    this.path('volta', d, x0, x1);
    if (m.ending.start || firstOnSystem) {
      const label = `${m.ending.numbers.join(', ')}.`;
      this.text('voltaText', x0 + 4 * z, top + 10.5 * z, label, 'start', this.measureW(label, 'label'));
    }
  }

  private chords(m: TabMeasure, mi: number): void {
    const { sys, layout, z } = this;
    const row = sys.rows.chord;
    const drow = sys.rows.diagram;
    for (const c of m.chords) {
      const x = xAtTick(layout, mi, c.tick);
      if (row) {
        const w = this.measureW(c.text, 'chord');
        this.text('chord', x, row.y + row.h - 5 * z, c.text, 'middle', w);
      }
      if (drow && layout.options.diagrams) {
        const dw = layout.options.diagrams.width * z;
        this.diagrams.push({ x, y: drow.y + 2 * z, symbol: c.symbol, text: c.text, voicing: c.voicing, x0: x - dw / 2, x1: x + dw / 2 });
      }
    }
  }

  // ── one column ─────────────────────────────────────────────────────────────────────────────

  private column(m: TabMeasure, lm: LaidMeasure, c: TabColumn, ci: number): void {
    const { sys, layout, z } = this;
    const mx = layout.metrics;
    const lc = lm.cols[ci];
    const x = lm.x + lc.x;

    if (c.rest) {
      const cx = isBarRest(m) ? barRestX(layout, m.index) : x;
      this.rest(cx, isBarRest(m) ? 1 : c.value?.base ?? 4, c.value?.dots ?? 0);
      return;
    }
    if (c.slash) this.slash(x, c);
    for (const n of c.notes) if (!n.hidden) this.note(m, c, n, x);

    // Rows below.
    this.pluck(c, x);
    if (c.lyric && sys.rows.lyric) {
      const w = this.measureW(c.lyric.text, 'lyric');
      this.text('lyric', x, this.centred(sys.rows.lyric.y + sys.rows.lyric.h / 2, FONT_PX.lyric), c.lyric.text, 'middle', w);
    }
    if (layout.options.rhythm && sys.rows.rhythm) this.stem(m, c, ci, x);
  }

  private note(m: TabMeasure, c: TabColumn, n: TabNote, x: number): void {
    const { layout, z } = this;
    const y = this.stringY(n.string);
    const half = noteHalf(n, layout);
    this.g.push({
      k: 'note',
      x: f1(x),
      y: f1(y),
      text: n.text,
      paren: n.paren,
      harmonic: n.harmonic,
      tied: n.tied,
      dead: !!n.note.dead,
      half,
      key: n.key,
      beatKey: `${m.bar}:${c.beat}`,
      x0: x - half,
      x1: x + half,
    });
    let gapRight = x + half + 1.3 * z;
    const fingered = n.note.finger !== undefined && n.note.finger !== 0 && !n.tied;
    if (fingered) {
      const label = String(n.note.finger);
      const fx = x + half + 1 * z;
      const w = FONT_PX.small * z * 0.62;
      this.text('finger', fx, y + 6.4 * z, label, 'start', w);
      gapRight = fx + w + 1 * z;
    }
    this.gap(n.string, x - half - 1.3 * z, gapRight);
    if (n.tied) return;
    const nt = n.note;
    if (nt.slideIn) {
      const below = nt.slideIn === 'below';
      const xa = x - half - 8 * z;
      const xb = x - half - 1.5 * z;
      this.line('slide', xa, y + (below ? 3.6 : -3.6) * z, xb, y + (below ? -1.4 : 1.4) * z);
    }
    if (nt.slideOut) {
      const down = nt.slideOut === 'down';
      const xa = x + half + 1.5 * z;
      const xb = x + half + 8 * z;
      this.line('slide', xa, y + (down ? -1.4 : 1.4) * z, xb, y + (down ? 3.6 : -3.6) * z);
    }
  }

  private rest(cx: number, base: number, dots: number): void {
    const { layout, z } = this;
    const n = layout.model.strings;
    const upper = this.stringY(Math.floor((n - 1) / 2) + 1);
    const lower = upper + layout.metrics.lineGap;
    const mid = (upper + lower) / 2;
    const half = restHalfWidth(base) * z;
    if (base <= 2) {
      const w = 9 * z;
      const h = 4.2 * z;
      // A whole rest hangs from a line, a half rest sits on the one below it.
      const y = base === 1 ? upper : lower - h;
      this.g.push({ k: 'rect', c: 'rest', x: cx - w / 2, y, w, h, x0: cx - w / 2, x1: cx + w / 2 });
      this.line('restLine', cx - w / 2 - 2.5 * z, base === 1 ? upper : lower, cx + w / 2 + 2.5 * z, base === 1 ? upper : lower);
    } else if (base === 4) {
      const s = 1.05 * z;
      const pts = [
        [-1, -12], [5, -5], [0, 0], [5, 6],
      ];
      const P = (px: number, py: number) => `${f1(cx + px * s)} ${f1(mid + py * s)}`;
      const d = `M${P(pts[0][0], pts[0][1])}L${P(pts[1][0], pts[1][1])}L${P(pts[2][0], pts[2][1])}L${P(pts[3][0], pts[3][1])}C${P(0, 4)} ${P(-2, 7)} ${P(2, 12)}C${P(-5, 9)} ${P(-4, 3)} ${P(1, 4)}L${P(-4, -1)}L${P(1, -6)}Z`;
      this.path('rest', d, cx - half, cx + half);
      this.gapRange(cx - half - 2 * z, cx + half + 2 * z, mid - 13.5 * z, mid + 13.5 * z);
    } else {
      // Eighth and shorter: a slanted stem with one flag (a dot and a hook) per beam.
      const flags = Math.max(1, Math.round(Math.log2(base)) - 2);
      const s = z;
      const top = mid - 6 * s - (flags - 1) * 2.4 * s;
      const stemTopX = cx + 3.4 * s;
      const slope = 0.3;
      const stemLen = 13 * s + (flags - 1) * 4.6 * s;
      let d = `M${f1(stemTopX)} ${f1(top)}L${f1(stemTopX - stemLen * slope)} ${f1(top + stemLen)}`;
      for (let k = 0; k < flags; k++) {
        const fy = top + k * 4.6 * s;
        const fx = stemTopX - k * 4.6 * s * slope;
        d += `M${f1(fx)} ${f1(fy)}C${f1(fx - 1.5 * s)} ${f1(fy + 2.2 * s)} ${f1(fx - 4 * s)} ${f1(fy + 2.4 * s)} ${f1(fx - 5.4 * s)} ${f1(fy + 1.6 * s)}`;
        this.path('rest', circlePath(fx - 5.6 * s, fy + 0.4 * s, 2.1 * s), fx - 8 * s, fx);
      }
      this.path('restLine', d, cx - half - 2 * z, cx + half + 2 * z);
      this.gapRange(cx - half - 2.5 * z, cx + half + 1.5 * z, top - 3 * z, top + stemLen + 1 * z);
    }
    for (let i = 0; i < dots; i++) {
      const dx = cx + half + (2.5 + i * 3) * z;
      this.g.push({ k: 'circle', c: 'dot', cx: dx, cy: mid - layout.metrics.lineGap / 2, r: 1.3 * z, x0: dx - 1.5 * z, x1: dx + 1.5 * z });
    }
  }

  private slash(x: number, c: TabColumn): void {
    const { layout, z } = this;
    const n = layout.model.strings;
    const upper = this.stringY(Math.floor((n - 1) / 2) + 1);
    const lower = upper + layout.metrics.lineGap;
    const mid = (upper + lower) / 2;
    const h = layout.metrics.lineGap * 1.05;
    const w = 4.6 * z;
    const t = 3.8 * z;
    if (c.mutedStrum) {
      const a = 3.8 * z;
      this.path('slash', `M${f1(x - a)} ${f1(mid - a)}L${f1(x + a)} ${f1(mid + a)}M${f1(x + a)} ${f1(mid - a)}L${f1(x - a)} ${f1(mid + a)}`, x - a, x + a);
    } else {
      const open = (c.value?.base ?? 4) <= 2;
      // A half or whole slash is an outlined, wider slash: its hollow middle must read at a glance.
      const ww = open ? w + 0.8 * z : w;
      const tt = open ? t + 1.6 * z : t;
      const d = `M${f1(x - ww)} ${f1(mid + h / 2)}L${f1(x - ww + tt)} ${f1(mid + h / 2)}L${f1(x + ww)} ${f1(mid - h / 2)}L${f1(x + ww - tt)} ${f1(mid - h / 2)}Z`;
      this.path(open ? 'slashOpen' : 'slash', d, x - w, x + w);
    }
    this.gapRange(x - 5.5 * z, x + 5.5 * z, mid - h / 2 - 1, mid + h / 2 + 1);
  }

  // ── the effects band ───────────────────────────────────────────────────────────────────────

  /** Draw everything the layout stacked above the staff. */
  private effects(): void {
    const { layout, sys } = this;
    for (const e of sys.effects) {
      const mid = (e.top + e.bottom) / 2;
      const m = layout.model.measures[e.measure];
      const lm = layout.measures[e.measure];
      const c = m.columns[e.col];
      const ax = lm.x + (lm.cols[e.col]?.x ?? 0);
      switch (e.kind) {
        case 'barnum':
          this.text('barnum', e.x0, this.centred(mid, FONT_PX.barnum), e.text ?? '', 'start', e.x1 - e.x0);
          break;
        case 'repeatCount':
          this.text('repeatCount', e.x1, this.centred(mid, FONT_PX.barnum), e.text ?? '', 'end', e.x1 - e.x0);
          break;
        case 'text':
          this.text('annotation', e.x0, this.centred(mid, FONT_PX.annotation), e.text ?? '', 'start', e.x1 - e.x0);
          break;
        case 'stroke':
          this.strokeMark(c.stroke!, ax, mid);
          break;
        case 'artic':
          this.articulations(c, ax, mid);
          break;
        case 'bend': {
          const n = c.notes.find((x) => x.string === e.string && x.note.bend);
          if (n?.note.bend) this.bend(ax, this.stringY(n.string), noteHalf(n, layout), e, n.note.bend.release ?? false, n.note.bend.pre ?? false);
          break;
        }
        case 'vibrato':
          this.vibrato(e.x0, e.x1, mid);
          break;
        case 'pm':
        case 'letring':
          this.span(e.text ?? '', e.x0, e.x1, mid);
          break;
        case 'slur':
          // Only reserves room: the letter is drawn with its slur.
          break;
      }
    }
  }

  private bend(x: number, y: number, half: number, e: { top: number; bottom: number; at?: number; text?: string }, release: boolean, pre: boolean): void {
    const { layout, z } = this;
    const mx = layout.metrics;
    const label = e.text ?? '';
    // The label fills the top of the item, the arrowhead points at it from below.
    const peakY = e.top + 11 * z;
    const x0 = x + half * (pre ? 0.2 : 1) + 0.8 * z;
    const y0 = y - (pre ? mx.digitHalfH + 1.2 * z : 0.5 * z);
    const xp = e.at ?? (pre ? x0 : x + half + mx.bendW);
    let d: string;
    if (pre) d = `M${f1(x0)} ${f1(y0)}L${f1(xp)} ${f1(peakY + 4 * z)}`;
    else d = `M${f1(x0)} ${f1(y0)}C${f1(x0 + (xp - x0) * 0.75)} ${f1(y0)} ${f1(xp)} ${f1(y0 - (y0 - peakY) * 0.4)} ${f1(xp)} ${f1(peakY + 4 * z)}`;
    this.path('bend', d, x0, xp);
    this.arrowHead(xp, peakY, 'up');
    const lw = this.measureW(label, 'label');
    this.text('bendLabel', xp, peakY - 2.5 * z, label, 'middle', lw);
    if (release) {
      const xr = xp + mx.bendW * 0.9;
      const yr = y - mx.digitHalfH - 1.5 * z;
      const dr = `M${f1(xp)} ${f1(peakY)}C${f1(xp + (xr - xp) * 0.6)} ${f1(peakY)} ${f1(xr)} ${f1(peakY + (yr - peakY) * 0.4)} ${f1(xr)} ${f1(yr - 4 * z)}`;
      this.path('bend', dr, xp, xr);
      this.arrowHead(xr, yr, 'down');
    }
  }

  private arrowHead(x: number, y: number, dir: 'up' | 'down'): void {
    const { z } = this;
    const w = 2.4 * z;
    const h = 5 * z;
    const base = dir === 'up' ? y + h : y - h;
    this.path('bendHead', `M${f1(x)} ${f1(y)}L${f1(x + w)} ${f1(base)}L${f1(x - w)} ${f1(base)}Z`, x - w, x + w);
  }

  private articulations(c: TabColumn, x: number, mid: number): void {
    const { z } = this;
    const f = c.flags;
    const items: Array<{ w: number; draw: (cx: number) => void }> = [];
    if (f.accent)
      items.push({ w: 7 * z, draw: (cx) => this.path('artic', `M${f1(cx - 3.5 * z)} ${f1(mid - 2.6 * z)}L${f1(cx + 3.5 * z)} ${f1(mid)}L${f1(cx - 3.5 * z)} ${f1(mid + 2.6 * z)}`, cx - 3.5 * z, cx + 3.5 * z) });
    if (f.staccato) items.push({ w: 3 * z, draw: (cx) => this.g.push({ k: 'circle', c: 'dot', cx, cy: mid + 1 * z, r: 1.4 * z, x0: cx - 1.5 * z, x1: cx + 1.5 * z }) });
    if (f.tap) items.push({ w: 7 * z, draw: (cx) => this.text('articText', cx, this.centred(mid, FONT_PX.small), 'T', 'middle', 6 * z) });
    if (f.artificial) {
      const w = this.measureW('A.H.', 'small');
      items.push({ w, draw: (cx) => this.text('articText', cx, this.centred(mid, FONT_PX.small), 'A.H.', 'middle', w) });
    }
    const total = items.reduce((s, it) => s + it.w, 0) + (items.length - 1) * 2 * z;
    let at = x - total / 2;
    for (const it of items) {
      it.draw(at + it.w / 2);
      at += it.w + 2 * z;
    }
  }

  private strokeMark(stroke: 'down' | 'up', x: number, mid: number): void {
    const { z } = this;
    if (stroke === 'down') {
      const d = `M${f1(x - 4 * z)} ${f1(mid + 3.5 * z)}V${f1(mid - 3.5 * z)}H${f1(x + 4 * z)}V${f1(mid + 3.5 * z)}H${f1(x + 2.8 * z)}V${f1(mid - 1.6 * z)}H${f1(x - 2.8 * z)}V${f1(mid + 3.5 * z)}Z`;
      this.path('strokeFill', d, x - 4 * z, x + 4 * z);
    } else {
      this.path('stroke', `M${f1(x - 3.4 * z)} ${f1(mid - 4 * z)}L${f1(x)} ${f1(mid + 4 * z)}L${f1(x + 3.4 * z)} ${f1(mid - 4 * z)}`, x - 3.6 * z, x + 3.6 * z);
    }
  }

  /** Palm mute or let ring: the label, a dashed line to the end, a short tick down. */
  private span(label: string, x0: number, x1: number, mid: number): void {
    const { z } = this;
    const lw = this.measureW(label, 'label');
    this.text('spanLabel', x0, this.centred(mid, FONT_PX.label), label, 'start', lw);
    const lineStart = x0 + lw + 3 * z;
    if (x1 > lineStart + 3 * z) this.path('spanLine', `M${f1(lineStart)} ${f1(mid)}H${f1(x1)}V${f1(mid + 4 * z)}`, lineStart, x1);
  }

  private vibrato(x0: number, x1: number, mid: number): void {
    const { z } = this;
    const period = 6 * z;
    const amp = 2.1 * z;
    const waves = Math.max(1, Math.floor((x1 - x0) / period));
    let d = `M${f1(x0)} ${f1(mid)}`;
    for (let i = 0; i < waves; i++) {
      const a = x0 + i * period;
      d += `Q${f1(a + period / 4)} ${f1(mid - amp)} ${f1(a + period / 2)} ${f1(mid)}Q${f1(a + (3 * period) / 4)} ${f1(mid + amp)} ${f1(a + period)} ${f1(mid)}`;
    }
    this.path('vibrato', d, x0, x0 + waves * period);
  }

  private pluck(c: TabColumn, x: number): void {
    const mid = this.rowMid('pluck');
    if (mid === null || !c.flags.pluck) return;
    const letters = c.notes.filter((n) => n.note.pluck && !n.tied).map((n) => n.note.pluck!);
    const text = [...new Set(letters)].join(' ');
    this.text('pluck', x, this.centred(mid, FONT_PX.small), text, 'middle', this.measureW(text, 'small'));
  }

  // ── rhythm ─────────────────────────────────────────────────────────────────────────────────

  private stem(m: TabMeasure, c: TabColumn, ci: number, x: number): void {
    const { sys, z, layout } = this;
    const base = c.value?.base ?? 4;
    if (base <= 1) return;
    const top = sys.stemTop;
    const bottom = base === 2 ? top + layout.metrics.stemLen * 0.55 : sys.stemBottom;
    this.line('stem', x, top, x, bottom);
    const beamed = m.beamGroups.some((g) => g.includes(ci));
    if (!beamed && c.beams > 0) {
      for (let k = 0; k < c.beams; k++) {
        const fy = bottom - k * 4.4 * z;
        this.path('flag', `M${f1(x)} ${f1(fy)}C${f1(x + 0.8 * z)} ${f1(fy - 3 * z)} ${f1(x + 6.5 * z)} ${f1(fy - 3.6 * z)} ${f1(x + 5.6 * z)} ${f1(fy - 10 * z)}`, x, x + 7 * z);
      }
    }
    const dots = c.value?.dots ?? 0;
    for (let i = 0; i < dots; i++) {
      const dx = x + (3.6 + i * 3) * z;
      this.g.push({ k: 'circle', c: 'dot', cx: dx, cy: bottom - 2.5 * z, r: 1.3 * z, x0: dx - 1.5 * z, x1: dx + 1.5 * z });
    }
  }

  private beams(m: TabMeasure, lm: LaidMeasure): void {
    const { sys, layout, z } = this;
    const mx = layout.metrics;
    const stemW = 1 * z;
    for (const group of m.beamGroups) {
      for (const seg of beamSegments(group, m.columns)) {
        const y = sys.stemBottom - (seg.level - 1) * (mx.beamThick + mx.beamGap);
        const xa = lm.x + lm.cols[seg.from].x;
        let x0 = xa - stemW / 2;
        let x1 = lm.x + lm.cols[seg.to].x + stemW / 2;
        if (seg.stub) {
          const k = group.indexOf(seg.from);
          const neighbour = seg.stub === 'right' ? group[k + 1] : group[k - 1];
          const nx = lm.x + lm.cols[neighbour].x;
          const len = Math.min(7 * z, Math.abs(nx - xa) * 0.45);
          if (seg.stub === 'right') x1 = xa + len;
          else {
            x0 = xa - len;
            x1 = xa + stemW / 2;
          }
        }
        this.g.push({ k: 'rect', c: 'beam', x: x0, y: y - mx.beamThick, w: x1 - x0, h: mx.beamThick, x0, x1 });
      }
    }
  }

  private tuplets(m: TabMeasure, lm: LaidMeasure): void {
    const { sys, z } = this;
    const row = sys.rows.tuplet;
    if (!row) return;
    for (const t of m.tuplets) {
      const xa = lm.x + lm.cols[t.events[0]].x;
      const xb = lm.x + lm.cols[t.events[t.events.length - 1]].x;
      const label = String(t.actual);
      const mid = (xa + xb) / 2;
      const ty = row.y + row.h / 2;
      const w = this.measureW(label, 'small');
      this.text('tuplet', mid, this.centred(ty, FONT_PX.small), label, 'middle', w);
      if (!tupletMatchesBeam(t, m.beamGroups) || t.partial) {
        const by = ty;
        const hook = 3.5 * z;
        const gapHalf = w / 2 + 2.5 * z;
        this.path('tupletBracket', `M${f1(xa)} ${f1(by - hook)}V${f1(by)}H${f1(mid - gapHalf)}M${f1(mid + gapHalf)} ${f1(by)}H${f1(xb)}V${f1(by - hook)}`, xa, xb);
      }
    }
  }

  // ── things that join columns ───────────────────────────────────────────────────────────────

  /** Ties, hammer-ons/pull-offs and legato slides from the note before on the same string. */
  private connections(): void {
    const { layout, sys } = this;
    const here = new Set(sys.measures);
    // Notes on this system reached from a note here or on an earlier system.
    for (const mi of sys.measures) {
      const m = layout.model.measures[mi];
      m.columns.forEach((c, ci) => {
        for (const n of c.notes) if (n.from && !n.hidden) this.connect(n, mi, ci, here.has(n.from.measure) ? 'both' : 'end');
      });
    }
    // Notes on the next system reached from a note here: draw the first half.
    const next = layout.systems[sys.index + 1];
    if (next) {
      for (const mi of next.measures.slice(0, 2)) {
        const m = layout.model.measures[mi];
        m.columns.forEach((c, ci) => {
          for (const n of c.notes) if (n.from && !n.hidden && here.has(n.from.measure)) this.connect(n, mi, ci, 'start');
        });
      }
    }
  }

  private connect(n: TabNote, mi: number, ci: number, part: 'both' | 'start' | 'end'): void {
    const { layout, sys, z } = this;
    const mx = layout.metrics;
    const y = this.stringY(n.string);
    const from = n.from!;
    const src = layout.model.measures[from.measure].columns[from.col].notes.find((x) => x.string === from.string);
    if (!src) return;
    const srcHalf = noteHalf(src, layout);
    const dstHalf = noteHalf(n, layout);
    const sxAnchor = part === 'end' ? sys.headerW - 4 * z : layout.measures[from.measure].x + layout.measures[from.measure].cols[from.col].x;
    const dxAnchor = part === 'start' ? sys.width - 2 * z : layout.measures[mi].x + layout.measures[mi].cols[ci].x;
    const xa = part === 'end' ? sxAnchor : sxAnchor + srcHalf + 0.8 * z;
    const xb = part === 'start' ? dxAnchor : dxAnchor - dstHalf - 0.8 * z;
    if (xb - xa < 2 * z) return;
    if (n.tied) {
      const ty = y + mx.digitHalfH + 1.2 * z;
      const h = Math.min(4.2 * z, (xb - xa) * 0.25 + 1.5 * z);
      this.path('tie', slurPath(xa, ty, xb, ty, h), xa, xb);
      return;
    }
    if (n.note.legato) {
      const sy = y - mx.digitHalfH - 0.8 * z;
      const h = -Math.min(5.2 * z, (xb - xa) * 0.28 + 2 * z);
      const ax = part === 'end' ? xa : xa - srcHalf * 0.55;
      const bx = part === 'start' ? xb : xb + dstHalf * 0.55;
      this.path('slur', slurPath(ax, sy, bx, sy, h), ax, bx);
      if (part !== 'start') {
        const letter = n.note.legato === 'hammer' ? 'H' : 'P';
        const lx = (ax + bx) / 2;
        const ly = y - mx.lineGap;
        const lw = FONT_PX.small * z * 0.66;
        this.text('slurLetter', lx, this.centred(ly, FONT_PX.small), letter, 'middle', lw);
        if (n.string > 1) this.gap(n.string - 1, lx - lw / 2 - 1.2 * z, lx + lw / 2 + 1.2 * z);
      }
      return;
    }
    if (n.note.slide) {
      const up = n.note.slide === 'up';
      const rise = 2.6 * z;
      this.line('slide', xa + 0.6 * z, y + (up ? rise : -rise), xb - 0.6 * z, y + (up ? -rise : rise));
    }
  }

  private lyricHyphens(): void {
    const { layout, sys, z } = this;
    const row = sys.rows.lyric;
    if (!row) return;
    const y = this.centred(row.y + row.h / 2, FONT_PX.lyric);
    const items: Array<{ x: number; w: number; hyphen: boolean }> = [];
    for (const mi of sys.measures) {
      const m = layout.model.measures[mi];
      const lm = layout.measures[mi];
      m.columns.forEach((c, ci) => {
        if (c.lyric) items.push({ x: lm.x + lm.cols[ci].x, w: this.measureW(c.lyric.text, 'lyric'), hyphen: c.lyric.hyphen });
      });
    }
    items.forEach((it, i) => {
      if (!it.hyphen) return;
      const next = items[i + 1];
      const a = it.x + it.w / 2;
      const hw = 4 * z;
      const hx = next ? (a + next.x - next.w / 2) / 2 : a + 5 * z;
      if (next && next.x - next.w / 2 - a < hw + 2 * z) return;
      this.path('hyphen', `M${f1(hx - hw / 2)} ${f1(y - 3.6 * z)}H${f1(hx + hw / 2)}`, hx - hw / 2, hx + hw / 2);
    });
  }

  // ── string lines, last: they need every gap ───────────────────────────────────────────────

  private stringLines(): void {
    const { layout, sys } = this;
    const n = layout.model.strings;
    const segments: Array<[number, number]> = [[sys.staffX, layout.measures[sys.measures[0]].x]];
    for (const mi of sys.measures) {
      const lm = layout.measures[mi];
      segments.push([lm.x, lm.x + lm.width]);
    }
    const sorted = new Map<number, Array<[number, number]>>();
    for (let s = 1; s <= n; s++) sorted.set(s, (this.gaps.get(s) ?? []).slice().sort((a, b) => a[0] - b[0]));
    const lines: TabGlyph[] = [];
    for (const [x0, x1] of segments) {
      if (x1 - x0 < 0.5) continue;
      let d = '';
      for (let s = 1; s <= n; s++) {
        const y = f1(this.stringY(s));
        let at = x0;
        for (const [g0, g1] of sorted.get(s)!) {
          if (g1 <= at || g0 >= x1) continue;
          if (g0 > at) d += `M${f1(at)} ${y}H${f1(g0)}`;
          at = Math.max(at, g1);
        }
        if (at < x1) d += `M${f1(at)} ${y}H${f1(x1)}`;
      }
      if (d) lines.push({ k: 'path', c: 'string', d, x0, x1 });
    }
    // Lines go underneath everything else.
    this.g.unshift(...lines);
  }
}

/** x (system coordinates) of a whole-bar rest: the middle of the bar's music. */
export function barRestX(layout: TabLayout, measureIndex: number): number {
  const lm = layout.measures[measureIndex];
  const m = layout.model.measures[measureIndex];
  const header = (m.repeatStart ? layout.metrics.repeatW : 0) + (m.showTime ? layout.metrics.timeSigW : 0);
  return lm.x + (header + lm.width) / 2;
}
