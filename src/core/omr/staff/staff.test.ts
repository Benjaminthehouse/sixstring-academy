import { describe, expect, it } from 'vitest';
import { type Fixture, loadFixture } from '../eval/fixtures';
import { polylineY } from '../eval/truth';
import type { BinaryImage } from '../image/gray';
import { createGray } from '../image/gray';
import { flatten } from '../image/illumination';
import { binarizeSymbols } from '../image/preprocess';
import { analyzePage } from '../page';
import { detectLayout } from './layout';
import { detectStaves } from './lines';
import { lineYAt, staffPositionAt, yAtStaffPosition } from './model';
import { removeStaffLines } from './removal';
import { estimateStaffScale } from './scale';

const cache = new Map<string, { fx: Fixture; bin: BinaryImage }>();
/** A clean fixture and its binarisation at the fixture's own resolution. */
function clean(id: string): { fx: Fixture; bin: BinaryImage } {
  let c = cache.get(id);
  if (!c) {
    const fx = loadFixture(id);
    c = { fx, bin: binarizeSymbols(flatten(fx.gray).image, 0) };
    cache.set(id, c);
  }
  return c;
}

describe('staff scale', () => {
  it('reads the staff space from run lengths', () => {
    const { fx, bin } = clean('ode-bravura-150');
    const s = estimateStaffScale(bin);
    expect(Math.abs(s.staffSpace - fx.truth.staffSpace) / fx.truth.staffSpace).toBeLessThan(0.05);
    expect(s.lineThickness).toBeGreaterThan(0.8);
    expect(s.lineThickness).toBeLessThan(3);
    expect(s.confidence).toBeGreaterThan(0.5);
  });

  it('sees both staff sizes of a notation + tab page', () => {
    const { fx, bin } = clean('linked-ode-bravura-150');
    const s = estimateStaffScale(bin);
    const tab = fx.truth.systems[0].staves[1].space;
    const notation = fx.truth.systems[0].staves[0].space;
    const found = [s.staffSpace, s.secondSpace].sort((a, b) => a - b);
    expect(found[0]).toBeCloseTo(notation, 0);
    expect(found[1]).toBeCloseTo(tab, 0);
  });

  it('reports nothing on a blank page', () => {
    const blank = { width: 200, height: 200, data: new Uint8Array(200 * 200) };
    expect(estimateStaffScale(blank).staffSpace).toBe(0);
    expect(detectStaves(blank).staves).toEqual([]);
  });
});

describe('staff lines', () => {
  it('finds every staff of a linked page with sub-pixel lines and exact ends', () => {
    const { fx, bin } = clean('linked-ode-bravura-150');
    const det = detectStaves(bin);
    const truth = fx.truth.systems.flatMap((s) => s.staves);
    expect(det.staves.map((s) => s.lineCount)).toEqual(truth.map((s) => s.lineCount));
    det.staves.forEach((st, i) => {
      const gt = truth[i];
      const x = (gt.x0 + gt.x1) / 2;
      for (let l = 0; l < st.lineCount; l++) expect(Math.abs(lineYAt(st, l, x) - polylineY(gt.lines[l], x))).toBeLessThan(0.6);
      expect(Math.abs(st.x0 - gt.x0)).toBeLessThan(2.5);
      expect(Math.abs(st.x1 - gt.x1)).toBeLessThan(2.5);
      expect(Math.abs(st.space - gt.space)).toBeLessThan(0.15);
      expect(st.confidence).toBeGreaterThan(0.8);
    });
  });

  it('does not take rows of ledger lines or beams for staff lines', () => {
    // Every note of this page sits on ledger lines above the staff.
    expect(detectStaves(clean('scale-high-petaluma-150').bin).staves.map((s) => s.lineCount)).toEqual([5]);
    // Dense sixteenths: beams run almost parallel to the lines.
    expect(detectStaves(clean('arpeggio16-bravura-100').bin).staves.map((s) => s.lineCount)).toEqual([5, 5]);
    expect(detectStaves(clean('elise-bravura-150').bin).staves.map((s) => s.lineCount)).toEqual([5, 5]);
  });

  it('converts between pixels and staff positions', () => {
    const st = detectStaves(clean('ode-bravura-150').bin).staves[0];
    const x = (st.x0 + st.x1) / 2;
    expect(staffPositionAt(st, x, lineYAt(st, 4, x))).toBeCloseTo(0, 5);
    expect(staffPositionAt(st, x, lineYAt(st, 0, x))).toBeCloseTo(8, 5);
    expect(yAtStaffPosition(st, x, 4)).toBeCloseTo(lineYAt(st, 2, x), 1);
  });
});

describe('staff-line removal', () => {
  it('erases the lines and keeps the note heads', () => {
    const { fx, bin } = clean('ode-bravura-150');
    const det = detectStaves(bin);
    const res = removeStaffLines(bin, det.staves);
    const staff = fx.truth.systems[0].staves[0];
    if (staff.kind !== 'notation') throw new Error('fixture changed');
    // Between symbols the line rows are empty now.
    let lineInk = 0;
    let lineInkBefore = 0;
    for (const line of staff.lines) {
      for (let x = Math.ceil(staff.x0) + 2; x < staff.x1 - 2; x++) {
        const y = Math.round(polylineY(line, x) - 0.5);
        lineInk += res.image.data[y * bin.width + x];
        lineInkBefore += bin.data[y * bin.width + x];
      }
    }
    expect(lineInkBefore).toBeGreaterThan(4000);
    expect(lineInk / lineInkBefore).toBeLessThan(0.12);
    // Filled heads keep their ink.
    for (const m of staff.measures) {
      for (const e of m.events) {
        for (const n of e.notes) {
          if (n.headType !== 'filled') continue;
          let before = 0;
          let after = 0;
          for (let y = Math.floor(n.head[1]); y < n.head[1] + n.head[3]; y++) {
            for (let x = Math.floor(n.head[0]); x < n.head[0] + n.head[2]; x++) {
              before += bin.data[y * bin.width + x];
              after += res.image.data[y * bin.width + x];
            }
          }
          expect(after / before).toBeGreaterThan(0.9);
        }
      }
    }
    // The mask is exactly what was removed.
    let diff = 0;
    for (let i = 0; i < bin.data.length; i++) diff += bin.data[i] - res.image.data[i] - res.mask.data[i];
    expect(diff).toBe(0);
  });
});

describe('page layout', () => {
  it('groups notation and tab into systems, classifies them and splits measures', () => {
    const { fx, bin } = clean('linked-greensleeves-gonville-150');
    const layout = detectLayout(bin);
    expect(layout.staves.map((s) => s.kind)).toEqual(['notation', 'tab', 'notation', 'tab']);
    expect(layout.systems.map((s) => s.staves)).toEqual([[0, 1], [2, 3]]);
    expect(layout.systems.every((s) => s.connected)).toBe(true);
    expect(layout.staves.map((s) => s.partner)).toEqual([1, 0, 3, 2]);
    expect(layout.staves[1].evidence.tabLetters).toBe(true);
    expect(layout.staves[1].tabClef).not.toBeNull();
    expect(layout.staves[0].kindConfidence).toBeGreaterThan(0.8);
    const truth = fx.truth.systems.flatMap((s) => s.staves);
    layout.staves.forEach((st, i) => {
      expect(st.measures.length).toBe(truth[i].measures.length);
      expect(st.barlines.length).toBe(truth[i].barlines.length);
      st.barlines.forEach((b, k) => expect(Math.abs(b.x - truth[i].barlines[k].x)).toBeLessThan(2));
    });
    // The system bar line joins both staves; the piece ends with a final bar.
    expect(layout.staves[0].barlines[0].joinsBelow).toBe(true);
    expect(layout.staves[1].barlines[0].joinsAbove).toBe(true);
    expect(layout.staves[2].barlines[layout.staves[2].barlines.length - 1].type).toBe('end');
    expect(Math.abs(layout.staffSpace - fx.truth.staffSpace)).toBeLessThan(0.2);
  });

  it('tells stems from bar lines, and double from single bars', () => {
    // Half notes on the top space, ties across bar lines, a double bar inside the piece.
    for (const id of ['scarborough-bravura-150', 'page-notation-bravura-150', 'rhythm-bravura-150', 'chords-bravura-150']) {
      const fx = loadFixture(id);
      const staves = analyzePage(fx.gray).page.systems.flatMap((s) => s.staves);
      const truth = fx.truth.systems.flatMap((s) => s.staves);
      expect(staves.length).toBe(truth.length);
      staves.forEach((st, i) => {
        expect(st.barlines.length).toBe(truth[i].barlines.length);
        st.barlines.forEach((b, k) => expect(Math.abs(b.x - truth[i].barlines[k].x)).toBeLessThan(2));
        expect(st.measures.length).toBe(truth[i].measures.length);
      });
      if (id === 'page-notation-bravura-150') {
        const types = staves.flatMap((s) => s.barlines.map((b) => b.type));
        expect(types.filter((t) => t === 'double').length).toBe(2);
        expect(types.filter((t) => t === 'end').length).toBe(1);
      }
    }
  });

  it('reads repeat signs with their dots', () => {
    for (const id of ['repeats-bravura-150', 'tab-repeats-ls-150']) {
      const fx = loadFixture(id);
      const st = analyzePage(fx.gray).page.systems[0].staves[0];
      expect(st.barlines.map((b) => b.type)).toEqual(fx.truth.systems[0].staves[0].barlines.map((b) => b.type));
      expect(st.barlines.map((b) => b.type)).toEqual(['single', 'repeat-begin', 'single', 'repeat-end', 'repeat-begin', 'single', 'repeat-end']);
    }
  });

  it('keeps single staves in systems of their own and finds content boxes', () => {
    const { fx, bin } = clean('scale-e-bravura-150');
    const layout = detectLayout(bin);
    expect(layout.systems.map((s) => s.staves)).toEqual([[0], [1]]);
    // The low E hangs three ledger lines under the staff: the content box must reach it.
    const st = fx.truth.systems[0].staves[0];
    if (st.kind !== 'notation') throw new Error('fixture changed');
    const lowest = Math.max(...st.measures.flatMap((m) => m.events.flatMap((e) => e.notes.map((n) => n.head[1] + n.head[3]))));
    const box = layout.staves[0].contentBox;
    expect(box.y + box.h).toBeGreaterThanOrEqual(lowest - 1);
    expect(box.y).toBeLessThan(st.lines[0][0].y);
  });
});

describe('analyzePage', () => {
  it('reports geometry in pixels of the original image', () => {
    const fx = loadFixture('tab-ode-ls-150');
    const { page, pre } = analyzePage(fx.gray);
    expect(pre.correction).toBe('scale');
    expect(page.width).toBe(fx.gray.width);
    const truth = fx.truth.systems.flatMap((s) => s.staves);
    const staves = page.systems.flatMap((s) => s.staves);
    expect(staves.map((s) => s.kind)).toEqual(['tab', 'tab']);
    staves.forEach((st, i) => {
      const gt = truth[i];
      const x = (gt.x0 + gt.x1) / 2;
      for (let l = 0; l < 6; l++) expect(Math.abs(polylineY(st.geometry.lines[l], x) - polylineY(gt.lines[l], x))).toBeLessThan(0.05 * gt.space);
      expect(Math.abs(st.geometry.space - gt.space)).toBeLessThan(0.1);
      expect(st.measures.length).toBe(gt.measures.length);
      expect(st.tuning).toEqual([40, 45, 50, 55, 59, 64]);
      expect(new Set(st.measures.map((m) => m.id)).size).toBe(st.measures.length);
    });
    expect(page.quality.source).toBe('render');
    expect(page.warnings).toEqual([]);
  });

  it('says so when a page has no staves', () => {
    const { page } = analyzePage(createGray(400, 300, 250));
    expect(page.systems).toEqual([]);
    expect(page.warnings.map((w) => w.code)).toContain('no-staves');
  });
});
