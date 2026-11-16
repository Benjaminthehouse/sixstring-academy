#!/usr/bin/env node
/**
 * Turns the artifact build (`vite build --mode artifact` -> dist-artifact/) into what the Claude
 * artifact host publishes. `npm run build:artifact` runs both steps.
 *
 *   node scripts/make-artifact.mjs [dir] [--list]   (default dir: dist-artifact; --list prints every file)
 *
 * Writes into the build folder:
 *   page.html     the page itself: the title, the entry stylesheet and script (and the entry's
 *                 module preloads) with relative assets/ paths, and <div id="root"></div>. The host
 *                 wraps it in the document skeleton (doctype, charset, viewport).
 *   files.json    every other file to publish beside it: { "assets/x.js": { from, contentType } },
 *                 `from` relative to the build folder (publish with root = that folder). When the
 *                 files do not fit one publish (255 files, 64 MB), files-1.json, files-2.json ...
 *                 instead, published one after the other to the same artifact.
 * and changes, in place:
 *   every raw ESC byte (0x1b) in a text asset becomes the four characters \x1b (the host refuses
 *   control characters in text files; the pdf.js worker has three, all inside string literals,
 *   where the escape means the same byte).
 * Left out: vendor/tesseract and vendor/mediapipe (the camera is unavailable in the artifact host
 * and sheet reading uses the AI service there); vendor/pdfjs/cmaps (about 170 files, only for PDFs
 * whose text needs Adobe character maps, i.e. CJK: without it the app is over the host's 511 files
 * per version); pdf.js's .pfb fonts (a type the host does not serve); source maps, index.html (page.html replaces it), the launcher icons, and anything
 * of the standalone app's service worker.
 * Prints the files, their total size, and fails when something is over the host's limits.
 */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARGS = process.argv.slice(2);
const DIR = path.resolve(ROOT, ARGS.find((a) => !a.startsWith('--')) ?? 'dist-artifact');
const TITLE = 'Sixstring Academy';

/** The host's limits (Artifact tool): per publish, per version, per file. */
const LIMITS = { filesPerPublish: 255, bytesPerPublish: 64 * 1024 * 1024, filesPerVersion: 511, bytesPerVersion: 256 * 1024 * 1024, textFile: 16 * 1024 * 1024, binaryFile: 15 * 1024 * 1024 };

/** Content type by extension. `.mjs` is JavaScript like `.js`. */
export const CONTENT_TYPES = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream',
  '.task': 'application/octet-stream',
  '.gz': 'application/gzip',
};
const TEXT = new Set(['.js', '.mjs', '.css', '.html', '.json', '.txt', '.svg']);

/** Content type of a published path (licence files have no extension: plain text). */
export function contentTypeOf(rel) {
  const ext = path.extname(rel).toLowerCase();
  if (!ext && /^LICEN[CS]E/i.test(path.basename(rel))) return 'text/plain';
  return CONTENT_TYPES[ext] ?? null;
}

/** Paths left out of the artifact, relative to the build folder. */
export function leftOut(rel) {
  return (
    rel === 'index.html' ||
    rel === 'page.html' ||
    /^files(-\d+)?\.json$/.test(rel) ||
    rel.startsWith('vendor/tesseract/') ||
    rel.startsWith('vendor/mediapipe/') ||
    rel.startsWith('vendor/pdfjs/cmaps/') ||
    // The host does not serve Type 1 fonts (.pfb); pdf.js falls back to the Liberation .ttf fonts.
    rel.endsWith('.pfb') ||
    rel.startsWith('icons/') ||
    rel.startsWith('.vite/') ||
    rel.endsWith('.map') ||
    rel === 'sw.js' ||
    rel === 'manifest.webmanifest'
  );
}

/** Replace raw ESC bytes with the text `\x1b`. Returns the new text and how many were replaced. */
export function escapeEsc(text) {
  let count = 0;
  const out = text.replace(/\x1b/g, () => {
    count += 1;
    return '\\x1b';
  });
  return { text: out, count };
}

/** page.html from the build's index.html: title, entry styles, preloads and script, the root. */
export function pageFrom(indexHtml, title = TITLE) {
  const rel = (href) => href.replace(/^\.\//, '');
  const styles = [...indexHtml.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)].map((m) => rel(m[1]));
  const preloads = [...indexHtml.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"[^>]*>/g)].map((m) => rel(m[1]));
  const scripts = [...indexHtml.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g)].map((m) => rel(m[1]));
  if (scripts.length !== 1) throw new Error(`index.html has ${scripts.length} entry scripts, expected 1`);
  for (const href of [...styles, ...preloads, ...scripts]) {
    if (!href.startsWith('assets/')) throw new Error(`index.html links ${href}, expected a relative assets/ path`);
  }
  return [
    `<title>${title}</title>`,
    ...styles.map((href) => `<link rel="stylesheet" href="${href}">`),
    ...preloads.map((href) => `<link rel="modulepreload" href="${href}">`),
    `<script type="module" src="${scripts[0]}"></script>`,
    '<div id="root"></div>',
    '',
  ].join('\n');
}

function walk(dir, base = dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full, base) : [path.relative(base, full).split(path.sep).join('/')];
  });
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
/** The build folder as the person running the script would type it. */
const shown = (dir) => (dir.startsWith(ROOT + path.sep) ? path.relative(ROOT, dir) : dir);

function main() {
  if (!existsSync(path.join(DIR, 'index.html'))) {
    console.error(`make-artifact: ${shown(DIR)}/index.html is missing. Run "vite build --mode artifact" first (npm run build:artifact does both).`);
    process.exit(1);
  }
  for (const old of readdirSync(DIR).filter((f) => /^files(-\d+)?\.json$/.test(f))) rmSync(path.join(DIR, old));

  const page = pageFrom(readFileSync(path.join(DIR, 'index.html'), 'utf8'));
  writeFileSync(path.join(DIR, 'page.html'), page);

  const problems = [];
  const files = [];
  for (const rel of walk(DIR).sort()) {
    if (leftOut(rel)) continue;
    const ext = path.extname(rel).toLowerCase();
    const contentType = contentTypeOf(rel);
    if (!contentType) {
      problems.push(`${rel}: no content type for "${ext}"`);
      continue;
    }
    const full = path.join(DIR, rel);
    const text = TEXT.has(ext) || contentType === 'text/plain';
    if (text) {
      const original = readFileSync(full, 'utf8');
      const escaped = escapeEsc(original);
      if (escaped.count > 0) {
        writeFileSync(full, escaped.text);
        console.log(`  escaped ${escaped.count} ESC byte${escaped.count === 1 ? '' : 's'} in ${rel}`);
      }
    }
    const bytes = statSync(full).size;
    const limit = text ? LIMITS.textFile : LIMITS.binaryFile;
    if (bytes > limit) problems.push(`${rel}: ${mb(bytes)} is over the ${mb(limit)} limit for one file`);
    files.push({ rel, contentType, bytes });
  }

  // One publish carries at most 255 files and 64 MB; split into batches published one after another.
  const batches = [[]];
  let batchBytes = 0;
  for (const f of files) {
    const batch = batches[batches.length - 1];
    if (batch.length >= LIMITS.filesPerPublish || batchBytes + f.bytes > LIMITS.bytesPerPublish) {
      batches.push([f]);
      batchBytes = f.bytes;
    } else {
      batch.push(f);
      batchBytes += f.bytes;
    }
  }
  const toJson = (batch) => JSON.stringify(Object.fromEntries(batch.map((f) => [f.rel, { from: f.rel, contentType: f.contentType }])), null, 2);
  const names = batches.length === 1 ? ['files.json'] : batches.map((_, i) => `files-${i + 1}.json`);
  batches.forEach((batch, i) => writeFileSync(path.join(DIR, names[i]), `${toJson(batch)}\n`));

  const pageBytes = Buffer.byteLength(page);
  const total = files.reduce((sum, f) => sum + f.bytes, 0) + pageBytes;
  if (files.length + 1 > LIMITS.filesPerVersion) problems.push(`${files.length + 1} files are more than one artifact version holds (${LIMITS.filesPerVersion})`);
  if (total > LIMITS.bytesPerVersion) problems.push(`${mb(total)} is more than one artifact version holds (${mb(LIMITS.bytesPerVersion)})`);

  const byType = new Map();
  for (const f of files) byType.set(f.contentType, (byType.get(f.contentType) ?? 0) + f.bytes);
  console.log(`\nArtifact in ${shown(DIR)}/ (publish page.html, with each files*.json as \`files\` and root = that folder)`);
  console.log(`  page.html  ${(pageBytes / 1024).toFixed(1)} kB`);
  for (const [type, bytes] of [...byType.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${type.padEnd(26)} ${mb(bytes).padStart(9)}  (${files.filter((f) => f.contentType === type).length} files)`);
  if (ARGS.includes('--list')) for (const f of files) console.log(`    ${f.rel}  ${f.contentType}  ${(f.bytes / 1024).toFixed(1)} kB`);
  console.log(`  ${names.join(', ')}: ${files.length} files beside the page`);
  console.log(`  total ${mb(total)} in ${files.length + 1} files`);
  if (problems.length) {
    console.error(`\nmake-artifact: ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
