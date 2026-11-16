#!/usr/bin/env node
/**
 * Draws the app icons into public/icons/: the first frets of a guitar neck in the fretboard's own
 * materials, six strings thickest on the left as in the brand mark (src/app/brand/Brand.tsx), and
 * one note to play, on a sunburst-amber tile. Every colour is a token of src/ui/tokens.css. Run it
 * again after changing the drawing or the tokens:
 *
 *   node scripts/make-icons.cjs
 *
 * Writes
 *   icon.svg               any size, rounded tile (also the favicon)
 *   icon-192.png, icon-512.png       the same as PNG (install prompts, launchers)
 *   maskable-512.png       full-bleed square with the mark inside the 80 % safe circle (Android masks it)
 *   apple-touch-icon.png   180 x 180 full-bleed square (iOS rounds the corners itself)
 * PNGs are rendered with the pre-installed Chromium, so they match the SVG exactly.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'icons');

function token(name, theme) {
  const css = fs.readFileSync(path.join(ROOT, 'src/ui/tokens.css'), 'utf8');
  const block = theme === 'light' ? /^:root\s*\{([\s\S]*?)^\}/m.exec(css) : /^:root\[data-theme='dark'\]\s*\{([\s\S]*?)^\}/m.exec(css);
  const value = block && new RegExp(`\\s${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`).exec(block[1]);
  if (!value) throw new Error(`tokens.css has no ${name} in its ${theme} block`);
  return value[1].toLowerCase();
}

const C = {
  glow: token('--accent-strong', 'dark'), // the light amber at the heart of the sunburst
  amber: token('--accent', 'light'),
  edge: token('--accent-strong', 'light'),
  wood: token('--fb-wood', 'light'),
  wood2: token('--fb-wood-2', 'light'),
  nut: token('--fb-nut', 'light'),
  fret: token('--fb-fret', 'light'),
  fretShade: token('--fb-fret-shade', 'light'),
  inlay: token('--fb-inlay', 'light'),
  plain: token('--fb-string', 'light'),
  wound: token('--fb-string-wound', 'light'),
  root: token('--deg-1', 'light'),
  rootFg: token('--deg-1-fg', 'light'),
  shadow: token('--fg', 'light'), // the ink of the light theme, for soft shadows
};

/**
 * The picture, in a 512 box: the first frets of a rosewood neck seen from the player's side (bone
 * nut at the top, nickel frets, a pearl dot), six strings thickest on the left as in the brand
 * mark, and one note to play, on the sunburst amber of the app's accent.
 */
function neck(bottom) {
  const left = 150;
  const right = 362;
  const top = 70;
  const strings = [];
  const gauges = [10, 8.4, 7, 5.4, 4.4, 3.6]; // string 6 (left) .. string 1
  for (let i = 0; i < 6; i++) {
    const x = left + 24 + (i * (right - left - 48)) / 5;
    const w = gauges[i];
    strings.push(`<rect x="${(x - w / 2).toFixed(2)}" y="${top}" width="${w}" height="${bottom - top}" rx="${w / 2}" fill="${i < 3 ? C.wound : C.plain}"/>`);
  }
  const fret = (y) => `<rect x="${left}" y="${y}" width="${right - left}" height="12" fill="${C.fret}"/><rect x="${left}" y="${y + 12}" width="${right - left}" height="5" fill="${C.fretShade}" fill-opacity="0.85"/>`;
  const noteX = left + 24 + (3 * (right - left - 48)) / 5; // string 3
  return [
    `<rect x="${left - 6}" y="${top + 10}" width="${right - left + 12}" height="${bottom - top}" rx="10" fill="${C.shadow}" fill-opacity="0.2"/>`,
    `<rect x="${left}" y="${top}" width="${right - left}" height="${bottom - top}" fill="url(#wood)"/>`,
    `<rect x="${left}" y="${top}" width="${right - left}" height="26" rx="3" fill="${C.nut}"/>`,
    fret(212),
    fret(352),
    `<circle cx="256" cy="430" r="15" fill="${C.inlay}" fill-opacity="0.9"/>`,
    strings.join(''),
    `<circle cx="${noteX}" cy="146" r="33" fill="${C.shadow}" fill-opacity="0.24"/>`,
    `<circle cx="${noteX}" cy="142" r="31" fill="${C.root}" stroke="${C.rootFg}" stroke-width="5"/>`,
  ].join('');
}

/**
 * One icon. `rounded`: a tile with transparent corners (the "any" icon); otherwise full bleed.
 * `scale`: how large the neck sits on the tile (maskable icons keep it inside the 80 % safe circle).
 */
function svg({ rounded, scale }) {
  const size = 512;
  const offset = (size - size * scale) / 2;
  const tile = rounded ? `<rect width="${size}" height="${size}" rx="112"/>` : `<rect width="${size}" height="${size}"/>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    '<defs>',
    `<radialGradient id="sunburst" cx="50%" cy="40%" r="72%">`,
    `<stop offset="0" stop-color="${C.glow}"/><stop offset="0.55" stop-color="${C.amber}"/><stop offset="1" stop-color="${C.edge}"/>`,
    '</radialGradient>',
    `<linearGradient id="wood" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="${C.wood2}"/><stop offset="0.5" stop-color="${C.wood}"/><stop offset="1" stop-color="${C.wood2}"/></linearGradient>`,
    `<clipPath id="tile">${tile}</clipPath>`,
    '</defs>',
    `<g clip-path="url(#tile)">`,
    `<rect width="${size}" height="${size}" fill="url(#sunburst)"/>`,
    `<g transform="translate(${offset.toFixed(2)} ${offset.toFixed(2)}) scale(${scale})">${neck((size - offset) / scale + 40)}</g>`,
    '</g>',
    '</svg>',
  ].join('');
}

async function render(page, source, px) {
  await page.setViewportSize({ width: px, height: px });
  const sized = source.replace('width="512" height="512"', `width="${px}" height="${px}"`);
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${sized}</body></html>`);
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: px, height: px } });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const any = svg({ rounded: true, scale: 1 });
  const maskable = svg({ rounded: false, scale: 0.8 });
  const apple = svg({ rounded: false, scale: 0.92 });
  fs.writeFileSync(path.join(OUT, 'icon.svg'), `${any}\n`);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    const outputs = [
      ['icon-192.png', any, 192],
      ['icon-512.png', any, 512],
      ['maskable-512.png', maskable, 512],
      ['apple-touch-icon.png', apple, 180],
    ];
    for (const [name, source, px] of outputs) {
      const png = await render(page, source, px);
      const decoded = PNG.sync.read(png);
      if (decoded.width !== px || decoded.height !== px) throw new Error(`${name}: ${decoded.width}x${decoded.height}, expected ${px}`);
      fs.writeFileSync(path.join(OUT, name), png);
      console.log(`  ${name} ${px}x${px} ${(png.length / 1024).toFixed(1)} kB`);
    }
  } finally {
    await browser.close();
  }
  console.log(`icons written to ${path.relative(ROOT, OUT)}/`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
