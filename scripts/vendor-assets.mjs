#!/usr/bin/env node
/**
 * Puts every runtime asset the app needs under public/vendor/ so nothing is fetched from a CDN
 * while the app runs (it must work offline and inside hosts that block third-party requests).
 *
 *   - copied from node_modules: Tesseract OCR worker + WASM cores, MediaPipe vision WASM,
 *     pdf.js character maps / standard fonts / image decoders
 *   - downloaded once (skipped when already present): English OCR data, hand-landmark model
 *
 * public/vendor/ is git-ignored; `npm run dev` and `npm run build` run this first. A failed
 * download is not fatal: the feature that needs the file reports that it is unavailable.
 */
import { cp, mkdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nm = (...p) => path.join(root, 'node_modules', ...p);
const out = (...p) => path.join(root, 'public', 'vendor', ...p);

async function copy(from, to) {
  if (!existsSync(from)) {
    console.warn(`  missing ${path.relative(root, from)} (skipped)`);
    return;
  }
  await mkdir(path.dirname(to), { recursive: true });
  await cp(from, to, { recursive: true, force: true });
}

async function download(url, to, minBytes) {
  if (existsSync(to) && (await stat(to)).size >= minBytes) return;
  await mkdir(path.dirname(to), { recursive: true });
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < minBytes) throw new Error(`only ${buf.length} bytes`);
    await writeFile(to, buf);
    console.log(`  downloaded ${path.relative(root, to)} (${(buf.length / 1e6).toFixed(1)} MB)`);
  } catch (err) {
    console.warn(`  could not download ${url}: ${err.message}`);
  }
}

console.log('vendor-assets: preparing public/vendor');

// Tesseract.js OCR: worker + LSTM cores (the .wasm.js files embed the WASM, one file per CPU feature level).
await copy(nm('tesseract.js', 'dist', 'worker.min.js'), out('tesseract', 'worker.min.js'));
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) {
  await copy(nm('tesseract.js-core', f), out('tesseract', 'core', f));
}
await download(
  'https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0_fast/eng.traineddata.gz',
  out('tesseract', 'lang', 'eng.traineddata.gz'),
  500_000,
);

// MediaPipe hand tracking (optional finger feedback in the live fretboard camera).
for (const f of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']) {
  await copy(nm('@mediapipe', 'tasks-vision', 'wasm', f), out('mediapipe', 'wasm', f));
}
await download(
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  out('mediapipe', 'hand_landmarker.task'),
  1_000_000,
);

// pdf.js extras for PDFs with CJK text, non-embedded fonts or JPEG2000/JBIG2 images.
for (const d of ['cmaps', 'standard_fonts', 'wasm']) {
  await copy(nm('pdfjs-dist', d), out('pdfjs', d));
}

console.log('vendor-assets: done');
