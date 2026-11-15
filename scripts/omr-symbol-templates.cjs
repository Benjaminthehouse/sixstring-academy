#!/usr/bin/env node
/**
 * Renders the glyph templates of the standard-notation recognizer (src/core/omr/notation/).
 *
 *   node scripts/omr-symbol-templates.cjs            # rewrite src/core/omr/notation/templates.data.ts
 *   node scripts/omr-symbol-templates.cjs --png dir  # also write one contact sheet per font (to look at)
 *   node scripts/omr-symbol-templates.cjs --extra    # render the recognizer's own test pages instead
 *                                                    # (src/core/omr/notation/fixtures/: two voices, C and cut
 *                                                    # time, tuplet brackets, grace notes, bass clef)
 *
 * Every glyph is drawn with VexFlow 4 (canvas backend) inside the pre-installed Playwright
 * Chromium in the music fonts Bravura, Gonville, Petaluma and Leland, at 20 px per staff space
 * (the resolution of a notation staff strip), thresholded to one bit per pixel and cropped to its
 * ink. The origin of the glyph (SMuFL convention: x = left edge, y = the staff position the glyph
 * is placed on) is stored relative to the crop so the recognizer can put a template exactly where
 * an engraver would put the symbol.
 *
 * Deterministic for the music glyphs: their outlines come from the fonts bundled with VexFlow. The
 * few text glyphs (TEXT_GLYPHS: italic tuplet numbers) come from installed system faces.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'src', 'core', 'omr', 'notation', 'templates.data.ts');

/** px per staff space of the templates. */
const SPACE = 20;
const FONTS = ['Bravura', 'Gonville', 'Petaluma', 'Leland'];
const GLYPHS = [
  'noteheadBlack', 'noteheadHalf', 'noteheadWhole',
  'accidentalSharp', 'accidentalFlat', 'accidentalNatural', 'accidentalDoubleSharp', 'accidentalDoubleFlat',
  'restWhole', 'restHalf', 'restQuarter', 'rest8th', 'rest16th', 'rest32nd',
  'flag8thUp', 'flag8thDown', 'flag16thUp', 'flag16thDown', 'flag32ndUp', 'flag32ndDown',
  'gClef', 'fClef', 'cClef',
  'timeSig0', 'timeSig1', 'timeSig2', 'timeSig3', 'timeSig4', 'timeSig5', 'timeSig6', 'timeSig7', 'timeSig8', 'timeSig9',
  'timeSigCommon', 'timeSigCutCommon',
  'augmentationDot',
];

/**
 * Tuplet numbers that engravers set in a TEXT face (Finale, Sibelius, Guitar Pro, alphaTab: an
 * italic serif "3") rather than with the music font's digits. Rendered from the installed faces.
 * DejaVu Serif is left out on purpose: it is what the held-out alphaTab test pages
 * (notation/tools/alphatab-pages.cjs) fall back to, and they must stay unseen.
 */
const TEXT_GLYPHS = [
  { font: 'Liberation Serif Bold Italic', css: 'italic bold 40px "Liberation Serif"', glyph: 'tuplet3', text: '3' },
  { font: 'Liberation Serif Italic', css: 'italic 40px "Liberation Serif"', glyph: 'tuplet3', text: '3' },
  { font: 'FreeSerif Bold Italic', css: 'italic bold 40px "FreeSerif"', glyph: 'tuplet3', text: '3' },
  { font: 'Charter Bold Italic', css: 'italic bold 40px "Bitstream Charter"', glyph: 'tuplet3', text: '3' },
  { font: 'Caladea Bold Italic', css: 'italic bold 40px "Caladea"', glyph: 'tuplet3', text: '3' },
  { font: 'Liberation Sans Bold Italic', css: 'italic bold 40px "Liberation Sans"', glyph: 'tuplet3', text: '3' },
];

/* global Vex, document */
/** Runs in the page: text glyphs drawn with canvas text, cropped like the music-font glyphs. */
async function renderTextInPage({ items }) {
  const W = 200;
  const H = 200;
  const OX = 60;
  const OY = 140;
  const out = [];
  for (const it of items) await document.fonts.load(it.css, it.text);
  for (const it of items) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.font = it.css;
    ctx.fillStyle = '#000';
    ctx.fillText(it.text, OX, OY);
    const img = ctx.getImageData(0, 0, W, H).data;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (img[(y * W + x) * 4 + 3] >= 128) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) continue;
    const bits = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) bits.push(img[(y * W + x) * 4 + 3] >= 128 ? 1 : 0);
    out.push({ font: it.font, glyph: it.glyph, w: x1 - x0 + 1, h: y1 - y0 + 1, ox: OX - x0, oy: OY - y0, bits });
  }
  return out;
}

function renderInPage({ fonts, glyphs, space }) {
  const VF = Vex.Flow;
  const point = (VF.Tables ? VF.Tables.NOTATION_FONT_SCALE : 39) * (space / 10);
  const W = 520;
  const H = 520;
  const OX = 200;
  const OY = 260;
  const out = [];
  for (const font of fonts) {
    VF.setMusicFont(font, 'Bravura', 'Custom');
    for (const code of glyphs) {
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const renderer = new VF.Renderer(canvas, VF.Renderer.Backends.CANVAS);
      const ctx = renderer.getContext();
      VF.Glyph.renderGlyph(ctx, OX, OY, point, code);
      const img = canvas.getContext('2d').getImageData(0, 0, W, H).data;
      let x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (img[(y * W + x) * 4 + 3] >= 128) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      if (x1 < 0) continue;
      const w = x1 - x0 + 1;
      const h = y1 - y0 + 1;
      const bits = [];
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) bits.push(img[(y * W + x) * 4 + 3] >= 128 ? 1 : 0);
      out.push({ font, glyph: code, w, h, ox: OX - x0, oy: OY - y0, bits });
    }
  }
  return out;
}

function pack(bits) {
  const bytes = Buffer.alloc(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) if (bits[i]) bytes[i >> 3] |= 0x80 >> (i & 7);
  return bytes.toString('base64');
}

// ------------------------------------------------------------------------------------------
// Extra test pages of the notation recognizer (what the shared corpus does not cover)
// ------------------------------------------------------------------------------------------

/**
 * Score notation, per voice and measure: `C4,E4:q.` chord, `r:8` rest (`r^` / `r_` placed high /
 * low for a voice), `3( ... )` triplet, `g(D5,E5)` grace notes before the next note.
 * Traditional material and exercises written for this corpus.
 */
const EXTRA = [
  { id: 'voices-44-bravura', font: 'Bravura', time: '4/4', key: 'C',
    measures: [
      { v1: 'E5:q D5:q C5:q D5:q', v2: 'C4:h G3:h' },
      { v1: 'E5:8 F5:8 G5:q E5:h', v2: 'C4:w' },
      { v1: 'D5:q. E5:8 F5:q D5:q', v2: 'G3:h B3:h' },
      { v1: 'C5:w', v2: 'C4:h E3:h' },
    ] },
  { id: 'voices-34-gonville', font: 'Gonville', time: '3/4', key: 'Am',
    measures: [
      { v1: 'A4:q C5:q E5:q', v2: 'A3:h.' },
      { v1: 'B4:8 C5:8 D5:q B4:q', v2: 'E3:h.' },
      { v1: 'r^:q E5:q E5:q', v2: 'A3:h r_:q' },
      { v1: 'C5:h B4:q', v2: 'E3:q E4:q G#3:q' },
    ] },
  { id: 'voices-44-leland', font: 'Leland', time: '4/4', key: 'G',
    measures: [
      { v1: 'B4:q B4:8 C5:8 D5:h', v2: 'G3:h D4:h' },
      { v1: 'D5:8 C5:8 B4:8 A4:8 G4:h', v2: 'G3:q B3:q D4:h' },
      { v1: 'A4:h F#4:h', v2: 'D4:q C4:q D3:h' },
    ] },
  { id: 'common-time-bravura', font: 'Bravura', time: 'C', key: 'F',
    measures: [{ v1: 'F4:q A4:q C5:q A4:q' }, { v1: 'Bb4:h A4:h' }, { v1: 'G4:q. A4:8 Bb4:q G4:q' }, { v1: 'F4:w' }] },
  { id: 'cut-time-leland', font: 'Leland', time: 'C|', key: 'D',
    measures: [{ v1: 'D4:h F#4:h' }, { v1: 'A4:q B4:q A4:h' }, { v1: 'G4:h E4:h' }, { v1: 'D4:w' }] },
  { id: 'cut-time-gonville', font: 'Gonville', time: 'C|', key: 'C',
    measures: [{ v1: 'C5:h G4:h' }, { v1: 'E4:q F4:q G4:h' }, { v1: 'C4:w' }] },
  { id: 'tuplets-bravura', font: 'Bravura', time: '2/4', key: 'C',
    measures: [
      { v1: '3( C5:q D5:q E5:q )' },
      { v1: '3( E5:8 D5:8 C5:8 ) G4:q' },
      { v1: 'G4:q 3( A4:8 B4:8 C5:8 )' },
      { v1: '3( E4:8 F4:8 G4:8 ) 3( A4:8 G4:8 F4:8 )' },
      { v1: 'C4:h' },
    ] },
  { id: 'tuplets-petaluma', font: 'Petaluma', time: '2/4', key: 'G',
    measures: [{ v1: '3( G4:8 A4:8 B4:8 ) D5:q' }, { v1: '3( D5:q C5:q B4:q )' }, { v1: 'G4:h' }] },
  { id: 'grace-bravura', font: 'Bravura', time: '4/4', key: 'C',
    measures: [{ v1: 'g(D5) C5:q E5:q g(F5,G5) E5:h' }, { v1: 'G4:q g(A4) G4:q C5:h' }, { v1: 'C4:w' }] },
  { id: 'bass-clef-bravura', font: 'Bravura', time: '4/4', key: 'F', clef: 'bass',
    measures: [{ v1: 'F2:q A2:q C3:q F3:q' }, { v1: 'Bb2:h C3:h' }, { v1: 'F2:w' }] },
];

const STEP_SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const DUR_NAME = { w: 'whole', h: 'half', q: 'quarter', 8: 'eighth', 16: '16th', 32: '32nd' };
const DUR_TICKS = { w: 3840, h: 1920, q: 960, 8: 480, 16: 240, 32: 120 };

function parseVoice(src) {
  const out = [];
  let tuplet = null;
  let tid = 0;
  let grace = null;
  for (const tok of src.trim().split(/\s+/)) {
    if (tok === '3(') { tuplet = ++tid; continue; }
    if (tok === ')') { tuplet = null; continue; }
    const g = /^g\((.+)\)$/.exec(tok);
    if (g) { grace = g[1].split(','); continue; }
    const m = /^(.+):(w|h|q|8|16|32)(\.*)$/.exec(tok);
    if (!m) throw new Error(`bad token ${tok}`);
    const ev = { dur: m[2], dots: m[3].length, rest: /^r[\^_]?$/.test(m[1]), place: m[1] === 'r^' ? 'high' : m[1] === 'r_' ? 'low' : null, keys: [], midi: [], tuplet, grace };
    grace = null;
    if (!ev.rest) {
      for (const p of m[1].split(',')) {
        const q = /^([A-G])(#|b)?(-?\d)$/.exec(p);
        ev.keys.push(`${q[1].toLowerCase()}${q[2] || ''}/${q[3]}`);
        ev.midi.push(STEP_SEMI[q[1]] + (q[2] === '#' ? 1 : q[2] === 'b' ? -1 : 0) + (Number(q[3]) + 1) * 12);
      }
    }
    let t = DUR_TICKS[ev.dur];
    if (ev.dots === 1) t *= 1.5; else if (ev.dots === 2) t *= 1.75;
    if (tuplet) t = (t * 2) / 3;
    ev.ticks = Math.round(t);
    out.push(ev);
  }
  return out;
}

/* global Vex, document */
function renderExtraInPage(spec) {
  const VF = Vex.Flow;
  VF.setMusicFont(spec.font, 'Bravura', 'Custom');
  const S = spec.scale;
  const host = document.getElementById('out');
  host.innerHTML = '';
  const renderer = new VF.Renderer(host, VF.Renderer.Backends.SVG);
  const widths = spec.measures.map((m, i) => 60 + 34 * Math.max(m.v1.length, m.v2 ? m.v2.length : 0) + (i === 0 ? 90 : 0));
  const total = widths.reduce((a, b) => a + b, 0);
  const W = total + 60;
  const H = 230;
  renderer.resize(W, H);
  const ctx = renderer.getContext();
  const svg = host.querySelector('svg');
  let x = 30;
  const timeSpec = spec.time;
  const [num, den] = timeSpec === 'C' ? [4, 4] : timeSpec === 'C|' ? [2, 2] : timeSpec.split('/').map(Number);
  spec.measures.forEach((m, i) => {
    const stave = new VF.Stave(x, 60, widths[i], { fill_style: '#000000' });
    if (i === 0) {
      stave.addClef(spec.clef || 'treble');
      if (spec.key !== 'C' && spec.key !== 'Am') stave.addKeySignature(spec.key);
      stave.addTimeSignature(timeSpec);
    }
    if (i === spec.measures.length - 1) stave.setEndBarType(VF.Barline.type.END);
    stave.setContext(ctx).draw();
    const voices = [];
    const beams = [];
    const tuplets = [];
    const two = !!m.v2;
    for (const [vi, evs] of [[0, m.v1], [1, m.v2]]) {
      if (!evs) continue;
      const dir = two ? (vi === 0 ? 1 : -1) : 0;
      const notes = evs.map((ev) => {
        const restKey = ev.place === 'high' ? 'f/5' : ev.place === 'low' ? 'e/4' : ev.dur === 'w' ? 'd/5' : 'b/4';
        const struct = ev.rest
          ? { keys: [restKey], duration: `${ev.dur}r`, dots: ev.dots, clef: spec.clef || 'treble' }
          : { keys: ev.keys, duration: ev.dur, dots: ev.dots, clef: spec.clef || 'treble', ...(dir ? { stem_direction: dir } : { auto_stem: true }) };
        const sn = new VF.StaveNote(struct);
        for (let d = 0; d < ev.dots; d++) VF.Dot.buildAndAttach([sn], { all: true });
        if (ev.grace) {
          const gs = ev.grace.map((p) => {
            const q = /^([A-G])(#|b)?(-?\d)$/.exec(p);
            return new VF.GraceNote({ keys: [`${q[1].toLowerCase()}${q[2] || ''}/${q[3]}`], duration: '8', slash: ev.grace.length === 1 });
          });
          sn.addModifier(new VF.GraceNoteGroup(gs, true).beamNotes(), 0);
        }
        return sn;
      });
      const groups = new Map();
      evs.forEach((ev, k) => {
        if (!ev.tuplet) return;
        if (!groups.has(ev.tuplet)) groups.set(ev.tuplet, []);
        groups.get(ev.tuplet).push(notes[k]);
      });
      for (const g of groups.values()) tuplets.push(new VF.Tuplet(g, { num_notes: 3, notes_occupied: 2, location: dir === -1 ? -1 : 1 }));
      const voice = new VF.Voice({ num_beats: num, beat_value: den }).setMode(VF.Voice.Mode.SOFT).addTickables(notes);
      VF.Accidental.applyAccidentals([voice], spec.key);
      beams.push(...VF.Beam.generateBeams(notes, dir ? { stem_direction: dir } : {}));
      voices.push(voice);
    }
    new VF.Formatter().joinVoices(voices).format(voices, stave.getNoteEndX() - stave.getNoteStartX() - 16);
    for (const v of voices) v.draw(ctx, stave);
    beams.forEach((b) => b.setContext(ctx).draw());
    tuplets.forEach((t) => t.setContext(ctx).draw());
    x += widths[i];
  });
  const PW = Math.round(W * S);
  const PH = Math.round(H * S);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', String(PW));
  svg.setAttribute('height', String(PH));
  svg.style.width = `${PW}px`;
  svg.style.height = `${PH}px`;
  svg.style.display = 'block';
  svg.style.background = '#fff';
  return { width: PW, height: PH };
}

async function renderExtra() {
  const outDir = path.join(ROOT, 'src', 'core', 'omr', 'notation', 'fixtures');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 600 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error(`page error: ${e.message}`));
  await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#fff"><div id="out"></div></body></html>');
  await page.addScriptTag({ path: path.join(ROOT, 'node_modules', 'vexflow', 'build', 'cjs', 'vexflow.js') });
  const index = [];
  for (const sc of EXTRA) {
    const measures = sc.measures.map((m) => ({ v1: parseVoice(m.v1), v2: m.v2 ? parseVoice(m.v2) : null }));
    const scale = (1.75 / 25.4) * 150 * 0.1; // 150 dpi, 7 mm staff
    const res = await page.evaluate(renderExtraInPage, { ...sc, measures, scale });
    await page.setViewportSize({ width: res.width, height: res.height });
    const shot = PNG.sync.read(await page.screenshot({ clip: { x: 0, y: 0, width: res.width, height: res.height } }));
    const grey = Buffer.alloc(shot.width * shot.height);
    for (let i = 0, j = 0; j < grey.length; i += 4, j++) grey[j] = Math.round(0.299 * shot.data[i] + 0.587 * shot.data[i + 1] + 0.114 * shot.data[i + 2]);
    const png = new PNG({ width: shot.width, height: shot.height, colorType: 0, inputColorType: 0, bitDepth: 8 });
    png.data = grey;
    fs.writeFileSync(path.join(outDir, `${sc.id}.png`), PNG.sync.write(png, { colorType: 0, inputColorType: 0, bitDepth: 8, deflateLevel: 9 }));
    const shift = sc.clef === 'bass' ? 0 : -12;
    const [num, den] = sc.time === 'C' ? [4, 4] : sc.time === 'C|' ? [2, 2] : sc.time.split('/').map(Number);
    const fifths = { C: 0, Am: 0, G: 1, D: 2, F: -1 }[sc.key];
    index.push({
      id: sc.id, image: `${sc.id}.png`, font: sc.font, clef: sc.clef || 'treble', fifths,
      time: { beats: num, beatValue: den, symbol: sc.time === 'C' ? 'common' : sc.time === 'C|' ? 'cut' : null },
      measures: measures.map((m) => [m.v1, m.v2].filter(Boolean).map((evs) => evs.map((ev) => ({
        rest: ev.rest, midi: ev.midi.map((v) => v + shift).sort((a, b) => a - b), value: DUR_NAME[ev.dur], dots: ev.dots, triplet: !!ev.tuplet, grace: ev.grace ? ev.grace.length : 0,
      })))),
    });
    console.log(`${sc.id.padEnd(24)} ${shot.width}x${shot.height}`);
  }
  await browser.close();
  fs.writeFileSync(path.join(outDir, 'index.json'), `${JSON.stringify({ generator: 'scripts/omr-symbol-templates.cjs --extra', pages: index })}\n`);
  console.log(`${index.length} extra pages -> ${path.relative(ROOT, outDir)}`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--extra')) {
    await renderExtra();
    return;
  }
  const pngDir = args.includes('--png') ? path.resolve(args[args.indexOf('--png') + 1]) : null;
  const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error(`page error: ${e.message}`));
  await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
  await page.addScriptTag({ path: path.join(ROOT, 'node_modules', 'vexflow', 'build', 'cjs', 'vexflow.js') });
  const list = await page.evaluate(renderInPage, { fonts: FONTS, glyphs: GLYPHS, space: SPACE });
  list.push(...(await page.evaluate(renderTextInPage, { items: TEXT_GLYPHS })));
  await browser.close();

  const lines = [];
  lines.push('/**');
  lines.push(' * Glyph templates of the standard-notation recognizer. GENERATED by scripts/omr-symbol-templates.cjs');
  lines.push(' * (VexFlow 4 fonts Bravura, Gonville, Petaluma, Leland; tuplet numbers also in text faces); do not edit by hand.');
  lines.push(' *');
  lines.push(' * One bit per pixel, row-major, most significant bit first, base64. `ox` / `oy` is the glyph origin');
  lines.push(' * (SMuFL: left edge, staff position the glyph sits on) relative to the top-left corner of the bitmap.');
  lines.push(' */');
  lines.push('');
  lines.push('/** px per staff space the templates were rendered at. */');
  lines.push(`export const TEMPLATE_SPACE = ${SPACE};`);
  lines.push('');
  lines.push('/** One packed template: [font, glyph, width, height, originX, originY, bits]. */');
  lines.push('export type PackedTemplate = readonly [string, string, number, number, number, number, string];');
  lines.push('');
  lines.push('/** Every template, grouped by font. */');
  lines.push('export const PACKED_TEMPLATES: readonly PackedTemplate[] = [');
  let bytes = 0;
  for (const t of list) {
    const b64 = pack(t.bits);
    bytes += b64.length;
    lines.push(`  ['${t.font}', '${t.glyph}', ${t.w}, ${t.h}, ${t.ox}, ${t.oy}, '${b64}'],`);
  }
  lines.push('];');
  lines.push('');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, lines.join('\n'));
  console.log(`${list.length} templates (${FONTS.length} fonts x ${GLYPHS.length} glyphs + ${TEXT_GLYPHS.length} text glyphs), ${(bytes / 1024).toFixed(1)} kB of base64 -> ${path.relative(ROOT, OUT)}`);

  if (pngDir) {
    fs.mkdirSync(pngDir, { recursive: true });
    for (const font of FONTS) {
      const mine = list.filter((t) => t.font === font);
      const cellW = 80;
      const cellH = 160;
      const cols = 12;
      const rows = Math.ceil(mine.length / cols);
      const png = new PNG({ width: cols * cellW, height: rows * cellH });
      png.data.fill(255);
      mine.forEach((t, k) => {
        const cx = (k % cols) * cellW + 20;
        const cy = Math.floor(k / cols) * cellH + 80;
        // Origin cross-hair (red) and ink (black).
        for (let d = -30; d <= 60; d++) {
          const i = ((cy) * png.width + cx + d) * 4;
          if (cx + d >= 0 && cx + d < png.width) { png.data[i] = 255; png.data[i + 1] = 160; png.data[i + 2] = 160; }
        }
        for (let y = 0; y < t.h; y++) {
          for (let x = 0; x < t.w; x++) {
            if (!t.bits[y * t.w + x]) continue;
            const px = cx - t.ox + x;
            const py = cy - t.oy + y;
            if (px < 0 || py < 0 || px >= png.width || py >= png.height) continue;
            const i = (py * png.width + px) * 4;
            png.data[i] = png.data[i + 1] = png.data[i + 2] = 0;
          }
        }
      });
      const file = path.join(pngDir, `templates-${font.toLowerCase()}.png`);
      fs.writeFileSync(file, PNG.sync.write(png));
      console.log(`  ${file}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
