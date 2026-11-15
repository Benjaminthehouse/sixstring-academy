import { describe, expect, it } from 'vitest';
import { AMAZING_GRACE, CAMPFIRE_GROOVE, TECHNIQUE_SAMPLER, sixTab } from '@/core/song';
import { RIVERSIDE_MORNING } from './demo';
import { drawSystem, glyphsIn, slurPath, type TabGlyph, type TabNoteGlyph } from './draw';
import { layoutTab, type TabLayout } from './layout';
import { buildTabModel } from './model';

const fixtures = { sampler: TECHNIQUE_SAMPLER, river: RIVERSIDE_MORNING, grace: AMAZING_GRACE, groove: CAMPFIRE_GROOVE };

function layouts(): Array<{ name: string; L: TabLayout }> {
  const out: Array<{ name: string; L: TabLayout }> = [];
  for (const [name, text] of Object.entries(fixtures))
    for (const width of [328, 760, 1200]) out.push({ name: `${name}@${width}`, L: layoutTab(buildTabModel(sixTab(text)), { width }) });
  return out;
}

/** Horizontal segments of a string-line path: `M x y H x2`. */
function segments(d: string): Array<{ y: number; x0: number; x1: number }> {
  const out: Array<{ y: number; x0: number; x1: number }> = [];
  const re = /M(-?[\d.]+) (-?[\d.]+)H(-?[\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) out.push({ x0: Number(m[1]), y: Number(m[2]), x1: Number(m[3]) });
  return out;
}

const texts = (g: TabGlyph[], c: string) => g.filter((x): x is Extract<TabGlyph, { k: 'text' }> => x.k === 'text' && x.c === c);

describe('drawSystem', () => {
  it('cuts every string line around every fret number', () => {
    for (const { name, L } of layouts()) {
      L.systems.forEach((_s, si) => {
        const g = drawSystem(L, si).glyphs;
        const lines = g.filter((x) => x.k === 'path' && x.c === 'string').flatMap((x) => segments((x as { d: string }).d));
        const notes = g.filter((x): x is TabNoteGlyph => x.k === 'note');
        for (const n of notes) {
          const crossing = lines.filter((s) => Math.abs(s.y - n.y) < 0.6 && s.x0 < n.x + n.half - 0.2 && s.x1 > n.x - n.half + 0.2);
          expect(crossing, `${name}: a string line runs through ${n.text} at ${n.x}`).toEqual([]);
        }
      });
    }
  });

  it('never prints two fret numbers on one string on top of each other', () => {
    for (const { name, L } of layouts()) {
      L.systems.forEach((_s, si) => {
        const notes = drawSystem(L, si).glyphs.filter((x): x is TabNoteGlyph => x.k === 'note');
        const byString = new Map<number, TabNoteGlyph[]>();
        for (const n of notes) byString.set(n.y, [...(byString.get(n.y) ?? []), n]);
        for (const list of byString.values()) {
          list.sort((a, b) => a.x - b.x);
          for (let i = 1; i < list.length; i++) expect(list[i].x0, `${name}: ${list[i - 1].text} and ${list[i].text}`).toBeGreaterThanOrEqual(list[i - 1].x1);
        }
      });
    }
  });

  it('keeps chord symbols and lyrics apart', () => {
    for (const { name, L } of layouts()) {
      L.systems.forEach((_s, si) => {
        const g = drawSystem(L, si).glyphs;
        for (const c of ['chord', 'lyric']) {
          const list = texts(g, c).sort((a, b) => a.x0 - b.x0);
          for (let i = 1; i < list.length; i++) expect(list[i].x0, `${name}: "${list[i - 1].text}" and "${list[i].text}"`).toBeGreaterThan(list[i - 1].x1);
        }
      });
    }
  });

  it('draws every technique of the sampler', () => {
    const L = layoutTab(buildTabModel(sixTab(TECHNIQUE_SAMPLER)), { width: 1200 });
    const g = L.systems.flatMap((_s, i) => drawSystem(L, i).glyphs);
    const count = (c: string) => g.filter((x) => 'c' in x && x.c === c).length;
    expect(texts(g, 'slurLetter').map((t) => t.text).sort()).toEqual(['H', 'H', 'P', 'P']);
    expect(count('slide')).toBe(5); // two legato slides, a slide in and a slide out, a slide in from above
    expect(texts(g, 'bendLabel').map((t) => t.text)).toEqual(['full', '½', 'full', 'full']);
    expect(count('vibrato')).toBeGreaterThanOrEqual(2);
    expect(texts(g, 'spanLabel').map((t) => t.text).sort()).toEqual(['P.M.', 'let ring']);
    expect(count('tie')).toBe(1);
    expect(texts(g, 'articText').map((t) => t.text)).toContain('T');
    expect(count('strokeFill') + count('stroke')).toBe(3);
    expect(texts(g, 'pluck').map((t) => t.text)).toEqual(['p', 'i', 'm', 'a']);
    expect(texts(g, 'finger').map((t) => t.text)).toEqual(['1', '3']);
    expect(g.filter((x) => x.k === 'note' && x.harmonic)).toHaveLength(3);
    expect(g.filter((x) => x.k === 'note' && x.paren && !x.tied)).toHaveLength(1);
    expect(count('tuplet')).toBe(1);
    expect(count('rest') + count('restLine')).toBeGreaterThanOrEqual(2);
  });

  it('draws repeats, endings and a final barline', () => {
    const L = layoutTab(buildTabModel(sixTab(CAMPFIRE_GROOVE)), { width: 1000 });
    const g = L.systems.flatMap((_s, i) => drawSystem(L, i).glyphs);
    expect(g.filter((x) => x.k === 'circle' && x.c === 'repeatDot')).toHaveLength(4);
    expect(texts(g, 'voltaText').map((t) => t.text)).toEqual(expect.arrayContaining(['1.', '2.']));
    expect(g.filter((x) => x.k === 'rect' && x.c === 'barThick')).toHaveLength(3);
    expect(g.filter((x) => x.k === 'path' && (x.c === 'slash' || x.c === 'slashOpen')).length).toBeGreaterThan(30);
  });

  it('gives a tile of a long line only what touches it', () => {
    const L = layoutTab(buildTabModel(sixTab(RIVERSIDE_MORNING)), { width: 400, mode: 'line', tileWidth: 500 });
    const d = drawSystem(L, 0);
    const t = L.tiles[1];
    const part = glyphsIn(d, t.x, t.x + t.width);
    expect(part.length).toBeGreaterThan(10);
    expect(part.length).toBeLessThan(d.glyphs.length);
    for (const x of part) expect(x.x1 >= t.x && x.x0 <= t.x + t.width).toBe(true);
  });

  it('builds slurs as closed crescents', () => {
    expect(slurPath(0, 0, 20, 0, -5)).toMatch(/^M0 0C.*Z$/);
  });
});
