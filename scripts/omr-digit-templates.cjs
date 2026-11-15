#!/usr/bin/env node
/**
 * Glyph templates for the printed-tablature reader (src/core/omr/tab/).
 *
 *   node scripts/omr-digit-templates.cjs                 # rewrite src/core/omr/tab/digit-templates.data.ts
 *   node scripts/omr-digit-templates.cjs --sheet         # also write a contact sheet to e2e/out/omr/tab-templates.png
 *   node scripts/omr-digit-templates.cjs --list          # print the faces that would be rendered and stop
 *   node scripts/omr-digit-templates.cjs --fixtures      # rewrite the technique fixtures in src/core/omr/tab/fixtures/
 *
 * Fret numbers are printed in whatever text face the engraver picked, so the classifier compares
 * a glyph with the ten digits (and the few marks that share a string line with them: x, brackets,
 * technique letters) as drawn by many faces and weights. This script draws every glyph once in the
 * bundled Chromium, crops it to its ink, resamples it to a fixed height (the width follows the
 * glyph, because "how narrow" is half of what tells a 1 from a 0) and packs the lot at four bits
 * per pixel into one base64 string. Near-duplicates (two faces drawing the same shape) are dropped.
 *
 * Faces come from the fonts installed on the machine plus the ones bundled with the app; a face
 * that is missing is skipped with a warning, so the committed data file only changes when someone
 * regenerates it on purpose.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'src', 'core', 'omr', 'tab', 'digit-templates.data.ts');
const nm = (...p) => path.join(ROOT, 'node_modules', ...p);

/** Rows of every template. */
const H = 16;
/** Widest template kept, px at height H. */
const MAX_W = 28;
/** Glyph classes, in the order of their class index. The ten digits come first. */
const CLASSES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'x', '(', ')', '<', '>', 'h', 'p', 'b', 's', 'r', '/', '\\', '~'];
/** Extra spellings drawn for a class (an upper-case X is still a dead note). */
const VARIANTS = { x: ['x', 'X'], h: ['h', 'H'], p: ['p', 'P'], s: ['s', 'S'] };

/** Families whose marks (everything but the digits) are drawn: marks vary less from face to face than digits do. */
const MARK_FAMILIES = ['Liberation Sans', 'DejaVu Sans', 'Inter', 'Liberation Serif', 'FreeSerif', 'JetBrains Mono', 'Liberation Mono'];
/** Correlation above which a second template of a class adds nothing: [digits, marks]. */
const DEDUPE = [0.955, 0.9];

/** [family, weights]. Families are grouped so that look-alikes sit together in the data. */
const FACES = [
  ['Liberation Sans', [400, 700]],
  ['FreeSans', [400, 700]],
  ['DejaVu Sans', [400, 700]],
  ['Inter', [300, 400, 600, 800]],
  ['Carlito', [400, 700]],
  ['Loma', [400, 700]],
  ['Instrument Sans', [400, 600, 700]],
  ['Bricolage Grotesque', [300, 500, 700]],
  ['Liberation Serif', [400, 700]],
  ['FreeSerif', [400, 700]],
  ['DejaVu Serif', [400, 700]],
  ['Caladea', [400, 700]],
  ['Bitstream Charter', [400, 700]],
  ['JetBrains Mono', [300, 500, 800]],
  ['Liberation Mono', [400, 700]],
  ['DejaVu Sans Mono', [400, 700]],
  ['FreeMono', [400, 700]],
  ['Courier 10 Pitch', [400, 700]],
];

function fontFaceCss() {
  const face = (family, file, weight, format) => {
    if (!fs.existsSync(file)) return '';
    const data = fs.readFileSync(file).toString('base64');
    const mime = format === 'truetype' ? 'font/ttf' : 'font/woff2';
    return `@font-face{font-family:"${family}";src:url(data:${mime};base64,${data}) format("${format}");font-weight:${weight};font-style:normal;}`;
  };
  const pdf = (f) => nm('pdfjs-dist', 'standard_fonts', f);
  return [
    // The same files the fixture corpus is engraved with, so both scripts agree on these faces.
    face('Liberation Sans', pdf('LiberationSans-Regular.ttf'), 400, 'truetype'),
    face('Liberation Sans', pdf('LiberationSans-Bold.ttf'), 700, 'truetype'),
    face('JetBrains Mono', nm('@fontsource-variable', 'jetbrains-mono', 'files', 'jetbrains-mono-latin-wght-normal.woff2'), '100 800', 'woff2'),
    face('Instrument Sans', nm('@fontsource-variable', 'instrument-sans', 'files', 'instrument-sans-latin-wght-normal.woff2'), '400 700', 'woff2'),
    face('Bricolage Grotesque', nm('@fontsource-variable', 'bricolage-grotesque', 'files', 'bricolage-grotesque-latin-wght-normal.woff2'), '200 800', 'woff2'),
  ].join('\n');
}

/** Runs in the page: draw each glyph of each face and return its ink crop. */
async function renderInPage({ faces, glyphs, size, markFamilies }) {
  const canvas = document.createElement('canvas');
  canvas.width = size * 3;
  canvas.height = size * 3;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const widthOf = (font, text) => { ctx.font = font; return ctx.measureText(text).width; };
  const probe = 'mmmmmmmmmmlli0123456789';
  /** A family is installed when its metrics differ from every generic fallback. */
  const available = (family) => ['serif', 'sans-serif', 'monospace'].some((g) => widthOf(`${size}px "${family}", ${g}`, probe) !== widthOf(`${size}px ${g}`, probe))
    && widthOf(`${size}px "${family}", serif`, probe) === widthOf(`${size}px "${family}", monospace`, probe);
  const draw = (font, ch) => {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    ctx.font = font;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(ch, size, size * 2);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let x0 = canvas.width, y0 = canvas.height, x1 = -1, y1 = -1;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        if (img[(y * canvas.width + x) * 4] < 128) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return null;
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const ink = new Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ink[y * w + x] = 255 - img[((y0 + y) * canvas.width + x0 + x) * 4];
    return { x0, y0, w, h, ink };
  };
  const out = [];
  const missing = [];
  for (const [family, weights] of faces) {
    await Promise.all(weights.map((wt) => document.fonts.load(`${wt} ${size}px "${family}"`, '0123456789xX()<>hpbsr/~')));
    if (!available(family)) {
      missing.push(family);
      continue;
    }
    for (const weight of weights) {
      const font = `${weight} ${size}px "${family}"`;
      const zero = draw(font, '0');
      if (!zero) continue;
      const centre = zero.y0 + zero.h / 2;
      for (const [cls, chars] of glyphs) {
        if (!/[0-9]/.test(cls) && (!markFamilies.includes(family) || (weight !== 400 && weight !== 500 && weight !== 700))) continue;
        for (const ch of chars) {
          const g = draw(font, ch);
          if (!g) continue;
          out.push({ family, weight, cls, ch, w: g.w, h: g.h, ink: g.ink, relH: g.h / zero.h, relY: (g.y0 + g.h / 2 - centre) / zero.h });
        }
      }
    }
  }
  return { glyphs: out, missing };
}

/** Area-average a w x h ink crop to H rows; the width keeps the aspect ratio. */
function normalise(g) {
  const w = Math.max(2, Math.min(MAX_W, Math.round((g.w * H) / g.h)));
  const out = new Float64Array(w * H);
  const sx = g.w / w;
  const sy = g.h / H;
  for (let y = 0; y < H; y++) {
    const ya = y * sy;
    const yb = (y + 1) * sy;
    for (let x = 0; x < w; x++) {
      const xa = x * sx;
      const xb = (x + 1) * sx;
      let sum = 0;
      let area = 0;
      for (let yy = Math.floor(ya); yy < Math.ceil(yb); yy++) {
        const wy = Math.min(yb, yy + 1) - Math.max(ya, yy);
        for (let xx = Math.floor(xa); xx < Math.ceil(xb); xx++) {
          const wx = Math.min(xb, xx + 1) - Math.max(xa, xx);
          sum += g.ink[yy * g.w + xx] * wx * wy;
          area += wx * wy;
        }
      }
      out[y * w + x] = sum / area;
    }
  }
  return { w, px: out };
}

/** Correlation of two templates of one class, each centred in the wider of the two boxes. */
function similarity(a, b) {
  const w = Math.max(a.w, b.w);
  const oa = (w - a.w) >> 1;
  const ob = (w - b.w) >> 1;
  let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  const n = w * H;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < w; x++) {
      const va = x >= oa && x < oa + a.w ? a.px[y * a.w + x - oa] : 0;
      const vb = x >= ob && x < ob + b.w ? b.px[y * b.w + x - ob] : 0;
      sa += va; sb += vb; saa += va * va; sbb += vb * vb; sab += va * vb;
    }
  }
  const cov = sab - (sa * sb) / n;
  const den = Math.sqrt((saa - (sa * sa) / n) * (sbb - (sb * sb) / n));
  return den > 0 ? cov / den : 0;
}

function writeSheet(file, templates) {
  const cols = 46;
  const cell = MAX_W + 2;
  const rows = Math.ceil(templates.length / cols);
  const png = new PNG({ width: cols * cell * 2, height: rows * (H + 4) * 2 });
  png.data.fill(255);
  templates.forEach((t, i) => {
    const cx = (i % cols) * cell;
    const cy = Math.floor(i / cols) * (H + 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < t.w; x++) {
        const v = 255 - Math.round(t.px[y * t.w + x]);
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const o = (((cy + y) * 2 + dy + 2) * png.width + (cx + x) * 2 + dx + 2) * 4;
            png.data[o] = png.data[o + 1] = png.data[o + 2] = v;
          }
        }
      }
    }
  });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--list')) {
    for (const [family, weights] of FACES) console.log(`${family.padEnd(24)} ${weights.join(' ')}`);
    return;
  }
  if (args.includes('--fixtures')) {
    // The technique fixtures share this script's browser set-up; see tab-fixtures section below.
    await require('./omr-digit-templates.cjs').renderFixtures(args);
    return;
  }
  const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb'] });
  let rendered;
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
    await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
    await page.addStyleTag({ content: fontFaceCss() });
    rendered = await page.evaluate(renderInPage, { faces: FACES, glyphs: CLASSES.map((c) => [c, VARIANTS[c] || [c]]), size: 160, markFamilies: MARK_FAMILIES });
  } finally {
    await browser.close();
  }
  for (const f of rendered.missing) console.warn(`warning: font "${f}" is not installed; skipped`);
  const families = FACES.map((f) => f[0]).filter((f) => !rendered.missing.includes(f));

  const all = rendered.glyphs.map((g) => ({ ...g, ...normalise(g) }));
  // Drop near-duplicates within a class: faces cut from the same model draw the same digit.
  // A face is one family at one weight. Every template remembers all the faces it stands for, so
  // the reader can still ask "how well does this face explain the staff" after the duplicates are gone.
  const faces = [];
  for (const t of all) if (!faces.some((f) => f.family === t.family && f.weight === t.weight)) faces.push({ family: t.family, weight: t.weight });
  const faceOf = (t) => faces.findIndex((f) => f.family === t.family && f.weight === t.weight);
  const kept = [];
  for (const t of all) {
    const twin = kept.find((k) => k.cls === t.cls && k.ch === t.ch && Math.abs(k.relH - t.relH) < 0.08 && Math.abs(k.relY - t.relY) < 0.08 && similarity(k, t) >= DEDUPE[/[0-9]/.test(t.cls) ? 0 : 1]);
    if (twin) twin.faces.push(faceOf(t));
    else kept.push({ ...t, faces: [faceOf(t)] });
  }
  kept.sort((a, b) => CLASSES.indexOf(a.cls) - CLASSES.indexOf(b.cls));
  const maskBytes = Math.ceil(faces.length / 8);

  // Pack: [class, family, weight / 100, width, relH * 64, (relY * 64) + 128] then rows of 4-bit pixels.
  const bytes = [];
  for (const t of kept) {
    bytes.push(CLASSES.indexOf(t.cls), families.indexOf(t.family), Math.round(t.weight / 100), t.w,
      Math.max(0, Math.min(255, Math.round(t.relH * 64))), Math.max(0, Math.min(255, Math.round(t.relY * 64) + 128)));
    const mask = new Array(maskBytes).fill(0);
    for (const f of t.faces) mask[f >> 3] |= 1 << (f & 7);
    bytes.push(...mask);
    const q = Array.from(t.px, (v) => Math.max(0, Math.min(15, Math.round(v / 17))));
    if (q.length % 2) q.push(0);
    for (let i = 0; i < q.length; i += 2) bytes.push((q[i] << 4) | q[i + 1]);
  }
  const b64 = Buffer.from(bytes).toString('base64');
  const lines = b64.match(/.{1,120}/g) || [];
  const counts = CLASSES.map((c) => kept.filter((t) => t.cls === c).length);
  const src = `/**
 * GENERATED by scripts/omr-digit-templates.cjs — do not edit by hand.
 *
 * ${kept.length} glyph templates (${all.length} drawn, near-duplicates dropped) from ${families.length} font families:
 * ${families.join(', ')}.
 * Per class: ${CLASSES.map((c, i) => `${c === '\\' ? 'backslash' : c} ${counts[i]}`).join(', ')}.
 */

/** Rows of every template; the width varies with the glyph. */
export const TEMPLATE_HEIGHT = ${H};

/** Label of each class index. Indices 0-9 are the digits. */
export const TEMPLATE_CLASSES: readonly string[] = ${JSON.stringify(CLASSES)};

/** Font family of each family index (for leave-one-family-out tests). */
export const TEMPLATE_FAMILIES: readonly string[] = ${JSON.stringify(families)};

/** The faces drawn: [family index, CSS weight]. A template stands for one or more of them. */
export const TEMPLATE_FACES: readonly (readonly [number, number])[] = ${JSON.stringify(faces.map((f) => [families.indexOf(f.family), f.weight]))};

/**
 * Packed templates, base64. Each record: class index, family index, weight / 100, width w,
 * height relative to the digits of the face * 64, vertical offset of the glyph centre from the
 * digit centre * 64 + 128, ${maskBytes} bytes of face bit mask (bit f = stands for face f), then
 * ceil(w * ${H} / 2) bytes of 4-bit ink (row-major, high nibble first).
 */
export const TEMPLATE_DATA =
${lines.map((l) => `  '${l}'`).join(' +\n')};
`;
  fs.writeFileSync(OUT, src);
  console.log(`${kept.length} templates (${all.length} drawn) from ${families.length} families -> ${path.relative(ROOT, OUT)} (${(src.length / 1024).toFixed(1)} KB)`);
  console.log(`per class: ${CLASSES.map((c, i) => `${c}:${counts[i]}`).join(' ')}`);
  if (args.includes('--sheet')) {
    const file = path.join(ROOT, 'e2e', 'out', 'omr', 'tab-templates.png');
    writeSheet(file, kept);
    console.log(`contact sheet -> ${path.relative(ROOT, file)}`);
  }
}

module.exports = { FACES, CLASSES, fontFaceCss, renderFixtures: async () => { throw new Error('technique fixtures are not implemented yet'); } };

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
