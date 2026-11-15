#!/usr/bin/env node
// Crop (and enlarge) a region of a PNG: node crop.cjs in.png out.png x y w h [scale]
const fs = require('node:fs');
const { PNG } = require('pngjs');
const [inp, out, x, y, w, h, scale] = process.argv.slice(2);
const src = PNG.sync.read(fs.readFileSync(inp));
const k = Number(scale || 3);
const X = Math.max(0, Number(x)), Y = Math.max(0, Number(y));
const W = Math.min(src.width - X, Number(w)), H = Math.min(src.height - Y, Number(h));
const dst = new PNG({ width: W * k, height: H * k });
for (let j = 0; j < H * k; j++) for (let i = 0; i < W * k; i++) {
  const s = ((Y + Math.floor(j / k)) * src.width + X + Math.floor(i / k)) * 4;
  const d = (j * dst.width + i) * 4;
  dst.data[d] = src.data[s]; dst.data[d + 1] = src.data[s + 1]; dst.data[d + 2] = src.data[s + 2]; dst.data[d + 3] = 255;
}
fs.writeFileSync(out, PNG.sync.write(dst));
console.log(`${out} ${dst.width}x${dst.height}`);
