/**
 * The glyph classifier: templates, boxes, correlation, struck-through glyphs, and how well it
 * does on a face whose templates are taken away.
 */
import { describe, expect, it } from 'vitest';
import { createGray, gaussianBlur } from '../image/gray';
import {
  type GlyphPatch, classifyPatch, correlate, correlateComposite, discriminate, extractPatch, lineInBox, lineProfileAt, patchFromBinary, patchFromInk, refineBox,
} from './glyph';
import {
  BLUR_LEVELS, GLYPH_H, GLYPH_LABELS, TEMPLATE_FACE_LIST, TEMPLATE_FAMILY_NAMES, type GlyphTemplate, blurTemplate, glyphClass, halfMaxBox, loadTemplates, resampleBox,
  struckTemplates, templatesAtBlur,
} from './templates';

const digits = (t: GlyphTemplate): boolean => t.cls < 10 && !t.music;
const asPatch = (t: GlyphTemplate): GlyphPatch => patchFromInk(t.px, t.w);

/** Paint a template into a grey image at a given height; returns the image and the glyph's box. */
function paint(t: GlyphTemplate, height: number, opts: { line?: number; blur?: number } = {}): { gray: ReturnType<typeof createGray>; box: { x0: number; y0: number; x1: number; y1: number }; lineY: number } {
  const w = Math.round((t.w * height) / GLYPH_H);
  const px = resampleBox(t.px, t.w, GLYPH_H, { x0: 0, y0: 0, x1: t.w, y1: GLYPH_H }, w, height);
  let gray = createGray(160, 80);
  const x0 = 70;
  const y0 = 40 - Math.round(height / 2);
  const ink = new Float32Array(160 * 80);
  for (let y = 0; y < height; y++) for (let x = 0; x < w; x++) ink[(y0 + y) * 160 + x0 + x] = px[y * w + x];
  const lineY = 40;
  if (opts.line) for (let x = 0; x < 160; x++) for (let d = 0; d < opts.line; d++) ink[(Math.round(lineY - opts.line / 2) + d) * 160 + x] = 1;
  for (let i = 0; i < ink.length; i++) gray.data[i] = Math.round(255 * (1 - ink[i]));
  if (opts.blur) gray = gaussianBlur(gray, opts.blur);
  return { gray, box: { x0, y0, x1: x0 + w, y1: y0 + height }, lineY };
}

describe('templates', () => {
  it('decode into the digits and marks of many faces', () => {
    const all = loadTemplates();
    expect(all.length).toBeGreaterThan(300);
    expect(GLYPH_LABELS.slice(0, 10)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
    for (let d = 0; d < 10; d++) expect(all.filter((t) => t.cls === d && !t.music).length, `templates of ${d}`).toBeGreaterThanOrEqual(15);
    for (const label of ['x', '(', ')', '<', '>', 'h', 'p', 'b', '/', '\\', 'rq', 'r8']) expect(all.some((t) => t.label === label), label).toBe(true);
    expect(glyphClass('7')).toBe(7);
    expect(TEMPLATE_FAMILY_NAMES.length).toBeGreaterThanOrEqual(12);
    for (const t of all) {
      expect(t.px.length).toBe(t.w * GLYPH_H);
      expect(t.faces.length).toBeGreaterThanOrEqual(1);
      expect(t.faces.every((f) => f >= 0 && f < TEMPLATE_FACE_LIST.length)).toBe(true);
      // Tight: ink reaches every side of the box.
      let top = 0, bottom = 0;
      for (let x = 0; x < t.w; x++) {
        top = Math.max(top, t.px[x]);
        bottom = Math.max(bottom, t.px[(GLYPH_H - 1) * t.w + x]);
      }
      expect(Math.min(top, bottom), `${t.label} of ${TEMPLATE_FAMILY_NAMES[t.family]}`).toBeGreaterThan(0.25);
    }
    // A 1 is narrow, an x is short, a bracket is tall.
    const mean = (label: string, f: (t: GlyphTemplate) => number): number => {
      const list = all.filter((t) => t.label === label && !t.music);
      return list.reduce((a, t) => a + f(t), 0) / list.length;
    };
    expect(mean('1', (t) => t.w)).toBeLessThan(mean('0', (t) => t.w) - 2);
    expect(mean('x', (t) => t.relH)).toBeLessThan(0.9);
    expect(mean('(', (t) => t.relH)).toBeGreaterThan(1.1);
  });

  it('keep their class when blurred, at every level', () => {
    for (let level = 0; level < BLUR_LEVELS.length; level++) {
      const set = templatesAtBlur(level);
      expect(set.length).toBe(loadTemplates().length);
      let right = 0;
      let n = 0;
      set.forEach((t) => {
        if (!digits(t)) return;
        n++;
        if (classifyPatch(asPatch(t), set, { allow: digits })[0].cls === t.cls) right++;
      });
      expect(right, `blur level ${level}`).toBe(n);
    }
  });

  it('cut a blurred glyph by its half-maximum outline, wider than the sharp one', () => {
    const zero = loadTemplates().find((t) => t.label === '0' && t.weight === 400) as GlyphTemplate;
    const soft = blurTemplate(zero, 2);
    expect(soft.px.length).toBe(soft.w * GLYPH_H);
    // The outline of a sharp, tight glyph is the glyph's own box.
    const box = halfMaxBox(zero.px, zero.w, GLYPH_H);
    expect(box).not.toBeNull();
    expect(box!.x0).toBeLessThan(0.6);
    expect(box!.y0).toBeLessThan(0.6);
    expect(zero.w - box!.x1).toBeLessThan(0.6);
    expect(GLYPH_H - box!.y1).toBeLessThan(0.6);
    expect(halfMaxBox(new Float32Array(40), 5, 8)).toBeNull();
  });
});

describe('correlation', () => {
  it('is 1 for a glyph with itself, lower for a shifted copy, and low for another digit', () => {
    const set = templatesAtBlur(1);
    const three = set.find((t) => t.label === '3' && !t.music) as GlyphTemplate;
    const eight = set.find((t) => t.label === '8' && t.family === three.family && !t.music) ?? (set.find((t) => t.label === '8') as GlyphTemplate);
    const p = asPatch(three);
    expect(correlate(p, three)).toBeCloseTo(1, 5);
    expect(correlate(p, three, 1, 0)).toBeLessThan(0.97);
    expect(correlate(p, three, 0, 1)).toBeLessThan(0.97);
    expect(correlate(p, eight)).toBeLessThan(0.9);
    expect(correlate(p, eight)).toBeGreaterThan(0.3);
    // Symmetric in its two arguments.
    expect(correlate(asPatch(eight), three)).toBeCloseTo(correlate(p, eight), 5);
  });

  it('prefers the pair of 1s over a 0 for two touching 1s, and the 0 for a 0', () => {
    const set = templatesAtBlur(1);
    const one = set.find((t) => t.label === '1' && t.weight === 400 && !t.music) as GlyphTemplate;
    const zero = set.find((t) => t.label === '0' && t.family === one.family && !t.music) ?? (set.find((t) => t.label === '0') as GlyphTemplate);
    const w = one.w * 2;
    const pair = new Float32Array(w * GLYPH_H);
    for (let y = 0; y < GLYPH_H; y++) for (let x = 0; x < one.w; x++) pair[y * w + x] = pair[y * w + one.w + x] = one.px[y * one.w + x];
    const p = patchFromInk(pair, w);
    const parts = [{ t: one, c0: 0, c1: one.w }, { t: one, c0: one.w, c1: w }];
    expect(correlateComposite(p, parts)).toBeGreaterThan(0.95);
    expect(correlateComposite(p, parts)).toBeGreaterThan((classifyPatch(p, set, { allow: digits })[0]?.score ?? 0) + 0.1);
    const pz = asPatch(zero);
    expect(correlate(pz, zero)).toBeGreaterThan(correlateComposite(pz, [{ t: one, c0: 0, c1: zero.w / 2 }, { t: one, c0: zero.w / 2, c1: zero.w }]) + 0.1);
  });

  it('settles a 6 against a 0 on the pixels where the two differ', () => {
    const set = templatesAtBlur(2);
    const six = set.find((t) => t.label === '6' && t.weight === 700 && !t.music) as GlyphTemplate;
    const zero = set.find((t) => t.label === '0' && t.weight === 700 && !t.music) as GlyphTemplate;
    expect(discriminate(asPatch(six), six, zero)).toBeGreaterThan(0.3);
    expect(discriminate(asPatch(zero), six, zero)).toBeLessThan(-0.3);
  });
});

describe('patches from the strip', () => {
  it('recover a glyph painted at another size, sharp or blurred, as its own class', () => {
    const base = loadTemplates().filter((t) => digits(t) && t.family === TEMPLATE_FAMILY_NAMES.indexOf('Liberation Sans') && t.weight === 400);
    expect(base.length).toBeGreaterThanOrEqual(8);
    for (const [blur, level] of [[0, 0], [1.2, 1], [2.2, 3]] as const) {
      for (const t of base) {
        const { gray, box } = paint(t, 21, { blur });
        // Start from a loose box, as a threshold on a soft picture gives.
        const rough = { x0: box.x0 - 1, y0: box.y0 - 1, x1: box.x1 + 1, y1: box.y1 + 1 };
        const tight = refineBox(gray, rough);
        expect(tight.x1 - tight.x0).toBeLessThanOrEqual(rough.x1 - rough.x0 + 2);
        const ranked = classifyPatch(extractPatch(gray, tight), templatesAtBlur(level), { allow: digits });
        expect(ranked[0].label, `${t.label} blur ${blur}`).toBe(t.label);
        expect(ranked[0].score, `${t.label} blur ${blur}`).toBeGreaterThan(0.85);
      }
    }
  });

  it('measure a staff line through a glyph and read the glyph against struck templates', () => {
    const face = TEMPLATE_FAMILY_NAMES.indexOf('Liberation Sans');
    let right = 0;
    let n = 0;
    for (const t of loadTemplates().filter((q) => digits(q) && q.family === face && q.weight === 700)) {
      const { gray, box, lineY } = paint(t, 21, { line: 3, blur: 0.8 });
      const profile = lineProfileAt(gray, lineY, 0, 160, 8);
      const at = lineInBox(profile, box);
      // Blur keeps the ink of the line: its profile sums to the thickness of the sharp line.
      expect(at.thickness * (21 / GLYPH_H)).toBeGreaterThan(2.5);
      expect(at.thickness * (21 / GLYPH_H)).toBeLessThan(3.5);
      expect(at.centre).toBeGreaterThan(6);
      expect(at.centre).toBeLessThan(10);
      const tight = refineBox(gray, box, profile);
      const patch = extractPatch(gray, tight, profile);
      const ranked = classifyPatch(patch, struckTemplates(1, lineInBox(profile, tight).centre, lineInBox(profile, tight).thickness), { allow: digits });
      n++;
      if (ranked[0].label === t.label) right++;
    }
    // A line through the middle hides what tells some digits apart; most still read.
    expect(right).toBeGreaterThanOrEqual(n - 1);
    // Without a line there is nothing to measure.
    const plain = paint(loadTemplates()[0], 21);
    expect(lineInBox(lineProfileAt(plain.gray, 10, 0, 160, 4), plain.box).thickness).toBe(0);
  });

  it('build patches from binary images for the big glyphs', () => {
    const bin = { width: 40, height: 60, data: new Uint8Array(40 * 60) };
    for (let y = 10; y < 50; y++) for (let x = 15; x < 20; x++) bin.data[y * 40 + x] = 1;
    const p = patchFromBinary(bin, { x0: 15, y0: 10, x1: 20, y1: 50 });
    expect(p.w).toBe(2);
    expect(Math.min(...p.ink)).toBeCloseTo(1, 5);
  });
});

describe('faces without templates', () => {
  it('are read from the templates of the other faces (leave one family out)', () => {
    const all = templatesAtBlur(1);
    const sharp = loadTemplates();
    let right = 0;
    let n = 0;
    const worst: { family: string; rate: number }[] = [];
    for (let fam = 0; fam < TEMPLATE_FAMILY_NAMES.length; fam++) {
      if (TEMPLATE_FAMILY_NAMES[fam].endsWith('(music)')) continue;
      const faces = TEMPLATE_FACE_LIST.map((f, i) => (f[0] === fam ? i : -1)).filter((i) => i >= 0);
      // Templates that stand for no face of this family.
      const others = all.filter((t) => digits(t) && !t.faces.some((f) => faces.includes(f)));
      let ok = 0;
      let k = 0;
      sharp.forEach((t, i) => {
        if (!digits(t) || t.family !== fam) return;
        k++;
        // The glyph as a lightly blurred picture of itself.
        const p = asPatch(all[i]);
        if (classifyPatch(p, others)[0]?.cls === t.cls) ok++;
      });
      if (!k) continue;
      right += ok;
      n += k;
      worst.push({ family: TEMPLATE_FAMILY_NAMES[fam], rate: ok / k });
    }
    worst.sort((a, b) => a.rate - b.rate);
    expect(n).toBeGreaterThan(150);
    // Measured: 246 of 247 (99.6 %) at this blur level; 247 of 247 sharp, 243 of 247 at the strongest blur but one.
    expect(right / n, `worst: ${worst.slice(0, 3).map((w) => `${w.family} ${(w.rate * 100).toFixed(0)}%`).join(', ')}`).toBeGreaterThanOrEqual(0.97);
    expect(worst[0].rate, worst[0].family).toBeGreaterThanOrEqual(0.85);
  });
});
