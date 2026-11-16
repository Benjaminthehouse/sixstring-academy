#!/usr/bin/env node
/**
 * Browser check of the sheet reader: the page pipeline running in its module worker, the way a
 * screen will use it.
 *
 *   node e2e/omr-page.cjs            # three full corpus pages (notation, tab, notation + tab)
 *   node e2e/omr-page.cjs --verbose  # + per-stage timings and the summary sentences
 *
 * For each page the browser fetches the PNG from the dev server, decodes it to ImageData on a
 * canvas, and hands it to `createOmrWorker().recognizePage` (bundled by Vite as a module worker).
 * Meanwhile the main thread runs a 16 ms timer and a long-task observer: the UI must stay
 * responsive. The result comes back to Node and is scored against the page's ground truth.
 * Then: cancelling a run, the quick classifier, and (for contrast) the same page on the main thread.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { withApp, loadTs, ROOT } = require('./lib/harness.cjs');

const PAGES = [
  { id: 'page-notation-bravura-150', want: { notes: 0.97, pitch: 0.97, dur: 0.95 } },
  { id: 'page-tab-ls-150', want: { tab: 0.97, fret: 0.97 } },
  { id: 'page-linked-bravura-150', want: { notes: 0.97, pitch: 0.97, dur: 0.95, tab: 0.97, fret: 0.97 } },
];
const verbose = process.argv.includes('--verbose');

/* global document, window, performance, PerformanceObserver, createImageBitmap, AbortController */
async function runInPage(arg) {
  const omr = await import('/src/core/omr/index.ts');
  const decode = async (src) => {
    const blob = await (await fetch(src)).blob();
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    return ctx.getImageData(0, 0, bmp.width, bmp.height);
  };
  // Main-thread responsiveness while the worker reads.
  const watch = () => {
    const gaps = [];
    let last = performance.now();
    const timer = setInterval(() => {
      const t = performance.now();
      gaps.push(t - last);
      last = t;
    }, 16);
    const longTasks = [];
    let obs = null;
    try {
      obs = new PerformanceObserver((list) => { for (const e of list.getEntries()) longTasks.push(e.duration); });
      obs.observe({ type: 'longtask', buffered: false });
    } catch { /* not supported */ }
    return () => {
      clearInterval(timer);
      if (obs) obs.disconnect();
      gaps.sort((a, b) => a - b);
      return { maxGap: gaps.length ? gaps[gaps.length - 1] : 0, p95Gap: gaps.length ? gaps[Math.floor(gaps.length * 0.95)] : 0, ticks: gaps.length, longTasks: longTasks.length, longest: longTasks.length ? Math.max(...longTasks) : 0 };
    };
  };
  const worker = omr.createOmrWorker();
  const out = { pages: [] };
  for (const id of arg.ids) {
    const img = await decode(`/src/core/omr/fixtures/${id}.png`);
    const progress = [];
    const stop = watch();
    const t0 = performance.now();
    const page = await worker.recognizePage(img, { onProgress: (p) => progress.push({ stage: p.stage, fraction: p.fraction, at: performance.now() - t0 }) });
    const ms = performance.now() - t0;
    const responsiveness = stop();
    const summary = omr.summarizePage(page);
    out.pages.push({ id, page, ms, responsiveness, progress: progress.length, firstProgressMs: progress[0]?.at ?? null, summary: { headline: summary.headline, lines: summary.lines, proofread: summary.proofreadTotal, verdict: summary.verdict } });
  }
  // Cancelling: abort as soon as the first staff is being read.
  {
    const img = await decode(`/src/core/omr/fixtures/${arg.ids[0]}.png`);
    const ctl = new AbortController();
    const t0 = performance.now();
    let abortedAt = 0;
    let outcome = 'resolved';
    try {
      await worker.recognizePage(img, { signal: ctl.signal, onProgress: (p) => { if (p.stage === 'staff' && !abortedAt) { abortedAt = performance.now(); ctl.abort(); } } });
    } catch (e) {
      outcome = e && e.name === 'AbortError' ? 'cancelled' : `error: ${e && e.message}`;
    }
    out.cancel = { outcome, stopMs: performance.now() - (abortedAt || t0) };
    // The worker still works after a cancel.
    const again = await worker.classifyPage(img);
    out.afterCancel = again.kind;
  }
  // The quick classifier on each page.
  out.kinds = [];
  for (const id of arg.ids) {
    const img = await decode(`/src/core/omr/fixtures/${id}.png`);
    const t0 = performance.now();
    const c = await worker.classifyPage(img);
    out.kinds.push({ id, kind: c.kind, ms: performance.now() - t0 });
  }
  worker.terminate();
  // For contrast: the same page on the main thread blocks it.
  {
    const img = await decode(`/src/core/omr/fixtures/${arg.ids[2]}.png`);
    const stop = watch();
    const t0 = performance.now();
    await omr.recognizePage(img, { yieldBetweenStaves: true });
    out.mainThread = { ms: performance.now() - t0, ...stop() };
  }
  return out;
}

(async () => {
  const metrics = await loadTs('/src/core/omr/eval/metrics.ts');
  const truthMod = await loadTs('/src/core/omr/eval/truth.ts');
  let failures = 0;
  const fail = (msg) => {
    failures++;
    console.log(`FAIL ${msg}`);
  };
  await withApp({}, async ({ page, url, errors }) => {
    await page.goto(url, { waitUntil: 'load' });
    const res = await page.evaluate(runInPage, { ids: PAGES.map((p) => p.id) });
    for (const r of res.pages) {
      const spec = PAGES.find((p) => p.id === r.id);
      const truth = truthMod.hydrateTruth(JSON.parse(fs.readFileSync(path.join(ROOT, 'src/core/omr/fixtures', `${r.id}.json`), 'utf8')));
      const s = metrics.scorePage(r.page, truth);
      const v = {
        staves: `${s.stavesMatched}/${s.stavesTruth}`,
        notes: metrics.recall(s.notes), noteP: metrics.precision(s.notes), pitch: metrics.rate(s.pitch), dur: metrics.rate(s.duration),
        tab: metrics.recall(s.tabNotes), tabP: metrics.precision(s.tabNotes), fret: metrics.rate(s.fret), measEx: metrics.rate(s.measureExact), tabMeasEx: metrics.rate(s.tabMeasureExact),
      };
      const pct = (x) => `${(100 * x).toFixed(1)}%`;
      console.log(`${r.id.padEnd(28)} ${r.page.width}x${r.page.height}  worker ${(r.ms / 1000).toFixed(2)} s  staves ${v.staves}  notes R ${pct(v.notes)} P ${pct(v.noteP)} pitch ${pct(v.pitch)} dur ${pct(v.dur)}  tab R ${pct(v.tab)} P ${pct(v.tabP)} fret ${pct(v.fret)}  measures ${pct(v.measEx)} / ${pct(v.tabMeasEx)}`);
      console.log(`${''.padEnd(28)} main thread while reading: ${r.responsiveness.ticks} ticks of 16 ms, longest gap ${r.responsiveness.maxGap.toFixed(0)} ms (p95 ${r.responsiveness.p95Gap.toFixed(0)}), long tasks ${r.responsiveness.longTasks} (longest ${r.responsiveness.longest.toFixed(0)} ms); ${r.progress} progress events, first after ${r.firstProgressMs?.toFixed(0)} ms`);
      console.log(`${''.padEnd(28)} summary: ${r.summary.headline} (${r.summary.verdict})`);
      if (verbose) {
        for (const l of r.summary.lines) console.log(`${''.padEnd(30)}${l}`);
        console.log(`${''.padEnd(30)}timings ${JSON.stringify(Object.fromEntries(Object.entries(r.page.timings || {}).map(([k, x]) => [k, Math.round(x)])))}`);
      }
      if (s.stavesMatched !== s.stavesTruth) fail(`${r.id}: staves ${v.staves}`);
      for (const [k, min] of Object.entries(spec.want)) if (v[k] < min) fail(`${r.id}: ${k} ${pct(v[k])} < ${pct(min)}`);
      // Responsive: the 16 ms timer kept ticking (generous bounds: the build machine is shared).
      if (r.responsiveness.maxGap > 400) fail(`${r.id}: main thread blocked for ${r.responsiveness.maxGap.toFixed(0)} ms while the worker read the page`);
      if (r.responsiveness.ticks < (r.ms / 16) * 0.3) fail(`${r.id}: only ${r.responsiveness.ticks} timer ticks in ${r.ms.toFixed(0)} ms`);
    }
    console.log(`cancel: ${res.cancel.outcome} ${res.cancel.stopMs.toFixed(0)} ms after the abort; worker afterwards: classify -> ${res.afterCancel}`);
    if (res.cancel.outcome !== 'cancelled') fail(`cancel: ${res.cancel.outcome}`);
    if (res.cancel.stopMs > 2500) fail(`cancel took ${res.cancel.stopMs.toFixed(0)} ms`);
    const wantKind = { 'page-notation-bravura-150': 'notation', 'page-tab-ls-150': 'tab', 'page-linked-bravura-150': 'both' };
    for (const k of res.kinds) {
      console.log(`classify ${k.id.padEnd(28)} ${k.kind.padEnd(9)} ${k.ms.toFixed(0)} ms (in the worker)`);
      if (k.kind !== wantKind[k.id]) fail(`classify ${k.id}: ${k.kind}`);
    }
    console.log(`for contrast, on the main thread: ${(res.mainThread.ms / 1000).toFixed(2)} s, longest gap ${res.mainThread.maxGap.toFixed(0)} ms, long tasks ${res.mainThread.longTasks} (longest ${res.mainThread.longest.toFixed(0)} ms)`);
    const relevant = errors.filter((e) => !/favicon|DevTools|Download the React/i.test(e));
    if (relevant.length) fail(`browser errors:\n  ${relevant.join('\n  ')}`);
  });
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
