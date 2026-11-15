#!/usr/bin/env node
/**
 * Glyph templates for the printed-tablature reader (src/core/omr/tab/).
 *
 *   node scripts/omr-digit-templates.cjs                 # rewrite src/core/omr/tab/digit-templates.data.ts
 *   node scripts/omr-digit-templates.cjs --sheet         # also write a contact sheet to e2e/out/omr/tab-templates.png
 *   node scripts/omr-digit-templates.cjs --list          # print the faces that would be rendered and stop
 *   node scripts/omr-digit-templates.cjs --fixtures      # rewrite the reader's own test pages in src/core/omr/tab/fixtures/
 *                                                        # (technique marks, typewriter-style tab, held-out faces, bass tab)
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
const CLASSES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'x', '(', ')', '<', '>', 'h', 'p', 'b', 's', 'r', '/', '\\', '~', 'rq', 'r8', 'r16'];
/**
 * Music fonts (engraved with VexFlow): the big numerals of a time signature, drawn as extra
 * templates of the digit classes, and the rests that can stand in a tab staff. Their "family" ends
 * in " (music)" so the reader can keep them out of the fret numbers.
 */
const MUSIC_FONTS = ['Bravura', 'Gonville', 'Petaluma', 'Leland'];
const MUSIC_GLYPHS = [
  ...'0123456789'.split('').map((d) => [d, `timeSig${d}`]),
  ['rq', 'restQuarter'], ['r8', 'rest8th'], ['r16', 'rest16th'],
];
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
  ['Loma', [400, 700]],
  ['Instrument Sans', [400, 600, 700]],
  ['Bricolage Grotesque', [300, 500, 700]],
  ['Liberation Serif', [400, 700]],
  ['FreeSerif', [400, 700]],
  ['DejaVu Serif', [400, 700]],
  ['JetBrains Mono', [300, 500, 800]],
  ['Liberation Mono', [400, 700]],
  ['DejaVu Sans Mono', [400, 700]],
  ['FreeMono', [400, 700]],
];
/**
 * Installed families that are deliberately NOT drawn as templates: the "held-out" fixtures under
 * src/core/omr/tab/fixtures/ are set in them, so the tests measure the reader on faces it has
 * never seen (one sans, one serif).
 */
const HELD_OUT = ['Carlito', 'Caladea'];

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
async function renderInPage({ faces, glyphs, size, markFamilies, musicFonts, musicGlyphs }) {
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
  // Music-font glyphs through VexFlow's own outlines.
  const VF = window.Vex && window.Vex.Flow;
  if (VF) {
    const scan = () => {
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
    const vctx = new VF.Renderer(canvas, VF.Renderer.Backends.CANVAS).getContext();
    for (const font of musicFonts) {
      VF.setMusicFont(font, 'Bravura', 'Custom');
      const drawGlyph = (code) => {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#000';
        VF.Glyph.renderGlyph(vctx, size, size * 1.5, size * 0.9, code);
        return scan();
      };
      const zero = drawGlyph('timeSig0');
      if (!zero) continue;
      for (const [cls, code] of musicGlyphs) {
        const g = drawGlyph(code);
        if (!g) continue;
        out.push({ family: `${font} (music)`, weight: 400, cls, ch: code, w: g.w, h: g.h, ink: g.ink, relH: g.h / zero.h, relY: 0 });
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
    await renderFixtures(args);
    return;
  }
  const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb'] });
  let rendered;
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
    await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
    await page.addStyleTag({ content: fontFaceCss() });
    await page.addScriptTag({ path: nm('vexflow', 'build', 'cjs', 'vexflow.js') });
    rendered = await page.evaluate(renderInPage, {
      faces: FACES,
      glyphs: CLASSES.filter((c) => c.length === 1).map((c) => [c, VARIANTS[c] || [c]]),
      size: 160,
      markFamilies: MARK_FAMILIES,
      musicFonts: MUSIC_FONTS,
      musicGlyphs: MUSIC_GLYPHS,
    });
  } finally {
    await browser.close();
  }
  for (const f of rendered.missing) console.warn(`warning: font "${f}" is not installed; skipped`);
  const families = [...FACES.map((f) => f[0]).filter((f) => !rendered.missing.includes(f)), ...MUSIC_FONTS.map((f) => `${f} (music)`).filter((f) => rendered.glyphs.some((g) => g.family === f))];

  const all = rendered.glyphs.map((g) => ({ ...g, ...normalise(g) }));
  // Drop near-duplicates within a class: faces cut from the same model draw the same digit.
  // A face is one family at one weight. Every template remembers all the faces it stands for, so
  // the reader can still ask "how well does this face explain the staff" after the duplicates are gone.
  const faces = [];
  for (const t of all) if (!faces.some((f) => f.family === t.family && f.weight === t.weight)) faces.push({ family: t.family, weight: t.weight });
  const faceOf = (t) => faces.findIndex((f) => f.family === t.family && f.weight === t.weight);
  const kept = [];
  for (const t of all) {
    const twin = kept.find((k) => k.cls === t.cls && k.ch === t.ch && k.family.endsWith('(music)') === t.family.endsWith('(music)') && Math.abs(k.relH - t.relH) < 0.08 && Math.abs(k.relY - t.relY) < 0.08 && similarity(k, t) >= DEDUPE[/[0-9]/.test(t.cls) ? 0 : 1]);
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

// ------------------------------------------------------------------------------------------
// Technique / held-out fixtures (src/core/omr/tab/fixtures/)
// ------------------------------------------------------------------------------------------

const FIXTURE_DIR = path.join(ROOT, 'src', 'core', 'omr', 'tab', 'fixtures');
/** Sounding MIDI of the open strings, index 0 = string 1. */
const OPEN = [64, 59, 55, 50, 45, 40];
const OPEN_BASS = [43, 38, 33, 28];

/** Small seeded generator (mulberry32) so the random fixtures never change. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A fixture is a list of systems; a system a list of measures; a measure a list of columns; a
 * column a list of notes "string:text" where text is a fret, "x", "(5)" or "<12>". A note may
 * carry a mark towards the next note on its string: "3:5~h" (slur drawn as an arc, the letter H
 * over it), "3:5~t" (tie arc), "3:5~/" and "3:5~\\" (slide line), "3:5~b" (bend arrow), and
 * for typewriter-style tab "3:5+h" (the letter printed on the line after the number).
 */
function randomSystems(seed, strings, systems, measuresPer, colsPer, maxFret = 24) {
  const rnd = rng(seed);
  const out = [];
  for (let s = 0; s < systems; s++) {
    const sys = [];
    for (let m = 0; m < measuresPer; m++) {
      const cols = [];
      for (let c = 0; c < colsPer; c++) {
        const chord = rnd() < 0.25 ? 2 + Math.floor(rnd() * 3) : 1;
        const first = 1 + Math.floor(rnd() * (strings - chord + 1));
        const base = Math.floor(rnd() * (maxFret - 4));
        const col = [];
        for (let k = 0; k < chord; k++) col.push(`${first + k}:${chord > 1 ? (rnd() < 0.3 ? 0 : base + Math.floor(rnd() * 5)) : Math.floor(rnd() * (maxFret + 1))}`);
        cols.push(col);
      }
      sys.push(cols);
    }
    out.push(sys);
  }
  return out;
}

const MARKS_SYSTEMS = [
  [
    [['1:x'], ['2:x', '3:x', '4:x'], ['3:(5)'], ['2:(12)'], ['1:<12>'], ['3:<7>']],
    [['2:5~t'], ['2:5'], ['3:7~h'], ['3:9'], ['3:9~p'], ['3:7'], ['1:12~t'], ['1:12']],
  ],
  [
    [['4:5~/'], ['4:7'], ['2:10~\\'], ['2:8'], ['5:3~/'], ['5:12'], ['1:14~\\'], ['1:9']],
    [['2:7~b'], ['3:9'], ['1:15~b'], ['4:5'], ['3:2~h'], ['3:4'], ['3:4~p'], ['3:2']],
  ],
];
const ASCII_SYSTEMS = [
  [
    [['3:5+h'], ['3:7'], ['3:7+p'], ['3:5'], ['2:8+/'], ['2:10']],
    [['1:12+\\'], ['1:10'], ['2:7+b'], ['2:9+r'], ['2:7'], ['4:x'], ['4:x']],
  ],
  [
    [['5:3+h'], ['5:5'], ['4:2+h'], ['4:4'], ['4:4+p'], ['4:2']],
    [['6:0'], ['6:3+/'], ['6:5'], ['1:0', '2:1', '3:0', '4:2', '5:3'], ['3:x'], ['6:1']],
  ],
];

/** [id, options]. `px` is the distance between two tab lines; `font` any CSS font. */
const FIXTURES = [
  ['tech-marks-dejavu-150', { systems: MARKS_SYSTEMS, px: 14, font: '"DejaVu Sans"', weight: 400, tags: ['tech', 'marks'] }],
  ['tech-marks-freeserif-300', { systems: MARKS_SYSTEMS, px: 28, font: '"FreeSerif"', weight: 700, tags: ['tech', 'marks'] }],
  ['tech-marks-through-inter-220', { systems: MARKS_SYSTEMS, px: 20, font: '"Inter"', weight: 600, lineThrough: true, tags: ['tech', 'marks', 'line-through'] }],
  // (Typewriter tab is "blanked" by nature: its lines are dashes typed between the numbers.)
  ['tech-ascii-libmono-150', { systems: ASCII_SYSTEMS, px: 14, font: '"Liberation Mono"', weight: 400, clef: false, tags: ['tech', 'ascii'] }],
  ['tech-ascii-jbm-220', { systems: ASCII_SYSTEMS, px: 20, font: '"JetBrains Mono"', weight: 500, tags: ['tech', 'ascii'] }],
  ['heldout-carlito-150', { systems: randomSystems(11, 6, 3, 3, 7), px: 14, font: '"Carlito"', weight: 400, tags: ['held-out'] }],
  ['heldout-carlito-bold-100', { systems: randomSystems(12, 6, 3, 3, 6), px: 10, font: '"Carlito"', weight: 700, tags: ['held-out'] }],
  ['heldout-caladea-150', { systems: randomSystems(13, 6, 3, 3, 7), px: 14, font: '"Caladea"', weight: 400, tags: ['held-out'] }],
  ['heldout-caladea-bold-220', { systems: randomSystems(14, 6, 3, 3, 7), px: 20, font: '"Caladea"', weight: 700, tags: ['held-out'] }],
  ['heldout-caladea-through-220', { systems: randomSystems(15, 6, 3, 3, 7), px: 20, font: '"Caladea"', weight: 400, lineThrough: true, tags: ['held-out', 'line-through'] }],
  ['heldout-carlito-through-150', { systems: randomSystems(16, 6, 3, 3, 7), px: 14, font: '"Carlito"', weight: 700, lineThrough: true, tags: ['held-out', 'line-through'] }],
  ['bass-carlito-150', { systems: randomSystems(17, 4, 2, 3, 6, 12), px: 15, font: '"Carlito"', weight: 400, strings: 4, tags: ['held-out', 'four-line'] }],
];

/** Runs in the page: draw one fixture on a canvas and return the picture with its ground truth. */
async function drawFixtureInPage(spec) {
  const S = spec.px;
  const strings = spec.strings || 6;
  const lineW = Math.max(1, S * 0.085);
  const fontPx = S * 1.0;
  const font = `${spec.weight} ${fontPx}px ${spec.font}`;
  const small = `${spec.weight} ${fontPx * 0.72}px ${spec.font}`;
  await Promise.all([document.fonts.load(font, '0123456789x()<>hpbr/\\TAB'), document.fonts.load(small, 'HPfull12')]);
  const margin = Math.round(S * 4.5);
  const colW = S * 4.2;
  const sysGap = S * 9;
  const sysH = (strings - 1) * S;
  const widths = spec.systems.map((sys) => S * 3.5 + sys.reduce((a, m) => a + m.length * colW + S * 1.5, 0));
  const width = Math.round(margin * 2 + Math.max(...widths));
  const height = Math.round(margin * 2 + spec.systems.length * sysH + (spec.systems.length - 1) * sysGap + S * 2);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#000';
  ctx.strokeStyle = '#000';
  ctx.textBaseline = 'alphabetic';
  const inkBox = (text, f, cx, cy) => {
    // Centre the ink of `text` on (cx, cy) and return where to draw it and its tight box.
    ctx.font = f;
    const m = ctx.measureText(text);
    const w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    const h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    const x = cx - w / 2 + m.actualBoundingBoxLeft;
    const y = cy + h / 2 - m.actualBoundingBoxDescent;
    return { x, y, box: [cx - w / 2, cy - h / 2, w, h] };
  };
  ctx.font = font;
  const zero = ctx.measureText('0');
  const digitH = zero.actualBoundingBoxAscent + zero.actualBoundingBoxDescent;
  const tuning = strings === 4 ? spec.openBass : spec.open;
  const systems = [];
  let measureNo = 0;
  spec.systems.forEach((sys, si) => {
    const top = margin + si * (sysH + sysGap);
    const x0 = margin;
    const x1 = margin + widths[si];
    const lines = [];
    for (let l = 0; l < strings; l++) lines.push(top + l * S);
    // Staff lines and the bar lines at both ends.
    for (const y of lines) ctx.fillRect(x0, y - lineW / 2, x1 - x0, lineW);
    const barlines = [];
    const bar = (x, type) => {
      const w = Math.max(1, S * 0.1);
      if (type === 'end') {
        ctx.fillRect(x - S * 0.45, top - lineW / 2, w, sysH + lineW);
        ctx.fillRect(x - S * 0.22, top - lineW / 2, S * 0.3, sysH + lineW);
        barlines.push({ type, x: x - S * 0.18, bbox: [x - S * 0.45, top, S * 0.53, sysH], strokes: [[x - S * 0.45, w], [x - S * 0.22, S * 0.3]] });
      } else {
        ctx.fillRect(x - w / 2, top - lineW / 2, w, sysH + lineW);
        barlines.push({ type, x, bbox: [x - w / 2, top, w, sysH], strokes: [[x - w / 2, w]] });
      }
    };
    bar(x0 + S * 0.05, 'single');
    let clef = null;
    if (spec.clef !== false) {
      ctx.font = `700 ${sysH / 3.1}px "Liberation Sans"`;
      const letters = ['T', 'A', 'B'];
      const cx = x0 + S * 1.3;
      let cy0 = Infinity, cy1 = -Infinity, cxa = Infinity, cxb = -Infinity;
      letters.forEach((ch, k) => {
        const p = inkBox(ch, ctx.font, cx, top + sysH * (k + 0.5) / 3);
        ctx.fillText(ch, p.x, p.y);
        cxa = Math.min(cxa, p.box[0]); cxb = Math.max(cxb, p.box[0] + p.box[2]);
        cy0 = Math.min(cy0, p.box[1]); cy1 = Math.max(cy1, p.box[1] + p.box[3]);
      });
      clef = { type: 'tab', bbox: [cxa, cy0, cxb - cxa, cy1 - cy0] };
    }
    const measures = [];
    let x = x0 + S * 3.5;
    const placed = []; // every number of the system, for the marks between neighbours on a string
    sys.forEach((cols, mi) => {
      const mx0 = mi === 0 ? x0 : x - S * 0.75;
      const events = [];
      cols.forEach((col, ci) => {
        const cx = x + ci * colW + colW * 0.3;
        const notes = [];
        for (const item of col) {
          const m = /^(\d):(x|\((\d+)\)|<(\d+)>|(\d+))(?:([~+])(.))?$/.exec(item);
          if (!m) throw new Error(`bad note "${item}"`);
          const string = Number(m[1]);
          const dead = m[2] === 'x';
          const paren = m[3] !== undefined;
          const harmonic = m[4] !== undefined;
          const fret = dead ? 0 : Number(m[3] ?? m[4] ?? m[5]);
          const text = dead ? 'x' : String(fret);
          const y = lines[string - 1];
          const p = inkBox(text, font, cx, y);
          // Brackets hug the number.
          let full = [p.box[0], p.box[1], p.box[2], p.box[3]];
          const extra = [];
          if (paren || harmonic) {
            const [a, b] = paren ? ['(', ')'] : ['<', '>'];
            ctx.font = font;
            const wa = ctx.measureText(a).width;
            const pa = inkBox(a, font, p.box[0] - wa * 0.55, y);
            const pb = inkBox(b, font, p.box[0] + p.box[2] + wa * 0.55, y);
            extra.push([a, pa], [b, pb]);
            full = [pa.box[0], Math.min(pa.box[1], p.box[1]), pb.box[0] + pb.box[2] - pa.box[0], Math.max(pa.box[3], p.box[3])];
          }
          // Typewriter-style mark printed on the line right after the number.
          let inline = null;
          if (m[6] === '+') {
            ctx.font = font;
            const adv = ctx.measureText(text).width;
            inline = inkBox(m[7], font, cx + adv * 0.5 + ctx.measureText(m[7]).width * 0.55, y);
            // Letters sit on the baseline of the digits, not centred on the line.
            if (/[a-z]/.test(m[7])) inline.y = p.y;
          }
          if (!spec.lineThrough) {
            ctx.fillStyle = '#fff';
            const pad = S * 0.12;
            const right = inline ? inline.box[0] + inline.box[2] : full[0] + full[2];
            ctx.fillRect(full[0] - pad, y - lineW, right - full[0] + 2 * pad, lineW * 2);
            ctx.fillStyle = '#000';
          }
          ctx.font = font;
          ctx.fillText(text, p.x, p.y);
          for (const [ch, q] of extra) ctx.fillText(ch, q.x, q.y);
          if (inline) ctx.fillText(m[7], inline.x, inline.y);
          const note = {
            string, fret, bbox: p.box, midi: tuning[string - 1] + fret, written: tuning[string - 1] + fret + 12, tieStart: false, tieStop: false,
            dead, paren, harmonic, mark: m[6] ? m[7] : null, markStyle: m[6] || null,
          };
          notes.push(note);
          placed.push({ note, cx, y, box: full, string });
        }
        const bx0 = Math.min(...notes.map((n) => n.bbox[0]));
        const by0 = Math.min(...notes.map((n) => n.bbox[1]));
        const bx1 = Math.max(...notes.map((n) => n.bbox[0] + n.bbox[2]));
        const by1 = Math.max(...notes.map((n) => n.bbox[1] + n.bbox[3]));
        events.push({ type: 'note', x: cx, duration: { value: 'quarter', dots: 0, ticks: 960 }, bbox: [bx0, by0, bx1 - bx0, by1 - by0], notes });
      });
      x += cols.length * colW + S * 1.5;
      const last = mi === sys.length - 1;
      const mx1 = last ? x1 : x - S * 0.75;
      bar(last ? x1 : mx1, last ? 'end' : 'single');
      measures.push({ index: measureNo++, x0: mx0, x1: last ? x1 - S * 0.18 : mx1, events });
    });
    // Marks drawn between a number and the next one on its string.
    ctx.lineWidth = Math.max(1, S * 0.09);
    ctx.lineCap = 'round';
    placed.forEach((a, i) => {
      const mark = a.note.mark;
      if (!mark || a.note.markStyle !== '~') return;
      const b = placed.slice(i + 1).find((q) => q.string === a.string);
      const ax = a.box[0] + a.box[2];
      if (mark === 'b') {
        // Bend: a curve from the number up over the staff, with an arrow head and "full" above it.
        const tipY = top - S * 1.6;
        const tipX = ax + S * 1.3;
        ctx.beginPath();
        ctx.moveTo(ax + S * 0.2, a.y);
        ctx.quadraticCurveTo(tipX, a.y, tipX, tipY + S * 0.3);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - S * 0.28, tipY + S * 0.5);
        ctx.lineTo(tipX + S * 0.28, tipY + S * 0.5);
        ctx.closePath();
        ctx.fill();
        const t = inkBox('full', small, tipX, tipY - S * 0.55);
        ctx.font = small;
        ctx.fillText('full', t.x, t.y);
        return;
      }
      if (!b) return;
      const bx = b.box[0];
      if (mark === '/' || mark === '\\') {
        const rise = (mark === '/' ? -1 : 1) * S * 0.3;
        ctx.beginPath();
        ctx.moveTo(ax + S * 0.25, a.y - rise);
        ctx.lineTo(bx - S * 0.25, a.y + rise);
        ctx.stroke();
        return;
      }
      // Tie or slur: an arc over the two numbers.
      const yArc = a.y - digitH / 2 - S * 0.12;
      const xa = a.cx + S * 0.1;
      const xb = b.cx - S * 0.1;
      ctx.beginPath();
      ctx.moveTo(xa, yArc);
      ctx.quadraticCurveTo((xa + xb) / 2, yArc - S * 0.75, xb, yArc);
      ctx.stroke();
      if (mark === 't') {
        a.note.tieStart = true;
        b.note.tieStop = true;
      } else if (spec.letters !== false) {
        const t = inkBox(mark.toUpperCase(), small, (xa + xb) / 2, top - S * 0.9);
        ctx.font = small;
        ctx.fillText(mark.toUpperCase(), t.x, t.y);
      }
    });
    systems.push({
      index: si, connector: 'none', barThrough: false,
      staves: [{ kind: 'tab', lineCount: strings, lines, x0, x1, space: S, lineThickness: lineW, clef, time: null, barlines, stems: false, lineThrough: !!spec.lineThrough, measures }],
    });
  });
  return { width, height, systems, dataUrl: canvas.toDataURL('image/png') };
}

/** Rewrite the fixtures of the tab reader's own tests (marks, typewriter tab, held-out faces, bass tab). */
async function renderFixtures(args) {
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb'] });
  const manifest = [];
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
    await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
    await page.addStyleTag({ content: fontFaceCss() });
    for (const [id, opts] of FIXTURES) {
      const res = await page.evaluate(drawFixtureInPage, { ...opts, open: OPEN, openBass: OPEN_BASS });
      const src = PNG.sync.read(Buffer.from(res.dataUrl.split(',')[1], 'base64'));
      const grey = Buffer.alloc(src.width * src.height);
      for (let i = 0, j = 0; j < grey.length; i += 4, j++) grey[j] = Math.round(0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2]);
      const png = new PNG({ width: src.width, height: src.height, colorType: 0, inputColorType: 0, bitDepth: 8 });
      png.data = grey;
      const bytes = PNG.sync.write(png, { colorType: 0, inputColorType: 0, bitDepth: 8, deflateLevel: 9 });
      const dpi = Math.round((opts.px / 1.3 / 1.75) * 25.4);
      const round = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
      const truth = {
        id, image: `${id}.png`, width: res.width, height: res.height, subset: 'tab', title: null, dpi, scale: opts.px / 13, staffSpace: opts.px / 1.3,
        musicFont: 'none', textFont: 'none', tabFont: `${opts.weight} ${opts.font.replace(/"/g, '')}`, key: { name: 'C', fifths: 0 }, time: { num: 4, den: 4 }, pickup: false,
        systems: res.systems, texts: [],
      };
      const json = JSON.stringify(truth, (k, v) => round(v));
      const meta = {
        id, image: `${id}.png`, truth: `${id}.json`, subset: 'tab', name: id, dpi, size: 1, staffSpace: round(opts.px / 1.3), musicFont: 'none', tabFont: truth.tabFont,
        width: res.width, height: res.height, systems: res.systems.length, staves: res.systems.length, measures: res.systems.reduce((a, s) => a + s.staves[0].measures.length, 0), tags: opts.tags, bytes: bytes.length,
      };
      manifest.push(meta);
      if (only && !id.includes(only)) continue;
      fs.writeFileSync(path.join(FIXTURE_DIR, `${id}.png`), bytes);
      fs.writeFileSync(path.join(FIXTURE_DIR, `${id}.json`), json);
      console.log(`${id.padEnd(32)} ${res.width}x${res.height}  ${(bytes.length / 1024).toFixed(1)} KB`);
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(FIXTURE_DIR, 'manifest.json'), `${JSON.stringify({ fixtures: manifest }, null, 1)}\n`);
  console.log(`${manifest.length} fixtures -> ${path.relative(ROOT, FIXTURE_DIR)} (${(manifest.reduce((a, m) => a + m.bytes, 0) / 1024).toFixed(0)} KB of PNG)`);
}

module.exports = { FACES, CLASSES, HELD_OUT, fontFaceCss, renderFixtures };

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
