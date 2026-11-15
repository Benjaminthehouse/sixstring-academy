import { describe, expect, it } from 'vitest';
import { AMAZING_GRACE, CAMPFIRE_GROOVE, ODE_TO_JOY, TECHNIQUE_SAMPLER, sixTab } from '@/core/song';
import { longStudy, RIVERSIDE_MORNING } from './demo';
import { barRangeRects, breakSystems, columnExtent, hitTest, idealWidth, layoutTab, locate, placeEffects, xAtTick, type TabLayout } from './layout';
import { tabMetrics } from './metrics';
import { buildTabModel } from './model';

const songs = {
  ode: sixTab(ODE_TO_JOY),
  grace: sixTab(AMAZING_GRACE),
  sampler: sixTab(TECHNIQUE_SAMPLER),
  groove: sixTab(CAMPFIRE_GROOVE),
  river: sixTab(RIVERSIDE_MORNING),
};

function lay(text: string, width = 1000, opts: Parameters<typeof layoutTab>[1] extends infer O ? Partial<O> : never = {}): TabLayout {
  return layoutTab(buildTabModel(sixTab(text)), { width, ...opts });
}

const bar = (body: string, head = 'time: 4/4') => `title: T\n${head}\n\n| ${body} |\n`;

describe('column widths', () => {
  it('grows with length, slower than linearly', () => {
    const q = idealWidth(960, 40);
    expect(q).toBeCloseTo(40);
    expect(idealWidth(480, 40)).toBeLessThan(q);
    expect(idealWidth(1920, 40)).toBeGreaterThan(q);
    expect(idealWidth(1920, 40)).toBeLessThan(2 * q);
    expect(idealWidth(240, 40)).toBeGreaterThan(q / 4);
  });

  it('makes room for two-digit frets, bends and fingers', () => {
    const m = tabMetrics(1);
    const one = buildTabModel(sixTab(bar('q 3:5 3:5 3:5 3:5'))).measures[0].columns[0];
    const two = buildTabModel(sixTab(bar('q 3:12 3:5 3:5 3:5'))).measures[0].columns[0];
    const bend = buildTabModel(sixTab(bar('q 3:7b 3:5 3:5 3:5'))).measures[0].columns[0];
    const fing = buildTabModel(sixTab(bar('q 3:7{3} 3:5 3:5 3:5'))).measures[0].columns[0];
    const w1 = columnExtent(one, m, true, false);
    expect(columnExtent(two, m, true, false).right).toBeGreaterThan(w1.right);
    expect(columnExtent(bend, m, true, false).right).toBeGreaterThan(w1.right + m.bendW * 0.9);
    expect(columnExtent(fing, m, true, false).right).toBeGreaterThan(w1.right);
  });
});

describe('measure widths', () => {
  it('sizes measures by their content', () => {
    const quarters = lay(bar('q 3:5 3:7 3:5 3:7')).measures[0];
    const sixteenths = lay(bar('s 3:5 3:7 3:5 3:7 3:5 3:7 3:5 3:7 3:5 3:7 3:5 3:7 3:5 3:7 3:5 3:7')).measures[0];
    const whole = lay(bar('w 3:5')).measures[0];
    expect(sixteenths.natural).toBeGreaterThan(quarters.natural);
    expect(quarters.natural).toBeGreaterThan(whole.natural);
    for (const m of [quarters, sixteenths, whole]) expect(m.natural).toBeGreaterThanOrEqual(m.min);
  });

  it('widens a bar so long chord symbols and lyrics do not touch', () => {
    const plain = lay(bar('e 3:5 3:7 3:5 3:7 3:5 3:7 3:5 3:7')).measures[0];
    const chords = lay(bar('"Cmaj7#11" e 3:5 "Dm7b5/Ab" 3:7 3:5 3:7 3:5 3:7 3:5 3:7')).measures[0];
    expect(chords.natural).toBeGreaterThan(plain.natural);
    expect(chords.cols[1].x - chords.cols[0].x).toBeGreaterThan(plain.cols[1].x - plain.cols[0].x);
  });

  it('keeps every pair of neighbouring fret numbers apart, even squeezed', () => {
    for (const song of Object.values(songs)) {
      for (const width of [328, 700, 1200]) {
        const L = layoutTab(buildTabModel(song), { width });
        L.measures.forEach((lm) => {
          for (let k = 0; k + 1 < lm.cols.length; k++) {
            const a = lm.cols[k];
            const b = lm.cols[k + 1];
            expect(b.x - a.x).toBeGreaterThanOrEqual(a.right + b.left + L.metrics.noteGap - 1e-6);
          }
          const last = lm.cols[lm.cols.length - 1];
          expect(lm.width - last.x).toBeGreaterThanOrEqual(last.right + L.metrics.padRight - 1e-6);
        });
      }
    }
  });
});

describe('breakSystems', () => {
  it('fills lines without squeezing below the minimum', () => {
    const lines = breakSystems([200, 200, 200, 200, 200, 200, 200, 200], [120, 120, 120, 120, 120, 120, 120, 120], () => 700);
    expect(lines.flat()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    for (const l of lines) expect(l.length * 120).toBeLessThanOrEqual(700);
    expect(lines[0].length).toBe(3);
  });

  it('prefers a slightly squeezed line to a badly stretched one', () => {
    // Two bars of 360 on 700: squeezing 3 % beats one bar per line (stretched 94 %).
    expect(breakSystems([360, 360], [200, 200], () => 700)).toEqual([[0, 1]]);
  });

  it('puts a measure wider than the page on a line of its own', () => {
    expect(breakSystems([100, 900, 100], [80, 800, 80], () => 500)).toEqual([[0], [1], [2]]);
  });

  it('respects a maximum number of bars per line', () => {
    const lines = breakSystems(new Array(10).fill(50), new Array(10).fill(40), () => 2000, { maxBars: 4 });
    expect(lines.every((l) => l.length <= 4)).toBe(true);
    expect(lines.flat()).toHaveLength(10);
  });

  it('balances instead of leaving one bar alone at the end', () => {
    const lines = breakSystems([300, 300, 300, 300, 300], [200, 200, 200, 200, 200], () => 1000);
    expect(lines.map((l) => l.length)).not.toContain(1);
  });
});

describe('layoutTab', () => {
  it('justifies every system but the last to the width', () => {
    const L = layoutTab(buildTabModel(sixTab(longStudy(40))), { width: 900 });
    expect(L.systems.length).toBeGreaterThan(3);
    for (const sys of L.systems.slice(0, -1)) {
      const lm = L.measures[sys.measures[sys.measures.length - 1]];
      expect(lm.x + lm.width).toBeCloseTo(900 - L.metrics.zoom, 0);
    }
  });

  it('never makes the page wider on a 360 px phone', () => {
    for (const song of [...Object.values(songs), sixTab(longStudy(64))]) {
      const L = layoutTab(buildTabModel(song), { width: 328 });
      expect(L.width).toBe(328);
      for (const s of L.systems) expect(s.measures.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('wraps into fewer systems as the width grows', () => {
    const model = buildTabModel(songs.river);
    const narrow = layoutTab(model, { width: 360 }).systems.length;
    const wide = layoutTab(model, { width: 1400 }).systems.length;
    expect(narrow).toBeGreaterThan(wide);
  });

  it('stacks systems without overlap and reports the total height', () => {
    const L = layoutTab(buildTabModel(songs.sampler), { width: 700 });
    for (let i = 1; i < L.systems.length; i++) expect(L.systems[i].y).toBeGreaterThanOrEqual(L.systems[i - 1].y + L.systems[i - 1].height);
    const last = L.systems[L.systems.length - 1];
    expect(L.height).toBe(Math.ceil(last.y + last.height));
  });

  it('adds rows only where a system needs them', () => {
    const L = layoutTab(buildTabModel(songs.grace), { width: 1000 });
    const rows = L.systems[0].rows;
    expect(rows.chord).toBeDefined();
    expect(rows.lyric).toBeDefined();
    expect(rows.marker).toBeDefined();
    expect(rows.tuplet).toBeUndefined();
    expect(rows.pluck).toBeUndefined();
    expect(rows.staff!.y).toBeGreaterThan(rows.chord!.y);
    expect(rows.lyric!.y).toBeGreaterThan(rows.rhythm!.y);
  });

  it('lays one long line in tiles for horizontal scrolling', () => {
    const L = layoutTab(buildTabModel(sixTab(longStudy(60))), { width: 400, mode: 'line', tileWidth: 1000 });
    expect(L.systems).toHaveLength(1);
    expect(L.width).toBeGreaterThan(5000);
    let next = 0;
    let x = 0;
    for (const t of L.tiles) {
      expect(t.from).toBe(next);
      expect(t.x).toBeCloseTo(x, 6);
      next = t.to;
      x = t.x + t.width;
    }
    expect(next).toBe(60);
    expect(x).toBeCloseTo(L.width, 0);
  });

  it('lays out a 200-bar piece quickly', () => {
    const song = sixTab(longStudy(200));
    const t0 = performance.now();
    const model = buildTabModel(song);
    const L = layoutTab(model, { width: 1100 });
    const ms = performance.now() - t0;
    expect(L.measures).toHaveLength(200);
    expect(ms).toBeLessThan(1500);
  });
});

describe('positions', () => {
  const L = layoutTab(buildTabModel(songs.sampler), { width: 900 });

  it('puts beats at their anchors and moves monotonically through the bar', () => {
    L.model.measures.forEach((m, mi) => {
      const lm = L.measures[mi];
      m.columns.forEach((c, ci) => expect(xAtTick(L, mi, c.start)).toBeCloseTo(lm.x + lm.cols[ci].x, 6));
      let prev = -Infinity;
      for (let t = 0; t <= m.length; t += 60) {
        const x = xAtTick(L, mi, t);
        expect(x).toBeGreaterThanOrEqual(prev);
        prev = x;
      }
      expect(xAtTick(L, mi, m.length)).toBeCloseTo(lm.x + lm.width, 6);
    });
  });

  it('finds the beat under a point and locates a playback position', () => {
    L.model.measures.forEach((m, mi) => {
      const lm = L.measures[mi];
      const sys = L.systems[lm.system];
      m.columns.forEach((c, ci) => {
        if (c.piece) return;
        const hit = hitTest(L, lm.x + lm.cols[ci].x + 1, sys.y + sys.staffTop + 10);
        expect(hit).toMatchObject({ bar: m.bar, beat: c.beat, tick: c.start, measure: mi });
      });
    });
    const at = locate(L, 2, 960)!;
    expect(at.measure).toBe(2);
    expect(L.model.measures[2].columns[at.col].start).toBeLessThanOrEqual(960);
  });

  it('covers a bar range with one rectangle per system', () => {
    const rects = barRangeRects(L, 0, L.model.measures.length - 1);
    expect(rects).toHaveLength(L.systems.length);
    expect(rects[0].start).toBe(true);
    expect(rects[rects.length - 1].end).toBe(true);
  });
});

describe('placeEffects', () => {
  it('stacks overlapping items and keeps others on the base line', () => {
    const placed = placeEffects([
      { kind: 'pm', x0: 0, x1: 100, h: 10, measure: 0, col: 0 },
      { kind: 'bend', x0: 50, x1: 70, h: 20, measure: 0, col: 1 },
      { kind: 'vibrato', x0: 300, x1: 400, h: 8, measure: 1, col: 0 },
    ]);
    const by = Object.fromEntries(placed.map((p) => [p.kind, p.lift]));
    expect(by.bend).toBe(0);
    expect(by.pm).toBe(22);
    expect(by.vibrato).toBe(0);
  });

  it('never lets two effects of a real song overlap', () => {
    for (const song of [songs.sampler, songs.river, songs.groove]) {
      for (const width of [360, 1000]) {
        const L = layoutTab(buildTabModel(song), { width });
        for (const sys of L.systems) {
          const e = sys.effects;
          for (let i = 0; i < e.length; i++)
            for (let j = i + 1; j < e.length; j++) {
              const overlapX = e[i].x0 < e[j].x1 && e[j].x0 < e[i].x1;
              const overlapY = e[i].top < e[j].bottom && e[j].top < e[i].bottom;
              expect(overlapX && overlapY, `${e[i].kind} and ${e[j].kind} overlap`).toBe(false);
            }
          // Everything sits inside the effects band, above the staff.
          for (const x of e) expect(x.bottom).toBeLessThanOrEqual(sys.staffTop);
          if (e.length) expect(Math.min(...e.map((x) => x.top))).toBeGreaterThanOrEqual(sys.rows.effects!.y - 0.01);
        }
      }
    }
  });
});

describe('edge cases', () => {
  it('lays out a song with no bars as nothing at all', () => {
    const song = sixTab(ODE_TO_JOY);
    const empty = { ...song, bars: [], tracks: song.tracks.map((t) => ({ ...t, measures: [] })), chords: [], sections: [] };
    const L = layoutTab(buildTabModel(empty), { width: 500 });
    expect(L.measures).toEqual([]);
    expect(L.systems).toEqual([]);
    expect(L.tiles).toEqual([]);
    expect(L.height).toBe(0);
    expect(hitTest(L, 10, 10)).toBeNull();
    expect(locate(L, 0, 0)).toBeNull();
  });

  it('refuses a song without tracks with a clear error', () => {
    const song = { ...sixTab(ODE_TO_JOY), tracks: [] };
    expect(() => buildTabModel(song)).toThrow(RangeError);
  });

  it('treats a bar the track leaves empty as a whole-bar rest', () => {
    const song = sixTab(ODE_TO_JOY);
    const holed = { ...song, tracks: [{ ...song.tracks[0], measures: song.tracks[0].measures.map((m, i) => (i === 1 ? { beats: [] } : m)) }] };
    const L = layoutTab(buildTabModel(holed), { width: 800 });
    expect(L.model.measures[1].columns).toHaveLength(1);
    expect(L.model.measures[1].columns[0].rest).toBe(true);
  });

  it('scales every length with the zoom', () => {
    const model = buildTabModel(songs.ode);
    const a = layoutTab(model, { width: 4000, mode: 'line' });
    const b = layoutTab(model, { width: 4000, mode: 'line', zoom: 1.5 });
    expect(b.systems[0].height).toBeGreaterThan(a.systems[0].height * 1.3);
    expect(b.measures[0].width).toBeGreaterThan(a.measures[0].width * 1.3);
  });
});
