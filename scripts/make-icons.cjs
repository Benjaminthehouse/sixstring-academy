#!/usr/bin/env node
/**
 * Draws the app icons into public/icons/ from the brand mark (six strings, thickest on the left,
 * crossing a fret: src/app/brand/Brand.tsx) on a sunburst-amber tile, in the token colours of
 * src/ui/tokens.css. Run it again after changing the mark or the accent:
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
  ink: token('--accent-fg', 'light'),
};

/**
 * The mark in its own 32-unit box (Brand.tsx): a fret across the top and six strings whose gauge
 * grows from the first string (right) to the sixth (left).
 */
function mark() {
  const gauges = [1.1, 1.4, 1.7, 2.1, 2.5, 2.9];
  const strings = gauges
    .map((w, i) => `<rect x="${(25.2 - i * 3.9 - w / 2).toFixed(3)}" y="5.5" width="${w}" height="21" rx="${w / 2}" fill="${C.ink}"/>`)
    .join('');
  return `<rect x="5" y="10.25" width="22" height="1.5" rx="0.75" fill="${C.ink}" fill-opacity="0.38"/>${strings}`;
}

/**
 * One icon. `rounded`: a tile with transparent corners (the "any" icon); otherwise full bleed.
 * `scale`: how large the mark sits on the tile (1 = as in the app; maskable icons need it inside
 * the 80 % safe circle). The strings are centred on the tile.
 */
function svg({ rounded, scale }) {
  const size = 512;
  const unit = size / 32;
  // The strings span x 4.25..25.75 (centre 15), y 5.5..26.5 (centre 16): centre them on the tile.
  const tx = 16 - 15 * scale;
  const ty = 16 - 16 * scale;
  const tile = rounded ? `<rect width="${size}" height="${size}" rx="${8 * unit}" fill="url(#sunburst)"/>` : `<rect width="${size}" height="${size}" fill="url(#sunburst)"/>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    '<defs>',
    `<radialGradient id="sunburst" cx="50%" cy="42%" r="70%">`,
    `<stop offset="0" stop-color="${C.glow}"/><stop offset="0.55" stop-color="${C.amber}"/><stop offset="1" stop-color="${C.edge}"/>`,
    '</radialGradient>',
    '</defs>',
    tile,
    `<g transform="scale(${unit}) translate(${tx.toFixed(4)} ${ty.toFixed(4)}) scale(${scale})">${mark()}</g>`,
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
  const any = svg({ rounded: true, scale: 1.08 });
  const maskable = svg({ rounded: false, scale: 0.78 });
  const apple = svg({ rounded: false, scale: 0.9 });
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
