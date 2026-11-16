import { defineConfig } from 'vitest/config';
import type { HtmlTagDescriptor, Plugin, ResolvedConfig, Rollup } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Modes:
//   (default)  standalone web app  -> dist/  (installable: manifest + offline service worker)
//   phone      dev server over self-signed HTTPS so a phone on the LAN gets mic/camera
//   artifact   build for hosting as a Claude artifact (fonts inlined, no service worker) -> dist-artifact/
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const APP_NAME = 'Sixstring Academy';

/** A colour token from src/ui/tokens.css: the light block (bare `:root`) or the dark one. */
function tokenColour(name: string, theme: 'light' | 'dark'): string {
  const css = readFileSync(path.join(ROOT, 'src/ui/tokens.css'), 'utf8');
  const block = theme === 'light' ? /^:root\s*\{([\s\S]*?)^\}/m.exec(css) : /^:root\[data-theme='dark'\]\s*\{([\s\S]*?)^\}/m.exec(css);
  const value = block && new RegExp(`\\s${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`).exec(block[1]);
  if (!value) throw new Error(`src/ui/tokens.css has no ${name} in its ${theme} block`);
  return value[1].toLowerCase();
}

/** Every file under `dir`, as paths relative to it with forward slashes. */
function walk(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full, base) : [path.relative(base, full).split(path.sep).join('/')];
  });
}

const hashOf = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex').slice(0, 16);

/**
 * `<meta name="theme-color">` (the phone's status bar before the app has started) from the dark
 * page background in tokens.css. The shell keeps it in step with the theme once it runs.
 */
function themeColour(): Plugin {
  return {
    name: 'ssa-theme-colour',
    transformIndexHtml(html) {
      const tag = `<meta name="theme-color" content="${tokenColour('--bg', 'dark')}" />`;
      return /<meta name="theme-color"[^>]*>/.test(html) ? html.replace(/<meta name="theme-color"[^>]*>/, tag) : html.replace('</title>', `</title>\n    ${tag}`);
    },
  };
}

/**
 * Installable and offline (standalone production builds only): writes manifest.webmanifest, links
 * it from index.html, and writes sw.js from src/core/platform/sw.js with the list of every file
 * of this build to precache (made after the build, from what is really in the output folder).
 * vendor/ (OCR data, hand model, pdf.js extras: 40 MB that most learners never need) is not
 * precached; the worker keeps those files the first time they are used.
 */
function pwa(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'ssa-pwa',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    transformIndexHtml() {
      return [{ tag: 'link', attrs: { rel: 'manifest', href: './manifest.webmanifest' }, injectTo: 'head' }];
    },
    generateBundle() {
      const background = tokenColour('--bg', 'dark');
      const manifest = {
        id: './',
        name: APP_NAME,
        short_name: 'Sixstring',
        description: 'A complete guitar school: tuner, lessons with three teachers, songs, scales, chords, ear and rhythm training. Works offline.',
        lang: 'en',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: background,
        theme_color: background,
        categories: ['education', 'music'],
        icons: [
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Tuner', url: './#tuner', icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Metronome', url: './#metronome', icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Theory Path', url: './#learn', icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Songs', url: './#songs', icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
        ],
      };
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: `${JSON.stringify(manifest, null, 2)}\n` });
    },
    closeBundle() {
      const outDir = path.resolve(config.root, config.build.outDir);
      if (!existsSync(path.join(outDir, 'index.html'))) return;
      const precache = walk(outDir)
        .filter((file) => !file.startsWith('vendor/') && !file.startsWith('.vite/') && !file.endsWith('.map') && file !== 'sw.js')
        .sort();
      const version = hashOf(precache.map((file) => `${file}:${hashOf(readFileSync(path.join(outDir, file)))}`).join('\n'));
      const vendorDir = path.join(outDir, 'vendor');
      const vendorRev = hashOf(
        walk(vendorDir)
          .sort()
          .map((file) => `${file}:${hashOf(readFileSync(path.join(vendorDir, file)))}`)
          .join('\n'),
      );
      const template = readFileSync(path.join(ROOT, 'src/core/platform/sw.js'), 'utf8');
      const marker = 'const BUILD = __SSA_BUILD__;';
      if (!template.includes(marker)) throw new Error('src/core/platform/sw.js lost its "const BUILD = __SSA_BUILD__;" line');
      const build = JSON.stringify({ version, vendorRev, precache });
      writeFileSync(path.join(outDir, 'sw.js'), template.replace(marker, `const BUILD = ${build};`));
    },
  };
}

/**
 * Start downloading the first screen's code together with the app's own, instead of one round
 * trip after it: an inline script reads the address (#scales, #learn--…) and adds
 * <link rel="modulepreload"> for that route's chunk and the chunks it imports, from a table made
 * at build time from src/app/routes.ts. On a slow phone network that is one round trip (about half
 * a second) less before every first screen.
 */
function routePreload(): Plugin {
  return {
    name: 'ssa-route-preload',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return;
        const chunks = Object.values(bundle).filter((o): o is Rollup.OutputChunk => o.type === 'chunk');
        const byFile = new Map(chunks.map((c) => [c.fileName, c]));
        const entry = chunks.find((c) => c.isEntry);
        if (!entry) return;
        const closure = (start: Rollup.OutputChunk, into = new Set<string>()): Set<string> => {
          if (into.has(start.fileName)) return into;
          into.add(start.fileName);
          for (const file of start.imports) {
            const next = byFile.get(file);
            if (next) closure(next, into);
          }
          return into;
        };
        const inEntry = closure(entry);
        const source = readFileSync(path.join(ROOT, 'src/app/routes.ts'), 'utf8');
        const files: string[] = [];
        const index = (file: string): number => {
          const at = files.indexOf(file);
          return at >= 0 ? at : files.push(file) - 1;
        };
        const table: Record<string, number[]> = {};
        for (const m of source.matchAll(/name: '([a-z0-9-]+)'[^\n]*?load: \(\) => import\('@\/([^']+)'\)/g)) {
          const base = path.join(ROOT, 'src', m[2]);
          const target = ['/index.tsx', '/index.ts', '.tsx', '.ts'].map((ext) => base + ext).find((file) => existsSync(file));
          const chunk = target && chunks.find((c) => c.facadeModuleId && path.normalize(c.facadeModuleId) === path.normalize(target));
          if (!chunk) continue;
          const js = [...closure(chunk)].filter((file) => !inEntry.has(file));
          const css = js.flatMap((file) => [...(byFile.get(file)?.viteMetadata?.importedCss ?? [])]);
          table[m[1]] = [...js, ...css].map(index);
        }
        if (!table.home) return;
        const script =
          `(function(f,r){var n=location.hash.slice(1).split('--')[0];var l=r[n]||r.home;` +
          `for(var i=0;i<l.length;i++){var p=f[l[i]],e=document.createElement('link');` +
          `if(/\\.css$/.test(p)){e.rel='preload';e.as='style'}else{e.rel='modulepreload';e.crossOrigin=''}` +
          `e.href='./'+p;document.head.appendChild(e)}})(${JSON.stringify(files)},${JSON.stringify(table)})`;
        const tags: HtmlTagDescriptor[] = [{ tag: 'script', children: script, injectTo: 'head' }];
        return tags;
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const artifact = mode === 'artifact';
  return {
    base: './',
    plugins: [react(), themeColour(), mode === 'phone' ? basicSsl() : null, artifact ? null : pwa(), artifact ? null : routePreload()].filter(Boolean),
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    define: { __ARTIFACT__: JSON.stringify(artifact) },
    worker: { format: 'es' as const },
    // Libraries loaded with import() at the point of use: optimised up front, so the first import
    // in the dev server does not discover a new dependency and reload the page.
    optimizeDeps: {
      include: ['@coderline/alphatab/core', '@tonejs/midi', 'jszip', 'vexflow/bravura', 'pdfjs-dist', 'tesseract.js', '@mediapipe/tasks-vision'],
    },
    build: {
      outDir: artifact ? 'dist-artifact' : 'dist',
      target: 'es2022',
      // The artifact host only loads fonts that are inlined, so inline every asset under 300 kB there.
      assetsInlineLimit: artifact ? 300_000 : 4096,
      chunkSizeWarningLimit: 3000,
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      testTimeout: 30_000,
    },
  };
});

